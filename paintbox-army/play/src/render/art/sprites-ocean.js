// OCEAN tab sprites (OURS, Part 2 step 6, STEP6.md). Owner: OCEAN-ART. Contract: ART.md + RIG.md (+ PROJ in sprites.js).
// A 7-year-old's tempera sea animals: red crab (front view, one big claw, eyes on stalks), grey shark with a white belly and a
// toothy grin, purple octopus, yellow spotted puffer, dark green eel with a yellow spark stripe, green turtle with a brown
// shell, brown walrus with white tusks, blue swordfish with a sail fin. Team battle (o.col !== own): a team band / fin tip
// with a white edge (shark + swordfish fin tips, puffer tail, crab + octopus band, eel collar, turtle shell rim, walrus scarf).
// o.dead 'dead' = on its back (belly up, legs up), X eyes (lie: 'none', painted lying); 'burnt' = the same, all charcoal.
// o.risen = zombie copy (skin C.zskin, milky eyes, stitched mouth, ribs).
//
// Every type is painted as LAYERS ('r:<layer>' poses, each at rest, facing right, feet at 0,0) and every whole pose is those
// layers put together by rig-ocean.js emit() with the pose's numbers (the floppy driver runs the same code every frame), so the
// whole sprites and the floppy parts always agree.
//
// WATER (deep water u.wet >= 0.75; the fish in any water >= 0.05; not in the air): drawUnit below draws the WATER frames whole
// (the floppy body is for land): each one is
// a pose sunk into the water at the feet line: what is above the water in full colour, what is under it as a dark-blue
// shape, a foam line + splash where it breaks the surface. Fish under water show only the fin / back + ripples; they are
// whole when they breach (shark lunge, swordfish leap, eel shock). The land + water animals in shallow water: RENDER draws the
// land frames with its waterline cut, as for every unit.
//
// Poses (pick(u, info) on land, from STEP6.md b.act codes; RENDER's default = atk while u.attack > 0.35, walk0 / walk1 moving):
//   crab      pinch (b.act 1: the big claw thrust forward, shut), atk (claws up, snapping), walk0 / walk1, idle.
//             Water: swim (claws up over the water), pinchW.
//   shark     on land (stranded): flop (thrashing), atk (jaws open), walk0 / walk1, idle. Water: fin0 / fin1 (cruising:
//             only the dorsal fin + ripples, the shape under it), lunge (b.act 1 or u.attack: breaching, jaws open, splash),
//             drag (b.act 2: fin + thrashing tail + white water; b.victim is under there).
//   octopus   grab (b.act 1: tentacles flung forward; a tentacle runs to each held unit b.v0..b.v3, drawn by drawUnit),
//             ink (b.act 2: squashed, squirting a black puff behind), atk, walk0 / walk1, idle. Water: swim, grabW, inkW.
//   puffer    puff (b.act 1: a round spiky ball), atk (bite), walk0 / walk1 (hops), idle. Water: swim, puffW.
//   eel       shock (b.act 1: glowing, sparks crackling round it), on land flop / atk / walk0 / walk1 / idle. Water:
//             swim0 / swim1 (humps of its back breaking the surface), shockW (reared up out of the water), biteW.
//   turtle    shell (b.act 1: head + legs pulled in, eyes peeking), atk (beak bite), walk0 / walk1, idle. Water: swim, shellW.
//   walrus    slide (b.act 1: flat on its belly, flippers back, skid lines), atk (tusk stab), walk0 / walk1, idle.
//             Water: swim (head + back over the water), slideW (sliding through it, spray).
//   swordfish leap (b.act 1: straight as a spear, fins back; pitched along its arc by the driver), flop (b.act 2 or on
//             land: thrashing, gasping), atk, walk0 / walk1, idle. Water: fin0 / fin1 (the sail fin cutting the water),
//             leapW (at the surface: bursting out, splash).
// Projectile: PROJ.ink = the octopus / kraken ink cloud (effect projectile: p.r radius, p.age s; fades by p.life / maxLife
// when the sim keeps them, else over 4 s): a heap of black-purple ink blobs, swirling, over the units.
import { C, TAU, lerp, tone, brush, ring, poly, fill, part, dab, tube, shift, canvas, outline, spark } from './paint.js';
import { resolveJ, emitWith, resetP, newP } from './rig-ocean.js';

// ---------------------------------------------------------------- shared helpers
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const teamOf = (o, own) => (o.col && !sameCol(o.col, own)) ? o.col : null;
/** colour for a part: natural / zombie / charcoal. */
const pc = (o, nat, zom = C.zskin, burnt = C.char) => (o.dead === 'burnt' ? burnt : o.risen ? zom : nat);
const MILK = '#e7edd6', FOAM = '#f6fbff', DEEPC = '#123f7c', MOUTH = '#9e1f2a', TONGUE = '#e5707a';
const DEEP = 0.75, WET = 0.05;   // sim/const.js DEEP / WET: from DEEP ocean animals swim (drawUnit draws the water frames); fish from WET
const act = (u) => (u.b && u.b.act) | 0;
function onBack(c, h, fn) { c.save(); c.translate(0, -h); c.scale(1, -1); fn(); c.restore(); }
function about(c, x, y, a, fn) { if (!a) { fn(); return; } c.save(); c.translate(x, y); c.rotate(a); c.translate(-x, -y); fn(); c.restore(); }
function xEye(c, x, y, s, R, w = 0.7) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
/** A big cartoon eye: white + pupil (looking forward); dead = X; risen = milky, pupil adrift. brow: an angry stroke over it. */
function eye(c, o, x, y, r, R, brow = 0, white = C.white) {
  if (o.dead) { xEye(c, x, y, r * 0.85, R, Math.max(0.55, r * 0.5)); return; }
  if (o.risen) { dab(c, x, y, r * 1.1, MILK, R); dab(c, x + r * 0.35, y + r * 0.35, r * 0.4, C.ink, R); return; }
  dab(c, x, y, r, white, R); dab(c, x + r * 0.32, y + r * 0.06, r * 0.54, C.ink, R);
  if (brow) brush(c, [[x - r * 1.2, y - r * 1.25 - brow * 0.3], [x + r * 1.1, y - r * 0.75]], Math.max(0.6, r * 0.5), C.ink, R, { bristles: 2, dry: 0 });
}
function zMouth(c, pts, R, w = 0.5) {
  brush(c, pts, w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i]; brush(c, [[x, y - w * 1.6], [x, y + w * 1.6]], w * 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
}
function ribs(c, x, y, n, h, gap, R) {
  for (let i = 0; i < n; i++) { const X = x + i * gap;
    brush(c, [[X - 0.3, y - h * 0.5], [X + 0.45, y - h * 0.25], [X + 0.7, y], [X + 0.45, y + h * 0.25], [X - 0.3, y + h * 0.5]], Math.max(0.6, h * 0.12), tone(C.zskinD, -0.45), R, { bristles: 2, dry: 0.15, taper: 0.35 }); }
}
function scorch(c, pts, R, col = C.charL) { for (const [x, y, r] of pts) dab(c, x, y, r, col, R, 0.35); }
const jit = (P, R, j = 0.3) => P.map(([x, y]) => [x + (R() - 0.5) * 2 * j, y + (R() - 0.5) * 2 * j]);
function inkLine(c, P, w, R) { brush(c, jit(P, R), w, C.ink, R, { bristles: 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 }); }
/** A fill whose ink outline runs only along the given index ranges of pts (the rest hides under the part it joins). */
function partEdges(c, pts, ranges, col, M, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  for (const [i0, i1] of ranges) { const P = []; for (let i = i0; i <= i1; i++) P.push(pts[i % pts.length]); inkLine(c, P, o.lw ?? M.lw, M.R); }
}
/** A strip along a centre line (widths per point). cap 1 = outlined round the far end too. */
function stripPts(pts, ws) {
  const n = pts.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = ws[i] / 2;
    L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); Rr.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  return [L, Rr];
}
function strip(c, pts, ws, col, M, cap = 0, o = {}) {
  const [L, Rr] = stripPts(pts, ws), rv = Rr.slice().reverse(), all = L.concat(rv);
  fill(c, shift(all, M.mx, M.my, M.grow * 0.6), col, M.R, o);
  const lw = o.lw ?? M.lw;
  if (cap) inkLine(c, L.concat(rv), lw, M.R);
  else { inkLine(c, L, lw, M.R); inkLine(c, Rr, lw, M.R); }
  return [L, Rr];
}
/** a row of white teeth (a zigzag reads at any size): along x0..x1 at y, pointing dir (+1 down, -1 up). */
function teeth(c, x0, x1, y, n, h, dir, col, R, w = 0.75) {
  const P = []; for (let i = 0; i <= n * 2; i++) P.push([lerp(x0, x1, i / (n * 2)), y + (i & 1 ? dir * h : 0)]);
  brush(c, P, w, col, R, { bristles: 2, dry: 0, taper: 0 });
}
/** The team mark: a band in the team colour with a white edge (reads on any body colour, red on the red crab too). */
function band(c, o, own, pts, w, R, end) {
  const col = teamOf(o, own); if (!col) return;
  const k = o.dead === 'burnt' ? C.charL : col;
  if (o.dead !== 'burnt') brush(c, pts, w + 1.3, C.white, R, { taper: 0.1, dry: 0.05, bristles: Math.max(3, Math.round(w)) });
  brush(c, pts, w, k, R, { taper: 0.1, dry: 0.1, bristles: Math.max(3, Math.round(w)) });
  if (end) brush(c, end, w * 0.78, k, R, { taper: 0.6, dry: 0.2, bristles: 3 });
}
/** A fin tip in the team colour (a fill with a white rim line under it); returns true when it painted one. */
function tip(c, o, own, pts, M, lw = 0.9) {
  const col = teamOf(o, own); if (!col) return false;
  const k = o.dead === 'burnt' ? C.charL : col;
  fill(c, shift(pts, M.mx * 0.5, M.my * 0.5, 0.1), k, M.R, { sharp: true, edge: 0 });
  if (o.dead !== 'burnt') brush(c, [pts[0], pts[pts.length - 1]], 0.8, C.white, M.R, { bristles: 2, dry: 0, taper: 0 });
  outline(c, pts, M.R, lw, { gap: true });
  return true;
}
/** Foam where a body breaks the water (y = 0): a white wavy crest, a light line under it, splash drops. */
function foam(c, R, x0, x1, drops = 3, k = 1) {
  const n = Math.max(3, Math.round((x1 - x0) / 3)), P = [];
  for (let i = 0; i <= n; i++) P.push([lerp(x0, x1, i / n), (i & 1 ? -0.9 : 0.1) * k]);
  brush(c, P, 1.6 * k, FOAM, R, { bristles: 3, dry: 0.3, taper: 0.1 });
  brush(c, [[x0 + 1, 0.9 * k], [(x0 + x1) / 2, 1.2 * k], [x1 - 1, 0.9 * k]], 0.9 * k, C.pondL, R, { bristles: 2, dry: 0.3, taper: 0.2 });
  for (let i = 0; i < drops; i++) { const x = R() < 0.5 ? x0 - 0.6 - R() * 2 : x1 + 0.6 + R() * 2; dab(c, x, -1.4 - R() * 2.6 * k, 0.55 * k, FOAM, R); }
}
/** Rings round a body in the water (a wake): open arcs either side, faded out at the ends by the dry brush. */
function wake(c, R, x0, x1, back = 1) {
  brush(c, [[x0 - 1, 1.4], [x0 - 4 * back, 1.8], [x0 - 8 * back, 1.4]], 0.9, FOAM, R, { bristles: 2, dry: 0.6, taper: 0.7 });
  brush(c, [[x0 - 2, -0.6], [x0 - 5.6 * back, -0.9], [x0 - 9 * back, -0.4]], 0.8, FOAM, R, { bristles: 2, dry: 0.6, taper: 0.7 });
  brush(c, [[x1 + 0.6, 0.8], [x1 + 2.4, 1.6]], 0.8, FOAM, R, { bristles: 2, dry: 0.5, taper: 0.5 });
}
/** A splash crown at the waterline: a ring of white spikes + flying drops (breaching). */
function splash(c, R, x, w, h) {
  for (let i = 0; i < 7; i++) { const t = i / 6, sx = x + (t - 0.5) * w * 2, hh = h * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (0.7 + R() * 0.5), lean = (t - 0.5) * 1.6;
    brush(c, [[sx, 0.6], [sx + lean, -hh * 0.55], [sx + lean * 2.2, -hh]], 1.3 + R() * 0.4, FOAM, R, { bristles: 3, dry: 0.25, taper: 0.8 }); }
  for (let i = 0; i < 6; i++) dab(c, x + (R() - 0.5) * w * 2.6, -h * (0.6 + R() * 0.8), 0.5 + R() * 0.5, i & 1 ? FOAM : C.pondL, R);
  brush(c, [[x - w * 1.1, 0.3], [x, 1], [x + w * 1.1, 0.3]], 1.4, FOAM, R, { bristles: 3, dry: 0.2, taper: 0.1 });
}

// ---------------------------------------------------------------- poses -> layers (shared with the floppy driver)
const LA0 = [0, 0, 0, 0, 0, 0, 0, 0], LS1 = [1, 1, 1, 1, 1, 1, 1, 1];
/** rig.parts() result with every field the driver reads (parts default to none, numbers to 0). */
const sp = (p) => Object.assign({ l0: null, l1: null, l2: null, l3: null, l4: null, l5: null, l6: null, l7: null, t0: null, t1: null, t2: null,
  body: null, head: null, jaw: null, hfx: null, aN: null, aF: null, fN: null, fF: null, bfx: null, b2: null, gfx: null,
  gait: 1, pitch: 0, lift: 0, lx: 0, sq: 0, ha: 0, hx: 0, ja: 0, ta0: 0, ta1: 0, ta2: 0, arm: [0, 0], pin: [0, 0], la: LA0, ls: LS1,
  code: 0, kp: 0, kb: 0, kh: 0, kt: 0, ksq: 0, ka: 0, shake: 0, vzp: 0 }, p);
const POSE_CODE = new Map();
const code = (pose) => { let k = POSE_CODE.get(pose); if (k === undefined) { k = POSE_CODE.size + 1; POSE_CODE.set(pose, k); } return k; };
/** Paint a whole pose: every layer of rig.parts(pose) through emit() with the pose's numbers (+ the whole-frame extras W). */
function paintPose(c, o, T, pose) {
  const J = resolveJ(T.rig.joints), rp = T.rig.parts(pose) || T.rig.parts(T.rest || 'idle');
  const W = o.dead ? T.dead : T.whole && T.whole[pose];
  const p = resetP(newP());
  p.pitch = rp.pitch; p.lift = rp.lift; p.lx = rp.lx; p.sq = rp.sq; p.head = rp.ha; p.hx = rp.hx; p.jaw = rp.ja;
  p.t0 = rp.ta0; p.t1 = rp.ta1; p.t2 = rp.ta2; p.aN = rp.arm[0]; p.aF = rp.arm[1]; p.pN = rp.pin[0]; p.pF = rp.pin[1];
  for (let i = 0; i < 8; i++) { p.L[i] = rp.la[i]; p.LS[i] = rp.ls[i]; }
  if (W) for (const k in W) { const v = W[k]; if (k === 'L') for (let i = 0; i < v.length; i++) p.L[i] += v[i]; else if (k === 'LS') for (let i = 0; i < v.length; i++) p.LS[i] = v[i]; else p[k] = (p[k] || 0) + v; }
  const list = [];
  emitWith(J, rp, p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
  for (const [nm, a, b, cc, d, e, f] of list) { c.save(); c.transform(a, b, cc, d, e, f); T.layer(c, o, nm); c.restore(); }
}
// A water frame: the base pose sunk by W.sink, cut at the waterline (y = 0): above in full colour, under as a dark-blue shape,
// then foam (W.foam = [x0, x1] where it breaks the surface), and W.fx(c, o, R) for splashes / sparks over it.
let TMP = null;
function tmpCtx(w, h) {
  if (!TMP || TMP.width < w || TMP.height < h) TMP = canvas(Math.max(w, TMP ? TMP.width : 0), Math.max(h, TMP ? TMP.height : 0));
  const g = TMP.getContext('2d', { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, w + 1, h + 1);
  return g;
}
function paintWater(c, o, T, W) {
  const R = o.R, cv = c.canvas, tr = c.getTransform(), [bw, bh, ax, ay] = T.box;
  // only the sprite's own corner of the (shared, maybe big) bake canvas: device px from the bake transform + the entry box
  const rw = Math.min(cv.width, Math.ceil(tr.e + (bw - ax) * tr.a) + 3), rh = Math.min(cv.height, Math.ceil(tr.f + (bh - ay) * tr.d) + 3);
  if (W.back) W.back(c, o, R);
  const g = tmpCtx(rw, rh);
  g.setTransform(tr); g.translate(0, W.sink);
  paintPose(g, o, T, W.base);
  c.save(); c.beginPath(); c.rect(-400, -400, 800, 400.3); c.clip(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(TMP, 0, 0, rw, rh, 0, 0, rw, rh); c.restore();
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = DEEPC; g.fillRect(0, 0, rw, rh); g.globalCompositeOperation = 'source-over';
  c.save(); c.beginPath(); c.rect(-400, 0.3, 800, 400); c.clip(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = W.dim ?? 0.5; c.drawImage(TMP, 0, 0, rw, rh, 0, 0, rw, rh); c.restore();
  if (W.foam) foam(c, R, W.foam[0], W.foam[1], W.drops ?? 3, W.fk || 1);
  if (W.wake) wake(c, R, W.foam[0], W.foam[1], 1);
  if (W.fx) W.fx(c, o, R);
}
function paintSea(c, o, T) {
  const dh = T.rig.joints.deadH, p = o.pose;
  if (isPart(p)) { if (o.dead && !(T.flat && T.flat.has(p))) onBack(c, dh, () => T.layer(c, o, p)); else T.layer(c, o, p); return; }
  if (o.dead) { onBack(c, dh, () => paintPose(c, o, T, T.rest || 'idle')); return; }
  const W = T.water && T.water[p];
  if (W) { paintWater(c, o, T, W); return; }
  paintPose(c, o, T, p);
}

// ================================================================ CRAB (r 7.7): red, front view, one big claw, eyes on stalks
const CRAB_OWN = '#e8402a';
function crabPal(o) {
  return { shell: pc(o, CRAB_OWN), dark: pc(o, '#9e2416', C.zskinD, C.charL), light: pc(o, '#ff8f6c', tone(C.zskin, 0.3), C.charL),
    belly: pc(o, '#f9c39a', tone(C.zskin, 0.4), C.charL), leg: pc(o, '#d8361f', tone(C.zskin, -0.1)), mouth: pc(o, MOUTH, '#7a5a4a', C.charL) };
}
// one leg: root under the shell, knee up and out, foot down on the ground (sd = +1 right side, -1 left side)
function crabLeg(c, R, col, sd, rx, ry, kx, ky, fx) {
  tube(c, [[sd * rx, ry], [sd * (rx + kx) / 2, ky - 0.5], [sd * kx, ky], [sd * (kx + (fx - kx) * 0.55), ky * 0.5], [sd * fx, -0.1]], 1.3, col, R, 0.6);
}
function crabLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = crabPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legsR': crabLeg(c, R, Pl.leg, 1, 6.4, -7.6, 12.4, -10.2, 16.6); crabLeg(c, R, Pl.leg, 1, 6.8, -6.2, 12, -8.2, 15); crabLeg(c, R, Pl.leg, 1, 6.4, -4.8, 10.8, -6.2, 12.8); return;
    case 'r:legsL': { const k = tone(Pl.leg, -0.1); crabLeg(c, R, k, -1, 6.4, -7.6, 12.2, -10, 16.2); crabLeg(c, R, k, -1, 6.8, -6.2, 11.8, -8, 14.6); crabLeg(c, R, k, -1, 6.4, -4.8, 10.6, -6, 12.4); return; }
    case 'r:eyes':
      for (const [x0, x1, y1, r] of [[-1.6, -2.4, -15, 1.75], [1.6, 2.6, -15.2, 1.95]]) {
        tube(c, [[x0, -11], [(x0 + x1) / 2, -13.2], [x1, y1]], 1.1, Pl.shell, R, 0.8);
        dab(c, x1, y1 - 0.9, r + 0.55, C.ink, R);
        eye(c, o, x1, y1 - 0.9, r, R, 0);
      }
      return;
    case 'r:body': {
      part(c, ring(0, -7.6, 8.4, 5.2, R, 0.08, 10, 0.05), Pl.shell, M, { lw: 1.5 });
      brush(c, [[-5.6, -4.4], [0, -3.4], [5.6, -4.4]], 1.8, Pl.belly, R, { taper: 0.3, dry: 0.4, bristles: 3 });
      if (!burnt) { for (const [x, y, r] of [[-3.8, -10.2, 0.9], [-0.4, -11.2, 1], [3.2, -10.4, 0.85], [5.4, -8.6, 0.6], [-5.8, -8.4, 0.6]]) dab(c, x, y, r, Pl.light, R);
        for (const x of [-6.6, 6.6]) brush(c, [[x, -9.8], [x * 1.12, -8.6]], 0.7, Pl.dark, R, { bristles: 2, dry: 0.2 }); }   // little spikes on the rim
      if (o.dead === 'dead') { brush(c, [[-0.6, -6.6], [1.2, -5.6], [3, -6.6]], 0.6, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); brush(c, [[1, -5.8], [1.4, -4.6]], 0.9, TONGUE, R, { bristles: 2, dry: 0 }); }
      else if (o.risen) zMouth(c, [[-0.4, -6.4], [1.2, -6.2], [2.8, -6.4]], R, 0.4);
      else brush(c, [[-0.6, -6.8], [1.2, -5.8], [3, -6.8]], 0.65, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // a little grin
      if (o.risen) ribs(c, -3.6, -7.6, 3, 3.6, 2.2, R);
      if (burnt) scorch(c, [[-2, -8, 1.4], [2.6, -7, 1]], R);
      band(c, o, CRAB_OWN, [[-6.6, -5.6], [-2, -4.6], [2, -4.6], [6.6, -5.6]], 1.9, R);
      return;
    }
    case 'r:armN': case 'r:armNS': {   // the big claw: arm up from the shoulder, the moving finger (open / shut: armNS), a fat palm, the fixed finger
      about(c, 11.6, -17, L === 'r:armNS' ? 0.06 : -0.5, () => crabLayer(c, o, 'r:fingN'));
      tube(c, [[5.8, -8.6], [8.8, -10.4], [10.2, -12.4]], 2.2, Pl.shell, R, 1);
      part(c, poly([[9.6, -12.4], [11.6, -11.8], [14.6, -13.2], [15.4, -15.4], [16.8, -19.4], [16.4, -20.8], [14.6, -18.4], [12.4, -17.6], [10, -16.2], [9.2, -14.2]], R, 0.15), Pl.shell, M, { lw: 1.4 });
      if (!burnt) { dab(c, 12.2, -14.6, 1.1, Pl.light, R); brush(c, [[15.6, -17.6], [16.2, -19.6]], 0.6, Pl.dark, R, { bristles: 1, dry: 0.2 }); }
      return;
    }
    case 'r:fingN':   // the moving finger, hinged at (11.6, -17)
      part(c, poly([[10.4, -16.4], [11.2, -19.4], [13.2, -22.4], [15.2, -22.4], [13.8, -20.2], [12.8, -17.4]], R, 0.12), Pl.shell, M, { lw: 1.2 });
      return;
    case 'r:armF': {   // the small claw (both fingers painted open)
      const col = tone(Pl.shell, -0.08);
      tube(c, [[-5.6, -8.4], [-8.2, -10.2], [-9.2, -11.8]], 1.7, col, R, 0.9);
      part(c, ring(-9.8, -13.4, 2.5, 2.2, R, 0.1, 8), col, M, { lw: 1.2 });
      part(c, poly([[-11.4, -14.4], [-12.8, -17.4], [-12, -18.4], [-10.4, -15.6]], R, 0.1), col, M, { lw: 1, sharp: true });
      part(c, poly([[-9, -15], [-8.4, -18.6], [-7.4, -18], [-7.6, -14.6]], R, 0.1), col, M, { lw: 1, sharp: true });
      return;
    }
  }
}
const CRAB = {
  layer: crabLayer,
  whole: { walk0: { L: [0.3, 0.3], lift: -0.5, pitch: 0.05 }, walk1: { L: [-0.3, -0.3], lift: -0.3, pitch: -0.05 } },
  water: {
    swim: { base: 'swimB', sink: 6.2, foam: [-8.6, 8.6], drops: 3 },
    pinchW: { base: 'pinch', sink: 5.6, foam: [-8.6, 8.6], drops: 4 },
  },
  rig: {
    driver: 'sea', q: 'crab',
    joints: { pivot: [0, -6], limbs: [[6.4, -6.2], [-6.4, -6.2], [0, -11.2]], arms: [[5.8, -8.6], [-5.6, -8.4]], swap: 1,   // swap: fN = the big claw shut (drawn instead of aN when the finger angle passes -0.22)
      plan: ['l1', 'l0', 'aF', 'body', 'l2', 'aN'], deadH: 16 },
    parts(pose) {
      if (pose === 'swim' || pose === 'pinchW') return null;
      const p = { l0: 'r:legsR', l1: 'r:legsL', l2: 'r:eyes', body: 'r:body', aN: 'r:armN', fN: 'r:armNS', aF: 'r:armF', code: code(pose), pin: [-0.4, 0] };
      if (pose === 'atk') { p.arm = [0.35, 0.3]; p.pin = [0.05, 0]; p.lift = -0.6; p.ka = -6; }   // snapping at it (an attack kicks the claw open, it snaps shut)
      else if (pose === 'pinch') { p.gait = 0; p.arm = [0.8, -0.15]; p.pin = [0.06, 0]; p.pitch = 0.1; p.lx = 1; p.ka = 8; p.kp = 2; }
      else if (pose === 'swimB') { p.gait = 0; p.arm = [-0.25, 0.3]; p.pin = [-0.55, 0]; p.la = [-0.45, 0.45, 0, 0, 0, 0, 0, 0]; }
      return sp(p);
    },
  },
};

// ================================================================ SHARK (r 14.3): grey back, white belly, a toothy grin
const SHARK_OWN = '#7d8ea5';
const SHK_BODY = [[-12, -15.2], [-4, -16.8], [6, -16.6], [15, -14.8], [21, -12.4], [25.4, -9.4], [25.2, -7.4], [20, -6.9], [12.6, -6.7], [10.2, -5.6], [6, -2.4], [-2, -1.6], [-9, -2.6], [-12.6, -4.4]];
const SHK_BELLY = [[-12.4, -5.6], [-4, -7.2], [4, -7.8], [10.8, -7.2], [10.2, -5.6], [6, -2.4], [-2, -1.6], [-9, -2.6], [-12.6, -4.4]];
const SHK_FIN = [[-6.4, -16.2], [-9.6, -25.6], [-8.6, -27.8], [-6.4, -26.4], [0.6, -16.6]];
const SHK_TAILP = [[-11, -15.4], [-16, -13.6], [-20.6, -11.6], [-21, -7.4], [-16, -5], [-11, -3.6]];
const SHK_TAIL = [[-19.6, -12.2], [-24, -16.6], [-29.8, -23.2], [-27.2, -15.6], [-25.6, -10.2], [-28.8, -1.8], [-24.4, -4.4], [-19.8, -7]];
function sharkPal(o) {
  return { skin: pc(o, SHARK_OWN), dark: pc(o, '#566579', C.zskinD, C.charL), belly: pc(o, '#f4f4ee', tone(C.zskin, 0.4), C.charL),
    teeth: pc(o, C.white, '#e8ecd2', C.charL), mouth: pc(o, MOUTH, '#7a5a4a', C.charL), gill: pc(o, '#4c5a6c', C.zskinD, C.ink) };
}
function sharkLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = sharkPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:tail':
      part(c, poly(SHK_TAIL, R, 0.2), Pl.skin, M, { lw: 1.5, sharp: true });
      if (!tip(c, o, SHARK_OWN, [[-27.4, -19.4], [-29.8, -23.2], [-27.2, -18], [-27, -16.6]], M, 0.8) && !burnt) brush(c, [[-22, -13], [-26.6, -18.4]], 0.7, Pl.dark, R, { bristles: 1, dry: 0.3 });
      return;
    case 'r:tailP':
      partEdges(c, poly(SHK_TAILP, R, 0.2), [[0, 2], [3, 5]], Pl.skin, M);
      fill(c, poly([[-11.2, -5.4], [-16, -6.4], [-20.4, -7.8], [-21, -7.4], [-16, -5], [-11, -3.8]], R, 0.1), Pl.belly, R, { edge: 0 });
      return;
    case 'r:jaw':   // the lower jaw (behind the body), the mouth inside it shows when it drops
      fill(c, poly([[11, -6.8], [24, -7.4], [23.4, -10.6], [13.4, -9.8]], R, 0.15), Pl.mouth, R, { edge: 0 });
      part(c, poly([[10.4, -6.8], [16, -6.6], [22.4, -6.8], [21.8, -4.8], [16, -3.2], [11, -3.8]], R, 0.15), Pl.belly, M, { lw: 1.25 });
      teeth(c, 13, 21.6, -6.7, 4, 1.4, -1, Pl.teeth, R, 0.85);
      if (o.dead === 'dead') brush(c, [[15, -6], [19, -4.6]], 1.2, TONGUE, R, { bristles: 2, dry: 0 });
      return;
    case 'r:body': {
      part(c, poly(SHK_FIN, R, 0.2), Pl.skin, M, { lw: 1.45, sharp: true });
      tip(c, o, SHARK_OWN, [[-8.4, -21.6], [-9.6, -25.6], [-8.6, -27.8], [-6.4, -26.4], [-4.2, -21.2]], M);
      fill(c, shift(SHK_BODY, M.mx, M.my, M.grow), Pl.skin, R);
      fill(c, shift(poly(SHK_BELLY, R, 0.15), M.mx, M.my), Pl.belly, R, { edge: 0 });
      inkLine(c, SHK_BODY, 1.6, R);   // open at the rear: the tail piece goes on from there
      teeth(c, 12.6, 24.4, -7.1, 6, 1.5, 1, Pl.teeth, R, 0.9);   // the grin: teeth over the lower jaw
      brush(c, [[12.4, -6.8], [18, -7], [24.6, -7.6]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
      for (const x of [7.6, 9.4, 11.2]) brush(c, [[x, -13.4], [x + 0.6, -11.2], [x + 0.2, -9]], 0.55, Pl.gill, R, { bristles: 1, dry: 0.1 });
      if (!burnt) brush(c, [[-8, -15.4], [2, -16], [12, -14.4]], 0.9, tone(Pl.skin, 0.25), R, { bristles: 2, dry: 0.5, taper: 0.5 });
      dab(c, 23.2, -10.6, 0.4, C.ink, R);
      eye(c, o, 17.4, -11.4, 1.35, R, 1.2);
      if (o.risen && !o.dead) zMouth(c, [[15, -6.8], [18, -6.9], [21, -7.1]], R, 0.45);
      if (o.risen) ribs(c, -4, -9.4, 3, 5, 2.6, R);
      if (burnt) scorch(c, [[-2, -11, 2], [8, -10, 1.6]], R);
      return;
    }
    case 'r:pec': part(c, poly([[6.6, -6.4], [3, -2], [-0.8, 0.6], [1.2, -3.4], [3.4, -6.6]], R, 0.15), Pl.skin, M, { lw: 1.25 }); return;
  }
}
const SHARK = {
  layer: sharkLayer,
  whole: { walk0: { t0: 0.22, t1: -0.15, pitch: 0.05, head: 0 }, walk1: { t0: -0.2, t1: 0.18, pitch: -0.05 }, flop: { t0: -0.3, t1: -0.25, pitch: -0.08, lift: -1 } },
  water: {
    fin0: { base: 'finB0', sink: 16, foam: [-9.6, 0.6], drops: 2, wake: true, dim: 0.42 },
    fin1: { base: 'finB1', sink: 16.2, foam: [-9.4, 0.8], drops: 2, wake: true, dim: 0.42 },
    lunge: { base: 'lungeB', sink: 3, foam: [-13, 3], drops: 5, fx: (c, o, R) => splash(c, R, -6, 11, 9) },
    drag: { base: 'dragB', sink: 13, foam: [-16, 8], drops: 7, dim: 0.42, fx: (c, o, R) => { splash(c, R, 9, 9, 8); splash(c, R, -22, 5, 5); } },
  },
  rig: {
    driver: 'sea', q: 'shark',
    joints: { pivot: [2, -9], tail: [[-11.4, -9.4], [-20, -9.4]], head: [11, -9], jaw: [11.2, -6.4], limbs: [[5, -6]], plan: ['tail', 'head', 'body', 'l0'], deadH: 18 },
    parts(pose) {
      if (pose === 'fin0' || pose === 'fin1' || pose === 'lunge' || pose === 'drag') return null;
      const p = { t0: 'r:tailP', t1: 'r:tail', jaw: 'r:jaw', body: 'r:body', l0: 'r:pec', code: code(pose) };
      if (pose === 'atk') { p.ja = 0.5; p.pitch = -0.06; p.kh = 2; }
      else if (pose === 'flop') { p.gait = 4; p.ja = 0.25; }
      else if (pose === 'lungeB') { p.gait = 0; p.pitch = -0.55; p.lift = -5; p.ja = 0.62; p.ta0 = 0.18; p.ta1 = 0.25; p.la = [0.5, 0, 0, 0, 0, 0, 0, 0]; }
      else if (pose === 'dragB') { p.gait = 0; p.pitch = 0.32; p.ja = 0.3; p.ta0 = -0.35; p.ta1 = -0.4; p.lift = -3; }
      else if (pose === 'finB0') { p.gait = 0; p.ta0 = 0.1; p.ta1 = -0.58; }   // the tail fin tipped down under the water: one fin shows
      else if (pose === 'finB1') { p.gait = 0; p.ta0 = -0.14; p.ta1 = -0.36; }
      return sp(p);
    },
  },
};

// ================================================================ OCTOPUS (r 13.2): purple, a big soft head, six curly tentacles
const OCTO_OWN = '#9b4fc8';
// tentacles: [root x, root y, mid, tip, curl sign] painted from under the head out to a curled tip on the ground
const TENT = [
  [-4.4, -10.4, [-9, -6], [-14.6, -3.2], 1], [0.4, -10.8, [-1, -5], [-3.4, -1.2], 1], [4.6, -10.4, [9.4, -6], [14.8, -3.6], -1],   // back row
  [-3, -9.8, [-6.6, -4.6], [-10.6, -1.2], 1], [1.2, -9.6, [2.4, -4.4], [4.4, -0.6], -1], [5.4, -9.8, [8, -5], [11.4, -1.2], -1],   // front row
];
function octoPal(o) {
  return { skin: pc(o, OCTO_OWN), far: pc(o, tone(OCTO_OWN, -0.2), tone(C.zskin, -0.2)), light: pc(o, '#c88ae8', tone(C.zskin, 0.3), C.charL),
    sucker: pc(o, '#f6d6ee', '#e8ecd2', C.charL), mouth: pc(o, MOUTH, '#7a5a4a', C.charL), ink: '#221a2c' };
}
function tentacle(c, o, R, M, Pl, i) {
  const [rx, ry, mid, tp, sg] = TENT[i], far = i < 3, col = far ? Pl.far : Pl.skin;
  // centre line: root -> mid -> tip, then a curl at the tip
  const ex = tp[0] + sg * 1.6, pts = [[rx, ry], [lerp(rx, mid[0], 0.6), lerp(ry, mid[1], 0.6)], mid, [lerp(mid[0], tp[0], 0.6), lerp(mid[1], tp[1], 0.6)], tp, [ex, tp[1] - 1.8], [ex - sg * 0.6, tp[1] - 3]];
  strip(c, pts, [4.2, 3.7, 3.1, 2.5, 1.9, 1.3, 0.7], col, M, 1, { lw: 1.05 });
  if (o.dead !== 'burnt') for (let k = 1; k <= 3; k++) { const [x, y] = pts[k + 1]; dab(c, x - sg * 0.3, y + 0.9, 0.5, Pl.sucker, R); }
}
function octoLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = octoPal(o), burnt = o.dead === 'burnt';
  if (L === 'r:tentB') { for (let i = 0; i < 3; i++) tentacle(c, o, R, M, Pl, i); return; }   // the back row, one part
  if (L.startsWith('r:tent')) { tentacle(c, o, R, M, Pl, L.charCodeAt(6) - 48); return; }
  switch (L) {
    case 'r:body': case 'r:bodyA': case 'r:bodyI': {
      const angry = L === 'r:bodyA', squint = L === 'r:bodyI';
      part(c, poly([[-7.8, -14], [-8.6, -20], [-6, -25.6], [0.4, -28.2], [6.6, -26], [9.4, -20.4], [8.4, -14], [5.6, -10.4], [0.6, -9.4], [-4.6, -10.4]], R, 0.25), Pl.skin, M, { lw: 1.6 });
      if (!burnt) for (const [x, y, r] of [[-4.6, -23, 1.2], [-1.6, -25.6, 0.9], [-5.6, -18, 0.9], [5.4, -23.8, 0.8]]) dab(c, x, y, r, Pl.light, R);
      if (squint && !o.dead) { for (const x of [-0.6, 4]) brush(c, [[x - 1.6, -16.4], [x, -15.4], [x + 1.6, -16.4]], 0.75, C.ink, R, { bristles: 2, dry: 0 }); }
      else { eye(c, o, -0.6, -16.2, 1.9, R, angry ? 1.2 : 0); eye(c, o, 4, -16.4, 2.05, R, angry ? 1.2 : 0); }
      if (o.dead === 'dead') brush(c, [[0.6, -12.6], [2.6, -12], [4.4, -12.6]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
      else if (o.risen) zMouth(c, [[0.6, -12.6], [2.2, -12.4], [3.8, -12.6]], R, 0.4);
      else if (angry || squint) { dab(c, 2.4, -12.2, 1.1, C.ink, R); dab(c, 2.4, -12.1, 0.55, Pl.mouth, R); }   // an 'o' mouth
      else brush(c, [[0.6, -12.8], [2.4, -11.8], [4.2, -12.8]], 0.65, C.ink, R, { bristles: 2, dry: 0 });
      if (o.risen) ribs(c, -3.4, -20.4, 3, 4, 2.4, R);
      if (burnt) scorch(c, [[-2, -21, 1.8], [3, -19, 1.4]], R);
      band(c, o, OCTO_OWN, [[-8.2, -20.6], [-3, -21.8], [3, -22], [9, -20.8]], 2.1, R, [[-7.8, -20.4], [-10.4, -18.4]]);
      return;
    }
    case 'r:inkpuff':   // squirted out behind it: black blobs + a trail
      for (const [x, y, r] of [[-11.6, -11.6, 3.2], [-15, -9.6, 2.6], [-13.2, -14.4, 2.2], [-17.4, -12.4, 1.8]]) { dab(c, x, y, r + 0.5, C.ink, R); dab(c, x - 0.2, y - 0.2, r, Pl.ink, R); }
      brush(c, [[-7.6, -12.8], [-10, -12.2]], 1.6, Pl.ink, R, { bristles: 2, dry: 0.2 });
      return;
    case 'r:tseg':   // a tentacle piece for drawUnit (along +x from 0 to 6, centred on y = 0), suckers under it
      // no ink at the ends (pieces overlap into one tentacle): a colour band with an ink line along each edge, suckers under it
      brush(c, [[-0.5, 0], [6.5, 0]], 3, Pl.skin, R, { bristles: 3, dry: 0, taper: 0, vary: 0.1, swell: 0 });
      for (const y of [-1.9, 1.9]) brush(c, [[-0.2, y], [6.2, y]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0, swell: 0 });
      if (!burnt) { dab(c, 1.6, 0.8, 0.5, Pl.sucker, R); dab(c, 4.6, 0.8, 0.5, Pl.sucker, R); }
      return;
    case 'r:tcoil': {   // a loop wrapped round a held unit (drawn at its middle, scaled to its size)
      const pts = []; for (let i = 0; i <= 12; i++) { const a = 2.4 - i / 12 * 4.6; pts.push([Math.cos(a) * 5.4, Math.sin(a) * 2.2 + i * 0.1]); }   // round the front of its waist, centred on (0, 0)
      brush(c, pts, 3.6, C.ink, R, { bristles: 3, dry: 0, taper: 0.5 });
      brush(c, pts, 2.3, Pl.skin, R, { bristles: 3, dry: 0.1, taper: 0.55 });
      if (o.dead !== 'burnt') { dab(c, -1.6, 2.6, 0.45, Pl.sucker, R); dab(c, 1.8, 2.4, 0.45, Pl.sucker, R); }
      return;
    }
  }
}
const OCT_PARTS = ['r:tentB', 'r:tent3', 'r:tent4', 'r:tent5', 'r:body', 'r:bodyA', 'r:bodyI', 'r:inkpuff'];
const OCTOPUS = {
  layer: octoLayer, flat: new Set(['r:tseg', 'r:tcoil']),
  whole: { walk0: { L: [0.1, -0.18, 0.14, -0.16], lift: -0.4, sq: 0.03 }, walk1: { L: [-0.1, 0.18, -0.14, 0.16], sq: -0.03 } },
  water: {
    swim: { base: 'swimB', sink: 10.6, foam: [-9, 9.6], drops: 3 },
    grabW: { base: 'grab', sink: 10, foam: [-9, 9.6], drops: 5 },
    inkW: { base: 'ink', sink: 10, foam: [-9, 9.6], drops: 3 },
  },
  rig: {
    driver: 'sea', q: 'octopus',
    joints: { pivot: [0.4, -9.6], limbs: [[0.4, -10.6], [TENT[3][0], TENT[3][1]], [TENT[4][0], TENT[4][1]], [TENT[5][0], TENT[5][1]]], plan: ['bfx', 'l0', 'body', 'l1', 'l2', 'l3'], deadH: 28 },
    parts(pose) {
      if (pose === 'swim' || pose === 'grabW' || pose === 'inkW') return null;
      const p = { l0: 'r:tentB', l1: 'r:tent3', l2: 'r:tent4', l3: 'r:tent5', body: 'r:body', code: code(pose) };
      if (pose === 'atk') { p.body = 'r:bodyA'; p.la = [-0.12, 0, -0.35, -0.6, 0, 0, 0, 0]; p.pitch = 0.06; }
      else if (pose === 'grab') { p.gait = 0; p.body = 'r:bodyA'; p.la = [-0.2, 0.15, -0.5, -0.9, 0, 0, 0, 0]; p.pitch = 0.08; p.sq = 0.05; p.ksq = 2; }
      else if (pose === 'ink') { p.gait = 0; p.body = 'r:bodyI'; p.bfx = 'r:inkpuff'; p.sq = -0.12; p.pitch = -0.1; p.lx = -1; p.la = [0.2, 0.3, 0.2, 0.3, 0, 0, 0, 0]; p.ksq = -4; }
      else if (pose === 'swimB') { p.gait = 0; p.la = [0.06, 0.45, 0.1, -0.5, 0, 0, 0, 0]; }
      return sp(p);
    },
  },
};

// ================================================================ PUFFER (r 7.7): yellow with brown spots, puffs into a spiky ball
const PUFF_OWN = '#ffd23a';
function pufPal(o) {
  return { skin: pc(o, PUFF_OWN), spot: pc(o, '#a8642a', C.zskinD, C.charL), belly: pc(o, '#fff6d8', tone(C.zskin, 0.4), C.charL),
    fin: pc(o, '#f29a2c', tone(C.zskin, -0.15)), lip: pc(o, '#f07a8a', '#b98a6a', C.charL), spike: pc(o, '#fff3cc', '#e8ecd2', C.charL) };
}
function pufLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = pufPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:tail': case 'r:tailP': {
      const dx = L === 'r:tailP' ? -2.6 : 0, dy = L === 'r:tailP' ? -3.6 : 0, P = [[-6.4, -7.2], [-11.2, -10.6], [-10.4, -6.2], [-11.2, -1.8], [-6.4, -5.2]].map(([x, y]) => [x + dx, y + dy]);
      part(c, poly(P, R, 0.15), Pl.fin, M, { lw: 1.15, sharp: true });
      tip(c, o, PUFF_OWN, [[-9.4 + dx, -9.4 + dy], [-11.2 + dx, -10.6 + dy], [-10.4 + dx, -6.2 + dy], [-11.2 + dx, -1.8 + dy], [-9.4 + dx, -3 + dy]], M, 0.8);
      return;
    }
    case 'r:fin': case 'r:finP': {
      const dx = L === 'r:finP' ? 1.6 : 0, dy = L === 'r:finP' ? -2.8 : 0;
      part(c, poly([[0.9 + dx, -5.6 + dy], [-1.4 + dx, -3 + dy], [-3.6 + dx, -2.4 + dy], [-3.2 + dx, -4.4 + dy], [-1 + dx, -6.4 + dy]], R, 0.1), Pl.fin, M, { lw: 0.75 });
      brush(c, [[0.4 + dx, -5.4 + dy], [-2.6 + dx, -3.2 + dy]], 0.4, tone(Pl.fin, -0.35), R, { bristles: 1, dry: 0.3 });
      return;
    }
    case 'r:body': case 'r:bodyO': {
      part(c, poly([[-3.4, -10.6], [-1, -12.6], [0.8, -11]], R, 0.1), Pl.fin, M, { lw: 0.85, sharp: true });   // a little back fin
      part(c, ring(0, -6.2, 7.4, 5.6, R, 0.07, 10), Pl.skin, M, { lw: 1.2 });
      fill(c, poly([[-5.6, -3.6], [0, -2.2], [5.8, -3.4], [4.6, -1.4], [0, -0.6], [-4.6, -1.6]], R, 0.1), Pl.belly, R, { edge: 0 });
      if (!burnt) for (const [x, y, r] of [[-3.6, -8.8, 0.8], [-1, -10, 0.7], [-4.4, -5.6, 0.65], [-1.6, -6.8, 0.6], [1.4, -9.6, 0.55]]) dab(c, x, y, r, Pl.spot, R);
      eye(c, o, 3.4, -7.6, 1.95, R, L === 'r:bodyO' ? 0.8 : 0);
      if (o.dead === 'dead') brush(c, [[6.4, -5.2], [7.6, -4.4]], 0.9, TONGUE, R, { bristles: 2, dry: 0 });
      if (L === 'r:bodyO') { dab(c, 7, -5, 1.9, C.ink, R); dab(c, 7.1, -5, 1.2, MOUTH, R); teeth(c, 6.2, 8, -6.2, 2, 0.7, 1, C.white, R, 0.5); }   // a gaping bite
      else { dab(c, 7.2, -5.2, 1.2, C.ink, R); dab(c, 7.3, -5.2, 0.75, Pl.lip, R); }   // puckered lips
      if (o.risen) ribs(c, -3, -6.4, 3, 3.6, 2, R);
      if (burnt) scorch(c, [[-1, -7, 1.6]], R);
      band(c, o, PUFF_OWN, [[-4.4, -10.8], [-5, -6.2], [-4.2, -1.6]], 1.6, R);
      return;
    }
    case 'r:ball': {   // puffed: a round spiky ball (spikes first, then the ball over their roots)
      const cx = 0, cy = -9.4, r0 = 8.8;
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.11, ca = Math.cos(a), sa = Math.sin(a), x0 = cx + ca * (r0 - 1.2), y0 = cy + sa * (r0 - 1.2);
        part(c, poly([[x0 - sa * 1.3, y0 + ca * 1.3], [cx + ca * (r0 + 3.4), cy + sa * (r0 + 3.4)], [x0 + sa * 1.3, y0 - ca * 1.3]], R, 0.08), Pl.spike, M, { lw: 0.85, sharp: true }); }
      part(c, ring(cx, cy, r0, r0 * 0.96, R, 0.05, 12), Pl.skin, M, { lw: 1.4 });
      fill(c, poly([[-6.6, -4.6], [0, -1.4], [6.6, -4.6], [4, -2], [0, -0.9], [-4, -2]], R, 0.1), Pl.belly, R, { edge: 0 });
      if (!burnt) for (const [x, y, r] of [[-4.6, -12.4, 1.1], [-1.2, -14.6, 0.9], [-5.6, -8, 0.9], [-2.4, -10, 0.8], [1.6, -12.8, 0.7], [-3, -5.6, 0.7]]) dab(c, x, y, r, Pl.spot, R);
      eye(c, o, 4, -11.6, 2.5, R, 1.4);
      dab(c, 8.4, -8.4, 1.5, C.ink, R); dab(c, 8.5, -8.4, 0.9, Pl.lip, R);
      if (o.risen) ribs(c, -3.6, -9.4, 3, 5, 2.4, R);
      band(c, o, PUFF_OWN, [[-5.6, -15.6], [-7.8, -9.4], [-5.8, -3.4]], 1.8, R);
      return;
    }
  }
}
const PUFFER = {
  layer: pufLayer,
  whole: { walk0: { lift: -2.6, sq: 0.08, pitch: -0.1 }, walk1: { lift: 0, sq: -0.07, pitch: 0.06 } },
  water: {
    swim: { base: 'swimB', sink: 5, foam: [-7.6, 7.4], drops: 2, wake: true },
    puffW: { base: 'puff', sink: 6.4, foam: [-9.4, 9.4], drops: 3 },
  },
  rig: {
    driver: 'sea', q: 'puffer',
    joints: { pivot: [0, -5], tail: [[-6.4, -6.2]], limbs: [[0.6, -5.6]], plan: ['tail', 'body', 'l0'], deadH: 13 },
    parts(pose) {
      if (pose === 'swim' || pose === 'puffW') return null;
      const p = { t0: 'r:tail', body: 'r:body', l0: 'r:fin', code: code(pose) };
      if (pose === 'puff') { p.t0 = 'r:tailP'; p.body = 'r:ball'; p.l0 = 'r:finP'; p.ksq = 9; p.kb = -30; }
      else if (pose === 'atk') { p.body = 'r:bodyO'; p.pitch = 0.12; p.lx = 1.2; p.kp = 2; }
      else if (pose === 'swimB') { p.gait = 0; p.ta0 = 0.15; p.la = [0.4, 0, 0, 0, 0, 0, 0, 0]; }
      return sp(p);
    },
  },
};

// ================================================================ EEL (r 6.6): dark green, a yellow spark stripe, long and wavy
const EEL_OWN = '#2c6e3f';
function eelPal(o) {
  return { skin: pc(o, EEL_OWN), belly: pc(o, '#9bcf6c', tone(C.zskin, 0.35), C.charL), stripe: pc(o, '#ffe23a', tone(C.zskin, 0.45), C.charL),
    fin: pc(o, '#4f9a52', tone(C.zskin, -0.1)), eyeW: pc(o, '#fff27a', MILK, C.charL), mouth: pc(o, MOUTH, '#7a5a4a', C.charL), teeth: pc(o, C.white, '#e8ecd2', C.charL) };
}
// a body piece along x from x0 to x1 (centre y -4), widths w0 -> w1, the spark zigzag on it, a fin ridge over it
function eelPiece(c, o, R, M, Pl, x0, x1, w0, w1, tipEnd) {
  const pts = [[x0, -4], [(x0 + x1) / 2, -4.15], [x1, -4]], ws = [w0, (w0 + w1) / 2, w1];
  brush(c, [[x0, -4 - w0 / 2 - 0.2], [x1, -4 - w1 / 2 - 0.2]], 1.1, Pl.fin, R, { bristles: 2, dry: 0.3, taper: 0 });   // the fin ridge
  strip(c, pts, ws, Pl.skin, M, tipEnd ? 1 : 0, { lw: 1.2 });
  brush(c, [[x0, -4 + w0 * 0.28], [x1, -4 + w1 * 0.28]], Math.min(w0, w1) * 0.32, Pl.belly, R, { bristles: 2, dry: 0.4, taper: 0.1 });
  if (o.dead !== 'burnt') { const n = Math.max(2, Math.round((x1 - x0) / 2.6)), Z = []; for (let i = 0; i <= n; i++) Z.push([lerp(x0, x1, i / n), -4.4 + (i & 1 ? 0.9 : -0.7)]); brush(c, Z, 0.75, Pl.stripe, R, { bristles: 2, dry: 0.1, taper: 0 }); }
}
function eelLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = eelPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:seg2': eelPiece(c, o, R, M, Pl, -24, -15.4, 1.4, 3.8, true); part(c, poly([[-21, -4.6], [-25.6, -6.6], [-26.4, -3.4], [-21.6, -3.2]], R, 0.1), Pl.fin, M, { lw: 0.9, sharp: true }); return;
    case 'r:seg1': eelPiece(c, o, R, M, Pl, -16.2, -7.6, 3.8, 4.8); return;
    case 'r:seg0': eelPiece(c, o, R, M, Pl, -8.4, 0.4, 4.8, 5.4); return;
    case 'r:body': eelPiece(c, o, R, M, Pl, -0.4, 9, 5.4, 5.6); if (o.risen) ribs(c, 1.4, -4, 3, 3.6, 2.2, R); if (burnt) scorch(c, [[4, -4, 1.4]], R); return;
    case 'r:jaw':
      fill(c, poly([[10, -4.4], [18.6, -4.6], [17.8, -7.4], [11.4, -6.4]], R, 0.1), Pl.mouth, R, { edge: 0 });
      part(c, poly([[9.6, -3.8], [14, -3.6], [18.4, -3.8], [17.6, -2.2], [13, -1.2], [9.8, -1.6]], R, 0.1), Pl.belly, M, { lw: 1.05 });
      teeth(c, 11.6, 17.6, -3.8, 3, 1, -1, Pl.teeth, R, 0.7);
      return;
    case 'r:head': {
      partEdges(c, poly([[8.4, -6.8], [12, -7.6], [16.4, -7.2], [19.4, -5.4], [19.4, -4.2], [14.6, -3.9], [10.6, -3.6], [8.4, -1.4]], R, 0.15), [[0, 7]], Pl.skin, M, { lw: 1.35 });
      teeth(c, 11.2, 18.4, -4, 4, 1.1, 1, Pl.teeth, R, 0.7);
      eye(c, o, 15.2, -5.7, 1.25, R, 1, Pl.eyeW);
      if (o.risen && !o.dead) zMouth(c, [[12, -4], [14.4, -4], [16.8, -4.2]], R, 0.4);
      band(c, o, EEL_OWN, [[9.2, -7.4], [9.6, -4.4], [9.4, -1.2]], 1.7, R);
      return;
    }
    case 'r:glow': case 'r:glowW': {   // a yellow halo round the body, behind it (glowW: round the part out of the water)
      const ys = L === 'r:glowW' ? -6.4 : -4;
      brush(c, [[-25, ys + 0.4], [-12, ys - 0.8], [0, ys], [10, ys - 0.8], [20.6, ys - 0.6]], 8.4, '#fff27a', R, { bristles: 7, dry: 0.45, taper: 0.5, vary: 0.05 });
      return;
    }
    case 'r:zap': case 'r:zapW': {   // crackling arcs off it, in front (zapW: round the part out of the water)
      const ys = L === 'r:zapW' ? -6.4 : -4;
      for (let i = 0; i < 5; i++) {
        const x = -18 + i * 8.6 + (R() - 0.5) * 2, up = i & 1 ? -1 : 1, Z = [[x, ys - up * 2.6]];
        for (let k = 1; k < 4; k++) Z.push([x + (k & 1 ? 2.2 : -2.2) + (R() - 0.5) * 1.4, ys - up * (2.6 + k * 2.8)]);
        brush(c, Z, 1.7, C.ink, R, { bristles: 2, dry: 0, taper: 0.4, per: 2 }); brush(c, Z, 1, C.yellow, R, { bristles: 2, dry: 0, taper: 0.4, per: 2 });
      }
      spark(c, 21.6, ys - 2.4, 2.4, R); spark(c, -26, ys - 1.4, 2, R);
      return;
    }
  }
}
const EEL = {
  layer: eelLayer,
  whole: { walk0: { t0: 0.22, t1: -0.3, t2: 0.3, head: -0.12 }, walk1: { t0: -0.22, t1: 0.3, t2: -0.3, head: 0.12 }, flop: { t0: -0.3, t1: 0.25, t2: -0.3, head: 0.1 } },
  water: {
    swim0: { base: 'swimB0', sink: 5.6, dim: 0.45, fx: (c, o, R) => { foam(c, R, -10, -4, 1, 0.8); foam(c, R, 8, 16, 1, 0.9); wake(c, R, -22, 18, 1); } },
    swim1: { base: 'swimB1', sink: 5.6, dim: 0.45, fx: (c, o, R) => { foam(c, R, -19, -13, 1, 0.8); foam(c, R, 1, 7, 1, 0.8); foam(c, R, 11, 17, 1, 0.8); wake(c, R, -22, 18, 1); } },
    shockW: { base: 'shockB', sink: 4.4, foam: [-12, 12], drops: 5, back: (c, o, R) => eelLayer(c, o, 'r:glowW'), fx: (c, o, R) => eelLayer(c, o, 'r:zapW') },
    biteW: { base: 'biteB', sink: 6.6, foam: [-6, 13], drops: 4 },
  },
  rig: {
    driver: 'sea', q: 'eel',
    joints: { pivot: [4, -4], tail: [[-0.2, -4], [-8, -4], [-15.8, -4]], head: [8.8, -4], jaw: [10.4, -4], plan: ['bfx', 'tail', 'body', 'head', 'b2'], deadH: 9 },
    parts(pose) {
      if (pose === 'swim0' || pose === 'swim1' || pose === 'biteW' || pose === 'shockW') return null;
      const p = { t0: 'r:seg0', t1: 'r:seg1', t2: 'r:seg2', body: 'r:body', head: 'r:head', jaw: 'r:jaw', code: code(pose), ta0: 0.14, ta1: -0.24, ta2: 0.26, ha: -0.06 };
      if (pose === 'atk') { p.ja = 0.45; p.ha = -0.1; p.kh = -2; }
      else if (pose === 'flop') { p.gait = 4; p.ja = 0.3; }
      else if (pose === 'shock') { p.gait = 0; p.bfx = 'r:glow'; p.b2 = 'r:zap'; p.shake = 0.08; p.ta0 = 0.12; p.ta1 = -0.2; p.ta2 = 0.25; p.kt = 4; }
      else if (pose === 'shockB') { p.gait = 0; p.pitch = -0.32; p.lift = -3; p.ha = -0.2; p.ja = 0.35; p.ta0 = 0.3; p.ta1 = 0.2; p.ta2 = -0.2; }
      else if (pose === 'biteB') { p.gait = 0; p.pitch = -0.34; p.lift = -1; p.ja = 0.55; p.ha = 0.12; p.ta0 = 0.2; p.ta1 = 0.1; }
      else if (pose === 'swimB0') { p.gait = 0; p.ta0 = 0.26; p.ta1 = -0.42; p.ta2 = 0.42; p.ha = -0.18; p.pitch = -0.08; }
      else if (pose === 'swimB1') { p.gait = 0; p.ta0 = -0.26; p.ta1 = 0.42; p.ta2 = -0.42; p.ha = 0.08; p.pitch = 0.08; }
      return sp(p);
    },
  },
};

// ================================================================ TURTLE (r 12.1): green, a brown shell, pulls into it
const TURT_OWN = '#6fbf4c';
const TUR_SHELL = [[-13.8, -5.4], [-12.4, -11.4], [-6.6, -16.4], [1, -17.6], [7.6, -15.2], [11.6, -10.4], [12.6, -5.4]];
function turPal(o) {
  return { skin: pc(o, TURT_OWN), far: pc(o, tone(TURT_OWN, -0.3), tone(C.zskin, -0.28)), shell: pc(o, '#8a5a2a', tone(C.zskin, -0.15)), plate: pc(o, '#b07a3a', tone(C.zskin, 0.1), C.charL),
    rim: pc(o, '#d9a84a', tone(C.zskin, 0.3), C.charL), belly: pc(o, '#f2dc9a', tone(C.zskin, 0.4), C.charL), mouth: pc(o, MOUTH, '#7a5a4a', C.charL) };
}
function turLeg(c, R, M, x, col, far) { tube(c, [[x, -6.6], [x + 0.6, -3.2], [x + 1.2, -0.6]], far ? 3.2 : 3.6, col, R, 1.2); for (let i = 0; i < 3; i++) dab(c, x + 0.4 + i * 1.05, -0.5, 0.45, C.white, R); }
function turLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = turPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legNF': turLeg(c, R, M, 6.6, Pl.skin, false); return;
    case 'r:legNH': turLeg(c, R, M, -8.8, Pl.skin, false); return;
    case 'r:legFF': turLeg(c, R, M, 4, Pl.far, true); return;
    case 'r:legFH': turLeg(c, R, M, -11.4, Pl.far, true); return;
    case 'r:tail': part(c, poly([[-12.6, -7.2], [-17.4, -5.2], [-12.6, -4.6]], R, 0.1), Pl.skin, M, { lw: 1.1, sharp: true }); return;
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO' || o.dead === 'dead';
      tube(c, [[8.6, -7.8], [11.6, -9.2], [14.2, -10]], 4, Pl.skin, R, 1.2);
      if (open) fill(c, poly([[16.6, -9.6], [21.2, -9.8], [20.4, -6.8], [17, -8.2]], R, 0.1), Pl.mouth, R, { edge: 0 });
      part(c, poly([[13.4, -12], [16.4, -14], [19.6, -13.2], [21.4, -10.8], [21, -9.4], [17.4, -9], [14, -8.4]], R, 0.15), Pl.skin, M, { lw: 1.35 });
      if (open) part(c, poly([[16, -8.6], [20.6, -8.8], [19.6, -6.6], [16.4, -7.2]], R, 0.1), Pl.skin, M, { lw: 1.05 });
      else brush(c, [[16.6, -9.8], [18.8, -9.2], [20.8, -9.8]], 0.6, C.ink, R, { bristles: 2, dry: 0 });   // a smile
      eye(c, o, 17.6, -11.6, 1.35, R, open ? 0.8 : 0);
      dab(c, 20.6, -11.8, 0.35, C.ink, R);
      if (o.risen && !o.dead) zMouth(c, [[17, -9.6], [18.8, -9.4], [20.6, -9.8]], R, 0.4);
      return;
    }
    case 'r:body': {
      turLayer(c, o, 'r:tail');   // the little tail, behind the shell
      fill(c, poly([[-12.4, -5.4], [0, -4.6], [11.4, -5.4], [10.4, -3.4], [0, -2.8], [-11.2, -3.6]], R, 0.1), Pl.belly, R, { edge: 0 });   // the belly plate under the rim
      part(c, poly(TUR_SHELL, R, 0.2), Pl.shell, M, { lw: 1.7 });
      if (!burnt) for (const [x, y, r] of [[-6, -10.6, 2.6], [0.6, -12.6, 2.8], [6.4, -9.6, 2.3], [-1.4, -7.6, 1.6], [-9.6, -7.6, 1.4]]) part(c, ring(x, y, r, r * 0.8, R, 0.12, 6), Pl.plate, M, { lw: 0.8 });
      brush(c, [[-13.6, -5.6], [-6, -5], [3, -5], [12.6, -5.6]], 1.9, teamOf(o, TURT_OWN) ? (burnt ? C.charL : o.col) : Pl.rim, R, { taper: 0.1, dry: 0.15, bristles: 4 });   // the rim (team colour in Team battle)
      if (teamOf(o, TURT_OWN) && !burnt) brush(c, [[-13, -4.2], [0, -3.8], [12, -4.2]], 0.7, C.white, R, { bristles: 2, dry: 0.2, taper: 0 });
      if (o.risen) ribs(c, -5, -10, 3, 5, 3, R);
      if (burnt) scorch(c, [[-4, -11, 2], [4, -9, 1.6]], R);
      return;
    }
    case 'r:peek':   // in its shell: two eyes peeking out of the dark front opening
      fill(c, ring(11, -8.4, 2.6, 2.4, R, 0.1, 8), '#2a1d12', R, { edge: 0 });
      if (!o.dead) { dab(c, 10.6, -8.8, 0.85, C.white, R); dab(c, 12.2, -8.6, 0.85, C.white, R); dab(c, 10.9, -8.7, 0.4, C.ink, R); dab(c, 12.5, -8.5, 0.4, C.ink, R); }
      return;
  }
}
const TURTLE = {
  layer: turLayer,
  whole: { walk0: { L: [0.3, -0.3, -0.3, 0.3], lift: -0.4 }, walk1: { L: [-0.3, 0.3, 0.3, -0.3], lift: -0.2 } },
  water: {
    swim: { base: 'swimB', sink: 7.2, foam: [-13, 12], drops: 2, wake: true },
    shellW: { base: 'shell', sink: 6, foam: [-13, 12], drops: 2 },
  },
  rig: {
    driver: 'sea', q: 'turtle',
    joints: { pivot: [0, -6], head: [9, -7.8], limbs: [[6.6, -6.4], [-8.8, -6.4], [4, -6.4], [-11.4, -6.4]], plan: ['l3', 'l2', 'head', 'l1', 'l0', 'body', 'bfx'], deadH: 18 },
    parts(pose) {
      if (pose === 'swim' || pose === 'shellW') return null;
      const p = { l0: 'r:legNF', l1: 'r:legNH', l2: 'r:legFF', l3: 'r:legFH', head: pose === 'atk' ? 'r:headO' : 'r:head', body: 'r:body', code: code(pose) };
      if (pose === 'atk') { p.ha = 0.18; p.hx = 2.2; p.kh = 2; }
      else if (pose === 'shell') { p.gait = 0; p.hx = -7.5; p.ha = 0.2; p.ls = [0.2, 0.2, 0.2, 0.2, 1, 1, 1, 1]; p.lift = 2.6; p.bfx = 'r:peek'; p.kb = 40; p.ksq = -3; }
      else if (pose === 'swimB') { p.gait = 0; p.la = [-0.9, 0.9, -0.7, 0.7, 0, 0, 0, 0]; p.ha = -0.2; p.hx = 1; p.ta0 = -0.2; }
      return sp(p);
    },
  },
};

// ================================================================ WALRUS (r 16.5): brown, fat, white tusks, whiskers
const WAL_OWN = '#9c6a46';
const WAL_BODY = [[-21.6, -6], [-19.6, -14.4], [-12.6, -22.4], [-3, -26.4], [6, -26], [11.6, -22.4], [13.8, -15], [13.4, -6.4], [8, -1.2], [-6, -0.6], [-17, -1.6]];
function walPal(o) {
  return { skin: pc(o, WAL_OWN), far: pc(o, tone(WAL_OWN, -0.28), tone(C.zskin, -0.28)), belly: pc(o, '#d4a37c', tone(C.zskin, 0.3), C.charL), wrinkle: pc(o, '#6e4429', C.zskinD, C.ink),
    pad: pc(o, '#e6c39e', tone(C.zskin, 0.4), C.charL), tusk: pc(o, '#fffaea', '#e8ecd2', C.charL), nose: pc(o, '#4a2a1a', C.zskinD, C.ink), fl: pc(o, '#7d5236', C.zskinD) };
}
function walLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = walPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:flN': part(c, poly([[5.4, -8.4], [8.4, -4], [12.6, -0.2], [7.6, 0.4], [4, -4.4]], R, 0.15), Pl.fl, M, { lw: 1.35 }); return;
    case 'r:flF': part(c, poly([[2.6, -8.4], [5.6, -4], [9.4, -0.4], [4.8, 0.2], [1.2, -4.4]], R, 0.15), tone(Pl.fl, -0.25), M, { lw: 1.25 }); return;
    case 'r:hind': part(c, poly([[-18.6, -7.2], [-24, -9.4], [-29, -8.4], [-26.6, -4.2], [-29.6, -0.4], [-24, -0.8], [-18.6, -2.2]], R, 0.15), Pl.fl, M, { lw: 1.4 }); return;
    case 'r:body': {
      part(c, poly(WAL_BODY, R, 0.35), Pl.skin, M, { lw: 1.9 });
      brush(c, [[-16, -3.4], [-6, -2.2], [4, -2.6], [11, -5]], 3.6, Pl.belly, R, { taper: 0.4, dry: 0.4, bristles: 5 });
      if (!burnt) for (const [x, y] of [[-12, -16], [-6, -19], [-14, -10], [-2, -12]]) brush(c, [[x - 2, y], [x, y - 1.2], [x + 2.4, y - 0.4]], 0.7, Pl.wrinkle, R, { bristles: 2, dry: 0.3 });
      if (o.risen) ribs(c, -10, -13, 4, 8, 3.4, R);
      if (burnt) scorch(c, [[-8, -14, 2.4], [2, -12, 2], [-14, -8, 1.6]], R);
      band(c, o, WAL_OWN, [[5.6, -26], [7.4, -18.6], [7.6, -10]], 3.2, R, [[7.2, -15], [3.8, -10.2]]);
      return;
    }
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO';
      part(c, ring(15.4, -20.4, 8.2, 7.4, R, 0.08, 10), Pl.skin, M, { lw: 1.7 });
      part(c, poly([[16, -16.4], [17.2, -8], [16.6, -4.6], [15.6, -8.6], [15, -16]], R, 0.1), tone(Pl.tusk, -0.12), M, { lw: 1, sharp: true });   // far tusk
      for (const [x, y] of [[17.4, -16.2], [20.6, -16.4]]) part(c, ring(x, y, 2.9, 2.5, R, 0.08, 7), Pl.pad, M, { lw: 1.05 });   // the whisker pads
      part(c, poly([[18.8, -15.2], [20.6, -6.4], [20, -2.4], [18.4, -6.8], [17.6, -14.8]], R, 0.1), Pl.tusk, M, { lw: 1.1, sharp: true });   // near tusk
      if (!burnt) for (const [x, y] of [[16.6, -16.4], [18, -15.4], [20, -16.8], [21.6, -15.6]]) dab(c, x, y, 0.32, Pl.wrinkle, R);
      if (!burnt && !o.risen) for (const [y, d] of [[-16.8, 0], [-15.6, 0.8]]) { brush(c, [[22.6, y], [25.6, y - 0.8 + d]], 0.45, C.ink, R, { bristles: 1, dry: 0.2 }); brush(c, [[14.8, y], [11.8, y - 0.8 + d]], 0.45, C.ink, R, { bristles: 1, dry: 0.2 }); }
      dab(c, 21.2, -19.6, 1.1, Pl.nose, R);
      if (open) { dab(c, 19, -13.6, 1.3, C.ink, R); dab(c, 19, -13.5, 0.75, MOUTH, R); }
      eye(c, o, 15.4, -22.6, 1.25, R, open ? 1.2 : 0.5);
      if (o.risen && !o.dead) zMouth(c, [[17, -13.8], [18.6, -13.6], [20.2, -13.8]], R, 0.4);
      return;
    }
    case 'r:skid':   // sliding: skid lines + dust / spray behind it
      for (let i = 0; i < 3; i++) brush(c, [[-20 - i * 1.4, -3 - i * 3.4], [-28 - i * 2, -3.2 - i * 3.6], [-34 - i * 2.6, -2.6 - i * 3.2]], 1.1, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 });
      for (let i = 0; i < 5; i++) dab(c, -24 - R() * 12, -1 - R() * 4, 1.2 + R() * 1.4, i & 1 ? C.paperD : '#d8c7a2', R);
      return;
  }
}
const WALRUS = {
  layer: walLayer,
  whole: { walk0: { L: [0.4, -0.3], lift: -1.4, sq: 0.05, t0: 0.15 }, walk1: { L: [-0.4, 0.3], lift: 0, sq: -0.05, t0: -0.15 } },
  water: {
    swim: { base: 'swimB', sink: 14.6, foam: [-16, 17], drops: 2, wake: true, dim: 0.45 },
    slideW: { base: 'slide', sink: 9.6, foam: [-22, 20], drops: 6, fx: (c, o, R) => splash(c, R, 24, 4.4, 6) },
  },
  rig: {
    driver: 'sea', q: 'walrus',
    joints: { pivot: [-2, -12], tail: [[-18.6, -4.6]], head: [10.4, -17], limbs: [[6, -7.4], [3.2, -7.4]], plan: ['l1', 'tail', 'body', 'head', 'l0', 'gfx'], deadH: 28 },
    parts(pose) {
      if (pose === 'swim' || pose === 'slideW') return null;
      const p = { l0: 'r:flN', l1: 'r:flF', t0: 'r:hind', body: 'r:body', head: pose === 'atk' ? 'r:headO' : 'r:head', code: code(pose) };
      if (pose === 'atk') { p.ha = 0.38; p.hx = 1.6; p.pitch = 0.05; p.kh = 3; }
      else if (pose === 'slide') { p.gait = 0; p.pitch = 0.16; p.lift = 2.4; p.sq = -0.1; p.ha = -0.22; p.hx = 1.6; p.la = [1.25, 1.1, 0, 0, 0, 0, 0, 0]; p.ta0 = -0.35; p.gfx = 'r:skid'; p.ksq = -4; p.kp = 1.6; }
      else if (pose === 'swimB') { p.gait = 0; p.ha = -0.15; p.la = [0.8, 0.6, 0, 0, 0, 0, 0, 0]; }
      return sp(p);
    },
  },
};

// ================================================================ SWORDFISH (r 9.9): blue back, silver belly, a sail fin, the sword
const SWF_OWN = '#2f6fd8', SAIL = '#1d3f8f';
const SWF_BODY = [[-12, -9.6], [-5, -12.2], [4, -12.4], [10.6, -10.6], [14.2, -8.2], [14, -6.4], [10, -4.4], [2, -3], [-6, -3.4], [-12, -5.2]];
function swfPal(o) {
  return { skin: pc(o, SWF_OWN), belly: pc(o, '#e6edf4', tone(C.zskin, 0.4), C.charL), sail: pc(o, SAIL, tone(C.zskin, -0.25)), sword: pc(o, '#4c5a6e', '#8a9a6a', C.charL),
    fin: pc(o, '#2558b0', tone(C.zskin, -0.15)), rib: pc(o, '#6f9be8', tone(C.zskin, 0.2), C.charL) };
}
function swfLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = swfPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:tailP': partEdges(c, poly([[-11.4, -9.6], [-16, -8.2], [-16.4, -6.4], [-11.4, -4.8]], R, 0.15), [[0, 1], [2, 3]], Pl.skin, M, { lw: 1.3 }); return;
    case 'r:tail': part(c, poly([[-15.6, -8], [-19.6, -13], [-23.2, -17.6], [-21, -11], [-19.4, -7.2], [-21, -3], [-23.2, 2.4], [-19.6, -1.6], [-15.6, -6.4]], R, 0.15), Pl.fin, M, { lw: 1.3, sharp: true }); return;
    case 'r:pec': part(c, poly([[6.6, -5.8], [2.2, -1.8], [0.4, -1.4], [3.8, -5.2]], R, 0.1), Pl.fin, M, { lw: 1 }); return;
    case 'r:body': {
      const team = teamOf(o, SWF_OWN), sailCol = team ? (burnt ? C.charL : team) : Pl.sail;
      if (team && !burnt) brush(c, [[-10, -12.6], [-6, -16.8], [0, -21.4], [4, -23], [6.4, -18]], 1.3, C.white, R, { bristles: 2, dry: 0, taper: 0 });
      part(c, poly([[-10.8, -10.8], [-9.6, -14.2], [-6, -17.4], [-2.4, -20], [1.4, -22.2], [4.4, -23.2], [6.2, -19.6], [7.4, -12]], R, 0.2), sailCol, M, { lw: 1.3 });
      if (!burnt) for (const [x, h] of [[-6.4, 5], [-3, 7.4], [0.6, 9.4], [4, 10.4]]) brush(c, [[x + 0.5, -11.6], [x - 0.3, -11.8 - h]], 0.55, team ? tone(sailCol, -0.35) : Pl.rib, R, { bristles: 1, dry: 0.2 });
      brush(c, [[13.6, -7.6], [21, -7.6], [30, -7.2]], 1.9, C.ink, R, { bristles: 3, dry: 0, taper: 0.85 });   // the sword
      brush(c, [[13.8, -7.8], [21, -7.8], [29.4, -7.3]], 1.1, Pl.sword, R, { bristles: 2, dry: 0.1, taper: 0.85 });
      fill(c, shift(SWF_BODY, M.mx, M.my, M.grow), Pl.skin, R);
      fill(c, shift(poly([[-11.6, -6.4], [-4, -7.4], [4, -7.6], [11.6, -6.8], [10, -4.4], [2, -3], [-6, -3.4], [-12, -5.2]], R, 0.12), M.mx, M.my), Pl.belly, R, { edge: 0 });
      inkLine(c, SWF_BODY, 1.45, R);
      brush(c, [[5.6, -10.6], [6.4, -8.4], [5.8, -6.2]], 0.55, tone(Pl.skin, -0.4), R, { bristles: 1, dry: 0.1 });   // gill
      eye(c, o, 10, -8.8, 1.55, R, 0.8);
      if (o.dead === 'dead') brush(c, [[12.6, -6.2], [13.8, -5]], 0.8, TONGUE, R, { bristles: 2, dry: 0 });
      if (o.risen) ribs(c, -5, -7.8, 3, 4, 2.4, R);
      if (burnt) scorch(c, [[-2, -8, 1.6]], R);
      return;
    }
    case 'r:drops':   // flying water drops trailing a leap / a stranded gasp
      for (const [x, y, r] of [[-18, -2, 0.8], [-22, -5, 0.6], [-14, 1.4, 0.7], [-24, 0.6, 0.5]]) dab(c, x, y, r, C.pondL, R);
      return;
  }
}
const SWORDFISH = {
  layer: swfLayer,
  whole: { walk0: { t0: 0.22, t1: -0.2, pitch: 0.05 }, walk1: { t0: -0.22, t1: 0.2, pitch: -0.05 }, flop: { t0: -0.32, t1: -0.3, pitch: -0.1, lift: -1 } },
  water: {
    fin0: { base: 'finB0', sink: 12.2, foam: [-6.6, 6.8], drops: 2, wake: true, dim: 0.42 },
    fin1: { base: 'finB1', sink: 12.4, foam: [-6.4, 7], drops: 2, wake: true, dim: 0.42 },
    leapW: { base: 'leapB', sink: 2.4, foam: [-15, -4], drops: 5, fx: (c, o, R) => splash(c, R, -12, 7, 8) },
  },
  rig: {
    driver: 'sea', q: 'swordfish',
    joints: { pivot: [1, -7.4], tail: [[-11.4, -7.2], [-16, -7.2]], limbs: [[6, -5.6]], plan: ['tail', 'body', 'l0', 'bfx'], deadH: 13 },
    parts(pose) {
      if (pose === 'fin0' || pose === 'fin1' || pose === 'leapW') return null;
      const p = { t0: 'r:tailP', t1: 'r:tail', body: 'r:body', l0: 'r:pec', code: code(pose) };
      if (pose === 'atk') { p.pitch = 0.1; p.lx = 2; p.kp = 2; }
      else if (pose === 'flop') { p.gait = 4; p.bfx = 'r:drops'; }
      else if (pose === 'leap') { p.gait = 0; p.la = [0.5, 0, 0, 0, 0, 0, 0, 0]; p.ta0 = -0.08; p.ta1 = -0.12; p.bfx = 'r:drops'; p.vzp = 1; p.kt = 5; }
      else if (pose === 'leapB') { p.gait = 0; p.pitch = -0.5; p.lift = -3; p.la = [0.5, 0, 0, 0, 0, 0, 0, 0]; p.ta0 = 0.15; p.ta1 = 0.2; }
      else if (pose === 'finB0') { p.gait = 0; p.ta0 = 0.06; p.ta1 = -0.62; }
      else if (pose === 'finB1') { p.gait = 0; p.ta0 = -0.16; p.ta1 = -0.4; }
      return sp(p);
    },
  },
};

// ================================================================ drawUnit: the water frames + the octopus's tentacles
// (sim px; RENDER passes x, y = the feet with its swim bob, k = size factor, rt = real time, api.get / api.put / api.S / api.col)
const TYPES = new Map();
let WORLD = null;   // the world, kept by pick() (RENDER's info.world): the octopus needs its held units
const swimCyc = (u, rt, hz) => (Math.floor(rt * hz + (u.id % 7) * 0.37) & 1);
const WPICK = {
  crab: (u) => (act(u) === 1 || u.attack > 0.35 ? 'pinchW' : 'swim'),
  shark: (u, rt) => { const a = act(u); return a === 1 || u.attack > 0.35 ? 'lunge' : a === 2 ? 'drag' : swimCyc(u, rt, 2.4) ? 'fin1' : 'fin0'; },
  octopus: (u) => { const a = act(u); return a === 1 ? 'grabW' : a === 2 ? 'inkW' : 'swim'; },
  puffer: (u) => (act(u) === 1 ? 'puffW' : 'swim'),
  eel: (u, rt) => (act(u) === 1 ? 'shockW' : u.attack > 0.35 ? 'biteW' : swimCyc(u, rt, 2.2) ? 'swim1' : 'swim0'),
  turtle: (u) => (act(u) === 1 ? 'shellW' : 'swim'),
  walrus: (u) => (act(u) === 1 ? 'slideW' : 'swim'),
  swordfish: (u, rt) => (act(u) === 1 ? 'leapW' : swimCyc(u, rt, 2.6) ? 'fin1' : 'fin0'),
};
const ROCK = { crab: 0.06, shark: 0.025, octopus: 0.05, puffer: 0.08, eel: 0.02, turtle: 0.04, walrus: 0.03, swordfish: 0.03 };
// tentacles from the octopus to each held unit (b.v0..b.v3): a chain of painted pieces along a bent, waving curve, ending in a
// loop round the victim's middle. Drawn before the body (they come out from under it).
const TSEG = 6;   // r:tseg length (sprite px)
function tentacleTo(ctx, S, seg, coil, x0, y0, vic, rt, i, k) {
  const vr = vic.radius || 8, vx = vic.x, vy = vic.y - (vic.z || 0) - vr * 1.05;
  const dx = vx - x0, dy = vy - y0, d = Math.sqrt(dx * dx + dy * dy);
  if (!(d > 2) || d > 140) return;
  const nx = -dy / d, ny = dx / d, bend = (dx >= 0 ? -1 : 1) * Math.min(18, d * 0.3);
  const cx = (x0 + vx) / 2 + nx * bend, cy = (y0 + vy) / 2 + ny * bend - d * 0.12;
  const n = Math.max(3, Math.min(16, Math.round(d / 4.2)));
  let px = x0, py = y0;
  for (let j = 1; j <= n; j++) {
    const t = j / n, it = 1 - t, wv = Math.sin(rt * 6 + i * 1.7 + t * 5) * 1.4 * Math.sin(t * Math.PI);
    const qx = it * it * x0 + 2 * it * t * cx + t * t * vx + nx * wv, qy = it * it * y0 + 2 * it * t * cy + t * t * vy + ny * wv;
    const ex = qx - px, ey = qy - py, l = Math.sqrt(ex * ex + ey * ey) || 1;
    if (seg) {
      const ux = ex / l, uy = ey / l, sx = (l * 1.25) / TSEG, sy = k * (1.15 - 0.55 * t), m = S / seg.k;
      ctx.setTransform(ux * sx * m, uy * sx * m, -uy * sy * m, ux * sy * m, (px - ux * l * 0.1) * S, (py - uy * l * 0.1) * S);
      ctx.drawImage(seg.img, seg.sx, seg.sy, seg.sw, seg.sh, -seg.ax, -seg.ay, seg.sw, seg.sh);
    }
    px = qx; py = qy;
  }
  if (coil) { const m = S / coil.k * Math.max(0.55, Math.min(1.6, vr / 9)); ctx.setTransform(m, 0, 0, m, vx * S, vy * S); ctx.drawImage(coil.img, coil.sx, coil.sy, coil.sw, coil.sh, -coil.ax, -coil.ay, coil.sw, coil.sh); }
}
function octoTentacles(ctx, u, x, y, flip, k, rt, api, wet) {
  const b = u.b, w = WORLD;
  if (!b || !w || typeof w.unitById !== 'function') return;
  const seg = api.get(u.type, 'r:tseg', api.col), coil = api.get(u.type, 'r:tcoil', api.col);
  const x0 = x + flip * 3 * k, y0 = y - (wet ? 1 : 9) * k, S = api.S;
  for (let i = 0; i < 4; i++) {
    const id = i === 0 ? b.v0 : i === 1 ? b.v1 : i === 2 ? b.v2 : b.v3;
    if (!(id >= 0)) continue;
    const vic = w.unitById(id);
    if (!vic || vic.dead || vic === u) continue;
    tentacleTo(ctx, S, seg, coil, x0, y0, vic, rt, i, k);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function seaDraw(ctx, u, x, y, flip, k, rt, api) {
  const T = TYPES.get(u.type);
  if (!T) return false;
  const wet = (u.wet || 0) >= (T.aqua ? WET : DEEP) && !((u.z || 0) > 1) && !(u.climb > 0);   // fish: any water; the others: deep water (they wade in shallows)
  if (T.q === 'octopus' && act(u) === 1) octoTentacles(ctx, u, x, y, flip, k, rt, api, wet);
  if (!wet) return false;   // land (or shallows): RENDER draws it (floppy body / whole + its waterline cut)
  const pose = WPICK[T.q](u, rt);
  const spr = api.get(u.type, pose, api.col);
  if (!spr) return true;
  const rot = ROCK[T.q] * Math.sin(rt * 2.1 + (u.id % 13) * 0.7);
  api.put(spr, x, y, flip, k, rot);
  const fl = u.flash > 0 ? Math.min(1, u.flash) : 0;
  if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; api.put(spr, x, y, flip, k, rot, fl * 0.55); ctx.globalCompositeOperation = 'source-over'; }
  return true;
}

// ================================================================ the ink cloud (effect projectile 'ink')
const INK = '#241a30', INKL = '#3b2d4c';
export const PROJ = {
  ink: {
    box: [76, 62, 38, 31], n: 3, ground: false,
    paint(c, R, v) {   // radius 30 (scaled by p.r / 30 when drawn), flattened like a cloud on the ground
      const B = [];
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + R() * 0.5, d = 13 + R() * 6; B.push([Math.cos(a) * d, Math.sin(a) * d * 0.72, 8 + R() * 4]); }
      for (let i = 0; i < 4; i++) { const a = R() * TAU, d = R() * 8; B.push([Math.cos(a) * d, Math.sin(a) * d * 0.72, 10 + R() * 4]); }
      for (const [x, y, r] of B) dab(c, x, y, r + 1.5, C.ink, R, 0.12);   // the outline: ink rings under the fills
      for (let i = 0; i < B.length; i++) { const [x, y, r] = B[i]; fill(c, ring(x, y, r, r * 0.9, R, 0.12, 9), i & 1 ? INK : INKL, R, { vary: 0.07, edge: 0 }); }
      for (let i = 0; i < 4; i++) { const a = v * 0.8 + i * 1.6, r = 6 + i * 3.4, pts = []; for (let q = 0; q <= 6; q++) { const t = a + q * 0.5; pts.push([Math.cos(t) * r, Math.sin(t) * r * 0.6]); }
        brush(c, pts, 0.9, '#6a5a82', R, { bristles: 2, dry: 0.5, taper: 0.6 }); }   // swirls
      for (let i = 0; i < 7; i++) { const a = R() * TAU; dab(c, Math.cos(a) * (28 + R() * 6), Math.sin(a) * (21 + R() * 4), 1.2 + R() * 1.6, INK, R); }   // splats round the edge
    },
    draw(p, x, y, ang, rt, i, api) {
      const total = p.maxLife > 0 ? p.maxLife : p.life > 0 ? p.life : 4, age = Math.max(p.age > 0 ? p.age : 0, total - (p.life > 0 ? p.life : total));
      const left = total - age;   // octopus.js keeps p.age (life stays put); a sim that counts p.life down works too
      const grow = Math.min(1, age / 0.3), e = 1 - (1 - grow) * (1 - grow), fade = Math.min(1, left / 0.8);
      const r = (p.r > 0 ? p.r : 70) * (0.45 + 0.55 * e), spr = api.bit(api.sprite, ((rt * 3 + i) | 0) % 3);
      if (!spr || !(fade > 0.01)) return true;
      const g = api.ctx; g.globalAlpha = 0.86 * fade;
      api.put(spr, x, y - 9, r / 30, Math.sin(rt * 0.7 + i) * 0.12);
      g.globalAlpha = 1;
      return true;
    },
  },
};

// ================================================================ the registry
// pick(u, info) on land; drawUnit takes over in deep water. Every entry: lie 'none' (the dead frame is painted on its back).
const ent = (q, T, e) => {
  T.q = q; T.box = e.box; T.aqua = q === 'shark' || q === 'eel' || q === 'swordfish'; TYPES.set(q, T); TYPES.set('risen_' + q, T);
  return Object.assign({ scale: 1, lie: 'none', paint(c, o) { paintSea(c, o, T); }, rig: T.rig, drawUnit: seaDraw }, e);
};
const keepWorld = (info) => { if (info && info.world) WORLD = info.world; };
export const SPRITES = {
  // CRAB: front view, the big claw toward its enemy (RENDER flips by heading). Floppy ('sea'): legs scuttle in two ripples,
  // body rocks, eye stalks wobble, claws bob + snap; a pinch thrusts the big claw out and shuts it.
  crab: ent('crab', CRAB, {
    box: [46, 40, 20, 30], own: CRAB_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['pinch', 'swim', 'pinchW', 'r:legsR', 'r:legsL', 'r:eyes', 'r:body', 'r:armN', 'r:armNS', 'r:armF'],
    pick(u, info) { keepWorld(info); if (act(u) === 1) return 'pinch'; return u.attack > 0 ? 'atk' : null; },
  }),
  // SHARK: water only (aquatic). In deep water drawUnit draws fin0 / fin1 / lunge / drag; stranded on land the floppy body
  // thrashes ('flop'). Fin tip = team colour.
  shark: ent('shark', SHARK, {
    box: [84, 72, 40, 52], own: SHARK_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['flop', 'fin0', 'fin1', 'lunge', 'drag', 'r:tailP', 'r:tail', 'r:jaw', 'r:body', 'r:pec'],
    pick(u, info) { keepWorld(info); if (u.attack > 0) return 'atk'; return (u.wet || 0) < WET ? 'flop' : null; },
  }),
  // OCTOPUS: floppy ('sea'): six tentacles ripple, the soft head squashes + jiggles; grab flings them forward (+ a tentacle to
  // each held unit, drawUnit), ink squirts a black puff. Team band round its head.
  octopus: ent('octopus', OCTOPUS, {
    box: [52, 48, 26, 36], own: OCTO_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['grab', 'ink', 'swim', 'grabW', 'inkW', ...OCT_PARTS, 'r:tseg', 'r:tcoil'],
    pick(u, info) { keepWorld(info); const a = act(u); if (a === 1) return 'grab'; if (a === 2) return 'ink'; return u.attack > 0 ? 'atk' : null; },
  }),
  // PUFFER: floppy ('sea'): hops on land (stretch up, squash down), tail wags; puff inflates into the spiky ball.
  puffer: ent('puffer', PUFFER, {
    box: [40, 36, 20, 26], own: PUFF_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['puff', 'swim', 'puffW', 'r:tail', 'r:tailP', 'r:fin', 'r:finP', 'r:body', 'r:bodyO', 'r:ball'],
    pick(u, info) { keepWorld(info); if (act(u) === 1) return 'puff'; return u.attack > 0 ? 'atk' : null; },
  }),
  // EEL: water only (aquatic). Water: swim0 / swim1 humps, shock (reared up, sparks), biteW. Land: the chain wriggles.
  eel: ent('eel', EEL, {
    box: [64, 44, 34, 30], own: EEL_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['flop', 'shock', 'shockW', 'swim0', 'swim1', 'biteW', 'r:seg2', 'r:seg1', 'r:seg0', 'r:body', 'r:jaw', 'r:head', 'r:glow', 'r:zap'],
    pick(u, info) { keepWorld(info); if (act(u) === 1) return 'shock'; if (u.attack > 0) return 'atk'; return (u.wet || 0) < WET ? 'flop' : null; },
  }),
  // TURTLE: floppy ('sea'): stubby legs paddle, head bobs on its neck; shell pulls head + legs in, eyes peek out.
  turtle: ent('turtle', TURTLE, {
    box: [52, 40, 24, 30], own: TURT_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['shell', 'swim', 'shellW', 'r:legNF', 'r:legNH', 'r:legFF', 'r:legFH', 'r:head', 'r:headO', 'r:body', 'r:peek'],
    pick(u, info) { keepWorld(info); if (act(u) === 1) return 'shell'; return u.attack > 0 ? 'atk' : null; },
  }),
  // WALRUS: floppy ('sea'): gallumphs (body humps + jiggles, head nods after it); slide = flat on its belly, flippers back.
  walrus: ent('walrus', WALRUS, {
    box: [80, 56, 40, 42], own: WAL_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['slide', 'swim', 'slideW', 'r:flN', 'r:flF', 'r:hind', 'r:body', 'r:head', 'r:headO', 'r:skid'],
    pick(u, info) { keepWorld(info); if (act(u) === 1) return 'slide'; return u.attack > 0 ? 'atk' : null; },
  }),
  // SWORDFISH: water only (aquatic). Water: fin0 / fin1 (sail fin), leap at the surface. Air / land: the floppy body
  // ('leap' pitched along its arc by the driver, 'flop' thrashing). Sail = team colour.
  swordfish: ent('swordfish', SWORDFISH, {
    box: [66, 56, 30, 36], own: SWF_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['leap', 'flop', 'fin0', 'fin1', 'leapW', 'r:tailP', 'r:tail', 'r:pec', 'r:body', 'r:drops'],
    pick(u, info) { keepWorld(info); const a = act(u); if (a === 1) return 'leap'; if (a === 2) return 'flop'; if (u.attack > 0) return 'atk'; return (u.wet || 0) < WET ? 'flop' : null; },
  }),
};
