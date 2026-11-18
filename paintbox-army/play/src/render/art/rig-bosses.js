// BOSSES tab floppy-body drivers (OURS, Part 2 step 6, STEP6.md; contract RIG.md). Owner: BOSSES-ART.
// Parts + painting: sprites-bosses.js. The painter paints every whole pose of the rigged bosses through the same emit()
// functions the drivers run every frame (with the pose's rest numbers), so whole sprites and floppy parts always agree.
//   'gmech'   giant mech: heavy legs step about the hips (feet planted: the leg squashes as the body dips), every footfall
//             drops the body and it bounces, the torso pitches + lags speed changes, the cockpit head nods after it, the
//             arms swing like pendulums, pods pop open with a kick, the laser leans it back, the stomp lifts the near leg
//             and slams it (big bounce), dying = shakes + slumps. Dead: the painted scrap heap (no body()).
//   'golem'   lava golem: stubby rock legs, the boulder torso sways, the huge arms swing after it with lag (gorilla), the
//             little head bobs, punch throws the near arm forward, throw lifts both arms overhead with the lava blob.
//             Dead: it falls apart into a heap of rocks (body()).
//   'kslime'  king slime / big slime / slimelet: squash + stretch + shear springs (stretched in the hop, splat on landing),
//             the dark shapes of swallowed units (b.inside) slosh about inside after the body. Dead: the puddle wobbles.
// Plus helpers for the bosses that draw themselves (kraken, hydra, worm: sprites-bosses.js drawUnit): an extra spring bank
// (48 springs a boss) and a walked-distance tracker.
// No allocation per unit per frame: typed arrays, scratch matrices, fixed-shape pose objects.
import * as RIG from './rig.js';
const { fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, flop, h01, register, M, OUT } = RIG;
export const ready = true;
const PI = Math.PI;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping] with damping ratio ~0.2-0.3 (overshoot 2-3 times). Kicks in rad/s (bob: px/s).
// Angles: + = clockwise on screen in the facing-right frame (torso nose down, an arm swung back, a foot back).
export const GM = {   // giant mech
  K: { pitch: [60, 3.6], bob: [90, 4.2], head: [110, 3.6], arm: [55, 2.6], pod: [140, 4.5], leg: [160, 6], shake: [900, 12] },
  walkA: 0.34, walkV: 30, bob: 2.4, rock: 0.04, armSwing: 0.22, breathe: 0.35,
  step: 55, stepHead: 0.7, stepArm: 0.9,                     // every footfall: body drops (px/s), head nods, arms jolt
  accel: 0.0007, accelHead: 0.0012, accelArm: 0.002,
  hit: 0.5, hitPow: 1.6, hitBob: 12,
  podKick: -3, laserPitch: -0.12, laserKick: -1.2,
  stomp: { up: 0.6, lift: -1.05, fold: 0.3, slam: 140, head: 2.5, arm: 2 },   // s raised; leg angle; shorten; bounce
  dying: { shake: 1.4, slump: 0.16, arm: 0.9 },
};
export const GL = {   // lava golem
  K: { pitch: [80, 4.2], bob: [120, 5], head: [130, 4], arm: [42, 2.2], leg: [160, 6] },
  walkA: 0.42, walkV: 32, bob: 1.8, rock: 0.07, armSwing: 0.32, armLag: 0.6, breathe: 0.3,
  step: 30, stepHead: 0.8, stepArm: 1.1,
  accel: 0.0009, accelHead: 0.0015, accelArm: 0.0035,
  hit: 0.9, hitPow: 3, hitBob: 16,
  punch: { kick: -9, torso: 0.9 }, throwKick: -4,
  dead: { t: 0.6 },
};
export const SL = {   // slimes (by size: 0 king, 1 big, 2 slimelet)
  Ksq: [[120, 3.1], [170, 3.7], [300, 4.8]], Ksh: [[70, 2.1], [100, 2.5], [180, 3.4]], Kin: [60, 2.4],
  area: 0.7, breathe: 0.035, breatheW: 1.9,
  hop: 0.2, land: -0.28, landKick: -5, hopKick: 4, hit: 2, hitPow: 5, sh: 3.5, shPow: 8, atk: -2.5, moveSh: 1 / 1100,
  inSlosh: 0.9, inHit: 9, inLand: 7,
  dead: { a: 0.3, decay: 4, w: 13 },
};

// ---------------------------------------------------------------- shared emit helpers
const mat = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const TB = mat(), TA = mat();
let PUT = RIG.put;
const ok = (p) => p !== -1 && p !== null && p !== undefined;
const out = (p, T) => { if (ok(p)) PUT(p, T.a, T.b, T.c, T.d, T.e, T.f); };
/** M inside parent T, out. */
const outIn = (p, T) => { if (ok(p)) PUT(p, T.a * M.a + T.c * M.b, T.b * M.a + T.d * M.b, T.a * M.c + T.c * M.d, T.b * M.c + T.d * M.d, T.a * M.e + T.c * M.f + T.e, T.b * M.e + T.d * M.f + T.f); };
/** emit into another sink (the painter): fn(part, a, b, c, d, e, f). */
export function emitWith(emit, J, rp, P, fn) { const old = PUT; PUT = fn; try { emit(J, rp, P); } finally { PUT = old; } }
/** a leg about its hip, the hip carried by the torso TB, the foot kept down (squash comp) unless P.comp is 0. */
function leg(pi, hx, hy, L, ang, s, comp, gb) {
  if (!ok(pi)) return;
  const Hx = TB.a * hx + TB.c * hy + TB.e, Hy = TB.b * hx + TB.d * hy + TB.f;
  if (comp) s *= cl((L - (Hy - hy - gb)) / L, 0.6, 1.3);
  squashAbout(hx, hy, 1, s, ang);
  PUT(pi, M.a, M.b, M.c, M.d, M.e + Hx - hx, M.f + Hy - hy);
}

// ---------------------------------------------------------------- 'gmech' emit
// J (sprite px): pivot [x, y] (torso turns about it = the hips), hipN / hipF [x, y], legL, shN / shF (shoulders), neck.
// rp: legN legF body head armN armF pod lens fx boom (part indices, -1 none).
// P: pitch lift dx head aN aF LN LF SN SF comp gb boom (show the stomp's impact).
export const GP = { pitch: 0, lift: 0, dx: 0, head: 0, aN: 0, aF: 0, LN: 0, LF: 0, SN: 1, SF: 1, comp: 1, gb: 0, boom: 0 };
export function resetGP(p = GP) { p.pitch = p.lift = p.dx = p.head = p.aN = p.aF = p.LN = p.LF = 0; p.SN = p.SF = 1; p.comp = 1; p.gb = 0; p.boom = 0; return p; }
export function gmechEmit(J, rp, p) {
  rotAbout(J.pivot[0], J.pivot[1], p.pitch, p.dx, p.lift); keep(TB);
  rotAbout(J.shF[0], J.shF[1], p.aF); outIn(rp.armF, TB);
  leg(rp.legF, J.hipF[0], J.hipF[1], J.legL, p.LF, p.SF, p.comp, p.gb);
  out(rp.body, TB);
  out(rp.pod, TB);
  rotAbout(J.neck[0], J.neck[1], p.head); outIn(rp.head, TB);
  leg(rp.legN, J.hipN[0], J.hipN[1], J.legL, p.LN, p.SN, p.comp, p.gb);
  rotAbout(J.shN[0], J.shN[1], p.aN); outIn(rp.armN, TB);
  out(rp.lens, TB);
  out(rp.fx, TB);
  if (p.boom && ok(rp.boom)) PUT(rp.boom, 1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- 'golem' emit
// J: pivot, hipN / hipF, legL, shN / shF, neck. rp: legN legF body head armN armF blob. P as GP (blob rides the near arm).
export function golemEmit(J, rp, p) {
  rotAbout(J.pivot[0], J.pivot[1], p.pitch, p.dx, p.lift); keep(TB);
  rotAbout(J.shF[0], J.shF[1], p.aF); outIn(rp.armF, TB);
  leg(rp.legF, J.hipF[0], J.hipF[1], J.legL, p.LF, p.SF, p.comp, p.gb);
  out(rp.body, TB);
  rotAbout(J.neck[0], J.neck[1], p.head); outIn(rp.head, TB);
  leg(rp.legN, J.hipN[0], J.hipN[1], J.legL, p.LN, p.SN, p.comp, p.gb);
  rotAbout(J.shN[0], J.shN[1], p.aN);
  if (ok(rp.blob)) {   // the lava blob sits between the fists, carried by the near arm
    TA.a = TB.a * M.a + TB.c * M.b; TA.b = TB.b * M.a + TB.d * M.b; TA.c = TB.a * M.c + TB.c * M.d; TA.d = TB.b * M.c + TB.d * M.d;
    TA.e = TB.a * M.e + TB.c * M.f + TB.e; TA.f = TB.b * M.e + TB.d * M.f + TB.f;
    outIn(rp.armN, TB); out(rp.blob, TA);
  } else outIn(rp.armN, TB);
}

// ---------------------------------------------------------------- 'kslime' emit
// rp: body top in0..in5 (inside shapes: drawn between body and top), n (how many inside shapes to show).
// P: sq (y scale - 1), sh (shear), ix[6] / iy[6] (inside shapes' slosh, px).
export const SP_ = { sq: 0, sh: 0, ix: new Float64Array(6), iy: new Float64Array(6), n: 0 };
export function slimeEmit(J, rp, p) {
  const sx = 1 - SL.area * p.sq, sy = 1 + p.sq, c = -p.sh * sy;
  TB.a = sx; TB.b = 0; TB.c = c; TB.d = sy; TB.e = 0; TB.f = 0;
  out(rp.body, TB);
  const n = Math.min(p.n, 6);
  for (let i = 0; i < n; i++) {
    const pi = i === 0 ? rp.in0 : i === 1 ? rp.in1 : i === 2 ? rp.in2 : i === 3 ? rp.in3 : i === 4 ? rp.in4 : rp.in5;
    if (!ok(pi)) continue;
    const dx = p.ix[i], dy = p.iy[i];
    PUT(pi, TB.a, TB.b, TB.c, TB.d, TB.a * dx + TB.c * dy, TB.b * dx + TB.d * dy);
  }
  out(rp.top, TB);
}

// ---------------------------------------------------------------- per-slot memory (own arrays; reset with fresh())
const NS = 32768;
const AMP = new Float32Array(NS), PH = new Float32Array(NS), LC = new Float32Array(NS), LZ = new Float32Array(NS);
const STEP = new Int32Array(NS), CODE = new Int16Array(NS);
const ACT0 = new Float64Array(NS);   // world time the current pose code began (sim's b.actT when it has one)
const SLAM = new Uint8Array(NS);     // the stomp has slammed down (once per stomp)

// common walk bookkeeping: stride phase th, eased amplitude amp; returns th (amp in AMP[s])
function stride(s, I, D, dt) {
  let dc = I.cyc - LC[s]; LC[s] = I.cyc;
  if (!(dc > 0 && dc < 3)) dc = 0;
  if (dt > 0) AMP[s] += ((I.moving && I.z <= 1 ? 1 : 0) - AMP[s]) * Math.min(1, dt * 5);
  let th = PH[s] + dc * PI;
  if (th > 200) th -= 64 * PI;
  PH[s] = th;
  return th;
}

// ---------------------------------------------------------------- 'gmech' alive
// rp numbers: code (pose id), pitch, ha (head), arm (both arms' rest), laser 1, stomp 1, dying 1, podK (kick on opening).
// Springs: 0 pitch, 1 bob (px), 2 head, 3 near arm, 4 far arm, 5 near leg extra (stomp), 6 shake x (px).
function gmechAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg.joints, D = GM, K = D.K, s = I.slot, now = I.now;
  const st = Math.floor(I.cyc);
  if (fresh(s, u, now)) { AMP[s] = I.moving ? 1 : 0; PH[s] = I.ph * 2 * PI; LC[s] = I.cyc; STEP[s] = st; CODE[s] = rp.code; ACT0[s] = now; setAngle(s, 0, rp.pitch); setAngle(s, 2, rp.ha); setAngle(s, 3, rp.arm); setAngle(s, 4, rp.arm); }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const th = stride(s, I, D, dt), amp = AMP[s];
  if (CODE[s] !== rp.code) {
    ACT0[s] = u.b && u.b.actT !== undefined && now - u.b.actT >= 0 && now - u.b.actT < 1 ? u.b.actT : now;
    if (dt >= 0) { kick(s, 0, rp.kp); kick(s, 2, rp.kh); kick(s, 3, rp.ka); kick(s, 4, rp.ka * 0.8); }
    SLAM[s] = 0;
  }
  const tA = now - ACT0[s];
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 2, -a * D.accelHead); kick(s, 3, a * D.accelArm); kick(s, 4, a * D.accelArm * 1.2);
    if (In.hit) { const h = In.hit * (D.hit + D.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, D.hitBob * (0.5 + In.hitPow)); kick(s, 2, 1.6 * h); kick(s, 3, 2 * h); kick(s, 4, 2 * h); }
    if (I.moving && st !== STEP[s]) { kick(s, 1, D.step); kick(s, 2, D.stepHead); kick(s, 3, D.stepArm * (st & 1 ? 1 : -1)); kick(s, 4, -D.stepArm * (st & 1 ? 1 : -1)); }
  }
  CODE[s] = rp.code; STEP[s] = st;
  const sT = Math.sin(th), cT = Math.cos(th), ph = I.ph * 6.28;
  const p = GP; p.dx = 0; p.comp = 1;
  const A = D.walkA * cl(0.7 + 0.3 * Math.sqrt((u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0)) / D.walkV, 0.7, 1.2);
  p.LN = -amp * A * sT; p.LF = amp * A * sT; p.SN = 1 - amp * 0.18 * Math.max(0, cT); p.SF = 1 - amp * 0.18 * Math.max(0, -cT);
  p.gb = amp * -D.bob * Math.abs(sT);
  // stomp: the near leg comes up (s up), then slams down; the body bounces on the slam
  let legX = 0;
  if (rp.stomp) {
    const S = D.stomp;
    if (tA < S.up) { const e = Math.sin(0.5 * PI * tA / S.up); legX = S.lift * e; p.SN = 1 - S.fold * e; }
    else if (!SLAM[s]) { SLAM[s] = 1; if (dt >= 0) { kick(s, 1, S.slam); kick(s, 2, S.head); kick(s, 3, S.arm); kick(s, 4, -S.arm); } }
    p.comp = tA < S.up ? 0 : 1;
  }
  p.boom = rp.stomp && tA >= D.stomp.up && tA < D.stomp.up + 0.4 ? 1 : 0;
  p.LN += spring(s, 5, legX, K.leg, dt, 1.6);
  // dying: shakes (fast jitter), slumps forward, the near arm hangs
  let shake = 0, slump = 0;
  if (rp.dying) { const e = Math.min(1, tA / 1.2); shake = D.dying.shake * Math.sin(now * 61 + ph) * (0.4 + e); slump = D.dying.slump * e; }
  p.dx = spring(s, 6, shake, K.shake, dt, 6);
  p.pitch = spring(s, 0, rp.pitch + slump + amp * D.rock * 2 * sT * cT, K.pitch, dt, 0.6);
  p.lift = spring(s, 1, 0, K.bob, dt, 14) + p.gb + (I.moving ? 0 : D.breathe * Math.sin(I.rt * 1.4 + ph));
  p.head = spring(s, 2, rp.ha + (rp.dying ? 0.3 : 0), K.head, dt, 0.8);
  p.aN = spring(s, 3, rp.arm + (I.moving ? D.armSwing * amp * sT : 0.03 * Math.sin(I.rt * 1.7 + ph)) + (rp.dying ? D.dying.arm : 0), K.arm, dt, 1.6);
  p.aF = spring(s, 4, rp.arm - (I.moving ? D.armSwing * amp * sT : 0.03 * Math.sin(I.rt * 1.7 + ph + 1)), K.arm, dt, 1.6);
  gmechEmit(J, rp, p);
  return true;
}
register('gmech', { alive: gmechAlive });

// ---------------------------------------------------------------- 'golem' alive
// rp numbers: code, pitch, ha, restN / restF (the arms' rest angles), kp kh ka (kicks entering the pose).
// Springs: 0 pitch, 1 bob, 2 head, 3 near arm, 4 far arm.
function golemAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg.joints, D = GL, K = D.K, s = I.slot, now = I.now;
  const st = Math.floor(I.cyc);
  if (fresh(s, u, now)) { AMP[s] = I.moving ? 1 : 0; PH[s] = I.ph * 2 * PI; LC[s] = I.cyc; STEP[s] = st; CODE[s] = rp.code; setAngle(s, 0, rp.pitch); setAngle(s, 2, rp.ha); setAngle(s, 3, rp.restN); setAngle(s, 4, rp.restF); }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const th = stride(s, I, D, dt), amp = AMP[s];
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 2, -a * D.accelHead); kick(s, 3, a * D.accelArm); kick(s, 4, a * D.accelArm * 1.2);
    if (In.hit) { const h = In.hit * (D.hit + D.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, D.hitBob * (0.5 + In.hitPow)); kick(s, 2, 1.5 * h); kick(s, 3, 2.5 * h); kick(s, 4, 2.5 * h); }
    if (In.atkStart && rp.code === CODE[s]) { kick(s, 3, D.punch.kick); kick(s, 0, D.punch.torso); }
    if (CODE[s] !== rp.code) { kick(s, 0, rp.kp); kick(s, 2, rp.kh); kick(s, 3, rp.ka); kick(s, 4, rp.ka * 0.9); }
    if (I.moving && st !== STEP[s]) { kick(s, 1, D.step); kick(s, 2, D.stepHead); kick(s, 3, D.stepArm * (st & 1 ? 1 : -1)); kick(s, 4, -D.stepArm * (st & 1 ? 1 : -1)); }
  }
  CODE[s] = rp.code; STEP[s] = st;
  const sT = Math.sin(th), cT = Math.cos(th), ph = I.ph * 6.28, p = GP;
  p.dx = 0; p.comp = 1;
  const A = D.walkA * cl(0.7 + 0.3 * Math.sqrt((u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0)) / D.walkV, 0.7, 1.25);
  p.LN = -amp * A * sT; p.LF = amp * A * sT; p.SN = 1 - amp * 0.2 * Math.max(0, cT); p.SF = 1 - amp * 0.2 * Math.max(0, -cT);
  p.gb = amp * -D.bob * Math.abs(sT);
  p.pitch = spring(s, 0, rp.pitch + amp * D.rock * sT, K.pitch, dt, 0.7);
  p.lift = spring(s, 1, 0, K.bob, dt, 12) + p.gb + (I.moving ? 0 : D.breathe * Math.sin(I.rt * 1.6 + ph));
  p.head = spring(s, 2, rp.ha + (I.moving ? 0.05 * Math.sin(2 * th) : 0.03 * Math.sin(I.rt * 1.1 + ph)), K.head, dt, 0.8);
  const sw = I.moving ? D.armSwing * amp : 0;
  p.aN = spring(s, 3, rp.restN + sw * Math.sin(th - D.armLag) + (I.moving ? 0 : 0.04 * Math.sin(I.rt * 1.3 + ph)), K.arm, dt, 3.2);
  p.aF = spring(s, 4, rp.restF - sw * Math.sin(th - D.armLag) + (I.moving ? 0 : 0.04 * Math.sin(I.rt * 1.3 + ph + 2)), K.arm, dt, 3.2);
  golemEmit(J, rp, p);
  return true;
}
// Dead: the golem falls apart: legs topple out, the torso drops onto them and rolls, arms flop out to the sides, the head
// rolls off forward. Painted dim (the parts' dead frames). Settles by ~0.6 s (RENDER stamps it into the ground after).
function golemBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.joints, p = GP;
  resetGP(p); p.comp = 0;
  const k = air ? 0 : flop(1, t), w = air ? Math.sin(now * 11 + h01(id, 1) * 6) : 0;
  p.LN = -1.45 * k + 0.4 * w; p.LF = 1.4 * k - 0.4 * w; p.SN = 1; p.SF = 1;
  p.lift = 15 * k; p.pitch = (0.45 + 0.2 * h01(id, 2)) * k + 0.2 * w;
  p.aN = (-0.25 - 0.3 * h01(id, 3)) * k + 0.8 * w; p.aF = (0.6 + 0.3 * h01(id, 4)) * k - 0.8 * w;
  p.head = (1.3 + 0.6 * h01(id, 5)) * k; p.dx = 0;
  golemEmit(J, rp, p);
  return true;
}
register('golem', { alive: golemAlive, body: golemBody });

// ---------------------------------------------------------------- 'kslime' alive
// rp numbers: k (size 0 king / 1 big / 2 slimelet), sq (pose squash target), code, kq (squash kick entering the pose),
// cap (max inside shapes). Springs: 0 squash, 1 shear, 2..7 inside shapes' slosh x, 8..10 slosh y (first 3).
const INX = [-11, 7, -2, 12, -14, 3], INY = [0, -1, 3, -4, -5, 5];   // slosh phase offsets per shape (no allocation)
function slimeAlive(ent, rp, u, I) {
  const s = I.slot, now = I.now, k = rp.k | 0, b = u.b;
  if (fresh(s, u, now)) { setAngle(s, 0, 0.15); CODE[s] = rp.code; LZ[s] = I.z; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    if (In.hit) { kick(s, 0, -(SL.hit + SL.hitPow * In.hitPow)); kick(s, 1, In.hit * (SL.sh + SL.shPow * In.hitPow)); for (let i = 2; i < 8; i++) kick(s, i, In.hit * SL.inHit * (1 + 0.2 * (i & 1))); }
    if (In.atkStart) kick(s, 0, SL.atk);
    if (CODE[s] !== rp.code) { kick(s, 0, rp.kq); for (let i = 8; i < 11; i++) kick(s, i, rp.kq * 1.6); }
    if (LZ[s] > 1 && I.z <= 1) { kick(s, 0, SL.landKick); for (let i = 8; i < 11; i++) kick(s, i, SL.inLand); }
    kick(s, 1, In.ax * dt * 0.0016);
    for (let i = 2; i < 8; i++) kick(s, i, -In.ax * dt * 0.012);
  }
  CODE[s] = rp.code; LZ[s] = I.z;
  const fwd = (u.vx || 0) * I.flip, air = I.z > 1;
  const p = SP_;
  p.sq = spring(s, 0, (air ? SL.hop : rp.sq) + SL.breathe * Math.sin(I.rt * SL.breatheW + I.ph * 6.28), SL.Ksq[k], dt, 0.5);
  p.sh = spring(s, 1, cl(fwd * SL.moveSh, -0.08, 0.08), SL.Ksh[k], dt, 0.4);
  const n = Math.min(rp.cap | 0, b && b.inside > 0 ? b.inside | 0 : 0);
  p.n = n;
  for (let i = 0; i < n; i++) {
    const tw = I.rt * (0.9 + 0.13 * i) + INX[i];
    p.ix[i] = spring(s, 2 + i, SL.inSlosh * Math.sin(tw), SL.Kin, dt, 7);
    p.iy[i] = (i < 3 ? spring(s, 8 + i, 0, SL.Kin, dt, 6) : 0) + 0.8 * Math.sin(tw * 1.3 + INY[i]);
  }
  slimeEmit(null, rp, p);
  return true;
}
function slimeBody(ent, rp, id, t, air, now) {
  const e = SL.dead, sq = e.a * Math.exp(-e.decay * t) * Math.cos(e.w * t) * Math.max(0, 1 - t / 0.7);
  const p = SP_; p.sq = sq; p.sh = 0.4 * sq * (h01(id, 1) - 0.5); p.n = 0;
  slimeEmit(null, rp, p);
  return true;
}
register('kslime', { alive: slimeAlive, body: slimeBody });

// ---------------------------------------------------------------- helpers for the self-drawn bosses
// Extra spring bank: 48 springs for each of 64 boss slots (id & 63: bosses are one per type per field).
const XS = 64, XN = 48;
const XB = new Float32Array(XS * XN * 2), XID = new Int32Array(XS).fill(-1);
const XLX = new Float32Array(XS), XLY = new Float32Array(XS), XW = new Float32Array(XS), XT = new Float64Array(XS);
export const XAN = 24;
export const XA = new Float64Array(XS * XAN);   // per-slot scratch the drawer may keep (state-change times etc.)
/** slot for a boss (id & 63); clears its springs + memory the first time this unit is seen in it. */
export function xslot(u, x, y, now) {
  const s = u.id & (XS - 1);
  if (XID[s] !== u.id) { XID[s] = u.id; XB.fill(0, s * XN * 2, (s + 1) * XN * 2); XA.fill(-9, s * XAN, (s + 1) * XAN); XLX[s] = x; XLY[s] = y; XW[s] = 0; XT[s] = now; }
  return s;
}
/** sim dt since this slot was last drawn (0 when paused, max 1/20 s). */
export function xdt(s, now) { const d = cl(now - XT[s], 0, 0.05); XT[s] = now; return d; }
/** walked distance (px) for a slot, from its drawn position. */
export function xwalk(s, x, y) { const dx = x - XLX[s], dy = y - XLY[s], d = Math.sqrt(dx * dx + dy * dy); if (d < 30) XW[s] += d; XLX[s] = x; XLY[s] = y; return XW[s]; }
export function xspring(s, i, target, K, dt, lim = 3) {
  const o = (s * XN + i) * 2;
  let a = XB[o], v = XB[o + 1];
  if (dt > 0) { v += (-K[0] * (a - target) - K[1] * v) * dt; a += v * dt; if (a > lim) { a = lim; v = 0; } else if (a < -lim) { a = -lim; v = 0; } XB[o] = a; XB[o + 1] = v; }
  return a;
}
export function xkick(s, i, dv) { XB[(s * XN + i) * 2 + 1] += dv; }
export function xset(s, i, a) { XB[(s * XN + i) * 2] = a; }
export { cl as clamp01 };
