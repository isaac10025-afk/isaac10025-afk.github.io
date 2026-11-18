// halberd (OURS, Part 2 step 4): long-reach polearm. Chops from 30 px past contact. Set against a charge: an enemy running
// at it (faster than 120 px/s, coming its way, within 140 px) makes it plant the polearm (b.act 1 `set`); when the
// charger comes within reach it takes 3x the chop (78) and stops dead, stunned 0.5 s.
import { registerUnit } from '../../defs.js';
import { A, act, findCharger, stillCharging, mayAttack, meleeBrain, footBase, footInit, footBrain, hyp, STATE as S, INT } from './_lib.js';

const T = Object.freeze({
  radius: 9,           // STEP4
  maxHp: 120,          // STEP4
  mass: 1.3,           // STEP4
  walkSpeed: 70,       // STEP4
  runSpeed: 120,       // STEP4
  maxSpeed: 140,
  accel: 520,
  turnRate: 5,
  sight: 300,
  reaction: 0.25,
  brushSpacing: 20,
  strength: 1,
});
const CHOP = Object.freeze({
  damage: 26,          // STEP4 chop 26 ...
  jitter: 3,
  cooldown: 1.1,       // ... at 1.1 s (STEP4)
  cdJit: 0.25,
  reachGap: 30,        // STEP4 long reach: r + r_target + 30
  push: 120,
  stun: 0.25,
  facing: 0.5,
  runUnder: 70,
  circle: 0.6,
  memory: 5,
});
const SET = Object.freeze({
  R: 140,              // STEP4: chargers within 140 px ...
  minSpeed: 120,       // ... faster than 120 px/s ...
  cos: 0.75,           // ... coming its way (within ~41 deg)
  scanEvery: 5,        // ticks between scans
  mul: 3,              // STEP4: the charger takes 3x the chop (78)
  stun: 0.5,           // STEP4: and stops dead, stunned 0.5 s
  ready: 0.1,          // s: the polearm needs this long to come level
  keep: 0.35,          // s: `set` pose held after the blow
});

function brain(world, u) {
  const b = u.b;
  let c = b.charger >= 0 ? world.unitById(b.charger) : null;
  if (c && !stillCharging(u, c, SET.minSpeed * 0.6, 0.5, SET.R + 20)) c = null;
  if (!c && !(u.stun > 0) && u.state !== S.FLEE && mayAttack(world, u) && (world.tick + u.index) % SET.scanEvery === 0) {
    c = findCharger(world, u, SET.R, SET.minSpeed, SET.cos);
    if (c) b.setAt = world.time;
  }
  b.charger = c ? c.id : -1;
  if (c && !(u.stun > 0) && u.state !== S.FLEE) {
    act(world, u, 1);
    A.setState(u, S.ENGAGE);
    u.goalX = 0; u.goalY = 0;
    const dx = c.x - u.x, dy = c.y - u.y, d = hyp(dx, dy) || 0.001;
    u.face = Math.atan2(dy, dx);
    if (d <= u.radius + c.radius + CHOP.reachGap && world.time - b.setAt >= SET.ready) {
      A.strike(world, u, c, dx / d, dy / d, (CHOP.damage + CHOP.jitter * (2 * world.rng() - 1)) * SET.mul, 0, 0);
      c.vx = 0; c.vy = 0;                                  // stops dead
      if (c.stun < SET.stun) c.stun = SET.stun;
      if (c.state === S.CHARGE) A.setState(c, S.ENGAGE);
      A.setAttack(u); u.cooldown = CHOP.cooldown;
      b.charger = -1; b.setHit = world.time;
      if (world.stats) world.stats.impacts = (world.stats.impacts || 0) + 1;
    }
    return;
  }
  meleeBrain(world, u, CHOP);
  act(world, u, world.time - b.setHit < SET.keep ? 1 : 0);
}

registerUnit({
  ...footBase(),
  type: 'halberd', og: 'Halberd (ours)',
  radius: T.radius, mass: T.mass, maxHp: T.maxHp, melee: true, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  sightRange: T.sight, alertSightRange: T.sight, stickyTarget: true, reactionTime: T.reaction, minDistance: 0,
  drilled: false, intelligence: INT.Trained, brushSpacing: T.brushSpacing,
  look: { hat: true, attack: { time: 0.45 } },
  weapon: CHOP,
  init(world, u) { footInit(u); const b = u.b; b.charger = -1; b.setAt = -9; b.setHit = -9; u.cooldown = CHOP.cooldown * world.rng(); },
  brain: footBrain(brain),
});
