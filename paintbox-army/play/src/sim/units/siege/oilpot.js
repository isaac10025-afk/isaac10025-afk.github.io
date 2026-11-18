// oilpot (OURS, Part 2 step 4): carries 3 pots of hot oil. Lobs one (projectile `oilpot`, a high arc that clears walls)
// 60-200 px; it shatters into a burning puddle (CORE-B oil grid + fire) and splashes whoever it lands on. Prefers enemies
// behind walls, then clumps. Out of pots it fights with the ladle (6). b.act 1 = throw, 2 = out of pots (`empty`).
import { registerUnit } from '../../defs.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { getOil } from '../../combat/oil.js';
import { igniteNow } from '../../combat/fire.js';
import { ENEMY } from '../../factions.js';
import { A, act, damage, meleeBrain, footBase, footInit, footBrain, hyp, STATE as S, INT, DT } from './_lib.js';

const T = Object.freeze({
  radius: 9,           // STEP4
  maxHp: 100,          // STEP4
  mass: 1,             // STEP4
  walkSpeed: 75,       // STEP4
  runSpeed: 120,       // STEP4
  maxSpeed: 140,
  accel: 600,
  turnRate: 6,
  sight: 300,
  reaction: 0.3,
  brushSpacing: 21,
  strength: 0.7,
  minDistance: 70,
});
export const POT = Object.freeze({
  pots: 3,             // STEP4: carries 3
  range: 200,          // STEP4: lobs 60-200 px
  min: 60,
  flightBase: 0.5,     // flight = 0.5 + dist / 420 s
  flightPer: 420,
  apexPer: 0.45,       // arc top = 0.45 x dist ...
  apexMin: 45,         // ... at least 45 px (clears any wall)
  scatterPer: 0.06,    // landing scatter (0.06 x dist + 3) x (2 - morale)
  scatterBase: 3,
  cooldown: 1.6,       // s between throws ...
  cdJit: 0.4,          // ... + up to 0.4
  aimTolerance: 0.35,  // rad
  throwPose: 0.4,      // s of the `throw` pose
  behindWall: 4,       // target score x4 for an enemy with no line of sight (behind a wall)
  pick: 24,            // enemies looked at per throw
  // the pot breaking
  puddles: 6,          // oil poured at 6 points ...
  oilEach: 0.5,        // ... 0.5 each (a barrel spills 8 x 0.75)
  oilR: 14,            // ... within 14 px
  igniteR: 20,         // the puddle is lit within 20 px
  splashR: 16,         // units within 16 px (+ their radius / 2) ...
  splashDmg: 8,        // ... take 8 and catch fire
  burn: 5,             // s of burning on whoever is splashed
});
const LADLE = Object.freeze({
  damage: 6, jitter: 1, reachGap: 8, push: 40, stun: 0.08, cooldown: 0.8, cdJit: 0.3, facing: 0.6, runUnder: 80, circle: 1, memory: 5,
});

// ---------------------------------------------------------------- the pot
function shatter(world, p) {
  let x = p.x, y = p.y;
  if (world.walls.count > 0 && world.walls.isSolidAt(x, y)) {           // landed on a wall: falls off on the far side
    const v = hyp(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v;
    let ok = false;
    for (let s = 4; s <= 28 && !ok; s += 4) { if (!world.walls.isSolidAt(x + ux * s, y + uy * s)) { x += ux * s; y += uy * s; ok = true; } }
    for (let s = 4; s <= 28 && !ok; s += 4) { if (!world.walls.isSolidAt(x - ux * s, y - uy * s)) { x -= ux * s; y -= uy * s; ok = true; } }
  }
  const oil = getOil(world);
  for (let k = 0; k < POT.puddles; k++) {
    const a = (k / POT.puddles) * Math.PI * 2 + world.rng() * 0.8, r = k === 0 ? 0 : POT.oilR * (0.35 + 0.65 * world.rng());
    oil.pour(x + Math.cos(a) * r, y + Math.sin(a) * r, POT.oilEach);
  }
  oil.cells = Math.max(oil.cells, 1);                                   // let ignite() see the fresh oil this tick
  oil.ignite(x, y, POT.igniteR);
  const own = p.owner >= 0 ? world.unitById(p.owner) : null;
  _sx = x; _sy = y; _sw = world; _so = own;
  world.query(x, y, POT.splashR + 46, splashOne);
  _sw = null; _so = null;
  world.emit('splash', { x, y, v: 0.5, oil: 1 });
  world.emit('ignite', { x, y, v: 10 });
  world.emit('puff', { kind: 'smoke', x, y, ang: 0, size: 1 });
}
let _sx = 0, _sy = 0, _sw = null, _so = null;
function splashOne(u) {
  if (!(u.hp > 0) || u.z > 6 || u.climb > 0) return;
  if (hyp(u.x - _sx, u.y - _sy) > POT.splashR + u.radius * 0.5) return;
  damage(_sw, u, POT.splashDmg, _so, 'fire', _sx, _sy);
  igniteNow(_sw, u, POT.burn);
}
function stepPot(world, p, i) {
  p.px = p.x; p.py = p.y;
  p.x = Math.min(world.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(world.H, Math.max(0, p.y + p.vy * DT));
  const f = 1 - p.life / p.maxLife; p.z = 4 * p.apex * f * (1 - f);
  p.life -= DT;
  if (p.life > 0) return;
  p.z = 0;
  shatter(world, p);
  removeProjectile(world, i);
}
registerProjectileKind('oilpot', stepPot);

function lob(world, u, tx, ty) {
  const b = u.b, ex = tx - u.x, ey = ty - u.y, o = hyp(ex, ey) || 1;
  const sc = (POT.scatterPer * o + POT.scatterBase) * (2 - u.morale);
  const hx = tx + A.tri(world) * sc, hy = ty + A.tri(world) * sc;
  const sx = u.x + (ex / o) * u.radius, sy = u.y + (ey / o) * u.radius, dist = hyp(hx - sx, hy - sy), fl = POT.flightBase + dist / POT.flightPer;
  const p = spawnProjectile(world, 'oilpot', sx, sy, (hx - sx) / fl, (hy - sy) / fl, fl, POT.splashDmg, u.faction, u);
  if (!p) return null;
  p.apex = Math.max(POT.apexMin, POT.apexPer * dist);
  // no dodge warning: it's a pot of oil coming over a wall, not a lit grenade
  b.pots--; A.setAttack(u); u.cooldown = POT.cooldown + POT.cdJit * world.rng();
  act(world, u, 1); b.throwAt = world.time;
  world.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type });
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1;
  return p;
}

// Best throw target: enemies within range, behind walls first (x4), then the target, then near ones.
const PICK = new Array(POT.pick);
function pickThrow(world, u, t) {
  const n = world.queryMask(u.x, u.y, POT.range, ENEMY[u.faction], PICK, POT.pick);
  let best = null, bs = 0;
  for (let k = 0; k < n; k++) {
    const o = PICK[k]; PICK[k] = null;
    if (!(o.hp > 0) || o.z > 30 || o.burning > 0) continue;
    const d = hyp(o.x - u.x, o.y - u.y);
    if (d < POT.min || d > POT.range) continue;
    let s = 1 / (1 + d / 200);
    if (world.walls.count > 0 && !world.walls.lineOfSight(u.x, u.y, o.x, o.y)) s *= POT.behindWall;
    if (o === t) s *= 1.5;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}

function brain(world, u) {
  const b = u.b;
  if (b.pots <= 0) { act(world, u, 2); meleeBrain(world, u, LADLE); return; }
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  act(world, u, world.time - b.throwAt < POT.throwPose ? 1 : 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = A.targetOf(world, u);
  if (u.state === S.FLEE) { A.flee(world, u, t, D.runSpeed); return; }
  if (!t) { if (A.followContact(world, u, D.walkSpeed, 4)) return; A.setState(u, S.IDLE); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  // the throw: an enemy in reach (behind a wall first)
  let aim = b.aimId >= 0 ? world.unitById(b.aimId) : null;
  if (!aim || !(aim.hp > 0) || (world.tick + u.index) % 15 === 0) { aim = pickThrow(world, u, t); b.aimId = aim ? aim.id : -1; }
  if (!aim) {
    if (d < POT.min) { A.setState(u, S.ENGAGE); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * D.walkSpeed; u.goalY = (-dy / d) * D.walkSpeed; return; }
    A.advance(world, u, t, dx, dy, A.hasLos(world, u), D.walkSpeed); return;
  }
  A.setState(u, S.ENGAGE);
  const fl = POT.flightBase + hyp(aim.x - u.x, aim.y - u.y) / POT.flightPer, ax = aim.x + aim.vx * fl, ay = aim.y + aim.vy * fl;
  const a = Math.atan2(ay - u.y, ax - u.x);
  u.face = a;
  A.sidestep(u, t, dx, dy, d, D);
  if (u.cooldown <= 0 && Math.abs(A.angDiff(u.heading, a)) <= POT.aimTolerance) lob(world, u, ax, ay);
}

const D = registerUnit({
  ...footBase(),
  type: 'oilpot', og: 'Oil Pot (ours)',
  radius: T.radius, mass: T.mass, maxHp: T.maxHp, melee: false, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  sightRange: T.sight, alertSightRange: T.sight, stickyTarget: false, reactionTime: T.reaction, minDistance: T.minDistance,
  drilled: false, intelligence: INT.Trained, brushSpacing: T.brushSpacing, flammability: 0.45,
  look: { hat: true, attack: { time: 0.4 } },
  weapon: POT,
  init(world, u) { footInit(u); const b = u.b; b.pots = POT.pots; b.throwAt = -9; b.aimId = -1; u.cooldown = 0.6 * world.rng(); },
  brain: footBrain(brain),
  // Possessed, nobody in the aim: lob at the aim point (60-200 px), or ladle when out of pots.
  possessFire(world, u, aim, ax, ay) {
    if (u.stun > 0 || u.cooldown > 0) return;
    if (u.b.pots <= 0) { u.attack = 1; u.cooldown = LADLE.cooldown; return; }
    let dx = ax - u.x, dy = ay - u.y, d = hyp(dx, dy);
    if (!(d > 0.001)) { dx = Math.cos(aim); dy = Math.sin(aim); d = 1; }
    const r = Math.min(POT.range, Math.max(POT.min, d));
    lob(world, u, u.x + (dx / d) * r, u.y + (dy / d) * r);
  },
});
