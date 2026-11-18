// SECRET tab shared helpers (Part 2 step 7, OURS: no OG source, our own design). Owner: SECRET-SIM. Not a unit def.
// Contract: STEP7.md SECRET-SIM table (tricks, starting numbers, b.act pose codes). Faction Secret (35): all 8 secret
// units + the spawned crow are one side, like the bosses.
//  - secret(def): registers a unit with the tab's defaults; initBag(u): the pose contract keys (act, actT, victim).
//  - brain pieces: targets, hunting, flying (low / high flyers), grabbing + gluing a victim, area queries.
//  - effect projectiles that ride on a unit (iceblock) and the per-world chill record (yeti snowballs: 3 hits in 6 s =
//    frozen solid).
//  - terrain glue: TERRAIN-SIM's mud (paint through terrain/index.js paintTerrain(world, 'mud', ...), read through their
//    grid helper when it exists; until then only water counts as "wet ground" for the bog monster).
// Borrowed from the other tabs (same rules everywhere): dinos blindFor / fleeFor / flung / markSky / high, ocean
// slowUntil, bosses thickestCrowd. Per-world state lives in WeakMaps (Clear empties them). No allocation per tick; no
// random draws unless a unit acts.
import { registerUnit } from '../../defs.js';
import { F, ENEMY, INT, canHit, maskHas } from '../../factions.js';
import { STATE, LEAP, GRAVITY, WET, DEEP, DT, TAU, hypot, angleDiff } from '../../const.js';
import { damage, push, toss, stun, meleeStrike, hatKnock, igniteNow, ignite, quench, splatFear, splatNoise, depthAt, fleeSteer, hooks, getOil } from '../../combat/index.js';
import { spawnProjectile, removeProjectile, registerProjectileKind, shoot, fireProjectile } from '../../combat/projectiles.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { attackHeld } from '../../systems/possess.js';
import { paintTerrain } from '../../terrain/index.js';
import { blindFor, fleeFor, flung, markSky, high, tossTo } from '../dinos/_lib.js';
import { slowUntil, slowedBy, heldBy } from '../ocean/_lib.js';
import { thickestCrowd } from '../bosses/_lib.js';

export { STATE, LEAP, GRAVITY, WET, DEEP, DT, TAU, hypot, angleDiff, F, ENEMY, INT, canHit, maskHas };
export { damage, push, toss, stun, meleeStrike, hatKnock, igniteNow, ignite, quench, splatFear, splatNoise, depthAt, hooks, getOil };
export { spawnProjectile, removeProjectile, registerProjectileKind, shoot, fireProjectile, registerSystem, onWorldClear, attackHeld };
export { blindFor, fleeFor, flung, markSky, high, tossTo, slowUntil, slowedBy, thickestCrowd };
// heldBy(w, holder, v): ocean's safety net: if the holder vanishes without letting go (cursed into a frog, erased) or its
// b.victim stops naming v, v is freed (not hurled / inside / hidden). Baby, cowboy and bog monster register their victims.
export { heldBy };

// Shared numbers (ours; the user tunes them).
export const SEC = {
  MARGIN: 46,          // max unit radius, added to radius queries (the core's margin)
  SKY: 30,             // a flyer higher than this (z px) is out of melee reach (dinos' ptero line, STEP6 "high flyers")
  GROUNDED: 6,         // a unit higher than this is in the air: grabs, sits and slams pass under it
  HELD_Z: 2,           // px: a held / dragged victim hangs this high (steering leaves it alone, as the trex jaws do)
  MEMORY: 4,           // s a group contact is followed with no target
  LURK_L: 14,          // px: the bog monster lurks only in a patch: wet / mud here AND this far out in 4 directions
};

// ---------------------------------------------------------------- defs
const SEC_FLOCK = { personalSpace: 1.15, separation: 30, alignment: 0.1, cohesion: 0.04, formation: 0.5, herd: 0, herdSpacing: 0,
  idleSpread: 1.5, flockByState: [1, 0.8, 0.3, 0.8, 0.2, 0.3], formationByState: [1, 1, 0.2, 1, 0, 0] };
const SEC_MORALE = { baseline: 0.95, oddsWeight: 0.2, fearWeight: 0.02, casualtyWeight: 0.05, woundWeight: 0.15, hitShock: 0.01, suppression: 0,
  canBreak: true, breakAt: 0.2, rallyAt: 0.5, minFleeTime: 2.5, dropRate: 2, recoverRate: 0.3, panicFear: 0.2, deathFear: 0.3 };
/** Fearless morale (ghost, phoenix, bog monster, baby): never breaks, never spreads panic. */
export const FEARLESS = { baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 0, recoverRate: 0, panicFear: 0, deathFear: 0.3 };

/** Register a Secret unit: the tab's defaults + `over` (over wins). */
export function secret(over) {
  return registerUnit({
    category: 'secret', faction: F.Side, intelligence: INT.Animal, infectable: true, melee: true,
    locomotion: 0, radiusJitter: 0.04, accel: 600, decel: 600, turnRate: 6, turnSpeedFalloff: Infinity,
    sightRange: 340, alertSightRange: 400, stickyTarget: true, reactionTime: 0.2, huntRange: Infinity, minDistance: 0,
    drilled: false, flammability: 0.5, density: 1.2, iceGrip: 0.4,
    ...over,
    flock: { ...SEC_FLOCK, ...(over.flock || {}) },
    morale: over.morale || SEC_MORALE,
    look: { attack: { time: 0.35 }, ...(over.look || {}) },
  });
}
/** Every Secret unit's u.b starts with these keys (one hidden class per type). act/actT/victim = the pose contract. */
export function initBag(u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1;
  b.next = 0; b.next2 = 0; b.next3 = 0; b.t0 = 0; b.t1 = 0; b.x0 = 0; b.y0 = 0; b.dx = 0; b.dy = 0; b.k = 0; b.prey = -1;
  u.subState = 0;
}

// ---------------------------------------------------------------- brain pieces
export const unitOf = (w, id) => (id >= 0 ? w.unitById(id) : null);
/** The current target if it still lives (and isn't swallowed / dragged under), else -1 and null. */
export function targetOf(w, u) {
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0 && t.inside < 0) return t;
  u.target = -1; return null;
}
// (Our units never take STATE.CHARGE: OG gunners sidestep a charger at run speed, so a ghost or a baby closing in
// would never catch a rifleman: they stay Engage, as the robots' saw run does.)
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }
/** Pose code (STEP7.md table): b.act + the time it started. */
export function act(w, u, code) { const b = u.b; if (b.act !== code) { b.act = code; b.actT = w.time; } }
/** Ends a timed pose: back to 0 once it has shown for `secs`. */
export function actDone(w, u, code, secs) { if (u.b.act === code && w.time - u.b.actT >= secs) act(w, u, 0); }
/** A target-free special may go off: always on its own, only while the player attacks when possessed. */
export function canAuto(w, u) { return u.possessed !== 1 || attackHeld(w); }
export function clearLine(w, u) { return u.los === 1 || w.walls.count === 0; }
export function grounded(o) { return !(o.z > SEC.GROUNDED) && !(o.climb > 0); }
/** Can a melee blow reach o? A low flyer (LEAP.FLY) up to SKY px, anyone else only on the ground (a tossed unit in the air no). */
export function inReach(o) { return o.leaping === LEAP.FLY ? !(o.z > SEC.SKY) : !(o.z > SEC.GROUNDED); }
export function isRisen(u) { return u.def.risenFrom !== undefined; }
/** Walk / run at the target (flow field around walls); faces it when the line is clear. */
export function hunt(w, u, t, speed, state = STATE.ADVANCE) {
  setState(u, state);
  const clear = clearLine(w, u);
  moveTo(w, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(t.y - u.y, t.x - u.x);
}
/** No target: go to the group's fight, else stand. */
export function idle(w, u) { if (!followGroup(w, u, u.def.walkSpeed, SEC.MEMORY)) setState(u, STATE.IDLE); }
/** Morale broke: run. Returns true if it did. */
export function fleeing(w, u, t) {
  if (u.state !== STATE.FLEE) return false;
  fleeSteer(w, u, t, u.def.runSpeed);
  return true;
}
/** A unit u may hit with an area blow: its shots could hit it, alive, not swallowed / dragged under, not a prop. */
export function foe(u, o) { return o !== u && !o.dead && o.hp > 0 && o.inside < 0 && !o.def.prop && canHit(u, o); }
/** Can this unit be grabbed / lassoed / picked up at all? */
export function grabbable(o, maxMass) {
  const d = o.def;
  return o.mass <= maxMass && !d.prop && !d.untossable && !d.boss && o.hurled !== 1 && o.inside < 0 && grounded(o) &&
    o.leaping === 0 && o.hp > 0 && !o.dead && !(o.floating > 0 && o.z > 1);
}
/** Hold a victim at a point: still, stunned, lifted so steering leaves it alone (the holder also sets hurled = 1). */
export function glue(v, x, y, z, vx, vy) {
  v.x = x; v.y = y; v.z = v.pz = Math.max(SEC.HELD_Z, z); v.vz = 0; v.vx = vx; v.vy = vy; v.spin = 0;
  if (v.stun < 0.3) v.stun = 0.3;
}
/** Let a held victim go where it hangs: it drops (gravity), stunned a moment. */
export function letGo(w, v, stunT) {
  if (!v) return;
  v.hurled = 0;
  if (v.inside >= 0) { v.inside = -1; v.hidden = 0; }
  v.vz = 0; if (!(v.z > 0)) v.z = 1;
  if (v.hp > 0 && stunT > v.stun) v.stun = stunT;
}
/** Toss o up and away from (x, y): `out` px/s outward, `up` px/s up (toss's own mass scaling applies). */
export function tossFrom(w, o, x, y, out, up) {
  let dx = o.x - x, dy = o.y - y; const d = hypot(dx, dy);
  if (d < 0.001) { const a = w.rng() * TAU; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
  toss(w, o, dx, dy, out, up);
}
/** Simple melee blow with the tab's shape: damage (+ jitter), push, stun, cooldown; tossOut/tossUp > 0 tosses it instead. */
export function blow(w, u, t, dmg, every, pushF, stunT, tossOut, tossUp) {
  const pass = meleeStrike(w, u, t, { damage: dmg, damageJitter: 0.1 * dmg, push: tossOut > 0 ? 0 : pushF, stun: tossOut > 0 ? 0 : stunT, cooldown: every, cooldownJitter: 0.15 * every });
  if (tossOut > 0 && t.hp > 0 && pass > 0.3) tossFrom(w, t, u.x, u.y, tossOut * pass, tossUp * pass);
  return pass;
}
/** Empty swing (possessed, attack held at nobody, no special ready). */
export function swing(w, u, cd) {
  if (u.cooldown > 0) return;
  u.attack = 1; u.cooldown = cd;
  w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
}

// ---------------------------------------------------------------- flying (ghost, seagull, crow: low; phoenix: high)
/** Fly straight at (x, y) at `speed` (no flow field: flyers cross walls and water); faces it. */
export function flyAt(u, x, y, speed) {
  const dx = x - u.x, dy = y - u.y, d = hypot(dx, dy);
  if (d < 0.5) { u.goalX = 0; u.goalY = 0; return 0; }
  u.goalX = dx / d * speed; u.goalY = dy / d * speed; u.face = Math.atan2(dy, dx);
  return d;
}
/** Ease u.z toward `h` at `rate` 1/s (flying units keep their height themselves: steering has no gravity for LEAP.FLY). */
export function easeZ(u, h, rate) { u.z += (h - u.z) * Math.min(1, rate * DT); u.vz = 0; }
/** Circle a point `R` px out at `speed` (between dives), direction by unit index. */
export function circleAround(u, x, y, R, speed) {
  const dx = x - u.x, dy = y - u.y, d = hypot(dx, dy) || 0.001;
  const s = u.index & 1 ? 1 : -1, m = Math.max(-speed, Math.min(speed, 2.5 * (d - R)));
  let vx = -dy / d * s * speed + dx / d * m, vy = dx / d * s * speed + dy / d * m;
  const v = hypot(vx, vy) || 0.001; u.goalX = vx * speed / v; u.goalY = vy * speed / v;
}
/** A webbed flyer of our tab drops and sits on the ground until the web lets go (STEP6 shared status). Returns true while it sits. */
export function webbedDown(w, u) {
  if (!(u.webbed > w.time)) return false;
  u.z = 0; u.vz = 0; u.goalX = 0; u.goalY = 0; u.face = NaN;
  return true;
}

// ---------------------------------------------------------------- queries
const NQ = new Array(128);
/**
 * The nearest unit u may hit within `r` px of (x, y) (edge distance: d − o.radius), passing `ok(u, o)`; null if none.
 * `skip` = a unit to leave out.
 */
export function nearestFoe(w, u, x, y, r, ok, skip) {
  const n = w.queryMask(x, y, r + SEC.MARGIN, ENEMY[u.faction], NQ, NQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = NQ[k]; NQ[k] = null;
    if (o === skip || !foe(u, o) || (ok && !ok(u, o))) continue;
    const d = hypot(o.x - x, o.y - y) - o.radius;
    if (d <= r && d < bd) { bd = d; best = o; }
  }
  return best;
}
/** How many units u may hit stand within `r` px (edge distance) of (x, y), on the ground. */
export function countFoes(w, u, x, y, r) {
  const n = w.queryMask(x, y, r + SEC.MARGIN, ENEMY[u.faction], NQ, NQ.length);
  let c = 0;
  for (let k = 0; k < n; k++) {
    const o = NQ[k]; NQ[k] = null;
    if (foe(u, o) && grounded(o) && hypot(o.x - x, o.y - y) - o.radius <= r) c++;
  }
  return c;
}
/** Calls fn(o, d) for every unit u may hit within `r` px (edge distance) of (x, y) (any height unless grounded only). */
const AQ = new Array(192);
export function eachFoe(w, u, x, y, r, groundOnly, fn) {
  const n = w.queryMask(x, y, r + SEC.MARGIN, ENEMY[u.faction], AQ, AQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = AQ[k]; AQ[k] = null;
    if (!foe(u, o) || (groundOnly && !grounded(o))) continue;
    const d = hypot(o.x - x, o.y - y);
    if (d - o.radius > r) continue;
    AQ[m++] = o;   // compact the hits first: fn may query again
  }
  for (let k = 0; k < m; k++) { const o = AQ[k]; AQ[k] = null; fn(o, hypot(o.x - x, o.y - y)); }
  return m;
}

// ---------------------------------------------------------------- effect projectiles riding on a unit
/** An effect projectile riding on unit v (iceblock): damage 0, never hits; its kind's step follows v and removes it. */
export function spawnEffect(w, kind, owner, v, life) {
  const p = spawnProjectile(w, kind, v.x, v.y, 0, 0, life, 0, F.Props, owner);   // Props: nobody's enemy (domes, deflectors ignore it)
  if (!p) return null;
  p.host = v.id; p.r = v.radius; p.z = Math.max(0, v.z); p.k = 0; p.age = 0;
  return p;
}
/** Move an effect projectile onto its unit. */
export function rideOn(p, v) { p.px = p.x; p.py = p.y; p.x = v.x; p.y = v.y; p.z = Math.max(0, v.z); p.r = v.radius; }
// iceblock: a frozen victim's block of ice (yeti). Lives as long as the freeze (p.life), follows its unit, gone with it.
function stepIceblock(w, p, i) {
  const v = w.unitById(p.host);
  p.life -= DT; p.age += DT;
  if (!v || !(v.hp > 0) || p.life <= 0) { removeProjectile(w, i); return; }
  rideOn(p, v);
}
registerProjectileKind('iceblock', stepIceblock);

// ---------------------------------------------------------------- per-world state
const WS = new WeakMap();
function ws(w) {
  let s = WS.get(w);
  if (!s) { s = { chill: [], free: [], phoenix: [] }; WS.set(w, s); }
  return s;
}
onWorldClear((w) => { const s = WS.get(w); if (s) { for (const e of s.chill) s.free.push(e); s.chill.length = 0; s.phoenix.length = 0; } });
function rec(s) { return s.free.pop() || { id: -1, t0: -1e9, t1: -1e9, t2: -1e9, frozenUntil: -1e9 }; }

/**
 * A snowball hit v: chilled (speed × mul) for `secs`; the 3rd hit within `win` s freezes it solid for `freeze` s (stunned,
 * an iceblock effect on it). Returns true if this hit froze it.
 */
export function chill(w, v, by, secs, mul, win, hits, freeze) {
  if (!v || v.def.prop || !(v.hp > 0)) return false;
  const now = w.time, s = ws(w);
  slowUntil(w, v, now + secs, mul);
  let e = null;
  for (let k = s.chill.length - 1; k >= 0; k--) {
    const c = s.chill[k];
    if (now - c.t2 > win && now > c.frozenUntil) { s.free.push(c); s.chill[k] = s.chill[s.chill.length - 1]; s.chill.pop(); continue; }   // stale
    if (c.id === v.id) e = c;
  }
  if (!e) { e = rec(s); e.id = v.id; e.t0 = e.t1 = e.t2 = -1e9; e.frozenUntil = -1e9; s.chill.push(e); }
  if (now < e.frozenUntil) return false;   // already a block of ice
  e.t0 = e.t1; e.t1 = e.t2; e.t2 = now;
  const n = (now - e.t2 <= win ? 1 : 0) + (now - e.t1 <= win ? 1 : 0) + (now - e.t0 <= win ? 1 : 0);
  if (n < hits || v.def.boss) return false;
  e.frozenUntil = now + freeze; e.t0 = e.t1 = e.t2 = -1e9;
  if (v.stun < freeze) v.stun = freeze;
  v.vx = 0; v.vy = 0; v.burning = 0;
  spawnEffect(w, 'iceblock', by, v, freeze);
  w.emit('icecrack', { x: v.x, y: v.y, v: 1.6, type: v.type, freeze: 1 });   // STEP7 AUDIO: freeze (ice crackle) = the ice-crack sound
  return true;
}
/** Is v frozen solid right now (tests, readers)? */
export function frozen(w, v) { const s = WS.get(w); if (!s) return false; for (const e of s.chill) if (e.id === v.id) return w.time < e.frozenUntil; return false; }

/** Phoenixes register here (the rebirth system only walks these). */
export function phoenixList(w) { return ws(w).phoenix; }

// ---------------------------------------------------------------- terrain: mud (TERRAIN-SIM) and wet ground
// TERRAIN-SIM's mud grid helper, if it exists (sim/terrain/mud.js). Until then only water counts.
let MUD = null;
try { MUD = await import('../../terrain/mud.js'); } catch (e) { MUD = null; }
const mudFn = MUD && (MUD.mudAt || MUD.isMudAt || MUD.onMud) || null;
/** Is (x, y) a mud tile? */
export function mudAt(w, x, y) { return mudFn !== null && mudFn(w, x, y) ? true : false; }
/** Mud or water at (x, y) (a puddle the bog monster could sit in). */
export function soggy(w, x, y) { return (w.waterCells > 0 && depthAt(w, x, y) >= WET) || mudAt(w, x, y); }
/** A patch the bog monster can lurk in: soggy here and LURK_L px out in all 4 directions (a single mud trail line isn't one). */
export function lurkable(w, x, y) {
  const L = SEC.LURK_L;
  return soggy(w, x, y) && soggy(w, x + L, y) && soggy(w, x - L, y) && soggy(w, x, y + L) && soggy(w, x, y - L);
}
/** Paint mud r px round (x, y) through TERRAIN-SIM's painter (terrain/index.js). Returns the changed tile count (0 until mud exists). */
export function paintMud(w, x, y, r) { return paintTerrain(w, 'mud', x, y, x, y, r) | 0; }
