// siegecrew (OURS, Part 2 step 4, spawned only): the men who push and load the machines. They stand at their machine's
// slots and walk with it, fight from the slot with a short sword, and fight on as plain soldiers once the machine is gone
// (or take an empty slot on another machine nearby). Rules: STEP4.md Siege, _lib.js crews.
import { registerUnit } from '../../defs.js';
import { footBase, footInit, footBrain, meleeBrain, INT } from './_lib.js';

const T = Object.freeze({
  radius: 8.63,        // person (rifle size)
  maxHp: 70,           // STEP4
  mass: 1,
  walkSpeed: 70,       // keeps up with any machine (ram driven by the player: 48)
  runSpeed: 115,
  maxSpeed: 135,
  accel: 600,
  turnRate: 6,
  sight: 280,          // sight / alert sight px
  reaction: 0.3,       // s
  brushSpacing: 21,    // never painted; for formation slots
  strength: 0.5,       // odds weight
});
const SWORD = Object.freeze({
  damage: 8,           // STEP4: short sword 8
  jitter: 2,           // +- per blow
  reachGap: 6,         // reach = r + r_target + 6
  push: 50,            // knockback x pass
  stun: 0.1,           // s x pass
  cooldown: 0.8,       // s between blows ...
  cdJit: 0.3,          // ... + up to 0.3 s
  facing: 0.6,         // rad: strikes only when facing the target this well
  runUnder: 80,        // px past reach: run in, else walk
  circle: 1,           // circling weight (OG 497.a)
  memory: 5,           // s: group contact memory
});

registerUnit({
  ...footBase(),
  type: 'siegecrew', og: 'Siege crew (ours)', unpaintable: true,
  radius: T.radius, mass: T.mass, maxHp: T.maxHp, melee: true, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  sightRange: T.sight, alertSightRange: T.sight, stickyTarget: true, reactionTime: T.reaction, minDistance: 0,
  drilled: false, intelligence: INT.Trained, brushSpacing: T.brushSpacing,
  look: { hat: true, attack: { time: 0.3 } },
  weapon: SWORD,
  init(world, u) { footInit(u); u.cooldown = SWORD.cooldown * world.rng(); },
  brain: footBrain((world, u) => { meleeBrain(world, u, SWORD); }),
});
