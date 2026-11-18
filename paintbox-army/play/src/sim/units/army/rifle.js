// rifle (OG "Soldier", type 0): cheap all-round rifle line. Def + weapon, OG module 473 (game.js:9883-9981).
// Brain = the shared gun brain (CORE-B gunBrain, OG 495.f game.js:10377-10434) with this weapon.
import { registerUnit } from '../../defs.js';
import { gunBrain, gunInit } from '../../combat/index.js';
import { FACTION, LOCO, INTEL, SOLDIER_FLOCK, SOLDIER_MORALE } from './_shared.js';

// Weapon config `h` (OG game.js:9892-9908). No penetration field → bullets stop at the first body (OG game.js:9157).
const RIFLE = Object.freeze({
  range: 230, // OG game.js:9893
  projectileSpeed: 760, // OG game.js:9894
  damage: 30, // OG game.js:9895
  damageJitter: 8, // OG game.js:9896
  noiseRadius: 260, // OG game.js:9897
  cooldown: 1.4, // OG game.js:9898
  cooldownJitter: 0.5, // OG game.js:9899
  magazine: 8, // OG game.js:9900
  reloadTime: 2.4, // OG game.js:9901
  spread: 0.16, // OG game.js:9902
  aimTolerance: 0.12, // OG game.js:9903
  movingPenalty: 0.8, // OG game.js:9904
  steadySpeed: Infinity, // OG game.js:9905
  settleTime: 0, // OG game.js:9906
  contactMemory: 4, // OG game.js:9907
});

registerUnit({
  type: 'rifle',
  og: 'Soldier', // OG game.js:9912
  key: 'soldier', // OG game.js:9911
  category: 'army',
  faction: FACTION.Soldiers, // OG game.js:9913
  radius: 8.63, // OG game.js:9914
  radiusJitter: 0.08, // OG game.js:9915
  mass: 1, // OG game.js:9916
  maxHp: 100, // OG game.js:9917
  melee: false, // OG game.js:9918
  strength: 0.6, // OG game.js:9919
  locomotion: LOCO.Holonomic, // OG game.js:9920
  walkSpeed: 96, // OG game.js:9921
  runSpeed: 138, // OG game.js:9922
  maxSpeed: 168, // OG game.js:9923
  accel: 780, // OG game.js:9924
  decel: 780, // OG game.js:9925
  turnRate: 7, // OG game.js:9926
  turnSpeedFalloff: Infinity, // OG game.js:9927
  sightRange: 330, // OG game.js:9928
  alertSightRange: 330, // OG game.js:9929
  stickyTarget: false, // OG game.js:9930
  reactionTime: 0.35, // OG game.js:9931
  huntRange: Infinity, // OG game.js:9932
  minDistance: 120, // OG game.js:9933
  drilled: false, // OG game.js:9934
  intelligence: INTEL.Trained, // OG game.js:9935
  infectable: true, // OG game.js:9936
  flammability: 0.3, // OG game.js:9937
  brushSpacing: 21.12, // OG game.js:9938
  flock: SOLDIER_FLOCK, // OG game.js:9939-9949
  morale: SOLDIER_MORALE, // OG game.js:9950-9966
  look: {
    hat: true, // OG game.js:9969 (hat can fly off on big hits)
    attack: { time: 0.28 }, // OG game.js:9974 (attack pose decay time)
  },
  weapon: RIFLE, // ours: the gun config, for CORE-B / report readers
  init(world, u) { gunInit(world, u, RIFLE); }, // OG game.js:9976-9978 (495.e)
  brain(world, u) { gunBrain(world, u, RIFLE); }, // OG game.js:9979 (495.f)
});
