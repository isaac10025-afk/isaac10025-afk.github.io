// Animal sprites, POSTER PAINT look (look A, kid's tempera painting). Owner: ANIMALS art agent. Contract: ART.md.
// Every entry paints ONE frame facing right, feet at (0,0), up = -y, in sim px. Animals keep their natural colours;
// in Team battle (o.col !== entry.own) they wear the team colour as a painted scarf / band (kid-a cheetah).
// o.dead 'dead' = on its back, legs up, X eyes (lie: 'none': painted lying, RENDER must not rotate it);
// o.dead 'burnt' = the same, all charcoal. o.risen = zombie copy: fur C.zskin, milky eye, stitched mouth.
// o.singed (or o.bare / o.hatless) = OG "naked": fur burnt off (boar, ape, cheetah: OG look.fur + u.singed).
//
// Entry hooks beyond ART.md (RENDER honours them, render/art/index.js):
//   pick(u, t, world) -> pose name, or null for RENDER's default (atk while u.attack > 0.35, walk0 / walk1 by distance,
//                        else poses[0]). t = world.time (s). Every rule is in the entry's comment too. Never writes to u.
//   poseR { pose: r }  -> the radius a pose is painted at (anthill sizes): RENDER scales by u.radius / poseR[pose].
//   noFlip             -> never mirrored (anthill).
//   drawUnit(ctx, u, x, y, flip, k, t, api)  snake: the body chain from u.b.body + its head sprite (api.get / api.put)
//   over(ctx, u, x, y, flip, k, t, world)    frog: the tongue, after the frog's sprite
//   drawCorpse(ctx, rec, x, y, k, t)         snake: a dead body from world.snakes.dead
//   For the last three ctx is at the identity transform, (x, y) = the anchor in DEVICE px, k = device px per sim px,
//   t = world.time; api.put takes SIM px.
import { C, TAU, lerp, clamp, tone, brush, ring, poly, part, dab, tube, fill, outline, spline, shift, path, canvas, rng, hash, M0, tooth, hexRgb, rgbHex } from './paint.js';

const ST = { IDLE: 0, ADVANCE: 1, ENGAGE: 2, ALERT: 3, CHARGE: 4, FLEE: 5 }; // OG game.js:9219
const DEEP = 0.75; // OG deep water (sim/const.js DEEP); rats, frogs, gators, piranhas swim from here (OG game.js:20864)
const MILK = '#e7edd6';

// ---------------------------------------------------------------- shared helpers
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const teamOf = (o, own) => (o.col && !sameCol(o.col, own)) ? o.col : null;
const bare = o => !!(o.singed || o.bare || o.hatless);
/** colour for a part: natural / zombie / charcoal. */
const pc = (o, nat, zom, burnt = C.char) => o.dead === 'burnt' ? burnt : (o.risen && zom) ? zom : nat;
const speed = u => Math.hypot(u.vx || 0, u.vy || 0);
/** a 2-frame cycle on the world clock (fps frames a second), offset per unit so a crowd doesn't step as one. */
const cyc = (u, t, fps) => (((t || 0) * fps + (u.id || 0) * 0.37) | 0) & 1;
const bell = a => a <= 0 ? 0 : Math.sin(Math.PI * Math.min(1, a)); // attack 1 -> 0, peak in the middle

const HEX6 = /^#[0-9a-f]{6}$/i;
/** colour a mixed t of the way to b (OG mix()); a stays if either isn't a #rrggbb colour. */
function mixHex(a, b, t) {
  if (!HEX6.test(a) || !HEX6.test(b)) return a;
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** A context that paints nowhere: replaying a painting on it uses up R exactly as the real one did (see gator 'jawU'). */
let nowhere = null;
const nowhereCtx = () => nowhere || (nowhere = canvas(2, 2).getContext('2d'));
/** The seed RENDER's bake (sprites.js paintEntry) uses for this frame in another pose: same type, colour, variant, flags. */
function bakeSeed(o, pose) {
  const risen = o.risen ? (o.risen === 'bone' ? 2 : 1) : 0;
  return hash(`${o.type}|${o.col}|${pose}|${o.v}|${o.dead}${risen ? '|risen' + risen : ''}${o.bare ? '|bare' : ''}${o.kindled ? '|kindled' : ''}`);
}

function about(c, cx, cy, a, fn) { if (!a) { fn(); return; } c.save(); c.translate(cx, cy); c.rotate(a); c.translate(-cx, -cy); fn(); c.restore(); }
function moved(c, dx, dy, fn) { c.save(); c.translate(dx, dy); fn(); c.restore(); }
/** lay a standing painting on its back: y -> -h - y (feet up, the back touching the ground). */
function onBack(c, h, fn) { c.save(); c.translate(0, -h); c.scale(1, -1); fn(); c.restore(); }
const rotP = (x, y, cx, cy, a) => { const s = Math.sin(a), co = Math.cos(a), dx = x - cx, dy = y - cy; return [cx + dx * co - dy * s, cy + dx * s + dy * co]; };

function leg(c, pts, w, col, R) { brush(c, pts, w, col, R, { bristles: Math.max(2, Math.round(w * 1.2)), taper: 0.15, dry: 0.12, swell: 0.08 }); }
function xEye(c, x, y, s, R, col = C.ink, w = 0.7) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, col, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, col, R, { bristles: 2, dry: 0, taper: 0 });
}
/** An eye. kind: 'dot' (black dab) | 'white' (white with a pupil) | 'red' (charging). Dead: X. Risen: milky, pupil adrift. */
function eye(c, o, x, y, r, R, kind = 'dot') {
  if (o.dead) { xEye(c, x, y, r * 0.95, R, C.ink, Math.max(0.5, r * 0.55)); return; }
  if (o.risen) { dab(c, x, y, r * 1.25, MILK, R); dab(c, x + r * 0.45, y + r * 0.35, r * 0.42, C.ink, R); return; }
  if (kind === 'white') { dab(c, x, y, r, C.white, R); dab(c, x + r * 0.3, y + r * 0.05, r * 0.55, C.ink, R); return; }
  if (kind === 'red') { dab(c, x, y, r * 1.2, C.red, R); dab(c, x + r * 0.2, y, r * 0.5, C.ink, R); return; }
  dab(c, x, y, r, C.ink, R);
}
/** a zombie's stitched mouth along pts. */
function zMouth(c, pts, R, w = 0.55) {
  brush(c, pts, w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  for (let i = 1; i < pts.length; i++) { const [x, y] = pts[i]; brush(c, [[x, y - w * 1.6], [x, y + w * 1.6]], w * 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
}
/** risen ribs: a few ink arcs over the flank. */
function ribs(c, x, y, n, h, gap, R) {
  for (let i = 0; i < n; i++) { const X = x + i * gap;
    brush(c, [[X - 0.3, y - h * 0.5], [X + 0.45, y - h * 0.25], [X + 0.7, y], [X + 0.45, y + h * 0.25], [X - 0.3, y + h * 0.5]], 0.6, tone(C.zskinD, -0.45), R, { bristles: 2, dry: 0.15, taper: 0.35 }); }
}
/** scorch marks + a few singed wisps (fur burnt off, or burnt corpses). */
function scorch(c, pts, R, col = C.char) { for (const [x, y, r] of pts) dab(c, x, y, r, col, R, 0.35); }
/** the team scarf (kid-a cheetah): a band round the neck plus a flapping end. */
function scarf(c, o, own, band, end, w, R) {
  const col = teamOf(o, own); if (!col) return;
  const k = o.dead === 'burnt' ? C.charL : col;
  brush(c, band, w, k, R, { taper: 0.1, dry: 0.1, bristles: 3 });
  if (end) brush(c, end, w * 0.78, k, R, { taper: 0.6, dry: 0.2, bristles: 3 });
}

// ---------------------------------------------------------------- floppy bodies (rig-quad.js, RIG.md)
// A rigged entry also paints its parts: pose 'r:<layer>' = ONE layer of the figure in its rest place (feet at 0,0,
// facing right). o.L = the layer while painting a part. Dead parts are painted on their back like the whole dead frame.
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
/** A fill with its ink outline only along pts[i0..i1] (the rest of its edge hides under the part it joins: no seam). */
function partOpen(c, pts, i0, i1, col, M, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  const R = M.R, P = [];
  for (let i = i0; i <= i1; i++) { const p = pts[i % pts.length]; P.push([p[0] + (R() - 0.5) * 0.8, p[1] + (R() - 0.5) * 0.8]); }
  brush(c, P, o.lw ?? M.lw, C.ink, R, { bristles: 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 });
}
/** rig.parts() result with every field the 'quad' driver reads (numbers default to 0, parts to none). */
const quadParts = (p) => Object.assign({ l0: null, l1: null, l2: null, l3: null, body: null, head: null, tail: null, tip: null, jawL: null, rider: null,
  gait: 1, headA: 0, hx: 0, lift: 0, pitch: 0, tailT: 0, up: 0, dn: 0, rlean: 0 }, p);
const WOBBLE = (pose) => ({ main: pose });

// ================================================================ BOAR
const BOAR_OWN = '#6f4b33';
const BOAR_LEGS = { // [near front, far front, near back, far back], hips at x 6 / 3.8 / -7 / -9.3
  idle: [[[6, -7], [6.3, -3.5], [6.6, 0]], [[3.8, -7], [4, -3.5], [4.2, 0]], [[-7, -7], [-7.3, -3.5], [-7.2, 0]], [[-9.3, -7], [-9.6, -3.5], [-9.6, 0]]],
  walk0: [[[6, -7], [8, -3.6], [9.4, -0.3]], [[3.8, -7], [2.6, -3.4], [1.6, 0]], [[-7, -7], [-9, -3.5], [-10.2, 0]], [[-9.3, -7], [-7.6, -3.6], [-6.4, -0.3]]],
  walk1: [[[6, -7], [4.6, -3.4], [3.6, 0]], [[3.8, -7], [5.6, -3.6], [6.8, -0.3]], [[-7, -7], [-5.6, -3.6], [-4.4, -0.3]], [[-9.3, -7], [-11, -3.5], [-12, 0]]],
  run0: [[[6, -7], [10, -5.4], [13.6, -3.2]], [[3.8, -7], [7.8, -4.6], [11.4, -2.2]], [[-7, -7], [-11, -4.8], [-14.6, -2.8]], [[-9.3, -7], [-12.8, -5.4], [-16.2, -3.8]]],
  run1: [[[6, -7], [4.2, -3.8], [1.6, -1.2]], [[3.8, -7], [2.6, -3.4], [0, -0.6]], [[-7, -7], [-4.6, -4.2], [-2, -1.4]], [[-9.3, -7], [-6.8, -3.8], [-4.4, -0.8]]],
  paw0: [[[6, -7], [9.4, -6], [10.6, -3.2]], [[3.8, -7], [4, -3.5], [4.2, 0]], [[-7, -7], [-7.3, -3.5], [-7.2, 0]], [[-9.3, -7], [-9.6, -3.5], [-9.6, 0]]],
  paw1: [[[6, -7], [5.2, -3.8], [2.2, -1]], [[3.8, -7], [4, -3.5], [4.2, 0]], [[-7, -7], [-7.3, -3.5], [-7.2, 0]], [[-9.3, -7], [-9.6, -3.5], [-9.6, 0]]],
};
// rig parts (o.L): legN / legF (the near / far fore leg at rest; the driver moves it to the hind hip too), tail, body
// (the silhouette without the head, rounded off at the neck), head (the wedge, its outline open at the neck; o.red = red eye)
const BOAR_BODY = [[-12.6, -9], [-12, -13.6], [-8, -16.2], [-1.4, -18.6], [4.6, -19.2], [8.4, -17.6], [10.8, -14.4], [11.4, -10], [9.4, -6], [5.6, -5.8], [-1, -5.3], [-8.4, -5.6]];
const BOAR_HEAD = [[6.2, -17.6], [8.4, -17.6], [11.2, -15.6], [15.6, -11.8], [18.2, -8.8], [17.6, -6.2], [13, -5.4], [9.4, -6], [6.8, -7.8], [5.6, -12.4]];
function boarDraw(c, o) {
  const R = o.R, M = o.M, Lr = o.L, pose = o.dead || Lr ? 'idle' : o.pose, burnt = o.dead === 'burnt', naked = bare(o) && !burnt;
  const body = naked ? '#eba08c' : pc(o, BOAR_OWN, C.zskin), dark = naked ? '#c06d5f' : pc(o, '#3b2a21', C.zskinD);
  const belly = naked ? '#f6c3b1' : pc(o, '#9b6c49', tone(C.zskin, 0.3), C.charL), snoutC = pc(o, '#e59a88', '#cfe0a4', C.charL);
  const legC = pc(o, '#2a1f19', C.zskinD), hoof = pc(o, C.ink, C.ink);
  const charge = pose === 'run0' || pose === 'run1', pawing = pose === 'paw0' || pose === 'paw1';
  const lift = charge ? -1.2 : 0, headA = pose === 'atk' ? -0.55 : charge ? 0.14 : pawing ? 0.22 : 0;
  const L = BOAR_LEGS[pose] || BOAR_LEGS[pose === 'atk' ? 'walk0' : 'idle'];
  // far legs (a shade darker), tail, near legs, all under the body
  if (!Lr || Lr === 'legF') for (const i of Lr ? [1] : [1, 3]) { leg(c, L[i], 2.7, tone(legC, -0.25), R); dab(c, L[i][2][0] + 0.4, L[i][2][1] - 0.4, 1.25, hoof, R); }
  if (!Lr || Lr === 'tail') moved(c, 0, lift, () => {
    brush(c, [[-12.2, -12], [-15, -13.6], [-16.2, -11.4], [-14.6, -10.4]], 0.95, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.2 });
    dab(c, -14.4, -10.3, 1, dark, R);
  });
  if (!Lr || Lr === 'legN') for (const i of Lr ? [0] : [0, 2]) { leg(c, L[i], 2.9, legC, R); dab(c, L[i][2][0] + 0.4, L[i][2][1] - 0.4, 1.35, hoof, R); }
  if (Lr && Lr !== 'body' && Lr !== 'head') return;
  const wantB = !Lr || Lr === 'body', wantH = !Lr || Lr === 'head';
  moved(c, 0, lift, () => {
    // one rounded silhouette: a great hump of shoulders sloping to small hindquarters, and the wedge of a head
    // (swung up about the neck to gore, OG "a wedge of a head that swings up with a gore")
    const hp = (x, y) => rotP(x, y, 7.6, -12.4, headA);
    if (!Lr) part(c, poly([[-12.6, -9], [-12, -13.6], [-8, -16.2], [-1.4, -18.6], [4.6, -19.2], hp(8.4, -17.6), hp(11.2, -15.6), hp(15.6, -11.8),
      hp(18.2, -8.8), hp(17.6, -6.2), hp(13, -5.4), hp(9.4, -6), [5.6, -5.8], [-1, -5.3], [-8.4, -5.6]], R, 0.3), body, M);
    else if (wantB) part(c, poly(BOAR_BODY, R, 0.3), body, M);
    else partOpen(c, poly(BOAR_HEAD, R, 0.25), 0, 7, body, M);
    if (wantB && !naked && !burnt) { // the mane: tufts of bristles, tallest over the shoulders, one with a dark spine stripe
      brush(c, [[-11.4, -13.2], [-6, -16.4], [0, -18.4], [6.4, -18.6]], 2.2, dark, R, { taper: 0.3, dry: 0.3 });
      for (let i = 0; i < 9; i++) {
        const x = -10 + i * 2.1, top = x < -6 ? lerp(-13.4, -16, (x + 10) / 4) : x < 4 ? lerp(-16, -19, (x + 6) / 10) : -18.8;
        const len = 1.6 + 2.6 * Math.max(0, 1 - Math.abs(x - 2.5) / 9) + R() * 0.8;
        brush(c, [[x, top + 0.8], [x - 1.4, top - len]], 1.25, dark, R, { bristles: 2, taper: 0.8, dry: 0.2 });
      }
    }
    if (wantB) {
      for (let i = 0; i < 4; i++) { const x = -8 + i * 3.6 + R(), y = -11 + R() * 2.5; brush(c, [[x + 1.2, y - 0.4], [x - 0.8, y + 0.3]], 0.6, dark, R, { bristles: 2, dry: 0.3 }); }
      brush(c, [[-8.4, -7], [-1, -6.6], [5.4, -7.6]], 1.8, belly, R, { taper: 0.5, dry: 0.4 });
      if (naked || burnt) scorch(c, [[-6, -12, 1.3], [1, -15, 1.1], [-2, -9, 0.9]], R, burnt ? C.charL : '#5b3b33');
      if (o.risen) ribs(c, -5, -11.6, 3, 4.6, 2.8, R);
    }
    if (!wantH) return;
    // head: a long wedge, swung up about the neck to gore
    about(c, 7.6, -12.4, headA, () => {
      part(c, poly([[8.4, -16.8], [8.8, -21.2], [11.4, -17.2]], R, 0.2), body, M, { lw: 1.2, sharp: true });
      brush(c, [[9.6, -7], [11.6, -12.6], [12.8, -15.2]], 1.3, belly, R, { taper: 0.5, dry: 0.4, bristles: 3 }); // pale cheek
      part(c, ring(18.1, -8, 1.6, 2.2, R, 0.08, 7), snoutC, M, { lw: 1.1 });
      dab(c, 18.4, -8.9, 0.45, C.ink, R); dab(c, 18.5, -7.1, 0.45, C.ink, R);
      brush(c, [[13.4, -6.7], [16.6, -6.6]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
      tube(c, [[15.4, -6.5], [17.1, -8], [16.9, -10.2]], 0.95, pc(o, C.white, '#e8ecd2', C.charL), R, 0.5);
      if (o.dead === 'dead') dab(c, 14.6, -5.3, 0.9, '#e5707a', R);
      if (o.risen && !o.dead) zMouth(c, [[12.6, -6.8], [14, -6.5], [15.4, -6.8]], R, 0.45);
      eye(c, o, 12.2, -12.8, 0.95, R, charge || pawing || o.red ? 'red' : 'dot');
      if (!o.dead) brush(c, [[10.6, -14.6], [13.6, -13.8]], 0.8, C.ink, R, { bristles: 2, dry: 0 }); // heavy brow
    });
    scarf(c, o, BOAR_OWN, [[7.2, -18.2], [8.6, -13], [8, -7.6]], [[8.4, -9.4], [5.4, -5.6]], 2.8, R);
  });
}
/** o with the part's layer set (parts paint their rest pose); null for a whole frame. */
function partO(o) {
  if (!isPart(o.pose)) return null;
  const L = o.pose.slice(2);
  return Object.assign({}, o, { L });
}
function boarPaint(c, o) {
  const q = partO(o);
  if (q && q.L === 'headR') { q.L = 'head'; q.red = true; }
  const f = q || o;
  if (o.dead) onBack(c, 19.5, () => boarDraw(c, f)); else boarDraw(c, f);
}

// ================================================================ RAT
const RAT_OWN = '#8f8984';
function ratDraw(c, o) {
  const R = o.R, M = o.M, pose = o.dead ? 'idle' : o.pose;
  const fur = pc(o, RAT_OWN, C.zskin), dark = pc(o, '#5f5955', C.zskinD), pink = pc(o, '#ef9fa4', '#d7c7a0', C.charL), belly = pc(o, '#bdb7b0', tone(C.zskin, 0.3), C.charL);
  const swim = pose === 'swim0' || pose === 'swim1', rear = pose === 'rear', walk = pose === 'walk0' || pose === 'walk1';
  const dy = swim ? 1.4 : 0;
  // tail: droops at rest, streams out straight when it darts, trails flat swimming
  const tail = walk || pose === 'atk' ? [[-5, -2.8], [-8.8, -3.4], [-12.6, -3.4], [-15.8, -2.6]]
    : swim ? [[-5, -2.2], [-8.6, -1.6], [-12, -1.9], [-15, -1.4]]
      : [[-5, -2.4], [-8.4, -1.2], [-11.4, -1.6], [-13.6, -0.4]];
  moved(c, 0, dy, () => tube(c, tail, 0.95, pink, R, 0.6));
  // feet: a quick low patter (far pair darker)
  const F = { idle: [3, -2.6, 1.6, -4], walk0: [4.4, -1.4, 0.4, -4.8], walk1: [1.2, -4.2, 3.8, -1.8], atk: [4.6, -2.2, 2.4, -4], eat: [3.4, -2.4, 1.8, -4], rear: [-0.6, -2.8, 0.6, -4.2] }[pose] || [3, -2.6, 1.6, -4];
  if (swim) { const k = pose === 'swim0' ? 1 : -1; brush(c, [[2, -1], [3.4 + k, 0.6], [1.4 + k, 1.2]], 0.8, tone(pink, -0.15), R, { bristles: 2 }); brush(c, [[-2.4, -1], [-1 - k, 0.8], [-3 - k, 1.2]], 0.8, tone(pink, -0.15), R, { bristles: 2 }); }
  else for (let i = 0; i < 4; i++) { const x = F[i], far = i >= 2, hip = i === 0 || i === 2 ? 2 : -2.6;
    if (rear && (i === 0 || i === 2)) continue;
    brush(c, [[hip, -2.4], [x, -0.4]], 0.85, far ? tone(dark, -0.2) : dark, R, { bristles: 2, dry: 0.1 }); dab(c, x + 0.5, -0.4, 0.7, far ? tone(pink, -0.2) : pink, R); }
  const headA = rear ? -0.95 : pose === 'eat' ? 0.38 : swim ? -0.22 : 0;
  const lunge = pose === 'atk' ? 1.3 : 0;
  moved(c, 0, dy, () => about(c, -3.6, -2, headA, () => {
    const B = poly([[-5.8, -2.2], [-5.4, -5.3], [-2.4, -7.3], [1.6 + lunge * 0.4, -7.2], [4.6 + lunge, -5.6], [7.2 + lunge, -3.2], [6.4 + lunge, -2], [3, -1.2], [-2, -1]], R, 0.25);
    part(c, B, fur, M, { lw: 1.1 });
    brush(c, [[-4, -2.4], [0, -2.2], [3.6, -2.4]], 1.1, belly, R, { taper: 0.5, dry: 0.4, bristles: 3 });
    if (o.risen) ribs(c, -2.6, -4.2, 2, 3, 1.8, R);
    if (o.dead === 'burnt' || bare(o)) scorch(c, [[-2, -4.4, 0.9], [1.4, -5.4, 0.7]], R, C.charL);
    part(c, ring(1.4 + lunge * 0.3, -7.3, 1.75, 1.75, R, 0.08, 7), fur, M, { lw: 0.85 }); // round ear
    dab(c, 1.5 + lunge * 0.3, -7.2, 0.85, pink, R);
    dab(c, 7.3 + lunge, -3.2, 0.75, pink, R); // nose
    if (!o.dead) { brush(c, [[6.6 + lunge, -3.5], [9 + lunge, -4.6]], 0.3, C.ink, R, { bristles: 1, dry: 0 }); brush(c, [[6.6 + lunge, -3], [9 + lunge, -2.4]], 0.3, C.ink, R, { bristles: 1, dry: 0 }); }
    if (pose === 'atk' || pose === 'eat') dab(c, 6.1 + lunge, -1.7, 0.55, C.white, R); // buck teeth
    if (rear) { dab(c, 4.6, -2.3, 0.75, pink, R); dab(c, 3.6, -1.8, 0.7, tone(pink, -0.2), R); } // little front paws held to its chest
    eye(c, o, 4 + lunge * 0.7, -4.7, 1.1, R, 'white');
    scarf(c, o, RAT_OWN, [[0.2, -6.8], [0.8, -4.2], [0.4, -1.6]], null, 1.9, R);
  }));
}
function ratPaint(c, o) { if (o.dead) onBack(c, 7.4, () => ratDraw(c, o)); else ratDraw(c, o); }

// ================================================================ ANT + SOLDIER ANT
const ANT_OWN = '#3a2a22', SOLDIER_OWN = '#8a3320';
function antDraw(c, o, own, soldier) {
  const R = o.R, M = o.M, pose = o.dead ? 'idle' : o.pose, k = soldier ? 0.72 : 1; // k: outline weight (the soldier is drawn 1.4x)
  const body = pc(o, own, C.zskin), gloss = pc(o, tone(own, 0.45), tone(C.zskin, 0.35), C.charL), legC = pc(o, tone(own, -0.35), C.zskinD);
  const raft = pose === 'raft', w0 = pose === 'walk0' || pose === 'seed0', w1 = pose === 'walk1' || pose === 'seed1';
  const carry = pose === 'carry', bite = pose === 'atk', dy = raft ? 1.2 : 0;
  // six thin legs from under the thorax: a tripod gait (front + back of one side with the middle of the other);
  // near three after the far three (darker), all under the body; rafting: splayed flat out on the water
  const near = raft ? [[[1, -2], [4.4, -0.8], [7, 0]], [[0.2, -2], [0.4, -0.4], [0.8, 0.6]], [[-0.6, -2], [-3.6, -0.8], [-6.4, 0]]]
    : w0 ? [[[1, -2.6], [3.8, -3.6], [5.6, 0]], [[0.2, -2.6], [-0.8, -3.6], [-2.4, 0]], [[-0.6, -2.6], [-2.4, -3.6], [-3.6, 0]]]
      : w1 ? [[[1, -2.6], [2.4, -3.6], [2.8, 0]], [[0.2, -2.6], [1.4, -3.6], [2, 0]], [[-0.6, -2.6], [-3.6, -3.6], [-6, 0]]]
        : carry ? [[[1, -2.6], [3.8, -4.4], [5.8, -2]], [[0.2, -2.6], [-0.6, -3.6], [-2.2, 0]], [[-0.6, -2.6], [-3.4, -3.6], [-5.6, 0]]]
          : [[[1, -2.6], [3.2, -3.6], [4.6, 0]], [[0.2, -2.6], [0.4, -3.6], [-0.4, 0]], [[-0.6, -2.6], [-2.6, -3.6], [-4.6, 0]]];
  for (const l of near) leg(c, l.map(([x, y]) => [x - 1.2, y - 0.3]), 0.85, tone(legC, 0.2), R);
  for (const l of near) leg(c, l, 1, legC, R);
  moved(c, 0, dy, () => about(c, -1, -3, carry ? -0.16 : 0, () => {
    // gaster (big, glossy, banded), waist, thorax, head
    part(c, ring(-4.4, -3.8, 3.5, 2.75, R, 0.08, 8, -0.15), body, M, { lw: 1.25 * k });
    for (const x of [-5.6, -3.8]) brush(c, [[x, -6], [x + 0.5, -3.8], [x, -1.6]], 0.45, gloss, R, { bristles: 2, dry: 0.3, taper: 0.3 });
    dab(c, -5.4, -5.3, 0.8, tone(gloss, 0.25), R);
    part(c, ring(0.2, -3.6, 1.85, 1.45, R, 0.08, 7), body, M, { lw: 1.05 * k });
    const hx = (soldier ? 4.5 : 4) + (bite ? 1.1 : 0), hr = soldier ? 2.9 : 2.25;
    const hyy = (carry ? -3.4 : -4.7) - (soldier ? 0.3 : 0);
    // jaws: open lunging, shut otherwise; a soldier's are great curved pincers
    const jaw = soldier ? 2.6 : 1.5, open = bite || carry ? 0.9 : 0.25;
    const jc = pc(o, soldier ? '#4a170c' : tone(own, -0.3), C.zskinD, C.charL), jw = soldier ? 1.15 : 0.8;
    brush(c, [[hx + hr * 0.6, hyy + 0.5], [hx + hr * 0.6 + jaw, hyy + 0.5 - open], [hx + hr * 0.6 + jaw * 1.25, hyy + 1.3 - open * 0.3]], jw, jc, R, { bristles: 2, dry: 0.05, taper: 0.5 });
    brush(c, [[hx + hr * 0.6, hyy + 1.2], [hx + hr * 0.6 + jaw, hyy + 1.4 + open], [hx + hr * 0.6 + jaw * 1.2, hyy + 0.8 + open * 0.4]], jw, jc, R, { bristles: 2, dry: 0.05, taper: 0.5 });
    part(c, ring(hx, hyy, hr, hr * 0.92, R, 0.08, 7), body, M, { lw: 1.15 * k });
    if (pose === 'seed0' || pose === 'seed1') part(c, ring(hx + hr + 1.3, hyy + 0.9, 1.5, 1.1, R, 0.1, 7, 0.4), pc(o, '#f3d27a', '#f3d27a', C.charL), M, { lw: 0.9 * k });
    eye(c, o, hx + hr * 0.2, hyy - hr * 0.2, soldier ? 1.05 : 0.95, R, 'white');
    // antennae: up, elbowed forward
    const ax = hx + 0.2, ay = hyy - hr * 0.85;
    brush(c, [[ax, ay], [ax + 0.4, ay - 2.6], [ax + 2.6, ay - 3.4]], 0.55 * k, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 });
    brush(c, [[ax - 0.8, ay + 0.2], [ax - 1, ay - 2.4], [ax + 1.2, ay - 3.6]], 0.5 * k, tone(C.ink, 0.25), R, { bristles: 2, dry: 0, taper: 0.2 });
    if (o.risen && !o.dead) zMouth(c, [[hx + 0.4, hyy + hr * 0.55], [hx + 1.4, hyy + hr * 0.5]], R, 0.4);
    scarf(c, o, own, [[1.6, -5.4], [2, -3.4], [1.6, -1.8]], null, 1.6, R);
  }));
}
function antPaint(c, o, own, soldier) { if (o.dead) onBack(c, 6.6, () => antDraw(c, o, own, soldier)); else antDraw(c, o, own, soldier); }

// ================================================================ ANTHILL
const HILL_OWN = '#b07d49';
const HILL_R = { h0: 7.7, h1: 13.2, h2: 18.7, h3: 24.2, b0: 7.7, b1: 13.2, b2: 18.7, b3: 24.2 }; // (7 + 5 x size) x 1.1 (OG game.js:12179-12181)
// Burning (u.burning > 0; OG more.w = u.burn > 0, game.js:21125-21128): its dirt scorched, mixed half way to OG's
// vec3(0.2, 0.15, 0.12) (OG antHillBean, shader `dirt = mix(base, ..., 0.5)`); its shades come from that dirt, its holes don't.
const HILL_SCORCH = '#33261f';
function hillPaint(c, o) {
  const R = o.R, M = o.M, n = o.dead ? 1 : +(o.pose[1] || 0), r = HILL_R['h' + n];
  const sc = !o.dead && o.pose[0] === 'b' ? (h => mixHex(h, HILL_SCORCH, 0.5)) : (h => h);
  const dirt = pc(o, sc(HILL_OWN), null), darkD = pc(o, sc('#7d5530'), null, C.char), light = pc(o, sc('#d4a46a'), null, C.charL), hole = pc(o, '#2a1c14', null, C.ink);
  if (o.dead) { // flattened: a ring of loose dirt round a caved-in hole
    fill(c, ring(0, 0, r * 1.05, r * 0.42, R, 0.15, 11), darkD, R, { vary: 0.08 });
    part(c, ring(0, -0.6, r * 0.95, r * 0.34, R, 0.18, 11), dirt, M, { lw: 1.4 });
    dab(c, 0, -0.8, r * 0.3, hole, R);
    for (let i = 0; i < 10; i++) { const a = R() * TAU; dab(c, Math.cos(a) * r * (1 + R() * 0.3), Math.sin(a) * r * 0.45 * (1 + R() * 0.3), 0.5 + R() * 0.6, darkD, R); }
    return;
  }
  // its foot: the disc of ground it covers (seen at a slant), crumbs round it
  for (let i = 0; i < 6 + n * 4; i++) { const a = R() * TAU, d = r * (1.02 + R() * 0.32); dab(c, Math.cos(a) * d, Math.sin(a) * d * 0.45 + 0.6, 0.45 + R() * 0.55, R() < 0.5 ? darkD : dirt, R); }
  const H = r * (0.38 + 0.2 * n), top = -H, w = r * 1.02;
  const pts = [[-w, r * 0.22], [-w * 0.92, -H * 0.18], [-w * 0.6, -H * 0.62], [-w * 0.24, -H * 0.97], [w * 0.24, -H * 0.97], [w * 0.62, -H * 0.6], [w * 0.94, -H * 0.16], [w, r * 0.22], [w * 0.5, r * 0.42], [-w * 0.5, r * 0.42]];
  part(c, poly(pts, R, 0.25 + r * 0.02), dirt, M, { lw: 1.6 });
  // shaded: darker down its near side and round its foot, lighter on top; grains of dirt
  brush(c, [[-w * 0.8, r * 0.18], [0, r * 0.32], [w * 0.8, r * 0.16]], Math.max(1.6, r * 0.22), darkD, R, { taper: 0.4, dry: 0.4 });
  brush(c, [[-w * 0.45, -H * 0.7], [-w * 0.1, -H * 0.88], [w * 0.3, -H * 0.8]], Math.max(1.3, r * 0.16), light, R, { taper: 0.5, dry: 0.5 });
  for (let i = 0; i < 4 + n * 4; i++) { const x = (R() - 0.5) * w * 1.4, y = lerp(-H * 0.8, r * 0.1, R()); dab(c, x, y, 0.35 + R() * 0.35, R() < 0.6 ? darkD : light, R); }
  // the hole in its top
  part(c, ring(0, top + r * 0.05, Math.max(1.4, r * 0.2), Math.max(0.8, r * 0.08), R, 0.1, 7), hole, M, { lw: 1 });
  // entrances round the front of its foot (min(4, 1 + floor(size)), OG game.js:3742-3750, spread 0.62 rad, OG game.js:12244)
  const ne = Math.min(4, 1 + n);
  for (let k = 0; k < ne; k++) {
    const a = Math.PI / 2 + (k - (ne - 1) / 2) * 0.62, ex = Math.cos(a) * r * 0.66, ey = (0.08 + 0.32 * Math.sin(a) - 0.2 * (0.1 + 0.72 * n / 3)) * r;
    const hr = Math.max(1.3, r * 0.13);
    brush(c, [[ex - hr * 1.3, ey + hr * 0.2], [ex, ey - hr * 1.1], [ex + hr * 1.3, ey + hr * 0.2]], 1.1, light, R, { bristles: 2, taper: 0.3 }); // lip of dirt
    dab(c, ex, ey, hr, hole, R, 0.12);
  }
  // Team battle: a little flag stuck in the top in the colony's colour
  const tc = teamOf(o, HILL_OWN);
  if (tc) {
    brush(c, [[r * 0.15, top + 0.5], [r * 0.18, top - 9]], 0.8, C.ink, R, { bristles: 2, dry: 0 });
    part(c, poly([[r * 0.18, top - 9], [r * 0.18 + 5.5, top - 7.4], [r * 0.18, top - 5.6]], R, 0.2), tc, M, { lw: 1, sharp: true });
  }
}

// ================================================================ APE (+ the ape that rides Ape Cavalry)
const APE_OWN = '#3d3330';
function apePal(o) {
  const naked = bare(o) && o.dead !== 'burnt';
  return {
    body: naked ? '#9b7469' : pc(o, APE_OWN, C.zskin), limb: naked ? '#a98276' : pc(o, '#54463f', tone(C.zskin, 0.12)), far: naked ? '#7a564c' : pc(o, '#271f1d', C.zskinD),
    fur: naked ? '#c49a8c' : pc(o, '#8a776d', tone(C.zskin, 0.4), C.charL), face: pc(o, '#b39a8a', tone(C.zskin, 0.45), C.charL),
    chest: naked ? '#b58a7e' : pc(o, '#6f5d55', tone(C.zskin, 0.2), C.charL), saddle: naked ? '#9b7469' : pc(o, '#c9c4bb', tone(C.zskin, 0.5), C.charL), naked,
  };
}
/** the ape's head about its neck (x, y): small and sunk between the shoulders, a pointed crest, heavy brow, a broad pale muzzle. */
function apeHead(c, o, P, x, y, roar, R, M, s = 1.25) {
  c.save(); c.translate(x, y); c.scale(s, s); c.translate(-x, -y);
  part(c, poly([[x - 3.6, y + 1.6], [x - 3.8, y - 2], [x - 1.6, y - 4.4], [x + 0.2, y - 6.2], [x + 2.4, y - 3.8], [x + 4, y - 1], [x + 3.4, y + 2.6], [x - 0.6, y + 3.4]], R, 0.2), P.body, M, { lw: 1.25 });
  part(c, poly([[x - 0.2, y - 2.6], [x + 3.2, y - 2.4], [x + 5.2, y + 0.4], [x + 4.8, y + 3], [x + 1.6, y + 3.4], [x - 0.4, y + 1]], R, 0.15), P.face, M, { lw: 1 }); // bare face + muzzle
  dab(c, x + 4.1, y + 0.2, 0.5, C.ink, R); dab(c, x + 4.9, y + 0.5, 0.4, C.ink, R); // nostrils
  if (roar && !o.dead) { dab(c, x + 3, y + 2.2, 1.2, '#b8333a', R); brush(c, [[x + 2.2, y + 1.4], [x + 4, y + 1.4]], 0.5, C.white, R, { bristles: 1, dry: 0 }); }
  else brush(c, [[x + 1.4, y + 2.4], [x + 3.4, y + 2.3], [x + 4.6, y + 1.8]], 0.5, C.ink, R, { bristles: 2, dry: 0 });
  if (o.risen && !o.dead) zMouth(c, [[x + 1.2, y + 2.5], [x + 2.6, y + 2.7], [x + 4, y + 2.4]], R, 0.4);
  eye(c, o, x + 1.5, y - 1, 0.9, R, 'white');
  if (!o.dead) brush(c, [[x - 0.4, y - 2.4], [x + 1.6, y - 2.9], [x + 3.4, y - 2.3]], 1, C.ink, R, { bristles: 2, dry: 0.1 }); // heavy brow
  c.restore();
}
const APE_POSE = { // rear: radians up on its hind legs (about the hips); hn / hf: near / far hand (world); fn / ff: feet
  idle: { rear: 0, hn: [9.4, 0], hf: [5.6, 0], fn: [-6.4, 0], ff: [-9, 0] },
  walk0: { rear: 0, hn: [12, -0.2], hf: [3.6, 0], fn: [-9.4, 0], ff: [-5.6, -0.2] },
  walk1: { rear: 0, hn: [6.6, 0], hf: [9.8, -0.2], fn: [-4.6, -0.2], ff: [-10.4, 0] },
  run0: { rear: 0.12, hn: [17.4, -2], hf: [15.4, -1.2], fn: [-12.6, -1.6], ff: [-14.6, -2.6], up: -1.4 }, // both arms reaching out
  run1: { rear: -0.1, hn: [7.8, 0], hf: [5.6, 0], fn: [2.6, -0.4], ff: [0.6, -0.6], up: -0.6 },          // legs landing up behind its hands
  slam0: { rear: 0.72, hn: [4, -41], hf: [-1.6, -42], fn: [-5.8, 0], ff: [-8.6, 0] },                    // fists overhead
  slam1: { rear: -0.18, hn: [17.6, 0], hf: [15.4, -0.4], fn: [-6.6, 0], ff: [-9.6, 0] },                 // fists down on the ground ahead
  hoist: { rear: 0.66, hn: [5, -40.6], hf: [-0.6, -41.6], fn: [-5.8, 0], ff: [-8.6, 0], open: 1 },        // lifting something overhead
  throw: { rear: 0.3, hn: [18, -14], hf: [15.6, -12.6], fn: [-6.2, 0], ff: [-9.2, 0], open: 1 },          // the follow-through
  beat0: { rear: 0.78, hn: [3.6, -19.6], hf: [-1.6, -25.6], fn: [-5.8, 0], ff: [-8.6, 0], roar: 1 },       // drumming its chest
  beat1: { rear: 0.78, hn: [7.6, -26], hf: [0.8, -19.6], fn: [-5.8, 0], ff: [-8.6, 0], roar: 1 },
  wade: { rear: 0.6, hn: [10, -33], hf: [4, -35], fn: [-5.8, 0], ff: [-8.6, 0], open: 1 },              // hands held up out of the water
  climb: { rear: 1.3, hn: [-6.6, -38], hf: [-4, -17], fn: [-6.4, 0], ff: [-3.4, 0.6], hang: 1 },          // hanging from a branch
};
// rig parts (o.L, the idle ape): legF, armF, legN, body (+ the team scarf), armN, head
function apeDraw(c, o, P, pose, R, M, team) {
  const Lr = o.L, want = (n) => !Lr || Lr === n;
  if (Lr) pose = 'idle';
  const A = APE_POSE[pose] || APE_POSE.idle, hip = [-6.4, -9.5], rear = A.rear || 0, up = A.up || 0;
  const W = (x, y) => rotP(x, y + up, hip[0], hip[1] + up, -rear); // body point -> world
  const shN = W(5.6, -16.4), shF = W(3, -17.4), hipN = W(-6, -9.6), hipF = W(-8.2, -10);
  const arm = (sh, hand, w, col, far) => {
    const dx = hand[0] - sh[0], dy = hand[1] - sh[1], d = Math.hypot(dx, dy) || 1;
    const bend = A.hang && !far ? 0.4 : Math.min(3.4, Math.max(0, 15 - d * 0.5)) + 1; // elbows bent back
    const el = [sh[0] + dx * 0.5 + dy / d * bend, sh[1] + dy * 0.5 - dx / d * bend];
    tube(c, [sh, el, hand], w, col, R, 1.2);
    if (!far) brush(c, [[lerp(el[0], hand[0], 0.15), lerp(el[1], hand[1], 0.15) - 0.6], [lerp(el[0], hand[0], 0.7), lerp(el[1], hand[1], 0.7) - 0.6]], 0.7, P.fur, R, { bristles: 2, dry: 0.4 });
    part(c, ring(hand[0], hand[1] - 0.9, w * 0.62, w * 0.55, R, 0.1, 7), col, M, { lw: 1.05 }); // a great knuckled fist
    if (!A.open) brush(c, [[hand[0] - w * 0.3, hand[1] - 1.6], [hand[0] + w * 0.35, hand[1] - 1.5]], 0.4, C.ink, R, { bristles: 1, dry: 0 });
  };
  const legD = (h, f, col) => { tube(c, [h, [lerp(h[0], f[0], 0.5) + 1.2, lerp(h[1], f[1], 0.5)], f], 3.9, col, R, 1.2); part(c, ring(f[0] + 1.3, f[1] - 0.9, 2.2, 1.2, R, 0.1, 7), col, M, { lw: 1 }); };
  if (want('legF')) legD(hipF, A.ff, P.far);
  if (want('armF')) arm(shF, A.hf, 3.4, P.far, true);
  if (want('legN')) legD(hipN, A.fn, P.limb);
  if (want('body')) about(c, hip[0], hip[1] + up, -rear, () => moved(c, 0, up, () => {
    // massive high shoulders and chest, the back sloping down to a lower rump
    part(c, poly([[-11.6, -9], [-11, -13.2], [-6.6, -17.6], [0, -21.8], [6.4, -22.2], [10.6, -18.6], [10.8, -13], [7, -8.6], [-1, -7.6], [-8, -7.2]], R, 0.35), P.body, M);
    fill(c, ring(6.6, -13.6, 3.2, 4, R, 0.12, 8), P.chest, R, { edge: 0, vary: 0.08 }); // a bare chest
    if (!P.naked) brush(c, [[-10.2, -11.6], [-6.4, -15.6], [-1.6, -17.6]], 3.2, P.saddle, R, { taper: 0.6, dry: 0.35, bristles: 5 }); // silverback saddle
    for (let i = 0; i < 4; i++) { const x = -6 + i * 3.4 + R(), y = -12.6 + R() * 2.4; brush(c, [[x + 1.2, y - 0.6], [x - 0.6, y + 0.6]], 0.6, P.fur, R, { bristles: 2, dry: 0.3 }); }
    if (o.risen) ribs(c, -5, -13.4, 3, 5, 2.8, R);
    if (P.naked || o.dead === 'burnt') scorch(c, [[-3, -15, 1.4], [3, -18, 1.2], [-7, -11, 1]], R, o.dead === 'burnt' ? C.charL : '#4a332e');
  }));
  if (want('armN')) arm(shN, A.hn, 4.1, P.limb, false);
  if (A.hang) for (let i = 0; i < 6; i++) dab(c, A.hn[0] - 3.4 + R() * 6.8, A.hn[1] - 3.6 + R() * 3.4, 1.8 + R() * 1.2, i & 1 ? C.leafL : C.leaf, R); // leaves round its hand
  if (team && want('body')) { const k = o.dead === 'burnt' ? C.charL : team; // a scarf round its shoulders, the end flapping behind
    brush(c, [W(4.4, -22.6), W(6.4, -17.4), W(6, -11.4)], 3.3, k, R, { taper: 0.1, dry: 0.1, bristles: 4 });
    brush(c, [W(4.2, -20.4), W(0.4, -21.6), W(-2.6, -19.6)], 2.4, k, R, { taper: 0.6, dry: 0.2, bristles: 3 }); }
  // its head last, over its near arm even with its fists up overhead (OG), kept up rather than turned to the sky
  if (want('head')) about(c, hip[0], hip[1] + up, -rear, () => moved(c, 0, up, () => about(c, 9.4, -15.6, rear * 0.75, () => apeHead(c, o, P, 10.4, -17.4, A.roar, R, M))));
}
function apePaint(c, o) {
  const P = apePal(o), team = teamOf(o, APE_OWN), f = partO(o) || o;
  if (o.dead) onBack(c, 24, () => apeDraw(c, f, P, 'idle', o.R, o.M, team));
  else apeDraw(c, f, P, o.pose, o.R, o.M, team);
}

// ================================================================ APE CAVALRY (an ape riding a horse)
// The horse is ARMY's (people.js horse(), so a horse looks the same with an ape or a knight on it); a plain painted
// horse stands in if people.js can't load. Dead = the horse alone (OG bodyShape Horse, game.js:12781; a dead rider is
// its own corpse).
let armyHorse = null, horseParts = null, HORSE_PARTS = [];
try { const m = await import('./people.js'); armyHorse = m.horse || null; horseParts = m.horseParts || null; HORSE_PARTS = m.HORSE_PARTS || []; } catch (e) { armyHorse = null; }
const HORSE_CLOTH = '#ffd51e';
function plainHorse(c, M, pose, cloth, dead, opt) {
  const R = M.R, coat = dead === 'burnt' ? C.char : opt.risen ? '#93b85a' : '#9c5f33', mane = dead === 'burnt' ? C.charL : '#3b2416';
  const run = pose === 'run0' || pose === 'run1', s = pose === 'walk0' || pose === 'run0' ? 1 : pose === 'walk1' || pose === 'run1' ? -1 : 0;
  const lg = (hx, sw, col) => { tube(c, [[hx, -15], [hx + sw * 1.6, -7.5], [hx + sw * (run ? 4.6 : 2.6), 0]], 2.3, col, R, 1.05); };
  lg(4.6, -s, tone(coat, -0.2)); lg(-9.6, s, tone(coat, -0.2));
  brush(c, [[-12.6, -20.6], [-16.4, -19], [-18, -13.6]], 3.3, mane, R, { taper: 0.6, dry: 0.35, bristles: 5 });
  lg(6.4, s, coat); lg(-8, -s, coat);
  tube(c, [[6.6, -19.8], [11.2, -25.4], [14.4, -29.4]], 7.6, coat, R, 1.4);
  part(c, ring(-1, -17.6, 12.6, 6.4, R, 0.06, 10), coat, M, { lw: 1.7 });
  part(c, poly([[-6.8, -24.2], [4.2, -24.4], [4.8, -15.4], [-7.2, -15.2]], R, 0.3), cloth, M, { lw: 1.3 });
  part(c, ring(17.4, -29, 6.4, 3.8, R, 0.06, 9, 0.62), coat, M, { lw: 1.5 });
  dab(c, 16, -30.4, 0.85, C.ink, R);
}
const RIDE = { // the ape's seat on the horse, and its near hand (world)
  idle: { y: 0, hand: [11.4, -26.4] }, walk0: { y: -0.4, hand: [11.6, -26] }, walk1: { y: 0.3, hand: [11.2, -26.6] },
  run0: { y: -2.4, hand: [13.6, -28.4], lean: 0.2 }, run1: { y: -1, hand: [13, -27.6], lean: 0.2 },
  atk: { y: -0.4, hand: [17.6, -22.4], lean: 0.32, raise: 1 },
};
// rig parts: 'r:rider' = the idle rider, 'r:riderA' = the atk swing, both in the saddle of the idle horse (no bounce:
// the rig bounces it; the atk lean is painted in, the run lean is the rig's)
const RIDE_REST = { atk: { y: 0, hand: RIDE.atk.hand, lean: RIDE.atk.lean, raise: 1 } };
function apeRider(c, o, P, pose, R, M, team, rest) {
  const S = (rest && RIDE_REST[pose]) || RIDE[pose] || RIDE.idle, sx = -1.6, sy = -23.6 + S.y, lean = S.lean || 0;
  const shN = rotP(sx + 4.4, sy - 9.4, sx, sy, lean), shF = rotP(sx + 2.4, sy - 10, sx, sy, lean);
  tube(c, [shF, [shF[0] + 4, shF[1] + 3], [S.hand[0] - 2.4, S.hand[1] + 1.2]], 3, P.far, R, 1.1); // far arm on the mane
  about(c, sx, sy, lean, () => {
    // squat on the saddle, legs down the horse's sides
    part(c, poly([[sx - 5.6, sy + 0.6], [sx - 6, sy - 5.2], [sx - 3, sy - 10.6], [sx + 2.6, sy - 12.4], [sx + 6.4, sy - 9.6], [sx + 6, sy - 3.6], [sx + 3, sy + 0.8]], R, 0.3), P.body, M);
    fill(c, ring(sx + 4, sy - 5.8, 2.2, 3.2, R, 0.12, 7), P.chest, R, { edge: 0, vary: 0.08 });
    if (!P.naked) brush(c, [[sx - 4.6, sy - 1.4], [sx - 4.2, sy - 6.6]], 2.4, P.saddle, R, { taper: 0.5, dry: 0.3, bristles: 4 });
    tube(c, [[sx + 0.4, sy - 0.6], [sx + 2.6, sy + 3.6], [sx + 2.2, sy + 7.6]], 3.6, P.limb, R, 1.15); // near leg down its side
    part(c, ring(sx + 3.2, sy + 8.2, 2, 1.1, R, 0.1, 7), P.limb, M, { lw: 1 });
    about(c, sx + 4.4, sy - 12, -lean * 0.8, () => apeHead(c, o, P, sx + 5, sy - 13.4, S.raise, R, M, 1.15));
  });
  if (S.raise) { // atk: a fist swung up and over, down onto whoever's in front
    tube(c, [shN, [shN[0] + 5.6, shN[1] - 4.6], S.hand], 3.6, P.limb, R, 1.15);
  } else tube(c, [shN, [shN[0] + 3.4, shN[1] + 3.6], S.hand], 3.6, P.limb, R, 1.15);
  part(c, ring(S.hand[0], S.hand[1], 2.3, 2, R, 0.1, 7), P.limb, M, { lw: 1.05 });
  if (team) { const a = rotP(sx + 3.2, sy - 11.8, sx, sy, lean), b = rotP(sx + 4.8, sy - 8.2, sx, sy, lean), d = rotP(sx + 3.8, sy - 4.6, sx, sy, lean);
    brush(c, [a, b, d], 2.6, o.dead === 'burnt' ? C.charL : team, R, { taper: 0.1, dry: 0.1, bristles: 3 }); }
}
function apecavPaint(c, o) {
  const team = teamOf(o, APE_OWN), P = apePal(o), cloth = team || HORSE_CLOTH;
  if (isPart(o.pose)) {   // rig part: a horse part (people.js horse() layer) or the rider
    const L = o.pose.slice(2);
    if (L === 'rider' || L === 'riderA') { if (!o.dead) apeRider(c, o, P, L === 'riderA' ? 'atk' : 'idle', o.R, o.M, team, true); return; }
    if (armyHorse) armyHorse(c, o.M, 'idle', cloth, o.dead, { risen: o.risen, saddle: 'rider', layer: L });
    return;
  }
  const pose = o.dead ? 'idle' : o.pose, hp = pose === 'atk' ? 'walk0' : pose;
  (armyHorse || plainHorse)(c, o.M, hp, cloth, o.dead, { risen: o.risen, saddle: 'rider' });
  if (!o.dead) apeRider(c, o, P, pose, o.R, o.M, team);
}

// ================================================================ ALLIGATOR
const GATOR_OWN = '#3f9c4a';
// upper = true ('jawU'): the same painting, but only its upper jaw (skull + snout, upper teeth, nostril, the eye on its
// bump, its lid; risen: the stitches) and the scarf reach c; everything else is painted nowhere, so R is used up exactly
// as in the full frame and the jaw lands pixel for pixel where the full frame's is.
function gatorDraw(c, o, upper = false) {
  if (o.L) { gatorPart(c, o); return; }
  const R = o.R, M = o.M, pose = o.dead ? 'idle' : o.pose;
  const b = upper ? nowhereCtx() : c; // b: everything below the upper jaw
  const skin = pc(o, GATOR_OWN, C.zskin), dark = pc(o, '#24692f', C.zskinD), belly = pc(o, '#f3d65a', tone(C.zskin, 0.4), C.charL);
  const teeth = pc(o, C.white, '#e8ecd2', C.charL), mouth = pc(o, '#f08a9a', '#c9a08a', C.charL);
  const swim = pose === 'swim', wv = pose === 'walk0' ? 1 : pose === 'walk1' ? -1 : 0, lw = 1.9;
  // jaws: gape (atk), held a little apart (hold: OG GATOR_HOLD_GAPE 0.5 of the bite's 1.25), else shut
  const up = pose === 'atk' ? -0.55 : pose === 'hold' ? -0.2 : 0, dn = pose === 'atk' ? 0.28 : pose === 'hold' ? 0.12 : 0;
  // legs: short, thick, splayed; swimming tucked back along its sides
  const legs = swim ? [[[8, -4], [5, -3.4], [3, -3.6]], [[-6.6, -4], [-9.6, -3.4], [-11.6, -3.6]]]
    : [[[8, -4], [10 + wv * 1.6, -2], [9.6 + wv * 2.4, 0]], [[-6.6, -4], [-8.4 - wv * 1.6, -2], [-8 - wv * 2.4, 0]]];
  const far = swim ? legs : [[[6, -4], [7.6 - wv * 1.6, -2.2], [7.4 - wv * 2.4, 0]], [[-8.6, -4], [-10.6 + wv * 1.6, -2.2], [-10.4 + wv * 2.4, 0]]];
  for (const l of far) { tube(b, l, 2.2, tone(skin, -0.3), R, 1.2); }
  // the tail: thick at the root, tapering, waving down its length on the move
  const tw = wv * 1.6;
  const T = poly([[-10, -8.6], [-17, -7.4 + tw * 0.4], [-24, -5.6 + tw], [-31, -3.2 + tw * 0.4], [-31.4, -2.2 + tw * 0.4], [-24, -1.8 + tw], [-17, -1.6 + tw * 0.4], [-10, -1.8]], R, 0.3);
  part(b, T, skin, M, { lw, sharp: false });
  for (let i = 0; i < 4; i++) { const x = -14 - i * 4.2; brush(b, [[x, -7.4 + (i > 1 ? tw : 0) + i * 0.9], [x - 1, -2.4 + (i > 1 ? tw : 0) + i * 0.1]], 1.1, dark, R, { bristles: 2, dry: 0.3 }); } // bands
  // the body: a long heavy barrel, pale belly
  part(b, ring(-0.4, -5.6, 12.6, 4.4, R, 0.06, 11), skin, M, { lw });
  brush(b, [[-9, -2.6], [0, -2], [9, -2.6]], 1.7, belly, R, { taper: 0.3, dry: 0.3, bristles: 4 });
  // a ridge of bold scutes along its back and tail
  for (let i = 0; i < 9; i++) { const x = 8 - i * 3.1, y = i < 5 ? -9.4 - Math.sin((i + 1) / 6 * Math.PI) * 0.6 : lerp(-9.4, -6.4, (i - 4) / 5);
    part(b, poly([[x - 1.2, y + 0.6], [x, y - 1.4], [x + 1.2, y + 0.6]], R, 0.15), dark, M, { lw: 0.9, sharp: true }); }
  if (o.risen) ribs(b, -6, -5.4, 4, 4.2, 2.8, R);
  if (o.dead === 'burnt') scorch(b, [[-4, -6, 1.4], [3, -5, 1.2]], R, C.charL);
  // the head: lower jaw, open mouth, upper jaw (skull + snout), hinged at the back of the mouth (11, -6)
  about(b, 11, -5.2, dn, () => {
    part(b, poly([[10, -5.2], [17, -4.4], [24.4, -4], [25, -2.6], [17, -1.8], [10, -2.2]], R, 0.2), skin, M, { lw: 1.6 });
    brush(b, [[11, -2.6], [22, -2.6]], 1.1, belly, R, { taper: 0.4, dry: 0.3, bristles: 3 });
    for (let i = 0; i < 4; i++) part(b, poly([[14 + i * 2.6, -4.6], [14.8 + i * 2.6, -6.4], [15.6 + i * 2.6, -4.6]], R, 0.1), teeth, M, { lw: 0.6, sharp: true });
  });
  if (up < -0.1) part(b, poly([[11, -5.4], [24, -4.6], [24, -6.6], [11, -7.6]], R, 0.2), mouth, M, { lw: 0.9 });
  about(c, 11, -6.2, up, () => gatorUpper(c, o, pose, skin, teeth, R, M));
  if (o.risen && !o.dead) zMouth(c, [[15, -4.6], [18, -4.4], [21, -4.6]], R, 0.45);
  for (const l of legs) { tube(b, l, 2.4, skin, R, 1.2); if (!swim) for (let j = 0; j < 3; j++) brush(b, [[l[2][0], l[2][1] - 0.4], [l[2][0] + 0.8 + j * 0.8, l[2][1] + 0.2]], 0.45, C.ink, R, { bristles: 1, dry: 0 }); }
  scarf(c, o, GATOR_OWN, [[7.8, -10.4], [9.2, -6.8], [8.6, -2.4]], [[8.8, -4], [6.4, -0.8]], 3, R);
}
/** The upper jaw (skull + snout), shut, hinged at (11, -6.2). */
function gatorUpper(c, o, pose, skin, teeth, R, M) {
  part(c, poly([[9, -10.4], [13.4, -10.4], [18, -8.4], [24.8, -7.4], [26, -5.6], [24.6, -4.6], [17, -4.8], [10, -5]], R, 0.2), skin, M, { lw: 1.7 });
  for (let i = 0; i < 4; i++) part(c, poly([[15.4 + i * 2.6, -4.9], [16.2 + i * 2.6, -3], [17 + i * 2.6, -4.9]], R, 0.1), teeth, M, { lw: 0.6, sharp: true });
  dab(c, 25, -6.8, 0.55, C.ink, R); // nostril on a bump at the tip
  brush(c, [[13, -5], [18, -4.9], [23, -5]], 0.6, C.ink, R, { bristles: 2, dry: 0 }); // the mouth's line
  part(c, ring(13, -10.6, 2.4, 2, R, 0.08, 7), skin, M, { lw: 1.3 }); // the eye's bump
  eye(c, o, 13.2, -10.9, 1.25, R, 'white');
  if (!o.dead && pose !== 'idle' && pose !== 'swim') brush(c, [[11.2, -12.6], [15, -11.4]], 0.9, C.ink, R, { bristles: 2, dry: 0 }); // heavy lid, angry
}
// rig parts (o.L, the idle gator, rig-quad.js table 'gator'): legFF / legFH (far fore / hind), tail (the root half, its
// outline open where it joins the body and the tip), tip (the far half), body (+ the back's scutes, the scarf), jawL (the
// lower jaw with the pink mouth behind its teeth: it shows when the jaws part), head (the upper jaw; 'headA' with the
// angry lid), legNF / legNH (near legs, over the body).
function gatorPart(c, o) {
  const R = o.R, M = o.M, L = o.L;
  const skin = pc(o, GATOR_OWN, C.zskin), dark = pc(o, '#24692f', C.zskinD), belly = pc(o, '#f3d65a', tone(C.zskin, 0.4), C.charL);
  const teeth = pc(o, C.white, '#e8ecd2', C.charL), mouth = pc(o, '#f08a9a', '#c9a08a', C.charL), lw = 1.9;
  const LEG = { legFF: [[6, -4], [7.6, -2.2], [7.4, 0]], legFH: [[-8.6, -4], [-10.6, -2.2], [-10.4, 0]], legNF: [[8, -4], [10, -2], [9.6, 0]], legNH: [[-6.6, -4], [-8.4, -2], [-8, 0]] };
  if (L === 'legFF' || L === 'legFH') { tube(c, LEG[L], 2.2, tone(skin, -0.3), R, 1.2); return; }
  if (L === 'legNF' || L === 'legNH') { const l = LEG[L]; tube(c, l, 2.4, skin, R, 1.2); for (let j = 0; j < 3; j++) brush(c, [[l[2][0], l[2][1] - 0.4], [l[2][0] + 0.8 + j * 0.8, l[2][1] + 0.2]], 0.45, C.ink, R, { bristles: 1, dry: 0 }); return; }
  const band = (x, y0, y1) => brush(c, [[x, y0], [x - 1, y1]], 1.1, dark, R, { bristles: 2, dry: 0.3 });
  const scute = (i) => { const x = 8 - i * 3.1, y = i < 5 ? -9.4 - Math.sin((i + 1) / 6 * Math.PI) * 0.6 : lerp(-9.4, -6.4, (i - 4) / 5);
    part(c, poly([[x - 1.2, y + 0.6], [x, y - 1.4], [x + 1.2, y + 0.6]], R, 0.15), dark, M, { lw: 0.9, sharp: true }); };
  if (L === 'tail') {   // root half: -8 .. -21.6 (its root under the body, its end over the tip)
    const T = poly([[-8, -8.8], [-17, -7.4], [-21.6, -6.3], [-21.6, -1.7], [-17, -1.6], [-8, -1.8]], R, 0.25);
    fill(c, shift(T, M.mx, M.my, M.grow), skin, R);
    for (const [i0, i1] of [[0, 2], [3, 5]]) brush(c, T.slice(i0, i1 + 1).map(([x, y]) => [x + (R() - 0.5) * 0.6, y + (R() - 0.5) * 0.6]), lw, C.ink, R, { bristles: 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 });
    band(-14, -7.4, -2.4); band(-18.2, -6.5, -2.3);
    for (let i = 6; i < 9; i++) scute(i);
    return;
  }
  if (L === 'tip') {   // far half: -20 .. -31.4, open at its root
    const T = poly([[-19.6, -6.7], [-24, -5.6], [-31, -3.2], [-31.4, -2.2], [-24, -1.8], [-19.6, -1.7]], R, 0.25);
    partOpen(c, T, 0, 5, skin, M, { lw });
    band(-22.4, -5.6, -2.2); band(-26.6, -4.7, -2.1);
    return;
  }
  if (L === 'body') {
    part(c, ring(-0.4, -5.6, 12.6, 4.4, R, 0.06, 11), skin, M, { lw });
    brush(c, [[-9, -2.6], [0, -2], [9, -2.6]], 1.7, belly, R, { taper: 0.3, dry: 0.3, bristles: 4 });
    for (let i = 0; i < 6; i++) scute(i);
    if (o.risen) ribs(c, -6, -5.4, 4, 4.2, 2.8, R);
    if (o.dead === 'burnt') scorch(c, [[-4, -6, 1.4], [3, -5, 1.2]], R, C.charL);
    scarf(c, o, GATOR_OWN, [[7.8, -10.4], [9.2, -6.8], [8.6, -2.4]], [[8.8, -4], [6.4, -0.8]], 3, R);
    return;
  }
  if (L === 'jawL') {
    part(c, poly([[11, -5.4], [17, -5.2], [24, -4.8], [24, -6.8], [18, -7.8], [11, -9]], R, 0.2), mouth, M, { lw: 0.9 });   // hidden by the upper jaw while shut
    part(c, poly([[10, -5.2], [17, -4.4], [24.4, -4], [25, -2.6], [17, -1.8], [10, -2.2]], R, 0.2), skin, M, { lw: 1.6 });
    brush(c, [[11, -2.6], [22, -2.6]], 1.1, belly, R, { taper: 0.4, dry: 0.3, bristles: 3 });
    for (let i = 0; i < 4; i++) part(c, poly([[14 + i * 2.6, -4.6], [14.8 + i * 2.6, -6.4], [15.6 + i * 2.6, -4.6]], R, 0.1), teeth, M, { lw: 0.6, sharp: true });
    return;
  }
  if (L === 'head' || L === 'headA') {
    gatorUpper(c, o, L === 'headA' ? 'walk0' : 'idle', skin, teeth, R, M);
    if (o.risen && !o.dead) zMouth(c, [[15, -4.6], [18, -4.4], [21, -4.6]], R, 0.45);
  }
}
function gatorPaint(c, o) {
  const q = partO(o);
  if (q) { if (o.dead) onBack(c, 11, () => gatorPart(c, q)); else gatorPart(c, q); return; }
  if (o.dead) { onBack(c, 11, () => gatorDraw(c, o)); return; }
  if (o.pose === 'jawU') { // the 'hold' frame RENDER baked with this colour / variant / flags, upper jaw only
    const R = rng(bakeSeed(o, 'hold'));
    gatorDraw(c, { ...o, pose: 'hold', R, M: M0(R) }, true);
    return;
  }
  gatorDraw(c, o);
}

// ================================================================ PIRANHA
const PIRANHA_OWN = '#e85a7a';
function piranhaDraw(c, o) {
  const R = o.R, M = o.M, pose = o.dead ? 'swim0' : o.pose;
  if (pose === 'under') { // under ice: only its dark shape shows through (OG draws a shadow there)
    fill(c, ring(0, -3.6, 5.2, 3.2, R, 0.1, 8), '#28405a', R, { vary: 0.05, edge: 0 });
    fill(c, poly([[-4.6, -3.6], [-8, -6], [-7.2, -3.6], [-8, -1.2]], R, 0.2), '#28405a', R, { sharp: true, vary: 0.05, edge: 0 });
    return;
  }
  const body = pc(o, PIRANHA_OWN, C.zskin), back = pc(o, '#9a4b5c', C.zskinD), fin = pc(o, '#c03b5c', C.zskinD), teeth = pc(o, C.white, '#e8ecd2', C.charL);
  const flop = pose === 'flop0' || pose === 'flop1', gape = pose === 'atk' || flop;
  const beat = pose === 'swim1' ? -1 : pose === 'flop0' ? 1.6 : pose === 'flop1' ? -1.6 : 1;
  const bend = flop ? (pose === 'flop0' ? -0.35 : 0.3) : 0;
  about(c, 0, -3.8, bend, () => {
    // forked tail, beating
    about(c, -4, -3.8, beat * 0.22, () => part(c, poly([[-3.8, -3.8], [-8.6, -7.6], [-7.2, -3.8], [-8.6, 0.2]], R, 0.2), fin, M, { lw: 1.2, sharp: true }));
    part(c, poly([[-1.6, -7.2], [-0.4, -9.6], [1.8, -7.4]], R, 0.15), fin, M, { lw: 1, sharp: true }); // dorsal fin
    part(c, poly([[-1.6, -0.6], [-0.6, 1.2], [1.2, -0.4]], R, 0.15), fin, M, { lw: 0.9, sharp: true }); // fin below
    // deep round body, a hump behind its head
    part(c, poly([[-4.4, -4.6], [-2.6, -7.2], [1, -7.8], [4, -6.4], [5.6, -4.4], [5.4, -2.8], [2.4, -0.4], [-1.6, -0.4], [-4, -2.4]], R, 0.15), body, M, { lw: 1.15 });
    brush(c, [[-3, -6.2], [0.6, -7], [3.6, -5.8]], 1.3, back, R, { taper: 0.4, dry: 0.4, bristles: 3 }); // darker back
    for (let i = 0; i < 3; i++) dab(c, -2 + i * 1.4 + R() * 0.6, -3.4 + R() * 1.6, 0.32, tone(back, -0.2), R); // speckles
    // the jutting lower jaw, lined with teeth, gaping as it bites (a white zigzag: teeth read at any size)
    if (gape) { part(c, poly([[2.6, -3.4], [6.4, -4.4], [6.6, -1.8], [3, -1.6]], R, 0.1), pc(o, '#9e1f35', C.zskinD), M, { lw: 0.8 });
      brush(c, [[3.4, -3.7], [3.9, -2.7], [4.5, -3.9], [5.1, -2.9], [5.7, -4.1], [6.2, -3.2]], 0.75, teeth, R, { bristles: 2, dry: 0, taper: 0 }); }
    about(c, 2.8, -2.2, gape ? 0.5 : 0, () => {
      part(c, poly([[2, -2.6], [7.2, -3.4], [7.4, -1.4], [2.6, -0.2]], R, 0.12), body, M, { lw: 1.05 });
      brush(c, [[3.2, -2.9], [3.8, -4], [4.5, -3.1], [5.2, -4.2], [5.9, -3.3], [6.6, -4.3], [7, -3.4]], 0.75, teeth, R, { bristles: 2, dry: 0, taper: 0 });
    });
    brush(c, [[0.4, -5.4], [0.2, -3.6], [0.6, -1.8]], 0.5, C.ink, R, { bristles: 1, dry: 0 }); // gill line
    eye(c, o, 2.6, -4.9, 1.15, R, 'white');
    if (!o.dead && !o.risen) brush(c, [[1.2, -6.6], [3.8, -5.8]], 0.65, C.ink, R, { bristles: 2, dry: 0 }); // a cross brow
    if (flop && !o.dead) dab(c, 5.4, -7.6, 0.6, '#9fd8ff', R); // gasping: a drop flies off
    scarf(c, o, PIRANHA_OWN, [[-0.6, -7.2], [-1.2, -4], [-0.6, -0.8]], null, 1.5, R);
  });
}
function piranhaPaint(c, o) { if (o.dead) onBack(c, 8.6, () => piranhaDraw(c, o)); else piranhaDraw(c, o); }

// ================================================================ CHEETAH (kid-a cheetah, ported, plus OG's poses)
const CHEETAH_OWN = C.cheetah;
const CHEETAH_LEGS = {
  idle: [[[-6, -6], [-6.4, -3], [-6.2, -0.2]], [[-4, -6], [-4, -3], [-3.6, -0.2]], [[6, -6], [6.4, -3], [6.6, -0.2]], [[8, -6], [8.4, -3], [8.8, -0.2]]],
  walk0: [[[-6, -6], [-8.4, -3], [-9.4, -0.2]], [[-4, -6], [-2.6, -3], [-1.6, -0.2]], [[6, -6], [8.6, -3], [9.8, -0.2]], [[8, -6], [6.6, -3], [5.6, -0.2]]],
  walk1: [[[-6, -6], [-4.6, -3], [-3.4, -0.2]], [[-4, -6], [-6.4, -3], [-7.4, -0.2]], [[6, -6], [4.8, -3], [3.6, -0.2]], [[8, -6], [10.4, -3], [11.6, -0.2]]],
  run0: [[[-6, -6], [-10, -3], [-13.2, -1.6]], [[-4, -6], [-7, -2], [-9.6, -0.6]], [[6, -6], [10, -3.4], [13.6, -2.4]], [[8, -6], [12, -2], [15.4, -1.2]]],
  run1: [[[-6, -6], [-3, -3], [-1, -0.4]], [[-4, -6], [-1.6, -2.6], [1, -1]], [[6, -6], [3.4, -3], [1.6, -0.2]], [[8, -6], [6.4, -2.4], [4.4, -0.6]]],
  crouch: [[[-6, -4.4], [-8.6, -3.4], [-6.6, -0.2]], [[-4, -4.4], [-6.4, -3.2], [-4.4, -0.2]], [[6, -4.4], [8.6, -3.2], [7.4, -0.2]], [[8, -4.4], [10.6, -3.2], [9.6, -0.2]]],
  pounce: [[[-6, -9], [-11, -8], [-15.4, -6.4]], [[-4, -9], [-9, -7.4], [-13.4, -5.4]], [[6, -9], [11, -9.4], [16.2, -8.2]], [[8, -9], [13, -8.6], [17.6, -6.8]]],
};
// rig parts (o.L): leg (one ink leg at the near fore hip, the driver puts it on all four), tail, body, head (o.head =
// 'O' jaws open / 'P' tongue out); the scarf goes with the head
function cheetahDraw(c, o) {
  const R = o.R, M = o.M, Lr = o.L, burnt = o.dead === 'burnt', pose = Lr ? (o.head === 'O' ? 'atk' : o.head === 'P' ? 'pant0' : 'idle') : o.dead ? 'run0' : o.pose, naked = bare(o) && !burnt;
  const body = naked ? '#e9b49c' : pc(o, C.cheetah, C.zskin), spots = pc(o, C.ink, C.zskinD);
  const lg = CHEETAH_LEGS[pose] || CHEETAH_LEGS[pose === 'atk' ? 'walk0' : pose === 'pant1' ? 'walk1' : pose === 'pant0' ? 'walk0' : 'idle'];
  const dy = pose === 'crouch' ? 2.4 : pose === 'pounce' ? -3.4 : 0;           // crouched low / airborne
  const tilt = pose === 'pounce' ? -0.12 : pose === 'run1' ? -0.06 : 0;
  const headDy = pose === 'crouch' ? 2.6 : 0, headDx = pose === 'atk' && !Lr ? 2 : 0;  // head down level with its shoulders / darting in
  if (!Lr) for (const l of lg) brush(c, l.map(([x, y]) => [x, y + (pose === 'pounce' ? dy : 0)]), 1.5, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 });
  else if (Lr === 'leg') brush(c, CHEETAH_LEGS.idle[2], 1.5, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 });
  if (Lr === 'leg') return;
  moved(c, 0, dy, () => about(c, 0, -9, tilt, () => {
    const tail = pose === 'crouch' ? [[-9, -8.6], [-14.4, -8.4], [-18.4, -6.6], [-20, -8.4]] : [[-9, -9.6], [-14.4, -12.6], [-17.4, -16.6], [-15.4, -19]];
    if (!Lr || Lr === 'tail') { brush(c, tail, 2.1, body, R, { taper: 0.3, dry: 0.15 }); brush(c, tail.slice(-2), 1.8, C.ink, R, { bristles: 2, dry: 0 }); }
    if (!Lr || Lr === 'body') {
      part(c, ring(0, -9, 10.2, 4.8, R, 0.08, 10), body, M);
      if (!burnt && !naked) for (let i = 0; i < 8; i++) dab(c, -7 + (i % 4) * 4.4 + (R() - 0.5), -11 + (i >> 2) * 3.6 + (R() - 0.5), 0.85, spots, R);
      if (naked || burnt) scorch(c, [[-4, -10, 1.2], [3, -9, 1]], R, burnt ? C.charL : '#8a5a45');
      if (o.risen) ribs(c, -4.6, -9, 3, 4.6, 2.8, R);
    }
    if (Lr && Lr !== 'head') return;
    moved(c, headDx, headDy, () => {
      part(c, ring(11.4, -12.2, 4.3, 3.8, R, 0.08, 8), body, M);
      part(c, poly([[8.6, -15], [9.2, -18.2], [11, -15.6]], R, 0.2), body, M, { lw: 1.1, sharp: true });
      part(c, poly([[12.4, -15.6], [14.2, -18.4], [14.8, -15], ], R, 0.2), body, M, { lw: 1.1, sharp: true });
      if (o.dead) { brush(c, [[11.6, -13.8], [13.4, -12.2]], 0.6, C.ink, R, { bristles: 2, dry: 0 }); brush(c, [[13.4, -13.8], [11.6, -12.2]], 0.6, C.ink, R, { bristles: 2, dry: 0 }); }
      else if (o.risen) { dab(c, 12.8, -13.2, 1.15, MILK, R); dab(c, 13.2, -12.9, 0.45, C.ink, R); dab(c, 15.6, -11.6, 0.8, C.ink, R); }
      else { dab(c, 12.8, -13.2, 0.75, C.ink, R); dab(c, 15.6, -11.6, 0.8, C.ink, R);
        brush(c, [[12.6, -12.4], [12.4, -10.2]], 0.45, C.ink, R, { bristles: 1, dry: 0 }); } // tear mark
      if (pose === 'atk' || pose === 'pounce') { dab(c, 14.6, -9.6, 1.25, '#b8333a', R); dab(c, 15.4, -10.4, 0.45, C.white, R); } // jaws open
      if ((pose === 'pant0' || pose === 'pant1') && !o.dead) brush(c, [[14.4, -10], [15.6, -8.2], [15, -7]], 1, '#ef8fa0', R, { bristles: 2, dry: 0, taper: 0.1 }); // spent: tongue out
      if (o.dead === 'dead') brush(c, [[14, -10.2], [15.4, -8.6]], 0.9, '#ef8fa0', R, { bristles: 2, dry: 0 });
    });
    // team: a painted scarf round the neck
    scarf(c, o, CHEETAH_OWN, [[7.4 + headDx * 0.5, -15.2 + headDy], [8.4 + headDx * 0.5, -12 + headDy * 0.6], [7.6, -7.6]], [[8, -9], [5.4, -5.2]], 2.6, R);
  }));
}
function cheetahPaint(c, o) {
  const q = partO(o);
  if (q && (q.L === 'headO' || q.L === 'headP')) { q.head = q.L[4]; q.L = 'head'; }
  const f = q || o;
  if (o.dead) onBack(c, 18.6, () => cheetahDraw(c, f)); else cheetahDraw(c, f);
}

// ================================================================ FROG (Mage's curse)
const FROG_OWN = '#2fae63';
function frogDraw(c, o) {
  const R = o.R, M = o.M, pose = o.dead ? 'idle' : o.pose;
  // what it was: OG mixes the whole frog 40 % toward the cursed type's colour (game.js:20826); its belly is half that
  // body colour in OG (shader frogBean `belly = mix(base, pale, 0.5)`), so it takes 20 %. RENDER passes o.col = the cursed
  // type's own colour (u.curseType), else the frog's own.
  const was = teamOf(o, FROG_OWN), tint = (h, t) => (was ? mixHex(h, was, t) : h);
  const skin = pc(o, tint(FROG_OWN, 0.4), C.zskin), dark = pc(o, tint('#17703d', 0.4), C.zskinD), belly = pc(o, tint('#f3e98c', 0.2), tone(C.zskin, 0.45), C.charL);
  const hop = pose === 'hop', swim = pose === 'swim0' || pose === 'swim1', gulp = pose === 'gulp', open = pose === 'tongue';
  const lift = hop ? -3.4 : swim ? 1.6 : 0, stretch = hop ? -0.28 : 0;
  moved(c, 0, lift, () => about(c, 0, -4, stretch, () => {
    // its hind leg: the shin folded up under the haunch, a long webbed foot flat on the ground; kicked out straight behind
    // hopping and on a swimming kick
    const kick = hop || pose === 'swim1';
    const foot = kick ? [[-5.4, -3.6], [-9.6, -2.4], [-14, -1.2]] : [[-5.6, -2.6], [-7.6, -0.6], [-2.4, 0]];
    tube(c, foot, 1.9, tone(skin, -0.15), R, 1.05);
    const tx = foot[2][0], ty = foot[2][1], d = kick ? -1 : 1;
    for (let j = 0; j < 3; j++) brush(c, [[tx, ty - 0.3], [tx + d * 2, ty - 1 + j * 0.9]], 0.65, tone(skin, -0.15), R, { bristles: 1, dry: 0 });
    // body and head, one outline: a squat dome, a blunt snout
    part(c, poly([[-7, -1.2], [-7.8, -4.8], [-5.8, -7.8], [-1.6, -9.4], [3, -9.4], [6.8, -7.8], [8.6, -5.2], [8.2, -2.6], [5, -1], [0, -0.6]], R, 0.25), skin, M, { lw: 1.45 });
    brush(c, [[-1.6, -1.8], [3, -1.8], [7, -3.2]], 1.4, belly, R, { taper: 0.7, dry: 0.5, bristles: 3 }); // pale belly
    brush(c, [[-6.6, -2], [-6.2, -5.8], [-3.4, -7], [-1.6, -4.4]], 0.85, C.ink, R, { bristles: 2, dry: 0.2, taper: 0.4 }); // the haunch's line
    for (const [x, y, r] of [[-3.6, -7.6, 0.75], [-0.6, -8.4, 0.6], [-5.2, -5.2, 0.55]]) dab(c, x, y, r, dark, R); // spots
    // a long mouth line (open for the tongue, cheeks full gulping), a nostril
    if (open && !o.dead) part(c, poly([[3.4, -4.6], [8.4, -5.8], [8, -2.8]], R, 0.12), '#c8323e', M, { lw: 0.9, sharp: true });
    else brush(c, [[2.4, -4.4], [5.2, -3.6], [8.2, -4.8]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
    if (gulp) part(c, ring(5.2, -3, 1.9, 1.5, R, 0.08, 7), tone(skin, 0.25), M, { lw: 0.8 }); // a full cheek
    dab(c, 7.6, -7.2, 0.4, C.ink, R);
    if (o.risen && !o.dead) zMouth(c, [[3, -4.4], [4.8, -4], [6.6, -4.4]], R, 0.4);
    // bulging eyes up on top (the far one peeking behind); gulping: shut, happy
    part(c, ring(1.8, -10.4, 1.7, 1.7, R, 0.08, 7), tone(skin, -0.12), M, { lw: 1 });
    if (!o.dead && !gulp) { dab(c, 1.9, -10.6, 1.05, C.white, R); dab(c, 2.3, -10.5, 0.55, C.ink, R); }
    part(c, ring(4.6, -10.2, 2.2, 2.1, R, 0.08, 7), skin, M, { lw: 1.15 });
    if (gulp && !o.dead) brush(c, [[3.4, -10.2], [4.6, -11], [5.8, -10.2]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
    else eye(c, o, 4.8, -10.3, 1.35, R, 'white');
    // a webbed hand in front
    tube(c, [[4.4, -2.4], [5, -1], [5.4, 0]], 1.3, skin, R, 0.9);
    for (let j = 0; j < 3; j++) brush(c, [[5.4, -0.1], [6.6, -0.6 + j * 0.5]], 0.5, tone(skin, -0.15), R, { bristles: 1, dry: 0 });
    // ...and has it wear its hat (OG signature = the cursed type's look shape, game.js:19405): a cap in that colour
    const hat = was;
    if (hat) {
      part(c, poly([[-4.8, -8], [-4.4, -11.2], [-2, -12.4], [0.2, -11.4], [0.6, -8.8]], R, 0.15), o.dead === 'burnt' ? C.char : hat, M, { lw: 1.05 });
      brush(c, [[-5.8, -7.9], [-2.2, -8.1], [1.2, -8.8]], 1, C.ink, R, { bristles: 2, dry: 0.2 });
    }
  }));
  if (swim) { const k = pose === 'swim0' ? 0 : 1; brush(c, [[-9 - k * 3, 1.2], [-4, 2], [2, 1.4]], 0.65, '#cfe8fb', R, { bristles: 2, dry: 0.3 }); }
}
function frogPaint(c, o) { if (o.dead) onBack(c, 10.4, () => frogDraw(c, o)); else frogDraw(c, o); }

// ================================================================ SNAKE
// Painted per frame along its body trail (u.b.body, sim/units/animals/snake.js): OG module 617 keeps a 3 px point
// trail behind the head (OG game.js:16892); its girth is radius x 0.551 (OG SNAKE_SLIM, game.js:20079), thickest past
// 2.5 girths from the head, tapering from 55 % of its length to 16 % at the tip (OG game.js:21960-21962); meals bulge
// down it at 35 px/s (OG game.js:21963-21970); its head is lifted off the ground over its first 4 girths (OG snakeNeck,
// game.js:21896-21912) and lunges in on a bite (OG game.js:21835-21848). The static poses are for icons, the sheet and
// RENDER's fallback.
const SNAKE_OWN = '#9ac21f';
const SLIM = 0.551, TAPER_AT = 0.55;
function snakeHead(c, o, gape, R, M) { // a long rounded head, side on, facing +x, its middle at (0, 0), girth 1 = 3.3 px
  const skin = pc(o, SNAKE_OWN, null), dark = pc(o, '#5f7d10', null), belly = pc(o, '#f1ea9a', null, C.charL);
  const up = -0.55 * gape, dn = 0.4 * gape;
  if (gape > 0.05) part(c, poly([[-1.6, -0.2], [4.6, -1.8], [4.6, 1.4]], R, 0.1), '#c8323e', M, { lw: 0.8, sharp: true });
  about(c, -1.6, 0.4, dn, () => part(c, poly([[-3, 0.2], [2, 0.6], [4.8, 0.8], [4.6, 2], [1, 2.6], [-3, 2.4]], R, 0.15), belly, M, { lw: 1.2 }));
  about(c, -1.6, 0, up, () => {
    part(c, poly([[-4.6, 1.6], [-4.8, -1.6], [-2.4, -3.6], [1.4, -3.4], [4.6, -1.8], [5.6, 0], [4.6, 1], [0, 1.2]], R, 0.15), skin, M, { lw: 1.4 });
    dab(c, -2.6, -2.2, 0.7, dark, R); dab(c, 0.2, -2.8, 0.55, dark, R);
    eye(c, o, 1.7, -1.6, 1.15, R, 'white');
    dab(c, 4.9, -0.6, 0.35, C.ink, R);
    if (gape > 0.05) for (let i = 0; i < 2; i++) part(c, poly([[3.2 + i * 1.2, 0.8], [3.6 + i * 1.2, 2.2], [4 + i * 1.2, 0.8]], R, 0.05), C.white, M, { lw: 0.4, sharp: true });
  });
  if (!gape && !o.dead) brush(c, [[5.2, 0.2], [7.4, 0.4], [8.4, -0.4]], 0.5, '#e8768c', R, { bristles: 1, dry: 0, taper: 0 }), brush(c, [[7.4, 0.4], [8.6, 1]], 0.45, '#e8768c', R, { bristles: 1, dry: 0, taper: 0 }); // forked tongue
}
/** a static snake lying in an S on the ground, head lifted (icons, sheet, fallback). */
function snakeStatic(c, o, gape) {
  const R = o.R, M = o.M, skin = pc(o, SNAKE_OWN, null), dark = pc(o, '#5f7d10', null);
  const pts = [[8, -9], [4, -4.2], [-2, -2.6], [-9, -4.4], [-15, -2.4], [-20, -2.8], [-24, -1.6]];
  tube(c, pts, 5.4, skin, R, 1.5);
  const P = spline(pts, false, 6);
  for (let i = 6; i < P.length - 4; i += 6) { const [x, y] = P[i], [x2, y2] = P[i + 1], dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; brush(c, [[x - nx * 2.2, y - ny * 2.2], [x + nx * 2.2, y + ny * 2.2]], 1.5, dark, R, { bristles: 2, taper: 0.2, dry: 0.2 }); }
  brush(c, pts.slice(1, 5).map(([x, y]) => [x, y + 1.6]), 1, pc(o, '#f1ea9a', null, C.charL), R, { taper: 0.5, dry: 0.5, bristles: 2 });
  moved(c, 9.4, -10.6, () => about(c, 0, 0, -0.15, () => snakeHead(c, o, gape, R, M)));
  scarf(c, o, SNAKE_OWN, [[5.4, -8.6], [6.6, -5.6], [5.2, -3.4]], null, 2.4, R);
}
function snakePaint(c, o) {
  if (o.pose === 'head' || o.pose === 'headAtk') { // head only, for drawUnit (box anchor = the head's middle)
    snakeHead(c, o, o.pose === 'headAtk' ? 1 : 0, o.R, o.M);
    return;
  }
  if (o.dead) { onBack(c, 11, () => snakeStatic(c, o, 0)); return; }
  snakeStatic(c, o, o.pose === 'atk' ? 1 : 0);
}

// ---------------------------------------------------------------- snake: the body chain, painted per frame
// RENDER's drawUnit contract (index.js): x, y = feet in sim px, api.S = device px per sim px, api.get / api.put place
// atlas sprites. The body is a few batched strokes in sim px (no allocation: fixed scratch arrays).
const SN_MAX = 240;
const sx = new Float32Array(SN_MAX), sy = new Float32Array(SN_MAX), sg = new Float32Array(SN_MAX), ss = new Float32Array(SN_MAX);
const JIT = new Float32Array(64); { const r = rng(91); for (let i = 0; i < 64; i++) JIT[i] = (r() - 0.5) * 2; }
/** sample the trail from the head every ~0.9 girth, girths (+ meal bulges) and the head end's lift; returns the count. */
function snakeSample(body, hx, hy, ox, oy, girth, now, dead) {
  const step = Math.max(2.4, girth * 0.9), len = Math.min(body.length, (body.count - 1) * 3);
  let n = 1, acc = 0, px = hx, py = hy;
  sx[0] = hx + ox; sy[0] = hy + oy; ss[0] = 0;
  for (let q = 0; q < body.count && n < SN_MAX; q++) {
    const bx = body.pointX(q), by = body.pointY(q), d = Math.hypot(bx - px, by - py);
    if (d <= 0) continue;
    acc += d; px = bx; py = by;
    if (acc >= len) { sx[n] = bx + ox; sy[n] = by + oy; ss[n] = acc; n++; break; }
    if (acc - ss[n - 1] >= step) { sx[n] = bx + ox; sy[n] = by + oy; ss[n] = acc; n++; }
  }
  const L = ss[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const f = ss[i] / L;
    let g = girth * (0.72 + 0.28 * Math.min(1, ss[i] / (2.5 * girth))) * (f > TAPER_AT ? 1 - (f - TAPER_AT) / (1 - TAPER_AT) * 0.84 : 1);
    if (!dead) for (let m = 0; m < 4; m++) { // meals bulge down it at 35 px/s (OG game.js:21963-21970)
      const at = body.mealAt[m]; if (at < 0) continue;
      const r = 35 * (now - at) + 1.5 * girth; if (r >= L) continue;
      const h = r / L < 0.6 ? 1 : 1 - (r / L - 0.6) / 0.4, d = (ss[i] - r) / (2.2 * girth);
      g += girth * body.mealSize[m] * h * Math.exp(-d * d * 2);
    }
    sg[i] = g;
    const e = Math.min(1, ss[i] / (4 * girth)); // the head end lifted 2 girths, easing out over 4 (OG snakeNeck)
    if (!dead) sy[i] -= 2 * girth * (1 - e * e * (3 - 2 * e));
  }
  return n;
}
/** one pass over the samples: runs of segments of about the same width share a path. dy: offset as a fraction of width. */
function snakePass(ctx, n, col, wk, wa, dy, jit, v, minG) {
  ctx.strokeStyle = col;
  let open = false, cw = 0;
  for (let i = n - 1; i > 0; i--) {
    if (sg[i] < minG) { if (open) { ctx.stroke(); open = false; } continue; }
    const w = 2 * sg[i] * wk + wa;
    if (!open || Math.abs(w - cw) > cw * 0.1) {
      if (open) ctx.stroke();
      ctx.beginPath(); ctx.lineWidth = cw = w; open = true;
      const j = (i * 7 + v * 19) & 63;
      ctx.moveTo(sx[i] + JIT[j] * jit, sy[i] + JIT[(j + 5) & 63] * jit + sg[i] * dy);
    }
    const j = ((i - 1) * 7 + v * 19) & 63;
    ctx.lineTo(sx[i - 1] + JIT[j] * jit, sy[i - 1] + JIT[(j + 5) & 63] * jit + sg[i - 1] * dy);
  }
  if (open) ctx.stroke();
}
const SN_INK = C.ink, SN_DARK = '#5f7d10', SN_LIGHT = tone(SNAKE_OWN, 0.22), SN_BELLY = '#ece685';
function snakeBody(ctx, n, skin, dark, light, belly, v) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  snakePass(ctx, n, SN_INK, 1, 2.7, 0, 0.32, v, 0);            // the outline, boiling a little
  snakePass(ctx, n, skin, 1, 0, -0.08, 0, v, 0);               // the paint, missing it a touch
  snakePass(ctx, n, light, 0.32, 0, -0.42, 0.15, v, 1.2);      // a streak of lighter paint along its back
  snakePass(ctx, n, belly, 0.26, 0, 0.5, 0.1, v, 1.2);         // its pale belly along its near side
  ctx.strokeStyle = dark; ctx.beginPath(); let any = false;     // blotches across its back every 2 samples
  for (let i = 2; i < n - 1; i += 2) {
    if (sg[i] < 1) continue;
    const dx = sx[i + 1] - sx[i - 1], dy = sy[i + 1] - sy[i - 1], l = Math.hypot(dx, dy) || 1, g = sg[i] * 0.92;
    ctx.moveTo(sx[i] - dy / l * g, sy[i] + dx / l * g * 0.2 - g * 0.55); ctx.lineTo(sx[i] + dy / l * g * 0.3, sy[i] - dx / l * g * 0.3 - g * 0.1); any = true;
  }
  if (any) { ctx.lineWidth = Math.max(0.9, sg[Math.min(n - 1, 3)] * 0.8); ctx.stroke(); }
}
function snakeDrawUnit(ctx, u, x, y, flip, k, t, api) {
  const body = u.b && u.b.body; if (!body || body.count < 2 || !api) return false;
  const v = api.v || 0, girth = u.radius * SLIM, hx = x / k, hy = y / k; // the head in sim px (interpolated)
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const n = snakeSample(body, u.x, u.y, hx - u.x, hy - u.y, girth, t, false);
  if (n < 2) return false;
  snakeBody(ctx, n, SNAKE_OWN, SN_DARK, SN_LIGHT, SN_BELLY, v);
  // Team battle: a band in the team colour behind the head
  const team = api.col === 1 ? C.red : api.col === 2 ? C.blue : null;
  if (team && n > 3) {
    const i = 2, dx = sx[i + 1] - sx[i - 1], dy = sy[i + 1] - sy[i - 1], l = Math.hypot(dx, dy) || 1, g = sg[i] * 1.12;
    ctx.lineCap = 'round'; ctx.strokeStyle = C.ink; ctx.lineWidth = girth * 1.1 + 1.2;
    ctx.beginPath(); ctx.moveTo(sx[i] - dy / l * g, sy[i] + dx / l * g); ctx.lineTo(sx[i] + dy / l * g, sy[i] - dx / l * g); ctx.stroke();
    ctx.strokeStyle = team; ctx.lineWidth = girth * 1.1; ctx.stroke();
  }
  // the head, turned along its neck and never upside down; lunging in with its jaws open on a bite, agape swallowing
  const att = u.attack > 0 ? bell(u.attack) : 0, open = att > 0.15 || u.subState === 1;
  const j = Math.min(2, n - 1), a = Math.atan2(sy[0] - sy[j], sx[0] - sx[j]), dir = Math.cos(a) >= 0 ? 1 : -1;
  const reach = att * 1.2 * girth + girth * 0.5, sc = u.radius / 6.05;
  api.put(api.get(u.type, open ? 'headAtk' : 'head', api.col), sx[0] + Math.cos(a) * reach, sy[0] + Math.sin(a) * reach, dir, sc, dir > 0 ? a : a - Math.PI);
  return true;
}
/** a dead snake from world.snakes.dead (OG writeDeadSnakes, game.js:21943-21953): drawn 1.1 s, fading over the last 0.35. */
function snakeDrawCorpse(ctx, rec, x, y, k, t) {
  const age = t - rec.time; if (age < 0 || age >= 1.1 || !rec.body || rec.body.count < 2) return;
  ctx.setTransform(k, 0, 0, k, 0, 0); const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * Math.min(1, (1.1 - age) / 0.35);
  const n = snakeSample(rec.body, rec.x, rec.y, x / k - rec.x, y / k - rec.y, rec.girth * SLIM, t, true);
  if (n >= 2) {
    const skin = tone(SNAKE_OWN, -0.2), g = rec.girth * SLIM;
    snakeBody(ctx, n, skin, '#4f6a0c', tone(SNAKE_OWN, 0.05), '#cfc979', 0);
    // its head flat on the ground at the front, X-eyed
    const j = Math.min(2, n - 1), a = Math.atan2(sy[0] - sy[j], sx[0] - sx[j]), hx = sx[0] + Math.cos(a) * g * 0.9, hy = sy[0] + Math.sin(a) * g * 0.9;
    ctx.beginPath(); ctx.ellipse(hx, hy, g * 1.45, g * 1.05, a, 0, TAU);
    ctx.fillStyle = skin; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.stroke();
    const ex = hx + Math.cos(a) * g * 0.3, ey = hy - g * 0.35, e = g * 0.38;
    ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(ex - e, ey - e); ctx.lineTo(ex + e, ey + e); ctx.moveTo(ex + e, ey - e); ctx.lineTo(ex - e, ey + e); ctx.stroke();
  }
  ctx.globalAlpha = a0;
}

// ---------------------------------------------------------------- frog: the tongue (OG writeTongues game.js:21763-21788; tip OG kt game.js:16033-16058)
const TONGUE = '#e8768c';
function frogPose(u, t) {
  const b = u.b || {}, s = u.subState;
  if ((u.wet || 0) >= DEEP) return cyc(u, t, 3) ? 'swim1' : 'swim0';
  if (s === 1 || s === 2 || s === 3 || u.attack > 0) return 'tongue';
  if (s === 4) return 'gulp';
  if (b.timer <= b.hopStart && t - b.hopStart >= 0 && t - b.hopStart < 0.32) return 'hop';
  return 'idle';
}
function frogOver(ctx, u, x, y, flip, k, t) {
  const s = u.subState; if (s !== 1 && s !== 2 && s !== 3) return;
  const b = u.b, r = u.radius, X = x / k, Y = y / k, ox = X - u.x, oy = Y - u.y;
  const mx = X + flip * r * 1.2, my = Y - r * 1.05;               // mouth, up at the lip (OG game.js:16006-16010, 15782)
  let tx = b.aimX + ox, ty = b.aimY + oy, h = 0.5 * r, m = 1;
  if (s === 1) { h = 0.9 * r; m = Math.min(1, ((t - b.linkAt) * 700) / (Math.hypot(tx - mx, ty - my) || 1)); }
  else if (s === 3) m = Math.max(0, 1 - (t - b.linkAt) / 0.15);
  else { // reeling in: the prey slides from where it was caught to the mouth (sim/units/mythical/frog.js carry)
    const q = Math.min(1, (t - b.linkAt) / 0.35), e = q * q, hr = b.heldR || 4, pr = hr * (1 - 0.5 * Math.max(0, (e - 0.7) / 0.3));
    tx = tx + (X + flip * r * 1.2 - tx) * e; ty = ty + (Y + 1 - ty) * e;
    h = Math.max(1, e * (r * 1.05 - pr) + Math.sin(Math.PI * e) * r * 0.5) + 0.9 * pr;
  }
  const ex = mx + (tx - mx) * m, ey = my + (ty - h - my) * m;
  if (Math.hypot(ex - mx, ey - my) < 0.8) return;
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineCap = 'round';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 0.44 * r + 1.2; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = TONGUE; ctx.lineWidth = 0.44 * r; ctx.stroke();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(ex, ey, 0.36 * r + 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = TONGUE; ctx.beginPath(); ctx.arc(ex, ey, 0.36 * r, 0, TAU); ctx.fill();
}

// ================================================================ the registry
export const SPRITES = {
  // BOAR (OG game.js:17930-18224). idle / walk0 / walk1 (trot); atk = gore, head swung up (u.attack > 0);
  // run0 / run1 = charging, legs flung out / gathered, head down, red eye (state Charge or Flee and speed > 0.7 x runSpeed);
  // paw0 / paw1 = pawing the ground, head low, red eye (state Alert with a target, OG renderer game.js:19292-19300).
  // o.singed / o.hatless (u.singed) = fur burnt off (OG look.fur, game.js:8856): bare pink skin, scorch marks.
  // Floppy (rig-quad.js 'quad'): legs trot / gallop on the stride, the body pitches and bobs, the head lags on its neck
  // (swings up to gore: atk; red eye charging / pawing), the curly tail streams and wags; pawing scrapes a fore hoof.
  boar: {
    box: [44, 32, 21, 26], scale: 1, own: BOAR_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['run0', 'run1', 'paw0', 'paw1', 'r:legN', 'r:legF', 'r:tail', 'r:body', 'r:head', 'r:headR'],
    rig: {
      driver: 'quad', q: 'boar',
      parts(pose) {
        const run = pose === 'run0' || pose === 'run1', paw = pose === 'paw0' || pose === 'paw1';
        return quadParts({ l0: 'r:legN', l1: 'r:legF', l2: 'r:legN', l3: 'r:legF', body: 'r:body', tail: 'r:tail', head: run || paw ? 'r:headR' : 'r:head',
          gait: run ? 2 : paw ? 3 : 1, headA: pose === 'atk' ? -0.55 : run ? 0.14 : paw ? 0.22 : 0 });
      },
    },
    paint: boarPaint,
    pick(u, t) {
      if (u.attack > 0) return 'atk';
      if ((u.state === ST.CHARGE || u.state === ST.FLEE) && speed(u) > 0.7 * (u.def.runSpeed || 150)) return cyc(u, t, 9) ? 'run1' : 'run0';
      if (u.state === ST.ALERT && u.target >= 0 && !(u.stun > 0)) return cyc(u, t, 2.6) ? 'paw1' : 'paw0';
      return null;
    },
  },
  // RAT (OG game.js:11195-11501). idle / walk0 / walk1 (patter, tail streaming); atk = nip, buck teeth (u.attack > 0,
  // also each bite of a corpse); eat = head down at a corpse between bites (state Engage with no target: scavenging,
  // OG game.js:11343); rear = up on its hind legs sniffing (subState 2 PAUSED, OG renderer game.js:20975);
  // swim0 / swim1 = paddling, head up (u.wet >= 0.75, OG game.js:20864).
  rat: {
    box: [30, 21, 17, 16], scale: 1, own: RAT_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['eat', 'rear', 'swim0', 'swim1'],
    rig: { driver: 'wobble', parts: WOBBLE, wobble: { tilt: 1, squash: 1 } },   // floppy: too small for limbs (RIG.md)
    paint: ratPaint,
    pick(u, t) {
      if ((u.wet || 0) >= DEEP) return cyc(u, t, 4) ? 'swim1' : 'swim0';
      if (u.attack > 0) return 'atk';
      if (u.subState === 2) return 'rear';
      if (u.state === ST.ENGAGE && !(u.target >= 0)) return 'eat';
      return null;
    },
  },
  // ANT (OG game.js:11938-12149). idle / walk0 / walk1 (tripod gait); atk = bite, head lunged, jaws open (u.attack > 0;
  // also its dig and carry animations); seed0 / seed1 = going home with a seed in its jaws (subState 4 = JOB.Returning,
  // OG renderer game.js:21068); carry = braced, jaws on a corpse (subState 5 = JOB.Carrying and state Engage);
  // raft = legs splayed flat on the water (u.wet >= 0.05).
  ant: {
    box: [22, 16, 10, 13], scale: 1, own: ANT_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['seed0', 'seed1', 'carry', 'raft'],
    rig: { driver: 'wobble', parts: WOBBLE, wobble: { tilt: 0.8, squash: 0.8 } },   // floppy: too small for limbs (RIG.md)
    paint(c, o) { antPaint(c, o, ANT_OWN, false); },
    pick(u, t) {
      if ((u.wet || 0) >= 0.05) return 'raft';
      if (u.attack > 0) return 'atk';
      if (u.subState === 5 && u.state === ST.ENGAGE) return 'carry';
      if (u.subState === 4) return speed(u) > 7 ? (cyc(u, t, 7) ? 'seed1' : 'seed0') : 'seed0';
      return null;
    },
  },
  // SOLDIER ANT (OG game.js:12156-12175): the ant, 1.4x, red-brown, a big head with great curved pale jaws.
  // idle / walk0 / walk1 / atk as the ant; raft = in water (u.wet >= 0.05).
  soldierant: {
    box: [22, 16, 10, 13], scale: 1.4, own: SOLDIER_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['raft'],
    rig: { driver: 'wobble', parts: WOBBLE, wobble: { tilt: 0.9, squash: 0.9 } },   // floppy: too small for limbs (RIG.md)
    paint(c, o) { antPaint(c, o, SOLDIER_OWN, true); },
    pick(u) { if ((u.wet || 0) >= 0.05) return 'raft'; return u.attack > 0 ? 'atk' : null; },
  },
  // ANTHILL (OG game.js:12184-12238, growth game.js:3736-3750). Poses h0..h3 = floor(u.b.size) (0..3): a ring of dirt
  // round a hole growing to a tall heap, min(4, 1 + floor(size)) entrances round its front, crumbs. Each pose is painted
  // at its own size; drawUnit places it at u.radius / that size and never flips it (OG game.js:20845). Team battle: a
  // flag in the colony's colour on top. Burning (u.burning > 0): b0..b3 = the same heaps with the dirt scorched (OG more.w,
  // game.js:21125-21128), plus RENDER's fire. A prop: no corpse in OG ('dead' = a flattened ring).
  anthill: {
    box: [62, 40, 31, 26], scale: 1, own: HILL_OWN, lie: 'none',
    poses: ['h0', 'h1', 'h2', 'h3'], extra: ['b0', 'b1', 'b2', 'b3'], poseR: HILL_R, noFlip: true,
    rig: { driver: 'wobble', parts: WOBBLE, wobble: { tilt: 0.25, squash: 1.6 } },   // floppy: a heap of dirt that squashes when hit
    paint: hillPaint,
    pick(u) { return (u.burning > 0 ? 'b' : 'h') + Math.max(0, Math.min(3, Math.floor((u.b && u.b.size) || 0))); },
  },
  // APE (OG game.js:13924-14501; arms OG apeArm game.js:14490-14500). idle / walk0 / walk1 = knuckle-walking;
  // run0 / run1 = galloping (state Charge and speed > 0.6 x runSpeed); slam0 = up on its hind legs, fists overhead
  // (subState 1 WINDUP), slam1 = fists down on the ground ahead (subState 2 RECOVER); hoist = holding something overhead
  // (subState 4 HOLD; also subState 7 POUNCE, OG 3.9); throw = the follow-through (now - u.firedAt < 0.35);
  // beat0 / beat1 = drumming its chest, roaring (subState 6 BEAT, alternating at 6 Hz); climb = hanging from a branch by
  // one arm (u.perch > 0 && u.climb > 0; RENDER already raises it by climb x 23 px); wade = up on its hind legs, hands
  // held up out of the water (u.wet >= 0.05, doing nothing else). o.singed / o.hatless = fur burnt off.
  // Floppy (rig-quad.js 'quad', table 'ape'): knuckle-walking as a four-legged trot / gallop with its arms as the fore
  // legs, the heavy arms lagging on a spring, the body bobbing and rocking hard, the head nodding on its neck. The
  // action poses (slam, hoist, throw, beat, climb, wade) are drawn whole.
  ape: {
    box: [46, 50, 20, 44], scale: 1, own: APE_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1'], extra: ['run0', 'run1', 'slam0', 'slam1', 'hoist', 'throw', 'beat0', 'beat1', 'climb', 'wade', 'r:legF', 'r:armF', 'r:legN', 'r:body', 'r:armN', 'r:head'],
    rig: {
      driver: 'quad', q: 'ape',
      parts(pose) {
        const run = pose === 'run0' || pose === 'run1';
        if (!run && pose !== 'idle' && pose !== 'walk0' && pose !== 'walk1') return null;
        return quadParts({ l0: 'r:armN', l1: 'r:armF', l2: 'r:legN', l3: 'r:legF', body: 'r:body', head: 'r:head', gait: run ? 2 : 1, headA: run ? 0.1 : 0 });
      },
    },
    paint: apePaint,
    pick(u, t) {
      const s = u.subState;
      if (u.perch > 0 && u.climb > 0) return 'climb';
      if (s === 7 || s === 4) return 'hoist';
      if (s === 1) return 'slam0';
      if (s === 2) return 'slam1';
      if (s === 6) return cyc(u, t, 6) ? 'beat1' : 'beat0';
      if (u.firedAt > 0 && t - u.firedAt < 0.35) return 'throw';
      if ((u.wet || 0) >= 0.05) return 'wade';
      if (u.state === ST.CHARGE && speed(u) > 0.6 * (u.def.runSpeed || 185)) return cyc(u, t, 7) ? 'run1' : 'run0';
      return null;
    },
  },
  // APE CAVALRY (OG game.js:13076-13087, Cavalry brain 12716-12780): an ape riding ARMY's horse. idle / walk0 / walk1;
  // run0 / run1 = gallop (state Charge or Flee, or riding through: subState 1, and speed > 130); atk = the ape's fist
  // swung over and down (u.attack > 0). Saddle cloth yellow (as cavalry), the team colour in Team battle (+ the ape's
  // scarf). Dead = the horse alone on its back (OG bodyShape Horse; a rider who dies is its own corpse).
  // Floppy (rig-quad.js 'quad', table 'horse'): ARMY's horse rigged as the cavalry's, the ape one part ('r:rider', 'r:riderA'
  // the fist swung over) on its back, tilting after it and bouncing in the saddle, leaning in at a gallop.
  apecav: {
    box: [58, 54, 26, 48], scale: 1, own: APE_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['run0', 'run1'].concat(horseParts ? HORSE_PARTS : [], horseParts ? ['r:rider', 'r:riderA'] : []),
    rig: horseParts ? {
      driver: 'quad', q: 'horse',
      parts(pose) {
        const run = pose === 'run0' || pose === 'run1';
        return horseParts({ rider: pose === 'atk' ? 'r:riderA' : 'r:rider', gait: run ? 2 : pose === 'atk' ? 5 : 1, headA: run ? 0.12 : 0, rlean: run ? 0.2 : 0 });
      },
    } : undefined,
    paint: apecavPaint,
    pick(u, t) {
      if (u.attack > 0) return 'atk';
      if ((u.state === ST.CHARGE || u.subState === 1 || u.state === ST.FLEE) && speed(u) > 130) return cyc(u, t, 8) ? 'run1' : 'run0';
      return null;
    },
  },
  // ALLIGATOR (OG game.js:1690-1956). idle / walk0 / walk1 (sprawling walk, tail waving); atk = jaws flung open
  // (u.attack > 0); hold = jaws clamped round a victim (u.b.jaws != 0, OG renderer game.js:21046); swim = legs tucked back
  // (u.wet >= 0.75). Thick ink, yellow belly.
  // Holding (OG game.js:20762-20778, 20988-20991, 21163-21171): RENDER draws the victim with its middle at `mouth` (sprite
  // px, facing right; OG puts it 1.55 r ahead at the mouth line = halfway along OG's jaw, which is halfway along ours),
  // turned 1.35 rad toward the snout, then 'jawU' (the hold frame's upper jaw alone, same seed) again over it.
  // Floppy (rig-quad.js 'quad', table 'gator'): short legs paddle on the stride, the tail swings on a spring with its
  // far half lagging it, the body bobs a little, the jaws snap open on stiff springs (atk) and shut with a wobble.
  // 'hold' (a victim in the jaws: RENDER's 'jawU' over-draw needs the exact 'hold' sprite) and 'swim' are drawn whole.
  gator: {
    box: [64, 24, 34, 17], scale: 1, own: GATOR_OWN, lie: 'none', mouth: [18, -5.4],
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['hold', 'swim', 'jawU', 'r:legFF', 'r:legFH', 'r:tip', 'r:tail', 'r:body', 'r:jawL', 'r:head', 'r:headA', 'r:legNF', 'r:legNH'],
    rig: {
      driver: 'quad', q: 'gator',
      parts(pose) {
        if (pose === 'hold' || pose === 'swim' || pose === 'jawU') return null;
        return quadParts({ l0: 'r:legNF', l1: 'r:legFF', l2: 'r:legNH', l3: 'r:legFH', body: 'r:body', tail: 'r:tail', tip: 'r:tip', jawL: 'r:jawL',
          head: pose === 'idle' ? 'r:head' : 'r:headA', up: pose === 'atk' ? -0.55 : 0, dn: pose === 'atk' ? 0.28 : 0 });
      },
    },
    paint: gatorPaint,
    pick(u) {
      if (u.b && u.b.jaws) return 'hold';
      if (u.attack > 0) return 'atk';
      if ((u.wet || 0) >= DEEP) return 'swim';
      return null;
    },
  },
  // PIRANHA (OG game.js:4235-4520). swim0 / swim1 = tail beating (in water); atk = jaw gaping, teeth (u.attack > 0);
  // flop0 / flop1 = stranded on land, thrashing, gasping (u.wet < 0.05, OG game.js:4316); under = a dark shape under
  // ice (world.iceAt(u.x, u.y) > 0, OG game.js:20797).
  piranha: {
    box: [21, 15, 9, 12], scale: 1, own: PIRANHA_OWN, lie: 'none',
    poses: ['swim0', 'swim1', 'atk'], extra: ['flop0', 'flop1', 'under'],
    rig: { driver: 'wobble', parts: (pose) => (pose === 'under' ? null : { main: pose }), wobble: { tilt: 1.3, squash: 1.2 } },   // floppy (in water it is drawn whole: waterline)
    paint: piranhaPaint,
    pick(u, t, w) {
      if (w && w.iceCells > 0 && typeof w.iceAt === 'function' && w.iceAt(u.x, u.y) > 0) return 'under';
      if (!((u.wet || 0) >= 0.05)) return cyc(u, t, 7) ? 'flop1' : 'flop0';
      if (u.attack > 0) return 'atk';
      return cyc(u, t, 5) ? 'swim1' : 'swim0';
    },
  },
  // SNAKE (OG game.js:16564-16857, body module 16858-17040). drawUnit paints it per frame: the body chain from u.b.body
  // (lifted at the head end, tapering, meals bulging down it), the head sprite turned along the neck: 'headAtk' = lunging
  // in, jaws open (u.attack > 0) or agape swallowing (subState 1), else 'head'. Team battle: a band behind the head.
  // Static idle / atk = icons, the sheet, the fallback. drawCorpse(ctx, rec, now, S) paints a dead body from
  // world.snakes.dead (OG writeDeadSnakes); a snake's normal corpse is never drawn (CORE-B corpseVisible skips it).
  snake: {
    box: [48, 22, 30, 16], scale: 1, own: SNAKE_OWN, lie: 'none',
    poses: ['idle', 'atk'], extra: ['head', 'headAtk'],
    paint: snakePaint,
    drawUnit: snakeDrawUnit,
    drawCorpse: snakeDrawCorpse,
  },
  // CHEETAH (kid-a cheetah, OG game.js:18495-18803). idle / walk0 / walk1 (trot); run0 / run1 = sprint gallop, stretched
  // / gathered (subState 1 SPRINTING, or speed > 0.6 x runSpeed); crouch = stalking low, head level with its shoulders
  // (state Alert and subState 0, OG renderer game.js:19324-19330); pounce = flying at its prey, fore legs reaching
  // (subState 4); atk = biting / mauling, jaws open (u.attack > 0 or subState 2 MAUL); pant0 / pant1 = spent, tongue out
  // (subState 3 RECOVER while now < u.b.timer, OG flourish game.js:19406). o.singed / o.hatless = fur burnt off.
  // Floppy (rig-quad.js 'quad'): ink legs trot / gallop, body pitches and bobs, head on a neck spring (darts in to bite,
  // jaws open; tongue out panting), the tail streams flat when it sprints and droops stalking; crouch squats the body
  // down on bent legs; pounce flings the legs out with the body sprung up.
  cheetah: {
    box: [46, 30, 23, 26], scale: 1, own: CHEETAH_OWN, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['run0', 'run1', 'crouch', 'pounce', 'pant0', 'pant1', 'r:leg', 'r:tail', 'r:body', 'r:head', 'r:headO', 'r:headP'],
    rig: {
      driver: 'quad', q: 'cheetah',
      parts(pose) {
        const run = pose === 'run0' || pose === 'run1', pant = pose === 'pant0' || pose === 'pant1', open = pose === 'atk' || pose === 'pounce';
        const p = { l0: 'r:leg', l1: 'r:leg', l2: 'r:leg', l3: 'r:leg', body: 'r:body', tail: 'r:tail', head: open ? 'r:headO' : pant ? 'r:headP' : 'r:head', gait: run ? 2 : 1 };
        if (pose === 'atk') { p.hx = 2; p.headA = 0.1; }
        else if (run) { p.headA = 0.06; p.tailT = -0.45; }
        else if (pose === 'crouch') { p.headA = 0.42; p.lift = 2.4; p.tailT = -0.85; }
        else if (pose === 'pounce') { p.gait = 4; p.lift = -3.4; p.pitch = -0.12; p.headA = -0.1; p.tailT = -0.6; }
        else if (pant) p.headA = 0.15;
        return quadParts(p);
      },
    },
    paint: cheetahPaint,
    pick(u, t) {
      const s = u.subState;
      if (s === 4) return 'pounce';
      if (s === 2 || u.attack > 0) return 'atk';
      if (s === 3 && u.b && t < u.b.timer) return speed(u) > 7 ? (cyc(u, t, 6) ? 'pant1' : 'pant0') : 'pant0';
      if (u.state === ST.ALERT && s === 0) return 'crouch';
      if (s === 1 || speed(u) > 0.6 * (u.def.runSpeed || 170)) return cyc(u, t, 10) ? 'run1' : 'run0';
      return null;
    },
  },
  // FROG (Mage's curse; OG game.js:15781-16070). OG tints a frog toward what it was and has it wear its hat: RENDER
  // passes o.col = the cursed type's own colour (u.curseType); the whole frog is mixed 40 % toward it (OG game.js:20826)
  // and wears a cap in it; over() paints the tongue. idle = sitting; hop = mid-hop, legs kicked out (timer <= hopStart and now - hopStart < 0.32,
  // OG game.js:15833); tongue = mouth open while the tongue is out (subState 1 / 2 / 3) or biting (undead, u.attack > 0);
  // gulp = a full cheek, eyes shut (subState 4, digesting); swim0 / swim1 = breaststroke (u.wet >= 0.75).
  frog: {
    box: [26, 22, 14, 19], scale: 1, own: FROG_OWN, lie: 'none',
    poses: ['idle', 'hop', 'tongue'], extra: ['gulp', 'swim0', 'swim1'],
    rig: { driver: 'wobble', parts: WOBBLE, wobble: { tilt: 0.7, squash: 1.8 } },   // floppy: a squishy frog (over() still paints the tongue)
    paint: frogPaint,
    pick(u, t) { return frogPose(u, t); },
    over: frogOver,
  },
};
