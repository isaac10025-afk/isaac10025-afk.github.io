// Oil: the ground fire grid (OG module 549, game.js:13121-13322) and the oil system (game.js:5229-5244).
// world.oil is created lazily: pour(x,y,amount) (barrels), slickAt, burningAt, ignite(x,y,r), awayFromFire.
import { DT, WET, initCombat, isAirborne, rnd, hypot, solidAt, depthAt } from './env.js';
import { igniteNow, BURN_BASE, quenchAll } from './fire.js';
import { slip } from './status.js';

export const OIL_TILE = 6;            // OG game.js:13121
export const SLICK = 0.08;            // OG game.js:13122: a cell is a slick at >= 0.08
export const FLOW_AT = 0.3;           // OG game.js:13249: spreads above 0.3 ...
export const FLOW_AT_WATER = 0.1;     // ... or 0.1 over water
export const FLOW_RATE = 5;           // OG game.js:13263: moves min(excess, 5·excess·dt)
export const DIAG = 0.62;             // OG game.js:13318
export const BURN_LOSS = 0.025;       // OG game.js:13281: per s
export const BURN_OUT = 0.015;        // OG game.js:13281
export const SPREAD_RATE = 9;         // OG game.js:13289: hash < 9·dt
export const UNIT_LIGHT_R = 6;        // OG game.js:5238 (D.a)
export const SLIP_OIL_SPEED = 55, SLIP_OIL_RATE = 0.9; // OG game.js:5240-5242

const NX = [1, -1, 0, 0, 1, 1, -1, -1], NY = [0, 0, 1, -1, 1, -1, 1, -1], NW = [1, 1, 1, 1, DIAG, DIAG, DIAG, DIAG];
function hash01(a, b) { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; }

export class OilGrid {
  constructor(W, H) {
    this.tile = OIL_TILE; this.cols = Math.max(1, Math.ceil(W / OIL_TILE)); this.rows = Math.max(1, Math.ceil(H / OIL_TILE));
    const n = this.cols * this.rows;
    this.amount = new Float32Array(n); this.next = new Float32Array(n); this.fire = new Uint8Array(n); this.grain = new Float32Array(n);
    for (let i = 0; i < n; i++) this.grain[i] = 0.3 + 0.7 * hash01(i, 7);   // per-cell grain 0.3-1.0 (OG game.js:13153-13155)
    this.cells = 0; this.present = 0; this.burning = 0; this.version = 0; this.ticks = 0;
    this.x0 = 1; this.y0 = 1; this.x1 = 0; this.y1 = 0;
  }
  // Field resize: same tile count keeps the oil; a new tile count makes fresh grids and clears (OG game.js:13143-13158).
  resize(W, H) {
    this.W = W; this.H = H;
    const cols = Math.max(1, Math.ceil(W / OIL_TILE)), rows = Math.max(1, Math.ceil(H / OIL_TILE));
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols; this.rows = rows; const n = cols * rows;
    this.amount = new Float32Array(n); this.next = new Float32Array(n); this.fire = new Uint8Array(n); this.grain = new Float32Array(n);
    for (let i = 0; i < n; i++) this.grain[i] = 0.3 + 0.7 * hash01(i, 7);
    this.clear();
  }
  clear() { this.amount.fill(0); this.fire.fill(0); this.cells = this.present = this.burning = 0; this.x0 = this.y0 = 1; this.x1 = this.y1 = 0; this.version++; }
  cellOf(x, y) { const i = Math.floor(x / this.tile), j = Math.floor(y / this.tile); return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i; }
  grow(i, j) { if (this.x0 > this.x1) { this.x0 = this.x1 = i; this.y0 = this.y1 = j; return; } if (i < this.x0) this.x0 = i; if (i > this.x1) this.x1 = i; if (j < this.y0) this.y0 = j; if (j > this.y1) this.y1 = j; }
  pour(x, y, amt) { const c = this.cellOf(x, y); if (c < 0) return; this.amount[c] += amt; this.present = Math.max(1, this.present); this.grow(c % this.cols, Math.floor(c / this.cols)); this.version++; }
  slickAt(x, y) { if (this.cells === 0) return 0; const c = this.cellOf(x, y); return c < 0 || this.amount[c] < SLICK ? 0 : this.amount[c]; }
  burningAt(x, y) { if (this.burning === 0) return false; const c = this.cellOf(x, y); return c >= 0 && this.fire[c] === 1; }
  // Light slick cells whose centre is within r (OG game.js:13193-13210).
  ignite(x, y, r) {
    if (this.cells === 0) return false;
    const t = this.tile, i0 = Math.max(0, Math.floor((x - r) / t)), i1 = Math.min(this.cols - 1, Math.floor((x + r) / t));
    const j0 = Math.max(0, Math.floor((y - r) / t)), j1 = Math.min(this.rows - 1, Math.floor((y + r) / t));
    let lit = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * this.cols + i;
      if (this.fire[c] === 1 || this.amount[c] < SLICK) continue;
      const dx = (i + 0.5) * t - x, dy = (j + 0.5) * t - y;
      if (dx * dx + dy * dy <= r * r) { this.fire[c] = 1; this.burning++; lit = true; }
    }
    if (lit) this.version++;
    return lit;
  }
  // Push-away vector from burning cells within r (OG game.js:13211-13234), every 2nd cell.
  awayFromFire(x, y, r, out) {
    if (this.burning === 0) return false;
    const t = this.tile, i0 = Math.max(this.x0, Math.floor((x - r) / t)), i1 = Math.min(this.x1, Math.floor((x + r) / t));
    const j0 = Math.max(this.y0, Math.floor((y - r) / t)), j1 = Math.min(this.y1, Math.floor((y + r) / t));
    let sx = 0, sy = 0, any = false;
    for (let j = j0; j <= j1; j += 2) for (let i = i0; i <= i1; i += 2) {
      if (this.fire[j * this.cols + i] === 0) continue;
      const dx = x - (i + 0.5) * t, dy = y - (j + 0.5) * t, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r) continue;
      const w = (1 - d / r) / (d + 1); sx += dx * w; sy += dy * w; any = true;
    }
    out[0] = sx; out[1] = sy; return any;
  }
  // Flow + burn, one tick (OG game.js:13235-13304).
  step(world, dt) {
    if (this.present === 0 && this.x0 > this.x1) return;
    const { cols, rows, amount: a, next: nx, fire, grain } = this, t = this.tile;
    const xa = Math.max(0, this.x0 - 1), xb = Math.min(cols - 1, this.x1 + 1), ya = Math.max(0, this.y0 - 1), yb = Math.min(rows - 1, this.y1 + 1);
    for (let j = ya; j <= yb; j++) nx.set(a.subarray(j * cols + xa, j * cols + xb + 1), j * cols + xa);
    let changed = false;
    for (let j = ya; j <= yb; j++) for (let i = xa; i <= xb; i++) {
      const c = j * cols + i, v = a[c];
      const thr = v > FLOW_AT_WATER && depthAt(world, (i + 0.5) * t, (j + 0.5) * t) >= WET ? FLOW_AT_WATER : FLOW_AT;
      if (v <= thr) continue;
      let tot = 0;
      for (let k = 0; k < 8; k++) {
        const ii = i + NX[k], jj = j + NY[k];
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows || solidAt(world, (ii + 0.5) * t, (jj + 0.5) * t)) continue;
        const drop = v - a[jj * cols + ii];
        if (drop > 0) tot += drop * grain[jj * cols + ii] * NW[k];
      }
      if (tot <= 0) continue;
      const move = Math.min(v - thr, FLOW_RATE * (v - thr) * dt);
      for (let k = 0; k < 8; k++) {
        const ii = i + NX[k], jj = j + NY[k];
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows || solidAt(world, (ii + 0.5) * t, (jj + 0.5) * t)) continue;
        const n = jj * cols + ii, drop = v - a[n];
        if (drop <= 0) continue;
        const q = (move * drop * grain[n] * NW[k]) / tot;
        nx[n] += q; nx[c] -= q;
        if (nx[n] >= SLICK) this.grow(ii, jj);
      }
      changed = true;
    }
    let burning = 0;
    this.ticks++;
    if (this.burning > 0) {
      for (let j = ya; j <= yb; j++) for (let i = xa; i <= xb; i++) {
        const c = j * cols + i;
        if (fire[c] === 0) continue;
        nx[c] -= BURN_LOSS * dt;
        if (nx[c] < BURN_OUT) { nx[c] = 0; fire[c] = 0; continue; }
        burning++;
        for (let k = 0; k < 4; k++) {
          const ii = i + NX[k], jj = j + NY[k];
          if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
          const n = jj * cols + ii;
          if (fire[n] === 0 && a[n] > BURN_OUT && hash01(n, this.ticks) < SPREAD_RATE * dt) { fire[n] = 1; burning++; }
        }
      }
      changed = true;
    }
    this.burning = burning;
    let cells = 0, present = 0;
    for (let j = ya; j <= yb; j++) for (let i = xa; i <= xb; i++) { const c = j * cols + i; a[c] = nx[c]; if (a[c] >= SLICK) cells++; if (a[c] > 0) present++; }
    this.cells = cells; this.present = present;
    if (present === 0) { this.x0 = this.y0 = 1; this.x1 = this.y1 = 0; }
    if (changed) this.version++;
  }
}

export function getOil(world) {
  let o = world.oil;
  if (!o) { o = world.oil = new OilGrid(world.W || 800, world.H || 600); o.W = world.W; o.H = world.H; }
  else if (o.W !== world.W || o.H !== world.H) o.resize(world.W, world.H);   // OG resizes in place (game.js:5546, 13143)
  return o;
}
// Module-level reads used by CORE-A steering (oil grip, fire escape) and by TERRAIN barrels (pour).
export function slickAt(world, x, y) { return getOil(world).slickAt(x, y); }
export function burningAt(world, x, y) { return getOil(world).burningAt(x, y); }
export function awayFromFire(world, x, y, r, out) { return getOil(world).awayFromFire(x, y, r, out); }
export function pour(world, x, y, amount) { getOil(world).pour(x, y, amount); }
export function igniteOil(world, x, y, r) { return getOil(world).ignite(x, y, r); }

// Oil system (OG game.js:5229-5244), then the water quench (OG water system game.js:717-733; see fire.js quenchAll).
export function run(world) {
  const oil = getOil(world);
  oil.step(world, DT);
  if (oil.cells > 0) {
    const us = world.units;
    for (let k = 0; k < us.length; k++) {
      const u = us[k];
      if (u.dead || u.hp <= 0) continue;
      initCombat(u);
      if (isAirborne(u) || (u.leaping | 0) !== 0) continue;
      if (oil.slickAt(u.x, u.y) === 0) continue;
      if (oil.burningAt(u.x, u.y)) igniteNow(world, u, BURN_BASE);           // OG game.js:5238
      else if (u.burning > 0) oil.ignite(u.x, u.y, UNIT_LIGHT_R);
      const d = u.def;
      if (d.prop || d.hopper) continue;
      const sp = hypot(u.vx, u.vy);
      if (sp > SLIP_OIL_SPEED && rnd(world) < SLIP_OIL_RATE * DT) slip(world, u, sp, 'oil'); // OG game.js:5240-5242
    }
  }
  world.oilCells = oil.cells; world.oilBurning = oil.burning;               // counts read by CORE-A steering
  quenchAll(world);
}
