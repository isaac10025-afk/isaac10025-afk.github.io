// SPORTS tab floppy-body driver (OURS, Part 2 step 6, STEP6.md; contract RIG.md). Owner: SPORTS-ART. Parts + rest places
// + per-pose numbers: sprites-sports.js (each entry's rig.joints / rig.tune, the POSE table it builds rig.parts() from).
//   'sport'  every sports player. The lead's biped (rig.js) grown TABS-floppy:
//            - TWO arm parts (near + far), each on its own spring about its own shoulder, so free arms swing with the
//              stride and flail on a hit; heavy gear rides on a soft spring and lags (the bowling ball, the boxing gloves);
//            - gear SWINGS from one pose's direction to the next (bat wind -> swing comes round over the top, the
//              slapshot whips through, the pitch whips over), overshooting and wobbling back;
//            - a punch (tackler, boxer jabs) shoots the arm out of the shoulder on a stiff spring (squashed, then snaps
//              long and settles), every new punch again;
//            - a hip drop / crouch on a spring (bowl lunge, swing stride, the tackle dive lands and bounces on the grass),
//              legs squashed to fit; the tackle leans the whole body flat (lean spring, overshoots into the ground);
//            - per-type gaits: sprint (long stride, arms pumping, big bob), skating on ice (slow long pushes, each leg in
//              turn), the sumo waddle (short stride, rocking, heavy bob, belly jiggle), the boxer bouncing on his toes;
//            - timed moves from u.b.actT: the cheerleader's hops (tucked legs, ponytail flying), the sumo stomp (near
//              leg raised high, then slammed down: the body bounces, the belly wobbles), the boxer's dodge (sidestep);
//            - a floppy ponytail (cheerleader) / topknot (sumo) on its own spring on the head;
//            - the sumo belly as a jelly (squash spring: every step, hit, shove and stomp jiggles it).
//            Dead bodies flop like the biped's: limbs splayed by id, head lolled, ponytail limp, the sumo's belly settles.
// No allocation per unit per frame (typed arrays + the rig.js BANK).
import * as RIG from './rig.js';
const { clamp, fresh, spring, kick, setAngle, inputs, rotAbout, squashAbout, keep, putIn, inP, putM, put, flop, h01, register, M, NSPR, BANK } = RIG;
export const ready = true;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping]: damping ratio c / (2 sqrt k) ~0.2-0.3 so they overshoot 2-3 times (TABS). Kicks in rad/s
// (px/s for the px springs). Angles: + = clockwise on screen in the facing-right frame (the top leans forward; a hanging
// arm / leg swings back).
export const SPT = {
  K: {
    torso: [120, 6.2], head: [200, 5.2], arm: [150, 6.4],   // ratio ~0.28 / 0.18 / 0.26
    armHeavy: [64, 3.4],    // the bowling ball arm: slow, lags a lot (0.21)
    armGlove: [118, 4.8],   // boxing gloves: a bit heavier than a bare arm (0.22)
    tail: [52, 2.1],        // ponytail / topknot (0.15)
    drop: [170, 6.6], lift: [300, 11], raise: [150, 5.4], belly: [210, 4.2], shift: [240, 11], reach: [320, 8.2],
  },
  accel: 0.0011, lean: 1 / 700, hit: 3, hitPow: 12, atkTorso: -1.6, atkArm: -6,   // as the biped
  arm: { accel: 0.0017, hit: 1.7, swingMax: 2.4 },      // arms lag a speed change; a blow flails them; a pose change swings gear <= 2.4 rad
  legs: { walk: 0.5, run: 0.85, idle: 0.09, fly: 0.95, bob: 0.9 },
  sprint: { stride: 1.05, arm: 0.8, bob: 1.5 },         // tackler sprint: long stride, arms pumping hard
  skate: { stride: 0.8, rate: 0.5, back: 0.15, bob: 0.35, arm: 0.1 },   // hockey on ice: half the step rate, each leg pushes back
  waddle: { stride: 0.32, rock: 0.07, bob: 1.4 },       // sumo walk: short stride, rocks, sinks on each step
  tail: { accel: 0.0026, hit: 1.8, step: 1.5, stream: 1 / 190, max: 0.85, rest: 0.08, flut: 0.1, flutW: 11, hop: 2.4 },
  belly: { step: 0.7, hit: 1.2, hitPow: 2.2, pose: 1.4, land: 1.6 },   // jiggle kicks (y-scale offset per s)
  jump: { h: 7.5, t: 0.46 },                            // cheer hops: height px, one hop s
  stomp: { up: -2.0, t: 0.58, drop: 30, belly: 3.6, torso: 1.3, head: 2.6, arms: 2.2 },   // leg up for t s (sumo.js raise 0.6), then the slam
  dodge: { dx: -4.6, t: 0.24 },                         // sidestep back px, for t s
  bounce: { h: 0.9, w: 8.5 },                           // boxer bouncing on his toes (px, rad/s)
  reach: -0.5,                                          // a punch starts this much shorter (x scale - 1), snaps out
  dropKick: 7,                                          // a crouch painted for its drop lands with a bounce
  dead: { tail: [0.6, 0.8], belly: -0.1 },
};
const NOTUNE = {};

// ---------------------------------------------------------------- per-slot memory + scratch (no allocation per frame)
const NS = 32768;
const CODE = new Int16Array(NS), STEP = new Int32Array(NS), HOP = new Int32Array(NS), SLAM = new Uint8Array(NS), PUNCH = new Int8Array(NS);
const DIRN = new Float32Array(NS), DIRF = new Float32Array(NS), DROP = new Float32Array(NS), ACT0 = new Float64Array(NS);
const T0 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TH = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, T1 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const putT = (pose, T) => put(pose, T.a, T.b, T.c, T.d, T.e, T.f);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** A new pose: spring i (an arm) starts where the old pose held its gear and swings round to the new one. */
function swing(s, i, from, to) { const o = (s * NSPR + i) * 2; BANK[o] = clamp(BANK[o] + wrapA(from - to), -SPT.arm.swingMax, SPT.arm.swingMax); }

// ---------------------------------------------------------------- pose codes (rp.code: a pose change is seen by number)
const CODES = new Map();
export function POSE_CODE(p) { let c = CODES.get(p); if (c === undefined) { c = CODES.size + 1; CODES.set(p, c); } return c; }

// ---------------------------------------------------------------- output
// rp = { legN, legF, body, head, tail, armN, armF (part indices, -1 none), nFix / fFix (0 straight leg turned about the hip,
//        1 bent leg painted on the ground for `crouch` px of drop: squashed to the hip, 2 bent leg painted in the air: rides
//        with the hip), legNA / legFA (rest angles), legs (gait: 0 walk, 1 sprint, 2 skate, 3 painted legs, 5 waddle,
//        6 posed: no stride), lean, drop, crouch, wN / wF (gear direction, rad), punch (0, 1 near, 2 far, 3 both), anim (0, 1 hop,
//        2 stomp, 3 dodge, 4 bounce), heavyN (0, 1 ball, 2 gloves), legFront (near leg drawn over the body), code }.
// joints = { hip, neck, shN, shF, legX, tail, tailFront, belly (squash pivot), bellyTop (y) }.
function legPut(part, fix, dx, ang, hipY, down, sx, up, crouch, stiff) {
  if (part < 0) return;
  const hy = hipY + down;
  if (fix === 1) { put(part, 1, 0, 0, clamp(hy / (hipY + crouch), 0.55, 1.5), sx, up); return; }   // painted on the ground
  if (fix === 2) { put(part, 1, 0, 0, 1, sx, down + up); return; }                                // painted in the air
  rotAbout(0, hy, ang, dx + sx, up); const Rm = keep(T1);
  if (stiff) { putM(part); return; }                                                               // posed (the tackle): full length
  squashAbout(0, 0, 1, clamp(hy / hipY, 0.5, 1.5)); inP(Rm); putM(part);                           // straight: foot stays down
}
function sportPut(J, rp, tor, hd, aN, aF, lN, lF, down, lift, sx, tl, q, rN, rF) {
  const hipY = J.hip[1], up = down - lift;
  rotAbout(J.hip[0], hipY, tor, sx, up); const T = keep(T0);
  const stiff = rp.legs === 6;
  legPut(rp.legF, rp.fFix, -J.legX, lF, hipY, down, sx, -lift, rp.crouch, stiff);
  if (!rp.legFront) legPut(rp.legN, rp.nFix, J.legX, lN, hipY, down, sx, -lift, rp.crouch, stiff);
  if (q !== 0) { squashAbout(J.belly[0], J.belly[1], 1 - 0.55 * q, 1 + q); putIn(rp.body, T); } else putT(rp.body, T);
  if (rp.legFront) legPut(rp.legN, rp.nFix, J.legX, lN, hipY, down, sx, -lift, rp.crouch, stiff);   // the sumo's raised leg, out in front of his belly
  const by = q * (J.bellyTop - J.belly[1]);   // the belly's top moves with the jiggle: head + arms ride on it
  rotAbout(J.neck[0], J.neck[1], hd, 0, by); inP(T); const H = keep(TH);
  if (rp.tail >= 0 && !J.tailFront) { rotAbout(J.tail[0], J.tail[1], tl); putIn(rp.tail, H); }
  putT(rp.head, H);
  if (rp.tail >= 0 && J.tailFront) { rotAbout(J.tail[0], J.tail[1], tl); putIn(rp.tail, H); }
  if (rp.armF >= 0) { squashAbout(J.shF[0], J.shF[1], 1 + rF, 1, aF); M.f += by; putIn(rp.armF, T); }
  if (rp.armN >= 0) { squashAbout(J.shN[0], J.shN[1], 1 + rN, 1, aN); M.f += by; putIn(rp.armN, T); }
}

// ---------------------------------------------------------------- 'sport'
// Springs: 0 torso, 1 head, 2 near arm, 3 far arm, 5 tail, 6 hip drop (px), 8 near-leg raise, 9 belly (y scale - 1),
// 10 sidestep (px), 11 punch reach (x scale - 1).
function sportAlive(ent, rp, u, I) {
  const Rg = ent.e.rig, J = Rg.joints, TU = Rg.tune || NOTUNE, s = I.slot, now = I.now, P = SPT;
  const rate = rp.legs === 2 ? P.skate.rate : 1, st = Math.floor(I.cyc * rate);
  const b = u.b;
  if (fresh(s, u, now)) {
    setAngle(s, 0, rp.lean); setAngle(s, 6, rp.drop);
    CODE[s] = rp.code; DIRN[s] = rp.wN; DIRF[s] = rp.wF; DROP[s] = rp.drop; STEP[s] = st; ACT0[s] = now - 9; SLAM[s] = 1; PUNCH[s] = 0; HOP[s] = 0;
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (CODE[s] !== rp.code) {
    swing(s, 2, DIRN[s], rp.wN); swing(s, 3, DIRF[s], rp.wF);
    if (rp.drop !== DROP[s] && (rp.nFix === 1 || rp.fFix === 1)) { const o = (s * NSPR + 6) * 2; BANK[o] = rp.drop; BANK[o + 1] += (rp.drop - DROP[s]) * P.dropKick; }
    if (rp.punch) { PUNCH[s] = rp.punch; setAngle(s, 11, P.reach); BANK[(s * NSPR + 11) * 2 + 1] = 0; } else PUNCH[s] = 0;
    if (TU.belly) kick(s, 9, -P.belly.pose);
    ACT0[s] = b && b.act > 0 && b.actT !== undefined && b.actT <= now && now - b.actT < 2 ? b.actT : now;
    SLAM[s] = 0; HOP[s] = 0;
    CODE[s] = rp.code; DIRN[s] = rp.wN; DIRF[s] = rp.wF; DROP[s] = rp.drop;
  }
  const fwd = (u.vx || 0) * I.flip, air = I.z > 1;
  const mv = I.moving && rp.legs !== 3 && rp.legs !== 6;
  const walkS = mv ? Math.sin(I.cyc * Math.PI * rate) : 0;
  if (dt > 0) {
    const ax = -In.ax * dt;
    kick(s, 0, ax * P.accel); kick(s, 2, ax * P.arm.accel); kick(s, 3, ax * P.arm.accel); kick(s, 5, ax * P.tail.accel);
    if (In.hit) {
      const h = In.hit * (P.hit + P.hitPow * In.hitPow) * (TU.steady || 1);
      kick(s, 0, h); kick(s, 1, 2 * h); kick(s, 2, P.arm.hit * h); kick(s, 3, P.arm.hit * h * 1.15); kick(s, 5, P.tail.hit * h);
      if (TU.belly) kick(s, 9, -(P.belly.hit + P.belly.hitPow * In.hitPow));
    }
    if (In.atkStart) {
      kick(s, 0, P.atkTorso);
      if (rp.punch) { PUNCH[s] = rp.punch; setAngle(s, 11, P.reach); BANK[(s * NSPR + 11) * 2 + 1] = 0; }
      else kick(s, 2, P.atkArm);
    }
    if (mv && st !== STEP[s]) { kick(s, 5, P.tail.step * (st & 1 ? 1 : -1)); if (TU.belly) kick(s, 9, -P.belly.step); }
  }
  STEP[s] = st;
  // timed moves (from the act's start)
  const tA = now - ACT0[s];
  let lift = 0, shiftT = 0, raiseT = 0;
  if (rp.anim === 1) {   // hops: a ballistic arc each P.jump.t; each landing jiggles the ponytail
    const n = Math.floor(tA / P.jump.t), ph = tA / P.jump.t - n;
    lift = 4 * P.jump.h * ph * (1 - ph);
    if (n !== HOP[s] && dt > 0) { HOP[s] = n; kick(s, 5, P.tail.hop); kick(s, 0, 0.8); kick(s, 2, -1.6); kick(s, 3, 1.6); }
  } else if (rp.anim === 2) {   // stomp: the near leg high, then slammed down
    if (tA < P.stomp.t) raiseT = P.stomp.up;
    else if (!SLAM[s] && dt > 0) {
      SLAM[s] = 1; const S = P.stomp;
      kick(s, 6, S.drop); kick(s, 0, S.torso); kick(s, 1, S.head); kick(s, 2, S.arms); kick(s, 3, -S.arms);
      if (TU.belly) kick(s, 9, -S.belly);
    }
  } else if (rp.anim === 3) shiftT = tA < P.dodge.t ? P.dodge.dx : 0;
  else if (rp.anim === 4 && !mv) lift = P.bounce.h * Math.abs(Math.sin(I.rt * P.bounce.w + I.ph * 6.28));
  // springs
  const rock = rp.legs === 5 && mv ? P.waddle.rock * walkS : 0;
  const tor = spring(s, 0, rp.lean + (mv ? clamp(fwd * P.lean, -0.06, 0.12) : 0) + rock, P.K.torso, dt, 1.75);
  const hd = spring(s, 1, 0, P.K.head, dt, 0.9);
  let tN, tF;
  if (air) { tN = 0.6 * Math.sin(now * 9 + I.ph * 7); tF = -0.6 * Math.sin(now * 8.3 + I.ph * 5); }
  else if (rp.legs === 1) { tN = -P.sprint.arm * walkS; tF = P.sprint.arm * walkS; }
  else if (rp.legs === 2) { tN = P.skate.arm * walkS; tF = -P.skate.arm * walkS; }
  else { tN = -(TU.swingN ?? 0.2) * walkS; tF = (TU.swingF ?? 0.3) * walkS; }
  const KN = rp.heavyN === 1 ? P.K.armHeavy : rp.heavyN === 2 ? P.K.armGlove : P.K.arm, KF = rp.heavyN === 2 ? P.K.armGlove : P.K.arm;
  const aN = spring(s, 2, tN, KN, dt, P.arm.swingMax);
  const aF = spring(s, 3, tF, KF, dt, P.arm.swingMax);
  let tl = 0;
  if (rp.tail >= 0) {
    const flut = I.moving || air || lift > 0.5 ? P.tail.flut * Math.sin(I.rt * P.tail.flutW + I.ph * 6.28) : 0;
    tl = spring(s, 5, P.tail.rest + clamp(Math.abs(fwd) * P.tail.stream, 0, P.tail.max) + flut, P.K.tail, dt, 1.5);
  }
  const dr = spring(s, 6, rp.drop, P.K.drop, dt, 9);
  const raise = spring(s, 8, raiseT, P.K.raise, dt, 1.8);
  const q = TU.belly ? spring(s, 9, 0, P.K.belly, dt, 0.35) : 0;
  const sx = spring(s, 10, shiftT, P.K.shift, dt, 8);
  const reach = PUNCH[s] ? spring(s, 11, 0, P.K.reach, dt, 0.8) : 0;
  // legs
  let lN, lF, bob = 0;
  if (air) { lN = P.legs.fly * Math.sin(now * 13 + I.ph * 6); lF = -P.legs.fly * 0.85 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (rp.legs === 3) { lN = 0; lF = 0; }
  else if (rp.legs === 6) { const w = I.moving ? 0.12 * Math.sin(now * 14 + I.ph * 6) : 0; lN = rp.legNA + w; lF = rp.legFA - w; }
  else if (mv) {
    if (rp.legs === 2) {   // skating: each leg pushes back in turn while the other glides
      const A = P.skate.stride, B = P.skate.back;
      lN = A * Math.max(0, walkS) - B; lF = A * Math.max(0, -walkS) - B; bob = -P.skate.bob * Math.abs(walkS);
    } else {
      const A = rp.legs === 1 ? P.sprint.stride : rp.legs === 5 ? P.waddle.stride : I.run ? P.legs.run : P.legs.walk;
      const B = rp.legs === 1 ? P.sprint.bob : rp.legs === 5 ? P.waddle.bob : P.legs.bob;
      lN = A * walkS; lF = -A * walkS; bob = -B * Math.abs(walkS);
      if (rp.legs === 5) bob = B * Math.abs(walkS) - B;   // the sumo sinks onto each step
    }
  } else {   // standing: the pose's stance (or the biped's small idle spread), a slow sway
    const sw = 0.03 * Math.sin(I.rt * 1.7 + I.ph * 6.28);
    lN = (rp.legNA || P.legs.idle) + sw; lF = (rp.legFA || -P.legs.idle) - sw;
  }
  lN += raise;
  sportPut(J, rp, tor, hd, aN, aF, lN, lF, dr + bob, lift, sx, tl, q, PUNCH[s] & 1 ? reach : 0, PUNCH[s] & 2 ? reach : 0);
  return true;
}
function sportBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.joints, TU = ent.e.rig.tune || NOTUNE, D = SPT.dead;
  let lN, lF, hd, aN, aF, tr, tl, q = 0;
  if (air) {   // tumbling through the air: everything flails
    const k = now * 12 + h01(id, 9) * 6;
    lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); aN = 1.1 * Math.sin(k * 0.8 + 2); aF = -1.1 * Math.sin(k * 0.7 + 1);
    tr = 0.25 * Math.sin(k * 0.7); tl = 0.8 + 0.5 * Math.sin(k * 1.7);
    if (TU.belly) q = 0.12 * Math.sin(k * 1.9);
  } else {
    lN = flop(0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.5) * 1.3, t); aN = flop((h01(id, 4) - 0.6) * 2.6, t); aF = flop((h01(id, 6) - 0.4) * 2.6, t);
    tr = flop((h01(id, 5) - 0.5) * 0.35, t); tl = flop(D.tail[0] + D.tail[1] * h01(id, 7), t);
    if (TU.belly) q = D.belly * flop(1, t);
  }
  sportPut(J, rp, tr, hd, aN, aF, lN, lF, 0, 0, 0, tl, q, 0, 0);
  return true;
}
register('sport', { alive: sportAlive, body: sportBody });
