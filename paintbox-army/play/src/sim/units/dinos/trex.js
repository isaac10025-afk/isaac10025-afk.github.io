// T-Rex (OURS, Part 2 step 4): huge biter. Roars when it first sees enemies and every 12 s in a fight (morale hit, animals
// close by run for 2 s). Its bite lifts a light victim in the jaws, shakes it, then throws it 120-200 px; whoever it lands
// on is hurt and knocked down (_lib.js dinoFlung). Owner: DINOS-SIM.
// Pose codes (STEP4.md): b.act 1 roar, 2 bite, 3 hold / shake (b.victim held in the jaws, moved by the sim).
import {
  dino, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, chew, canAuto, grabbable, glue, flung, fleeFor, unitOf,
  splatNoise, hypot, angleDiff, STATE, GRAVITY, ENEMY, INT,
} from './_lib.js';

const T = {
  radius: 20, hp: 1800, mass: 12,
  walk: 42, run: 110,
  bite: 60, biteEvery: 1.3, bitePush: 140,
  bitePose: 0.35,     // s: bite pose
  liftMass: 4.5,      // victims this light or lighter are lifted in the jaws
  shakeTime: 0.8,     // s shaken ...
  shakeDmg: 15,       // ... for 15 ...
  shakeEvery: 0.2,    // ... every 0.2 s
  throwMin: 120, throwMax: 200,   // px thrown
  throwSpread: 0.7,   // rad either side of straight ahead
  landHit: 15,        // whoever the thrown victim lands on: damage (+ knocked down)
  roarEvery: 12,      // s between roars in a fight
  roarTime: 1.2,      // s standing roaring
  roarR: 220,         // px: enemies within lose ...
  roarMorale: 0.35,   // ... 0.35 × (1 − d/220) morale
  roarFleeR: 120,     // px: Animal-level enemies this close ...
  roarFlee: 2,        // ... run for 2 s
  noise: 400,         // px: noise splat radius
};
const ROAR = 1, HOLD = 3;   // subState (= the pose code)
const RQ = new Array(96);

function roar(w, u) {
  const b = u.b;
  u.subState = ROAR; b.t0 = w.time; b.next2 = w.time + T.roarEvery; act(w, u, 1);
  splatNoise(w, u.x, u.y, 1, T.noise);
  const n = w.queryMask(u.x, u.y, T.roarR, ENEMY[u.faction], RQ, RQ.length);
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d > T.roarR) continue;
    o.morale = Math.max(0, o.morale - T.roarMorale * (1 - d / T.roarR));
    if (d <= T.roarFleeR && o.def.intelligence === INT.Animal) fleeFor(w, o, T.roarFlee, u.x, u.y);
  }
  w.emit('roar', { x: u.x, y: u.y, v: 3, type: u.type });
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.stun = 0;   // shrugs off stuns, like the dragon (a boar's gores kept it stunned for good)
  if (u.subState === HOLD) { shake(w, u); return; }
  if (u.subState === ROAR) {
    const t = targetOf(w, u);
    setState(u, STATE.ALERT);
    if (t) u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (now - b.t0 >= T.roarTime) { u.subState = 0; act(w, u, 0); }
    return;
  }
  if (b.act === 2 && now - b.actT > T.bitePose) act(w, u, 0);
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { if (u.state === STATE.IDLE) b.seen = 0; idle(w, u); return; }
  if (canAuto(w, u) && (b.seen === 0 || now >= b.next2)) { b.seen = 1; roar(w, u); return; }   // first sight, then every 12 s
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + 8) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.8) chomp(w, u, t);
    return;
  }
  hunt(w, u, t, d < 260 ? T.run : T.walk, d < 260 ? STATE.CHARGE : STATE.ADVANCE);
}

function chomp(w, u, t) {
  const liftable = grabbable(t, T.liftMass) && t.climb === 0;
  const pass = bite(w, u, t, T.bite, T.biteEvery, liftable ? 0 : T.bitePush, liftable ? 0 : 0.3);
  act(w, u, 2);
  if (!liftable || !(t.hp > 0) || pass < 0.5) return;
  const b = u.b;
  u.subState = HOLD; b.victim = t.id; b.t0 = w.time; b.t1 = w.time + T.shakeEvery; t.hurled = 1;
  act(w, u, 3);
}
// held in the jaws at the mouth (like the gator's: 1.15 r in front, up at the head), shaken, bitten, then thrown
function shake(w, u) {
  const b = u.b, v = unitOf(w, b.victim), now = w.time;
  if (!v || !(v.hp > 0) || u.hp <= 0) { letGo(w, u, v, false); return; }
  setState(u, STATE.ENGAGE);
  const side = Math.cos(u.heading) >= 0 ? 1 : -1, r = u.radius, jig = 3 * Math.sin(40 * now + u.index);
  glue(v, u.x + side * r * 1.15 + jig, u.y + 1, r * 1.3 + 0.6 * jig, u.vx, u.vy);
  u.face = u.heading;
  if (now >= b.t1 - 1e-6) { chew(w, u, v, T.shakeDmg); b.t1 += T.shakeEvery; }   // 0.2, 0.4, 0.6, 0.8 s
  if (now - b.t0 >= T.shakeTime - 1e-6) letGo(w, u, unitOf(w, b.victim), true);
}
function letGo(w, u, v, thrown) {
  const b = u.b;
  u.subState = 0; b.victim = -1; act(w, u, 0); u.cooldown = Math.max(u.cooldown, 0.5);
  if (!v) return;
  v.hurled = 0;
  if (!thrown || !(v.hp > 0)) { v.z = Math.max(v.z, 1); return; }   // dropped: falls where it is
  const dist = T.throwMin + (T.throwMax - T.throwMin) * w.rng(), ang = u.heading + T.throwSpread * (2 * w.rng() - 1);
  const tt = Math.min(0.8, Math.max(0.45, dist / 260));
  v.vx = Math.cos(ang) * dist / tt; v.vy = Math.sin(ang) * dist / tt;
  v.vz = (0.5 * GRAVITY * tt * tt - v.z) / tt;
  v.spin = (Math.cos(ang) >= 0 ? 1 : -1) * 2 * Math.PI / tt; v.thrownAt = w.time;
  v.stun = Math.max(v.stun, tt + 0.4);
  flung(w, v, u, 0, T.landHit);
  w.emit('throw', { x: u.x, y: u.y, v: 2, type: u.type });
}

dino({
  type: 'trex', og: 'T-Rex',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 6,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 170, accel: 300, decel: 400, turnRate: 3,
  sightRange: 340, alertSightRange: 400, flammability: 0.3, density: 5, untossable: true,
  brushSpacing: 60,
  morale: { baseline: 1, oddsWeight: 0, fearWeight: 0, woundWeight: 0.1, hitShock: 0, canBreak: false },
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(w, u); },
  holdsNerve() { return true; },
  onDeath(w, u) { if (u.subState === HOLD) letGo(w, u, unitOf(w, u.b.victim), false); },
  // possessed, attack held at nobody: roar (when it's ready)
  possessFire(w, u) {
    if (u.subState !== 0 || w.time < u.b.next2) return;
    u.b.seen = 1; roar(w, u);
  },
  brain,
});
