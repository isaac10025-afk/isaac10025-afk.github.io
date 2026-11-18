// Map looks (OURS, Part 2 step 7, STEP7.md GROUND-ART). Owner: GROUND-ART.
// - LOOK: the 6 ground palettes (grass = today's field) and SKY: the sky band per map (ground.js paints both).
// - Themed trees: the tree prop's sprite by ground (sand palm, snow snowy pine, dirt cactus, rock dead black tree, swamp
//   willow, grass today's tree). sprites-myth.js (marked STEP7 GROUND-ART edits) adds TREE_EXTRA to the tree's poses,
//   wraps its pick with treeThemed() and lets paintThemedTree() paint those poses. Same sim tree (burns, climbs, shelters).
// - drawMapThumb(ctx, id, w, h): the map cards' pictures. The map is built into a scratch world the size of the live one
//   (createWorld + buildMap) and painted as flat kid shapes: wobbly ink outlines, fills that miss them, its ground, its
//   sky, trees, barrels and decorations. Cached per id + size.
// This file imports only paint.js up front (sprites-myth.js imports it while sprites.js is still loading: anything that
// imports sprites.js here would deadlock the page). The sim modules for the thumbnails load on first use (warm()).
import { C, TAU, rng, hash, brush, ring, fill, outline, shift, dab, tube, poly, lerp, tone, canvas as cpuCanvas } from './paint.js';

const T = {
  thumbWob: 1.6,        // thumb px: how far the shape outlines wander (kid wobble)
  thumbWobF: 0.09,      // wobble frequency per thumb px
  thumbInk: 1.25,       // thumb px: ink outline width (scaled by the thumb's size)
  thumbMis: 1.4,        // thumb px: fills miss their outline by this much (misregistration)
  thumbSky: 0.075,      // sky band height as a share of the thumb height (at least 5 px)
  thumbCache: 48,       // thumbnails kept (id x size)
};

// ---------------------------------------------------------------- ground palettes
// tones: the 4 scrubbed stroke colours (grass = C.g1..g4, exactly today's); base: the thumbnail fill; wash: an under-coat
// laid before the strokes so less cream paper shows (null = the paper shows, as on the grass); paper: tooth colour.
export const LOOK = {
  grass: { tones: [C.g1, C.g2, C.g3, C.g4], base: C.g2, wash: null, ink: C.ink, tree: '' },
  sand: { tones: ['#f3d27a', '#ebc35f', '#f8e09a', '#e0b252'], base: '#eec765', wash: '#f1cf78', wet: '#c9a056', wetD: '#b88d45', ink: C.ink, tree: 'palm' },
  snow: { tones: ['#f6fafe', '#e1ecf7', '#ffffff', '#cfdeee'], base: '#eaf2fa', wash: '#eef5fc', shadow: '#a9bfd9', shadowD: '#8ea8c8', ink: '#1d2430', tree: 'pine' },
  dirt: { tones: ['#d97a3e', '#c9652f', '#e8955a', '#b8582c'], base: '#d47238', wash: '#d27139', crack: '#6e2a14', pebble: '#9b8a7a', ink: C.ink, tree: 'cactus' },
  rock: { tones: ['#5a5350', '#4a4442', '#6b625e', '#3e3837'], base: '#4d4644', wash: '#4f4846', glow: '#ff5a1a', glowY: '#ffc93a', glowR: '#c3200f', ink: '#0d0b0a', tree: 'deadtree' },
  swamp: { tones: ['#617032', '#4f5d28', '#73803d', '#5d4d2b'], base: '#58642d', wash: '#5a652e', puddle: '#3a3d20', puddleL: '#55613a', reed: '#3f6a24', cattail: '#5b3a1e', ink: C.ink, tree: 'willow' },
};
export function lookOf(ground) { return LOOK[ground] || LOOK.grass; }

// ---------------------------------------------------------------- sky band per map
// wash: the two pale stripes under the strokes; rows: [y, width, colour, dry] stroke rows (day = exactly today's);
// sun: 'sun' | 'pale' | 'red' | null; cloud: 'cloud' | 'grey' | 'smoke'; flakes: snowflakes in the band; embers: sparks.
export const SKY = {
  day: { wash: ['#a6d5f6', '#b9def8'], rows: [[5, 20, C.sky2, 0.6], [17, 20, C.sky, 0.6], [26, 13, C.sky2, 0.9]], sun: 'sun', cloud: 'cloud' },
  bright: { wash: ['#8fdcff', '#a9e6ff'], rows: [[5, 20, '#4cc3f7', 0.5], [17, 20, '#2fb0f2', 0.5], [26, 13, '#7ad6fb', 0.85]], sun: 'sun', cloud: 'cloud', bigSun: true },
  winter: { wash: ['#dfe8f1', '#e9f0f7'], rows: [[5, 20, '#c7d6e6', 0.6], [17, 20, '#b3c7dc', 0.6], [26, 13, '#d9e4ef', 0.9]], sun: 'pale', cloud: 'grey', flakes: true },
  hot: { wash: ['#a9d8f2', '#ffe6b0'], rows: [[5, 20, '#7cc4ee', 0.6], [17, 20, '#ffd27a', 0.55], [26, 13, '#ffb85c', 0.85]], sun: 'sun', cloud: 'cloud', bigSun: true },
  dusk: { wash: ['#7c2318', '#b8401f'], rows: [[5, 20, '#5e1a16', 0.5], [17, 20, '#a8321c', 0.55], [26, 13, '#ff7a2a', 0.8]], sun: 'red', cloud: 'smoke', embers: true },
  grey: { wash: ['#9ea69f', '#b2b9b1'], rows: [[5, 20, '#879088', 0.6], [17, 20, '#9aa39a', 0.6], [26, 13, '#7a847b', 0.9]], sun: null, cloud: 'grey' },
};
const SKY_OF_MAP = { beach: 'bright', lake: 'winter', canyon: 'hot', volcano: 'dusk', swamp: 'grey' };
const SKY_OF_GROUND = { grass: 'day', sand: 'bright', snow: 'winter', dirt: 'hot', rock: 'dusk', swamp: 'grey' };
/** Sky key for a map (world.map) or null (the blank field). */
export function skyOf(map) { if (!map) return 'day'; return SKY_OF_MAP[map.id] || SKY_OF_GROUND[map.ground] || 'day'; }

// ---------------------------------------------------------------- themed trees
// Pose names: <kind>, <kind>1, <kind>2 (crown shapes for idle / idle1 / idle2), <kind>_burn0, <kind>_burn1, <kind>_singed.
const TREE_KINDS = ['palm', 'pine', 'cactus', 'deadtree', 'willow'];
const BASE_POSES = ['idle', 'idle1', 'idle2', 'burn0', 'burn1', 'singed'];
const SUFFIX = ['', '1', '2', '_burn0', '_burn1', '_singed'];
export const TREE_EXTRA = [];
const THEMED = {};      // ground -> { basePose: themedPose } (interned strings: no string building per frame)
const PAINT_OF = {};    // themed pose -> [kind, shape 0..2, state 0 alive | 1 burn0 | 2 burn1 | 3 singed]
for (const k of TREE_KINDS) {
  const m = {};
  BASE_POSES.forEach((p, i) => { const name = k + SUFFIX[i]; TREE_EXTRA.push(name); m[p] = name; PAINT_OF[name] = [k, i < 3 ? i : 0, i < 3 ? 0 : i - 2]; });
  for (const g in LOOK) if (LOOK[g].tree === k) THEMED[g] = m;
}
/** The tree pose for this ground (info = RENDER's pick info: info.world.map.ground). Grass / no map: pose unchanged. */
export function treeThemed(pose, info) {
  const m = info && info.world && info.world.map;
  const t = m ? THEMED[m.ground] : null;
  return t && pose ? t[pose] || pose : pose;
}
/** Paint a themed tree pose (o as sprites.js paintEntry). False = not a themed pose (the plain tree paints it). */
export function paintThemedTree(c, o) {
  const p = PAINT_OF[o.pose];
  if (!p) return false;
  const st = o.dead === 'burnt' ? 3 : p[2];
  TREE_PAINT[p[0]](c, o.R, o.M, p[1], st);
  return true;
}

// Colours by state: alive / burn0 (scorched) / burn1 (mostly charcoal) / singed (burnt out).
const SCORCH = ['#b8862e', C.orange, C.char];
const leafCol = (st, i, alive) => st === 0 ? alive[i % alive.length] : st === 1 ? SCORCH[i % 3] : i % 2 ? C.charL : '#2b2421';
function inkStroke(c, pts, w, col, R, taper = 0.75, lw = 1.2) {
  brush(c, pts, w + lw * 2, C.ink, R, { taper, dry: 0.08, vary: 0.05, swell: 0.1, bristles: 4 });
  brush(c, pts, w, col, R, { taper, dry: 0.2, vary: 0.1, swell: 0.1 });
}
function embers(c, R, n, x0, y0, w, h) { for (let i = 0; i < n; i++) dab(c, x0 + R() * w, y0 + R() * h, 0.8 + R() * 0.5, i % 2 ? C.fireO : C.fireY, R); }

const TREE_PAINT = {
  // PALM: ringed curved trunk, drooping jagged fronds, coconuts. Shapes lean right / left / far right.
  palm(c, R, M, v, st) {
    const lean = [3, -4, 5][v], tx = lean, ty = -32 + Math.abs(lean) * 0.15;   // crown inside the tree box (x ±22, y > -52)
    const trunk = [[0, 0], [lean * 0.15, -12], [lean * 0.55, -25], [tx, ty]];
    const bark = st >= 2 ? C.char : '#a8743c';
    tube(c, trunk, 3.6, bark, R, 1.3);
    for (let i = 1; i < 7; i++) {   // trunk rings
      const t = i / 7.2, x = lerp(0, tx, t * t * 0.9 + t * 0.1), y = lerp(0, ty, t);
      brush(c, [[x - 2.4, y + 0.6], [x, y - 0.4], [x + 2.4, y + 0.6]], 0.7, st >= 2 ? C.charL : '#6e4a22', R, { bristles: 1, dry: 0.1, taper: 0 });
    }
    if (st === 3) {   // burnt out: charcoal frond stalks
      for (const a of [-2.6, -1.9, -1.1, -0.4]) brush(c, [[tx, ty], [tx + Math.cos(a) * 7, ty + Math.sin(a) * 5], [tx + Math.cos(a) * 11, ty + Math.sin(a) * 3 + 3]], 1.2, C.char, R, { bristles: 2, taper: 0.8, dry: 0.2 });
      return;
    }
    const alive = [C.leaf, C.leafL, '#3f9e3a'];
    const fronds = [-3.0, -2.45, -1.85, -1.3, -0.7, -0.15];
    fronds.forEach((a0, i) => {
      const a = a0 + (R() - 0.5) * 0.2, l = 12.5 + R() * 2.5, ca = Math.cos(a), sa = Math.sin(a);
      const pts = [[tx, ty], [tx + ca * l * 0.45, ty + sa * l * 0.45 - 2.5], [tx + ca * l * 0.85, ty + sa * l * 0.5 + 1.5], [tx + ca * l, ty + sa * l * 0.35 + 5]];
      const col = leafCol(st, i, alive);
      inkStroke(c, pts, 4.2, col, R, 0.85, 1.1);
      for (let j = 1; j < 5; j++) {   // leaflets hanging off the frond
        const q = j / 5, x = lerp(pts[0][0], pts[3][0], q), y = lerp(pts[0][1], pts[3][1], q) + Math.sin(q * Math.PI) * -2.5;
        brush(c, [[x, y], [x + ca * 1.5, y + 3.4]], 1.2, st === 0 ? C.leafD : tone(col, -0.2), R, { bristles: 2, taper: 0.7, dry: 0.2 });
      }
    });
    if (st === 0) for (let i = 0; i < 3; i++) { const x = tx - 2 + i * 2.2, y = ty + 2 + (i % 2); dab(c, x, y, 1.9, '#6b4423', R); dab(c, x - 0.5, y - 0.5, 0.6, '#9a6a3c', R); }
    if (st === 1) embers(c, R, 4, tx - 10, ty - 4, 20, 8);
  },
  // SNOWY PINE: three ragged tiers with snow on every ledge, a short trunk. Shapes: plain / tall / tilted.
  pine(c, R, M, v, st) {
    const k = v === 1 ? 0.86 : 1, tall = v === 1 ? 1.08 : 1, tilt = v === 2 ? 1.6 : 0;
    tube(c, [[0, 0], [0.3, -6], [0.2, -10]], 3.4, st >= 2 ? C.char : C.brown, R, 1.3);
    if (st === 3) {   // burnt out: a charcoal spike with stubs
      brush(c, [[0.2, -9], [0.4 + tilt * 0.5, -28], [0.5 + tilt, -44]], 2.4, C.char, R, { bristles: 3, taper: 0.8, dry: 0.15 });
      for (let i = 0; i < 6; i++) { const y = -14 - i * 5, s = i % 2 ? 1 : -1, l = 9 - i; brush(c, [[tilt * (i / 6), y], [tilt * (i / 6) + s * l, y + 2.4]], 1.2, C.char, R, { bristles: 2, taper: 0.7, dry: 0.2 }); }
      return;
    }
    const tiers = [[-7, -25, 16], [-18, -36, 12.5], [-29, -47, 9]];
    const green = st === 0 ? ['#1f6b3a', '#2a7d45', '#1a5c32'] : st === 1 ? ['#5a4a22', '#7a5426', '#3c3633'] : [C.char, C.charL, '#2b2421'];
    tiers.forEach(([yb, yt, hw], i) => {
      const off = tilt * (i + 1) * 0.6, w = hw * k, top = yt * tall, bot = yb * tall;
      const pts = [[off + 0.4, top], [off + w * 0.55, lerp(top, bot, 0.55)], [off + w, bot], [off + w * 0.5, bot - 2], [off, bot + 0.6], [off - w * 0.5, bot - 2], [off - w, bot], [off - w * 0.55, lerp(top, bot, 0.55)]];
      const P = poly(pts, R, 0.5);
      fill(c, shift(P, M.mx, M.my, 0.4), green[i], R, { sharp: true, vary: 0.12, sp: 1 });
      if (st === 0) {   // snow on the ledge + a cap
        const sn = [[off - w * 0.95, bot - 0.4], [off - w * 0.5, bot - 3.2], [off, bot - 1.6], [off + w * 0.5, bot - 3.2], [off + w * 0.95, bot - 0.4], [off + w * 0.5, bot - 5.4], [off, bot - 3.6], [off - w * 0.5, bot - 5.4]];
        fill(c, poly(sn, R, 0.4), '#ffffff', R, { sharp: false, vary: 0.04, sp: 0.9, edge: 0 });
        brush(c, [[off - w * 0.4, lerp(top, bot, 0.5)], [off - w * 0.15, lerp(top, bot, 0.42)]], 1.4, '#eef5fc', R, { bristles: 2, dry: 0.3 });
      } else if (st === 1) embers(c, R, 2, off - w * 0.6, bot - 6, w * 1.2, 4);
      outline(c, P, R, 1.45);
    });
    if (st === 0) { const cap = ring(tilt * 1.8 + 0.4, -46 * tall, 2.8, 2, R, 0.1, 7); fill(c, cap, '#ffffff', R, { edge: 0 }); outline(c, cap, R, 1); }
  },
  // CACTUS: a saguaro column with arms, ribs and spines; shape 2 has a pink flower. Burnt out: a charred stump.
  cactus(c, R, M, v, st) {
    const g = st === 0 ? '#5aa845' : st === 1 ? '#8a6a2a' : C.char, gD = st === 0 ? '#3d8433' : st === 1 ? '#5a3a1e' : '#2b2421';
    if (st === 3) {
      tube(c, [[0, 0], [0.2, -10], [0.6, -19]], 7, C.char, R, 1.4);
      tube(c, [[-3.5, -10], [-8, -10.5], [-8.6, -16]], 4, C.char, R, 1.2);
      dab(c, 0.4, -19, 2.2, C.charL, R);
      return;
    }
    const arms = v === 0 ? [[-1, -17, -10, -29], [1, -23, 10, -33]] : v === 1 ? [[1, -20, 10.5, -32]] : [[-1, -14, -10, -24], [1, -16, 9.5, -26]];
    for (const [s, y0, x1, y1] of arms) tube(c, [[s * 3.5, y0], [x1 * 0.75, y0 + 0.6], [x1, y0 - 3], [x1 + s * 0.4, y1]], 5, g, R, 1.35);
    tube(c, [[0, 0], [0.4, -14], [-0.2, -28], [0.2, -41]], 8.4, g, R, 1.5);
    // ribs + spines
    for (const dx of [-2, 0.4, 2.6]) brush(c, [[dx, -3], [dx + 0.3, -20], [dx, -38]], 0.6, gD, R, { bristles: 1, dry: 0.35, taper: 0.2 });
    if (st === 0) for (let i = 0; i < 14; i++) { const y = -4 - R() * 34, s = R() < 0.5 ? -1 : 1, x = s * (4.2 + R() * 0.6); brush(c, [[x, y], [x + s * 1.5, y - 0.6]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 }); }
    if (st === 0) brush(c, [[-2.4, -36], [-2.6, -12]], 1.4, '#8ccf5a', R, { bristles: 2, dry: 0.4 });
    if (st === 0 && v === 2) { for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; dab(c, 0.4 + Math.cos(a) * 1.8, -43 + Math.sin(a) * 1.4, 1.3, C.pink, R); } dab(c, 0.4, -43, 0.9, C.yellow, R); }
    if (st === 1) embers(c, R, 4, -5, -38, 10, 30);
  },
  // DEAD TREE (volcano): a black twisted trunk, bare forked branches, a few glowing cracks. Burnt out: ash grey, broken.
  deadtree(c, R, M, v, st) {
    const bark = st === 3 ? C.charL : '#1e1918', hi = st === 3 ? '#8a817a' : '#8c7f78';   // near-black bark, a pale ash highlight so it reads on the charcoal ground
    const sw = [1, -1, 1][v], top = st === 3 ? -27 : -33;
    const trunk = [[0, 0], [1.2 * sw, -10], [-1.2 * sw, -20], [0.8 * sw, top]];
    tube(c, trunk, 4.4, bark, R, 1.3);
    brush(c, [[-0.9, -3], [0.1 * sw, -12], [-1.7 * sw, -21], [-0.4 * sw, -28]], 1.3, hi, R, { bristles: 2, dry: 0.35, taper: 0.4 });
    const B = st === 3 ? [[0.4, -20, -2.2, 9], [0.6, -24, -0.9, 8]] : v === 1
      ? [[0.4, -18, -2.5, 13], [0.6, -26, -0.5, 13], [0.6, -32, -1.9, 12], [0.2, -14, -0.2, 10]]
      : [[0.4, -19, -2.4, 14], [0.5, -25, -0.7, 14], [0.6, -32, -1.3, 13], [0.3, -15, -2.9, 9], [0.6, -30, -2.0, 10]];
    for (const [x0, y0, a, l] of B) {   // twisted: each branch bends twice, forks at its end
      const x1 = x0 * sw + Math.cos(a) * l * 0.5 * sw, y1 = y0 + Math.sin(a) * l * 0.5, x2 = x0 * sw + Math.cos(a + 0.35) * l * sw, y2 = y0 + Math.sin(a + 0.35) * l;
      brush(c, [[x0 * sw, y0], [x1 + sw * 1.2, y1], [x2, y2]], 2.6, C.ink, R, { bristles: 3, taper: 0.8, dry: 0.1 });
      brush(c, [[x0 * sw, y0], [x1 + sw * 1.2, y1], [x2, y2]], 1.5, bark, R, { bristles: 2, taper: 0.8, dry: 0.2 });
      if (st !== 3) for (const da of [0.7, -0.6]) brush(c, [[x2, y2], [x2 + Math.cos(a + da) * 4 * sw, y2 + Math.sin(a + da) * 4]], 1.1, C.ink, R, { bristles: 2, taper: 0.8, dry: 0.1 });
    }
    if (st !== 3) {   // glowing cracks in the bark (lava light)
      brush(c, [[0.4 * sw, -6], [1.4 * sw, -9], [0.6 * sw, -12]], 1.1, st === 0 ? '#e0401a' : C.fireO, R, { bristles: 2, dry: 0.1, taper: 0.3 });
      dab(c, 0.9 * sw, -9, 0.7, C.fireY, R);
    }
    if (st === 1) embers(c, R, 4, -12, -40, 24, 22);
    if (st === 2) embers(c, R, 7, -14, -42, 28, 28);
  },
  // WILLOW: a short thick trunk, a dome crown, long strands hanging almost to the ground. Burnt out: bare drooping strands.
  willow(c, R, M, v, st) {
    const ox = [0, -2, 2.5][v];
    const bark = st >= 2 ? C.char : '#7a5530';
    tube(c, [[0, 0], [0.6, -8], [ox * 0.5, -18]], 5, bark, R, 1.4);
    brush(c, [[0.4, -12], [-4.5, -17]], 1.8, bark, R, { bristles: 2, dry: 0.2 });
    brush(c, [[0.6, -14], [5, -19]], 1.6, bark, R, { bristles: 2, dry: 0.2 });
    if (st === 3) {
      for (let i = 0; i < 7; i++) { const x = ox - 13 + i * 4.3; brush(c, [[ox + (x - ox) * 0.4, -26], [x, -24], [x + 0.6, -15 + R() * 4]], 0.9, C.char, R, { bristles: 1, taper: 0.6, dry: 0.2 }); }
      return;
    }
    const alive = ['#7d9c32', '#93b440', '#5f8128'];
    // the crown: a bell of hanging leaves, open at the bottom middle where the trunk shows
    const bell = [[ox - 18, -11], [ox - 19.5, -20], [ox - 16.5, -31], [ox - 8.5, -38.5], [ox, -40.5], [ox + 8.5, -38.5], [ox + 16.5, -31], [ox + 19.5, -20], [ox + 18, -11]];
    const hem = [[ox + 14, -7.5], [ox + 10, -12.5], [ox + 6, -8.5], [ox + 2.5, -16], [ox - 2.5, -16], [ox - 6, -8.5], [ox - 10, -12.5], [ox - 14, -7.5]];
    const P = poly(bell.concat(hem), R, 0.5);
    fill(c, shift(P, M.mx, M.my, 0.4), st === 0 ? '#4f6e22' : st === 1 ? '#6a4a20' : C.char, R, { sharp: true, vary: 0.12, sp: 1.1, edge: 0 });
    for (let i = 0; i < 18; i++) {   // strands: a fountain from the top, out over the shoulders, hanging down
      const sd = i % 2 ? 1 : -1, u = (i >> 1) / 8, y1 = -8 - R() * 5 - (1 - u) * 5;
      const p0 = [ox + sd * u * 6, -38.5 + u * 2.5], p1 = [ox + sd * (5 + u * 11.5), -34 + u * 5], p2 = [ox + sd * (6.5 + u * 12), lerp(-30 + u * 5, y1, 0.5)], p3 = [ox + sd * (7 + u * 11.5) + (R() - 0.5), y1];
      brush(c, [p0, p1, p2, p3], 1.7, leafCol(st, i, alive), R, { bristles: 2, taper: 0.55, dry: 0.25 });
    }
    outline(c, bell, R, 1.5, { gap: true, over: 0 });
    if (st === 1) embers(c, R, 5, ox - 14, -32, 28, 18);
  },
};

// ---------------------------------------------------------------- thumbnails
// Two steps, so opening the maps panel is quick:
//   1. a SKETCH per map (built once per world size, ahead in idle time by prewarmThumbs(), else on first use): the map
//      built into a scratch world (createWorld + buildMap, the live world's size), boiled down to one kind byte per 8 px
//      tile + its trees / barrels / pads / decorations. The scratch world is reused (cleared between builds).
//   2. the picture per size (cached): one pixel pass over the sketch (wobbly sampling, fills that miss their ink, the
//      ground's strokes from small lookup tables, paper grain), then the props, decorations and sky as flat kid shapes.
let SIM = null, simP = null;
/** Start loading the sim modules the thumbnails need (ground.js calls it once the game draws). */
export function warm() {
  if (!simP) simP = Promise.all([import('../../sim/world.js'), import('../../sim/maps/index.js'), import('../../sim/terrain/grid.js')])
    .then(([w, m, g]) => { SIM = { createWorld: w.createWorld, buildMap: m.buildMap, getMap: m.getMap, MAP_ORDER: m.MAP_ORDER, terrainOf: g.terrainOf }; return SIM; })
    .catch((e) => { console.warn('maps-art: sim modules', e); return null; });
  return simP;
}
const thumbs = new Map();   // key -> canvas
const sketches = new Map(); // id|WxH -> sketch
let lastMs = 0, lastSketchMs = 0, liveW = 0, liveH = 0;
/** The live world's size (ground.js passes it each frame; thumbnails are built at it). */
export function setLiveSize(W, H) { liveW = W; liveH = H; }
function worldSize() {
  if (liveW > 0) return [liveW, liveH];
  const g = typeof window !== 'undefined' && window.__pb && window.__pb.game;
  if (g && g.world) return [g.world.W, g.world.H];
  const land = typeof innerWidth === 'undefined' || innerWidth >= innerHeight;
  return land ? [3600, 1850] : [730, 1460];
}
export function thumbStats() { return { lastMs, lastSketchMs, cached: thumbs.size, sketches: sketches.size }; }
/** Build the next missing map sketch (idle time; ground.js calls it). False = all built. */
export function prewarmThumbs() {
  if (!SIM) { warm(); return true; }
  const [W, H] = worldSize();
  for (const id of SIM.MAP_ORDER) if (SIM.getMap(id) && !sketches.has(id + '|' + W + 'x' + H)) { sketchOf(id, W, H); return true; }
  if (!warmDrawn) { warmDrawn = true; for (const id of SIM.MAP_ORDER) if (SIM.getMap(id)) { makeThumb(id, 96, 60, W, H); break; } return true; }   // tables + a warm code path
  return false;
}
let warmDrawn = false;

/**
 * Paint map `id` ('blank' = the empty field) as a card picture into ctx at (0, 0, w, h) in ctx's current units. The
 * picture is made at the device size (ctx's transform scale) and cached per id + size. Returns true when it drew the map,
 * false when the sim isn't loaded yet (a ground-coloured card is drawn; call again after `await warm()`).
 */
export function drawMapThumb(ctx, id, w, h) {
  const tf = ctx.getTransform ? ctx.getTransform() : null, dk = tf ? Math.max(0.25, Math.hypot(tf.a, tf.b)) : 1;
  const pw = Math.max(8, Math.round(w * dk)), ph = Math.max(8, Math.round(h * dk));
  const [W, H] = worldSize();
  const key = `${id}|${pw}x${ph}|${W}x${H}`;
  let cv = thumbs.get(key);
  if (!cv) {
    if (!SIM) {
      warm();
      ctx.fillStyle = lookOf(GUESS[id] || 'grass').base; ctx.fillRect(0, 0, w, h);
      return false;
    }
    const t0 = performance.now();
    cv = makeThumb(id, pw, ph, W, H);
    lastMs = performance.now() - t0;
    if (thumbs.size >= T.thumbCache) thumbs.delete(thumbs.keys().next().value);
    thumbs.set(key, cv);
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cv, 0, 0, w, h);
  ctx.restore();
  return true;
}
const GUESS = { castle: 'grass', beach: 'sand', lake: 'snow', canyon: 'dirt', village: 'grass', volcano: 'rock', swamp: 'swamp', playground: 'grass' };

// kinds in a sketch (GROUP = outline group: shallow and deep water are one shape)
const K_GROUND = 0, K_WALL = 1, K_SHALLOW = 2, K_DEEP = 3, K_ICE = 4, K_LAVA = 5, K_MUD = 6, K_BRIDGE = 7;
const GROUP = new Uint8Array([0, 1, 2, 2, 3, 4, 5, 6]);
const hexInt = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const KCOL = [null, [C.grey, C.greyL, '#9a9da1'], [C.pondL, '#a6d6fb'], [C.pond, C.pondD], ['#cfeeff', '#ffffff'], ['#ff7a12', '#ffd23a'], ['#6b4425', '#7d5330'], ['#b07a3f', '#8b5a2b']].map((a) => a && a.map(hexInt));
let scratchW = null;   // reused scratch world (same size: cleared between builds)

function sketchOf(id, W, H) {
  const key = id + '|' + W + 'x' + H;
  let sk = sketches.get(key);
  if (sk !== undefined) return sk;
  sk = null;
  if (id && id !== 'blank' && SIM && SIM.getMap(id)) {
    const t0 = performance.now();
    if (!scratchW || scratchW.W !== W || scratchW.H !== H) scratchW = SIM.createWorld({ W, H, seed: 1 });
    else resetWorld(scratchW);
    const world = scratchW;
    let map = null;
    try { map = SIM.buildMap(world, id, { secret: false }); } catch (e) { console.warn('maps-art: thumb build', id, e); }
    if (map) {
      const walls = world.walls, cols = walls.cols, rows = walls.rows, n = cols * rows, solid = walls.solid;
      const Tg = SIM.terrainOf(world), lev = Tg.level, ice = Tg.iceHp;
      const L7 = world.lava7, M7 = world.mud7, B7 = world.bridge7, P7 = world.tramp7;
      const lava = L7 && L7.cells > 0 ? L7.grid : null, mud = M7 && M7.cells > 0 ? M7.grid : null, br = B7 && B7.cells > 0 ? B7.hp : null;
      const kind = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        kind[i] = solid[i] === 1 ? K_WALL : br && br[i] > 0 ? K_BRIDGE : lava && lava[i] > 0 ? K_LAVA : ice[i] > 0 ? K_ICE
          : lev[i] >= 0.75 ? K_DEEP : lev[i] >= 0.05 ? K_SHALLOW : mud && mud[i] > 0 ? K_MUD : K_GROUND;
      }
      const props = [];
      for (const u of world.units) if (!u.dead && (u.type === 'tree' || u.type === 'barrel')) props.push([u.type === 'tree' ? 0 : 1, u.x, u.y]);
      props.sort((a, b) => a[2] - b[2]);
      const pads = [];
      if (P7 && P7.count > 0) for (let i = 0; i < P7.high; i++) if (P7.state[i] === 1) pads.push([P7.x[i], P7.y[i]]);
      sk = { id, ground: map.ground, map: { id, ground: map.ground }, cols, rows, kind, props, pads, deco: map.deco.slice() };
    }
    lastSketchMs = performance.now() - t0;
  }
  sketches.set(key, sk);
  return sk;
}
function resetWorld(w) {
  // a clean field for the next build: what game.clear() wipes, for the parts a map paints (clearAll runs the terrain
  // kinds' onWorldClear hooks: lava7, mud7, bridge7, tramp7)
  w.clearAll();
  const T0 = SIM.terrainOf(w);
  T0.depth.fill(0); T0.level.fill(0); T0.shore.fill(0); T0.iceHp.fill(0); w.waterCells = 0; w.iceCells = 0;
}

// small lookup tables for the pixel pass (built once)
const NT = 256, NM = NT - 1;
let TAB = null;
function tables() {
  if (TAB) return TAB;
  const R = rng(7341), wob = new Float32Array(NT * 4), streak = new Uint8Array(NT * NT), grain = new Int8Array(NT * NT);
  for (let i = 0; i < NT; i++) {   // four smooth wobble curves (sums of sines over the table: they wrap)
    for (let q = 0; q < 4; q++) { const ph = q * 1.7; wob[q * NT + i] = Math.sin(i / NT * TAU * 3 + ph) * 0.6 + Math.sin(i / NT * TAU * 7 + ph * 2) * 0.4; }
  }
  // ground strokes: long horizontal scrubs, each row of the table a few strokes of the 4 tones
  for (let y = 0; y < NT; y++) {
    let x = 0, t = (R() * 4) | 0;
    const off = (R() * NT) | 0;
    while (x < NT) { const len = 18 + ((R() * 50) | 0); for (let k = 0; k < len && x < NT; k++, x++) streak[y * NT + ((x + off) & NM)] = t; t = (t + 1 + ((R() * 3) | 0)) & 3; }
  }
  // thicken the strokes vertically (3-row bands) so they read as brush strokes, not lines
  for (let y = NT - 1; y >= 2; y--) if ((y % 3) !== 0) for (let x = 0; x < NT; x++) streak[y * NT + x] = streak[(y - (y % 3)) * NT + x];
  for (let i = 0; i < NT * NT; i++) grain[i] = ((R() - 0.5) * 16) | 0;
  TAB = { wob, streak, grain };
  return TAB;
}

function makeThumb(id, pw, ph, W, H) {
  const sk = sketchOf(id, W, H), map = sk ? sk.map : null;
  const L = lookOf(map && map.ground), sky = SKY[skyOf(map)];
  const cv = cpuCanvas(pw, ph), c = cv.getContext('2d', { willReadFrequently: true });
  // world -> thumb: contain, centred; samples outside the world repeat its edge
  const k = Math.min(pw / W, ph / H), ox = (pw - W * k) / 2, oy = (ph - H * k) / 2;
  const skyH = Math.max(5, Math.round(ph * T.thumbSky));
  const unit = Math.max(1, pw / 220), { wob, streak, grain } = tables();
  const n = pw * ph, kind = new Uint8Array(n);
  // ---- kind buffer: each pixel samples the sketch at a wobbly spot (separable wobble: two table lookups per axis)
  if (sk) {
    const cols = sk.cols, rows = sk.rows, sk8 = 1 / (8 * k), g = sk.kind, amp = T.thumbWob * unit, fs = T.thumbWobF / unit * NT / TAU;
    const dxRow = new Float32Array(ph), dyCol = new Float32Array(pw), dxCol = new Float32Array(pw), dyRow = new Float32Array(ph);
    for (let py = 0; py < ph; py++) { dxRow[py] = wob[((py * fs) | 0) & NM] * amp; dyRow[py] = wob[NT * 2 + (((py * fs * 0.7) | 0) & NM)] * amp * 0.4; }
    for (let px = 0; px < pw; px++) { dyCol[px] = wob[NT + (((px * fs) | 0) & NM)] * amp; dxCol[px] = wob[NT * 3 + (((px * fs * 0.7) | 0) & NM)] * amp * 0.4; }
    for (let py = 0; py < ph; py++) {
      const dr = dxRow[py], er = dyRow[py], o0 = py * pw;
      for (let px = 0; px < pw; px++) {
        let tx = ((px + dr + dxCol[px] - ox) * sk8) | 0, ty = ((py + dyCol[px] + er - oy) * sk8) | 0;
        tx = tx < 0 ? 0 : tx >= cols ? cols - 1 : tx; ty = ty < 0 ? 0 : ty >= rows ? rows - 1 : ty;
        kind[o0 + px] = g[ty * cols + tx];
      }
    }
  }
  // ---- colour pass: the fill is the kind under a shifted spot (misregistration), ink on the true shape edges
  const img = c.createImageData(pw, ph), d = img.data;
  const tones = L.tones.map(hexInt), mis = T.thumbMis * unit, mx = Math.round(mis), my = Math.round(mis * 0.7);
  const inkW = Math.max(1, Math.round(T.thumbInk * unit)), ink = hexInt(L.ink), bw = 5 * unit, bh = 3 * unit;
  const sy = Math.max(1, Math.round(unit));   // streak table rows per thumb px (strokes get fatter on big thumbs)
  for (let py = 0; py < ph; py++) {
    const srow = (((py / sy) | 0) & NM) * NT, grow = (py & NM) * NT, sh = (py * 5) & NM, brickRow = ((py / bh) | 0) & 1;
    for (let px = 0; px < pw; px++) {
      const o = py * pw + px, fx = px - mx, fy = py - my;
      const kf = fx >= 0 && fy >= 0 ? kind[fy * pw + fx] : kind[o];
      let col;
      if (kf === K_GROUND) col = tones[streak[srow + (((px >> (unit > 1.6 ? 1 : 0)) + sh) & NM)]];
      else if (kf === K_WALL) col = KCOL[1][(((px / bw + brickRow * 0.5) | 0) & 1) ? 0 : 1];
      else if (kf === K_LAVA) col = KCOL[5][streak[srow + ((px * 2 + sh) & NM)] === 0 ? 1 : 0];
      else if (kf === K_BRIDGE) col = KCOL[7][(((px / (2.2 * unit)) | 0) % 3) === 0 ? 1 : 0];
      else col = KCOL[kf][kf !== K_DEEP && grain[grow + (px & NM)] > 5 ? 1 : 0];
      const k0 = kind[o];
      if (k0 !== K_GROUND) {
        const g0 = GROUP[k0];
        for (let e = 1; e <= inkW; e++) {
          if ((px >= e && GROUP[kind[o - e]] !== g0) || (px + e < pw && GROUP[kind[o + e]] !== g0) || (py >= e && GROUP[kind[o - e * pw]] !== g0) || (py + e < ph && GROUP[kind[o + e * pw]] !== g0)) { col = ink; break; }
        }
      }
      const j = grain[grow + ((px * 3) & NM)];
      d[o * 4] = col[0] + j; d[o * 4 + 1] = col[1] + j; d[o * 4 + 2] = col[2] + j; d[o * 4 + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // ---- shapes on top (vector, batched: one Path2D per colour and layer): flicks, pads, decorations, props, sky band
  const R = rng(hash('thumb|' + id)), S = unit;
  if (sk) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const B = batch(), wv = B.stroke('#ffffff', Math.max(1, 0.8 * S));
    for (let i = 0; i < 160; i++) {   // white wave flicks on deep water
      const px = R() * pw, py = R() * ph;
      if (kind[(py | 0) * pw + (px | 0)] !== K_DEEP) continue;
      wv.moveTo(px - 2.5 * S, py); wv.quadraticCurveTo(px - 1.2 * S, py - 1.5 * S, px, py); wv.quadraticCurveTo(px + 1.2 * S, py - 1.5 * S, px + 2.5 * S, py);
    }
    const lw = Math.max(0.7, 0.6 * S), ink = B.stroke(C.ink, lw);
    for (const [x0, y0] of sk.pads) { const x = ox + x0 * k, y = oy + y0 * k; blob(B.fill(C.red), ink, x, y, Math.max(1.6, 14 * k), R); blob(B.fill('#26222e'), null, x, y, Math.max(1, 9 * k), R); }
    for (const dc of sk.deco) decoThumb(B, dc, ox + dc.x * k, oy + dc.y * k, k, S, L, R, W, lw);
    B.flush(c);
    // props: trunks, then crowns, then their ink (all the same size in one picture)
    const s = Math.max(2.2, 13 * k), tl = Math.max(0.8, s * 0.14), tink = B.stroke(C.ink, tl);
    for (const [type, x0, y0] of sk.props) {
      const x = ox + x0 * k, y = oy + y0 * k;
      if (type === 1) { const b = Math.max(1.4, 9 * k); B.fill(C.brown).rect(x - b * 0.8 + 0.6 * S, y - b * 1.9 + 0.4 * S, b * 1.6, b * 1.9); B.stroke(C.ink, Math.max(0.8, 0.7 * S)).rect(x - b * 0.8, y - b * 1.9, b * 1.6, b * 1.9); continue; }
      treeThumb(B, tink, x, y, s, L.tree, R);
    }
    B.flush(c);
  }
  skyThumb(c, pw, skyH, sky, R, S);
  return cv;
}
// Path2D per colour (fills first, then strokes, in first-use order)
function batch() {
  const f = new Map(), st = new Map();
  return {
    fill(col) { let p = f.get(col); if (!p) f.set(col, p = new Path2D()); return p; },
    stroke(col, w) { const key = col + '|' + w.toFixed(2); let e = st.get(key); if (!e) st.set(key, e = { col, w, p: new Path2D() }); return e.p; },
    flush(c) { for (const [col, p] of f) { c.fillStyle = col; c.fill(p); } for (const e of st.values()) { c.strokeStyle = e.col; c.lineWidth = e.w; c.stroke(e.p); } f.clear(); st.clear(); },
  };
}
function blob(fp, sp, x, y, r, R) {
  const pts = 8;
  for (const p of sp ? [fp, sp] : [fp]) {
    for (let i = 0; i <= pts; i++) { const a = i / pts * TAU, kk = 1 + ((i * 7919 + (x | 0)) % 13 - 6) * 0.02; const X = x + Math.cos(a) * r * kk, Y = y + Math.sin(a) * r * 0.8 * kk; i ? p.lineTo(X, Y) : p.moveTo(X, Y); }
    p.closePath();
  }
  void R;
}
function blobAt(c, x, y, r, col, R, inked = true) {   // one immediate blob (sky)
  c.beginPath();
  for (let i = 0; i <= 8; i++) { const a = i / 8 * TAU, kk = 1 + (R() - 0.5) * 0.25; i ? c.lineTo(x + Math.cos(a) * r * kk, y + Math.sin(a) * r * 0.8 * kk) : c.moveTo(x + Math.cos(a) * r * kk, y + Math.sin(a) * r * 0.8 * kk); }
  c.closePath(); c.fillStyle = col; c.fill();
  if (inked) { c.strokeStyle = C.ink; c.lineWidth = Math.max(0.8, r * 0.22); c.stroke(); }
}
// a tree as a few flat kid shapes: trunk + the ground's crown
function treeThumb(B, ink, x, y, s, kind, R) {
  if (kind === 'cactus') {
    const g = B.fill('#5aa845'); g.rect(x - s * 0.22, y - s * 1.5, s * 0.44, s * 1.5); g.rect(x - s * 0.62, y - s * 1.1, s * 0.22, s * 0.5); g.rect(x - s * 0.62, y - s * 0.75, s * 0.42, s * 0.18);
    ink.rect(x - s * 0.22, y - s * 1.5, s * 0.44, s * 1.5); return;
  }
  if (kind === 'deadtree') { const p = B.stroke('#1a1514', Math.max(1, s * 0.2)); p.moveTo(x, y); p.lineTo(x, y - s * 1.2); p.moveTo(x, y - s * 0.7); p.lineTo(x - s * 0.5, y - s * 1.3); p.moveTo(x, y - s * 0.9); p.lineTo(x + s * 0.5, y - s * 1.5); return; }
  if (kind === 'palm') {
    const t = B.stroke('#a8743c', Math.max(1, s * 0.2)); t.moveTo(x, y); t.quadraticCurveTo(x + s * 0.1, y - s * 0.8, x + s * 0.3, y - s * 1.4);
    const f = B.stroke(C.leaf, Math.max(1, s * 0.22));
    for (const a of [-2.8, -2, -1.2, -0.4]) { f.moveTo(x + s * 0.3, y - s * 1.4); f.quadraticCurveTo(x + s * 0.3 + Math.cos(a) * s * 0.5, y - s * 1.6 + Math.sin(a) * s * 0.3, x + s * 0.3 + Math.cos(a) * s * 0.8, y - s * 1.2 + Math.sin(a) * s * 0.2); }
    return;
  }
  B.fill(C.brown).rect(x - s * 0.12, y - s * 0.7, s * 0.24, s * 0.7);
  if (kind === 'pine') {
    const tri = (p) => { p.moveTo(x, y - s * 1.9); p.lineTo(x + s * 0.65, y - s * 0.35); p.lineTo(x - s * 0.65, y - s * 0.35); p.closePath(); };
    tri(B.fill('#1f6b3a')); tri(ink);
    const sn = B.fill('#ffffff'); sn.moveTo(x, y - s * 1.9); sn.lineTo(x + s * 0.25, y - s * 1.3); sn.lineTo(x - s * 0.25, y - s * 1.3); sn.closePath();
    return;
  }
  blob(B.fill(kind === 'willow' ? '#6f8f2e' : C.leaf), ink, x, y - s * 1.15, s * 0.62, R);
  if (kind === 'willow') { const p = B.stroke('#93b440', Math.max(0.8, s * 0.1)); for (let i = -2; i <= 2; i++) { p.moveTo(x + i * s * 0.25, y - s); p.lineTo(x + i * s * 0.28, y - s * 0.35); } }
}
// decorations as tiny flat shapes (the ground layer paints the real ones); anything under ~1 px is left out
function decoThumb(B, dc, x, y, k, S, L, R, W, lw) {
  const s = (dc.s || 1) * k, ink = B.stroke(C.ink, lw);
  const turn = (p, pts) => { const a = dc.a || 0, ca = Math.cos(a), sa = Math.sin(a); pts.forEach(([u, v], i) => { const X = x + (ca * u - sa * v) * s, Y = y + (sa * u + ca * v) * s; i ? p.lineTo(X, Y) : p.moveTo(X, Y); }); p.closePath(); };
  switch (dc.kind) {
    case 'flag': { const h = Math.max(4, 30 * s), col = dc.x < W / 2 ? C.red : C.blue; ink.moveTo(x, y); ink.lineTo(x, y - h); const f = B.fill(col); f.moveTo(x, y - h); f.lineTo(x + h * 0.55, y - h * 0.8); f.lineTo(x, y - h * 0.6); f.closePath(); break; }
    case 'path': if (22 * s > 1) blob(B.fill('#c9a46a'), null, x, y, 22 * s, R); break;
    case 'flowers': if (2.6 * s > 0.5) { const p = B.fill(R() < 0.5 ? C.yellow : C.pink); p.moveTo(x + 3 * s, y); p.arc(x, y, Math.max(0.8, 3 * s), 0, TAU); } break;
    case 'sandcastle': { const p = B.fill('#f2c764'); p.rect(x - 12 * s, y - 16 * s, 24 * s, 16 * s); ink.rect(x - 12 * s, y - 16 * s, 24 * s, 16 * s); break; }
    case 'shell': if (3.5 * s > 0.6) { const p = B.fill(C.pink); p.moveTo(x + 3.5 * s, y); p.arc(x, y, Math.max(0.8, 3.5 * s), 0, TAU); } break;
    case 'snowdrift': blob(B.fill('#ffffff'), ink, x, y, Math.max(2, 26 * s), R); break;
    case 'crop': turn(B.fill('#7a5230'), [[-40, -5], [40, -5], [40, 5], [-40, 5]]); turn(B.fill(C.leafL), [[-38, -2.5], [38, -2.5], [38, 2.5], [-38, 2.5]]); break;
    case 'sandpit': turn(B.fill('#f1d27c'), [[-50, -35], [50, -35], [50, 35], [-50, 35]]); turn(ink, [[-50, -35], [50, -35], [50, 35], [-50, 35]]); break;
    case 'hopscotch': { const p = B.stroke('#ffffff', Math.max(0.8, 2 * s)); for (let i = 0; i < 6; i++) turn(p, [[-55 + i * 18, -9], [-37 + i * 18, -9], [-37 + i * 18, 9], [-55 + i * 18, 9]]); break; }
    case 'reeds': { const p = B.stroke(L.reed || C.leaf, Math.max(0.8, 1.6 * s)); for (let i = -1; i <= 1; i++) { p.moveTo(x + i * 4 * s, y); p.lineTo(x + i * 5 * s, y - 18 * s); } break; }
    case 'lilypad': { const p = B.fill(C.leafL); p.moveTo(x, y); p.arc(x, y, Math.max(0.8, 7 * s), 0.4, TAU); p.closePath(); break; }
    case 'bones': { const p = B.stroke('#fffdf2', Math.max(0.8, 2.4 * s)); p.moveTo(x - 8 * s, y); p.lineTo(x + 8 * s, y); break; }
    case 'glowcrack': { const p = B.stroke(L.glow || C.orange, Math.max(0.8, 2.6 * s)), a = dc.a || 0, ca = Math.cos(a), sa = Math.sin(a); [[-28, 0], [-10, -4], [8, 3], [28, -2]].forEach(([u, v], i) => { const X = x + (ca * u - sa * v) * s, Y = y + (sa * u + ca * v) * s; i ? p.lineTo(X, Y) : p.moveTo(X, Y); }); break; }
    case 'slide': turn(B.fill(C.red), [[-45, -9], [45, -9], [45, 9], [-45, 9]]); turn(B.fill(C.yellow), [[-55, -12], [-41, -12], [-41, 12], [-55, 12]]); turn(ink, [[-55, -12], [45, -12], [45, 12], [-55, 12]]); break;
    default: break;
  }
}
function skyThumb(c, pw, skyH, sky, R, S) {
  const h = skyH;
  c.fillStyle = sky.wash[0]; c.fillRect(0, 0, pw, h);
  c.lineCap = 'round';
  sky.rows.forEach(([y, w, col], i) => {
    c.strokeStyle = col; c.lineWidth = Math.max(1.5, h * w / 42);
    const yy = (y / 30) * h * 0.85;
    for (let x = -10 + R() * 10; x < pw; x += pw * 0.3 + R() * pw * 0.12) { c.beginPath(); c.moveTo(x, yy + (R() - 0.5) * 2); c.lineTo(x + pw * 0.24, yy + (R() - 0.5) * 2); c.stroke(); }
    void i;
  });
  // ragged bottom edge
  c.fillStyle = sky.rows[2][2]; c.beginPath(); c.moveTo(0, h - 1);
  for (let x = 0; x <= pw; x += 4 * S) c.lineTo(x, h - 1 + (R() - 0.3) * 2.2 * S);
  c.lineTo(pw, h - 2); c.lineTo(0, h - 2); c.fill();
  if (sky.sun) { const r = Math.max(2.5, h * (sky.bigSun ? 0.55 : 0.45)), col = sky.sun === 'red' ? '#ff4a1e' : sky.sun === 'pale' ? '#fff3b8' : C.sun; blobAt(c, h * 0.9, h * 0.55, r, col, R); }
  if (sky.cloud) { const col = sky.cloud === 'smoke' ? '#3c3433' : sky.cloud === 'grey' ? '#c9ccc8' : C.cloud; blobAt(c, pw * 0.56, h * 0.45, Math.max(3, h * 0.6), col, R); }
}
