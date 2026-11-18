// Floppy-body drivers for the mythical units (MYTHICAL). Contract: RIG.md; parts + rest pivots: sprites-myth.js entries.
//   'zombie'  zombie: a shambling biped, head lolling on a soft spring, arms reaching and dragging, the 30 % limpers drag
//             a leg; bodies flop with the head well over.
//   'bones'   skeleton (the necromancer's raised dead): every bone on its own loose spring, the jaw chatters on each step,
//             clacks now and then, drops open to bite; hits send the bones rattling.
//   'robe'    mage, necromancer: the robe rocks on the feet and its hem swishes (a skew, the feet go with it), head on a
//             lagging spring, the mage's hat flops on its own spring, arms + staff swing; casting whips the staff. A lurking
//             (translucent) necromancer floats a pixel off the ground, bobbing.
//   'giant'   giant: a slow heavy biped, footfalls bounce the body, arms swing from pose to pose (the club smash swings
//             through), the club follows the fist (rig.club, read by its drawUnit).
//   'dragon'  dragon: body pitches + bobs, neck and head lag on springs and reach to each pose, three-segment tail swings
//             after the body (a wave when walking, a whip on the tail swipe), wings jiggle folded and flap in flight;
//             dead, its legs kick in the air then go still.
//   'jelly'   slime: squash/stretch + shear springs: it jiggles on landing, on hits, and breathes; the puddle wobbles flat.
// The tree and the barrel use rig.js 'wobble'. No allocation per unit per frame: typed arrays + scratch matrices only.
import * as RIG from './rig.js';
const { clamp, fresh, spring, kick, setAngle, inputs, rotAbout, keep, putIn, inP, putM, put, flop, h01, register, M } = RIG;
export const ready = true;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs are [stiffness, damping]; damping ratio c / (2 sqrt k) about 0.1-0.3, so they overshoot 2-3 times (TABS).
// Kicks are rad/s (or px/s for bob / squash). Angles: + = clockwise on screen (the top leans forward, a hanging limb
// swings back), in the entry's facing-right frame.
export const MY = {
  zombie: {
    K: { torso: [100, 5.5], head: [70, 2.6], arm: [60, 3.2] },   // head 0.16, arms 0.21: lolls and drags
    accel: 0.0011, hit: 3, hitPow: 12, headHit: 2.4, armHit: 1.3,
    bite: { torso: 2.5, head: 3, arm: -4 },                     // an attack starting: lunge, head snaps forward, arms jerk
    hunch: 0.1, rock: 0.07,                                     // walking: hunched forward, rocking with the stride
    loll: 0.06, lollA: 0.07, lollW: 1.3,                        // the head lolls about slowly
    sag: 0.08, armBob: 0.12,                                    // the reaching arms sag and bob with each step
    stride: 0.42, bob: 0.9, step: { head: 2.2, arm: 1.6 },      // shorter steps than a soldier, a heavy footfall
    limp: { drag: 0.25, swing: 0.35, bob: 1.6, kick: 1.8 },     // limpers: far leg drags behind, small swing, deep dip
  },
  bones: {
    K: { torso: [110, 5], skull: [120, 2.2], jaw: [260, 2.6], arm: [55, 1.8] },   // skull 0.1, jaw 0.08, arms 0.12: rattly
    accel: 0.0011, hit: 3, hitPow: 12, skullHit: 3, jawHit: 5, armHit: 2.5,
    step: { skull: 2.6, jaw: 9, arm: 3.2 },                     // every footfall: skull nods, jaw chatters, arms swing
    clack: 0.6, clackKick: 8,                                   // idle: the jaw clacks about every 1.7 s
    bite: { torso: 3, skull: 2.5, jaw: 10 },
    stride: 0.5, bob: 0.8, jawMin: -0.1,
  },
  robe: {
    K: { tilt: [130, 6.5], head: [170, 4.2], arm: [120, 4.5], hat: [60, 1.9], hem: [90, 3] },   // hat 0.12: floppy
    zomHead: [80, 2.8], zomLoll: 0.12,
    accel: 0.0009, hemAccel: 0.0016, hatAccel: 0.003,           // a speed change: robe lags, hem and hat swing behind
    lean: 1 / 800, leanMax: 0.1, rock: 0.05, swish: 0.075,      // walking: leans in, rocks, the hem swishes with the stride
    armSwing: 0.1, bob: 0.8, glide: { lift: -1, a: 0.6, w: 2.2 },   // a lurking necromancer floats
    step: { hat: 1.6, head: 0.8, hem: 0.5 },                    // each step flicks the hem (the feet are painted in it)
    hit: 1.2, hitPow: 4, headHit: 1.6, hatHit: 4, hemHit: 0.3, armHit: 1.5,   // the robe rocks on its feet: small kicks go far
    cast: { arm: 3, hat: 3, pulse: 0.05, pulseW: 7 },           // starting a spell whips the staff; it pulses while casting
    deadArm: [0.15, 0.5],                                       // dead: the staff arm flops a little (it lies along the body)
  },
  giant: {
    K: { torso: [55, 3.6], head: [90, 3.2], farm: [120, 5], barm: [70, 3.2], bob: [80, 3.2],   // slow + heavy
      swingF: [140, 13], swingB: [90, 10] },                   // pose-to-pose arm swings: damping 0.55, one small overshoot
    accel: 0.0006, hit: 1, hitPow: 4, headHit: 2.5, armHit: 1.2, torsoLim: 0.7,   // heavy: a blow rocks it, never folds it
    lean: 1 / 900, leanMax: 0.08, rock: 0.05, stride: 0.38,
    step: { bob: 9, head: 1.5, arm: 0.8 },                      // a footfall drops the body (px/s) and nods the head
    smash: { arm: 6, torso: 1.5 },                              // the club smash follows through
    swingMax: 2.6,                                              // a pose change starts the arm where the old pose had it
  },
  dragon: {
    K: { body: [70, 4], neck: [60, 3], head: [140, 4.2], tail: [[50, 2.4], [38, 2], [28, 1.6]], wing: [90, 3.4],
      stretch: [120, 6], bob: [90, 4], dangle: [40, 2.2] },
    accel: 0.0008, neckAccel: 0.0016, tailAccel: [0.0012, 0.0016, 0.002],
    wag: 0.12, wagLag: 0.9, sway: 0.06, swayW: 1.4, rock: 0.035, legStep: 3.5, legLift: 1.6, bob: 1.2, breathe: 0.4,
    flap: { hz: 2.6, amp: 0.42, bias: 0.12, bob: 1.6, lift: -4, pitch: -0.06 },
    hit: 0.8, hitPow: 3, neckHit: 2.5, tailHit: 2.5, wingHit: 2.5,   // big and heavy: the body barely pitches, neck + tail swing
    bite: { neck: 5, head: 4 }, roar: { head: -6, wing: 4 }, whip: [6, 8, 10], breathW: 9, breathA: 0.05, step: { neck: 1.2, wing: 1.5 },
    kick: { a: 0.35, w: 17, end: 0.7 },                         // dead: legs paddle in the air, still by 0.7 s (stamped at 0.75)
  },
  jelly: {
    Ksq: [[150, 3.4], [210, 4], [300, 4.8], [420, 5.7]], Ksh: [[90, 2.4], [130, 2.9], [180, 3.4], [250, 4]],   // by split size
    breathe: 0.03, breatheW: 2.4, area: 0.7,
    land: { sq: -5, sh: 3 }, hit: { sq: 2, sqPow: 6, sh: 4, shPow: 10 }, atk: -3, pop: 0.2, moveSh: 1 / 900,
    dead: { a: 0.3, decay: 4, w: 15 },
  },
};

// ---------------------------------------------------------------- per-slot memory + scratch (no allocation per frame)
const NS = 32768;
const STEP = new Int32Array(NS);       // last stride count seen (footfall kicks)
const CLK = new Int32Array(NS);        // last idle clack tick (skeleton jaw)
const CODE = new Int16Array(NS);       // last pose code (pose-change kicks + swings)
const DIRF = new Float32Array(NS), DIRB = new Float32Array(NS);   // last front / back arm rest direction (giant)
const HOP = new Float64Array(NS);      // last hop start seen (slime landing)
const T0 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, T1 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, T2 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, T3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const putT = (pose, T) => put(pose, T.a, T.b, T.c, T.d, T.e, T.f);
const airFlail = (now, I, k) => Math.sin(now * 9 + I.ph * 7 + k);

// ---------------------------------------------------------------- 'zombie'
const Z = MY.zombie;
function zombiePut(J, rp, tor, hd, ar, lN, lF, bob) {
  const hy = J.hip[1];
  rotAbout(J.hip[0], hy, tor, 0, bob); const T = keep(T0);
  rotAbout(0, hy, lF, -J.legX, bob * 0.5); putM(rp.leg);
  rotAbout(0, hy, lN, J.legX, bob * 0.5); putM(rp.leg);
  putT(rp.body, T);
  rotAbout(J.neck[0], J.neck[1], hd); putIn(rp.head, T);
  rotAbout(J.shoulder[0], J.shoulder[1], ar); putIn(rp.arm, T);
}
function zombieAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, st = Math.floor(I.cyc);
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); STEP[s] = st; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const limp = u.id % 10 < 3 || (u.maxHp > 0 && u.hp < u.maxHp * 0.5);   // as index.js: 30 % of zombies, or hurt
  if (dt > 0) {
    kick(s, 0, -In.ax * Z.accel * dt);
    if (In.hit) { const h = In.hit * (Z.hit + Z.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, Z.headHit * h); kick(s, 2, Z.armHit * h); }
    if (In.atkStart) { kick(s, 0, Z.bite.torso); kick(s, 1, Z.bite.head); kick(s, 2, Z.bite.arm); }
    if (I.moving && st !== STEP[s]) { const hard = limp && (st & 1) ? Z.limp.kick : 1; kick(s, 1, Z.step.head * hard); kick(s, 2, Z.step.arm * hard); }
  }
  STEP[s] = st;
  const air = I.z > 1, walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0;
  const tor = spring(s, 0, rp.lean + (I.moving ? Z.hunch + Z.rock * walkS : 0), Z.K.torso, dt, 1);
  const hd = spring(s, 1, Z.loll + Z.lollA * Math.sin(I.rt * Z.lollW + I.ph * 6.28), Z.K.head, dt, 1);
  const ar = spring(s, 2, air ? 0.5 * airFlail(now, I, 0) : Z.sag + (I.moving ? Z.armBob * Math.abs(walkS) : 0), Z.K.arm, dt, 1.3);
  let lN, lF, bob = 0;
  if (air) { lN = 0.95 * Math.sin(now * 13 + I.ph * 6); lF = -0.8 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (I.moving) {
    lN = Z.stride * walkS; lF = -Z.stride * walkS; bob = -Z.bob * Math.abs(walkS);
    if (limp) { lF = Z.limp.drag + Z.limp.swing * lF; bob = -Z.limp.bob * Math.max(0, walkS); }
  } else { const sw = 0.03 * Math.sin(I.rt * 1.7 + I.ph * 6.28); lN = 0.09 + sw; lF = -0.09 - sw; }
  zombiePut(J, rp, tor, hd, ar, lN, lF, bob);
  return true;
}
function zombieBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.joints;
  let lN, lF, hd, ar, tr;
  if (air) { const k = now * 12 + h01(id, 9) * 6; lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.6 * Math.sin(k * 1.3); ar = 0.9 * Math.sin(k * 0.8 + 2); tr = 0.25 * Math.sin(k * 0.7); }
  else {
    lN = flop(0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.3) * 1.6, t); ar = flop((h01(id, 4) - 0.6) * 2.6, t); tr = flop((h01(id, 5) - 0.5) * 0.35, t);
  }
  zombiePut(J, rp, tr, hd, ar, lN, lF, 0);
  return true;
}
register('zombie', { alive: zombieAlive, body: zombieBody });

// ---------------------------------------------------------------- 'bones'
// Springs: 0 torso, 1 skull, 2 jaw, 3 far arm, 4 near arm.
const B = MY.bones;
function bonesAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, st = Math.floor(I.cyc), ck = Math.floor(I.rt * B.clack + I.ph * 3);
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); STEP[s] = st; CLK[s] = ck; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    kick(s, 0, -In.ax * B.accel * dt);
    if (In.hit) { const h = In.hit * (B.hit + B.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, B.skullHit * h); kick(s, 2, B.jawHit * Math.abs(h)); kick(s, 3, B.armHit * h); kick(s, 4, -B.armHit * h); }
    if (In.atkStart) { kick(s, 0, B.bite.torso); kick(s, 1, B.bite.skull); kick(s, 2, B.bite.jaw); }
    if (I.moving && st !== STEP[s]) { const sg = st & 1 ? 1 : -1; kick(s, 1, B.step.skull * sg); kick(s, 2, B.step.jaw); kick(s, 3, B.step.arm * sg); kick(s, 4, -B.step.arm * sg); }
    if (!I.moving && ck !== CLK[s]) kick(s, 2, B.clackKick);
  }
  STEP[s] = st; CLK[s] = ck;
  const air = I.z > 1, walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0;
  const tor = spring(s, 0, rp.lean + (I.moving ? 0.05 + 0.04 * walkS : 0), B.K.torso, dt, 1);
  const sk = spring(s, 1, 0, B.K.skull, dt, 0.9);
  const jw = Math.max(B.jawMin, spring(s, 2, rp.open, B.K.jaw, dt, 0.8));
  const fa = spring(s, 3, air ? 0.7 * airFlail(now, I, 0) : 0, B.K.arm, dt, 1.4);
  const na = spring(s, 4, air ? -0.7 * airFlail(now, I, 2) : 0, B.K.arm, dt, 1.4);
  let lN, lF, bob = 0;
  if (air) { lN = 0.95 * Math.sin(now * 13 + I.ph * 6); lF = -0.8 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (I.moving) { lN = B.stride * walkS; lF = -B.stride * walkS; bob = -B.bob * Math.abs(walkS); }
  else { lN = 0; lF = 0; }
  const hy = J.hip[1];
  rotAbout(J.hip[0], hy, tor, 0, bob); const T = keep(T0);
  rotAbout(0, hy, lF + J.legRest[0], -J.legX, bob * 0.5); putM(rp.leg);
  rotAbout(0, hy, lN + J.legRest[1], J.legX, bob * 0.5); putM(rp.leg);
  rotAbout(J.shF[0], J.shF[1], fa); putIn(rp.farm, T);
  putT(rp.body, T);
  rotAbout(J.neck[0], J.neck[1], sk); inP(T); const K = keep(T1); putM(rp.skull);
  rotAbout(J.hinge[0], J.hinge[1], jw); putIn(rp.jaw, K);
  rotAbout(J.shN[0], J.shN[1], na); putIn(rp.arm, T);
  return true;
}
register('bones', { alive: bonesAlive });   // skeletons leave a dust puff, no body (OG)

// ---------------------------------------------------------------- 'robe'
// Springs: 0 robe tilt (about the feet), 1 head, 2 arms + staff, 3 hat, 4 hem swish (a skew of the robe below its top).
// The feet are painted in the robe part (one part fewer each: draw cost).
const RB = MY.robe;
function robePut(rg, rp, tilt, hem, hd, ar, hat, bob) {
  const J = rg.joints;
  rotAbout(0, 0, tilt, 0, bob); const T = keep(T0);
  const k = hem, kt = -k * J.top;   // robe (+ feet) = T · skew (x += k (y - top)): the hem and feet swing, the shoulders stay
  put(rp.robe, T.a, T.b, T.a * k + T.c, T.b * k + T.d, T.a * kt + T.e, T.b * kt + T.f);
  if (rg.armsFirst) { rotAbout(J.shoulder[0], J.shoulder[1], ar); putIn(rp.arms, T); }
  else if (rp.back >= 0) { rotAbout(J.shoulder[0], J.shoulder[1], ar); putIn(rp.back, T); }
  rotAbout(J.neck[0], J.neck[1], hd); inP(T); const H = keep(T1); putM(rp.head);
  if (rp.hat >= 0 && J.hat) { rotAbout(J.hat[0], J.hat[1], hat); putIn(rp.hat, H); }
  if (!rg.armsFirst) { rotAbout(J.shoulder[0], J.shoulder[1], ar); putIn(rp.arms, T); }
}
function robeAlive(ent, rp, u, I) {
  const rg = ent.e.rig, s = I.slot, now = I.now, st = Math.floor(I.cyc);
  if (fresh(s, u, now)) { STEP[s] = st; CODE[s] = rp.cast; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * RB.accel); kick(s, 4, a * RB.hemAccel); kick(s, 3, -a * RB.hatAccel);
    if (In.hit) { const h = In.hit * (RB.hit + RB.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, RB.headHit * h); kick(s, 3, RB.hatHit * h); kick(s, 4, -RB.hemHit * h); kick(s, 2, RB.armHit * h); }
    if (rp.cast && !CODE[s]) { kick(s, 2, RB.cast.arm); kick(s, 3, -RB.cast.hat); }
    if (I.moving && st !== STEP[s]) { kick(s, 3, RB.step.hat * (st & 1 ? 1 : -1)); kick(s, 1, RB.step.head); kick(s, 4, RB.step.hem * (st & 1 ? 1 : -1)); }
  }
  STEP[s] = st; CODE[s] = rp.cast;
  const walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0, fwd = (u.vx || 0) * I.flip;
  const tilt = spring(s, 0, I.moving ? clamp(fwd * RB.lean, -RB.leanMax * 0.5, RB.leanMax) + RB.rock * walkS : 0, RB.K.tilt, dt, 0.8);
  const hem = spring(s, 4, I.moving ? RB.swish * walkS : 0, RB.K.hem, dt, 0.35);
  const hd = rp.zom ? spring(s, 1, RB.zomLoll + 0.06 * Math.sin(I.rt * 1.3 + I.ph * 6.28), RB.zomHead, dt, 1) : spring(s, 1, 0, RB.K.head, dt, 0.8);
  const ar = spring(s, 2, I.moving ? RB.armSwing * walkS : rp.cast ? RB.cast.pulse * Math.sin(I.rt * RB.cast.pulseW + I.ph * 6.28) : 0, RB.K.arm, dt, 1);
  const hat = spring(s, 3, 0, RB.K.hat, dt, 0.6);
  // a translucent (lurking) necromancer floats a pixel off the ground, bobbing slowly
  const glide = ent.e.alpha ? ent.e.alpha(u) < 1 : false;
  robePut(rg, rp, tilt, hem, hd, ar, hat, glide ? RB.glide.lift + RB.glide.a * Math.sin(I.rt * RB.glide.w + I.ph * 6.28) : -RB.bob * Math.abs(walkS));
  return true;
}
function robeBody(ent, rp, id, t, air, now) {
  const rg = ent.e.rig;
  if (air) { const k = now * 12 + h01(id, 9) * 6; robePut(rg, rp, 0, 0.15 * Math.sin(k), 0.5 * Math.sin(k * 1.3), 0.9 * Math.sin(k * 0.8 + 2), 0.6 * Math.sin(k * 1.1), 0); return true; }
  const hat = flop((h01(id, 6) < 0.5 ? -1 : 1) * (0.5 + 0.8 * h01(id, 7)), t);   // the hat tips off
  robePut(rg, rp, 0, flop((h01(id, 1) - 0.5) * 0.3, t), flop((h01(id, 3) - 0.4) * 1.1, t), flop(-(RB.deadArm[0] + RB.deadArm[1] * h01(id, 4)), t), hat, 0);
  return true;
}
register('robe', { alive: robeAlive, body: robeBody });

// ---------------------------------------------------------------- 'giant'
// Springs: 0 torso (about the hip), 1 head, 2 front arm (the club's), 3 back arm, 4 bob (px, + = down), 5 / 6 the front /
// back arm's pose-to-pose swing (a new pose starts each arm where the old one held it; well damped, so it lands).
const G = MY.giant;
function giantPut(rg, rp, tor, bob, hd, fa, ba, lN, lF, u, now) {
  const J = rg.joints, hy = J.hip[1];
  rotAbout(J.hip[0], hy, tor, 0, bob); const T = keep(T0);
  if (!rp.over) { rotAbout(J.shB[0], J.shB[1], ba + rp.brot); putIn(rp.barm, T); }
  rotAbout(0, hy, lF, -J.legX, 0); putM(rp.leg);
  if (rp.legUp >= 0) put(rp.legUp, 1, 0, 0, 1, 0, 0);
  else { rotAbout(0, hy, lN, J.legX, 0); putM(rp.leg); }
  putT(rp.body, T);
  rotAbout(J.neck[0], J.neck[1], hd); putIn(rp.head, T);
  if (rp.over) { rotAbout(J.shB[0], J.shB[1], ba + rp.brot); putIn(rp.barm, T); }
  rotAbout(J.shF[0], J.shF[1], fa); inP(T);
  if (u) {   // the club's fist for drawUnit (next frame): [id, now, matrix]
    const C = rg.club, o = (u.id & (rg.clubN - 1)) * 8;
    C[o] = u.id; C[o + 1] = now; C[o + 2] = M.a; C[o + 3] = M.b; C[o + 4] = M.c; C[o + 5] = M.d; C[o + 6] = M.e; C[o + 7] = M.f;
  }
  putM(rp.farm);
  if (rp.sw >= 0) putT(rp.sw, T);
  if (rp.crack >= 0) put(rp.crack, 1, 0, 0, 1, 0, 1.2);
}
function giantAlive(ent, rp, u, I) {
  const rg = ent.e.rig, s = I.slot, now = I.now, st = Math.floor(I.cyc);
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); setAngle(s, 4, rp.bob); STEP[s] = st; CODE[s] = rp.code; DIRF[s] = rp.fdir; DIRB[s] = rp.bdir; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (CODE[s] !== rp.code) {   // new pose: each arm starts where the old pose held it and swings over (overshooting)
    const o2 = (s * RIG.NSPR + 5) * 2, o3 = (s * RIG.NSPR + 6) * 2;
    RIG.BANK[o2] = clamp(RIG.BANK[o2] + wrapA(DIRF[s] - rp.fdir), -G.swingMax, G.swingMax);
    RIG.BANK[o3] = clamp(RIG.BANK[o3] + wrapA(DIRB[s] - rp.bdir), -G.swingMax, G.swingMax);
    CODE[s] = rp.code; DIRF[s] = rp.fdir; DIRB[s] = rp.bdir;
  }
  if (dt > 0) {
    kick(s, 0, -In.ax * G.accel * dt);
    if (In.hit) { const h = In.hit * (G.hit + G.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, G.headHit * h); kick(s, 2, G.armHit * h); kick(s, 3, G.armHit * h); }
    if (In.atkStart && rp.atk) { kick(s, 2, G.smash.arm); kick(s, 0, G.smash.torso); }
    if (I.moving && st !== STEP[s]) { kick(s, 4, G.step.bob); kick(s, 1, G.step.head); kick(s, 2, G.step.arm); kick(s, 3, -G.step.arm); }
  }
  STEP[s] = st;
  const air = I.z > 1, walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0, fwd = (u.vx || 0) * I.flip;
  const tor = spring(s, 0, rp.lean + (I.moving ? clamp(fwd * G.lean, -0.04, G.leanMax) + G.rock * walkS : 0), G.K.torso, dt, G.torsoLim);
  const bob = spring(s, 4, rp.bob, G.K.bob, dt, 4);
  const hd = spring(s, 1, 0, G.K.head, dt, 0.7);
  const fa = spring(s, 2, air ? 0.6 * airFlail(now, I, 0) : 0, G.K.farm, dt, 1.2) + spring(s, 5, 0, G.K.swingF, dt, 3);
  const ba = spring(s, 3, air ? -0.6 * airFlail(now, I, 1) : I.moving && !rp.over ? -1.2 * G.stride * walkS : 0, G.K.barm, dt, 1.2) + spring(s, 6, 0, G.K.swingB, dt, 3);
  let lN = rp.legN, lF = rp.legF;
  if (air) { lN += 0.8 * Math.sin(now * 9 + I.ph * 6); lF -= 0.7 * Math.sin(now * 8 + I.ph * 9 + 1); }
  else if (I.moving) { lN += G.stride * walkS; lF -= G.stride * walkS; }
  giantPut(rg, rp, tor, bob, hd, fa, ba, lN, lF, u, now);
  return true;
}
function giantBody(ent, rp, id, t, air, now) {
  const rg = ent.e.rig;
  if (air) { const k = now * 10 + h01(id, 9) * 6; giantPut(rg, rp, 0.2 * Math.sin(k * 0.7), 0, 0.5 * Math.sin(k * 1.3), 0.9 * Math.sin(k * 0.8 + 2), -0.8 * Math.sin(k), rp.legN + 0.8 * Math.sin(k), rp.legF - 0.7 * Math.sin(k * 0.9 + 1), null, now); return true; }
  giantPut(rg, rp, flop((h01(id, 5) - 0.5) * 0.25, t), 0, flop((h01(id, 3) - 0.4) * 1.2, t), flop((h01(id, 4) - 0.5) * 2.2, t), flop((h01(id, 6) - 0.5) * 2, t),
    rp.legN + flop(0.2 + 0.6 * h01(id, 1), t), rp.legF + flop(-(0.1 + 0.6 * h01(id, 2)), t), null, now);
  return true;
}
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
register('giant', { alive: giantAlive, body: giantBody });

// ---------------------------------------------------------------- 'dragon'
// Springs: 0 body pitch, 1 neck turn (target: the pose's), 2 head turn, 3-5 tail joints, 6 back wing, 7 front wing,
// 8 neck stretch, 9 bob (px), 10 tucked legs dangling.
const D = MY.dragon;
function dragonPut(rg, rp, pitch, bob, nA, nS, hR, t0, t1, t2, wB, wF, legs) {
  const J = rg.joints;
  rotAbout(J.body[0], J.body[1], pitch, 0, bob); const T = keep(T0);
  rotAbout(J.wingB[0], J.wingB[1], wB); putIn(rp.wingB, T);
  const P = J.tail;   // the tail chain: each segment turns about its joint inside its parent
  rotAbout(P[0][0], P[0][1], t0); inP(T); const S0 = keep(T1);
  rotAbout(P[1][0], P[1][1], t1); inP(S0); const S1 = keep(T2);
  rotAbout(P[2][0], P[2][1], t2); inP(S1); const S2 = keep(T3);
  putT(rp.tk0, S0); putT(rp.tk1, S1); putT(rp.tk2, S2); putT(rp.t0, S0); putT(rp.t1, S1); putT(rp.t2, S2);
  if (rp.sw >= 0) putT(rp.sw, T);
  legs(true);
  putT(rp.body, T);
  legs(false);
  // neck: the idle neck turned by nA and stretched by (1 + nS) along itself, about its base
  const Bx = J.neck[0], By = J.neck[1], H = J.head;
  const th0 = NECK0.th, c0 = NECK0.c, s0 = NECK0.s, c1 = Math.cos(th0 + nA), s1 = Math.sin(th0 + nA), sc = 1 + nS;
  const a = sc * c1 * c0 + s1 * s0, c = sc * c1 * s0 - s1 * c0, b = sc * s1 * c0 - c1 * s0, d = sc * s1 * s0 + c1 * c0;
  M.a = a; M.b = b; M.c = c; M.d = d; M.e = Bx - (a * Bx + c * By); M.f = By - (b * Bx + d * By);
  putIn(rp.neck, T);
  const hx = H[0] - Bx, hy = H[1] - By, Hx = Bx + a * hx + c * hy, Hy = By + b * hx + d * hy;
  rotAbout(H[0], H[1], hR, Hx - H[0], Hy - H[1]); putIn(rp.head, T);
  rotAbout(J.wingF[0], J.wingF[1], wF); putIn(rp.wingF, T);
}
const NECK0 = { th: 0, c: 1, s: 0, ok: false };
function neck0(J) { if (NECK0.ok) return; const E = [J.head[0] - 2.6, J.head[1] + 2]; NECK0.th = Math.atan2(E[1] - J.neck[1], E[0] - J.neck[0]); NECK0.c = Math.cos(NECK0.th); NECK0.s = Math.sin(NECK0.th); NECK0.ok = true; }
// legs: called before (back leg) and after (front leg) the body; reads LEGS (set per frame)
const LEGS = { fly: 0, xB: 0, yB: 0, xF: 0, yF: 0, dangle: 0, leg: -1, legT: -1, T: T0 };
function dragonLegs(back) {
  const L = LEGS;
  if (L.fly) {   // tucked under the body, dangling
    const x = back ? -9 : 5, y = back ? 0 : -0.2;
    rotAbout(0, -12, L.dangle * (back ? 1 : 0.8), x, y); putIn(L.legT, L.T);
  } else put(L.leg, 1, 0, 0, 1, back ? L.xB : L.xF, back ? L.yB : L.yF);
}
function dragonAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg.joints, s = I.slot, now = I.now, st = Math.floor(I.cyc);
  neck0(J);
  if (fresh(s, u, now)) { setAngle(s, 1, rp.nA); setAngle(s, 2, rp.hR); setAngle(s, 8, rp.nS); setAngle(s, 9, rp.fly ? D.flap.lift : 0); STEP[s] = st; CODE[s] = rp.code; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 1, -a * D.neckAccel);
    kick(s, 3, a * D.tailAccel[0]); kick(s, 4, a * D.tailAccel[1]); kick(s, 5, a * D.tailAccel[2]);
    if (In.hit) { const h = In.hit * (D.hit + D.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, D.neckHit * h); kick(s, 2, h); kick(s, 3, -D.tailHit * h); kick(s, 4, -D.tailHit * h); kick(s, 6, D.wingHit * h); kick(s, 7, D.wingHit * h); }
    if (CODE[s] !== rp.code) {   // entering a pose: bite lunge, roar throws the head back + wings open, tail whips
      if (rp.jaws === 1) { kick(s, 1, D.bite.neck); kick(s, 2, D.bite.head); }
      if (rp.code === 5) { kick(s, 2, D.roar.head); kick(s, 6, D.roar.wing); kick(s, 7, D.roar.wing); }
      if (rp.tail) { kick(s, 3, D.whip[0]); kick(s, 4, D.whip[1]); kick(s, 5, D.whip[2]); }
    }
    if (I.moving && !rp.fly && st !== STEP[s]) { kick(s, 1, D.step.neck); kick(s, 6, D.step.wing); kick(s, 7, -D.step.wing); }
  }
  CODE[s] = rp.code; STEP[s] = st;
  const walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0, walkC = I.moving ? Math.cos(I.cyc * Math.PI) : 0;
  const ph = I.ph * 6.28, F = D.flap, fl = rp.fly ? 2 * Math.PI * F.hz * I.rt + ph : 0;
  const pitch = spring(s, 0, rp.fly ? F.pitch : I.moving ? D.rock * walkS : 0, D.K.body, dt, 0.6);
  const bob = spring(s, 9, rp.fly ? F.lift : 0, D.K.bob, dt, 8) + (rp.fly ? F.bob * Math.cos(fl) : I.moving ? -D.bob * Math.abs(walkS) : D.breathe * Math.sin(I.rt * 2 + ph));
  const nA = spring(s, 1, rp.nA + (I.moving && !rp.fly ? 0.05 * walkS : 0), D.K.neck, dt, 1.4);
  const nS = spring(s, 8, rp.nS, D.K.stretch, dt, 0.8);
  const hR = spring(s, 2, rp.hR + (rp.code === 4 ? D.breathA * Math.sin(I.rt * D.breathW + ph) : 0), D.K.head, dt, 1.2);
  let w0 = 0, w1 = 0, w2 = 0;   // tail: a wave travelling down it while walking, a slow sway standing
  if (I.moving) { const k = I.cyc * Math.PI; w0 = D.wag * Math.sin(k); w1 = D.wag * Math.sin(k - D.wagLag); w2 = D.wag * Math.sin(k - 2 * D.wagLag); }
  else { const k = I.rt * D.swayW + ph; w0 = D.sway * Math.sin(k); w1 = D.sway * Math.sin(k - 0.8); w2 = D.sway * Math.sin(k - 1.6); }
  const t0 = spring(s, 3, rp.tA0 + w0, D.K.tail[0], dt, 1.4), t1 = spring(s, 4, rp.tA1 + w1, D.K.tail[1], dt, 1.2), t2 = spring(s, 5, rp.tA2 + w2, D.K.tail[2], dt, 1.2);
  const flap = rp.fly ? F.bias + F.amp * Math.sin(fl) : 0;
  const wB = spring(s, 6, 0, D.K.wing, dt, 0.7) + flap, wF = spring(s, 7, 0, D.K.wing, dt, 0.7) + (rp.fly ? F.bias + F.amp * Math.sin(fl + 0.15) : 0);
  const L = LEGS;
  L.fly = rp.fly; L.leg = rp.leg; L.legT = rp.legT; L.T = T0;
  L.dangle = spring(s, 10, rp.fly ? 0.25 * Math.sin(fl - 1) : 0, D.K.dangle, dt, 0.8);
  if (!rp.fly) {
    const ls = J.legs.stand;
    L.xB = ls[0][0] - D.legStep * walkS - 0; L.yB = ls[0][1] + 5.6 - D.legLift * Math.max(0, -walkC);
    L.xF = ls[1][0] + D.legStep * walkS; L.yF = ls[1][1] + 5.6 - D.legLift * Math.max(0, walkC);
  }
  dragonPut(rg, rp, pitch, bob, nA, nS, hR, t0, t1, t2, wB, wF, dragonLegs);
  return true;
}
// dead: belly up (the dead frame's pieces); legs paddle in the air and go still, tail / neck / head flop
const dsw = (air, now, id, k, a) => (air ? a * Math.sin(now * 11 + k * 1.7 + h01(id, k) * 6) : 0);   // flailing while it flies
function dragonBody(ent, rp, id, t, air, now) {
  const DJ = ent.e.rig.joints.dead, K = D.kick;
  const tw = air ? 1 : Math.exp(-4 * t) * Math.max(0, 1 - t / K.end);
  rotAbout(DJ.wing[0], DJ.wing[1], flop((h01(id, 1) - 0.5) * 0.25, t) + dsw(air, now, id, 1, 0.3)); putM(rp.wingF);
  const P = DJ.tail;
  rotAbout(P[0][0], P[0][1], flop((h01(id, 2) - 0.5) * 0.3, t) + dsw(air, now, id, 2, 0.3)); const S0 = keep(T1);
  rotAbout(P[1][0], P[1][1], flop((h01(id, 3) - 0.5) * 0.4, t) + dsw(air, now, id, 3, 0.4)); inP(S0); const S1 = keep(T2);
  rotAbout(P[2][0], P[2][1], flop((h01(id, 4) - 0.5) * 0.5, t) + dsw(air, now, id, 4, 0.5)); inP(S1); const S2 = keep(T3);
  putT(rp.tk0, S0); putT(rp.tk1, S1); putT(rp.tk2, S2); putT(rp.t0, S0); putT(rp.t1, S1); putT(rp.t2, S2);
  for (let i = 0; i < 4; i++) {
    const L = DJ.legs[i], a = L[1] + K.a * tw * Math.sin(now * K.w + i * 1.9 + h01(id, 10 + i) * 3);
    rotAbout(0, -12, a, L[0], 0); putM(rp.leg);
  }
  put(rp.body, 1, 0, 0, 1, 0, 0);
  rotAbout(DJ.neck[0], DJ.neck[1], flop((h01(id, 5) - 0.5) * 0.3, t) + dsw(air, now, id, 5, 0.3)); const N = keep(T0); putM(rp.neck);
  rotAbout(DJ.head[0], DJ.head[1], flop((h01(id, 6) - 0.3) * 0.5, t) + dsw(air, now, id, 6, 0.5)); putIn(rp.head, N);
  return true;
}
register('dragon', { alive: dragonAlive, body: dragonBody });

// ---------------------------------------------------------------- 'jelly'
// Springs: 0 squash (y scale - 1; x the other way), 1 shear (the top's forward lean, x += -sh y). Split pieces are
// smaller and stiffer (rp.k = split index).
const JL = MY.jelly;
function jellyPut(main, sq, sh) {
  const sx = 1 - JL.area * sq, sy = 1 + sq;
  put(main, sx, 0, -sh * sy, sy, 0, 0);
}
function jellyAlive(ent, rp, u, I) {
  const s = I.slot, now = I.now, k = rp.k > 0 && rp.k <= 3 ? rp.k : 0, b = u.b;
  if (fresh(s, u, now)) { setAngle(s, 0, JL.pop); HOP[s] = b && b.hopStart !== undefined ? b.hopStart : -1; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const hs = b && b.hopStart !== undefined ? b.hopStart : -1;
  if (hs !== HOP[s]) {   // a hop happened since we last drew it on the ground: it just landed
    if (hs > 0 && now - hs >= 0.3 && now - hs < 0.7) { kick(s, 0, JL.land.sq); kick(s, 1, JL.land.sh); }
    HOP[s] = hs;
  }
  if (dt > 0) {
    if (In.hit) { kick(s, 0, -(JL.hit.sq + JL.hit.sqPow * In.hitPow)); kick(s, 1, In.hit * (JL.hit.sh + JL.hit.shPow * In.hitPow)); }
    if (In.atkStart) kick(s, 0, JL.atk);
    kick(s, 1, In.ax * dt * 0.002);
  }
  const fwd = (u.vx || 0) * I.flip;
  const sq = spring(s, 0, JL.breathe * Math.sin(I.rt * JL.breatheW + I.ph * 6.28), JL.Ksq[k], dt, 0.45);
  const sh = spring(s, 1, clamp(fwd * JL.moveSh, -0.08, 0.08), JL.Ksh[k], dt, 0.4);
  jellyPut(rp.main, sq, sh);
  return true;
}
function jellyBody(ent, rp, id, t, air, now) {   // the puddle wobbles flat
  const e = JL.dead, sq = e.a * Math.exp(-e.decay * t) * Math.cos(e.w * t) * Math.max(0, 1 - t / 0.7);
  jellyPut(rp.main, sq, 0.4 * sq * (h01(id, 1) - 0.5));
  return true;
}
register('jelly', { alive: jellyAlive, body: jellyBody });
