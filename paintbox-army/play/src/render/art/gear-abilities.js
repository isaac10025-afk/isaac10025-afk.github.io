// Unit maker art (OURS, Part 2 step 8, STEP8.md "Art contract"). Owner: ART-ABILITY.
// GEAR[abilityId] = the gear an ability shows on a made unit's body, ICON[abilityId] = its picker emblem (all 48).
// Everything POSTER PAINT (ART.md): fat dry brush strokes, fills that miss their wobbly ink outlines, the game's palette.
//
// ---- GEAR frames (ART-BODY places them; read STEP8.md "Art contract")
// GEAR[id] = { at, box: [w, h, ax, ay], paint(c, o), behind?, ...hints }, sim px for a PERSON at size 1 (ART-BODY scales
// per body). paint() paints ONE frame with the root at (0, 0), facing RIGHT, up = -y; box = the canvas to bake it in
// (x from -ax to w - ax, y from -ay to h - ay). o = { R, M, body, col, dead, v, pose: 'idle' | 'atk' } (+ risen ignored):
//   col  the unit colour (Team battle: the team colour): flags, magnets, collars, shield faces, fin tips, saucer stripe.
//   dead 'burnt' = all charcoal; 'dead' = the same gear (cracked glass, no glow, no sparks).
//   body 'animal' | 'beast' = the back is FLAT (four legs): shell, armour, spikes and the heal pack lie along the back,
//        centred on the root; 'person' | 'giant' = upright: they hang down the back from the root (top of the back).
//   v    boil variant 0..2 (already in R); the saucer's lights blink with it.
// Hint fields (for ART-BODY): root: 'centre' = a 'head' gear rooted at the head CENTRE (not the top-front; sprites-mine.js
// headRoot reads it); acts = the u.b.act codes (sim/maker/lib.js ACT) that should show pose 'atk'; air = 'atk' while
// airborne (u.z > 1); hidesHat = it sits where the hat is (draw the hat first or skip it).
//
// | id       | at     | look (idle -> atk)                                                            | atk when               |
// |----------|--------|-------------------------------------------------------------------------------|------------------------|
// | fly      | back   | dragon bat wings in the unit colour darkened, orange ribs: folded -> spread up | airborne, DIVE         |
// | grabdrop | back   | ptero leathery red-brown wings: up -> spread in a V                            | CARRY, DIVE            |
// | firedive | back   | phoenix flame-feather wings: out -> swept back with flames                     | DIVE                   |
// | swim     | back   | shark-grey dorsal fin, tip in the unit colour                                  | -                      |
// | burrow   | back   | a shovel strapped on the back, dirt on the blade                               | -                      |
// | lowgrav  | head * | glass fishbowl helmet round the head, collar in the unit colour                | -                      |
// | beam     | feet   | a little silver saucer to stand on: lights blink -> beam on (hatch glows)      | CHANNEL (beaming)      |
// | skates   | feet   | a pair of ice skates under the feet (far one darker)                          | -                      |
// | lasso    | hand2  | a coil of rope: coiled -> rope paid out forward                                | THROW, GRAB (rope out) |
// | bomb     | back   | a black bomb strapped on: small fuse spark -> fuse fizzing, red alarm glow     | CHARGE (running at it) |
// | magnet   | back   | horseshoe magnet in the unit colour, steel tips: on the back -> raised, crackle | CHANNEL, GRAB          |
// | mind     | head * | the mind alien's pink brain under a glass dome: -> glowing, psychic rings      | CHANNEL                |
// | grabfour | back   | four purple octopus tentacles: curled behind -> reaching forward               | GRAB                   |
// | drink    | mouth  | mosquito needle: short -> long, blood going up it                              | DRINK                  |
// | rally    | back   | a flag in the unit colour on a pole: -> waving, lifted                         | ROAR (the shout)       |
// | heal     | back   | a white pack with a red heart: -> little hearts float up                       | CHANNEL (healing)      |
// | dome     | back   | the shield bot's emitter (steel box, stalk, cyan ball): -> ball glows, rays    | while the dome is up   |
// | bees     | back   | a little honey hive, one bee: -> three bees out                               | while bees come out    |
// | crows    | back   | a black crow perched: wings folded -> wings up                                 | ROAR (the call)        |
// | armour   | back   | the ankylo's knobby brown plates with cream spikes                             | -                      |
// | shield   | hand2  | the shield wall's tower shield, face in the unit colour: -> braced, spikes down| SHELL (braced)         |
// | shell    | back   | turtle shell on the back -> CLOSED: a big shell dome over the (crouched) body, | SHELL                  |
// |          |        | two eyes peeking out of the front: draw atk over everything                   |                        |
// | spikes   | back   | puffer spikes: a short row on the back -> a ring of long spikes all round      | PUFF                   |
// (* root: 'centre': rooted at the head centre.) All 'back' gear is drawn in front of the body unless `behind: true`.
// NO GEAR (pose / sim / fx only, nothing worn): ghost (the body's ghost look), fireproof, heavy, lavatrail, sneak,
// pounce, charge, tackle, blink, roar, throw, slide, stomp, sit, swallow, ink, stink, shock, curse, smoke, scare, raise,
// dodge, split, rebirth.
//
// ---- ICON[id](ctx, w, h): the picker emblem for all 48, painted into (0, 0)-(w, h) of ctx's current transform, no
// background (the card is the UI's), no letters. Baked once per id x device pixel size (cached), then drawImage'd.
import { GEAR, ICON } from './mine-hooks.js';
import { C, TAU, lerp, tone, brush, ring, poly, part, fill, outline, shift, dab, tube, spark, spline, rng, hash, M0, tooth, canvas } from './paint.js';
import { flameLick } from './people.js';

const T = {
  iconU: 28,          // icon paint space: units across the shorter side (emblems are painted in -14..14)
  iconTooth: 0.3,     // paper tooth on icons (specks per unit²)
  iconCacheMax: 400,  // baked icon canvases kept (id x pixel size) before the cache is emptied
  shellS: 0.6,        // turtle shell on an upright back: turtle-sprite px -> gear px
  hiveS: 0.52,        // the beehive on a back: hive-sprite px -> gear px
  crowS: 0.72,        // the perched crow: crow-sprite px -> gear px
  wingFold: 0.76,     // dragon wing folded: dragon px -> gear px
  wingUp: 0.66,       // dragon wing spread up: dragon px -> gear px
  pteS: 0.84,         // ptero wing: ptero px -> gear px
  phxS: 0.74,         // phoenix wing: phoenix px -> gear px
  saucerS: 0.55,      // UFO hull -> the little saucer under the feet
};
// u.b.act codes from sim/maker/lib.js ACT (copied: the art never imports the sim)
const A = { THROW: 5, CHARGE: 21, ROAR: 23, CARRY: 24, CHANNEL: 27, SHELL: 28, PUFF: 29, DIVE: 31, DRINK: 34, GRAB: 39 };

// ---------------------------------------------------------------- colours (each from its source unit's sprite module)
const K = {
  pteW: '#cf6243', pteD: '#8f3a26', pteB: '#6d2a1c',                                          // sprites-dinos ptero
  pxRed: '#e8341c', pxRedD: '#b42410', pxOr: '#ff8f1f', pxGold: '#ffc52e', pxYel: '#ffe44a',   // sprites-secret phoenix
  shark: '#7d8ea5', sharkD: '#566579',                                                         // sprites-ocean shark
  glass: '#bfe9ff', glassL: '#5aa6d6', silver: '#c4cad4', silverD: '#7f8796', gun: '#555b66',  // sprites-space
  pink: '#ff83c3', pinkD: '#cf4a8c', pinkL: '#ffc3e0', sparkY: '#fff36b',                      // mind alien brain
  skate: '#2e2a33', blade: '#d8dee4',                                                           // sprites-sports hockey
  rope: '#d9b878', ropeD: '#a8844a',                                                            // sprites-secret cowboy
  bomb: '#2b2730', steel: '#b7bfc7', steelL: '#d8dee4', steelD: '#949da7', dark: '#666b75', cyan: '#7fe6ff', haz: '#ff8a12', // robots
  oct: '#9b4fc8', octD: '#6f2f98', suck: '#f3d6f5',                                            // sprites-ocean octopus
  mos: '#5e646e', mosL: '#8a909a', blood: '#e0262a',                                           // sprites-bugs mosquito
  gold: '#e8a628', goldD: '#b8721a', goldL: '#ffd36a', hole: '#3a2412', bee: '#ffd51e', beeW: '#eef8ff', // beehive + bee
  crow: '#2e2a35', crowW: '#38333f', crowD: '#221f28', crowT: '#141217', crowB: '#6a6a74', crowS: '#4d4860', // crow
  ank: '#9b6b3e', ankD: '#5c3a20', knob: '#d2a56a', spike: '#f6ead0',                          // sprites-dinos ankylo
  wood: C.brown, woodL: C.brownL, iron: '#626771',                                              // sprites-siege shield
  shell: '#8a5a2a', plate: '#b07a3a', rim: '#d9a84a', belly: '#f2dc9a', turt: '#6fbf4c',       // sprites-ocean turtle
  puff: '#ffd23a', puffS: '#fff3cc', puffSp: '#a8642a',                                        // sprites-ocean puffer
  dirt: '#7a5030', dirtL: '#a0703f',
};

// ---------------------------------------------------------------- helpers
function lk(o) {
  const burnt = o.dead === 'burnt';
  return {
    o, R: o.R, M: o.M, burnt, dead: !!o.dead, atk: o.pose === 'atk', flat: o.body === 'animal' || o.body === 'beast',
    col: burnt ? C.charL : (o.col || C.red), cl: (x) => (burnt ? C.char : x), acc: (x) => (burnt ? C.charL : x),
  };
}
const sm = (L, k = 0.5, lw = 1) => ({ R: L.R, mx: L.M.mx * k, my: L.M.my * k, grow: L.M.grow * k, lw });
function rotP(P, a, cx = 0, cy = 0) { const cs = Math.cos(a), sn = Math.sin(a); return P.map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]); }
const scaleP = (P, s, dx = 0, dy = 0) => P.map(([x, y]) => [x * s + dx, y * s + dy]);
function about(c, x, y, a, fn) { c.save(); c.translate(x, y); if (a) c.rotate(a); c.translate(-x, -y); fn(); c.restore(); }
function oval(cx, cy, rx, ry, rot, R, irr = 0.05, n = 9) { return rotP(ring(cx, cy, rx, ry, R, irr, n), rot, cx, cy); }
const ink = (c, P, w, R) => brush(c, P, w, C.ink, R, { bristles: 2, taper: 0.35, dry: 0.15, vary: 0.06 });
function sub(pts, step = 2.6) {   // more points along a polygon's edges: a wobblier hand-painted outline (sprites-siege sub)
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
function flameAt(c, x, y, ang, s, R) { c.save(); c.translate(x, y); c.rotate(ang); flameLick(c, 0, 0, s, R); c.restore(); }
function xEye(c, x, y, s, R, w = 0.7) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, C.ink, R, { bristles: 2, dry: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, C.ink, R, { bristles: 2, dry: 0 });
}
function eyeDot(c, x, y, r, R, dead) { if (dead) { xEye(c, x, y, r * 0.8, R, Math.max(0.5, r * 0.4)); return; } dab(c, x, y, r, C.white, R); dab(c, x + r * 0.3, y + r * 0.05, r * 0.55, C.ink, R); outline(c, ring(x, y, r, r, R, 0.04, 8), R, Math.max(0.45, r * 0.22), { jit: 0.06, bristles: 2 }); }
function pointAt(P, t) {   // a point + its normal along a polyline (for suckers, beads)
  const S = spline(P, false, 7), i = Math.max(1, Math.min(S.length - 2, Math.round(t * (S.length - 1))));
  const a = S[i - 1], b = S[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [S[i][0], S[i][1], -dy / l, dx / l];
}
function heart(c, L, x, y, s, col = C.red) {
  const P = [[x, y + s * 1.15], [x - s * 1.25, y - s * 0.05], [x - s * 1.2, y - s * 0.8], [x - s * 0.6, y - s * 1.2], [x, y - s * 0.65], [x + s * 0.6, y - s * 1.2], [x + s * 1.2, y - s * 0.8], [x + s * 1.25, y - s * 0.05]];
  const lw = Math.min(1.7, Math.max(0.7, 0.5 * s));
  part(c, poly(P, L.R, 0.05 * s), L.acc(col), sm(L, 0.35, lw), { lw });
  if (!L.burnt) dab(c, x - s * 0.55, y - s * 0.55, s * 0.24, C.white, L.R);
}

// ================================================================ FLY: the dragon's bat wings (sprites-myth dragonWing)
// membrane = the unit colour darkened (as the dragon's tone(col, -0.28)), orange finger ribs; the far wing darker, inked.
// A bat wing (the dragon's three-finger wing, sprites-myth dragonWing): the arm from the shoulder (root) to the wrist, three
// fingers fanning from the wrist, the membrane in shallow scallops between the finger tips and back down to the body.
const BAT = {
  fold: { w: [-4, -9.4], f: [[-1.2, -17.4], [-8.8, -16.6], [-13, -7.6]], back: [-6.8, 1.2] },
  up: { w: [-3, -14.4], f: [[2.6, -26.6], [-11, -25.6], [-19.6, -12.6]], back: [-8.4, 1.4] },
};
function scallop(out, A, B, W, k) {   // a concave arc from A to B, its middle pulled toward the wrist W
  const Q = [lerp((A[0] + B[0]) / 2, W[0], k), lerp((A[1] + B[1]) / 2, W[1], k)];
  for (const t of [0.2, 0.4, 0.6, 0.8]) { const u = 1 - t; out.push([u * u * A[0] + 2 * u * t * Q[0] + t * t * B[0], u * u * A[1] + 2 * u * t * Q[1] + t * t * B[1]]); }
  out.push(B);
}
function batWing(c, L, up, far) {
  const R = L.R, M = L.M, G = BAT[up ? 'up' : 'fold'], dx = far ? 2.6 : 0, dy = far ? -1.3 : 0, mv = ([x, y]) => [x + dx, y + dy];
  const W = mv(G.w), F = G.f.map(mv), B = mv(G.back);
  const pts = [mv([2.6, 0.6]), mv([1.2, -5]), [lerp(W[0], F[0][0], 0.3) + 1, lerp(W[1], F[0][1], 0.3)], F[0]];
  scallop(pts, F[0], F[1], W, 0.42); scallop(pts, F[1], F[2], W, 0.42); scallop(pts, F[2], B, W, 0.32);
  pts.push(mv([-2.6, 1.4]));
  const P = poly(pts, R, 0.1);
  const col = L.burnt ? (far ? C.char : C.charL) : tone(L.col, far ? -0.45 : -0.28);
  fill(c, shift(P, M.mx, M.my, 0.4), col, R, { sharp: true, vary: 0.12 });
  for (const tp of F) brush(c, [W, [lerp(W[0], tp[0], 0.5) + 0.4, lerp(W[1], tp[1], 0.5) - 0.6], tp], 1.0, far ? C.ink : L.acc(C.orange), R, { bristles: 2, taper: 0.55, dry: 0.15 });
  brush(c, [mv([0.8, -0.4]), mv([0.6, -6]), W], 1.6, far ? C.ink : L.acc(tone(L.col, -0.5)), R, { bristles: 2, taper: 0.2, dry: 0.1 });   // the arm
  outline(c, P, R, 1.3, { jit: 0.2 });
  brush(c, [W, [W[0] + 1.5, W[1] - 1.3], [W[0] + 2.4, W[1] - 0.6]], 0.65, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });   // thumb claw
}
GEAR.fly = {
  at: 'back', behind: true, box: [30, 33, 23, 30], air: true, acts: [A.DIVE],
  paint(c, o) { const L = lk(o); batWing(c, L, L.atk, true); batWing(c, L, L.atk, false); },
};

// ================================================================ GRABDROP: the ptero's leathery wings (sprites-dinos pteWing)
const PTE = [[0.6, 0.2], [-0.6, -7], [-5.4, -15.6], [-14, -23.8], [-12.6, -18.6], [-12.4, -13.8], [-13.6, -9.2], [-13.6, -4.4], [-10.4, -0.4], [-6, 1.8], [-2.6, 1.6]];
const PTE_BONE = [[0, 0], [-0.6, -7], [-5.4, -15.6], [-13.4, -23.2]];
function pteWing(c, L, far, a) {
  const R = L.R, dx = far ? 2.2 : 0, dy = far ? -0.7 : 0, tf = (P) => rotP(scaleP(P, T.pteS), a).map(([x, y]) => [x + dx, y + dy]);
  part(c, poly(sub(tf(PTE), 1.5), R, 0.12), L.cl(far ? K.pteD : K.pteW), L.M, { lw: 1.3 });
  brush(c, tf(PTE_BONE), 1.35, far ? C.ink : L.acc(K.pteB), R, { bristles: 2, taper: 0.6, dry: 0.1 });   // the long finger bone
  if (!far && !L.burnt) for (const P of [[[-3.6, -9.4], [-12.4, -12]], [[-2.4, -3.8], [-11.6, -3.4]]]) brush(c, tf(P), 0.55, tone(K.pteW, -0.32), R, { bristles: 1, dry: 0.4, taper: 0.6 });
  const [wx, wy] = tf([[-0.6, -7]])[0];
  for (let i = 0; i < 3; i++) brush(c, [[wx, wy - i * 0.4], [wx + 1.1, wy - i * 0.6 + 0.4]], 0.45, C.ink, R, { bristles: 1, dry: 0 });   // wrist claws
}
GEAR.grabdrop = {
  at: 'back', behind: true, box: [28, 30, 21, 25], air: true, acts: [A.CARRY, A.DIVE],
  paint(c, o) { const L = lk(o); pteWing(c, L, true, L.atk ? 0.32 : 0.06); pteWing(c, L, false, L.atk ? -0.45 : 0); },
};

// ================================================================ FIREDIVE: the phoenix's flame-feather wings (sprites-secret phxWing)
const PF = [[[-3, -1.9], [-15, -2.5]], [[-6, -4.7], [-19.4, -8.5]], [[-9, -7.3], [-22.4, -14.5]], [[-12, -9.7], [-23.4, -20.9]], [[-14.6, -11.5], [-21, -25.5]]];
const PARM = [[2.4, 0.9], [-0.6, -4.1], [-5.6, -9.1], [-12, -12.3], [-16, -12.1], [-10, -7.5], [-5, -2.7], [-2, 1.3]];
function phxWing(c, L, far, a, fire) {
  const R = L.R, s = T.phxS;
  c.save(); if (far) c.translate(1.6, -1.2); c.rotate(a); c.scale(s, s);
  for (let i = PF.length - 1; i >= 0; i--) {
    const [r0, t] = PF[i], m = [lerp(r0[0], t[0], 0.55), lerp(r0[1], t[1], 0.55) - 1];
    brush(c, [r0, m, t], 4.4, L.cl(far ? K.pxRedD : K.pxOr), R, { bristles: 5, taper: 0.85, dry: 0.25, vary: 0.08 });
    if (!L.burnt) brush(c, [m, t], 1.9, far ? K.pxOr : K.pxYel, R, { bristles: 3, taper: 0.8, dry: 0.3 });
    ink(c, [[r0[0] + 0.8, r0[1] - 1.6], [m[0] + 0.6, m[1] - 1.8], t], 0.8, R);
    if (fire && !far && !L.burnt && i % 2 === 0) flameAt(c, t[0], t[1], Math.atan2(t[1] - m[1], t[0] - m[0]), 1.5, R);
  }
  part(c, poly(PARM, R, 0.15), L.cl(far ? K.pxRedD : K.pxRed), sm(L, 0.5, 1.6), { lw: 1.6 });
  if (!L.burnt) brush(c, [[0.6, -1.1], [-4.4, -6.9], [-11, -10.9]], 1.3, far ? K.pxOr : K.pxYel, R, { bristles: 2, dry: 0.4, taper: 0.5 });
  c.restore();
}
GEAR.firedive = {
  at: 'back', behind: true, box: [32, 28, 25, 23], air: true, acts: [A.DIVE],
  paint(c, o) { const L = lk(o); phxWing(c, L, true, L.atk ? -0.55 : 0, L.atk); phxWing(c, L, false, L.atk ? -0.5 : 0.08, L.atk); },
};

// ================================================================ SWIM: a shark's dorsal fin (sprites-ocean shark), its tip in the unit colour
const FIN = [[3.4, 2], [1.6, -3.2], [-1.2, -8.4], [-5.4, -12.8], [-5.8, -7.6], [-7, -2.8], [-9.6, 1.8]];
GEAR.swim = {
  at: 'back', behind: true, box: [16, 17, 11.5, 14.5],
  paint(c, o) {
    const L = lk(o), R = L.R;
    part(c, poly(sub(FIN, 2), R, 0.12), L.cl(K.shark), L.M, { lw: 1.4, sharp: true });
    if (!L.burnt) brush(c, [[1.4, 0.6], [-1, -4.2], [-3.8, -8.6]], 0.85, K.sharkD, R, { bristles: 2, dry: 0.4, taper: 0.5 });
    part(c, poly([[-1.6, -8.2], [-3.4, -10.6], [-5.4, -12.8], [-5.8, -7.6], [-6.2, -6.2]], R, 0.08), L.col, sm(L, 0.25, 0.9), { lw: 0.9, sharp: true });   // the tip (unit colour)
    if (!L.burnt) brush(c, [[-1.4, -7.8], [-3.8, -6.8], [-6.2, -5.8]], 0.6, C.white, R, { bristles: 1, dry: 0.15, taper: 0.2 });
  },
};

// ================================================================ BURROW: a shovel strapped on the back (blade up, dirt on it)
function shovel(c, L, big = 1) {
  const R = L.R, M = L.M;
  tube(c, [[0, 7.4], [0.1, -1], [0, -9.4]], 1.3 * big, L.cl(C.brownL), R, 0.65);
  const G = ring(0, 9, 1.9, 1.5, R, 0.06, 8); G.push(G[0]);
  brush(c, G, 1.5, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); brush(c, G, 0.7, L.acc(C.brownL), R, { bristles: 2, dry: 0, taper: 0 });   // D-grip
  part(c, poly(sub([[-2.9, -9], [2.9, -9], [3.1, -13.8], [0, -18.2], [-3.1, -13.8]], 2), R, 0.12), L.cl(C.greyL), M, { lw: 1.3 });
  if (!L.burnt) {
    brush(c, [[-1.6, -10.4], [-1.9, -14.2]], 0.7, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 });
    for (const [x, y, r] of [[1.2, -15.8, 1.1], [-0.6, -16.9, 0.8], [2.2, -12.8, 0.7], [0.4, -13.6, 0.55]]) dab(c, x, y, r, K.dirt, R);
  }
  brush(c, [[-2.8, -9.1], [2.8, -9.1]], 1.15, C.ink, R, { bristles: 2, dry: 0 });   // the socket
}
GEAR.burrow = {
  at: 'back', behind: true, box: [17, 31, 11, 21],
  paint(c, o) { const L = lk(o); about(c, 0, 0, -0.42, () => shovel(c, L)); },
};

// ================================================================ LOWGRAV: a glass fishbowl helmet (root 'centre': the head centre)
function fishbowl(c, L) {
  const R = L.R, P = ring(0.3, -0.9, 8.3, 8.1, R, 0.03, 12);
  c.save(); c.globalAlpha = L.burnt ? 0.45 : 0.3; fill(c, P, L.burnt ? C.char : K.glass, R, { edge: 0, vary: 0.05 }); c.restore();
  const I = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.15 + 0.7 * k / 8); I.push([0.3 + Math.cos(a) * 7.1, -0.9 + Math.sin(a) * 6.9]); }
  brush(c, I, 0.7, L.burnt ? C.ink : K.glassL, R, { bristles: 2, dry: 0.3, taper: 0.2 });   // the glass rim seen through it
  outline(c, P, R, 1.25, { jit: 0.2 });
  brush(c, [[-6.6, 5.6], [0.4, 7.0], [7.2, 5.6]], 2.5, L.col, R, { bristles: 3, dry: 0.08, taper: 0 });   // collar (the astronaut's helmet ring)
  brush(c, [[-6.2, 4.3], [0.4, 5.4], [6.8, 4.3]], 0.8, L.acc(K.silver), R, { bristles: 2, dry: 0.1, taper: 0 });
  if (L.dead) { ink(c, [[2.4, -8.6], [3.6, -5.4], [2.2, -3.4], [4, -0.6]], 0.55, R); ink(c, [[3.6, -5.4], [6.8, -4.6]], 0.5, R); }
  else if (!L.burnt) { brush(c, [[-6, -2.8], [-5, -5.8], [-2.4, -7.6]], 1.05, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 }); dab(c, 4.8, -5.6, 0.7, C.white, R); }
}
GEAR.lowgrav = {
  at: 'head', root: 'centre', hidesHat: true, box: [21, 21, 10.5, 10.6],
  paint(c, o) { fishbowl(c, lk(o)); },
};

// ================================================================ BEAM: a little UFO saucer to stand on (sprites-space hull)
const HULL = [[-21.4, -8], [-17, -11], [-11, -12.8], [0, -13.4], [11, -12.8], [17, -11], [21.4, -8], [18, -5.2], [10, -3.4], [0, -2.8], [-10, -3.4], [-18, -5.2]];
const LIGHTS = [[-16.4, -7.4], [-8.4, -6.6], [0, -6.4], [8.4, -6.6], [16.4, -7.4]];
const LCOL = [C.yellow, '#ff4a3a', '#5dff5a', '#ff4a3a', C.yellow];
function saucer(c, L, on) {
  const R = L.R, M = L.M, k = T.saucerS, S = (P) => P.map(([x, y]) => [x * k, (y + 13.4) * k]);
  if (on && !L.burnt && !L.dead) {   // beam on: a short pale cone under the hatch (the A-MOVE fx draws the real beam)
    c.save(); c.globalAlpha = 0.45; fill(c, [[-2.6, 6.6], [2.6, 6.6], [6.4, 11.4], [-6.4, 11.4]], '#fff3a6', R, { sharp: true, edge: 0 }); c.restore();
  }
  part(c, poly(S([[-5.6, -3.6], [5.6, -3.6], [3.8, -0.4], [-3.8, -0.4]]), R, 0.1), L.cl(K.gun), sm(L, 0.4, 0.9), { lw: 0.9, sharp: true });   // hatch
  part(c, poly(S(HULL), R, 0.18), L.cl(K.silver), M, { lw: 1.35, ang: 0.08 });
  brush(c, S([[-21, -8.1], [-10, -7.2], [0, -7], [10, -7.2], [21, -8.1]]), 1.1, L.cl(K.silverD), R, { bristles: 3, dry: 0.1, taper: 0.05 });   // rim
  brush(c, S([[-10.6, -12.6], [0, -13.1], [10.6, -12.6]]), 1.3, L.col, R, { bristles: 3, dry: 0.08, taper: 0 });   // top stripe (unit colour)
  if (!L.burnt) brush(c, S([[-15.6, -10.2], [-8, -11.6]]), 0.6, C.white, R, { bristles: 2, dry: 0.4, taper: 0.5 });
  const lit = on ? 31 : (L.o.v & 1 ? 10 : 21);
  for (let i = 0; i < LIGHTS.length; i++) {
    const [x, y] = S([LIGHTS[i]])[0], l = (lit >> i) & 1 && !L.burnt && !L.dead;
    part(c, ring(x, y, 1.05, 0.95, R, 0.1, 7), l ? LCOL[i] : L.cl(tone(LCOL[i], -0.55)), sm(L, 0.2, 0.6), { lw: 0.6 });
  }
  if (on && !L.burnt && !L.dead) { dab(c, 0, 6.4, 2.4, tone(C.yellow, 0.5), R); dab(c, 0, 6.4, 1.3, C.white, R); }
}
GEAR.beam = {
  at: 'feet', box: [26, 15, 13, 3], acts: [A.CHANNEL, A.CARRY],
  paint(c, o) { const L = lk(o); saucer(c, L, L.atk); },
};

// ================================================================ SKATES: a pair of ice skates (sprites-sports skateUnder, bolder)
// placed once under the feet: the near skate ahead, the far one behind (darker), both flat on the ground
function skate(c, L, far) {
  const R = L.R;
  part(c, ring(0.4, -1.1, 3.2, 1.9, R, 0.1, 8), L.cl(far ? tone(K.skate, -0.3) : K.skate), L.M, { lw: 0.95 });
  if (!L.burnt && !far) brush(c, [[-1.6, -2.1], [0.2, -2.5], [1.8, -2.3]], 0.5, C.white, R, { bristles: 1, dry: 0.2, taper: 0 });   // laces
  for (const x of [-1.6, 2.2]) brush(c, [[x, 0.4], [x, 1.2]], 0.55, C.ink, R, { bristles: 1, dry: 0 });
  tube(c, [[-2.9, 1.5], [3.8, 1.5]], 0.65, L.acc(far ? K.steelD : K.blade), R, 0.45);
  brush(c, [[3.6, 1.6], [4.7, 0.5]], 0.65, C.ink, R, { bristles: 1, dry: 0, taper: 0 });   // the curled toe
}
GEAR.skates = {
  at: 'feet', box: [15, 7, 6.5, 4],
  paint(c, o) { const L = lk(o); c.save(); c.translate(-2.4, -0.3); skate(c, L, true); c.restore(); c.save(); c.translate(3, 0); skate(c, L, false); c.restore(); },
};

// ================================================================ LASSO: a coil of rope in the off hand (sprites-secret cowboy rope)
function rope(c, L, P, w = 0.85) { brush(c, P, w + 0.9, C.ink, L.R, { bristles: 2, dry: 0.05, taper: 0 }); brush(c, P, w, L.acc(K.rope), L.R, { bristles: 2, dry: 0.1, taper: 0 }); }
function coil(c, L, n, x = 0, y = 0, s = 1) {
  for (let i = 0; i < n; i++) { const P = ring(x + (0.4 + i * 0.35) * s, y + (3.1 + i * 0.75) * s, (3.3 - i * 0.25) * s, 2.5 * s, L.R, 0.08, 8); P.push(P[0]); rope(c, L, P, 0.75 * s); }
}
GEAR.lasso = {
  at: 'hand2', box: [16, 14, 5, 3.5], acts: [A.THROW, A.GRAB],
  paint(c, o) {
    const L = lk(o);
    coil(c, L, L.atk ? 2 : 3);
    rope(c, L, [[2.6, 4.8], [3.4, 6.8], [2.8, 8.6]], 0.7);   // the tail end hanging
    if (L.atk) rope(c, L, [[1.8, 0.9], [5.6, -0.5], [10.6, -0.7]], 0.75);   // paid out toward the loop
  },
};

// ================================================================ BOMB (self-destruct): a black bomb strapped on the back
function bombBall(c, L, x, y, r, lit) {
  const R = L.R;
  part(c, ring(x, y, r, r * 0.97, R, 0.05, 9), L.cl(K.bomb), L.M, { lw: 1.2 });
  if (!L.burnt) dab(c, x - r * 0.38, y - r * 0.4, r * 0.24, '#7b7b80', R);
  part(c, poly([[x - r * 0.25, y - r * 1.17], [x + r * 0.32, y - r * 1.2], [x + r * 0.36, y - r * 0.86], [x - r * 0.3, y - r * 0.84]], R, 0.06), L.cl(C.greyD), sm(L, 0.3, 0.8), { lw: 0.8, sharp: true });
  brush(c, [[x + r * 0.05, y - r * 1.2], [x + r * 0.2, y - r * 1.65], [x + r * 0.62, y - r * 1.95]], 0.7, L.acc(C.brown), R, { bristles: 2, dry: 0 });   // fuse
  if (!L.burnt && !L.dead) spark(c, x + r * 0.72, y - r * 2.05, lit ? r * 0.85 : r * 0.5, R);
}
GEAR.bomb = {
  at: 'back', box: [16, 18, 9, 9], acts: [A.CHARGE],
  paint(c, o) {
    const L = lk(o), R = L.R, x = L.flat ? 0 : -2.8, y = L.flat ? -2.6 : 3.6;
    brush(c, L.flat ? [[-1, 0.8], [0, 1.6], [1, 4.4]] : [[-4.2, 0.6], [0, 1.4], [3.4, 2.8]], 1.2, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });   // the strap
    if (L.atk && !L.burnt && !L.dead) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; brush(c, [[x + Math.cos(a) * 5, y + Math.sin(a) * 5], [x + Math.cos(a) * 6.8, y + Math.sin(a) * 6.8]], 0.8, '#ff4a3a', R, { bristles: 2, dry: 0.2, taper: 0.6 }); }   // alarm glow
    bombBall(c, L, x, y, 4, L.atk);
    if (!L.flat) brush(c, [[-6.4, 3.8], [-2.8, 4.6], [1.6, 4.4]], 0.9, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });
  },
};

// ================================================================ MAGNET: the magnet bot's horseshoe (sprites-robots magnet), unit colour, steel tips
function magnet(c, L, x, y, ang, crackle, s = 1) {
  const R = L.R;
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  const pts = [[7.2, -3.7], [2.4, -3.7], [-1.4, -2.9], [-3.7, 0], [-1.4, 2.9], [2.4, 3.7], [7.2, 3.7]];
  tube(c, pts, 3.3, L.col, R, 0.8);
  for (const sg of [-1, 1]) tube(c, [[5.2, sg * 3.7], [7.8, sg * 3.7]], 3.3, L.acc(K.steelL), R, 0.8);
  if (!L.burnt) brush(c, [[-2.2, -1.4], [-1.2, -2.6], [1.6, -3.2]], 0.6, '#ffffff', R, { bristles: 1, dry: 0.2, taper: 0.5 });
  if (crackle && !L.dead && !L.burnt) {
    const Z = []; for (let i = 0; i <= 4; i++) Z.push([8.8 + (i & 1 ? 1.1 : -0.4), -3.4 + i * 1.7]);
    brush(c, Z, 0.7, K.sparkY, R, { bristles: 2, dry: 0, taper: 0 }); spark(c, 9.8, -4, 1.5, R); spark(c, 9.4, 4.2, 1.1, R);
  }
  c.restore();
}
GEAR.magnet = {
  at: 'back', behind: true, box: [20, 26, 10, 20], acts: [A.CHANNEL, A.GRAB],
  paint(c, o) { const L = lk(o); if (L.atk) magnet(c, L, -0.8, -10, -Math.PI / 2 + 0.55, true); else magnet(c, L, -1.6, -5.4, -Math.PI / 2 + 0.25, false); },
};

// ================================================================ MIND: the mind alien's brain under a glass dome (sprites-space brainHead)
// root 'centre': painted in the mind alien's head frame moved so its head centre (0.5, -22.9) lands on the root.
function brain(c, L, glow) {
  const R = L.R;
  c.save(); c.translate(-0.5, 22.9);
  if (glow && !L.burnt) for (let i = 0; i < 2; i++) {
    const r = 10.8 + i * 2.6, P = []; for (let k = 0; k <= 9; k++) { const a = Math.PI * (1.05 + 0.9 * k / 9); P.push([1 + Math.cos(a) * r, -27.4 + Math.sin(a) * r * 0.86]); }
    brush(c, P, 1.2 - i * 0.3, i ? K.pinkL : K.sparkY, R, { bristles: 2, dry: 0.35, taper: 0.3 });
  }
  const bc = L.burnt ? C.charL : glow ? K.pinkL : K.pink;
  part(c, ring(1, -29.6, 7, 5, R, 0.12, 11), bc, L.M, { lw: 1.3 });
  if (!L.burnt) for (const P of [[[-3.6, -30.6], [-2.4, -32], [-1, -30.8], [0.2, -32.2]], [[1.4, -31.2], [2.8, -32.6], [4.2, -31.4]], [[-4.6, -28], [-3, -27], [-1.6, -28.4]], [[0.4, -28.6], [1.8, -27.4], [3.4, -28.6], [5, -27.6]], [[5.2, -30.4], [6.4, -29.2]]])
    brush(c, P, 0.65, K.pinkD, R, { bristles: 1, dry: 0.15, taper: 0.3 });
  brush(c, [[-6.6, -25.4], [1, -24.4], [8.6, -25.6]], 1.7, L.acc(K.silver), R, { bristles: 3, dry: 0.05, taper: 0 });   // the dome ring
  const D = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 + k / 10); D.push([1 + Math.cos(a) * 8.6, -25.2 + Math.sin(a) * 9.4]); }
  brush(c, D, 0.8, L.burnt ? C.ink : K.glassL, R, { bristles: 2, dry: 0.2, taper: 0.1 });
  if (L.dead) ink(c, [[3, -34], [4, -31], [2.8, -29]], 0.5, R);
  else if (!L.burnt) { brush(c, [[-4.8, -31.6], [-2.6, -34]], 0.85, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 }); dab(c, -0.8, -34.4, 0.5, C.white, R); }
  c.restore();
}
GEAR.mind = {
  at: 'head', root: 'centre', hidesHat: true, box: [28, 19, 13.5, 17], acts: [A.CHANNEL],
  paint(c, o) { const L = lk(o); brain(c, L, L.atk && !L.dead); },
};

// ================================================================ GRABFOUR: four octopus tentacles (sprites-ocean octopus colours)
const TEN = {
  idle: [[[0, -1], [-3, -6.4], [-1.4, -10.4], [1.6, -11.2], [2.6, -9.2]], [[0, 0], [-5, -3], [-9, -1.6], [-10.2, 2], [-8.6, 3.6]],
    [[0, 2], [-5.6, 1.6], [-10.6, 4], [-11.6, 8], [-9.6, 9.4]], [[0, 1], [-3.6, 4.4], [-6.4, 8.4], [-4.6, 11], [-2.6, 10.4]]],
  atk: [[[0, -1], [3, -8.4], [9.6, -11.4], [15, -9.6], [16.4, -7]], [[0, 0], [5, -5], [11.6, -6.4], [17.4, -3.6], [17.4, -1.4]],
    [[0, 2], [6, 1.2], [12.4, 2.4], [17.6, 5.6], [16.4, 7.4]], [[0, 1], [5.4, 5.4], [11, 8.6], [16, 9.4], [16.8, 7.4]]],
};
function tentacle(c, L, P, w, far) {
  const R = L.R;
  brush(c, P, w + 1.5, C.ink, R, { bristles: 3, taper: 0.65, dry: 0.05, vary: 0.05, swell: 0 });
  brush(c, P, w, L.cl(far ? K.octD : K.oct), R, { bristles: 3, taper: 0.72, dry: 0.12, vary: 0.1, swell: 0 });
  if (!L.burnt && !far) for (const t of [0.25, 0.45, 0.65]) { const [x, y, nx, ny] = pointAt(P, t); dab(c, x + nx * w * 0.3, y + ny * w * 0.3, 0.42, K.suck, R); }
}
GEAR.grabfour = {
  at: 'back', behind: true, box: [34, 28, 14, 14], acts: [A.GRAB],
  paint(c, o) { const L = lk(o), S = TEN[L.atk ? 'atk' : 'idle']; S.forEach((P, i) => tentacle(c, L, P, 2.1, i === 0 || i === 3)); },
};

// ================================================================ DRINK: the mosquito's needle (sprites-bugs mosquito colours)
GEAR.drink = {
  at: 'mouth', box: [16, 7, 1.6, 3.4], acts: [A.DRINK],
  paint(c, o) {
    const L = lk(o), R = L.R, len = L.atk ? 12.6 : 9;
    part(c, ring(0.6, 0, 1.55, 1.35, R, 0.1, 7), L.cl(K.mos), L.M, { lw: 0.85 });
    brush(c, [[1.4, 0], [len * 0.5, 0.4], [len, 0.85]], 1.25, C.ink, R, { bristles: 2, taper: 0.6, dry: 0, vary: 0.05 });
    brush(c, [[1.6, -0.05], [len * 0.5, 0.35], [len - 1.2, 0.7]], 0.45, L.acc(K.mosL), R, { bristles: 1, taper: 0.4, dry: 0.1 });
    if (L.atk && !L.burnt && !L.dead) { dab(c, len * 0.55, 0.45, 0.85, K.blood, R); dab(c, len + 0.5, 1.7, 0.95, K.blood, R); }
  },
};

// ================================================================ RALLY: a flag in the unit colour on a pole
function flag(c, L, wave) {
  const R = L.R, M = L.M, w = wave;
  tube(c, [[0, 4.6], [0.1, -8], [0, -21.2]], 0.95, L.cl(C.brown), R, 0.55);
  const P = [[0.2, -21], [-3.6, -21 - w], [-7.4, -20.8 + w * 0.6], [-11.6, -21.2 - w * 0.4], [-10.6, -17.4], [-11.8, -13.6 - w * 0.4], [-7.6, -13.8 + w * 0.6], [-3.8, -14 - w], [0.2, -14]];
  part(c, poly(P, R, 0.1), L.col, M, { lw: 1.25 });
  if (!L.burnt) brush(c, [[-0.4, -17.5], [-3.8, -17.5 - w], [-7.6, -17.3 + w * 0.6], [-10.6, -17.4 - w * 0.4]], 1.1, C.white, R, { bristles: 2, dry: 0.2, taper: 0.2 });
  dab(c, 0, -22, 1.5, C.ink, R); dab(c, -0.1, -22.1, 1.05, L.acc(C.yellow), R);   // the gold knob
}
GEAR.rally = {
  at: 'back', behind: true, box: [20, 32, 15, 27], acts: [A.ROAR],
  paint(c, o) { const L = lk(o); about(c, 0, 2, L.atk ? 0.14 : -0.12, () => flag(c, L, L.atk ? 1.9 : 0.9)); },
};

// ================================================================ HEAL: a white pack with a red heart
GEAR.heal = {
  at: 'back', box: [18, 26, 10, 15], acts: [A.CHANNEL],
  paint(c, o) {
    const L = lk(o), R = L.R, M = L.M;
    if (L.flat) {   // lying on the back like a saddle bag
      part(c, poly(sub([[-5.4, -4.8], [5.2, -5.2], [5.6, 0.8], [-5.6, 1.2]]), R, 0.12), L.cl(C.white), M, { lw: 1.25 });
      brush(c, [[-1.2, 1.2], [-1.4, 4.8]], 1.1, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });
      heart(c, L, 0, -2, 1.9);
    } else {
      brush(c, [[-1.4, -1.6], [2.2, -0.8], [3.8, 1.8]], 1.2, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });   // shoulder strap
      part(c, poly(sub([[-6.6, -1.6], [-1.2, -2.2], [-0.8, 9.4], [-6.2, 9.8]]), R, 0.12), L.cl(C.white), M, { lw: 1.25 });
      heart(c, L, -3.7, 3.8, 1.9);
    }
    if (L.atk && !L.burnt && !L.dead) { heart(c, L, -7.4, -6, 1.2); heart(c, L, -2.6, -9.6, 0.95); heart(c, L, 1.4, -6.4, 0.75); }
  },
};

// ================================================================ DOME: the shield bot's emitter (sprites-robots shieldbot 'top')
function emitter(c, L, glow) {
  const R = L.R, M = L.M, g = glow && !L.dead && !L.burnt;
  part(c, poly(sub([[-6.4, -1.4], [-1.2, -1.8], [-0.8, 7], [-6, 7.2]]), R, 0.1), L.cl(K.steel), M, { lw: 1.15 });
  brush(c, [[-6.2, 4.6], [-1, 4.4]], 1.2, L.acc(K.haz), R, { bristles: 2, dry: 0.15, taper: 0 });
  for (const [x, y] of [[-5, 0.4], [-2.2, 0.2], [-5, 6], [-2, 5.8]]) dab(c, x, y, 0.45, C.ink, R);
  tube(c, [[-3.4, -1.4], [-3.5, -5], [-3.6, -8.8]], 1.0, L.cl(K.steelD), R, 0.5);
  dab(c, -3.6, -9.2, 1.35, L.cl(K.dark), R);
  if (g) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; brush(c, [[-3.7 + Math.cos(a) * 3.4, -11.8 + Math.sin(a) * 3.2], [-3.7 + Math.cos(a) * 5.8, -11.8 + Math.sin(a) * 5.4]], 0.8, i & 1 ? K.cyan : '#e8fdff', R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
  part(c, ring(-3.7, -11.8, 2.5, 2.3, R, 0.05, 8), g ? '#c8f8ff' : L.cl(K.cyan), sm(L, 0.4, 1), { lw: 1 });
  if (!L.burnt) dab(c, -4.5, -12.6, 0.55, C.white, R);
}
GEAR.dome = { at: 'back', box: [17, 27, 10.5, 19], paint(c, o) { const L = lk(o); emitter(c, L, L.atk); } };

// ================================================================ BEES: a little honey hive on the back (sprites-bugs beehive) + bees
const HIVE_RINGS = [[-3.4, 9.2], [-8.4, 9.8], [-13.2, 9.0], [-17.6, 7.2], [-21.4, 4.8], [-24.4, 2.4]];
function hivePts(R, s, x0, y0) {   // sprites-bugs hiveOutline, scaled + moved: a bump per ring
  const Rt = [], Lt = [];
  HIVE_RINGS.forEach(([y, w], i) => {
    const yb = i === 0 ? -0.6 : (HIVE_RINGS[i - 1][0] + y) / 2, wb = i === 0 ? w * 0.9 : Math.min(w, HIVE_RINGS[i - 1][1]) * 0.93;
    Rt.push([wb, yb], [w, y]); Lt.push([-wb, yb], [-w, y]);
  });
  const ty = HIVE_RINGS[HIVE_RINGS.length - 1][0] - 2.2;
  return poly(scaleP(Rt.concat([[0, ty]], Lt.reverse()), s, x0, y0), R, 0.15);
}
function hive(c, L, x0, y0, s) {
  const R = L.R, M = L.M;
  part(c, hivePts(R, s, x0, y0), L.cl(K.gold), M, { lw: 1.3 });
  if (!L.burnt) brush(c, scaleP([[-8.2, -3], [-9, -9], [-7.4, -16], [-4.4, -21.6]], s, x0, y0), 1.6, K.goldD, R, { taper: 0.4, dry: 0.4, bristles: 3 });
  for (let i = 1; i < HIVE_RINGS.length - 1; i++) {
    const y = (HIVE_RINGS[i - 1][0] + HIVE_RINGS[i][0]) / 2, w = Math.min(HIVE_RINGS[i - 1][1], HIVE_RINGS[i][1]) * 0.9;
    brush(c, scaleP([[-w, y], [0, y + 1.3], [w, y]], s, x0, y0), 0.75, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.2 });
  }
  const y = HIVE_RINGS[2][0], w = HIVE_RINGS[2][1] * 0.95;   // the band round the middle ring (unit colour)
  brush(c, scaleP([[-w, y - 0.4], [0, y + 0.9], [w, y - 0.4]], s, x0, y0), 1.5, L.col, R, { bristles: 3, dry: 0.1, taper: 0.1 });
  part(c, ring(x0 + 2.6 * s, y0 - 3.4 * s, 2.7 * s, 1.9 * s, R, 0.1, 8), L.cl(K.hole), sm(L, 0.3, 0.8), { lw: 0.8 });
}
function bee(c, L, x, y, s, a = 0) {   // sprites-bugs bee1, bolder
  const R = L.R;
  if (L.burnt) { dab(c, x, y, 1.2 * s, C.charL, R); return; }
  c.save(); c.translate(x, y); c.rotate(a);
  dab(c, -0.6 * s, -1.7 * s, 1.1 * s, K.beeW, R); dab(c, 0.5 * s, -1.9 * s, 1.0 * s, '#dfeefa', R);
  outline(c, ring(-0.1 * s, -1.8 * s, 1.5 * s, 0.9 * s, R, 0.1, 7), R, Math.min(1.2, 0.45 * s), { jit: 0.05, bristles: 2 });
  const lw = Math.min(1.6, 0.65 * s);
  part(c, ring(0, 0, 1.75 * s, 1.35 * s, R, 0.08, 7), K.bee, { R, mx: 0.2 * s, my: 0.2 * s, grow: 0.1, lw }, { lw });
  brush(c, [[-0.35 * s, -1.2 * s], [-0.45 * s, 1.2 * s]], 0.7 * s, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, 1.15 * s, -0.2 * s, 0.5 * s, C.ink, R);
  brush(c, [[-1.7 * s, 0.1 * s], [-2.6 * s, 0.3 * s]], Math.min(1.4, 0.45 * s), C.ink, R, { bristles: 2, dry: 0, taper: 0.6 });   // stinger
  c.restore();
}
GEAR.bees = {
  at: 'back', box: [24, 27, 15, 17],
  paint(c, o) {
    const L = lk(o), R = L.R, s = T.hiveS, x0 = L.flat ? 0 : -4.6, y0 = L.flat ? 1.4 : 10.4;
    if (!L.flat) brush(c, [[-1.2, 0.2], [2.4, 1.2], [3.6, 3.6]], 1.1, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });   // the strap
    hive(c, L, x0, y0, s);
    if (L.dead) return;
    if (L.atk) {
      for (const [x, y, a] of [[x0 - 7.6, y0 - 15, -0.3], [x0 - 1.4, y0 - 19.4, 0.2], [x0 + 5.4, y0 - 15.8, 0.4]]) {
        if (!L.burnt) brush(c, [[x - 4.2, y + 1.4], [x - 2.2, y + 0.4]], 0.5, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.5 });
        bee(c, L, x, y, 1, a);
      }
    } else bee(c, L, x0 - 7.2, y0 - 13.6, 1, -0.2);
  },
};

// ================================================================ CROWS: a black crow perched on the back (sprites-secret birdBody / birdFold)
function crowBird(c, L, up) {
  const R = L.R, M = sm(L, 0.4, 1.05), s = T.crowS;
  c.save(); c.translate(-2.4, 0); c.scale(s, s);
  const wing = (far) => {   // up: a raised wing (birdWing at a lift), else folded on its side (birdFold)
    const dx = far ? 0.8 : 0, dy = far ? -0.8 : 0, col = L.cl(far ? K.crowD : K.crowW);
    if (up) {
      c.save(); c.translate(1, -8.6); c.rotate(far ? -0.35 : -0.6); c.translate(-1, 8.6); if (far) c.translate(1.3, -0.9);
      part(c, poly([[2.6, -8], [0.8, -10.8], [-2.8, -13.6], [-7.6, -15.8], [-12.2, -16.6], [-8.8, -13.8], [-5, -11], [-1.6, -8.2]], R, 0.12), col, M, { lw: 1.3 });
      for (const [a, b] of [[[-9, -15.2], [-13.6, -17.6]], [[-9.6, -14.4], [-13.8, -15.2]], [[-9.2, -13.8], [-12.8, -12.8]]]) brush(c, [a, b], 0.9, L.acc(K.crowT), R, { bristles: 2, dry: 0.2, taper: 0.7 });
      c.restore();
    } else part(c, poly([[3.4 + dx, -9.4 + dy], [-1 + dx, -10.9 + dy], [-6 + dx, -10.7 + dy], [-11.6 + dx, -8.8 + dy], [-6.4 + dx, -7.2 + dy], [-0.4 + dx, -7.4 + dy]], R, 0.12), col, M, { lw: 1.3 });
  };
  wing(true);
  part(c, poly([[-4.6, -8.8], [-10.8, -9.8], [-10, -7.8], [-11.2, -6.4], [-4.8, -5.6]], R, 0.12), L.cl(K.crowW), M, { lw: 1.2 });   // tail
  for (const x of [-0.8, 1.6]) brush(c, [[x, -4.2], [x - 0.2, 0]], 0.9, L.acc(K.crowB), R, { bristles: 2, dry: 0, taper: 0 });   // legs gripping the shoulder
  part(c, oval(0, -7, 6.6, 3.9, -0.1, R, 0.05, 10), L.cl(K.crow), M, { lw: 1.35 });
  if (!L.burnt) brush(c, [[-4.6, -4.6], [0, -3.6], [4.4, -4.6]], 1.4, K.crowS, R, { bristles: 3, dry: 0.4, taper: 0.5 });
  part(c, ring(5.8, -10.6, 3.3, 3.1, R, 0.06, 8), L.cl(K.crow), M, { lw: 1.3 });
  const bm = sm(L, 0.2, 0.95);
  part(c, poly([[8.2, -11.8], [13.8, -10.6], [8.6, -10.2]], R, 0.08), L.acc(K.crowB), bm, { lw: 0.95, sharp: true });
  part(c, poly([[8.6, -10.2], [12.8, -10.1], [8.4, -9.2]], R, 0.08), L.acc(tone(K.crowB, -0.15)), bm, { lw: 0.95, sharp: true });
  if (L.dead) xEye(c, 6.8, -11.3, 0.8, R, 0.6);
  else if (!L.burnt) { dab(c, 6.9, -11.4, 1.2, '#ece6d2', R); dab(c, 7.2, -11.4, 0.62, C.ink, R); }
  brush(c, [[3.4, -13], [3.1, -10.6], [3.3, -8.4]], 1.6, L.col, R, { bristles: 2, dry: 0.1, taper: 0 });   // a band in the unit colour
  if (!up) wing(false);
  else wing(false);
  c.restore();
}
GEAR.crows = { at: 'back', box: [22, 18, 12.4, 15.5], acts: [A.ROAR], paint(c, o) { const L = lk(o); crowBird(c, L, L.atk && !L.dead); } };

// ================================================================ ARMOUR: the ankylo's knobby plates (sprites-dinos ankLayer)
function armour(c, L) {
  const R = L.R, M = L.M;
  if (L.flat) {   // a knobby saddle along the back, cream spikes down the sides and up the top
    for (let i = 0; i < 5; i++) { const x = -8 + i * 4; part(c, poly([[x - 1.4, 1.4], [x - 0.4 + (i - 2) * 0.4, 5], [x + 1.4, 1.6]], R, 0.1), L.cl(K.spike), sm(L, 0.3, 0.9), { lw: 0.9, sharp: true }); }
    part(c, poly(sub([[-10, 2.6], [-9.4, -1.8], [-5.8, -4.6], [0, -5.6], [5.8, -4.6], [9.4, -1.8], [10, 2.6], [5, 1.8], [0, 1.6], [-5, 1.8]]), R, 0.15), L.cl(K.ank), M, { lw: 1.5 });
    if (!L.burnt) for (let r = 0; r < 2; r++) for (let i = 0; i < 5 - r; i++) { const x = -7.4 + r * 1.9 + i * 3.7, y = -0.4 - r * 2.9 - Math.sin((i + 0.5) / (5 - r) * Math.PI) * 1.2; part(c, ring(x, y, 1.35, 1.05, R, 0.12, 6), K.knob, sm(L, 0.3, 0.75), { lw: 0.75 }); }
    for (const x of [-4.4, 0.4, 5]) part(c, poly([[x - 1.2, -4.6], [x + 0.2, -7.8], [x + 1.3, -4.8]], R, 0.1), L.cl(K.spike), sm(L, 0.3, 0.85), { lw: 0.85, sharp: true });
    return;
  }
  // upright: a knobby slab over the shoulder and down the back, spikes out of the back edge
  for (const [x, y, a] of [[-3.4, 7.6, 3.0], [-4, 3.4, 3.25], [-3.6, -0.6, 3.6], [-1.6, -3.4, 4.1]]) { const ca = Math.cos(a), sa = Math.sin(a);
    part(c, poly([[x - sa * 1.3, y + ca * 1.3], [x + ca * 3.4, y + sa * 3.4], [x + sa * 1.3, y - ca * 1.3]], R, 0.08), L.cl(K.spike), sm(L, 0.3, 0.9), { lw: 0.9, sharp: true }); }
  part(c, poly(sub([[-1.6, 10.4], [-3.8, 5.6], [-4.2, 0.8], [-2.6, -2.6], [1, -4.2], [5.2, -3.8], [8.4, -1.6], [9, 1.4], [5.6, 1.6], [2.6, 2.8], [0.8, 6.2], [0.6, 10.6]]), R, 0.15), L.cl(K.ank), M, { lw: 1.5 });
  if (!L.burnt) for (const [x, y, r] of [[-1.8, 7.4, 1.2], [-2.4, 3.6, 1.3], [-1.8, -0.2, 1.3], [1.4, -1.8, 1.3], [5, -1.4, 1.2], [0.6, 2.4, 1.1], [-0.4, 5.6, 1]]) part(c, ring(x, y, r, r * 0.8, R, 0.12, 6), K.knob, sm(L, 0.3, 0.75), { lw: 0.75 });
  if (!L.burnt) brush(c, [[-2.8, 9.4], [-3.4, 4], [-2.4, -0.8], [1, -2.8]], 0.6, K.ankD, R, { bristles: 1, dry: 0.4, taper: 0.4 });
}
GEAR.armour = { at: 'back', box: [22, 21, 11, 9], paint(c, o) { armour(c, lk(o)); } };

// ================================================================ SHIELD: the shield wall's tower shield (sprites-siege towerShield), held by the boss
const SHIELD = [[-5.5, -7.8], [-4.3, -9.8], [-0.1, -10.7], [4.1, -9.8], [5.3, -7.8], [5.5, 8.4], [4.3, 9.7], [-4.5, 9.7], [-5.7, 8.4]];
function towerShield(c, L, braced) {
  const R = L.R, M = L.M, s = 0.86, S = (P) => scaleP(P, s);
  c.save(); if (braced) { c.translate(1.2, 2.6); c.rotate(0.1); }
  part(c, poly(sub(S(SHIELD), 2.6), R, 0.12), L.col, M, { lw: 1.7, ang: Math.PI / 2 });
  if (!L.burnt) {
    for (const x of [-1.9, 1.9]) brush(c, S([[x, -9], [x + 0.1, 8.6]]), 0.5, tone(L.col, -0.32), R, { bristles: 1, dry: 0.35, taper: 0 });   // plank seams
    brush(c, S([[-4.6, 8], [-4.3, -7.2], [-0.1, -9.6], [4.1, -7.2], [4.5, 8]]), 0.95, K.woodL, R, { bristles: 2, dry: 0.25, taper: 0 });   // wooden rim
  }
  for (const [x, y] of S([[-3.9, -6.8], [3.7, -6.8], [-3.9, 8.2], [3.9, 8.2]])) dab(c, x, y, 0.5, C.ink, R);
  dab(c, 0, 0, 2, C.ink, R); dab(c, 0, 0, 1.4, L.acc(K.iron), R); if (!L.burnt) dab(c, -0.5, -0.5, 0.45, C.white, R);   // iron boss
  if (braced) for (const x of [-2.6, 2.8]) brush(c, [[x, 8.4], [x + 0.3, 10.8]], 0.9, C.ink, R, { bristles: 2, dry: 0, taper: 0.5 });   // spikes into the ground
  c.restore();
}
GEAR.shield = { at: 'hand2', box: [15, 25, 6.5, 10.5], acts: [A.SHELL], paint(c, o) { const L = lk(o); towerShield(c, L, L.atk); } };

// ================================================================ SHELL: the turtle's shell (sprites-ocean turLayer 'r:body' / 'r:peek')
const TUR_SHELL = [[-13.8, -5.4], [-12.4, -11.4], [-6.6, -16.4], [1, -17.6], [7.6, -15.2], [11.6, -10.4], [12.6, -5.4]];
const TUR_PLATES = [[-6, -10.6, 2.6], [0.6, -12.6, 2.8], [6.4, -9.6, 2.3], [-1.4, -7.6, 1.6], [-9.6, -7.6, 1.4]];
function turtleShell(c, L, s, peek) {   // painted in the turtle's own frame (dome up, rim on y -5.4); line widths kept in gear px
  const R = L.R, M = L.M, k = 1 / s;
  fill(c, poly([[-12.4, -5.4], [0, -4.6], [11.4, -5.4], [10.4, -3.4], [0, -2.8], [-11.2, -3.6]], R, 0.1), L.cl(K.belly), R, { edge: 0 });
  part(c, poly(TUR_SHELL, R, 0.2), L.cl(K.shell), { R, mx: M.mx * k, my: M.my * k, grow: M.grow * k, lw: 1.5 * k }, { lw: 1.5 * k });
  if (!L.burnt) for (const [x, y, r] of TUR_PLATES) part(c, ring(x, y, r, r * 0.8, R, 0.12, 6), K.plate, { R, mx: 0.3 * k, my: 0.3 * k, grow: 0.1, lw: 0.8 * k }, { lw: 0.8 * k });
  brush(c, [[-13.6, -5.6], [-6, -5], [3, -5], [12.6, -5.6]], 1.6 * k, L.col, R, { taper: 0.1, dry: 0.15, bristles: 4 });   // the rim (unit colour)
  if (!L.burnt) brush(c, [[-13, -4.2], [0, -3.8], [12, -4.2]], 0.6 * k, C.white, R, { bristles: 2, dry: 0.2, taper: 0 });
  if (peek) {   // closed: two eyes peeking out of the dark front opening
    fill(c, ring(9.6, -7.6, 2.8, 2.4, R, 0.1, 8), '#2a1d12', R, { edge: 0 });
    if (!L.dead && !L.burnt) { dab(c, 9, -8, 0.95, C.white, R); dab(c, 10.8, -7.8, 0.95, C.white, R); dab(c, 9.3, -7.9, 0.45, C.ink, R); dab(c, 11.1, -7.7, 0.45, C.ink, R); }
  }
}
GEAR.shell = {
  at: 'back', box: [33, 28, 15.5, 8.5], acts: [A.SHELL],
  paint(c, o) {
    const L = lk(o);
    c.save();
    if (L.atk) {   // closed: a big dome over the (crouched) body; flat bodies: over the whole back down to the ground
      if (L.flat) { c.translate(0, 11 + 5.4 * 1.05); c.scale(1.05, 1.05); turtleShell(c, L, 1.05, true); }
      else { c.translate(3.6, 17.6 + 5.4 * 1.0); c.scale(0.98, 1.38); turtleShell(c, L, 1.15, true); }
    } else if (L.flat) { c.translate(0, 4.2); c.scale(0.64, 0.64); turtleShell(c, L, 0.64, false); }
    else { c.translate(3.6, 5.8); c.rotate(-Math.PI / 2); c.scale(T.shellS, T.shellS); turtleShell(c, L, T.shellS, false); }
    c.restore();
  },
};

// ================================================================ SPIKES: the puffer's spikes (sprites-ocean pufLayer 'r:ball')
function spike(c, L, x0, y0, a, len, w) {
  const ca = Math.cos(a), sa = Math.sin(a);
  part(c, poly([[x0 - sa * w, y0 + ca * w], [x0 + ca * len, y0 + sa * len], [x0 + sa * w, y0 - ca * w]], L.R, 0.08), L.cl(K.puffS), sm(L, 0.25, 0.9), { lw: 0.9, sharp: true });
}
GEAR.spikes = {
  at: 'back', behind: true, box: [36, 36, 14, 13], acts: [A.PUFF],
  paint(c, o) {
    const L = lk(o);
    if (L.atk) {   // puffed: a ring of long spikes all round the body (their roots hidden behind it)
      const [cx, cy, rx, ry] = L.flat ? [0, 6, 12, 8.6] : [3.6, 5.4, 8.8, 10.6];
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + 0.12; spike(c, L, cx + Math.cos(a) * (rx - 1.6), cy + Math.sin(a) * (ry - 1.6), a, Math.max(rx, ry) * 0.62 + 1.4, 1.5); }
    } else if (L.flat) {
      for (let i = 0; i < 6; i++) { const x = -8.6 + i * 3.5; spike(c, L, x, 1.6, -1.95 + i * 0.07, 4.4, 1.35); }
    } else {
      for (const [x, y, a] of [[2.8, -1.6, -1.6], [0.2, -0.2, -2.1], [-1.6, 2.8, -2.5], [-2.4, 6, -2.9], [-2.4, 9.4, 3.0], [-1.8, 12.4, 2.7]]) spike(c, L, x, y, a, 4.6, 1.35);
    }
  },
};

// ================================================================ ICONS (all 48)
const iconCache = new Map();
function bakeIcon(id, fn, pw, ph) {
  const cv = canvas(pw, ph), c = cv.getContext('2d'), s = Math.min(pw, ph) / T.iconU;
  c.setTransform(s, 0, 0, s, pw / 2, ph / 2);
  const seed = hash('icon|' + id), R = rng(seed), M = M0(R);
  try { fn(c, { R, M, pose: 'atk', col: C.red, dead: false, v: 0, body: 'person' }); } catch (e) { console.warn('ability icon failed', id, e); }
  tooth(c, -pw / 2 / s, -ph / 2 / s, pw / s, ph / s, seed, T.iconTooth);
  return cv;
}
function icon(id, fn) {
  ICON[id] = (ctx, w, h) => {
    const m = ctx.getTransform ? ctx.getTransform() : null, k = m ? Math.max(0.25, Math.hypot(m.a, m.b)) : 1;
    const pw = Math.max(8, Math.round(w * k)), ph = Math.max(8, Math.round(h * k)), key = id + '|' + pw + '|' + ph;
    let cv = iconCache.get(key);
    if (!cv) { if (iconCache.size >= T.iconCacheMax) iconCache.clear(); cv = bakeIcon(id, fn, pw, ph); iconCache.set(key, cv); }
    ctx.drawImage(cv, 0, 0, w, h);
  };
}
/** Paint a gear into the icon at (x, y), scale s (gear px -> icon units). */
function gearIn(c, o, id, pose, x, y, s, extra) { c.save(); c.translate(x, y); c.scale(s, s); GEAR[id].paint(c, Object.assign({}, o, { pose }, extra)); c.restore(); }
function speed(c, R, P, n = 3, gap = 2.4, len = 6, w = 1.1) { for (let i = 0; i < n; i++) brush(c, [[P[0] - len, P[1] + i * gap], [P[0], P[1] + i * gap - 0.2]], w, C.ink, R, { bristles: 2, dry: 0.4, taper: 0.7 }); }
function arcArrow(c, R, P, col = C.ink, w = 1.4, dash = false) {   // a hand-painted arrow along P, head at the end
  const S = spline(P, false, 8);
  if (dash) { for (let i = 0; i + 3 < S.length; i += 6) brush(c, S.slice(i, i + 4), w, col, R, { bristles: 2, dry: 0.1, taper: 0.1 }); } else brush(c, S, w, col, R, { bristles: 3, dry: 0.15, taper: 0.1 });
  const a = S[S.length - 1], b = S[S.length - 4], ang = Math.atan2(a[1] - b[1], a[0] - b[0]), h = w * 2.6;
  fill(c, [[a[0] + Math.cos(ang) * h * 0.6, a[1] + Math.sin(ang) * h * 0.6], [a[0] + Math.cos(ang + 2.4) * h, a[1] + Math.sin(ang + 2.4) * h], [a[0] + Math.cos(ang - 2.4) * h, a[1] + Math.sin(ang - 2.4) * h]], col, R, { sharp: true, edge: 0 });
}
function tinyMan(c, o, x, y, s, a, col = C.blue) {   // a little painted person (head, body, limbs) for the throw / dodge / grab icons
  const R = o.R, M = o.M;
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  for (const P of [[[-1.4, 3.6], [-3, 7], [-2.4, 9.4]], [[1.4, 3.6], [3.4, 6.6], [4.6, 8.8]], [[-2.6, -1.6], [-5.4, -3.4], [-6.6, -6]], [[2.6, -1.6], [5.6, -2.6], [7, -5]]]) brush(c, P, 1.6, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 });
  part(c, ring(0, 0.8, 3.6, 4.2, R, 0.1, 8), col, M, { lw: 1.3 });
  part(c, ring(0.4, -6.4, 3.6, 3.4, R, 0.08, 8), C.skin, M, { lw: 1.3 });
  dab(c, 1.8, -6.8, 0.55, C.ink, R); dab(c, -0.6, -6.8, 0.55, C.ink, R);
  c.restore();
}
function waves(c, R, y, x0, x1, n, col = C.pondL, w = 1.4) {
  for (let j = 0; j < n; j++) { const P = []; for (let x = x0; x <= x1 + 0.01; x += 1.2) P.push([x, y + j * 3.4 + Math.sin((x + j * 2) * 0.9) * 0.9]); brush(c, P, w, col, R, { bristles: 2, dry: 0.25, taper: 0.2 }); }
}
function cloud(c, o, pts, col, lw = 1.3) { for (const [x, y, r] of pts) part(c, ring(x, y, r, r * 0.88, o.R, 0.12, 9), col, o.M, { lw }); }
function flame(c, R, x, y, s, a = -Math.PI / 2) { flameAt(c, x, y, a, s, R); }

// ---- move
icon('fly', (c, o) => {   // a pair of spread bat wings
  const L = lk(o);
  for (const sx of [-1, 1]) { c.save(); c.translate(sx * 0.6, 9.4); c.scale(sx * -0.66, 0.66); batWing(c, L, true, false); c.restore(); }
});
icon('swim', (c, o) => {
  fill(c, poly([[-13, 3], [13, 3], [13, 12], [-13, 12]], o.R, 0.4), C.pond, o.R, { edge: 0 });
  gearIn(c, o, 'swim', 'idle', 0.6, 4.4, 1.55);
  fill(c, poly([[-13, 3.6], [13, 3.6], [13, 12.4], [-13, 12.4]], o.R, 0.3), C.pond, o.R, { edge: 0, vary: 0.08 });
  waves(c, o.R, 3.6, -12.4, 12.4, 3, C.pondL, 1.3);
  outline(c, [[-13.2, 3.4], [13.2, 3.4]], o.R, 1.3, { over: 0, gap: true });
});
icon('burrow', (c, o) => {
  part(c, poly([[-13, 11], [-9.6, 4.6], [-3.6, 1.6], [3, 1.8], [9, 4.8], [13, 11]], o.R, 0.3), K.dirt, o.M, { lw: 1.5 });
  for (const [x, y, r] of [[-5, 6.8, 1.1], [1.6, 4.8, 0.9], [6, 7.6, 1.2], [-1.4, 9, 0.8]]) dab(c, x, y, r, K.dirtL, o.R);
  const L = lk(o); c.save(); c.translate(-1, 6.8); c.rotate(0.5); c.scale(1.15, 1.15); shovel(c, L, 1.1); c.restore();
  for (const [x, y, r] of [[8.4, -6, 1.3], [10.6, -2.4, 1], [6.4, -9.4, 0.8]]) part(c, ring(x, y, r, r, o.R, 0.15, 6), K.dirt, o.M, { lw: 0.9 });
});
icon('ghost', (c, o) => {
  const R = o.R, P = [[-8.6, 10.4], [-9, 0], [-7.4, -7.6], [-2.4, -11.6], [3, -11.6], [7.8, -7.8], [9.4, -0.4], [9.2, 10.4], [6.4, 8.2], [3.4, 11], [0.4, 8.4], [-2.6, 11], [-5.6, 8.4]];
  part(c, poly(P, R, 0.15), C.white, o.M, { lw: 1.7 });
  fill(c, ring(-3, -3.2, 1.7, 2.3, R, 0.08, 8), C.ink, R, { edge: 0 }); fill(c, ring(3.6, -3.2, 1.7, 2.3, R, 0.08, 8), C.ink, R, { edge: 0 });
  fill(c, ring(0.4, 3, 2.1, 2.8, R, 0.1, 8), C.ink, R, { edge: 0 });
  brush(c, [[-6.4, 6.4], [-4.4, 7.2]], 0.7, C.greyL, R, { bristles: 1, dry: 0.3 });
});
icon('lowgrav', (c, o) => {
  const R = o.R, L = lk(o);
  c.save(); c.translate(0, -0.6); c.scale(1.45, 1.45);
  part(c, ring(0.4, 0.4, 5.6, 5.3, R, 0.08, 8), C.skin, o.M, { lw: 1.2 });
  dab(c, 2.6, -0.2, 0.75, C.ink, R); dab(c, -1, 0, 0.75, C.ink, R); brush(c, [[-0.4, 2.8], [0.9, 3.6], [2.2, 2.8]], 0.55, '#c22a1c', R, { bristles: 2, dry: 0 });
  fishbowl(c, L);
  c.restore();
  for (const [x, y, r] of [[10.4, -10.4, 1.9], [-11, -8.6, 1.4], [11.6, 2.4, 1.1]]) spark(c, x, y, r, R);
});
icon('grabdrop', (c, o) => {
  gearIn(c, o, 'grabdrop', 'atk', 3, 2.4, 0.78);
  tinyMan(c, o, 1.4, 8.6, 0.62, 0.5);
  arcArrow(c, o.R, [[10.4, 2], [10.8, 7], [10.4, 12.4]], C.ink, 1.3);
});
icon('beam', (c, o) => {
  const R = o.R;
  c.save(); c.globalAlpha = 0.55; fill(c, [[-3, -3], [3, -3], [10, 13], [-10, 13]], '#fff3a6', R, { sharp: true, edge: 0 }); c.restore();
  outline(c, [[-3, -3], [-10, 13]], R, 0.8, { col: '#e8c21a', over: 0, gap: true }); outline(c, [[3, -3], [10, 13]], R, 0.8, { col: '#e8c21a', over: 0, gap: true });
  tinyMan(c, o, 0.4, 7, 0.55, -0.4);
  c.save(); c.translate(0, -8.6); c.scale(1.5, 1.5);
  const L = lk(o); // the saucer with its glass dome (the full UFO look for the card)
  fill(c, poly([[-5.3, 0.6], [-4.8, -1.6], [-3.2, -3.7], [0, -4.6], [3.2, -3.7], [4.8, -1.6], [5.3, 0.6]], R, 0.1), K.glass, R, { edge: 0 });
  outline(c, poly([[-5.3, 0.6], [-4.8, -1.6], [-3.2, -3.7], [0, -4.6], [3.2, -3.7], [4.8, -1.6], [5.3, 0.6]], R, 0.1), R, 0.9, { gap: true });
  brush(c, [[-3.4, -1.4], [-2.6, -3]], 0.6, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 });
  saucer(c, L, true);
  c.restore();
});
icon('firedive', (c, o) => {
  const R = o.R;
  for (const [col, w] of [[C.fireR, 7], [C.fireO, 4.6], [C.fireY, 2.2]]) brush(c, [[-11, -10], [-3, -2], [4.6, 5.6]], w, col, R, { bristles: 5, taper: -0.4, dry: 0.3, vary: 0.08 });
  flame(c, R, -9.6, -8.6, 2.1, -2.36); flame(c, R, -6, -9.6, 1.5, -2.1); flame(c, R, -10.8, -4.6, 1.5, -2.6);
  dab(c, 7, 8, 3.6, C.fireR, R); dab(c, 7.2, 8.2, 2.4, C.fireO, R); dab(c, 7.4, 8.4, 1.2, C.fireY, R);
  gearIn(c, o, 'firedive', 'idle', 4.6, 3.4, 0.6);
  outline(c, ring(7, 8, 3.8, 3.6, R, 0.1, 8), R, 1.2);
});
// ---- passives
icon('fireproof', (c, o) => {
  const R = o.R;
  flameAt(c, 0.4, 7.4, -Math.PI / 2, 4.4, R);
  const P = ring(0, 0, 11.6, 11.6, R, 0.02, 14); P.push(P[0]);
  brush(c, P, 4.2, C.ink, R, { bristles: 3, dry: 0.05, taper: 0 }); brush(c, P, 2.8, C.red, R, { bristles: 3, dry: 0.1, taper: 0 });
  brush(c, [[-8, -8], [8, 8]], 4.2, C.ink, R, { bristles: 3, dry: 0.05, taper: 0 }); brush(c, [[-7.8, -7.8], [7.8, 7.8]], 2.8, C.red, R, { bristles: 3, dry: 0.1, taper: 0 });
});
icon('heavy', (c, o) => {
  const R = o.R;
  const H = ring(0, -6.6, 4.4, 3.8, R, 0.05, 10); H.push(H[0]);
  brush(c, H, 3.6, C.ink, R, { bristles: 3, dry: 0, taper: 0 }); brush(c, H, 1.6, C.grey, R, { bristles: 2, dry: 0.1, taper: 0 });
  part(c, poly(sub([[-6, -3.6], [6, -3.6], [10.4, 10], [-10.4, 10]], 3), R, 0.15), C.char, o.M, { lw: 1.7 });
  brush(c, [[-5.4, -1.6], [-7.8, 7.6]], 1.2, C.charL, R, { bristles: 2, dry: 0.3, taper: 0.4 });
  brush(c, [[-12, 12.4], [12, 12.4]], 1.4, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.3 });
  for (const x of [-12, 12]) brush(c, [[x, -2], [x * 0.95, 4]], 1, C.ink, R, { bristles: 2, dry: 0.4, taper: 0.6 });
});
icon('lavatrail', (c, o) => {
  const R = o.R;
  const foot = (x, y, a) => {
    c.save(); c.translate(x, y); c.rotate(a);
    part(c, ring(0, 1.2, 3, 4.2, R, 0.12, 9), '#3a2a24', o.M, { lw: 1.2 });
    fill(c, ring(0, 1.2, 2, 3, R, 0.15, 8), C.fireO, R, { edge: 0 }); dab(c, 0.2, 1.6, 1.1, C.fireY, R);
    for (const [tx, ty, r] of [[-2.4, -4, 1.1], [-0.6, -4.8, 1.1], [1.3, -4.6, 1], [2.9, -3.6, 0.9]]) { part(c, ring(tx, ty, r, r, R, 0.1, 6), '#3a2a24', o.M, { lw: 0.8 }); dab(c, tx, ty, r * 0.5, C.fireO, R); }
    c.restore();
  };
  foot(-5.6, 5.4, -0.25); foot(5.4, -4.6, 0.25);
  for (const [x, y] of [[-9, 11], [-2.6, 11.6], [8.6, 2.4]]) { dab(c, x, y, 1.2, C.fireR, R); dab(c, x, y, 0.6, C.fireY, R); }
});
icon('sneak', (c, o) => {
  const R = o.R;
  for (const [x, y] of [[-5.6, -2.4], [5, -2.4]]) { part(c, oval(x, y, 4, 3, 0, R, 0.05, 9), C.white, o.M, { lw: 0.95 }); dab(c, x + 1.6, y + 0.5, 1.5, C.ink, R); brush(c, [[x - 4, y - 0.6], [x, y - 2.4], [x + 4, y - 0.8]], 1.2, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.1 }); }
  const G = [[-13, 12], [-12.6, 6], [-11, 1.2], [-9.6, 6.4], [-7.4, -0.2], [-5.6, 6], [-3, 1], [-1.4, 6.2], [0.8, 0.4], [2.6, 6], [4.8, 0.8], [6.4, 6.2], [8.8, 0.2], [10, 6], [12, 1.6], [12.8, 7], [13, 12]];
  part(c, poly(G, R, 0.2), C.leafL, o.M, { lw: 1.4, sharp: true });
  for (let i = 0; i < 5; i++) brush(c, [[-10 + i * 5, 11], [-9.6 + i * 5, 6]], 0.8, C.leaf, R, { bristles: 2, dry: 0.3, taper: 0.6 });
});
icon('skates', (c, o) => {   // a hockey skate side on: tall boot, laces, steel blade with a curled toe
  const R = o.R, M = o.M;
  for (const x of [-4.6, 5.4]) brush(c, [[x, 2.6], [x, 5.4]], 1.3, C.ink, R, { bristles: 2, dry: 0 });
  tube(c, [[-8.4, 6], [9.6, 6]], 1.4, K.blade, R, 0.8);
  brush(c, [[9.4, 6], [11.6, 4.6], [11.8, 2.8]], 1.3, C.ink, R, { bristles: 2, dry: 0, taper: 0.3 });
  part(c, poly(sub([[-7, -12.6], [-0.6, -13], [0.4, -4.4], [6.6, -3.2], [9.8, -0.6], [9.6, 3.2], [-7.6, 3.2]], 2.4), R, 0.15), K.skate, M, { lw: 1.6 });
  for (let i = 0; i < 4; i++) { const y = -10.6 + i * 2.4; brush(c, [[-4.6, y], [-1.4, y + 1.2]], 0.9, C.white, R, { bristles: 2, dry: 0.1, taper: 0 }); brush(c, [[-4.6, y + 1.2], [-1.4, y]], 0.9, C.white, R, { bristles: 2, dry: 0.1, taper: 0 }); }
  brush(c, [[-7.2, 1.6], [9.4, 1.6]], 1.1, C.greyL, R, { bristles: 2, dry: 0.2, taper: 0 });
  for (let i = 0; i < 3; i++) brush(c, [[-13 + i * 1.6, 10 + i * 1.4], [-6 + i * 1.6, 9.8 + i * 1.4]], 0.9, '#9fd8ff', R, { bristles: 2, dry: 0.3, taper: 0.6 });
});
// ---- act 1
icon('pounce', (c, o) => {
  const R = o.R, col = '#4a3426';
  arcArrow(c, R, [[-12, 10], [-9, -4], [-1, -11], [6, -7]], C.ink, 1.3, true);
  part(c, ring(5.4, 6.4, 4, 3.4, R, 0.12, 9), col, o.M, { lw: 1.2 });
  for (const [x, y, r] of [[0.6, 1.6, 1.6], [3.6, -0.6, 1.6], [7.2, -0.6, 1.6], [10.2, 1.8, 1.5]]) part(c, ring(x, y, r, r * 1.1, R, 0.1, 7), col, o.M, { lw: 1 });
  for (const [x, y] of [[0.2, -0.6], [3.4, -3], [7.4, -3], [10.8, -0.4]]) brush(c, [[x, y], [x + 0.4, y - 1.8]], 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0.6 });
});
icon('charge', (c, o) => {
  const R = o.R, M = o.M, sk = '#6d86ad';
  part(c, poly([[-6, -11], [-1, -12.4], [2.4, -8], [1.6, 2.4], [-3.6, 6], [-7.6, 2]], R, 0.15), tone(sk, 0.15), M, { lw: 1.4 });   // frill
  for (const [x, y] of [[-5.2, -9.4], [-1.6, -10.6], [0.8, -7]]) dab(c, x, y, 0.8, C.yellow, R);
  part(c, poly([[-3, -2], [3, -5.6], [9.4, -4.4], [12.6, 0.4], [11, 4.6], [4, 5.4], [-2.4, 4]], R, 0.15), sk, M, { lw: 1.5 });   // head
  part(c, poly([[1, -4.4], [4.6, -12.6], [5.6, -4.8]], R, 0.1), C.white, sm(lk(o), 0.3, 1), { lw: 1, sharp: true });   // brow horn
  part(c, poly([[9.6, -3.6], [13.4, -8], [12, -2.4]], R, 0.1), C.white, sm(lk(o), 0.3, 1), { lw: 1, sharp: true });   // nose horn
  eyeDot(c, 5.2, -1.4, 1.2, R);
  brush(c, [[6.4, 2.6], [9.6, 2.4], [11.6, 1.4]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
  speed(c, R, [-9, -4], 3, 3.6, 4.6, 1.2);
});
icon('tackle', (c, o) => {
  const R = o.R;
  part(c, oval(2, 0, 9.4, 5.8, -0.35, R, 0.04, 12), '#8a4a22', o.M, { lw: 1.6 });
  brush(c, rotP([[-3.6, 0], [7.6, 0]], -0.35, 2, 0), 1.2, C.white, R, { bristles: 2, dry: 0.1, taper: 0 });   // the laces
  for (let i = 0; i < 4; i++) { const x = -1 + i * 2.2; brush(c, rotP([[x, -1.4], [x, 1.4]], -0.35, 2, 0), 0.9, C.white, R, { bristles: 2, dry: 0, taper: 0 }); }
  for (const s of [-1, 1]) brush(c, rotP([[-5.6 + (s < 0 ? 0 : 12.6), -3.6], [-5.6 + (s < 0 ? 0 : 12.6), 3.6]], -0.35, 2, 0), 1, C.white, R, { bristles: 2, dry: 0.2, taper: 0 });
  speed(c, R, [-8, 4], 3, 3.2, 5, 1.2);
});
icon('blink', (c, o) => {
  const R = o.R;
  outline(c, ring(-7.6, 4.6, 4.4, 4.6, R, 0.06, 9), R, 1.1, { col: C.purple, jit: 0.1 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; dab(c, -7.6 + Math.cos(a) * 6.6, 4.6 + Math.sin(a) * 6.6, 0.8, C.purple, R); }
  arcArrow(c, R, [[-7, -2], [-2, -10], [4, -9.6], [7.2, -4]], C.ink, 1.3, true);
  const S = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, k = i % 2 ? 0.38 : 1; S.push([7.4 + Math.cos(a) * 6.2 * k, 5 + Math.sin(a) * 6.2 * k]); }
  part(c, poly(S, R, 0.1), '#ffc21a', o.M, { lw: 1.3, sharp: true });
  dab(c, 7.4, 5, 1.4, C.white, R);
});
icon('roar', (c, o) => {
  const R = o.R, M = o.M, sk = '#6e7d36';
  about(c, -2, 1, 0.45, () => { part(c, poly([[-9, 1], [0, 2], [6.4, 2.6], [5.6, 5.8], [-2, 6.6], [-8.6, 5]], R, 0.12), sk, M, { lw: 1.4 }); for (let i = 0; i < 4; i++) fill(c, [[-4 + i * 2.6, 2.2], [-3 + i * 2.6, 0], [-2 + i * 2.6, 2.3]], C.white, R, { sharp: true, edge: 0 }); });
  fill(c, poly([[-6, -1], [5, -2], [4, 4], [-6, 4]], R, 0.1), '#9e1f2a', R, { edge: 0 });
  part(c, poly([[-11, -2.6], [-9, -9], [-2, -11.6], [5.6, -9.6], [7.6, -4.6], [6.6, -1.8], [-4, -0.4], [-11, 0]], R, 0.12), sk, M, { lw: 1.5 });
  for (let i = 0; i < 4; i++) fill(c, [[-3 + i * 2.6, -1.4], [-2 + i * 2.6, 1], [-1 + i * 2.6, -1.6]], C.white, R, { sharp: true, edge: 0 });
  eyeDot(c, -2, -7, 1.3, R); brush(c, [[-4, -9.4], [-0.4, -8.4]], 0.9, C.ink, R, { bristles: 2, dry: 0 });
  for (let i = 0; i < 3; i++) { const r = 4 + i * 2.6, P = []; for (let k = 0; k <= 5; k++) { const a = -0.7 + 1.4 * k / 5; P.push([7 + Math.cos(a) * r, 0.6 + Math.sin(a) * r]); } brush(c, P, 1.1, C.ink, R, { bristles: 2, dry: 0.25, taper: 0.3 }); }
});
icon('throw', (c, o) => {
  const R = o.R;
  arcArrow(c, R, [[-12, 11], [-8, -2], [1, -9.6], [10, -4], [12, 4]], C.ink, 1.2, true);
  tinyMan(c, o, 1.4, -2.4, 0.8, 1.9);
  for (const a of [0.6, 1.2, 1.8]) brush(c, [[1.4 + Math.cos(a) * 8.6, -2.4 + Math.sin(a) * 8.6], [1.4 + Math.cos(a) * 10.4, -2.4 + Math.sin(a) * 10.4]], 0.8, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.5 });
});
icon('lasso', (c, o) => {
  const L = lk(o), R = o.R, P = ring(3.4, -4.6, 8.4, 5.4, R, 0.06, 12); P.push(P[0]);
  rope(c, L, P, 1.4);
  rope(c, L, [[-3.6, -1.6], [-6, 3], [-6.6, 8]], 1.3);
  coil(c, L, 3, -9, 3.4, 1.35);
});
icon('slide', (c, o) => {
  const R = o.R, M = o.M, sk = '#9c6a46';
  part(c, poly([[-11, 5.4], [-10, 0], [-4, -3.6], [4, -4.4], [9.6, -2], [12, 2.6], [10, 6.4], [-6, 7.2]], R, 0.15), sk, M, { lw: 1.5 });
  fill(c, poly([[-8, 5.6], [0, 6.6], [9, 5.6], [8, 7], [-6, 7.4]], R, 0.1), '#e8c9a0', R, { edge: 0 });
  for (const x of [8, 9.6]) part(c, poly([[x, 2.4], [x + 0.6, 8.6], [x + 1.6, 2.2]], R, 0.06), C.white, sm(lk(o), 0.2, 0.8), { lw: 0.8, sharp: true });
  eyeDot(c, 8.2, -0.8, 1.1, R);
  for (const x of [5, 6.2]) brush(c, [[x, 1.4], [x - 2, 1.8]], 0.4, C.ink, R, { bristles: 1, dry: 0 });
  brush(c, [[-13, 10.4], [13, 10.4]], 1.3, '#9fd8ff', R, { bristles: 2, dry: 0.3, taper: 0.2 });
  speed(c, R, [-11.4, -4], 3, 3, 3.4, 1.1);
  for (const [x, y] of [[13, 5], [12, 8.6]]) dab(c, x, y, 0.8, C.pondL, R);
});
icon('stomp', (c, o) => {   // the longneck's foot coming down side on (toes forward), impact bursts either side
  const R = o.R, M = o.M, sk = '#4c9a9a';
  for (const [x, y, r] of [[-10.4, 6.6, 4.2], [11.4, 6.8, 3.6]]) { spark(c, x, y, r, R); outline(c, (() => { const P = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2, k = i % 2 ? 0.45 : 1; P.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); } return P; })(), R, 0.8, { jit: 0.1 }); }   // impact bursts
  brush(c, [[-13.6, 10.8], [13.6, 10.8]], 1.4, C.ink, R, { bristles: 2, dry: 0.2, taper: 0.2 });
  part(c, poly(sub([[-5.6, -12.4], [3, -12.4], [3.2, -2], [5.8, 1.6], [8.4, 5.4], [8.8, 10.4], [-6.6, 10.4], [-6.4, -2]], 2.4), R, 0.15), sk, M, { lw: 1.7 });
  for (const P of [[[-5.6, -3], [-1.4, -2], [2.6, -3]], [[-6, 1.4], [-1.4, 2.4], [3, 1.2]]]) brush(c, P, 0.8, tone(sk, -0.35), R, { bristles: 2, dry: 0.3, taper: 0.3 });
  for (const [x, r] of [[0, 1.8], [3.6, 1.8], [7, 1.6]]) part(c, ring(x, 9.4, r, r * 0.8, R, 0.1, 7), K.spike, sm(lk(o), 0.3, 1), { lw: 1 });
  for (const x of [-11, -8, 11.6]) brush(c, [[x, -12.6], [x, -6.6]], 1.1, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.6 });   // coming down
});
icon('sit', (c, o) => {
  const R = o.R, M = o.M;
  part(c, poly([[-11, -6], [11, -6], [9.4, 0.6], [5, 5.8], [0, 7.2], [-5, 5.8], [-9.4, 0.6]], R, 0.15), C.white, M, { lw: 1.6 });
  brush(c, [[-10.6, -4.6], [0, -3.6], [10.6, -4.6]], 1.6, '#cfe2f2', R, { bristles: 2, dry: 0.2, taper: 0 });
  for (const x of [-8, 8]) { dab(c, x, -2.4, 1.1, C.yellow, R); outline(c, ring(x, -2.4, 1.1, 1.1, R, 0.05, 6), R, 0.6, { jit: 0.05 }); }
  for (const s of [-1, 1]) {   // a squashed little foe's legs + arms poking out from under it
    brush(c, [[s * 5, 7.4], [s * 9.4, 10.4], [s * 12.4, 10.6]], 1.4, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.1 });
    dab(c, s * 12.6, 10.4, 1.2, C.blue, R);
    brush(c, [[s * 8, 3.4], [s * 11.4, 5.4], [s * 13, 4.4]], 1.1, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.2 });
  }
  brush(c, [[-13, 12.8], [13, 12.8]], 1.2, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.3 });
  spark(c, -10.6, -9, 1.8, R); spark(c, 10.4, -10.4, 1.5, R);
  for (const x of [-6, 0, 6]) brush(c, [[x, -12.4], [x, -8.6]], 1, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.6 });
});
icon('swallow', (c, o) => {
  const R = o.R, M = o.M, sk = '#9ac21f';
  tube(c, [[-13, 9], [-8, 10], [-4, 7.6], [-3, 3]], 5, sk, R, 1.3);
  about(c, -2, 2, 0.5, () => part(c, poly([[-3, 0], [6, 1.6], [12.4, 4], [10.4, 6.4], [2, 6], [-3.6, 4.6]], R, 0.12), sk, M, { lw: 1.4 }));
  fill(c, poly([[-1, -1], [9.6, -2], [10, 5.6], [-1, 5]], R, 0.1), '#9e1f2a', R, { edge: 0 });
  part(c, poly([[-5, 0], [-4, -6], [2, -9.4], [9, -8.6], [13, -5], [11.6, -2.4], [2, -0.6]], R, 0.12), sk, M, { lw: 1.5 });
  for (const x of [2, 5, 8]) brush(c, [[x, -7.6], [x + 1, -3]], 1.2, '#5f8a10', R, { bristles: 2, dry: 0.2, taper: 0.3 });
  fill(c, [[9.6, -2.4], [10.2, 0.6], [10.8, -2.2]], C.white, R, { sharp: true, edge: 0 });
  eyeDot(c, 4.6, -5.6, 1.3, R);
  brush(c, [[11.6, 2.2], [13.4, 1.6], [13.8, 3]], 0.6, C.red, R, { bristles: 1, dry: 0 });
});
// ---- act 2
icon('bomb', (c, o) => { const L = lk(o); bombBall(c, L, -1.6, 3.4, 8.2, true); });
icon('magnet', (c, o) => {
  const L = lk(o), R = o.R;
  magnet(c, L, -3.4, 0, 0, true, 1.45);
  for (const s of [-1, 1]) brush(c, [[-9.6, s * 8.4], [-5, s * 11.4], [2, s * 12], [8, s * 10.4]], 0.9, C.ink, R, { bristles: 2, dry: 0.4, taper: 0.5 });   // field lines
});
icon('ink', (c, o) => {
  const R = o.R, P = [];
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, k = 0.7 + R() * 0.3 + (i % 3 === 0 ? 0.25 : 0); P.push([Math.cos(a) * 9 * k, -1 + Math.sin(a) * 8 * k]); }
  part(c, P, '#2a1f3a', o.M, { lw: 1.4, sharp: false });
  for (const [x, y, r] of [[-3, 10, 1.6], [3.4, 11.4, 1.2], [10.6, 3, 1.4], [-11, -5, 1.2], [8, -10.4, 1]]) dab(c, x, y, r, '#2a1f3a', R);
  brush(c, [[-4.6, -5], [-1.6, -6.6]], 1.1, '#6b5a88', R, { bristles: 2, dry: 0.3, taper: 0.5 });
});
icon('stink', (c, o) => {
  const R = o.R, g = '#a6c94a';
  cloud(c, o, [[-6, 4, 5.4], [1.6, 2.4, 6.4], [7.4, 5.4, 4.6], [-1, 8, 4.4]], g, 1.4);
  for (const [x, y] of [[-6.4, -2], [0.6, -5], [7, -2.4]]) brush(c, [[x, y], [x - 1.4, y - 3], [x + 0.6, y - 5.6], [x - 0.8, y - 8.4]], 1.3, '#5f8a10', R, { bristles: 2, dry: 0.2, taper: 0.4 });
  for (const [x, y] of [[-3.4, 4.4], [3.6, 3.2]]) { xEye(c, x, y, 1, R, 0.8); }
});
icon('mind', (c, o) => gearIn(c, o, 'mind', 'atk', -0.5, 12.6, 1.18));
icon('grabfour', (c, o) => {   // the octopus's head low down, four arms reaching up and out, curling at the tips
  const L = lk(o), R = o.R, S = [[[-3, 7], [-8, 4], [-12, -2], [-11, -9], [-7.4, -10.4], [-6.6, -7.6]], [[-1, 5], [-3.4, -2], [-4, -8.6], [-1.6, -12.6], [1, -11.6]],
    [[1, 5], [4, -2], [5.4, -8], [8.4, -11.6], [10.6, -10]], [[3, 7], [8.4, 5.4], [12.4, 0.4], [12.6, -5], [10, -6.2]]];
  S.forEach((P, i) => tentacle(c, L, P, 3, i === 1 || i === 2));
  part(c, ring(0, 8.4, 7.4, 5.6, R, 0.08, 10), K.oct, o.M, { lw: 1.5 });
  for (const x of [-2.6, 2.6]) { dab(c, x, 8.2, 1.6, C.white, R); dab(c, x + 0.5, 8.4, 0.85, C.ink, R); }
  if (!L.burnt) dab(c, -3.6, 5, 0.9, '#c88ae8', R);
});
icon('drink', (c, o) => {
  const R = o.R;
  part(c, poly([[2.4, -6], [6.8, 2], [7.6, 6], [5.6, 10], [1.6, 11.4], [-2.6, 10], [-4.4, 6], [-3.4, 2]], R, 0.1), K.blood, o.M, { lw: 1.5 });
  dab(c, -1, 4, 1.2, '#ff8a8a', R);
  brush(c, [[-13, -12.6], [-6.4, -6.4], [0.6, 0.6]], 2.2, C.ink, R, { bristles: 2, taper: 0.7, dry: 0, vary: 0.05 });
  brush(c, [[-12.6, -12.4], [-6.4, -6.6], [-1.6, -1.8]], 0.8, K.mosL, R, { bristles: 1, taper: 0.5, dry: 0.1 });
  part(c, ring(-11.4, -11.4, 3, 2.8, R, 0.1, 8), K.mos, o.M, { lw: 1.2 });
});
icon('shock', (c, o) => {
  const R = o.R;
  fill(c, poly([[-13, 5.4], [13, 5.4], [13, 13], [-13, 13]], R, 0.3), C.pond, R, { edge: 0 });
  waves(c, R, 6, -12.6, 12.6, 2, C.pondL, 1.2);
  part(c, poly([[1.6, -13], [-6.4, 0.4], [-0.6, 0.4], [-3.6, 11], [6.6, -3], [0.6, -3], [5, -13]], R, 0.1), C.yellow, o.M, { lw: 1.5, sharp: true });
  for (const [x, y] of [[-9, -6], [9, 0], [-10, 2]]) spark(c, x, y, 1.6, R);
});
icon('curse', (c, o) => {
  const R = o.R, M = o.M, sk = '#2fae63';
  part(c, poly([[-11, 8], [-11, 1], [-7, -3.6], [0, -5], [7, -3.6], [11, 1], [11, 8], [0, 9.6]], R, 0.12), sk, M, { lw: 1.6 });
  for (const x of [-5.6, 5.6]) { part(c, ring(x, -5.2, 3.6, 3.4, R, 0.08, 8), sk, M, { lw: 1.4 }); dab(c, x, -5.2, 2.2, C.white, R); dab(c, x + 0.6, -5, 1.2, C.ink, R); }
  brush(c, [[-7, 2.6], [0, 5.4], [7, 2.6]], 1.1, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 });
  fill(c, poly([[-6, 9], [0, 7.6], [6, 9], [0, 10]], R, 0.1), '#f3e98c', R, { edge: 0 });
  for (const [x, y, r] of [[10.4, -10.4, 2.2], [-11, -10, 1.6], [12, -3, 1.2]]) { const S = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, k = i % 2 ? 0.35 : 1; S.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); } fill(c, S, C.purple, R, { sharp: true, edge: 0 }); }
});
icon('smoke', (c, o) => {
  cloud(c, o, [[-3, 1, 6], [4, -2.4, 6.6], [8.4, 4, 4.4], [1, 6.6, 5], [-8, 6, 3.8]], C.smokeL, 1.4);
  const L = lk(o); bombBall(c, L, -8.6, 9, 3.4, true);
});
// ---- support / defence / death
icon('rally', (c, o) => gearIn(c, o, 'rally', 'atk', 4.6, 12.6, 1.12));
icon('heal', (c, o) => {
  const L = lk(o), R = o.R;
  heart(c, L, 0, 1.4, 10.4);
  brush(c, [[0, -4.6], [0, 5.8]], 3.4, C.white, R, { bristles: 3, dry: 0.05, taper: 0 }); brush(c, [[-5.2, 0.6], [5.2, 0.6]], 3.4, C.white, R, { bristles: 3, dry: 0.05, taper: 0 });
});
icon('dome', (c, o) => {
  const R = o.R, D = []; for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; D.push([Math.cos(a) * 12, 7 + Math.sin(a) * 15]); }
  c.save(); c.globalAlpha = 0.5; fill(c, D, '#c8f8ff', R, { edge: 0, sharp: true }); c.restore();
  brush(c, D, 3, K.cyan, R, { bristles: 3, dry: 0.15, taper: 0 }); outline(c, D, R, 1.3, { gap: true, over: 0 });
  brush(c, [[-13, 7.6], [13, 7.6]], 1.6, C.ink, R, { bristles: 2, dry: 0.2, taper: 0.2 });
  fill(c, poly([[-13, 8], [13, 8], [13, 12], [-13, 12]], R, 0.3), C.g2, R, { edge: 0 });
  brush(c, [[-8, -1], [-6, -5.4], [-2.4, -7.2]], 1.4, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 });
  const L = lk(o); c.save(); c.translate(1.6, 6.6); c.scale(0.7, 0.7); emitter(c, L, true); c.restore();
});
icon('scare', (c, o) => {
  const R = o.R, M = o.M;
  for (const [x, y, a] of [[-7, 9, 2.2], [-3, 10.6, 1.8], [3, 10.6, 1.4], [7.4, 9, 1]]) brush(c, [[x, y - 2], [x + Math.cos(a) * 4, y + Math.sin(a) * 4]], 1.1, C.yellow, R, { bristles: 2, dry: 0.3, taper: 0.6 });
  part(c, poly([[-8, -2], [-7.4, -6], [0, -7], [7.4, -6], [8.2, -2], [7, 6.4], [0, 8.6], [-7, 6.4]], R, 0.15), '#d9b878', M, { lw: 1.5 });
  for (const x of [-3.4, 3.6]) { dab(c, x, -1, 1.9, C.ink, R); dab(c, x - 0.4, -1.4, 0.5, C.greyL, R); }
  brush(c, [[-4.4, 3.6], [0, 4.6], [4.6, 3.6]], 0.9, C.ink, R, { bristles: 2, dry: 0 });
  for (let i = 0; i < 4; i++) brush(c, [[-3.4 + i * 2.4, 2.6], [-3.4 + i * 2.4, 5]], 0.6, C.ink, R, { bristles: 1, dry: 0 });
  part(c, poly([[-13, -5.4], [-6, -7.6], [-5, -12.6], [5, -12.6], [6, -7.6], [13, -5.4], [0, -4.6]], R, 0.15), '#c79a3a', M, { lw: 1.4 });
  brush(c, [[-5.6, -8.6], [5.6, -8.6]], 1.6, C.red, R, { bristles: 2, dry: 0.15, taper: 0 });
});
icon('raise', (c, o) => {
  const R = o.R, M = o.M, bone = C.white;
  part(c, poly([[-13, 13], [-10, 6], [-4, 4], [4, 4], [10, 6], [13, 13]], R, 0.2), K.dirt, M, { lw: 1.5 });
  tube(c, [[-0.6, 7], [-0.4, 0], [0, -4]], 2.6, bone, R, 1.1);
  part(c, poly([[-3.6, -3.6], [3.6, -4], [3.8, -7.4], [-3.4, -7]], R, 0.1), bone, M, { lw: 1.2 });
  for (const [x, len, a] of [[-3, 5.6, -0.25], [-1, 6.6, -0.05], [1.2, 6.4, 0.08], [3.2, 5.2, 0.25]]) tube(c, [[x, -7], [x + Math.sin(a) * len * 0.5, -7 - len * 0.5], [x + Math.sin(a) * len, -7 - len]], 1.2, bone, R, 0.9);
  tube(c, [[3.6, -4.6], [6.4, -6.6], [7.8, -9.4]], 1.3, bone, R, 0.9);
  for (const [x, y] of [[-8, 9], [6.6, 8.4], [9.6, 10.6]]) dab(c, x, y, 0.9, K.dirtL, R);
});
icon('bees', (c, o) => { const L = lk(o); bee(c, L, 0.6, 2, 6.2, -0.1); });
icon('crows', (c, o) => gearIn(c, o, 'crows', 'atk', -1.6, 9.6, 1.9));
icon('armour', (c, o) => gearIn(c, o, 'armour', 'idle', 0, 3.6, 1.25, { body: 'beast' }));
icon('shield', (c, o) => gearIn(c, o, 'shield', 'idle', 0, -0.2, 1.36));
icon('shell', (c, o) => gearIn(c, o, 'shell', 'idle', 0, 4, 1.9, { body: 'beast' }));
icon('dodge', (c, o) => {
  const R = o.R;
  c.save(); c.globalAlpha = 0.28; tinyMan(c, o, -7, 1, 1.05, -0.05, C.blue); c.globalAlpha = 0.5; tinyMan(c, o, -2.6, 1, 1.05, -0.2, C.blue); c.restore();
  tinyMan(c, o, 3.6, 1.4, 1.05, -0.5, C.blue);
  speed(c, R, [-8.6, -8], 2, 3, 4, 1.1);
  arcArrow(c, R, [[12.6, -9], [6, -12], [-2, -11.6]], C.red, 1.3);
});
icon('spikes', (c, o) => {
  const L = lk(o), R = o.R, M = o.M, r0 = 8.2;
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.11; spike(c, L, Math.cos(a) * (r0 - 1.2), Math.sin(a) * (r0 - 1.2), a, r0 * 0.5 + 1.6, 1.6); }
  part(c, ring(0, 0, r0, r0 * 0.96, R, 0.05, 12), K.puff, M, { lw: 1.5 });
  for (const [x, y, r] of [[-4, -3.4, 1.1], [-1, -5.8, 0.9], [-5, 1, 0.9], [1.6, -3.6, 0.7]]) dab(c, x, y, r, K.puffSp, R);
  eyeDot(c, 3.4, -1.6, 2.2, R);
  dab(c, 7.2, 1.4, 1.4, C.ink, R); dab(c, 7.3, 1.4, 0.8, '#f07a8a', R);
});
icon('split', (c, o) => {
  const R = o.R, M = o.M, sl = '#7ee0c8';
  const blob = (x, y, s) => {
    part(c, poly([[x - 6 * s, y + 5 * s], [x - 6.4 * s, y], [x - 3.6 * s, y - 4.4 * s], [x, y - 5.4 * s], [x + 3.6 * s, y - 4.4 * s], [x + 6.4 * s, y], [x + 6 * s, y + 5 * s]], R, 0.15), sl, M, { lw: 1.4 });
    dab(c, x - 2.6 * s, y - 2.4 * s, 0.9 * s, C.white, R); dab(c, x + 1.6 * s, y - 0.6 * s, 1 * s, C.ink, R); dab(c, x + 4 * s, y - 0.6 * s, 1 * s, C.ink, R);
  };
  blob(-6.6, 4.6, 1); blob(7, 4.6, 1);
  for (const [x, y] of [[0.2, 2], [0.6, -1.6]]) dab(c, x, y, 0.9, sl, R);
  arcArrow(c, R, [[-2.6, -6], [-6.4, -9.4], [-9.6, -8.4]], C.ink, 1.1); arcArrow(c, R, [[2.6, -6], [6.4, -9.4], [9.6, -8.4]], C.ink, 1.1);
  brush(c, [[-13, 10], [13, 10]], 1.1, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.3 });
});
icon('rebirth', (c, o) => {
  const R = o.R, M = o.M;
  flameAt(c, -3, -3, -Math.PI / 2 - 0.3, 2.6, R); flameAt(c, 3, -3.6, -Math.PI / 2 + 0.3, 2.6, R); flameAt(c, 0, -4.4, -Math.PI / 2, 3.4, R);
  const E = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, s = Math.sin(a); E.push([7.4 * Math.cos(a), 3.6 + s * (s < 0 ? 9.6 : 8.4)]); }
  part(c, poly(E, R, 0.15), K.pxGold, M, { lw: 1.5 });
  ink(c, [[-7, 0.4], [-4, -1.6], [-1.4, 1.4], [1.6, -1.6], [4.4, 1], [7, -0.6]], 0.9, R);
  for (const [x, y, r] of [[-3, 6, 1.4], [2.6, 8.6, 1.1], [3.4, 3.6, 0.9]]) dab(c, x, y, r, K.pxOr, R);
  brush(c, [[-4.6, 3.6], [-4.4, 8]], 1, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 });
});
