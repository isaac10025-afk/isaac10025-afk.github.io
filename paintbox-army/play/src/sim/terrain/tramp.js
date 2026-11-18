// Trampoline (OURS, Part 2 step 7, STEP7.md TERRAIN-SIM): round pads placed like mines (points), r 14 px, ~40 px apart
// along a stroke (one tap = one pad). A ground unit that steps on a pad is launched: up to ~90 px and ~150 px forward
// along the way it was going (a random way if it stood still), flying over walls (LEAP.VAULT while up, like a siege
// tower crossing), then lands with the game's own landing (push.js land: small hurt + stun). A too-heavy unit rips the
// pad instead. Flying bodies and grenades / bombs / boulders (thrown, or rolling) that come down on a pad bounce up again.
// Blasts tear pads (chained onto the wallBlast hook in terrain/index.js), fire burns them (lava, burning oil, a burning
// plank under it). Possessed units bounce too (it's a toy). Pad cooldown 0.25 s. Events: `boing` {x, y, v}, `rip` {x, y}.
// Store: world.tramp7 (Tramp7). Art fields (TERRAIN-ART): x, y, state, boingAt, high, count, version, r.
import { DT, GRAVITY, LEAP, DEEP, WET } from '../const.js';
import { segDist, terrainOf, cellOf } from './grid.js';
import { bridgeAt } from './bridge.js';
import { depthAt } from './water.js';
import { onWorldClear } from '../world.js';
import { registerSystem } from '../systems/extra.js';

export const T = {
  r: 14,              // px pad radius
  spacing: 40,        // px between pads along a stroke
  mapSpacing: 30,     // px between pads a map places (2 pads must not overlap)
  cap: 256,           // pads per field
  apex: 90,           // px: top of a bounce
  forward: 150,       // px a bounce carries a unit along its way
  maxMass: 10,        // heavier units rip the pad (STEP7.md said 25: the giant (mass 12) must rip it, see the reply)
  cool: 0.25,         // s before a pad throws again
  standSpeed: 15,     // px/s: slower than this counts as standing (random way)
  reach: 0.5,         // x unit radius added to the pad radius: "stepped on"
  groundZ: 2,         // px: higher than this is not stepping on it
  blastPad: 0.5,      // x pad radius added to a blast's wall radius: torn
  fireEvery: 6,       // ticks between fire checks under the pads
  bodyMax: 0.5,       // x the bounce speed: a flying body on the ground (z 0) going up slower than this over a pad bounces
  stunPad: 0.3,       // s after the landing the unit stays stunned (as push.js toss)
};
const VZ = Math.sqrt(2 * GRAVITY * T.apex), AIR = (2 * VZ) / GRAVITY, OUT = T.forward / AIR;   // 402 px/s up, 0.89 s, 168 px/s
export const PAD_UP = VZ, PAD_AIR = AIR;
// Pad states (Tramp7.state): 0 free slot, 1 working, 2 torn (ripped / blasted: kept as a torn mat), 3 burnt.
export const PAD = Object.freeze({ FREE: 0, OK: 1, TORN: 2, BURNT: 3 });

// ---------------------------------------------------------------- store
export class Tramp7 {
  constructor() {
    const n = T.cap;
    this.r = T.r;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.state = new Uint8Array(n);       // PAD.*
    this.cool = new Float32Array(n);      // world.time the pad can throw again
    this.boingAt = new Float32Array(n).fill(-1e9);   // world.time of the last bounce (art: squash + stretch)
    this.deadAt = new Float32Array(n).fill(-1e9);    // world.time it was torn / burnt (art)
    this.high = 0; this.count = 0; this.kept = 0; this.version = 0;   // count = working pads; kept = torn / burnt mats lying there
    this.fly = []; this.flyIds = [];      // units this pad set flying (LEAP.VAULT to clear on landing): unit objects + their ids
    this.strokeX = NaN; this.strokeY = NaN;
  }
  clear() { this.state.fill(0); this.high = 0; this.count = 0; this.kept = 0; this.fly.length = 0; this.flyIds.length = 0; this.version++; }
  add(x, y) {
    let k = -1;
    for (let i = 0; i < this.high; i++) if (this.state[i] === PAD.FREE) { k = i; break; }
    if (k < 0) { if (this.high >= T.cap) return -1; k = this.high++; }
    this.x[k] = x; this.y[k] = y; this.state[k] = PAD.OK; this.cool[k] = -1e9; this.boingAt[k] = -1e9; this.deadAt[k] = -1e9;
    this.count++; this.version++;
    return k;
  }
  remove(k) {
    const s = this.state[k];
    if (s === PAD.FREE) return;
    if (s === PAD.OK) this.count--; else this.kept--;
    this.state[k] = PAD.FREE; this.version++;
    while (this.high > 0 && this.state[this.high - 1] === PAD.FREE) this.high--;
  }
  kill(world, k, how) {                    // torn (2) or burnt (3): stops working, the mat stays for the art
    if (this.state[k] !== PAD.OK) return;
    this.state[k] = how; this.count--; this.kept++; this.deadAt[k] = world.time; this.version++;
    world.emit('rip', { x: this.x[k], y: this.y[k], v: 1, fire: how === PAD.BURNT ? 1 : 0 });
  }
  /** Nearest working pad within reach of (x, y), or -1. */
  padAt(x, y, reach) {
    let best = -1, bd = reach * reach;
    for (let k = 0; k < this.high; k++) {
      if (this.state[k] !== PAD.OK) continue;
      const dx = this.x[k] - x, dy = this.y[k] - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = k; }
    }
    return best;
  }
  near(x, y, r, any) { for (let k = 0; k < this.high; k++) { const s = this.state[k]; if (s === PAD.OK || (any && s !== PAD.FREE)) { const dx = this.x[k] - x, dy = this.y[k] - y; if (dx * dx + dy * dy < r * r) return k; } } return -1; }
}

export function trampOf(world) { let P = world.tramp7; if (P === undefined) P = world.tramp7 = new Tramp7(); return P; }
onWorldClear((world) => { if (world.tramp7 !== undefined) world.tramp7.clear(); });

// ---------------------------------------------------------------- placing
function canPlace(world, x, y) {
  if (x < T.r || y < T.r || x > world.W - T.r || y > world.H - T.r) return false;
  if (world.walls.isSolidAt(x, y) || depthAt(world, x, y) >= DEEP) return false;   // like mines: no walls, no deep water
  if (world.mapBuilding) { const T0 = terrainOf(world), i = cellOf(T0, x, y); if (i >= 0 && T0.depth[i] >= WET && !bridgeAt(world, x, y)) return false; }   // levels are stale mid-build: no painted water
  const L = world.lava7;
  return !(L !== undefined && L.cells > 0 && L.hotAt(world, x, y));               // not on open lava (it would burn)
}
function place(world, P, x, y, spacing) {
  if (P.near(x, y, spacing, false) >= 0 || !canPlace(world, x, y)) return 0;
  const old = P.near(x, y, T.r, true);                    // a torn / burnt mat under the new pad goes
  if (old >= 0) P.remove(old);
  return P.add(x, y) >= 0 ? 1 : 0;
}
/** Pads along the segment, T.spacing apart (a tap = one pad at the point). Returns pads placed. */
export function paintTramp(world, x0, y0, x1, y1) {
  const P = trampOf(world), len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.ceil(len / 4));
  let n = 0;
  if (len < 0.5) return place(world, P, x1, y1, T.spacing);
  for (let s = 1; s <= steps; s++) n += place(world, P, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, T.spacing);
  return n;
}
/** Map painter (maps/index.js): one pad at (x0, y0), at least T.mapSpacing from the next. */
export function mapTramp(world, x0, y0) { return place(world, trampOf(world), x0, y0, T.mapSpacing); }
/** Every pad (working, torn or burnt) whose centre is within r of the segment goes. */
export function eraseTramp(world, x0, y0, x1, y1, r) {
  const P = world.tramp7;
  if (P === undefined || P.count + P.kept === 0) return 0;
  let n = 0;
  for (let k = 0; k < P.high; k++) if (P.state[k] !== PAD.FREE && segDist(P.x[k], P.y[k], x0, y0, x1, y1) <= r) { P.remove(k); n++; }
  return n;
}
export function clearTramp(world) { if (world.tramp7 !== undefined) world.tramp7.clear(); }
/** Blast (chained onto the wallBlast hook): working pads within r + 7 px are torn. */
export function blastTramp(world, x, y, r) {
  const P = world.tramp7;
  if (P === undefined || P.count === 0 || !(r > 0)) return 0;
  const R = r + T.r * T.blastPad;
  let n = 0;
  for (let k = 0; k < P.high; k++) {
    if (P.state[k] !== PAD.OK) continue;
    const dx = P.x[k] - x, dy = P.y[k] - y;
    if (dx * dx + dy * dy < R * R) { P.kill(world, k, PAD.TORN); n++; }
  }
  return n;
}

// ---------------------------------------------------------------- bouncing
function boing(world, P, k, v) {
  P.cool[k] = world.time + T.cool; P.boingAt[k] = world.time;
  world.emit('boing', { x: P.x[k], y: P.y[k], v });
}
function launch(world, P, u) {
  let dx, dy;
  const sp = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
  if (sp > T.standSpeed) { dx = u.vx / sp; dy = u.vy / sp; }
  else { const a = world.rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
  u.vx = dx * OUT; u.vy = dy * OUT; u.vz = VZ; u.pushX = 0; u.pushY = 0;
  const side = Math.abs(dx) > 0.2 ? Math.sign(dx) : world.rng() < 0.5 ? -1 : 1;
  u.spin = (2 * side * Math.PI) / AIR;                    // one flip, as a toss
  u.thrownAt = world.time; u.stun = Math.max(u.stun, AIR + T.stunPad);
  u.prone = 0; u.proneWant = 0;
  u.leaping = LEAP.VAULT;                                 // over walls while up (steering skips wall collision for VAULT)
  if (!P.fly.includes(u)) { P.fly.push(u); P.flyIds.push(u.id); }
}
// A lobbed projectile coming down on (or rolling over) a pad: up again for another 0.9 s hop, same ground speed.
function relaunch(p) { p.life = p.maxLife = AIR; p.apex = T.apex; p.z = Math.max(p.z || 0, 0); }
function projBounce(world, P) {
  const ps = world.projectiles;
  if (!ps || !ps.length) return;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k], kind = p.kind;
    let rolling = false;
    if (kind === 'grenade') { if (p.host >= 0 || !(p.life <= DT)) continue; }
    else if (kind === 'bomb') { if (p.drop === 1) rolling = true; else if (p.drop !== 0 || !(p.life <= DT)) continue; }
    else if (kind === 'boulder') { if (p.roll === 1) rolling = true; else if (p.roll !== 0 || !(p.life <= DT)) continue; }
    else continue;
    const nx = p.x + p.vx * DT, ny = p.y + p.vy * DT, pad = P.padAt(nx, ny, T.r);
    if (pad < 0 || world.time < P.cool[pad]) continue;
    if (rolling) { if (kind === 'bomb') p.drop = 0; else p.roll = 0; }
    relaunch(p);
    boing(world, P, pad, 1);
  }
}
function bodyBounce(world, P) {
  const fb = world.flyingBodies;
  if (!fb || !fb.length) return;
  for (let k = 0; k < fb.length; k++) {
    const c = fb[k];
    if ((c.z || 0) > 0 || c.vz >= VZ * T.bodyMax) continue;                // on the ground: just landed (small bounce) or sliding
    const pad = P.padAt(c.x, c.y, T.r);
    if (pad < 0 || world.time < P.cool[pad]) continue;
    c.vz = VZ; c.z = 0; c.fly = 1;
    boing(world, P, pad, 1);
  }
}
let _w = null, _P = null, _k = -1, _done = false;
function stepOn(u) {
  if (_done || u.dead || !(u.hp > 0) || u.inside >= 0 || u.z > T.groundZ || u.vz > 0 || u.leaping !== 0 || u.climb > 0) return;
  const def = u.def;
  if (def.prop || def.aquatic || u.hidden > 0) return;
  const P = _P, k = _k, dx = u.x - P.x[k], dy = u.y - P.y[k], reach = T.r + T.reach * u.radius;
  if (dx * dx + dy * dy > reach * reach) return;
  if (u.mass > T.maxMass) { P.kill(_w, k, PAD.TORN); _done = true; return; }
  if (_w.time < P.cool[k]) return;
  launch(_w, P, u);
  boing(_w, P, k, Math.min(2, 0.5 + u.mass / 4));
  _done = true;                                           // one per pad per cooldown
}
// Fire under a pad: open lava, burning oil, a burning plank.
function burnsAt(world, x, y) {
  const L = world.lava7;
  if (L !== undefined && L.cells > 0 && L.hotAt(world, x, y)) return true;
  const oil = world.oil;
  if (oil && oil.burning > 0 && oil.burningAt(x, y)) return true;
  const B = world.bridge7;
  if (B !== undefined && B.burning > 0) { const i = B.idx(x, y); if (i >= 0 && B.fire[i] > 0) return true; }
  return false;
}

// ---------------------------------------------------------------- system (after the peels, before ballistics)
export function run(world) {
  const P = world.tramp7;
  if (P === undefined) return;
  // units this set flying: back on the ground = no more wall vaulting
  if (P.fly.length > 0) for (let k = P.fly.length - 1; k >= 0; k--) {
    const u = P.fly[k];
    if (u.dead || u.id !== P.flyIds[k] || (u.z <= 0 && u.vz <= 0)) {
      if (!u.dead && u.id === P.flyIds[k] && u.leaping === LEAP.VAULT) u.leaping = 0;
      P.fly[k] = P.fly[P.fly.length - 1]; P.fly.pop(); P.flyIds[k] = P.flyIds[P.flyIds.length - 1]; P.flyIds.pop();
    }
  }
  if (P.count === 0) return;
  const fireCheck = world.tick % T.fireEvery === 0;
  _w = world; _P = P;
  for (let k = 0; k < P.high; k++) {
    if (P.state[k] !== PAD.OK) continue;
    if (fireCheck && burnsAt(world, P.x[k], P.y[k])) { P.kill(world, k, PAD.BURNT); continue; }
    _k = k; _done = false;
    world.query(P.x[k], P.y[k], T.r + 46, stepOn);
  }
  _w = null; _P = null;
  if (P.count === 0) return;
  projBounce(world, P);
  bodyBounce(world, P);
}

registerSystem('tramp7', run, 'peels');
