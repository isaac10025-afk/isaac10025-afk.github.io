// Effects in the POSTER PAINT look. Owner: RENDER.
// Every effect is an atlas bit painted once (3 boil variants where it matters) and placed with one setTransform +
// drawImage. Effects from sim events live in a fixed pool of typed arrays (no allocation per event or per frame).
// Time base: sim time (world.time) for lifetimes, so a paused game freezes its effects; real time for line boil.
//   projectiles: bullet tracer (yellow streak, ink tip), flame blobs (yellow -> orange -> red as they age, growing
//                3 -> 10 px like OG game.js:10130), arrow (team-coloured fletching), grenade (black ball, fuse spark,
//                arc height p.z + ground shadow), plasma (purple ball), shuriken (spinning star).
//   events:      explosion (kid-a star burst -> flung paint drops -> smoke curls, black scorch decal), muzzle flash,
//                puffs (dust / smoke / steam / splash / leaf), sparks, paint spray on hits, hats flying off, slashes,
//                melee "pow", blocks, lightning bolts, magic sparkles, ice shards, dust rings for stomps.
//   per unit:    fire on burning units and corpses, smoke curl over the bigger fires, stun stars, water ripples,
//                flying units' ground shadow.
//   on top:      steam / smoke clouds from world.steam (they hide units in the sim, so they cover them here too).
import { C, TAU, lerp, clamp, rng, hash, brush, ring, fill, outline, shift, poly, dab, splat, spark, tone, part } from './paint.js';
import * as SP from './sprites.js';
import * as GROUND from './ground.js';
import { arrowNeutral } from './terrain.js';
let PEOPLE = null;
try { PEOPLE = await import('./people.js'); } catch (e) { PEOPLE = null; }

// ---------------------------------------------------------------- bits
const boom = SP.defineBit('boom', 3, [110, 100, 55, 52], (c, R, v, M) => {
  const star = (n, r0, r1, rot, flat = 0.82) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, r = (i % 2 ? r1 : r0) * (0.85 + R() * 0.3); pts.push([Math.cos(a) * r, Math.sin(a) * r * flat]); } return pts; };
  const rot = R();
  const s1 = star(9, 50, 27, rot); fill(c, shift(s1, M.mx, M.my, 0.8), C.fireR, R, { sharp: true, sp: 1.3, vary: 0.1 }); outline(c, s1, R, 2.0, { jit: 0.6, bristles: 4 });
  const s2 = star(8, 37, 20, rot + 0.3); fill(c, shift(s2, M.mx, M.my), C.fireO, R, { sharp: true, sp: 1.2, vary: 0.1 });
  const s3 = star(7, 25, 13, rot + 0.1); fill(c, s3, C.fireY, R, { sharp: true, sp: 1.1, vary: 0.08 });
  dab(c, 0, -1, 7.5, '#fff7cf', R);
});
const boomP = SP.defineBit('boomP', 2, [110, 100, 55, 52], (c, R, v, M) => {
  const star = (n, r0, r1, rot) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, r = (i % 2 ? r1 : r0) * (0.85 + R() * 0.3); pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.82]); } return pts; };
  const rot = R();
  const s1 = star(9, 50, 27, rot); fill(c, shift(s1, M.mx, M.my, 0.8), C.purple, R, { sharp: true, sp: 1.3, vary: 0.1 }); outline(c, s1, R, 2.0, { jit: 0.6, bristles: 4 });
  const s2 = star(8, 37, 20, rot + 0.3); fill(c, shift(s2, M.mx, M.my), C.pink, R, { sharp: true, sp: 1.2, vary: 0.1 });
  dab(c, 0, -1, 9, '#fff0fb', R);
});
const fire = SP.defineBit('fire', 3, [70, 74, 35, 66], (c, R) => {
  const tongue = (x, w, h, bend, col, outl) => {
    const pts = [[x - w / 2, 0], [x - w * 0.42, -h * 0.4], [x + bend * 0.5 - w * 0.12, -h * 0.75], [x + bend, -h], [x + bend * 0.4 + w * 0.2, -h * 0.68], [x + w * 0.46, -h * 0.34], [x + w / 2, 0], [x, 2]];
    fill(c, poly(pts, R, 0.4), col, R, { vary: 0.08, sp: 1.1 });
    if (outl) outline(c, pts, R, 1.4, { jit: 0.5, gap: true });
  };
  const n = 6;
  for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 7 + (R() - 0.5) * 3, h = 34 + R() * 26 - Math.abs(i - (n - 1) / 2) * 6; tongue(x, 15 + R() * 4, h, (R() - 0.5) * 12, C.fireR, true); }
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 7.5 + (R() - 0.5) * 3, h = 22 + R() * 18 - Math.abs(i - 1.5) * 4; tongue(x, 12 + R() * 3, h, (R() - 0.5) * 9, C.fireO, false); }
  for (let i = 0; i < 3; i++) { const x = (i - 1) * 7 + (R() - 0.5) * 3, h = 12 + R() * 10; tongue(x, 9, h, (R() - 0.5) * 6, C.fireY, false); }
});
const curl = SP.defineBit('curl', 3, [44, 78, 14, 74], (c, R) => {
  const pts = [];
  for (let th = 0; th <= 5.2 * Math.PI; th += 0.5) { const r = 6.4 - th * 0.12; pts.push([th * 1.2 + Math.cos(th + Math.PI) * r + 6 + (R() - 0.5) * 0.8, -th * 4.2 - Math.sin(th) * r * 0.8 + (R() - 0.5) * 0.8]); }
  brush(c, pts, 4.2, C.smoke, R, { taper: 0.6, dry: 0.45, vary: 0.1, bristles: 5, swell: 0.3 });
  brush(c, pts.slice(0, 12), 1.4, tone(C.smoke, 0.4), R, { taper: 0.8, dry: 0.5, bristles: 2 });
}, { tooth: false });
const flash = SP.defineBit('flash', 3, [20, 20, 10, 10], (c, R) => {
  const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + R() * 0.2, r = (i % 2 ? 2.6 : 7) * (0.8 + R() * 0.4); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  fill(c, pts, C.yellow, R, { sharp: true, edge: 0 }); outline(c, pts, R, 0.9, { jit: 0.2 }); dab(c, 0, 0, 2.2, C.orange, R);
}, { tooth: false });
const DROPC = [C.blood, C.fireR, C.fireO, C.fireY, '#7ee0c8', C.zskin, C.pondL, C.pond];
const drop = SP.defineBit('drop', DROPC.length * 2, [8, 8, 4, 4], (c, R, v) => { dab(c, 0, 0, 2.2 + (v & 1) * 0.5, DROPC[v >> 1], R, 0.3); }, { tooth: false });
const DC = { blood: 0, fireR: 1, fireO: 2, fireY: 3, goo: 4, zombie: 5, waterL: 6, water: 7 };
const tracer = SP.defineBit('tracer', 1, [18, 6, 14, 3], (c, R) => {
  brush(c, [[-12, 0], [-3, 0]], 2, C.yellow, R, { bristles: 2, dry: 0.4, taper: 0.6 });
  brush(c, [[-3.4, 0], [0.4, 0]], 2.3, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}, { tooth: false });
// a flame lick: round head at (0, 0), tail streaming back along -x (drawn turned to the flight direction)
const flameB = SP.defineBit('flameblob', 6, [24, 14, 16, 7], (c, R, v) => {
  const age = v >> 1, cols = [[C.fireO, C.fireY, '#fff3b0'], [C.fireR, C.fireO, C.fireY], ['#c92a14', C.fireR, C.fireO]][age];
  const tail = [[4.6, 0], [3.2, -3.6], [0, -4.4], [-5, -3.2 + (R() - 0.5)], [-11 - R() * 3, (R() - 0.5) * 2], [-5, 3.2 + (R() - 0.5)], [0, 4.4], [3.2, 3.6]];
  fill(c, poly(tail, R, 0.4), cols[0], R, { sp: 0.9, vary: 0.1, edge: 0 });
  fill(c, poly([[3.4, 0], [1.6, -2.6], [-2.4, -2.2], [-7, (R() - 0.5)], [-2.4, 2.2], [1.6, 2.6]], R, 0.3), cols[1], R, { sp: 0.8, vary: 0.08, edge: 0 });
  dab(c, 1, 0, 1.7, cols[2], R, 0.3);
}, { tooth: false });
function arrowPaint(col) {
  return (c, R) => {
    brush(c, [[-8, 0], [6, 0]], 1.1, C.brown, R, { bristles: 2, dry: 0, taper: 0 });
    fill(c, [[9.4, 0], [5, -2.6], [5.6, 0], [5, 2.6]], C.ink, R, { sharp: true, edge: 0 });
    brush(c, [[-6, 0], [-9.4, -2.8]], 1.5, col, R, { bristles: 2, dry: 0 }); brush(c, [[-6, 0], [-9.4, 2.8]], 1.5, col, R, { bristles: 2, dry: 0 });
  };
}
const arrowR = SP.defineBit('arrowR', 1, [24, 10, 12, 5], arrowPaint(C.red), { tooth: false });
const arrowB = SP.defineBit('arrowB', 1, [24, 10, 12, 5], arrowPaint(C.blue), { tooth: false });
const grenade = SP.defineBit('grenade', 2, [12, 14, 6, 8], (c, R, v) => {
  dab(c, 0, 0, 3, C.ink, R, 0.1); dab(c, -0.9, -1, 0.8, '#6d6d6d', R);
  brush(c, [[1.2, -2.4], [2.2, -4.2]], 0.7, C.brown, R, { bristles: 2, dry: 0 });
  spark(c, 2.4, -4.8, 1.8 + v * 0.3, R);
}, { tooth: false });
const plasma = SP.defineBit('plasma', 3, [16, 16, 8, 8], (c, R) => {
  dab(c, 0, 0, 5, '#c79cf5', R, 0.25); dab(c, 0, 0, 3.6, C.purple, R, 0.2); dab(c, -0.4, -0.5, 1.6, '#fff0fb', R);
  for (let i = 0; i < 3; i++) { const a = R() * TAU; dab(c, Math.cos(a) * 6, Math.sin(a) * 6, 0.7, C.pink, R); }
}, { tooth: false });
const shuriken = SP.defineBit('shuriken', 2, [14, 14, 7, 7], (c, R, v, M) => {
  if (PEOPLE && PEOPLE.shuriken) { c.rotate(v * 0.4); PEOPLE.shuriken(c, 0, 0, 5.4, R, false); return; }
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + v * 0.3, r = i % 2 ? 1.6 : 5.6; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  fill(c, pts, C.greyL, R, { sharp: true, edge: 0 }); outline(c, pts, R, 0.9, { jit: 0.15 }); dab(c, 0, 0, 0.9, C.ink, R);
}, { tooth: false });
// leaves painted over a unit perched in a tree (ARMY ask: the sniper sits inside the crown)
export const leafClump = SP.defineBit('leafclump', 3, [30, 18, 15, 9], (c, R) => {
  const pts = ring(0, 0, 12, 5.6, R, 0.16, 10);
  fill(c, pts, C.leaf, R, { vary: 0.14, sp: 1.0, edge: 0 });
  for (let i = 0; i < 4; i++) { const x = (R() - 0.5) * 14, y = (R() - 0.5) * 5; brush(c, [[x - 2.5, y + 1], [x - 1, y - 2], [x + 1.5, y - 1.4], [x + 3.2, y + 0.6]], 1.2, i % 2 ? C.leafL : C.leafD, R, { bristles: 2, dry: 0.2 }); }
  brush(c, pts.slice(3, 9), 1.4, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.4 });
}, { tooth: false });
function cloudPaint(col, ink, n = 5, rx = 9, ry = 6) {
  return (c, R) => {
    const pts = []; const m = 14;
    for (let i = 0; i < m; i++) { const a = i / m * TAU, k = 1 + 0.22 * Math.abs(Math.sin(a * n * 0.5 + R() * 0.3)); pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]); }
    fill(c, shift(pts, -0.6, 0.5, 0.3), col, R, { sp: 1.0, vary: 0.05 });
    if (ink) outline(c, pts, R, 1.1, { jit: 0.3, col: ink, gap: true });
  };
}
// kid-a smoke is a loopy line, not a blob: dust and smoke puffs are little scribbled swirls
function swirlPaint(col, colL, w) {
  return (c, R) => {
    const pts = [], turns = 1.3 + R() * 0.5, ph = R() * TAU;
    for (let i = 0; i <= 14; i++) { const t = i / 14, a = ph + t * turns * TAU, r = 1.5 + 6.5 * t; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.75 - t * 2]); }
    brush(c, pts, w, col, R, { taper: 0.5, dry: 0.45, vary: 0.1, bristles: 4, swell: 0.3, per: 4 });
    brush(c, pts.slice(0, 8), w * 0.4, colL, R, { taper: 0.7, dry: 0.5, bristles: 2, per: 4 });
    for (let i = 0; i < 2; i++) { const a = R() * TAU; dab(c, Math.cos(a) * 8, Math.sin(a) * 5, 0.9, col, R); }
  };
}
const dust = SP.defineBit('dust', 3, [26, 22, 13, 11], swirlPaint('#cdb27a', '#efe0b8', 2.8), { tooth: false });
const smoke = SP.defineBit('smoke', 3, [26, 22, 13, 11], swirlPaint(C.smoke, C.smokeL, 3.2), { tooth: false });
const steam = SP.defineBit('steam', 3, [26, 20, 13, 10], cloudPaint('#fbfaf4', '#b9c3c8'), { tooth: false });
const gas = SP.defineBit('gas', 2, [26, 22, 13, 11], swirlPaint('#9cc95a', '#d6efa6', 2.8), { tooth: false });
const splash = SP.defineBit('splash', 3, [24, 20, 12, 14], (c, R) => {
  for (let i = 0; i < 6; i++) { const a = -Math.PI + (i + 0.5) / 6 * Math.PI, l = 5 + R() * 4; brush(c, [[Math.cos(a) * 2, Math.sin(a) * 1.4], [Math.cos(a) * l, Math.sin(a) * l * 1.3 - 1]], 1.6, i & 1 ? C.pondL : C.pond, R, { bristles: 2, dry: 0.2, taper: 0.6 }); }
  for (let i = 0; i < 4; i++) { const a = -Math.PI + R() * Math.PI; dab(c, Math.cos(a) * 9, Math.sin(a) * 9 - 2, 0.9, i & 1 ? C.pondL : '#ffffff', R); }
}, { tooth: false });
const leaf = SP.defineBit('leaf', 3, [10, 8, 5, 4], (c, R, v) => {
  const pts = [[-3.5, 0], [-1, -2], [3.5, 0], [-1, 2]];
  fill(c, pts, [C.leaf, C.leafL, C.leafD][v], R, { edge: 0 }); brush(c, [[-3.5, 0], [3.2, 0]], 0.5, C.leafD, R, { bristles: 1, dry: 0 });
}, { tooth: false });
const sparkB = SP.defineBit('spark', 2, [12, 12, 6, 6], (c, R) => { spark(c, 0, 0, 4, R); }, { tooth: false });
const stars = SP.defineBit('stars', 3, [26, 12, 13, 6], (c, R, v) => {
  brush(c, ring(0, 0, 9, 3, R, 0.05, 10).concat([]), 0.6, C.ink, R, { bristles: 1, dry: 0.6, taper: 0.4 });
  for (let i = 0; i < 3; i++) { const a = v * 0.7 + i / 3 * TAU; spark(c, Math.cos(a) * 9, Math.sin(a) * 3, 2.1, R); }
}, { tooth: false });
const slash = SP.defineBit('slash', 1, [30, 30, 15, 15], (c, R) => {
  const pts = []; for (let i = 0; i <= 8; i++) { const a = -1.2 + i / 8 * 2.4; pts.push([Math.cos(a) * 11, Math.sin(a) * 11]); }
  brush(c, pts, 4.2, '#ffffff', R, { taper: 0.9, dry: 0.3, bristles: 4 });
  brush(c, pts.map(([x, y]) => [x * 1.12, y * 1.12]), 0.8, C.ink, R, { taper: 0.9, dry: 0.4, bristles: 1 });
}, { tooth: false });
const pow = SP.defineBit('pow', 2, [24, 24, 12, 12], (c, R, v, M) => {
  const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + R() * 0.2, r = (i % 2 ? 3.6 : 8.5) * (0.8 + R() * 0.4); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  fill(c, pts, '#fffbe6', R, { sharp: true, edge: 0 }); outline(c, pts, R, 1, { jit: 0.2 }); dab(c, 0, 0, 2.4, C.yellow, R);
}, { tooth: false });
const bolt = SP.defineBit('bolt', 3, [104, 22, 2, 11], (c, R) => {
  const pts = [[0, 0]]; let y = 0;
  for (let i = 1; i < 9; i++) { y = (R() - 0.5) * 12; pts.push([i * 12.5, y * (i < 8 ? 1 : 0)]); }
  pts.push([100, 0]);
  brush(c, pts, 4.6, C.ink, R, { bristles: 3, dry: 0.05, taper: 0.1, per: 2 });
  brush(c, pts, 2.8, C.yellow, R, { bristles: 3, dry: 0.05, taper: 0.1, per: 2 });
  brush(c, pts, 1, '#fffde8', R, { bristles: 1, dry: 0.1, taper: 0.1, per: 2 });
}, { tooth: false });
const sparkle = SP.defineBit('sparkle', 6, [22, 22, 11, 11], (c, R, v) => {
  const col = [C.purple, '#c79cf5', C.zskin, '#5fd15f', '#ffffff', '#9fd8ff'][v];
  for (let i = 0; i < 5; i++) { const a = R() * TAU, d = R() * 7; const x = Math.cos(a) * d, y = Math.sin(a) * d, s = 1.3 + R() * 1.4;
    brush(c, [[x - s, y], [x + s, y]], 0.8, col, R, { bristles: 1, dry: 0 }); brush(c, [[x, y - s], [x, y + s]], 0.8, col, R, { bristles: 1, dry: 0 }); }
}, { tooth: false });
const shard = SP.defineBit('shard', 3, [10, 10, 5, 5], (c, R) => {
  const pts = poly([[-2.6, 2], [0.4, -3.4], [2.8, 1.6]], R, 0.4);
  fill(c, pts, '#e4f4fc', R, { sharp: true, edge: 0 }); outline(c, pts, R, 0.7, { jit: 0.1, col: '#5b7fa6' });
}, { tooth: false });
const ringB = SP.defineBit('dustring', 2, [70, 40, 35, 20], (c, R) => {
  const pts = ring(0, 0, 30, 16, R, 0.08, 14);
  brush(c, pts.concat([pts[0], pts[1]]), 4.5, '#d9c08a', R, { dry: 0.6, taper: 0.3, bristles: 6, vary: 0.1 });
}, { tooth: false });
export const shadow = SP.defineBit('shadow', 1, [30, 12, 15, 6], (c, R) => {
  c.globalAlpha = 0.26; c.fillStyle = '#3a3320'; c.beginPath(); c.ellipse(0, 0, 12.5, 4.2, 0, 0, TAU); c.fill();
  c.globalAlpha = 0.2; c.beginPath(); c.ellipse(0.5, 0.3, 9, 2.8, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
}, { tooth: false });
const ripple = SP.defineBit('ripple', 2, [36, 12, 18, 6], (c, R) => {
  const pts = ring(0, 0, 13, 3.4, R, 0.06, 12);
  brush(c, pts.concat([pts[0]]), 1.3, '#ffffff', R, { dry: 0.5, taper: 0.3, bristles: 2 });
  brush(c, [[-15, 1.6], [-11, 2.8]], 1, C.pondL, R, { bristles: 1, dry: 0.2 });
}, { tooth: false });
// a flat glow ring on the ground (necromancer raise + teleport, OG game.js:21490-21522): base radius 30, flattened 0.36
const glowRing = SP.defineBit('glowring', 2, [70, 28, 35, 14], (c, R, v) => {
  const pts = ring(0, 0, 30, 10.8, R, 0.05, 16);
  brush(c, pts.concat([pts[0], pts[1]]), 3.2, v ? '#5fd35a' : '#d8ff4a', R, { dry: 0.4, taper: 0.2, bristles: 4, vary: 0.12 });
  brush(c, pts.slice(2, 9), 1.2, '#f4ffd0', R, { dry: 0.5, taper: 0.5, bristles: 2 });
}, { tooth: false });
// speed line: a dry ink dash, 10 px long along +x, anchored at its middle
const dash = SP.defineBit('speedline', 2, [16, 6, 8, 3], (c, R) => { brush(c, [[-5, 0], [5, 0]], 1.1, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.6 }); }, { tooth: false });
// a fly: ink body, two pale wings (2 wingbeat frames)
const flyB = SP.defineBit('fly', 2, [6, 6, 3, 3], (c, R, v) => {
  c.fillStyle = 'rgba(235,245,255,0.9)'; c.beginPath(); c.ellipse(-0.6, v ? -1 : -0.6, 1.1, 0.6, v ? -0.6 : -0.2, 0, TAU); c.ellipse(0.6, v ? -1 : -0.6, 1.1, 0.6, v ? 0.6 : 0.2, 0, TAU); c.fill();
  c.fillStyle = C.ink; c.beginPath(); c.ellipse(0, 0, 0.9, 0.7, 0, 0, TAU); c.fill();
}, { tooth: false });
/** OG writeSpeedLines (game.js:21241-21259): 3 dashes behind a charging unit; n = 0..1 how far over 0.7 x runSpeed. */
export function speedLines(x, y, vx, vy, r, n, i, rt) {
  const sp = Math.sqrt(vx * vx + vy * vy) || 1, ux = vx / sp, uy = vy / sp, h = Math.atan2(uy, ux), spr = SP.bit(dash, i & 1);
  for (let d = 0; d < 3; d++) {
    const f = 0.7 * (d - 1) * r, m = 0.75 + 0.25 * Math.sin(23 * rt + 1.7 * i + 2.3 * d), v = r * (0.55 + ((7 * d + i) % 3) * 0.25) * n * m;
    if (v < 1) continue;
    const back = 1.35 * r + v;
    ctx.globalAlpha = Math.min(1, 0.6 * n * m);
    const m2 = S / spr.k, cs = Math.cos(h), sn = Math.sin(h);
    ctx.setTransform(cs * m2 * v / 10, sn * m2 * v / 10, -sn * m2, cs * m2, (x - ux * back - uy * f) * S, (y - uy * back + ux * f - r * (0.9 + 0.25 * d)) * S);
    ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
  }
  ctx.globalAlpha = 1;
}
/** OG writeFlies (game.js:21352-21359): flies circling a plague carrier / a sick unit or corpse. */
export function fliesAt(x, y, r, count, i, t) {
  for (let l = 0; l < count; l++) {
    const s = 1.37 * i + 2.9 * l, o = t * (2.6 + 0.7 * l) + s;
    const fx = x + Math.cos(o) * r * 1.1 + Math.sin(3.3 * o + s) * r * 0.25, fy = y - 2.5 * r + Math.sin(1.7 * o + s) * r * 0.45 + Math.cos(4.1 * o) * r * 0.15;
    put(SP.bit(flyB, ((t * 24 + l) | 0) & 1), fx, fy, 1.1);
  }
}
/** An arrow stuck in a body: head buried at (x, y), shaft along ang (world space). */
/** The stuck-arrow bit for a team (-1 neutral): for painting it into the ground with a body (GROUND.stampBit). */
export function arrowBitFor(team) { return team === 0 ? arrowR : team === 1 ? arrowB : arrowNeutral; }
export function stuckArrow(x, y, ang, team) {
  const spr = team === 0 ? SP.bit(arrowR, 0) : team === 1 ? SP.bit(arrowB, 0) : SP.bit(arrowNeutral, 0);
  put(spr, x - Math.cos(ang) * 4.5, y - Math.sin(ang) * 4.5, 0.6, ang);
}
/** A dust puff from the renderer (boar pawing). */
export function dustAt(x, y, size) { puff(PUFF.dust, x, y, size, Math.PI + (hr() - 0.5), 10); }
export function glowRingAt(x, y, radius, al, v) { if (!(al > 0.01) || !(radius > 0.5)) return; ctx.globalAlpha = Math.min(1, al); put(SP.bit(glowRing, v & 1), x, y, radius / 30); ctx.globalAlpha = 1; }
const hatBits = new Map();
const HAT_KIND = { rifle: 'soldier', legion: 'heavy', cavalry: 'knight' };   // ARMY: people.js paintHat kinds
function hatBit(type, col) {
  const base = type && type.startsWith('risen_') ? type.slice(6) : type || 'rifle';
  const own = SP.entOf(base).ent.own, colour = col === 1 ? C.red : col === 2 ? C.blue : own;
  const key = base + '|' + colour;
  let b = hatBits.get(key);
  if (b) return b;
  const kind = HAT_KIND[base] || base, at = PEOPLE && PEOPLE.HAT_AT ? PEOPLE.HAT_AT : [0.5, -27];
  const hent = SP.entOf(base).ent.e;
  b = SP.defineBit('hat|' + key, 1, [26, 22, 13, 11], (c, R, v, M) => {
    if (hent && hent.paintHat) { c.translate(-at[0], -at[1]); hent.paintHat(c, colour, M); return; }   // STEP4: the entry's own hat (pirates)
    if (PEOPLE && PEOPLE.paintHat) { c.translate(-at[0], -at[1]); PEOPLE.paintHat(c, kind, colour, M, false); return; }
    part(c, poly([[-5.8, 3], [-5.4, -0.5], [-2, -3], [2.8, -3.1], [6.4, -0.6], [7, 3]], R, 0.3), tone(colour, -0.12), M);
    brush(c, [[-6.6, 3.2], [0.5, 3.5], [8, 3.1]], 1.5, C.ink, R, { bristles: 3, dry: 0.2 });
  });
  hatBits.set(key, b);
  return b;
}
// The 'hat' event carries the type, not the team: take the colour of the unit of that type standing there.
function teamAt(world, type, x, y) {
  const us = world.units; if (!us) return 0;
  let best = 0, bd = 900;   // STEP6 (lead): 30 px (was 3): the hat event is sent a tick or more after the hit, from a moving body
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u || u.dead || u.type !== type) continue; const d = (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y); if (d < bd) { bd = d; best = u.team === 0 ? 1 : u.team === 1 ? 2 : 0; } }
  return best;
}
export function prewarm() {
  SP.wantBits(fire, flash, tracer, flameB, boom, curl, drop, dust, smoke, sparkB, arrowR, arrowB, grenade, splash, steam, pow, stars, shadow, ripple,
    plasma, shuriken, slash, bolt, sparkle, shard, ringB, gas, leaf, boomP, leafClump, glowRing, dash, flyB);
  // attack 11-16 (L4): every sprite module's projectile art (PROJ), baked early instead of in the frame it first flies
  const ph = []; for (const k in SP.PROJ_SRC) { const a = projArt(k); if (a) ph.push(a.handle); }
  SP.wantBitsFirst(...ph);
}

// ---------------------------------------------------------------- the pool
const CAP = 1024;
const K = { boom: 1, flash: 2, puff: 3, drop: 4, spark: 5, hat: 6, slash: 7, pow: 8, bolt: 9, sparkle: 10, shard: 11, ring: 12, splash: 13, fireburst: 14, curl: 15 };
const fk = new Uint8Array(CAP), fx0 = new Float32Array(CAP), fy0 = new Float32Array(CAP), ft0 = new Float64Array(CAP), fl = new Float32Array(CAP);
const fa = new Float32Array(CAP), fs = new Float32Array(CAP), fvx = new Float32Array(CAP), fvy = new Float32Array(CAP), fz = new Float32Array(CAP), fvz = new Float32Array(CAP);
const fv = new Uint16Array(CAP), fx1 = new Float32Array(CAP), fy1 = new Float32Array(CAP);
const fbit = new Array(CAP).fill(null);
let head = 0, live = 0, now = 0;
function spawn(kind, x, y, life, a = 0, s = 1, v = 0) {
  const i = head; head = (head + 1) % CAP; if (live < CAP) live++;
  fk[i] = kind; fx0[i] = x; fy0[i] = y; ft0[i] = now; fl[i] = life; fa[i] = a; fs[i] = s; fv[i] = v;
  fvx[i] = 0; fvy[i] = 0; fz[i] = 0; fvz[i] = 0; fx1[i] = x; fy1[i] = y; fbit[i] = null;
  return i;
}
export function clear() { fk.fill(0); live = 0; head = 0; }
let seq = 0;
const hr = () => { seq = (seq + 0x9e3779b9) >>> 0; let h = Math.imul(seq ^ (seq >>> 16), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sgn = () => hr() * 2 - 1;

const PUFF = { dust: 0, smoke: 1, steam: 2, splash: 3, leaf: 4, gas: 5 };
function puff(kind, x, y, size, ang, spread) {
  const i = spawn(K.puff, x, y, kind === PUFF.steam || kind === PUFF.smoke ? 0.9 : kind === PUFF.leaf ? 1.1 : 0.55, hr() * TAU, size, kind * 4 + ((hr() * 3) | 0));
  const sp = spread == null ? 14 : spread;
  if (ang != null && !Number.isNaN(ang)) { fvx[i] = Math.cos(ang) * sp; fvy[i] = Math.sin(ang) * sp; } else { fvx[i] = sgn() * sp * 0.6; fvy[i] = sgn() * sp * 0.4; }
  if (kind === PUFF.steam || kind === PUFF.smoke || kind === PUFF.gas) fvy[i] -= 10;
  return i;
}
function drops(x, y, n, col, speed, ang = NaN, cone = TAU, up = 60) {
  for (let k = 0; k < n; k++) {
    const a = Number.isNaN(ang) ? hr() * TAU : ang + (hr() - 0.5) * cone, sp = speed * (0.5 + hr() * 0.7);
    const i = spawn(K.drop, x, y, 0.45 + hr() * 0.2, 0, 0.6 + hr() * 0.5, col * 2 + ((hr() * 2) | 0));
    fvx[i] = Math.cos(a) * sp; fvy[i] = Math.sin(a) * sp * 0.6; fz[i] = 2; fvz[i] = up * (0.5 + hr());
  }
}

// ---------------------------------------------------------------- events
export function handleEvents(events, world) {
  now = world.time || 0;
  for (let e = 0; e < events.length; e++) {
    const ev = events[e], x = +ev.x, y = +ev.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    switch (ev.name) {
      case 'explosion': {
        const r = ev.r > 0 ? ev.r : 40, i = spawn(K.boom, x, y, 1.05, 0, r / 50, ev.plasma ? 1 : 0);
        fv[i] = (ev.plasma ? 100 : 0) + ((hr() * 3) | 0);
        if (!ev.deep) GROUND.stamp(GROUND.DK.scorch, x, y + 1, r / 26);
        drops(x, y - 6, 10, ev.plasma ? DC.goo : DC.fireO, r * 2.2, NaN, TAU, 120);
        break;
      }
      case 'muzzle': {
        const s = ev.size != null ? +ev.size : 1;
        spawn(K.flash, x, y, 0.07, +ev.ang || 0, 0.55 + 0.25 * Math.min(2, s), (hr() * 3) | 0);
        if (s > 0.6 && hr() < 0.35) puff(PUFF.smoke, x, y - 2, 0.35 * s, (+ev.ang || 0), 6);
        break;
      }
      case 'puff': {
        const k = PUFF[ev.kind] ?? PUFF.dust, s = ev.size > 0 ? Math.min(3, +ev.size) : 0.8;
        if (k === PUFF.splash) { const i = spawn(K.splash, x, y, 0.45, 0, s, (hr() * 3) | 0); fa[i] = 0; }
        else if (k === PUFF.leaf) { for (let n = 0; n < 2; n++) puff(PUFF.leaf, x + sgn() * 4, y + sgn() * 4, 1, +ev.ang, 18); }
        else if (s > 1.3) { for (let n = 0; n < 3; n++) puff(k, x + sgn() * 8 * s, y + sgn() * 4 * s, Math.min(1.3, s * 0.6), ev.ang != null ? +ev.ang : NaN, 12 * s); }
        else puff(k, x, y, s, ev.ang != null ? +ev.ang : NaN, 12 * s);
        break;
      }
      case 'dust': case 'land': case 'trample': case 'bounce': case 'arrowhit': case 'hop': case 'slip': {
        if (ev.snow) { for (let n = 0; n < 4; n++) puff(PUFF.steam, x + sgn() * 9, y + sgn() * 5, 0.9 + hr() * 0.5, NaN, 10); break; }   // STEP7 lead: snowball
        let s = ev.size > 0 ? +ev.size : ev.v > 0 ? +ev.v : 0.6;
        if (ev.name === 'land') { if (!(ev.speed > 80)) break; s = Math.min(1.6, ev.speed / 200); }
        if (ev.name === 'arrowhit' || ev.name === 'bounce') s = 0.4;
        if (ev.name === 'trample') { for (let n = 0; n < 3; n++) puff(PUFF.dust, x + sgn() * 10, y + sgn() * 5, Math.min(1.6, s * 0.6), NaN, 18); break; }
        if (ev.name === 'slip') { spawn(K.spark, x, y - 6, 0.25, 0, 0.7, 0); }
        if (s > 1.3) { for (let n = 0; n < 3; n++) puff(PUFF.dust, x + sgn() * 8 * s, y + sgn() * 4 * s, Math.min(1.3, s * 0.6), NaN, 12); }
        else puff(PUFF.dust, x, y, s, ev.ang != null ? +ev.ang : NaN, 10);
        break;
      }
      case 'splash': if (ev.snow) { for (let n = 0; n < 4; n++) puff(PUFF.steam, x + sgn() * 9, y + sgn() * 5, 0.9 + hr() * 0.5, NaN, 10); break; } { const i = spawn(K.splash, x, y, 0.45, 0, clamp((+ev.v || 0.5) * 1.3, 0.4, 2.2), (hr() * 3) | 0); fa[i] = 0; break; }
      case 'steam': { const s = ev.size > 0 ? +ev.size : 20; for (let n = 0; n < 3; n++) puff(PUFF.steam, x + sgn() * s * 0.4, y + sgn() * s * 0.25, Math.min(3, s / 14), -Math.PI / 2, 8); break; }
      case 'steampuff': puff(PUFF.steam, x, y, 0.6, -Math.PI / 2, 8); break;
      case 'smoke': for (let n = 0; n < 3; n++) puff(PUFF.smoke, x + sgn() * 10, y + sgn() * 6, 1.5 + hr(), +ev.ang || NaN, 10); break;
      case 'cough': puff(PUFF.gas, x + sgn() * 3, y - 14, 0.6, -Math.PI / 2, 6); break;
      case 'ricochet': if (ev.eggbreak) { for (let n = 0; n < 6; n++) shardOut(x, y - 4, 55); break; }   // STEP7 lead: phoenix egg breaks = shell bits
      // falls through
      case 'spark': case 'block': spawn(K.spark, x, y - (ev.name === 'block' ? 10 : 0), 0.14, hr() * TAU, ev.name === 'block' ? 0.8 : 0.6 * Math.min(2, (+ev.size || 1)), (hr() * 2) | 0); break;
      case 'spray': {
        if (ev.mach) { for (let n = 0; n < 3; n++) spawn(K.spark, x + sgn() * 4, y - 8 + sgn() * 4, 0.16, hr() * TAU, 0.7, (hr() * 2) | 0); break; }   // STEP6: machines spark
        const col = ev.goo === 1 ? DC.goo : ev.goo === 2 ? DC.zombie : DC.blood, s = ev.size > 0 ? +ev.size : 1;
        drops(x, y - 8, 2 + ((s * 2) | 0), col, 55 * s, +ev.ang, 0.9, 40);
        break;
      }
      case 'hat': {
        const i = spawn(K.hat, x, y, Math.max(0.5, +ev.life || 2), 0, (ev.r > 0 ? ev.r : 9.5) / 9.5, 0);
        fvx[i] = +ev.vx || 0; fvy[i] = +ev.vy || 0; fz[i] = +ev.z || 20; fvz[i] = +ev.vz || 200; fa[i] = +ev.spin || 8; fbit[i] = hatBit(ev.type || 'rifle', teamAt(world, ev.type, x, y));
        break;
      }
      case 'hatoff': {
        if (ev.dx === undefined) break;  // damage.js sends a 'hat' right after (that one flies)
        const u = ev.id !== undefined && world.unitById ? world.unitById(ev.id) : null;
        const i = spawn(K.hat, x, y, 1.6, 0, u ? u.radius / 9.5 : 1, 0);
        fvx[i] = (+ev.dx || 0) * 60; fvy[i] = (+ev.dy || 0) * 60; fz[i] = 22; fvz[i] = 160; fa[i] = 9; fbit[i] = hatBit(u ? u.type : 'rifle', u ? (u.team === 0 ? 1 : u.team === 1 ? 2 : 0) : 0);
        break;
      }
      case 'slash': spawn(K.slash, x, y - 10, 0.16, +ev.ang || 0, 0.9, 0); break;
      case 'strike': spawn(K.pow, x + sgn() * 4, y - 10 + sgn() * 3, 0.16, hr() * TAU, 0.55 + 0.25 * Math.min(2, +ev.v || 1), (hr() * 2) | 0); break;
      case 'bolt': { const i = spawn(K.bolt, x, y - 8, 0.22, 0, 1, (hr() * 3) | 0); fx1[i] = +ev.x1; fy1[i] = +ev.y1 - 10; break; }
      // STEP6 (lead): weld = sparks at the patient; dome break = glass shards (the drone's zap line is drawn by sprites-robots.js)
      case 'weld': spawn(K.spark, x + sgn() * 3, y - 8 + sgn() * 3, 0.14, hr() * TAU, 0.6, (hr() * 2) | 0); break;
      case 'domebreak': for (let n = 0; n < 8; n++) shardOut(x + sgn() * (+ev.r || 40) * 0.6, y + sgn() * (+ev.r || 40) * 0.4, 80); break;
      case 'lightning': spawn(K.sparkle, x, y - 10, 0.3, 0, 1.2, 5); break;
      case 'watershock': for (let n = 0; n < 3; n++) spawn(K.sparkle, x + sgn() * 12, y + sgn() * 8, 0.35, 0, 1.2, 5); break;
      case 'spell': spawn(K.sparkle, x, y - 18, 0.4, 0, 1, (hr() * 2) | 0); break;
      case 'curse': spawn(K.sparkle, x, y - 12, 0.6, 0, 1.4, 1); puff(PUFF.gas, x, y - 8, 0.8, -Math.PI / 2, 6); break;
      case 'raise': spawn(K.sparkle, x, y - 8, 0.7, 0, 1.4, 2 + ((hr() * 2) | 0)); puff(PUFF.dust, x, y, 0.9, NaN, 10); break;
      case 'teleport': for (let n = 0; n < 2; n++) spawn(K.sparkle, x + sgn() * 6, y - 12 + sgn() * 6, 0.5, 0, 1.4, n); puff(PUFF.smoke, x, y - 6, 1.1, -Math.PI / 2, 6); break;
      case 'ignite': spawn(K.fireburst, x, y, 0.3, 0, Math.max(0.5, (+ev.v || 9.5) / 9.5), (hr() * 3) | 0); break;
      case 'blast': spawn(K.ring, x, y, 0.4, 0, (ev.r > 0 ? ev.r : 30) / 30, (hr() * 2) | 0); break;
      case 'icecrack': for (let n = 0; n < 2; n++) shardOut(x, y, 40); break;
      case 'icebreak': for (let n = 0; n < 4 + 2 * Math.min(3, +ev.v || 1); n++) shardOut(x, y, 70); break;
      case 'treefall': {
        GROUND.stamp(GROUND.DK.stump, x, y, Math.max(0.7, (ev.r || 6) / 6));
        for (let n = 0; n < 6; n++) puff(PUFF.leaf, x + sgn() * 14, y - 20 + sgn() * 10, 1, hr() * TAU, 30);
        puff(PUFF.dust, x, y, 1.4, NaN, 14);
        break;
      }
      case 'minearm': spawn(K.spark, x, y - 6, 0.12, 0, 0.5, 0); break;
      default: break;
    }
  }
}
function shardOut(x, y, sp) {
  const a = hr() * TAU, i = spawn(K.shard, x, y, 0.5, hr() * TAU, 0.8 + hr() * 0.4, (hr() * 3) | 0);
  fvx[i] = Math.cos(a) * sp * (0.4 + hr()); fvy[i] = Math.sin(a) * sp * 0.6 * (0.4 + hr()); fz[i] = 2; fvz[i] = 80 + hr() * 60;
}

// ---------------------------------------------------------------- drawing helpers (device transform per call)
let ctx = null, S = 1;
function put(spr, x, y, sc, rot = 0, flip = 1) {
  if (!spr) return;
  const m = sc * S / spr.k, cs = Math.cos(rot) * m, sn = Math.sin(rot) * m;
  ctx.setTransform(cs * flip, sn * flip, -sn, cs, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
function putNR(spr, x, y, sx, sy) { // no rotation, separate x / y scale (sx may be negative = flip)
  if (!spr) return;
  ctx.setTransform(sx * S / spr.k, 0, 0, sy * S / spr.k, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
export function begin(c, s, worldTime) { ctx = c; S = s; now = worldTime; }
const boil = (rt, ph) => (((rt * 8 + ph * 3) | 0) % 3 + 3) % 3;

/** Fire on a burning thing (unit or corpse): feet at (x, y) sim px, k = size (1 = a 9.5 px body). */
export function fireOn(x, y, k, rt, ph, withSmoke) {
  const f = SP.bit(fire, boil(rt * 1.4, ph));
  put(f, x, y + 1, 0.38 * k * (1 + 0.06 * Math.sin(rt * 9 + ph * 7)));
  if (withSmoke) put(SP.bit(curl, boil(rt, ph + 0.5)), x + 2 * k, y - 26 * k, 0.32 * k);
}
export function stunOn(x, y, k, rt, ph) { put(SP.bit(stars, boil(rt * 1.2, ph)), x, y, 0.75 * Math.max(0.7, k)); }
export function shadowAt(x, y, k, al) { ctx.globalAlpha = al; put(SP.bit(shadow, 0), x, y, k); ctx.globalAlpha = 1; }
export function rippleAt(x, y, k, rt, ph) { put(SP.bit(ripple, boil(rt * 0.6, ph) & 1), x, y, k * (1 + 0.05 * Math.sin(rt * 5 + ph * 5))); }

// Burning oil flames (cells from terrain.burningOil).
export function oilFires(buf, n, rt) {
  for (let k = 0; k < n; k++) { const x = buf[k * 3], y = buf[k * 3 + 1], s = buf[k * 3 + 2]; put(SP.bit(fire, boil(rt * 1.4, x * 0.031 + y * 0.017)), x, y + 2, 0.2 * s); }
}

// ---------------------------------------------------------------- projectiles
const FLAME_STAGE = (f) => f < 0.3 ? 0 : f < 0.65 ? 1 : 2;
// ground = true: only the kinds whose PROJ art says `ground: true` (lava, puddles, clouds on the floor: drawn before the units,
// index.js); false: every other kind (drawn over the units). OURS step 6.
export function drawProjectiles(world, alpha, rt, ground = false) {
  const list = world.projectiles;
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p || p.dead) continue;
    if (isGround(p.kind) !== ground) continue;
    const px = p.px ?? p.x, py = p.py ?? p.y, x = px + (p.x - px) * alpha, y = py + (p.y - py) * alpha;
    const ang = Math.atan2(p.vy || 0, p.vx || 0);
    switch (p.kind) {
      case 'bullet': {
        let z = 0;
        if (p.rise > 0) { const sp = Math.hypot(p.vx, p.vy); z = Math.max(0, p.rise - p.drop * sp * (p.maxLife - p.life)); }
        put(SP.bit(tracer, 0), x, y - 9 - z, p.trail > 0 ? 1.15 : 1, ang);
        break;
      }
      case 'flame': {
        const f = p.maxLife > 0 ? 1 - p.life / p.maxLife : 0, r = (3 + 7 * f) * (p.scale || 1); // grows 3 -> 10 px (OG game.js:10130-10132)
        const ph = (i * 0.37) % 1;
        const sp = Math.sqrt((p.vx || 0) * (p.vx || 0) + (p.vy || 0) * (p.vy || 0)), sc = r / 4.4, st = Math.max(1, Math.min(3.2, (sp * 0.045) / (r * 2.6)));
        const spr = SP.bit(flameB, FLAME_STAGE(f) * 2 + (boil(rt * 1.6, ph) & 1));
        if (spr) { const a2 = ang + (ph - 0.5) * 0.3, cs = Math.cos(a2), sn = Math.sin(a2), m = S / spr.k;
          ctx.setTransform(cs * m * sc * st, sn * m * sc * st, -sn * m * sc, cs * m * sc, x * S, (y - 8 - f * 4) * S);
          ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh); }
        break;
      }
      case 'arrow': {
        let z = 0;
        if (p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; z = 4 * p.apex * f * (1 - f); }
        const spr = p.team === 0 ? SP.bit(arrowR, 0) : p.team === 1 ? SP.bit(arrowB, 0) : SP.bit(arrowNeutral, 0);
        if (z > 3) shadowAt(x, y, 0.25, 0.6);
        put(spr, x, y - 10 - z, 0.85, ang);
        break;
      }
      case 'grenade': {
        const z = p.z > 0 ? p.z : 0;
        shadowAt(x, y, 0.22, 0.8);
        put(SP.bit(grenade, (rt * 10 | 0) & 1), x, y - 4 - z, 1.1, rt * 9 + i);
        break;
      }
      case 'plasma': put(SP.bit(plasma, boil(rt * 1.5, i * 0.3)), x, y - 10, 1 * (p.scale || 1), 0); break;
      case 'shuriken': put(SP.bit(shuriken, (rt * 12 | 0) & 1), x, y - 10, 0.9, rt * 25 + i); break;
      default: {
        const pa = projArt(p.kind);
        if (!pa) { put(SP.bit(tracer, 0), x, y - 9, 1, ang); break; }
        if (pa.src.draw && pa.src.draw(p, x, y, ang, rt, i, PROJ_API(pa))) break;
        const z = p.z > 0 ? p.z : 0, n = pa.handle.n;
        if (pa.src.shadow) shadowAt(x, y, pa.src.shadow, 0.8);
        const v = pa.src.boil ? (rt * 8 + i) % n | 0 : i % n;
        put(SP.bit(pa.handle, v), x, y - (pa.src.lift ?? 8) - z, 1, pa.src.spin ? rt * pa.src.spin + i : ang);
      }
    }
  }
}
// OURS (step 4): projectile art from sprite modules' PROJ export (sprites.js PROJ_SRC), baked as bits on first use.
const PROJ_ART = new Map(), GROUNDK = new Map();
function isGround(kind) { let g = GROUNDK.get(kind); if (g === undefined) { const src = SP.PROJ_SRC[kind]; g = !!(src && src.ground); GROUNDK.set(kind, g); } return g; }
function projArt(kind) {
  let a = PROJ_ART.get(kind);
  if (a !== undefined) return a;
  const src = SP.PROJ_SRC[kind];
  a = src && src.box && src.paint ? { src, handle: SP.defineBit('proj:' + kind, src.n || 2, src.box, src.paint, { scale: src.scale || 1 }) } : null;
  PROJ_ART.set(kind, a);
  return a;
}
const _api = { put: (s, x, y, k, a) => put(s, x, y, k, a), bit: (h, v) => SP.bit(h, v), shadowAt: (x, y, k, al) => shadowAt(x, y, k, al), sprite: null, ctx: null, S: 1 };
function PROJ_API(pa) { _api.sprite = pa.handle; _api.ctx = ctx; _api.S = S; return _api; }

// ---------------------------------------------------------------- pooled effects
const PUFFB = [dust, smoke, steam, splash, leaf, gas];
export function drawEffects(rt) {
  if (!live) return;
  for (let i = 0; i < CAP; i++) {
    const k = fk[i];
    if (!k) continue;
    const age = now - ft0[i], life = fl[i];
    if (age < 0 || age >= life) { if (age >= life) fk[i] = 0; continue; }
    const q = age / life, x = fx0[i], y = fy0[i], s = fs[i];
    switch (k) {
      case K.boom: {
        const plasmaB = fv[i] >= 100, v = fv[i] % 100;
        if (q < 0.42) {
          const g = q < 0.05 ? 0.35 + q / 0.05 * 0.75 : q < 0.3 ? 1.1 - (q - 0.05) * 0.4 : (1 - (q - 0.3) / 0.12);
          put(SP.bit(plasmaB ? boomP : boom, plasmaB ? v % 2 : boil(rt, v)), x, y - 10 * s, Math.max(0.05, g) * s * (1 + 0.03 * Math.sin(rt * 30)));
        }
        if (q > 0.3 && q < 0.95) for (let n = 0; n < 3; n++) {
          const qq = clamp((q - 0.3) / 0.65, 0, 1), sc = (qq < 0.25 ? qq / 0.25 : 1 - (qq - 0.25) / 0.75) * (0.8 + n * 0.15) * Math.min(1.4, s);
          if (sc > 0.04) put(SP.bit(curl, (n + boil(rt, v)) % 3), x - 16 * s + n * 14 * s, y + 2 - qq * 22 * s, sc);
        }
        break;
      }
      case K.flash: put(SP.bit(flash, fv[i] % 3), x, y, s * (1 - q * 0.3), fa[i]); break;
      case K.puff: {
        const kind = fv[i] >> 2, v = fv[i] & 3, b = PUFFB[kind];
        const grow = kind === PUFF.leaf ? 1 : 0.6 + 0.8 * Math.sqrt(q);
        const al = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
        ctx.globalAlpha = al;
        const xx = x + fvx[i] * age, yy = y + fvy[i] * age + (kind === PUFF.leaf ? 26 * age * age : 0);
        put(SP.bit(b, v % b.n), xx, yy, s * grow, kind === PUFF.leaf ? fa[i] + age * 5 : 0);
        ctx.globalAlpha = 1;
        break;
      }
      case K.drop: {
        const zz = Math.max(0, fz[i] + fvz[i] * age - 450 * age * age);
        put(SP.bit(drop, fv[i] % drop.n), x + fvx[i] * age, y + fvy[i] * age - zz, s * (1 - q * 0.4));
        break;
      }
      case K.spark: put(SP.bit(sparkB, fv[i] & 1), x, y, s * (1 + q), fa[i]); break;
      case K.hat: {
        let zz = fz[i] + fvz[i] * age - 450 * age * age, t = age;
        if (zz < 0) { // landed: stop where it hit the ground
          const tl = (fvz[i] + Math.sqrt(Math.max(0, fvz[i] * fvz[i] + 1800 * fz[i]))) / 900; t = tl; zz = 0;
        }
        const al = q > 0.8 ? 1 - (q - 0.8) / 0.2 : 1;
        ctx.globalAlpha = al;
        put(SP.bit(fbit[i], 0), x + fvx[i] * t, y + fvy[i] * t - zz - 3 * s, s, fa[i] * t);
        ctx.globalAlpha = 1;
        break;
      }
      case K.slash: { ctx.globalAlpha = 1 - q; put(SP.bit(slash, 0), x, y, s * (0.8 + q * 0.5), fa[i]); ctx.globalAlpha = 1; break; }
      case K.pow: put(SP.bit(pow, fv[i] & 1), x, y, s * (0.6 + q * 0.7), fa[i]); break;
      case K.bolt: {
        const dx = fx1[i] - x, dy = fy1[i] - y, L = Math.hypot(dx, dy) || 1, spr = SP.bit(bolt, ((fv[i] + (rt * 20 | 0)) % 3));
        if (spr) { const m = S / spr.k, cs = dx / L, sn = dy / L, sx = L / 100;
          ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m, cs * m, x * S, y * S);
          ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh); }
        break;
      }
      case K.sparkle: { ctx.globalAlpha = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3; put(SP.bit(sparkle, fv[i] % 6), x, y - q * 10, s * (0.8 + q * 0.5), q * 1.5); ctx.globalAlpha = 1; break; }
      case K.shard: {
        const zz = Math.max(0, fz[i] + fvz[i] * age - 450 * age * age);
        put(SP.bit(shard, fv[i] % 3), x + fvx[i] * age, y + fvy[i] * age - zz, s, fa[i] + age * 8);
        break;
      }
      case K.ring: { ctx.globalAlpha = 1 - q; put(SP.bit(ringB, fv[i] & 1), x, y, s * (0.5 + q * 0.8)); ctx.globalAlpha = 1; break; }
      case K.splash: put(SP.bit(splash, fv[i] % 3), x, y, s * (0.7 + q * 0.6) * (q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1)); break;
      case K.fireburst: put(SP.bit(fire, fv[i] % 3), x, y, 0.3 * s * (q < 0.4 ? q / 0.4 : 1 - (q - 0.4) / 0.6 * 0.5)); break;
      default: fk[i] = 0;
    }
  }
}

// ---------------------------------------------------------------- steam / smoke clouds from the sim
export function drawSteam(world, rt) {
  const st = world.steam;
  if (!st || !(st.count > 0)) return;
  const t = world.time || 0;
  for (let k = 0; k < st.count; k++) {
    const th = typeof st.thickness === 'function' ? st.thickness(k, t) : 1;
    if (!(th > 0.02)) continue;
    const r = st.radius[k], x = st.x[k], y = st.y[k];
    ctx.globalAlpha = Math.min(0.85, th * 0.9);
    const ph = (k * 0.37) % 1;
    for (let n = 0; n < 3; n++) {
      const a = n / 3 * TAU + rt * 0.3 + ph * 6, d = r * 0.35;
      put(SP.bit(steam, (n + boil(rt * 0.25, ph)) % 3), x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - r * 0.2, r / 14, 0);
    }
  }
  ctx.globalAlpha = 1;
}
export { DC, drops, putNR };
/** Leaves painted over a unit perched in a tree. */
export function leavesOn(x, y, k, ph) { put(SP.bit(leafClump, (ph * 3 | 0) % 3), x, y, k); }
