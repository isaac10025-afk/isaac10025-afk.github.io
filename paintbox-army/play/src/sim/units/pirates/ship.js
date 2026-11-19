// ship (OURS, Pirates tab): a fat little ship. Painted only on deep water (def.placeOk) and never leaves it (a puddle =
// it sits). Broadsides: 3 cannons a side; every 3.5 s per side it fires 3 cannonballs (cannon.js BALL: skip on water)
// at enemies within 400 px off that side, so it turns its beam to the enemy. Can't be pushed or tossed. Its deck burns
// even on water. At 0 hp it SINKS: it tilts and goes down over 3 s (no longer a target) while 6 deckhands swim out;
// then it is gone and its killer gets the kill.
// b.act: 1 broadside (0.4 s) → `fire` (b.side = +1 right of its heading / −1 left: which hull smokes), 2 sinking →
// `sink` (3 s from b.actT); bobbing → `bob0`/`bob1` (art). Extra systems: 'pirates-ship-water' after steering,
// 'pirates-ship-sink' after water.
import { registerUnit } from '../../defs.js';
import { F, INT, ENEMY } from '../../factions.js';
import { followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { splatNoise, submerged } from '../../combat/env.js';
import { initB, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, TAU, CB, MACHINE_MORALE, MACHINE_FLOCK, COMMON, shore } from './_lib.js';
import { fireBall, BALL } from './cannon.js';

const T = {
  hp: 2500, // hit points
  mass: 40, // can't be pushed (and untossable)
  speed: 45, // px/s on water
  accel: 90, // px/s²
  turnRate: 1.2, // rad/s
  placeShore: 3, // tiles (8 px) from the shore at least: where it can be painted (deep water)
  moveShore: 3, // tiles from the shore its middle must stay
  flammability: 0.5, // wood: burns (even afloat)
  broadside: {
    range: 400, // px
    reload: 3.5, // s per side
    guns: 3, // per side
    arc: 0.95, // rad: an enemy within ±54° of the beam is "off that side"
    spread: 0.05, // rad ± per ball
    portAlong: 0.55, // × radius: the 3 ports spread along the hull
    portOut: 0.8, // × radius: ports sit this far out from the middle
    firePose: 0.4, // s of the `fire` pose (b.act 1)
    recheck: 0.15, // s: a side with nobody off it looks again after this
    recoil: 18, // px/s shove away from the side that fired
  },
  sail: {
    closeTo: 0.8, // × range: farther targets → sail at them
    drift: 0.4, // × speed: drifts along its heading while firing
    tooClose: 140, // px: stands off from enemies closer than this
    feel: 18, // px past its radius: looks ahead for shallows
  },
  sink: {
    time: 3, // s to go down
    crew: 6, // deckhands that swim out
    crewOut: 70, // px/s they push off with
  },
};

const Q_CAP = 96, _q = new Array(Q_CAP).fill(null), _tg = [null, null, null], _td = new Float64Array(3);

// Sail toward angle `ang` at `sp`, feeling for shallows ahead: the first heading near `ang` with deep water wins.
const FEEL = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3];
function sail(world, u, ang, sp) {
  const reach = u.radius + T.sail.feel;
  for (let k = 0; k < FEEL.length; k++) {
    const a = ang + FEEL[k];
    if (shore(world, u.x + Math.cos(a) * reach, u.y + Math.sin(a) * reach) >= T.moveShore) { u.goalX = Math.cos(a) * sp; u.goalY = Math.sin(a) * sp; return; }
  }
  u.goalX = 0; u.goalY = 0;
}
// Up to 3 nearest enemies off one side (within range, within ±arc of the beam), into _tg; returns the count.
function sideTargets(world, u, side) {
  const B = T.broadside, nrm = u.heading + side * Math.PI / 2;
  const n = world.queryMask(u.x, u.y, B.range, ENEMY[u.faction], _q, Q_CAP);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = _q[k]; _q[k] = null;
    if (!(o.hp > 0) || submerged(world, o) || (o.unseen > 0 && hypot(o.x - u.x, o.y - u.y) > o.unseen)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy);
    if (d > B.range || Math.abs(angleDiff(nrm, Math.atan2(dy, dx))) > B.arc) continue;
    let j = m < 3 ? m++ : 3;
    if (j === 3) { if (d >= _td[2]) continue; j = 2; }
    while (j > 0 && _td[j - 1] > d) { _td[j] = _td[j - 1]; _tg[j] = _tg[j - 1]; j--; }
    _td[j] = d; _tg[j] = o;
  }
  return m;
}
// Fire one side: 3 balls from the 3 ports, at the side's targets (n > 0) or at the point (ax, ay).
function fireSide(world, u, side, n, ax, ay) {
  const B = T.broadside, b = u.b, h = u.heading, nrm = h + side * Math.PI / 2, ch = Math.cos(h), sh = Math.sin(h), cn = Math.cos(nrm), sn = Math.sin(nrm);
  for (let g = 0; g < B.guns; g++) {
    const along = (g - (B.guns - 1) / 2) * B.portAlong * u.radius;
    const px = u.x + ch * along + cn * u.radius * B.portOut, py = u.y + sh * along + sn * u.radius * B.portOut;
    let ang;
    if (n > 0) { const t = _tg[g % n], lead = hypot(t.x - px, t.y - py) / BALL.speed; ang = Math.atan2(t.y + t.vy * lead - py, t.x + t.vx * lead - px); }
    else ang = Math.atan2(ay - py, ax - px);
    const rel = angleDiff(nrm, ang);
    if (Math.abs(rel) > B.arc) ang = nrm + Math.sign(rel) * B.arc;                  // the guns only swing so far
    fireBall(world, u, px, py, ang + B.spread * (world.rng() - world.rng()));
  }
  for (let k = 0; k < 3; k++) _tg[k] = null;
  world.emit('shot', { x: u.x + cn * u.radius, y: u.y + sn * u.radius, v: 2.5, type: u.type, side });
  splatNoise(world, u.x, u.y, 1.2, 560);
  CB.push(world, u, -cn, -sn, B.recoil * u.mass, 0);
  u.attack = 1; u.firedAt = world.time;
  if (world.stats) world.stats.shots += B.guns;
  if (side > 0) b.cdR = B.reload; else b.cdL = B.reload;
  b.side = side;
  setAct(world, u, 1);
}
function broadsides(world, u) {
  const b = u.b;
  for (let side = 1; side >= -1; side -= 2) {
    if ((side > 0 ? b.cdR : b.cdL) > 0) continue;
    const n = sideTargets(world, u, side);
    if (n > 0) fireSide(world, u, side, n, 0, 0);
    else if (side > 0) b.cdR = T.broadside.recheck; else b.cdL = T.broadside.recheck;
  }
}

// ---------------------------------------------------------------- sinking (run by the 'pirates-ship-sink' system)
function startSink(world, u) {
  const b = u.b;
  b.sinking = 1; setAct(world, u, 2);
  b.kBy = u.harmBy; b.kType = u.harmByType; b.kFac = u.harmByFaction; b.kAt = u.harmByAt; b.kCause = u.harmCause;
  u.hp = 1; u.hidden = 0.001; u.burning = 0; u.target = -1;   // hidden: nobody targets a sinking ship
  world.emit('splash', { x: u.x, y: u.y, v: 3, type: u.type });
  world.emit('death', { x: u.x, y: u.y, v: u.radius, r: u.radius, type: u.type, team: u.team, sinking: 1 });
  crewOut(world, u);
}
function crewOut(world, u) {
  const S = T.sink, g = world.createGroup('deckhand', u.team), a0 = world.rng() * TAU;
  let first = null;
  for (let k = 0; k < S.crew; k++) {
    const a = a0 + (k * TAU) / S.crew + 0.3 * (world.rng() - world.rng());
    const c = world.spawn('deckhand', u.x + Math.cos(a) * u.radius * 0.6, u.y + Math.sin(a) * u.radius * 0.6, { group: g, team: u.team, heading: a, faction: u.faction, like: u });
    if (!c) break;
    c.vx = Math.cos(a) * S.crewOut; c.vy = Math.sin(a) * S.crewOut;
    if (!first) first = c;
  }
  if (g >= 0) world.releaseGroup(g);
  if (first && u.possessed === 1) world.handOver(u, first);   // the player swims on as a deckhand
}
function sinkStep(world, u) {   // every tick while sinking; when done, hp 0: it dies this tick (lifecycle runs next)
  const b = u.b;
  u.hidden = 0.001; u.burning = 0; u.goalX = 0; u.goalY = 0; u.vx *= 0.96; u.vy *= 0.96;
  if (u.hp < 1) u.hp = 1;
  if (actAge(world, u) < T.sink.time) return;
  b.sinking = 2; u.hidden = 0;                                   // gone: its killer gets the kill
  u.harmBy = b.kBy; u.harmByType = b.kType; u.harmByFaction = b.kFac; u.harmByAt = b.kAt; u.harmCause = b.kCause;
  u.hp = 0;
}

const D = registerUnit({
  type: 'ship',
  og: 'Ship (ours)', // no OG original
  category: 'pirates',
  faction: F.Side,
  aquatic: true, // lives on water: steering keeps it wet, ice can't trip it
  swims: true,
  waterPace: 1, // its speed is its water speed
  untossable: true,
  deckFire: true, // OURS flag (combat/fire.js): burns on water
  machine: true, // OURS flag: never raised / turned
  raisable: false,
  radius: 26, // OG-raw
  radiusJitter: 0,
  mass: T.mass,
  maxHp: T.hp,
  melee: false,
  strength: 6,
  locomotion: 0,
  walkSpeed: T.speed,
  runSpeed: T.speed,
  maxSpeed: T.speed * 1.2,
  accel: T.accel,
  decel: T.accel,
  turnRate: T.turnRate,
  turnSpeedFalloff: Infinity,
  sightRange: 430,
  alertSightRange: 450,
  stickyTarget: true,
  reactionTime: 0.3,
  huntRange: Infinity,
  minDistance: 0,
  drilled: false,
  intelligence: INT.Trained,
  infectable: false,
  flammability: T.flammability,
  brushSpacing: 60,
  flock: MACHINE_FLOCK,
  morale: MACHINE_MORALE,
  look: { attack: { time: 0.4 } },
  weapon: { range: T.broadside.range }, // for possess (aim reach) and readers
  // attack 3 (11-18): not on frozen water either. The lake map is a frozen lake (288 of its 330 deep spots are ice): a ship
  // painted there sat in the ice, and the "under the ice" rule (conceal.js, for piranhas) hid it from everyone, both ways:
  // ships on the lake never saw or fought each other
  placeOk(world, x, y) { return shore(world, x, y) >= T.placeShore && !world.frozenAt(x, y); },
  init(world, u) {
    initB(u); u.plagueFree = 1;
    const b = u.b;
    b.cdL = world.rng() * 1.5; b.cdR = world.rng() * 1.5; b.side = 0; b.sinking = 0;
    b.kBy = -1; b.kType = null; b.kFac = -1; b.kAt = 0; b.kCause = 0;
  },
  brain(world, u) {
    const b = u.b;
    if (b.sinking) { u.goalX = 0; u.goalY = 0; u.face = NaN; u.vx *= 0.96; u.vy *= 0.96; u.dodgeTime = 0; return; }
    if (b.act === 1 && actAge(world, u) > T.broadside.firePose) setAct(world, u, 0);
    if (b.cdL > 0) b.cdL -= DT;
    if (b.cdR > 0) b.cdR -= DT;
    u.dodgeTime = 0;                                         // a ship doesn't dodge grenades
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) return;
    const t = targetOf(world, u);
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, bear = Math.atan2(dy, dx);
      if (d > T.sail.closeTo * T.broadside.range) { setState(u, STATE.ADVANCE); sail(world, u, bear, T.speed); }
      else {
        setState(u, STATE.ENGAGE);
        const h1 = bear + Math.PI / 2, h2 = bear - Math.PI / 2;
        const h = Math.abs(angleDiff(u.heading, h1)) <= Math.abs(angleDiff(u.heading, h2)) ? h1 : h2;
        u.face = h;                                           // beam to the enemy
        let gx = Math.cos(h) * T.sail.drift, gy = Math.sin(h) * T.sail.drift;
        if (d < T.sail.tooClose) { gx -= dx / d; gy -= dy / d; }
        sail(world, u, Math.atan2(gy, gx), T.speed * Math.min(1, hypot(gx, gy)));
      }
      broadsides(world, u);
      return;
    }
    if (followGroup(world, u, T.speed, COMMON.memory)) { const sp = hypot(u.goalX, u.goalY); sail(world, u, Math.atan2(u.goalY, u.goalX), sp); return; }
    setState(u, STATE.IDLE);
  },
  // possessed, attack held at nobody: the side facing the aim fires at it
  possessFire(world, u, aim, ax, ay) {
    if (u.b.sinking) return;
    const side = angleDiff(u.heading, aim) >= 0 ? 1 : -1;
    if ((side > 0 ? u.b.cdR : u.b.cdL) <= 0) fireSide(world, u, side, 0, ax, ay);
  },
});

// ---------------------------------------------------------------- systems
// After steering: the ship's middle stays on deep water (or only moves deeper when it is not).
function okAt(world, x, y, s0) { const s = shore(world, x, y); return s >= T.moveShore || s > s0; }
function keepAfloat(world) {
  const us = world.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.def !== D || u.dead) continue;
    const s0 = shore(world, u.px, u.py);
    if (okAt(world, u.x, u.y, s0)) continue;
    if (okAt(world, u.x, u.py, s0)) { u.y = u.py; u.vy = 0; }
    else if (okAt(world, u.px, u.y, s0)) { u.x = u.px; u.vx = 0; }
    else { u.x = u.px; u.y = u.py; u.vx = 0; u.vy = 0; }
  }
}
registerSystem('pirates-ship-water', keepAfloat, 'steering');
// After water (before deaths are processed): 0 hp starts the sinking instead of dying; a sinking ship holds on until done.
function sinkGuard(world) {
  const us = world.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.def !== D || u.dead) continue;
    const b = u.b;
    if (b.sinking === 1) sinkStep(world, u);
    else if (b.sinking === 0 && !(u.hp > 0)) startSink(world, u);
  }
}
registerSystem('pirates-ship-sink', sinkGuard, 'water');
// After conceal (attack 3): a ship sits ON the water, so ice frozen round it (the ice brush) doesn't hide it like a piranha
// under the ice; a sinking ship keeps its own hide (startSink).
function shipSeen(world) {
  if (!(world.waterCells > 0)) return;
  const us = world.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.def !== D || u.dead || u.b.sinking || !(u.unseen > 0) || u.hidden > 0) continue;
    if (world.frozenAt(u.x, u.y)) { u.unseen = 0; u.unseenBySeers = 0; }
  }
}
registerSystem('pirates-ship-seen', shipSeen, 'conceal');

export default D;
export { T };
