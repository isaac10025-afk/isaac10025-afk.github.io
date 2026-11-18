// Bridge (OURS, Part 2 step 7, STEP7.md TERRAIN-SIM): wooden planks painted with the wall brush (x0.75) on the 8 px
// terrain tiles. A plank is a floor. Over water it reads dry for everyone but aquatic units (they swim under: water.js
// depthAt / isDeepTile and world.waterAt see 0 there, marked STEP7 edits); over lava it is safe until the lava burns it
// out (once walked on: 6-10 s; an unused bridge waits, so a map's lava bridges are still there when the armies come);
// over land it is just a floor. Planks burn (a burning unit, burning oil or lava lights one; it spreads to
// touching planks), blasts break them (same falloff as walls, chained onto the wallBlast hook in terrain/index.js) and
// very heavy feet crack them. A plank that breaks over water / lava drops whoever stands on it in (splash + stun 0.5 s,
// like broken ice). Shots pass over bridges (planks are floor, never walls).
// Store: world.bridge7 (Bridge7). Art fields (TERRAIN-ART): hp, ang, fire, fireList + burning, cells, version, fireVersion.
import { DT, WET } from '../const.js';
import { forCapsule, terrainOf } from './grid.js';
import { deps } from './deps.js';
import { onWorldClear } from '../world.js';
import { registerSystem } from '../systems/extra.js';
import * as fireMod from '../combat/fire.js';

export const T = {
  hp: 60,             // plank tile hp
  burnDps: 8,         // hp/s a burning plank loses
  spread: 0.2,        // chance per s a burning plank lights each touching plank (4-neighbours)
  lavaChar: 2,        // hp/s a plank over lava loses while something stands on it (pressed into the heat) ...
  lavaLight: 0.5,     // ... and the chance per s it catches then: once walked on, a lava bridge is gone in ~6-10 s
  heavyMass: 25,      // a unit this heavy standing on planks cracks them ...
  heavyCrack: 10,     // ... this many hp/s ...
  heavyFoot: 0.5,     // ... on every plank within this x its radius of its centre
  footIgnite: 1.5,    // chance per s x flammability that a burning plank sets whoever stands on it alight
  oilEvery: 6,        // ticks between burning-oil-under-plank checks
  dropStun: 0.5,      // s stun when the plank under a unit breaks over water / lava (as broken ice, ice.js BREAK_STUN)
  groundZ: 2,         // px: a unit higher than this is not standing on the planks
  minSeg: 0.5,        // px: a stroke segment shorter than this is a tap (no angle of its own)
};

// ---------------------------------------------------------------- store
export class Bridge7 {
  constructor(cols, rows) {
    const n = cols * rows;
    this.cols = cols; this.rows = rows; this.n = n; this.tile = 8; this.inv = 1 / 8;
    this.hp = new Float32Array(n);        // plank hp, 0 = no plank
    this.ang = new Float32Array(n);       // angle (rad) of the stroke that laid it: planks run across it, rails along it
    this.fire = new Float32Array(n);      // > 0 = burning (world.time it caught, at least 0.001), 0 = not burning
    this.brokeAt = new Float32Array(n);   // STEP7 lead (TERRAIN-ART ask): world.time a plank BROKE (not erased): splinters
    this.now = 0;                         // world.time of the current blast / system run (breakTile stamps brokeAt with it)
    this.stroke = new Uint16Array(n);     // stroke id that laid it (a tap's planks take the first real segment's angle)
    this.list = new Int32Array(256);      // tile indices of every plank (rebuilt when version changes)
    this.listN = 0; this.listAdds = -1;   // the list is rebuilt when planks are added (broken ones are skipped by hp)
    this.fireList = new Int32Array(64);   // tile indices of the burning planks (refreshed every tick while any burn)
    this.burning = 0;                     // how many entries of fireList are live
    this.broken = [];                     // tiles broken since the last system run (drop check)
    this.cells = 0; this.version = 0; this.fireVersion = 0; this.adds = 0;
    this.coverVersion = 0;                // bumped when a plank over lava is laid or goes (lava.js path cells read it)
    this.strokeId = 1; this.igniteTick = -1;
  }
  clear() {
    this.hp.fill(0); this.fire.fill(0); this.ang.fill(0); this.stroke.fill(0); this.brokeAt.fill(0);
    this.cells = 0; this.burning = 0; this.listN = 0; this.broken.length = 0;
    this.version++; this.fireVersion++; this.adds++; this.coverVersion++;
  }
  idx(x, y) { const tx = Math.floor(x * this.inv), ty = Math.floor(y * this.inv); return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows ? -1 : ty * this.cols + tx; }
  at(x, y) { const i = this.idx(x, y); return i >= 0 && this.hp[i] > 0; }
  rebuildList() {
    if (this.list.length < this.cells) this.list = new Int32Array(Math.max(this.cells, 2 * this.list.length));
    let k = 0; const h = this.hp;
    for (let i = 0; i < this.n; i++) if (h[i] > 0) this.list[k++] = i;
    this.listN = k; this.listAdds = this.adds;
  }
}

export function bridgeOf(world) {
  const w = world.walls;
  let B = world.bridge7;
  if (B === undefined || B.cols !== w.cols || B.rows !== w.rows) B = world.bridge7 = new Bridge7(w.cols, w.rows);
  return B;
}
onWorldClear((world) => { if (world.bridge7 !== undefined) world.bridge7.clear(); });

// ---------------------------------------------------------------- painting
let _B = null, _walls = null, _lava = null, _erase = false, _ang = 0, _hasAng = false, _n = 0;
function paintTile(i) {
  const B = _B;
  if (_erase) { if (B.hp[i] > 0) { removeTile(B, i, _lava); _n++; } return; }
  if (_walls.solid[i] === 1) return;                        // planks are a floor: never on a wall tile
  const fresh = B.hp[i] <= 0;
  if (fresh) { B.ang[i] = _hasAng ? _ang : 0; B.stroke[i] = B.strokeId; }
  else if (_hasAng && B.stroke[i] === B.strokeId) B.ang[i] = _ang;   // same stroke: the latest segment lays the angle (older planks keep theirs)
  if (B.hp[i] !== T.hp || B.fire[i] > 0) {                  // new or repaired (a repaint puts a fire out)
    if (fresh) { B.cells++; B.adds++; if (_lava !== null && _lava[i] === 1) B.coverVersion++; }
    if (B.fire[i] > 0) { B.fire[i] = 0; B.fireVersion++; }
    B.hp[i] = T.hp; _n++;
  }
}
function removeTile(B, i, lava) {
  B.hp[i] = 0; B.cells--;
  if (lava !== null && lava[i] === 1) B.coverVersion++;
  if (B.fire[i] > 0) { B.fire[i] = 0; B.fireVersion++; }
  B.broken.push(i);
}
/** Planks on tiles within max(r, 4) px of the segment (erase = true removes them). r as given: the brush passes x0.75. */
export function paintBridge(world, x0, y0, x1, y1, r, erase = false) {
  const B = bridgeOf(world);
  const dx = x1 - x0, dy = y1 - y0;
  _B = B; _walls = world.walls; _erase = erase; _n = 0; _lava = world.lava7 !== undefined && world.lava7.cells > 0 ? world.lava7.grid : null;
  _hasAng = dx * dx + dy * dy >= T.minSeg * T.minSeg; _ang = _hasAng ? Math.atan2(dy, dx) : 0;
  forCapsule(B, x0, y0, x1, y1, r, paintTile);
  const n = _n; _B = null; _walls = null; _lava = null;
  if (n > 0) B.version++;
  return n;
}
export function beginBridgeStroke(world) { const B = bridgeOf(world); B.strokeId = (B.strokeId + 1) & 0xffff || 1; }
export function eraseBridge(world, x0, y0, x1, y1, r) { return world.bridge7 === undefined || world.bridge7.cells === 0 ? 0 : paintBridge(world, x0, y0, x1, y1, r, true); }
export function clearBridge(world) { if (world.bridge7 !== undefined) world.bridge7.clear(); }
/** Map painter (maps/index.js registerMapKind): r as given, one stroke per call. */
export function mapBridge(world, x0, y0, x1, y1, r) { beginBridgeStroke(world); return paintBridge(world, x0, y0, x1, y1, r); }

// ---------------------------------------------------------------- queries
/** A plank over (x, y)? (fast false while there are none). */
export function bridgeAt(world, x, y) { const B = world.bridge7; return B !== undefined && B.cells > 0 && B.at(x, y); }

// ---------------------------------------------------------------- harm
function light(world, B, i) {
  if (B.fire[i] > 0 || B.hp[i] <= 0) return;
  B.fire[i] = Math.max(0.001, world.time); B.fireVersion++; B.burning++;
  if (B.igniteTick !== world.tick) { B.igniteTick = world.tick; world.emit('ignite', { x: ((i % B.cols) + 0.5) * 8, y: (Math.floor(i / B.cols) + 0.5) * 8, v: 4, plank: 1 }); }
}
let _bx = 0, _by = 0, _bn = 0;
function breakTile(B, i, lava) { B.brokeAt[i] = Math.max(0.001, B.now); _bx += ((i % B.cols) + 0.5) * 8; _by += (Math.floor(i / B.cols) + 0.5) * 8; _bn++; removeTile(B, i, lava); B.version++; }
function flushBreaks(world) {
  if (_bn === 0) return;
  world.emit('plankbreak', { x: _bx / _bn, y: _by / _bn, v: Math.min(3, _bn / 4), n: _bn });
  _bx = 0; _by = 0; _bn = 0;
}
/** Blast (chained onto the wallBlast hook): planks whose centre is within r lose dmg x (1 - (d/r)^2), like walls (wall.js). */
export function blastBridge(world, x, y, r, dmg) {
  const B = world.bridge7;
  if (B === undefined || B.cells === 0 || !(r > 0)) return 0;
  B.now = world.time;
  const t = 8, c0 = Math.max(0, Math.floor((x - r) / t)), c1 = Math.min(B.cols - 1, Math.floor((x + r) / t));
  const r0 = Math.max(0, Math.floor((y - r) / t)), r1 = Math.min(B.rows - 1, Math.floor((y + r) / t));
  const lv = world.lava7 !== undefined && world.lava7.cells > 0 ? world.lava7.grid : null;
  let broke = 0;
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    const i = ty * B.cols + tx;
    if (B.hp[i] <= 0) continue;
    const d = Math.hypot((tx + 0.5) * t - x, (ty + 0.5) * t - y);
    if (d >= r) continue;
    const f = d / r;
    B.hp[i] -= dmg * (1 - f * f);
    if (B.hp[i] <= 0) { breakTile(B, i, lv); broke++; }
  }
  flushBreaks(world);
  return broke;
}
/** Take the plank off tile i without a break event (rock formed there: lava.js). */
export function removePlank(world, i) {
  const B = world.bridge7;
  if (B === undefined || !(B.hp[i] > 0)) return;
  removeTile(B, i, world.lava7 !== undefined && world.lava7.cells > 0 ? world.lava7.grid : null); B.version++;
}
/** Light the plank under (x, y) (a burning unit, a fire arrow, another owner's fire). */
export function lightBridge(world, x, y) { const B = world.bridge7; if (B === undefined || B.cells === 0) return; const i = B.idx(x, y); if (i >= 0) light(world, B, i); }

// ---------------------------------------------------------------- system
function growFire(B) { if (B.fireList.length < B.listN) B.fireList = new Int32Array(Math.max(B.listN, 2 * B.fireList.length)); }
const NB = [0, 0, 0, 0];
export function run(world) {
  const B = world.bridge7;
  if (B === undefined || (B.cells === 0 && B.broken.length === 0)) return;
  if (B.cols !== world.walls.cols || B.rows !== world.walls.rows) { world.bridge7 = undefined; return; }   // the field changed size (never after boot)
  if (B.listAdds !== B.adds) B.rebuildList();
  B.now = world.time;
  const L = world.lava7, lava = L !== undefined && L.cells > 0 ? L.grid : null, C = B.cols, R = B.rows;
  const us = world.units, h = B.hp, fire = B.fire, rng = world.rng;
  // units on planks: burning feet light them, burning planks light feet, very heavy feet crack them
  if (B.cells > 0) for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !(u.hp > 0) || u.inside >= 0 || u.z > T.groundZ || u.leaping !== 0 || u.climb > 0) continue;
    const i = B.idx(u.x, u.y);
    if (i < 0 || h[i] <= 0) continue;
    if (lava !== null && lava[i] === 1) {                   // feet on a lava bridge: it chars and catches
      h[i] -= T.lavaChar * DT;
      if (h[i] <= 0) { breakTile(B, i, lava); continue; }
      if (fire[i] === 0 && rng() < T.lavaLight * DT) light(world, B, i);
    }
    if (u.burning > 0) light(world, B, i);
    else if (fire[i] > 0 && u.def.flammability > 0 && rng() < T.footIgnite * DT * u.def.flammability && fireMod.igniteNow) fireMod.igniteNow(world, u);
    if (u.mass >= T.heavyMass) {
      const fr = u.radius * T.heavyFoot, tx0 = Math.max(0, Math.floor((u.x - fr) / 8)), tx1 = Math.min(C - 1, Math.floor((u.x + fr) / 8));
      const ty0 = Math.max(0, Math.floor((u.y - fr) / 8)), ty1 = Math.min(R - 1, Math.floor((u.y + fr) / 8));
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const j = ty * C + tx;
        if (h[j] <= 0) continue;
        h[j] -= T.heavyCrack * DT;
        if (h[j] <= 0) breakTile(B, j, lava);
      }
    }
  }
  // tile pass: only while something burns or burning oil may be under a plank
  const oil = world.oil, oilCheck = oil !== undefined && oil !== null && oil.burning > 0 && world.tick % T.oilEvery === 0;
  if (B.burning > 0 || oilCheck) {
    growFire(B);
    let nf = 0;
    const list = B.list, fl = B.fireList, n = B.listN;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      if (h[i] <= 0) continue;
      if (oilCheck && fire[i] === 0 && oil.burningAt(((i % C) + 0.5) * 8, (Math.floor(i / C) + 0.5) * 8)) light(world, B, i);
      if (fire[i] > 0) {
        h[i] -= T.burnDps * DT;
        const x = i % C, y = (i - x) / C;
        NB[0] = x > 0 ? i - 1 : -1; NB[1] = x < C - 1 ? i + 1 : -1; NB[2] = y > 0 ? i - C : -1; NB[3] = y < R - 1 ? i + C : -1;
        for (let q = 0; q < 4; q++) { const j = NB[q]; if (j >= 0 && h[j] > 0 && fire[j] === 0 && rng() < T.spread * DT) light(world, B, j); }
        if (h[i] > 0) fl[nf++] = i;
      }
      if (h[i] <= 0) breakTile(B, i, lava);
    }
    if (B.burning !== nf) B.fireVersion++;
    B.burning = nf;
  }
  flushBreaks(world);
  if (B.broken.length > 0) dropIn(world, B);
}

// Units standing on a plank that just went: over water or lava they fall in (stun 0.5 s + splash), as broken ice does.
function dropIn(world, B) {
  const us = world.units, br = B.broken, L = world.lava7, lava = L !== undefined && L.cells > 0 ? L.grid : null;
  const Tw = world.waterCells > 0 ? terrainOf(world) : null;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !(u.hp > 0) || u.inside >= 0 || u.z > T.groundZ || u.leaping !== 0 || u.climb > 0 || u.def.aquatic || u.def.prop) continue;
    const i = B.idx(u.x, u.y);
    if (i < 0 || h0(B, i) || !br.includes(i)) continue;
    const wet = Tw !== null && Tw.level[i] >= WET && !(Tw.iceHp[i] > 0), hot = lava !== null && lava[i] === 1;
    if (!wet && !hot) continue;
    deps.stun(world, u, T.dropStun);
    if (wet) {
      world.emit('puff', { kind: 'splash', x: u.x, y: u.y, ang: -Math.PI / 2, size: 0.8 + u.radius / 15 });
      world.emit('splash', { x: u.x, y: u.y, v: 0.6 + u.radius / 20, type: u.type });
    } else world.emit('puff', { kind: 'steam', x: u.x, y: u.y, ang: -Math.PI / 2, size: 0.8 + u.radius / 15 });
    world.emit('fall', { x: u.x, y: u.y, v: u.radius, type: u.type, into: wet ? 'water' : 'lava' });
  }
  br.length = 0;
}
function h0(B, i) { return B.hp[i] > 0; }   // a plank was laid again on the same tile this tick: nobody falls

registerSystem('bridge7', run, 'water');
