// BUGS tab floppy-body drivers (OURS, Part 2 step 6, STEP6.md; contract RIG.md). Owner: BUGS-ART. Parts + joints: sprites-bugs.js.
//   'bug'   every bug but the hive: a small tree of painted parts on the body (legs, abdomen, head, mantis blades, wings, an
//           effect part like the bombardier's spray). Legs scuttle about their hips (alternate legs, the foot lifts on the swing,
//           fast little strides), the abdomen lags + bobs after the body on a spring, the head nods + lags, blades snap out and
//           wobble back, wings buzz (fast flutter + squash, the far wing a beat behind), flyers hover-bob with their legs
//           dangling on a spring. Entering an action pose kicks the springs (rear up, horn flip, lunge, spray, puff).
//           Dead: flipped onto its back, legs up, the legs kick a few times then curl still; wings splay, head lolls.
//   'hive'  the beehive: one whole sprite on a stiff spring: sways, squashes when hit, shakes while bees pour out (buzz).
// emit() is shared with the painter (sprites-bugs.js paints every whole pose through it, so whole sprites and parts agree).
// No allocation per unit per frame: typed arrays per slot, scratch matrices, one fixed-shape pose object.
import * as RIG from './rig.js';
const { fresh, inputs, spring, kick, setAngle, rotAbout, squashAbout, keep, inP, flop, h01, register, M, OUT } = RIG;
export const ready = true;
const PI = Math.PI;
const cl = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping]: damping ratio c / (2 sqrt k) ~ 0.2-0.3 (they overshoot 2-3 times). Kicks: rad/s (bob, lunge: px/s).
// Angles: + = clockwise on screen in the facing-right frame (a body nose down, a hanging leg's foot back, an abdomen's tip up,
// a mantis blade swung forward / down, a wing swept back).
const BASE = {
  K: { pitch: [140, 6.2], bob: [200, 7], ab: [110, 4.6], head: [170, 5.4], arm: [160, 5.5], leg: [90, 4], wing: [180, 7], lunge: [220, 9], fx: [120, 5] },
  legA: 0.42, fold: 0.35, gaitK: 1, walkV: 60,       // legs: swing (rad) at walkV px/s, foot lift on the swing (leg length scale), strides
  bob: 0.45, rock: 0.035, abW: 0.07, nod: 0.05, breathe: 0.18,   // body bob (px) + rock (rad), abdomen + head wobble with the stride
  accel: 0.0008, accelAb: 0.0018, accelHead: 0.0012, accelLeg: 0.0022,   // rad/s per px/s² a frame
  hit: 2.2, hitPow: 7, hitBob: 22, wingHit: 4, atkHead: 2, atkLunge: 40, land: 55,
  wHz: 21, wAmp: 0.6, wSq: 0.5, wLag: 0.55,         // wing buzz (Hz, rad), foreshortening squash at the top of the stroke, far wing lag
  hover: 0.8, hoverW: 5.5,                           // flyers bob (px, rad/s)
  fxPulse: 0.12, fxHz: 23,                           // effect parts (spray, stink lines) pulse
  dVar: 0.5, twitch: 0.55, twitchHz: 26,             // dead: spread of the rest angles, the leg kicks (rad, rad/s)
};
const OVR = {
  spider: { legA: 0.36, fold: 0.42, gaitK: 1.15, walkV: 70, bob: 0.35, abW: 0.09, twitch: 0.7 },
  beetle: { K: { pitch: [110, 5.4], bob: [170, 6.2], ab: [110, 4.6], head: [150, 5], arm: [160, 5.5], leg: [80, 3.8], wing: [180, 7], lunge: [180, 8], fx: [120, 5] },
    legA: 0.34, fold: 0.3, walkV: 45, bob: 0.6, rock: 0.045, hit: 1.1, hitPow: 3.5, hitBob: 16, atkLunge: 34, land: 80 },
  mantis: { legA: 0.3, fold: 0.38, walkV: 90, bob: 0.5, rock: 0.025, abW: 0.08, nod: 0.08, hit: 2.6, atkLunge: 30 },
  bombardier: { legA: 0.42, fold: 0.36, walkV: 70 },
  stinkbug: { legA: 0.38, fold: 0.34, walkV: 50, bob: 0.4 },
  bee: { K: { pitch: [120, 5], bob: [160, 5.6], ab: [130, 4.4], head: [170, 5.4], arm: [160, 5.5], leg: [60, 2.6], wing: [220, 8], lunge: [220, 9], fx: [120, 5] },
    wHz: 24, wAmp: 0.65, hover: 0.7, hoverW: 7, accelAb: 0.0024, hit: 3.2, hitPow: 9 },
  mosquito: { K: { pitch: [110, 4.6], bob: [150, 5.4], ab: [100, 3.6], head: [160, 5.2], arm: [160, 5.5], leg: [45, 2], wing: [220, 8], lunge: [220, 9], fx: [120, 5] },
    wHz: 26, wAmp: 0.5, hover: 1.1, hoverW: 4.2, accelLeg: 0.004, accelAb: 0.002, hit: 3, hitPow: 9 },
};
export const BT = {};
for (const k of ['spider', 'beetle', 'mantis', 'bombardier', 'stinkbug', 'bee', 'mosquito']) BT[k] = Object.assign({}, BASE, OVR[k], { K: Object.assign({}, BASE.K, (OVR[k] || {}).K) });
export const HIVE = { tilt: [70, 3.6], squash: [240, 8], hitTilt: 1.6, hitSquash: 2.6, shake: 0.07, shakeX: 0.7, sway: 0.012 };

// ---------------------------------------------------------------- joints (from the painters) -> one fixed-shape object
// rig.joints = { pivot: [x, y] (body pitch), deadH (flip height on its back), dpitch (dead body pitch), fly (hovering flyer),
//   nodes: [[token, kind, parent node index (-1 = the body), jx, jy, gait phase (rad), amp], ...] in DRAW order (back to front;
//   a parent must come before its children), dead: [rest angle per node when dead] }.
// kinds: body (the root part), leg (stride about its hip; amp scales the swing: 0.5 for a part holding two far legs), ab
// (abdomen spring), head (head spring), arm0 / arm1 (mantis blades: own springs), wingN / wingF (buzz), fx (pulses), fixed.
export const KIND = { body: 0, leg: 1, ab: 2, head: 3, arm0: 4, arm1: 5, wingN: 6, wingF: 7, fx: 8, fixed: 9 };
export const NK = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11', 'n12', 'n13', 'n14', 'n15'];
const MAXN = 16;
export function resolveJ(j) {
  if (j._R) return j._R;
  const nd = j.nodes, n = Math.min(MAXN, nd.length);
  const R = { n, pvx: j.pivot[0], pvy: j.pivot[1], deadH: j.deadH || 12, dpitch: j.dpitch || 0, fly: !!j.fly,
    kind: new Int8Array(n), par: new Int8Array(n), kids: new Uint8Array(n), x: new Float64Array(n), y: new Float64Array(n), ph: new Float64Array(n), ak: new Float64Array(n), dead: new Float64Array(n) };
  for (let i = 0; i < n; i++) {
    const [, kd, par, x, y, ph, ak] = nd[i];
    R.kind[i] = KIND[kd]; R.par[i] = par; R.x[i] = x; R.y[i] = y; R.ph[i] = ph || 0; R.ak[i] = ak === undefined ? 1 : ak;
    R.dead[i] = j.dead ? j.dead[i] || 0 : 0;
    if (par >= 0 && par < n) R.kids[par] = 1;
  }
  return (j._R = R);
}

// ---------------------------------------------------------------- the pose (one fixed-shape object) + emit
// P: pitch (body about the pivot), lift (px, + = down), ox (px forward: lunges, shakes), ang / sx / sy per node (its turn about
// its joint, and its scale there: a leg's foot lift, a wing's foreshortening, a pulsing spray).
export function newP() { return { pitch: 0, lift: 0, ox: 0, ang: new Float64Array(MAXN), sx: new Float64Array(MAXN).fill(1), sy: new Float64Array(MAXN).fill(1) }; }
export const P = newP();
export function resetP(p = P) { p.pitch = p.lift = p.ox = 0; p.ang.fill(0); p.sx.fill(1); p.sy.fill(1); return p; }
const mat = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const TB = mat(), TK = Array.from({ length: MAXN }, mat);
let PUT = RIG.put;
const ok = (p) => p !== -1 && p !== null && p !== undefined;
/** Output every part of rp in J's node order, posed by p (part -> matrix in entry units). rp.sc scales the joints (a pose
 *  painted bigger: the swollen mosquito). */
export function emit(J, rp, p) {
  const sc = rp.sc || 1;
  rotAbout(J.pvx * sc, J.pvy * sc, p.pitch, p.ox, p.lift); keep(TB);
  for (let k = 0; k < J.n; k++) {
    const part = rp[NK[k]];
    if (J.kind[k] === 0) { const T = TK[k]; T.a = TB.a; T.b = TB.b; T.c = TB.c; T.d = TB.d; T.e = TB.e; T.f = TB.f; if (ok(part)) PUT(part, TB.a, TB.b, TB.c, TB.d, TB.e, TB.f); continue; }
    if (!ok(part) && !J.kids[k]) continue;   // nothing drawn here this pose, nothing hangs off it
    const pa = J.par[k], T = pa < 0 ? TB : TK[pa];
    squashAbout(J.x[k] * sc, J.y[k] * sc, p.sx[k], p.sy[k], p.ang[k]); inP(T);
    const Q = keep(TK[k]);
    if (ok(part)) PUT(part, Q.a, Q.b, Q.c, Q.d, Q.e, Q.f);
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

/** The pose numbers a WHOLE frame is painted with (the driver's rest for this pose; rp.wf: 1 / 2 = walk frames (the stride at
 *  its two ends), 3 / 4 = wings up / down). dead = the limp rest the dead body settles to. Used by sprites-bugs.js. */
export function restP(J, rp, D, p, dead) {
  resetP(p);
  if (dead) { p.pitch = J.dpitch; for (let k = 0; k < J.n; k++) p.ang[k] = J.dead[k]; return p; }
  p.pitch = rp.pitch || 0; p.lift = rp.lift || 0; p.ox = rp.hx || 0;
  const A = rp.A, wf = rp.wf | 0;
  for (let k = 0; k < J.n; k++) {
    let a = A ? A[k] || 0 : 0;
    const kd = J.kind[k];
    if (kd === 1 && (wf === 1 || wf === 2) && rp.gait === 1) {
      const th = (wf === 1 ? 0.5 : 1.5) * PI + J.ph[k], c = Math.cos(th);
      a += -D.legA * J.ak[k] * Math.sin(th);
      p.sy[k] = 1 - (c > 0 ? D.fold * c * J.ak[k] : 0);
    } else if ((kd === 6 || kd === 7) && (wf === 3 || wf === 4) && rp.flap) {
      const s = wf === 3 ? -1 : 1;
      a += s * D.wAmp * (kd === 7 ? 0.85 : 1);
      p.sy[k] = wf === 3 ? 1 - D.wSq * 0.6 : 1;
    }
    p.ang[k] = a;
  }
  if (wf === 1 || wf === 2) p.lift += -D.bob;
  return p;
}

// ---------------------------------------------------------------- per-slot memory (own arrays; reset with fresh())
const NS = 32768;
const AMP = new Float32Array(NS), LC = new Float32Array(NS), PH = new Float32Array(NS), LZ = new Float32Array(NS), CODE = new Int16Array(NS);
// springs (of the slot's 12): 0 pitch, 1 bob (px), 2 abdomen, 3 head, 4 blade 0, 5 blade 1, 6 legs flail (offset), 7 near wing,
// 8 far wing, 9 lunge (px), 10 effect part, 11 free

// ---------------------------------------------------------------- 'bug' alive
// rp (entry rig.parts(pose)): n0..n15 part per node, A (rest angle per node), gait (0 hold the pose's legs, 1 scuttle when moving,
// 2 flail (in the air), 3 dangle (a flyer's legs)), flap (0 wings held at A, 1 buzz), pitch, lift, hx (lunge px), shake (rad: the
// whole body shudders), sc (joint scale), code (pose id: a change kicks), kp kb ka kh k0 k1 kw (kicks entering the pose: pitch,
// bob px/s, abdomen, head, blade 0, blade 1, wings).
function bugAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = BT[rg.q] || BASE, K = D.K, s = I.slot, now = I.now;
  const A = rp.A, n = J.n, air = I.z > 1.5 && !J.fly;
  if (fresh(s, u, now)) {
    AMP[s] = I.moving ? 1 : 0; LC[s] = I.cyc; PH[s] = I.ph * 2 * PI; LZ[s] = I.z; CODE[s] = rp.code;
    setAngle(s, 0, rp.pitch); setAngle(s, 1, rp.lift); setAngle(s, 9, rp.hx);
    for (let k = 0; k < n; k++) { const kd = J.kind[k]; if (kd === 2) setAngle(s, 2, A[k]); else if (kd === 3) setAngle(s, 3, A[k]); else if (kd === 4) setAngle(s, 4, A[k]); else if (kd === 5) setAngle(s, 5, A[k]); else if (kd === 6) setAngle(s, 7, A[k]); else if (kd === 7) setAngle(s, 8, A[k]); else if (kd === 8) setAngle(s, 10, A[k]); }
  }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const vx = u.vx || 0, vy = u.vy || 0, sp = Math.sqrt(vx * vx + vy * vy);
  // stride phase (strides walked: a full leg cycle = 2) + eased stride amplitude
  let dc = I.cyc - LC[s]; LC[s] = I.cyc;
  if (!(dc > 0 && dc < 3)) dc = 0;
  let amp = AMP[s];
  if (dt > 0) { amp += ((I.moving && rp.gait === 1 && !air ? 1 : 0) - amp) * Math.min(1, dt * 8); AMP[s] = amp; }
  let th = PH[s] + dc * PI * D.gaitK;
  if (th > 200) th -= 64 * PI;
  PH[s] = th;
  // kicks: speeding up tips the body back and swings abdomen, head, legs; blows; attacks; pose changes; landing
  if (dt > 0) {
    const a = In.ax * dt;
    kick(s, 0, -a * D.accel); kick(s, 2, a * D.accelAb); kick(s, 3, -a * D.accelHead); kick(s, 6, a * D.accelLeg);
    if (In.hit) {
      const h = In.hit * (D.hit + D.hitPow * In.hitPow);
      kick(s, 0, h); kick(s, 1, D.hitBob * (0.6 + In.hitPow)); kick(s, 2, -1.4 * h); kick(s, 3, 1.5 * h); kick(s, 4, 2 * h); kick(s, 5, 2 * h);
      kick(s, 6, 3 * Math.abs(h)); kick(s, 7, D.wingHit * h); kick(s, 8, D.wingHit * h);
    }
    if (In.atkStart) { kick(s, 3, D.atkHead); kick(s, 9, D.atkLunge); }
    if (CODE[s] !== rp.code) { kick(s, 0, rp.kp); kick(s, 1, rp.kb); kick(s, 2, rp.ka); kick(s, 3, rp.kh); kick(s, 4, rp.k0); kick(s, 5, rp.k1); kick(s, 7, rp.kw); kick(s, 8, rp.kw); }
    if (LZ[s] > 1.5 && I.z <= 1.5 && !J.fly) { kick(s, 1, D.land); kick(s, 2, -D.land * 0.04); kick(s, 3, D.land * 0.02); kick(s, 6, D.land * 0.05); }
  }
  CODE[s] = rp.code; LZ[s] = I.z;
  // body
  const ph = I.ph * 6.28, rt = I.rt;
  const shake = rp.shake ? rp.shake * Math.sin(now * 47 + ph * 3) : 0;
  const hov = J.fly && rp.flap ? D.hover * Math.sin(rt * D.hoverW + ph) : 0;
  const gbob = amp * -D.bob * Math.abs(Math.sin(th));
  P.pitch = spring(s, 0, rp.pitch + amp * D.rock * Math.sin(2 * th) + shake * 0.5, K.pitch, dt, 1.2);
  P.lift = spring(s, 1, rp.lift, K.bob, dt, 8) + gbob + hov + (I.moving || J.fly ? 0 : D.breathe * Math.sin(rt * 2.3 + ph));
  P.ox = spring(s, 9, rp.hx, K.lunge, dt, 8) + shake * 6;
  // parts
  const LA = D.legA * cl(0.6 + 0.4 * sp / D.walkV, 0.6, 1.3);
  const flail = spring(s, 6, 0, K.leg, dt, 1.2);
  const wk = 2 * PI * D.wHz * rt + ph;
  for (let k = 0; k < n; k++) {
    const kd = J.kind[k];
    let a = A[k] || 0, sx = 1, sy = 1;
    if (kd === 1) {
      const g = rp.gait, p = th + J.ph[k];
      if (g === 2 || (air && g !== 0)) a += 0.4 * Math.sin(now * 14 + k * 1.9 + ph * 6);
      else if (g === 3) a += 0.1 * Math.sin(rt * 2.4 + k * 1.3 + ph * 6) + flail * 0.8;
      else if (amp > 0.002) { a += -amp * LA * J.ak[k] * Math.sin(p); const c = Math.cos(p); sy = 1 - (c > 0 ? amp * D.fold * c * J.ak[k] : 0); }
      else if (!I.moving) a += 0.035 * Math.sin(rt * 1.7 + ph * 6.28 + k * 1.3);
      if (g !== 3) a += flail * ((k & 1) ? 0.7 : -0.7);
    } else if (kd === 2) a = spring(s, 2, a + amp * D.abW * Math.sin(2 * th + 0.6) + (J.fly ? 0.06 * Math.sin(rt * 3.1 + ph) : 0.02 * Math.sin(rt * 1.9 + ph)), K.ab, dt, 1.4);
    else if (kd === 3) a = spring(s, 3, a + amp * D.nod * Math.sin(2 * th + 1.1) + 0.035 * Math.sin(rt * 1.6 + ph * 2), K.head, dt, 1.2);
    else if (kd === 4) a = spring(s, 4, a + (I.moving ? 0.07 * Math.sin(th) : 0.04 * Math.sin(rt * 1.3 + ph)), K.arm, dt, 2.4);
    else if (kd === 5) a = spring(s, 5, a + (I.moving ? -0.07 * Math.sin(th) : 0.04 * Math.sin(rt * 1.3 + ph + 0.8)), K.arm, dt, 2.4);
    else if (kd === 6 || kd === 7) {
      a = spring(s, kd === 6 ? 7 : 8, a, K.wing, dt, 2.6);
      if (rp.flap) { const w = Math.sin(wk + (kd === 7 ? D.wLag : 0)); a += D.wAmp * (kd === 7 ? 0.85 : 1) * w; sy = 1 - D.wSq * (0.5 - 0.5 * w); }
    } else if (kd === 8) { a = spring(s, 10, a, K.fx, dt, 2); const q = 1 + D.fxPulse * Math.sin(rt * D.fxHz + ph); sx = q; sy = 2 - q; }
    P.ang[k] = a; P.sx[k] = sx; P.sy[k] = sy;
  }
  emit(J, rp, P);
  return true;
}

// ---------------------------------------------------------------- 'bug' dead
// On its back: every joint settles (flop) to its dead rest (+- dVar per body), the legs kick a few times first (twitch) then curl
// still; flying through the air, everything flails.
function bugBody(ent, rp, id, t, air, now) {
  const rg = ent.e.rig, J = rg._J || (rg._J = resolveJ(rg.joints)), D = BT[rg.q] || BASE, n = J.n;
  for (let k = 0; k < n; k++) {
    const kd = J.kind[k], h = h01(id, k), end = J.dead[k] + (h - 0.5) * D.dVar * (kd === 1 ? 1 : 0.6);
    let a;
    if (air) a = end * 0.5 + (kd === 0 ? 0 : 0.45 * Math.sin(now * 13 + k * 1.7 + h * 6));
    else {
      a = flop(end, t);
      if (kd === 1) a += D.twitch * Math.exp(-t * 2.4) * Math.sin(t * D.twitchHz + k * 2.1 + h * 6) * (t > 0 ? 1 : 0);
    }
    P.ang[k] = a; P.sx[k] = 1; P.sy[k] = 1;
  }
  P.pitch = air ? 0.15 * Math.sin(now * 7 + h01(id, 15) * 6) : flop(J.dpitch, t); P.lift = 0; P.ox = 0;
  const n0 = OUT.n;
  emit(J, rp, P);
  onBack(n0, J.deadH * (rp.sc || 1));
  return true;
}
register('bug', { alive: bugAlive, body: bugBody });

// ---------------------------------------------------------------- 'hive'
// rp = { main } (the pose itself), rp.shake (buzz: it shudders). Springs: 0 tilt about the base, 1 squash (y scale - 1).
function hiveAlive(ent, rp, u, I) {
  const s = I.slot, now = I.now, H = HIVE;
  fresh(s, u, now);
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0 && In.hit) { kick(s, 0, In.hit * (H.hitTilt + 4 * In.hitPow)); kick(s, 1, -(H.hitSquash + 5 * In.hitPow)); }
  const ph = I.ph * 6.28, sh = rp.shake ? 1 : 0;
  const tilt = spring(s, 0, H.sway * Math.sin(I.rt * 1.1 + ph), H.tilt, dt, 0.5) + sh * H.shake * Math.sin(now * 43 + ph);
  const sq = spring(s, 1, sh * 0.03 * Math.sin(now * 29 + ph), H.squash, dt, 0.4);
  squashAbout(0, 0, 1 - sq * 0.6, 1 + sq, tilt);
  RIG.put(rp.main, M.a, M.b, M.c, M.d, M.e + sh * H.shakeX * Math.sin(now * 51 + ph * 2), M.f);
  return true;
}
register('hive', { alive: hiveAlive });
