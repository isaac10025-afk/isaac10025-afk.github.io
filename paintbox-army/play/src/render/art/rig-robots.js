// ROBOTS tab floppy-body drivers (OURS, Part 2 step 6, STEP6.md; contract RIG.md). Owner: ROBOTS-ART. Parts: sprites-robots.js.
// One driver, 'robot', for all 8 robots; rig.mode picks how it moves:
//   'legs'   laserbot / magnetbot / shieldbot / bombbot: stubby legs swing with the stride, the box body lags and rocks on its
//            hips, the head bobs after it, the kid antenna on top WHIPS (soft spring: every step, speed change and hit sets it
//            off), the arm swings into each new pose, a charge makes the body shudder (magnet bot), the wind-up key spins.
//   'wheel'  sawbot: a unicycle. The wheel turns with the ground covered, the body rocks on the hub (leans into its speed,
//            pitches back when it brakes, bounces on a hit), the saw blade spins (fast + blurred on a saw run, with sparks).
//   'tread'  repairbot: the treads crawl (two tread frames by distance), the body judders on them, the hard hat jiggles.
//   'fly'    drone: hovers (bob), tilts into its flight, a hit sends it reeling; on the ground (webbed) it sits still.
//   'mech'   mech: heavy two-leg walker. The body dips on every step, the near leg is in front of the body, the rocket-pod
//            lid swings open on a salvo (and bounces), a stomp lifts the near leg high and SLAMS it (body jolts down).
// Dead: every robot falls apart into a scrap heap (WRECK in each entry's rig: each part tumbles to its own place on the
// ground with a bounce, seeded per body), with loose bolts + a gear, and a puff of smoke that rises and goes in ~0.55 s
// (gone before RENDER paints the body into the ground). No allocation per unit per frame (typed arrays + scratch objects).
//
// The same placement code paints the whole sprites (layout / layoutDead below, called by sprites-robots.js at bake time),
// so a whole frame and the rigged parts at rest always agree.
import * as RIG from './rig.js';
const { clamp, fresh, spring, kick, setAngle, inputs, rotAbout, squashAbout, flop, h01, register, M, put } = RIG;
export const ready = true;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping]: damping ratio c / (2 sqrt k) ~0.2-0.3 (they overshoot 2-3 times). Angles: + = clockwise
// on screen in the facing-right frame (the top leans forward). Kicks in rad/s (px/s for bob / lift).
export const RB = {
  K: {
    tor: [120, 6], head: [190, 5.5], arm: [150, 6.5], top: [55, 1.7], bob: [170, 6.5],
    hat: [80, 2.4], lid: [95, 3.2], lift: [240, 10], tilt: [70, 3.6],
  },
  accel: 0.0011, lean: 1 / 800,           // body lags a speed change; leans into its speed (max 0.1)
  hit: 3, hitPow: 10,                     // a blow: (3 + 10 pow) rad/s on the body, x2 the head, x1 the arm
  atkArm: -7, atkTorso: -1.4,             // an attack starting kicks the arm up and the body back
  poseArm: -3.5, poseTop: 2.2,            // a new pose: the arm swings into it, the antenna is set off
  walk: 0.42, run: 0.72, bob: 0.8, idle: 0.08,
  top: { accel: 0.0042, hit: 2.6, step: 1.7, lean: 1 / 500 },   // the antenna: lags, whips on hits + steps, trails with speed
  charge: { shake: 0.04, w: 57 },         // charging (magnet bot): the body shudders
  wheel: { lean: 1 / 650, accel: 0.0024, rock: 0.04, leanMax: 0.22 },
  tread: { bump: 0.55, rate: 3 },         // judder px, tread frames per stride
  fly: { bob: 1.3, w: 3.2, tilt: 1 / 650, tiltMax: 0.32, hit: 9, accel: 0.0018 },
  mech: { swing: 0.3, run: 0.42, bob: 1.8, sway: 0.025, hit: 0.25, step: 5, lid: -1.85, lift: -0.62, liftUp: 7, liftT: 0.25, slam: 22 },
  saw: { idle: 2.2, spin: 36 },           // blade turn rate rad/s (spinning = blurred)
  key: { idle: 2, run: 15 },              // wind-up key turn rate rad/s
  smoke: { t: 0.55, rise: -13, s0: 0.35, s1: 1.15 },
  dead: { jA: 0.6, jX: 4.5 },             // wreck jitter per body: angle, x
};

// ---------------------------------------------------------------- per-slot memory + scratch
const NS = 32768;
const CODE = new Int16Array(NS), STEP = new Int32Array(NS), TOOL = new Float32Array(NS), KEYA = new Float32Array(NS);
const ACT = new Int8Array(NS), SLAM = new Int8Array(NS);
const T0 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TH = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, TA = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
// ST = the pose state that place() lays out: body turn + bob, head, arm, antenna, legs, near-leg lift, wheel turn, tool
// turn, pod lid, key squash, hat.
const ST = { tor: 0, bob: 0, hd: 0, ar: 0, top: 0, lN: 0, lF: 0, lift: 0, wa: 0, tool: 0, lid: 0, key: 1, hat: 0, tread: 0 };

// output: put() into RIG.OUT, or (bake time) a painter
let PAINT = null;
function emit(pi, a, b, c, d, e, f) { if (pi < 0) return; if (PAINT) PAINT(pi, a, b, c, d, e, f); else put(pi, a, b, c, d, e, f); }
const oM = (pi) => emit(pi, M.a, M.b, M.c, M.d, M.e, M.f);
const oT = (pi, T) => emit(pi, T.a, T.b, T.c, T.d, T.e, T.f);
function oIn(pi, P) { emit(pi, P.a * M.a + P.c * M.b, P.b * M.a + P.d * M.b, P.a * M.c + P.c * M.d, P.b * M.c + P.d * M.d, P.a * M.e + P.c * M.f + P.e, P.b * M.e + P.d * M.f + P.f); }
function keepIn(P, T) {   // T = P · M
  const a = P.a * M.a + P.c * M.b, b = P.b * M.a + P.d * M.b, c = P.a * M.c + P.c * M.d, d = P.b * M.c + P.d * M.d;
  T.e = P.a * M.e + P.c * M.f + P.e; T.f = P.b * M.e + P.d * M.f + P.f; T.a = a; T.b = b; T.c = c; T.d = d; return T;
}
function keepM(T) { T.a = M.a; T.b = M.b; T.c = M.c; T.d = M.d; T.e = M.e; T.f = M.f; return T; }

// ---------------------------------------------------------------- placement (state -> parts, back to front)
// rp keys (indices, -1 = none): legF legN wheel tread0 tread1 key body pod lid head top hat arm tool fx rot (+ smoke scrap
// for the dead); numbers: code (pose code), gait, lean, swing, lidA (lid angle), lift (stomp leg), spin (saw run), shake.
// J (rig.J): pivot (body turns about it), legX, hip (leg top), neck, top (antenna base, in the head frame or the body frame
// when there is no head), shoulder, hub (wheel), wr, toolHub (in the arm frame), lid (hinge), keyHub, hat (hat base, head
// frame), nearFront (mech: near leg drawn after the body).
function place(J, rp, s) {
  const hy = J.hip ? J.hip[1] : 0, legX = J.legX || 0;
  if (rp.legF >= 0) { rotAbout(0, hy, s.lF, -legX, s.bob * 0.4); oM(rp.legF); }
  if (rp.legN >= 0 && !J.nearFront) { rotAbout(0, hy, s.lN, legX, s.bob * 0.4); oM(rp.legN); }
  if (rp.wheel >= 0) { rotAbout(J.hub[0], J.hub[1], s.wa); oM(rp.wheel); }
  const tr = s.tread ? rp.tread1 : rp.tread0;
  if (tr >= 0) { rotAbout(0, 0, 0, 0, s.bob * 0.25); oM(tr); }
  rotAbout(J.pivot[0], J.pivot[1], s.tor, 0, s.bob); const T = keepM(T0);
  if (rp.key >= 0) { squashAbout(J.keyHub[0], J.keyHub[1], 1, s.key); oIn(rp.key, T); }
  oT(rp.body, T);
  if (rp.pod >= 0) oT(rp.pod, T);
  if (rp.lid >= 0) { rotAbout(J.lid[0], J.lid[1], s.lid); oIn(rp.lid, T); }
  let H = T;
  if (rp.head >= 0) { rotAbout(J.neck[0], J.neck[1], s.hd); H = keepIn(T, TH); oT(rp.head, H); }
  if (rp.top >= 0) { rotAbout(J.top[0], J.top[1], s.top); oIn(rp.top, H); }
  if (rp.hat >= 0) { rotAbout(J.hat[0], J.hat[1], s.hat); oIn(rp.hat, H); }
  if (rp.rot >= 0) oT(rp.rot, T);
  if (rp.legN >= 0 && J.nearFront) { rotAbout(0, hy, s.lN + s.lift, legX, s.bob * 0.4 + s.lift / RB.mech.lift * -RB.mech.liftUp); oM(rp.legN); }
  if (rp.arm >= 0) {
    rotAbout(J.shoulder[0], J.shoulder[1], s.ar); const A = keepIn(T, TA); oT(rp.arm, A);
    if (rp.tool >= 0) { rotAbout(J.toolHub[0], J.toolHub[1], s.tool); oIn(rp.tool, A); }
    if (rp.fx >= 0) oT(rp.fx, A);
  }
}
function restState(rp) {
  const s = ST, g = rp.gait | 0;   // gait: 0 stand, 1 walk0, 2 walk1, 3 run0, 4 run1
  s.tor = rp.lean || 0; s.bob = 0; s.hd = 0; s.ar = 0; s.top = 0; s.hat = 0; s.lift = rp.lift || 0; s.lid = rp.lidA || 0;
  s.tool = g === 2 || g === 4 ? 0.22 : 0; s.key = g === 4 ? 0.35 : 1; s.tread = 0;
  const A = rp.swing || RB.walk, B = rp.swing ? rp.swing * 1.6 : RB.run;
  s.lN = g === 1 ? A : g === 2 ? -A : g === 3 ? B : g === 4 ? -B : RB.idle * 0.5; s.lF = -s.lN;
  s.wa = g === 2 ? Math.PI / 4 : 0;
  return s;
}
/** Bake time: lay out the parts of an entry pose at rest; paint(pi, a, b, c, d, e, f) per part, back to front. */
export function layout(rg, rp, paint) { PAINT = paint; try { place(rg.J, rp, restState(rp)); } finally { PAINT = null; } }
/** Bake time: the finished scrap heap (the whole dead frame). */
export function layoutDead(rg, rp, paint) { PAINT = paint; try { wreck(rg, rp, 0, 99, false, 0); } finally { PAINT = null; } }

// ---------------------------------------------------------------- 'robot' alive
function robotAlive(ent, rp, u, I) {
  const rg = ent.e.rig, J = rg.J, mode = rg.mode, s = I.slot, now = I.now, st = Math.floor(I.cyc * (mode === 'tread' ? RB.tread.rate : 1));
  const b = u.b, act = b ? b.act | 0 : 0;
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean || 0); setAngle(s, 6, rp.lidA || 0); CODE[s] = rp.code; STEP[s] = st; TOOL[s] = 0; KEYA[s] = 0; ACT[s] = act; SLAM[s] = 0; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  const heavy = mode === 'mech', fwd = (u.vx || 0) * I.flip, mv = I.moving;
  if (CODE[s] !== rp.code) { kick(s, 2, RB.poseArm); kick(s, 3, RB.poseTop); CODE[s] = rp.code; }
  if (dt > 0) {
    const acc = mode === 'wheel' ? RB.wheel.accel : mode === 'fly' ? RB.fly.accel : RB.accel;
    kick(s, 0, -In.ax * acc * dt * (heavy ? 0.3 : 1)); kick(s, 3, -In.ax * RB.top.accel * dt);
    if (In.hit) {
      const h = In.hit * (RB.hit + RB.hitPow * In.hitPow);
      kick(s, 0, h * (heavy ? RB.mech.hit : mode === 'fly' ? RB.fly.hit / RB.hit : 1)); kick(s, 1, 2 * h); kick(s, 2, h); kick(s, 3, RB.top.hit * h); kick(s, 7, RB.top.hit * h);
      kick(s, 4, -(heavy ? 4 : 10) * (0.3 + In.hitPow));
    }
    if (In.atkStart) { kick(s, 2, RB.atkArm); kick(s, 0, RB.atkTorso * (heavy ? 0.3 : 1)); }
    if (mv && st !== STEP[s]) {
      kick(s, 3, (st & 1 ? 1 : -1) * RB.top.step); kick(s, 7, (st & 1 ? 1 : -1) * RB.top.step);
      if (heavy) kick(s, 4, RB.mech.step);
    }
  }
  STEP[s] = st;
  const S = ST;
  S.tread = 0; S.key = 1; S.lift = 0; S.wa = 0; S.tool = 0;
  // legs / wheel / treads / hover
  let torT = rp.lean || 0, bobT = 0;
  const walkS = mv ? Math.sin(I.cyc * Math.PI) : 0;
  if (mode === 'legs' || mode === 'mech') {
    const A = heavy ? (I.run ? RB.mech.run : RB.mech.swing) : rp.swing ? rp.swing * (I.run ? 1.6 : 1) : I.run ? RB.run : RB.walk;
    if (mv) { S.lN = A * walkS; S.lF = -A * walkS; bobT = heavy ? RB.mech.bob * Math.abs(walkS) : -RB.bob * Math.abs(walkS); torT += heavy ? RB.mech.sway * walkS : clamp(fwd * RB.lean, -0.05, 0.1); }
    else { const sw = 0.025 * Math.sin(I.rt * 1.7 + I.ph * 6.28); S.lN = RB.idle * 0.5 + sw; S.lF = -RB.idle * 0.5 - sw; }
  } else if (mode === 'wheel') {
    S.wa = I.cyc * Math.max(3.2, ent.defR * 0.8) / J.wr;
    S.lN = 0; S.lF = 0;
    torT += clamp(fwd * RB.wheel.lean, -RB.wheel.leanMax * 0.5, RB.wheel.leanMax) + (mv ? RB.wheel.rock * Math.sin(S.wa * 2) : 0);
  } else if (mode === 'tread') {
    S.tread = st & 1; S.lN = 0; S.lF = 0;
    bobT = mv ? -RB.tread.bump * Math.abs(Math.sin(I.cyc * Math.PI * RB.tread.rate)) : 0;
  } else if (mode === 'fly') {
    S.lN = 0; S.lF = 0;
    if (I.z > 2) { bobT = RB.fly.bob * Math.sin(I.rt * RB.fly.w + I.ph * 6.28); torT += clamp(fwd * RB.fly.tilt, -RB.fly.tiltMax * 0.6, RB.fly.tiltMax); }
  }
  if (rp.shake) torT += RB.charge.shake * Math.sin(I.rt * RB.charge.w + I.ph * 9);
  S.tor = spring(s, 0, torT, mode === 'fly' ? RB.K.tilt : RB.K.tor, dt, mode === 'fly' ? 1.2 : 0.8);
  S.hd = spring(s, 1, 0, RB.K.head, dt, 0.7);
  S.ar = spring(s, 2, 0, RB.K.arm, dt, 1.2);
  S.top = spring(s, 3, -clamp(fwd * RB.top.lean, -0.25, 0.35), RB.K.top, dt, 1.1);
  S.bob = spring(s, 4, bobT, RB.K.bob, dt, 8);
  S.hat = spring(s, 7, 0, RB.K.hat, dt, 0.6);
  // tool (saw) + key turn, pod lid, stomp
  if (rp.tool >= 0) { TOOL[s] += dt * (rp.spin ? RB.saw.spin : RB.saw.idle); if (TOOL[s] > 1e4) TOOL[s] -= 6283.185307; S.tool = TOOL[s]; }
  if (rp.key >= 0) { KEYA[s] += dt * (mv ? RB.key.run : RB.key.idle); if (KEYA[s] > 1e4) KEYA[s] -= 6283.185307; S.key = Math.cos(KEYA[s]); }
  S.lid = rp.lid >= 0 ? spring(s, 6, rp.lidA || 0, RB.K.lid, dt, 2.4) : 0;
  if (heavy) {   // stomp: the near leg up for liftT, then slammed down (a jolt down)
    const ta = act === 2 && b ? now - (b.actT ?? now) : 99;
    const up = act === 2 && ta < RB.mech.liftT;
    if (act === 2 && ACT[s] !== 2) SLAM[s] = 0;
    if (act === 2 && !up && !SLAM[s]) { SLAM[s] = 1; kick(s, 4, RB.mech.slam); kick(s, 3, 2.5); }
    S.lift = spring(s, 8, up ? RB.mech.lift : 0, RB.K.lift, dt, 1);
  }
  ACT[s] = act;
  place(J, rp, S);
  return true;
}

// ---------------------------------------------------------------- dead: the scrap heap
// rg.wreck = [{ key, c: [cx, cy] rest middle of the part, to: [x, y] where its middle ends up, a: turn, t0: delay }].
// Progress k = flop(1, t - t0) (overshoots a little: it bounces as it lands). Parts not in the list are not drawn dead.
function wreck(rg, rp, id, t, air, now) {
  const W = rg.wreck, D = RB.dead;
  if (air) {   // flying through the air in one piece: things flail
    const s = restState(rp), k = now * 12 + h01(id, 9) * 6;
    s.hd = 0.4 * Math.sin(k * 1.3); s.ar = 0.9 * Math.sin(k * 0.8 + 2); s.top = 0.9 * Math.sin(k * 1.7); s.hat = 0.7 * Math.sin(k * 1.1);
    s.lN = 0.7 * Math.sin(k); s.lF = -0.6 * Math.sin(k * 0.9 + 1); s.wa = k * 0.7; s.tool = k * 0.5;
    place(rg.J, rp, s);
    return true;
  }
  for (let i = 0; i < W.length; i++) {
    const P = W[i], pi = rp[P.key];
    if (pi === undefined || pi < 0) continue;
    const k = t >= 50 ? 1 : flop(1, t - (P.t0 || 0));
    const a = (P.a + (h01(id, i) - 0.5) * D.jA * (P.j ?? 1)) * k;
    const tx = P.to[0] + (h01(id, i + 20) - 0.5) * D.jX * (P.j ?? 1);
    rotAbout(P.c[0], P.c[1], a, (tx - P.c[0]) * k, (P.to[1] - P.c[1]) * k);
    oM(pi);
  }
  if (rp.smoke >= 0 && t < RB.smoke.t && t >= 0) {   // a puff rises off the heap and goes
    const q = t / RB.smoke.t, sc = (RB.smoke.s0 + (RB.smoke.s1 - RB.smoke.s0) * q) * (q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25);
    squashAbout(rg.smokeAt[0], rg.smokeAt[1], sc, sc); M.f += RB.smoke.rise * q; M.e += 2 * q; oM(rp.smoke);
  }
  return true;
}
function robotBody(ent, rp, id, t, air, now) { return wreck(ent.e.rig, rp, id, t, air, now); }
register('robot', { alive: robotAlive, body: robotBody });

// ---------------------------------------------------------------- pose codes (a pose change is seen by number)
const CODES = new Map();
export function POSE_CODE(p) { let c = CODES.get(p); if (c === undefined) { c = CODES.size + 1; CODES.set(p, c); } return c; }
