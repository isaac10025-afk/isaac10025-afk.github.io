// pitcher (OURS, Sports tab): FASTBALL: range 280, winds up and throws a `baseball` (800 px/s): 28 + stunned 0.5 s,
// one pitch per 1.4 s. Every 3rd pitch is a CURVEBALL: if someone else stands in the way, the ball is thrown off to one
// side on a circular arc that bends round that one blocker and comes back onto the target (it never hits the blocker).
// b.act: 1 wind-up → `wind`, 2 throw → `throw`; b.victim = who the pitch is for. b.pitches counts pitches (3rd = curve).
// Projectile kind `baseball`: flat (p.z 0), p.rise = curve time left, p.drop = turn rate (rad/s) while curving.
import { athlete, initB, begin, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, damage, push, raycast, depthAt, WET, stat, canHit, hittable, ownerOf, outside, segHit, shrugs, COMMON, fleeSteer, advanceTo } from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { sidestep } from '../../combat/gun.js';
import { submerged } from '../../combat/env.js';

const T = {
  hp: 90, // hit points (STEP6)
  walk: 80, // px/s (STEP6)
  run: 130, // px/s (STEP6)
  range: 280, // px (STEP6)
  wind: 0.35, // s wind-up (b.act 1)
  throwPose: 0.25, // s of the `throw` pose (b.act 2)
  reload: 1.4, // s from one pitch to the next (STEP6)
  reloadJitter: 0.15, // +
  aimTol: 0.2, // rad: starts the wind-up once facing the aim this well
  spread: 0.03, // rad ± (triangular): a good arm
  ball: {
    speed: 800, // px/s (STEP6)
    damage: 28, // (STEP6)
    damageJitter: 3, // ±
    stun: 0.5, // s the victim is stunned (STEP6)
    push: 70, // shove along the ball
    r: 3, // px: ball radius for hits
    life: 1.3, // straight pitch lives 1.3 × range / speed
  },
  curve: {
    every: 3, // every 3rd pitch (STEP6)
    margin: 5, // px of air between the ball and the blocker
    step: 0.04, // rad: arc angles tried, step ...
    max: 1.1, // ... up to this (≈ 63°: a wild curve)
    minLen: 60, // px: closer than this, no room to curve
    tail: 0.15, // s the ball flies on (straight) after the arc
  },
};

// ---------------------------------------------------------------- the baseball
function stepBall(world, p, i) {
  p.px = p.x; p.py = p.y;
  if (p.rise > 0) {                                           // curving: turn the velocity
    const a = p.drop * DT, c = Math.cos(a), s = Math.sin(a), vx = p.vx * c - p.vy * s;
    p.vy = p.vx * s + p.vy * c; p.vx = vx; p.rise -= DT;
  }
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT;
  const wall = world.walls.count > 0 ? raycast(world, x0, y0, x0 + dx, y0 + dy) : Infinity;
  const hit = segHit(world, p, x0, y0, dx, dy, T.ball.r, wall <= 1 ? wall : 1, false);
  if (hit) {
    const own = ownerOf(world, p), v = hypot(p.vx, p.vy) || 1;
    const pass = damage(world, hit, p.damage, own);
    if (hit.hp > 0) { push(world, hit, p.vx / v, p.vy / v, T.ball.push * pass, 0); if (!shrugs(hit) && hit.stun < T.ball.stun * pass) hit.stun = T.ball.stun * pass; }
    world.emit('bullethit', { x: hit.x, y: hit.y, v: 0.8, type: hit.type, snd: 'baseball' });   // STEP6 SPORTS AUDIO: ball thud
    stat(world, 'hits');
    removeProjectile(world, i); return;
  }
  if (wall <= 1) {
    world.emit('bounce', { x: x0 + dx * wall, y: y0 + dy * wall, v: 0.6, snd: 'baseball' });
    removeProjectile(world, i); return;
  }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || outside(world, p.x, p.y)) {
    world.emit(depthAt(world, p.x, p.y) >= WET ? 'splash' : 'bounce', { x: p.x, y: p.y, v: 0.4, snd: 'baseball' });
    removeProjectile(world, i);
  }
}
registerProjectileKind('baseball', stepBall);

// ---------------------------------------------------------------- the curve: bend round the first blocker on the line
let _pu = null, _pt = null, _sx = 0, _sy = 0, _ux = 0, _uy = 0, _L = 0, _blk = null, _ba = Infinity, _bo = 0, _pw = null;
function blockOne(o) {
  if (o === _pu || o === _pt || !(o.hp > 0) || o.inside >= 0 || !canHit(_pu, o) || submerged(_pw, o)) return;
  const ox = o.x - _sx, oy = o.y - _sy, along = ox * _ux + oy * _uy, off = -ox * _uy + oy * _ux;
  if (along <= 0 || along >= _L) return;
  if (Math.abs(off) >= o.radius + T.ball.r + T.curve.margin) return;
  if (along < _ba) { _ba = along; _blk = o; _bo = off; }
}
const PLAN = { a0: 0, w: 0, time: 0, blocker: -1 };
/** Plan a curve from (sx, sy) to (tx, ty) round the first blocker: fills PLAN, returns false when straight is fine / no room. */
function planCurve(world, u, target, sx, sy, tx, ty) {
  const ex = tx - sx, ey = ty - sy, L = hypot(ex, ey);
  if (L < T.curve.minLen) return false;
  _pu = u; _pt = target; _pw = world; _sx = sx; _sy = sy; _ux = ex / L; _uy = ey / L; _L = L; _blk = null; _ba = Infinity; _bo = 0;
  world.query(sx + ex / 2, sy + ey / 2, L / 2 + COMMON.margin, blockOne);
  const o = _blk; _pu = null; _pt = null; _pw = null; _blk = null;
  if (!o) return false;
  const need = o.radius + T.ball.r + T.curve.margin - Math.abs(_bo), tb = _ba / L, side = _bo > 0 ? -1 : 1;   // bulge away from it
  for (let th = T.curve.step; th <= T.curve.max + 1e-9; th += T.curve.step) {
    const R = L / (2 * Math.sin(th)), q = (tb - 0.5) * L, h = Math.sqrt(Math.max(0, R * R - q * q)) - R * Math.cos(th);
    if (h < need) continue;
    const time = (2 * R * th) / T.ball.speed;
    PLAN.a0 = Math.atan2(ey, ex) + side * th; PLAN.w = (-side * 2 * th) / time; PLAN.time = time; PLAN.blocker = o.id;
    return true;
  }
  return false;
}

function pitch(world, u) {
  const b = u.b, t = b.victim >= 0 ? world.unitById(b.victim) : null;
  let tx = b.aimX, ty = b.aimY;
  if (t && t.hp > 0) { const d = hypot(t.x - u.x, t.y - u.y), lead = d / T.ball.speed; tx = t.x + t.vx * lead; ty = t.y + t.vy * lead; }
  const base = Math.atan2(ty - u.y, tx - u.x), sx = u.x + Math.cos(base) * u.radius, sy = u.y + Math.sin(base) * u.radius;
  b.pitches++;
  let a = base + T.spread * (world.rng() - world.rng()) * (2 - u.morale), life = (T.ball.life * T.range) / T.ball.speed, w = 0, time = 0, blocker = -1;
  if (b.pitches % T.curve.every === 0 && t && planCurve(world, u, t, sx, sy, tx, ty)) { a = PLAN.a0; w = PLAN.w; time = PLAN.time; blocker = PLAN.blocker; life = time + T.curve.tail; }
  const dmg = T.ball.damage + T.ball.damageJitter * (world.rng() - world.rng());
  const p = spawnProjectile(world, 'baseball', sx, sy, Math.cos(a) * T.ball.speed, Math.sin(a) * T.ball.speed, life, dmg, u.faction, u);
  if (p) { p.rise = time; p.drop = w; p.passed = blocker; }
  setAct(world, u, 2);
  b.curved = blocker >= 0 ? 1 : 0;
  u.attack = 1; u.cooldown = T.reload - T.wind + world.rng() * T.reloadJitter;   // wind + this = one pitch per 1.4 s
  world.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, curve: b.curved });
  stat(world, 'shots');
}

const D = athlete({
  type: 'pitcher',
  og: 'Pitcher (ours)', // no OG original
  radius: 9, // OG-raw (STEP6)
  mass: 1, // STEP6
  maxHp: T.hp,
  melee: false,
  strength: 0.7,
  walkSpeed: T.walk,
  runSpeed: T.run,
  minDistance: 90, // backs off from closer enemies while pitching
  brushSpacing: 21,
  look: { hat: true, attack: { time: 0.3 } }, // cap
  weapon: { range: T.range }, // possess aim reach
  init(world, u) { initB(u); const b = u.b; b.pitches = 0; b.curved = 0; b.aimX = u.x; b.aimY = u.y; u.cooldown = world.rng() * T.reload; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) >= T.throwPose) setAct(world, u, 0);
    if (b.act === 1 && actAge(world, u) >= T.wind && !(u.stun > 0)) pitch(world, u);
    if (begin(world, u)) { if (b.act === 1) setAct(world, u, 0); return; }
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE) { if (b.act === 1) setAct(world, u, 0); fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { if (b.act === 1 && b.victim >= 0) setAct(world, u, 0); if (b.act !== 1) idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, clear = losClear(world, u);
    const r = u.state === STATE.ENGAGE ? T.range * 1.1 + 6 : T.range;
    if (!clear || d > r) { if (b.act === 1) setAct(world, u, 0); advanceTo(world, u, t, dx, dy, clear, u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / T.ball.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    sidestep(world, u, t, dx, dy, d, u.def);
    if (b.act === 1) { b.victim = t.id; return; }
    if (b.act === 0 && u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) { setAct(world, u, 1); b.victim = t.id; }
  },
  // possessed, attack held at nobody: wind up and pitch at the aim point
  possessFire(world, u, aim, ax, ay) {
    const b = u.b;
    b.aimX = ax; b.aimY = ay;
    if (b.act === 0 && u.cooldown <= 0) { setAct(world, u, 1); b.victim = -1; }
  },
});
export default D;
export { T };
