// Unit maker core (OURS, Part 2 step 8, STEP8.md). Owner: LEAD.
// A made unit = a RECIPE (plain JSON, kept on the device and later shared as a code) turned into a normal unit def:
// a body (person / animal / beast / giant) × size × hp × speed + one weapon + up to 2 abilities + colour + hat.
// The def's brain runs the weapon and abilities (modules in ./weapons and ./abilities, registry.js). Faction Mine,
// category 'mine', type 'mine_<id>'. Everything else in the game (possess, team battle, zombies, the necro, report
// cards) treats it like any other unit.
//
// API (UI + tests):  cleanRecipe(r) -> recipe · registerMade(recipe) -> def · unregisterMade(type) · madeType(id)
//   recipeOf(type) · isMade(type) · madeTypes() · buildDef(recipe) (not registered) · clearMadeUnits(world, type)
//   + registry.js re-exports (readyWeapons, readyAbilities, getWeapon, getAbility) and catalog.js data.
import { registerUnit, unregisterUnit, getDef } from '../defs.js';
import { F, INT } from '../factions.js';
import { STATE } from '../const.js';
import { buildRisen } from '../units/mythical/risen.js';
import { WEAPONS, ABILITIES, BODY_IDS, SIZES, HP_STEPS, SPEED_STEPS, COLORS, HATS, MINE_MAX } from './catalog.js';
import { WEAPON_MODS, ABILITY_MODS, getWeapon, getAbility, weaponRow, abilityRow, readyWeapons, readyAbilities } from './registry.js';
import { targetOf, fleeing, idle, canAuto, meleeFight, swing, hypot } from './lib.js';
import { release as possessRelease } from '../systems/possess.js';

export * from './catalog.js';
export { getWeapon, getAbility, weaponRow, abilityRow, readyWeapons, readyAbilities, registryVersion } from './registry.js';

// ---------------------------------------------------------------- the module files (each agent owns one; a missing or
// broken file leaves its weapons / abilities out of the maker, it never breaks the game)
const MODS = [
  './weapons/guns.js', './weapons/throw.js', './weapons/melee.js', './weapons/body.js',
  './abilities/move.js', './abilities/act1.js', './abilities/act2.js', './abilities/support.js',
];
export const loadErrors = [];
const loaded = await Promise.allSettled(MODS.map((p) => import(p)));
loaded.forEach((r, i) => { if (r.status === 'rejected') { loadErrors.push(MODS[i] + ': ' + (r.reason && r.reason.message)); console.error('maker: module failed', MODS[i], r.reason); } });

// ---------------------------------------------------------------- bodies (ours; the user tunes them)
const PERSON_FLOCK = { personalSpace: 1.25, separation: 36, alignment: 0.3, cohesion: 0.02, formation: 1, herd: 0, herdSpacing: 0,
  flockByState: [1, 1, 0.3, 1, 0.3, 0.25], formationByState: [1, 1, 0.35, 1, 0, 0] };
const ANIMAL_FLOCK = { personalSpace: 1.2, separation: 30, alignment: 0.2, cohesion: 0.06, formation: 0.5, herd: 0.3, herdSpacing: 16,
  flockByState: [1, 1, 0.3, 1, 0.2, 0.3], formationByState: [0.6, 0.6, 0.2, 0.6, 0, 0] };
const BIG_FLOCK = { personalSpace: 1.1, separation: 26, alignment: 0.1, cohesion: 0, formation: 0.4, herd: 0, herdSpacing: 0,
  flockByState: [1, 1, 0.2, 1, 0.2, 0.2], formationByState: [0.5, 0.5, 0.2, 0.5, 0, 0] };
const PERSON_MORALE = { baseline: 0.82, oddsWeight: 0.5, fearWeight: 0.02, casualtyWeight: 0.05, woundWeight: 0.1, hitShock: 0.01,
  suppression: 0.01, canBreak: true, breakAt: 0.22, rallyAt: 0.55, minFleeTime: 2.5, dropRate: 3, recoverRate: 0.3, panicFear: 0.4, deathFear: 0.6 };
const ANIMAL_MORALE = { ...PERSON_MORALE, baseline: 0.8, oddsWeight: 0.4, breakAt: 0.25, rallyAt: 0.5, minFleeTime: 2 };
const BIG_MORALE = { ...PERSON_MORALE, baseline: 0.95, oddsWeight: 0.15, woundWeight: 0.05, breakAt: 0.1, rallyAt: 0.35, minFleeTime: 1.5 };

// r = OG-raw radius (registerUnit ×1.1), hp = default hp step index, walk / run px/s at speed step "1×" (beast = the
// T-Rex's 42 / 110, giant = OG giant's 46 / 75; person run 150: a panicking rifleman runs ~145, 140 never caught one). shrug = shrugs off stuns, like the OG giant (game.js:17139) and our
// T-Rex: a boar's gores every 0.35 s (stun 0.55) kept big made units stunned for good (W-BODY, 11-17).
export const BODIES = {
  person: { r: 9, mass: 1, hp: 3, walk: 80, run: 150, turn: 8, accel: 900, sight: 320, brush: 23, intel: INT.Trained, flam: 1, density: 1, flock: PERSON_FLOCK, morale: PERSON_MORALE, react: 0.25 },
  animal: { r: 12, mass: 2.5, hp: 4, walk: 90, run: 210, turn: 7, accel: 900, sight: 320, brush: 34, intel: INT.Animal, flam: 0.8, density: 1.1, flock: ANIMAL_FLOCK, morale: ANIMAL_MORALE, react: 0.2 },
  beast: { shrug: true, r: 17, mass: 8, hp: 6, walk: 42, run: 110, turn: 4, accel: 600, sight: 340, brush: 48, intel: INT.Animal, flam: 0.6, density: 1.2, flock: BIG_FLOCK, morale: BIG_MORALE, react: 0.3 },
  giant: { shrug: true, r: 19, mass: 12, hp: 7, walk: 46, run: 75, turn: 3, accel: 500, sight: 360, brush: 57, intel: INT.Trained, flam: 0.8, density: 1.2, flock: BIG_FLOCK, morale: BIG_MORALE, react: 0.35 },
};

// ---------------------------------------------------------------- recipes
export const RECIPE_V = 1;
const clampI = (v, n, dflt) => (Number.isInteger(v) && v >= 0 && v < n ? v : dflt);
const W_IDS = new Set(WEAPONS.map((r) => r.id)), A_IDS = new Set(ABILITIES.map((r) => r.id));
const MOVE = new Set(ABILITIES.filter((r) => r.kind === 'move').map((r) => r.id));
export const isMoveAbility = (id) => MOVE.has(id);
/** Default recipe for slot id n (what the maker opens with). */
export function newRecipe(id) {
  return { v: RECIPE_V, id, name: '', body: 'person', size: 2, hp: BODIES.person.hp, speed: 3, weapon: 'sword', abilities: [], color: 0, hat: 'none' };
}
/**
 * Any object -> a valid recipe (junk in, a working unit out: storage and share codes go through here). size / hp /
 * speed / color are step INDEXES into catalog.js SIZES / HP_STEPS / SPEED_STEPS / COLORS. Abilities: known, unique, at
 * most 2, at most one move ability (a later second one is dropped). An unknown weapon -> 'sword'. name: trimmed, ≤ 16.
 */
export function cleanRecipe(r) {
  r = r && typeof r === 'object' ? r : {};
  const id = Number.isInteger(r.id) && r.id >= 1 && r.id < 1e6 ? r.id : 1;
  const body = BODY_IDS.includes(r.body) ? r.body : 'person';
  const abilities = [];
  for (const a of Array.isArray(r.abilities) ? r.abilities : []) {
    if (abilities.length >= 2 || typeof a !== 'string' || !A_IDS.has(a) || abilities.includes(a)) continue;
    if (MOVE.has(a) && abilities.some((x) => MOVE.has(x))) continue;
    abilities.push(a);
  }
  const name = typeof r.name === 'string' ? r.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) : '';
  return {
    v: RECIPE_V, id, name, body,
    size: clampI(r.size, SIZES.length, 2),
    hp: clampI(r.hp, HP_STEPS.length, BODIES[body].hp),
    speed: clampI(r.speed, SPEED_STEPS.length, 3),
    weapon: typeof r.weapon === 'string' && W_IDS.has(r.weapon) ? r.weapon : 'sword',
    abilities,
    color: clampI(r.color, COLORS.length, 0),
    hat: HATS.includes(r.hat) ? r.hat : 'none',
  };
}
export const madeType = (id) => 'mine_' + id;
export const isMade = (type) => typeof type === 'string' && (type.startsWith('mine_') || type.startsWith('risen_mine_'));
const RECIPES = new Map();   // type -> recipe (registered ones)
export function recipeOf(type) {
  if (typeof type !== 'string') return null;
  return RECIPES.get(type.startsWith('risen_') ? type.slice(6) : type) || null;
}
export function madeTypes() { return [...RECIPES.keys()]; }

// ---------------------------------------------------------------- fallback weapon (catalogue weapon whose module
// isn't built: the unit still fights, with plain fists)
const FISTS = { damage: 8, damageJitter: 2, push: 60, stun: 0.1, cooldown: 0.7, cooldownJitter: 0.1, reach: 4, band: 30, facing: 0.6, circle: 1, backStep: true };
const FALLBACK = {
  id: 'fists?', range: 0, row: { id: 'fists?', hold: 'fist', group: 'melee' },
  fight(w, u, t, dx, dy, d) {
    const W = u.b.wb;
    if (meleeFight(w, u, t, W.fists, dx, dy, d) === 0) { u.goalX = dx / d * u.def.runSpeed; u.goalY = dy / d * u.def.runSpeed; u.face = Math.atan2(dy, dx); }
  },
  init(w, u, bag) { const s = u.def.maker.size; bag.fists = { ...FISTS, damage: FISTS.damage * s, push: FISTS.push * s, reach: FISTS.reach * s, close: u.def.runSpeed }; }, // close at a run: gunmen back away from melee
  possessFire(w, u) { swing(w, u, 0.7); },
};

// ---------------------------------------------------------------- the brain
// Order every brain tick (brain.js already skipped: holding, airborne non-fliers, reaction delay):
// 1 busy abilities, 2 busy weapon (mid-move: they drive the unit), 3 stunned: stand, 4 fleeing (morale), 5 no target:
// ability idle, weapon idle, else follow the group, 6 abilities' act (only with canAuto: possessed = attack held),
// 7 the weapon's fight, 8 abilities' after.
function brain(w, u) {
  const M = u.def.maker, b = u.b, A = M.abs, AB = b.ab, W = M.weapon, wb = b.wb;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (M.shrug) u.stun = 0;   // beast + giant bodies shrug off stuns (BODIES)
  for (let i = 0; i < A.length; i++) { const a = A[i]; if (a.busy !== undefined && a.busy(w, u, AB[i]) === true) return; }
  if (W.busy !== undefined && W.busy(w, u, wb) === true) return;
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) {
    for (let i = 0; i < A.length; i++) { const a = A[i]; if (a.idle !== undefined && a.idle(w, u, AB[i]) === true) return; }
    if (W.idle !== undefined && W.idle(w, u, wb) === true) return;
    idle(w, u);
    return;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (canAuto(w, u)) for (let i = 0; i < A.length; i++) { const a = A[i]; if (a.act !== undefined && a.act(w, u, t, dx, dy, d, AB[i]) === true) return; }
  W.fight(w, u, t, dx, dy, d, wb);
  for (let i = 0; i < A.length; i++) { const a = A[i]; if (a.after !== undefined) a.after(w, u, AB[i]); }
}

// def patch: object, or a function of the def so far
function patchOf(spec, d) { const p = spec && spec.def; return typeof p === 'function' ? p(d) : p; }
function merge(d, p) {
  if (!p) return;
  for (const k in p) {
    const v = p[k];
    if (k === 'look' || k === 'flock' || k === 'morale') d[k] = { ...(d[k] || {}), ...v };
    else d[k] = v;
  }
}

/** recipe -> an unregistered def (registerUnit applies ×1.1 to radius / brushSpacing). */
export function buildDef(recipe) {
  const r = cleanRecipe(recipe), B = BODIES[r.body], s = SIZES[r.size], sp = SPEED_STEPS[r.speed];
  const W = getWeapon(r.weapon) || FALLBACK;
  const abs = r.abilities.map(getAbility).filter(Boolean);
  const type = madeType(r.id);
  const maker = { recipe: r, body: r.body, shrug: !!B.shrug, size: s, speed: sp, weapon: W, abs, color: COLORS[r.color], hat: r.hat };
  const sight = Math.max(B.sight, (W.range || 0) + 60);
  const d = {
    type, og: r.name || type, category: 'mine', faction: F.Side, side: type, made: true, maker,   // each made unit is its own side (side split 11-17; was F.Mine, all made units one side)
    radius: B.r * s, radiusJitter: 0.04, mass: B.mass * s * s, maxHp: HP_STEPS[r.hp], density: B.density,
    strength: Math.max(0.5, Math.round(Math.sqrt(HP_STEPS[r.hp] / 100) * 10) / 10),
    locomotion: 0, walkSpeed: B.walk * sp, runSpeed: B.run * sp, maxSpeed: Math.max(300, B.run * sp * 1.6),
    accel: B.accel, decel: B.accel, turnRate: B.turn, turnSpeedFalloff: Infinity,
    sightRange: sight, alertSightRange: sight + 60, stickyTarget: false, reactionTime: B.react, huntRange: Infinity, minDistance: 0,
    drilled: false, intelligence: B.intel, infectable: true, flammability: B.flam, melee: !(W.range > 0),
    brushSpacing: B.brush * s, flock: { ...B.flock }, morale: { ...B.morale },
    look: { attack: { time: 0.3 }, hat: r.hat !== 'none' },   // hat: blows and pecks can knock it off (damage.js hatKnock)
    risenMode: 'keep',   // a zombie copy keeps the weapon and abilities (risen.js 'keep')
  };
  merge(d, patchOf(W, d));
  for (const a of abs) merge(d, patchOf(a, d));
  d.brain = brain;
  d.init = function init(w, u) {
    const b = u.b; b.act = 0; b.actT = 0; b.victim = -1; b.wb = {}; b.ab = abs.map(() => ({}));
    if (W.init) W.init(w, u, b.wb);
    for (let i = 0; i < abs.length; i++) if (abs[i].init) abs[i].init(w, u, b.ab[i]);
  };
  // every-tick / per-hit hooks: flat lists of [hook, bag slot] (slot -1 = the weapon's bag), no allocation per call
  const hooks = (name) => { const L = []; if (W[name]) L.push([W[name], -1]); abs.forEach((a, i) => { if (a[name]) L.push([a[name], i]); }); return L; };
  const bag = (u, slot) => (slot < 0 ? u.b.wb : u.b.ab[slot]);
  const TK = hooks('tick'), DM = hooks('damageMul'), OH = hooks('onHit'), OD = hooks('onDeath'), HN = hooks('holdsNerve');
  if (TK.length) d.carry = function carry(w, u) { if (w.holding) return; for (let i = 0; i < TK.length; i++) TK[i][0](w, u, bag(u, TK[i][1])); };
  if (DM.length) d.damageMul = function damageMul(w, u, amount, att, kind) { let m = 1; for (let i = 0; i < DM.length; i++) m *= DM[i][0](w, u, amount, att, kind, bag(u, DM[i][1])); return m; };
  if (OH.length) d.onHit = function onHit(w, u, amount, src, kind) { for (let i = 0; i < OH.length; i++) OH[i][0](w, u, amount, src, kind, bag(u, OH[i][1])); };
  if (OD.length) d.onDeath = function onDeath(w, u, cause, killer) { for (let i = 0; i < OD.length; i++) OD[i][0](w, u, cause, killer, bag(u, OD[i][1])); };
  if (HN.length) d.holdsNerve = function holdsNerve(w, u) { for (let i = 0; i < HN.length; i++) if (HN[i][0](w, u, bag(u, HN[i][1])) === true) return true; return false; };
  if (W.possessFire) d.possessFire = function possessFire(w, u, aim, ax, ay) { W.possessFire(w, u, aim, ax, ay, u.b.wb); };
  // STEP8 A-ACT1: every ability's possessMove, the move ability's first (it moves the unit every tick), then the others
  // (an act trick only steers mid-move: a slide, a pin, standing to roar): one ability's possessMove never hides the other's.
  const PM = hooks('possessMove').filter((h) => h[1] >= 0).sort((a, b) => (abs[a[1]].kind === 'move' ? 0 : 1) - (abs[b[1]].kind === 'move' ? 0 : 1));
  if (PM.length) d.possessMove = function possessMove(w, u, mx, my, firing) { for (let i = 0; i < PM.length; i++) PM[i][0](w, u, mx, my, firing, u.b.ab[PM[i][1]]); };
  return d;
}

/** Register (or replace) a made unit + its zombie copy. Returns the registered def. */
export function registerMade(recipe) {
  const r = cleanRecipe(recipe), type = madeType(r.id);
  unregisterMade(type);
  const def = registerUnit(buildDef(r));
  RECIPES.set(type, r);
  buildRisen(type, 'keep');
  return def;
}
export function unregisterMade(type) {
  RECIPES.delete(type);
  unregisterUnit('risen_' + type);
  return unregisterUnit(type);
}
/** Take every live unit of a made type (and its zombie copies) off the field, no deaths (an edited / deleted unit). */
export function clearMadeUnits(world, type) {
  let n = 0;
  for (const u of world.units) if (!u.dead && (u.type === type || u.type === 'risen_' + type)) { if (u.possessed === 1) possessRelease(world, 'leave'); world.remove(u); n++; }
  return n;
}
export { MINE_MAX, STATE, getDef };
