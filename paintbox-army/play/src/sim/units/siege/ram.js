// ram (OURS, Part 2 step 4): a covered battering ram on wheels, pushed by a crew of 4 (siegecrew at its sides). It rolls
// at the first wall between it and the enemy, else at the enemy, and rams every 1.8 s: pull back (b.act 1 `back`), then
// thrust (b.act 2 `thrust`): wall tiles within 26 px of the head take 260 (a fresh tile has 100), units in front take 60
// and are tossed forward. The roof shrugs off shots from range (x0.25; glancing bullets ricochet). Rolling fast it shoves
// people out of its way. Speed and ramming both need crew: x crew alive / 4, nothing with no crew.
// Possessed: the stick drives it (the crew run: 48 px/s), the attack rams whatever is in front.
import { registerUnit } from '../../defs.js';
import {
  A, act, alive, damage, push, toss, hyp, siegeOf, machineBase, machineInit, crewFactor, crewAlive, freeCrew, crewScaledStick,
  wallBetween, wallNear, hitWalls, objective, mayAttack, playerFiring, STATE as S, ENEMY,
} from './_lib.js';

const T = Object.freeze({
  radius: 18,          // STEP4 (long)
  maxHp: 900,          // STEP4
  mass: 15,            // STEP4
  walkSpeed: 18,       // STEP4: 18 px/s with a full crew
  possessSpeed: 48,    // the player's ram: the crew run (driving it has to be fun)
  maxSpeed: 52,
  accel: 70,           // heavy: slow to start and stop
  turnRate: 1.6,
  sight: 420,
  brushSpacing: 62,    // room for the crew
  strength: 3,
  crew: 4,             // STEP4
  // crew slots, machine-local [forward, left] x radius: two each side
  slots: [[-0.45, 1.6], [-0.45, -1.6], [0.5, 1.6], [0.5, -1.6]],
  roof: 0.25,          // shots from range (attacker > 60 px away) do x0.25: the roof
  roofFrom: 60,        // px
});
const RAM = Object.freeze({
  every: 1.8,          // STEP4: a blow every 1.8 s
  pull: 0.55,          // s pulled back (`back`) ...
  thrust: 0.3,         // ... then the thrust (`thrust`); the blow lands at its start
  head: 4,             // px past the radius: the ram's head
  wallR: 26,           // STEP4: wall tiles within 26 px of the head ...
  wallDmg: 260,        // ... take 260
  unitR: 16,           // units within 16 px (+ their radius) of the head ...
  unitDmg: 60,         // ... take 60 (STEP4) ...
  tossOut: 170,        // ... and are tossed forward ...
  tossUp: 230,         // ... up
  rollMul: 1.4,        // x1.4 when the ram is rolling faster than 25 px/s
  rollFrom: 25,
  reachWall: 20,       // AI: starts a blow when a wall tile is within 20 px of the head
  reachUnit: 12,       // AI: ... or an enemy within 12 px of the head
});
const SHOVE = Object.freeze({
  minSpeed: 26,        // px/s: rolling this fast it shoves people aside
  damage: 6,
  push: 170,
  stun: 0.35,
  again: 0.6,          // s: the same unit once per 0.6 s
});

const _pt = new Float32Array(2), _wp = new Float64Array(2);
function headOf(u, out) { const r = u.radius + RAM.head; out[0] = u.x + Math.cos(u.heading) * r; out[1] = u.y + Math.sin(u.heading) * r; return out; }

// The blow (thrust start).
let _bu = null, _bw = null, _bx = 0, _by = 0, _bk = 1, _bn = 0;
function blowOne(o) {
  if (o === _bu || !(o.hp > 0) || o.z > 10 || o.climb > 0) return;
  if (o.faction === _bu.faction) return;                                       // never its own side
  const d = hyp(o.x - _bx, o.y - _by);
  if (d > RAM.unitR + o.radius) return;
  const c = Math.cos(_bu.heading), s = Math.sin(_bu.heading);
  if ((o.x - _bu.x) * c + (o.y - _bu.y) * s < 0) return;                       // in front only
  const pass = damage(_bw, o, RAM.unitDmg * _bk, _bu, 'blow');
  if (o.hp > 0) toss(_bw, o, c, s, RAM.tossOut * _bk * pass, RAM.tossUp * _bk * pass);
  _bw.emit('strike', { x: o.x, y: o.y, v: 1.5, type: _bu.type });
  _bn++;
}
function blow(world, u) {
  headOf(u, _pt);
  const sp = hyp(u.vx, u.vy);
  _bu = u; _bw = world; _bx = _pt[0]; _by = _pt[1]; _bk = sp > RAM.rollFrom ? RAM.rollMul : 1; _bn = 0;
  world.query(_pt[0], _pt[1], RAM.unitR + 46, blowOne);
  const hits = _bn; _bu = null; _bw = null;
  const broke = hitWalls(world, _pt[0], _pt[1], RAM.wallR, RAM.wallDmg * _bk);
  if (broke > 0 || hits > 0 || wallNear(world, _pt[0], _pt[1], RAM.wallR)) world.emit('ram', { x: _pt[0], y: _pt[1], v: 1, walls: broke, units: hits, type: u.type });
  if (broke > 0) world.emit('land', { x: _pt[0], y: _pt[1], v: 18, type: 'ram' });   // crunch (thud) until a wood-crunch sound exists
  A.setAttack(u);
}
/** Pull back, then thrust; the blow lands at the thrust. Runs every tick. */
function cycle(world, u) {
  const b = u.b, t = world.time - b.ramAt;
  if (b.ramAt < 0) return;
  if (t < RAM.pull) { act(world, u, 1); return; }
  if (b.ramHit === 0) { b.ramHit = 1; act(world, u, 2); blow(world, u); return; }
  if (t < RAM.pull + RAM.thrust) { act(world, u, 2); return; }
  b.ramAt = -1; act(world, u, 0);
}
function startRam(world, u) {
  const b = u.b;
  if (b.ramAt >= 0 || u.cooldown > 0 || u.stun > 0 || crewAlive(world, u) === 0) return false;
  b.ramAt = world.time; b.ramHit = 0; u.cooldown = RAM.every;
  act(world, u, 1);
  return true;
}

// Rolling fast: people in front are shoved aside.
let _su = null, _sw = null;
function shoveOne(o) {
  const u = _su;
  if (o === u || !(o.hp > 0) || o.z > 6 || o.climb > 0 || o.faction === u.faction || o.def.machine || o.mass >= 8) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hyp(dx, dy) || 0.001;
  if (d > u.radius + o.radius + 2) return;
  const c = Math.cos(u.heading), s = Math.sin(u.heading);
  if (dx * c + dy * s < 0.3 * d) return;
  const b = u.b;
  for (let k = 0; k < 4; k++) if (b.shoveId[k] === o.id && _sw.time - b.shoveT[k] < SHOVE.again) return;
  b.shoveId[b.shoveK] = o.id; b.shoveT[b.shoveK] = _sw.time; b.shoveK = (b.shoveK + 1) & 3;
  const side = c * dy - s * dx >= 0 ? 1 : -1, px = 0.7 * c - s * side * 0.7, py = 0.7 * s + c * side * 0.7;
  const pass = damage(_sw, o, SHOVE.damage, u, 'blow');
  push(_sw, o, px, py, SHOVE.push * pass, SHOVE.stun * pass);
  _sw.emit('trample', { x: o.x, y: o.y, v: 0.6, type: u.type });
}
function shove(world, u) {
  if (hyp(u.vx, u.vy) < SHOVE.minSpeed) return;
  _su = u; _sw = world;
  world.query(u.x, u.y, u.radius + 46 + 2, shoveOne, ENEMY[u.faction]);
  _su = null; _sw = null;
}

function brain(world, u) {
  const b = u.b;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  cycle(world, u);
  if (u.stun > 0) return;
  const k = crewFactor(world, u);
  shove(world, u);
  if (u.possessed === 1 && !playerFiring(world, u)) { A.setState(u, S.IDLE); return; }   // the player drives; no blows
  const t = objective(world, u, 6, _pt);
  if (!(_pt[0] === _pt[0])) { A.setState(u, S.IDLE); return; }
  const speed = D.walkSpeed * k * (u.possessed === 1 ? D.possessSpeed / D.walkSpeed : 1);
  // the first wall between us and them: roll up to it and knock it down
  if (world.walls.count > 0 && wallBetween(world, u.x, u.y, _pt[0], _pt[1], _wp)) {
    const dx = _wp[0] - u.x, dy = _wp[1] - u.y, d = hyp(dx, dy) || 0.001;
    u.face = Math.atan2(dy, dx);
    A.setState(u, S.ADVANCE);
    headOf(u, _pt);
    if (wallNear(world, _pt[0], _pt[1], RAM.reachWall) && Math.abs(A.angDiff(u.heading, u.face)) < 0.5) { A.setState(u, S.ENGAGE); startRam(world, u); return; }
    if (d > u.radius) { u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed; }
    return;
  }
  if (!t) { A.setState(u, S.ADVANCE); A.pathTo(world, u, _pt[0], _pt[1], speed, false); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  headOf(u, _pt);
  const hd = hyp(t.x - _pt[0], t.y - _pt[1]);
  if (hd <= RAM.unitR + t.radius + RAM.reachUnit && Math.abs(A.angDiff(u.heading, u.face)) < 0.6) {
    A.setState(u, S.ENGAGE); A.markEngaged(world, u.group); startRam(world, u);
    // attack 3 (11-18): the AI starts a blow up to 12 px before the blow can land (it lands 0.55 s later, at the thrust),
    // but it also stopped rolling: a target standing in that 12 px band (a crewman beside the other ram, a man stepping
    // back) was rammed at thin air every 1.8 s for good. Keep rolling in until the head reaches it.
    if (hd > RAM.unitR + t.radius - 2) { u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed; }
    return;
  }
  A.setState(u, S.ADVANCE);
  A.pathTo(world, u, t.x, t.y, speed, A.hasLos(world, u));
}

const D = registerUnit({
  ...machineBase(),
  type: 'ram', og: 'Ram (ours)',
  radius: T.radius, radiusJitter: 0, mass: T.mass, maxHp: T.maxHp, strength: T.strength, melee: true,
  walkSpeed: T.walkSpeed, runSpeed: T.walkSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  possessSpeed: T.possessSpeed, sightRange: T.sight, alertSightRange: T.sight, brushSpacing: T.brushSpacing,
  deflects: true,      // glancing bullets ricochet off the roof
  crew: { n: T.crew, slots: T.slots },
  weapon: { range: 40, ram: RAM },
  init(world, u) {
    machineInit(world, u);
    const b = u.b; b.ramAt = -1; b.ramHit = 0; b.shoveId = new Int32Array(4).fill(-1); b.shoveT = new Float64Array(4); b.shoveK = 0;
    u.cooldown = 0.5 * world.rng();
  },
  brain,
  possessFire(world, u) { startRam(world, u); },
  possessMove(world, u, mx, my) { crewScaledStick(world, u, mx, my); },
  onHit(world, u, dealt, att, kind) {   // the roof: shots from range barely scratch it
    if (!att || (kind && kind !== 'blow') || !(dealt > 0) || hyp(att.x - u.x, att.y - u.y) < u.radius + att.radius + T.roofFrom) return;
    u.hp += dealt * (1 - T.roof);
  },
  onDeath(world, u) { freeCrew(world, u); },
});
