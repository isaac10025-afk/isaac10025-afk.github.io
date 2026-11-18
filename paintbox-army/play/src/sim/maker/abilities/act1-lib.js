// Unit maker: A-ACT1 shared pieces (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT1. Not an ability: the small helpers
// the act1-*.js modules share (no state of their own but the held-victims list).
//  - free(u) / low(u): may this body start a ground move (pounce, charge, slide...) / a grab (throw, lasso, swallow)?
//  - drive(u, bag, gx, gy, face): a mid-move's goal for this tick, kept in the bag too. A mid-move steps in the
//    ability's `tick` (every tick, before the brain: the brain can skip ticks); the core brain then clears the goal and
//    calls `busy`, which puts it back with keep(u, bag).
//  - bodyHit(): damage from the hitter's body (+ the zombie bite when the made unit is a risen copy, like dinos chew()).
//  - say(): every event carries type = the made type and as = the source unit (the AUDIO pass maps sounds through as).
//  - holding(w, by, bag, v, r) / unheld(w, v): a victim held by a made unit (thrown, lassoed, swallowed). If the holder
//    vanishes without letting go (edited / deleted from the maker, cursed into a frog, erased), the act1Held system lets
//    it go (not hurled, its radius back). The ability lets go itself everywhere else and calls unheld().
import { registerSystem, damage, LEAP, STATE } from '../lib.js';
import { infect } from '../../combat/index.js';
import { onWorldClear } from '../../world.js';
import { F, ALL_MASK, maskWithout, canHit } from '../../factions.js';

export const A1 = {
  MARGIN: 46,          // px: max unit radius, added to radius queries (the core's margin)
  GROUNDED: 6,         // px: a body higher than this is in the air (no ground moves, area moves pass under it)
  LOW: 30,             // px: a body higher than this is up in the sky (no grabs from there)
  PROPS_OUT: maskWithout(ALL_MASK, F.Props),   // "anyone": every faction but trees / barrels / anthills
};
/** s: a made unit's first trick is ready within this of being placed (ours: the source units wait 1-3 s to spread a
 *  pack out; a made unit shows its trick in the first clash). */
export const FIRST = 0.3;
export { canHit, LEAP, STATE };

/** Stunned longer than `t` s? Beast and giant bodies shrug stuns off (the core zeroes them every brain tick: BODIES shrug). */
export function stunned(u, t = 0) { return u.stun > t && !(u.def.maker && u.def.maker.shrug); }
/** May u start a move along the ground (pounce, charge, tackle, slide, stomp, sit)? Not in the air, flying, leaping, climbing, held, swallowed or stunned. */
export function free(u) { return u.leaping === 0 && !(u.z > A1.GROUNDED) && !(u.climb > 0) && u.inside < 0 && u.hurled !== 1 && !stunned(u); }
/** free(u), but small knocks (stun ≤ 0.3 s) don't stop it: the reflex area moves (stomp, sit; the baby shrugs off
 *  stuns ≤ 0.6 s, the long-neck all of them), else a unit in a melee crowd is stun-locked out of them for good. */
export function steady(u) { return u.leaping === 0 && !(u.z > A1.GROUNDED) && !(u.climb > 0) && u.inside < 0 && u.hurled !== 1 && !stunned(u, 0.3); }
/** May u grab someone (throw, lasso, swallow)? Not high in the sky, held or swallowed itself. */
export function low(u) { return !(u.z > A1.LOW) && !(u.climb > 0) && u.inside < 0 && u.hurled !== 1; }
/** A mid-move's goal + facing for this tick (on the unit, and kept in the bag for busy / possessMove). */
export function drive(u, bag, gx, gy, face) { u.goalX = bag.gx = gx; u.goalY = bag.gy = gy; u.face = bag.face = face; }
/** busy(): put the mid-move's goal back after the core brain cleared it. Returns true. */
export function keep(u, bag) { u.goalX = bag.gx; u.goalY = bag.gy; u.face = bag.face; return true; }
/** Stand still for this tick (mid-move that doesn't walk: roaring, holding up, rearing), facing `face` (NaN = keep heading). */
export function stand(u, bag, face) { drive(u, bag, 0, 0, face === face ? face : u.heading); return true; }
/** Fill a bag's drive fields (init). */
export function initDrive(bag) { bag.gx = 0; bag.gy = 0; bag.face = 0; }
export const unitOf = (w, id) => (id >= 0 ? w.unitById(id) : null);
export function isRisen(u) { return u.def.risenFrom !== undefined; }
/** Damage from u's body to v, dealt from (fx, fy) (v's own spot = shields don't help); a risen copy's bite infects. */
export function bodyHit(w, u, v, dmg, fx, fy) {
  const pass = damage(w, v, dmg, u, undefined, fx, fy);
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  return pass;
}
/** Emit an event for audio / fx: type = the made type, as = the source unit type. */
export function say(w, name, u, x, y, v, as, k, kv) {
  const e = { x, y, v, type: u.type, as };
  if (k !== undefined) e[k] = kv;
  w.emit(name, e);
}
/** Is o someone u may hit (alive, not swallowed, not a prop, hostile)? */
export function foeOf(u, o) { return o !== u && !o.dead && o.hp > 0 && o.inside < 0 && !o.def.prop && canHit(u, o); }

// ---------------------------------------------------------------- held victims (per world)
const WS = new WeakMap();
function ws(w) { let s = WS.get(w); if (!s) { s = { held: [], free: [] }; WS.set(w, s); } return s; }
onWorldClear((w) => { const s = WS.get(w); if (s) { for (const e of s.held) s.free.push(e); s.held.length = 0; } });
function dropAt(s, k) { s.free.push(s.held[k]); s.held[k] = s.held[s.held.length - 1]; s.held.pop(); }
/** `by` (its ability bag `bag`, bag.vic = v.id while it holds) has just taken v; r = v's radius to give back if it is let go by the safety net (0 = keep). */
export function holding(w, by, bag, v, r) {
  const s = ws(w);
  for (let k = 0; k < s.held.length; k++) if (s.held[k].v === v.id) { const e = s.held[k]; e.by = by.id; e.bag = bag; e.r = r; return; }
  const e = s.free.pop() || { v: -1, by: -1, bag: null, r: 0 };
  e.v = v.id; e.by = by.id; e.bag = bag; e.r = r;
  s.held.push(e);
}
/** The holder let v go properly (or v is gone): forget it. */
export function unheld(w, vid) {
  const s = WS.get(w); if (!s) return;
  for (let k = 0; k < s.held.length; k++) if (s.held[k].v === vid) { s.held[k].bag = null; dropAt(s, k); return; }
}
// After deaths: a victim whose holder is gone (or no longer names it) is let go where it hangs.
function heldSys(w) {
  const s = WS.get(w); if (!s || s.held.length === 0) return;
  for (let k = s.held.length - 1; k >= 0; k--) {
    const e = s.held[k], v = w.unitById(e.v);
    if (!v) { e.bag = null; dropAt(s, k); continue; }
    const h = w.unitById(e.by);
    if (h && h.hp > 0 && e.bag && e.bag.vic === e.v) continue;
    if (v.hurled === 1) {
      v.hurled = 0; if (e.r > 0) v.radius = e.r;
      if (!(v.z > 0)) v.z = 1;
      if (v.hp > 0 && v.stun < 0.3) v.stun = 0.3;
    }
    e.bag = null; dropAt(s, k);
  }
}
registerSystem('act1Held', heldSys, 'lifecycle');
