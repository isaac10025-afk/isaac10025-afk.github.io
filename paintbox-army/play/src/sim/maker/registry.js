// Unit maker registry (OURS, Part 2 step 8, STEP8.md). Owner: LEAD. Weapon and ability modules import THIS file (never
// maker/index.js: index.js imports them, so importing it back would deadlock its top-level await).
//
// registerWeapon(spec)  spec = {
//   id,                       catalogue id (catalog.js WEAPONS)
//   range,                    px centre to centre it attacks from (0 = melee: reach comes from the radii); sets the sight
//   def?,                     object | (def) => object: fields merged into the made def (e.g. weapon {} for gunBrain,
//                             look: { attack: { time } }). Applied after the body, before the abilities.
//   init?(w, u, bag),         at spawn: fill bag (= u.b.wb, the weapon's own object) with every field it will use
//   fight(w, u, t, dx, dy, d, bag)   every brain tick with a live target (nothing busy, not stunned, not fleeing):
//                             move (u.goalX/goalY, setState) + face (u.face) + attack (u.cooldown, u.attack = 1, emit)
//   busy?(w, u, bag) -> true  runs first every brain tick: true = mid-move, it drove the unit itself this tick
//   idle?(w, u, bag) -> true  no target: true = it did something (reload, wander) instead of the core idle
//   possessFire?(w, u, aim, ax, ay, bag)   attack held at nobody while possessed (POSSESS.md)
//   onHit?(w, u, amount, src, kind, bag), onDeath?(w, u, cause, killer, bag), damageMul?(w, u, amount, att, kind, bag) -> ×
//   tick?(w, u, bag)          every tick (also stunned / airborne), never while the field is holding (before START)
// }
// registerAbility(spec)  spec = { id, def?, init?, busy?, act?(w, u, t, dx, dy, d, bag) -> true (used: weapon skipped
//   this tick), idle?, after?(w, u, bag) (after the weapon, every brain tick), possessMove?(w, u, mx, my, firing, bag),
//   holdsNerve?(w, u, bag) -> true, onHit?, onDeath?, damageMul?, tick? }  (same meanings as above; bag = u.b.ab[slot])
// Both may add `test: { setup(g, w, u, foes), within }` for the maker matrix test (STEP8.md, tests/maker.test.mjs).
import { WEAPONS, ABILITIES } from './catalog.js';

const W_ROW = new Map(WEAPONS.map((r) => [r.id, r]));
const A_ROW = new Map(ABILITIES.map((r) => [r.id, r]));
export const WEAPON_MODS = new Map();
export const ABILITY_MODS = new Map();
export let registryVersion = 0;

export function registerWeapon(spec) {
  const row = spec && W_ROW.get(spec.id);
  if (!row) throw new Error('registerWeapon: not in catalog.js WEAPONS: ' + (spec && spec.id));
  if (typeof spec.fight !== 'function') throw new Error('registerWeapon ' + spec.id + ': fight missing');
  const s = { range: 0, ...spec, row };
  WEAPON_MODS.set(spec.id, s); registryVersion++;
  return s;
}
export function registerAbility(spec) {
  const row = spec && A_ROW.get(spec.id);
  if (!row) throw new Error('registerAbility: not in catalog.js ABILITIES: ' + (spec && spec.id));
  const s = { ...spec, row, kind: row.kind };
  ABILITY_MODS.set(spec.id, s); registryVersion++;
  return s;
}
export function getWeapon(id) { return WEAPON_MODS.get(id) || null; }
export function getAbility(id) { return ABILITY_MODS.get(id) || null; }
export function weaponRow(id) { return W_ROW.get(id) || null; }
export function abilityRow(id) { return A_ROW.get(id) || null; }
/** Picker lists: catalogue order, only what is built (registered). */
export function readyWeapons() { return WEAPONS.filter((r) => WEAPON_MODS.has(r.id)).map((r) => r.id); }
export function readyAbilities() { return ABILITIES.filter((r) => ABILITY_MODS.has(r.id)).map((r) => r.id); }
