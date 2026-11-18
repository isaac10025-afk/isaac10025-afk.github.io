// laserbot (OURS, Robots tab): range 260. Charges 0.4 s (eye glows), then a beam that SWEEPS 30° across over 1.2 s:
// every unit its shots could hit on the beam line, up to the first wall (or an enemy shield dome's edge), takes 30 dps in
// 0.1 s pulses (3 each); a flammable one may catch fire (ignite chance 0.1 per pulse × flammability; metal never).
// Cooldown 2.5 s from the end of the beam. In its face it bonks (6). Stands still while charging and firing.
// b.act: 1 charge → `charge`; 2 beam → `beam`. During act 2 the art reads b.beamA (rad, world angle) and b.beamL (px):
// the beam starts at the bot's edge (u.x + cos(beamA) × radius, same for y) and runs beamL px from there.
import { robot, initB, setAct, actAge, begin, targetOf, idle, keepRange, melee, emptySwing, losClear, mayAttack, submerged, hypot, angleDiff, STATE, DT, CB, setState, ROBOT } from './_lib.js';
import { isMetal } from './magnetbot.js';
import { domeCut, cutDome, hitDome } from './shieldbot.js';
import { aimAngle } from '../../systems/possess.js';
import { canHit, ALL_MASK } from '../../factions.js';

const T = {
  hp: 120, // hit points
  mass: 2, // -
  walk: 55, // px/s
  run: 90, // px/s
  range: 260, // px: beam length
  holdAt: 0.9, // × range: walks in until the target is this close
  minRange: 70, // px: backs off from a target closer than this
  charge: 0.4, // s charging (b.act 1)
  beam: 1.2, // s of beam (b.act 2)
  sweep: 30 * Math.PI / 180, // rad swept across during the beam
  dps: 30, // damage per second on the beam line
  pulse: 0.1, // s between damage pulses (dps × pulse each)
  ignite: 0.1, // ignite chance per pulse × flammability (metal never)
  width: 3, // px past a unit's radius: still on the beam
  cooldown: 2.5, // s after the beam
  aimTol: 0.25, // rad: starts charging when facing the target this well
  bonk: {
    damage: 6, // melee bonk
    damageJitter: 1, // ±
    cooldown: 0.9, // s
    cooldownJitter: 0.2, // +
    push: 50, // shove
    stun: 0.1, // s
    reach: 4, // px past both radii
    band: 8, // px
    facing: 0.8, // rad
    circle: 0.3, // strafing
  },
};
const PULSE_TICKS = Math.round(T.pulse / DT);

// ---------------------------------------------------------------- the beam
let _w = null, _u = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _L = 0;
function beamOne(o) {
  const u = _u;
  if (o === u || !(o.hp > 0) || !canHit(u, o) || submerged(_w, o)) return;
  const ox = o.x - _x0, oy = o.y - _y0, s = ox * _dx + oy * _dy;
  if (s < -o.radius || s > _L + o.radius) return;
  const q = ox * _dy - oy * _dx, R = o.radius + T.width;
  if (q * q > R * R) return;
  CB.damage(_w, o, T.dps * T.pulse, u, undefined, _x0, _y0);
  if (!isMetal(o)) CB.ignite(_w, o, T.ignite);
}
// aim the beam along b.beamA: its length to the first wall / enemy dome; on a pulse tick it burns what is on it
function beamStep(world, u, burn) {
  const b = u.b, c = Math.cos(b.beamA), s = Math.sin(b.beamA);
  const x0 = u.x + c * u.radius, y0 = u.y + s * u.radius;
  let L = T.range;
  if (world.walls.count > 0) { const f = world.walls.raycast(x0, y0, x0 + c * L, y0 + s * L); if (f <= 1) L *= f; }
  L = domeCut(world, u, x0, y0, c, s, L);
  const dome = cutDome();
  b.beamL = L;
  if (!burn) return;
  if (dome) hitDome(world, dome, T.dps * T.pulse, x0 + c * L, y0 + s * L);
  _w = world; _u = u; _x0 = x0; _y0 = y0; _dx = c; _dy = s; _L = L;
  world.query(x0 + c * L * 0.5, y0 + s * L * 0.5, L * 0.5 + ROBOT.margin + T.width, beamOne, ALL_MASK);
  _w = null; _u = null;
}

function startCharge(world, u, aim) {
  const b = u.b;
  b.aimA = aim; setAct(world, u, 1);
  setState(u, STATE.ENGAGE);
  world.emit('laser', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 0 });
}
function startBeam(world, u) {
  const b = u.b;
  b.dir = world.rng() < 0.5 ? -1 : 1;
  b.a0 = b.aimA - b.dir * T.sweep * 0.5; b.beamA = b.a0; b.pulseTick = world.tick;
  setAct(world, u, 2);
  u.attack = 1; u.firedAt = world.time;
  if (world.stats) world.stats.shots++;
  world.emit('laser', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 1, ang: b.aimA });
  beamStep(world, u, false);
}

function brain(world, u) {
  const b = u.b;
  if (b.act === 2) {                                  // firing: the sweep runs its course (stunned or not)
    begin(world, u);
    const f = Math.min(1, actAge(world, u) / T.beam);
    b.beamA = b.a0 + b.dir * T.sweep * f;
    u.face = b.beamA; u.heading = b.beamA;
    beamStep(world, u, (world.tick - b.pulseTick) % PULSE_TICKS === 0);
    if (f >= 1) { setAct(world, u, 0); b.beamL = 0; u.cooldown = T.cooldown; }
    return;
  }
  const stunned = begin(world, u);
  const t = targetOf(world, u);
  if (b.act === 1) {                                  // charging: keeps aiming
    if (stunned) { setAct(world, u, 0); return; }
    if (t) { const lead = 0.6; b.aimA = Math.atan2(t.y + t.vy * lead - u.y, t.x + t.vx * lead - u.x); }
    else if (u.possessed === 1) b.aimA = aimAngle(world, u);
    u.face = b.aimA;
    if (actAge(world, u) >= T.charge) startBeam(world, u);
    return;
  }
  if (stunned) return;
  if (!t) { idle(world, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (melee(world, u, t, T.bonk, dx, dy, d) !== 0) return;
  if (!keepRange(world, u, t, dx, dy, d, T.minRange, T.holdAt * T.range)) return;
  const aim = Math.atan2(dy, dx);
  if (u.cooldown <= 0 && mayAttack(world, u) && losClear(world, u) && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) startCharge(world, u, aim);
}

const D = robot({
  type: 'laserbot',
  og: 'Laser Bot (ours)', // no OG original
  radius: 9, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: false,
  strength: 1.4,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 500,
  decel: 500,
  turnRate: 5,
  sightRange: 330,
  alertSightRange: 380,
  minDistance: T.minRange,
  brushSpacing: 24,
  look: { attack: { time: 0.4 } },
  weapon: { range: T.range }, // for possess (aim reach) and readers
  laser: T, // readers (tests): range, dps
  init(world, u) {
    initB(u);
    const b = u.b;
    b.beamA = 0; b.beamL = 0; b.aimA = 0; b.a0 = 0; b.dir = 1; b.pulseTick = 0;
    u.cooldown = world.rng() * T.cooldown * 0.5;
  },
  brain,
  // possessed, attack held at nobody: charge and sweep the beam along the aim
  possessFire(world, u, aim) {
    if (u.b.act === 0 && u.cooldown <= 0) startCharge(world, u, aim);
    else if (u.b.act === 0) emptySwing(world, u, T.bonk.cooldown);
  },
});
export default D;
export { T };
