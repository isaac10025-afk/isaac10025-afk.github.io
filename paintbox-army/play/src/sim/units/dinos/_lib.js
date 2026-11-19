// Dinosaurs tab shared helpers (Part 2 step 4, OURS: no OG source, our own design). Owner: DINOS-SIM.
// Contract: STEP4.md (Dinosaurs table: tricks, starting numbers, b.act pose codes). Nothing here is a unit def.
//  - dino(def): registers a unit with the tab's defaults (faction Dinosaurs, Animal, category 'dinos').
//  - small brain pieces every dino uses: pose codes (b.act), approach, idle, flee, bite.
//  - three world systems (registerSystem, sim/systems/extra.js):
//      dinoSense (after perception): the spitter's blindness runs out; a blinded melee unit swings at whoever is nearest
//        (friend or foe); melee units can't target a ptero up in the air; units a trex roar sent running come back after 2 s.
//      dinoFlung (after steering): a victim thrown by a trex or dropped by a ptero lands: extra fall damage, and whoever it
//        lands on is hurt and knocked down.
// Per-world state lives in a WeakMap (reset by Clear). No allocation per tick; no random draws unless a dino acts.
import { registerUnit } from '../../defs.js';
import { F, ENEMY, ALL_MASK, INT, maskWithout, maskHas, isHostile } from '../../factions.js';
import { STATE, LEAP, GRAVITY, WET, hypot, angleDiff } from '../../const.js';
import { damage, push, toss, stun, infect, perchOf, blockFrac, splatNoise, depthAt, fleeSteer, meleeStrike, hooks } from '../../combat/index.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { attackHeld } from '../../systems/possess.js';
import { roam as animalRoam } from '../animals/lib.js';

export { STATE, LEAP, GRAVITY, WET, hypot, angleDiff, F, ENEMY, INT };
export { damage, push, toss, stun, infect, perchOf, blockFrac, splatNoise, depthAt, meleeStrike, hooks };

// Shared numbers (ours; the user tunes them).
export const DINO = {
  MARGIN: 46,          // max unit radius, added to radius queries (same margin as the core's)
  BLIND_SIGHT: 55,     // a blinded unit sees 55 px: the game's existing blind rule (perception.js), STEP4 said 50
  SKY: 30,             // a flyer higher than this (z px) is out of melee reach: melee units won't target it
  GROUNDED: 6,         // a unit higher than this is in the air: stomps, swipes and charges pass under it
  KNOCK_PUSH: 160,     // whoever a flung body lands on: pushed out this hard (÷ its mass) ...
  KNOCK_STUN: 0.6,     // ... and down this long (s)
  FLUNG_LIFE: 4,       // s: a flung body that hasn't landed by then is forgotten
  PROPS_OUT: maskWithout(ALL_MASK, F.Props),   // "anyone": every faction but trees / barrels / anthills
};

// ---------------------------------------------------------------- defs
const DINO_FLOCK = { personalSpace: 1.2, separation: 35, alignment: 0.05, cohesion: 0.05, formation: 0, herd: 0.2, herdSpacing: 18,
  idleSpread: 2, flockByState: [1, 0.4, 0.15, 0.3, 0.1, 0.4], formationByState: [0, 0, 0, 0, 0, 0] };
const DINO_MORALE = { baseline: 0.9, oddsWeight: 0.3, fearWeight: 0.05, casualtyWeight: 0.1, woundWeight: 0.3, hitShock: 0.02, suppression: 0,
  canBreak: true, breakAt: 0.25, rallyAt: 0.5, minFleeTime: 2.5, dropRate: 3, recoverRate: 0.3, panicFear: 0.1, deathFear: 0.2 };

/** Register a dinosaur. `over` = the unit's own fields (radius, maxHp, speeds, brain, hooks...). */
export function dino(over) {
  return registerUnit({
    category: 'dinos', faction: F.Side, intelligence: INT.Animal, infectable: true, melee: true,
    locomotion: 0, radiusJitter: 0.06, accel: 600, decel: 600, turnRate: 5, turnSpeedFalloff: Infinity,
    sightRange: 300, alertSightRange: 360, stickyTarget: true, reactionTime: 0.25, huntRange: Infinity, minDistance: 0,
    drilled: false, flammability: 0.5, density: 1.5, iceGrip: 0.4,
    risenMode: 'keep',   // risen.js builds risen_<type>: same brain and tricks, Undead (the necro raises them, zombies turn them)
    ...over,
    flock: { ...DINO_FLOCK, ...(over.flock || {}) },
    morale: { ...DINO_MORALE, ...(over.morale || {}) },
    look: { attack: { time: 0.35 }, ...(over.look || {}) },
  });
}
/** Every dino's u.b starts with the same keys (one hidden class). act/actT/victim = the pose contract (STEP4.md). */
export function initBag(w, u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1; b.prey = -1;
  b.next = 0; b.next2 = 0; b.t0 = 0; b.t1 = 0;
  b.x0 = 0; b.y0 = 0; b.dx = 0; b.dy = 0; b.k = -1; b.seen = 0;
  u.subState = 0; u.leaping = 0;
}

// ---------------------------------------------------------------- brain pieces
export const unitOf = (w, id) => (id >= 0 ? w.unitById(id) : null);
/** The current target if it still lives, else -1 and null. */
export function targetOf(w, u) {
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0) return t;
  u.target = -1; return null;
}
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }
/** Pose code (STEP4.md table): b.act + the time it started. */
export function act(w, u, code) { if (u.b.act !== code) { u.b.act = code; u.b.actT = w.time; } }
/** A target-free attack (tail swipe, club, stomp, roar) may go off: always on its own, only while the player attacks when possessed. */
export function canAuto(w, u) { return u.possessed !== 1 || attackHeld(w); }
export function clearLine(w, u) { return u.los === 1 || w.walls.count === 0; }
export function high(o) { return o.z > DINO.SKY && o.def.flies === true; }
export function grounded(o) { return !(o.z > DINO.GROUNDED) && !(o.climb > 0); }
export function isRisen(u) { return u.def.risenFrom !== undefined; }
export function isHostileTo(a, b) { return maskHas(ENEMY[a.faction], b.faction) === 1; }
/** Walk / run at the target (flow field around walls); faces it when the line is clear. */
export function hunt(w, u, t, speed, state = STATE.ADVANCE) {
  setState(u, state);
  const clear = clearLine(w, u);
  moveTo(w, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(t.y - u.y, t.x - u.x);
}
/** No target: follow the group's contact, else wander slowly. */
export function idle(w, u) {
  if (followGroup(w, u, u.def.walkSpeed, 6)) return;
  setState(u, STATE.IDLE);
  animalRoam(w, u, 0.5 * u.def.walkSpeed, u.radius + 24);
}
/** Morale broke (or a roar): run. Returns true if it did. */
export function fleeing(w, u, t) {
  if (u.state !== STATE.FLEE) return false;
  fleeSteer(w, u, t, u.def.runSpeed);
  return true;
}
/** Plain bite / jab: meleeStrike + infection when it's a risen copy. Returns the pass fraction. */
export function bite(w, u, t, dmg, every, pushF = 60, stunT = 0.1) {
  const pass = meleeStrike(w, u, t, { damage: dmg, damageJitter: 0.1 * dmg, push: pushF, stun: stunT, cooldown: every, cooldownJitter: 0.15 * every });
  if (isRisen(u)) infect(w, perchOf(w, t), u, 0.5 * pass, 0);
  return pass;
}
/** Damage from its own spot (beats shields: a pin, a jaw), + infection for risen copies. */
export function chew(w, u, v, dmg) {
  const pass = damage(w, v, dmg, u, undefined, v.x, v.y);
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  w.emit('strike', { x: v.x, y: v.y, v: 1, type: u.type });
  return pass;
}
/** Is v's braced shield facing a blow from (sx, sy)? (legion, shield walls: chargers bounce off) */
export function braced(v, sx, sy) { const sh = v.def.shield; return !!sh && sh.brace > 0 && blockFrac(v, sx, sy) > 0; }
/** Can this unit be lifted / pinned / grabbed at all? */
export function grabbable(o, maxMass) {
  const d = o.def;
  return o.mass <= maxMass && !d.prop && !d.untossable && !d.boss && o.hurled !== 1 && grounded(o) && o.leaping === 0 && o.hp > 0;
}
/** Knock down: push away from (x, y) + stun. */
function knockDown(w, o, x, y, f, t) {
  const dx = o.x - x, dy = o.y - y, d = hypot(dx, dy) || 0.001;
  push(w, o, dx / d, dy / d, f, t);
}
/** Toss u so it lands about `dist` px away along (dx, dy) with upward speed `up` (toss's own mass scaling taken out). */
export function tossTo(w, u, dx, dy, dist, up) {
  const k = 1 / Math.sqrt(Math.max(1, u.mass)), h = up * k;
  const air = (h + Math.sqrt(h * h + 2 * GRAVITY * Math.max(0, u.z))) / GRAVITY;   // real flight time (up h from height z)
  toss(w, u, dx, dy, dist / Math.max(0.05, k * air), up);
}
/** Hold a victim at a point: still, stunned (the holder also sets its hurled = 1: that keeps every other grabber off it). */
export function glue(v, x, y, z, vx, vy) {
  v.x = x; v.y = y; v.z = v.pz = Math.max(2, z); v.vz = 0; v.vx = vx; v.vy = vy; v.spin = 0;
  if (v.stun < 0.3) v.stun = 0.3;
}

// ---------------------------------------------------------------- per-world state
const WS = new WeakMap();
function ws(w) {
  let s = WS.get(w);
  if (!s) { s = { blind: [], flung: [], fled: [], free: [], skyTick: -10 }; WS.set(w, s); }
  return s;
}
onWorldClear((w) => { const s = WS.get(w); if (s) { s.blind.length = 0; s.flung.length = 0; s.fled.length = 0; s.skyTick = -10; } });
function rec(s) { return s.free.pop() || { id: -1, by: -1, until: 0, t0: 0, prev: 0, self: 0, hit: 0 }; }
function drop(s, list, k) { s.free.push(list[k]); list[k] = list[list.length - 1]; list.pop(); }
/** A ptero is up: melee units drop it as a target this tick and next (dinoSense). */
export function markSky(w) { ws(w).skyTick = w.tick; }

/** Blind v for t s (spitter): u.blind = 1 (sight 55, shots spray, melee hits whoever is nearest), target lost. */
export function blindFor(w, v, t) {
  if (!v || v.def.prop || !(v.hp > 0)) return;
  const s = ws(w);
  for (let k = 0; k < s.blind.length; k++) if (s.blind[k].id === v.id) { s.blind[k].until = Math.max(s.blind[k].until, w.time + t); return; }
  const e = rec(s); e.id = v.id; e.until = w.time + t; e.prev = v.blind | 0;
  s.blind.push(e);
  v.blind = 1; v.target = -1;
  w.emit('blinded', { x: v.x, y: v.y, id: v.id, type: v.type, t });
}
/** Is v blinded by spit right now? */
export function spitBlind(w, v) { const s = WS.get(w); if (!s) return false; for (const e of s.blind) if (e.id === v.id) return true; return false; }
/** A roar sent v running for t s: back to its own brain when it runs out (unless its morale really broke). */
export function fleeFor(w, v, t, fromX, fromY) {
  if (v.possessed === 1) return;
  setState(v, STATE.FLEE);
  if (!(v.startle > w.time + t)) { v.startle = w.time + t; v.startleX = fromX; v.startleY = fromY; }   // brains that run from a startle (boar, horses) too
  const s = ws(w);
  for (let k = 0; k < s.fled.length; k++) if (s.fled[k].id === v.id) { s.fled[k].until = w.time + t; return; }
  const e = rec(s); e.id = v.id; e.until = w.time + t; s.fled.push(e);
}
/** v was just thrown / dropped by `by`: when it lands it takes `self` more damage (not in water) and hits whoever it lands on for `hit`. */
export function flung(w, v, by, self, hit) {
  const s = ws(w);
  for (let k = 0; k < s.flung.length; k++) if (s.flung[k].id === v.id) { drop(s, s.flung, k); break; }
  const e = rec(s); e.id = v.id; e.by = by ? by.id : -1; e.t0 = w.time; e.until = w.time + DINO.FLUNG_LIFE; e.self = self; e.hit = hit;
  s.flung.push(e);
}

function sense(w) {
  const s = WS.get(w); if (!s) return;
  const now = w.time;
  for (let k = s.blind.length - 1; k >= 0; k--) {
    const e = s.blind[k], v = w.unitById(e.id);
    if (!v || !(v.hp > 0) || now >= e.until) {
      if (v && e.prev === 0) v.blind = 0;
      // ATTACK3 L3: it sees again: a friend it was swinging at blind is no target any more (OG's chooseTarget keeps a
      // close current target without asking whose side it is on: blinded giants stood "fighting" each other for good)
      if (v && v.target >= 0) { const t = w.unitById(v.target); if (t && !isHostile(v, t)) v.target = -1; }
      drop(s, s.blind, k); continue;
    }
    v.blind = 1;
    // melee swings go at whoever is nearest within the blind sight, friend or foe (the player still aims a possessed one)
    if (v.def.melee && v.possessed !== 1 && !v.def.prop) {
      const o = w.findNearest(v.x, v.y, DINO.BLIND_SIGHT, DINO.PROPS_OUT, v, 0);
      v.target = o ? o.id : -1;
      if (o) v.los = 1;
    }
  }
  for (let k = s.fled.length - 1; k >= 0; k--) {
    const e = s.fled[k], v = w.unitById(e.id);
    if (!v) { drop(s, s.fled, k); continue; }
    if (now < e.until) continue;
    const m = v.def.morale;
    if (v.state === STATE.FLEE && (!m || !m.canBreak || v.morale >= m.breakAt)) setState(v, STATE.IDLE);
    drop(s, s.fled, k);
  }
  if (s.skyTick >= w.tick - 1) {
    const us = w.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.dead || u.target < 0 || !u.def.melee || u.possessed === 1 || u.def.flies) continue;
      const t = w.unitById(u.target);
      if (!t || !high(t)) continue;
      const o = w.findNearest(u.x, u.y, u.def.alertSightRange || 300, ENEMY[u.faction], t, 1);
      u.target = o && !high(o) ? o.id : -1;
    }
  }
}

const LQ = new Array(32);
function landed(w, v, e) {
  if (depthAt(w, v.x, v.y) >= WET) { w.emit('splash', { x: v.x, y: v.y, v: 1.5 }); return; }
  // STEP6 (lead): from = the unit's own spot, so a shield facing the thrower doesn't block a body falling from above
  if (e.self > 0) damage(w, v, e.self, e.by, 'thrown', v.x, v.y);
  const n = w.queryMask(v.x, v.y, v.radius + DINO.MARGIN + 4, DINO.PROPS_OUT, LQ, LQ.length);
  for (let k = 0; k < n; k++) {
    const o = LQ[k]; LQ[k] = null;
    if (o === v || o.dead || !(o.hp > 0) || o.z > 2 * v.radius || o.climb > 0) continue;   // a unit the body just bowled over (domino) still counts
    const d = hypot(o.x - v.x, o.y - v.y);
    if (d > v.radius + o.radius + 4) continue;
    damage(w, o, e.hit, e.by, 'thrown', o.x, o.y);
    if (o.hp > 0) knockDown(w, o, v.x, v.y, DINO.KNOCK_PUSH, DINO.KNOCK_STUN);
  }
  w.emit('trample', { x: v.x, y: v.y, v: 1.2, type: v.type });
}
function fall(w) {
  const s = WS.get(w); if (!s || !s.flung.length) return;
  for (let k = s.flung.length - 1; k >= 0; k--) {
    const e = s.flung[k], v = w.unitById(e.id);
    if (!v || !(v.hp > 0) || w.time > e.until || v.hurled === 1) { drop(s, s.flung, k); continue; }
    if (w.time > e.t0 && v.z <= 0 && v.vz <= 0) { landed(w, v, e); drop(s, s.flung, k); }
  }
}
registerSystem('dinoSense', sense, 'perception');
registerSystem('dinoFlung', fall, 'steering');
