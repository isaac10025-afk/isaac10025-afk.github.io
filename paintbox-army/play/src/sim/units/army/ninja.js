// ninja (OG "Ninja", type 50): fragile, fast assassin. Hunts ranged units first (assassin targeting is CORE-A
// perception), throws 3-shuriken fans from 115-190 px, dashes through targets within 115 px slashing up to 2 enemies
// on the way, and drops a smoke bomb to escape once badly hurt. OG module 624, game.js:18225-18494.
import { registerUnit } from '../../defs.js';
import { fireProjectile } from '../../combat/index.js';
import { isHostile } from '../../factions.js';
import {
  S, FACTION, LOCO, INTEL, SOLDIER_FLOCK, SOLDIER_MORALE, setState, targetOf, hasLos, flee, advance, followContact,
  circle, strike, perchOf, damage, push, blockFx, setAttack, angDiff, hyp, emit, signed, tri, wallRaycast, solidAt,
  anyWalls,
} from './_shared.js';

// Constants `A, S, M, E` (OG game.js:18249-18252) and inline numbers.
const KATANA = Object.freeze({
  damage: 16, // 16 + 3·signed() (OG game.js:18487)
  damageJitter: 3, // OG game.js:18487
  push: 55, // 55·m (OG game.js:18488)
  stun: 0.1, // 0.1·m (OG game.js:18488)
  cooldown: 0.65, // 0.65 + 0.2·next() (OG game.js:18249 A = 0.65, 18491)
  cooldownJitter: 0.2, // OG game.js:18491
  facing: 0.7, // OG game.js:18483
  reachGap: 7, // reach r + r + 7 (OG game.js:18403)
  circle: 1.5, // circling ×1.5 with back-step (OG game.js:18482)
});
const DASH = Object.freeze({
  time: 0.18, // dash lasts 0.18 s (OG game.js:18251 M = 0.18)
  hitAt: 0.5, // slash at half the dash (OG game.js:18307)
  maxHits: 2, // up to 2 enemies on the line (OG game.js:18322)
  lineGap: 6, // within r_enemy + 0.5·r_ninja + 6 of the line (OG game.js:18328)
  lineHalf: 0.5, // OG game.js:18328
  queryPad: 30, // query mid-point within len/2 + 30 (OG game.js:18320)
  damage: 16, // no jitter (OG game.js:18331)
  push: 70, // 70·m: 0.6 sideways + 0.4 forward (OG game.js:18338)
  side: 0.6, // OG game.js:18336
  forward: 0.4, // OG game.js:18336
  stun: 0.25, // 0.25·m (OG game.js:18339)
  endDamp: 0.2, // velocity ×0.2 when the dash ends (OG game.js:18350)
  reach: 115, // dash when target gap >= 18 and d <= 115 (OG game.js:18407)
  minGap: 18, // OG game.js:18408
  overshoot: 26, // destination d + r_t + r_n + 26 past the start (OG game.js:18411)
  next: 6, // next dash in 6 + signed() s (OG game.js:18428)
  nextJitter: 1, // OG game.js:18428
  initDelay: 1, // first dash after next()·1 s (OG game.js:18297)
});
const FAN = Object.freeze({
  count: 3, // OG game.js:18447
  spacing: 0.12, // −0.12 / 0 / +0.12 rad (OG game.js:18448)
  jitter: 0.04, // + 0.04·tri() (OG game.js:18448)
  speed: 520, // OG game.js:18250 (S = 520)
  range: 228, // life 228/520 s (OG game.js:18446)
  damage: 6, // OG game.js:18458
  pen: 0, // always stops at the first body (OG game.js:18466)
  minD: 115, // fan when 115 < d <= 190 (OG game.js:18437)
  maxD: 190, // OG game.js:18438
  next: 1.8, // next fan in 1.8 + 0.4·signed() s (OG game.js:18472)
  nextJitter: 0.4, // OG game.js:18472
  initDelay: 0.4, // first fan after 0.4·next() s (OG game.js:18298)
  chargeUnder: 172.5, // state Charge under 172.5 px (then the advance helper sets Advance) (OG game.js:18474)
});
const SMOKE = Object.freeze({
  hpFrac: 0.4, // once per life when hp <= 40% ... (OG game.js:18368)
  near: 140, // ... and the target is under 140 px (OG game.js:18370)
  radius: 48, // steam cloud radius 48 ... (OG game.js:18373)
  life: 3.5, // ... for 3.5 s (OG game.js:18373)
  run: 1.6, // runs away at runSpeed for 1.6 s (OG game.js:18380)
  puffs: 6, // smoke puffs (looks) (OG game.js:18375)
});
const FLAG_SMOKED = 1, FLAG_SLASHED = 2, FLAG_THREW = 4; // subState bits (OG game.js:18252 E = 4, 18306, 18375)

// Dash slash at the half-way point (OG game.js:18311-18347).
function dashSlash(world, u) {
  const b = u.b, x0 = b.dashX, y0 = b.dashY, x1 = x0 + u.vx * DASH.time, y1 = y0 + u.vy * DASH.time;
  const lx = x1 - x0, ly = y1 - y0, l2 = lx * lx + ly * ly || 1e-6, len = Math.sqrt(l2);
  let hits = 0;
  world.query((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + DASH.queryPad, (c) => {
    if (hits >= DASH.maxHits) return true;
    if (!(c.hp > 0) || c.z > 0 || !isHostile(u, c)) return;
    const s = Math.max(0, Math.min(1, ((c.x - x0) * lx + (c.y - y0) * ly) / l2));
    const ox = c.x - x0 - lx * s, oy = c.y - y0 - ly * s, lim = c.radius + DASH.lineHalf * u.radius + DASH.lineGap;
    if (ox * ox + oy * oy > lim * lim) return;
    const v = perchOf(world, c), m = damage(world, v, DASH.damage, u, 'blow');
    const side = ox * ly - oy * lx >= 0 ? 1 : -1;
    push(world, v, (-ly / len) * side * DASH.side + (lx / len) * DASH.forward, (lx / len) * side * DASH.side + (ly / len) * DASH.forward, DASH.push * m, DASH.stun * m);
    blockFx(world, u, c, m);
    if (m >= 1) emit(world, 'strike', { x: v.x, y: v.y, v: 1.2, type: u.type });
    emit(world, 'slash', { x: c.x, y: c.y, ang: Math.atan2(ly, lx), v: 0.6 });
    hits++;
  });
  b.flags &= ~FLAG_THREW; setAttack(u); u.cooldown = Math.max(u.cooldown, KATANA.cooldown); // OG game.js:18345-18346
}
// Start a dash through the target (OG game.js:18404-18431). Returns false if a wall is in the way.
function startDash(world, u, t, nx, ny, d) {
  const c = d + t.radius + u.radius + DASH.overshoot, r = u.radius;
  const hx = Math.min(world.W - r, Math.max(r, u.x + nx * c)), hy = Math.min(world.H - r, Math.max(r, u.y + ny * c));
  if (anyWalls(world) && (wallRaycast(world, u.x, u.y, hx, hy) <= 1 || solidAt(world, hx, hy))) return false;
  u.vx = (hx - u.x) / DASH.time; u.vy = (hy - u.y) / DASH.time;
  u.heading = u.pheading = Math.atan2(ny, nx); u.face = u.heading;
  u.leaping = 1; u.b.dashT = world.time; u.b.flags &= ~(FLAG_SLASHED | FLAG_THREW);
  setState(u, S.CHARGE);
  u.b.dashX = u.x; u.b.dashY = u.y;
  emit(world, 'dust', { x: u.x, y: u.y, ang: u.heading + Math.PI, v: 0.7, type: u.type });
  u.b.dashAt = world.time + DASH.next + DASH.nextJitter * signed(world); // OG game.js:18428
  return true;
}
function throwFan(world, u, t, dx, dy, d) { // OG game.js:18437-18473
  const lead = d / FAN.speed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead), r = u.radius, life = FAN.range / FAN.speed;
  for (let k = 0; k < FAN.count; k++) {
    const a = aim + FAN.spacing * (k - 1) + FAN.jitter * tri(world), c = Math.cos(a), s = Math.sin(a);
    const x = u.x + c * r, y = u.y + s * r;
    const p = fireProjectile(world, 'shuriken', u, x + c * FAN.range, y + s * FAN.range, { x, y, vx: c * FAN.speed, vy: s * FAN.speed, life, damage: FAN.damage, pen: FAN.pen });
    if (!p) break;
    if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1;
  }
  emit(world, 'throw', { x: u.x, y: u.y, v: 0.6, type: u.type }); // OG game.js:18468
  u.face = aim; u.b.flags |= FLAG_THREW; setAttack(u);
  u.b.fanAt = world.time + FAN.next + FAN.nextJitter * signed(world); // OG game.js:18472
}
function smokeBomb(world, u) { // OG game.js:18372-18391
  const b = u.b;
  b.flags |= FLAG_SMOKED; b.smokeAt = world.time;
  if (world.steam && typeof world.steam.add === 'function') world.steam.add(u.x, u.y, SMOKE.radius, SMOKE.life, world.time);
  for (let k = 0; k < SMOKE.puffs; k++) {
    const a = (k / SMOKE.puffs) * Math.PI * 2 + 0.4 * signed(world);
    emit(world, 'smoke', { x: u.x + 10 * Math.cos(a), y: u.y + 8 * Math.sin(a), ang: a, v: 1.4 });
  }
  emit(world, 'steam', { x: u.x, y: u.y, v: 1.4, type: u.type });
  u.target = -1;
}

const D = registerUnit({
  type: 'ninja',
  og: 'Ninja', // OG game.js:18256
  key: 'ninja', // OG game.js:18255
  category: 'army',
  faction: FACTION.Ninjas, // OG game.js:18257
  radius: 8.2, // OG game.js:18258
  radiusJitter: 0.05, // OG game.js:18259
  mass: 0.85, // OG game.js:18260
  maxHp: 55, // OG game.js:18261
  melee: true, // OG game.js:18262
  strength: 0.8, // OG game.js:18263
  locomotion: LOCO.Holonomic, // OG game.js:18264
  walkSpeed: 110, // OG game.js:18265
  runSpeed: 195, // OG game.js:18266
  maxSpeed: 230, // OG game.js:18267
  accel: 1200, // OG game.js:18268
  decel: 1200, // OG game.js:18269
  turnRate: 12, // OG game.js:18270
  turnSpeedFalloff: Infinity, // OG game.js:18271
  sightRange: 380, // OG game.js:18272
  alertSightRange: 420, // OG game.js:18273
  stickyTarget: false, // OG game.js:18274
  reactionTime: 0.15, // OG game.js:18275
  huntRange: Infinity, // OG game.js:18276
  minDistance: 0, // OG game.js:18277
  drilled: false, // OG game.js:18278
  intelligence: INTEL.Trained, // OG game.js:18279
  infectable: true, // OG game.js:18280
  flammability: 0.35, // OG game.js:18281
  assassin: true, // OG game.js:18282
  brushSpacing: 21, // OG game.js:18283
  flock: Object.freeze({ ...SOLDIER_FLOCK, // OG game.js:18284 (Soldier flock with overrides)
    formation: 0, // OG game.js:18284
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:18284
  }),
  morale: Object.freeze({ ...SOLDIER_MORALE, // OG game.js:18285 (Soldier morale with overrides)
    oddsWeight: 0.3, // OG game.js:18285
    breakAt: 0.12, // OG game.js:18285
  }),
  look: {
    attack: { time: 0.26 }, // OG game.js:18292
  },
  weapon: KATANA, // ours: katana; dash / fan / smoke numbers below
  weaponDash: DASH,
  weaponFan: FAN,
  init(world, u) { // OG game.js:18294-18301
    const b = u.b;
    u.cooldown = world.rng() * KATANA.cooldown;
    b.dashAt = world.time + DASH.initDelay * world.rng();
    b.fanAt = world.time + FAN.initDelay * world.rng();
    b.smokeAt = -Infinity; b.flags = 0; b.dashT = 0; b.dashX = u.x; b.dashY = u.y; b.carryTick = -1;
  },
  // Runs every tick before the brain, even while stunned / reacting (OG game.js:5012, 18302-18354).
  carry(world, u) {
    const b = u.b;
    b.carryTick = world.tick;
    if (u.leaping !== 1) return;
    const e = world.time - b.dashT;
    if (!(b.flags & FLAG_SLASHED) && e >= DASH.hitAt * DASH.time) { b.flags |= FLAG_SLASHED; dashSlash(world, u); } // OG game.js:18306-18308
    if (e < DASH.time) return;
    u.leaping = 0; u.vx *= DASH.endDamp; u.vy *= DASH.endDamp; u.goalX = u.goalY = 0; // OG game.js:18348-18352
    emit(world, 'dust', { x: u.x, y: u.y, ang: u.heading, v: 0.6, type: u.type });
  },
  brain(world, u) { // OG game.js:18355-18493
    const b = u.b;
    if (b.carryTick !== world.tick) D.carry(world, u); // in case the brain system has no carry hook yet
    if (u.leaping === 1) return; // mid-dash: brain skipped (OG game.js:18357-18361)
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.face = u.heading; return; }
    const t = targetOf(world, u), now = world.time;
    if (!(b.flags & FLAG_SMOKED) && u.hp <= SMOKE.hpFrac * u.maxHp && t && hyp(t.x - u.x, t.y - u.y) < SMOKE.near) smokeBomb(world, u); // OG game.js:18366-18369
    if (now - b.smokeAt < SMOKE.run) { // run from the threat (or the old target) for 1.6 s (OG game.js:18392-18402)
      setState(u, S.ADVANCE);
      let ax = -(u.threatX || 0), ay = -(u.threatY || 0);
      if (t && ax * ax + ay * ay < 1e-6) { ax = u.x - t.x; ay = u.y - t.y; }
      const r = hyp(ax, ay);
      if (r < 1e-6) return;
      u.goalX = (ax / r) * D.runSpeed; u.goalY = (ay / r) * D.runSpeed;
      return;
    }
    if (u.state === S.FLEE) { flee(world, u, t, D.runSpeed); return; }
    if (!t) { if (followContact(world, u, D.walkSpeed, 4)) return; setState(u, S.IDLE); return; } // OG game.js:18396-18399
    const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001, k = u.radius + t.radius, clear = hasLos(world, u);
    if (d > k + KATANA.reachGap) { // out of reach: dash, else fan, then run in (OG game.js:18403-18475)
      if (clear && now >= b.dashAt && d <= DASH.reach && d - k >= DASH.minGap && startDash(world, u, t, dx / d, dy / d, d)) return;
      if (clear && now >= b.fanAt && d > FAN.minD && d <= FAN.maxD) throwFan(world, u, t, dx, dy, d);
      setState(u, d < FAN.chargeUnder ? S.CHARGE : S.ADVANCE);
      advance(world, u, t, dx, dy, clear, D.runSpeed);
      return;
    }
    setState(u, S.ENGAGE);
    const a = Math.atan2(dy, dx);
    u.face = a;
    circle(u, t, dx, dy, d, D, KATANA.circle, true); // OG game.js:18482
    if (u.cooldown > 0 || Math.abs(angDiff(u.heading, a)) > KATANA.facing) return; // OG game.js:18483-18484
    strike(world, u, t, dx / d, dy / d, KATANA.damage + KATANA.damageJitter * signed(world), KATANA.push, KATANA.stun); // OG game.js:18485-18489
    b.flags &= ~FLAG_THREW; setAttack(u); u.cooldown = KATANA.cooldown + KATANA.cooldownJitter * world.rng(); // OG game.js:18490-18491
  },
});
