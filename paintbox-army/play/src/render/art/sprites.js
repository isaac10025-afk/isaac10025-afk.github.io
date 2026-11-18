// Sprite registry + bake cache + atlas for the POSTER PAINT renderer. Owner: RENDER. Contract: ART.md.
// - Merges SPRITES from sprites-army.js / sprites-animals.js / sprites-myth.js. Each module is imported on its own: a
//   module that is missing or throws, or a type nobody paints yet, falls back to a painted blob in the type's own colour.
// - Bakes lazily at DEVICE resolution (view.scale x entry.scale device px per sprite px) on a CPU canvas (thousands of
//   small strokes are much faster there), then copies the result once into a GPU atlas page. A frame only drawImage()s
//   sub-rects of the atlas pages. A dpr change (view.scale) flushes everything and re-bakes on demand.
// - Bakes are spread over frames: pump(ms) bakes from the queue until the budget is used. Wanted-now keys go first,
//   prewarm keys after. A key that is not baked yet draws a fallback (any baked frame of the same type).
// - Mirrors are never cached: index.js flips with a negative-scale transform.
// - Named "bits" (effects, terrain pieces, decals) use the same atlas: defineBit() + bit().
import { C, TEAM_COL, TAU, rng, hash, M0, tooth, canvas as cpuCanvas, part, ring, dab, brush, tube, poly, tone } from './paint.js';
import { bodyDef } from '../../ui/tools.js';
import { pageCanvas, stored } from './gpu.js';
import { MINE } from './mine-hooks.js';   // STEP8 (lead): made units' entries come from ART-BODY's factory

// ---------------------------------------------------------------- sprite modules (defensive)
const MODS = ['./sprites-army.js', './sprites-animals.js', './sprites-myth.js', './sprites-dinos.js', './sprites-siege.js', './sprites-pirates.js',
  './sprites-robots.js', './sprites-space.js', './sprites-ocean.js', './sprites-sports.js', './sprites-bugs.js', './sprites-bosses.js', './sprites-secret.js',   // step 6, step 7 secret
  // STEP8 (lead): unit maker art. sprites-mine.js = made bodies (MINE.entry), gear-*.js = weapons / ability gear + icons,
  // fx-mine-*.js = the sim agents' own projectile art (PROJ) and per-frame extras (mine-hooks.js OVER).
  './sprites-mine.js', './gear-weapons.js', './gear-abilities.js', './fx-mine-gun.js', './fx-mine-throw.js', './fx-mine-melee.js',
  './fx-mine-body.js', './fx-mine-move.js', './fx-mine-act1.js', './fx-mine-act2.js', './fx-mine-support.js'];
export const loadErrors = [];
const SRC = {}, SRC_MOD = {};
// PROJ (OURS, step 4): projectile art from a sprite module, keyed by projectile kind (sim registerProjectileKind):
//   { box: [w, h, ax, ay], n: variants (default 2), paint(c, R, v, M), scale?: 1, lift?: px above ground (default 8),
//     spin?: rad/s (else faces its flight), shadow?: size (draws a ground shadow, lifted by p.z), boil?: variants swap at 8 fps,
//     ground?: true = drawn under the units (lava, puddles, floor clouds; step 6),
//     draw?(p, x, y, ang, rt, i, api) -> true = drew it yourself; api = { put, bit, shadowAt, sprite } (sprite = this kind's bit handle) }
export const PROJ_SRC = {};
const loaded = await Promise.allSettled(MODS.map((p) => import(p)));
loaded.forEach((r, i) => {
  if (r.status === 'fulfilled') {
    const S0 = r.value && r.value.SPRITES; if (S0 && typeof S0 === 'object') for (const t in S0) { SRC[t] = S0[t]; SRC_MOD[t] = i; }
    const P0 = r.value && r.value.PROJ; if (P0 && typeof P0 === 'object') for (const k in P0) PROJ_SRC[k] = P0[k];   // OURS (step 4)
  }
  else if (/(sprites-(dinos|siege|pirates|robots|space|ocean|sports|bugs|bosses|secret|mine)|gear-[a-z]+|fx-mine-[a-z0-9]+)\.js$/.test(MODS[i]) && /Failed to fetch|404|Cannot find|ERR_MODULE_NOT_FOUND|error loading dynamically/i.test(String(r.reason && (r.reason.code + ' ' + r.reason.message)))) { /* not written yet */ }
  else { loadErrors.push(MODS[i] + ': ' + (r.reason && r.reason.message)); console.warn('art: sprite module failed', MODS[i], r.reason); }
});

// Own colours (ART.md colour table), used by the fallback blob and the brush ring until a module paints the type.
export const OWN = {
  rifle: '#1f57d8', flamer: '#ff8a12', sniper: '#55606e', legion: '#e3241a', grenadier: '#8b5a2b', archer: '#0f9c8c',
  cavalry: '#ffd51e', knight: '#ffd51e', horse: '#8b5a2b', ninja: '#26222e',
  boar: '#8b5a2b', rat: '#8f9296', ant: '#3a2a22', soldierant: '#7a2e1c', anthill: '#9c6b3c', ape: '#3b2a20', apecav: '#3b2a20',
  gator: '#3f9c4a', piranha: '#e85a7a', snake: '#9ac21f', cheetah: C.cheetah, frog: '#6cbf4a',
  zombie: '#7d6a9e', slime: '#7ee0c8', mage: '#8d4fd6', giant: '#c47a3a', dragon: '#d23b66', necro: '#2a2140', skeleton: C.white,
  tree: C.leaf, barrel: C.brown,
};

// ---------------------------------------------------------------- fallback blob painters
function blobEntry(type) {
  const d = bodyDef(type), r = d ? d.radius : 8;
  if (type === 'tree') return {
    box: [40, 54, 20, 50], scale: Math.max(0.6, r / 9), own: C.leaf, poses: ['idle'], lie: 'none', _blob: true,
    paint(c, o) {
      const R = o.R, M = o.M, burnt = !!o.dead;
      tube(c, [[0, 0], [0.8, -10], [0, -21]], 3.6, burnt ? C.char : C.brown, R, 1.3);
      const crown = ring(0, -30, 13.4, 12.2, R, 0.1, 11);
      part(c, crown, burnt ? C.charL : C.leaf, M, { vary: 0.14, sp: 1.1 });
      if (!burnt) for (let i = 0; i < 5; i++) { const a = R() * TAU, dd = R() * 7, x = Math.cos(a) * dd, y = -30 + Math.sin(a) * dd * 0.8; brush(c, [[x - 2.5, y + 1], [x - 1, y - 2], [x + 1.5, y - 1.4], [x + 3.2, y + 0.6]], 1.3, i % 2 ? C.leafL : C.leafD, R, { bristles: 2, dry: 0.2 }); }
    },
  };
  if (type === 'barrel') return {
    box: [26, 30, 13, 27], scale: Math.max(0.6, r / 9.9), own: C.brown, poses: ['idle'], lie: 'none', _blob: true,
    paint(c, o) {
      const R = o.R, M = o.M, col = o.dead ? C.char : C.brown;
      part(c, poly([[-7, -1], [-8.4, -9], [-7.4, -18], [7.4, -18], [8.4, -9], [7, -1]], R, 0.3), col, M);
      for (const y of [-5, -13.5]) brush(c, [[-8.2, y], [8.2, y]], 1.3, C.ink, R, { bristles: 2, dry: 0.1 });
      if (!o.dead) dab(c, 0, -9.2, 2.2, C.red, R);
    },
  };
  const k = r / 9.5;
  return {
    box: [r * 3.4 + 6, r * 3.4 + 6, r * 1.7 + 3, r * 2.6 + 4], scale: 1, own: OWN[type] || C.grey, poses: ['idle'], _blob: true,
    paint(c, o) {
      const R = o.R, M = o.M, burnt = o.dead === 'burnt';
      const col = burnt ? C.char : o.col, skin = burnt ? C.charL : o.risen ? C.zskin : col;
      part(c, ring(0, -r * 1.05, r * 1.05, r * 0.95, R, 0.12, 9), skin === col ? col : col, M);
      const ex = r * 0.35, ey = -r * 1.35;
      if (o.dead) {
        for (const dx of [0, ex]) { brush(c, [[dx - 0.9 * k, ey - 0.9 * k], [dx + 0.9 * k, ey + 0.9 * k]], 0.75 * k, C.ink, R, { bristles: 2, dry: 0 }); brush(c, [[dx + 0.9 * k, ey - 0.9 * k], [dx - 0.9 * k, ey + 0.9 * k]], 0.75 * k, C.ink, R, { bristles: 2, dry: 0 }); }
      } else {
        dab(c, ex, ey, 1.7 * k, C.white, R); dab(c, ex + 0.4 * k, ey, 0.75 * k, C.ink, R);
        dab(c, 0, ey + 0.2 * k, 0.75 * k, C.ink, R);
      }
    },
  };
}

// ---------------------------------------------------------------- entries
// P = pose index by name (-1 = the entry has no such pose). Pose order: poses (walk cycle etc.) then extra.
const STD_POSES = ['idle', 'walk0', 'walk1', 'atk'];
class Ent {
  constructor(id, type, e) {
    this.id = id; this.type = type; this.e = e;
    const b = Array.isArray(e.box) && e.box.length >= 4 && e.box.every(Number.isFinite) ? e.box : [32, 32, 16, 28];
    this.box = b; this.scale = e.scale > 0 ? e.scale : 1;
    this.own = typeof e.own === 'string' ? e.own : OWN[type] || C.grey;
    this.poses = Array.isArray(e.poses) && e.poses.length ? e.poses.slice() : ['idle'];
    this.all = this.poses.concat(Array.isArray(e.extra) ? e.extra.filter((p) => !this.poses.includes(p)) : []);
    if (this.all.length > 64) this.all.length = 64;
    this.idx = new Map(this.all.map((p, i) => [p, i]));
    this.P = {};
    for (const p of STD_POSES) this.P[p] = this.idx.has(p) ? this.idx.get(p) : -1;
    this.walk = this.P.walk0 >= 0 && this.P.walk1 >= 0;
    this.flying = !!e.flying; this.lie = e.lie === 'none' ? 'none' : 'side';
    this.drawUnit = typeof e.drawUnit === 'function' ? e.drawUnit : null;
    this.pick = typeof e.pick === 'function' ? e.pick : null;
    this.blob = !!e._blob;
    this.noFlip = !!e.noFlip;
    this.poseR = e.poseR && typeof e.poseR === 'object' ? e.poseR : null;
    this.over = typeof e.over === 'function' ? e.over : null;
    this.drawCorpse = typeof e.drawCorpse === 'function' ? e.drawCorpse : null;
    this.kindled = type === 'archer';
    // hook conventions differ by module: ANIMALS = pick(u, t = world.time, world) and drawUnit / over / drawCorpse in
    // device px at the identity transform; ARMY + MYTHICAL = pick(u, info) and drawUnit(..., api) in sim px.
    this.dev = SRC_MOD[type] === 1;
    this.alpha = typeof e.alpha === 'function' ? e.alpha : null;   // alpha(u) -> 0..1 (MYTHICAL: lurking necromancer)       // archer's arrow head burns when kindled (ARMY ask): key the bake by it
    const d = bodyDef(type); this.defR = d && d.radius > 0 ? d.radius : 8;
    this.failed = 0;
  }
  pose(name) { const i = this.idx.get(name); return i === undefined ? -1 : i; }
}
const ENTS = [];                 // by id
const BY_TYPE = new Map();       // type -> { ent, risen }
export function entOf(type) {
  let r = BY_TYPE.get(type);
  if (r) return r;
  const risen = typeof type === 'string' && type.startsWith('risen_');
  const base = risen ? type.slice(6) : type;
  let ent = null;
  for (const e of ENTS) if (e.type === base) { ent = e; break; }
  if (!ent) {
    let src = SRC[base] && typeof SRC[base].paint === 'function' ? SRC[base] : null;
    if (!src && MINE.entry && base.startsWith('mine_')) { try { const e = MINE.entry(base); if (e && typeof e.paint === 'function') src = e; } catch (err) { console.warn('art: mine entry failed', base, err); } }   // STEP8 (lead)
    if (!src) src = blobEntry(base);
    ent = new Ent(ENTS.length, base, src);
    ENTS.push(ent);
  }
  r = { ent, risen: risen ? 1 : 0 };
  BY_TYPE.set(type, r);
  return r;
}
export function sources() { return Object.keys(SRC); }
// STEP8 (lead): forget a made type's entry (its recipe changed or it was deleted): the next entOf builds it again from
// MINE.entry. Its old bakes keep their old entry id and age out of the atlas like any unused sprite.
export function dropType(type) {
  const base = typeof type === 'string' && type.startsWith('risen_') ? type.slice(6) : type;
  for (const e of ENTS) if (e.type === base) e.type = '\u0000dropped';
  BY_TYPE.delete(base); BY_TYPE.delete('risen_' + base);
}

// ---------------------------------------------------------------- atlas
const PAGE = 2048, MAX_PAGES = 6, PAD = 2;
// Shelf packing by height class (16 px steps): a 20 px drop never opens a 240 px row. Pages are GPU canvases (with WebGL: CPU
// canvases, each sprite also copied into the page's GL texture, gpu.js).
// Full atlas: the least recently used PAGE is emptied (its sprites re-bake when next wanted, spread over frames) instead
// of flushing every page at once (which re-baked every type on screen inside one frame: a long freeze on a phone).
let pages = [], pageY = [], shelves = [];
let useT = 0, evictions = 0;     // useT: frame stamp (frameStart); every sprite record keeps its last use in .u
const BITS = [];                 // every bit handle, so an evicted page can drop its bits too
/** Call once per frame before drawing (stamps sprite use for eviction). */
export function frameStart() { useT++; }
function newPage() {
  const cv = pageCanvas(pages.length, PAGE);   // gpu.js: a CPU canvas + its GL texture when the field draws with WebGL
  pages.push(cv); pageY.push(0); shelves.push([]);
  return pages.length - 1;
}
function alloc(w, h) {
  if (w > PAGE || h > PAGE) return null;
  const hc = Math.ceil((h + 1) / 16) * 16;
  for (let p = pages.length - 1; p >= 0; p--) {
    const L = shelves[p];
    for (let i = 0; i < L.length; i++) { const sh = L[i]; if (sh.h === hc && sh.x + w <= PAGE) { const r = { img: pages[p], sx: sh.x, sy: sh.y, p }; sh.x += w + 1; return r; } }
  }
  let p = -1;
  for (let q = 0; q < pages.length; q++) if (pageY[q] + hc <= PAGE) { p = q; break; }
  if (p < 0) { if (pages.length >= MAX_PAGES) return null; p = newPage(); }
  const sh = { y: pageY[p], h: hc, x: w + 1 }; shelves[p].push(sh); pageY[p] += hc;
  return { img: pages[p], sx: 0, sy: sh.y, p };
}
// Empty the page with the fewest sprites used in the last HOT frames (ties: the one used longest ago). Effect bits are
// drawn every frame from every page, so "least recently used" alone never finds a page. The evicted page's sprites
// re-bake when next wanted (queued, drawn from a near frame meanwhile; a missing bit re-bakes on its next use).
const HOT = 60;
function evict() {
  const n = pages.length;
  if (!n) return false;
  const hot = new Int32Array(n), newest = new Float64Array(n).fill(-1), t0 = useT - HOT;
  const see = (r) => { if (r.u > t0) hot[r.p]++; if (r.u > newest[r.p]) newest[r.p] = r.u; };
  for (const r of sprites.values()) see(r);
  for (const b of BITS) if (b.gen === gen) for (const r of b.list) if (r) see(r);
  let p = 0;
  for (let q = 1; q < n; q++) if (hot[q] < hot[p] || (hot[q] === hot[p] && newest[q] < newest[p])) p = q;
  for (const [k, r] of sprites) if (r.p === p) sprites.delete(k);
  for (let e = 0; e < anyOf.length; e++) if (anyOf[e] && anyOf[e].p === p) anyOf[e] = null;
  for (const b of BITS) if (b.gen === gen) for (let v = 0; v < b.list.length; v++) if (b.list[v] && b.list[v].p === p) b.list[v] = null;
  for (const r of sprites.values()) if (r.d === 0 && r.e >= 0 && !anyOf[r.e]) anyOf[r.e] = r;
  // a new canvas for the page (draws already made this frame keep the old picture)
  const cv = pageCanvas(p, PAGE);
  pages[p] = cv; pageY[p] = 0; shelves[p] = [];
  evictions++; lastEvictHot = hot[p];
  return true;
}
let lastEvictHot = 0;
// Copy scratch (0,0,w,h) into the atlas. Returns the sprite record or null when every page is full.
// e = entry id (-1 for bits), d = dead state: kept so an eviction can refill the any-frame fallback.
function store(scratch, w, h, ax, ay, k, e = -1, d = 0) {
  let r = alloc(w, h);
  if (!r) { if (!evict()) flush(); r = alloc(w, h); if (!r) return null; }
  const g = r.img.getContext('2d');
  g.drawImage(scratch, 0, 0, w, h, r.sx, r.sy, w, h);
  stored(r.img, r.sx, r.sy, w, h, scratch);   // WebGL: the same pixels into the page's texture
  return { img: r.img, sx: r.sx, sy: r.sy, sw: w, sh: h, ax, ay, k, gen, p: r.p, u: useT, e, d };
}

// ---------------------------------------------------------------- scale + generations
export let S = 0;                // device px per sim px the cache was baked at
export let gen = 0;              // bumped on flush; bits re-bake when their gen is old
const sprites = new Map();       // numeric key -> sprite
const anyOf = [];                // ent.id -> some baked sprite of that type (fallback)
export function setScale(s) { if (s > 0 && Math.abs(s - S) > 1e-6) { S = s; flush(); } }
export function flush() {
  gen++; pages = []; pageY = []; shelves = [];
  sprites.clear(); anyOf.length = 0; queued.clear(); hi.length = 0; lo.length = 0;
}
export function stats() { return { pages: pages.length, sprites: sprites.size, queued: hi.length + lo.length, bakeMs: bakeMs, evictions, lastEvictHot }; }

// ---------------------------------------------------------------- unit sprite keys
// key = (((((((ent * 16 + col) * 64 + pose) * 3 + v) * 3 + dead) * 3 + risen) * 2 + bare) * 2 + kindled
// col: 0 own, 1 red (left team), 2 blue (right team), 3..15 extra colours (colId(str), e.g. a frog's cap).
// dead: 0 alive, 1 'dead', 2 'burnt'. risen: 0, 1 zombie copy, 2 skeleton copy ('bone'). bare: hat knocked off / fur
// singed (o.hatless = o.singed = o.bare). kindled: archer fire arrows.
export function key(entId, col, pose, v, dead, risen, bare = 0, kindled = 0) {
  return ((((((entId * 16 + col) * 64 + pose) * 3 + v) * 3 + dead) * 3 + risen) * 2 + bare) * 2 + kindled;
}
const PALETTE = [null, C.red, C.blue];
const palIdx = new Map([[C.red, 1], [C.blue, 2]]);
/** Colour id for a colour string (registers it; at most 16 colours). */
export function colId(str) {
  if (!str) return 0;
  let i = palIdx.get(str);
  if (i !== undefined) return i;
  if (PALETTE.length >= 16) return 0;
  i = PALETTE.length; PALETTE.push(str); palIdx.set(str, i);
  return i;
}
const DEAD = [false, 'dead', 'burnt'];
const RISEN = [false, true, 'bone'];
let scratch = null;
function scratchFor(w, h) {
  if (!scratch) scratch = cpuCanvas(Math.max(256, w), Math.max(256, h));
  if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
  const c = scratch.getContext('2d', { willReadFrequently: true });
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w + 2, h + 2);
  return c;
}
let scratch2 = null;
function scratch2For(w, h) {
  if (!scratch2) scratch2 = cpuCanvas(Math.max(256, w), Math.max(256, h));
  if (scratch2.width < w || scratch2.height < h) { scratch2.width = Math.max(scratch2.width, w); scratch2.height = Math.max(scratch2.height, h); }
  const c = scratch2.getContext('2d', { willReadFrequently: true });
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'copy';
  return c;
}
/** Painted-pixel box of the scratch (0,0,W,H) with 1 px margin: [x0, y0, x1, y1], or null when nothing was painted. */
function trimBox(c, W, H) {
  let d;
  try { d = c.getImageData(0, 0, W, H).data; } catch (e) { return [0, 0, W, H]; }
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    let o = y * W * 4 + 3, row = false;
    for (let x = 0; x < W; x++, o += 4) if (d[o] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; row = true; }
    if (row) { if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return null;
  return [Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(W, x1 + 2), Math.min(H, y1 + 2)];
}
let bakeMs = 0;
export function paintEntry(c, ent, col, poseName, v, dead, risen, bare = 0, kindled = 0) {
  const colour = col === 0 ? ent.own : PALETTE[col] || ent.own;
  const seed = hash(`${ent.type}|${colour}|${poseName}|${v}|${DEAD[dead]}${risen ? '|risen' + risen : ''}${bare ? '|bare' : ''}${kindled ? '|kindled' : ''}`), R = rng(seed);
  const o = { R, M: M0(R), pose: poseName, col: colour, dead: DEAD[dead], risen: RISEN[risen], v, type: ent.type, u0: null,
    hatless: !!bare, singed: !!bare, bare: !!bare, kindled: !!kindled };
  c.save();
  try { ent.e.paint(c, o); }
  catch (err) {
    ent.failed++;
    if (ent.failed < 4) console.warn('art: paint failed', ent.type, poseName, err);
    c.restore(); c.save();
    const b = blobEntry(ent.type), R2 = rng(seed);
    b.paint(c, { R: R2, M: M0(R2), pose: 'idle', col: colour, dead: DEAD[dead], risen: !!risen, v, type: ent.type });
  }
  c.restore();
  return seed;
}
function bakeKey(k) {
  const t0 = performance.now();
  let r = k;
  const kindled = r % 2; r = (r - kindled) / 2;
  const bare = r % 2; r = (r - bare) / 2;
  const risen = r % 3; r = (r - risen) / 3;
  const dead = r % 3; r = (r - dead) / 3;
  const v = r % 3; r = (r - v) / 3;
  const pose = r % 64; r = (r - pose) / 64;
  const col = r % 16; const entId = (r - col) / 16;
  const ent = ENTS[entId];
  if (!ent) return null;
  const [w, h, ax, ay] = ent.box, kk = S * ent.scale;
  const W = Math.ceil(w * kk) + PAD * 2, H = Math.ceil(h * kk) + PAD * 2;
  const c = scratchFor(W, H);
  c.setTransform(kk, 0, 0, kk, PAD + ax * kk, PAD + ay * kk);
  const seed = paintEntry(c, ent, col, ent.all[pose] || ent.all[0], v, dead, risen, bare, kindled);
  if (risen) { // light green wash over a zombie copy (ART.md); bone-white over a skeleton copy
    c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = risen === 2 ? 'rgba(255,253,240,0.42)' : 'rgba(150,214,84,0.26)'; c.fillRect(-ax, -ay, w, h); c.restore();
  }
  tooth(c, -ax, -ay, w, h, seed);
  // trim to the painted pixels (+1 px clear edge for filtering): a sprite's quad only covers what it paints. Floppy-body
  // parts (a leg, a head) sit in the whole figure's box, so untrimmed they filled 5-7x the pixels of the figure.
  const tb = trimBox(c, W, H);
  let src = scratch, x0 = 0, y0 = 0, w2 = W, h2 = H;
  if (tb === null) { w2 = 2; h2 = 2; } else if (tb[2] - tb[0] < W || tb[3] - tb[1] < H) {
    x0 = tb[0]; y0 = tb[1]; w2 = tb[2] - tb[0]; h2 = tb[3] - tb[1];
    const g2 = scratch2For(w2, h2); g2.drawImage(scratch, x0, y0, w2, h2, 0, 0, w2, h2); src = scratch2;
  }
  const spr = store(src, w2, h2, PAD + ax * kk - x0, PAD + ay * kk - y0, kk, entId, dead);
  if (spr) { sprites.set(k, spr); if (dead === 0 && (!anyOf[entId] || pose === 0)) anyOf[entId] = spr; }
  bakeMs += performance.now() - t0;
  return spr;
}

// ---------------------------------------------------------------- queue
const queued = new Set(), hi = [], lo = [];
/** Sprite for the key, or null (queued, high priority). */
export function get(k) {
  const s = sprites.get(k);
  if (s) { s.u = useT; return s; }
  if (!queued.has(k)) { queued.add(k); hi.push(k); }
  return null;
}
/** Sprite for the key, baked right now if missing. */
export function getNow(k) { const s = sprites.get(k); if (s) { s.u = useT; return s; } queued.delete(k); return bakeKey(k); }
/** Sprite for the key if baked (marks it used), else null; queues nothing. */
export function peek(k) { const s = sprites.get(k); if (s) s.u = useT; return s || null; }
export function has(k) { return sprites.has(k); }
export function fallback(entId) { const s = anyOf[entId]; if (s) s.u = useT; return s || null; }
export function want(k) { if (!sprites.has(k) && !queued.has(k)) { queued.add(k); lo.push(k); } }
/** Bake queued keys (and bits) until `ms` are spent. Returns the number baked. */
export function pump(ms) {
  if (!S) return 0;
  const t0 = performance.now(); let n = 0;
  while (performance.now() - t0 < ms) {
    let k;
    if (hi.length) k = hi.shift();
    else if (bitHi.length) { const [b, v] = bitHi.shift(); if (b.gen !== gen || !b.list[v]) { bit(b, v); n++; } continue; }   // attack 11-16 (L4)
    else if (lo.length) k = lo.shift(); else if (bitQ.length) { const [b, v] = bitQ.shift(); if (b.gen !== gen || !b.list[v]) bit(b, v); n++; continue; } else break;
    queued.delete(k);
    if (!sprites.has(k)) { bakeKey(k); n++; }
  }
  return n;
}
export function pending() { return hi.length + bitHi.length + lo.length + bitQ.length; }

// ---------------------------------------------------------------- bits (effects, terrain pieces, decals)
// defineBit(name, n, [w, h, ax, ay], paint(c, R, v, M), { scale, tooth, at }) -> handle; bit(handle, v) -> sprite.
// Painted in sim px around the anchor; baked at S x scale device px per px.
const bitQ = [];
// Bits baked ahead of the prewarm queue (lo), right after wanted-now sprites (hi): projectile art (fx.js prewarm). A bit
// is otherwise baked inside the frame that first draws it: the first dome / ink cloud / lava blob on the field cost a
// 15-40 ms frame on desktop (attack 11-16, L4).
const bitHi = [];
export function defineBit(name, n, box, paint, opts = {}) {
  const b = { name, n, box, paint, scale: opts.scale || 1, tooth: opts.tooth !== false, list: new Array(n).fill(null), gen: -1, seed: hash('bit|' + name) };
  BITS.push(b);
  return b;
}
export function bit(b, v) {
  if (b.gen !== gen) { b.list.fill(null); b.gen = gen; }
  let s = b.list[v];
  if (s) { s.u = useT; return s; }
  if (!S) return null;
  const t0 = performance.now();
  const [w, h, ax, ay] = b.box, kk = S * b.scale;
  const W = Math.ceil(w * kk) + PAD * 2, H = Math.ceil(h * kk) + PAD * 2;
  const c = scratchFor(W, H);
  c.setTransform(kk, 0, 0, kk, PAD + ax * kk, PAD + ay * kk);
  const seed = (b.seed + v * 7919) >>> 0, R = rng(seed);
  try { b.paint(c, R, v, M0(R)); } catch (err) { console.warn('art: bit failed', b.name, err); }
  if (b.tooth) tooth(c, -ax, -ay, w, h, seed);
  s = store(scratch, W, H, PAD + ax * kk, PAD + ay * kk, kk);
  if (s && b.gen !== gen) { b.list.fill(null); b.gen = gen; } // store() flushed: the handle restarts in the new generation
  b.list[v] = s;
  bakeMs += performance.now() - t0;
  return s;
}
export function wantBits(...handles) { for (const b of handles) for (let v = 0; v < b.n; v++) bitQ.push([b, v]); }
export function wantBitsFirst(...handles) { for (const b of handles) for (let v = 0; v < b.n; v++) bitHi.push([b, v]); }

// ---------------------------------------------------------------- one-off paint for icons (no atlas)
/** Paint an entry pose into a fresh CPU canvas at k px per sprite px; returns { cv, ax, ay } (anchor in canvas px). */
export function paintStandalone(type, poseName, colId, k) {
  const { ent, risen } = entOf(type);
  const [w, h, ax, ay] = ent.box, kk = k * ent.scale;
  const W = Math.ceil(w * kk) + PAD * 2, H = Math.ceil(h * kk) + PAD * 2;
  const cv = cpuCanvas(W, H), c = cv.getContext('2d', { willReadFrequently: true });
  c.setTransform(kk, 0, 0, kk, PAD + ax * kk, PAD + ay * kk);
  const pose = poseName && ent.idx.has(poseName) ? poseName : ent.all[0];
  const seed = paintEntry(c, ent, colId, pose, 0, 0, risen);
  tooth(c, -ax, -ay, w, h, seed);
  return { cv, ax: PAD + ax * kk, ay: PAD + ay * kk, ent };
}
export { tone };
