// Unit maker: W-MELEE weapons (OURS, Part 2 step 8, STEP8.md). Owner: W-MELEE.
// The 13 held-melee weapons: sword, club, halberd, cutlass, dagger, fists, slam, shove, floatpunch here; anchor, bat,
// ram, saw in melee-tricks.js (imported at the bottom). Each = the source unit's attack with the source's numbers (its
// T table is copied below with a cite), on any body and size: damage, reach and push × power(u) (the size step), mass
// limits (toss / float) × power². Melee closes at RUN speed (melee-lib close()). Every event carries `as: '<source>'`;
// used(w, u, id) is called on every blow that lands. State lives in the weapon's bag (u.b.wb), made in init.
//
// Where a made unit differs from the source units (all for the same reason: a made unit fights alone or in a mixed crowd,
// under fire from every side, and the source rule left it dying before its first blow; tests/maker.test.mjs matrix):
//  - it steps in at RUN speed inside its band too (sources: walk × 0.6 or their own number), so backing-off gunmen are
//    caught (melee-lib fight());
//  - with its own target out of reach and another enemy in reach (a shield line or a boar in its face), it hits that
//    one (melee-lib reachable(); the sources only hit their target);
//  - wind-ups run every tick (tick hook) and a started swing always comes round (anchor, bat; the club as the stun-immune
//    giant; the slam waits to land if thrown); the sources dropped them on any stun / toss;
//  - wind-ups start as it comes in (bat: swing reach + the step-in during the wind; slam: + the lunge before the fists
//    land; ram: + its run during the pull, then it holds pulled back until its man is on the head);
//  - a whiffed slam / ram blow is ready again in 0.3 s (sources: the full cooldown);
//  - the bat swing comes round on the nearest enemy in reach when its man got away; the anchor's arc goes where it wound
//    up to (anchor.js: its heading);
//  - the saw run rolls at 200 px/s × the unit's speed step; the dagger's ×2 is from the target's rear 120° (the Blink
//    ability lands it there; teleporter.js: the first stab after its own blink).
// What the art reads (ART-BODY / ART-WEAPONS; besides u.attack, which every blow sets to 1):
//   sword, cutlass, dagger, floatpunch, shove, club: u.attack only (the hold class's plain attack pose; the club's
//             sweep also emits a silent 'blast' ring at its head, as the giant).
//   halberd   u.b.act ACT.AIM while it is SET against a charge (polearm planted, level; held 0.35 s after the blow).
//   fists     u.b.act ACT.COMBO for each jab (bag.arm 0 = left, 1 = right), ACT.SWING for the uppercut.
//   slam      u.b.act ACT.WIND while the fists go up (0.27 s), ACT.SWING from the slam to the end of the recover.
//             The slam ring on the ground: fx.js draws the 'blast' event (r = the ring) + fx-mine-melee.js OVER.slam.
import { registerWeapon } from '../registry.js';
import { STATE, hypot, angleDiff, setState, damage, push, stun, toss, canAuto, ENEMY } from '../lib.js';
import { findCharger, stillCharging } from '../../units/siege/_lib.js';
import { tossable } from '../../units/sports/_lib.js';
import { shoved } from '../../units/sports/_lib.js';
import { perchOf } from '../../combat/index.js';
import {
  ACT, M, NEAR, used, scale, heavy, signed, range, pose, unpose, poseAge, poseFor, close, fight, hit, empty, iceCrack, airborne, lowFlyer, reachable,
} from './melee-lib.js';

const Q = new Array(64).fill(null);   // query scratch (club, slam, shove)

// ================================================================ sword (legion's gladius)
// from units/army/legion.js SWORD (OG game.js:4598-4637). The shield is the Shield ability, not part of the sword.
const SWORD = Object.freeze({
  reach: 14,          // reach = r + r_target + 14 (OG game.js:4619)
  band: 10,           // engage band = reach + 10 (OG game.js:4620)
  facing: 0.5,        // strike only within 0.5 rad (OG game.js:4628)
  damage: 38,         // 38 + 5·signed() (OG game.js:4631)
  jitter: 5,          // OG game.js:4631
  push: 130,          // 130·m (OG game.js:4632)
  stun: 0.2,          // 0.2·m (OG game.js:4632)
  cooldown: 0.9,      // 0.9 + 0.3·next() (OG game.js:4635)
  cdJit: 0.3,         // OG game.js:4635
  initCd: 0.9,        // init 0.9·next() (OG game.js:4598)
  circle: 1,          // circling ×1 with back-step (OG game.js:4637)
  attackTime: 0.35,   // attack pose time (OG game.js:4595)
});
function swordStrike(w, u, t, dx, dy, d, bag) {
  hit(w, u, t, scale(u, SWORD.damage + SWORD.jitter * signed(w)), bag.push, SWORD.stun, 'legion', 1);
  u.cooldown = SWORD.cooldown + SWORD.cdJit * w.rng();
  used(w, u, 'sword');
}
registerWeapon({
  id: 'sword', range: 0,
  def: { look: { attack: { time: SWORD.attackTime } } },
  init(w, u, bag) {
    bag.W = { reach: scale(u, SWORD.reach), band: scale(u, SWORD.band), facing: SWORD.facing, circle: SWORD.circle, backStep: true };
    bag.push = scale(u, SWORD.push);
    u.cooldown = SWORD.initCd * w.rng();
  },
  fight(w, u, t, dx, dy, d, bag) { if (fight(w, u, t, bag.W, dx, dy, d, swordStrike, bag) === 0) close(w, u, t, dx, dy, d); },
  possessFire(w, u) { empty(w, u, SWORD.cooldown, 'legion'); },
});

// ================================================================ club (giant's sweep: hits ALL in the arc)
// from units/mythical/giant.js swingHit (OG game.js:17201-17239) + its in-reach brain (OG game.js:17362-17381).
const CLUB = Object.freeze({
  reach: 22,          // hit reach past both radii (OG game.js:17202, 22 without a tree)
  approach: 0.8,      // engages at r + r_t + 0.8 × 22 (OG game.js:17281)
  arc: 1.1,           // ± rad in front (OG game.js:17211)
  damage: 75,         // 75 ± 8 (OG game.js:17212)
  jitter: 8,          // OG game.js:17212
  tossMass: 2.5,      // victims lighter than this (× power²) may be tossed (OG game.js:17214)
  tossPass: 0.6,      // ... when the blow passed this well (OG game.js:17214)
  tossChance: 0.5,    // ... half the time (OG game.js:17214)
  tossOut: 170,       // px/s out (× pass) (OG game.js:17214)
  tossUp: 420,        // px/s up (× pass) (OG game.js:17214)
  push: 260,          // knock (× pass) for the rest (OG game.js:17215)
  stun: 0.5,          // s (× pass) (OG game.js:17215)
  windup: 0.09,       // s from the swing start to the blow (OG game.js:17378)
  cooldown: 1.5,      // s × range(0.85, 1.15) (OG game.js:17377)
  cdLo: 0.85,         // OG game.js:17377
  cdHi: 1.15,         // OG game.js:17377
  facing: 0.5,        // rad (OG game.js:17366)
  puff: 2.2,          // dust puff size at the head (OG game.js:17219)
  ring: 34,           // px: the 'blast' ring at the head (OG game.js:17220)
  initCd: 1.5,        // init 1.5·next() (OG game.js:17135)
  attackTime: 0.6,    // OG game.js:17132
});
let _cu = null, _cw = null, _cn = 0;
function clubSwing(w, u) {
  const x = u.x, y = u.y, h = u.heading, reach = scale(u, CLUB.reach), tm = heavy(u, CLUB.tossMass);
  _cn = 0;
  const n = w.queryMask(x, y, u.radius + reach + M.MARGIN, ENEMY[u.faction], Q, Q.length);
  for (let k = 0; k < n; k++) {
    const f = Q[k]; Q[k] = null;
    if (!(f.hp > 0)) continue;
    const dx = f.x - x, dy = f.y - y, r = hypot(dx, dy) || 0.001;
    if (r > u.radius + f.radius + reach) continue;
    if (Math.abs(angleDiff(h, Math.atan2(dy, dx))) > CLUB.arc) continue;
    const p = damage(w, f, scale(u, CLUB.damage + CLUB.jitter * signed(w)), u);
    if (f.mass < tm && p > CLUB.tossPass && w.rng() < CLUB.tossChance) toss(w, f, dx / r, dy / r, scale(u, CLUB.tossOut) * p, CLUB.tossUp * p);
    else { push(w, f, dx / r, dy / r, scale(u, CLUB.push) * p, CLUB.stun * p); if (CLUB.stun * p > 0 && !(f.climb > 0)) stun(w, f, CLUB.stun * p); }
    _cn++;
  }
  const off = u.radius + 0.7 * reach, px = x + Math.cos(h) * off, py = y + Math.sin(h) * off;
  w.emit('puff', { x: px, y: py, size: CLUB.puff * Math.min(1.5, scale(u, 1)), kind: 'dust', as: 'giant' });
  w.emit('blast', { x: px, y: py, r: scale(u, CLUB.ring), kind: 3, as: 'giant' });
  iceCrack(w, px, py, 0.8 * u.radius, scale(u, CLUB.damage));
  w.emit('strike', { x: px, y: py, v: 2, type: u.type, as: 'giant' });
  if (_cn > 0) used(w, u, 'club');
}
registerWeapon({
  id: 'club', range: 0,
  def: { look: { attack: { time: CLUB.attackTime } } },
  init(w, u, bag) { bag.swingAt = -1; u.cooldown = CLUB.initCd * w.rng(); },
  // the 0.09 s from the swing start to the blow: planted (OG SWING subState)
  busy(w, u, bag) { if (bag.swingAt < 0) return false; u.face = u.heading; return true; },
  tick(w, u, bag) {
    if (bag.swingAt < 0 || w.time < bag.swingAt) return;
    bag.swingAt = -1;
    if (u.hp > 0) clubSwing(w, u);   // the giant is stun-immune: a started sweep always lands
  },
  fight(w, u, t, dx, dy, d, bag) {
    if (reachable(w, u, t, dx, dy, d, CLUB.approach * scale(u, CLUB.reach)) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
    const reach = u.radius + t.radius + CLUB.approach * scale(u, CLUB.reach);
    if (d > reach) { close(w, u, t, dx, dy, d); return; }
    setState(u, STATE.ENGAGE);
    const a = Math.atan2(dy, dx);
    u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < CLUB.facing) {
      u.attack = 1; u.cooldown = CLUB.cooldown * range(w, CLUB.cdLo, CLUB.cdHi);
      bag.swingAt = w.time + CLUB.windup;
    }
  },
  possessFire(w, u, aim, ax, ay, bag) {   // a sweep at whatever stands in the arc
    if (u.cooldown > 0 || bag.swingAt >= 0) return;
    u.attack = 1; u.cooldown = CLUB.cooldown; bag.swingAt = w.time + CLUB.windup;
  },
});

// ================================================================ halberd (long reach + set against a charge)
// from units/siege/halberd.js CHOP + SET (STEP4) and units/siege/_lib.js meleeBrain.
const HALBERD = Object.freeze({
  damage: 26,         // chop 26 ... (STEP4)
  jitter: 3,          // ±
  cooldown: 1.1,      // ... at 1.1 s (STEP4)
  cdJit: 0.25,        // +
  reach: 30,          // long reach: r + r_target + 30 (STEP4)
  push: 120,          // shove per chop
  stun: 0.25,         // s
  facing: 0.5,        // rad
  circle: 0.6,        // strafing round its man
  setR: 140,          // chargers within 140 px ... (STEP4)
  setSpeed: 120,      // ... faster than 120 px/s ... (STEP4)
  setCos: 0.75,       // ... coming its way (within ~41°)
  scanEvery: 5,       // ticks between charger scans
  setMul: 3,          // the charger takes 3× the chop (78) (STEP4)
  setStun: 0.5,       // and stops dead, stunned 0.5 s (STEP4)
  ready: 0.1,         // s for the polearm to come level
  keep: 0.35,         // s the set pose stays after the blow
  attackTime: 0.45,   // halberd.js look.attack.time
});
registerWeapon({
  id: 'halberd', range: 0,
  def: { look: { attack: { time: HALBERD.attackTime } } },
  init(w, u, bag) {
    bag.charger = -1; bag.setAt = -9; bag.setHit = -9;
    bag.W = { reach: scale(u, HALBERD.reach), band: 0, facing: HALBERD.facing, circle: HALBERD.circle, backStep: true };
    u.cooldown = HALBERD.cooldown * w.rng();
  },
  // SET: an enemy running at it makes it plant the polearm; it takes 3× the chop when it comes into reach and stops dead
  busy(w, u, bag) {
    let c = bag.charger >= 0 ? w.unitById(bag.charger) : null;
    if (c && !stillCharging(u, c, HALBERD.setSpeed * 0.6, 0.5, HALBERD.setR + 20)) c = null;
    const free = !(u.stun > 0) && u.state !== STATE.FLEE;
    if (!c && free && canAuto(w, u) && (w.tick + u.index) % HALBERD.scanEvery === 0) {
      c = findCharger(w, u, HALBERD.setR, HALBERD.setSpeed, HALBERD.setCos);
      if (c) bag.setAt = w.time;
    }
    bag.charger = c ? c.id : -1;
    if (!c || !free) { if (w.time - bag.setHit >= HALBERD.keep) unpose(w, u, ACT.AIM); return false; }
    pose(w, u, ACT.AIM);
    setState(u, STATE.ENGAGE);
    u.goalX = 0; u.goalY = 0;
    const dx = c.x - u.x, dy = c.y - u.y, d = hypot(dx, dy) || 0.001;
    u.face = Math.atan2(dy, dx);
    if (d <= u.radius + c.radius + bag.W.reach && w.time - bag.setAt >= HALBERD.ready) {
      hit(w, u, c, scale(u, (HALBERD.damage + HALBERD.jitter * signed(w)) * HALBERD.setMul), 0, 0, 'halberd', 1.5);
      c.vx = 0; c.vy = 0;                                  // stops dead
      if (c.stun < HALBERD.setStun) c.stun = HALBERD.setStun;
      if (c.state === STATE.CHARGE) setState(c, STATE.ENGAGE);
      u.cooldown = HALBERD.cooldown;
      bag.charger = -1; bag.setHit = w.time;
      if (w.stats) w.stats.impacts = (w.stats.impacts || 0) + 1;
      used(w, u, 'halberd');
    }
    return true;
  },
  fight(w, u, t, dx, dy, d, bag) {
    if (fight(w, u, t, bag.W, dx, dy, d, halberdChop, bag) === 0) close(w, u, t, dx, dy, d);
  },
  possessFire(w, u) { empty(w, u, HALBERD.cooldown, 'halberd'); },
});
function halberdChop(w, u, t) {
  hit(w, u, t, scale(u, HALBERD.damage + HALBERD.jitter * signed(w)), scale(u, HALBERD.push), HALBERD.stun, 'halberd', 1);
  u.cooldown = HALBERD.cooldown + HALBERD.cdJit * w.rng();
  used(w, u, 'halberd');
}

// ================================================================ cutlass (fast + sidestep)
// from units/pirates/deckhand.js T.cutlass + T.dodge (brain.js runs the dodge mover after the brain).
const CUTLASS = Object.freeze({
  damage: 16,         // per slash
  jitter: 3,          // ±
  cooldown: 0.5,      // s between slashes
  cdJit: 0.12,        // +
  push: 40,           // small shove on each hit
  stun: 0,            // no stun
  reach: 6,           // px past both radii
  band: 18,           // px past reach: still in the fight (steps in)
  facing: 0.6,        // rad
  circle: 0.6,        // strafes round the target
  dodgeTime: 0.18,    // s of sidestep after each swing
  dodgeSpeed: 0.8,    // × runSpeed
  attackTime: 0.25,   // deckhand look.attack.time
});
function cutlassStrike(w, u, t, dx, dy, d, bag) {
  hit(w, u, t, scale(u, CUTLASS.damage + CUTLASS.jitter * signed(w)), bag.push, CUTLASS.stun, 'deckhand', 1);
  u.cooldown = CUTLASS.cooldown + CUTLASS.cdJit * w.rng();
  used(w, u, 'cutlass');
  // sidestep after the swing: off to one side of the target
  const k = (d || 1) / CUTLASS.dodgeSpeed, side = w.rng() < 0.5 ? -1 : 1;
  u.dodgeX = (-dy / k) * side; u.dodgeY = (dx / k) * side;
  u.dodgeDelay = 0; u.dodgeTime = CUTLASS.dodgeTime;
}
registerWeapon({
  id: 'cutlass', range: 0,
  def: { look: { attack: { time: CUTLASS.attackTime } } },
  init(w, u, bag) {
    bag.W = { reach: scale(u, CUTLASS.reach), band: scale(u, CUTLASS.band), facing: CUTLASS.facing, circle: CUTLASS.circle, backStep: false };
    bag.push = scale(u, CUTLASS.push);
    u.cooldown = CUTLASS.cooldown * w.rng();
  },
  fight(w, u, t, dx, dy, d, bag) { if (fight(w, u, t, bag.W, dx, dy, d, cutlassStrike, bag) === 0) close(w, u, t, dx, dy, d); },
  possessFire(w, u) { empty(w, u, CUTLASS.cooldown, 'deckhand'); },
});

// ================================================================ dagger (18 at 0.5 s, ×2 from behind)
// from units/space/teleporter.js T.dagger + its backstab ×2. The blink is the Blink ability (A-ACT1): a blink lands the
// unit behind its target, so its first stab is a backstab here. "Behind" = in the target's rear 120°.
const DAGGER = Object.freeze({
  damage: 18,         // per stab (STEP6)
  jitter: 3,          // ±
  cooldown: 0.5,      // s (STEP6)
  cdJit: 0.1,         // +
  push: 50,           // shove
  stun: 0.1,          // s
  reach: 6,           // px past both radii
  band: 16,           // px
  facing: 0.7,        // rad
  circle: 0.5,        // strafing
  backstab: 2,        // × damage from behind (STEP6)
  behind: -0.5,       // cos: the stab comes from the target's rear 120° (its facing · the way to us below this)
  attackTime: 0.25,   // teleporter look.attack.time
});
function daggerStrike(w, u, t, dx, dy, d, bag) {
  const back = (Math.cos(t.heading) * -dx + Math.sin(t.heading) * -dy) / (d || 1) < DAGGER.behind;
  const dmg = scale(u, DAGGER.damage + DAGGER.jitter * signed(w)) * (back ? DAGGER.backstab : 1);
  const pass = hit(w, u, t, dmg, bag.push, DAGGER.stun, 'teleporter', 1);
  if (back && pass >= 1) w.emit('strike', { x: t.x, y: t.y, v: 1.5, type: u.type, backstab: 1, as: 'teleporter' });
  u.cooldown = DAGGER.cooldown + DAGGER.cdJit * w.rng();
  bag.backstabs += back ? 1 : 0;
  used(w, u, 'dagger');
}
registerWeapon({
  id: 'dagger', range: 0,
  def: { look: { attack: { time: DAGGER.attackTime } } },
  init(w, u, bag) {
    bag.W = { reach: scale(u, DAGGER.reach), band: scale(u, DAGGER.band), facing: DAGGER.facing, circle: DAGGER.circle, backStep: false };
    bag.push = scale(u, DAGGER.push); bag.backstabs = 0;
    u.cooldown = DAGGER.cooldown * w.rng();
  },
  fight(w, u, t, dx, dy, d, bag) { if (fight(w, u, t, bag.W, dx, dy, d, daggerStrike, bag) === 0) close(w, u, t, dx, dy, d); },
  possessFire(w, u) { empty(w, u, DAGGER.cooldown, 'teleporter'); },
});

// ================================================================ fists (boxer: three jabs, then an uppercut)
// from units/sports/boxer.js T.jab / T.upper / blow(). The dodge is the Dodge ability (A-SUPPORT).
const FISTS = Object.freeze({
  jab: 9,             // per jab (STEP6)
  jabJit: 1,          // ±
  every: 0.3,         // s between jabs (STEP6)
  count: 3,           // jabs before the uppercut (STEP6)
  jabPush: 25,        // shove
  jabStun: 0.06,      // s
  jabPose: 0.15,      // s of a jab pose (ACT.COMBO)
  upper: 22,          // uppercut (STEP6)
  upperJit: 2,        // ±
  upperMass: 2,       // victims this light (× power²) go up (STEP6)
  up: 360,            // px/s upward
  out: 50,            // px/s back (× power)
  upperPush: 90,      // shove when it doesn't fly
  upperStun: 0.3,     // s
  recover: 0.6,       // s after the uppercut before the next combo
  upperPose: 0.35,    // s of the uppercut pose (ACT.SWING)
  reset: 1.2,         // s out of reach: the combo starts over
  reach: 5,           // px past both radii
  band: 16,           // px
  facing: 0.6,        // rad
  circle: 0.7,        // strafing (light on his feet)
  attackTime: 0.18,   // boxer look.attack.time
});
function fistsBlow(w, u, t, dx, dy, d, bag) {
  const ux = dx / (d || 1), uy = dy / (d || 1);
  if (w.time - bag.lastPunch > FISTS.reset) bag.combo = 0;
  bag.lastPunch = w.time; u.attack = 1;
  const tv = perchOf(w, t);
  if (bag.combo < FISTS.count) {
    const pass = damage(w, tv, scale(u, FISTS.jab + FISTS.jabJit * (w.rng() - w.rng())), u);
    if (tv.hp > 0) push(w, tv, ux, uy, scale(u, FISTS.jabPush) * pass, FISTS.jabStun * pass);
    bag.arm = bag.combo & 1; bag.combo++;
    pose(w, u, ACT.COMBO); u.b.actT = w.time;
    u.cooldown = FISTS.every;
    w.emit('strike', { x: tv.x, y: tv.y, v: 0.6, type: u.type, as: 'boxer' });
    used(w, u, 'fists');
    return;
  }
  const pass = damage(w, tv, scale(u, FISTS.upper + FISTS.upperJit * (w.rng() - w.rng())), u);
  if (tv.hp > 0 && pass >= 0.5 && tossable(tv, heavy(u, FISTS.upperMass))) toss(w, tv, ux, uy, scale(u, FISTS.out), FISTS.up);
  else if (tv.hp > 0) push(w, tv, ux, uy, scale(u, FISTS.upperPush) * pass, FISTS.upperStun * pass);
  bag.combo = 0; bag.uppers++;
  pose(w, u, ACT.SWING); u.b.actT = w.time;
  u.cooldown = FISTS.recover;
  w.emit('strike', { x: tv.x, y: tv.y, v: 1.2, type: u.type, as: 'boxer' });
  used(w, u, 'fists');
}
registerWeapon({
  id: 'fists', range: 0,
  def: { look: { attack: { time: FISTS.attackTime } } },
  init(w, u, bag) {
    bag.arm = 0; bag.combo = 0; bag.lastPunch = -9; bag.uppers = 0;
    bag.W = { reach: scale(u, FISTS.reach), band: scale(u, FISTS.band), facing: FISTS.facing, circle: FISTS.circle, backStep: true };
    u.cooldown = FISTS.every * w.rng();
  },
  tick(w, u) { poseFor(w, u, ACT.COMBO, FISTS.jabPose); poseFor(w, u, ACT.SWING, FISTS.upperPose); },
  fight(w, u, t, dx, dy, d, bag) { if (fight(w, u, t, bag.W, dx, dy, d, fistsBlow, bag) === 0) close(w, u, t, dx, dy, d); },
  // possessed, attack held at nobody: shadow-box (a jab at the air)
  possessFire(w, u, aim, ax, ay, bag) {
    if (!empty(w, u, FISTS.every, 'boxer')) return;
    bag.arm = bag.combo & 1; bag.combo = (bag.combo + 1) % (FISTS.count + 1);
    pose(w, u, ACT.COMBO); u.b.actT = w.time;
  },
});

// ================================================================ slam (ape's ground slam ring)
// from units/animals/ape.js slamStep / slamHit (OG game.js:14131-14185) + its in-reach brain (OG game.js:14254-14262).
// The ring is the ape's (1.25 × its radius 14.85) × power, centred 1.2 × the unit's own radius ahead.
const SLAM = Object.freeze({
  windup: 0.45,       // s from fists up to the end of the recover (OG game.js:13959)
  landAt: 0.6,        // the fists land at 60 % of it (OG game.js:13960)
  damage: 46,         // ± 6 (OG game.js:13961, 14164)
  jitter: 6,          // OG game.js:14164
  ahead: 1.2,         // ring centre × radius ahead (OG game.js:13964)
  ring: 18.5625,      // px: 1.25 × the ape's 14.85 radius (OG game.js:14151), × power
  push: 150,          // × pass (OG game.js:14166)
  stun: 0.4,          // s × pass (OG game.js:14166)
  lunge: 0.75,        // × run speed: lunges at its man while winding up (OG game.js:13963, 14139)
  lungeGap: 3.5,      // px past both radii: close enough, no lunge (OG game.js:14137)
  engage: 7,          // px past both radii: starts a slam (OG game.js:14254)
  cdBase: 0.7,        // cooldown = windup + 0.7 × range(0.85, 1.15) (OG game.js:14261)
  cdLo: 0.85,         // OG game.js:14261
  cdHi: 1.15,         // OG game.js:14261
  stepIn: 0.6,        // × walk: steps in while the slam cools down (OG game.js:14262)
  shock: 26,          // 'shock' event radius (OG game.js:14179), × power
  retry: 0.3,         // s: a slam that hit nobody is ready again this soon (the ape: its full cooldown)
  attackTime: 0.3,    // ape look.attack.time (OG game.js:14041)
});
const WINDUP = 1, RECOVER = 2;   // bag.phase
function slamHit(w, u, bag) {
  const r = u.radius, px = u.x + Math.cos(bag.aimA) * r * SLAM.ahead, py = u.y + Math.sin(bag.aimA) * r * SLAM.ahead;
  const h = scale(u, SLAM.ring);
  const n = w.queryMask(px, py, h + M.MARGIN, ENEMY[u.faction], Q, Q.length);
  let best = 0;
  for (let k = 0; k < n; k++) {
    const e = Q[k]; Q[k] = null;
    if (e.dead || !(e.hp > 0) || airborne(e)) continue;
    const cx = e.x - px, cy = e.y - py, m = hypot(cx, cy) || 0.001;
    if (m > h + e.radius) continue;
    const v = perchOf(w, e);
    const pass = damage(w, v, scale(u, SLAM.damage + SLAM.jitter * signed(w)), u);
    if (pass > best) best = pass;
    if (v === e && e.hp > 0) push(w, e, cx / m, cy / m, scale(u, SLAM.push) * pass, SLAM.stun * pass);
  }
  for (let k = 0; k < 3; k++) w.emit('dust', { x: px + signed(w) * r * 0.5, y: py + signed(w) * r * 0.3, size: 1.1, as: 'ape' });
  w.emit('shock', { x: px, y: py, radius: scale(u, SLAM.shock), life: 3, as: 'ape' });
  w.emit('blast', { x: px, y: py, r: h, kind: 3, as: 'ape' });   // the ring on the ground (fx.js draws 'blast'; silent)
  iceCrack(w, px, py, h, scale(u, SLAM.damage));
  w.emit('strike', { x: px, y: py, v: 1, type: u.type, as: 'ape' });
  if (best > 0) { w.emit('trample', { x: px, y: py, v: 1.2 * best, type: u.type, as: 'ape' }); used(w, u, 'slam'); }
  else if (u.cooldown > SLAM.retry) u.cooldown = SLAM.retry;   // hit nothing (its man was thrown off it): slams again soon
  bag.ringX = px; bag.ringY = py; bag.ringR = h; bag.ringT = w.time; bag.slams++;
  u.attack = 1;
  unpose(w, u, ACT.WIND); pose(w, u, ACT.SWING);
}
function slamStart(w, u, bag, a) {
  bag.phase = WINDUP; bag.timer = w.time + SLAM.windup; bag.aimA = a;
  u.cooldown = SLAM.windup + SLAM.cdBase * range(w, SLAM.cdLo, SLAM.cdHi);
  pose(w, u, ACT.WIND);
}
function slamEnd(w, u, bag) { bag.phase = 0; unpose(w, u, ACT.WIND); unpose(w, u, ACT.SWING); }
registerWeapon({
  id: 'slam', range: 0,
  def: { look: { attack: { time: SLAM.attackTime } } },
  init(w, u, bag) { bag.phase = 0; bag.timer = 0; bag.aimA = u.heading; bag.ringX = 0; bag.ringY = 0; bag.ringR = 0; bag.ringT = -9; bag.slams = 0; },
  // the phases run every tick (a brain skips ticks while the unit is in the air). A started slam always comes down: the
  // ape dropped it on a stun > 0.6 or a toss, and a made unit in a scrum (boars, shield lines) never landed one. Thrown
  // mid-slam, the fists come down where it lands.
  tick(w, u, bag) {
    if (bag.phase === 0) return;
    if (u.state === STATE.FLEE || !(u.hp > 0)) { slamEnd(w, u, bag); return; }
    if (bag.phase === WINDUP) {
      const t = u.target >= 0 ? w.unitById(u.target) : null;
      if (t && t.hp > 0) bag.aimA = Math.atan2(t.y - u.y, t.x - u.x);
      if (1 - (bag.timer - w.time) / SLAM.windup >= SLAM.landAt && (!airborne(u) || lowFlyer(u))) { bag.phase = RECOVER; slamHit(w, u, bag); }   // ATTACK3 L4: a flyer slams at the bottom of its dive (z <= 6: never quite lands, the slam never came)
      return;
    }
    if (w.time >= bag.timer) slamEnd(w, u, bag);
  },
  busy(w, u, bag) {
    if (bag.phase === 0) return false;
    setState(u, STATE.ENGAGE);
    const t = u.target >= 0 ? w.unitById(u.target) : null;
    if (t && t.hp > 0 && bag.phase === WINDUP) {           // lunges at its man while winding up (OG game.js:14137-14139)
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
      u.face = Math.atan2(dy, dx);
      if (d > u.radius + t.radius + scale(u, SLAM.lungeGap)) { const s = u.def.runSpeed * SLAM.lunge; u.goalX = dx / d * s; u.goalY = dy / d * s; }
    } else u.face = u.heading;
    return true;
  },
  fight(w, u, t, dx, dy, d, bag) {
    // the slam starts as it comes in: within reach plus the ground its lunge covers before the fists land (the ape starts
    // it at 7 px only; a made unit under fire got there too late)
    const engage = scale(u, SLAM.engage) + u.def.runSpeed * SLAM.lunge * SLAM.windup * SLAM.landAt;
    if (reachable(w, u, t, dx, dy, d, engage) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
    if (d > u.radius + t.radius + engage) { close(w, u, t, dx, dy, d); return; }
    setState(u, STATE.ENGAGE);
    u.face = Math.atan2(dy, dx);
    if (u.cooldown <= 0) slamStart(w, u, bag, Math.atan2(dy, dx));
    else if (d > u.radius + t.radius + scale(u, SLAM.engage)) close(w, u, t, dx, dy, d);
    else { const s = u.def.walkSpeed * SLAM.stepIn; u.goalX = dx / d * s; u.goalY = dy / d * s; }
  },
  possessFire(w, u, aim, ax, ay, bag) { if (u.cooldown <= 0 && bag.phase === 0) slamStart(w, u, bag, aim); },
});

// ================================================================ shove (sumo's front shove; + the wall hit)
// from units/sports/sumo.js T.shove + doShove(). A shoved unit slammed into a wall takes 25 more (sports _lib shoved(),
// the 'sports:land' system). The sumo's stomp is not part of the shove.
const SHOVE = Object.freeze({
  every: 1.2,         // s (STEP6)
  reach: 25,          // px past its radius to their edge (STEP6 "within r + 25")
  arc: Math.PI / 4,   // ± rad: the front 90° (STEP6) ...
  pivot: 0.8,         // ... measured from 0.8 × its radius behind its centre (men at its shoulders count)
  damage: 12,         // (STEP6)
  push: 320,          // (STEP6) ÷ their mass
  stun: 0.25,         // s: they slide while the shove carries them
  facing: 0.5,        // rad: turns to face before shoving
  lean: 0.5,          // × walk: keeps leaning in while in reach
  attackTime: 0.35,   // sumo look.attack.time
});
function doShove(w, u) {
  const c = Math.cos(u.heading), s = Math.sin(u.heading), reach = u.radius + scale(u, SHOVE.reach);
  const px = u.x - c * u.radius * SHOVE.pivot, py = u.y - s * u.radius * SHOVE.pivot, cosArc = Math.cos(SHOVE.arc);
  const n = w.queryMask(u.x, u.y, reach + M.MARGIN, ENEMY[u.faction], Q, Q.length);
  const dmg = scale(u, SHOVE.damage), pf = scale(u, SHOVE.push);
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (!(o.hp > 0) || o.def.prop || o.inside >= 0 || o.z > 6 || o.climb > 0) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d - o.radius > reach || dx * c + dy * s < 0) continue;
    const ax = o.x - px, ay = o.y - py, ad = hypot(ax, ay) || 0.001;
    if ((ax * c + ay * s) / ad < cosArc) continue;
    const ux = dx / d, uy = dy / d;
    const pass = damage(w, o, dmg, u);
    if (o.hp > 0 && o.def.boss !== true) { push(w, o, ux, uy, pf * pass, SHOVE.stun * pass); shoved(w, o, u, ux, uy); }
    hits++;
  }
  u.attack = 1; u.cooldown = SHOVE.every;
  w.emit(hits > 0 ? 'strike' : 'swing', { x: u.x + c * reach, y: u.y + s * reach, v: 1.4, type: u.type, id: u.id, units: hits, as: 'sumo' });
  if (hits > 0) used(w, u, 'shove');
  return hits;
}
registerWeapon({
  id: 'shove', range: 0,
  def: { look: { attack: { time: SHOVE.attackTime } } },
  init(w, u) { u.cooldown = SHOVE.every * w.rng(); },
  fight(w, u, t, dx, dy, d) {
    if (reachable(w, u, t, dx, dy, d, scale(u, SHOVE.reach)) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
    const a = Math.atan2(dy, dx);
    if (d - t.radius > u.radius + scale(u, SHOVE.reach)) { close(w, u, t, dx, dy, d); return; }
    u.face = a;
    setState(u, STATE.ENGAGE);
    if (u.group >= 0 && w.groups.markEngaged) w.groups.markEngaged(u.group);
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < SHOVE.facing) doShove(w, u);
    const s = u.def.walkSpeed * SHOVE.lean;
    u.goalX += (dx / d) * s; u.goalY += (dy / d) * s;   // keeps leaning in
  },
  possessFire(w, u) { if (u.cooldown <= 0) doShove(w, u); },
});

// ================================================================ floatpunch (astronaut: what it hits floats)
// from units/space/astronaut.js T.punch + T.float. A float (u.floating) lifts the victim, it bobs, can't act, then falls
// back (the shared landing bump). Who can float: units/space/_lib.js canFloat, with its mass limit 8 × power².
const FLOAT = Object.freeze({
  damage: 18,         // per punch (STEP6)
  jitter: 3,          // ±
  cooldown: 0.9,      // s (STEP6)
  cdJit: 0.15,        // +
  push: 60,           // shove
  stun: 0.15,         // s
  reach: 6,           // px past both radii
  band: 16,           // px
  facing: 0.7,        // rad
  circle: 0.3,        // strafing
  float: 1.8,         // s the punched unit floats (STEP6)
  floatMass: 8,       // STEP6: mass > 8 never floats (× power² here)
  air: 6,             // px: a unit higher than this is already in the air
  attackTime: 0.3,    // astronaut look.attack.time
});
/** units/space/_lib.js canFloat with the mass limit scaled for this puncher. */
function floatable(w, o, maxMass) {
  const d = o.def;
  return o.hp > 0 && !o.dead && !d.prop && !d.boss && !(o.leaping === 3 || d.flies === true) && o.mass <= maxMass &&
    !(o.z > FLOAT.air) && !(o.climb > 0) && o.inside < 0 && o.hurled !== 1 && o.leaping === 0 && !(o.floating > w.time) && d.untossable !== true;
}
function floatStrike(w, u, t, dx, dy, d, bag) {
  hit(w, u, t, scale(u, FLOAT.damage + FLOAT.jitter * signed(w)), bag.push, FLOAT.stun, 'astronaut', 1);
  u.cooldown = FLOAT.cooldown + FLOAT.cdJit * w.rng();
  used(w, u, 'floatpunch');
  if (t.hp > 0 && floatable(w, t, heavy(u, FLOAT.floatMass))) {
    t.floating = w.time + FLOAT.float; t.vz = 0; bag.floated++;
    w.emit('spell', { x: t.x, y: t.y, v: 0.4, type: u.type, float: 1, as: 'astronaut' });
  }
}
registerWeapon({
  id: 'floatpunch', range: 0,
  def: { look: { attack: { time: FLOAT.attackTime } } },
  init(w, u, bag) {
    bag.W = { reach: scale(u, FLOAT.reach), band: scale(u, FLOAT.band), facing: FLOAT.facing, circle: FLOAT.circle, backStep: false };
    bag.push = scale(u, FLOAT.push); bag.floated = 0;
    u.cooldown = FLOAT.cooldown * w.rng();
  },
  fight(w, u, t, dx, dy, d, bag) { if (fight(w, u, t, bag.W, dx, dy, d, floatStrike, bag) === 0) close(w, u, t, dx, dy, d); },
  possessFire(w, u) { empty(w, u, FLOAT.cooldown, 'astronaut'); },
});

export { SWORD, CLUB, HALBERD, CUTLASS, DAGGER, FISTS, SLAM, SHOVE, FLOAT };
export * from './melee-tricks.js';
