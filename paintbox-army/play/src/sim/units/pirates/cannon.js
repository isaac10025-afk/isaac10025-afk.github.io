// cannon (OURS, Pirates tab): a crewed gun on a wooden carriage (crew: 2 spawned `gunner`s). Range 500. Fires a flat
// cannonball (projectile `cannonball`, 520 px/s): 80 to the first unit, then on through up to 4 units at ×0.6 each.
// The ball flies low (everyone in the line is hit), comes down ~300 px out: on land it bounces and rolls on; on water it
// SKIPS like a stone (up to 3 times) and keeps hitting; it sinks on the 4th touch. Walls stop it and take 60.
// Moves at 18 × crew alive / 2; fires only with someone at a slot. Wood: burns. Machines can't be raised.
// b.act: 1 fire (0.4 s) → `fire` (recoil + smoke); rolling → `roll0`/`roll1` (art, from its speed).
import { registerUnit } from '../../defs.js';
import { F, INT } from '../../factions.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { depthAt, hooks, submerged, WET, splatNoise } from '../../combat/env.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import {
  initB, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, CB, MACHINE_MORALE, MACHINE_FLOCK, losClear,
  crewInit, crewCount, claimSlots, hittable, ownerOf, outside, raycast, COMMON,
} from './_lib.js';

const T = {
  hp: 420, // hit points
  mass: 9, // can't be tossed (≥ 8)
  speed: 18, // px/s with the full crew (× crew alive / crew)
  possessSpeed: 30, // px/s when the player drives it (the crew haul it at a run)
  turnRate: 1.6, // rad/s turning the carriage
  crew: 2, // gunners spawned with it
  range: 500, // px
  reload: 4, // s with the full crew (× crew / manning: one gunner = 8 s)
  aimTol: 0.07, // rad: fires once laid this well
  spread: 0.025, // rad ± (triangular)
  firePose: 0.4, // s of the `fire` pose (b.act 1)
  recoil: 45, // shove back on the carriage
  flammability: 0.5, // wood
};
// The cannonball (shared with the ship's broadsides).
export const BALL = {
  speed: 520, // px/s
  damage: 80, // to the first unit
  keep: 0.6, // damage × 0.6 per unit passed
  pen: 4, // units it can hit
  skips: 3, // skips on water
  z0: 8, // px muzzle height
  firstTouch: 300, // px from the muzzle where it first comes down (sets its upward speed)
  gravity: 200, // px/s² (a low, flat flight: apex ≈ 13 px)
  hitH: 2.1, // hits a unit while lower than its z + 2.1 × radius
  ballR: 3, // px ball radius for the hit test
  landKeepV: 0.35, // land touchdown: keeps 0.35 of its fall speed as a hop
  landKeepS: 0.7, // ... and 0.7 of its ground speed
  rollAt: 30, // px/s: a hop slower than this = rolling
  rollDecel: 380, // px/s² rolling friction
  rollStop: 45, // px/s: stops (thud) below this
  rollDmg: 1.4, // a rolling ball hits for damage × min(1, 1.4 × speed / 520), at least 0.35
  rollDmgMin: 0.35, // -
  skipKeepV: 0.6, // water skip: bounces up with 0.6 of its fall speed ...
  skipMinV: 60, // ... at least 60 px/s
  skipKeepS: 0.8, // ... and keeps 0.8 of its ground speed
  tossMass: 4, // lighter units hit hard are tossed
  tossAt: 30, // dealt damage at which they fly
  tossOut: 1.6, // px/s outward per damage
  tossUp: 2.2, // px/s up per damage
  push: 3, // shove per damage (heavier units)
  stun: 0.25, // s
  slow: 0.85, // ball speed × 0.85 per unit hit
  heavy: 8, // a unit this heavy (mass) stops the ball
  wallH: 16, // px: lower than this, walls stop it
  wallR: 14, // px: wall tiles within this of the impact take damage (terrain's blast falloff)
  wallDmg: 60, // wall damage at the impact
  life: 6, // s safety
};
BALL.vz0 = (0.5 * BALL.gravity * (BALL.firstTouch / BALL.speed) ** 2 - BALL.z0) / (BALL.firstTouch / BALL.speed);

// ---------------------------------------------------------------- cannonball projectile
// p.z height, p.drop vertical speed, p.apex 0 flying / 1 rolling, p.bounces skips left, p.pen hits left,
// p.passed / p.host / p.hostSplit / p.wild = the last 4 units hit (never hit twice).
const HCAP = 4, _hu = new Array(HCAP).fill(null), _ht = new Float64Array(HCAP);
let _w = null, _p = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _F = 1, _n = 0, _wallT = Infinity;
function seen(p, id) { return p.passed === id || p.host === id || p.hostSplit === id || p.wild === id; }
function remember(p, id) { p.wild = p.hostSplit; p.hostSplit = p.host; p.host = p.passed; p.passed = id; }
function ballSweep(u) {
  const p = _p;
  if (!(u.hp > 0) || seen(p, u.id) || !hittable(p, u) || submerged(_w, u)) return;
  if (p.z > (u.z || 0) + BALL.hitH * u.radius || p.z + 6 < (u.z || 0)) return;          // over it / under a flyer
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (t >= _wallT) return;
  const qx = ox - _dx * t, qy = oy - _dy * t, R = u.radius + BALL.ballR;
  if (qx * qx + qy * qy >= R * R) return;
  let k;                                                                                 // keep the HCAP nearest, in order
  if (_n < HCAP) k = _n++;
  else if (t < _ht[HCAP - 1]) k = HCAP - 1;
  else return;
  while (k > 0 && _ht[k - 1] > t) { _ht[k] = _ht[k - 1]; _hu[k] = _hu[k - 1]; k--; }
  _ht[k] = t; _hu[k] = u;
}
// One unit hit: damage, knock, wear the ball down. Returns true when the ball stops.
function ballHit(world, p, u, nx, ny) {
  const rolling = p.apex === 1, sp = hypot(p.vx, p.vy);
  const f = rolling ? Math.max(BALL.rollDmgMin, Math.min(1, (BALL.rollDmg * sp) / BALL.speed)) : 1, dmg = p.damage * f;
  const pass = CB.damage(world, u, dmg, ownerOf(world, p), 'blow', u.x - nx * 30, u.y - ny * 30);
  const dealt = dmg * pass;
  if (u.hp > 0 && u.mass < BALL.tossMass && dealt >= BALL.tossAt) CB.toss(world, u, nx, ny, BALL.tossOut * dealt, BALL.tossUp * dealt);
  else CB.push(world, u, nx, ny, BALL.push * dealt, BALL.stun * pass);
  if (dealt >= 50) CB.hatKnock(world, u, nx, ny);
  world.emit(pass < 0.5 ? 'ricochet' : 'bullethit', { x: u.x, y: u.y, v: Math.min(2, dmg / 30), type: u.type, snd: 'ball' }); // STEP4 AUDIO: snd = the ball
  if (world.stats) world.stats.hits++;
  remember(p, u.id);
  p.damage *= BALL.keep; p.pen--; p.vx *= BALL.slow; p.vy *= BALL.slow;
  return p.pen <= 0 || u.mass >= BALL.heavy || !!u.def.untossable;
}
function stepBall(world, p, i) {
  const x0 = p.x, y0 = p.y;
  p.px = x0; p.py = y0;
  const rolling = p.apex === 1;
  if (rolling) {
    const sp = hypot(p.vx, p.vy), ns = sp - BALL.rollDecel * DT;
    if (ns < BALL.rollStop) { world.emit('land', { x: x0, y: y0, v: 0.5, snd: 'ball' }); removeProjectile(world, i); return; } // STEP4 AUDIO
    p.vx *= ns / sp; p.vy *= ns / sp;
  } else { p.drop -= BALL.gravity * DT; p.z += p.drop * DT; }
  const dx = p.vx * DT, dy = p.vy * DT, F = dx * dx + dy * dy || 1e-6, len = Math.sqrt(F);
  const wall = p.z < BALL.wallH && world.walls.count > 0 ? raycast(world, x0, y0, x0 + dx, y0 + dy) : Infinity;
  _w = world; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F; _n = 0; _wallT = wall;
  world.query(x0 + dx / 2, y0 + dy / 2, len / 2 + 46 + BALL.ballR, ballSweep);
  const n = _n; _w = null; _p = null;
  for (let k = 0; k < n; k++) {
    const u = _hu[k]; _hu[k] = null;
    if (!u || !(u.hp > 0)) continue;
    if (ballHit(world, p, u, dx / len, dy / len)) { for (let j = k + 1; j < n; j++) _hu[j] = null; removeProjectile(world, i); return; }
  }
  if (wall <= 1) {                                                                       // a wall: tiles take the hit, ball stops
    const wx = x0 + dx * wall + (dx / len) * 4, wy = y0 + dy * wall + (dy / len) * 4;
    if (hooks.wallBlast) hooks.wallBlast(world, wx, wy, BALL.wallR, BALL.wallDmg);
    world.emit('ricochet', { x: wx, y: wy, v: 1, snd: 'ball' });   // STEP4 AUDIO
    world.emit('puff', { kind: 'dust', x: wx, y: wy, ang: Math.atan2(-dy, -dx), size: 1 });
    removeProjectile(world, i); return;
  }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || outside(world, p.x, p.y)) { removeProjectile(world, i); return; }
  if (rolling) {
    if (depthAt(world, p.x, p.y) >= WET) { world.emit('splash', { x: p.x, y: p.y, v: 0.8 }); removeProjectile(world, i); }
    return;
  }
  if (p.z > 0) return;
  p.z = 0;                                                                               // touchdown
  if (depthAt(world, p.x, p.y) >= WET) {
    if (p.bounces <= 0) { world.emit('splash', { x: p.x, y: p.y, v: 1.2 }); removeProjectile(world, i); return; }
    p.bounces--;                                                                         // skip like a stone
    p.drop = Math.max(BALL.skipMinV, -p.drop * BALL.skipKeepV);
    p.vx *= BALL.skipKeepS; p.vy *= BALL.skipKeepS;
    world.emit('splash', { x: p.x, y: p.y, v: 0.7, skip: 1 });
    world.emit('puff', { kind: 'splash', x: p.x, y: p.y, ang: -Math.PI / 2, size: 0.8 });
    return;
  }
  const up = -p.drop * BALL.landKeepV;
  p.vx *= BALL.landKeepS; p.vy *= BALL.landKeepS;
  world.emit('bounce', { x: p.x, y: p.y, v: 1, snd: 'ball' });   // STEP4 AUDIO
  world.emit('puff', { kind: 'dust', x: p.x, y: p.y, ang: Math.atan2(p.vy, p.vx), size: 0.7 });
  if (hooks.grenadeLanded) hooks.grenadeLanded(world, p.x, p.y);
  if (up < BALL.rollAt) { p.apex = 1; p.drop = 0; } else p.drop = up;
}
registerProjectileKind('cannonball', stepBall);

/** fireBall(world, u, x, y, angle): one cannonball from (x, y) along angle, owned by u (cannon or ship). */
export function fireBall(world, u, x, y, ang) {
  const p = spawnProjectile(world, 'cannonball', x, y, Math.cos(ang) * BALL.speed, Math.sin(ang) * BALL.speed, BALL.life, BALL.damage, u.faction, u);
  if (!p) return null;
  p.z = BALL.z0; p.drop = BALL.vz0; p.apex = 0; p.bounces = BALL.skips; p.pen = BALL.pen;
  p.passed = -1; p.host = -1; p.hostSplit = -1; p.wild = -1;
  world.emit('muzzle', { x: x + Math.cos(ang) * 6, y, ang, size: 2.6 });
  return p;
}
function fire(world, u, aim) {
  const r = u.radius, a = aim + T.spread * (world.rng() - world.rng());
  fireBall(world, u, u.x + Math.cos(a) * r * 1.25, u.y + Math.sin(a) * r * 1.25, a);
  world.emit('shot', { x: u.x, y: u.y, v: 2, type: u.type });
  splatNoise(world, u.x, u.y, 1, 520);
  CB.push(world, u, -Math.cos(a), -Math.sin(a), T.recoil * u.mass, 0);
  u.attack = 1; u.firedAt = world.time; u.b.reload = T.reload;
  if (world.stats) world.stats.shots++;
  setAct(world, u, 1);
}

const D = registerUnit({
  type: 'cannon',
  og: 'Cannon (ours)', // no OG original
  category: 'pirates',
  faction: F.Side,
  radius: 13, // OG-raw
  radiusJitter: 0,
  mass: T.mass,
  maxHp: T.hp,
  melee: false,
  strength: 3,
  locomotion: 0,
  walkSpeed: T.speed,
  runSpeed: T.speed,
  maxSpeed: T.possessSpeed,
  possessSpeed: T.possessSpeed,
  accel: 120,
  decel: 160,
  turnRate: T.turnRate,
  turnSpeedFalloff: Infinity,
  sightRange: 520,
  alertSightRange: 540,
  stickyTarget: true,
  reactionTime: 0.4,
  huntRange: Infinity,
  minDistance: 0,
  drilled: false,
  intelligence: INT.Trained,
  infectable: false, // a machine: no zombie, no raise
  machine: true, // OURS flag: never raised / turned (risen copies skip it)
  raisable: false,
  flammability: T.flammability,
  brushSpacing: 40,
  flock: MACHINE_FLOCK,
  morale: MACHINE_MORALE,
  look: { attack: { time: 0.4 } },
  weapon: { range: T.range }, // for possess (aim reach) and readers
  init(world, u) {
    initB(u); u.plagueFree = 1;
    u.b.reload = world.rng() * T.reload * 0.5;
    crewInit(world, u, T.crew, 'gunner');
  },
  brain(world, u) {
    const b = u.b;
    if (b.act === 1 && actAge(world, u) > T.firePose) setAct(world, u, 0);
    u.dodgeTime = 0;                                         // a cannon doesn't dodge grenades
    const crew = crewCount(world, u), k = crew / b.crew.length;
    claimSlots(world, u);
    if (b.reload > 0 && b.manN > 0) b.reload -= DT * b.manN / b.crew.length;
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) return;
    const t = targetOf(world, u);
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
      const r = u.state === STATE.ENGAGE ? T.range * 1.05 : T.range;
      if (d > r) { setState(u, STATE.ADVANCE); moveTo(world, u, t.x, t.y, T.speed * k, losClear(world, u)); u.face = Math.atan2(dy, dx); return; }
      setState(u, STATE.ENGAGE);
      const lead = d / BALL.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
      u.face = aim;
      if (b.manN > 0 && b.reload <= 0 && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) fire(world, u, aim);
      return;
    }
    if (k > 0 && followGroup(world, u, T.speed * k, COMMON.memory)) return;
    setState(u, STATE.IDLE);
  },
  // possessed: the crew haul it at the player's pace, as fast as the crew left allows; attack = fire at the aim
  possessMove(world, u) { const k = u.b.crew ? u.b.crewN / u.b.crew.length : 0; u.goalX *= k; u.goalY *= k; },
  possessFire(world, u, aim) {
    if (u.b.manN > 0 && u.b.reload <= 0 && Math.abs(angleDiff(u.heading, aim)) < T.aimTol * 2) fire(world, u, aim);
  },
});
export default D;
export { T };
