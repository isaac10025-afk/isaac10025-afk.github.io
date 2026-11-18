// Domino: a stunned unit flying > 140 px/s knocks over touching non-prop units. OG core-move §6 (game.js:5034-5070).
import { QUERY_MARGIN, CAUSE } from '../const.js';
import { ALL_MASK } from '../factions.js';
import { isAirborne } from './brain.js';

async function opt(p) { try { return await import(p); } catch (e) { return null; } }
const [pushMod, damageMod] = await Promise.all([opt('../combat/push.js'), opt('../combat/damage.js')]);
const near = new Array(16);
const FAST2 = 140 * 140; // 19600 (OG game.js:5040)

function hit(world, u, amount) { if (damageMod && damageMod.damage) damageMod.damage(world, u, amount, null, 'thrown'); else u.hp -= amount; }
function toss(world, u, dx, dy, out, up) {
  if (pushMod && pushMod.toss) return pushMod.toss(world, u, dx, dy, out, up);
  u.vx += dx * out; u.vy += dy * out; // fallback: shove only
}

export function run(world) {
  const us = world.units;
  for (let i = 0, n = us.length; i < n; i++) {
    const u = us[i];
    if (u.dead || u.stun <= 0 || u.hp <= 0) continue;
    if (u.vx * u.vx + u.vy * u.vy < FAST2) continue;
    const r = u.radius, cnt = world.queryMask(u.x, u.y, r + QUERY_MARGIN + 2, ALL_MASK, near, 16);
    for (let k = 0; k < cnt; k++) {
      const o = near[k];
      if (o === u || o.hp <= 0 || isAirborne(o) || o.def.prop) continue;
      if (u.z > 2 * o.radius) continue;
      const dx = o.x - u.x, dy = o.y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if (d > r + o.radius + 1) continue;
      const nx = dx / d, ny = dy / d, v = (u.vx - o.vx) * nx + (u.vy - o.vy) * ny;
      if (v < 70 || u.mass * v < 120 * o.mass) continue;          // OG game.js:5054
      toss(world, o, nx, ny, 0.7 * v, 160);                        // OG game.js:5055
      const dmg = (5 * v) / 200;                                   // OG game.js:5056
      hit(world, o, dmg); hit(world, u, dmg);
      o.harmCause = u.harmCause = CAUSE.Thrown;
      if (world.rng() < 0.3 && damageMod && damageMod.hatKnock) damageMod.hatKnock(world, o, nx, ny, 0.5); // OG 412.o (game.js:5061); was a look-only event before 11-14
      u.vx -= nx * v * 0.5; u.vy -= ny * v * 0.5;                  // OG game.js:5062-5063
      world.emit('dust', { x: (u.x + o.x) / 2, y: (u.y + o.y) / 2, size: 0.6 });
      if (u.vx * u.vx + u.vy * u.vy < FAST2) break;
    }
  }
}
