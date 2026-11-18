// Soldier ant: the colony's heavy defender, hatched inside an anthill, never painted
// (OG "Soldier ant" = {...Ant, overrides}, game.js:12156-12175). Same brain, init and hit hook as the Ant;
// its bite is 15 (OG game.js:12154, chosen in the shared ant brain). Owner: ANIMALS.
import { registerUnit, getDef } from '../../defs.js';
import { fac, LOCO, INTEL } from './lib.js';
import './ant.js';

const ANT = getDef('ant'); // OG game.js:12157 (...R)

registerUnit({
  type: 'soldierant',
  og: 'Soldier ant', // OG game.js:12160
  swims: true, // OG game.js:12161
  unpaintable: true, // OG game.js:12162
  category: 'animals', // OG game.js:11943
  faction: fac('Ants'), // OG game.js:11944
  bug: true, // OG game.js:11945
  radius: 7.4, // OG game.js:12163
  radiusJitter: 0.08, // OG game.js:11947
  mass: 1.3, // OG game.js:12164
  maxHp: 75, // OG game.js:12165
  melee: true, // OG game.js:11950
  strength: 0.8, // OG game.js:12166
  locomotion: LOCO.Holonomic, // OG game.js:11952
  walkSpeed: 48, // OG game.js:11953
  runSpeed: 92, // OG game.js:12167
  maxSpeed: 105, // OG game.js:12168
  accel: 600, // OG game.js:11956
  decel: 600, // OG game.js:11957
  turnRate: 7, // OG game.js:11958
  turnSpeedFalloff: Infinity, // OG game.js:11959
  sightRange: 170, // OG game.js:11960
  alertSightRange: 220, // OG game.js:11961
  stickyTarget: true, // OG game.js:11962
  reactionTime: 0.2, // OG game.js:11963
  huntRange: Infinity, // OG game.js:11964
  minDistance: 0, // OG game.js:11965
  drilled: false, // OG game.js:11966
  intelligence: INTEL.Animal, // OG game.js:11967
  infectable: true, // OG game.js:11968
  turnsWhenKilled: false, // OG game.js:11969
  flammability: 0.8, // OG game.js:11970
  swarms: true, // OG game.js:11971
  brushSpacing: 14, // OG game.js:11972
  flock: {
    personalSpace: 1.05, // OG game.js:11973
    separation: 26, // OG game.js:11973
    alignment: 0.4, // OG game.js:11271
    cohesion: 0.3, // OG game.js:11272
    formation: 0, // OG game.js:11273
    herd: 0.5, // OG game.js:11973
    herdSpacing: 6, // OG game.js:11973
    idleSpread: 1.8, // OG game.js:11276
    flockByState: [1, 0.6, 0.15, 1, 0.2, 0.5], // OG game.js:11277
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:11278
  },
  morale: {
    baseline: 1, // OG game.js:11974
    oddsWeight: 0.55, // OG game.js:9952
    fearWeight: 0, // OG game.js:9953
    casualtyWeight: 0, // OG game.js:9954
    woundWeight: 0, // OG game.js:9955
    hitShock: 0, // OG game.js:9956
    suppression: 0, // OG game.js:9957
    canBreak: false, // OG game.js:11974
    breakAt: 0.22, // OG game.js:9959
    rallyAt: 0.55, // OG game.js:9960
    minFleeTime: 2.5, // OG game.js:9961
    dropRate: 3.2, // OG game.js:9962
    recoverRate: 0.2, // OG game.js:9963
    panicFear: 0.5, // OG game.js:9964
    deathFear: 0.1, // OG game.js:11974
  },
  look: {
    attack: {
      time: 0.22, // OG game.js:11981
      kick: 0.9, // OG game.js:11981
    },
  },
  init: ANT.init,
  brain: ANT.brain,
  onHit: ANT.onHit,
});
