// Unit maker: W-THROW sports weapons (OURS, Part 2 step 8, STEP8.md). Owner: W-THROW. Imported by throw.js (read its
// header for the shared rules, pose codes and bag fields). fastball (pitcher), bowling (bowler), puck (hockey).
// Projectiles are the sources' own kinds ('baseball', 'bowlball', 'puck'), so their hit rules and art are the sources'.
import { registerWeapon } from '../registry.js';
import { STATE, hypot, angleDiff, setState, clearLine, used, meleeFight, advanceTo } from '../lib.js';
import { canHit } from '../../factions.js';
import { ACT, pose, poseEnd, poseOff, scaledMelee, shot } from './throw-lib.js';
import { spawnProjectile, sidestep } from '../../combat/index.js';
import { submerged } from '../../combat/env.js';
import { T as PT } from '../../units/sports/pitcher.js';   // registers projectile 'baseball'
import { T as BT } from '../../units/sports/bowler.js';    // registers projectile 'bowlball'
import { T as HT } from '../../units/sports/hockey.js';    // registers projectile 'puck'
import { COMMON, solid } from '../../units/sports/_lib.js';

const DT = 1 / 60;

// ================================================================ fastball (pitcher: 800 px/s pitch, stuns; every 3rd curves round a blocker)
// numbers: units/sports/pitcher.js T (imported)
const FB = {
  range: PT.range,           // px
  wind: PT.wind,             // s wind-up (pose WIND)
  throwPose: PT.throwPose,   // s of the THROW pose
  reload: PT.reload,         // s from one pitch to the next
  reloadJitter: PT.reloadJitter, // + s
  aimTol: PT.aimTol,         // rad: starts the wind-up once facing this well
  spread: PT.spread,         // rad ± (triangular)
  speed: PT.ball.speed,      // px/s
  damage: PT.ball.damage, damageJitter: PT.ball.damageJitter, // the ball (its step stuns + pushes)
  life: PT.ball.life,        // straight pitch lives life × range / speed
  ballR: PT.ball.r,          // px ball radius
  curveEvery: PT.curve.every, curveMargin: PT.curve.margin, curveStep: PT.curve.step, curveMax: PT.curve.max,
  curveMinLen: PT.curve.minLen, curveTail: PT.curve.tail, // the curve (pitcher.js planCurve)
  minDistance: 90,           // px: backs off from closer enemies (pitcher def)
  attackTime: 0.3,           // s
};
// the curve: bend round the first blocker on the line (from units/sports/pitcher.js planCurve)
let _pu = null, _pt = null, _pw = null, _sx = 0, _sy = 0, _ux = 0, _uy = 0, _L = 0, _blk = null, _ba = Infinity, _bo = 0;
function blockOne(o) {
  if (o === _pu || o === _pt || !(o.hp > 0) || o.inside >= 0 || !canHit(_pu, o) || submerged(_pw, o)) return;
  const ox = o.x - _sx, oy = o.y - _sy, along = ox * _ux + oy * _uy, off = -ox * _uy + oy * _ux;
  if (along <= 0 || along >= _L) return;
  if (Math.abs(off) >= o.radius + FB.ballR + FB.curveMargin) return;
  if (along < _ba) { _ba = along; _blk = o; _bo = off; }
}
const PLAN = { a0: 0, w: 0, time: 0, blocker: -1 };
function planCurve(w, u, target, sx, sy, tx, ty) {
  const ex = tx - sx, ey = ty - sy, L = hypot(ex, ey);
  if (L < FB.curveMinLen) return false;
  _pu = u; _pt = target; _pw = w; _sx = sx; _sy = sy; _ux = ex / L; _uy = ey / L; _L = L; _blk = null; _ba = Infinity; _bo = 0;
  w.query(sx + ex / 2, sy + ey / 2, L / 2 + COMMON.margin, blockOne);
  const o = _blk; _pu = null; _pt = null; _pw = null; _blk = null;
  if (!o) return false;
  const need = o.radius + FB.ballR + FB.curveMargin - Math.abs(_bo), tb = _ba / L, side = _bo > 0 ? -1 : 1;
  for (let th = FB.curveStep; th <= FB.curveMax + 1e-9; th += FB.curveStep) {
    const R = L / (2 * Math.sin(th)), q = (tb - 0.5) * L, h = Math.sqrt(Math.max(0, R * R - q * q)) - R * Math.cos(th);
    if (h < need) continue;
    const time = (2 * R * th) / FB.speed;
    PLAN.a0 = Math.atan2(ey, ex) + side * th; PLAN.w = (-side * 2 * th) / time; PLAN.time = time; PLAN.blocker = o.id;
    return true;
  }
  return false;
}
function pitch(w, u, B) {   // from pitcher.js pitch
  B.phase = 0;
  const t = B.victim >= 0 ? w.unitById(B.victim) : null;
  let tx = B.aimX, ty = B.aimY;
  if (t && t.hp > 0) { const d = hypot(t.x - u.x, t.y - u.y), lead = d / FB.speed; tx = t.x + t.vx * lead; ty = t.y + t.vy * lead; }
  const base = Math.atan2(ty - u.y, tx - u.x), sx = u.x + Math.cos(base) * u.radius, sy = u.y + Math.sin(base) * u.radius;
  B.pitches++;
  let a = base + FB.spread * (w.rng() - w.rng()) * (2 - u.morale), life = (FB.life * FB.range) / FB.speed, wr = 0, time = 0, blocker = -1;
  if (B.pitches % FB.curveEvery === 0 && t && planCurve(w, u, t, sx, sy, tx, ty)) { a = PLAN.a0; wr = PLAN.w; time = PLAN.time; blocker = PLAN.blocker; life = time + FB.curveTail; }
  const p = spawnProjectile(w, 'baseball', sx, sy, Math.cos(a) * FB.speed, Math.sin(a) * FB.speed, life, FB.damage + FB.damageJitter * (w.rng() - w.rng()), u.faction, u);
  if (p) { p.rise = time; p.drop = wr; p.passed = blocker; }
  B.curved = blocker >= 0 ? 1 : 0;
  pose(w, u, ACT.THROW);
  u.attack = 1; u.cooldown = FB.reload - FB.wind + w.rng() * FB.reloadJitter;   // wind + this = one pitch per 1.4 s
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, curve: B.curved, as: 'pitcher' });
  shot(w, u, 'fastball');
}
/** Wind-up / aim phase shared by the three: start it (victim = id or -1 for the aim point). */
function windUp(w, u, B, code, victim) { B.phase = 1; B.phaseT = w.time; B.victim = victim; pose(w, u, code); }
function windCancel(w, u, B, code) { if (B.phase === 1) { B.phase = 0; poseOff(w, u, code); } }
registerWeapon({
  id: 'fastball', range: FB.range,
  def: { minDistance: FB.minDistance, look: { attack: { time: FB.attackTime } }, weapon: { range: FB.range } },
  init(w, u, B) { B.pitches = 0; B.curved = 0; B.phase = 0; B.phaseT = 0; B.victim = -1; B.aimX = u.x; B.aimY = u.y; u.cooldown = w.rng() * FB.reload; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, FB.throwPose); if (B.phase === 1 && (u.stun > 0 || u.state === STATE.FLEE)) windCancel(w, u, B, ACT.WIND); },
  busy(w, u, B) { if (B.phase === 1 && w.time - B.phaseT >= FB.wind && !(u.stun > 0)) pitch(w, u, B); return false; },
  idle(w, u, B) { if (B.phase === 1 && B.victim >= 0) windCancel(w, u, B, ACT.WIND); return B.phase === 1; },
  fight(w, u, t, dx, dy, d, B) {   // from pitcher.js brain
    const clear = clearLine(w, u), r = u.state === STATE.ENGAGE ? FB.range * 1.1 + 6 : FB.range;
    if (!clear || d > r) { windCancel(w, u, B, ACT.WIND); advanceTo(w, u, t, dx, dy, clear, u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / FB.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    sidestep(w, u, t, dx, dy, d, u.def);
    if (B.phase === 1) { B.victim = t.id; return; }
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < FB.aimTol) windUp(w, u, B, ACT.WIND, t.id);
  },
  possessFire(w, u, aim, ax, ay, B) {   // pitcher: wind up and pitch at the aim point
    B.aimX = ax; B.aimY = ay;
    if (B.phase === 0 && u.cooldown <= 0) windUp(w, u, B, ACT.WIND, -1);
  },
});

// ================================================================ bowling (bowler: rolls a ball through lines; a strike; bonk up close)
// numbers: units/sports/bowler.js T (imported)
const BW = {
  min: BT.min, max: BT.max,  // px bowl range
  aimTime: BT.aimTime,       // s aiming (pose AIM)
  bowlPose: BT.bowlPose,     // s of the THROW pose
  reload: BT.reload, reloadJitter: BT.reloadJitter, // s between balls
  aimTol: BT.aimTol,         // rad
  spread: BT.spread,         // rad ± (triangular)
  speed: BT.ball.speed,      // px/s at release
  ballR: BT.ball.r,          // px
  damage: BT.ball.damage,    // to each pin (its step knocks down + rolls on)
  walls: BT.ball.walls,      // wall bounces
  maxPins: BT.ball.maxPins,  // pins remembered per ball
  life: BT.ball.life,        // s at most
  avgSpeed: BT.ball.avgSpeed,// px/s aim lead
  bonk: BT.bonk,             // swung ball up close (× power)
  attackTime: 0.35,          // s
};
function bowl(w, u, B) {   // from bowler.js bowl
  B.phase = 0;
  const t = B.victim >= 0 ? w.unitById(B.victim) : null;
  let tx = B.aimX, ty = B.aimY;
  if (t && t.hp > 0) { const d = hypot(t.x - u.x, t.y - u.y), lead = d / BW.avgSpeed; tx = t.x + t.vx * lead; ty = t.y + t.vy * lead; }
  const a = Math.atan2(ty - u.y, tx - u.x) + BW.spread * (w.rng() - w.rng()) * (2 - u.morale), c = Math.cos(a), s = Math.sin(a);
  const off = u.radius + BW.ballR + 2, sx = u.x + c * off, sy = u.y + s * off;
  pose(w, u, ACT.THROW);
  u.attack = 1; u.cooldown = BW.reload - BW.aimTime + w.rng() * BW.reloadJitter;   // aim + this = one ball per 3 s
  w.emit('throw', { x: u.x, y: u.y, v: 0.8, type: u.type, as: 'bowler' });
  shot(w, u, 'bowling');
  if (solid(w, sx, sy)) return;   // up against a wall: it thuds down there
  const p = spawnProjectile(w, 'bowlball', sx, sy, c * BW.speed, s * BW.speed, BW.life, BW.damage, u.faction, u);
  if (!p) return;
  if (!p.hits) p.hits = new Int32Array(BW.maxPins);   // once per pooled projectile object (as the bowler)
  p.nHits = 0; p.drop = 0; p.bounces = BW.walls; p.z = 0;
}
registerWeapon({
  id: 'bowling', range: BW.max,
  def: { minDistance: BW.min, look: { attack: { time: BW.attackTime } }, weapon: { range: BW.max } },
  init(w, u, B) { B.phase = 0; B.phaseT = 0; B.victim = -1; B.aimX = u.x; B.aimY = u.y; B.bonk = scaledMelee(BW.bonk, u); u.cooldown = w.rng() * BW.reload * 0.5; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, BW.bowlPose); if (B.phase === 1 && (u.stun > 0 || u.state === STATE.FLEE)) windCancel(w, u, B, ACT.AIM); },
  busy(w, u, B) { if (B.phase === 1 && w.time - B.phaseT >= BW.aimTime && !(u.stun > 0)) bowl(w, u, B); return false; },
  idle(w, u, B) { if (B.phase === 1 && B.victim >= 0) windCancel(w, u, B, ACT.AIM); return B.phase === 1; },
  fight(w, u, t, dx, dy, d, B) {   // from bowler.js brain
    const clear = clearLine(w, u);
    if (B.phase !== 1) { const r = meleeFight(w, u, t, B.bonk, dx, dy, d); if (r !== 0) { if (r === 2) used(w, u, 'bowling'); return; } }   // in his face: bonk
    if (B.phase !== 1) {
      if (!clear || d > BW.max) { advanceTo(w, u, t, dx, dy, clear, u.def.walkSpeed); return; }
      if (d < BW.min) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * u.def.walkSpeed; u.goalY = (-dy / d) * u.def.walkSpeed; return; }
    }
    setState(u, STATE.ENGAGE);
    const lead = d / BW.avgSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    if (B.phase === 1) { B.victim = t.id; return; }
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < BW.aimTol) windUp(w, u, B, ACT.AIM, t.id);
  },
  possessFire(w, u, aim, ax, ay, B) {   // bowler: aim and roll a ball at the aim point
    B.aimX = ax; B.aimY = ay;
    if (B.phase === 0 && u.cooldown <= 0) windUp(w, u, B, ACT.AIM, -1);
  },
});

// ================================================================ puck (hockey: slapshot along the ground, 2 wall bounces; the stick)
// numbers: units/sports/hockey.js T (imported). Fast on ice is the Skates ability (A-MOVE), not the stick.
const PK = {
  range: HT.range,           // px
  wind: HT.wind,             // s wind-up (pose WIND)
  slapPose: HT.slapPose,     // s of the THROW pose
  reload: HT.reload, reloadJitter: HT.reloadJitter, // s between slapshots
  aimTol: HT.aimTol,         // rad
  spread: HT.spread,         // rad ± (triangular)
  speed: HT.puck.speed,      // px/s
  damage: HT.puck.damage, damageJitter: HT.puck.damageJitter, // the puck (its step pushes + bounces)
  bounces: HT.puck.bounces,  // wall bounces
  life: HT.puck.life,        // lives life × range / speed
  stick: HT.stick,           // stick hit up close (× power)
  minDistance: 70,           // px (hockey def)
  attackTime: 0.3,           // s
};
function slap(w, u, B) {   // from hockey.js slap
  B.phase = 0;
  const t = B.victim >= 0 ? w.unitById(B.victim) : null;
  let tx = B.aimX, ty = B.aimY;
  if (t && t.hp > 0) { const d = hypot(t.x - u.x, t.y - u.y), lead = d / PK.speed; tx = t.x + t.vx * lead; ty = t.y + t.vy * lead; }
  const a = Math.atan2(ty - u.y, tx - u.x) + PK.spread * (w.rng() - w.rng()) * (2 - u.morale), c = Math.cos(a), s = Math.sin(a);
  pose(w, u, ACT.THROW);
  u.attack = 1; u.cooldown = PK.reload - PK.wind + w.rng() * PK.reloadJitter;
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, slap: 1, as: 'hockey' });
  shot(w, u, 'puck');
  const sx = u.x + c * u.radius, sy = u.y + s * u.radius;
  if (solid(w, sx, sy)) return;
  const p = spawnProjectile(w, 'puck', sx, sy, c * PK.speed, s * PK.speed, (PK.life * PK.range) / PK.speed, PK.damage + PK.damageJitter * (w.rng() - w.rng()), u.faction, u);
  if (p) { p.bounces = PK.bounces; p.z = 0; }
}
registerWeapon({
  id: 'puck', range: PK.range,
  def: { minDistance: PK.minDistance, look: { attack: { time: PK.attackTime } }, weapon: { range: PK.range } },
  init(w, u, B) { B.phase = 0; B.phaseT = 0; B.victim = -1; B.aimX = u.x; B.aimY = u.y; B.stick = scaledMelee(PK.stick, u); u.cooldown = w.rng() * PK.reload; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, PK.slapPose); if (B.phase === 1 && (u.stun > 0 || u.state === STATE.FLEE)) windCancel(w, u, B, ACT.WIND); },
  busy(w, u, B) { if (B.phase === 1 && w.time - B.phaseT >= PK.wind && !(u.stun > 0)) slap(w, u, B); return false; },
  idle(w, u, B) { if (B.phase === 1 && B.victim >= 0) windCancel(w, u, B, ACT.WIND); return B.phase === 1; },
  fight(w, u, t, dx, dy, d, B) {   // from hockey.js think
    const clear = clearLine(w, u);
    if (B.phase !== 1) { const r = meleeFight(w, u, t, B.stick, dx, dy, d); if (r !== 0) { if (r === 2) used(w, u, 'puck'); return; } }   // in his face: the stick
    const r = u.state === STATE.ENGAGE ? PK.range * 1.1 + 6 : PK.range;
    if (B.phase !== 1 && (!clear || d > r)) { advanceTo(w, u, t, dx, dy, clear, u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / PK.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    sidestep(w, u, t, dx, dy, d, u.def);
    if (B.phase === 1) { B.victim = t.id; return; }
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < PK.aimTol) windUp(w, u, B, ACT.WIND, t.id);
  },
  possessFire(w, u, aim, ax, ay, B) {   // hockey: wind up and slap the puck at the aim point
    B.aimX = ax; B.aimY = ay;
    if (B.phase === 0 && u.cooldown <= 0) windUp(w, u, B, ACT.WIND, -1);
  },
});
