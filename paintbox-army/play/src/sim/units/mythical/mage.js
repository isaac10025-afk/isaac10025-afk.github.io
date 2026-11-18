// Mage (OG "Mage", type 23): backline caster. Fireball (splash), chain lightning (+ pond shock), and the curse that
// turns the enemy with the highest strength × maxHp into a Frog for good. Blinks away when routed.
// Rules 1:1 from OG game.js:15421-15765 (our own code).
import './frog.js';
import { registerUnit } from '../../defs.js';
import { fireProjectile, registerBlast } from '../../combat/index.js';
import { transformUnit } from './turn.js';
import * as K from './_lib.js';
import { pondAt } from '../../terrain/water.js';                     // OG water.pondAt (game.js:9787-9792): a terrain function, not a world method

const FIREBALL = 0, LIGHTNING = 1, CURSE = 2, BLINK = 3;   // OG game.js:15444-15447 (N, P, I, H): spell slots
const BOLT_SPEED = 300;                                    // OG game.js:15448 (C)
const BLAST = {                                            // OG game.js:15449-15458 (F): fireball blast def
  radius: 30, damage: 30, minFalloff: 0.4, push: 170, stun: 0.3, noiseRadius: 200, hatChance: 0.2, plasma: true,
};
const BLINK_DIST = 140, BLINK_EDGE = 20;                   // OG game.js:15460-15461 (B, D)
const WINDUP = [0.35, 0.55, 0.6];                          // OG game.js:15462 (z): fireball, lightning, curse
const COOLDOWN = [2.2, 6, 9];                              // OG game.js:15568: × U(0.8, 1.2) after a cast
const SHOCK_DMG = 22, SHOCK_R = 320, SHOCK_MIN = 0.35, SHOCK_STUN = 0.6; // OG game.js:15715-15718 (X, U, V, Z)
const FROG_RAW_R = 7.5, CURSE_REF_R = 8.63;                // OG game.js:15790 (bt.radius), 15764 (it)
const OIL_TILE = 6;                                        // OG 549.a (game.js:13121): lightning lights oil in 1.5 tiles

registerBlast('mage_fireball', BLAST);

const M = {
  type: 'mage', og: 'Mage', ogId: 23,                      // OG game.js:15464-15466, id game.js:8477
  category: 'mythical',                                    // OG game.js:15467
  faction: 12,                                             // OG game.js:15468 (Mages = 12)
  radius: 8.63,                                            // OG game.js:15469
  radiusJitter: 0.06,                                      // OG game.js:15470
  mass: 1,                                                 // OG game.js:15471
  maxHp: 75,                                               // OG game.js:15472
  melee: false,                                            // OG game.js:15473
  strength: 0.9,                                           // OG game.js:15474
  locomotion: 0,                                           // OG game.js:15475 (Holonomic)
  walkSpeed: 60,                                           // OG game.js:15476
  runSpeed: 110,                                           // OG game.js:15477
  maxSpeed: 130,                                           // OG game.js:15478
  accel: 500,                                              // OG game.js:15479
  decel: 500,                                              // OG game.js:15480
  turnRate: 5,                                             // OG game.js:15481
  turnSpeedFalloff: Infinity,                              // OG game.js:15482
  sightRange: 340,                                         // OG game.js:15483
  alertSightRange: 360,                                    // OG game.js:15484
  stickyTarget: false,                                     // OG game.js:15485
  reactionTime: 0.4,                                       // OG game.js:15486
  huntRange: Infinity,                                     // OG game.js:15487
  minDistance: 180,                                        // OG game.js:15488
  drilled: false,                                          // OG game.js:15489
  intelligence: 2,                                         // OG game.js:15490 (Trained)
  seesLurkers: true,                                       // OG game.js:15491
  infectable: true,                                        // OG game.js:15492
  flammability: 0.35,                                      // OG game.js:15493
  brushSpacing: 22,                                        // OG game.js:15494
  flock: {                                                 // OG game.js:15495 = Soldier flock (game.js:9940-9948)
    personalSpace: 1.25, separation: 38, alignment: 0.3, cohesion: 0, formation: 1.2, herd: 0, herdSpacing: 0,
    flockByState: [1, 1, 0.3, 1, 0.3, 0.25], formationByState: [1, 1, 0.35, 1, 0, 0],
  },
  morale: {                                                // OG game.js:15496 = Soldier morale (game.js:9951-9965)
    baseline: 0.82, oddsWeight: 0.55, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.22, rallyAt: 0.55, minFleeTime: 2.5, dropRate: 3.2, recoverRate: 0.2, panicFear: 0.5, deathFear: 1,
  },
  look: { hat: true, attack: { time: 0.35 } },             // OG game.js:15499, 15504

  init(world, u) {                                         // OG game.js:15507-15512
    const t = world.time, s = u.b.spell = [0, 0, 0, 0];
    s[FIREBALL] = t + 2.2 * world.rng();
    s[LIGHTNING] = t + 1 + 6 * world.rng() * 0.5;
    s[CURSE] = t + 2 + 9 * world.rng() * 0.5;
    s[BLINK] = t;
    u.subState = 0; u.b.timer = 0; u.b.victim = -1;
  },

  brain(world, u) {                                        // OG game.js:15513-15701
    const b = u.b, now = world.time;
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.subState = 0; u.face = u.heading; return; } // stun cancels a windup
    const e = K.target(world, u);
    if (u.state === K.ST.FLEE) {                           // OG game.js:15518-15555
      u.subState = 0;
      if (b.spell[BLINK] <= now && u.stateTime >= 2) {
        const th = K.findNearest(world, u.x, u.y, 100, K.enemyMask(u.faction));
        if (th && blink(world, u, th)) { u.stateTime = 0; return; }
      }
      K.flee(world, u, e, M.runSpeed);
      return;
    }
    if (u.subState > 0) {                                  // windup (OG game.js:15556-15560)
      const v = K.cur(world, b.victim);
      if (v) u.face = Math.atan2(v.y - u.y, v.x - u.x);
      if (now < b.timer) return;
      const spell = u.subState - 1;
      u.subState = 0;
      if (v) cast(world, u, v, spell);
      return;
    }
    if (!e) {                                              // OG game.js:15662-15664
      if (K.pursue(world, u, M.walkSpeed, 4)) return;
      K.setState(u, K.ST.IDLE); return;
    }
    const dx = e.x - u.x, dy = e.y - u.y, d = K.hypot(dx, dy) || 0.001;
    if (!K.inRange(u, d, 320)) {                           // OG game.js:15668-15669: 320 px, 358 once engaged
      K.advanceTo(world, u, e, dx, dy, u.los === 1 || K.wallCount(world) === 0, M.walkSpeed);
      return;
    }
    K.setState(u, K.ST.ENGAGE);
    u.face = Math.atan2(dy, dx);
    K.sidestep(world, u, e, dx, dy, d, M);                 // OG game.js:15671 (495.c)
    const s = b.spell;
    if (s[LIGHTNING] <= now && d <= 260 && countNear(world, u, e) >= 3) { startCast(world, u, e, LIGHTNING); return; } // OG 15673-15682
    if (s[CURSE] <= now) {                                 // OG game.js:15683-15699
      const c = curseCandidate(world, u);
      if (c) { startCast(world, u, c, CURSE); return; }
    }
    if (s[FIREBALL] <= now) startCast(world, u, e, FIREBALL); // OG game.js:15700
  },
};

function startCast(world, u, v, n) {                       // OG game.js:15703-15709 (W)
  u.subState = n + 1;
  u.b.timer = world.time + WINDUP[n];
  u.b.victim = v.id;
  u.goalX = u.goalY = 0;
}
// OG game.js:15710-15713 (K): curse / lightning-count filter: not a prop, not Props/Strays faction.
function curseable(v) { const d = v.def; return !d.prop && d.faction !== K.FAC.Strays && d.faction !== K.FAC.Props && !d.boss && !d.machine; } // STEP6 (lead): bosses + machines (ours) can't be frogged; OG has neither

const Q = [];
function countNear(world, u, e) {                          // OG game.js:15676-15681: hittable units within 60 px of the target
  return K.queryMask(world, e.x, e.y, 60, K.hitMask(u.faction), Q, 16);
}
// OG game.js:15684-15698: hostile (+Props/Strays mask) within 240, highest strength × maxHp / 100, must beat 0.35.
function curseCandidate(world, u) {
  K.queryMask(world, u.x, u.y, 240, K.hitMask(u.faction), Q, 48);
  let o = null, best = 0.35;
  for (let k = 0; k < Q.length; k++) {
    const n = Q[k];
    if (n.hp <= 0 || !curseable(n)) continue;
    const l = (n.def.strength * n.maxHp) / 100;
    if (l > best) { best = l; o = n; }
  }
  return o;
}

function cast(world, u, v, n) {                            // OG game.js:15563-15659
  u.attack = 1;
  u.b.spell[n] = world.time + COOLDOWN[n] * K.range(world, 0.8, 1.2);
  if (n === FIREBALL) fireball(world, u, v);
  else if (n === LIGHTNING) lightning(world, u, v);
  else curse(world, v);
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1;
}

// OG game.js:15570-15594: plasma bolt at 300 px/s, led by distance/300 s, 368 px of life, 30 dmg, blast above.
function fireball(world, u, e) {
  const d = K.hypot(e.x - u.x, e.y - u.y), lead = d / BOLT_SPEED;
  const rx = e.x + e.vx * lead - u.x, ry = e.y + e.vy * lead - u.y, a = K.hypot(rx, ry) || 1, r = u.radius;
  const p = fireProjectile(world, 'plasma', u, u.x + rx, u.y + ry, {
    x: u.x + (rx / a) * r, y: u.y + (ry / a) * r, vx: (rx / a) * BOLT_SPEED, vy: (ry / a) * BOLT_SPEED,
    speed: BOLT_SPEED, life: 368 / BOLT_SPEED, damage: BLAST.damage, blast: 'mage_fireball',
  });
  if (!p) return;                                         // pool full: no sound (OG game.js:15591)
  K.emit(world, 'spell', { x: u.x, y: u.y, v: 1, type: u.type });
}

// OG game.js:15596-15637: up to 5 hits, 32 dmg ×0.75 per jump; jumps to hostile (or conductive ≥ 1.5) units.
const HIT = [];
const PONDS = new Set();
function lightning(world, u, first) {
  K.emit(world, 'lightning', { x: first.x, y: first.y });
  HIT.length = 0;
  let ox = u.x, oy = u.y, c = first, f = 32;
  const mask = K.hitMask(u.faction);
  for (let k = 0; k < 5 && c; k++) {
    HIT.push(c);
    K.emit(world, 'bolt', { x: ox, y: oy, x1: c.x, y1: c.y });
    const dx = c.x - ox, dy = c.y - oy, d = K.hypot(dx, dy) || 1;
    const w = K.damage(world, c, f, u);
    K.knock(world, c, dx / d, dy / d, 40 * w, 0.35 * w);
    K.igniteRoll(world, c, 1, 4);                          // OG game.js:15613: chance 1 × flammability, burn base 4 s
    const oil = K.oil(world); if (oil && typeof oil.ignite === 'function') oil.ignite(c.x, c.y, 1.5 * OIL_TILE);
    ox = c.x; oy = c.y; f *= 0.75;
    K.queryMask(world, ox, oy, 140, K.ALL, Q, 32);
    let next = null, best = Infinity;
    for (let j = 0; j < Q.length; j++) {
      const e = Q[j];
      if (e === u || e.hp <= 0 || HIT.includes(e)) continue;
      const cond = e.def.conductivity ?? 1;
      if (!K.inMask(mask, e) && cond < 1.5) continue;
      const l = K.hypot(e.x - ox, e.y - oy);
      if (l > 70 * cond) continue;
      if (l / cond < best) { best = l / cond; next = e; }
    }
    c = next;
  }
  if (K.waterCells(world) > 0) { // OG game.js:15633-15636
    PONDS.clear();
    const hits = HIT.slice();
    for (const s of hits) if (K.wetAt(world, s)) pondShock(world, u, s, PONDS);
  }
}
// OG game.js:15719-15762: every other wet unit in the struck unit's pond takes 22 × max(0.35, 1 − d/320), stun 0.6 × pass.
function pondShock(world, u, s, ponds) {
  const pond = pondAt(world, s.x, s.y);
  if (pond < 0 || ponds.has(pond)) return;
  ponds.add(pond);
  K.emit(world, 'watershock', { x: s.x, y: s.y });
  const us = world.units;
  for (let k = 0; k < us.length; k++) {
    const n = us[k];
    if (n.dead || n.removed || n === u || n.hp <= 0 || HIT.includes(n) || n.def.prop) continue;
    if (!K.wetAt(world, n) || pondAt(world, n.x, n.y) !== pond) continue;
    const c = K.hypot(n.x - s.x, n.y - s.y);
    HIT.push(n);
    const h = K.damage(world, n, SHOCK_DMG * Math.max(SHOCK_MIN, 1 - c / SHOCK_R), u);
    n.stun = Math.max(n.stun || 0, SHOCK_STUN * h);
  }
}

// OG game.js:15638-15656: the victim leaves its group and becomes a Frog in place, scale 7.5 / 8.63. Permanent.
function curse(world, v) {
  K.emit(world, 'curse', { x: v.x, y: v.y, v: 1, type: v.type });
  if (!curseable(v)) return;
  const oldType = v.type;
  K.groupLeave(world, v.group);
  K.emit(world, 'puff', { x: v.x, y: v.y, size: 1.4 * Math.max(1, v.radius / FROG_RAW_R), kind: 'dust' });
  const f = transformUnit(world, v, 'frog', -1, FROG_RAW_R / CURSE_REF_R);
  if (!f) return;
  f.curseType = oldType;                                   // OG stores type + 1; we store the type id (tint/hat only)
}

// OG game.js:15521-15553: blink 140 px away from the threat, offsets 0, ±0.5, ±1, ±1.5 rad.
const OFFS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5];
function blink(world, u, th) {
  const x = u.x, y = u.y;
  let rx = th ? x - th.x : -(u.threatX || 0), ry = th ? y - th.y : -(u.threatY || 0);
  if (rx * rx + ry * ry < 1e-6) { rx = -Math.cos(u.heading); ry = -Math.sin(u.heading); }
  const base = Math.atan2(ry, rx);
  for (const o of OFFS) {
    const a = base + o, px = x + Math.cos(a) * BLINK_DIST, py = y + Math.sin(a) * BLINK_DIST;
    if (px < BLINK_EDGE || py < BLINK_EDGE || px > world.W - BLINK_EDGE || py > world.H - BLINK_EDGE) continue;
    if (K.solidAt(world, px, py)) continue;
    const near = K.findNearest(world, px, py, 14 + u.radius, K.ALL);
    if (near && near !== u) continue;
    K.emit(world, 'blast', { x, y, r: 18, kind: 2 });
    u.x = u.px = px; u.y = u.py = py; u.vx = u.vy = 0;
    K.emit(world, 'blast', { x: px, y: py, r: 18, kind: 2 });
    u.b.spell[BLINK] = world.time + 10 * K.range(world, 0.9, 1.1);
    return true;
  }
  return false;
}

registerUnit(M);
