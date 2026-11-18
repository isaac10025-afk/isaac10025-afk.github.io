// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: A-MOVE. Per-frame extras (mine-hooks.js OVER) for the
// A-MOVE abilities (sim/maker/abilities/move*.js), in POSTER PAINT. Everything is a baked atlas bit (sprites.js
// defineBit / bit, painted once per scale), so a frame only drawImage()s: no painting per frame.
//   beam      the tractor beam (the UFO's cone, copied from sprites-space.js cone()) from the unit down to the ground while
//             it beams (bag.bm 1; the victim is drawn by RENDER at its own u.z inside it), stretched to the unit's height.
//   burrow    cracks in the ground round the mound while it rumbles (bag.ph 2), shaking; the mound itself is ART-BODY's
//             'under' pose (b.act ACT.UNDER).
//   firedive  a trail of flames streaming behind the unit on its swoop run (bag.fd 2, along bag.dx / bag.dy).
// The rest need nothing here: grabdrop's victim hangs under the flyer at its own z (RENDER), wings / skates / fins are
// gear (ART-ABILITY), the ghost look and the mound are ART-BODY's, lava patches are the lava golem's 'lava' PROJ.
import { OVER } from './mine-hooks.js';
import { C, TAU, brush, ring, poly, fill, outline, dab } from './paint.js';
export const PROJ = {};

// sprites.js is loaded lazily (it imports this module while it loads: a static import would be a cycle). Read only.
let SPX = null, spxP = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; }, () => { spxP = null; }); return SPX; }
let B = null;   // the bit handles, defined on the first draw once sprites.js is in
function bits() {
  if (B) return B;
  const SP = spx(); if (!SP) return null;
  B = {
    cone: SP.defineBit('mmove-cone', 3, [48, CONE_L + 8, 24, 0], paintCone),
    crack: SP.defineBit('mmove-crack', 3, [60, 24, 30, 12], paintCracks),
    flame: SP.defineBit('mmove-flame', 3, [30, 18, 3, 9], paintFlame),
  };
  return B;
}
/** Draw bit handle h variant v at device (X, Y): sx / sy device px per sprite px, rotation a. false = not baked yet. */
function put(h, v, X, Y, sx, sy, a) {
  const SP = SPX, s = SP.bit(h, v);
  if (!s) return false;
  const m = 1 / s.k, c = Math.cos(a), n = Math.sin(a);
  CTX.setTransform(c * sx * m, n * sx * m, -n * sy * m, c * sy * m, X, Y);
  CTX.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax, -s.ay, s.sw, s.sh);
  return true;
}
let CTX = null;
const boil = (now, id) => (Math.floor(now * 8 + id * 0.37) % 3 + 3) % 3;   // line boil: 3 variants at 8 fps

// ---------------------------------------------------------------- painters (sprite px, baked once per scale)
const CONE_L = 60;   // px: painted cone length (stretched to the unit's height)
function sparkle(c, x, y, r, col, R) {
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, k = i % 2 ? 0.32 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.08 * r), col, R, { sharp: true, vary: 0.05, edge: 0 });
}
// the UFO's tractor beam (sprites-space.js cone): a pale yellow cone, glow rings, sparkles, a bright pool at the bottom
function paintCone(c, R) {
  const w0 = 6, w1 = 21, H = CONE_L;
  c.save();
  c.globalAlpha = 0.42; fill(c, poly([[-w0, 0], [w0, 0], [w1, H], [-w1, H]], R, 0.3), '#fff3a6', R, { sharp: true, edge: 0, vary: 0.08 });
  c.globalAlpha = 0.42; fill(c, ring(0, H, w1 + 1, 5.6, R, 0.08, 11), '#fff6b8', R, { edge: 0 });
  c.globalAlpha = 0.55;
  for (const t of [-0.7, -0.2, 0.3, 0.75]) brush(c, [[t * w0, 1], [t * (w0 + w1) * 0.5, H * 0.5], [t * w1, H - 2]], 1.2, '#fffbe0', R, { bristles: 2, dry: 0.5, taper: 0.4 });
  c.globalAlpha = 0.7;
  for (const f of [0.28, 0.55, 0.82]) { const w = w0 + (w1 - w0) * f; outline(c, ring(0, H * f, w, 1.6 + f * 2.2, R, 0.05, 10), R, 0.7, { col: '#ffe14a', jit: 0.1, gap: true }); }
  c.globalAlpha = 0.9;
  for (const [x, y] of [[-6, 18], [7, 30], [-11, 44], [10, 52], [2, 40]]) sparkle(c, x + (R() - 0.5) * 2, y + (R() - 0.5) * 2, 1.3, C.white, R);
  c.restore();
  outline(c, [[-w0, 0.5], [-w1, H]], R, 0.6, { col: '#e8c21a', jit: 0.2, over: 0, gap: true });
  outline(c, [[w0, 0.5], [w1, H]], R, 0.6, { col: '#e8c21a', jit: 0.2, over: 0, gap: true });
}
// ground cracks round a rumbling mound: jagged black lines out from the middle (seen from the side: flat), clods kicked up
function paintCracks(c, R) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + (R() - 0.5) * 0.6, ca = Math.cos(a), sa = Math.sin(a) * 0.38;
    const r0 = 9 + R() * 3, r1 = 22 + R() * 7, k = 0.45 + R() * 0.2;
    const pts = [[ca * r0, sa * r0], [ca * (r0 + (r1 - r0) * k) + (R() - 0.5) * 3, sa * (r0 + (r1 - r0) * k) + (R() - 0.5) * 1.6], [ca * r1, sa * r1]];
    brush(c, pts, 1.5, C.ink, R, { bristles: 2, taper: 0.7, dry: 0.3 });
  }
  for (let i = 0; i < 5; i++) dab(c, (R() - 0.5) * 40, -2 - R() * 8, 1.2 + R() * 1.1, i & 1 ? '#6b4426' : '#8a5a33', R);
}
// one flame tongue pointing +x from its root (0, 0): red edge, orange body, yellow core, a dry-brush flick at the tip
function paintFlame(c, R) {
  const L = 24 + R() * 3, H = 6.5 + R();
  const body = poly([[0, -H * 0.55], [L * 0.35, -H], [L * 0.7, -H * 0.55], [L, (R() - 0.5) * 2], [L * 0.7, H * 0.5], [L * 0.32, H * 0.95], [0, H * 0.55]], R, 0.5);
  fill(c, body, C.fireR, R, { vary: 0.08 });
  fill(c, poly([[1.5, -H * 0.35], [L * 0.4, -H * 0.62], [L * 0.72, -H * 0.2], [L * 0.6, H * 0.3], [L * 0.3, H * 0.6], [1.5, H * 0.35]], R, 0.4), C.fireO, R, { vary: 0.06, edge: 0 });
  fill(c, poly([[2.5, -H * 0.18], [L * 0.32, -H * 0.3], [L * 0.45, 0], [L * 0.3, H * 0.28], [2.5, H * 0.18]], R, 0.3), C.fireY, R, { vary: 0.05, edge: 0 });
  brush(c, [[L * 0.8, -H * 0.2], [L + 3, -H * 0.5]], 1.2, C.fireO, R, { bristles: 2, dry: 0.7, taper: 0.6 });
  outline(c, body, R, 1.1, { gap: true, jit: 0.25 });
}

// ---------------------------------------------------------------- OVER (device px; X, Y = the unit's feet, raised by u.z)
OVER.beam = (ctx, u, bag, X, Y, flip, S, now) => {
  if (bag.bm !== 1) return;
  const z = u.z || 0; if (z < 8) return;
  const H = bits(); if (!H) return;
  CTX = ctx;
  const ph = (u.id % 13) * 0.7, wx = Math.max(0.8, u.radius / 14) * (1 + 0.06 * Math.sin(now * 9 + ph));   // width: the unit's size, shimmering
  ctx.globalAlpha = 0.82 + 0.18 * Math.sin(now * 23 + ph);
  put(H.cone, boil(now, u.id), X, Y, S * wx, (z * S) / CONE_L, 0);
  ctx.globalAlpha = 1;
};
OVER.burrow = (ctx, u, bag, X, Y, flip, S, now) => {
  if (bag.ph !== 2) return;   // rumbling: about to burst up
  const H = bits(); if (!H) return;
  CTX = ctx;
  const k = Math.max(0.6, u.radius / 14), shake = Math.sin(now * 47 + u.id) * 1.2 * S;
  put(H.crack, boil(now, u.id), X + shake, Y, S * k, S * k, 0);
};
OVER.firedive = (ctx, u, bag, X, Y, flip, S, now) => {
  if (bag.fd !== 2) return;   // the swoop run
  const H = bits(); if (!H) return;
  CTX = ctx;
  const a = Math.atan2(bag.dy, bag.dx) + Math.PI, r = u.radius, k = Math.max(0.55, r / 15);   // flames stream back along the run
  for (let i = 0; i < 4; i++) {
    const d = r * (0.6 + i * 0.8), f = 1 - i * 0.22, wob = Math.sin(now * 19 + i * 2.1 + u.id) * 0.18;
    put(H.flame, (boil(now, u.id) + i) % 3, X - bag.dx * d * S, Y - bag.dy * d * S - r * 0.5 * S, S * k * f, S * k * f * (1 + wob), a + wob * 0.5);
  }
};
