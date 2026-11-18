// Yeti (OURS, Secret tab, Part 2 step 7): big shaggy snow beast. Snowball: range 120-320, every 2.5 s it lobs a
// `snowball` (projectile, lands on its aim point): splash r 28: 25 + chilled (speed ×0.5 for 3 s, ocean's slow) and a
// fire put out; hit 3 times within 6 s = frozen solid 2.5 s (stunned; an `iceblock` effect projectile rides on the
// victim). Slam (melee): 70 + toss. On ice it runs ×1.6 and never slips (iceGrip 1). Fire hurts ×1.5 (fire hits through
// damageMul, burning ticks in its brain). Too heavy to toss (mass 16). Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 throw → `throw` (0.5 s from the throw), 2 slam → `slam` (0.4 s from the slam).
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, hunt, idle, fleeing, clearLine, blow, swing, chill,
  damage, quench, depthAt, fireProjectile, removeProjectile, registerProjectileKind, high, nearestFoe,
  hypot, angleDiff, STATE, WET, DT, SEC, ENEMY,
  inReach,
} from './_lib.js';
import { BURN_DPS } from '../../combat/fire.js';

const T = {
  radius: 17,         // OG-raw radius (registerUnit ×1.1)
  hp: 1800,           // hit points
  mass: 16,           // too heavy to toss
  walk: 40, run: 80,  // px/s
  snowMin: 120,       // px: throws snowballs at targets this far ...
  snowMax: 320,       // ... up to this far
  snowEvery: 2.5,     // s between snowballs
  flight: 0.8,        // s a snowball flies
  apex: 60,           // px: top of its arc
  splash: 28,         // px: splash radius where it lands
  snowDmg: 25,        // damage to each unit in the splash
  chill: 3,           // s chilled ...
  chillMul: 0.5,      // ... at this speed
  freezeHits: 3,      // hits ...
  freezeWin: 6,       // ... within this many s ...
  freeze: 2.5,        // ... = frozen solid this long (stunned)
  aimTol: 0.5,        // rad: throws only when facing this close to the aim
  slam: 70,           // slam damage
  slamEvery: 1.6,     // s between slams
  slamReach: 8,       // px past both bodies
  slamOut: 170,       // px/s: a slammed unit is tossed out this fast ...
  slamUp: 260,        // ... and this high
  iceRun: 1.6,        // × speed on ice
  fireMul: 1.5,       // × fire damage (hits and burning)
  sight: 380,         // px
  shrug: 0.4,        // s: shrugs off stuns this short (ours: mixed armies kept it knocked down for good)
};

// ---- snowball (projectile 'snowball'): lobbed, lands on its point after `flight` s, splashes everyone hostile there
const SQ = new Array(48);
let _p = null, _w = null, _own = null;
function splashOne(o, d) {
  const pass = damage(_w, o, _p.damage, _own, undefined, _p.x, _p.y);
  if (!(o.hp > 0) || pass < 0.3) return;
  if (o.burning > 0) { o.burning = 0; _w.emit('steampuff', { x: o.x, y: o.y - o.radius }); }
  chill(_w, o, _own || _p.owner, T.chill, T.chillMul, T.freezeWin, T.freezeHits, T.freeze);
}
function stepSnow(w, p, i) {
  p.px = p.x; p.py = p.y;
  p.x = Math.min(w.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(w.H, Math.max(0, p.y + p.vy * DT));
  const f = 1 - p.life / p.maxLife; p.z = 4 * p.apex * f * (1 - f);
  p.life -= DT;
  if (p.life > 0) return;
  // land: everyone hostile on the ground within the splash (+ their radius)
  const own = p.owner >= 0 ? w.unitById(p.owner) : null;
  const n = w.queryMask(p.x, p.y, T.splash + SEC.MARGIN, own ? ENEMY[own.faction] : ENEMY[p.faction] || 0, SQ, SQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0 || high(o) || o.z > SEC.SKY) continue;
    if (hypot(o.x - p.x, o.y - p.y) - o.radius > T.splash) continue;
    SQ[m++] = o;
  }
  _p = p; _w = w; _own = own;
  for (let k = 0; k < m; k++) { const o = SQ[k]; SQ[k] = null; splashOne(o, 0); }
  _p = null; _w = null; _own = null;
  w.emit(depthAt(w, p.x, p.y) >= WET ? 'splash' : 'land', { x: p.x, y: p.y, v: 0.6, snow: 1, r: T.splash });   // STEP7 AUDIO: snow splat
  removeProjectile(w, i);
}
registerProjectileKind('snowball', stepSnow);

function throwAt(w, u, ax, ay) {
  fireProjectile(w, 'snowball', u, ax, ay, { life: T.flight, apex: T.apex, damage: T.snowDmg, muzzle: 0.9 });
  u.b.next = w.time + T.snowEvery;
  act(w, u, 1);
  w.emit('throw', { x: u.x, y: u.y, v: 1.2, type: u.type, snow: 1 });
}
function slam(w, u, t) {
  blow(w, u, t, T.slam, T.slamEvery, 0, 0, T.slamOut, T.slamUp);
  act(w, u, 2);
  w.emit('trample', { x: t.x, y: t.y, v: 1.5, type: u.type });
}
function onIce(w, u) { return w.iceCells > 0 && w.iceAt(u.x, u.y) > 0; }

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  actDone(w, u, 1, 0.5); actDone(w, u, 2, 0.4);
  if (u.stun > T.shrug) { u.face = u.heading; return; }   // too heavy to be stun-locked by small knocks (cavalry, blows)
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const reach = u.radius + t.radius + T.slamReach;
  if (d <= reach + 4 && inReach(t)) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (d > reach) { u.goalX = dx / d * T.walk; u.goalY = dy / d * T.walk; }
    else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.8) slam(w, u, t);
    return;
  }
  const max = u.state === STATE.ENGAGE ? T.snowMax * 1.1 : T.snowMax;
  if (d >= T.snowMin && d <= max && clearLine(w, u) && !high(t)) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (now >= b.next && Math.abs(angleDiff(u.heading, a)) < T.aimTol && canAuto(w, u)) throwAt(w, u, t.x + t.vx * T.flight, t.y + t.vy * T.flight);
    return;
  }
  hunt(w, u, t, d > T.snowMax ? T.walk : T.run, d < T.snowMin ? STATE.ENGAGE : STATE.ADVANCE);
  if (onIce(w, u)) { u.goalX *= T.iceRun; u.goalY *= T.iceRun; }
}
// every tick (also while holding / reacting, as the fire system burns): fire hurts it ×1.5 (fire.js burns 18 hp/s off hp)
function carry(w, u) { if (u.burning > 0) u.hp -= (T.fireMul - 1) * BURN_DPS * DT; }
// driven: the stick's speed gets the same ice boost (possessMove runs after the stick has set the goal)
function possessMove(w, u) { if (onIce(w, u)) { u.goalX *= T.iceRun; u.goalY *= T.iceRun; } }

secret({
  type: 'yeti', og: 'Yeti (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 12,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * T.iceRun * 1.1, accel: 400, decel: 500, turnRate: 4,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.25,
  intelligence: 1, flammability: 0.6, density: 4, iceGrip: 1,   // fur burns; never slips on ice
  weapon: { range: T.snowMax },   // possess: aim reach
  risenMode: 'keep',              // a risen yeti: same snowballs, Undead
  brushSpacing: 44,
  flock: { separation: 40, formation: 0.3 },
  morale: { baseline: 1, oddsWeight: 0.05, fearWeight: 0, casualtyWeight: 0, woundWeight: 0.1, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.1, rallyAt: 0.4, minFleeTime: 2, dropRate: 1, recoverRate: 0.4, panicFear: 0.1, deathFear: 0.4 },
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(u); u.b.next = w.time + T.snowEvery * w.rng(); },
  damageMul(w, u, amount, att, kind) { return kind === 'fire' ? T.fireMul : 1; },
  possessMove,
  carry,
  // possessed, attack held at nobody: slam whoever is in reach, else a snowball at the aim point (kept to 120-320 px)
  possessFire(w, u, aim, ax, ay) {
    const v = nearestFoe(w, u, u.x, u.y, u.radius + T.slamReach, null, null);
    if (v && inReach(v)) { if (u.cooldown <= 0) slam(w, u, v); return; }
    if (w.time < u.b.next) { swing(w, u, T.slamEvery * 0.4); return; }
    let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.max(T.snowMin, Math.min(T.snowMax, d)) / d;
    throwAt(w, u, u.x + dx * k, u.y + dy * k);
  },
  brain,
});
export { T };
