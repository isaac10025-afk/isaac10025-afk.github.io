// Long-neck (OURS, Part 2 step 4): huge slow sauropod. Can't be tossed (and at mass 20 barely pushed), wades through any
// water. With an enemy close it rears up for 1 s and stomps: whoever is under its feet is crushed, and a shockwave ring
// hurts, knocks down and pushes out everyone around. Owner: DINOS-SIM. Pose codes (STEP4.md): b.act 1 rear, 2 stomp.
import { dino, initBag, targetOf, act, setState, hunt, idle, canAuto, grounded, high, isRisen, damage, push, infect, splatNoise, hooks, hypot, STATE, DINO, ENEMY } from './_lib.js';

const T = {
  radius: 24, hp: 3000, mass: 20,
  walk: 30, run: 50,
  stompEvery: 2.5,    // s between stomps
  trigger: 40,        // px past both bodies: an enemy this close starts a stomp
  rearTime: 1,        // s reared up
  stompPose: 0.3,     // s: stomp pose
  under: 12,          // px past both bodies: under its feet ...
  underDmg: 120,      // ... crushed for 120
  ring: 90,           // px from its body's edge: the shockwave ring ...
  ringDmg: 25,        // ... 25 at its feet, falling off to 0 at the ring's edge
  knock: 0.6,         // s knocked down (everyone in the ring)
  ringPush: 220,      // push outward (÷ mass), falling off like the damage
  ice: 2,             // ice crack strength
};
const REAR = 1, STOMP = 2;   // subState (= the pose code)
const SQ = new Array(96), HIT = new Array(96);

function enemyClose(w, u) {
  const n = w.queryMask(u.x, u.y, u.radius + T.trigger + DINO.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  let yes = false;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (!yes && !o.dead && o.hp > 0 && grounded(o) && !high(o) && hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + T.trigger) yes = true;
  }
  return yes;
}
function stomp(w, u) {
  const R = u.radius + T.ring;
  const n = w.queryMask(u.x, u.y, R + DINO.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (o.dead || !(o.hp > 0) || !grounded(o) || high(o) || o.def.prop) continue;
    if (hypot(o.x - u.x, o.y - u.y) <= R + o.radius) HIT[m++] = o;
  }
  for (let k = 0; k < m; k++) {
    const o = HIT[k]; HIT[k] = null;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001, edge = Math.max(0, d - u.radius - o.radius);
    const f = Math.max(0, 1 - edge / T.ring), crushed = d <= u.radius + o.radius + T.under;
    const pass = damage(w, o, crushed ? T.underDmg : T.ringDmg * f, u, undefined, o.x, o.y);   // from below: shields don't help
    if (isRisen(u)) infect(w, o, u, 0.5 * pass, 0);
    if (o.hp > 0) push(w, o, dx / d, dy / d, T.ringPush * (0.3 + 0.7 * f), T.knock);
  }
  splatNoise(w, u.x, u.y, 1, 300);
  if (hooks.iceHarm) hooks.iceHarm(w, u.x, u.y, R, T.ice, 0.5);
  w.emit('blast', { x: u.x, y: u.y, r: R, kind: 3 });
  w.emit('trample', { x: u.x, y: u.y, v: 3, type: u.type });
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.stun = 0;   // too big to stun (like the dragon)
  if (u.subState === REAR) {
    setState(u, STATE.ENGAGE); u.face = u.heading;
    if (now - b.t0 >= T.rearTime) { stomp(w, u); u.subState = STOMP; b.t0 = now; act(w, u, 2); }
    return;
  }
  if (u.subState === STOMP) {
    u.face = u.heading;
    if (now - b.t0 < T.stompPose) return;
    u.subState = 0; act(w, u, 0);
  }
  if (now >= b.next && canAuto(w, u) && enemyClose(w, u)) { rear(w, u); return; }
  const t = targetOf(w, u);
  if (!t) { idle(w, u); return; }
  const d = hypot(t.x - u.x, t.y - u.y);
  if (d <= u.radius + t.radius + T.trigger * 0.5) { setState(u, STATE.ENGAGE); u.face = Math.atan2(t.y - u.y, t.x - u.x); return; }
  hunt(w, u, t, d < 160 ? T.run : T.walk);
}
function rear(w, u) {
  u.subState = REAR; u.b.t0 = w.time; u.b.next = w.time + T.stompEvery; act(w, u, 1);
  setState(u, STATE.ENGAGE);
  w.emit('rear', { x: u.x, y: u.y, type: u.type });   // STEP4 AUDIO: the bellow as it rears up
}

dino({
  type: 'longneck', og: 'Long-neck',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 7,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 90, accel: 200, decel: 300, turnRate: 1.8,
  sightRange: 300, alertSightRange: 340, flammability: 0.3, density: 6,
  untossable: true,   // can't be tossed (and mass 20 barely moves under pushes)
  waterPace: 0.85,    // wades through any water, hardly slowed
  brushSpacing: 80,
  flock: { separation: 50, herd: 0.1 },
  morale: { baseline: 1, oddsWeight: 0, fearWeight: 0, woundWeight: 0, hitShock: 0, canBreak: false },
  look: { attack: { time: 0.5 } },
  init(w, u) { initBag(w, u); },
  holdsNerve() { return true; },
  // possessed, attack held at nobody: rear up and stomp anyway
  possessFire(w, u) { if (u.subState === 0 && w.time >= u.b.next) rear(w, u); },
  brain,
});
