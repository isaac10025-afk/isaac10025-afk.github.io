// SECRET tab floppy-body drivers (OURS, Part 2 step 7, STEP7.md; contract RIG.md). Owner: SECRET-ART.
// Parts + painting: sprites-secret.js (rest pivots in each entry's rig.J / rig.cfg). The cowboy uses the lead's 'biped'.
//   'sghost'  the ghost: the sheet SHEARS like cloth about the top of its head (the hem lags behind speed changes, trails
//             back while it floats along, flutters), the whole sheet floats up and down and breathes, tilts into its
//             motion, a hit squashes it; the stubby arms wave ("wooo"), shake while it spooks.
//   'sbird'   seagull, crow, phoenix: wings flap about the shoulder (the far wing a beat behind), the body bobs on the
//             beat (up on the downstroke) and pitches into its speed, a hit knocks it; the phoenix's flame tail streams
//             back and swings after the body. Whole poses (dive, peck, stand, egg, hatch) tilt + squash on springs.
//   'sbrute'  yeti, bog monster, baby: a torso that sways, squashes on every heavy step and breathes, a head that lags
//             after it (the baby's is a big wobbly bobble head; the bog monster's googly eyes wobble on top), arms that
//             swing after the body (gorilla), legs on the stride; the baby crawls in diagonal pairs and shakes its rattle
//             sitting. Whole poses (bog under / grab, baby sit) squash + tilt. Dead (yeti only, cfg.limp): limbs splay.
//   'sscare'  the scarecrow: hops on its pole (up and down by the stride, a squash on landing), leans in, the floppy sack
//             head flops after it, the sleeves flap up as it rises and flap hard while it calls crows. Dead: limp.
// No allocation per unit per frame: typed arrays, scratch matrices.
import * as RIG from './rig.js';
const { fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, putIn, inP, putM, put, flop, h01, register, M } = RIG;
export const ready = true;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping], damping ratio c / (2 sqrt k) ~0.15-0.3 (overshoot 2-3 times, TABS). Kicks: rad/s (squash:
// 1/s, bob: px/s). Angles: + = clockwise on screen in the facing-right frame (top leans forward; a back-pointing wing tip
// goes UP; a hanging limb's end goes back).
const BIRD = (o) => Object.assign({
  K: { pitch: [90, 4], bob: [140, 5], tail: [55, 2.4], sq: [220, 7] },
  flap: 0.62, flapW: 10, rest: -0.05, lag: 0.55,        // flap amplitude (rad) about rest, rad/s of the beat, far wing lag
  bob: 0.9,                                             // px the body rises on each downstroke
  pitch: 1 / 900, pitchMax: 0.25, accel: 0.0012,        // nose dips with speed; lags speed changes
  tailFlut: 0.08, tailW: 7, tailStream: 1 / 900, tailAccel: 0.002,
  hit: 1.4, hitPow: 4, hitBob: 25, area: 0.5,
}, o);
export const SEC = {
  ghost: {
    K: { tilt: [70, 3.4], shear: [38, 1.9], squash: [160, 4.6], arm: [60, 2.4] },
    shearV: 1 / 360, shearMax: 0.34, accel: 0.0016,     // hem trails back with speed (shear per px/s), lags acceleration
    flut: 0.05, flutW: 4.6,                             // cloth flutter
    tilt: 1 / 900, tiltMax: 0.14,
    float: 1.4, floatW: 2.6, breathe: 0.03,             // px up / down, rad/s; squash breathing
    wave: 0.38, waveW: 8, idleW: 3,                     // arm wave while it moves (rad, rad/s), slow sway standing
    hit: 1.2, hitPow: 4, atkArm: -7, spookShake: 0.22, spookW: 28, poseSq: -3,
  },
  gull: BIRD({ mid: [0, -7], sh: [1, -8.6], tail: [-4.6, -7.4] }),
  crow: BIRD({ mid: [0, -5.9], sh: [0.84, -7.2], tail: [-3.9, -6.2], flap: 0.7, flapW: 14, bob: 0.7 }),
  phoenix: BIRD({ mid: [0, -14], sh: [2, -16.5], tail: [-8, -13.4], flap: 0.5, flapW: 5.4, lag: 0.7, bob: 1.8, K: { pitch: [60, 3], bob: [90, 3.6], tail: [26, 1.3], sq: [160, 5] }, tailFlut: 0.12, tailW: 4.2, tailStream: 1 / 500, tailAccel: 0.004, pitchMax: 0.2 }),
  yeti: {
    K: { torso: [80, 4.4], head: [110, 3.6], arm: [42, 2.2], squash: [170, 5.2] },
    walkA: 0.34, bob: 1.6, armSwing: 0.26, crawlA: 0, rock: 0.04, leanV: 1 / 900,
    accel: 0.0011, accelHead: 0.0016, accelArm: 0.0034,
    step: 1.4, stepHead: 0.9, stepArm: 1.3, poseSq: -2.5, poseHead: 1.5,
    hit: 0.8, hitPow: 3, hitSq: 2, atkArm: -5, breathe: 0.02, area: 0.6, headFollow: 0.6, legFirst: 1, limp: 1,
  },
  bog: {
    K: { torso: [60, 3.2], head: [60, 2.0], arm: [40, 2.0], squash: [90, 2.6] },
    walkA: 0, bob: 0.8, armSwing: 0.3, crawlA: 0, rock: 0.05, leanV: 1 / 700,
    accel: 0.0014, accelHead: 0.003, accelArm: 0.004,
    step: 2.4, stepHead: 1.6, stepArm: 1.4, poseSq: -4, poseHead: 2.5,
    hit: 1, hitPow: 3, hitSq: 4, atkArm: -6, breathe: 0.035, area: 0.8, headFollow: 0.9, legFirst: 0, limp: 0,
  },
  baby: {
    K: { torso: [70, 3.6], head: [45, 1.5], arm: [55, 2.3], squash: [130, 3.8] },
    walkA: 0.3, bob: 1.8, armSwing: 0, crawlA: 0.36, rock: 0.03, leanV: 1 / 1200,
    accel: 0.001, accelHead: 0.0028, accelArm: 0.002,
    step: 1.6, stepHead: 1.8, stepArm: 0.8, poseSq: -4.5, poseHead: 3,
    hit: 0.7, hitPow: 2.6, hitSq: 3, atkArm: -4, breathe: 0.025, area: 0.6, headFollow: 0.7, legFirst: 0, limp: 0,
    wig: { idle: [0.14, 9], cry: [0.07, 22] }, cryHead: [0.13, 13],   // rattle shake / trembling fists; head shakes crying
  },
  scare: {
    K: { tilt: [75, 3.6], sq: [200, 5.6], head: [40, 1.4], arm: [70, 2.2] },
    hop: 4.5, land: 3.2, leanV: 1 / 800, sway: 0.03, swayW: 1.4,
    accel: 0.0012, accelHead: 0.004, accelArm: 0.004, armHop: 0.45, callFlap: 0.5, callW: 15,
    hit: 1, hitPow: 3.5, atkArm: -5, poseHead: 2, headLoll: 0.06,
  },
};

// ---------------------------------------------------------------- scratch (no allocation per frame)
const NS = 32768;
const STEP = new Int32Array(NS), CODE = new Int32Array(NS);
const mat = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const TB = mat(), TH = mat(), TR = mat();
const putT = (pose, T) => { if (pose >= 0) put(pose, T.a, T.b, T.c, T.d, T.e, T.f); };
/** A whole pose on springs 0 (tilt) and `sq` (squash), about (px, py), lifted by bob. */
function wholeOn(s, pose, px, py, Kt, Ks, sq, area, dt, bob = 0) {
  const tilt = spring(s, 0, 0, Kt, dt, 0.8), q = spring(s, sq, 0, Ks, dt, 0.45);
  squashAbout(px, py, 1 - q * area, 1 + q, tilt); M.f += bob; putM(pose);
}

// ---------------------------------------------------------------- 'sghost'
// rp = { sheet, armB, armF, spook }; rig.J = { top, mid, shB, shF }. Springs: 0 tilt, 1 shear, 2 squash, 3 armB, 4 armF.
function ghostAlive(ent, rp, u, I) {
  const P = SEC.ghost, J = ent.e.rig.J, s = I.slot, now = I.now, ph = I.ph * 6.283;
  if (fresh(s, u, now)) CODE[s] = rp.spook;
  const In = inputs(s, u, now, I.flip), dt = In.dt, fwd = (u.vx || 0) * I.flip;
  if (dt > 0) {
    kick(s, 1, -In.ax * dt * P.accel); kick(s, 0, -In.ax * dt * P.accel * 0.4);
    if (In.hit) { const h = In.hit * (P.hit + P.hitPow * In.hitPow); kick(s, 0, h * 0.5); kick(s, 1, h); kick(s, 2, -(2 + 4 * In.hitPow)); kick(s, 3, h * 2); kick(s, 4, h * 2); }
    if (In.atkStart) { kick(s, 3, P.atkArm); kick(s, 4, P.atkArm); }
    if (rp.spook !== CODE[s]) { kick(s, 2, P.poseSq); kick(s, 3, -4); kick(s, 4, 4); }
  }
  CODE[s] = rp.spook;
  const sh = spring(s, 1, cl(-fwd * P.shearV, -P.shearMax, P.shearMax) + P.flut * Math.sin(I.rt * P.flutW + ph), P.K.shear, dt, 0.6);
  const tilt = spring(s, 0, cl(fwd * P.tilt, -0.06, P.tiltMax), P.K.tilt, dt, 0.6);
  const sq = spring(s, 2, P.breathe * Math.sin(I.rt * P.floatW + ph), P.K.squash, dt, 0.35);
  const wave = I.moving ? P.wave * Math.sin(I.rt * P.waveW + ph) : 0.12 * Math.sin(I.rt * P.idleW + ph);
  const shake = rp.spook ? P.spookShake * Math.sin(I.rt * P.spookW) : 0;
  const aB = spring(s, 3, -wave + shake, P.K.arm, dt, 1.2), aF = spring(s, 4, wave - shake, P.K.arm, dt, 1.2);
  const bob = -P.float * (1 + Math.sin(I.rt * P.floatW + ph));
  // sheet = R(tilt about mid, lifted by bob) · A(shear + squash about the top of the head)
  rotAbout(J.mid[0], J.mid[1], tilt, 0, bob); keep(TR);
  const top = J.top[1];
  M.a = 1; M.b = 0; M.c = sh; M.d = 1 + sq; M.e = -sh * top; M.f = -top * sq;
  inP(TR); keep(TB);
  rotAbout(J.shB[0], J.shB[1], aB); putIn(rp.armB, TB);
  putT(rp.sheet, TB);
  rotAbout(J.shF[0], J.shF[1], aF); putIn(rp.armF, TB);
  return true;
}
register('sghost', { alive: ghostAlive });

// ---------------------------------------------------------------- 'sbird'
// rp = { wingB, tail, body, wingF, main }; rig.cfg = SEC.gull | crow | phoenix (joints mid, sh, tail). Springs: 0 pitch,
// 1 bob (px), 2 tail, 3 squash (whole poses).
function birdAlive(ent, rp, u, I) {
  const P = ent.e.rig.cfg, s = I.slot, now = I.now, ph = I.ph * 6.283;
  if (fresh(s, u, now)) CODE[s] = rp.main;
  const In = inputs(s, u, now, I.flip), dt = In.dt, fwd = (u.vx || 0) * I.flip;
  if (dt > 0) {
    kick(s, 0, -In.ax * dt * P.accel); kick(s, 2, In.ax * dt * P.tailAccel);
    if (In.hit) { const h = In.hit * (P.hit + P.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, P.hitBob * (0.4 + In.hitPow)); kick(s, 2, h * 1.5); kick(s, 3, -(2 + 4 * In.hitPow)); }
    if (rp.main !== CODE[s]) kick(s, 3, -3);
  }
  CODE[s] = rp.main;
  if (rp.main >= 0) { wholeOn(s, rp.main, P.mid[0], P.mid[1], P.K.pitch, P.K.sq, 3, P.area, dt, spring(s, 1, 0, P.K.bob, dt, 8)); return true; }
  const fp = I.rt * P.flapW + ph, air = I.z > 3;
  const pitch = spring(s, 0, cl(fwd * P.pitch, -0.12, P.pitchMax), P.K.pitch, dt, 0.9);
  const bob = spring(s, 1, 0, P.K.bob, dt, 8) + (air ? P.bob * Math.cos(fp) : 0);
  const tl = rp.tail >= 0 ? spring(s, 2, -pitch * 0.6 + P.tailFlut * Math.sin(I.rt * P.tailW + ph) - cl(Math.abs(fwd) * P.tailStream, 0, 0.3), P.K.tail, dt, 1.2) : 0;
  const wF = P.rest + (air ? P.flap * Math.sin(fp) : 0.3), wB = P.rest + (air ? P.flap * 0.88 * Math.sin(fp - P.lag) : 0.25);
  rotAbout(P.mid[0], P.mid[1], pitch, 0, bob); keep(TB);
  rotAbout(P.sh[0], P.sh[1], wB); putIn(rp.wingB, TB);
  if (rp.tail >= 0) { rotAbout(P.tail[0], P.tail[1], tl); putIn(rp.tail, TB); }
  putT(rp.body, TB);
  rotAbout(P.sh[0], P.sh[1], wF); putIn(rp.wingF, TB);
  return true;
}
register('sbird', { alive: birdAlive });

// ---------------------------------------------------------------- 'sbrute'
// rp = { legB, legF, armB, armF, body, head, xtra, lean, crawl, arms, sit, main }; rig.J (rig.J2 while sitting) =
// { pivot, hipB, hipF, shB, shF, neck }; rig.cfg = SEC.yeti | bog | baby. Springs: 0 torso, 1 head, 2 armB, 3 armF,
// 4 squash.
function bruteAlive(ent, rp, u, I) {
  const RG = ent.e.rig, P = RG.cfg, J = rp.sit && RG.J2 ? RG.J2 : RG.J, s = I.slot, now = I.now, st = Math.floor(I.cyc), ph = I.ph * 6.283;
  const code = rp.main >= 0 ? 1000 + rp.main : rp.armF * 64 + rp.head;
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean || 0); STEP[s] = st; CODE[s] = code; }
  const In = inputs(s, u, now, I.flip), dt = In.dt, fwd = (u.vx || 0) * I.flip;
  const walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0;
  if (dt > 0) {
    const ax = -In.ax * dt;
    kick(s, 0, ax * P.accel); kick(s, 1, ax * P.accelHead); kick(s, 2, ax * P.accelArm); kick(s, 3, ax * P.accelArm);
    if (In.hit) { const h = In.hit * (P.hit + P.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, 2 * h); kick(s, 2, 1.5 * h); kick(s, 3, 1.5 * h); kick(s, 4, -(P.hitSq + 4 * In.hitPow)); }
    if (In.atkStart) { kick(s, 3, P.atkArm); kick(s, 0, -1.2); }
    if (I.moving && st !== STEP[s]) { kick(s, 4, -P.step); kick(s, 1, P.stepHead * (st & 1 ? 1 : -1)); kick(s, 2, P.stepArm); kick(s, 3, P.stepArm); }
    if (code !== CODE[s]) { kick(s, 4, P.poseSq); kick(s, 1, P.poseHead); kick(s, 2, -2); kick(s, 3, -2); }
  }
  STEP[s] = st; CODE[s] = code;
  if (rp.main >= 0) { wholeOn(s, rp.main, 0, 0, P.K.torso, P.K.squash, 4, P.area, dt); return true; }
  const tor = spring(s, 0, (rp.lean || 0) + (I.moving ? cl(fwd * P.leanV, -0.05, 0.1) + P.rock * walkS : 0), P.K.torso, dt, 1);
  const sq = spring(s, 4, P.breathe * Math.sin(I.rt * 1.9 + ph), P.K.squash, dt, 0.5);
  let hT = -tor * P.headFollow;
  if (P.cryHead && rp.sit && rp.cry) hT += P.cryHead[0] * Math.sin(I.rt * P.cryHead[1]);
  const hd = spring(s, 1, hT, P.K.head, dt, 1);
  let aBt = 0, aFt = 0;
  if (rp.crawl) { aBt = P.crawlA * walkS; aFt = -P.crawlA * walkS; }
  else if (rp.arms) { aBt = P.armSwing * walkS; aFt = -P.armSwing * walkS; }
  if (rp.wig > 0) aFt += rp.wig * Math.sin(I.rt * rp.wigW + ph);
  const aB = spring(s, 2, aBt, P.K.arm, dt, 1.2), aF = spring(s, 3, aFt, P.K.arm, dt, 1.2);
  let lB = 0, lF = 0, bob = 0;
  if (I.moving) { lB = -P.walkA * walkS; lF = P.walkA * walkS; bob = -P.bob * Math.abs(walkS); }
  else { const sw = 0.03 * Math.sin(I.rt * 1.7 + ph); lB = sw; lF = -sw; }
  const pv = J.pivot;
  squashAbout(pv[0], pv[1], 1 - sq * P.area, 1 + sq, tor); M.f += bob; keep(TB);
  if (rp.legB >= 0) { rotAbout(J.hipB[0], J.hipB[1], lB, 0, bob * 0.4); putM(rp.legB); }
  if (P.legFirst && rp.legF >= 0) { rotAbout(J.hipF[0], J.hipF[1], lF, 0, bob * 0.4); putM(rp.legF); }
  if (rp.armB >= 0) { rotAbout(J.shB[0], J.shB[1], aB); putIn(rp.armB, TB); }
  putT(rp.body, TB);
  if (rp.head >= 0) { rotAbout(J.neck[0], J.neck[1], hd); inP(TB); keep(TH); putT(rp.head, TH); }
  if (rp.armF >= 0) { rotAbout(J.shF[0], J.shF[1], aF); putIn(rp.armF, TB); }
  if (!P.legFirst && rp.legF >= 0) { rotAbout(J.hipF[0], J.hipF[1], lF, 0, bob * 0.4); putM(rp.legF); }
  return true;
}
function bruteBody(ent, rp, id, t, air, now) {
  const RG = ent.e.rig, P = RG.cfg, J = RG.J;
  if (!P.limp || rp.main >= 0) return false;
  let lB, lF, hd, aB, aF, tr;
  if (air) { const k = now * 11 + h01(id, 9) * 6; lB = 0.8 * Math.sin(k); lF = -0.7 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); aB = 0.9 * Math.sin(k * 0.8 + 2); aF = -0.9 * Math.sin(k * 0.7); tr = 0.2 * Math.sin(k * 0.6); }
  else {
    lB = flop(-(0.2 + 0.7 * h01(id, 1)), t); lF = flop(0.25 + 0.7 * h01(id, 2), t); hd = flop((h01(id, 3) - 0.5) * 1.2, t);
    aB = flop(-(0.6 + 1.2 * h01(id, 4)), t); aF = flop(-(0.8 + 1.4 * h01(id, 5)), t); tr = flop((h01(id, 6) - 0.5) * 0.3, t);
  }
  rotAbout(J.pivot[0], J.pivot[1], tr); keep(TB);
  if (rp.legB >= 0) { rotAbout(J.hipB[0], J.hipB[1], lB); putM(rp.legB); }
  if (rp.legF >= 0) { rotAbout(J.hipF[0], J.hipF[1], lF); putM(rp.legF); }
  if (rp.armB >= 0) { rotAbout(J.shB[0], J.shB[1], aB); putIn(rp.armB, TB); }
  putT(rp.body, TB);
  if (rp.head >= 0) { rotAbout(J.neck[0], J.neck[1], hd); putIn(rp.head, TB); }
  if (rp.armF >= 0) { rotAbout(J.shF[0], J.shF[1], aF); putIn(rp.armF, TB); }
  return true;
}
register('sbrute', { alive: bruteAlive, body: bruteBody });

// ---------------------------------------------------------------- 'sscare'
// rp = { pole, armB, body, head, armF, lean, call }; rig.J = { base, hip, neck, shB, shF }. Springs: 0 tilt (about the pole
// foot), 1 squash, 2 head, 3 armB, 4 armF.
function scareAlive(ent, rp, u, I) {
  const P = SEC.scare, J = ent.e.rig.J, s = I.slot, now = I.now, st = Math.floor(I.cyc), ph = I.ph * 6.283;
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); STEP[s] = st; CODE[s] = rp.call; }
  const In = inputs(s, u, now, I.flip), dt = In.dt, fwd = (u.vx || 0) * I.flip;
  const hp = I.moving ? Math.abs(Math.sin(I.cyc * Math.PI)) : 0;
  if (dt > 0) {
    const ax = -In.ax * dt;
    kick(s, 0, ax * P.accel); kick(s, 2, ax * P.accelHead); kick(s, 3, -ax * P.accelArm); kick(s, 4, ax * P.accelArm);
    if (In.hit) { const h = In.hit * (P.hit + P.hitPow * In.hitPow); kick(s, 0, h); kick(s, 2, 2.4 * h); kick(s, 3, -2 * h); kick(s, 4, 2 * h); kick(s, 1, -(2 + 4 * In.hitPow)); }
    if (In.atkStart) { kick(s, 0, 2.5); kick(s, 4, P.atkArm); }
    if (I.moving && st !== STEP[s]) { kick(s, 1, -P.land); kick(s, 2, 1.5); kick(s, 3, 1.5); kick(s, 4, -1.5); }
    if (rp.call !== CODE[s]) kick(s, 2, P.poseHead);
  }
  STEP[s] = st; CODE[s] = rp.call;
  const tilt = spring(s, 0, rp.lean + (I.moving ? cl(fwd * P.leanV, -0.06, 0.12) : P.sway * Math.sin(I.rt * P.swayW + ph)), P.K.tilt, dt, 1);
  const sq = spring(s, 1, 0, P.K.sq, dt, 0.4);
  const hd = spring(s, 2, -tilt * 0.8 + P.headLoll * Math.sin(I.rt * 1.1 + ph), P.K.head, dt, 1.1);
  let up = I.moving ? P.armHop * hp : 0;
  if (rp.call) up = P.callFlap * (0.5 + 0.5 * Math.sin(I.rt * P.callW + ph));
  const aB = spring(s, 3, up, P.K.arm, dt, 1.3), aF = spring(s, 4, -up, P.K.arm, dt, 1.3);
  const lift = -P.hop * hp;
  squashAbout(J.base[0], J.base[1], 1 - sq * 0.5, 1 + sq, tilt); M.f += lift; keep(TB);
  putT(rp.pole, TB);
  rotAbout(J.shB[0], J.shB[1], aB); putIn(rp.armB, TB);
  putT(rp.body, TB);
  rotAbout(J.neck[0], J.neck[1], hd); putIn(rp.head, TB);
  rotAbout(J.shF[0], J.shF[1], aF); putIn(rp.armF, TB);
  return true;
}
function scareBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.J;
  let hd, aB, aF;
  if (air) { const k = now * 12 + h01(id, 9) * 6; hd = 0.6 * Math.sin(k * 1.3); aB = 0.8 * Math.sin(k); aF = -0.8 * Math.sin(k * 0.9); }
  else { hd = flop((h01(id, 3) - 0.3) * 1.4, t); aB = flop(0.5 + 0.8 * h01(id, 4), t); aF = flop(0.6 + 0.8 * h01(id, 5), t); }
  put(rp.pole, 1, 0, 0, 1, 0, 0);
  rotAbout(J.shB[0], J.shB[1], aB); putM(rp.armB);
  put(rp.body, 1, 0, 0, 1, 0, 0);
  rotAbout(J.neck[0], J.neck[1], hd); putM(rp.head);
  rotAbout(J.shF[0], J.shF[1], aF); putM(rp.armF);
  return true;
}
register('sscare', { alive: scareAlive, body: scareBody });
