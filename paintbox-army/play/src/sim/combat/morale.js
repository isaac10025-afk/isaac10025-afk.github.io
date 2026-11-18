// Morale system (OG game.js:4966-4997), runs on each unit's think ticks only.
// Inputs u.odds / u.fear come from CORE-A perception (OG game.js:4960-4961); fear falls back to a field sample.
import { STATE, MORALE_STEP, initCombat, setState, casualtyRatio, splatFear, sampleFear } from './env.js';
export { fleeSteer } from './status.js';

export const PANIC_R = 70;       // OG game.js:4993
export const DEATH_FEAR_R = 90;  // OG game.js:5350

/** Pure target-morale formula (OG game.js:4980-4985). */
export function moraleTarget(m, bravery, odds, fear, casualty, hpFrac) {
  let f = m.baseline * bravery - (odds > 1 ? odds - 1 : 0) * m.oddsWeight - fear * m.fearWeight - casualty * m.casualtyWeight - (1 - hpFrac) * m.woundWeight;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}
/** One think-tick morale update for one unit (OG game.js:4973-4995). */
export function moraleThink(world, u) {
  const m = u.def.morale;
  if (!m) return;
  initCombat(u);
  const target = moraleTarget(m, u.bravery, u.odds || 0, u.fear || 0, casualtyRatio(world, u.group), u.hp / u.maxHp);
  const rate = target < u.morale ? m.dropRate : m.recoverRate;
  u.morale += (target - u.morale) * Math.min(1, rate * MORALE_STEP);           // fixed 0.1 s step (OG game.js:4989)
  if (u.state !== STATE.FLEE) {
    if (m.canBreak && u.morale < m.breakAt && !(u.def.holdsNerve && u.def.holdsNerve(world, u) === true)) {
      setState(u, STATE.FLEE);
      splatFear(world, u.faction, u.x, u.y, m.panicFear, PANIC_R);            // panic spreads through the fear field
      if (world.emit) world.emit('panic', { x: u.x, y: u.y, type: u.type });
    }
  } else if (u.morale > m.rallyAt && u.stateTime > m.minFleeTime) setState(u, STATE.IDLE); // rally (OG game.js:4994)
}

// Think gate: CORE-A perception stamps u.lastThink = tick. Until it does, morale keeps its own 4-8 tick cadence
// (OG game.js:4924-4925, first think 1-6 ticks after spawn, game.js:5583).
function thinksNow(world, u) {
  if (u.lastThink !== undefined) return u.lastThink === world.tick;
  if (u._mThink === undefined) u._mThink = world.tick + 1 + Math.floor(world.rng() * 6);
  if (world.tick < u._mThink) return false;
  u._mThink = world.tick + 4 + Math.floor(world.rng() * 5);
  if (u.fear === undefined || u._mOwnFear) { u._mOwnFear = 1; u.fear = sampleFear(world, u.faction, u.x, u.y); }
  return true;
}

export function run(world) {
  const us = world.units;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !u.def.morale) continue;
    if (!thinksNow(world, u)) continue;
    moraleThink(world, u);
  }
}
