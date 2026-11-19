// Painted UI pictures for look A, POSTER PAINT (looks/src/kid-a.js, "UI: kid's table"). Owner: UI.
// paintUI() paints every HTML piece's picture once at boot with the paint.js brushes, hands them to CSS as custom
// properties on :root and sets <html data-ui="paint">. index.html uses them only under html[data-ui=paint], so with
// ?debug (no paint) or a paint error the plain CSS stays.
//   --img-<name>  url(blob:...)                                          a plain picture (tile, tab, card, icon, digit)
//   --bi-<name>   url(...) <slices> fill / <widths> / <outset> <repeat>   a 9-slice border-image for blobs that stretch
// Sizes are CSS px; every picture is painted at K device px per CSS px. The fixed sizes in SIZE must match index.html's
// tokens (--tab-w/h, --tabs-h, --card-w/h, --round). The tab strip is a 9-slice (--bi-tabbar) that stretches to any
// width: toolbar.js sizes it for the tab count (13 at step 6; two rows on desktop).
import { C, TAU, rng, hash, tone, canvas, brush, ring, poly, shift, path, fill, outline, dab, grainTile, grainFill } from './paint.js';
import { COLORS as MAKER_COLORS } from '../../sim/maker/catalog.js'; // STEP8 UI: the maker's 12 colour swatches (pure data)

export const SIZE = { tab: [64, 40], tabs: [152, 52], tabs2: [152, 92], card: [56, 51], round: [38, 38] }; // tabs2 = two rows: --tabs-h + --tab-h
// tab blob colours, in tab order (kid-a: army yellow, animals orange, mythical purple, terrain green). OURS, Part 2
// step 4: dinos red, siege stone grey (step 6: lighter, cooler: C.greyL read muddy on the kraft), pirates sea blue.
// Step 6: robots teal, space pink, ocean deep blue, sports white (the ball), bugs lime, bosses ink black with a gold
// crown (the one dark tab: one boss each). 'blank' = a tab whose picture isn't painted yet (no icon).
// Step 7: secret = night navy with a yellow question mark (the mystery tab).
const TAB_COL = {
  army: C.yellow, animals: C.orange, mythical: C.purple, dinos: C.red, siege: '#ccd3dc', pirates: C.sky,
  robots: '#1db5a6', space: '#f45aa9', ocean: '#2c6ce0', sports: C.cloud, bugs: '#acd632', bosses: '#2a2421',
  secret: '#24306e', terrain: C.g1, blank: C.paperD,
  mine: C.white, // STEP8 UI: Mine = the units you made: a white blob splashed with every paint colour, an ink brush on it
};
const ICON_COL = { bosses: C.yellow, secret: C.yellow }; // the icon's paint where ink wouldn't show
const K = typeof devicePixelRatio === 'number' ? Math.max(2, Math.min(3, Math.ceil(devicePixelRatio))) : 2;
const SHADOW = '#6e4d2b'; // the brown shadow under a picked tab (kid-a)

// ---------- shapes ----------
/** A wobbly stadium (pill) as a point ring: round caps, flat sides with a point every ~14 px. */
function stadium(x, y, w, h, R, j = 0.7) {
  const r = h / 2, pts = [], cap = 7, flat = Math.max(1, Math.round((w - h) / 14));
  for (let i = 0; i <= cap; i++) { const a = -Math.PI / 2 + i / cap * Math.PI; pts.push([x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]); }
  for (let i = 1; i < flat; i++) pts.push([x + w - r - (w - h) * i / flat, y + h]);
  for (let i = 0; i <= cap; i++) { const a = Math.PI / 2 + i / cap * Math.PI; pts.push([x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]); }
  for (let i = 1; i < flat; i++) pts.push([x + r + (w - h) * i / flat, y]);
  return pts.map(([px, py]) => [px + (R() - 0.5) * 2 * j, py + (R() - 0.5) * 2 * j]);
}
/** A wobbly rounded rectangle: 4 corner arcs + a point every ~16 px along the sides. */
function rrect(x, y, w, h, r, R, j = 0.6) {
  const pts = [], arc = 4;
  const side = (x0, y0, x1, y1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16)); for (let i = 1; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); };
  const corner = (cx, cy, a0) => { for (let i = 0; i <= arc; i++) { const a = a0 + i / arc * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x + w - r, y + r, -Math.PI / 2); side(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0); side(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2); side(x, y + h - r, x, y + r);
  corner(x + r, y + r, Math.PI); side(x + r, y, x + w - r, y);
  return pts.map(([px, py]) => [px + (R() - 0.5) * 2 * j, py + (R() - 0.5) * 2 * j]);
}
/** A blob of paint: fill misses its outline a little (kid-a buttons and chips). o.ang 0 = level strokes, for 9-slices that stretch. */
function blob(c, pts, col, R, lw = 2.2, o = {}) {
  if (o.shadow) fill(c, shift(pts, o.shadow[0], o.shadow[1], 0), o.shadowCol || C.ink, R, { edge: 0, vary: 0.02 });
  fill(c, shift(pts, 1.4, 1.2, 0.5), col, R, { sp: 1.3, vary: o.vary ?? 0.05, ang: o.ang });
  if (lw) outline(c, pts, R, lw, { bristles: 4 });
}
/** Old paint drops on the kraft card (kid-a toolbar), kept inside the box so a tile repeats cleanly. */
function drops(c, R, x, y, w, h, n) {
  const cols = [C.red, C.blue, C.yellow, C.g1, '#ffffff', C.purple, C.orange];
  for (let i = 0; i < n; i++) {
    const col = cols[i % cols.length], px = x + R() * w, py = y + R() * h;
    dab(c, px, py, 0.8 + R() * 2.2, col, R);
    if (R() < 0.4) dab(c, px + (R() - 0.5) * 9, py + (R() - 0.5) * 7, 0.6 + R() * 0.8, col, R);
  }
}
/** Masking tape strip (kid-a tape): zigzag torn ends, a soft shadow, a few fibres. */
function tape(c, x, y, w, h, ang, R) {
  c.save(); c.translate(x, y); c.rotate(ang);
  const zig = n => { const out = []; for (let i = 0; i <= n; i++) out.push([(i % 2 ? 1.3 : -0.2) + (R() - 0.5) * 0.6, -h / 2 + i / n * h]); return out; };
  const pts = [...zig(6).map(([dx, dy]) => [-w / 2 + dx, dy]), ...zig(6).reverse().map(([dx, dy]) => [w / 2 - dx, dy])];
  c.fillStyle = 'rgba(80,55,20,0.18)'; c.save(); c.translate(0.8, 1.2); path(c, pts); c.fill(); c.restore();
  c.fillStyle = 'rgba(239,225,179,0.92)'; path(c, pts); c.fill();
  c.strokeStyle = 'rgba(200,180,120,0.5)'; c.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) { const yy = -h / 2 + 1.5 + R() * (h - 3); c.beginPath(); c.moveTo(-w / 2 + 1, yy); c.lineTo(w / 2 - 1, yy + (R() - 0.5)); c.stroke(); }
  c.restore();
}

// ---------- painted icons (24 x 24 box, kid-a icon()) ----------
// bg = the paint under the icon (a tab's blob colour), used for holes cut in an ink shape (door, mouth)
function icon(c, key, x, y, s, col, R, bg = C.cloud) {
  c.save(); c.translate(x - 12 * s, y - 12 * s); c.scale(s, s);
  const st = (pts, w) => brush(c, pts, w, col, R, { bristles: 3, taper: 0.25, dry: 0.15, vary: 0.06 });
  const fl = pts => { fill(c, pts, col, R, { sharp: true, vary: 0.08, edge: 0 }); outline(c, pts, R, 1.6, { col, jit: 0.3 }); };
  switch (key) {
    case 'pause': st([[8.6, 5.4], [9, 18.6]], 4); st([[15.2, 5.6], [15, 18.6]], 4); break;
    case 'play': fl([[7.6, 5.2], [19.2, 12], [7.8, 18.8]]); break;
    case 'sound': fl([[3.6, 9.2], [8, 9.4], [12.6, 5.2], [12.8, 18.8], [8, 14.6], [3.6, 14.8]]); st([[15.6, 8.8], [17.2, 12], [15.6, 15.2]], 2); st([[18.2, 6.2], [21, 12], [18.2, 17.8]], 2); break;
    case 'mute': fl([[3.6, 9.2], [8, 9.4], [12.6, 5.2], [12.8, 18.8], [8, 14.6], [3.6, 14.8]]); st([[15.4, 8.8], [21, 15.2]], 2.4); st([[21, 8.8], [15.4, 15.2]], 2.4); break;
    case 'clear': st([[4.6, 7], [19.4, 7.2]], 2.6); st([[9.6, 6.6], [10.2, 4.2], [13.8, 4.2], [14.4, 6.6]], 1.8); outline(c, [[6.6, 8.6], [17.4, 8.6], [16.2, 20.2], [7.8, 20.2]], R, 2.2, { col }); st([[10.4, 11], [10.8, 17.4]], 1.6); st([[13.6, 11], [13.2, 17.4]], 1.6); break;
    case 'teams': // two crossed swords
      st([[4.2, 4.2], [15.2, 15.2]], 2.4); st([[12.6, 17.6], [17.6, 12.6]], 2.2); st([[15.4, 15.4], [19.8, 19.8]], 3);
      st([[19.8, 4.2], [8.8, 15.2]], 2.4); st([[6.4, 12.6], [11.4, 17.6]], 2.2); st([[8.6, 15.4], [4.2, 19.8]], 3); break;
    case 'close': st([[6, 6], [18, 18.2]], 3); st([[18.2, 6], [6, 18]], 3); break;
    case 'slow': // a snail: shell spiral, body along the ground, two eye stalks
      outline(c, ring(10.4, 12.2, 6.2, 5.8, R, 0.06, 10), R, 2.2, { col }); st([[10.6, 12.4], [12.6, 11.6], [12.2, 9.4], [9.8, 9.4], [8.4, 11.8], [9.6, 14.6], [12.8, 14.8]], 1.6);
      st([[3.4, 18.4], [13, 18.6], [19.4, 18.2], [21.2, 15.6]], 2.6); st([[19.8, 15.4], [19.6, 9.6]], 1.6); st([[21, 15.6], [22.4, 10.4]], 1.6); break;
    case 'follow': // an eye
      outline(c, [[2.6, 12], [7, 7.6], [12, 6.2], [17, 7.6], [21.4, 12], [17, 16.4], [12, 17.8], [7, 16.4]], R, 2.2, { col }); fill(c, ring(12, 12, 3.2, 3.2, R, 0.05, 9), col, R, { edge: 0 }); break;
    case 'army': fl([[3.6, 15.4], [4.8, 9], [8.6, 5.6], [15, 5.4], [19.2, 8.6], [20.4, 15.4]]); st([[1.6, 16.8], [12, 16.4], [22.4, 16.8]], 3); break;
    case 'animals': fl(ring(12, 15.2, 4.9, 3.9, R, 0.05, 9)); for (const [px, py, a] of [[5.8, 9.6, -0.3], [9.8, 6.6, -0.1], [14.2, 6.6, 0.1], [18.2, 9.6, 0.3]]) fill(c, ring(px, py, 2, 2.5, R, 0.05, 7, a), col, R, { edge: 0 }); break;
    case 'mythical': fl([[12, 2.6], [14.4, 8.8], [21, 9.1], [15.8, 13.3], [17.7, 20], [12, 16.2], [6.3, 20], [8.2, 13.3], [3, 9.1], [9.6, 8.8]]); break;
    case 'terrain': fl([[1.4, 19.4], [8.4, 6.6], [12, 12.2], [15.2, 8.6], [22.6, 19.4]]); break;
    case 'dinos': // a T-rex head looking right, jaws open, white teeth and eye
      fl([[4.4, 21.8], [3, 15.6], [4, 10.4], [7.4, 6.6], [13.4, 5.2], [19.2, 6], [22.4, 8.4], [22, 11.6], [11.8, 12.6], [20, 14.2], [19.8, 16.8], [12.8, 17.8], [10.8, 21.8]]);
      for (const tx of [14.6, 17.6, 20.4]) fill(c, poly([[tx - 1.1, 11.9], [tx + 1.1, 11.7], [tx + 0.1, 14]], R, 0.15), C.white, R, { sharp: true, edge: 0 });
      dab(c, 12.6, 8.8, 1.9, C.white, R); dab(c, 13.1, 8.9, 0.85, col, R);
      break;
    case 'siege': // a castle tower: three battlements, an arched door, an arrow slit
      fl([[5.4, 21.8], [6.4, 9.4], [4.4, 8.6], [4.4, 3], [8.4, 3], [8.4, 5.8], [10.1, 5.8], [10.1, 3], [13.9, 3], [13.9, 5.8], [15.6, 5.8], [15.6, 3], [19.6, 3], [19.6, 8.6], [17.6, 9.4], [18.6, 21.8]]);
      fill(c, poly([[10, 22], [10, 17.4], [11, 15.6], [13, 15.6], [14, 17.4], [14, 22]], R, 0.2), bg, R, { edge: 0, vary: 0.04 });
      brush(c, [[12, 10], [12.1, 12.8]], 1.5, bg, R, { bristles: 2, taper: 0.1, dry: 0, vary: 0.03, swell: 0 });
      break;
    case 'pirates': // a pirate hat with a white skull and crossbones
      fl([[1.2, 11], [3.6, 12.6], [6.6, 12.4], [7.2, 8.2], [9.4, 5.4], [12, 4.4], [14.6, 5.4], [16.8, 8.2], [17.4, 12.4], [20.4, 12.6], [22.8, 11], [21.8, 14.8], [17.8, 17.2], [12, 18.4], [6.2, 17.2], [2.2, 14.8]]);
      for (const [a, b] of [[[8.6, 13.4], [15.4, 16.6]], [[15.4, 13.4], [8.6, 16.6]]]) brush(c, [a, b], 1.5, C.white, R, { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 });
      fill(c, ring(12, 9.3, 2.9, 2.6, R, 0.05, 9), C.white, R, { edge: 0, vary: 0.02 });
      fill(c, poly([[10.6, 10.6], [13.4, 10.6], [13.1, 12.8], [10.9, 12.8]], R, 0.1), C.white, R, { sharp: true, edge: 0, vary: 0.02 });
      dab(c, 10.9, 9.4, 0.85, col, R); dab(c, 13.1, 9.4, 0.85, col, R);
      break;
    // ---- Part 2 step 6 (OURS) ----
    case 'robots': // a robot head: antenna ball, square head with bolts, round eyes, grille mouth
      st([[12, 7], [12.1, 4.2]], 1.6); dab(c, 12.1, 3.2, 1.9, col, R);
      fl([[5.6, 6.6], [18.4, 6.4], [19.6, 7.8], [19.8, 18.4], [18.4, 19.8], [5.6, 19.8], [4.3, 18.4], [4.4, 7.8]]);
      fl([[1.8, 10.8], [4.6, 10.6], [4.6, 15.6], [1.8, 15.4]]); fl([[19.4, 10.6], [22.2, 10.8], [22.2, 15.4], [19.4, 15.6]]);
      for (const ex of [8.8, 15.2]) { dab(c, ex, 11.2, 2.3, bg, R); dab(c, ex + 0.4, 11.4, 0.9, col, R); }
      fill(c, poly([[7.4, 15], [16.6, 15], [16.5, 17.6], [7.5, 17.6]], R, 0.15), bg, R, { sharp: true, edge: 0, vary: 0.03 });
      for (const gx of [10.4, 13.6]) brush(c, [[gx, 14.8], [gx, 17.8]], 1.1, col, R, { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 });
      break;
    case 'space': // a flying saucer: glass dome with a shine, wide disc with lights, two little legs
      fl([[6.8, 12], [7.4, 8.6], [9.4, 6.2], [12, 5.4], [14.6, 6.2], [16.6, 8.6], [17.2, 12]]);
      brush(c, [[9.2, 10.4], [9.8, 8.2], [11.4, 7.2]], 1.2, bg, R, { bristles: 2, taper: 0.2, dry: 0, vary: 0.03, swell: 0 });
      fl(ring(12, 13.4, 10.8, 3.5, R, 0.03, 12));
      for (const lx of [5.6, 9.8, 14.2, 18.4]) dab(c, lx, lx < 7 || lx > 17 ? 13.4 : 14.1, 1.05, bg, R);
      st([[8.4, 16.4], [6.6, 20.2]], 1.6); st([[15.6, 16.4], [17.4, 20.2]], 1.6);
      break;
    case 'ocean': // a shark fin cutting through a wave
      fl([[4, 15.4], [7.4, 11.8], [10.6, 7.8], [13.6, 4.8], [16.9, 2.6], [16.1, 6.2], [16.1, 9.6], [17, 12.6], [19.2, 15.4]]);
      st([[1.2, 19.4], [3.6, 18], [6, 19.4], [8.4, 20.8], [10.8, 19.4], [13.2, 18], [15.6, 19.4], [18, 20.8], [20.4, 19.4], [22.8, 18.2]], 2.3);
      break;
    case 'sports': { // a football: a middle patch, lines out to the patches cut by the rim, an ink ring
      const P = (cx, cy, r, a0) => Array.from({ length: 5 }, (_, i) => [cx + Math.cos(a0 + i * TAU / 5) * r, cy + Math.sin(a0 + i * TAU / 5) * r]);
      const rim = ring(12, 12, 9.4, 9.2, R, 0.025, 12), solid = { sharp: true, edge: 0, vary: 0.04 }, line = { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 };
      c.save(); path(c, rim); c.clip();
      fill(c, poly(P(12, 12, 3.9, -Math.PI / 2), R, 0.12), col, R, solid);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5, ca = Math.cos(a), sa = Math.sin(a);
        fill(c, poly(P(12 + ca * 10.2, 12 + sa * 10.2, 3.7, a + Math.PI), R, 0.12), col, R, solid);
        brush(c, [[12 + ca * 3.6, 12 + sa * 3.6], [12 + ca * 6.8, 12 + sa * 6.8]], 1.2, col, R, line);
      }
      c.restore();
      outline(c, rim, R, 2.1, { col });
      break;
    }
    case 'bugs': // a beetle from above: head, antennae, six legs, a split back with spots
      for (const sx of [-1, 1]) {
        st([[12 + sx * 1.4, 4], [12 + sx * 3.6, 1.6]], 1.3);
        st([[12 + sx * 5, 10.6], [12 + sx * 8.6, 8.6]], 1.5); st([[12 + sx * 5.8, 14.2], [12 + sx * 9.6, 14.4]], 1.5); st([[12 + sx * 5, 18.2], [12 + sx * 8.4, 20.8]], 1.5);
      }
      fill(c, ring(12, 5.6, 3, 2.7, R, 0.05, 9), col, R, { edge: 0 });
      fl(ring(12, 14.2, 6.5, 7.4, R, 0.04, 11));
      brush(c, [[12, 7.6], [12.05, 21.2]], 1.1, bg, R, { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 });
      for (const [dx, dy] of [[-3, 11.8], [3, 11.8], [-3.2, 16.6], [3.2, 16.6]]) dab(c, 12 + dx, dy, 1.25, bg, R);
      break;
    // ---- Part 2 step 7 (OURS) ----
    case 'secret': // a fat painted question mark
      st([[7.4, 8.4], [8.2, 5.4], [11.6, 3.4], [15.4, 4.4], [16.8, 7.6], [15.4, 10.4], [12.6, 12.2], [12, 15.2]], 3.4);
      dab(c, 12.1, 19.6, 2.3, col, R);
      break;
    case 'maps': { // a folded kid map: green land, blue sea, a red dotted path to a red X
      const L = [[2.4, 6.4], [8.6, 4.2], [8.6, 17.8], [2.4, 20]], M = [[8.6, 4.2], [15.4, 6.4], [15.4, 20], [8.6, 17.8]], Q = [[15.4, 6.4], [21.6, 4.2], [21.6, 17.8], [15.4, 20]];
      const solid = { sharp: true, edge: 0, vary: 0.05 }, thin = { bristles: 2, taper: 0.1, dry: 0, vary: 0.03, swell: 0 };
      fill(c, poly(L, R, 0.15), C.g3, R, solid); fill(c, poly(M, R, 0.15), C.sky2, R, solid); fill(c, poly(Q, R, 0.15), C.g3, R, solid);
      for (const [px, py] of [[4.6, 16.6], [6.6, 14.2], [9.4, 13.8], [11.8, 12.8], [13.2, 10.8], [15.2, 10.2]]) dab(c, px, py, 0.8, C.red, R);
      brush(c, [[16.6, 7.6], [19.8, 11]], 1.9, C.red, R, thin); brush(c, [[19.8, 7.6], [16.6, 11]], 1.9, C.red, R, thin);
      outline(c, [[2.4, 6.4], [8.6, 4.2], [15.4, 6.4], [21.6, 4.2], [21.6, 17.8], [15.4, 20], [8.6, 17.8], [2.4, 20]], R, 1.9, { col });
      brush(c, [[8.6, 4.6], [8.6, 17.4]], 1.2, col, R, thin); brush(c, [[15.4, 6.8], [15.4, 19.6]], 1.2, col, R, thin);
      break;
    }
    // ---- Part 2 step 8 (OURS): the Mine tab + the unit maker ----
    case 'mine': { // a fat paintbrush, handle bottom left, a loaded tip top right with a red drop
      st([[4.2, 20.4], [11, 13.4]], 3.4);
      fill(c, poly([[10.2, 11.6], [12.6, 9.4], [15.4, 12.2], [13.2, 14.6]], R, 0.15), col, R, { sharp: true, edge: 0, vary: 0.04 });
      fl([[12.8, 9], [16.4, 4.6], [20.6, 2.6], [19.6, 6.8], [15.8, 12.6]]);
      dab(c, 20.4, 7.4, 1.6, C.red, R); dab(c, 19.2, 3.8, 1.1, C.blue, R);
      break;
    }
    case 'plus': st([[12, 4.2], [12.1, 19.8]], 4.4); st([[4.2, 12], [19.8, 12.1]], 4.4); break;
    case 'edit': // a pencil, point down left
      fl([[16.2, 3.2], [20.8, 7.8], [9.4, 19.2], [4.8, 14.6]]);
      fill(c, poly([[4.8, 14.6], [9.4, 19.2], [3.4, 20.6]], R, 0.15), C.paperD, R, { sharp: true, edge: 0, vary: 0.03 });
      dab(c, 4.2, 19.8, 1.2, col, R);
      brush(c, [[14.6, 4.8], [19.2, 9.4]], 1.3, bg, R, { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 });
      break;
    case 'heart': fl([[12, 20.6], [4.2, 13], [3, 8.2], [5.4, 4.6], [9.2, 4.4], [12, 7.4], [14.8, 4.4], [18.6, 4.6], [21, 8.2], [19.8, 13]]); break;
    case 'speed': // a fat lightning bolt
      fl([[14.6, 2.4], [5.6, 13.4], [11.4, 13.6], [8.8, 21.6], [18.6, 9.8], [12.8, 9.8]]); break;
    case 'none': // an empty slot: a ring with a slash
      outline(c, ring(12, 12, 7.6, 7.6, R, 0.04, 11), R, 2.4, { col }); st([[6.8, 17.2], [17.2, 6.8]], 2.4); break;
    // ---- Part 2 step 9 (OURS, STEP9 UI): the campaign ----
    case 'campaign': // a red flag on a pole with a yellow star on it
      st([[6.2, 21.4], [6, 3]], 2.4);
      fill(c, poly([[6.8, 3.8], [12, 2.6], [16.4, 4.6], [21.2, 3.4], [20.6, 12.6], [16, 13.8], [11.6, 11.8], [6.8, 13]], R, 0.25), C.red, R, { sharp: true, vary: 0.08, edge: 0 });
      outline(c, [[6.8, 3.8], [12, 2.6], [16.4, 4.6], [21.2, 3.4], [20.6, 12.6], [16, 13.8], [11.6, 11.8], [6.8, 13]], R, 1.6, { col });
      fill(c, poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.5 : 3.4; return [13.8 + Math.cos(a) * r, 8.2 + Math.sin(a) * r]; }), R, 0.1), C.yellow, R, { sharp: true, edge: 0, vary: 0.03 });
      break;
    case 'leave': // out of the door: a door frame, a fat arrow going out
      st([[13.4, 4], [5.4, 4.2], [5.6, 20], [13.4, 20]], 2.2);
      st([[9.6, 12], [20.4, 12.1]], 2.8); st([[16.4, 7.8], [20.8, 12], [16.4, 16.2]], 2.8);
      break;
    case 'back': st([[15.6, 4.8], [8.2, 12], [15.6, 19.2]], 3.4); break; // a fat arrow back
    // ---- Part 2 step 10 (OURS, STEP10 LEAD): share codes ----
    case 'share': // three paint dabs (red, blue, yellow) joined by ink strokes: pass it on
      st([[8.4, 10.8], [15.4, 6.8]], 2.1); st([[8.4, 13.2], [15.4, 17.2]], 2.1);
      for (const [px, py, cl] of [[17.6, 5.6, C.red], [6.2, 12, C.blue], [17.6, 18.4, C.yellow]]) { const rr = ring(px, py, 3.2, 3.1, R, 0.06, 9); fill(c, rr, cl, R, { edge: 0 }); outline(c, rr, R, 1.4, { col }); }
      break;
    case 'bosses': // a gold crown: three points with balls, a band with a red jewel
      fl([[4.2, 19.2], [3.2, 8.2], [8.2, 12.4], [12, 4.8], [15.8, 12.4], [20.8, 8.2], [19.8, 19.2]]);
      for (const [bx, by] of [[3.1, 6.9], [12, 3.6], [20.9, 6.9]]) dab(c, bx, by, 1.8, col, R);
      brush(c, [[4.6, 15.4], [19.4, 15.4]], 1, bg, R, { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 });
      dab(c, 12, 17.4, 1.35, C.red, R);
      break;
  }
  c.restore();
}

// ---------- painted digits (kid-a DIG: strokes in a 6 x 10 box) ----------
const DIG = {
  0: [[[3, 0.2], [0.6, 2.4], [0.5, 7.6], [3, 9.8], [5.6, 7.6], [5.6, 2.2], [2.6, 0.3]]], 1: [[[1.2, 2.4], [3.4, 0.3], [3.3, 10]]],
  2: [[[0.6, 2.6], [2.2, 0.4], [4.9, 0.9], [5.3, 3.4], [2.8, 6.6], [0.4, 9.8], [6, 9.6]]],
  3: [[[0.6, 1.2], [3.4, 0.2], [5.4, 2.2], [2.6, 4.7], [5.6, 7], [3.6, 9.8], [0.4, 8.8]]], 4: [[[4.4, 10], [4.4, 0.4], [0.3, 7], [6, 7]]],
  5: [[[5.6, 0.4], [1.2, 0.5], [0.8, 4.4], [3.6, 3.7], [5.8, 6.4], [3.6, 9.8], [0.4, 8.8]]],
  6: [[[5, 0.6], [1.8, 2.2], [0.6, 7], [2.4, 9.8], [5.2, 8.6], [5.2, 5.8], [2.6, 4.8], [0.8, 6.6]]], 7: [[[0.3, 0.6], [6, 0.6], [2.4, 10]]],
  8: [[[3, 4.8], [0.9, 2.6], [3, 0.2], [5.1, 2.6], [3, 4.8], [0.6, 7.4], [3, 9.8], [5.4, 7.4], [3, 4.8]]],
  9: [[[5.2, 3.8], [3, 5.4], [0.8, 3.4], [2.6, 0.3], [5.2, 1.6], [5, 7], [3, 9.8], [1, 9]]],
};
function digit(c, ch, x, y, h, col, R, w) {
  const s = h / 10;
  for (const st of DIG[ch]) brush(c, st.map(([px, py]) => [x + px * s + (R() - 0.5) * 0.5, y + py * s + (R() - 0.5) * 0.5]), w, col, R, { bristles: 4, taper: 0.3, dry: 0.25, vary: 0.06 });
}

// ---------- the pieces ----------
function make(w, h, fn, seed) {
  const cv = canvas(w * K, h * K), c = cv.getContext('2d');
  c.setTransform(K, 0, 0, K, 0, 0);
  fn(c, rng(seed), w, h);
  return cv;
}

function paintAll() {
  const out = []; // [css var, canvas, url -> value]
  const img = (name, w, h, fn) => out.push([`--img-${name}`, make(w, h, fn, hash('ui|' + name)), u => `url("${u}")`]);
  // sl = [top, right, bottom, left] CSS px; the slices keep the corners, the rest stretches (or rounds)
  const nine = (name, w, h, sl, fn, { rep = 'stretch', outset = 0 } = {}) =>
    out.push([`--bi-${name}`, make(w, h, fn, hash('ui|' + name)), u => `url("${u}") ${sl.map(v => v * K).join(' ')} fill / ${sl.map(v => v + 'px').join(' ')} / ${outset}px ${rep}`]);

  // tiles: kraft table card, cartridge paper (grainTile is periodic, so these repeat cleanly)
  img('kraft', 300, 200, (c, R, w, h) => { grainFill(c, grainTile(C.kraft, tone(C.kraft, 0.1), C.kraftD, 32, 160, 0.22, 0.2), 0, 0, w, h, K); drops(c, R, 8, 8, w - 16, h - 16, 11); });
  img('paper', 200, 200, (c, R, w, h) => grainFill(c, grainTile(C.paper, C.paperL, tone(C.paper, -0.05), 33, 160, 0.1, 0.15), 0, 0, w, h, K));

  // torn cream paper lip along the top of the kraft card, with the dark rim under it (repeat-x)
  img('lip', 240, 6, (c, R, w) => {
    c.fillStyle = C.kraftD; c.fillRect(0, 0, w, 5);
    const ys = []; for (let x = 0; x <= w; x += 6) ys.push(1.6 + R() * 2.6); ys[ys.length - 1] = ys[0];
    c.fillStyle = C.paper; c.beginPath(); c.moveTo(0, -1); ys.forEach((y, i) => c.lineTo(i * 6, y)); c.lineTo(w, -1); c.closePath(); c.fill();
  });
  img('tape-l', 60, 50, (c, R) => tape(c, 30, 25, 50, 17, -0.62, R));
  img('tape-r', 60, 50, (c, R) => tape(c, 30, 25, 50, 17, 0.62, R));

  // the tab strip: the kraft card rising up behind the tabs, torn lip along its top and sides. A 9-slice: the corners
  // stay, the middle (torn lip on top, kraft under it) repeats sideways, so the strip fits any number of tabs. The lip's
  // tear points sit every 6 px on a period that is the middle slice's width, so the repeats join up.
  // tabbar2 = the same card two rows of tabs tall (toolbar.js .tabs-2), painted at that height so the kraft and drops
  // aren't stretched.
  const TB = 16;
  for (const [name, size] of [['tabbar', SIZE.tabs], ['tabbar2', SIZE.tabs2]]) nine(name, ...size, [TB, TB, 0, TB], (c, R, w, h) => {
    const mid = w - 2 * TB, steps = Math.round(mid / 6);
    const edge = (d, jag) => { // the card's shape inset by d, torn by jag; runs out of the bottom edge
      const r = 12 - d * 0.5, top = Array.from({ length: steps }, () => d + R() * jag), pts = [[d + R() * jag, h + 2]];
      for (let y = h - 6; y > r + d; y -= 6) pts.push([d + R() * jag, y]);
      for (let i = 0; i <= 4; i++) { const a = Math.PI + i / 4 * Math.PI / 2; pts.push([d + r + Math.cos(a) * r + R() * jag * 0.5, d + r + Math.sin(a) * r + R() * jag * 0.5]); }
      for (let k = 0; k <= steps; k++) pts.push([TB + k * mid / steps, top[k % steps]]);
      for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; pts.push([w - d - r + Math.cos(a) * r - R() * jag * 0.5, d + r + Math.sin(a) * r + R() * jag * 0.5]); }
      for (let y = r + d + 6; y < h - 6; y += 6) pts.push([w - d - R() * jag, y]);
      pts.push([w - d - R() * jag, h + 2]);
      return pts;
    };
    path(c, edge(0, 0.8)); c.fillStyle = C.paper; c.fill();
    path(c, edge(1.6, 2.6)); c.fillStyle = C.kraftD; c.fill();
    c.save(); path(c, edge(3.2, 1.4)); c.clip();
    grainFill(c, grainTile(C.kraft, tone(C.kraft, 0.1), C.kraftD, 32, 160, 0.22, 0.2), 0, 0, w, h, K);
    drops(c, R, 4, 14, 8, h - 20, 1); drops(c, R, TB + 8, 14, mid - 16, h - 20, 2); drops(c, R, w - 12, 14, 8, h - 20, 1);
    c.restore();
  }, { rep: 'round stretch' });

  // tabs: blobs of paint with painted icons; the picked one is fat, outlined and sits up (kid-a)
  // STEP8 UI: the Mine blob = white splashed with the maker's paints (your colours), painted inside its outline
  const splash = (c, R, pts) => {
    c.save(); path(c, pts); c.clip();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cols = [C.red, C.orange, C.yellow, '#9ac21f', '#0f9c8c', C.blue, C.purple, '#e85a7a'];
    cols.forEach((col, i) => { const k = (i + 0.5) / cols.length; dab(c, x0 + k * (x1 - x0) + (R() - 0.5) * 4, (i % 2 ? y1 - 3 : y0 + 3) + (R() - 0.5) * 3, 4.2 + R() * 1.6, col, R); });
    c.restore();
  };
  for (const [key, col] of Object.entries(TAB_COL)) {
    img(`tab-${key}`, ...SIZE.tab, (c, R) => {
      const pts = stadium(7, 8, 50, 25, R, 0.6);
      fill(c, pts, col, R, { sp: 1.4, vary: 0.1 });
      if (key === 'mine') splash(c, R, pts);
      icon(c, key, 32, 20.5, 0.78, ICON_COL[key] || C.ink, R, col);
    });
    img(`tab-${key}-on`, ...SIZE.tab, (c, R) => {
      const pts = stadium(3, 2, 57, 33, R, 0.6);
      fill(c, shift(pts, 1.8, 2.6, 0), SHADOW, R, { edge: 0, vary: 0.02 });
      fill(c, shift(pts, 1.4, 1.2, 0.6), col, R, { sp: 1.4, vary: 0.1 });
      if (key === 'mine') splash(c, R, shift(pts, 1.4, 1.2, 0.6));
      outline(c, pts, R, 2.4, { bristles: 4 });
      icon(c, key, 31.5, 18.5, 1, ICON_COL[key] || C.ink, R, col);
    });
  }

  // tool cards: paper squares taped down a little crooked; the picked one is yellow with a fat ink outline (kid-a)
  const card = (sel) => (c, R, w, h) => {
    const hw = w / 2 - 5, hh = h / 2 - 5.5, ang = (R() - 0.5) * 0.09;
    c.save(); c.translate(w / 2, h / 2 + 1.5); c.rotate(ang);
    const pts = poly([[-hw, -hh], [0, -hh - 0.6], [hw, -hh], [hw + 0.5, 0], [hw, hh], [0, hh + 0.4], [-hw, hh], [-hw - 0.4, 0]], R, 0.5);
    c.fillStyle = 'rgba(70,45,15,0.32)'; c.save(); c.translate(1.6, 2.4); path(c, pts); c.fill(); c.restore();
    fill(c, pts, sel ? C.yellow : C.card, R, { sharp: true, sp: 1.5, vary: sel ? 0.06 : 0.025, edge: 0 });
    if (sel) outline(c, pts, R, 2.6, { bristles: 4, jit: 0.6 });
    tape(c, (R() - 0.5) * 8, -hh + 0.5, 24, 9, (R() - 0.5) * 0.4, R);
    c.restore();
  };
  for (let i = 0; i < 4; i++) img(`card-${i}`, ...SIZE.card, card(false));
  for (let i = 0; i < 2; i++) img(`card-on-${i}`, ...SIZE.card, card(true));

  // round buttons: white painted blobs with brush outlines; Team battle on = yellow (the "picked" paint)
  const round = col => (c, R, w, h) => blob(c, ring(w / 2 - 0.6, h / 2 - 0.6, w / 2 - 3, h / 2 - 3, R, 0.05, 10), col, R, 2.2, { vary: 0.04 });
  img('round', ...SIZE.round, round(C.cloud));
  img('round-on', ...SIZE.round, round(C.yellow));
  for (const [key, col] of [['clear', C.red], ['pause', C.ink], ['play', C.ink], ['sound', C.ink], ['mute', C.ink], ['teams', C.ink], ['close', C.ink], ['slow', C.ink], ['follow', C.ink], ['maps', C.ink]])
    img(`ico-${key}`, 24, 24, (c, R) => icon(c, key, 12, 12, 1, col, R));

  // stretchy blobs (9-slice): pills, the count cloud, big buttons, panel outline
  // 9-slice blobs paint level strokes (ang 0), so the stretched middle carries on the corners' strokes without a seam
  const pill = (col, lw = 2.2) => (c, R, w, h) => blob(c, stadium(3, 3, w - 8, h - 8, R, 0.6), col, R, lw, { ang: 0 });
  nine('pill', 100, 40, [18, 26, 20, 24], pill(C.cloud), { outset: 1 });
  nine('pill-ink', 100, 40, [18, 26, 20, 24], pill(tone(C.ink, 0.08)), { outset: 1 });
  nine('pill-red', 100, 40, [18, 26, 20, 24], pill(C.red), { outset: 1 });
  nine('pill-blue', 100, 40, [18, 26, 20, 24], pill(C.blue), { outset: 1 });
  nine('pill-yellow', 100, 40, [18, 26, 20, 24], pill(C.yellow, 1.8), { outset: 1 });
  nine('chip', 120, 90, [22, 22, 24, 22], (c, R, w, h) => blob(c, rrect(3, 3, w - 8, h - 8, 15, R, 0.6), C.cloud, R, 2.2, { ang: 0 }), { outset: 1 });
  const big = col => (c, R, w, h) => blob(c, stadium(4, 3, w - 9, h - 12, R, 0.7), col, R, 2.6, { shadow: [0, 4], ang: 0 });
  nine('big-red', 180, 60, [24, 30, 30, 30], big(C.red));
  nine('big-white', 180, 60, [24, 30, 30, 30], big(C.cloud));
  // report panels: card paper (or the winner's team paint) inside a wobbly ink box
  const panel = (col, vary) => (c, R, w, h) => { const pts = rrect(2.5, 2.5, w - 5, h - 5, 11, R, 0.5); fill(c, shift(pts, 0.8, 0.8, 0.3), col, R, { sp: 1.6, vary, edge: 0, ang: 0 }); outline(c, pts, R, 2, { bristles: 3 }); };
  nine('panel', 100, 100, [18, 18, 18, 18], panel(C.card, 0.02));
  nine('panel-red', 100, 100, [18, 18, 18, 18], panel(C.red, 0.08));
  nine('panel-blue', 100, 100, [18, 18, 18, 18], panel(C.blue, 0.08));

  // painted digits 0-9 for the count chip
  for (let d = 0; d <= 9; d++) img(`d${d}`, 14, 22, (c, R) => digit(c, String(d), 2.2, 3, 16, C.ink, R, 2.6));

  // midline: white painted dashes with an ink edge, so they read on grass and on paper (repeat-y)
  img('dash', 10, 34, (c, R) => {
    brush(c, [[5, 5], [5.2, 15], [5, 25]], 7, C.ink, R, { bristles: 5, taper: 0.15, dry: 0.05, vary: 0.04, swell: 0 });
    brush(c, [[5, 6.2], [5.1, 15], [5, 23.8]], 5, C.white, R, { bristles: 5, taper: 0.15, dry: 0.12, vary: 0.03, swell: 0 });
  });
  // Team battle switch (desktop pill): painted track + knob
  const sw = on => (c, R) => {
    blob(c, stadium(2, 4, 32, 14, R, 0.4), on ? C.yellow : C.paperD, R, 1.8);
    blob(c, ring(on ? 25 : 11, 11, 6.5, 6.5, R, 0.06, 9), C.cloud, R, 1.8);
  };
  img('sw-off', 36, 22, sw(false));
  img('sw-on', 36, 22, sw(true));
  // ---- Part 2 step 7 (OURS): maps panel + Secret tab ----
  // map cards (9-slice): cream paper laid a little crooked with a soft shadow; the loaded map's card is yellow with a
  // fat ink outline (the tool cards' "picked" paint). Level strokes so the stretched middle has no seam.
  const mapcard = (sel) => (c, R, w, h) => {
    const pts = rrect(4, 3, w - 9, h - 9, 4, R, 0.5);
    c.fillStyle = 'rgba(70,45,15,0.32)'; c.save(); c.translate(1.8, 2.8); path(c, pts); c.fill(); c.restore();
    fill(c, pts, sel ? C.yellow : C.card, R, { sharp: true, sp: 1.5, vary: sel ? 0.06 : 0.025, edge: 0, ang: 0 });
    outline(c, pts, R, sel ? 2.8 : 1.4, { bristles: sel ? 4 : 2, jit: 0.5, col: sel ? C.ink : C.kraftD });
  };
  nine('mapcard', 80, 80, [16, 16, 16, 16], mapcard(false));
  nine('mapcard-on', 80, 80, [16, 16, 16, 16], mapcard(true));
  // "look here" ring round a map card (a locked Secret card was tapped): a red brush loop
  nine('ring-red', 80, 80, [20, 20, 20, 20], (c, R, w, h) => outline(c, rrect(3, 3, w - 6, h - 6, 14, R, 0.8), R, 3.4, { bristles: 5, col: C.red }));
  img('tape-s', 40, 16, (c, R) => tape(c, 20, 8, 34, 11, -0.06, R));
  // padlock on a locked Secret card: yellow body, ink shackle, keyhole
  img('lock', 20, 22, (c, R) => {
    const arc = []; for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI; arc.push([10 + Math.cos(a) * 4.4, 10 + Math.sin(a) * 6]); }
    brush(c, arc, 2.6, C.ink, R, { bristles: 3, taper: 0.05, dry: 0, vary: 0.04, swell: 0 });
    blob(c, rrect(2.6, 9.2, 14.8, 11.2, 2.6, R, 0.4), C.yellow, R, 1.8);
    dab(c, 10, 13.6, 1.7, C.ink, R);
    brush(c, [[10, 14], [10.1, 17.2]], 1.5, C.ink, R, { bristles: 2, taper: 0.05, dry: 0, vary: 0.03, swell: 0 });
  });
  // ---- Part 2 step 8 (OURS): the Mine tab's + card and edit button, the unit maker ----
  img('ico-plus', 24, 24, (c, R) => icon(c, 'plus', 12, 12, 1, C.ink, R));
  img('ico-edit', 24, 24, (c, R) => icon(c, 'edit', 12, 12, 1, C.ink, R, C.yellow));
  img('ico-heart', 24, 24, (c, R) => icon(c, 'heart', 12, 12, 1, C.red, R));
  img('ico-speed', 24, 24, (c, R) => icon(c, 'speed', 12, 12, 1, C.orange, R));
  img('ico-none', 24, 24, (c, R) => icon(c, 'none', 12, 12, 1, C.ink, R));
  img('ico-mine', 24, 24, (c, R) => icon(c, 'mine', 12, 12, 1, C.ink, R));
  // + card: a red paint blob with a fat white cross; edit button: a narrow yellow card with an ink pencil
  img('card-add', ...SIZE.card, (c, R, w, h) => { card(false)(c, R, w, h); blob(c, ring(w / 2, h / 2 + 2, 15, 14, R, 0.06, 10), C.red, R, 2.2); icon(c, 'plus', w / 2, h / 2 + 2, 0.9, C.white, R); });
  img('card-edit', 34, 51, (c, R, w, h) => {
    const pts = poly([[4, 5], [w - 4, 4.5], [w - 3.6, h - 5], [4.4, h - 4.6]], R, 0.5);
    c.fillStyle = 'rgba(70,45,15,0.32)'; c.save(); c.translate(1.6, 2.4); path(c, pts); c.fill(); c.restore();
    fill(c, pts, C.yellow, R, { sharp: true, sp: 1.5, vary: 0.06, edge: 0 }); outline(c, pts, R, 2.2, { bristles: 4, jit: 0.5 });
    icon(c, 'edit', w / 2, h / 2 + 1, 0.95, C.ink, R, C.yellow);
  });
  // picker cells + row chips (9-slices, level strokes): card paper tinted by weapon group / ability kind; picked = yellow
  // with a fat ink outline (the tool cards' "picked" paint)
  const MK = { plain: C.card, gun: '#a9c4ea', throw: '#ffb36b', magic: '#c49af0', melee: '#ff9b90', body: '#a8d86a',
    move: '#9fd8ff', act: '#ffb36b', support: '#7fd6c6', passive: '#c49af0', death: '#ff9fbf', on: C.yellow };
  for (const [k, col] of Object.entries(MK)) nine(`cell-${k}`, 60, 60, [14, 14, 14, 14], (c, R, w, h) => {
    const pts = rrect(3, 3, w - 7, h - 7, 7, R, 0.45), on = k === 'on';
    c.fillStyle = 'rgba(70,45,15,0.3)'; c.save(); c.translate(1.4, 2.2); path(c, pts); c.fill(); c.restore();
    fill(c, pts, col, R, { sharp: true, sp: 1.4, vary: on ? 0.06 : 0.04, edge: 0, ang: 0 });
    outline(c, pts, R, on ? 2.8 : 1.6, { bristles: on ? 4 : 3, jit: 0.4 });
  }, { outset: 0 });
  // the stage behind the live preview: a strip of sky over painted grass (cover-fit, any box)
  img('stage', 300, 220, (c, R, w, h) => {
    const g = 0.42 * h;
    c.fillStyle = C.sky2; c.fillRect(0, 0, w, g + 4);
    for (let i = 0; i < 3; i++) dab(c, 40 + i * 110 + R() * 30, 18 + R() * 30, 12 + R() * 6, C.cloud, R, 0.3);
    fill(c, [[-4, g], [w * 0.3, g - 6], [w * 0.7, g + 4], [w + 4, g - 3], [w + 4, h + 4], [-4, h + 4]], C.g1, R, { sp: 2.2, vary: 0.1, edge: 0, ang: 0.05 });
    for (let i = 0; i < 26; i++) { const x = R() * w, y = g + 10 + R() * (h - g - 14), l = 6 + R() * 10; brush(c, [[x - l, y + 1], [x + l, y - 1]], 2.2, R() < 0.5 ? C.g2 : C.g3, R, { bristles: 3, taper: 0.3, dry: 0.3, vary: 0.05 }); }
  });
  // colour swatches: a blob of each maker paint; the picked one gets a fat ink + yellow ring on top
  MAKER_COLORS.forEach((col, i) => img(`sw-c${i}`, 34, 24, (c, R, w, h) => blob(c, rrect(2.5, 2.5, w - 6, h - 6, 7, R, 0.5), col, R, 1.8, { vary: 0.05 })));
  img('sw-ring', 40, 30, (c, R, w, h) => { const pts = rrect(2, 2, w - 4, h - 4, 10, R, 0.5); outline(c, pts, R, 4.2, { bristles: 5, col: C.ink }); outline(c, rrect(4.4, 4.4, w - 8.8, h - 8.8, 8, R, 0.4), R, 1.8, { bristles: 3, col: C.yellow }); });
  // track steps (size / health / speed): paper blobs, the ones up to the pick filled with paint
  img('seg', 20, 28, (c, R, w, h) => blob(c, rrect(2.5, 2.5, w - 5.5, h - 5.5, 5, R, 0.4), C.paperL, R, 1.6, { vary: 0.03 }));
  img('seg-on', 20, 28, (c, R, w, h) => blob(c, rrect(2.5, 2.5, w - 5.5, h - 5.5, 5, R, 0.4), C.red, R, 1.8, { vary: 0.06 }));
  img('seg-hi', 20, 28, (c, R, w, h) => blob(c, rrect(2, 2, w - 4.5, h - 4.5, 5, R, 0.4), C.yellow, R, 2.6, { vary: 0.06 }));
  img('dot', 30, 30, (c, R, w, h) => blob(c, ring(w / 2 - 0.5, h / 2 - 0.5, w / 2 - 3, h / 2 - 3, R, 0.05, 10), C.paperL, R, 1.8, { vary: 0.03 }));
  img('dot-on', 30, 30, (c, R, w, h) => blob(c, ring(w / 2 - 0.5, h / 2 - 0.5, w / 2 - 3, h / 2 - 3, R, 0.05, 10), C.yellow, R, 2.8, { vary: 0.06 }));
  // bodies, painted plain (used only until ART-BODY's MINE.preview paints the real body in the picked colour)
  const sil = (k) => (c, R, w, h) => {
    const f = (pts) => fill(c, poly(pts, R, 0.4), C.ink, R, { sharp: true, edge: 0, vary: 0.05 });
    if (k === 'person') { dab(c, 32, 10, 6, C.ink, R); f([[26, 17], [38, 17], [40, 32], [36, 32], [36, 46], [33, 46], [32, 34], [31, 46], [28, 46], [28, 32], [24, 32]]); }
    else if (k === 'animal') { f([[12, 20], [44, 18], [52, 14], [58, 18], [54, 26], [48, 28], [46, 40], [42, 40], [40, 30], [22, 30], [20, 40], [16, 40], [14, 30], [8, 24]]); }
    else if (k === 'beast') { f([[4, 26], [16, 18], [34, 14], [48, 10], [60, 12], [58, 20], [50, 22], [46, 36], [40, 44], [36, 44], [34, 34], [22, 34], [20, 44], [14, 44], [14, 32]]); }
    else { dab(c, 30, 8, 6.4, C.ink, R); f([[20, 15], [40, 15], [44, 32], [38, 32], [38, 47], [33, 47], [30, 34], [27, 47], [22, 47], [22, 32], [16, 32]]); brush(c, [[44, 30], [52, 12]], 5, C.ink, R, { bristles: 4, taper: -0.4, dry: 0, vary: 0.04 }); }
  };
  for (const k of ['person', 'animal', 'beast', 'giant']) img(`body-${k}`, 64, 48, sil(k));
  // a yellow paint swash behind report headings
  img('swash', 120, 18, (c, R) => brush(c, [[4, 10.5], [40, 9], [80, 10], [116, 8.5]], 11, C.yellow, R, { bristles: 9, taper: 0.25, dry: 0.35, vary: 0.08 }));
  // ---- Part 2 step 9 (OURS, STEP9 UI): the campaign ----
  for (const [key, col] of [['campaign', C.ink], ['leave', C.ink], ['back', C.ink]]) img(`ico-${key}`, 24, 24, (c, R) => icon(c, key, 12, 12, 1, col, R));
  img('ico-share', 24, 24, (c, R) => icon(c, 'share', 12, 12, 1, C.ink, R));   // STEP10 LEAD
  // stars = rubber stamps: red ink with the gaps a rubber stamp leaves, a little crooked; not won = an empty ink outline
  const star = (cx, cy, ro, ri, rot) => Array.from({ length: 10 }, (_, i) => { const a = rot - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  img('star-on', 48, 48, (c, R, w, h) => {
    const pts = poly(star(w / 2, h / 2 + 1.5, 21.5, 9.6, -0.07), R, 0.7);
    c.save(); path(c, pts); c.clip();
    fill(c, pts, C.red, R, { sharp: true, sp: 1.1, vary: 0.14, edge: 0 });
    for (let i = 0; i < 34; i++) dab(c, 3 + R() * (w - 6), 3 + R() * (h - 6), 0.35 + R() * 0.85, C.paperL, R);   // ink gaps
    brush(c, [[w * 0.18, h * 0.62], [w * 0.5, h * 0.55], [w * 0.84, h * 0.6]], 1.4, C.paperL, R, { bristles: 2, taper: 0.4, dry: 0.6, vary: 0.05 });
    c.restore();
    outline(c, pts, R, 1.8, { col: tone(C.red, -0.3), bristles: 3, jit: 0.5 });
  });
  img('star-off', 48, 48, (c, R, w, h) => {
    const pts = poly(star(w / 2, h / 2 + 1.5, 20.5, 9.2, 0.04), R, 0.5);
    fill(c, pts, C.paperD, R, { sharp: true, sp: 1.4, vary: 0.03, edge: 0 });
    outline(c, pts, R, 1.6, { col: C.kraftD, bristles: 2, jit: 0.4 });
  });
  // world posters (9-slices): torn paper in each tab's paint, laid a little crooked with a soft shadow
  const poster = (col) => (c, R, w, h) => {
    const pts = [], tear = (x0, y0, x1, y1, nx, ny) => { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5)); for (let i = 0; i < n; i++) { const k = i / n, d = R() * 2.6; pts.push([x0 + (x1 - x0) * k + nx * d, y0 + (y1 - y0) * k + ny * d]); } };
    tear(4, 3, w - 6, 3, 0, 1); tear(w - 6, 3, w - 6, h - 7, -1, 0); tear(w - 6, h - 7, 4, h - 7, 0, -1); tear(4, h - 7, 4, 3, 1, 0);
    c.fillStyle = 'rgba(70,45,15,0.34)'; c.save(); c.translate(2, 3); path(c, pts); c.fill(); c.restore();
    fill(c, pts, col, R, { sharp: true, sp: 1.6, vary: 0.07, edge: 0, ang: 0 });
    outline(c, pts, R, 1.3, { bristles: 2, jit: 0.3, col: tone(col, -0.38) });
  };
  for (const w of ['army', 'animals', 'mythical', 'dinos', 'siege', 'pirates', 'robots', 'space', 'ocean', 'sports', 'bugs', 'bosses'])
    nine(`poster-${w}`, 96, 96, [16, 16, 16, 16], poster(TAB_COL[w]));
  // the budget bar: a paper track with an ink rim (9-slice), filled with a strip of blue paint (repeats sideways)
  nine('camp-track', 60, 18, [8, 10, 8, 10], (c, R, w, h) => blob(c, stadium(1.5, 1.5, w - 4, h - 4, R, 0.3), C.paperL, R, 1.8, { ang: 0 }), { outset: 1 });
  img('camp-fill', 64, 16, (c, R, w, h) => {
    c.fillStyle = C.blue; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const y = 2 + i * 3.8 + R(); brush(c, [[-6, y], [w / 2, y + (R() - 0.5)], [w + 6, y]], 1.6, i % 2 ? tone(C.blue, 0.18) : tone(C.blue, -0.12), R, { bristles: 3, taper: 0, dry: 0.4, vary: 0.04, swell: 0 }); }
  });
  return out;
}

function toURL(cv) {
  return new Promise(res => {
    try { cv.toBlob(b => res(b ? URL.createObjectURL(b) : cv.toDataURL()), 'image/png'); } catch (e) { res(cv.toDataURL()); }
  });
}

let held = []; // decoded UI pictures, kept so they stay in the image cache
/** Paint the UI pictures and hand them to CSS. Resolves { ms, n }; main.js awaits it before the toolbar is built. */
export async function paintUI() {
  if (typeof document === 'undefined') return null;
  const t0 = performance.now();
  const font = document.fonts && document.fonts.load ? Promise.race([document.fonts.load('800 20px "Playpen Sans"').catch(() => null), new Promise(r => setTimeout(r, 400))]) : null;
  const list = paintAll();
  const urls = await Promise.all(list.map(([, cv]) => toURL(cv)));
  // decode each picture now, so the CSS that uses it has it in the first frame the page is shown (no pop-in)
  held = urls.map(u => { const im = new Image(); im.src = u; return im; });
  await Promise.all(held.map(im => im.decode().catch(() => null)));
  const st = document.documentElement.style;
  list.forEach(([name, , val], i) => st.setProperty(name, val(urls[i])));
  document.documentElement.dataset.ui = 'paint';
  await font;
  return { ms: performance.now() - t0, n: list.length };
}
