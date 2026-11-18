// Zombie (OG "Zombie", type 2): def + brain + bite. Rules 1:1 from OG game.js:12325-12439 (our own code).
// The same brain drives every zombie-body risen copy (risen.js), so it reads this def's numbers, as OG does.
import { registerUnit } from '../../defs.js';
import * as K from './_lib.js';

const Z = {
  type: 'zombie', og: 'Zombie', ogId: 2,                   // OG game.js:12326-12328, id game.js:8456
  category: 'mythical',                                    // OG game.js:12329
  deepWalker: true,                                        // OG game.js:12330
  waterPace: 0.6,                                          // OG game.js:12331
  faction: 2,                                              // OG game.js:12332 (Undead = 2, game.js:8373)
  radius: 8.63,                                            // OG game.js:12333
  radiusJitter: 0.1,                                       // OG game.js:12334
  mass: 1,                                                 // OG game.js:12335
  maxHp: 160,                                              // OG game.js:12336
  melee: true,                                             // OG game.js:12337
  strength: 0.5,                                           // OG game.js:12338
  locomotion: 0,                                           // OG game.js:12339 (Holonomic = 0, game.js:8508)
  walkSpeed: 66,                                           // OG game.js:12340
  runSpeed: 168,                                           // OG game.js:12341
  maxSpeed: 192,                                           // OG game.js:12342
  accel: 330,                                              // OG game.js:12343
  decel: 330,                                              // OG game.js:12344
  turnRate: 3.5,                                           // OG game.js:12345
  turnSpeedFalloff: Infinity,                              // OG game.js:12346
  sightRange: 260,                                         // OG game.js:12347
  alertSightRange: 260,                                    // OG game.js:12348
  stickyTarget: true,                                      // OG game.js:12349
  reactionTime: 0.6,                                       // OG game.js:12350
  huntRange: Infinity,                                     // OG game.js:12351
  minDistance: 0,                                          // OG game.js:12352
  drilled: false,                                          // OG game.js:12353
  intelligence: 0,                                         // OG game.js:12354 (Mindless = 0, game.js:8442)
  infectable: false,                                       // OG game.js:12355
  flammability: 0.6,                                       // OG game.js:12356
  brushSpacing: 21.12,                                     // OG game.js:12357
  flock: {                                                 // OG game.js:12358-12368
    personalSpace: 1.15, separation: 30, alignment: 0.15, cohesion: 0.25, formation: 0, herd: 0.3, herdSpacing: 14,
    flockByState: [1, 1, 0.2, 1, 0.2, 0], formationByState: [0, 0, 0, 0, 0, 0],
  },
  morale: {                                                // OG game.js:12369-12385
    baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 1, recoverRate: 1, panicFear: 0, deathFear: 0,
  },
  // Gameplay-read look fields only (colours, shapes and gait are art: ours). attack.time drives the attack decay.
  look: { attack: { time: 0.3 } },                         // OG game.js:12391

  init(world, u) {                                         // OG game.js:12394-12397
    u.wander = u.heading;
    u.cooldown = 1.1 * world.rng();
  },

  brain(world, u) {                                        // OG game.js:12398-12438
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.face = u.heading; return; }       // OG game.js:12400-12401
    const x = u.x, y = u.y;
    let t = K.target(world, u);                            // OG game.js:12404
    if (!t) t = K.nearestFrog(world, x, y, Z.sightRange);  // OG game.js:12405: hunt frogs (Props) within sight
    if (t) {
      const dx = t.x - x, dy = t.y - y, d = K.hypot(dx, dy) || 0.001;
      if (d <= u.radius + t.radius + 3) {                  // OG game.js:12409: contact
        K.setState(u, K.ST.ENGAGE);
        u.face = Math.atan2(dy, dx);
        u.goalX = (dx / d) * Z.walkSpeed * 0.5;            // OG game.js:12413-12414: push in at 0.5 walk
        u.goalY = (dy / d) * Z.walkSpeed * 0.5;
        K.circle(world, u, t, dx, dy, d, Z, 0.5, false);   // OG game.js:12415 (497.a, circle 0.5)
        if (u.cooldown <= 0) bite(world, u, t, dx / d, dy / d);
        return;
      }
      K.setState(u, K.ST.ADVANCE);                         // OG game.js:12429-12431
      const sp = d < 120 ? Z.runSpeed : Z.walkSpeed;
      K.pathTo(world, u, t.x, t.y, sp, u.los === 1 || K.wallCount(world) === 0);
      return;
    }
    if (K.pursue(world, u, Z.walkSpeed, 6)) return;        // OG game.js:12433 (447.a, memory 6 s)
    K.setState(u, K.ST.IDLE);                              // OG game.js:12434-12437: idle wander at 0.3 walk
    const i = K.idx(u);
    u.wander += 1.2 * Math.sin(world.time * (0.35 + ((0.618034 * i) % 1) * 0.4) + 2.39996 * i) * K.DT;
    u.goalX = Math.cos(u.wander) * Z.walkSpeed * 0.3;
    u.goalY = Math.sin(u.wander) * Z.walkSpeed * 0.3;
  },
};

// The bite (OG game.js:12416-12426): 16 dmg, push 45 × pass, stun 0.1, infection 0.8 × pass (timer 0 = turns this tick
// unless the victim's type waits for death), cooldown 1.1 s.
function bite(world, u, t, nx, ny) {
  const v = K.perch(world, t);                             // OG 412.B
  const m = K.damage(world, v, 16, u);                     // OG game.js:12421
  K.knock(world, v, nx, ny, 45 * m, 0.1);                  // OG game.js:12422
  K.infect(world, v, u, 0.8 * m, 0);                       // OG game.js:12423
  K.emit(world, 'strike', { x: u.x, y: u.y, v: 1, type: u.type });
  u.cooldown = 1.1;                                        // OG game.js:12425
  u.attack = 1;
}

registerUnit(Z);
