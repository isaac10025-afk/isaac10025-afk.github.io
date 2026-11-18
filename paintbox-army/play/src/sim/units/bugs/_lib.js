// Bugs tab shared helpers (OURS, Part 2 step 6: no OG source, our own design). Owner: BUGS-SIM.
// Contract: STEP6.md (Bugs table: tricks, starting numbers, b.act pose codes, the fields the art reads).
//  - bug(def): registers a unit with the tab's defaults (faction Bugs, Animal, category 'bugs', risen copies 'keep').
//  - brain pieces every bug uses: pose codes (b.act), approach, idle, flee, bite.
//  - low flyers (bee z 12, mosquito z 14): fly over walls and water, melee reaches them; a web drags them down to sit on the
//    ground until it lets go (flyUpkeep). Steering skips flyers' neighbour push, so swarms spread by orbit offsets instead.
//  - webs: webFor() sets the shared u.webbed (steering.js holds a webbed unit's own steps) + the `webon` effect projectile
//    that follows the victim while it's held (p.host = victim id, p.r = its radius, p.age).
//  - poison (bee sting, spider bite): 2 hp/s for 3 s per stack, up to 3 stacks; one world system 'bugPoison' after fire.
//  - isBug(o): bug-type units (any team, risen ones too) walk through web patches and don't mind stink clouds.
// Per-world state lives in a WeakMap (reset by Clear). No allocation per tick; no random draws unless a bug acts.
import { registerUnit } from '../../defs.js';
import { F, ENEMY, INT, maskHas } from '../../factions.js';
import { STATE, LEAP, DT, GRAVITY, RADIUS_SCALE, hypot, angleDiff } from '../../const.js';
import { damage, push, toss, stun, infect, perchOf, meleeStrike, fleeSteer, spawnProjectile, removeProjectile, raycast } from '../../combat/index.js';
import { registerProjectileKind } from '../../combat/projectiles.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { attackHeld } from '../../systems/possess.js';
import { roam as animalRoam } from '../animals/lib.js';

export { STATE, LEAP, DT, GRAVITY, hypot, angleDiff, F, ENEMY, INT };
export const RADIUS_K = RADIUS_SCALE;   // every radius is OG-raw x 1.1 (defs.js)
export { damage, push, toss, stun, infect, perchOf, meleeStrike, spawnProjectile, removeProjectile, raycast, registerProjectileKind, attackHeld };

// Shared numbers (ours; the user tunes them).
export const BUG = {
  MARGIN: 46,          // max unit radius, added to radius queries (same margin as the core's)
  SKY: 30,             // px: a flyer higher than this is out of reach of bites, stings and sprays (high flyers: ptero, jetpack, UFO)
  GROUNDED: 6,         // px: a unit higher than this is off the ground: web patches and horn flips pass under it
  RISE: 4,             // 1/s: how fast a low flyer eases back to its flying height
  POISON_DPS: 2,       // hp/s per poison stack (bee sting, spider bite) ...
  POISON_TIME: 3,      // ... for 3 s ...
  POISON_MAX: 3,       // ... up to 3 stacks at once (a 4th sting refreshes the oldest)
  POISON_TICKS: 15,    // ticks between poison damage chunks (0.25 s: few hits, no constant flashing)
};

// ---------------------------------------------------------------- defs
const BUG_FLOCK = { personalSpace: 1.1, separation: 30, alignment: 0.05, cohesion: 0.05, formation: 0, herd: 0.15, herdSpacing: 14,
  idleSpread: 2, flockByState: [1, 0.4, 0.15, 0.3, 0.1, 0.4], formationByState: [0, 0, 0, 0, 0, 0] };
const BUG_MORALE = { baseline: 0.9, oddsWeight: 0.3, fearWeight: 0.05, casualtyWeight: 0.1, woundWeight: 0.3, hitShock: 0.02, suppression: 0,
  canBreak: true, breakAt: 0.25, rallyAt: 0.5, minFleeTime: 2.5, dropRate: 3, recoverRate: 0.3, panicFear: 0.1, deathFear: 0.2 };

/** Register a bug. `over` = the unit's own fields (radius, maxHp, speeds, brain, hooks...). */
export function bug(over) {
  return registerUnit({
    category: 'bugs', faction: F.Side, intelligence: INT.Animal, infectable: true, melee: true,
    locomotion: 0, radiusJitter: 0.06, accel: 700, decel: 700, turnRate: 8, turnSpeedFalloff: Infinity,
    sightRange: 280, alertSightRange: 340, stickyTarget: true, reactionTime: 0.25, huntRange: Infinity, minDistance: 0,
    drilled: false, flammability: 0.6, density: 1, iceGrip: 0.5,
    risenMode: 'keep',   // risen.js builds risen_<type>: same brain and tricks, Undead (the necro raises them, zombies turn them)
    ...over,
    flock: { ...BUG_FLOCK, ...(over.flock || {}) },
    morale: { ...BUG_MORALE, ...(over.morale || {}) },
    look: { attack: { time: 0.3 }, ...(over.look || {}) },
  });
}
/** Every bug's u.b starts with the same keys (one hidden class). act/actT/victim = the pose contract (STEP6.md). */
export function initBag(w, u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1; b.arm = 0;
  b.next = 0; b.next2 = 0; b.t0 = 0; b.t1 = 0; b.x0 = 0; b.y0 = 0; b.dx = 0; b.dy = 0;
  b.k = 0; b.n = 0; b.home = -1; b.prey = -1; b.r0 = u.radius; b.drunk = 0; b.flag = 0;
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
/** Pose code (STEP6.md table): b.act + the time it started. */
export function act(w, u, code) { if (u.b.act !== code) { u.b.act = code; u.b.actT = w.time; } }
/** A target-free attack (horn flip, spray, stink puff) may go off: always on its own, only while the player attacks when possessed. */
export function canAuto(w, u) { return u.possessed !== 1 || attackHeld(w); }
export function clearLine(w, u) { return u.los === 1 || w.walls.count === 0; }
/** Up out of reach (ptero, jetpack, UFO, dragon in flight): bites, stings and sprays can't get it. */
export function high(o) { return o.z > BUG.SKY; }
export function grounded(o) { return !(o.z > BUG.GROUNDED) && !(o.climb > 0); }
export function isRisen(u) { return u.def.risenFrom !== undefined; }
/** Bug-type units (any team or side, risen copies too): not caught by web patches, don't mind stink. */
export function isBug(o) { return o.def.category === 'bugs'; }
export function isHostileTo(fac, o) { return maskHas(ENEMY[fac], o.faction) === 1; }
/** Something living with blood and lungs (poison, drinking, stink damage): not machines, props or swallowed units. */
export function living(o) { return !o.def.machine && !o.def.prop && o.inside < 0 && o.hp > 0; }
/** Walk / run at the target (flow field around walls); faces it when the line is clear. */
export function hunt(w, u, t, speed, state = STATE.ADVANCE) {
  setState(u, state);
  const clear = clearLine(w, u);
  moveTo(w, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(t.y - u.y, t.x - u.x);
}
/** No target: follow the group's contact, else wander slowly (walkers). */
export function idle(w, u) {
  if (followGroup(w, u, u.def.walkSpeed, 6)) return;
  setState(u, STATE.IDLE);
  animalRoam(w, u, 0.5 * u.def.walkSpeed, u.radius + 20);
}
/** Morale broke: run. Returns true if it did. */
export function fleeing(w, u, t) {
  if (u.state !== STATE.FLEE) return false;
  fleeSteer(w, u, t, u.def.runSpeed);
  return true;
}
/** Plain bite / jab: meleeStrike + infection when it's a risen copy. Returns the pass fraction. */
export function bite(w, u, t, dmg, every, pushF = 40, stunT = 0) {
  const pass = meleeStrike(w, u, t, { damage: dmg, damageJitter: 0.1 * dmg, push: pushF, stun: stunT, cooldown: every, cooldownJitter: 0.15 * every });
  if (isRisen(u)) infect(w, perchOf(w, t), u, 0.5 * pass, 0);
  return pass;
}
/** Toss u so it lands about `dist` px away along (dx, dy) with upward speed `up` (toss's own mass scaling taken out). */
export function tossTo(w, u, dx, dy, dist, up) {
  const k = 1 / Math.sqrt(Math.max(1, u.mass)), h = up * k;
  const air = (h + Math.sqrt(h * h + 2 * GRAVITY * Math.max(0, u.z))) / GRAVITY;
  toss(w, u, dx, dy, dist / Math.max(0.05, k * air), up);
  return air;
}
/** The nearest enemy within r it can reach (not up high, not swallowed), or null. A scan: call it now and then, not every tick. */
const NQ = new Array(64);
export function nearestReachable(w, u, r, filter) {
  const n = w.queryMask(u.x, u.y, r, ENEMY[u.faction], NQ, NQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = NQ[k]; NQ[k] = null;
    if (o.dead || !(o.hp > 0) || high(o) || o.inside >= 0 || o.def.prop || (filter && !filter(o))) continue;
    const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ---------------------------------------------------------------- low flyers (bee, mosquito)
/**
 * Every tick before a flyer's brain: keeps it up at height h (leaping = FLY: no gravity, no walls, no water). A web pulls it
 * down: it falls (gravity, the game's small landing bump) and sits until the web lets go, then takes off again.
 * Returns true while it's on the ground (webbed): the brain may turn and strike, not fly.
 */
export function flyUpkeep(w, u, h) {
  if (u.webbed > w.time) {
    if (u.leaping === LEAP.FLY) { u.leaping = 0; u.vz = 0; }
    return true;
  }
  if (u.leaping !== LEAP.FLY) {
    if (u.z > 0 || u.vz > 0) return true;   // still falling / tossed: let it land first
    u.leaping = LEAP.FLY;
  }
  u.vz = 0;
  u.z += (h - u.z) * Math.min(1, BUG.RISE * DT);
  return false;
}
/** Fly toward (x, y) at up to sp (slows into the point). */
export function flyTo(u, x, y, sp) {
  const dx = x - u.x, dy = y - u.y, d = hypot(dx, dy);
  if (d < 1) { u.goalX = 0; u.goalY = 0; return; }
  const s = Math.min(sp, 5 * d);
  u.goalX = (dx / d) * s; u.goalY = (dy / d) * s;
}
/** A flyer with nothing to fight: to its group's contact if fresh, else hovering round home (golden-angle spread by index). */
export function flyIdle(w, u, sp) {
  const g = u.group, gs = w.groups;
  if (g >= 0 && gs.contactAge && gs.contactAge[g] < 6) {
    setState(u, STATE.ADVANCE);
    flyTo(u, gs.contactX[g], gs.contactY[g], sp);
    return;
  }
  setState(u, STATE.IDLE);
  const a = u.index * 2.39996 + w.time * 0.9 * (u.index & 1 ? 1 : -1), R = 12 + (u.index % 5) * 5;
  flyTo(u, u.homeX + Math.cos(a) * R, u.homeY + Math.sin(a) * R, 0.45 * sp);
}

// ---------------------------------------------------------------- webs
/** Can a web hold it? Not bosses, props, swallowed or dying units; up in the air only flyers of the step-6 tabs (their sims
 *  drop them when webbed, STEP6.md): an OG dragon or a step-4 ptero up high never would, so a web doesn't take on them. */
const WEB_FLYERS = { robots: 1, space: 1, ocean: 1, sports: 1, bugs: 1 };
export function webbable(o) {
  return !!o && o.hp > 0 && !o.def.boss && !o.def.prop && o.inside < 0 && (!(o.z > BUG.GROUNDED) || WEB_FLYERS[o.def.category] === 1 || o.leaping !== LEAP.FLY);
}
const DTICK = DT;
/** Web v for t s (spider shot 3 s, a patch 1 s): u.webbed + the `webon` effect projectile on it. Returns true if it took. */
export function webFor(w, v, t, by) {
  if (!webbable(v)) return false;
  const until = w.time + t;
  if (v.webbed < until) v.webbed = until;
  const ps = w.projectiles;
  if (ps) for (let i = ps.length - 1; i >= 0; i--) { const p = ps[i]; if (p.kind === 'webon' && p.host === v.id) { p.life = p.maxLife = Math.max(p.life, t + 0.1); return true; } }
  const p = spawnProjectile(w, 'webon', v.x, v.y, 0, 0, t + 0.1, 0, F.Props, by || -1);   // faction Props: nobody's enemy (shields, domes ignore it)
  if (p) { p.host = v.id; p.r = v.radius; p.age = 0; p.z = v.z; p.fac = by ? by.faction : -1; }
  return true;
}
// `webon`: sits on its victim (x, y, z follow it; p.r = its radius) while the web holds; gone when it lets go or the victim dies.
function stepWebOn(w, p, i) {
  const v = w.unitById(p.host);
  p.px = p.x; p.py = p.y; p.age += DTICK; p.life -= DTICK;
  if (!v || !(v.hp > 0) || v.webbed <= w.time || p.life <= -1) { removeProjectile(w, i); return; }
  p.x = v.x; p.y = v.y; p.z = v.z; p.r = v.radius; p.vx = v.vx; p.vy = v.vy;
}
registerProjectileKind('webon', stepWebOn);

// ---------------------------------------------------------------- poison
const WS = new WeakMap();
function ws(w) {
  let s = WS.get(w);
  if (!s) { s = { poison: [], free: [] }; WS.set(w, s); }
  return s;
}
onWorldClear((w) => { const s = WS.get(w); if (s) { for (const e of s.poison) s.free.push(e); s.poison.length = 0; } });
/** Poison v (a sting or a bite that got through): one more stack of 2 hp/s for 3 s, up to 3 (a 4th refreshes the oldest). */
export function poison(w, v, by) {
  if (!v || !living(v)) return;
  const s = ws(w), now = w.time, end = now + BUG.POISON_TIME;
  let e = null;
  for (let k = 0; k < s.poison.length; k++) if (s.poison[k].id === v.id) { e = s.poison[k]; break; }
  if (!e) { e = s.free.pop() || { id: -1, by: -1, e0: 0, e1: 0, e2: 0 }; e.id = v.id; e.e0 = e.e1 = e.e2 = -1; s.poison.push(e); }
  e.by = by ? by.id : -1;
  if (e.e0 <= now) e.e0 = end; else if (e.e1 <= now) e.e1 = end; else if (e.e2 <= now) e.e2 = end;
  else if (e.e0 <= e.e1 && e.e0 <= e.e2) e.e0 = end; else if (e.e1 <= e.e2) e.e1 = end; else e.e2 = end;
}
/** Poison stacks on v right now (0-3). */
export function poisonStacks(w, v) {
  const s = WS.get(w); if (!s || !v) return 0;
  const now = w.time;
  for (const e of s.poison) if (e.id === v.id) return (e.e0 > now ? 1 : 0) + (e.e1 > now ? 1 : 0) + (e.e2 > now ? 1 : 0);
  return 0;
}
// seconds of stack (ending at e, BUG.POISON_TIME long) inside the chunk (a, now]
function overlap(e, a, now) { const lo = Math.max(a, e - BUG.POISON_TIME), hi = Math.min(now, e); return hi > lo ? hi - lo : 0; }
function poisonTick(w) {
  const s = WS.get(w); if (!s || !s.poison.length || w.tick % BUG.POISON_TICKS !== 0) return;
  const now = w.time, a = now - BUG.POISON_TICKS * DT;
  for (let k = s.poison.length - 1; k >= 0; k--) {
    const e = s.poison[k], v = w.unitById(e.id);
    const sec = overlap(e.e0, a, now) + overlap(e.e1, a, now) + overlap(e.e2, a, now);
    if (!v || !(v.hp > 0) || (sec <= 0 && e.e0 <= now && e.e1 <= now && e.e2 <= now)) {
      s.free.push(e); s.poison[k] = s.poison[s.poison.length - 1]; s.poison.pop(); continue;
    }
    if (sec > 0) damage(w, v, BUG.POISON_DPS * sec, e.by >= 0 ? e.by : -1, 'poison');
  }
}
registerSystem('bugPoison', poisonTick, 'fire');
