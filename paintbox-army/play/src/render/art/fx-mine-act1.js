// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT1. POSTER PAINT.
// OVER[id](ctx, u, bag, X, Y, flip, S, now, world): per-frame extras for the A-ACT1 abilities, called by the made body's
// over() (device px, identity transform; X, Y = the unit's feet raised by its z, in device px; bag = u.b.ab[slot]).
// Bits are baked once through sprites.js defineBit (loaded lazily: sprites.js imports this module), never painted per frame.
//  - lasso  the cowboy's rope: from the rope hand (people raise the front hand; animals / beasts hold it in the mouth) to
//           the loop. bag.ph 1 = the loop flying (bag.lx / ly / lz, the rope sags), 2 = dragging (the loop round the
//           victim bag.vic, the rope taut and twitching).
//  - roar   three ink sound waves rolling out of the mouth toward where it faces over the 1.2 s roar (bag.ph 1, from
//           u.b.actT), plus a ring of dashes on the ground growing to the roar's reach (bag.r).
//  - stomp  rearing up (bag.ph 1): the ring of dashes on the ground at the stomp's reach (bag.r), tightening toward the
//           feet as the blow comes; the blow itself is the 'blast' event ring (fx.js) + dust.
// Body anchors (mouth, rope hand) are per body in multiples of the unit's radius (MOUTH / HAND / PULL below).
//  - blink  gone (bag.ph 1): a sparkle burst at the spot it will appear (bag.x0 / bag.y0).
import { OVER } from './mine-hooks.js';
import { C, TAU, brush, ring, dab, spark } from './paint.js';
export const PROJ = {};

const ROPE = '#d9b878', ROPE_D = '#a8844a';   // the cowboy's rope colours (sprites-secret.js CB.rope / ropeD)
let SPX = null, spxP = null, BITS = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function rope(c, R, P, w) {
  brush(c, P, w + 0.9, C.ink, R, { bristles: 2, dry: 0.05, taper: 0 });
  brush(c, P, w, ROPE, R, { bristles: 2, dry: 0.1, taper: 0 });
}
function defineBits(m) {
  const noT = { tooth: false };
  return {
    // a 10 px rope piece along +x (stretched and turned along the rope)
    rope: m.defineBit('a1:rope', 1, [14, 6, 1, 3], (c, R) => rope(c, R, [[0, 0], [3.4, 0.2], [6.8, -0.1], [10.2, 0]], 0.9), noT),
    // the loop (an ellipse of rope) with its knot, 2 looks
    loop: m.defineBit('a1:loop', 2, [26, 16, 13, 8], (c, R) => {
      const lp = ring(0, 0, 9, 4.6, R, 0.06, 12);
      rope(c, R, lp.concat([lp[0]]), 1);
      rope(c, R, [[-9, 0], [-11.4, 0.6]], 1);
      brush(c, [[-8.6, -0.4], [-9.6, 0.8]], 0.7, ROPE_D, R, { bristles: 1, dry: 0, taper: 0 });
    }, noT),
    // one sound wave: three ink arcs fanned ±0.7 rad round +x (radius 8 / 13 / 18), rolled out and grown a little
    wave: m.defineBit('a1:wave', 3, [26, 40, 4, 20], (c, R) => {
      for (let i = 0; i < 3; i++) {
        const r = 8 + i * 5, P = [];
        for (let k = 0; k <= 7; k++) { const a = -0.7 + 1.4 * k / 7 + (R() - 0.5) * 0.05; P.push([Math.cos(a) * r - 6, Math.sin(a) * r]); }
        brush(c, P, 2.4, C.ink, R, { bristles: 2, dry: 0.12, taper: 0.4 });
        brush(c, P, 1.2, i === 1 ? C.yellow : C.white, R, { bristles: 2, dry: 0.2, taper: 0.45 });
      }
    }, noT),
    // one dash of a ground ring (a short arc, along +x), placed round an ellipse: crisp at any radius
    dash: m.defineBit('a1:dash', 2, [18, 8, 9, 4], (c, R, v) => {
      const P = [[-6.5, 0.9], [-2.2, -0.2], [2.2, -0.2], [6.5, 0.9]];
      brush(c, P, 2.3, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.35 });
      brush(c, P, 1.1, v ? C.yellow : C.white, R, { bristles: 2, dry: 0.25, taper: 0.45 });
    }, noT),
    // a sparkle burst (blink arrival)
    burst: m.defineBit('a1:burst', 2, [28, 28, 14, 14], (c, R) => {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + R() * 0.3;
        brush(c, [[Math.cos(a) * 4, Math.sin(a) * 4], [Math.cos(a) * 11, Math.sin(a) * 11]], 1.2, i & 1 ? '#9ff3ff' : C.white, R, { bristles: 2, dry: 0.2, taper: 0.7 });
      }
      spark(c, 0, 0, 4.6, R);
      dab(c, 0, 0, 2, C.white, R);
    }, noT),
  };
}
/** Draw a bit with its anchor at (x, y) sim px, x / y scale, turned by ang. */
function blit(ctx, spr, S, x, y, sx, sy, ang) {
  if (!spr) return;
  const m = S / spr.k, cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
const nowRT = () => performance.now() / 1000;
const ROPE_N = 7;
// where things come from on each body, in multiples of the unit's radius from its feet (x forward, y up = negative):
// the mouth (roar) and the rope hand (lasso: people raise the front hand, animals hold it in the mouth)
const MOUTH = { person: [0.45, -2.0], giant: [0.4, -2.05], animal: [1.0, -0.95], beast: [1.0, -0.95] };
const HAND = { person: [0.95, -2.4], giant: [0.9, -2.2], animal: [1.0, -0.85], beast: [1.0, -0.85] };
const PULL = { person: [0.97, -1.5], giant: [0.9, -1.45], animal: [1.0, -0.85], beast: [1.0, -0.85] };
function bodyOf(u) { const m = u.def && u.def.maker; return (m && m.body) || 'person'; }
/** A ring of dashes round (x, y) (sim px) on the ground, radius R, flattened like the ground (× 0.46). */
function groundRing(ctx, S, x, y, R, rt) {
  const n = Math.max(12, Math.min(40, Math.round(R / 9))), k = Math.min(1.6, Math.max(0.7, R / 70)), turn = rt * 0.6;
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * TAU, cx = x + Math.cos(a) * R, cy = y + Math.sin(a) * R * 0.46;
    const tang = Math.atan2(Math.cos(a) * 0.46, -Math.sin(a));
    blit(ctx, SPX.bit(BITS.dash, i & 1), S, cx, cy, k, k, tang);
  }
}

// ---------------------------------------------------------------- lasso
OVER.lasso = function lassoOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || (bag.ph !== 1 && bag.ph !== 2)) return;
  if (!spx() || !BITS) return;
  const rt = nowRT(), r = u.radius || 9.9, H = (bag.ph === 2 ? PULL : HAND)[bodyOf(u)] || HAND.person;
  const hx = X / S + flip * H[0] * r, hy = Y / S + H[1] * r;   // the rope hand (people) / the mouth (animals)
  let ex, ey, vr = 0;
  if (bag.ph === 2 && world && world.unitById) {
    const v = world.unitById(bag.vic);
    if (!v) return;
    vr = v.radius || 9; ex = v.x; ey = v.y - Math.max(0, v.z || 0) - Math.max(6, vr * 0.9);
  } else { ex = bag.lx; ey = bag.ly - (bag.lz > 0 ? bag.lz : 0) - 6; }
  if (!(ex === ex && ey === ey)) return;
  const pull = bag.ph === 2, dx = ex - hx, dy = ey - hy, len = Math.hypot(dx, dy), sag = pull ? 1.5 : Math.min(14, len * 0.16);
  const rb = SPX.bit(BITS.rope, 0);
  if (rb) {
    let px = hx, py = hy;
    for (let i = 1; i <= ROPE_N; i++) {
      const t = i / ROPE_N, qx = hx + dx * t, qy = hy + dy * t + sag * 4 * t * (1 - t) + (pull ? Math.sin(rt * 40 + i) * 0.5 : 0);
      const sx = qx - px, sy = qy - py;
      blit(ctx, rb, S, px, py, Math.hypot(sx, sy) / 10.2, 1, Math.atan2(sy, sx));
      px = qx; py = qy;
    }
  }
  const lb = SPX.bit(BITS.loop, (rt * 8 | 0) & 1);
  if (pull) blit(ctx, lb, S, ex, ey, Math.max(0.7, vr / 9), 0.75, 0);
  else blit(ctx, lb, S, ex, ey, 0.8, 0.9, Math.atan2(dy, dx) + Math.sin(rt * 20) * 0.3);
};

// ---------------------------------------------------------------- roar
const ROAR_T = 1.2;   // s (act1-area.js RO.time)
OVER.roar = function roarOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || bag.ph !== 1 || !u.b) return;
  if (!spx() || !BITS) return;
  const age = now - (u.b.actT ?? now);
  if (!(age >= 0 && age < ROAR_T)) return;
  const r = u.radius || 9.9, k = Math.min(2.2, Math.max(0.6, r / 12)), rt = nowRT(), M = MOUTH[bodyOf(u)] || MOUTH.person;
  const hx = X / S + flip * M[0] * r, hy = Y / S + M[1] * r;   // the mouth
  const ang = flip > 0 ? 0 : Math.PI;
  for (let i = 0; i < 3; i++) {   // three waves, 0.25 s apart, each rolling out over 0.6 s
    const f = (age - i * 0.25) / 0.6;
    if (f <= 0 || f >= 1) continue;
    const s = (0.55 + 0.7 * f) * k;
    blit(ctx, SPX.bit(BITS.wave, (i + (rt * 8 | 0)) % 3), S, hx + flip * (2 + 30 * f) * k, hy - 3 * f * k, s, s, ang);
  }
  const R = bag.r > 0 ? bag.r : 220, g = Math.min(1, age / 0.7);   // the ground ring: out to its reach in 0.7 s, then it holds
  groundRing(ctx, S, X / S, Y / S + Math.max(0, u.z || 0), Math.max(r + 6, g * R), rt);
};

// ---------------------------------------------------------------- stomp (rearing up)
const REAR_T = 1;   // s (act1-area.js ST.rear)
OVER.stomp = function stompOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || bag.ph !== 1 || !u.b) return;
  if (!spx() || !BITS) return;
  const age = now - (u.b.actT ?? now);
  if (!(age >= 0 && age < REAR_T)) return;
  const R = bag.r > 0 ? bag.r : 60, f = age / REAR_T, r = u.radius || 9.9;   // tightens toward the feet as the blow comes
  groundRing(ctx, S, X / S, Y / S + Math.max(0, u.z || 0), r + (R - r) * (1 - 0.7 * f), -nowRT() * 2);
};

// ---------------------------------------------------------------- blink (where it will appear)
OVER.blink = function blinkOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || bag.ph !== 1) return;
  if (!spx() || !BITS) return;
  const rt = nowRT(), s = 0.8 + 0.25 * Math.sin(rt * 30);
  blit(ctx, SPX.bit(BITS.burst, (rt * 10 | 0) & 1), S, bag.x0, bag.y0 - (u.radius || 9.9) * 0.9, s, s, rt * 4);
};
