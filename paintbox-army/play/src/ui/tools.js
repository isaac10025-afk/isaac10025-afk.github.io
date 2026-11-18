// Tool list, tab order and fallback body numbers. Owner: UI.
// Tab order = OG categories (game.js:7745-7751). Bosses is hidden and empty in OG, so it is left out.
// Terrain tab: Wall, Water, Ice, Mines, Banana Peel, then props in OG type order Barrel(17), Tree(31) (game.js:7766-7775).
import { getDef as realGetDef } from '../sim/defs.js';

// Part 2 step 4 (OURS): Dinosaurs, Siege, Pirates go between Mythical and Terrain.
// Part 2 step 6 (OURS): Robots, Space, Ocean, Sports, Bugs, Bosses after Pirates (OG's hidden Bosses tab is now real).
// Part 2 step 7 (OURS, STEP7.md): Secret (the 8 map secrets, locked until found) before Terrain.
// Part 2 step 8 (OURS, STEP8.md): Mine (the units the player made in the unit maker) after Secret, before Terrain.
export const CATEGORIES = ['army', 'animals', 'mythical', 'dinos', 'siege', 'pirates', 'robots', 'space', 'ocean', 'sports', 'bugs', 'bosses', 'secret', 'mine', 'terrain'];

const ORDER = {
  army: ['rifle', 'flamer', 'sniper', 'legion', 'grenadier', 'archer', 'cavalry', 'ninja'],
  animals: ['boar', 'rat', 'ant', 'ape', 'gator', 'piranha', 'snake', 'cheetah'],
  mythical: ['zombie', 'slime', 'mage', 'giant', 'dragon', 'necro'],
  // OURS (PLAN Part 2 step 4)
  dinos: ['raptor', 'spitter', 'trike', 'stego', 'ankylo', 'ptero', 'trex', 'longneck'],
  siege: ['shieldwall', 'halberd', 'crossbow', 'ram', 'catapult', 'ballista', 'oilpot', 'siegetower'],
  pirates: ['deckhand', 'pistol', 'blunderbuss', 'bomber', 'anchor', 'cannon', 'captain', 'ship'],
  // OURS (PLAN Part 2 step 6, STEP6.md)
  robots: ['drone', 'laserbot', 'sawbot', 'magnetbot', 'repairbot', 'shieldbot', 'bombbot', 'mech'],
  space: ['alien', 'jetpack', 'shrinkray', 'gravity', 'teleporter', 'mindalien', 'ufo', 'astronaut'],
  ocean: ['crab', 'shark', 'octopus', 'puffer', 'eel', 'turtle', 'walrus', 'swordfish'],
  sports: ['tackler', 'batter', 'pitcher', 'bowler', 'hockey', 'sumo', 'boxer', 'cheerleader'],
  bugs: ['bee', 'beehive', 'spider', 'beetle', 'mantis', 'bombardier', 'mosquito', 'stinkbug'],
  bosses: ['kraken', 'gmech', 'hydra', 'lavagolem', 'worm', 'kingslime'],
  // OURS (PLAN Part 2 step 7, STEP7.md): map order (castle, beach, lake, canyon, village, volcano, swamp, playground)
  secret: ['ghost', 'seagull', 'yeti', 'cowboy', 'scarecrow', 'phoenix', 'bogmonster', 'baby'],
};
// Spawned-only types of the new tabs (crews...): their tab agents add them here (count chip order).
const SPAWNED_NEW = [
  'gunner', // STEP4 PIRATES: cannon crew
  'siegecrew', // STEP4 SIEGE: machine crew (ram, catapult, ballista)
  'bigslime', 'slimelet', // STEP6 BOSSES: the king slime's split
  'crow', // STEP7 SECRET: the scarecrow's crows
];
const TERRAIN_KINDS = ['wall', 'water', 'ice', 'mine', 'peel', 'lava', 'mud', 'bridge', 'tramp']; // STEP7: lava, mud, bridge, trampoline
const PROPS = ['barrel', 'tree'];

export const TOOLS = [
  ...ORDER.army.map(type => ({ category: 'army', kind: 'unit', type, key: type })),
  ...ORDER.animals.map(type => ({ category: 'animals', kind: 'unit', type, key: type })),
  ...ORDER.mythical.map(type => ({ category: 'mythical', kind: 'unit', type, key: type })),
  ...ORDER.dinos.map(type => ({ category: 'dinos', kind: 'unit', type, key: type })),
  ...ORDER.siege.map(type => ({ category: 'siege', kind: 'unit', type, key: type })),
  ...ORDER.pirates.map(type => ({ category: 'pirates', kind: 'unit', type, key: type })),
  ...['robots', 'space', 'ocean', 'sports', 'bugs', 'bosses', 'secret'].flatMap(cat => ORDER[cat].map(type => ({ category: cat, kind: 'unit', type, key: type }))),
  ...TERRAIN_KINDS.map(kind => ({ category: 'terrain', kind, key: kind })),
  ...PROPS.map(type => ({ category: 'terrain', kind: 'unit', type, key: type })),
];
// STEP8 UI: the Mine tab's tools are the made units, which come and go at run time. They always sit at the END of TOOLS
// (after Terrain), so every other tool keeps its index; setMineTools swaps them for the store's current list
// ('mine_<id>' types in store order). The toolbar calls it (refreshMine) and rebuilds its Mine cards.
let MINE_TYPES = [];
export function setMineTools(types) {
  while (TOOLS.length && TOOLS[TOOLS.length - 1].category === 'mine') TOOLS.pop();
  MINE_TYPES = (types || []).filter((t) => typeof t === 'string');
  for (const type of MINE_TYPES) TOOLS.push({ category: 'mine', kind: 'unit', type, key: type });
}
export function toolSpec(t) { return t.kind === 'unit' ? { kind: 'unit', type: t.type } : { kind: t.kind }; }

// Every countable type in a fixed order (count chip tie-break = type index, OG page-ui.js:822-857).
export const TYPE_ORDER = [...ORDER.army, ...ORDER.animals, ...ORDER.mythical, ...PROPS,
  'knight', 'horse', 'apecav', 'soldierant', 'anthill', 'frog', 'skeleton',
  ...ORDER.dinos, ...ORDER.siege, ...ORDER.pirates, ...ORDER.robots, ...ORDER.space, ...ORDER.ocean, ...ORDER.sports, ...ORDER.bugs,
  ...ORDER.bosses, ...SPAWNED_NEW, ...ORDER.secret];
export function typeIndex(type) {
  const i = TYPE_ORDER.indexOf(type);
  if (i >= 0) return i;
  if (type && type.startsWith('risen_')) return 100 + typeIndex(type.slice(6));
  if (type && type.startsWith('mine_')) { const k = MINE_TYPES.indexOf(type); return 900 + (k >= 0 ? k : 50); } // STEP8 UI: made units after every tab's units, in Mine tab order
  return 1000;
}

// Faction ids (OG game.js:8370-8398).
export const FAC = { PROPS: 9, STRAYS: 11, TEAM_LEFT: 20, TEAM_RIGHT: 21 };

// Fallback body numbers, used only until CORE-A's registry holds the def (and by the mock game).
// [radius px, brushSpacing px] already x1.1 (core-move.md §12b), faction (core-move.md §7).
const FALLBACK = {
  rifle: [9.493, 23.232, 0], flamer: [9.493, 23.232, 3], sniper: [9.493, 23.232, 4], legion: [9.493, 20.878, 5],
  grenadier: [9.493, 23.232, 6], archer: [9.493, 23.232, 7], cavalry: [14.85, 37.4, 10], ninja: [9.02, 23.1, 25],
  boar: [14.784, 42.24, 1], rat: [5.06, 12.1, 14], ant: [5.72, 15.4, 15], ape: [14.85, 30.8, 16],
  gator: [16.5, 55, 17], piranha: [4.62, 9.9, 18], snake: [6.05, 41.8, 23], cheetah: [13.97, 42.46, 26],
  zombie: [9.493, 23.232, 2], slime: [14.3, 35.2, 8], mage: [9.493, 24.2, 12], giant: [20.9, 57.2, 13],
  dragon: [20.9, 93.5, 19], necro: [9.493, 24.2, 24], barrel: [9.9, 20.9, 9], tree: [6.05, 33, 9],
  knight: [9.493, 23.1, 10], horse: [14.85, 37.4, 11], apecav: [14.85, 37.4, 16], soldierant: [8.14, 15.4, 15],
  anthill: [7.7, 44, 15], frog: [8.25, 15.4, 9], skeleton: [9.493, 23.232, 24],
};
const fbCache = new Map();
export function fallbackDef(type) {
  if (fbCache.has(type)) return fbCache.get(type);
  const base = type && type.startsWith('risen_') ? type.slice(6) : type;
  const f = FALLBACK[base];
  const d = f ? { type, radius: f[0], brushSpacing: f[1], faction: type.startsWith('risen_') ? 2 : f[2], prop: base === 'barrel' || base === 'tree' } : null;
  fbCache.set(type, d);
  return d;
}
// The real def when CORE-A has it, else the fallback.
export function bodyDef(type) { return realGetDef(type) || fallbackDef(type); }
// Team-able = not Props and not Strays (OG game.js:5581, 11549-11552).
export function teamable(type) { const d = bodyDef(type); return !!d && !(d.prop && d.faction === FAC.PROPS) && d.faction !== FAC.PROPS && d.faction !== FAC.STRAYS; } // STEP6 (lead): a prop of a fighting faction (beehive) joins teams, as the sim does
