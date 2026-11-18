// Walls: painting, erasing, blast damage and rat gnawing on CORE-A's world.walls tiles (8 px, hp 100).
// Collision, raycast and line of sight already live on world.walls (CORE-A). OG module 1077 (game.js:762-1016).
import { WALL_BRUSH_SCALE } from '../const.js';
import './hooks.js';

export const WALL_TILE_HP = 100;          // OG game.js:791, 848
export const WALL_SCALE = WALL_BRUSH_SCALE; // walls paint at brush × 0.75 (OG game.js:7552, 7637)
export const HOLES_KEPT = 32;             // latest 32 broken-tile points remembered (64 numbers) (OG game.js:887)
const DUST_PER = 8;                       // one dust puff per 8 broken tiles (OG game.js:8934, D = 8)

// Paint (solid = true) or erase (false) tiles whose centre is within max(r, 4) px of the segment.
// The caller passes r: brush × 0.75 to paint, the full brush to erase (OG game.js:7637, 7709, 825-852).
export function paintWall(world, x0, y0, x1, y1, r, solid = true) {
  const w = world.walls, t = w.tile, inv = 1 / t, R = Math.max(r, 0.5 * t), v = solid ? 1 : 0;
  const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - R) * inv)), c1 = Math.min(w.cols - 1, Math.floor((Math.max(x0, x1) + R) * inv));
  const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - R) * inv)), r1 = Math.min(w.rows - 1, Math.floor((Math.max(y0, y1) + R) * inv));
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, R2 = R * R;
  let changed = 0;
  for (let ty = r0; ty <= r1; ty++) {
    const cy = (ty + 0.5) * t;
    for (let tx = c0; tx <= c1; tx++) {
      const cx = (tx + 0.5) * t;
      let s = l2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / l2 : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const ex = cx - (x0 + dx * s), ey = cy - (y0 + dy * s);
      if (ex * ex + ey * ey > R2) continue;
      const i = ty * w.cols + tx;
      if (w.solid[i] === v) continue;
      w.solid[i] = v; w.hp[i] = v ? WALL_TILE_HP : 0; w.count += v ? 1 : -1; changed++;
    }
  }
  if (changed > 0) w.version++;
  return changed;
}

// Explosion damage: tiles whose centre is within r lose dmg × (1 − (d/r)²) hp; at ≤ 0 they are removed.
// CORE-B passes r = blast radius × 0.7 and dmg = damage × 2.5 (OG game.js:896-922, 8931-8938). Dust puffs every 8th broken tile.
export function blastWalls(world, x, y, r, dmg) {
  const w = world.walls;
  if (w.count === 0) return 0;
  const t = w.tile, inv = 1 / t;
  const c0 = Math.max(0, Math.floor((x - r) * inv)), c1 = Math.min(w.cols - 1, Math.floor((x + r) * inv));
  const r0 = Math.max(0, Math.floor((y - r) * inv)), r1 = Math.min(w.rows - 1, Math.floor((y + r) * inv));
  let hit = 0, broke = 0, first = -1;
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    const i = ty * w.cols + tx;
    if (w.solid[i] === 0) continue;
    const d = Math.hypot((tx + 0.5) * t - x, (ty + 0.5) * t - y);
    if (d >= r) continue;
    const f = d / r;
    w.hp[i] -= dmg * (1 - f * f); hit++;
    if (w.hp[i] > 0) continue;
    w.solid[i] = 0; w.hp[i] = 0; w.count--; broke++;
    brokenTmp.push((tx + 0.5) * t, (ty + 0.5) * t);
    if (first < 0) first = i;
  }
  if (hit > 0) w.damageVersion++;
  if (broke > 0) {
    w.version++;
    const step = Math.max(1, Math.floor(broke / DUST_PER));
    for (let b = 0; b < broke; b += step) world.emit('puff', { kind: 'dust', x: brokenTmp[2 * b], y: brokenTmp[2 * b + 1], ang: world.rng() * Math.PI * 2, size: 0.9 });
  }
  brokenTmp.length = 0;
  return broke;
}
const brokenTmp = [];

// Rat bite: tiles whose centre is within r lose dmg hp; broken tiles are remembered as holes (OG game.js:857-883).
// Rats call gnawWalls(world, x, y, 1.52 × radius, 2.2) (OG game.js:11368-11411).
export function gnawWalls(world, x, y, r, dmg) {
  const w = world.walls;
  if (w.count === 0) return 0;
  const t = w.tile, inv = 1 / t;
  const c0 = Math.max(0, Math.floor((x - r) * inv)), c1 = Math.min(w.cols - 1, Math.floor((x + r) * inv));
  const r0 = Math.max(0, Math.floor((y - r) * inv)), r1 = Math.min(w.rows - 1, Math.floor((y + r) * inv));
  let hit = 0, broke = 0;
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    const i = ty * w.cols + tx;
    if (w.solid[i] === 0) continue;
    const ex = (tx + 0.5) * t - x, ey = (ty + 0.5) * t - y;
    if (ex * ex + ey * ey > r * r) continue;
    w.hp[i] -= dmg; hit++;
    if (w.hp[i] > 0) continue;
    w.solid[i] = 0; w.hp[i] = 0; w.count--; broke++;
    w.holes.push((tx + 0.5) * t, (ty + 0.5) * t);
    if (w.holes.length > 2 * HOLES_KEPT) w.holes.splice(0, 2);
  }
  if (hit > 0) w.damageVersion++;
  if (broke > 0) w.version++;
  return broke;
}

// Nearest remembered hole within r: writes out[0..1], returns true if found (OG game.js:884-895). Rats steer to one within 60 px.
export function nearestHole(world, x, y, r, out) {
  const h = world.walls.holes; let best = r * r, found = false;
  for (let k = 0; k < h.length; k += 2) {
    const dx = h[k] - x, dy = h[k + 1] - y, d = dx * dx + dy * dy;
    if (d > best) continue;
    best = d; out[0] = h[k]; out[1] = h[k + 1]; found = true;
  }
  return found;
}

// ---------------------------------------------------------------- createGame tool contract (CORE-A game.js passes r = brush × 0.75 to paint)
export function paint(world, x0, y0, x1, y1, r) { return paintWall(world, x0, y0, x1, y1, r, true); }
export function erase(world, x0, y0, x1, y1, r) { return paintWall(world, x0, y0, x1, y1, r, false); }
