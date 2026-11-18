// Unit maker: W-THROW modules (OURS, Part 2 step 8, STEP8.md). Owner: W-THROW.
// The 17 thrown + magic weapons. Each = the source unit's attack with the source's numbers and moves, on any body and
// size: throw.js (grenade, shuriken, bow, bombs, oilpot, boulder, lavablob, spit, snowball), throw-sport.js (fastball,
// bowling, puck), throw-magic.js (fireball, lightning, bubble, firebreath, spray). Shared helpers in throw-lib.js.
//  - Projectiles are the source's own kinds (their steps live in the source files, so landing / splash / blind / chill /
//    roll rules and their art are the source's): grenade, shuriken, arrow, bomb, oilpot, boulder, lavablob, spit,
//    snowball, baseball, bowlball, puck, plasma, flame, bubble (effect). No new kinds.
//  - Close-in blows of the source (bomber fists, oil-pot ladle, ninja katana + dash slash, yeti slam, golem punch,
//    spitter bite, bowler bonk, hockey stick, gravity slap, bombardier bite) are part of the weapon: damage, reach and
//    push × power(u) (STEP8 melee rule). Throws / shots don't scale. Weapons whose source has no close-in blow (grenade,
//    bow, boulder, fireball, lightning, firebreath) swat with the held thing when an enemy is in their face (throw-lib.js
//    FISTS = the lead's fallback fists × power, on its own clock): ours, so no body stands helpless in melee.
//  - State: the weapon's bag u.b.wb (every field set in init); u.cooldown + u.attack as the source uses them.
//  - Sounds: the source's event names, each with type: u.type and as: '<source unit type>'.
// Pose codes the art reads (u.b.act, lib.js ACT): AIM 1 (bow draw, boulder laying, bowling aim), WIND 4 (pitch / slap
// wind-up, bomb lit), THROW 5 (just threw, ~0.3-0.5 s), SWING 6 (shuriken dash + katana, close-in blows), CAST 7 (spell
// wind-up, bubble held), BREATH 8 (fire breath), SPRAY 9 (spray: turning its back + spraying).
// Bag fields the art may read (u.b.wb): aimX / aimY (throw point), bombs (bombs left: 0 = fists), lit (1 = a lit bomb in
// the hand), pots (oil pots left: 0 = ladle), reload (boulder: s until loaded, 0 = a boulder on the arm), breathA (fire
// breath flame angle), victim (bubble: id of the floating unit, -1), phase (spray 1 turning / 2 spraying; spells 1 + n
// while winding up).
import { registerWeapon } from '../registry.js';
import {
  STATE, hypot, angleDiff, ENEMY, setState, targetOf, canAuto, clearLine, idle, used, power, swing, keepAt,
  damage, push, toss, igniteNow, fireProjectile, spawnProjectile, high, bite, hunt, blindFor, meleeFight,
} from '../lib.js';
import { ACT, pose, poseEnd, poseOff, scaledMelee, brawl, aimClamp, shot, fistsFor, swat } from './throw-lib.js';
import { getBlast, dodgeWarn, sidestep as gunSidestep, advanceTo } from '../../combat/index.js';
import {
  inRange, advance, sidestep, closeIn, oddsPush, hasLos, tri, signed, rint, range, perchOf, blockFx, wallRaycast, solidAt,
  anyWalls, grpAlive, circle as armyCircle, strike,
} from '../../units/army/_shared.js';
import { isHostile, maskBit } from '../../factions.js';
import '../../units/army/grenadier.js';                       // registers blast 'grenade' + the grenade kind's users
import { T as BT } from '../../units/pirates/bomber.js';     // registers projectile 'bomb'
import { POT } from '../../units/siege/oilpot.js';           // registers projectile 'oilpot'
import { SHOT, BOULDER } from '../../units/siege/catapult.js'; // registers projectile 'boulder'
import { T as GT } from '../../units/bosses/lavagolem.js';   // registers projectile 'lavablob' + 'lava'
import '../../units/dinos/spitter.js';                        // registers projectile 'spit'
import { T as YT } from '../../units/secret/yeti.js';        // registers projectile 'snowball'
import { blow, inReach, nearestFoe } from '../../units/secret/_lib.js';
import './throw-sport.js';
import './throw-magic.js';

const DT = 1 / 60;

// ================================================================ grenade (grenadier: lobs at the middle of enemy clumps)
// from units/army/grenadier.js THROW + DROP (OG game.js:4015-4191)
const GR = {
  range: 200,          // px engage range (OG 4015)
  flightBase: 0.45,    // s: flight = 0.45 + dist / 420 (OG 4016)
  flightPer: 420,      // OG 4017
  friendlyGap: 8,      // no own-side unit within blast r + 8 of the aim (OG 4018)
  clumpRadius: 42,     // aim = centroid of enemies within 42 px of the target (OG 4085)
  aimLerp: 0.35,       // s: aim smoothing (OG 4103)
  minDist: 80,         // px: closest throw (OG 4121)
  maxMul: 1.15,        // farthest = 1.15 × range (OG 4121)
  aimTolerance: 0.25,  // rad (OG 4122)
  scatterPer: 0.07,    // scatter (0.07 × dist + 4) × c (OG 4126)
  scatterBase: 4,      // px (OG 4126)
  damageJitter: 12,    // 125 ± 12 (OG 4143)
  bouncesMax: 4,       // int(4): 0-3 bounces (OG 4153)
  apexPer: 0.3,        // apex = 0.3 × dist (OG 4151)
  cooldown: 1.7,       // s + 0.5 × rng (OG 4158)
  cooldownJitter: 0.5, // OG 4158
  magazine: 6,         // grenades (OG 4063)
  reloadTime: 4,       // s, × range(0.9, 1.15) when empty (OG 4117); idle top-up 4 (OG 4164)
  reloadLo: 0.9, reloadHi: 1.15, // OG 4117
  initCooldown: 1.7,   // s × rng at spawn (OG 4063)
  dropChance: 0.25,    // killed with grenades left, not mid-throw: drops a live one (OG 4168)
  dropMaxAttack: 0.5,  // not mid-throw: attack ≤ 0.5 (OG 4168)
  dropSpeed: 30,       // px/s × range(0.5, 1) (OG 4170)
  dropFuse: 0.9,       // s × range(0.85, 1.15) (OG 4171)
  dropApex: 5,         // px (OG 4188)
  attackTime: 0.8,     // s of the attack pose (OG 4059)
  minDistance: 120,    // px: backs off inside this (OG 4044)
};
const GBLAST = getBlast('grenade');
const _ga = new Float64Array(2), CLUMP = new Array(24).fill(null);
function grenadeAim(w, u, t) {   // OG 4083-4099: centroid + mean velocity of the first 24 enemies within 42 px of the target
  let cx = 0, cy = 0, vx = 0, vy = 0, n = 0;
  const m = w.queryMask(t.x, t.y, GR.clumpRadius, ENEMY[u.faction], CLUMP, 24);
  for (let k = 0; k < m; k++) { const o = CLUMP[k]; CLUMP[k] = null; if (!(o.hp > 0)) continue; cx += o.x; cy += o.y; vx += o.vx; vy += o.vy; n++; }
  if (n === 0) { cx = t.x; cy = t.y; vx = t.vx; vy = t.vy; n = 1; }
  const mx = cx / n, my = cy / n, fl = GR.flightBase + hypot(mx - u.x, my - u.y) / GR.flightPer;
  _ga[0] = mx + (vx / n) * fl; _ga[1] = my + (vy / n) * fl;
}
let _ownU = null, _ownHit = false;
function ownOne(o) { if (o !== _ownU && o.hp > 0) { _ownHit = true; return true; } }
function ownNear(w, u, x, y, r) { _ownU = u; _ownHit = false; w.query(x, y, r, ownOne, maskBit(u.faction)); _ownU = null; return _ownHit; }
function lobGrenade(w, u, x, y, vx, vy, life, dmg, apex, bounces, tx, ty) {
  return fireProjectile(w, 'grenade', u, tx, ty, { x, y, vx, vy, life, damage: dmg, apex, bounces, blast: GBLAST, warn: false });
}
function throwGrenade(w, u, B, force) {   // OG 4114-4160 (force: possessed at the ground, no aim / friend checks)
  if (u.cooldown > 0 || B.reload > 0) return;
  if (B.ammo === 0) { B.reload = GR.reloadTime * range(w, GR.reloadLo, GR.reloadHi); return; }
  const ex = B.aimX - u.x, ey = B.aimY - u.y, o = hypot(ex, ey);
  if (!force) {
    if (o < GR.minDist || o > GR.maxMul * GR.range) return;
    if (Math.abs(angleDiff(u.heading, Math.atan2(ey, ex))) > GR.aimTolerance) return;
    if (ownNear(w, u, B.aimX, B.aimY, GBLAST.radius + GR.friendlyGap)) return;
  }
  const c = 1 - u.morale + 1 + hypot(u.vx, u.vy) / Math.max(1, u.def.walkSpeed), sc = (GR.scatterPer * o + GR.scatterBase) * c;
  const hx = B.aimX + tri(w) * sc, hy = B.aimY + tri(w) * sc, a = Math.atan2(ey, ex);
  const sx = u.x + Math.cos(a) * u.radius, sy = u.y + Math.sin(a) * u.radius;
  const dist = hypot(hx - sx, hy - sy), fl = GR.flightBase + dist / GR.flightPer;
  const p = lobGrenade(w, u, sx, sy, (hx - sx) / fl, (hy - sy) / fl, fl, GBLAST.damage + GR.damageJitter * signed(w), GR.apexPer * dist, rint(w, GR.bouncesMax), hx, hy);
  if (!p) return;
  dodgeWarn(w, hx, hy, GBLAST.radius, fl);
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, as: 'grenadier' });
  B.ammo--; u.attack = 1; pose(w, u, ACT.THROW);
  u.cooldown = GR.cooldown + GR.cooldownJitter * w.rng();
  shot(w, u, 'grenade');
}
registerWeapon({
  id: 'grenade', range: GR.range,
  def: { minDistance: GR.minDistance, look: { attack: { time: GR.attackTime } }, weapon: { range: GR.range } },
  init(w, u, B) { B.ammo = GR.magazine; B.reload = 0; B.aimX = u.x; B.aimY = u.y; B.fists = fistsFor(u); B.swatAt = 0; u.cooldown = GR.initCooldown * w.rng(); },
  tick(w, u, B) {
    if (B.reload > 0) { B.reload -= DT; if (B.reload <= 0) { B.reload = 0; B.ammo = GR.magazine; } }   // OG 4067
    poseEnd(w, u, ACT.THROW, 0.4);
  },
  idle(w, u, B) { if (B.ammo < GR.magazine && B.reload <= 0) B.reload = GR.reloadTime; return false; }, // OG 4164
  fight(w, u, t, dx, dy, d, B) {   // OG 4071-4111
    if (B.reload > 0 && B.ammo > 0) B.reload = 0;   // a target cancels a partial reload (OG 4073)
    if (swat(w, u, t, B.fists, dx, dy, d, 'grenade', B)) return;   // ours: touching, can't throw (min 80 px): swat it
    if (!inRange(u, d, GR.range)) { advance(w, u, t, dx, dy, hasLos(w, u), u.def.walkSpeed); return; }
    const was = u.state === STATE.ENGAGE;
    setState(u, STATE.ENGAGE);
    grenadeAim(w, u, t);
    if (was) { const k = Math.min(1, DT / GR.aimLerp); B.aimX += (_ga[0] - B.aimX) * k; B.aimY += (_ga[1] - B.aimY) * k; }
    else { B.aimX = _ga[0]; B.aimY = _ga[1]; }
    u.face = Math.atan2(B.aimY - u.y, B.aimX - u.x);
    sidestep(u, t, dx, dy, d, u.def); closeIn(u, dx, dy, d, GR.range, u.def); oddsPush(w, u, t, dx, dy, d, u.def);
    throwGrenade(w, u, B, false);
  },
  possessFire(w, u, aim, ax, ay, B) {   // ours: a lob at the aim point (80-230 px); the grenadier had no ground throw
    const P = aimClamp(u, aim, ax, ay, GR.minDist, GR.maxMul * GR.range); B.aimX = P[0]; B.aimY = P[1];
    throwGrenade(w, u, B, true);
  },
  onDeath(w, u, cause, killer, B) {   // death drop (OG 4166-4191)
    if (!(B.ammo > 0) || (u.attack || 0) > GR.dropMaxAttack || w.rng() >= GR.dropChance) return;
    const a = w.rng() * Math.PI * 2, sp = GR.dropSpeed * range(w, 0.5, 1), fuse = GR.dropFuse * range(w, 0.85, 1.15);
    const lx = u.x + Math.cos(a) * sp * fuse, ly = u.y + Math.sin(a) * sp * fuse;
    if (lobGrenade(w, u, u.x, u.y, Math.cos(a) * sp, Math.sin(a) * sp, fuse, GBLAST.damage + GR.damageJitter * signed(w), GR.dropApex, 0, lx, ly)) dodgeWarn(w, lx, ly, GBLAST.radius, fuse);
  },
});

// ================================================================ shuriken (ninja: fans of 3 at range, a dash-slash, the katana)
// from units/army/ninja.js KATANA / DASH / FAN (OG game.js:18249-18491). The smoke bomb is the Smoke ability (A-ACT2).
const NJ = {
  katana: { damage: 16, damageJitter: 3, push: 55, stun: 0.1, cooldown: 0.65, cooldownJitter: 0.2, facing: 0.7, reach: 7, circle: 1.5 }, // OG 18483-18491 (× power)
  dashTime: 0.18,      // s (OG 18251)
  dashHitAt: 0.5,      // slash at half the dash (OG 18307)
  dashMaxHits: 2,      // enemies slashed on the line (OG 18322)
  dashLineGap: 6,      // within r_enemy + 0.5 r + 6 of the line (OG 18328)
  dashQueryPad: 30,    // OG 18320
  dashDamage: 16,      // × power (OG 18331)
  dashPush: 70,        // × power: 0.6 sideways + 0.4 forward (OG 18336-18338)
  dashStun: 0.25,      // s (OG 18339)
  dashEndDamp: 0.2,    // velocity × 0.2 at the end (OG 18350)
  dashReach: 115,      // px: dash when the target is this close ... (OG 18407)
  dashMinGap: 18,      // ... and at least this far past both bodies (OG 18408)
  dashOvershoot: 26,   // px past the target (OG 18411)
  dashNext: 6,         // s ± 1 to the next dash (OG 18428)
  dashFirst: 1,        // s × rng to the first (OG 18297)
  fanCount: 3,         // shuriken per fan (OG 18447)
  fanSpacing: 0.12,    // rad between them (OG 18448)
  fanJitter: 0.04,     // rad × tri (OG 18448)
  fanSpeed: 520,       // px/s (OG 18250)
  fanRange: 228,       // px of flight (OG 18446)
  fanDamage: 6,        // each (OG 18458)
  fanMin: 115,         // fan when 115 < d ≤ 190 (OG 18437)
  fanMax: 190,         // OG 18438
  fanNext: 1.8,        // s ± 0.4 (OG 18472)
  fanFirst: 0.4,       // s × rng (OG 18298)
  chargeUnder: 172.5,  // px: Charge state under this (OG 18474)
  attackTime: 0.26,    // s attack pose (OG 18292)
};
function dashSlash(w, u, B) {   // OG 18311-18347
  const x0 = B.dashX, y0 = B.dashY, x1 = x0 + u.vx * NJ.dashTime, y1 = y0 + u.vy * NJ.dashTime, P = power(u);
  const lx = x1 - x0, ly = y1 - y0, l2 = lx * lx + ly * ly || 1e-6, len = Math.sqrt(l2);
  let hits = 0;
  w.query((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + NJ.dashQueryPad, (c) => {
    if (hits >= NJ.dashMaxHits) return true;
    if (!(c.hp > 0) || c.z > 0 || !isHostile(u, c)) return;
    const s = Math.max(0, Math.min(1, ((c.x - x0) * lx + (c.y - y0) * ly) / l2));
    const ox = c.x - x0 - lx * s, oy = c.y - y0 - ly * s, lim = c.radius + 0.5 * u.radius + NJ.dashLineGap;
    if (ox * ox + oy * oy > lim * lim) return;
    const v = perchOf(w, c), m = damage(w, v, NJ.dashDamage * P, u, 'blow');
    const side = ox * ly - oy * lx >= 0 ? 1 : -1;
    push(w, v, (-ly / len) * side * 0.6 + (lx / len) * 0.4, (lx / len) * side * 0.6 + (ly / len) * 0.4, NJ.dashPush * P * m, NJ.dashStun * m);
    blockFx(w, u, c, m);
    if (m >= 1) w.emit('strike', { x: v.x, y: v.y, v: 1.2, type: u.type, as: 'ninja' });
    w.emit('slash', { x: c.x, y: c.y, ang: Math.atan2(ly, lx), v: 0.6, as: 'ninja' });
    hits++;
  });
  if (hits > 0) used(w, u, 'shuriken');
  u.attack = 1; u.cooldown = Math.max(u.cooldown, NJ.katana.cooldown);
}
function startDash(w, u, t, nx, ny, d, B) {   // OG 18404-18431
  const c = d + t.radius + u.radius + NJ.dashOvershoot, r = u.radius;
  const hx = Math.min(w.W - r, Math.max(r, u.x + nx * c)), hy = Math.min(w.H - r, Math.max(r, u.y + ny * c));
  if (anyWalls(w) && (wallRaycast(w, u.x, u.y, hx, hy) <= 1 || solidAt(w, hx, hy))) return false;
  u.vx = (hx - u.x) / NJ.dashTime; u.vy = (hy - u.y) / NJ.dashTime;
  u.heading = u.pheading = Math.atan2(ny, nx); u.face = u.heading;
  u.leaping = 1; B.dashing = 1; B.dashT = w.time; B.slashed = 0; B.dashX = u.x; B.dashY = u.y;
  setState(u, STATE.CHARGE); pose(w, u, ACT.SWING);
  w.emit('dust', { x: u.x, y: u.y, ang: u.heading + Math.PI, v: 0.7, type: u.type, as: 'ninja' });
  B.dashAt = w.time + NJ.dashNext + signed(w);
  return true;
}
function throwFan(w, u, aim, B) {   // OG 18437-18473
  const r = u.radius, life = NJ.fanRange / NJ.fanSpeed;
  for (let k = 0; k < NJ.fanCount; k++) {
    const a = aim + NJ.fanSpacing * (k - 1) + NJ.fanJitter * tri(w), c = Math.cos(a), s = Math.sin(a), x = u.x + c * r, y = u.y + s * r;
    if (!fireProjectile(w, 'shuriken', u, x + c * NJ.fanRange, y + s * NJ.fanRange, { x, y, vx: c * NJ.fanSpeed, vy: s * NJ.fanSpeed, life, damage: NJ.fanDamage, pen: 0 })) break;
  }
  w.emit('throw', { x: u.x, y: u.y, v: 0.6, type: u.type, as: 'ninja' });
  u.face = aim; u.attack = 1; pose(w, u, ACT.THROW);
  B.fanAt = w.time + NJ.fanNext + 0.4 * signed(w);
  shot(w, u, 'shuriken');
}
registerWeapon({
  id: 'shuriken', range: NJ.fanMax,
  def: { melee: true, look: { attack: { time: NJ.attackTime } }, weapon: { range: NJ.fanMax } },   // the ninja is a melee unit (OG 18262)
  init(w, u, B) {
    u.cooldown = w.rng() * NJ.katana.cooldown;
    B.dashAt = w.time + NJ.dashFirst * w.rng(); B.fanAt = w.time + NJ.fanFirst * w.rng();
    B.dashing = 0; B.slashed = 0; B.dashT = 0; B.dashX = u.x; B.dashY = u.y;
    B.kat = scaledMelee(NJ.katana, u);
  },
  tick(w, u, B) {   // the dash runs every tick, also stunned (ninja carry, OG 18302-18354)
    poseEnd(w, u, ACT.THROW, 0.3);
    if (B.dashing !== 1) { poseEnd(w, u, ACT.SWING, NJ.attackTime); return; }
    if (u.leaping !== 1) { B.dashing = 0; poseOff(w, u, ACT.SWING); return; }   // something else took the leap over
    const e = w.time - B.dashT;
    if (B.slashed === 0 && e >= NJ.dashHitAt * NJ.dashTime) { B.slashed = 1; dashSlash(w, u, B); }
    if (e < NJ.dashTime) return;
    u.leaping = 0; u.vx *= NJ.dashEndDamp; u.vy *= NJ.dashEndDamp; u.goalX = u.goalY = 0; B.dashing = 0;
    w.emit('dust', { x: u.x, y: u.y, ang: u.heading, v: 0.6, type: u.type, as: 'ninja' });
  },
  busy(w, u, B) { return B.dashing === 1 && u.leaping === 1; },   // mid-dash: the brain skips (OG 18357-18361)
  fight(w, u, t, dx, dy, d, B) {   // OG 18403-18491
    const k = u.radius + t.radius, clear = hasLos(w, u), now = w.time, K = B.kat;
    if (d > k + K.reach) {   // out of reach: dash, else fan, then run in
      if (clear && now >= B.dashAt && d <= NJ.dashReach && d - k >= NJ.dashMinGap && u.leaping === 0 && !(u.z > 0) && startDash(w, u, t, dx / d, dy / d, d, B)) return;
      if (clear && now >= B.fanAt && d > NJ.fanMin && d <= NJ.fanMax) { const lead = d / NJ.fanSpeed; throwFan(w, u, Math.atan2(dy + t.vy * lead, dx + t.vx * lead), B); }
      setState(u, d < NJ.chargeUnder ? STATE.CHARGE : STATE.ADVANCE);
      advance(w, u, t, dx, dy, clear, u.def.runSpeed);
      return;
    }
    setState(u, STATE.ENGAGE);
    const a = Math.atan2(dy, dx);
    u.face = a;
    armyCircle(u, t, dx, dy, d, u.def, K.circle, true);
    if (u.cooldown > 0 || Math.abs(angleDiff(u.heading, a)) > K.facing) return;
    strike(w, u, t, dx / d, dy / d, K.damage + K.damageJitter * signed(w), K.push, K.stun);
    u.attack = 1; u.cooldown = K.cooldown + K.cooldownJitter * w.rng(); pose(w, u, ACT.SWING);
    used(w, u, 'shuriken');
  },
  possessFire(w, u, aim, ax, ay, B) {   // ours: a fan at the aim when ready, else a katana swing at the air
    if (w.time >= B.fanAt) throwFan(w, u, aim, B); else swing(w, u, NJ.katana.cooldown);
  },
});

// ================================================================ bow (archer: volley arcs at a predicted landing spot)
// from units/army/archer.js BOW (OG game.js:17782-17928)
const BW = {
  range: 340,          // px + 0.6 × closing speed (OG 17844)
  closingMul: 0.6,     // OG 17843
  alertClosing: 20,    // out of range and closing faster than this: wait (Alert) (OG 17847)
  draw: 0.6,           // s volley lead / solo draw × range(0.9, 1.15) (OG 17915)
  drawLo: 0.9, drawHi: 1.15, // OG 17915
  flightBase: 0.45,    // s: flight = 0.45 + dist / 520 (OG 17783)
  flightPer: 520,      // OG 17784
  aimMaxMul: 1.15,     // aim clamped to 391 px (OG 17926)
  aimLerp: 0.3,        // s aim smoothing (OG 17856)
  scatterPer: 0.05,    // (0.05 × dist + 5) × c (OG 17874)
  scatterBase: 5,      // OG 17874
  muzzle: 1.3,         // spawn 1.3 r ahead (OG 17878)
  damage: 45,          // ± 6 (OG 17890)
  damageJitter: 6,     // OG 17890
  apexPer: 0.35,       // arc apex = 0.35 × dist (OG 17898)
  cooldown: 1.7 * 0.85, // s (OG 17902)
  initCooldown: 0.5,   // s × rng (OG 17828)
  volleyJoin: 0.35,    // join the group volley if it is still ≥ 0.35 s away (OG 17909)
  volleyReady: 1.7,    // next volley 1.7 s after this one (OG 17913)
  stagger: 0.2,        // per-archer stagger s (OG 17907)
  minDistance: 200,    // px: backs off inside this (OG 17810)
  attackTime: 0.3,     // s (OG 17825)
};
const _ba = new Float64Array(2);
function bowPredict(u, t, d) {   // OG 17919-17928
  const fl = BW.flightBase + d / BW.flightPer;
  _ba[0] = t.x + t.vx * fl; _ba[1] = t.y + t.vy * fl;
  const rx = _ba[0] - u.x, ry = _ba[1] - u.y, a = hypot(rx, ry), h = BW.range * BW.aimMaxMul;
  if (a > h) { _ba[0] = u.x + (rx / a) * h; _ba[1] = u.y + (ry / a) * h; }
}
function loose(w, u, B) {   // OG 17864-17904
  B.timer = 0; poseOff(w, u, ACT.AIM);
  const ex = B.aimX - u.x, ey = B.aimY - u.y, o = hypot(ex, ey) || 1;
  const c = 1 - u.morale + 1 + hypot(u.vx, u.vy) / Math.max(1, u.def.walkSpeed), sc = (BW.scatterPer * o + BW.scatterBase) * c;
  const hx = B.aimX + tri(w) * sc, hy = B.aimY + tri(w) * sc;
  const r = u.radius, sx = u.x + (ex / o) * r * BW.muzzle, sy = u.y + (ey / o) * r * BW.muzzle;
  const dist = hypot(hx - sx, hy - sy), fl = BW.flightBase + dist / BW.flightPer;
  const p = fireProjectile(w, 'arrow', u, hx, hy, {
    x: sx, y: sy, vx: (hx - sx) / fl, vy: (hy - sy) / fl, life: fl, damage: BW.damage + BW.damageJitter * signed(w),
    apex: BW.apexPer * dist, alight: u.kindled ? 1 : 0,   // fire arrows while kindled (OG 17899)
  });
  if (!p) return;
  w.emit('bow', { x: u.x, y: u.y, v: 1, type: u.type, as: 'archer' });
  u.attack = 1; u.cooldown = BW.cooldown;
  shot(w, u, 'bow');
}
registerWeapon({
  id: 'bow', range: BW.range,
  def: { minDistance: BW.minDistance, look: { attack: { time: BW.attackTime } }, weapon: { range: BW.range } },
  init(w, u, B) { u.cooldown = BW.initCooldown * w.rng(); B.timer = 0; B.aimX = u.x; B.aimY = u.y; B.fists = fistsFor(u); B.swatAt = 0; },
  tick(w, u, B) { if (B.timer > 0 && (u.stun > 0 || u.state === STATE.FLEE)) { B.timer = 0; poseOff(w, u, ACT.AIM); } },   // stun / running cancels the draw (OG 17833-17835)
  idle(w, u, B) { if (B.timer > 0) { B.timer = 0; poseOff(w, u, ACT.AIM); } return false; },
  fight(w, u, t, dx, dy, d, B) {   // OG 17841-17916
    if (swat(w, u, t, B.fists, dx, dy, d, 'bow', B)) { if (B.timer > 0) { B.timer = 0; poseOff(w, u, ACT.AIM); } return; }   // ours: touching: swat with the bow
    const closing = Math.max(0, -(t.vx * dx + t.vy * dy) / d);
    if (!inRange(u, d, BW.range + closing * BW.closingMul)) {
      if (B.timer > 0) { B.timer = 0; poseOff(w, u, ACT.AIM); }
      if (closing > BW.alertClosing) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); return; }
      advance(w, u, t, dx, dy, hasLos(w, u), u.def.walkSpeed); return;
    }
    const was = u.state === STATE.ENGAGE;
    setState(u, STATE.ENGAGE);
    bowPredict(u, t, d);
    if (was) { const k = Math.min(1, DT / BW.aimLerp); B.aimX += (_ba[0] - B.aimX) * k; B.aimY += (_ba[1] - B.aimY) * k; }
    else { B.aimX = _ba[0]; B.aimY = _ba[1]; }
    u.face = Math.atan2(B.aimY - u.y, B.aimX - u.x);
    sidestep(u, t, dx, dy, d, u.def); oddsPush(w, u, t, dx, dy, d, u.def);
    if (B.timer > 0) { if (w.time >= B.timer) loose(w, u, B); return; }   // drawing
    if (u.cooldown > 0) return;
    const j = ((0.618034 * u.index) % 1) * BW.stagger, g = u.group, G = w.groups;   // volley sync (OG 17906-17916)
    if (grpAlive(w, g) && G.size[g] > 1) {
      if (G.volleyAt[g] - w.time >= BW.volleyJoin) B.timer = G.volleyAt[g] + j;
      else if (w.time >= G.volleyReady[g]) { G.volleyAt[g] = w.time + BW.draw; G.volleyReady[g] = G.volleyAt[g] + BW.volleyReady; B.timer = G.volleyAt[g] + j; }
    } else B.timer = w.time + BW.draw * range(w, BW.drawLo, BW.drawHi);
    if (B.timer > 0) { pose(w, u, ACT.AIM); w.emit('bowdraw', { x: u.x, y: u.y, v: 1, type: u.type, as: 'archer' }); }
  },
  possessFire(w, u, aim, ax, ay, B) {   // ours: loose at the aim point (archer had no ground shot)
    if (u.cooldown > 0) return;
    const P = aimClamp(u, aim, ax, ay, 40, BW.range * BW.aimMaxMul); B.aimX = P[0]; B.aimY = P[1];
    loose(w, u, B);
  },
});

// ================================================================ bombs (bomber: 5 lit bombs lobbed 80-220 px, then fists)
// numbers: units/pirates/bomber.js T (imported, so the user's tuning there carries over); projectile 'bomb' is the bomber's
const BM = {
  bombs: BT.bombs,           // carried
  min: BT.min, max: BT.max,  // px throw range
  shortBy: BT.shortBy,       // px: aims this much short (the hops carry it on)
  flightBase: BT.flightBase, flightPer: BT.flightPer, // s: flight = base + dist / per
  apexPer: BT.apexPer, apexMin: BT.apexMin,           // arc height
  fuse: BT.fuse,             // s from the throw to the blast
  lightTime: BT.lightTime,   // s lighting before the throw (pose WIND)
  throwPose: BT.throwPose,   // s of the THROW pose
  cooldown: BT.cooldown,     // s between throws
  aimTol: BT.aimTol,         // rad
  scatterPer: BT.scatterPer, scatterBase: BT.scatterBase, // aim scatter
  friendGap: BT.friendGap,   // no throw with an own-side unit within blast r + this of the aim
  bouncesMin: BT.bouncesMin, bouncesMax: BT.bouncesMax, // hops after landing
  dropFuse: BT.dropFuse,     // s: the lit bomb a dying bomber drops
  fists: BT.fists,           // punches when out of bombs / someone in his face (× power)
  minDistance: 70,           // px (bomber def)
  attackTime: 0.5,           // s (bomber def)
};
const BBLAST = getBlast('bomb');
function spawnBomb(w, u, sx, sy, vx, vy, flight, apex, bounces, fuse) {   // from bomber.js spawnBomb
  const p = spawnProjectile(w, 'bomb', sx, sy, vx, vy, flight, BBLAST.damage, u.faction, u);
  if (!p) return null;
  p.apex = apex; p.bounces = bounces; p.rise = fuse; p.drop = 0; p.z = 0;
  return p;
}
function throwBomb(w, u, B) {   // from bomber.js throwBomb
  B.lit = 0;
  const r = u.radius, ex = B.aimX - u.x, ey = B.aimY - u.y, e = hypot(ex, ey) || 1, want = Math.min(BM.max, Math.max(BM.min, e));
  let tx = u.x + (ex / e) * want, ty = u.y + (ey / e) * want;
  const sc = (BM.scatterPer * want + BM.scatterBase) * (2 - u.morale);
  tx += sc * (w.rng() - w.rng()); ty += sc * (w.rng() - w.rng());
  const a = Math.atan2(ty - u.y, tx - u.x), sx = u.x + Math.cos(a) * r, sy = u.y + Math.sin(a) * r;
  const dist = hypot(tx - sx, ty - sy), fl = BM.flightBase + dist / BM.flightPer;
  const hops = BM.bouncesMin + Math.floor(w.rng() * (BM.bouncesMax - BM.bouncesMin + 1));
  if (!spawnBomb(w, u, sx, sy, (tx - sx) / fl, (ty - sy) / fl, fl, BM.apexPer * dist + BM.apexMin, hops, BM.fuse)) { poseOff(w, u, ACT.WIND); return; }
  dodgeWarn(w, tx, ty, BBLAST.radius, BM.fuse);
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, as: 'bomber' });
  B.bombs--; u.attack = 1; B.next = w.time + BM.cooldown; B.thrownAt = w.time;   // ours: the throw's own clock, so the fists aren't held 2 s after a throw
  pose(w, u, ACT.THROW);
  shot(w, u, 'bombs');
}
function lightBomb(w, u, B) { B.lit = 1; B.litT = w.time; pose(w, u, ACT.WIND); w.emit('fuse', { x: u.x, y: u.y, type: u.type, as: 'bomber' }); }
function bombFists(w, u, t, dx, dy, d, B) { const r = meleeFight(w, u, t, B.fists, dx, dy, d); if (r === 2) used(w, u, 'bombs'); return r; }
registerWeapon({
  id: 'bombs', range: BM.max,
  def: { minDistance: BM.minDistance, look: { attack: { time: BM.attackTime } }, weapon: { range: BM.max } },
  init(w, u, B) { B.bombs = BM.bombs; B.aimX = u.x; B.aimY = u.y; B.lit = 0; B.litT = 0; B.thrownAt = -9; B.fists = scaledMelee(BM.fists, u); B.next = w.time + w.rng() * BM.cooldown * 0.5; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, BM.throwPose); },
  busy(w, u, B) {   // a lit bomb always goes once lit long enough and not stunned (bomber brain top)
    if (B.lit === 1 && w.time - B.litT >= BM.lightTime && !(u.stun > 0)) throwBomb(w, u, B);
    return false;
  },
  idle(w, u, B) { return B.lit === 1; },   // holding a lit bomb: stand
  fight(w, u, t, dx, dy, d, B) {
    if (B.bombs <= 0) { if (B.lit === 0) brawl(w, u, t, B.fists, dx, dy, d, 'bombs'); return; }
    if (B.lit === 0 && bombFists(w, u, t, dx, dy, d, B)) return;   // someone in his face: fists
    if (B.lit === 0) {
      if (d > BM.max) { advanceTo(w, u, t, dx, dy, clearLine(w, u), u.def.walkSpeed); return; }
      if (d < BM.min) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * u.def.walkSpeed; u.goalY = (-dy / d) * u.def.walkSpeed; return; }
    }
    setState(u, STATE.ENGAGE);
    const fl = BM.flightBase + d / BM.flightPer, k = Math.max(0, d - BM.shortBy) / d;
    B.aimX = u.x + (dx + t.vx * fl) * k; B.aimY = u.y + (dy + t.vy * fl) * k;
    const aim = Math.atan2(B.aimY - u.y, B.aimX - u.x);
    u.face = aim;
    gunSidestep(w, u, t, dx, dy, d, u.def);
    if (B.lit === 0 && w.time >= B.next && Math.abs(angleDiff(u.heading, aim)) < BM.aimTol && !ownNear(w, u, B.aimX, B.aimY, BBLAST.radius + BM.friendGap)) lightBomb(w, u, B);
  },
  possessFire(w, u, aim, ax, ay, B) {   // bomber: light a bomb, it flies at the aim point when lit; out of bombs: a punch
    B.aimX = ax; B.aimY = ay;
    if (B.bombs > 0 && B.lit === 0 && w.time >= B.next) lightBomb(w, u, B);
    else if (B.bombs <= 0) swing(w, u, BM.fists.cooldown);
  },
  onDeath(w, u, cause, killer, B) {   // killed while lighting: the lit bomb drops at the feet
    if (B.lit !== 1 || !(B.bombs > 0)) return;
    const a = w.rng() * Math.PI * 2;
    spawnBomb(w, u, u.x, u.y, Math.cos(a) * 20, Math.sin(a) * 20, 0.2, 4, 0, BM.dropFuse);
  },
});

// ================================================================ oilpot (oil pot: 3 burning-oil pots lobbed 60-200 px, then the ladle)
// numbers: units/siege/oilpot.js POT (imported); projectile 'oilpot' is the oil pot's (it shatters into burning oil)
const OP = {
  pots: POT.pots,             // carried
  min: POT.min, range: POT.range, // px
  flightBase: POT.flightBase, flightPer: POT.flightPer, // s: flight = base + dist / per
  apexPer: POT.apexPer, apexMin: POT.apexMin,           // arc top (clears walls)
  scatterPer: POT.scatterPer, scatterBase: POT.scatterBase, // landing scatter
  cooldown: POT.cooldown, cdJit: POT.cdJit,             // s between throws
  aimTolerance: POT.aimTolerance, // rad
  throwPose: POT.throwPose,   // s of the THROW pose
  behindWall: POT.behindWall, // an enemy behind a wall scores × this
  pick: POT.pick,             // enemies looked at per pick
  splashDmg: POT.splashDmg,   // the pot's own hit (its step does the rest)
  ladle: { damage: 6, damageJitter: 1, push: 40, stun: 0.08, cooldown: 0.8, cooldownJitter: 0.3, reach: 8, band: 12, facing: 0.6, circle: 1 }, // oilpot.js LADLE (× power)
  minDistance: 70,            // px (oilpot def)
  attackTime: 0.4,            // s (oilpot def)
};
const OPICK = new Array(OP.pick).fill(null);
function pickPotTarget(w, u, t) {   // from oilpot.js pickThrow: behind walls first, then the target, then near ones
  const n = w.queryMask(u.x, u.y, OP.range, ENEMY[u.faction], OPICK, OP.pick);
  let best = null, bs = 0;
  for (let k = 0; k < n; k++) {
    const o = OPICK[k]; OPICK[k] = null;
    if (!(o.hp > 0) || o.z > 30 || o.burning > 0) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < OP.min || d > OP.range) continue;
    let s = 1 / (1 + d / 200);
    if (w.walls.count > 0 && !w.walls.lineOfSight(u.x, u.y, o.x, o.y)) s *= OP.behindWall;
    if (o === t) s *= 1.5;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}
function lobPot(w, u, B, tx, ty) {   // from oilpot.js lob
  const ex = tx - u.x, ey = ty - u.y, o = hypot(ex, ey) || 1, sc = (OP.scatterPer * o + OP.scatterBase) * (2 - u.morale);
  const hx = tx + tri(w) * sc, hy = ty + tri(w) * sc;
  const sx = u.x + (ex / o) * u.radius, sy = u.y + (ey / o) * u.radius, dist = hypot(hx - sx, hy - sy), fl = OP.flightBase + dist / OP.flightPer;
  const p = spawnProjectile(w, 'oilpot', sx, sy, (hx - sx) / fl, (hy - sy) / fl, fl, OP.splashDmg, u.faction, u);
  if (!p) return;
  p.apex = Math.max(OP.apexMin, OP.apexPer * dist);
  B.pots--; u.attack = 1; u.cooldown = OP.cooldown + OP.cdJit * w.rng(); B.throwAt = w.time;
  pose(w, u, ACT.THROW);
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, as: 'oilpot' });
  shot(w, u, 'oilpot');
}
registerWeapon({
  id: 'oilpot', range: OP.range,
  def: { minDistance: OP.minDistance, look: { attack: { time: OP.attackTime } }, weapon: { range: OP.range } },
  init(w, u, B) { B.pots = OP.pots; B.throwAt = -9; B.aimId = -1; B.ladle = scaledMelee(OP.ladle, u); u.cooldown = 0.6 * w.rng(); },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, OP.throwPose); },
  fight(w, u, t, dx, dy, d, B) {   // from oilpot.js brain
    if (B.pots <= 0) { brawl(w, u, t, B.ladle, dx, dy, d, 'oilpot'); return; }
    let aim = B.aimId >= 0 ? w.unitById(B.aimId) : null;
    if (!aim || !(aim.hp > 0) || (w.tick + u.index) % 15 === 0) { aim = pickPotTarget(w, u, t); B.aimId = aim ? aim.id : -1; }
    if (!aim) {
      if (d < OP.min) { setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * u.def.walkSpeed; u.goalY = (-dy / d) * u.def.walkSpeed; return; }
      advance(w, u, t, dx, dy, hasLos(w, u), u.def.walkSpeed); return;
    }
    setState(u, STATE.ENGAGE);
    const fl = OP.flightBase + hypot(aim.x - u.x, aim.y - u.y) / OP.flightPer, ax = aim.x + aim.vx * fl, ay = aim.y + aim.vy * fl;
    const a = Math.atan2(ay - u.y, ax - u.x);
    u.face = a;
    sidestep(u, t, dx, dy, d, u.def);
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) <= OP.aimTolerance) lobPot(w, u, B, ax, ay);
  },
  possessFire(w, u, aim, ax, ay, B) {   // oil pot: lob at the aim point (60-200 px), or the ladle when out of pots
    if (u.stun > 0 || u.cooldown > 0) return;
    if (B.pots <= 0) { swing(w, u, OP.ladle.cooldown); return; }
    const P = aimClamp(u, aim, ax, ay, OP.min, OP.range);
    lobPot(w, u, B, P[0], P[1]);
  },
});

// ================================================================ boulder (catapult's lob: lands, then rolls on through lines)
// numbers: units/siege/catapult.js SHOT / BOULDER (imported); carried by the unit itself (no crew, the catapult's reload)
const BL = {
  min: SHOT.min, max: SHOT.max,     // px range 180-650
  possessMin: SHOT.possessMin,      // px: the player may drop one this close
  reload: SHOT.reload,              // s
  aim: SHOT.aim,                    // s laying the shot (pose AIM)
  aimTolerance: SHOT.aimTolerance,  // rad
  firePose: SHOT.firePose,          // s of the THROW pose
  flightBase: SHOT.flightBase, flightPer: SHOT.flightPer, // s: flight = base + dist / per
  apexPer: SHOT.apexPer, apexMin: SHOT.apexMin,           // arc top
  scatterPer: SHOT.scatterPer, scatterBase: SHOT.scatterBase, // landing scatter
  landDmg: BOULDER.landDmg,         // the rock's own hit (its step does the landing + roll)
  seen: BOULDER.seen,               // bodies a rolling rock remembers
  firstLo: 1,                       // s: first boulder 1-2 s after spawn (catapult init)
};
const ALT = new Array(32).fill(null);
function altTarget(w, u, min, max) {   // from catapult.js: an enemy within [min, max] when the target is too close
  const n = w.queryMask(u.x, u.y, max, ENEMY[u.faction], ALT, 32);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) { const o = ALT[k]; ALT[k] = null; if (!(o.hp > 0)) continue; const d = hypot(o.x - u.x, o.y - u.y); if (d >= min && d < bd) { bd = d; best = o; } }
  return best;
}
function fireBoulder(w, u, B, tx, ty) {   // from catapult.js fire
  const ex = tx - u.x, ey = ty - u.y, o = hypot(ex, ey) || 1, sc = BL.scatterPer * o + BL.scatterBase;
  const hx = tx + tri(w) * sc, hy = ty + tri(w) * sc;
  const sx = u.x + (ex / o) * u.radius * 0.6, sy = u.y + (ey / o) * u.radius * 0.6, dist = hypot(hx - sx, hy - sy), fl = BL.flightBase + dist / BL.flightPer;
  const p = spawnProjectile(w, 'boulder', sx, sy, (hx - sx) / fl, (hy - sy) / fl, fl, BL.landDmg, u.faction, u);
  if (!p) return;
  p.apex = Math.max(BL.apexMin, BL.apexPer * dist); p.roll = 0;
  if (!p.seen) p.seen = new Int32Array(BL.seen);   // once per pooled projectile object (as the catapult)
  p.seen.fill(-1); p.seenK = 0;
  B.reload = BL.reload; B.fireAt = w.time; B.aimAt = -1;
  u.attack = 1; pose(w, u, ACT.THROW);
  w.emit('throw', { x: u.x, y: u.y, v: 2, type: u.type, as: 'catapult' });
  shot(w, u, 'boulder');
}
registerWeapon({
  id: 'boulder', range: BL.max,
  def: { minDistance: BL.min, look: { attack: { time: 0.4 } }, weapon: { range: BL.max } },
  init(w, u, B) { B.reload = BL.firstLo + w.rng(); B.fireAt = -9; B.aimAt = -1; B.fists = fistsFor(u); B.swatAt = 0; },
  tick(w, u, B) {
    if (B.reload > 0) { B.reload -= DT; if (B.reload < 0) B.reload = 0; }
    poseEnd(w, u, ACT.THROW, BL.firePose);
  },
  idle(w, u, B) { B.aimAt = -1; poseOff(w, u, ACT.AIM); return false; },
  fight(w, u, t, dx, dy, d, B) {   // from catapult.js brain
    if (swat(w, u, t, B.fists, dx, dy, d, 'boulder', B)) { B.aimAt = -1; poseOff(w, u, ACT.AIM); return; }   // ours: touching: swat it
    const min = u.possessed === 1 ? BL.possessMin : BL.min;
    if (d < min) {
      const alt = altTarget(w, u, min, BL.max);
      if (alt) { t = alt; dx = t.x - u.x; dy = t.y - u.y; d = hypot(dx, dy) || 0.001; }
      else if (u.possessed !== 1) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); u.goalX = (-dx / d) * u.def.walkSpeed; u.goalY = (-dy / d) * u.def.walkSpeed; B.aimAt = -1; poseOff(w, u, ACT.AIM); return; }
    }
    if (d > BL.max) { B.aimAt = -1; poseOff(w, u, ACT.AIM); advance(w, u, t, dx, dy, hasLos(w, u), u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const fl = BL.flightBase + d / BL.flightPer, ax = t.x + t.vx * fl, ay = t.y + t.vy * fl;
    u.face = Math.atan2(ay - u.y, ax - u.x);
    if (B.reload > 0) { B.aimAt = -1; return; }
    if (B.aimAt < 0) { B.aimAt = w.time; pose(w, u, ACT.AIM); }
    if (w.time - B.aimAt >= BL.aim && Math.abs(angleDiff(u.heading, u.face)) <= BL.aimTolerance) fireBoulder(w, u, B, ax, ay);
  },
  possessFire(w, u, aim, ax, ay, B) {   // catapult: fires at the aim point (60-650 px)
    if (B.reload > 0 || u.stun > 0) return;
    const P = aimClamp(u, aim, ax, ay, BL.possessMin, BL.max);
    fireBoulder(w, u, B, P[0], P[1]);
  },
});

// ================================================================ lavablob (lava golem: a lobbed blob of lava + the burning punch)
// numbers: units/bosses/lavagolem.js T (imported); projectile 'lavablob' is the golem's (splash, fire, a lava patch). The
// lava trail and fire immunity are the Lava trail / Fireproof abilities (A-MOVE), not the weapon.
const LV = {
  blobEvery: GT.blobEvery,         // s between blobs
  blobMin: GT.blobMin, blobMax: GT.blobMax, // px: a target in this range gets a blob
  blobFlight: GT.blobFlight,       // s in the air
  blobApex: GT.blobApex,           // px top of the lob
  blobDmg: GT.blobDmg,             // splash damage (its step)
  firstBlob: GT.firstBlob,         // s before the first blob
  throwPose: GT.throwPose,         // s of the THROW pose
  punch: GT.punch, punchJitter: GT.punchJitter, // punch damage ± (× power)
  punchEvery: GT.punchEvery,       // s
  punchReach: GT.punchReach,       // px past both bodies (× power)
  punchOut: GT.punchOut, punchUp: GT.punchUp, // toss of a punched unit (out × power)
  punchPose: GT.punchPose,         // s of the SWING pose
  charge: GT.charge,               // px: runs at targets closer than this, else walks
  readySoon: 1,                    // s: ours: a blob this close to ready → it keeps to blob range (any body, even a fast one)
  keep: 250, keepBand: 80,         // px: ... about this far (the golem itself is so slow it never had to)
};
function throwBlob(w, u, B, tx, ty) {   // from lavagolem.js throwBlob
  const p = fireProjectile(w, 'lavablob', u, tx, ty, { life: LV.blobFlight, apex: LV.blobApex, damage: LV.blobDmg, muzzle: 0.8 });
  if (p) p.z = 20;
  B.next = w.time + LV.blobEvery;
  pose(w, u, ACT.THROW); u.attack = 1;
  w.emit('throw', { x: u.x, y: u.y, v: 2, type: u.type, as: 'lavagolem' });
  shot(w, u, 'lavablob');
}
function lavaPunch(w, u, t) {   // from lavagolem.js punch (× power)
  const P = power(u), dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const pass = damage(w, t, (LV.punch + LV.punchJitter * (w.rng() - w.rng())) * P, u);
  if (t.hp > 0) { if (pass > 0.5) toss(w, t, dx / d, dy / d, LV.punchOut * P * pass, LV.punchUp * pass); else push(w, t, dx / d, dy / d, 120 * P, 0.3); }
  igniteNow(w, t);
  u.cooldown = LV.punchEvery * (0.9 + 0.2 * w.rng()); u.attack = 1;
  pose(w, u, ACT.SWING);
  w.emit('strike', { x: t.x, y: t.y, v: 2, type: u.type, as: 'lavagolem' });
  used(w, u, 'lavablob');
}
registerWeapon({
  id: 'lavablob', range: LV.blobMax,
  def: { look: { attack: { time: 0.4 } }, weapon: { range: LV.blobMax } },
  init(w, u, B) { B.next = w.time + LV.firstBlob; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, LV.throwPose); poseEnd(w, u, ACT.SWING, LV.punchPose); },
  fight(w, u, t, dx, dy, d, B) {   // from lavagolem.js brain
    const a = Math.atan2(dy, dx);
    if (d <= u.radius + t.radius + LV.punchReach * power(u) && !high(t)) {
      setState(u, STATE.ENGAGE); u.face = a;
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.9) lavaPunch(w, u, t);
      return;
    }
    if (w.time >= B.next && d >= LV.blobMin && d <= LV.blobMax && u.b.act !== ACT.THROW && canAuto(w, u)) {   // lobbed: walls don't stop it
      u.face = a;
      if (Math.abs(angleDiff(u.heading, a)) < 0.6) { throwBlob(w, u, B, t.x + t.vx * LV.blobFlight, t.y + t.vy * LV.blobFlight); return; }
    }
    if (B.next - w.time < LV.readySoon && clearLine(w, u)) { keepAt(w, u, t, dx, dy, d, LV.keep, LV.keepBand); return; }   // ours: hold blob range
    hunt(w, u, t, d < LV.charge ? u.def.runSpeed : u.def.walkSpeed, d < LV.charge ? STATE.CHARGE : STATE.ADVANCE);   // the golem's charge
  },
  possessFire(w, u, aim, ax, ay, B) {   // golem: a blob at the aim point (150-400 px), else a punch at the air
    if (w.time >= B.next && u.b.act !== ACT.THROW) { const P = aimClamp(u, aim, ax, ay, LV.blobMin, LV.blobMax); throwBlob(w, u, B, P[0], P[1]); return; }
    swing(w, u, LV.punchEvery);
  },
});

// ================================================================ spit (spitter: a lobbed glob that blinds 3 s)
// from units/dinos/spitter.js T; projectile 'spit' is the spitter's (it blinds whoever it lands on)
const SP = {
  spitMin: 60,         // px: closer than this it backs off (or bites when touching)
  spitMax: 180,        // px spit range
  flight: 0.5,         // s: the glob's flight
  apex: 28,            // px top of the arc
  spitDmg: 6,          // damage (its step blinds 3 s)
  reload: 1.6,         // s between spits
  aimTol: 0.5,         // rad
  pose: 0.45,          // s of the THROW pose (frill open)
  bite: 8,             // bite damage (× power)
  biteEvery: 0.8,      // s
  biteReach: 4,        // px past both bodies (× power)
  huntWalk: 300,       // px: walks in from farther than this, else runs
  attackTime: 0.3,     // s
};
function spitAt(w, u, B, ax, ay) {   // from spitter.js spit
  fireProjectile(w, 'spit', u, ax, ay, { life: SP.flight, apex: SP.apex, damage: SP.spitDmg, muzzle: 1.1 });
  B.next = w.time + SP.reload;
  pose(w, u, ACT.THROW); u.attack = 1;
  w.emit('throw', { x: u.x, y: u.y, v: 0.5, type: u.type, as: 'spitter' });
  shot(w, u, 'spit');
}
registerWeapon({
  id: 'spit', range: SP.spitMax,
  def: { look: { attack: { time: SP.attackTime } }, weapon: { range: SP.spitMax } },
  init(w, u, B) { B.next = w.time + SP.reload * w.rng(); },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, SP.pose); },
  fight(w, u, t, dx, dy, d, B) {   // from spitter.js brain
    const a = Math.atan2(dy, dx), P = power(u);
    if (d <= u.radius + t.radius + SP.biteReach * P) {
      setState(u, STATE.ENGAGE); u.face = a;
      if (u.cooldown <= 0) { bite(w, u, t, SP.bite * P, SP.biteEvery, 40 * P, 0.1); used(w, u, 'spit'); }
      return;
    }
    const max = u.state === STATE.ENGAGE ? SP.spitMax * 1.1 + 6 : SP.spitMax;
    if (d > max || !clearLine(w, u)) { hunt(w, u, t, d > SP.huntWalk ? u.def.walkSpeed : u.def.runSpeed); return; }
    setState(u, STATE.ENGAGE); u.face = a;
    if (d < SP.spitMin) { u.goalX = -dx / d * u.def.runSpeed; u.goalY = -dy / d * u.def.runSpeed; }   // too close: back off
    if (w.time >= B.next && Math.abs(angleDiff(u.heading, a)) < SP.aimTol && d >= 0.6 * SP.spitMin) spitAt(w, u, B, t.x + t.vx * SP.flight, t.y + t.vy * SP.flight);
  },
  possessFire(w, u, aim, ax, ay, B) {   // spitter: spit at the aim point (60-180 px)
    if (w.time < B.next) return;
    const P = aimClamp(u, aim, ax, ay, SP.spitMin, SP.spitMax);
    spitAt(w, u, B, P[0], P[1]);
  },
});

// ================================================================ snowball (yeti: lobbed snow, chills; 3 hits = frozen; the slam)
// numbers: units/secret/yeti.js T (imported); projectile 'snowball' is the yeti's (splash, chill, freeze)
const SN = {
  snowMin: YT.snowMin, snowMax: YT.snowMax, // px throw range
  snowEvery: YT.snowEvery,   // s between snowballs
  flight: YT.flight,         // s a snowball flies
  apex: YT.apex,             // px top of its arc
  snowDmg: YT.snowDmg,       // splash damage (its step chills + freezes)
  aimTol: YT.aimTol,         // rad
  slam: YT.slam,             // slam damage (× power)
  slamEvery: YT.slamEvery,   // s
  slamReach: YT.slamReach,   // px past both bodies (× power)
  slamOut: YT.slamOut, slamUp: YT.slamUp, // toss of a slammed unit (out × power)
  throwPose: 0.5,            // s of the THROW pose (yeti act 1)
  slamPose: 0.4,             // s of the SWING pose (yeti act 2)
};
function snowAt(w, u, B, ax, ay) {   // from yeti.js throwAt
  fireProjectile(w, 'snowball', u, ax, ay, { life: SN.flight, apex: SN.apex, damage: SN.snowDmg, muzzle: 0.9 });
  B.next = w.time + SN.snowEvery;
  pose(w, u, ACT.THROW); u.attack = 1;
  w.emit('throw', { x: u.x, y: u.y, v: 1.2, type: u.type, snow: 1, as: 'yeti' });
  shot(w, u, 'snowball');
}
function snowSlam(w, u, t) {   // from yeti.js slam (× power)
  const P = power(u);
  blow(w, u, t, SN.slam * P, SN.slamEvery, 0, 0, SN.slamOut * P, SN.slamUp);
  pose(w, u, ACT.SWING);
  w.emit('trample', { x: t.x, y: t.y, v: 1.5, type: u.type, as: 'yeti' });
  used(w, u, 'snowball');
}
registerWeapon({
  id: 'snowball', range: SN.snowMax,
  def: { look: { attack: { time: 0.4 } }, weapon: { range: SN.snowMax } },
  init(w, u, B) { B.next = w.time + SN.snowEvery * w.rng(); },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, SN.throwPose); poseEnd(w, u, ACT.SWING, SN.slamPose); },
  fight(w, u, t, dx, dy, d, B) {   // from yeti.js brain
    const a = Math.atan2(dy, dx), reach = u.radius + t.radius + SN.slamReach * power(u);
    if (d <= reach + 4 && inReach(t)) {
      setState(u, STATE.ENGAGE); u.face = a;
      if (d > reach) { u.goalX = dx / d * u.def.walkSpeed; u.goalY = dy / d * u.def.walkSpeed; }
      else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.8) snowSlam(w, u, t);
      return;
    }
    const max = u.state === STATE.ENGAGE ? SN.snowMax * 1.1 : SN.snowMax;
    if (d >= SN.snowMin && d <= max && clearLine(w, u) && !high(t)) {
      setState(u, STATE.ENGAGE); u.face = a;
      if (w.time >= B.next && Math.abs(angleDiff(u.heading, a)) < SN.aimTol && canAuto(w, u)) snowAt(w, u, B, t.x + t.vx * SN.flight, t.y + t.vy * SN.flight);
      return;
    }
    hunt(w, u, t, d > SN.snowMax ? u.def.walkSpeed : u.def.runSpeed, d < SN.snowMin ? STATE.ENGAGE : STATE.ADVANCE);
  },
  possessFire(w, u, aim, ax, ay, B) {   // yeti: slam whoever is in reach, else a snowball at the aim point (120-320 px)
    const v = nearestFoe(w, u, u.x, u.y, u.radius + SN.slamReach * power(u), null, null);
    if (v && inReach(v)) { if (u.cooldown <= 0) snowSlam(w, u, v); return; }
    if (w.time < B.next) { swing(w, u, SN.slamEvery * 0.4); return; }
    const P = aimClamp(u, aim, ax, ay, SN.snowMin, SN.snowMax);
    snowAt(w, u, B, P[0], P[1]);
  },
});
