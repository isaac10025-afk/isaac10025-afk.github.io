// Unit maker: W-GUN shared pieces (OURS, Part 2 step 8, STEP8.md). Owner: W-GUN. Not a weapon file: guns.js and
// guns-more.js import it. What every gun needs on any body and any size:
//  - pose helpers on the shared pose code (u.b.act): a gun only sets weapon codes (< 20) and never clears an
//    ability's code (>= 20), so an ability pose (dive, hop, shell...) is never wiped by a shot.
//  - `edge(u, srcR)`: how much bigger than the source unit this body is (px). Every range / reach / muzzle is measured
//    from the body's EDGE as the source measured it from its own: a giant (r 47 at size 2.25) with a flamer still
//    reaches 80 px past the man in front of it, and its bullets start just past its own skin, not inside the target.
//  - `shot()`: the shared gun shot (combat/projectiles.js shoot, OG 412.k) with the muzzle at the body's edge.
//  - `gunShot()` / `gunFight()`: the OG gun brain's fire rule + in-sight branch (combat/gun.js gunFire + gunBrain,
//    OG 495) with the magazine and reload in the weapon's bag instead of u.ammo / u.reload.
//  - `tag()`: puts `as: '<source type>'` on the events a shared helper emitted for this unit (meleeStrike's 'strike',
//    fireBall's 'muzzle'...), so the audio maps a made unit's sounds through `as` (STEP8.md "Sounds").
import { DT, STATE, WET, angleDiff, hypot, used, ACT } from '../lib.js';
import { spawnProjectile, LIFE_MUL, SHOT_NOISE, BLIND_SPRAY } from '../../combat/projectiles.js';
import { splatNoise } from '../../combat/env.js';
import { inRange, sidestep, closeToRange, advanceTo, takeCover, SPREAD_FEAR, RELOAD_JIT_LO, RELOAD_JIT_HI } from '../../combat/gun.js';
import { oddsApproach } from '../../combat/melee.js';

export const G = {
  MZ: 5.7,        // px past the body's edge: where a shot leaves the gun (OG muzzle 1.6 x r for a 9.5 px man = 5.7 past him)
  FLASH: 6.6,     // px past the muzzle: where the muzzle smoke puffs (OG 0.7 x r)
  ABILITY: 20,    // pose codes from here up belong to the abilities (lib.js ACT)
};
export { ACT, STATE, DT, angleDiff, hypot, used };

// ---------------------------------------------------------------- poses (u.b.act, the body art reads it)
/** Set a weapon pose code (unless an ability is posing). */
export function pose(w, u, code) { const b = u.b; if (b.act >= G.ABILITY) return; if (b.act !== code) { b.act = code; b.actT = w.time; } }
/** Set it again from the start (a new shot restarts the recoil pose). */
export function repose(w, u, code) { const b = u.b; if (b.act >= G.ABILITY) return; b.act = code; b.actT = w.time; }
/** Clear our pose `code` if it is the one showing. */
export function unpose(w, u, code) { const b = u.b; if (b.act === code) { b.act = 0; b.actT = w.time; } }
/** Clear pose `code` once it has shown `secs`. */
export function poseFor(w, u, code, secs) { const b = u.b; if (b.act === code && w.time - b.actT > secs) { b.act = 0; b.actT = w.time; } }

// ---------------------------------------------------------------- sizes, sight
/** px this body is bigger than the source unit (registered radius srcR); never negative. */
export function edge(u, srcR) { return u.radius > srcR ? u.radius - srcR : 0; }
export function clearLos(w, u) { return u.los === 1 || u.los === true || w.walls.count === 0; }
export function wetHere(w, u) { return !(u.z > 0) && w.waterCells > 0 && w.waterAt(u.x, u.y) >= WET; }   // army _shared.js wetAt

// ---------------------------------------------------------------- sounds
/** Put `as` (+ nothing else) on the events emitted since index n0 that belong to u (its type, or no type at all). */
export function tag(w, n0, u, as) {
  const E = w.events, n = E.length;
  for (let i = n0 > n ? Math.max(0, n0 - 1024) : n0; i < n; i++) { const e = E[i]; if (e.as === undefined && (e.type === u.type || e.type === undefined)) e.as = as; }
}

// ---------------------------------------------------------------- the gun shot
/**
 * shot(w, u, ang, W, kind, as): one shot along ang with weapon W {range, projectileSpeed, damage, damageJitter,
 * noiseRadius, smoke, tracer, smokeTrail, penetration} (combat shoot, OG 412.k), from the body's edge.
 */
export function shot(w, u, ang, W, kind, as) {
  if (u.blind === 1) ang += BLIND_SPRAY * (2 * w.rng() - 1);                       // a blinded shooter sprays (STEP4 DINOS)
  const c = Math.cos(ang), s = Math.sin(ang), m = u.radius + G.MZ;
  const x = u.x + c * m, y = u.y + s * m;
  const dmg = W.damage + (2 * w.rng() - 1) * (W.damageJitter || 0);              // OG game.js:9138
  const p = spawnProjectile(w, kind, x, y, c * W.projectileSpeed, s * W.projectileSpeed, (LIFE_MUL * W.range) / W.projectileSpeed, dmg, u.faction, u);
  if (p) {
    p.trail = W.tracer || 0; p.smoky = W.smokeTrail ? 1 : 0; p.pen = W.penetration !== undefined ? W.penetration : 1;   // OG 9155-9157
    if (u.cover >= 0) p.passed = u.cover;                                          // passes its own cover tree
    if (u.z > 2) { const t = u.target >= 0 ? w.unitById(u.target) : null; p.rise = u.z; p.drop = u.z / Math.max(20, t ? hypot(t.x - x, t.y - y) : W.range); }   // fired from up high (looks)
  }
  w.emit('muzzle', { x: x + c * G.FLASH, y: y + s * G.FLASH - Math.max(0, u.z), ang, size: W.smoke !== undefined ? W.smoke : 1, type: u.type, as });
  u.firedAt = w.time;
  splatNoise(w, u.x, u.y, SHOT_NOISE, W.noiseRadius);                              // OG game.js:9175
  u.attack = 1;
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  w.emit('shot', { x: u.x, y: u.y, v: 1, type: u.type, as });
  return p;
}

/** OG gun fire rule (combat/gun.js gunFire, OG game.js:10435-10446) with the bag's ammo / reload. Returns the projectile or null. */
export function gunShot(w, u, aim, W, bag, id, as, kind) {
  if (u.cooldown > 0 || bag.reload > 0) return null;
  if (bag.ammo === 0) { bag.reload = W.reloadTime * (RELOAD_JIT_LO + (RELOAD_JIT_HI - RELOAD_JIT_LO) * w.rng()); return null; }
  if (Math.abs(angleDiff(u.heading, aim)) > W.aimTolerance) return null;
  const sp = hypot(u.vx, u.vy);
  if (sp > W.steadySpeed) return null;
  const h = 1 + SPREAD_FEAR * (1 - u.morale) + (sp / u.def.walkSpeed) * (W.movingPenalty || 0);
  const p = shot(w, u, aim + (w.rng() - w.rng()) * W.spread * h, W, kind, as);
  bag.ammo--;
  u.cooldown = W.cooldown + w.rng() * (W.cooldownJitter || 0);
  used(w, u, id);
  return p;
}
/** The magazine at spawn (combat gunInit, OG game.js:10373-10376). */
export function gunInit(w, u, W, bag) {
  bag.ammo = W.magazine - Math.floor(w.rng() * Math.ceil(W.magazine / 2));
  bag.reload = 0;
  u.cooldown = w.rng() * W.cooldown;
}
/** Every tick: the reload runs out -> a full magazine (OG gunBrain's first line). */
export function gunReload(W, bag) { if (bag.reload > 0) { bag.reload -= DT; if (bag.reload <= 0) { bag.reload = 0; bag.ammo = W.magazine; } } }
/** No target: top the magazine up (OG gunBrain's last line). */
export function gunIdle(u, W, bag) { u.cover = -1; if (bag.ammo < W.magazine && bag.reload <= 0) bag.reload = W.reloadTime; }

/**
 * The OG gun brain with a target (combat/gun.js gunBrain, OG 495.f): out of range / sight -> cover or walk in; in range ->
 * lead the aim, sidestep chargers, keep minDistance, close to range, odds push, fire. R = range from this body's centre.
 * holds = the sniper's holdsGround (in range: no closing in). Returns the projectile when it fired.
 */
export function gunFight(w, u, t, dx, dy, d, bag, W, R, holds, id, as, kind) {
  const def = u.def, clear = clearLos(w, u);
  if (!clear || !inRange(u, d, R)) {
    if (clear && !holds && takeCover(w, u, t, d, R, def)) { if (u.state !== STATE.ADVANCE) { u.state = STATE.ADVANCE; u.stateTime = 0; } u.face = Math.atan2(dy, dx); return null; }
    u.cover = -1;
    advanceTo(w, u, t, dx, dy, clear, def.walkSpeed);   // a holdsGround sniper walks in too: a made unit must get into range
    return null;
  }
  if (u.state !== STATE.ENGAGE) { u.state = STATE.ENGAGE; u.stateTime = 0; }
  const lead = d / W.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);   // OG game.js:10402-10404
  u.face = aim;
  const settled = bag.reload <= 0 && u.cooldown < W.settleTime;
  if (!takeCover(w, u, t, d, R, def) && !settled) {
    sidestep(w, u, t, dx, dy, d, def);
    if (!holds) { closeToRange(u, dx, dy, d, R, def); oddsApproach(w, u, t, dx, dy, d, def); }
  }
  return gunShot(w, u, aim, W, bag, id, as, kind);
}

/**
 * A gun's melee extra (whip, kick, zap, bonk) for this unit, made once in init: damage, reach and push x the size step
 * (STEP8 power), and it closes the last step at a RUN (gunmen back away from melee at walk pace: walk never catches them).
 */
export function scaledMelee(src, u, p) { return { ...src, damage: src.damage * p, push: (src.push || 0) * p, reach: (src.reach || 0) * p, close: u.def.runSpeed }; }
