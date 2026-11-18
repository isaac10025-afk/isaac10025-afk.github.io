// BOSSES tab sprites (OURS, Part 2 step 6, STEP6.md). Owner: BOSSES-ART. Contract: ART.md + RIG.md + PROJ (sprites.js).
// A 7-year-old's tempera monsters, huge and funny: a coral kraken peeping out of the sea with eight sucker arms, a steel
// giant mech with hazard stripes and shoulder rocket pods, a green many-headed hydra, a basalt lava golem with glowing
// cracks, a pink giant worm that tunnels as a dirt mound and bursts up through cracks, a pink king slime with a gold crown
// and the dark shapes of what it swallowed sloshing inside (+ its split: big slime, slimelet). Every entry paints ONE frame
// facing RIGHT, feet (or the waterline) at (0, 0), up = -y, 1 sprite px = 1 sim px at the def radius.
//
// Colours. FFA = natural colours (own). Team battle (o.col = C.red / C.blue): kraken a bandana round its head, mech the
// stripes + side panel, hydra a saddle band, golem a sash, worm a sweatband under its head, slimes the whole jelly (OG).
// o.dead 'dead' = X eyes, limp (all lie: 'none', painted lying); 'burnt' = all charcoal. o.risen (slimes only can be) =
// zombie jelly. Bosses are never raised.
//
// Poses (entry pick(u, info) from STEP6.md b.act codes; RENDER's default = walk0 / walk1 while moving, else poses[0]):
//   kraken    head0 / head1 (bobbing; head1 = a blink), ink (b.act 1: squeezed, squinting, ink blots on the water).
//             Draws itself (drawUnit): wake, the head + eyes above the water, foam lip, and the 8 arms from b.ax[i] /
//             b.ay[i] (tip, world px), b.as[i] (0 idle sway: curled up out of the water, 1 reach: arched out, 2 slam: comes
//             down hard + splash, 3 hold: coiled round b.av[i], 4 pull back) as chains of painted segments. Whole poses
//             (icon, sheet, fallback) have 4 painted arms of their own.
//   gmech     idle, walk0 / walk1, missiles (b.act 1: shoulder pod open, rockets out), laser (b.act 2: chest lens blazing;
//             the beam is drawn from it along b.beamA (rad, world) for b.beamL px), stomp (b.act 3: near leg high, then
//             slammed with impact lines), dying (b.act 4: sparks + smoke, slumped). Floppy ('gmech', rig-bosses.js).
//   hydra     idle, walk0 / walk1. Draws itself (drawUnit): body on the stride (trot), tail, and b.heads necks + heads in a
//             fan (slot 0 = the middle head, the others alternate out to the sides; the fan widens with more heads), per
//             slot b.hs[i] (0 sway, 1 bite: lunges, jaws open, 2 stump: short neck, cut end, smokes while it burns or once
//             fire sealed it (b.hb[i]); the cut head drops off, bounces and fades, 3 growing: pops out of the stump, 4
//             breath: jaws wide, a flame in the mouth: the fire itself is the sim's `flame` projectiles) from world time
//             b.hT[i]. Wades: cut at the waterline. Whole poses show 3 heads (+ bite, breath, stumps extras).
//   lavagolem idle, walk0 / walk1, punch (b.act 1, also u.attack > 0: near fist thrust forward), throw (b.act 2: both arms
//             overhead with a lava blob). Floppy ('golem'): dead it falls apart into a rock heap.
//   worm      idle (up, beak shut), under (b.act 1: a dirt mound, jiggles, kicks up dust as it moves), rumble (b.act 2:
//             cracks spread, the mound shakes), burst (b.act 3: shoots up through the cracks, dirt clods fly), bite (b.act 4:
//             up out of its hole, swaying, the petal beak opens on a ring of teeth, lunges on u.attack), dive (b.act 5:
//             sinks back into the hole, then the mound). Draws itself. A purple ringed worm with orange back spikes.
//   kingslime / bigslime / slimelet  idle, hop (b.act 1 / u.z > 1: stretched), land (b.act 2: squashed). Floppy
//             ('kslime'): b.inside dark shapes (max 6 / 2 / 0) slosh inside the jelly.
// Projectiles (PROJ): missile (rocket on a flame with a smoke trail, lifted by p.z, shadow), lavablob (glowing lob, p.z or
// p.apex arc, shadow), lava (ground: true: a molten pool r = p.r that bubbles and crusts over as p.life runs out).
import { C, TAU, lerp, tone, brush, ring, poly, fill, part, dab, spline, shift, spark } from './paint.js';
import { fresh, inputs } from './rig.js';
import { resetGP, gmechEmit, golemEmit, slimeEmit, emitWith, xslot, xdt, xwalk, xspring, xkick, XA, XAN, clamp01 as cl } from './rig-bosses.js';

// ---------------------------------------------------------------- shared helpers
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const teamOf = (o, own) => (o.col && !sameCol(o.col, own)) ? o.col : null;
const pc = (o, nat, zom = C.zskin, burnt = C.char) => (o.dead === 'burnt' ? burnt : o.risen ? zom : nat);
const MILK = '#e7edd6';
const act = (u) => (u.b && u.b.act) | 0;
const jit = (P, R, j = 0.3) => P.map(([x, y]) => [x + (R() - 0.5) * 2 * j, y + (R() - 0.5) * 2 * j]);
function inkLine(c, P, w, R) { brush(c, jit(P, R), w, C.ink, R, { bristles: 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 }); }
function xEye(c, x, y, s, R, w = 0.8) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
/** big cartoon eye; dead = X; risen = milky. slit: a horizontal bar pupil (kraken). lid 0..1 closes it from the top. */
function eye(c, o, x, y, r, R, opt = {}) {
  if (o.dead) { xEye(c, x, y, r * 0.8, R, Math.max(0.7, r * 0.42)); return; }
  if (o.risen) { dab(c, x, y, r * 1.1, MILK, R); dab(c, x + r * 0.3, y + r * 0.3, r * 0.4, C.ink, R); return; }
  dab(c, x, y, r, opt.white || C.white, R);
  if (opt.slit) { brush(c, [[x - r * 0.45, y + r * 0.05], [x + r * 0.55, y]], r * 0.42, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); }
  else dab(c, x + r * 0.3, y + r * 0.1, r * 0.5, C.ink, R);
  if (!opt.lid) dab(c, x - r * 0.3, y - r * 0.35, r * 0.2, C.white, R);
  brush(c, ring(x, y, r, r, R, 0.05, 9).concat([[x + r, y + 0.1]]), Math.max(0.6, r * 0.18), C.ink, R, { bristles: 2, dry: 0.1, taper: 0 });
  if (opt.lid) {
    const L = opt.lid, yy = y - r + 2 * r * L;
    fill(c, [[x - r * 1.05, y - r * 1.1], [x + r * 1.05, y - r * 1.1], [x + r * 1.05, yy], [x, yy + r * 0.12], [x - r * 1.05, yy]], opt.lidCol || C.skin, R, { edge: 0 });
    brush(c, [[x - r * 1.05, yy], [x, yy + r * 0.12], [x + r * 1.05, yy]], Math.max(0.6, r * 0.2), C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  }
  if (opt.brow) brush(c, [[x - r * 1.2, y - r * 1.25 - opt.brow], [x + r * 1.1, y - r * 0.85 + opt.brow * 0.4]], Math.max(0.7, r * 0.34), C.ink, R, { bristles: 3, dry: 0.1 });
}
/** a fill whose ink outline runs only along the given index ranges of pts. */
function partEdges(c, pts, ranges, col, M, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  for (const [i0, i1] of ranges) { const P = []; for (let i = i0; i <= i1; i++) P.push(pts[i % pts.length]); inkLine(c, P, o.lw ?? M.lw, M.R); }
}
function stripPts(pts, ws) {
  const n = pts.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = ws[i] / 2;
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); Rr.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return [L, Rr];
}
/** a tube along a centre line (widths per point). cap 1 = outline round the far end too. Returns [left, right] edges. */
function strip(c, pts, ws, col, M, cap = 0, o = {}) {
  const [L, Rr] = stripPts(pts, ws), rv = Rr.slice().reverse(), all = L.concat(rv);
  fill(c, shift(all, M.mx, M.my, M.grow * 0.6), col, M.R, o);
  const lw = o.lw ?? M.lw;
  if (cap) inkLine(c, L.concat(rv), lw, M.R);
  else { inkLine(c, L, lw, M.R); inkLine(c, Rr, lw, M.R); }
  return [L, Rr];
}
function teeth(c, x0, x1, y, n, h, dir, col, R, w = 0.75) {
  const P = []; for (let i = 0; i <= n * 2; i++) P.push([lerp(x0, x1, i / (n * 2)), y + (i & 1 ? dir * h : 0)]);
  brush(c, P, w, col, R, { bristles: 2, dry: 0, taper: 0 });
}
function scorch(c, pts, R, col = C.charL) { for (const [x, y, r] of pts) dab(c, x, y, r, col, R, 0.35); }
function bolts(c, pts, r, col, R) { for (const [x, y] of pts) { dab(c, x, y, r, col, R); dab(c, x - r * 0.25, y - r * 0.25, r * 0.35, tone(col, 0.45), R); } }
function about(c, x, y, a, fn) { if (!a) { fn(); return; } c.save(); c.translate(x, y); c.rotate(a); c.translate(-x, -y); fn(); c.restore(); }
function puffs(c, pts, col, R) { for (const [x, y, r] of pts) { part(c, ring(x, y, r, r * 0.86, R, 0.16, 8), col, { R, mx: 0.5, my: 0.4, grow: 0.2, lw: Math.max(0.8, r * 0.16) }, { lw: Math.max(0.8, r * 0.16), vary: 0.06 }); } }
/** paint a list of [layerName, a, b, c, d, e, f] (from an emit sink) with T.layer. */
function paintList(c, o, list, layer) { for (const it of list) { c.save(); c.transform(it[1], it[2], it[3], it[4], it[5], it[6]); layer(c, o, it[0]); c.restore(); } }
const POSE_CODE = new Map();
const code = (pose) => { let k = POSE_CODE.get(pose); if (k === undefined) { k = POSE_CODE.size + 1; POSE_CODE.set(pose, k); } return k; };

// ---------------------------------------------------------------- drawing for the bosses that draw themselves
// sprites.js (bake cache) and fx.js (fire, dust) import this module, so they are loaded lazily on the first frame drawn.
let SPX = null, spxP = null, FXM = null, fxP = null;
const RIG_ON = !(typeof location !== 'undefined' && /[?&]rig=0\b/.test(location.search));   // ?rig=0: whole sprites (A/B), as index.js
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; }, () => { spxP = null; }); return SPX; }
function fxm() { if (!fxP) fxP = import('./fx.js').then((m) => { FXM = m; }, () => { fxP = null; }); return FXM; }
/** a baked part (variant v, falls back to variant 0) or null (queued: skip it this frame, never a wrong whole frame). */
function partSpr(SPm, ent, col, pi, v) {
  if (pi < 0) return null;
  const k = SPm.key(ent.id, col, pi, v, 0, 0, 0, 0);
  let s = SPm.peek(k);
  if (!s && v !== 0) { SPm.want(k); s = SPm.peek(SPm.key(ent.id, col, pi, 0, 0, 0, 0, 0)); }
  if (!s) { SPm.get(SPm.key(ent.id, col, pi, 0, 0, 0, 0, 0)); return null; }
  return s;
}
const IDXC = new Map();   // ent -> { name: pose index } (resolved once)
function idxOf(ent, names) {
  let r = IDXC.get(ent);
  if (!r) { r = {}; for (const n of names) r[n] = ent.pose('r:' + n); IDXC.set(ent, r); }
  return r;
}
// The draw list: sprites with their DEVICE matrix (+ a waterline cut in device y, + alpha), drawn at the end (twice when the
// unit flashes from a hit). base*() set the current entry -> device transform; rec() adds one sprite through entry matrix.
const RCAP = 200;
const RS = new Array(RCAP).fill(null), RM = new Float64Array(RCAP * 6), RW = new Float64Array(RCAP), RA = new Float32Array(RCAP);
let RN = 0, B0 = 1, B3 = 1, B4 = 0, B5 = 0, WY = 1e9, AL = 1;
function base(x, y, flip, kk, S) { B0 = flip * kk * S; B3 = kk * S; B4 = x * S; B5 = y * S; }
function baseWorld(S) { B0 = S; B3 = S; B4 = 0; B5 = 0; }
function rec(s, a, b, c, d, e, f) {
  if (!s || RN >= RCAP) return;
  const ik = 1 / s.k, o = RN * 6;
  RM[o] = B0 * a * ik; RM[o + 1] = B3 * b * ik; RM[o + 2] = B0 * c * ik; RM[o + 3] = B3 * d * ik; RM[o + 4] = B0 * e + B4; RM[o + 5] = B3 * f + B5;
  RW[RN] = WY; RA[RN] = AL; RS[RN++] = s;
}
/** rec with a turn ang about (px, py) + uniform scale sc about it + a move (tx, ty) (entry units). */
function recR(s, px, py, ang, sc, tx, ty) {
  const cs = Math.cos(ang) * sc, sn = Math.sin(ang) * sc;
  rec(s, cs, sn, -sn, cs, px - cs * px + sn * py + tx, py - sn * px - cs * py + ty);
}
function draw1(ctx, i) {
  const s = RS[i], o = i * 6, A = RM[o], Bq = RM[o + 1], Cq = RM[o + 2], D = RM[o + 3], E = RM[o + 4], F = RM[o + 5], Wy = RW[i];
  ctx.setTransform(A, Bq, Cq, D, E, F);
  const x0 = -s.ax, y0 = -s.ay, w = s.sw, h = s.sh;
  if (Wy > 1e8 || D <= 1e-3) { ctx.drawImage(s.img, s.sx, s.sy, w, h, x0, y0, w, h); return; }
  const vL = (Wy - F - Bq * x0) / D, vR = (Wy - F - Bq * (x0 + w)) / D;   // cut row at the left / right edge
  if (vL >= y0 + h && vR >= y0 + h) { ctx.drawImage(s.img, s.sx, s.sy, w, h, x0, y0, w, h); return; }
  if (vL <= y0 && vR <= y0) return;
  const n = Math.max(1, Math.min(24, Math.ceil(Math.abs(vL - vR) / 1.2))), sw = Math.ceil(w / n);
  for (let k = 0; k < n; k++) {
    const ua = k * sw, uw = Math.min(sw + 1, w - ua);
    if (uw <= 0) break;
    const v = (Wy - F - Bq * (x0 + ua + uw * 0.5)) / D;
    let hh = v - y0; if (hh <= 0) continue; if (hh > h) hh = h;
    ctx.drawImage(s.img, s.sx + ua, s.sy, uw, hh, x0 + ua, y0, uw, hh);
  }
}
function flushRec(ctx, flash, alpha) {
  for (let pass = 0; pass < (flash > 0 ? 2 : 1); pass++) {
    if (pass === 1) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < RN; i++) {
      const a = RA[i] * alpha * (pass === 1 ? flash * 0.55 : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a; draw1(ctx, i);
    }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < RN; i++) RS[i] = null;
  RN = 0; WY = 1e9; AL = 1;
}
// cubic Bezier sampled into BZ (x, y pairs), n + 1 points
const BZ = new Float64Array(64), BW = new Float64Array(32);
function bezier(x0, y0, x1, y1, x2, y2, x3, y3, n) {
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    BZ[i * 2] = a * x0 + b * x1 + c * x2 + d * x3; BZ[i * 2 + 1] = a * y0 + b * y1 + c * y2 + d * y3;
  }
}
/** a chain of segment sprites along BZ (n + 1 points), widths BW, in the current base; tip sprite at the end (or none).
 *  seg sprites are painted 10 long (x 0..10) and 10 wide (y -5..5); tips 10 wide at x = 0. side = +1 / -1: which way the
 *  painted underside (y +) faces. Returns the end tangent angle. */
function chain(seg, tip, n, side, tipK) {
  let ang = 0;
  for (let j = 0; j < n; j++) {
    const px = BZ[j * 2], py = BZ[j * 2 + 1], qx = BZ[j * 2 + 2], qy = BZ[j * 2 + 3];
    let dx = qx - px, dy = qy - py; const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
    dx /= len; dy /= len; ang = Math.atan2(dy, dx);
    const L = len * 1.22 / 10, w = (BW[j] + BW[j + 1]) * 0.05 * side;
    rec(seg, dx * L, dy * L, -dy * w, dx * w, px - dx * len * 0.11, py - dy * len * 0.11);
  }
  if (tip) { const dx = Math.cos(ang), dy = Math.sin(ang), w = BW[n] * 0.1 * tipK; rec(tip, dx * w, dy * w, -dy * w * side, dx * w * side, BZ[n * 2] - dx * w * 1.5, BZ[n * 2 + 1] - dy * w * 1.5); }
  return ang;
}

// ================================================================ KRAKEN (r 33): coral, cream suckers, yellow slit eyes
const KR_OWN = '#ee6a3c';
function krPal(o) {
  return { skin: pc(o, KR_OWN), dark: pc(o, '#b23e26', C.zskinD, C.charL), light: pc(o, '#ffb48c', tone(C.zskin, 0.3), C.charL),
    sucker: pc(o, '#ffe6cc', '#e8ecd2', C.charL), spot: pc(o, '#c84a2c', C.zskinD, C.charL), eye: pc(o, '#ffe14a', MILK, C.charL), ink: '#33243f' };
}
const KR_HEAD = [[-30, 0], [-33, -14], [-35, -30], [-30, -46], [-18, -58], [-2, -63], [12, -58], [20, -46], [25, -32], [30, -16], [31, 0]];
function krHead(c, o, R, M, pose) {
  const Pl = krPal(o), burnt = o.dead === 'burnt', ink = pose === 'ink';
  const pts = ink ? KR_HEAD.map(([x, y]) => [x * 0.9, y * 1.08]) : KR_HEAD;
  partEdges(c, poly(pts, R, 0.5), [[0, 10]], Pl.skin, M, { lw: 2.4, sp: 1.0 });
  // belly band low at the front, spots high on the mantle
  brush(c, [[-24, -6], [-6, -9], [14, -9], [27, -6]], 5, Pl.light, R, { taper: 0.3, dry: 0.4, bristles: 6 });
  if (!burnt) for (const [x, y, r] of [[-20, -44, 3], [-8, -52, 2.4], [-26, -30, 2.2], [4, -48, 1.9], [-14, -34, 1.6], [14, -42, 1.4]]) dab(c, x * (ink ? 0.9 : 1), y * (ink ? 1.08 : 1), r, Pl.spot, R);
  if (burnt) scorch(c, [[-14, -40, 4], [6, -30, 3], [-24, -20, 3]], R);
  const team = teamOf(o, KR_OWN);
  if (team) {   // a bandana tied round the mantle, knot + tails at the back
    const k = burnt ? C.charL : team, yb = ink ? -41 : -38;
    brush(c, [[-33, yb + 6], [-14, yb - 1], [6, yb], [21, yb + 5]], 6.5, k, R, { taper: 0.05, dry: 0.12, bristles: 7 });
    brush(c, [[-33, yb + 4], [-41, yb + 10], [-44, yb + 17]], 3.4, k, R, { taper: 0.6, dry: 0.2, bristles: 4 });
    brush(c, [[-33, yb + 5], [-43, yb + 4], [-48, yb + 8]], 3.2, k, R, { taper: 0.6, dry: 0.2, bristles: 4 });
    for (const x of [-22, -8, 8]) dab(c, x, yb + 1, 1.1, C.white, R);
  }
  // eyes (both, kid 3/4) with angry brows; mouth a wavy frown above the water
  const lid = pose === 'head1' ? 0.62 : ink ? 0.42 : 0;
  const ey = ink ? -25 : -23;
  eye(c, o, 6, ey, 8.5, R, { slit: true, white: Pl.eye, lid, lidCol: Pl.skin, brow: ink ? 2.4 : 1.2 });
  eye(c, o, 21, ey + 1, 7, R, { slit: true, white: Pl.eye, lid, lidCol: Pl.skin, brow: ink ? 2.4 : 1.2 });
  if (!o.dead) brush(c, [[5, -8.5], [9, -10.5], [13, -8.5], [17, -10.5], [21, -8.6]], 1.1, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 });
  else brush(c, [[6, -9], [13, -7.5], [20, -9]], 1, C.ink, R, { bristles: 2, dry: 0 });
  if (ink && !o.dead) {   // ink blotting out round it on the water
    for (const [x, y, r] of [[-38, -2, 6], [-30, 2, 4.5], [34, -1, 5.5], [42, 1.5, 3.6], [-46, 1, 3]]) part(c, ring(x, y, r, r * 0.5, R, 0.25, 8), Pl.ink, M, { lw: 1.2 });
    for (const [x, y] of [[-24, -64], [-10, -70], [6, -66]]) brush(c, [[x, y], [x + 2, y - 5]], 1.2, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.6 });   // anger lines
  }
}
function krWake(c, R, front) {   // ripples round the head on the water (back half / the front foam lip)
  if (!front) {
    for (let i = 0; i < 3; i++) { const rx = 38 + i * 9, ry = 7 + i * 2.4, P = []; for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; P.push([Math.cos(a) * rx, Math.sin(a) * ry + 1]); }
      brush(c, P, 1.6 - i * 0.3, i ? C.pondL : C.white, R, { bristles: 2, dry: 0.45, taper: 0.4 }); }
    return;
  }
  brush(c, [[-34, 0.6], [-16, 2.6], [4, 2.2], [20, 2.8], [34, 0.4]], 2.6, C.pondL, R, { bristles: 4, dry: 0.35, taper: 0.3 });
  for (let i = 0; i < 7; i++) { const x = -29 + i * 9.6 + (R() - 0.5) * 4; dab(c, x, 0.2 + R() * 2.2, 1.1 + R() * 1.1, i % 3 ? C.white : C.pondL, R, 0.35); }
  brush(c, [[-40, 4], [-24, 6.2], [-8, 5.4]], 1, C.white, R, { bristles: 2, dry: 0.5, taper: 0.5 }); brush(c, [[10, 5.6], [26, 6.2], [40, 3.6]], 1, C.white, R, { bristles: 2, dry: 0.5, taper: 0.5 });
}
function krArm(c, o, R, M, pts, w0, w1) {   // a painted tentacle (whole poses): tapered tube, cream suckers on the inside
  const Pl = krPal(o), P = spline(pts, false, 4), n = P.length, ws = P.map((_, i) => lerp(w0, w1, i / (n - 1)));
  const [, Rr] = strip(c, P, ws, Pl.skin, M, 1, { lw: 1.8 });
  if (o.dead !== 'burnt') for (let i = 2; i < n - 3; i += 2) { const p = P[i], q = Rr[i]; dab(c, lerp(p[0], q[0], 0.55), lerp(p[1], q[1], 0.55), Math.max(0.7, ws[i] * 0.17), Pl.sucker, R); }
}
function krLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = krPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:head0': case 'r:head1': case 'r:ink': krHead(c, o, R, M, L.slice(2)); return;
    case 'r:wake': krWake(c, R, false); return;
    case 'r:foam': krWake(c, R, true); return;
    case 'r:seg':   // one arm segment, x 0..10, 10 wide: outline along both sides, two suckers on the underside (y +)
      partEdges(c, [[0, -5], [10, -5], [10, 5], [0, 5]], [[0, 1], [2, 3]], Pl.skin, M, { lw: 1.7, sp: 0.8, sharp: true });
      if (!burnt) { dab(c, 2.8, 2.6, 1.55, Pl.sucker, R); dab(c, 7.6, 2.4, 1.45, Pl.sucker, R); dab(c, 2.8, 2.6, 0.55, Pl.dark, R); dab(c, 7.6, 2.4, 0.5, Pl.dark, R); dab(c, 5, -2.4, 1, Pl.spot, R); }
      return;
    case 'r:tip': {   // the tapered end with a little curl, 10 wide at x = 0
      const P = [[0, 0], [7, 0.2], [13, 1.2], [17.5, 3.4], [19.4, 6.4], [18, 8.6], [15.6, 8.2]], ws = [10, 8.2, 6, 4.2, 3, 2, 1];
      const [, Rr] = strip(c, spline(P, false, 3), spline(ws.map((w, i) => [w, i]), false, 3).map((q) => q[0]), Pl.skin, M, 1, { lw: 1.6 });
      if (!burnt) for (const [x, y, r] of [[3, 2.6, 1.4], [8, 2.5, 1.15], [12.4, 3.2, 0.9]]) dab(c, x, y, r, Pl.sucker, R);
      void Rr; return;
    }
    case 'r:curl': {   // coiled round a held unit: a loop of arm, seen a bit from above
      const P = []; for (let k = 0; k <= 14; k++) { const a = -0.4 + k / 14 * TAU * 1.1; P.push([Math.cos(a) * 9, Math.sin(a) * 4.4 - k * 0.35]); }
      strip(c, P, P.map((_, i) => lerp(6.5, 4, i / 14)), Pl.skin, M, 1, { lw: 1.4 });
      if (!burnt) for (let k = 2; k < 13; k += 3) dab(c, P[k][0], P[k][1] + 1.6, 0.9, Pl.sucker, R);
      return;
    }
    case 'r:splash':   // where an arm comes out of the water
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; dab(c, Math.cos(a) * 8, Math.sin(a) * 2.6, 1.8 + R(), C.white, R); }
      brush(c, [[-11, 0.6], [-4, 3.2], [4, 3.2], [11, 0.6]], 1.1, C.pondL, R, { bristles: 2, dry: 0.3 });
      return;
    case 'r:slam': {   // an arm slammed down: a splash star + flying drops
      const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = (i & 1 ? 6 : 15) * (0.8 + R() * 0.4); pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.5]); }
      fill(c, poly(pts, R, 0.3), C.pondL, R, { sharp: true, edge: 0 }); brush(c, pts.concat([pts[0]]), 1.1, C.ink, R, { bristles: 2, dry: 0.4, taper: 0 });
      dab(c, 0, 0, 4, C.white, R);
      for (let i = 0; i < 6; i++) { const a = -Math.PI * (0.15 + 0.7 * i / 5); dab(c, Math.cos(a) * 18, Math.sin(a) * 12, 1.4, C.pondL, R); }
      return;
    }
  }
}
// whole poses: wake, two arms behind, head, two arms in front, foam. Dead: sunk low, tilted, X eyes, arms floating limp.
const KR_ARMS = [
  [[[-30, 2], [-44, -12], [-52, -34], [-44, -50], [-36, -46]], 12, 3.5],
  [[[24, 2], [40, -14], [50, -36], [44, -52], [37, -47]], 12, 3.5],
  [[[-22, 3], [-36, 2], [-50, -6], [-58, -18], [-52, -24]], 11, 3.2],
  [[[18, 4], [34, 3], [48, -4], [58, -14], [54, -21]], 11, 3.2],
];
function krWhole(c, o, pose) {
  const R = o.R, M = o.M;
  if (o.dead) {
    krWake(c, R, false);
    for (const [pts, w0, w1] of [[[[-26, -1], [-42, -4], [-58, 0], [-70, -3]], 11, 3], [[[22, -1], [38, 1], [54, -3], [68, 0]], 11, 3], [[[-14, 1], [-24, 4], [-40, 6]], 9, 3], [[[12, 1], [24, 5], [40, 5]], 9, 3]]) krArm(c, o, R, M, pts, w0, w1);
    c.save(); c.translate(0, 0); c.rotate(-0.28); c.scale(1, 0.72); krHead(c, o, R, M, 'head0'); c.restore();
    krWake(c, R, true);
    if (o.dead !== 'burnt') for (const [x, y] of [[-6, -48], [4, -56], [-2, -64]]) dab(c, x, y, 1.6 + R(), C.pondL, R);
    return;
  }
  krWake(c, R, false);
  krArm(c, o, R, M, ...KR_ARMS[0]); krArm(c, o, R, M, ...KR_ARMS[1]);
  krHead(c, o, R, M, pose);
  krArm(c, o, R, M, ...KR_ARMS[2]); krArm(c, o, R, M, ...KR_ARMS[3]);
  krWake(c, R, true);
}
// drawUnit: wake, back arms, head (bobs + squashes on springs), front arms, foam. Arms in world px.
const KR_N = ['head0', 'head1', 'ink', 'wake', 'foam', 'seg', 'tip', 'curl', 'splash', 'slam'];
const KRK = { head: [70, 3.2], hitSq: 0.6, hitPow: 1.6, inkSq: 3, bob: 1.6, bobW: 1.5, blinkT: 3.4, blinkL: 0.16, segN: 10, w0: 14, w1: 4.2 };
const SEGV = [null, null, null], TIPV = [null, null, null];
function krakenDraw(ctx, u, x, y, flip, k, rt, api) {
  const SPm = RIG_ON ? spx() : null; if (!SPm) return false;
  const ent = SPm.entOf(u.type).ent, I = idxOf(ent, KR_N), S = api.S, now = api.now, col = api.col, v = api.v;
  const b = u.b, a = b ? b.act | 0 : 0, ph = (u.id % 97) * 0.37;
  const blink = ((now + ph * 3) % KRK.blinkT) < KRK.blinkL;
  const hs = partSpr(SPm, ent, col, a === 1 ? I.ink : blink ? I.head1 : I.head0, v);
  if (!hs) return false;
  const s = xslot(u, x, y, now), dt = xdt(s, now), slot = u.id & 32767;
  fresh(slot, u, now);
  const In = inputs(slot, u, now, flip);
  if (In.dt > 0 && In.hit) xkick(s, 0, -(KRK.hitSq + KRK.hitPow * In.hitPow) * 3);
  if (XA[s * XAN + 16] !== a) { if (a === 1) xkick(s, 0, KRK.inkSq); XA[s * XAN + 16] = a; }
  const sq = xspring(s, 0, 0.02 * Math.sin(now * 2.1 + ph), KRK.head, dt, 0.5);
  const bob = KRK.bob * Math.sin(now * KRK.bobW + ph);
  const wake = partSpr(SPm, ent, col, I.wake, v), foam = partSpr(SPm, ent, col, I.foam, v);
  let armsOK = !!(b && b.ax && b.ay && b.as);
  for (let q = 0; q < 3 && armsOK; q++) { SEGV[q] = partSpr(SPm, ent, col, I.seg, q); TIPV[q] = partSpr(SPm, ent, col, I.tip, q); if (!SEGV[q] || !TIPV[q]) armsOK = false; }
  const curl = partSpr(SPm, ent, col, I.curl, v), spl = partSpr(SPm, ent, col, I.splash, v), slam = partSpr(SPm, ent, col, I.slam, v);
  const kk = k * ent.scale, r = u.radius || 33;
  WY = 1e9; AL = 1;
  base(x, y, flip, kk, S); rec(wake, 1, 0, 0, 1, 0, 0);
  if (armsOK) krArms(u, b, x, y, r, k, now, s, -1, spl, slam, curl, S);
  base(x, y, flip, kk, S);
  rec(hs, 1 - 0.7 * sq, 0, 0, 1 + sq, 0, bob * 0.6);
  rec(foam, 1 + 0.03 * Math.sin(now * 2.3 + ph), 0, 0, 1, 0, 0.3 * Math.sin(now * 1.7 + ph));
  if (armsOK) krArms(u, b, x, y, r, k, now, s, 1, spl, slam, curl, S);
  flushRec(ctx, u.flash > 0 ? Math.min(1, u.flash) : 0, 1);
  return true;
}
// the arms behind the head (side -1: tip above the body's y) or in front (side +1)
function krArms(u, b, x, y, r, k, now, s, side, spl, slam, curl, S) {
  baseWorld(S);
  const n = Math.min(8, b.ax.length | 0), ph = (u.id % 97) * 0.37;
  for (let i = 0; i < n; i++) {
    const tx = b.ax[i], ty = b.ay[i], st = b.as[i] | 0;
    if (!(tx === tx) || !(ty === ty)) continue;
    if ((ty < y ? -1 : 1) !== side) continue;
    const o = s * XAN;
    if (XA[o + 8 + i] !== st) { XA[o + 8 + i] = st; XA[o + i] = now; }
    const tS = now - XA[o + i];
    let dx = tx - x, dy = ty - y; const dd = Math.sqrt(dx * dx + dy * dy) || 1; dx /= dd; dy /= dd;
    const bx = x + dx * r * 0.62, by = y + dy * r * 0.24;
    let ex = tx - bx, ey = ty - by; const d = Math.sqrt(ex * ex + ey * ey) || 1; ex /= d; ey /= d;
    // tip lift (zt) and arch (h) per state; a travelling wave along the arm
    let zt = 6, h = 0.3 * d + 10, wave = 2.5;
    if (st === 0) { zt = (26 + 9 * Math.sin(now * 1.3 + i * 1.7 + ph)) * k; h = 18 * k; wave = 6; }
    else if (st === 2) { zt = 0; h = d * (0.22 + 0.45 * Math.max(0, 1 - tS / 0.16)) + 6; wave = 1; }
    else if (st === 3) { zt = 9 * k; h = 0.24 * d + 8 + 3 * Math.sin(now * 9 + i); wave = 2; }
    else if (st === 4) { zt = 4; h = 0.16 * d + 8; wave = 3; }
    const x0 = bx, y0 = by, x3 = tx, y3 = (st === 0 ? Math.min(ty, by) : ty) - zt;   // idle tips curl up above the water, never dangle
    const x1 = bx + ex * d * 0.28, y1 = by + ey * d * 0.28 - h - 10 * k;
    const x2 = st === 0 ? tx - ex * 6 + 5 * Math.sin(now * 1.9 + i) : tx - ex * d * 0.18, y2 = y3 - (st === 0 ? 14 * k : h * 0.75);
    const N = KRK.segN;
    bezier(x0, y0, x1, y1, x2, y2, x3, y3, N);
    // wave across the arm, widths
    for (let j = 0; j <= N; j++) {
      const t = j / N, j2 = Math.min(N, j + 1), j1 = Math.max(0, j - 1);
      let nx = -(BZ[j2 * 2 + 1] - BZ[j1 * 2 + 1]), ny = BZ[j2 * 2] - BZ[j1 * 2]; const l = Math.sqrt(nx * nx + ny * ny) || 1; nx /= l; ny /= l;
      const w = wave * k * Math.sin(t * 7 - now * 3.4 + i * 1.3) * 4 * t * (1 - t);
      BZ[j * 2] += nx * w; BZ[j * 2 + 1] += ny * w;
      BW[j] = k * lerp(KRK.w0, KRK.w1, t);
    }
    // which way the suckers face: toward the inside of the arch (screen down at the middle)
    const mx = BZ[N + 2] - BZ[N - 2];
    const sd = mx >= 0 ? 1 : -1;
    const q = (i + ((now * 8) | 0)) % 3;
    chain(SEGV[q], st === 3 ? null : TIPV[q], N, sd, 1.15);
    if (spl) { const sc = k * (1 + 0.08 * Math.sin(now * 3 + i)); rec(spl, sc, 0, 0, sc, bx, by + 1); }
    if (st === 3 && curl) { const sc = k * (1 + 0.06 * Math.sin(now * 10 + i)); rec(curl, sc, 0, 0, sc, tx, ty - zt + 2); }
    if (st === 2 && slam && tS < 0.4) { AL = 1 - tS / 0.4; const sc = k * (0.7 + tS * 1.6); rec(slam, sc, 0, 0, sc, tx, ty); AL = 1; }
  }
}

// ================================================================ GIANT MECH (r 35.2): steel, hazard stripes, rocket pods
const GM_OWN = '#ff8a12';
function gmPal(o) {
  const team = teamOf(o, GM_OWN);
  return { steel: pc(o, '#a3a8b0', '#9aa38a', C.char), steelD: pc(o, '#6f747c', '#6c7560', C.charL), steelL: pc(o, '#cfd3d8', '#c2c9b4', C.charL),
    far: pc(o, '#80858d', '#7b846c', C.charL), dark: pc(o, '#3d4046', '#3d4046', C.char), stripe: pc(o, team || GM_OWN, team || GM_OWN, C.charL),
    glass: pc(o, '#7fd0ff', MILK, C.charL), lens: pc(o, '#9e1f2a', '#6a4a4a', C.char), red: pc(o, C.red, C.red, C.charL) };
}
function hazard(c, x0, y0, x1, y1, Pl, R, burnt) {   // a band in the stripe colour with black diagonal stripes
  const P = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  fill(c, poly(P, R, 0.25), Pl.stripe, R, { sharp: true, sp: 1, edge: 0 });
  if (!burnt) { c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); for (let x = x0 - (y1 - y0); x < x1; x += 6) brush(c, [[x, y1], [x + (y1 - y0), y0]], 2.2, C.ink, R, { bristles: 2, dry: 0.15, taper: 0 }); c.restore(); }
  inkLine(c, [[x0, y0], [x1, y0]], 1.2, R); inkLine(c, [[x0, y1], [x1, y1]], 1.2, R);
}
function gmLeg(c, o, R, M, hx, far) {
  const Pl = gmPal(o), col = far ? Pl.far : Pl.steel, burnt = o.dead === 'burnt';
  strip(c, [[hx, -50], [hx + 3, -39], [hx + 6, -29]], [15, 14, 12], col, M, 0, { lw: 2 });
  strip(c, [[hx + 6, -29], [hx + 3, -18], [hx + 1, -8]], [12, 13, 13], col, M, 0, { lw: 2 });
  if (!burnt) hazard(c, hx - 4.8, -21, hx + 7.6, -16, Pl, R, burnt);
  part(c, ring(hx + 6, -29, 6.4, 6, R, 0.08, 8), far ? Pl.steelD : Pl.steelD, M, { lw: 1.7 });
  bolts(c, [[hx + 6, -29]], 1.6, Pl.dark, R);
  part(c, poly([[hx - 13, -10], [hx + 11, -10], [hx + 17, -3], [hx + 18, 0], [hx - 15, 0], [hx - 15, -5]], R, 0.3), far ? Pl.dark : Pl.steelD, M, { lw: 2, sharp: true });
  if (!burnt) bolts(c, [[hx - 9, -5], [hx + 1, -5], [hx + 11, -4]], 1.1, Pl.dark, R);
}
function gmArm(c, o, R, M, sx, sy, far) {
  const Pl = gmPal(o), col = far ? Pl.far : Pl.steel;
  strip(c, [[sx, sy], [sx + 2, sy + 10], [sx + 3, sy + 20]], [11, 10, 10], col, M, 0, { lw: 1.9 });
  part(c, ring(sx + 3, sy + 21, 5, 5, R, 0.08, 8), Pl.steelD, M, { lw: 1.6 });
  // forearm: a chunky gun-fist with a 3-claw clamp
  part(c, poly([[sx - 3, sy + 21], [sx + 10, sy + 20], [sx + 13, sy + 34], [sx + 1, sy + 37]], R, 0.3), col, M, { lw: 1.9, sharp: true });
  if (o.dead !== 'burnt') hazard(c, sx - 1, sy + 25, sx + 11, sy + 28.5, Pl, R, false);
  for (const [a, b2] of [[[sx + 1, sy + 37], [sx - 1, sy + 43]], [[sx + 6, sy + 37], [sx + 6, sy + 44]], [[sx + 11, sy + 36], [sx + 14, sy + 42]]]) brush(c, [a, b2], 2.4, Pl.dark, R, { bristles: 3, dry: 0, taper: 0.3 });
  part(c, ring(sx, sy, 7.5, 7.5, R, 0.06, 9), col, M, { lw: 1.9 });   // shoulder ball over the top
  bolts(c, [[sx, sy]], 1.8, Pl.dark, R);
}
const GM_BODY = [[-28, -62], [-30, -90], [-22, -104], [18, -104], [28, -94], [30, -66], [22, -54], [-20, -54]];
function gmLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = gmPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': gmLeg(c, o, R, M, 0, false); return;
    case 'r:legF': gmLeg(c, o, R, M, -10, true); return;
    case 'r:armN': gmArm(c, o, R, M, 12, -88, false); return;
    case 'r:armF': gmArm(c, o, R, M, -16, -90, true); return;
    case 'r:body':
      part(c, poly([[-17, -58], [13, -58], [15, -45], [-15, -45]], R, 0.3), Pl.steelD, M, { lw: 2, sharp: true });   // hips
      part(c, poly(GM_BODY, R, 0.5), Pl.steel, M, { lw: 2.4, sp: 1 });
      hazard(c, -27, -68, 28, -60, Pl, R, burnt);
      part(c, poly([[-25, -98], [-12, -98], [-12, -80], [-25, -80]], R, 0.3), Pl.stripe, M, { lw: 1.6, sharp: true });   // the painted side panel
      if (!burnt) { bolts(c, [[-26, -88], [-26, -72], [24, -96], [26, -74], [-14, -100], [6, -100]], 1.2, Pl.dark, R); for (let i = 0; i < 4; i++) brush(c, [[-30, -84 + i * 4], [-25, -84 + i * 4]], 1.1, Pl.dark, R, { bristles: 2, dry: 0 }); }
      part(c, ring(0, -81, 9.5, 9.5, R, 0.05, 10), Pl.dark, M, { lw: 1.8 });   // the chest laser, off
      dab(c, 0, -81, 6.6, Pl.lens, R); if (!burnt) dab(c, -2.2, -83.6, 1.9, '#ffb3b3', R);
      if (o.dead === 'dead') xEye(c, 0, -81, 4.4, R, 1.4);
      if (burnt) scorch(c, [[-10, -84, 5], [10, -64, 4], [20, -92, 3]], R);
      return;
    case 'r:head':
      part(c, ring(6, -110, 13.5, 10.5, R, 0.06, 10), Pl.steel, M, { lw: 2.1 });
      brush(c, [[0, -120], [-3, -126], [-5, -130]], 1.4, Pl.dark, R, { bristles: 2, dry: 0, taper: 0 });
      dab(c, -5, -131, 2.2, Pl.red, R);
      part(c, ring(13, -110, 7.4, 7.4, R, 0.05, 9), Pl.dark, M, { lw: 1.6 });
      if (o.dead) xEye(c, 13, -110, 4, R, 1.4);
      else { dab(c, 13, -110, 5.4, Pl.glass, R); dab(c, 14.5, -109.6, 2.4, C.ink, R); dab(c, 11.4, -112.4, 1.3, C.white, R); }
      if (!o.dead) brush(c, [[4, -119.5], [12, -118.6], [20, -116]], 2, C.ink, R, { bristles: 3, dry: 0.1 });   // angry brow plate
      if (!burnt) bolts(c, [[-4, -108], [0, -102]], 1.1, Pl.dark, R);
      return;
    case 'r:pod': case 'r:podO': {   // the rocket pod on the back shoulder
      const open = L === 'r:podO';
      part(c, poly([[-27, -116], [-5, -116], [-3, -102], [-27, -102]], R, 0.3), Pl.steelD, M, { lw: 1.9, sharp: true });
      if (!burnt) hazard(c, -26, -108, -4, -105, Pl, R, false);
      if (open) {
        for (let i = 0; i < 4; i++) { const x = -23 + i * 5.4; part(c, poly([[x - 2, -116], [x + 2, -116], [x + 1.6, -121], [x, -124], [x - 1.6, -121]], R, 0.15), Pl.red, M, { lw: 1, sharp: true }); }
        part(c, poly([[-28, -116], [-24, -117], [-30, -134], [-34, -132]], R, 0.25), Pl.steel, M, { lw: 1.6, sharp: true });   // lid flipped back
      } else part(c, poly([[-28, -120], [-4, -120], [-4, -115], [-28, -115]], R, 0.25), Pl.steel, M, { lw: 1.6, sharp: true });
      return;
    }
    case 'r:lens':   // the chest laser blazing
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + R() * 0.2; brush(c, [[Math.cos(a) * 10.5, -81 + Math.sin(a) * 10.5], [Math.cos(a) * 17, -81 + Math.sin(a) * 17]], 1.7, i & 1 ? C.fireO : C.fireY, R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
      dab(c, 0, -81, 9, C.fireR, R); dab(c, 0, -81, 6.4, C.fireY, R); dab(c, 0, -81, 3.4, '#fffbe0', R);
      return;
    case 'r:fx':   // dying: sparks + black smoke + a crack across it
      brush(c, [[-18, -92], [-10, -84], [-14, -76], [-4, -66]], 1.4, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.4 });
      spark(c, -12, -86, 6, R); spark(c, 22, -64, 5, R); spark(c, 2, -100, 4, R);
      puffs(c, [[-8, -116, 6], [-16, -124, 5], [-24, -131, 4]], '#55524f', R);
      return;
    case 'r:boom':   // stomp: impact lines + dust round the near foot
      for (let i = 0; i < 8; i++) dab(c, 4 + (R() - 0.5) * 40, -1 + (R() - 0.4) * 6, 2 + R() * 2, i & 1 ? C.paperD : '#d8c7a2', R);
      for (let i = 0; i < 7; i++) { const a = -2.95 + i * 0.45, x0 = 4 + Math.cos(a) * 15, y0 = -2 + Math.sin(a) * 8; brush(c, [[x0, y0], [4 + Math.cos(a) * 27, -2 + Math.sin(a) * 15]], 1.9, C.ink, R, { bristles: 2, dry: 0.25, taper: 0.6 }); }
      return;
    case 'r:beam':   // one beam piece x 0..20, painted hot: red, orange, a yellow-white core, ink edges
      fill(c, [[0, -4.4], [20, -4.6], [20, 4.4], [0, 4.6]], C.fireR, R, { sharp: true, edge: 0, ang: 0 });
      brush(c, [[0, 0], [20, 0.2]], 5, C.fireO, R, { taper: 0, dry: 0.05, bristles: 5 });
      brush(c, [[0, 0], [20, 0]], 2.4, '#fff3b0', R, { taper: 0, dry: 0, bristles: 3 });
      brush(c, [[0, -4.6], [20, -4.4]], 0.9, C.ink, R, { bristles: 2, dry: 0.3, taper: 0 }); brush(c, [[0, 4.6], [20, 4.4]], 0.9, C.ink, R, { bristles: 2, dry: 0.3, taper: 0 });
      return;
    case 'r:hit': spark(c, 0, 0, 10, R); dab(c, 0, 0, 3, '#fffbe0', R); return;
  }
}
// the scrap heap: lying on its back, legs up, lens X, smoke + loose bolts
function gmWreck(c, o) {
  const R = o.R, Pl = gmPal(o), p = resetGP({});
  p.pitch = -1.42; p.lift = 22; p.dx = 16; p.LN = -2.5; p.LF = -2.15; p.SN = 1; p.SF = 1; p.head = 0.5; p.aN = 1.1; p.aF = -0.6; p.comp = 0; p.boom = 0;
  const list = [];
  emitWith(gmechEmit, GMECH.rig.joints, GMECH.rig.parts('idle'), p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
  paintList(c, o, list, gmLayer);
  for (const [x, y] of [[48, -2], [56, 1], [-54, 0]]) bolts(c, [[x, y]], 1.5, Pl.dark, R);
  if (o.dead !== 'burnt') puffs(c, [[-14, -60, 6], [-20, -72, 5], [-26, -82, 4]], '#6a6662', R);
}
const GMECH = {
  layer: gmLayer,
  walkA: 0.34,
  rig: {
    driver: 'gmech',
    joints: { pivot: [-4, -50], hipN: [0, -50], hipF: [-10, -50], legL: 50, shN: [12, -88], shF: [-16, -90], neck: [4, -102] },
    parts(pose) {
      const p = { legN: 'r:legN', legF: 'r:legF', body: 'r:body', head: 'r:head', armN: 'r:armN', armF: 'r:armF', pod: 'r:pod', lens: null, fx: null, boom: null,
        code: code(pose), pitch: 0, ha: 0, arm: 0.04, kp: 0, kh: 0, ka: 0, stomp: 0, dying: 0 };
      if (pose === 'missiles') { p.pod = 'r:podO'; p.arm = -0.12; p.kp = -0.9; p.kh = -1.5; p.ka = -1; }
      else if (pose === 'laser') { p.lens = 'r:lens'; p.pitch = -0.12; p.arm = 0.32; p.kp = -1.2; p.kh = -2; p.ka = 2; }
      else if (pose === 'stomp') { p.boom = 'r:boom'; p.stomp = 1; p.pitch = -0.04; p.kp = -0.4; }
      else if (pose === 'dying') { p.fx = 'r:fx'; p.dying = 1; p.ha = 0.3; p.kp = 0.8; p.kh = 2; }
      return p;
    },
  },
};
function gmPaint(c, o) {
  if (isPart(o.pose)) { gmLayer(c, o, o.pose); return; }
  if (o.dead) { gmWreck(c, o); return; }
  const rp = GMECH.rig.parts(o.pose), p = resetGP({});
  p.pitch = rp.pitch; p.head = rp.ha; p.aN = rp.arm; p.aF = rp.arm; p.boom = 0;
  const A = GMECH.walkA;
  if (o.pose === 'walk0') { p.LN = -A; p.LF = A; p.SF = 0.9; p.lift = -1.5; }
  else if (o.pose === 'walk1') { p.LN = A; p.LF = -A; p.SN = 0.9; p.lift = -1.5; }
  else if (o.pose === 'stomp') { p.LN = -1.05; p.SN = 0.7; p.comp = 0; }
  else if (o.pose === 'dying') { p.pitch = 0.16; p.aN = 0.9; }
  const list = [];
  emitWith(gmechEmit, GMECH.rig.joints, rp, p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
  paintList(c, o, list, gmLayer);
}
// drawUnit (before the floppy body, returns false): the chest laser beam from the lens along b.beamA for b.beamL px.
const GM_N = ['beam', 'hit'];
const GM_LENS = [0, -81];
function gmechDraw(ctx, u, x, y, flip, k, rt, api) {
  const b = u.b;
  if (!b || (b.act | 0) !== 2 || !(b.beamL > 0) || !(b.beamA === b.beamA)) return false;
  const SPm = spx(); if (!SPm) return false;
  const ent = SPm.entOf(u.type).ent, I = idxOf(ent, GM_N), S = api.S;
  const q = ((rt * 10) | 0) % 3, beam = partSpr(SPm, ent, api.col, I.beam, q), hit = partSpr(SPm, ent, api.col, I.hit, ((rt * 12) | 0) % 3);
  if (!beam) return false;
  const kk = k * ent.scale, ox = x + flip * GM_LENS[0] * kk, oy = y + GM_LENS[1] * kk;
  const ca = Math.cos(b.beamA), sa = Math.sin(b.beamA), L = b.beamL;
  const ex = x + ca * L, ey = y + sa * L - 12;   // lands at a body's middle height, out on the ground line
  let dx = ex - ox, dy = ey - oy; const len = Math.sqrt(dx * dx + dy * dy) || 1; dx /= len; dy /= len;
  const n = Math.max(1, Math.ceil(len / 20)), seg = len / n, w = kk * (1 + 0.12 * Math.sin(rt * 37));
  baseWorld(S); WY = 1e9; AL = 1;
  for (let i = 0; i < n; i++) { const L2 = seg * 1.06 / 20; rec(beam, dx * L2, dy * L2, -dy * w, dx * w, ox + dx * seg * i, oy + dy * seg * i); }
  if (hit) { const sc = kk * (0.9 + 0.2 * Math.sin(rt * 29)); rec(hit, sc, 0, 0, sc, ex, ey); }
  flushRec(ctx, 0, 1);
  return false;
}

// ================================================================ HYDRA (r 28.6): green, cream belly, orange spines, fan of heads
const HY_OWN = '#2e9a72';
function hyPal(o) {
  return { skin: pc(o, HY_OWN), far: pc(o, tone(HY_OWN, -0.28), tone(C.zskin, -0.28)), dark: pc(o, '#1d6a4e', C.zskinD, C.charL),
    belly: pc(o, '#f2e2a0', tone(C.zskin, 0.35), C.charL), spine: pc(o, '#ff7a2e', '#c9b07a', C.charL), mouth: pc(o, '#9e1f2a', '#7a5a4a', C.charL),
    teeth: pc(o, C.white, '#e8ecd2', C.charL), horn: pc(o, '#fff1c8', '#e8ecd2', C.charL), flesh: pc(o, '#e0303c', '#a8746a', C.charL), nail: pc(o, '#f6ead0', '#e8ecd2', C.charL) };
}
const HY_BODY = [[-30, -30], [-24, -44], [-8, -50], [10, -49], [22, -42], [27, -30], [22, -18], [6, -14], [-14, -14], [-26, -20]];
function hyLeg(c, o, R, M, x, far) {
  const Pl = hyPal(o), col = far ? Pl.far : Pl.skin;
  strip(c, [[x, -24], [x + 1, -12], [x + 0.4, -2]], [11, 9, 8.6], col, M, 0, { lw: 1.8 });
  part(c, ring(x + 1.6, -2.4, 6, 3, R, 0.1, 8), col, M, { lw: 1.6 });
  for (let i = 0; i < 3; i++) dab(c, x + 3 + i * 2.2, -0.8, 1, Pl.nail, R);
}
function hyHead(c, o, R, M, mode) {   // origin = the neck end, the head points +x; mode 0 shut, 1 bite (open), 2 breath (wide)
  const Pl = hyPal(o), burnt = o.dead === 'burnt';
  const up = mode === 1 ? -0.34 : mode === 2 ? -0.5 : 0, dn = mode === 1 ? 0.42 : mode === 2 ? 0.62 : 0;
  if (mode) fill(c, poly([[2, 0], [20, -3], [21, 4], [4, 4]], R, 0.2), Pl.mouth, R, { edge: 0 });
  about(c, 3, 2, dn, () => {   // lower jaw
    part(c, poly([[0, 1], [10, 2], [22, 2.2], [21, 5.8], [10, 7], [1, 6]], R, 0.25), Pl.belly, M, { lw: 1.6 });
    teeth(c, 8, 20.6, 2.2, 4, 1.8, -1, Pl.teeth, R, 1);
  });
  about(c, 3, 2, up, () => {   // the skull
    part(c, poly([[-3, -2], [0, -9], [8, -11.5], [16, -9], [24, -4], [25, 1.6], [12, 2.6], [2, 3.4], [-3, 2]], R, 0.3), Pl.skin, M, { lw: 1.9 });
    teeth(c, 9, 23.6, 2.4, 5, 2, 1, Pl.teeth, R, 1);
    for (const [hx, hy, ex, ey] of [[2, -8, -6, -15], [7, -10, 2, -18]]) part(c, poly([[hx - 1.6, hy], [hx + 1.8, hy], [ex, ey]], R, 0.15), Pl.horn, M, { lw: 1.2, sharp: true });
    eye(c, o, 10, -5, 3, R, { brow: 0.8 });
    dab(c, 22, -2.6, 0.7, C.ink, R);
    if (!burnt) for (const [sx, sy] of [[4, -6], [16, -7]]) dab(c, sx, sy, 0.9, Pl.dark, R);
    if (mode === 2 && !burnt) { fill(c, poly([[18, -1], [30, -4], [27, 0.5], [32, 3], [19, 3]], R, 0.3), C.fireO, R, { sharp: true, edge: 0 }); dab(c, 21, 1, 2.2, C.fireY, R); }
  });
}
function hyLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = hyPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legNF': hyLeg(c, o, R, M, 14, false); return;
    case 'r:legFF': hyLeg(c, o, R, M, 9, true); return;
    case 'r:legNH': hyLeg(c, o, R, M, -16, false); return;
    case 'r:legFH': hyLeg(c, o, R, M, -21, true); return;
    case 'r:tail': strip(c, [[-24, -32], [-36, -29], [-48, -23]], [16, 12, 8.6], Pl.skin, M, 0, { lw: 1.9 }); if (!burnt) for (const x of [-32, -42]) part(c, poly([[x - 3, -34 + (x + 32) * -0.4], [x + 3, -34 + (x + 32) * -0.45], [x, -40 + (x + 32) * -0.4]], R, 0.2), Pl.spine, M, { lw: 1.1, sharp: true }); return;
    case 'r:tip':
      strip(c, [[-47, -23.4], [-56, -19], [-63, -14]], [9, 6, 3.6], Pl.skin, M, 0, { lw: 1.8 });
      part(c, poly([[-62, -17], [-70, -21], [-74, -12], [-66, -8], [-62, -11]], R, 0.3), Pl.spine, M, { lw: 1.4, sharp: true });
      return;
    case 'r:body': {
      part(c, poly(HY_BODY, R, 0.4), Pl.skin, M, { lw: 2.2 });
      brush(c, [[-24, -19], [-8, -16], [10, -16.4], [22, -21]], 5.6, Pl.belly, R, { taper: 0.4, dry: 0.35, bristles: 6 });
      for (let i = 0; i < 6; i++) brush(c, [[-18 + i * 6.6, -19.6], [-17.4 + i * 6.6, -15.6]], 0.6, tone(Pl.belly, -0.3), R, { bristles: 1, dry: 0.2 });
      if (!burnt) {
        for (let i = 0; i < 6; i++) { const x = -22 + i * 7, y = -45 - Math.sin((i + 0.5) / 6 * Math.PI) * 4; part(c, poly([[x - 3.4, y + 2.4], [x + 3.4, y + 2], [x + 0.4, y - 6]], R, 0.2), Pl.spine, M, { lw: 1.2, sharp: true }); }
        for (const [x, y, r] of [[-18, -36, 2], [-8, -40, 1.6], [2, -34, 2.2], [12, -40, 1.5], [-22, -27, 1.4], [8, -27, 1.6]]) dab(c, x, y, r, Pl.dark, R);
      }
      const team = teamOf(o, HY_OWN);
      if (team) { const k = burnt ? C.charL : team; brush(c, [[-8, -49], [-10, -32], [-8, -15]], 9, k, R, { taper: 0.05, dry: 0.12, bristles: 8 }); for (const y of [-42, -32, -22]) dab(c, -9.4, y, 1.2, C.white, R); }
      if (burnt) scorch(c, [[-10, -34, 4], [8, -30, 3], [-20, -28, 2.4]], R);
      return;
    }
    case 'r:nseg':   // one neck piece x 0..10, 10 wide: belly stripe on the underside (y +), scale dots on top
      partEdges(c, [[0, -5], [10, -5], [10, 5], [0, 5]], [[0, 1], [2, 3]], Pl.skin, M, { lw: 1.6, sp: 0.8, sharp: true });
      brush(c, [[0, 2.8], [10, 2.8]], 2.6, Pl.belly, R, { taper: 0, dry: 0.2, bristles: 3 });
      if (!burnt) dab(c, 5, -2.2, 1.1, Pl.dark, R);
      return;
    case 'r:head': hyHead(c, o, R, M, 0); return;
    case 'r:headO': hyHead(c, o, R, M, 1); return;
    case 'r:headF': hyHead(c, o, R, M, 2); return;
    case 'r:stump':   // a cut neck end: red flesh face, a white bone, drips
      part(c, ring(0, 0, 2.6, 5.4, R, 0.12, 8), Pl.flesh, M, { lw: 1.4 });
      dab(c, 0.3, 0.2, 1.5, Pl.teeth, R);
      if (!burnt) for (const [x, y] of [[1, 6.4], [-1.2, 7.6]]) dab(c, x, y, 0.9, Pl.flesh, R);
      return;
    case 'r:smoke': puffs(c, [[0, -4, 4], [-3, -11, 5], [-1, -19, 6]], '#5d5a58', R); return;
  }
}
// The body + heads layout, shared by the painter (whole poses) and drawUnit. HL = one fixed-shape layout object.
const HY_J = { pivot: [-2, -24], legs: [[14, -24], [9, -24], [-16, -24], [-21, -24]], legL: 24, tail: [-24, -32], tip: [-47.4, -23.4] };
const HL = {
  pitch: 0, lift: 0, L: new Float64Array(4), S: new Float64Array([1, 1, 1, 1]), t0: 0, t1: 0, comp: 1, gb: 0,
  n: 3, st: new Int8Array(7), e: new Float64Array(7), ox: new Float64Array(7), oy: new Float64Array(7), ha: new Float64Array(7),
  drop: new Float64Array(7), dx: new Float64Array(7), dy: new Float64Array(7), dr: new Float64Array(7), sm: new Uint8Array(7), smoke: 0, rt: 0, k: 1,
  f0: -2.05, f1: -0.5, rise: 0.42, slot: new Int8Array(7),   // the fan of necks (screen angles, back to front), how high they rise; fan position -> head slot
};
// part codes for the sink
const H = { legNF: 0, legFF: 1, legNH: 2, legFH: 3, tail: 4, tip: 5, body: 6, nseg: 7, head: 8, headO: 9, headF: 10, stump: 11, smoke: 12 };
const H_NAMES = ['legNF', 'legFF', 'legNH', 'legFH', 'tail', 'tip', 'body', 'nseg', 'head', 'headO', 'headF', 'stump', 'smoke'];
let HSINK = null;   // (code, a, b, c, d, e, f, alpha, variant) in entry units
const HT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function hrot(px, py, ang, tx, ty) { const cs = Math.cos(ang), sn = Math.sin(ang); HT.a = cs; HT.b = sn; HT.c = -sn; HT.d = cs; HT.e = px - cs * px + sn * py + tx; HT.f = py - sn * px - cs * py + ty; }
function hput(code, al, v) { HSINK(code, HT.a, HT.b, HT.c, HT.d, HT.e, HT.f, al, v); }
const NP = new Float64Array(40);   // neck sample points in entry units
const HEAD_K = 1.18;   // heads drawn a bit bigger than painted: they're the show
// body frame (module scalars, no closures): turn about the pivot by pitch, then lift (+ = down)
let HCP = 1, HSP = 0, HLIFT = 0;
const hbx = (x, y) => HY_J.pivot[0] + HCP * (x - HY_J.pivot[0]) - HSP * (y - HY_J.pivot[1]);
const hby = (x, y) => HY_J.pivot[1] + HSP * (x - HY_J.pivot[0]) + HCP * (y - HY_J.pivot[1]) + HLIFT;
function hleg(p, code, i) {
  const J = HY_J, hx = J.legs[i][0], hy = J.legs[i][1], Hx = hbx(hx, hy), Hy = hby(hx, hy);
  let s = p.S[i]; if (p.comp) s *= cl((J.legL - (Hy - hy - p.gb)) / J.legL, 0.6, 1.3);
  const cs = Math.cos(p.L[i]), sn = Math.sin(p.L[i]);
  HT.a = cs; HT.b = sn; HT.c = -sn * s; HT.d = cs * s; HT.e = Hx - (HT.a * hx + HT.c * hy); HT.f = Hy - (HT.b * hx + HT.d * hy); hput(code, 1, 0);
}
function hscale(s) { HT.a *= s; HT.b *= s; HT.c *= s; HT.d *= s; }
function hydraEmit(p) {
  const J = HY_J;
  HCP = Math.cos(p.pitch); HSP = Math.sin(p.pitch); HLIFT = p.lift;
  // dropped heads first (on the ground, behind everything)
  for (let j = 0; j < p.n; j++) if (p.drop[j] > 0) { hrot(0, 0, p.dr[j], p.dx[j], p.dy[j]); hscale(p.k * HEAD_K); hput(H.head, Math.min(1, p.drop[j]), 0); }   // by slot
  hleg(p, H.legFH, 3); hleg(p, H.legFF, 1);
  // tail: two pieces, the tip lagging the root
  const tx0 = J.tail[0], ty0 = J.tail[1];
  hrot(tx0, ty0, p.pitch + p.t0, hbx(tx0, ty0) - tx0, hby(tx0, ty0) - ty0);
  const T0a = HT.a, T0b = HT.b, T0c = HT.c, T0d = HT.d, T0e = HT.e, T0f = HT.f;
  const tpx = T0a * J.tip[0] + T0c * J.tip[1] + T0e, tpy = T0b * J.tip[0] + T0d * J.tip[1] + T0f;
  hrot(J.tip[0], J.tip[1], p.pitch + p.t0 + p.t1, tpx - J.tip[0], tpy - J.tip[1]); hput(H.tip, 1, 0);
  HT.a = T0a; HT.b = T0b; HT.c = T0c; HT.d = T0d; HT.e = T0e; HT.f = T0f; hput(H.tail, 1, 0);
  hrot(J.pivot[0], J.pivot[1], p.pitch, 0, p.lift); hput(H.body, 1, 0);
  hleg(p, H.legNH, 2); hleg(p, H.legNF, 0);
  // necks + heads, back (j = 0, pointing up-back) to front
  const n = Math.max(1, p.n);
  for (let j = 0; j < n; j++) {   // j = fan position (back to front), q = the head slot there
    const q = p.slot[j], t = n === 1 ? 0.6 : j / (n - 1), st = p.st[q], more = Math.max(0, n - 3);
    const b0x = lerp(3 - more * 2, 17 + more, t), b0y = lerp(-45, -40, t), Bx = hbx(b0x, b0y), By = hby(b0x, b0y);
    const al = lerp(p.f0 - more * 0.09, p.f1 + more * 0.07, t) + p.pitch, Ln = (40 + 8 * Math.sin(t * Math.PI) + (more && (j & 1) ? 12 : 0)) * p.k;
    let g = 1, len = Ln, ang = al, ha = lerp(-0.45, 0.12, t) + p.ha[q];
    if (st === 2) { len = Ln * 0.34; ang = lerp(al, 0.25, 0.45); }
    else if (st === 3) { g = p.e[q]; len = Ln * g; }
    let Hx = Bx + Math.cos(ang) * len + p.ox[q] * g, Hy = By + Math.sin(ang) * len + p.oy[q] * g;
    if (st === 1) { const e = p.e[q]; Hx += 24 * e * p.k; Hy += 14 * e * p.k; ha += 0.55 * e; }
    else if (st === 4) { const e = p.e[q]; Hx += 10 * e * p.k; Hy += 4 * e * p.k; ha += 0.18 * e; }
    // neck: up out of the shoulders (lift), into the back of the head
    const hc = Math.cos(ha), hs = Math.sin(ha), r2 = len * 0.36, N = 5;
    const x1 = Bx + Math.cos(ang) * len * 0.15, y1 = By - len * p.rise, x2 = Hx - hc * r2, y2 = Hy - hs * r2;
    for (let i = 0; i <= N; i++) { const tt = i / N, u = 1 - tt, a = u * u * u, b = 3 * u * u * tt, c = 3 * u * tt * tt, d = tt * tt * tt; NP[i * 2] = a * Bx + b * x1 + c * x2 + d * Hx; NP[i * 2 + 1] = a * By + b * y1 + c * y2 + d * Hy; }
    const w0 = 14 * p.k, w1 = (st === 3 ? lerp(4, 10, g) : 10) * p.k;
    let ea = 0;
    for (let i = 0; i < N; i++) {
      const px = NP[i * 2], py = NP[i * 2 + 1]; let dx = NP[i * 2 + 2] - px, dy = NP[i * 2 + 3] - py; const l = Math.sqrt(dx * dx + dy * dy) || 0.001;
      dx /= l; dy /= l; ea = Math.atan2(dy, dx);
      const L = l * 1.24 / 10, w = lerp(w0, w1, (i + 0.5) / N) / 10, sd = dx >= 0 ? 1 : -1;
      HT.a = dx * L; HT.b = dy * L; HT.c = -dy * w * sd; HT.d = dx * w * sd; HT.e = px - dx * l * 0.12; HT.f = py - dy * l * 0.12; hput(H.nseg, 1, (j + i) % 3);
    }
    if (st === 2) {   // stump end (+ smoke while burning)
      hrot(0, 0, ea, Hx, Hy); hscale(p.k); hput(H.stump, 1, 0);
      if (p.smoke || p.sm[q]) { hrot(0, 0, 0, Hx, Hy - 3); hput(H.smoke, 0.9, (((p.rt * 5) | 0) + j) % 3); }
      continue;
    }
    hrot(0, 0, ha, Hx, Hy); hscale((st === 3 ? g : 1) * p.k * HEAD_K);
    hput(st === 1 && p.e[q] > 0.15 ? H.headO : st === 4 ? H.headF : H.head, 1, q % 3);
  }
}
function hyResetL(L) {
  L.pitch = 0; L.lift = 0; L.t0 = 0; L.t1 = 0; L.comp = 1; L.gb = 0; L.n = 3; L.smoke = 0; L.rt = 0; L.k = 1; L.f0 = -2.05; L.f1 = -0.5; L.rise = 0.42;
  for (let i = 0; i < 4; i++) { L.L[i] = 0; L.S[i] = 1; }
  for (let j = 0; j < 7; j++) { L.st[j] = 0; L.e[j] = 0; L.ox[j] = 0; L.oy[j] = 0; L.ha[j] = 0; L.drop[j] = 0; L.dx[j] = 0; L.dy[j] = 0; L.dr[j] = 0; }
  if (!L.slot) L.slot = new Int8Array(7);
  for (let j = 0; j < 7; j++) { L.slot[j] = j; L.sm[j] = 0; }
  return L;
}
function hyPaint(c, o) {
  if (isPart(o.pose)) { hyLayer(c, o, o.pose); return; }
  const L = hyResetL({ sm: new Uint8Array(7), L: new Float64Array(4), S: new Float64Array(4), st: new Int8Array(7), e: new Float64Array(7), ox: new Float64Array(7), oy: new Float64Array(7), ha: new Float64Array(7), drop: new Float64Array(7), dx: new Float64Array(7), dy: new Float64Array(7), dr: new Float64Array(7) });
  if (o.dead) {   // collapsed: belly on the ground, legs splayed, necks flopped forward along the ground, X eyes
    L.comp = 0; L.L[0] = -1.15; L.L[1] = -0.8; L.L[2] = 1.05; L.L[3] = 1.3; L.S[0] = L.S[1] = L.S[2] = L.S[3] = 0.85; L.t0 = 0.3; L.t1 = 0.25; L.lift = 10; L.pitch = 0.05;
    L.f0 = 0.42; L.f1 = 0.42; L.rise = 0.08; for (let j = 0; j < 3; j++) { L.ox[j] = -40 + j * 30; L.oy[j] = 7 - j * 2; L.ha[j] = 0.5 - j * 0.1; }
  }
  const A = 0.38;
  if (o.pose === 'walk0') { L.L[0] = -A; L.L[3] = -A; L.L[1] = A; L.L[2] = A; L.lift = -1; }
  else if (o.pose === 'walk1') { L.L[0] = A; L.L[3] = A; L.L[1] = -A; L.L[2] = -A; L.lift = -1; }
  else if (o.pose === 'bite') { L.st[1] = 1; L.e[1] = 1; }
  else if (o.pose === 'breath') { L.st[1] = 4; L.e[1] = 1; }
  else if (o.pose === 'stumps') { L.n = 5; L.st[1] = 2; L.st[3] = 3; L.e[3] = 0.6; }
  const list = [];
  HSINK = (cd, a, b, cc, d, e, f) => list.push(['r:' + H_NAMES[cd], a, b, cc, d, e, f]);
  hydraEmit(L);
  HSINK = null;
  paintList(c, o, list, hyLayer);
}
// drawUnit: springs, stride, per-head states from b.hs / b.hT, wading cut.
const HYK = { pitch: [60, 3.6], bob: [100, 4.4], tail: [40, 2.4], head: [55, 2.6], step: 18, hit: 0.5, hitPow: 1.6, headHit: 60, walkA: 0.36, sway: 3.2, bite: 0.25, growT: 1, dropT: 1.7, breathIn: 0.15 };
const HSPR = new Array(14).fill(null);
function hySink(cd, a, b, c, d, e, f, al, v) {
  const s = HSPR[cd]; if (!s) return;
  AL = al; rec(s, a, b, c, d, e, f); AL = 1;
}
function hydraDraw(ctx, u, x, y, flip, k, rt, api) {
  const SPm = RIG_ON ? spx() : null; if (!SPm) return false;
  const ent = SPm.entOf(u.type).ent, I = idxOf(ent, H_NAMES), S = api.S, now = api.now, col = api.col, v = api.v;
  for (let i = 0; i < H_NAMES.length; i++) {
    const nm = H_NAMES[i], q = nm === 'nseg' || nm === 'head' || nm === 'smoke' ? ((rt * 8) | 0) % 3 : v;
    HSPR[i] = partSpr(SPm, ent, col, I[nm], q);
    if (!HSPR[i] && (i <= H.nseg || i === H.head)) return false;   // the body + neck + head must be there; the rest can wait
  }
  const s = xslot(u, x, y, now), dt = xdt(s, now), slot = u.id & 32767, ph = (u.id % 97) * 0.37, b = u.b;
  fresh(slot, u, now);
  const In = inputs(slot, u, now, flip);
  const walked = xwalk(s, x, y), cyc = walked / 23, th = cyc * Math.PI, moving = (u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0) > 49;
  const o = s * XAN;
  let amp = XA[o + 14]; if (amp < 0) amp = moving ? 1 : 0;
  amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 5); XA[o + 14] = amp;
  const step = Math.floor(cyc);
  if (In.dt > 0) {
    if (In.hit) { const h = In.hit * (HYK.hit + HYK.hitPow * In.hitPow); xkick(s, 0, h); xkick(s, 1, 14 * (0.5 + In.hitPow)); xkick(s, 2, -h * 2); for (let j = 0; j < 7; j++) { xkick(s, 4 + j * 2, In.hit * HYK.headHit * (0.6 + 0.1 * j)); xkick(s, 5 + j * 2, -HYK.headHit * 0.4 * In.hitPow); } }
    if (moving && step !== XA[o + 13]) { xkick(s, 1, HYK.step); for (let j = 0; j < 7; j++) xkick(s, 5 + j * 2, 10); }
    xkick(s, 2, In.ax * dt * 0.002);
  }
  XA[o + 13] = step;
  const L = HL;
  L.k = 1; L.rt = rt; L.comp = 1; L.smoke = u.burning > 0 ? 1 : 0;   // k: the base transform already sizes it
  const sT = Math.sin(th), A = HYK.walkA;
  L.L[0] = -amp * A * sT; L.L[3] = -amp * A * sT; L.L[1] = amp * A * sT; L.L[2] = amp * A * sT;
  for (let i = 0; i < 4; i++) L.S[i] = 1 - amp * 0.18 * Math.max(0, (i === 0 || i === 3 ? 1 : -1) * Math.cos(th));
  L.gb = -amp * 1.4 * Math.abs(sT);
  L.pitch = xspring(s, 0, amp * 0.03 * Math.cos(th), HYK.pitch, dt, 0.5);
  L.lift = xspring(s, 1, 0, HYK.bob, dt, 10) + L.gb + (moving ? 0 : 0.3 * Math.sin(rt * 1.7 + ph));
  L.t0 = xspring(s, 2, (moving ? 0.1 * Math.sin(th) : 0.06 * Math.sin(rt * 1.2 + ph)), HYK.tail, dt, 1);
  L.t1 = xspring(s, 3, (moving ? 0.12 * Math.sin(th - 0.9) : 0.07 * Math.sin(rt * 1.2 + ph - 0.8)) - 0.3 * L.t0, HYK.tail, dt, 1);
  // heads
  const hs = b && b.hs, hT = b && b.hT, hb = b && b.hb, n = Math.max(1, Math.min(7, b && b.heads > 0 ? b.heads | 0 : 3));
  L.n = n;
  const mid = (n - 1) >> 1;
  for (let i = 0; i < n; i++) { const kk2 = (i + 1) >> 1, pos = mid + (i === 0 ? 0 : i & 1 ? kk2 : -kk2); L.slot[pos < 0 ? 0 : pos >= n ? n - 1 : pos] = i; }
  for (let j = 0; j < n; j++) {   // j = fan position, i = the head slot there (slot 0 = the middle head)
    const i = L.slot[j], st = hs ? hs[i] | 0 : 0, t0 = hT ? hT[i] : -9, tS = now - t0;
    L.st[i] = st; L.drop[i] = 0; L.sm[i] = hb && hb[i] ? 1 : 0;
    const sw = HYK.sway;
    L.ox[i] = xspring(s, 4 + i * 2, sw * Math.sin(rt * (1.1 + 0.17 * i) + i * 2.1 + ph), HYK.head, dt, 30);
    L.oy[i] = xspring(s, 5 + i * 2, sw * 0.8 * Math.sin(rt * (1.4 + 0.11 * i) + i * 1.3 + ph), HYK.head, dt, 30);
    L.ha[i] = 0.12 * Math.sin(rt * (1.3 + 0.2 * i) + i);
    if (st === 1) { const e = tS < 0.1 ? tS / 0.1 : tS < HYK.bite ? 1 : Math.max(0, 1 - (tS - HYK.bite) / 0.25); L.e[i] = e; }
    else if (st === 4) { const e = tS < HYK.breathIn ? -0.6 * tS / HYK.breathIn : Math.min(1, (tS - HYK.breathIn) / 0.15); L.e[i] = e; }
    else if (st === 3) { const t = Math.min(1, tS / HYK.growT); L.e[i] = Math.max(0.12, 1 - Math.exp(-6 * t) * Math.cos(9 * t)); }
    else if (st === 2) {   // the cut head drops off the neck end, bounces, lies there and fades
      L.e[i] = 0;
      if (tS >= 0 && tS < HYK.dropT) {
        const t = n === 1 ? 0.6 : j / (n - 1), al = lerp(-2.05, -0.5, t), Ln = 40 + 8 * Math.sin(t * Math.PI);
        const sx = lerp(3, 17, t) + Math.cos(al) * Ln, sy = lerp(-45, -40, t) + Math.sin(al) * Ln;
        const g = 420, tl = Math.sqrt(2 * Math.max(1, -sy - 3) / g);
        let yy, rr;
        if (tS < tl) { yy = sy + 0.5 * g * tS * tS; rr = tS * 7; }
        else { const tb = tS - tl, hop = Math.max(0, 40 * tb - 0.5 * g * tb * tb); yy = -3 - hop; rr = tl * 7 + Math.min(tb, 0.19) * 6; }
        L.dx[i] = sx + 14 * Math.min(tS, 0.9); L.dy[i] = yy; L.dr[i] = rr; L.drop[i] = tS > HYK.dropT - 0.4 ? (HYK.dropT - tS) / 0.4 : 1;
      }
    } else L.e[i] = 0;
  }
  // wading: cut at the waterline (OG-like line: up to 26 px under in deep water)
  const dep = world0(u);
  const sink = dep >= 0.05 ? (dep <= 0.45 ? 4 * dep / 0.45 : 4 + 22 * Math.min(1, (dep - 0.45) / 0.55)) : 0;
  base(x, y + (sink > 0.3 ? sink : 0), flip, k * ent.scale, S);   // sunk by the waterline, the part under it cut off
  WY = sink > 0.3 ? (y + 0.6) * S : 1e9;
  HSINK = hySink; hydraEmit(L); HSINK = null;
  WY = 1e9;
  flushRec(ctx, u.flash > 0 ? Math.min(1, u.flash) : 0, 1);
  if (sink > 0.3) { const F = fxm(); if (F && F.rippleAt) F.rippleAt(x, y, Math.max(0.35, k * 1.6), rt, ph); }
  return true;
}
function world0(u) { return u.wet || 0; }

// ================================================================ LAVA GOLEM (r 26.4): basalt rocks, glowing lava cracks
const LG_OWN = '#7a655c';
function lgPal(o) {
  const dead = !!o.dead;
  return { rock: pc(o, LG_OWN, '#6f7a5e'), far: pc(o, '#5c4b44', '#56604a'), light: pc(o, '#a08b7e', '#8d9878', C.charL), dark: pc(o, '#43363a', '#3d4436', C.char),
    lava: pc(o, dead ? '#9a3416' : C.fireO, C.fireO, C.charL), hot: pc(o, dead ? '#b8541c' : C.fireY, C.fireY, C.charL), core: pc(o, dead ? '#c2622a' : '#fff3b0', '#fff3b0', C.charL) };
}
/** a glowing lava crack: sharp zigzag corners (each inner point doubled so the spline keeps the corner) */
function crack(c, P, Pl, R, w = 1.6) {
  const Q = []; for (let i = 0; i < P.length; i++) { Q.push(P[i]); if (i > 0 && i < P.length - 1) Q.push(P[i]); }
  brush(c, Q, w * 2, Pl.lava, R, { bristles: 3, dry: 0.1, taper: 0.4, per: 3 }); brush(c, Q, w * 0.8, Pl.hot, R, { bristles: 2, dry: 0.05, taper: 0.5, per: 3 });
}
function lgLeg(c, o, R, M, hx, far) {
  const Pl = lgPal(o);
  part(c, poly([[hx - 8, -27], [hx + 7, -27], [hx + 8, -9], [hx + 12, -4], [hx + 12, 0], [hx - 10, 0], [hx - 10, -7]], R, 0.5), far ? Pl.far : Pl.rock, M, { lw: 2, sharp: true });
  crack(c, [[hx - 2, -24], [hx + 1, -16], [hx - 2, -9], [hx + 2, -3]], Pl, R, 1.3);
  if (!far) dab(c, hx - 5, -18, 1.6, Pl.light, R);
}
function lgArm(c, o, R, M, sx, sy, far) {
  const Pl = lgPal(o), col = far ? Pl.far : Pl.rock;
  part(c, poly([[sx - 7, sy - 2], [sx + 7, sy - 4], [sx + 10, sy + 16], [sx + 2, sy + 22], [sx - 6, sy + 16]], R, 0.5), col, M, { lw: 2, sharp: true });
  part(c, poly([[sx - 3, sy + 18], [sx + 9, sy + 17], [sx + 12, sy + 36], [sx, sy + 38]], R, 0.5), col, M, { lw: 2, sharp: true });
  part(c, ring(sx + 7, sy + 44, 10.5, 9.5, R, 0.16, 9), col, M, { lw: 2.1 });   // the big fist
  if (o.dead !== 'burnt') for (let i = 0; i < 3; i++) brush(c, [[sx + 9 + i * 0.6, sy + 38 + i * 4.4], [sx + 16, sy + 39 + i * 4.6]], 1.1, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.3 });
  crack(c, [[sx - 2, sy + 2], [sx + 3, sy + 10], [sx + 1, sy + 16], [sx + 6, sy + 26], [sx + 4, sy + 34]], Pl, R, 1.4);
  part(c, ring(sx, sy, 9.5, 8.5, R, 0.16, 9), col, M, { lw: 2 });   // shoulder boulder over the top
  crack(c, [[sx - 5, sy - 2], [sx, sy + 1], [sx + 4, sy - 3]], Pl, R, 1.2);
  if (!far) dab(c, sx - 3, sy - 3, 1.8, Pl.light, R);
}
const LG_BODY = [[-24, -50], [-18, -68], [-2, -76], [14, -74], [24, -64], [26, -46], [20, -30], [6, -22], [-12, -22], [-22, -32]];
function lgLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = lgPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': lgLeg(c, o, R, M, 6, false); return;
    case 'r:legF': lgLeg(c, o, R, M, -8, true); return;
    case 'r:armN': lgArm(c, o, R, M, 14, -60, false); return;
    case 'r:armF': lgArm(c, o, R, M, -12, -62, true); return;
    case 'r:body': {
      part(c, poly(LG_BODY, R, 0.6), Pl.rock, M, { lw: 2.4, sp: 1 });
      for (const [x, y, r] of [[-12, -62, 3.4], [6, -68, 2.8], [-17, -40, 2.6], [17, -40, 2.2], [-2, -30, 2]]) dab(c, x, y, r, Pl.light, R);
      if (!burnt) for (const P of [[[-23, -46], [-14, -50], [-9, -62], [-12, -70]], [[18, -71], [12, -62], [22, -55]], [[-20, -30], [-8, -32], [-2, -24]]]) brush(c, P, 1.1, Pl.dark, R, { bristles: 2, dry: 0.3, taper: 0.3 });
      dab(c, 8, -46, 7, Pl.lava, R); dab(c, 8, -46, 4.6, Pl.hot, R); dab(c, 8, -46, 2.2, Pl.core, R);   // the core
      crack(c, [[8, -46], [0, -52], [-6, -48], [-14, -56], [-20, -52]], Pl, R, 1.7);
      crack(c, [[8, -46], [14, -56], [12, -66], [18, -70]], Pl, R, 1.5);
      crack(c, [[8, -46], [4, -36], [10, -28], [6, -23]], Pl, R, 1.5);
      crack(c, [[-18, -40], [-10, -34], [-14, -26]], Pl, R, 1.2);
      const team = teamOf(o, LG_OWN);
      if (team) { const k = burnt ? C.charL : team; brush(c, [[16, -70], [4, -54], [-8, -40], [-18, -28]], 6.5, k, R, { taper: 0.05, dry: 0.15, bristles: 7 }); }
      if (!burnt && !o.dead) for (const [x, y] of [[-20, -24], [22, -28]]) { brush(c, [[x, y], [x + 0.4, y + 4]], 1.6, Pl.lava, R, { bristles: 2, dry: 0.1, taper: 0.4 }); dab(c, x + 0.4, y + 5, 1.2, Pl.hot, R); }   // drips
      return;
    }
    case 'r:head':
      part(c, poly([[5, -74], [7, -83], [15, -87], [23, -83], [26, -73], [19, -66], [9, -67]], R, 0.4), Pl.rock, M, { lw: 2 });
      if (o.dead) { xEye(c, 15.6, -77.4, 1.8, R, 1); xEye(c, 21.6, -76.4, 1.6, R, 1); }
      else { for (const [x, y, w] of [[15.6, -77.4, 3.4], [21.8, -76.6, 2.8]]) { brush(c, [[x - w / 2, y], [x + w / 2, y - 0.3]], 2.2, Pl.hot, R, { bristles: 2, dry: 0, taper: 0 }); dab(c, x, y, 0.8, Pl.core, R); } brush(c, [[11, -81.4], [17, -80], [24, -80.6]], 1.7, C.ink, R, { bristles: 3, dry: 0.1 }); }
      crack(c, [[13, -70.6], [16, -71.6], [19, -70.4], [22, -71.4]], Pl, R, 1.1);
      return;
    case 'r:blob':   // the lava blob held between the fists (sits past the near fist: overhead when the arm is up)
      part(c, ring(23, -8, 10.5, 9.5, R, 0.18, 9), Pl.lava, M, { lw: 1.6 }); dab(c, 22, -9, 6.2, Pl.hot, R); dab(c, 20, -11, 2.5, Pl.core, R);
      for (const [x, y] of [[15.6, -2], [29.6, -1]]) { brush(c, [[x, y - 3], [x, y + 1]], 1.6, Pl.lava, R, { bristles: 2, dry: 0, taper: 0.5 }); }
      return;
  }
}
const GOLEM = {
  rig: {
    driver: 'golem',
    joints: { pivot: [0, -24], hipN: [6, -26], hipF: [-8, -26], legL: 26, shN: [14, -60], shF: [-12, -62], neck: [12, -68] },
    // part names + the pose's rest numbers (restN / restF = the arms' angles)
    parts(pose) {
      const p = { legN: 'r:legN', legF: 'r:legF', body: 'r:body', head: 'r:head', armN: 'r:armN', armF: 'r:armF', blob: null,
        code: code(pose), pitch: 0, ha: 0, restN: 0, restF: 0, kp: 0, kh: 0, ka: 0 };
      if (pose === 'punch' || pose === 'atk') { p.restN = -1.42; p.pitch = 0.16; p.ha = 0.1; p.kp = 1.2; p.ka = -7; }
      else if (pose === 'throw') { p.restN = -2.75; p.restF = -2.55; p.pitch = -0.16; p.ha = -0.15; p.blob = 'r:blob'; p.kp = -1; p.kh = -1.5; p.ka = -4; }
      return p;
    },
  },
};
function lgPaint(c, o) {
  if (isPart(o.pose)) { lgLayer(c, o, o.pose); return; }
  const rp = GOLEM.rig.parts(o.dead ? 'idle' : o.pose), p = resetGP({});
  p.boom = 0;
  if (o.dead) {   // the heap it falls into (rig-bosses.js golemBody, settled)
    p.comp = 0; p.LN = -1.45; p.LF = 1.4; p.lift = 15; p.pitch = 0.55; p.aN = -0.35; p.aF = 0.75; p.head = 1.6; p.dx = 0;
  } else {
    p.pitch = rp.pitch; p.head = rp.ha; p.aN = rp.restN; p.aF = rp.restF;
    const A = 0.42;
    if (o.pose === 'walk0') { p.LN = -A; p.LF = A; p.SF = 0.88; p.lift = -1; }
    else if (o.pose === 'walk1') { p.LN = A; p.LF = -A; p.SN = 0.88; p.lift = -1; }
  }
  const list = [];
  emitWith(golemEmit, GOLEM.rig.joints, rp, p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
  paintList(c, o, list, lgLayer);
}

// ================================================================ WORM (r 24.2): purple rings, orange back spikes, a petal beak
const WM_OWN = '#9a5cc6';
function wmPal(o) {
  return { skin: pc(o, WM_OWN), dark: pc(o, '#64358e', C.zskinD, C.charL), light: pc(o, '#c9a0e8', tone(C.zskin, 0.3), C.charL), belly: pc(o, '#f6dca0', tone(C.zskin, 0.4), C.charL),
    spike: pc(o, '#ff9a2e', '#c9b07a', C.charL), mouth: pc(o, '#5a1020', '#3a2a2a', C.char), gum: pc(o, '#e0506a', '#a8746a', C.charL), teeth: pc(o, C.white, '#e8ecd2', C.charL),
    dirt: '#9a6a3c', dirtD: '#6e4824', dirtL: '#c0905a', hole: '#2a1a10' };
}
function wmSeg(c, o, R, M) {   // one bulgy body ring centred on (0, 0): ~38 wide, 13 tall; belly stripe at the front, a spike at the back
  const Pl = wmPal(o), burnt = o.dead === 'burnt';
  if (!burnt) part(c, poly([[-18, -3.6], [-26, 0.4], [-18, 3.6]], R, 0.25), Pl.spike, M, { lw: 1.2, sharp: true });
  const P = poly([[-16, -6.6], [16, -6.6], [19.4, -3.2], [20, 0], [19.4, 3.2], [16, 6.6], [-16, 6.6], [-19.4, 3.2], [-20, 0], [-19.4, -3.2]], R, 0.3);
  partEdges(c, P, [[1, 5], [6, 10]], Pl.skin, M, { lw: 2.1, sp: 1 });
  brush(c, [[11, -6], [12.6, 0], [11, 6]], 5, Pl.belly, R, { bristles: 4, dry: 0.25, taper: 0.1 });
  brush(c, [[-16, 5.6], [0, 6.8], [16, 5.6]], 1.6, Pl.dark, R, { bristles: 2, dry: 0.2, taper: 0.3 });
  brush(c, [[-13, -3.4], [-13.6, 2]], 2.4, Pl.light, R, { bristles: 2, dry: 0.3, taper: 0.4 });
}
function wmHead(c, o, R, M, open) {   // origin = the top of the column; a ring band, then a 3-petal beak pointing up-forward
  const Pl = wmPal(o), burnt = o.dead === 'burnt';
  const T = [16, -30];   // the beak's tip (shut)
  if (open) {   // petals flared: back one up-back, near ones out; the round mouth full of teeth between them
    part(c, poly([[-14, -8], [4, -11], [-10, -34]], R, 0.3), Pl.dark, M, { lw: 1.7, sharp: true });
    part(c, poly([[8, -12], [20, -6], [34, -24]], R, 0.3), Pl.dark, M, { lw: 1.7, sharp: true });
    c.save(); c.translate(4, -13); c.rotate(-0.5);
    part(c, ring(0, 0, 12, 8.4, R, 0.08, 10), Pl.gum, M, { lw: 1.8 });
    dab(c, 0.4, 0.2, 7.6, Pl.mouth, R);
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, x = Math.cos(a) * 9.6, y = Math.sin(a) * 6.6, xi = Math.cos(a) * 5.2, yi = Math.sin(a) * 3.4;
      fill(c, [[x + Math.sin(a) * 1.5, y - Math.cos(a) * 1.1], [x - Math.sin(a) * 1.5, y + Math.cos(a) * 1.1], [xi, yi]], Pl.teeth, R, { sharp: true, edge: 0 }); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3; dab(c, Math.cos(a) * 3, Math.sin(a) * 2, 0.75, Pl.teeth, R); }
    c.restore();
  } else {
    part(c, poly([[-12, -8], [12, -10], T], R, 0.25), Pl.dark, M, { lw: 1.7, sharp: true });
  }
  // the ring band the beak sits on (+ eyes)
  partEdges(c, poly([[-17, -10], [15, -10], [19.4, -6], [20, -2], [17, 2], [-17, 2], [-20, -2], [-19.4, -6]], R, 0.3), [[1, 4], [5, 7]], Pl.skin, M, { lw: 2.1 });
  brush(c, [[11, -9], [12.6, -4], [11, 1]], 5, Pl.belly, R, { bristles: 4, dry: 0.25, taper: 0.1 });
  if (!open) {   // the two near petals, shut into a point
    part(c, poly([[-17, -6], [3, -6], T], R, 0.25), Pl.skin, M, { lw: 1.9, sharp: true });
    part(c, poly([[3, -6], [19, -7], T], R, 0.25), Pl.light, M, { lw: 1.9, sharp: true });
  } else {
    part(c, poly([[-18, -6], [0, -7], [-26, -22]], R, 0.3), Pl.skin, M, { lw: 1.9, sharp: true });
    part(c, poly([[6, -6], [20, -4], [30, -10]], R, 0.3), Pl.light, M, { lw: 1.9, sharp: true });
  }
  if (o.dead) { xEye(c, 0, -3.6, 1.9, R, 1); xEye(c, 8, -4, 1.7, R, 1); }
  else { eye(c, o, 0, -3.4, 2.7, R, { brow: 0.6 }); eye(c, o, 8.2, -3.8, 2.3, R, { brow: 0.6 }); }
  const team = teamOf(o, WM_OWN);
  if (team) { const k = burnt ? C.charL : team; brush(c, [[-19, 0.4], [0, 2], [19, 0.4]], 4.6, k, R, { taper: 0.05, dry: 0.12, bristles: 6 }); brush(c, [[-18, 0.6], [-25, 4.6], [-27, 10]], 2.4, k, R, { taper: 0.6, dry: 0.2, bristles: 3 }); }
  if (burnt) scorch(c, [[0, -6, 4], [-10, -16, 3]], R);
}
function wmMound(c, o, R, M) {
  const Pl = wmPal(o);
  part(c, poly([[-30, 0], [-24, -9], [-12, -16], [4, -18], [17, -13], [27, -5], [30, 0]], R, 0.6), Pl.dirt, M, { lw: 2, sp: 1 });
  for (let i = 0; i < 9; i++) { const x = -22 + R() * 44, y = -3 - R() * 11 * (1 - Math.abs(x) / 30); part(c, ring(x, y, 2.4 + R() * 1.8, 1.8 + R(), R, 0.25, 7), i & 1 ? Pl.dirtL : Pl.dirtD, M, { lw: 0.9 }); }
  for (const [x, y] of [[-6, -17], [8, -15]]) for (let k = 0; k < 3; k++) brush(c, [[x + k * 1.6, y], [x + k * 1.6 + (k - 1) * 1.2, y - 4 - R() * 2]], 0.9, C.leaf, R, { bristles: 1, dry: 0.2, taper: 0.6 });
  brush(c, [[-14, -8], [-8, -10], [-4, -6]], 0.9, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.3 });
}
function wmLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = wmPal(o);
  switch (L) {
    case 'r:seg': wmSeg(c, o, R, M); return;
    case 'r:head': wmHead(c, o, R, M, false); return;
    case 'r:headO': wmHead(c, o, R, M, true); return;
    case 'r:mound': wmMound(c, o, R, M); return;
    case 'r:hole':   // the back of the hole: dark pit + a dirt rim along the far edge
      fill(c, ring(0, 0, 23, 7.4, R, 0.1, 11), Pl.hole, R, { edge: 0 });
      for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; part(c, ring(Math.cos(a) * 23, Math.sin(a) * 7.4, 3 + R() * 1.4, 2 + R(), R, 0.25, 7), i & 1 ? Pl.dirt : Pl.dirtL, M, { lw: 1 }); }
      return;
    case 'r:rim':   // the front lip of the hole
      for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI; part(c, ring(Math.cos(a) * 23, Math.sin(a) * 7 + 1, 3.6 + R() * 1.6, 2.4 + R(), R, 0.25, 7), i & 1 ? Pl.dirtD : Pl.dirt, M, { lw: 1.1 }); }
      return;
    case 'r:crack':   // cracks running out over the ground (flat), jagged, turf flipped up
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + R() * 0.5, P = [[Math.cos(a) * 6, Math.sin(a) * 2.6]]; let x = P[0][0], y = P[0][1];
        for (let k = 0; k < 4; k++) { x += Math.cos(a + (k & 1 ? 0.5 : -0.5)) * (7 + R() * 3); y += Math.sin(a + (k & 1 ? 0.5 : -0.5)) * (3 + R()); P.push([x, y]); P.push([x, y]); }
        brush(c, P, 1.7, '#3a2414', R, { bristles: 2, dry: 0.1, taper: 0.8, per: 3 });
      }
      for (let i = 0; i < 6; i++) { const a = R() * TAU, d = 14 + R() * 18; part(c, poly([[0, 0], [5, -1.6], [4.4, 2], [-1, 2]], R, 0.4).map(([px, py]) => [px + Math.cos(a) * d, py + Math.sin(a) * d * 0.44]), i & 1 ? C.g4 : Pl.dirt, M, { lw: 0.9, sharp: true }); }
      return;
    case 'r:clods':   // dirt flying up and out (burst)
      for (let i = 0; i < 14; i++) { const a = -Math.PI * (0.08 + 0.84 * R()), d = 16 + R() * 30, x = Math.cos(a) * d * 1.3, y = -20 + Math.sin(a) * d; part(c, ring(x, y, 2.4 + R() * 2.4, 2 + R() * 1.6, R, 0.3, 7), i % 3 ? Pl.dirt : Pl.dirtD, M, { lw: 1 }); }
      for (let i = 0; i < 4; i++) dab(c, (i & 1 ? 1 : -1) * (24 + R() * 10), -3 - R() * 6, 2.6 + R() * 2, '#d8c7a2', R);
      return;
  }
}
// the column: segments bottom-up from the hole, the head on top; shared by the painter and drawUnit
const WL = { h: 1, a: new Float64Array(7), lean: 0, head: 0, open: 0, k: 1, hx: 0, hy: 0 };
const W = { seg: 0, head: 1, headO: 2, mound: 3, hole: 4, rim: 5, crack: 6, clods: 7 };
const W_NAMES = ['seg', 'head', 'headO', 'mound', 'hole', 'rim', 'crack', 'clods'];
const WSEG = 6, WGAP = 11;
let WSINK = null;
function wput(cd, a, b, c, d, e, f, al, v) { WSINK(cd, a, b, c, d, e, f, al, v); }
function wormColumn(p) {   // h: 0..1 how far up it is (the rest is below ground: cut by the caller)
  const k = p.k, down = (1 - p.h) * (WSEG * WGAP + 26) * k;
  let x = 0, y = down, ang = 0;
  for (let i = 0; i < WSEG; i++) {
    ang += p.a[i] + p.lean / WSEG;
    const sc = k * (1 - i * 0.03), cs = Math.cos(ang), sn = Math.sin(ang);
    const cx = x + sn * WGAP * 0.5 * k, cy = y - cs * WGAP * 0.5 * k;
    wput(W.seg, cs * sc, sn * sc, -sn * sc, cs * sc, cx, cy - 1, 1, i % 3);
    x += sn * WGAP * k; y -= cs * WGAP * k;
  }
  ang += p.head;
  const sc = k * 0.98, cs = Math.cos(ang), sn = Math.sin(ang);
  p.hx = x; p.hy = y;
  wput(p.open ? W.headO : W.head, cs * sc, sn * sc, -sn * sc, cs * sc, x, y + 2 * k, 1, 0);
}
function wmPaint(c, o) {
  if (isPart(o.pose)) { wmLayer(c, o, o.pose); return; }
  const pre = [], col = [], post = [], add = (L, nm) => L.push(['r:' + nm, 1, 0, 0, 1, 0, 0]);
  if (o.dead) {   // lying along the ground in an S, mouth up, X eyes (lie: 'none')
    for (let i = 0; i < WSEG; i++) pre.push(['r:seg', 0, 0.62, -1, 0, -34 + i * 11, -11 + Math.sin(i * 1.2) * 2]);
    pre.push(['r:headO', 0, -1, -1, 0, 26, -11]);
    paintList(c, o, pre, wmLayer); return;
  }
  const p = WL; p.k = 1; p.lean = 0; p.head = 0; p.open = 0; p.h = 1; for (let i = 0; i < 7; i++) p.a[i] = 0;
  const pose = o.pose;
  if (pose === 'under') add(pre, 'mound');
  else if (pose === 'rumble') { add(pre, 'crack'); add(pre, 'mound'); }
  else {
    if (pose === 'burst') add(pre, 'crack');
    add(pre, 'hole');
    if (pose === 'bite') { p.open = 1; p.lean = 0.36; p.head = 0.3; for (let i = 0; i < WSEG; i++) p.a[i] = 0.02; }
    else if (pose === 'burst') { p.open = 1; p.h = 0.85; p.head = -0.2; }
    else if (pose === 'dive') { p.h = 0.45; p.lean = -0.3; p.head = 1.1; }
    else for (let i = 0; i < WSEG; i++) p.a[i] = 0.04 * Math.sin(i * 1.3);
    WSINK = (cd, a, b, cc, d, e, f) => col.push(['r:' + W_NAMES[cd], a, b, cc, d, e, f]);
    wormColumn(p);
    WSINK = null;
    add(post, 'rim');
    if (pose === 'burst' || pose === 'dive') add(post, 'clods');
  }
  paintList(c, o, pre, wmLayer);
  if (col.length) { c.save(); c.beginPath(); c.rect(-80, -160, 160, 160.8); c.clip(); paintList(c, o, col, wmLayer); c.restore(); }   // below ground: cut
  paintList(c, o, post, wmLayer);
}
// drawUnit: under / rumble = the mound (bob, shake, dust); burst / bite / dive / idle = hole, column (springs), rim.
const WMK = { seg: [70, 3.4], head: [90, 3.6], mound: [140, 5], burstT: 0.3, diveT: 0.55, crackT: 0.6, sway: 0.05, lunge: -4, dustT: 0.22 };
const WSPR = new Array(8).fill(null);
function wmSink(cd, a, b, c, d, e, f, al, v) { const s = WSPR[cd]; if (!s) return; AL = al; rec(s, a, b, c, d, e, f); AL = 1; }
function wormDraw(ctx, u, x, y, flip, k, rt, api) {
  const SPm = RIG_ON ? spx() : null; if (!SPm) return false;
  const ent = SPm.entOf(u.type).ent, I = idxOf(ent, W_NAMES), S = api.S, now = api.now, col = api.col, v = api.v;
  for (let i = 0; i < W_NAMES.length; i++) WSPR[i] = partSpr(SPm, ent, col, I[W_NAMES[i]], i === W.seg ? ((rt * 8) | 0) % 3 : v);
  const a = act(u), b = u.b, s = xslot(u, x, y, now), dt = xdt(s, now), slot = u.id & 32767, ph = (u.id % 97) * 0.37;
  fresh(slot, u, now);
  const In = inputs(slot, u, now, flip);
  const o = s * XAN;
  if (XA[o + 15] !== a) { XA[o + 15] = a; XA[o + 14] = b && b.actT !== undefined && now - b.actT >= 0 && now - b.actT < 2 ? b.actT : now; if (a === 3) for (let i = 0; i < 6; i++) xkick(s, 2 + i, (i & 1 ? 1 : -1) * 2.4); }
  const tA = now - XA[o + 14];
  const kk = k * ent.scale;
  WY = 1e9; AL = 1;
  if (a === 1 || a === 2) {   // underground: the mound (rumble: cracks spread, it shakes)
    if (!WSPR[W.mound]) return false;
    const moving = (u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0) > 49;
    if (In.dt > 0 && moving && ((now * 7 + ph) | 0) !== XA[o + 13]) { XA[o + 13] = (now * 7 + ph) | 0; xkick(s, 0, 1.6); }
    const sq = xspring(s, 0, 0, WMK.mound, dt, 0.4);
    const shake = a === 2 ? 1.8 * kk * Math.sin(now * 53 + ph) : 0;
    base(x + shake, y, flip, kk, S);
    if (a === 2 && WSPR[W.crack]) { const e = Math.min(1, tA / WMK.crackT); rec(WSPR[W.crack], 0.4 + 0.6 * e, 0, 0, 0.4 + 0.6 * e, 0, 0); }
    rec(WSPR[W.mound], 1 + 0.6 * sq, 0, 0, 1 - sq, 0, 0);
    flushRec(ctx, 0, 1);
    if (moving && now - XA[o + 12] > WMK.dustT) { XA[o + 12] = now; const F = fxm(); if (F && F.dustAt) F.dustAt(x - flip * 18 * kk, y, 0.8 * kk); }
    return true;
  }
  if (!WSPR[W.seg] || !WSPR[W.head] || !WSPR[W.hole]) return false;
  // up: how far out of the hole
  let h = 1;
  if (a === 3) { const t = Math.min(1, tA / WMK.burstT); h = 1 - Math.exp(-5 * t) * Math.cos(7 * t) * (1 - t); }
  else if (a === 5) h = Math.max(0, 1 - tA / WMK.diveT);
  const p = WL; p.k = 1; p.h = h;   // the base transform already sizes it
  if (In.dt > 0) {
    if (In.hit) { const hh = In.hit * (1.5 + 4 * In.hitPow); for (let i = 0; i < 6; i++) xkick(s, 2 + i, hh * (0.3 + 0.15 * i)); xkick(s, 1, hh * 2); }
    if (In.atkStart) { xkick(s, 1, WMK.lunge); for (let i = 2; i < 8; i++) xkick(s, i, -1.2); }
  }
  const biting = a === 4, lean = biting ? 0.3 + 0.1 * Math.sin(now * 2.2 + ph) : a === 5 ? -0.2 : 0.06 * Math.sin(now * 1.1 + ph);
  for (let i = 0; i < WSEG; i++) p.a[i] = xspring(s, 2 + i, WMK.sway * Math.sin(now * 2.1 - i * 0.7 + ph), WMK.seg, dt, 0.8);
  p.lean = lean;
  p.head = xspring(s, 1, biting ? 0.3 + (u.attack > 0 ? 0.35 : 0) : a === 5 ? 1 : 0.05 * Math.sin(now * 1.7 + ph), WMK.head, dt, 1.4);
  p.open = biting || a === 3 ? (u.attack > 0 || a === 3 || ((now * 1.3 + ph) % 2) < 1.4 ? 1 : 0) : 0;
  base(x, y, flip, kk, S);
  if ((a === 3 || a === 4) && WSPR[W.crack]) { AL = a === 4 ? Math.max(0, 1 - tA / 3) : 1; rec(WSPR[W.crack], 1, 0, 0, 1, 0, 0); AL = 1; }
  const hs = a === 5 ? Math.max(0.35, 1 - Math.max(0, tA - WMK.diveT) / 0.8) : 1;
  if (a === 5 && tA > WMK.diveT + 0.8) {   // down: only the mound shows
    if (WSPR[W.mound]) rec(WSPR[W.mound], 1, 0, 0, 1, 0, 0);
    flushRec(ctx, 0, 1); return true;
  }
  rec(WSPR[W.hole], hs, 0, 0, hs, 0, 0);
  WY = (y + 0.8) * S;
  WSINK = wmSink; wormColumn(p); WSINK = null;
  WY = 1e9;
  if (WSPR[W.rim]) rec(WSPR[W.rim], hs, 0, 0, hs, 0, 0);
  if ((a === 3 && tA < 0.6) || (a === 5 && tA < WMK.diveT)) { const e = a === 3 ? tA / 0.6 : tA / WMK.diveT; if (WSPR[W.clods]) { AL = 1 - e; const sc = 0.7 + 0.6 * e; rec(WSPR[W.clods], sc, 0, 0, sc, 0, -6 * e); AL = 1; } }
  flushRec(ctx, u.flash > 0 ? Math.min(1, u.flash) : 0, 1);
  return true;
}

// ================================================================ SLIMES: king (crown), big, slimelet (pink jelly)
const KS_OWN = '#f27bb5';
const SLIME_SIZE = {   // rx, ry (jelly at rest), lw, eye size, inside cap
  kingslime: { rx: 38, ry: 27, lw: 2.5, es: 1.9, cap: 6, k: 0 },
  bigslime: { rx: 22.5, ry: 16, lw: 2, es: 1.25, cap: 2, k: 1 },
  slimelet: { rx: 10.5, ry: 7.6, lw: 1.5, es: 0.62, cap: 0, k: 2 },
};
const IN_AT = [[-17, -18, 0.4], [9, -14, -0.5], [-3, -31, 2.6], [20, -26, 1.2], [-25, -30, -1], [8, -36, 3.4]];   // king inside shapes (x, y, turn)
const IN_AT_BIG = [[-7, -10, 0.5], [7, -14, -1.6]];
function jellyCol(o, type) {
  const team = teamOf(o, KS_OWN);
  return o.dead === 'burnt' ? C.char : o.risen ? C.zskin : team ? tone(team, 0.2) : KS_OWN;
}
function slBody(c, o, Z) {   // the jelly, gumdrop shaped, flat on the ground, bubbles inside
  const R = o.R, M = o.M, col = jellyCol(o), cy = -Z.ry;
  let pts = ring(0, cy, Z.rx, Z.ry, R, 0.06, 13, R() * 0.3).map(([x, y]) => [x * (1 + 0.16 * (y - cy) / Z.ry), y]);
  pts = pts.map(([x, y]) => (y > cy + Z.ry * 0.55 ? [x, cy + Z.ry * 0.62 + (y - cy - Z.ry * 0.55) * 0.35] : [x, y]));
  part(c, pts, col, M, { lw: Z.lw, sp: 1.0 });
  if (o.dead !== 'burnt') {
    brush(c, [[-Z.rx * 0.5, cy + Z.ry * 0.5], [Z.rx * 0.1, cy + Z.ry * 0.62], [Z.rx * 0.6, cy + Z.ry * 0.45]], Z.ry * 0.28, tone(col, -0.12), R, { taper: 0.4, dry: 0.4, bristles: 5 });
    if (Z.k < 2) for (const [x, y, r] of [[-0.42, 0.3, 0.06], [-0.1, 0.52, 0.04], [0.5, 0.2, 0.05], [0.25, -0.2, 0.035]]) dab(c, Z.rx * x, cy + Z.ry * y, Math.max(0.8, Z.rx * r), tone(col, 0.35), R);
  }
}
function slTop(c, o, Z, type) {   // face, shine, crown (king)
  const R = o.R, M = o.M, col = jellyCol(o), cy = -Z.ry, es = Z.es, burnt = o.dead === 'burnt';
  if (!burnt) brush(c, [[-Z.rx * 0.68, cy - Z.ry * 0.02], [-Z.rx * 0.52, cy - Z.ry * 0.55], [-Z.rx * 0.16, cy - Z.ry * 0.8]], 1.7 * es, C.white, R, { bristles: 3, taper: 0.6, dry: 0.35 });
  const ex = Z.rx * 0.18, ey = cy - Z.ry * 0.1;
  for (const [x, r] of [[ex, 2.6], [ex + 6.2 * es, 2.9]]) eye(c, o, x, ey, r * es, R, { lid: type === 'kingslime' && !o.dead ? 0.38 : 0, lidCol: col });
  if (!o.dead && type === 'kingslime') brush(c, [[ex - 0.6 * es, ey + 4.4 * es], [ex + 3.4 * es, ey + 5.8 * es], [ex + 7.4 * es, ey + 4.4 * es], [ex + 8.6 * es, ey + 3.2 * es]], 0.9 * es, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // smug smirk
  else if (!o.dead) brush(c, [[ex + 1 * es, ey + 4 * es], [ex + 3.2 * es, ey + 5.2 * es], [ex + 5.6 * es, ey + 4 * es]], 0.85 * es, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  if (!o.dead && type !== 'slimelet') dab(c, ex + 4.2 * es, ey + 6.4 * es, 0.75 * es, C.white, R);   // a little fang
  if (type === 'kingslime') {   // the gold crown, a bit crooked
    const gold = burnt ? C.charL : '#ffc61e', gem = burnt ? C.char : C.red;
    c.save(); c.translate(-3, cy - Z.ry * 0.86); c.rotate(-0.14);
    const P = [[-13, 2], [-14, -8], [-8, -3], [-4, -13], [0, -4], [4, -13], [8, -3], [14, -8], [13, 2]];
    part(c, poly(P, R, 0.3), gold, M, { lw: 1.7, sharp: true });
    brush(c, [[-12.6, -0.6], [12.6, -0.6]], 2.2, tone(gold, -0.18), R, { bristles: 3, dry: 0.2, taper: 0 });
    for (const [x, y, r] of [[-14, -9, 1.5], [-4, -14, 1.6], [4, -14, 1.6], [14, -9, 1.5]]) dab(c, x, y, r, gold, R);
    for (const [x, gc] of [[-6.4, gem], [0, C.blue], [6.4, gem]]) dab(c, x, -0.6, 1.6, burnt ? C.char : gc, R);
    c.restore();
  }
}
function slInside(c, o, Z, i) {   // a dark shape of something swallowed: a little person, curled or flailing (alpha baked in)
  const R = o.R, at = Z.cap === 6 ? IN_AT[i] : IN_AT_BIG[i], s = Z.cap === 6 ? 1.3 : 0.95;
  const col = 'rgba(40,16,48,0.55)';
  c.save(); c.translate(at[0], at[1]); c.rotate(at[2]); c.scale(s, s);
  c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round';
  c.beginPath(); c.arc(0, -7, 2.6, 0, TAU); c.fill();
  c.lineWidth = 3.4; c.beginPath(); c.moveTo(0, -4.6); c.lineTo(0.4, 1.4); c.stroke();
  c.lineWidth = 1.8;
  const k = i % 3;
  c.beginPath();
  if (k === 0) { c.moveTo(0, -3); c.lineTo(-3.6, -6.4); c.moveTo(0, -3); c.lineTo(3.6, -6.6); }   // arms up
  else if (k === 1) { c.moveTo(0, -3); c.lineTo(-3.4, -0.4); c.moveTo(0, -3); c.lineTo(3.2, -1); }
  else { c.moveTo(0, -3); c.lineTo(3.6, -4.4); c.lineTo(4.6, -1.6); c.moveTo(0, -3); c.lineTo(-3, -1); }
  c.moveTo(0.4, 1.2); c.lineTo(-2, 5.4); c.moveTo(0.4, 1.2); c.lineTo(2.8, 5); c.stroke();
  void R;
  c.restore();
}
function slLayerFor(type) {
  const Z = SLIME_SIZE[type];
  return (c, o, L) => {
    if (L === 'r:body') slBody(c, o, Z);
    else if (L === 'r:top') slTop(c, o, Z, type);
    else if (L.startsWith('r:in')) slInside(c, o, Z, +L.slice(4));
  };
}
const SL_POSE = { idle: 0, hop: 0.22, land: -0.28 };
function slParts(type) {
  const Z = SLIME_SIZE[type];
  return (pose) => ({ body: 'r:body', top: 'r:top', in0: Z.cap > 0 ? 'r:in0' : null, in1: Z.cap > 1 ? 'r:in1' : null, in2: Z.cap > 2 ? 'r:in2' : null,
    in3: Z.cap > 3 ? 'r:in3' : null, in4: Z.cap > 4 ? 'r:in4' : null, in5: Z.cap > 5 ? 'r:in5' : null,
    k: Z.k, sq: SL_POSE[pose] ?? 0, code: code(pose), kq: pose === 'land' ? -4 : pose === 'hop' ? 3 : 0, cap: Z.cap, n: 0 });
}
function slPaintFor(type) {
  const Z = SLIME_SIZE[type], layer = slLayerFor(type), parts = slParts(type);
  return (c, o) => {
    if (isPart(o.pose)) { layer(c, o, o.pose); return; }
    const R = o.R;
    if (o.dead) {   // a flat puddle, X eyes (the king's crown lies beside it)
      const col = jellyCol(o);
      part(c, ring(0, -Z.ry * 0.16, Z.rx * 1.12, Z.ry * 0.3, R, 0.14, 12), col, o.M, { lw: Z.lw });
      for (let i = 0; i < 4; i++) dab(c, (-1.3 + i * 0.85) * Z.rx + R() * 3, -0.4 + R(), Math.max(0.8, Z.rx * 0.07), col, R);
      xEye(c, Z.rx * 0.1, -Z.ry * 0.3, Z.es * 1.6, R, Z.es * 0.7); xEye(c, Z.rx * 0.1 + 6 * Z.es, -Z.ry * 0.3, Z.es * 1.6, R, Z.es * 0.7);
      if (type === 'kingslime') { c.save(); c.translate(Z.rx * 1.1, -4); c.rotate(0.5); part(c, poly([[-9, 2], [-10, -6], [-5, -2], [-2, -9], [1, -2], [4, -9], [7, -2], [10, -6], [9, 2]], R, 0.3), o.dead === 'burnt' ? C.charL : '#ffc61e', o.M, { lw: 1.4, sharp: true }); c.restore(); }
      return;
    }
    const rp = parts(o.pose), p = { sq: rp.sq, sh: 0, ix: new Float64Array(6), iy: new Float64Array(6), n: 0 }, list = [];
    emitWith(slimeEmit, null, rp, p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
    paintList(c, o, list, layer);
  };
}
function slPick(u) { const a = act(u); if (a === 1) return 'hop'; if (a === 2) return 'land'; return (u.z || 0) > 1 ? 'hop' : null; }
function slEntry(type, box) {
  const Z = SLIME_SIZE[type], ins = []; for (let i = 0; i < Z.cap; i++) ins.push('r:in' + i);
  return {
    box, scale: 1, own: KS_OWN, lie: 'none', poses: ['idle', 'hop', 'land'], extra: ['r:body', 'r:top', ...ins],
    paint: slPaintFor(type), pick: slPick,
    rig: { driver: 'kslime', parts: slParts(type) },
  };
}

// ================================================================ projectiles
function lob(p) { let z = p.z > 0 ? p.z : 0; if (!(z > 0) && p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; z = 4 * p.apex * f * (1 - f); } return z; }
export const PROJ = {
  // missile: a white rocket with a red nose + fins on a flame (variants 0-1), smoke puffs (2-3) trailing behind
  missile: {
    box: [34, 16, 20, 8], n: 4,
    paint(c, R, v, M) {
      if (v >= 2) { part(c, ring(0, 0, 3.4 + v * 0.4, 3, R, 0.2, 8), v === 2 ? C.smokeL : C.smoke, M, { lw: 0.9 }); return; }
      const fl = v ? 1.25 : 1;
      fill(c, poly([[-10, -2.6], [-16 - 4 * fl, -1], [-19 - 5 * fl, 0], [-16 - 4 * fl, 1], [-10, 2.6]], R, 0.4), C.fireO, R, { sharp: true, edge: 0 });
      fill(c, poly([[-10, -1.4], [-14 - 3 * fl, 0], [-10, 1.4]], R, 0.2), C.fireY, R, { sharp: true, edge: 0 });
      part(c, poly([[-10, -4.6], [-6, -2.4], [-6, 2.4], [-10, 4.6]], R, 0.2), C.red, M, { lw: 1, sharp: true });
      part(c, poly([[-10, -2.6], [7, -2.6], [7, 2.6], [-10, 2.6]], R, 0.2), C.white, M, { lw: 1.2, sharp: true });
      part(c, poly([[7, -2.6], [12, 0], [7, 2.6]], R, 0.15), C.red, M, { lw: 1.1, sharp: true });
      brush(c, [[-2, -2.4], [-2, 2.4]], 1, C.red, R, { bristles: 2, dry: 0 });
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = lob(p);
      let vz = 0;   // climb rate from the sim's arc: z = 4 apex f (1 - f) + 6 (1 - f), f = 1 - life / maxLife
      if (p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; vz = (4 * p.apex * (1 - 2 * f) - 6) / p.maxLife; }
      const a = Math.atan2((p.vy || 0) - vz, p.vx || 0);
      api.shadowAt(x, y, 0.3, Math.max(0.3, 0.8 - z / 200));
      const cs = Math.cos(a), sn = Math.sin(a);
      for (let k = 0; k < 3; k++) {   // smoke trail behind it
        const d = 12 + k * 7, sp = api.bit(api.sprite, 2 + (((rt * 6) | 0) + k + i) % 2);
        if (sp) { api.ctx.globalAlpha = 0.75 - k * 0.2; api.put(sp, x - cs * d, y - 9 - z - sn * d - k * 1.5, 0.8 + k * 0.35, rt * 2 + k); }
      }
      api.ctx.globalAlpha = 1;
      const spr = api.bit(api.sprite, ((rt * 14) | 0) & 1);
      if (spr) api.put(spr, x, y - 9 - z, 1, a);
      return true;
    },
  },
  // lavablob: a glowing gob of lava with drips, lobbed (p.z, or an arc from p.apex), turning slowly, with a shadow
  lavablob: {
    box: [28, 28, 14, 14], n: 3,
    paint(c, R, v, M) {
      part(c, ring(0, 0, 8.6, 7.8, R, 0.2, 9), C.fireO, M, { lw: 1.6 });
      dab(c, -0.6, -0.4, 5.2, C.fireY, R); dab(c, -2, -2, 2.2, '#fff3b0', R);
      for (const [x, y, r] of [[4, 3, 1.6], [-4, 4, 1.3], [5, -4, 1]]) dab(c, x, y, r, '#5b4842', R);
      for (const [x, y] of [[-3, 9], [3, 10.4]]) dab(c, x, y + (v - 1) * 0.6, 1.3, C.fireR, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = lob(p);
      api.shadowAt(x, y, 0.45, 0.75);
      const spr = api.bit(api.sprite, ((rt * 8) | 0) % 3);
      if (spr) api.put(spr, x, y - 8 - z, 1.1, rt * 3 + i);
      return true;
    },
  },
  // lava: a molten pool on the ground (r = p.r), bubbling (variants 0-2), crusting over as it runs out (3-4)
  lava: {
    box: [76, 42, 38, 21], n: 5, ground: true,
    paint(c, R, v, M) {
      const crust = v >= 3, pts = [];
      for (let i = 0; i < 13; i++) { const a = i / 13 * TAU + R() * 0.2, kq = 0.82 + R() * 0.3; pts.push([Math.cos(a) * 30 * kq, Math.sin(a) * 17 * kq]); }
      if (crust) {
        fill(c, pts, '#4a3530', R, { sp: 1.2, vary: 0.12 });
        for (let i = 0; i < 6; i++) { const a = R() * TAU, d = R() * 18; brush(c, [[Math.cos(a) * d, Math.sin(a) * d * 0.5], [Math.cos(a + 0.6) * (d + 7), Math.sin(a + 0.6) * (d + 7) * 0.5]], 1.4, v === 3 ? C.fireO : C.fireR, R, { bristles: 2, dry: 0.3, taper: 0.5 }); }
        brush(c, pts.concat([pts[0]]), 1.6, C.ink, R, { bristles: 3, dry: 0.35, taper: 0 });
        return;
      }
      fill(c, shift(pts, M.mx, M.my, 1), C.fireR, R, { sp: 1.2, vary: 0.1 });
      fill(c, pts.map(([x, y]) => [x * 0.74, y * 0.7]), C.fireO, R, { sp: 1.1, vary: 0.1, edge: 0 });
      fill(c, pts.map(([x, y]) => [x * 0.42 + (v - 1) * 2, y * 0.38]), C.fireY, R, { sp: 1, vary: 0.08, edge: 0 });
      for (let i = 0; i < 4; i++) { const a = R() * TAU, d = R() * 16; dab(c, Math.cos(a) * d, Math.sin(a) * d * 0.55, 1.6 + R() * 1.6, i & 1 ? '#fff3b0' : C.fireY, R); }
      for (let i = 0; i < 3; i++) { const a = R() * TAU, d = 8 + R() * 14; part(c, ring(Math.cos(a) * d, Math.sin(a) * d * 0.55, 1.6, 1.2, R, 0.2, 6), '#5b4842', M, { lw: 0.7 }); }
      brush(c, pts.concat([pts[0]]), 1.6, C.ink, R, { bristles: 3, dry: 0.35, taper: 0 });
    },
    draw(p, x, y, ang, rt, i, api) {
      const tot = p.maxLife > 0 ? p.maxLife : p.life > 0 ? p.life : 8, age = p.age !== undefined ? p.age : tot - (p.life || 0);
      const left = tot - age, r = p.r > 0 ? p.r : 16;
      const grow = age < 0.25 ? 0.45 + 0.55 * (age / 0.25) : 1, sc = r / 30 * grow;
      const hot = api.bit(api.sprite, ((rt * 5 + i * 0.7) | 0) % 3);
      if (hot) api.put(hot, x, y, sc, 0);
      if (left < 2.2) {   // crusting over
        const cool = api.bit(api.sprite, left < 0.9 ? 4 : 3);
        if (cool) { api.ctx.globalAlpha = Math.min(1, (2.2 - left) / 1.4); api.put(cool, x, y, sc, 0); api.ctx.globalAlpha = 1; }
      }
      return true;
    },
  },
};

// ================================================================ the registry
const KR_EXTRA = KR_N.map((n) => 'r:' + n);
export const SPRITES = {
  // KRAKEN: poses + fields in the header. Draws itself (arms from b.ax / b.ay / b.as / b.av); the whole poses are the icon,
  // the sheet and the first frames while its parts bake.
  kraken: {
    box: [150, 92, 75, 72], scale: 1, own: KR_OWN, lie: 'none', poses: ['head0', 'head1', 'ink'], extra: KR_EXTRA,
    paint(c, o) { if (isPart(o.pose)) krLayer(c, o, o.pose); else krWhole(c, o, o.pose); },
    pick(u, info) { if (act(u) === 1) return 'ink'; const ph = (u.id % 97) * 0.37; return ((info.now + ph * 3) % KRK.blinkT) < KRK.blinkL ? 'head1' : 'head0'; },
    drawUnit: krakenDraw,
  },
  // GMECH: floppy ('gmech'); drawUnit only adds the chest laser beam under the body (returns false).
  gmech: {
    box: [134, 146, 66, 138], scale: 1, own: GM_OWN, lie: 'none', poses: ['idle', 'walk0', 'walk1'],
    extra: ['missiles', 'laser', 'stomp', 'dying', 'r:legN', 'r:legF', 'r:body', 'r:head', 'r:armN', 'r:armF', 'r:pod', 'r:podO', 'r:lens', 'r:fx', 'r:boom', 'r:beam', 'r:hit'],
    paint: gmPaint,
    pick(u) { const a = act(u); return a === 1 ? 'missiles' : a === 2 ? 'laser' : a === 3 ? 'stomp' : a === 4 ? 'dying' : null; },
    drawUnit: gmechDraw,
    rig: GMECH.rig,
  },
  // HYDRA: draws itself (body on the stride, necks + heads from b.heads / b.hs / b.hT); whole poses show 3 heads.
  hydra: {
    box: [190, 130, 82, 110], scale: 1, own: HY_OWN, lie: 'none', poses: ['idle', 'walk0', 'walk1'],
    extra: ['bite', 'breath', 'stumps', ...H_NAMES.map((n) => 'r:' + n)],
    paint: hyPaint,
    drawUnit: hydraDraw,
  },
  // LAVAGOLEM: floppy ('golem'): dead it falls apart into a heap of rocks.
  lavagolem: {
    box: [132, 150, 56, 142], scale: 1, own: LG_OWN, lie: 'none', poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['punch', 'throw', 'r:legN', 'r:legF', 'r:body', 'r:head', 'r:armN', 'r:armF', 'r:blob'],
    paint: lgPaint,
    pick(u) { const a = act(u); if (a === 1) return 'punch'; if (a === 2) return 'throw'; if (u.attack > 0) return 'punch'; return null; },
    rig: GOLEM.rig,
  },
  // WORM: draws itself (mound / hole + column on springs + rim).
  worm: {
    box: [116, 112, 58, 100], scale: 1, own: WM_OWN, lie: 'none', poses: ['idle', 'under', 'rumble', 'burst', 'bite', 'dive'],
    extra: W_NAMES.map((n) => 'r:' + n),
    paint: wmPaint,
    pick(u) { const a = act(u); return a === 1 ? 'under' : a === 2 ? 'rumble' : a === 3 ? 'burst' : a === 4 ? 'bite' : a === 5 ? 'dive' : null; },
    drawUnit: wormDraw,
  },
  // KING SLIME / BIG SLIME / SLIMELET: floppy ('kslime'): jelly squash + stretch; b.inside shapes slosh inside.
  kingslime: slEntry('kingslime', [118, 92, 59, 80]),
  bigslime: slEntry('bigslime', [72, 52, 36, 44]),
  slimelet: slEntry('slimelet', [36, 28, 18, 23]),
};
