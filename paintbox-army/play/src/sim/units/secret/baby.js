// Baby (OURS, Secret tab, Part 2 step 7): a giant toddler in a nappy. Grab + throw: every 3 s it picks up an enemy
// (mass ≤ 4) within reach, holds it up and looks at it 0.6 s, then throws it 150-300 px at the thickest enemy crowd (a
// flung body, dinos' landing rule: 20 to it when it lands, 15 + knocked down to whoever it lands on). Sit: 5+ enemies
// within 60 px → it plops down on them: 120 to everyone within 45 px + stunned 1 s. Cry: below 50 % hp, every 12 s, a
// wail: enemies within 160 px stunned 1.2 s + lose morale. Heavier enemies it can't lift get a rattle bonk (30; ours:
// the table gives it nothing for them). Fearless, too heavy to toss. Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 grab / look → `hold` (b.victim held up: the sim moves it to the baby's hands, z ~ 1.5 ×
// the baby's radius), 2 throw → `throw` (0.4 s), 3 sit → `sit` (0.8 s), 4 cry → `cry` (1.5 s); crawl `walk0`/`walk1`;
// `atk` = the rattle bonk.
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, hunt, idle, blow, swing, grabbable, glue, letGo, high,
  nearestFoe, countFoes, eachFoe, damage, stun, flung, tossTo, thickestCrowd, unitOf, hypot, angleDiff,
  heldBy, STATE, SEC, GRAVITY, FEARLESS, TAU,
  inReach,
} from './_lib.js';
import { aimAngle } from '../../systems/possess.js';

const T = {
  radius: 22,         // OG-raw radius (registerUnit ×1.1)
  hp: 3000,           // hit points
  mass: 30,           // a giant baby: can't be tossed
  walk: 35, run: 60,  // px/s crawling
  grabEvery: 3,       // s between grabs
  grabMass: 4,        // picks up enemies this light or lighter ...
  grabReach: 24,      // ... this far past both bodies (a giant baby's arms)
  look: 0.6,          // s it holds the unit up and looks at it
  holdUp: 1.5,        // × its radius: how high it holds the unit
  throwMin: 150,      // px: throws at least this far ...
  throwMax: 300,      // ... and at most this far
  throwUp: 320,       // px/s up
  crowdScan: 340,     // px: looks this far for a crowd to throw at
  landSelf: 20,       // the thrown unit takes this when it lands (the shared landing bump included)
  landHit: 15,        // whoever it lands on takes this (+ knocked down)
  sitCount: 5,        // enemies within sitR ...
  sitR: 60,           // ... px (edge distance) = it sits on them
  sitHitR: 45,        // px (edge distance from its middle): the plop hits everyone within ...
  sitDmg: 120,        // ... for this much ...
  sitStun: 1,         // ... and stuns them this long
  sitPose: 0.8,       // s sitting
  sitEvery: 3,        // s between sits
  cryBelow: 0.5,      // cries below this share of its hp ...
  cryEvery: 12,       // ... every this many s ...
  cryR: 160,          // ... a wail: enemies within ...
  cryStun: 1.2,       // ... are stunned ...
  cryMorale: 0.3,     // ... and lose this much morale
  cryPose: 1.5,       // s of the cry pose (it crawls on meanwhile)
  bonk: 30,           // rattle bonk at units too heavy to pick up
  bonkEvery: 1.4,     // s between bonks
  bonkPush: 200,      // the bonk shoves (÷ mass) ...
  bonkStun: 0.4,      // ... and stuns this long
  reach: 8,           // px past both bodies for the bonk
  runR: 320,          // px: crawls fast (run) at a target this close, else slow (walk)
  sight: 360,         // px
  shrug: 0.6,        // s: shrugs off stuns this short (ours: mixed armies kept it knocked down for good)
};
const HOLD = 1, SIT = 3;   // subState (= b.act while it lasts; the cry is a pose only: act 4 for cryPose s)
const PT = new Float64Array(3);

function okGrab(u, o) { return grabbable(o, T.grabMass) && !high(o); }
function grab(w, u, v) {
  const b = u.b;
  u.subState = HOLD; b.victim = v.id; b.t0 = w.time; b.next = w.time + T.grabEvery;
  v.hurled = 1; v.target = -1; if (v.stun < T.look + 0.3) v.stun = T.look + 0.3;
  heldBy(w, u, v);
  act(w, u, 1); u.face = Math.atan2(v.y - u.y, v.x - u.x);
  w.emit('throw', { x: v.x, y: v.y, v: 0.3, type: u.type, grab: 1 });   // STEP7 AUDIO: baby giggle
}
// the held unit is up at the baby's hands; after `look` s it goes flying at the thickest crowd (driven: along the aim)
function hold(w, u) {
  const b = u.b, v = unitOf(w, b.victim);
  if (!v || !(v.hp > 0) || v.inside >= 0) { if (v) letGo(w, v, 0.3); u.subState = 0; b.victim = -1; act(w, u, 0); return; }
  const h = u.heading, r = u.radius * 0.55;
  glue(v, u.x + Math.cos(h) * r, u.y + Math.sin(h) * r, u.radius * T.holdUp, u.vx, u.vy);
  v.hurled = 1;
  if (w.time - b.t0 >= T.look) throwIt(w, u, v);
}
function throwIt(w, u, v) {
  const b = u.b;
  let tx, ty;
  const P = u.possessed === 1 ? w.possess : null;
  if (P && P.aimX === P.aimX && P.aimY === P.aimY) { tx = P.aimX; ty = P.aimY; }   // driven: at the mouse point ...
  else if (P) { const a = aimAngle(w, u); tx = u.x + Math.cos(a) * T.throwMax * 0.7; ty = u.y + Math.sin(a) * T.throwMax * 0.7; }   // ... or along the aim
  else if (thickestCrowd(w, u, u.x, u.y, T.crowdScan, 60, null, PT)) { tx = PT[0]; ty = PT[1]; }
  else { tx = u.x + Math.cos(u.heading) * T.throwMin; ty = u.y + Math.sin(u.heading) * T.throwMin; }
  let dx = tx - v.x, dy = ty - v.y; const d = hypot(dx, dy) || 0.001;
  const dist = Math.max(T.throwMin, Math.min(T.throwMax, d));
  dx /= d; dy /= d;
  u.subState = 0; b.victim = -1; act(w, u, 2); u.face = Math.atan2(dy, dx);
  v.hurled = 0;
  tossTo(w, v, dx, dy, dist, T.throwUp);
  // the shared landing bump (8·impact/400) is part of the 20 it takes
  const k = 1 / Math.sqrt(Math.max(1, v.mass)), up = T.throwUp * k, impact = Math.sqrt(up * up + 2 * GRAVITY * Math.max(0, v.z));
  flung(w, v, u, Math.max(0, T.landSelf - 8 * impact / 400), T.landHit);
  w.emit('throw', { x: u.x, y: u.y, v: 1.4, type: u.type });
}
function carry(w, u) { if (!w.holding && u.subState === HOLD) hold(w, u); }

let _bu = null, _bw = null;
function plopOne(o, d) { damage(_bw, o, T.sitDmg, _bu, undefined, o.x, o.y); if (o.hp > 0) stun(_bw, o, T.sitStun); }   // from above: shields don't help
function sit(w, u) {
  const b = u.b;
  u.subState = SIT; b.t0 = w.time; b.next2 = w.time + T.sitEvery; act(w, u, 3);
  u.vx = 0; u.vy = 0;
  _bu = u; _bw = w;
  eachFoe(w, u, u.x, u.y, T.sitHitR, true, plopOne);
  _bu = null; _bw = null;
  w.emit('land', { x: u.x, y: u.y, v: 3, type: u.type, sit: 1 });   // STEP7 AUDIO: big plop
  w.emit('trample', { x: u.x, y: u.y, v: 2.5, type: u.type });
}
function wailOne(o) {
  stun(_bw, o, T.cryStun);
  const m = o.def.morale;
  if (m && m.canBreak) o.morale = Math.max(0, o.morale - T.cryMorale);
}
function cry(w, u) {
  const b = u.b;
  b.next3 = w.time + T.cryEvery; act(w, u, 4);   // it keeps crawling while it wails (the stunned get caught)
  _bu = u; _bw = w;
  eachFoe(w, u, u.x, u.y, T.cryR, false, wailOne);
  _bu = null; _bw = null;
  w.emit('roar', { x: u.x, y: u.y, v: 2.5, type: u.type, cry: 1 });   // STEP7 AUDIO: baby wail
}

function brain(w, u) {
  const b = u.b, now = w.time, s = u.subState;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  actDone(w, u, 2, 0.4); actDone(w, u, 4, T.cryPose);
  if (u.state === STATE.FLEE) setState(u, STATE.IDLE);
  if (s === HOLD) { setState(u, STATE.ENGAGE); return; }   // carry() holds it up and throws it
  if (s === SIT) { if (now - b.t0 >= T.sitPose) { u.subState = 0; act(w, u, 0); } return; }
  if (u.stun > T.shrug) { u.face = u.heading; return; }   // too heavy to be stun-locked by small knocks (cavalry, blows)
  const auto = canAuto(w, u);
  if (auto && u.hp < T.cryBelow * u.maxHp && now >= b.next3) { cry(w, u); return; }
  if (auto && now >= b.next2 && countFoes(w, u, u.x, u.y, T.sitR) >= T.sitCount) { sit(w, u); return; }
  const t = targetOf(w, u);
  if (auto && now >= b.next) {
    let v = t && okGrab(u, t) && hypot(t.x - u.x, t.y - u.y) <= u.radius + t.radius + T.grabReach ? t : null;
    if (!v && u.possessed !== 1) v = nearestFoe(w, u, u.x, u.y, u.radius + T.grabReach, okGrab, null);
    if (v) { grab(w, u, v); return; }
  }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const reach = u.radius + t.radius + T.reach;
  if (d <= reach + 4 && inReach(t)) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (d > reach) { u.goalX = dx / d * T.walk; u.goalY = dy / d * T.walk; }
    else if (!okGrab(u, t) && u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.9) blow(w, u, t, T.bonk, T.bonkEvery, T.bonkPush, T.bonkStun, 0, 0);
    return;
  }
  hunt(w, u, t, d > T.runR ? T.walk : T.run, d < T.runR ? STATE.ENGAGE : STATE.ADVANCE);
}

secret({
  type: 'baby', og: 'Baby (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 18,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3, accel: 300, decel: 400, turnRate: 3.5,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.3,
  intelligence: 1, flammability: 0.4, density: 5,
  untossable: true,
  risenMode: 'keep',   // a risen baby: same grabs and throws, Undead
  brushSpacing: 60,
  flock: { separation: 40, formation: 0.2 },
  morale: FEARLESS,
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(u); const b = u.b; b.next = w.time + 1 + w.rng(); b.next2 = w.time + 1; b.next3 = 0; },
  carry,
  onDeath(w, u) { if (u.subState === HOLD) { const v = unitOf(w, u.b.victim); if (v) letGo(w, v, 0.3); } },
  possessMove(w, u) { if (u.subState === SIT) { u.goalX = 0; u.goalY = 0; } },
  // possessed, attack held at nobody: holding one = throw it at the aim; else pick up whoever is in reach; else sit if
  // anyone is close; else a rattle swing
  possessFire(w, u, aim, ax, ay) {
    const b = u.b;
    if (u.subState !== 0) return;   // holding one: it goes along the aim once it has looked at it (hold)
    if (w.time >= b.next) { const v = nearestFoe(w, u, u.x, u.y, u.radius + T.grabReach, okGrab, null); if (v) { grab(w, u, v); return; } }
    if (w.time >= b.next2 && countFoes(w, u, u.x, u.y, T.sitR) >= 1) { sit(w, u); return; }
    const v = nearestFoe(w, u, u.x, u.y, u.radius + T.reach, null, null);
    if (v && inReach(v)) { if (u.cooldown <= 0) blow(w, u, v, T.bonk, T.bonkEvery, T.bonkPush, T.bonkStun, 0, 0); return; }
    swing(w, u, T.bonkEvery * 0.5);
  },
  brain,
});
export { T };
