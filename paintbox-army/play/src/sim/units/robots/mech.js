// mech (OURS, Robots tab): a big walker. Can't be tossed (and at mass 14 barely pushed), ignores stuns, wades through
// water (no short-out). ROCKETS: a target 160-420 px away gets a salvo of 4 (projectile `rocket`, a slight arc, 0.15 s
// apart, each bursts r 30 for 35 where it comes down), reload 5 s; it keeps walking while it fires. STOMP: an enemy
// within r + 20 → the foot comes down on it (0.25 s lift): 60 under the foot, and a ring r 50 round the foot: 25 +
// knocked down 0.5 s; every 2 s. Heavy steps make noise (event `step`, heavy 1).
// b.act: 1 salvo → `rockets` (pods open); 2 stomp → `stomp`. Projectile `rocket`: p.z height (px), p.apex arc top.
import { robot, initB, setAct, actAge, begin, shortOut, targetOf, idle, closeOn, mayAttack, touchable, losClear, ownerOf, outside, hypot, STATE, DT, CB, ENEMY, setState, ROBOT } from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { solidAt, hooks } from '../../combat/env.js';

const T = {
  hp: 1600, // hit points
  mass: 14, // barely pushed (and untossable)
  walk: 30, // px/s
  run: 55, // px/s
  rangeMin: 160, // px: rockets from here ...
  rangeMax: 420, // px: ... to here
  salvo: 4, // rockets per salvo
  gap: 0.15, // s between rockets
  reload: 5, // s from the first rocket of a salvo to the next salvo
  salvoPose: 0.35, // s the pods stay open after the last rocket
  rocket: {
    speed: 380, // px/s
    apexPer: 0.12, // arc top = 0.12 × distance + apexMin (a slight arc)
    apexMin: 8, // px
    podH: 22, // px: launch height (the shoulder pods)
    scatterPer: 0.05, // aim scatter (0.05 × distance + scatterMin) px
    scatterMin: 6, // px
    low: 12, // px: lower than this, walls stop it
    lead: 0.6, // × flight time: leads a moving target
  },
  blast: {
    radius: 30, // px
    damage: 35, // at the centre (falls off to 0.3)
    minFalloff: 0.3, // edge keeps 30 %
    push: 160, // shove
    stun: 0.3, // s
    tossUp: 260, // light people fly
    tossSpeed: 120, // px/s outward
    tossFrom: 0.5, // toss when falloff × pass ≥ 0.5
    hatChance: 0.4, // hats fly
    noiseRadius: 300, // px
  },
  friendGap: 14, // attack 3 (11-18): no salvo with an own-side unit within blast radius + 14 of the aim (OG grenadier: + 8).
  // Salvos used to go off into its own line whenever the target stood among them (5 mechs v a dragon diving on them: ~800 hp
  // of own mech lost to its own rockets)
  stompReach: 20, // px past both radii: an enemy this close gets stomped
  stompEvery: 2, // s between stomps
  stompLift: 0.25, // s the foot is up before it lands
  stompPose: 0.5, // s of the `stomp` pose
  stompDmg: 60, // under the foot
  ringR: 50, // px round the foot
  ringDmg: 25, // in the ring (all of it)
  knock: 0.5, // s knocked down in the ring
  ringPush: 220, // shove outward (÷ mass)
  stepEvery: 0.55, // s between heavy steps while walking
  stepNoise: 0.5, // noise splat per step ...
  stepNoiseR: 220, // ... this wide
  waterPace: 0.75, // wades: speed × 0.75 in any water
};
const BLAST = CB.registerBlast('rocket', Object.freeze({ ...T.blast }));
const R = T.rocket;

// ---------------------------------------------------------------- rocket projectile (p.z height, p.apex arc top, p.rise launch height)
function stepRocket(world, p, i) {
  p.px = p.x; p.py = p.y;
  const nx = p.x + p.vx * DT, ny = p.y + p.vy * DT, f = 1 - p.life / p.maxLife;
  p.z = 4 * p.apex * f * (1 - f) + p.rise * (1 - f);
  if (p.z < R.low && world.walls.count > 0 && solidAt(world, nx, ny)) {
    CB.explode(world, p.x, p.y, BLAST, ownerOf(world, p), p.damage);
    removeProjectile(world, i); return;
  }
  p.x = nx; p.y = ny; p.life -= DT;
  if (p.life > 0 && !outside(world, nx, ny)) return;
  p.z = 0;
  CB.explode(world, p.x, p.y, BLAST, ownerOf(world, p), p.damage);
  removeProjectile(world, i);
}
registerProjectileKind('rocket', stepRocket);

function fireRocket(world, u) {
  const b = u.b, side = (b.salvo & 1) ? 1 : -1, c = Math.cos(u.heading), s = Math.sin(u.heading);
  const sx = u.x - s * side * u.radius * 0.6, sy = u.y + c * side * u.radius * 0.6;   // left / right pod in turn
  let tx = b.ax, ty = b.ay;
  const dist = hypot(tx - sx, ty - sy), sc = R.scatterPer * dist + R.scatterMin;
  tx += sc * (world.rng() - world.rng()); ty += sc * (world.rng() - world.rng());
  const d = Math.max(20, hypot(tx - sx, ty - sy)), fl = d / R.speed;
  const p = spawnProjectile(world, 'rocket', sx, sy, ((tx - sx) / d) * R.speed, ((ty - sy) / d) * R.speed, fl, BLAST.damage, u.faction, u);
  if (p) { p.blast = BLAST; p.apex = R.apexPer * d + R.apexMin; p.rise = R.podH; p.z = R.podH; p.smoky = 1; p.trail = 1; }
  world.emit('shot', { x: sx, y: sy, v: 1.2, type: u.type, rocket: 1 });
  world.emit('muzzle', { x: sx, y: sy - R.podH, ang: Math.atan2(ty - sy, tx - sx), size: 0.8 });
  CB.splatNoise(world, u.x, u.y, 0.4, BLAST.noiseRadius);
  if (world.stats) world.stats.shots++;
  u.attack = 1; u.firedAt = world.time;
  b.salvo--; b.next = world.time + T.gap;
}
let _fu = null, _fh = false;
function friendOne(o) { if (!_fh && o !== _fu && o.hp > 0 && o.faction === _fu.faction && !o.def.prop) { _fh = true; return true; } }
function friendNear(world, u, x, y) { _fu = u; _fh = false; world.query(x, y, BLAST.radius + T.friendGap, friendOne); _fu = null; return _fh; }
function startSalvo(world, u, ax, ay) {
  const b = u.b;
  b.salvo = T.salvo; b.next = world.time; b.ax = ax; b.ay = ay; b.reloadAt = world.time + T.reload;
  setAct(world, u, 1);
}
function salvoStep(world, u) {
  const b = u.b;
  if (b.salvo <= 0) { if (b.act === 1 && world.time - b.next >= T.salvoPose - T.gap) setAct(world, u, 0); return; }
  if (world.time < b.next) return;
  const t = u.possessed === 1 ? null : targetOf(world, u);   // a driven mech keeps the player's aim point
  if (t) { const fl = hypot(t.x - u.x, t.y - u.y) / R.speed * R.lead; b.ax = t.x + t.vx * fl; b.ay = t.y + t.vy * fl; }
  fireRocket(world, u);
}

// ---------------------------------------------------------------- stomp
const SQ = new Array(64).fill(null);
function stompVictim(world, u) {
  const o = world.findNearest(u.x, u.y, u.radius + ROBOT.margin + T.stompReach, ENEMY[u.faction], u, 1);
  return o && o.hp > 0 && touchable(o) && hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + T.stompReach ? o : null;
}
function startStomp(world, u, v) {
  const b = u.b;
  b.victim = v.id; b.st0 = world.time; b.landed = 0; b.nextStomp = world.time + T.stompEvery;
  b.fx = v.x; b.fy = v.y;
  setAct(world, u, 2);
  setState(u, STATE.ENGAGE);
  u.face = Math.atan2(v.y - u.y, v.x - u.x);
}
function stompHit(world, u) {
  const b = u.b, v = b.victim >= 0 ? world.unitById(b.victim) : null;
  if (v && v.hp > 0 && touchable(v) && hypot(v.x - u.x, v.y - u.y) <= u.radius + v.radius + T.stompReach + 10) { b.fx = v.x; b.fy = v.y; }
  const fx = b.fx, fy = b.fy;
  if (v && v.hp > 0 && touchable(v) && hypot(v.x - fx, v.y - fy) <= v.radius + 4) CB.damage(world, v, T.stompDmg, u, undefined, fx, fy);   // from above: shields don't help
  const n = world.queryMask(fx, fy, T.ringR + ROBOT.margin, ENEMY[u.faction], SQ, SQ.length);
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (o === v || !(o.hp > 0) || !touchable(o)) continue;
    const dx = o.x - fx, dy = o.y - fy, d = hypot(dx, dy) || 0.001;
    if (d > T.ringR + o.radius) continue;
    CB.damage(world, o, T.ringDmg, u, undefined, fx, fy);
    if (o.hp > 0) CB.push(world, o, dx / d, dy / d, T.ringPush, T.knock);
  }
  if (v && v.hp > 0) CB.stun(world, v, T.knock);
  b.landed = 1; u.attack = 1;
  CB.splatNoise(world, fx, fy, 1, 300);
  if (hooks.iceHarm) hooks.iceHarm(world, fx, fy, T.ringR, 1.5, 0.5);
  world.emit('blast', { x: fx, y: fy, r: T.ringR, kind: 3 });
  world.emit('trample', { x: fx, y: fy, v: 2.5, type: u.type });
}
function stompStep(world, u) {
  const b = u.b, age = actAge(world, u);
  if (!b.landed && age >= T.stompLift) stompHit(world, u);
  if (age >= T.stompPose) { setAct(world, u, b.salvo > 0 ? 1 : 0); b.victim = -1; }
}

function steps(world, u) {
  const b = u.b;
  if (u.vx * u.vx + u.vy * u.vy < 64 || world.time < b.stepAt) return;
  b.stepAt = world.time + T.stepEvery;
  CB.splatNoise(world, u.x, u.y, T.stepNoise, T.stepNoiseR);
  world.emit('step', { x: u.x, y: u.y, v: 1, heavy: 1, type: u.type });
}

function brain(world, u) {
  const b = u.b;
  u.stun = 0;                                         // ignores stuns (too big)
  if (u.floating > world.time) u.floating = world.time;   // STEP6: mass > 8 never floats
  if (b.act === 2) { shortOut(world, u); u.goalX = 0; u.goalY = 0; u.face = NaN; stompStep(world, u); salvoStep(world, u); return; }
  salvoStep(world, u);
  begin(world, u);
  steps(world, u);
  const may = mayAttack(world, u);
  if (may && world.time >= b.nextStomp && (u.possessed !== 1 || u.target >= 0)) {
    const v = stompVictim(world, u);
    if (v && (u.possessed !== 1 || v.id === u.target || hypot(v.x - u.x, v.y - u.y) < u.radius + v.radius + 8)) { startStomp(world, u, v); return; }
  }
  const t = targetOf(world, u);
  if (!t) { idle(world, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (may && b.salvo <= 0 && world.time >= b.reloadAt && d >= T.rangeMin && d <= T.rangeMax && losClear(world, u) && (u.possessed === 1 || !friendNear(world, u, t.x, t.y))) startSalvo(world, u, t.x, t.y);
  // attack 4 lead: a high flyer (UFO, dragon) inside rocket range can't be stomped either: the mech used to run in under it
  // and stand there with nothing it could do (UFO v mech never ended). It steps back out to rocket range instead.
  if (d < T.rangeMin && !touchable(t) && losClear(world, u)) { setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * T.run; u.goalY = (-dy / d) * T.run; return; }
  if (d > T.rangeMax * 0.9 || d < T.rangeMin || !losClear(world, u)) { closeOn(world, u, t, dx, dy, d < T.rangeMin ? T.run : T.walk); if (d < T.rangeMin) setState(u, STATE.CHARGE); }
  else { setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx); u.goalX = (dx / d) * T.walk * 0.5; u.goalY = (dy / d) * T.walk * 0.5; }
}

const D = robot({
  type: 'mech',
  og: 'Mech (ours)', // no OG original
  radius: 17, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: false,
  strength: 8,
  walkSpeed: T.walk,
  runSpeed: T.run,
  maxSpeed: 70,
  accel: 300,
  decel: 400,
  turnRate: 2.2,
  sightRange: 440,
  alertSightRange: 480,
  density: 6,
  untossable: true, // can't be tossed
  wades: true, // STEP6: wades through water, no short-out
  waterPace: T.waterPace,
  brushSpacing: 60,
  flock: { separation: 40, formation: 0.5 },
  look: { attack: { time: 0.5 } },
  weapon: { range: T.rangeMax }, // for possess (aim reach) and readers
  blast: BLAST,
  init(world, u) {
    initB(u);
    const b = u.b;
    b.salvo = 0; b.next = 0; b.ax = u.x; b.ay = u.y; b.reloadAt = world.time + world.rng() * 2;
    b.nextStomp = 0; b.st0 = 0; b.landed = 0; b.fx = u.x; b.fy = u.y; b.stepAt = 0;
  },
  brain,
  // possessed, attack held at nobody: stomp whoever is under it, else a salvo at the aim point
  possessFire(world, u, aim, ax, ay) {
    const b = u.b;
    if (b.act === 2) return;
    const v = world.time >= b.nextStomp ? stompVictim(world, u) : null;
    if (v) { startStomp(world, u, v); return; }
    if (b.salvo > 0 || world.time < b.reloadAt) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 1, k = Math.max(60, Math.min(T.rangeMax, d)) / d;
    startSalvo(world, u, u.x + dx * k, u.y + dy * k);
  },
});
export default D;
export { T };
