// crossbow (OURS, Part 2 step 4): one heavy bolt, then a long crank. Range 300. The bolt (projectile `bolt`, 700 px/s)
// hits for 55 and goes on through up to 3 units in a line, x0.75 damage after each. A shield that blocks it, a machine
// or anything heavy (mass 8+) stops it; armour that deflects (giant, dragon...) can glance it off.
// b.act 1 = aiming (loaded, target in range), 2 = cranking (reload).
import { registerUnit } from '../../defs.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { takeCover, sidestep, closeToRange, advanceTo, inRange, pursue } from '../../combat/gun.js';
import { oddsApproach } from '../../combat/melee.js';
import { suppress, spark } from '../../combat/damage.js';
import { raycast, submerged, splatNoise } from '../../combat/env.js';
import { canHit } from '../../factions.js';
import { A, act, damage, push, footBase, footInit, footBrain, hyp, STATE as S, INT, DT } from './_lib.js';

const T = Object.freeze({
  radius: 9,           // STEP4
  maxHp: 90,           // STEP4
  mass: 1,             // STEP4
  walkSpeed: 80,       // STEP4
  runSpeed: 125,       // STEP4
  maxSpeed: 150,
  accel: 640,
  turnRate: 6,
  sight: 340,
  reaction: 0.3,
  brushSpacing: 21,
  strength: 0.7,
  minDistance: 140,    // backs off from anything closer
});
export const BOLT = Object.freeze({
  range: 300,          // STEP4
  projectileSpeed: 700,// STEP4 (field name as the gun weapons, so possess reaches this far)
  damage: 55,          // STEP4
  jitter: 4,           // +-
  pierce: 3,           // STEP4: through up to 3 units ...
  falloff: 0.75,       // ... x0.75 damage after each
  reload: 2.4,         // STEP4 crank
  reloadJit: 0.2,      // + up to 0.2 s
  aim: 0.35,           // s: takes aim before the shot
  aimTolerance: 0.15,  // rad
  spread: 0.035,       // rad tri() x (1 + fear)
  push: 0.8,           // knockback = damage x pass x 0.8
  heavyStun: 0.22,     // stun x pass when damage >= 50 (as a heavy bullet, OG game.js:5188-5189)
  heavyMass: 8,        // this heavy or a machine: the bolt stays in it
  maxZ: 24,            // flies under anything higher (a dragon up)
  noise: 160,          // noise splat radius
  lifeMul: 1.3,        // life = 1.3 x range / speed
  contactMemory: 4,
});

// ---------------------------------------------------------------- the bolt
const HITS = 6, _hit = new Array(HITS), _ht = new Float64Array(HITS);
let _w = null, _p = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _F = 1, _wall = Infinity, _n = 0;
const _probe = { faction: 0, team: -1 };
function hitTest(u) {
  if (!(u.hp > 0) || u.z > BOLT.maxZ || u.id === _p.h0 || u.id === _p.h1 || u.id === _p.h2 || u.id === _p.owner) return;
  _probe.faction = _p.faction; _probe.team = _p.team;
  if (_p.wild !== 1 && !canHit(_probe, u)) return;
  if (submerged(_w, u)) return;
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (t >= _wall) return;
  const qx = ox - _dx * t, qy = oy - _dy * t, d2 = qx * qx + qy * qy, R = u.radius;
  if (d2 >= R * R) { const n = R + 10; if (d2 < n * n) suppress(_w, u); return; }
  if (_n < HITS) { _hit[_n] = u; _ht[_n] = t; _n++; }
}
function stepBolt(world, p, i) {
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT, F = dx * dx + dy * dy || 1e-6, len = Math.sqrt(F);
  p.px = x0; p.py = y0;
  const wall = raycast(world, x0, y0, x0 + dx, y0 + dy);
  _w = world; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F; _wall = wall; _n = 0;
  world.query(x0 + dx / 2, y0 + dy / 2, len / 2 + 46 + 12, hitTest);
  const n = _n; _w = null; _p = null;
  for (let a = 1; a < n; a++) { const h = _hit[a], t = _ht[a]; let b = a - 1; while (b >= 0 && _ht[b] > t) { _hit[b + 1] = _hit[b]; _ht[b + 1] = _ht[b]; b--; } _hit[b + 1] = h; _ht[b + 1] = t; }
  const own = p.owner >= 0 ? world.unitById(p.owner) : null, ux = dx / len, uy = dy / len;
  for (let k = 0; k < n; k++) {
    const h = _hit[k]; _hit[k] = null;
    if (!(h.hp > 0)) continue;
    // deflecting armour: a glancing bolt skips off (OG ricochet idea, game.js:2917-2951)
    if (h.def.deflects) {
      const ox = h.x - x0, oy = h.y - y0, along = ox * ux + oy * uy, off = Math.sqrt(Math.max(0, ox * ox + oy * oy - along * along)) / h.radius;
      const g = Math.min(1, Math.max(0, (off - 0.35) / 0.5));
      if (g > 0 && world.rng() < g) {
        let nx = -ox, ny = -oy; const nd = hyp(nx, ny) || 1; nx /= nd; ny /= nd;
        const vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= 2 * vn * nx; p.vy -= 2 * vn * ny; }
        p.vx *= 0.6; p.vy *= 0.6; p.damage *= 0.5; p.wild = 1; p.h0 = h.id;
        damage(world, h, p.damage * 0.2, own, 'blow', x0, y0);
        spark(world, h.x - nx * h.radius, h.y - ny * h.radius, Math.atan2(p.vy, p.vx));
        world.emit('ricochet', { x: h.x, y: h.y, v: 1, type: h.type });
        p.x = x0 + dx * _ht[k]; p.y = y0 + dy * _ht[k];
        for (let j = k + 1; j < n; j++) _hit[j] = null;
        return;
      }
    }
    const dmg = p.damage, pass = damage(world, h, dmg, own, 'blow', x0 - ux * 40, y0 - uy * 40);
    if (h.hp > 0 || pass > 0) push(world, h, ux, uy, dmg * pass * BOLT.push, dmg >= 50 ? BOLT.heavyStun * pass : 0);
    world.emit(pass < 0.5 ? 'block' : 'arrowhit', { x: h.x, y: h.y, v: Math.min(1.5, dmg / 40), type: h.type });
    if (world.stats) world.stats.hits = (world.stats.hits || 0) + 1;
    p.pen--;
    if (pass < 0.5 || h.def.machine || h.mass >= BOLT.heavyMass || p.pen <= 0) {   // stays in the shield / machine / last body
      for (let j = k + 1; j < n; j++) _hit[j] = null;
      removeProjectile(world, i); return;
    }
    p.damage *= BOLT.falloff;
    p.h2 = p.h1; p.h1 = p.h0; p.h0 = h.id;
  }
  if (wall <= 1) {
    const wx = x0 + dx * wall, wy = y0 + dy * wall;
    world.emit('arrowhit', { x: wx, y: wy, v: 0.6 });
    spark(world, wx, wy, Math.atan2(-dy, -dx), 0.6);
    removeProjectile(world, i); return;
  }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > world.W || p.y > world.H) {
    world.emit('arrowhit', { x: p.x, y: p.y, v: 0.4 });
    removeProjectile(world, i);
  }
}
registerProjectileKind('bolt', stepBolt);

/** Shoot a bolt along `ang` (crossbow). Returns the projectile or null. */
function loose(world, u, ang) {
  const r = u.radius, c = Math.cos(ang), s = Math.sin(ang), sp = BOLT.projectileSpeed;
  const p = spawnProjectile(world, 'bolt', u.x + c * r * 1.4, u.y + s * r * 1.4, c * sp, s * sp, (BOLT.lifeMul * BOLT.range) / sp,
    BOLT.damage + BOLT.jitter * (2 * world.rng() - 1), u.faction, u);
  if (!p) return null;
  p.pen = BOLT.pierce; p.h0 = -1; p.h1 = -1; p.h2 = -1; p.trail = 0;
  world.emit('bow', { x: u.x, y: u.y, v: 1.2, type: u.type });
  splatNoise(world, u.x, u.y, 0.3, BOLT.noise);
  u.firedAt = world.time;
  A.setAttack(u);
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1;
  const b = u.b;
  b.reload = BOLT.reload + BOLT.reloadJit * world.rng(); b.aimAt = -1;
  act(world, u, 2);
  return p;
}

function brain(world, u) {
  const b = u.b;
  if (b.reload > 0) { b.reload -= DT; if (b.reload < 0) b.reload = 0; }
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  const idleAct = b.reload > 0 ? 2 : 0;
  if (u.stun > 0) { u.face = u.heading; b.aimAt = -1; act(world, u, idleAct); return; }
  const t = A.targetOf(world, u);
  if (u.state === S.FLEE) { u.cover = -1; b.aimAt = -1; act(world, u, idleAct); A.flee(world, u, t, D.runSpeed); return; }
  if (!t) {
    b.aimAt = -1; act(world, u, idleAct); u.cover = -1;
    if (pursue(world, u, D.walkSpeed, BOLT.contactMemory)) return;
    A.setState(u, S.IDLE); return;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  const clear = u.los === 1 || u.los === true || world.walls.count === 0;
  if (!clear || !inRange(u, d, BOLT.range)) {
    b.aimAt = -1; act(world, u, idleAct);
    if (clear && takeCover(world, u, t, d, BOLT.range, D)) { A.setState(u, S.ADVANCE); u.face = Math.atan2(dy, dx); return; }
    u.cover = -1;
    advanceTo(world, u, t, dx, dy, clear, D.walkSpeed); return;
  }
  A.setState(u, S.ENGAGE);
  const lead = d / BOLT.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
  u.face = aim;
  if (!takeCover(world, u, t, d, BOLT.range, D)) {
    sidestep(world, u, t, dx, dy, d, D);
    if (b.reload > 0) { closeToRange(u, dx, dy, d, BOLT.range, D); oddsApproach(world, u, t, dx, dy, d, D); }
  }
  if (b.reload > 0) { act(world, u, 2); b.aimAt = -1; return; }
  if (b.aimAt < 0) b.aimAt = world.time;
  act(world, u, 1);
  if (world.time - b.aimAt < BOLT.aim || Math.abs(A.angDiff(u.heading, aim)) > BOLT.aimTolerance) return;
  loose(world, u, aim + A.tri(world) * BOLT.spread * (1 + (1 - u.morale)));
}

const D = registerUnit({
  ...footBase(),
  type: 'crossbow', og: 'Crossbow (ours)',
  radius: T.radius, mass: T.mass, maxHp: T.maxHp, melee: false, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.runSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  sightRange: T.sight, alertSightRange: T.sight, stickyTarget: false, reactionTime: T.reaction, minDistance: T.minDistance,
  drilled: false, intelligence: INT.Trained, brushSpacing: T.brushSpacing,
  look: { hat: true, attack: { time: 0.3 } },
  weapon: BOLT,
  init(world, u) { footInit(u); const b = u.b; b.reload = world.rng() * 0.8; b.aimAt = -1; },
  brain: footBrain(brain),
  // Possessed, attack held with nobody in the aim: loose along the aim at once if wound.
  possessFire(world, u, aim) { if (!(u.b.reload > 0) && !(u.stun > 0)) loose(world, u, aim); },
});
