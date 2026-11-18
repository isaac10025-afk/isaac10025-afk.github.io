// Unit maker helpers (OURS, Part 2 step 8, STEP8.md). Owner: LEAD. What every weapon / ability module needs, in one
// import. The brain pieces are the step-6 Space ones (generic: any body, any faction); add your own in YOUR file.
import { onWorldClear } from '../world.js';
export {
  STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff, F, INT, ENEMY,
  meleeStrike, damage, push, stun, depthAt, raycast, splatNoise, advanceTo, markSky, high, attackHeld,
  spawnProjectile, removeProjectile, registerProjectileKind,
  unitOf, targetOf, setState, actAge, canAuto, clearLine, grounded, flying, idle, fleeing, closeOn, keepAt, meleeFight, swing,
  standable, canFloat, floatHard, hittable, ownerOf, outside, sweepFirst, shotHeight, stepHeight, spawnEffect, rideOn, deepAt, wetAt,
} from '../units/space/_lib.js';
export { bite, chew, braced, grabbable, tossTo, glue, blindFor, fleeFor, flung, hunt } from '../units/dinos/_lib.js';
export { fireProjectile, explode, ignite, igniteNow, toss, gunBrain, gunInit, gunFire } from '../combat/index.js';
export { registerSystem } from '../systems/extra.js';

// ---------------------------------------------------------------- pose codes (u.b.act, the art reads them)
// One shared list so the body art can pose any made unit. Weapon codes < 20, ability codes >= 20. Set with act(w, u, code);
// 0 = nothing special (walk / idle; u.attack > 0 = the weapon's plain attack pose for its hold class).
export const ACT = Object.freeze({
  NONE: 0,
  AIM: 1, FIRE: 2, RELOAD: 3, WIND: 4, THROW: 5, SWING: 6, CAST: 7, BREATH: 8, SPRAY: 9, BEAM: 10, HOLD: 11, COMBO: 12, SPIN: 13,
  LEAP: 20, CHARGE: 21, PIN: 22, ROAR: 23, CARRY: 24, SLIDE: 25, STOMP: 26, CHANNEL: 27, SHELL: 28, PUFF: 29, UNDER: 30,
  DIVE: 31, BLINK: 32, SIT: 33, DRINK: 34, SMOKE: 35, SWALLOW: 36, HOP: 37, DOWN: 38, GRAB: 39,
});
/** Set the shared pose code (b.act) and when it started (b.actT). */
export function act(w, u, code) { const b = u.b; if (b.act !== code) { b.act = code; b.actT = w.time; } }

// ---------------------------------------------------------------- scaling (STEP8.md "Numbers")
/** Melee / body weapons: damage, reach and push × this (the size step). Ranged weapons don't scale. */
export function power(u) { const m = u.def.maker; return m ? m.size : 1; }
/** The made unit's maker block ({recipe, body, size, weapon, abs, ...}) or null. */
export function makerOf(u) { return u.def.maker || null; }

// ---------------------------------------------------------------- use counter (tests: did the trick go off?)
const USED = new WeakMap();
onWorldClear((w) => { const m = USED.get(w); if (m) m.clear(); });
/** Call once each time a weapon / ability does its thing (a shot, a pounce, a heal). Free when nobody reads it. */
export function used(w, u, id) { let m = USED.get(w); if (!m) { m = new Map(); USED.set(w, m); } m.set(id, (m.get(id) || 0) + 1); }
export function usedCount(w, id) { const m = USED.get(w); return m ? (m.get(id) || 0) : 0; }
