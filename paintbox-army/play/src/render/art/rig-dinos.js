// dinos tab floppy-body drivers (Part 2 step 4, OURS). Owner: DINOS-ART. Contract: RIG.md; parts + joints: sprites-dinos.js.
//   'dino'   every dinosaur that walks (raptor, spitter, trex bipeds; trike, stego, ankylo, longneck quadrupeds): legs swing
//            about their hips on the stride (biped steps / diagonal trot / gallop), the body pitches + bobs on springs (big ones
//            bounce on every footfall and jiggle when they land), the head lags on its neck spring (a longneck's two-piece neck
//            sways after the body), the jaw snaps open on a stiff spring, the tail is a 2-3 piece chain that swings after the
//            body (each piece lags the one before), tiny arms flap. Entering an action pose kicks the springs (roar throws the
//            head back, the tail swipe / club whips the tail, the stomp drops the body, the leap flings the tail).
//            Dead: legs splay limp, head lolls, tail flops, then flipped onto its back (the dead parts are painted on their back).
//   'ptero'  the pterodactyl: wings flap about the shoulders (hard when carrying), glide wobble, wings swept back in the dive,
//            body bobs against the wingbeat, head + tail + dangling legs on springs.
// emit() is shared with the painter (sprites-dinos.js paints every whole pose through it, so whole sprites and parts agree).
// No allocation per unit per frame: typed arrays, scratch matrices, one fixed-shape pose object.
import * as RIG from './rig.js';
const { fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, putIn, inP, flop, h01, register, M, OUT } = RIG;
export const ready = true;
const PI = Math.PI;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping]: damping ratio c / (2 sqrt k) ~ 0.2-0.3 (they overshoot 2-3 times). Kicks: rad/s (bob: px/s).
// Angles: + = clockwise on screen in the facing-right frame (body nose down, head down, a leg's foot back, a tail up).
const BASE = {
  K: { pitch: [120, 5.6], bob: [180, 6.4], head: [150, 4.6], jaw: [330, 8.5], t0: [70, 3.6], t1: [52, 2.8], t2: [40, 2.3],
    n0: [60, 3], n1: [50, 2.5], arm: [90, 3], lunge: [240, 9.5] },
  lim: { pitch: 0.7, head: 1.1, tail: 1.3, neck: 1.1 },
  walkA: 0.45, runA: 0.9, galA: [0.9, 0.9], galO: [-0.1, 0.06], fold: 0.3, walkV: 60, galV: 1e9,   // legs: swing (rad), fold on the swing
  bob: 0.8, rock: 0.04, nod: 0.06, wag: 0.12, wagLag: 0.9, sway: 0.05, swayW: 1.3, breathe: 0.25, armSwing: 0.25,
  accel: 0.0009, accelHead: 0.0016, accelTail: 0.002, accelNeck: 0.0014, accelArm: 0.003,   // rad/s per px/s² a frame
  hit: 2.4, hitPow: 7, hitBob: 25, hitHead: 1.4, hitTail: -1.6, hitNeck: 1.2,                 // a blow along the body
  atkJaw: 7, atkHead: 1.5, atkLunge: 60,                                                     // an attack starting
  step: 0, stepHead: 0, stepNeck: 0, stepTail: 0, land: 60, ease: 6,                         // footfalls (heavy), landing jolt
  dLeg: [0.25, 0.7], dHead: [0.35, 0.4], dTail: 0.5, dJaw: [0.25, 0.35], dNeck: [0.3, 0.5],  // dead: limp rest angles
};
const OVR = {
  raptor: { walkA: 0.55, runA: 1.05, fold: 0.35, wag: 0.1, bob: 0.9, nod: 0.08, walkV: 70 },
  spitter: { walkA: 0.5, runA: 0.95, fold: 0.32, wag: 0.12, bob: 0.8, nod: 0.08, walkV: 60 },
  trex: { K: { pitch: [70, 4.2], bob: [110, 4.4], head: [90, 3.6], jaw: [260, 7.5], t0: [42, 2.6], t1: [32, 2], t2: [26, 1.7], n0: [60, 3], n1: [50, 2.5], arm: [70, 2.2], lunge: [150, 7.5] },
    walkA: 0.42, runA: 0.62, fold: 0.25, bob: 1.6, rock: 0.05, nod: 0.05, wag: 0.1, walkV: 45, hit: 0.9, hitPow: 3, hitBob: 18,
    step: 26, stepHead: 0.9, stepTail: 0.7, land: 120, atkLunge: 50, armSwing: 0.4, dLeg: [0.15, 0.5] },
  trike: { K: { pitch: [90, 4.6], bob: [150, 5.6], head: [110, 4], jaw: [330, 8.5], t0: [60, 3.2], t1: [46, 2.5], t2: [40, 2.3], n0: [60, 3], n1: [50, 2.5], arm: [90, 3], lunge: [200, 8.5] },
    walkA: 0.38, runA: 0.6, galA: [0.95, 0.9], galO: [-0.12, 0.1], fold: 0.3, bob: 0.9, walkV: 40, galV: 100, hit: 1.4, hitPow: 4,
    step: 10, stepHead: 0.5, land: 90, atkHead: -3, atkLunge: 40 },
  stego: { K: { pitch: [90, 4.6], bob: [150, 5.6], head: [140, 4.4], jaw: [330, 8.5], t0: [50, 2.8], t1: [36, 2.1], t2: [30, 1.8], n0: [60, 3], n1: [50, 2.5], arm: [90, 3], lunge: [220, 9] },
    walkA: 0.34, fold: 0.28, bob: 0.9, walkV: 30, hit: 1.3, hitPow: 4, step: 9, stepTail: 0.6, wag: 0.16, land: 90 },
  ankylo: { K: { pitch: [110, 5.4], bob: [170, 6], head: [150, 4.6], jaw: [330, 8.5], t0: [48, 2.7], t1: [34, 2], t2: [30, 1.8], n0: [60, 3], n1: [50, 2.5], arm: [90, 3], lunge: [220, 9] },
    walkA: 0.4, fold: 0.25, bob: 0.5, walkV: 26, hit: 0.7, hitPow: 2.4, hitBob: 14, step: 6, stepTail: 0.8, wag: 0.22, land: 70 },
  longneck: { K: { pitch: [55, 3.6], bob: [90, 4], head: [80, 3], jaw: [330, 8.5], t0: [32, 2.2], t1: [24, 1.7], t2: [20, 1.4], n0: [34, 2.2], n1: [28, 1.7], arm: [90, 3], lunge: [160, 7.5] },
    walkA: 0.3, fold: 0.22, bob: 1.4, rock: 0.025, nod: 0.04, walkV: 30, hit: 0.35, hitPow: 1.2, hitBob: 10, hitNeck: 2.2, hitHead: 2,
    step: 30, stepHead: 0.6, stepNeck: 0.5, stepTail: 0.5, wag: 0.1, sway: 0.06, swayW: 0.9, land: 140, accelNeck: 0.003, dNeck: [0.45, 0.5], dLeg: [0.1, 0.35] },
};
export const DN = {};
for (const k of ['raptor', 'spitter', 'trex', 'trike', 'stego', 'ankylo', 'longneck']) DN[k] = Object.assign({}, BASE, OVR[k], { K: Object.assign({}, BASE.K, (OVR[k] || {}).K) });
export const PT = {   // the pterodactyl
  K: { pitch: [90, 4.2], bob: [120, 4.6], head: [140, 4.2], tail: [55, 2.4], wing: [110, 3.6], legs: [50, 2.4], sweep: [70, 5] },
  farW: 0.6,                                                               // the far wing spread this much further forward (rad)
  hz: 3.2, amp: 0.55, hardHz: 4.6, hardAmp: 0.75, lag: 0.25, bob: 1.6,   // wingbeat (Hz, rad); body bobs against it (px)
  glideW: 1.7, glideA: 0.06,                                              // gliding: a slow wobble of the wings
  accel: 0.0008, hit: 1.6, hitPow: 6, wingHit: 3, land: 50,
  dWing: [-0.95, 2.2, 0.25],   // dead: near wing back, far wing forward (flat on the ground once flipped), +- spread
};

// ---------------------------------------------------------------- joints (from the painters) -> one fixed-shape object
// rig.joints: { pivot: [x, y], legs: [[hipX, hipY, paintHipX, paintHipY, len], ...] (near (fore), far (fore), near hind,
// far hind), tail: [[x, y] joint of piece 0, 1, 2], neck: [[x, y] joint of neck piece 0, 1], head: [x, y], jaw: [x, y],
// arms: [[near x, y], [far x, y]], wing: [x, y] (shoulder), plan: ['aF', 'l1', 'tail', 'body', 'l0', 'head', 'aN', ...],
// deadH } — plan tokens: l0..l3 legs, tail (chain, tip first), body, head (neck chain, jaw, head, head fx), aN / aF arms,
// wB / wF wings, tfx (on the tail root), gfx (on the ground), bfx (on the body).
const TOK = { l0: 0, l1: 1, l2: 2, l3: 3, tail: 4, body: 5, head: 6, aN: 7, aF: 8, wB: 9, wF: 10, tfx: 11, gfx: 12, bfx: 13 };
export function resolveJ(j) {
  if (j._R) return j._R;
  const z2 = [0, 0], legs = j.legs || [], tail = j.tail || [], neck = j.neck || [];
  const R = {
    pvx: j.pivot[0], pvy: j.pivot[1], nL: legs.length, legs: new Float64Array(20), nT: tail.length, t: new Float64Array(6), nN: neck.length, n: new Float64Array(4),
    hx: (j.head || z2)[0], hy: (j.head || z2)[1], jx: (j.jaw || z2)[0], jy: (j.jaw || z2)[1],
    sNx: ((j.arms || [])[0] || z2)[0], sNy: ((j.arms || [])[0] || z2)[1], sFx: ((j.arms || [])[1] || z2)[0], sFy: ((j.arms || [])[1] || z2)[1],
    wx: (j.wing || z2)[0], wy: (j.wing || z2)[1], plan: Int8Array.from(j.plan.map((t) => TOK[t])), deadH: j.deadH || 20,
  };
  legs.forEach((l, i) => { for (let k = 0; k < 5; k++) R.legs[i * 5 + k] = l[k]; });
  tail.forEach((p, i) => { R.t[i * 2] = p[0]; R.t[i * 2 + 1] = p[1]; });
  neck.forEach((p, i) => { R.n[i * 2] = p[0]; R.n[i * 2 + 1] = p[1]; });
  return (j._R = R);
}

// ---------------------------------------------------------------- the pose (one fixed-shape object) + emit
// P: pitch (body, about the pivot), lift (px, + = down), head, hx (head lunge px), jaw, n0 / n1 (neck pieces), t0..t2 (tail
// pieces, each inside its parent), aN / aF (arms), wB / wF (wings), L[i] (leg angle), S[i] (leg length scale), comp (feet
// stay down when the body dips), gb (the gait's own bob, not taken up by the legs).
export const P = { pitch: 0, lift: 0, head: 0, hx: 0, jaw: 0, n0: 0, n1: 0, t0: 0, t1: 0, t2: 0, aN: 0, aF: 0, wB: 0, wF: 0, L: new Float64Array(4), S: new Float64Array(4), comp: 0, gb: 0 };
export function resetP(p = P) {
  p.pitch = p.lift = p.head = p.hx = p.jaw = p.n0 = p.n1 = p.t0 = p.t1 = p.t2 = p.aN = p.aF = p.wB = p.wF = 0; p.comp = 0; p.gb = 0;
  for (let i = 0; i < 4; i++) { p.L[i] = 0; p.S[i] = 1; }
  return p;
}
const mat = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const TB = mat(), T0 = mat(), T1 = mat(), T2 = mat(), N0 = mat(), N1 = mat(), TH = mat();
let PUT = RIG.put;
const ok = (p) => p !== -1 && p !== null && p !== undefined;
const out = (p, T) => { if (ok(p)) PUT(p, T.a, T.b, T.c, T.d, T.e, T.f); };
const outIn = (p, T) => { if (ok(p)) PUT(p, T.a * M.a + T.c * M.b, T.b * M.a + T.d * M.b, T.a * M.c + T.c * M.d, T.b * M.c + T.d * M.d, T.a * M.e + T.c * M.f + T.e, T.b * M.e + T.d * M.f + T.f); };
/** Output every part of rp in J.plan order, posed by p (part -> matrix in entry units). */
export function emit(J, rp, p) {
  rotAbout(J.pvx, J.pvy, p.pitch, 0, p.lift); keep(TB);
  const plan = J.plan, lg = J.legs;
  for (let k = 0; k < plan.length; k++) {
    const c = plan[k];
    if (c < 4) {
      const pi = c === 0 ? rp.l0 : c === 1 ? rp.l1 : c === 2 ? rp.l2 : rp.l3;
      if (!ok(pi)) continue;
      const o = c * 5, hx = lg[o], hy = lg[o + 1], px = lg[o + 2], py = lg[o + 3], L = lg[o + 4];
      const Hx = TB.a * hx + TB.c * hy + TB.e, Hy = TB.b * hx + TB.d * hy + TB.f;   // the hip, carried by the body
      let s = p.S[c];
      if (p.comp) s *= cl((L - (Hy - hy - p.gb)) / L, 0.6, 1.3);
      squashAbout(px, py, 1, s, p.L[c]);
      PUT(pi, M.a, M.b, M.c, M.d, M.e + Hx - px, M.f + Hy - py);
    } else if (c === 4) {   // tail chain: deepest piece first (each root covers the joint)
      if (J.nT < 1) continue;
      const t = J.t;
      rotAbout(t[0], t[1], p.t0); inP(TB); keep(T0);
      if (J.nT > 1) { rotAbout(t[2], t[3], p.t1); inP(T0); keep(T1); }
      if (J.nT > 2) { rotAbout(t[4], t[5], p.t2); inP(T1); keep(T2); out(rp.t2, T2); }
      if (J.nT > 1) out(rp.t1, T1);
      out(rp.t0, T0);
    } else if (c === 5) out(rp.body, TB);
    else if (c === 6) {   // neck pieces, then the lower jaw, the head, its fx
      let Pa = TB;
      const n = J.n;
      if (J.nN > 0) { rotAbout(n[0], n[1], p.n0); inP(TB); keep(N0); out(rp.n0, N0); Pa = N0; }
      if (J.nN > 1) { rotAbout(n[2], n[3], p.n1); inP(N0); keep(N1); out(rp.n1, N1); Pa = N1; }
      rotAbout(J.hx, J.hy, p.head, p.hx, 0); inP(Pa); keep(TH);
      if (ok(rp.jaw)) { rotAbout(J.jx, J.jy, p.jaw); outIn(rp.jaw, TH); }
      out(rp.head, TH);
      out(rp.hfx, TH);
    } else if (c === 7) { if (ok(rp.aN)) { rotAbout(J.sNx, J.sNy, p.aN); outIn(rp.aN, TB); } }
    else if (c === 8) { if (ok(rp.aF)) { rotAbout(J.sFx, J.sFy, p.aF); outIn(rp.aF, TB); } }
    else if (c === 9) { if (ok(rp.wB)) { rotAbout(J.wx, J.wy, p.wB); outIn(rp.wB, TB); } }
    else if (c === 10) { if (ok(rp.wF)) { rotAbout(J.wx, J.wy, p.wF); outIn(rp.wF, TB); } }
    else if (c === 11) { if (ok(rp.tfx) && J.nT > 0) { rotAbout(J.t[0], J.t[1], p.t0); outIn(rp.tfx, TB); } }
    else if (c === 12) { if (ok(rp.gfx)) PUT(rp.gfx, 1, 0, 0, 1, 0, 0); }
    else if (c === 13) out(rp.bfx, TB);
  }
}
/** emit() into another sink (the painter): fn(part, a, b, c, d, e, f). */
export function emitWith(J, rp, p, fn) { const old = PUT; PUT = fn; try { emit(J, rp, p); } finally { PUT = old; } }
/** Flip every part output since n0 onto its back: M' = F M F, F: y -> -h - y (the dead parts are painted on their back). */
function onBack(n0, h) {
  const m = OUT.m;
  for (let i = n0; i < OUT.n; i++) {
    const o = i * 6, b = m[o + 1], c = m[o + 2], d = m[o + 3], e = m[o + 4], f = m[o + 5];
    m[o + 1] = -b; m[o + 2] = -c; m[o + 4] = e - c * h; m[o + 5] = -h - f + d * h;
  }
}

// ---------------------------------------------------------------- per-slot memory (own arrays; reset with fresh())
const NS = 32768;
const AMP = new Float32Array(NS), GAL = new Float32Array(NS), LC = new Float32Array(NS), PH = new Float32Array(NS), LZ = new Float32Array(NS);
const STEP = new Int32Array(NS), CODE = new Int16Array(NS);
// springs (of the slot's 12): 0 pitch, 1 bob (px), 2 head, 3 jaw, 4 t0, 5 t1, 6 t2, 7 n0, 8 n1, 9 arms, 10 head lunge (px)
const TROT = [1, -1, -1, 1];                       // diagonal pairs (near fore + far hind together)
const GALP = [0, 0.55, 0.3, 0.85];                 // gallop footfall offsets (rad): near fore, far fore, near hind, far hind
const GC = GALP.map(Math.cos), GS = GALP.map(Math.sin);
const BIP = [1, -1];

// ---------------------------------------------------------------- 'dino' alive
// rp numbers (entry rig.parts(pose)): gait (0 hold the pose's legs, 1 walk / trot (gallop above galV), 2 gallop, 3 legs
// flung / tucked (leap) with a flail in the air), pitch, lift, ha (head), hx, ja (jaw), na0 / na1 (neck), ta0..ta2 (tail), arm, la (leg angles
// held in gait 0 / 3, added to the stride otherwise: la = [4 numbers]), lf (leg fold 0..1: [4 numbers]), code (pose id: a change kicks), kp, kb, kh,
// kt, kn (kicks on entering the pose: pitch, bob px/s, head, tail, neck), shake (head shakes side to side: rad).
function dinoAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = DN[rg.q] || DN.raptor, K = D.K, s = I.slot, now = I.now;
  const st = Math.floor(I.cyc), air = I.z > 1;
  if (fresh(s, u, now)) {
    AMP[s] = I.moving ? 1 : 0; GAL[s] = rp.gait === 2 ? 1 : 0; LC[s] = I.cyc; PH[s] = I.ph * 2 * PI; LZ[s] = I.z; STEP[s] = st; CODE[s] = rp.code;
    setAngle(s, 0, rp.pitch); setAngle(s, 1, rp.lift); setAngle(s, 2, rp.ha); setAngle(s, 3, rp.ja); setAngle(s, 4, rp.ta0); setAngle(s, 5, rp.ta1);
    setAngle(s, 6, rp.ta2); setAngle(s, 7, rp.na0); setAngle(s, 8, rp.na1); setAngle(s, 9, rp.arm); setAngle(s, 10, rp.hx);
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const vx = u.vx || 0, vy = u.vy || 0, sp = Math.sqrt(vx * vx + vy * vy);
  let gait = rp.gait;
  if (gait === 1 && sp > D.galV && J.nL === 4) gait = 2;
  // stride phase (strides walked: a full leg cycle = 2) + eased swing amplitude + trot <-> gallop blend
  let dc = I.cyc - LC[s]; LC[s] = I.cyc;
  if (!(dc > 0 && dc < 3)) dc = 0;
  let amp = AMP[s], gal = GAL[s];
  if (dt > 0) {
    const e = Math.min(1, dt * D.ease);
    amp += ((I.moving && (gait === 1 || gait === 2) && !air ? 1 : 0) - amp) * e; gal += ((gait === 2 ? 1 : 0) - gal) * e;
    AMP[s] = amp; GAL[s] = gal;
  }
  let th = PH[s] + dc * PI;
  if (th > 200) th -= 64 * PI;
  PH[s] = th;
  // kicks: speeding up tips the body back and swings head, tail, neck; blows; attacks; pose changes; footfalls; landing
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 2, -a * D.accelHead); kick(s, 4, a * D.accelTail); kick(s, 5, a * D.accelTail * 1.3);
    kick(s, 7, -a * D.accelNeck); kick(s, 8, -a * D.accelNeck * 1.3); kick(s, 9, a * D.accelArm);
    if (In.hit) {
      const h = In.hit * (D.hit + D.hitPow * In.hitPow);
      kick(s, 0, h); kick(s, 1, D.hitBob * (0.6 + In.hitPow)); kick(s, 2, D.hitHead * h); kick(s, 3, 3 * Math.abs(h));
      kick(s, 4, D.hitTail * h); kick(s, 5, D.hitTail * h); kick(s, 7, D.hitNeck * h); kick(s, 8, D.hitNeck * h); kick(s, 9, 2 * h);
    }
    if (In.atkStart) { kick(s, 3, D.atkJaw); kick(s, 2, D.atkHead); kick(s, 10, D.atkLunge); }
    if (CODE[s] !== rp.code) { kick(s, 0, rp.kp); kick(s, 1, rp.kb); kick(s, 2, rp.kh); kick(s, 4, rp.kt); kick(s, 5, rp.kt * 1.3); kick(s, 6, rp.kt * 1.5); kick(s, 7, rp.kn); kick(s, 8, rp.kn * 1.3); }
    if (I.moving && !air && st !== STEP[s]) {
      const sg = st & 1 ? 1 : -1;
      kick(s, 1, D.step); kick(s, 2, D.stepHead); kick(s, 7, D.stepNeck); kick(s, 8, -D.stepNeck); kick(s, 4, D.stepTail * sg); kick(s, 5, -D.stepTail * sg);
    }
    if (LZ[s] > 1 && !air) { kick(s, 1, D.land); kick(s, 2, D.land * 0.03); kick(s, 4, -D.land * 0.04); kick(s, 5, -D.land * 0.05); kick(s, 7, D.land * 0.02); kick(s, 9, D.land * 0.05); }
  }
  CODE[s] = rp.code; STEP[s] = st; LZ[s] = I.z;
  // legs
  const sT = Math.sin(th), cT = Math.cos(th), nL = J.nL;
  const ka = cl(0.6 + 0.4 * sp / D.walkV, 0.6, 1.25), A = (I.run ? D.runA : D.walkA) * ka;
  for (let i = 0; i < nL; i++) {
    const front = nL === 2 || i < 2;
    let a = rp.la[i], f = rp.lf[i];
    if (gait === 3 || (air && gait !== 0)) {   // flung out / tucked, flailing a little while up
      if (air) a += 0.3 * Math.sin(now * 12 + i * 1.9 + I.ph * 6);
    } else if (amp > 0.002) {
      const k = nL === 2 ? BIP[i] : TROT[i], stp = sT * k, ctp = cT * k;
      let aw = -A * stp, fw = ctp > 0 ? ctp : 0;
      if (gal > 0.002) {
        const sg = front ? -1 : 1, sgp = sT * GC[i] + cT * GS[i], cgp = cT * GC[i] - sT * GS[i];
        const aG = sg * D.galA[front ? 0 : 1] * sgp + D.galO[front ? 0 : 1], fg = -sg * cgp, fG = fg > 0 ? fg : 0;
        aw += (aG - aw) * gal; fw += (fG - fw) * gal;
      }
      a += amp * aw; f = Math.max(f, amp * fw * D.fold);
    } else if (gait === 0 && !I.moving) a += 0.025 * Math.sin(I.rt * 1.5 + I.ph * 6.28 + i);
    P.L[i] = a; P.S[i] = 1 - f;
  }
  P.comp = air || gait === 3 ? 0 : 1;
  // body
  const ph = I.ph * 6.28, s2 = 2 * sT * cT;
  const gbob = air ? 0 : amp * -D.bob * (sT < 0 ? -sT : sT) * (nL === 2 ? 1 : 0.7);
  P.gb = gbob;
  P.pitch = spring(s, 0, rp.pitch + amp * D.rock * (nL === 2 ? s2 : cT), K.pitch, dt, D.lim.pitch);
  P.lift = spring(s, 1, rp.lift, K.bob, dt, 10) + gbob + (I.moving ? 0 : D.breathe * Math.sin(I.rt * 2.1 + ph));
  // head (nods with the stride, shakes holding), lunge, jaw
  const nod = amp * D.nod * Math.sin(2 * th + 0.7), shake = rp.shake ? rp.shake * Math.sin(now * 23 + ph) : 0;
  P.head = spring(s, 2, rp.ha + nod + shake, K.head, dt, D.lim.head);
  P.hx = spring(s, 10, rp.hx, K.lunge, dt, 8);
  P.jaw = ok(rp.jaw) ? Math.max(-0.04, spring(s, 3, rp.ja, K.jaw, dt, 1.2)) : 0;
  // tail: a wave down it on the stride, a slow sway standing, each piece lagging the one before
  let w0, w1, w2;
  if (I.moving) { w0 = amp * D.wag * Math.sin(th); w1 = amp * D.wag * Math.sin(th - D.wagLag); w2 = amp * D.wag * Math.sin(th - 2 * D.wagLag); }
  else { const k = I.rt * D.swayW + ph; w0 = D.sway * Math.sin(k); w1 = D.sway * Math.sin(k - 0.8); w2 = D.sway * Math.sin(k - 1.6); }
  if (air) { const k = now * 9 + ph; w0 += 0.25 * Math.sin(k); w1 += 0.3 * Math.sin(k - 0.7); }
  P.t0 = spring(s, 4, rp.ta0 + w0, K.t0, dt, D.lim.tail);
  P.t1 = spring(s, 5, rp.ta1 + w1 - 0.35 * (P.t0 - rp.ta0), K.t1, dt, D.lim.tail);
  P.t2 = J.nT > 2 ? spring(s, 6, rp.ta2 + w2 - 0.35 * (P.t1 - rp.ta1), K.t2, dt, D.lim.tail) : 0;
  // neck (longneck): sways slowly, the top piece lags the base
  if (J.nN > 0) {
    const ns = I.moving ? 0.03 * Math.sin(th + 1) : 0.04 * Math.sin(I.rt * 0.8 + ph);
    P.n0 = spring(s, 7, rp.na0 + ns, K.n0, dt, D.lim.neck);
    P.n1 = spring(s, 8, rp.na1 - 0.3 * (P.n0 - rp.na0) + ns * 0.6, K.n1, dt, D.lim.neck);
  } else { P.n0 = 0; P.n1 = 0; }
  // arms: swing with the stride, flap when hit
  const ar = ok(rp.aN) ? spring(s, 9, rp.arm + (I.moving ? D.armSwing * amp * sT : 0.04 * Math.sin(I.rt * 2.6 + ph)), K.arm, dt, 1.4) : 0;
  P.aN = ar; P.aF = ar * 0.8 - 0.1;
  P.wB = 0; P.wF = 0;
  emit(J, rp, P);
  return true;
}

// ---------------------------------------------------------------- 'dino' dead
// flailing while a body flies (no closure per call: the body's air / now / id sit in FL)
const FL = { air: false, now: 0, id: 0, w: 11 };
function fl(k, a) { return FL.air ? a * Math.sin(FL.now * FL.w + k * 1.7 + h01(FL.id, k) * 6) : 0; }
function dinoBody(ent, rp, id, t, air, now) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = DN[rg.q] || DN.raptor;
  const nL = J.nL; FL.air = air; FL.now = now; FL.id = id; FL.w = 11;
  for (let i = 0; i < nL; i++) {
    const front = nL === 2 ? i === 0 : i < 2;   // biped: near leg kicks forward, far leg back
    P.L[i] = air ? (front ? -0.4 : 0.4) + fl(i, 0.5) : flop((front ? -1 : 1) * (D.dLeg[0] + D.dLeg[1] * h01(id, i)), t);
    P.S[i] = 1;
  }
  P.comp = 0; P.gb = 0; P.lift = 0; P.hx = 0;
  P.pitch = air ? 0.12 * Math.sin(now * 7 + h01(id, 5) * 6) : flop((h01(id, 5) - 0.5) * 0.1, t);
  P.head = air ? fl(6, 0.5) : flop(D.dHead[0] + D.dHead[1] * h01(id, 6), t);
  P.jaw = air ? 0.3 + fl(7, 0.2) : flop(D.dJaw[0] + D.dJaw[1] * h01(id, 7), t);
  P.t0 = air ? fl(8, 0.4) : flop((h01(id, 8) - 0.5) * D.dTail, t);
  P.t1 = air ? fl(9, 0.5) : flop((h01(id, 9) - 0.5) * D.dTail * 1.2, t);
  P.t2 = air ? fl(10, 0.5) : flop((h01(id, 10) - 0.5) * D.dTail * 1.4, t);
  P.n0 = air ? fl(11, 0.4) : flop(D.dNeck[0] + D.dNeck[1] * h01(id, 11), t);
  P.n1 = air ? fl(12, 0.4) : flop(D.dNeck[0] * 0.6 + D.dNeck[1] * h01(id, 12), t);
  P.aN = air ? fl(13, 0.8) : flop((h01(id, 13) - 0.4) * 1.6, t); P.aF = P.aN * 0.7;
  P.wB = 0; P.wF = 0;
  const n0 = OUT.n;
  emit(J, rp, P);
  onBack(n0, J.deadH);
  return true;
}
register('dino', { alive: dinoAlive, body: dinoBody });

// ---------------------------------------------------------------- 'ptero'
// rp numbers: flap (0 hold the wings at wing, 1 wingbeat, 2 hard wingbeat), wing (rest angle of both wings), pitch, ha (head),
// ta0 (tail), lega (leg angle), code, kp / kh (kicks entering the pose). Springs: 0 pitch, 1 bob, 2 head, 3 tail, 4 near
// wing extra, 5 far wing extra, 6 legs dangle, 7 wing sweep (the pose's wing angle eased).
function pteroAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = PT, K = D.K, s = I.slot, now = I.now;
  if (fresh(s, u, now)) { setAngle(s, 0, rp.pitch); setAngle(s, 2, rp.ha); setAngle(s, 3, rp.ta0); setAngle(s, 6, rp.lega); setAngle(s, 7, rp.wing); CODE[s] = rp.code; LZ[s] = I.z; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 3, a * 0.002); kick(s, 6, a * 0.003);
    if (In.hit) { const h = In.hit * (D.hit + D.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, 30 * (0.5 + In.hitPow)); kick(s, 2, 1.5 * h); kick(s, 3, -1.6 * h); kick(s, 4, D.wingHit * h); kick(s, 5, D.wingHit * h); kick(s, 6, 2 * h); }
    if (In.atkStart) kick(s, 2, 2);
    if (CODE[s] !== rp.code) { kick(s, 0, rp.kp); kick(s, 2, rp.kh); kick(s, 4, rp.kw); kick(s, 5, rp.kw); }
    if (LZ[s] > 1 && I.z <= 1) { kick(s, 1, D.land); kick(s, 3, -2); }
  }
  CODE[s] = rp.code; LZ[s] = I.z;
  const ph = I.ph * 6.28;
  let beat = 0, beatB = 0, bob = 0;
  if (rp.flap) {
    const hz = rp.flap === 2 ? D.hardHz : D.hz, am = rp.flap === 2 ? D.hardAmp : D.amp, k = 2 * PI * hz * I.rt + ph;
    beat = am * Math.sin(k); beatB = am * 0.85 * Math.sin(k - D.lag); bob = D.bob * Math.cos(k) * (rp.flap === 2 ? 1.3 : 1);
  } else if (I.z > 1) { beat = D.glideA * Math.sin(I.rt * D.glideW + ph); beatB = D.glideA * Math.sin(I.rt * D.glideW + ph - 0.6); }
  const sweep = spring(s, 7, rp.wing, K.sweep, dt, 2);
  P.pitch = spring(s, 0, rp.pitch, K.pitch, dt, 0.9);
  P.lift = spring(s, 1, 0, K.bob, dt, 8) + bob;
  P.head = spring(s, 2, rp.ha + 0.05 * Math.sin(I.rt * 1.7 + ph), K.head, dt, 1);
  P.t0 = spring(s, 3, rp.ta0 + 0.15 * Math.sin(I.rt * 3 + ph) - 0.2 * beat, K.tail, dt, 1.2);
  P.wF = sweep + beat + spring(s, 4, 0, K.wing, dt, 0.8);
  P.wB = sweep + beatB + spring(s, 5, 0, K.wing, dt, 0.8) + D.farW;   // the far wing a beat behind, spread forward (a V)
  P.L[0] = spring(s, 6, rp.lega + (rp.flap ? 0.12 * Math.sin(2 * PI * D.hz * I.rt + ph - 1) : 0), K.legs, dt, 1.4); P.S[0] = 1;
  P.hx = 0; P.jaw = 0; P.n0 = 0; P.n1 = 0; P.t1 = 0; P.t2 = 0; P.aN = 0; P.aF = 0; P.comp = 0; P.gb = 0;
  emit(J, rp, P);
  return true;
}
function pteroBody(ent, rp, id, t, air, now) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints));
  FL.air = air; FL.now = now; FL.id = id; FL.w = 12;
  resetP();
  const W = PT.dWing;
  P.wF = air ? -0.4 + fl(1, 0.9) : flop(W[0] + W[2] * (h01(id, 1) - 0.5), t);
  P.wB = air ? 0.9 + fl(2, 0.9) : flop(W[1] + W[2] * (h01(id, 2) - 0.5), t);
  P.head = air ? fl(3, 0.5) : flop(0.3 + 0.4 * h01(id, 3), t);
  P.t0 = air ? fl(4, 0.5) : flop((h01(id, 4) - 0.5) * 0.8, t);
  P.L[0] = air ? fl(5, 0.8) : flop(-0.4 - 0.6 * h01(id, 5), t);
  P.pitch = air ? fl(6, 0.2) : 0;
  const n0 = OUT.n;
  emit(J, rp, P);
  onBack(n0, J.deadH);
  return true;
}
register('ptero', { alive: pteroAlive, body: pteroBody });
