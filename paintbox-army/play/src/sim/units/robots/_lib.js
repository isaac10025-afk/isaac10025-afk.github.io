// Robots tab shared pieces (Part 2 step 6, OURS: no OG source, our numbers). Owner: ROBOTS-SIM. Not a unit file.
// Contract: STEP6.md (Robots table + shared rules). Every robot is `machine: true` + `metal: true`: no blood, no morale
// (never flees), not raisable / infectable / mind-controllable. In deep water a robot that doesn't fly or wade shorts out
// (25 hp/s). Pieces here: the def defaults, the pose helpers (b.act / b.actT / b.victim), a small melee brain, range
// keeping, the "thickest enemy crowd" finder (saw bot, bomb bot), a suicide helper (bomb bot, magnet bot: the blast is
// dealt by a live unit, the wreck goes next tick) and projectile hit helpers. No allocation per tick; randomness only
// through world.rng.
import { registerUnit } from '../../defs.js';
import { F, INT, ENEMY, canHit } from '../../factions.js';
import { DT, STATE, LEAP, DEEP, hypot, angleDiff, setState } from '../../const.js';
import * as CB from '../../combat/index.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { attackHeld } from '../../systems/possess.js';
import { submerged } from '../../combat/env.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';

export { DT, STATE, LEAP, DEEP, hypot, angleDiff, setState, CB, F, ENEMY, moveTo, attackHeld, submerged };
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- shared numbers
export const ROBOT = Object.freeze({
  shortDps: 25, // hp/s a non-flying, non-wading robot loses standing in deep water (shorts out)
  shortSparkEvery: 20, // ticks between the spark puffs of a shorting robot
  memory: 4, // s a group contact is followed with no target
  sky: 30, // z px: higher than this = out of reach of a ground touch (saw, bomb, stomp); low flyers (drone 22) are in reach
  margin: 46, // max unit radius, added to radius queries (the core's QUERY_MARGIN)
  crowdNear: 40, // px: enemies this close to a candidate count as its crowd
  crowdCands: 16, // candidates scored per crowd search (keeps it cheap)
  flammability: 0.15, // steel: flames hurt, rarely sets it alight (0 would make flames pass through: fire.js)
});
// Flock: a loose drilled line (the robots march like a squad, no herding).
export const ROBOT_FLOCK = Object.freeze({
  personalSpace: 1.2, // contact × 1.2
  separation: 32, // push apart
  alignment: 0.25, // match group mates' velocity
  cohesion: 0.03, // pull to the group centre
  formation: 0.9, // pull back to the painted spot
  herd: 0, // no herding
  herdSpacing: 0, // -
  flockByState: [1, 1, 0.3, 1, 0.3, 0.25], // Idle, Advance, Engage, Alert, Charge, Flee
  formationByState: [1, 1, 0.3, 1, 0, 0], // formation weight per state
});
// No morale: machines never break. Their death splats a little fear for the living around.
export const ROBOT_MORALE = Object.freeze({
  baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 0, recoverRate: 0, panicFear: 0, deathFear: 0.2,
});

/** registerUnit for a robot: the tab's defaults + the spec (spec wins). */
export function robot(spec) {
  return registerUnit({
    category: 'robots', faction: F.Side, intelligence: INT.Trained,
    machine: true, metal: true, infectable: false, raisable: false, // STEP6 shared rules (no risenMode: the necro can't raise a wreck)
    flammability: ROBOT.flammability, burnTime: 3, conductivity: 2, density: 2,
    radiusJitter: 0.04, locomotion: 0, accel: 600, decel: 600, turnRate: 6, turnSpeedFalloff: Infinity,
    sightRange: 320, alertSightRange: 360, stickyTarget: true, reactionTime: 0.2, huntRange: Infinity, minDistance: 0,
    drilled: false, mines: true, maxSpeed: spec.runSpeed * 1.25,
    flock: ROBOT_FLOCK, morale: ROBOT_MORALE, holdsNerve: nerve,
    ...spec,
    look: { attack: { time: 0.35 }, ...(spec.look || {}) },
  });
}
function nerve() { return true; }

// ---------------------------------------------------------------- pose codes (STEP6.md Robots table)
/** Every robot's b{} starts with the pose keys; the unit's init adds its own (one hidden class per type). */
export function initB(u) { const b = u.b; b.act = 0; b.actT = 0; b.victim = -1; }
export function setAct(world, u, a) { const b = u.b; if (b.act !== a) { b.act = a; b.actT = world.time; } }
export function actAge(world, u) { return world.time - u.b.actT; }

// ---------------------------------------------------------------- brain start
/** Deep water shorts a robot out (not flyers, not waders). Run at the top of every robot brain. */
export function shortOut(world, u) {
  if (!(u.wet >= DEEP) || u.def.wades || u.leaping === LEAP.FLY || u.z > 0) return;
  CB.damage(world, u, ROBOT.shortDps * DT, null, 'water');
  if ((world.tick + u.index) % ROBOT.shortSparkEvery === 0) world.emit('spark', { x: u.x, y: u.y - u.radius, ang: -Math.PI / 2 + world.rng() - 0.5, size: 1 });
}
/** Brain start: short-out, goal reset; true = stunned (the tick is done). */
export function begin(world, u) {
  shortOut(world, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return true; }
  return false;
}
/** May the unit start an attack on its own? Possessed: only while the player holds the attack. */
export function mayAttack(world, u) { return u.possessed !== 1 || attackHeld(world); }
export function losClear(world, u) { return u.los === 1 || world.walls.count === 0; }
export function targetOf(world, u) { return CB.targetOf(world, u); }

// ---------------------------------------------------------------- moving
/** No target: go to the group's fight, else stand. */
export function idle(world, u, speed = u.def.walkSpeed) { if (!followGroup(world, u, speed, ROBOT.memory)) setState(u, STATE.IDLE); }
/** Walk (or run) at t around walls. */
export function closeOn(world, u, t, dx, dy, speed) { CB.advanceTo(world, u, t, dx, dy, losClear(world, u), speed); }
/**
 * Keep t between minR and maxR: walk in when farther, back off when closer, else stand (Engage) facing it.
 * Returns true when it is in the band (ready to shoot).
 */
export function keepRange(world, u, t, dx, dy, d, minR, maxR) {
  const def = u.def;
  if (d > maxR || !losClear(world, u)) { closeOn(world, u, t, dx, dy, def.walkSpeed); return false; }
  setState(u, STATE.ENGAGE);
  u.face = Math.atan2(dy, dx);
  if (d < minR) { u.goalX = (-dx / d) * def.walkSpeed; u.goalY = (-dy / d) * def.walkSpeed; }
  return true;
}

// ---------------------------------------------------------------- melee
function markEngaged(world, u) { if (u.group >= 0) world.groups.markEngaged(u.group); }
/**
 * melee(world, u, t, W, dx, dy, d) → 0 out of reach, 1 engaged, 2 struck this tick.
 * W: {damage, damageJitter, push, stun, cooldown, cooldownJitter, reach (gap past both radii), band, facing, circle}.
 */
export function melee(world, u, t, W, dx, dy, d) {
  const reach = u.radius + t.radius + W.reach;
  if (d > reach + W.band) return 0;
  setState(u, STATE.ENGAGE); markEngaged(world, u);
  const a = Math.atan2(dy, dx), def = u.def;
  u.face = a;
  let r = 1;
  if (d > reach) { const cs = def.walkSpeed * 0.6; u.goalX = (dx / d) * cs; u.goalY = (dy / d) * cs; }
  else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < W.facing) { CB.meleeStrike(world, u, t, W); r = 2; }
  CB.circle(world, u, t, dx, dy, d, def, W.circle, true);
  return r;
}
/** Possessed, attack held at nobody: an empty swing (the pose, nothing hit). */
export function emptySwing(world, u, cooldown) {
  if (u.cooldown > 0) return;
  u.attack = 1; u.cooldown = cooldown;
  world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
}

// ---------------------------------------------------------------- targets
/** Can a ground touch (saw, bomb, stomp) reach o? */
export function touchable(o) { return !(o.z > ROBOT.sky) && !(o.climb > 0) && o.inside < 0 && !o.def.prop; }
const CQ = new Array(48).fill(null), CN = new Array(64).fill(null);
/**
 * The thickest enemy crowd within R of u: the enemy with the most enemies of u within ROBOT.crowdNear of it, nearer
 * ones winning ties. Ground units only (high flyers out). Returns the unit or null.
 */
export function crowdTarget(world, u, R) {
  const mask = ENEMY[u.faction];
  const n = world.queryMask(u.x, u.y, R, mask, CQ, CQ.length);
  let best = null, bs = -Infinity, scored = 0;
  for (let k = 0; k < n; k++) {
    const o = CQ[k]; CQ[k] = null;
    if (scored >= ROBOT.crowdCands || o.dead || !(o.hp > 0) || !touchable(o) || submerged(world, o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d > R || (o.unseen > 0 && d > o.unseen)) continue;
    scored++;
    const c = world.queryMask(o.x, o.y, ROBOT.crowdNear, mask, CN, CN.length);
    for (let j = 0; j < c; j++) CN[j] = null;
    const s = c - (1.5 * d) / R;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

// ---------------------------------------------------------------- suicide units (bomb bot, magnet bot)
// The blast is dealt by the live unit (it gets the kills, and a driving player sees it land); its own blast skips it
// (hp read as 0 for that one call: no self-hit, no toss). The wreck goes on the NEXT tick with no killer (its harm record
// wiped), and nothing hurts it in between (def.damageMul → spentMul). System 'robots:wreck' after brain; it returns at
// once while nothing is spent, so other battles never pay for it.
const SPENT = new WeakMap();   // world -> live list of spent units
function spentList(world) { let L = SPENT.get(world); if (!L) { L = []; SPENT.set(world, L); } return L; }
onWorldClear((w) => { const L = SPENT.get(w); if (L) L.length = 0; });
/** u blows up now with `blast` (a registered blast name or def) for dmg; it is wrecked next tick. */
export function blowUp(world, u, blast, dmg) {
  const hp = u.hp;
  u.hp = 0; CB.explode(world, u.x, u.y, blast, u, dmg); u.hp = hp;
  const b = u.b;
  b.spent = 1; b.spentTick = world.tick;
  u.target = -1; u.burning = 0;
  spentList(world).push(u);
}
function wreckRun(world) {
  const L = SPENT.get(world); if (!L || L.length === 0) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const u = L[i];
    if (!u.dead && world.tick <= u.b.spentTick) continue;
    if (!u.dead) { u.harmBy = -1; u.harmByType = null; u.harmByFaction = -1; u.burning = 0; u.hp = 0; }
    L[i] = L[L.length - 1]; L.pop();
  }
}
registerSystem('robots:wreck', wreckRun, 'brain');
export function spentMul(world, u) { return u.b.spent === 1 ? 0 : 1; }

// ---------------------------------------------------------------- projectile helpers (our kinds)
const _probe = { id: -1, faction: 0, team: -1, def: null, x: 0, y: 0 };
/** Can projectile p (its faction / team) hit unit u? */
export function hittable(p, u) { _probe.faction = p.faction; _probe.team = p.team; return canHit(_probe, u); }
export function ownerOf(world, p) { if (p.owner < 0) return null; const o = world.unitById(p.owner); return o && !o.removed ? o : null; }
export function outside(world, x, y) { return x < 0 || y < 0 || x > world.W || y > world.H; }
