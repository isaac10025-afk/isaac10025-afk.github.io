// POSTER PAINT primitives (look A from looks/look3.html, src/kid-a.js), as ES modules for the game.
// A 7-year-old's tempera painting on cream cartridge paper: fat bristly brush strokes that run dry at the
// ends, colour fills that miss their wobbly black outlines. Owner: ART lead. Sprite modules import from here.
// All coordinates are sim px (1 sim px = 1.075 css px on screen). Every call takes a seeded R() so a sprite
// paints the same way every time for the same key.
export const TAU = Math.PI * 2;
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// The look's palette. Team colours: kid red = left team, kid blue = right team (OG left red, right blue).
export const C = {
  paper: '#f4ead3', paperD: '#e2d3b2', paperL: '#fcf7ec', ink: '#1c1916', white: '#fffdf2',
  blue: '#1f57d8', red: '#e3241a', skin: '#f8b98c', zskin: '#a6d85c', zskinD: '#6f9c34',
  g1: '#6cbd45', g2: '#57a838', g3: '#88cf58', g4: '#4b9731',
  sky: '#5fb5f2', sky2: '#86cbf6', sun: '#ffd51e', sunO: '#ff9d14', cloud: '#fdfbf4',
  yellow: '#ffd51e', orange: '#ff8a12', purple: '#8d4fd6', pink: '#ff9fd0', brown: '#8b5a2b', brownL: '#b07a3f',
  grey: '#8f9296', greyL: '#b8bbbf', greyD: '#6b6e73',
  pond: '#3c8de6', pondD: '#2266c9', pondL: '#8cc9fa', blood: '#d91c12', scorch: '#2b2421',
  char: '#3c3633', charL: '#5a524c', leaf: '#2e8c33', leafL: '#4db148', leafD: '#1f6b26',
  fireR: '#ec3417', fireO: '#ff8b19', fireY: '#ffe22c', smoke: '#aaa59f', smokeL: '#cfcac3',
  cheetah: '#f7b925', wing: '#b81f4e', wingL: '#d23b66',
  kraft: '#c2945f', kraftD: '#9c7346', tape: '#efe1b3', card: '#f7efdc',
};
export const TEAM_COL = [C.red, C.blue]; // index = unit.team (0 left, 1 right)

// ---------- colour ----------
export const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const toneCache = new Map();
/** f > 0 mixes toward white, f < 0 toward black. */
export function tone(h, f) {
  const key = h + (f * 100 | 0); let v = toneCache.get(key); if (v) return v;
  const [r, g, b] = hexRgb(h);
  v = f >= 0 ? rgbHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f) : rgbHex(r * (1 + f), g * (1 + f), b * (1 + f));
  toneCache.set(key, v); return v;
}

// ---------- canvases ----------
/** A CPU-backed canvas (painting = thousands of small strokes; CPU canvases are much faster for that). */
export function canvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d', { willReadFrequently: true }); return cv; }
  const cv = new OffscreenCanvas(w, h); cv.getContext('2d', { willReadFrequently: true }); return cv;
}

// ---------- paint primitives ----------
export function spline(pts, closed, per = 6) {
  const n = pts.length, out = [];
  if (n < 2) return pts.slice();
  const get = i => closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
/** A loaded round brush along pts: n bristles side by side, each its own tone; the outer ones run dry first.
 *  o: bristles, taper (0..1, thinner at the end; negative = fatter), dry (0..1), vary (tone jitter), swell, per. */
export function brush(c, pts, w, col, R, o = {}) {
  const P = spline(pts, false, o.per || 7);
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  const N = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; });
  const nb = o.bristles || Math.max(3, Math.min(14, Math.round(w * 1.3)));
  const taper = o.taper ?? 0.45, dry = o.dry ?? 0.5, vary = o.vary ?? 0.09, swell = o.swell ?? 0.12;
  const bw = w / nb * 1.85;
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let j = 0; j < nb; j++) {
    const off = (j + 0.5) / nb - 0.5, edge = Math.abs(off) * 2;
    const tEnd = 1 - dry * R() * (0.2 + 0.75 * edge);
    const tStart = R() * 0.05 * edge;
    c.strokeStyle = tone(col, (R() - 0.5) * 2 * vary);
    c.lineWidth = bw * (0.75 + R() * 0.5);
    const wob = (R() - 0.5) * 0.12;
    c.beginPath(); let started = false;
    for (let i = 0; i < P.length; i++) {
      const t = L[i] / tot; if (t < tStart || t > tEnd) continue;
      const wt = w * (1 + swell * Math.sin(t * Math.PI)) * (1 - taper * Math.max(0, (t - 0.5) / 0.5));
      const x = P[i][0] + N[i][0] * (off + wob) * wt, y = P[i][1] + N[i][1] * (off + wob) * wt;
      if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
    }
    if (started) c.stroke();
  }
}
/** Wobbly closed point ring around an ellipse (feed to part/fill/outline). */
export function ring(cx, cy, rx, ry, R, irr = 0.1, n = 9, rot = 0) {
  const p1 = R() * TAU, p2 = R() * TAU, pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + i / n * TAU;
    const k = 1 + irr * (0.6 * Math.sin(2 * a + p1) + 0.4 * Math.sin(3 * a + p2)) + irr * 0.6 * (R() - 0.5);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
export function poly(pts, R, j = 0.35) { return pts.map(([x, y]) => [x + (R() - 0.5) * 2 * j, y + (R() - 0.5) * 2 * j]); }
export function shift(pts, dx, dy, grow = 0) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => { const ex = x - cx, ey = y - cy, l = Math.hypot(ex, ey) || 1; return [x + dx + ex / l * grow, y + dy + ey / l * grow]; });
}
export function path(c, P) { c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
/** Flat tempera fill: streaky brush marks inside, paint pooled a little darker at the rim.
 *  o: sharp (no spline smoothing), ang (stroke angle), sp (stroke spacing), vary, edge (rim width, 0 = none). */
export function fill(c, pts, col, R, o = {}) {
  const P = o.sharp ? pts : spline(pts, true, 6);
  path(c, P); c.fillStyle = col; c.fill();
  c.save(); path(c, P); c.clip();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const ang = o.ang ?? (R() - 0.5) * 1.4, ca = Math.cos(ang), sa = Math.sin(ang);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.hypot(x1 - x0, y1 - y0) / 2 + 1;
  const sp = o.sp || 0.85, vary = o.vary ?? 0.11; c.lineCap = 'round';
  for (let d = -rad; d <= rad; d += sp * (0.6 + R() * 0.7)) {
    c.strokeStyle = tone(col, (R() - 0.5) * 2 * vary); c.lineWidth = sp * (0.45 + R() * 0.6);
    const s0 = -rad + R() * rad * 0.6, s1 = rad - R() * rad * 0.6;
    c.beginPath(); c.moveTo(cx + ca * s0 - sa * d, cy + sa * s0 + ca * d); c.lineTo(cx + ca * s1 - sa * d, cy + sa * s1 + ca * d + (R() - 0.5) * 0.8); c.stroke();
  }
  if (o.edge !== 0) { path(c, P); c.strokeStyle = tone(col, -0.16); c.lineWidth = o.edge ?? 1.0; c.stroke(); }
  c.restore();
}
/** Black outline painted with a thinner brush: own wobble, starts anywhere, overshoots the join.
 *  o: jit, over (points of overshoot), gap (leave the join open), col, bristles. */
export function outline(c, pts, R, w = 1.45, o = {}) {
  const n = pts.length, s = Math.floor(R() * n), jit = o.jit ?? 0.45, over = o.over ?? 1;
  const P = [];
  for (let i = 0; i <= n + over; i++) { const p = pts[(s + i) % n]; P.push([p[0] + (R() - 0.5) * 2 * jit, p[1] + (R() - 0.5) * 2 * jit]); }
  if (o.gap) P.pop();
  brush(c, P, w, o.col || C.ink, R, { bristles: o.bristles || 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 });
}
/** M = per-sprite misregistration: the fill misses its outline by the same offset on every part of one sprite. */
export function M0(R) { const a = R() * TAU, d = 0.8 + R() * 0.7; return { R, mx: Math.cos(a) * d, my: Math.sin(a) * d, grow: 0.3 + R() * 0.4, lw: 1.65 }; }
/** A painted part: fill (shifted by the sprite's misregistration) + its own black outline. o as fill() plus lw. */
export function part(c, pts, col, M, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  outline(c, pts, M.R, o.lw ?? M.lw, o);
}
/** A round blob of paint (eyes, hands, spots). */
export function dab(c, x, y, r, col, R, irr = 0.18) { const P = spline(ring(x, y, r, r * (0.85 + R() * 0.3), R, irr, 7), true, 4); path(c, P); c.fillStyle = col; c.fill(); }
/** A limb/tail: ink stroke with a colour stroke on top. */
export function tube(c, pts, w, col, R, lw = 1.3) { brush(c, pts, w + lw * 2, C.ink, R, { taper: 0.1, dry: 0.08, vary: 0.05, swell: 0 }); brush(c, pts, w, col, R, { taper: 0.15, dry: 0.15, vary: 0.1, swell: 0.05 }); }
/** A paint splat: blob + flicked drops + two streaks. flat squashes it onto the ground. */
export function splat(c, x, y, r, col, R, flat = 0.62) {
  const n = 13, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU + R() * 0.25; const k = 0.6 + R() * 0.45 + (R() < 0.3 ? 0.4 : 0); pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * flat]); }
  fill(c, pts, col, R, { vary: 0.07, sp: 1.1, edge: 1.2 });
  const m = 7 + (R() * 6 | 0);
  for (let i = 0; i < m; i++) { const a = R() * TAU, d = r * (1.2 + R() * 1.1); dab(c, x + Math.cos(a) * d, y + Math.sin(a) * d * flat, Math.max(0.55, r * 0.16 * (1.5 - (d / r - 1.2))), col, R); }
  for (let i = 0; i < 2; i++) { const a = R() * TAU; brush(c, [[x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5 * flat], [x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.7 * flat]], r * 0.3, col, R, { taper: 0.95, dry: 0.15, bristles: 3 }); }
}
/** A yellow star spark with an orange middle (fuses, muzzle flashes). */
export function spark(c, x, y, r, R) {
  const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2; const k = i % 2 ? 0.45 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.15), C.yellow, R, { sharp: true, vary: 0.05, edge: 0 }); dab(c, x, y, r * 0.35, C.orange, R);
}
/** Paper tooth: the cartridge paper shows through the paint. Call last, over the box (source-atop). */
export function tooth(c, x, y, w, h, seed, dens = 0.32) {
  const R = rng(seed); c.save(); c.globalCompositeOperation = 'source-atop';
  const n = Math.round(w * h * dens);
  for (let i = 0; i < n; i++) { c.fillStyle = R() < 0.62 ? 'rgba(255,250,232,0.26)' : 'rgba(50,25,0,0.13)'; const s = 0.25 + R() * 0.5; c.fillRect(x + R() * w, y + R() * h, s, s * (0.6 + R())); }
  c.restore();
}
/** Paper / card grain as a pixel-noise tile (one putImageData). Lay it with grainFill. */
export function grainTile(base, lite, dark, seed, n = 160, pDark = 0.16, pLite = 0.2) {
  const cv = canvas(n, n), x = cv.getContext('2d'), im = x.createImageData(n, n), d = im.data, R = rng(seed);
  const B = hexRgb(base), L = hexRgb(lite), D = hexRgb(dark);
  for (let i = 0; i < n * n; i++) { const r = R(); const q = r < pDark ? D : r < pDark + pLite ? L : B; const j = (R() - 0.5) * 6;
    d[i * 4] = q[0] + j; d[i * 4 + 1] = q[1] + j; d[i * 4 + 2] = q[2] + j; d[i * 4 + 3] = 255; }
  for (let f = 0; f < n / 3; f++) { let px = R() * n, py = R() * n; const a = R() * TAU, l = 3 + R() * 6;
    for (let k = 0; k < l; k++) { const i = ((py | 0) % n) * n + ((px | 0) % n); d[i * 4] = D[0]; d[i * 4 + 1] = D[1]; d[i * 4 + 2] = D[2]; px = (px + Math.cos(a + k * 0.2) + n) % n; py = (py + Math.sin(a + k * 0.2) + n) % n; } }
  x.putImageData(im, 0, 0); return cv;
}
/** k = device px per unit of c's current transform (so the grain stays 1 device px). */
export function grainFill(c, tile, x, y, w, h, k) {
  const pat = c.createPattern(tile, 'repeat'); pat.setTransform(new DOMMatrix().scale(1 / k)); c.fillStyle = pat; c.fillRect(x, y, w, h);
}
