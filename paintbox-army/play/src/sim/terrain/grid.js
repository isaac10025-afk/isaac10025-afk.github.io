// TERRAIN storage glue. CORE-A owns the 8 px grids on world (world.walls, world.water = water level, world.ice = ice hp,
// world.waterCells, world.iceCells). This file keeps the extra per-tile arrays the OG water and ice need
// (painted depth, shore distance, ponds, plague taint, stroke ids, broken/cracked lists) on world.terrain,
// and does the grid math (shore levels, pond labels, capsule painting, ice harm).
// OG modules 467 (water, game.js:9553-9882) and 1078 (ice, game.js:1048-1143).
import { WALL_TILE, WET, DEEP } from '../const.js';

export const TILE = WALL_TILE;            // 8 px tiles for walls, water and ice (OG game.js:8669, 9553, 1048)
export const SHORE_CAP = 12;              // shore distance cap in tiles (OG game.js:9688)
export const SHALLOW = 0.45;              // level of a 2-tile shore ring, also the swimmer cap (OG game.js:9554)
export const FULL = 1;                    // painted depth / deep level (OG game.js:9555)
export const ICE_HP = 1;                  // painted ice hp (OG game.js:1049)
export const CRACK = 0.8;                 // crack events at 0.8 and 0.4 (OG game.js:1050, 1129)

// ---------------------------------------------------------------- state
export function terrainOf(world) {
  const T = world.terrain;
  if (T === undefined || T.level !== world.water || T.iceHp !== world.ice || T.W !== world.W || T.H !== world.H) return build(world);
  // CORE-A cleared its water in place (clearAll): painted tiles always make level > 0, so this can only mean a wipe.
  if (T.wetCells !== 0 && world.waterCells === 0) wipeWater(world, T);
  return T;
}

function build(world) {
  const W = world.W, H = world.H, cols = Math.max(1, Math.ceil(W / TILE)), rows = Math.max(1, Math.ceil(H / TILE)), n = cols * rows;
  // Fallback only: CORE-A's world already allocates these at the right size.
  if (!(world.water instanceof Float32Array) || world.water.length !== n) { world.water = new Float32Array(n); world.waterCells = 0; }
  if (!(world.ice instanceof Float32Array) || world.ice.length !== n) { world.ice = new Float32Array(n); world.iceCells = 0; }
  const T = {
    W, H, cols, rows, n, tile: TILE, inv: 1 / TILE,
    level: world.water, iceHp: world.ice,
    depth: new Float32Array(n), shore: new Uint8Array(n), pond: new Int32Array(n).fill(-1), ponds: 0, queue: new Int32Array(n),
    stroke: new Uint32Array(n), strokeId: 1, wetCells: 0, deepCells: 0, waterVersion: 0,
    taint: new Float32Array(n), taintSince: new Float32Array(n), taintNext: new Float32Array(n), taintEnds: 0, taintVersion: 0, spreadSteps: 0,
    iceVersion: 0, broken: [], cracked: [],
  };
  world.terrain = T;
  // Adopt whatever the arrays already hold (a world that had water set some other way).
  let any = 0;
  for (let i = 0; i < n; i++) if (T.level[i] >= WET) { T.depth[i] = FULL; any = 1; }
  if (any) recountWater(world, T); else { world.waterCells = 0; T.deepCells = 0; }
  recountIce(world, T);
  return T;
}

export function wipeWater(world, T) {
  T.depth.fill(0); T.level.fill(0); T.shore.fill(0); T.pond.fill(-1); T.ponds = 0;
  T.taint.fill(0); T.taintSince.fill(0); T.taintEnds = 0; T.wetCells = 0; T.deepCells = 0; world.waterCells = 0; T.waterVersion++;
}

export function wipeIce(world, T) { T.iceHp.fill(0); T.broken.length = 0; T.cracked.length = 0; world.iceCells = 0; T.iceVersion++; }
// Clear every water / ice grid this file keeps.
export function clearGrids(world) { const T = terrainOf(world); wipeWater(world, T); wipeIce(world, T); T.strokeId++; }

export function cellOf(T, x, y) {
  const tx = Math.floor(x * T.inv), ty = Math.floor(y * T.inv);
  return tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows ? -1 : ty * T.cols + tx;
}
export function cellX(T, i) { return ((i % T.cols) + 0.5) * T.tile; }
export function cellY(T, i) { return (Math.floor(i / T.cols) + 0.5) * T.tile; }

// Distance from (px,py) to the segment (x0,y0)-(x1,y1) (OG game.js:225-231, 11861-11867).
export function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  let s = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  return Math.hypot(px - x0 - dx * s, py - y0 - dy * s);
}

// Fixed lattice jitter hash (OG game.js:218-221, 11857-11860).
export function latticeHash(a, b, c) { const v = 43758.5453 * Math.sin(127.1 * a + 311.7 * b + 74.7 * c); return v - Math.floor(v); }

// Visit every tile whose centre is within max(r, tile/2) of the segment (OG paintCapsule, game.js:825-852, 1082-1108, 9642-9677).
// fn(i) per tile; returns nothing. Bounds clipped to the grid.
export function forCapsule(T, x0, y0, x1, y1, r, fn) {
  const t = T.tile, R = Math.max(r, 0.5 * t);
  const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - R) * T.inv)), c1 = Math.min(T.cols - 1, Math.floor((Math.max(x0, x1) + R) * T.inv));
  const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - R) * T.inv)), r1 = Math.min(T.rows - 1, Math.floor((Math.max(y0, y1) + R) * T.inv));
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, R2 = R * R;
  for (let ty = r0; ty <= r1; ty++) {
    const cy = (ty + 0.5) * t;
    for (let tx = c0; tx <= c1; tx++) {
      const cx = (tx + 0.5) * t;
      let s = l2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / l2 : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const ex = cx - (x0 + dx * s), ey = cy - (y0 + dy * s);
      if (ex * ex + ey * ey > R2) continue;
      fn(ty * T.cols + tx);
    }
  }
}

// ---------------------------------------------------------------- water level from shore distance (OG game.js:9679-9714)
// Each wet tile gets its chessboard distance to the nearest dry tile (field edge counts as dry), capped at 12.
// Level: 0 dry; > 2 tiles in = 1 (deep); else 0.45 × (0.5 + 0.5 × d / 2) → 0.3375 at d = 1, 0.45 at d = 2.
export function shelve(T) {
  const C = T.cols, R = T.rows, d = T.depth, s = T.shore, L = T.level;
  for (let i = 0; i < d.length; i++) s[i] = d[i] >= WET ? SHORE_CAP : 0;
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const i = y * C + x; if (s[i] === 0) continue;
    let v = s[i];
    if (x > 0) v = Math.min(v, s[i - 1] + 1);
    if (y > 0) v = Math.min(v, s[i - C] + 1);
    if (x > 0 && y > 0) v = Math.min(v, s[i - C - 1] + 1);
    if (x < C - 1 && y > 0) v = Math.min(v, s[i - C + 1] + 1);
    if (x === 0 || y === 0) v = Math.min(v, 1);
    s[i] = v;
  }
  for (let y = R - 1; y >= 0; y--) for (let x = C - 1; x >= 0; x--) {
    const i = y * C + x; if (s[i] === 0) continue;
    let v = s[i];
    if (x < C - 1) v = Math.min(v, s[i + 1] + 1);
    if (y < R - 1) v = Math.min(v, s[i + C] + 1);
    if (x < C - 1 && y < R - 1) v = Math.min(v, s[i + C + 1] + 1);
    if (x > 0 && y < R - 1) v = Math.min(v, s[i + C - 1] + 1);
    if (x === C - 1 || y === R - 1) v = Math.min(v, 1);
    s[i] = v;
  }
  for (let i = 0; i < d.length; i++) L[i] = s[i] === 0 ? 0 : s[i] > 2 ? FULL : SHALLOW * (0.5 + (0.5 * s[i]) / 2);
}

// Pond ids: 4-neighbour connected wet tiles (OG game.js:9800-9823).
export function label(T) {
  const C = T.cols, R = T.rows, L = T.level, P = T.pond, Q = T.queue;
  P.fill(-1);
  let id = 0;
  for (let i = 0; i < L.length; i++) {
    if (L[i] < WET || P[i] >= 0) continue;
    let head = 0, tail = 0; Q[tail++] = i; P[i] = id;
    while (head < tail) {
      const c = Q[head++], x = c % C, y = (c - x) / C;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
        const j = ny * C + nx;
        if (L[j] < WET || P[j] >= 0) continue;
        P[j] = id; Q[tail++] = j;
      }
    }
    id++;
  }
  T.ponds = id;
}

// OG recount (game.js:9679-9685): levels, ponds, wet / deep counts.
export function recountWater(world, T) {
  shelve(T); label(T);
  let wet = 0, deep = 0; const L = T.level;
  for (let i = 0; i < L.length; i++) { const v = L[i]; if (v >= WET) wet++; if (v >= DEEP) deep++; }
  T.wetCells = wet; T.deepCells = deep; world.waterCells = wet; T.waterVersion++;
}

export function recountIce(world, T) {
  let n = 0; const h = T.iceHp;
  for (let i = 0; i < h.length; i++) if (h[i] > 0) n++;
  world.iceCells = n; T.iceVersion++;
}

// ---------------------------------------------------------------- unit flags other owners keep (with b{} fallbacks)
export function climbOf(u) { return u.climb !== undefined ? u.climb : (u.b && u.b.climb) || 0; }
export function leapOf(u) { return u.leaping !== undefined ? u.leaping : (u.b && u.b.leaping) || 0; }
export function airborne(u) { return u.z > 0 || u.vz > 0; } // OG game.js:9060
