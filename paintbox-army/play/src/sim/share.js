// Share codes (OURS, Part 2 step 10, PLAN.md decision G: text codes, no server). Owner: LEAD.
// A code is plain text a player copies into a chat (WeChat, Discord...) and a friend pastes back into the game:
//   battle    the field as it is now: its map, Team battle on/off, every painted unit still standing (type, place,
//             facing, team, stroke group), the terrain painted on top of the map (or taken off it), and the recipes of
//             any made units on it
//   unit      one made unit's recipe (the maker's cleanRecipe makes any junk into a working unit)
//   campaign  a campaign battle: the level id + the army the player painted on their half
// Fields differ per screen (the world is CAM.WORLD x the screen at boot), so places are fractions of the field and the
// terrain grids are resampled onto the new field; on the same screen size it is the same field to the pixel (tile).
// A map's own terrain and props are never in the code: the map is built again on the new field and only what the
// player changed on it (painted, erased, broke) is stored, as a difference against a fresh copy of the map.
//
// Text: 'PBA' + base62 (0-9 A-Z a-z only: nothing a chat app turns into an emoji, a link or a full-width sign).
// Inside: a length, a CRC32 (a code cut short or mangled says so instead of loading half a battle) and the payload,
// deflated (zlib 'deflate': Chrome 80+, Safari 16.4+, Node 18) when the browser can. Reading skips anything that isn't one of the 62 letters (line breaks a chat adds,
// spaces, zero-width marks) and stops after the length it read, so text before or after the code doesn't matter.
//
// API:  captureBattle(game, opts) -> data · captureCampaign(game, levelId, opts) -> data · unitData(recipe) -> data
//       encode(data) -> Promise<text> · decode(text) -> Promise<data> (throws ShareError 'none' | 'broken' | 'new')
//       applyBattle(game, data, { typeOf }) -> { placed, skipped } (the UI has loaded data.map + Team switch first)
//       placeUnits(game, units, { typeOf }) -> { placed, skipped } (through game.place: a campaign budget holds)
//       findCode(text) -> true when the text holds something that starts like a code
import { getDef } from './defs.js';
import { World } from './world.js';
import { WET, TAU } from './const.js';
import { terrainOf, recountWater, recountIce, FULL, ICE_HP } from './terrain/grid.js';
import { paintWall } from './terrain/wall.js';
import { paintMines, eraseMines } from './terrain/mines.js';
import { paintPeels, erasePeels } from './terrain/peels.js';
import { paintLava, afterMap as lavaAfter } from './terrain/lava.js';
import { paintMud } from './terrain/mud.js';
import { paintBridge, bridgeOf } from './terrain/bridge.js';
import { mapTramp, eraseTramp, PAD } from './terrain/tramp.js';
import * as MAPS from './maps/index.js';

const T = {
  PREFIX: 'PBA',      // every code starts with this (Paintbox Army)
  FORMAT: 1,          // payload format; a newer one -> ShareError 'new' (update the game)
  Q: 4096,            // unit places: steps per field width / height (2679 px wide desk field: 0.65 px a step)
  QP: 65535,          // terrain points (mines, peels, pads) and removed map props: steps per field side
  TILE: 8,            // px: terrain grid tile (walls, water, ice, lava, mud, bridges: terrain/grid.js TILE)
  MATCH: 1.5,         // px: a point this close to one of the fresh map's is that map point (kept)
  FIND: 24,           // px on the new field: a removed map point / prop is the nearest map one within this
  ANG: 64,            // bridge plank angle steps per turn
  MAX_TEXT: 200000,   // letters read at most (a paste of a whole chat log stops here)
};
const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KIND = { battle: 1, unit: 2, campaign: 3 };
const KIND_NAME = ['', 'battle', 'unit', 'campaign'];
// terrain kinds in the code (codes keep these numbers forever: add new kinds at the end)
const GRIDS = ['wall', 'water', 'ice', 'lava', 'mud', 'bridge'];
const POINTS = ['mine', 'peel', 'tramp'];
const KIND_CODE = { wall: 1, water: 2, ice: 3, lava: 4, mud: 5, bridge: 6, mine: 7, peel: 8, tramp: 9 };
const CODE_KIND = Object.fromEntries(Object.entries(KIND_CODE).map(([k, v]) => [v, k]));

export class ShareError extends Error { constructor(code) { super('share: ' + code); this.code = code; } }

// ---------------------------------------------------------------- bytes
class Out {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); }
  u16(v) { this.a.push(v & 255, (v >>> 8) & 255); }
  uv(v) { v = Math.max(0, Math.floor(v)); while (v >= 128) { this.a.push((v % 128) | 128); v = Math.floor(v / 128); } this.a.push(v); }
  sv(v) { this.uv(v < 0 ? -2 * v - 1 : 2 * v); }
  str(s) { const b = new TextEncoder().encode(String(s)); this.uv(b.length); for (const x of b) this.a.push(x); }
  bytes() { return Uint8Array.from(this.a); }
}
class In {
  constructor(b) { this.b = b; this.i = 0; }
  need(n) { if (this.i + n > this.b.length) throw new ShareError('broken'); }
  u8() { this.need(1); return this.b[this.i++]; }
  u16() { this.need(2); const v = this.b[this.i] | (this.b[this.i + 1] << 8); this.i += 2; return v; }
  uv() { let v = 0, m = 1; for (let k = 0; k < 8; k++) { const x = this.u8(); v += (x & 127) * m; if (x < 128) return v; m *= 128; } throw new ShareError('broken'); }
  sv() { const v = this.uv(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  str() { const n = this.uv(); this.need(n); const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + n)); this.i += n; return s; }
  count(max) { const n = this.uv(); if (n > max) throw new ShareError('broken'); return n; }
}
let CRC = null;
function crc32(b) {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
async function pipe(bytes, Stream, mode) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream(mode));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// base62 in blocks: 4 bytes -> 6 letters (62^6 > 2^32). First block = the byte length.
function toText(bytes) {
  const n = bytes.length, blocks = [n], out = [T.PREFIX];
  for (let i = 0; i < n; i += 4) blocks.push(((bytes[i] << 24) >>> 0) + ((bytes[i + 1] || 0) << 16) + ((bytes[i + 2] || 0) << 8) + (bytes[i + 3] || 0));
  for (let v of blocks) { let s = ''; for (let k = 0; k < 6; k++) { s = ALPHA[v % 62] + s; v = Math.floor(v / 62); } out.push(s); }
  return out.join('');
}
const VAL = new Int16Array(128).fill(-1); for (let i = 0; i < 62; i++) VAL[ALPHA.charCodeAt(i)] = i;
// the letters after `at`, chat noise skipped, until `want` letters (or the end)
function letters(text, at, want) {
  const out = [];
  for (let i = at; i < text.length && out.length < want && i - at < T.MAX_TEXT; i++) { const c = text.charCodeAt(i); if (c < 128 && VAL[c] >= 0) out.push(VAL[c]); }
  return out;
}
function block(ls, k) { let v = 0; for (let j = 0; j < 6; j++) v = v * 62 + ls[k * 6 + j]; return v; }
function fromText(text, at) {
  const head = letters(text, at, 6);
  if (head.length < 6) throw new ShareError('broken');
  const n = block(head, 0);
  if (n < 6 || n > 4 * T.MAX_TEXT / 6) throw new ShareError('broken');
  const ls = letters(text, at, 6 + Math.ceil(n / 4) * 6);
  if (ls.length < 6 + Math.ceil(n / 4) * 6) throw new ShareError('broken');
  const out = new Uint8Array(Math.ceil(n / 4) * 4);
  for (let k = 0; k < out.length / 4; k++) {
    const v = block(ls, k + 1);
    if (v > 0xffffffff) throw new ShareError('broken');
    out[4 * k] = v >>> 24; out[4 * k + 1] = (v >>> 16) & 255; out[4 * k + 2] = (v >>> 8) & 255; out[4 * k + 3] = v & 255;
  }
  return out.subarray(0, n);
}
/** Does the text hold something that starts like a code? (the paste box loads as soon as it does) */
export function findCode(text) { return typeof text === 'string' && text.indexOf(T.PREFIX) >= 0; }

// ---------------------------------------------------------------- data -> bytes -> text
export async function encode(data) {
  const o = new Out();
  o.u8(T.FORMAT); o.u8(KIND[data.kind]);
  if (data.kind === 'unit') o.str(JSON.stringify(data.recipe));
  else {
    if (data.kind === 'campaign') o.str(data.level);
    o.uv(data.W); o.uv(data.H);
    if (data.kind === 'battle') { o.str(data.map || ''); o.u8(data.team ? 1 : 0); }
    writeRecipes(o, data.recipes || []);
    const types = typeTable(data);
    o.uv(types.length); for (const tp of types) o.str(tp);
    writeUnits(o, data.units, types);
    if (data.kind === 'battle') { writeTerrain(o, data.terrain || {}); writeGone(o, data.mapGone || [], types); }
  }
  const raw = o.bytes(), zip = canZip() && raw.length > 48;
  const body = zip ? await pipe(raw, CompressionStream, 'deflate') : raw;
  const crc = crc32(raw), all = new Uint8Array(5 + body.length);
  all[0] = zip ? 1 : 0; all[1] = crc >>> 24; all[2] = (crc >>> 16) & 255; all[3] = (crc >>> 8) & 255; all[4] = crc & 255;
  all.set(body, 5);
  return toText(all);
}
/** text (anything pasted) -> data. Tries every 'PBA' in the text; the first one that reads wins. */
export async function decode(text) {
  if (typeof text !== 'string') throw new ShareError('none');
  let at = text.indexOf(T.PREFIX), err = new ShareError('none');
  while (at >= 0) {
    try { return await decodeAt(text, at + T.PREFIX.length); }
    catch (e) { const x = e instanceof ShareError ? e : new ShareError('broken'); if (x.code === 'new' || err.code === 'none') err = x; }   // 'new' beats 'broken' beats 'none'
    at = text.indexOf(T.PREFIX, at + 1);
  }
  throw err;
}
async function decodeAt(text, at) {
  const all = fromText(text, at);
  if (all.length < 6) throw new ShareError('broken');
  const crc = ((all[1] << 24) >>> 0) + (all[2] << 16) + (all[3] << 8) + all[4];
  let raw;
  if (all[0] === 1) { if (!canZip()) throw new ShareError('new'); try { raw = await pipe(all.subarray(5), DecompressionStream, 'deflate'); } catch (e) { throw new ShareError('broken'); } }
  else if (all[0] === 0) raw = all.subarray(5);
  else throw new ShareError('broken');
  if (crc32(raw) !== crc) throw new ShareError('broken');
  const r = new In(raw), fmt = r.u8();
  if (fmt > T.FORMAT) throw new ShareError('new');
  if (fmt < 1) throw new ShareError('broken');
  const kind = KIND_NAME[r.u8()];
  if (!kind) throw new ShareError('new');
  if (kind === 'unit') { let recipe; try { recipe = JSON.parse(r.str()); } catch (e) { throw new ShareError('broken'); } return { kind, recipe }; }
  const data = { kind };
  if (kind === 'campaign') data.level = r.str();
  data.W = r.uv(); data.H = r.uv();
  if (!(data.W > 0 && data.H > 0 && data.W < 1e5 && data.H < 1e5)) throw new ShareError('broken');
  if (kind === 'battle') { data.map = r.str() || null; data.team = (r.u8() & 1) === 1; }
  data.recipes = readRecipes(r);
  const nt = r.count(4096), types = []; for (let k = 0; k < nt; k++) types.push(r.str());
  data.units = readUnits(r, types);
  if (kind === 'battle') { data.terrain = readTerrain(r, data.W, data.H); data.mapGone = readGone(r, types); }
  return data;
}

function writeRecipes(o, list) { o.uv(list.length); for (const { type, recipe } of list) { o.str(type); o.str(JSON.stringify(recipe)); } }
function readRecipes(r) {
  const n = r.count(64), out = [];
  for (let k = 0; k < n; k++) { const type = r.str(); let recipe; try { recipe = JSON.parse(r.str()); } catch (e) { throw new ShareError('broken'); } out.push({ type, recipe }); }
  return out;
}
function typeTable(data) {
  const s = new Set(); for (const u of data.units) s.add(u.type); for (const g of data.mapGone || []) s.add(g.type);
  return [...s];
}
// units: columns (type, team, group, facing) then places as steps from the one before (units of a stroke sit close)
function writeUnits(o, units, types) {
  const ti = new Map(types.map((t, i) => [t, i]));
  const list = units.slice().sort((a, b) => a.g - b.g || a.y - b.y || a.x - b.x);
  o.uv(list.length);
  for (const u of list) o.uv(ti.get(u.type));
  for (const u of list) o.u8(u.team === 0 ? 0 : u.team === 1 ? 1 : 2);
  for (const u of list) o.uv(u.g);
  for (const u of list) o.u8(Math.round(((u.h % TAU) + TAU) % TAU / TAU * 256) & 255);
  let px = 0, py = 0;
  for (const u of list) { const qx = q(u.x, T.Q), qy = q(u.y, T.Q); o.sv(qx - px); o.sv(qy - py); px = qx; py = qy; }
}
function readUnits(r, types) {
  const n = r.count(20000), list = [];
  for (let k = 0; k < n; k++) { const t = r.uv(); if (t >= types.length) throw new ShareError('broken'); list.push({ type: types[t], x: 0, y: 0, h: 0, team: -1, g: 0 }); }
  for (const u of list) { const v = r.u8(); u.team = v === 0 ? 0 : v === 1 ? 1 : -1; }
  for (const u of list) u.g = r.uv();
  for (const u of list) u.h = (r.u8() / 256) * TAU;
  let px = 0, py = 0;
  for (const u of list) { px += r.sv(); py += r.sv(); u.x = px / T.Q; u.y = py / T.Q; }
  return list;
}
const q = (f, n) => Math.max(0, Math.min(n, Math.round(f * n)));
// terrain: per kind, the tiles added and the tiles taken off (runs along rows) or the points added and taken off
function writeTerrain(o, ter) {
  const kinds = [...GRIDS, ...POINTS].filter((k) => ter[k] && (ter[k].add.length || ter[k].rem.length));
  o.uv(kinds.length);
  for (const k of kinds) {
    o.u8(KIND_CODE[k]);
    const d = ter[k];
    if (GRIDS.includes(k)) { writeRuns(o, d.add, k === 'bridge'); writeRuns(o, d.rem, false); }
    else { writePts(o, d.add); writePts(o, d.rem); }
  }
}
function writeRuns(o, runs, ang) { o.uv(runs.length); let end = 0; for (const r of runs) { o.uv(r.i - end); o.uv(r.n - 1); if (ang) o.u8(r.a); end = r.i + r.n; } }
function writePts(o, pts) { o.uv(pts.length); for (const p of pts) { o.u16(q(p.x, T.QP)); o.u16(q(p.y, T.QP)); } }
function readTerrain(r, W, H) {
  const cells = Math.ceil(W / T.TILE) * Math.ceil(H / T.TILE), n = r.count(32), ter = {};
  for (let k = 0; k < n; k++) {
    const kind = CODE_KIND[r.u8()];
    if (!kind) throw new ShareError('new');
    if (GRIDS.includes(kind)) ter[kind] = { add: readRuns(r, kind === 'bridge', cells), rem: readRuns(r, false, cells) };
    else ter[kind] = { add: readPts(r), rem: readPts(r) };
  }
  return ter;
}
function readRuns(r, ang, cells) {
  const n = r.count(cells), out = []; let end = 0;
  for (let k = 0; k < n; k++) { const i = end + r.uv(), len = r.uv() + 1; if (i + len > cells) throw new ShareError('broken'); out.push({ i, n: len, a: ang ? r.u8() : 0 }); end = i + len; }
  return out;
}
function readPts(r) { const n = r.count(8192), out = []; for (let k = 0; k < n; k++) out.push({ x: r.u16() / T.QP, y: r.u16() / T.QP }); return out; }
function writeGone(o, gone, types) { const ti = new Map(types.map((t, i) => [t, i])); o.uv(gone.length); for (const g of gone) { o.uv(ti.get(g.type)); o.u16(q(g.x, T.QP)); o.u16(q(g.y, T.QP)); } }
function readGone(r, types) {
  const n = r.count(4096), out = [];
  for (let k = 0; k < n; k++) { const t = r.uv(); if (t >= types.length) throw new ShareError('broken'); out.push({ type: types[t], x: r.u16() / T.QP, y: r.u16() / T.QP }); }
  return out;
}

// ---------------------------------------------------------------- the field -> data
/** opts: { recipeOf(type) -> recipe | null } (sim/maker/index.js) for made units on the field. */
export function captureBattle(game, opts = {}) {
  const w = game.world, mapId = game.mapId || null;
  const units = captureUnits(w, () => true, opts);
  const base = baseOf(mapId, w.W, w.H);
  const now = snapshot(w);
  const terrain = {};
  for (const k of GRIDS) terrain[k] = gridDiff(now[k], base[k], k === 'bridge' ? now.bridgeAng : null);
  for (const k of POINTS) terrain[k] = pointDiff(now[k], base[k], w.W, w.H);
  // map props (trees, barrels) that are gone: the map makes the rest again
  const have = new Set(); for (const u of w.units) if (!u.dead && u.mapIdx > 0) have.add(u.mapIdx);
  const mapGone = base.props.filter((p) => !have.has(p.idx)).map((p) => ({ type: p.type, x: p.x / w.W, y: p.y / w.H }));
  return { kind: 'battle', W: Math.round(w.W), H: Math.round(w.H), map: mapId, team: !!w.teamMode, recipes: units.recipes, units: units.list, terrain, mapGone };
}
/** A campaign battle: the level + the player's own painted army (team `team`). */
export function captureCampaign(game, level, team, opts = {}) {
  const w = game.world, units = captureUnits(w, (u) => u.team === team, opts);
  return { kind: 'campaign', level, W: Math.round(w.W), H: Math.round(w.H), recipes: units.recipes, units: units.list };
}
export function unitData(recipe) { const r = { ...recipe }; delete r.id; return { kind: 'unit', recipe: r }; }

// Units a code keeps: alive, painted (not a crew member / rider its maker spawns again, not a map prop the map makes
// again, not something only a unit makes: risen dead, raised skeletons), not swallowed.
function keep(u) { return !u.dead && !u.removed && u.hp > 0 && u.kid !== 1 && !(u.mapIdx > 0) && !(u.inside >= 0) && u.def && (u.def.paintable || u.type.startsWith('mine_')); }
function captureUnits(w, also, opts) {
  const list = [], groups = new Map(), recipes = new Map();
  for (const u of w.units) {
    if (!keep(u) || !also(u)) continue;
    if (u.type.startsWith('mine_')) {
      const r = opts.recipeOf ? opts.recipeOf(u.type) : null;
      if (!r) continue;
      if (!recipes.has(u.type)) { const c = { ...r }; delete c.id; recipes.set(u.type, c); }
    }
    let g = 0;
    if (u.group >= 0) { const key = u.group * 4 + (u.team + 1); g = groups.get(key); if (g === undefined) { g = groups.size + 1; groups.set(key, g); } }
    list.push({ type: u.type, x: u.x / w.W, y: u.y / w.H, h: u.heading, team: w.teamMode ? u.team : -1, g });
  }
  return { list, recipes: [...recipes].map(([type, recipe]) => ({ type, recipe })) };
}

// The terrain + props of a fresh map at this field size (null map = the empty field), kept per (map, W, H).
const BASES = new Map();
function baseOf(mapId, W, H) {
  const key = (mapId || '') + '|' + W + 'x' + H;
  let b = BASES.get(key);
  if (b) return b;
  const s = new World({ W, H, seed: 1 });
  if (mapId && MAPS.getMap(mapId)) MAPS.buildMap(s, mapId, { secret: false });
  b = snapshot(s);
  b.props = s.units.filter((u) => !u.dead && u.mapIdx > 0).map((u) => ({ idx: u.mapIdx, type: u.type, x: u.x, y: u.y }));
  if (BASES.size > 12) BASES.clear();
  BASES.set(key, b);
  return b;
}
// grids as 0/1 per tile, points as lists
function snapshot(w) {
  const n = w.walls.cols * w.walls.rows, Tg = terrainOf(w);
  const grid = (src, test) => { const g = new Uint8Array(n); if (src && src.length === n) for (let i = 0; i < n; i++) if (test(src[i])) g[i] = 1; return g; };
  const B = w.bridge7 !== undefined && w.bridge7.hp.length === n ? w.bridge7 : null;
  const bridgeAng = new Uint8Array(n);
  if (B) for (let i = 0; i < n; i++) if (B.hp[i] > 0) bridgeAng[i] = Math.round(((B.ang[i] % TAU) + TAU) % TAU / TAU * T.ANG) % T.ANG;
  const pts = (P, ok) => { const out = []; if (P) for (let k = 0; k < P.high; k++) if (ok(P, k)) out.push({ x: P.x[k], y: P.y[k] }); return out; };
  return {
    wall: grid(w.walls.solid, (v) => v === 1),
    water: grid(Tg.depth, (v) => v >= WET),
    ice: grid(Tg.iceHp, (v) => v > 0),
    lava: grid(w.lava7 !== undefined ? w.lava7.grid : null, (v) => v === 1),
    mud: grid(w.mud7 !== undefined ? w.mud7.grid : null, (v) => v === 1),
    bridge: grid(B ? B.hp : null, (v) => v > 0),
    bridgeAng,
    mine: pts(w.mines && w.mines.alive ? w.mines : null, (P, k) => P.alive[k] === 1),
    peel: pts(w.peels && w.peels.alive ? w.peels : null, (P, k) => P.alive[k] === 1),
    tramp: pts(w.tramp7, (P, k) => P.state[k] === PAD.OK),
  };
}
// runs of tiles where now is set and base isn't (add) / base is set and now isn't (rem); bridge runs split by angle
function gridDiff(now, base, ang) {
  const add = [], rem = [], n = now.length;
  for (const [list, a, b, angs] of [[add, now, base, ang], [rem, base, now, null]]) {
    let i = 0;
    while (i < n) {
      if (!(a[i] === 1 && b[i] !== 1)) { i++; continue; }
      const s = i, av = angs ? angs[i] : 0;
      while (i < n && a[i] === 1 && b[i] !== 1 && (!angs || angs[i] === av)) i++;
      list.push({ i: s, n: i - s, a: av });
    }
  }
  return { add, rem };
}
function pointDiff(now, base, W, H) {
  const m2 = T.MATCH * T.MATCH, used = new Uint8Array(base.length), add = [];
  for (const p of now) {
    let hit = -1;
    for (let k = 0; k < base.length; k++) if (!used[k] && (base[k].x - p.x) ** 2 + (base[k].y - p.y) ** 2 <= m2) { hit = k; break; }
    if (hit >= 0) used[hit] = 1; else add.push({ x: p.x / W, y: p.y / H });
  }
  const rem = []; for (let k = 0; k < base.length; k++) if (!used[k]) rem.push({ x: base[k].x / W, y: base[k].y / H });
  return { add, rem };
}

// ---------------------------------------------------------------- data -> the field
/** The UI has already loaded data.map (game.loadMap: a fresh map, field cleared) and set the Team switch.
 *  opts.typeOf(type) -> the type to paint here (a made unit gets its new Mine id), or null to leave it out. */
export function applyBattle(game, data, opts = {}) {
  const w = game.world;
  // map props the player had taken off
  for (const g of data.mapGone || []) {
    const x = g.x * w.W, y = g.y * w.H;
    let best = null, bd = T.FIND * T.FIND;
    for (const u of w.units) if (!u.dead && u.mapIdx > 0 && u.type === g.type) { const d = (u.x - x) ** 2 + (u.y - y) ** 2; if (d < bd) { bd = d; best = u; } }
    if (best) { if (best.group >= 0) w.groups.leave(best.group); w.remove(best); }
  }
  applyTerrain(w, data.terrain || {}, data.W, data.H);
  const r = placeUnits(game, data.units, opts);
  w.syncGrid();
  return r;
}
/** Paint the units at their places (fractions of the field) through game.place: one group per stroke group. */
export function placeUnits(game, units, opts = {}) {
  const w = game.world, typeOf = opts.typeOf || ((t) => t), groups = new Map();
  let placed = 0, skipped = 0;
  for (const s of units) {
    const type = typeOf(s.type);
    if (!type || !getDef(type)) { skipped++; continue; }
    const x = s.x * w.W, y = s.y * w.H, team = w.teamMode ? (s.team === 0 || s.team === 1 ? s.team : w.teamAt(x)) : -1;
    let g = -1;
    if (s.g > 0) {
      const key = s.g * 4 + team + 1;
      g = groups.get(key);
      if (g === undefined) { g = w.createGroup(type, team); groups.set(key, g); }
    }
    const u = game.place(type, x, y, { heading: s.h, team, group: g });
    if (u) placed++; else skipped++;
  }
  for (const g of groups.values()) if (g >= 0) w.releaseGroup(g);
  return { placed, skipped };
}
// Source tiles -> this field's tiles (nearest), then each kind through its own painter (counts, versions and the
// derived grids stay right). Runs along a row paint as one capsule of radius 0 (= half a tile: that row only).
function applyTerrain(w, ter, sW, sH) {
  const cols = w.walls.cols, rows = w.walls.rows, n = cols * rows;
  const sc = Math.ceil(sW / T.TILE), sr = Math.ceil(sH / T.TILE);
  const mapX = new Int32Array(cols), mapY = new Int32Array(rows);
  for (let x = 0; x < cols; x++) mapX[x] = Math.min(sc - 1, Math.floor(((x + 0.5) * sc) / cols));
  for (let y = 0; y < rows; y++) mapY[y] = Math.min(sr - 1, Math.floor(((y + 0.5) * sr) / rows));
  const resample = (runs, withAng) => {   // source runs -> dest mask (0 none, else 1 + angle)
    if (!runs || runs.length === 0) return null;
    const src = new Uint8Array(sc * sr);
    for (const r of runs) src.fill(withAng ? 1 + r.a : 1, r.i, r.i + r.n);
    const out = new Uint8Array(n); let any = 0;
    for (let y = 0; y < rows; y++) { const so = mapY[y] * sc, o = y * cols; for (let x = 0; x < cols; x++) { const v = src[so + mapX[x]]; if (v) { out[o + x] = v; any = 1; } } }
    return any ? out : null;
  };
  const forRuns = (mask, fn) => {   // fn(x0, y, x1, value) in px, per run of equal values along a row
    for (let y = 0; y < rows; y++) {
      const o = y * cols, cy = (y + 0.5) * T.TILE;
      let x = 0;
      while (x < cols) { const v = mask[o + x]; if (!v) { x++; continue; } const s = x; while (x < cols && mask[o + x] === v) x++; fn((s + 0.5) * T.TILE, cy, (x - 0.5) * T.TILE, v); }
    }
  };
  const Tg = terrainOf(w);
  for (const kind of GRIDS) {
    const d = ter[kind]; if (!d) continue;
    for (const [runs, on] of [[d.rem, false], [d.add, true]]) {
      const mask = resample(runs, kind === 'bridge' && on);
      if (!mask) continue;
      if (kind === 'wall') forRuns(mask, (x0, y, x1) => paintWall(w, x0, y, x1, y, 0, on));
      else if (kind === 'water') { for (let i = 0; i < n; i++) if (mask[i]) Tg.depth[i] = on ? FULL : 0; recountWater(w, Tg); }
      else if (kind === 'ice') { for (let i = 0; i < n; i++) if (mask[i]) Tg.iceHp[i] = on ? ICE_HP : 0; recountIce(w, Tg); }
      else if (kind === 'lava') forRuns(mask, (x0, y, x1) => paintLava(w, x0, y, x1, y, 0, !on));
      else if (kind === 'mud') forRuns(mask, (x0, y, x1) => paintMud(w, x0, y, x1, y, 0, !on));
      else if (kind === 'bridge') {
        forRuns(mask, (x0, y, x1) => paintBridge(w, x0, y, x1, y, 0, !on));
        if (on) { const B = bridgeOf(w); for (let i = 0; i < n; i++) if (mask[i] && B.hp[i] > 0) B.ang[i] = ((mask[i] - 1) / T.ANG) * TAU; B.version++; }
      }
    }
  }
  if (ter.lava && w.lava7 !== undefined && w.lava7.cells > 0) lavaAfter(w);
  // points: the map's own ones that were taken off, then the added ones (each through its brush at one point)
  const PT = {
    mine: { list: () => w.mines, ok: (P, k) => P.alive[k] === 1, erase: (x, y) => eraseMines(w, x, y, x, y, 0.5), add: (x, y) => paintMines(w, x, y, x, y, 0) },
    peel: { list: () => w.peels, ok: (P, k) => P.alive[k] === 1, erase: (x, y) => erasePeels(w, x, y, x, y, 0.5), add: (x, y) => paintPeels(w, x, y, x, y, 0) },
    tramp: { list: () => w.tramp7, ok: (P, k) => P.state[k] === PAD.OK, erase: (x, y) => eraseTramp(w, x, y, x, y, 0.5), add: (x, y) => mapTramp(w, x, y) },   // map spacing 30 px: a stroke's pads sit 40 apart, and the 4096-step places may land a hair under 40
  };
  for (const kind of POINTS) {
    const d = ter[kind]; if (!d) continue;
    const S = PT[kind];
    for (const p of d.rem) {
      const P = S.list(); if (!P || !P.x) break;
      const x = p.x * w.W, y = p.y * w.H; let best = -1, bd = T.FIND * T.FIND;
      for (let k = 0; k < P.high; k++) if (S.ok(P, k)) { const dd = (P.x[k] - x) ** 2 + (P.y[k] - y) ** 2; if (dd < bd) { bd = dd; best = k; } }
      if (best >= 0) S.erase(P.x[best], P.y[best]);
    }
    for (const p of d.add) S.add(p.x * w.W, p.y * w.H);
  }
}
export const SHARE_T = T;
