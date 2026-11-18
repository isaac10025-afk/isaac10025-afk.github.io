// Plain renderer. Owner: UI. Contract (ARCH.md): draw(ctx, world, view, alpha).
// view = { scale: device px per sim px, W, H (sim px) }. alpha interpolates prev -> current position.
// Every colour is read from CSS custom properties on :root (index.html token block), so the look can be restyled there.
// Batched by colour: one path per colour for bodies, one for heading ticks, one for hp rings. No per-frame allocations.
import { bodyDef } from '../ui/tools.js';

const TAU = Math.PI * 2;
const CORPSE_FADE = 1.1; // s, bodies fade out after 1.1 s (OG.md "No blood")

const FALLBACK_THEME = {
  field: '#eef0e8', wall: '#6b6f78', water: '#8dbbe8', deep: '#5a93d6', ice: '#dcefff', mine: '#33363c', mineArmed: '#e04a3a',
  peel: '#f2d24b', oil: '#3a3630', outline: '#2a2d33', tick: '#1b1d21', hp: '#2fbf5b', hpLow: '#e0a030', burn: '#ff8a2a',
  bullet: '#2a2a2a', flame: '#ff8a2a', arrow: '#7a5a3a', grenade: '#3a3d42', plasma: '#9a5cf0', shuriken: '#7a7f88',
  red: '#f74444', blue: '#4580f7',
  tree: '#3f8a4a', barrel: '#9c6b3c', frog: '#6cbf4a',
  fac: ['#6b8e23', '#8b5a2b', '#7fa36b', '#e07b2a', '#4f6d5a', '#b8433a', '#8a7a3a', '#3f8f6f', '#59c26a', '#9c7b52',
    '#8a8fa0', '#b08850', '#7b5cc4', '#a07860', '#8c8c8c', '#a0442c', '#5a4a42', '#4c7a3c', '#c95f6a', '#c23b3b',
    '#f74444', '#4580f7', '#999999', '#9aa63a', '#3b3550', '#2b2b3a', '#d9a63a'],
};
const VAR = {
  field: '--c-field', wall: '--c-wall', water: '--c-water', deep: '--c-deep', ice: '--c-ice', mine: '--c-mine', mineArmed: '--c-mine-armed',
  peel: '--c-peel', oil: '--c-oil', outline: '--c-outline', tick: '--c-tick', hp: '--c-hp', hpLow: '--c-hp-low', burn: '--c-burn',
  bullet: '--c-bullet', flame: '--c-flame', arrow: '--c-arrow', grenade: '--c-grenade', plasma: '--c-plasma', shuriken: '--c-shuriken',
  red: '--red', blue: '--blue', tree: '--c-tree', barrel: '--c-barrel', frog: '--c-frog',
};

export let theme = { ...FALLBACK_THEME, fac: FALLBACK_THEME.fac.slice() };
let rgba = null; // packed little-endian RGBA for the terrain image: wall, water, deep, ice

function parseColor(str) {
  // returns [r,g,b,a 0-255]
  if (typeof document === 'undefined') return [0, 0, 0, 255];
  const c = parseColor.ctx || (parseColor.ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
  c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = str; c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}
const pack = ([r, g, b, a]) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

export function refreshTheme() {
  if (typeof document === 'undefined') { const k = pack([0, 0, 0, 255]); rgba = { wall: k, water: k, deep: k, ice: k, oil: k, burn: k }; return theme; }
  const cs = getComputedStyle(document.documentElement);
  const read = (v, fb) => { const s = cs.getPropertyValue(v).trim(); return s || fb; };
  const th = { fac: [] };
  for (const k in VAR) th[k] = read(VAR[k], FALLBACK_THEME[k]);
  for (let i = 0; i < 27; i++) th.fac[i] = read(`--fac-${i}`, FALLBACK_THEME.fac[i]);
  theme = th;
  rgba = { wall: pack(parseColor(th.wall)), water: pack(parseColor(th.water)), deep: pack(parseColor(th.deep)), ice: pack(parseColor(th.ice)), oil: pack(parseColor(th.oil)), burn: pack(parseColor(th.burn)) };
  tKey = ''; oVer = -1;
  colorCache.clear();
  return theme;
}

// ---- colour of a unit / type ----
const TYPE_COLOR = { tree: 'tree', barrel: 'barrel', frog: 'frog' };
const colorCache = new Map();
export function typeColor(type) {
  let c = colorCache.get(type);
  if (c) return c;
  if (TYPE_COLOR[type]) c = theme[TYPE_COLOR[type]];
  else { const d = bodyDef(type); c = theme.fac[d ? d.faction : 0] || theme.fac[0]; }
  colorCache.set(type, c);
  return c;
}
export function toolColor(tool) {
  if (!tool) return theme.outline;
  if (tool.kind === 'unit') return typeColor(tool.type);
  return { wall: theme.wall, water: theme.deep, ice: theme.ice, mine: theme.mine, peel: theme.peel }[tool.kind] || theme.outline;
}
// bucket index: 0..26 factions, 27/28 team red/blue, 29+ special type colours
const SPECIAL = ['tree', 'barrel', 'frog'];
const NB = 27 + 2 + SPECIAL.length;
function bucketOf(u) {
  if (u.team === 0 || u.team === 1) return 27 + u.team; // team colour in Team battle (OG team marker, game.js:20923-20926)
  const s = SPECIAL.indexOf(u.type);
  if (s >= 0) return 29 + s;
  const f = u.faction | 0;
  return f >= 0 && f < 27 ? f : 0;
}
function bucketColor(b) {
  if (b < 27) return theme.fac[b];
  if (b === 27) return theme.red;
  if (b === 28) return theme.blue;
  return theme[SPECIAL[b - 29]];
}

// ---- reused buffers ----
const buckets = [];
const bucketLen = new Int32Array(NB);
for (let i = 0; i < NB; i++) buckets.push([]);
let ix = new Float32Array(1024), iy = new Float32Array(1024), ih = new Float32Array(1024);
function ensure(n) {
  if (ix.length >= n) return;
  let m = ix.length; while (m < n) m *= 2;
  ix = new Float32Array(m); iy = new Float32Array(m); ih = new Float32Array(m);
}

// terrain image (one pixel per 8 px tile). Reads CORE-A's world (walls.solid/cols/rows, water = level 0..1,
// ice = hp) or a plain typed-array world (mock). Rebuilt only when a version key changes.
let tCanvas = null, tCtx = null, tImg = null, tBuf = null, tW = 0, tH = 0, tKey = '', tAny = false;
function makeImage(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const x = c.getContext('2d'), img = x.createImageData(w, h);
  return { c, x, img, buf: new Uint32Array(img.data.buffer) };
}
function wallGrid(world) {
  const wl = world.walls;
  if (wl && wl.solid) return { solid: wl.solid, cols: wl.cols, rows: wl.rows, tile: wl.tile || 8, version: wl.version };
  if (wl && wl.length) return { solid: wl, cols: world.wallW, rows: world.wallH, tile: world.wallTile || 8, version: undefined };
  const cols = world.tileCols || world.wallW, rows = world.tileRows || world.wallH;
  return cols ? { solid: null, cols, rows, tile: 8, version: 0 } : null;
}
function terrainImage(world, g) {
  if (!g || !g.cols || !g.rows) return null;
  const w = g.cols, h = g.rows, solid = g.solid, water = world.water, ice = world.ice;
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
  const T = world.terrain;
  const key = g.version === undefined || (T === undefined && water) ? null
    : `${w}x${h}|${g.version}|${T ? T.waterVersion : 0}|${T ? T.iceVersion : 0}|${world.waterCells}|${world.iceCells}|${T ? T.deepCells : 0}`;
  if (!tCanvas || tW !== w || tH !== h) { const m = makeImage(w, h); tCanvas = m.c; tCtx = m.x; tImg = m.img; tBuf = m.buf; tW = w; tH = h; tKey = ''; }
  if (key !== null && key === tKey) return tAny ? tCanvas : null;
  if (!rgba) refreshTheme();
  const n = w * h; let any = false;
  const nw = water && water.length === n ? water : null, ni = ice && ice.length === n ? ice : null;
  for (let i = 0; i < n; i++) {
    let c = 0;
    if (solid && solid[i]) c = rgba.wall;
    else if (ni && ni[i] > 0) c = rgba.ice;
    else if (nw && nw[i] >= 0.05) c = nw[i] >= 0.75 ? rgba.deep : rgba.water; // wet >= 0.05, deep >= 0.75 (OG game.js:9556-9557)
    tBuf[i] = c; if (c) any = true;
  }
  tKey = key || ''; tAny = any;
  if (!any) return null;
  tCtx.putImageData(tImg, 0, 0);
  return tCanvas;
}
// oil (CORE-B OilGrid: amount per 6 px tile, slick at >= 0.08, fire flag)
let oCanvas = null, oCtx = null, oImg = null, oBuf = null, oW = 0, oH = 0, oVer = -1;
function oilImage(world) {
  const o = world.oil;
  if (!o || !o.amount || !(o.present > 0 || o.cells > 0)) return null;
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
  if (!oCanvas || oW !== o.cols || oH !== o.rows) { const m = makeImage(o.cols, o.rows); oCanvas = m.c; oCtx = m.x; oImg = m.img; oBuf = m.buf; oW = o.cols; oH = o.rows; oVer = -1; }
  if (o.version !== oVer || o.burning > 0) {
    if (!rgba) refreshTheme();
    const n = o.cols * o.rows, a = o.amount, f = o.fire;
    for (let i = 0; i < n; i++) oBuf[i] = a[i] >= 0.08 ? (f && f[i] ? rgba.burn : rgba.oil) : 0; // slick at >= 0.08 (OG game.js:13122)
    oCtx.putImageData(oImg, 0, 0); oVer = o.version;
  }
  return oCanvas;
}

// corpse alpha: 1 until 0.75 s, then linear to 0 at 1.1 s (OG game.js:22051-22059, via combat/death.js)
function corpseAlpha(c, now) {
  if (c.kept) return 1;
  const t0 = c.t ?? c.time ?? c.deathTime;
  const age = c.age ?? (t0 != null ? now - t0 : 0);
  return age <= 0.75 ? 1 : Math.max(0, 1 - (age - 0.75) / (CORPSE_FADE - 0.75));
}

function lerpAngle(a, b, t) { let d = b - a; d -= Math.round(d / TAU) * TAU; return a + d * t; }

function list(x) { return Array.isArray(x) ? x : null; }

export function draw(ctx, world, view, alpha = 1) {
  if (!rgba) refreshTheme();
  const s = view.scale, W = world.W ?? view.W, H = world.H ?? view.H;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = theme.field;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);

  // terrain grids as flat colours
  ctx.imageSmoothingEnabled = false;
  const g = wallGrid(world), img = terrainImage(world, g);
  if (img) ctx.drawImage(img, 0, 0, g.cols * g.tile, g.rows * g.tile);
  const oil = oilImage(world);
  if (oil) ctx.drawImage(oil, 0, 0, world.oil.cols * world.oil.tile, world.oil.rows * world.oil.tile);

  // mines and peels: TERRAIN fields (x[], y[], alive[], fuse[]/angle[], high) or plain arrays (mock)
  const mines = world.mines;
  if (mines && (mines.high > 0 || mines.length > 0)) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath(); let any = false;
      if (mines.alive) {
        for (let k = 0; k < mines.high; k++) { if (!mines.alive[k]) continue; const armed = mines.fuse ? mines.fuse[k] >= 0 : false; if (armed !== (pass === 1)) continue; const r = armed ? 4 : 3.5; ctx.moveTo(mines.x[k] + r, mines.y[k]); ctx.arc(mines.x[k], mines.y[k], r, 0, TAU); any = true; }
      } else if (Array.isArray(mines)) {
        for (const m of mines) { if (m.dead || !!m.armed !== (pass === 1)) continue; ctx.moveTo(m.x + 3.5, m.y); ctx.arc(m.x, m.y, 3.5, 0, TAU); any = true; }
      }
      if (any) { ctx.fillStyle = pass ? theme.mineArmed : theme.mine; ctx.fill(); }
    }
  }
  const peels = world.peels;
  if (peels && (peels.high > 0 || peels.length > 0)) {
    ctx.beginPath(); let any = false;
    if (peels.alive) { for (let k = 0; k < peels.high; k++) { if (!peels.alive[k]) continue; const x = peels.x[k], y = peels.y[k]; ctx.moveTo(x + 4, y); ctx.ellipse(x, y, 4, 2.4, peels.angle ? peels.angle[k] : 0, 0, TAU); any = true; } }
    else if (Array.isArray(peels)) { for (const p of peels) { if (p.dead) continue; ctx.moveTo(p.x + 4, p.y); ctx.ellipse(p.x, p.y, 4, 2.4, p.angle || 0, 0, TAU); any = true; } }
    if (any) { ctx.fillStyle = theme.peel; ctx.fill(); }
  }

  // corpses fade over 1.1 s
  const corpses = list(world.corpses);
  if (corpses && corpses.length) {
    const now = world.time || 0;
    for (const c of corpses) {
      const a = corpseAlpha(c, now);
      if (!(a > 0)) continue;
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = c.team === 0 ? theme.red : c.team === 1 ? theme.blue : typeColor(c.type);
      const r = c.r || c.radius || 8, ang = c.fallDx !== undefined ? Math.atan2(c.fallDy || 0, c.fallDx || 1) : (c.heading || 0);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 1.1, r * 0.6, ang, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // units: interpolate once, bucket by colour
  const units = world.units || [];
  ensure(units.length);
  bucketLen.fill(0);
  let n = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u || u.dead) continue;
    const px = u.px ?? u.x, py = u.py ?? u.y;
    ix[i] = px + (u.x - px) * alpha;
    iy[i] = py + (u.y - py) * alpha - (u.z > 0 ? u.z * 0.5 : 0);
    ih[i] = u.pheading != null ? lerpAngle(u.pheading, u.heading || 0, alpha) : (u.heading || 0);
    const b = bucketOf(u);
    buckets[b][bucketLen[b]++] = i;
    n++;
  }
  if (n) {
    // bodies
    ctx.lineWidth = 1 / s * Math.max(1, s * 0.6);
    ctx.strokeStyle = theme.outline;
    for (let b = 0; b < NB; b++) {
      const len = bucketLen[b]; if (!len) continue;
      const arr = buckets[b];
      ctx.beginPath();
      for (let k = 0; k < len; k++) { const i = arr[k], r = units[i].radius || 6; ctx.moveTo(ix[i] + r, iy[i]); ctx.arc(ix[i], iy[i], r, 0, TAU); }
      ctx.fillStyle = bucketColor(b); ctx.fill(); ctx.stroke();
    }
    // heading ticks
    ctx.beginPath();
    for (let b = 0; b < NB; b++) {
      const len = bucketLen[b], arr = buckets[b];
      for (let k = 0; k < len; k++) {
        const i = arr[k], u = units[i], r = u.radius || 6, c = Math.cos(ih[i]), sn = Math.sin(ih[i]);
        if (u.def && u.def.prop) continue;
        ctx.moveTo(ix[i] + c * r * 0.2, iy[i] + sn * r * 0.2); ctx.lineTo(ix[i] + c * (r + 3), iy[i] + sn * (r + 3));
      }
    }
    ctx.lineWidth = 2; ctx.strokeStyle = theme.tick; ctx.stroke();
    // hp rings (damaged units only), and burning rings
    ctx.beginPath();
    let low = false;
    for (let b = 0; b < NB; b++) {
      const len = bucketLen[b], arr = buckets[b];
      for (let k = 0; k < len; k++) {
        const i = arr[k], u = units[i];
        if (!(u.maxHp > 0) || u.hp >= u.maxHp) continue;
        const f = Math.max(0, u.hp / u.maxHp), r = (u.radius || 6) + 2.2;
        if (f < 0.35) { low = true; continue; }
        ctx.moveTo(ix[i], iy[i] - r); ctx.arc(ix[i], iy[i], r, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      }
    }
    ctx.lineWidth = 1.6; ctx.strokeStyle = theme.hp; ctx.stroke();
    if (low) {
      ctx.beginPath();
      for (let b = 0; b < NB; b++) {
        const len = bucketLen[b], arr = buckets[b];
        for (let k = 0; k < len; k++) {
          const i = arr[k], u = units[i];
          if (!(u.maxHp > 0) || u.hp >= u.maxHp) continue;
          const f = Math.max(0, u.hp / u.maxHp), r = (u.radius || 6) + 2.2;
          if (f >= 0.35) continue;
          ctx.moveTo(ix[i], iy[i] - r); ctx.arc(ix[i], iy[i], r, -Math.PI / 2, -Math.PI / 2 + TAU * f);
        }
      }
      ctx.strokeStyle = theme.hpLow; ctx.stroke();
    }
    let burning = false;
    ctx.beginPath();
    for (let b = 0; b < NB; b++) {
      const len = bucketLen[b], arr = buckets[b];
      for (let k = 0; k < len; k++) {
        const i = arr[k], u = units[i];
        if (!(u.burning > 0)) continue;
        burning = true; const r = (u.radius || 6) + 4;
        ctx.moveTo(ix[i] + r, iy[i]); ctx.arc(ix[i], iy[i], r, 0, TAU);
      }
    }
    if (burning) { ctx.lineWidth = 2; ctx.strokeStyle = theme.burn; ctx.stroke(); }
  }

  // projectiles: dot at the head, line back to the previous position
  const proj = list(world.projectiles);
  if (proj && proj.length) {
    const kinds = ['bullet', 'flame', 'arrow', 'grenade', 'plasma', 'shuriken'];
    for (const kind of kinds) {
      let anyLine = false, anyDot = false;
      ctx.beginPath();
      for (const p of proj) {
        if (p.dead || (p.kind || 'bullet') !== kind) continue;
        const px = p.px ?? p.x - (p.vx || 0) / 60, py = p.py ?? p.y - (p.vy || 0) / 60;
        const x = px + (p.x - px) * alpha, y = py + (p.y - py) * alpha - (p.z > 0 ? p.z * 0.5 : 0);
        const tx = x - (p.vx || 0) * 0.025, ty = y - (p.vy || 0) * 0.025;
        ctx.moveTo(tx, ty); ctx.lineTo(x, y); anyLine = true;
      }
      if (anyLine) { ctx.lineWidth = kind === 'flame' ? 3 : 1.2; ctx.strokeStyle = theme[kind] || theme.bullet; ctx.stroke(); }
      ctx.beginPath();
      for (const p of proj) {
        if (p.dead || (p.kind || 'bullet') !== kind) continue;
        const px = p.px ?? p.x, py = p.py ?? p.y;
        const x = px + (p.x - px) * alpha, y = py + (p.y - py) * alpha - (p.z > 0 ? p.z * 0.5 : 0);
        const r = kind === 'grenade' ? 3 : kind === 'flame' ? (p.maxLife > 0 ? (3 + 7 * (1 - p.life / p.maxLife)) * (p.scale || 1) : 3.5) : 1.6; // flame grows 3 -> 10 px (OG game.js:10130-10132)
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); anyDot = true;
      }
      if (anyDot) { ctx.fillStyle = theme[kind] || theme.bullet; ctx.fill(); }
    }
  }
}

// ---- tool icons (UI uses these until real art lands) ----
export function drawIcon(ctx, tool, w, h) {
  if (!rgba) refreshTheme();
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, u = Math.min(w, h);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (tool.kind === 'unit') {
    const d = bodyDef(tool.type);
    const rad = d ? d.radius : 9.5;
    const r = Math.max(u * 0.16, Math.min(u * 0.4, u * (0.12 + (rad / 21) * 0.28)));
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = typeColor(tool.type); ctx.fill();
    ctx.lineWidth = Math.max(1, u * 0.04); ctx.strokeStyle = theme.outline; ctx.stroke();
    if (!(d && d.prop)) {
      ctx.beginPath(); ctx.moveTo(cx + r * 0.2, cy); ctx.lineTo(cx + r + u * 0.1, cy);
      ctx.lineWidth = Math.max(1.5, u * 0.07); ctx.strokeStyle = theme.tick; ctx.stroke();
    }
    return;
  }
  switch (tool.kind) {
    case 'wall': {
      const s = u * 0.62, x = cx - s / 2, y = cy - s / 2;
      ctx.fillStyle = theme.wall; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = theme.field; ctx.lineWidth = Math.max(1, u * 0.04);
      ctx.beginPath();
      for (let k = 1; k < 3; k++) { ctx.moveTo(x, y + s * k / 3); ctx.lineTo(x + s, y + s * k / 3); }
      ctx.moveTo(cx, y); ctx.lineTo(cx, y + s / 3); ctx.moveTo(x + s / 4, y + s / 3); ctx.lineTo(x + s / 4, y + 2 * s / 3);
      ctx.moveTo(x + 3 * s / 4, y + s / 3); ctx.lineTo(x + 3 * s / 4, y + 2 * s / 3); ctx.moveTo(cx, y + 2 * s / 3); ctx.lineTo(cx, y + s);
      ctx.stroke();
      break;
    }
    case 'water': {
      ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.34, u * 0.24, 0, 0, TAU); ctx.fillStyle = theme.water; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy, u * 0.18, u * 0.12, 0, 0, TAU); ctx.fillStyle = theme.deep; ctx.fill();
      break;
    }
    case 'ice': {
      ctx.beginPath(); ctx.moveTo(cx, cy - u * 0.32); ctx.lineTo(cx + u * 0.3, cy); ctx.lineTo(cx, cy + u * 0.32); ctx.lineTo(cx - u * 0.3, cy); ctx.closePath();
      ctx.fillStyle = theme.ice; ctx.fill(); ctx.lineWidth = Math.max(1, u * 0.04); ctx.strokeStyle = theme.deep; ctx.stroke();
      break;
    }
    case 'mine': {
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.22, 0, TAU); ctx.fillStyle = theme.mine; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, u * 0.07, 0, TAU); ctx.fillStyle = theme.mineArmed; ctx.fill();
      break;
    }
    case 'peel': {
      ctx.beginPath(); ctx.arc(cx - u * 0.08, cy, u * 0.3, -1.1, 1.1); ctx.arc(cx - u * 0.2, cy, u * 0.26, 0.95, -0.95, true); ctx.closePath();
      ctx.fillStyle = theme.peel; ctx.fill(); ctx.lineWidth = Math.max(1, u * 0.035); ctx.strokeStyle = theme.outline; ctx.stroke();
      break;
    }
  }
}
