// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: W-MELEE. POSTER PAINT.
// PROJ: none of our own (no melee weapon shoots anything).
// OVER (mine-hooks.js, called by the made unit's entry over() with the identity transform, X / Y = device px of the
// unit's feet raised by its z, S = device px per sim px, now = world.time), reading the weapon bag (u.b.wb):
//  - anchor: while the hook is out (bag.phase 3, from bag.t0): the chain from the hand to the anchor; the anchor flies out
//    to the hooked unit (bag.victim) over 0.25 s, then the chain stays on it while it is yanked in (bag.yanked 1, 0.45 s).
//    Chain + anchor painted as the pirates' anchor (sprites-pirates.js chain / anchorShape).
//  - saw: sparks flying off the blade while a saw run rolls (bag.mode 1) and while it brakes biting (mode 2)
//    (sprites-robots.js sawOver / flySparks).
//  - slam: comic impact strokes round the slam ring (bag.ringX / ringY / ringR, from bag.ringT) for 0.3 s; the ring itself is
//    fx.js's 'blast' ring (the sim emits it).
// Where the hand / blade is: in body radii (x forward, y up = negative) per body; animals and beasts hold swing / heavy
// weapons in the mouth (rig-mine.js), so theirs sit at the snout.
import { OVER } from './mine-hooks.js';
import { C, TAU, brush, dab, spark, tube, ring, part, poly, outline } from './paint.js';
export const PROJ = {};

const IRON = '#46474e', IRONL = '#7a7e88';
const HAND = { person: [0.95, -1.25], giant: [0.95, -1.35], animal: [1.2, -0.95], beast: [1.15, -0.9] };   // anchor grip
const BLADE = { person: [1.6, -1.15], giant: [1.6, -1.25], animal: [1.65, -0.9], beast: [1.55, -0.85] };   // saw blade
const T = {
  throwTime: 0.25,   // s: the hook flies out this long (melee-tricks.js ANCHOR.throwTime)
  lift: 0.85,        // the chain ends this many of the hooked unit's radii above its feet
  hookS: 0.9,        // anchor drawn at this × the body scale
  slamShow: 0.3,     // s the slam strokes show
  strokes: 9,        // impact strokes round the ring
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nowRT = () => performance.now() / 1000;
const bodyOf = (u) => (u.def && u.def.maker && u.def.maker.body) || 'person';
const sizeK = (u) => clamp((u.radius || 9.9) / 9.9, 0.45, 2.6);

// Effect bits come from sprites.js defineBit; sprites.js imports this module, so it is loaded lazily on the first draw
// (fully loaded by then), as sprites-robots.js does.
let SPX = null, spxP = null, BITS = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function defineBits(m) {
  const noT = { tooth: false };
  return {
    chain: m.defineBit('mm:chain', 2, [104, 8, 2, 4], (c, R) => {   // a 100 px chain along +x, scaled to length
      brush(c, [[0, 0], [100, 0]], 1.5, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
      for (let x = 1.2; x < 100; x += 2.4) {
        const odd = ((x / 2.4) | 0) & 1;
        if (odd) dab(c, x, 0, 0.75, IRONL, R, 0.1);
        else { outline(c, ring(x, 0, 1.25, 0.8, R, 0.05, 6), R, 0.55, { jit: 0.05 }); dab(c, x, 0, 0.5, IRONL, R, 0.1); }
      }
    }, noT),
    hook: m.defineBit('mm:hook', 2, [16, 26, 8, 2], (c, R) => {   // the anchor hanging from its ring at (0, 0), flukes down (+y)
      const M = { R, mx: 0.6, my: 0.6, grow: 0.4, lw: 1.1 };
      outline(c, ring(0, 0, 1.6, 1.6, R, 0.05, 7), R, 1.1, { jit: 0.1 });
      tube(c, [[0, 1.4], [0, 12]], 2, IRONL, R, 0.8);
      tube(c, [[-4.2, 3.4], [4.2, 3.4]], 1.5, IRONL, R, 0.7);
      tube(c, [[-7, 6.8], [-5.4, 10.6], [0, 12.7], [5.4, 10.6], [7, 6.8]], 2, IRONL, R, 0.8);
      for (const k of [-1, 1]) part(c, poly([[k * 8.4, 4.9], [k * 5.2, 7.7], [k * 7.4, 9.4]], R, 0.1), IRON, M, { lw: 0.8, sharp: true });
    }, noT),
    spk: m.defineBit('mm:spk', 3, [10, 10, 5, 5], (c, R, v) => { if (v === 2) dab(c, 0, 0, 1.6, C.yellow, R); else spark(c, 0, 0, 2.6, R); }, noT),
    stroke: m.defineBit('mm:stroke', 2, [14, 6, 1, 3], (c, R) => {   // one impact stroke along +x, thick at the start
      brush(c, [[0, 0], [12, 0]], 2.6, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.9 });
      brush(c, [[0.6, 0], [10, 0]], 1.4, '#fffbe0', R, { bristles: 2, dry: 0.08, taper: 0.9 });
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
const AT = new Float64Array(2);
function at(table, u, X, Y, flip, S) {
  const k = table[bodyOf(u)] || table.person, r = u.radius || 9.9;
  AT[0] = X / S + flip * k[0] * r; AT[1] = Y / S + k[1] * r;
  return AT;
}

// anchor: the chain out to the hook / the hooked unit (bag.phase 3 = the hook throw, melee-tricks.js)
OVER.anchor = function anchorOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || bag.phase !== 3) return;
  if (!spx() || !BITS) return;
  const h = at(HAND, u, X, Y, flip, S), hx = h[0], hy = h[1], k = sizeK(u);
  const v = bag.victim >= 0 && world && world.unitById ? world.unitById(bag.victim) : null;
  let tx, ty;
  if (v && !v.dead) { tx = v.x; ty = v.y - (v.z || 0) - (v.radius || 9) * T.lift; }
  else { const a = bag.aimA === bag.aimA ? bag.aimA : (u.heading || 0); tx = hx + Math.cos(a) * 60 * k; ty = hy + Math.sin(a) * 60 * k; }
  const q = bag.yanked ? 1 : clamp((now - bag.t0) / T.throwTime, 0, 1);
  const ex = hx + (tx - hx) * q, ey = hy + (ty - hy) * q;
  const dx = ex - hx, dy = ey - hy, len = Math.sqrt(dx * dx + dy * dy);
  if (len > 1) blit(ctx, SPX.bit(BITS.chain, 0), S, hx, hy, len / 100, Math.min(1.6, 0.8 + 0.3 * k), Math.atan2(dy, dx));
  const ang = len > 1 ? Math.atan2(dy, dx) - Math.PI / 2 : 0;   // the anchor's shank along the chain, flukes leading
  blit(ctx, SPX.bit(BITS.hook, 0), S, ex, ey, T.hookS * Math.min(1.8, k), T.hookS * Math.min(1.8, k), ang);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

// saw: sparks off the blade while it runs / bites (sprites-robots.js sawOver + flySparks)
OVER.saw = function sawOver(ctx, u, bag, X, Y, flip, S) {
  if (!bag || !(bag.mode === 1 || (bag.mode === 2 && u.attack > 0))) return;
  if (!spx() || !BITS) return;
  const p = at(BLADE, u, X, Y, flip, S), k = sizeK(u), rt = nowRT(), ph = (u.id % 7) * 0.13;
  for (let i = 0; i < 5; i++) {
    const q = (rt * 3.1 + i * 0.213 + ph) % 1, a = -0.4 - i * 0.55 + Math.sin(i * 7.3) * 0.3, sp = (10 + i * 2.2) * k;
    const px = p[0] - flip * Math.cos(a) * sp * q, py = p[1] + Math.sin(a) * sp * q * 1.2 + 22 * q * q * k;   // sprayed back off the blade
    blit(ctx, SPX.bit(BITS.spk, i === 4 ? 2 : (i & 1)), S, px, py, 0.55 * (1 - q * 0.7) * k, 0.55 * (1 - q * 0.7) * k, rt * 7 + i);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

// slam: impact strokes thrown out round the ring for 0.3 s after the fists land
OVER.slam = function slamOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || !(bag.ringR > 0)) return;
  const q = (now - bag.ringT) / T.slamShow;
  if (!(q >= 0 && q < 1)) return;
  if (!spx() || !BITS) return;
  const r = bag.ringR * (0.75 + 0.6 * q), s = Math.min(2, bag.ringR / 18) * (1 - 0.6 * q), spr = SPX.bit(BITS.stroke, (u.id + (bag.ringT * 10 | 0)) & 1);
  for (let i = 0; i < T.strokes; i++) {
    const a = (i / T.strokes) * TAU + bag.ringT * 3.7;
    blit(ctx, spr, S, bag.ringX + Math.cos(a) * r, bag.ringY + Math.sin(a) * r * 0.55, s, s, Math.atan2(Math.sin(a) * 0.55, Math.cos(a)));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};
