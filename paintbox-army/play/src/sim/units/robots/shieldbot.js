// shieldbot (OURS, Robots tab): raises a DOME r 70 round itself while enemies are within 320 px. An enemy projectile that
// would cross into the dome stops at its edge (every kind: bullets, arrows, shuriken, plasma, grenades, bolts, cannonballs,
// boulders, spit, bombs, flames, rockets...): kinds that carry a blast (`p.blast`: grenades, plasma, rockets) burst there,
// the rest fizzle with a spark. Shots fired from inside, friendly shots and slow drifting effects (clouds, patches) pass.
// Dome hp 400: each stopped shot costs its damage (at least 1); regrows 40/s after 3 s with no hit; at 0 it breaks for
// 6 s. Units walk through it. The bot keeps ~60 px behind its nearest ally, away from the enemy (the ally stands inside
// the dome). Melee zap 6. The check sits in combat/ballistics.js (DOME hook, marked STEP6 ROBOTS): one cheap test per
// projectile per tick while a dome is up, nothing at all otherwise. Enemy laser beams (laser bot) stop at the dome too.
// b.act: 1 dome up → `dome` (antenna glows). The dome = effect projectile `dome` following the bot: p.r radius (px),
// p.k dome hp 0..1, p.hitAt world.time of the last block (flash).
import { robot, initB, setAct, begin, targetOf, idle, keepRange, melee, emptySwing, losClear, hittable, ownerOf, hypot, STATE, DT, CB, ENEMY, moveTo, setState, ROBOT } from './_lib.js';
import { groupPoint } from '../../systems/navigation.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { DOME } from '../../combat/ballistics.js';
import { onWorldClear } from '../../world.js';
import { maskBit, canHit } from '../../factions.js';

const T = {
  hp: 180, // hit points
  mass: 2.5, // -
  walk: 50, // px/s
  run: 80, // px/s
  domeR: 70, // px: dome radius
  domeHp: 400, // dome hit points
  regrow: 40, // hp/s the dome regrows ...
  regrowAfter: 3, // ... once this long without a hit (s)
  broken: 6, // s the dome is down after it breaks
  sense: 320, // px: enemies this close raise the dome
  senseEvery: 8, // ticks between enemy checks
  senseHold: 0.6, // s the dome stays up after the last enemy was seen in range
  minCost: 1, // a stopped shot costs the dome at least this
  slowShot: 60, // px/s: slower projectiles (drifting clouds, patches, effects) are not shots
  behind: 60, // px behind its nearest ally, away from the enemy
  allyR: 220, // px: looks this far for an ally to cover
  allyEvery: 15, // ticks between ally / spot picks
  arrive: 6, // px from the spot = there
  alone: [100, 160], // px: with nobody to cover, it holds this far from its target
  zap: {
    damage: 6, // melee zap
    damageJitter: 1, // ±
    cooldown: 0.8, // s
    cooldownJitter: 0.2, // +
    push: 40, // jolt
    stun: 0.1, // s
    reach: 4, // px past both radii
    band: 6, // px: only fights what is right on it (its job is the dome)
    facing: 0.8, // rad
    circle: 0, // no strafing
  },
};

// ---------------------------------------------------------------- per-world list of domes that are up
const WS = new WeakMap();
function domes(world) { let L = WS.get(world); if (!L) { L = []; WS.set(world, L); } return L; }
onWorldClear((w) => { const L = WS.get(w); if (L) L.length = 0; });
function upNow(o) { return !o.dead && o.hp > 0 && o.b.dome === 1; }
/** Any dome up? Drops the ones that went down (ballistics calls this once per tick). */
function live(world) {
  const L = WS.get(world); if (!L || L.length === 0) return false;
  for (let i = L.length - 1; i >= 0; i--) if (!upNow(L[i])) { L[i] = L[L.length - 1]; L.pop(); }
  return L.length > 0;
}
/** A dome takes a hit of dmg at (x, y): flash, cost, break at 0. */
export function hitDome(world, o, dmg, x, y) {
  const b = o.b;
  b.domeHp -= Math.max(T.minCost, dmg); b.domeHit = world.time; b.hitAt = world.time;
  world.emit('block', { x, y, v: 1, type: o.type, dome: 1 });
  if (b.domeHp > 0) return;
  b.domeHp = 0; b.brokenUntil = world.time + T.broken;
  domeDown(world, o);
  world.emit('domebreak', { x: o.x, y: o.y, r: T.domeR, type: o.type, id: o.id });
}
// Ballistics hook: p crossing into an enemy dome this tick stops at the edge (removed). True = removed.
// STEP6 (lead): effect projectiles (STEP6.md: they follow a unit or sit on the floor, hit nothing) always pass.
const PASS = new Set(['dome', 'bubble', 'mind', 'webon', 'webpatch', 'gas', 'ink', 'lava']);
function stopShot(world, p, i) {
  if (PASS.has(p.kind)) return false;
  const vx = p.vx, vy = p.vy;
  if (vx * vx + vy * vy < T.slowShot * T.slowShot) return false;
  const L = WS.get(world), R = T.domeR, x0 = p.x, y0 = p.y, dx = vx * DT, dy = vy * DT, a = dx * dx + dy * dy;
  for (let k = 0; k < L.length; k++) {
    const o = L[k];
    if (!upNow(o)) continue;
    const fx = x0 - o.x, fy = y0 - o.y, f2 = fx * fx + fy * fy, reach = R + Math.abs(dx) + Math.abs(dy);
    if (f2 > reach * reach || f2 <= R * R) continue;              // too far to reach it this tick / already inside
    const hb = fx * dx + fy * dy;
    if (hb >= 0) continue;                                        // moving away
    const disc = hb * hb - a * (f2 - R * R);
    if (disc < 0) continue;
    const t1 = (-hb - Math.sqrt(disc)) / a;
    if (t1 > 1 || !hittable(p, o)) continue;
    const ex = x0 + dx * t1, ey = y0 + dy * t1;
    hitDome(world, o, p.damage, ex, ey);
    if (p.blast) CB.explode(world, ex, ey, p.blast, ownerOf(world, p), p.damage);
    else CB.spark(world, ex, ey, Math.atan2(-dy, -dx) + 0.8 * (world.rng() - 0.5), 0.8);
    removeProjectile(world, i);
    return true;
  }
  return false;
}
DOME.live = live;
DOME.stop = stopShot;

let _cut = null;
/**
 * A beam from unit u at (x0, y0) along the unit vector (dx, dy) for len px: the distance to the first enemy dome edge it
 * enters (len if none). The dome it hit: cutDome(). Beams that start inside a dome go through it.
 */
export function domeCut(world, u, x0, y0, dx, dy, len) {
  _cut = null;
  const L = WS.get(world); if (!L || L.length === 0) return len;
  const R = T.domeR; let best = len;
  for (let k = 0; k < L.length; k++) {
    const o = L[k];
    if (!upNow(o) || !canHit(u, o)) continue;
    const fx = x0 - o.x, fy = y0 - o.y, f2 = fx * fx + fy * fy;
    if (f2 <= R * R) continue;
    const hb = fx * dx + fy * dy;
    if (hb >= 0) continue;
    const disc = hb * hb - (f2 - R * R);
    if (disc < 0) continue;
    const s = -hb - Math.sqrt(disc);
    if (s < best) { best = s; _cut = o; }
  }
  return best;
}
export function cutDome() { return _cut; }

// ---------------------------------------------------------------- the dome effect projectile (art: PROJ `dome`)
function stepDome(world, p, i) {
  const o = p.owner >= 0 ? world.unitById(p.owner) : null;
  if (!o || !upNow(o) || o.b.gen !== p.gen) { removeProjectile(world, i); return; }
  p.px = p.x; p.py = p.y; p.x = o.x; p.y = o.y;
  p.r = T.domeR; p.k = o.b.domeHp / T.domeHp; p.hitAt = o.b.hitAt; p.life = 1;
}
registerProjectileKind('dome', stepDome);

function domeUp(world, u) {
  const b = u.b;
  b.dome = 1; b.gen++;
  domes(world).push(u);
  setAct(world, u, 1);
  const p = spawnProjectile(world, 'dome', u.x, u.y, 0, 0, 1, 0, u.faction, u);
  if (p) { p.r = T.domeR; p.k = b.domeHp / T.domeHp; p.hitAt = b.hitAt; p.gen = b.gen; }
  world.emit('dome', { x: u.x, y: u.y, r: T.domeR, type: u.type, id: u.id, up: 1 });
}
function domeDown(world, u) {
  const b = u.b;
  if (b.dome !== 1) return;
  b.dome = 0;
  setAct(world, u, 0);
  world.emit('dome', { x: u.x, y: u.y, r: T.domeR, type: u.type, id: u.id, up: 0 });
}
// every tick, stunned or not: regrow, sense enemies, raise / drop
function domeTick(world, u) {
  const b = u.b, now = world.time;
  if (now >= b.brokenUntil && now - b.domeHit >= T.regrowAfter && b.domeHp < T.domeHp) b.domeHp = Math.min(T.domeHp, b.domeHp + T.regrow * DT);
  if ((world.tick + u.index) % T.senseEvery === 0 && world.findNearest(u.x, u.y, T.sense, ENEMY[u.faction], null, 1)) b.seen = now;
  const want = now - b.seen < T.senseHold && now >= b.brokenUntil && b.domeHp > 0;
  if (want && b.dome !== 1) domeUp(world, u);
  else if (!want && b.dome === 1) domeDown(world, u);
}

// ---------------------------------------------------------------- the spot behind an ally
let _su = null, _sb = null, _sbd = 0, _sbr = 0;
// nearest ally, preferring anyone but another shield bot (shield bots alone would chain behind each other)
function allyOne(o) {
  if (o === _su || o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0) return;
  const rank = o.type === 'shieldbot' ? 1 : 0, d = hypot(o.x - _su.x, o.y - _su.y);
  if (_sb && (rank > _sbr || (rank === _sbr && d >= _sbd))) return;
  _sb = o; _sbd = d; _sbr = rank;
}
function nearestAlly(world, u) {
  _su = u; _sb = null; _sbd = Infinity; _sbr = 0;
  world.query(u.x, u.y, T.allyR, allyOne, maskBit(u.faction));
  const a = _sb; _su = null; _sb = null;
  return a;
}
// spot: ally + T.behind px away from the enemy point (ex, ey)
function pickSpot(world, u, ex, ey) {
  const b = u.b, a = nearestAlly(world, u);
  if (!a) { b.ally = -1; return; }
  const dx = a.x - ex, dy = a.y - ey, d = hypot(dx, dy) || 1;
  b.ally = a.id; b.sx = a.x + (dx / d) * T.behind; b.sy = a.y + (dy / d) * T.behind;
}

const _ep = new Float64Array(2);
function brain(world, u) {
  const b = u.b;
  domeTick(world, u);
  if (begin(world, u)) return;
  const t = targetOf(world, u);
  if (t) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (melee(world, u, t, T.zap, dx, dy, d) !== 0) return;
    if (u.possessed === 1) { setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx); return; }
    b.ex = t.x; b.ey = t.y;
  } else if (u.possessed === 1 || !groupPoint(world, u, null, ROBOT.memory, _ep)) { b.ally = -1; idle(world, u); return; }
  else { b.ex = _ep[0]; b.ey = _ep[1]; }                // no target: the group's fight is the enemy side
  if ((world.tick + u.index) % T.allyEvery === 0 || b.ally < 0) pickSpot(world, u, b.ex, b.ey);
  if (b.ally < 0) { if (t) keepRange(world, u, t, t.x - u.x, t.y - u.y, hypot(t.x - u.x, t.y - u.y) || 0.001, T.alone[0], T.alone[1]); else idle(world, u); return; }
  const sx = b.sx - u.x, sy = b.sy - u.y, s = hypot(sx, sy);
  setState(u, s > 40 ? STATE.ADVANCE : STATE.ENGAGE);
  if (s > T.arrive) moveTo(world, u, b.sx, b.sy, s > 80 ? T.run : Math.min(T.walk, 3 * s), losClear(world, u) || world.lineOfSight(u.x, u.y, b.sx, b.sy));
  u.face = Math.atan2(b.ey - u.y, b.ex - u.x);
  u.pathing = 1;   // the spot is the formation: no pull back to where it was painted
}

const D = robot({
  type: 'shieldbot',
  og: 'Shield Bot (ours)', // no OG original
  radius: 9, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: true,
  strength: 1.2,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 500,
  decel: 500,
  brushSpacing: 26,
  look: { attack: { time: 0.3 } },
  weapon: T.zap,
  dome: T, // readers (tests, art): domeR, domeHp
  init(world, u) {
    initB(u);
    const b = u.b;
    b.dome = 0; b.domeHp = T.domeHp; b.domeHit = -1e9; b.hitAt = -1e9; b.brokenUntil = -1e9; b.seen = -1e9; b.gen = 0;
    b.ally = -1; b.sx = u.x; b.sy = u.y; b.ex = u.x; b.ey = u.y;
    u.cooldown = world.rng() * T.zap.cooldown;
  },
  brain,
  onDeath(world, u) { domeDown(world, u); },
  possessFire(world, u) { emptySwing(world, u, T.zap.cooldown); },
});
export default D;
export { T };
