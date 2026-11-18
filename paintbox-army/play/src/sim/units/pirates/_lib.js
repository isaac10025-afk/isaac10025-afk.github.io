// Pirates tab (Part 2 step 4, OURS: no OG source, our numbers). Owner: PIRATES-SIM. Not a unit file.
// Shared pieces for the 8 pirates + the spawned-only gunner: def defaults, the b.act pose helpers (STEP4.md Pirates
// table), the melee brain, crews for machines (cannon), unit sweeps for our projectiles, and the water helpers.
// Every number the user may tune sits in a named table with a comment per line.
import { registerUnit } from '../../defs.js';
import { F, INT, canHit, maskBit } from '../../factions.js';
import { DT, STATE, DEEP, hypot, angleDiff } from '../../const.js';
import { meleeStrike, circle, oddsApproach, fleeSteer, advanceTo, initCombat, setState, targetOf, raycast } from '../../combat/index.js';
import * as CB from '../../combat/index.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { shoreAt } from '../../terrain/water.js';

export { DT, STATE, DEEP, hypot, angleDiff, setState, targetOf, initCombat };
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shared numbers
export const COMMON = Object.freeze({
  swimPace: 0.8, // speed × 0.8 in any water (OG units of this size wade at 0.35-0.75 in deep water; nobody drowns in OG)
  speedRoom: 1.35, // maxSpeed = runSpeed × 1.35: room for the captain's +15 % and the random 0.9-1.1 speedMul
  memory: 4, // s a group contact is followed with no target (OG soldiers use 4)
  chargeAt: 140, // px: melee pirates run (runSpeed) at a target closer than this, else walk
});
// Flock: soldier-like, a little looser (rowdy crews don't hold a line).
export const PIRATE_FLOCK = Object.freeze({
  personalSpace: 1.2, // contact × 1.2 = personal space
  separation: 34, // push apart
  alignment: 0.25, // match group mates' velocity
  cohesion: 0.04, // pull to group centre
  formation: 0.7, // pull back to the painted spot (soldiers 1.2)
  herd: 0, // no herding
  herdSpacing: 0, // -
  flockByState: [1, 1, 0.3, 1, 0.3, 0.25], // Idle, Advance, Engage, Alert, Charge, Flee
  formationByState: [1, 1, 0.3, 1, 0, 0], // formation weight per state
});
// Morale: break when clearly outnumbered or the crew is cut down; the captain's aura holds them.
export const PIRATE_MORALE = Object.freeze({
  baseline: 0.82, // starting nerve × bravery
  oddsWeight: 0.5, // − (odds − 1) × 0.5
  fearWeight: 0.03, // − fear field × 0.03
  casualtyWeight: 0.15, // − share of the group lost × 0.15 (rowdy: soldiers 0)
  woundWeight: 0.1, // − share of own hp lost × 0.1
  hitShock: 0.01, // − 0.01 per hit
  suppression: 0.01, // − 0.01 per near miss
  canBreak: true, // can run
  breakAt: 0.22, // runs below this
  rallyAt: 0.5, // comes back above this
  minFleeTime: 2.5, // s at least
  dropRate: 2.4, // morale falls fast
  recoverRate: 0.3, // and comes back slowly
  panicFear: 0.4, // fear splat when one breaks
  deathFear: 0.6, // fear splat when one dies
});
// Machines (cannon, ship): no morale, never break.
export const MACHINE_MORALE = Object.freeze({
  baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 0, recoverRate: 0, panicFear: 0, deathFear: 0.3,
});
export const MACHINE_FLOCK = Object.freeze({
  personalSpace: 1.05, separation: 12, alignment: 0, cohesion: 0, formation: 0, herd: 0, herdSpacing: 0,
  flockByState: [0, 0, 0, 0, 0, 0], formationByState: [0, 0, 0, 0, 0, 0],
});

// The captain's aura (captain.js writes b.aura / b.auraMul every tick): morale.js asks this before a pirate breaks.
export function holdsNerve(world, u) { return u.b.aura >= world.tick - 1; }

/** registerUnit for a pirate person: our defaults + the spec (spec wins). */
export function person(spec) {
  const run = spec.runSpeed;
  return registerUnit({
    category: 'pirates', faction: F.Side, intelligence: INT.Trained, infectable: true, flammability: 0.3,
    radiusJitter: 0.06, mass: 1, strength: 0.6, locomotion: 0, accel: 700, decel: 700, turnRate: 8, turnSpeedFalloff: Infinity,
    sightRange: 330, alertSightRange: 360, stickyTarget: false, reactionTime: 0.3, huntRange: Infinity, minDistance: 0,
    drilled: false, brushSpacing: 21, swims: true, waterPace: COMMON.swimPace, maxSpeed: run * COMMON.speedRoom,
    pirate: true, crew: true, flock: PIRATE_FLOCK, morale: PIRATE_MORALE, holdsNerve,
    ...spec,
    look: { hat: true, ...(spec.look || {}) },
  });
}

// ---------------------------------------------------------------- b.act pose codes (STEP4.md Pirates table)
/** Every pirate's b{} fields, set once in init (one hidden class per unit). */
export function initB(u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1; b.machine = -1; b.slot = -1; b.swim = 0; b.aura = -10; b.auraMul = 1; b.baseMul = u.speedMul;
}
export function setAct(world, u, a) { const b = u.b; if (b.act !== a) { b.act = a; b.actT = world.time; } }
export function actAge(world, u) { return world.time - u.b.actT; }
/** Start of every pirate person's brain: swim flag for the art, the captain's speed. */
export function prelude(world, u) {
  const b = u.b;
  b.swim = u.wet >= DEEP ? 1 : 0;
  u.speedMul = b.baseMul * (b.aura >= world.tick - 1 ? b.auraMul : 1);
}

// ---------------------------------------------------------------- melee
export function losClear(world, u) { return u.los === 1 || u.los === true || world.walls.count === 0; }
function markEngaged(world, u) { const g = u.group; if (g >= 0 && world.groups.markEngaged) world.groups.markEngaged(g); }
/**
 * meleeFight(world, u, t, W, dx, dy, d) → 0 out of reach, 1 engaged, 2 struck this tick.
 * W: {damage, damageJitter, push, stun, cooldown, cooldownJitter, reach (gap past both radii), band, facing, circle,
 *     backStep (default true: steps back while the swing pose is up, as OG soldiers), close (px/s stepping in, default walk × 0.6)}.
 */
export function meleeFight(world, u, t, W, dx, dy, d) {
  const reach = u.radius + t.radius + W.reach;
  if (d > reach + W.band) return 0;
  setState(u, STATE.ENGAGE); markEngaged(world, u);
  const a = Math.atan2(dy, dx), def = u.def;
  u.face = a;
  let r = 1;
  if (d > reach) { const cs = W.close !== undefined ? W.close : def.walkSpeed * 0.6; u.goalX = (dx / d) * cs; u.goalY = (dy / d) * cs; }
  else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < W.facing) { meleeStrike(world, u, t, W); r = 2; }
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

/**
 * The plain melee brain (deckhand, gunner, fists / whips): returns meleeFight's code (2 = struck this tick), or 0.
 * Callers run prelude(), the stun check and crewStep() first.
 */
export function meleeBody(world, u, W) {
  const t = targetOf(world, u);
  if (u.state === STATE.FLEE) { fleeSteer(world, u, t, u.def.runSpeed); return 0; }
  if (!t) { idle(world, u); return 0; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const r = meleeFight(world, u, t, W, dx, dy, d);
  if (r === 0) closeOn(world, u, t, dx, dy, d);
  return r;
}
/** Brain start shared by every pirate person. Returns true if the tick is done (stunned or manning a gun). */
export function begin(world, u, W) {
  prelude(world, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return true; }
  return u.b.machine >= 0 && crewStep(world, u, W);
}

// ---------------------------------------------------------------- crews (machines with slots: the cannon)
// A crewed machine moves at speed × crew alive / crew size and stops firing with nobody at a slot. Crew stand at fixed
// slots behind it and walk with it; a crew member that loses its machine fights as a normal pirate. Any pirate foot
// soldier (not the captain) near a machine with an empty slot takes the slot.
export const CREW = Object.freeze({
  back: 9, // px behind the machine's edge
  side: 11, // px sideways from the middle, per slot
  man: 22, // px from its slot = manning (counts for firing)
  claimR: 70, // px: free pirates this close take an empty slot
  claimEvery: 20, // ticks between slot checks per machine
  fend: 4, // px past melee reach: a crew member hits an enemy this close without leaving its slot
  walkBack: 120, // px: farther than this from its slot it paths back (walls) instead of walking straight
});
const _slot = new Float64Array(2);
export function slotPos(m, k, out = _slot) {
  const n = m.b.crew.length, c = Math.cos(m.heading), s = Math.sin(m.heading);
  const back = m.radius + CREW.back, side = (k - (n - 1) / 2) * 2 * CREW.side;
  out[0] = m.x - c * back - s * side; out[1] = m.y - s * back + c * side;
  return out;
}
/** Spawn n crew of `type` at the machine's slots (call from the machine's init). */
export function crewInit(world, m, n, type) {
  m.b.crew = new Int32Array(n).fill(-1); m.b.crewN = 0; m.b.manN = 0;
  for (let k = 0; k < n; k++) {
    slotPos(m, k);
    const c = world.spawn(type, _slot[0], _slot[1], { group: m.group, team: m.team, heading: m.heading, faction: m.faction, like: m });
    if (c) { m.b.crew[k] = c.id; c.b.machine = m.id; c.b.slot = k; }
  }
}
/** Recount the machine's crew: m.b.crewN alive and assigned, m.b.manN at their slots. Clears dead / gone slots. */
export function crewCount(world, m) {
  const cr = m.b.crew; let alive = 0, man = 0;
  for (let k = 0; k < cr.length; k++) {
    if (cr[k] < 0) continue;
    const c = world.unitById(cr[k]);
    if (!c || !(c.hp > 0) || c.b.machine !== m.id || c.b.slot !== k) { cr[k] = -1; continue; }
    alive++;
    slotPos(m, k);
    if (hypot(c.x - _slot[0], c.y - _slot[1]) <= CREW.man) man++;
  }
  m.b.crewN = alive; m.b.manN = man;
  return alive;
}
let _cm = null, _cw = null, _ck = -1;
function claimOne(o) {
  if (_ck < 0) return true;
  const d = o.def, b = o.b;
  if (o === _cm || !d.crew || !(o.hp > 0) || b.machine >= 0 || o.possessed === 1 || o.state === STATE.FLEE || o.stun > 0) return;
  const t = o.target >= 0 ? _cw.unitById(o.target) : null;   // busy in a sword fight: not now
  if (t && hypot(t.x - o.x, t.y - o.y) < o.radius + t.radius + 20) return;
  _cm.b.crew[_ck] = o.id; b.machine = _cm.id; b.slot = _ck;
  const cr = _cm.b.crew; _ck = -1;
  for (let k = 0; k < cr.length; k++) if (cr[k] < 0) { _ck = k; break; }
}
/** Every CREW.claimEvery ticks: free pirates nearby take empty slots. */
export function claimSlots(world, m) {
  const cr = m.b.crew;
  if ((world.tick + m.index) % CREW.claimEvery !== 0) return;
  let k0 = -1; for (let k = 0; k < cr.length; k++) if (cr[k] < 0) { k0 = k; break; }
  if (k0 < 0) return;
  _cm = m; _cw = world; _ck = k0;
  world.query(m.x, m.y, CREW.claimR, claimOne, maskBit(m.faction));
  _cm = null; _cw = null;
}
function leaveCrew(world, u) {
  const b = u.b, m = b.machine >= 0 ? world.unitById(b.machine) : null;
  if (m && m.b.crew && b.slot >= 0 && m.b.crew[b.slot] === u.id) m.b.crew[b.slot] = -1;
  b.machine = -1; b.slot = -1;
}
/** A crew member's tick: stand at the slot (walking with the machine), hit enemies that come right up. True = handled. */
export function crewStep(world, u, W) {
  const b = u.b, m = world.unitById(b.machine);
  if (!m || !(m.hp > 0) || u.possessed === 1 || u.state === STATE.FLEE || !m.b.crew || m.b.crew[b.slot] !== u.id) { leaveCrew(world, u); return false; }
  const t = targetOf(world, u);
  if (t) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d <= u.radius + t.radius + W.reach + CREW.fend) {
      setState(u, STATE.ENGAGE); markEngaged(world, u);
      const a = Math.atan2(dy, dx); u.face = a;
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < W.facing) meleeStrike(world, u, t, W);
      u.pathing = 1;
      return true;
    }
  }
  slotPos(m, b.slot);
  const sx = _slot[0], sy = _slot[1], dx = sx - u.x, dy = sy - u.y, d = hypot(dx, dy);
  if (d > CREW.walkBack) moveTo(world, u, sx, sy, u.def.runSpeed, !world.walls.count || world.lineOfSight(u.x, u.y, sx, sy));
  else if (d > 1.5) { const sp = Math.min(u.def.runSpeed, 5 * d + hypot(m.vx, m.vy)); u.goalX = (dx / d) * sp; u.goalY = (dy / d) * sp; }
  u.face = d > 30 ? Math.atan2(dy, dx) : (m.face === m.face ? m.face : m.heading);
  setState(u, m.state === STATE.ENGAGE ? STATE.ENGAGE : STATE.ALERT);
  u.pathing = 1;   // no formation pull: the slot is the spot
  return true;
}

// ---------------------------------------------------------------- projectile helpers (our kinds)
const _probe = { id: -1, faction: 0, team: -1, def: null, x: 0, y: 0 };
export function hittable(p, u) { _probe.faction = p.faction; _probe.team = p.team; return canHit(_probe, u); }
export function ownerOf(world, p) { if (p.owner < 0) return null; const o = world.unitById(p.owner); return o && !o.removed ? o : null; }
export function outside(world, x, y) { return x < 0 || y < 0 || x > world.W || y > world.H; }
export { raycast };

// ---------------------------------------------------------------- water
/** Shore distance in 8 px tiles at (x, y): 0 dry, 1-2 shallow ring, 3+ deep (terrain/water.js shoreAt). */
export function shore(world, x, y) { return world.waterCells > 0 ? shoreAt(world, x, y) : 0; }
export { CB };
