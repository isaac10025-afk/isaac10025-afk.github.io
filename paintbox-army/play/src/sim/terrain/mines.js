// Mines: the mine field (replaces CORE-A's emptyMines on world.mines, same shape), painting, erasing, triggers,
// chain arming and the mine system (tick step 10). Single use: removed when the fuse ends, then it explodes.
// OG modules 526 (game.js:11631-11868) and 612/527 (system, game.js:16118-16210).
import { DT, DEEP, STATE, MINE_RADIUS, MINE_AVOID } from '../const.js';
import { segDist, latticeHash, climbOf, leapOf } from './grid.js';
import { depthAt } from './water.js';
import { traction, TRACTION_CALM } from './ice.js';
import { deps } from './deps.js';
import './hooks.js';
import { watch as watchBattle } from '../report.js';

export const MINE_TRIGGER = MINE_RADIUS;  // 9.45: trigger reach added to the unit radius (OG game.js:11669)
export { MINE_AVOID };                    // 13.45: avoid disc + nav block radius (OG game.js:11670)
export const MINE_CAP = 2048;             // OG game.js:11673
export const MINE_SPACING = 19;           // no mine within 19 px of another (OG game.js:11713-11715)
export const MINE_SMALL_BRUSH = 19;       // brush < 19: one mine at the pointer (OG game.js:11699)
export const MINE_LATTICE_X = 38, MINE_LATTICE_Y = 32.908, MINE_JITTER = 0.25; // hex lattice ±25 % (OG game.js:11671-11672, 11700)
export const MINE_BUCKET = 32;            // lookup buckets (OG game.js:11692-11693)
export const MINE_MASS = 0.7;             // lighter units never set mines off (OG game.js:16146)
export const MINE_FUSE = 0.4;             // fuse once armed (OG game.js:16147)
export const CHAIN_R = 1.25, CHAIN_FUSE = 0.15, CHAIN_FUSE_JITTER = 0.08; // blasts arm mines within r × 1.25 (OG game.js:16148-16150)
export const GRENADE_REACH = 3;           // grenade landing reach + 9.45 (OG game.js:16163)
export const ARROW_CHANCE = 0.5;          // arrow on bare ground near a mine (OG game.js:16164)
// Mine explosion (OG game.js:16151-16162). No killer (−1, game.js:16176).
export const MINE_BLAST = Object.freeze({ radius: 46, damage: 130, minFalloff: 0.2, push: 220, stun: 0.5, noiseRadius: 380, tossUp: 520, tossSpeed: 150, tossFrom: 0.35, hatChance: 0.6 });

export class MineField {
  constructor(W, H) {
    this.x = new Float32Array(MINE_CAP); this.y = new Float32Array(MINE_CAP);
    this.alive = new Uint8Array(MINE_CAP); this.fuse = new Float32Array(MINE_CAP).fill(-1);
    this.high = 0; this.free = []; this.count = 0; this.armed = 0; this.version = 0;
    this.cols = Math.max(1, Math.ceil(W / MINE_BUCKET)); this.rows = Math.max(1, Math.ceil(H / MINE_BUCKET));
    this.cellStart = new Int32Array(this.cols * this.rows + 1); this.items = new Int32Array(MINE_CAP); this.bucketed = -1;
  }
  // Field resize: new lookup buckets, every mine kept, even ones now outside the field (OG game.js:11691-11696, 5545).
  resize(W, H) {
    this.cols = Math.max(1, Math.ceil(W / MINE_BUCKET)); this.rows = Math.max(1, Math.ceil(H / MINE_BUCKET));
    this.cellStart = new Int32Array(this.cols * this.rows + 1); this.bucketed = -1; this.W = W; this.H = H;
  }
  // Small brush: one mine at the end point. Big brush: fixed jittered hex lattice points within r of the segment (OG 11697-11712).
  paint(x0, y0, x1, y1, r, allowed) {
    let n = 0;
    if (r < MINE_SMALL_BRUSH) { if (!this.crowded(x1, y1) && allowed(x1, y1) && this.add(x1, y1) >= 0) n++; return n; }
    const H = MINE_LATTICE_Y, Wd = MINE_LATTICE_X;
    const j0 = Math.floor((Math.min(y0, y1) - r) / H), j1 = Math.ceil((Math.max(y0, y1) + r) / H);
    const i0 = Math.floor((Math.min(x0, x1) - r) / Wd) - 1, i1 = Math.ceil((Math.max(x0, x1) + r) / Wd) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = (i + 0.5 * (j & 1) + (2 * latticeHash(i, j, 1) - 1) * MINE_JITTER) * Wd;
      const py = (j + (2 * latticeHash(i, j, 2) - 1) * MINE_JITTER) * H;
      if (segDist(px, py, x0, y0, x1, y1) > r) continue;
      if (!this.crowded(px, py) && allowed(px, py) && this.add(px, py) >= 0) n++;
    }
    return n;
  }
  crowded(x, y) { return this.nearest(x, y, MINE_SPACING, false) >= 0; }
  add(x, y) {
    const k = this.free.length > 0 ? this.free.pop() : this.high < MINE_CAP ? this.high++ : -1;
    if (k < 0) return -1;
    this.x[k] = x; this.y[k] = y; this.alive[k] = 1; this.fuse[k] = -1; this.count++; this.version++;
    return k;
  }
  remove(k) {
    if (this.alive[k] === 0) return;
    if (this.fuse[k] >= 0) this.armed--;
    this.alive[k] = 0; this.fuse[k] = -1; this.count--; this.free.push(k); this.version++;
  }
  // Armed mines can't be erased (OG game.js:11737-11746).
  erase(x0, y0, x1, y1, r) {
    if (this.count === 0) return 0;
    let n = 0;
    for (let k = 0; k < this.high; k++) {
      if (this.alive[k] === 0 || this.fuse[k] >= 0 || segDist(this.x[k], this.y[k], x0, y0, x1, y1) > r) continue;
      this.remove(k); n++;
    }
    return n;
  }
  clear() { this.alive.fill(0); this.fuse.fill(-1); this.free.length = 0; this.high = 0; this.count = 0; this.armed = 0; this.version++; }
  // Re-arming keeps the shorter fuse (OG game.js:11756-11759).
  arm(k, t) {
    if (this.alive[k] === 0) return;
    if (this.fuse[k] < 0) this.armed++; else t = Math.min(t, this.fuse[k]);
    this.fuse[k] = t;
  }
  // Nearest alive mine within r (unarmedOnly skips armed ones), or −1 (OG game.js:11760-11779).
  nearest(x, y, r, unarmedOnly) {
    if (this.count === 0) return -1;
    this.sync();
    let best = r * r, found = -1;
    const cx0 = this.cellX(x - r), cx1 = this.cellX(x + r), cy0 = this.cellY(y - r), cy1 = this.cellY(y + r);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = cy * this.cols + cx;
      for (let q = this.cellStart[c], e = this.cellStart[c + 1]; q < e; q++) {
        const k = this.items[q];
        if (this.alive[k] === 0 || (unarmedOnly && this.fuse[k] >= 0)) continue;
        const dx = this.x[k] - x, dy = this.y[k] - y, d = dx * dx + dy * dy;
        if (d > best) continue;
        best = d; found = k;
      }
    }
    return found;
  }
  // Unarmed mines within r into out[] (OG game.js:11780-11792).
  within(x, y, r, out) {
    out.length = 0;
    if (this.count === 0) return;
    this.sync();
    for (let cy = this.cellY(y - r); cy <= this.cellY(y + r); cy++) for (let cx = this.cellX(x - r); cx <= this.cellX(x + r); cx++) {
      const c = cy * this.cols + cx;
      for (let q = this.cellStart[c], e = this.cellStart[c + 1]; q < e; q++) {
        const k = this.items[q];
        if (this.alive[k] === 0 || this.fuse[k] >= 0) continue;
        if ((this.x[k] - x) ** 2 + (this.y[k] - y) ** 2 <= r * r) out.push(k);
      }
    }
  }
  // Does the segment pass within r of any mine? (nav straight-line test, OG game.js:11793-11813)
  blocks(x0, y0, x1, y1, r) {
    if (this.count === 0) return false;
    this.sync();
    const steps = Math.max(1, Math.ceil((2 * Math.hypot(x1 - x0, y1 - y0)) / MINE_BUCKET));
    let lx = -1, ly = -1;
    for (let s = 0; s <= steps; s++) {
      const cx = this.cellX(x0 + ((x1 - x0) * s) / steps), cy = this.cellY(y0 + ((y1 - y0) * s) / steps);
      if (cx === lx && cy === ly) continue;
      lx = cx; ly = cy;
      for (let j = Math.max(0, cy - 1); j <= Math.min(this.rows - 1, cy + 1); j++) for (let i = Math.max(0, cx - 1); i <= Math.min(this.cols - 1, cx + 1); i++) {
        const c = j * this.cols + i;
        for (let q = this.cellStart[c], e = this.cellStart[c + 1]; q < e; q++) {
          const k = this.items[q];
          if (this.alive[k] === 1 && segDist(this.x[k], this.y[k], x0, y0, x1, y1) < r) return true;
        }
      }
    }
    return false;
  }
  // Push a calm mine-aware unit off mines: solid discs of 13.45 + its radius (OG game.js:11815-11837; steering calls it).
  collide(u) {
    this.sync();
    const R = u.radius + MINE_AVOID;
    let x = u.x, y = u.y;
    for (let cy = this.cellY(y - R); cy <= this.cellY(y + R); cy++) for (let cx = this.cellX(x - R); cx <= this.cellX(x + R); cx++) {
      const c = cy * this.cols + cx;
      for (let q = this.cellStart[c], e = this.cellStart[c + 1]; q < e; q++) {
        const k = this.items[q];
        if (this.alive[k] === 0) continue;
        let dx = x - this.x[k], dy = y - this.y[k], d = Math.sqrt(dx * dx + dy * dy);
        if (d >= R) continue;
        if (d < 1e-4) { dx = 1; dy = 0; d = 1e-4; } else { dx /= d; dy /= d; }
        x += dx * (R - d); y += dy * (R - d);
        const vn = u.vx * dx + u.vy * dy;
        if (vn < 0) { u.vx -= vn * dx; u.vy -= vn * dy; }
      }
    }
    u.x = x; u.y = y;
  }
  cellX(x) { return Math.min(this.cols - 1, Math.max(0, Math.floor(x / MINE_BUCKET))); }
  cellY(y) { return Math.min(this.rows - 1, Math.max(0, Math.floor(y / MINE_BUCKET))); }
  sync() {
    if (this.bucketed === this.version) return;
    const st = this.cellStart, n = this.cols * this.rows;
    st.fill(0);
    for (let k = 0; k < this.high; k++) if (this.alive[k] === 1) st[this.cellY(this.y[k]) * this.cols + this.cellX(this.x[k]) + 1]++;
    for (let c = 0; c < n; c++) st[c + 1] += st[c];
    const total = st[n];
    for (let k = 0; k < this.high; k++) if (this.alive[k] === 1) this.items[--st[this.cellY(this.y[k]) * this.cols + this.cellX(this.x[k]) + 1]] = k;
    for (let c = 0; c < n; c++) st[c] = st[c + 1];
    st[n] = total; this.bucketed = this.version;
  }
}

// world.mines as a real MineField (CORE-A starts it as emptyMines(), same shape).
export function minesOf(world) {
  let m = world.mines;
  if (!(m instanceof MineField)) {
    m = new MineField(world.W, world.H); m.W = world.W; m.H = world.H;
    world.mines = m;
  } else if (m.W !== world.W || m.H !== world.H) m.resize(world.W, world.H);   // keep the mines (OG game.js:11691); was: a new empty field
  return m;
}

// ---------------------------------------------------------------- painting
// Allowed: inside the field, not a wall, water depth < 0.75 (shallow water and ice are fine) (OG game.js:5632-5646).
export function paintMines(world, x0, y0, x1, y1, r) {
  return minesOf(world).paint(x0, y0, x1, y1, r, (x, y) => x >= 0 && y >= 0 && x < world.W && y < world.H && !world.walls.isSolidAt(x, y) && depthAt(world, x, y) < DEEP);
}
export function eraseMines(world, x0, y0, x1, y1, r) { return minesOf(world).erase(x0, y0, x1, y1, r); }

// ---------------------------------------------------------------- who is careful
// Mine-aware (def.mines, else Trained) and calm: not burning, not fleeing, not stunned, traction ≥ 0.5 (OG game.js:13840-13854).
export function mineCalm(world, u) {
  const def = u.def, aware = def.mineAware !== undefined ? def.mineAware : (def.mines !== undefined && def.mines !== null ? !!def.mines : def.intelligence >= 2);
  return aware && !(u.burning > 0 || u.state === STATE.FLEE) && !(u.stun > 0) && traction(world, u, def) >= TRACTION_CALM;
}

// ---------------------------------------------------------------- triggers
// Arm the nearest unarmed mine within reach + 9.45 (OG game.js:16190-16194).
export function armNearest(world, x, y, reach, type) {
  const M = minesOf(world), k = M.nearest(x, y, reach + MINE_TRIGGER, true);
  if (k < 0) return false;
  M.arm(k, MINE_FUSE);
  world.emit('minearm', { x: M.x[k], y: M.y[k], v: 1, type });
  return true;
}
export function grenadeLanded(world, x, y) { if (minesOf(world).count > 0) armNearest(world, x, y, GRENADE_REACH, -1); } // OG 16195-16197
export function propLanded(world, u) { // a prop of mass ≥ 0.7 landing after a toss (OG game.js:16198-16201)
  if (minesOf(world).count > 0 && u.def.prop && u.mass >= MINE_MASS) armNearest(world, u.x, u.y, u.radius, u.type);
}
export function arrowLanded(world, x, y) { // arrow on bare ground within 9.45 px: 50 % (OG game.js:16202-16204)
  const M = minesOf(world);
  if (M.count > 0 && M.nearest(x, y, MINE_TRIGGER, true) >= 0 && world.rng() < ARROW_CHANCE) armNearest(world, x, y, 0, -1);
}
const chainTmp = [];
// Any blast arms unarmed mines within radius × 1.25 with fuse 0.15 ± 0.08 s (OG game.js:16205-16209).
export function armMinesNear(world, x, y, radius) {
  const M = minesOf(world);
  if (M.count === 0) return;
  M.within(x, y, radius * CHAIN_R, chainTmp);
  for (const k of chainTmp) M.arm(k, CHAIN_FUSE + (2 * world.rng() - 1) * CHAIN_FUSE_JITTER);
  chainTmp.length = 0;
}

// ---------------------------------------------------------------- system (tick step 10, OG game.js:16165-16189)
export function run(world) {
  // Fallback until createGame calls report.watch(world) after each tick: the end-of-battle watch must run every tick.
  // Calling it twice in one tick changes nothing (sampling is 0.25 s gated, the result only fires on a change).
  watchBattle(world);
  const M = minesOf(world);
  if (M.count === 0) return;
  if (M.armed > 0) {
    for (let k = 0; k < M.high; k++) {
      if (M.alive[k] === 0 || M.fuse[k] < 0) continue;
      M.fuse[k] -= DT;
      if (M.fuse[k] > 0) continue;
      const x = M.x[k], y = M.y[k];
      M.remove(k);
      deps.explode(world, x, y, MINE_BLAST, -1);
    }
  }
  const us = world.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || u.hp <= 0 || u.z > 0 || u.vz > 0 || leapOf(u) !== 0 || climbOf(u) > 0 || u.mass < MINE_MASS) continue;
    if (u.def.prop || mineCalm(world, u)) continue;
    armNearest(world, u.x, u.y, u.radius, u.type);
  }
}

// ---------------------------------------------------------------- createGame tool contract
export function paint(world, x0, y0, x1, y1, r) { return paintMines(world, x0, y0, x1, y1, r); }
export function erase(world, x0, y0, x1, y1, r) { return eraseMines(world, x0, y0, x1, y1, r); }
export function clear(world) { minesOf(world).clear(); }
