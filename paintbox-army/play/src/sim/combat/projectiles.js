// Projectile pool + spawning (OG module, game.js:10129-10268) and the gun shot spawn (OG 412.k, game.js:9130-9179).
// world.projectiles = live array (renderer reads it); dead ones are swap-removed and recycled (no per-shot allocs).
import { PERCH_H, initCombat, signed, hypot, emit, splatNoise, stat } from './env.js';
import { dodgeWarn } from './status.js';
import { getBlast } from './explode.js';

export const PK = { bullet: 0, flame: 1, grenade: 2, arrow: 3, plasma: 4, shuriken: 5 }; // OG game.js:10129
// OURS (Part 2 step 4): new projectile kinds from unit modules. step(world, p, i) runs every tick in ballistics (OG order)
// and must call removeProjectile(world, i) when the projectile is done. Art: a sprite module's PROJ export (ART.md).
export const PROJ_STEP = Object.create(null);
let nextK = 16;
export function registerProjectileKind(kind, step) {
  if (PK[kind] !== undefined && PROJ_STEP[kind] === undefined) throw new Error('registerProjectileKind: built-in kind ' + kind);
  if (PK[kind] === undefined) PK[kind] = nextK++;
  PROJ_STEP[kind] = step;
}
export const PROJ_CAP = 16384;                // OG game.js:8662
export const MUZZLE = 1.6;                    // OG game.js:9135: muzzle 1.6·radius ahead
export const LIFE_MUL = 1.3;                  // OG game.js:9145: life 1.3·range/projectileSpeed
export const SHOT_NOISE = 0.4;                // OG game.js:9175
export const BLIND_SPRAY = 0.7;               // STEP4 DINOS (ours): rad, a blinded unit's shots spray ±40° (spitter spit; OG has no blind shooter)
export const HOST_FREED = -999;               // grenade was freed from a slime: never sticks again (OG P.c)
export function flameRadius(p) { return (3 + 7 * (1 - p.life / p.maxLife)) * p.scale; } // OG game.js:10130-10132, 3004

function pool(world) {
  if (!world.projectiles) world.projectiles = [];
  if (!world._projFree) world._projFree = [];
  return world.projectiles;
}

/** Low-level spawn (OG spawn defaults, game.js:10228-10260). owner = unit or id or −1. Returns the projectile or null when full. */
export function spawnProjectile(world, kind, x, y, vx, vy, life, dmg, faction, owner) {
  const list = pool(world);
  if (list.length >= PROJ_CAP) return null;                                  // OG game.js:10230
  const p = world._projFree.pop() || {};
  p.kind = kind; p.k = PK[kind] !== undefined ? PK[kind] : 0;
  p.x = p.px = x; p.y = p.py = y; p.z = 0; p.vx = vx; p.vy = vy; p.life = p.maxLife = life;
  p.apex = 0; p.blast = null; p.bounces = 0; p.trail = 0; p.alight = 0; p.scale = 1; p.pen = 1;
  p.passed = -1; p.wild = 0; p.smoky = 0; p.rise = 0; p.drop = 0; p.host = -1; p.hostSplit = 0;
  p.damage = dmg; p.faction = faction;
  p.owner = owner == null ? -1 : typeof owner === 'object' ? owner.id : owner;
  p.team = typeof owner === 'object' && owner ? owner.team : -1;
  list.push(p);
  return p;
}
export function removeProjectile(world, i) {
  const list = world.projectiles, p = list[i], last = list.pop();
  if (i < list.length) list[i] = last;
  world._projFree.push(p);
}

/**
 * fireProjectile(world, kind, u, tx, ty, spec) → projectile | null. kinds: bullet, shuriken, plasma, flame, grenade, arrow.
 * - Gun shot (spec has range + projectileSpeed, i.e. a weapon def): OG 412.k — muzzle 1.6·r, speed projectileSpeed,
 *   life 1.3·range/speed, damage + signed()·damageJitter, pen = penetration, noise splat, firedAt, attack = 1.
 * - Otherwise generic: spec {x, y | muzzle (×radius, default 1), angle?, speed | vx,vy, life, damage, apex, bounces,
 *   blast, alight, scale, pen, rise, trail, smoky, warn}. Grenades/arrows without speed fly to (tx,ty) in `life` s.
 *   Grenades send the dodge warning for their landing point unless warn === false (OG 412.A).
 */
export function fireProjectile(world, kind, u, tx, ty, spec = {}) {
  initCombat(u);
  const ox = spec.x !== undefined ? spec.x : u.x, oy = spec.y !== undefined ? spec.y : u.y; // aim from the spawn point if given
  const ang = spec.angle !== undefined ? spec.angle : Math.atan2(ty - oy, tx - ox);
  if (spec.range !== undefined && spec.projectileSpeed !== undefined && spec.speed === undefined) return shoot(world, u, ang, spec, kind);
  const c = Math.cos(ang), s = Math.sin(ang), mz = spec.muzzle !== undefined ? spec.muzzle : 1;
  const x = spec.x !== undefined ? spec.x : u.x + c * u.radius * mz, y = spec.y !== undefined ? spec.y : u.y + s * u.radius * mz;
  let vx = spec.vx, vy = spec.vy, life = spec.life;
  if (vx === undefined) {
    let sp = spec.speed;
    if (sp === undefined) { const d = hypot(tx - x, ty - y); sp = life > 0 ? d / life : 0; }
    vx = c * sp; vy = s * sp;
    if (life === undefined) life = sp > 0 ? hypot(tx - x, ty - y) / sp : 0;
  }
  if (u.blind === 1) { const a = BLIND_SPRAY * signed(world), ca = Math.cos(a), sa = Math.sin(a), rx = vx * ca - vy * sa; vy = vx * sa + vy * ca; vx = rx; } // STEP4 DINOS: a blinded unit's shots spray
  const p = spawnProjectile(world, kind, x, y, vx, vy, life || 0, spec.damage || 0, u.faction, u);
  if (!p) return null;
  if (spec.apex !== undefined) p.apex = spec.apex;
  if (spec.blast !== undefined) p.blast = spec.blast;
  if (spec.bounces !== undefined) p.bounces = spec.bounces;
  if (spec.alight) p.alight = 1;
  if (spec.scale !== undefined) p.scale = spec.scale;
  if (spec.pen !== undefined) p.pen = spec.pen;
  if (spec.rise !== undefined) p.rise = spec.rise;
  if (spec.trail !== undefined) p.trail = spec.trail;
  if (spec.smoky) p.smoky = 1;
  if (kind === 'grenade' && p.blast && spec.warn !== false) {
    const b = getBlast(p.blast);
    if (b) dodgeWarn(world, x + vx * p.life, y + vy * p.life, b.radius, p.life);
  }
  return p;
}

/** shoot(world, u, angle, weapon, kind = 'bullet'): the shared gun shot spawn (OG 412.k, game.js:9130-9179). */
export function shoot(world, u, ang, w, kind = 'bullet') {
  initCombat(u);
  if (u.blind === 1) ang += BLIND_SPRAY * signed(world);                     // STEP4 DINOS: a blinded unit's shots spray
  const r = u.radius, c = Math.cos(ang), s = Math.sin(ang);
  const x = u.x + c * r * MUZZLE, y = u.y + s * r * MUZZLE;
  const dmg = w.damage + signed(world) * (w.damageJitter || 0);              // OG game.js:9138
  const p = spawnProjectile(world, kind, x, y, c * w.projectileSpeed, s * w.projectileSpeed, (LIFE_MUL * w.range) / w.projectileSpeed, dmg, u.faction, u);
  if (p) {
    p.trail = w.tracer || 0; p.smoky = w.smokeTrail ? 1 : 0; p.pen = w.penetration !== undefined ? w.penetration : 1; // OG 9155-9157
    if (u.cover >= 0) p.passed = u.cover;                                    // bullets pass the shooter's own cover tree
    if (w.blast !== undefined) p.blast = w.blast;                            // plasma
    if (u.climb > 0) {                                                       // shooting down from a perch (looks)
      const t = u.target >= 0 ? world.unitById(u.target) : null, rise = u.climb * PERCH_H;
      const d = t ? hypot(t.x - x, t.y - y) : w.range;
      p.rise = rise; p.drop = rise / Math.max(1, d);
    }
  }
  emit(world, 'muzzle', { x: x + c * r * 0.7, y: y + s * r * 0.7 - (u.climb || 0) * PERCH_H, ang, size: w.smoke !== undefined ? w.smoke : 1 });
  u.firedAt = world.time;
  splatNoise(world, u.x, u.y, SHOT_NOISE, w.noiseRadius);                   // OG game.js:9175
  u.attack = 1;
  stat(world, 'shots');
  emit(world, 'shot', { x: u.x, y: u.y, v: 1, type: u.type });
  return p;
}
