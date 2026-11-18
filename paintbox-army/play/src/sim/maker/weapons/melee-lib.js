// Unit maker: W-MELEE shared pieces (OURS, Part 2 step 8, STEP8.md). Owner: W-MELEE. Not a weapon file: melee.js and
// melee-tricks.js import it. What every held-melee weapon needs on any body (person / animal / beast / giant) and size:
//  - scale(u, n): a number × power(u) (STEP8: melee damage, reach and push × the size step; mass limits × power²: heavy()).
//  - close(): run at the target (STEP8: melee closes at RUN speed, gunmen back away and walk speed never catches them),
//    round walls (the core's flow fields via advanceTo).
//  - fight(): the house melee fight (step-6 Space meleeFight, copied so the strike can be the weapon's own and every
//    event carries `as`): in reach + facing + cooldown → strike(cb); circles and steps in like OG soldiers.
//  - hit(): one blow on one unit (damage, push, block spark, 'strike' event with `as`) = combat meleeStrike + `as`.
//  - pose / unpose: the shared pose code (lib.js ACT). unpose only clears OUR code, never an ability's (codes ≥ 20).
//  - empty(): the possessed empty swing (attack held at nobody) with `as`.
// No allocation per tick: query callbacks are module-level functions with module-level scratch.
import {
  ACT, act, power, used, STATE, hypot, angleDiff, setState, advanceTo, clearLine, damage, push, ENEMY,
} from '../lib.js';
import { circle, oddsApproach, blockedSpark, perchOf, hooks } from '../../combat/index.js';

export { ACT, power, used };

export const M = Object.freeze({
  CHASE: 140,          // px: inside this the run at the target is a Charge (OG gunners sidestep chargers), else an Advance
  MARGIN: 46,          // px: max unit radius, added to radius queries (the core's QUERY_MARGIN)
  WEAPON_ACT: 20,      // pose codes below this are weapon codes (lib.js ACT)
  NEAR_LOOK: 120,      // px: with its target this much farther than reach it looks for an enemy in reach to hit instead
  KNOCKED: 0.6,        // s: the slam's wind-up stops on a stun longer than this or when thrown (OG ape: stun > 0.6 || airborne)
});

/** n × the size step (melee damage / reach / push). */
export function scale(u, n) { return n * power(u); }
/** A mass limit (grab / toss / float) for this unit: n × power². */
export function heavy(u, n) { const p = power(u); return n * p * p; }
export const signed = (w) => 2 * w.rng() - 1;
export const range = (w, a, b) => a + (b - a) * w.rng();

/** Set our pose code (b.act + b.actT). */
export function pose(w, u, code) { act(w, u, code); }
/** Clear our pose code `code` (only if it is still the one showing: an ability's pose is never wiped). */
export function unpose(w, u, code) { if (u.b.act === code) act(w, u, ACT.NONE); }
/** Age of the pose showing now. */
export function poseAge(w, u) { return w.time - u.b.actT; }

function markEngaged(w, u) { const g = u.group; if (g >= 0 && w.groups.markEngaged) w.groups.markEngaged(g); }

/** Run at t (around walls): a Charge inside M.CHASE px, else an Advance; always at run speed (STEP8). */
export function close(w, u, t, dx, dy, d) {
  advanceTo(w, u, t, dx, dy, clearLine(w, u), u.def.runSpeed);
  if (d < M.CHASE) setState(u, STATE.CHARGE);
}

/**
 * fight(w, u, t, W, dx, dy, d, strikeFn, bag) → 0 out of reach (the caller closes in), 1 engaged, 2 struck this tick.
 * W (scaled in init): {reach (gap past both radii), band (px past reach: steps in), facing (rad), circle (0..1), backStep
 * (default true)}. strikeFn(w, u, t, dx, dy, d, bag) sets the cooldown. From units/space/_lib.js meleeFight (the step-6
 * house melee), with the strike handed to the weapon and the step-in at RUN speed (the sources step in at walk × 0.6 or
 * their own number: a made unit would never catch a backing-off gunman, STEP8 "melee closes at run speed").
 */
export function fight(w, u, t, W, dx, dy, d, strikeFn, bag) {
  if (reachable(w, u, t, dx, dy, d, W.reach) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
  const reach = u.radius + t.radius + W.reach;
  if (d > reach + W.band) return 0;
  setState(u, STATE.ENGAGE); markEngaged(w, u);
  const a = Math.atan2(dy, dx), def = u.def;
  u.face = a;
  let r = 1;
  if (d > reach) { const cs = def.runSpeed; u.goalX = (dx / d) * cs; u.goalY = (dy / d) * cs; }
  else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < W.facing) { strikeFn(w, u, t, dx, dy, d, bag); r = 2; }
  circle(w, u, t, dx, dy, d, def, W.circle, W.backStep !== false);
  oddsApproach(w, u, t, dx, dy, d, def);
  return r;
}

/**
 * One blow on t (or the tree it is perched in): damage amt, push pushF (× pass) along u→t, stun stunT (× pass), a block
 * spark when a shield took part of it, a 'strike' event (v) with `as`. Sets u.attack. Returns the pass fraction.
 * (combat/melee.js meleeStrike, plus `as` on the event.)
 */
export function hit(w, u, t, amt, pushF, stunT, as, v) {
  const tv = perchOf(w, t);
  const dx = tv.x - u.x, dy = tv.y - u.y, d = hypot(dx, dy) || 0.001;
  const pass = damage(w, tv, amt, u);
  if (pushF > 0 || stunT > 0) push(w, tv, dx / d, dy / d, pushF * pass, stunT * pass);
  blockedSpark(w, u, tv, pass);
  if (pass >= 1) w.emit('strike', { x: tv.x, y: tv.y, v, type: u.type, as });
  u.attack = 1;
  return pass;
}

/**
 * Who to hit: t when it is within `gap` px past both radii, else the nearest enemy that is (one in its face while its own
 * target stands behind it: a made unit pinned by a shield line or a boar never reached the man perception gave it; the
 * sources only ever hit their target). The pick becomes u.target. Writes NEAR {t, dx, dy, d}; returns NEAR.t.
 * Only looks while t is close (within gap + NEAR_LOOK), so a unit still running in pays nothing.
 */
export const NEAR = { t: null, dx: 0, dy: 0, d: 0 };
let _nu = null, _ng = 0, _nb = null, _nd = 0;
function nearOne(o) {
  const u = _nu;
  if (o === u || !(o.hp > 0) || o.inside >= 0 || o.z > 30 || o.hidden > 0 || o.def.prop) return;
  const d = hypot(o.x - u.x, o.y - u.y), gap = d - u.radius - o.radius;
  if (gap <= _ng && gap < _nd) { _nd = gap; _nb = o; }
}
export function reachable(w, u, t, dx, dy, d, gap) {
  NEAR.t = t; NEAR.dx = dx; NEAR.dy = dy; NEAR.d = d;
  const tg = d - u.radius - t.radius;
  if (tg <= gap || tg > gap + M.NEAR_LOOK) return t;
  _nu = u; _ng = gap; _nb = null; _nd = Infinity;
  w.query(u.x, u.y, u.radius + gap + M.MARGIN, nearOne, ENEMY[u.faction]);
  const o = _nb; _nu = null; _nb = null;
  if (!o) return t;
  u.target = o.id;
  NEAR.t = o; NEAR.dx = o.x - u.x; NEAR.dy = o.y - u.y; NEAR.d = hypot(NEAR.dx, NEAR.dy) || 0.001;
  return o;
}

/** Possessed, attack held at nobody: the attack pose, nothing hit (a 'swing' event with `as`). */
export function empty(w, u, cooldown, as) {
  if (u.cooldown > 0) return false;
  u.attack = 1; u.cooldown = cooldown;
  w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, as });
  return true;
}

/** Ice under a heavy blow cracks (OG 568.c: dmg / 20, from units/animals/ape.js iceCrack). */
export function iceCrack(w, x, y, r, dmg) {
  const crush = dmg / 20;
  if (hooks.iceHarm && crush > 1) hooks.iceHarm(w, x, y, r, (crush - 1) * 0.3, 0.5);
}

/** Enemies of u within r of (x, y) into out (max cap); returns the count. Slots past the count are left as they were. */
export function enemiesNear(w, u, x, y, r, out) { return w.queryMask(x, y, r, ENEMY[u.faction], out, out.length); }
/** A unit is up in the air (tossed, hopping, flying high): ground blows pass under it. */
export function airborne(o) { return o.z > 0 || o.vz > 0; }
/** Our stance after a weapon move: holds its pose code while it lasts, then clears it. */
export function poseFor(w, u, code, secs) { if (u.b.act === code && poseAge(w, u) >= secs) act(w, u, ACT.NONE); }
