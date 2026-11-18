// ballista (OURS, Part 2 step 4): crew of 2, range 520, needs a clear line. The big bolt (projectile `bigbolt`, 900 px/s)
// goes through up to 5 units, 70 each, and takes them with it: everyone it went through rides the shaft (the dead too)
// and is pinned where it stops (a wall, the end of its flight, something too heavy to carry: mass 4+ or a machine, or a
// blocking shield). The living stay stuck 2.5 s; the dead stay skewered there (TABS kebab). Reload 5 s.
// b.act 1 = aim, 2 = fire. Possessed: shoots along the aim.
import { registerUnit } from '../../defs.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';
import { raycast, submerged } from '../../combat/env.js';
import { spark } from '../../combat/damage.js';
import { canHit } from '../../factions.js';
import {
  A, act, damage, hyp, machineBase, machineInit, crewFactor, freeCrew, crewScaledStick, objective, addPin, playerFiring,
  STATE as S, DT,
} from './_lib.js';

const T = Object.freeze({
  radius: 13,          // STEP4
  maxHp: 350,          // STEP4
  mass: 7,             // STEP4
  walkSpeed: 22,       // STEP4 with a full crew
  possessSpeed: 40,
  maxSpeed: 44,
  accel: 70,
  turnRate: 1.6,
  sight: 560,
  brushSpacing: 48,
  strength: 2,
  crew: 2,             // STEP4
  slots: [[-1.7, 0.7], [-1.7, -0.7]],
});
export const SHOT = Object.freeze({
  range: 520,          // STEP4
  projectileSpeed: 900,// STEP4
  damage: 70,          // STEP4: 70 to each
  pierce: 5,           // STEP4: through up to 5
  reload: 5,           // STEP4
  aim: 0.5,            // s laying it (`aim`)
  aimTolerance: 0.12,  // rad
  firePose: 0.3,       // s of `fire`
  spread: 0.02,        // rad
  lifeMul: 1.3,        // flies 1.3 x range at most
});
export const KEBAB = Object.freeze({
  dragMass: 4,         // lighter than this rides the shaft; heavier (or a machine, a prop, a blocking shield) stops it
  slowPerBody: 0.9,    // x0.9 speed per body on the shaft
  minSpeed: 250,       // px/s: slower than this it drops and pins
  pin: 2.5,            // STEP4: the living stay stuck 2.5 s
  gap: 2,              // px between bodies on the shaft
  maxZ: 24,            // flies under anything higher
  stuck: 6,            // s the bolt stays drawn where it stopped
  max: 6,              // slots on the shaft (5 + the one that stops it)
});

// ---------------------------------------------------------------- the big bolt
// Per projectile (pooled objects, arrays made once per object): skN bodies on the shaft. Slot k: skId (unit id, -1 once
// it is a corpse), skType, skR (radius), skX / skY (last place), skC (its corpse).
function shaft(p) {
  if (!p.skId) { const n = KEBAB.max; p.skId = new Int32Array(n); p.skType = new Array(n); p.skR = new Float32Array(n); p.skX = new Float32Array(n); p.skY = new Float32Array(n); p.skC = new Array(n); }
  p.skN = 0; p.stuck = 0;
  for (let k = 0; k < KEBAB.max; k++) { p.skId[k] = -1; p.skType[k] = null; p.skC[k] = null; }
}
function onShaft(p, id) { for (let k = 0; k < p.skN; k++) if (p.skId[k] === id) return true; return false; }
// A unit on the shaft died (lifecycle freed it): find its fresh corpse and keep carrying that.
function grabCorpse(world, p, k) {
  const L = world.corpses; if (!L) return;
  let best = null, bd = 30 * 30;
  const id = p.skId[k];
  for (let j = L.length - 1; j >= 0; j--) {                  // LEAD 11-14: bodies carry their unit's id now (death.js c.uid)
    const c = L[j];
    if (c && !c.removed && c.uid === id && id >= 0) { best = c; break; }
  }
  if (!best) for (let j = 0; j < L.length; j++) {
    const c = L[j];
    if (!c || c.removed || c.type !== p.skType[k] || world.time - c.t > 4 * DT + 1e-9) continue;
    let mine = false; for (let q = 0; q < p.skN; q++) if (p.skC[q] === c) mine = true;
    if (mine) continue;
    const d = (c.x - p.skX[k]) ** 2 + (c.y - p.skY[k]) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  p.skId[k] = -1;
  if (!best) return;
  const F = world.flyingBodies; if (F) { const j = F.indexOf(best); if (j >= 0) F.splice(j, 1); }
  best.fly = 1; best.vx = 0; best.vy = 0; best.vz = 0; best.z = 0; best.landT = -1;
  p.skC[k] = best;
}
// Lay the bodies along the shaft behind the tip (the last one hit nearest the tip).
function carry(world, p, ux, uy, stuck) {
  let off = 0;
  for (let k = p.skN - 1; k >= 0; k--) {
    off += (k === p.skN - 1 ? 0 : p.skR[k + 1] + KEBAB.gap) + p.skR[k];
    const x = Math.min(world.W - 1, Math.max(1, p.x - ux * off)), y = Math.min(world.H - 1, Math.max(1, p.y - uy * off));
    p.skX[k] = x; p.skY[k] = y;
    const id = p.skId[k];
    if (id >= 0) {
      const u = world.unitById(id);
      if (u) {
        u.x = x; u.y = y; u.vx = 0; u.vy = 0;           // no speed of its own: a 900 px/s body would domino its neighbours
        if (u.stun < 0.25) u.stun = 0.25;
        if (stuck && u.hp > 0) addPin(world, u, x, y, KEBAB.pin);
      }
    } else if (p.skC[k]) { const c = p.skC[k]; c.x = x; c.y = y; if (stuck) { c.fly = 0; p.skC[k] = null; } }
  }
}
function stop(world, p, ux, uy) {
  p.stuck = 1; p.life = KEBAB.stuck;
  carry(world, p, ux, uy, true);
  p.vx = ux * 1e-3; p.vy = uy * 1e-3;
  world.emit('arrowhit', { x: p.x, y: p.y, v: 1.5, kebab: p.skN });
}

const HITS = 8, _hit = new Array(HITS), _ht = new Float64Array(HITS);
let _p = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _F = 1, _wall = Infinity, _n = 0, _w = null;
const _probe = { faction: 0, team: -1 };
function hitTest(u) {
  if (!(u.hp > 0) || u.z > KEBAB.maxZ || u.climb > 0 || u.id === _p.owner || onShaft(_p, u.id)) return;
  _probe.faction = _p.faction; _probe.team = _p.team;
  if (!canHit(_probe, u) || submerged(_w, u)) return;
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (t >= _wall) return;
  const qx = ox - _dx * t, qy = oy - _dy * t;
  if (qx * qx + qy * qy >= u.radius * u.radius) return;
  if (_n < HITS) { _hit[_n] = u; _ht[_n] = t; _n++; }
}
function stepBig(world, p, i) {
  const sp = hyp(p.vx, p.vy) || 1e-6, ux = p.vx / sp, uy = p.vy / sp;
  for (let k = 0; k < p.skN; k++) if (p.skId[k] >= 0 && !world.unitById(p.skId[k])) grabCorpse(world, p, k);
  if (p.stuck === 1) {                                     // lying where it stopped: late corpses go where their body was pinned
    p.px = p.x; p.py = p.y;
    for (let k = 0; k < p.skN; k++) if (p.skC[k]) { const c = p.skC[k]; c.x = p.skX[k]; c.y = p.skY[k]; c.fly = 0; p.skC[k] = null; }
    p.life -= DT; if (p.life <= 0) removeProjectile(world, i);
    return;
  }
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT, F = dx * dx + dy * dy || 1e-6, len = Math.sqrt(F);
  p.px = x0; p.py = y0;
  const wall = raycast(world, x0, y0, x0 + dx, y0 + dy);
  _w = world; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F; _wall = wall; _n = 0;
  world.query(x0 + dx / 2, y0 + dy / 2, len / 2 + 46 + 4, hitTest);
  const n = _n; _p = null; _w = null;
  for (let a = 1; a < n; a++) { const h = _hit[a], t = _ht[a]; let b = a - 1; while (b >= 0 && _ht[b] > t) { _hit[b + 1] = _hit[b]; _ht[b + 1] = _ht[b]; b--; } _hit[b + 1] = h; _ht[b + 1] = t; }
  const own = p.owner >= 0 ? world.unitById(p.owner) : null;
  for (let k = 0; k < n; k++) {
    const h = _hit[k], t = _ht[k]; _hit[k] = null;
    if (!(h.hp > 0)) continue;
    const pass = damage(world, h, p.damage, own, 'blow', x0 - ux * 40, y0 - uy * 40);
    world.emit(pass < 0.5 ? 'block' : 'bullethit', { x: h.x, y: h.y, v: 1.5, type: h.type });
    if (world.stats) world.stats.hits = (world.stats.hits || 0) + 1;
    const heavy = h.def.machine === true || h.def.prop === true || h.def.untossable === true || h.mass >= KEBAB.dragMass || pass < 0.5;
    if (heavy) {                                           // stops in it: pinned where it stands
      for (let j = k + 1; j < n; j++) _hit[j] = null;
      p.x = h.x - ux * h.radius * 0.5; p.y = h.y - uy * h.radius * 0.5;
      if (h.hp > 0) addPin(world, h, h.x, h.y, KEBAB.pin);
      spark(world, p.x, p.y, Math.atan2(-uy, -ux), 0.8);
      stop(world, p, ux, uy); return;
    }
    const s = p.skN++;
    p.skId[s] = h.id; p.skType[s] = h.type; p.skR[s] = h.radius; p.skC[s] = null;
    p.vx *= KEBAB.slowPerBody; p.vy *= KEBAB.slowPerBody;
    p.pen--;
    if (p.pen <= 0 || p.skN >= KEBAB.max) {               // 5 through: it stops in the last one
      for (let j = k + 1; j < n; j++) _hit[j] = null;
      p.x = x0 + dx * t; p.y = y0 + dy * t;
      stop(world, p, ux, uy); return;
    }
  }
  if (wall <= 1) {                                         // into a wall: the kebab is pinned against it
    p.x = x0 + dx * wall - ux * 2; p.y = y0 + dy * wall - uy * 2;
    spark(world, p.x, p.y, Math.atan2(-uy, -ux), 0.9);
    world.emit('ricochet', { x: p.x, y: p.y, v: 0.8 });
    stop(world, p, ux, uy); return;
  }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || hyp(p.vx, p.vy) < KEBAB.minSpeed || p.x < 0 || p.y < 0 || p.x > world.W || p.y > world.H) {
    p.x = Math.min(world.W, Math.max(0, p.x)); p.y = Math.min(world.H, Math.max(0, p.y));
    stop(world, p, ux, uy); return;
  }
  carry(world, p, ux, uy, false);
}
registerProjectileKind('bigbolt', stepBig);

function fire(world, u, ang) {
  const b = u.b, c = Math.cos(ang), s = Math.sin(ang), sp = SHOT.projectileSpeed;
  const p = spawnProjectile(world, 'bigbolt', u.x + c * u.radius * 1.2, u.y + s * u.radius * 1.2, c * sp, s * sp, (SHOT.lifeMul * SHOT.range) / sp, SHOT.damage, u.faction, u);
  if (!p) return null;
  shaft(p); p.pen = SHOT.pierce;
  b.reload = SHOT.reload; b.fireAt = world.time; b.aimAt = -1;
  act(world, u, 2); A.setAttack(u);
  world.emit('bow', { x: u.x, y: u.y, v: 2.5, type: u.type });   // until a ballista twang exists (Sound asks)
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1;
  return p;
}

const _pt = new Float32Array(2);
function brain(world, u) {
  const b = u.b, k = crewFactor(world, u);
  if (b.reload > 0 && k > 0) { b.reload -= DT * k; if (b.reload < 0) b.reload = 0; }
  const posing = world.time - b.fireAt < SHOT.firePose;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { act(world, u, posing ? 2 : 0); return; }
  if (u.possessed === 1 && !playerFiring(world, u)) { act(world, u, posing ? 2 : 0); A.setState(u, S.IDLE); b.aimAt = -1; return; }
  const t = objective(world, u, 6, _pt);
  const speed = (u.possessed === 1 ? D.possessSpeed : D.walkSpeed) * k;
  if (!t) {
    act(world, u, posing ? 2 : 0); b.aimAt = -1;
    if (_pt[0] === _pt[0]) { A.setState(u, S.ADVANCE); A.pathTo(world, u, _pt[0], _pt[1], speed, false); } else A.setState(u, S.IDLE);
    return;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001, clear = u.los === 1 || world.walls.count === 0;
  if (!clear || d > SHOT.range) { act(world, u, posing ? 2 : 0); b.aimAt = -1; A.setState(u, S.ADVANCE); A.pathTo(world, u, t.x, t.y, speed, clear); return; }
  A.setState(u, S.ENGAGE); A.markEngaged(world, u.group);
  const lead = d / SHOT.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
  u.face = aim;
  if (b.reload > 0 || k === 0) { act(world, u, posing ? 2 : 0); b.aimAt = -1; return; }
  if (b.aimAt < 0) b.aimAt = world.time;
  act(world, u, posing ? 2 : 1);
  if (world.time - b.aimAt >= SHOT.aim && Math.abs(A.angDiff(u.heading, aim)) <= SHOT.aimTolerance) fire(world, u, aim + A.tri(world) * SHOT.spread);
}

const D = registerUnit({
  ...machineBase(),
  type: 'ballista', og: 'Ballista (ours)',
  radius: T.radius, radiusJitter: 0, mass: T.mass, maxHp: T.maxHp, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.walkSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  possessSpeed: T.possessSpeed, sightRange: T.sight, alertSightRange: T.sight, brushSpacing: T.brushSpacing,
  crew: { n: T.crew, slots: T.slots },
  weapon: { range: SHOT.range, shot: SHOT, kebab: KEBAB },
  init(world, u) { machineInit(world, u); const b = u.b; b.reload = 1 + world.rng(); b.fireAt = -9; b.aimAt = -1; },
  brain,
  possessFire(world, u, aim) { if (!(u.b.reload > 0) && !(u.stun > 0) && crewFactor(world, u) > 0) fire(world, u, aim); },
  possessMove(world, u, mx, my) { crewScaledStick(world, u, mx, my); },
  onDeath(world, u) { freeCrew(world, u); },
});
