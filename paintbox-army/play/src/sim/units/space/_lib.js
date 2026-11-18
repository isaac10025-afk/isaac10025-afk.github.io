// Space tab shared pieces (Part 2 step 6, OURS: no OG source, our own design). Owner: SPACE-SIM. Not a unit file.
// Contract: STEP6.md (Space table: tricks, starting numbers, b.act pose codes, effect projectiles).
//  - alien(def): registerUnit with the tab's defaults (faction Space, Trained, category 'space', living: the necro raises
//    'body' copies, zombies turn them). The UFO overrides it as a machine.
//  - brain pieces every alien uses: pose codes (b.act), closing in, idle, fleeing, the melee strike.
//  - floats: canFloat (STEP6: flyers, bosses and mass > 8 never float), floatHard (the gravity bubble: a float, then a hard
//    drop; whoever it lands on is hurt and knocked down, through the dinos' landing record `flung`).
//  - high flyers (jetpack, UFO): melee units don't target them up there (dinos' markSky rule, def.flies + z > 30).
//  - a shared first-hit sweep for our shots (ray, minirocket, shrink) and effect projectiles that ride on a unit (bubble,
//    mind): they never hit anything, their step follows the unit and removes them; the logic lives in the units, so an
//    effect projectile that is lost (a shield dome) changes nothing but the look.
// Per-world state lives in a WeakMap (Clear empties it). No allocation per tick; no random draws unless a unit acts.
import { registerUnit } from '../../defs.js';
import { F, INT, ENEMY, canHit } from '../../factions.js';
import { STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff } from '../../const.js';
import { meleeStrike, circle, oddsApproach, fleeSteer, advanceTo, damage, push, stun, depthAt, raycast, splatNoise } from '../../combat/index.js';
import { spawnProjectile, removeProjectile, registerProjectileKind } from '../../combat/projectiles.js';
import { submerged } from '../../combat/env.js';
import { followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { attackHeld } from '../../systems/possess.js';
import { markSky, flung, high } from '../dinos/_lib.js';

export { STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff, F, INT, ENEMY };
export { meleeStrike, damage, push, stun, depthAt, raycast, splatNoise, advanceTo, markSky, high, attackHeld };
export { spawnProjectile, removeProjectile, registerProjectileKind };

// Shared numbers (ours; the user tunes them).
export const SPACE = {
  MARGIN: 46,          // max unit radius, added to radius queries (the core's margin)
  SKY: 30,             // a flyer higher than this (z px) is out of melee reach (same line as the dinos' ptero)
  GROUNDED: 6,         // a unit higher than this is in the air (can't be floated, beamed, ...)
  FLOAT_MASS: 8,       // STEP6: mass > 8 never floats
  DROP_SPEED: 420,     // px/s straight down at the end of a gravity float (a hard drop, not a drift)
  KNOCK_STUN: 0.6,     // s: whoever a dropped body lands on is down this long (dinos' landing rule)
  CHASE: 140,          // px: melee aliens run at a target closer than this, else walk
  MEMORY: 4,           // s a group contact is followed with no target (OG soldiers 4)
};

// ---------------------------------------------------------------- defs
// Soldier-like flock and morale (aliens are a trained army); a little looser.
export const ALIEN_FLOCK = Object.freeze({
  personalSpace: 1.2, // contact × 1.2 = personal space
  separation: 34,     // push apart
  alignment: 0.25,    // match group mates' velocity
  cohesion: 0.04,     // pull to group centre
  formation: 0.8,     // pull back to the painted spot (soldiers 1.2)
  herd: 0, herdSpacing: 0,
  flockByState: [1, 1, 0.3, 1, 0.3, 0.25],    // Idle, Advance, Engage, Alert, Charge, Flee
  formationByState: [1, 1, 0.3, 1, 0, 0],
});
export const ALIEN_MORALE = Object.freeze({
  baseline: 0.85,     // starting nerve × bravery
  oddsWeight: 0.45,   // − (odds − 1) × 0.45
  fearWeight: 0.03,   // − fear field × 0.03
  casualtyWeight: 0.1,// − share of the group lost × 0.1
  woundWeight: 0.1,   // − share of own hp lost × 0.1
  hitShock: 0.01, suppression: 0.01,
  canBreak: true, breakAt: 0.22, rallyAt: 0.5, minFleeTime: 2.5,
  dropRate: 2.4, recoverRate: 0.3, panicFear: 0.4, deathFear: 0.6,
});
// Machines (UFO): no morale, never break.
export const MACHINE_MORALE = Object.freeze({
  baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 0, recoverRate: 0, panicFear: 0, deathFear: 0.3,
});

/** Register a Space unit: the tab's defaults + `over` (over wins). */
export function alien(over) {
  return registerUnit({
    category: 'space', faction: F.Side, intelligence: INT.Trained, infectable: true, melee: false,
    locomotion: 0, radiusJitter: 0.06, accel: 700, decel: 700, turnRate: 8, turnSpeedFalloff: Infinity,
    sightRange: 330, alertSightRange: 360, stickyTarget: false, reactionTime: 0.3, huntRange: Infinity, minDistance: 0,
    drilled: false, flammability: 0.3, density: 1, brushSpacing: 22,
    risenMode: 'body',   // risen.js builds risen_<type>: a zombie in an alien's body (people-like, as the pirates)
    ...over,
    flock: { ...ALIEN_FLOCK, ...(over.flock || {}) },
    morale: over.morale || ALIEN_MORALE,
    look: { attack: { time: 0.3 }, ...(over.look || {}) },
  });
}
/** Every Space unit's u.b starts with these keys (one hidden class per type). act/actT/victim = the pose contract. */
export function initBag(w, u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1;
  b.next = 0; b.next2 = 0; b.t0 = 0; b.k = 0; b.x0 = 0; b.y0 = 0; b.prey = -1;
  u.subState = 0;
}

// ---------------------------------------------------------------- brain pieces
export const unitOf = (w, id) => (id >= 0 ? w.unitById(id) : null);
/** The current target if it still lives, else null (and target -1). */
export function targetOf(w, u) {
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0) return t;
  u.target = -1; return null;
}
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }
/** Pose code (STEP6.md Space table): b.act + the time it started. */
export function act(w, u, code) { const b = u.b; if (b.act !== code) { b.act = code; b.actT = w.time; } }
export function actAge(w, u) { return w.time - u.b.actT; }
/** A target-free special may go off: always on its own, only while the player attacks when possessed. */
export function canAuto(w, u) { return u.possessed !== 1 || attackHeld(w); }
export function clearLine(w, u) { return u.los === 1 || w.walls.count === 0; }
export function grounded(o) { return !(o.z > SPACE.GROUNDED) && !(o.climb > 0); }
export function flying(o) { return o.leaping === LEAP.FLY || o.def.flies === true; }
function markEngaged(w, u) { const g = u.group; if (g >= 0) w.groups.markEngaged(g); }
/** No target: go to the group's fight, else stand. */
export function idle(w, u) { if (!followGroup(w, u, u.def.walkSpeed, SPACE.MEMORY)) setState(u, STATE.IDLE); }
/** Morale broke: run. Returns true if it did. */
export function fleeing(w, u, t) {
  if (u.state !== STATE.FLEE) return false;
  fleeSteer(w, u, t, u.def.runSpeed);
  return true;
}
/** Close on t: run inside SPACE.CHASE, else walk (Charge / Advance). */
export function closeOn(w, u, t, dx, dy, d) {
  const near = d < SPACE.CHASE;
  advanceTo(w, u, t, dx, dy, clearLine(w, u), near ? u.def.runSpeed : u.def.walkSpeed);
  if (near) setState(u, STATE.CHARGE);
}
/** Keep about `want` px from t (ranged aliens between shots): step in / back off; faces it. */
export function keepAt(w, u, t, dx, dy, d, want, band) {
  setState(u, STATE.ENGAGE);
  u.face = Math.atan2(dy, dx);
  const sp = u.def.walkSpeed;
  if (d > want + band) { u.goalX = (dx / d) * sp; u.goalY = (dy / d) * sp; }
  else if (d < want - band) { u.goalX = (-dx / d) * sp; u.goalY = (-dy / d) * sp; }
}
/**
 * meleeFight(w, u, t, W, dx, dy, d) → 0 out of reach, 1 engaged, 2 struck this tick.
 * W: {damage, damageJitter, push, stun, cooldown, cooldownJitter, reach (gap past both radii), band, facing, circle, backStep, close}.
 */
export function meleeFight(w, u, t, W, dx, dy, d) {
  const reach = u.radius + t.radius + W.reach;
  if (d > reach + W.band) return 0;
  setState(u, STATE.ENGAGE); markEngaged(w, u);
  const a = Math.atan2(dy, dx), def = u.def;
  u.face = a;
  let r = 1;
  if (d > reach) { const cs = W.close !== undefined ? W.close : def.walkSpeed * 0.6; u.goalX = (dx / d) * cs; u.goalY = (dy / d) * cs; }
  else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < W.facing) { meleeStrike(w, u, t, W); r = 2; }
  circle(w, u, t, dx, dy, d, def, W.circle, W.backStep !== false);
  oddsApproach(w, u, t, dx, dy, d, def);
  return r;
}
/** Empty swing (possessed, attack held at nobody, no special ready). */
export function swing(w, u, cd) {
  if (u.cooldown > 0) return;
  u.attack = 1; u.cooldown = cd;
  w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
}
/** A spot a unit may stand on: inside the field by `edge`, not in a wall tile. */
export function standable(w, x, y, edge) {
  return x > edge && y > edge && x < w.W - edge && y < w.H - edge && !(w.walls.count > 0 && w.walls.isSolidAt(x, y));
}

// ---------------------------------------------------------------- floats (STEP6 shared status u.floating)
/** May o be floated (gravity bubble, astronaut punch)? Flyers, bosses, props, mass > 8 and anyone already up never float. */
export function canFloat(w, o) {
  const d = o.def;
  return o.hp > 0 && !o.dead && !d.prop && !d.boss && !flying(o) && o.mass <= SPACE.FLOAT_MASS && grounded(o) &&
    o.inside < 0 && o.hurled !== 1 && o.leaping === 0 && !(o.floating > w.time) && d.untossable !== true;
}
const WS = new WeakMap();
function ws(w) {
  let s = WS.get(w);
  if (!s) { s = { floats: [], free: [] }; WS.set(w, s); }
  return s;
}
onWorldClear((w) => { const s = WS.get(w); if (s) { for (const e of s.floats) s.free.push(e); s.floats.length = 0; } });
/**
 * floatHard(w, v, secs, by, base, perMass, max, hit): v floats `secs` (steering lifts it, STEP6), then drops hard: it takes
 * base + perMass × mass (≤ max) and whoever it lands on takes `hit` + is knocked down (dinos' landing record). Over water:
 * a splash, no drop damage. `by` (the caster) is credited.
 */
export function floatHard(w, v, secs, by, base, perMass, max, hit) {
  v.floating = w.time + secs; v.vz = 0;
  const s = ws(w);
  for (let k = 0; k < s.floats.length; k++) if (s.floats[k].id === v.id) { s.floats[k].by = by ? by.id : -1; return; }
  const e = s.free.pop() || { id: -1, by: -1, base: 0, per: 0, max: 0, hit: 0 };
  e.id = v.id; e.by = by ? by.id : -1; e.base = base; e.per = perMass; e.max = max; e.hit = hit;
  s.floats.push(e);
}
function dropK(s, k) { s.free.push(s.floats[k]); s.floats[k] = s.floats[s.floats.length - 1]; s.floats.pop(); }
// After steering: a gravity float that ended drops hard (straight down at DROP_SPEED); dinoFlung does the landing.
function floatSys(w) {
  const s = WS.get(w); if (!s || !s.floats.length) return;
  for (let k = s.floats.length - 1; k >= 0; k--) {
    const e = s.floats[k], v = w.unitById(e.id);
    if (!v || !(v.hp > 0) || v.inside >= 0 || v.hurled === 1) { dropK(s, k); continue; }
    if (v.floating > w.time) continue;
    const z = Math.max(0, v.z), impact = Math.sqrt(SPACE.DROP_SPEED * SPACE.DROP_SPEED + 2 * GRAVITY * z), bump = 8 * impact / 400;
    const want = Math.min(e.max, e.base + e.per * v.mass);
    v.vz = -SPACE.DROP_SPEED; v.thrownAt = w.time;
    flung(w, v, unitOf(w, e.by), Math.max(0, want - bump), e.hit);   // the shared landing bump (8·impact/400) is part of the drop
    w.emit('descend', { x: v.x, y: v.y, v: 1, type: v.type, drop: 1 });   // STEP6 SPACE AUDIO: the bubble pops, it slams down
    dropK(s, k);
  }
}
registerSystem('spaceFloat', floatSys, 'steering');

// ---------------------------------------------------------------- projectiles
const _probe = { id: -1, faction: 0, team: -1, def: null, x: 0, y: 0 };
export function hittable(p, u) { _probe.faction = p.faction; _probe.team = p.team; return canHit(_probe, u); }
export function ownerOf(w, p) { if (p.owner < 0) return null; const o = w.unitById(p.owner); return o && !o.removed ? o : null; }
export function outside(w, x, y) { return x < 0 || y < 0 || x > w.W || y > w.H; }
// First unit a segment touches (x0,y0)+(dx,dy)·t, t in [0, tMax]: SWEEP.t = where. Skips the dead, the swallowed, units
// under water (as bullets do), friends; props only when `props` (rays and rockets hit trees, the shrink ring passes them).
export const SWEEP = { t: Infinity };
let _w = null, _p = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _F = 1, _pad = 0, _props = true, _best = null, _bestT = Infinity;
function segOne(u) {
  if (!(u.hp > 0) || u.inside >= 0 || (!_props && u.def.prop) || !hittable(_p, u) || submerged(_w, u)) return;
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ox - _dx * t, qy = oy - _dy * t, R = u.radius + _pad;
  if (qx * qx + qy * qy < R * R && t < _bestT) { _bestT = t; _best = u; }
}
export function sweepFirst(w, p, x0, y0, dx, dy, tMax, pad, props) {
  const F2 = dx * dx + dy * dy || 1e-6, len = Math.sqrt(F2);
  _w = w; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F2; _pad = pad; _props = props; _best = null; _bestT = tMax;
  w.query(x0 + dx / 2, y0 + dy / 2, len / 2 + SPACE.MARGIN + pad, segOne);
  const hit = _best; SWEEP.t = _bestT;
  _w = null; _p = null; _best = null;
  return hit;
}
/** Height of a shot fired from up high (jetpack, UFO): p.rise at the muzzle, falling p.drop px per px flown (art: p.z). */
export function shotHeight(p, z, dist) { p.rise = z; p.drop = z / Math.max(20, dist); p.z = z; }
export function stepHeight(p) { if (p.rise > 0) { const fl = Math.hypot(p.vx, p.vy) * (p.maxLife - p.life); p.z = Math.max(0, p.rise - p.drop * fl); } }

/** An effect projectile riding on unit v (bubble, mind): damage 0, never hits; its kind's step follows v and removes it. */
export function spawnEffect(w, kind, owner, v, life) {
  const p = spawnProjectile(w, kind, v.x, v.y, 0, 0, life, 0, owner.faction, owner);
  if (!p) return null;
  p.host = v.id; p.vid = v.id; p.z = v.z; p.r = v.radius; p.k = 0;   // vid: SPACE-ART's name for the unit it rides on
  return p;
}
/** Move an effect projectile onto its unit (+ lift above the ground). */
export function rideOn(p, v, lift) { p.px = p.x; p.py = p.y; p.x = v.x; p.y = v.y; p.z = Math.max(0, v.z) + lift; p.vx = v.vx; p.vy = v.vy; }

// ---------------------------------------------------------------- water / ground
export function deepAt(w, x, y) { return w.waterCells > 0 && depthAt(w, x, y) >= DEEP; }
export function wetAt(w, x, y) { return w.waterCells > 0 && depthAt(w, x, y) >= WET; }
