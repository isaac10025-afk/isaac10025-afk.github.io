// Sports tab shared pieces (Part 2 step 6, OURS: no OG source, our numbers). Owner: SPORTS-SIM. Not a unit file.
// Contract: STEP6.md (Sports table: tricks, starting numbers, b.act pose codes).
//  - athlete(spec): registerUnit with the tab's defaults (faction Sports, Trained people, OG soldier flock + morale,
//    `sports: true`, risenMode 'body': the necro raises them / zombies turn them like OG soldiers).
//  - brain pieces: pose codes (b.act / b.actT / b.victim), the melee fight (copied from the pirates' house style), idle.
//  - the cheer aura state (the cheerleader writes b.cheer; prelude() / holdsNerve read it).
//  - projectile helpers (hit masks, segment test), toss-to-a-distance, knock-down.
//  - four tick systems (sim/systems/extra.js), each returns at once while the field has nothing for it (no random
//    draws, so other battles play the same):
//      sports:aura  (after morale)   cheerleaders: Sports units of her side within 150 px: +20 % speed, never break / flee
//      sports:bat   (after brain)    batters hit lobbed / thrown things coming at them back at their thrower
//      sports:land  (after steering) a home-run victim lands (it and whoever it lands on: 15 + knocked down); a unit the sumo
//                                    shoved into a wall takes +25
//      sports:kills (after water)    a cheerleader jumps and cheers when her side kills near her
// Per-world state on world.sports (reset by Clear). No allocation per tick.
import { registerUnit } from '../../defs.js';
import { F, INT, ENEMY, ALL_MASK, canHit, maskBit, maskWithout } from '../../factions.js';
import { DT, STATE, LEAP, GRAVITY, WET, DEEP, hypot, angleDiff } from '../../const.js';
import { meleeStrike, circle, oddsApproach, fleeSteer, advanceTo, setState, targetOf, damage, push, toss, hatKnock, raycast, depthAt, stat } from '../../combat/index.js';
import { submerged } from '../../combat/env.js';
import { followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { attackHeld } from '../../systems/possess.js';
import { onWorldClear } from '../../world.js';
import { SOLDIER_FLOCK, SOLDIER_MORALE } from '../army/_shared.js';

export { DT, STATE, LEAP, GRAVITY, WET, DEEP, hypot, angleDiff, setState, targetOf, damage, push, toss, hatKnock, raycast, depthAt, stat, attackHeld, ENEMY, F, maskBit, canHit, advanceTo, fleeSteer };
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shared numbers
export const COMMON = Object.freeze({
  speedRoom: 1.4, // maxSpeed = runSpeed × 1.4: room for the cheer +20 % and the random 0.9-1.1 speedMul
  memory: 4, // s a group contact is followed with no target (OG soldiers use 4)
  chargeAt: 140, // px: melee players run (runSpeed) at a target closer than this, else walk
  margin: 46, // px: max unit radius, added to radius queries (the core's QUERY_MARGIN)
  grounded: 6, // px: a unit higher than this is in the air (rolling balls, shoves and stomps pass under it)
});
// Cheer aura (the cheerleader's file owns the radius; these are what the aura does to the units in it).
export const CHEER = Object.freeze({
  speed: 1.2, // × speed for Sports units in her aura (STEP6)
  hold: 0.6, // morale held at least this high in her aura (STEP6)
});
// Knock-downs: people fall over (stunned) and slide a little.
export const KNOCK = Object.freeze({
  landHit: 15, // a home-run victim landing: 15 to itself and to each unit it lands on (STEP6 batter "where it lands: 15")
  landStun: 0.8, // s down: the victim and the units it lands on
  landPush: 150, // shove (÷ their mass) away from where it landed
  landGap: 4, // px past both radii: "landed on"
  flungLife: 4, // s: a flung body that hasn't landed by then is forgotten
  wallHit: 25, // a unit the sumo shoved: extra damage when it slams into a wall (STEP6 sumo)
  wallLife: 0.7, // s after the shove the wall slam still counts
  wallGap: 2.5, // px past its radius: touching the wall
});

/** Sports people never break near a cheerleader (morale.js asks this before a unit runs). */
export function holdsNerve(world, u) { return u.b.cheer >= world.tick - 1; }

/** registerUnit for a sports person: our defaults + the spec (spec wins). */
export function athlete(spec) {
  const run = spec.runSpeed;
  return registerUnit({
    category: 'sports', faction: F.Side, intelligence: INT.Trained, infectable: true, flammability: 0.3, conductivity: 2,
    radiusJitter: 0.06, mass: 1, strength: 0.6, locomotion: 0, accel: 720, decel: 720, turnRate: 8, turnSpeedFalloff: Infinity,
    sightRange: 330, alertSightRange: 360, stickyTarget: false, reactionTime: 0.3, huntRange: Infinity, minDistance: 0,
    drilled: false, brushSpacing: 21, maxSpeed: run * COMMON.speedRoom,
    sports: true, risenMode: 'body', flock: SOLDIER_FLOCK, morale: SOLDIER_MORALE, holdsNerve,
    ...spec,
    look: { ...(spec.look || {}) },
  });
}

// ---------------------------------------------------------------- b.act pose codes (STEP6.md Sports table)
/** Every sports person's common b{} fields, set first in init (one hidden class per type). */
export function initB(u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1; b.cheer = -10; b.cheerOn = 0;
}
export function setAct(world, u, a) { const b = u.b; if (b.act !== a) { b.act = a; b.actT = world.time; } }
export function actAge(world, u) { return world.time - u.b.actT; }
/** Start of every sports brain: the cheer speed goes off once out of her aura (the aura turns it on). */
export function prelude(world, u) {
  const b = u.b;
  if (b.cheerOn === 1 && b.cheer < world.tick - 1) { u.speedMul /= CHEER.speed; b.cheerOn = 0; }
}
/** Brain start: prelude, goal cleared. True = stunned, the tick is done. */
export function begin(world, u) {
  prelude(world, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return true; }
  return false;
}
/** A target-free move (shove, stomp, bat-back) may go off: always on its own, only while the player attacks when possessed. */
export function mayAct(world, u) { return u.possessed !== 1 || attackHeld(world); }

// ---------------------------------------------------------------- melee (pirates' house style)
export function losClear(world, u) { return u.los === 1 || u.los === true || world.walls.count === 0; }
function markEngaged(world, u) { const g = u.group; if (g >= 0 && world.groups.markEngaged) world.groups.markEngaged(g); }
/**
 * meleeFight(world, u, t, W, dx, dy, d) → 0 out of reach, 1 engaged, 2 struck this tick.
 * W: {damage, damageJitter, push, stun, cooldown, cooldownJitter, reach (gap past both radii), band, facing, circle,
 *     backStep (default true), close (px/s stepping in, default walk × 0.6)}. W.strike(world, u, t) replaces the plain blow.
 */
export function meleeFight(world, u, t, W, dx, dy, d) {
  const reach = u.radius + t.radius + W.reach;
  if (d > reach + W.band) return 0;
  setState(u, STATE.ENGAGE); markEngaged(world, u);
  const a = Math.atan2(dy, dx), def = u.def;
  u.face = a;
  let r = 1;
  if (d > reach) { const cs = W.close !== undefined ? W.close : def.walkSpeed * 0.6; u.goalX = (dx / d) * cs; u.goalY = (dy / d) * cs; }
  else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < W.facing) { if (W.strike) W.strike(world, u, t); else meleeStrike(world, u, t, W); r = 2; }
  circle(world, u, t, dx, dy, d, def, W.circle, W.backStep !== false);
  oddsApproach(world, u, t, dx, dy, d, def);
  return r;
}
/** Close on t: run inside COMMON.chargeAt, else walk (Charge / Advance). */
export function closeOn(world, u, t, dx, dy, d) {
  const def = u.def, near = d < COMMON.chargeAt;
  advanceTo(world, u, t, dx, dy, losClear(world, u), near ? def.runSpeed : def.walkSpeed);
  if (near) setState(u, STATE.CHARGE);
}
/** No target: go to the group's fight, else stand. */
export function idle(world, u) { if (!followGroup(world, u, u.def.walkSpeed, COMMON.memory)) setState(u, STATE.IDLE); }
/** The plain melee brain (after begin()): returns meleeFight's code (2 = struck this tick), or 0. */
export function meleeBody(world, u, W) {
  const t = targetOf(world, u);
  if (u.state === STATE.FLEE) { fleeSteer(world, u, t, u.def.runSpeed); return 0; }
  if (!t) { idle(world, u); return 0; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const r = meleeFight(world, u, t, W, dx, dy, d);
  if (r === 0) closeOn(world, u, t, dx, dy, d);
  return r;
}
/** Empty swing for possessFire (attack held at nobody): the attack pose, nothing hit. */
export function emptySwing(world, u, cooldown) {
  if (u.cooldown > 0) return false;
  u.attack = 1; u.cooldown = cooldown;
  world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
  return true;
}

// ---------------------------------------------------------------- who can be knocked about
export function grounded(o) { return !(o.z > COMMON.grounded) && !(o.climb > 0) && o.leaping !== LEAP.FLY; }
export function alive(o) { return !!o && !o.dead && !o.removed && o.hp > 0; }
/** Bosses shrug off knock-downs, stuns and shoves (STEP6 bosses rule). */
export function shrugs(o) { return o.def.boss === true; }
/** Can o be thrown through the air (home run, uppercut)? */
export function tossable(o, maxMass) {
  const d = o.def;
  return o.mass <= maxMass && !d.prop && !d.untossable && !d.boss && !d.machine && o.hurled !== 1 && grounded(o) && o.inside < 0 && o.hp > 0;
}
/** Is v's braced shield facing a blow from (sx, sy)? (shield walls, legions: chargers bounce off) */
export function braced(v, sx, sy) {
  const sh = v.def.shield; if (!sh || !(sh.brace > 0)) return false;
  const dx = sx - v.x, dy = sy - v.y, d = hypot(dx, dy); if (d < 0.001) return false;
  return (dx * Math.cos(v.heading) + dy * Math.sin(v.heading)) / d >= sh.arc;
}
/** Knock down: push away from (x, y) with force f (÷ mass) + stunned t s. Bosses ignore it. */
export function knockDown(world, o, x, y, f, t) {
  if (shrugs(o)) return;
  const dx = o.x - x, dy = o.y - y, d = hypot(dx, dy) || 0.001;
  push(world, o, dx / d, dy / d, f, t);
}
/** Toss u so it lands about `dist` px away along (dx, dy) with upward speed `up` (toss's mass scaling taken out). */
export function tossTo(world, u, dx, dy, dist, up) {
  const k = 1 / Math.sqrt(Math.max(1, u.mass)), h = up * k;
  const air = (h + Math.sqrt(h * h + 2 * GRAVITY * Math.max(0, u.z))) / GRAVITY;
  toss(world, u, dx, dy, dist / Math.max(0.05, k * air), up);
}

// ---------------------------------------------------------------- projectile helpers (our kinds)
const _probe = { id: -1, faction: 0, team: -1, def: null, x: 0, y: 0 };
/** May projectile p hit unit u (p.wild = everybody, as the core's ricochets)? */
export function hittable(p, u) { if (p.wild === 1) return true; _probe.faction = p.faction; _probe.team = p.team; return canHit(_probe, u); }
export function ownerOf(world, p) { if (p.owner < 0) return null; const o = world.unitById(p.owner); return o && !o.removed ? o : null; }
export function outside(world, x, y) { return x < 0 || y < 0 || x > world.W || y > world.H; }
export function wallsAt(world) { return world.walls.count > 0; }
export function solid(world, x, y) { return world.walls.count > 0 && world.walls.isSolidAt(x, y); }

// Segment test: the first unit p may hit along (x0, y0) → (x0 + dx, y0 + dy) within radius + pad, before wall fraction
// `limit`. Skips p.passed, swallowed units, units under water, and (low = true) anything in the air.
let _sw = null, _sp = null, _sx = 0, _sy = 0, _sdx = 0, _sdy = 0, _sF = 1, _spad = 0, _slim = 1, _slow = false, _sbest = null, _sbt = 1, _sskip = null;
function segOne(u) {
  if (!(u.hp > 0) || u.id === _sp.passed || u.inside >= 0 || !hittable(_sp, u)) return;
  if (_slow && !grounded(u)) return;
  if (submerged(_sw, u)) return;
  if (_sskip !== null && _sskip(u)) return;
  const ox = u.x - _sx, oy = u.y - _sy;
  let t = (ox * _sdx + oy * _sdy) / _sF; t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (t > _slim) return;
  const qx = ox - _sdx * t, qy = oy - _sdy * t, R = u.radius + _spad;
  if (qx * qx + qy * qy < R * R && t < _sbt) { _sbt = t; _sbest = u; }
}
/** → the unit hit (or null); segT() = its fraction along the segment. skip(u) → true to pass u by. */
export function segHit(world, p, x0, y0, dx, dy, pad, limit, low, skip = null) {
  const F2 = dx * dx + dy * dy || 1e-6, len = Math.sqrt(F2);
  _sw = world; _sp = p; _sx = x0; _sy = y0; _sdx = dx; _sdy = dy; _sF = F2; _spad = pad; _slim = limit; _slow = low; _sbest = null; _sbt = 2; _sskip = skip;
  world.query(x0 + dx / 2, y0 + dy / 2, len / 2 + pad + COMMON.margin, segOne);
  const h = _sbest; _sw = null; _sp = null; _sbest = null; _sskip = null;
  return h;
}
export function segT() { return _sbt; }

// ---------------------------------------------------------------- per-world state
export function sportsOf(world) {
  let s = world.sports;
  if (!s) s = world.sports = { cheer: [], bat: [], flung: [], shoved: [], free: [] };
  return s;
}
onWorldClear((w) => { w.sports = null; });
function rec(S) { return S.free.pop() || { id: -1, by: -1, t0: 0, until: 0, hit: 0, dx: 0, dy: 0 }; }
function dropRec(S, list, k) { S.free.push(list[k]); list[k] = list[list.length - 1]; list.pop(); }
function pruneUnits(list) { for (let k = list.length - 1; k >= 0; k--) if (list[k].dead) { list[k] = list[list.length - 1]; list.pop(); } }
/** Cheerleaders / batters put themselves on the field's lists in init (the systems loop only them). */
export function addCheerleader(world, u) { sportsOf(world).cheer.push(u); }
export function addBatter(world, u) { sportsOf(world).bat.push(u); }

/** v was hit for a home run by `by`: when it lands, it and whoever it lands on take `hit` and are knocked down. */
export function flung(world, v, by, hit) {
  const S = sportsOf(world), L = S.flung;
  for (let k = 0; k < L.length; k++) if (L[k].id === v.id) { dropRec(S, L, k); break; }
  const e = rec(S); e.id = v.id; e.by = by ? by.id : -1; e.t0 = world.time; e.until = world.time + KNOCK.flungLife; e.hit = hit;
  L.push(e);
}
/** v was just shoved by the sumo `by`: a wall slam in the next KNOCK.wallLife s costs it KNOCK.wallHit more. */
/** (dx, dy) = the shove's direction (unit vector): only a wall ahead along it counts. */
export function shoved(world, v, by, dx, dy) {
  const S = sportsOf(world), L = S.shoved;
  let e = null;
  for (let k = 0; k < L.length; k++) if (L[k].id === v.id) { e = L[k]; break; }
  if (!e) { e = rec(S); L.push(e); }
  e.id = v.id; e.by = by.id; e.t0 = world.time; e.until = world.time + KNOCK.wallLife; e.hit = KNOCK.wallHit; e.dx = dx; e.dy = dy;
}

// ---------------------------------------------------------------- sports:aura (after morale)
// Cheerleader aura: radius from the cheerleader's def (def.cheerR). Turns the speed on (prelude turns it off).
const Q_CAP = 256, _q = new Array(Q_CAP).fill(null);
function auraRun(world) {
  const S = world.sports; if (!S || S.cheer.length === 0) return;
  pruneUnits(S.cheer);
  const tick = world.tick, L = S.cheer;
  for (let c = 0; c < L.length; c++) {
    const ch = L[c];
    if (!(ch.hp > 0) || ch.inside >= 0) continue;
    const n = world.queryMask(ch.x, ch.y, ch.def.cheerR, maskBit(ch.faction), _q, Q_CAP);
    for (let k = 0; k < n; k++) {
      const o = _q[k]; _q[k] = null;
      if (o.def.sports !== true || !(o.hp > 0)) continue;
      const b = o.b; b.cheer = tick;
      if (b.cheerOn === 0) { o.speedMul *= CHEER.speed; b.cheerOn = 1; }
      if (o.morale < CHEER.hold) o.morale = CHEER.hold;
      if (o.state === STATE.FLEE && o.possessed !== 1) setState(o, STATE.IDLE);
    }
  }
}

// ---------------------------------------------------------------- sports:bat (after brain)
// A grenade, bomb, oil pot, baseball or mini rocket of another side coming within r + 18 of a ready batter: 30 % chance
// (rolled once, the tick it enters the zone) he hits it back at its thrower and it becomes his. The numbers and the kind
// list live in batter.js (def.batBack); the per-kind redirect is here.
// Modes: 1 lob (life = flight to the landing point, p.apex arc: grenade, oil pot), 2 bomb (lob + p.rise fuse, p.drop
// state), 3 line (flies straight on until it hits: baseball), 4 rocket (straight; bursts where its life runs out, so its
// life = the flight to the thrower: space's mini rocket; its p.rise / p.drop height ramp is switched off).
function batReady(world, u, B) {
  return !u.dead && u.hp > 0 && !(u.stun > 0) && u.inside < 0 && !(u.floating > world.time) && grounded(u)
    && world.time >= u.b.batAt + B.cooldown && u.state !== STATE.FLEE && mayAct(world, u);
}
function batBack(world, u, p, mode, B) {
  const own = ownerOf(world, p);
  let tx, ty;
  if (own && own !== u && own.hp > 0) { tx = own.x; ty = own.y; }
  else { const v = hypot(p.vx, p.vy) || 1; tx = p.x - (p.vx / v) * B.lost; ty = p.y - (p.vy / v) * B.lost; }   // thrower gone: back where it came from
  const dx = tx - p.x, dy = ty - p.y, d = hypot(dx, dy) || 1;
  if (mode >= 3) {
    const sp = Math.max(hypot(p.vx, p.vy), B.lineMin);
    p.vx = (dx / d) * sp; p.vy = (dy / d) * sp;
    p.life = p.maxLife = mode === 4 ? Math.max(DT, d / sp) : Math.max(p.life, (d / sp) * B.linePad);
    p.passed = -1; p.rise = 0; p.drop = 0;            // a batted curveball flies straight; a rocket stays at its height
  } else {
    const fl = Math.max(B.minFlight, d / B.lobSpeed);
    p.vx = dx / fl; p.vy = dy / fl; p.life = p.maxLife = fl; p.apex = B.apexPer * d + B.apexMin; p.bounces = 0;
    if (mode === 2) { p.drop = 0; p.rise = fl + B.fusePad; }   // the fuse is re-timed to blow as it lands at the thrower's feet
  }
  p.owner = u.id; p.faction = u.faction; p.team = u.team; p.wild = 0;
  u.b.batAt = world.time; u.b.batted++;
  setAct(world, u, 2); u.attack = 1; u.face = Math.atan2(dy, dx);
  world.emit('strike', { x: p.x, y: p.y, v: 1, type: u.type, bat: 1 });   // STEP6 SPORTS AUDIO: bat crack (see Sound asks)
  stat(world, 'shots');
}
function batRun(world) {
  const S = world.sports; if (!S || S.bat.length === 0) return;
  pruneUnits(S.bat);
  const L = S.bat, list = world.projectiles;
  if (L.length === 0 || !list || list.length === 0) return;
  const B = L[0].def.batBack;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i], mode = B.kinds[p.kind];
    if (mode === undefined || !(p.z <= B.maxZ) || p.host >= 0) continue;
    for (let k = 0; k < L.length; k++) {
      const u = L[k], R = u.radius + B.reach;
      const dx = p.x - u.x, dy = p.y - u.y;
      if (dx * dx + dy * dy > R * R) continue;
      const ex = p.px - u.x, ey = p.py - u.y;
      if (ex * ex + ey * ey <= R * R) continue;        // was inside already: its roll is done
      if (p.vx * dx + p.vy * dy >= 0) continue;          // not coming at him
      if (!hittable(p, u) || !batReady(world, u, B)) continue;
      if (world.rng() >= B.chance) continue;             // missed it (one roll per batter per projectile)
      batBack(world, u, p, mode, B);
      break;
    }
  }
}

// ---------------------------------------------------------------- sports:land (after steering)
const LQ = new Array(32).fill(null), ANYONE = maskWithout(ALL_MASK, F.Props);   // "anyone": every faction but trees / barrels / anthills
function landed(world, v, e) {
  if (depthAt(world, v.x, v.y) >= WET) return;       // a splash: the water takes it
  damage(world, v, e.hit, e.by, 'thrown');           // the rag doll itself hits the ground hard ...
  if (v.hp > 0 && !shrugs(v) && v.stun < KNOCK.landStun) v.stun = KNOCK.landStun;   // ... and stays down a moment
  const n = world.queryMask(v.x, v.y, v.radius + COMMON.margin + KNOCK.landGap, ANYONE, LQ, LQ.length);
  for (let k = 0; k < n; k++) {
    const o = LQ[k]; LQ[k] = null;
    if (o === v || o.dead || !(o.hp > 0) || o.z > 2 * v.radius || o.climb > 0) continue;
    if (hypot(o.x - v.x, o.y - v.y) > v.radius + o.radius + KNOCK.landGap) continue;
    damage(world, o, e.hit, e.by, 'thrown');
    if (o.hp > 0) knockDown(world, o, v.x, v.y, KNOCK.landPush, KNOCK.landStun);
  }
  world.emit('trample', { x: v.x, y: v.y, v: 1, type: v.type });
}
function wallTouch(world, u) {
  const W = world.walls, t = W.tile, r = u.radius + KNOCK.wallGap, x = u.x, y = u.y, r2 = r * r;
  const c0 = Math.max(0, Math.floor((x - r) / t)), c1 = Math.min(W.cols - 1, Math.floor((x + r) / t));
  const r0 = Math.max(0, Math.floor((y - r) / t)), r1 = Math.min(W.rows - 1, Math.floor((y + r) / t));
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    if (W.solid[ty * W.cols + tx] === 0) continue;
    const lx = tx * t, ly = ty * t, ex = x - (x < lx ? lx : x > lx + t ? lx + t : x), ey = y - (y < ly ? ly : y > ly + t ? ly + t : y);
    if (ex * ex + ey * ey <= r2) return true;
  }
  return false;
}
function landRun(world) {
  const S = world.sports; if (!S) return;
  const L = S.flung;
  for (let k = L.length - 1; k >= 0; k--) {
    const e = L[k], v = world.unitById(e.id);
    if (!v || !(v.hp > 0) || world.time > e.until) { dropRec(S, L, k); continue; }
    if (world.time > e.t0 && v.z <= 0 && v.vz <= 0) { landed(world, v, e); dropRec(S, L, k); }
  }
  const M = S.shoved;
  for (let k = M.length - 1; k >= 0; k--) {
    const e = M[k], v = world.unitById(e.id);
    if (!v || !(v.hp > 0) || world.time > e.until) { dropRec(S, M, k); continue; }
    if (world.walls.count === 0) continue;
    const ahead = v.radius + KNOCK.wallGap + 1;
    if (!solid(world, v.x + e.dx * ahead, v.y + e.dy * ahead) || !wallTouch(world, v)) continue;   // slid into a wall along the shove
    damage(world, v, e.hit, e.by, 'blow', v.x - v.vx, v.y - v.vy);
    world.emit('bounce', { x: v.x, y: v.y, v: 1, type: v.type, wall: 1 });
    dropRec(S, M, k);
  }
}

// ---------------------------------------------------------------- sports:kills (after water, before lifecycle)
// Units about to be processed as dead (hp ≤ 0) with a recent blow from a cheerleader's side, near her: she cheers.
function killsRun(world) {
  const S = world.sports; if (!S || S.cheer.length === 0) return;
  const us = world.units, L = S.cheer, now = world.time;
  for (let i = 0; i < us.length; i++) {
    const v = us[i];
    if (v.dead || v.hp > 0 || v.harmByFaction < 0 || now - v.harmByAt > 6 || v.def.prop) continue;
    for (let c = 0; c < L.length; c++) {
      const ch = L[c];
      if (ch.dead || !(ch.hp > 0) || ch === v || ch.faction !== v.harmByFaction || v.faction === ch.faction) continue;
      const R = ch.def.cheerSee;
      if ((v.x - ch.x) * (v.x - ch.x) + (v.y - ch.y) * (v.y - ch.y) > R * R) continue;
      if (ch.def.onCheer) ch.def.onCheer(world, ch, v);
    }
  }
}

registerSystem('sports:aura', auraRun, 'morale');
registerSystem('sports:bat', batRun, 'brain');
registerSystem('sports:land', landRun, 'steering');
registerSystem('sports:kills', killsRun, 'water');
