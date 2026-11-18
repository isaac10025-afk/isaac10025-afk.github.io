// CORE-B shared helpers: constants, world adapters (walls, water, ice, fields, groups) with tiny local
// fallbacks for anything CORE-A / TERRAIN have not shipped yet, plus per-unit combat field init.
// Our own code; rules from reference/og/core-combat.md.
import * as WORLD from '../world.js';

export const DT = 1 / 60;                 // OG game.js:8656
export const MORALE_STEP = 0.1;           // OG game.js:8659 (6·dt), used by morale smoothing game.js:4989
export const QUERY_MARGIN = 46;           // OG game.js:8667 (max unit radius, added to radius queries)
export const WET = 0.05;                  // OG water "wet" depth (K.d / f), game.js:2988, 9827
export const DEEP = 0.75;                 // OG deep water (y.a), game.js:8886, 729-733
export const GRAVITY = 900;               // OG game.js:9009 (lt = 900)
export const PERCH_H = 26, PERCH_H_APE = 23; // OG game.js:9013-9015
export const STATE = { IDLE: 0, ADVANCE: 1, ENGAGE: 2, ALERT: 3, CHARGE: 4, FLEE: 5 }; // OG game.js:9219
export const INTEL = { Mindless: 0, Animal: 1, Trained: 2 }; // OG game.js:8442
// Harm causes, OG game.js:11596
export const CAUSE = { Other: 0, Blow: 1, Blast: 2, Fire: 3, Plague: 4, Thrown: 5, Eaten: 7, Turned: 8 };
export const PROPS_FACTION_NAMES = ['props', 'Props'];

export function intel(def) {
  const v = def && def.intelligence;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v in INTEL) return INTEL[v];
  return INTEL.Animal;
}

// ---- rng helpers (all randomness through world.rng) ----
export function rnd(world) { return world.rng(); }
export function signed(world) { return 2 * world.rng() - 1; }          // OG game.js:2694-2696
export function tri(world) { return world.rng() - world.rng(); }        // OG game.js:2697-2699
export function range(world, a, b) { return a + (b - a) * world.rng(); }
export function rint(world, n) { return Math.floor(world.rng() * n); }

export function hypot(x, y) { return Math.sqrt(x * x + y * y); }
export function angleDiff(a, b) { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return d; }

// OG setState (game.js:9221): changing state resets stateTime.
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }

export function isAirborne(u) { return u.z > 0 || u.vz > 0; } // OG game.js:9060
export function alive(u) { return !!u && !u.dead && !u.removed; }

// Resolve a unit id (or a unit) to a live unit (hp may be <= 0 until lifecycle).
export function unitOf(world, idOrUnit) {
  if (idOrUnit == null || idOrUnit === -1) return null;
  const u = typeof idOrUnit === 'object' ? idOrUnit : world.unitById(idOrUnit);
  return u && !u.removed ? u : null;
}
export function targetOf(world, u) { // OG game.js:8774-8780: target if alive with hp > 0, else cleared
  if (u.target == null || u.target < 0) return null;
  const t = world.unitById(u.target);
  if (t && !t.removed && t.hp > 0) return t;
  u.target = -1; return null;
}

// ---- per-unit combat fields (lazy; CORE-A may call initCombat in spawn) ----
export function initCombat(u) {
  if (u._cb === 1) return u;
  u._cb = 1;
  const d = (k, v) => { if (u[k] === undefined) u[k] = v; };
  d('burning', 0); d('stun', 0); d('cooldown', 0); d('attack', 0); d('stateTime', 0); d('face', NaN);
  d('odds', 0); d('fear', 0); d('threatX', 0); d('threatY', 0); d('los', 1); d('attackers', 0); d('shooters', 0);
  d('ammo', 0); d('reload', 0); d('react', 0); d('pathing', 0);
  d('hitAt', -1e9); d('hitPow', 0); d('hitDx', 0); d('hitDy', 0); d('stopAt', -1e9); d('flinchAt', -1e9); d('flash', 0);
  d('firedAt', -1e9); d('kindled', 0); d('singed', 0); d('hatless', 0); d('blind', 0); d('wander', u.heading || 0);
  d('climb', 0); d('perch', -1); d('prone', 0); d('spin', 0); d('thrownAt', -1e9); d('hurled', 0);
  d('dodgeX', 0); d('dodgeY', 0); d('dodgeDelay', 0); d('dodgeTime', 0);
  d('startle', 0); d('startleX', 0); d('startleY', 0);
  d('plague', 0); d('plagueAt', -1e9); d('plagueFree', 0); d('coughAt', -1e9);
  d('infection', 0); d('infectType', null); d('infectGroup', -1); d('infectTeam', -1);
  d('harmCause', 0); d('harmBy', -1); d('harmByType', null); d('harmByFaction', -1); d('harmByAt', -1e9);
  d('eaten', 0); d('skeleton', 0); d('arrowsIn', 0); d('arrows', null); d('cover', -1); d('lastVictim', -1);
  d('subState', 0); d('detour', 0); d('kills', 0); d('dmgDealt', 0);
  return u;
}

// ---- walls ----
// CORE-A: world.walls is a Walls object (count, isSolidAt, raycast) on the real World; the plain typed-array shape
// (world.walls + wallW/wallH) is kept for light test worlds.
const WT = 8; // wall tile px (ARCH / OG game.js:8669)
function wallsObj(world) { const w = world.walls; return w && typeof w.raycast === 'function' ? w : null; }
export function wallCount(world) {
  const o = wallsObj(world); if (o) return o.count;
  return typeof world.wallCount === 'number' ? world.wallCount : 1;
}
function solidTile(world, tx, ty) {
  const o = wallsObj(world); if (o) return o.isSolidTile(tx, ty);
  if (world.walls && world.wallW) {
    if (tx < 0 || ty < 0 || tx >= world.wallW || ty >= world.wallH) return false; // OG game.js:819-821: off-field is not solid
    return world.walls[ty * world.wallW + tx] === 1;
  }
  return typeof world.wallAt === 'function' ? world.wallAt((tx + 0.5) * WT, (ty + 0.5) * WT) === 1 : false;
}
export function solidAt(world, x, y) { return solidTile(world, Math.floor(x / WT), Math.floor(y / WT)); }
// Fraction along (x0,y0)->(x1,y1) of the first wall tile entered; Infinity when clear. OG game.js:923-945 (grid walk).
export function raycast(world, x0, y0, x1, y1) {
  const o = wallsObj(world); if (o) return o.raycast(x0, y0, x1, y1);
  if (wallCount(world) === 0) return Infinity;
  let cx = Math.floor(x0 / WT), cy = Math.floor(y0 / WT);
  const ex = Math.floor(x1 / WT), ey = Math.floor(y1 / WT);
  if (solidTile(world, cx, cy)) return 0;
  const dx = x1 - x0, dy = y1 - y0, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const stx = dx !== 0 ? Math.abs(WT / dx) : Infinity, sty = dy !== 0 ? Math.abs(WT / dy) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? cx + 1 : cx) * WT - x0) / dx : Infinity;
  let ty = dy !== 0 ? ((dy > 0 ? cy + 1 : cy) * WT - y0) / dy : Infinity;
  for (let n = Math.abs(ex - cx) + Math.abs(ey - cy); n > 0; n--) {
    let t;
    if (tx < ty) { t = tx; cx += sx; tx += stx; } else { t = ty; cy += sy; ty += sty; }
    if (solidTile(world, cx, cy)) return t;
  }
  return Infinity;
}
export function lineOfSight(world, x0, y0, x1, y1) { return raycast(world, x0, y0, x1, y1) === Infinity; }

// ---- water / ice (TERRAIN writes the grids; CORE-A world.waterAt / depthUnder / iceAt / frozenAt / wetAt read them) ----
export function depthAt(world, x, y) {          // OG game.js:9602-9609: ice on top reads as 0
  if (typeof world.waterAt !== 'function' || world.waterCells === 0) return 0;
  if (world.iceCells === undefined && typeof world.iceAt === 'function' && world.iceAt(x, y) > 0) return 0;
  return world.waterAt(x, y) || 0;
}
export function depthUnder(world, x, y) {       // OG game.js:9610-9615
  if (typeof world.depthUnder === 'function') return world.depthUnder(x, y);
  return typeof world.waterAt === 'function' ? (world.waterAt(x, y) || 0) : 0;
}
export function frozenAt(world, x, y) {         // OG game.js:9617-9625
  if (typeof world.frozenAt === 'function') return world.frozenAt(x, y);
  return typeof world.iceAt === 'function' && world.iceAt(x, y) > 0 && depthUnder(world, x, y) >= WET;
}
export function onIce(world, x, y) { return typeof world.iceAt === 'function' && world.iceCells !== 0 && world.iceAt(x, y) > 0; }
export function wetAt(world, u) {               // OG game.js:9824-9829
  if (typeof world.wetAt === 'function') return world.wetAt(u);
  if (u.z > 0 || (u.climb | 0) !== 0) return false;
  return (u.def && u.def.aquatic ? depthUnder(world, u.x, u.y) : depthAt(world, u.x, u.y)) >= WET;
}
export function isDeepAt(world, x, y) { return depthAt(world, x, y) >= DEEP; } // OG game.js:9626-9628
export function submerged(world, u) {           // OG game.js:9830-9834 (depth formula owned by TERRAIN)
  if (u.inside >= 0 || (u.def.underground !== undefined && u.def.underground(u) === true)) return true;   // STEP6 BOSSES: swallowed, or a worm under the ground: shots pass
  if (typeof world.submerged === 'function') return world.submerged(u);
  return false;
}
// Nearest wet cell centre within r (OG game.js:9835-9866), ring search on the 8 px water tiles.
export function nearestWet(world, x, y, r, out) {
  if (typeof world.nearestWet === 'function') return world.nearestWet(x, y, r, out);
  const W = world.tileCols || world.wallW, H = world.tileRows || world.wallH;
  if (!world.water || !W || world.waterCells === 0) return false;
  const cx = Math.floor(x / WT), cy = Math.floor(y / WT), R = Math.ceil(r / WT);
  for (let k = 0; k <= R; k++) {
    let best = -1, bd = Infinity;
    for (let ty = cy - k; ty <= cy + k; ty++) {
      if (ty < 0 || ty >= H) continue;
      const edge = ty === cy - k || ty === cy + k;
      for (let tx = cx - k; tx <= cx + k; tx += (edge || k === 0) ? 1 : 2 * k) {
        if (tx < 0 || tx >= W) continue;
        const i = ty * W + tx;
        if (world.water[i] < WET || (world.ice && world.ice[i] > 0)) continue;
        const d = ((tx + 0.5) * WT - x) ** 2 + ((ty + 0.5) * WT - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best >= 0) {
      if (bd > r * r) return false;
      out[0] = ((best % W) + 0.5) * WT; out[1] = (Math.floor(best / W) + 0.5) * WT; return true;
    }
  }
  return false;
}

// ---- fear / noise fields (CORE-A owns world.fields; fallback is a local copy of the OG layout) ----
// OG game.js:10514-10575: one layer per faction + a noise layer, 40 px cells, splat amount·(1 − d/r).
export const NOISE = 'noise';

class Fields {
  constructor(W, H) { this.cell = 40; this.cols = Math.max(1, Math.ceil(W / 40)); this.rows = Math.max(1, Math.ceil(H / 40)); this.layers = new Map(); }
  layer(k) { let a = this.layers.get(k); if (!a) { a = new Float32Array(this.cols * this.rows); this.layers.set(k, a); } return a; }
  splat(k, x, y, amt, r) {
    const a = this.layer(k), c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(this.cols - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(this.rows - 1, Math.floor((y + r) / c));
    for (let j = y0; j <= y1; j++) { const dy = (j + 0.5) * c - y; for (let i = x0; i <= x1; i++) { const dx = (i + 0.5) * c - x; const f = 1 - Math.sqrt(dx * dx + dy * dy) / r; if (f > 0) a[j * this.cols + i] += amt * f; } }
  }
  sample(k, x, y) {
    const a = this.layers.get(k); if (!a) return 0;
    const o = this.cols, rr = this.rows;
    let fx = x / this.cell - 0.5, fy = y / this.cell - 0.5;
    fx = fx < 0 ? 0 : fx > o - 1 ? o - 1 : fx; fy = fy < 0 ? 0 : fy > rr - 1 ? rr - 1 : fy;
    const ix = Math.floor(fx), iy = Math.floor(fy), jx = ix + 1 < o ? ix + 1 : ix, jy = iy + 1 < rr ? iy + 1 : iy, tx = fx - ix, ty = fy - iy;
    const top = a[iy * o + ix] + (a[iy * o + jx] - a[iy * o + ix]) * tx;
    return top + (a[jy * o + ix] + (a[jy * o + jx] - a[jy * o + ix]) * tx - top) * ty;
  }
  decay(dt) { for (const [k, a] of this.layers) { const f = Math.pow(0.5, dt / (k === NOISE ? 1.5 : 4)); for (let i = 0; i < a.length; i++) { const v = a[i] * f; a[i] = v < 1e-4 ? 0 : v; } } }
}
export function fields(world) {
  if (!world.fields) world.fields = new Fields(world.W || 800, world.H || 600);
  return world.fields;
}
export function fearLayer(world, faction) { const f = fields(world); return typeof f.fearLayer === 'function' ? f.fearLayer(faction) : faction; }
// CORE-A Fields: layers[0..26] = factions, layers[27] = noise (world.js NOISE_LAYER = FACTION_COUNT).
export function noiseLayer(world) { const f = fields(world); return f instanceof Fields ? NOISE : (typeof WORLD.NOISE_LAYER === 'number' ? WORLD.NOISE_LAYER : 27); }
export function splatFear(world, faction, x, y, amt, r) { if (amt) fields(world).splat(fearLayer(world, faction), x, y, amt, r); }
export function splatNoise(world, x, y, amt, r) { if (amt && r > 0) fields(world).splat(noiseLayer(world), x, y, amt, r); }
export function sampleFear(world, faction, x, y) { return fields(world).sample(fearLayer(world, faction), x, y); }

// ---- groups (CORE-A) ----
export function casualtyRatio(world, g) { // OG game.js:2380-2383: 1 − alive/joined
  if (g == null || g < 0 || !world.groups) return 0;
  const G = world.groups;
  if (typeof G.casualtyRatio === 'function') return G.casualtyRatio(g);
  const r = typeof G.get === 'function' ? G.get(g) : G[g];
  if (r && r.joined > 0) return 1 - r.alive / r.joined;
  return 0;
}

// ---- hooks other owners plug in (TERRAIN: mines, peels, walls, ice, steam; MYTHICAL: turning) ----
// Each is optional; set with setCombatHook(name, fn).
export const hooks = {
  armMinesNear: null,   // (world, x, y, radius)          blast arms mines within 1.25·radius (OG 8940)
  peelsBlast: null,     // (world, x, y, radius)          peels react (OG 8941)
  iceHarm: null,        // (world, x, y, r, amount, dur)  OG 8899, 2984
  wallBlast: null,      // (world, x, y, r, dmg)          tiles within r lose dmg·(1 − (d/r)²) hp (OG 8931-8938)
  grenadeLanded: null,  // (world, x, y)                  may arm a nearby mine (OG 3072)
  arrowLanded: null,    // (world, x, y)                  ground arrow may arm a mine 50% (OG 3195, 16202)
  unitLanded: null,     // (world, u)                     a tossed unit lands (mines check, OG 9123 / 612.d)
  steam: null,          // (world, x, y, size, thickness) steam cloud (OG 3367-3439)
  turn: null,           // (world, u) → new unit | null   replace an infected unit with its risen copy (MYTHICAL, OG 3331-3344)
};
export function setCombatHook(name, fn) { if (!(name in hooks)) throw new Error('unknown combat hook ' + name); hooks[name] = fn; }

// OG world stats counters (world.stats on the real World).
export function stat(world, key, n = 1) { if (world.stats) world.stats[key] = (world.stats[key] || 0) + n; else world[key] = (world[key] || 0) + n; }

export function emit(world, name, data) { if (typeof world.emit === 'function') world.emit(name, data); }
