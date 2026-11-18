// tackler (OURS, Sports tab): a target 50-200 px away → he sprints at it (up to 1.5 s, steering after it). The first
// enemy he runs into is TACKLED: 25 dmg, stunned 1.4 s, slides ~40 px; he goes down with it (0.8 s). Heavy units
// (mass > 5, bosses) and braced shields facing him just stop him dead. Cooldown 3 s. Otherwise punches (8).
// b.act: 1 sprint → `sprint`, 2 tackle / down → `tackle` (b.victim = who he took down); `atk` punch.
import { athlete, initB, begin, meleeFight, closeOn, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, damage, push, hatKnock, ENEMY, braced, shrugs, grounded, COMMON, fleeSteer } from './_lib.js';

const T = {
  hp: 170, // hit points (STEP6)
  walk: 90, // px/s (STEP6)
  run: 180, // px/s (STEP6)
  tackle: {
    min: 50, // px: closest target he sprints at (STEP6)
    max: 200, // px: farthest (STEP6)
    speed: 235, // px/s sprinting (ours: a burst past his 180 run)
    time: 1.5, // s: longest sprint (STEP6)
    cooldown: 3, // s between sprints (STEP6)
    damage: 25, // to the one he takes down (STEP6)
    stun: 1.4, // s the victim is down (STEP6)
    slide: 40, // px the victim slides (STEP6); push = sqrt(2 × 300 px/s² stunned brake × 40) × its mass
    downTime: 0.8, // s he is down too (STEP6)
    heavy: 5, // mass: anything heavier just stops him (STEP6)
    gap: 3, // px past both radii: contact
    front: 0.2, // cos: only someone ahead of him (within ~78° of his run) counts
    bounceStun: 0.4, // s dazed after running into something he can't take down (ours)
    selfSlide: 0.35, // he keeps this share of his speed going down with the victim
  },
  punch: {
    damage: 8, // per punch (STEP6)
    damageJitter: 2, // ±
    cooldown: 0.7, // s
    cooldownJitter: 0.15, // +
    push: 60, // shove
    stun: 0.1, // s
    reach: 5, // px past both radii
    band: 16, // px
    facing: 0.6, // rad
    circle: 0.5, // strafing
  },
};
const SLIDE_V = Math.sqrt(2 * 300 * T.tackle.slide);   // 300 px/s² = steering's brake while stunned (STUN_ACCEL)

// ---------------------------------------------------------------- the sprint
let _u = null, _hit = null, _hd = Infinity;
function contactOne(o) {
  const u = _u;
  if (o === u || !(o.hp > 0) || o.inside >= 0 || o.def.prop || !grounded(o)) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d > u.radius + o.radius + T.tackle.gap) return;
  const c = Math.cos(u.heading), s = Math.sin(u.heading);
  if ((dx * c + dy * s) / d < T.tackle.front) return;
  if (d < _hd) { _hd = d; _hit = o; }
}
function startSprint(world, u, dirA) {
  const b = u.b;
  b.sa = dirA; b.sprintT = world.time;
  setAct(world, u, 1);
  setState(u, STATE.CHARGE);
  world.emit('charge', { x: u.x, y: u.y, v: 1, type: u.type });
}
function endSprint(world, u, act) {
  const b = u.b;
  b.cd = world.time + T.tackle.cooldown;
  setAct(world, u, act);
}
function tackle(world, u, o) {
  const b = u.b, dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001, ux = dx / d, uy = dy / d;
  if (o.mass > T.tackle.heavy || shrugs(o) || braced(o, u.x, u.y)) {   // a wall of meat (or shield): he stops dead
    u.vx = 0; u.vy = 0;
    if (u.stun < T.tackle.bounceStun) u.stun = T.tackle.bounceStun;
    world.emit('bounce', { x: u.x, y: u.y, v: 1, type: u.type });
    endSprint(world, u, 0);
    return;
  }
  damage(world, o, T.tackle.damage, u);
  if (o.hp > 0) push(world, o, ux, uy, SLIDE_V * Math.max(0.25, o.mass), T.tackle.stun);
  hatKnock(world, o, ux, uy, 0.8);
  b.victim = o.id;
  u.vx *= T.tackle.selfSlide; u.vy *= T.tackle.selfSlide;
  if (u.stun < T.tackle.downTime) u.stun = T.tackle.downTime;
  world.emit('trample', { x: o.x, y: o.y, v: 1, type: u.type });
  if (world.stats) world.stats.impacts = (world.stats.impacts || 0) + 1;
  endSprint(world, u, 2);
}
/** One sprint tick: steer (after the target, or straight on), look for the first enemy in his way. */
function sprintStep(world, u) {
  const b = u.b, t = targetOf(world, u);
  if (u.stun > 0 || u.state === STATE.FLEE || world.time - b.sprintT >= T.tackle.time) { endSprint(world, u, 0); return; }
  if (t) b.sa = Math.atan2(t.y - u.y, t.x - u.x);   // after the target; none (possessed, aimed at nobody): straight on
  const c = Math.cos(b.sa), s = Math.sin(b.sa);
  u.goalX = c * T.tackle.speed; u.goalY = s * T.tackle.speed; u.face = b.sa; u.pathing = 1;
  setState(u, STATE.CHARGE);
  _u = u; _hit = null; _hd = Infinity;
  world.query(u.x, u.y, u.radius + COMMON.margin + T.tackle.gap, contactOne, ENEMY[u.faction]);
  const o = _hit; _u = null; _hit = null;
  if (o) tackle(world, u, o);
}

const D = athlete({
  type: 'tackler',
  og: 'Tackler (ours)', // no OG original
  radius: 10, // OG-raw (STEP6)
  mass: 1.8, // STEP6
  maxHp: T.hp,
  melee: true,
  strength: 1.1,
  walkSpeed: T.walk,
  runSpeed: T.run,
  maxSpeed: T.tackle.speed * 1.35, // room for the sprint × cheer × speedMul
  brushSpacing: 23,
  look: { hat: true, attack: { time: 0.3 } }, // helmet can fly off
  weapon: { ...T.punch, range: T.tackle.max }, // possess: aim reach covers his sprint
  init(world, u) { initB(u); const b = u.b; b.sa = 0; b.sprintT = -9; b.cd = world.time + world.rng() * T.tackle.cooldown * 0.5; u.cooldown = world.rng() * T.punch.cooldown; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) >= T.tackle.downTime) { setAct(world, u, 0); b.victim = -1; }
    if (b.act === 1) { if (begin(world, u)) { endSprint(world, u, 0); return; } sprintStep(world, u); return; }
    if (begin(world, u)) return;
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE) { fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (b.act === 0 && world.time >= b.cd && d >= T.tackle.min && d <= T.tackle.max && losClear(world, u) && grounded(t)) {
      startSprint(world, u, Math.atan2(dy, dx)); sprintStep(world, u); return;
    }
    if (meleeFight(world, u, t, T.punch, dx, dy, d) === 0) closeOn(world, u, t, dx, dy, d);
  },
  // possessed, attack held at nobody: sprint the way he aims (tackles the first enemy in the way), else a punch
  possessFire(world, u, aim) {
    const b = u.b;
    if (b.act === 0 && world.time >= b.cd && !(u.stun > 0)) { startSprint(world, u, aim); return; }
    if (b.act === 0 && u.cooldown <= 0) { u.attack = 1; u.cooldown = T.punch.cooldown; world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); }
  },
});
export default D;
export { T };
