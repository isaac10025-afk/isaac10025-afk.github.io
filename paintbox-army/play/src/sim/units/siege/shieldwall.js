// shieldwall (OURS, Part 2 step 4): tower-shield line. A stroke forms a tight drilled block (CORE-A formation, like the
// legion's) that marches in step but never breaks into a charge: it presses in behind its shields and jabs.
// Tower shield: 90 % of shots from the front are blocked (def.shield, CORE-B blockFrac). It braces against chargers:
// cavalry, boars, a trike, a pouncing raptor running into a braced shield bounce off and are stunned 0.5 s (and
// trampling riders take the OG brace damage, 80). b.act 1 = braced (STEP4 pose `brace`).
import { registerUnit } from '../../defs.js';
import { blockFrac } from '../../combat/damage.js';
import { A, act, findCharger, stillCharging, mayAttack, footBase, footInit, footBrain, hyp, STATE as S, INT } from './_lib.js';

const T = Object.freeze({
  radius: 9,           // STEP4 (OG-raw, x1.1 on register)
  maxHp: 160,          // STEP4
  mass: 2,             // STEP4
  walkSpeed: 48,       // STEP4
  runSpeed: 90,        // STEP4
  maxSpeed: 110,
  accel: 360,
  turnRate: 5,
  sight: 300,
  reaction: 0.15,
  brushSpacing: 15,    // tight line (legion 18.98)
  strength: 1.1,
  shieldArc: 0.35,     // cos threshold: blocks within +-70 deg of the facing (STEP4 "arc 1.0" read as a cos would block nothing)
  shieldBlock: 0.9,    // STEP4: 90 % of a frontal hit
  brace: 80,           // STEP4: OG brace damage to a trampling rider
});
const JAB = Object.freeze({
  damage: 10,          // STEP4 sword jab 10
  jitter: 2,
  reachGap: 10,        // reach = r + r_target + 10
  band: 10,            // engage band past reach
  approach: 0.6,       // step in at 0.6 x walk
  push: 70,
  stun: 0.12,
  cooldown: 0.8,
  cdJit: 0.3,
  facing: 0.6,
  circle: 0.4,         // a wall barely circles
  press: 70,           // px: in contact, a drilled block presses at an enemy this close
  close: 150,          // px: out of contact, a man whose own target is this close steps out of the march and walks straight
                       // at it. attack 3 (11-18): the block marched in step along its front only, so a rifleman backing off at
                       // 45 px/s stayed ahead of it, and once he was cornered the block jammed against the field edge 80-100 px
                       // short (81 shields v 1 rifleman: never ended, every seed)
  memory: 5,
});
const BRACE = Object.freeze({
  R: 170,              // px: watches for chargers this far
  minSpeed: 140,       // px/s: a charger runs at least this fast (cavalry, boar, trike; not a legion's 108-132 run) ...
  cos: 0.8,            // ... straight at us (within ~37 deg)
  scanEvery: 6,        // ticks between charger scans
  hold: 0.6,           // s: stays braced after the threat passes
  touch: 5,            // px: contact gap for the bounce
  keep: 0.35,          // the charger bounces back at 0.35 x its speed ...
  stun: 0.5,           // ... stunned 0.5 s (STEP4)
  again: 0.8,          // s: same charger bounces at most once per 0.8 s
});

function bounce(world, u, c) {
  const b = u.b;
  if (b.bounced === c.id && world.time - b.bouncedAt < BRACE.again) return;
  b.bounced = c.id; b.bouncedAt = world.time;
  c.vx = -c.vx * BRACE.keep; c.vy = -c.vy * BRACE.keep;
  if (c.stun < BRACE.stun) c.stun = BRACE.stun;
  if (c.state === S.CHARGE) A.setState(c, S.ENGAGE);
  world.emit('block', { x: u.x, y: u.y, v: 1, type: u.type });
  world.emit('bounce', { x: c.x, y: c.y, v: 1, type: c.type });
}

function jab(world, u, t, dx, dy, d) {
  if (u.cooldown > 0 || Math.abs(A.angDiff(u.heading, Math.atan2(dy, dx))) > JAB.facing) return;
  A.strike(world, u, t, dx / d, dy / d, JAB.damage + JAB.jitter * (2 * world.rng() - 1), JAB.push, JAB.stun);
  A.setAttack(u); u.cooldown = JAB.cooldown + JAB.cdJit * world.rng();
}

const _pt = new Float32Array(2);
function brain(world, u) {
  const b = u.b;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; act(world, u, 0); return; }
  const t = A.targetOf(world, u);
  if (u.state === S.FLEE) { act(world, u, 0); A.flee(world, u, t, D.runSpeed); return; }
  // brace: watch for anyone running at us
  let c = b.charger >= 0 ? world.unitById(b.charger) : null;
  if (c && !stillCharging(u, c, BRACE.minSpeed * 0.5, 0.5, BRACE.R)) c = null;
  if (!c && mayAttack(world, u) && (world.tick + u.index) % BRACE.scanEvery === 0) c = findCharger(world, u, BRACE.R, BRACE.minSpeed, BRACE.cos);
  b.charger = c ? c.id : -1;
  if (c) { b.braceUntil = world.time + BRACE.hold; b.braceX = c.x; b.braceY = c.y; }
  if (world.time < b.braceUntil && mayAttack(world, u)) {
    act(world, u, 1);
    A.setState(u, S.ENGAGE);
    u.face = Math.atan2(b.braceY - u.y, b.braceX - u.x);
    if (c && hyp(c.x - u.x, c.y - u.y) <= u.radius + c.radius + BRACE.touch && blockFrac(u, c.x, c.y) > 0) bounce(world, u, c);
    if (t) { const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001; if (d <= u.radius + t.radius + JAB.reachGap) jab(world, u, t, dx, dy, d); }
    return;
  }
  const g = u.group, G = world.groups, drilled = A.grpAlive(world, g) && G.drilled[g] === 1;
  if (t) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001, reach = u.radius + t.radius + JAB.reachGap;
    if (d <= reach + JAB.band) {
      act(world, u, 0);
      A.setState(u, S.ENGAGE); A.markEngaged(world, g);
      u.face = Math.atan2(dy, dx);
      if (d > reach) { u.goalX = (dx / d) * D.walkSpeed * JAB.approach; u.goalY = (dy / d) * D.walkSpeed * JAB.approach; u.pathing = 1; }   // attack 3: the slot pull out-pulled this step in: men stood 1-10 px short of reach for good
      else jab(world, u, t, dx, dy, d);
      A.circle(u, t, dx, dy, d, D, JAB.circle, true);
      A.oddsPush(world, u, t, dx, dy, d, D);
      return;
    }
    if (!drilled || (G.inContact[g] === 1 && d < JAB.press) || d < JAB.close || u.possessed === 1) {   // press in behind the shield
      act(world, u, 0);
      A.advance(world, u, t, dx, dy, A.hasLos(world, u), D.walkSpeed);
      u.pathing = 1;   // attack 3: out of the formation pull while pressing (the slot pull, capped at the walk speed, cancelled the press)
      return;
    }
  }
  if (drilled) {                                   // march in step along the group front; halted = hold the line, braced
    const f = G.front[g];
    u.face = f;
    if (G.marching[g] === 0) { act(world, u, G.inContact[g] === 1 ? 1 : 0); A.setState(u, G.inContact[g] === 1 ? S.ADVANCE : S.IDLE); return; }
    act(world, u, 0);
    A.setState(u, S.ADVANCE);
    const ox = G.objX[g], oy = G.objY[g];
    if (A.anyWalls(world) && !A.wallLine(world, u.x, u.y, ox, oy)) { A.pathTo(world, u, ox, oy, D.walkSpeed, false); return; }
    u.goalX = Math.cos(f) * D.walkSpeed; u.goalY = Math.sin(f) * D.walkSpeed;
    return;
  }
  act(world, u, 0);
  if (!A.contactPoint(world, u, t, JAB.memory, _pt)) { A.setState(u, S.IDLE); return; }
  const ax = _pt[0] - u.x, ay = _pt[1] - u.y;
  if (hyp(ax, ay) < 24) { A.setState(u, S.IDLE); return; }
  A.setState(u, S.ADVANCE);
  u.face = Math.atan2(ay, ax);
  A.pathTo(world, u, _pt[0], _pt[1], D.walkSpeed, !A.anyWalls(world) || A.wallLine(world, u.x, u.y, _pt[0], _pt[1]));
}

const D = registerUnit({
  ...footBase(),
  type: 'shieldwall', og: 'Shield Wall (ours)',
  radius: T.radius, mass: T.mass, maxHp: T.maxHp, melee: true, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  sightRange: T.sight, alertSightRange: T.sight, stickyTarget: true, reactionTime: T.reaction, minDistance: 0,
  drilled: true, intelligence: INT.Trained, brushSpacing: T.brushSpacing, flammability: 0.25,
  shield: { arc: T.shieldArc, block: T.shieldBlock, brace: T.brace },
  flock: { personalSpace: 1.05, separation: 26, alignment: 0.1, cohesion: 0, formation: 4, herd: 0, herdSpacing: 0,
    flockByState: [1, 1, 0.2, 1, 0.2, 0.3], formationByState: [1, 1, 0.6, 1, 0, 0] },   // tight drilled block (legion: 30 / 3)
  morale: { baseline: 0.95, oddsWeight: 0.25, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.12, rallyAt: 0.45, minFleeTime: 2, dropRate: 1.6, recoverRate: 0.4, panicFear: 0.2, deathFear: 0.4 },  // steady
  look: { hat: true, attack: { time: 0.3 } },
  weapon: JAB,
  init(world, u) { footInit(u); const b = u.b; b.charger = -1; b.braceUntil = -1; b.braceX = u.x; b.braceY = u.y; b.bounced = -1; b.bouncedAt = -9; u.cooldown = JAB.cooldown * world.rng(); },
  brain: footBrain(brain),
  // A charger that hits the shield face (a trampling rider, a boar) bounces off even if the brain didn't see it coming.
  onHit(world, u, dealt, att, kind) {
    if (!att || kind === 'blast' || kind === 'fire' || u.hp <= 0 || u.stun > 0 || !mayAttack(world, u)) return;
    if (hyp(att.vx, att.vy) < BRACE.minSpeed || hyp(att.x - u.x, att.y - u.y) > u.radius + att.radius + BRACE.touch + 4) return;
    if (blockFrac(u, att.x, att.y) > 0) { u.b.braceUntil = world.time + BRACE.hold; u.b.braceX = att.x; u.b.braceY = att.y; act(world, u, 1); bounce(world, u, att); }
  },
});
