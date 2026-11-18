// Siege tab shared pieces (Part 2 step 4, OURS: no OG source). Owner: SIEGE-SIM. Not a unit file.
//  - crews: machines spawn `siegecrew` at fixed slots; crew walk with the machine and fight from the slot; a machine moves
//    at speed x crew alive / crew size and stops firing with no crew; a Siege foot soldier near an empty slot takes it.
//  - siege tower crossing: units of the tower's side walk in, climb 1 s, arc over the wall 1.2 s and land on the far side.
//  - pins (ballista kebab), wall damage, charger detection, pose codes (b.act / b.actT, STEP4.md Siege table).
// Two tick systems: 'siege:cross' after brain (walk-in goals, climb, flight) and 'siege:post' after lifecycle (machine
// list, slot claims, tower pick-ups, pins). Both return at once while the field has no siege machine or pin, so OG
// battles never pay for them and draw no random numbers.
import { F, INT, ENEMY, maskBit } from '../../factions.js';
import { onWorldClear } from '../../world.js';
import { registerSystem } from '../../systems/extra.js';
import { attackHeld } from '../../systems/possess.js';
import { STATE, LEAP, GRAVITY, DT, WALL_TILE, hypot } from '../../const.js';
import { damage, push, toss } from '../../combat/index.js';
import * as AS from '../army/_shared.js';
export { AS as A, attackHeld };
const { setState } = AS;

// ---------------------------------------------------------------- numbers (shared by every Siege unit)
export const CREW = Object.freeze({
  claimEvery: 30,      // ticks between empty-slot checks per machine (staggered by machine id)
  claimRange: 120,     // a Siege foot soldier within this many px of a machine takes its empty slot
  slotStop: 1.5,       // px: close enough to the slot to stand still
  slotGain: 3,         // walk to the slot at 3 x distance px/s (+ the machine's speed), capped at runSpeed
  slotFit: 0.9,        // attack 11-16: a slot is blocked if wall lies within this x the crewman's radius ...
  slotWalk: 2,         // ... then the crewman stands at the first free point from the slot toward the machine, every 2 px
  slotTurns: 12,       // ... or else round the machine at the slot's distance, 15 degree steps each way
});
export const CROSS = Object.freeze({
  pickR: 120,          // px: units of the tower's side this close to a docked tower may cross
  callR: 300,          // px: ... or this close, if they have no path round the wall
  scanEvery: 8,        // ticks between pick-up scans per docked tower
  climbT: 1,           // s: climbing up inside the tower
  overT: 1.2,          // s: the arc over the wall to the far side
  climbH: 26,          // px: tower top (= one OG climb unit, so the renderer lifts them by u.climb x 26)
  climbCap: 3,         // units climbing at once per tower; the rest wait at the door
  walkInMax: 6,        // s: give up walking in after this
  maxR: 16,            // OG-scaled radius: anything bigger can't fit in the tower
  softLand: 70,        // px/s: landing speed at the end of the arc (a soft landing: ~1 hp, 0.3 s stun)
  arcG: 0.35,          // the arc flies at 0.35 x gravity (a 1.2 s hop that tops out ~70 px up, not 170)
});
export const PIN = Object.freeze({ cap: 256 });   // live pins at once

const NO_CLIMB = new Set(['sniper', 'ape', 'snake', 'risen_sniper', 'risen_ape', 'risen_snake']); // own perch / climb brains

// ---------------------------------------------------------------- tiny helpers
export const hyp = hypot;
export function rnd(world) { return world.rng(); }
export function signed(world) { return 2 * world.rng() - 1; }
export function act(world, u, code) { const b = u.b; if (b.act !== code) { b.act = code; b.actT = world.time; } }
export function emit(world, name, data) { world.emit(name, data); }
export function alive(u) { return !!u && !u.dead && !u.removed && u.hp > 0; }
export function isMachine(u) { return u.def.machine === true; }

// Per-world store, reset by Clear.
export function siegeOf(world) {
  let s = world.siege;
  if (!s) {
    s = world.siege = {
      machines: [],            // live machines (crewed or the tower)
      cross: [],               // crossing records in use
      crossFree: [],           // pooled records
      crossing: new Map(),     // unit id -> record
      pins: [],                // {id, x, y, until}
      pinFree: [],
    };
  }
  return s;
}
onWorldClear((w) => { w.siege = null; });

// ---------------------------------------------------------------- walls
const _wp = new Float64Array(2);
/** First wall tile on the segment: writes the point just before it into out, returns true. */
export function wallBetween(world, x0, y0, x1, y1, out) {
  const W = world.walls; if (W.count === 0) return false;
  const f = W.raycast(x0, y0, x1, y1);
  if (!(f <= 1)) return false;
  const dx = x1 - x0, dy = y1 - y0, d = hypot(dx, dy) || 1, back = Math.min(f * d, 1) / d;
  out[0] = x0 + dx * (f - back); out[1] = y0 + dy * (f - back);
  return true;
}
/** Any solid wall tile whose centre is within r of (x, y). */
export function wallNear(world, x, y, r) {
  const W = world.walls; if (W.count === 0) return false;
  const t = W.tile, inv = 1 / t, r2 = r * r;
  const c0 = Math.max(0, Math.floor((x - r) * inv)), c1 = Math.min(W.cols - 1, Math.floor((x + r) * inv));
  const r0 = Math.max(0, Math.floor((y - r) * inv)), r1 = Math.min(W.rows - 1, Math.floor((y + r) * inv));
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    if (W.solid[ty * W.cols + tx] === 0) continue;
    const ex = (tx + 0.5) * t - x, ey = (ty + 0.5) * t - y;
    if (ex * ex + ey * ey <= r2) return true;
  }
  return false;
}
/** Flat damage to every wall tile whose centre is within r; broken tiles go, with a dust puff every few. Returns broken. */
export function hitWalls(world, x, y, r, dmg) {
  const W = world.walls; if (W.count === 0) return 0;
  const t = W.tile, inv = 1 / t, r2 = r * r;
  const c0 = Math.max(0, Math.floor((x - r) * inv)), c1 = Math.min(W.cols - 1, Math.floor((x + r) * inv));
  const r0 = Math.max(0, Math.floor((y - r) * inv)), r1 = Math.min(W.rows - 1, Math.floor((y + r) * inv));
  let hit = 0, broke = 0;
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
    const i = ty * W.cols + tx;
    if (W.solid[i] === 0) continue;
    const cx = (tx + 0.5) * t, cy = (ty + 0.5) * t, ex = cx - x, ey = cy - y;
    if (ex * ex + ey * ey > r2) continue;
    W.hp[i] -= dmg; hit++;
    if (W.hp[i] > 0) continue;
    W.solid[i] = 0; W.hp[i] = 0; W.count--; broke++;
    if ((broke & 3) === 1) world.emit('puff', { kind: 'dust', x: cx, y: cy, ang: world.rng() * Math.PI * 2, size: 1.1 });
  }
  if (hit > 0) W.damageVersion++;
  if (broke > 0) W.version++;
  return broke;
}
/** Free spot on the far side of a wall: walk from (x, y) along (dx, dy) through solid tiles; false if thicker than max. */
export function farSide(world, x, y, dx, dy, max, gap, out) {
  let s = 0, inWall = false;
  for (; s <= max; s += 3) {
    const px = x + dx * s, py = y + dy * s;
    if (px < 0 || py < 0 || px > world.W || py > world.H) return false;
    if (world.walls.isSolidAt(px, py)) inWall = true;
    else if (inWall) break;
  }
  if (!inWall || s > max) return false;
  const ex = x + dx * (s + gap), ey = y + dy * (s + gap);
  if (ex < gap || ey < gap || ex > world.W - gap || ey > world.H - gap) return false;
  if (wallNear(world, ex, ey, gap * 0.6)) return false;
  out[0] = ex; out[1] = ey;
  return true;
}

// ---------------------------------------------------------------- objective (where a machine wants to go)
const _cp = new Float32Array(2);
/** Target unit (or null). out = the point to head for: the target, else the group's contact / intel point. */
export function objective(world, u, memory, out) {
  const t = AS.targetOf(world, u);
  if (t) { out[0] = t.x; out[1] = t.y; return t; }
  if (u.possessed !== 1 && contactPointSafe(world, u, memory, _cp)) { out[0] = _cp[0]; out[1] = _cp[1]; return null; }
  out[0] = NaN; out[1] = NaN;
  return null;
}
function contactPointSafe(world, u, memory, out) { return AS.contactPoint(world, u, null, memory, out); }

// ---------------------------------------------------------------- chargers (shield wall brace, halberd set)
let _cu = null, _cb = null, _cbd = 0, _cms = 0, _ccos = 0;
function chargerOne(o) {
  if (!(o.hp > 0) || o.z > 8) return;
  const vx = o.vx, vy = o.vy, s2 = vx * vx + vy * vy;
  if (s2 < _cms * _cms) return;
  const dx = _cu.x - o.x, dy = _cu.y - o.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, s = Math.sqrt(s2);
  if ((vx * dx + vy * dy) / (s * d) < _ccos) return;   // not coming our way
  if (d < _cbd) { _cbd = d; _cb = o; }
}
/** Nearest enemy within R running at u faster than minSpeed (velocity within acos(cos) of the line to u). */
export function findCharger(world, u, R, minSpeed, cos) {
  _cu = u; _cb = null; _cbd = R; _cms = minSpeed; _ccos = cos;
  world.query(u.x, u.y, R, chargerOne, ENEMY[u.faction]);
  const c = _cb; _cu = null; _cb = null;
  return c;
}
/** Is o (still) charging at u? */
export function stillCharging(u, o, minSpeed, cos, R) {
  if (!alive(o)) return false;
  const dx = u.x - o.x, dy = u.y - o.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, s = hypot(o.vx, o.vy);
  return d <= R && s >= minSpeed && (o.vx * dx + o.vy * dy) / (s * d) >= cos;
}

// ---------------------------------------------------------------- crews
const _sp = new Float64Array(2);
/** World position of slot k of machine m (slots are machine-local [forward, left] x the machine's radius). */
export function slotPos(m, k, out) {
  const s = m.def.crew.slots[k], c = Math.cos(m.heading), n = Math.sin(m.heading), f = s[0] * m.radius, l = s[1] * m.radius;
  out[0] = m.x + c * f - n * l; out[1] = m.y + n * f + c * l;
  return out;
}
// attack 11-16: a machine standing with a wall behind it had slots inside the wall. The crewman walked into the wall, the
// wall push threw it back out, and it walked in again: it jittered every tick for as long as the machine stood there
// (castle map: a ram's crewman sat in the wall over a second). A blocked slot is moved toward the machine to the first
// point where the crewman's body is clear of walls (none: the slot as it was, the wall push decides).
function bodyClear(walls, x, y, r) {
  const t = walls.tile, inv = 1 / t, x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv), y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!walls.isSolidTile(tx, ty)) continue;
    const lx = tx * t, ly = ty * t, dx = x - (x < lx ? lx : x > lx + t ? lx + t : x), dy = y - (y < ly ? ly : y > ly + t ? ly + t : y);
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}
function freeSlot(world, m, u, out) {
  const walls = world.walls;
  if (!walls || walls.count === 0) return out;
  const r = u.radius * CREW.slotFit;
  if (bodyClear(walls, out[0], out[1], r)) return out;
  const sx = out[0], sy = out[1], dx = m.x - sx, dy = m.y - sy, d = hypot(dx, dy);
  for (let s = CREW.slotWalk; s < d; s += CREW.slotWalk) {
    const x = sx + (dx / d) * s, y = sy + (dy / d) * s;
    if (bodyClear(walls, x, y, r)) { out[0] = x; out[1] = y; return out; }
  }
  // nothing clear on the way in (a thin wall between slot and machine): round the machine at the slot's distance
  const a0 = Math.atan2(-dy, -dx), rr = Math.max(d, m.radius + u.radius);
  for (let k = 1; k <= CREW.slotTurns; k++) for (let sg = -1; sg <= 1; sg += 2) {
    const a = a0 + sg * k * (Math.PI / CREW.slotTurns), x = m.x + Math.cos(a) * rr, y = m.y + Math.sin(a) * rr;
    if (x > r && y > r && x < world.W - r && y < world.H - r && bodyClear(walls, x, y, r)) { out[0] = x; out[1] = y; return out; }
  }
  return out;
}
/** Machine init: register it and spawn its crew at the slots. */
export function machineInit(world, m) {
  const b = m.b, C = m.def.crew;
  b.act = 0; b.actT = 0; b.victim = -1;
  siegeOf(world).machines.push(m);
  if (!C) { b.crew = null; return; }
  const n = C.slots.length;
  b.crew = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    slotPos(m, k, _sp);
    const c = world.spawn(C.type || 'siegecrew', _sp[0], _sp[1], { group: m.group, team: m.team, heading: m.heading, faction: m.faction, like: m });
    if (!c) break;
    const x0 = _sp[0], y0 = _sp[1];
    freeSlot(world, m, c, _sp);                      // attack 11-16: not inside a wall behind the machine
    if (_sp[0] !== x0 || _sp[1] !== y0) { c.x = c.px = _sp[0]; c.y = c.py = _sp[1]; }
    take(m, c, k);
  }
}
function take(m, c, k) { m.b.crew[k] = c.id; c.b.machine = m.id; c.b.slot = k; }
/** Live crew in their slots (frees slots of the dead and of crew who left). */
export function crewAlive(world, m) {
  const cr = m.b.crew; if (!cr) return 0;
  let n = 0;
  for (let k = 0; k < cr.length; k++) {
    const id = cr[k]; if (id < 0) continue;
    const c = world.unitById(id);
    if (c && c.hp > 0 && c.b.machine === m.id && c.b.slot === k) n++; else cr[k] = -1;
  }
  return n;
}
/** Speed / fire factor: crew alive / crew size (1 for a self-moving machine). */
export function crewFactor(world, m) { const cr = m.b.crew; return cr ? crewAlive(world, m) / cr.length : 1; }
export function leaveDuty(u) { u.b.machine = -1; u.b.slot = -1; }
/** On a machine's death: its crew fight on as soldiers. */
export function freeCrew(world, m) {
  const cr = m.b.crew; if (!cr) return;
  for (let k = 0; k < cr.length; k++) { const c = world.unitById(cr[k]); if (c && c.b.machine === m.id) leaveDuty(c); cr[k] = -1; }
}
/** Foot soldier init (every Siege foot type): not on a machine. */
export function footInit(u) { const b = u.b; b.machine = -1; b.slot = -1; b.act = 0; b.actT = 0; b.victim = -1; }
/**
 * After a foot soldier's own brain: on crew duty it keeps the brain's attack (swing, shot, throw) but walks to its
 * slot instead. Returns true while on duty.
 */
export function crewDuty(world, u) {
  const b = u.b; if (!(b.machine >= 0)) return false;
  const m = world.unitById(b.machine);
  if (!m || !(m.hp > 0) || u.possessed === 1 || u.state === STATE.FLEE || !m.b.crew || m.b.crew[b.slot] !== u.id) { leaveDuty(u); return false; }
  if (u.stun > 0 || u.z > 0 || u.climb > 0) return true;
  slotPos(m, b.slot, _sp);
  freeSlot(world, m, u, _sp);                        // attack 11-16: never a slot inside a wall
  const dx = _sp[0] - u.x, dy = _sp[1] - u.y, d = hypot(dx, dy);
  const sp = d < CREW.slotStop ? 0 : Math.min(u.def.runSpeed, CREW.slotGain * d + hypot(m.vx, m.vy));
  u.goalX = d > 0.001 ? (dx / d) * sp : 0; u.goalY = d > 0.001 ? (dy / d) * sp : 0;
  u.pathing = 1;                                     // no formation pull while crewing
  if (u.state === STATE.ADVANCE || u.state === STATE.CHARGE) setState(u, STATE.ALERT);
  if (!(u.target >= 0) || u.face !== u.face) u.face = m.heading;
  return true;
}
/** Wrap a foot soldier brain with crew duty. */
export function footBrain(raw) { return function (world, u, dt) { raw(world, u, dt); crewDuty(world, u); }; }

let _mm = null, _mbest = null, _mbd = 0;
function claimOne(o) {
  if (o === _mm || !(o.hp > 0) || o.def.siegeFoot !== true || o.faction !== _mm.faction || o.b.machine >= 0) return;
  if (o.possessed === 1 || o.state === STATE.FLEE || o.z > 0 || o.climb > 0 || o.leaping !== 0) return;
  const d = hypot(o.x - _mm.x, o.y - _mm.y) - (o.type === 'siegecrew' ? 40 : 0);   // a loose crewman first
  if (d < _mbd) { _mbd = d; _mbest = o; }
}
function claimSlots(world, m) {
  const cr = m.b.crew; if (!cr) return;
  crewAlive(world, m);
  let k = -1; for (let j = 0; j < cr.length; j++) if (cr[j] < 0) { k = j; break; }
  if (k < 0) return;
  _mm = m; _mbest = null; _mbd = Infinity;
  world.query(m.x, m.y, CREW.claimRange + m.radius, claimOne, maskBit(m.faction));
  const c = _mbest; _mm = null; _mbest = null;
  if (c) { take(m, c, k); world.emit('crew', { x: c.x, y: c.y, id: c.id, machine: m.id, type: c.type }); }
}

// ---------------------------------------------------------------- pins (ballista: skewered units stuck where it stopped)
export function addPin(world, u, x, y, t) {
  const S = siegeOf(world); if (S.pins.length >= PIN.cap) return;
  const p = S.pinFree.pop() || { id: -1, x: 0, y: 0, until: 0 };
  p.id = u.id; p.x = x; p.y = y; p.until = world.time + t;
  S.pins.push(p);
  if (u.stun < t) u.stun = t;
  u.vx = 0; u.vy = 0;
}
function holdPins(world, S) {
  const L = S.pins;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i], u = world.unitById(p.id), left = p.until - world.time;
    if (!u || !(u.hp > 0) || left <= 0) { L[i] = L[L.length - 1]; L.pop(); S.pinFree.push(p); continue; }
    u.x = p.x; u.y = p.y; u.vx = 0; u.vy = 0;
    if (u.stun < left) u.stun = left;
  }
}

// ---------------------------------------------------------------- siege tower crossing
// Tower b: docked (0/1), wx, wy (wall point), dx, dy (crossing direction), ex, ey (landing point on the far side).
function canClimb(u) {
  const d = u.def;
  return !d.machine && !d.prop && !d.hopper && !d.aquatic && !d.flying && u.radius <= CROSS.maxR && !NO_CLIMB.has(u.type);
}
function crossFree(u) { return u.z <= 0 && u.vz <= 0 && u.climb === 0 && u.perch < 0 && u.leaping === 0; }
/** Is (x, y) on the far side of the tower's wall? */
export function farOf(tw, x, y) { const b = tw.b; return (x - b.wx) * b.dx + (y - b.wy) * b.dy > 2; }
/** Start a crossing for u through tower tw at phase 0 (walk in) or 1 (straight to the climb). */
export function startCross(world, u, tw, phase) {
  const S = siegeOf(world);
  if (S.crossing.has(u.id)) return null;
  const r = S.crossFree.pop() || { id: -1, tower: -1, phase: 0, t0: 0, slot: 0 };
  r.id = u.id; r.tower = tw.id; r.phase = 0; r.t0 = world.time; r.slot = 0;
  S.cross.push(r); S.crossing.set(u.id, r);
  if (phase === 1) beginClimb(world, u, tw, r);
  return r;
}
function dropCross(S, i) {
  const r = S.cross[i]; S.crossing.delete(r.id);
  S.cross[i] = S.cross[S.cross.length - 1]; S.cross.pop(); S.crossFree.push(r);
}
function climbers(S, tw) { const L = S.cross; let n = 0; for (let k = 0; k < L.length; k++) if (L[k].tower === tw.id && L[k].phase === 1) n++; return n; }
function beginClimb(world, u, tw, r) {
  r.phase = 1; r.t0 = world.time; r.slot = (u.id % 3) - 1;
  u.perch = tw.id; u.climb = 0.01; u.vx = 0; u.vy = 0; // blows on a climber land on the tower (OG perch rule)
  world.emit('climb', { x: u.x, y: u.y, id: u.id, tower: tw.id, type: u.type });
}
function launch(world, u, tw, r) {
  const b = tw.b, T = CROSS.overT, z0 = CROSS.climbH;
  u.perch = -1; u.climb = 0; u.hidden = 0;
  u.x = tw.x + b.dx * tw.radius * 0.3; u.y = tw.y + b.dy * tw.radius * 0.3; u.px = u.x; u.py = u.y;
  u.z = u.pz = z0; u.vz = (0.5 * CROSS.arcG * GRAVITY * T * T - z0) / T;
  u.vx = (b.ex - u.x) / T; u.vy = (b.ey - u.y) / T;
  u.leaping = LEAP.VAULT;                            // no steering, no wall collision while over the wall
  r.phase = 2; r.t0 = world.time;
  world.emit('throw', { x: u.x, y: u.y, v: 0.6, type: u.type, cross: 1 });
}
export function towerDocked(tw) { return !!tw && tw.b.docked === 1 && tw.hp > 0 && !tw.dead; }

function stepCross(world, S) {
  const L = S.cross, now = world.time;
  for (let i = L.length - 1; i >= 0; i--) {
    const r = L[i], u = world.unitById(r.id), tw = world.unitById(r.tower);
    if (!u || !(u.hp > 0)) { dropCross(S, i); continue; }
    if (r.phase === 0) {
      if (!towerDocked(tw) || u.possessed === 1 || u.state === STATE.FLEE || u.stun > 0.4 || !crossFree(u) || now - r.t0 > CROSS.walkInMax) { dropCross(S, i); continue; }
      const dx = tw.x - u.x, dy = tw.y - u.y, d = hypot(dx, dy) || 0.001, door = tw.radius + u.radius + 4;
      if (d <= door) {
        if (climbers(S, tw) < CROSS.climbCap) { beginClimb(world, u, tw, r); continue; }
        u.goalX = 0; u.goalY = 0; u.pathing = 1; u.face = Math.atan2(dy, dx); continue;   // wait at the door
      }
      const sp = u.def.runSpeed || u.def.walkSpeed;
      u.goalX = (dx / d) * sp; u.goalY = (dy / d) * sp; u.pathing = 1;
      if (u.state !== STATE.ENGAGE) setState(u, STATE.ADVANCE);
      continue;
    }
    if (r.phase === 1) {
      if (!towerDocked(tw) || u.perch !== tw.id || !(u.climb > 0)) {   // tower gone or undocked, or knocked out of it
        if (u.perch === r.tower) { u.perch = -1; u.climb = 0; }
        dropCross(S, i); continue;
      }
      const b = tw.b, k = Math.min(1, (now - r.t0) / CROSS.climbT);
      u.x = tw.x - b.dy * r.slot * 5; u.y = tw.y + b.dx * r.slot * 5; u.vx = 0; u.vy = 0; u.goalX = 0; u.goalY = 0;
      u.climb = Math.max(0.01, k);
      if (k >= 1) launch(world, u, tw, r);
      continue;
    }
    // phase 2: over the wall (physics flies it; steering and wall collision skip a vaulting unit)
    if (u.leaping !== LEAP.VAULT) { dropCross(S, i); continue; }
    if (u.z <= 0 && u.vz <= 0) { u.leaping = 0; dropCross(S, i); world.emit('crossed', { x: u.x, y: u.y, id: u.id, type: u.type }); continue; }
    if (u.thrownAt > r.t0) { u.leaping = 0; dropCross(S, i); continue; }   // blown off mid-air: an ordinary toss now
    u.vz += GRAVITY * (1 - CROSS.arcG) * DT;                                  // steering's gravity pass takes g x dt off again
    if (u.z + (u.vz - GRAVITY * DT) * DT <= 0 && u.vz < -CROSS.softLand) u.vz = -CROSS.softLand + GRAVITY * DT; // soft landing
  }
}

let _tw = null, _tS = null, _tWorld = null;
function pickOne(o) {
  const tw = _tw, world = _tWorld;
  if (o === tw || !(o.hp > 0) || o.faction !== tw.faction || o.possessed === 1 || o.stun > 0 || o.state === STATE.FLEE) return;
  if (!canClimb(o) || !crossFree(o) || _tS.crossing.has(o.id)) return;
  if (o.def.siegeFoot === true && o.b.machine >= 0) return;          // crewing a machine
  if (farOf(tw, o.x, o.y)) return;                                    // already across
  const d = hypot(o.x - tw.x, o.y - tw.y);
  let goal = false;
  const t = o.target >= 0 ? world.unitById(o.target) : null;
  if (t) goal = farOf(tw, t.x, t.y) && o.los !== 1;
  else if (o.group >= 0) { const G = world.groups; if (G.contactAge[o.group] < 6 && farOf(tw, G.contactX[o.group], G.contactY[o.group])) goal = true; }
  if (!goal) return;
  if (d > CROSS.pickR) {                                              // farther out: only units with no way round
    const nav = world.nav; if (!nav || !nav.dist || !nav.dist[o.faction]) return;
    const cx = Math.min(nav.cols - 1, Math.max(0, Math.floor(o.x / nav.cell))), cy = Math.min(nav.rows - 1, Math.max(0, Math.floor(o.y / nav.cell)));
    if (nav.ready[o.faction] === 1 && nav.dist[o.faction][cy * nav.cols + cx] !== Infinity) return;
  }
  startCross(world, o, tw, 0);
}
function scanTower(world, S, tw) {
  _tw = tw; _tS = S; _tWorld = world;
  world.query(tw.x, tw.y, CROSS.callR, pickOne, maskBit(tw.faction));
  _tw = null; _tS = null; _tWorld = null;
}

// The player's unit walks into a docked tower of its side (stick toward it, touching): up it goes.
function possessedIn(world, S, tw) {
  const P = world.possess; if (!P || P.id < 0) return;
  const u = world.unitById(P.id);
  if (!u || !(u.hp > 0) || u.faction !== tw.faction || !canClimb(u) || !crossFree(u) || S.crossing.has(u.id) || u.stun > 0) return;
  const dx = tw.x - u.x, dy = tw.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d > tw.radius + u.radius + 6 || farOf(tw, u.x, u.y)) return;
  const m = hypot(P.mx, P.my); if (m < 0.3 || (P.mx * dx + P.my * dy) / (m * d) < 0.3) return;
  if (u.def.siegeFoot === true && u.b.machine >= 0) leaveDuty(u);
  if (climbers(S, tw) < CROSS.climbCap) startCross(world, u, tw, 1);
}

// ---------------------------------------------------------------- systems
function runCross(world) {
  const S = world.siege; if (!S || S.cross.length === 0) return;
  stepCross(world, S);
}
function runPost(world) {
  const S = world.siege; if (!S) return;
  const M = S.machines;
  for (let i = M.length - 1; i >= 0; i--) {
    const m = M[i];
    if (m.dead || m.removed) { M[i] = M[M.length - 1]; M.pop(); continue; }
    if (!(m.hp > 0)) continue;
    if (m.b.crew && (world.tick + m.id) % CREW.claimEvery === 0) claimSlots(world, m);
    if (m.b.docked === 1) {
      if ((world.tick + m.id) % CROSS.scanEvery === 0) scanTower(world, S, m);
      possessedIn(world, S, m);
    }
  }
  if (S.pins.length) holdPins(world, S);
}
registerSystem('siege:cross', runCross, 'brain');
registerSystem('siege:post', runPost, 'lifecycle');

// ---------------------------------------------------------------- shared def blocks
// People (Siege foot soldiers + crew): drilled-army flock and steady morale (ours).
export const FOOT_FLOCK = Object.freeze({
  personalSpace: 1.2, separation: 34, alignment: 0.3, cohesion: 0, formation: 1.2, herd: 0, herdSpacing: 0,
  flockByState: [1, 1, 0.3, 1, 0.3, 0.25], formationByState: [1, 1, 0.35, 1, 0, 0],
});
export const FOOT_MORALE = Object.freeze({
  baseline: 0.88, oddsWeight: 0.4, fearWeight: 0, casualtyWeight: 0.1, woundWeight: 0.1, hitShock: 0, suppression: 0,
  canBreak: true, breakAt: 0.18, rallyAt: 0.5, minFleeTime: 2, dropRate: 2.5, recoverRate: 0.3, panicFear: 0.4, deathFear: 0.6,
});
// Machines: no morale, never break, barely flock (they are carts).
export const MACHINE_FLOCK = Object.freeze({
  personalSpace: 1.05, separation: 12, alignment: 0, cohesion: 0, formation: 0, herd: 0, herdSpacing: 0,
  flockByState: [1, 1, 0.2, 1, 0.2, 0], formationByState: [0, 0, 0, 0, 0, 0],
});
/** Base def of a wooden machine (spread it, then override). */
export function machineBase() {
  return {
    category: 'siege', faction: F.Side, machine: true, infectable: false, flammability: 0.9, burnTime: 7, conductivity: 1,
    melee: false, locomotion: 0, turnRate: 1.6, turnSpeedFalloff: Infinity, stickyTarget: true, reactionTime: 0.3,
    huntRange: Infinity, minDistance: 0, drilled: false, intelligence: INT.Animal, mines: true, density: 4,
    flock: MACHINE_FLOCK, look: { attack: { time: 0.4 } },
  };
}
/** Base def of a Siege foot soldier. */
export function footBase() {
  return {
    category: 'siege', faction: F.Side, siegeFoot: true, infectable: true, flammability: 0.3, conductivity: 2,
    risenMode: 'body',   // the necro raises them / zombies turn them like OG soldiers (risen.js STEP4 hook); machines have none
    locomotion: 0, turnSpeedFalloff: Infinity, huntRange: Infinity, intelligence: INT.Trained, radiusJitter: 0.06,
    flock: FOOT_FLOCK, morale: FOOT_MORALE,
  };
}
/** Damage helper re-exports so unit files import one module. */
export { damage, push, toss };
export const PUSH = push;
/** Is the player attacking with this (possessed) unit right now? */
export function playerFiring(world, u) { return u.possessed === 1 && attackHeld(world); }
/** Does the AI (or the player) want this unit to attack? A possessed unit attacks only while the attack is held. */
export function mayAttack(world, u) { return u.possessed !== 1 || attackHeld(world); }
/** Stick pushed (possessed): scale the goal by the crew factor (possessMove hook of crewed machines). */
export function crewScaledStick(world, u, mx, my) {
  if (mx * mx + my * my <= 0.0144) return;
  const k = crewFactor(world, u); u.goalX *= k; u.goalY *= k;
}
export { STATE, LEAP, GRAVITY, DT, WALL_TILE, F, INT, ENEMY };

// ---------------------------------------------------------------- one melee soldier (crew sword, halberd chop, oil ladle)
// W: {reachGap, damage, jitter, push, stun, cooldown, cdJit, facing, runUnder, circle, memory}. Knight-style (OG game.js:
// 12931-12991 is the pattern): walk / run in, circle, strike within reach when facing it. Returns 'engaged' | 'moving' | 'idle'.
export function meleeBrain(world, u, W) {
  const D = u.def;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return 'idle'; }
  const t = AS.targetOf(world, u);
  if (u.state === STATE.FLEE) { AS.flee(world, u, t, D.runSpeed); return 'idle'; }
  if (!t) { if (AS.followContact(world, u, D.walkSpeed, W.memory || 5)) return 'moving'; setState(u, STATE.IDLE); return 'idle'; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, reach = u.radius + t.radius + W.reachGap;
  if (d > reach) {
    const run = d < W.runUnder + W.reachGap;
    setState(u, run ? STATE.CHARGE : STATE.ADVANCE);
    AS.advance(world, u, t, dx, dy, AS.hasLos(world, u), run ? D.runSpeed : D.walkSpeed);
    return 'moving';
  }
  setState(u, STATE.ENGAGE); AS.markEngaged(world, u.group);
  const a = Math.atan2(dy, dx);
  u.face = a;
  AS.circle(u, t, dx, dy, d, D, W.circle, true);
  AS.oddsPush(world, u, t, dx, dy, d, D);
  if (u.cooldown > 0 || Math.abs(AS.angDiff(u.heading, a)) > W.facing) return 'engaged';
  AS.strike(world, u, t, dx / d, dy / d, W.damage + W.jitter * signed(world), W.push, W.stun);
  AS.setAttack(u); u.cooldown = W.cooldown + W.cdJit * world.rng();
  return 'engaged';
}
