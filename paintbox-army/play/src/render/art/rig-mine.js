// Unit maker floppy bodies (OURS, Part 2 step 8, STEP8.md "Art contract"). Owner: ART-BODY. Contract: RIG.md.
// The parts are painted by sprites-mine.js (one entry per made unit, built from its recipe); this file turns them.
//   'mine2'  a made PERSON or GIANT: two legs (walk / run / tucked / sit / kneel / stomp / flail / dangle), a torso that
//            leans on a spring, a head that lags + nods, two arms on springs (the front arm carries the weapon, the back
//            arm grips the weapon too when the hold is two-handed: it reaches for a point on the weapon every frame),
//            the gear of the weapon and both abilities at their anchors (hand, mouth, head, tail, fist, back, feet,
//            off hand), a ghost's wisp instead of legs.
//   'mine4'  a made ANIMAL or BEAST: four legs (trot / gallop / pounce tuck / crouch / sit / lie / dangle), a body that
//            pitches + bobs, a head that lags + lunges, a tail that wags, the near fore paw swipes (fist gear), a
//            weapon strapped on the back that kicks back when it fires, swing / pole weapons held in the mouth.
// Both read the pose straight from the sim every frame: u.b.act (sim/maker/lib.js ACT code) and u.attack (the weapon's
// attack, 1 -> 0 over its look time: the attack is animated from its wind-up keyframe A0 to its strike A1). The per-
// recipe tables (V / A0 / A1 per ACT code, idle, walk) are compiled by the entry (sprites-mine.js compile()), so any
// weapon x ability mix gets its poses without a whole sprite per pose.
// emit2 / emit4 are shared with the painter: every whole pose, the toolbar icon and the maker preview are the same parts
// put together the same way. No allocation per unit per frame (typed arrays, fixed scratch objects).
import * as RIG from './rig.js';
const { fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, putIn, inP, flop, h01, register, M, OUT, BANK, NSPR } = RIG;
export const ready = true;
const PI = Math.PI;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- pose vectors (Float32Array, one per pose)
// Two-leg vector (V2.*): angles in the facing-right frame, + = clockwise on screen (arm 0 = straight forward, +PI/2 =
// hanging down, -PI/2 = straight up; a leg's foot back; the torso / head top forward).
export const V2 = { lean: 0, hd: 1, aF: 2, aB: 3, sF: 4, sB: 5, wA: 6, bh: 7, dx: 8, dy: 9, rot: 10, leg: 11, ta: 12, fl: 13, sq: 14, wv: 15, ho: 16, ga: 17, N: 18 };
// Four-leg vector (V4.*).
export const V4 = { pitch: 0, ha: 1, hx: 2, li: 3, ta: 4, gait: 5, pw: 6, wr: 7, wn: 8, fl: 9, sq: 10, re: 11, wv: 12, ho: 13, ga: 14, N: 16 };
// discrete fields: taken from the wind-up keyframe until the attack is 40 % through, then from the strike keyframe
const DISC2 = [V2.leg, V2.wv, V2.ho, V2.ga], DISC4 = [V4.gait, V4.wv, V4.ho, V4.ga];
// leg modes (V2.leg): 0 stand / walk, 1 tucked, 2 wide stance, 3 sit (legs forward), 4 flail (tossed), 5 kneel, 6 belly
// (legs out behind), 7 stomp (near leg up), 8 dangle (a flyer's legs hang)
// gaits (V4.gait): 0 stand / trot, 1 gallop, 2 tuck (pounce: front forward, hind back), 3 crouch, 4 sit, 5 lie (legs out),
// 6 dangle (flyer), 7 flail (tossed)
export const ACTN = 40;   // ACT codes 0..39 (sim/maker/lib.js)
const A_UNDER = 30, A_STOMP = 26, A_COMBO = 12, A_SPIN = 13, A_FIRE = 2, A_SPRAY = 9, A_BEAM = 10, A_BREATH = 8, A_CHANNEL = 27, A_HOP = 37;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping]: damping ratio c / (2 sqrt k) ~ 0.25-0.3 (they overshoot 2-3 times). Kicks: rad/s, px/s.
export const MK = {
  torso: [120, 6.5], head: [200, 5.5], arm: [170, 7.5], wpn: [190, 8], slide: [200, 8.5], rot: [90, 5.5], stretch: [220, 9],
  tail: [80, 4.2], flap: [150, 5], puff: [160, 6.5],
  pitch: [110, 5.6], qbob: [170, 7.2], qhead: [140, 5.2], lunge: [240, 9.5], paw: [160, 6.5], recoil: [260, 9],
  accel: 0.0011, lean: 1 / 700,                 // torso lags a speed change / leans into its speed (as rig.js PUSH)
  hit: 3, hitPow: 11, hitArm: 1, hitHead: 2,    // a blow knocks the torso (head twice, arms once) along it
  atkArm: -4, atkTorso: -0.8,                   // an attack starting kicks the front arm + torso (on top of the keyframes)
  walkArm: 0.22,                                // free arms swing with the stride (rad)
  legWalk: 0.5, legRun: 0.85, legIdle: 0.09, legFly: 0.95, bob: 0.9,   // two legs (as rig.js LEG)
  qWalk: 0.45, qRun: 0.95, qFold: 0.32, qBob: 0.8, qNod: 0.07, qWag: 0.25, galOver: 1.25,   // four legs; gallop above walk x 1.25
  flapW: 13, flapA: 0.55,                       // wings flap (rad/s, rad) while a flyer is up
  jit: 0.035,                                   // a held trigger judders the weapon (rad)
  combo: 6.5, spin: 13,                         // combo jabs per s, spin rad/s
};

// ---------------------------------------------------------------- per-slot state (springs: rig.js BANK, 12 a slot)
// two legs: 0 lean, 1 head, 2 armF, 3 armB, 4 weapon angle, 5 dy, 6 dx, 7 rot, 8 sF, 9 tail gear, 10 flap, 11 puff
// four legs: 0 pitch, 1 bob/lift, 2 head, 3 tail, 4 paw, 5 recoil, 6 lunge, 7 weapon angle, 8 rear, 9 flap, 10 puff
const NS = 32768;
const PH = new Float32Array(NS), LC = new Float32Array(NS), AMP = new Float32Array(NS), GAL = new Float32Array(NS), LZ = new Float32Array(NS);
const TG = new Float32Array(20);       // the target vector this frame
export const S2 = new Float64Array(26);   // two-leg pose state handed to emit2 (see emit2)
export const S4 = new Float64Array(28);   // four-leg pose state handed to emit4 (see emit4)

/** TG = the target for this unit now: an attack lerps A0 -> A1 (eased) by u.attack, else the act's / idle / walk vector. */
function target(X, code, moving, atk, disc, N) {
  let V = X.V[code];
  if (!V || code === 0) V = moving ? X.walk : X.idle;
  const A0 = X.A0[code], A1 = X.A1[code];
  if (atk > 0 && A0 && A1) {
    const p = 1 - atk, e = 1 - (1 - p) * (1 - p) * (1 - p);   // fast out: the strike lands early, then it settles
    for (let i = 0; i < N; i++) { const a = A0[i], b = A1[i]; TG[i] = a !== a || b !== b ? (e < 0.4 ? a : b) : a + (b - a) * e; }
    for (let k = 0; k < disc.length; k++) { const i = disc[k]; TG[i] = e < 0.4 ? A0[i] : A1[i]; }
    return e;
  }
  for (let i = 0; i < N; i++) TG[i] = V[i];
  return -1;
}

// ---------------------------------------------------------------- scratch matrices
const TR = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TH = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const TB = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TL = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const has = (t) => t !== -1 && t !== null && t !== undefined;
// Gear frames this frame: the driver sets GS.code / GS.air (-1 = a whole pose: then S ga decides). Ability gear with acts
// (ART-ABILITY: the ACT codes that show 'atk') / air ('atk' while airborne) follows them; weapon gear follows the weapon.
export const GS = { code: -1, air: 0 };
function gt(g, ga, wOn) {
  let on;
  if (g.wpn) on = wOn;
  else if (GS.code >= 0 && (g.acts || g.air)) on = (g.acts !== null && g.acts[GS.code] === 1) || (g.air && GS.air === 1);
  else on = ga;
  return on && has(g.tokA) ? g.tokA : g.tok;
}
/** The weapon's part for weapon view wv (0 hidden, 1 idle, 2 atk, 3 the gear's extra pose: bow 'loose', bombs 'aim'). */
function wtokOf(wv, w, wA, wX) { return wv > 2.5 && has(wX) ? wX : wv > 1.5 && has(wA) ? wA : w; }
function putT(put, tok, T) { put(tok, T.a, T.b, T.c, T.d, T.e, T.f); }
function putInT(put, tok, P) { put(tok, P.a * M.a + P.c * M.b, P.b * M.a + P.d * M.b, P.a * M.c + P.c * M.d, P.b * M.c + P.d * M.d, P.a * M.e + P.c * M.f + P.e, P.b * M.e + P.d * M.f + P.f); }
/** Every gear of G at `at` (its rest place rides parent P, turned by ang about the root (rx, ry)); top = 1: only gear
 *  whose 'atk' frame goes over everything (the shell closed), 0: the others, -1: all. */
function gears(put, G, at, P, rx, ry, ang, ga, wOn, top) {
  for (let i = 0; i < G.length; i++) {
    const g = G[i];
    if (g.at !== at) continue;
    const tok = gt(g, ga, wOn), isTop = g.top === true && tok === g.tokA;
    if (top === 1 ? !isTop : top === 0 ? isTop : false) continue;
    if (ang !== 0) rotAbout(rx, ry, ang); else { M.a = 1; M.b = 0; M.c = 0; M.d = 1; M.e = 0; M.f = 0; }
    putInT(put, tok, P);
  }
}

// ---------------------------------------------------------------- body anchors (MINE.anchor, sprites-mine.js)
// Where the hand, the weapon's muzzle / tip, mouth, head centre, head top, back and tail are this frame, in the entry's
// sprite px (facing right, feet at 0,0, before the entry scale), kept per slot by the drivers (16 floats: x, y in that
// order), so effects (beams, sparks, breath) start where the art has them. X.wTip = the weapon's tip in its gear frame
// (scaled), X.wAt = where the weapon rides ('hand' | 'back' | 'mouth' | 'fist' | 'tail'), X.wGrip = its grip at rest.
export const ANCHOR_N = 16;
export const AID = new Int32Array(32768).fill(-1), AP = new Float32Array(32768 * ANCHOR_N);
const HF = new Float64Array(2);
function tp(D, o, T, x, y) { D[o] = T.a * x + T.c * y + T.e; D[o + 1] = T.b * x + T.d * y + T.f; }
/** Two legs: the anchors of the pose emit2 just put out (TT torso, TH head still hold it). */
export function anchors2(D, o, X, J, S) {
  const tip = X.wTip, cw = Math.cos(S[6]), sw = Math.sin(S[6]);
  tp(D, o, TT, HF[0], HF[1]);
  if (X.wAt === 'mouth' || X.wAt === 'head') tp(D, o + 2, TH, X.wGrip[0] + tip[0], X.wGrip[1] + tip[1]);
  else if (X.wAt === 'fist') { const ca = Math.cos(S[2]), sa = Math.sin(S[2]); tp(D, o + 2, TT, HF[0] + tip[0] * ca - tip[1] * sa, HF[1] + tip[0] * sa + tip[1] * ca); }
  else if (X.wAt === 'tail') { const ca = Math.cos(S[15]), sa = Math.sin(S[15]), gx = X.wGrip[0], gy = X.wGrip[1]; tp(D, o + 2, TT, gx + tip[0] * ca - tip[1] * sa, gy + tip[0] * sa + tip[1] * ca); }
  else tp(D, o + 2, TT, HF[0] + tip[0] * cw - tip[1] * sw, HF[1] + tip[0] * sw + tip[1] * cw);
  tp(D, o + 4, TH, J.mouth[0], J.mouth[1]); tp(D, o + 6, TH, J.centre[0], J.centre[1]); tp(D, o + 8, TH, J.headTop[0], J.headTop[1]);
  tp(D, o + 10, TT, J.back[0], J.back[1]); tp(D, o + 12, TT, J.tail[0], J.tail[1]);
}
/** Four legs: the anchors of the pose emit4 just put out (TB body, TH head). The 'hand' = the weapon's grip. */
export function anchors4(D, o, X, J, S) {
  const tip = X.wTip, g = X.wGrip;
  if (X.wAt === 'back') {   // strapped on the back: turned by the recoil angle about the back, kicked back
    const a = S[14] + X.wAng, ca = Math.cos(S[14]), sa = Math.sin(S[14]), bx = J.back[0], by = J.back[1];
    const gx = bx + (g[0] - bx) * ca - (g[1] - by) * sa - S[13], gy = by + (g[0] - bx) * sa + (g[1] - by) * ca;
    const c2 = Math.cos(a), s2 = Math.sin(a);
    tp(D, o, TB, gx, gy); tp(D, o + 2, TB, gx + tip[0] * c2 - tip[1] * s2, gy + tip[0] * s2 + tip[1] * c2);
  } else if (X.wAt === 'tail') { const ca = Math.cos(S[4]), sa = Math.sin(S[4]); tp(D, o, TB, g[0], g[1]); tp(D, o + 2, TB, g[0] + tip[0] * ca - tip[1] * sa, g[1] + tip[0] * sa + tip[1] * ca); }
  else if (X.wAt === 'fist') { tp(D, o, TB, J.paw[0], J.paw[1]); tp(D, o + 2, TB, J.paw[0] + tip[0], J.paw[1] + tip[1]); }
  else { tp(D, o, TH, g[0], g[1]); tp(D, o + 2, TH, g[0] + tip[0], g[1] + tip[1]); }   // mouth / head
  tp(D, o + 4, TH, J.mouth[0], J.mouth[1]); tp(D, o + 6, TH, J.centre[0], J.centre[1]); tp(D, o + 8, TH, J.headTop[0], J.headTop[1]);
  tp(D, o + 10, TB, J.back[0], J.back[1]); tp(D, o + 12, TB, J.rear[0], J.rear[1]);
}

// ---------------------------------------------------------------- emit2: a two-leg body
// J = joints (sprite px, facing right, feet at 0,0): hip, legX, legL, neck, sF / sB (shoulders), LA (arm length), hand /
// hand2 (rest places of the front / back hand = shoulder + LA), back, tail (gear roots in the torso), wisp (ghost).
// K = part tokens (pose indices in the driver, names in the painter; -1 / null = none): leg, wisp, body, head, headO,
// armF, armB, w / wA / wX (held weapon idle / atk / extra pose), w2 (true = a second copy in the back hand: pair), wM /
// wMA (a mouth / head weapon, rides the head), wF / wFA (a fist weapon, rides the front hand; wF2 = also the back hand),
// mound. G = the gear list [{ tok, tokA, at, acts, air, top, wpn }] (at: 'mouth' | 'head' | 'tail' | 'fist' | 'back' |
// 'backB' (behind) | 'feet' | 'hand2'). Every gear part is painted at its anchor's rest place, so it rides its parent.
// S = S2: 0 lean, 1 hd, 2 aF, 3 aB, 4 sF, 5 sB, 6 wA, 7 wB (back-hand weapon angle), 8 dx, 9 dy, 10 rot, 11 lN, 12 lF,
// 13 kN, 14 kF (leg y squash), 15 ta, 16 fl, 17 sq, 18 wv (0 hidden, 1 idle, 2 atk, 3 extra), 19 ho (head open), 20 ga
// (ability gear 'atk' when it has no acts), 21 wisp angle.
export function emit2(J, K, G, S, put) {
  const hx = J.hip[0], hy = J.hip[1], sq = 1 + S[17];
  // root: puff + whole turn about the hip, then moved; torso: leaned about the hip inside it
  squashAbout(hx, hy, sq, sq, S[10]); M.e += S[8]; M.f += S[9]; keep(TR);
  rotAbout(hx, hy, S[0]); inP(TR); keep(TT);
  const ga = S[20] > 0.5, wv = S[18], wOn = wv > 1.5;
  gears(put, G, 'backB', TT, J.back[0], J.back[1], S[16], ga, wOn, -1);
  if (has(K.wisp)) { rotAbout(hx, hy, S[21]); putInT(put, K.wisp, TR); }
  else if (has(K.leg)) { squashAbout(0, hy, 1, S[14], S[12]); M.e -= J.legX; putInT(put, K.leg, TR); }
  gears(put, G, 'tail', TT, J.tail[0], J.tail[1], S[15], ga, wOn, -1);
  if (!has(K.wisp) && has(K.leg)) { squashAbout(0, hy, 1, S[13], S[11]); M.e += J.legX; putInT(put, K.leg, TR); }
  putT(put, K.body, TT);
  gears(put, G, 'back', TT, J.back[0], J.back[1], S[16] * 0.5, ga, wOn, 0);
  rotAbout(J.neck[0], J.neck[1], S[1]); inP(TT); keep(TH);
  putT(put, S[19] > 0.5 && has(K.headO) ? K.headO : K.head, TH);
  gears(put, G, 'head', TH, 0, 0, 0, ga, wOn, -1); gears(put, G, 'mouth', TH, 0, 0, 0, ga, wOn, -1);
  if (has(K.wM)) putT(put, wv > 1.5 && has(K.wMA) ? K.wMA : K.wM, TH);   // a mouth / head weapon rides the head
  // back arm (+ the second weapon copy, + the off-hand gear) under the weapon and the front arm
  const sB = S[5], aB = S[3], sbx = J.sB[0], sby = J.sB[1];
  const hbx = sbx + J.LA * sB * Math.cos(aB), hby = sby + J.LA * sB * Math.sin(aB);
  const wtok = wtokOf(wv, K.w, K.wA, K.wX);
  if (K.w2 === true && wv > 0.5 && has(wtok)) { rotAbout(J.hand[0], J.hand[1], S[7], hbx - J.hand[0], hby - J.hand[1]); putInT(put, wtok, TT); }
  if (has(K.armB)) { squashAbout(sbx, sby, sB, 1, aB); putInT(put, K.armB, TT); }
  const hb2y = hby < sby ? sby : hby;   // off-hand gear (shield, rope) stays at chest height when the arm goes up: never over the face
  for (let i = 0; i < G.length; i++) { const g = G[i]; if (g.at === 'hand2') { rotAbout(J.hand2[0], J.hand2[1], 0, hbx - J.hand2[0], hb2y - J.hand2[1]); putInT(put, gt(g, ga, wOn), TT); } }
  if (has(K.wF2)) { rotAbout(J.hand[0], J.hand[1], aB, hbx - J.hand[0], hby - J.hand[1]); putInT(put, wv > 1.5 && has(K.wFA) ? K.wFA : K.wF2, TT); }   // fist weapon on the back hand too
  // the held weapon at the front hand, then the front arm over its grip, then fist gear on that hand
  const sF = S[4], aF = S[2], sfx = J.sF[0], sfy = J.sF[1];
  const hfx = sfx + J.LA * sF * Math.cos(aF), hfy = sfy + J.LA * sF * Math.sin(aF);
  HF[0] = hfx; HF[1] = hfy;
  if (wv > 0.5 && has(wtok)) { rotAbout(J.hand[0], J.hand[1], S[6], hfx - J.hand[0], hfy - J.hand[1]); putInT(put, wtok, TT); }
  if (has(K.armF)) { squashAbout(sfx, sfy, sF, 1, aF); putInT(put, K.armF, TT); }
  if (has(K.wF)) { rotAbout(J.hand[0], J.hand[1], aF, hfx - J.hand[0], hfy - J.hand[1]); putInT(put, wv > 1.5 && has(K.wFA) ? K.wFA : K.wF, TT); }
  for (let i = 0; i < G.length; i++) { const g = G[i]; if (g.at === 'fist') { rotAbout(J.hand[0], J.hand[1], aF, hfx - J.hand[0], hfy - J.hand[1]); putInT(put, gt(g, ga, wOn), TT); } }
  gears(put, G, 'feet', TR, 0, 0, 0, ga, wOn, -1);
  gears(put, G, 'back', TT, J.back[0], J.back[1], S[16] * 0.5, ga, wOn, 1);   // the shell closed: over everything
}

/** Fill S2 from a pose vector V (no springs: whole poses, the preview). legs: [lN, lF] or null (from the leg mode). */
export function pose2(J, V, legs, wB = 0, X = null) {
  const S = S2;
  S[0] = V[V2.lean]; S[1] = V[V2.hd]; S[2] = V[V2.aF]; S[4] = V[V2.sF]; S[6] = V[V2.wA]; S[8] = V[V2.dx]; S[9] = V[V2.dy]; S[10] = V[V2.rot];
  S[15] = V[V2.ta]; S[16] = V[V2.fl]; S[17] = V[V2.sq]; S[18] = V[V2.wv]; S[19] = V[V2.ho]; S[20] = V[V2.ga]; S[21] = 0;
  legsOf2(J, V[V2.leg] | 0, 0, 0, false, false, S[9]);
  if (legs) { S[11] = legs[0]; S[12] = legs[1]; }
  backArm(J, V[V2.bh], V[V2.aB], V[V2.sB], X ? h2Of(X, V[V2.wv]) : null);
  S[7] = wB || S[3] + (S[6] - S[2]);
  return S;
}
/** The weapon's off-hand point for weapon view wv (hand2A while it attacks / aims, if it has one). */
export function h2Of(X, wv) { return wv > 1.5 && X.h2A ? X.h2A : X.h2; }
/** Back arm: free (bh NaN: angle aB, stretch sB) or reaching for the held weapon: its off-hand point h2 (gear px, the
 *  weapon's frame: ART-WEAPONS hand2 / hand2A) or else the point bh px along it from the grip. */
function backArm(J, bh, aB, sB, h2) {
  const S = S2;
  if (bh !== bh) { S[3] = aB; S[5] = sB; return false; }
  const aF = S[2], sF = S[4], wA = S[6], cw = Math.cos(wA), sw = Math.sin(wA);
  const ox = h2 ? h2[0] : bh, oy = h2 ? h2[1] : 0.6;
  const qx = J.sF[0] + J.LA * sF * Math.cos(aF) + J.gs * (ox * cw - oy * sw), qy = J.sF[1] + J.LA * sF * Math.sin(aF) + J.gs * (ox * sw + oy * cw);
  const dx = qx - J.sB[0], dy = qy - J.sB[1];
  S[3] = Math.atan2(dy, dx); S[5] = cl(Math.sqrt(dx * dx + dy * dy) / J.LA, 0.4, 1.3);
  return true;
}
/** Leg angles + squash for a leg mode (S2 11..14). cyc = strides walked, t = time (s), dy = body drop (feet stay down). */
function legsOf2(J, mode, cyc, t, moving, run, dy) {
  const S = S2, L = J.legL;
  let lN = 0, lF = 0, kN = 1, kF = 1;
  const ground = cl((L - dy) / L, 0.45, 1.3);
  switch (mode) {
    case 1: lN = -0.95; lF = -0.55; kN = 0.72; kF = 0.8; break;                                   // tucked
    case 2: lN = -0.36; lF = 0.36; kN = kF = ground; break;                                        // wide stance
    case 3: lN = -1.45; lF = -1.35; break;                                                         // sit: legs forward
    case 4: lN = MK.legFly * Math.sin(t * 13); lF = -MK.legFly * 0.85 * Math.sin(t * 11 + 1); break;   // flail
    case 5: lN = -0.85; kN = 0.62; lF = 0.75; kF = 0.72; break;                                    // kneel
    case 6: lN = 0.1; lF = -0.12; break;                                                           // belly: legs out behind (the root is turned)
    case 7: lN = -1.15; kN = 0.7; lF = 0.12; kF = ground; break;                                   // stomp: near leg up
    case 8: lN = 0.18 + 0.12 * Math.sin(t * 3.1); lF = 0.36 + 0.12 * Math.sin(t * 2.7 + 1); kN = 0.92; kF = 0.88; break;   // dangle
    default:
      if (moving) { const A = run ? MK.legRun : MK.legWalk, w = Math.sin(cyc * PI); lN = A * w; lF = -A * w; }
      else { const sw = 0.03 * Math.sin(t * 1.7); lN = MK.legIdle + sw; lF = -MK.legIdle - sw; }
      kN = kF = ground;
  }
  S[11] = lN; S[12] = lF; S[13] = kN; S[14] = kF;
}


/** NaN guard: true when every matrix this frame is finite; else the slot's springs and gait state are zeroed (they
 *  start again from rest next frame) and the caller draws the whole sprite this once. */
function finiteOut(s) {
  const m = OUT.m, n = OUT.n * 6;
  for (let i = 0; i < n; i++) { const v = m[i]; if (v - v !== 0) { BANK.fill(0, s * NSPR * 2, (s + 1) * NSPR * 2); PH[s] = 0; LC[s] = 0; AMP[s] = 0; GAL[s] = 0; LZ[s] = 0; OUT.n = 0; return false; } }
  return true;
}

/** Oil pot (X.ladle): out of pots (W-THROW's wb.pots <= 0) the ladle shows (view 3) whenever the weapon shows; with
 *  pots, view 3 (the tables' 'aim') is the idle pot. */
function ladleView(X, u, TG, i) {
  if (!X.ladle) return;
  const wb = u.b && u.b.wb, out = wb && wb.pots <= 0;
  if (TG[i] > 0.5) TG[i] = out ? 3 : TG[i] > 2.5 ? 1 : TG[i];
}
/** STEP8 (lead): the anchor in flight. W-MELEE's OVER.anchor draws it flying out on its chain during the hook
 *  (b.act === ACT.THROW), so the held one is hidden then (view 0), else two anchors show. */
function anchorView(X, u, TG, i) { if (X.flyAnchor && u.b && u.b.act === 5) TG[i] = 0; }
/** ACT.STOMP covers the rear-up (stomp bag.ph 1) and the stamp (ph 2, A-ACT1 act1-area.js): the stamp pose for ph 2. */
function stompPhase(X, u, code, TG, N) {
  if (code !== A_STOMP || !X.stamp) return;
  let i = X.stompI;
  if (i === undefined) { const abs = u.def && u.def.maker && u.def.maker.abs; i = X.stompI = abs ? abs.findIndex((a) => a && a.id === 'stomp') : -1; }
  const bag = i >= 0 && u.b.ab ? u.b.ab[i] : null;
  if (bag && bag.ph === 2) { const V = X.stamp; for (let k = 0; k < N; k++) TG[k] = V[k]; }
}
// ---------------------------------------------------------------- 'mine2' driver
const PART_DUMMY = { m: 1 };
export const partsAll = () => PART_DUMMY;   // rig.parts(): every pose is rigged; the driver resolves its own parts (kOf)
/** The entry's part names (X.names, G gear list) as this entry's pose indices, once (risen copies use the same parts:
 *  the bake key carries the zombie look). A name the entry doesn't have = -1 (not drawn). */
function kOf(ent, X) {
  if (X.K && X.kEnt === ent.id) return X.K;
  const N = X.names, K = {};
  for (const k in N) { if (k === 'G') continue; const v = N[k]; K[k] = typeof v === 'string' ? ent.pose(v) : typeof v === 'boolean' ? v : -1; }
  K.G = N.G.map((g) => ({ at: g.at, tok: ent.pose(g.tok), tokA: g.tokA ? ent.pose(g.tokA) : -1, wpn: !!g.wpn, acts: g.acts || null, air: !!g.air, top: !!g.top })).filter((g) => g.tok >= 0);
  X.K = K; X.kEnt = ent.id;
  return K;
}
function alive2(ent, rp, u, I) {
  const X = ent.e.rig._X;
  if (!X) return false;
  const s = I.slot, now = I.now, b = u.b, J = X.J;
  let code = b ? b.act | 0 : 0; if (code < 0 || code >= ACTN) code = 0;
  const K = kOf(ent, X);
  if (code === A_UNDER) { if (!has(K.mound)) return false; RIG.put(K.mound, 1, 0, 0, 1, 0, 0); return true; }
  if (fresh(s, u, now)) {
    const V = X.idle;
    setAngle(s, 0, V[V2.lean]); setAngle(s, 1, V[V2.hd]); setAngle(s, 2, V[V2.aF]); setAngle(s, 3, V[V2.aB]); setAngle(s, 4, V[V2.wA]);
    setAngle(s, 8, V[V2.sF] - 1); LZ[s] = I.z;
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const air = I.z > 1, flyer = X.flies && air;
  const atk = u.attack > 0 ? u.attack : 0;
  const e = target(X, code, I.moving && !air, atk, DISC2, V2.N);
  if (e < 0 && code === 0 && X.wind && u.state === 2 && u.cooldown > 0 && u.cooldown < X.windT) { const A = X.A0[0]; for (let i = 0; i < V2.N; i++) TG[i] = A[i]; }   // melee: wound up before the blow
  // procedural on top of the keyframes
  let wB = 0, combo = 0;
  if (code === A_COMBO && X.A0[A_COMBO]) {   // jabs in turn: the strike keyframe, then the wind-up, by time
    combo = Math.floor((now - (b.actT || 0)) * MK.combo) & 1;
    const A = combo ? X.A0[A_COMBO] : X.A1[A_COMBO]; for (let i = 0; i < V2.N; i++) TG[i] = A[i];
  }
  if (code === A_SPIN) TG[V2.aF] += (now * MK.spin) % (2 * PI) - PI;
  if (code === A_FIRE || code === A_SPRAY || code === A_BEAM || code === A_BREATH) TG[V2.wA] += MK.jit * Math.sin(now * 57 + I.ph * 9);
  ladleView(X, u, TG, V2.wv);
  anchorView(X, u, TG, V2.wv);   // STEP8 (lead)
  stompPhase(X, u, code, TG, V2.N);
  if (X.fists && code !== A_COMBO && e >= 0) { TG[V2.aB] = X.idle[V2.aB]; TG[V2.sB] = X.idle[V2.sB]; }
  if (dt > 0) {
    kick(s, 0, -In.ax * MK.accel * dt);
    if (In.hit) { const h = In.hit * (MK.hit + MK.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, MK.hitHead * h); kick(s, 2, MK.hitArm * h); kick(s, 3, MK.hitArm * h); }
    if (In.atkStart) { kick(s, 2, MK.atkArm); kick(s, 0, MK.atkTorso); }
    if (LZ[s] > 1 && !air) { kick(s, 5, 40); kick(s, 1, 3); }
  }
  LZ[s] = I.z;
  const fwd = (u.vx || 0) * I.flip, walkS = I.moving && !air ? Math.sin(I.cyc * PI) : 0;
  const S = S2;
  S[0] = spring(s, 0, TG[V2.lean] + (I.moving ? cl(fwd * MK.lean, -0.06, 0.12) : 0), MK.torso, dt, 1.6);
  S[1] = spring(s, 1, TG[V2.hd], MK.head, dt, 1.1);
  const freeF = X.armSwing && I.moving && TG[V2.bh] !== TG[V2.bh];
  S[2] = spring(s, 2, TG[V2.aF] + (freeF ? walkS * MK.walkArm * 0.6 : 0), MK.arm, dt, 3.4);
  S[4] = 1 + spring(s, 8, TG[V2.sF] - 1, MK.stretch, dt, 0.8);
  S[6] = spring(s, 4, TG[V2.wA], MK.wpn, dt, 3.4);
  S[9] = spring(s, 5, TG[V2.dy], MK.slide, dt, 12);
  S[8] = spring(s, 6, TG[V2.dx], MK.slide, dt, 8);
  S[10] = spring(s, 7, TG[V2.rot], MK.rot, dt, 3.2);
  S[15] = spring(s, 9, TG[V2.ta] + (I.moving ? 0.12 * walkS : 0), MK.tail, dt, 2);
  S[16] = spring(s, 10, TG[V2.fl] + (flyer && X.wings ? MK.flapA * Math.sin(now * MK.flapW + I.ph * 6) : 0), MK.flap, dt, 1.6);
  S[17] = spring(s, 11, TG[V2.sq], MK.puff, dt, 0.6);
  S[18] = TG[V2.wv]; S[19] = TG[V2.ho]; S[20] = TG[V2.ga] > 0.5 || (flyer && X.moveGear) || code >= 20 ? 1 : 0;
  // back arm: reaches for the weapon (two hands), else its own spring + stride swing
  if (backArm(J, TG[V2.bh], 0, 1, h2Of(X, TG[V2.wv]))) setAngle(s, 3, S[3]);
  else { S[3] = spring(s, 3, TG[V2.aB] - walkS * MK.walkArm * (X.armSwing ? 1 : 0.4), MK.arm, dt, 3.4); S[5] = TG[V2.sB]; }
  if (X.dual) { wB = S[3] + (S[6] - S[2]); if (atk > 0) wB -= 0.3 * atk; }
  S[7] = wB || S[3] + (S[6] - S[2]);
  // legs
  let mode = TG[V2.leg] | 0;
  if (air && (mode === 0 || mode === 2)) mode = flyer ? 8 : code === A_HOP ? 1 : 4;
  legsOf2(J, mode, I.cyc, now + I.ph * 6, I.moving, I.run, S[9]);
  if (mode === 0 && I.moving) S[9] -= MK.bob * Math.abs(walkS) * (J.legL / 8) * 0.5;
  S[21] = has(K.wisp) ? 0.18 * Math.sin(now * 3 + I.ph * 6) - cl(fwd * 0.004, -0.3, 0.3) : 0;
  GS.code = code; GS.air = air ? 1 : 0;
  emit2(J, K, K.G, S, RIG.put);
  GS.code = -1;
  if (!finiteOut(s)) return false;
  AID[s] = u.id; anchors2(AP, s * ANCHOR_N, X, J, S);
  return true;
}
function body2(ent, rp, id, t, air, now) {
  const X = ent.e.rig._X;
  if (!X) return false;
  const S = S2, J = X.J, K = kOf(ent, X), V = X.idle;
  let lN, lF, hd, aF, aB, tr;
  if (air) {
    const k = now * 12 + h01(id, 9) * 6;
    lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); aF = 1 + 1.2 * Math.sin(k * 0.8 + 2); aB = 1.2 + 1.1 * Math.sin(k * 0.7); tr = 0.25 * Math.sin(k * 0.7);
  } else {
    lN = flop(0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.5) * 1.3, t); aF = V[V2.aF] + flop((h01(id, 4) - 0.4) * 2.4 + (1.3 - V[V2.aF]) * 0.6, t); aB = 1.3 + flop((h01(id, 6) - 0.5) * 2, t); tr = flop((h01(id, 5) - 0.5) * 0.35, t);
  }
  S[0] = tr; S[1] = hd; S[2] = aF; S[3] = aB; S[4] = 1; S[5] = 1; S[6] = V[V2.wA] + (aF - V[V2.aF]) * 0.7 + (air ? 0 : flop(h01(id, 7) - 0.5, t));
  S[7] = S[3] + (S[6] - S[2]); S[8] = 0; S[9] = 0; S[10] = 0; S[11] = lN; S[12] = lF; S[13] = 1; S[14] = 1; S[15] = flop(0.4, t); S[16] = 0; S[17] = 0;
  S[18] = X.idle[V2.wv] > 0.5 ? 1 : 0; S[19] = 0; S[20] = 0; S[21] = flop(0.3, t);
  emit2(J, K, K.G, S, RIG.put);
  return true;
}
register('mine2', { alive: alive2, body: body2 });

// ---------------------------------------------------------------- emit4: a four-leg body
// J: pivot (body pitch), hips [NF, FF, NH, FH] [x, y], legL, neck, tailRoot, back (strap grip rest), rear (tail gear root),
// paw (near fore foot), deadH. K: legN, legF (painted at the NF / FF hip; the hind legs reuse them moved), tail, body,
// head, headO, w, wA (weapon on the back), wM, wMA (weapon in the mouth), wF, wFA (on the near fore paw), mound, wisp.
// S = S4: 0 pitch, 1 ha, 2 hx, 3 lift (px, + down), 4 ta, 5..8 leg angles NF FF NH FH, 9..12 leg squash, 13 wr (recoil px),
// 14 wn (weapon angle), 15 fl, 16 sq, 17 re (rear-up about the hind hips, - = front up), 18 wv, 19 ho, 20 ga, 21 wisp,
// 22 bob (gait), 23 hideTail (1 = a tail gear replaces the own tail)
export function emit4(J, K, G, S, put) {
  const pv = J.pivot, H = J.hips, sq = 1 + S[16];
  // body: puff about the pivot, rear about the hind hips, pitch about the pivot, lifted
  squashAbout(pv[0], pv[1], sq, sq, S[0]); keep(TL);
  rotAbout(H[2][0], H[2][1], S[17], 0, S[3] + S[22]); inP(TL); keep(TB);
  const ga = S[20] > 0.5, wv = S[18], wOn = wv > 1.5;
  gears(put, G, 'backB', TB, J.back[0], J.back[1], S[15], ga, wOn, -1);
  if (has(K.wisp)) { rotAbout(J.pivot[0], 0, S[21]); putInT(put, K.wisp, TB); }
  else { leg4(J, K.legF, 1, S, put); leg4(J, K.legF, 3, S, put); }
  if (S[23] < 0.5 && has(K.tail)) { rotAbout(J.tailRoot[0], J.tailRoot[1], S[4]); putInT(put, K.tail, TB); }
  gears(put, G, 'tail', TB, J.rear[0], J.rear[1], S[4], ga, wOn, -1);
  if (!has(K.wisp)) {
    leg4(J, K.legN, 2, S, put);
    leg4(J, K.legN, 0, S, put);
    const LM = TH; LM.a = M.a; LM.b = M.b; LM.c = M.c; LM.d = M.d; LM.e = M.e; LM.f = M.f;   // the near fore leg: fist gear rides it
    const wf = wv > 1.5 && has(K.wFA) ? K.wFA : K.wF;
    if (has(wf)) putT(put, wf, LM);
    gears(put, G, 'fist', LM, 0, 0, 0, ga, wOn, -1);
  }
  putT(put, K.body, TB);
  if (wv > 0.5) { const w = wtokOf(wv, K.w, K.wA, K.wX); if (has(w)) { rotAbout(J.back[0], J.back[1], S[14], -S[13], 0); putInT(put, w, TB); } }
  gears(put, G, 'back', TB, J.back[0], J.back[1], S[15] * 0.5, ga, wOn, 0);
  gears(put, G, 'hand2', TB, 0, 0, 0, ga, wOn, -1);
  rotAbout(J.neck[0], J.neck[1], S[1], S[2], 0); inP(TB); keep(TH);
  putT(put, S[19] > 0.5 && has(K.headO) ? K.headO : K.head, TH);
  gears(put, G, 'head', TH, 0, 0, 0, ga, wOn, -1); gears(put, G, 'mouth', TH, 0, 0, 0, ga, wOn, -1);
  if (has(K.wM) && wv > 0.5) putT(put, wv > 1.5 && has(K.wMA) ? K.wMA : K.wM, TH);
  for (let i = 0; i < G.length; i++) { const g = G[i]; if (g.at === 'feet') put(gt(g, ga, wOn), 1, 0, 0, 1, 0, 0); }
  gears(put, G, 'back', TB, J.back[0], J.back[1], S[15] * 0.5, ga, wOn, 1);   // the shell closed: over everything
}
/** Leg i (0 NF, 1 FF, 2 NH, 3 FH): the part painted at the fore hip of its side, moved to hip i, carried by the body. */
function leg4(J, tok, i, S, put) {
  if (!has(tok)) return;
  const H = J.hips, hx = H[i][0], hy = H[i][1], px = H[i & 1][0], py = H[i & 1][1];
  const Hx = TB.a * hx + TB.c * hy + TB.e, Hy = TB.b * hx + TB.d * hy + TB.f;
  squashAbout(px, py, 1, S[9 + i], S[5 + i]);
  M.e += Hx - px; M.f += Hy - py;
  put(tok, M.a, M.b, M.c, M.d, M.e, M.f);
}
const TROT = [0, PI, PI, 0], GALL = [0, 0.55, 2.7, 3.25];   // footfall phase offsets NF FF NH FH: trot pairs, gallop
/** Leg angles / squash / bob for a gait (S4 5..12, 22). th = gait phase, amp = 0..1 walking, gal = 0..1 gallop. */
function legsOf4(J, gait, th, amp, gal, t, lift) {
  const S = S4, L = J.legL;
  const ground = cl((L - lift) / L, 0.45, 1.4);
  S[22] = 0;
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    let a = 0, k = ground;
    switch (gait) {
      case 2: a = front ? -1.15 : 1.1; k = 0.9; break;                                        // pounce tuck
      case 3: a = front ? -0.5 : 0.55; k = 0.55; break;                                       // crouch (knees folded)
      case 4: a = front ? -0.15 : -1.35; k = front ? ground : 0.6; break;                     // sit (hind folded under)
      case 5: a = front ? -1.45 : 1.45; k = 1; break;                                         // lie: legs out front and back
      case 6: a = (front ? 0.25 : 0.4) + 0.12 * Math.sin(t * 3 + i); k = 0.9; break;          // dangle
      case 7: a = (front ? -0.9 : 0.9) + 0.35 * Math.sin(t * 13 + i * 1.9); k = 1; break;     // flail
      default: {   // trot: diagonal pairs; gallop: fore pair reaches forward as the hind pair kicks back
        const aT = -MK.qWalk * Math.sin(th + TROT[i]), aG = -MK.qRun * Math.sin(th + GALL[i]);
        a = amp * (aT + (aG - aT) * gal);
        const sw = Math.cos(th + (gal > 0.5 ? GALL[i] : TROT[i]));
        k = ground * (1 - MK.qFold * amp * (sw > 0 ? sw : 0));
      }
    }
    S[5 + i] = a; S[9 + i] = k;
  }
  if (gait === 0 || gait === 1) S[22] = -amp * MK.qBob * (L / 8) * Math.abs(Math.cos(th));
}
/** Fill S4 from a pose vector V (no springs). th = gait phase for walk frames (amp 1), or -1 standing. */
export function pose4(J, V, th = -1) {
  const S = S4;
  S[0] = V[V4.pitch]; S[1] = V[V4.ha]; S[2] = V[V4.hx]; S[3] = V[V4.li]; S[4] = V[V4.ta]; S[13] = V[V4.wr]; S[14] = V[V4.wn]; S[15] = V[V4.fl];
  S[16] = V[V4.sq]; S[17] = V[V4.re]; S[18] = V[V4.wv]; S[19] = V[V4.ho]; S[20] = V[V4.ga]; S[21] = 0;
  legsOf4(J, V[V4.gait] | 0, th < 0 ? 0 : th, th < 0 ? 0 : 1, 0, 0, S[3]);
  S[5] += V[V4.pw];
  return S;
}

// ---------------------------------------------------------------- 'mine4' driver
function alive4(ent, rp, u, I) {
  const X = ent.e.rig._X;
  if (!X) return false;
  const s = I.slot, now = I.now, b = u.b, J = X.J;
  let code = b ? b.act | 0 : 0; if (code < 0 || code >= ACTN) code = 0;
  const K = kOf(ent, X);
  if (code === A_UNDER) { if (!has(K.mound)) return false; RIG.put(K.mound, 1, 0, 0, 1, 0, 0); return true; }
  if (fresh(s, u, now)) {
    const V = X.idle;
    PH[s] = I.ph * 2 * PI; LC[s] = I.cyc; AMP[s] = I.moving ? 1 : 0; GAL[s] = 0; LZ[s] = I.z;
    setAngle(s, 0, V[V4.pitch]); setAngle(s, 2, V[V4.ha]); setAngle(s, 3, V[V4.ta]);
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const air = I.z > 1, flyer = X.flies && air;
  const atk = u.attack > 0 ? u.attack : 0;
  const e = target(X, code, I.moving && !air, atk, DISC4, V4.N);
  if (e < 0 && code === 0 && X.wind && u.state === 2 && u.cooldown > 0 && u.cooldown < X.windT) { const A = X.A0[0]; for (let i = 0; i < V4.N; i++) TG[i] = A[i]; }
  if (code === A_COMBO && X.A0[A_COMBO]) { const A = (Math.floor((now - (b.actT || 0)) * MK.combo) & 1) ? X.A0[A_COMBO] : X.A1[A_COMBO]; for (let i = 0; i < V4.N; i++) TG[i] = A[i]; }
  if (code === A_FIRE || code === A_SPRAY || code === A_BEAM) TG[V4.wn] += MK.jit * Math.sin(now * 57 + I.ph * 9);
  ladleView(X, u, TG, V4.wv);
  anchorView(X, u, TG, V4.wv);   // STEP8 (lead)
  stompPhase(X, u, code, TG, V4.N);
  // gait phase + walk amount + gallop blend
  const vx = u.vx || 0, vy = u.vy || 0, sp = Math.sqrt(vx * vx + vy * vy);
  let gait = TG[V4.gait] | 0;
  if (air && gait < 2) gait = flyer ? 6 : 7;
  let dc = I.cyc - LC[s]; LC[s] = I.cyc;
  if (!(dc > 0 && dc < 3)) dc = 0;
  let amp = AMP[s], gal = GAL[s];
  const walkSp = (u.def && u.def.walkSpeed) || 80;
  if (dt > 0) {
    amp += ((I.moving && gait < 2 ? 1 : 0) - amp) * Math.min(1, dt * 7);
    gal += ((gait === 1 || sp > walkSp * MK.galOver ? 1 : 0) - gal) * Math.min(1, dt * 5);
    AMP[s] = amp; GAL[s] = gal;
  }
  let th = PH[s] + dc * PI * (1 - gal * 0.45);
  if (th > 200) th -= 64 * PI;
  PH[s] = th;
  if (dt > 0) {
    const ax = In.ax * dt;
    kick(s, 0, -ax * 0.0008); kick(s, 2, -ax * 0.0016); kick(s, 3, ax * 0.0018);
    if (In.hit) { const h = In.hit * (2.4 + 7 * In.hitPow) * X.hitK; kick(s, 0, h); kick(s, 1, 26 + 40 * In.hitPow); kick(s, 2, 1.3 * h); kick(s, 3, -1.6 * h); }
    if (In.atkStart) { kick(s, 0, -1); kick(s, 6, 40); }
    if (LZ[s] > 1 && !air) { kick(s, 1, 70); kick(s, 2, 3); kick(s, 3, 2); }
  }
  LZ[s] = I.z;
  const S = S4, t = now + I.ph * 6;
  const s2 = Math.sin(2 * th), nod = amp * MK.qNod * s2;
  S[0] = spring(s, 0, TG[V4.pitch] + amp * 0.03 * s2, MK.pitch, dt, 0.9);
  S[3] = spring(s, 1, TG[V4.li], MK.qbob, dt, 12);
  S[1] = spring(s, 2, TG[V4.ha] + nod, MK.qhead, dt, 1.3);
  S[2] = spring(s, 6, TG[V4.hx], MK.lunge, dt, 8);
  S[4] = spring(s, 3, TG[V4.ta] + amp * MK.qWag * Math.sin(th * 1 + 1.3) + gal * 0.3 + (air && !flyer ? 0.5 * Math.sin(t * 11) : 0), MK.tail, dt, 1.6);
  const paw = spring(s, 4, TG[V4.pw], MK.paw, dt, 2.2);
  S[13] = spring(s, 5, TG[V4.wr], MK.recoil, dt, 8);
  S[14] = spring(s, 7, TG[V4.wn], MK.wpn, dt, 1.6);
  S[17] = spring(s, 8, TG[V4.re], MK.rot, dt, 1.2);
  S[15] = spring(s, 9, TG[V4.fl] + (flyer && X.wings ? MK.flapA * Math.sin(now * MK.flapW + I.ph * 6) : 0), MK.flap, dt, 1.6);
  S[16] = spring(s, 10, TG[V4.sq], MK.puff, dt, 0.6);
  S[18] = TG[V4.wv]; S[19] = TG[V4.ho]; S[20] = TG[V4.ga] > 0.5 || (flyer && X.moveGear) || code >= 20 ? 1 : 0;
  S[21] = has(K.wisp) ? 0.15 * Math.sin(t * 3) : 0; S[23] = X.hideTail ? 1 : 0;
  legsOf4(J, gait, th, amp, gal, t, S[3]);
  S[5] += paw;
  GS.code = code; GS.air = air ? 1 : 0;
  emit4(J, K, K.G, S, RIG.put);
  GS.code = -1;
  if (!finiteOut(s)) return false;
  AID[s] = u.id; anchors4(AP, s * ANCHOR_N, X, J, S);
  return true;
}
// Dead: worked out upright, then flipped onto its back (the dead parts are painted on their back: y -> -deadH - y).
function body4(ent, rp, id, t, air, now) {
  const X = ent.e.rig._X;
  if (!X) return false;
  const S = S4, J = X.J, K = kOf(ent, X);
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    S[5 + i] = air ? (front ? -0.35 : 0.35) + 0.45 * Math.sin(now * 12.5 + i * 1.7 + h01(id, i) * 6) : flop((front ? -1 : 1) * (0.2 + 0.7 * h01(id, i)), t);
    S[9 + i] = 1;
  }
  S[0] = air ? 0.15 * Math.sin(now * 7) : flop((h01(id, 5) - 0.5) * 0.12, t);
  S[1] = air ? 0.4 * Math.sin(now * 10) : flop(-0.25 - 0.4 * h01(id, 6), t); S[2] = 0; S[3] = 0; S[22] = 0;
  S[4] = air ? 0.6 * Math.sin(now * 9) : flop((h01(id, 7) - 0.5) * 1.2, t);
  S[13] = 0; S[14] = flop(0.2, t); S[15] = 0; S[16] = 0; S[17] = 0; S[18] = X.idle[V4.wv] > 0.5 ? 1 : 0; S[19] = 0; S[20] = 0; S[21] = 0; S[23] = X.hideTail ? 1 : 0;
  const n0 = OUT.n;
  emit4(J, K, K.G, S, RIG.put);
  const h = J.deadH, m = OUT.m;
  for (let i = n0; i < OUT.n; i++) {
    const o = i * 6, bb = m[o + 1], c = m[o + 2], d = m[o + 3], e = m[o + 4], f = m[o + 5];
    m[o + 1] = -bb; m[o + 2] = -c; m[o + 4] = e - c * h; m[o + 5] = -h - f + d * h;
  }
  return true;
}
register('mine4', { alive: alive4, body: body4 });
