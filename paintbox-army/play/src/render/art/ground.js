// The painted field (POSTER PAINT ground) + the decal layer. Owner: RENDER; map grounds (STEP7): GROUND-ART.
// One device-px canvas the size of the game canvas, drawn first every frame. Built from:
//   1. a seamless ground tile (320 sim px; fat strokes scrubbed side to side on cream cartridge paper, every stroke
//      painted again at the tile edges so it wraps) laid as a pattern: any window size costs one fillRect. Grass (no map,
//      or a grass map) is today's field exactly; a map's ground (world.map.ground: sand, snow, dirt, rock, swamp) gets its
//      own tile from the palettes in maps-art.js (LOOK);
//   2. a thin sky band at the top (a horizontally wrapping tile with a ragged bottom row), the sun in the top-left
//      corner and one cloud (my call: the look's picture has them, the top-left corner is free of UI on phone and desktop).
//      Each map has its own sky (maps-art.js SKY: dusk red over the volcano, grey over the swamp, bright for the beach...);
//   3. scattered stamps that break the tile repeat: zigzag scrubs, bare-paper patches, grass flicks, flowers (grass);
//      shells, ripples, wet sand by the sea (sand); footprint dimples, sparkles, blue shadows (snow); cracks, pebbles,
//      dry tufts (dirt); glowing red cracks, ash, stones (rock); murky puddles, reed tufts, duckweed (swamp);
//   4. the map's decorations (world.map.deco, STEP7 GROUND-ART): stamped once per build (DECO below). Standing ones and
//      the ones on water (flag, reeds, lilypad, slide) are drawn over the terrain layer every frame instead (drawTop), so
//      walls and water don't hide them; glowing cracks also pulse there;
//   5. decals stamped where bodies fall (red paint splat, black scorch when burnt, mint goo for slimes), under blasts
//      (scorch) and fallen trees (stump), so the field slowly becomes a painting. clear() wipes them.
// Rebuilt only on resize / dpr change (re-stamping the kept decal list), on clear() and when the map (id / ground) changes.
import { C, TAU, rng, hash, brush, ring, fill, outline, shift, dab, splat, tone, grainTile, grainFill, canvas as cpuCanvas, tooth, poly, tube, lerp } from './paint.js';
import * as SP from './sprites.js';
import { layerCanvas, touched } from './gpu.js';
import * as MA from './maps-art.js';

export const TILE = 320;     // sim px, grass tile edge
export const SKY = 30;       // sim px, sky band height (ragged edge below)
const GR = [C.g1, C.g2, C.g3, C.g4];
// STEP7 GROUND-ART numbers
const T = {
  tilesKept: 6,       // ground tiles kept painted (device px canvases: all 6; a phone tile is ~4 MB)
  shoreStep: 3,       // tiles: shore scan stride (wet sand / swamp rim stamps)
  shoreReach: 3,      // tiles: a wet tile this close to a dry one is shore
  wetScale: 1.4,      // wet-sand blob size (1 = 40 px wide)
  topCap: 512,        // decorations drawn over the terrain each frame (flag, reeds, lilypad, slide, glow)
  glowRate: 1.7,      // rad/s: glowing crack pulse
  idleTileMs: 6,      // ms: idle time paints the other grounds' tiles + bits ahead in slices of about this (map loads stay instant)
};

// ---------------------------------------------------------------- bits
const sun = SP.defineBit('sun', 1, [84, 84, 42, 42], (c, R) => {
  for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + 0.15; brush(c, [[Math.cos(a) * 24, Math.sin(a) * 24], [Math.cos(a) * 36, Math.sin(a) * 36]], 4, C.sunO, R, { taper: 0.6, dry: 0.4 }); }
  const s = ring(0, 0, 19, 18, R, 0.06, 11);
  fill(c, shift(s, 1.4, 1.2, 0.6), C.sun, R, { sp: 1.2 }); outline(c, s, R, 2);
}, { tooth: true });
const cloud = SP.defineBit('cloud', 1, [76, 36, 38, 18], (c, R) => {
  const cl = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, kk = 1 + 0.2 * Math.abs(Math.sin(a * 2.5)); cl.push([Math.cos(a) * 30 * kk, Math.sin(a) * 12 * kk]); }
  fill(c, shift(cl, -1.2, 1, 0.6), C.cloud, R, { sp: 1.4, vary: 0.04 }); outline(c, cl, R, 1.8);
});
const zig = SP.defineBit('zig', 8, [84, 56, 42, 28], (c, R, v) => {
  const n = 3 + (R() * 4 | 0), amp = 4 + R() * 7, step = 7 + R() * 8, ang = (R() - 0.5) * 1.4, ca = Math.cos(ang), sa = Math.sin(ang), pts = [];
  const x0 = -(n - 1) * step / 2;
  for (let j = 0; j < n; j++) { const u = x0 + j * step, w = (j % 2 ? amp : -amp) + (R() - 0.5) * 4; pts.push([ca * u - sa * w, sa * u + ca * w]); }
  brush(c, pts, 9 + R() * 8, v === 7 ? C.g3 : GR[v % 4], R, { dry: 0.6, taper: 0.4, vary: 0.05, bristles: 6, per: 5 });
}, { tooth: false });
const bald = SP.defineBit('bald', 4, [70, 26, 35, 13], (c, R) => {
  for (let i = 0; i < 3; i++) { const y = (i - 1) * 5 + (R() - 0.5) * 2, l = 22 + R() * 18, x = (R() - 0.5) * 10;
    brush(c, [[x - l, y], [x, y + (R() - 0.5) * 3], [x + l, y]], 7 + R() * 3, i === 1 ? C.paperL : C.paper, R, { dry: 0.75, taper: 0.5, vary: 0.04, bristles: 6 }); }
}, { tooth: true });
const flick = SP.defineBit('flick', 4, [14, 12, 7, 10], (c, R) => {
  for (let j = 0; j < 3; j++) brush(c, [[-2.4 + j * 2.4, 0], [-2.4 + j * 2.4 + (j - 1) * 1.6, -4 - R() * 2.6]], 1.1, C.leafD, R, { bristles: 2, taper: 0.7, dry: 0.1 });
}, { tooth: false });
const flower = SP.defineBit('flower', 3, [10, 10, 5, 5], (c, R, v) => {
  const col = [C.yellow, '#ffffff', C.pink][v];
  for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; dab(c, Math.cos(a) * 2.2, Math.sin(a) * 1.8, 1.5, col, R); }
  dab(c, 0, 0, 1.1, C.orange, R);
}, { tooth: false });
// decals: drawn at scale 1 for a 9.5-radius body; anchor = where the body lay
const splatB = SP.defineBit('splat', 6, [74, 50, 37, 25], (c, R) => {
  splat(c, 0, 0, 12.5, C.blood, R);
  for (let j = 0; j < 2; j++) { const a = R() * TAU, d = 14 + R() * 8; splat(c, Math.cos(a) * d, Math.sin(a) * d * 0.6, 2.4 + R() * 2.2, C.blood, R); }
});
const scorchB = SP.defineBit('scorch', 4, [74, 50, 37, 25], (c, R) => { splat(c, 0, 0, 12, C.scorch, R, 0.55); });
const gooB = SP.defineBit('goo', 3, [74, 50, 37, 25], (c, R) => { splat(c, 0, 0, 12, '#7ee0c8', R); });
const stumpB = SP.defineBit('stump', 2, [44, 30, 22, 18], (c, R) => {
  for (let i = 0; i < 7; i++) { const a = R() * TAU, d = 6 + R() * 12; dab(c, Math.cos(a) * d, Math.sin(a) * d * 0.55, 1.6 + R(), i % 2 ? C.leaf : C.leafL, R); }
  const top = ring(0, -1, 4.6, 2.6, R, 0.08, 8);
  fill(c, [[-4.4, -1], [-4.6, 3.4], [4.6, 3.4], [4.4, -1]], C.brown, R, { sharp: true });
  fill(c, top, C.brownL, R); outline(c, top, R, 1.1);
  brush(c, [[-4.6, 0], [-4.8, 3.6], [4.8, 3.6], [4.6, 0]], 1.1, C.ink, R, { bristles: 2, dry: 0.1 });
});
const DECAL = [splatB, scorchB, gooB, stumpB];
export const DK = { splat: 0, scorch: 1, goo: 2, stump: 3 };

// ---------------------------------------------------------------- STEP7 GROUND-ART: sky bits
const sunPale = SP.defineBit('sun_pale', 1, [60, 60, 30, 30], (c, R) => {
  const s = ring(0, 0, 17, 16, R, 0.06, 11);
  fill(c, shift(s, 1.2, 1, 0.5), '#fff3b8', R, { sp: 1.2, vary: 0.05 }); outline(c, s, R, 1.8, { col: '#5a6a80' });
}, { tooth: true });
const sunRed = SP.defineBit('sun_red', 1, [84, 84, 42, 42], (c, R) => {
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3; brush(c, [[Math.cos(a) * 25, Math.sin(a) * 25], [Math.cos(a) * 33, Math.sin(a) * 33]], 3.4, '#ffb02a', R, { taper: 0.6, dry: 0.5 }); }
  const s = ring(0, 0, 21, 20, R, 0.06, 11);
  fill(c, shift(s, 1.4, 1.2, 0.6), '#ff4a1e', R, { sp: 1.2 }); outline(c, s, R, 2);
  brush(c, [[-11, -6], [-4, -12]], 3, '#ff8a3a', R, { dry: 0.4, bristles: 3 });
}, { tooth: true });
const cloudGrey = SP.defineBit('cloud_grey', 2, [92, 40, 46, 20], (c, R, v) => {
  const cl = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, kk = 1 + 0.22 * Math.abs(Math.sin(a * (2.5 + v))); cl.push([Math.cos(a) * 36 * kk, Math.sin(a) * 13 * kk]); }
  fill(c, shift(cl, -1.2, 1, 0.6), v ? '#b9beb9' : '#cfd3cf', R, { sp: 1.4, vary: 0.05 });
  brush(c, [[-24, 6], [0, 9], [22, 6]], 5, '#9aa09b', R, { dry: 0.5, bristles: 4 });
  outline(c, cl, R, 1.8);
});
const smoke = SP.defineBit('smoke', 2, [96, 44, 48, 22], (c, R, v) => {
  for (let i = 0; i < 6; i++) { const x = -30 + i * 12 + (R() - 0.5) * 6, y = (R() - 0.5) * 8, r = 9 + R() * 6;
    const b = ring(x, y, r, r * 0.8, R, 0.15, 9); fill(c, b, i % 2 ? '#3c3433' : '#4d4442', R, { sp: 1.3, vary: 0.06, edge: 0 }); }
  brush(c, [[-30, -6], [-6, -12], [24, -7]], 3, v ? '#6a5a55' : '#5e5250', R, { dry: 0.5, bristles: 3 });
}, { tooth: true });

// ---------------------------------------------------------------- STEP7 GROUND-ART: ground scatter bits (per ground)
function zigBit(name, tones) {
  return SP.defineBit(name, 6, [84, 56, 42, 28], (c, R, v) => {
    const n = 3 + (R() * 4 | 0), amp = 4 + R() * 7, step = 7 + R() * 8, ang = (R() - 0.5) * 1.4, ca = Math.cos(ang), sa = Math.sin(ang), pts = [];
    const x0 = -(n - 1) * step / 2;
    for (let j = 0; j < n; j++) { const u = x0 + j * step, w = (j % 2 ? amp : -amp) + (R() - 0.5) * 4; pts.push([ca * u - sa * w, sa * u + ca * w]); }
    brush(c, pts, 9 + R() * 8, tones[v % 4], R, { dry: 0.6, taper: 0.4, vary: 0.05, bristles: 6, per: 5 });
  }, { tooth: false });
}
const L = MA.LOOK;
const ZIG = { sand: zigBit('zig_sand', L.sand.tones), snow: zigBit('zig_snow', [L.snow.tones[1], L.snow.tones[3], L.snow.tones[2], L.snow.shadow]),
  dirt: zigBit('zig_dirt', L.dirt.tones), rock: zigBit('zig_rock', L.rock.tones), swamp: zigBit('zig_swamp', L.swamp.tones) };
// sand
const shellB = SP.defineBit('shell', 3, [16, 14, 8, 7], (c, R, v, M) => {
  if (v === 0) {   // scallop: a fan with ridges
    const pts = [[0, 3.4]]; for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI; pts.push([Math.cos(a) * 5.4, -1 + Math.sin(a) * 4.6]); }
    fill(c, shift(pts, M.mx * 0.4, M.my * 0.4, 0.2), '#ffb8a0', R, { vary: 0.08, sp: 0.6 });
    for (let i = 1; i < 5; i++) { const a = Math.PI + i / 5 * Math.PI; brush(c, [[0, 3], [Math.cos(a) * 4.8, -1 + Math.sin(a) * 4]], 0.45, '#d9735a', R, { bristles: 1, dry: 0.1 }); }
    outline(c, pts, R, 0.9);
  } else if (v === 1) {   // snail spiral
    const b = ring(0, 0, 4.6, 3.8, R, 0.08, 9);
    fill(c, shift(b, M.mx * 0.4, M.my * 0.4, 0.2), '#fff4dc', R, { vary: 0.06, sp: 0.6 });
    const sp = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU * 1.6, r = 0.6 + i * 0.26; sp.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]); }
    brush(c, sp, 0.6, '#b07a52', R, { bristles: 1, dry: 0.1, taper: 0 });
    outline(c, b, R, 0.9);
  } else {   // starfish
    const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 2.2 : 6; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    fill(c, shift(poly(pts, R, 0.3), M.mx * 0.4, M.my * 0.4, 0.2), '#ff8a3a', R, { sharp: true, vary: 0.08, sp: 0.6 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; dab(c, Math.cos(a) * 3, Math.sin(a) * 3, 0.5, '#ffd27a', R); }
    outline(c, pts, R, 0.9);
  }
}, { tooth: false });
const rippleB = SP.defineBit('ripple', 4, [40, 16, 20, 8], (c, R) => {
  for (let i = 0; i < 3; i++) { const y = (i - 1) * 4 + (R() - 0.5), l = 10 + R() * 8, x = (R() - 0.5) * 6;
    brush(c, [[x - l, y + 1], [x - l * 0.3, y - 1.2], [x + l * 0.3, y + 1], [x + l, y - 0.6]], 1.4, i === 1 ? '#d7a948' : '#cf9e40', R, { bristles: 2, dry: 0.4, taper: 0.5 }); }
}, { tooth: false });
const wetB = SP.defineBit('wetsand', 3, [56, 40, 28, 20], (c, R) => {
  const b = ring(0, 0, 22, 15, R, 0.18, 12);
  fill(c, b, L.sand.wet, R, { vary: 0.06, sp: 1.6, edge: 0 });
  for (let i = 0; i < 4; i++) brush(c, [[-18 + R() * 8, -8 + i * 5], [16 - R() * 8, -8 + i * 5 + (R() - 0.5) * 2]], 4, i % 2 ? L.sand.wetD : L.sand.wet, R, { dry: 0.7, taper: 0.4, bristles: 4 });
}, { tooth: false });
const pebbleB = SP.defineBit('pebble', 4, [12, 10, 6, 5], (c, R, v, M) => {
  const cols = ['#9b8f84', '#b9ad9f', '#7d7066', '#c9bcaa'];
  const b = ring(0, 0, 2.6 + R() * 1.2, 1.8 + R() * 0.8, R, 0.14, 7);
  fill(c, shift(b, M.mx * 0.3, M.my * 0.3, 0.2), cols[v], R, { vary: 0.08, sp: 0.6, edge: 0 }); outline(c, b, R, 0.8);
}, { tooth: false });
// snow
const printB = SP.defineBit('prints', 3, [56, 20, 28, 10], (c, R) => {
  for (let i = 0; i < 5; i++) { const x = -22 + i * 11 + (R() - 0.5) * 2, y = (i % 2 ? 3 : -3) + (R() - 0.5) * 1.5;
    const b = ring(x, y, 2.6, 1.6, R, 0.12, 7, 0.2); fill(c, b, L.snow.shadow, R, { vary: 0.05, sp: 0.6, edge: 0 });
    brush(c, [[x - 2.2, y - 1.2], [x + 2, y - 1.6]], 0.6, L.snow.shadowD, R, { bristles: 1, dry: 0.2 }); }
}, { tooth: false });
const sparkB = SP.defineBit('sparkle', 3, [12, 12, 6, 6], (c, R, v) => {
  const col = v === 2 ? '#bfe3ff' : '#ffffff', r = 3.2 + R();
  brush(c, [[-r, 0], [r, 0]], 0.8, col, R, { bristles: 1, dry: 0, taper: 0 }); brush(c, [[0, -r], [0, r]], 0.8, col, R, { bristles: 1, dry: 0, taper: 0 });
  dab(c, 0, 0, 0.9, col, R);
}, { tooth: false });
const shadowB = SP.defineBit('snowshadow', 4, [70, 22, 35, 11], (c, R) => {
  brush(c, [[-26, 2], [-8, -2], [10, 1], [26, -1]], 6 + R() * 3, L.snow.shadow, R, { dry: 0.7, taper: 0.5, bristles: 5, vary: 0.05 });
  brush(c, [[-18, 5], [4, 4], [18, 6]], 2.4, L.snow.shadowD, R, { dry: 0.6, taper: 0.5, bristles: 3 });
}, { tooth: false });
const lumpB = SP.defineBit('snowlump', 3, [30, 18, 15, 12], (c, R, v, M) => {
  const pts = [[-11, 2], [-8, -4], [-2, -6.5], [5, -5], [10, -1], [11, 2]];
  brush(c, [[-10, 3], [0, 4.2], [10, 3]], 3, L.snow.shadow, R, { bristles: 3, dry: 0.3 });
  fill(c, shift(poly(pts, R, 0.5), M.mx * 0.5, M.my * 0.5, 0.3), '#ffffff', R, { vary: 0.03, sp: 0.8, edge: 0 });
  outline(c, pts.slice(0, 5), R, 0.9, { gap: true, over: 0, col: L.snow.ink });
}, { tooth: false });
// dirt
const crackB = SP.defineBit('crack', 4, [44, 30, 22, 15], (c, R) => {
  let x = -18, y = (R() - 0.5) * 6; const pts = [[x, y]];
  while (x < 18) { x += 4 + R() * 5; y += (R() - 0.5) * 7; pts.push([x, y]); }
  brush(c, pts, 1.5, L.dirt.crack, R, { bristles: 2, dry: 0.15, taper: 0.5, per: 2 });
  for (let i = 1; i < pts.length - 1; i += 2) { const [px, py] = pts[i], a = (R() < 0.5 ? -1 : 1) * (0.8 + R() * 0.8); brush(c, [[px, py], [px + Math.cos(a) * 6, py + Math.sin(a) * 6]], 0.9, L.dirt.crack, R, { bristles: 1, dry: 0.2, taper: 0.6 }); }
}, { tooth: false });
const tuftB = SP.defineBit('drytuft', 3, [16, 14, 8, 11], (c, R, v) => {
  const col = ['#c9a646', '#b38a3a', '#d8b860'][v];
  for (let j = 0; j < 5; j++) brush(c, [[-3 + j * 1.5, 0], [-3 + j * 1.5 + (j - 2) * 1.4, -4.5 - R() * 3]], 0.9, col, R, { bristles: 2, taper: 0.7, dry: 0.1 });
}, { tooth: false });
// rock
const glowB = SP.defineBit('glowcrk', 4, [50, 30, 25, 15], (c, R) => {
  let x = -20, y = (R() - 0.5) * 6; const pts = [[x, y]];
  while (x < 20) { x += 4 + R() * 6; y += (R() - 0.5) * 8; pts.push([x, y]); }
  brush(c, pts, 4.2, L.rock.ink, R, { bristles: 3, dry: 0.1, taper: 0.6, per: 2 });
  brush(c, pts, 2.6, L.rock.glowR, R, { bristles: 2, dry: 0.15, taper: 0.6, per: 2 });
  brush(c, pts, 1.2, L.rock.glow, R, { bristles: 2, dry: 0.2, taper: 0.7, per: 2 });
  brush(c, pts.slice(1, -1), 0.5, L.rock.glowY, R, { bristles: 1, dry: 0.3, taper: 0.7, per: 2 });
}, { tooth: false });
const ashB = SP.defineBit('ash', 3, [40, 18, 20, 9], (c, R, v) => {
  for (let i = 0; i < 2; i++) brush(c, [[-15 + R() * 4, (i - 0.5) * 4], [15 - R() * 4, (i - 0.5) * 4 + (R() - 0.5) * 2]], 5 + R() * 2, v === 2 ? '#6a625e' : '#5b5350', R, { dry: 0.75, taper: 0.5, bristles: 5 });
}, { tooth: false });
const stoneB = SP.defineBit('stone', 4, [20, 16, 10, 10], (c, R, v, M) => {
  const pts = poly([[-6, 2], [-5, -3], [0, -5.5], [5, -3.4], [6.4, 2]], R, 0.6);
  fill(c, shift(pts, M.mx * 0.4, M.my * 0.4, 0.2), v % 2 ? '#2b2625' : '#3a3332', R, { sharp: true, vary: 0.08, sp: 0.7 });
  brush(c, [[-3.4, -2.4], [0.4, -4.2]], 1, '#6e6460', R, { bristles: 1, dry: 0.3 });
  outline(c, pts, R, 0.9, { col: L.rock.ink });
}, { tooth: false });
// swamp
const puddleB = SP.defineBit('murk', 4, [64, 34, 32, 17], (c, R) => {
  const b = ring(0, 0, 24 + R() * 4, 11 + R() * 3, R, 0.2, 12);
  fill(c, shift(b, -1, 1, 0.8), L.swamp.puddleL, R, { vary: 0.05, sp: 1.4, edge: 0 });
  fill(c, b, L.swamp.puddle, R, { vary: 0.08, sp: 1.2, edge: 0 });
  for (let i = 0; i < 3; i++) brush(c, [[-14 + i * 9, -3 + R() * 4], [-8 + i * 9, -4 + R() * 4]], 1, '#6b7a44', R, { bristles: 1, dry: 0.2 });
}, { tooth: false });
const reedTuftB = SP.defineBit('reedtuft', 3, [18, 20, 9, 16], (c, R) => {
  for (let j = 0; j < 4; j++) brush(c, [[-3 + j * 2, 0], [-3 + j * 2 + (j - 1.5) * 1.6, -8 - R() * 5]], 1, j % 2 ? L.swamp.reed : '#567f2c', R, { bristles: 2, taper: 0.8, dry: 0.1 });
}, { tooth: false });
const weedB = SP.defineBit('duckweed', 3, [16, 10, 8, 5], (c, R) => {
  for (let j = 0; j < 4; j++) dab(c, (R() - 0.5) * 10, (R() - 0.5) * 5, 1 + R() * 0.6, j % 2 ? '#86a83a' : '#6f8f2e', R);
}, { tooth: false });
// per ground: [bit, count per px² (area / n), scale range, rotate?, flip?] in stamp order (big patches first)
// (only the zigzags and a few big marks are turned: a turned drawImage costs ~2x a straight one, and the scatter is most of
// a re-lay)
const SCATTER = {
  sand: [[bald, 90000, 0.8, 0.8, 0, 1], [ZIG.sand, 9000, 0.9, 0.5, 1, 0], [rippleB, 4200, 0.8, 0.5, 0, 1], [pebbleB, 8000, 0.8, 0.6, 0, 1], [shellB, 26000, 0.9, 0.4, 1, 1]],
  snow: [[shadowB, 30000, 1, 0.8, 0, 1], [ZIG.snow, 9000, 0.9, 0.5, 1, 0], [sparkB, 4200, 0.8, 0.6, 0, 0], [printB, 30000, 0.9, 0.3, 1, 1], [lumpB, 22000, 0.8, 0.6, 0, 1]],
  dirt: [[ZIG.dirt, 9000, 0.9, 0.5, 1, 0], [crackB, 11000, 0.9, 0.6, 1, 1], [pebbleB, 4200, 0.8, 0.6, 0, 1], [tuftB, 9000, 0.8, 0.5, 0, 1]],
  rock: [[ashB, 30000, 1, 0.8, 0, 1], [ZIG.rock, 9000, 0.9, 0.5, 1, 0], [stoneB, 6000, 0.7, 0.7, 0, 1], [glowB, 26000, 0.8, 0.6, 1, 1], [ashB, 9000, 0.4, 0.3, 0, 1]],
  swamp: [[puddleB, 26000, 0.9, 0.8, 0, 1], [ZIG.swamp, 9000, 0.9, 0.5, 1, 0], [weedB, 3600, 0.8, 0.5, 0, 1], [reedTuftB, 9000, 0.8, 0.5, 0, 1]],
};

// ---------------------------------------------------------------- STEP7 GROUND-ART: decorations (world.map.deco)
// Sizes at s = 1 (sim px), anchor = (x, y). a turns the flat ones; standing ones stay upright and mirror by f.
//   sandcastle 44 wide (base) · shell 12 · snowdrift 70 x 26 along a · crop 90 x 20 row along a · sandpit 120 x 90 box
//   hopscotch 130 x 36 along a · reeds 26 tall (base) · lilypad 20 · bones 24 · glowcrack 70 along a · path 56 x 32 dab
//   along a (place them every ~30 px along the route) · flowers 34 patch · slide 120 x 40 along a (ladder end at -x,
//   chute runs to +x) · flag 44 tall pole (base at x, y; red on the left half, blue on the right).
const decoBits = {};
function defDeco(kind, n, box, paint, opts) { decoBits[kind] = SP.defineBit('deco_' + kind, n, box, paint, opts); }
const SANDC = '#efc65e', SANDD = '#cf9f3e', SANDL = '#f8dc8c';
defDeco('sandcastle', 2, [52, 50, 26, 34], (c, R, v, M) => {
  const tw = (x, w, h) => {
    const pts = [[x - w, 0], [x - w, -h], [x - w * 0.55, -h], [x - w * 0.55, -h - 2.6], [x - w * 0.15, -h - 2.6], [x - w * 0.15, -h], [x + w * 0.15, -h], [x + w * 0.15, -h - 2.6], [x + w * 0.55, -h - 2.6], [x + w * 0.55, -h], [x + w, -h], [x + w, 0]];
    const P = poly(pts, R, 0.35); fill(c, shift(P, M.mx * 0.6, M.my * 0.6, 0.3), SANDC, R, { sharp: true, vary: 0.08, sp: 0.8 }); outline(c, P, R, 1.2);
    brush(c, [[x - w * 0.7, -h * 0.35], [x + w * 0.6, -h * 0.4]], 0.7, SANDD, R, { bristles: 1, dry: 0.3 });
  };
  const mound = [[-22, 2], [-18, -4], [-6, -6], [8, -6], [19, -4], [23, 2]];
  fill(c, shift(poly(mound, R, 0.6), M.mx, M.my, 0.4), SANDD, R, { vary: 0.06, sp: 1 }); outline(c, mound, R, 1.2, { gap: true, over: 0 });
  if (v === 0) { tw(-11, 5, 13); tw(11, 5, 13); tw(0, 7, 21); }
  else { tw(-9, 6, 15); tw(8, 5.4, 11); tw(-1, 4.5, 24); }
  const dx = v === 0 ? 0 : -1, dy = v === 0 ? -2 : -3;   // door
  fill(c, [[dx - 2.6, dy], [dx - 2.6, dy - 4.6], [dx, dy - 6.4], [dx + 2.6, dy - 4.6], [dx + 2.6, dy]], '#6e4a22', R, { edge: 0 });
  const fx = v === 0 ? 0 : -1, fy = v === 0 ? -23.6 : -26.6;   // flag on the top tower
  brush(c, [[fx, fy], [fx, fy - 9]], 0.8, C.ink, R, { bristles: 1, dry: 0 });
  fill(c, [[fx, fy - 9], [fx + 6, fy - 7.4], [fx, fy - 5.6]], C.red, R, { sharp: true, edge: 0 });
  for (let i = 0; i < 4; i++) dab(c, -18 + R() * 36, -1 + R() * 2, 0.7, SANDL, R);
});
defDeco('shell', 3, [16, 14, 8, 7], shellB.paint, { tooth: false });
defDeco('snowdrift', 3, [80, 34, 40, 20], (c, R, v, M) => {
  const w = 34 + R() * 4, h = 10 + R() * 4, pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, x = -w + t * 2 * w; pts.push([x, 2 - Math.sin(t * Math.PI) * h * (1 + 0.25 * Math.sin(t * 9 + v))]); }
  brush(c, [[-w, 4], [0, 6], [w, 4]], 5, L.snow.shadow, R, { dry: 0.4, bristles: 5, taper: 0.3 });
  const P = poly(pts.concat([[w, 3], [-w, 3]]), R, 0.5);
  fill(c, shift(P, M.mx, M.my, 0.4), '#ffffff', R, { vary: 0.03, sp: 1 });
  brush(c, [[-w * 0.6, -h * 0.3], [0, -h * 0.75], [w * 0.5, -h * 0.4]], 2.6, '#eef5fc', R, { dry: 0.5, bristles: 3 });
  brush(c, [[-w * 0.7, 1], [0, 2.4], [w * 0.8, 1]], 3, L.snow.shadow, R, { dry: 0.5, bristles: 3, taper: 0.5 });
  outline(c, pts, R, 1.3, { gap: true, over: 0, col: L.snow.ink });
  c.save(); c.translate(w * 0.35, -h * 0.55); sparkB.paint(c, R, 0); c.restore();
});
defDeco('crop', 3, [96, 26, 48, 13], (c, R, v) => {
  brush(c, [[-44, 0], [0, (R() - 0.5) * 2], [44, 0]], 12, '#7a5230', R, { dry: 0.35, taper: 0.1, bristles: 7, vary: 0.06 });
  brush(c, [[-42, 3.5], [42, 3.5]], 1.6, '#5a3a1e', R, { dry: 0.4, bristles: 2 });
  for (let i = 0; i < 8; i++) {
    const x = -38 + i * 10.8 + (R() - 0.5) * 2, y = (R() - 0.5) * 1.5;
    if (v === 0) { const b = ring(x, y - 1, 4.4, 3.6, R, 0.15, 8); fill(c, b, i % 2 ? '#7cc24a' : '#94d45c', R, { sp: 0.7 }); brush(c, [[x - 2.4, y - 1], [x + 2.4, y - 1.6]], 0.7, '#4b8f2c', R, { bristles: 1, dry: 0.2 }); outline(c, b, R, 1); }
    else if (v === 1) { for (let j = 0; j < 4; j++) brush(c, [[x - 1.5 + j, y + 2], [x - 2.5 + j * 1.6, y - 9 - R() * 2]], 0.9, j % 2 ? '#e3b23c' : '#c9962c', R, { bristles: 2, taper: 0.3, dry: 0.1 }); dab(c, x, y - 9.5, 1.4, '#f2c84a', R); }
    else { for (let j = 0; j < 3; j++) brush(c, [[x, y], [x + (j - 1) * 2.4, y - 6 - R() * 2]], 1.3, C.leafL, R, { bristles: 2, taper: 0.6, dry: 0.1 }); dab(c, x, y + 0.6, 1.6, C.orange, R); }
  }
});
defDeco('sandpit', 1, [128, 96, 64, 48], (c, R, v, M) => {
  const box = poly([[-58, -42], [58, -42], [58, 42], [-58, 42]], R, 1);
  fill(c, shift(box, M.mx, M.my, 0.6), SANDC, R, { sharp: true, vary: 0.06, sp: 1.4 });
  for (let i = 0; i < 6; i++) brush(c, [[-50 + R() * 20, -34 + i * 13], [50 - R() * 20, -34 + i * 13 + (R() - 0.5) * 4]], 6, i % 2 ? SANDL : SANDD, R, { dry: 0.75, taper: 0.4, bristles: 5 });
  for (const [x0, y0, x1, y1] of [[-60, -44, 60, -44], [-60, 44, 60, 44], [-60, -44, -60, 44], [60, -44, 60, 44]]) {   // plank frame
    brush(c, [[x0, y0], [x1, y1]], 7.6, C.ink, R, { dry: 0.05, taper: 0, bristles: 5 });
    brush(c, [[x0, y0], [x1, y1]], 5.6, C.brownL, R, { dry: 0.15, taper: 0, bristles: 5 });
  }
  for (const [x, y] of [[-30, 18], [22, -14], [6, 22]]) { const b = ring(x, y, 9, 5, R, 0.2, 9); fill(c, b, SANDD, R, { edge: 0, sp: 0.9 }); brush(c, [[x - 6, y - 2], [x + 5, y - 3]], 1.4, SANDL, R, { bristles: 2, dry: 0.4 }); }
  const bk = poly([[30, 8], [42, 8], [40, 22], [32, 22]], R, 0.4); fill(c, bk, C.red, R, { sharp: true }); outline(c, bk, R, 1.1);   // bucket
  brush(c, [[30, 9], [36, 3], [42, 9]], 0.8, C.ink, R, { bristles: 1, dry: 0 });
  brush(c, [[-44, -24], [-30, -12]], 1.6, C.ink, R, { bristles: 2, dry: 0 });   // spade
  const sp = poly([[-31, -14], [-26, -12], [-26, -6], [-30, -5], [-33, -9]], R, 0.3); fill(c, sp, C.blue, R, { sharp: true }); outline(c, sp, R, 1);
});
defDeco('hopscotch', 1, [140, 44, 70, 22], (c, R) => {
  const chalk = (x, y, w, h, col) => {   // four straight chalk sides, each overshooting its corner a little
    const P = poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], R, 0.5);
    for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) & 3], dx = (b[0] - a[0]) * 0.06, dy = (b[1] - a[1]) * 0.06; brush(c, [[a[0] - dx, a[1] - dy], [b[0] + dx, b[1] + dy]], 2.6, col, R, { dry: 0.4, taper: 0.1, bristles: 3, per: 2 }); }
  };
  const s = 16;
  chalk(-62, -s / 2, s, s, '#ffffff'); chalk(-46, -s / 2, s, s, C.pink);
  chalk(-30, -s, s, s, '#ffffff'); chalk(-30, 0, s, s, '#ffffff');
  chalk(-14, -s / 2, s, s, C.yellow);
  chalk(2, -s, s, s, '#ffffff'); chalk(2, 0, s, s, C.pink);
  chalk(18, -s / 2, s, s, '#ffffff');
  const arc = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI; arc.push([34 + Math.cos(a) * 14, Math.sin(a) * 12]); }
  brush(c, arc, 2.6, '#ffffff', R, { dry: 0.4, taper: 0.1, bristles: 3 });
  dab(c, -40, 5, 2, C.red, R);   // the stone
});
defDeco('reeds', 3, [28, 36, 14, 32], (c, R, v) => {
  for (let j = 0; j < 6; j++) {
    const x = -8 + j * 3.2 + (R() - 0.5), h = 18 + R() * 9, lean = (j - 2.5) * 0.9;
    brush(c, [[x, 1], [x + lean * 0.5, -h * 0.5], [x + lean, -h]], 2.2, C.ink, R, { bristles: 2, taper: 0.7, dry: 0.05 });
    brush(c, [[x, 1], [x + lean * 0.5, -h * 0.5], [x + lean, -h]], 1.3, j % 2 ? L.swamp.reed : '#5f9a34', R, { bristles: 2, taper: 0.7, dry: 0.1 });
    if (j % 2 === v % 2) { const cx = x + lean * 0.8, cy = -h * 0.82; const b = ring(cx, cy, 1.5, 3.4, R, 0.1, 7); fill(c, b, L.swamp.cattail, R, { edge: 0, sp: 0.5 }); outline(c, b, R, 0.8); }
  }
});
defDeco('lilypad', 3, [24, 18, 12, 9], (c, R, v, M) => {
  const pts = []; for (let i = 0; i <= 12; i++) { const a = 0.45 + i / 12 * (TAU - 0.9); pts.push([Math.cos(a) * 8.4, Math.sin(a) * 6]); }
  pts.push([0.6, 0]);
  fill(c, shift(poly(pts, R, 0.3), M.mx * 0.5, M.my * 0.5, 0.3), v === 1 ? '#5fae3e' : C.leafL, R, { sharp: true, vary: 0.08, sp: 0.8 });
  for (let i = 0; i < 4; i++) { const a = 1 + i * 1.2; brush(c, [[0.6, 0], [Math.cos(a) * 6.6, Math.sin(a) * 4.6]], 0.5, C.leafD, R, { bristles: 1, dry: 0.2 }); }
  outline(c, pts, R, 1);
  if (v === 2) { for (let j = 0; j < 6; j++) { const a = j / 6 * TAU; dab(c, -2 + Math.cos(a) * 2, -1.5 + Math.sin(a) * 1.5, 1.5, C.pink, R); } dab(c, -2, -1.5, 1, C.yellow, R); }
});
defDeco('bones', 3, [30, 22, 15, 11], (c, R, v) => {
  const bone = (x0, y0, x1, y1) => {
    brush(c, [[x0, y0], [x1, y1]], 3.6, C.ink, R, { bristles: 3, taper: 0, dry: 0.05 }); brush(c, [[x0, y0], [x1, y1]], 2.2, C.white, R, { bristles: 2, taper: 0, dry: 0.1 });
    for (const [x, y] of [[x0, y0], [x1, y1]]) { const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2; for (const s of [-1, 1]) { const bx = x + Math.cos(a) * s * 1.6, by = y + Math.sin(a) * s * 1.6; dab(c, bx, by, 2.2, C.ink, R); dab(c, bx, by, 1.5, C.white, R); } }
  };
  if (v === 0) bone(-9, 1, 9, -1);
  else if (v === 1) { bone(-8, -5, 8, 5); bone(-8, 5, 8, -5); }
  else {   // a cow skull
    const sk = poly([[-5, -4], [5, -4], [6, 0], [3, 6], [-3, 6], [-6, 0]], R, 0.3);
    fill(c, sk, C.white, R, { sharp: true, vary: 0.04 }); outline(c, sk, R, 1.1);
    for (const s of [-1, 1]) { brush(c, [[s * 5, -3], [s * 10, -6], [s * 12, -10]], 2.6, C.ink, R, { bristles: 2, taper: 0.7, dry: 0 }); brush(c, [[s * 5, -3], [s * 10, -6], [s * 12, -10]], 1.5, C.white, R, { bristles: 2, taper: 0.7, dry: 0 }); dab(c, s * 2.4, -0.6, 1.4, C.ink, R); }
    dab(c, -1, 4, 0.6, C.ink, R); dab(c, 1, 4, 0.6, C.ink, R);
  }
});
defDeco('glowcrack', 3, [80, 34, 40, 17], (c, R) => {
  let x = -34, y = (R() - 0.5) * 4; const pts = [[x, y]];
  while (x < 34) { x += 5 + R() * 6; y += (R() - 0.5) * 9; pts.push([x, Math.max(-12, Math.min(12, y))]); }
  brush(c, pts, 9, '#2a1a14', R, { bristles: 5, dry: 0.15, taper: 0.7, per: 2 });
  brush(c, pts, 6, L.rock.glowR, R, { bristles: 3, dry: 0.1, taper: 0.7, per: 2 });
  brush(c, pts, 3.4, L.rock.glow, R, { bristles: 3, dry: 0.15, taper: 0.75, per: 2 });
  brush(c, pts.slice(1, -1), 1.4, L.rock.glowY, R, { bristles: 2, dry: 0.2, taper: 0.75, per: 2 });
  for (let i = 1; i < pts.length - 1; i += 2) { const [px, py] = pts[i], a = (R() < 0.5 ? -1 : 1) * (0.9 + R() * 0.6); brush(c, [[px, py], [px + Math.cos(a) * 8, py + Math.sin(a) * 7]], 2, L.rock.glowR, R, { bristles: 2, dry: 0.2, taper: 0.8 }); }
}, { tooth: false });
defDeco('path', 4, [64, 40, 32, 20], (c, R) => {
  const b = ring(0, 0, 27, 14, R, 0.16, 12);
  fill(c, b, '#c9a46a', R, { vary: 0.08, sp: 1.3, edge: 0 });
  for (let i = 0; i < 3; i++) brush(c, [[-22 + R() * 6, -8 + i * 7], [22 - R() * 6, -8 + i * 7 + (R() - 0.5) * 3]], 4.4, i === 1 ? '#d8b77e' : '#b88f55', R, { dry: 0.75, taper: 0.4, bristles: 5 });
  for (let i = 0; i < 4; i++) dab(c, -18 + R() * 36, -8 + R() * 16, 1.2 + R() * 0.8, i % 2 ? '#9b8f84' : '#7d7066', R);
}, { tooth: true });
defDeco('flowers', 3, [40, 30, 20, 16], (c, R, v) => {
  const cols = [[C.yellow, C.red, '#ffffff'], [C.pink, C.purple, C.yellow], ['#ffffff', C.orange, C.pink]][v];
  for (let i = 0; i < 7; i++) {
    const x = (R() - 0.5) * 28, y = (R() - 0.5) * 14, h = 3 + R() * 3;
    brush(c, [[x, y + h], [x + (R() - 0.5) * 1.5, y]], 0.9, C.leafD, R, { bristles: 1, dry: 0 });
    brush(c, [[x, y + h * 0.6], [x + 2.6, y + h * 0.3]], 1.1, C.leafL, R, { bristles: 1, dry: 0.1, taper: 0.7 });
    const col = cols[i % 3];
    for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; dab(c, x + Math.cos(a) * 2.2, y + Math.sin(a) * 1.9, 1.6, col, R); }
    dab(c, x, y, 1.1, col === C.yellow ? C.orange : C.yellow, R);
  }
}, { tooth: false });
defDeco('slide', 1, [128, 48, 64, 24], (c, R, v, M) => {
  // ladder (two rails + rungs) at the -x end, a little platform, then the chute down to +x
  for (const y of [-11, 11]) { brush(c, [[-60, y], [-34, y]], 3.4, C.ink, R, { bristles: 3, taper: 0, dry: 0 }); brush(c, [[-60, y], [-34, y]], 2, C.greyL, R, { bristles: 2, taper: 0, dry: 0.1 }); }
  for (let i = 0; i < 5; i++) { const x = -58 + i * 5.6; brush(c, [[x, -11], [x, 11]], 1.6, C.ink, R, { bristles: 2, taper: 0, dry: 0 }); brush(c, [[x, -10], [x, 10]], 0.9, C.greyL, R, { bristles: 1, taper: 0, dry: 0 }); }
  const plat = poly([[-36, -14], [-22, -14], [-22, 14], [-36, 14]], R, 0.4);
  fill(c, shift(plat, M.mx, M.my, 0.3), C.blue, R, { sharp: true }); outline(c, plat, R, 1.3);
  const chute = poly([[-22, -10], [50, -8], [58, -10], [60, 0], [58, 10], [50, 8], [-22, 10]], R, 0.4);
  fill(c, shift(chute, M.mx, M.my, 0.4), C.yellow, R, { sharp: true, vary: 0.06, sp: 1 });
  brush(c, [[-20, 0], [54, 0]], 6, '#ffe46a', R, { dry: 0.5, bristles: 4, taper: 0.2 });
  for (const y of [-10, 10]) brush(c, [[-22, y], [50, y * 0.8], [58, y]], 2.6, C.red, R, { bristles: 3, taper: 0, dry: 0.1 });
  outline(c, chute, R, 1.4);
});
defDeco('flag', 2, [34, 50, 4, 46], (c, R, v) => {
  brush(c, [[0, 1], [0.4, -22], [0, -44]], 3.2, C.ink, R, { bristles: 3, taper: 0, dry: 0 });
  brush(c, [[0, 1], [0.4, -22], [0, -44]], 1.8, C.brownL, R, { bristles: 2, taper: 0, dry: 0.1 });
  dab(c, 0, -45, 2, C.ink, R); dab(c, 0, -45, 1.3, C.yellow, R);
  const col = v ? C.blue : C.red;
  const fl = [[1, -43], [10, -44.5], [19, -40], [26, -38.5], [17, -34], [9, -30.5], [1, -31]];
  fill(c, shift(fl, 0.9, 0.8, 0.3), col, R, { vary: 0.1, sp: 0.9 });
  brush(c, [[4, -40], [12, -40.5], [20, -38]], 1.2, tone(col, 0.35), R, { bristles: 2, dry: 0.4 });
  outline(c, fl, R, 1.3);
});
// soft additive glow over a glowing crack (drawTop, pulsing)
const glowSoft = SP.defineBit('glow_soft', 1, [90, 44, 45, 22], (c, R) => {
  for (let i = 0; i < 4; i++) { const b = ring(0, 0, 40 - i * 8, 17 - i * 3.5, R, 0.12, 10); fill(c, b, i < 2 ? '#7a2a08' : '#c4520f', R, { edge: 0, sp: 2, vary: 0.04 }); }
}, { tooth: false });
const TOP_KINDS = { flag: 1, reeds: 1, lilypad: 1, slide: 1 };
const FLAT = { shell: 1, crop: 1, sandpit: 1, hopscotch: 1, lilypad: 1, bones: 1, glowcrack: 1, path: 1, slide: 1 };

// ---------------------------------------------------------------- STEP7 GROUND-ART: wall looks per ground
// terrain.js walls() lays these in its running bond (same boxes and anchors as its bricks: full = 2 tiles, half = 1 tile,
// face = the front under a bottom-edge tile, cap = snow on a top-edge tile). grass = null: terrain.js's own bricks.
//   sand: wet dark rocks · snow: snow-capped grey stones · dirt: red-orange canyon rock · rock: black basalt (TERRAIN-ART's
//   lava-rock palette + glow lines, one look for both) · swamp: mossy wooden logs.
// Pieces are a little bigger than their cell and sit off-centre by variant, so neighbours overlap like a pile of stones
// (no brick grid); box [26, 18, 5, 5] = 5 px of overlap room round a 16 x 8 cell pair.
function stone(c, R, M, cx, cy, rx, ry, col, opt) {
  const n = opt.angular ? 7 : 10, pts = [];
  const p0 = R() * TAU;
  for (let i = 0; i < n; i++) {
    const a = p0 + i / n * TAU, k = opt.angular ? 0.78 + R() * 0.32 : 0.92 + R() * 0.14;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  fill(c, shift(pts, M.mx * 0.5, M.my * 0.5, 0.3), col, R, { sharp: !!opt.angular, vary: 0.1, sp: 0.9 });
  brush(c, [[cx + rx * 0.1, cy + ry * 0.75], [cx + rx * 0.75, cy + ry * 0.1]], Math.min(rx, ry) * 0.5, tone(col, -0.22), R, { bristles: 3, dry: 0.5, taper: 0.5 });   // shade, lower right
  brush(c, [[cx - rx * 0.6, cy - ry * 0.05], [cx - rx * 0.1, cy - ry * 0.6]], Math.min(rx, ry) * 0.35, opt.gloss || tone(col, 0.22), R, { bristles: 2, dry: 0.45, taper: 0.5 });   // light, upper left
  if (opt.lines) brush(c, [[cx - rx * 0.7, cy + (R() - 0.5)], [cx + rx * 0.7, cy + (R() - 0.5) * 1.5]], 0.55, opt.lines, R, { bristles: 1, dry: 0.4, taper: 0.3 });
  if (opt.glow && R() < 0.45) brush(c, [[cx - rx * 0.5, cy - ry * 0.2], [cx, cy + ry * 0.2], [cx + rx * 0.5, cy - ry * 0.1]], 0.6, R() < 0.5 ? C.fireR : C.fireO, R, { bristles: 1, dry: 0.3, taper: 0.4 });
  outline(c, pts, R, 1.05, { jit: 0.25, col: opt.ink });
}
function stoneFull(cols, opt = {}) {
  return (c, R, v, M) => {
    if (v % 3 === 2) {   // two smaller stones
      stone(c, R, M, 4 + (R() - 0.5) * 1.5, 4 + (R() - 0.5) * 1.5, 5.4, 5, cols[v % cols.length], opt);
      stone(c, R, M, 12 + (R() - 0.5) * 1.5, 4.4 + (R() - 0.5) * 1.5, 5.6, 5.2, cols[(v + 3) % cols.length], opt);
    } else stone(c, R, M, 8 + (R() - 0.5) * 2.4, 4 + (R() - 0.5) * 2, 9.4 + R() * 1.2, 5.8 + R() * 1, cols[v % cols.length], opt);
  };
}
function stoneHalf(cols, opt = {}) {
  return (c, R, v, M) => stone(c, R, M, 4 + (R() - 0.5) * 1.6, 4 + (R() - 0.5) * 1.6, 5.4 + R() * 0.8, 5.2 + R() * 0.8, cols[(v * 2 + 1) % cols.length], opt);
}
function faceOf(col, ink = C.ink, extra = null) {
  return (c, R, v) => {
    const pts = poly([[0.1, -0.6], [8.1, -0.6], [8.1, 5.2], [0.1, 5.4]], R, 0.25);
    fill(c, pts, v & 1 ? col : tone(col, -0.12), R, { vary: 0.08, sp: 0.8, edge: 0 });
    if (extra) extra(c, R, v);
    brush(c, [[-0.4, 5.4], [8.6, 5.3]], 1.3, ink, R, { bristles: 2, dry: 0.15, taper: 0.1 });
  };
}
const WALL_DEF = {
  sand: { cols: ['#6b5d52', '#5c4f46', '#7a6a5d', '#51463e', '#665848', '#5f5248'], gloss: '#e9f1f4', face: '#3f3630',
    faceX: (c, R, v) => { if (v < 2) dab(c, 2.4 + v * 3, 3.2, 0.7, '#8fb7c9', R); } },
  snow: { cols: ['#9aa3ad', '#8a929c', '#aab3bc', '#7d858f', '#a2abb4', '#8f98a2'], ink: L.snow.ink, face: '#69717c', cap: true },
  dirt: { cols: ['#d0663a', '#bd5a2c', '#e07b45', '#b04f26', '#c96236', '#d9703f'], angular: true, lines: '#8a3c1a', face: '#7a3416' },
  rock: { cols: ['#3b3538', '#2f2a2d', '#463f43', '#353033', '#4b4347', '#2a2628'], angular: true, gloss: '#77737d', glow: true, ink: L.rock.ink, face: '#161315' },
  swamp: { logs: true, face: '#3e2a18' },
};
const WALLS = {};
for (const gr in WALL_DEF) {
  const d = WALL_DEF[gr], ink = d.ink || C.ink;
  let full, half;
  if (d.logs) {   // a woodpile seen from the end: round mossy log ends, pale end grain with rings, bark rim
    const BARK = ['#6e4a2a', '#7d5632', '#5f3f22', '#734d2c'], GRAIN = ['#c29158', '#b5844c', '#cf9f65'], MOSS = ['#6f8f2e', '#86a83a', '#5f8128'];
    const logEnd = (c, R, M, cx, cy, r, v) => {
      const pts = ring(cx, cy, r, r * 0.92, R, 0.08, 9);
      fill(c, shift(pts, M.mx * 0.5, M.my * 0.5, 0.3), BARK[v % 4], R, { vary: 0.08, sp: 0.8 });
      fill(c, ring(cx + 0.2, cy + 0.1, r * 0.72, r * 0.66, R, 0.1, 8), GRAIN[v % 3], R, { vary: 0.07, sp: 0.7, edge: 0 });
      outline(c, ring(cx + 0.2, cy + 0.1, r * 0.42, r * 0.38, R, 0.15, 7), R, 0.45, { col: '#8a5e32', bristles: 1 });
      dab(c, cx + 0.2, cy + 0.1, 0.55, '#7d5632', R);
      for (let i = 0; i < 3; i++) { const a = -Math.PI * (0.2 + R() * 0.6); dab(c, cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.8, 0.9 + R() * 0.5, MOSS[(i + v) % 3], R); }
      outline(c, pts, R, 1.05, { jit: 0.25 });
    };
    full = (c, R, v, M) => { logEnd(c, R, M, 4 + (R() - 0.5), 4 + (R() - 0.5) * 1.5, 5.2 + R() * 0.6, v); logEnd(c, R, M, 12 + (R() - 0.5), 4.2 + (R() - 0.5) * 1.5, 5 + R() * 0.8, v + 1); };
    half = (c, R, v, M) => logEnd(c, R, M, 4 + (R() - 0.5), 4 + (R() - 0.5), 5.2 + R() * 0.6, v + 2);
  } else { full = stoneFull(d.cols, { angular: d.angular, lines: d.lines, gloss: d.gloss, glow: d.glow, ink }); half = stoneHalf(d.cols, { angular: d.angular, lines: d.lines, gloss: d.gloss, ink }); }
  WALLS[gr] = {
    full: SP.defineBit('wall_' + gr, 6, [26, 18, 5, 5], full),
    half: SP.defineBit('wallh_' + gr, 4, [18, 18, 5, 5], half),
    face: SP.defineBit('wallf_' + gr, 4, [12, 11, 2, 2], faceOf(d.face, ink, d.faceX || null), { tooth: false }),
    cap: d.cap ? SP.defineBit('wallcap_' + gr, 3, [14, 12, 3, 6], (c, R, v) => {   // snow on a top-edge stone
      const pts = [[-1.4, 0.8], [0, -2.2], [3, -3.4 - R()], [5.4, -2.6], [8, -3.4 - R()], [9.6, -0.8], [9.2, 1.2], [6, 2.2 + R() * 0.8], [3.6, 1.4], [1, 2.4]];
      brush(c, [[0, 2.4], [4, 3], [8.4, 2.2]], 1.4, L.snow.shadow, R, { bristles: 2, dry: 0.3 });
      fill(c, poly(pts, R, 0.3), '#ffffff', R, { vary: 0.03, sp: 0.7, edge: 0 });
      outline(c, pts.slice(0, 6), R, 0.9, { gap: true, over: 0, col: L.snow.ink });
    }, { tooth: false }) : null,
  };
}
/** STEP7 GROUND-ART: wall bits for a map ground ({ full, half, face, cap|null }), or null for grass (terrain.js bricks). */
export function wallStyle(gr) { return WALLS[gr] || null; }

const ALL_BITS = [sun, cloud, zig, bald, flick, flower, splatB, scorchB, gooB, stumpB];
export function prewarm() { SP.wantBits(...ALL_BITS); }
// map look bits, queued when a map's ground is first used (and the next map ahead)
function wantLook(ground, sky) {
  const S0 = SCATTER[ground]; if (S0) SP.wantBits(...S0.map((e) => e[0]));
  const sk = MA.SKY[sky]; if (sk) SP.wantBits(...[sk.sun === 'pale' ? sunPale : sk.sun === 'red' ? sunRed : sun, sk.cloud === 'grey' ? cloudGrey : sk.cloud === 'smoke' ? smoke : cloud]);
}

// ---------------------------------------------------------------- tiles (CPU canvases at device px)
let grassTile = null, skyTile = null, tileS = 0;
const tiles = new Map(), skies = new Map();   // STEP7: ground -> tile, sky key -> band tile (grass / day stay in grassTile / skyTile)
function wrapped(c, R, bx0, by0, bx1, by1, fn, wrapY = true) {
  const s = (R() * 4294967296) >>> 0;
  for (const dx of [-TILE, 0, TILE]) for (const dy of (wrapY ? [-TILE, 0, TILE] : [0])) {
    if (bx1 + dx < 0 || bx0 + dx > TILE || by1 + dy < 0 || by0 + dy > TILE) continue;
    c.save(); c.translate(dx, dy); fn(rng(s)); c.restore();
  }
}
function paintGrass(S) {
  const n = Math.round(TILE * S), cv = cpuCanvas(n, n), c = cv.getContext('2d', { willReadFrequently: true });
  c.setTransform(n / TILE, 0, 0, n / TILE, 0, 0);
  grainFill(c, grainTile(C.paper, C.paperL, tone(C.paper, -0.06), 31, 160, 0.12, 0.18), 0, 0, TILE, TILE, n / TILE);
  const R = rng(611);
  // fat strokes scrubbed side to side; paper left showing between them
  for (let y = -6; y < TILE; y += 13 + R() * 6) {
    for (let x = -80 + R() * 50; x < TILE; x += 78 + R() * 80) {
      const len = 100 + R() * 130, wv = (R() - 0.5) * 12, w = 20 + R() * 12, col = GR[R() * 4 | 0];
      const pts = [[x, y + wv], [x + len * 0.35, y + (R() - 0.5) * 8], [x + len * 0.7, y + (R() - 0.5) * 8], [x + len, y - wv]];
      wrapped(c, R, x - 4, y - 24, x + len + 4, y + 24, (r) => brush(c, pts, w, col, r, { dry: 0.8, taper: 0.5, vary: 0.06, bristles: 8 }));
    }
  }
  // zigzag scrubs
  for (let i = 0; i < 16; i++) {
    const x = R() * TILE, y = R() * TILE, n2 = 3 + (R() * 5 | 0), amp = 3 + R() * 9, step = 6 + R() * 10, ang = (R() - 0.5) * 1.6, ca = Math.cos(ang), sa = Math.sin(ang), pts = [];
    for (let j = 0; j < n2; j++) { const u = j * step, v = (j % 2 ? amp : -amp) + (R() - 0.5) * 4; pts.push([x + ca * u - sa * v, y + sa * u + ca * v]); }
    const w = 9 + R() * 9, col = GR[R() * 4 | 0], ext = n2 * step + 20;
    wrapped(c, R, x - ext, y - ext, x + ext, y + ext, (r) => brush(c, pts, w, col, r, { dry: 0.6, taper: 0.4, vary: 0.05, bristles: 6, per: 5 }));
  }
  tooth(c, 0, 0, TILE, TILE, 77, 0.22);
  return cv;
}
// STEP7 GROUND-ART: a map ground's tile, the grass method in the ground's palette (an under-wash first so less paper shows
// on the dark / cold grounds). Written as a generator so spare frames can paint it ahead in slices (pumpTiles).
function* paintGroundGen(S, ground, out) {
  const Lk = MA.lookOf(ground), tones = Lk.tones, seed = hash('tile|' + ground);
  const n = Math.round(TILE * S), cv = cpuCanvas(n, n), c = cv.getContext('2d', { willReadFrequently: true });
  c.setTransform(n / TILE, 0, 0, n / TILE, 0, 0);
  grainFill(c, grainTile(C.paper, C.paperL, tone(C.paper, -0.06), 31, 160, 0.12, 0.18), 0, 0, TILE, TILE, n / TILE);
  const R = rng(seed);
  if (Lk.wash) {   // under-wash: broad dry strokes, most of the paper covered
    for (let y = -8; y < TILE; y += 16 + R() * 5) {
      for (let x = -90 + R() * 40; x < TILE; x += 110 + R() * 60) {
        const len = 140 + R() * 120, wv = (R() - 0.5) * 10, w = 26 + R() * 10;
        const pts = [[x, y + wv], [x + len * 0.5, y + (R() - 0.5) * 6], [x + len, y - wv]];
        wrapped(c, R, x - 4, y - 24, x + len + 4, y + 24, (r) => brush(c, pts, w, tone(Lk.wash, (r() - 0.5) * 0.06), r, { dry: 0.35, taper: 0.3, vary: 0.04, bristles: 7 }));
      }
      yield;
    }
  }
  for (let y = -6; y < TILE; y += 13 + R() * 6) {
    for (let x = -80 + R() * 50; x < TILE; x += 78 + R() * 80) {
      const len = 100 + R() * 130, wv = (R() - 0.5) * 12, w = 20 + R() * 12, col = tones[R() * 4 | 0];
      const pts = [[x, y + wv], [x + len * 0.35, y + (R() - 0.5) * 8], [x + len * 0.7, y + (R() - 0.5) * 8], [x + len, y - wv]];
      wrapped(c, R, x - 4, y - 24, x + len + 4, y + 24, (r) => brush(c, pts, w, col, r, { dry: 0.8, taper: 0.5, vary: 0.06, bristles: 8 }));
    }
    yield;
  }
  for (let i = 0; i < 16; i++) {
    const x = R() * TILE, y = R() * TILE, n2 = 3 + (R() * 5 | 0), amp = 3 + R() * 9, step = 6 + R() * 10, ang = (R() - 0.5) * 1.6, ca = Math.cos(ang), sa = Math.sin(ang), pts = [];
    for (let j = 0; j < n2; j++) { const u = j * step, v = (j % 2 ? amp : -amp) + (R() - 0.5) * 4; pts.push([x + ca * u - sa * v, y + sa * u + ca * v]); }
    const w = 9 + R() * 9, col = tones[R() * 4 | 0], ext = n2 * step + 20;
    wrapped(c, R, x - ext, y - ext, x + ext, y + ext, (r) => brush(c, pts, w, col, r, { dry: 0.6, taper: 0.4, vary: 0.05, bristles: 6, per: 5 }));
    if (i % 4 === 3) yield;
  }
  tooth(c, 0, 0, TILE, TILE, seed & 0xffff, ground === 'rock' || ground === 'swamp' ? 0.16 : 0.22);
  out.cv = cv;
}
function paintSky(S, key = 'day') {
  const sk = MA.SKY[key] || MA.SKY.day;
  const H = SKY + 12, n = Math.round(TILE * S), cv = cpuCanvas(n, Math.ceil(H * S)), c = cv.getContext('2d', { willReadFrequently: true });
  const k = n / TILE;
  c.setTransform(k, 0, 0, k, 0, 0);
  grainFill(c, grainTile(C.paper, C.paperL, tone(C.paper, -0.06), 31, 160, 0.12, 0.18), 0, 0, TILE, SKY - 5, k);
  const R0 = rng(96);
  for (let i = 0; i < 4; i++) { const y = 3 + i * 6.5; c.fillStyle = i & 1 ? sk.wash[1] : sk.wash[0]; c.fillRect(0, y - 3.5, TILE, 7.5); }   // pale wash under the strokes
  c.globalAlpha = 1; void R0;
  const R = rng(97);
  const rows = sk.rows;
  for (const [y, w, col, dry] of rows) {
    for (let x = -60 + R() * 30; x < TILE; x += 90 + R() * 45) {
      const len = 110 + R() * 70, wv = (R() - 0.5) * 5;
      const pts = [[x, y + wv], [x + len * 0.5, y + (R() - 0.5) * 4], [x + len, y - wv]];
      wrapped(c, R, x - 4, 0, x + len + 4, H, (r) => brush(c, pts, w, col, r, { dry, taper: 0.4, vary: 0.08 }), false);
    }
  }
  if (sk.flakes || sk.embers) {   // STEP7: snowflakes / embers in the band (wrap: inside the tile only)
    const Rf = rng(98);
    for (let i = 0; i < 26; i++) { const x = 4 + Rf() * (TILE - 8), y = 2 + Rf() * (SKY - 8), r = sk.flakes ? 1.1 + Rf() * 0.8 : 0.7 + Rf() * 0.6;
      dab(c, x, y, r, sk.flakes ? '#ffffff' : (i % 2 ? '#ffb02a' : '#ffe14a'), Rf); }
  }
  tooth(c, 0, 0, TILE, H, 78, 0.2);
  return cv;
}
function tileFor(ground, S) {
  if (ground === 'grass') return grassTile;
  let t = tiles.get(ground);
  if (t) return t;
  const t0 = performance.now(), job = jobs.get(ground) || startJob(ground, S);
  while (!job.g.next().done) { /* finish now */ }
  jobs.delete(ground);
  t = job.out.cv; keepTile(ground, t);
  ST.tileMs = performance.now() - t0;
  return t;
}
function keepTile(ground, t) {
  tiles.set(ground, t);
  while (tiles.size > T.tilesKept - 1) { const k0 = tiles.keys().next().value; if (k0 === ground) break; tiles.delete(k0); }
}
function skyFor(key, S) {
  if (key === 'day') return skyTile;
  let t = skies.get(key);
  if (!t) { t = paintSky(S, key); skies.set(key, t); }
  return t;
}
// Painting ahead (STEP7 GROUND-ART): after the first ~1.5 s, idle time (requestIdleCallback; else a slice every few
// frames) paints the other grounds' tiles, one at a time in slices, and queues every map look bit for sprites.pump, so
// loading a map only lays the layer (no tile or bit painting on the tap).
const jobs = new Map();
function startJob(ground, S) { const out = { cv: null }, job = { g: paintGroundGen(S, ground, out), out, S }; jobs.set(ground, job); return job; }
const AHEAD = ['sand', 'snow', 'dirt', 'rock', 'swamp'];
let aheadAt = 0, framesSeen = 0, idleQueued = false, bitsQueued = false;
const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
function nextAhead() {
  for (const k of jobs.keys()) return k;
  for (const k of AHEAD) if (!tiles.has(k)) return k;
  return null;
}
let sketchesDone = false, idleRoom = 0;
const moreAhead = () => nextAhead() !== null || skies.size < Object.keys(MA.SKY).length - 1 || (!sketchesDone && !!ric);
function aheadSlice(S, budget) {   // paint some of the next ground tile (then the skies); false = nothing left
  const gr = nextAhead();
  if (!gr || tiles.size >= T.tilesKept - 1) {
    for (const k in MA.SKY) if (k !== 'day' && !skies.has(k)) { skyFor(k, S); return true; }
    if (!sketchesDone && idleRoom >= 8 && (!world || world.liveCount < 60)) { sketchesDone = !MA.prewarmThumbs(); return false; }   // the maps panel's card sketches (a map build each, ~5-20 ms: one per idle gap, only while the field is quiet)
    return false;
  }
  const job = jobs.get(gr) || startJob(gr, S);
  if (job.S !== S) { jobs.delete(gr); return true; }
  const t0 = performance.now();
  while (performance.now() - t0 < budget) { if (job.g.next().done) { jobs.delete(gr); keepTile(gr, job.out.cv); break; } }
  return true;
}
function pumpTiles(S) {
  if (++framesSeen < 90) return;                       // let the first second or so of the page go by
  if (!bitsQueued) { bitsQueued = true; SP.wantBits(sunPale, sunRed, cloudGrey, smoke, glowSoft, ...Object.values(SCATTER).flat().map((e) => e[0]), ...Object.values(decoBits), ...Object.values(WALLS).flatMap((w) => [w.full, w.half, w.face, w.cap].filter(Boolean))); }
  if (!moreAhead()) return;
  if (ric) {
    if (idleQueued) return;
    idleQueued = true;
    ric((dl) => {
      idleQueued = false;
      if (tileS !== S) return;
      while ((idleRoom = dl.timeRemaining()) > 3 && aheadSlice(S, Math.min(T.idleTileMs, idleRoom - 2))) { /* more */ }
      // no idle gap for 2 s (a busy page): the card sketches still come, one per timeout, while the field is quiet
      if (dl.didTimeout && !nextAhead() && !sketchesDone && (!world || world.liveCount < 60)) sketchesDone = !MA.prewarmThumbs();
      idleRoom = 0;
    }, { timeout: 2000 });
    return;
  }
  const now = performance.now(); if (now < aheadAt) return;
  aheadSlice(S, T.idleTileMs);
  aheadAt = performance.now() + 120;                   // a slice every few frames at most
}

// ---------------------------------------------------------------- the ground canvas
let gcv = null, g = null, gW = 0, gH = 0, gS = 0, fieldW = 0, fieldH = 0, dirty = true;
// STEP7 GROUND-ART: the map the layer was laid for
let world = null, mapId = '', mapGround = '', ground = 'grass', sky = 'day', warmed = false;
const ST = { relayMs: 0, tileMs: 0, decoMs: 0, ground: 'grass', sky: 'day', deco: 0, top: 0, shore: 0, unknown: [] };
export function stats() { return { ...ST, tilesKept: [...tiles.keys()], thumb: MA.thumbStats() }; }
// decal list (kept for resize re-stamps), ring of DCAP
const DCAP = 4096;
const dX = new Float32Array(DCAP), dY = new Float32Array(DCAP), dSc = new Float32Array(DCAP), dRot = new Float32Array(DCAP);
const dKind = new Uint8Array(DCAP), dVar = new Uint8Array(DCAP);
let dHead = 0, dCount = 0;
// bodies painted into the ground (floppy bodies, index.js drawCorpses): ring of BCAP, up to BP parts each, kept for re-lays
const BCAP = 2048, BP = 8;
const bK = new Float64Array(BCAP * BP), bM = new Float64Array(BCAP * BP * 6), bN = new Uint8Array(BCAP), bA = new Float32Array(BCAP);
let bHead = 0, bCount = 0;
// bits painted with a body (its stuck arrows): ring of ACAP
const ACAP = 4096, aBit = new Array(ACAP).fill(null), aX = new Float32Array(ACAP), aY = new Float32Array(ACAP), aSc = new Float32Array(ACAP), aRot = new Float32Array(ACAP);
let aHead = 0, aCount = 0;
// STEP7 GROUND-ART: decorations drawn over the terrain each frame (drawTop): kind index, place, scale, turn, flip, variant
const TOPK = ['flag', 'reeds', 'lilypad', 'slide', 'glow'];
const tK = new Uint8Array(T.topCap), tX = new Float32Array(T.topCap), tY = new Float32Array(T.topCap), tSc = new Float32Array(T.topCap), tRot = new Float32Array(T.topCap), tF = new Int8Array(T.topCap), tV = new Uint8Array(T.topCap);
let tN = 0;

export function canvasOf() { return gcv; }
/** Make sure the ground matches the canvas size and scale. w,h device px; S device px per sim px. world (STEP7): the
 *  map's ground, sky and decorations come from world.map; the layer is re-laid when the map (id / ground) changes. */
export function ensure(w, h, S, W, H, wld) {
  if (!gcv) { gcv = layerCanvas(); g = gcv.getContext('2d'); }
  if (gW !== w || gH !== h || gS !== S) {
    gcv.width = gW = w; gcv.height = gH = h; gS = S; fieldW = W; fieldH = H; dirty = true;
  }
  if (wld) {   // STEP7 GROUND-ART
    world = wld;
    const m = wld.map, id = m ? m.id : '', gr = m ? m.ground : '';
    if (id !== mapId || gr !== mapGround) { mapId = id; mapGround = gr; dirty = true; }   // (no strings built per frame)
    if (!warmed) { warmed = true; MA.warm(); }
    MA.setLiveSize(W, H);
  }
  if (dirty) relay();
  else if (tileS === S) pumpTiles(S);
  return gcv;
}
export function clear() { dHead = 0; dCount = 0; bHead = 0; bCount = 0; aHead = 0; aCount = 0; aBit.fill(null); dirty = true; }
export function markDirty() { dirty = true; }

function put(spr, x, y, sc, rot, flip) {
  const m = sc * gS / spr.k, cs = Math.cos(rot) * m, sn = Math.sin(rot) * m;
  g.setTransform(cs * flip, sn * flip, -sn, cs, x * gS, y * gS);
  g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
function relay() {
  const t0 = performance.now();
  dirty = false;
  const S = gS;
  if (!grassTile || tileS !== S) { grassTile = paintGrass(S); skyTile = paintSky(S); tileS = S; tiles.clear(); skies.clear(); jobs.clear(); }
  const map = world && world.map;
  ground = map && MA.LOOK[map.ground] ? map.ground : 'grass';
  sky = MA.skyOf(map);
  ST.ground = ground; ST.sky = sky; ST.tileMs = 0;
  if (ground !== 'grass') wantTrees(ground);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const tl = tileFor(ground, S), tA = performance.now();
  g.fillStyle = g.createPattern(tl, 'repeat');
  g.fillRect(0, 0, gW, gH);
  const tB = performance.now();
  // scatter (deterministic for the field size)
  const W = gW / S, H = gH / S, R = rng(4242), area = W * H;
  if (ground === 'grass') {
    const nb = Math.round(area / 90000), nz = Math.round(area / 9000), nf = Math.round(area / 2600), nfl = Math.round(area / 14000);
    for (let i = 0; i < nb; i++) put(SP.bit(bald, i % 4), R() * W, SKY + 20 + R() * (H - SKY - 20), 0.8 + R() * 0.8, (R() - 0.5) * 0.4, R() < 0.5 ? 1 : -1);
    for (let i = 0; i < nz; i++) put(SP.bit(zig, (R() * 8) | 0), R() * W, SKY + R() * H, 0.9 + R() * 0.5, R() * TAU, 1);
    for (let i = 0; i < nf; i++) put(SP.bit(flick, (R() * 4) | 0), R() * W, SKY + 14 + R() * (H - SKY - 14), 1, 0, R() < 0.5 ? 1 : -1);
    for (let i = 0; i < nfl; i++) put(SP.bit(flower, i % 3), 10 + R() * (W - 20), SKY + 24 + R() * (H - SKY - 30), 1, 0, 1);
  } else scatterGround(ground, W, H, area);
  const tC = performance.now();
  tN = 0;
  if (map) layMap(map, W, H);
  const tD = performance.now();
  // sky band, sun, cloud
  const sk = MA.SKY[sky] || MA.SKY.day, st = skyFor(sky, S);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = g.createPattern(st, 'repeat-x');
  g.fillRect(0, 0, gW, st.height);
  if (sk.sun) put(SP.bit(sk.sun === 'pale' ? sunPale : sk.sun === 'red' ? sunRed : sun, 0), 34, 20, sk.bigSun ? 1.2 : 1, 0, 1);
  const cl = sk.cloud === 'grey' ? cloudGrey : sk.cloud === 'smoke' ? smoke : cloud;
  put(SP.bit(cl, 0), W * 0.56, 15, 1, 0, 1);
  if (W > 700) put(SP.bit(cl, cl.n > 1 ? 1 : 0), W * 0.28, 13, 0.8, 0, -1);
  if (sk.cloud !== 'cloud' && W > 1400) put(SP.bit(cl, 0), W * 0.84, 14, 0.9, 0, 1);
  const tE = performance.now();
  // decals, oldest first
  const start = dCount < DCAP ? 0 : dHead;
  for (let n = 0; n < dCount; n++) { const i = (start + n) % DCAP; stampNow(i); }
  const b0 = bCount < BCAP ? 0 : bHead;
  for (let n = 0; n < bCount; n++) bodyNow((b0 + n) % BCAP);
  const a0 = aCount < ACAP ? 0 : aHead;
  for (let n = 0; n < aCount; n++) { const i = (a0 + n) % ACAP, spr = aBit[i] && SP.bit(aBit[i], 0); if (spr) put(spr, aX[i], aY[i], aSc[i], aRot[i], 1); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  touched(gcv, 0, 0, gW, gH);
  ST.relayMs = performance.now() - t0;
  ST.parts = [tA - t0, tB - tA, tC - tB, tD - tC, tE - tD, performance.now() - tE].map((v) => Math.round(v * 10) / 10);   // tile, fill, scatter, map, sky, decals
}
// STEP7 GROUND-ART: a map ground's scatter (same idea as the grass: big patches, zigzags, small marks, features)
function scatterGround(gr, W, H, area) {
  const list = SCATTER[gr]; if (!list) return;
  const R = rng(hash('scatter|' + gr));
  for (const [b, per, s0, ds, rot, fl] of list) {
    const n = Math.round(area / per);
    for (let i = 0; i < n; i++) put(SP.bit(b, (R() * b.n) | 0), R() * W, SKY + 6 + R() * (H - SKY - 6), s0 + R() * ds, rot ? (R() - 0.5) * TAU * rot : 0, fl && R() < 0.5 ? -1 : 1);
  }
}
// STEP7 GROUND-ART: wet shore (sand, swamp), decorations, the drawTop list
const SHORE = { sand: [wetB, 1.15], swamp: [puddleB, 1] };   // (dirt: the canyon's banks are walls: a damp rim never showed)
function layMap(map, W, H) {
  const t0 = performance.now();
  ST.shore = 0; ST.unknown.length = 0; tN = 0;
  const sh = SHORE[ground];
  if (sh && world && world.waterCells > 0 && world.water && world.tileCols) shore(sh[0], sh[1]);
  const deco = map.deco || [];
  let nd = 0;
  for (let i = 0; i < deco.length; i++) {
    const d = deco[i], kind = d.kind, s = d.s > 0 ? d.s : 1, f = d.f < 0 ? -1 : 1;
    const v = hash(`${kind}|${d.x | 0}|${d.y | 0}`);
    if (kind === 'glowcrack' && tN < T.topCap) addTop(4, d.x, d.y, s, d.a || 0, 1, 0);
    if (TOP_KINDS[kind]) {
      if (tN < T.topCap) addTop(TOPK.indexOf(kind), d.x, d.y, s, FLAT[kind] ? d.a || 0 : 0, FLAT[kind] ? 1 : f, kind === 'flag' ? (d.x < W / 2 ? 0 : 1) : v % decoBits[kind].n);
      continue;
    }
    const b = decoBits[kind];
    if (!b) { if (!ST.unknown.includes(kind)) ST.unknown.push(kind); continue; }
    const spr = SP.bit(b, v % b.n);
    if (spr) { put(spr, d.x, d.y, s, FLAT[kind] ? d.a || 0 : 0, FLAT[kind] ? 1 : f); nd++; }
  }
  ST.deco = nd; ST.top = tN; ST.decoMs = performance.now() - t0;
  if (ST.unknown.length) console.warn('ground: unknown decoration kinds', ST.unknown.join(', '));
}
function addTop(k, x, y, s, rot, f, v) { tK[tN] = k; tX[tN] = x; tY[tN] = y; tSc[tN] = s; tRot[tN] = rot; tF[tN] = f; tV[tN] = v; tN++; }
// shore: every wet tile within shoreReach of a dry one gets a darker blob (it shows only on the dry side: water covers it)
function shore(b, sc) {
  const wl = world.water, cols = world.tileCols, rows = world.tileRows, t = 8, st = T.shoreStep, rr = T.shoreReach, R = rng(515);
  const wet = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows ? true : wl[y * cols + x] >= 0.05;
  let n = 0;
  for (let ty = 0; ty < rows; ty += st) for (let tx = (ty / st) & 1; tx < cols; tx += st) {
    if (!(wl[ty * cols + tx] >= 0.05)) continue;
    if (wet(tx - rr, ty) && wet(tx + rr, ty) && wet(tx, ty - rr) && wet(tx, ty + rr)) continue;
    const spr = SP.bit(b, n % b.n);
    if (spr) put(spr, (tx + 0.5) * t, (ty + 0.5) * t, sc * T.wetScale * (0.8 + R() * 0.4), (R() - 0.5) * 0.8, R() < 0.5 ? -1 : 1);
    n++;
  }
  ST.shore = n;
}
// themed tree sprites for this ground: their first frames baked ahead so a map never flashes plain trees
let treeEnt = null;
function wantTrees(gr) {
  try {
    if (!treeEnt) treeEnt = SP.entOf('tree').ent;
    const base = MA.treeThemed('idle', { world: { map: { ground: gr } } });
    if (!base || base === 'idle') return;
    for (const p of [base, base + '1', base + '2']) {
      const pi = treeEnt.pose(p); if (pi < 0) continue;
      if (p === base) SP.getNow(SP.key(treeEnt.id, 0, pi, 0, 0, 0)); else SP.want(SP.key(treeEnt.id, 0, pi, 0, 0, 0));
    }
    for (const p of [base, base + '1', base + '2']) { const pi = treeEnt.pose(p); if (pi >= 0) for (let v = 1; v < 3; v++) SP.want(SP.key(treeEnt.id, 0, pi, v, 0, 0)); }
    wantLook(gr, sky);
  } catch (e) { /* the tree entry is optional */ }
}
/** STEP7 GROUND-ART: decorations that stand up or float (flag, reeds, lilypad, slide) and the glowing cracks' pulse,
 *  drawn over the terrain layer (index.js calls it after TER.drawLayers). Atlas bits only; nothing allocated. */
export function drawTop(ctx, wld, S, rt) {
  if (!tN || !wld || !wld.map) return;
  const wl = wld.water, cols = wld.tileCols, rows = wld.tileRows;
  for (let i = 0; i < tN; i++) {
    const k = tK[i];
    if (k === 4) {   // glow pulse (additive)
      const spr = SP.bit(glowSoft, 0); if (!spr) continue;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.22 * Math.sin(rt * T.glowRate + tX[i] * 0.05);
      tput(ctx, spr, tX[i], tY[i], tSc[i], tRot[i], 1, S);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      continue;
    }
    if (k === 2 && wl && cols) {   // a lily pad only floats while there's water under it
      const tx = Math.floor(tX[i] / 8), ty = Math.floor(tY[i] / 8);
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || !(wl[ty * cols + tx] >= 0.05)) continue;
    }
    const b = decoBits[TOPK[k]], spr = SP.bit(b, tV[i] % b.n);
    if (spr) tput(ctx, spr, tX[i], tY[i], tSc[i], tRot[i], tF[i], S);
  }
}
function tput(ctx, spr, x, y, sc, rot, flip, S) {
  const m = sc * S / spr.k, cs = Math.cos(rot) * m, sn = Math.sin(rot) * m;
  ctx.setTransform(cs * flip, sn * flip, -sn, cs, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
function stampNow(i) {
  const b = DECAL[dKind[i]];
  const spr = SP.bit(b, dVar[i] % b.n);
  if (spr) put(spr, dX[i], dY[i], dSc[i], dRot[i], 1);
  return spr;
}
/** Stamp a decal (kind = DK.*) at (x, y) sim px, scale 1 = a 9.5-radius body. */
export function stamp(kind, x, y, sc) {
  const i = dHead; dHead = (dHead + 1) % DCAP; if (dCount < DCAP) dCount++;
  const h = hash(`${x | 0},${y | 0},${kind}`);
  dX[i] = x; dY[i] = y; dSc[i] = sc; dKind[i] = kind; dVar[i] = h % 251; dRot[i] = ((h >>> 8) % 1000) / 1000 * 0.5 - 0.25;
  if (gcv && !dirty) {
    const spr = stampNow(i); g.setTransform(1, 0, 0, 1, 0, 0);
    if (spr) { const m = sc * gS / spr.k, R = m * Math.hypot(Math.max(spr.ax, spr.sw - spr.ax), Math.max(spr.ay, spr.sh - spr.ay)) + 2; touched(gcv, x * gS - R, y * gS - R, 2 * R, 2 * R); }
  }
}

// ---------------------------------------------------------------- bodies painted into the ground
let BX0 = 0, BY0 = 0, BX1 = 0, BY1 = 0;
function bodyNow(i) {
  BX0 = BY0 = 1e9; BX1 = BY1 = -1e9;
  g.globalAlpha = bA[i];
  for (let p = 0; p < bN[i]; p++) {
    const spr = SP.getNow(bK[i * BP + p]);
    if (!spr) continue;
    const o = (i * BP + p) * 6, ik = gS / spr.k;
    const a = bM[o] * ik, b = bM[o + 1] * ik, c = bM[o + 2] * ik, d = bM[o + 3] * ik, e = bM[o + 4] * gS, f = bM[o + 5] * gS;
    g.setTransform(a, b, c, d, e, f);
    g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
    for (let q = 0; q < 4; q++) {
      const x = (q & 1 ? spr.sw : 0) - spr.ax, y = (q & 2 ? spr.sh : 0) - spr.ay, X = a * x + c * y + e, Y = b * x + d * y + f;
      if (X < BX0) BX0 = X; if (X > BX1) BX1 = X; if (Y < BY0) BY0 = Y; if (Y > BY1) BY1 = Y;
    }
  }
  g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0);
}
/** Paint a body into the ground for good. arr = [key, a, b, c, d, e, f] per part (entry units -> sim px), alpha. */
export function stampBody(arr, alpha = 1) {
  const n = Math.min(BP, (arr.length / 7) | 0);
  if (!n) return;
  const i = bHead; bHead = (bHead + 1) % BCAP; if (bCount < BCAP) bCount++;
  bN[i] = n; bA[i] = alpha;
  for (let p = 0; p < n; p++) { bK[i * BP + p] = arr[p * 7]; for (let q = 0; q < 6; q++) bM[(i * BP + p) * 6 + q] = arr[p * 7 + 1 + q]; }
  if (gcv && !dirty) {
    bodyNow(i);
    if (BX1 > BX0) touched(gcv, BX0 - 2, BY0 - 2, BX1 - BX0 + 4, BY1 - BY0 + 4);
  }
}
export function bodyCount() { return bCount; }
/** Paint bit handle's variant 0 into the ground for good at (x, y) sim px, scale sc, turned rot (a body's stuck arrow). */
export function stampBit(handle, x, y, sc, rot) {
  const i = aHead; aHead = (aHead + 1) % ACAP; if (aCount < ACAP) aCount++;
  aBit[i] = handle; aX[i] = x; aY[i] = y; aSc[i] = sc; aRot[i] = rot;
  if (gcv && !dirty) {
    const spr = SP.bit(handle, 0); if (!spr) return;
    put(spr, x, y, sc, rot, 1); g.setTransform(1, 0, 0, 1, 0, 0);
    const m = sc * gS / spr.k, R = m * Math.hypot(Math.max(spr.ax, spr.sw - spr.ax), Math.max(spr.ay, spr.sh - spr.ay)) + 2;
    touched(gcv, x * gS - R, y * gS - R, 2 * R, 2 * R);
  }
}
