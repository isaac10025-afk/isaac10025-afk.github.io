// Possess (Part 2 step 3, OURS: OG has no possession). Owner: lead. Contract: game/src/sim/POSSESS.md.
// The player takes over one unit. The unit keeps its own brain, so every unit attacks with its own weapon and moves
// (the dragon breathes, the ape grabs, the gator holds): the player only decides WHERE it goes and WHAT it attacks.
//   runPre  (after morale, before brain): no fleeing, no reaction delay; the target is the enemy the player aims at
//           while the attack is held, else none (so the unit never attacks on its own).
//   runPost (after brain, before steering): the stick replaces the brain's goal (stick let go: standing still, or the
//           brain's own moves while attacking); the aim replaces its facing unless the brain is aiming at the picked
//           enemy (aim assist). Attack held with nobody in the aim: the unit's
//           def.possessFire(world, u, aim, ax, ay) if it has one (guns shoot at the ground, grenades land on the aim),
//           else the shared gun rule for gun units, else an empty swing.
// The whole system costs nothing while nobody is possessed (no random draws: OG-matching battles stay the same).
import { STATE, LEAP, hypot, angleDiff, wrapAngle } from '../const.js';
import { ENEMY } from '../factions.js';
import { onWorldClear } from '../world.js';
import { gunFire } from '../combat/gun.js';

export const POSSESS = Object.freeze({
  DEAD_ZONE: 0.12,     // stick below this = standing still
  CONE: 0.6,           // rad: an enemy this far off the aim can be picked
  CONE_NEAR: 16,       // px past both radii: close enemies are picked even further off the aim
  CONE_WEIGHT: 4,      // score = distance x (1 + 4 x angle off)
  POINT_PICK: 70,      // mouse aim: an enemy within 70 px (+ its radius) of the cursor point wins
  MIN_REACH: 140,      // the aim reaches at least this far (short-sighted units)
  SWING_COOLDOWN: 0.45,// empty swing (no target, no possessFire)
  PICK_CAP: 64,
});

const pickTmp = new Array(POSSESS.PICK_CAP);
const P0 = () => ({ id: -1, mx: 0, my: 0, aim: NaN, aimX: NaN, aimY: NaN, fire: false, tap: 0, picked: -1, since: 0 });

export function state(world) { return world.possess || (world.possess = P0()); }
onWorldClear((world) => { if (world.possess) world.possess = P0(); });

/** The possessed unit, or null. */
export function possessed(world) {
  const P = world.possess; if (!P || P.id < 0) return null;
  const u = world.unitById(P.id);
  return u && u.hp > 0 ? u : null;
}
/** Can the player take this unit over? Props (tree, barrel, anthill) can't move or fight. */
export function canPossess(u) { return !!u && !u.dead && !u.removed && u.hp > 0 && !u.def.prop; }

/** Take over u (drops the last one). Returns true if it worked. */
export function possess(world, u) {
  if (!canPossess(u)) return false;
  const P = state(world);
  if (P.id === u.id) return true;
  if (P.id >= 0) release(world, 'switch');
  P.id = u.id; P.since = world.time; P.mx = P.my = 0; P.fire = false; P.tap = 0; P.picked = -1;
  u.possessed = 1; u.target = -1; u.react = 0;
  world.emit('possess', { x: u.x, y: u.y, id: u.id, type: u.type });
  return true;
}
/** Back to watching. why: 'leave' (X) | 'died' | 'switch' | 'turned'. */
export function release(world, why = 'leave') {
  const P = world.possess; if (!P || P.id < 0) return;
  const u = world.byId.get(P.id);
  if (u) { u.possessed = 0; u.target = -1; }
  const x = u ? u.x : 0, y = u ? u.y : 0, type = u ? u.type : null;
  P.id = -1; P.fire = false; P.mx = P.my = 0; P.tap = 0; P.picked = -1;
  world.emit('unpossess', { x, y, type, why });
}
/**
 * Player input, any time (read every tick). mx, my: move stick -1..1 (screen = world axes). aim: angle (rad) or NaN.
 * aimX, aimY: a world point (mouse) or NaN. fire: attack held. tap: one attack (a quick tap on the aim side).
 */
export function setInput(world, inp) {
  const P = state(world);
  if (inp.mx !== undefined) P.mx = inp.mx;
  if (inp.my !== undefined) P.my = inp.my;
  if (inp.aim !== undefined) P.aim = inp.aim;
  if (inp.aimX !== undefined) P.aimX = inp.aimX;
  if (inp.aimY !== undefined) P.aimY = inp.aimY;
  if (inp.fire !== undefined) P.fire = !!inp.fire;
  if (inp.tap) P.tap = Math.max(P.tap, 6);   // a tap holds the attack for 6 ticks (0.1 s): enough for any brain to strike
}

function aimOf(P, u) {
  if (P.aimX === P.aimX && P.aimY === P.aimY) { const dx = P.aimX - u.x, dy = P.aimY - u.y; if (dx * dx + dy * dy > 4) return Math.atan2(dy, dx); }
  return P.aim === P.aim ? P.aim : u.heading;
}
function hiddenFrom(u, t, d) { const h = u.def.seesLurkers ? t.unseenBySeers : t.unseen; return h > 0 && d > h; }

/** The enemy the player is aiming at (or null). */
export function pickTarget(world, u, P) {
  const def = u.def, mask = ENEMY[u.faction];
  if (!mask) return null;
  const w = def.weapon, reach = Math.max(POSSESS.MIN_REACH, def.alertSightRange || 0, def.sightRange || 0, (w && w.range) || 0);
  world.syncGrid();
  const n = world.queryMask(u.x, u.y, reach, mask, pickTmp, POSSESS.PICK_CAP);
  const aim = aimOf(P, u), point = P.aimX === P.aimX && P.aimY === P.aimY;
  let best = null, bs = Infinity, bp = null, bpd = Infinity;
  for (let k = 0; k < n; k++) {
    const t = pickTmp[k]; pickTmp[k] = null;
    if (t === u || t.dead || !(t.hp > 0)) continue;
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy);
    if (hiddenFrom(u, t, d)) continue;
    if (point) {   // mouse: the enemy under / nearest the cursor
      const pd = hypot(t.x - P.aimX, t.y - P.aimY) - t.radius;
      if (pd < POSSESS.POINT_PICK && pd < bpd) { bpd = pd; bp = t; }
    }
    const off = d > 0.001 ? Math.abs(angleDiff(aim, Math.atan2(dy, dx))) : 0;
    if (off > POSSESS.CONE && !(off < Math.PI / 2 && d * Math.sin(off) < u.radius + t.radius + POSSESS.CONE_NEAR)) continue;
    const s = d * (1 + POSSESS.CONE_WEIGHT * off);
    if (s < bs) { bs = s; best = t; }
  }
  return bp || best;
}

function grounded(u) { return !(u.z > 0 || u.vz > 0) || u.leaping === LEAP.FLY; }

export function runPre(world) {
  const P = world.possess; if (!P || P.id < 0) return;
  const u = world.unitById(P.id);
  if (!u) { release(world, 'died'); return; }    // gone with nobody to hand over to (a rider or a frog takes it over)
  if (!(u.hp > 0)) return;                       // killed, not processed yet: lifecycle may hand it over
  if (!u.possessed) u.possessed = 1;
  // nerve: a possessed unit never runs away and reacts at once
  u.morale = 1; u.react = 0;
  if (u.state === STATE.FLEE) { u.state = STATE.IDLE; u.stateTime = 0; }
  const firing = (P.fire || P.tap > 0) && !world.holding;
  if (firing) {
    const t = pickTarget(world, u, P);
    P.picked = t ? t.id : -1;
    u.target = P.picked;
    u.los = t && world.walls.lineOfSight(u.x, u.y, t.x, t.y) ? 1 : 0;
  } else { P.picked = -1; u.target = -1; }
}

export function runPost(world) {
  const P = world.possess; if (!P || P.id < 0) return;
  const u = world.unitById(P.id);
  if (!u || !(u.hp > 0)) return;
  const def = u.def, firing = (P.fire || P.tap > 0) && !world.holding;
  if (P.tap > 0) P.tap--;
  let mx = P.mx, my = P.my;
  const m = hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  const moving = m > POSSESS.DEAD_ZONE;
  if (!moving) mx = my = 0;
  if (!(u.stun > 0) && !(u.climb > 0) && u.leaping !== LEAP.VAULT && grounded(u)) {
    if (moving) {
      // run speed; while attacking, the brain's own speed if faster (a cavalry or boar charge, a cheetah sprint)
      let sp = def.possessSpeed || def.runSpeed || def.walkSpeed || 0;
      if (firing) sp = Math.max(sp, hypot(u.goalX, u.goalY));
      u.goalX = mx * sp; u.goalY = my * sp; u.pathing = 1;
    } else if (!firing) { u.goalX = 0; u.goalY = 0; u.pathing = 1; }
    // attacking with the stick let go: the unit's own moves play (closing to range, a charge, an ape fetching a barrel
    // to throw): on a phone the right thumb alone means "go get him"; the stick always wins when it's pushed
    const aim = aimOf(P, u), aiming = P.aimX === P.aimX || P.aim === P.aim;
    if (!(firing && u.target >= 0 && u.face === u.face)) u.face = aiming ? aim : NaN;
  }
  // hoppers steer their hops, every tick (stick may be 0: then they bounce on the spot)
  if (def.possessMove) def.possessMove(world, u, mx, my, firing);
  if (firing && u.target < 0 && !(u.stun > 0)) freeFire(world, u, P);
}

// Attack with nobody in the aim.
function freeFire(world, u, P) {
  const def = u.def, aim = aimOf(P, u);
  let ax = P.aimX, ay = P.aimY;
  if (!(ax === ax && ay === ay)) { const r = (def.weapon && def.weapon.range) || 160; ax = u.x + Math.cos(aim) * r; ay = u.y + Math.sin(aim) * r; }
  if (def.possessFire) { def.possessFire(world, u, aim, ax, ay); return; }
  const w = def.weapon;
  if (w && w.projectileSpeed > 0 && w.magazine > 0) { gunFire(world, u, aim, def, w); return; }   // rifle, sniper: the shared gun rule
  if (u.cooldown > 0) return;   // empty swing: the attack pose, nothing hit
  u.attack = 1; u.cooldown = POSSESS.SWING_COOLDOWN;
  world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
}

/** For unit code: is this the possessed unit, and is the player attacking right now? */
export function isPossessed(u) { return u.possessed === 1; }
export function attackHeld(world) { const P = world.possess; return !!P && P.id >= 0 && (P.fire || P.tap > 0) && !world.holding; }
export function moveStick(world) { const P = world.possess; return P && P.id >= 0 ? [P.mx, P.my] : [0, 0]; }
export function aimAngle(world, u) { const P = world.possess; return P ? aimOf(P, u) : u.heading; }
export { wrapAngle };
