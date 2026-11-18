// Pirates tab floppy-body drivers (Part 2 step 4, OURS). Owner: PIRATES-ART. Contract: RIG.md; parts + rest pivots are in
// sprites-pirates.js (crew() rig.joints, the cannon's rig.joints).
//   'pirate'  pirate people: the lead's biped (rig.js) plus a peg leg (swings stiff, the body rocks and dips onto it), a
//             floppy captain's tricorn on its own spring, bandana tails that stream back with speed and flutter, a parrot
//             that bobs and flaps about on a hit, and the anchor man's anchor swinging like a pendulum from his hand (it
//             hangs straight down whatever the arm does, drags behind when he walks, jumps on each step and on a hit).
//             A new pose (aim -> shoot, wind -> swing) kicks the arms so they swing into it. Bodies flop like the biped's,
//             hat knocked askew, tails and parrot limp, the anchor dropped beside him.
//   'cannon'  cannon: wheels turn with the ground covered, the carriage rocks on the axle (speed changes, hits, the shot
//             kicks the trail), the barrel recoils along itself and kicks up, then runs back out; the smoke puff grows and
//             rises from the muzzle while firing; a bump on each wheel turn while rolling.
// (The ship rocks itself in its drawUnit: sprites-pirates.js SHIP_RIG.) No allocation per unit per frame.
import * as RIG from './rig.js';
const { clamp, fresh, spring, kick, setAngle, inputs, rotAbout, squashAbout, keep, putIn, inP, putM, put, flop, h01, register, M, SPRING, PUSH, LEG } = RIG;
export const ready = true;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping], damping ratio c / (2 sqrt k) ~0.12-0.3 so they overshoot 2-3 times (TABS). Kicks rad/s.
// Angles: + = clockwise on screen in the facing-right frame (the top leans forward, a hanging thing swings back).
export const PIR = {
  K: { hat: [75, 2.6], tails: [40, 1.7], parrot: [85, 2.4], anchor: [24, 1.15] },   // hat 0.15, tails 0.13, anchor 0.12
  accel: { hat: 0.0016, tails: 0.0024, parrot: 0.0018, anchor: 0.0022 },           // rad/s per px/s² (lag on speed changes)
  hit: { hat: 2.2, tails: 1.5, parrot: 2.6, anchor: 1.2 },                          // x the biped's torso hit kick
  step: { hat: 1.1, tails: 1.6, parrot: 1.4, anchor: 1.8 },                         // kicks on every footfall
  tails: { rest: 0.05, stream: 1 / 170, max: 0.95, flut: 0.12, flutW: 13 },        // stream back with speed, flutter
  anchor: { drag: 1 / 260, dragMax: 0.45 },                                         // a dragged anchor trails behind
  poseKick: { arm: -4, hat: 1.5, parrot: 2 },                                       // a new arm pose: the arms swing into it
  peg: { swing: 0.5, rock: 0.07, dip: 1.1, jolt: 0.8 },                             // peg leg: stiff stride, rock + dip on it
  heavy: { torso: [90, 6.2], swing: 0.85 },                                         // the anchor man: heavier torso spring
  parrotBob: { a: 0.06, w: 2.1 },                                                   // the parrot shifts about on its perch
  dead: { hat: [0.4, 1.1], hatOff: [-3, 2.4], tails: [0.5, 0.6], parrot: [0.9, 0.7], anchor: [0.9, 0.6] },
  cannon: {
    K: { rock: [70, 3.4], recoil: [55, 5.5], lift: [90, 4.2], bob: [140, 5] },
    accel: 0.0007, hit: 0.6, hitPow: 2.4,
    fire: { rock: -1.6, recoil: -42, lift: -2.6 },   // recoil in px/s along the barrel (spring 1 is a length), lift muzzle up
    bump: -14, smoke: { t: 0.4, s0: 0.55, s1: 1.25, rise: -4, fwd: 3 },
  },
};

// ---------------------------------------------------------------- per-slot memory + scratch (no allocation per frame)
const NS = 32768;
const STEP = new Int32Array(NS), CODE = new Int16Array(NS), FIRE = new Float64Array(NS);
const T0 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TH = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TA = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const putT = (pose, T) => put(pose, T.a, T.b, T.c, T.d, T.e, T.f);

// ---------------------------------------------------------------- 'pirate'
// Springs: 0 torso, 1 head, 2 arms, 3 hat, 4 tails, 5 parrot, 6 anchor.
function piratePut(J, rp, tor, hd, ar, lN, lF, bob, ht, tl, pr, an, hx, hy) {
  const hipY = J.hip[1];
  rotAbout(J.hip[0], hipY, tor, 0, bob); const T = keep(T0);
  rotAbout(J.neck[0], J.neck[1], hd); inP(T); const H = keep(TH);
  rotAbout(J.shoulder[0], J.shoulder[1], ar); inP(T); const A = keep(TA);
  if (rp.back >= 0) putT(rp.back, T);
  if (rp.tails >= 0) { rotAbout(J.knot[0], J.knot[1], tl); putIn(rp.tails, H); }
  rotAbout(0, hipY, lF, -J.legX, bob * 0.5); putM(rp.legF);
  rotAbout(0, hipY, lN, J.legX, bob * 0.5); putM(rp.legN);
  putT(rp.body, T);
  putT(rp.head, H);
  if (rp.hat >= 0) { rotAbout(J.hat[0], J.hat[1], ht, hx, hy); putIn(rp.hat, H); }
  if (rp.parrot >= 0) { rotAbout(J.parrot[0], J.parrot[1], pr); putIn(rp.parrot, T); }
  putT(rp.arm, A);
  if (rp.anc >= 0) { rotAbout(J.hand[0], J.hand[1], an); putIn(rp.anc, A); }
}
function pirateAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, st = Math.floor(I.cyc), P = PIR;
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); STEP[s] = st; CODE[s] = rp.arm; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const fwd = (u.vx || 0) * I.flip, air = I.z > 1, walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0;
  if (dt > 0) {
    const ax = -In.ax * dt;
    kick(s, 0, ax * PUSH.accel); kick(s, 3, ax * P.accel.hat); kick(s, 4, ax * P.accel.tails); kick(s, 5, ax * P.accel.parrot); kick(s, 6, ax * P.accel.anchor);
    if (In.hit) {
      const h = In.hit * (PUSH.hit + PUSH.hitPow * In.hitPow) * (rp.heavy ? 0.7 : 1);
      kick(s, 0, h); kick(s, 1, 2 * h); kick(s, 2, h); kick(s, 3, P.hit.hat * h); kick(s, 4, P.hit.tails * h); kick(s, 5, P.hit.parrot * h); kick(s, 6, P.hit.anchor * h);
    }
    if (In.atkStart) { kick(s, 2, PUSH.atkArm); kick(s, 0, PUSH.atkTorso); }
    if (rp.arm !== CODE[s]) { kick(s, 2, P.poseKick.arm); kick(s, 3, P.poseKick.hat); kick(s, 5, P.poseKick.parrot); }
    if (I.moving && st !== STEP[s]) {
      const onPeg = rp.peg && (st & 1) === 0, k = onPeg ? 1.8 : 1;
      kick(s, 3, P.step.hat * k); kick(s, 4, P.step.tails); kick(s, 5, P.step.parrot * k); kick(s, 6, P.step.anchor * (st & 1 ? 1 : -1));
      if (onPeg) kick(s, 0, P.peg.jolt);
    }
  }
  STEP[s] = st; CODE[s] = rp.arm;
  const tA = air ? 0.45 * Math.sin(now * 9 + I.ph * 7) : walkS * PUSH.walkArm;
  const pegRock = rp.peg && I.moving ? P.peg.rock * walkS : 0;
  const tor = spring(s, 0, rp.lean + (I.moving ? clamp(fwd * PUSH.lean, -0.06, 0.12) : 0) + pegRock, rp.heavy ? P.heavy.torso : SPRING.torso, dt, 1);
  const hd = spring(s, 1, 0, SPRING.head, dt, 0.9);
  const ar = spring(s, 2, tA, SPRING.arm, dt, 1.3);
  const ht = rp.hat >= 0 ? spring(s, 3, -clamp(fwd / 900, -0.05, 0.12), P.K.hat, dt, 0.9) : 0;
  const tl = rp.tails >= 0 ? spring(s, 4, P.tails.rest + clamp(Math.abs(fwd) * P.tails.stream, 0, P.tails.max) + (I.moving || air ? P.tails.flut * Math.sin(I.rt * P.tails.flutW + I.ph * 6.28) : 0), P.K.tails, dt, 1.4) : 0;
  const pr = rp.parrot >= 0 ? spring(s, 5, P.parrotBob.a * Math.sin(I.rt * P.parrotBob.w + I.ph * 6.28), P.K.parrot, dt, 1) : 0;
  const an = rp.anc >= 0 ? spring(s, 6, -(tor + ar) + (I.moving ? clamp(fwd * P.anchor.drag, 0, P.anchor.dragMax) : 0), P.K.anchor, dt, 1.4) : 0;
  let lN, lF, bob = 0;
  if (air) { lN = LEG.fly * Math.sin(now * 13 + I.ph * 6); lF = -LEG.fly * 0.85 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (I.moving) {
    const A = (I.run ? LEG.run : LEG.walk) * (rp.heavy ? P.heavy.swing : 1);
    lN = A * walkS * (rp.peg ? P.peg.swing : 1); lF = -A * walkS; bob = -LEG.bob * Math.abs(walkS);
    if (rp.peg) bob -= P.peg.dip * Math.max(0, -walkS);   // standing on the peg: a dip
  } else { const sw = 0.03 * Math.sin(I.rt * 1.7 + I.ph * 6.28); lN = LEG.idle + sw; lF = -LEG.idle - sw; }
  piratePut(J, rp, tor, hd, ar, lN, lF, bob, ht, tl, pr, an, 0, 0);
  return true;
}
function pirateBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.joints, D = PIR.dead;
  let lN, lF, hd, ar, tr, ht, tl, pr, an, hx = 0, hy = 0;
  if (air) {   // tumbling through the air: everything flails
    const k = now * 12 + h01(id, 9) * 6;
    lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); ar = 0.9 * Math.sin(k * 0.8 + 2); tr = 0.25 * Math.sin(k * 0.7);
    ht = 0.5 * Math.sin(k * 1.1 + 1); tl = 0.8 + 0.4 * Math.sin(k * 1.7); pr = 0.8 * Math.sin(k * 1.4 + 2); an = 1.2 * Math.sin(k * 0.6 + 1);
  } else {
    lN = flop(rp.peg ? 0.15 + 0.4 * h01(id, 1) : 0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.5) * 1.3, t); ar = flop((h01(id, 4) - 0.6) * 2.4, t); tr = flop((h01(id, 5) - 0.5) * 0.35, t);
    ht = flop(D.hat[0] + D.hat[1] * (h01(id, 6) - 0.5), t); hx = flop(D.hatOff[0], t); hy = flop(D.hatOff[1], t);
    tl = flop(D.tails[0] + D.tails[1] * h01(id, 7), t); pr = flop(D.parrot[0] + D.parrot[1] * (h01(id, 8) - 0.3), t); an = flop(D.anchor[0] + D.anchor[1] * h01(id, 10), t);
  }
  piratePut(J, rp, tr, hd, ar, lN, lF, 0, ht, tl, pr, an, hx, hy);
  return true;
}
register('pirate', { alive: pirateAlive, body: pirateBody });

// ---------------------------------------------------------------- 'cannon'
// Springs: 0 carriage rock (about the axle), 1 barrel recoil (px along the barrel), 2 barrel lift, 3 bob (px).
// rp = { wheelF, trail, barrel, wheelN, smoke (or -1), fire (1 while the 'fire' pose shows) }.
function cannonAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, st = Math.floor(I.cyc), P = PIR.cannon;
  if (fresh(s, u, now)) { STEP[s] = st; CODE[s] = rp.fire; FIRE[s] = rp.fire ? now : -9; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (rp.fire && !CODE[s]) { FIRE[s] = now; kick(s, 0, P.fire.rock); kick(s, 1, P.fire.recoil); kick(s, 2, P.fire.lift); }
  CODE[s] = rp.fire;
  if (dt > 0) {
    kick(s, 0, -In.ax * P.accel * dt);
    if (In.hit) kick(s, 0, In.hit * (P.hit + P.hitPow * In.hitPow));
    if (I.moving && st !== STEP[s]) kick(s, 3, P.bump);
  }
  STEP[s] = st;
  const rock = spring(s, 0, 0, P.K.rock, dt, 0.45);
  const rec = spring(s, 1, 0, P.K.recoil, dt, 6);
  const lift = spring(s, 2, 0, P.K.lift, dt, 0.4);
  const bob = spring(s, 3, 0, P.K.bob, dt, 2.5);
  const wa = I.cyc * Math.max(3.2, ent.defR * 0.8) / (J.wr * ent.scale);   // wheel turn = ground covered / wheel radius
  const ax = J.axle[0], ay = J.axle[1], by = -Math.abs(bob);
  rotAbout(ax + J.far[0], ay + J.far[1], wa, 0, by); putM(rp.wheelF);
  rotAbout(ax, ay, rock, 0, by); const T = keep(T0);
  putT(rp.trail, T);
  rotAbout(J.trun[0], J.trun[1], lift, rec, 0); putIn(rp.barrel, T);
  if (rp.smoke >= 0) {
    const e = clamp((now - FIRE[s]) / P.smoke.t, 0, 1), sc = P.smoke.s0 + (P.smoke.s1 - P.smoke.s0) * e;
    squashAbout(J.muzzle[0], J.muzzle[1], sc, sc); M.e += P.smoke.fwd * e; M.f += P.smoke.rise * e; putIn(rp.smoke, T);
  }
  rotAbout(ax, ay, wa, 0, by); putM(rp.wheelN);
  return true;
}
register('cannon', { alive: cannonAlive });
