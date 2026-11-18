// Unit maker: W-GUN modules, part 2 (OURS, Part 2 step 8, STEP8.md). Owner: W-GUN. Imported by guns.js.
// weapons: ballista, shrink, rockets, missiles, laser, zap, web, cannon. Same rules as guns.js (source numbers imported
// from the source files, ranges from the body's edge, used() on every shot, `as` on every event).
// Pose codes (u.b.act): AIM 1 (laying the ballista, aiming the shrink ray, laser charging), FIRE 2 (just fired; missiles:
// the salvo is going out), RELOAD 3 (ballista / cannon reloading), BEAM 10 (laser beam on).
// Bag fields the art reads (fx-mine-gun.js OVER):
//  - laser: `phase` (0 off, 1 charging, 2 beam), `t0` (world.time the phase began), `beamA` (rad, world angle) and
//    `beamL` (px): the beam starts at the body's edge (u.x + cos(beamA) x u.radius, same for y) and runs beamL px.
//  - zap: `at` (world.time of the last zap; the line shows 0.16 s), `vid` (unit id it hit, -1 = a spark at `x1`, `y1`).
// Machines (cannon, ballista) are carried by the unit itself: no crew, the source's full-crew reload.
import { registerWeapon } from '../registry.js';
import {
  STATE, ACT, ENEMY, used, power, setState, hunt, meleeFight, swing, keepAt, canAuto, targetOf, high, shotHeight,
  angleDiff, hypot, damage, ignite, DT,
} from '../lib.js';
import { getDef } from '../../defs.js';
import { canHit, ALL_MASK } from '../../factions.js';
import { spawnProjectile, fireProjectile } from '../../combat/projectiles.js';
import { splatNoise, submerged } from '../../combat/env.js';
import { push } from '../../combat/push.js';
import { advanceTo } from '../../combat/gun.js';
import { aimAngle } from '../../systems/possess.js';
import { SHOT, KEBAB } from '../../units/siege/ballista.js';
import { T as ST, shrinkUnit } from '../../units/space/shrinkray.js';
import { T as JT } from '../../units/space/jetpack.js';
import { T as MT } from '../../units/bosses/gmech.js';
import { T as LT } from '../../units/robots/laserbot.js';
import { isMetal } from '../../units/robots/magnetbot.js';
import { domeCut, cutDome, hitDome } from '../../units/robots/shieldbot.js';
import { T as ZT } from '../../units/robots/drone.js';
import { T as WT } from '../../units/bugs/spider.js';
import { bite as bugBite, poison, webbable, perchOf } from '../../units/bugs/_lib.js';
import { T as KT, BALL, fireBall } from '../../units/pirates/cannon.js';
import { pose, repose, unpose, poseFor, edge, clearLos, tag, scaledMelee } from './guns-lib.js';

const R0 = (type, raw) => { const d = getDef(type); return d ? d.radius : raw * 1.1; };   // a source unit's registered radius
const MARGIN = 50;   // px added to radius queries: the biggest body (giant x 2.25) is ~47 px

// ================================================================ ballista (siege: big bolt through 5, pins them, reload 5 s)
const BAL = {
  srcR: R0('ballista', 13),      // px: the ballista's radius
  mz: 0.2,                       // x source radius past the edge: the bolt leaves here (source 1.2 x r)
  pose: 0.3,                     // s: attack pose
};   // numbers: siege/ballista.js SHOT (range 520, 70 to each of 5, aim 0.5 s, reload 5 s) + KEBAB (pins 2.5 s)
// siege/ballista.js shaft(): the bodies-on-the-shaft arrays (made once per pooled projectile object)
function shaft(p) {
  if (!p.skId) { const n = KEBAB.max; p.skId = new Int32Array(n); p.skType = new Array(n); p.skR = new Float32Array(n); p.skX = new Float32Array(n); p.skY = new Float32Array(n); p.skC = new Array(n); }
  p.skN = 0; p.stuck = 0;
  for (let k = 0; k < KEBAB.max; k++) { p.skId[k] = -1; p.skType[k] = null; p.skC[k] = null; }
}
function balFire(w, u, ang, bag) {   // siege/ballista.js fire()
  const c = Math.cos(ang), s = Math.sin(ang), sp = SHOT.projectileSpeed, m = u.radius + BAL.mz * BAL.srcR;
  const p = spawnProjectile(w, 'bigbolt', u.x + c * m, u.y + s * m, c * sp, s * sp, (SHOT.lifeMul * SHOT.range) / sp, SHOT.damage, u.faction, u);
  if (!p) return null;
  shaft(p); p.pen = SHOT.pierce;
  bag.reload = SHOT.reload; bag.aimAt = -1;
  unpose(w, u, ACT.AIM); repose(w, u, ACT.FIRE); u.attack = 1; u.firedAt = w.time;
  w.emit('bow', { x: u.x, y: u.y, v: 2.5, type: u.type, as: 'ballista' });
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  used(w, u, 'ballista');
  return p;
}
registerWeapon({
  id: 'ballista', range: SHOT.range,
  def: { weapon: { range: SHOT.range, shot: SHOT, kebab: KEBAB }, look: { attack: { time: BAL.pose } } },
  init(w, u, bag) { bag.reload = 1 + w.rng(); bag.aimAt = -1; },
  tick(w, u, bag) {
    if (bag.reload > 0) { bag.reload -= DT; if (bag.reload < 0) bag.reload = 0; }
    poseFor(w, u, ACT.FIRE, SHOT.firePose);
    if (bag.reload > 0 && u.b.act !== ACT.FIRE) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD);
    if (bag.aimAt >= 0 && u.state === STATE.FLEE) { bag.aimAt = -1; unpose(w, u, ACT.AIM); }   // a stun only pauses the laying (source)
  },
  idle(w, u, bag) { bag.aimAt = -1; unpose(w, u, ACT.AIM); return false; },
  fight(w, u, t, dx, dy, d, bag) {   // siege/ballista.js brain, with a target: walk into range, then stand and lay it
    const clear = clearLos(w, u);
    if (!clear || d > SHOT.range + edge(u, BAL.srcR)) { bag.aimAt = -1; unpose(w, u, ACT.AIM); advanceTo(w, u, t, dx, dy, clear, u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / SHOT.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    if (bag.reload > 0) { bag.aimAt = -1; unpose(w, u, ACT.AIM); return; }
    if (bag.aimAt < 0) bag.aimAt = w.time;
    pose(w, u, ACT.AIM);
    if (w.time - bag.aimAt >= SHOT.aim && Math.abs(angleDiff(u.heading, aim)) <= SHOT.aimTolerance) balFire(w, u, aim + (w.rng() - w.rng()) * SHOT.spread, bag);
  },
  possessFire(w, u, aim, ax, ay, bag) { if (!(bag.reload > 0) && !(u.stun > 0)) balFire(w, u, aim, bag); },
});

// ================================================================ shrink (space shrink ray: the heaviest enemy not yet shrunk)
const SHR = {
  srcR: R0('shrinkray', 8),      // px: the shrink-ray alien's radius
  mz: 0.4,                       // x source radius past the edge: the ring leaves here (source 1.4 x r)
  pose: 0.3,                     // s: attack pose
};   // numbers: space/shrinkray.js T (marks within 240, aim 0.4 s, ring 350 px/s, x0.5 for good, reload 3 s, zap 5 up close)
const MQ = new Array(48);
function shrinkable(o) { return o.hp > 0 && !o.dead && !o.def.prop && o.shrink >= 1 && o.inside < 0; }
function findMark(w, u, R) {   // space/shrinkray.js findMark(): heaviest unshrunk enemy within range, in sight
  const n = w.queryMask(u.x, u.y, R, ENEMY[u.faction], MQ, MQ.length);
  let best = null, bm = -1;
  for (let k = 0; k < n; k++) {
    const o = MQ[k]; MQ[k] = null;
    if (!shrinkable(o) || (o.unseen > 0 && hypot(o.x - u.x, o.y - u.y) > o.unseen)) continue;
    if (o.mass > bm && (w.walls.count === 0 || w.walls.lineOfSight(u.x, u.y, o.x, o.y))) { bm = o.mass; best = o; }
  }
  return best;
}
function shrinkFire(w, u, m, aim, bag) {   // space/shrinkray.js fire()
  const c = Math.cos(aim), s = Math.sin(aim), mz = u.radius + SHR.mz * SHR.srcR;
  const p = spawnProjectile(w, 'shrink', u.x + c * mz, u.y + s * mz, c * ST.ringSpeed, s * ST.ringSpeed, ST.ringLife * ST.range / ST.ringSpeed, 0, u.faction, u);
  if (p) p.host = m ? m.id : -1;
  bag.next = w.time + ST.reload; bag.prey = -1; bag.aiming = 0; u.attack = 1; u.firedAt = w.time;
  unpose(w, u, ACT.AIM); repose(w, u, ACT.FIRE);
  w.emit('spell', { x: u.x, y: u.y, v: 0.5, type: u.type, cast: 1, as: 'shrinkray' });
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  used(w, u, 'shrink');
}
function shrinkZap(w, u, t, dx, dy, d, bag) {   // the zap for whoever comes close; returns meleeFight's code
  const n0 = w.events.length, r = meleeFight(w, u, t, bag.zap, dx, dy, d);
  if (r === 2) used(w, u, 'shrink');
  if (r !== 0) tag(w, n0, u, 'shrinkray');
  return r;
}
registerWeapon({
  id: 'shrink', range: ST.range,
  def: { weapon: { range: ST.range }, look: { attack: { time: SHR.pose } } },
  init(w, u, bag) { bag.next = w.time + ST.reload * 0.5 * w.rng(); bag.prey = -1; bag.aiming = 0; bag.t0 = 0; bag.zap = scaledMelee(ST.zap, u, power(u)); },
  tick(w, u, bag) {
    poseFor(w, u, ACT.FIRE, ST.firePose);
    if (bag.aiming && (u.stun > 0 || u.state === STATE.FLEE)) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
  },
  idle(w, u, bag) { if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); } return false; },
  fight(w, u, t, dx, dy, d, bag) {   // space/shrinkray.js brain, with a target
    const now = w.time, R = ST.range + edge(u, SHR.srcR), ready = now >= bag.next;
    let m = bag.prey >= 0 ? w.unitById(bag.prey) : null;
    if (u.possessed === 1) m = shrinkable(t) ? t : null;   // the player picks the mark
    else if (ready && !bag.aiming && (w.tick + u.index) % ST.scanEvery === 0) m = findMark(w, u, R);
    if (m && (!shrinkable(m) || hypot(m.x - u.x, m.y - u.y) > R * 1.15)) m = null;
    bag.prey = m ? m.id : -1;
    if (ready && m) {   // aim, then fire
      const mx = m.x - u.x, my = m.y - u.y, md = hypot(mx, my) || 0.001, lead = md / ST.ringSpeed;
      const aim = Math.atan2(my + m.vy * lead, mx + m.vx * lead);
      setState(u, STATE.ENGAGE); u.face = aim;
      if (!bag.aiming) { bag.aiming = 1; bag.t0 = now; pose(w, u, ACT.AIM); return; }
      if (now - bag.t0 >= ST.aimTime && Math.abs(angleDiff(u.heading, aim)) < ST.aimTol) shrinkFire(w, u, m, aim, bag);
      return;
    }
    if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
    if (shrinkZap(w, u, t, dx, dy, d, bag) !== 0) return;
    if (u.possessed === 1 || !clearLos(w, u) || d > R) { hunt(w, u, t, d < 140 ? u.def.runSpeed : u.def.walkSpeed, d < 140 ? STATE.CHARGE : STATE.ADVANCE); return; }
    keepAt(w, u, t, dx, dy, d, ST.want + edge(u, SHR.srcR), ST.band);
  },
  // possessed, attack held at nobody: a ring toward the aim (it shrinks whatever it touches first), else a zap
  possessFire(w, u, aim, ax, ay, bag) {
    if (w.time < bag.next) { const n0 = w.events.length; swing(w, u, bag.zap.cooldown); tag(w, n0, u, 'shrinkray'); return; }
    shrinkFire(w, u, null, aim, bag);
  },
});

// ================================================================ rockets (space jetpack's mini rockets, fired from the ground too)
// The flying is the Fly ability's; this is the launcher: 100-300 px, one every 1.8 s, blast r 22 for 25. Between shots it
// hovers... walks, at 210 +- 50 px from its target and drifts sideways (the jetpack's dance). 100 px stays the closest
// shot on every body (the blast never reaches its own skin even on a giant x 2.25).
const RKT = {
  srcR: R0('jetpack', 8.5),      // px: the jetpack man's radius
  drift: 0.4,                    // x walk speed: sideways drift at the right distance
  minAim: 40,                    // px: possessed shots at the aim point land at least this far out
  pose: 0.3,                     // s: attack pose
};   // numbers: space/jetpack.js T (minR 100, maxR 300, want 210 +- 50, reload 1.8 s, rocket 380 px/s, blast 'minirocket')
function rocketFire(w, u, ax, ay, bag) {   // space/jetpack.js fire()
  const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const mx = u.x + (dx / d) * u.radius, my = u.y + (dy / d) * u.radius, life = Math.max(DT, (d - u.radius) / JT.rocketSpeed);
  const p = spawnProjectile(w, 'minirocket', mx, my, Math.cos(a) * JT.rocketSpeed, Math.sin(a) * JT.rocketSpeed, life, JT.blast.damage, u.faction, u);
  if (p) { shotHeight(p, Math.max(0, u.z), d); p.smoky = 1; }
  bag.next = w.time + JT.reload; u.attack = 1; u.firedAt = w.time;
  repose(w, u, ACT.FIRE);
  w.emit('shot', { x: u.x, y: u.y, v: 0.8, type: u.type, snd: 'rocket', as: 'jetpack' });
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  used(w, u, 'rockets');
}
registerWeapon({
  id: 'rockets', range: JT.maxR,
  def: { weapon: { range: JT.maxR }, look: { attack: { time: RKT.pose } } },
  init(w, u, bag) { bag.next = w.time + JT.reload * w.rng(); },
  tick(w, u, bag) { poseFor(w, u, ACT.FIRE, JT.firePose); },
  fight(w, u, t, dx, dy, d, bag) {   // space/jetpack.js fight(): keep 100-300 px off and fire
    const e = edge(u, RKT.srcR), own = u.possessed === 1, sp = u.def.walkSpeed, up = u.z > JT.highWalls;
    if (!clearLos(w, u) && !up) { advanceTo(w, u, t, dx, dy, false, sp); return; }   // no line: walk round the wall
    setState(u, STATE.ENGAGE);
    const a = Math.atan2(dy, dx), want = JT.want + e;
    u.face = a;
    if (d > want + JT.band) { u.goalX = dx / d * sp; u.goalY = dy / d * sp; }
    else if (d < want - JT.band && !own) { u.goalX = -dx / d * sp; u.goalY = -dy / d * sp; }
    else { const s = u.index & 1 ? 1 : -1; u.goalX = -dy / d * s * RKT.drift * sp; u.goalY = dx / d * s * RKT.drift * sp; }   // drift sideways
    const maxR = (JT.maxR + e) * 1.1, inRange = (d >= JT.minR || own) && d <= maxR;   // ENGAGE hysteresis x1.1 (source)
    if (w.time >= bag.next && inRange && Math.abs(angleDiff(u.heading, a)) < JT.aimTol) {
      const lead = d / JT.rocketSpeed;
      rocketFire(w, u, t.x + t.vx * lead, t.y + t.vy * lead, bag);
    }
  },
  // possessed, attack held at nobody: a rocket at the aim point (kept within range)
  possessFire(w, u, aim, ax, ay, bag) {
    if (w.time < bag.next) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(RKT.minAim, Math.min(JT.maxR + edge(u, RKT.srcR), d)) / d;
    rocketFire(w, u, u.x + dx * k, u.y + dy * k, bag);
  },
});

// ================================================================ missiles (giant mech's salvo: 8 homing missiles every 7 s)
// Only the missiles (the mech's chest laser and stomp are not part of it). Keeps its target 250-450 px off between salvos
// (inside the 200-700 px salvo range). Possessed it may fire at a target under 200 px (the player's call, as the jetpack).
const MIS = {
  want: 350,                     // px: keeps its target about this far ...
  band: 100,                     // ... +- this
  scanEvery: 10,                 // ticks between looks for another target in range (its own is too close)
  pose: 0.3,                     // s: attack pose (u.attack); the pods stay open MT.missilePose after the last missile
};   // numbers: bosses/gmech.js T (every 7 s, 200-700 px, 8 x blast r 35 for 45, 0.12 s apart, homing 1.2 rad/s)
const SQ = new Array(64);
function launch(w, u, bag, t, tx, ty) {   // bosses/gmech.js launch(): one missile from a shoulder pod
  const side = (bag.k & 1) ? 1 : -1, h = u.heading, px = u.x - Math.sin(h) * side * u.radius * 0.6, py = u.y + Math.cos(h) * side * u.radius * 0.6;
  const ax = tx + MT.missileSpread * (w.rng() - w.rng()), ay = ty + MT.missileSpread * (w.rng() - w.rng());
  const d = Math.max(40, hypot(ax - px, ay - py)), life = d / MT.missileSpeed;
  const a = Math.atan2(ay - py, ax - px) + 0.5 * (w.rng() - w.rng());   // fans out of the pods, then homes in
  const p = spawnProjectile(w, 'missile', px, py, Math.cos(a) * MT.missileSpeed, Math.sin(a) * MT.missileSpeed, life, MT.missileDmg, u.faction, u);
  if (!p) return;
  p.host = t ? t.id : -1; p.apex = MT.missileApex * Math.min(1.4, 0.6 + d / 500); p.z = 6;
  w.emit('shot', { x: px, y: py, v: 1.5, type: u.type, missile: 1, as: 'gmech' });
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  used(w, u, 'missiles');
}
function salvoStep(w, u, bag) {   // bosses/gmech.js salvoStep(): 8 missiles over ~1 s at the target and enemies round it
  if (bag.k >= MT.missiles || w.time < bag.t1) return;
  bag.t1 = w.time + MT.missileGap;
  let t = bag.vid >= 0 ? w.unitById(bag.vid) : null;
  if (t && !(t.hp > 0)) t = null;
  if (bag.k > 0 && t) {   // spread: every other missile picks an enemy near the main target
    const n = w.queryMask(t.x, t.y, 120, ENEMY[u.faction], SQ, SQ.length);
    if (n > 1 && (bag.k & 1)) { const o = SQ[Math.floor(w.rng() * n)]; if (o && canHit(u, o) && !o.def.prop) t = o; }
    for (let k = 0; k < n; k++) SQ[k] = null;
  }
  if (t) launch(w, u, bag, t, t.x, t.y); else launch(w, u, bag, null, bag.x0, bag.y0);
  bag.k++;
  u.attack = 1; u.firedAt = w.time;
  splatNoise(w, u.x, u.y, 1, 500);
}
function shootable(o) { return !high(o) || o.z < 200; }   // bosses/gmech.js: anything but a very high flyer
// The nearest enemy inside the salvo range (200-700 px), seen: the target when the unit's own target is too close (the
// mech stomps those; a made unit has only the missiles, so it fires at the next one out).
function salvoMark(w, u) {
  const n = w.queryMask(u.x, u.y, MT.missileMax, ENEMY[u.faction], SQ, SQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.inside >= 0 || !shootable(o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < MT.missileMin || d > MT.missileMax || d >= bd || (o.unseen > 0 && d > o.unseen)) continue;
    bd = d; best = o;
  }
  return best;
}
function startSalvo(w, u, bag, t, x, y) {
  bag.k = 0; bag.t1 = w.time; bag.vid = t ? t.id : -1; bag.x0 = x; bag.y0 = y;
  bag.next = w.time + MT.missileEvery;
  repose(w, u, ACT.FIRE);
}
registerWeapon({
  id: 'missiles', range: MT.missileMax,
  def: { weapon: { range: MT.missileMax }, look: { attack: { time: MIS.pose } } },
  init(w, u, bag) { bag.next = w.time + MT.firstMissile; bag.k = MT.missiles; bag.t1 = 0; bag.vid = -1; bag.x0 = 0; bag.y0 = 0; },
  tick(w, u, bag) {   // a salvo keeps launching whatever else the unit does (the mech's brain runs it first)
    salvoStep(w, u, bag);
    if (bag.k >= MT.missiles) poseFor(w, u, ACT.FIRE, MT.missilePose);
  },
  fight(w, u, t, dx, dy, d, bag) {
    const own = u.possessed === 1;
    if (bag.k >= MT.missiles && w.time >= bag.next) {
      let m = null;
      if ((d >= MT.missileMin || own) && d <= MT.missileMax && shootable(t)) m = t;
      else if (!own && (w.tick + u.index) % MIS.scanEvery === 0) m = salvoMark(w, u);   // its target is too close: another one in range
      if (m) startSalvo(w, u, bag, m, m.x, m.y);
    }
    if (d > MIS.want + MIS.band) { advanceTo(w, u, t, dx, dy, clearLos(w, u), u.def.walkSpeed); return; }
    keepAt(w, u, t, dx, dy, d, MIS.want, MIS.band);
  },
  // possessed, attack held at nobody: a salvo at the aim point (kept inside 200-700 px)
  possessFire(w, u, aim, ax, ay, bag) {
    if (w.time < bag.next || bag.k < MT.missiles) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(MT.missileMin, Math.min(MT.missileMax, d)) / d;
    startSalvo(w, u, bag, null, u.x + dx * k, u.y + dy * k);
  },
});

// ================================================================ laser (robots laser bot: charge 0.4 s, a 30 degree sweep)
const LAS = {
  srcR: R0('laserbot', 9),       // px: the laser bot's radius
  lead: 0.6,                     // s: aim lead while charging (source)
  pose: 0.4,                     // s: attack pose
};   // numbers: robots/laserbot.js T (range 260, 30 dps in 0.1 s pulses, ignite 0.1 x flammability, cooldown 2.5 s, bonk 6)
const PULSE_TICKS = Math.round(LT.pulse / DT);
let _w = null, _u = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _L = 0;
function beamOne(o) {   // robots/laserbot.js beamOne()
  const u = _u;
  if (o === u || !(o.hp > 0) || !canHit(u, o) || submerged(_w, o)) return;
  const ox = o.x - _x0, oy = o.y - _y0, s = ox * _dx + oy * _dy;
  if (s < -o.radius || s > _L + o.radius) return;
  const q = ox * _dy - oy * _dx, R = o.radius + LT.width;
  if (q * q > R * R) return;
  damage(_w, o, LT.dps * LT.pulse, u, undefined, _x0, _y0);
  if (!isMetal(o)) ignite(_w, o, LT.ignite);
}
// aim the beam along bag.beamA: its length to the first wall / enemy dome; on a pulse tick it burns what is on it
function beamStep(w, u, bag, burn) {   // robots/laserbot.js beamStep()
  const c = Math.cos(bag.beamA), s = Math.sin(bag.beamA);
  const x0 = u.x + c * u.radius, y0 = u.y + s * u.radius;
  let L = LT.range;
  if (w.walls.count > 0) { const f = w.walls.raycast(x0, y0, x0 + c * L, y0 + s * L); if (f <= 1) L *= f; }
  L = domeCut(w, u, x0, y0, c, s, L);
  const dome = cutDome();
  bag.beamL = L;
  if (!burn) return;
  if (dome) hitDome(w, dome, LT.dps * LT.pulse, x0 + c * L, y0 + s * L);
  _w = w; _u = u; _x0 = x0; _y0 = y0; _dx = c; _dy = s; _L = L;
  w.query(x0 + c * L * 0.5, y0 + s * L * 0.5, L * 0.5 + MARGIN + LT.width, beamOne, ALL_MASK);
  _w = null; _u = null;
}
function startCharge(w, u, bag, aim) {
  bag.aimA = aim; bag.phase = 1; bag.t0 = w.time;
  pose(w, u, ACT.AIM); setState(u, STATE.ENGAGE);
  w.emit('laser', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 0, as: 'laserbot' });
}
function startBeam(w, u, bag) {
  bag.dir = w.rng() < 0.5 ? -1 : 1;
  bag.a0 = bag.aimA - bag.dir * LT.sweep * 0.5; bag.beamA = bag.a0; bag.pulseTick = w.tick;
  bag.phase = 2; bag.t0 = w.time;
  unpose(w, u, ACT.AIM); pose(w, u, ACT.BEAM);
  u.attack = 1; u.firedAt = w.time;
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  w.emit('laser', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 1, ang: bag.aimA, as: 'laserbot' });
  beamStep(w, u, bag, false);
  used(w, u, 'laser');
}
registerWeapon({
  id: 'laser', range: LT.range,
  def: { weapon: { range: LT.range }, look: { attack: { time: LAS.pose } } },
  init(w, u, bag) {
    bag.phase = 0; bag.t0 = 0; bag.aimA = 0; bag.a0 = 0; bag.dir = 1; bag.beamA = 0; bag.beamL = 0; bag.pulseTick = 0;
    bag.bonk = scaledMelee(LT.bonk, u, power(u));
    u.cooldown = w.rng() * LT.cooldown * 0.5;
  },
  // the sweep runs its course every tick (stunned, tossed or not), as the bot's
  tick(w, u, bag) {
    if (bag.phase !== 2) return;
    const f = Math.min(1, (w.time - bag.t0) / LT.beam);
    bag.beamA = bag.a0 + bag.dir * LT.sweep * f;
    u.heading = bag.beamA;
    beamStep(w, u, bag, (w.tick - bag.pulseTick) % PULSE_TICKS === 0);
    if (f >= 1) { bag.phase = 0; bag.beamL = 0; unpose(w, u, ACT.BEAM); u.cooldown = LT.cooldown; }
  },
  // charging and firing: it stands still (the bot's rule); charging keeps aiming, a stun cancels the charge
  busy(w, u, bag) {
    if (bag.phase === 2) { u.face = bag.beamA; setState(u, STATE.ENGAGE); return true; }
    if (bag.phase !== 1) return false;
    if (u.stun > 0) { bag.phase = 0; unpose(w, u, ACT.AIM); return false; }
    const t = targetOf(w, u);
    if (t) bag.aimA = Math.atan2(t.y + t.vy * LAS.lead - u.y, t.x + t.vx * LAS.lead - u.x);
    else if (u.possessed === 1) bag.aimA = aimAngle(w, u);
    u.face = bag.aimA;
    if (w.time - bag.t0 >= LT.charge) startBeam(w, u, bag);
    return true;
  },
  fight(w, u, t, dx, dy, d, bag) {   // robots/laserbot.js brain, with a target
    const n0 = w.events.length, r = meleeFight(w, u, t, bag.bonk, dx, dy, d);   // in its face: a bonk
    if (r !== 0) { if (r === 2) used(w, u, 'laser'); tag(w, n0, u, 'laserbot'); return; }
    const e = edge(u, LAS.srcR), sp = u.def.walkSpeed, clear = clearLos(w, u);
    if (d > LT.holdAt * LT.range + e || !clear) { advanceTo(w, u, t, dx, dy, clear, sp); return; }   // robots keepRange()
    setState(u, STATE.ENGAGE);
    const aim = Math.atan2(dy, dx);
    u.face = aim;
    if (d < LT.minRange + e) { u.goalX = (-dx / d) * sp; u.goalY = (-dy / d) * sp; }
    if (u.cooldown <= 0 && canAuto(w, u) && Math.abs(angleDiff(u.heading, aim)) < LT.aimTol) startCharge(w, u, bag, aim);
  },
  // possessed, attack held at nobody: charge and sweep the beam along the aim
  possessFire(w, u, aim, ax, ay, bag) {
    if (bag.phase === 0 && u.cooldown <= 0) startCharge(w, u, bag, aim);
    else if (bag.phase === 0) { const n0 = w.events.length; swing(w, u, bag.bonk.cooldown); tag(w, n0, u, 'laserbot'); }
  },
});

// ================================================================ zap (robots drone: an instant spark at an enemy within 70 px)
// On the ground (or flying with an ability) the unit runs in and circles its target at its own angle like the drone
// swarm, so several zappers spread round a victim. Reach and orbit count from the body's edge.
const ZAP = {
  srcR: R0('drone', 5),          // px: the drone's radius
  gap: 6,                        // px: the orbit never brings it closer than both bodies + this
  pick: 40,                      // px: possessed, the enemy nearest the aim point within this is zapped
  pose: 0.2,                     // s: attack pose
};   // numbers: robots/drone.js T (range 70, 4 every 0.5 s, jolt 15, orbit 0.6 x range, spin 1.2 rad/s)
function zapIt(w, u, t, bag) {   // robots/drone.js zap()
  damage(w, t, ZT.zap, u);
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 1;
  push(w, t, dx / d, dy / d, ZT.zapPush, 0);
  w.emit('zap', { x: u.x, y: u.y, z: u.z, x1: t.x, y1: t.y, type: u.type, id: u.id, as: 'drone' });
  u.attack = 1; u.cooldown = ZT.every * (0.9 + 0.2 * w.rng());
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  repose(w, u, ACT.FIRE);
  bag.vid = t.id; bag.at = w.time; bag.x1 = t.x; bag.y1 = t.y;
  used(w, u, 'zap');
}
function goTo(u, x, y, sp) { const dx = x - u.x, dy = y - u.y, d = hypot(dx, dy); if (d < 2) return; const s = Math.min(sp, 4 * d); u.goalX = (dx / d) * s; u.goalY = (dy / d) * s; }   // drone flyTo()
registerWeapon({
  id: 'zap', range: ZT.range,
  def: { weapon: { range: ZT.range }, look: { attack: { time: ZAP.pose } } },
  init(w, u, bag) { bag.off = (u.index * 2.39996) % (Math.PI * 2); bag.vid = -1; bag.at = -9; bag.x1 = 0; bag.y1 = 0; u.cooldown = w.rng() * ZT.every; },
  tick(w, u, bag) { poseFor(w, u, ACT.FIRE, ZT.zapPose); },
  fight(w, u, t, dx, dy, d, bag) {   // robots/drone.js brain, with a target
    const e = edge(u, ZAP.srcR), R = ZT.range + e, clear = clearLos(w, u);
    setState(u, d <= R ? STATE.ENGAGE : STATE.ADVANCE);
    u.face = Math.atan2(dy, dx);
    if (d <= R && u.cooldown <= 0 && canAuto(w, u) && clear) zapIt(w, u, t, bag);
    if (u.webbed > w.time) return;   // held by a web: turns and zaps only
    if (d > ZT.approachAt * R || !clear) { advanceTo(w, u, t, dx, dy, clear, u.def.runSpeed); setState(u, d <= R ? STATE.ENGAGE : STATE.ADVANCE); return; }
    // circle the target: every unit has its own phase round it, half of them turn each way
    const a = bag.off + w.time * ZT.spin * (u.index & 1 ? 1 : -1), Ro = Math.max(ZT.orbit * ZT.range + e, u.radius + t.radius + ZAP.gap);
    goTo(u, t.x + Math.cos(a) * Ro, t.y + Math.sin(a) * Ro, u.def.runSpeed);
  },
  // possessed, attack held at nobody: zap the enemy nearest the aim point if one is in reach, else a spark at the aim
  possessFire(w, u, aim, ax, ay, bag) {
    if (u.cooldown > 0) return;
    const R = ZT.range + edge(u, ZAP.srcR), t = w.findNearest(ax, ay, ZAP.pick, ENEMY[u.faction], u, 1);
    if (t && hypot(t.x - u.x, t.y - u.y) <= R) { zapIt(w, u, t, bag); return; }
    const L = hypot(ax - u.x, ay - u.y) || 1, k = Math.min(R, L) / L;
    bag.vid = -1; bag.at = w.time; bag.x1 = u.x + (ax - u.x) * k; bag.y1 = u.y + (ay - u.y) * k;
    w.emit('zap', { x: u.x, y: u.y, z: u.z, x1: bag.x1, y1: bag.y1, type: u.type, id: u.id, as: 'drone' });
    u.attack = 1; u.cooldown = ZT.every; repose(w, u, ACT.FIRE);
  },
});

// ================================================================ web (bugs spider: web shot + patch, then in to bite)
// The spider's whole attack: webs the ones that aren't webbed yet (3 s, a patch r 20 for 8 s where it lands), then runs in
// and bites (12 x power + a poison stack). On a person the bite is the art's plain attack pose with the web gun.
const WEB = {
  srcR: R0('spider', 8),         // px: the spider's radius
  mz: 0.1,                       // x source radius past the edge: the web leaves here (source 1.1 x r)
  biteReach: 4,                  // px past both bodies (x power): the bite reaches
  run: 260,                      // px: closer than this it runs in (source brain)
  pose: 0.3,                     // s: attack pose
};   // numbers: bugs/spider.js T (web 40-180 px, 450 px/s, webbed 3 s, patch r 20 8 s, reload 2.5 s, bite 12 every 0.9 s)
function webShoot(w, u, ax, ay, over, bag) {   // bugs/spider.js shoot()
  const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, m = u.radius + WEB.mz * WEB.srcR;
  const x = u.x + (dx / d) * m, y = u.y + (dy / d) * m;
  const life = Math.max(DT, (Math.min(WT.webMax + edge(u, WEB.srcR), d) - m + over) / WT.webSpeed);   // from the muzzle to `over` px past the aim
  const p = fireProjectile(w, 'web', u, ax, ay, { x, y, speed: WT.webSpeed, life });
  if (p) { p.z = WT.webH; p.age = 0; }
  bag.next = w.time + WT.reload;
  repose(w, u, ACT.FIRE);
  w.emit('throw', { x: u.x, y: u.y, v: 0.4, type: u.type, as: 'spider' });
  used(w, u, 'web');
  return p;
}
function webBite(w, u, t) {   // bugs/spider.js biteIt()
  const n0 = w.events.length, v = perchOf(w, t), k = power(u), pass = bugBite(w, u, t, WT.bite * k, WT.biteEvery, 40 * k, 0.1);
  if (pass >= 0.5) poison(w, v, u);
  used(w, u, 'web');
  tag(w, n0, u, 'spider');
}
registerWeapon({
  id: 'web', range: WT.webMax,
  def: { weapon: { range: WT.webMax }, look: { attack: { time: WEB.pose } } },
  init(w, u, bag) { bag.next = w.time + WT.reload * 0.5 * w.rng(); },
  tick(w, u, bag) { poseFor(w, u, ACT.FIRE, WT.pose); },
  fight(w, u, t, dx, dy, d, bag) {   // bugs/spider.js brain, with a target
    const now = w.time, e = edge(u, WEB.srcR), a = Math.atan2(dy, dx);
    if (d <= u.radius + t.radius + WEB.biteReach * power(u) && !high(t)) {
      setState(u, STATE.ENGAGE); u.face = a;
      if (u.cooldown <= 0) webBite(w, u, t);
      return;
    }
    const fresh = t.webbed > now + WT.freshWeb, webIt = !fresh && webbable(t) && !high(t) && d >= WT.webMin + e && d <= WT.webMax + e && clearLos(w, u);
    if (webIt && now >= bag.next) {
      setState(u, STATE.ENGAGE); u.face = a;
      const lead = d / WT.webSpeed;
      if (Math.abs(angleDiff(u.heading, a)) < WT.aimTol) webShoot(w, u, t.x + t.vx * lead, t.y + t.vy * lead, WT.overshoot, bag);
      return;
    }
    if (webIt && now >= bag.next - WT.waitWeb && d <= WT.holdAt + e) { setState(u, STATE.ENGAGE); u.face = a; return; }   // web nearly ready: wait at range
    const near = d < WEB.run + e;
    hunt(w, u, t, near ? u.def.runSpeed : u.def.walkSpeed, near ? STATE.CHARGE : STATE.ADVANCE);
  },
  // possessed, attack held at nobody: web the aim point (kept inside 40-180 px): the patch lands there
  possessFire(w, u, aim, ax, ay, bag) {
    if (w.time < bag.next) return;
    const e = edge(u, WEB.srcR), dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(WT.webMin + e, Math.min(WT.webMax + e, d)) / d;
    u.face = aim;
    webShoot(w, u, u.x + dx * k, u.y + dy * k, 0, bag);
  },
});

// ================================================================ cannon (pirates: carried by the unit, cannonball through 4)
// The ball skips on water and breaks walls (the source's projectile). Like the source it fires through walls in the way
// (no clear line needed): the ball breaks its way through.
const CAN = {
  srcR: R0('cannon', 13),        // px: the cannon's radius
  mz: 0.25,                      // x source radius past the edge: the ball leaves here (source 1.25 x r)
  noise: 520,                    // px: noise splat (source fire())
};   // numbers: pirates/cannon.js T (range 500, reload 4 s full crew, lay 0.07 rad, recoil 45) + BALL (80, through 4 at x0.6)
function cannonFire(w, u, aim, bag) {   // pirates/cannon.js fire()
  const n0 = w.events.length, a = aim + KT.spread * (w.rng() - w.rng()), m = u.radius + CAN.mz * CAN.srcR;
  fireBall(w, u, u.x + Math.cos(a) * m, u.y + Math.sin(a) * m, a);
  w.emit('shot', { x: u.x, y: u.y, v: 2, type: u.type, as: 'cannon' });
  splatNoise(w, u.x, u.y, 1, CAN.noise);
  push(w, u, -Math.cos(a), -Math.sin(a), KT.recoil * u.mass, 0);
  u.attack = 1; u.firedAt = w.time; bag.reload = KT.reload;
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  repose(w, u, ACT.FIRE);
  used(w, u, 'cannon');
  tag(w, n0, u, 'cannon');   // fireBall's muzzle smoke
}
registerWeapon({
  id: 'cannon', range: KT.range,
  def: { weapon: { range: KT.range }, look: { attack: { time: KT.firePose } } },
  init(w, u, bag) { bag.reload = w.rng() * KT.reload * 0.5; },
  tick(w, u, bag) {
    if (bag.reload > 0) { bag.reload -= DT; if (bag.reload < 0) bag.reload = 0; }
    poseFor(w, u, ACT.FIRE, KT.firePose);
    if (bag.reload > 0 && u.b.act !== ACT.FIRE) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD);
  },
  fight(w, u, t, dx, dy, d, bag) {   // pirates/cannon.js brain, with a target
    const R = KT.range + edge(u, CAN.srcR), r = u.state === STATE.ENGAGE ? R * 1.05 : R;
    if (d > r) { advanceTo(w, u, t, dx, dy, clearLos(w, u), u.def.walkSpeed); u.face = Math.atan2(dy, dx); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / BALL.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    if (bag.reload <= 0 && Math.abs(angleDiff(u.heading, aim)) < KT.aimTol) cannonFire(w, u, aim, bag);
  },
  possessFire(w, u, aim, ax, ay, bag) { if (bag.reload <= 0 && Math.abs(angleDiff(u.heading, aim)) < KT.aimTol * 2) cannonFire(w, u, aim, bag); },
});
