// blunderbuss (OURS, Pirates tab): short cone. 6 pellets in 40° out to 120 px, 12 each with a big shove (30 each, 180
// for a full hit); the kick shoves the shooter back a step. Reload 3 s (backs off meanwhile).
// b.act: 1 aim → `aim`, 2 fire (0.3 s) → `fire` (recoil). Projectile kind `pellet` (no PROJ art = drawn as a tracer).
import { person, initB, begin, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, CB, hittable, ownerOf, outside, raycast } from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { submerged } from '../../combat/env.js';

const T = {
  hp: 110, // hit points
  walk: 80, // px/s
  run: 130, // px/s
  range: 120, // px: pellets fly this far
  pellets: 6, // per shot
  cone: 0.698, // rad: 40° fan
  jitter: 0.06, // rad: ± per pellet on top of the fan
  speed: 900, // px/s pellet speed
  damage: 12, // per pellet
  pelletPush: 45, // shove per pellet (6 × 45 = 270 for a full hit; STEP4 said 180: a 2-pellet hit then moved a man 5 px)
  pelletStun: 0.25, // s: a hit man slides (stunned units brake slowly) instead of stepping straight back in
  kick: 110, // shove on the shooter, backwards
  reload: 3, // s
  aimTime: 0.35, // s aiming (b.act 1)
  aimTol: 0.2, // rad
  firePose: 0.3, // s of the `fire` pose (b.act 2)
  backOff: 70, // px: reloading with an enemy this close → step back
  noiseRadius: 260, // px noise splat
  smoke: 2, // muzzle smoke size
  butt: { // gun-butt, only while manning a cannon and an enemy comes right up
    damage: 8, damageJitter: 2, cooldown: 1, cooldownJitter: 0.2, push: 60, stun: 0.1, reach: 5, band: 14, facing: 0.7, circle: 0,
  },
};

// ---------------------------------------------------------------- pellet projectile
let _w = null, _p = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _F = 1, _best = null, _bestT = Infinity;
function sweep(u) {
  if (!(u.hp > 0) || !hittable(_p, u) || submerged(_w, u)) return;
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ox - _dx * t, qy = oy - _dy * t, R = u.radius + 1;
  if (qx * qx + qy * qy < R * R && t < _bestT) { _bestT = t; _best = u; }
}
function stepPellet(world, p, i) {
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT, F = dx * dx + dy * dy || 1e-6, len = Math.sqrt(F);
  p.px = x0; p.py = y0;
  const wall = world.walls.count > 0 ? raycast(world, x0, y0, x0 + dx, y0 + dy) : Infinity;
  _w = world; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F; _best = null; _bestT = wall;
  world.query(x0 + dx / 2, y0 + dy / 2, len / 2 + 46 + 2, sweep);
  const hit = _best; _w = null; _p = null; _best = null;
  if (hit) {
    const pass = CB.damage(world, hit, p.damage, ownerOf(world, p));
    CB.push(world, hit, dx / len, dy / len, T.pelletPush * pass, T.pelletStun * pass);
    world.emit(pass < 0.5 ? 'ricochet' : 'bullethit', { x: hit.x, y: hit.y, v: 0.5, type: hit.type });
    if (world.stats) world.stats.hits++;
    removeProjectile(world, i); return;
  }
  if (wall <= 1) { world.emit('ricochet', { x: x0 + dx * wall, y: y0 + dy * wall, v: 0.4 }); removeProjectile(world, i); return; }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || outside(world, p.x, p.y)) removeProjectile(world, i);
}
registerProjectileKind('pellet', stepPellet);

function blast(world, u, aim) {
  const r = u.radius, mx = u.x + Math.cos(aim) * r * 1.4, my = u.y + Math.sin(aim) * r * 1.4, life = (T.range / T.speed) * 1.05;
  for (let k = 0; k < T.pellets; k++) {
    const a = aim + (k / (T.pellets - 1) - 0.5) * T.cone + T.jitter * (world.rng() - world.rng());
    spawnProjectile(world, 'pellet', mx, my, Math.cos(a) * T.speed, Math.sin(a) * T.speed, life, T.damage, u.faction, u);
  }
  world.emit('muzzle', { x: mx, y: my, ang: aim, size: T.smoke });
  world.emit('shot', { x: u.x, y: u.y, v: 1.4, type: u.type });
  CB.splatNoise(world, u.x, u.y, 0.5, T.noiseRadius);
  CB.push(world, u, -Math.cos(aim), -Math.sin(aim), T.kick, 0);   // the kick
  u.attack = 1; u.firedAt = world.time;
  if (world.stats) world.stats.shots++;
  u.b.reload = T.reload;
  setAct(world, u, 2);
}

const D = person({
  type: 'blunderbuss',
  og: 'Blunderbuss (ours)', // no OG original
  radius: 9.5, // OG-raw
  mass: 1.2,
  maxHp: T.hp,
  melee: false,
  strength: 0.8,
  walkSpeed: T.walk,
  runSpeed: T.run,
  minDistance: 40,
  brushSpacing: 22,
  look: { attack: { time: 0.35 } },
  weapon: { range: T.range }, // for possess (aim reach) and readers
  init(world, u) { initB(u); u.b.reload = world.rng() * 0.8; },
  brain(world, u) {
    const b = u.b;
    if (b.reload > 0) b.reload = Math.max(0, b.reload - DT);
    if (b.act === 2 && actAge(world, u) > T.firePose) setAct(world, u, 0);
    if (begin(world, u, T.butt)) { if (b.act === 1) setAct(world, u, 0); return; }
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE) { if (b.act === 1) setAct(world, u, 0); CB.fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { if (b.act === 1) setAct(world, u, 0); idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (b.reload > 0) {                                  // reloading: face it, step back if it is close
      if (b.act === 1) setAct(world, u, 0);
      setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx);
      if (d < T.backOff) { u.goalX = (-dx / d) * u.def.walkSpeed * 0.7; u.goalY = (-dy / d) * u.def.walkSpeed * 0.7; }
      return;
    }
    const clear = losClear(world, u), r = u.state === STATE.ENGAGE ? T.range * 1.1 + 4 : T.range * 0.85;
    if (!clear || d > r + t.radius) { if (b.act === 1) setAct(world, u, 0); CB.advanceTo(world, u, t, dx, dy, clear, d < 200 ? u.def.runSpeed : u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const aim = Math.atan2(dy + t.vy * 0.12, dx + t.vx * 0.12);
    u.face = aim;
    if (b.act !== 1) { setAct(world, u, 1); return; }
    if (actAge(world, u) >= T.aimTime && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) blast(world, u, aim);
  },
  possessFire(world, u, aim) { if (!(u.b.reload > 0)) blast(world, u, aim); },
});
export default D;
export { T };
