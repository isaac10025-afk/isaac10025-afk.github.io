// Unit maker A-SUPPORT: shared pieces of the support / defence / death abilities (OURS, Part 2 step 8, STEP8.md).
// Owner: A-SUPPORT. Imported by support-aura.js, support-guard.js, support-life.js (never by the core).
//  - pose(w, u, bag, code) / unpose / poseFor: the shared pose code (u.b.act, lib.js ACT) for a trick, remembered in the
//    ability's bag (bag.pc = code it set, bag.pt = when) so it only ever clears a pose it set itself (the weapon and the
//    other ability set their own codes on the same u.b.act).
//  - slotOf(u, bag): the ability's slot (u.b.ab index) from its bag.
//  - Q: one scratch query array (callers empty it as they read; never nested).
export const MARGIN = 46;            // max unit radius, added to radius queries (the core's margin)
export const Q = new Array(256).fill(null);

/** Set the pose code for this ability (restarts it if another part of the unit set the same code). */
export function pose(w, u, bag, code) {
  const b = u.b;
  if (b.act === code && bag.pc === code && b.actT === bag.pt) return;
  b.act = code; b.actT = w.time; bag.pc = code; bag.pt = w.time;
}
/** Clear the pose this ability set (if it is still showing); forget it either way. */
export function unpose(w, u, bag) {
  if (bag.pc === 0) return;
  const b = u.b;
  if (b.act === bag.pc && b.actT === bag.pt) { b.act = 0; b.actT = w.time; }
  bag.pc = 0;
}
/** A timed pose: cleared once it has shown `secs`. */
export function poseFor(w, u, bag, secs) { if (bag.pc !== 0 && w.time - bag.pt >= secs) unpose(w, u, bag); }
/** The bag's slot in u.b.ab (-1 if not found). */
export function slotOf(u, bag) { const ab = u.b && u.b.ab; return ab ? ab.indexOf(bag) : -1; }
/** Live, on the field, not swallowed, not a prop. */
export function alive(o) { return !!o && !o.dead && o.hp > 0 && o.inside < 0 && !o.def.prop; }
