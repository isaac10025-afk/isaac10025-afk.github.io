// Lava (OURS, Part 2 step 7, STEP7.md TERRAIN-SIM): a full-brush ground kind on the 8 px terrain tiles.
// A ground unit standing on lava (not flying / leaping / climbing / high) catches fire and takes 40 hp/s; fire-immune
// units (flammability 0: lava golem, dragon, flamer, giant mech, UFO, phoenix...) take nothing and the lava golem heals on
// it. Bodies landing in it burn, trees / barrels on it catch fire (barrels blow as usual), mines on it go off, oil touching
// it lights. Units walk round it: steering treats it as a soft wall (Lava7.steer, called from systems/steering.js) and the
// path fields treat mostly-lava cells as blocked (Lava7.blockNav / blocks, called from systems/navigation.js), unless the
// unit is fire-immune, fleeing, possessed or in the air: knock-backs, slips and blasts can still push units in.
// Water + lava = rock: wherever water and lava touch (same tile or 4-neighbours) both become wall tiles (hp 100, flagged
// in `rock` for the basalt look) with steam. Ice on lava melts (-> water -> rock). Lava golem patches (step 6 effect
// projectile) are their own thing and stay as they are. A bridge plank over lava is a safe floor (bridge.js burns it out).
// Store: world.lava7 (Lava7). Art fields (TERRAIN-ART): grid, cells, version, rock, rockCells, rockVersion.
import { DT, WET, STATE, NAV_CELL, LEAP } from '../const.js';
import { forCapsule, terrainOf, recountWater, recountIce } from './grid.js';
import { harmIce } from './ice.js';
import { minesOf, MINE_FUSE } from './mines.js';
import { removePlank } from './bridge.js';
import { deps } from './deps.js';
import { onWorldClear } from '../world.js';
import { registerSystem } from '../systems/extra.js';
import { hooks as combatHooks } from '../combat/env.js';
import * as fireMod from '../combat/fire.js';
import { SLICK } from '../combat/oil.js';

export const T = {
  dps: 40,            // hp/s a ground unit standing on lava takes ...
  every: 15,          // ... dealt every 15 ticks (0.25 s), staggered by unit
  heal: 30,           // hp/s the lava golem heals standing on lava
  groundZ: 2,         // px: a unit higher than this is over the lava, not in it
  rockHp: 100,        // wall hp of rock made where lava meets water (a painted wall tile's hp, wall.js)
  steamEvery: 6,      // one steam cloud per this many rock tiles made ...
  steamMax: 6,        // ... at most this many per reaction
  steamR: 30,         // px steam cloud radius
  steamLife: 3,       // s a steam cloud lasts
  look: 12,           // px past its radius a unit keeps clear of lava (soft wall) ...
  shove: 0.6,         // ... and the push out of that band at the lava's edge (x walk speed)
  escapeRings: 4,     // tiles searched for the nearest lava-free tile when standing in lava
  navBlock: 4,        // lava tiles (no plank) of the 9 in a 24 px path cell that block it for paths (a 3-tile bridge stays open)
  near: 2,            // path cells around lava where steering looks for it (covers units up to ~36 px radius)
  lineStep: 12,       // px between samples when testing a straight line for lava (moveTo)
  oilEvery: 10,       // ticks between oil-on-lava checks
  mineEvery: 15,      // ticks between mine-on-lava checks
  unstickRings: 16,   // tiles searched for room for a unit the rock closed over (ATTACK L2) ...
  unstickFit: 0.7,    // ... = a unit with rock inside this x its radius (a crack too narrow for it: the wall push shoves it in)
};

// ---------------------------------------------------------------- store
export class Lava7 {
  constructor(cols, rows) {
    const n = cols * rows;
    this.cols = cols; this.rows = rows; this.n = n; this.tile = 8; this.inv = 1 / 8;
    this.grid = new Uint8Array(n);        // 1 = lava
    this.rock = new Uint8Array(n);        // 1 = this wall tile was made by lava + water (basalt look; draw only where walls.solid)
    this.mark = new Uint8Array(n);        // scratch (reaction dedupe)
    this.tmp = new Int32Array(256);       // scratch tile list
    this.cells = 0; this.version = 0; this.rockVersion = 0; this.rockCells = 0;   // rockCells: tiles flagged rock
    this.waterSeen = -1; this.lavaSeenW = -1; this.iceSeen = -1; this.lavaSeenI = -1; this.corpseSeen = 0;   // iceSeen: iceCells at the last melt check
    // path cells (24 px): unplanked lava tiles per cell + "lava near" flag, rebuilt when lava or planks change
    this.navCols = 0; this.navRows = 0; this.navCount = new Uint8Array(1); this.near = new Uint8Array(1); this.near2 = new Uint8Array(1);
    this.navLava = -1; this.navBridge = -1;
  }
  clear() { this.grid.fill(0); this.rock.fill(0); this.cells = 0; this.rockCells = 0; this.version++; this.rockVersion++; this.navLava = -1; }
  idx(x, y) { const tx = Math.floor(x * this.inv), ty = Math.floor(y * this.inv); return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows ? -1 : ty * this.cols + tx; }
  /** Lava under (x, y) that no plank covers. */
  hotAt(world, x, y) {
    const i = this.idx(x, y);
    if (i < 0 || this.grid[i] === 0) return false;
    const B = world.bridge7;
    return B === undefined || B.cells === 0 || !(B.hp[i] > 0);
  }
  // ---- paths (systems/navigation.js) and steering (systems/steering.js) ----
  /** Does unit u keep off lava? Fire-immune, fleeing, possessed, airborne, hopping and lying units don't. */
  avoids(u) { const d = u.def; return d.flammability > 0 && u.state !== STATE.FLEE && u.possessed !== 1 && u.leaping === 0 && !(u.z > 0) && !d.hopper && !(u.prone > 0); }
  ensureNav(world) {
    const nav = world.nav, B = world.bridge7, bv = B !== undefined ? B.coverVersion : -1;   // only planks over lava matter
    if (this.navLava === this.version && this.navBridge === bv && this.navCols === nav.cols && this.navRows === nav.rows) return;
    this.navLava = this.version; this.navBridge = bv;
    const nc = nav.cols, nr = nav.rows, m = nc * nr, k = NAV_CELL / this.tile;
    if (this.navCount.length !== m) { this.navCount = new Uint8Array(m); this.near = new Uint8Array(m); this.near2 = new Uint8Array(m); }
    this.navCols = nc; this.navRows = nr;
    const cnt = this.navCount, near = this.near, tmp = this.near2, g = this.grid, C = this.cols, bh = B !== undefined && B.cells > 0 ? B.hp : null;
    cnt.fill(0); near.fill(0);
    if (this.cells > 0) for (let i = 0; i < this.n; i++) {
      if (g[i] === 0 || (bh !== null && bh[i] > 0)) continue;
      const tx = i % C, ty = (i - tx) / C, cx = Math.floor(tx / k), cy = Math.floor(ty / k);
      if (cx < nc && cy < nr) cnt[cy * nc + cx]++;
    }
    // near = any lava within T.near cells (two 1-cell dilations)
    for (let c = 0; c < m; c++) near[c] = cnt[c] > 0 ? 1 : 0;
    for (let pass = 0; pass < T.near; pass++) {
      tmp.set(near);
      for (let cy = 0; cy < nr; cy++) for (let cx = 0; cx < nc; cx++) {
        if (tmp[cy * nc + cx] === 0) continue;
        for (let j = Math.max(0, cy - 1); j <= Math.min(nr - 1, cy + 1); j++) for (let q = Math.max(0, cx - 1); q <= Math.min(nc - 1, cx + 1); q++) near[j * nc + q] = 1;
      }
    }
  }
  /** OR the lava-blocked path cells into the nav's blocked grid (navigation.js syncWalls). */
  blockNav(world, blocked) {
    this.ensureNav(world);
    const cnt = this.navCount, n = Math.min(blocked.length, cnt.length);
    for (let c = 0; c < n; c++) if (cnt[c] >= T.navBlock) blocked[c] = 1;
  }
  /** Change key for navigation (lava or planks changed). */
  navKey(world) { const B = world.bridge7; return this.version * 65536 + (B !== undefined ? B.coverVersion % 65536 : 0); }
  /** Does the straight line pass a lava-blocked path cell? (moveTo: then the unit follows the field round it) */
  blocks(world, x0, y0, x1, y1) {
    this.ensureNav(world);
    const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), steps = Math.max(1, Math.ceil(len / T.lineStep));
    const nc = this.navCols, nr = this.navRows, inv = 1 / NAV_CELL, cnt = this.navCount;
    for (let s = 0; s <= steps; s++) {
      const cx = Math.floor((x0 + (dx * s) / steps) * inv), cy = Math.floor((y0 + (dy * s) / steps) * inv);
      if (cx < 0 || cy < 0 || cx >= nc || cy >= nr) continue;
      if (cnt[cy * nc + cx] >= T.navBlock) return true;
    }
    return false;
  }
  /**
   * Soft wall: the desired velocity (vx, vy) of a lava-avoiding unit, bent so it keeps T.look px clear of lava: the part
   * heading into lava within that band is dropped (it slides along the edge) plus a push out near the edge; a unit already
   * standing in lava heads for the nearest lava-free tile at run speed. Writes out[0..1]; false = no change.
   */
  steer(world, u, vx, vy, out) {
    const x = u.x, y = u.y, nc = this.navCols, cx = Math.floor(x / NAV_CELL), cy = Math.floor(y / NAV_CELL);
    if (cx < 0 || cy < 0 || cx >= nc || cy >= this.navRows || this.near[cy * nc + cx] === 0) return false;
    const B = world.bridge7, bh = B !== undefined && B.cells > 0 ? B.hp : null, g = this.grid, t = this.tile, C = this.cols, R = this.rows, def = u.def;
    const tx = Math.floor(x * this.inv), ty = Math.floor(y * this.inv);
    if (tx >= 0 && ty >= 0 && tx < C && ty < R) {
      const i = ty * C + tx;
      if (g[i] === 1 && (bh === null || !(bh[i] > 0))) {
        if (!this.escape(world, tx, ty, bh)) return false;
        const ex = _esc[0] - x, ey = _esc[1] - y, m = Math.sqrt(ex * ex + ey * ey) || 1, s = def.runSpeed;
        out[0] = (ex / m) * s; out[1] = (ey / m) * s; return true;
      }
    }
    const Rr = u.radius + T.look;
    const c0 = Math.max(0, Math.floor((x - Rr) * this.inv)), c1 = Math.min(C - 1, Math.floor((x + Rr) * this.inv));
    const r0 = Math.max(0, Math.floor((y - Rr) * this.inv)), r1 = Math.min(R - 1, Math.floor((y + Rr) * this.inv));
    let sx = 0, sy = 0, dmin = Rr, any = false;
    for (let j = r0; j <= r1; j++) {
      const y0 = j * t;
      for (let q = c0; q <= c1; q++) {
        const i = j * C + q;
        if (g[i] === 0 || (bh !== null && bh[i] > 0)) continue;
        const x0 = q * t, qx = x < x0 ? x0 : x > x0 + t ? x0 + t : x, qy = y < y0 ? y0 : y > y0 + t ? y0 + t : y;
        const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
        if (d2 >= Rr * Rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), w = 1 - d / Rr;
        sx += (dx / d) * w; sy += (dy / d) * w; any = true;
        if (d < dmin) dmin = d;
      }
    }
    if (!any) return false;
    const m = Math.sqrt(sx * sx + sy * sy);
    if (m < 1e-6) return false;
    const ex = sx / m, ey = sy / m, toward = -(vx * ex + vy * ey);
    if (toward > 0) { vx += ex * toward; vy += ey * toward; }
    const k = 1 - dmin / Rr, push = k * k * T.shove * def.walkSpeed * Math.min(1, m);   // lava on both sides (a bridge): the pushes cancel
    out[0] = vx + ex * push; out[1] = vy + ey * push;
    return true;
  }
  // Nearest tile centre within T.escapeRings that is neither lava (unplanked) nor wall: _esc[0..1].
  escape(world, ox, oy, bh) {
    const C = this.cols, R = this.rows, g = this.grid, solid = world.walls.solid;
    let best = -1, bd = Infinity;
    for (let ring = 1; ring <= T.escapeRings && best < 0; ring++)
      for (let ty = oy - ring; ty <= oy + ring; ty++) for (let tx = ox - ring; tx <= ox + ring; tx++) {
        if (Math.max(Math.abs(tx - ox), Math.abs(ty - oy)) !== ring || tx < 0 || ty < 0 || tx >= C || ty >= R) continue;
        const i = ty * C + tx;
        if ((g[i] === 1 && (bh === null || !(bh[i] > 0))) || solid[i] === 1) continue;
        const d = (tx - ox) * (tx - ox) + (ty - oy) * (ty - oy);
        if (d < bd) { bd = d; best = i; }
      }
    if (best < 0) return false;
    _esc[0] = ((best % C) + 0.5) * this.tile; _esc[1] = (Math.floor(best / C) + 0.5) * this.tile;
    return true;
  }
}
const _esc = new Float64Array(2);

export function lavaOf(world) {
  const w = world.walls;
  let L = world.lava7;
  if (L === undefined || L.cols !== w.cols || L.rows !== w.rows) L = world.lava7 = new Lava7(w.cols, w.rows);
  return L;
}
onWorldClear((world) => { if (world.lava7 !== undefined) world.lava7.clear(); });

// ---------------------------------------------------------------- painting
let _L = null, _mud = null, _v = 0, _n = 0;
function paintTile(i) {
  const L = _L;
  if (L.grid[i] !== _v) { L.grid[i] = _v; L.cells += _v ? 1 : -1; _n++; }
  if (_v === 1 && _mud !== null && _mud.grid[i] === 1) { _mud.grid[i] = 0; _mud.cells--; _mud.version++; }   // lava takes the tile from mud
}
/** Lava (erase = false) or no lava on tiles within max(r, 4) px of the segment, full brush. Returns tiles changed. */
export function paintLava(world, x0, y0, x1, y1, r, erase = false) {
  if (erase && (world.lava7 === undefined || world.lava7.cells === 0)) return 0;
  const L = lavaOf(world);
  _L = L; _v = erase ? 0 : 1; _n = 0; _mud = !erase && world.mud7 !== undefined && world.mud7.cells > 0 ? world.mud7 : null;
  forCapsule(L, x0, y0, x1, y1, r, paintTile);
  const n = _n; _L = null; _mud = null;
  if (n > 0) { L.version++; if (!erase && !world.mapBuilding) settle(world); }
  return n;
}
export function eraseLava(world, x0, y0, x1, y1, r) { return paintLava(world, x0, y0, x1, y1, r, true); }
export function clearLava(world) { if (world.lava7 !== undefined) world.lava7.clear(); }
/**
 * After painting water, ice or lava (terrain/index.js; iceNew = ice was just painted) and every lava tick: rock where water
 * meets lava (when water or lava changed), ice on lava melts (when lava changed or ice was painted: ice cells only grow by
 * painting, so a cracking lake never triggers the scan).
 */
export function settle(world, iceNew = false) {
  const L = world.lava7;
  if (L === undefined || L.cells === 0) return;
  const T0 = terrainOf(world);
  if (world.waterCells > 0 && (T0.waterVersion !== L.waterSeen || L.version !== L.lavaSeenW)) react(world, L, T0);
  if (world.iceCells > 0 && L.cells > 0 && (iceNew || world.iceCells > L.iceSeen || L.version !== L.lavaSeenI)) meltIce(world, L, T0);
  else if (world.iceCells < L.iceSeen) L.iceSeen = world.iceCells;
}
/** Map build end (maps/index.js registerMapKind after): reactions + mines on lava, once. */
export function afterMap(world) { settle(world, true); if (world.lava7 !== undefined && world.lava7.cells > 0) minesOnLava(world, world.lava7); }

// ---------------------------------------------------------------- water + lava = rock
function pushTmp(L, k, i) { if (L.mark[i] === 1) return k; if (k >= L.tmp.length) { const t = new Int32Array(2 * L.tmp.length); t.set(L.tmp); L.tmp = t; } L.mark[i] = 1; L.tmp[k] = i; return k + 1; }
function react(world, L, T0) {
  const C = L.cols, R = L.rows, g = L.grid, lev = T0.level;
  let k = 0;
  for (let i = 0; i < L.n; i++) {
    if (g[i] === 0) continue;
    const x = i % C, y = (i - x) / C;
    let hit = lev[i] >= WET;
    if (x > 0 && lev[i - 1] >= WET) { hit = true; k = pushTmp(L, k, i - 1); }
    if (x < C - 1 && lev[i + 1] >= WET) { hit = true; k = pushTmp(L, k, i + 1); }
    if (y > 0 && lev[i - C] >= WET) { hit = true; k = pushTmp(L, k, i - C); }
    if (y < R - 1 && lev[i + C] >= WET) { hit = true; k = pushTmp(L, k, i + C); }
    if (hit) k = pushTmp(L, k, i);
  }
  if (k > 0) {
    const walls = world.walls, solid = walls.solid, whp = walls.hp, ice = T0.iceHp, B = world.bridge7, planks = B !== undefined && B.cells > 0;
    let iced = false, sx = 0, sy = 0, puffs = 0;
    for (let q = 0; q < k; q++) {
      const i = L.tmp[q];
      L.mark[i] = 0;
      if (g[i] === 1) { g[i] = 0; L.cells--; }
      T0.depth[i] = 0;
      if (ice[i] > 0) { ice[i] = 0; iced = true; }
      if (planks && B.hp[i] > 0) removePlank(world, i);                       // rock takes the plank's place
      if (solid[i] === 0) { solid[i] = 1; walls.count++; }
      whp[i] = T.rockHp; if (L.rock[i] === 0) { L.rock[i] = 1; L.rockCells++; }
      sx += ((i % C) + 0.5) * 8; sy += (Math.floor(i / C) + 0.5) * 8;
      if ((q + 1) % T.steamEvery === 0 || q === k - 1) {
        const n = (q % T.steamEvery) + 1, cx = sx / n, cy = sy / n;
        sx = 0; sy = 0;
        if (puffs < T.steamMax) {
          puffs++;
          world.emit('steam', { x: cx, y: cy, size: T.steamR, thick: 2, rock: 1 });
          if (combatHooks.steam) combatHooks.steam(world, cx, cy - 6, T.steamR, T.steamLife);
        }
      }
    }
    walls.version++; walls.damageVersion++; L.version++; L.rockVersion++;
    recountWater(world, T0);
    if (iced) recountIce(world, T0);
    unstick(world);                                                             // ATTACK L2: units the rock closed over
    world.emit('rock', { x: ((L.tmp[0] % C) + 0.5) * 8, y: (Math.floor(L.tmp[0] / C) + 0.5) * 8, n: k, v: Math.min(3, k / 20) });
  }
  L.waterSeen = T0.waterVersion; L.lavaSeenW = L.version;
}
// ATTACK L2 (11-16): rock can close over units standing in the water / lava (paint water onto a lava lake with an army in
// it). The wall push only jumps a unit to the nearest free TILE, often a 1-tile crack in the new rock it can't fit in, so
// it was wedged in the rock for good (walled in: shots can't reach it, so it can hold a Team battle open). A grounded unit
// with rock well inside its body (its middle in rock, or a crack too narrow for it) is moved to the nearest spot within
// T.unstickRings tiles where its whole body fits and no other unit stands.
function fits(walls, cx, cy, r) {
  const t = walls.tile, inv = 1 / t, x0 = Math.floor((cx - r) * inv), x1 = Math.floor((cx + r) * inv), y0 = Math.floor((cy - r) * inv), y1 = Math.floor((cy + r) * inv);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= walls.cols || ty >= walls.rows) return false;
    if (walls.solid[ty * walls.cols + tx] !== 1) continue;
    const lx = tx * t, ly = ty * t, dx = cx - (cx < lx ? lx : cx > lx + t ? lx + t : cx), dy = cy - (cy < ly ? ly : cy > ly + t ? ly + t : cy);
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}
// Room for a unit of radius r at (cx, cy): no other unit's body (already moved ones included) over most of it.
const _moved = [];
let _cx = 0, _cy = 0, _r = 0, _self = null, _busy = false;
function crowdOne(o) { if (o === _self || o.dead || o.def.prop || o.z > T.groundZ || _busy) return; const d = Math.hypot(o.x - _cx, o.y - _cy); if (d < (_r + o.radius) * 0.8) _busy = true; }
function crowded(world, u, cx, cy, r) {
  for (let k = 0; k < _moved.length; k += 3) if (Math.hypot(_moved[k] - cx, _moved[k + 1] - cy) < (r + _moved[k + 2]) * 0.8) return true;
  _cx = cx; _cy = cy; _r = r; _self = u; _busy = false;
  world.query(cx, cy, r, crowdOne);
  _self = null;
  return _busy;
}
function unstick(world) {
  const walls = world.walls, us = world.units, t = walls.tile, W = world.W, H = world.H;
  let synced = false;
  _moved.length = 0;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || u.z > T.groundZ || u.leaping === LEAP.VAULT || u.leaping === LEAP.FLY || u.inside >= 0 || u.def.prop || fits(walls, u.x, u.y, u.radius * T.unstickFit)) continue;
    if (!synced) { world.syncGrid(); synced = true; }
    const ox = Math.floor(u.x / t), oy = Math.floor(u.y / t), r = u.radius;
    let bx = 0, by = 0, bd = Infinity;
    for (let ring = 1; ring <= T.unstickRings && bd === Infinity; ring++)
      for (let ty = oy - ring; ty <= oy + ring; ty++) for (let tx = ox - ring; tx <= ox + ring; tx++) {
        if (Math.max(Math.abs(tx - ox), Math.abs(ty - oy)) !== ring) continue;
        const cx = (tx + 0.5) * t, cy = (ty + 0.5) * t;
        const d = (cx - u.x) * (cx - u.x) + (cy - u.y) * (cy - u.y);
        if (d >= bd || cx < r || cy < r || cx > W - r || cy > H - r || !fits(walls, cx, cy, r) || crowded(world, u, cx, cy, r)) continue;
        bd = d; bx = cx; by = cy;
      }
    if (bd === Infinity) continue;   // nowhere near: the wall push keeps trying (as for a painted wall)
    u.x = u.px = bx; u.y = u.py = by; u.vx = 0; u.vy = 0;
    _moved.push(bx, by, r);
  }
  _moved.length = 0;
  if (synced) world.gridDirty = true;
}
// Ice painted on (or lying over) lava melts at once: the ice system floods it next tick, then the water meets the lava.
function meltIce(world, L, T0) {
  const g = L.grid, ice = T0.iceHp, C = L.cols;
  let puffs = 0;
  for (let i = 0; i < L.n; i++) {
    if (g[i] === 0 || !(ice[i] > 0)) continue;
    const x = ((i % C) + 0.5) * 8, y = (Math.floor(i / C) + 0.5) * 8;
    harmIce(world, x, y, 4, 2);
    if (puffs < T.steamMax && world.rng() < 0.2) { puffs++; world.emit('puff', { kind: 'steam', x, y, ang: -Math.PI / 2, size: 0.8 }); }
  }
  L.iceSeen = world.iceCells; L.lavaSeenI = L.version;
}
function minesOnLava(world, L) {
  const M = minesOf(world);
  if (M.count === 0) return;
  for (let k = 0; k < M.high; k++) {
    if (M.alive[k] === 0 || M.fuse[k] >= 0 || !L.hotAt(world, M.x[k], M.y[k])) continue;
    M.arm(k, MINE_FUSE);
    world.emit('minearm', { x: M.x[k], y: M.y[k], v: 1, type: 'lava' });
  }
}

// ---------------------------------------------------------------- system
export function run(world) {
  const L = world.lava7;
  if (L === undefined || L.cells === 0) return;
  if (L.cols !== world.walls.cols || L.rows !== world.walls.rows) { world.lava7 = undefined; return; }   // the field changed size (never after boot): start empty
  settle(world);
  if (L.cells === 0) return;
  const B = world.bridge7, bh = B !== undefined && B.cells > 0 ? B.hp : null, g = L.grid, us = world.units, tick = world.tick;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !(u.hp > 0) || u.inside >= 0 || u.z > T.groundZ || u.vz > 0 || u.leaping !== 0 || u.climb > 0) continue;
    const i = L.idx(u.x, u.y);
    if (i < 0 || g[i] === 0 || (bh !== null && bh[i] > 0)) continue;
    const def = u.def;
    const heal = def.lavaHeal !== undefined ? def.lavaHeal : u.type === 'lavagolem' ? T.heal : 0;
    if (heal > 0) { if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + heal * DT); continue; }
    if (!(def.flammability > 0)) continue;                                     // fire-immune: no harm
    if (!(u.burning > 1) && fireMod.igniteNow) fireMod.igniteNow(world, u);    // kept alight while in it
    if (def.prop) continue;                                                    // trees / barrels just burn (barrels blow)
    if ((tick + u.index) % T.every === 0) { deps.damage(world, u, T.dps * T.every * DT, -1, 'fire'); u.harmCause = 3; }
  }
  // bodies landing in it burn (new corpses since the last tick, and flying bodies touching down)
  const seq = world.corpseSeq | 0;
  if (seq !== L.corpseSeen) {
    const cs = world.corpses;
    if (cs) for (let k = 0; k < cs.length; k++) { const c = cs[k]; if (c && c.id > L.corpseSeen && c.burning !== 1 && (c.z || 0) < 4 && L.hotAt(world, c.x, c.y)) c.burning = 1; }
    L.corpseSeen = seq;
  }
  const fb = world.flyingBodies;
  if (fb && fb.length) for (let k = 0; k < fb.length; k++) {
    const c = fb[k];
    if (c.burning === 1 || (c.z || 0) > T.groundZ || !L.hotAt(world, c.x, c.y)) continue;
    c.burning = 1;
    world.emit('puff', { kind: 'steam', x: c.x, y: c.y, ang: -Math.PI / 2, size: 0.6 + (c.r || 8) / 15 });
  }
  if ((tick % T.mineEvery) === 0) minesOnLava(world, L);
  const oil = world.oil;
  if (oil && oil.cells > 0 && (tick % T.oilEvery) === 0) {                  // oil touching lava lights
    const ot = oil.tile, amt = oil.amount, fire = oil.fire;
    for (let j = Math.max(0, oil.y0); j <= Math.min(oil.rows - 1, oil.y1); j++) for (let q = Math.max(0, oil.x0); q <= Math.min(oil.cols - 1, oil.x1); q++) {
      const c = j * oil.cols + q;
      if (fire[c] === 1 || amt[c] < SLICK) continue;
      const x = (q + 0.5) * ot, y = (j + 0.5) * ot, i = L.idx(x, y);
      if (i >= 0 && g[i] === 1) oil.ignite(x, y, ot * 0.5);
    }
  }
}

registerSystem('lava7', run, 'water');
