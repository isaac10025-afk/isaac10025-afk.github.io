// Unit maker: W-THROW magic weapons (OURS, Part 2 step 8, STEP8.md). Owner: W-THROW. Imported by throw.js (read its
// header for the shared rules, pose codes and bag fields). fireball + lightning (the mage's two spells, each its own
// weapon), bubble (gravity alien), firebreath (dragon's breath, from the mouth on any body), spray (bombardier, from the
// rear on any body). Projectiles / events are the sources' own: 'plasma' + blast 'mage_fireball', 'bolt' / 'lightning'
// / 'watershock' events, the 'bubble' effect projectile, 'flame', 'steampuff'.
import { registerWeapon } from '../registry.js';
import {
  STATE, hypot, angleDiff, ENEMY, setState, targetOf, canAuto, clearLine, used, power, swing, damage, high, bite, hunt,
  fireProjectile, closeOn, keepAt, meleeFight, canFloat, floatHard, spawnEffect, unitOf, advanceTo, ignite,
} from '../lib.js';
import { ACT, pose, poseEnd, poseOff, scaledMelee, brawl, aimClamp, shot, fistsFor, swat } from './throw-lib.js';
import { sidestep, infect, raycast } from '../../combat/index.js';
import { inRange, advance, closeIn, hasLos, tri, range } from '../../units/army/_shared.js';
import * as K from '../../units/mythical/_lib.js';
import { pondAt } from '../../terrain/water.js';
import '../../units/mythical/mage.js';                       // registers blast 'mage_fireball'
import { T as GV } from '../../units/space/gravity.js';      // registers effect projectile 'bubble'
import { T as BB } from '../../units/bugs/bombardier.js';

const DT = 1 / 60;

// ================================================================ fireball (mage: a plasma bolt that bursts)
// from units/mythical/mage.js (OG game.js:15444-15594)
const FI = {
  speed: 300,          // px/s bolt (OG 15448)
  reach: 368,          // px of flight (OG 15586)
  damage: 30,          // blast damage (OG 15449-15458 'mage_fireball': r 30, push 170, stun 0.3)
  windup: 0.35,        // s (OG 15462)
  cooldown: 2.2,       // s × range(0.8, 1.2) after a cast (OG 15568)
  cdLo: 0.8, cdHi: 1.2,// OG 15568
  first: 2.2,          // s × rng to the first (OG 15508)
  range: 320,          // px, 358 once engaged (OG 15668)
  minDistance: 180,    // px: backs off inside this (OG 15488)
  attackTime: 0.35,    // s (OG 15504)
};
function castFireball(w, u, B, v) {   // OG 15570-15594: led by distance / 300 s
  let tx = B.aimX, ty = B.aimY;
  if (v) { const d = hypot(v.x - u.x, v.y - u.y), lead = d / FI.speed; tx = v.x + v.vx * lead; ty = v.y + v.vy * lead; }
  const rx = tx - u.x, ry = ty - u.y, a = hypot(rx, ry) || 1, r = u.radius;
  u.attack = 1; pose(w, u, ACT.THROW);
  B.next = w.time + FI.cooldown * range(w, FI.cdLo, FI.cdHi);
  const p = fireProjectile(w, 'plasma', u, u.x + rx, u.y + ry, {
    x: u.x + (rx / a) * r, y: u.y + (ry / a) * r, vx: (rx / a) * FI.speed, vy: (ry / a) * FI.speed,
    speed: FI.speed, life: FI.reach / FI.speed, damage: FI.damage, blast: 'mage_fireball',
  });
  if (!p) return;
  w.emit('spell', { x: u.x, y: u.y, v: 1, type: u.type, as: 'mage' });
  shot(w, u, 'fireball');
}
// shared spell wind-up (mage startCast / windup branch, OG 15556-15560, 15703-15709): stands, faces the victim
function startCast(w, u, B, v) { B.phase = 1; B.phaseT = w.time; B.victim = v ? v.id : -1; u.goalX = u.goalY = 0; pose(w, u, ACT.CAST); }
function windup(w, u, B, secs, cast) {
  if (B.phase !== 1) return false;
  if (u.stun > 0) { B.phase = 0; poseOff(w, u, ACT.CAST); return false; }   // stun cancels a wind-up
  const v = B.victim >= 0 ? unitOf(w, B.victim) : null, live = v && v.hp > 0 ? v : null;
  if (live) u.face = Math.atan2(live.y - u.y, live.x - u.x);
  else if (B.victim < 0) u.face = Math.atan2(B.aimY - u.y, B.aimX - u.x);
  if (w.time - B.phaseT < secs) return true;
  B.phase = 0; poseOff(w, u, ACT.CAST);
  if (live || B.victim < 0) cast(w, u, B, live);
  return true;
}
registerWeapon({
  id: 'fireball', range: FI.range,
  def: { minDistance: FI.minDistance, look: { attack: { time: FI.attackTime } }, weapon: { range: FI.range } },
  init(w, u, B) { B.next = w.time + FI.first * w.rng(); B.phase = 0; B.phaseT = 0; B.victim = -1; B.aimX = u.x; B.aimY = u.y; B.fists = fistsFor(u); B.swatAt = 0; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, 0.35); },
  busy(w, u, B) { return windup(w, u, B, FI.windup, castFireball); },
  fight(w, u, t, dx, dy, d, B) {   // OG 15666-15700 (fireball only)
    if (swat(w, u, t, B.fists, dx, dy, d, 'fireball', B)) return;   // ours: touching: swat it
    if (!inRange(u, d, FI.range)) { advance(w, u, t, dx, dy, hasLos(w, u), u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    u.face = Math.atan2(dy, dx);
    sidestep(w, u, t, dx, dy, d, u.def);
    if (B.next <= w.time) startCast(w, u, B, t);
  },
  possessFire(w, u, aim, ax, ay, B) {   // ours: a fireball at the aim point (the mage had no ground cast)
    if (B.phase !== 0 || B.next > w.time) return;
    B.aimX = ax; B.aimY = ay; startCast(w, u, B, null);
  },
});

// ================================================================ lightning (mage: chain of 5 + pond shock)
// from units/mythical/mage.js lightning / pondShock (OG game.js:15596-15637, 15715-15762). On its own it casts at its
// target whenever ready (the mage only chose it for 3+ units near the target, between fireballs: alone that rule
// would leave it idle against lone foes).
const LT = {
  windup: 0.55,        // s (OG 15462)
  cooldown: 6,         // s × range(0.8, 1.2) (OG 15568)
  cdLo: 0.8, cdHi: 1.2,// OG 15568
  firstBase: 1,        // s: first cast 1 + 6 × rng × 0.5 (OG 15509)
  firstRand: 3,        // OG 15509
  range: 260,          // px: casts at targets this close (OG 15673)
  hits: 5,             // units in the chain (OG 15601)
  damage: 32,          // first hit, × 0.75 per jump (OG 15600, 15615)
  falloff: 0.75,       // OG 15615
  knock: 40,           // push × pass (OG 15611)
  knockStun: 0.35,     // s × pass (OG 15611)
  igniteChance: 1,     // × flammability, burn base 4 s (OG 15613)
  burnBase: 4,         // OG 15613
  oilR: 9,             // px: lights oil within 1.5 tiles (OG 549.a)
  jump: 70,            // px × conductivity to the next link (OG 15624)
  query: 140,          // px looked at around each link (OG 15617)
  shockDmg: 22,        // pond shock × max(0.35, 1 − d / 320) (OG 15715)
  shockR: 320,         // OG 15716
  shockMin: 0.35,      // OG 15717
  shockStun: 0.6,      // s × pass (OG 15718)
  minDistance: 180,    // px (mage def)
  attackTime: 0.35,    // s
};
const HIT = [], LQ = [], PONDS = new Set();
function castLightning(w, u, B, first) {   // OG 15596-15637
  u.attack = 1; pose(w, u, ACT.THROW);
  B.next = w.time + LT.cooldown * range(w, LT.cdLo, LT.cdHi);
  if (!first) { swing(w, u, 0.3); return; }   // possessed at the ground: nothing to strike
  w.emit('lightning', { x: first.x, y: first.y, as: 'mage' });
  HIT.length = 0;
  let ox = u.x, oy = u.y, c = first, f = LT.damage;
  const mask = K.hitMask(u.faction);
  for (let k = 0; k < LT.hits && c; k++) {
    HIT.push(c);
    w.emit('bolt', { x: ox, y: oy, x1: c.x, y1: c.y, as: 'mage' });
    const dx = c.x - ox, dy = c.y - oy, d = hypot(dx, dy) || 1;
    const pass = damage(w, c, f, u);
    K.knock(w, c, dx / d, dy / d, LT.knock * pass, LT.knockStun * pass);
    K.igniteRoll(w, c, LT.igniteChance, LT.burnBase);
    const oil = K.oil(w); if (oil && typeof oil.ignite === 'function') oil.ignite(c.x, c.y, LT.oilR);
    ox = c.x; oy = c.y; f *= LT.falloff;
    K.queryMask(w, ox, oy, LT.query, K.ALL, LQ, 32);
    let next = null, best = Infinity;
    for (let j = 0; j < LQ.length; j++) {
      const e = LQ[j];
      if (e === u || e.hp <= 0 || HIT.includes(e)) continue;
      const cond = e.def.conductivity ?? 1;
      if (!K.inMask(mask, e) && cond < 1.5) continue;
      const l = hypot(e.x - ox, e.y - oy);
      if (l > LT.jump * cond) continue;
      if (l / cond < best) { best = l / cond; next = e; }
    }
    c = next;
  }
  LQ.length = 0;
  if (K.waterCells(w) > 0) {   // OG 15633-15636: struck units standing in a pond shock the whole pond
    PONDS.clear();
    const n = HIT.length;
    for (let k = 0; k < n; k++) if (K.wetAt(w, HIT[k])) pondShock(w, u, HIT[k]);
  }
  HIT.length = 0;
  shot(w, u, 'lightning');
}
function pondShock(w, u, s) {   // OG 15719-15762: every other wet unit in that pond takes 22 × max(0.35, 1 − d / 320), stun 0.6
  const pond = pondAt(w, s.x, s.y);
  if (pond < 0 || PONDS.has(pond)) return;
  PONDS.add(pond);
  w.emit('watershock', { x: s.x, y: s.y, as: 'mage' });
  const us = w.units;
  for (let k = 0; k < us.length; k++) {
    const n = us[k];
    if (n.dead || n.removed || n === u || n.hp <= 0 || HIT.includes(n) || n.def.prop) continue;
    if (!K.wetAt(w, n) || pondAt(w, n.x, n.y) !== pond) continue;
    const c = hypot(n.x - s.x, n.y - s.y);
    HIT.push(n);
    const h = damage(w, n, LT.shockDmg * Math.max(LT.shockMin, 1 - c / LT.shockR), u);
    n.stun = Math.max(n.stun || 0, LT.shockStun * h);
  }
}
const PQ = new Array(48).fill(null);
function nearestTo(w, u, x, y, r) {   // possessed at the ground: the enemy nearest the aim point within r
  const n = w.queryMask(x, y, r, ENEMY[u.faction], PQ, PQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) { const o = PQ[k]; PQ[k] = null; if (!(o.hp > 0) || o.inside >= 0) continue; const d = hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
  return best;
}
registerWeapon({
  id: 'lightning', range: LT.range,
  def: { minDistance: LT.minDistance, look: { attack: { time: LT.attackTime } }, weapon: { range: LT.range } },
  init(w, u, B) { B.next = w.time + LT.firstBase + LT.firstRand * w.rng(); B.phase = 0; B.phaseT = 0; B.victim = -1; B.aimX = u.x; B.aimY = u.y; B.fists = fistsFor(u); B.swatAt = 0; },
  tick(w, u, B) { poseEnd(w, u, ACT.THROW, 0.35); },
  busy(w, u, B) { return windup(w, u, B, LT.windup, castLightning); },
  fight(w, u, t, dx, dy, d, B) {   // the mage's moves (OG 15666-15682), lightning only
    if (swat(w, u, t, B.fists, dx, dy, d, 'lightning', B)) return;   // ours: touching: swat it
    if (!inRange(u, d, LT.range)) { advance(w, u, t, dx, dy, hasLos(w, u), u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    u.face = Math.atan2(dy, dx);
    sidestep(w, u, t, dx, dy, d, u.def);
    closeIn(u, dx, dy, d, LT.range, u.def);
    if (B.next <= w.time && d <= LT.range) startCast(w, u, B, t);
  },
  possessFire(w, u, aim, ax, ay, B) {   // ours: strikes the enemy nearest the aim point (within 60 px)
    if (B.phase !== 0 || B.next > w.time) return;
    const v = nearestTo(w, u, ax, ay, 60);
    if (v) startCast(w, u, B, v);
  },
});

// ================================================================ bubble (gravity alien: floats one enemy 2.5 s, then a hard drop)
// numbers: units/space/gravity.js T (imported); the float + drop is space/_lib floatHard, the bubble look its effect kind
const BU = {
  range: GV.range,           // px: casts on enemies this close, in sight
  float: GV.float,           // s afloat
  cooldown: GV.cooldown,     // s between casts
  dropBase: GV.dropBase, dropPerMass: GV.dropPerMass, dropMax: GV.dropMax, // hard drop damage
  landHit: GV.landHit,       // whoever it lands on
  scanEvery: GV.scanEvery,   // ticks between searches
  aimPick: GV.aimPick,       // px: possessed, the floatable enemy nearest the aim point this close
  want: GV.want, band: GV.band, // px kept from the target between casts
  slap: GV.slap,             // slap up close (× power)
  attackTime: 0.3,           // s
};
function floatable(w, o) { return canFloat(w, o) && !o.def.flies; }
function castBubble(w, u, B, v) {   // from gravity.js cast
  floatHard(w, v, BU.float, u, BU.dropBase, BU.dropPerMass, BU.dropMax, BU.landHit);
  v.target = -1;
  spawnEffect(w, 'bubble', u, v, BU.float);
  B.victim = v.id; B.next = w.time + BU.cooldown; u.attack = 1;
  pose(w, u, ACT.CAST);
  u.face = Math.atan2(v.y - u.y, v.x - u.x);
  w.emit('spell', { x: v.x, y: v.y, v: 0.8, type: u.type, bubble: 1, as: 'gravity' });
  shot(w, u, 'bubble');
}
const MQ = new Array(48).fill(null);
function inSight(w, u, o) { return w.walls.count === 0 || w.walls.lineOfSight(u.x, u.y, o.x, o.y); }
function findMark(w, u, px, py, r) {   // from gravity.js: nearest floatable enemy within range and in sight
  const n = w.queryMask(px, py, r, ENEMY[u.faction], MQ, MQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = MQ[k]; MQ[k] = null;
    if (!floatable(w, o) || hypot(o.x - u.x, o.y - u.y) > BU.range || (o.unseen > 0 && hypot(o.x - u.x, o.y - u.y) > o.unseen)) continue;
    const d = hypot(o.x - px, o.y - py);
    if (d < bd && inSight(w, u, o)) { bd = d; best = o; }
  }
  return best;
}
registerWeapon({
  id: 'bubble', range: BU.range,
  def: { look: { attack: { time: BU.attackTime } }, weapon: { range: BU.range } },
  init(w, u, B) { B.next = w.time + BU.cooldown * 0.4 * w.rng(); B.victim = -1; B.slap = scaledMelee(BU.slap, u); },
  tick(w, u, B) {   // hands up while its bubble holds
    if (B.victim < 0) return;
    const v = unitOf(w, B.victim);
    if (!v || !(v.floating > w.time) || !(v.hp > 0)) { B.victim = -1; poseOff(w, u, ACT.CAST); }
  },
  idle(w, u, B) {   // no target: still bubbles a floatable enemy in range (gravity scans before its target check)
    if (w.time < B.next || u.possessed === 1 || (w.tick + u.index) % BU.scanEvery !== 0) return false;
    const m = findMark(w, u, u.x, u.y, BU.range);
    if (!m) return false;
    setState(u, STATE.ENGAGE); castBubble(w, u, B, m); return true;
  },
  fight(w, u, t, dx, dy, d, B) {   // from gravity.js brain
    if (w.time >= B.next) {
      let m = null;
      if (floatable(w, t) && d <= BU.range && clearLine(w, u)) m = t;
      else if (u.possessed !== 1 && (w.tick + u.index) % BU.scanEvery === 0) m = findMark(w, u, u.x, u.y, BU.range);
      if (m) { setState(u, STATE.ENGAGE); castBubble(w, u, B, m); return; }
    }
    if (B.victim >= 0) { const v = unitOf(w, B.victim); if (v) u.face = Math.atan2(v.y - u.y, v.x - u.x); }
    const r = meleeFight(w, u, t, B.slap, dx, dy, d);
    if (r !== 0) { if (r === 2) used(w, u, 'bubble'); return; }
    if (u.possessed === 1 || !clearLine(w, u) || d > BU.range) { closeOn(w, u, t, dx, dy, d); return; }
    keepAt(w, u, t, dx, dy, d, BU.want, BU.band);
  },
  possessFire(w, u, aim, ax, ay, B) {   // gravity: bubble the floatable enemy nearest the aim point, else an empty slap
    const m = w.time >= B.next ? findMark(w, u, ax, ay, BU.aimPick) : null;
    if (m) castBubble(w, u, B, m); else swing(w, u, BU.slap.cooldown);
  },
});

// ================================================================ firebreath (dragon: a 2 s sweeping cone of fire from the mouth)
// from units/mythical/dragon.js breath (OG game.js:1175-1186, 1450-1470, 1522-1531, 1588-1624). The dragon's bite, tail,
// roar and flight are not the breath: Fly / Roar are abilities. Stun cuts a breath short (the dragon can't be stunned).
const FR = {
  range: 220,          // px breath range (OG 1175)
  every: 1 / 40,       // s between flames (OG 1176)
  spread: 0.14,        // rad × tri (OG 1177)
  time: 2,             // s of breath (OG 1525)
  cooldown: 4.5,       // s × range(0.85, 1.15) (OG 1525, 1290-1292)
  cdLo: 0.85, cdHi: 1.15, // OG 1291
  startMul: 1.1,       // starts with the target within 1.1 × range ... (OG 1522)
  startFacing: 1.2,    // ... and facing it within 1.2 rad (OG 1522)
  minR: 2.5,           // × own radius: enemies closer than this are not aimed at (OG 1180, 1596)
  sweep: 0.75,         // rad: the flame swings aim ± 0.75 sin(2π p) (OG 1465)
  recentre: 12,        // ticks between re-aims (OG 1452)
  drift: 0.35,         // × walk: creeps along the aim while breathing (OG 1456)
  flameSpeed: 560,     // px/s × range(0.85, 1.1) (OG 1610)
  flameLife: 0.7,      // s × range(0.85, 1.1) (OG 1610)
  flameDamage: 6,      // each flame, alight (OG 1617)
  flameScale: 1.8,     // look (OG 1618)
  keep: 140,           // px: ours: keeps this far between breaths (the dragon walked in to bite)
  band: 40,            // px
  attackTime: 0.4,     // s (OG 1254)
};
// mouth on any body (ours: the dragon's long neck put its mouth 2.7 r ahead, 1.64 r up): forward × r, height × r
const MOUTH = { person: [0.5, 2.0], animal: [1.25, 1.0], beast: [1.3, 1.25], giant: [0.5, 2.3] };
const MQ2 = new Array(64).fill(null);
function breathAim(w, u) {   // OG 1588-1605: weighted mean direction of enemies 2.5 r .. 220 px within ± 1.2 rad of heading
  const n = w.queryMask(u.x, u.y, FR.range + 46, ENEMY[u.faction], MQ2, MQ2.length);
  let sx = 0, sy = 0;
  for (let k = 0; k < n; k++) {
    const e = MQ2[k]; MQ2[k] = null;
    const rx = e.x - u.x, ry = e.y - u.y, l = hypot(rx, ry) || 1;
    if (e.hp <= 0 || l > FR.range + e.radius || l < u.radius * FR.minR) continue;
    const a = Math.atan2(ry, rx);
    if (Math.abs(angleDiff(u.heading, a)) > FR.startFacing) continue;
    const h = 1 - (l / (FR.range + e.radius)) * 0.6;
    sx += Math.cos(a) * h; sy += Math.sin(a) * h;
  }
  return sx === 0 && sy === 0 ? NaN : Math.atan2(sy, sx);
}
function flame(w, u, a) {   // OG 1606-1624: an alight flame from the mouth
  const m = MOUTH[u.def.maker ? u.def.maker.body : 'person'] || MOUTH.person, r = u.radius;
  const mx = u.x + Math.cos(a) * r * m[0], my = u.y + Math.sin(a) * r * m[0], rise = r * m[1] - 8 + Math.max(0, u.z);
  const sp = FR.flameSpeed * range(w, 0.85, 1.1), life = FR.flameLife * range(w, 0.85, 1.1);
  const p = fireProjectile(w, 'flame', u, mx + Math.cos(a) * 100, my + Math.sin(a) * 100, {
    x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a, speed: sp, life, damage: FR.flameDamage,
    scale: FR.flameScale, rise, alight: 1,
  });
  if (p) u.attack = 1;
}
function startBreath(w, u, B, a) {   // OG 1523-1528
  B.phase = 1; B.until = w.time + FR.time; B.aimA = a; B.breathA = a;
  B.next = w.time + FR.cooldown * range(w, FR.cdLo, FR.cdHi);
  pose(w, u, ACT.BREATH);
  w.emit('flame', { x: u.x, y: u.y, v: 3, type: u.type, as: 'dragon' });
  shot(w, u, 'firebreath');
}
function breathTick(w, u, B) {   // OG 1450-1468: re-aim every 12 ticks, sweep, one flame per 1/40 s
  if (B.hold === 0 && (w.tick + u.index) % FR.recentre === 0) { const e = breathAim(w, u); if (e === e) B.aimA += 0.5 * angleDiff(B.aimA, e); }
  const p = 1 - (B.until - w.time) / FR.time, a = B.aimA + FR.sweep * Math.sin(p * Math.PI * 2);
  u.face = B.aimA; B.breathA = a;
  if (u.cooldown > 1e-4) return;
  u.cooldown = FR.every;
  flame(w, u, a + tri(w) * FR.spread);
}
registerWeapon({
  id: 'firebreath', range: FR.range,
  def: { look: { attack: { time: FR.attackTime } }, weapon: { range: FR.range } },
  init(w, u, B) { B.next = w.time; B.phase = 0; B.until = 0; B.aimA = 0; B.breathA = 0; B.hold = 0; B.fists = fistsFor(u); B.swatAt = 0; },   // the dragon starts with its breath ready
  busy(w, u, B) {
    if (B.phase !== 1) return false;
    if (w.time >= B.until || u.stun > 0) { B.phase = 0; B.hold = 0; poseOff(w, u, ACT.BREATH); return false; }
    setState(u, STATE.ENGAGE);
    breathTick(w, u, B);
    u.goalX = Math.cos(B.aimA) * u.def.walkSpeed * FR.drift; u.goalY = Math.sin(B.aimA) * u.def.walkSpeed * FR.drift;
    return true;
  },
  fight(w, u, t, dx, dy, d, B) {
    const m = Math.atan2(dy, dx);
    if (swat(w, u, t, B.fists, dx, dy, d, 'firebreath', B)) return;   // ours: touching (inside the breath's 2.5 r): swat it
    if (B.next <= w.time && d <= FR.startMul * FR.range && Math.abs(angleDiff(u.heading, m)) < FR.startFacing) {
      const a = breathAim(w, u);
      if (a === a) { B.hold = 0; startBreath(w, u, B, a); return; }
    }
    if (!clearLine(w, u) || d > FR.range) { advance(w, u, t, dx, dy, hasLos(w, u), d > FR.range * 1.5 ? u.def.walkSpeed : u.def.runSpeed); return; }
    keepAt(w, u, t, dx, dy, d, FR.keep, FR.band);
  },
  possessFire(w, u, aim, ax, ay, B) {   // ours: breathe along the aim (the dragon had no ground breath); it holds that line
    if (B.phase !== 0 || B.next > w.time) return;
    B.hold = 1; startBreath(w, u, B, aim);
  },
});

// ================================================================ spray (bombardier: turns its back and sprays boiling liquid)
// numbers: units/bugs/bombardier.js T (imported). From the rear of any body.
const SR = {
  range: BB.range,           // px from the rear (+ the victim's body)
  cone: BB.cone,             // rad full width
  sprayTime: BB.sprayTime,   // s of spraying ...
  puffEvery: BB.puffEvery,   // ... a puff every 0.25 s
  puffs: 4,                  // puffs per spray (bombardier spraying())
  puffDmg: BB.puffDmg,       // per puff
  ignite: BB.ignite,         // per puff: catches fire with this × flammability
  reload: BB.reload,         // s from the end of a spray to the next
  turnTol: BB.turnTol,       // rad: its back must point this close at the target ...
  turnMax: BB.turnMax,       // ... or it sprays anyway after this long
  standGap: BB.standOff - 2 * BB.radius * 1.1, // px past both bodies: waits here for the reload (bombardier stand-off 42 c-to-c)
  bite: BB.bite, biteEvery: BB.biteEvery, // when it can't spray (× power)
  stunCut: 0.3,              // s: a stun longer than this stops a spray
  turnRate: 9,               // rad/s: turns its back at least this fast on any body (the bombardier's own turn rate)
  attackTime: 0.3,           // s
};
const SQ = new Array(32).fill(null);
function puff(w, u) {   // from bombardier.js puff: everyone hostile in the rear cone within range, not through walls
  const back = u.heading + Math.PI, bx = Math.cos(back), by = Math.sin(back);
  const rx = u.x + bx * u.radius, ry = u.y + by * u.radius, half = SR.cone / 2;
  const n = w.queryMask(rx, ry, SR.range + 46, ENEMY[u.faction], SQ, SQ.length);
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (o.dead || !(o.hp > 0) || high(o) || o.inside >= 0 || o.def.prop) continue;
    const dx = o.x - rx, dy = o.y - ry, d = hypot(dx, dy);
    if (d > SR.range + o.radius) continue;
    if (d > o.radius && Math.abs(angleDiff(back, Math.atan2(dy, dx))) > half + Math.asin(Math.min(1, o.radius / d))) continue;
    if (w.walls.count > 0 && raycast(w, rx, ry, o.x, o.y) <= 1) continue;
    const pass = damage(w, o, SR.puffDmg, u, undefined, rx, ry);
    if (u.def.risenFrom !== undefined) infect(w, o, u, 0.3 * pass, 0);
    if (pass >= 0.5) ignite(w, o, SR.ignite);
  }
  u.attack = 1;
  w.emit('steampuff', { x: rx + bx * SR.range * 0.45, y: ry + by * SR.range * 0.45, type: u.type, as: 'bombardier' });
}
function startSpray(w, u, B) {   // from bombardier.js startSpray
  B.phase = 2; B.t0 = w.time; B.k = 0;
  pose(w, u, ACT.SPRAY);
  const back = u.heading + Math.PI;
  w.emit('steam', { x: u.x + Math.cos(back) * u.radius * 2, y: u.y + Math.sin(back) * u.radius * 2, size: 12, type: u.type, as: 'bombardier' });
  shot(w, u, 'spray');
}
/** Slow-turning bodies get the bombardier's turn speed for the spin (steering adds the body's own turn on top). */
function whip(u, want) {
  const extra = (SR.turnRate - u.def.turnRate) * DT, diff = angleDiff(u.heading, want);
  if (extra > 0) u.heading += Math.sign(diff) * Math.min(Math.abs(diff), extra);
}
function stopSpray(w, u, B) { B.phase = 0; B.next = w.time + SR.reload; poseOff(w, u, ACT.SPRAY); }
registerWeapon({
  id: 'spray', range: SR.range,
  def: { look: { attack: { time: SR.attackTime } }, weapon: { range: SR.range } },
  init(w, u, B) { B.next = w.time + SR.reload * w.rng(); B.phase = 0; B.t0 = 0; B.t1 = 0; B.k = 0; },
  busy(w, u, B) {   // spraying: keeps its rear on the target, 4 puffs over 1 s (bombardier spraying)
    if (B.phase !== 2) return false;
    if (u.stun > SR.stunCut) { stopSpray(w, u, B); return false; }
    const t = targetOf(w, u), el = w.time - B.t0;
    u.face = t ? Math.atan2(t.y - u.y, t.x - u.x) + Math.PI : u.heading;
    setState(u, STATE.ENGAGE);
    while (B.k < SR.puffs && el >= B.k * SR.puffEvery) { B.k++; puff(w, u); }
    if (el >= SR.sprayTime) stopSpray(w, u, B);
    return true;
  },
  idle(w, u, B) { if (B.phase === 1) { B.phase = 0; poseOff(w, u, ACT.SPRAY); } return false; },
  holdsNerve(w, u, B) { return B.phase === 2; },
  fight(w, u, t, dx, dy, d, B) {   // from bombardier.js brain
    const a = Math.atan2(dy, dx), now = w.time, P = power(u);
    const inR = d <= SR.range + u.radius + t.radius && !high(t);
    if (B.phase === 1) {   // turning its back to the target
      setState(u, STATE.ENGAGE); u.face = a + Math.PI; whip(u, a + Math.PI);
      if (!inR) { B.phase = 0; poseOff(w, u, ACT.SPRAY); }
      else if (Math.abs(angleDiff(u.heading, a + Math.PI)) < SR.turnTol || now - B.t1 > SR.turnMax) startSpray(w, u, B);
      return;
    }
    if (inR && now >= B.next && canAuto(w, u) && clearLine(w, u)) {
      B.phase = 1; B.t1 = now; pose(w, u, ACT.SPRAY);
      setState(u, STATE.ENGAGE); u.face = a + Math.PI;
      return;
    }
    if (d <= u.radius + t.radius + 4 * P) {   // touching, spray not ready: bite
      setState(u, STATE.ENGAGE); u.face = a;
      if (u.cooldown <= 0 && !high(t)) { bite(w, u, t, SR.bite * P, SR.biteEvery, 30 * P, 0); used(w, u, 'spray'); }
      return;
    }
    if (d < u.radius + t.radius + SR.standGap && now < B.next) { setState(u, STATE.ENGAGE); u.face = a; return; }   // close enough: wait
    hunt(w, u, t, d < 220 ? u.def.runSpeed : u.def.walkSpeed, d < 220 ? STATE.CHARGE : STATE.ADVANCE);
  },
  possessFire(w, u, aim, ax, ay, B) {   // bombardier: swings its rear to the aim at once and sprays there
    if (B.phase !== 0 || w.time < B.next) return;
    u.face = aim + Math.PI; u.heading = aim + Math.PI;
    startSpray(w, u, B);
  },
});
