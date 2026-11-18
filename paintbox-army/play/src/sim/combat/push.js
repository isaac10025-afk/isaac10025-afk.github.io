// Hit reactions: push (OG 412.p, game.js:8983-8988), toss (OG 412.y, game.js:9063-9081),
// landing (OG 412.q, game.js:9082-9129). Gravity 900 px/s² and the airborne integration live in CORE-A steering,
// which calls land(world, u, impactSpeed) when a tossed unit touches down.
import { GRAVITY, PERCH_H, PERCH_H_APE, QUERY_MARGIN, CAUSE, initCombat, isAirborne, rnd, hypot, emit, hooks, depthAt, WET } from './env.js';
import { damage } from './damage.js';

export const PUSH_MIN_MASS = 0.25;    // OG game.js:8986
export const TOSS_HEAVY = 8;          // OG game.js:8961 (ot): mass >= 8 cannot be tossed (non-prop)
export const TOSS_HEAVY_MUL = 0.5;    // OG game.js:8962 (ct)
export const TOSS_KEEP_V = 0.3;       // OG game.js:9071
export const TOSS_STUN_PAD = 0.3;     // OG game.js:8977 (mt)
export const LAND_KEEP_V = 0.35;      // OG game.js:8982 (bt)
export const LAND_STUN = 0.3;         // OG game.js:8977 (mt)
export const FALL_DMG = 8, IMPACT_REF = 400; // OG game.js:8978-8979 (gt, vt): self damage 8·impact/400
export const HURL_DMG = 30, HURL_PUSH = 240, HURL_GAP = 6, HURL_STUN = 0.5; // OG game.js:9127-9129, 9121

export function perchHeight(u) { return (u.climb || 0) * (u.type === 'ape' || u.type === 'risen_ape' ? PERCH_H_APE : PERCH_H); } // OG 9013-9015
export function unperch(u) { u.perch = -1; u.climb = 0; u.hidden = 0; } // OG game.js:9057-9059

/** push(world, u, dx, dy, f, stunT = 0): Δv = dir·f/max(0.25, mass); stun = max(stun, stunT). Ignored while climbing. */
export function push(world, u, dx, dy, f, stunT = 0) {
  initCombat(u);
  if (u.climb > 0) return;                                        // OG game.js:8985
  const k = f / Math.max(PUSH_MIN_MASS, u.mass);
  u.vx += dx * k; u.vy += dy * k;
  if (stunT > u.stun) u.stun = stunT;
}

/** toss(world, u, dx, dy, out, up): launch along unit dir (dx,dy) with ground speed `out` and upward speed `up`. */
export function toss(world, u, dx, dy, out, up) {
  initCombat(u);
  const k = 1 / Math.sqrt(Math.max(1, u.mass));
  if ((u.mass >= TOSS_HEAVY && !u.def.prop) || u.def.untossable === true) { // OG game.js:9066-9067
    u.vx += dx * out * k * TOSS_HEAVY_MUL; u.vy += dy * out * k * TOSS_HEAVY_MUL; return;
  }
  if (u.climb > 0) u.z = Math.max(u.z, perchHeight(u));
  unperch(u);
  u.vx = dx * out * k + TOSS_KEEP_V * u.vx; u.vy = dy * out * k + TOSS_KEEP_V * u.vy;
  const h = up * k;
  // OG game.js:9072-9073. Root clamped at 0: a held unit's first lift tick can leave z at -1e-13 (OG float32 does too,
  // game.js:14316-14322), and sqrt(<0) = NaN would make stun and spin NaN for good (attack L1, 11-13).
  const air = (u.vz + h + Math.sqrt(Math.max(0, u.vz * u.vz + 2 * GRAVITY * u.z))) / GRAVITY;
  u.vz = h;
  const side = Math.abs(dx) > 0.2 ? Math.sign(dx) : rnd(world) < 0.5 ? -1 : 1;
  u.spin = (2 * side * Math.PI) / Math.max(0.2, air);
  u.thrownAt = world.time;
  u.stun = Math.max(u.stun, air + TOSS_STUN_PAD);
  u.prone = 0; u.proneWant = 0;
}

let _lu = null, _lh = 0, _lw = null;
function hurlHit(o) {
  const u = _lu;
  if (o === u || !(o.hp > 0) || isAirborne(o)) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d > u.radius + o.radius + HURL_GAP) return;
  damage(_lw, o, HURL_DMG * _lh, -1, 'thrown');
  o.harmCause = CAUSE.Thrown;
  push(_lw, o, dx / d, dy / d, HURL_PUSH * _lh, HURL_STUN * _lh);
}

/** land(world, u, impactSpeed): a tossed unit touches down (OG game.js:9082-9129). */
export function land(world, u, impact) {
  initCombat(u);
  u.z = 0; u.vz = 0; u.spin = 0;
  u.vx *= LAND_KEEP_V; u.vy *= LAND_KEEP_V;
  u.stun = Math.max(u.stun, LAND_STUN);
  const wet = depthAt(world, u.x, u.y) >= WET;
  emit(world, wet ? 'splash' : (u.def.aquatic ? 'flop' : 'land'), { x: u.x, y: u.y, v: Math.min(2, impact / IMPACT_REF) * u.radius, type: u.type });
  if (u.hurled === 1) {                                           // OG game.js:9104-9129: hurled unit hits everyone near
    u.hurled = 0;
    _lu = u; _lw = world;
    _lh = Math.min(3, Math.sqrt(Math.max(0.25, u.mass))) * Math.min(1.5, impact / IMPACT_REF);
    world.query(u.x, u.y, u.radius + QUERY_MARGIN + HURL_GAP, hurlHit);
    _lu = null; _lw = null;
  }
  const crush = (u.mass * impact) / IMPACT_REF;                   // OG 568.b/c: ice cracks under heavy landings
  if (hooks.iceHarm && crush > 1) hooks.iceHarm(world, u.x, u.y, u.radius, (crush - 1) * 0.3, 0.5);
  if (hooks.unitLanded) hooks.unitLanded(world, u);
  if (u.def.onLanded) u.def.onLanded(world, u, impact);
  damage(world, u, (FALL_DMG * impact) / IMPACT_REF, -1, 'thrown');  // OG game.js:9124
  u.harmCause = CAUSE.Thrown;
}
