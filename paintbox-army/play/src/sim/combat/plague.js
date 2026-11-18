// Plague (OG module 492, game.js:10003-10092): catch, sick stage, coughs, spread, burning cures.
import { DT, QUERY_MARGIN, CAUSE, initCombat, rnd, range, emit, stat } from './env.js';
import * as FA from '../factions.js';
export { isSick } from './damage.js';

export const SICK_AFTER = 4;               // OG game.js:10017 (d): contagious/sick from 4 s after catching
export const PLAGUE_LEN = 24, PLAGUE_JIT = 0.3; // OG game.js:10018-10019: lasts 4 + 24·U(0.7, 1.3) s
export const SICK_SPEED = 0.75;            // OG game.js:10020 (v): speed ×0.75 (CORE-A steering reads isSick)
export const SICK_HIT = 0.7;               // OG game.js:10021 (y)
export const PLAGUE_DPS = 2;               // OG game.js:10022 (w)
export const PLAGUE_MORALE = 0.05;         // OG game.js:10023 (x): −0.05/s if canBreak
export const SPREAD_SICK = 0.25, SPREAD_EARLY_MUL = 0.5, SPREAD_CARRIER = 0.15, SPREAD_GAP = 3; // OG 10024-10027
export const COUGH_RATE = 0.22, COUGH_GAP = 0.8, COUGH_R = 16, COUGH_CHANCE = 0.25; // OG 10028-10031

function isUndeadFaction(f) { return f === 'undead' || f === 'Undead' || (FA.F && FA.F.Undead !== undefined && f === FA.F.Undead); }
/** Can this unit catch plague now (OG game.js:10032-10041). */
export function canCatch(u) {
  const d = u.def;
  return !(u.plague > 0) && !u.plagueFree && !(d.look && d.look.undead) && !isUndeadFaction(d.faction) && !d.prop && !d.plagueCarrier;
}
/** catchPlague(world, u) (OG game.js:10045-10048). */
export function catchPlague(world, u) {
  initCombat(u);
  if (!canCatch(u)) return false;
  u.plague = SICK_AFTER + PLAGUE_LEN * range(world, 1 - PLAGUE_JIT, 1 + PLAGUE_JIT);
  u.plagueAt = world.time;
  stat(world, 'plagued');
  return true;
}

// spread(world, u, gap, chance): the first 32 units found within r + r + gap (all factions, grid order) roll chance
// (OG I(), game.js:10077-10092: queryRadius(..., all, scratch, 32)). L3 11-14: before, every unit in range was visited
// (no 32 cap): a dense rat pack (plague carriers) cost 15 ms a tick at 3.6k rats (OG's whole tick: 9 ms), and units past
// the 32nd could catch it where OG's could not.
const SPREAD_MAX = 32, PQ = new Array(SPREAD_MAX);
let qn = 0;
function take(c) { PQ[qn++] = c; return qn >= SPREAD_MAX; }   // same scan order and cap for a world without queryMask
export function spread(world, u, gap, chance) {
  const r = u.radius + QUERY_MARGIN + gap;
  let n;
  if (typeof world.queryMask === 'function') n = world.queryMask(u.x, u.y, r, FA.ALL_MASK, PQ, SPREAD_MAX);
  else { qn = 0; world.query(u.x, u.y, r, take); n = qn; }
  for (let k = 0; k < n; k++) {
    const c = PQ[k]; PQ[k] = null;
    if (c === u || !(c.hp > 0)) continue;
    initCombat(c);
    if (!canCatch(c)) continue;
    const f = u.radius + c.radius + gap, dx = c.x - u.x, dy = c.y - u.y;
    if (dx * dx + dy * dy > f * f) continue;
    if (rnd(world) < chance) catchPlague(world, c);
  }
}
function cough(world, u) {                                                     // OG game.js:10070-10076
  u.coughAt = world.time;
  u.react = Math.max(u.react || 0, COUGH_GAP);
  emit(world, 'cough', { x: u.x, y: u.y, v: 1, type: u.type });
  spread(world, u, COUGH_R, COUGH_CHANCE);
}

export function run(world) {
  const us = world.units, now = world.time;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !(u.hp > 0)) continue;
    const d = u.def, carrier = d.plagueCarrier === true;
    if (!carrier && !(u.plague > 0)) continue;
    initCombat(u);
    let chance = SPREAD_CARRIER;
    if (!carrier) {
      if (u.burning > 0) { u.plague = 0; continue; }                          // burning cures (no immunity)
      u.plague -= DT;
      if (u.plague <= 0) { u.plague = 0; u.plagueFree = 1; continue; }        // over: immune
      const sick = now - u.plagueAt >= SICK_AFTER;
      chance = sick ? SPREAD_SICK : SPREAD_SICK * SPREAD_EARLY_MUL;
      if (sick) {
        u.hp -= PLAGUE_DPS * DT; u.harmCause = CAUSE.Plague;
        if (d.morale && d.morale.canBreak) u.morale = Math.max(0, u.morale - PLAGUE_MORALE * DT);
        if (now - u.coughAt > COUGH_GAP && rnd(world) < COUGH_RATE * DT) cough(world, u);
      }
    }
    spread(world, u, SPREAD_GAP, chance * DT);
  }
}
