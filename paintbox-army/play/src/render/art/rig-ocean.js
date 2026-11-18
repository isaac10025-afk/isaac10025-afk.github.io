// OCEAN tab floppy-body driver (OURS, Part 2 step 6, STEP6.md; contract RIG.md). Owner: OCEAN-ART. Parts, joints and pose
// numbers live in sprites-ocean.js (each entry's rig.joints + rig.parts()); emit() is shared with the painter there, so the
// whole sprites are the same parts put together with the same numbers (they always agree).
//   'sea'  every ocean animal on land (in deep water sprites-ocean.js drawUnit draws the whole water frames instead):
//          crab      six legs scuttle sideways in two ripples, the body rocks side to side, the eye stalks wobble on their own
//                    springs, the claws bob and snap (a pinch kicks the big claw forward and shuts its finger).
//          octopus   six tentacles wave in a travelling ripple about their roots, the soft head squashes and stretches on a
//                    spring (jiggles on every step and every blow), grabbing flings the tentacles forward, ink pulses it.
//          puffer    hops: up in the air stretched, lands squashed; tail fin wags, the little fin flaps; puffing up inflates
//                    with a big squash-and-wobble.
//          turtle    four stubby legs paddle (diagonal pairs), the shell rocks, the head bobs and pokes out on its neck spring,
//                    pulling into the shell sucks head + legs in (they shrink to their roots) and drops the shell.
//          walrus    gallumphs: the fat body humps up and squashes down on every flipper push (jiggle), the heavy head nods
//                    after it, the hind flippers drag and flap; the belly slide pitches it flat and flips the flippers back.
//          shark / eel / swordfish (stranded on land): the body arches and thrashes (tail chain whips, head counter-swings).
//          Every one: blows knock the body + head about, speed changes make the tail / tentacles lag. Dead: limbs splay limp,
//          tail flops, then flipped onto its back (legs up, belly up: the dead parts are painted on their back).
// No allocation per unit per frame: typed arrays, scratch matrices, one fixed-shape pose object.
import * as RIG from './rig.js';
const { fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, inP, flop, h01, register, M, OUT } = RIG;
export const ready = true;
const PI = Math.PI;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping], damping ratio c / (2 sqrt k) ~0.15-0.3 (they overshoot 2-3 times, TABS). Kicks: rad/s, bob px/s,
// squash 1/s. Angles: + = clockwise on screen in the facing-right frame (nose down, a leg's foot back, a tail up, a claw forward).
const BASE = {
  K: { pitch: [110, 5], bob: [170, 6], head: [140, 4.4], jaw: [320, 8.5], t0: [70, 3.2], t1: [52, 2.5], t2: [40, 2.1],
    arm: [120, 4.2], pin: [380, 9], sq: [190, 4.4], eye: [80, 2], hx: [200, 8] },
  lim: { pitch: 0.8, head: 1.1, tail: 1.4, arm: 1.6 },
  gait: 'paddle', cad: 1,                    // stride phase speed (x strides walked)
  A: 0.4, rock: 0.04, bob: 0.6, nod: 0.06, hump: 0, hopH: 0, wag: 0.12, wagLag: 0.9, sway: 0.05, swayW: 1.3, breathe: 0.025,
  lph: [0, PI, PI, 0, 0, PI, 0, PI],         // limb phase offsets (diagonal pairs)
  la0: [1, 1, 1, 1, 1, 1, 1, 1],             // limb swing amount multipliers
  accel: 0.0008, accelHead: 0.0015, accelTail: 0.0022, accelArm: 0.0025,
  hit: 2.2, hitPow: 7, hitBob: 22, hitHead: 1.4, hitTail: -1.6, hitSq: 3,
  atkJaw: 7, atkHead: 1.2, atkArm: -5, atkPin: -9, atkHx: 40, step: 0, stepSq: 0, land: 60, landSq: 4, ease: 6,
  thrash: 0, thrashW: 9,                     // stranded fish: arch + whip (rad, rad/s)
  dLimb: [0.3, 0.7], dHead: [0.25, 0.35], dTail: 0.6, dJaw: [0.2, 0.3], dArm: [0.4, 0.8],
};
const OVR = {
  crab: { gait: 'scuttle', cad: 2.2, A: 0.42, rock: 0.07, bob: 0.5, lph: [0, PI, 0, 0, 0, 0, 0, 0], la0: [1, 1, 0, 0, 0, 0, 0, 0], eyeL: 2,
    K: { eye: [70, 1.7], arm: [110, 3.6], pin: [420, 9] }, wag: 0, sway: 0.03, step: 10, hit: 2.6, hitPow: 8, atkArm: -7, atkPin: -12, dLimb: [0.5, 0.6] },
  octopus: { gait: 'wave', cad: 1.1, A: 0.32, rock: 0.03, bob: 0.4, lph: [0, 1.4, 2.8, 4.2, 0, 0, 0, 0], la0: [0.6, 1, 1, 1, 0, 0, 0, 0],
    K: { sq: [110, 2.6], head: [100, 3] }, step: 6, stepSq: 1.6, hitSq: 5, sway: 0.08, swayW: 1.7, breathe: 0.04, dLimb: [0.3, 0.5] },
  puffer: { gait: 'hop', cad: 1, hopH: 3.4, A: 0.3, wag: 0.25, K: { sq: [170, 3.6], t0: [90, 3] }, land: 50, landSq: 6, hitSq: 4, breathe: 0.03 },
  turtle: { gait: 'paddle', cad: 1, A: 0.42, rock: 0.05, bob: 0.4, nod: 0.08, K: { head: [110, 3.6], hx: [120, 5.5] }, step: 5, hit: 1.4, hitPow: 4, wag: 0.2 },
  walrus: { gait: 'paddle', cad: 0.9, A: 0.5, rock: 0.05, bob: 0.4, hump: 1.6, nod: 0.08, lph: [0, 0.6, PI, 0, 0, 0, 0, 0],
    K: { sq: [130, 3], head: [90, 3], pitch: [80, 4.2], bob: [120, 4.6], t0: [55, 2.4] }, step: 18, stepSq: 1.4, hit: 0.9, hitPow: 3, hitBob: 14, land: 90, wag: 0.25 },
  shark: { gait: 'flop', thrash: 0.2, thrashW: 7, K: { t0: [60, 2.8], t1: [45, 2.2] }, wag: 0.2, hit: 1.2, hitPow: 4 },
  eel: { gait: 'flop', thrash: 0.16, thrashW: 10, K: { t0: [60, 2.6], t1: [48, 2.1], t2: [38, 1.8] }, wag: 0.35, wagLag: 1.1, hit: 1.8, hitPow: 6 },
  swordfish: { gait: 'flop', thrash: 0.22, thrashW: 9, K: { t0: [65, 2.8], t1: [48, 2.2] }, wag: 0.25, hit: 1.6, hitPow: 5 },
};
export const OC = {};
for (const k in OVR) OC[k] = Object.assign({}, BASE, OVR[k], { K: Object.assign({}, BASE.K, OVR[k].K || {}) });

// ---------------------------------------------------------------- joints -> one fixed-shape object
// rig.joints: { pivot: [x, y], tail: [[x, y] joint of piece 0, 1, 2], head: [x, y], jaw: [x, y], limbs: [[x, y] l0..l7],
// arms: [[near x, y], [far x, y]], pin: [[near finger hinge], [far finger hinge]], swap (fN / fF = the whole arm with its claw
// shut, drawn instead of aN / aF when the finger angle passes -0.22: one part fewer), plan: [tokens], deadH }.
// Plan tokens: l0..l7 limbs, tail (chain, tip first), body, head (jaw, head, head fx), aN / aF (arm + its finger),
// bfx / b2 (in the body's frame), gfx (on the ground, unturned).
const TOK = { l0: 0, l1: 1, l2: 2, l3: 3, l4: 4, l5: 5, l6: 6, l7: 7, tail: 8, body: 9, head: 10, aN: 11, aF: 12, bfx: 13, gfx: 14, b2: 15 };
export function resolveJ(j) {
  if (j._R) return j._R;
  const z2 = [0, 0], tail = j.tail || [], limbs = j.limbs || [], arms = j.arms || [], pin = j.pin || [];
  const R = {
    pvx: j.pivot[0], pvy: j.pivot[1], nT: tail.length, t: new Float64Array(6), hx: (j.head || z2)[0], hy: (j.head || z2)[1],
    jx: (j.jaw || z2)[0], jy: (j.jaw || z2)[1], nL: limbs.length, lj: new Float64Array(16), aj: new Float64Array(4), pj: new Float64Array(4),
    plan: Int8Array.from(j.plan.map((t) => TOK[t])), deadH: j.deadH || 16, swap: j.swap ? 1 : 0,
  };
  tail.forEach((p, i) => { R.t[i * 2] = p[0]; R.t[i * 2 + 1] = p[1]; });
  limbs.forEach((p, i) => { R.lj[i * 2] = p[0]; R.lj[i * 2 + 1] = p[1]; });
  arms.forEach((p, i) => { R.aj[i * 2] = p[0]; R.aj[i * 2 + 1] = p[1]; });
  pin.forEach((p, i) => { R.pj[i * 2] = p[0]; R.pj[i * 2 + 1] = p[1]; });
  return (j._R = R);
}

// ---------------------------------------------------------------- the pose (one fixed-shape object) + emit
// P: pitch (body about the pivot), lift (px, + = down), lx (px forward), sq (squash: y x (1 + sq), x x (1 - 0.6 sq), from the
// ground up), head, hx (head poke px), jaw, t0..t2, aN / aF (arms), pN / pF (fingers), L[i] (limb angles), LS[i] (limb scale
// toward its root: 1 = out, 0.3 = pulled in).
export const P = newP();
export function newP() { return { pitch: 0, lift: 0, lx: 0, sq: 0, head: 0, hx: 0, jaw: 0, t0: 0, t1: 0, t2: 0, aN: 0, aF: 0, pN: 0, pF: 0, L: new Float64Array(8), LS: new Float64Array(8).fill(1) }; }
export function resetP(p = P) {
  p.pitch = p.lift = p.lx = p.sq = p.head = p.hx = p.jaw = p.t0 = p.t1 = p.t2 = p.aN = p.aF = p.pN = p.pF = 0;
  for (let i = 0; i < 8; i++) { p.L[i] = 0; p.LS[i] = 1; }
  return p;
}
const mat = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const TB = mat(), T0 = mat(), T1 = mat(), T2 = mat(), TH = mat(), TA = mat();
let PUT = RIG.put;
const ok = (p) => p !== -1 && p !== null && p !== undefined;
const out = (p, T) => { if (ok(p)) PUT(p, T.a, T.b, T.c, T.d, T.e, T.f); };
const outIn = (p, T) => { if (ok(p)) PUT(p, T.a * M.a + T.c * M.b, T.b * M.a + T.d * M.b, T.a * M.c + T.c * M.d, T.b * M.c + T.d * M.d, T.a * M.e + T.c * M.f + T.e, T.b * M.e + T.d * M.f + T.f); };
const limbOf = (rp, c) => (c === 0 ? rp.l0 : c === 1 ? rp.l1 : c === 2 ? rp.l2 : c === 3 ? rp.l3 : c === 4 ? rp.l4 : c === 5 ? rp.l5 : c === 6 ? rp.l6 : rp.l7);
/** Output every part of rp in J.plan order, posed by p (part -> matrix in entry units). */
export function emit(J, rp, p) {
  // body: squash from the ground up about the pivot's x, turned about the pivot, moved by (lx, lift)
  const sy = 1 + p.sq, sx = 1 - 0.6 * p.sq, se = J.pvx - sx * J.pvx;
  rotAbout(J.pvx, J.pvy, p.pitch, p.lx, p.lift);
  TB.a = M.a * sx; TB.b = M.b * sx; TB.c = M.c * sy; TB.d = M.d * sy; TB.e = M.a * se + M.e; TB.f = M.b * se + M.f;
  const plan = J.plan;
  for (let k = 0; k < plan.length; k++) {
    const c = plan[k];
    if (c < 8) {
      const pi = limbOf(rp, c);
      if (!ok(pi)) continue;
      const jx = J.lj[c * 2], jy = J.lj[c * 2 + 1], s = p.LS[c];
      squashAbout(jx, jy, s, s, p.L[c]); outIn(pi, TB);
    } else if (c === 8) {   // tail chain: deepest piece first (each root covers the joint)
      if (J.nT < 1) continue;
      const t = J.t;
      rotAbout(t[0], t[1], p.t0); inP(TB); keep(T0);
      if (J.nT > 1) { rotAbout(t[2], t[3], p.t1); inP(T0); keep(T1); }
      if (J.nT > 2) { rotAbout(t[4], t[5], p.t2); inP(T1); keep(T2); out(rp.t2, T2); }
      if (J.nT > 1) out(rp.t1, T1);
      out(rp.t0, T0);
    } else if (c === 9) out(rp.body, TB);
    else if (c === 10) {   // the lower jaw, the head, its fx
      rotAbout(J.hx, J.hy, p.head, p.hx, 0); inP(TB); keep(TH);
      if (ok(rp.jaw)) { rotAbout(J.jx, J.jy, p.jaw); outIn(rp.jaw, TH); }
      out(rp.head, TH);
      out(rp.hfx, TH);
    } else if (c === 11 || c === 12) {   // an arm, then its moving finger about the hinge (inside the arm)
      const f = c === 12, pa = f ? rp.aF : rp.aN, pf = f ? rp.fF : rp.fN, o = f ? 2 : 0;
      if (!ok(pa) && !ok(pf)) continue;
      rotAbout(J.aj[o], J.aj[o + 1], f ? p.aF : p.aN); inP(TB); keep(TA);
      if (J.swap) { out((f ? p.pF : p.pN) > -0.22 && ok(pf) ? pf : pa, TA); continue; }   // two arm pictures (open / shut) instead of a finger part
      if (ok(pf)) { rotAbout(J.pj[o], J.pj[o + 1], f ? p.pF : p.pN); outIn(pf, TA); }
      out(pa, TA);
    } else if (c === 13) out(rp.bfx, TB);
    else if (c === 15) out(rp.b2, TB);
    else if (c === 14) { if (ok(rp.gfx)) PUT(rp.gfx, 1, 0, 0, 1, 0, 0); }
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
const AMP = new Float32Array(NS), LC = new Float32Array(NS), PH = new Float32Array(NS), LZ = new Float32Array(NS);
const STEP = new Int32Array(NS), CODE = new Int16Array(NS);
// springs (of the slot's 12): 0 pitch, 1 bob (px), 2 head, 3 jaw, 4 t0, 5 t1, 6 t2, 7 arm N, 8 arm F, 9 fingers, 10 squash,
// 11 eye stalks (crab) / head poke px (others)

// ---------------------------------------------------------------- 'sea' alive
// rp numbers (entry rig.parts(pose)): gait (0 hold the pose's limbs, 1 the type's walk, 4 thrash in place (stranded fish)),
// pitch, lift, lx, sq, ha (head), hx, ja (jaw), ta0..ta2 (tail), arm [N, F], pin [N, F] (fingers: - = open), la (limb angles:
// held in gait 0, added to the stride otherwise: 8 numbers), ls (limb scale: 8 numbers), code (pose id: a change kicks),
// kp, kb, kh, kt, ksq, ka (kicks on entering the pose: pitch, bob px/s, head, tail, squash, arms), shake (head shake rad).
function seaAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = OC[rg.q] || OC.crab, K = D.K, s = I.slot, now = I.now;
  const st = Math.floor(I.cyc), air = I.z > 1;
  if (fresh(s, u, now)) {
    AMP[s] = I.moving ? 1 : 0; LC[s] = I.cyc; PH[s] = I.ph * 2 * PI; LZ[s] = I.z; STEP[s] = st; CODE[s] = rp.code;
    setAngle(s, 0, rp.pitch); setAngle(s, 1, rp.lift); setAngle(s, 2, rp.ha); setAngle(s, 3, rp.ja); setAngle(s, 4, rp.ta0); setAngle(s, 5, rp.ta1);
    setAngle(s, 6, rp.ta2); setAngle(s, 7, rp.arm[0]); setAngle(s, 8, rp.arm[1]); setAngle(s, 9, rp.pin[0]); setAngle(s, 10, rp.sq); setAngle(s, 11, rg.q === 'crab' ? 0 : rp.hx);
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const vx = u.vx || 0, vy = u.vy || 0, sp = Math.sqrt(vx * vx + vy * vy);
  const gait = rp.gait;
  let dc = I.cyc - LC[s]; LC[s] = I.cyc;
  if (!(dc > 0 && dc < 3)) dc = 0;
  let amp = AMP[s];
  if (dt > 0) { amp += ((I.moving && gait === 1 && !air ? 1 : 0) - amp) * Math.min(1, dt * D.ease); AMP[s] = amp; }
  let th = PH[s] + dc * PI * D.cad;
  if (th > 200) th -= 64 * PI;
  PH[s] = th;
  const eyes = rg.q === 'crab';
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 2, -a * D.accelHead); kick(s, 4, a * D.accelTail); kick(s, 5, a * D.accelTail * 1.3); kick(s, 6, a * D.accelTail * 1.5);
    kick(s, 7, a * D.accelArm); kick(s, 8, a * D.accelArm); if (eyes) kick(s, 11, -a * D.accelHead * 1.5);
    if (In.hit) {
      const h = In.hit * (D.hit + D.hitPow * In.hitPow);
      kick(s, 0, h); kick(s, 1, D.hitBob * (0.6 + In.hitPow)); kick(s, 2, D.hitHead * h); kick(s, 3, 3 * Math.abs(h));
      kick(s, 4, D.hitTail * h); kick(s, 5, D.hitTail * h); kick(s, 6, D.hitTail * h); kick(s, 7, 1.5 * h); kick(s, 8, 1.5 * h);
      kick(s, 10, -D.hitSq * (0.5 + In.hitPow)); if (eyes) kick(s, 11, 2.5 * h);
    }
    if (In.atkStart) { kick(s, 3, D.atkJaw); kick(s, 2, D.atkHead); kick(s, 7, D.atkArm); kick(s, 9, D.atkPin); if (!eyes) kick(s, 11, D.atkHx); }
    if (CODE[s] !== rp.code) { kick(s, 0, rp.kp); kick(s, 1, rp.kb); kick(s, 2, rp.kh); kick(s, 4, rp.kt); kick(s, 5, rp.kt * 1.3); kick(s, 6, rp.kt * 1.5); kick(s, 10, rp.ksq); kick(s, 7, rp.ka); kick(s, 8, rp.ka * 0.7); if (eyes) kick(s, 11, rp.kh * 1.5); }
    if (I.moving && !air && st !== STEP[s] && gait === 1) {
      const sg = st & 1 ? 1 : -1;
      kick(s, 1, D.step); kick(s, 10, -D.stepSq); kick(s, 4, D.wag * 4 * sg); if (eyes) kick(s, 11, 1.6 * sg);
    }
    if (LZ[s] > 1 && !air) { kick(s, 1, D.land); kick(s, 10, -D.landSq); kick(s, 4, -2); }
  }
  const vz = dt > 0 ? (I.z - LZ[s]) / dt : 0;   // height speed (px/s, + = rising): a leap pitches nose-up rising, nose-down falling
  CODE[s] = rp.code; STEP[s] = st; LZ[s] = I.z;
  const ph = I.ph * 6.28, sT = Math.sin(th), cT = Math.cos(th);
  // limbs
  const ka = cl(0.6 + 0.4 * sp / 60, 0.6, 1.3);
  for (let i = 0; i < J.nL; i++) {
    let a = rp.la[i];
    if (gait === 1 && amp > 0.002) {
      const w = D.la0[i];
      if (D.gait === 'scuttle' || D.gait === 'wave' || D.gait === 'paddle') a += amp * D.A * ka * w * Math.sin(th + D.lph[i]);
      else if (D.gait === 'hop') a += amp * D.A * w * Math.sin(2 * th + D.lph[i]);
    } else if (D.gait === 'wave' && gait !== 4) a += 0.07 * Math.sin(I.rt * 1.9 + ph + i * 1.05);   // tentacles curl slowly at rest
    else if (gait === 0 || gait === 1) a += 0.02 * Math.sin(I.rt * 1.5 + ph + i);
    if (air && gait !== 0) a += 0.25 * Math.sin(now * 12 + i * 1.9 + ph);
    P.L[i] = a; P.LS[i] = rp.ls[i];
  }
  // body: rock + bob with the stride; hops; humps; stranded thrash
  let pT = rp.pitch, lT = rp.lift, sqT = rp.sq, gb = 0, thr = 0;
  if (D.gait === 'scuttle') { pT += amp * D.rock * Math.sin(2 * th); gb = -amp * D.bob * Math.abs(Math.sin(2 * th)); }
  else if (D.gait === 'wave') { pT += amp * D.rock * sT; gb = -amp * D.bob * Math.abs(sT); sqT += amp * 0.05 * cT; }
  else if (D.gait === 'paddle') { pT += amp * D.rock * Math.sin(2 * th); gb = -amp * D.bob * Math.abs(Math.sin(2 * th)) - amp * D.hump * Math.abs(sT); sqT += -amp * 0.07 * D.hump * cT * cT; }
  else if (D.gait === 'hop') { const h = Math.abs(sT); gb = -amp * D.hopH * h; sqT += amp * (0.12 * h - 0.06); pT += amp * -0.12 * cT; }
  if (gait === 4 || (D.gait === 'flop' && gait === 1 && I.moving)) {   // stranded: arch + whip, faster while it wriggles along
    const w = D.thrashW * (gait === 4 ? 1 : 1.3), k = now * w + ph;
    thr = D.thrash * Math.sin(k); pT += thr * 0.5; gb = -1.4 * Math.abs(Math.sin(k));
  }
  if (!I.moving && gait !== 4) sqT += D.breathe * Math.sin(I.rt * 2.1 + ph);
  if (rp.vzp && air) pT -= rp.vzp * cl(vz / (sp + 60), -0.75, 0.75);
  P.pitch = spring(s, 0, pT, K.pitch, dt, D.lim.pitch);
  P.lift = spring(s, 1, lT, K.bob, dt, 12) + gb;
  P.sq = spring(s, 10, sqT, K.sq, dt, 0.5);
  P.lx = rp.lx;
  // head: nods with the stride, shakes holding, pokes (hx) on its own spring
  const nod = amp * D.nod * Math.sin(2 * th + 0.7), shake = rp.shake ? rp.shake * Math.sin(now * 23 + ph) : 0;
  P.head = spring(s, 2, rp.ha + nod + shake - thr * 0.8, K.head, dt, D.lim.head);
  P.hx = eyes ? rp.hx : spring(s, 11, rp.hx, K.hx, dt, 12);
  P.jaw = ok(rp.jaw) ? Math.max(-0.05, spring(s, 3, rp.ja, K.jaw, dt, 1.2)) : 0;
  // tail: a wave down it on the stride, a slow sway standing, each piece lagging the one before; thrash whips it
  let w0, w1, w2;
  const wg = D.wag;
  if (I.moving && gait === 1) { w0 = amp * wg * Math.sin(th); w1 = amp * wg * Math.sin(th - D.wagLag); w2 = amp * wg * Math.sin(th - 2 * D.wagLag); }
  else { const k = I.rt * D.swayW + ph; w0 = D.sway * Math.sin(k); w1 = D.sway * Math.sin(k - 0.8); w2 = D.sway * Math.sin(k - 1.6); }
  if (thr) { const k = now * D.thrashW * (gait === 4 ? 1 : 1.3) + ph; w0 -= 2.2 * thr; w1 -= 2.4 * D.thrash * Math.sin(k - 0.9); w2 -= 2.6 * D.thrash * Math.sin(k - 1.8); }
  if (air) { const k = now * 9 + ph; w0 += 0.25 * Math.sin(k); w1 += 0.3 * Math.sin(k - 0.7); }
  P.t0 = spring(s, 4, rp.ta0 + w0, K.t0, dt, D.lim.tail);
  P.t1 = spring(s, 5, rp.ta1 + w1 - 0.3 * (P.t0 - rp.ta0), K.t1, dt, D.lim.tail);
  P.t2 = J.nT > 2 ? spring(s, 6, rp.ta2 + w2 - 0.3 * (P.t1 - rp.ta1), K.t2, dt, D.lim.tail) : 0;
  // arms (claws): bob with the stride, a slow wave standing; fingers snap
  const ab = I.moving ? 0.12 * amp * Math.sin(2 * th + 1) : 0.06 * Math.sin(I.rt * 2.3 + ph);
  P.aN = spring(s, 7, rp.arm[0] + ab, K.arm, dt, D.lim.arm);
  P.aF = spring(s, 8, rp.arm[1] - ab * 0.8, K.arm, dt, D.lim.arm);
  const pinW = rp.pin[0] < -0.05 && !(u.attack > 0) && Math.sin(I.rt * 2.3 + ph) > 0.9 ? 0.45 : 0;   // an open claw clacks now and then
  P.pN = Math.min(0.15, spring(s, 9, rp.pin[0] + pinW, K.pin, dt, 1.4)); P.pF = rp.pin[1] + (P.pN - rp.pin[0]) * 0.6;
  // crab eye stalks (limb D.eyeL) wobble on spring 11 about their rest angle
  if (eyes) { const e = D.eyeL; P.L[e] = rp.la[e] + spring(s, 11, 0, K.eye, dt, 0.9) + 0.04 * Math.sin(I.rt * 2.7 + ph); }
  emit(J, rp, P);
  return true;
}

// ---------------------------------------------------------------- 'sea' dead
const FL = { air: false, now: 0, id: 0 };
function fl(k, a) { return FL.air ? a * Math.sin(FL.now * 11 + k * 1.7 + h01(FL.id, k) * 6) : 0; }
function seaBody(ent, rp, id, t, air, now) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = OC[rg.q] || OC.crab;
  FL.air = air; FL.now = now; FL.id = id;
  resetP();
  for (let i = 0; i < J.nL; i++) { const sg = i & 1 ? -1 : 1; P.L[i] = rp.la[i] + (air ? fl(i, 0.6) : flop(sg * (D.dLimb[0] * 0.5 + D.dLimb[1] * (h01(id, i) - 0.5)), t)); P.LS[i] = rp.ls[i]; }
  P.head = air ? fl(9, 0.5) : flop(D.dHead[0] * (h01(id, 9) - 0.3) + D.dHead[1] * 0.3, t) + rp.ha;
  P.jaw = air ? 0.3 + fl(10, 0.2) : flop(D.dJaw[0] + D.dJaw[1] * h01(id, 10), t);
  P.t0 = rp.ta0 + (air ? fl(11, 0.4) : flop((h01(id, 11) - 0.5) * D.dTail, t));
  P.t1 = rp.ta1 + (air ? fl(12, 0.5) : flop((h01(id, 12) - 0.5) * D.dTail * 1.2, t));
  P.t2 = rp.ta2 + (air ? fl(13, 0.5) : flop((h01(id, 13) - 0.5) * D.dTail * 1.4, t));
  P.aN = rp.arm[0] + (air ? fl(14, 0.8) : flop(D.dArm[0] + D.dArm[1] * (h01(id, 14) - 0.5), t));
  P.aF = rp.arm[1] + (air ? fl(15, 0.8) : flop(-D.dArm[0] + D.dArm[1] * (h01(id, 15) - 0.5), t));
  P.pN = rp.pin[0]; P.pF = rp.pin[1];
  P.sq = air ? 0 : flop(-0.08 * h01(id, 16), t);
  P.pitch = air ? 0.12 * Math.sin(now * 7 + h01(id, 17) * 6) : 0;
  P.hx = rp.hx;
  const n0 = OUT.n;
  emit(J, rp, P);
  onBack(n0, J.deadH);
  return true;
}
register('sea', { alive: seaAlive, body: seaBody });
