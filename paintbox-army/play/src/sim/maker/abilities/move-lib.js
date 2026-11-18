// Unit maker: A-MOVE shared pieces (OURS, Part 2 step 8, STEP8.md). Owner: A-MOVE. Not an ability: move-fly.js,
// move-ground.js and move-passive.js import it.
//  - bagOf(u, id): an ability's own bag from outside its hooks (def hooks like `underground(u)`, world systems).
//  - lists(w): per-world id lists for the few world systems the move abilities need (sneak after conceal, skates after the
//    player's stick, the beam after the brains). Every list is empty until a made unit with that ability is on the field,
//    and each system returns at once on an empty list: a made unit that isn't on the field costs nothing.
//  - meleeW(u): the made unit's weapon is melee / body (range 0): a flyer dives down to strike with it.
//  - small brain pieces (go straight at a point, circle a point, end a pose code that is still ours).
import { onWorldClear } from '../../world.js';
import { act, hypot } from '../lib.js';

/** The bag of ability `id` on made unit u (u.b.ab[slot]), or null if u doesn't carry it (any more). */
export function bagOf(u, id) {
  const m = u.def.maker, ab = u.b.ab;
  if (!m || ab === undefined) return null;
  const A = m.abs;
  for (let i = 0; i < A.length; i++) if (A[i].id === id) return ab[i] || null;
  return null;
}

/** The weapon is melee or a body weapon (it reaches from its radius: range 0). */
export function meleeW(u) { const m = u.def.maker; return !m || !(m.weapon.range > 0); }

// ---------------------------------------------------------------- per-world lists (Clear empties them)
const WS = new WeakMap();
export function lists(w) {
  let s = WS.get(w);
  if (!s) { s = { sneak: [], skate: [], beam: [] }; WS.set(w, s); }
  return s;
}
export function peekLists(w) { return WS.get(w); }
onWorldClear((w) => { const s = WS.get(w); if (s) { s.sneak.length = 0; s.skate.length = 0; s.beam.length = 0; } });
/** Add id to a list once. */
export function listAdd(L, id) { for (let k = 0; k < L.length; k++) if (L[k] === id) return; L.push(id); }
/** Swap-remove entry k. */
export function listDrop(L, k) { L[k] = L[L.length - 1]; L.pop(); }

// ---------------------------------------------------------------- brain pieces
/** Goal straight at (dx, dy) (d = its length) at `speed`, facing it. */
export function goAt(u, dx, dy, d, speed) {
  const k = speed / (d || 0.001);
  u.goalX = dx * k; u.goalY = dy * k; u.face = Math.atan2(dy, dx);
}
/** Circle the point (u.x + dx, u.y + dy) `R` px out at `speed` (ptero / phoenix between dives), side by unit index. */
export function circleAt(u, dx, dy, d, R, speed) {
  d = d || 0.001;
  const s = u.index & 1 ? 1 : -1, m = Math.max(-speed, Math.min(speed, 2.5 * (d - R)));
  let vx = -dy / d * s * speed + dx / d * m, vy = dx / d * s * speed + dy / d * m;
  const v = hypot(vx, vy) || 0.001;
  u.goalX = vx * speed / v; u.goalY = vy * speed / v;
}
/** Clear the shared pose code if it is still `code` (the weapon may have set its own since). */
export function endAct(w, u, code) { if (u.b.act === code) act(w, u, 0); }
