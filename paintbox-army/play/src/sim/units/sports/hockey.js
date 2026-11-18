// hockey (OURS, Sports tab): SKATES: on ice he is fast (260 px/s) and in full control (grip 1: no sliding, no falls).
// SLAPSHOT: range 240, winds up and fires a `puck` along the ground (900 px/s): 30 to the first one it meets; it bounces
// off walls up to twice (so it can go round a corner). Close in: stick hit (14).
// b.act: 1 wind → `wind`, 2 shoot → `slap`; on ice b.ice = 1 → `skate0` / `skate1`; `atk` stick hit.
// Projectile `puck`: flat (p.z 0), p.bounces = wall bounces left.
import { athlete, initB, begin, meleeFight, closeOn, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, WET, damage, push, raycast, depthAt, stat, ownerOf, outside, segHit, solid, fleeSteer, advanceTo } from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { sidestep } from '../../combat/gun.js';

const T = {
  hp: 120, // hit points (STEP6)
  walk: 85, // px/s (STEP6)
  run: 140, // px/s (STEP6)
  ice: 260, // px/s skating on ice (STEP6)
  iceGrip: 1, // full control on ice (STEP6; OG people 0.2, falls below 0.5)
  range: 240, // px (STEP6)
  wind: 0.3, // s wind-up (b.act 1)
  slapPose: 0.25, // s of the `slap` pose (b.act 2)
  reload: 1.6, // s from one slapshot to the next (ours: STEP6 gives none)
  reloadJitter: 0.3, // +
  aimTol: 0.2, // rad
  spread: 0.04, // rad ± (triangular)
  puck: {
    speed: 900, // px/s (STEP6)
    damage: 30, // (STEP6)
    damageJitter: 3, // ±
    push: 110, // shove along the puck
    stun: 0.15, // s
    r: 3, // px: puck radius for hits
    bounces: 2, // off walls (STEP6)
    wallKeep: 0.85, // speed kept off a wall
    life: 1.6, // lives 1.6 × range / speed (bounces cost distance)
  },
  stick: {
    damage: 14, // stick hit (STEP6)
    damageJitter: 2, // ±
    cooldown: 0.8, // s
    cooldownJitter: 0.15, // +
    push: 70, // shove
    stun: 0.12, // s
    reach: 8, // px past both radii (a long stick)
    band: 16, // px
    facing: 0.6, // rad
    circle: 0.5, // strafing
  },
};
const P = T.puck;

// ---------------------------------------------------------------- the puck
function stepPuck(world, p, i) {
  p.px = p.x; p.py = p.y;
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT;
  const wall = world.walls.count > 0 ? raycast(world, x0, y0, x0 + dx, y0 + dy) : Infinity;
  const hit = segHit(world, p, x0, y0, dx, dy, P.r, wall <= 1 ? wall : 1, true);
  if (hit) {
    const own = ownerOf(world, p), v = hypot(p.vx, p.vy) || 1;
    const pass = damage(world, hit, p.damage, own);
    if (hit.hp > 0) push(world, hit, p.vx / v, p.vy / v, P.push * pass, P.stun * pass);
    world.emit('bullethit', { x: hit.x, y: hit.y, v: 0.9, type: hit.type, snd: 'puck' });   // STEP6 SPORTS AUDIO: puck smack
    stat(world, 'hits');
    removeProjectile(world, i); return;
  }
  if (wall <= 1) {
    const wx = x0 + dx * wall, wy = y0 + dy * wall;
    world.emit('ricochet', { x: wx, y: wy, v: 0.7, snd: 'puck' });
    if (p.bounces <= 0) { removeProjectile(world, i); return; }
    p.bounces--;
    const hx = solid(world, x0 + dx, y0), hy = solid(world, x0, y0 + dy);
    if (hx || !hy) p.vx = -p.vx;
    if (hy || !hx) p.vy = -p.vy;
    p.vx *= P.wallKeep; p.vy *= P.wallKeep;
    p.x = x0 + dx * Math.max(0, wall - 0.05); p.y = y0 + dy * Math.max(0, wall - 0.05);
    p.passed = -1;
    return;
  }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || outside(world, p.x, p.y)) {
    if (depthAt(world, p.x, p.y) >= WET) world.emit('splash', { x: p.x, y: p.y, v: 0.3 });
    removeProjectile(world, i);
  }
}
registerProjectileKind('puck', stepPuck);

function slap(world, u) {
  const b = u.b, t = b.victim >= 0 ? world.unitById(b.victim) : null;
  let tx = b.aimX, ty = b.aimY;
  if (t && t.hp > 0) { const d = hypot(t.x - u.x, t.y - u.y), lead = d / P.speed; tx = t.x + t.vx * lead; ty = t.y + t.vy * lead; }
  const a = Math.atan2(ty - u.y, tx - u.x) + T.spread * (world.rng() - world.rng()) * (2 - u.morale), c = Math.cos(a), s = Math.sin(a);
  setAct(world, u, 2);
  u.attack = 1; u.cooldown = T.reload - T.wind + world.rng() * T.reloadJitter;
  world.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, slap: 1 });
  stat(world, 'shots');
  const sx = u.x + c * u.radius, sy = u.y + s * u.radius;
  if (solid(world, sx, sy)) return;
  const dmg = P.damage + P.damageJitter * (world.rng() - world.rng());
  const p = spawnProjectile(world, 'puck', sx, sy, c * P.speed, s * P.speed, (P.life * T.range) / P.speed, dmg, u.faction, u);
  if (p) { p.bounces = P.bounces; p.z = 0; }
}
function onIce(world, u) { return world.iceCells > 0 && u.z <= 0 && world.iceAt(u.x, u.y) > 0; }
/** On ice: whatever pace the brain (or the stick) asked for, skating makes it up to 260. */
function skate(u) {
  const g = hypot(u.goalX, u.goalY);
  if (g < 1) return;
  const k = Math.min(T.ice / u.def.runSpeed, T.ice / g);
  u.goalX *= k; u.goalY *= k;
}

const D = athlete({
  type: 'hockey',
  og: 'Hockey Player (ours)', // no OG original
  radius: 9, // OG-raw (STEP6)
  mass: 1.2, // STEP6
  maxHp: T.hp,
  melee: false,
  strength: 0.8,
  walkSpeed: T.walk,
  runSpeed: T.run,
  maxSpeed: T.ice * 1.4, // room for skating × cheer × speedMul
  iceGrip: T.iceGrip,
  minDistance: 70,
  brushSpacing: 21,
  look: { hat: true, attack: { time: 0.3 } }, // helmet
  weapon: { ...T.stick, range: T.range },
  init(world, u) { initB(u); const b = u.b; b.ice = 0; b.aimX = u.x; b.aimY = u.y; u.cooldown = world.rng() * T.reload; },
  brain(world, u) {
    const b = u.b;
    b.ice = onIce(world, u) ? 1 : 0;
    if (b.act === 2 && actAge(world, u) >= T.slapPose) setAct(world, u, 0);
    if (b.act === 1 && actAge(world, u) >= T.wind && !(u.stun > 0)) slap(world, u);
    if (begin(world, u)) { if (b.act === 1) setAct(world, u, 0); return; }
    think(world, u);
    if (b.ice === 1) skate(u);
  },
  possessMove(world, u, mx, my) { if (u.b.ice === 1 && (mx !== 0 || my !== 0)) skate(u); },
  // possessed, attack held at nobody: wind up and slap the puck at the aim point
  possessFire(world, u, aim, ax, ay) {
    const b = u.b;
    b.aimX = ax; b.aimY = ay;
    if (b.act === 0 && u.cooldown <= 0) { setAct(world, u, 1); b.victim = -1; }
  },
});
function think(world, u) {
  const b = u.b, t = targetOf(world, u);
  if (u.state === STATE.FLEE) { if (b.act === 1) setAct(world, u, 0); fleeSteer(world, u, t, u.def.runSpeed); return; }
  if (!t) { if (b.act === 1 && b.victim >= 0) setAct(world, u, 0); if (b.act !== 1) idle(world, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, clear = losClear(world, u);
  if (b.act !== 1 && meleeFight(world, u, t, T.stick, dx, dy, d)) return;   // in his face: the stick
  const r = u.state === STATE.ENGAGE ? T.range * 1.1 + 6 : T.range;
  if (b.act !== 1 && (!clear || d > r)) { advanceTo(world, u, t, dx, dy, clear, u.def.walkSpeed); return; }
  setState(u, STATE.ENGAGE);
  const lead = d / P.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
  u.face = aim;
  sidestep(world, u, t, dx, dy, d, u.def);
  if (b.act === 1) { b.victim = t.id; return; }
  if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) { setAct(world, u, 1); b.victim = t.id; }
}
export default D;
export { T };
