// Lava, Mud, Bridge, Trampoline in the POSTER PAINT look (Part 2 step 7, STEP7.md "TERRAIN-ART"). Owner: TERRAIN-ART.
// Same method as terrain.js: the grids are diffed against shadow copies when a version moves and only the changed box
// (plus a margin) of a cached device-px layer is cleared and repainted under a clip. Nothing is painted stroke by stroke
// at run time: bodies are one path fill each with a painted pattern, the marks on them are atlas bits.
//   under layer (drawn BEFORE terrain.js's layer, so walls stand on it and water's outline laps over it):
//     mud  = black outline, a lighter tan rim, glossy chocolate middle, darker puddles with white gloss, splotches;
//     lava = black outline, dark red rim, hot orange middle with yellow swirls and hot spots, a crust of dark blobs on
//            the edge. A tiny glow canvas (1 texel per tile) is laid over it with 'lighter' and a slow pulse.
//   over layer (drawn AFTER terrain.js's layer, before oil): bridges = a shadow on the water under them, black outline,
//     a rope rail round the edge, planks laid across the stroke (bridgeAng) clipped inside the rail, posts on the
//     sides, cracked planks, charred burning planks; broken planks leave floating splinters. Basalt bricks over walls
//     the sim marks as lava rock.
//   per frame (drawProps7): lava bubbles that rise and pop (capped), burning-plank flames (fx fireOn, capped), muddy
//     footprints behind units with u.muddy (ring buffer, fading), trampolines in three-quarter view (squash + stretch
//     after a bounce, torn / burnt mats the sim keeps).
// Hooks (marked STEP7 TERRAIN-ART): terrain.js drawLayers (pass 0 / 1), drawProps, drawSwatch, prewarm, reset, and
// toolColor7 re-exported there for index.js toolColor.
import { C, TAU, rng, hash, brush, ring, fill, outline, part, poly, shift, dab, tone, tube, canvas as cpuCanvas, tooth, M0 } from './paint.js';
import * as SP from './sprites.js';
import { layerCanvas, touched } from './gpu.js';
import { wallStyle } from './ground.js';   // GROUND-ART: per-ground wall pieces ('rock' = basalt rubble for lava rock)
let FX = null;   // fx.js imports terrain.js, which imports this file: load it late (it is there by the first frame)
import('./fx.js').then((m) => { FX = m; }, () => { FX = null; });

const T = {
  tile: 8,               // sim px: the terrain tile (grid.js TILE)
  inkR: 8.6,             // outline circle radius on edge tiles (sim px; terrain.js water uses 8.4)
  rimR: 7.0,             // rim fill radius on every tile; the fill misses the line by (0.8, 0.7)
  coreR: 7.4,            // middle fill radius on tiles 2+ in from the edge
  wob: 1,                // edge wobble scale (terrain.js water = 1)
  glowA: 0.2,            // lava glow pulse peak alpha ('lighter')
  glowLo: 0.35,          // glow pulse low point (fraction of the peak)
  glowP: 2.8,            // s per glow pulse
  bubbleCap: 28,         // lava bubbles at once (whole field)
  bubbleEvery: 30,       // one bubble per this many middle lava tiles (up to the cap)
  bubbleDur: 1.1,        // s a bubble lives (rise, dome, pop), ±40 %
  fpCap: 256,            // muddy footprints kept (ring buffer)
  fpStep: 13,            // sim px walked between two footprints (x unit size)
  fpLife: 4,             // s a footprint lasts (fades over the last 2 s)
  plankW: 8,             // sim px plank width along the stroke (= tile, so every plank gets a tile)
  ropeR: 6.6,            // rope rail outer radius (edge tiles)
  plankR: 4.4,           // plank clip radius on edge tiles (the rail shows between this and ropeR)
  bridgeInk: 7.8,        // bridge outline radius
  crackHp: 0.6,          // plank drawn cracked below this fraction of its full hp
  fireCap: 120,          // burning-plank flames drawn per frame
  splCap: 160,           // splinters kept (broken planks: they float on water / lava, lie still on land)
  splLife: 6,            // s splinters stay (fade over the last 1.5 s)
  boingT: 0.42,          // s of squash + stretch after a bounce
  paintMs: 6,            // ms of layer painting (+ its upload) per frame while a big repaint is queued (map load)
  terMs: 4,              // ms of terrain.js layer painting per frame while its big repaint is queued (its upload comes on top)
  padR: 14,              // trampoline pad radius (sim, STEP7.md)
};
const T8 = T.tile;

// ---------------------------------------------------------------- sim fields (TERRAIN-SIM stores, sim/terrain/*.js headers)
// world.lava7 { grid (1 lava), cells, version, rock (1 = wall made of lava rock), rockCells, rockVersion }
// world.mud7 { grid, cells, version }; units: u.muddy (world.time it stays muddy until)
// world.bridge7 { hp (0 none), ang (stroke rad), fire (> 0 burning), fireList + burning, list + listN + listVersion,
//                 cells, version, fireVersion, brokeAt? (world.time a plank broke, not erased: asked) }
// world.tramp7 { x, y, state (0 free, 1 ok, 2 torn, 3 burnt), boingAt, deadAt, high, count, kept, version, r }
// All on the 8 px tiles of world.walls (cols x rows). A store that is missing or empty draws nothing and costs nothing.
const BRIDGE_HP = 60;
const lavaCount = (world) => { const L = world.lava7; return L !== undefined ? L.cells : 0; };
const mudCount = (world) => { const M = world.mud7; return M !== undefined ? M.cells : 0; };

// ---------------------------------------------------------------- bits
const LAVA_RIM = '#b8221a', LAVA_RIM_D = '#8c1712', LAVA_HOT = '#fff3b0';
const CRUST = ['#4a3c36', '#5a4840', '#3a2f2a', '#62504a'];
const MUD = '#6b4026', MUD_D = '#4e2c18', MUD_L = '#a8764a', MUD_LL = '#c4925e', GLOSS = '#f3e6d2';
const WOOD = ['#c08a4c', '#a8703a', '#d39a58', '#b67c42'], ROPE = '#dcb878', ROPE_D = '#a8854a';

const lavaSwirl = SP.defineBit('lavaSwirl', 3, [40, 28, 20, 14], (c, R) => {
  for (let i = 0; i < 3; i++) {
    const pts = [], r0 = 0.25 + i * 0.27, ph = R() * TAU;
    for (let j = 0; j <= 9; j++) { const a = ph + j / 9 * TAU * 0.8, rr = r0 + j * 0.03; pts.push([Math.cos(a) * 18 * rr, Math.sin(a) * 11 * rr]); }
    brush(c, pts, 2.4, i % 2 ? LAVA_HOT : C.fireY, R, { dry: 0.45, taper: 0.5, bristles: 4 });
  }
}, { tooth: false });
const lavaHot = SP.defineBit('lavaHot', 3, [16, 12, 8, 6], (c, R) => {
  dab(c, 0, 0, 4.2, C.fireY, R, 0.3); dab(c, -0.4, -0.3, 2.4, LAVA_HOT, R, 0.25);
}, { tooth: false });
const crust = SP.defineBit('crust', 4, [18, 15, 9, 7.5], (c, R, v, M) => {
  const pts = ring(0, 0, 5.2 + (v & 1) * 1.4, 3.8 + (v >> 1) * 0.8, R, 0.22, 8);
  part(c, pts, CRUST[v], M, { lw: 1.15, vary: 0.12, sp: 0.8 });
  brush(c, [[-2.6, -0.4], [-0.6, 0.6], [1.6, -0.6]], 0.7, v & 1 ? C.fireO : C.fireR, R, { bristles: 1, dry: 0.3, taper: 0.5 });
  dab(c, 1.4, -1.6, 0.8, tone(CRUST[v], 0.25), R);
});
// bubble phases: 0 small bump, 1 big dome with a shine, 2 burst (ink ring + flung drops), 3 ripple ring
const bubble = SP.defineBit('lavaBubble', 4, [22, 20, 11, 11], (c, R, v) => {
  if (v === 0) { dab(c, 0, 0, 2.9, C.ink, R, 0.15); dab(c, 0, 0, 2.1, C.fireY, R, 0.15); dab(c, -0.6, -0.7, 0.7, LAVA_HOT, R); return; }
  if (v === 1) { dab(c, 0, 0, 5, C.ink, R, 0.12); dab(c, 0.3, 0.3, 4, C.fireO, R, 0.12); dab(c, -0.4, -0.4, 2.8, C.fireY, R, 0.15); brush(c, [[-2.6, -1.2], [-1.4, -2.6]], 0.9, '#ffffff', R, { bristles: 2, dry: 0.2 }); return; }
  if (v === 2) {
    const pts = ring(0, 0, 5.4, 4.6, R, 0.2, 9); brush(c, pts.concat([pts[0]]), 0.9, C.ink, R, { bristles: 2, dry: 0.45, taper: 0 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + R() * 0.5, d = 6.5 + R() * 2.5; dab(c, Math.cos(a) * d, Math.sin(a) * d, 1 + R() * 0.6, i & 1 ? C.fireY : C.fireO, R, 0.3); }
    dab(c, 0, 0, 2.2, C.fireR, R); return;
  }
  const pts = ring(0, 0, 6.4, 5.2, R, 0.15, 10); brush(c, pts.concat([pts[0]]), 0.8, C.fireY, R, { bristles: 2, dry: 0.5, taper: 0 });
}, { tooth: false });
const puddle = SP.defineBit('mudPuddle', 3, [34, 20, 17, 10], (c, R, v) => {
  const pts = ring(0, 0, 12 + v * 1.5, 6 + v, R, 0.2, 10);
  fill(c, pts, MUD_D, R, { vary: 0.08, sp: 0.9, edge: 0 });
  brush(c, [[-7, -2.4], [-3.5, -4], [0.5, -4.2]], 1.3, GLOSS, R, { bristles: 3, dry: 0.45, taper: 0.6 });
  dab(c, 3.4, -3.6, 0.9, GLOSS, R);
}, { tooth: false });
const gloss = SP.defineBit('mudGloss', 3, [14, 9, 7, 4.5], (c, R) => {
  brush(c, [[-4, 1], [-0.6, -1.2], [3.4, -0.6]], 1.1, GLOSS, R, { bristles: 2, dry: 0.35, taper: 0.5 });
  dab(c, 4.2, 0.6, 0.6, '#ffffff', R);
}, { tooth: false });
const splot = SP.defineBit('mudSplot', 4, [12, 12, 6, 6], (c, R, v) => {
  const col = v & 1 ? MUD_D : tone(MUD, 0.18);
  dab(c, 0, 0, 2.2 + (v >> 1), col, R, 0.35);
  for (let i = 0; i < 3; i++) { const a = R() * TAU, d = 3.2 + R() * 1.6; dab(c, Math.cos(a) * d, Math.sin(a) * d, 0.6 + R() * 0.4, col, R); }
}, { tooth: false });
// a boot print pointing +x (toe right), left / right foot by variant
const footB = SP.defineBit('mudFoot', 2, [12, 9, 6, 4.5], (c, R, v) => {
  const s = v ? 1 : -1;
  const sole = [[-0.6, -1.6], [2.4, -1.9], [3.8, -0.6], [3.6, 1.2], [1.6, 1.8], [-0.8, 1.3]];
  fill(c, sole.map(([x, y]) => [x, y * s]), MUD_D, R, { vary: 0.08, edge: 0, sp: 0.6 });
  dab(c, -3, 0.1 * s, 1.45, MUD_D, R, 0.2);
  dab(c, 2.2, -0.5, 0.7, tone(MUD_D, 0.2), R);
}, { tooth: false });
// one plank segment: width plankW along x (= the stroke), seams along y; v = state * 4 + tone (state 0 ok, 1 cracked, 2 charred)
const plankB = SP.defineBit('plank', 12, [12, 16, 6, 8], (c, R, v) => {
  const st = (v / 4) | 0, base = st === 2 ? C.char : WOOD[v & 3];
  const pts = [[-4.3, -7.6], [4.3, -7.6], [4.3, 7.6], [-4.3, 7.6]];
  fill(c, shift(pts, 0.35, 0, 0), base, R, { sharp: true, ang: Math.PI / 2, sp: 0.75, vary: 0.13, edge: 0 });
  if (st < 2) { const x = (R() - 0.5) * 3; brush(c, [[x, -7.8], [x + (R() - 0.5) * 0.8, 0], [x, 7.8]], 0.45, tone(base, -0.18), R, { bristles: 1, dry: 0.5, taper: 0 }); brush(c, [[-3, -7.8], [-3.1, 7.8]], 0.8, tone(base, 0.22), R, { bristles: 1, dry: 0.4, taper: 0 }); }
  else for (let i = 0; i < 3; i++) dab(c, (R() - 0.5) * 5, (R() - 0.5) * 12, 0.7 + R() * 0.5, i & 1 ? C.fireO : C.fireR, R);
  if (st === 1) brush(c, [[-4, -1.6], [-1.6, 0.4], [0.4, -0.8], [2.2, 1.4], [4, 0.6]], 0.75, C.ink, R, { bristles: 1, dry: 0.1, taper: 0.2 });
  brush(c, [[4.1, -8.2], [4.2, 8.2]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0, swell: 0 });   // one seam per plank
}, { tooth: false });
const postB = SP.defineBit('post', 3, [9, 9, 4.5, 4.5], (c, R, v, M) => {
  part(c, ring(0, 0, 2.7, 2.6, R, 0.12, 7), v === 2 ? C.char : '#7a4a22', M, { lw: 1, edge: 0 });
  brush(c, ring(0.2, 0.2, 1.2, 1.1, R, 0.1, 6).concat([[1.4, 0.2]]), 0.45, v === 2 ? C.charL : '#a8723a', R, { bristles: 1, dry: 0.2, taper: 0 });
});
const splinter = SP.defineBit('splinter', 4, [14, 10, 7, 5], (c, R, v) => {
  const n = 2 + (v & 1);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, l = 2.4 + R() * 2.6, x = (R() - 0.5) * 6, y = (R() - 0.5) * 4, ca = Math.cos(a) * l, sa = Math.sin(a) * l;
    tube(c, [[x - ca, y - sa], [x + ca, y + sa]], 0.9, v >= 2 ? C.charL : WOOD[(i + v) & 3], R, 0.55);
  }
}, { tooth: false });
// trampoline from above (anchor = centre, radius 14.5): red padded rim, a ring of zigzag springs, black mat.
// v: 0 / 1 boil, 2 mat pushed in (the moment of a bounce), 3 / 4 torn (mat ripped open, springs loose),
// 5 / 6 burnt (charred rim, ash mat with holes, springs black)
function padPaint(c, R, v, M) {
  const torn = v >= 3 && v <= 4, burnt = v >= 5;
  const rim = ring(0, 0, 14.3, 14.3, R, 0.05, 14);
  part(c, rim, burnt ? C.char : C.red, M, { lw: 1.6, vary: 0.1, sp: 0.9 });
  brush(c, ring(0, 0, 13.1, 13.1, R, 0.04, 12).slice(1, 6), 1, burnt ? C.charL : tone(C.red, 0.35), R, { bristles: 2, dry: 0.5, taper: 0.4 });
  if (burnt) for (let k = 0; k < 4; k++) { const a = R() * TAU; dab(c, Math.cos(a) * 12.8, Math.sin(a) * 12.8, 1.2, k & 1 ? C.fireO : tone(C.red, -0.3), R); }
  // the springs: a zigzag all the way round between the mat and the rim (silver on a dark gap)
  dab(c, 0, 0, 11.2, '#2a2a30', R, 0.04);
  const zz = []; const nz = 30;
  for (let i = 0; i <= nz; i++) { const a = i / nz * TAU, r = i & 1 ? 11.2 : 9.2; zz.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const sc = burnt ? '#55524f' : '#d8dde4';
  if (!torn && !burnt) brush(c, zz, 0.85, sc, R, { bristles: 2, dry: 0, taper: 0, swell: 0, per: 2 });
  else for (let k = 0; k < 4; k++) { const s0 = k * 7 + (R() * 3 | 0); brush(c, zz.slice(s0, s0 + 5), 0.85, torn ? '#c4c9d0' : sc, R, { bristles: 2, dry: 0, taper: 0, swell: 0, per: 2 }); }
  if (!torn && !burnt) {
    const mat = ring(0, 0, 9.3, 9.3, R, 0.04, 12);
    part(c, mat, v === 2 ? '#141418' : '#26262c', M, { lw: 1.2, vary: 0.06, sp: 0.9, edge: 0 });
    if (v === 2) { for (let r = 3; r <= 7; r += 2) { const p = ring(0, 0, r, r, R, 0.08, 9); brush(c, p.concat([p[0]]), 0.5, '#4a4a54', R, { bristles: 1, dry: 0.3, taper: 0 }); } }
    else { brush(c, [[-5.6, -3.4], [-2.6, -5.8], [1, -6.4]], 1.4, '#5a5a66', R, { bristles: 3, dry: 0.4, taper: 0.5 }); dab(c, 3.2, 3, 0.9, '#44444e', R); }
  } else if (torn) {
    // ripped: the ground shows through a ragged hole (cut out, so any map's ground), black flaps curl at the edge
    c.save(); c.globalCompositeOperation = 'destination-out'; dab(c, 0, 0, 9.6, '#000', R, 0.1); c.restore();
    dab(c, 0, 0, 9.4, 'rgba(16,24,8,0.3)', R, 0.1);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + R() * 0.8, a0 = a - 0.45, a1 = a + 0.45, rr = 9.4, l = 3.4 + R() * 3;
      const pts = [[Math.cos(a0) * rr, Math.sin(a0) * rr], [Math.cos(a) * (rr - l), Math.sin(a) * (rr - l)], [Math.cos(a1) * rr, Math.sin(a1) * rr]];
      part(c, pts, '#26262c', M, { lw: 0.9, sharp: true, edge: 0 });
    }
  } else {
    // burnt: grey ash mat with black holes and a last ember
    part(c, ring(0, 0, 9.3, 9.3, R, 0.08, 12), '#6e6964', M, { lw: 1.1, vary: 0.12, sp: 0.9, edge: 0 });
    for (let k = 0; k < 3; k++) { const a = R() * TAU, d = R() * 5; dab(c, Math.cos(a) * d, Math.sin(a) * d, 1.6 + R() * 1.4, C.scorch, R, 0.35); }
    dab(c, 2.6, -1.8, 0.9, C.fireO, R);
  }
}
// drawn in three-quarter view like the other props that stand up (peel, mine): anchor = the pad's centre on the
// ground; shadow, four legs, the frame's front edge, then the top (padPaint squashed to an ellipse) raised 4 px.
function padSide(c, R, v, M) {
  const burnt = v >= 5;
  c.fillStyle = 'rgba(24,44,12,0.32)'; c.beginPath(); c.ellipse(1.5, 6.5, 15.5, 5.2, 0, 0, TAU); c.fill();
  for (const [x, y0, y1] of [[-8.5, -4, 3.2], [8.5, -4, 3.2], [-13, -2, 6.4], [13, -2, 6.4]]) tube(c, [[x, y0], [x * 1.03, y1]], 1.5, burnt ? C.char : C.greyD, R, 0.85);
  part(c, ring(0, -2.4, 14.3, 7.9, R, 0.04, 14), burnt ? tone(C.char, -0.2) : tone(C.red, -0.25), M, { lw: 1.4, vary: 0.08, sp: 0.9, edge: 0 });
  const m = c.getTransform();
  c.translate(0, -4); c.scale(1, 0.55);
  padPaint(c, R, v, M);
  c.setTransform(m);
}
const padB = SP.defineBit('tramp', 7, [36, 28, 18, 14], padSide);
export function prewarm7() { SP.wantBits(lavaSwirl, lavaHot, crust, bubble, puddle, gloss, splot, footB, plankB, postB, splinter, padB); }

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
let tilesS = 0, lavaRimT = null, lavaCoreT = null, mudRimT = null, mudCoreT = null, ropeT = null;
function ensureTiles(S) {
  if (tilesS === S) return;
  tilesS = S;
  lavaRimT = tileOf(S, 701, LAVA_RIM, [[LAVA_RIM_D, 4, 12, 0.2, 0.5], ['#d0301c', 3, 10, -0.2, 0.6]]);
  lavaCoreT = tileOf(S, 702, C.fireO, [['#ff9f22', 5, 14, 0.1, 0.5], [C.fireY, 3, 9, 0.3, 0.6], ['#f2741a', 4, 10, -0.2, 0.5], [C.fireR, 1.6, 4, 0.2, 0.7]]);
  mudRimT = tileOf(S, 703, MUD_L, [[MUD_LL, 3.4, 12, 0.6, 0.5], [tone(MUD_L, -0.15), 3, 10, 0.5, 0.6]]);
  mudCoreT = tileOf(S, 704, MUD, [['#5c3620', 5, 14, 0.4, 0.5], ['#7a4c2e', 3.6, 10, 0.3, 0.6], ['#86583a', 1.8, 5, 0.4, 0.7]]);
  ropeT = tileOf(S, 705, ROPE, [[ROPE_D, 1.1, 40, 0.8, 0.3], ['#f0d49a', 1.4, 18, 0.8, 0.4]]);
}

// ---------------------------------------------------------------- shared painting helpers
const th = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y) {
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => th(((a & 0xffff) | ((b & 0xffff) << 16)) >>> 0, 77);
  const a0 = h(X, Y) + (h(X + 1, Y) - h(X, Y)) * sx, a1 = h(X, Y + 1) + (h(X + 1, Y + 1) - h(X, Y + 1)) * sx;
  return a0 + (a1 - a0) * sy;
}
let wobK = 1;
function circ(g, x, y, r) { const rr = r + wobK * (5.2 * (vnoise(x / 26, y / 26) - 0.5) + 2.4 * (vnoise(x / 9 + 17, y / 9 + 5) - 0.5)); g.moveTo(x + rr, y); g.arc(x, y, Math.max(0.5, rr), 0, TAU); }
// Path of the tiles with grid[i] >= min, in sim px: one wobbly circle per edge tile, inside tiles merged into one rect per
// row run (edgeOnly: the circles only, for passes the middle fill covers anyway). Returns false if empty.
// (Map loads: 5 circles per edge tile + a rect per tile cost ~80 ms of raster per pass on the swamp; this is ~25.)
export function bodyPath(g, grid, cols, rows, min, a0, b0, a1, b1, r, edgeOnly = false) {   // also terrain.js body()
  g.beginPath();
  let any = false;
  for (let y = b0; y <= b1; y++) {
    let run = -1;
    for (let x = a0; x <= a1 + 1; x++) {
      const i = y * cols + x, on = x <= a1 && grid[i] >= min;
      const edge = on && (x === 0 || y === 0 || x === cols - 1 || y === rows - 1 || grid[i - 1] < min || grid[i + 1] < min || grid[i - cols] < min || grid[i + cols] < min
        || grid[i - cols - 1] < min || grid[i - cols + 1] < min || grid[i + cols - 1] < min || grid[i + cols + 1] < min);
      if (on && !edge && !edgeOnly) { if (run < 0) run = x; continue; }
      if (run >= 0) { g.rect(run * T8 - 0.6, y * T8 - 0.6, (x - run) * T8 + 1.2, T8 + 1.2); run = -1; any = true; }
      if (edge) { circ(g, (x + 0.5) * T8, (y + 0.5) * T8, r); any = true; }
    }
  }
  return any;
}
function body(g, S, grid, cols, rows, min, a0, b0, a1, b1, r, style, ox, oy, wob = T.wob, edgeOnly = false) {
  g.setTransform(S, 0, 0, S, ox * S, oy * S);
  wobK = wob;
  const any = bodyPath(g, grid, cols, rows, min, a0, b0, a1, b1, r, edgeOnly);
  wobK = 1;
  if (!any) return;
  if (typeof style !== 'string' && style.setTransform) style.setTransform(new DOMMatrix([1 / S, 0, 0, 1 / S, -ox, -oy])); // pattern in device px
  g.fillStyle = style; g.fill();
}
let PX = 0, PY = 0;   // device px offset for put (a scratch canvas that starts at (PX, PY) of the layer)
function put(g, spr, x, y, sc, rot, S, flip = 1, sy = 1) {
  if (!spr) return;
  const m = sc * S / spr.k, cs = Math.cos(rot) * m, sn = Math.sin(rot) * m;
  g.setTransform(cs * flip, sn * flip, -sn * sy, cs * sy, x * S - PX, y * S - PY);
  g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
// 8-neighbour edge test on a 0/1 grid (field border counts as an edge): 0 none, 1 edge tile, 2 inside
function bucketOf(g, i, x, y, cols, rows) {
  if (g[i] === 0) return 0;
  if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return 1;
  if (g[i - 1] === 0 || g[i + 1] === 0 || g[i - cols] === 0 || g[i + cols] === 0 || g[i - cols - 1] === 0 || g[i - cols + 1] === 0 || g[i + cols - 1] === 0 || g[i + cols + 1] === 0) return 1;
  return 2;
}

// ---------------------------------------------------------------- a cached layer (device px, the whole world, made on first use)
function makeLayer() { return { cv: null, g: null, w: 0, h: 0, S: 0, ref: null, cols: 0, rows: 0, v: '', bx0: 1, by0: 1, bx1: 0, by1: 0 }; }
/** Returns true when the canvas was (re)made: it is empty, nothing old to clear. */
function layerSize(L, w, h, S) {
  if (!L.cv) { L.cv = layerCanvas(); L.g = L.cv.getContext('2d'); }
  if (L.w !== w || L.h !== h || L.S !== S) { L.cv.width = L.w = w; L.cv.height = L.h = h; L.S = S; L.ref = null; return true; }
  return false;
}
function releaseLayer(L) { if (L.cv && L.w > 1) { L.cv.width = L.cv.height = 1; L.w = L.h = 1; L.ref = null; } resetQ(L === U ? UQ : OQ); }
function resetQ(Q) { Q.q.length = 0; Q.ext[0] = 1; Q.ext[1] = 1; Q.ext[2] = 0; Q.ext[3] = 0; }
function blit(ctx, L, w, h, pad) {
  if (L.bx0 > L.bx1) return;
  const S = L.S, X0 = Math.max(0, Math.floor((L.bx0 - 1) * T8 * S)), Y0 = Math.max(0, Math.floor((L.by0 - 1) * T8 * S));
  const X1 = Math.min(w, Math.ceil((L.bx1 + 2) * T8 * S + pad * S)), Y1 = Math.min(h, Math.ceil((L.by1 + 2) * T8 * S + pad * S));
  if (X1 > X0 && Y1 > Y0) ctx.drawImage(L.cv, X0, Y0, X1 - X0, Y1 - Y0, X0, Y0, X1 - X0, Y1 - Y0);
}
function clipBox(L, x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(L.cols - 1, x1); y1 = Math.min(L.rows - 1, y1);
  const S = L.S, g = L.g;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const X0 = Math.floor(x0 * T8 * S), Y0 = Math.floor(y0 * T8 * S), X1 = Math.ceil((x1 + 1) * T8 * S), Y1 = Math.ceil((y1 + 1) * T8 * S);
  g.save(); g.beginPath(); g.rect(X0, Y0, X1 - X0, Y1 - Y0); g.clip(); g.clearRect(X0, Y0, X1 - X0, Y1 - Y0);
  return [x0, y0, x1, y1, X0, Y0, X1, Y1];
}
// Changed rect -> gpu.js. A big rect goes as up to 8 bands under 1/4 of the canvas each: gl2d copies those with
// getImageData (fast); one huge rect would make it upload from the whole canvas (seconds on SwiftShader).
export function touchBands(cv, X, Y, W, H) {   // also terrain.js repaint
  const lim = (cv.width * cv.height) / 4.5;
  if (W * H <= lim) { touched(cv, X, Y, W, H); return; }
  const n = Math.min(8, Math.ceil((W * H) / lim)), bh = Math.ceil(H / n);
  for (let k = 0; k < n; k++) { const y = Y + k * bh, hh = Math.min(bh, Y + H - y); if (hh > 0) touched(cv, X, y, W, hh); }
}
function endBox(L, b) {
  L.g.restore(); L.g.setTransform(1, 0, 0, 1, 0, 0);
  touchBands(L.cv, b[4], b[5], b[6] - b[4], b[7] - b[5]);
}

// ---------------------------------------------------------------- big repaints spread over frames
// A small change (a brush stroke) repaints at once. A big one (map load, Clear, a reset) is queued as strips of rows and
// painted over the next frames within a budget of tiles per frame that adapts to ~T.paintMs of paint + upload a frame:
// the map paints in over a few frames instead of freezing one (the swamp's mud was ~350 ms in one frame on desktop).
const STRIP = 12;            // tile rows per queued strip
function makeQ() { return { q: [], tpf: 1500, ext: [1, 1, 0, 0] }; }   // ext: box painted since the canvas was made
const UQ = makeQ(), OQ = makeQ();
function schedule(Q, L, x0, y0, x1, y1, full, S) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(L.cols - 1, x1); y1 = Math.min(L.rows - 1, y1);
  if (x1 < x0 || y1 < y0) return;
  const e = Q.ext;
  if (full) {   // everything ever painted on this canvas goes too (a map switch before the last one finished)
    Q.q.length = 0;
    if (e[0] <= e[2]) { x0 = Math.min(x0, e[0]); y0 = Math.min(y0, e[1]); x1 = Math.max(x1, e[2]); y1 = Math.max(y1, e[3]); }
  }
  if (e[0] > e[2]) { e[0] = x0; e[1] = y0; e[2] = x1; e[3] = y1; } else { e[0] = Math.min(e[0], x0); e[1] = Math.min(e[1], y0); e[2] = Math.max(e[2], x1); e[3] = Math.max(e[3], y1); }
  if (!full && (x1 - x0 + 1) * (y1 - y0 + 1) <= 48 * 48) { (L === U ? repaintUnder : repaintOver)(x0, y0, x1, y1, S); return; }
  for (let y = y0; y <= y1; y += STRIP) Q.q.push(x0, y, x1, Math.min(y1, y + STRIP - 1));
}
/** Paint queued strips up to this frame's budget. Returns the work done (0 = nothing queued). */
function pump(Q, L, S) {
  let work = 0;
  const fn = L === U ? repaintUnder : repaintOver;
  while (Q.q.length > 0 && work < Q.tpf) { const x0 = Q.q[0], y0 = Q.q[1], x1 = Q.q[2], y1 = Q.q[3]; Q.q.splice(0, 4); work += fn(x0, y0, x1, y1, S); }
  return work;
}
function adapt(Q, work, ms) {   // tiles per frame toward T.paintMs (paint + the upload in the blit)
  if (work < 200) return;
  const k = Math.max(0.4, Math.min(2.5, T.paintMs / Math.max(0.5, ms)));
  Q.tpf = Math.max(300, Math.min(12000, Q.tpf * (0.5 + 0.5 * k)));
}

// The same spreading for terrain.js's own layer (water, ice, walls): its update() hands big repaints here (marked hook)
// and drawLayers pumps them. Strips cover only the content now + whatever was painted before (ext), not the empty field.
const TQ = { q: [], ext: [1, 1, 0, 0], fn: null };
export function spread(fn, x0, y0, x1, y1, full, S, cols, rows, cx0, cy0, cx1, cy1) {
  const e = TQ.ext;
  if (full) {
    TQ.q.length = 0;
    x0 = cx0 - 3; y0 = cy0 - 3; x1 = cx1 + 3; y1 = cy1 + 3;   // new content (empty: x1 < x0)
    if (e[0] <= e[2]) { if (x1 < x0) { x0 = e[0]; y0 = e[1]; x1 = e[2]; y1 = e[3]; } else { x0 = Math.min(x0, e[0]); y0 = Math.min(y0, e[1]); x1 = Math.max(x1, e[2]); y1 = Math.max(y1, e[3]); } }
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(cols - 1, x1); y1 = Math.min(rows - 1, y1);
  if (x1 < x0 || y1 < y0) return;
  if (e[0] > e[2]) { e[0] = x0; e[1] = y0; e[2] = x1; e[3] = y1; } else { e[0] = Math.min(e[0], x0); e[1] = Math.min(e[1], y0); e[2] = Math.max(e[2], x1); e[3] = Math.max(e[3], y1); }
  if (!full && (x1 - x0 + 1) * (y1 - y0 + 1) <= 48 * 48) { fn(x0, y0, x1, y1, S); return; }
  TQ.fn = fn;
  for (let y = y0; y <= y1; y += STRIP) TQ.q.push(x0, y, x1, Math.min(y1, y + STRIP - 1));
  pumpSpread(S);   // the first strips this frame
}
export function pumpSpread(S) {
  if (TQ.q.length === 0) return;
  const t0 = performance.now();
  do { const x0 = TQ.q[0], y0 = TQ.q[1], x1 = TQ.q[2], y1 = TQ.q[3]; TQ.q.splice(0, 4); TQ.fn(x0, y0, x1, y1, S); } while (TQ.q.length > 0 && performance.now() - t0 < T.terMs);
}

// ---------------------------------------------------------------- under layer: mud + lava (+ the glow canvas)
const U = makeLayer();
let sMud = null, sLava = null, uN = 0;
let lavaCore = new Int32Array(0), lavaCoreN = 0, lavaAny = 0;      // middle lava tiles (bubbles)
let lgx0 = 1, lgy0 = 1, lgx1 = 0, lgy1 = 0;                         // lava box (glow)
let gcv = null, gImg = null, gDirty = false;
let uvL = -1, uvM = -1, ucL = -1, ucM = -1;
function updateUnder(world, S, w, h) {
  const L = world.lava7, M = world.mud7, wl = world.walls;
  const cols = wl ? wl.cols : 0, rows = wl ? wl.rows : 0, n = cols * rows;
  const okL = L !== undefined && L.cells > 0 && L.grid.length === n ? L.grid : null, okM = M !== undefined && M.cells > 0 && M.grid.length === n ? M.grid : null;
  if (okL === null && okM === null && !(U.bx0 <= U.bx1)) return false;     // nothing now, nothing before: free
  const vL = L !== undefined ? L.version : -1, vM = M !== undefined ? M.version : -1, cL = L !== undefined ? L.cells : 0, cM = M !== undefined ? M.cells : 0;
  if (U.ref === world && U.cols === cols && U.rows === rows && uvL === vL && uvM === vM && ucL === cL && ucM === cM && U.w === w && U.h === h && U.S === S) return U.bx0 <= U.bx1;
  uvL = vL; uvM = vM; ucL = cL; ucM = cM;
  if (okL === null && okM === null) { U.bx0 = 1; U.bx1 = 0; lavaCoreN = 0; lavaAny = 0; lgx0 = 1; lgx1 = 0; releaseLayer(U); U.ref = world; return false; }
  const fresh = layerSize(U, w, h, S);
  if (fresh) resetQ(UQ);   // a new canvas is empty: nothing old to clear
  const full = U.ref !== world || U.cols !== cols || U.rows !== rows || uN !== n;
  U.ref = world;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  if (full) {
    if (!fresh && U.bx0 <= U.bx1 && U.cols === cols && U.rows === rows) { x0 = U.bx0; y0 = U.by0; x1 = U.bx1; y1 = U.by1; }   // old content to clear
    U.cols = cols; U.rows = rows; uN = n; sMud = new Uint8Array(n); sLava = new Uint8Array(n);
  }
  if (lavaCore.length < n) lavaCore = new Int32Array(n);
  let cx0 = 1e9, cy0 = 1e9, cx1 = -1, cy1 = -1, lx0 = 1e9, ly0 = 1e9, lx1 = -1, ly1 = -1, nc = 0, la = 0;
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
    const mb = okM !== null ? bucketOf(okM, i, x, y, cols, rows) : 0, lb = okL !== null ? bucketOf(okL, i, x, y, cols, rows) : 0;
    if (mb | lb) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
    if (lb) { la++; if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; if (y < ly0) ly0 = y; if (y > ly1) ly1 = y; if (lb === 2) lavaCore[nc++] = i; }
    if (mb !== sMud[i] || lb !== sLava[i]) {
      sMud[i] = mb; sLava[i] = lb;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  U.bx0 = cx0; U.by0 = cy0; U.bx1 = cx1; U.by1 = cy1;
  lavaCoreN = nc; lavaAny = la; lgx0 = lx0; lgy0 = ly0; lgx1 = lx1; lgy1 = ly1;
  if (x1 >= x0) { schedule(UQ, U, x0 - 3, y0 - 3, x1 + 3, y1 + 3, full, S); gDirty = true; }
  if (!(cx1 >= cx0)) { releaseLayer(U); return false; }
  return true;
}
function repaintUnder(x0, y0, x1, y1, S) {
  const tp0 = performance.now();
  ensureTiles(S);
  const b = clipBox(U, x0, y0, x1, y1), g = U.g, cols = U.cols, rows = U.rows;
  const a0 = Math.max(0, b[0] - 2), c0 = Math.max(0, b[1] - 2), a1 = Math.min(cols - 1, b[2] + 2), c1 = Math.min(rows - 1, b[3] + 2);
  const k = DBG.skip;
  // mud
  if (!(k & 1)) body(g, S, sMud, cols, rows, 1, a0, c0, a1, c1, T.inkR, C.ink, 0, 0, T.wob, true);
  if (!(k & 2)) body(g, S, sMud, cols, rows, 1, a0, c0, a1, c1, T.rimR, g.createPattern(mudRimT, 'repeat'), 0.8, 0.7, T.wob, true);
  if (!(k & 4)) body(g, S, sMud, cols, rows, 2, a0, c0, a1, c1, T.coreR, g.createPattern(mudCoreT, 'repeat'), 0.8, 0.7);
  if (!(k & 8)) mudMarks(g, S, a0, c0, a1, c1);
  // lava
  if (!(k & 16)) body(g, S, sLava, cols, rows, 1, a0, c0, a1, c1, T.inkR + 0.2, C.ink, 0, 0, T.wob, true);
  if (!(k & 32)) body(g, S, sLava, cols, rows, 1, a0, c0, a1, c1, T.rimR, g.createPattern(lavaRimT, 'repeat'), 0.8, 0.7, T.wob, true);
  if (!(k & 64)) body(g, S, sLava, cols, rows, 2, a0, c0, a1, c1, T.coreR - 0.4, g.createPattern(lavaCoreT, 'repeat'), 0.8, 0.7);
  if (!(k & 128)) lavaMarks(g, S, a0, c0, a1, c1);
  endBox(U, b);
  PROF.under = performance.now() - tp0;
  let work = 4;   // tiles with something on them in the painted box (the pump's budget unit)
  for (let y = c0; y <= c1; y++) for (let x = a0, i = y * cols + a0; x <= a1; x++, i++) if (sMud[i] | sLava[i]) work++;
  return work;
}
const at = (s, x, y, min) => { const tx = Math.floor(x / T8), ty = Math.floor(y / T8); return tx >= 0 && ty >= 0 && tx < U.cols && ty < U.rows && s[ty * U.cols + tx] >= min; };
function mudMarks(g, S, a0, b0, a1, b1) {
  const X0 = a0 * T8 - 40, Y0 = b0 * T8 - 40, X1 = (a1 + 1) * T8 + 40, Y1 = (b1 + 1) * T8 + 40, s = sMud;
  for (let ly = Math.floor(Y0 / 34); ly <= Math.ceil(Y1 / 34); ly++) for (let lx = Math.floor(X0 / 46); lx <= Math.ceil(X1 / 46); lx++) {
    const h = th(lx * 7919 + ly, 31), x = (lx + 0.5) * 46 + (h - 0.5) * 18, y = (ly + 0.5) * 34 + (th(lx, ly + 3) - 0.5) * 12;
    if (h < 0.3 || !at(s, x, y, 2) || !at(s, x - 14, y, 2) || !at(s, x + 14, y, 2) || !at(s, x, y - 8, 2) || !at(s, x, y + 8, 2)) continue;
    put(g, SP.bit(puddle, (h * 30 | 0) % 3), x, y, 0.75 + h * 0.4, (h - 0.6) * 0.5, S);
  }
  for (let ly = Math.floor(Y0 / 18); ly <= Math.ceil(Y1 / 18); ly++) for (let lx = Math.floor(X0 / 22); lx <= Math.ceil(X1 / 22); lx++) {
    const h = th(lx * 104729 + ly, 33);
    if (h > 0.55) continue;
    const x = (lx + 0.5) * 22 + (h - 0.25) * 16, y = (ly + 0.5) * 18 + (th(ly, lx + 9) - 0.5) * 8;
    if (!at(s, x, y, 2)) continue;
    if (h < 0.22) put(g, SP.bit(gloss, (h * 90 | 0) % 3), x, y, 0.9, (h - 0.1) * 2, S);
    else put(g, SP.bit(splot, (h * 70 | 0) % 4), x, y, 0.8 + h * 0.3, h * 9, S);
  }
}
function lavaMarks(g, S, a0, b0, a1, b1) {
  const X0 = a0 * T8 - 44, Y0 = b0 * T8 - 44, X1 = (a1 + 1) * T8 + 44, Y1 = (b1 + 1) * T8 + 44, s = sLava;
  for (let ly = Math.floor(Y0 / 36); ly <= Math.ceil(Y1 / 36); ly++) for (let lx = Math.floor(X0 / 50); lx <= Math.ceil(X1 / 50); lx++) {
    const h = th(lx * 7919 + ly, 41), x = (lx + 0.5) * 50 + (h - 0.5) * 16, y = (ly + 0.5) * 36 + (th(lx, ly + 7) - 0.5) * 10;
    if (h < 0.2 || !at(s, x, y, 2) || !at(s, x - 16, y, 2) || !at(s, x + 16, y, 2) || !at(s, x, y - 10, 2) || !at(s, x, y + 10, 2)) continue;
    put(g, SP.bit(lavaSwirl, (h * 30 | 0) % 3), x, y, 0.75 + h * 0.4, (h - 0.5) * 0.8, S);
  }
  for (let ly = Math.floor(Y0 / 20); ly <= Math.ceil(Y1 / 20); ly++) for (let lx = Math.floor(X0 / 24); lx <= Math.ceil(X1 / 24); lx++) {
    const h = th(lx * 104729 + ly, 43);
    if (h > 0.3) continue;
    const x = (lx + 0.5) * 24 + (h - 0.15) * 30, y = (ly + 0.5) * 20 + (th(ly, lx + 5) - 0.5) * 8;
    if (!at(s, x, y, 2) || !at(s, x - 5, y, 2) || !at(s, x + 5, y, 2)) continue;
    put(g, SP.bit(lavaHot, (h * 90 | 0) % 3), x, y, 0.7 + h, h * 7, S);
  }
  // the crust: dark blobs sitting on the edge tiles (over the rim and the outline)
  for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
    const i = y * U.cols + x;
    if (s[i] !== 1 || th(i, 45) > 0.17) continue;
    const C0 = U.cols, ox = (x > 0 && !s[i - 1] ? -1 : 0) + (x < C0 - 1 && !s[i + 1] ? 1 : 0), oy = (y > 0 && !s[i - C0] ? -1 : 0) + (y < U.rows - 1 && !s[i + C0] ? 1 : 0);
    const ol = Math.hypot(ox, oy) || 1, jx = ox / ol * 5 + (th(i, 46) - 0.5) * 2, jy = oy / ol * 5 + (th(i, 47) - 0.5) * 2;
    put(g, SP.bit(crust, (th(i, 48) * 4) | 0), (x + 0.5) * T8 + jx, (y + 0.5) * T8 + jy, 0.7 + th(i, 49) * 0.45, Math.atan2(oy, ox) + Math.PI / 2 + (th(i, 50) - 0.5), S);
  }
}
// Glow: 1 texel per tile (middle 255, rim 150), drawn stretched (bilinear) with 'lighter' over the lava box.
function updateGlow() {
  if (!gDirty) return;
  gDirty = false;
  const cols = U.cols, rows = U.rows;
  if (!gcv) gcv = layerCanvas();
  if (gcv.width !== cols || gcv.height !== rows) { gcv.width = cols; gcv.height = rows; gImg = null; }
  const g = gcv.getContext('2d');
  if (!gImg) gImg = g.createImageData(cols, rows);
  const d = gImg.data;
  for (let i = 0, n = cols * rows; i < n; i++) {
    const b = sLava[i], a = b === 2 ? 255 : b === 1 ? 140 : 0, o = i * 4;
    d[o] = 255; d[o + 1] = 186; d[o + 2] = 40; d[o + 3] = a;
  }
  g.putImageData(gImg, 0, 0);
  touched(gcv, 0, 0, cols, rows);
}
function drawGlow(ctx, S, rt) {
  if (!lavaAny || !(lgx1 >= lgx0)) return;
  updateGlow();
  const ph = 0.5 + 0.5 * Math.sin(rt * TAU / T.glowP), a = T.glowA * (T.glowLo + (1 - T.glowLo) * ph);
  const x0 = Math.max(0, lgx0 - 1), y0 = Math.max(0, lgy0 - 1), x1 = Math.min(U.cols, lgx1 + 2), y1 = Math.min(U.rows, lgy1 + 2);
  const op = ctx.globalCompositeOperation, al = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.drawImage(gcv, x0, y0, x1 - x0, y1 - y0, x0 * T8 * S, y0 * T8 * S, (x1 - x0) * T8 * S, (y1 - y0) * T8 * S);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = al;
}

// ---------------------------------------------------------------- over layer: bridges (+ basalt rock bricks)
const O = makeLayer();
let sBr = null, sAng = null, sWet = null, sRock = null, sTmp = null, oN = 0;
let ovB = -1, ovF = -1, ovC = -1, ovW = -1, ovWC = -1, ovL = -1, ovR = -1, ovK = 0, oFrame = 0;
// cracked planks: hp falls every tick (fire, lava, heavy feet) without a version bump; count them every 8th frame
function crackedCount(B) {
  if (B.listVersion !== B.version) return ovK;   // the version moved anyway
  const h = B.hp, l = B.list, lim = BRIDGE_HP * T.crackHp;
  let k = 0;
  for (let j = 0; j < B.listN; j++) { const v = h[l[j]]; if (v > 0 && v < lim) k++; }
  return k;
}
function updateOver(world, S, w, h) {
  const B = world.bridge7, L = world.lava7, wl = world.walls;
  const cols = wl ? wl.cols : 0, rows = wl ? wl.rows : 0, n = cols * rows;
  const okB = B !== undefined && B.cells > 0 && B.hp.length === n ? B : null;
  const okR = L !== undefined && L.rockCells > 0 && L.rock.length === n && wl.solid.length === n ? L.rock : null;
  if (okB === null && okR === null && !(O.bx0 <= O.bx1)) return false;
  oFrame++;
  const vB = B !== undefined ? B.version : -1, vF = B !== undefined ? B.fireVersion : -1;
  const vK = okB !== null && (oFrame & 7) === 0 ? crackedCount(okB) : ovK;
  const TR = world.terrain, vW = TR !== undefined && TR !== null ? TR.waterVersion : 0, vWC = world.waterCells | 0, vL = L !== undefined ? L.version : -1;
  const vR = okR !== null ? wl.version * 7 + wl.damageVersion * 131 + L.rockVersion * 8191 : -1;
  if (O.ref === world && O.cols === cols && O.rows === rows && ovB === vB && ovF === vF && ovK === vK && ovW === vW && ovWC === vWC && ovL === vL && ovR === vR && O.w === w && O.h === h && O.S === S) return O.bx0 <= O.bx1;
  ovB = vB; ovF = vF; ovK = vK; ovW = vW; ovWC = vWC; ovL = vL; ovR = vR;
  if (okB === null && okR === null) { O.bx0 = 1; O.bx1 = 0; releaseLayer(O); O.ref = world; return false; }
  const fresh = layerSize(O, w, h, S);
  if (fresh) resetQ(OQ);
  const full = O.ref !== world || O.cols !== cols || O.rows !== rows || oN !== n;
  O.ref = world;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  if (full) {
    if (!fresh && O.bx0 <= O.bx1 && O.cols === cols && O.rows === rows) { x0 = O.bx0; y0 = O.by0; x1 = O.bx1; y1 = O.by1; }   // old content to clear
    O.cols = cols; O.rows = rows; oN = n; sBr = new Uint8Array(n); sAng = new Uint8Array(n); sWet = new Uint8Array(n); sRock = new Uint8Array(n);
  }
  const hpA = okB !== null ? okB.hp : null, angA = okB !== null ? okB.ang : null, fireA = okB !== null ? okB.fire : null, broke = okB !== null && okB.brokeAt ? okB.brokeAt : null;
  const water = world.water && world.water.length === n ? world.water : null, lava = L !== undefined && L.cells > 0 && L.grid.length === n ? L.grid : null;
  const now = world.time || 0;
  let cx0 = 1e9, cy0 = 1e9, cx1 = -1, cy1 = -1;
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
    let b = 0, a = 0, wt = 0, rk = 0;
    if (hpA !== null) {
      const hp = hpA[i];
      if (hp > 0) {
        b = fireA[i] > 0 ? 3 : hp < BRIDGE_HP * T.crackHp ? 2 : 1;
        a = (((angA[i] % Math.PI) + Math.PI) % Math.PI) / Math.PI * 64 & 63;   // planks look the same every half turn
        wt = (water !== null && water[i] >= 0.05) || (lava !== null && lava[i] > 0) ? 1 : 0;
      }
    }
    if (okR !== null && okR[i] && wl.solid[i]) rk = wl.hp[i] < 30 ? 3 : wl.hp[i] < 60 ? 2 : 1;
    if (b | rk) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
    if (b !== sBr[i] || a !== sAng[i] || wt !== sWet[i] || rk !== sRock[i]) {
      // a plank went: splinters where it was if it broke (it was cracked / burning, or the sim says it broke) - not on erase
      if (!full && sBr[i] && !b && (sBr[i] >= 2 || (broke !== null && broke[i] >= now - 0.5))) splinterAt(world, i, x, y, sWet[i]);
      sBr[i] = b; sAng[i] = a; sWet[i] = wt; sRock[i] = rk;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  O.bx0 = cx0; O.by0 = cy0; O.bx1 = cx1; O.by1 = cy1;
  if (x1 >= x0) schedule(OQ, O, x0 - 3, y0 - 3, x1 + 3, y1 + 3, full, S);
  if (!(cx1 >= cx0)) { releaseLayer(O); return false; }
  return true;
}
const PROF = { under: 0, over: 0, overPlanks: 0 };
export const DBG = { skip: 0 };   // bisect switch for the bench tools (0 = draw everything)
function repaintOver(x0, y0, x1, y1, S) {
  const tp0 = performance.now();
  ensureTiles(S);
  const b = clipBox(O, x0, y0, x1, y1), g = O.g, cols = O.cols, rows = O.rows;
  const a0 = Math.max(0, b[0] - 2), c0 = Math.max(0, b[1] - 2), a1 = Math.min(cols - 1, b[2] + 2), c1 = Math.min(rows - 1, b[3] + 2);
  // shadow on the water / lava under the planks
  if (sTmp === null || sTmp.length !== sBr.length) sTmp = new Uint8Array(sBr.length);
  let anyW = false;
  for (let y = c0; y <= c1; y++) for (let x = a0; x <= a1; x++) { const i = y * cols + x, v = sBr[i] && sWet[i] ? 1 : 0; sTmp[i] = v; if (v) anyW = true; }
  if (anyW) body(g, S, sTmp, cols, rows, 1, a0, c0, a1, c1, 7, 'rgba(10,22,58,0.5)', 2.5, 7, 0.5);
  for (let y = c0; y <= c1; y++) for (let x = a0; x <= a1; x++) sTmp[y * cols + x] = 0;
  body(g, S, sBr, cols, rows, 1, a0, c0, a1, c1, T.bridgeInk, C.ink, 0, 0, 0.5);
  body(g, S, sBr, cols, rows, 1, a0, c0, a1, c1, T.ropeR, g.createPattern(ropeT, 'repeat'), 0.5, 0.4, 0.5);
  const tq = performance.now(); planks(g, S, a0, c0, a1, c1, b[4], b[5], b[6], b[7]); PROF.overPlanks = performance.now() - tq;
  // posts on the side edges (the neighbour across the stroke is not a bridge), every few tiles
  for (let y = c0; y <= c1; y++) for (let x = a0; x <= a1; x++) {
    const i = y * cols + x, st = sBr[i];
    if (!st) continue;
    const a = sAng[i] / 64 * Math.PI, vx = -Math.sin(a), vy = Math.cos(a), cx = (x + 0.5) * T8, cy = (y + 0.5) * T8;
    if (((Math.round((cx * vy - cy * vx) / T.plankW) % 4) + 4) % 4 !== 0) continue;   // every 4th plank along the stroke
    for (let side = -1; side <= 1; side += 2) {
      const nx = Math.floor((cx + vx * side * T8) / T8), ny = Math.floor((cy + vy * side * T8) / T8);
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && sBr[ny * cols + nx]) continue;
      put(g, SP.bit(postB, st === 3 ? 2 : (th(i, 63) * 2) | 0), cx + vx * side * 4.2, cy + vy * side * 4.2, 1, 0, S);
    }
  }
  rockBricks(g, S, a0, c0, a1, c1);
  endBox(O, b);
  PROF.over = performance.now() - tp0;
  let work = 4;
  for (let y = c0; y <= c1; y++) for (let x = a0, i = y * cols + a0; x <= a1; x++, i++) if (sBr[i] | sRock[i]) work += 3;   // planks cost ~3 mud tiles
  return work;
}
// Planks inside the rope rail. Not under a clip path (thousands of circles: the canvas re-rasterises such a clip for every
// drawImage, seconds for a big bridge field): per band of <= 512 device px, planks go into a scratch canvas, one
// destination-in fill of the rail's inner body masks them, and the band is copied onto the layer.
let mcv = null, mg = null;
function planks(g, S, a0, c0, a1, c1, X0, Y0, X1, Y1) {
  const cols = O.cols, rows = O.rows, BH = 512, bw = X1 - X0, tp = T8 * S;
  if (bw <= 0) return;
  for (let by = Y0; by < Y1; by += BH) {
    const bh = Math.min(BH, Y1 - by);
    const r0 = Math.max(c0, Math.floor(by / tp) - 2), r1 = Math.min(c1, Math.ceil((by + bh) / tp) + 2);
    let any = false;
    for (let y = r0; y <= r1 && !any; y++) for (let x = a0; x <= a1; x++) if (sBr[y * cols + x]) { any = true; break; }
    if (!any) continue;
    if (mcv === null) { mcv = cpuCanvas(bw, bh); mg = mcv.getContext('2d', { willReadFrequently: true }); }
    if (mcv.width < bw || mcv.height < bh) { mcv.width = Math.max(mcv.width, bw); mcv.height = Math.max(mcv.height, bh); mg = mcv.getContext('2d', { willReadFrequently: true }); }
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1; mg.clearRect(0, 0, bw, bh);
    PX = X0; PY = by;
    for (let y = r0; y <= r1; y++) for (let x = a0; x <= a1; x++) {
      const i = y * cols + x, st = sBr[i];
      if (!st) continue;
      const a = sAng[i] / 64 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), cx = (x + 0.5) * T8, cy = (y + 0.5) * T8;
      const s = cx * ca + cy * sa, k = Math.round(s / T.plankW), d = k * T.plankW - s;
      const tone4 = (th(k + 7919 * sAng[i], 61) * 4) | 0, state = st === 3 ? 2 : st === 2 ? 1 : 0;
      put(mg, SP.bit(plankB, state * 4 + tone4), cx + ca * d, cy + sa * d, 1, a, S);
    }
    PX = 0; PY = 0;
    mg.globalCompositeOperation = 'destination-in';
    mg.setTransform(S, 0, 0, S, -X0, -by); wobK = 0.35;
    if (bodyPath(mg, sBr, cols, rows, 1, a0, Math.max(0, r0 - 1), a1, Math.min(rows - 1, r1 + 1), T.plankR)) { mg.fillStyle = '#000'; mg.fill(); }
    wobK = 1; mg.globalCompositeOperation = 'source-over'; mg.setTransform(1, 0, 0, 1, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(mcv, 0, 0, bw, bh, X0, by, bw, bh);
  }
}
// Walls the sim made of lava + water: GROUND-ART's 'rock' wall pieces (black basalt rubble, the volcano's own rock walls),
// laid over terrain.js's walls on those tiles in the same running bond, with the rock front face under the bottom row.
function rockBricks(g, S, a0, b0, a1, b1) {
  const WS = wallStyle ? wallStyle('rock') : null;
  if (!WS) return;
  const cols = O.cols, rows = O.rows, bF = WS.full, bH = WS.half, bFc = WS.face;
  for (let y = b0; y <= b1; y++) {
    for (let x = Math.max(0, a0 - 1); x <= a1; x++) {
      const i = y * cols + x;
      if (!sRock[i]) continue;
      const left = ((x + (y & 1)) & 1) === 0;
      if (left) {
        if (x + 1 < cols && sRock[i + 1]) put(g, SP.bit(bF, (th(i, 1) * bF.n) | 0), x * T8, y * T8, 1, 0, S);
        else put(g, SP.bit(bH, (th(i, 2) * bH.n) | 0), x * T8, y * T8, 1, 0, S);
      } else if (!(x > 0 && sRock[i - 1])) put(g, SP.bit(bH, (th(i, 2) * bH.n) | 0), x * T8, y * T8, 1, 0, S);
    }
    if (bFc) for (let x = a0; x <= a1; x++) { const i = y * cols + x; if (sRock[i] && (y === rows - 1 || !sRock[i + cols])) put(g, SP.bit(bFc, (th(i, 8) * bFc.n) | 0), x * T8, (y + 1) * T8, 1, 0, S); }
  }
}

// ---------------------------------------------------------------- splinters (ring buffer, sim time)
const spX = new Float32Array(T.splCap), spY = new Float32Array(T.splCap), spT = new Float32Array(T.splCap), spA = new Float32Array(T.splCap), spV = new Uint8Array(T.splCap);
let spHead = 0, spCount = 0;
const spW = new Uint8Array(T.splCap);
function splinterAt(world, i, x, y, wet) {
  const k = spHead; spHead = (spHead + 1) % T.splCap; if (spCount < T.splCap) spCount++;
  spX[k] = (x + 0.5) * T8 + (th(i, 71) - 0.5) * 4; spY[k] = (y + 0.5) * T8 + (th(i, 72) - 0.5) * 4; spT[k] = world.time || 0;
  spA[k] = th(i, 73) * TAU; spV[k] = (th(i, 74) * 4) | 0; spW[k] = wet;
}

// ---------------------------------------------------------------- lava bubbles (real time, render-side rng)
const bbX = new Float32Array(T.bubbleCap), bbY = new Float32Array(T.bubbleCap), bbT = new Float32Array(T.bubbleCap), bbD = new Float32Array(T.bubbleCap), bbS = new Float32Array(T.bubbleCap);
let bbSeed = 12345;
const rr = () => { bbSeed = (bbSeed * 1664525 + 1013904223) >>> 0; return bbSeed / 4294967296; };
function respawnBubble(k, rt) {
  const i = lavaCore[(rr() * lavaCoreN) | 0], cols = U.cols;
  bbX[k] = ((i % cols) + 0.2 + rr() * 0.6) * T8; bbY[k] = (((i / cols) | 0) + 0.2 + rr() * 0.6) * T8;
  bbD[k] = T.bubbleDur * (0.6 + rr() * 0.8); bbT[k] = rt + rr() * 0.8; bbS[k] = 0.7 + rr() * 0.6;
}
function drawBubbles(ctx, S, rt) {
  if (lavaCoreN === 0) return;
  const n = Math.min(T.bubbleCap, Math.ceil(lavaCoreN / T.bubbleEvery));
  for (let k = 0; k < n; k++) {
    let p = (rt - bbT[k]) / bbD[k];
    if (!(bbD[k] > 0) || p > 1 || p < -2 || !at(sLava, bbX[k], bbY[k], 2)) { respawnBubble(k, rt); continue; }
    if (p < 0) continue;
    const v = p < 0.35 ? 0 : p < 0.72 ? 1 : p < 0.86 ? 2 : 3;
    const sc = bbS[k] * (v === 1 ? 0.8 + 0.35 * (p - 0.35) / 0.37 : 1);
    put(ctx, SP.bit(bubble, v), bbX[k], bbY[k], sc, 0, S);
  }
}

// ---------------------------------------------------------------- muddy footprints (sim time)
const FMASK = 32767;
const fpLX = new Float32Array(FMASK + 1), fpLY = new Float32Array(FMASK + 1), fpId = new Int32Array(FMASK + 1).fill(-1), fpSide = new Uint8Array(FMASK + 1);
const fX = new Float32Array(T.fpCap), fY = new Float32Array(T.fpCap), fA = new Float32Array(T.fpCap), fT = new Float32Array(T.fpCap), fZ = new Float32Array(T.fpCap), fS = new Uint8Array(T.fpCap);
let fHead = 0, fCount = 0, fLast = -1e9;
function stepFootprints(world, now) {
  const us = world.units;
  if (!us || !us.length) return;
  for (let j = 0; j < us.length; j++) {
    const u = us[j];
    if (!u || u.dead || !(u.muddy > now) || (u.z || 0) > 2) continue;
    const s = u.id & FMASK;
    if (fpId[s] !== u.id) { fpId[s] = u.id; fpLX[s] = u.x; fpLY[s] = u.y; continue; }
    const dx = u.x - fpLX[s], dy = u.y - fpLY[s], step = T.fpStep * Math.max(0.8, Math.min(1.8, (u.radius || 9) / 9));
    if (dx * dx + dy * dy < step * step) continue;
    fpLX[s] = u.x; fpLY[s] = u.y;
    if (sMud && at(sMud, u.x, u.y, 1)) continue;   // on the mud itself: no print
    const a = Math.atan2(dy, dx), side = fpSide[s] ^= 1, off = (side ? 1 : -1) * Math.max(1.6, (u.radius || 9) * 0.22);
    const k = fHead; fHead = (fHead + 1) % T.fpCap; if (fCount < T.fpCap) fCount++;
    fX[k] = u.x - Math.sin(a) * off; fY[k] = u.y + Math.cos(a) * off; fA[k] = a; fT[k] = now; fS[k] = side; fZ[k] = Math.max(0.8, Math.min(1.8, (u.radius || 9) / 9));
    fLast = now;
  }
}
function drawFootprints(ctx, S, now) {
  if (fCount === 0) return;
  if (now - fLast > T.fpLife + 1 || now < fLast - 1) { fCount = 0; return; }
  const s0 = SP.bit(footB, 0), s1 = SP.bit(footB, 1);
  for (let j = 0; j < fCount; j++) {
    const age = now - fT[j];
    if (age < 0 || age > T.fpLife) continue;
    ctx.globalAlpha = age > T.fpLife - 2 ? (T.fpLife - age) / 2 : 1;
    put(ctx, fS[j] ? s1 : s0, fX[j], fY[j], fZ[j], fA[j], S);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- trampolines (world.tramp7: working pads + torn / burnt mats)
function drawPads(ctx, world, S, now, rt) {
  const P = world.tramp7;
  if (P === undefined || P.high === 0) return;
  const k0 = (P.r || T.padR) / 14.5, st = P.state, hi = P.high;
  for (let k = 0; k < hi; k++) {
    const s = st[k];
    if (s === 0) continue;
    let v, sx = 1, sy = 1;
    if (s === 1) {
      v = (((rt * 8 + k * 0.37) | 0) % 2 + 2) % 2;   // line boil, 2 variants
      const dt = now - P.boingAt[k];
      if (dt >= 0 && dt < T.boingT) {                // squash (mat pushed in), then a springy wobble that dies out
        const q = dt / T.boingT;
        if (q < 0.25) { v = 2; sy = 1 - 0.22 * Math.sin(q / 0.25 * Math.PI / 2); sx = 1 + 0.08 * Math.sin(q / 0.25 * Math.PI / 2); }
        else { const e = Math.sin((q - 0.25) / 0.75 * Math.PI * 2.5) * (1 - q) * 0.3; sy = 1 + e; sx = 1 - e * 0.35; }
      }
    } else {
      v = (s === 3 ? 5 : 3) + (k & 1);
      const dt = now - P.deadAt[k];
      if (dt >= 0 && dt < 0.25) { const e = Math.sin(dt / 0.25 * Math.PI) * 0.18; sx = 1 + e; sy = 1 - e; }   // the rip / burn-out pop
    }
    put(ctx, SP.bit(padB, v), P.x[k], P.y[k], k0 * sx, 0, S, 1, sy / sx);
  }
}

// ---------------------------------------------------------------- hooks for terrain.js
/** pass 0: under terrain.js's layer (mud, lava, glow); pass 1: over it (bridges, basalt). Device px like drawLayers. */
export function drawLayers7(ctx, world, S, w, h, pass = 0) {
  if (pass === 0) {
    const t0 = performance.now(), on = updateUnder(world, S, w, h), wk = UQ.q.length > 0 && U.cv !== null && U.w > 1 ? pump(UQ, U, S) : 0, t1 = performance.now();
    if (on) { blit(ctx, U, w, h, 6); const t2 = performance.now(); drawGlow(ctx, S, t2 / 1000); PROF.blitU = t2 - t1; }
    if (wk > 0) adapt(UQ, wk, performance.now() - t0);
    PROF.updU = t1 - t0;
  } else {
    const t0 = performance.now(), on = updateOver(world, S, w, h), wk = OQ.q.length > 0 && O.cv !== null && O.w > 1 ? pump(OQ, O, S) : 0, t1 = performance.now();
    if (on) blit(ctx, O, w, h, 8);
    if (wk > 0) adapt(OQ, wk, performance.now() - t0);
    PROF.updO = t1 - t0; PROF.blitO = performance.now() - t1;
  }
}
/** Per frame props: bubbles, splinters, burning planks, footprints, trampolines (sim px -> device via S). */
export function drawProps7(ctx, world, S, now, rt) {
  if (U.bx0 <= U.bx1) {
    drawBubbles(ctx, S, rt);
    if (mudCount(world) > 0 || fCount > 0) { if (mudCount(world) > 0) stepFootprints(world, now); drawFootprints(ctx, S, now); }
  } else if (fCount > 0) drawFootprints(ctx, S, now);
  if (spCount) {
    let left = false;
    for (let j = 0; j < spCount; j++) {
      const age = now - spT[j];
      if (age < 0 || age > T.splLife) continue;
      left = true;
      ctx.globalAlpha = age > T.splLife - 1.5 ? (T.splLife - age) / 1.5 : 1;
      const bob = spW[j] ? 1 : 0;   // floating on water / lava, still on land
      put(ctx, SP.bit(splinter, spV[j]), spX[j] + bob * Math.sin(age * 1.3 + spA[j]) * 1.5, spY[j] + bob * Math.cos(age * 1.1 + spA[j]), 1, spA[j] + bob * age * 0.15, S);
    }
    ctx.globalAlpha = 1;
    if (!left) spCount = 0;
  }
  const B = world.bridge7;
  if (B !== undefined && B.burning > 0 && FX !== null && O.bx0 <= O.bx1) {
    const cols = B.cols, fl = B.fireList, nb = Math.min(B.burning, fl.length), step = nb > T.fireCap ? nb / T.fireCap : 1;
    for (let f = 0; f < nb; f += step) {
      const i = fl[f | 0];
      if (th(i, 84) < 0.35) continue;   // not every plank: a burning bridge, not a wall of fire
      const x = ((i % cols) + 0.5) * T8, y = (((i / cols) | 0) + 0.5) * T8;
      FX.fireOn(x, y + 3, 0.5 + th(i, 81) * 0.25, rt, th(i, 82), th(i, 83) < 0.12);
    }
  }
  drawPads(ctx, world, S, now, rt);
}
/** Layer state for shot / bench tools. */
export function debug7() { return { U: { bx0: U.bx0, bx1: U.bx1, by0: U.by0, by1: U.by1, w: U.w, S: U.S }, O: { bx0: O.bx0, bx1: O.bx1, by0: O.by0, by1: O.by1 }, wet: sWet ? sWet.reduce((a, b) => a + b, 0) : -1, br: sBr ? sBr.reduce((a, b) => a + (b > 0), 0) : -1, lavaCoreN, uq: UQ.q.length / 4, oq: OQ.q.length / 4, tq: TQ.q.length / 4, tpf: [UQ.tpf | 0, OQ.tpf | 0], prof: { ...PROF } }; }
/** Clear / map load: repaint from scratch next frame, drop transient marks. */
export function reset7() { U.ref = null; O.ref = null; spCount = 0; fCount = 0; }
const TOOL7 = { lava: '#ff5a14', mud: '#6b4026', bridge: '#a86f38', tramp: C.red };
/** Brush ring colour for the 4 kinds (null for any other kind). */
export function toolColor7(kind) { return TOOL7[kind] || null; }

// ---------------------------------------------------------------- toolbar swatches (painted straight onto the icon)
/** Paints the swatch for lava / mud / bridge / tramp and returns true; false for any other kind. */
export function swatch7(ctx, kind, w, h) {
  if (!TOOL7[kind]) return false;
  const k = Math.min(w, h) / 40, cx = w / 2, cy = h / 2, R = rng(hash('swatch7' + kind)), M = M0(R);
  ctx.save();
  ctx.setTransform(k, 0, 0, k, cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'lava') swLava(ctx, R, M);
  else if (kind === 'mud') swMud(ctx, R, M);
  else if (kind === 'bridge') swBridge(ctx, R, M);
  else swTramp(ctx, R, M, k, cx, cy);
  ctx.setTransform(k, 0, 0, k, cx, cy);
  tooth(ctx, -24, -20, 48, 40, 77, 0.22);
  ctx.restore();
  return true;
}
function swLava(c, R, M) {
  const pts = ring(0, 1, 19, 13.5, R, 0.14, 12);
  fill(c, shift(pts, 0.9, 0.8, 0.4), LAVA_RIM, R, { sp: 1.1, vary: 0.1 });
  const inner = pts.map(([x, y]) => [x * 0.74, (y - 1) * 0.68 + 1]);
  fill(c, inner, C.fireO, R, { sp: 1, vary: 0.1, edge: 0 });
  for (let i = 0; i < 2; i++) { const p = [], r0 = 0.3 + i * 0.35, ph = R() * TAU; for (let j = 0; j <= 9; j++) { const a = ph + j / 9 * TAU * 0.8, q = r0 + j * 0.035; p.push([-2 + Math.cos(a) * 12 * q, 1 + Math.sin(a) * 7 * q]); } brush(c, p, 1.9, i ? LAVA_HOT : C.fireY, R, { dry: 0.4, taper: 0.5, bristles: 4 }); }
  dab(c, 7.5, 3.5, 1.6, C.fireY, R);
  // a big bubble about to pop
  dab(c, 6.4, -2.6, 3.9, C.ink, R, 0.12); dab(c, 6.6, -2.4, 3.1, C.fireO, R, 0.12); dab(c, 6.2, -2.9, 2, C.fireY, R); brush(c, [[4.6, -3.6], [5.6, -4.8]], 0.8, '#ffffff', R, { bristles: 2, dry: 0.1 });
  // crust blobs on the edge
  for (const [a, s] of [[2.5, 1], [3.6, 0.8], [5.6, 1.1], [0.4, 0.75], [1.2, 0.9]]) {
    const x = Math.cos(a) * 18, y = 1 + Math.sin(a) * 12.6;
    part(c, ring(x, y, 3.4 * s, 2.6 * s, R, 0.2, 8), CRUST[(R() * 4) | 0], M, { lw: 1.1, vary: 0.12 });
  }
  outline(c, pts, R, 2.2, { jit: 0.5, bristles: 4 });
}
function swMud(c, R, M) {
  // flicked drops round the blob (it splashes)
  for (let i = 0; i < 7; i++) { const a = R() * TAU, d = 1.18 + R() * 0.25; dab(c, Math.cos(a) * 19 * d, 1 + Math.sin(a) * 13 * d, 0.9 + R() * 0.9, i & 1 ? MUD : MUD_D, R); }
  const pts = ring(0, 1, 18.5, 13, R, 0.16, 12);
  fill(c, shift(pts, 0.9, 0.8, 0.4), MUD_L, R, { sp: 1.1, vary: 0.1 });
  const inner = pts.map(([x, y]) => [x * 0.8, (y - 1) * 0.74 + 1]);
  fill(c, inner, MUD, R, { sp: 1, vary: 0.12, edge: 0 });
  fill(c, ring(-3, 3, 7.5, 4, R, 0.2, 9), MUD_D, R, { sp: 0.9, vary: 0.08, edge: 0 });
  brush(c, [[-8.5, -4.2], [-4.2, -6.6], [1, -6.8]], 1.7, GLOSS, R, { bristles: 3, dry: 0.4, taper: 0.6 });
  brush(c, [[-6.6, 1.8], [-3.6, 0.8]], 1, GLOSS, R, { bristles: 2, dry: 0.3, taper: 0.5 });
  dab(c, 3.4, -6.4, 1.1, '#ffffff', R);
  // two boot prints pressed in
  for (const [x, y, a] of [[5, 2.5, -0.5], [10.5, -2.5, -0.7]]) {
    c.setTransform(c.getTransform().translate(x, y).rotate(a));
    dab(c, 1.6, 0, 2.4, '#3e2312', R, 0.2); dab(c, -2.6, 0, 1.7, '#3e2312', R, 0.2);
    c.setTransform(c.getTransform().rotate(-a).translate(-x, -y));
  }
  outline(c, pts, R, 2, { jit: 0.5, bristles: 4 });
}
function swBridge(c, R, M) {
  // water under it
  const wp = ring(0, 1, 21.5, 15.5, R, 0.1, 12);
  fill(c, shift(wp, 0.8, 0.7, 0.4), C.pond, R, { sp: 1.1, vary: 0.08, ang: 0.1 });
  brush(c, [[-17, 8], [-14.5, 6.6], [-12, 8], [-9.5, 6.6]], 1.1, '#ffffff', R, { bristles: 2, dry: 0 });
  brush(c, [[9, 10], [11.5, 8.6], [14, 10]], 1.1, '#ffffff', R, { bristles: 2, dry: 0 });
  outline(c, wp, R, 1.8, { jit: 0.45, bristles: 4 });
  // shadow, then the planks (vertical boards across a left-right bridge)
  fill(c, [[-18, -2], [20, -2], [20, 9.4], [-18, 9.4]], '#22569e', R, { sharp: true, edge: 0, vary: 0.05 });
  const n = 7, bw = 38 / n;
  for (let i = 0; i < n; i++) {
    const x0 = -19 + i * bw, j = (R() - 0.5) * 1.2;
    const pts = poly([[x0 + 0.2, -7.8 + j], [x0 + bw - 0.2, -7.6 - j], [x0 + bw - 0.1, 6.6 + j], [x0 + 0.1, 6.8 - j]], R, 0.25);
    const wc = tone(WOOD[i & 3], 0.12);
    part(c, pts, wc, M, { lw: 0.95, sharp: true, ang: Math.PI / 2, sp: 0.8, edge: 0 });
    brush(c, [[x0 + bw * 0.45, -6.6], [x0 + bw * 0.5, 5.6]], 0.45, tone(wc, -0.3), R, { bristles: 1, dry: 0.3 });
  }
  // rope rails + posts
  for (const y of [-8.6, 7.4]) {
    tube(c, [[-21, y], [-10, y + 1.2], [0, y + 0.4], [10, y + 1.2], [21, y]], 1.5, ROPE, R, 0.8);
    for (const x of [-19, 0, 19]) { dab(c, x, y + (x === 0 ? 0.4 : 0), 2.4, C.ink, R); dab(c, x + 0.2, y + 0.2 + (x === 0 ? 0.4 : 0), 1.7, '#7a4a22', R); }
  }
}
function swTramp(c, R, M, k, cx, cy) {
  // the in-game pad (three-quarter view) at icon size, plus boing lines over it
  c.setTransform(k * 1.32, 0, 0, k * 1.32, cx, cy + 3.5 * k);
  padSide(c, R, 0, M);
  c.setTransform(k, 0, 0, k, cx, cy);
  for (const [x, l] of [[-8, 4.6], [0, 6], [8, 4.6]]) brush(c, [[x - 2.6, -11.5 - l * 0.3], [x, -11.5 - l], [x + 2.6, -11.5 - l * 0.3]], 1.3, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.3 });
}
