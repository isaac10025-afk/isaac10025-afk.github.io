// drone (OURS, Robots tab): a tiny low flyer (z 22) in swarms. Crosses walls and water; melee CAN reach it (low flyer,
// STEP6 shared rules), shots too. Zap: an instant spark line at an enemy within 70 px (4 dmg every 0.5 s), emitted as the
// event `zap` {x, y, x1, y1, z, type, id} (no projectile). Swarm: each drone circles its target at its own angle, so a
// swarm spreads round a victim instead of piling into one spot (flyers skip steering's neighbour push).
// Webbed (u.webbed): drops and sits on the ground (it can still zap from there), takes off again when the web lets go.
// b.act: 1 zap (0.15 s) → `zap`; flying → `fly0`/`fly1` (art, rotors).
import { robot, initB, setAct, actAge, begin, targetOf, idle, losClear, mayAttack, hypot, STATE, LEAP, DT, CB, ENEMY, setState, TAU } from './_lib.js';

const T = {
  hp: 25, // hit points
  mass: 0.3, // light: blasts fling it
  speed: 170, // px/s flying
  flyH: 22, // px: cruising height (a low flyer)
  rise: 4, // 1/s: eases to cruising height
  range: 70, // px: zap reach (centre to centre)
  zap: 4, // damage per zap
  every: 0.5, // s between zaps
  zapPose: 0.15, // s of the `zap` pose
  zapPush: 15, // small jolt on the victim
  orbit: 0.6, // × range: circles its target this far out
  spin: 1.2, // rad/s: how fast the swarm turns round its target
  approachAt: 1.4, // × range: farther than this it flies straight in
};

function zap(world, u, t) {
  CB.damage(world, t, T.zap, u);
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 1;
  CB.push(world, t, dx / d, dy / d, T.zapPush, 0);
  world.emit('zap', { x: u.x, y: u.y, z: u.z, x1: t.x, y1: t.y, type: u.type, id: u.id });
  u.attack = 1; u.cooldown = T.every * (0.9 + 0.2 * world.rng());
  if (world.stats) world.stats.shots++;
  setAct(world, u, 1);
}
// fly at (x, y) at speed; the brain owns the height
function flyTo(u, x, y, sp) {
  const dx = x - u.x, dy = y - u.y, d = hypot(dx, dy);
  if (d < 2) return;
  const s = Math.min(sp, 4 * d);
  u.goalX = (dx / d) * s; u.goalY = (dy / d) * s;
}

function brain(world, u) {
  const b = u.b;
  if (b.act === 1 && actAge(world, u) > T.zapPose) setAct(world, u, 0);
  if (u.floating > world.time) u.floating = world.time;   // STEP6: flyers never float
  const webbed = u.webbed > world.time;
  if (webbed) {                                       // the web drags it down: it sits where it lands
    if (u.leaping === LEAP.FLY) { u.leaping = 0; u.vz = 0; }
  } else if (u.leaping !== LEAP.FLY) {                // free again (or a toss is over): take off
    if (u.z <= 0 && u.vz <= 0) { u.leaping = LEAP.FLY; u.vz = 0; }
  }
  if (u.leaping === LEAP.FLY) { u.vz = 0; u.z += (T.flyH - u.z) * Math.min(1, T.rise * DT); }
  if (begin(world, u)) return;
  const t = targetOf(world, u);
  if (!t) { idle(world, u, T.speed); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  setState(u, d <= T.range ? STATE.ENGAGE : STATE.ADVANCE);
  u.face = Math.atan2(dy, dx);
  if (d <= T.range && u.cooldown <= 0 && mayAttack(world, u) && losClear(world, u)) zap(world, u, t);
  if (webbed) return;                                 // sits on the ground: turns and zaps only
  if (d > T.approachAt * T.range) { flyTo(u, t.x, t.y, T.speed); return; }
  // circle the target: every drone has its own phase round it, half the swarm turns each way
  const a = b.off + world.time * T.spin * (u.index & 1 ? 1 : -1), R = T.orbit * T.range;
  flyTo(u, t.x + Math.cos(a) * R, t.y + Math.sin(a) * R, T.speed);
}

const D = robot({
  type: 'drone',
  og: 'Drone (ours)', // no OG original; a name so the generic possess tests drive it
  radius: 5, // OG-raw (×1.1 on register)
  mass: T.mass,
  maxHp: T.hp,
  melee: false,
  strength: 0.25,
  walkSpeed: T.speed,
  runSpeed: T.speed,
  maxSpeed: T.speed * 1.3,
  accel: 900,
  decel: 900,
  turnRate: 10,
  sightRange: 300,
  alertSightRange: 340,
  flies: true, // a flyer (low: melee reaches it)
  lowFlyer: true, // STEP6: z 22, crosses walls and water, melee can hit it
  brushSpacing: 11, // tight swarm
  flock: { separation: 12, personalSpace: 1.1 },
  look: { attack: { time: 0.2 } },
  weapon: { range: T.range }, // for possess (aim reach) and readers
  init(world, u) {
    initB(u);
    const b = u.b;
    b.off = (u.index * 2.39996) % TAU; // own phase round the orbit (golden angle by index)
    u.leaping = LEAP.FLY; u.z = u.pz = T.flyH;
    u.cooldown = world.rng() * T.every;
  },
  brain,
  // possessed, attack held at nobody: zap the enemy nearest the aim point if one is in reach, else a spark at the aim
  possessFire(world, u, aim, ax, ay) {
    if (u.cooldown > 0) return;
    const t = world.findNearest(ax, ay, 40, ENEMY[u.faction], u, 1);
    if (t && hypot(t.x - u.x, t.y - u.y) <= T.range) { zap(world, u, t); return; }
    const k = Math.min(T.range, hypot(ax - u.x, ay - u.y) || 1) / (hypot(ax - u.x, ay - u.y) || 1);
    world.emit('zap', { x: u.x, y: u.y, z: u.z, x1: u.x + (ax - u.x) * k, y1: u.y + (ay - u.y) * k, type: u.type, id: u.id });
    u.attack = 1; u.cooldown = T.every; setAct(world, u, 1);
  },
});
export default D;
export { T };
