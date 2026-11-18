// SIEGE tab floppy-body drivers (Part 2 step 4, OURS). Owner: SIEGE-ART. Contract: RIG.md. Parts: sprites-siege.js.
//   'siegeman'  shieldwall / halberd / crossbow / oilpot / siegecrew: the biped of rig.js plus a crouch (the hip drops on a
//               spring, the bent legs squash to fit, so a brace / kneel lands with a bounce), a weapon that SWINGS from one
//               pose's direction to the next (the halberd chop comes over the top, the set levels with a swing, the
//               crossbow drops to the crank), and a tower shield on its own lagging spring (carried) or planted in the
//               ground (brace: it only shudders when hit).
//   'ram'       covered ram: the frame rocks + bounces on lumpy wheels, the wheels turn with the ground covered, the log
//               hangs on two ropes as a pendulum (pulled back, flung out on the thrust, swings on after it).
//   'catapult'  the arm slams up into the padded crossbar on a fire (hard stop, bounces off it), the frame bucks, then
//               the arm is wound down slowly; the boulder rides in the cup.
//   'ballista'  the bow + stock pitch on the trestle (aim lifts it; a shot kicks it up and it wobbles down), the cart jerks back.
//   'tower'     the tall tower sways slowly on its wheels (soft spring, lots of lag), the drawbridge drops onto the wall
//               with a bounce (raised slowly), its chain stretches, the flag flutters.
// Dead machines settle into WRECK (also used by sprites-siege.js for the whole dead frame): wheels tip over / fall flat,
// the frame drops, the log / arm / bow fall; the siege tower topples over backwards. No allocation per unit per frame.
import * as RIG from './rig.js';
const { clamp, fresh, spring, kick, setAngle, inputs, rotAbout, squashAbout, keep, putIn, inP, putM, put, flop, h01, register, M, NSPR, BANK, LEG } = RIG;
export const ready = true;

// ---------------------------------------------------------------- our numbers (no OG source)
// Springs [stiffness, damping] (damping ratio c / (2 sqrt k) ~0.15-0.3: they overshoot 2-3 times). Kicks rad/s or px/s.
// Angles: + = clockwise on screen (the top leans forward), in the entry's facing-right frame.
export const SG = {
  man: {
    K: { torso: [120, 6.5], head: [210, 5.5], arm: [150, 7], shield: [110, 4.2], plant: [320, 7], drop: [170, 6.5] },
    accel: 0.0011, lean: 1 / 700, hit: 3, hitPow: 12, atkTorso: -1.6, walkArm: 0.09,
    swingMax: 2.4,          // a pose change starts the weapon where the old pose held it (max this far round)
    shieldAccel: 0.0013, shieldHit: 1.3, shieldSwing: 0.05,   // carried shield lags a speed change, swings with the stride
    plantHit: 0.45, plantKick: 2.2,                           // planted: shudders when hit; thunks when planted / lifted
    dropKick: 7,            // a crouch / stand-up lands with a bounce (px/s per px of drop change)
    stride: 0.5, bob: 0.9, idle: 0.09, fly: 0.95,
  },
  cart: {                   // every machine
    K: { tilt: [90, 4.6], bob: [150, 5.2] }, accel: 0.0005, hit: 0.2, hitPow: 0.9, hitBob: 6,   // heavy: a blow rocks it a little
    bump: 0.7, rock: 0.025, // lumpy kid wheels: a bounce + a rock twice a turn
  },
  ram: { K: { log: [42, 1.5] }, thrust: 7, back: -2.2, kickTilt: -0.8, kickBob: 6, hitLog: 1.6, bumpLog: 0.05 },
  catapult: { K: { fire: [260, 3], reset: [20, 6] }, push: 0.5, bounce: 0.45, kickTilt: -1.6, kickBob: -24, hitArm: 0.8 },
  ballista: { K: { pitch: [150, 3.6] }, kickPitch: -4.5, kickTilt: -0.9, kickBob: -9, hitPitch: 1.2 },
  tower: {
    K: { tilt: [26, 1.6], down: [38, 2.2], up: [10, 5], flag: [70, 2.2] },
    accel: 0.0016, rock: 0.035, stop: 0.08, bounce: 0.38, hitBridge: 1.2, hitK: 0.55,   // tall + soft: smaller kicks
    flagW: 7, flagA: 0.12, flagLean: 1 / 250,
  },
};

// ---------------------------------------------------------------- machine geometry (sprite px; shared with sprites-siege.js)
// hub: near wheel hubs (the wheel part is painted at hub 0); far: the far wheels' offset (painted in the frame); pivot0: the
// frame rocks about it (middle of the axle line).
export const G_RAM = { wr: 6.6, hub: [[-17, -6.6], [15, -6.6]], far: [2.8, -2.4], pivot0: [0, -6.6], ropeX: [-12, 8], ropeTop: -28.6, L: 9,
  swing: { idle: 0, roll0: 0, roll1: 0, back: -0.55, thrust: 0.78 } };
export const G_CAT = { wr: 6.2, hub: [[-14, -6.2], [14, -6.2]], far: [2.6, -2.2], pivot0: [0, -6.2], pivot: [-6, -14], arm: 27, cock: -2.9, fire: 1.8 };
export const G_BAL = { wr: 5.6, hub: [[-11, -5.6], [10, -5.6]], far: [2.4, -2], pivot0: [0, -5.6], pivot: [-1, -21.6] };
export const G_TOW = { wr: 7.2, hub: [[-11, -7.2], [11, -7.2]], far: [2.6, -2.6], pivot0: [0, -7.2], hinge: [16.6, -58], bridgeL: 26.4, dock: 1.52,
  chainTop: [14.8, -82.6], flagBase: [0, -86.6] };
/** Where the drawbridge chain meets the bridge (0.85 of its length) with the bridge turned by a from upright. */
export function towChainEnd(a, out) { const G = G_TOW, l = G.bridgeL * 0.85; out[0] = G.hinge[0] + Math.sin(a) * l; out[1] = G.hinge[1] - Math.cos(a) * l; return out; }

// Wrecks: each part turns by a about (px, py), squashes to sy about (qx, qy), moves (dx, dy); progress k 0..1 over time
// (flop, after t0 s; fall = a falling time instead: accelerates, thumps down). parent: 'frame' = rides on the frame.
// Wheels: hub i, turned / squashed about their ground contact (a flat wheel = sy 0.38). name = part painter, key = rp key.
export const WRECK = {
  ram: { G: G_RAM, parts: [
    { name: 'frame', key: 'frame', px: 0, py: -6.6, a: -0.07, dy: 5.4, t0: 0.04 },
    { name: 'log', key: 'log', px: 0, py: -16.8, a: 0.06, dx: 4.6, dy: 13.2, t0: 0.08 },
    { name: 'wheel', key: 'wheel', hub: 0, a: 0.6, dx: -4.4, sy: 0.38 },
    { name: 'wheel', key: 'wheel', hub: 1, a: 0.5, dx: 6.4 },
  ], splinters: [[-28, -1, 0.3, 6], [27, -0.8, -0.4, 5], [4, -1.2, 0.1, 4.4]] },
  catapult: { G: G_CAT, parts: [
    { name: 'frame', key: 'frame', px: 0, py: -6.2, a: 0.08, dy: 4.4, t0: 0.04 },
    { name: 'arm', key: 'arm', parent: 'frame', px: -6, py: -14, a: -0.32, t0: 0.12 },
    { name: 'wheel', key: 'wheel', hub: 0, a: 0.4, dx: -3.4, sy: 0.38 },
    { name: 'wheel', key: 'wheel', hub: 1, a: 0.55, dx: 5.2 },
  ], splinters: [[-26, -1, 0.2, 5.4], [22, -0.8, -0.5, 4.6], [-2, -1.2, 0.6, 3.6]] },
  ballista: { G: G_BAL, parts: [
    { name: 'frame', key: 'frame', px: 0, py: -5.6, a: -0.06, dy: 3.8, t0: 0.04 },
    { name: 'stockE', key: 'wreck', parent: 'frame', px: -1, py: -21.6, a: 0.42, t0: 0.1 },
    { name: 'wheel', key: 'wheel', hub: 0, a: 0.5, dx: -3, sy: 0.38 },
    { name: 'wheel', key: 'wheel', hub: 1, a: 0.5, dx: 4.6 },
  ], splinters: [[-19, -1, 0.3, 4.6], [18, -0.8, -0.4, 4], [2, -1.2, 0.1, 3.4]] },
  siegetower: { G: G_TOW, parts: [
    { name: 'frame', key: 'frame', px: -18.4, py: -11, a: -1.524, dy: 10.2, fall: 0.55 },
    { name: 'flag', key: 'flag', parent: 'frame', px: 0, py: -86.6, a: 0.9, t0: 0.5 },
    { name: 'bridge', key: 'bridge', parent: 'frame', px: 16.6, py: -58, a: 0.5, t0: 0.45 },
    { name: 'wheel', key: 'wheel', hub: 0, a: 0.3, dx: -7, sy: 0.38 },
    { name: 'wheel', key: 'wheel', hub: 1, a: 0.6, dx: 10 },
  ], splinters: [[-30, -1, 0.2, 7], [-60, -0.8, -0.3, 6], [14, -1.2, 0.5, 5], [-86, -1, 0.1, 5.4]] },
};
/** out[0..5] = the wreck matrix of part P at progress k (see WRECK). */
export function wreckMat(G, P, k, out) {
  let px = P.px || 0, py = P.py || 0, qx = P.qx ?? px, qy = P.qy ?? py, bx = 0, by = 0;
  if (P.hub !== undefined) { px = qx = G.hub[0][0]; py = qy = 0; bx = G.hub[P.hub][0] - G.hub[0][0]; by = G.hub[P.hub][1] - G.hub[0][1]; }
  const sy = 1 + ((P.sy ?? 1) - 1) * k, a = (P.a || 0) * k, cs = Math.cos(a), sn = Math.sin(a);
  const ex = px - cs * px + sn * py, fy = py - sn * px - cs * py, t = qy * (1 - sy);
  out[0] = cs; out[1] = sn; out[2] = -sn * sy; out[3] = cs * sy; out[4] = -sn * t + ex + bx + (P.dx || 0) * k; out[5] = cs * t + fy + by + (P.dy || 0) * k;
  return out;
}
function mul(P, Q, out) {   // out = P · Q
  const a = P[0] * Q[0] + P[2] * Q[1], b = P[1] * Q[0] + P[3] * Q[1], c = P[0] * Q[2] + P[2] * Q[3], d = P[1] * Q[2] + P[3] * Q[3];
  const e = P[0] * Q[4] + P[2] * Q[5] + P[4], f = P[1] * Q[4] + P[3] * Q[5] + P[5];
  out[0] = a; out[1] = b; out[2] = c; out[3] = d; out[4] = e; out[5] = f; return out;
}
/** Wreck progress of a part t s after death. */
export function wreckK(P, t) {
  const u = t - (P.t0 || 0);
  if (u <= 0) return 0;
  if (P.fall) { if (u < P.fall) { const q = u / P.fall; return q * q; } const v = u - P.fall; return 1 - 0.07 * Math.exp(-7 * v) * Math.abs(Math.sin(15 * v)); }
  return flop(1, u);
}
/** The whole wreck (k = 1, or progress by t): calls fn(name, matrix) for each part in draw order (sprites-siege.js). */
export function eachWreck(type, fn, t = Infinity) {
  const W = WRECK[type]; if (!W) return;
  const F = new Float64Array(6), Q = new Float64Array(6), O = new Float64Array(6);
  for (const P of W.parts) {
    const k = t === Infinity ? 1 : wreckK(P, t);
    wreckMat(W.G, P, k, Q);
    if (P.parent) { mul(F, Q, O); fn(P.name, O); } else { if (P.name === 'frame') F.set(Q); fn(P.name, Q); }
  }
}

// ---------------------------------------------------------------- pose codes (rp.code: a pose change is seen by number)
const CODES = new Map();
export function POSE_CODE(p) { let c = CODES.get(p); if (c === undefined) { c = CODES.size + 1; CODES.set(p, c); } return c; }

// ---------------------------------------------------------------- per-slot memory + scratch
const NS = 32768;
const CODE = new Int16Array(NS), DIR = new Float32Array(NS), DROP = new Float32Array(NS), PLANT = new Int8Array(NS);
const T0 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, T1 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const putT = (pose, T) => put(pose, T.a, T.b, T.c, T.d, T.e, T.f);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- 'siegeman'
// rp = { legF, legN, crouch (drop the bent legs were painted for, 0 = straight legs), body, head, arm, back, shield, plant,
//        lean, drop, wdir, kick, code }; rig.joints = { hip, neck, shoulder, legX, grip (carried shield pivot), plant
//        (planted shield's foot) }. Springs: 0 torso, 1 head, 2 arm + weapon, 3 shield, 4 hip drop (px).
const HIPY = -8;
function legPut(part, dx, ang, hy, crouch) {
  const sy = clamp(-hy / (8 - crouch), 0.55, 1.5);
  if (crouch) { put(part, 1, 0, 0, sy, 0, 0); return; }   // bent legs: painted in place, squashed to the hip
  rotAbout(0, hy, ang, dx, 0); const Rm = keep(T1); squashAbout(0, 0, 1, sy); inP(Rm); putM(part);
}
function manPut(J, rp, tor, hd, ar, sh, dr, lN, lF, bob) {
  const hy = HIPY + dr + bob;
  rotAbout(J.hip[0], J.hip[1], tor, 0, dr + bob); const T = keep(T0);
  if (rp.back >= 0) putT(rp.back, T);
  legPut(rp.legF, -J.legX, lF, hy, rp.crouch);
  legPut(rp.legN, J.legX, lN, hy, rp.crouch);
  putT(rp.body, T);
  rotAbout(J.neck[0], J.neck[1], hd); putIn(rp.head, T);
  rotAbout(J.shoulder[0], J.shoulder[1], ar); putIn(rp.arm, T);
  if (rp.shield >= 0) {
    if (rp.plant) { rotAbout(J.plant[0], J.plant[1], sh); putM(rp.shield); }
    else { rotAbout(J.grip[0], J.grip[1], sh); putIn(rp.shield, T); }
  }
}
function manAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now, S = SG.man;
  if (fresh(s, u, now)) { setAngle(s, 0, rp.lean); setAngle(s, 4, rp.drop); CODE[s] = rp.code; DIR[s] = rp.wdir; DROP[s] = rp.drop; PLANT[s] = rp.plant; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (CODE[s] !== rp.code) {   // a new pose: the weapon starts where the old one held it and swings over; crouch lands
    const o2 = (s * NSPR + 2) * 2; BANK[o2] = clamp(BANK[o2] + wrapA(DIR[s] - rp.wdir), -S.swingMax, S.swingMax);
    if (rp.drop !== DROP[s]) { const o4 = (s * NSPR + 4) * 2; BANK[o4] = rp.drop; BANK[o4 + 1] += (rp.drop - DROP[s]) * S.dropKick; }
    if (rp.plant !== PLANT[s]) kick(s, 3, rp.plant ? S.plantKick : -S.plantKick);
    CODE[s] = rp.code; DIR[s] = rp.wdir; DROP[s] = rp.drop; PLANT[s] = rp.plant;
  }
  if (dt > 0) {
    kick(s, 0, -In.ax * S.accel * dt);
    if (!rp.plant) kick(s, 3, In.ax * S.shieldAccel * dt);
    if (In.hit) {
      const h = In.hit * (S.hit + S.hitPow * In.hitPow);
      kick(s, 0, rp.plant ? h * 0.5 : h); kick(s, 1, 2 * h); kick(s, 2, h); kick(s, 3, (rp.plant ? S.plantHit : S.shieldHit) * h);
      if (rp.drop) kick(s, 4, Math.abs(h) * 2);
    }
    if (In.atkStart) { kick(s, 2, rp.kick); kick(s, 0, S.atkTorso); }
  }
  const fwd = (u.vx || 0) * I.flip, air = I.z > 1, mv = I.moving && !rp.drop;
  const walkS = mv ? Math.sin(I.cyc * Math.PI) : 0;
  const tA = air ? 0.45 * Math.sin(now * 9 + I.ph * 7) : walkS * S.walkArm;
  const tor = spring(s, 0, rp.lean + (mv ? clamp(fwd * S.lean, -0.06, 0.12) : 0), S.K.torso, dt, 1);
  const hd = spring(s, 1, 0, S.K.head, dt, 0.9);
  const ar = spring(s, 2, tA, S.K.arm, dt, S.swingMax);
  const sh = spring(s, 3, mv ? S.shieldSwing * walkS : air ? 0.4 * Math.sin(now * 8 + I.ph * 5) : 0, rp.plant ? S.K.plant : S.K.shield, dt, 0.8);
  const dr = spring(s, 4, rp.drop, S.K.drop, dt, 9);
  let lN, lF, bob = 0;
  if (air) { lN = S.fly * Math.sin(now * 13 + I.ph * 6); lF = -S.fly * 0.85 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (mv) { const A = I.run ? LEG.run : S.stride; lN = A * walkS; lF = -A * walkS; bob = -S.bob * Math.abs(walkS); }
  else { const sw = 0.03 * Math.sin(I.rt * 1.7 + I.ph * 6.28); lN = S.idle + sw; lF = -S.idle - sw; }
  manPut(J, rp, tor, hd, ar, sh, dr, lN, lF, bob);
  return true;
}
function manBody(ent, rp, id, t, air, now) {   // as rig.js bipedBody; the shield flops away from the body
  const J = ent.e.rig.joints;
  let lN, lF, hd, ar, tr, sh;
  if (air) {
    const k = now * 12 + h01(id, 9) * 6;
    lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); ar = 0.9 * Math.sin(k * 0.8 + 2); tr = 0.25 * Math.sin(k * 0.7); sh = 0.6 * Math.sin(k * 1.1);
  } else {
    lN = flop(0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.5) * 1.3, t); ar = flop((h01(id, 4) - 0.6) * 2.4, t); tr = flop((h01(id, 5) - 0.5) * 0.35, t);
    sh = flop((h01(id, 6) < 0.5 ? -1 : 1) * (0.5 + 0.7 * h01(id, 7)), t);
  }
  manPut(J, rp, tr, hd, ar, sh, 0, lN, lF, 0);
  return true;
}
register('siegeman', { alive: manAlive, body: manBody });

// ---------------------------------------------------------------- machines: the shared cart
// Springs: 0 tilt (about G.pivot0), 1 bob (px, + = down). CART = this frame's tilt, bob, wheel turn.
const CART = { tilt: 0, bob: 0, wa: 0 };
function cart(ent, rg, u, I, In, s, K, accel, rock, hk = 1) {
  const C0 = SG.cart, dt = In.dt, G = rg.G;
  if (dt > 0) {
    kick(s, 0, -In.ax * accel * dt);
    if (In.hit) { kick(s, 0, hk * In.hit * (C0.hit + C0.hitPow * In.hitPow)); kick(s, 1, -C0.hitBob * (0.3 + In.hitPow)); }
  }
  const stride = Math.max(3.2, ent.defR * 0.8), wa = I.cyc * stride / G.wr;
  CART.wa = wa;
  CART.tilt = spring(s, 0, I.moving ? rock * Math.sin(wa * 2 + 0.7) : 0, K, dt, 0.5);
  CART.bob = spring(s, 1, I.moving ? -C0.bump * Math.abs(Math.sin(wa * 2)) : 0, C0.K.bob, dt, 6);
}
function frameT(G) { rotAbout(G.pivot0[0], G.pivot0[1], CART.tilt, 0, CART.bob); return keep(T0); }
function wheelsPut(rp, G) {
  const h0x = G.hub[0][0], h0y = G.hub[0][1];
  for (let i = 0; i < G.hub.length; i++) { rotAbout(h0x, h0y, CART.wa + i * 0.9, G.hub[i][0] - h0x, G.hub[i][1] - h0y + CART.bob * 0.15); putM(rp.wheel); }
}
// dead: the parts settle into WRECK
const WF = new Float64Array(6), WQ = new Float64Array(6), WO = new Float64Array(6);
function wreckBody(type, rp, t) {
  const W = WRECK[type];
  for (const P of W.parts) {
    const pi = rp[P.key]; if (pi === undefined || pi < 0) continue;
    wreckMat(W.G, P, wreckK(P, t), WQ);
    let m = WQ;
    if (P.parent) m = mul(WF, WQ, WO); else if (P.name === 'frame') WF.set(WQ);
    put(pi, m[0], m[1], m[2], m[3], m[4], m[5]);
  }
  return true;
}

// ---------------------------------------------------------------- 'ram'   springs: 2 log swing
function ramAlive(ent, rp, u, I) {
  const rg = ent.e.rig, G = rg.G, s = I.slot, now = I.now, R = SG.ram;
  if (fresh(s, u, now)) { setAngle(s, 2, rp.swing); CODE[s] = rp.code; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (CODE[s] !== rp.code) {
    if (rp.swing > 0.3) { kick(s, 2, R.thrust); kick(s, 0, R.kickTilt); kick(s, 1, R.kickBob); }   // the log is flung out, the frame jerks
    else if (rp.swing < -0.2) kick(s, 2, R.back);
    CODE[s] = rp.code;
  }
  cart(ent, rg, u, I, In, s, SG.cart.K.tilt, SG.cart.accel, SG.cart.rock);
  if (dt > 0 && In.hit) kick(s, 2, In.hit * R.hitLog);
  const sw = spring(s, 2, rp.swing + (I.moving ? R.bumpLog * Math.sin(CART.wa * 2) : 0), R.K.log, dt, 1.1);
  const T = frameT(G);
  putT(rp.frame, T);
  const k = Math.sin(sw), cs = Math.cos(sw), top = G.ropeTop;
  M.a = 1; M.b = 0; M.c = k; M.d = cs; M.e = -k * top; M.f = top * (1 - cs); putIn(rp.ropes, T);   // ropes swing about their tops
  rotAbout(0, 0, 0, G.L * k, -G.L * (1 - cs)); putIn(rp.log, T);                                  // the log stays level (two ropes)
  wheelsPut(rp, G);
  return true;
}
register('ram', { alive: ramAlive, body: (ent, rp, id, t) => wreckBody('ram', rp, t) });

// ---------------------------------------------------------------- 'catapult'   springs: 2 arm (rad from cocked)
function catAlive(ent, rp, u, I) {
  const rg = ent.e.rig, G = rg.G, s = I.slot, now = I.now, CA = SG.catapult;
  if (fresh(s, u, now)) { setAngle(s, 2, rp.fire ? G.fire : 0); CODE[s] = rp.code; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (CODE[s] !== rp.code) { if (rp.fire) { kick(s, 0, CA.kickTilt); kick(s, 1, CA.kickBob); } CODE[s] = rp.code; }
  cart(ent, rg, u, I, In, s, SG.cart.K.tilt, SG.cart.accel, SG.cart.rock);
  // the arm: flung up into the crossbar (hard stop, bounces off), then wound down slowly
  const o = (s * NSPR + 2) * 2; let a = BANK[o], v = BANK[o + 1];
  if (dt > 0) {
    const K = rp.fire ? CA.K.fire : CA.K.reset, tgt = rp.fire ? G.fire + CA.push : 0;
    if (In.hit) v += In.hit * CA.hitArm;
    v += (-K[0] * (a - tgt) - K[1] * v) * dt; a += v * dt;
    if (a > G.fire) { a = G.fire; if (v > 0) v = -v * CA.bounce; }
    if (a < -0.12) { a = -0.12; if (v < 0) v = -v * 0.3; }
    BANK[o] = a; BANK[o + 1] = v;
  }
  const T = frameT(G);
  if (rp.swoosh >= 0) putT(rp.swoosh, T);
  putT(rp.frame, T);
  rotAbout(G.pivot[0], G.pivot[1], a); inP(T); const A = keep(T1); putM(rp.arm);
  if (rp.stone >= 0) putT(rp.stone, A);
  wheelsPut(rp, G);
  return true;
}
register('catapult', { alive: catAlive, body: (ent, rp, id, t) => wreckBody('catapult', rp, t) });

// ---------------------------------------------------------------- 'ballista'   springs: 2 stock pitch
function balAlive(ent, rp, u, I) {
  const rg = ent.e.rig, G = rg.G, s = I.slot, now = I.now, BA = SG.ballista;
  if (fresh(s, u, now)) { setAngle(s, 2, rp.pitch); CODE[s] = rp.code; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (CODE[s] !== rp.code) { if (rp.fire) { kick(s, 2, BA.kickPitch); kick(s, 0, BA.kickTilt); kick(s, 1, BA.kickBob); } CODE[s] = rp.code; }
  cart(ent, rg, u, I, In, s, SG.cart.K.tilt, SG.cart.accel, SG.cart.rock);
  if (dt > 0 && In.hit) kick(s, 2, In.hit * BA.hitPitch);
  const pt = spring(s, 2, rp.pitch, BA.K.pitch, dt, 0.8);
  const T = frameT(G);
  putT(rp.frame, T);
  rotAbout(G.pivot[0], G.pivot[1], pt); putIn(rp.stock, T);
  wheelsPut(rp, G);
  return true;
}
register('ballista', { alive: balAlive, body: (ent, rp, id, t) => wreckBody('ballista', rp, t) });

// ---------------------------------------------------------------- 'tower'   springs: 2 drawbridge (rad from upright), 3 flag
const CH = new Float64Array(2), CH0 = new Float64Array(2);
function towAlive(ent, rp, u, I) {
  const rg = ent.e.rig, G = rg.G, s = I.slot, now = I.now, TW = SG.tower;
  if (fresh(s, u, now)) { setAngle(s, 2, rp.dock ? G.dock : 0); CODE[s] = rp.code; }
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  CODE[s] = rp.code;
  cart(ent, rg, u, I, In, s, TW.K.tilt, TW.accel, TW.rock, TW.hitK);
  // drawbridge: drops onto the wall (hard stop just past level, bounce), cranked back up slowly
  const o = (s * NSPR + 2) * 2; let a = BANK[o], v = BANK[o + 1];
  if (dt > 0) {
    const K = rp.dock ? TW.K.down : TW.K.up, tgt = rp.dock ? G.dock + 0.2 : 0;
    if (In.hit) v += In.hit * TW.hitBridge;
    v += (-K[0] * (a - tgt) - K[1] * v) * dt; a += v * dt;
    const stop = G.dock + TW.stop;
    if (a > stop) { a = stop; if (v > 0) v = -v * TW.bounce; }
    if (a < -0.05) { a = -0.05; if (v < 0) v = -v * 0.3; }
    BANK[o] = a; BANK[o + 1] = v;
  }
  const fwd = (u.vx || 0) * I.flip;
  const fl = spring(s, 3, -TW.flagA * (1 + Math.sin(I.rt * TW.flagW + I.ph * 6.28)) * 0.5 - clamp(fwd * TW.flagLean, -0.15, 0.25), TW.K.flag, dt, 0.7);
  const T = frameT(G);
  putT(rp.frame, T);
  rotAbout(G.flagBase[0], G.flagBase[1], fl); putIn(rp.flag, T);
  if (a > 0.35 && rp.chain >= 0) {   // chain from the tower top to the bridge, stretched to where the bridge is now
    const [ax, ay] = G.chainTop; towChainEnd(a, CH); towChainEnd(G.dock, CH0);
    const dx = CH[0] - ax, dy = CH[1] - ay, dx0 = CH0[0] - ax, dy0 = CH0[1] - ay;
    const sc = Math.hypot(dx, dy) / (Math.hypot(dx0, dy0) || 1), rot = Math.atan2(dy, dx) - Math.atan2(dy0, dx0), cs = Math.cos(rot) * sc, sn = Math.sin(rot) * sc;
    M.a = cs; M.b = sn; M.c = -sn; M.d = cs; M.e = ax - cs * ax + sn * ay; M.f = ay - sn * ax - cs * ay; putIn(rp.chain, T);
  }
  rotAbout(G.hinge[0], G.hinge[1], a); putIn(rp.bridge, T);
  wheelsPut(rp, G);
  return true;
}
register('tower', { alive: towAlive, body: (ent, rp, id, t) => wreckBody('siegetower', rp, t) });
