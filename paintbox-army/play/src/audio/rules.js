// AUDIO rules, 1:1 with Battle Draw's sound table and event mapping (module 2207, game.js:5841-6219,
// event names module 423, game.js:9261-9304). Our own code and our own sounds (synth.js); only the
// rules and numbers are theirs. Every number cites `OG game.js:<line>`.
import { WEAPONS as MAKER_WEAPONS, SIZES as MAKER_SIZES } from '../sim/maker/catalog.js'; // step 8: pure data, no sim
//
// Event shape (world.emit): { name, x, y, size = 1, who = our unit type id or null }
//   OG ring fields kind/x/y/size/who (game.js:9306-9323), size defaults to 1, who to -1 (= null here).
//   Names are matched case-insensitively with punctuation dropped: 'BulletHit' = 'bulletHit' = 'bullet-hit'.
//
// What each emitter sends (OG emit site -> size, who). SIZE_REF below: blast 60, body 9, steam 26.
//   Shot        gun fires (9178)                       size 1, who = shooter
//   BulletHit   bullet damages a unit (5196)           size min(1.5, dmg/30), who = target
//   Ricochet    off a wall (5207) / shield, prop, edge (5183, 2949)   wall: size 0.6, no who; else size 1, who = target
//   ArrowHit    arrow hits / lands (3165-3192), shuriken hit (5196)   size 1 (ground 0.5, shuriken 0.5), who = target or none
//   Bow, BowDraw  archer looses / draws (17900, 17916) size 1, who = archer
//   Throw       grenade, shuriken, ape, giant (4155, 18468, 14329, 17150)   size 1 / 0.6 / 1.5 / 2, who = thrower
//   Explosion   any blast (8897)                       size = radius / 60, no who
//   Flame       flamer shot, dragon breath (3990, 1360, 1530)   who = firer (Flamer plays nothing here: its roar loop does it)
//   Ignite      unit catches fire, first time (8859)   size = radius / 9, who = unit
//   Lightning, Spell, Curse, WaterShock, Raise, Teleport   mage / necro casts (15599, 15594, 15639, 15732, 15013, 15073)
//   Strike      a melee hit lands (21 sites)           size 1 (snake/slime/frog: their own), who = ATTACKER
//   Block       shield blocks (8999)                   size = 1 - pass, who = blocker
//   Trample     trample, tail, smash (275, 1406, 1437, 14070, 14182, 17197)   size as OG, who = attacker
//   Death       non-prop death, not turned/eaten/skeleton (5359)   size = radius / 9, who = dead unit (Tree: TreeFall instead)
//   Hurt        dmg >= 8 and still alive (8814)        size = dmg / maxHp, who = victim
//   Charge      group charge within 90 px, gator, cheetah (4618, 1792, 18687)   size = GROUP SIZE for a group, who = a member
//   Splash, Flop, Land   (58, 758, 3192, 5329, 8900, 9093)   size as OG, who = unit or none
//   Steam, IceCrack (size 1 | 2), IceBreak (min(3, tiles/4)), MineArm, Slip, Bounce (min(1, v/200)), HatOff,
//   Hop, Split, Tongue, Cough, ChestBeat, TreeFall, TreeUproot, Roar, Flap, Descend: as OG, who = the unit

// ---------------------------------------------------------------- sound table
// OG game.js:5833-5838: v(volume, max, priority, jitter = 0.08)
//   volume: base gain; max: starts allowed per 0.1 s (scaled by 2 - busy); priority: who wins a voice
//   steal (higher stays); jitter: playback-rate randomness, +-jitter.
const v = (volume, max, priority, jitter = 0.08, extra) => ({ volume, max, priority, jitter, ...extra });
// OG game.js:5839-5947
export const SOUNDS = {
  'shot-rifle': v(0.2645, 2, 4),
  'shot-sniper': v(0.35, 1, 6, 0.05),
  'bullet-hit': v(0.3, 2, 4),
  ricochet: v(0.12, 1, 1, 0.15),
  'hit-solid': v(0.15, 2, 2, 0.12),
  bow: v(0.2, 2, 3),
  'bow-draw': v(0.084, 2, 2, 0.06),
  'arrow-hit': v(0.16, 2, 2, 0.12),
  throw: v(0.22, 1, 3),
  'shuriken-throw': v(0.2, 2, 3),
  'grenade-pin': v(0.2, 1, 3, 0.06),
  raise: v(0.25, 1, 7, 0.04),
  teleport: v(0.3, 2, 6, 0.08),
  'mine-beep': v(0.22, 3, 6, 0.03),
  slip: v(0.25, 2, 5, 0.1),
  'mine-ping': v(0.05, 1, 0, 0),
  'flame-start': v(0.2, 99, 5, 0, { held: true }),
  'flame-loop': v(0.21, 99, 5, 0, { loop: true, held: true }),
  'grenade-bounce': v(0.1215, 2, 2, 0.1),
  steam: v(0.15, 2, 2, 0.12, { perSecond: 3 }),
  'slime-hop': v(0.15, 2, 1, 0.12, { perSecond: 9 }),
  'slime-split': v(0.2, 2, 4, 0.1, { perSecond: 6 }),
  'frog-tongue': v(0.22, 2, 4, 0.1),
  'slime-hit': v(0.14, 2, 3, 0.12),
  'boar-hit': v(0.2, 2, 3, 0.08),
  'cheetah-hit': v(0.2, 2, 3, 0.08),
  'giant-hit': v(0.25, 1, 5, 0.06, { perSecond: 1 }),
  'hat-off': v(0.22, 2, 4, 0.15),
  explosion: v(0.484, 2, 10, 0.1),
  flame: v(0.22, 1, 3),
  ignite: v(0.14, 1, 4),
  scream: v(0.12, 1, 6, 0.08),
  lightning: v(0.3, 1, 8),
  'lightning-water': v(0.2, 12, 7, 0.15, { from: 'lightning', burst: true }),
  thunder: v(0.4, 1, 7, 0.1),
  spell: v(0.3, 1, 5),
  curse: v(0.4, 1, 7),
  blade: v(0.22, 2, 3, 0.1),
  spear: v(0.187, 2, 3, 0.08),
  'zombie-bite': v(0.17, 2, 3, 0.08),
  'roman-charge': v(0.3, 1, 8, 0.04, { always: true }),
  'roman-charge-crowd': v(0.26, 1, 8, 0.04, { always: true }),
  grunt: v(0.055, 1, 3, 0.08),
  cough: v(0.15, 2, 2, 0.1, { perSecond: 4 }),
  footstep: v(0.0714, 99, 0, 0.12),
  wade: v(0.11, 99, 0, 0.12),
  'rat-step': v(0.075, 99, 0, 0.1),
  'heavy-step': v(0.16, 99, 0, 0.1),
  gallop: v(0.14, 99, 0, 0.06),
  'ape-step': v(0.14, 99, 0, 0.08),
  'gallop-run': v(0.16, 99, 0, 0.06),
  hoof: v(0.12, 99, 0, 0.1),
  pour: v(0.1, 99, 6, 0.1, { from: 'wade' }),
  freeze: v(0.12, 99, 6, 0.1, { from: 'ice-crack' }),
  block: v(0.15, 1, 2, 0.1),
  punch: v(0.25, 2, 3, 0.1),
  club: v(0.3, 1, 4),
  smash: v(0.45, 1, 7, 0.08),
  'ape-smash': v(0.35, 1, 6, 0.08),
  trample: v(0.4, 2, 4, 0.1),
  death: v(0.2, 3, 4, 0.1),
  'bite-big': v(0.4, 1, 6),
  'bite-small': v(0.14, 2, 1, 0.15),
  'gator-bite': v(0.3, 2, 6, 0.08),
  'cheetah-bite': v(0.25, 2, 5, 0.08),
  'snake-bite': v(0.154, 2, 4, 0.1),
  'snake-snap': v(0.27, 2, 4, 0.12),
  'gator-hiss': v(0.15, 1, 6, 0.06, { perSecond: 0.3 }),
  'rat-bite': v(0.14, 2, 2, 0.12),
  'piranha-bite': v(0.15, 1, 3, 0.15, { perSecond: 2 }),
  splash: v(0.22, 2, 1, 0.15, { perSecond: 6 }),
  'splash-big': v(0.5, 1, 6),
  slime: v(0.28, 2, 4, 0.12),
  flop: v(0.18, 1, 1, 0.15),
  'chest-beat': v(0.45, 1, 7, 0.05),
  gorilla: v(0.35, 1, 5, 0.06),
  gator: v(0.3, 1, 4, 0.05),
  boar: v(0.28, 1, 4, 0.1),
  cheetah: v(0.28, 1, 4, 0.08),
  horse: v(0.25, 1, 3, 0.06),
  zombie: v(0.2, 1, 2, 0.1),
  giant: v(0.45, 1, 7, 0.05),
  frog: v(0.216, 1, 1, 0.1),
  rat: v(0.15, 1, 1, 0.12),
  drum: v(0.3, 1, 4, 0.03), // in their table, never played (no mapping uses it)
  'tree-fall': v(0.4, 1, 6, 0.08),
  'tree-uproot': v(0.4, 1, 6, 0.08),
  'dragon-roar': v(0.5, 1, 10, 0.05),
  'dragon-breath': v(0.45, 1, 9, 0.05),
  'dragon-land': v(0.45, 1, 9, 0.05),
  wings: v(0.45, 2, 6, 0.08),
  'dragon-tail': v(0.55, 1, 8, 0.05),
  ui: v(0.3, 2, 10, 0.05),
  win: v(0.55, 1, 10, 0),
  'ice-crack': v(0.2, 2, 4),
  'ice-break': v(0.4, 2, 8),
  'place-soldier': v(0.1, 99, 10, 0),
  'place-roman': v(0.1, 99, 10, 0),
  'place-archer': v(0.1, 99, 10, 0),
  'place-mage': v(0.1, 99, 10, 0),
  'place-zombie': v(0.05, 99, 10, 0),
  'place-tree': v(0.1, 99, 10, 0),
  'place-mine': v(0.14, 99, 10, 0, { from: 'grenade-bounce' }),
  // ambient beds: OG game.js:5941-5946 (jitter 0, max 1, priority 0, looped)
  'amb-fire': { volume: 0.18, jitter: 0, max: 1, priority: 0, loop: true },
  'amb-water': { volume: 0.12, jitter: 0, max: 1, priority: 0, loop: true },
  'amb-gallop': { volume: 0.25, jitter: 0, max: 1, priority: 0, loop: true },
  'amb-slither': { volume: 0.135, jitter: 0, max: 1, priority: 0, loop: true },
  'amb-march': { volume: 0.191, jitter: 0, max: 1, priority: 0, loop: true },
  'amb-march-crowd': { volume: 0.166, jitter: 0, max: 1, priority: 0, loop: true, rate: 0.94 },
};
export const BEDS = ['amb-fire', 'amb-water', 'amb-gallop', 'amb-slither', 'amb-march', 'amb-march-crowd'];

// OURS (Part 2 step 4): sounds of the Dinosaurs, Siege and Pirates tabs. Not in OG (these 24 units are our own design);
// same fields and the same mixer rules as theirs. Big things are loud but rare: perSecond caps a flood (20 cannons
// ask ~5 booms a second, ~3 play), and every long sound is max 1 so it can't hog the 20 voices. perSecond under 1
// would drop even a lone call (OG's rule: chance = perSecond / requests in the last ~1 s), so the rare calls use 1.
export const OWN_SOUNDS = {
  // dinosaurs
  'trex-roar': v(0.5, 1, 9, 0.05, { perSecond: 1 }),
  'trex-bite': v(0.36, 1, 6, 0.06),
  'raptor-screech': v(0.24, 1, 5, 0.1, { perSecond: 2 }),
  'raptor-bite': v(0.2, 2, 3, 0.12),
  'dino-bellow': v(0.3, 1, 7, 0.06, { perSecond: 1 }),
  'longneck-bellow': v(0.32, 1, 7, 0.04, { perSecond: 1 }),
  'stomp-boom': v(0.42, 1, 8, 0.06, { perSecond: 1.5 }),
  spit: v(0.16, 2, 3, 0.12),
  'spit-splat': v(0.15, 2, 2, 0.15),
  'tail-swipe': v(0.34, 1, 5, 0.08),
  'club-tail': v(0.36, 1, 5, 0.08),
  'ptero-dive': v(0.26, 1, 5, 0.08, { perSecond: 2 }),
  'ptero-flap': v(0.2, 2, 2, 0.1),
  // siege
  'ram-hit': v(0.32, 1, 7, 0.06),
  'wall-crumble': v(0.28, 1, 5, 0.1),
  'wood-creak': v(0.1, 1, 1, 0.12),
  'wood-hit': v(0.13, 2, 2, 0.12),
  'wood-break': v(0.4, 1, 7, 0.06),
  'catapult-fire': v(0.34, 1, 6, 0.06),
  'boulder-land': v(0.42, 1, 7, 0.06, { perSecond: 2 }),
  'stone-knock': v(0.2, 2, 3, 0.1),
  'ballista-twang': v(0.34, 1, 6, 0.05),
  'bigbolt-thock': v(0.28, 1, 5, 0.08),
  'crossbow-shot': v(0.22, 2, 4, 0.08),
  'crossbow-crank': v(0.07, 1, 0, 0.08),
  'pot-shatter': v(0.26, 2, 4, 0.1),
  'oil-sizzle': v(0.13, 1, 3, 0.1),
  'bridge-slam': v(0.4, 1, 7, 0.06),
  'chain-rattle': v(0.24, 1, 5, 0.08),
  // pirates
  'cannon-boom': v(0.4, 1, 9, 0.06, { perSecond: 3 }),
  broadside: v(0.42, 1, 9, 0.04, { perSecond: 1 }),
  'ball-skip': v(0.18, 2, 3, 0.15),
  'ball-thud': v(0.26, 2, 4, 0.1),
  'ball-hit': v(0.3, 2, 5, 0.08),
  blunderbuss: v(0.33, 1, 6, 0.07),
  flintlock: v(0.25, 2, 4, 0.08),
  'fuse-light': v(0.13, 1, 3, 0.1),
  'anchor-smash': v(0.34, 1, 5, 0.08),
  'chain-whoosh': v(0.22, 1, 3, 0.1),
  'chain-throw': v(0.22, 1, 4, 0.08),
  'chain-yank': v(0.24, 1, 4, 0.08),
  'pirate-rally': v(0.3, 1, 8, 0.05, { always: true }),
  'ship-creak': v(0.15, 1, 1, 0.08),
  'ship-sink': v(0.34, 1, 8, 0.04),

  // OURS (Part 2 step 6): Robots, Space, Ocean, Sports, Bugs, Bosses. Same rules: floods capped by perSecond, long sounds
  // max 1. `loop` entries are held loops the engine runs per unit (OWN_LOOPS) or as a swarm bed (OWN_BEDS), never events.
  // robots
  zap: v(0.15, 2, 3, 0.12, { perSecond: 5 }),
  'laser-charge': v(0.2, 1, 5, 0.04),
  'laser-fire': v(0.24, 1, 5, 0.06),
  'laser-hum': { volume: 0.15, jitter: 0, max: 1, priority: 5, loop: true },
  'saw-rev': v(0.22, 1, 5, 0.06, { perSecond: 3 }),
  'saw-loop': { volume: 0.12, jitter: 0, max: 1, priority: 4, loop: true },
  'saw-grind': v(0.2, 2, 3, 0.1, { perSecond: 6 }),
  'magnet-hum': { volume: 0.15, jitter: 0, max: 1, priority: 5, loop: true },
  'magnet-clunk': v(0.26, 1, 5, 0.06),
  weld: v(0.1, 1, 1, 0.12, { perSecond: 4 }),
  'dome-up': v(0.2, 1, 4, 0.04),
  'dome-down': v(0.16, 1, 3, 0.04),
  'dome-hit': v(0.17, 2, 3, 0.1, { perSecond: 6 }),
  'glass-break': v(0.32, 1, 7, 0.06),
  'bot-beep': v(0.12, 2, 4, 0.02, { perSecond: 6 }),
  'mech-step': v(0.24, 2, 2, 0.06, { perSecond: 4 }),
  'rocket-launch': v(0.24, 2, 5, 0.08, { perSecond: 6 }),
  'metal-clank': v(0.2, 2, 3, 0.1, { perSecond: 8 }),   // a boss mech under 60 rifles: thinned
  'metal-ping': v(0.17, 2, 3, 0.15, { perSecond: 8 }),
  'scrap-crash': v(0.36, 1, 6, 0.08, { perSecond: 2 }),
  'robot-step': v(0.06, 99, 0, 0.12),
  // space
  'ray-shot': v(0.2, 2, 4, 0.1),
  'ray-hit': v(0.2, 2, 3, 0.12),
  'shrink-fire': v(0.22, 1, 4, 0.05),
  'shrink-down': v(0.26, 1, 5, 0.05),
  'bubble-blorp': v(0.24, 1, 4, 0.08),
  'bubble-drop': v(0.3, 1, 5, 0.06),
  'mind-hum': { volume: 0.13, jitter: 0, max: 1, priority: 5, loop: true },
  'mind-take': v(0.28, 1, 6, 0.04),
  'mind-free': v(0.22, 1, 5, 0.04),
  'ufo-beam': { volume: 0.15, jitter: 0, max: 1, priority: 5, loop: true },
  abduct: v(0.3, 1, 6, 0.05),
  'ufo-hover': { volume: 0.11, jitter: 0, max: 1, priority: 3, loop: true },
  'jet-hover': { volume: 0.09, jitter: 0, max: 1, priority: 3, loop: true },
  boing: v(0.14, 2, 2, 0.1, { perSecond: 4 }),
  'ufo-crash': v(0.4, 1, 8, 0.04),
  'alien-yelp': v(0.12, 1, 4, 0.12),
  'float-up': v(0.2, 1, 4, 0.06),
  // ocean
  'jaw-snap': v(0.32, 1, 5, 0.08, { perSecond: 4 }),
  breach: v(0.3, 1, 5, 0.08, { perSecond: 2 }),
  'ink-bloop': v(0.34, 1, 6, 0.06),
  'puff-up': v(0.22, 1, 4, 0.1),
  'shell-clunk': v(0.22, 2, 3, 0.1),
  'leap-whoosh': v(0.26, 1, 4, 0.08),
  'claw-click': v(0.18, 2, 2, 0.12),
  slap: v(0.28, 2, 4, 0.1),
  skid: v(0.2, 1, 3, 0.08),
  // sports
  'bat-crack': v(0.34, 1, 6, 0.06),
  'bowl-roll': v(0.24, 1, 4, 0.06),
  'pin-hit': v(0.22, 2, 3, 0.12, { perSecond: 8 }),
  'bowl-strike': v(0.4, 1, 8, 0.03),
  'puck-slap': v(0.28, 1, 5, 0.06),
  'puck-hit': v(0.24, 2, 4, 0.1),
  'puck-board': v(0.22, 1, 3, 0.1),
  'baseball-thud': v(0.26, 2, 4, 0.1),
  'glove-thump': v(0.22, 2, 3, 0.1),
  'sumo-stomp': v(0.42, 1, 8, 0.05),
  cheer: v(0.24, 1, 5, 0.08, { perSecond: 1.5 }),
  tackle: v(0.32, 1, 5, 0.08),
  hut: v(0.16, 1, 4, 0.1, { perSecond: 2 }),
  dodge: v(0.16, 2, 2, 0.12),
  // bugs
  'bee-buzz': { volume: 0.12, jitter: 0, max: 1, priority: 0, loop: true },
  'mosquito-whine': { volume: 0.08, jitter: 0, max: 1, priority: 0, loop: true },
  'drone-buzz': { volume: 0.11, jitter: 0, max: 1, priority: 0, loop: true },
  sting: v(0.14, 2, 2, 0.15),
  'hive-buzz': v(0.26, 1, 5, 0.06, { perSecond: 1 }),
  'web-thwip': v(0.2, 1, 3, 0.1),
  'web-splat': v(0.2, 1, 3, 0.1),
  'horn-clonk': v(0.26, 1, 4, 0.08),
  'boil-spray': v(0.22, 1, 4, 0.08),
  'mosquito-pop': v(0.24, 1, 4, 0.1),
  'stink-puff': v(0.22, 1, 4, 0.1),
  'mantis-lunge': v(0.2, 1, 3, 0.1),
  // bosses
  gulp: v(0.36, 1, 7, 0.06),
  'head-chop': v(0.4, 1, 8, 0.05, { perSecond: 1 }),
  'head-grow': v(0.36, 1, 8, 0.05, { perSecond: 1 }),
  'earth-rumble': v(0.4, 1, 8, 0.04, { perSecond: 1 }),
  'worm-burst': v(0.5, 1, 10, 0.04, { perSecond: 1 }),
  'worm-dive': v(0.36, 1, 7, 0.05, { perSecond: 1 }),
  'mech-lift': v(0.3, 1, 7, 0.05),
  'giant-stomp': v(0.5, 1, 9, 0.05, { perSecond: 1.5 }),
  'boss-growl': v(0.3, 1, 6, 0.08, { perSecond: 1 }),

  // OURS (Part 2 step 7): maps, the 4 new terrain brushes, the 8 secret units. Same rules. `center`: the engine plays it in
  // the middle (a UI moment, not a place on the field); `always`: never dropped by the 8-per-0.1 s cap (OG's war-cry rule).
  // maps + finds (UI moments: priority 10 like OG's ui / win)
  'secret-fanfare': v(0.5, 1, 10, 0, { always: true, center: true }),
  'map-flip': v(0.34, 1, 10, 0.06, { always: true, center: true }),
  'paper-rustle': v(0.26, 2, 10, 0.08),   // maps panel opens / closes (index.js mapsPanel)
  'paper-pop': v(0.36, 1, 10, 0.05),      // the Found card lands (index.js foundCard)
  padlock: v(0.3, 1, 10, 0.06),           // a locked Secret card is tapped (index.js lockedCard)
  // terrain
  'tramp-boing': v(0.2, 2, 3, 0.08, { perSecond: 5 }),   // a playground of 16 pads asks ~60 a second at most
  'tramp-rip': v(0.3, 1, 5, 0.08, { perSecond: 2 }),
  'plank-crack': v(0.3, 1, 5, 0.08, { perSecond: 3 }),
  'plank-fire': v(0.18, 1, 4, 0.1, { perSecond: 2 }),
  'rock-hiss': v(0.32, 1, 7, 0.06, { perSecond: 1.5 }),  // water meets lava: once per reaction (a stroke can react every tick)
  squelch: v(0.16, 2, 1, 0.12, { perSecond: 4 }),
  'mud-fizz': v(0.15, 1, 2, 0.12, { perSecond: 3 }),
  'fall-whistle': v(0.22, 1, 5, 0.06, { perSecond: 2 }),
  'lava-sizzle': v(0.13, 1, 2, 0.12),
  'amb-lava': { volume: 0.12, jitter: 0, max: 1, priority: 0, loop: true },   // bed: lava on the field (LAVA7)
  // secret units
  'ghost-boo': v(0.26, 1, 5, 0.08, { perSecond: 2 }),
  'gull-squawk': v(0.16, 1, 3, 0.12, { perSecond: 2.5 }),
  'crow-caw': v(0.2, 1, 4, 0.08, { perSecond: 1 }),
  'phoenix-screech': v(0.26, 1, 6, 0.06, { perSecond: 1.5 }),
  'phoenix-rebirth': v(0.36, 1, 8, 0.04, { perSecond: 1 }),
  'egg-hatch': v(0.3, 1, 7, 0.05),
  'egg-crunch': v(0.26, 1, 5, 0.08),
  'snow-splat': v(0.2, 2, 3, 0.12, { perSecond: 4 }),
  'freeze-solid': v(0.22, 1, 5, 0.06, { perSecond: 2 }),
  revolver: v(0.24, 2, 4, 0.07),
  'lasso-twirl': v(0.2, 1, 4, 0.08),
  'lasso-snap': v(0.26, 1, 5, 0.08),
  'straw-rustle': v(0.2, 1, 3, 0.1, { perSecond: 1.5 }),
  'bog-gloop': v(0.32, 1, 6, 0.06),
  'bog-bubbles': v(0.12, 1, 1, 0.12, { perSecond: 3 }),
  'baby-giggle': v(0.22, 1, 5, 0.08, { perSecond: 1.5 }),
  'baby-wail': v(0.3, 1, 8, 0.04, { perSecond: 1 }),
  'baby-plop': v(0.42, 1, 8, 0.05, { perSecond: 1.5 }),
  'baby-rattle': v(0.2, 2, 3, 0.1),

  // OURS (Part 2 step 8): the two moments only a made unit has (no source unit does them): a winged flyer tucks in and
  // dives down to strike with a melee weapon (dragons never dive), and a beam saucer swoops down to strike.
  'wing-dive': v(0.26, 1, 5, 0.08, { perSecond: 2 }),
  'ufo-swoop': v(0.22, 1, 4, 0.06, { perSecond: 2 }),
  // ... and a made unit with Drink clings to its host's side on the ground (the mosquito rides up in the air, its whine
  // covering the drinking): it slurps while latched (a held loop, MADE loops below).
  'drink-slurp': { volume: 0.13, jitter: 0, max: 1, priority: 3, loop: true },
  // OURS (Part 2 step 9, STEP9 UI): the campaign's UI moments (audio/index.js): a star stamped onto the result card (3 in a
  // row, each a step higher), a paint stroke that ran out of paint, the win and lose stings. Played in the middle.
  'star-stamp': v(0.42, 3, 10, 0.02),
  'paint-out': v(0.32, 1, 10, 0.06),
  'camp-win': v(0.5, 1, 10, 0),
  'camp-lose': v(0.45, 1, 10, 0),
};
// Every sound the mixer can play: theirs, then ours (no name is in both: tests/audio.test.mjs).
export const SOUND = { ...SOUNDS, ...OWN_SOUNDS };
// which synth recipe a sound uses (OG `from`, game.js:5863, 5888-5889, 5940)
export const srcOf = (id) => (SOUND[id] && SOUND[id].from) || id;

// ---------------------------------------------------------------- mixer numbers
export const MIX = {
  masterOn: 0.8,          // OG game.js:6387, 6455: master gain 0.8, 0 when muted
  muteFade: 0.05,         // OG game.js:6455: setTargetAtTime tau on mute toggle
  comp: { threshold: -20, knee: 20, ratio: 3, attack: 0.01, release: 0.25 }, // OG game.js:6378-6384
  lowpass: { f: 8500, q: 0.5 },   // OG game.js:6389-6393 (sfx bus only; beds bypass it)
  maxVoices: 20,          // OG game.js:6814
  newPerWindow: 8,        // OG game.js:6610: at most 8 new voices per 0.1 s (not `always` / `burst`)
  window: 0.1,            // OG game.js:6231, 6622
  maxDefault: 2,          // OG game.js:6228: limiter cap when a sound has no `max`
  bedEvery: 0.25,         // OG game.js:6262 (I = 0.25), 6623
  bedTau: 0.6,            // OG game.js:6936
  demandTau: 1,           // OG game.js:6598
  ring: 1024,             // OG game.js:9305: only the newest 1024 events are read (game.js:6562)
  startDelay: 0.25,       // OG game.js:6361: the context is made 250 ms after load
  stealFade: 0.015, stealStop: 0.08, // OG game.js:6844-6847
  panSpread: 0.75,        // OG game.js:6806: pan = 0.75 * (x / width * 2 - 1)
  flameLoops: 4,          // OG game.js:6676
  flameRamp: 0.05, flameFade: 0.05, flameStop: 0.3, // OG game.js:6667-6670, 6683
  gallopGap: 0.38,        // OG game.js:6765
  pingGap: 2.5, pingRate: 0.05, // OG game.js:6637, 6642
  placeGap: 0.14, callGap: 0.35, // OG game.js:6509, 6537
  pourEvery: 28, pourGap: 0.06,  // OG game.js:6462-6463
  freezeEvery: 36, freezeGap: 0.12, // OG game.js:6476-6477
  mineGap: 0.08,          // OG game.js:6491
  deep: 0.75,             // OG game.js:9556: deep water level (wade footsteps)
};
export const busyOf = (demand) => Math.max(0, Math.min(1, (demand - 8) / 22)); // OG game.js:6564

// size references used by the sim when it emits (module 423 exports a/b/c, game.js:9305-9307)
export const SIZE_REF = { blast: 60, body: 9, steam: 26 };

// ---------------------------------------------------------------- unit groups (OG game.js:5948-5994)
// Our type ids (ARCH.md). Risen copies are `risen_<type>` (OG risenFrom, game.js:4204).
const HUMANS = new Set(['rifle', 'sniper', 'flamer', 'grenadier', 'archer', 'legion', 'knight', 'cavalry', 'mage', 'ninja']); // OG game.js:5948-5959
const PROPS = new Set(['tree', 'barrel', 'anthill']); // OG `prop: true`, game.js:12190, 14622, 18839
// OURS (Part 2 step 4): the new tabs' people count as humans (grunts, screams, coughs, footsteps, risen = zombie bites).
const OWN_HUMANS = new Set(['shieldwall', 'halberd', 'crossbow', 'oilpot', 'siegecrew',
  'deckhand', 'pistol', 'blunderbuss', 'bomber', 'anchor', 'captain', 'gunner']);
// ... the wooden machines (wood knocks and breaks, rolling creaks) and the dinosaurs by size (1 small .. 3 huge).
const MACHINES = new Set(['ram', 'catapult', 'ballista', 'siegetower', 'cannon', 'ship']);
const DINO_SIZE = { raptor: 1, spitter: 1, ptero: 1, trike: 2, stego: 2, ankylo: 2, trex: 3, longneck: 3 };
export const OWN_TYPES = new Set([...OWN_HUMANS, ...MACHINES, ...Object.keys(DINO_SIZE)]);
const OWN_ANY = new Set([...OWN_TYPES].flatMap((t) => [t, 'risen_' + t])); // + risen copies: one lookup, no string work per event
// OURS (Part 2 step 6, STEP6.md): the sports players and the astronaut are people (OG human rules: grunts, screams,
// coughs, footsteps, risen = zombie bites); the aliens walk like people but yelp in their own voice; every robot, the
// UFO and the giant mech are machines (metal clanks, scrap crashes, metal pings when shot, never a human voice).
const PEOPLE6 = new Set(['tackler', 'batter', 'pitcher', 'bowler', 'hockey', 'sumo', 'boxer', 'cheerleader', 'astronaut']);
const ALIENS6 = new Set(['alien', 'jetpack', 'shrinkray', 'gravity', 'teleporter', 'mindalien']);
const MACHINES6 = new Set(['drone', 'laserbot', 'sawbot', 'magnetbot', 'repairbot', 'shieldbot', 'bombbot', 'mech', 'ufo', 'gmech']);
const SEA6 = new Set(['crab', 'shark', 'octopus', 'puffer', 'eel', 'turtle', 'walrus', 'swordfish']);
const BUGS6 = new Set(['bee', 'beehive', 'spider', 'beetle', 'mantis', 'bombardier', 'mosquito', 'stinkbug']);
const SLIMES6 = new Set(['kingslime', 'bigslime', 'slimelet']);
const BEASTS6 = new Set(['kraken', 'hydra', 'lavagolem', 'worm']);   // the living bosses (gmech is a machine, kingslime a slime)
export const STEP6_TYPES = new Set([...PEOPLE6, ...ALIENS6, ...MACHINES6, ...SEA6, ...BUGS6, ...SLIMES6, ...BEASTS6]);
const STEP6_ANY = new Set([...STEP6_TYPES].flatMap((t) => [t, 'risen_' + t]));
export const baseOf = (t) => (t && t.startsWith('risen_') ? t.slice(6) : t);           // OG game.js:6017-6020
export const isUndead = (t) => !!t && (t === 'zombie' || t.startsWith('risen_') || t === 'skeleton'); // OG game.js:5980-5983 (look.undead)
export const isProp = (t) => !!t && PROPS.has(t);                                       // OG game.js:5984-5987
// OURS (Part 2 step 7): of the secret units only the cowboy is a person (grunts, screams, coughs, footsteps, risen = bites).
// The baby is a giant toddler: its own giggle / wail, never a grown man's grunt.
const PEOPLE7 = new Set(['cowboy']);
export const isHuman = (t) => !!t && (HUMANS.has(t) || OWN_HUMANS.has(t) || PEOPLE6.has(t) || PEOPLE7.has(t)); // OG game.js:5977-5979 (_) + ours
export const isAlien = (t) => !!t && ALIENS6.has(t);                                    // ours (step 6)
export const isMachine = (t) => !!t && MACHINES.has(t);                                 // ours
export const heavyOf = (t) => (t === 'giant' || t === 'risen_giant' || t === 'dragon' ? 1.25 : t === 'boar' || t === 'risen_boar' ? 0.48 : 0); // OG game.js:5961-5967 (k)
export const isHorse = (t) => t === 'cavalry' || t === 'apecav' || t === 'horse' || t === 'risen_cavalry' || t === 'risen_apecav'; // OG game.js:5968-5975 (A)
export const isApe = (t) => t === 'ape' || t === 'risen_ape';                           // OG game.js:5976-5978 (S)
export const isCat = (t) => t === 'cheetah' || t === 'risen_cheetah';                   // OG game.js:5979-5981 (M)
export const isFootHuman = (t) => (isHuman(t) && t !== 'cavalry' && t !== 'ninja') || isAlien(t); // OG game.js:5982-5984 (E) + ours: aliens walk
export const isRat = (t) => t === 'rat' || t === 'risen_rat';                           // OG game.js:6741
// OG game.js:5988-5990 (R): bigger things play slower
export const sizeRate = (s) => Math.min(1.25, Math.max(0.6, 1 / Math.sqrt(Math.max(0.2, s))));
// OG game.js:5985-5987 (O): footstep loudness by speed
export const stepGain = (speed, run) => 0.3 + 0.7 * Math.max(0, Math.min(1, speed / Math.max(1, run))) ** 1.5;

// ---------------------------------------------------------------- events (OG module 423, game.js:9261-9304)
export const EVENTS = ['Shot', 'BulletHit', 'Ricochet', 'Bow', 'ArrowHit', 'Throw', 'Explosion', 'Flame', 'Ignite',
  'Lightning', 'Spell', 'Curse', 'Strike', 'Block', 'Trample', 'Death', 'Splash', 'ChestBeat', 'TreeFall', 'Flop',
  'Land', 'Roar', 'Flap', 'BowDraw', 'Charge', 'Hurt', 'Bounce', 'HatOff', 'Hop', 'WaterShock', 'Cough', 'Steam',
  'IceCrack', 'IceBreak', 'TreeUproot', 'MineArm', 'Raise', 'Teleport', 'Slip', 'Split', 'Tongue', 'Descend'];
export const normEvent = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const KNOWN = new Set(EVENTS.map(normEvent));
export const isSoundEvent = (n) => KNOWN.has(normEvent(n));

const V = (id, gain = 1, rate = 1, delay = 0) => ({ id, gain, rate, delay }); // OG game.js:6008-6015

// The voices one event plays. OG game.js:6006-6219 (function L).
//   kind: event name; who: our type id or null; size: event size; rnd: one uniform draw per event;
//   busy: 0..1 from recent demand (busyOf).
export function voicesFor(kind, who, size = 1, rnd = Math.random(), busy = 0) {
  const n = size, o = rnd, has = !!who;
  const b = has ? baseOf(who) : null;          // OG game.js:6017-6020
  const und = has && isUndead(who);            // OG game.js:6022
  switch (normEvent(kind)) {
    case 'shot': return [b === 'sniper' ? V('shot-sniper') : V('shot-rifle')]; // OG game.js:6024-6025
    case 'bullethit': // OG game.js:6026-6029
      return isProp(who) ? [V('hit-solid', Math.min(1.3, 0.6 + 0.4 * n))] : [V('bullet-hit', Math.min(1.3, 0.6 + 0.4 * n))];
    case 'ricochet': // OG game.js:6030-6031: no `who` = off a wall
      return !has ? [V('hit-solid', Math.min(1, n + 0.2))] : [V('ricochet', Math.min(1, n))];
    case 'bow': return [V('bow')];          // OG game.js:6032-6033
    case 'bowdraw': return [V('bow-draw')]; // OG game.js:6034-6035
    case 'watershock': { // OG game.js:6036-6044: 3..8 bursts, own seeded jitter
      const count = Math.min(8, 3 + Math.floor(n / 8));
      let s = 1e4 * o + 1;
      const r = () => (s = (16807 * s) % 2147483647) / 2147483647;
      const out = [];
      for (let i = 0; i < count; i++) out.push(V('lightning-water', 0.6 + 0.4 * r(), 0.85 + 0.35 * r(), i === 0 ? 0 : 0.35 * r()));
      return out;
    }
    case 'steam': return [V('steam', Math.min(1.3, 0.5 + 0.5 * n))]; // OG game.js:6045-6046
    case 'icecrack': return [V('ice-crack', n > 1.5 ? 1.2 : 0.8, n > 1.5 ? 0.9 : 1.1)]; // OG game.js:6047-6048
    case 'icebreak': return [V('ice-break', Math.min(1.4, 0.8 + 0.2 * n), sizeRate(n))]; // OG game.js:6049-6050
    case 'cough': return has && isHuman(who) ? [V('cough')] : []; // OG game.js:6051-6052
    case 'hop': return b === 'slime' ? [V('slime-hop', Math.min(1.3, 0.6 + 0.4 * n), sizeRate(n))] : []; // OG game.js:6053-6054
    case 'hatoff': return [V('hat-off', Math.min(1.2, 0.6 + 0.4 * n), 1, 0.08)]; // OG game.js:6055-6056
    case 'bounce': return [V('grenade-bounce', 0.25 + 0.75 * Math.min(1, n))]; // OG game.js:6057-6058
    case 'hurt': { // OG game.js:6059-6074: quiet hurts dropped when busy
      const id = has && isHuman(who) ? 'grunt'
        : b === 'slime' ? 'slime-hit'
        : b === 'boar' && !und ? 'boar-hit'
        : b === 'cheetah' && !und ? 'cheetah-hit'
        : b === 'giant' && !und ? 'giant-hit' : '';
      return id === '' || (n < 0.4 && o >= 0.2 + 0.8 * (1 - busy)) ? [] : [V(id, Math.min(1.2, 0.7 + 2 * n))];
    }
    case 'charge': { // OG game.js:6075-6080: size = group size
      if (b === 'gator') return [V('gator-hiss')];
      if (b !== 'legion' || n < 3) return [];
      const out = [V('roman-charge')];
      if (n >= 11) out.push(V('roman-charge-crowd', 1, 0.93, 0.18));
      return out;
    }
    case 'arrowhit': return isProp(who) ? [V('hit-solid', 0.8)] : [V('arrow-hit', Math.min(1, n + 0.3))]; // OG game.js:6081-6082
    case 'throw': { // OG game.js:6083-6087
      if (b === 'ninja') return [V('shuriken-throw')];
      const t = V('throw', Math.min(1.4, n), sizeRate(n));
      return b === 'grenadier' ? [V('grenade-pin'), t] : [t];
    }
    case 'explosion': return [V('explosion', Math.min(1.3, 0.5 + 0.5 * n), sizeRate(0.8 * n))]; // OG game.js:6088-6089
    case 'flame': return b === 'dragon' ? [V('dragon-breath')] : b === 'flamer' ? [] : [V('flame')]; // OG game.js:6090-6091 (flamer has its own loop)
    case 'ignite': { // OG game.js:6092-6095
      const t = V('ignite', Math.min(1.2, 0.6 + 0.4 * n), sizeRate(n));
      if (b === 'boar' && !und) return [t, V('boar-hit', 1.1)];
      return has && isHuman(who) && o < 1 / 3 ? [t, V('scream')] : [t]; // OG game.js:5960 (x = 1/3)
    }
    case 'lightning': return [V('lightning'), V('thunder', 1, 1, 0.18 + 0.25 * o)]; // OG game.js:6096-6097
    case 'spell': return [V('spell')];       // OG game.js:6098-6099
    case 'curse': return [V('curse')];       // OG game.js:6100-6101
    case 'raise': return [V('raise')];       // OG game.js:6102-6103
    case 'teleport': return [V('teleport')]; // OG game.js:6104-6105
    case 'strike': return strikeVoices(b, und, n, o); // OG game.js:6106-6149
    case 'block': return [V('block', Math.min(1, 0.5 + n))]; // OG game.js:6150-6151
    case 'trample': { // OG game.js:6152-6160
      if (b === 'dragon') return n < 2.8 ? [V('dragon-tail'), V('smash', 0.8, 0.8)] : [];
      const out = [V('trample', Math.min(1.4, 0.5 + 0.5 * n), sizeRate(n))];
      if (b === 'boar' && o < 0.4) out.push(V('boar', 0.9));
      if ((b === 'cavalry' || b === 'horse' || b === 'apecav') && o < 0.15) out.push(V('horse', 0.8));
      return out;
    }
    case 'death': return deathVoices(b, und, n, o); // OG game.js:6161-6188
    case 'splash': // OG game.js:6189-6192: small splashes by humans, heavies, horses, apes are silent
      return n <= 1.2 && has && (isFootHuman(who) || heavyOf(who) > 0 || isHorse(who) || isApe(who))
        ? []
        : [n > 1.2 ? V('splash-big', Math.min(1.3, n / 2)) : V('splash', Math.min(1, 0.4 + 0.6 * n), sizeRate(n))];
    case 'chestbeat': return o < 0.5 ? [V('chest-beat'), V('gorilla', 0.8, 1, 0.9)] : [V('chest-beat')]; // OG game.js:6193-6194
    case 'treefall': return [V('tree-fall')];     // OG game.js:6195-6196
    case 'treeuproot': return [V('tree-uproot')]; // OG game.js:6197-6198
    case 'slip': return [V('slip')];               // OG game.js:6199-6200
    case 'tongue': return [V('frog-tongue', 1, sizeRate(n))]; // OG game.js:6201-6202
    case 'split': return [V('slime-split', 1, sizeRate(n))];  // OG game.js:6203-6204
    case 'minearm': return [V('mine-beep')];       // OG game.js:6205-6206
    case 'flop': return [V('flop', 0.8)];          // OG game.js:6207-6208
    case 'land': return [V('death', Math.min(1, 0.3 + 0.5 * n), sizeRate(n))]; // OG game.js:6209-6210
    case 'roar': return [V('dragon-roar')];        // OG game.js:6211-6212
    case 'descend': return [V('dragon-land')];     // OG game.js:6213-6214
    case 'flap': return [V('wings', 1, 0.75), V('wings', 0.8, 0.7, 0.35)]; // OG game.js:6215-6216
  }
  return [];
}

// OG game.js:6106-6149. b = base type, und = undead, e = size, n = rnd.
function strikeVoices(b, und, e, n) {
  const call = und && n < 0.2 ? [V('zombie', 0.8, 1, 0.05)] : [];          // OG game.js:6108
  if (und && (b === 'zombie' || isHuman(b))) return [V('zombie-bite'), ...call]; // OG game.js:6109
  switch (b) {
    case 'legion': case 'cavalry': return [V('spear'), ...call];           // OG game.js:6111-6113
    case 'knight': return [V('blade'), ...call];                            // OG game.js:6114-6115
    case 'ninja': return [V('spear', 0.9, 1.1), ...call];                   // OG game.js:6116-6117
    case 'cheetah': return [V('cheetah-bite')];                             // OG game.js:6118-6119
    case 'giant': return [V('ape-smash', 1.2, 0.75), V('club'), ...(n < 0.15 ? [V('giant', 0.8, 1, 0.1)] : [])]; // OG game.js:6120-6121
    case 'ape': return [V('ape-smash'), ...(n < 0.3 ? [V('gorilla', 0.8, 1, 0.05)] : []), ...call]; // OG game.js:6122-6123
    case 'boar': return [V('punch', 1, 0.85), ...(n < 0.45 ? [V('boar')] : []), ...call]; // OG game.js:6124-6125
    case 'rat': return [V('rat-bite'), ...(n < 0.5 ? [V('rat')] : [])];   // OG game.js:6126-6127
    case 'ant': case 'soldierant': return [V('bite-small', 0.7, 1.4)];     // OG game.js:6128-6130
    case 'gator': return [V('gator-bite', 1, 1, 0.13), ...(n < 0.25 ? [V('gator', 0.7, 1, 0.1)] : [])]; // OG game.js:6131-6132
    case 'piranha': return [V('piranha-bite')];                            // OG game.js:6133-6134
    case 'snake': return [                                                 // OG game.js:6135-6139
      V('snake-bite', Math.min(1.3, 0.8 + 0.2 * e), sizeRate(e)),
      V('snake-snap', Math.min(1.3, 0.8 + 0.2 * e), sizeRate(e), 0.09)];
    case 'frog': return [V('bite-small', 0.7, 1.2)];                       // OG game.js:6140-6141
    case 'slime': return [V('slime', Math.min(1.3, 0.6 + 0.4 * e), sizeRate(e))]; // OG game.js:6142-6143
    case 'dragon': return [V('bite-big', 1.3, 0.7), V('smash', 0.7, 0.8)]; // OG game.js:6144-6145
    default: return [V('punch'), ...call];                                  // OG game.js:6146-6147
  }
}

// OG game.js:6161-6188.
function deathVoices(b, und, e, n) {
  if (isProp(b)) return [];                                                 // OG game.js:6164
  const l = V('death', Math.min(1.1, 0.4 + 0.3 * e), sizeRate(e));          // OG game.js:6165
  switch (b) {
    case 'giant': return [V('smash', 1.1, 0.6), V('giant', 0.8, 0.85)];     // OG game.js:6167-6168
    case 'boar': return [l, ...(n < 0.5 ? [V('boar', 0.8, 1.05)] : [])];   // OG game.js:6169-6170
    case 'ape': return [l, ...(n < 0.4 ? [V('gorilla', 0.7, 0.95)] : [])]; // OG game.js:6171-6172
    case 'cavalry': case 'horse': case 'apecav': return [l, ...(n < 0.3 ? [V('horse', 0.7, 0.95)] : [])]; // OG game.js:6173-6176
    case 'gator': return [l, ...(n < 0.3 ? [V('gator', 0.7, 1.05)] : [])]; // OG game.js:6177-6178
    case 'slime': return [V('slime', 1, 0.9 * sizeRate(e))];               // OG game.js:6179-6180
    case 'rat': case 'piranha': case 'ant': return [V('death', 0.35, 1.25)]; // OG game.js:6181-6184
    default: return und && n < 0.25 ? [l, V('zombie', 0.6, 0.9)] : [l];    // OG game.js:6185-6186
  }
}

// ---------------------------------------------------------------- OURS: the step-4 tabs' events (STEP4.md)
// The 24 step-4 units emit OG event names where they fit and a few of their own (OWN_EVENTS). Their projectiles carry
// no unit type, so the sims mark those events (`// STEP4 AUDIO:` in the unit files):
//   snd: 'ball'     cannonball: bullethit (a body), ricochet (a wall), bounce (lands on the ground), land (stops rolling)
//   snd: 'boulder'  catapult boulder: bounce (off a wall or something heavy);   land who='boulder' (+ wet: 1 in deep water)
//   snd: 'trike'    the trike's bounce off a wall (its trample event makes the crash)
//   skip: 1         splash: a cannonball skipping on water;   oil: 1  splash: an oil pot breaking
//   spit: 1         arrowhit / block: the spitter's glob;    kebab: n  arrowhit: a ballista bolt stopping (n bodies on it)
//   sinking: 1      death: the ship starts sinking (its last 'death' comes 3 s later, when it's gone)
//   walls, units    ram: tiles broken / units hit by one blow;   hook: 1  swing: the anchor throws its hook
// OWN_EVENTS:  Ram (ram blow), Dock (siege tower drawbridge), Rear (long-neck rears), Fuse (bomber lights), Swing (a
// swing that hit nobody; OG units send it too and stay silent).
export const OWN_EVENTS = ['Ram', 'Dock', 'Rear', 'Fuse', 'Swing'];

// The voices of one event: ours if it comes from a step-4 unit or projectile, else OG's (voicesFor). Same arguments as
// voicesFor plus the event itself (for its v and markers). OG units' events never reach ownVoices' rules (tested).
export function eventVoices(e, who, size = 1, rnd = Math.random(), busy = 0) {
  if (e && (e.as !== undefined || isMadeType(who))) { // step 8: a made unit's events (its weapon's / tricks' sources, its body)
    const m8 = madeVoices(e, who, size, rnd, busy);
    if (m8 !== null) return m8;
  }
  return chainVoices(e, who, size, rnd, busy);
}
// Every unit type's rules, newest first (step 7 marks, step 6, step 7 types, step 4, OG). Made units resolve to a source
// or body type, then come here.
function chainVoices(e, who, size, rnd, busy) {
  const m7 = marks7(e, who, size, rnd, busy);        // step 7: its own event names and marks (maps, terrain, secret moves)
  if (m7 !== null) return m7;
  const own6 = ownVoices6(e, who, size, rnd, busy); // step 6 first: its marks ride on events of any unit (a shrunk rifleman)
  if (own6 !== null) return own6;
  const t7 = types7(e, who, size, rnd, busy);        // step 7: OG-named events of the secret units (after step 6's marks)
  if (t7 !== null) return t7;
  const own = ownVoices(e, who, size, rnd, busy);
  return own !== null ? own : voicesFor(e.name, who, size, rnd, busy);
}
const NONE = Object.freeze([]);
// null = not ours, use OG's rules. e.v is the sim's size field (the engine's `size` is e.size, which the sims don't send).
export function ownVoices(e, who, size = 1, rnd = Math.random(), busy = 0) {
  const k = normEvent(e && e.name);
  switch (k) { // projectiles and marks first: no unit type, or the victim's type
    case 'bullethit':
      if (e.snd !== 'ball') break;
      if (isMachine(baseOf(who))) return [V('wood-hit', 1.2, 0.75), V('ball-hit', 0.7, 0.9)]; // through planks
      return [V('ball-hit', Math.min(1.3, 0.7 + 0.25 * (e.v || 1)))];
    case 'ricochet': // a wall (no who) or a shield that held (who = the shield bearer)
      if (e.snd === 'ball') return who ? [V('block', 1, 0.7), V('ball-hit', 0.7)] : [V('wall-crumble', 0.8, 1.15), V('hit-solid', 1, 0.6)];
      break;
    case 'bounce':
      if (e.snd === 'ball') return [V('ball-thud')];
      if (e.snd === 'boulder') return [V('stone-knock', 1, 0.8)];
      if (e.snd === 'trike') return NONE;
      break;
    case 'land':
      if (e.snd === 'ball') return NONE;                       // a rolling ball comes to rest: its thud already played
      if (who === 'boulder') return e.wet ? [V('splash-big', 1.2)] : [V('boulder-land')];
      break;
    case 'splash':
      if (e.skip) return [V('ball-skip')];
      if (e.oil) return [V('pot-shatter'), V('oil-sizzle', 1, 1, 0.05)];
      break;
    case 'arrowhit':
      if (e.spit) return [V('spit-splat')];
      if (e.kebab !== undefined) return [V('bigbolt-thock')];
      break;
    case 'block': if (e.spit) return [V('spit-splat', 0.8, 1.1)]; break;
  }
  if (!who || !OWN_ANY.has(who)) return null;
  const b = baseOf(who);
  const und = isUndead(who), ds = DINO_SIZE[b] || 0;
  switch (k) {
    case 'shot':
      if (b === 'cannon') return [V('cannon-boom')];
      if (b === 'ship') return [V('broadside')];
      if (b === 'blunderbuss') return [V('blunderbuss')];
      if (b === 'pistol' || b === 'captain') return [V('flintlock')];
      return null;
    case 'bow':
      if (b === 'ballista') return [V('ballista-twang')];
      if (b === 'crossbow') return [V('crossbow-shot'), V('crossbow-crank', 1, 1, 0.5)]; // the crank starts after the shot
      return null;
    case 'throw':
      if (b === 'catapult') return [V('catapult-fire')];
      if (b === 'spitter') return [V('spit')];
      if (b === 'ptero') return [V('ptero-flap')];             // grabs / lets go
      if (b === 'anchor') return [V('chain-yank')];            // the hook yanks someone in
      if (b === 'trex') return [V('throw', 1.3, 0.7)];          // a body flung from the jaws
      return null;
    case 'charge':
      if (b === 'raptor') return [V('raptor-screech')];        // the pounce
      if (b === 'trike') return [V('dino-bellow')];
      if (b === 'captain') return [V('pirate-rally')];
      return null;
    case 'roar': return b === 'trex' ? [V('trex-roar')] : null;
    case 'flap': return b === 'ptero' ? [V('ptero-dive')] : null;
    case 'rear': return b === 'longneck' ? [V('longneck-bellow')] : NONE;
    case 'fuse': return [V('fuse-light')];
    case 'ram': {
      const out = [V('ram-hit')];
      if (e.walls > 0) out.push(V('wall-crumble', 1, 1, 0.03));
      if (e.units > 0) out.push(V('punch', 1, 0.75));
      return out;
    }
    case 'dock': return [V('chain-rattle')];
    case 'swing':
      if (b === 'anchor') return e.hook ? [V('chain-throw')] : [V('chain-whoosh')];
      if (b === 'stego' || b === 'ankylo') return [V('throw', 1.3, b === 'stego' ? 0.55 : 0.6)]; // a tail swung at nobody
      return NONE;
    case 'land':
      if (b === 'ram') return NONE;                            // the Ram event plays the blow
      if (b === 'siegetower') return [V('bridge-slam')];       // drawbridge down (dock) or slammed on enemies
      return null;
    case 'trample':
      if (b === 'longneck') return [V('stomp-boom')];
      if (b === 'stego') return [V('tail-swipe')];
      if (b === 'ankylo') return [V('club-tail')];
      if (b === 'trike') return (e.v || 0) >= 2 ? [V('smash', 1, 0.85)] : [V('ape-smash', 1.1, 0.8), V('trample', 0.7, 0.8)]; // wall / gore
      if (b === 'raptor' && (e.v || 0) < 1) return [V('punch', 0.9, 0.85)]; // lands on its prey (a flung raptor: OG)
      return null;
    case 'strike': {
      if (und && OWN_HUMANS.has(b)) return null;               // risen people bite like OG's (zombie-bite)
      const call = und && rnd < 0.2 ? V('zombie', 0.8, 1, 0.05) : null; // OG game.js:6108
      const s = strikeOwn(b);
      if (s === null) return null;
      if (call) s.push(call);
      return s;
    }
    case 'hurt': { // OG's rule (game.js:6059-6074): quiet ones dropped when busy. e.v = damage / max hp
      if (!MACHINES.has(b)) return null;
      const n = e.v !== undefined ? e.v : size;
      return n < 0.4 && rnd >= 0.2 + 0.8 * (1 - busy) ? NONE : [V('wood-hit', Math.min(1.2, 0.7 + 2 * n))];
    }
    case 'bullethit': return MACHINES.has(b) ? [V('hit-solid', 1)] : null; // as OG props (game.js:6026-6029)
    case 'death': {
      if (b === 'ship') return e.sinking ? [V('ship-sink')] : [V('splash', 0.7, 0.6)]; // goes down / last bubble
      if (b === 'siegetower') return [V('wood-break', 1.1, 0.8), V('smash', 0.8, 0.7)];
      if (MACHINES.has(b)) return [V('wood-break', 1, b === 'ram' ? 0.85 : b === 'ballista' ? 1.08 : 1)];
      if (!ds) return null;                                     // people: OG
      const out = ds === 3 ? [V('smash', 1.1, 0.6), V('dino-bellow', 0.8, b === 'trex' ? 0.75 : 0.65)] // as OG's giant
        : ds === 2 ? [V('death', 1.1, 0.7), V('heavy-step', 1, 0.8)]
        : [V('death', 1, 1.05), ...(rnd < 0.4 && !und ? [V('raptor-screech', 0.6, 0.8)] : [])];
      if (und && rnd < 0.25) out.push(V('zombie', 0.6, 0.9));   // OG game.js:6185-6186
      return out;
    }
    case 'splash':
      if (b === 'ship') return (e.v || 0) >= 2 ? [V('splash-big', 1.3)] : [V('splash', 0.5, 0.7)]; // sinking / bow wave
      return null;
  }
  return null;
}
// Melee hit sounds of our attackers (null = OG's default punch).
function strikeOwn(b) {
  switch (b) {
    case 'raptor': return [V('raptor-bite')];
    case 'spitter': return [V('raptor-bite', 0.7, 1.25)];
    case 'trike': return [V('ape-smash', 1, 0.85)];            // horn jab
    case 'stego': return [V('bite-big', 0.7, 1.15)];
    case 'ankylo': return [V('club', 1, 0.8)];
    case 'ptero': return [V('bite-small', 1, 0.85)];          // peck
    case 'trex': return [V('trex-bite')];
    case 'longneck': return [V('ape-smash', 1.1, 0.7)];
    case 'shieldwall': return [V('spear', 1, 0.95)];
    case 'halberd': return [V('blade', 1, 0.78), V('club', 0.6, 0.8)];
    case 'siegecrew': return [V('blade', 0.9, 1.05)];
    case 'oilpot': return [V('club', 0.8, 1.3)];             // ladle
    case 'deckhand': return [V('blade', 0.9, 1.12)];
    case 'gunner': return [V('blade', 0.85, 1.02)];
    case 'captain': return [V('blade', 1.05, 0.95)];
    case 'pistol': return [V('club', 0.75, 1.2)];            // pistol-whip
    case 'blunderbuss': return [V('club', 0.85, 1.05)];
    case 'anchor': return [V('anchor-smash')];
    case 'ram': return [];                                       // the Ram event plays the blow
    case 'siegetower': return [V('punch', 0.8, 0.8)];
    default: return null;
  }
}

// ---------------------------------------------------------------- OURS: the step-6 tabs' events (STEP6.md "sim extras")
// Marks the sims put on events (`STEP6 <TAB> AUDIO` / `STEP6 AUDIO` in the unit files). They are heard whoever the event
// is about (a shrunk rifleman, a bowled-over knight), so they are read before the unit-type gate:
//   snd: 'ray'          alien / UFO ray: shot, bullethit (a body), ricochet (a wall);   fizzle: 1  spell: a shrink ring hits a wall
//   snd: 'rocket'       shot: jetpack mini rocket;   rocket: 1  shot: mech rocket;   missile: 1  shot: giant mech missile
//   snd: 'puck'         bullethit (a body), ricochet (the boards);   snd: 'baseball'  bullethit, bounce (lands / a wall)
//   snd: 'pin'          bounce: a unit bowled over (who = the pin);  snd: 'bowl'  bounce: the bowling ball off a wall
//   bat: 1 / bowl: 1    strike: something batted back / a strike (5+ pins);   web: 1  strike: a web lands on someone
//   dome: 1             block: a shot stopped on a shield dome;   wall: 1  bounce: a shoved unit slams into a wall
//   shrink / bubble / float / cast / mind   spell: shrunk, bubbled, float-punched, shrink ray fires, mind channel starts
//   mind: 1 | 2         curse: a thrall taken / let go;   drop: 1 / abduct: 1  descend: the bubble drops / the UFO takes one
//   beam: 1 / laser: 1  charge: UFO beam / giant mech chest laser;   crash: 1  hurt: the UFO starts to crash
//   breach / leap / ink splash: shark lunge, swordfish leap, octopus ink;   stomp: 1  land: sumo stomp
//   dodge: 1            swing: the boxer slips a hit;   slap: 1  throw: hockey slapshot
// OWN_EVENTS6: event names only step-6 units send (none is an OG name; 'Step' is the mech's foot, heavy: 1).
export const OWN_EVENTS6 = ['Zap', 'Laser', 'Saw', 'Magnet', 'Weld', 'Dome', 'DomeBreak', 'Beep', 'Step', 'Cheer', 'Swallow', 'Ink',
  'HeadOff', 'Grow', 'Rumble', 'Burst', 'Dive', 'PuffUp', 'LowHop'];
const quiet = (n, rnd, busy) => n < 0.4 && rnd >= 0.2 + 0.8 * (1 - busy); // OG game.js:6059-6074: quiet hurts drop when busy
const SLIME_R = { kingslime: 0.55, bigslime: 0.8, slimelet: 1.15 };      // a bigger slime plays lower
const MACH_R = { drone: 1.35, mech: 0.75, ufo: 0.75, gmech: 0.55 };       // metal clanks by size (bots 1)
// null = not a step-6 event, go on to step 4's rules, then OG's.
export function ownVoices6(e, who, size = 1, rnd = Math.random(), busy = 0) {
  if (!e) return null;
  const k = normEvent(e.name), ev = e.v !== undefined ? e.v : size;
  switch (k) { // 1. marks (projectiles and effects: any unit, or none)
    case 'shot':
      if (e.snd === 'ray') return [V('ray-shot', 1.1, 0.8)];              // the UFO's ray, from the saucer
      if (e.snd === 'rocket') return [V('rocket-launch', 0.75, 1.3)];     // jetpack mini rocket
      if (e.rocket) return [V('rocket-launch')];                          // mech salvo
      if (e.missile) return [V('rocket-launch', 1.3, 0.72)];              // giant mech missile: bigger, lower
      break;
    case 'bullethit':
      if (e.snd === 'ray') return [V('ray-hit', Math.min(1.3, 0.7 + 0.4 * ev))];
      if (e.snd === 'puck') return [V('puck-hit')];
      if (e.snd === 'baseball') return [V('baseball-thud')];
      break;
    case 'ricochet':
      if (e.snd === 'ray') return [V('ray-hit', 0.6, 1.3)];               // fizzles on a wall
      if (e.snd === 'puck') return [V('puck-board')];
      break;
    case 'bounce':
      if (e.snd === 'pin') return [V('pin-hit')];
      if (e.snd === 'bowl') return [V('stone-knock', 1.1, 0.7)];          // the bowling ball off a wall
      if (e.snd === 'baseball') return [V('baseball-thud', 0.5, 1.25)];
      if (e.wall) return [V('punch', 1, 0.8), V('hit-solid', 0.8, 0.75)]; // shoved into a wall
      break;
    case 'block': if (e.dome) return [V('dome-hit')]; break;
    case 'spell':
      if (e.shrink) return [V('shrink-down')];
      if (e.bubble) return [V('bubble-blorp')];
      if (e.float) return [V('float-up')];
      if (e.cast) return [V('shrink-fire')];
      if (e.fizzle) return [V('ray-hit', 0.5, 0.75)];
      if (e.mind) return NONE;                                             // the channel hums as a loop (OWN_LOOPS)
      break;
    case 'curse':
      if (e.mind === 1) return [V('mind-take')];
      if (e.mind === 2) return [V('mind-free')];
      break;
    case 'descend':
      if (e.drop) return [V('bubble-drop')];
      if (e.abduct) return [V('abduct')];
      break;
    case 'charge':
      if (e.beam) return [V('float-up', 0.9, 0.6)];                       // the beam locks on (its hum loops)
      if (e.laser) return [V('laser-charge', 1.4, 0.55)];                 // the giant mech's chest laser
      break;
    case 'strike':
      if (e.bat) return [V('bat-crack')];
      if (e.bowl) return [V('bowl-strike')];
      if (e.web) return [V('web-splat')];
      break;
    case 'splash':
      if (e.breach) return [V('breach')];
      if (e.leap) return [V('leap-whoosh'), V('splash', 0.7)];
      if (e.ink) return [V('ink-bloop', 0.8, 1.35)];
      break;
    case 'hurt': if (e.crash) return [V('ufo-crash')]; break;
    case 'land': if (e.stomp) return [V('sumo-stomp')]; break;
    case 'swing': if (e.dodge) return [V('dodge')]; break;
    case 'throw': if (e.slap) return [V('puck-slap')]; break;
    // 2. event names only step-6 units send
    case 'zap': return [V('zap')];
    case 'laser': return e.phase ? [V('laser-fire')] : [V('laser-charge')]; // the beam then hums as a loop
    case 'saw': return [V('saw-rev')];
    case 'magnet': return e.phase === 2 ? [V('magnet-clunk')] : NONE;    // the hum is a loop; the pull grabs with a clunk
    case 'weld': return [V('weld')];
    case 'dome': return [V(e.up ? 'dome-up' : 'dome-down')];
    case 'domebreak': return [V('glass-break')];
    case 'beep': { const c = Math.max(0, Math.min(1, e.v || 0)); return [V('bot-beep', 0.7 + 0.5 * c, 1 + 0.45 * c)]; } // faster, higher, closer
    case 'step': return e.heavy ? [V('mech-step')] : NONE;
    case 'cheer': return [V('cheer')];
    case 'swallow': return [V('gulp', Math.min(1.3, 0.7 + 0.3 * (e.v || 1)), who === 'kingslime' || who === 'worm' ? 0.8 : 1)];
    case 'ink': return [V('ink-bloop', 1.2, 0.75)];
    case 'headoff': return [V('head-chop')];
    case 'grow': return [V('head-grow')];
    case 'rumble': return [V('earth-rumble')];
    case 'burst': return [V('worm-burst')];
    case 'dive': return [V('worm-dive')];
    case 'puffup': return [V('puff-up')];
    case 'lowhop': return [V('boing')];                                  // the astronaut takes a floaty hop
  }
  if (!who || !STEP6_ANY.has(who)) return null;
  // 3. OG-named events of step-6 units, by type
  const b = baseOf(who), und = isUndead(who);
  switch (k) {
    case 'shot': return b === 'alien' ? [V('ray-shot')] : null;
    case 'strike': return strike6(e, b, und, ev, rnd);
    case 'hurt': // OG's rule (e.v = damage / max hp): quiet ones drop when busy
      if (MACHINES6.has(b)) return quiet(ev, rnd, busy) ? NONE : [V('metal-clank', Math.min(1.2, 0.7 + 2 * ev), MACH_R[b] || 1)];
      if (ALIENS6.has(b) && !und) return quiet(ev, rnd, busy) ? NONE : [V('alien-yelp', Math.min(1.2, 0.7 + 2 * ev))];
      if (SLIMES6.has(b)) return quiet(ev, rnd, busy) ? NONE : [V('slime-hit', Math.min(1.2, 0.7 + 2 * ev), SLIME_R[b])];
      if (BEASTS6.has(b) && !und) return [V('boss-growl', 0.8, b === 'worm' ? 0.85 : b === 'lavagolem' ? 0.9 : 1)]; // perSecond 1 thins it
      return null;                                     // people: OG grunts; sea animals and bugs: silent like OG's animals
    case 'bullethit': return MACHINES6.has(b) ? [V('metal-ping', Math.min(1.3, 0.6 + 0.4 * ev))] : null; // shot on metal
    case 'death': return death6(b, und, ev, rnd);
    case 'land':
      if (b === 'bee' || b === 'mosquito') return NONE; // a bug alighting
      if (b === 'drone') return [V('metal-clank', 0.5, 1.4)];
      return null;
    case 'hop':
      if (SLIMES6.has(b)) return [V('slime-hop', Math.min(1.3, 0.6 + 0.4 * ev), sizeRate(ev))]; // as OG's slime (game.js:6053-6054)
      return null;
    case 'trample':
      if (b === 'walrus') return ev >= 1.1 ? [V('slap', 1.2, 0.7), V('skid', 1, 1, 0.05)] : [V('slap', 1, 0.85), V('punch', 0.8, 0.8)]; // flops on its belly / bowls one over
      if (b === 'tackler') return [V('tackle')];
      if (b === 'mech') return [V('giant-stomp', 0.75, 1.3)];
      if (b === 'gmech') return [V('giant-stomp')];
      if (b === 'kraken') return [V('slap', 1.3, 0.55), V('smash', 0.8, 0.75)]; // an arm slams the shore
      if (b === 'worm') return NONE;                    // its burst plays the blow
      return null;
    case 'charge':
      if (b === 'tackler') return [V('hut')];
      if (b === 'sumo') return [V('hut', 1.1, 0.7)];
      if (b === 'mantis') return [V('mantis-lunge')];
      return null;
    case 'throw':
      if (b === 'bowler') return [V('bowl-roll')];
      if (b === 'pitcher') return [V('throw', 0.9, 1.4)];
      if (b === 'beetle') return [V('horn-clonk')];
      if (b === 'spider') return [V('web-thwip')];
      if (b === 'lavagolem') return [V('throw', 1.3, 0.6), V('oil-sizzle', 0.6, 0.9)];
      return null;
    case 'flap': return b === 'bee' ? [V('hive-buzz', Math.min(1.2, 0.6 + 0.4 * ev))] : null; // the hive lets bees out
    case 'steam': return b === 'bombardier' ? [V('boil-spray')] : null;
    case 'cough':
      if (b === 'stinkbug') return [V('stink-puff')];
      if (ALIENS6.has(b)) return [V('cough', 1, 1.45)];
      return null;
    case 'flame': return b === 'hydra' ? [V('dragon-breath', 1, 0.85)] : null;
    case 'roar': return b === 'hydra' ? [V('dragon-roar', 1, 0.8), V('trex-roar', 0.55, 1.1, 0.12)] : null; // three throats
    case 'rear': return b === 'gmech' ? [V('mech-lift')] : NONE;
    case 'swing': return b === 'lavagolem' || b === 'hydra' || b === 'worm' ? [V('throw', 1.2, 0.55)] : NONE; // a boss swings at air
    case 'teleport': return e.in ? [V('teleport', 1, 1.25)] : null;
    case 'block': return b === 'turtle' ? [V('shell-clunk')] : null;
    case 'ricochet': return b === 'sawbot' ? [V('metal-clank', 1.1, 0.8)] : null; // the saw bot off a wall
    case 'bounce': return b === 'tackler' ? [V('punch', 1, 0.75), V('grunt', 1.2)] : null; // he bounces off a big one
  }
  return null;
}
// Melee hits of step-6 attackers (null = OG's default punch). OG game.js:6106-6149 for the shape.
function strike6(e, b, und, ev, rnd) {
  if (und && (PEOPLE6.has(b) || ALIENS6.has(b))) return [V('zombie-bite'), ...(rnd < 0.2 ? [V('zombie', 0.8, 1, 0.05)] : [])]; // OG game.js:6108-6109
  let s;
  switch (b) {
    case 'sawbot': s = [V('saw-grind')]; break;
    case 'laserbot': case 'repairbot': case 'drone': case 'magnetbot': case 'bombbot': s = [V('metal-clank', 0.9, 1.1)]; break; // bonk, wrench
    case 'shieldbot': case 'shrinkray': case 'mindalien': s = [V('zap', 1.2, 0.85)]; break;
    case 'alien': case 'gravity': s = [V('punch', 0.9, 1.15)]; break;              // kick, slap
    case 'teleporter': s = e.backstab ? [V('blade', 1.1, 0.9), V('punch', 0.8, 0.85)] : [V('blade', 0.9, 1.1)]; break; // dagger
    case 'astronaut': s = [V('glove-thump', 1, 0.85)]; break;                      // puffy glove
    case 'crab': s = [V('claw-click')]; break;
    case 'shark': s = [V('jaw-snap')]; break;
    case 'octopus': s = [V('slap', 0.8, 1.25), V('slime', 0.6, 0.9)]; break;      // grabs, squeezes
    case 'puffer': s = [V('bite-small', 0.8, 1.1)]; break;
    case 'eel': s = [V('bite-small', 0.9, 0.9)]; break;
    case 'turtle': s = [V('snake-snap', 1.1, 0.7)]; break;                       // beak
    case 'walrus': s = [V('ape-smash', 1, 0.85)]; break;                         // tusks
    case 'swordfish': s = [V('spear', 1.1, 1.1)]; break;
    case 'batter': s = [V('bat-crack', 0.9, 1.05)]; break;
    case 'boxer': s = ev >= 1 ? [V('glove-thump', 1.2, 0.85), V('punch', 0.7, 0.8)] : [V('glove-thump', 0.9, 1.1)]; break; // uppercut / jab
    case 'sumo': s = [V('slap', 1.1, 0.9)]; break;                               // palms
    case 'cheerleader': s = [V('slap', 0.6, 1.35)]; break;                       // pom-pom slap
    case 'hockey': s = [V('club', 0.9, 1.2)]; break;                             // stick
    case 'bee': s = [V('sting')]; break;
    case 'mosquito': s = ev > 1.2 ? [V('mosquito-pop')] : [V('sting', 0.7, 0.8)]; break; // full: it pops
    case 'spider': s = [V('snake-bite', 0.9, 1.2)]; break;
    case 'beetle': s = [V('horn-clonk', 0.7, 1.2)]; break;
    case 'mantis': s = [V('blade', 0.85, 1.25)]; break;                          // scythe arms
    case 'bombardier': case 'stinkbug': s = [V('bite-small', 0.8, 0.95)]; break;
    case 'kraken': s = [V('slap', 1.3, 0.6), V('smash', 0.6, 0.85)]; break;
    case 'hydra': s = [V('trex-bite', 1, 0.85)]; break;
    case 'lavagolem': s = [V('smash', 1, 0.8), V('oil-sizzle', 0.7, 0.85, 0.04)]; break;
    case 'worm': s = [V('bite-big', 1.3, 0.6), V('ape-smash', 0.6, 0.7)]; break;
    case 'kingslime': s = ev >= 1 ? [V('slime', 1.3, SLIME_R[b]), V('dragon-land', 0.9, 1.1)] : [V('slime', 1, SLIME_R[b])]; break; // squash
    case 'bigslime': s = ev >= 1 ? [V('slime', 1.3, SLIME_R[b]), V('ape-smash', 0.6)] : [V('slime', 1, SLIME_R[b])]; break;
    case 'slimelet': s = [V('slime', Math.min(1.3, 0.6 + 0.4 * ev), SLIME_R[b])]; break;
    default: return null;
  }
  if (und && rnd < 0.2) s.push(V('zombie', 0.8, 1, 0.05)); // OG game.js:6108
  return s;
}
// Deaths of step-6 units (null = OG's). OG game.js:6161-6188 for the shape.
function death6(b, und, ev, rnd) {
  if (MACHINES6.has(b)) {
    if (b === 'gmech') return [V('scrap-crash', 1.2, 0.6), V('smash', 1, 0.6)];
    return [V('scrap-crash', b === 'drone' ? 0.6 : b === 'mech' ? 1.2 : 0.9, b === 'drone' ? 1.45 : b === 'mech' || b === 'ufo' ? 0.75 : 1)];
  }
  if (SLIMES6.has(b)) return [V('slime', 1, 0.9 * SLIME_R[b])];
  if (ALIENS6.has(b)) {
    const l = V('death', Math.min(1.1, 0.4 + 0.3 * ev), sizeRate(ev)); // OG game.js:6165
    return und ? (rnd < 0.25 ? [l, V('zombie', 0.6, 0.9)] : [l]) : rnd < 0.6 ? [l, V('alien-yelp', 0.9, 0.8)] : [l];
  }
  switch (b) {
    case 'bee': case 'mosquito': return [V('death', 0.35, 1.25)];   // as OG's ant (game.js:6181-6184)
    case 'beehive': return [V('wood-break', 0.7, 1.3), V('hive-buzz', 1, 0.85)];
    case 'kraken': return [V('splash-big', 1.3), V('boss-growl', 1.1, 0.7)];
    case 'hydra': return [V('smash', 1.1, 0.6), V('dragon-roar', 0.9, 0.7)];
    case 'lavagolem': return [V('wall-crumble', 1.2, 0.7), V('smash', 1, 0.6), V('oil-sizzle', 0.8, 0.7)];
    case 'worm': return [V('boss-growl', 1.1, 0.75), V('earth-rumble', 0.9)];
  }
  return null; // people, sea animals, other bugs: OG
}

// ---------------------------------------------------------------- OURS: Part 2 step 7 (STEP7.md: maps, terrain, secret units)
// Event names only step 7 sends (OWN_EVENTS7): Map {id} (a map is loaded, game.js), Secret {type, x, y} (a secret unit
// found, game.js), Boing {v 0.5..2} (trampoline; heavier = bigger v), Rip {fire 0|1} (a pad torn / burnt), PlankBreak
// {v, n} (bridge planks broken this tick), Rock {n, v} (water met lava), Squelch {v, type} (a unit steps into mud), Fall
// {v = radius, type, into: 'water'|'lava'} (dropped through a broken bridge), Spook {type: 'ghost'} (the ghost's boo).
// Marks on OG names (`STEP7 AUDIO` in the sim files): ignite plank (a plank catches) / rebirth (phoenix bursts);
// steampuff mud (mud puts a fire out); flap caw (gull dives) / crows: n (scarecrow calls crows) / dive (phoenix swoops);
// roar scare (scarecrow scares animals) / cry (baby wails); spell hatch; ricochet eggbreak; land / splash snow (snowball);
// land sit (baby plops); splash grab / bubbles (bog monster); icecrack freeze (frozen solid); throw lasso / grab (baby
// picks one up); strike lasso (the rope catches). The secret units' other OG-named events go by type (types7).
export const OWN_EVENTS7 = ['Map', 'Secret', 'Boing', 'Rip', 'PlankBreak', 'Rock', 'Squelch', 'Fall', 'Spook'];
const SECRET7 = new Set(['ghost', 'seagull', 'yeti', 'cowboy', 'scarecrow', 'phoenix', 'bogmonster', 'baby', 'crow']);
export const STEP7_TYPES = SECRET7;
const STEP7_ANY = new Set([...SECRET7].flatMap((t) => [t, 'risen_' + t]));
const clamp01 = (x, a, b) => (x < a ? a : x > b ? b : x);
// null = no step-7 name or mark: go on to step 6, step 4, OG.
export function marks7(e, who, size = 1, rnd = Math.random(), busy = 0) {
  if (!e) return null;
  const k = normEvent(e.name), ev = e.v !== undefined ? e.v : size;
  switch (k) {
    case 'map': return [V('map-flip')];
    case 'secret': return [V('secret-fanfare')];
    case 'boing': { const s = clamp01(ev, 0.5, 2); return [V('tramp-boing', Math.min(1.3, 0.6 + 0.35 * s), 1.15 - 0.15 * s)]; } // a heavy one: louder, lower
    case 'rip': return e.fire ? [V('plank-fire', 1, 1.2), V('tramp-rip', 0.6, 0.8)] : [V('tramp-rip')];
    case 'plankbreak': { const s = clamp01(ev, 0.25, 3); return [V('plank-crack', Math.min(1.3, 0.7 + 0.25 * s), 1.1 - 0.08 * s)]; }
    case 'rock': return [V('rock-hiss', Math.min(1.3, 0.75 + 0.2 * clamp01(ev, 0, 3)))];
    case 'squelch': return [V('squelch', Math.min(1.2, 0.6 + 0.3 * clamp01(ev, 0, 2)), sizeRate(clamp01(ev, 0.3, 2)))];
    case 'fall': return e.into === 'lava' ? [V('fall-whistle'), V('lava-sizzle', 1.3, 0.9, 0.12)] : [V('fall-whistle'), V('splash', 0.7, 0.9, 0.12)];
    case 'spook': return [V('ghost-boo')];
    case 'ignite':
      if (e.plank) return [V('plank-fire')];
      if (e.rebirth) return [V('phoenix-rebirth', 1, 1, 0.06)];   // just after the burst's boom (its explosion event)
      break;
    case 'steampuff': if (e.mud) return [V('mud-fizz')]; break;
    case 'flap':
      if (e.caw) return [V('gull-squawk')];
      if (e.crows !== undefined) return e.crows > 0 ? [V('crow-caw', Math.min(1.2, 0.8 + 0.1 * e.crows))] : NONE;
      if (e.dive) return [V('phoenix-screech')];
      break;
    case 'roar':
      if (e.scare) return [V('straw-rustle')];
      if (e.cry) return [V('baby-wail')];
      break;
    case 'spell': if (e.hatch) return [V('egg-hatch')]; break;
    case 'ricochet': if (e.eggbreak) return [V('egg-crunch')]; break;
    case 'land':
      if (e.snow) return [V('snow-splat')];
      if (e.sit) return [V('baby-plop')];
      break;
    case 'splash':
      if (e.snow) return [V('snow-splat', 0.9, 0.9), V('splash', 0.5)];   // a snowball into water
      if (e.grab) return [V('bog-gloop')];
      if (e.bubbles) return [V('bog-bubbles')];
      break;
    case 'icecrack': if (e.freeze) return [V('freeze-solid')]; break;
    case 'throw':
      if (e.lasso) return [V('lasso-twirl')];
      if (e.grab && baseOf(who) === 'baby') return [V('baby-giggle')];
      break;
    case 'strike': if (e.lasso) return [V('lasso-snap')]; break;
  }
  return null;
}
// OG-named events of the secret units with no mark (null = OG's rule). A secret unit never plays the dragon's roar or
// wings (OG's Roar / Flap), and the baby's sit plays its plop only (it also sends a trample).
export function types7(e, who, size = 1, rnd = Math.random(), busy = 0) {
  if (!e || !who || !STEP7_ANY.has(who)) return null;
  const k = normEvent(e.name), b = baseOf(who), und = isUndead(who);
  switch (k) {
    case 'shot': return b === 'cowboy' ? [V('revolver')] : null;
    case 'roar': case 'flap': case 'swing': return NONE;
    case 'trample': return b === 'baby' ? NONE : null;
    case 'strike': {
      let s;
      switch (b) {
        case 'seagull': s = [V('bite-small', 0.9, 1.2)]; break;   // peck
        case 'crow': s = [V('bite-small', 0.8, 1.3)]; break;
        case 'scarecrow': s = [V('club', 0.8, 1.15)]; break;      // pole bonk
        case 'baby': s = [V('baby-rattle')]; break;              // rattle bonk
        case 'bogmonster': s = [V('punch', 1, 0.85), V('slime', 0.6, 0.8)]; break; // a wet punch
        default: return null;                                    // yeti slam, cowboy: OG's punch / risen bite
      }
      if (und && rnd < 0.2) s.push(V('zombie', 0.8, 1, 0.05)); // OG game.js:6108
      return s;
    }
    case 'death': {
      let s;
      switch (b) {
        case 'ghost': s = [V('ghost-boo', 0.8, 0.7)]; break;                                // a last, low booo
        case 'seagull': s = und ? [V('death', 0.35, 1.25)] : [V('death', 0.35, 1.25), V('gull-squawk', 0.6, 0.85)]; break;
        case 'crow': s = [V('death', 0.35, 1.3)]; break;                                    // as OG's ant (game.js:6181-6184)
        case 'phoenix': s = [V('death', 0.8, 0.9), V('phoenix-screech', 0.6, 0.75)]; break;
        case 'scarecrow': s = [V('straw-rustle', 1, 0.85), V('wood-hit', 0.8, 0.8)]; break; // falls apart
        case 'bogmonster': s = [V('bog-gloop', 1, 0.75), V('death', 0.8, 0.7)]; break;
        case 'baby': s = [V('baby-plop', 0.9, 0.9)]; break;                                 // flops down (no crying)
        default: return null;                                                               // yeti, cowboy: OG
      }
      if (und && rnd < 0.25) s.push(V('zombie', 0.6, 0.9)); // OG game.js:6185-6186
      return s;
    }
  }
  return null;
}
export function ownVoices7(e, who, size = 1, rnd = Math.random(), busy = 0) { const m = marks7(e, who, size, rnd, busy); return m !== null ? m : types7(e, who, size, rnd, busy); }
// Lava (step 7): a low bubbling bed while lava is on the field (level = min(1, lava tiles / full) ** 0.6, OG's bed rule),
// and a sizzle now and then from a burning unit standing in it (chance per 0.25 s = 1 - exp(-min(cap, rate * n) * 0.25),
// OG's random-call rule). Read from world.lava7 (TERRAIN-SIM): undefined / 0 cells = nothing to do.
export const LAVA7 = { bed: 'amb-lava', full: 1500, sizzle: 'lava-sizzle', rate: 0.5, cap: 1.5, z: 2 };

// OG game.js:6574-6582: rank = 10 * priority + min(9, size * gain * 3)
export const rankOf = (voice, size) => 10 * ((SOUND[voice.id] && SOUND[voice.id].priority) || 0) + Math.min(9, size * voice.gain * 3);

// OURS: footsteps of the dinosaurs (the people use OG's human steps). Keyed by base type (risen copies step alike).
const OWN_STEPS = new Map(Object.entries({
  raptor: { id: 'ape-step', gain: 0.45, rate: 1.3 }, spitter: { id: 'ape-step', gain: 0.4, rate: 1.35 },
  trike: { id: 'heavy-step', gain: 0.62, rate: 0.95 }, stego: { id: 'heavy-step', gain: 0.6, rate: 0.95 },
  ankylo: { id: 'heavy-step', gain: 0.65, rate: 0.9 },
  trex: { id: 'heavy-step', gain: 1, rate: 0.85 }, longneck: { id: 'heavy-step', gain: 1.25, rate: 0.72 },
  // step 6: walking robots tick, the big ones thud (the mech sends its own 'step' event), sea animals only on dry land
  laserbot: { id: 'robot-step', gain: 1, rate: 1 }, magnetbot: { id: 'robot-step', gain: 1.05, rate: 0.9 }, repairbot: { id: 'robot-step', gain: 0.9, rate: 1.1 },
  shieldbot: { id: 'robot-step', gain: 1, rate: 0.95 }, bombbot: { id: 'robot-step', gain: 0.85, rate: 1.2 },
  gmech: { id: 'mech-step', gain: 1.3, rate: 0.62 }, hydra: { id: 'heavy-step', gain: 1.25, rate: 0.68 }, lavagolem: { id: 'heavy-step', gain: 1.2, rate: 0.75 },
  sumo: { id: 'heavy-step', gain: 0.5, rate: 1.15 },
  walrus: { id: 'flop', gain: 0.55, rate: 0.7, dry: true }, crab: { id: 'rat-step', gain: 0.9, rate: 0.75, dry: true }, turtle: { id: 'ape-step', gain: 0.45, rate: 0.95, dry: true },
}).flatMap(([t, s]) => [[t, s], ['risen_' + t, s]]));
export const ownStepOf = (t) => OWN_STEPS.get(t);
// OURS: random calls of our units, same rule as CALLS (chance per 0.25 s = 1 - exp(-min(cap, rate * count) * 0.25)).
//   rolling: only while it moves (a rolling machine creaks); the playback rate follows the machine's size.
//   burning / fleeing: as CALLS (step 6: burning or fleeing aliens yelp instead of screaming)
export const OWN_CALLS = [
  { id: 'wood-creak', rate: 0.6, cap: 1.2, rolling: true, test: (t) => t === 'ram' || t === 'catapult' || t === 'ballista' || t === 'siegetower' || t === 'cannon' },
  { id: 'ship-creak', rate: 1 / 6, cap: 0.4, test: (t) => t === 'ship' },
  { id: 'alien-yelp', rate: 0.25, cap: 1, burning: true, test: (t) => isAlien(t) },
  { id: 'alien-yelp', rate: 0.125, cap: 0.6, fleeing: true, test: (t) => isAlien(t) },
];
export const OWN_CALL_TYPES = new Set([...OWN_TYPES, ...ALIENS6]); // the engine only tests OWN_CALLS on these

// OURS (step 6): held loops. One voice per unit while it does the thing, stopped the frame it stops, dies or is
// cleared (engine unitLoops); at most `max` of a kind at once. rate(u) follows what it does (gain, rate default 1).
const act6 = (u) => (u.b ? u.b.act : 0);
const flyingUp = (u) => u.leaping === 3 && (u.z || 0) > 4;
export const OWN_LOOPS = [
  { id: 'laser-hum', max: 3, test: (u) => u.type === 'laserbot' && act6(u) === 2 },
  { id: 'laser-hum', max: 1, gain: 1.6, rate: () => 0.55, test: (u) => u.type === 'gmech' && act6(u) === 2 }, // the chest laser
  { id: 'saw-loop', max: 3, test: (u) => u.type === 'sawbot' && act6(u) === 1 },
  { id: 'magnet-hum', max: 2, rate: (u) => (act6(u) === 2 ? 1.3 : 0.85), test: (u) => u.type === 'magnetbot' && (act6(u) === 1 || act6(u) === 2) },
  { id: 'mind-hum', max: 2, test: (u) => u.type === 'mindalien' && act6(u) === 1 },
  { id: 'ufo-beam', max: 2, test: (u) => u.type === 'ufo' && act6(u) === 1 },
  { id: 'ufo-hover', max: 2, test: (u) => u.type === 'ufo' && act6(u) !== 2 && flyingUp(u) },
  { id: 'jet-hover', max: 3, test: (u) => u.type === 'jetpack' && flyingUp(u) },
];
export const LOOP_TYPES = new Set(['laserbot', 'gmech', 'sawbot', 'magnetbot', 'mindalien', 'ufo', 'jetpack']);
export const MAX_LOOPS = 8; // all kinds together (they sit outside the 20 event voices, like OG's flamer roars)
// ... and swarm beds: one looped bed per kind, its level = how many are up (OG's bed rule: min(1, n / full) ** 0.6).
export const OWN_BEDS = [
  { id: 'drone-buzz', full: 8, test: (u) => u.type === 'drone' && flyingUp(u) },
  { id: 'bee-buzz', full: 10, test: (u) => baseOf(u.type) === 'bee' && flyingUp(u) },
  { id: 'mosquito-whine', full: 5, test: (u) => baseOf(u.type) === 'mosquito' && flyingUp(u) },
];
export const BED_TYPES = new Set(['drone', 'bee', 'mosquito', 'risen_bee', 'risen_mosquito']);

// ---------------------------------------------------------------- painting (OG game.js:6263-6282, 6504-6547)
// Per-type place sound: a string, or a list of {id, gain, low, high} (rate range). Default rate 0.75..1.35.
export const PLACE = { // OG game.js:6263-6282 (H)
  rifle: 'place-soldier', grenadier: 'place-soldier',
  legion: 'place-roman', flamer: 'place-roman',
  cavalry: 'hoof', horse: 'hoof',
  slime: 'slime-hop',
  archer: 'place-archer',
  mage: 'place-mage', necro: 'place-mage',
  zombie: 'place-zombie',
  tree: 'place-tree',
  gator: [{ id: 'ape-step', low: 0.8, high: 1 }],
  barrel: [{ id: 'place-mine', low: 0.55, high: 0.7 }],
  ape: [{ id: 'ape-step', low: 0.9, high: 1.1 }],
  giant: [{ id: 'giant-hit', gain: 0.8, low: 0.88, high: 1.05 }, { id: 'death', gain: 1.2, low: 0.55, high: 0.68 }],
};
export const PLACE_RATE = { low: 0.75, high: 1.35 }; // OG game.js:6522-6523

// ---------------------------------------------------------------- random calls (OG game.js:6285-6311)
// chance per 0.25 s = 1 - exp(-min(cap, rate * count) * 0.25)   (OG game.js:6913-6914)
export const CALLS = [
  { id: 'scream', rate: 0.25, cap: 1, test: (t) => isHuman(t), burning: true },
  { id: 'scream', rate: 0.125, cap: 0.6, test: (t) => isHuman(t), fleeing: true },
  { id: 'boar-hit', rate: 1 / 3, cap: 1, test: (t) => t === 'boar', burning: true },
  { id: 'zombie', rate: 1 / 12, cap: 0.8, test: (t) => isUndead(t) && baseOf(t) !== 'frog' },
  { id: 'frog', rate: 1 / 8, cap: 1.25, test: (t) => t === 'frog' },
  { id: 'boar', rate: 1 / 12, cap: 0.8, test: (t) => t === 'boar' },
  { id: 'gorilla', rate: 1 / 12, cap: 0.8, test: (t) => t === 'ape' },
  { id: 'cheetah', rate: 1 / 12, cap: 0.8, test: (t) => t === 'cheetah' },
  { id: 'giant', rate: 0.025, cap: 0.2, test: (t) => t === 'giant' },
  { id: 'horse', rate: 1 / 12, cap: 0.8, test: (t) => t === 'cavalry' || t === 'horse' || t === 'apecav' },
  { id: 'rat', rate: 0.01, cap: 0.3, test: (t) => t === 'rat' },
  { id: 'gator', rate: 0.006, cap: 0.15, test: (t) => t === 'gator' },
];

// ---------------------------------------------------------------- OURS: Part 2 step 8 (STEP8.md "Sounds": made units)
// A made unit's type is 'mine_<id>', its zombie copy 'risen_mine_<id>'. What it sounds like comes from its recipe (body,
// size, weapon, abilities: sim/maker recipeOf, or u.def.maker.recipe when the engine has the unit):
//   1. An event with `as: '<source unit type>'` (every weapon / ability module puts it on what it emits) plays exactly what
//      that source unit plays for it (who = as): a made Rifle shoots like a rifleman, Fire breath roars like the dragon.
//      A zombie copy's blows add OG's 1-in-5 zombie groan (game.js:6108). Fixed where a source rule keys on a mark that
//      means something else on a made unit (asVoices: the flyers' `flap`).
//   2. No `as` on a made type: strike / swing (a close-in blow a shared helper emitted for the weapon) = the WEAPON's source
//      (oil pot = ladle, hockey stick, spitter bite); anything else (hurt, death, ignite, splash, cough, land, a bullet or
//      arrow in it) = its BODY's voice: person = a rifleman (grunts, screams, coughs, footsteps), animal = the boar, beast
//      = the T-Rex, giant = the giant; zombie copies = those types' zombie copies (bites, groans, silent hurts). Throats
//      (grunts, screams, squeals, bellows, groans) are pitched by the size step: small = higher, big = lower.
//   3. The engine: footsteps, burning / fleeing screams, random calls and the paint sound by the body; the flamer roar, the
//      held loops (laser, saw, magnet, mind, UFO beam + hover) and the dragon's wings by the weapon / ability (below).
// The audio never loads the sim for this: the browser asks for the maker module main.js has already loaded (resolves at
// once); node tests hand recipeOf in with setMadeLookup.
const STAND = { person: 'rifle', animal: 'boar', beast: 'trex', giant: 'giant' };   // the body's voice (OG / step-4 types)
const W_FROM = new Map(MAKER_WEAPONS.map((r) => [r.id, r.from]));
// a weapon whose close-in blow is the lead's plain fists, not the source's own melee (W-THROW's swat): a punch
const SWAT_PUNCH = new Set(['firebreath']);
const THROAT = new Set(['grunt', 'scream', 'cough', 'boar', 'boar-hit', 'giant', 'giant-hit', 'dino-bellow', 'zombie']);
const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);
export const isMadeType = (t) => typeof t === 'string' && (t.charCodeAt(0) === 109 ? t.startsWith('mine_') : t.charCodeAt(0) === 114 && t.startsWith('risen_mine_'));
let lookup = null, lookupAsked = false;
const MADE = new Map();   // type -> info (rebuilt when the recipe object changes: an edit re-registers a new one)
/** Hand in the maker's recipeOf (tests; the browser finds it itself). null = forget. */
export function setMadeLookup(fn) { lookup = typeof fn === 'function' ? fn : null; MADE.clear(); }
function askLookup() {
  if (lookupAsked) return;
  lookupAsked = true;
  import('../sim/maker/index.js').then((m) => { if (lookup === null && typeof m.recipeOf === 'function') lookup = m.recipeOf; }).catch(() => {});
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') askLookup(); // main.js loaded the maker first: at once
/**
 * A made type's sound info (null: not a made type, or its recipe is unknown). r = the recipe if the caller has it.
 * { r, risen, body, who (the body's voice type), from (the weapon's source), pitch, gain, fly, heavy, place }
 */
export function madeInfo(t, r) {
  if (!isMadeType(t)) return null;
  if (!r) { if (lookup === null) { askLookup(); return null; } r = lookup(t); if (!r) return null; }
  let m = MADE.get(t);
  if (m !== undefined && (m.r === r || m.r2 === r)) return m;
  if (m !== undefined && sameSound(m.r, r)) { m.r2 = r; return m; }   // the def's copy of the same recipe (buildDef cleans its own)
  m = buildInfo(t, r); MADE.set(t, m);
  return m;
}
// the recipe fields the sounds use are the same (no allocation: called per event)
function sameSound(a, b) {
  if (a.body !== b.body || a.size !== b.size || a.weapon !== b.weapon) return false;
  const x = a.abilities || NONE, y = b.abilities || NONE;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
function buildInfo(t, r) {
  const risen = t.charCodeAt(0) === 114, body = STAND[r.body] ? r.body : 'person', stand = STAND[body];
  const s = MAKER_SIZES[r.size] ?? 1, from = W_FROM.get(r.weapon) || 'rifle', abs = Array.isArray(r.abilities) ? r.abilities : [];
  return {
    r, r2: null, risen, body, who: risen ? 'risen_' + stand : stand,
    from: SWAT_PUNCH.has(r.weapon) ? 'rifle' : from,   // whose blows its untagged strikes are
    weapon: r.weapon,
    pitch: clampN(1 / Math.sqrt(s), 0.75, 1.3),          // throats: size 0.5 -> 1.3x, 2.25 -> 0.75x
    gain: clampN(Math.sqrt(s), 0.7, 1.2),                // its feet and wings
    fly: abs.includes('fly'), heavy: abs.includes('heavy'),
    place: body === 'person' ? (PLACE[from] || 'place-soldier')   // painting: a person by its weapon's people (OG H table)
      : body === 'giant' ? PLACE.giant
      : body === 'beast' ? MADE_PLACE_BEAST : null,      // animal: the boar's call only (as OG's boar)
  };
}
const MADE_PLACE_BEAST = [{ id: 'heavy-step', gain: 1, low: 0.72, high: 0.86 }];   // a heavy foot comes down
/** The type whose rules a unit type's body sounds use (a made type -> its body's voice type; anything else: itself). */
export function soundTypeOf(t, r) { if (!isMadeType(t)) return t; const m = madeInfo(t, r); return m !== null ? m.who : (t.charCodeAt(0) === 114 ? 'risen_rifle' : 'rifle'); }
/** A unit's made info from its own def (no lookup), or null. */
export function unitMade(u) { const M = u.def && u.def.maker; return M ? madeInfo(u.type, M.recipe) : null; }
/** The paint sound entry for a made type (PLACE format), or undefined. */
export function madePlaceOf(t) { const m = madeInfo(t); return m !== null && m.place !== null ? m.place : undefined; }

// null = not a made unit's event (or its recipe is unknown): the plain rules with who as it is.
export function madeVoices(e, who, size = 1, rnd = Math.random(), busy = 0) {
  const made = isMadeType(who);
  if (typeof e.as === 'string' && e.as !== '' && (made || !who)) return asVoices(e, e.as, size, rnd, busy, made && who.charCodeAt(0) === 114);
  if (!made) return null;   // `as` on someone else's event (a victim's block, a thrall let go): theirs
  const m = madeInfo(who);
  if (m === null) return null;
  const k = normEvent(e.name);
  if (k === 'strike' || k === 'swing') {   // the weapon's close-in blow, emitted by a shared helper without `as`
    const vs = chainVoices(e, m.from, size, rnd, busy);
    return m.risen && k === 'strike' && !isUndead(m.from) && rnd < 0.2 ? [...vs, V('zombie', 0.8, 1, 0.05)] : vs;
  }
  const vs = chainVoices(e, m.who, size, rnd, busy);   // the body
  if (m.pitch === 1) return vs;
  let out = vs;
  for (let i = 0; i < vs.length; i++) {
    if (!THROAT.has(vs[i].id)) continue;
    if (out === vs) out = vs.slice();
    out[i] = V(vs[i].id, vs[i].gain, vs[i].rate * m.pitch, vs[i].delay);
  }
  return out;
}
// What the source plays for one of its events, made-unit fixes first.
function asVoices(e, as, size, rnd, busy, und) {
  const k = normEvent(e.name);
  if (k === 'flap') {   // the flyers (A-MOVE): takeoff, and the melee dive no source does (step 7's dive mark is the phoenix's)
    if (as === 'dragon') return e.dive ? [V('wing-dive')] : [V('wings', 1, 0.75), V('wings', 0.8, 0.7, 0.35)]; // OG flap (game.js:6215-6216)
    if (as === 'ptero') return (e.v || 0) >= 2 ? [V('ptero-flap')] : [V('ptero-dive')]; // takes off (v 2) / a dive (the grab dive = the ptero's own flap)
    if (as === 'ufo') return e.dive ? [V('ufo-swoop')] : NONE;        // no wings: the hover hum loops (MADE loops below)
  }
  const vs = chainVoices(e, as, size, rnd, busy);
  return und && k === 'strike' && !isUndead(as) && rnd < 0.2 ? [...vs, V('zombie', 0.8, 1, 0.05)] : vs; // OG game.js:6108
}

// Engine hooks. The flamer weapon roars like the flamer (engine flames: OG's 4 roar loops, game.js:6657-6713).
export function flamerOf(u) { if (u.type === 'flamer') return true; const M = u.def && u.def.maker; return !!(M && M.weapon && M.weapon.id === 'flamer'); }
/** The bag of a made unit's ability `id`, or null. */
export function abilityBag(u, id) {
  const M = u.def && u.def.maker;
  if (!M || !u.b || !u.b.ab) return null;
  for (let i = 0; i < M.abs.length; i++) if (M.abs[i].id === id) return u.b.ab[i];
  return null;
}
const madeW = (u, id) => { const M = u.def && u.def.maker; return !!(M && M.weapon && M.weapon.id === id && u.b && u.b.wb); };
const abPhase = (u, id) => { const b = abilityBag(u, id); return b !== null && b !== undefined ? b.phase : 0; };
const beamOn = (u) => { const b = abilityBag(u, 'beam'); return b !== null && b !== undefined && b.bm === 1; };
// The held loops of made units, same rules as the step-6 ones (one voice per unit, stopped the frame it stops): read from
// the weapon's / ability's bag (fields in their module headers: guns-more.js laser phase 2 = the beam sweeps, melee-tricks
// saw mode 1 = the run, act2 magnet phase 1 charge / 2 pull, act2 mind phase 1 = channelling, move-fly beam bm 1, act2
// drink latched 1).
OWN_LOOPS.push(
  { id: 'laser-hum', max: 3, test: (u) => madeW(u, 'laser') && u.b.wb.phase === 2 },
  { id: 'saw-loop', max: 3, test: (u) => madeW(u, 'saw') && u.b.wb.mode === 1 },
  { id: 'magnet-hum', max: 2, rate: (u) => (abPhase(u, 'magnet') === 2 ? 1.3 : 0.85), test: (u) => { const p = abPhase(u, 'magnet'); return p === 1 || p === 2; } },
  { id: 'mind-hum', max: 2, test: (u) => abPhase(u, 'mind') === 1 },
  { id: 'ufo-beam', max: 2, test: beamOn },
  { id: 'ufo-hover', max: 2, test: (u) => abilityBag(u, 'beam') !== null && !beamOn(u) && flyingUp(u) },
  { id: 'drink-slurp', max: 2, test: (u) => { const b = abilityBag(u, 'drink'); return b !== null && b !== undefined && b.latched === 1 && u.hp > 0; } }, // act2 drink latched
);
const LOOPY_W = new Set(['laser', 'saw']), LOOPY_A = ['magnet', 'mind', 'beam', 'drink'];
const LOOPY = new WeakMap();   // maker block -> has a loop at all (the engine skips the rest fast)
export function madeLoops(u) {
  const M = u.def && u.def.maker;
  if (!M) return false;
  let y = LOOPY.get(M);
  if (y === undefined) { y = !!(M.weapon && LOOPY_W.has(M.weapon.id)) || M.abs.some((a) => LOOPY_A.includes(a.id)); LOOPY.set(M, y); }
  return y;
}
// The dragon's wings while it flies (OG game.js:6871-6876: every other 0.25 s per dragon) for made flyers with Fly: one of
// them per 0.5 s (a sky of 12 made flyers is not 12 dragons), pitched by its size.
export const MADE_WINGS = { id: 'wings', gain: 0.9, rate: 0.7, refR: 30, lo: 0.65, hi: 1.2 };
/** Footsteps off: a made unit burrowed under the ground (move-ground.js burrow `under`). */
export function madeUnder(u) { const b = abilityBag(u, 'burrow'); return b !== null && b !== undefined && b.under === 1; }
