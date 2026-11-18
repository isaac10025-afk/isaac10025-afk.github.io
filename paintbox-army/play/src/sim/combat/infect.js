// Infection helper (OG 412.n, game.js:8829-8842). The risen copies themselves are MYTHICAL's: MYTHICAL registers
// a turn hook with setCombatHook('turn', fn) and CORE-A lifecycle counts u.infection down (OG game.js:5345).
import { initCombat, rnd, stat } from './env.js';
import * as DEFS from '../defs.js';

/** Risen type for a unit type: def.risenType, else 'risen_<type>' if registered (OG f.b map). */
export function risenTypeOf(u) {
  const d = u.def;
  if (d.risenType !== undefined) return d.risenType;
  if (typeof DEFS.getRisenType === 'function') { const r = DEFS.getRisenType(u.type); if (r) return r; }
  const t = 'risen_' + u.type;
  return DEFS.getDef(t) ? t : undefined;
}
/**
 * infect(world, target, attacker, chance, timer): roll rng < chance; on success the target turns when the timer
 * runs out or when it dies (timer Infinity for turnsWhenKilled types). Returns true if it got infected.
 */
export function infect(world, target, attacker, chance, timer) {
  if (!target) return false;
  initCombat(target);
  const d = target.def, rt = risenTypeOf(target);
  if (!d.infectable || rt === undefined || target.infection > 0) return false;
  if (attacker && attacker.skeleton === 1) return false;                      // skeletons never infect
  if (rnd(world) >= chance) return false;
  target.infection = d.turnsWhenKilled ? Infinity : Math.max(timer, Number.EPSILON);
  target.infectType = rt;
  target.infectGroup = attacker ? attacker.group : -1;
  target.infectTeam = attacker ? attacker.team : -1;
  stat(world, 'infections');
  return true;
}
