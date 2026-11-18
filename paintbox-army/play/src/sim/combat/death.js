// Death and corpses (OG lifecycle game.js:5338-5397, corpse ring game.js:12476-12585). CORE-A's lifecycle calls
// onDeath(world, u, cause, killer) for each unit at hp <= 0 (or turning), then frees the unit.
import { CAUSE, initCombat, splatFear, emit, hooks, stat, GRAVITY } from './env.js';
import { killerOf, isSick } from './damage.js';
import { getDef } from '../defs.js';
import * as ANIMALS from '../units/animals/lib.js';

export const CORPSE_CAP = 2048;          // OG game.js:12476 (ring buffer, oldest overwritten)
export const MEAT_PER_SIZE2 = 0.3;       // OG game.js:12530: meat = 0.3·size²
export const FALL_HIT_WINDOW = 0.5;      // OG game.js:5371: fall along the last hit if < 0.5 s ago
// Corpse display (renderer): no blood; bodies fade out by 1.1 s (OG game.js:22051-22059, 21728-21738).
export const CORPSE_TOPPLE = 0.24, CORPSE_TOPPLE_GIANT = 0.384, CORPSE_FADE_START = 0.75, CORPSE_FADE_END = 1.1;
export const GHOST_START = 0.35, GHOST_END = 1.55, CORPSE_FLAME_END = 1.1;
export const DEATH_FEAR_R = 90;          // OG game.js:5350

// Corpse visibility (OG renderer game.js:21724-21735): drawn while not raised, not eaten, on the ground (z < 4), not a
// snake body, and younger than 1.1 s, or "held": claimed by ants (colony > 0), kept (necromancer / ants let it lie) or
// scavenged (rats). A held corpse keeps its 0.75 s look and never fades. An overwritten ring slot is gone (removed).
export function corpseHeld(c) { return (c.colony > 0) || (c.claimed >= 0) || c.kept === 1 || c.scavenged === 1; }
export function corpseVisible(c, now) {
  const age = now - c.t;
  return age >= 0 && !c.removed && c.raised !== 1 && c.eaten !== 1 && ((c.z || 0) < 4 || c.fly === 1) && c.shape !== 'snake' && (age < CORPSE_FADE_END || corpseHeld(c));
}
/** Age the renderer should draw (held corpses stop at 0.75 s, OG game.js:21734). */
export function corpseLookAge(c, now) { const age = now - c.t; return corpseHeld(c) ? Math.min(age, CORPSE_FADE_START) : age; }
/** Alpha (OG game.js:22057-22058): (1 − max(0, (age − 0.75)/0.35))·(0.3 + 0.7·meat left); 0 when not visible. */
export function corpseAlpha(c, now) {
  if (!corpseVisible(c, now)) return 0;
  const age = corpseLookAge(c, now), full = MEAT_PER_SIZE2 * c.r * c.r, left = full > 0 ? Math.min(1, c.meat / full) : 1;
  return Math.max(0, 1 - Math.max(0, (age - CORPSE_FADE_START) / (CORPSE_FADE_END - CORPSE_FADE_START))) * (0.3 + 0.7 * left);
}

function pushCorpse(world, c) {
  if (!world.corpses) world.corpses = [];
  if (world.corpses.length < CORPSE_CAP) { world.corpses.push(c); return c; }
  const h = (world.corpseHead | 0) % CORPSE_CAP, old = world.corpses[h];  // ring: oldest slot overwritten (OG game.js:12537-12557)
  if (old) {
    old.removed = 1;
    const cl = world.carrion; if (cl) { const i = cl.indexOf(old); if (i >= 0) cl.splice(i, 1); }
  }
  world.corpses[h] = c; world.corpseHead = h + 1;
  return c;
}
function blank(world, x, y, z, r, type, shape) {               // every flag starts at 0 (OG game.js:12553)
  return { x, y, z: z || 0, r, type, shape, team: -1, faction: -1, side: 1, hatless: 0, undead: 0, arrows: null, fallDx: -1, fallDy: 0,
    t: world.time, meat: MEAT_PER_SIZE2 * r * r, burning: 0, sick: 0, kindled: 0, blind: 0, treeClub: 0, charredTree: 0, unseated: 0,
    colony: 0, claimed: -1, eaten: 0, raised: 0, scavenged: 0, kept: 0, removed: 0, curseType: null, uid: -1, id: world.corpseSeq = (world.corpseSeq || 0) + 1 };
}
function unitCorpse(world, u) {                                // OG lifecycle game.js:5367-5392
  const side = Math.cos(u.heading) >= 0 ? 1 : -1;
  const recent = world.time - u.hitAt < FALL_HIT_WINDOW && u.hitDx !== 0;
  const look = u.def.look || {};
  const c = blank(world, u.x, u.y, u.z, u.radius, u.type, u.def.bodyShape || look.shape || u.type);
  c.team = u.team; c.faction = u.faction; c.side = side; c.uid = u.id;   // OURS (step 4): the unit it came from (siege ballista picks its own kills)
  c.hatless = (u.hatless || u.singed) ? 1 : 0; c.undead = look.undead ? 1 : 0;
  c.arrows = u.arrows ? u.arrows.slice(0, u.arrowsIn | 0) : null;
  c.curseType = u.curseType ?? null;                           // a cursed frog's old type: corpse tint (OG game.js:22087), kept by a raise
  c.fallDx = recent ? u.hitDx : -side; c.fallDy = recent ? u.hitDy : 0;
  c.burning = u.burning > 0 ? 1 : 0; c.sick = isSick(u, world.time) ? 1 : 0; c.kindled = u.kindled ? 1 : 0; c.blind = u.blind ? 1 : 0;
  c.treeClub = u.type === 'giant' && (u.role | 0) >= 1 ? 1 : 0; c.charredTree = u.type === 'giant' && (u.role | 0) === 2 ? 1 : 0;
  fling(world, c, u, recent);
  return c;
}

// ---------------------------------------------------------------- flying bodies (OURS, not OG: Part 2 step 1 "floppy bodies")
// OG bodies drop where the unit stood (and one killed in the air stays up there, unseen). Ours fly: a body keeps the speed
// it died with (a tossed unit keeps flying), a killing blow knocks it along the blow, a blast launches it. Light bodies go
// further (mass 8+ barely moves, like toss's TOSS_HEAVY). Then it bounces, slides to a stop against friction, and stops
// at walls. Numbers are ours (no source); the user tunes them.
export const FLING = {
  blow: 30, blowPow: 170, blowUp: 140,       // px/s along the killing blow: 30 + 170·pow²; hop 140·pow when pow > 0.5
  blast: 120, blastPow: 200, blastUp: 180, blastUpPow: 200,   // a blast: 120 + 200·pow out, 180 + 200·pow up
  heavy: 8, heavyMul: 0.2,                   // mass >= 8: 0.2x
  bounce: 0.28, bounceMin: 90,               // keeps 0.28 of its fall speed as a bounce when it lands faster than 90 px/s
  landKeep: 0.55, friction: 7, stop: 6,      // keeps 0.55 of its ground speed on landing; slides with friction 7/s; stops under 6 px/s
};
function fling(world, c, u, recent) {
  let vx = 0, vy = 0, vz = 0;
  if ((u.z || 0) > 0.5) { vx = u.vx || 0; vy = u.vy || 0; vz = u.vz || 0; }   // died in the air: keep flying
  else if (recent) {
    const pw = Math.max(0, Math.min(1, u.hitPow || 0)), blast = u.harmCause === CAUSE.Blast;
    const h = blast ? FLING.blast + FLING.blastPow * pw : FLING.blow + FLING.blowPow * pw * pw;
    vx = (u.hitDx || 0) * h; vy = (u.hitDy || 0) * h;
    vz = blast ? FLING.blastUp + FLING.blastUpPow * pw : pw > 0.5 ? FLING.blowUp * pw : 0;
  } else return;
  if ((u.mass || 1) >= FLING.heavy || u.def.prop) { vx *= FLING.heavyMul; vy *= FLING.heavyMul; vz *= FLING.heavyMul; }
  if (vx * vx + vy * vy + vz * vz < FLING.stop * FLING.stop && !((c.z || 0) > 0.5)) return;
  c.vx = vx; c.vy = vy; c.vz = vz; c.fly = 1; c.landT = -1;
  (world.flyingBodies || (world.flyingBodies = [])).push(c);
}
/** Tick system (after lifecycle): move flying bodies. Ants or a necromancer taking one stops it. */
export function run(world) {
  const L = world.flyingBodies;
  if (!L || !L.length) return;
  const dt = 1 / 60, W = world.W || 1e9, H = world.H || 1e9;
  for (let i = L.length - 1; i >= 0; i--) {
    const c = L[i];
    if (c.removed || c.raised === 1 || c.eaten === 1 || c.colony > 0 || c.claimed >= 0) { c.fly = 0; L.splice(i, 1); continue; }
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
    const wall = world.wallAt ? world.wallAt.bind(world) : null;
    if (wall && (c.z || 0) < 30 && wall(nx, ny)) {   // into a wall: knocked back a little, slides down it
      if (!wall(nx, c.y)) { c.x = nx; c.vy *= -0.3; } else if (!wall(c.x, ny)) { c.y = ny; c.vx *= -0.3; } else { c.vx *= -0.3; c.vy *= -0.3; }
    } else { c.x = nx; c.y = ny; }
    if (c.x < 0) { c.x = 0; c.vx = Math.abs(c.vx) * 0.3; } else if (c.x > W) { c.x = W; c.vx = -Math.abs(c.vx) * 0.3; }
    if (c.y < 0) { c.y = 0; c.vy = Math.abs(c.vy) * 0.3; } else if (c.y > H) { c.y = H; c.vy = -Math.abs(c.vy) * 0.3; }
    if ((c.z || 0) > 0 || c.vz > 0) {
      c.vz -= GRAVITY * dt; c.z = (c.z || 0) + c.vz * dt;
      if (c.z <= 0) {
        const fall = -c.vz;
        c.z = 0; c.vz = fall > FLING.bounceMin ? fall * FLING.bounce : 0;
        c.vx *= FLING.landKeep; c.vy *= FLING.landKeep; c.landT = world.time;
        emit(world, 'land', { x: c.x, y: c.y, v: Math.min(2, fall / 300) * (c.r || 8), type: c.type, body: 1 });
      }
    } else {
      const f = Math.max(0, 1 - FLING.friction * dt); c.vx *= f; c.vy *= f;
      if (c.vx * c.vx + c.vy * c.vy < FLING.stop * FLING.stop) { c.vx = c.vy = 0; c.fly = 0; if (c.landT < 0) c.landT = world.time; L.splice(i, 1); }
    }
  }
}
/**
 * addCorpse(world, unitOrSpec) → corpse record in world.corpses (ring of 2048, OG game.js:12476-12585).
 * - a unit: the normal death corpse.
 * - a spec {type, x, y, z?, r?, facing?, hatless?, undead?, burning?, sick?, fall?, unseated?, from?}: extra bodies such as
 *   Ape Cavalry's unseated rider (OG game.js:12785-12806: radius of the rider's def, no arrows). Not marked scavenged:
 *   OG marks only the lifecycle corpse (game.js:5393).
 */
export function addCorpse(world, src) {
  if (src && src.def && src.id !== undefined) return pushCorpse(world, unitCorpse(world, src));
  const d = getDef(src.type), r = src.r !== undefined ? src.r : d ? d.radius : (src.from ? src.from.radius : 5);
  const look = (d && d.look) || {};
  const c = blank(world, src.x, src.y, src.z, r, src.type, (d && d.bodyShape) || look.shape || src.type);
  const side = src.facing !== undefined ? src.facing : 1;
  c.side = side; c.fallDx = src.fall !== undefined ? src.fall : -side;
  c.hatless = src.hatless ? 1 : 0; c.undead = src.undead ? 1 : 0; c.burning = src.burning ? 1 : 0; c.sick = src.sick ? 1 : 0;
  c.unseated = src.unseated ? 1 : 0;
  if (src.from) { c.team = src.from.team; c.faction = src.from.faction; }
  return pushCorpse(world, c);
}

/**
 * onDeath(world, u, cause, killer) → 'turned' | 'eaten' | 'dust' | 'prop' | 'corpse'.
 * Called by CORE-A lifecycle AFTER it splatted morale.deathFear (r 90, own faction), counted the kill and recorded the
 * kill list (OG game.js:5350-5352). Here: def.onDeath, death sound, then the outcome (OG game.js:5353-5394).
 * cause: CAUSE number (or 'turned'); CAUSE.Turned hands the unit to MYTHICAL's turn hook. killer: unit id / unit / −1.
 */
export function onDeath(world, u, cause, killer) {
  initCombat(u);
  const turned = cause === CAUSE.Turned || cause === 'turned';
  const k = killer != null && killer !== -1 ? (typeof killer === 'object' ? killer : world.unitById(killer)) : null;
  if (u.def.onDeath) u.def.onDeath(world, u, cause, k);
  const eaten = u.eaten === 1;
  if (!turned && !eaten && u.skeleton !== 1) emit(world, u.type === 'tree' ? 'treefall' : 'death', { x: u.x, y: u.y, v: u.radius, r: u.radius, type: u.type, team: u.team });
  if (turned) { if (hooks.turn) hooks.turn(world, u); stat(world, 'turned'); return 'turned'; }
  if (eaten) return 'eaten';
  if (u.skeleton === 1) { emit(world, 'dust', { x: u.x, y: u.y, size: u.radius / 8.63 }); return 'dust'; }
  if (u.def.prop) return 'prop';
  const c = addCorpse(world, u);
  if (typeof ANIMALS.markScavenged === 'function') ANIMALS.markScavenged(world, c); // rats within 120 px → carrion (OG game.js:5393, 11472-11481)
  return 'corpse';
}

/** Full OG death step for worlds without CORE-A's lifecycle (tests, tools): fear splat + kill credit + onDeath. */
export function processDeath(world, u, turned = false) {
  initCombat(u);
  const m = u.def.morale;
  if (m) splatFear(world, u.faction, u.x, u.y, m.deathFear, DEATH_FEAR_R);    // OG game.js:5350 (own faction)
  const kc = killerOf(world, u, turned);
  if (kc.killer >= 0) { const k = world.unitById(kc.killer); if (k) k.kills = (k.kills || 0) + 1; }
  u.deathCause = kc.cause;
  return onDeath(world, u, kc.cause, kc.killer);
}
export { CAUSE };
