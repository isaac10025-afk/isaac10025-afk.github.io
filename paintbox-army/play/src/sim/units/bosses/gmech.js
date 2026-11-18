// Giant mech (OURS, Bosses tab, Part 2 step 6): a towering walker, machine + metal. Wades through water unharmed.
// Missiles: every 7 s at a target 200-700 px away, a salvo of 8 (projectile `missile`: they curve up and home a
// little, blast r 35 for 45). Chest laser: every 9 s a 2 s sweep over 60 degrees, range 400, 50 dps to everyone on the
// beam up to the first wall, sets the flammable alight. Stomp: an enemy within r + 25 -> it lifts a foot (0.6 s) and
// stomps: 150 under the foot, a shockwave r 110 (40 falling off, knocked down 0.8 s). At 0 hp it breaks down: sparks
// for 1.5 s (no longer a target), then blows up (r 120, 200) and its killer gets the kill. Owner: BOSSES-SIM.
// Pose (STEP6.md): b.act 1 missiles -> `missiles` (shoulder pods open), 2 laser -> `laser` (art reads b.beamA rad,
// world angle, and b.beamL px, as for the laser bot), 3 stomp -> `stomp` (foot up 0.6 s from b.actT, then down 0.35 s),
// 4 breaking down -> `dying` (1.5 s from b.actT). Missile projectile `missile`: p.z = height (px), velocity = heading.
// Systems: 'bosses-gmech-dying' (after water: 0 hp starts the break-down instead of dying).
import { removeProjectile, spawnProjectile } from '../../combat/projectiles.js';
import { registerProjectileKind } from '../../combat/projectiles.js';
import { registerBlast, explode, ignite } from '../../combat/index.js';
import { registerSystem } from '../../systems/extra.js';
import { raycast } from '../../combat/env.js';
import {
  boss, initBag, targetOf, setState, act, canAuto, shrug, hittable, high, grounded, hunt, idle, enemyClose, stompRing,
  damage, splatNoise, hypot, angleDiff, STATE, ENEMY, BOSS, INT, TAU, DT,
} from './_lib.js';

const T = {
  radius: 32, hp: 8000, mass: 80,   // STEP6 size
  walk: 22, run: 35,                // px/s
  charge: 600,                      // px: a target closer than this -> it marches at run speed (walking in under fire got it shot to bits)
  waterPace: 0.8,                   // wades through water (x speed in water)
  missileEvery: 7,                  // s between salvos
  missileMin: 200, missileMax: 700, // px: a target in this range gets a salvo
  missiles: 8,                      // per salvo ...
  missileGap: 0.12,                 // ... one every 0.12 s
  missileSpeed: 240,                // px/s over the ground
  missileApex: 70,                  // px: top of the arc (it curves up, then down)
  missileHome: 1.2,                 // rad/s it turns toward its target ("home a little")
  missileSpread: 40,                // px: each missile aims this far around its target
  missileBlast: 35,                 // blast radius ...
  missileDmg: 45,                   // ... and damage each
  missilePose: 1.2,                 // s of the `missiles` pose
  laserEvery: 9,                    // s between sweeps
  laserTime: 2,                     // s a sweep lasts ...
  laserArc: Math.PI / 3,            // ... over 60 degrees (centred on its target)
  laserRange: 400,                  // px (stopped by walls)
  laserDps: 50,                     // damage per second on the beam (dealt every tick)
  laserIgnite: 1,                   // ignites the flammable: chance per 0.1 s on the beam x flammability (metal never: 0)
  laserWidth: 8,                    // px past a unit's radius: still on the beam (a thick chest beam)
  laserChest: 0.45,                 // x radius: the chest lens sits this far in front of its middle
  stompTrigger: 25,                 // px past both bodies: an enemy this close starts a stomp
  stompEvery: 2.5,                  // s between stomps
  stompLift: 0.6,                   // s the foot is up before it comes down
  stompPose: 0.35,                  // s of the stomp pose after it lands
  stompUnder: 12,                   // px past both bodies: under the foot ...
  stompDmg: 150,                    // ... crushed for 150
  stompRing: 110,                   // px from its body's edge: the shockwave ...
  stompRingDmg: 40,                 // ... 40 at its feet, falling off to 0 at the edge
  stompKnock: 0.8,                  // s knocked down (everyone in the ring)
  stompPush: 260,                   // push outward (÷ mass), falling off like the damage
  dieTime: 1.5,                     // s of sparks before it blows
  dieBlast: 120,                    // blast radius ...
  dieDmg: 200,                      // ... and damage when it blows
  firstMissile: 1.5,                // s after it is placed before its first salvo
  firstLaser: 3,                    // s after it is placed before its first sweep
};
const MISSILE_BLAST = registerBlast('gmech_missile', { radius: T.missileBlast, damage: T.missileDmg, minFalloff: 0.3, push: 150, stun: 0.3, noiseRadius: 320, hatChance: 0.4 });
const DIE_BLAST = registerBlast('gmech_wreck', { radius: T.dieBlast, damage: T.dieDmg, minFalloff: 0.2, push: 400, stun: 0.8, tossUp: 260, tossSpeed: 260, tossFrom: 0.4, noiseRadius: 700, hatChance: 0.8 });
const MISS = 1, LASER = 2, STOMP = 3, DYING = 4;   // b.act codes (STEP6.md)

// ---------------------------------------------------------------- missiles (projectile kind 'missile')
// p.host = target unit id (-1: a point), p.apex = arc top, p.z = height; flight time fixed at launch (distance / speed).
function stepMissile(w, p, i) {
  p.px = p.x; p.py = p.y;
  const t = p.host >= 0 ? w.unitById(p.host) : null;
  if (t && t.hp > 0 && p.life > 0.05) {   // home a little: turn the ground velocity toward the target
    const want = Math.atan2(t.y - p.y, t.x - p.x), cur = Math.atan2(p.vy, p.vx), sp = hypot(p.vx, p.vy);
    const da = angleDiff(cur, want), turn = Math.max(-T.missileHome * DT, Math.min(T.missileHome * DT, da));
    const dist = hypot(t.x - p.x, t.y - p.y), need = dist / Math.max(0.05, p.life);
    const nsp = sp + Math.max(-60 * DT, Math.min(60 * DT, need - sp));   // eases its pace so it comes down near the target
    p.vx = Math.cos(cur + turn) * nsp; p.vy = Math.sin(cur + turn) * nsp;
  }
  p.x += p.vx * DT; p.y += p.vy * DT;
  p.life -= DT;
  const f = 1 - p.life / p.maxLife;
  p.z = 4 * p.apex * f * (1 - f) + 6 * (1 - f);   // leaves the pod a little up, arcs, comes down
  const low = p.z < 10, wall = low && w.walls.count > 0 && w.walls.isSolidAt(p.x, p.y);
  if (p.life <= 0 || wall || p.x < 0 || p.y < 0 || p.x > w.W || p.y > w.H) {
    explode(w, Math.max(0, Math.min(w.W, p.x)), Math.max(0, Math.min(w.H, p.y)), MISSILE_BLAST, p.owner);
    removeProjectile(w, i);
  }
}
registerProjectileKind('missile', stepMissile);

const MQ = new Array(64);
// One missile from a shoulder pod at (tx, ty), homing on `t` if given.
function launch(w, u, t, tx, ty) {
  const side = (u.b.k & 1) ? 1 : -1, h = u.heading, px = u.x - Math.sin(h) * side * u.radius * 0.6, py = u.y + Math.cos(h) * side * u.radius * 0.6;
  const ax = tx + T.missileSpread * (w.rng() - w.rng()), ay = ty + T.missileSpread * (w.rng() - w.rng());
  const d = Math.max(40, hypot(ax - px, ay - py)), life = d / T.missileSpeed;
  const a = Math.atan2(ay - py, ax - px) + 0.5 * (w.rng() - w.rng());   // fans out of the pods, then homes in
  const p = spawnProjectile(w, 'missile', px, py, Math.cos(a) * T.missileSpeed, Math.sin(a) * T.missileSpeed, life, T.missileDmg, u.faction, u);
  if (!p) return;
  p.host = t ? t.id : -1; p.apex = T.missileApex * Math.min(1.4, 0.6 + d / 500); p.z = 6;
  w.emit('shot', { x: px, y: py, v: 1.5, type: u.type, missile: 1 });   // STEP6 AUDIO: missile whoosh
  if (w.stats) w.stats.shots++;
}
// Salvo: 8 missiles over ~1 s at the target and the enemies around it (or at a point when possessed at nobody).
function salvoStep(w, u) {
  const b = u.b;
  if (b.k >= T.missiles || w.time < b.t1) return;
  b.t1 = w.time + T.missileGap;
  let t = b.victim >= 0 ? w.unitById(b.victim) : null;
  if (t && !(t.hp > 0)) t = null;
  if (b.k > 0 && t) {   // spread: every other missile picks an enemy near the main target
    const n = w.queryMask(t.x, t.y, 120, ENEMY[u.faction], MQ, MQ.length);
    if (n > 1 && (b.k & 1)) { const o = MQ[Math.floor(w.rng() * n)]; if (hittable(u, o) && !o.def.prop) t = o; }
    for (let k = 0; k < n; k++) MQ[k] = null;
  }
  if (t) launch(w, u, t, t.x, t.y); else launch(w, u, null, b.x0, b.y0);
  b.k++;
  u.attack = 1; u.firedAt = w.time;
  splatNoise(w, u.x, u.y, 1, 500);
}
function startSalvo(w, u, t, x, y) {
  const b = u.b;
  b.k = 0; b.t1 = w.time; b.victim = t ? t.id : -1; b.x0 = x; b.y0 = y;
  b.next = w.time + T.missileEvery;
  act(w, u, MISS);
}

// ---------------------------------------------------------------- chest laser
const LQ = new Array(128);
function laserStep(w, u) {
  const b = u.b, f = Math.min(1, (w.time - b.actT) / T.laserTime);
  const a = b.t0 - T.laserArc / 2 + T.laserArc * f;   // sweeps across its arc
  b.beamA = a;
  u.face = a;
  const ox = u.x + Math.cos(a) * u.radius * T.laserChest, oy = u.y + Math.sin(a) * u.radius * T.laserChest;
  const R = T.laserRange * u.shrink, ex = ox + Math.cos(a) * R, ey = oy + Math.sin(a) * R;
  const hit = w.walls.count > 0 ? raycast(w, ox, oy, ex, ey) : Infinity, L = hit <= 1 ? hit * R : R;
  b.beamL = L;
  {   // everyone on the beam, every tick (ignite rolls every 0.1 s)
    const roll = w.time >= b.t1;
    if (roll) b.t1 += 0.1;
    const cx = ox + Math.cos(a) * L / 2, cy = oy + Math.sin(a) * L / 2, c = Math.cos(a), s = Math.sin(a);
    const n = w.queryMask(cx, cy, L / 2 + BOSS.MARGIN + T.laserWidth, ENEMY[u.faction], LQ, LQ.length);
    for (let k = 0; k < n; k++) {
      const o = LQ[k]; LQ[k] = null;
      if (!hittable(u, o) || high(o) && o.z > 60) continue;
      const rx = o.x - ox, ry = o.y - oy, along = rx * c + ry * s;
      if (along < 0 || along > L + o.radius) continue;
      if (Math.abs(rx * s - ry * c) > o.radius + T.laserWidth) continue;
      damage(w, o, T.laserDps * DT, u, 'fire', ox, oy);
      if (roll && o.hp > 0) ignite(w, o, T.laserIgnite);
    }
  }
  if (f >= 1) { act(w, u, 0); b.beamL = 0; b.next2 = w.time + T.laserEvery; }
}
function startLaser(w, u, aim) {
  const b = u.b;
  b.t0 = aim; b.t1 = w.time; b.beamA = aim - T.laserArc / 2; b.beamL = 0;
  act(w, u, LASER);
  w.emit('charge', { x: u.x, y: u.y, v: 2, type: u.type, laser: 1 });   // STEP6 AUDIO: laser hum
}

// ---------------------------------------------------------------- stomp
function startStomp(w, u) {
  const b = u.b;
  b.next3 = w.time + T.stompEvery; b.t0 = w.time;
  act(w, u, STOMP); u.subState = 1;   // 1: foot up, 2: landed
  w.emit('rear', { x: u.x, y: u.y, type: u.type });
}
function stompStep(w, u) {
  const b = u.b, age = w.time - b.actT;
  if (u.subState === 1 && age >= T.stompLift) {
    u.subState = 2;
    const fx = u.x + Math.cos(u.heading) * u.radius * 0.5, fy = u.y + Math.sin(u.heading) * u.radius * 0.5;
    stompRing(w, u, fx, fy, T.stompUnder, T.stompDmg, T.stompRing * u.shrink, T.stompRingDmg, T.stompKnock, T.stompPush);
    u.attack = 1;
  } else if (u.subState === 2 && age >= T.stompLift + T.stompPose) { u.subState = 0; act(w, u, 0); }
}

// ---------------------------------------------------------------- brain
function brain(w, u) {
  const b = u.b, now = w.time;
  shrug(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.dodgeTime = 0;
  if (b.dying) { u.vx *= 0.9; u.vy *= 0.9; return; }
  salvoStep(w, u);                                   // a salvo keeps launching whatever else it does
  if (b.act === MISS && b.k >= T.missiles && now - b.actT > T.missilePose) act(w, u, 0);
  if (b.act === LASER) { laserStep(w, u); setState(u, STATE.ENGAGE); return; }
  if (b.act === STOMP) { stompStep(w, u); u.face = u.heading; setState(u, STATE.ENGAGE); return; }
  const t = targetOf(w, u);
  if (now >= b.next3 && canAuto(w, u) && enemyClose(w, u, T.stompTrigger)) { startStomp(w, u); return; }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const shootable = !high(t) || t.z < 200;
  if (b.act !== MISS && now >= b.next && d >= T.missileMin && d <= T.missileMax && shootable) startSalvo(w, u, t, t.x, t.y);
  else if (b.act === 0 && now >= b.next2 && d <= T.laserRange * u.shrink + t.radius && (u.los === 1 || w.walls.count === 0)) { startLaser(w, u, a); return; }
  if (d <= u.radius + t.radius + T.stompTrigger * 0.6) { setState(u, STATE.ENGAGE); u.face = a; return; }
  hunt(w, u, t, d < T.charge ? T.run : T.walk, d < T.charge ? STATE.CHARGE : STATE.ADVANCE);
}

// ---------------------------------------------------------------- breaking down (run by the 'bosses-gmech-dying' system)
function startDying(w, u) {
  const b = u.b;
  b.dying = 1; act(w, u, DYING); u.subState = 0; b.beamL = 0; b.k = T.missiles;
  b.kBy = u.harmBy; b.kType = u.harmByType; b.kFac = u.harmByFaction; b.kAt = u.harmByAt; b.kCause = u.harmCause;
  u.hp = 1; u.hidden = 0.001; u.target = -1;   // hidden: nobody targets a wreck that is about to blow
  w.emit('spark', { x: u.x, y: u.y - u.radius, ang: -Math.PI / 2, size: 2 });
}
function dyingStep(w, u) {
  const b = u.b, age = w.time - b.actT;
  u.hidden = 0.001; u.goalX = 0; u.goalY = 0;
  if (u.hp < 1) u.hp = 1;
  if ((w.tick + u.index) % 6 === 0) w.emit('spark', { x: u.x + u.radius * (w.rng() - 0.5), y: u.y - u.radius * w.rng(), ang: w.rng() * TAU, size: 1.5 });
  if (age < T.dieTime) return;
  b.dying = 2; u.hidden = 0;
  explode(w, u.x, u.y, DIE_BLAST, u);                    // its own blast can't hurt it (damageMul 0 while dying)
  u.harmBy = b.kBy; u.harmByType = b.kType; u.harmByFaction = b.kFac; u.harmByAt = b.kAt; u.harmCause = b.kCause;   // its killer gets the kill
  u.hp = 0;
}

const D = boss({
  type: 'gmech', og: 'Giant mech (ours)',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 40, melee: false,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 50, accel: 120, decel: 200, turnRate: 1.2,
  intelligence: INT.Trained, machine: true, metal: true, flammability: 0, density: 10,
  waterPace: T.waterPace, wades: true,   // wades through water (robots' short-out rule reads def.wades)
  weapon: { range: T.missileMax },   // possess: aim reach
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.beamA = 0; b.beamL = 0; b.dying = 0; b.k = T.missiles;
    b.next = w.time + T.firstMissile; b.next2 = w.time + T.firstLaser; b.next3 = w.time;
    b.kBy = -1; b.kType = null; b.kFac = -1; b.kAt = 0; b.kCause = 0;
  },
  damageMul(w, u) { return u.b.dying ? 0 : 1; },
  possessMove(w, u) { if (u.b.dying) { u.goalX = 0; u.goalY = 0; } },   // a breaking-down wreck can't be walked
  // possessed, attack held at nobody: missiles at the aim point, else a laser sweep across the aim, else a stomp
  possessFire(w, u, aim, ax, ay) {
    const b = u.b, now = w.time;
    if (b.dying || b.act === LASER || b.act === STOMP) return;
    if (now >= b.next && b.act !== MISS) {
      let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.max(T.missileMin, Math.min(T.missileMax, d)) / d;
      startSalvo(w, u, null, u.x + dx * k, u.y + dy * k); return;
    }
    if (now >= b.next2 && b.act === 0) { startLaser(w, u, aim); return; }
    if (now >= b.next3 && b.act === 0) startStomp(w, u);
  },
  brain,
});

// After water (before deaths are processed): 0 hp starts the break-down instead of dying; a breaking mech holds on.
function dyingGuard(w) {
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.def !== D || u.dead) continue;
    if (u.b.dying === 1) dyingStep(w, u);
    else if (u.b.dying === 0 && !(u.hp > 0)) startDying(w, u);
  }
}
registerSystem('bosses-gmech-dying', dyingGuard, 'water');

export default D;
export { T };
