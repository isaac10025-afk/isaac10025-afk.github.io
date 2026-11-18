// Piranha: water-only swarm (OG "Piranha", game.js:4235-4520). Owner: ANIMALS.
// A school that shreds anything wet nearby. Painted on land it flops toward water and suffocates.
import { registerUnit } from '../../defs.js';
import {
  S, DT, fac, LOCO, INTEL, hyp, signed, range, setState, unit, perchOf, hostile, ensure, hitAnim, dmg, toss, sfx,
  hasWater, hasIce, wetAt, nearestWet, shoreAt, pondAt, frozenAt, TILE,
} from './lib.js';
import { ENEMY, maskBit } from '../../factions.js';

const VICTIM_RANGE = 260; // OG game.js:4235 (wounded prey within 260; healthy within 170)
const FLOP = 0.6; // OG game.js:4236
const HEALTHY_RANGE = 170; // OG game.js:4357
const BITE = 6; // OG game.js:4378
const BITE_COOLDOWN = 0.35; // OG game.js:4394
const SPLASH_CHANCE = 0.5; // OG game.js:4519
const SPLASH_SIZE = 0.6; // OG game.js:4520
const ICE_RANGE = 220; // OG game.js:4409
const SCHOOL_R = 75; // OG game.js:4452
const SEP_R = 13; // OG game.js:4466
const QCAP = 24; // OG De = new Int32Array(24) (game.js:4238): every piranha grid query keeps only the first 24 hits, in grid order
const qbuf = new Array(QCAP).fill(null);
const spot = new Float32Array(2);
const school = [0, 0];
const shore = [0, 0, 0];

// out of water: suffocate (maxHp/7 per s) and flop toward water within 40 px (OG game.js:4316-4340)
function stranded(w, u) {
  setState(u, S.IDLE); u.face = u.heading;
  dmg(w, u, (u.maxHp / 7) * DT, null); // OG game.js:4322
  if (u.hp <= 0 || u.z > 0 || u.vz > 0) return;
  if (u.b.timer === 0) u.b.timer = w.time + FLOP * range(w, 0.3, 1); // OG game.js:4324
  if (w.time < u.b.timer) return;
  u.b.timer = w.time + FLOP * range(w, 0.6, 1.5); // OG game.js:4327
  let dx, dy;
  if (hasWater(w) && nearestWet(w, u.x, u.y, 40, spot)) { dx = spot[0] - u.x; dy = spot[1] - u.y; } // OG game.js:4331
  else { const a = w.rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
  const d = hyp(dx, dy) || 0.001;
  toss(w, u, dx / d, dy / d, 45 * range(w, 0.6, 1.2), 110 * range(w, 0.7, 1.2)); // OG game.js:4339
}

// nearest wet enemy: keep the last one (re-checked every 6 ticks) (OG game.js:4342-4362)
function victim(w, u) {
  const last = unit(w, u.lastVictim);
  if (last && last.hp > 0 && wetAt(w, last) && (w.tick + u.index) % 6 !== 0) return last;
  let best = null, bd = Infinity;
  const n = w.queryMask(u.x, u.y, VICTIM_RANGE, ENEMY[u.faction], qbuf, QCAP); // OG game.js:4350 (cap 24)
  for (let k = 0; k < n; k++) {
    const o = qbuf[k];
    if (o.hp <= 0 || o.dead || !wetAt(w, o)) continue;
    const d = hyp(o.x - u.x, o.y - u.y);
    if (d > (o.hp < o.maxHp ? VICTIM_RANGE : HEALTHY_RANGE) || d >= bd) continue;
    best = o; bd = d;
  }
  u.lastVictim = best ? best.id : -1;
  return best;
}
// nearest enemy standing on the frozen part of our pond (OG game.js:4404-4421)
function iceVictim(w, u) {
  if (!hasIce(w)) return null;
  const pond = pondAt(w, u.x, u.y);
  let best = null, bd = Infinity;
  const n = w.queryMask(u.x, u.y, ICE_RANGE, ENEMY[u.faction], qbuf, QCAP); // OG game.js:4410 (cap 24)
  for (let k = 0; k < n; k++) {
    const o = qbuf[k];
    if (o.hp <= 0 || o.dead || o.z > 0 || !frozenAt(w, o.x, o.y) || pondAt(w, o.x, o.y) !== pond) continue;
    const d = hyp(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; }
  }
  u.lastVictim = best ? best.id : -1;
  return best;
}
// school: separation within 13 px (×1.8), plus alignment and cohesion unless sepOnly (OG game.js:4452-4484)
function schooling(w, u, sepOnly) {
  let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
  const m = w.queryMask(u.x, u.y, SCHOOL_R, maskBit(u.faction), qbuf, QCAP); // OG game.js:4452 (own faction, cap 24, self included)
  for (let k = 0; k < m; k++) {
    const o = qbuf[k];
    if (o === u || o.type !== u.type) continue;
    const dx = u.x - o.x, dy = u.y - o.y, d = hyp(dx, dy);
    if (d < SEP_R && d > 0.001) { const k = (SEP_R - d) / SEP_R; sx += dx / d * k; sy += dy / d * k; }
    const sp = hyp(o.vx, o.vy);
    if (sp > 1) { ax += o.vx / sp; ay += o.vy / sp; }
    cx += o.x; cy += o.y; n++;
  }
  school[0] = 1.8 * sx; school[1] = 1.8 * sy;
  if (n > 0 && !sepOnly) {
    const a = hyp(ax, ay);
    if (a > 0.001) { school[0] += ax / a; school[1] += ay / a; }
    const tx = cx / n - u.x, ty = cy / n - u.y, t = hyp(tx, ty);
    if (t > 0.001) { const k = 1.1 * Math.min(1, t / SCHOOL_R); school[0] += tx / t * k; school[1] += ty / t * k; }
  }
  return school;
}
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
// steer off the shore, feelers ahead at max(36, 0.8·speed) ±0.6 rad. Returns [x, y, factor] (OG game.js:4486-4515)
function shoreAvoid(w, u, depthWanted) {
  const sp = hyp(u.vx, u.vy), hx = sp > 1 ? u.vx / sp : Math.cos(u.heading), hy = sp > 1 ? u.vy / sp : Math.sin(u.heading);
  const look = Math.max(36, 0.8 * sp), c = Math.cos(0.6), s = Math.sin(0.6);
  const ahead = shoreAt(w, u.x + hx * look, u.y + hy * look), f = 0.8 * look;
  const left = shoreAt(w, u.x + (hx * c - hy * s) * f, u.y + (hy * c + hx * s) * f);
  const right = shoreAt(w, u.x + (hx * c + hy * s) * f, u.y + (hy * c - hx * s) * f);
  const here = shoreAt(w, u.x, u.y);
  const k = Math.max(clamp01((depthWanted - ahead) / depthWanted), 0.6 * clamp01((depthWanted - here) / depthWanted));
  shore[0] = 0; shore[1] = 0; shore[2] = k;
  if (k <= 0) return shore;
  const side = left >= right ? 1 : -1;
  let px = -hy * side, py = hx * side;
  const gx = shoreAt(w, u.x + TILE, u.y) - shoreAt(w, u.x - TILE, u.y), gy = shoreAt(w, u.x, u.y + TILE) - shoreAt(w, u.x, u.y - TILE);
  const g = hyp(gx, gy);
  if (g > 0) { px += gx / g * 0.8; py += gy / g * 0.8; }
  if (ahead === 0) { px -= 0.5 * hx; py -= 0.5 * hy; }
  const L = hyp(px, py) || 1;
  shore[0] = px / L * 4 * k; shore[1] = py / L * 4 * k;
  return shore;
}
function bite(w, u, e) { // OG game.js:4370-4395
  const h = perchOf(w, e);
  const bx = h.x - Math.cos(h.heading) * h.radius, by = h.y - Math.sin(h.heading) * h.radius; // from behind (OG game.js:4372-4373)
  dmg(w, h, BITE + 2 * signed(w), u, undefined, bx, by);
  sfx(w, 'strike', u.x, u.y, { type: u.type });
  if (w.rng() < SPLASH_CHANCE) {
    const x = (u.x + h.x) / 2 + 4 * signed(w), y = (u.y + h.y) / 2;
    sfx(w, 'splash', x, y, { v: SPLASH_SIZE, angle: -Math.PI / 2 + 0.6 * signed(w), size: SPLASH_SIZE * range(w, 0.7, 1.3), type: u.type });
  }
  hitAnim(u); u.cooldown = BITE_COOLDOWN * range(w, 0.8, 1.2);
}

function brain(w, u) { // OG game.js:4314-4442
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (!wetAt(w, u)) { stranded(w, u); return; }
  u.b.timer = 0;
  if (u.stun > 0) { u.face = u.heading; return; }
  const def = u.def, e = victim(w, u);
  let gx, gy, sp;
  if (e) {
    const dx = e.x - u.x, dy = e.y - u.y, d = hyp(dx, dy) || 0.001;
    if (d <= u.radius + e.radius + 3) { // OG game.js:4367
      setState(u, S.ENGAGE); u.face = Math.atan2(dy, dx);
      if (u.cooldown <= 0) bite(w, u, e);
      u.goalX = dx / d * def.walkSpeed * 0.5; u.goalY = dy / d * def.walkSpeed * 0.5; // keeps pushing in (OG game.js:4396-4397)
      return;
    }
    setState(u, S.CHARGE); // OG game.js:4399-4403
    const sc = schooling(w, u, true), sx = sc[0], sy = sc[1], sh = shoreAvoid(w, u, 1);
    gx = dx / d + sx + sh[0]; gy = dy / d + sy + sh[1]; sp = def.runSpeed;
  } else {
    const ice = iceVictim(w, u);
    if (ice) { // circle under it (OG game.js:4422-4429)
      setState(u, S.ADVANCE);
      const sc = schooling(w, u, true), a = Math.atan2(u.y - ice.y, u.x - ice.x) + 0.9;
      gx = ice.x + 14 * Math.cos(a) - u.x + 10 * sc[0]; gy = ice.y + 14 * Math.sin(a) - u.y + 10 * sc[1];
      sp = 1.3 * def.walkSpeed; // OG game.js:4429 (derived: 1.3 × walkSpeed)
    } else { // school wander (OG game.js:4431-4441)
      setState(u, S.ADVANCE);
      const sc = schooling(w, u, false), sx = sc[0], sy = sc[1];
      u.wander += 3 * signed(w) * DT;
      const v = hyp(u.vx, u.vy), hx = v > 1 ? u.vx / v : Math.cos(u.heading), hy = v > 1 ? u.vy / v : Math.sin(u.heading);
      const sh = shoreAvoid(w, u, 4), k = 1 - 0.8 * sh[2];
      gx = (hx + sx + 0.35 * Math.cos(u.wander)) * k + sh[0];
      gy = (hy + sy + 0.35 * Math.sin(u.wander)) * k + sh[1];
      sp = def.walkSpeed * (1 + 0.25 * Math.sin(0.7 * w.time + 1.7 * u.index)) * (1 - 0.35 * sh[2]);
    }
  }
  const g = hyp(gx, gy) || 0.001;
  u.goalX = gx / g * sp; u.goalY = gy / g * sp;
}

registerUnit({
  type: 'piranha',
  og: 'Piranha', // OG game.js:4242
  category: 'animals', // OG game.js:4243
  faction: fac('Piranhas'), // OG game.js:4244
  aquatic: true, // OG game.js:4245
  swims: true, // OG game.js:4246
  waterPace: 1, // OG game.js:4247
  waterStealth: 60, // OG game.js:4248
  radius: 4.2, // OG game.js:4249
  radiusJitter: 0.1, // OG game.js:4250
  mass: 0.3, // OG game.js:4251
  density: 0.6, // OG game.js:4252
  maxHp: 18, // OG game.js:4253
  melee: true, // OG game.js:4254
  strength: 0.3, // OG game.js:4255
  locomotion: LOCO.Holonomic, // OG game.js:4256
  walkSpeed: 60, // OG game.js:4257
  runSpeed: 150, // OG game.js:4258
  maxSpeed: 170, // OG game.js:4259
  accel: 600, // OG game.js:4260
  decel: 400, // OG game.js:4261
  turnRate: 9, // OG game.js:4262
  turnSpeedFalloff: Infinity, // OG game.js:4263
  sightRange: 200, // OG game.js:4264
  alertSightRange: 260, // OG game.js:4265
  stickyTarget: true, // OG game.js:4266
  reactionTime: 0.1, // OG game.js:4267
  huntRange: Infinity, // OG game.js:4268
  minDistance: 0, // OG game.js:4269
  drilled: false, // OG game.js:4270
  intelligence: INTEL.Animal, // OG game.js:4271
  infectable: false, // OG game.js:4272
  flammability: 0, // OG game.js:4273
  brushSpacing: 9, // OG game.js:4274
  flock: {
    personalSpace: 1.2, // OG game.js:4276
    separation: 20, // OG game.js:4277
    alignment: 0, // OG game.js:4278
    cohesion: 0, // OG game.js:4279
    formation: 0, // OG game.js:4280
    herd: 0, // OG game.js:4281
    herdSpacing: 0, // OG game.js:4282
    flockByState: [0, 0, 0, 0, 0, 0], // OG game.js:4283
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:4284
  },
  morale: {
    baseline: 1, // OG game.js:4287
    oddsWeight: 0, // OG game.js:4288
    fearWeight: 0, // OG game.js:4289
    casualtyWeight: 0, // OG game.js:4290
    woundWeight: 0, // OG game.js:4291
    hitShock: 0, // OG game.js:4292
    suppression: 0, // OG game.js:4293
    canBreak: false, // OG game.js:4294
    breakAt: 0, // OG game.js:4295
    rallyAt: 0, // OG game.js:4296
    minFleeTime: 1, // OG game.js:4297
    dropRate: 1, // OG game.js:4298
    recoverRate: 1, // OG game.js:4299
    panicFear: 0, // OG game.js:4300
    deathFear: 0, // OG game.js:4301
  },
  look: {
    attack: {
      time: 0.2, // OG game.js:4309
      kick: 0, // OG game.js:4309
    },
  },
  init(w, u) { // OG game.js:4311-4313
    ensure(u);
    u.wander = w.rng() * Math.PI * 2; u.lastVictim = -1; u.b.timer = 0;
  },
  brain,
});
