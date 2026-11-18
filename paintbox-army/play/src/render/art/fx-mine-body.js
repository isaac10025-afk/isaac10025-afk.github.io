// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: W-BODY. POSTER PAINT.
// OVER[id](ctx, u, bag, X, Y, flip, S, now, world): per-frame extras for the W-BODY weapons, called by the made body's
// over() (device px, identity transform; X, Y = the unit's feet raised by its z, in device px; bag = u.b.wb). Bits are
// baked once through sprites.js defineBit (loaded lazily: sprites.js imports this module), never painted per frame.
//  - tail      the swipe: a fat painted swoosh sweeping the rear half-circle on the ground (the stego's reach, r + 34 ×
//              size) for 0.26 s after bag.swipeT.
//  - tailclub  the same swoosh round the club's reach (r + 30 × size) after bag.clubT, and a bonk star where the club
//              landed (bag.cx / bag.cy, sim px) for 0.2 s.
//  - blades    a blade streak in front of the body for 0.12 s after bag.slashT: high-to-low for one arm, low-to-high
//              for the other (bag.arm), so the two blades read as taking turns.
//  - tusks     the charge's speed lines (fx.js speedLines, like a charging boar's) while bag.ch is 1 (fast enough to gore).
// Nothing extra: bite, jaws (the held victim is drawn at the mouth by the renderer through the entry's holds(u)),
// zombiebite, peck, horns, pinch, sting (their look = the gear + the body's attack pose).
// No PROJ kinds: the W-BODY weapons fire nothing.
import { OVER } from './mine-hooks.js';
import { C, TAU, brush, dab, spark } from './paint.js';
export const PROJ = {};

const CREAM = '#fbf3dc', STREAK = '#fff7c8', BLADE = '#eef2f4';
let SPX = null, spxP = null, BITS = null, FXM = null, fxP = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function fx() { if (!fxP) fxP = import('./fx.js').then((m) => { FXM = m; }, () => { fxP = null; }); return FXM; }
function defineBits(m) {
  const noT = { tooth: false };
  return {
    // the swoosh: a half ring of radius 50 round the rear (-x), seen from straight above (squashed at draw time), fat in
    // the middle and running dry at both ends, ink under cream under a pale streak
    swoosh: m.defineBit('wb:swoosh', 3, [62, 116, 56, 58], (c, R) => {
      const P = [];
      for (let k = 0; k <= 14; k++) { const a = Math.PI * 0.5 + Math.PI * k / 14 + (R() - 0.5) * 0.04; P.push([Math.cos(a) * 50, Math.sin(a) * 50]); }
      brush(c, P, 9, C.ink, R, { bristles: 4, dry: 0.12, taper: 0.85, swell: 0.4 });
      brush(c, P, 6.5, CREAM, R, { bristles: 4, dry: 0.18, taper: 0.9, swell: 0.4 });
      const Q = P.map(([x, y]) => [x * 0.9, y * 0.9]);
      brush(c, Q, 2.4, STREAK, R, { bristles: 2, dry: 0.3, taper: 0.9, swell: 0.3 });
    }, noT),
    // the bonk star where a tail club lands
    bonk: m.defineBit('wb:bonk', 3, [30, 30, 15, 15], (c, R) => {
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + R() * 0.3;
        brush(c, [[Math.cos(a) * 4.5, Math.sin(a) * 4.5], [Math.cos(a) * 12.5, Math.sin(a) * 12.5]], 2.2, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.6 });
        brush(c, [[Math.cos(a) * 4.5, Math.sin(a) * 4.5], [Math.cos(a) * 11.5, Math.sin(a) * 11.5]], 1.2, i & 1 ? C.yellow : CREAM, R, { bristles: 2, dry: 0.2, taper: 0.7 });
      }
      spark(c, 0, 0, 5, R);
      dab(c, 0, 0, 2.2, CREAM, R);
    }, noT),
    // one blade streak: a curved cut from up-front down to low-front (x 0..22), for the right-facing body
    slash: m.defineBit('wb:slash', 3, [30, 30, 4, 15], (c, R) => {
      const P = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, a = -1.15 + 2.3 * t; P.push([2 + Math.cos(a) * 18, Math.sin(a) * 13]); }
      brush(c, P, 3.6, C.ink, R, { bristles: 3, dry: 0.1, taper: 0.9, swell: 0.3 });
      brush(c, P, 2.2, BLADE, R, { bristles: 3, dry: 0.15, taper: 0.9, swell: 0.3 });
      brush(c, P.slice(2, 7), 0.8, '#ffffff', R, { bristles: 1, dry: 0.2, taper: 0.6 });
    }, noT),
  };
}
const nowRT = () => performance.now() / 1000;
const boil3 = (rt, ph) => (((rt * 8 + ph * 3) | 0) % 3 + 3) % 3;
const powerOf = (u) => (u.def && u.def.maker ? u.def.maker.size : 1);
/** A bit drawn ON THE GROUND round (gx, gy) sim px: turned by ang in the ground plane, then squashed into the 3/4 view. */
function ground(ctx, spr, S, gx, gy, sc, ang, squash) {
  if (!spr) return;
  const m = S / spr.k * sc, cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.setTransform(cs * m, sn * m * squash, -sn * m, cs * m * squash, gx * S, gy * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
/** A bit drawn upright at (x, y) sim px, x / y scale (sy < 0 mirrors it top to bottom). */
function put(ctx, spr, S, x, y, sx, sy) {
  if (!spr) return;
  const m = S / spr.k;
  ctx.setTransform(m * sx, 0, 0, m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
const SQUASH = 0.46;   // ground circles in the 3/4 view (the ground rings in fx.js / the other fx files)
const SWOOSH_T = 0.26, BONK_T = 0.2, SLASH_T = 0.12;

// the rear half-circle swoosh: grows out over the first third, then fades
function swoosh(ctx, u, X, Y, S, age, reach) {
  if (!(age >= 0 && age < SWOOSH_T)) return;
  const f = age / SWOOSH_T, gx = X / S, gy = Y / S + (u.z || 0), rt = nowRT();
  const sc = (reach / 50) * (0.8 + 0.2 * Math.min(1, f * 3));
  ctx.globalAlpha = Math.min(1, 1.6 * (1 - f));
  ground(ctx, SPX.bit(BITS.swoosh, boil3(rt, u.id * 0.37)), S, gx, gy - 2, sc, u.heading || 0, SQUASH);
  ctx.globalAlpha = 1;
}

OVER.tail = function tailOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || !(now - bag.swipeT < SWOOSH_T)) return;
  if (!spx() || !BITS) return;
  swoosh(ctx, u, X, Y, S, now - bag.swipeT, (u.radius || 9.9) + 34 * powerOf(u));
};

OVER.tailclub = function tailclubOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || !(now - bag.clubT < SWOOSH_T)) return;
  if (!spx() || !BITS) return;
  const age = now - bag.clubT;
  swoosh(ctx, u, X, Y, S, age, (u.radius || 9.9) + 30 * powerOf(u));
  if (age < BONK_T) {
    const k = Math.max(0.8, Math.sqrt(powerOf(u))), q = 0.7 + 0.5 * Math.min(1, age / 0.06);
    put(ctx, SPX.bit(BITS.bonk, boil3(nowRT() * 1.4, u.id * 0.11)), S, bag.cx, bag.cy - 10 * k, q * k, q * k);
  }
};

OVER.blades = function bladesOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || !(now - bag.slashT < SLASH_T)) return;
  if (!spx() || !BITS) return;
  const r = u.radius || 9.9, k = r / 9.9, age = now - bag.slashT;
  const sy = (bag.arm ? -1 : 1) * k, q = 0.85 + 0.3 * (age / SLASH_T);   // the other arm cuts the other way
  put(ctx, SPX.bit(BITS.slash, boil3(nowRT(), u.id * 0.23)), S, X / S + flip * r * 0.55, Y / S - r * 1.05, flip * k * q, sy * q);
};

OVER.tusks = function tusksOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || bag.ch !== 1) return;
  const F = fx(); if (!F || !F.speedLines) return;
  const run = (u.def && u.def.runSpeed) || 150, sp = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
  const n = Math.max(0, Math.min(1, (sp - 0.7 * run) / (run * 0.3)));
  if (n > 0) F.speedLines(X / S, Y / S, u.vx, u.vy, u.radius || 9.9, n, u.id, nowRT());
};
