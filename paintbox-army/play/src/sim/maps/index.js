// MAPS (OURS, Part 2 step 7, STEP7.md): the map registry, the builder API and the loader. Owner: LEAD.
// A map = a function that paints terrain + props into the world with the API below, plus a ground look and a hiding spot
// for its secret unit. Maps are built in the world's own size (the world never resizes after boot, camera.js), so a
// builder lays things out in fractions of W / H and keeps feature sizes (river width, wall thickness) in sim px.
// Every map is mirrored left / right (api.mirror) so Team battle is fair on it.
// The builder randomness is its own seeded rng (hash of the map id): a map looks the same every load and never moves
// world.rng (so a seeded battle on a map replays the same).
import { WALL_TILE } from '../const.js';
import { terrainOf, forCapsule, recountWater, recountIce, FULL, ICE_HP } from '../terrain/grid.js';
import { paintWall, WALL_TILE_HP as WALL_HP } from '../terrain/wall.js';
import { paintMines } from '../terrain/mines.js';
import { paintPeels } from '../terrain/peels.js';

export const MAP_ORDER = ['castle', 'beach', 'lake', 'canyon', 'village', 'volcano', 'swamp', 'playground'];
// Secret unit of each map (STEP7.md). The UI keeps which ones were found (localStorage); the sim only places it.
export const MAP_SECRET = { castle: 'ghost', beach: 'seagull', lake: 'yeti', canyon: 'cowboy', village: 'scarecrow', volcano: 'phoenix', swamp: 'bogmonster', playground: 'baby' };
export const GROUNDS = ['grass', 'sand', 'snow', 'dirt', 'rock', 'swamp'];   // ground looks the art paints (STEP7.md)
export const SECRET_TAP = 26;   // px: a tap this close to the hiding spot (plus the finger radius) finds it

const REG = new Map();
/** def: { id, ground: one of GROUNDS, build(api) }. build must set the secret spot with api.secret(x, y, look). */
export function registerMap(def) { if (def && def.id) REG.set(def.id, def); return def; }
export function getMap(id) { return REG.get(id) || null; }
export function allMaps() { return MAP_ORDER.map((id) => REG.get(id)).filter(Boolean); }

// Extra terrain kinds (lava, mud, bridge, tramp: TERRAIN-SIM) register their painters here so the map API can call them
// without this file importing modules that may not exist yet. painter(world, x0, y0, x1, y1, r) for capsule kinds;
// tramp also gets single points (x0 = x1). after(world) runs once when the build ends (a whole-grid recount, if any).
const KINDS = new Map();
export function registerMapKind(kind, painter, after = null) { KINDS.set(kind, { painter, after }); }

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- builder API
function makeApi(world, id, flip, shared) {
  const W = world.W, H = world.H, T = terrainOf(world);
  const X = flip ? (x) => W - x : (x) => x;
  const api = {
    W, H, id, flipped: flip, tile: WALL_TILE,
    portrait: H > W,                         // phone held upright: the world is taller than wide
    short: Math.min(W, H), long: Math.max(W, H),
    rng: shared.rng,                         // the map's own rng (same both halves of a mirror: draw it before mirroring)
    // ---- capsule painters: segment (x0,y0)-(x1,y1), radius r in px (walls take r as given: no ×0.75 here)
    wall(x0, y0, x1, y1, r) { paintWall(world, X(x0), y0, X(x1), y1, r, true); return api; },
    hole(x0, y0, x1, y1, r) { paintWall(world, X(x0), y0, X(x1), y1, r, false); return api; },   // cut a gap in walls
    water(x0, y0, x1, y1, r) { forCapsule(T, X(x0), y0, X(x1), y1, r, (i) => { T.depth[i] = FULL; }); shared.water = true; return api; },
    dry(x0, y0, x1, y1, r) { forCapsule(T, X(x0), y0, X(x1), y1, r, (i) => { T.depth[i] = 0; }); shared.water = true; return api; },
    ice(x0, y0, x1, y1, r) { forCapsule(T, X(x0), y0, X(x1), y1, r, (i) => { T.iceHp[i] = ICE_HP; }); shared.ice = true; return api; },
    paint(kind, x0, y0, x1, y1, r) {
      if (kind === 'wall' || kind === 'water' || kind === 'ice' || kind === 'hole' || kind === 'dry') return api[kind](x0, y0, x1, y1, r);
      if (kind === 'mine') { paintMines(world, X(x0), y0, X(x1), y1, r); return api; }
      if (kind === 'peel') { paintPeels(world, X(x0), y0, X(x1), y1, r); return api; }
      const k = KINDS.get(kind);
      if (k) { k.painter(world, X(x0), y0, X(x1), y1, r); shared.used.add(kind); }
      else shared.missing.add(kind);   // the kind's module isn't loaded (yet): nothing painted, the map still loads
      return api;
    },
    lava(x0, y0, x1, y1, r) { return api.paint('lava', x0, y0, x1, y1, r); },
    mud(x0, y0, x1, y1, r) { return api.paint('mud', x0, y0, x1, y1, r); },
    bridge(x0, y0, x1, y1, r) { return api.paint('bridge', x0, y0, x1, y1, r); },
    tramp(x, y) { return api.paint('tramp', x, y, x, y, 0); },
    mine(x, y) { return api.paint('mine', x, y, x, y, 1); },
    peel(x, y) { return api.paint('peel', x, y, x, y, 1); },
    // ---- props: tree / barrel (any unit type works; props are what maps want). Returns the unit or null.
    prop(type, x, y, heading = 0) { return world.spawn(type, X(x), y, { group: -1, team: -1, heading: flip ? Math.PI - heading : heading }); },
    // ---- shapes, all through the painters above (kind = 'wall' | 'water' | 'ice' | 'lava' | 'mud' | 'bridge' | ...)
    line(kind, pts, r) { for (let i = 1; i < pts.length; i++) api.paint(kind, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r); if (pts.length === 1) api.paint(kind, pts[0][0], pts[0][1], pts[0][0], pts[0][1], r); return api; },
    disc(kind, x, y, r) { return api.paint(kind, x, y, x, y, r); },
    // filled axis box (x, y = top-left), painted as horizontal strokes one tile apart
    rect(kind, x, y, w, h) { const r = WALL_TILE * 0.75; for (let yy = y + r; yy <= y + h - r + 0.01; yy += WALL_TILE) api.paint(kind, x + r, yy, x + w - r, yy, r); return api; },
    // filled ellipse
    blob(kind, cx, cy, rx, ry) { const r = WALL_TILE * 0.75; for (let yy = cy - ry + r; yy <= cy + ry - r + 0.01; yy += WALL_TILE) { const k = 1 - ((yy - cy) / ry) ** 2; if (k <= 0) continue; const hw = rx * Math.sqrt(k); api.paint(kind, cx - Math.max(0, hw - r), yy, cx + Math.max(0, hw - r), yy, r); } return api; },
    // ellipse outline of thickness th, n segments; gaps = list of [angle (rad, 0 = +x, PI/2 = down), half-width rad] left open
    ring(kind, cx, cy, rx, ry, th, gaps = [], n = 40) {
      const open = (a) => gaps.some(([g, hw]) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < hw);
      for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; if (open((a0 + a1) / 2)) continue; api.paint(kind, cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, th / 2); }
      return api;
    },
    // rectangle outline (x, y = top-left) of thickness th; gaps = list of [side 'n'|'s'|'e'|'w', centre 0..1 along the side, width px]
    box(kind, x, y, w, h, th, gaps = []) {
      const r = th / 2, sides = { n: [x, y, x + w, y], s: [x, y + h, x + w, y + h], w: [x, y, x, y + h], e: [x + w, y, x + w, y + h] };
      for (const s of ['n', 's', 'w', 'e']) {
        const [ax, ay, bx, by] = sides[s], len = Math.hypot(bx - ax, by - ay), cuts = gaps.filter((g) => g[0] === s).map((g) => [g[1] * len - g[2] / 2, g[1] * len + g[2] / 2]).sort((p, q) => p[0] - q[0]);
        let from = 0;
        for (const [c0, c1] of [...cuts, [len, len]]) { if (c0 > from) { const f0 = from / len, f1 = c0 / len; api.paint(kind, ax + (bx - ax) * f0, ay + (by - ay) * f0, ax + (bx - ax) * f1, ay + (by - ay) * f1, r); } from = Math.max(from, c1); }
      }
      return api;
    },
    // run fn(api) on this half, then again mirrored (x → W − x). Paint the middle strip once, outside mirror().
    mirror(fn) { fn(api); fn(makeApi(world, id, !flip, shared)); return api; },
    // the secret unit's hiding spot (once per map; not mirrored). look = free word the art reads (STEP7.md per map).
    secret(x, y, look = 'peek') { shared.secret = { x: X(x), y, look }; return api; },
    // decorations the art draws on the ground layer only (no sim effect): kind + where. STEP7.md lists the kinds.
    deco(kind, x, y, s = 1, a = 0) { shared.deco.push({ kind, x: X(x), y, s, a: flip ? Math.PI - a : a, f: flip ? -1 : 1 }); return api; },
  };
  return api;
}

// ATTACK L2 (11-16): a map wall that stops 1-3 tiles short of the field edge leaves a sliver a unit can be wedged in for
// good: the edge clamp pushes it in, the wall pushes it back out past the edge, every tick (a raptor sat 2 px outside
// the field in a volcano rock notch; canyon / beach / swamp rocks did the same). Walls closer than EDGE_SEAL px to an
// edge run on to the edge instead (the gap is filled). Mirrored maps stay mirrored (the gaps are mirrored too).
export const EDGE_SEAL = 32;   // px: gaps narrower than this between a map wall and the field edge are filled
function sealEdges(world) {
  const w = world.walls, C = w.cols, R = w.rows, t = w.tile, s = w.solid, W = world.W, H = world.H;
  const B = world.bridge7, planks = B !== undefined && B.cells > 0 ? B.hp : null;
  let n = 0;
  const fill = (i) => { if (s[i] === 0) { s[i] = 1; w.hp[i] = WALL_HP; w.count++; n++; } };
  const lane = (i) => planks !== null && planks[i] > 0;   // a bridge reaching the edge is a way through: leave it
  for (let ty = 0; ty < R; ty++) {
    let a = 0; while (a < C && s[ty * C + a] === 0) a++;
    if (a < C && a > 0 && a * t < EDGE_SEAL) { let ok = true; for (let x = 0; x < a; x++) if (lane(ty * C + x)) ok = false; if (ok) for (let x = 0; x < a; x++) fill(ty * C + x); }
    let b = C - 1; while (b >= 0 && s[ty * C + b] === 0) b--;
    if (b >= 0 && b < C - 1 && W - (b + 1) * t < EDGE_SEAL) { let ok = true; for (let x = b + 1; x < C; x++) if (lane(ty * C + x)) ok = false; if (ok) for (let x = b + 1; x < C; x++) fill(ty * C + x); }
  }
  for (let tx = 0; tx < C; tx++) {
    let a = 0; while (a < R && s[a * C + tx] === 0) a++;
    if (a < R && a > 0 && a * t < EDGE_SEAL) { let ok = true; for (let y = 0; y < a; y++) if (lane(y * C + tx)) ok = false; if (ok) for (let y = 0; y < a; y++) fill(y * C + tx); }
    let b = R - 1; while (b >= 0 && s[b * C + tx] === 0) b--;
    if (b >= 0 && b < R - 1 && H - (b + 1) * t < EDGE_SEAL) { let ok = true; for (let y = b + 1; y < R; y++) if (lane(y * C + tx)) ok = false; if (ok) for (let y = b + 1; y < R; y++) fill(y * C + tx); }
  }
  if (n > 0) w.version++;
  return n;
}

/**
 * Paint map `id` into a world that was just cleared. opts.secret = place the secret (false once the player found it).
 * Sets world.map = { id, ground, secret: { type, x, y, r, look } | null, deco: [...], missing: [kinds not loaded] } and
 * returns it; returns null (and leaves world.map null) for 'blank' / unknown ids.
 */
export function buildMap(world, id, opts = {}) {
  world.map = null;
  const def = getMap(id);
  if (!def) return null;
  const T = terrainOf(world);
  const shared = { rng: mulberry(hashStr(id)), water: false, ice: false, secret: null, deco: [], used: new Set(), missing: new Set() };
  // ATTACK L2 (11-16): props spawn through world.spawn, which draws world.rng (radius jitter, think offset, bravery...):
  // every load / Clear moved the battle rng and gave the map's trees new sizes (tree radius ±15 %). The build now runs
  // on its own stream (seeded by the map id) and world.rng is put back after, as the header says.
  const rng = world.rng, saved = rng && rng.getState ? rng.getState() : null;
  if (saved !== null) rng.setState(hashStr('props:' + id));
  try {
    world.mapBuilding = true; world.mapUnits = 0;   // STEP10 LEAD: mapIdx counts from 1 each build
    try { def.build(makeApi(world, id, false, shared)); sealEdges(world); }
    finally { world.mapBuilding = false; }
    if (shared.water) recountWater(world, T);
    if (shared.ice) recountIce(world, T);
    for (const kind of shared.used) { const k = KINDS.get(kind); if (k && k.after) k.after(world); }
    world.syncGrid();
  } finally { if (saved !== null) rng.setState(saved); }
  const type = MAP_SECRET[id];
  const s = shared.secret && opts.secret !== false && type ? { type, x: shared.secret.x, y: shared.secret.y, r: SECRET_TAP, look: shared.secret.look } : null;
  world.map = { id, ground: def.ground || 'grass', secret: s, deco: shared.deco, missing: [...shared.missing] };
  world.mapVersion = (world.mapVersion || 0) + 1;
  return world.map;
}

/** The hiding spot under world (x, y) with a finger of radius r, or null. */
export function secretAt(world, x, y, r = 0) {
  const s = world.map && world.map.secret;
  if (!s) return null;
  return Math.hypot(x - s.x, y - s.y) <= s.r + r ? s : null;
}

// Map files register themselves on import (MAPS agent). A missing file just leaves that map out of the list.
function missing(e) { return /ERR_MODULE_NOT_FOUND|Cannot find module|Failed to fetch|error loading dynamically imported module|404|Importing a module script failed/i.test(String((e && (e.code + ' ' + e.message)) || e)); }
// STEP7 MAPS: a map file can't import registerMap from here (it waits on this file's top-level await, which waits on
// it: Node exits / the page never boots), so each map file default-exports its def and is registered here.
await Promise.all(MAP_ORDER.map((id) => import(`./${id}.js`).then((m) => { if (m && m.default && m.default.id) registerMap(m.default); }).catch((e) => { if (!missing(e)) console.error('[maps] failed to load', id, e); })));
