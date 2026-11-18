// legion (OG "Roman", type 5): slow shield block. A stroke forms a drilled grid (CORE-A formation), faces the enemy,
// marches in step and charges as a group when contact is near. Front ±60° blocks 65%; trampling riders take brace
// damage. OG def + brain game.js:4527-4677.
import { registerUnit } from '../../defs.js';
import {
  S, FACTION, LOCO, INTEL, setState, targetOf, hasLos, flee, angDiff, strike, setAttack, circle, oddsPush, pathTo,
  contactPoint, markEngaged, grpAlive, wallLine, minesBlock, emit, anyWalls,
} from './_shared.js';
import * as C from '../../const.js';

// Sword (inline in OG, game.js:4598-4637).
const SWORD = Object.freeze({
  reachGap: 14, // reach = r + r_target + 14 (OG game.js:4619)
  bandGap: 10, // engage band = reach + 10 (OG game.js:4620)
  approach: 0.6, // beyond reach: step in at 0.6·walkSpeed (OG game.js:4626)
  facing: 0.5, // strike only within 0.5 rad (OG game.js:4628)
  damage: 38, // 38 + 5·signed() (OG game.js:4631)
  damageJitter: 5, // OG game.js:4631
  push: 130, // 130·m (OG game.js:4632)
  stun: 0.2, // 0.2·m (OG game.js:4632)
  cooldown: 0.9, // 0.9 + 0.3·next() (OG game.js:4635)
  cooldownJitter: 0.3, // OG game.js:4635
  initCooldown: 0.9, // init 0.9·next() (OG game.js:4598)
  circle: 1, // circling ×1 with back-step (OG game.js:4637)
});
const CHARGE_AT = 90; // a drilled group charges when a member's target is under 90 px (OG game.js:4615)
const MEMORY = 5; // contact memory for the charge / walk point (OG game.js:4648, 4663)
const _pt = new Float32Array(2);

const D = registerUnit({
  type: 'legion',
  og: 'Roman', // OG game.js:4530
  key: 'roman', // OG game.js:4529
  category: 'army',
  waterPace: 0.55, // OG game.js:4531
  faction: FACTION.Romans, // OG game.js:4532
  radius: 8.63, // OG game.js:4533
  radiusJitter: 0.05, // OG game.js:4534
  mass: 1.4, // OG game.js:4535
  conductivity: 1.8, // OG game.js:4536
  maxHp: 130, // OG game.js:4537
  melee: true, // OG game.js:4538
  strength: 0.9, // OG game.js:4539
  locomotion: LOCO.Holonomic, // OG game.js:4540
  walkSpeed: 54, // OG game.js:4541
  runSpeed: 108, // OG game.js:4542
  maxSpeed: 132, // OG game.js:4543
  accel: 360, // OG game.js:4544
  decel: 360, // OG game.js:4545
  turnRate: 5, // OG game.js:4546
  turnSpeedFalloff: Infinity, // OG game.js:4547
  sightRange: 300, // OG game.js:4548
  alertSightRange: 300, // OG game.js:4549
  stickyTarget: true, // OG game.js:4550
  reactionTime: 0.12, // OG game.js:4551
  huntRange: Infinity, // OG game.js:4552
  minDistance: 0, // OG game.js:4553
  drilled: true, // OG game.js:4554
  intelligence: INTEL.Trained, // OG game.js:4555
  shield: { arc: 0.5, block: 0.65, brace: 40 }, // OG game.js:4556
  infectable: true, // OG game.js:4557
  flammability: 0.25, // OG game.js:4558
  brushSpacing: 18.98, // OG game.js:4559
  flock: {
    personalSpace: 1.1, // OG game.js:4561
    separation: 30, // OG game.js:4562
    alignment: 0.1, // OG game.js:4563
    cohesion: 0, // OG game.js:4564
    formation: 3, // OG game.js:4565
    herd: 0, // OG game.js:4566
    herdSpacing: 0, // OG game.js:4567
    flockByState: [1, 1, 0.2, 1, 0.2, 0.3], // OG game.js:4568
    formationByState: [1, 1, 0.6, 1, 0, 0], // OG game.js:4569
  },
  morale: {
    baseline: 0.92, // OG game.js:4572
    oddsWeight: 0.4, // OG game.js:4573
    fearWeight: 0, // OG game.js:4574
    casualtyWeight: 0, // OG game.js:4575
    woundWeight: 0, // OG game.js:4576
    hitShock: 0, // OG game.js:4577
    suppression: 0, // OG game.js:4578
    canBreak: true, // OG game.js:4579
    breakAt: 0.2, // OG game.js:4580
    rallyAt: 0.5, // OG game.js:4581
    minFleeTime: 2, // OG game.js:4582
    dropRate: 2.5, // OG game.js:4583
    recoverRate: 0.35, // OG game.js:4584
    panicFear: 0.3, // OG game.js:4585
    deathFear: 0.5, // OG game.js:4586
  },
  look: {
    hat: true, // OG game.js:4590
    attack: { time: 0.35 }, // OG game.js:4595
  },
  weapon: SWORD, // ours: the sword numbers, for readers
  init(world, u) { u.cooldown = SWORD.initCooldown * world.rng(); }, // OG game.js:4597-4599
  brain(world, u) { // OG game.js:4600-4676
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.face = u.heading; return; }
    const t = targetOf(world, u);
    if (u.state === S.FLEE) { flee(world, u, t, D.runSpeed); return; }
    const x = u.x, y = u.y, g = u.group, G = world.groups;
    const drilled = grpAlive(world, g) && G.drilled[g] === 1;
    if (t) {
      const dx = t.x - x, dy = t.y - y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if (drilled && d < CHARGE_AT && G.charging[g] === 0) { // the whole group charges (OG game.js:4615-4618)
        G.charging[g] = 1;
        emit(world, 'charge', { x: G.cx[g], y: G.cy[g], v: G.size[g], type: u.type });
      }
      const reach = u.radius + t.radius + SWORD.reachGap; // OG game.js:4619
      if (d <= reach + SWORD.bandGap) { // OG game.js:4620
        setState(u, S.ENGAGE); markEngaged(world, g); // OG game.js:4621
        const a = Math.atan2(dy, dx);
        u.face = a;
        if (d > reach) { u.goalX = (dx / d) * D.walkSpeed * SWORD.approach; u.goalY = (dy / d) * D.walkSpeed * SWORD.approach; } // OG game.js:4626
        else if (u.cooldown <= 0 && Math.abs(angDiff(u.heading, a)) < SWORD.facing) { // OG game.js:4627-4628
          strike(world, u, t, dx / d, dy / d, SWORD.damage + SWORD.damageJitter * (2 * world.rng() - 1), SWORD.push, SWORD.stun); // OG game.js:4629-4634
          u.cooldown = SWORD.cooldown + SWORD.cooldownJitter * world.rng(); setAttack(u); // OG game.js:4635
        }
        circle(u, t, dx, dy, d, D, SWORD.circle, true); // OG game.js:4637
        oddsPush(world, u, t, dx, dy, d, D); // OG game.js:4638
        return;
      }
    }
    if (drilled && G.charging[g] === 1) { // group charge: run at runSpeed (OG game.js:4642-4649)
      setState(u, S.CHARGE);
      if (t) { u.face = Math.atan2(t.y - y, t.x - x); pathTo(world, u, t.x, t.y, D.runSpeed, hasLos(world, u)); }
      else if (contactPoint(world, u, null, MEMORY, _pt)) pathTo(world, u, _pt[0], _pt[1], D.runSpeed, false);
      return;
    }
    if (drilled) { // face the group front; march along it (OG game.js:4650-4661)
      const f = G.front[g];
      u.face = f;
      if (G.marching[g] === 0) { setState(u, G.inContact[g] === 1 ? S.ADVANCE : S.IDLE); return; }
      setState(u, S.ADVANCE);
      const ox = G.objX[g], oy = G.objY[g];
      if ((anyWalls(world) && !wallLine(world, x, y, ox, oy)) || minesBlock(world, x, y, ox, oy, u.radius + C.MINE_AVOID)) {
        pathTo(world, u, ox, oy, D.walkSpeed, false); return; // OG game.js:4657-4659
      }
      u.goalX = Math.cos(f) * D.walkSpeed; u.goalY = Math.sin(f) * D.walkSpeed; // OG game.js:4660
      return;
    }
    // Not drilled (a turned or stray Roman): walk to contact / intel / target, Idle within 24 px (OG game.js:4663-4676).
    if (!contactPoint(world, u, t, MEMORY, _pt)) { setState(u, S.IDLE); return; }
    const ax = _pt[0] - x, ay = _pt[1] - y;
    if (Math.sqrt(ax * ax + ay * ay) < 24) { setState(u, S.IDLE); return; }
    setState(u, S.ADVANCE);
    u.face = Math.atan2(ay, ax);
    pathTo(world, u, _pt[0], _pt[1], D.walkSpeed, !anyWalls(world) || wallLine(world, x, y, _pt[0], _pt[1]));
  },
});
