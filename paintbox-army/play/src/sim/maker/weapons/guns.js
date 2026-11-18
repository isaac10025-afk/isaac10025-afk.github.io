// Unit maker: W-GUN modules (OURS, Part 2 step 8, STEP8.md). Owner: W-GUN.
// weapons: rifle, sniper, flamer, pistol, blunderbuss, revolvers, crossbow, raygun (this file) + ballista, shrink,
// rockets, missiles, laser, zap, web, cannon (guns-more.js). Shared pieces: guns-lib.js.
// Each weapon = the source unit's attack with the source's numbers (imported from the source file: its weapon def / T
// table), on any body and any size. Ranges, reaches and muzzles are measured from the body's EDGE as the source measured
// them from its own (guns-lib.js edge()); damage doesn't scale with size (ranged), the melee extras (pistol whip, ray-gun
// kick) do (x power). Every shot calls used(); every event carries `as: '<source type>'`.
// Pose codes (u.b.act, lib.js ACT; the body art reads them): AIM 1 (taking aim: pistol, blunderbuss, crossbow),
// FIRE 2 (just fired: recoil / shot pose; revolvers restart it on every shot), RELOAD 3 (reloading / cranking).
// u.attack = 1 on every shot (the plain gun pose). Bag fields the art may read: revolvers `hand` (0 left gun fired last,
// 1 right). No other art fields here; all projectiles reuse the source kinds and their art (bullet, flame, pellet, bolt, ray).
import { registerWeapon } from '../registry.js';
import { STATE, ACT, used, power, setState, hunt, meleeFight, swing, angleDiff, DT } from '../lib.js';
import { getDef } from '../../defs.js';
import { spawnProjectile, fireProjectile } from '../../combat/projectiles.js';
import { splatNoise } from '../../combat/env.js';
import { push } from '../../combat/push.js';
import { inRange, sidestep, closeToRange, advanceTo, takeCover } from '../../combat/gun.js';
import { oddsApproach } from '../../combat/melee.js';
import '../../units/army/rifle.js';
import '../../units/army/sniper.js';
import '../../units/army/flamer.js';
import { T as PT } from '../../units/pirates/pistol.js';
import { T as BT } from '../../units/pirates/blunderbuss.js';
import { T as CT } from '../../units/secret/cowboy.js';
import { BOLT } from '../../units/siege/crossbow.js';
import { T as AT } from '../../units/space/alien.js';
import {
  pose, repose, unpose, poseFor, edge, clearLos, wetHere, tag, shot, gunShot, gunFight, gunInit, gunReload, gunIdle, scaledMelee,
} from './guns-lib.js';
import './guns-more.js';   // the other 8 gun weapons (ballista, shrink, rockets, missiles, laser, zap, web, cannon)

const R0 = (type, raw) => { const d = getDef(type); return d ? d.radius : raw * 1.1; };   // a source unit's registered radius

// ================================================================ rifle (army rifleman: the OG gun brain + its weapon)
const RIFLE = {
  src: getDef('rifle').weapon,   // OG game.js:9892-9908: range 230, 30 dmg, 8 rounds, reload 2.4 s, spread 0.16 ...
  srcR: R0('rifle', 8.63),       // px: the rifleman's radius (ranges count from the body's edge past this)
  minDistance: 120,              // px: backs off from anyone closer (OG game.js:9933)
  pose: 0.28,                    // s: attack pose (OG game.js:9974)
};
registerWeapon({
  id: 'rifle', range: RIFLE.src.range,
  def: { weapon: RIFLE.src, minDistance: RIFLE.minDistance, look: { attack: { time: RIFLE.pose } } },
  init(w, u, bag) { gunInit(w, u, RIFLE.src, bag); },
  tick(w, u, bag) { gunReload(RIFLE.src, bag); if (bag.reload > 0) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD); },
  idle(w, u, bag) { gunIdle(u, RIFLE.src, bag); return false; },
  fight(w, u, t, dx, dy, d, bag) { gunFight(w, u, t, dx, dy, d, bag, RIFLE.src, RIFLE.src.range + edge(u, RIFLE.srcR), false, 'rifle', 'rifle', 'bullet'); },
  possessFire(w, u, aim, ax, ay, bag) { gunShot(w, u, aim, RIFLE.src, bag, 'rifle', 'rifle', 'bullet'); },
});

// ================================================================ sniper (army sniper: standing rifle on the gun brain)
// holdsGround in range (settles, never closes in); out of range it walks in (OG's sniper only stands: a made unit must
// get into range). No prone, no tree perch (STEP8: only what comes free with the gun brain; tree cover does).
const SNIPER = {
  src: getDef('sniper').weapon,  // OG game.js:16347-16368: range 450, 70 dmg, pierces 3, settle 0.6 s, steady < 12 px/s
  srcR: R0('sniper', 8.63),      // px: the sniper's radius
  minDistance: 250,              // px: backs off from anyone closer (OG game.js:16397)
  pose: 0.5,                     // s: attack pose (OG game.js:16413)
};
registerWeapon({
  id: 'sniper', range: SNIPER.src.range,
  def: { weapon: SNIPER.src, minDistance: SNIPER.minDistance, look: { attack: { time: SNIPER.pose } } },
  init(w, u, bag) { gunInit(w, u, SNIPER.src, bag); },
  tick(w, u, bag) { gunReload(SNIPER.src, bag); if (bag.reload > 0) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD); },
  idle(w, u, bag) { gunIdle(u, SNIPER.src, bag); return false; },
  fight(w, u, t, dx, dy, d, bag) { gunFight(w, u, t, dx, dy, d, bag, SNIPER.src, SNIPER.src.range + edge(u, SNIPER.srcR), true, 'sniper', 'sniper', 'bullet'); },
  possessFire(w, u, aim, ax, ay, bag) { gunShot(w, u, aim, SNIPER.src, bag, 'sniper', 'sniper', 'bullet'); },
});

// ================================================================ flamer (army flamethrower: its own stream brain, OG game.js:3943-3999)
// The made unit is NOT made fireproof by the gun (that is the Fireproof ability); no spraying while standing in water.
const FLAMER = {
  src: getDef('flamer').weapon,  // OG game.js:3897-3998: range 80, 30 puffs/s of 2, 90 per tank, refill 2.2 s
  srcR: R0('flamer', 8.63),      // px: the flamer's radius
  mz: 0.7,                       // x source radius past the edge: the nozzle (OG 1.7 x r from the centre)
  minDistance: 40,               // px (OG game.js:3923)
  pose: 0.12,                    // s: attack pose (OG game.js:3937)
};
function spray(w, u, aim, bag) {   // OG game.js:3966-3993
  const F = FLAMER.src;
  if (u.cooldown > 0 || bag.reload > 0) return;
  if (bag.ammo === 0) { bag.reload = F.reloadTime; return; }
  if (Math.abs(angleDiff(u.heading, aim)) > F.aimTolerance) return;
  const a = aim + F.spread * (w.rng() - w.rng());
  const sp = F.speed * (F.speedLo + (F.speedHi - F.speedLo) * w.rng());
  const c = Math.cos(a), s = Math.sin(a), m = u.radius + FLAMER.mz * FLAMER.srcR;
  const x = u.x + c * m, y = u.y + s * m;
  const life = F.life * (F.speedLo + (F.speedHi - F.speedLo) * w.rng());
  const vx = c * sp, vy = s * sp;
  fireProjectile(w, 'flame', u, x + vx * life, y + vy * life, { x, y, vx, vy, life, damage: F.damage });
  splatNoise(w, u.x, u.y, F.noiseAmount, F.noiseRadius);
  bag.ammo--;
  w.emit('flame', { x: u.x, y: u.y, v: 1, type: u.type, as: 'flamer' });
  u.attack = 1;
  u.cooldown = F.cooldown;
  used(w, u, 'flamer');
}
registerWeapon({
  id: 'flamer', range: FLAMER.src.range,
  def: { weapon: FLAMER.src, minDistance: FLAMER.minDistance, look: { attack: { time: FLAMER.pose } } },
  init(w, u, bag) { bag.ammo = FLAMER.src.magazine; bag.reload = 0; u.cooldown = FLAMER.src.initCooldown * w.rng(); },
  tick(w, u, bag) {
    if (bag.reload > 0) { bag.reload -= DT; if (bag.reload <= 0) { bag.reload = 0; bag.ammo = FLAMER.src.magazine; } }
    if (bag.reload > 0) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD);
  },
  idle(w, u, bag) { if (bag.ammo < FLAMER.src.magazine && bag.reload <= 0) bag.reload = FLAMER.src.reloadTime; return false; },   // OG game.js:3998
  fight(w, u, t, dx, dy, d, bag) {
    const F = FLAMER.src, def = u.def, clear = clearLos(w, u), R = F.range + edge(u, FLAMER.srcR);
    if (!clear || !inRange(u, d, R)) { advanceTo(w, u, t, dx, dy, clear, def.walkSpeed); return; }   // OG game.js:3955
    setState(u, STATE.ENGAGE);
    const lead = Math.min(d / F.leadPer, F.leadMax), aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);   // OG game.js:3957
    u.face = aim;
    sidestep(w, u, t, dx, dy, d, def); closeToRange(u, dx, dy, d, R, def); oddsApproach(w, u, t, dx, dy, d, def);   // OG 3961-3963
    if (!wetHere(w, u)) spray(w, u, aim, bag);   // no fire in water (OG game.js:3965)
  },
  possessFire(w, u, aim, ax, ay, bag) { if (!wetHere(w, u)) spray(w, u, aim, bag); },
});

// ================================================================ pistol (pirates pistol: one big shot, a 6 s reload, a whip)
const PISTOL = {
  srcR: R0('pistol', 9),         // px: the pistoleer's radius
  minDistance: 60,               // px (pirates/pistol.js def)
  pose: 0.3,                     // s: attack pose
};   // numbers: pirates/pistol.js T (aim 0.4 s, 45 at 200 px, reload 6 s only with nobody within 140, whip 12)
function pistolFire(w, u, aim, bag) {
  shot(w, u, aim, PT.gun, 'bullet', 'pistol');
  bag.loaded = 0; bag.reload = PT.reload; bag.aiming = 0;
  repose(w, u, ACT.FIRE);
  used(w, u, 'pistol');
}
function pistolReload(w, u, bag) {   // counted only with nobody close (the brain checks)
  bag.reload -= DT; pose(w, u, ACT.RELOAD);
  if (bag.reload <= 0) { bag.loaded = 1; bag.reload = PT.reload; unpose(w, u, ACT.RELOAD); }
}
registerWeapon({
  id: 'pistol', range: PT.gun.range,
  def: { weapon: { range: PT.gun.range }, minDistance: PISTOL.minDistance, look: { attack: { time: PISTOL.pose } } },
  init(w, u, bag) {
    bag.loaded = 1; bag.reload = PT.reload; bag.aiming = 0; bag.aimAt = 0;
    bag.whip = scaledMelee(PT.whip, u, power(u));
  },
  tick(w, u, bag) {
    poseFor(w, u, ACT.FIRE, PT.shootPose);
    if (bag.aiming && (u.stun > 0 || u.state === STATE.FLEE)) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
  },
  idle(w, u, bag) { if (!bag.loaded) pistolReload(w, u, bag); return false; },
  fight(w, u, t, dx, dy, d, bag) {
    const e = edge(u, PISTOL.srcR);
    if (!bag.loaded) {
      if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
      if (d <= PT.reloadClear + e) {   // someone close: pistol-whip
        unpose(w, u, ACT.RELOAD);
        const n0 = w.events.length, r = meleeFight(w, u, t, bag.whip, dx, dy, d);
        if (r === 0) hunt(w, u, t, u.def.runSpeed, STATE.CHARGE);
        else if (r === 2) used(w, u, 'pistol');
        tag(w, n0, u, 'pistol');
        return;
      }
      pistolReload(w, u, bag);
      setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx);
      return;
    }
    const clear = clearLos(w, u), R = PT.gun.range + e, r = u.state === STATE.ENGAGE ? R * 1.1 + 6 : R;
    if (!clear || d > r) { if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); } advanceTo(w, u, t, dx, dy, clear, u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / PT.gun.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    sidestep(w, u, t, dx, dy, d, u.def);
    if (!bag.aiming) { bag.aiming = 1; bag.aimAt = w.time; pose(w, u, ACT.AIM); return; }
    if (w.time - bag.aimAt >= PT.aimTime && Math.abs(angleDiff(u.heading, aim)) < PT.aimTol) pistolFire(w, u, aim + PT.gun.spread * (w.rng() - w.rng()), bag);
  },
  // possessed, attack held at nobody: a quick shot at the aim if loaded, else an empty whip (pirates/pistol.js)
  possessFire(w, u, aim, ax, ay, bag) {
    if (bag.loaded) { pistolFire(w, u, aim + PT.gun.spread * (w.rng() - w.rng()), bag); return; }
    const n0 = w.events.length; swing(w, u, bag.whip.cooldown); tag(w, n0, u, 'pistol');
  },
});

// ================================================================ blunderbuss (pirates: 6 pellets in a 40 degree cone, a kick)
const BLUN = {
  srcR: R0('blunderbuss', 9.5),  // px: the blunderbuss man's radius
  mz: 0.4,                       // x source radius past the edge: the bell mouth (source 1.4 x r)
  minDistance: 40,               // px (pirates/blunderbuss.js def)
  pose: 0.35,                    // s: attack pose
  run: 200,                      // px: closer than this (past the edge) it runs in (source brain)
};   // numbers: pirates/blunderbuss.js T (range 120, 6 x 12 + shove, kick 110, reload 3 s, aim 0.35 s)
function blast(w, u, aim, bag) {
  const m = u.radius + BLUN.mz * BLUN.srcR, mx = u.x + Math.cos(aim) * m, my = u.y + Math.sin(aim) * m, life = (BT.range / BT.speed) * 1.05;
  for (let k = 0; k < BT.pellets; k++) {
    const a = aim + (k / (BT.pellets - 1) - 0.5) * BT.cone + BT.jitter * (w.rng() - w.rng());
    spawnProjectile(w, 'pellet', mx, my, Math.cos(a) * BT.speed, Math.sin(a) * BT.speed, life, BT.damage, u.faction, u);
  }
  w.emit('muzzle', { x: mx, y: my - Math.max(0, u.z), ang: aim, size: BT.smoke, type: u.type, as: 'blunderbuss' });
  w.emit('shot', { x: u.x, y: u.y, v: 1.4, type: u.type, as: 'blunderbuss' });
  splatNoise(w, u.x, u.y, 0.5, BT.noiseRadius);
  push(w, u, -Math.cos(aim), -Math.sin(aim), BT.kick, 0);   // the kick
  u.attack = 1; u.firedAt = w.time;
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  bag.reload = BT.reload; bag.aiming = 0;
  repose(w, u, ACT.FIRE);
  used(w, u, 'blunderbuss');
}
registerWeapon({
  id: 'blunderbuss', range: BT.range,
  def: { weapon: { range: BT.range }, minDistance: BLUN.minDistance, look: { attack: { time: BLUN.pose } } },
  init(w, u, bag) { bag.reload = w.rng() * 0.8; bag.aiming = 0; bag.aimAt = 0; },
  tick(w, u, bag) {
    if (bag.reload > 0) bag.reload = Math.max(0, bag.reload - DT);
    poseFor(w, u, ACT.FIRE, BT.firePose);
    if (bag.reload > 0 && u.b.act !== ACT.FIRE) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD);
    if (bag.aiming && (u.stun > 0 || u.state === STATE.FLEE)) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
  },
  idle(w, u, bag) { if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); } return false; },
  fight(w, u, t, dx, dy, d, bag) {
    const e = edge(u, BLUN.srcR);
    if (bag.reload > 0) {   // reloading: face it, step back if it is close
      if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
      setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx);
      if (d < BT.backOff + e) { u.goalX = (-dx / d) * u.def.walkSpeed * 0.7; u.goalY = (-dy / d) * u.def.walkSpeed * 0.7; }
      return;
    }
    const clear = clearLos(w, u), R = BT.range + e, r = u.state === STATE.ENGAGE ? R * 1.1 + 4 : R * 0.85;
    if (!clear || d > r + t.radius) {
      if (bag.aiming) { bag.aiming = 0; unpose(w, u, ACT.AIM); }
      advanceTo(w, u, t, dx, dy, clear, d < BLUN.run + e ? u.def.runSpeed : u.def.walkSpeed); return;
    }
    setState(u, STATE.ENGAGE);
    const aim = Math.atan2(dy + t.vy * 0.12, dx + t.vx * 0.12);
    u.face = aim;
    if (!bag.aiming) { bag.aiming = 1; bag.aimAt = w.time; pose(w, u, ACT.AIM); return; }
    if (w.time - bag.aimAt >= BT.aimTime && Math.abs(angleDiff(u.heading, aim)) < BT.aimTol) blast(w, u, aim, bag);
  },
  possessFire(w, u, aim, ax, ay, bag) { if (!(bag.reload > 0)) blast(w, u, aim, bag); },
});

// ================================================================ revolvers (cowboy: 6 shots 0.18 s apart, hands in turn, 2.2 s reload)
// Only the guns: the lasso is the Lasso ability (A-ACT1). The source's own walk / run (60 / 100) become the body's.
const REV = {
  srcR: R0('cowboy', 8.6),       // px: the cowboy's radius
  hunt: 120,                     // px past range: farther than this it walks in, closer it runs (source brain)
  pose: 0.3,                     // s: attack pose
};   // numbers: secret/cowboy.js T (range 260, 11 per shot, 6 shots, gap 0.18 s, reload 2.2 s, backs off under 50 px)
function revFire(w, u, aim, bag) {
  bag.hand ^= 1;   // the hands take turns: hand = the gun that just fired (0 left, 1 right)
  shot(w, u, aim + (w.rng() - w.rng()) * CT.spread, CT.gun, 'bullet', 'cowboy');
  bag.ammo--; u.cooldown = CT.shotGap;
  repose(w, u, ACT.FIRE);   // restart the shot pose on every shot
  if (bag.ammo <= 0) bag.reloadAt = w.time + CT.reload;
  used(w, u, 'revolvers');
}
registerWeapon({
  id: 'revolvers', range: CT.gun.range,
  def: { weapon: CT.gun, look: { attack: { time: REV.pose } } },
  init(w, u, bag) { bag.ammo = CT.shots - Math.floor(w.rng() * 3); bag.hand = 1; bag.reloadAt = 0; u.cooldown = w.rng() * 0.4; },
  tick(w, u, bag) {
    poseFor(w, u, ACT.FIRE, 0.15);
    if (bag.ammo > 0) return;
    if (w.time >= bag.reloadAt) { bag.ammo = CT.shots; unpose(w, u, ACT.RELOAD); return; }
    if (u.b.act !== ACT.FIRE) pose(w, u, ACT.RELOAD);
  },
  fight(w, u, t, dx, dy, d, bag) {
    const e = edge(u, REV.srcR), R = CT.gun.range + e, range = u.state === STATE.ENGAGE ? R * 1.08 : R, clear = clearLos(w, u);
    if (d > range || !clear) { hunt(w, u, t, d > range + REV.hunt ? u.def.walkSpeed : u.def.runSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / CT.gun.projectileSpeed, a = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = a;
    if (d < CT.tooClose + e) { u.goalX = -dx / d * u.def.walkSpeed; u.goalY = -dy / d * u.def.walkSpeed; }
    if (bag.ammo > 0 && u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < CT.aimTol) revFire(w, u, a, bag);
  },
  // possessed, attack held at nobody: fan the hammers at the aim
  possessFire(w, u, aim, ax, ay, bag) { if (bag.ammo > 0 && u.cooldown <= 0) revFire(w, u, aim, bag); },
});

// ================================================================ crossbow (siege: one heavy bolt through 3, then a long crank)
const XBOW = {
  srcR: R0('crossbow', 9),       // px: the crossbowman's radius
  mz: 0.4,                       // x source radius past the edge: the bolt leaves here (source 1.4 x r)
  minDistance: 140,              // px: backs off from anything closer (siege/crossbow.js T)
  pose: 0.3,                     // s: attack pose
};   // numbers: siege/crossbow.js BOLT (range 300, 55, through 3 at x0.75, crank 2.4 s, aim 0.35 s)
function loose(w, u, ang, bag) {   // siege/crossbow.js loose()
  const c = Math.cos(ang), s = Math.sin(ang), sp = BOLT.projectileSpeed, m = u.radius + XBOW.mz * XBOW.srcR;
  const p = spawnProjectile(w, 'bolt', u.x + c * m, u.y + s * m, c * sp, s * sp, (BOLT.lifeMul * BOLT.range) / sp,
    BOLT.damage + BOLT.jitter * (2 * w.rng() - 1), u.faction, u);
  if (!p) return null;
  p.pen = BOLT.pierce; p.h0 = -1; p.h1 = -1; p.h2 = -1; p.trail = 0;
  w.emit('bow', { x: u.x, y: u.y, v: 1.2, type: u.type, as: 'crossbow' });
  splatNoise(w, u.x, u.y, 0.3, BOLT.noise);
  u.firedAt = w.time; u.attack = 1;
  if (w.stats) w.stats.shots = (w.stats.shots || 0) + 1;
  bag.reload = BOLT.reload + BOLT.reloadJit * w.rng(); bag.aimAt = -1;
  unpose(w, u, ACT.AIM); pose(w, u, ACT.RELOAD);
  used(w, u, 'crossbow');
  return p;
}
registerWeapon({
  id: 'crossbow', range: BOLT.range,
  def: { weapon: BOLT, minDistance: XBOW.minDistance, look: { attack: { time: XBOW.pose } } },
  init(w, u, bag) { bag.reload = w.rng() * 0.8; bag.aimAt = -1; },
  tick(w, u, bag) {
    if (bag.reload > 0) { bag.reload -= DT; if (bag.reload < 0) bag.reload = 0; }
    if (bag.reload > 0) pose(w, u, ACT.RELOAD); else unpose(w, u, ACT.RELOAD);
    if (bag.aimAt >= 0 && (u.stun > 0 || u.state === STATE.FLEE)) { bag.aimAt = -1; unpose(w, u, ACT.AIM); }
  },
  idle(w, u, bag) { bag.aimAt = -1; unpose(w, u, ACT.AIM); u.cover = -1; return false; },
  fight(w, u, t, dx, dy, d, bag) {   // siege/crossbow.js brain, with a target
    const def = u.def, clear = clearLos(w, u), R = BOLT.range + edge(u, XBOW.srcR);
    if (!clear || !inRange(u, d, R)) {
      bag.aimAt = -1; unpose(w, u, ACT.AIM);
      if (clear && takeCover(w, u, t, d, R, def)) { setState(u, STATE.ADVANCE); u.face = Math.atan2(dy, dx); return; }
      u.cover = -1;
      advanceTo(w, u, t, dx, dy, clear, def.walkSpeed); return;
    }
    setState(u, STATE.ENGAGE);
    const lead = d / BOLT.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    if (!takeCover(w, u, t, d, R, def)) {
      sidestep(w, u, t, dx, dy, d, def);
      if (bag.reload > 0) { closeToRange(u, dx, dy, d, R, def); oddsApproach(w, u, t, dx, dy, d, def); }
    }
    if (bag.reload > 0) { bag.aimAt = -1; return; }
    if (bag.aimAt < 0) bag.aimAt = w.time;
    pose(w, u, ACT.AIM);
    if (w.time - bag.aimAt < BOLT.aim || Math.abs(angleDiff(u.heading, aim)) > BOLT.aimTolerance) return;
    loose(w, u, aim + (w.rng() - w.rng()) * BOLT.spread * (1 + (1 - u.morale)), bag);
  },
  // possessed, attack held at nobody: loose along the aim at once if wound
  possessFire(w, u, aim, ax, ay, bag) { if (!(bag.reload > 0) && !(u.stun > 0)) loose(w, u, aim, bag); },
});

// ================================================================ raygun (space alien: ray bolts on the gun brain + a kick up close)
const RAY = {
  srcR: R0('alien', 8),          // px: the alien's radius
  minDistance: 40,               // px (space/alien.js def)
  pose: 0.3,                     // s: attack pose
};   // numbers: space/alien.js T (ray 16 at 220 px every 0.9 s, never runs dry; kick 6 for anyone right on it)
registerWeapon({
  id: 'raygun', range: AT.gun.range,
  def: { weapon: AT.gun, minDistance: RAY.minDistance, look: { attack: { time: RAY.pose } } },
  init(w, u, bag) { gunInit(w, u, AT.gun, bag); bag.kick = scaledMelee(AT.kick, u, power(u)); },
  tick(w, u, bag) { gunReload(AT.gun, bag); poseFor(w, u, ACT.FIRE, AT.shootPose); },
  idle(w, u, bag) { gunIdle(u, AT.gun, bag); return false; },
  fight(w, u, t, dx, dy, d, bag) {
    const n0 = w.events.length, r = meleeFight(w, u, t, bag.kick, dx, dy, d);   // right up close: a kick instead of a bolt
    if (r !== 0) { if (r === 2) used(w, u, 'raygun'); tag(w, n0, u, 'alien'); return; }
    if (gunFight(w, u, t, dx, dy, d, bag, AT.gun, AT.gun.range + edge(u, RAY.srcR), false, 'raygun', 'alien', 'ray')) repose(w, u, ACT.FIRE);
  },
  possessFire(w, u, aim, ax, ay, bag) { if (gunShot(w, u, aim, AT.gun, bag, 'raygun', 'alien', 'ray')) repose(w, u, ACT.FIRE); },
});
