// Fire and burning: unit burning system (OG module 509, game.js:11108-11147), ignition (412.m / 412.j,
// game.js:8843-8863), and putting fire out in water with steam (OG water system, game.js:717-733).
import { DT, DEEP, STATE, QUERY_MARGIN, initCombat, wetAt, frozenAt, depthAt, setState, rnd, range, emit, hooks, stat } from './env.js';
import { getOil } from './oil.js';

export const BURN_BASE = 4;        // OG game.js:11108 (W.a = 4 s)
export const BURN_DPS = 18;        // OG game.js:11109: 18 hp/s, not through 412.h
export const SPREAD_CHANCE = 0.8;  // OG game.js:11110: per tick 0.8·dt·flammability
export const SPREAD_GAP = 3;       // OG game.js:11111: r + r + 3 + fireReach
export const BURN_MORALE = 1.2;    // OG game.js:11112: −1.2/s if canBreak
export const BURN_MIN_FRAC = 0.5;  // OG game.js:8848 (P): burn = base·U(0.5, 1)
export const QUENCH_STEAM = 26, QUENCH_THICK = 3.5; // OG game.js:672-673 (steam cloud size x + r, thickness k)

/**
 * Light a unit for sure, if it can burn (OG 412.m, game.js:8847-8863). base = burn seconds (4 plain, 6.4 alight).
 * Returns true if the unit is (still) burning after the call.
 */
export function igniteNow(world, u, base = BURN_BASE) {
  initCombat(u);
  const d = u.def;
  if (!(d.flammability > 0)) return false;
  if (wetAt(world, u) && !d.deckFire && !getOil(world).burningAt(u.x, u.y)) return false; // STEP4 PIRATES: def.deckFire (ship) burns afloat
  if (d.burnsOnce && u.singed === 1) return false;
  if (d.burnTime !== undefined) base = d.burnTime;
  u.kindled = 1;
  if (d.look && d.look.fur) u.singed = 1;
  if (u.burning <= 0) {
    stat(world, 'ignitions');
    emit(world, 'ignite', { x: u.x, y: u.y, v: u.radius, type: u.type });
    if (!d.prop) u.wander = u.heading;
  }
  const b = base * range(world, BURN_MIN_FRAC, 1);
  if (u.burning < b) u.burning = b;
  return true;
}

/** ignite(world, u, chance, base = 4): roll rng < chance·flammability, then light (OG 412.j, game.js:8843-8846). */
export function ignite(world, u, chance = 1, base = BURN_BASE) {
  const f = u.def.flammability;
  if (f > 0 && rnd(world) < chance * f) return igniteNow(world, u, base);
  return false;
}

let _src = null, _world = null, _reach = 0;
function spreadTo(c) {
  const u = _src;
  if (c === u || c.dead || !(c.hp > 0) || c.burning > 0) return;
  const lim = u.radius + c.radius + SPREAD_GAP + _reach, dx = c.x - u.x, dy = c.y - u.y;
  if (dx * dx + dy * dy > lim * lim) return;
  initCombat(c);
  ignite(_world, c, SPREAD_CHANCE * DT, BURN_BASE);
}

// Fire system, every tick (OG game.js:11113-11147).
export function run(world) {
  const us = world.units;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !(u.burning > 0)) continue;
    initCombat(u);
    u.burning = Math.max(0, u.burning - DT);
    u.hp -= BURN_DPS * DT;
    u.harmCause = 3; // CAUSE.Fire
    const mo = u.def.morale;
    if (mo && mo.canBreak) {                                   // OG game.js:11122-11124 (no think gate)
      u.morale = Math.max(0, u.morale - BURN_MORALE * DT);
      if (u.morale < mo.breakAt) setState(u, STATE.FLEE);
    }
    const reach = u.def.fireReach || 0;
    _src = u; _world = world; _reach = reach;
    world.query(u.x, u.y, u.radius + QUERY_MARGIN + SPREAD_GAP + reach, spreadTo); // all factions (OG 11128)
  }
  _src = null; _world = null;
}

// Water puts out a wet, unfrozen unit unless it stands on burning oil (OG game.js:717-733).
// Runs at the end of the oil system (just before TERRAIN's water system in the OG order). Idempotent.
export function quench(world, u) {
  if (u.dead || u.def.deckFire || !wetAt(world, u) || frozenAt(world, u.x, u.y)) return; // STEP4 PIRATES: a ship's deck isn't put out by the sea
  const oil = getOil(world), onFire = oil.burningAt(u.x, u.y);
  if (u.burning > 0 && !onFire) {
    u.burning = 0;
    emit(world, 'steam', { x: u.x, y: u.y - u.radius, size: QUENCH_STEAM + u.radius, thick: QUENCH_THICK });
    if (hooks.steam) hooks.steam(world, u.x, u.y - u.radius, QUENCH_STEAM + u.radius, QUENCH_THICK);
  }
  const giant = u.type === 'giant' || u.type === 'risen_giant';
  if (u.kindled === 1 && !(giant && !(depthAt(world, u.x, u.y) >= DEEP)) && !onFire) { // Giants only in deep water
    u.kindled = 0;
    emit(world, 'steampuff', { x: u.x, y: u.y - 1.5 * u.radius });
  }
}
export function quenchAll(world) {
  if (typeof world.waterAt !== 'function') return;
  if (world.waterCells === 0) return;
  const us = world.units;
  for (let k = 0; k < us.length; k++) { const u = us[k]; if (u.burning > 0 || u.kindled === 1) quench(world, u); }
}
