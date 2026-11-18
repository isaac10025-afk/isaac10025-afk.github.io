// Unit maker: W-THROW shared pieces (OURS, Part 2 step 8, STEP8.md). Owner: W-THROW. Not a weapon: helpers the three
// W-THROW files (throw.js, throw-sport.js, throw-magic.js) share. No allocation per tick.
import { act, ACT, used, power, meleeFight, meleeStrike, advanceTo, setState, STATE, hypot, angleDiff, clearLine } from '../lib.js';

export { ACT };

/** Pose code (u.b.act) for the art; weapon codes only (< 20), so an ability's pose is never cleared by us. */
export function pose(w, u, code) { act(w, u, code); }
/** Clear our pose `code` once it is `secs` old. */
export function poseEnd(w, u, code, secs) { const b = u.b; if (b.act === code && w.time - b.actT >= secs) act(w, u, 0); }
/** Clear our pose `code` now (if it is still ours). */
export function poseOff(w, u, code) { if (u.b.act === code) act(w, u, 0); }

/**
 * A source unit's close-in blow made for this body (STEP8: melee damage, reach and push × power(u); closes at run speed).
 * Called once in init: the copy lives in the weapon's bag.
 */
export function scaledMelee(W, u) {
  const P = power(u);
  return { ...W, damage: W.damage * P, push: (W.push || 0) * P, reach: (W.reach || 0) * P, close: u.def.runSpeed };
}

/**
 * The close-in fight with a scaled melee spec M (meleeFight format): in reach it strikes (used() counts it), out of reach
 * it runs at the target. Returns meleeFight's code: 0 out of reach (ran at it), 1 engaged, 2 struck this tick.
 */
export function brawl(w, u, t, M, dx, dy, d, id) {
  const r = meleeFight(w, u, t, M, dx, dy, d);
  if (r === 2) used(w, u, id);
  else if (r === 0) { advanceTo(w, u, t, dx, dy, clearLine(w, u), u.def.runSpeed); setState(u, STATE.CHARGE); }
  return r;
}

/** Point on the line from u toward (ax, ay) kept min..max px out (possessed aim at the ground). Writes AIM[0..1]. */
export const AIM = new Float64Array(2);
export function aimClamp(u, aim, ax, ay, min, max) {
  let dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy);
  if (!(d > 0.001)) { dx = Math.cos(aim); dy = Math.sin(aim); d = 1; }
  const r = Math.min(max, Math.max(min, d));
  AIM[0] = u.x + (dx / d) * r; AIM[1] = u.y + (dy / d) * r;
  return AIM;
}

/** Count a use (the matrix test reads it) and bump the shared shot counter the report reads. */
export function shot(w, u, id) {
  used(w, u, id);
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
}

/**
 * Up close with nothing else to hit with. Ours (STEP8 call, W-THROW): the grenadier, archer, mage, catapult and the
 * dragon's breath have no close-in blow in their sources, so a made unit carrying one stood helpless with a boar in its
 * face (a 3000 hp giant could not hurt it in 25 s). It swats with the held thing: the lead's plain fists (maker/index.js
 * FALLBACK numbers) × power, only while the enemy is in its face. The swat keeps its own clock (bag.swatAt), so a
 * reload never holds it and it never holds the reload.
 */
export const FISTS = {
  damage: 8,           // the lead's FALLBACK fists (× power)
  damageJitter: 2,     // ±
  push: 60,            // shove (× power)
  stun: 0.1,           // s
  every: 0.7,          // s between swats ...
  everyJitter: 0.1,    // ... + up to this
  reach: 4,            // px past both bodies (× power)
  band: 14,            // px past the reach: steps in at a run
  facing: 0.7,         // rad
};
/** In init: the body's copy of FISTS (no cooldown field: meleeStrike must leave u.cooldown to the throw). */
export function fistsFor(u) {
  const P = power(u);
  return { damage: FISTS.damage * P, damageJitter: FISTS.damageJitter * P, push: FISTS.push * P, stun: FISTS.stun, reach: FISTS.reach * P, band: FISTS.band, facing: FISTS.facing, close: u.def.runSpeed };
}
/** Enemy in its face (within reach + band): swat it and return true (B.swatAt = the swat's clock); else false. */
export function swat(w, u, t, M, dx, dy, d, id, B) {
  const reach = u.radius + t.radius + M.reach;
  if (d > reach + M.band) return false;
  setState(u, STATE.ENGAGE);
  const a = Math.atan2(dy, dx);
  u.face = a;
  if (d > reach) { u.goalX = (dx / d) * M.close; u.goalY = (dy / d) * M.close; return true; }
  if (w.time >= B.swatAt && Math.abs(angleDiff(u.heading, a)) < M.facing) {
    meleeStrike(w, u, t, M);
    B.swatAt = w.time + FISTS.every + FISTS.everyJitter * w.rng();
    used(w, u, id);
  }
  return true;
}
