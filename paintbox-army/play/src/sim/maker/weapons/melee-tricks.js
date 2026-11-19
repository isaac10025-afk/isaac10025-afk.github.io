// Unit maker: W-MELEE weapons with a trick of their own (OURS, Part 2 step 8, STEP8.md). Owner: W-MELEE. Imported by
// melee.js (so index.js loads it with the rest). anchor, bat, ram, saw: the source unit's attack with the source's numbers
// (its table copied below with a cite), on any body and size (damage, reach and push × power(u); mass limits × power²),
// closing in at run speed. Every event carries `as: '<source>'`; used(w, u, id) on every blow that lands.
//
// What the art reads (besides u.attack):
//   anchor  u.b.act ACT.WIND (anchor swung back, 0.35 s), ACT.SWING (swept round, 0.25 s), ACT.THROW (hook out on its
//           chain); bag.victim = u.b.victim = the hooked unit while the hook is out (-1 none), bag.aimA = swing angle (world
//           rad). fx-mine-melee.js OVER.anchor draws the chain from the hand to the hook / the hooked unit.
//   bat     u.b.act ACT.WIND (bat back, 0.3 s), ACT.SWING (swung round, 0.3 s; also the bat-back swing); u.b.victim.
//   ram     u.b.act ACT.WIND (pulled back, 0.55 s), ACT.SWING (the thrust, 0.3 s; the blow lands at its start).
//   saw     u.b.act ACT.SPIN while a saw run rolls (bag.mode 1, the run direction bag.dx / bag.dy); bag.mode 2 = braking
//           and turning round (0.4 s, the blade still bites). fx-mine-melee.js OVER.saw draws the sparks.
import { registerWeapon } from '../registry.js';
import { STATE, hypot, angleDiff, setState, damage, push, toss, canAuto, ENEMY, DT, registerSystem } from '../lib.js';
import { ALL_MASK, canHit, isHostile } from '../../factions.js';
import { onWorldClear } from '../../world.js';
import { blockedSpark, perchOf, hatKnock, spark, circle, oddsApproach } from '../../combat/index.js';
import { wallBetween, wallNear, hitWalls } from '../../units/siege/_lib.js';
import { contactPoint } from '../../units/army/_shared.js';
import { tossable, tossTo, flung, KNOCK, hittable as shotHits, ownerOf, stat, grounded as onGround } from '../../units/sports/_lib.js';
import { crowdTarget, touchable } from '../../units/robots/_lib.js';
import { T as BATTER } from '../../units/sports/batter.js';
import {
  ACT, M, NEAR, used, power, scale, heavy, signed, pose, unpose, close, fight, empty, airborne, lowFlyer, reachable,
} from './melee-lib.js';

const TAU = Math.PI * 2;

// ================================================================ anchor (wide arc + hook)
// from units/pirates/anchor.js T.swing / T.hook, swing() / yank() and its brain.
const ANCHOR = Object.freeze({
  damage: 34,         // to each unit in the arc
  jitter: 4,          // ±
  reach: 40,          // px past its own radius (to the victim's edge)
  arcCos: 0.5,        // cos(60°): a 120° arc in front
  windup: 0.35,       // s winding up (ACT.WIND)
  pose: 0.25,         // s of the swing pose (ACT.SWING)
  cooldown: 1.8,      // s from swing to swing
  push: 260,          // shove (heavier units)
  stun: 0.35,         // s on the shoved
  tossMass: 1.5,      // people (mass ≤ 1.5, × power²) are tossed instead
  tossOut: 200,       // px/s outward
  tossUp: 190,        // px/s up
  facing: 0.5,        // rad: starts the wind-up once facing the target this well
  stepGap: 14,        // px past both radii: farther than this it steps in ...
  stepIn: 0.5,        // ... at walk × 0.5 while in reach
  hookEvery: 6,       // s between hooks
  hookMin: 60,        // px: closest hook
  hookMax: 130,       // px: farthest hook
  hookSlack: 30,      // px past hookMax the hooked unit may have moved and still be yanked
  throwTime: 0.25,    // s from the throw to the yank
  hold: 0.45,         // s the hook pose stays after the yank
  hookDmg: 8,         // the hook bites
  hookUp: 170,        // px/s: hop height of the yank
  gap: 4,             // px: lands this far from its feet
  hookMass: 4,        // heavier units (× power²) can't be hooked
  firstHook: 1,       // s: first hook 1-3 s after it is painted
  attackTime: 0.45,   // anchor look.attack.time
});
const WIND = 1, SWUNG = 2, HOOK = 3;   // anchor / bat phases (bag.phase)
let _au = null, _aw = null, _an = 0, _afx = 0, _afy = 0;
function anchorOne(o) {
  const u = _au, w = _aw;
  if (o === u || !(o.hp > 0) || !isHostile(u, o) || o.climb > 0) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d - o.radius > u.radius + scale(u, ANCHOR.reach)) return;
  if ((dx * _afx + dy * _afy) / d < ANCHOR.arcCos && d > u.radius + o.radius + 2) return;   // outside the arc (touching always hit)
  const nx = dx / d, ny = dy / d;
  const pass = damage(w, o, scale(u, ANCHOR.damage + ANCHOR.jitter * (w.rng() - w.rng())), u);
  if (o.hp > 0 && o.mass <= heavy(u, ANCHOR.tossMass) && pass > 0.5) toss(w, o, nx, ny, scale(u, ANCHOR.tossOut) * pass, ANCHOR.tossUp * pass);
  else push(w, o, nx, ny, scale(u, ANCHOR.push) * pass, ANCHOR.stun * pass);
  blockedSpark(w, u, o, pass);
  _an++;
}
function anchorSwing(w, u, bag) {
  _au = u; _aw = w; _an = 0; _afx = Math.cos(bag.aimA); _afy = Math.sin(bag.aimA);   // the arc goes where it wound up to (anchor.js: its heading)
  w.query(u.x, u.y, u.radius + scale(u, ANCHOR.reach) + M.MARGIN, anchorOne);
  const n = _an; _au = null; _aw = null;
  w.emit(n > 0 ? 'strike' : 'swing', { x: u.x + _afx * u.radius * 2, y: u.y + _afy * u.radius * 2, v: Math.min(2, 0.6 + 0.4 * n), type: u.type, id: u.id, as: 'anchor' });
  if (n > 0 && w.stats) w.stats.impacts = (w.stats.impacts || 0) + 1;
  u.attack = 1; u.cooldown = ANCHOR.cooldown;
  bag.phase = SWUNG; bag.t0 = w.time; pose(w, u, ACT.SWING);
  if (n > 0) used(w, u, 'anchor');
}
function anchorYank(w, u, v, bag) {
  const dx = u.x - v.x, dy = u.y - v.y, d = hypot(dx, dy) || 0.001;
  const dist = Math.max(0, d - (u.radius + v.radius + ANCHOR.gap));
  damage(w, v, scale(u, ANCHOR.hookDmg), u);
  used(w, u, 'anchor');
  bag.yanks++;
  if (!(v.hp > 0)) return;
  const k = 1 / Math.sqrt(Math.max(1, v.mass)), air = (2 * ANCHOR.hookUp * k) / 900;
  toss(w, v, dx / d, dy / d, dist / (k * air), ANCHOR.hookUp);
  w.emit('throw', { x: v.x, y: v.y, v: 0.8, type: u.type, as: 'anchor' });
}
function anchorEnd(w, u, bag) {
  if (bag.phase === WIND) unpose(w, u, ACT.WIND); else if (bag.phase === SWUNG) unpose(w, u, ACT.SWING); else if (bag.phase === HOOK) unpose(w, u, ACT.THROW);
  bag.phase = 0;
  if (bag.victim >= 0) { if (u.b.victim === bag.victim) u.b.victim = -1; bag.victim = -1; }
}
function anchorWind(w, u, bag, a) { bag.aimA = a; bag.phase = WIND; bag.t0 = w.time; pose(w, u, ACT.WIND); }
registerWeapon({
  id: 'anchor', range: 0,
  def: { look: { attack: { time: ANCHOR.attackTime } } },
  init(w, u, bag) {
    bag.phase = 0; bag.t0 = 0; bag.aimA = u.heading; bag.victim = -1; bag.yanked = 0; bag.yanks = 0;
    bag.hookAt = w.time + ANCHOR.firstHook + 2 * w.rng();
    u.cooldown = w.rng() * ANCHOR.cooldown * 0.5;
  },
  // the phases run every tick (a brain can skip ticks: a reaction delay, in the air)
  tick(w, u, bag) {
    const age = w.time - bag.t0;
    if (bag.phase === SWUNG && age >= ANCHOR.pose) anchorEnd(w, u, bag);
    if (bag.phase === 0) return;
    // a started swing always comes round (stunned, thrown, it still swings: the anchor's own brain dropped it on any stun,
    // so a made unit in a scrum never landed one); only running away or dying stops it
    if (u.state === STATE.FLEE || !(u.hp > 0)) { if (bag.phase !== SWUNG) anchorEnd(w, u, bag); return; }
    if (bag.phase === WIND) {                              // winding up: track the target, then swing
      const t = u.target >= 0 ? w.unitById(u.target) : null;
      if (t && t.hp > 0 && !(u.stun > 0)) bag.aimA = Math.atan2(t.y - u.y, t.x - u.x);
      if (age >= ANCHOR.windup) anchorSwing(w, u, bag);
      return;
    }
    if (bag.phase !== HOOK) return;
    const v = bag.victim >= 0 ? w.unitById(bag.victim) : null;
    if (!bag.yanked && age >= ANCHOR.throwTime) {
      bag.yanked = 1;
      if (v && v.hp > 0 && hypot(v.x - u.x, v.y - u.y) <= scale(u, ANCHOR.hookMax + ANCHOR.hookSlack) && w.lineOfSight(u.x, u.y, v.x, v.y)) anchorYank(w, u, v, bag);
      else anchorEnd(w, u, bag);
    } else if (bag.yanked && age >= ANCHOR.throwTime + ANCHOR.hold) anchorEnd(w, u, bag);
  },
  // mid-move: planted, facing the swing / the hook
  busy(w, u, bag) {
    if (bag.phase === 0) return false;
    if (bag.phase === WIND) u.face = bag.aimA;
    else if (bag.phase === HOOK) { const v = bag.victim >= 0 ? w.unitById(bag.victim) : null; u.face = v ? Math.atan2(v.y - u.y, v.x - u.x) : u.heading; }
    else u.face = u.heading;
    return true;
  },
  fight(w, u, t, dx, dy, d, bag) {
    if (reachable(w, u, t, dx, dy, d, scale(u, ANCHOR.reach)) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
    const a = Math.atan2(dy, dx);
    if (d - t.radius <= u.radius + scale(u, ANCHOR.reach)) {   // in swing reach: wind up when ready
      setState(u, STATE.ENGAGE);
      if (u.group >= 0 && w.groups.markEngaged) w.groups.markEngaged(u.group);
      u.face = a;
      if (d > u.radius + t.radius + scale(u, ANCHOR.stepGap)) { const s = u.def.walkSpeed * ANCHOR.stepIn; u.goalX = (dx / d) * s; u.goalY = (dy / d) * s; }
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < ANCHOR.facing) anchorWind(w, u, bag, a);
      return;
    }
    if (w.time >= bag.hookAt && d >= scale(u, ANCHOR.hookMin) && d <= scale(u, ANCHOR.hookMax) && t.mass <= heavy(u, ANCHOR.hookMass) &&
        !(t.z > 0) && !t.def.untossable && (u.los === 1 || w.walls.count === 0)) {
      bag.victim = t.id; u.b.victim = t.id; bag.yanked = 0; bag.hookAt = w.time + ANCHOR.hookEvery; u.face = a;
      bag.phase = HOOK; bag.t0 = w.time; pose(w, u, ACT.THROW);
      w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, hook: 1, as: 'anchor' });   // the chain flies out
      return;
    }
    close(w, u, t, dx, dy, d);
  },
  // possessed, attack held at nobody: swing at the empty arc
  possessFire(w, u, aim, ax, ay, bag) { if (bag.phase === 0 && u.cooldown <= 0) anchorWind(w, u, bag, aim); },
});

// ================================================================ bat (home run + bats back thrown things)
// from units/sports/batter.js T.bat / T.homer / swing() and its brain; the bat-back = sports/_lib.js batRun / batBack
// (copied below as the 'maker:bat' system so its state stays in our bag), numbers from batter.js T.batBack.
const BAT = Object.freeze({
  damage: 22,         // per swing (STEP6)
  jitter: 3,          // ±
  cooldown: 1.0,      // s between swings (STEP6): wind + the rest
  cdJit: 0.15,        // +
  push: 120,          // shove when it doesn't fly
  stun: 0.2,          // s
  reach: 9,           // px past both radii (a bat is long)
  band: 18,           // px
  facing: 0.6,        // rad
  circle: 0.4,        // strafing
  arc: 1.2,           // rad: the swing still hits within this of its heading
  wind: 0.3,          // s wind-up before the swing (ACT.WIND)
  stepIn: 110,        // px/s: steps in on its man while winding up (capped at the body's run speed)
  swingPose: 0.3,     // s of the swing pose (ACT.SWING)
  homerMass: 2.5,     // victims this light (× power²) fly (STEP6)
  homerMin: 150,      // px: shortest flight (STEP6), × power
  homerMax: 220,      // px: longest flight (STEP6), × power
  homerUp: 420,       // px/s upward (a high arc, ~0.9 s in the air)
  landHit: KNOCK.landHit, // 15 to it and whoever it lands on (STEP6), × power
  batReach: BATTER.batBack.reach, // 18 px past its radius: things coming this close get batted (× power)
  attackTime: 0.35,   // batter look.attack.time
});
/** Can the swing reach o (within reach + band past both radii, within BAT.arc of the heading)? */
function batReach(u, o) {
  if (!o || !(o.hp > 0) || o.inside >= 0) return false;
  const dx = o.x - u.x, dy = o.y - u.y;
  return hypot(dx, dy) <= u.radius + o.radius + scale(u, BAT.reach + BAT.band) && Math.abs(angleDiff(u.heading, Math.atan2(dy, dx))) <= BAT.arc;
}
let _ku = null, _kb = null, _kd = 0;
function batOne(o) {
  const u = _ku; if (o === u || !isHostile(u, o) || o.z > 6 || !batReach(u, o)) return;
  const d = hypot(o.x - u.x, o.y - u.y); if (d < _kd) { _kd = d; _kb = o; }
}
function batSwing(w, u, bag) {   // the bat comes round: whoever is still in front within reach
  let t = bag.victim >= 0 ? w.unitById(bag.victim) : null;
  bag.phase = SWUNG; bag.t0 = w.time; pose(w, u, ACT.SWING);
  u.attack = 1; u.cooldown = BAT.cooldown - BAT.wind + w.rng() * BAT.cdJit;   // wind + this = one swing per 1.0 s
  if (!batReach(u, t)) {   // its man got away (or was shoved off it): the nearest other enemy the bat comes round on
    _ku = u; _kb = null; _kd = Infinity;
    w.query(u.x, u.y, u.radius + scale(u, BAT.reach + BAT.band) + M.MARGIN, batOne, ENEMY[u.faction]);
    t = _kb; _ku = null; _kb = null;
  }
  if (!t) { w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, as: 'batter' }); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const ux = dx / d, uy = dy / d;
  const pass = damage(w, t, scale(u, BAT.damage + BAT.jitter * (w.rng() - w.rng())), u);
  w.emit('strike', { x: t.x, y: t.y, v: 1, type: u.type, as: 'batter' });
  used(w, u, 'bat');
  if (t.hp > 0 && pass >= 0.5 && tossable(t, heavy(u, BAT.homerMass))) {
    tossTo(w, t, ux, uy, scale(u, BAT.homerMin + w.rng() * (BAT.homerMax - BAT.homerMin)), BAT.homerUp);
    flung(w, t, u, scale(u, BAT.landHit));
    hatKnock(w, t, ux, uy, 1);
    bag.homers++;
  } else if (t.hp > 0) push(w, t, ux, uy, scale(u, BAT.push) * pass, BAT.stun * pass);
}
function batWind(w, u, bag, t) {
  bag.phase = WIND; bag.t0 = w.time; bag.victim = t ? t.id : -1; u.b.victim = bag.victim;
  u.cooldown = BAT.wind + 0.05;
  pose(w, u, ACT.WIND);
}
function batEnd(w, u, bag) {
  if (bag.phase === WIND) unpose(w, u, ACT.WIND); else if (bag.phase === SWUNG) unpose(w, u, ACT.SWING);
  bag.phase = 0;
  if (u.b.victim === bag.victim) u.b.victim = -1;
  bag.victim = -1;
}
registerWeapon({
  id: 'bat', range: 0,
  def: { look: { attack: { time: BAT.attackTime } } },
  init(w, u, bag) {
    bag.phase = 0; bag.t0 = 0; bag.victim = -1; bag.batAt = -9; bag.batted = 0; bag.homers = 0;
    // the wind-up starts as it comes in: once its man is within the swing's own reach (reach + band: what batSwing can hit)
    // plus the ground it steps in during the wind (stepIn × wind), so the bat comes round as it arrives. The batter starts
    // it at `reach` only, which a made unit under fire rarely gets to (it was shot / stunned off its man first).
    // While the bat cools down it closes to `reach` at run speed (gunmen back off).
    const stepIn = Math.min(BAT.stepIn, u.def.runSpeed);
    bag.start = scale(u, BAT.reach + BAT.band) + stepIn * BAT.wind;
    bag.stepTo = scale(u, BAT.reach); bag.stepIn = stepIn;
    u.cooldown = w.rng() * BAT.cooldown;
    batters(w).push(u);
  },
  tick(w, u, bag) {
    const age = w.time - bag.t0;
    if (bag.phase === SWUNG && age >= BAT.swingPose) batEnd(w, u, bag);
    // a started swing always comes round (the batter dropped it on any stun); only running away or dying stops it
    if (bag.phase === WIND) { if (u.state === STATE.FLEE || !(u.hp > 0)) batEnd(w, u, bag); else if (age >= BAT.wind) batSwing(w, u, bag); }
  },
  fight(w, u, t, dx, dy, d, bag) {
    if (bag.phase === WIND) {                          // winding up: step into the swing (they back off)
      u.face = Math.atan2(dy, dx); bag.victim = t.id; u.b.victim = t.id; setState(u, STATE.ENGAGE);
      if (d > u.radius + t.radius + bag.stepTo) { const s = bag.stepIn; u.goalX = (dx / d) * s; u.goalY = (dy / d) * s; }
      return;
    }
    if (reachable(w, u, t, dx, dy, d, bag.start) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
    if (d > u.radius + t.radius + bag.start) { close(w, u, t, dx, dy, d); return; }
    setState(u, STATE.ENGAGE);
    if (u.group >= 0 && w.groups.markEngaged) w.groups.markEngaged(u.group);
    const a = Math.atan2(dy, dx);
    u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < BAT.facing) { batWind(w, u, bag, t); return; }
    if (d > u.radius + t.radius + bag.stepTo) { const s = u.def.runSpeed; u.goalX = (dx / d) * s; u.goalY = (dy / d) * s; }
    circle(w, u, t, dx, dy, d, u.def, BAT.circle, true);
    oddsApproach(w, u, t, dx, dy, d, u.def);
  },
  // possessed, attack held at nobody: an empty swing (wind-up, swing); held = also ready to bat things back
  possessFire(w, u, aim, ax, ay, bag) { if (bag.phase === 0 && u.cooldown <= 0) batWind(w, u, bag, null); },
});

// ---------------------------------------------------------------- 'maker:bat' (after brain): the bat-back
// A grenade, bomb, oil pot, baseball or mini rocket of another side coming within r + 18 (× power) of a ready bat:
// 30 % (rolled once, the tick it enters the zone) it is hit back at its thrower and becomes the bat's (side, kills).
// From units/sports/_lib.js batReady / batBack / batRun (STEP6 Sports): same modes, same numbers (batter.js T.batBack).
const BAT_LISTS = new WeakMap();   // world -> made units carrying the bat (pruned as they go)
function batters(w) { let L = BAT_LISTS.get(w); if (!L) { L = []; BAT_LISTS.set(w, L); } return L; }
onWorldClear((w) => { const L = BAT_LISTS.get(w); if (L) L.length = 0; });
function batReady(w, u, bag, B) {
  return !u.dead && u.hp > 0 && !(u.stun > 0) && u.inside < 0 && !(u.floating > w.time) && onGround(u)
    && w.time >= bag.batAt + B.cooldown && u.state !== STATE.FLEE && canAuto(w, u);
}
function batBack(w, u, p, mode, B, bag) {
  const own = ownerOf(w, p);
  let tx, ty;
  if (own && own !== u && own.hp > 0) { tx = own.x; ty = own.y; }
  else { const v = hypot(p.vx, p.vy) || 1; tx = p.x - (p.vx / v) * B.lost; ty = p.y - (p.vy / v) * B.lost; }   // thrower gone: back where it came from
  const dx = tx - p.x, dy = ty - p.y, d = hypot(dx, dy) || 1;
  if (mode >= 3) {
    const sp = Math.max(hypot(p.vx, p.vy), B.lineMin);
    p.vx = (dx / d) * sp; p.vy = (dy / d) * sp;
    p.life = p.maxLife = mode === 4 ? Math.max(DT, d / sp) : Math.max(p.life, (d / sp) * B.linePad);
    p.passed = -1; p.rise = 0; p.drop = 0;
  } else {
    const fl = Math.max(B.minFlight, d / B.lobSpeed);
    p.vx = dx / fl; p.vy = dy / fl; p.life = p.maxLife = fl; p.apex = B.apexPer * d + B.apexMin; p.bounces = 0;
    if (mode === 2) { p.drop = 0; p.rise = fl + B.fusePad; }   // the fuse is re-timed to blow as it lands at the thrower's feet
  }
  p.owner = u.id; p.faction = u.faction; p.team = u.team; p.wild = 0;
  bag.batAt = w.time; bag.batted++;
  if (bag.phase === WIND) unpose(w, u, ACT.WIND);
  bag.phase = SWUNG; bag.t0 = w.time; pose(w, u, ACT.SWING); u.attack = 1; u.face = Math.atan2(dy, dx);
  w.emit('strike', { x: p.x, y: p.y, v: 1, type: u.type, bat: 1, as: 'batter' });
  stat(w, 'shots');
  used(w, u, 'bat');
}
function batRun(w) {
  const L = BAT_LISTS.get(w); if (!L || L.length === 0) return;
  for (let k = L.length - 1; k >= 0; k--) { const u = L[k]; if (u.dead || !u.def.maker || u.def.maker.weapon.id !== 'bat') { L[k] = L[L.length - 1]; L.pop(); } }
  const list = w.projectiles;
  if (L.length === 0 || !list || list.length === 0) return;
  const B = BATTER.batBack;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i], mode = B.kinds[p.kind];
    if (mode === undefined || !(p.z <= B.maxZ) || p.host >= 0) continue;
    for (let k = 0; k < L.length; k++) {
      const u = L[k], R = u.radius + scale(u, B.reach);
      const dx = p.x - u.x, dy = p.y - u.y;
      if (dx * dx + dy * dy > R * R) continue;
      const ex = p.px - u.x, ey = p.py - u.y;
      if (ex * ex + ey * ey <= R * R) continue;        // was inside already: its roll is done
      if (p.vx * dx + p.vy * dy >= 0) continue;          // not coming at it
      const bag = u.b.wb;
      if (!shotHits(p, u) || !batReady(w, u, bag, B)) continue;
      if (w.rng() >= B.chance) continue;                 // missed it (one roll per bat per projectile)
      batBack(w, u, p, mode, B, bag);
      break;
    }
  }
}
registerSystem('maker:bat', batRun, 'brain');

// ================================================================ ram (carried by the unit: drives at a wall, breaks it)
// from units/siege/ram.js RAM / SHOVE, blow() / cycle() / shove() and its brain. No crew (STEP8: a machine weapon is
// carried by the unit itself, the source's reload 1.8 s); it closes at the unit's run speed.
const RAM = Object.freeze({
  every: 1.8,         // STEP4: a blow every 1.8 s
  pull: 0.55,         // s pulled back (ACT.WIND) ...
  thrust: 0.3,        // ... then the thrust (ACT.SWING); the blow lands at its start
  head: 4,            // px past the radius: the ram's head (× power)
  wallR: 26,          // STEP4: wall tiles within 26 px of the head ... (× power)
  wallDmg: 260,       // ... take 260 (× power; a fresh tile has 100)
  unitR: 16,          // units within 16 px (+ their radius) of the head ... (× power)
  unitDmg: 60,        // ... take 60 (STEP4) ... (× power)
  tossOut: 170,       // ... and are tossed forward (× power) ...
  tossUp: 230,        // ... up
  rollMul: 1.4,       // ×1.4 when it is moving faster than 25 px/s
  rollFrom: 25,       // px/s
  reachWall: 20,      // starts a blow when a wall tile is within 20 px of the head (× power)
  reachUnit: 12,      // ... or an enemy within 12 px of the head (× power)
  faceWall: 0.5,      // rad: facing the wall this well
  faceUnit: 0.6,      // rad: facing the enemy this well
  shoveSpeed: 26,     // px/s: moving this fast it shoves people aside
  shoveDmg: 6,        // (× power)
  shovePush: 170,     // (× power)
  shoveStun: 0.35,    // s
  shoveAgain: 0.6,    // s: the same unit once per 0.6 s
  shoveMass: 8,       // units this heavy (× power²) aren't shoved
  driveIn: 0.5,       // while pulled back it drives on until its man is within unitR × 0.5 of the head
  retry: 0.3,         // s: a thrust that hit nothing (its man was shoved off it) is ready again this soon (the ram: 1.8)
  hold: 0.6,          // s: a blow at a man stays pulled back up to this long past `pull` until he is on the head
  memory: 6,          // s: with no one in sight it heads for the group's fight this long after the last contact (ram.js)
  attackTime: 0.3,    // the body's attack pose time
});
const _pt = new Float64Array(2), _wp = new Float64Array(2), _cp = new Float32Array(2);
function headOf(u, out) { const r = u.radius + scale(u, RAM.head); out[0] = u.x + Math.cos(u.heading) * r; out[1] = u.y + Math.sin(u.heading) * r; return out; }
let _bu = null, _bw = null, _bx = 0, _by = 0, _bk = 1, _bn = 0;
function blowOne(o) {
  const u = _bu, w = _bw;
  if (o === u || !(o.hp > 0) || o.z > 10 || o.climb > 0) return;
  if (o.faction === u.faction) return;                                       // never its own side
  if (hypot(o.x - _bx, o.y - _by) > scale(u, RAM.unitR) + o.radius) return;
  const c = Math.cos(u.heading), s = Math.sin(u.heading);
  if ((o.x - u.x) * c + (o.y - u.y) * s < 0) return;                         // in front only
  const pass = damage(w, o, scale(u, RAM.unitDmg) * _bk, u, 'blow');
  if (o.hp > 0) toss(w, o, c, s, scale(u, RAM.tossOut) * _bk * pass, RAM.tossUp * _bk * pass);
  w.emit('strike', { x: o.x, y: o.y, v: 1.5, type: u.type, as: 'ram' });
  _bn++;
}
function ramBlow(w, u, bag) {
  headOf(u, _pt);
  const sp = hypot(u.vx, u.vy);
  _bu = u; _bw = w; _bx = _pt[0]; _by = _pt[1]; _bk = sp > RAM.rollFrom ? RAM.rollMul : 1; _bn = 0;
  w.query(_pt[0], _pt[1], scale(u, RAM.unitR) + M.MARGIN, blowOne);
  const hits = _bn; _bu = null; _bw = null;
  const broke = hitWalls(w, _pt[0], _pt[1], scale(u, RAM.wallR), scale(u, RAM.wallDmg) * _bk);
  if (broke > 0 || hits > 0 || wallNear(w, _pt[0], _pt[1], scale(u, RAM.wallR))) w.emit('ram', { x: _pt[0], y: _pt[1], v: 1, walls: broke, units: hits, type: u.type, as: 'ram' });
  if (broke > 0) w.emit('land', { x: _pt[0], y: _pt[1], v: 18, type: 'ram', as: 'ram' });   // crunch (the ram's own thud)
  u.attack = 1;
  bag.walls += broke; bag.hits += hits;
  if (hits > 0 || broke > 0) used(w, u, 'ram');
  else if (!wallNear(w, _pt[0], _pt[1], scale(u, RAM.wallR)) && u.cooldown > RAM.retry) u.cooldown = RAM.retry;   // hit nothing: swings again soon
}
/** Is m on the ram's head (within unitR of it, past its radius)? */
function onHead(u, m) { headOf(u, _pt); return hypot(m.x - _pt[0], m.y - _pt[1]) <= scale(u, RAM.unitR) + m.radius; }
/**
 * Pull back, then thrust; the blow lands at the thrust. Every tick (tick hook), also while stunned, as the ram. A blow at a
 * man (bag.man) stays pulled back after RAM.pull until he is on the head (up to RAM.hold more), so it thrusts on arrival:
 * the ram's timed thrust found a made unit's man shoved or bounced off it every time (boars, legions).
 */
function ramCycle(w, u, bag) {
  if (bag.ramAt < 0) return;
  const t = w.time - bag.ramAt;
  if (t < RAM.pull) { pose(w, u, ACT.WIND); return; }
  if (bag.ramHit === 0) {
    const m = bag.man >= 0 ? w.unitById(bag.man) : null;
    if (m && m.hp > 0 && t < RAM.pull + RAM.hold && !onHead(u, m)) return;   // held back, still driving in
    bag.ramHit = 1; bag.thrustAt = w.time;
    unpose(w, u, ACT.WIND); pose(w, u, ACT.SWING); ramBlow(w, u, bag);
    return;
  }
  if (w.time - bag.thrustAt < RAM.thrust) return;
  bag.ramAt = -1; bag.man = -1; unpose(w, u, ACT.SWING); unpose(w, u, ACT.WIND);
}
function ramStart(w, u, bag, man) {
  if (bag.ramAt >= 0 || u.cooldown > 0 || u.stun > 0) return false;
  bag.ramAt = w.time; bag.ramHit = 0; bag.man = man ? man.id : -1; u.cooldown = RAM.every;
  pose(w, u, ACT.WIND);
  return true;
}
/** The first wall between u and (x, y): drive up to it and knock it down. True = there was one (it drove u this tick). */
function ramWall(w, u, bag, x, y) {
  if (!wallBetween(w, u.x, u.y, x, y, _wp)) return false;
  const wx = _wp[0] - u.x, wy = _wp[1] - u.y, wd = hypot(wx, wy) || 0.001;
  u.face = Math.atan2(wy, wx);
  setState(u, STATE.ADVANCE);
  headOf(u, _pt);
  if (wallNear(w, _pt[0], _pt[1], scale(u, RAM.reachWall)) && Math.abs(angleDiff(u.heading, u.face)) < RAM.faceWall) { setState(u, STATE.ENGAGE); ramStart(w, u, bag, null); return true; }
  if (wd > u.radius) { const s = u.def.runSpeed; u.goalX = (wx / wd) * s; u.goalY = (wy / wd) * s; }
  return true;
}
let _su = null, _sw = null, _sb = null;
function shoveOne(o) {
  const u = _su, w = _sw, b = _sb;
  if (o === u || !(o.hp > 0) || o.z > 6 || o.climb > 0 || o.faction === u.faction || o.def.machine || o.mass >= heavy(u, RAM.shoveMass)) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d > u.radius + o.radius + 2) return;
  const c = Math.cos(u.heading), s = Math.sin(u.heading);
  if (dx * c + dy * s < 0.3 * d) return;
  for (let k = 0; k < 4; k++) if (b.shoveId[k] === o.id && w.time - b.shoveT[k] < RAM.shoveAgain) return;
  b.shoveId[b.shoveK] = o.id; b.shoveT[b.shoveK] = w.time; b.shoveK = (b.shoveK + 1) & 3;
  const side = c * dy - s * dx >= 0 ? 1 : -1, px = 0.7 * c - s * side * 0.7, py = 0.7 * s + c * side * 0.7;
  const pass = damage(w, o, scale(u, RAM.shoveDmg), u, 'blow');
  push(w, o, px, py, scale(u, RAM.shovePush) * pass, RAM.shoveStun * pass);
  w.emit('trample', { x: o.x, y: o.y, v: 0.6, type: u.type, as: 'ram' });
}
function ramShove(w, u, bag) {
  if (hypot(u.vx, u.vy) < RAM.shoveSpeed) return;
  _su = u; _sw = w; _sb = bag;
  w.query(u.x, u.y, u.radius + M.MARGIN + 2, shoveOne, ENEMY[u.faction]);
  _su = null; _sw = null; _sb = null;
}
registerWeapon({
  id: 'ram', range: 0,
  def: { look: { attack: { time: RAM.attackTime } } },
  init(w, u, bag) {
    bag.ramAt = -1; bag.ramHit = 0; bag.man = -1; bag.thrustAt = -9; bag.shoveId = new Int32Array(4).fill(-1); bag.shoveT = new Float64Array(4); bag.shoveK = 0;
    bag.walls = 0; bag.hits = 0;
    u.cooldown = 0.5 * w.rng();
  },
  tick(w, u, bag) {
    ramCycle(w, u, bag);
    if (!(u.stun > 0) && (!airborne(u) || lowFlyer(u)) && u.hp > 0) ramShove(w, u, bag);   // ATTACK3 L4: a flyer shoves at the bottom of its dive
  },
  // no one in sight: the group's fight / last word of the enemy (the ram's objective()); a wall in the way gets knocked down
  idle(w, u, bag) {
    if (u.possessed === 1 || w.walls.count === 0 || !contactPoint(w, u, null, RAM.memory, _cp)) return false;
    return ramWall(w, u, bag, _cp[0], _cp[1]);
  },
  fight(w, u, t, dx, dy, d, bag) {
    if (w.walls.count > 0 && ramWall(w, u, bag, t.x, t.y)) return;
    if (reachable(w, u, t, dx, dy, d, scale(u, RAM.head + RAM.unitR + RAM.reachUnit)) !== t) { t = NEAR.t; dx = NEAR.dx; dy = NEAR.dy; d = NEAR.d; }
    const a = Math.atan2(dy, dx);
    headOf(u, _pt);
    const hd = hypot(t.x - _pt[0], t.y - _pt[1]);
    // starts pulling back as it comes in (it can cover runSpeed × pull meanwhile), then drives on until the man is on the head
    if (bag.ramAt >= 0 || hd <= scale(u, RAM.unitR + RAM.reachUnit) + t.radius + u.def.runSpeed * RAM.pull) {
      u.face = a;
      setState(u, STATE.ENGAGE);
      if (u.group >= 0 && w.groups.markEngaged) w.groups.markEngaged(u.group);
      if (Math.abs(angleDiff(u.heading, a)) < RAM.faceUnit) ramStart(w, u, bag, t);
      // pulled back: it keeps driving in (rolling = the ×1.4 blow) until the head is on its man, so the thrust lands. The
      // ram stood still once it started a blow; a made unit's man (a backing-off gunman) was gone by the thrust.
      if (bag.ramAt >= 0 && hd > scale(u, RAM.unitR) * RAM.driveIn + t.radius) { const s = u.def.runSpeed; u.goalX = (dx / d) * s; u.goalY = (dy / d) * s; }
      return;
    }
    close(w, u, t, dx, dy, d);
  },
  possessFire(w, u, aim, ax, ay, bag) { ramStart(w, u, bag, null); },
});

// ================================================================ saw (sawbot's saw run into the thickest crowd)
// from units/robots/sawbot.js T, saw() / startRun() / runStep() / turnRun() and its brain. The run rolls at 200 px/s ×
// the unit's speed step (the saw's own wheels: a slow body rolls slower); the blade's bite and shove × power. In the air
// (a flying body) there is no run: the blade bites whatever it touches as the unit closes in.
const SAW = Object.freeze({
  run: 200,           // px/s: saw-run speed at speed step 1× (sawbot runSpeed)
  minRun: 60,         // px/s: never slower than this
  accel: 900,         // px/s² getting up to run speed
  scanR: 250,         // px: looks this far for a crowd
  scanEvery: 15,      // ticks between crowd searches
  over: 70,           // px: runs on past the crowd point
  maxRun: 2,          // s: longest run
  touch: 6,           // px past both radii: touching the saw (× power)
  dmg: 12,            // per touch (× power) ...
  every: 0.2,         // ... at most once per 0.2 s per victim
  shove: 140,         // push aside off the saw's line (÷ mass, × power)
  shoveFwd: 0.35,     // × shove along the run
  shoveStun: 0.15,    // s
  bounces: 2,         // wall bounces per run
  turn: 0.4,          // s braking and turning round after a run
  home: 1.6,          // rad/s: the run bends toward its pick until it reaches it
  attackTime: 0.25,   // sawbot look.attack.time
});
const RUN = 1, TURN = 2;   // bag.mode
const HN = 8;              // victims remembered (the 0.2 s rule)
let _xw = null, _xu = null, _xb = null;
function sawOne(o) {
  const u = _xu, w = _xw, b = _xb;
  if (o === u || !(o.hp > 0) || !canHit(u, o) || !touchable(o)) return;
  const ox = o.x - u.x, oy = o.y - u.y, d = hypot(ox, oy);
  if (d > u.radius + o.radius + scale(u, SAW.touch)) return;
  for (let k = 0; k < HN; k++) if (b.hitId[k] === o.id && w.time - b.hitT[k] < SAW.every) return;
  b.hitId[b.hk] = o.id; b.hitT[b.hk] = w.time; b.hk = (b.hk + 1) % HN;
  damage(w, o, scale(u, SAW.dmg), u);
  if (o.hp > 0) {
    const side = b.dx * oy - b.dy * ox >= 0 ? 1 : -1;
    push(w, o, -b.dy * side + b.dx * SAW.shoveFwd, b.dx * side + b.dy * SAW.shoveFwd, scale(u, SAW.shove), SAW.shoveStun);
  }
  w.emit('strike', { x: o.x, y: o.y, v: 1, type: u.type, as: 'sawbot' });
  if ((w.tick & 1) === 0) w.emit('spark', { x: u.x + ox * 0.5, y: u.y + oy * 0.5, ang: Math.atan2(-b.dy, -b.dx) + w.rng() - 0.5, size: 0.8, as: 'sawbot' });
  u.attack = 1;
  used(w, u, 'saw');
}
function saw(w, u, bag) {
  _xw = w; _xu = u; _xb = bag;
  w.query(u.x, u.y, u.radius + scale(u, SAW.touch) + M.MARGIN, sawOne, ALL_MASK);
  _xw = null; _xu = null; _xb = null;
}
function sawStart(w, u, bag, tx, ty, pick) {
  const dx = tx - u.x, dy = ty - u.y, d = hypot(dx, dy) || 1;
  bag.dx = dx / d; bag.dy = dy / d; bag.pick = pick ? pick.id : -1;
  bag.until = w.time + Math.min(SAW.maxRun, (d + SAW.over) / bag.runV);
  bag.bounces = 0; bag.mode = RUN; bag.runs++;
  u.leaping = 1;                                       // ploughs through bodies (steering skips it), like the ninja's dash
  u.heading = Math.atan2(bag.dy, bag.dx);
  pose(w, u, ACT.SPIN);
  setState(u, STATE.ENGAGE);   // not CHARGE: OG gunners sidestep a charger; a saw just rolls in
  w.emit('saw', { x: u.x, y: u.y, type: u.type, id: u.id, as: 'sawbot' });
}
function sawEnd(w, u, bag) {
  bag.mode = TURN;
  if (u.leaping === 1) u.leaping = 0;
  bag.until = w.time + SAW.turn;
  unpose(w, u, ACT.SPIN);
}
function sawBounce(w, u, bag, flipX, flipY, x, y) {
  if (flipX) bag.dx = -bag.dx;
  if (flipY) bag.dy = -bag.dy;
  bag.bounces++;
  w.emit('ricochet', { x, y, v: 1, type: u.type, as: 'sawbot' });
  spark(w, x, y, Math.atan2(bag.dy, bag.dx), 1);
}
function turnRun(bag, want, step) {
  const a = Math.atan2(bag.dy, bag.dx);
  let da = want - a; da -= TAU * Math.round(da / TAU);
  const na = a + Math.max(-step, Math.min(step, da));
  bag.dx = Math.cos(na); bag.dy = Math.sin(na);
}
function sawStep(w, u, bag) {
  if (u.leaping !== 1 || !(u.hp > 0) || u.stun > 0 || w.time >= bag.until || u.webbed > w.time || u.floating > w.time || u.inside >= 0) { sawEnd(w, u, bag); return; }
  const along = u.vx * bag.dx + u.vy * bag.dy, v = Math.min(bag.runV, Math.max(0, along) + SAW.accel * DT);
  const p = bag.pick >= 0 ? w.unitById(bag.pick) : null;
  if (p && p.hp > 0 && u.possessed !== 1) {             // bend toward the pick until it is reached, then straight on through
    const px = p.x - u.x, py = p.y - u.y, pd = hypot(px, py);
    if (pd < u.radius + p.radius || px * bag.dx + py * bag.dy <= 0) bag.pick = -1;
    else turnRun(bag, Math.atan2(py, px), SAW.home * DT);
  }
  const r = u.radius, step = v * DT + r, W = w.walls;
  if (W.count > 0 && W.isSolidAt(u.x + bag.dx * step, u.y + bag.dy * step)) {
    const fx = W.isSolidAt(u.x + bag.dx * step, u.y), fy = W.isSolidAt(u.x, u.y + bag.dy * step);
    sawBounce(w, u, bag, fx || !fy, fy || !fx, u.x + bag.dx * r, u.y + bag.dy * r);
  }
  const ex = (u.x < r + 2 && bag.dx < 0) || (u.x > w.W - r - 2 && bag.dx > 0), ey = (u.y < r + 2 && bag.dy < 0) || (u.y > w.H - r - 2 && bag.dy > 0);
  if (ex || ey) sawBounce(w, u, bag, ex, ey, u.x, u.y);
  if (bag.bounces > SAW.bounces) { sawEnd(w, u, bag); return; }
  u.vx = bag.dx * v; u.vy = bag.dy * v;
  u.heading = Math.atan2(bag.dy, bag.dx); u.face = u.heading;
  saw(w, u, bag);
}
registerWeapon({
  id: 'saw', range: 0,
  def: { look: { attack: { time: SAW.attackTime } } },
  init(w, u, bag) {
    bag.mode = 0; bag.dx = Math.cos(u.heading); bag.dy = Math.sin(u.heading); bag.until = 0; bag.bounces = 0; bag.scan = 0; bag.pick = -1;
    bag.hitId = new Int32Array(HN).fill(-1); bag.hitT = new Float64Array(HN); bag.hk = 0; bag.runs = 0;
    bag.runV = Math.max(SAW.minRun, SAW.run * (u.def.maker ? u.def.maker.speed : 1));
  },
  tick(w, u, bag) {
    if (bag.mode === RUN) { sawStep(w, u, bag); return; }
    if (bag.mode === TURN) {
      if (!(u.stun > 0) && u.hp > 0) saw(w, u, bag);       // the blade still bites while it brakes
      if (w.time >= bag.until) { bag.mode = 0; bag.scan = 1; }
    }
  },
  busy(w, u, bag) {
    if (bag.mode === 0) return false;
    u.goalX = 0; u.goalY = 0;
    if (bag.mode === TURN) { const t = u.target >= 0 ? w.unitById(u.target) : null; u.face = t ? Math.atan2(t.y - u.y, t.x - u.x) : u.heading + Math.PI; }
    else u.face = u.heading;
    return true;
  },
  fight(w, u, t, dx, dy, d, bag) {
    if (u.leaping !== 0 || u.z > 0) { close(w, u, t, dx, dy, d); saw(w, u, bag); return; }   // up in the air: no run
    if (canAuto(w, u)) {
      let c = null;
      if (u.possessed === 1) c = touchable(t) ? t : null;                                  // the player picks who
      else if (bag.scan === 1 || (w.tick + u.index) % SAW.scanEvery === 0) { bag.scan = 0; c = crowdTarget(w, u, SAW.scanR); }
      if (c) { sawStart(w, u, bag, c.x, c.y, c); return; }
    }
    close(w, u, t, dx, dy, d);
    if (d < SAW.scanR) bag.scan = 1;
  },
  // possessed, attack held at nobody: a saw run at the aim point
  possessFire(w, u, aim, ax, ay, bag) {
    if (bag.mode !== 0 || u.stun > 0 || u.leaping !== 0 || u.z > 0) return;
    const dx = ax - u.x, dy = ay - u.y;
    if (hypot(dx, dy) < 20) sawStart(w, u, bag, u.x + Math.cos(aim) * 100, u.y + Math.sin(aim) * 100, null);
    else sawStart(w, u, bag, ax, ay, null);
  },
});

export { ANCHOR, BAT, RAM, SAW };
