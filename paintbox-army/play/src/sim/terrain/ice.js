// Ice: painting, harm (cracks at hp 0.8 and 0.4, breaks at 0), the grip/slip helpers, and the ice system (tick step 16).
// Broken ice floods the tile with water unless it was already deep; units on a broken deep tile are stunned 0.5 s.
// OG module 1078 (game.js:1048-1143), system game.js:5247-5332, grip game.js:13538, 13786-13790, 13837-13839.
import { DT, DEEP } from '../const.js';
import { terrainOf, forCapsule, recountIce, cellOf, cellX, cellY, wipeIce, ICE_HP, CRACK, climbOf, leapOf, airborne } from './grid.js';
import { flood } from './water.js';
import { deps } from './deps.js';
import './hooks.js';

export { ICE_HP, CRACK };
export const ICE_GRIP = 0.2;              // default iceGrip (OG game.js:13538)
export const ICE_ACCEL_MIN = 0.35;        // speeding up uses accel × max(grip, 0.35) (OG game.js:13539, 13786-13789)
export const TRACTION_CALM = 0.5;         // traction ≥ 0.5 keeps mine avoidance on (OG game.js:13540, 13852)
export const OIL_GRIP_CUT = 0.9, OIL_GRIP_FULL = 0.25; // oil: 1 − 0.9 × min(1, slick / 0.25) (OG game.js:13536-13537, 13835)
export const SLIP_GRIP = 0.5, SLIP_SPEED = 70, SLIP_RATE = 0.3; // falls if grip < 0.5, speed > 70, chance 0.3·dt (OG game.js:5279-5286)
export const BURN_MELT = 0.25;            // burning unit melts 0.25/s under it (OG game.js:5275-5277)
export const HEAVY_MASS = 5, HEAVY_CRACK = 0.05; // mass ≥ 5 over deep water: (mass / 5) × 0.05 per s (OG game.js:5278)
export const OIL_MELT = 0.6;              // burning oil melts 0.6/s per tile (OG game.js:5255-5263)
export const BREAK_SPLASH = 0.35;         // broken tiles over deep water splash 35 % of the time (OG game.js:5314)
export const BREAK_STUN = 0.5;            // unit on a broken deep tile (OG game.js:5327)
export const LAND_ICE = { ref: 400, over: 1, mul: 0.3, edge: 0.5 }; // landing: mass·speed/400 > 1 → (that − 1) × 0.3, edge 0.5 (OG game.js:13498-13511)

// ---------------------------------------------------------------- painting
let _T = null, _v = 0, _n = 0;
function paintTile(i) { if (_T.iceHp[i] !== _v) { _T.iceHp[i] = _v; _n++; } }
// Ice hp 1 (0 when erasing) within max(r, 4) px of the segment, over land or water. Erasing is not breaking: no meltwater
// (OG game.js:1082-1109, 7713).
export function paintIce(world, x0, y0, x1, y1, r, erase = false) {
  const T = terrainOf(world);
  _T = T; _v = erase ? 0 : ICE_HP; _n = 0;
  forCapsule(T, x0, y0, x1, y1, r, paintTile);
  const n = _n; _T = null;
  if (n > 0) recountIce(world, T);
  return n;
}

// ---------------------------------------------------------------- harm (OG game.js:1110-1135)
// Tiles within max(r, 4) px lose amount × (1 − (d/r) × (1 − edge)): full at the centre, × edge at the rim.
// Passing 0.8 or 0.4 queues a crack; reaching 0 breaks the tile (handled in the ice system). Returns true if any tile was hit.
export function harmIce(world, x, y, r, amount, edge = 1) {
  if (world.iceCells === 0 || amount <= 0) return false;
  const T = terrainOf(world), t = T.tile, h = Math.max(r, 0.5 * t), hp = T.iceHp;
  const c0 = Math.max(0, Math.floor((x - h) * T.inv)), c1 = Math.min(T.cols - 1, Math.floor((x + h) * T.inv));
  const r0 = Math.max(0, Math.floor((y - h) * T.inv)), r1 = Math.min(T.rows - 1, Math.floor((y + h) * T.inv));
  let any = false;
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    const i = ty * T.cols + tx;
    if (hp[i] <= 0) continue;
    const d = Math.hypot((tx + 0.5) * t - x, (ty + 0.5) * t - y);
    if (d > h) continue;
    const before = hp[i];
    hp[i] -= amount * (1 - (d / h) * (1 - edge));
    if ((before > CRACK && hp[i] <= CRACK) || (before > CRACK / 2 && hp[i] <= CRACK / 2)) T.cracked.push(i);
    any = true;
    if (hp[i] <= 0) { hp[i] = 0; world.iceCells--; T.broken.push(i); }
  }
  if (any) T.iceVersion++;
  return any;
}
// A tossed unit landing hard cracks ice (OG game.js:13506-13511, called at 9121).
export function iceLanding(world, x, y, r, mass, speed) {
  const impact = (mass * speed) / LAND_ICE.ref;
  if (world.iceCells > 0 && impact > LAND_ICE.over) harmIce(world, x, y, r, (impact - LAND_ICE.over) * LAND_ICE.mul, LAND_ICE.edge);
}

// ---------------------------------------------------------------- grip helpers (steering reads these)
export function iceHpAt(world, x, y) { if (world.iceCells === 0) return 0; const T = terrainOf(world), i = cellOf(T, x, y); return i < 0 ? 0 : T.iceHp[i]; }
// On ice: ice under the unit, not a prop, not aquatic (OG game.js:13837-13839).
export function onIce(world, u, def = u.def) { return world.iceCells > 0 && !def.prop && !def.aquatic && iceHpAt(world, u.x, u.y) > 0; }
export function iceGrip(def) { return def.iceGrip !== undefined && def.iceGrip !== null ? def.iceGrip : ICE_GRIP; }
// Traction = oil factor × (ice grip when on ice) (OG game.js:13834-13854).
export function traction(world, u, def = u.def) {
  const oil = deps.oil(world);
  const g = oil && oil.cells > 0 && !def.prop ? 1 - OIL_GRIP_CUT * Math.min(1, oil.slickAt(u.x, u.y) / OIL_GRIP_FULL) : 1;
  return onIce(world, u, def) ? g * iceGrip(def) : g;
}

// ---------------------------------------------------------------- system (tick step 16)
const floodTmp = [];
export function run(world) {
  const T = terrainOf(world);
  if (world.iceCells === 0 && T.broken.length === 0 && T.cracked.length === 0) return;
  const us = world.units, oil = deps.oil(world), t = T.tile;
  // Burning oil melts the ice above it (OG game.js:5252-5264).
  if (oil && oil.burning > 0 && world.iceCells > 0) {
    for (let i = 0; i < T.iceHp.length; i++) {
      if (T.iceHp[i] <= 0) continue;
      const cx = cellX(T, i), cy = cellY(T, i);
      if (!oil.burningAt(cx, cy)) continue;
      harmIce(world, cx, cy, 0.5 * t, OIL_MELT * DT);
      if (world.rng() < 1.5 * DT * 0.2) world.emit('puff', { kind: 'steam', x: cx, y: cy, ang: -Math.PI / 2, size: 0.7 });
    }
  }
  // Units on ice: burning melts, heavy over deep water cracks, fast low-grip units slip (OG game.js:5265-5287).
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || u.hp <= 0 || world.iceCells === 0) continue;
    const def = u.def;
    if (def.aquatic || airborne(u) || climbOf(u) > 0) continue;
    const x = u.x, y = u.y;
    if (iceHpAt(world, x, y) <= 0) continue;
    if (u.burning > 0) {
      harmIce(world, x, y, u.radius, BURN_MELT * DT);
      if (world.rng() < 1.5 * DT) world.emit('puff', { kind: 'steam', x, y, ang: -Math.PI / 2, size: 0.6 });
    }
    if (u.mass >= HEAVY_MASS && depthUnderTile(T, x, y) >= DEEP) harmIce(world, x, y, u.radius, (u.mass / HEAVY_MASS) * HEAVY_CRACK * DT);
    if (def.prop || def.hopper || leapOf(u) !== 0 || iceGrip(def) >= SLIP_GRIP) continue;
    const sp = Math.hypot(u.vx, u.vy);
    if (sp > SLIP_SPEED && world.rng() < SLIP_RATE * DT) deps.slipIce(world, u, sp);
  }
  // One crack sound per tick, size 2 once hp ≤ 0.4 (OG game.js:5288-5296).
  if (T.cracked.length > 0) {
    const i = T.cracked[0];
    world.emit('icecrack', { x: cellX(T, i), y: cellY(T, i), v: T.iceHp[i] <= CRACK / 2 ? 2 : 1 });
    T.cracked.length = 0;
  }
  if (T.broken.length > 0) breakIce(world, T, us);
}

function depthUnderTile(T, x, y) { const i = cellOf(T, x, y); return i < 0 ? 0 : T.level[i]; }

// Broken tiles (OG game.js:5297-5332): deep water underneath splashes (35 %), anything else floods to depth 1.
// Units standing on a broken deep tile are stunned 0.5 s.
function breakIce(world, T, us) {
  floodTmp.length = 0;
  let sx = 0, sy = 0;
  for (const i of T.broken) {
    const cx = cellX(T, i), cy = cellY(T, i);
    sx += cx; sy += cy;
    if (T.level[i] >= DEEP) { if (world.rng() < BREAK_SPLASH) world.emit('puff', { kind: 'splash', x: cx, y: cy, ang: -Math.PI / 2, size: 0.6 }); }
    else floodTmp.push(i);
  }
  const n = T.broken.length;
  world.emit('icebreak', { x: sx / n, y: sy / n, v: Math.min(3, n / 4) });
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || u.hp <= 0 || airborne(u) || climbOf(u) > 0) continue;
    const def = u.def;
    if (def.aquatic || def.prop) continue;
    const c = cellOf(T, u.x, u.y);
    if (c < 0 || !T.broken.includes(c) || T.level[c] < DEEP) continue;
    deps.stun(world, u, BREAK_STUN);
    world.emit('puff', { kind: 'splash', x: u.x, y: u.y, ang: -Math.PI / 2, size: 0.8 + u.radius / 15 });
    world.emit('splash', { x: u.x, y: u.y, v: 0.6 + u.radius / 20, type: u.type });
  }
  T.broken.length = 0;
  if (floodTmp.length > 0) flood(world, floodTmp);
}

// ---------------------------------------------------------------- createGame tool contract
export function paint(world, x0, y0, x1, y1, r) { return paintIce(world, x0, y0, x1, y1, r, false); }
export function erase(world, x0, y0, x1, y1, r) { return paintIce(world, x0, y0, x1, y1, r, true); }
export function clear(world) { wipeIce(world, terrainOf(world)); }
