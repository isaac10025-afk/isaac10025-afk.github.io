// Unit registry. registerUnit applies the ×1.1 radius/brushSpacing scale (OG game.js:8342, 8668).
// Also keeps the risen lookup (OG game.js:8343) and the mine-aware flag per type (OG game.js:8344).
import { RADIUS_SCALE } from './const.js';
import { mineAware, F, sideOf } from './factions.js';

const DEFS = new Map();
const RISEN = new Map();     // base type -> risen type
let bossTypes = 0;

const FLOCK_ZERO = { personalSpace: 1, separation: 0, alignment: 0, cohesion: 0, formation: 0, herd: 0, herdSpacing: 0,
  flockByState: [0, 0, 0, 0, 0, 0], formationByState: [0, 0, 0, 0, 0, 0] };
const MORALE_NONE = { baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 0, recoverRate: 0, panicFear: 0, deathFear: 0 };

export function registerUnit(def) {
  if (!def || !def.type) throw new Error('registerUnit: def.type missing');
  const d = { ...def };
  d.ogRadius = def.radius; d.ogBrushSpacing = def.brushSpacing;
  if (typeof def.radius === 'number') d.radius = def.radius * RADIUS_SCALE;           // OG game.js:8342
  if (typeof def.brushSpacing === 'number') d.brushSpacing = def.brushSpacing * RADIUS_SCALE; // OG game.js:8342
  // Neutral fallbacks so a half-written def never crashes the core (OG defs always carry these blocks).
  d.flock = { ...FLOCK_ZERO, ...(def.flock || {}) };
  d.morale = { ...MORALE_NONE, ...(def.morale || {}) };
  if (d.radiusJitter === undefined) d.radiusJitter = 0;
  if (d.mass === undefined) d.mass = 1;
  if (d.maxHp === undefined) d.maxHp = 1;
  if (d.strength === undefined) d.strength = 0;
  if (d.reactionTime === undefined) d.reactionTime = 0;
  if (d.turnSpeedFalloff === undefined) d.turnSpeedFalloff = Infinity;
  if (d.locomotion === undefined) d.locomotion = 0;
  for (const k of ['walkSpeed', 'runSpeed', 'maxSpeed', 'accel', 'decel', 'turnRate', 'sightRange', 'alertSightRange', 'huntRange', 'minDistance', 'intelligence'])
    if (d[k] === undefined) d[k] = 0;
  if (!d.category) d.category = d.prop === true ? 'terrain' : 'army'; // OG game.js:7762
  d.paintable = d.risenFrom === undefined && !d.unpaintable;           // OG game.js:7756
  d.mineAware = mineAware(d);                                          // OG game.js:8344, 8444-8446
  if (d.faction === F.Side && !d.side) d.side = sideOf(d.type);         // OURS (side split 11-17): world.js Sides gives it a slot
  if (d.boss && !(DEFS.get(d.type) || {}).boss) bossTypes++;
  DEFS.set(d.type, d);
  if (d.risenFrom !== undefined) RISEN.set(d.risenFrom, d.type);      // OG game.js:8343
  return d;
}
export function getDef(type) { return DEFS.get(type) || null; }
// OURS (Part 2 step 8, STEP8.md): the unit maker replaces / deletes a made unit's def (and its risen copy) at run time.
export function unregisterUnit(type) {
  const d = DEFS.get(type); if (!d) return false;
  if (d.boss) bossTypes--;
  DEFS.delete(type);
  if (d.risenFrom !== undefined && RISEN.get(d.risenFrom) === type) RISEN.delete(d.risenFrom);
  return true;
}
export function allDefs() { return [...DEFS.values()]; }
export function getRisenType(baseType) { return RISEN.get(baseType) ?? null; }
export function anyBossType() { return bossTypes > 0; }
