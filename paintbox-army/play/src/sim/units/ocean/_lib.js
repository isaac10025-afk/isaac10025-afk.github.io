// Ocean tab shared helpers (Part 2 step 6, OURS: no OG source, our own design). Owner: OCEAN-SIM.
// Contract: STEP6.md (OCEAN table: tricks, starting numbers, b.act pose codes). Nothing here is a unit def.
//  - sea(def): registers a sea animal with the tab's defaults (faction Ocean, Animal, category 'ocean', swims, never drowns).
//    Land + water animals swim with `waterPace` = water speed / land run speed (steering applies it in any water).
//    Water-only ones (shark, eel, swordfish) are `aquatic` like OG's piranha: steering keeps them in the water.
//  - brain pieces: pose codes (b.act), bite / chew (risen copies infect), hunting on land, the water-only prey search
//    (an enemy in the water or within 30 px of it), swimming round the shore, cruising, a fish stranded on dry land.
//  - two per-world records, each with a tiny system (registerSystem):
//      oceanSlow (after march, just before steering): a crab-pinched unit's goal is scaled down until its time is up.
//      oceanHeld (after lifecycle): a victim whose shark / octopus vanished without letting go (cursed, turned) is freed.
//  - ink blinds through the game's one blind rule, dinos/_lib.js blindFor (the spitter's spit, the kraken's ink): one
//    record per unit, so two blinds at once can't leave a unit blind for good.
// Per-world state lives in a WeakMap (reset by Clear). No allocation per tick; no random draws unless an animal acts.
import { registerUnit } from '../../defs.js';
import { F, ENEMY, INT, maskHas } from '../../factions.js';
import { STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff } from '../../const.js';
import { damage, push, toss, stun, infect, perchOf, meleeStrike, fleeSteer } from '../../combat/index.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { attackHeld } from '../../systems/possess.js';
import { roam as animalRoam } from '../animals/lib.js';
import { shoreAt, nearestWet, inward, pondAt } from '../../terrain/water.js';
import { blindFor, spitBlind } from '../dinos/_lib.js';

export { STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff, F, ENEMY, INT };
export { damage, push, toss, stun, infect, perchOf, meleeStrike, shoreAt, nearestWet, pondAt, blindFor };
/** Is v blind right now (ink, spit: the shared blind record)? */
export function inkBlind(w, v) { return spitBlind(w, v); }

// Shared numbers (ours; the user tunes them).
export const SEA = {
  MARGIN: 46,      // max unit radius, added to radius queries (the core's own margin)
  coast: 30,       // px: a water-only hunter goes for anything in the water or this close to it (STEP6 shark)
  recheck: 6,      // ticks between prey searches (the last prey is kept in between)
  reachUp: 12,     // px: prey higher than this (flying, tossed) can't be reached from the water
  dryEvery: 0.5,   // s between drying-out hurts on dry land (it gasps)
  wriggleR: 260,   // px: a stranded fish looks this far for water to wriggle back to ...
  wriggleLook: 0.25, // ... every 0.25 s
  deepEnough: 3,   // shore tiles (8 px): idle water-only animals keep at least this far from the shore
  feel: 12,        // px past its body: a swimmer feels ahead for the shore
  memory: 5,       // s a group contact is followed with no target
};

// ---------------------------------------------------------------- defs
const SEA_FLOCK = { personalSpace: 1.2, separation: 30, alignment: 0.05, cohesion: 0.05, formation: 0, herd: 0.15, herdSpacing: 16,
  idleSpread: 2, flockByState: [1, 0.4, 0.15, 0.3, 0.1, 0.4], formationByState: [0, 0, 0, 0, 0, 0] };
const SEA_MORALE = { baseline: 0.9, oddsWeight: 0.3, fearWeight: 0.05, casualtyWeight: 0.1, woundWeight: 0.3, hitShock: 0.02, suppression: 0,
  canBreak: true, breakAt: 0.22, rallyAt: 0.5, minFleeTime: 2.5, dropRate: 3, recoverRate: 0.3, panicFear: 0.1, deathFear: 0.2 };
/** Sharks, eels, swordfish: never run (OG's water hunters, piranha and gator, never break either). */
export const FISH_MORALE = { baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 0, minFleeTime: 1, dropRate: 1, recoverRate: 1, panicFear: 0, deathFear: 0.1 };

/** Register a sea animal. `over` = the unit's own fields (radius, maxHp, speeds, brain, hooks...). */
export function sea(over) {
  return registerUnit({
    category: 'ocean', faction: F.Side, intelligence: INT.Animal, infectable: true, melee: true,
    locomotion: 0, radiusJitter: 0.06, accel: 600, decel: 600, turnRate: 6, turnSpeedFalloff: Infinity,
    sightRange: 280, alertSightRange: 340, stickyTarget: true, reactionTime: 0.25, huntRange: Infinity, minDistance: 0,
    drilled: false, flammability: 0.25, density: 1.2, iceGrip: 0.3,
    swims: true,          // never drowns, crosses deep water (OG: nobody drowns; waterPace sets the pace)
    risenMode: 'keep',    // risen copy = same brain and tricks, Undead (ocean/index.js builds them: see there why)
    ...over,
    flock: { ...SEA_FLOCK, ...(over.flock || {}) },
    morale: { ...SEA_MORALE, ...(over.morale || {}) },
    look: { attack: { time: 0.3 }, ...(over.look || {}) },
  });
}
/** Every sea animal's u.b starts with the same keys (one hidden class). act/actT/victim = the pose contract (STEP6.md). */
export function initBag(w, u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1;
  b.v0 = -1; b.v1 = -1; b.v2 = -1; b.v3 = -1;   // octopus: the (up to 4) held units (art draws a tentacle to each)
  b.swim = 0;                                   // 1 = in deep water this tick (art: `swim` / fin poses)
  b.prey = -1; b.next = 0; b.next2 = 0; b.t0 = 0; b.t1 = 0;
  b.x0 = 0; b.y0 = 0; b.dx = 0; b.dy = 0; b.k = 0; b.n = 0;
  b.dry = 0; b.wx = 0; b.wy = 0; b.wt = 0;      // stranded: next drying hurt; the water it wriggles to, next look for it
  b.inked = 0; b.inkNext = 0;
  b.roaming = 0; b.roamUntil = 0;
  b.hits = null;                                // walrus / swordfish: ids already hit this slide / leap
  u.subState = 0; u.leaping = 0;
}

// ---------------------------------------------------------------- brain pieces
export const unitOf = (w, id) => (id >= 0 ? w.unitById(id) : null);
/** The current target if it still lives, else -1 and null. */
export function targetOf(w, u) {
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0 && !t.dead) return t;
  u.target = -1; return null;
}
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }
/** Pose code (STEP6.md OCEAN table): b.act + the time it started. */
export function act(w, u, code) { if (u.b.act !== code) { u.b.act = code; u.b.actT = w.time; } }
export function actAge(w, u) { return w.time - u.b.actT; }
/** A target-free move (a shock, a puff) may go off: always on its own, only while the player attacks when possessed. */
export function canAuto(w, u) { return u.possessed !== 1 || attackHeld(w); }
export function clearLine(w, u) { return u.los === 1 || w.walls.count === 0; }
export function isRisen(u) { return u.def.risenFrom !== undefined; }
export function isHostileTo(a, b) { return maskHas(ENEMY[a.faction], b.faction) === 1; }
/** Start of every sea animal's brain: the swim flag for the art. */
export function prelude(w, u) { u.b.swim = u.wet >= DEEP ? 1 : 0; }
/** Walk / run at the target (flow field around walls); faces it when the line is clear. */
export function hunt(w, u, t, speed, state = STATE.ADVANCE) {
  setState(u, state);
  const clear = clearLine(w, u);
  moveTo(w, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(t.y - u.y, t.x - u.x);
}
/** No target: follow the group's contact, else wander slowly. */
export function idle(w, u) {
  if (followGroup(w, u, u.def.walkSpeed, SEA.memory)) return;
  setState(u, STATE.IDLE);
  animalRoam(w, u, 0.5 * u.def.walkSpeed, u.radius + 24);
}
/** Morale broke: run. Returns true if it did. */
export function fleeing(w, u, t) {
  if (u.state !== STATE.FLEE) return false;
  fleeSteer(w, u, t, u.def.runSpeed);
  return true;
}
/** Plain bite / pinch: meleeStrike + infection when it's a risen copy. Returns the pass fraction. */
export function bite(w, u, t, dmg, every, pushF = 40, stunT = 0.05) {
  const pass = meleeStrike(w, u, t, { damage: dmg, damageJitter: 0.1 * dmg, push: pushF, stun: stunT, cooldown: every, cooldownJitter: 0.15 * every });
  if (isRisen(u)) infect(w, perchOf(w, t), u, 0.5 * pass, 0);
  return pass;
}
/** Damage from its own spot (a hold, a drag, a squeeze), + infection for risen copies. */
export function chew(w, u, v, dmg, kind) {
  const pass = damage(w, v, dmg, u, kind, v.x, v.y);
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  w.emit('strike', { x: v.x, y: v.y, v: 1, type: u.type });
  return pass;
}
/** Can this unit be held (octopus) / dragged (shark) at all? */
export function holdable(o, maxMass) {
  const d = o.def;
  // attack L1 11-16: not while it flies from a throw (going up, or coming down above the ground): an octopus letting go
  // throws its victim, and the octopus next to it caught it a tick later, 4 px up: the throw never happened and a group
  // passed one unit round, 3 s each, until it died (held 10+ s, never thrown).
  return o.mass <= maxMass && !d.prop && !d.untossable && !d.boss && o.hurled !== 1 && !(o.z > SEA.reachUp) && !(o.vz > 0 || (o.z > 0 && o.vz < 0)) && !(o.climb > 0)
    && o.leaping === 0 && o.hp > 0 && !o.dead && o.inside < 0;
}
/** Hold a victim at a point: still, stunned, lifted 2 px so steering leaves it alone (the holder sets hurled = 1). */
export function glue(v, x, y, z, vx, vy) {
  v.x = x; v.y = y; v.z = v.pz = Math.max(2, z); v.vz = 0; v.vx = vx; v.vy = vy; v.spin = 0;
  if (v.stun < 0.3) v.stun = 0.3;
}
/** Toss u so it lands about `dist` px away along (dx, dy) with upward speed `up` (toss's own mass scaling taken out). */
export function tossTo(w, u, dx, dy, dist, up) {
  const k = 1 / Math.sqrt(Math.max(1, u.mass)), h = up * k;
  const air = (h + Math.sqrt(h * h + 2 * GRAVITY * Math.max(0, u.z))) / GRAVITY;
  toss(w, u, dx, dy, dist / Math.max(0.05, k * air), up);
}

// ---------------------------------------------------------------- water
const _pt = new Float32Array(2);
export function wetNow(w, u) { return w.waterCells > 0 && w.wetAt(u); }
/** Is there open water within r px of (x, y)? (tile centres, terrain/water.js nearestWet) */
export function waterNear(w, x, y, r) { return w.waterCells > 0 && nearestWet(w, x, y, r, _pt); }
/** Prey for a water-only hunter: an enemy in the water, or on land within SEA.coast px of it; not up in the air. */
export function preyOk(w, o) {
  if (!(o.hp > 0) || o.dead || o.def.prop || o.z > SEA.reachUp || o.climb > 0 || o.inside >= 0) return false;
  if (o.wet >= WET || w.wetAt(o)) return true;
  return waterNear(w, o.x, o.y, SEA.coast);
}
const PQ = new Array(32).fill(null);
/**
 * The water-only hunter's prey: the player's pick while possessed; else the nearest good prey within r (perception's
 * target first), searched every SEA.recheck ticks (or at once when the last one is gone) and kept in u.lastVictim.
 */
export function seekPrey(w, u, r) {
  if (u.possessed === 1) { const t = u.target >= 0 ? w.unitById(u.target) : null; return t && preyOk(w, t) ? t : null; }
  if ((w.tick + u.index) % SEA.recheck !== 0) {   // between looks: the last prey while it's still good; nothing found last time = none
    if (u.lastVictim < 0) return null;
    const last = w.unitById(u.lastVictim);
    if (last && last.hp > 0 && !last.dead && !(last.z > SEA.reachUp) && last.inside < 0) return last;
  }
  let best = null, bd = r;
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && preyOk(w, t)) { const d = hypot(t.x - u.x, t.y - u.y); if (d <= bd) { best = t; bd = d; } }
  const n = w.queryMask(u.x, u.y, r, ENEMY[u.faction], PQ, PQ.length);
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (o === best) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d >= bd || (o.unseen > 0 && d > o.unseen)) continue;
    if (!preyOk(w, o)) continue;
    best = o; bd = d;
  }
  u.lastVictim = best ? best.id : -1;
  return best;
}
// Feel directions (rad off the wanted heading) tried when the shore is ahead.
const FEEL = [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];
function wetPoint(w, x, y) { return w.depthUnder(x, y) >= WET; }
/**
 * Swim at (tx, ty) at `sp` (a water-only animal): straight while the water goes on; dry land ahead → slide along the
 * shore on the side nearer the goal. `press` = keep pushing straight at the shore (prey right on the beach: the lunge).
 */
export function swimTo(w, u, tx, ty, sp, press = false) {
  const dx = tx - u.x, dy = ty - u.y, d = hypot(dx, dy) || 0.001;
  let gx = dx / d, gy = dy / d;
  const look = u.radius + SEA.feel;
  if (!press && w.waterCells > 0 && !wetPoint(w, u.x + gx * look, u.y + gy * look)) {
    const a0 = Math.atan2(gy, gx);
    for (let k = 0; k < FEEL.length; k++) {
      const a = a0 + FEEL[k], cx = Math.cos(a), cy = Math.sin(a);
      if (wetPoint(w, u.x + cx * look, u.y + cy * look)) { gx = cx; gy = cy; break; }
    }
  }
  u.goalX = gx * sp; u.goalY = gy * sp;
}
/** Water-only idle: drift about, keep off the shore. Draws a random number only every ~1 s per animal. */
export function cruise(w, u, sp) {
  setState(u, STATE.IDLE);
  if (w.waterCells > 0 && shoreAt(w, u.x, u.y) < SEA.deepEnough && inward(w, u.x, u.y, _pt)) { swimTo(w, u, _pt[0], _pt[1], sp); return; }
  if ((w.tick + u.index) % 60 === 0) u.wander += 1.2 * (w.rng() - w.rng());
  const c = Math.cos(u.wander), s = Math.sin(u.wander), look = u.radius + 2 * SEA.feel;
  if (w.waterCells > 0 && !wetPoint(w, u.x + c * look, u.y + s * look)) u.wander += 0.08;   // turn away from the shore
  u.goalX = c * sp; u.goalY = s * sp;
}
/** Swim for deeper water (a shark dragging its victim under). False when there's nowhere deeper nearby. */
export function deeper(w, u, sp) {
  if (w.waterCells === 0 || !inward(w, u.x, u.y, _pt)) return false;
  swimTo(w, u, _pt[0], _pt[1], sp);
  return true;
}
/** A water-only animal on dry land: dries out (a hurt every 0.5 s) and wriggles back to the nearest water. */
export function stranded(w, u, dps, speed) {
  const b = u.b;
  setState(u, STATE.IDLE); u.face = NaN;
  if (w.time >= b.dry) { b.dry = w.time + SEA.dryEvery; damage(w, u, dps * SEA.dryEvery, -1, 'dry'); }
  if (u.z > 0 || u.vz > 0) return;
  if (w.time >= b.wt) {   // the nearest water, looked up every 0.25 s (a ring search: not every tick)
    b.wt = w.time + SEA.wriggleLook;
    if (w.waterCells > 0 && nearestWet(w, u.x, u.y, SEA.wriggleR, _pt)) { b.wx = _pt[0]; b.wy = _pt[1]; } else b.wx = -1;
  }
  if (b.wx < 0) return;
  const dx = b.wx - u.x, dy = b.wy - u.y, d = hypot(dx, dy) || 0.001;
  u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed; u.face = Math.atan2(dy, dx);
}

// ---------------------------------------------------------------- per-world statuses
const WS = new WeakMap();
function ws(w) {
  let s = WS.get(w);
  if (!s) { s = { slow: [], held: [], free: [] }; WS.set(w, s); }
  return s;
}
onWorldClear((w) => {
  const s = WS.get(w); if (!s) return;
  for (const e of s.slow) s.free.push(e);
  for (const e of s.held) s.free.push(e);
  s.slow.length = 0; s.held.length = 0;
});
function rec(s) { return s.free.pop() || { id: -1, until: 0, f: 1, by: -1 }; }
function drop(s, list, k) { s.free.push(list[k]); list[k] = list[list.length - 1]; list.pop(); }

/** v moves at `f` × its speed until `until` (world time). A newer slow refreshes the time (the stronger factor wins). */
export function slowUntil(w, v, until, f) {
  if (!v || v.def.prop || !(v.hp > 0)) return;
  const s = ws(w);
  for (let k = 0; k < s.slow.length; k++) {
    const e = s.slow[k];
    if (e.id === v.id) { if (until > e.until) e.until = until; if (f < e.f) e.f = f; return; }
  }
  const e = rec(s); e.id = v.id; e.until = until; e.f = f; s.slow.push(e);
}
/** Is v slowed right now? (tests, readers) */
export function slowedBy(w, v) {
  const s = WS.get(w); if (!s) return 1;
  for (const e of s.slow) if (e.id === v.id && w.time < e.until) return e.f;
  return 1;
}
/**
 * `by` (a shark dragging, an octopus holding) has just taken v. If `by` ever vanishes without letting go (cursed into a
 * frog, turned in place), the oceanHeld system frees v: not hurled, drawn and targetable again.
 */
export function heldBy(w, by, v) {
  const s = ws(w);
  for (let k = 0; k < s.held.length; k++) if (s.held[k].id === v.id) { s.held[k].by = by.id; return; }
  const e = rec(s); e.id = v.id; e.by = by.id; s.held.push(e);
}
function stillHolds(h, id) { const b = h.b; return b.victim === id || b.v0 === id || b.v1 === id || b.v2 === id || b.v3 === id; }

// Just before steering: a slowed unit's goal (its brain's or the player's stick) is scaled down.
function slowRun(w) {
  const s = WS.get(w); if (!s || s.slow.length === 0) return;
  const now = w.time;
  for (let k = s.slow.length - 1; k >= 0; k--) {
    const e = s.slow[k], v = w.unitById(e.id);
    if (!v || v.dead || now >= e.until) { drop(s, s.slow, k); continue; }
    v.goalX *= e.f; v.goalY *= e.f;
  }
}
// After deaths: a victim whose holder is gone (or no longer holds it) is let go, if nobody let go of it properly.
function heldRun(w) {
  const s = WS.get(w); if (!s || s.held.length === 0) return;
  for (let k = s.held.length - 1; k >= 0; k--) {
    const e = s.held[k], v = w.unitById(e.id);
    if (!v || v.dead) { drop(s, s.held, k); continue; }
    const h = w.unitById(e.by);
    if (h && !h.dead && h.b && stillHolds(h, e.id)) continue;
    if (v.hurled === 1 && (v.inside === e.by || v.inside < 0)) {
      v.hurled = 0; v.z = Math.min(v.z, 1);
      if (v.inside === e.by) { v.inside = -1; v.hidden = 0; }
    }
    drop(s, s.held, k);
  }
}
registerSystem('oceanSlow', slowRun, 'march');
registerSystem('oceanHeld', heldRun, 'lifecycle');
