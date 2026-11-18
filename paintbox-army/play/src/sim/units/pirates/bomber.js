// bomber (OURS, Pirates tab): carries 5 round bombs. Lights one, lobs it 80-220 px; the fuse burns 1.6 s from the throw,
// the bomb bounces 1-2 times, rolls, and blows (r 40, 70). Then fists (8). Killed while lighting = drops the lit bomb.
// b.act: 1 light → `light` (fuse sparkles), 2 throw → `throw`. Projectile kind `bomb` (p.z = height for the art).
import { person, initB, begin, meleeBody, meleeFight, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, CB, ownerOf } from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { solidAt, depthAt, hooks, WET } from '../../combat/env.js';
import { maskBit } from '../../factions.js';

const T = {
  hp: 90, // hit points
  walk: 85, // px/s
  run: 140, // px/s
  bombs: 5, // carried
  min: 80, // px: closest throw
  max: 220, // px: farthest throw
  shortBy: 30, // px: aims this much short (the bounces carry it on)
  flightBase: 0.45, // s: flight = 0.45 + dist / 420 (like the grenadier's lob)
  flightPer: 420, // px per extra s
  apexPer: 0.32, // apex height = 0.32 × dist + apexMin
  apexMin: 6, // px
  fuse: 1.6, // s from the throw to the blast
  lightTime: 0.5, // s lighting before the throw (b.act 1)
  throwPose: 0.3, // s of the `throw` pose (b.act 2)
  cooldown: 2, // s between throws
  aimTol: 0.3, // rad
  scatterPer: 0.06, // aim scatter (0.06 × dist + 4) px
  scatterBase: 4, // px
  friendGap: 8, // won't throw with an own-side unit within blast radius + 8 of the aim
  bouncesMin: 1, // hops after landing
  bouncesMax: 2, // hops after landing
  hopKeep: 0.45, // speed kept per hop
  hopTime: 0.4, // next hop lasts 0.4 × the last
  hopApex: 0.3, // next hop apex × 0.3
  rollFriction: 3, // 1/s while rolling
  low: 10, // px: below this height walls bounce it back
  dropFuse: 0.9, // s: a lit bomb dropped by a dying bomber
  blast: {
    radius: 40, // px
    damage: 70, // at the centre (falls off to 0.2)
    minFalloff: 0.2, // edge keeps 20 %
    push: 200, // shove
    stun: 0.4, // s
    noiseRadius: 320, // px
    tossUp: 380, // people fly
    tossSpeed: 160, // px/s outward
    tossFrom: 0.4, // toss when falloff × pass ≥ 0.4
    hatChance: 0.5, // hats fly
  },
  fists: {
    damage: 8, // punch
    damageJitter: 2, // ±
    cooldown: 0.7, // s
    cooldownJitter: 0.15, // +
    push: 50, // shove
    stun: 0.1, // s
    reach: 4, // px past both radii
    band: 14, // px
    facing: 0.7, // rad
    circle: 0.5, // strafing
  },
};
const BLAST = CB.registerBlast('bomb', Object.freeze({ ...T.blast }));

// ---------------------------------------------------------------- bomb projectile
// p.life / p.maxLife = this hop's time left / length, p.apex = hop height, p.bounces = hops left, p.rise = fuse left,
// p.drop = 0 hopping, 1 rolling, 2 sunk in water.
function landBomb(world, p) {
  p.z = 0;
  if (hooks.grenadeLanded) hooks.grenadeLanded(world, p.x, p.y);
  if (depthAt(world, p.x, p.y) >= WET) {
    p.drop = 2; p.vx = 0; p.vy = 0;
    world.emit('splash', { x: p.x, y: p.y, v: 0.6 });
    return;
  }
  world.emit('bounce', { x: p.x, y: p.y, v: Math.min(1, hypot(p.vx, p.vy) / 200) });
  if (p.bounces > 0) {
    p.bounces--;
    const a = 0.6 * (world.rng() - world.rng()), c = Math.cos(a) * T.hopKeep, s = Math.sin(a) * T.hopKeep;
    const vx = p.vx * c - p.vy * s, vy = p.vx * s + p.vy * c;
    p.vx = vx; p.vy = vy; p.life = p.maxLife = Math.max(0.14, T.hopTime * p.maxLife); p.apex *= T.hopApex;
  } else p.drop = 1;
}
function stepBomb(world, p, i) {
  p.px = p.x; p.py = p.y;
  p.rise -= DT;
  if (p.drop !== 2) {
    const nx = Math.min(world.W, Math.max(0, p.x + p.vx * DT)), ny = Math.min(world.H, Math.max(0, p.y + p.vy * DT));
    if (p.drop === 0) { const f = 1 - p.life / p.maxLife; p.z = 4 * p.apex * f * (1 - f); } else p.z = 0;
    if (p.z < T.low && world.walls.count > 0 && solidAt(world, nx, ny)) {
      world.emit('bounce', { x: p.x, y: p.y, v: 0.6 });
      p.vx *= -0.5; p.vy *= -0.5;
    } else { p.x = nx; p.y = ny; }
    if (p.drop === 1) {
      const k = Math.max(0, 1 - T.rollFriction * DT); p.vx *= k; p.vy *= k;
      if (depthAt(world, p.x, p.y) >= WET) { p.drop = 2; p.vx = p.vy = 0; world.emit('splash', { x: p.x, y: p.y, v: 0.5 }); }
    } else { p.life -= DT; if (p.life <= 0) landBomb(world, p); }
  }
  if (p.rise > 0) return;
  CB.explode(world, p.x, p.y, BLAST, ownerOf(world, p), p.damage);
  removeProjectile(world, i);
}
registerProjectileKind('bomb', stepBomb);

function spawnBomb(world, u, sx, sy, vx, vy, flight, apex, bounces, fuse) {
  const p = spawnProjectile(world, 'bomb', sx, sy, vx, vy, flight, BLAST.damage, u.faction, u);
  if (!p) return null;
  p.apex = apex; p.bounces = bounces; p.rise = fuse; p.drop = 0; p.z = 0;
  return p;
}
let _ou = null, _oh = false;
function ownOne(o) { if (o !== _ou && o.hp > 0) { _oh = true; return true; } }
function ownNear(world, u, x, y) {   // an own-side unit near the aim point
  _ou = u; _oh = false;
  world.query(x, y, BLAST.radius + T.friendGap, ownOne, maskBit(u.faction));
  _ou = null;
  return _oh;
}
function throwBomb(world, u) {
  const b = u.b, r = u.radius;
  let tx = b.aimX, ty = b.aimY;
  const ex = tx - u.x, ey = ty - u.y, e = hypot(ex, ey) || 1, want = Math.min(T.max, Math.max(T.min, e));
  tx = u.x + (ex / e) * want; ty = u.y + (ey / e) * want;                            // clamp to 80-220 px
  const sc = (T.scatterPer * want + T.scatterBase) * (2 - u.morale);
  tx += sc * (world.rng() - world.rng()); ty += sc * (world.rng() - world.rng());
  const a = Math.atan2(ty - u.y, tx - u.x), sx = u.x + Math.cos(a) * r, sy = u.y + Math.sin(a) * r;
  const dist = hypot(tx - sx, ty - sy), fl = T.flightBase + dist / T.flightPer;
  const hops = T.bouncesMin + Math.floor(world.rng() * (T.bouncesMax - T.bouncesMin + 1));
  const p = spawnBomb(world, u, sx, sy, (tx - sx) / fl, (ty - sy) / fl, fl, T.apexPer * dist + T.apexMin, hops, T.fuse);
  if (!p) return;
  CB.dodgeWarn(world, tx, ty, BLAST.radius, T.fuse);
  world.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type });
  b.bombs--; u.attack = 1; u.cooldown = T.cooldown;
  if (world.stats) world.stats.shots++;
  setAct(world, u, 2);
}

const D = person({
  type: 'bomber',
  og: 'Bomb Thrower (ours)', // no OG original
  radius: 9, // OG-raw
  maxHp: T.hp,
  melee: false,
  strength: 0.7,
  walkSpeed: T.walk,
  runSpeed: T.run,
  minDistance: 70,
  brushSpacing: 21,
  look: { attack: { time: 0.5 } },
  weapon: { range: T.max }, // for possess (aim reach) and readers
  blast: BLAST,
  init(world, u) { initB(u); const b = u.b; b.bombs = T.bombs; b.aimX = u.x; b.aimY = u.y; u.cooldown = world.rng() * T.cooldown * 0.5; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) > T.throwPose) setAct(world, u, 0);
    if (b.act === 1 && actAge(world, u) >= T.lightTime && !(u.stun > 0)) { throwBomb(world, u); }   // a lit bomb always goes
    if (begin(world, u, T.fists)) { if (b.act === 1 && u.stun <= 0) setAct(world, u, 0); return; }
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE || b.bombs <= 0) { if (b.act !== 1) meleeBody(world, u, T.fists); return; }
    if (!t) { if (b.act !== 1) idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (b.act !== 1 && meleeFight(world, u, t, T.fists, dx, dy, d)) return;   // someone in his face: fists
    if (b.act !== 1) {
      if (d > T.max) { CB.advanceTo(world, u, t, dx, dy, losClear(world, u), u.def.walkSpeed); return; }
      if (d < T.min) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * u.def.walkSpeed; u.goalY = (-dy / d) * u.def.walkSpeed; return; }
    }
    setState(u, STATE.ENGAGE);
    const fl = T.flightBase + d / T.flightPer, k = Math.max(0, d - T.shortBy) / d;
    b.aimX = u.x + (dx + t.vx * fl) * k; b.aimY = u.y + (dy + t.vy * fl) * k;
    const aim = Math.atan2(b.aimY - u.y, b.aimX - u.x);
    u.face = aim;
    CB.sidestep(world, u, t, dx, dy, d, u.def);
    if (b.act === 0 && u.cooldown <= 0 && Math.abs(angleDiff(u.heading, aim)) < T.aimTol && !ownNear(world, u, b.aimX, b.aimY)) { setAct(world, u, 1); world.emit('fuse', { x: u.x, y: u.y, type: u.type }); } // STEP4 AUDIO: lights the fuse
  },
  // possessed, attack held at nobody: light a bomb, it flies at the aim point when lit
  possessFire(world, u, aim, ax, ay) {
    const b = u.b;
    b.aimX = ax; b.aimY = ay;
    if (b.bombs > 0 && b.act === 0 && u.cooldown <= 0) { setAct(world, u, 1); world.emit('fuse', { x: u.x, y: u.y, type: u.type }); } // STEP4 AUDIO
    else if (b.bombs <= 0 && u.cooldown <= 0) { u.attack = 1; u.cooldown = T.fists.cooldown; world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); }
  },
  onDeath(world, u) {   // killed while lighting: the lit bomb drops at his feet
    if (u.b.act !== 1 || !(u.b.bombs > 0)) return;
    const a = world.rng() * Math.PI * 2;
    spawnBomb(world, u, u.x, u.y, Math.cos(a) * 20, Math.sin(a) * 20, 0.2, 4, 0, T.dropFuse);
  },
});
export default D;
export { T };
