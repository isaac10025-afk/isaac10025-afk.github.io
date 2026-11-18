// SPACE tab floppy-body drivers (Part 2 step 6, OURS). Owner: SPACE-ART. Contract: RIG.md; parts + rest pivots are in
// sprites-space.js (spaceman() rig.joints, the UFO's rig.joints).
//   'spacer'  aliens + the astronaut: the lead's biped (rig.js) plus two antennas on a soft bouncy spring (they lag every
//             step, turn and hit and boing on an attack), the teleporter's scarf tails streaming back with speed, the
//             jetpack's flame flickering (longer when it speeds up) and its legs dangling and swinging in flight, the
//             astronaut's floaty tuck in a hop (slow drift of the knees, arms waving), the alien's kick (the near leg
//             snaps up and wobbles back). A new arm pose kicks the arms and antennas so they swing into it.
//             Dead: limp like the biped's, antennas drooped, scarf limp, the pack stays on the back, no flame.
//   'saucer'  the UFO: tilts into its motion (front dips going forward) and rocks back on speed changes, hovers with a slow
//             bob, a hit rocks and drops it; the glass dome jiggles on its own spring and the little pilot sloshes about
//             inside it a beat later; beaming hums (a fine shake); crashing (b.act 2) tips it over with a fast wobble.
// No allocation per unit per frame: typed arrays, scratch matrices.
import * as RIG from './rig.js';
const { clamp, fresh, spring, kick, setAngle, inputs, rotAbout, squashAbout, keep, putIn, inP, putM, put, flop, h01, register, M, SPRING, PUSH, LEG } = RIG;
export const ready = true;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping]: damping ratio c / (2 sqrt k) ~0.12-0.3 so they overshoot 2-3 times (TABS). Kicks: rad/s
// (bob: px/s). Angles: + = clockwise on screen in the facing-right frame (the top leans forward, a hanging thing swings back).
export const SPC = {
  K: { ant: [55, 1.7], tails: [40, 1.7], legs: [38, 2.2] },        // antennas 0.11 (boing), tails 0.13, dangling legs 0.18
  accel: { ant: 0.0028, tails: 0.0024, legs: 0.0016 },              // rad/s per px/s² (lag on speed changes)
  hit: { ant: 2.6, tails: 1.5, legs: 1.4 },                         // x the biped's torso hit kick
  step: { ant: 1.3, tails: 1.6 },                                   // kicks on every footfall (antennas left / right)
  atkAnt: -5,                                                       // an attack starting: antennas whip back
  poseKick: { arm: -4, ant: 3 },                                    // a new arm pose: the arms swing into it
  antFollow: 0.55,                                                  // antennas stay half upright when the head tips
  tails: { rest: 0.05, stream: 1 / 170, max: 0.95, flut: 0.12, flutW: 13 },
  fly: { legN: 0.32, legF: 0.46, sw: 0.12, swW: 2.3, lean: 1 / 500, leanMax: 0.3, accel: 1.4, bob: 1.1, bobW: 3.1 },   // jetpack flight
  flame: { amp: 0.16, w: 31, boost: 0.0004, max: 0.45 },            // flicker (scale), longer while it speeds up
  hop: { legN: -0.62, legF: 0.4, drift: 0.12, w: 2.1, arm: 0.16, ant: -3 },   // astronaut: floaty tuck
  kick: { leg: -1.25, back: 0.18, snap: -7 },                       // the alien's kick
  dead: { ant: [0.9, 0.7], tails: [0.5, 0.6] },
  ufo: {
    K: { tilt: [42, 2.6], bob: [60, 3.2], dome: [120, 3.2], pilot: [55, 2], pbob: [90, 3] },
    lean: 1 / 520, leanMax: 0.2, accel: 0.0006, hit: 0.5, hitPow: 2.2, hitBob: 30,   // tilt (rad), bob kick px/s
    hover: { a: 1.3, w: 2.2 }, domeLag: 1.4, pilotLag: 2.2, pilotAccel: 0.003,
    beam: { hum: 0.35, humW: 47 }, crash: { tilt: 0.5, wob: 0.28, wobW: 13 },
  },
};

// ---------------------------------------------------------------- per-slot memory + scratch (no allocation per frame)
const NS = 32768;
const STEP = new Int32Array(NS), CODE = new Int16Array(NS), MODE = new Int8Array(NS);
const T0 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TH = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TA = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const putT = (pose, T) => put(pose, T.a, T.b, T.c, T.d, T.e, T.f);

// ---------------------------------------------------------------- 'spacer'
// rp = { leg, body, head, ant, arm, back, tails, flame, steam (indices or -1), lean, mode, puffy }; rig.joints = { hip, neck,
// shoulder, legX, ant, knot, nozzle }. Springs: 0 torso, 1 head, 2 arms, 3 antennas, 4 tails, 5 legs (dangle / kick).
function spacerPut(J, rp, tor, hd, ar, lN, lF, bob, an, tl, fl) {
  const hipY = J.hip[1];
  rotAbout(J.hip[0], hipY, tor, 0, bob); const T = keep(T0);
  rotAbout(J.neck[0], J.neck[1], hd); inP(T); const H = keep(TH);
  rotAbout(J.shoulder[0], J.shoulder[1], ar); inP(T); const A = keep(TA);
  if (rp.flame >= 0 && fl > 0) { squashAbout(J.nozzle[0], J.nozzle[1], 0.85 + 0.15 * fl, fl); putIn(rp.flame, T); }
  if (rp.tails >= 0) { rotAbout(J.knot[0], J.knot[1], tl); putIn(rp.tails, T); }
  if (rp.back >= 0) putT(rp.back, T);
  rotAbout(0, hipY, lF, -J.legX, bob * 0.5); putM(rp.leg);
  rotAbout(0, hipY, lN, J.legX, bob * 0.5); putM(rp.leg);
  putT(rp.body, T);
  if (rp.steam >= 0) putT(rp.steam, T);
  if (rp.ant >= 0) { rotAbout(J.ant[0], J.ant[1], an); putIn(rp.ant, H); }
  putT(rp.head, H);
  putT(rp.arm, A);
}
function spacerAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, st = Math.floor(I.cyc), P = SPC;
  const mode = rp.mode === 1 && I.z <= 4 ? 0 : rp.mode, flameOn = rp.flame >= 0 && (rp.mode !== 1 || I.z > 4);   // jetpack: firing while landed
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); STEP[s] = st; CODE[s] = rp.arm; MODE[s] = mode; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const fwd = (u.vx || 0) * I.flip, air = mode === 4 || (mode === 0 && I.z > 1);
  const ground = mode === 0 && !air, walkS = I.moving && ground ? Math.sin(I.cyc * Math.PI) : 0;
  if (dt > 0) {
    const ax = -In.ax * dt;
    kick(s, 0, ax * PUSH.accel * (mode === 1 ? P.fly.accel : 1)); kick(s, 3, ax * P.accel.ant); kick(s, 4, ax * P.accel.tails); kick(s, 5, ax * P.accel.legs);
    if (In.hit) {
      const h = In.hit * (PUSH.hit + PUSH.hitPow * In.hitPow);
      kick(s, 0, h); kick(s, 1, 2 * h); kick(s, 2, h); kick(s, 3, P.hit.ant * h); kick(s, 4, P.hit.tails * h); kick(s, 5, P.hit.legs * h);
    }
    if (In.atkStart) { kick(s, 2, PUSH.atkArm); kick(s, 0, PUSH.atkTorso); kick(s, 3, P.atkAnt); }
    if (rp.arm !== CODE[s]) { kick(s, 2, P.poseKick.arm); kick(s, 3, P.poseKick.ant); }
    if (mode !== MODE[s]) { if (mode === 3) kick(s, 5, P.kick.snap); if (mode === 2 || MODE[s] === 2) kick(s, 3, P.hop.ant); }
    if (I.moving && ground && st !== STEP[s]) { kick(s, 3, P.step.ant * (st & 1 ? 1 : -1)); kick(s, 4, P.step.tails); }
  }
  STEP[s] = st; CODE[s] = rp.arm; MODE[s] = mode;
  const ph = I.ph * 6.28;
  let tA, lean = rp.lean;
  if (air) tA = 0.45 * Math.sin(now * 9 + I.ph * 7);
  else if (mode === 2) tA = P.hop.arm * Math.sin(I.rt * P.hop.w * 1.3 + ph);
  else tA = walkS * PUSH.walkArm;
  if (mode === 1) lean += clamp(fwd * P.fly.lean, -0.1, P.fly.leanMax);
  else if (I.moving && ground) lean += clamp(fwd * PUSH.lean, -0.06, 0.12);
  const tor = spring(s, 0, lean, SPRING.torso, dt, 1);
  const hd = spring(s, 1, 0, SPRING.head, dt, 0.9);
  const ar = spring(s, 2, tA, SPRING.arm, dt, 1.3);
  const an = rp.ant >= 0 ? spring(s, 3, -(tor + hd) * P.antFollow + (I.moving && ground ? 0.06 * walkS : 0), P.K.ant, dt, 1.2) : 0;
  const tl = rp.tails >= 0 ? spring(s, 4, P.tails.rest + clamp(Math.abs(fwd) * P.tails.stream, 0, P.tails.max) + (I.moving || air || mode === 1 ? P.tails.flut * Math.sin(I.rt * P.tails.flutW + ph) : 0), P.K.tails, dt, 1.4) : 0;
  const lg = spring(s, 5, 0, P.K.legs, dt, 1.1);
  let lN, lF, bob = 0, fl = 0;
  if (mode === 1) {   // flying: legs dangle back and swing, the body hovers
    const sw = P.fly.sw * Math.sin(I.rt * P.fly.swW + ph);
    lN = P.fly.legN + sw + lg; lF = P.fly.legF - sw * 0.8 + lg * 0.8;
    bob = P.fly.bob * Math.sin(I.rt * P.fly.bobW + ph);
    fl = 1 + P.flame.amp * Math.sin(I.rt * P.flame.w + ph) + clamp(Math.abs(In.ax) * P.flame.boost, 0, P.flame.max);
  } else if (mode === 2) {   // floaty hop: knees up, drifting
    const d = P.hop.drift * Math.sin(I.rt * P.hop.w + ph);
    lN = P.hop.legN + d + lg; lF = P.hop.legF - d + lg * 0.6;
  } else if (mode === 3) { lN = P.kick.leg + lg; lF = P.kick.back; }
  else if (air) { lN = LEG.fly * Math.sin(now * 13 + I.ph * 6); lF = -LEG.fly * 0.85 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (I.moving) { const A = I.run ? LEG.run : LEG.walk; lN = A * walkS; lF = -A * walkS; bob = -LEG.bob * Math.abs(walkS); }
  else { const sw = 0.03 * Math.sin(I.rt * 1.7 + ph); lN = LEG.idle + sw; lF = -LEG.idle - sw; }
  spacerPut(J, rp, tor, hd, ar, lN, lF, bob, an, tl, flameOn ? fl : 0);
  return true;
}
function spacerBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.joints, D = SPC.dead;
  let lN, lF, hd, ar, tr, an, tl;
  if (air) {   // tumbling through the air: everything flails
    const k = now * 12 + h01(id, 9) * 6;
    lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); ar = 0.9 * Math.sin(k * 0.8 + 2); tr = 0.25 * Math.sin(k * 0.7);
    an = 0.9 * Math.sin(k * 1.6 + 2); tl = 0.8 + 0.4 * Math.sin(k * 1.7);
  } else {
    lN = flop(0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.5) * 1.3, t); ar = flop((h01(id, 4) - 0.6) * 2.4, t); tr = flop((h01(id, 5) - 0.5) * 0.35, t);
    an = flop(D.ant[0] + D.ant[1] * (h01(id, 6) - 0.3), t); tl = flop(D.tails[0] + D.tails[1] * h01(id, 7), t);
  }
  spacerPut(J, rp, tr, hd, ar, lN, lF, 0, an, tl, 0);
  return true;
}
register('spacer', { alive: spacerAlive, body: spacerBody });

// ---------------------------------------------------------------- 'saucer'
// rp = { domeB, pilot, domeF, hull, lit, glow, smoke (indices or -1), crash, beam }; rig.joints = { pivot, dome, pilot }.
// Springs: 0 tilt (about the pivot), 1 bob (px), 2 dome jiggle, 3 pilot slosh, 4 pilot bounce (px).
const TD = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function saucerAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, P = SPC.ufo, K = P.K;
  fresh(s, u, now);
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const fwd = (u.vx || 0) * I.flip, ph = I.ph * 6.28;
  if (dt > 0) {
    const ax = -In.ax * dt;
    kick(s, 0, ax * P.accel); kick(s, 2, ax * P.accel * P.domeLag); kick(s, 3, ax * P.pilotAccel);
    if (In.hit) { const h = In.hit * (P.hit + P.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, P.hitBob * (0.5 + In.hitPow)); kick(s, 2, P.domeLag * h); kick(s, 3, P.pilotLag * h); kick(s, 4, -P.hitBob * 0.6); }
  }
  let tiltT = clamp(fwd * P.lean, -P.leanMax, P.leanMax), hum = 0;
  if (rp.crash) tiltT = P.crash.tilt + P.crash.wob * Math.sin(I.rt * P.crash.wobW + ph);
  if (rp.beam) hum = P.beam.hum * Math.sin(I.rt * P.beam.humW + ph);
  const tilt = spring(s, 0, tiltT, K.tilt, dt, 1.2);
  const bob = spring(s, 1, 0, K.bob, dt, 10) + P.hover.a * Math.sin(I.rt * P.hover.w + ph) + hum;
  const dome = spring(s, 2, 0, K.dome, dt, 0.5);
  const sl = spring(s, 3, -tilt * 0.6, K.pilot, dt, 0.8);
  const pb = spring(s, 4, 0, K.pbob, dt, 4);
  rotAbout(J.pivot[0], J.pivot[1], tilt, 0, bob); const T = keep(T0);
  rotAbout(J.dome[0], J.dome[1], dome); inP(T); const D = keep(TD);
  putT(rp.domeB, D);
  rotAbout(J.pilot[0], J.pilot[1], sl, 0, pb); putIn(rp.pilot, D);
  putT(rp.domeF, D);
  putT(rp.hull, T);
  putT(rp.lit, T);
  if (rp.glow >= 0) putT(rp.glow, T);
  if (rp.smoke >= 0) putT(rp.smoke, T);
  return true;
}
register('saucer', { alive: saucerAlive });
