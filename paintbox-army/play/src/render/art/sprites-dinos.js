// dinos tab sprites (Part 2 step 4, OURS). Owner: DINOS-ART. Contract: ART.md + RIG.md (+ PROJ in sprites.js).
// A 7-year-old's tempera dinosaurs: big heads, stubby legs, bold silhouettes, natural colours (raptor orange + stripes,
// spitter green + red frill, trex green-brown with tiny arms, ptero red-brown leathery wings, trike blue-grey, stego green +
// orange plates, ankylo brown armour, longneck blue-green). In Team battle (o.col !== own) they wear the team colour as a
// painted scarf (kid-a cheetah). o.dead 'dead' = on its back, legs up, X eyes (lie: 'none', painted lying); 'burnt' = the
// same, all charcoal. o.risen = zombie copy (skin C.zskin, milky eye, stitched mouth, ribs).
//
// Every type is painted as LAYERS ('r:<layer>' poses, each at rest: feet at 0,0, facing right) and every whole pose is those
// layers put together by rig-dinos.js emit() with the pose's numbers (the same code the floppy driver runs every frame), so
// whole sprites and floppy parts always agree. rig.parts(pose) names each pose's layers + numbers (see rig-dinos.js).
//
// Poses (entry pick(u, info), from STEP4.md b.act codes; RENDER's default = atk while u.attack > 0.35, walk0 / walk1 moving):
//   raptor    leap (b.act 1, mid-pounce), pin (b.act 2, crouched on / clinging to its victim, biting), atk (u.attack > 0:
//             bite, jaws open), run0 / run1 (speed > 160), walk0 / walk1, idle
//   spitter   spit (b.act 1: frill flared, neck forward, a glob in its mouth), atk (bite), walk0 / walk1, idle
//   trike     charge0 / charge1 (b.act 1: head down, horns forward, galloping), dazed (b.act 2: head low, swirly eyes; RENDER
//             adds the stun stars), atk (horn jab), walk0 / walk1, idle
//   stego     swipe (b.act 1: spiked tail swung up round with swoosh lines), atk (bite), walk0 / walk1, idle
//   ankylo    club (b.act 1: the club swung up over its back), atk (bite), walk0 / walk1, idle
//   ptero     dive (b.act 1: wings swept back, beak down), carry (b.act 2: legs down, claws open, flapping hard; the victim is
//             placed + drawn by the sim / RENDER under it), atk (beak open), fly0 / fly1 (flapping, ~4 Hz), glide (wings
//             out, 1 s in every 3), stand (z < 4: on the ground, wings folded back). flying: true (RENDER raises it by u.z).
//   trex      roar (b.act 1: head up, jaws wide, roar lines), bite (b.act 2: head lunged down, jaws wide), hold (b.act 3: jaws
//             clamped on a victim, drawn WHOLE; 'jawU' = the hold frame's upper jaw alone, same seed, for a gator-style
//             victim-in-the-jaws overdraw: `mouth` = the point between its jaws), atk (bite), walk0 / walk1, idle
//   longneck  rear (b.act 1: up on its hind legs, front feet pawing), stomp (b.act 2: front feet slammed down, impact lines),
//             atk (head dips), walk0 / walk1, idle
// Projectile: PROJ.spit = a green glob lobbed on an arc (p.z, or an arc from p.apex over its life), with a ground shadow.
import { C, TAU, lerp, tone, brush, ring, poly, fill, part, dab, tube, spline, shift, canvas, rng, hash, M0 } from './paint.js';
import { resolveJ, emitWith, resetP, DN, PT } from './rig-dinos.js';

// ---------------------------------------------------------------- shared helpers
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const teamOf = (o, own) => (o.col && !sameCol(o.col, own)) ? o.col : null;
/** colour for a part: natural / zombie / charcoal. */
const pc = (o, nat, zom = C.zskin, burnt = C.char) => (o.dead === 'burnt' ? burnt : o.risen ? zom : nat);
const MILK = '#e7edd6';
const speed = (u) => Math.sqrt((u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0));
const act = (u) => (u.b && u.b.act) | 0;
function onBack(c, h, fn) { c.save(); c.translate(0, -h); c.scale(1, -1); fn(); c.restore(); }
function about(c, x, y, a, fn) { if (!a) { fn(); return; } c.save(); c.translate(x, y); c.rotate(a); c.translate(-x, -y); fn(); c.restore(); }
function xEye(c, x, y, s, R, w = 0.7) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
/** A big cartoon eye: white + pupil; dead = X; risen = milky, pupil adrift. brow: an angry stroke over it (alive only). */
function eye(c, o, x, y, r, R, brow = 0) {
  if (o.dead) { xEye(c, x, y, r * 0.85, R, Math.max(0.55, r * 0.5)); return; }
  if (o.risen) { dab(c, x, y, r * 1.1, MILK, R); dab(c, x + r * 0.35, y + r * 0.35, r * 0.4, C.ink, R); return; }
  dab(c, x, y, r, C.white, R); dab(c, x + r * 0.32, y + r * 0.08, r * 0.52, C.ink, R);
  if (brow) brush(c, [[x - r * 1.3, y - r * 1.25 - brow * 0.3], [x + r * 1.1, y - r * 0.7]], Math.max(0.6, r * 0.5), C.ink, R, { bristles: 2, dry: 0 });
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
/** the team scarf (kid-a cheetah): a band round the neck plus a flapping end. */
function scarf(c, o, own, band, end, w, R) {
  const col = teamOf(o, own); if (!col) return;
  const k = o.dead === 'burnt' ? C.charL : col;
  brush(c, band, w, k, R, { taper: 0.1, dry: 0.1, bristles: Math.max(3, Math.round(w)) });
  if (end) brush(c, end, w * 0.78, k, R, { taper: 0.6, dry: 0.2, bristles: 3 });
}
const jit = (P, R, j = 0.3) => P.map(([x, y]) => [x + (R() - 0.5) * 2 * j, y + (R() - 0.5) * 2 * j]);
function inkLine(c, P, w, R) { brush(c, jit(P, R), w, C.ink, R, { bristles: 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 }); }
/** A fill whose ink outline runs only along the given index ranges of pts (the rest hides under the part it joins). */
function partEdges(c, pts, ranges, col, M, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  for (const [i0, i1] of ranges) { const P = []; for (let i = i0; i <= i1; i++) P.push(pts[i % pts.length]); inkLine(c, P, o.lw ?? M.lw, M.R); }
}
/** A strip along a centre line (widths per point): neck and tail pieces. cap: 0 open both ends, 1 outline round the far end. */
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
function claws(c, x, y, k, R, dir = 1) { for (let i = 0; i < 3; i++) brush(c, [[x, y - i * 0.35 * k], [x + dir * 1.2 * k, y - i * 0.55 * k + 0.4 * k]], 0.5 * k, C.ink, R, { bristles: 1, dry: 0 }); }
/** a pillar leg (quadrupeds): hip (x, y) down to the ground at y = 0, toenails at the front. */
function pillarLeg(c, R, M, x, y, w, col, nail, lw = 1.25, bend = 0.6) {
  tube(c, [[x, y], [x + bend, lerp(y, 0, 0.55)], [x + 0.2, -w * 0.28]], w, col, R, lw);
  for (let i = 0; i < 3; i++) dab(c, x + 0.4 + (i - 1) * w * 0.28 + w * 0.18, -w * 0.16, Math.max(0.5, w * 0.13), nail, R);
}
/** a biped dino leg (raptor / spitter / trex): hip (hx, hy = -11 k) down to a flat foot on y = 0: back-bent shin, three toe
 *  claws forward, the big drumstick thigh over the top; sickle = the raptor's raised killing claw. */
function dinoLeg(c, R, M, hx, hy, k, col, sickle, lw = 1.3) {
  const X = (u) => hx + u * k, Y = (v) => hy + v * k;
  tube(c, [[X(1.6), Y(4.6)], [X(0.3), Y(7.9)], [X(-0.9), Y(9.8)]], 1.9 * k, col, R, lw * 0.85);
  tube(c, [[X(-1.4), Y(9.9)], [X(1.0), Y(10.5)], [X(3.3), Y(10.6)]], 1.35 * k, col, R, lw * 0.8);
  claws(c, X(3.4), Y(10.7), k, R);
  if (sickle) brush(c, [[X(-0.4), Y(9.6)], [X(0.3), Y(7.9)], [X(1.8), Y(7.5)]], 1.0 * k, C.ink, R, { bristles: 2, dry: 0, taper: 0.75 });
  part(c, ring(X(0.5), Y(2.4), 3.0 * k, 3.9 * k, R, 0.1, 8, 0.35), col, M, { lw });
}
// A context that paints nowhere: replaying a painting on it uses up R exactly as the real one did (trex 'jawU').
let nowhere = null;
const nowhereCtx = () => nowhere || (nowhere = canvas(2, 2).getContext('2d'));
/** The seed RENDER's bake (sprites.js paintEntry) uses for this frame in another pose: same type, colour, variant, flags. */
function bakeSeed(o, pose) {
  const risen = o.risen ? (o.risen === 'bone' ? 2 : 1) : 0;
  return hash(`${o.type}|${o.col}|${pose}|${o.v}|${o.dead}${risen ? '|risen' + risen : ''}${o.bare ? '|bare' : ''}${o.kindled ? '|kindled' : ''}`);
}

// ---------------------------------------------------------------- poses -> layers (shared with the floppy driver)
/** rig.parts() result with every field the drivers read (parts default to none, numbers to 0). */
const dp = (p) => Object.assign({ l0: null, l1: null, l2: null, l3: null, body: null, t0: null, t1: null, t2: null, n0: null, n1: null, head: null, jaw: null,
  hfx: null, tfx: null, gfx: null, bfx: null, aN: null, aF: null, wB: null, wF: null,
  gait: 1, pitch: 0, lift: 0, ha: 0, hx: 0, ja: 0, na0: 0, na1: 0, ta0: 0, ta1: 0, ta2: 0, arm: 0, la: [0, 0, 0, 0], lf: [0, 0, 0, 0],
  code: 0, kp: 0, kb: 0, kh: 0, kt: 0, kn: 0, kw: 0, shake: 0, flap: 0, wing: 0, lega: 0 }, p);
/** walk / trot frame legs (the driver's stride at phase th): biped near / far, quad near fore, far fore, near hind, far hind. */
function gaitL(nL, A, th) { const k = nL === 2 ? [1, -1] : [1, -1, -1, 1], L = [0, 0, 0, 0]; for (let i = 0; i < nL; i++) L[i] = -A * k[i] * Math.sin(th); return L; }
/** Paint a whole pose: every layer of rig.parts(pose) through emit() with the pose's numbers (+ the whole-frame extras W). */
function paintPose(c, o, T, pose, only) {
  const J = resolveJ(T.rig.joints), rp = T.rig.parts(pose), W = (o.dead ? T.dead : T.whole && T.whole[pose]) || null, D = T.rig.q ? DN[T.rig.q] : null;
  const p = resetP(newP());
  p.pitch = rp.pitch; p.lift = rp.lift; p.head = rp.ha; p.hx = rp.hx; p.jaw = rp.ja; p.n0 = rp.na0; p.n1 = rp.na1; p.t0 = rp.ta0; p.t1 = rp.ta1; p.t2 = rp.ta2;
  p.aN = rp.arm; p.aF = rp.arm * 0.8 - 0.1; p.wF = rp.wing; p.wB = rp.wing + PT.farW;
  for (let i = 0; i < 4; i++) { p.L[i] = rp.la[i]; p.S[i] = 1 - rp.lf[i]; }
  if (T.rig.driver === 'ptero') p.L[0] = rp.lega;
  p.comp = rp.gait === 3 || o.dead ? 0 : 1;
  if (W) for (const k in W) { const v = W[k]; if (k === 'L' || k === 'S') for (let i = 0; i < 4; i++) { if (v[i] !== undefined) p[k][i] = k === 'L' ? p.L[i] + v[i] : v[i]; } else p[k] = (p[k] || 0) + v; }
  if (o.dead && D) {   // the limp rest the floppy body settles to (rig-dinos.js dinoBody, mid values)
    const nL = J.nL;
    for (let i = 0; i < nL; i++) { const front = nL === 2 ? i === 0 : i < 2; p.L[i] = (front ? -1 : 1) * (D.dLeg[0] + D.dLeg[1] * (0.35 + 0.3 * i / nL)); p.S[i] = 1; }
    p.pitch = 0; p.lift = 0; p.hx = 0; p.head = D.dHead[0] + D.dHead[1] * 0.5; p.jaw = D.dJaw[0] + D.dJaw[1] * 0.5;
    p.t0 = 0.08; p.t1 = -0.12; p.t2 = 0.1; p.n0 = D.dNeck[0] + D.dNeck[1] * 0.5; p.n1 = D.dNeck[0] * 0.6 + D.dNeck[1] * 0.5; p.aN = 0.3; p.aF = 0.2;
  }
  const list = [];
  emitWith(J, rp, p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
  const nw = only ? nowhereCtx() : null;
  for (const [nm, a, b, cc, d, e, f] of list) {
    const g = only && !only.has(nm) ? nw : c;
    g.save(); g.transform(a, b, cc, d, e, f); T.layer(g, o, nm); g.restore();
  }
}
const newP = () => ({ pitch: 0, lift: 0, head: 0, hx: 0, jaw: 0, n0: 0, n1: 0, t0: 0, t1: 0, t2: 0, aN: 0, aF: 0, wB: 0, wF: 0, L: [0, 0, 0, 0], S: [1, 1, 1, 1], comp: 0, gb: 0 });
function paintDino(c, o, T) {
  const dh = T.rig.joints.deadH;
  if (isPart(o.pose)) { if (o.dead) onBack(c, dh, () => T.layer(c, o, o.pose)); else T.layer(c, o, o.pose); return; }
  if (o.dead) { onBack(c, dh, () => paintPose(c, o, T, T.rest || 'idle')); return; }
  if (o.pose === 'jawU' && T.jawU) {   // the 'hold' frame RENDER baked with this colour / variant / flags: its upper jaw only
    const R = rng(bakeSeed(o, 'hold'));
    paintPose(c, Object.assign({}, o, { pose: 'hold', R, M: M0(R) }), T, 'hold', T.jawU);
    return;
  }
  paintPose(c, o, T, o.pose);
}
const POSE_CODE = new Map();
const code = (pose) => { let k = POSE_CODE.get(pose); if (k === undefined) { k = POSE_CODE.size + 1; POSE_CODE.set(pose, k); } return k; };

// ================================================================ RAPTOR (r 9.9): orange, dark stripes, sickle claws
const RAP_OWN = '#f28b2c';
const RAP_BODY = [[-7.6, -16.6], [-3.4, -18.4], [2, -18.4], [5.8, -17], [7.8, -14], [7.2, -10.6], [4, -8.4], [-1.4, -8], [-5.4, -9.4], [-8, -12.6]];
const RAP_TAIL = [[-5, -17.6], [-10, -17.4], [-14.8, -16.8], [-14.8, -13.8], [-10, -13.2], [-5, -11.6]];
const RAP_TIP = [[-14.2, -17], [-18.4, -16.4], [-22.6, -15.4], [-22.9, -14.8], [-18.4, -14.4], [-14.2, -13.8]];
const RAP_HEAD = [[4.4, -18.2], [5.2, -21.6], [8.4, -23.6], [12, -23.2], [15.2, -21.2], [17.8, -19.4], [18, -17.6], [13.4, -17], [8.6, -16.8], [5.4, -16.4]];
const RAP_JAW = [[7, -17.4], [12, -17.2], [16.8, -17.2], [16.4, -15.4], [12, -14.8], [7.4, -15.4]];
function rapPal(o) {
  return { skin: pc(o, RAP_OWN), dark: pc(o, '#8a3a12', C.zskinD, C.charL), far: pc(o, tone(RAP_OWN, -0.3), tone(C.zskin, -0.28)), belly: pc(o, '#ffe0a6', tone(C.zskin, 0.35), C.charL),
    mouth: pc(o, '#9e1f2a', '#7a5a4a', C.charL), teeth: pc(o, C.white, '#e8ecd2', C.charL) };
}
/** a biped dino head: lower jaw (open by ja about the hinge, mouth inside), skull over it, teeth, eye, nostril. */
function bipedHead(c, o, R, M, Pl, H, JW, hinge, ja, spec) {
  if (ja > 0.05) fill(c, poly(spec.mouth, R, 0.15), Pl.mouth, R, { edge: 0 });
  about(c, hinge[0], hinge[1], ja, () => {
    part(c, poly(JW, R, 0.15), Pl.skin, M, { lw: spec.lw * 0.85 });
    if (ja > 0.05) teeth(c, spec.lt[0], spec.lt[1], spec.lt[2], spec.lt[3], spec.lt[4], -1, Pl.teeth, R, spec.tw);
    if (o.dead === 'dead' && ja > 0.05) brush(c, spec.tongue, spec.tw * 1.6, '#e5707a', R, { bristles: 2, dry: 0, taper: 0.3 });
  });
  part(c, poly(H, R, 0.2), Pl.skin, M, { lw: spec.lw });
  teeth(c, spec.ut[0], spec.ut[1], spec.ut[2], spec.ut[3], spec.ut[4], 1, Pl.teeth, R, spec.tw);
  if (o.risen && !o.dead && ja <= 0.05) zMouth(c, spec.zm, R, spec.tw * 0.7);
}
function rapLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = rapPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': dinoLeg(c, R, M, -1.2, -11, 1, Pl.skin, true); return;
    case 'r:legF': dinoLeg(c, R, M, -3, -11, 1, Pl.far, true); return;
    case 'r:armN': case 'r:armF': {
      const f = L === 'r:armF', dx = f ? -1.2 : 0, dy = f ? -0.4 : 0, col = f ? Pl.far : Pl.skin;
      tube(c, [[4.4 + dx, -12.4 + dy], [6.8 + dx, -10 + dy], [9.2 + dx, -10.8 + dy]], 1.8, col, R, 0.95);
      claws(c, 9.4 + dx, -10.5 + dy, 0.95, R); return;
    }
    case 'r:tail':
      partEdges(c, poly(RAP_TAIL, R, 0.2), [[0, 2], [3, 5]], Pl.skin, M);
      if (!burnt) for (const x of [-8.6, -12.4]) brush(c, [[x + 0.5, -17.2], [x - 0.5, -14.6]], 1.25, Pl.dark, R, { bristles: 2, dry: 0.2 });
      return;
    case 'r:tip':
      partEdges(c, poly(RAP_TIP, R, 0.2), [[0, 5]], Pl.skin, M, { lw: 1.4 });
      if (!burnt) brush(c, [[-17.2, -16.4], [-17.9, -14.8]], 1.1, Pl.dark, R, { bristles: 2, dry: 0.2 });
      return;
    case 'r:body':
      rapLayer(c, o, 'r:armF');   // the far arm is painted with the body (behind it): one part fewer
      part(c, poly(RAP_BODY, R, 0.25), Pl.skin, M);
      brush(c, [[-5.2, -9.8], [0, -9.1], [5.4, -10.8]], 2.3, Pl.belly, R, { taper: 0.5, dry: 0.4, bristles: 3 });
      if (!burnt) for (const x of [-5.4, -2.2, 1, 4.2]) brush(c, [[x + 0.7, -17.6 - (x > 3 ? -0.8 : 0)], [x - 0.6, -13.8]], 1.35, Pl.dark, R, { bristles: 2, dry: 0.25, taper: 0.6 });
      if (o.risen) ribs(c, -3.6, -12.8, 3, 4.4, 2.4, R);
      if (burnt) scorch(c, [[-3, -14, 1.3], [2, -12, 1]], R);
      scarf(c, o, RAP_OWN, [[3.4, -18.6], [5.2, -14.8], [4.6, -10.6]], [[4.8, -12.6], [1.6, -9.6]], 2.5, R);
      return;
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO' || (o.dead === 'dead');
      bipedHead(c, o, R, M, Pl, poly(RAP_HEAD, R, 0.2), RAP_JAW, [7.4, -16.8], open ? 0.55 : 0, {
        lw: 1.55, tw: 0.75, mouth: [[7.6, -17.2], [17.4, -17.6], [16, -12.2], [8.4, -15.2]], lt: [9.6, 15.6, -15.6, 4, 1.1], ut: [9.2, 17, -17.1, 5, 1.2],
        tongue: [[10, -15.4], [14.6, -13], [16.2, -11]], zm: [[9.6, -16.6], [12.4, -16.5], [15.2, -16.7]] });
      if (!burnt) brush(c, [[6.6, -22.6], [9, -21], [6.2, -19.6]], 1.1, Pl.dark, R, { bristles: 2, dry: 0.3 });
      dab(c, 16.6, -19.6, 0.45, C.ink, R);
      eye(c, o, 10.8, -20.4, 1.75, R, 1);
      return;
    }
  }
}
const RAPTOR = {
  layer: rapLayer,
  whole: {
    walk0: { L: gaitL(2, DN.raptor.walkA, Math.PI / 2), lift: -0.5 }, walk1: { L: gaitL(2, DN.raptor.walkA, 1.5 * Math.PI), lift: -0.5 },
    run0: { L: [0.95, -0.85], S: [1, 0.72], lift: -1.4, pitch: 0.1 }, run1: { L: [-0.85, 0.95], S: [0.72, 1], lift: -1.2, pitch: 0.1 },
  },
  rig: {
    driver: 'dino', q: 'raptor',
    joints: { pivot: [-1.2, -11], legs: [[-1.2, -11, -1.2, -11, 11], [-3, -11, -3, -11, 11]], tail: [[-5.6, -14.6], [-14.4, -15.4]], head: [6, -16.2], arms: [[4.4, -12.2], [3.2, -12.6]],
      plan: ['aF', 'l1', 'tail', 'body', 'l0', 'head', 'aN'], deadH: 19 },
    parts(pose) {
      const p = { l0: 'r:legN', l1: 'r:legF', t0: 'r:tail', t1: 'r:tip', body: 'r:body', head: pose === 'atk' || pose === 'leap' || pose === 'pin' ? 'r:headO' : 'r:head', aN: 'r:armN', code: code(pose) };
      if (pose === 'atk') { p.ha = 0.18; p.hx = 1.4; p.pitch = 0.08; }
      else if (pose === 'run0' || pose === 'run1') { p.pitch = 0.12; p.ha = -0.05; p.ta0 = -0.06; p.arm = -0.4; }
      else if (pose === 'leap') { p.gait = 3; p.pitch = -0.32; p.lift = -2.5; p.la = [-1.15, -0.95, 0, 0]; p.lf = [0.25, 0.3, 0, 0]; p.ha = 0.1; p.hx = 1; p.ta0 = 0.22; p.ta1 = 0.1; p.arm = -0.9; p.kt = 4; p.kh = -2; }
      else if (pose === 'pin') { p.gait = 0; p.pitch = 0.32; p.lift = 3.2; p.la = [-0.55, 0.65, 0, 0]; p.lf = [0.38, 0.38, 0, 0]; p.ha = 0.42; p.hx = 1.2; p.ta0 = -0.3; p.ta1 = -0.1; p.arm = -0.75; p.kb = 40; p.kh = 3; }
      return dp(p);
    },
  },
};

// ================================================================ SPITTER (r 9.35): green, yellow spots, red crests + frill
const SPIT_OWN = '#2f8f5b', FRILL = '#de3a35';
const SPIT_BODY = [[-7.2, -15.8], [-3, -17.6], [2, -17.4], [5.6, -15.6], [7, -12.4], [6.2, -9.2], [2.6, -7.4], [-2, -7.2], [-5.6, -8.6], [-7.8, -11.8]];
const SPIT_TAIL = [[-5, -16.4], [-9.6, -16.2], [-13.8, -15.4], [-13.8, -12.4], [-9.6, -12.2], [-5, -10.6]];
const SPIT_TIP = [[-13.2, -15.6], [-17, -15], [-20.8, -13.8], [-21, -13.2], [-17, -13], [-13.2, -12.6]];
const SPIT_HEAD = [[4.4, -16.4], [5.4, -21.4], [7.2, -23.6], [10.4, -24.2], [13.6, -22.8], [16, -20.8], [16.4, -19.2], [12.2, -18.6], [7.8, -18.4], [5.4, -15]];
const SPIT_JAW = [[7.6, -18.9], [12, -18.7], [15.6, -18.7], [15.2, -17.2], [11.6, -16.8], [8, -17.2]];
function spitPal(o) {
  return { skin: pc(o, SPIT_OWN), dark: pc(o, '#1d5e3a', C.zskinD, C.charL), far: pc(o, tone(SPIT_OWN, -0.3), tone(C.zskin, -0.28)), belly: pc(o, '#f3e27a', tone(C.zskin, 0.35), C.charL),
    spot: pc(o, '#ffd51e', tone(C.zskin, 0.45), C.charL), frill: pc(o, FRILL, '#b98a6a', C.charL), mouth: pc(o, '#9e1f2a', '#7a5a4a', C.charL), teeth: pc(o, C.white, '#e8ecd2', C.charL), goo: '#c8ec3a' };
}
/** the frill: folded = a red collar behind the head; open = a great fan round it (yellow spots, dark ribs). */
function spitFrill(c, o, R, M, Pl, open) {
  if (!open) {
    part(c, poly([[5.6, -23.6], [2.6, -21], [2.4, -17.6], [4, -15], [6.4, -16.6], [6.8, -20.4]], R, 0.2), Pl.frill, M, { lw: 0.9 });
    for (const y of [-21, -18.4]) brush(c, [[5.6, y + 0.6], [3.2, y]], 0.5, tone(Pl.frill, -0.4), R, { bristles: 1, dry: 0.2 });
    return;
  }
  const cx = 8.6, cy = -19.6, pts = [];
  for (let i = 0; i <= 12; i++) { const a = -2.75 + i / 12 * 3.6, r = i & 1 ? 7.6 : 9.4; pts.push([cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r]); }
  pts.push([cx + 1, cy + 3.4], [cx - 1.6, cy + 4.4]);
  part(c, poly(pts, R, 0.25), Pl.frill, M, { lw: 1.3, sharp: true });
  for (let i = 0; i < 6; i++) { const a = -2.6 + i * 0.62; brush(c, [[cx + Math.cos(a) * 2.8, cy + Math.sin(a) * 2.8], [cx + Math.cos(a) * 8, cy + Math.sin(a) * 8.4]], 0.55, tone(Pl.frill, -0.45), R, { bristles: 1, dry: 0.3, taper: 0.5 }); }
  if (o.dead !== 'burnt') for (let i = 0; i < 5; i++) { const a = -2.35 + i * 0.68; dab(c, cx + Math.cos(a) * 6.2, cy + Math.sin(a) * 6.4, 0.85, Pl.spot, R); }
}
function spitLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = spitPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': dinoLeg(c, R, M, -1, -10.2, 0.93, Pl.skin, false); return;
    case 'r:legF': dinoLeg(c, R, M, -2.8, -10.2, 0.93, Pl.far, false); return;
    case 'r:armN': case 'r:armF': {
      const f = L === 'r:armF', dx = f ? -1.2 : 0, dy = f ? -0.4 : 0, col = f ? Pl.far : Pl.skin;
      tube(c, [[4 + dx, -11.4 + dy], [5.8 + dx, -9.8 + dy], [7.6 + dx, -10.2 + dy]], 1.4, col, R, 0.9);
      claws(c, 7.8 + dx, -9.9 + dy, 0.8, R); return;
    }
    case 'r:tail':
      partEdges(c, poly(SPIT_TAIL, R, 0.2), [[0, 2], [3, 5]], Pl.skin, M);
      if (!burnt) { dab(c, -8.4, -14.6, 0.9, Pl.spot, R); dab(c, -11.8, -13.8, 0.75, Pl.spot, R); }
      return;
    case 'r:tip':
      partEdges(c, poly(SPIT_TIP, R, 0.2), [[0, 5]], Pl.skin, M, { lw: 1.4 });
      if (!burnt) dab(c, -16.4, -14, 0.65, Pl.spot, R);
      return;
    case 'r:body':
      spitLayer(c, o, 'r:armF');   // the far arm is painted with the body (behind it): one part fewer
      part(c, poly(SPIT_BODY, R, 0.25), Pl.skin, M);
      brush(c, [[-5, -9], [0, -8.4], [5, -10]], 2.3, Pl.belly, R, { taper: 0.5, dry: 0.4, bristles: 3 });
      if (!burnt) for (const [x, y, r] of [[-4.6, -14.4, 1.1], [-1, -15.6, 1.2], [2.6, -14.6, 1], [-2.4, -12.2, 0.9], [1.4, -11.8, 0.8]]) dab(c, x, y, r, Pl.spot, R);
      if (o.risen) ribs(c, -3.6, -12.4, 3, 4.2, 2.4, R);
      if (burnt) scorch(c, [[-3, -13, 1.3], [2, -12, 1]], R);
      scarf(c, o, SPIT_OWN, [[3, -17.8], [4.6, -14.2], [4, -10.2]], [[4.2, -12.2], [1.2, -9.2]], 2.4, R);
      return;
    case 'r:head': case 'r:headO': case 'r:headS': {
      const spit = L === 'r:headS', open = spit || L === 'r:headO' || o.dead === 'dead';
      spitFrill(c, o, R, M, Pl, spit && !o.dead);
      for (const [x0, h] of [[6.4, 5], [9.6, 4.2]]) part(c, poly([[x0, -22.8], [x0 + 0.4, -23.2 - h], [x0 + 2.4, -23.8 - h], [x0 + 3.8, -23.6 - h * 0.5], [x0 + 3.8, -23.4]], R, 0.15), Pl.frill, M, { lw: 0.85 });   // the two crests
      bipedHead(c, o, R, M, Pl, poly(SPIT_HEAD, R, 0.2), SPIT_JAW, [8, -18.4], open ? (spit ? 0.62 : 0.5) : 0, {
        lw: 1.5, tw: 0.7, mouth: [[8.2, -18.8], [16.2, -19], [15, -14], [8.6, -16.6]], lt: [9.6, 14.6, -17.4, 3, 0.9], ut: [9.4, 15.6, -18.6, 4, 1.0],
        tongue: [[10, -17], [13.6, -15], [15, -13.4]], zm: [[9.4, -18.2], [12, -18.1], [14.6, -18.3]] });
      dab(c, 15.4, -20.8, 0.42, C.ink, R);
      eye(c, o, 11.2, -21.4, 1.65, R, spit || open ? 1 : 0.4);
      if (spit && !burnt && !o.dead) {   // a glob of spit at its lips, drips falling
        part(c, ring(17.4, -17.8, 2.1, 1.8, R, 0.15, 7), Pl.goo, M, { lw: 0.9 });
        dab(c, 16.9, -18.4, 0.55, C.white, R);
        for (const [x, y, r] of [[15.8, -15.2, 0.65], [16.6, -13.4, 0.5]]) dab(c, x, y, r, Pl.goo, R);
      }
      return;
    }
  }
}
const SPITTER = {
  layer: spitLayer,
  whole: { walk0: { L: gaitL(2, DN.spitter.walkA, Math.PI / 2), lift: -0.5 }, walk1: { L: gaitL(2, DN.spitter.walkA, 1.5 * Math.PI), lift: -0.5 } },
  rig: {
    driver: 'dino', q: 'spitter',
    joints: { pivot: [-1, -10.2], legs: [[-1, -10.2, -1, -10.2, 10.2], [-2.8, -10.2, -2.8, -10.2, 10.2]], tail: [[-5.4, -13.8], [-13.4, -14.2]], head: [5.4, -15.6], arms: [[4, -11.4], [2.8, -11.8]],
      plan: ['aF', 'l1', 'tail', 'body', 'l0', 'head', 'aN'], deadH: 18 },
    parts(pose) {
      const p = { l0: 'r:legN', l1: 'r:legF', t0: 'r:tail', t1: 'r:tip', body: 'r:body', head: pose === 'spit' ? 'r:headS' : pose === 'atk' ? 'r:headO' : 'r:head', aN: 'r:armN', code: code(pose) };
      if (pose === 'atk') { p.ha = 0.18; p.hx = 1.2; p.pitch = 0.06; }
      else if (pose === 'spit') { p.gait = 0; p.ha = -0.12; p.hx = 2; p.pitch = 0.1; p.ta0 = 0.12; p.arm = -0.3; p.kh = 4; p.kt = 2; }
      return dp(p);
    },
  },
};

// ================================================================ TREX (r 22): green-brown, huge head, tiny arms
const REX_OWN = '#6e7d36';
const REX_BODY = [[-17, -36], [-10, -42], [0, -43], [9, -40.4], [15, -35.4], [16.4, -29], [12.6, -22.4], [3.4, -18.8], [-6, -18.6], [-13, -21.6], [-17.6, -28]];
const REX_TAIL = [[-13.6, -41], [-24, -38.6], [-32, -35.8], [-32, -29.2], [-24, -27.2], [-13.6, -23.6]];
const REX_TIP = [[-31.4, -35.8], [-38, -33.4], [-44.4, -29.8], [-44.8, -28.4], [-38, -27.8], [-31.4, -29]];
const REX_HEAD = [[7.4, -43.6], [10, -49.8], [17, -53.2], [26, -52.4], [33.6, -49.2], [39, -45.6], [40.4, -41.8], [30, -40.4], [19, -40], [11, -38.4], [7.6, -39.6]];
const REX_JAW = [[12, -40.8], [22, -40.4], [38, -40.8], [37.4, -37.2], [28.4, -35.2], [18, -34.6], [12.4, -36]];
const REX_HINGE = [13, -39.4], REX_MOUTH = [30, -38.6];
function rexPal(o) {
  return { skin: pc(o, REX_OWN), dark: pc(o, '#434a1e', C.zskinD, C.charL), far: pc(o, tone(REX_OWN, -0.3), tone(C.zskin, -0.28)), belly: pc(o, '#e9d49a', tone(C.zskin, 0.35), C.charL),
    mouth: pc(o, '#8e1a24', '#7a5a4a', C.charL), teeth: pc(o, C.white, '#e8ecd2', C.charL), bump: pc(o, '#8c9a4a', tone(C.zskin, 0.15), C.charL) };
}
function rexLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = rexPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': dinoLeg(c, R, M, -4, -27, 27 / 11, Pl.skin, false, 1.8); return;
    case 'r:legF': dinoLeg(c, R, M, -8.6, -27, 27 / 11, Pl.far, false, 1.8); return;
    case 'r:armN': case 'r:armF': {   // tiny arms, two fingers
      const f = L === 'r:armF', dx = f ? -2.2 : 0, dy = f ? -0.8 : 0, col = f ? Pl.far : Pl.skin;
      tube(c, [[10 + dx, -29 + dy], [12.6 + dx, -26.6 + dy], [15.2 + dx, -27.2 + dy]], 2.3, col, R, 1.1);
      for (let i = 0; i < 2; i++) brush(c, [[15.4 + dx, -27.4 + dy + i * 1.1], [16.8 + dx, -26.8 + dy + i * 1.3]], 0.6, C.ink, R, { bristles: 1, dry: 0 });
      return;
    }
    case 'r:tail':
      partEdges(c, poly(REX_TAIL, R, 0.3), [[0, 2], [3, 5]], Pl.skin, M, { lw: 1.9 });
      if (!burnt) for (const x of [-18, -24, -29.6]) brush(c, [[x + 0.6, -39.6 + (x + 18) * -0.24], [x - 0.8, -34.4 + (x + 18) * -0.18]], 1.8, Pl.dark, R, { bristles: 3, dry: 0.25, taper: 0.6 });
      return;
    case 'r:tip':
      partEdges(c, poly(REX_TIP, R, 0.3), [[0, 5]], Pl.skin, M, { lw: 1.8 });
      if (!burnt) brush(c, [[-36.8, -33.2], [-37.8, -30.4]], 1.5, Pl.dark, R, { bristles: 2, dry: 0.25 });
      return;
    case 'r:body':
      rexLayer(c, o, 'r:armF');   // the far arm is painted with the body (behind it): one part fewer
      part(c, poly(REX_BODY, R, 0.4), Pl.skin, M, { lw: 2 });
      brush(c, [[-11, -21.6], [-1, -19.8], [9.4, -22.6], [14, -27.6]], 5, Pl.belly, R, { taper: 0.5, dry: 0.35, bristles: 6 });
      for (let i = 0; i < 6; i++) brush(c, [[-8 + i * 3.2, -21.4 + (i > 3 ? -0.6 * (i - 3) : 0)], [-7.4 + i * 3.3, -19.4 + (i > 3 ? -0.8 * (i - 3) : 0)]], 0.6, tone(Pl.belly, -0.3), R, { bristles: 1, dry: 0.2 });
      if (!burnt) {
        for (const x of [-12, -6, 0, 6]) brush(c, [[x + 1, -42 + Math.abs(x + 3) * 0.06], [x - 1, -35.6]], 2, Pl.dark, R, { bristles: 3, dry: 0.25, taper: 0.6 });
        for (let i = 0; i < 7; i++) dab(c, -10 + i * 3.6 + R() * 1.4, -32 + R() * 4, 0.7, Pl.bump, R);
      }
      if (o.risen) ribs(c, -6, -31, 4, 8, 3.6, R);
      if (burnt) scorch(c, [[-6, -32, 2.4], [4, -30, 2], [-12, -27, 1.6]], R);
      scarf(c, o, REX_OWN, [[7, -42], [10.6, -34.6], [10, -26.6]], [[10, -31], [5.4, -25]], 4.2, R);
      return;
    case 'r:jaw':   // the lower jaw with the mouth inside it (hidden by the skull while shut), lower teeth
      fill(c, poly([[13, -40.6], [38.4, -41.4], [37.6, -46], [16, -43.6]], R, 0.2), Pl.mouth, R, { edge: 0 });
      part(c, poly(REX_JAW, R, 0.25), Pl.skin, M, { lw: 1.8 });
      brush(c, [[15, -36], [26, -35.4], [34, -37.4]], 1.6, Pl.belly, R, { taper: 0.4, dry: 0.35, bristles: 3 });
      teeth(c, 19, 36.4, -40.4, 5, 2, -1, Pl.teeth, R, 1.15);
      if (o.dead === 'dead') brush(c, [[22, -38], [30, -35.6], [34, -32.4]], 2, '#e5707a', R, { bristles: 3, dry: 0, taper: 0.4 });
      return;
    case 'r:head':
      part(c, poly(REX_HEAD, R, 0.3), Pl.skin, M, { lw: 2 });
      teeth(c, 18, 39.4, -40.6, 7, 2.6, 1, Pl.teeth, R, 1.25);   // great white teeth over the lower jaw
      brush(c, [[18, -40.4], [28, -40.2], [39.4, -41.4]], 0.7, C.ink, R, { bristles: 2, dry: 0 });
      if (!burnt) { for (const [x, y] of [[13, -48], [16.4, -50.4], [20, -51.4]]) dab(c, x, y, 0.95, Pl.dark, R); brush(c, [[28, -51.6], [33, -48.6]], 1.3, Pl.dark, R, { bristles: 2, dry: 0.3 }); }
      dab(c, 36.6, -47.6, 0.65, C.ink, R);
      eye(c, o, 21.6, -46.6, 2.1, R, 0);
      if (!o.dead && !o.risen) brush(c, [[17.6, -50.2], [21.6, -49.8], [25.4, -48]], 1.5, C.ink, R, { bristles: 3, dry: 0.1 });   // the heavy brow
      if (o.risen && !o.dead) zMouth(c, [[20, -40.6], [26, -40.4], [32, -40.6]], R, 0.6);
      return;
    case 'r:roar':
      for (let i = 0; i < 3; i++) { const r = 6 + i * 3.6, a0 = -0.75, a1 = 0.55, pts = []; for (let k = 0; k <= 5; k++) { const a = lerp(a0, a1, k / 5); pts.push([40 + Math.cos(a) * r, -43 + Math.sin(a) * r]); }
        brush(c, pts, 1.1, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.4 }); }
      return;
  }
}
const TREX = {
  layer: rexLayer, jawU: new Set(['r:head']),
  whole: { walk0: { L: gaitL(2, DN.trex.walkA, Math.PI / 2), lift: -1 }, walk1: { L: gaitL(2, DN.trex.walkA, 1.5 * Math.PI), lift: -1 } },
  rig: {
    driver: 'dino', q: 'trex',
    joints: { pivot: [-4, -27], legs: [[-4, -27, -4, -27, 27], [-8.6, -27, -8.6, -27, 27]], tail: [[-14, -32], [-31.6, -32.4]], head: [11, -38], jaw: REX_HINGE, arms: [[10, -29], [7.8, -29.8]],
      plan: ['aF', 'l1', 'tail', 'body', 'l0', 'head', 'aN'], deadH: 42 },
    parts(pose) {
      const p = { l0: 'r:legN', l1: 'r:legF', t0: 'r:tail', t1: 'r:tip', body: 'r:body', head: 'r:head', jaw: 'r:jaw', aN: 'r:armN', code: code(pose) };
      if (pose === 'roar') { p.gait = 0; p.ha = -0.42; p.ja = 0.62; p.pitch = -0.08; p.ta0 = -0.08; p.arm = -0.5; p.hfx = 'r:roar'; p.kh = -4; p.kt = 2; p.la = [-0.12, 0.18, 0, 0]; }
      else if (pose === 'bite' || pose === 'atk') { p.ha = 0.3; p.hx = 3; p.ja = 0.55; p.pitch = 0.12; p.ta0 = 0.06; p.kh = 2; }
      else if (pose === 'hold') { p.gait = 0; p.ha = 0.06; p.ja = 0.24; p.pitch = 0.04; p.la = [-0.15, 0.2, 0, 0]; p.shake = 0.12; }
      return dp(p);
    },
  },
};

// ================================================================ PTERODACTYL (r 11): red-brown leathery wings, yellow beak + crest
const PTE_OWN = '#a8452e';
// near wing at rest: spread up and back from the shoulder (1, -9.6); the far one is the same, darker, a little ahead
const PTE_WING = [[1.6, -9.4], [0.4, -16.6], [-4.4, -25.2], [-13, -33.4], [-11.6, -28.2], [-11.4, -23.4], [-12.6, -18.8], [-12.6, -14], [-9.4, -10], [-5, -7.8], [-1.6, -8]];
function ptePal(o) {
  return { skin: pc(o, PTE_OWN), wing: pc(o, '#cf6243', tone(C.zskin, 0.1)), wingD: pc(o, '#8f3a26', tone(C.zskin, -0.3)), dark: pc(o, '#6d2a1c', C.zskinD, C.charL),
    beak: pc(o, '#f6c453', '#d8d6a0', C.charL), crest: pc(o, '#ffd51e', '#d8d6a0', C.charL), belly: pc(o, '#f2b48c', tone(C.zskin, 0.35), C.charL), mouth: pc(o, '#9e1f2a', '#7a5a4a', C.charL) };
}
function pteWing(c, o, R, M, Pl, dx, far) {
  const pts = PTE_WING.map(([x, y]) => [x + dx, y]);
  part(c, poly(pts, R, 0.25), far ? Pl.wingD : Pl.wing, M, { lw: 1.35 });
  brush(c, [[1 + dx, -9.6], [0.4 + dx, -16.6], [-4.4 + dx, -25.2], [-12.4 + dx, -32.8]], 1.4, far ? C.ink : Pl.dark, R, { bristles: 2, taper: 0.6, dry: 0.1 });   // the long finger bone
  if (!far) for (const [x, y, ex, ey] of [[-2.6, -19, -11.4, -21.6], [-1.4, -13.4, -10.6, -13]]) brush(c, [[x + dx, y], [ex + dx, ey]], 0.55, tone(Pl.wing, -0.32), R, { bristles: 1, dry: 0.4, taper: 0.6 });
  claws(c, 0.4 + dx, -16.6, 0.75, R);
}
function pteLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = ptePal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:wingB': pteWing(c, o, R, M, Pl, 2.6, true); return;
    case 'r:wingF': pteWing(c, o, R, M, Pl, 0, false); return;
    case 'r:tail':
      brush(c, [[-5.6, -8], [-10.4, -8.4], [-14.6, -9.4]], 0.95, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.2 });
      part(c, poly([[-14.4, -9.4], [-16.4, -11.4], [-18.4, -9.6], [-16.2, -7.8]], R, 0.15), Pl.crest, M, { lw: 0.9, sharp: true });
      return;
    case 'r:legs': for (const dx of [-1.4, 0]) { brush(c, [[-4 + dx, -6.8], [-7.2 + dx, -5.6], [-9.8 + dx, -6]], 1.05, dx ? Pl.dark : Pl.skin, R, { bristles: 2, dry: 0.1 }); claws(c, -10 + dx, -6, 0.7, R, -1); } return;
    case 'r:legsD':
      for (const dx of [-1.6, 0]) { brush(c, [[-3.6 + dx, -6.8], [-3.2 + dx, -3.4], [-2.2 + dx, -0.6]], 1.1, dx ? Pl.dark : Pl.skin, R, { bristles: 2, dry: 0.1 });
        for (let i = 0; i < 3; i++) brush(c, [[-2.2 + dx, -0.6], [-3.6 + dx + i * 1.4, 0.8 + (i === 1 ? 0.4 : 0)]], 0.55, C.ink, R, { bristles: 1, dry: 0 }); }   // claws spread to grab
      return;
    case 'r:body':
      part(c, ring(-1, -8.2, 6.4, 3.4, R, 0.08, 9, -0.08), Pl.skin, M, { lw: 1.45 });
      brush(c, [[-5, -6.4], [-1, -5.6], [3.4, -6.8]], 1.4, Pl.belly, R, { taper: 0.5, dry: 0.4, bristles: 3 });
      if (o.risen) ribs(c, -3, -8.2, 2, 3.2, 2, R);
      if (burnt) scorch(c, [[-1, -8.4, 1.2]], R);
      return;
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO' || o.dead === 'dead';
      tube(c, [[3, -8.8], [5.4, -10.6]], 2.6, Pl.skin, R, 1);
      part(c, poly([[6, -12.6], [-0.4, -17], [0.8, -15], [6.8, -10.8]], R, 0.15), Pl.crest, M, { lw: 1, sharp: true });   // the crest, back off the skull
      if (open) {
        fill(c, poly([[9, -11], [17.6, -11.2], [16.4, -7.4], [9.2, -9.4]], R, 0.1), Pl.mouth, R, { edge: 0 });
        part(c, poly([[9.2, -12.4], [19.4, -12.6], [9.6, -10.4]], R, 0.12), Pl.beak, M, { lw: 1, sharp: true });
        part(c, poly([[9.2, -10.2], [17.4, -7], [9.4, -8.6]], R, 0.12), Pl.beak, M, { lw: 1, sharp: true });
      } else part(c, poly([[9.2, -12.2], [20.4, -10.2], [9.6, -8.8]], R, 0.12), Pl.beak, M, { lw: 1.05, sharp: true });
      part(c, ring(7.2, -10.8, 2.9, 2.6, R, 0.08, 7), Pl.skin, M, { lw: 1.2 });
      eye(c, o, 7.6, -11.4, 1.15, R, open ? 1 : 0);
      scarf(c, o, PTE_OWN, [[4.4, -12], [5.2, -9.8], [4.2, -7.4]], [[4.6, -8.8], [2.2, -6.4]], 1.8, R);
      return;
    }
  }
}
const PTERO = {
  layer: pteLayer, rest: 'fly0',
  dead: { wF: -0.4, wB: 2.75 - PT.farW, head: 0.5, t0: 0.1, L: [-0.6, 0, 0, 0] },   // on its back, wings splayed flat (near one back, far one forward)
  rig: {
    driver: 'ptero',
    joints: { pivot: [-1, -8.2], legs: [[-4, -6.8, -4, -6.8, 6.8]], tail: [[-5.6, -8]], head: [4, -9.4], wing: [1, -9.6],
      plan: ['wB', 'tail', 'l0', 'body', 'head', 'wF'], deadH: 12 },
    parts(pose) {
      const p = { wB: 'r:wingB', wF: 'r:wingF', t0: 'r:tail', l0: 'r:legs', body: 'r:body', head: pose === 'atk' || pose === 'dive' ? 'r:headO' : 'r:head', code: code(pose), gait: 3 };
      if (pose === 'fly0') { p.flap = 1; p.wing = -0.55; }
      else if (pose === 'fly1') { p.flap = 1; p.wing = -0.55; }
      else if (pose === 'glide') { p.wing = -0.75; }
      else if (pose === 'atk') { p.flap = 1; p.wing = -0.55; p.ha = 0.2; p.kh = 2; }
      else if (pose === 'dive') { p.wing = -1.45; p.pitch = 0.6; p.ha = 0.2; p.ta0 = -0.2; p.lega = 0.4; p.kp = 3; p.kw = -3; }
      else if (pose === 'carry') { p.flap = 2; p.wing = -0.5; p.l0 = 'r:legsD'; p.pitch = -0.12; p.lega = 0.1; p.ha = 0.15; p.kw = 4; }
      else if (pose === 'stand') { p.wing = -1.15; p.l0 = 'r:legsD'; p.pitch = -0.1; }
      return dp(p);
    },
  },
  // whole frames: the wingbeat's top / bottom, the glide
  whole: { fly0: { wF: 0.75, wB: 0.7 }, fly1: { wF: -0.75, wB: -0.7, lift: -1.4 }, atk: { wF: 0.4, wB: 0.35 }, carry: { wF: 0.9, wB: 0.85 } },
};

// ================================================================ TRICERATOPS (r 17.6): blue-grey, frill, three horns
const TRI_OWN = '#6d86ad';
const TRI_FACE = [[8, -22.6], [12.6, -25.2], [18.6, -24.6], [23.6, -20.8], [26.6, -16.8], [25.8, -13.4], [21, -11.6], [14, -11.4], [9, -13], [7.2, -17]];
function triPal(o) {
  return { skin: pc(o, TRI_OWN), dark: pc(o, '#455878', C.zskinD, C.charL), far: pc(o, tone(TRI_OWN, -0.3), tone(C.zskin, -0.28)), belly: pc(o, '#c3cfdf', tone(C.zskin, 0.35), C.charL),
    frill: pc(o, '#93a9cc', tone(C.zskin, 0.15)), rim: pc(o, '#f08a24', '#c9b07a', C.charL), horn: pc(o, '#f6ead0', '#e8ecd2', C.charL), beak: pc(o, '#3c3f48', '#55603e', C.ink), nail: pc(o, '#f6ead0', '#e8ecd2', C.charL) };
}
function triLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = triPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': pillarLeg(c, R, M, 6, -12, 5.2, Pl.skin, Pl.nail, 1.35); return;
    case 'r:legF': pillarLeg(c, R, M, 3.6, -12, 5, Pl.far, Pl.nail, 1.3); return;
    case 'r:tail':   // one stubby piece (root under the body, outlined round its point)
      partEdges(c, poly([[-14, -22.2], [-19, -20.6], [-24, -18], [-28, -15.2], [-31.4, -12.8], [-31.6, -11.8], [-27, -12.6], [-22, -13.8], [-18, -13.4], [-14, -12.6]], R, 0.25), [[0, 9]], Pl.skin, M, { lw: 1.6 });
      return;
    case 'r:body':
      part(c, ring(-3, -17, 14.4, 8.8, R, 0.07, 11, -0.04), Pl.skin, M, { lw: 1.85 });
      brush(c, [[-13, -10.6], [-3, -9.2], [7, -10.6]], 3, Pl.belly, R, { taper: 0.4, dry: 0.35, bristles: 4 });
      if (!burnt) { for (let i = 0; i < 6; i++) dab(c, -13 + i * 4.2 + R(), -22.6 - Math.sin((i + 0.5) / 6 * Math.PI) * 2.2 + R() * 0.8, 0.95, Pl.dark, R);
        for (let i = 0; i < 4; i++) brush(c, [[-10 + i * 5, -18 + R()], [-11.4 + i * 5, -15.4 + R()]], 0.7, Pl.dark, R, { bristles: 2, dry: 0.3 }); }
      if (o.risen) ribs(c, -8, -17, 4, 7, 3.4, R);
      if (burnt) scorch(c, [[-6, -18, 2], [2, -16, 1.6]], R);
      scarf(c, o, TRI_OWN, [[7.4, -24.4], [9.8, -17.6], [8.6, -10.8]], [[8.6, -14], [4.6, -9.6]], 3.4, R);
      return;
    case 'r:head': case 'r:headD': {
      const dazed = L === 'r:headD';
      // the frill: a great shield tilted back, scalloped orange rim, spots
      const fr = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, r = i & 1 ? 1 : 1.1; fr.push([11 + Math.cos(a) * 7.4 * r * Math.cos(-0.5) - Math.sin(a) * 10 * r * Math.sin(-0.5), -25 + Math.cos(a) * 7.4 * r * Math.sin(-0.5) + Math.sin(a) * 10 * r * Math.cos(-0.5)]); }
      part(c, poly(fr, R, 0.25), Pl.frill, M, { lw: 1.6, sharp: true });
      brush(c, fr.slice(9, 14).concat(fr.slice(0, 3)), 1.6, Pl.rim, R, { taper: 0.2, dry: 0.3, bristles: 3 });
      if (!burnt) for (const [x, y] of [[6.4, -28.6], [9.6, -31.6], [12.8, -29.6]]) dab(c, x, y, 1.05, Pl.dark, R);
      // far brow horn (darker, behind the face), face, beak, nose horn, near brow horn
      part(c, poly([[13.6, -24.8], [23, -35.4], [15.8, -23.4]], R, 0.15), tone(Pl.horn, -0.2), M, { lw: 1.15, sharp: true });
      part(c, poly(TRI_FACE, R, 0.2), Pl.skin, M, { lw: 1.7 });
      part(c, poly([[23.4, -19.6], [28.6, -15.6], [27.8, -11.8], [24.4, -13.6]], R, 0.15), Pl.beak, M, { lw: 1.1, sharp: true });
      part(c, poly([[20.6, -20.8], [22.6, -26.4], [23.6, -20]], R, 0.12), Pl.horn, M, { lw: 1.05, sharp: true });
      part(c, poly([[15.4, -23.6], [26.4, -33], [17.8, -22]], R, 0.15), Pl.horn, M, { lw: 1.2, sharp: true });
      brush(c, [[16.4, -14.4], [20.4, -13.8], [24, -14.4]], 0.65, C.ink, R, { bristles: 2, dry: 0 });
      if (dazed && !o.dead) {   // swirly eyes, tongue out
        const sp = []; for (let k = 0; k <= 10; k++) { const a = k * 0.9, r = 0.3 + k * 0.17; sp.push([16.4 + Math.cos(a) * r, -19.6 + Math.sin(a) * r]); }
        dab(c, 16.4, -19.6, 2, C.white, R); brush(c, sp, 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
        brush(c, [[22, -13.4], [23.4, -11], [22.6, -9.6]], 1.3, '#ef8fa0', R, { bristles: 2, dry: 0, taper: 0.2 });
      } else eye(c, o, 16.4, -19.6, 1.6, R, 0.6);
      if (o.dead === 'dead') brush(c, [[22, -13.4], [23.6, -10.6]], 1.2, '#ef8fa0', R, { bristles: 2, dry: 0 });
      if (o.risen && !o.dead) zMouth(c, [[17, -14.2], [19.6, -14], [22.2, -14.2]], R, 0.45);
      return;
    }
  }
}
const TRIKE = {
  layer: triLayer,
  whole: {
    walk0: { L: gaitL(4, DN.trike.walkA, Math.PI / 2), lift: -0.4 }, walk1: { L: gaitL(4, DN.trike.walkA, 1.5 * Math.PI), lift: -0.4 },
    charge0: { L: [-0.85, -0.7, 0.85, 0.7], lift: -1.6 }, charge1: { L: [0.45, 0.3, -0.5, -0.35], S: [0.75, 0.8, 0.75, 0.8], lift: -0.6 },
  },
  rig: {
    driver: 'dino', q: 'trike',
    joints: { pivot: [-3, -15], legs: [[6, -12, 6, -12, 12], [3.6, -12, 3.6, -12, 12], [-11, -12, 6, -12, 12], [-13.4, -12, 3.6, -12, 12]], tail: [[-14.6, -17.6]], head: [8.6, -18.4],
      plan: ['l1', 'l3', 'tail', 'l0', 'l2', 'body', 'head'], deadH: 26 },
    parts(pose) {
      const ch = pose === 'charge0' || pose === 'charge1';
      const p = { l0: 'r:legN', l1: 'r:legF', l2: 'r:legN', l3: 'r:legF', t0: 'r:tail', body: 'r:body', head: pose === 'dazed' ? 'r:headD' : 'r:head', code: code(ch ? 'charge' : pose) };
      if (pose === 'atk') { p.ha = -0.38; p.hx = 1.6; p.pitch = -0.06; }
      else if (ch) { p.gait = 2; p.ha = 0.32; p.hx = 1.2; p.pitch = 0.08; p.ta0 = -0.15; p.kh = 3; p.kp = 1; }
      else if (pose === 'dazed') { p.gait = 0; p.ha = 0.42; p.pitch = 0.06; p.lift = 1.2; p.la = [-0.22, 0.18, 0.2, -0.16]; p.ta0 = -0.2; p.kh = 4; p.kb = 60; p.shake = 0.08; }
      return dp(p);
    },
  },
};

// ================================================================ STEGOSAURUS (r 16.5): green, orange plates, spiked tail
const STE_OWN = '#5b8f3c';
const STE_BODY = [[-15, -12.6], [-13, -18.6], [-7, -24.6], [0, -26.4], [6.4, -23.4], [10.4, -18], [11.4, -13.4], [8, -9.2], [0, -8.4], [-8, -8.6], [-13.6, -9.8]];
function stePal(o) {
  return { skin: pc(o, STE_OWN), dark: pc(o, '#33602a', C.zskinD, C.charL), far: pc(o, tone(STE_OWN, -0.3), tone(C.zskin, -0.28)), belly: pc(o, '#dbe7a0', tone(C.zskin, 0.35), C.charL),
    plate: pc(o, '#f08a24', '#c9b07a', C.charL), plateD: pc(o, '#c4621a', '#a8905e', C.char), spike: pc(o, '#f6ead0', '#e8ecd2', C.charL), nail: pc(o, '#f6ead0', '#e8ecd2', C.charL) };
}
function plate(c, R, M, x, y, h, w, col, lean = -0.15) {
  const tx = x + Math.sin(lean) * h, ty = y - Math.cos(lean) * h;
  part(c, poly([[x - w / 2, y + 1.6], [x - w * 0.55, y - h * 0.4], [tx, ty], [x + w * 0.55, y - h * 0.45], [x + w / 2, y + 1.6]], R, 0.2), col, M, { lw: 1.2, sharp: true });
}
function steLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = stePal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': pillarLeg(c, R, M, 7, -10, 4.4, Pl.skin, Pl.nail, 1.3, 0.4); return;
    case 'r:legF': pillarLeg(c, R, M, 4.8, -10, 4.2, Pl.far, Pl.nail, 1.25, 0.4); return;
    case 'r:legNH': part(c, ring(-9.4, -12.4, 4.4, 5, R, 0.1, 8, 0.2), Pl.skin, M, { lw: 1.4 }); pillarLeg(c, R, M, -9, -11, 5, Pl.skin, Pl.nail, 1.35, 1); return;
    case 'r:legFH': part(c, ring(-11.6, -12.4, 4.2, 4.8, R, 0.1, 8, 0.2), Pl.far, M, { lw: 1.3 }); pillarLeg(c, R, M, -11.2, -11, 4.8, Pl.far, Pl.nail, 1.3, 1); return;
    case 'r:tail':
      partEdges(c, poly([[-13, -17.6], [-19, -17.4], [-25, -17.8], [-25, -13.6], [-19, -12], [-13, -10]], R, 0.25), [[0, 2], [3, 5]], Pl.skin, M);
      if (!burnt) plate(c, R, M, -19, -17.4, 4.2, 4.2, Pl.plate, -0.35);
      return;
    case 'r:tip': {
      for (const [x, y, ex, ey] of [[-28.6, -18.2, -30.2, -26.4], [-32.6, -19.6, -35.2, -27.4], [-29.4, -16.2, -35.2, -11.6], [-33, -18, -40, -14.8]])   // four big tail spikes
        part(c, poly([[x - 2, y + 0.9], [ex, ey], [x + 2, y - 0.6]], R, 0.12), Pl.spike, M, { lw: 0.95, sharp: true });
      partEdges(c, poly([[-24.6, -17.8], [-30, -19.2], [-35, -21], [-35.4, -19.4], [-30, -16.4], [-24.6, -13.6]], R, 0.25), [[0, 5]], Pl.skin, M, { lw: 1.5 });
      return;
    }
    case 'r:body': {
      // two rows of plates along the arched back (far row darker, behind), then the body over their roots
      const top = (x) => -8.4 - 18 * Math.max(0, Math.cos((x + 1) / 15 * 1.5));
      if (!burnt) { for (const x of [-12.4, -6.2, 0, 6]) plate(c, R, M, x, top(x) + 1.4, 5 + 5 * Math.max(0, Math.cos(x / 13 * 1.4)), 5.4, Pl.plateD, -0.1);
        for (const x of [-9.4, -3, 3.2, 8.6]) plate(c, R, M, x, top(x) + 1.6, 4.6 + 5.4 * Math.max(0, Math.cos(x / 13 * 1.4)), 5.6, Pl.plate, -0.2); }
      else for (const x of [-9.4, -3, 3.2]) plate(c, R, M, x, top(x) + 1.6, 7, 5.6, C.charL, -0.2);
      part(c, poly(STE_BODY, R, 0.3), Pl.skin, M, { lw: 1.8 });
      brush(c, [[-12, -10.4], [-2, -9.6], [8, -11]], 2.6, Pl.belly, R, { taper: 0.4, dry: 0.35, bristles: 4 });
      if (!burnt) for (let i = 0; i < 5; i++) dab(c, -10 + i * 4.4 + R(), -17 + R() * 3, 0.9, Pl.dark, R);
      if (o.risen) ribs(c, -7, -16, 4, 7, 3.2, R);
      if (burnt) scorch(c, [[-4, -16, 2], [3, -14, 1.5]], R);
      scarf(c, o, STE_OWN, [[8.6, -21], [10.8, -15.4], [10.2, -10.2]], [[9.8, -13], [6, -9.4]], 3, R);
      return;
    }
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO' || o.dead === 'dead';
      strip(c, [[8, -15.6], [11, -14.6], [13.6, -13.6]], [6.4, 5.2, 4.6], Pl.skin, M);
      if (open) fill(c, poly([[16, -11.6], [21.2, -11.4], [20.4, -8.4], [16.4, -10]], R, 0.1), '#9e1f2a', R, { edge: 0 });
      part(c, poly([[12.6, -15.6], [16, -16.6], [19.6, -15], [21.4, -12.6], [20.4, -11.4], [16, -11], [13, -11.4]], R, 0.15), Pl.skin, M, { lw: 1.45 });
      if (open) part(c, poly([[15, -11.6], [20.4, -10.8], [19.6, -8.6], [15.4, -9.6]], R, 0.12), Pl.skin, M, { lw: 1.15 });
      else brush(c, [[15.2, -12.2], [18, -12], [20.6, -12.6]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
      eye(c, o, 16.4, -14.2, 1.3, R, open ? 0.8 : 0);
      dab(c, 20.4, -14, 0.38, C.ink, R);
      if (o.risen && !o.dead) zMouth(c, [[15.6, -12.2], [17.6, -12], [19.6, -12.2]], R, 0.4);
      return;
    }
    case 'r:swoosh':
      for (let i = 0; i < 3; i++) { const r = 14 + i * 3.2, pts = []; for (let k = 0; k <= 5; k++) { const a = lerp(-2.6, -1.4, k / 5); pts.push([-13 + Math.cos(a) * r, -14 + Math.sin(a) * r]); }
        brush(c, pts, 0.85, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 }); }
      return;
  }
}
const STEGO = {
  layer: steLayer,
  whole: { walk0: { L: gaitL(4, DN.stego.walkA, Math.PI / 2), lift: -0.4 }, walk1: { L: gaitL(4, DN.stego.walkA, 1.5 * Math.PI), lift: -0.4 } },
  rig: {
    driver: 'dino', q: 'stego',
    joints: { pivot: [-2, -14], legs: [[7, -10, 7, -10, 10], [4.8, -10, 4.8, -10, 10], [-9, -11, -9, -11, 11], [-11.2, -11, -11.2, -11, 11]], tail: [[-13.4, -14], [-24.6, -15.6]], head: [9.4, -15],
      plan: ['l1', 'l3', 'tail', 'l0', 'l2', 'body', 'head', 'tfx'], deadH: 26 },
    parts(pose) {
      const p = { l0: 'r:legN', l1: 'r:legF', l2: 'r:legNH', l3: 'r:legFH', t0: 'r:tail', t1: 'r:tip', body: 'r:body', head: pose === 'atk' ? 'r:headO' : 'r:head', code: code(pose) };
      if (pose === 'atk') { p.ha = 0.1; p.hx = 1.6; p.pitch = 0.04; }
      else if (pose === 'swipe') { p.gait = 0; p.ta0 = 0.55; p.ta1 = 0.75; p.pitch = 0.08; p.ha = 0.1; p.tfx = 'r:swoosh'; p.kt = 9; p.kp = 1.5; p.la = [0.06, 0.08, -0.1, -0.06]; }
      return dp(p);
    },
  },
};

// ================================================================ ANKYLOSAURUS (r 15.4): brown armour, spikes, tail club
const ANK_OWN = '#9b6b3e';
const ANK_BODY = [[-16, -8.6], [-14.6, -14.6], [-9, -19.4], [0, -20.8], [8, -19], [12.6, -14], [13, -8.8], [8, -6.8], [-6, -6.4], [-14, -7]];
function ankPal(o) {
  return { skin: pc(o, ANK_OWN), dark: pc(o, '#5c3a20', C.zskinD, C.charL), far: pc(o, tone('#86603e', -0.3), tone(C.zskin, -0.28)), flesh: pc(o, '#86603e'), knob: pc(o, '#d2a56a', tone(C.zskin, 0.3), C.charL),
    spike: pc(o, '#f6ead0', '#e8ecd2', C.charL), belly: pc(o, '#dcbf8e', tone(C.zskin, 0.35), C.charL), nail: pc(o, '#f6ead0', '#e8ecd2', C.charL) };
}
function ankLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = ankPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': pillarLeg(c, R, M, 8, -7.4, 4.4, Pl.flesh, Pl.nail, 1.3, 0.3); return;
    case 'r:legF': pillarLeg(c, R, M, 5.8, -7.4, 4.2, Pl.far, Pl.nail, 1.25, 0.3); return;
    case 'r:tail':
      partEdges(c, poly([[-13.6, -14], [-20, -13.4], [-26.6, -12.6], [-26.6, -9.4], [-20, -8.4], [-13.6, -7.4]], R, 0.2), [[0, 2], [3, 5]], Pl.skin, M);
      if (!burnt) for (const x of [-18, -22.6]) dab(c, x, -11.6, 1, Pl.knob, R);
      return;
    case 'r:tip':   // the thin end + the great bony club
      partEdges(c, poly([[-26, -12.4], [-31, -12], [-31, -9.8], [-26, -9.4]], R, 0.15), [[0, 3]], Pl.skin, M, { lw: 1.4 });
      part(c, ring(-35, -10.8, 4.8, 3.9, R, 0.12, 9), Pl.knob, M, { lw: 1.7 });
      if (!burnt) { dab(c, -36.4, -12, 1, tone(Pl.knob, -0.25), R); dab(c, -33.6, -9.4, 0.9, tone(Pl.knob, -0.25), R); dab(c, -36.6, -9.4, 0.7, tone(Pl.knob, -0.25), R); }
      return;
    case 'r:body': {
      // side spikes along the bottom edge (cream), the dome, rows of knobby armour
      for (let i = 0; i < 6; i++) { const x = -12.6 + i * 4.6, y = -7.2 - Math.sin(i / 5 * Math.PI) * 0.6;
        part(c, poly([[x - 1.5, y - 1.4], [x - 0.6 + (i - 2.5) * 0.3, y + 3], [x + 1.5, y - 1.2]], R, 0.12), Pl.spike, M, { lw: 0.95, sharp: true }); }
      part(c, poly(ANK_BODY, R, 0.3), Pl.skin, M, { lw: 1.9 });
      if (!burnt) {
        for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) {
          const x = -11.4 + r * 1.8 + i * 4.4, y = -9.6 - r * 3.6 - Math.sin((i + 0.5) / (6 - r) * Math.PI) * (2 - r * 0.4);
          part(c, ring(x, y, 1.45, 1.15, R, 0.12, 6), Pl.knob, M, { lw: 0.8 });
        }
        for (const [x, y] of [[-6, -20.4], [1, -21.2], [7, -19.4]]) part(c, poly([[x - 1.3, y + 1], [x + 0.2, y - 2.2], [x + 1.4, y + 0.8]], R, 0.1), Pl.spike, M, { lw: 0.9, sharp: true });
      }
      if (o.risen) ribs(c, -6, -12.6, 4, 6, 3.2, R);
      if (burnt) scorch(c, [[-4, -13, 2], [4, -12, 1.5]], R);
      scarf(c, o, ANK_OWN, [[10.2, -16.6], [12.4, -11.4], [11.4, -7]], [[11.6, -9], [8, -5.8]], 2.8, R);
      return;
    }
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO' || o.dead === 'dead';
      part(c, poly([[10.4, -14.4], [8, -17.6], [12.4, -15.8]], R, 0.1), Pl.spike, M, { lw: 0.95, sharp: true });   // a horn back off the skull
      if (open) fill(c, poly([[16, -9], [21.8, -9.2], [21, -5.2], [16, -7.4]], R, 0.1), '#9e1f2a', R, { edge: 0 });
      part(c, poly([[10.2, -14], [15, -15.2], [19.6, -12.8], [21.6, -10], [20.4, -8.2], [14.6, -7.6], [10.6, -8.4]], R, 0.15), Pl.flesh, M, { lw: 1.5 });
      if (open) part(c, poly([[14.6, -8.4], [20.6, -7.8], [19.8, -5.4], [15, -6.4]], R, 0.1), Pl.flesh, M, { lw: 1.1 });
      else brush(c, [[15, -9.2], [18, -9], [21, -9.6]], 0.55, C.ink, R, { bristles: 2, dry: 0 });
      part(c, poly([[14.4, -15.4], [16.6, -17.6], [17.2, -14.6]], R, 0.1), Pl.knob, M, { lw: 0.85, sharp: true });
      eye(c, o, 16, -12, 1.3, R, open ? 0.8 : 0.5);
      dab(c, 20.6, -11.2, 0.38, C.ink, R);
      if (o.risen && !o.dead) zMouth(c, [[15.4, -9.2], [17.6, -9], [19.8, -9.2]], R, 0.4);
      return;
    }
    case 'r:swoosh':
      for (let i = 0; i < 3; i++) { const r = 16 + i * 3.4, pts = []; for (let k = 0; k <= 5; k++) { const a = lerp(-2.9, -1.5, k / 5); pts.push([-14 + Math.cos(a) * r, -11 + Math.sin(a) * r]); }
        brush(c, pts, 0.85, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 }); }
      return;
  }
}
const ANKYLO = {
  layer: ankLayer,
  whole: { walk0: { L: gaitL(4, DN.ankylo.walkA, Math.PI / 2), lift: -0.3 }, walk1: { L: gaitL(4, DN.ankylo.walkA, 1.5 * Math.PI), lift: -0.3 } },
  rig: {
    driver: 'dino', q: 'ankylo',
    joints: { pivot: [-2, -11], legs: [[8, -7.4, 8, -7.4, 7.4], [5.8, -7.4, 5.8, -7.4, 7.4], [-10, -7.4, 8, -7.4, 7.4], [-12.2, -7.4, 5.8, -7.4, 7.4]], tail: [[-13.6, -11], [-26.4, -10.8]], head: [11.4, -11],
      plan: ['l1', 'l3', 'tail', 'l0', 'l2', 'body', 'head', 'tfx'], deadH: 20 },
    parts(pose) {
      const p = { l0: 'r:legN', l1: 'r:legF', l2: 'r:legN', l3: 'r:legF', t0: 'r:tail', t1: 'r:tip', body: 'r:body', head: pose === 'atk' ? 'r:headO' : 'r:head', code: code(pose) };
      if (pose === 'atk') { p.ha = 0.1; p.hx = 1.4; }
      else if (pose === 'club') { p.gait = 0; p.ta0 = 0.95; p.ta1 = 0.85; p.pitch = 0.1; p.ha = 0.12; p.tfx = 'r:swoosh'; p.kt = 10; p.kp = 1.2; p.la = [0.06, 0.08, -0.08, -0.06]; }
      return dp(p);
    },
  },
};

// ================================================================ LONGNECK (r 26.4): blue-green, pillar legs, long neck + tail
const LNG_OWN = '#4c9a9a';
const LNG_BODY = [[-26, -32], [-20, -40], [-6, -45], [8, -43], [16, -37], [18.4, -29], [14, -22], [2, -19.6], [-12, -19.6], [-22, -22], [-27, -27]];
function lngPal(o) {
  return { skin: pc(o, LNG_OWN), dark: pc(o, '#2c6466', C.zskinD, C.charL), far: pc(o, tone(LNG_OWN, -0.3), tone(C.zskin, -0.28)), belly: pc(o, '#c4e6d8', tone(C.zskin, 0.35), C.charL),
    spot: pc(o, '#357c80', C.zskinD, C.charL), nail: pc(o, '#f6ead0', '#e8ecd2', C.charL), cheek: pc(o, '#f29aa6', '#c9b07a', C.charL) };
}
function lngLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = lngPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:legN': pillarLeg(c, R, M, 9, -24, 7.6, Pl.skin, Pl.nail, 1.7, 0.6); return;
    case 'r:legF': pillarLeg(c, R, M, 5.6, -24, 7.2, Pl.far, Pl.nail, 1.6, 0.6); return;
    case 'r:tail': strip(c, [[-20, -33], [-28, -31.6], [-36.6, -29.4]], [12, 9, 7], Pl.skin, M, 0, { lw: 1.9 }); return;
    case 'r:mid': strip(c, [[-36, -29.6], [-42, -27.8], [-47.4, -25.6]], [7.2, 5.6, 4.2], Pl.skin, M, 0, { lw: 1.8 }); if (!burnt) dab(c, -41.4, -27.6, 0.9, Pl.spot, R); return;
    case 'r:tip': strip(c, [[-47, -25.8], [-52.6, -23.4], [-58.6, -20.2]], [4.4, 2.8, 0.8], Pl.skin, M, 1, { lw: 1.6 }); return;
    case 'r:body':
      part(c, poly(LNG_BODY, R, 0.4), Pl.skin, M, { lw: 2.1 });
      brush(c, [[-20, -23], [-6, -21], [8, -22], [15, -26]], 5, Pl.belly, R, { taper: 0.5, dry: 0.35, bristles: 6 });
      if (!burnt) for (const [x, y, r] of [[-16, -36, 2], [-9, -40, 1.6], [-2, -37, 2.2], [6, -39, 1.5], [-12, -30, 1.4], [3, -30, 1.7], [-21, -29, 1.2]]) dab(c, x, y, r, Pl.spot, R);
      if (o.risen) ribs(c, -10, -32, 5, 10, 4, R);
      if (burnt) scorch(c, [[-8, -34, 3], [4, -31, 2.4], [-18, -28, 2]], R);
      return;
    case 'r:neck0':
      strip(c, [[9.4, -33], [13.6, -42], [16.8, -50], [19.2, -55]], [12, 9.6, 8, 7.4], Pl.skin, M, 0, { lw: 1.9 });
      if (!burnt) { dab(c, 14.6, -44, 1.2, Pl.spot, R); dab(c, 12, -38.6, 1.4, Pl.spot, R); }
      scarf(c, o, LNG_OWN, [[8.4, -42.6], [12.6, -40.6], [18.8, -40.8]], [[16.6, -40.4], [20.4, -35.4]], 4, R);
      return;
    case 'r:neck1':
      strip(c, [[18.4, -53.4], [20.8, -60], [22.6, -66], [23.8, -70]], [7.6, 6.8, 6.4, 6], Pl.skin, M, 0, { lw: 1.8 });
      if (!burnt) dab(c, 21, -61, 0.9, Pl.spot, R);
      return;
    case 'r:head': case 'r:headO': {
      const open = L === 'r:headO' || o.dead === 'dead';
      part(c, poly([[20.4, -70.4], [23, -74.4], [28, -75], [32, -72.6], [33.4, -69.6], [31.6, -67.4], [26, -66.4], [21.6, -67.2]], R, 0.2), Pl.skin, M, { lw: 1.6 });
      if (open) { fill(c, ring(30.2, -67.6, 2, 1.4, R, 0.1, 6), '#9e1f2a', R, { edge: 0 }); brush(c, [[27.4, -68.2], [32.6, -68.4]], 0.6, C.ink, R, { bristles: 2, dry: 0 }); }
      else brush(c, [[26.4, -68.4], [29.6, -67.6], [32.4, -68.8]], 0.65, C.ink, R, { bristles: 2, dry: 0 });   // a smile
      if (!o.dead && !burnt && !o.risen) dab(c, 27.4, -69.6, 1.05, Pl.cheek, R);
      dab(c, 32, -71.6, 0.45, C.ink, R);
      eye(c, o, 26.2, -71.4, 1.45, R, 0);
      if (o.risen && !o.dead) zMouth(c, [[27, -68.2], [29.2, -67.8], [31.4, -68.4]], R, 0.4);
      return;
    }
    case 'r:boom':   // stomp: impact lines + dust round the front feet
      for (let i = 0; i < 7; i++) dab(c, 8 + (R() - 0.5) * 26, -1 + (R() - 0.4) * 5, 1.6 + R() * 1.6, i & 1 ? C.paperD : '#d8c7a2', R);
      for (let i = 0; i < 6; i++) { const a = -2.9 + i * 0.5, x0 = 8 + Math.cos(a) * 11, y0 = -2 + Math.sin(a) * 6; brush(c, [[x0, y0], [8 + Math.cos(a) * 19, -2 + Math.sin(a) * 11]], 1.5, C.ink, R, { bristles: 2, dry: 0.25, taper: 0.6 }); }
      return;
  }
}
const LONGNECK = {
  layer: lngLayer,
  whole: {
    walk0: { L: gaitL(4, DN.longneck.walkA, Math.PI / 2), lift: -0.8 }, walk1: { L: gaitL(4, DN.longneck.walkA, 1.5 * Math.PI), lift: -0.8 },
  },
  rig: {
    driver: 'dino', q: 'longneck',
    joints: { pivot: [-14, -26], legs: [[9, -24, 9, -24, 24], [5.6, -24, 5.6, -24, 24], [-14, -24, 9, -24, 24], [-17.4, -24, 5.6, -24, 24]],
      tail: [[-21, -31], [-36.4, -29.4], [-47.2, -25.6]], neck: [[11, -36], [18.6, -53.6]], head: [23.4, -68.6],
      plan: ['l1', 'l3', 'tail', 'l0', 'l2', 'body', 'head', 'gfx'], deadH: 44 },
    parts(pose) {
      const p = { l0: 'r:legN', l1: 'r:legF', l2: 'r:legN', l3: 'r:legF', t0: 'r:tail', t1: 'r:mid', t2: 'r:tip', body: 'r:body', n0: 'r:neck0', n1: 'r:neck1', head: pose === 'atk' ? 'r:headO' : 'r:head', code: code(pose) };
      p.ta0 = 0.04; p.ta1 = 0.06; p.ta2 = 0.04;
      if (pose === 'atk') { p.na0 = 0.25; p.na1 = 0.3; p.ha = 0.3; }
      else if (pose === 'rear') { p.gait = 0; p.pitch = -0.36; p.na0 = -0.2; p.na1 = -0.08; p.ha = 0.15; p.la = [-0.75, -0.45, 0.06, 0.1]; p.lf = [0.2, 0.25, 0, 0]; p.ta0 = 0.3; p.ta1 = 0.08; p.kn = -1.5; p.kp = -1; }
      else if (pose === 'stomp') { p.gait = 0; p.pitch = 0.05; p.lift = 1.2; p.na0 = 0.12; p.na1 = 0.2; p.ha = 0.1; p.la = [-0.12, 0.08, 0.04, -0.04]; p.gfx = 'r:boom'; p.kb = 160; p.kn = 3; p.kt = -3; p.kp = 1.4; }
      return dp(p);
    },
  },
};

// ================================================================ the spit glob (projectile 'spit')
export const PROJ = {
  spit: {
    box: [18, 14, 10, 7], n: 3, boil: true, lift: 7, shadow: 0.32,
    paint(c, R, v, M) {
      brush(c, [[-2, 0.4], [-5.4, 0.9], [-7.6, 0.2]], 1.6, '#a8d82e', R, { bristles: 2, taper: 0.8, dry: 0.3 });   // a trail of goo
      part(c, ring(0, 0, 3.3, 2.8, R, 0.18, 8), '#c8ec3a', M, { lw: 1.1 });
      dab(c, -0.9, -1, 0.9, C.white, R);
      dab(c, 1.4, 3.2, 0.7, '#a8d82e', R); dab(c, -3, 2.6, 0.55, '#a8d82e', R);
    },
    // lobbed: lifted by p.z, or by an arc over its life when the sim keeps p.apex (+ maxLife / life), with a ground shadow
    draw(p, x, y, ang, rt, i, api) {
      let z = p.z > 0 ? p.z : 0;
      if (!(z > 0) && p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; z = 4 * p.apex * f * (1 - f); }
      api.shadowAt(x, y, 0.32, 0.7);
      const spr = api.bit(api.sprite, (rt * 8 + i) % 3 | 0);
      if (spr) api.put(spr, x, y - 7 - z, 1, Math.atan2(Math.sin(ang), Math.cos(ang)) * 0.3);
      return true;
    },
  },
};

// ================================================================ the registry
const ent = (T, e) => Object.assign({ scale: 1, lie: 'none', paint(c, o) { paintDino(c, o, T); }, rig: T.rig }, e);
const P_RAP = ['r:legN', 'r:legF', 'r:armN', 'r:body', 'r:tail', 'r:tip', 'r:head', 'r:headO'];
export const SPRITES = {
  // RAPTOR: poses + fields in the header. Floppy ('dino'): legs step from the big thighs, body pitches, the stiff tail swings
  // in two pieces after it, the big head lags + snaps its jaws open, the little clawed arms flap.
  raptor: ent(RAPTOR, {
    box: [50, 40, 26, 32], own: RAP_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['run0', 'run1', 'leap', 'pin', ...P_RAP],
    pick(u, info) { const a = act(u); if (a === 1) return 'leap'; if (a === 2) return 'pin'; if (u.attack > 0) return 'atk'; if (speed(u) > 160) return info.walkFrame ? 'run1' : 'run0'; return null; },
  }),
  spitter: ent(SPITTER, {
    box: [46, 40, 24, 34], own: SPIT_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['spit', ...P_RAP, 'r:headS'],
    pick(u) { const a = act(u); if (a === 1) return 'spit'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // TREX: floppy ('dino'): heavy footfalls bounce the body + nod the head, the tail swings after in two pieces, the jaw drops on
  // its own spring (roar: head thrown back; bite: lunged down), tiny arms flap. 'hold' + 'jawU' are drawn whole (gator-style).
  trex: ent(TREX, {
    box: [104, 86, 50, 70], own: REX_OWN, mouth: REX_MOUTH, poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['roar', 'bite', 'hold', 'jawU', 'r:legN', 'r:legF', 'r:armN', 'r:body', 'r:tail', 'r:tip', 'r:jaw', 'r:head', 'r:roar'],
    pick(u) { const a = act(u); if (a === 3) return 'hold'; if (a === 2) return 'bite'; if (a === 1) return 'roar'; if (u.attack > 0) return 'atk'; return null; },
    /** the victim held in its jaws (b.act 3): for a gator-style draw (see Asks); 0 = none. */
    holds(u) { return u.b && u.b.act === 3 && u.b.victim >= 0 ? u.b.victim : 0; },
  }),
  // PTERO: floppy ('ptero'): wingbeat about the shoulders (the far wing a beat behind), body bobs against it, head + tail +
  // legs on springs; dive sweeps the wings back, carry beats hard with the claws open.
  ptero: ent(PTERO, {
    box: [60, 48, 30, 40], own: PTE_OWN, flying: true, poses: ['fly0', 'fly1', 'glide', 'atk'], extra: ['dive', 'carry', 'stand', 'r:wingB', 'r:wingF', 'r:tail', 'r:legs', 'r:legsD', 'r:body', 'r:head', 'r:headO'],
    pick(u, info) {
      const a = act(u); if (a === 1) return 'dive'; if (a === 2) return 'carry';
      if (!((u.z || 0) > 4)) return 'stand';
      if (u.attack > 0) return 'atk';
      const t = info.rt + (u.id % 7) * 0.43;
      if (t % 3 > 2) return 'glide';
      return (Math.floor(t * 8) & 1) ? 'fly1' : 'fly0';
    },
  }),
  // TRIKE: floppy ('dino'): stumpy legs trot (gallop charging), the frilled head nods + tosses up to jab, swings low charging.
  trike: ent(TRIKE, {
    box: [70, 58, 35, 46], own: TRI_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['charge0', 'charge1', 'dazed', 'r:legN', 'r:legF', 'r:body', 'r:tail', 'r:head', 'r:headD'],
    pick(u, info) { const a = act(u); if (a === 1) return info.walkFrame ? 'charge1' : 'charge0'; if (a === 2) return 'dazed'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // STEGO: floppy ('dino'): the spiked tail swings in two pieces (whips round on the swipe), the plated body rocks.
  stego: ent(STEGO, {
    box: [72, 62, 46, 52], own: STE_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['swipe', 'r:legN', 'r:legF', 'r:legNH', 'r:legFH', 'r:body', 'r:tail', 'r:tip', 'r:head', 'r:headO', 'r:swoosh'],
    pick(u) { const a = act(u); if (a === 1) return 'swipe'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // ANKYLO: floppy ('dino'): low and heavy, the club tail wags on the stride and swings up over the back to club.
  ankylo: ent(ANKYLO, {
    box: [70, 54, 45, 42], own: ANK_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['club', 'r:legN', 'r:legF', 'r:body', 'r:tail', 'r:tip', 'r:head', 'r:headO', 'r:swoosh'],
    pick(u) { const a = act(u); if (a === 1) return 'club'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // LONGNECK: floppy ('dino'): each pillar-leg step drops the body (it jiggles), the two-piece neck sways after the body, the
  // three-piece tail swings; rear tips it back on its hind legs, the stomp slams it down (big bounce, neck whips).
  longneck: ent(LONGNECK, {
    box: [124, 128, 62, 96], own: LNG_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['rear', 'stomp', 'r:legN', 'r:legF', 'r:body', 'r:tail', 'r:mid', 'r:tip', 'r:neck0', 'r:neck1', 'r:head', 'r:headO', 'r:boom'],
    pick(u) { const a = act(u); if (a === 1) return 'rear'; if (a === 2) return 'stomp'; if (u.attack > 0) return 'atk'; return null; },
  }),
};
