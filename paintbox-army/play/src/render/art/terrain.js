// Terrain in the POSTER PAINT look. Owner: RENDER.
// - Walls, water (shallow / deep) and ice live on ONE cached device-px layer. When a grid version moves, the 8 px grids
//   are diffed against shadow copies and only the changed box (plus a margin) is cleared and repainted under a clip,
//   so painting a wall or water stroke stays smooth. Nothing on this layer is painted stroke by stroke at run time:
//   bricks, faces, cracks, swirls and wave flicks are atlas bits; water and ice bodies are one path fill each with a
//   painted pattern (circles on the edge tiles give the wobbly kid outline, rects inside).
//     wall  = grey painted bricks in running bond, ink outlines, a darker front face under the bottom edge (height),
//             cracks once a tile is under 60 hp;
//     water = black outline, pale-blue shallow rim, deep-blue middle with swirls and white wave flicks;
//     ice   = thin ink outline, pale ice with white streaks, cracks at hp <= 0.8 (OG crack steps 0.8 / 0.4).
// - Oil: its own small layer, repainted inside the slick's box when the oil grid changes; burning cells get flames (fx).
// - Mines (armed / unarmed, armed ones blink), banana peels and arrows stuck in the ground: atlas bits every frame.
import { C, TAU, rng, hash, brush, ring, fill, outline, part, poly, shift, dab, tone, tube, canvas as cpuCanvas, tooth, M0 } from './paint.js';
import * as SP from './sprites.js';
import { layerCanvas, touched } from './gpu.js';
import * as T7 from './terrain7.js'; export { toolColor7 } from './terrain7.js';   // STEP7 TERRAIN-ART: lava, mud, bridge, trampoline
import { wallStyle } from './ground.js';   // STEP7 GROUND-ART: wall look per map ground (sand rocks, snowy stones, canyon rock, basalt, logs)

const WET = 0.05, DEEP = 0.75;   // OG game.js:9554-9557
const T8 = 8;                     // wall / water / ice tile (OG game.js:8669)

// ---------------------------------------------------------------- bits
const BRICK = [C.grey, C.greyL, tone(C.grey, 0.12), C.greyD, C.greyL, tone(C.greyL, 0.08)];
const brick = SP.defineBit('brick', 8, [20, 13, 2, 2], (c, R, v, M) => {
  const pts = poly([[0.5, 0.4], [15.6, 0.3], [15.7, 7.6], [0.4, 7.7]], R, 0.5);
  fill(c, shift(pts, M.mx * 0.5, M.my * 0.5, 0.3), BRICK[v % BRICK.length], R, { vary: 0.1, sp: 0.9 });
  outline(c, pts, R, 1.15, { jit: 0.3 });
});
const half = SP.defineBit('halfbrick', 4, [12, 13, 2, 2], (c, R, v, M) => {
  const pts = poly([[0.5, 0.4], [7.6, 0.3], [7.7, 7.6], [0.4, 7.7]], R, 0.4);
  fill(c, shift(pts, M.mx * 0.5, M.my * 0.5, 0.3), BRICK[(v * 2 + 1) % BRICK.length], R, { vary: 0.1, sp: 0.9 });
  outline(c, pts, R, 1.1, { jit: 0.25 });
});
const face = SP.defineBit('wallface', 4, [12, 11, 2, 2], (c, R, v) => {
  const pts = poly([[0.1, -0.6], [8.1, -0.6], [8.1, 5.2], [0.1, 5.4]], R, 0.25);
  fill(c, pts, v & 1 ? C.greyD : tone(C.greyD, -0.12), R, { vary: 0.08, sp: 0.8, edge: 0 });
  if (v < 2) brush(c, [[3.6 + v, 0.2], [3.8 + v, 5]], 0.7, C.ink, R, { bristles: 1, dry: 0.1 });
  brush(c, [[-0.4, 5.4], [8.6, 5.3]], 1.3, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.1 });
}, { tooth: false });
const crack = SP.defineBit('wallcrack', 3, [10, 10, 1, 1], (c, R) => {
  const x = 1.5 + R() * 2, pts = [[x, 0.8], [x + 1.6, 2.6], [x + 0.6, 4.2], [x + 2.6, 6], [x + 2, 7.4]];
  brush(c, pts, 0.7, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.4 });
  brush(c, [[x + 0.6, 4.2], [x - 1, 5.2]], 0.55, C.ink, R, { bristles: 1, dry: 0.2 });
}, { tooth: false });
const swirl = SP.defineBit('swirl', 3, [44, 30, 22, 15], (c, R) => {
  for (let i = 0; i < 3; i++) {
    const pts = [], r0 = 0.2 + i * 0.28, ph = R() * TAU;
    for (let j = 0; j <= 9; j++) { const a = ph + j / 9 * TAU * 0.8, rr = r0 + j * 0.03; pts.push([Math.cos(a) * 20 * rr, Math.sin(a) * 12 * rr]); }
    brush(c, pts, 2.6, i % 2 ? C.pondL : C.pondD, R, { dry: 0.5, taper: 0.5, bristles: 4 });
  }
}, { tooth: false });
const wave = SP.defineBit('wave', 3, [14, 6, 7, 3], (c, R) => {
  brush(c, [[-4.5, 0], [-1.5, -2], [1.5, 0], [4.5, -2]], 1.25, '#ffffff', R, { bristles: 2, dry: 0, taper: 0.3 });
}, { tooth: false });
const icecrack = SP.defineBit('icecrack', 4, [14, 14, 7, 7], (c, R, v) => {
  const n = 3 + (v & 1);
  for (let i = 0; i < n; i++) { const a = i / n * TAU + R(), l = 3 + R() * 4; brush(c, [[0, 0], [Math.cos(a) * l * 0.5 + (R() - 0.5), Math.sin(a) * l * 0.5], [Math.cos(a) * l, Math.sin(a) * l]], 0.6, '#5b7fa6', R, { bristles: 1, dry: 0.1, taper: 0.5 }); }
}, { tooth: false });
const mineB = SP.defineBit('mine', 3, [22, 16, 11, 11], (c, R, v, M) => {
  // v: 0 unarmed, 1 armed (light on), 2 armed (light off)
  part(c, [[-7.4, 0.6], [-6.6, -3.4], [-3, -5.6], [3, -5.6], [6.6, -3.4], [7.4, 0.6], [0, 2.2]], C.greyD, M, { lw: 1.3 });
  brush(c, [[-6.2, -1.6], [-2, -3], [2.4, -3], [5.8, -1.6]], 0.8, tone(C.greyD, 0.3), R, { bristles: 2, dry: 0.4 });
  const lit = v === 1;
  dab(c, 0, -6.2, 2.1, C.ink, R); dab(c, 0, -6.4, 1.4, v === 0 ? '#7a2018' : lit ? '#ff3b20' : '#9a2a1c', R);
  if (lit) { dab(c, -0.5, -6.9, 0.5, '#fff3c0', R); for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.6; brush(c, [[Math.cos(a) * 3.2, -6.4 + Math.sin(a) * 3.2], [Math.cos(a) * 5, -6.4 + Math.sin(a) * 5]], 0.8, C.yellow, R, { bristles: 1, dry: 0 }); } }
});
// Banana peel = the classic cartoon peel (user's reference screenshot, 11-14): the empty peel stands up tall and bends
// over at the top with a small dark stem nub; floppy strips lie spread on the ground left, right and in front, pale
// insides showing near the base, tips curling up. Anchor = the base on the ground. Drawn upright, mirrored by heading.
const P_YEL = '#ffd51e', P_YELD = '#e6b414', P_CREAM = '#fbf3d2', P_NUB = '#33261a';
function peelFlap(c, R, M, x, y, dir, l, w, lift) {
  const P = (t, s) => [x + dir * l * t, y + 0.72 * Math.sin(t * Math.PI) - lift * t * t * t + s];
  const half = t => w * 0.5 * (1 - 0.62 * t * t);
  const top = [], bot = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; top.push(P(t, -half(t))); bot.push(P(t, half(t) * 0.7)); }
  part(c, top.concat([P(1.05, -0.2)], bot.reverse()), P_YEL, M, { lw: 1.3 });
  const q = []; for (let i = 0; i <= 4; i++) { const t = 0.04 + i / 4 * 0.55; q.push(P(t, -half(t) * 0.75)); } for (let i = 4; i >= 0; i--) { const t = 0.04 + i / 4 * 0.55; q.push(P(t, -half(t) * 0.05)); }
  fill(c, q, P_CREAM, R, { vary: 0.04, edge: 0, sp: 0.6 });
  brush(c, [P(0.15, half(0.15) * 0.35), P(0.85, half(0.85) * 0.2)], 0.8, P_YELD, R, { bristles: 2, dry: 0.4, taper: 0.6 });
}
export const PEEL_SCALE = 0.95;
const peelB = SP.defineBit('peel', 3, [44, 38, 22, 29], (c, R, v, M) => {
  const j = (v - 1) * 0.4;
  // back flap peeking out behind
  part(c, poly([[1, -1.2], [6, -3.6], [11.5 + j, -5.2], [13.4 + j, -6.6], [12.6 + j, -4], [7, -0.6], [2, 0.4]], R, 0.15), P_YELD, M, { lw: 1.2 });
  // the side flaps lying flat
  peelFlap(c, R, M, -2.6, 0.6, -1, 15.5 + j, 5.6, 3.4);
  peelFlap(c, R, M, 2.6, 0.8, 1, 14.5 - j, 5.4, 3);
  // the standing body, bending over to the right at the top
  part(c, poly([[-4.6, 1.2], [-5, -5], [-4.4, -11], [-2.6, -16.4], [0, -20], [2.6, -22.2], [4.4, -22.4], [4.6, -21], [3, -18.6], [1.8, -14.6], [2.2, -9], [3.6, -4], [4.6, 1.4]], R, 0.12), P_YEL, M, { lw: 1.5 });
  brush(c, [[3, 0], [2, -6], [1.2, -12], [1.6, -17.6], [3.4, -20.8]], 1.6, P_YELD, R, { bristles: 3, dry: 0.3, taper: 0.5 });
  brush(c, [[-3, -1], [-3.2, -7], [-2.2, -13], [-0.4, -17]], 1.1, '#fff3b0', R, { bristles: 2, dry: 0.4, taper: 0.6 });
  for (let i = 0; i < 3; i++) dab(c, -2 + R() * 4, -3 - R() * 12, 0.45, '#6b4a22', R);
  // the stem nub on top
  tube(c, [[3.8, -22], [5.2, -23.4], [6.6, -24]], 1.6, '#7a6a2a', R, 0.9);
  dab(c, 6.8, -24, 1.1, P_NUB, R);
  // the open mouth at the base + the front flap flopped toward us
  part(c, ring(0, 0.6, 3.6, 1.6, R, 0.1, 8), P_CREAM, M, { lw: 1 });
  part(c, poly([[-2.8, 0.8], [-4.6, 3.4], [-6.4, 5.6], [-8.4, 6.6], [-7.2, 5], [-5.4, 2.4], [-3.4, 1.8], [-0.6, 3.6], [1.6, 2.2], [2, 0.8]], R, 0.12), P_YEL, M, { lw: 1.3 });
  brush(c, [[-1, 1.6], [-4, 2.2], [-6.6, 5]], 0.9, P_CREAM, R, { bristles: 2, dry: 0.3, taper: 0.6 });
});
export const arrowNeutral = SP.defineBit('arrowN', 1, [24, 10, 12, 5], (c, R) => {
  brush(c, [[-8, 0], [6, 0]], 1.1, C.brown, R, { bristles: 2, dry: 0, taper: 0 });
  fill(c, [[9.4, 0], [5, -2.6], [5.6, 0], [5, 2.6]], C.ink, R, { sharp: true, edge: 0 });
  brush(c, [[-6, 0], [-9.4, -2.8]], 1.5, C.white, R, { bristles: 2, dry: 0 }); brush(c, [[-6, 0], [-9.4, 2.8]], 1.5, C.white, R, { bristles: 2, dry: 0 });
  brush(c, [[-6.2, -0.2], [-9.4, -2.9]], 0.4, C.ink, R, { bristles: 1, dry: 0 }); brush(c, [[-6.2, 0.2], [-9.4, 2.9]], 0.4, C.ink, R, { bristles: 1, dry: 0 });
}, { tooth: false });
const glossB = SP.defineBit('gloss', 3, [12, 8, 6, 4], (c, R) => {
  brush(c, [[-3.4, 0.6], [0, -0.6], [3, 0.2]], 1.3, '#6d6a78', R, { bristles: 2, dry: 0.3 });
  dab(c, 2.4, -0.6, 0.6, '#d8d4e8', R);
}, { tooth: false });
export function prewarm() { SP.wantBits(brick, half, face, crack, swirl, wave, icecrack, mineB, peelB, arrowNeutral, glossB); T7.prewarm7(); }   // STEP7 TERRAIN-ART: + prewarm7

// ---------------------------------------------------------------- pattern tiles (CPU canvases at device px)
const PT = 96; // sim px
function tileOf(S, seed, base, strokes) {
  const n = Math.round(PT * S), cv = cpuCanvas(n, n), c = cv.getContext('2d', { willReadFrequently: true }), k = n / PT;
  c.setTransform(k, 0, 0, k, 0, 0); c.fillStyle = base; c.fillRect(0, 0, PT, PT);
  const R = rng(seed);
  for (const [col, w, count, ang, dry] of strokes) for (let i = 0; i < count; i++) {
    const x = R() * PT, y = R() * PT, l = 20 + R() * 40, a = ang + (R() - 0.5) * 0.4, ca = Math.cos(a), sa = Math.sin(a);
    const pts = [[x - ca * l / 2, y - sa * l / 2], [x + (R() - 0.5) * 2, y + (R() - 0.5) * 2], [x + ca * l / 2, y + sa * l / 2]];
    const s = (R() * 4294967296) >>> 0;
    for (const dx of [-PT, 0, PT]) for (const dy of [-PT, 0, PT]) {
      if (x + dx + l < -4 || x + dx - l > PT + 4 || y + dy + l < -4 || y + dy - l > PT + 4) continue;
      c.save(); c.translate(dx, dy); brush(c, pts, w, col, rng(s), { dry, taper: 0.4, vary: 0.08 }); c.restore();
    }
  }
  tooth(c, 0, 0, PT, PT, seed + 1, 0.2);
  return cv;
}
let tilesS = 0, shallowT = null, deepT = null, iceT = null, oilT = null;
function ensureTiles(S) {
  if (tilesS === S) return;
  tilesS = S;
  shallowT = tileOf(S, 501, '#5aa4ee', [[C.pondL, 4, 10, 0.1, 0.5], ['#4b97ea', 5, 12, 0.15, 0.6]]);
  deepT = tileOf(S, 502, '#3584e0', [[C.pondD, 5, 16, 0.08, 0.5], ['#2f7bd9', 5, 12, -0.1, 0.5], [tone(C.pondL, -0.1), 2.2, 4, 0.1, 0.6]]);
  iceT = tileOf(S, 503, '#d3edfa', [['#ffffff', 3.4, 20, -0.6, 0.5], ['#b4dcf3', 2.6, 12, -0.6, 0.6], ['#f2faff', 6, 6, 0.2, 0.7]]);
  oilT = tileOf(S, 504, '#2b2421', [['#3a302c', 4, 12, 0.3, 0.5], ['#46393a', 2.4, 6, 0.2, 0.6]]);
}

// ---------------------------------------------------------------- the cached layer
let tcv = null, tg = null, cw = 0, ch = 0, lS = 0;
let cols = 0, rows = 0;
let sSolid = null, sHp = null, sLev = null, sIce = null;      // shadow copies (buckets)
let vWall = -1, vDmg = -1, vWater = -1, vIce = -1, vWC = -1, vIC = -1, vRef = null;
let bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;                       // content box in tiles (empty when x0 > x1)
const wallsOf = (world) => world.walls && world.walls.solid ? world.walls : null;
const hpBucket = (h) => h <= 0 ? 0 : h < 30 ? 3 : h < 60 ? 2 : 1;
const levBucket = (l) => l >= DEEP ? 2 : l >= WET ? 1 : 0;
const iceBucket = (h) => h <= 0 ? 0 : h <= 0.4 ? 3 : h <= 0.8 ? 2 : 1;
const th = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// smooth value noise 0..1 (a hand's wobble along an edge, ~40 px wavelength)
function vnoise(x, y) {
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => th(((a & 0xffff) | ((b & 0xffff) << 16)) >>> 0, 77);
  const a0 = h(X, Y) + (h(X + 1, Y) - h(X, Y)) * sx, a1 = h(X, Y + 1) + (h(X + 1, Y + 1) - h(X, Y + 1)) * sx;
  return a0 + (a1 - a0) * sy;
}

export function reset() { vRef = null; T7.reset7(); }   // STEP7 TERRAIN-ART: + reset7
let wallGr = '', wallSt = null;   // STEP7 GROUND-ART: the ground the walls were laid for + its wall bits (null = bricks)
function layerFor(w, h, S) {
  if (!tcv) { tcv = layerCanvas(); tg = tcv.getContext('2d'); }
  if (cw !== w || ch !== h || lS !== S) { tcv.width = cw = w; tcv.height = ch = h; lS = S; vRef = null; }
}
/** Bring the layer up to date. Returns true when it has content. */
function update(world, S) {
  const wl = wallsOf(world);
  if (!wl) return false;
  T7.pumpSpread(S);   // STEP7 TERRAIN-ART: paint queued strips of a big repaint (a few ms a frame)
  const n = wl.cols * wl.rows, water = world.water && world.water.length === n ? world.water : null, ice = world.ice && world.ice.length === n ? world.ice : null;
  const T = world.terrain;
  const wv = T ? T.waterVersion : 0, iv = T ? T.iceVersion : 0;
  const gr = world.map ? world.map.ground : '';   // STEP7 GROUND-ART
  const full = vRef !== world || cols !== wl.cols || rows !== wl.rows || !sSolid || gr !== wallGr;   // STEP7 GROUND-ART: + a new ground re-lays it all
  if (!full && wl.version === vWall && wl.damageVersion === vDmg && wv === vWater && iv === vIce && world.waterCells === vWC && world.iceCells === vIC) return bx0 <= bx1;
  vRef = world; vWall = wl.version; vDmg = wl.damageVersion; vWater = wv; vIce = iv; vWC = world.waterCells; vIC = world.iceCells;
  if (gr !== wallGr) { wallGr = gr; wallSt = wallStyle(gr); }   // STEP7 GROUND-ART
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  if (full) {
    cols = wl.cols; rows = wl.rows;
    sSolid = new Uint8Array(n); sHp = new Uint8Array(n); sLev = new Uint8Array(n); sIce = new Uint8Array(n);
    x0 = 0; y0 = 0; x1 = cols - 1; y1 = rows - 1;
  }
  // diff into the shadows; track the changed box and the content box
  let cx0 = 1e9, cy0 = 1e9, cx1 = -1, cy1 = -1;
  const solid = wl.solid, hp = wl.hp;
  for (let i = 0; i < n; i++) {
    const s = solid[i], hb = s ? hpBucket(hp[i]) : 0, lb = water ? levBucket(water[i]) : 0, ib = ice ? iceBucket(ice[i]) : 0;
    if (s | lb | ib) { const x = i % cols, y = (i - x) / cols; if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
    if (s !== sSolid[i] || hb !== sHp[i] || lb !== sLev[i] || ib !== sIce[i]) {
      sSolid[i] = s; sHp[i] = hb; sLev[i] = lb; sIce[i] = ib;
      if (!full) { const x = i % cols, y = (i - x) / cols; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  bx0 = cx0; by0 = cy0; bx1 = cx1; by1 = cy1;
  if (x1 >= x0) T7.spread(repaint, x0 - 3, y0 - 3, x1 + 3, y1 + 3, full, S, cols, rows, cx0, cy0, cx1, cy1);   // STEP7 TERRAIN-ART: a big repaint (map load, Clear) paints in over a few frames; a stroke at once
  return bx0 <= bx1;
}
// Repaint tiles [x0..x1] x [y0..y1] (clamped), clipped to that box.
function repaint(x0, y0, x1, y1, S) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(cols - 1, x1); y1 = Math.min(rows - 1, y1);
  ensureTiles(S);
  const g = tg;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const X0 = Math.floor(x0 * T8 * S), Y0 = Math.floor(y0 * T8 * S), X1 = Math.ceil((x1 + 1) * T8 * S), Y1 = Math.ceil((y1 + 1) * T8 * S);
  g.save();
  g.beginPath(); g.rect(X0, Y0, X1 - X0, Y1 - Y0); g.clip();
  g.clearRect(X0, Y0, X1 - X0, Y1 - Y0);
  // tiles touched by shapes that reach into the box
  const a0 = Math.max(0, x0 - 2), b0 = Math.max(0, y0 - 2), a1 = Math.min(cols - 1, x1 + 2), b1 = Math.min(rows - 1, y1 + 2);
  body(g, S, sLev, 1, a0, b0, a1, b1, 8.4, C.ink, 0, 0);                              // water outline
  body(g, S, sLev, 1, a0, b0, a1, b1, 6.7, g.createPattern(shallowT, 'repeat'), 0.8, 0.7); // shallow rim (misses the line)
  body(g, S, sLev, 2, a0, b0, a1, b1, 7.4, g.createPattern(deepT, 'repeat'), 0.8, 0.7);    // deep middle
  waterMarks(g, S, a0, b0, a1, b1);
  body(g, S, sIce, 1, a0, b0, a1, b1, 8.0, C.ink, 0, 0);                              // ice outline
  body(g, S, sIce, 1, a0, b0, a1, b1, 6.7, g.createPattern(iceT, 'repeat'), 0.6, 0.5);
  iceMarks(g, S, a0, b0, a1, b1);
  walls(g, S, a0, b0, a1, b1);
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
  T7.touchBands(tcv, X0, Y0, X1 - X0, Y1 - Y0);   // STEP7 TERRAIN-ART: a big rect goes as bands (gl2d copies each with getImageData, not the whole canvas)
}
// One painted body: tiles with grid[i] >= min. Edge tiles get a jittered circle, inside tiles a rect. One fill.
function circ(g, x, y, r) { const rr = r + 5.2 * (vnoise(x / 26, y / 26) - 0.5) + 2.4 * (vnoise(x / 9 + 17, y / 9 + 5) - 0.5); g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU); }
function body(g, S, grid, min, a0, b0, a1, b1, r, style, ox, oy) {
  g.setTransform(S, 0, 0, S, ox * S, oy * S);
  // STEP7 TERRAIN-ART: the same wobbly-circle outline, built cheaper (1 circle per edge tile, inside tiles as row runs; the
  // ink outlines edge tiles only, the fills cover the rest): map loads paint ~4x faster (swamp, lake, beach water).
  const any = T7.bodyPath(g, grid, cols, rows, min, a0, b0, a1, b1, r, style === C.ink);
  if (!any) return;
  if (typeof style !== 'string' && style.setTransform) style.setTransform(new DOMMatrix([1 / S, 0, 0, 1 / S, -ox, -oy])); // pattern in device px
  g.fillStyle = style; g.fill();
}
function put(g, spr, x, y, sc, rot, S, flip = 1) {
  const m = sc * S / spr.k, cs = Math.cos(rot) * m, sn = Math.sin(rot) * m;
  g.setTransform(cs * flip, sn * flip, -sn, cs, x * S, y * S);
  g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
const deepAt = (x, y) => { const tx = Math.floor(x / T8), ty = Math.floor(y / T8); return tx >= 0 && ty >= 0 && tx < cols && ty < rows && sLev[ty * cols + tx] === 2 && sIce[ty * cols + tx] === 0; };
function waterMarks(g, S, a0, b0, a1, b1) {
  // swirls on a 48 px lattice, wave flicks on a 26 px lattice, only where the whole mark sits on open deep water
  const X0 = a0 * T8 - 48, Y0 = b0 * T8 - 48, X1 = (a1 + 1) * T8 + 48, Y1 = (b1 + 1) * T8 + 48;
  for (let ly = Math.floor(Y0 / 40); ly <= Math.ceil(Y1 / 40); ly++) for (let lx = Math.floor(X0 / 56); lx <= Math.ceil(X1 / 56); lx++) {
    const h = th(lx * 7919 + ly, 11), x = (lx + 0.5) * 56 + (h - 0.5) * 16, y = (ly + 0.5) * 40 + (th(lx, ly) - 0.5) * 10;
    if (h < 0.25 || !deepAt(x, y) || !deepAt(x - 20, y) || !deepAt(x + 20, y) || !deepAt(x, y - 12) || !deepAt(x, y + 12)) continue;
    put(g, SP.bit(swirl, (h * 30 | 0) % 3), x, y, 0.8 + h * 0.4, (h - 0.5) * 0.6, S);
  }
  for (let ly = Math.floor(Y0 / 22); ly <= Math.ceil(Y1 / 22); ly++) for (let lx = Math.floor(X0 / 26); lx <= Math.ceil(X1 / 26); lx++) {
    const h = th(lx * 104729 + ly, 13);
    if (h > 0.4) continue;
    const x = (lx + 0.5) * 26 + (h - 0.2) * 20, y = (ly + 0.5) * 22 + (th(ly, lx) - 0.5) * 8;
    if (!deepAt(x - 6, y) || !deepAt(x + 6, y)) continue;
    put(g, SP.bit(wave, (h * 70 | 0) % 3), x, y, 1, 0, S);
  }
}
function iceMarks(g, S, a0, b0, a1, b1) {
  for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
    const i = y * cols + x, b = sIce[i];
    if (b < 2) continue;
    if (b === 2 && th(i, 5) > 0.45) continue;
    put(g, SP.bit(icecrack, (th(i, 6) * 4) | 0), (x + 0.5) * T8, (y + 0.5) * T8, b === 3 ? 1.1 : 0.8, th(i, 7) * TAU, S);
  }
}
function walls(g, S, a0, b0, a1, b1) {
  const WS = wallSt, bF = WS ? WS.full : brick, bH = WS ? WS.half : half, bFc = WS ? WS.face : face, bCap = WS ? WS.cap : null;   // STEP7 GROUND-ART: the ground's wall bits (grass: these bricks, same counts)
  for (let y = b0; y <= b1; y++) {
    for (let x = Math.max(0, a0 - 1); x <= a1; x++) {
      const i = y * cols + x;
      if (!sSolid[i]) continue;
      const left = ((x + (y & 1)) & 1) === 0;
      if (left) {
        if (x + 1 < cols && sSolid[i + 1]) put(g, SP.bit(bF, (th(i, 1) * bF.n) | 0), x * T8, y * T8, 1, 0, S);   // STEP7 GROUND-ART: bF / bH
        else put(g, SP.bit(bH, (th(i, 2) * bH.n) | 0), x * T8, y * T8, 1, 0, S);
      } else if (!(x > 0 && sSolid[i - 1])) put(g, SP.bit(bH, (th(i, 2) * bH.n) | 0), x * T8, y * T8, 1, 0, S);
    }
    for (let x = a0; x <= a1; x++) {
      const i = y * cols + x;
      if (!sSolid[i]) continue;
      if (sHp[i] >= 2 && (sHp[i] === 3 || th(i, 9) < 0.6)) put(g, SP.bit(crack, (th(i, 4) * 3) | 0), x * T8, y * T8, 1, 0, S);
      if (y === rows - 1 || !sSolid[i + cols]) put(g, SP.bit(bFc, (th(i, 8) * bFc.n) | 0), x * T8, (y + 1) * T8, 1, 0, S);   // STEP7 GROUND-ART: bFc
      if (bCap && (y === 0 || !sSolid[i - cols])) put(g, SP.bit(bCap, (th(i, 3) * bCap.n) | 0), x * T8, y * T8, 1, 0, S);   // STEP7 GROUND-ART: snow caps
    }
  }
}

// ---------------------------------------------------------------- oil layer
let ocv = null, og = null, ow = 0, oh = 0, oS = 0, oVer = -1, oTick = -1, oRef = null, oBox = [1, 1, 0, 0];
function oilLayer(world, w, h, S, frame) {
  const o = world.oil;
  if (!o || !o.amount || !(o.present > 0 || o.cells > 0)) return null;
  if (!ocv) { ocv = layerCanvas(); og = ocv.getContext('2d'); }
  if (ow !== w || oh !== h || oS !== S || oRef !== o) { ocv.width = ow = w; ocv.height = oh = h; oS = S; oVer = -1; oRef = o; oBox = [1, 1, 0, 0]; }
  if (o.version === oVer && (frame - oTick < 6 || o.present === 0)) return oBox[0] <= oBox[2] ? ocv : null;
  // Flowing or burning oil is a new version every tick, and each repaint redraws the whole slick (thousands of dabs) and
  // re-uploads its box: a wide slick on fire cost 30-60 ms a frame on desktop (attack 11-16, L4). Repaint it at most every
  // 4th frame then (15 a second; its flames are drawn every frame on their own). A slick that went away clears at once.
  if (o.version !== oVer && frame - oTick < 4 && o.present > 0 && oBox[0] <= oBox[2]) return ocv;
  oVer = o.version; oTick = frame;
  ensureTiles(S);
  const t = o.tile, i0 = Math.max(0, o.x0 - 1), i1 = Math.min(o.cols - 1, o.x1 + 1), j0 = Math.max(0, o.y0 - 1), j1 = Math.min(o.rows - 1, o.y1 + 1);
  og.setTransform(1, 0, 0, 1, 0, 0);
  // clear the old box and the new one
  const nb = [i0 * t - 8, j0 * t - 8, (i1 + 1) * t + 8, (j1 + 1) * t + 8];
  if (oBox[0] <= oBox[2]) og.clearRect(oBox[0] * S, oBox[1] * S, (oBox[2] - oBox[0]) * S, (oBox[3] - oBox[1]) * S);
  og.clearRect(nb[0] * S, nb[1] * S, (nb[2] - nb[0]) * S, (nb[3] - nb[1]) * S);
  if (oBox[0] <= oBox[2]) touched(ocv, oBox[0] * S, oBox[1] * S, (oBox[2] - oBox[0]) * S, (oBox[3] - oBox[1]) * S);
  touched(ocv, nb[0] * S, nb[1] * S, (nb[2] - nb[0]) * S, (nb[3] - nb[1]) * S);
  if (i0 > i1) { oBox = [1, 1, 0, 0]; return null; }
  oBox = nb;
  const a = o.amount;
  for (let pass = 0; pass < 2; pass++) {
    og.setTransform(S, 0, 0, S, pass ? 0.5 * S : 0, pass ? 0.4 * S : 0);
    og.beginPath(); let any = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * o.cols + i; if (a[c] < 0.08) continue; // slick at >= 0.08 (OG game.js:13122)
      const r = (pass ? 3.9 : 4.9) + Math.min(1.2, a[c]) * 0.8 + th(c, 21) * 0.6, x = (i + 0.5) * t, y = (j + 0.5) * t;
      og.moveTo(x + r, y); og.arc(x, y, r, 0, TAU); any = true;
    }
    if (!any) { oBox = [1, 1, 0, 0]; return null; }
    og.fillStyle = pass ? og.createPattern(oilT, 'repeat') : C.ink;
    if (pass) og.fillStyle.setTransform && og.fillStyle.setTransform(new DOMMatrix([1 / S, 0, 0, 1 / S, 0, 0]));
    og.fill();
  }
  for (let j = j0; j <= j1; j += 2) for (let i = i0 + (j & 2 ? 1 : 0); i <= i1; i += 3) {
    const c = j * o.cols + i; if (a[c] < 0.2 || th(c, 23) > 0.5) continue;
    put(og, SP.bit(glossB, (th(c, 24) * 3) | 0), (i + 0.5) * t, (j + 0.5) * t, 0.9, (th(c, 25) - 0.5) * 0.6, S);
  }
  og.setTransform(1, 0, 0, 1, 0, 0);
  return ocv;
}

// ---------------------------------------------------------------- per frame
let frameNo = 0;
/** Draw the cached layers (terrain + oil) in device px. */
export function drawLayers(ctx, world, S, w, h) {
  frameNo++;
  layerFor(w, h, S);
  T7.drawLayers7(ctx, world, S, w, h, 0);   // STEP7 TERRAIN-ART: mud + lava (+ glow) under walls / water
  if (update(world, S)) {
    const X0 = Math.max(0, Math.floor((bx0 - 1) * T8 * S)), Y0 = Math.max(0, Math.floor((by0 - 1) * T8 * S));
    const X1 = Math.min(w, Math.ceil((bx1 + 2) * T8 * S + 6 * S)), Y1 = Math.min(h, Math.ceil((by1 + 2) * T8 * S + 6 * S));
    if (X1 > X0 && Y1 > Y0) ctx.drawImage(tcv, X0, Y0, X1 - X0, Y1 - Y0, X0, Y0, X1 - X0, Y1 - Y0);
  }
  T7.drawLayers7(ctx, world, S, w, h, 1);   // STEP7 TERRAIN-ART: bridges (+ lava rock) over water / walls, under oil
  const ol = oilLayer(world, w, h, S, frameNo);
  if (ol) {
    const X0 = Math.max(0, Math.floor(oBox[0] * S)), Y0 = Math.max(0, Math.floor(oBox[1] * S)), X1 = Math.min(w, Math.ceil(oBox[2] * S)), Y1 = Math.min(h, Math.ceil(oBox[3] * S));
    if (X1 > X0 && Y1 > Y0) ctx.drawImage(ol, X0, Y0, X1 - X0, Y1 - Y0, X0, Y0, X1 - X0, Y1 - Y0);
  }
}
/** Mines, peels, ground arrows (sim px -> device via S). rt = real time s (blink). */
export function drawProps(ctx, world, S, now, rt) {
  T7.drawProps7(ctx, world, S, now, rt);   // STEP7 TERRAIN-ART: trampolines, lava bubbles, plank fires, muddy prints
  const mines = world.mines;
  if (mines && mines.count > 0 && mines.alive) {
    const blink = (rt * 8 | 0) & 1;
    const s0 = SP.bit(mineB, 0), s1 = SP.bit(mineB, 1), s2 = SP.bit(mineB, 2);
    for (let k = 0; k < mines.high; k++) {
      if (!mines.alive[k]) continue;
      const armed = mines.fuse ? mines.fuse[k] >= 0 : false;
      put(ctx, armed ? (blink ? s1 : s2) : s0, mines.x[k], mines.y[k] + 2, 1.2, 0, S);
    }
  }
  const peels = world.peels;
  if (peels && peels.count > 0 && peels.alive) {
    for (let k = 0; k < peels.high; k++) {
      if (!peels.alive[k]) continue;
      put(ctx, SP.bit(peelB, k % 3), peels.x[k], peels.y[k] + 3, PEEL_SCALE, 0, S, peels.angle && Math.cos(peels.angle[k]) < 0 ? -1 : 1); // upright, mirrored by its angle
    }
  }
  const ga = world.groundArrows;
  if (ga && ga.length) {
    const s = SP.bit(arrowNeutral, 0);
    for (let i = 0; i < ga.length; i++) {
      const a = ga[i], age = now - a.t;
      const al = age > 4 ? Math.max(0, 5 - age) : 1;   // drawn 5 s, fading the last 1 s (OG game.js:21564-21571)
      if (al <= 0) continue;
      ctx.globalAlpha = al;
      put(ctx, s, a.x - Math.cos(a.ang) * 3, a.y - Math.sin(a.ang) * 3, 0.85, a.ang, S);
    }
    ctx.globalAlpha = 1;
  }
}
/** Burning oil cells: list of cell centres (sim px) for fx flames; returns count. */
export function burningOil(world, out, max) {
  const o = world.oil;
  if (!o || !(o.burning > 0) || !o.fire) return 0;
  let n = 0;
  const t = o.tile;
  for (let j = Math.max(0, o.y0); j <= Math.min(o.rows - 1, o.y1); j += 2) for (let i = Math.max(0, o.x0) + (j & 2 ? 1 : 0); i <= Math.min(o.cols - 1, o.x1); i += 2) {
    const c = j * o.cols + i;
    if (o.fire[c] !== 1 || o.amount[c] < 0.08) continue;
    if (n >= max) return n;
    out[n * 3] = (i + 0.5) * t; out[n * 3 + 1] = (j + 0.5) * t; out[n * 3 + 2] = Math.min(1.3, 0.55 + o.amount[c]);
    n++;
  }
  return n;
}
/** Painted swatches for the toolbar (w x h px canvas, transparent). */
export function drawSwatch(ctx, kind, w, h) {
  if (T7.swatch7(ctx, kind, w, h)) return;   // STEP7 TERRAIN-ART: lava / mud / bridge / tramp icons
  const k = Math.min(w, h) / 40, cx = w / 2, cy = h / 2, R = rng(hash('swatch' + kind));
  ctx.save();
  ctx.setTransform(k, 0, 0, k, cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'wall') {
    const M = { R, mx: 0.5, my: 0.4, grow: 0.3, lw: 1.3 };
    for (let row = 0; row < 3; row++) {
      let x = row & 1 ? -19 : -15; const y = -12 + row * 8.4;
      while (x < 17) { const bw = Math.min(10.5, 19 - x); if (bw < 3) break;
        const pts = poly([[x + 0.4, y + 0.3], [x + bw - 0.4, y + 0.2], [x + bw - 0.3, y + 7.9], [x + 0.3, y + 8]], R, 0.4);
        fill(ctx, shift(pts, M.mx, M.my, 0.3), BRICK[(R() * BRICK.length) | 0], R, { vary: 0.1, sp: 0.9 });
        outline(ctx, pts, R, 1.25, { jit: 0.3 }); x += bw + 0.3; }
    }
    brush(ctx, [[-18, 13.6], [18, 13.4]], 3.4, C.greyD, R, { bristles: 4, dry: 0.2 });
    brush(ctx, [[-18.6, 15.6], [18.6, 15.4]], 1.2, C.ink, R, { bristles: 2, dry: 0.1 });
  } else if (kind === 'water' || kind === 'ice') {
    const pts = ring(0, 0, 17, 12.5, R, 0.12, 12);
    const isIce = kind === 'ice';
    fill(ctx, shift(pts, 0.8, 0.7, 0.4), isIce ? '#e4f4fc' : C.pond, R, { sp: 1.1, vary: 0.08, ang: 0.1 });
    if (isIce) { for (let i = 0; i < 5; i++) { const x = -10 + i * 5 + (R() - 0.5) * 2; brush(ctx, [[x - 3, 4], [x + 3, -5]], 1.4, '#ffffff', R, { bristles: 2, dry: 0.3 }); } brush(ctx, [[-4, -2], [0, 1], [4, 0], [7, 4]], 0.7, '#5b7fa6', R, { bristles: 1, dry: 0.1 }); }
    else {
      for (let i = 0; i < 3; i++) { const p = [], r0 = 0.2 + i * 0.28, ph = R() * TAU; for (let j = 0; j <= 9; j++) { const a = ph + j / 9 * TAU * 0.8, rr = r0 + j * 0.03; p.push([Math.cos(a) * 14 * rr, Math.sin(a) * 9 * rr]); } brush(ctx, p, 2.2, i % 2 ? C.pondL : C.pondD, R, { dry: 0.5, taper: 0.5, bristles: 4 }); }
      brush(ctx, [[-11, -6], [-9, -7.6], [-7, -6], [-5, -7.6]], 1.1, '#ffffff', R, { bristles: 2, dry: 0 });
    }
    outline(ctx, pts, R, isIce ? 1.4 : 2, { jit: 0.5, bristles: 4 });
  } else if (kind === 'mine' || kind === 'peel') {
    // painted straight onto the icon (icons are drawn before the first frame, when the atlas has no scale yet)
    const mine = kind === 'mine', sc = mine ? 2.2 : 1.1, M = M0(R), oy = mine ? k * 10 : k * sc * 8.7; // peel: anchor at its base, centred
    ctx.setTransform(k * sc, 0, 0, k * sc, cx, cy + oy);
    (mine ? mineB : peelB).paint(ctx, R, mine ? 1 : 0, M);
    ctx.setTransform(k * sc, 0, 0, k * sc, cx, cy + oy);
    if (mine) tooth(ctx, -12, -12, 24, 22, 99, 0.25); else tooth(ctx, -19, -26, 38, 34, 99, 0.25);
  }
  ctx.restore();
}
