// Floppy bodies (Part 2 step 1, OURS not OG). Owner: RENDER (lead). Contract: RIG.md (read it before adding a driver).
// A rigged entry is drawn as separate painted parts (each part is an extra pose of the entry, 'r:<name>', baked like any
// sprite) turned about their joints every frame. The joints are springs: they lag, overshoot and wobble back (TABS feel).
// The sim is untouched by any of this: drivers only READ unit fields (velocity, attack, hit, toss, walk distance).
//
// A driver fills OUT: n parts, each = entry pose index + a 2D matrix in entry units (feet at 0,0, facing right, y down)
// that maps the part's rest place to where it is drawn now. index.js multiplies it by the unit's own transform.
// Matrices are [a, b, c, d, e, f] like canvas setTransform: x' = a x + c y + e, y' = b x + d y + f.
//
// Drivers: register(name, { alive(ent, rp, u, I) -> bool, body(ent, rp, id, t, air, now) -> bool }). 'biped' (painted
// people) and 'wobble' (one whole sprite that tilts and squashes) live here; others in their own files (rig-*.js).

const MASK = 32767, NS = MASK + 1;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- per-unit state (slot = id & MASK)
// BANK: 12 springs a slot (angle, speed) for drivers to use as they like (spring i of slot s = BANK[(s * 12 + i) * 2]).
export const NSPR = 12;
export const BANK = new Float32Array(NS * NSPR * 2);
const sId = new Int32Array(NS).fill(-1);
export const prevVX = new Float32Array(NS), prevVY = new Float32Array(NS), prevAtk = new Uint8Array(NS), prevHit = new Float64Array(NS), prevNow = new Float64Array(NS);
/** True (and the slot's springs zeroed, its memory set from u) the first time this unit is seen in its slot. */
export function fresh(slot, u, now) {
  if (sId[slot] === u.id) return false;
  sId[slot] = u.id;
  BANK.fill(0, slot * NSPR * 2, (slot + 1) * NSPR * 2);
  prevVX[slot] = u.vx || 0; prevVY[slot] = u.vy || 0; prevAtk[slot] = u.attack > 0 ? 1 : 0; prevHit[slot] = u.hitAt ?? -9; prevNow[slot] = now;
  return true;
}
/** Step spring i of a slot toward target with K = [stiffness, damping]; clamps the angle to +-lim. Returns the angle. */
export function spring(slot, i, target, K, dt, lim = 1.5) {
  const o = (slot * NSPR + i) * 2;
  let a = BANK[o], v = BANK[o + 1];
  if (dt > 0) { v += (-K[0] * (a - target) - K[1] * v) * dt; a += v * dt; if (a > lim) { a = lim; v = 0; } else if (a < -lim) { a = -lim; v = 0; } BANK[o] = a; BANK[o + 1] = v; }
  return a;
}
/** Add speed to spring i (an impulse). */
export function kick(slot, i, dv) { BANK[(slot * NSPR + i) * 2 + 1] += dv; }
export function setAngle(slot, i, a) { BANK[(slot * NSPR + i) * 2] = a; }
/** Inputs since last frame for a slot: dt (sim time, 0 when paused), forward acceleration, a new hit, an attack start. */
export const IN = { dt: 0, ax: 0, hit: 0, hitPow: 0, atkStart: false };
export function inputs(slot, u, now, flip) {
  const dt = clamp(now - prevNow[slot], 0, 1 / 20); prevNow[slot] = now;
  const vx = u.vx || 0, vy = u.vy || 0;
  IN.dt = dt; IN.ax = dt > 0 ? clamp((vx - prevVX[slot]) / dt, -2500, 2500) * flip : 0; IN.hit = 0; IN.hitPow = 0; IN.atkStart = false;
  if (u.hitAt !== undefined && u.hitAt !== prevHit[slot]) {
    prevHit[slot] = u.hitAt;
    if (now - u.hitAt < 0.1) { IN.hit = (u.hitDx || 0) * flip; IN.hitPow = clamp(u.hitPow || 0, 0, 1); if (IN.hit === 0) IN.hit = -0.5; }
  }
  const atk = u.attack > 0 ? 1 : 0;
  if (dt > 0) { IN.atkStart = atk === 1 && prevAtk[slot] === 0; prevAtk[slot] = atk; }
  prevVX[slot] = vx; prevVY[slot] = vy;
  return IN;
}

// ---------------------------------------------------------------- output + matrix helpers
export const OUT = { n: 0, pose: new Int16Array(24), m: new Float64Array(24 * 6) };
export function begin() { OUT.n = 0; }
export function put(pose, a, b, c, d, e, f) {
  if (OUT.n >= 24) return;
  const i = OUT.n++, o = i * 6;
  OUT.pose[i] = pose; const m = OUT.m;
  m[o] = a; m[o + 1] = b; m[o + 2] = c; m[o + 3] = d; m[o + 4] = e; m[o + 5] = f;
}
/** M = rotation by ang about (px, py), then moved by (tx, ty). Read M.a..M.f right after. */
export const M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
export function rotAbout(px, py, ang, tx = 0, ty = 0) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  M.a = cs; M.b = sn; M.c = -sn; M.d = cs; M.e = px - cs * px + sn * py + tx; M.f = py - sn * px - cs * py + ty;
  return M;
}
/** M = scale (sx, sy) about (px, py), then turned by ang about the same point. */
export function squashAbout(px, py, sx, sy, ang = 0) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  M.a = cs * sx; M.b = sn * sx; M.c = -sn * sy; M.d = cs * sy;
  M.e = px - M.a * px - M.c * py; M.f = py - M.b * px - M.d * py;
  return M;
}
/** A matrix you keep (a parent): copy of M. */
export function keep(T = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) { T.a = M.a; T.b = M.b; T.c = M.c; T.d = M.d; T.e = M.e; T.f = M.f; return T; }
/** put(pose, P · M): a child turned by M inside its parent P. */
export function putIn(pose, P) {
  put(pose, P.a * M.a + P.c * M.b, P.b * M.a + P.d * M.b, P.a * M.c + P.c * M.d, P.b * M.c + P.d * M.d, P.a * M.e + P.c * M.f + P.e, P.b * M.e + P.d * M.f + P.f);
}
/** M = P · M (so M becomes a child's full matrix; keep() it to make a grandchild's parent). */
export function inP(P) {
  const a = P.a * M.a + P.c * M.b, b = P.b * M.a + P.d * M.b, c = P.a * M.c + P.c * M.d, d = P.b * M.c + P.d * M.d, e = P.a * M.e + P.c * M.f + P.e, f = P.b * M.e + P.d * M.f + P.f;
  M.a = a; M.b = b; M.c = c; M.d = d; M.e = e; M.f = f; return M;
}
export function putM(pose) { put(pose, M.a, M.b, M.c, M.d, M.e, M.f); }

// ---------------------------------------------------------------- dead bodies settle
// A dead body's joints settle with a damped step from 0 to a resting angle picked per body (seeded by its id).
export const FLOP = { w: 13, c: 5.5 };   // ringing 13 rad/s, decay 5.5/s: settled (< 5 %) by ~0.55 s
export function flop(end, t) {
  if (t <= 0) return 0;
  const w = FLOP.w, c = FLOP.c, e = Math.exp(-c * t);
  return end * (1 - e * (Math.cos(w * t) + (c / w) * Math.sin(w * t)));
}
/** Seeded 0..1 per (id, k). */
export function h01(id, k) { let h = Math.imul((id | 0) + 1, 2654435761) ^ Math.imul(k + 7, 40503); h ^= h >>> 13; h = Math.imul(h, 2246822519); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// ---------------------------------------------------------------- drivers
const DRIVERS = new Map();
export function register(name, d) { DRIVERS.set(name, d); }
export function has(name) { return DRIVERS.has(name); }
/** Fill OUT for a living unit. I = { slot, now, flip, moving, cyc, z, ph, rt, run, k }. False = draw the whole sprite. */
export function alive(ent, rp, u, I) { const d = DRIVERS.get(ent.e.rig.driver); if (!d || !d.alive) return false; OUT.n = 0; try { return d.alive(ent, rp, u, I) === true && OUT.n > 0; } catch (e) { console.warn('art: rig driver failed', ent.type, e); ent.e.rig = null; return false; } }
/** Fill OUT for a dead body (unturned; the caller turns it onto its back). t = s since it died / landed, air = flying. */
export function body(ent, rp, id, t, air, now) { const d = DRIVERS.get(ent.e.rig.driver); if (!d || !d.body) return false; OUT.n = 0; try { return d.body(ent, rp, id, t, air, now) === true && OUT.n > 0; } catch (e) { console.warn('art: rig body failed', ent.type, e); return false; } }

// ---------------------------------------------------------------- resolved parts (cached: no strings per frame)
// partsOf(ent, poseIdx, zom): the entry's rig.parts(poseName, zom) with every 'r:...' string (and every value under a key
// starting with 'p') turned into an entry pose index. A missing required part (non-null name that isn't a pose) = null
// (the pose is drawn whole). null/undefined values become -1 (no such part). Numbers and other values are kept.
export function partsOf(ent, poseIdx, zom) {
  let cache = ent._rigC;
  if (!cache) cache = ent._rigC = new Array(ent.all.length * 2).fill(undefined);
  const k = poseIdx * 2 + (zom ? 1 : 0);
  let r = cache[k];
  if (r !== undefined) return r;
  r = null;
  try {
    const rp = ent.e.rig.parts(ent.all[poseIdx], !!zom);
    if (rp) {
      r = {};
      for (const key in rp) {
        const v = rp[key];
        if (typeof v === 'string') { const i = ent.pose(v); if (i < 0) { r = null; break; } r[key] = i; }
        else if (v === null || v === undefined) r[key] = -1;
        else r[key] = v;
      }
    }
  } catch (e) { r = null; }
  cache[k] = r;
  return r;
}

// ---------------------------------------------------------------- 'biped': painted people (people.js human())
// rp = { leg, body, head, arm, back (or -1), lean }; rig.joints = { hip, neck, shoulder, legX }.
// Springs: 0 torso (about the hip), 1 head (about the neck, in the torso), 2 arms + weapon (about the shoulder, in the torso).
export const SPRING = { torso: [120, 6.5], head: [210, 5.5], arm: [150, 7], tail: [90, 4.5] };
export const PUSH = {
  accel: 0.0011,        // torso lags behind a speed change: rad/s per px/s² of forward acceleration a frame (clamped +-2500)
  lean: 1 / 700,        // torso leans into its forward speed: rad per px/s (max 0.12)
  hit: 3, hitPow: 12,   // a blow knocks the torso along it: (3 + 12·pow) rad/s; the head twice that, the arms once
  atkArm: -9, atkTorso: -1.6,   // an attack starting kicks the arms up/back and the torso back
  walkArm: 0.09,        // arms swing with the stride
};
export const LEG = { walk: 0.5, run: 0.85, idle: 0.09, fly: 0.95, bob: 0.9 };
const TQ = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function bipedAlive(ent, rp, u, I) {
  const J = ent.e.rig.joints, s = I.slot, now = I.now;
  if (fresh(s, u, now)) setAngle(s, 0, rp.lean);
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    kick(s, 0, -In.ax * PUSH.accel * dt);
    if (In.hit) { const h = In.hit * (PUSH.hit + PUSH.hitPow * In.hitPow); kick(s, 0, h); kick(s, 1, 2 * h); kick(s, 2, h); }
    if (In.atkStart) { kick(s, 2, PUSH.atkArm); kick(s, 0, PUSH.atkTorso); }
  }
  const fwd = (u.vx || 0) * I.flip, air = I.z > 1;
  const walkS = I.moving ? Math.sin(I.cyc * Math.PI) : 0;
  const tA = air ? 0.45 * Math.sin(now * 9 + I.ph * 7) : walkS * PUSH.walkArm;
  const tor = spring(s, 0, rp.lean + (I.moving ? clamp(fwd * PUSH.lean, -0.06, 0.12) : 0), SPRING.torso, dt, 1);
  const hd = spring(s, 1, 0, SPRING.head, dt, 0.9);
  const ar = spring(s, 2, tA, SPRING.arm, dt, 1.3);
  let lN, lF, bob = 0;
  if (air) { lN = LEG.fly * Math.sin(now * 13 + I.ph * 6); lF = -LEG.fly * 0.85 * Math.sin(now * 11 + I.ph * 9 + 1); }
  else if (I.moving) { const A = I.run ? LEG.run : LEG.walk; lN = A * walkS; lF = -A * walkS; bob = -LEG.bob * Math.abs(walkS); }
  else { const sw = 0.03 * Math.sin(I.rt * 1.7 + I.ph * 6.28); lN = LEG.idle + sw; lF = -LEG.idle - sw; }
  bipedPut(J, rp, tor, hd, ar, lN, lF, bob);
  return true;
}
function bipedPut(J, rp, tor, hd, ar, lN, lF, bob) {
  const hy = J.hip[1];
  rotAbout(J.hip[0], hy, tor, 0, bob); const T = keep(TQ);
  if (rp.back >= 0) put(rp.back, T.a, T.b, T.c, T.d, T.e, T.f);
  rotAbout(0, hy, lF, -J.legX, bob * 0.5); putM(rp.leg);
  rotAbout(0, hy, lN, J.legX, bob * 0.5); putM(rp.leg);
  put(rp.body, T.a, T.b, T.c, T.d, T.e, T.f);
  rotAbout(J.neck[0], J.neck[1], hd); putIn(rp.head, T);
  rotAbout(J.shoulder[0], J.shoulder[1], ar); putIn(rp.arm, T);
}
function bipedBody(ent, rp, id, t, air, now) {
  const J = ent.e.rig.joints;
  let lN, lF, hd, ar, tr;
  if (air) {   // tumbling through the air: limbs flail
    const k = now * 12 + h01(id, 9) * 6;
    lN = 0.9 * Math.sin(k); lF = -0.8 * Math.sin(k * 0.9 + 1); hd = 0.5 * Math.sin(k * 1.3); ar = 0.9 * Math.sin(k * 0.8 + 2); tr = 0.25 * Math.sin(k * 0.7);
  } else {
    lN = flop(0.25 + 0.9 * h01(id, 1), t); lF = flop(-(0.2 + 0.9 * h01(id, 2)), t);
    hd = flop((h01(id, 3) - 0.5) * 1.3, t); ar = flop((h01(id, 4) - 0.6) * 2.4, t); tr = flop((h01(id, 5) - 0.5) * 0.35, t);
  }
  bipedPut(J, rp, tr, hd, ar, lN, lF, 0);
  return true;
}
register('biped', { alive: bipedAlive, body: bipedBody });

// ---------------------------------------------------------------- 'wobble': one whole sprite that tilts and squashes
// For units too small for limbs to read (rat, ant, piranha...) and stiff things (barrel, tree). rp = { main } (the pose
// itself: rig.parts(pose) => ({ main: pose })); rig.wobble = { tilt, squash, sway } multipliers (optional, default 1).
// Springs: 0 tilt (about the feet), 1 squash (y scale - 1; x the other way to keep the area).
export const WOB = { tilt: [140, 6], squash: [260, 9], hitTilt: 5, hitSquash: 3, moveTilt: 1 / 900, step: 0.05, atkSquash: -2.5 };
function wobbleAlive(ent, rp, u, I) {
  const s = I.slot, now = I.now, W = ent.e.rig.wobble || {};
  const kt = W.tilt ?? 1, ks = W.squash ?? 1;
  fresh(s, u, now);
  const In = inputs(s, u, now, I.flip), dt = In.dt;
  if (dt > 0) {
    kick(s, 0, -In.ax * PUSH.accel * dt * kt);
    if (In.hit) { kick(s, 0, In.hit * (WOB.hitTilt + PUSH.hitPow * In.hitPow) * kt); kick(s, 1, -(WOB.hitSquash + 6 * In.hitPow) * ks); }
    if (In.atkStart) kick(s, 1, WOB.atkSquash * ks);
  }
  const fwd = (u.vx || 0) * I.flip, stepS = I.moving ? Math.abs(Math.sin(I.cyc * Math.PI)) : 0;
  const sway = (W.sway ?? 0) * Math.sin(I.rt * 1.3 + I.ph * 6.28);
  const tilt = spring(s, 0, (I.moving ? clamp(fwd * WOB.moveTilt * kt, -0.08, 0.16) : 0) + sway, WOB.tilt, dt, 0.9);
  const sq = spring(s, 1, I.moving ? -WOB.step * stepS * ks : 0, WOB.squash, dt, 0.45);
  squashAbout(0, 0, 1 - sq * 0.6, 1 + sq, tilt); putM(rp.main);
  return true;
}
register('wobble', { alive: wobbleAlive });

/** Forget every unit's springs (field cleared). */
export function reset() { sId.fill(-1); }
