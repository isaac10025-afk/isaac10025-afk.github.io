// Generic status effects (OG core-combat §12): stun, slips (oil / ice), startle, grenade dodge, flee steer.
import { DT, STATE, QUERY_MARGIN, INTEL, intel, initCombat, setState, rnd, signed, hypot, nearestWet } from './env.js';
import { toss } from './push.js';
import { hatKnock } from './damage.js';

/** stun(world, u, t): stun = max(stun, t). The timer ticks down by dt in CORE-A's brain system (OG game.js:5010). */
export function stun(world, u, t) { initCombat(u); if (t > u.stun) u.stun = t; }

// Slip on oil: toss along velocity speed 90, up 190, 30% hat (OG game.js:3312-3317).
// Slip on ice: speed 110, up 170, 25% hat (OG game.js:3319-3324). TERRAIN's ice system calls slip(world,u,speed,'ice').
export const SLIP = { oil: { out: 90, up: 190, hat: 0.3 }, ice: { out: 110, up: 170, hat: 0.25 } };
export function slip(world, u, speed, what = 'oil') {
  const s = SLIP[what] || SLIP.oil, dx = u.vx / speed, dy = u.vy / speed;
  toss(world, u, dx, dy, s.out, s.up);
  if (rnd(world) < s.hat) hatKnock(world, u, dx, -0.5, 0.5);
}

// ---- startle (OG module 613, game.js:16223-16274) ----
export const STARTLE_R = 0.5, STARTLE_BASE = 1.2, STARTLE_EXTRA = 1.8, STARTLE_PASS = 30, STARTLE_SKEW = 0.25, STARTLE_GAP = 6;
export function canStartle(world, u) {
  const d = u.def;
  return d.skittish === true && !(d.look && d.look.undead) && u.state !== STATE.CHARGE && (u.startle === 0 || world.time >= u.startle + STARTLE_GAP);
}
let _sx = 0, _sy = 0, _sr = 0, _sw = null;
function startleOne(u) {
  initCombat(u);
  if (!(u.hp > 0) || !canStartle(_sw, u)) return;
  const d = hypot(u.x - _sx, u.y - _sy);
  if (d > _sr) return;
  const until = _sw.time + STARTLE_BASE + STARTLE_EXTRA * (1 - d / _sr);
  if (until <= u.startle) return;
  u.startle = until; u.startleX = _sx; u.startleY = _sy;
}
/** Blast noise startles skittish units within noiseRadius·0.5 (called by explode). */
export function startleAround(world, x, y, noiseRadius) {
  if (!(noiseRadius > 0)) return;
  _sx = x; _sy = y; _sr = noiseRadius * STARTLE_R; _sw = world;
  world.query(x, y, _sr, startleOne);
  _sw = null;
}
let _su = null;
function startlePass(n) {
  const u = _su;
  if (n === u || !(n.hp > 0)) return;
  initCombat(n);
  if (n.startle >= u.startle - STARTLE_SKEW || !canStartle(_sw, n)) return;
  if (hypot(n.x - u.x, n.y - u.y) > u.radius + n.radius + STARTLE_PASS) return;
  n.startle = u.startle; n.startleX = u.startleX; n.startleY = u.startleY;
}
/** Brain helper: while startled, flee from the blast at `speed` and pass it on. Returns true if it took over. */
export function startleStep(world, u, speed) {
  initCombat(u);
  if (world.time >= u.startle) return false;
  const dx = u.x - u.startleX, dy = u.y - u.startleY, d = hypot(dx, dy);
  setState(u, STATE.FLEE);
  if (d > 0.001) { u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed; }
  else { u.goalX = Math.cos(u.heading) * speed; u.goalY = Math.sin(u.heading) * speed; }
  _su = u; _sw = world;
  world.query(u.x, u.y, u.radius + STARTLE_PASS + u.radius, startlePass);
  _su = null; _sw = null;
  return true;
}

// ---- grenade dodge (OG 412.A, game.js:8960-8978; mover game.js:3231-3238) ----
export const DODGE_PAD = 6, DODGE_TAIL = 0.25;
let _dx = 0, _dy = 0, _dt = 0, _dw = null;
function dodgeOne(u) {
  if (!(u.hp > 0) || intel(u.def) < INTEL.Trained) return;
  initCombat(u);
  const rt = u.reactTime || 0;
  if (rt >= _dt) return;
  let dx = u.x - _dx, dy = u.y - _dy, d = hypot(dx, dy);
  if (d < 0.001) { const a = rnd(_dw) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
  u.dodgeX = dx / d; u.dodgeY = dy / d; u.dodgeDelay = rt; u.dodgeTime = _dt - rt + DODGE_TAIL;
}
/** dodgeWarn(world, x, y, blastRadius, timeToLand): Trained units near the landing point get a dodge. */
export function dodgeWarn(world, x, y, blastRadius, timeToLand) {
  // OG queries blastRadius + 46 + 6 around the point (game.js:8963) — "centre within blastRadius + 52".
  _dx = x; _dy = y; _dt = timeToLand; _dw = world;
  world.query(x, y, blastRadius + QUERY_MARGIN + DODGE_PAD, dodgeOne);
  _dw = null;
}
/** dodgeStep(world, u, runSpeed): CORE-A's brain system calls this after def.brain while u.dodgeTime > 0. */
export function dodgeStep(world, u, runSpeed) {
  if (u.dodgeDelay > 0) { u.dodgeDelay -= DT; return; }
  u.dodgeTime -= DT;
  u.goalX = u.dodgeX * runSpeed; u.goalY = u.dodgeY * runSpeed; u.pathing = 1;
}

// ---- flee steer (OG 412.l, game.js:9182-9209) ----
export const FLEE_WATER_R = 220, FLEE_EDGE = 90, FLEE_WANDER = 9;
const _wet = new Float32Array(2);
// OURS (attack 3, 11-18): FLEE_WALL. A fleeing unit runs straight away from the threat, or along its own heading when it
// has none, walls or not. Its heading follows its goal, so one that ran into a wall faced the wall for good and pushed
// into it until it rallied (swamp map: a 12 hp knight 12 s and on; a cornered unit the same). Now when the way ahead is
// a wall (a wall tile within r + FLEE_WALL.look px), it takes the nearest open way round it, turning the same side each
// time (by unit id) so it slides along the wall instead of flicking left and right. Water behind a wall doesn't pull a
// burning unit either (units/*/lib WATER_LOS). OG does the same as before; its painted fields have few walls to corner.
export const FLEE_WALL = Object.freeze({ look: 12, turns: [0.6, 1.2, 1.8, 2.4, 3.0] });
/** fleeOpen(world, u, hx, hy, out): (hx, hy) unit vector, or the nearest turn of it that isn't straight into a wall. */
export function fleeOpen(world, u, hx, hy, out) {
  out[0] = hx; out[1] = hy;
  const walls = world.walls; if (!walls || !(walls.count > 0)) return out;
  const L = u.radius + FLEE_WALL.look, x = u.x, y = u.y;
  if (!walls.isSolidAt(x + hx * L, y + hy * L)) return out;
  const a0 = Math.atan2(hy, hx), side = (u.id & 1) === 0 ? 1 : -1;
  for (const t of FLEE_WALL.turns) for (const sg of [side, -side]) {
    const a = a0 + sg * t, cx = Math.cos(a), cy = Math.sin(a);
    if (!walls.isSolidAt(x + cx * L, y + cy * L) && !walls.isSolidAt(x + cx * L * 0.5, y + cy * L * 0.5)) { out[0] = cx; out[1] = cy; return out; }
  }
  return out;
}
const _open = new Float32Array(2);
/** fleeSteer(world, u, threatUnit|null, speed): sets goal = away-direction × speed. */
export function fleeSteer(world, u, from, speed) {
  initCombat(u);
  const x = u.x, y = u.y;
  let hx = -u.threatX, hy = -u.threatY;
  if (hx * hx + hy * hy < 1e-6) {
    if (from) { hx = x - from.x; hy = y - from.y; } else { hx = Math.cos(u.heading); hy = Math.sin(u.heading); }
  }
  let d = hypot(hx, hy) || 1; hx /= d; hy /= d;
  if (u.burning > 0) {
    u.wander += FLEE_WANDER * signed(world) * DT;
    if (intel(u.def) !== INTEL.Mindless && nearestWet(world, x, y, FLEE_WATER_R, _wet) && !(world.walls && world.walls.count > 0 && !world.walls.lineOfSight(x, y, _wet[0], _wet[1]))) { // OURS: water behind a wall doesn't count (FLEE_WALL)
      const wx = _wet[0] - x, wy = _wet[1] - y, wd = hypot(wx, wy) || 1;
      hx = (wx / wd) * 0.8 + 0.2 * Math.cos(u.wander); hy = (wy / wd) * 0.8 + 0.2 * Math.sin(u.wander);
    } else { hx = 0.35 * hx + 0.65 * Math.cos(u.wander); hy = 0.35 * hy + 0.65 * Math.sin(u.wander); }
  }
  const W = world.W, H = world.H, e = FLEE_EDGE;
  if (x < e) hx += (e - x) / e; else if (x > W - e) hx -= (x - (W - e)) / e;
  if (y < e) hy += (e - y) / e; else if (y > H - e) hy -= (y - (H - e)) / e;
  d = hypot(hx, hy) || 1;
  fleeOpen(world, u, hx / d, hy / d, _open);                                // OURS: FLEE_WALL above
  u.goalX = _open[0] * speed; u.goalY = _open[1] * speed;
}
