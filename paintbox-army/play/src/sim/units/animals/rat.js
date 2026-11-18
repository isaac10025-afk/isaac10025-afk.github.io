// Rat: cheap fast swarm biter (OG "Rat", module 511, game.js:11195-11501). Owner: ANIMALS.
// Floods a target, slips between big enemies (underfoot), spreads plague, eats scavenged corpses, gnaws walls.
import { registerUnit } from '../../defs.js';
import {
  S, DT, fac, LOCO, INTEL, hyp, signed, range, setState, getTarget, perchOf, isUndead, ensure, hitAnim, dmg, infect, givePlague,
  sfx, hasWalls, wallAt, goTo, followIntel, flee, roam, gnawWalls, nearestHole, carrion, edible,
} from './lib.js';

const SPREAD = 1.2; // OG game.js:11222 (wander × 1.2 rad around the victim / corpse)
const CHEW_COOLDOWN = 0.35; // OG game.js:11223 (eat and gnaw cooldown base)
const EAT_SPEED = 1.4; // OG game.js:11226 (× walkSpeed toward a corpse)
const PAUSED = 2; // OG game.js:11227 (subState: frozen in place)
const SCAVENGE_RANGE = 250; // OG game.js:11320
const MEAT_HEAL = 1.5; // OG game.js:11351
const INTEL_MEMORY = 5; // OG game.js:11360
const ROAM_CROWD = 7; // OG game.js:11361
const HOLE_RANGE = 60; // OG game.js:11372
const GNAW = 2.2; // OG game.js:11412
const SWARM_RING = 90; // OG game.js:11419
const BITE = 6; // OG game.js:11429
const PLAGUE_BITE = 0.35; // OG game.js:11430
const BITE_COOLDOWN = 0.5; // OG game.js:11434
const hole = new Float32Array(2);

// eat the nearest carrion within 250 px (OG game.js:11316-11357). True if busy with a corpse.
function scavenge(w, u) {
  const list = carrion(w);
  let best = null, bd = SCAVENGE_RANGE;
  for (let k = list.length - 1; k >= 0; k--) {
    const c = list[k];
    if (!edible(c)) { list[k] = list[list.length - 1]; list.pop(); continue; }
    const d = hyp(c.x - u.x, c.y - u.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return false;
  const size = best.size ?? best.r ?? best.radius ?? 0; // corpse radius (CORE-B corpse.r)
  const rim = size + u.radius + 3, dx = best.x - u.x, dy = best.y - u.y; // OG game.js:11332
  if (bd > rim) { // approach a spot on the rim, spread by wander (OG game.js:11334-11341)
    setState(u, S.ADVANCE);
    const a = Math.atan2(-dy, -dx) + u.wander * SPREAD;
    const tx = best.x + Math.cos(a) * (rim - 2) - u.x, ty = best.y + Math.sin(a) * (rim - 2) - u.y, g = hyp(tx, ty) || 0.001;
    u.goalX = tx / g * u.def.walkSpeed * EAT_SPEED; u.goalY = ty / g * u.def.walkSpeed * EAT_SPEED;
    return true;
  }
  setState(u, S.ENGAGE); u.goalX = u.goalY = 0; u.face = Math.atan2(dy, dx); // OG game.js:11343-11346
  if (u.cooldown > 0) return true;
  best.meat -= 1; if (best.meat <= 0) best.eaten = 1; // OG game.js:11349
  u.hp = Math.min(u.maxHp, u.hp + MEAT_HEAL); // OG game.js:11351
  hitAnim(u); u.cooldown = CHEW_COOLDOWN * range(w, 0.8, 1.25);
  if (w.rng() < 0.25) sfx(w, 'strike', best.x, best.y, { v: 0.5, type: u.type });
  return true;
}

// any wall in 8 directions at distance d? (OG game.js:11391-11396)
function boxedIn(w, x, y, d) {
  for (let k = 0; k < 8; k++) if (wallAt(w, x + Math.cos(0.785 * k) * d, y + Math.sin(0.785 * k) * d)) return true;
  return false;
}
// gnaw the wall ahead of the goal (OG game.js:11383-11415)
function gnaw(w, u) {
  const gx = u.goalX, gy = u.goalY, g = hyp(gx, gy);
  if (g === 0) return;
  const reach = u.radius + 3, x = u.x + gx / g * reach, y = u.y + gy / g * reach;
  const stuck = hyp(u.vx, u.vy) < 15 && boxedIn(w, u.x, u.y, reach);
  if (!wallAt(w, x, y) && !stuck) return;
  setState(u, S.ENGAGE); u.goalX = u.goalY = 0; u.face = Math.atan2(gy, gx);
  if (u.cooldown > 0) return;
  gnawWalls(w, x, y, 1.52 * u.radius, GNAW); // OG game.js:11412
  hitAnim(u); u.cooldown = CHEW_COOLDOWN * range(w, 0.8, 1.25);
  if (w.rng() < 0.25) sfx(w, 'dust', x, y, { size: 0.3 });
}

function main(w, u) { // OG game.js:11308-11435
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return; }
  const e = getTarget(w, u);
  if (u.state === S.FLEE) { flee(w, u, e, u.def.runSpeed); return; }
  if (!e) {
    if (scavenge(w, u)) return;
    if (followIntel(w, u, u.def.walkSpeed, INTEL_MEMORY)) return;
    setState(u, S.IDLE); roam(w, u, 0.5 * u.def.walkSpeed, ROAM_CROWD); return; // OG game.js:11361
  }
  const dx = e.x - u.x, dy = e.y - u.y, d = hyp(dx, dy) || 0.001, rr = u.radius + e.radius;
  if (d > rr + 3) { // OG game.js:11367
    if (u.los === 0 && hasWalls(w)) { // wall in the way (OG game.js:11368-11416)
      setState(u, S.CHARGE);
      goTo(w, u, e.x, e.y, u.def.runSpeed, false);
      if (nearestHole(w, u.x, u.y, HOLE_RANGE, hole)) {
        const hx = hole[0] - u.x, hy = hole[1] - u.y, hd = hyp(hx, hy) || 0.001, through = hd < 7;
        const ax = through ? dx : hx, ay = through ? dy : hy, ad = through ? d : hd;
        u.goalX = ax / ad * u.def.runSpeed; u.goalY = ay / ad * u.def.runSpeed; u.pathing = 1;
      }
      if (u.pathing === 0 || hyp(u.vx, u.vy) < 15) gnaw(w, u);
      return;
    }
    setState(u, S.CHARGE);
    let ax = dx, ay = dy;
    if (d < SWARM_RING) { // spread around the victim's rim (OG game.js:11419-11423)
      const a = Math.atan2(-dy, -dx) + u.wander * SPREAD * (1 - d / SWARM_RING);
      ax = e.x + Math.cos(a) * (rr + 1) - u.x; ay = e.y + Math.sin(a) * (rr + 1) - u.y;
    }
    const g = hyp(ax, ay) || 0.001;
    u.goalX = ax / g * u.def.runSpeed; u.goalY = ay / g * u.def.runSpeed;
    return;
  }
  setState(u, S.ENGAGE); u.face = Math.atan2(dy, dx);
  if (u.cooldown > 0) return;
  const h = perchOf(w, e);
  const m = dmg(w, h, BITE + 1.5 * signed(w), u); // OG game.js:11429
  if (h === e && w.rng() < PLAGUE_BITE) givePlague(w, e); // OG game.js:11430
  if (isUndead(u)) infect(w, h, u, 0.3 * m, 0); // OG game.js:11431
  sfx(w, 'strike', u.x, u.y, { type: u.type }); hitAnim(u);
  u.cooldown = BITE_COOLDOWN * range(w, 0.8, 1.25);
}

function pauseHabit(w, u) { // freeze now and then when calm (OG game.js:11437-11447)
  const t = w.time, calm = u.state === S.IDLE && !getTarget(w, u) && !(u.threat > 0);
  if (u.subState === PAUSED) {
    if (t < u.b.timer && calm) { u.goalX = u.goalY = 0; return; }
    u.subState = 0;
  }
  if (calm && w.rng() < 0.3 * DT) { u.subState = PAUSED; u.b.aimX = t; u.b.timer = t + 0.9 * range(w, 0.6, 1.4); }
}

function zigzag(w, u) { // rotate the goal by a small weave (OG game.js:11449-11459)
  const gx = u.goalX, gy = u.goalY;
  if (gx === 0 && gy === 0) return;
  const e = getTarget(w, u);
  const gap = e ? hyp(e.x - u.x, e.y - u.y) - u.radius - e.radius : Infinity;
  const a = 0.3 * Math.min(1, gap / 40) * Math.sin(1.6 * w.time * 2 * Math.PI + 2.4 * u.index);
  const c = Math.cos(a), s = Math.sin(a);
  u.goalX = gx * c - gy * s; u.goalY = gx * s + gy * c;
}

registerUnit({
  type: 'rat',
  og: 'Rat', // OG game.js:11232
  waterPace: 1.15, // OG game.js:11233
  swims: true, // OG game.js:11234
  category: 'animals', // OG game.js:11235
  faction: fac('Rats'), // OG game.js:11236
  radius: 4.6, // OG game.js:11237
  radiusJitter: 0.12, // OG game.js:11238
  mass: 0.3, // OG game.js:11239
  density: 0.3, // OG game.js:11240
  maxHp: 22, // OG game.js:11241
  melee: true, // OG game.js:11242
  strength: 0.25, // OG game.js:11243
  locomotion: LOCO.Holonomic, // OG game.js:11244
  walkSpeed: 60, // OG game.js:11245
  runSpeed: 120, // OG game.js:11246
  maxSpeed: 140, // OG game.js:11247
  accel: 700, // OG game.js:11248
  decel: 700, // OG game.js:11249
  turnRate: 30, // OG game.js:11250
  turnSpeedFalloff: Infinity, // OG game.js:11251
  sightRange: 240, // OG game.js:11252
  alertSightRange: 320, // OG game.js:11253
  stickyTarget: false, // OG game.js:11254
  reactionTime: 0.15, // OG game.js:11255
  huntRange: Infinity, // OG game.js:11256
  minDistance: 0, // OG game.js:11257
  drilled: false, // OG game.js:11258
  intelligence: INTEL.Animal, // OG game.js:11259
  infectable: true, // OG game.js:11260
  turnsWhenKilled: false, // OG game.js:11261
  flammability: 1, // OG game.js:11262
  swarms: true, // OG game.js:11263
  plagueCarrier: true, // OG game.js:11264
  underfoot: true, // OG game.js:11265
  brushSpacing: 11, // OG game.js:11266
  flock: {
    personalSpace: 1.1, // OG game.js:11269
    separation: 30, // OG game.js:11270
    alignment: 0.4, // OG game.js:11271
    cohesion: 0.3, // OG game.js:11272
    formation: 0, // OG game.js:11273
    herd: 0.4, // OG game.js:11274
    herdSpacing: 5, // OG game.js:11275
    idleSpread: 1.8, // OG game.js:11276
    flockByState: [1, 0.6, 0.15, 1, 0.2, 0.5], // OG game.js:11277
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:11278
  },
  morale: {
    baseline: 0.85, // OG game.js:11282
    oddsWeight: 0.08, // OG game.js:11283
    fearWeight: 0.05, // OG game.js:11284
    casualtyWeight: 0.04, // OG game.js:11285
    woundWeight: 0, // OG game.js:9955 (inherited from Soldier morale)
    hitShock: 0.03, // OG game.js:11286
    suppression: 0, // OG game.js:9957 (inherited from Soldier morale)
    canBreak: true, // OG game.js:9958 (inherited from Soldier morale)
    breakAt: 0.15, // OG game.js:11287
    rallyAt: 0.5, // OG game.js:11288
    minFleeTime: 1, // OG game.js:11289
    dropRate: 4, // OG game.js:11290
    recoverRate: 0.5, // OG game.js:11291
    panicFear: 0.3, // OG game.js:11292
    deathFear: 0.4, // OG game.js:11293
  },
  look: {
    attack: {
      time: 0.2, // OG game.js:11301
      kick: 0.8, // OG game.js:11301
    },
  },
  init(w, u) { // OG game.js:11303-11306
    ensure(u);
    u.cooldown = 0.5 * w.rng();
    u.wander = signed(w);
  },
  brain(w, u) { main(w, u); pauseHabit(w, u); zigzag(w, u); },
});
