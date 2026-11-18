// alien (OURS, Space tab): the plain trooper. A silver ray gun (projectile `ray`, a green bolt: 16 at up to 220 px, one
// every 0.9 s) on the shared gun brain (closes to range, sidesteps chargers, takes cover); a kick (6) for anyone who
// gets right up to it. Owner: SPACE-SIM. Pose codes (STEP6.md): b.act 1 shoot → `shoot`; `atk` kick.
// The `ray` projectile kind is registered here (the UFO fires it too): a straight bolt, first body it touches, stopped
// by walls unless it flies high (from a UFO).
import { gunBrain, gunInit } from '../../combat/index.js';
import {
  alien, initBag, act, actAge, targetOf, meleeFight, hypot, STATE, DT, damage, push, raycast,
  registerProjectileKind, removeProjectile, sweepFirst, ownerOf, outside, stepHeight,
} from './_lib.js';

const T = {
  hp: 80, mass: 0.9, radius: 8,
  walk: 85, run: 140,         // px/s
  gun: {
    kind: 'ray',              // projectile kind (registered below)
    range: 220,               // px
    projectileSpeed: 700,     // px/s
    damage: 16,               // per bolt
    damageJitter: 2,          // ±
    noiseRadius: 200,         // px noise splat (wakes enemies)
    cooldown: 0.9,            // s between bolts (the ray gun's "reload")
    cooldownJitter: 0.15,     // + up to this
    magazine: 1000,           // never runs dry: no reload pause (the gun brain wants a magazine)
    reloadTime: 1,            // s (only if it ever did)
    spread: 0.07,             // rad ± (triangular)
    aimTolerance: 0.15,       // rad: fires once facing the aim this well
    movingPenalty: 0.5,       // spread grows while moving
    steadySpeed: Infinity,    // fires on the move
    settleTime: 0, contactMemory: 4,
    smoke: 0.5,               // muzzle flash size (small: an energy gun)
  },
  shootPose: 0.25,            // s the `shoot` pose shows after a bolt
  kick: {
    damage: 6, damageJitter: 1, // per kick
    cooldown: 0.8, cooldownJitter: 0.2, // s
    push: 90,                 // shoves the kicked one back (room to shoot again)
    stun: 0.15,               // s
    reach: 4, band: 4,        // px past both radii (kicks only what is right on it)
    facing: 0.7, circle: 0, backStep: true,
  },
  ray: {
    push: 14,                 // shove per bolt hit (×pass)
    highWalls: 20,            // px: a bolt flying higher than this crosses walls (from a UFO)
  },
};

// ---------------------------------------------------------------- the `ray` bolt (alien, UFO)
function stepRay(w, p, i) {
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT, len = Math.hypot(dx, dy) || 1e-6;
  p.px = x0; p.py = y0;
  const wall = p.z > T.ray.highWalls || w.walls.count === 0 ? Infinity : raycast(w, x0, y0, x0 + dx, y0 + dy);
  const hit = sweepFirst(w, p, x0, y0, dx, dy, Math.min(1, wall), 0, true);
  if (hit) {
    const own = ownerOf(w, p);
    const pass = damage(w, hit, p.damage, own, undefined, x0, y0);
    push(w, hit, dx / len, dy / len, T.ray.push * pass, 0);
    w.emit(pass < 0.5 ? 'ricochet' : 'bullethit', { x: hit.x, y: hit.y, v: Math.min(1, p.damage / 30), type: hit.type, snd: 'ray' });   // STEP6 SPACE AUDIO: snd 'ray' = a zap
    if (w.stats) w.stats.hits++;
    removeProjectile(w, i); return;
  }
  if (wall <= 1) { w.emit('ricochet', { x: x0 + dx * wall, y: y0 + dy * wall, v: 0.3, snd: 'ray' }); removeProjectile(w, i); return; }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  stepHeight(p);
  if (p.life <= 0 || outside(w, p.x, p.y)) removeProjectile(w, i);
}
registerProjectileKind('ray', stepRay);

const D = alien({
  type: 'alien', og: 'Alien (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.6,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3, minDistance: 40,
  weapon: T.gun,                       // possess: aim reach + the shared gun rule when firing at nobody
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); gunInit(w, u, T.gun); },
  brain(w, u) {
    const b = u.b;
    if (b.act === 1 && actAge(w, u) > T.shootPose) act(w, u, 0);
    const t = u.stun > 0 ? null : targetOf(w, u);
    if (t && u.state !== STATE.FLEE) {   // right up close: a kick instead of a bolt
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
      u.goalX = 0; u.goalY = 0;
      if (meleeFight(w, u, t, T.kick, dx, dy, d) !== 0) return;
    }
    gunBrain(w, u, T.gun);   // ranged fight, fleeing, idle (the shared gun brain)
    if (u.firedAt === w.time) act(w, u, 1);
  },
});
export default D;
export { T };
