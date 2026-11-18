// Banana peels: the peel field (world.peels), painting, erasing, the slip (toss + stun), kicks, blasts and the
// peel system (tick step 11). Never used up: a peel that trips someone is kicked away and stays on the field.
// OG modules 1072 (system, game.js:21-106) and 1073 (field, game.js:107-232).
import { DT, DEEP, QUERY_MARGIN } from '../const.js';
import { segDist, latticeHash, climbOf, leapOf } from './grid.js';
import { depthAt, frozenAt } from './water.js';
import { deps } from './deps.js';
import './hooks.js';

export const PEEL_REACH = 6;              // trip zone 6 px + radius × 1; also the field-edge margin (OG game.js:135, 73)
export const PEEL_RADIUS_MUL = 1;         // OG game.js:38 (y)
export const PEEL_CAP = 1024;             // OG game.js:137
export const PEEL_SPACING2 = 256;         // no peel within 16 px (distance² < 256) (OG game.js:169-173)
export const PEEL_SMALL_BRUSH = 20;       // brush < 20: one peel at the pointer (OG game.js:155)
export const PEEL_LATTICE_X = 40, PEEL_LATTICE_Y = 34.64, PEEL_JITTER = 0.3; // OG game.js:136, 157, 164
export const SLIP_MIN_SPEED = 20;         // OG game.js:37 (v)
export const SLIP_OUT = 70, SLIP_UP = 260, SLIP_STUN = 0.9; // toss along travel, ground stun ≥ 0.9 s (OG game.js:39-41, 102-105)
export const KICK_COOL = 0.6, KICK_SPEED = 170, KICK_SPREAD = 0.6; // kicked opposite the slip ±0.6 rad, 170 px/s (OG game.js:42, 76, 200-203)
export const PEEL_SPLASH = 0.35;          // OG game.js:43 (S)
export const SLIDE_DRAG = 4, SLIDE_DRAG_AFLOAT = 12, SLIDE_STOP2 = 25; // ×max(0, 1 − 4·dt), afloat 12; stop below 5 px/s (OG game.js:207-226)
export const BLAST_REACH = 1.2, BLAST_FLING = 420; // explosions push peels within r × 1.2 at 420 × (1 − d / 1.2r) (OG game.js:81-99)

export class PeelField {
  constructor() {
    const n = PEEL_CAP;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.angle = new Float32Array(n); this.cool = new Float32Array(n); this.afloat = new Uint8Array(n); this.alive = new Uint8Array(n);
    this.high = 0; this.free = []; this.count = 0; this.dropped = 0;
  }
  paint(x0, y0, x1, y1, r, allowed) {
    let n = 0;
    if (r < PEEL_SMALL_BRUSH) { if (!this.crowded(x1, y1) && allowed(x1, y1) && this.add(x1, y1) >= 0) n++; return n; }
    const H = PEEL_LATTICE_Y, Wd = PEEL_LATTICE_X;
    const j0 = Math.floor((Math.min(y0, y1) - r) / H), j1 = Math.ceil((Math.max(y0, y1) + r) / H);
    const i0 = Math.floor((Math.min(x0, x1) - r) / Wd) - 1, i1 = Math.ceil((Math.max(x0, x1) + r) / Wd) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = (i + 0.5 * (j & 1) + PEEL_JITTER * (2 * latticeHash(i, j, 1) - 1)) * Wd;
      const py = (j + PEEL_JITTER * (2 * latticeHash(i, j, 2) - 1)) * H;
      if (segDist(px, py, x0, y0, x1, y1) > r) continue;
      if (!this.crowded(px, py) && allowed(px, py) && this.add(px, py) >= 0) n++;
    }
    return n;
  }
  crowded(x, y) {
    for (let k = 0; k < this.high; k++) if (this.alive[k] === 1 && (this.x[k] - x) ** 2 + (this.y[k] - y) ** 2 < PEEL_SPACING2) return true;
    return false;
  }
  add(x, y) {
    const k = this.free.length > 0 ? this.free.pop() : this.high < PEEL_CAP ? this.high++ : -1;
    if (k < 0) return -1;
    this.x[k] = x; this.y[k] = y; this.vx[k] = this.vy[k] = 0; this.cool[k] = 0; this.afloat[k] = 0;
    this.angle[k] = ((0.618034 * this.dropped++) % 1) * Math.PI * 2;   // look only (OG game.js:182)
    this.alive[k] = 1; this.count++;
    return k;
  }
  erase(x0, y0, x1, y1, r) {
    if (this.count === 0) return 0;
    let n = 0;
    for (let k = 0; k < this.high; k++) {
      if (this.alive[k] === 0 || segDist(this.x[k], this.y[k], x0, y0, x1, y1) > r) continue;
      this.alive[k] = 0; this.count--; this.free.push(k); n++;
    }
    return n;
  }
  clear() { this.alive.fill(0); this.free.length = 0; this.high = 0; this.count = 0; }
  // Slide away opposite the slipper's motion, ±spread rad (OG game.js:198-202).
  kick(k, dx, dy, cool, spread) {
    const a = Math.atan2(-dy, -dx) + spread;
    this.vx[k] = KICK_SPEED * Math.cos(a); this.vy[k] = KICK_SPEED * Math.sin(a); this.cool[k] = cool;
  }
  fling(k, dx, dy, s) { this.vx[k] += dx * s; this.vy[k] += dy * s; }
  // Slide, stop at walls, keep 6 px inside the field, drag, stop below 5 px/s (OG game.js:204-224).
  step(dt, W, H, solidAt) {
    const drag = Math.max(0, 1 - SLIDE_DRAG * dt), dragFloat = Math.max(0, 1 - SLIDE_DRAG_AFLOAT * dt);
    for (let k = 0; k < this.high; k++) {
      if (this.alive[k] === 0) continue;
      if (this.cool[k] > 0) this.cool[k] -= dt;
      if (this.vx[k] === 0 && this.vy[k] === 0) continue;
      const nx = Math.min(W - PEEL_REACH, Math.max(PEEL_REACH, this.x[k] + this.vx[k] * dt));
      const ny = Math.min(H - PEEL_REACH, Math.max(PEEL_REACH, this.y[k] + this.vy[k] * dt));
      if (solidAt(nx, ny)) { this.vx[k] = this.vy[k] = 0; continue; }
      this.angle[k] += (Math.hypot(this.vx[k], this.vy[k]) / KICK_SPEED) * 12 * dt;
      this.x[k] = nx; this.y[k] = ny;
      const f = this.afloat[k] === 1 ? dragFloat : drag;
      this.vx[k] *= f; this.vy[k] *= f;
      if (this.vx[k] * this.vx[k] + this.vy[k] * this.vy[k] < SLIDE_STOP2) this.vx[k] = this.vy[k] = 0;
    }
  }
}

export function peelsOf(world) {
  if (!(world.peels instanceof PeelField)) world.peels = new PeelField();
  return world.peels;
}

// ---------------------------------------------------------------- painting
// Allowed: inside the field, not a wall (water is fine). New peels on deep open water start afloat (OG game.js:5648-5665).
export function paintPeels(world, x0, y0, x1, y1, r) {
  const P = peelsOf(world), before = P.high;
  const wasAlive = P.alive.slice(0, before);
  const n = P.paint(x0, y0, x1, y1, r, (x, y) => x >= 0 && y >= 0 && x < world.W && y < world.H && !world.walls.isSolidAt(x, y));
  if (n > 0 && world.waterCells > 0)
    for (let k = 0; k < P.high; k++)
      if (P.alive[k] === 1 && (k >= wasAlive.length || wasAlive[k] === 0) && depthAt(world, P.x[k], P.y[k]) >= DEEP && !frozenAt(world, P.x[k], P.y[k])) P.afloat[k] = 1;
  return n;
}
export function erasePeels(world, x0, y0, x1, y1, r) { return peelsOf(world).erase(x0, y0, x1, y1, r); }

// Explosion: push peels within radius × 1.2 (OG game.js:81-99). CORE-B calls this through the peelsBlast hook.
export function peelsBlast(world, x, y, radius) {
  const P = peelsOf(world), reach = radius * BLAST_REACH;
  if (P.count === 0) return;
  for (let k = 0; k < P.high; k++) {
    if (P.alive[k] === 0) continue;
    let dx = P.x[k] - x, dy = P.y[k] - y;
    const d = Math.hypot(dx, dy);
    if (d >= reach) continue;
    if (d < 0.001) { const a = world.rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
    P.fling(k, dx, dy, BLAST_FLING * (1 - d / reach));
  }
}

// The slip: toss along travel at 70 / 260, then a ground stun of at least 0.9 s if still on the ground (OG game.js:100-105).
export function slipOnPeel(world, u, dx, dy) {
  deps.toss(world, u, dx, dy, SLIP_OUT, SLIP_UP);
  if (u.z <= 0 && u.vz <= 0) u.stun = Math.max(u.stun || 0, SLIP_STUN);
}

// ---------------------------------------------------------------- system (tick step 11, OG game.js:45-80)
let _w = null, _px = 0, _py = 0, _hit = null, _water = false;
function tripTest(u) {
  if (u.dead || u.hp <= 0 || u.z > 0 || u.vz > 0 || leapOf(u) !== 0 || climbOf(u) > 0) return false;
  const def = u.def;
  if (def.prop || (def.aquatic && _water && depthAt(_w, u.x, u.y) >= DEEP)) return false;
  const sp = Math.hypot(u.vx, u.vy);
  if (sp < SLIP_MIN_SPEED) return false;
  const reach = PEEL_REACH + u.radius * PEEL_RADIUS_MUL;
  if ((u.x - _px) ** 2 + (u.y - _py) ** 2 > reach * reach) return false;
  _hit = u; return true;
}

export function run(world) {
  const P = peelsOf(world);
  if (P.count === 0) return;
  P.step(DT, world.W, world.H, (x, y) => world.walls.isSolidAt(x, y));
  const water = world.waterCells > 0;
  for (let k = 0; k < P.high; k++) {
    if (P.alive[k] === 0) continue;
    const x = P.x[k], y = P.y[k];
    const afloat = water && depthAt(world, x, y) >= DEEP && !frozenAt(world, x, y) ? 1 : 0;
    if (afloat === 1 && P.afloat[k] === 0) {          // drifted onto deep water: one splash, then it floats (OG game.js:53-61)
      world.emit('puff', { kind: 'splash', x, y, ang: -Math.PI / 2, size: PEEL_SPLASH });
      world.emit('splash', { x, y, v: PEEL_SPLASH });
    }
    P.afloat[k] = afloat;
    if (afloat === 1 || P.cool[k] > 0) continue;
    _w = world; _px = x; _py = y; _hit = null; _water = water;
    world.query(x, y, PEEL_REACH + QUERY_MARGIN, tripTest);
    const u = _hit; _w = null; _hit = null;
    if (!u) continue;
    const sp = Math.hypot(u.vx, u.vy), dx = u.vx / sp, dy = u.vy / sp;
    slipOnPeel(world, u, dx, dy);
    P.kick(k, dx, dy, KICK_COOL, KICK_SPREAD * (2 * world.rng() - 1));
    world.emit('slip', { x, y, v: 1, type: u.type });
  }
}

// ---------------------------------------------------------------- createGame tool contract
export function paint(world, x0, y0, x1, y1, r) { return paintPeels(world, x0, y0, x1, y1, r); }
export function erase(world, x0, y0, x1, y1, r) { return erasePeels(world, x0, y0, x1, y1, r); }
export function clear(world) { peelsOf(world).clear(); }
