// Anthill: the colony's building. Stores the ants, hatches eggs, grows with digging and population, bursts open when
// destroyed (OG "Anthill" = {...Barrel, overrides}, Barrel = {...Soldier, ...}; game.js:12184-12238).
// Growth, eggs and the burst live in ants-system.js. In water it loses 30 x depth hp/s (TERRAIN water, OG game.js:735).
// Owner: ANIMALS.
import { registerUnit } from '../../defs.js';
import { S, fac, LOCO, INTEL, signed, sfx, rnd, setState, ensure } from './lib.js';
import { ALARM_TIME } from './ants-system.js';

registerUnit({
  type: 'anthill',
  og: 'Anthill', // OG game.js:12188
  swims: true, // OG game.js:14620
  faction: fac('Ants'), // OG game.js:12189
  prop: true, // OG game.js:12190
  unpaintable: true, // OG game.js:12191
  radius: 7, // OG game.js:12192 (radius: G; G = 7 at game.js:12177)
  radiusJitter: 0, // OG game.js:12193
  mass: 1000, // OG game.js:12194
  density: 99, // OG game.js:12195
  conductivity: 1, // OG game.js:12196
  maxHp: 150, // OG game.js:12197 (maxHp: z; z = 150 at game.js:12182)
  melee: false, // OG game.js:14629
  strength: 0, // OG game.js:14630
  locomotion: LOCO.Holonomic, // OG game.js:14631
  walkSpeed: 0, // OG game.js:14632
  runSpeed: 0, // OG game.js:14633
  maxSpeed: 0, // OG game.js:14634
  accel: 160, // OG game.js:14635
  decel: 500, // OG game.js:14636
  turnRate: 0, // OG game.js:14637
  turnSpeedFalloff: Infinity, // OG game.js:9927
  sightRange: 0, // OG game.js:14638
  alertSightRange: 0, // OG game.js:14639
  stickyTarget: false, // OG game.js:14640
  reactionTime: 0, // OG game.js:14641
  huntRange: 0, // OG game.js:14642
  minDistance: 0, // OG game.js:14643
  drilled: false, // OG game.js:14644
  intelligence: INTEL.Mindless, // OG game.js:14645
  infectable: false, // OG game.js:12200
  flammability: 0.35, // OG game.js:12198
  burnTime: 8, // OG game.js:12199
  brushSpacing: 40, // OG game.js:12201
  flock: {
    personalSpace: 1, // OG game.js:14650
    separation: 0, // OG game.js:14651
    alignment: 0, // OG game.js:14652
    cohesion: 0, // OG game.js:14653
    formation: 0, // OG game.js:14654
    herd: 0, // OG game.js:14655
    herdSpacing: 0, // OG game.js:14656
    flockByState: [0, 0, 0, 0, 0, 0], // OG game.js:14657
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:14658
  },
  morale: {
    baseline: 1, // OG game.js:12370
    oddsWeight: 0, // OG game.js:12371
    fearWeight: 0, // OG game.js:12372
    casualtyWeight: 0, // OG game.js:12373
    woundWeight: 0, // OG game.js:12374
    hitShock: 0, // OG game.js:12375
    suppression: 0, // OG game.js:12376
    canBreak: false, // OG game.js:12377
    breakAt: 0, // OG game.js:12378
    rallyAt: 1, // OG game.js:12379
    minFleeTime: 0, // OG game.js:12380
    dropRate: 1, // OG game.js:12381
    recoverRate: 1, // OG game.js:12382
    panicFear: 0, // OG game.js:12383
    deathFear: 0, // OG game.js:14660
  },
  look: {
    attack: {
      time: 0.1, // OG game.js:12208
      kick: 0, // OG game.js:12208
    },
  },
  // size 0, one entrance, mound turned a little (OG game.js:12210-12213; OG keeps these in aimX/aimY)
  init(w, u) {
    ensure(u);
    u.colony = u.colony || 0;
    u.b.size = 0; u.b.entrances = 1;
    u.wander = 0.3 * signed(w);
  },
  // stands still (OG game.js:12214-12217)
  brain(w, u) {
    u.goalX = 0; u.goalY = 0; u.face = u.heading;
    setState(u, S.IDLE);
  },
  // any damage: colony alarm 5 s, the attacker becomes the colony foe (OG game.js:12218-12224)
  onHit(w, u, amount, att) {
    const col = w.colonies, n = (u.colony || 0) - 1;
    if (n < 0 || !col) return;
    col.alarmUntil[n] = w.time + ALARM_TIME;
    if (att) col.foe[n] = att.id;
  },
  // 4 dust puffs (OG game.js:12227-12237); the burst itself is in ants-system.js
  onDeath(w, u) {
    for (let e = 0; e < 4; e++) {
      sfx(w, 'puff', u.x + signed(w) * u.radius, u.y + signed(w) * u.radius * 0.5, { kind: 'dust', angle: rnd(w) * Math.PI * 2, size: 0.9 });
    }
  },
});
