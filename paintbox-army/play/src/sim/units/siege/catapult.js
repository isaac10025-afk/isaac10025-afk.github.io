// catapult (OURS, Part 2 step 4): crew of 2, range 180-650, lobs a boulder (projectile `boulder`) in a high arc (over
// walls). It lands for 50 on everyone within 26 px and cracks wall tiles (80), then ROLLS on along its flight line up to
// 160 px, slowing: everyone in its path takes 35 and is knocked down (small ones tossed), it bounces off walls and stops
// against anything heavy. Reload 4.5 s (slower with crew missing, never with none).
// b.act 1 = loaded, 2 = fire (0.4 s, arm up). Possessed: fires at the aim (from 60 px), the stick drives it.
import { registerUnit } from '../../defs.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { depthAt } from '../../combat/env.js';
import { ENEMY } from '../../factions.js';
import {
  A, act, damage, push, toss, hyp, machineBase, machineInit, crewFactor, freeCrew, crewScaledStick, hitWalls, objective,
  playerFiring, STATE as S, DT,
} from './_lib.js';

const T = Object.freeze({
  radius: 16,          // STEP4
  maxHp: 500,          // STEP4
  mass: 10,            // STEP4
  walkSpeed: 20,       // STEP4 with a full crew
  possessSpeed: 40,    // the player's catapult
  maxSpeed: 44,
  accel: 60,
  turnRate: 1.4,
  sight: 680,          // sees as far as it throws
  brushSpacing: 56,
  strength: 2.5,
  crew: 2,             // STEP4
  slots: [[-1.55, 0.55], [-1.55, -0.55]],   // crew behind the arm
});
export const SHOT = Object.freeze({
  min: 180,            // STEP4 range 180-650
  max: 650,
  possessMin: 60,      // the player may drop one closer
  reload: 4.5,         // STEP4
  aim: 0.4,            // s laying the shot
  aimTolerance: 0.4,   // rad
  firePose: 0.4,       // STEP4: `fire` 0.4 s
  flightBase: 1.0,     // flight = 1 + dist / 700 s
  flightPer: 700,
  apexPer: 0.45,       // arc top = 0.45 x dist, at least 60
  apexMin: 60,
  scatterPer: 0.05,    // lands within (0.05 x dist + 6) px of the aim
  scatterBase: 6,
  // attack 3 (11-18): it shot at anything, own men or not: boulders landed on its own soldiers brawling with the target and
  // rolled on through them, and a dragon overhead got a boulder dropped on whoever stood under it (a boulder can't touch a
  // flyer: z > 12). Now it holds the shot while an own-side unit is near the landing or the roll, like OG's grenadier
  // (blast + 8), and never aims at a flyer up in the air.
  friendGap: 36,       // px round the aim point ...
  friendLane: 18,      // ... and either side of the 160 px roll after it
  skyZ: 30,            // a target higher than this is out of a boulder's reach
});
export const BOULDER = Object.freeze({
  r: 9,                // px: the rock
  landR: 26,           // STEP4: lands for 50 within 26 px
  landDmg: 50,
  landPush: 140,
  landStun: 0.4,
  wallR: 26,           // wall tiles within 26 px ...
  wallDmg: 80,         // ... take 80 (STEP4)
  rollDist: 160,       // STEP4: rolls on up to 160 px, slowing
  rollSpeed: 230,      // px/s as it starts rolling
  stopSpeed: 22,       // stops under this
  hitMin: 45,          // px/s: slower than this it no longer hurts
  hitDmg: 35,          // STEP4: 35 to everyone in its path ...
  hitStun: 0.9,        // ... knocked down 0.9 s ...
  hitPush: 220,
  smallMass: 2.5,      // ... under this mass tossed instead:
  tossOut: 150,
  tossUp: 240,
  slowPerHit: 0.82,    // speed x0.82 per body
  heavyMass: 8,        // mass 8+ or a machine: it stops dead against it (x0.25 speed, back)
  wallKeep: 0.5,       // bounces off walls at x0.5 speed
  wallBumpDmg: 25,     // and knocks 25 off the tile it hit
  waterDrag: 3,        // x3 slowing in water; sinks in deep water
  rest: 3,             // s it lies there after stopping
  seen: 8,             // remembers the last 8 bodies it hit
});

// ---------------------------------------------------------------- the boulder
let _w = null, _p = null, _own = null, _ux = 0, _uy = 0, _n = 0;
function landOne(o) {
  if (!(o.hp > 0) || o.z > 12 || o.climb > 0) return;
  const dx = o.x - _p.x, dy = o.y - _p.y, d = hyp(dx, dy);
  if (d > BOULDER.landR + o.radius * 0.5) return;
  const pass = damage(_w, o, BOULDER.landDmg, _own, 'blow', _p.x, _p.y);
  const nx = d > 0.001 ? dx / d : _ux, ny = d > 0.001 ? dy / d : _uy;
  if (o.hp > 0) push(_w, o, nx, ny, BOULDER.landPush * pass, BOULDER.landStun * pass);
  seen(_p, o.id);
  _n++;
}
function seen(p, id) { p.seen[p.seenK] = id; p.seenK = (p.seenK + 1) % BOULDER.seen; }
function wasSeen(p, id) { for (let k = 0; k < BOULDER.seen; k++) if (p.seen[k] === id) return true; return false; }
function land(world, p) {
  const v = hyp(p.vx, p.vy) || 1;
  _ux = p.vx / v; _uy = p.vy / v;
  const deep = depthAt(world, p.x, p.y) >= 0.75;
  world.emit('land', { x: p.x, y: p.y, v: 22, type: 'boulder', wet: deep ? 1 : 0 });   // STEP4 AUDIO: wet = a splash, no roll
  world.emit('puff', { kind: 'dust', x: p.x, y: p.y, ang: 0, size: 1.6 });
  if (deep) { world.emit('splash', { x: p.x, y: p.y, v: 2 }); return false; }   // sinks
  _w = world; _p = p; _own = p.owner >= 0 ? world.unitById(p.owner) : null; _n = 0;
  world.query(p.x, p.y, BOULDER.landR + 46, landOne);
  if (_n > 0 && world.stats) world.stats.hits = (world.stats.hits || 0) + _n;
  _w = null; _p = null; _own = null;
  hitWalls(world, p.x, p.y, BOULDER.wallR, BOULDER.wallDmg);
  if (world.walls.count > 0 && world.walls.isSolidAt(p.x, p.y)) return false;   // sat on a wall: no roll
  p.vx = _ux * BOULDER.rollSpeed; p.vy = _uy * BOULDER.rollSpeed;
  return true;
}
function rollOne(o) {
  const p = _p;
  if (!(o.hp > 0) || o.z > 10 || o.climb > 0 || o.id === p.owner || wasSeen(p, o.id)) return;
  if (hyp(o.x - p.x, o.y - p.y) > BOULDER.r + o.radius) return;
  seen(p, o.id);
  const v = hyp(p.vx, p.vy) || 1, ux = p.vx / v, uy = p.vy / v;
  if (o.def.machine || o.def.prop || o.mass >= BOULDER.heavyMass) {   // stops against it, bumps it
    damage(_w, o, BOULDER.hitDmg * Math.min(1, v / BOULDER.rollSpeed), _own, 'blow', p.x - ux * 20, p.y - uy * 20);
    p.vx = -ux * v * 0.25; p.vy = -uy * v * 0.25;
    _w.emit('bounce', { x: p.x, y: p.y, v: 1, type: o.type, snd: 'boulder' });   // STEP4 AUDIO: snd = the boulder
    return true;
  }
  const pass = damage(_w, o, BOULDER.hitDmg, _own, 'blow', p.x - ux * 20, p.y - uy * 20);
  if (o.hp > 0) {
    if (o.mass < BOULDER.smallMass) toss(_w, o, ux, uy, BOULDER.tossOut * pass, BOULDER.tossUp * pass);
    else push(_w, o, ux, uy, BOULDER.hitPush * pass, BOULDER.hitStun * pass);
  }
  _w.emit('trample', { x: o.x, y: o.y, v: 1, type: 'boulder' });
  if (_w.stats) _w.stats.hits = (_w.stats.hits || 0) + 1;
  p.vx *= BOULDER.slowPerHit; p.vy *= BOULDER.slowPerHit;
}
function roll(world, p, i) {
  let v = hyp(p.vx, p.vy);
  const decel = (BOULDER.rollSpeed * BOULDER.rollSpeed) / (2 * BOULDER.rollDist), wet = depthAt(world, p.x, p.y);
  if (wet >= 0.75) { world.emit('splash', { x: p.x, y: p.y, v: 1.5 }); removeProjectile(world, i); return; }
  v -= decel * DT * (wet >= 0.05 ? BOULDER.waterDrag : 1);
  if (v <= BOULDER.stopSpeed) { rest(p); return; }
  const k = v / (hyp(p.vx, p.vy) || 1); p.vx *= k; p.vy *= k;
  let nx = p.x + p.vx * DT, ny = p.y + p.vy * DT;
  const W = world.walls;
  if (W.count > 0 && W.isSolidAt(nx, ny)) {                            // bounce off the wall
    hitWalls(world, nx, ny, 5, BOULDER.wallBumpDmg);
    if (!W.isSolidAt(nx, p.y)) { p.vy = -p.vy; } else if (!W.isSolidAt(p.x, ny)) { p.vx = -p.vx; } else { p.vx = -p.vx; p.vy = -p.vy; }
    p.vx *= BOULDER.wallKeep; p.vy *= BOULDER.wallKeep;
    world.emit('bounce', { x: p.x, y: p.y, v: 1, snd: 'boulder' });   // STEP4 AUDIO
    nx = p.x; ny = p.y;
  }
  if (nx < BOULDER.r || ny < BOULDER.r || nx > world.W - BOULDER.r || ny > world.H - BOULDER.r) { rest(p); return; }
  p.px = p.x; p.py = p.y; p.x = nx; p.y = ny;
  if (v >= BOULDER.hitMin) {
    _w = world; _p = p; _own = p.owner >= 0 ? world.unitById(p.owner) : null;
    world.query(p.x, p.y, BOULDER.r + 46, rollOne);
    _w = null; _p = null; _own = null;
  }
}
function rest(p) { const v = hyp(p.vx, p.vy) || 1; p.vx = (p.vx / v) * 1e-3; p.vy = (p.vy / v) * 1e-3; p.roll = 2; p.life = BOULDER.rest; }
function stepBoulder(world, p, i) {
  if (p.roll === 2) { p.px = p.x; p.py = p.y; p.life -= DT; if (p.life <= 0) removeProjectile(world, i); return; }
  if (p.roll === 1) { roll(world, p, i); return; }
  p.px = p.x; p.py = p.y;
  p.x = Math.min(world.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(world.H, Math.max(0, p.y + p.vy * DT));
  const f = 1 - p.life / p.maxLife; p.z = 4 * p.apex * f * (1 - f);
  p.life -= DT;
  if (p.life > 0) return;
  p.z = 0;
  if (land(world, p)) p.roll = 1; else { removeProjectile(world, i); }
}
registerProjectileKind('boulder', stepBoulder);

function fire(world, u, tx, ty) {
  const b = u.b, ex = tx - u.x, ey = ty - u.y, o = hyp(ex, ey) || 1, sc = SHOT.scatterPer * o + SHOT.scatterBase;
  const hx = tx + A.tri(world) * sc, hy = ty + A.tri(world) * sc;
  const sx = u.x + (ex / o) * u.radius * 0.6, sy = u.y + (ey / o) * u.radius * 0.6, dist = hyp(hx - sx, hy - sy);
  const fl = SHOT.flightBase + dist / SHOT.flightPer;
  const p = spawnProjectile(world, 'boulder', sx, sy, (hx - sx) / fl, (hy - sy) / fl, fl, BOULDER.landDmg, u.faction, u);
  if (!p) return null;
  p.apex = Math.max(SHOT.apexMin, SHOT.apexPer * dist); p.roll = 0;
  if (!p.seen) p.seen = new Int32Array(BOULDER.seen);
  p.seen.fill(-1); p.seenK = 0;
  b.reload = SHOT.reload; b.fireAt = world.time; b.aimAt = -1;
  act(world, u, 2); A.setAttack(u);
  world.emit('throw', { x: u.x, y: u.y, v: 2, type: u.type });
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1;
  return p;
}

// An enemy within [min, max] when the target is too close or up in the air (cap 32 looked at).
const ALT = new Array(32);
function altTarget(world, u, min, max) {
  const n = world.queryMask(u.x, u.y, max, ENEMY[u.faction], ALT, 32);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) { const o = ALT[k]; ALT[k] = null; if (!(o.hp > 0) || o.z > SHOT.skyZ) continue; const d = hyp(o.x - u.x, o.y - u.y); if (d >= min && d < bd) { bd = d; best = o; } }
  return best;
}
// attack 3: an own-side unit near the landing point (ax, ay) or along the roll after it (direction from the catapult)?
let _fu = null, _fx = 0, _fy = 0, _fdx = 0, _fdy = 0, _fh = false;
function friendOne(o) {
  if (_fh || o === _fu || !(o.hp > 0) || o.faction !== _fu.faction || o.z > 12) return;
  const rx = o.x - _fx, ry = o.y - _fy, along = rx * _fdx + ry * _fdy;
  if (hyp(rx, ry) <= SHOT.friendGap + o.radius * 0.5) { _fh = true; return true; }
  if (along > 0 && along < BOULDER.rollDist && Math.abs(rx * _fdy - ry * _fdx) <= SHOT.friendLane + o.radius) { _fh = true; return true; }
}
function friendInWay(world, u, ax, ay) {
  const dx = ax - u.x, dy = ay - u.y, d = hyp(dx, dy) || 1;
  _fu = u; _fx = ax; _fy = ay; _fdx = dx / d; _fdy = dy / d; _fh = false;
  world.query(ax + _fdx * BOULDER.rollDist * 0.5, ay + _fdy * BOULDER.rollDist * 0.5, BOULDER.rollDist * 0.5 + SHOT.friendGap + 46, friendOne);
  _fu = null;
  return _fh;
}

const _pt = new Float32Array(2);
function brain(world, u) {
  const b = u.b, k = crewFactor(world, u);
  if (b.reload > 0 && k > 0) { b.reload -= DT * k; if (b.reload < 0) b.reload = 0; }
  act(world, u, world.time - b.fireAt < SHOT.firePose ? 2 : b.reload <= 0 && k > 0 ? 1 : 0);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) return;
  if (u.possessed === 1 && !playerFiring(world, u)) { A.setState(u, S.IDLE); b.aimAt = -1; return; }
  let t = objective(world, u, 6, _pt);
  if (!(_pt[0] === _pt[0])) { A.setState(u, S.IDLE); b.aimAt = -1; return; }
  const speed = (u.possessed === 1 ? D.possessSpeed : D.walkSpeed) * k, min = u.possessed === 1 ? SHOT.possessMin : SHOT.min;
  if (!t) { A.setState(u, S.ADVANCE); A.pathTo(world, u, _pt[0], _pt[1], speed, false); return; }
  let dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  if (t.z > SHOT.skyZ && u.possessed !== 1) {   // attack 3: a flyer up there: a ground target instead, else wait
    const alt = altTarget(world, u, min, SHOT.max);
    if (!alt) { A.setState(u, S.ALERT); u.face = Math.atan2(dy, dx); b.aimAt = -1; return; }
    t = alt; dx = t.x - u.x; dy = t.y - u.y; d = hyp(dx, dy) || 0.001;
  }
  if (d < min) {
    const alt = altTarget(world, u, min, SHOT.max);
    if (alt) { t = alt; dx = t.x - u.x; dy = t.y - u.y; d = hyp(dx, dy) || 0.001; }
    else if (u.possessed !== 1) { A.setState(u, S.ALERT); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * speed; u.goalY = (-dy / d) * speed; b.aimAt = -1; return; }
  }
  if (d > SHOT.max) { b.aimAt = -1; A.setState(u, S.ADVANCE); A.pathTo(world, u, t.x, t.y, speed, A.hasLos(world, u)); return; }
  A.setState(u, S.ENGAGE); A.markEngaged(world, u.group);
  const fl = SHOT.flightBase + d / SHOT.flightPer, ax = t.x + t.vx * fl, ay = t.y + t.vy * fl;
  u.face = Math.atan2(ay - u.y, ax - u.x);
  if (b.reload > 0 || k === 0) { b.aimAt = -1; return; }
  if (b.aimAt < 0) b.aimAt = world.time;
  if (world.time - b.aimAt >= SHOT.aim && Math.abs(A.angDiff(u.heading, u.face)) <= SHOT.aimTolerance && (u.possessed === 1 || !friendInWay(world, u, ax, ay))) fire(world, u, ax, ay);
}

const D = registerUnit({
  ...machineBase(),
  type: 'catapult', og: 'Catapult (ours)',
  radius: T.radius, radiusJitter: 0, mass: T.mass, maxHp: T.maxHp, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.walkSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  possessSpeed: T.possessSpeed, sightRange: T.sight, alertSightRange: T.sight, brushSpacing: T.brushSpacing, minDistance: SHOT.min,
  crew: { n: T.crew, slots: T.slots },
  weapon: { range: SHOT.max, shot: SHOT, boulder: BOULDER },
  init(world, u) { machineInit(world, u); const b = u.b; b.reload = 1 + world.rng(); b.fireAt = -9; b.aimAt = -1; },
  brain,
  possessFire(world, u, aim, ax, ay) {
    const b = u.b;
    if (b.reload > 0 || u.stun > 0 || crewFactor(world, u) === 0) return;
    let dx = ax - u.x, dy = ay - u.y, d = hyp(dx, dy);
    if (!(d > 0.001)) { dx = Math.cos(aim); dy = Math.sin(aim); d = 1; }
    const r = Math.min(SHOT.max, Math.max(SHOT.possessMin, d));
    fire(world, u, u.x + (dx / d) * r, u.y + (dy / d) * r);
  },
  possessMove(world, u, mx, my) { crewScaledStick(world, u, mx, my); },
  onDeath(world, u) { freeCrew(world, u); },
});
