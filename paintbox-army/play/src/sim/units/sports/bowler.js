// bowler (OURS, Sports tab): BOWLING BALL: a target 60-300 px away → aims, then rolls a `bowlball` along the ground
// (380 px/s, slowing). Everyone it rolls into takes 12, is knocked down 1 s and pushed aside, and the ball rolls on
// (heavier pins slow it more; a giant stops it). It bounces off one wall (the second wall stops it). Knock down 5+ with
// one ball = a STRIKE (event `strike`, bowl: 1). One ball per 3 s. Closer than 60 px: bonks with the ball (8).
// b.act: 1 aim → `aim`, 2 bowl → `bowl`; `atk` bonk. Projectile `bowlball`: p.z 0 (rolls), p.drop = pins down so far.
import { athlete, initB, begin, meleeFight, closeOn, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, DEEP, WET, damage, push, depthAt, stat, ownerOf, outside, segHit, segT, shrugs, solid, fleeSteer, advanceTo } from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';

const T = {
  hp: 120, // hit points (STEP6)
  walk: 75, // px/s (STEP6)
  run: 120, // px/s (STEP6)
  min: 60, // px: closest bowl (STEP6)
  max: 300, // px: farthest bowl (STEP6)
  backMax: 1.2, // s: backs off this long for room to bowl, then goes in to bonk (ATTACK3 L3)
  backGap: 20, // px past `min`: room again, the backing clock resets
  aimTime: 0.4, // s aiming (b.act 1)
  bowlPose: 0.3, // s of the `bowl` pose (b.act 2)
  reload: 3, // s between balls (STEP6)
  reloadJitter: 0.3, // +
  aimTol: 0.25, // rad
  spread: 0.04, // rad ± (triangular)
  ball: {
    speed: 380, // px/s at release (STEP6)
    friction: 150, // px/s² on the ground: rolls ~480 px if nothing stops it
    iceFriction: 35, // px/s² on ice
    wetFriction: 600, // px/s² in shallow water (deep water: it sinks)
    stop: 25, // px/s: slower than this it stops (gone)
    r: 6, // px: ball radius
    damage: 12, // to everyone it rolls into (STEP6)
    down: 1, // s knocked down (STEP6)
    aside: 120, // shove to the side (÷ mass): under 140 px/s, so pins slide aside without bowling each other over (domino.js)
    forward: 0.45, // share of the shove along the ball's roll
    massDrag: 0.05, // speed × (1 − 0.05 × mass) per pin: a rifleman barely slows it, mass 20 stops it
    walls: 1, // wall bounces (STEP6); the next wall stops it
    wallKeep: 0.75, // speed kept off a wall
    strike: 5, // pins down from one ball = a strike (STEP6)
    maxPins: 32, // pins remembered per ball
    life: 4, // s at most
    avgSpeed: 330, // px/s: aim lead for a ball that slows
  },
  bonk: {
    damage: 8, // swung ball (ours: people need a close-in blow)
    damageJitter: 2, // ±
    cooldown: 1.0, // s
    cooldownJitter: 0.2, // +
    push: 80, // shove
    stun: 0.15, // s
    reach: 5, // px past both radii
    band: 14, // px
    facing: 0.6, // rad
    circle: 0.4, // strafing
  },
};
const B = T.ball;

// ---------------------------------------------------------------- the ball
let _bp = null;
function pinned(u) { const h = _bp.hits; for (let k = 0; k < _bp.nHits; k++) if (h[k] === u.id) return true; return false; }
function knock(world, p, o, ux, uy) {
  if (p.nHits < B.maxPins) p.hits[p.nHits++] = o.id;
  const pass = damage(world, o, p.damage, ownerOf(world, p));
  const side = ux * (o.y - p.y) - uy * (o.x - p.x) >= 0 ? 1 : -1, sx = -uy * side, sy = ux * side;
  if (o.hp > 0 && !shrugs(o)) {
    const ax = sx + ux * B.forward, ay = sy + uy * B.forward, al = hypot(ax, ay) || 1;
    push(world, o, ax / al, ay / al, B.aside * pass, B.down * pass);
  }
  if (!shrugs(o)) p.drop++;
  if (p.drop === B.strike) world.emit('strike', { x: p.x, y: p.y, v: 2, type: 'bowler', bowl: 1, n: p.drop });   // STEP6 SPORTS: a strike
  world.emit('bounce', { x: o.x, y: o.y, v: 0.9, type: o.type, snd: 'pin' });                                    // STEP6 SPORTS AUDIO: pins
  stat(world, 'hits');
  return Math.max(0, 1 - B.massDrag * o.mass);
}
function stepBowl(world, p, i) {
  p.px = p.x; p.py = p.y;
  let sp = hypot(p.vx, p.vy);
  const dep = depthAt(world, p.x, p.y);
  if (dep >= DEEP) { world.emit('splash', { x: p.x, y: p.y, v: 0.8 }); removeProjectile(world, i); return; }
  const fr = dep >= WET ? B.wetFriction : (world.iceCells > 0 && world.iceAt(p.x, p.y) > 0) ? B.iceFriction : B.friction;
  const ns = sp - fr * DT;
  p.life -= DT;
  if (ns < B.stop || p.life <= 0) { removeProjectile(world, i); return; }
  p.vx *= ns / sp; p.vy *= ns / sp; sp = ns;
  let ux = p.vx / sp, uy = p.vy / sp, dx = p.vx * DT, dy = p.vy * DT;
  // a wall ahead: bounce (once), else stop
  if (solid(world, p.x + dx + ux * B.r, p.y + dy + uy * B.r)) {
    if (p.bounces <= 0) { world.emit('bounce', { x: p.x, y: p.y, v: 1, snd: 'bowl' }); removeProjectile(world, i); return; }
    p.bounces--;
    const hx = solid(world, p.x + dx + ux * B.r, p.y), hy = solid(world, p.x, p.y + dy + uy * B.r);
    if (hx || !hy) p.vx = -p.vx;
    if (hy || !hx) p.vy = -p.vy;
    p.vx *= B.wallKeep; p.vy *= B.wallKeep;
    world.emit('bounce', { x: p.x, y: p.y, v: 1, snd: 'bowl' });
    return;
  }
  // everyone it rolls into this tick (several pins at once is the point)
  _bp = p;
  for (let n = 0; n < 4; n++) {
    const o = segHit(world, p, p.x, p.y, dx, dy, B.r, 1, true, pinned);
    if (!o) break;
    const k = knock(world, p, o, ux, uy);
    const left = 1 - segT();
    p.vx *= k; p.vy *= k; dx = p.vx * DT * left; dy = p.vy * DT * left;
    if (hypot(p.vx, p.vy) < B.stop) { _bp = null; removeProjectile(world, i); return; }
  }
  _bp = null;
  p.x += dx; p.y += dy;
  if (outside(world, p.x, p.y)) removeProjectile(world, i);
}
registerProjectileKind('bowlball', stepBowl);

function bowl(world, u) {
  const b = u.b, t = b.victim >= 0 ? world.unitById(b.victim) : null;
  let tx = b.aimX, ty = b.aimY;
  if (t && t.hp > 0) { const d = hypot(t.x - u.x, t.y - u.y), lead = d / B.avgSpeed; tx = t.x + t.vx * lead; ty = t.y + t.vy * lead; }
  const a = Math.atan2(ty - u.y, tx - u.x) + T.spread * (world.rng() - world.rng()) * (2 - u.morale), c = Math.cos(a), s = Math.sin(a);
  const off = u.radius + B.r + 2, sx = u.x + c * off, sy = u.y + s * off;
  setAct(world, u, 2);
  u.attack = 1; u.cooldown = T.reload - T.aimTime + world.rng() * T.reloadJitter;   // aim + this = one ball per 3 s
  world.emit('throw', { x: u.x, y: u.y, v: 0.8, type: u.type });
  stat(world, 'shots');
  if (solid(world, sx, sy)) return;                     // up against a wall: it thuds down there
  const p = spawnProjectile(world, 'bowlball', sx, sy, c * B.speed, s * B.speed, B.life, B.damage, u.faction, u);
  if (!p) return;
  if (!p.hits) p.hits = new Int32Array(B.maxPins);     // once per pooled projectile object
  p.nHits = 0; p.drop = 0; p.bounces = B.walls; p.z = 0;
}

const D = athlete({
  type: 'bowler',
  og: 'Bowler (ours)', // no OG original
  radius: 9.5, // OG-raw (STEP6)
  mass: 1.2, // STEP6
  maxHp: T.hp,
  melee: false,
  strength: 0.8,
  walkSpeed: T.walk,
  runSpeed: T.run,
  minDistance: T.min,
  brushSpacing: 22,
  look: { attack: { time: 0.35 } },
  weapon: { ...T.bonk, range: T.max }, // possess aim reach
  init(world, u) { initB(u); const b = u.b; b.aimX = u.x; b.aimY = u.y; b.backT = -1; u.cooldown = world.rng() * T.reload * 0.5; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) >= T.bowlPose) setAct(world, u, 0);
    if (b.act === 1 && actAge(world, u) >= T.aimTime && !(u.stun > 0)) bowl(world, u);
    if (begin(world, u)) { if (b.act === 1) setAct(world, u, 0); return; }
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE) { if (b.act === 1) setAct(world, u, 0); fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { if (b.act === 1 && b.victim >= 0) setAct(world, u, 0); if (b.act !== 1) idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, clear = losClear(world, u);
    if (b.act !== 1 && meleeFight(world, u, t, T.bonk, dx, dy, d)) return;   // someone in his face: bonk
    if (b.act !== 1) {
      if (!clear || d > T.max) { advanceTo(world, u, t, dx, dy, clear, u.def.walkSpeed); return; }
      // too close to bowl: back off for room, but only so long (ATTACK3 L3): a legionary at his heels kept pace with him,
      // so he backed across the whole field and never bowled or bonked again. Still too close after that: he turns and
      // goes in with the bonk.
      if (d < T.min) {
        if (b.backT < 0) b.backT = world.time;
        if (world.time - b.backT < T.backMax) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * u.def.walkSpeed; u.goalY = (-dy / d) * u.def.walkSpeed; return; }
        advanceTo(world, u, t, dx, dy, clear, u.def.walkSpeed); return;
      }
      if (d > T.min + T.backGap) b.backT = -1;
    }
    setState(u, STATE.ENGAGE);
    const lead = d / B.avgSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    if (b.act === 1) { b.victim = t.id; return; }
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) { setAct(world, u, 1); b.victim = t.id; }
  },
  // possessed, attack held at nobody: aim and roll a ball at the aim point
  possessFire(world, u, aim, ax, ay) {
    const b = u.b;
    b.aimX = ax; b.aimY = ay;
    if (b.act === 0 && u.cooldown <= 0) { setAct(world, u, 1); b.victim = -1; }
  },
});
export default D;
export { T };
