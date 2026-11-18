// Floppy-body drivers for animals + horses (ANIMALS). Contract: RIG.md. OURS, not OG: every number here is invented.
//
// 'quad': a four-legged body (boar, cheetah, horse / cavalry / ape cavalry, ape on its knuckles, gator) drawn as parts:
//   up to 4 legs swinging about their hips (trot or gallop from the walk distance I.cyc), a body that pitches and bobs on
//   springs, a head on a neck spring that lags and nods, a tail on a spring that streams and wags (+ a tail tip that lags
//   the tail: gator), the gator's two jaws on stiff springs, a rider (cavalry / ape cavalry) bouncing in the saddle.
//   rp (entry rig.parts(pose)): l0..l3 leg parts (near front, far front, near hind, far hind), body, head, tail, tip,
//   jawL, rider (-1 = none), and numbers: gait (1 trot, 2 gallop, 3 paw, 4 stretched out, 5 trot / gallop by speed),
//   headA (head angle the spring goes to), hx (head lunge px), lift (body px, - = up), pitch, tailT (tail angle), up / dn
//   (gator jaws), rlean (rider lean). Angles: + = clockwise on screen (a leg's foot back, a head down, a tail up-back).
//   rig.q names its table in QUAD (joints = where the painters put them, sprite px, facing right, feet at 0,0).
//   Dead (body()): the dead parts are painted upside down (on its back, like the whole dead frame: y -> -deadH - y), so the
//   pose is worked out upright and flipped: legs splay up limp, the head lolls to the grass, the tail flops.
import { BANK, NSPR, OUT, M, fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, putIn, putM, put, inP, flop, h01, register } from './rig.js';

const PI = Math.PI;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- numbers (ours)
export const QS = {   // springs [stiffness, damping]; damping ratio c / (2 sqrt k) ~ 0.2-0.3 (overshoot 2-3 times)
  pitch: [110, 5.6], bob: [170, 7.2], head: [140, 5], tail: [64, 3.6], tip: [50, 2.8], jaw: [320, 8.5],
  rTilt: [80, 4], rBob: [120, 5.2], arm: [55, 3.2], lunge: [240, 9.5],
};
export const QP = {
  accel: 0.0008, accelHead: 0.0016, accelTail: 0.0018, accelRider: 0.0016, accelArm: 0.0022,   // rad/s per px/s² a frame
  hit: 2.4, hitPow: 7, hitBob: 26, hitBobPow: 40, hitHead: 1.3, hitTail: -1.6, hitRider: 1.8,   // a blow along the body
  atkJawU: -7, atkJawL: 3.5, atkRider: 2.5,   // an attack starting (body + head: each type's atk = [pitch, head, lunge px/s])
  land: 70,             // px/s down on the body spring when it lands from a toss
  ease: 7, galEase: 5,  // leg swing eases in / out (1/s), trot <-> gallop blend (1/s)
  ride: 0.32,           // the rider keeps this much of the saddle's up / down speed (lags it, then bounces back)
};
// Per type: joints (from the painters) + gait numbers. legs[i] = [hipX, hipY, dx, dy, length]: the part for leg i is
// painted with its hip at (hipX - dx, hipY - dy) (one painted leg can serve two hips). plan = draw order (back to front):
// 0..3 leg i, T tail (+ tip under it), B body, H head, J gator jaws, D rider.
const T = 4, B = 5, H = 6, J = 7, D = 8;
export const QUAD = {
  boar: {
    pivot: [-1, -11], neck: [7.6, -12.4], tail: [-12.2, -12],
    legs: [[6, -7, 0, 0, 7], [3.8, -7, 0, 0, 7], [-7, -7, -13, 0, 7], [-9.3, -7, -13.1, 0, 7]],
    plan: [1, 3, T, 0, 2, B, H],
    walkA: [0.42, 0.42], runA: [1.0, 1.0], runO: [-0.08, 0.05], runK: 0.5, walkV: 55, fold: 0.3,
    bob: 0.7, lift: [1.1, 0.5], rock: 0.12, nod: [0.07, 0.16], tailRun: 0.6, wag: 0.3, galV: 120, atk: [-1.6, 0, 0],
    lim: [0.5, 0.9, 1.2, 0], hitK: 1, deadH: 19.5, deadHead: [-0.3, -0.45], deadLeg: [0.15, 0.8],
  },
  cheetah: {
    pivot: [0, -9], neck: [8.4, -11], tail: [-9, -9.6],
    legs: [[6, -6, 0, 0, 6], [8, -6, 2, 0, 6], [-6, -6, -12, 0, 6], [-4, -6, -10, 0, 6]],
    plan: [1, 3, 0, 2, T, B, H],
    walkA: [0.55, 0.55], runA: [1.15, 1.1], runO: [-0.1, 0.05], runK: 0.5, walkV: 50, fold: 0.35,
    bob: 0.55, lift: [1.0, 0.8], rock: 0.1, nod: [0.06, 0.12], tailRun: -0.5, wag: 0.22, galV: 105, atk: [0.8, 1.5, 70],
    lim: [0.5, 0.9, 1.2, 0], hitK: 1.1, deadH: 18.6, deadHead: [-0.25, -0.4], deadLeg: [0.3, 0.9],
  },
  horse: {
    pivot: [-1, -17.6], neck: [7, -20], tail: [-12.7, -20.7], seat: [-0.4, -25.6],
    legs: [[7.4, -14, 0, 0, 14], [5.2, -14, 0, 0, 14], [-8.6, -14, 0, 0, 14], [-10.8, -14, 0, 0, 14]],
    plan: [1, 3, T, 0, 2, H, B, D],
    walkA: [0.3, 0.3], runA: [0.95, 0.9], runO: [-0.12, 0.08], runK: 0.5, walkV: 75, fold: 0.32,
    bob: 0.9, lift: [1.7, 0.7], rock: 0.1, nod: [0.08, 0.18], tailRun: 0.85, wag: 0.18, galV: 115, atk: [-1.2, -2, 0],
    lim: [0.4, 0.75, 1.0, 0], hitK: 0.8, deadH: 24.6, deadHead: [0.45, 0.2], deadLeg: [0.1, 0.6],
  },
  ape: {   // knuckle-walker: legs 0 / 1 are its arms (shoulders), 2 / 3 its legs; heavy arms lag on a spring
    pivot: [-1, -14], neck: [9.4, -15.6],
    legs: [[5.6, -16.4, 0, 0, 16.4], [3, -17.4, 0, 0, 17.4], [-6, -9.6, 0, 0, 9.6], [-8.2, -10, 0, 0, 10]],
    plan: [3, 1, 2, B, 0, H], arms: 1,
    walkA: [0.3, 0.32], runA: [0.5, 0.7], runO: [-0.18, 0], runK: 0.55, walkV: 90, fold: 0.18,
    bob: 1.2, lift: [0.9, 0.5], rock: 0.16, nod: [0.12, 0.16], tailRun: 0, wag: 0, galV: 140, atk: [-1.2, -2, 0],
    lim: [0.45, 0.8, 0, 0], hitK: 0.9, deadH: 24, deadHead: [-0.3, -0.4], deadLeg: [0.2, 0.8],
  },
  gator: {   // sprawling paddle, no gallop; tail in two pieces, jaws on stiff springs
    pivot: [-0.4, -5.6], neck: [11, -5.7], tail: [-10, -5.2], tip: [-20.4, -4.4], jawU: [11, -6.2], jawL: [11, -5.2],
    legs: [[8, -4, 0, 0, 4], [6, -4, 0, 0, 4], [-6.6, -4, 0, 0, 4], [-8.6, -4, 0, 0, 4]],
    plan: [1, 3, T, B, J, 0, 2],
    walkA: [0.62, 0.62], runA: [0.75, 0.75], runO: [0, 0], runK: 1, walkV: 34, fold: 0.15,
    bob: 0.25, lift: [0.3, 0.2], rock: 0.03, nod: [0.04, 0.05], tailRun: 0, wag: 0.1, tipWag: 0.32, galV: 1e9, atk: [-0.8, -1.5, 30],
    lim: [0.2, 0.35, 0.42, 0.5], hitK: 0.35, deadH: 11, deadHead: [0.1, -0.2], deadLeg: [0.3, 0.9],
  },
};

// ---------------------------------------------------------------- per-slot gait state (own arrays; reset with fresh())
const NS = 32768;
const PH = new Float32Array(NS), LC = new Float32Array(NS), AMP = new Float32Array(NS), GAL = new Float32Array(NS), LB = new Float32Array(NS), LZ = new Float32Array(NS);
// springs used (of the slot's 12): 0 pitch, 1 bob (px), 2 head, 3 tail, 4 tail tip, 5 rider tilt, 6 rider bob (px),
// 7 upper jaw / ape arm lag, 8 lower jaw, 11 head lunge (px)
const GALP = [0, 0.55, 0.25, 0.8];   // gallop footfall offsets (rad) of near fore, far fore, near hind, far hind; trot: diagonal pairs
const TROT_S = [1, -1, -1, 1], GC = GALP.map(Math.cos), GS = GALP.map(Math.sin);
const C07 = Math.cos(0.7), S07 = Math.sin(0.7), C11 = Math.cos(1.1), S11 = Math.sin(1.1), C13 = Math.cos(1.3), S13 = Math.sin(1.3);

// scratch (no allocation per frame)
const LA = new Float64Array(4), LS = new Float64Array(4), LCOMP = new Uint8Array(1);
const P = { pitch: 0, bob: 0, gbob: 0, hA: 0, lx: 0, tA: 0, tipA: 0, uA: 0, lA: 0, rT: 0, rB: 0 };
const TB = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TH = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Resolve rig.q (a QUAD name) once into one fixed-shape object (every type the same shape: fast property reads). */
function qOf(rig) {
  let Q = rig._Q;
  if (Q) return Q;
  const q = QUAD[rig.q] || QUAD.boar, z2 = [0, 0];
  const pv = q.pivot, nk = q.neck, tl = q.tail || z2, tp = q.tip || z2, st = q.seat || z2, ju = q.jawU || z2, jl = q.jawL || z2;
  Q = rig._Q = {
    pvx: pv[0], pvy: pv[1], nkx: nk[0], nky: nk[1], tlx: tl[0], tly: tl[1], tpx: tp[0], tpy: tp[1], stx: st[0], sty: st[1], jux: ju[0], juy: ju[1], jlx: jl[0], jly: jl[1],
    legs: Float64Array.from(q.legs.flat()), plan: Int8Array.from(q.plan), arms: q.arms ? 1 : 0,
    walkAF: q.walkA[0], walkAH: q.walkA[1], runAF: q.runA[0], runAH: q.runA[1], runOF: q.runO[0], runOH: q.runO[1], runK: q.runK, walkV: q.walkV, fold: q.fold,
    bob: q.bob, lift0: q.lift[0], lift1: q.lift[1], rock: q.rock, nodW: q.nod[0], nodR: q.nod[1], tailRun: q.tailRun, wag: q.wag, tipWag: q.tipWag || 0, galV: q.galV,
    atkP: q.atk[0], atkH: q.atk[1], atkL: q.atk[2], limP: q.lim[0], limH: q.lim[1], limT: q.lim[2], limTip: q.lim[3], hitK: q.hitK,
    deadH: q.deadH, dHead0: q.deadHead[0], dHead1: q.deadHead[1], dLeg0: q.deadLeg[0], dLeg1: q.deadLeg[1],
  };
  return Q;
}

// ---------------------------------------------------------------- output (shared by alive + dead)
function emit(Q, rp) {
  rotAbout(Q.pvx, Q.pvy, P.pitch, 0, P.bob); keep(TB);
  const plan = Q.plan, legs = Q.legs, comp = LCOMP[0] === 1;
  for (let k = 0; k < plan.length; k++) {
    const c = plan[k];
    if (c < 4) {
      const pi = c === 0 ? rp.l0 : c === 1 ? rp.l1 : c === 2 ? rp.l2 : rp.l3;
      if (pi < 0) continue;
      const o = c * 5, hx = legs[o], hy = legs[o + 1], px = hx - legs[o + 2], py = hy - legs[o + 3];
      const Hx = TB.a * hx + TB.c * hy + TB.e, Hy = TB.b * hx + TB.d * hy + TB.f;   // the hip, carried by the body
      let s = LS[c];
      if (comp) { const L = legs[o + 4]; s *= cl((L - (Hy - hy - P.gbob)) / L, 0.55, 1.35); }   // feet stay down when the body dips / tips
      squashAbout(px, py, 1, s, LA[c]);
      put(pi, M.a, M.b, M.c, M.d, M.e + Hx - px, M.f + Hy - py);
    } else if (c === T) {
      if (rp.tail < 0) continue;
      rotAbout(Q.tlx, Q.tly, P.tA); inP(TB); keep(TT);
      if (rp.tip >= 0) { rotAbout(Q.tpx, Q.tpy, P.tipA); putIn(rp.tip, TT); }
      put(rp.tail, TT.a, TT.b, TT.c, TT.d, TT.e, TT.f);
    } else if (c === B) {
      put(rp.body, TB.a, TB.b, TB.c, TB.d, TB.e, TB.f);
    } else if (c === H) {
      if (rp.head < 0) continue;
      rotAbout(Q.nkx, Q.nky, P.hA, P.lx, 0); putIn(rp.head, TB);
    } else if (c === J) {
      rotAbout(Q.nkx, Q.nky, P.hA, P.lx, 0); inP(TB); keep(TH);
      if (rp.jawL >= 0) { rotAbout(Q.jlx, Q.jly, P.lA); putIn(rp.jawL, TH); }
      if (rp.head >= 0) { rotAbout(Q.jux, Q.juy, P.uA); putIn(rp.head, TH); }
    } else if (c === D) {
      if (rp.rider < 0) continue;
      rotAbout(Q.stx, Q.sty, P.rT, 0, P.rB); putIn(rp.rider, TB);
    }
  }
}

// ---------------------------------------------------------------- alive
function quadAlive(ent, rp, u, I) {
  const Q = ent.e.rig._Q || qOf(ent.e.rig), s = I.slot, now = I.now;
  if (fresh(s, u, now)) {
    PH[s] = I.ph * 2 * PI; LC[s] = I.cyc; AMP[s] = I.moving ? 1 : 0; GAL[s] = rp.gait === 2 ? 1 : 0; LB[s] = 0; LZ[s] = I.z;
    setAngle(s, 2, rp.headA); setAngle(s, 1, rp.lift); setAngle(s, 0, rp.pitch); setAngle(s, 3, rp.tailT); setAngle(s, 5, rp.rlean);
    setAngle(s, 7, rp.up); setAngle(s, 8, rp.dn);
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const vx = u.vx || 0, vy = u.vy || 0, sp = Math.sqrt(vx * vx + vy * vy);
  let gait = rp.gait;
  if (gait === 5) gait = sp > Q.galV ? 2 : 1;
  const air = I.z > 1;
  // gait phase + how much the legs swing (eased) + trot <-> gallop blend
  let dc = I.cyc - LC[s]; LC[s] = I.cyc;
  if (!(dc > 0 && dc < 3)) dc = 0;
  let amp = AMP[s], gal = GAL[s];
  if (dt > 0) {
    const e = Math.min(1, dt * QP.ease), g = Math.min(1, dt * QP.galEase);
    amp += ((I.moving && gait < 3 ? 1 : 0) - amp) * e; gal += ((gait === 2 ? 1 : 0) - gal) * g;
    AMP[s] = amp; GAL[s] = gal;
  }
  let th = PH[s] + dc * PI * (1 - gal * (1 - Q.runK));
  if (th > 200) th -= 64 * PI;
  PH[s] = th;
  // pushes: speeding up tips the body back and swings head, tail, rider; a blow knocks them along it; landing jolts
  if (dt > 0) {
    const ax = In.ax * dt;
    kick(s, 0, -ax * QP.accel); kick(s, 2, -ax * QP.accelHead); kick(s, 3, ax * QP.accelTail); kick(s, 5, -ax * QP.accelRider);
    if (Q.arms) kick(s, 7, ax * QP.accelArm);
    if (In.hit) {
      const h = In.hit * (QP.hit + QP.hitPow * In.hitPow) * Q.hitK;
      kick(s, 0, h); kick(s, 1, (QP.hitBob + QP.hitBobPow * In.hitPow) * Q.hitK); kick(s, 2, QP.hitHead * h); kick(s, 3, QP.hitTail * h); kick(s, 5, QP.hitRider * h);
      if (Q.arms) kick(s, 7, -2 * h);
      kick(s, 4, -2 * h);
    }
    if (In.atkStart) {
      kick(s, 0, Q.atkP); kick(s, 2, Q.atkH); kick(s, 11, Q.atkL); kick(s, 5, QP.atkRider);
      if (rp.jawL >= 0) { kick(s, 7, QP.atkJawU); kick(s, 8, QP.atkJawL); }
    }
    if (LZ[s] > 1 && !air) { kick(s, 1, QP.land); kick(s, 2, 3); kick(s, 3, 2); kick(s, 6, 40); }
  }
  LZ[s] = I.z;
  // legs (every phase from one sin / cos: the trot's offsets are 0 / PI, the gallop's are constants)
  const sT = Math.sin(th), cT = Math.cos(th);
  const ka = cl(0.55 + 0.45 * sp / Q.walkV, 0.6, 1.3), fold = Q.fold;
  let armLag = 0;
  if (Q.arms) armLag = spring(s, 7, 0, QS.arm, dt, 0.8);
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    let a = 0, f = 0;
    if (air || gait === 4) {   // tossed / pouncing: legs flung out, front forward, hind back (a little flail when tossed)
      const w = air ? 0.35 * Math.sin(now * 13 + i * 1.9 + I.ph * 6) : 0;
      a = (front ? -1.15 : 1.15) + w; f = 0.1;
    } else if (gait === 3) {   // pawing the ground: the near fore scrapes back and forth
      if (i === 0) { const p = I.rt * 8.2 + I.ph * 6; a = -0.5 - 0.42 * Math.sin(p); f = 0.35 * Math.max(0, Math.cos(p)); }
    } else if (amp > 0.002) {
      const k = TROT_S[i], st = sT * k, ct = cT * k;
      const aT = -(front ? Q.walkAF : Q.walkAH) * ka * st, fT = ct > 0 ? ct : 0;
      if (gal > 0.002) {
        const sg = front ? -1 : 1, sgp = sT * GC[i] + cT * GS[i], cgp = cT * GC[i] - sT * GS[i];
        const aG = sg * (front ? Q.runAF : Q.runAH) * sgp + (front ? Q.runOF : Q.runOH), fg = -sg * cgp, fG = fg > 0 ? fg : 0;
        a = amp * (aT + (aG - aT) * gal); f = amp * (fT + (fG - fT) * gal);
      } else { a = amp * aT; f = amp * fT; }
    }
    if (front && Q.arms) a += armLag;
    LA[i] = a; LS[i] = 1 - fold * f;
  }
  // body: pitch + bob springs, the gait's own bob / rock on top
  const s2 = 2 * sT * cT, c2 = cT * cT - sT * sT;   // sin / cos of 2 th
  const gbob = air ? 0 : amp * ((1 - gal) * -Q.bob * (cT < 0 ? -cT : cT) - gal * (Q.lift0 + Q.lift1 * sT));
  const rock = air ? 0 : amp * Q.rock * (gal * cT + (1 - gal) * 0.25 * s2);
  P.pitch = spring(s, 0, rp.pitch, QS.pitch, dt, Q.limP) + rock;
  P.bob = spring(s, 1, rp.lift, QS.bob, dt, 9) + gbob;
  P.gbob = gbob + rp.lift;
  LCOMP[0] = air || gait === 4 ? 0 : 1;
  // head (nods with the stride), its lunge; tail (streams when fast, wags), the gator's tail tip, jaws
  const nod = amp * ((1 - gal) * Q.nodW * (s2 * C07 + c2 * S07) + gal * Q.nodR * (sT * C11 + cT * S11));
  P.hA = spring(s, 2, rp.headA + nod, QS.head, dt, Q.limH);
  P.lx = spring(s, 11, rp.hx, QS.lunge, dt, 6);
  const wag = amp * Q.wag * (sT * C13 + cT * S13);
  P.tA = rp.tail >= 0 ? spring(s, 3, rp.tailT + amp * gal * Q.tailRun + wag + (air ? 0.5 * Math.sin(now * 11 + I.ph * 5) : 0), QS.tail, dt, Q.limT) : 0;
  P.tipA = rp.tip >= 0 ? spring(s, 4, amp * Q.tipWag * Math.sin(th * 0.5 + 0.2) - 0.4 * (P.tA - rp.tailT), QS.tip, dt, Q.limTip) : 0;
  if (rp.jawL >= 0) { P.uA = spring(s, 7, rp.up, QS.jaw, dt, 1); P.lA = spring(s, 8, rp.dn, QS.jaw, dt, 0.8); } else { P.uA = 0; P.lA = 0; }
  // rider: tilts after the horse, sinks into the saddle as it rises and bounces back
  if (rp.rider >= 0) {
    if (dt > 0) kick(s, 6, -QP.ride * (gbob - LB[s]) / dt);
    LB[s] = gbob;
    P.rT = spring(s, 5, rp.rlean, QS.rTilt, dt, 0.9); P.rB = spring(s, 6, 0, QS.rBob, dt, 5);
  } else { P.rT = 0; P.rB = 0; }
  emit(Q, rp);
  return true;
}

// ---------------------------------------------------------------- dead
// Worked out upright, then flipped onto its back with the parts (they are painted upside down when dead).
function quadBody(ent, rp, id, t, air, now) {
  const Q = ent.e.rig._Q || qOf(ent.e.rig);
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    if (air) LA[i] = (front ? -0.35 : 0.35) + 0.45 * Math.sin(now * 12.5 + i * 1.7 + h01(id, i) * 6);   // flung: limbs flap (on the ground: lie 'none' bodies are not lifted)
    else LA[i] = flop((front ? -1 : 1) * (Q.dLeg0 + Q.dLeg1 * h01(id, i)), t);
    LS[i] = 1;
  }
  LCOMP[0] = 0;
  P.pitch = air ? 0.15 * Math.sin(now * 7 + h01(id, 5) * 6) : flop((h01(id, 5) - 0.5) * 0.12, t);
  P.bob = 0; P.gbob = 0; P.lx = 0;
  P.hA = air ? 0.35 * Q.limH * Math.sin(now * 10 + h01(id, 6) * 6) : flop(Q.dHead0 + Q.dHead1 * h01(id, 6), t);
  P.tA = air ? 0.45 * Q.limT * Math.sin(now * 9 + h01(id, 7) * 6) : flop((h01(id, 7) - 0.5) * Q.limT, t);
  P.tipA = air ? 0.45 * Q.limTip * Math.sin(now * 8 + 1) : flop((h01(id, 8) - 0.5) * Q.limTip * 1.4, t);
  P.uA = flop(-0.12 - 0.15 * h01(id, 9), t); P.lA = flop(0.15 + 0.25 * h01(id, 10), t);
  P.rT = 0; P.rB = 0;
  const n0 = OUT.n;
  const rider = rp.rider; rp.rider = -1;   // a dead horse is the horse alone (its rider is his own corpse)
  emit(Q, rp);
  rp.rider = rider;
  // onto its back: M' = F M F with F: y -> -h - y
  const h = Q.deadH, m = OUT.m;
  for (let i = n0; i < OUT.n; i++) {
    const o = i * 6, b = m[o + 1], c = m[o + 2], d = m[o + 3], e = m[o + 4], f = m[o + 5];
    m[o + 1] = -b; m[o + 2] = -c; m[o + 4] = e - c * h; m[o + 5] = -h - f + d * h;
  }
  return true;
}
register('quad', { alive: quadAlive, body: quadBody });

// ---------------------------------------------------------------- 'wobble' with the dead flop (small animals): see rig.js
export const ready = true;
