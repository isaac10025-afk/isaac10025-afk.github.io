// World: units, groups, spatial grid, terrain grid storage, fear/noise fields, steam, events.
// OG core-move §0-2, core-combat §0 (OG game.js:5463-5604 world, 2227-2430 groups, 2722-2884 grid, 10479-10580 fields).
import { makeRng } from './rng.js';
import { getDef } from './defs.js';
import {
  DT, UNIT_CAP, GROUP_CAP, GRID_CELL, FIELD_CELL, WALL_TILE, FIRST_THINK_SPAN, SCRATCH, WET, clamp,
} from './const.js';
import { FACTION_COUNT, ALL_MASK, teamable, teamFaction, isTeamFaction, maskHas, F, SIDE_SLOTS } from './factions.js';
import { Nav } from './systems/navigation.js';
import { layoutFormation } from './systems/formation.js';

// CORE-B's initCombat(u) fills its combat fields at spawn (optional: the core runs without combat/). Loaded without
// await: combat/env.js imports this module, and a top-level await on a cycle would deadlock. makeUnit already declares
// every field initCombat sets, so a unit spawned before the load finishes has the same shape.
let initCombat = null;
import('./combat/env.js').then((m) => { initCombat = m.initCombat || null; }, () => { initCombat = null; });

// ---------------------------------------------------------------- spatial grid
// Buckets per (cell, faction), counting-sort rebuilt each tick (OG game.js:2722-2884).
export class Grid {
  constructor(cellSize = GRID_CELL) {
    this.cell = cellSize; this.inv = 1 / cellSize;
    this.cols = 1; this.rows = 1;
    this.start = new Int32Array(FACTION_COUNT + 1);
    this.cursor = new Int32Array(FACTION_COUNT);
    this.ccols = 1; this.crows = 1;
    this.coarse = new Int32Array(FACTION_COUNT);
    this.items = new Int32Array(1024); this.itemX = new Float32Array(1024); this.itemY = new Float32Array(1024);
    this.keys = new Int32Array(1024);
    // Factions with a unit in the grid, ascending (side split 11-17): queries walk only these, in the same order as
    // walking every faction (so results and ties are unchanged), and 53 faction slots cost nothing while empty.
    this.act = new Int32Array(FACTION_COUNT); this.nAct = 0; this.seen = new Uint8Array(FACTION_COUNT);
  }
  resize(W, H) {
    this.cols = Math.max(1, Math.ceil(W / this.cell)); this.rows = Math.max(1, Math.ceil(H / this.cell));
    const n = this.cols * this.rows * FACTION_COUNT;
    this.start = new Int32Array(n + 1); this.cursor = new Int32Array(n);
    this.ccols = Math.ceil(this.cols / 4); this.crows = Math.ceil(this.rows / 4); // 4×4 coarse blocks (OG game.js:2757-2758)
    this.coarse = new Int32Array(this.ccols * this.crows * FACTION_COUNT);
  }
  cx(x) { const c = Math.floor(x * this.inv); return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c; }
  cy(y) { const c = Math.floor(y * this.inv); return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c; }
  rebuild(units) {
    const n = units.length;
    if (this.items.length < n) {
      const m = Math.max(n, this.items.length * 2);
      this.items = new Int32Array(m); this.itemX = new Float32Array(m); this.itemY = new Float32Array(m); this.keys = new Int32Array(m);
    }
    const st = this.start, co = this.coarse, keys = this.keys, cols = this.cols, ccols = this.ccols;
    st.fill(0); co.fill(0);
    const seen = this.seen; seen.fill(0);
    for (let i = 0; i < n; i++) {
      const u = units[i];
      if (u.dead) { keys[i] = -1; continue; }
      const cx = this.cx(u.x), cy = this.cy(u.y), f = u.faction;
      const k = (cy * cols + cx) * FACTION_COUNT + f;
      keys[i] = k; st[k + 1]++; seen[f] = 1;
      co[(((cy >> 2) * ccols) + (cx >> 2)) * FACTION_COUNT + f]++;
    }
    let na = 0; for (let f = 0; f < FACTION_COUNT; f++) if (seen[f] === 1) this.act[na++] = f;
    this.nAct = na;
    for (let k = 1; k < st.length; k++) st[k] += st[k - 1];
    const cur = this.cursor; cur.set(st.subarray(0, cur.length));
    const it = this.items, ix = this.itemX, iy = this.itemY;
    for (let i = 0; i < n; i++) {
      const k = keys[i]; if (k < 0) continue;
      const p = cur[k]++; it[p] = i; ix[p] = units[i].x; iy[p] = units[i].y;
    }
  }
}

// ---------------------------------------------------------------- groups (one per paint stroke)
// OG class at game.js:2227-2430.
export class Groups {
  constructor(cap = GROUP_CAP) {
    this.cap = cap; this.highWater = 0; this.freeList = new Int32Array(cap); this.freeTop = 0;
    const U8 = () => new Uint8Array(cap), I32 = () => new Int32Array(cap), F32 = () => new Float32Array(cap), F64 = () => new Float64Array(cap);
    this.alive = U8(); this.locked = U8(); this.faction = U8(); this.type = new Array(cap).fill(null);
    this.size = I32(); this.joined = I32(); this.cx = F32(); this.cy = F32(); this.radius = F32();
    this.pressureX = F32(); this.pressureY = F32(); this.pressureTotal = F32(); this.offX = F32(); this.offY = F32();
    this.contactX = F32(); this.contactY = F32(); this.contactAge = F32(); this.contactSince = F32(); this.intelSince = F32();
    this.alert = F32(); this.inContact = U8(); this.contactNow = new Uint16Array(cap);
    this.intelX = F32(); this.intelY = F32(); this.hasIntel = U8();
    this.drilled = U8(); this.front = F32(); this.files = new Uint16Array(cap); this.laidOut = I32();
    this.calmPressureX = F32(); this.calmPressureY = F32(); this.calmPressureTotal = F32();
    this.wheeling = U8(); this.charging = U8(); this.marching = U8(); this.objX = F32(); this.objY = F32();
    this.volleyAt = F32(); this.volleyReady = F32();
    this.sumX = F64(); this.sumY = F64(); this.sumHX = F64(); this.sumHY = F64(); this.sumSq = F64();
  }
  create(type, faction) {
    let g;
    if (this.freeTop > 0) g = this.freeList[--this.freeTop];
    else { if (this.highWater >= this.cap) return -1; g = this.highWater++; } // pool full → nothing painted (OG game.js:2329)
    this.alive[g] = 1; this.locked[g] = 1; this.type[g] = type; this.faction[g] = faction;
    this.size[g] = 0; this.joined[g] = 0; this.cx[g] = this.cy[g] = this.offX[g] = this.offY[g] = 0;
    this.contactX[g] = this.contactY[g] = 0; this.contactAge[g] = Infinity; this.contactSince[g] = 0; this.intelSince[g] = 0;
    this.alert[g] = 0; this.inContact[g] = 0; this.contactNow[g] = 0; this.hasIntel[g] = 0;
    this.drilled[g] = 0; this.marching[g] = 0; this.charging[g] = 0; this.wheeling[g] = 0; this.front[g] = 0; this.files[g] = 0;
    this.calmPressureX[g] = this.calmPressureY[g] = this.calmPressureTotal[g] = 0; this.laidOut[g] = 0;
    this.volleyAt[g] = -Infinity; this.volleyReady[g] = 0;
    return g;
  }
  release(g) { if (g >= 0) this.locked[g] = 0; }
  join(g) { this.size[g]++; this.joined[g]++; }
  leave(g) { this.size[g]--; this.joined[g]--; }
  // Contact report: new episode if the last is > 2 s old; within 0.5 s only a point nearer the centre replaces it (OG game.js:2366-2376).
  reportContact(g, x, y, time) {
    if (this.contactAge[g] > 2) this.contactSince[g] = time;
    if (!(this.contactAge[g] > 0.5)) {
      const nd = (x - this.cx[g]) ** 2 + (y - this.cy[g]) ** 2, od = (this.contactX[g] - this.cx[g]) ** 2 + (this.contactY[g] - this.cy[g]) ** 2;
      if (nd > od) return;
    }
    this.contactX[g] = x; this.contactY[g] = y; this.contactAge[g] = 0;
  }
  markEngaged(g) { if (g >= 0 && this.contactNow[g] < 65535) this.contactNow[g]++; } // OG game.js:2377-2379
  casualtyRatio(g) { const j = this.joined[g]; return j > 0 ? 1 - this.size[g] / j : 0; } // OG game.js:2380-2383
  // Per tick: centroid, offset, spread, pressure, contact timers; empty released groups are freed (OG game.js:2384-2423).
  update(units, dt) {
    const n = this.highWater, { sumX, sumY, sumHX, sumHY, sumSq, size, pressureX, pressureY, pressureTotal } = this;
    for (let g = 0; g < n; g++) { sumX[g] = sumY[g] = sumHX[g] = sumHY[g] = sumSq[g] = 0; size[g] = 0; pressureX[g] = pressureY[g] = pressureTotal[g] = 0; }
    for (let i = 0, m = units.length; i < m; i++) {
      const u = units[i]; if (u.dead) continue; const g = u.group; if (g < 0) continue;
      sumX[g] += u.x; sumY[g] += u.y; sumHX[g] += u.homeX; sumHY[g] += u.homeY; sumSq[g] += u.x * u.x + u.y * u.y;
      pressureX[g] += u.threatX; pressureY[g] += u.threatY; pressureTotal[g] += u.threat; size[g]++;
    }
    for (let g = 0; g < n; g++) {
      if (this.alive[g] === 0) continue;
      const s = size[g];
      if (s === 0) { if (this.locked[g] === 0) this.free(g); continue; }
      const k = 1 / s; this.cx[g] = sumX[g] * k; this.cy[g] = sumY[g] * k;
      const v = sumSq[g] * k - this.cx[g] * this.cx[g] - this.cy[g] * this.cy[g];
      this.radius[g] = 1.5 * Math.sqrt(Math.max(0, v)); // computed, never read in OG (game.js:2415)
      this.offX[g] = (sumX[g] - sumHX[g]) * k; this.offY[g] = (sumY[g] - sumHY[g]) * k;
      this.contactAge[g] += dt;
      if (this.alert[g] > 0) this.alert[g] = Math.max(0, this.alert[g] - dt); // group alert fades 1 per s (OG game.js:2419)
      this.inContact[g] = this.contactNow[g] > 0 ? 1 : 0; this.contactNow[g] = 0;
    }
  }
  free(g) { this.alive[g] = 0; this.freeList[this.freeTop++] = g; }
  clear() { this.alive.fill(0); this.locked.fill(0); this.highWater = 0; this.freeTop = 0; }
}

// ---------------------------------------------------------------- fear + noise fields (40 px cells)
// One fear layer per faction (half-life 4 s) + one noise layer (half-life 1.5 s) (OG game.js:10514-10516, 10565-10574).
export const NOISE_LAYER = FACTION_COUNT;
export function fearLayer(faction) { return faction; }
const FIELD_HALF_LIFE = [...Array.from({ length: FACTION_COUNT }, () => 4), 1.5];
export class Fields {
  constructor(cell = FIELD_CELL) { this.cell = cell; this.inv = 1 / cell; this.cols = 1; this.rows = 1; this.layers = []; this.active = new Uint8Array(FACTION_COUNT + 1); }
  resize(W, H) {
    this.cols = Math.max(1, Math.ceil(W / this.cell)); this.rows = Math.max(1, Math.ceil(H / this.cell));
    this.layers = Array.from({ length: FACTION_COUNT + 1 }, () => new Float32Array(this.cols * this.rows)); this.active.fill(0);
  }
  // Add amount·(1 − d/r) to every cell centre within r (OG game.js:10532-10549).
  splat(layer, x, y, amount, r) {
    if (!(r > 0) || !amount) return;
    const d = this.layers[layer], c = this.cell, inv = this.inv, ir = 1 / r;
    const x0 = Math.max(0, Math.floor((x - r) * inv)), x1 = Math.min(this.cols - 1, Math.floor((x + r) * inv));
    const y0 = Math.max(0, Math.floor((y - r) * inv)), y1 = Math.min(this.rows - 1, Math.floor((y + r) * inv));
    for (let cy = y0; cy <= y1; cy++) {
      const dy = (cy + 0.5) * c - y;
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * c - x, w = 1 - Math.sqrt(dx * dx + dy * dy) * ir;
        if (w > 0) d[cy * this.cols + cx] += amount * w;
      }
    }
    this.active[layer] = 1;
  }
  // Bilinear sample between cell centres (OG game.js:10550-10564).
  sample(layer, x, y) {
    if (this.active[layer] === 0) return 0;
    const d = this.layers[layer], cols = this.cols, rows = this.rows;
    let fx = x * this.inv - 0.5, fy = y * this.inv - 0.5;
    fx = fx < 0 ? 0 : fx > cols - 1 ? cols - 1 : fx; fy = fy < 0 ? 0 : fy > rows - 1 ? rows - 1 : fy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = x0 + 1 < cols ? x0 + 1 : x0, y1 = y0 + 1 < rows ? y0 + 1 : y0, tx = fx - x0, ty = fy - y0;
    const a = d[y0 * cols + x0] + (d[y0 * cols + x1] - d[y0 * cols + x0]) * tx;
    return a + (d[y1 * cols + x0] + (d[y1 * cols + x1] - d[y1 * cols + x0]) * tx - a) * ty;
  }
  // Halve every half-life; values under 1e-4 snap to 0 (OG game.js:10565-10574). Empty layers are skipped (same result).
  decay(dt) {
    for (let l = 0; l < this.layers.length; l++) {
      if (this.active[l] === 0) continue;
      const k = Math.pow(0.5, dt / FIELD_HALF_LIFE[l]), d = this.layers[l]; let any = 0;
      for (let i = 0; i < d.length; i++) { const v = d[i] * k; if (v < 1e-4) d[i] = 0; else { d[i] = v; any = 1; } }
      this.active[l] = any;
    }
  }
  clear() { for (const d of this.layers) d.fill(0); this.active.fill(0); }
}

// ---------------------------------------------------------------- walls (8 px tiles): storage + queries + collision
// TERRAIN paints (setTile / solid[]); CORE-A reads them for nav, LOS and collision (OG game.js:762-1016).
export const WALL_HP = 100; // OG game.js:792
export class Walls {
  constructor() { this.tile = WALL_TILE; this.inv = 1 / WALL_TILE; this.cols = 1; this.rows = 1; this.solid = new Uint8Array(1); this.hp = new Float32Array(1); this.count = 0; this.version = 0; this.damageVersion = 0; this.holes = []; }
  resize(W, H) {
    this.cols = Math.max(1, Math.ceil(W / this.tile)); this.rows = Math.max(1, Math.ceil(H / this.tile));
    this.solid = new Uint8Array(this.cols * this.rows); this.hp = new Float32Array(this.cols * this.rows); this.count = 0; this.version++;
  }
  // Set one tile solid (1) or clear (0); keeps count + version right. Returns 1 if it changed.
  setTile(tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return 0;
    const i = ty * this.cols + tx; v = v ? 1 : 0;
    if (this.solid[i] === v) return 0;
    this.solid[i] = v; this.hp[i] = v ? WALL_HP : 0; this.count += v ? 1 : -1; this.version++;
    return 1;
  }
  isSolidTile(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows && this.solid[ty * this.cols + tx] === 1; }
  isSolidAt(x, y) { return this.isSolidTile(Math.floor(x * this.inv), Math.floor(y * this.inv)); }
  clear() { if (this.count !== 0) { this.solid.fill(0); this.hp.fill(0); this.holes.length = 0; this.count = 0; this.version++; } }
  // Grid walk from (x0,y0) to (x1,y1): fraction of the segment at the first solid tile, Infinity if clear (OG game.js:937-960).
  raycast(x0, y0, x1, y1) {
    if (this.count === 0) return Infinity;
    const inv = this.inv; let tx = Math.floor(x0 * inv), ty = Math.floor(y0 * inv);
    const ex = Math.floor(x1 * inv), ey = Math.floor(y1 * inv);
    if (this.isSolidTile(tx, ty)) return 0;
    const dx = x1 - x0, dy = y1 - y0, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const stepX = dx !== 0 ? Math.abs(this.tile / dx) : Infinity, stepY = dy !== 0 ? Math.abs(this.tile / dy) : Infinity;
    let nx = dx !== 0 ? ((dx > 0 ? tx + 1 : tx) * this.tile - x0) / dx : Infinity;
    let ny = dy !== 0 ? ((dy > 0 ? ty + 1 : ty) * this.tile - y0) / dy : Infinity;
    for (let n = Math.abs(ex - tx) + Math.abs(ey - ty); n > 0; n--) {
      let t;
      if (nx < ny) { t = nx; tx += sx; nx += stepX; } else { t = ny; ty += sy; ny += stepY; }
      if (this.isSolidTile(tx, ty)) return t;
    }
    return Infinity;
  }
  lineOfSight(x0, y0, x1, y1) { return this.raycast(x0, y0, x1, y1) === Infinity; }
  // Unit vs wall tiles (OG game.js:961-1001).
  collide(u) {
    const t = this.tile, inv = this.inv, r = u.radius;
    let x = u.x, y = u.y;
    const px = u.px, py = u.py;
    // Moved > 4 px and the straight line crosses a wall: put back and stop.
    if ((x - px) * (x - px) + (y - py) * (y - py) > 16 && !this.isSolidAt(px, py) && this.raycast(px, py, x, y) < 1) {
      x = u.x = px; y = u.y = py; u.vx = 0; u.vy = 0;
    }
    if (this.isSolidTile(Math.floor(x * inv), Math.floor(y * inv))) {
      if (this.isSolidAt(u.px, u.py)) { if (!this.escape(u)) return; x = u.x; y = u.y; }
      else { x = u.px; y = u.py; u.vx = 0; u.vy = 0; }
    }
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv), y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!this.isSolidTile(tx, ty)) continue;
      const lx = tx * t, ly = ty * t;
      const dx = x - (x < lx ? lx : x > lx + t ? lx + t : x), dy = y - (y < ly ? ly : y > ly + t ? ly + t : y), d2 = dx * dx + dy * dy;
      if (d2 >= r * r || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      x += nx * (r - d); y += ny * (r - d);
      const vn = u.vx * nx + u.vy * ny; if (vn < 0) { u.vx -= vn * nx; u.vy -= vn * ny; }
    }
    u.x = x; u.y = y;
  }
  // Jump to the nearest free tile within 12 rings (OG game.js:1002-1014).
  escape(u) {
    const inv = this.inv, ox = Math.floor(u.x * inv), oy = Math.floor(u.y * inv);
    let best = -1, bd = Infinity;
    for (let ring = 1; ring <= 12 && best < 0; ring++)
      for (let ty = oy - ring; ty <= oy + ring; ty++) for (let tx = ox - ring; tx <= ox + ring; tx++) {
        if (Math.max(Math.abs(tx - ox), Math.abs(ty - oy)) !== ring) continue;
        if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows || this.solid[ty * this.cols + tx] === 1) continue;
        const d = ((tx + 0.5) * this.tile - u.x) ** 2 + ((ty + 0.5) * this.tile - u.y) ** 2;
        if (d < bd) { bd = d; best = ty * this.cols + tx; }
      }
    if (best < 0) return false;
    u.x = ((best % this.cols) + 0.5) * this.tile; u.y = (Math.floor(best / this.cols) + 0.5) * this.tile; u.vx = 0; u.vy = 0;
    return true;
  }
}

// ---------------------------------------------------------------- steam / smoke clouds (max 48)
// Added by fire/water code; stepped by conceal; read by conceal + perception (OG game.js:3365-3446).
const STEAM_MAX = 48, STEAM_RISE = 0.15, STEAM_DRIFT = 6;
export class Steam {
  constructor() { this.x = new Float32Array(STEAM_MAX); this.y = new Float32Array(STEAM_MAX); this.radius = new Float32Array(STEAM_MAX); this.born = new Float32Array(STEAM_MAX); this.life = new Float32Array(STEAM_MAX); this.count = 0; }
  add(x, y, r, life, time) {
    for (let k = 0; k < this.count; k++) {
      if (Math.hypot(this.x[k] - x, this.y[k] - y) > 0.6 * this.radius[k]) continue;
      const left = this.born[k] + this.life[k] - time, l = Math.max(left, life) / (1 - STEAM_RISE);
      this.radius[k] = Math.min(70, Math.max(this.radius[k], r) + 0.1 * r); this.born[k] = time - l * STEAM_RISE; this.life[k] = l;
      return;
    }
    let k = this.count;
    if (k >= STEAM_MAX) { k = 0; for (let j = 1; j < this.count; j++) if (this.born[j] < this.born[k]) k = j; } else this.count++;
    this.x[k] = x; this.y[k] = y; this.radius[k] = Math.min(70, r); this.born[k] = time; this.life[k] = life;
  }
  step(dt, time) {
    let w = 0;
    for (let k = 0; k < this.count; k++) {
      if (time - this.born[k] >= this.life[k]) continue;
      if (w !== k) { this.x[w] = this.x[k]; this.y[w] = this.y[k]; this.radius[w] = this.radius[k]; this.born[w] = this.born[k]; this.life[w] = this.life[k]; }
      this.y[w] -= STEAM_DRIFT * dt; w++;
    }
    this.count = w;
  }
  thickness(k, time) { const p = (time - this.born[k]) / this.life[k]; return p < 0 || p >= 1 ? 0 : p < STEAM_RISE ? p / STEAM_RISE : 1 - (p - STEAM_RISE) / (1 - STEAM_RISE); }
  at(x, y, time) {
    let v = 0;
    for (let k = 0; k < this.count; k++) { const d = Math.hypot(this.x[k] - x, this.y[k] - y); if (d < this.radius[k]) v = Math.max(v, this.thickness(k, time) * (1 - (d / this.radius[k]) ** 2)); }
    return v;
  }
  blocks(x0, y0, x1, y1, time) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    for (let k = 0; k < this.count; k++) {
      let s = ((this.x[k] - x0) * dx + (this.y[k] - y0) * dy) / l2; s = s < 0 ? 0 : s > 1 ? 1 : s;
      const d = Math.hypot(x0 + dx * s - this.x[k], y0 + dy * s - this.y[k]);
      if (d < this.radius[k] && this.thickness(k, time) * (1 - (d / this.radius[k]) ** 2) > 0.35) return true;
    }
    return false;
  }
  clear() { this.count = 0; }
}

// ---------------------------------------------------------------- empty mine field (TERRAIN swaps in the real one)
// Shape the core reads: count (alive mines), version (bumped on any change), high, x[], y[], alive[],
// blocks(x0, y0, x1, y1, r) → bool (segment passes within r of a mine), collide(u) (push a unit off mines).
export function emptyMines() {
  return { count: 0, version: 0, high: 0, x: [], y: [], alive: [], blocks() { return false; }, collide() {}, clear() { this.count = 0; this.high = 0; this.version++; } };
}

// ---------------------------------------------------------------- unit object
// Shared fields: ARCH list + the OG per-unit arrays the core systems read (OG game.js:10677-10990).
// Float fields start as a double (0.5) and are then zeroed, so V8 gives them a double field representation from the
// first unit on (no map migrations and deopts when the first real double lands mid-battle).
const FLOAT_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'px', 'py', 'pz', 'heading', 'pheading', 'radius', 'mass', 'hp', 'maxHp', 'stateTime',
  'goalX', 'goalY', 'morale', 'bravery', 'reactTime', 'react', 'speedMul', 'burning', 'wet', 'stun', 'cooldown', 'attack', 'flash', 'dmgDealt',
  'homeX', 'homeY', 'slotX', 'slotY', 'wander', 'detour', 'pushX', 'pushY', 'threat', 'threatX', 'threatY', 'odds', 'fear', 'noise',
  'unseen', 'unseenBySeers', 'hidden', 'climb', 'prone', 'infection', 'hitAt', 'harmByAt', 'dodgeX', 'dodgeY', 'dodgeDelay', 'dodgeTime', 'plague', 'plagueAt',
  'timer', 'spin', 'thrownAt', 'startle', 'startleX', 'startleY', 'reload', 'firedAt', 'stopAt', 'hitPow', 'hitDx', 'hitDy', 'flinchAt', 'coughAt',
  'hopStart', 'roamUntil', 'rage', 'linkAt', 'heldRadius', 'nextThrow', 'jawsUntil', 'aimX', 'aimY'];
const D = 0.5;
function makeUnit(id, type, def) {
  const u = {
    id, type, def, team: -1, faction: 0, group: -1, index: -1, home: -1, homeGen: 0, likeId: -1,
    x: D, y: D, z: D, vx: D, vy: D, vz: D, px: D, py: D, pz: D, heading: D, pheading: D,
    radius: D, mass: D, hp: D, maxHp: D, state: 0, stateTime: D, target: -1, goalX: D, goalY: D, face: NaN,
    nextThink: 0, lastThink: -1, morale: D, bravery: D, reactTime: D, react: D, speedMul: D,
    burning: D, wet: D, stun: D, cooldown: D, attack: D, flash: D, dead: false, removed: false, spawnTick: 0, kills: 0, dmgDealt: D,
    homeX: D, homeY: D, slotX: D, slotY: D, wander: D, detour: D, pushX: D, pushY: D, pathing: 0, los: 0,
    attackers: 0, shooters: 0, threat: D, threatX: D, threatY: D, odds: D, fear: D, noise: D,
    unseen: D, unseenBySeers: D, hidden: D, blind: 0, climb: D, perch: -1, cover: -1, prone: D, leaping: 0,
    infection: D, infectType: null, infectGroup: -1, infectTeam: -1, eaten: 0, skeleton: 0, colony: 0,
    harmCause: 0, harmBy: -1, harmByAt: D, harmByType: null, harmByFaction: -1, hitAt: D,
    dodgeX: D, dodgeY: D, dodgeDelay: D, dodgeTime: D, lastVictim: -1, plague: D, plagueAt: D, deathCause: -1,
    // more OG per-unit fields other owners write (pre-declared so every unit keeps one hidden class; OG game.js:10677-10990)
    subState: 0, timer: D, role: 0, spin: D, thrownAt: D, hurled: 0, kindled: 0, singed: 0, hatless: 0, startle: D, startleX: D, startleY: D,
    reload: D, ammo: 0, firedAt: D, stopAt: D, hitPow: D, hitDx: D, hitDy: D, flinchAt: D, coughAt: D, plagueFree: 0, curseType: 0,
    arrowsIn: 0, proneWant: 0, hopStart: D, roaming: 0, roamUntil: D, shelter: -1, rage: D, link: -1, linkAt: D, coat: 0, coatHops: 0,
    heldRadius: D, nextThrow: D, jaws: -1, jawsUntil: D, aimX: D, aimY: D, arrows: null, _cb: 0,
    possessed: 0,   // OURS (Part 2 step 3): 1 = the player drives this unit (systems/possess.js)
    kid: 0, mapIdx: 0,   // STEP10 LEAD (share codes): kid 1 = spawned by another unit's spawn (crew, rider); mapIdx k = the map build's k-th unit
    // OURS (Part 2 step 6, STEP6.md): status another tab's unit puts on this one. shrink: size factor (shrink ray: 0.5, never
    // undone); webbed: world.time the spider web lets go; floating: world.time a float (gravity bubble, astronaut hit, UFO beam) ends.
    shrink: 1, webbed: -D, floating: -D,   // -D: a double that is already in the past (time starts at 0)
    inside: -1,   // OURS step 6: id of the unit that has swallowed it (worm, king slime, UFO): not drawn (render), the swallower moves it
    muddy: -D,   // STEP7 TERRAIN-SIM: world.time until which the unit counts as muddy (stood in mud: terrain/mud.js), for the art
    anim: { walk: 0, atk: 0, hit: 0 }, b: {},
  };
  for (let k = 0; k < FLOAT_FIELDS.length; k++) u[FLOAT_FIELDS[k]] = 0;
  u.mass = 1; u.hp = 1; u.maxHp = 1; u.radius = 1; u.morale = 1; u.bravery = 1; u.speedMul = 1;
  u.harmByAt = -Infinity; u.hitAt = -Infinity;
  return u;
}

// ---------------------------------------------------------------- reset hooks
// Owners register a reset for state they keep on the world: onWorldClear((world) => { ... }). Clear runs every hook.
const CLEAR_HOOKS = [];
// fn(world) after reside() (team switch): modules with their own side bookkeeping (ant colonies, Mind Alien thralls).
const RESIDE_HOOKS = [];
export function onReside(fn) { if (typeof fn === 'function' && !RESIDE_HOOKS.includes(fn)) RESIDE_HOOKS.push(fn); return fn; }
export function onWorldClear(fn) { if (typeof fn === 'function' && !CLEAR_HOOKS.includes(fn)) CLEAR_HOOKS.push(fn); return fn; }
// Lazily created per-world stores of other owners (ANIMALS: colonies, carrion, snakes). Clear empties or drops them.
const OWNER_STORES = ['colonies', 'carrion', 'snakes'];

// ---------------------------------------------------------------- world
// ---------------------------------------------------------------- sides (OURS, side split 11-17)
// New-tab types carry faction F.Side + a side key (factions.js SIDE_GROUPS / sideOf). A side gets a faction slot from
// SIDE_SLOTS when its first unit spawns and keeps it until Clear. Out of free slots, a slot whose side has no unit left
// goes to the new side (its fear layer and paths are reset); with all 26 slots holding live sides, the new side shares
// the slot of the side with the fewest units (those two fight as one). gen[f] counts how often slot f changed hands,
// so a unit that left its side for a while (Mind Alien) can tell whether its old slot is still its side.
export class Sides {
  constructor() { this.slotOf = new Map(); this.keys = Array.from({ length: FACTION_COUNT }, () => null); this.gen = new Uint32Array(FACTION_COUNT); }
  clear() { this.slotOf.clear(); for (let f = 0; f < FACTION_COUNT; f++) if (this.keys[f] !== null) { this.keys[f] = null; this.gen[f]++; } }
  /** Side keys on slot f (null = free). */
  keysAt(f) { return this.keys[f]; }
  slot(world, key) {
    const have = this.slotOf.get(key); if (have !== undefined) return have;
    let f = -1;
    for (let k = 0; k < SIDE_SLOTS.length; k++) if (this.keys[SIDE_SLOTS[k]] === null) { f = SIDE_SLOTS[k]; break; }
    if (f < 0) {
      const live = new Int32Array(FACTION_COUNT);
      for (const u of world.units) if (!u.dead) live[u.faction]++;
      let few = -1;
      for (let k = 0; k < SIDE_SLOTS.length; k++) {
        const s = SIDE_SLOTS[k];
        if (live[s] === 0) { f = s; break; }
        if (few < 0 || live[s] < live[few]) few = s;
      }
      if (f < 0) { this.keys[few].push(key); this.slotOf.set(key, few); return few; }   // all 26 busy: share
      this.release(world, f);
    }
    this.keys[f] = [key]; this.slotOf.set(key, f); this.gen[f]++;
    return f;
  }
  release(world, f) {
    const ks = this.keys[f]; if (ks === null) return;
    for (const k of ks) this.slotOf.delete(k);
    this.keys[f] = null; this.gen[f]++;
    const fl = world.fields; if (fl.layers[f]) { fl.layers[f].fill(0); fl.active[f] = 0; }
    const nav = world.nav; if (nav.ready) { nav.ready[f] = 0; nav.readyCareful[f] = 0; }
  }
}

export class World {
  constructor({ W = 800, H = 600, seed = 1 } = {}) {
    this.W = 1; this.H = 1; this.seed = seed;
    this.rng = makeRng(seed);
    this.tick = 0; this.time = 0; this.lastBlow = -Infinity; this.projKind = undefined; // projKind: STEP6, set by ballistics while a projectile steps
    this.units = []; this.byId = new Map(); this.nextId = 1; this.liveCount = 0; this.needCompact = false;
    // OG unit-table index (units.alloc / free, game.js:11003-11025): a freed index is reused last-in first-out. OG seeds
    // per-unit hashes and phases with it (weave, detour side, staggers...) and walks units in index order.
    this.freeIndex = []; this.highIndex = 0; this.needSort = false;
    this.groups = new Groups(); this.grid = new Grid(); this.fields = new Fields(); this.walls = new Walls(); this.nav = new Nav();
    this.steam = new Steam(); this.sides = new Sides();
    // Terrain grids (8 px, TERRAIN writes them): water depth 0..1, ice hp; counts let systems skip empty grids.
    this.water = new Float32Array(1); this.waterCells = 0; this.ice = new Float32Array(1); this.iceCells = 0;
    this.lava7 = undefined; this.mud7 = undefined; this.bridge7 = undefined; this.tramp7 = undefined; // STEP7 TERRAIN-SIM: stores made on first use (terrain/lava|mud|bridge|tramp.js)
    // Mines: TERRAIN may replace this with its own field object of the same shape (OG module 526: count, version, high, x[], y[], alive[]).
    this.mines = emptyMines();
    this.oilCells = 0; this.oilBurning = 0;   // CORE-B oil grid counts (read by steering)
    this.projectiles = []; this.corpses = []; this.events = [];
    this.teamMode = false; this.holding = false;
    this.kills = { enabled: false, list: [] }; // OG kill list (game.js:11605-11627), on in team mode
    this.stats = { shots: 0, hits: 0, impacts: 0, infections: 0, turned: 0, ignitions: 0, plagued: 0, blasts: 0, deaths: {} };
    this.scratch = new Array(SCRATCH); this.gridDirty = true; this.bossList = []; this.bossTick = -1;
    this.colonies = null; this.carrion = null; this.snakes = null; // ANIMALS creates these lazily
    this.timings = null; // set to {} to collect ms per system (tick.js)
    this.spawnDepth = 0; this.mapUnits = 0; // STEP10 LEAD (share codes): spawn nesting; units a map build made
    this.resize(W, H);
  }
  get teams() { return this.teamMode; }
  tri() { return this.rng() - this.rng(); }
  defOf(type) { return getDef(type); }
  resize(W, H) {
    // Keep painted terrain where the old and new fields overlap (OG keeps it on resize; a phone resizes on
    // rotation and when the browser bar moves). Integration fix 11-13: before this, resize wiped walls/water/ice.
    const old = this.walls && this.walls.cols > 1 ? { cols: this.walls.cols, rows: this.walls.rows, solid: this.walls.solid, hp: this.walls.hp, water: this.water, ice: this.ice } : null;
    this.W = Math.max(1, W); this.H = Math.max(1, H);
    this.grid.resize(this.W, this.H); this.fields.resize(this.W, this.H); this.walls.resize(this.W, this.H); this.nav.resize(this.W, this.H);
    const n = this.walls.cols * this.walls.rows;
    this.tileCols = this.walls.cols; this.tileRows = this.walls.rows;
    this.water = new Float32Array(n); this.waterCells = 0; this.ice = new Float32Array(n); this.iceCells = 0;
    if (old) {
      const cols = Math.min(old.cols, this.walls.cols), rows = Math.min(old.rows, this.walls.rows);
      let walls = 0, wet = 0, iced = 0;
      for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
        const a = ty * old.cols + tx, b = ty * this.walls.cols + tx;
        if (old.solid[a]) { this.walls.solid[b] = 1; this.walls.hp[b] = old.hp[a]; walls++; }
        if (old.water && old.water.length === old.cols * old.rows && old.water[a] > 0) { this.water[b] = old.water[a]; wet++; }
        if (old.ice && old.ice.length === old.cols * old.rows && old.ice[a] > 0) { this.ice[b] = old.ice[a]; iced++; }
      }
      this.walls.count = walls; this.walls.version++;
      this.waterCells = wet; this.iceCells = iced; // terrain/grid.js rebuilds depth/shore from these on next use
    }
    // mines + oil resize with the field like OG's (game.js:5545-5546): mines keep every mine, oil keeps if the tile count holds
    if (this.mines && typeof this.mines.resize === 'function') this.mines.resize(this.W, this.H);
    if (this.oil && typeof this.oil.resize === 'function') this.oil.resize(this.W, this.H);
    for (const u of this.units) if (!u.dead) { u.x = u.px = clamp(u.x, u.radius, this.W - u.radius); u.y = u.py = clamp(u.y, u.radius, this.H - u.radius); }
    this.gridDirty = true;
  }

  // ---- units
  teamAt(x) { return x < this.W / 2 ? 0 : 1; }
  // Faction a new unit / group of def gets: the team faction in Team battle (teamable types), else its side's slot
  // (new-tab types, faction F.Side: side split 11-17), else the def faction (OG game.js:5579-5581).
  factionOf(def, team = -1) {
    if (team >= 0 && teamable(def)) return teamFaction(team);
    return def.faction === F.Side ? this.sides.slot(this, def.side || def.type) : def.faction;
  }
  // spawn(type, x, y, {team, group, heading, faction}) → unit or null (OG spawnUnit game.js:5569-5604).
  // team: undefined → by x in team mode, else -1. faction = team faction when teamable, else def faction.
  spawn(type, x, y, opts = {}) {
    const def = getDef(type); if (!def) return null;
    if (this.liveCount >= UNIT_CAP) return null; // OG alloc fails (game.js:11003-11020)
    const rng = this.rng, u = makeUnit(this.nextId++, type, def);
    u.index = this.freeIndex.length > 0 ? this.freeIndex.pop() : this.highIndex++;   // OG alloc (game.js:11003-11009)
    if (u.index < this.highIndex - 1) this.needSort = true;                             // reused: list no longer in index order
    const team = opts.team !== undefined ? (opts.team === 0 || opts.team === 1 ? opts.team : -1) : (this.teamMode ? this.teamAt(x) : -1);
    u.team = team;
    u.faction = opts.faction !== undefined ? opts.faction : this.factionOf(def, team);
    // home = its own side in free-for-all (team switch 11-17): a maker's (opts.like: crew, bees, crows, splits...), else
    // the side it was born on; born on a team, it is worked out when Team battle goes off (reside).
    const like = opts.like;
    if (like) { u.likeId = like.id; u.home = like.home; u.homeGen = like.homeGen; }
    else if (!isTeamFaction(u.faction)) { u.home = u.faction; u.homeGen = this.sides.gen[u.faction]; }
    u.group = opts.group !== undefined ? opts.group : -1;
    u.nextThink = this.tick + 1 + ((rng() * FIRST_THINK_SPAN) | 0); // OG game.js:5583 (plain rng() calls so a stubbed rng works)
    const r = def.radius * (1 + (rng() - rng()) * def.radiusJitter); // OG game.js:5584
    x = clamp(x, r, this.W - r); y = clamp(y, r, this.H - r);
    u.x = u.px = u.homeX = x; u.y = u.py = u.homeY = y;
    const h = opts.heading || 0; u.heading = u.pheading = h; u.wander = h;
    u.radius = r; u.mass = def.mass; u.hp = u.maxHp = def.maxHp;
    u.bravery = 0.85 + 0.3 * rng();                                  // U(0.85, 1.15) (OG game.js:5595)
    u.reactTime = def.reactionTime * (0.4 + 1.6 * rng());           // U(0.4, 2) (OG game.js:5596)
    u.speedMul = 0.9 + 0.2 * rng();                                  // U(0.9, 1.1) (OG game.js:5597)
    u.morale = clamp(def.morale.baseline * u.bravery, 0, 1);         // OG game.js:5598
    u.spawnTick = this.tick;
    this.units.push(u); this.byId.set(u.id, u); this.liveCount++;
    if (u.group >= 0) this.groups.join(u.group);
    if (initCombat) initCombat(u);
    if (this.spawnDepth > 0) u.kid = 1;                                  // STEP10 LEAD: made by another unit's init (share.js skips it)
    if (this.mapBuilding) u.mapIdx = ++this.mapUnits;                     // STEP10 LEAD: a map's prop (share.js: the map makes it again)
    if (def.init) { this.spawnDepth++; try { def.init(this, u); } finally { this.spawnDepth--; } }
    this.gridDirty = true;
    return u;
  }
  // Team switch (OURS, user 11-17: "if I dont start the battle they shouldn't be lost"): every unit changes side in
  // place instead of the field being wiped. Team battle on: each teamable unit joins the team of the half it stands on;
  // off: each goes back to its own side (home; worked out from its maker or its type when it was born on a team).
  // A stroke group split across sides keeps its group for the first side and opens one per other side. Targets reset.
  reside() {
    const on = this.teamMode, gs = this.groups, sides = this.sides, first = SIDE_SLOTS[0];
    const homeOf = (u, depth) => {
      if (u.home >= 0 && (u.home < first || sides.gen[u.home] === u.homeGen)) return u.home;
      let f = -1;
      if (u.likeId >= 0 && depth < 8) { const m = this.unitById(u.likeId); if (m && m !== u && teamable(m.def)) f = homeOf(m, depth + 1); }
      if (f < 0) f = this.factionOf(u.def, -1);
      u.home = f; u.homeGen = sides.gen[f];
      return f;
    };
    // attack 4 L2: a helper (crew, gunners, deckhands, siege-tower halberds, bees, crows, skeletons, slime splits, a made
    // unit's bitten zombies: spawn opts.like) joins its maker's team, wherever it stands, as when it is spawned in Team
    // battle (and as ants follow their hill). By its own half, a crew slot across the midline put that crewman on the
    // other team: he hit his own catapult / ram, a hive's bees stung their hive.
    const teamOf = (u, depth) => {
      if (u.likeId >= 0 && depth < 8) { const m = this.unitById(u.likeId); if (m && m !== u && m.hp > 0 && teamable(m.def)) return teamOf(m, depth + 1); }
      return this.teamAt(u.x);
    };
    const regroup = new Map(), claimed = new Set(), made = [];
    for (const u of this.units) {
      if (u.dead) continue;
      if (!teamable(u.def)) { if (u.infection > 0) u.infectTeam = on ? this.teamAt(u.x) : -1; continue; }   // attack 4 L2: a bitten frog (Props) rises as a teamable zombie frog
      const t = on ? teamOf(u, 0) : -1, f = on ? teamFaction(t) : homeOf(u, 0);
      if (u.faction !== f || u.team !== t) { u.faction = f; u.team = t; u.target = -1; u.lastVictim = -1; }   // attack 4 L2: + lastVictim (gator / snake revenge, cheetah sprint, piranha + sea prey: kept biting a new teammate)
      // attack 4 L2: a bite still waiting to turn (boar, cavalry, giant, slime turn when killed) rises on the team the victim
      // is on now (biter beside it), Undead in free-for-all (OG). It kept the side of the bite: bitten before Team went on,
      // it rose Undead in a Team battle (a third side the result never counts, its bites more Undead); bitten in Team
      // battle, it rose on a team faction in free-for-all.
      if (u.infection > 0) u.infectTeam = t;
      const og = u.group; if (og < 0) continue;
      const key = og * 64 + f;
      let g = regroup.get(key);
      if (g === undefined) {
        if (!claimed.has(og)) { claimed.add(og); gs.faction[og] = f; g = og; }
        else { g = gs.create(gs.type[og], f); if (g >= 0) made.push(g); }
        regroup.set(key, g);
      }
      if (g !== og) { gs.leave(og); if (g >= 0) gs.join(g); u.group = g; }
    }
    for (const g of made) gs.release(g);
    this.kills.list.length = 0;
    for (const fn of RESIDE_HOOKS) fn(this);
    this.gridDirty = true;
  }
  // Free a unit with no death processing (OG units.free). Group membership is not touched (OG eraseCircle calls leave itself).
  remove(u) {
    if (!u || u.removed) return;
    u.removed = true; u.dead = true; this.byId.delete(u.id); this.liveCount--; this.needCompact = true; this.gridDirty = true;
    if (u.index >= 0) this.freeIndex.push(u.index);                                     // OG free (game.js:11022-11025)
  }
  // Replace a unit by a fresh one of another type in place, keeping position, heading and velocity (OG game.js:5605-5616).
  replace(u, type, group = -1, team = u.team) {
    const { x, y, heading, vx, vy } = u; this.remove(u);
    const n = this.spawn(type, x, y, { group, heading, team }); if (n) { n.vx = vx; n.vy = vy; } return n;
  }
  // Possession follows a unit that turns into another one in place (OURS, Part 2 step 3): a rider thrown off or
  // unhorsed becomes the rider, a knight or ape mounting becomes the mount, a cursed unit becomes the frog.
  handOver(from, to) {
    if (!from || !to || from.possessed !== 1 || !this.possess || this.possess.id !== from.id) return;
    from.possessed = 0; to.possessed = 1; this.possess.id = to.id; to.target = -1; to.react = 0;
    this.emit('possess', { x: to.x, y: to.y, id: to.id, type: to.type, from: from.type });
  }
  unitById(id) { if (id < 0) return null; const u = this.byId.get(id); return u && !u.dead ? u : null; }
  compact() {
    if (!this.needCompact && !this.needSort) return;
    const us = this.units; let w = 0;
    for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.dead) us[w++] = u; }
    us.length = w; this.needCompact = false;
    if (this.needSort) { us.sort((a, b) => a.index - b.index); this.needSort = false; } // OG loops run i = 0..highWater
  }
  rebuildGrid() { this.compact(); this.grid.rebuild(this.units); this.gridDirty = false; }
  syncGrid() { if (this.gridDirty) this.rebuildGrid(); }

  // ---- spatial queries (grid snapshot buckets, current positions)
  // ARCH: query(x, y, r, fn): fn(u) for every unit within r; return true from fn to stop. Includes hp ≤ 0 units not yet processed.
  query(x, y, r, fn, mask = ALL_MASK) {
    const g = this.grid, us = this.units, st = g.start, it = g.items, r2 = r * r, cols = g.cols;
    const x0 = g.cx(x - r), x1 = g.cx(x + r), y0 = g.cy(y - r), y1 = g.cy(y + r);
    const lo = mask >>> 0, hi = (mask / 4294967296) >>> 0; // 53-bit mask (factions.js): bits 0-31, 32+
    const act = g.act, na = g.nAct;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const base = (cy * cols + cx) * FACTION_COUNT;
      for (let a = 0; a < na; a++) {
        const f = act[a];
        if (((f < 32 ? lo >>> f : hi >>> (f - 32)) & 1) === 0) continue;
        for (let p = st[base + f], e = st[base + f + 1]; p < e; p++) {
          const u = us[it[p]]; if (u.dead) continue;
          const dx = u.x - x, dy = u.y - y;
          if (dx * dx + dy * dy <= r2 && fn(u) === true) return;
        }
      }
    }
  }
  // Fill out[] with units within r whose faction is in mask; returns count (≤ max) (OG grid.queryRadius game.js:2851-2877).
  queryMask(x, y, r, mask, out = this.scratch, max = out.length) {
    const g = this.grid, us = this.units, st = g.start, it = g.items, r2 = r * r, cols = g.cols;
    const x0 = g.cx(x - r), x1 = g.cx(x + r), y0 = g.cy(y - r), y1 = g.cy(y + r);
    const lo = mask >>> 0, hi = (mask / 4294967296) >>> 0;
    const act = g.act, na = g.nAct;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const base = (cy * cols + cx) * FACTION_COUNT;
      for (let a = 0; a < na; a++) {
        const f = act[a];
        if (((f < 32 ? lo >>> f : hi >>> (f - 32)) & 1) === 0) continue;
        for (let p = st[base + f], e = st[base + f + 1]; p < e; p++) {
          const u = us[it[p]]; if (u.dead) continue;
          const dx = u.x - x, dy = u.y - y;
          if (dx * dx + dy * dy <= r2) { out[n++] = u; if (n >= max) return n; }
        }
      }
    }
    return n;
  }
  // Nearest unit within r in mask, ring search over 4×4 coarse blocks (OG grid.findNearest game.js:2799-2850).
  // hidden: 0 ignore concealment, 1 use u.unseen, 2 use u.unseenBySeers (hidden units count only within that many px).
  findNearest(x, y, r, mask, exclude = null, hidden = 0) {
    const g = this.grid, us = this.units, st = g.start, it = g.items, co = g.coarse, cols = g.cols, rows = g.rows, ccols = g.ccols, crows = g.crows;
    const B = 4 * g.cell, bx = g.cx(x) >> 2, by = g.cy(y) >> 2, rings = Math.ceil(r / B);
    let best = null, bd = r * r;
    const lo = mask >>> 0, hi = (mask / 4294967296) >>> 0;
    const act = g.act, na = g.nAct;
    for (let ring = 0; ring <= rings; ring++) {
      const ry0 = by - ring, ry1 = by + ring, rx0 = bx - ring, rx1 = bx + ring;
      for (let cby = ry0; cby <= ry1; cby++) {
        if (cby < 0 || cby >= crows) continue;
        const step = (cby === ry0 || cby === ry1) ? 1 : (rx1 - rx0 || 1);
        for (let cbx = rx0; cbx <= rx1; cbx += step) {
          if (cbx < 0 || cbx >= ccols) continue;
          const cb = (cby * ccols + cbx) * FACTION_COUNT; let cnt = 0;
          for (let a = 0; a < na; a++) { const f = act[a]; if ((f < 32 ? lo >>> f : hi >>> (f - 32)) & 1) cnt += co[cb + f]; }
          if (cnt === 0) continue;
          // box distance from the query point to this block
          const lx = cbx * B, ly = cby * B, ddx = x < lx ? lx - x : x > lx + B ? x - lx - B : 0, ddy = y < ly ? ly - y : y > ly + B ? y - ly - B : 0;
          if (ddx * ddx + ddy * ddy >= bd) continue;
          const yEnd = Math.min(rows, 4 * (cby + 1)), xEnd = Math.min(cols, 4 * (cbx + 1));
          for (let cy = 4 * cby; cy < yEnd; cy++) for (let cx = 4 * cbx; cx < xEnd; cx++) {
            const base = (cy * cols + cx) * FACTION_COUNT;
            for (let a = 0; a < na; a++) {
              const f = act[a];
              if (((f < 32 ? lo >>> f : hi >>> (f - 32)) & 1) === 0) continue;
              for (let p = st[base + f], e = st[base + f + 1]; p < e; p++) {
                const u = us[it[p]]; if (u === exclude || u.dead) continue;
                const dx = u.x - x, dy = u.y - y, d2 = dx * dx + dy * dy;
                if (hidden !== 0) { const h = hidden === 1 ? u.unseen : u.unseenBySeers; if (h > 0 && d2 > h * h) continue; }
                if (d2 < bd) { bd = d2; best = u; }
              }
            }
          }
        }
      }
      const reach = ring * B;
      if (best && bd <= reach * reach) break;
    }
    return best;
  }
  // Centroid of all units in mask, or null (OG sim.centroid, used for stroke heading).
  centroid(mask) {
    let sx = 0, sy = 0, n = 0;
    for (const u of this.units) { if (u.dead || maskHas(mask, u.faction) === 0) continue; sx += u.x; sy += u.y; n++; }
    return n ? { x: sx / n, y: sy / n } : null;
  }

  // ---- groups
  // createGroup(type, team): faction = team faction when teamable (OG game.js:5555-5558).
  createGroup(type, team = -1) {
    const def = getDef(type); if (!def) return -1;
    return this.groups.create(type, this.factionOf(def, team));
  }
  // Release a stroke's group; a drilled type gets its formation laid out (OG game.js:5562-5568).
  releaseGroup(g) {
    const gs = this.groups; gs.release(g);
    if (g < 0 || gs.alive[g] === 0) return;
    const def = getDef(gs.type[g]);
    if (def && def.drilled) { gs.drilled[g] = 1; layoutFormation(this, g, true); }
  }

  // ---- events (audio, render, report): {name, x, y, ...}
  emit(name, data) { const e = data ? Object.assign({ name }, data) : { name }; this.events.push(e); if (this.events.length > 4096) this.events.splice(0, 1024); return e; }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // ---- terrain reads (8 px tiles; out of field = nothing)
  tileIndex(x, y) {
    const tx = Math.floor(x / WALL_TILE), ty = Math.floor(y / WALL_TILE);
    return tx < 0 || ty < 0 || tx >= this.tileCols || ty >= this.tileRows ? -1 : ty * this.tileCols + tx;
  }
  wallAt(x, y) { return this.walls.isSolidAt(x, y) ? 1 : 0; }
  // Water depth 0..1; 0 over intact ice (OG depthAt game.js:9602-9610).
  waterAt(x, y) { if (this.waterCells === 0) return 0; const i = this.tileIndex(x, y); if (i < 0) return 0; if (this.iceCells > 0 && this.ice[i] > 0) return 0; const b = this.bridge7; return b !== undefined && b.cells > 0 && b.hp[i] > 0 ? 0 : this.water[i]; } // STEP7 TERRAIN-SIM: a bridge plank over water reads dry (terrain/bridge.js; aquatic units use depthUnder and swim under)
  // Water depth ignoring ice (OG depthUnder game.js:9611-9616).
  depthUnder(x, y) { if (this.waterCells === 0) return 0; const i = this.tileIndex(x, y); return i < 0 ? 0 : this.water[i]; }
  iceAt(x, y) { if (this.iceCells === 0) return 0; const i = this.tileIndex(x, y); return i < 0 ? 0 : this.ice[i]; }
  // Intact ice over water (OG frozenAt game.js:9617-9625).
  frozenAt(x, y) { if (this.waterCells === 0 || this.iceCells === 0) return false; const i = this.tileIndex(x, y); return i >= 0 && this.ice[i] > 0 && this.water[i] >= WET; }
  lineOfSight(x0, y0, x1, y1) { return this.walls.lineOfSight(x0, y0, x1, y1); }
  // Standing in water ≥ 0.05 deep, grounded and not climbing; aquatic units ignore ice (OG wetAt game.js:9824-9829).
  wetAt(u) { return this.waterCells > 0 && !(u.z > 0) && u.climb === 0 && (u.def.aquatic ? this.depthUnder(u.x, u.y) : this.waterAt(u.x, u.y)) >= WET; }
  // Living boss units this tick (OG game.js:5705-5713). No OG unit is a boss.
  bosses() {
    if (this.bossTick !== this.tick) { this.bossTick = this.tick; this.bossList.length = 0; for (const u of this.units) if (!u.dead && u.def.boss) this.bossList.push(u); }
    return this.bossList;
  }

  // ---- reset (Clear)
  clearAll() {
    this.units.length = 0; this.byId.clear(); this.liveCount = 0; this.needCompact = false;
    this.freeIndex.length = 0; this.highIndex = 0; this.needSort = false;                 // OG units.clear (game.js:11031)
    this.groups.clear(); this.fields.clear(); this.walls.clear(); this.steam.clear(); this.nav.clear(); this.sides.clear();
    this.water.fill(0); this.waterCells = 0; this.ice.fill(0); this.iceCells = 0;
    if (this.mines.clear) this.mines.clear(); else this.mines = emptyMines();
    this.projectiles.length = 0; this.corpses.length = 0; if (this.flyingBodies) this.flyingBodies.length = 0; this.kills.list.length = 0; this.gridDirty = true;
    // OG clear also empties oil, the corpse ring (head 0) and the stuck ground arrows (game.js:5720-5731); attack L1 11-13:
    // before, oil puddles and fires and ground arrows outlived Clear, and a refilled corpse ring overwrote from a stale head.
    this.corpseHead = 0;
    if (this.oil && typeof this.oil.clear === 'function') this.oil.clear();
    this.oilCells = 0; this.oilBurning = 0;
    if (this.groundArrows) this.groundArrows.length = 0;
    this.bossList.length = 0; this.bossTick = -1; this.lastBlow = -Infinity;
    for (const k in this.stats) if (k !== 'deaths') this.stats[k] = 0;
    this.stats.deaths = {};
    for (const k of OWNER_STORES) {
      const o = this[k];
      if (!o) continue;
      if (typeof o.clear === 'function') o.clear(); else if (Array.isArray(o)) o.length = 0; else this[k] = null;
    }
    for (const fn of CLEAR_HOOKS) fn(this);
  }
}
export function createWorld(opts) { return new World(opts); }
export { DT };
