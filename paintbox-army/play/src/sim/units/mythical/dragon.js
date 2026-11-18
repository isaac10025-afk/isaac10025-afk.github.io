// Dragon (OG "Dragon", type 44): roars on arrival, sweeps fire breath, bites, tail-swipes, flies (takeoff, strafe,
// circle, land). Fireproof, stun-immune, never breaks, never infected. Rules 1:1 from OG game.js:1149-1720 (our own code).
import { registerUnit } from '../../defs.js';
import { fireProjectile } from '../../combat/index.js';
import * as K from './_lib.js';

// subState values (OG game.js:1169-1174: E, O, _, j, T, R)
const BREATH = 1, TAIL = 2, ROAR = 3, TAKEOFF = 4, FLYING = 5, LANDING = 6;
const BREATH_RANGE = 220;                                  // OG game.js:1175 (L)
const BREATH_EVERY = 1 / 40;                               // OG game.js:1176 (N)
const SPREAD = 0.14;                                       // OG game.js:1177 (P)
const HEAD_GAIN = 0.85, HEAD_MAX = 0.8;                    // OG game.js:1178-1179 (I, H)
const BITE_R = 2.5;                                        // OG game.js:1180 (C): bite reach 2.5 R + r_t
const TAIL_T = 0.9;                                        // OG game.js:1181 (F)
const ROAR_T = 1.3;                                        // OG game.js:1182 (G)
const ROAR_R = 200;                                        // OG game.js:1183 (B)
const FLY_H = 45;                                          // OG game.js:1184 (D)
const LAND_T = 0.5;                                        // OG game.js:1185 (z)
const SPACING = 70;                                        // OG game.js:1186 (Y): keep 70 px edge gap from other Dragons
// ability slots (spellReady): 0 breath 4.5 s, 1 tail 4 + 0.9 s, 2 roar 10 s, 3 flight 6 s (× U(0.85, 1.15))
const S_BREATH = 0, S_TAIL = 1, S_ROAR = 2, S_FLY = 3;

const D = {
  type: 'dragon', og: 'Dragon', ogId: 44,                  // OG game.js:1189-1191, id game.js:8498
  category: 'mythical',                                    // OG game.js:1192
  faction: 19,                                             // OG game.js:1193 (Dragons = 19)
  deepWalker: true,                                        // OG game.js:1194
  waterPace: 0.7,                                          // OG game.js:1195
  untossable: true,                                        // OG game.js:1196
  radius: 19,                                              // OG game.js:1197
  radiusJitter: 0.05,                                      // OG game.js:1198
  mass: 14,                                                // OG game.js:1199
  iceGrip: 1,                                              // OG game.js:1200
  density: 6,                                              // OG game.js:1201
  deflects: true,                                          // OG game.js:1202
  maxHp: 2600,                                             // OG game.js:1203
  melee: true,                                             // OG game.js:1204
  strength: 7,                                             // OG game.js:1205
  locomotion: 0,                                           // OG game.js:1206 (Holonomic)
  walkSpeed: 38,                                           // OG game.js:1207
  runSpeed: 85,                                            // OG game.js:1208
  maxSpeed: 160,                                           // OG game.js:1209
  accel: 260,                                              // OG game.js:1210
  decel: 260,                                              // OG game.js:1211
  turnRate: 2.2,                                           // OG game.js:1212
  turnSpeedFalloff: Infinity,                              // OG game.js:1213
  sightRange: 360,                                         // OG game.js:1214
  alertSightRange: 400,                                    // OG game.js:1215
  stickyTarget: true,                                      // OG game.js:1216
  reactionTime: 0.3,                                       // OG game.js:1217
  huntRange: Infinity,                                     // OG game.js:1218
  minDistance: 0,                                          // OG game.js:1219
  drilled: false,                                          // OG game.js:1220
  intelligence: 1,                                         // OG game.js:1221 (Animal)
  infectable: false,                                       // OG game.js:1222
  flammability: 0,                                         // OG game.js:1223
  brushSpacing: 85,                                        // OG game.js:1224
  flock: {                                                 // OG game.js:1225-1236: Soldier flock (game.js:9940-9948) + overrides
    personalSpace: 1.4, separation: 45, alignment: 0, cohesion: 0, formation: 0, herd: 0.2, herdSpacing: 22,
    flockByState: [1, 1, 0.3, 1, 0.3, 0.25], formationByState: [0, 0, 0, 0, 0, 0], idleSpread: 2.5,
  },
  morale: {                                                // OG game.js:1237-1247: Soldier morale (game.js:9951-9965) + overrides
    baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: false, breakAt: 0.22, rallyAt: 0.55, minFleeTime: 2.5, dropRate: 3.2, recoverRate: 0.2, panicFear: 0.5, deathFear: 1,
  },
  look: { attack: { time: 0.4 } },                         // OG game.js:1254

  init(world, u) {                                         // OG game.js:1256-1259: all abilities ready, roar at once
    u.b.spell = [world.time, world.time, world.time, world.time];
    u.subState = 0; u.role = 0; u.b.timer = 0; u.b.aimX = 0; u.b.aimY = 0; u.wander = 0;
    roar(world, u);
  },

  brain(world, u) {                                        // OG game.js:1260-1285
    think(world, u, K.DT);
    if (u.leaping !== K.LEAP_FLY) spaceOut(world, u);
  },
};

function ready(world, u, s) { return world.time >= u.b.spell[s]; }                              // OG X (game.js:1287-1289)
function setReady(world, u, s, t) { u.b.spell[s] = world.time + t * K.range(world, 0.85, 1.15); } // OG U (game.js:1290-1292)

const Q = [];
// Grounded: pushed away from other Dragons whose edge gap < 70, up to 1.2 × walk (OG game.js:1263-1284).
function spaceOut(world, u) {
  K.queryMask(world, u.x, u.y, u.radius + SPACING + K.MARGIN, 1 << K.FAC.Dragons, Q, 64);
  let sx = 0, sy = 0;
  for (let k = 0; k < Q.length; k++) {
    const e = Q[k];
    if (e === u || e.type !== 'dragon' || e.hp <= 0) continue;
    const rx = u.x - e.x, ry = u.y - e.y, l = K.hypot(rx, ry) || 0.001, gap = l - u.radius - e.radius;
    if (gap >= SPACING) continue;
    const s = 1 - Math.max(0, gap) / SPACING;
    sx += (rx / l) * s; sy += (ry / l) * s;
  }
  const a = K.hypot(sx, sy);
  if (a <= 0) return;
  const c = 1.2 * D.walkSpeed * Math.min(1, a);
  u.goalX += (sx / a) * c; u.goalY += (sy / a) * c;
}

function think(world, u, dt) {                             // OG V (game.js:1293-1536)
  const b = u.b, now = world.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.stun = 0;     // stun-immune (OG game.js:1295)
  const e = K.target(world, u), sub = u.subState;
  if (sub === TAKEOFF || sub === FLYING || sub === LANDING) { fly(world, u, e); return; }
  if (sub === ROAR) {                                      // OG game.js:1415-1419
    K.setState(u, K.ST.ALERT);
    if (e) u.face = Math.atan2(e.y - u.y, e.x - u.x);
    if (now >= b.timer) u.subState = 0;
    return;
  }
  if (sub === TAIL) {                                      // OG game.js:1420-1449
    K.setState(u, K.ST.ENGAGE);
    u.face = u.heading;
    if (b.aimY === 0 && now >= b.timer - TAIL_T + 0.45) { b.aimY = 1; tailSwipe(world, u); }
    if (now >= b.timer) u.subState = 0;
    return;
  }
  if (sub === BREATH) {                                    // OG game.js:1450-1470
    if (now < b.timer) {
      K.setState(u, K.ST.ENGAGE);
      breathTick(world, u);
      const a = b.aimX;
      u.goalX = Math.cos(a) * D.walkSpeed * 0.35; u.goalY = Math.sin(a) * D.walkSpeed * 0.35;
      return;
    }
    u.subState = 0;
  }
  if (!e) {                                                // OG game.js:1471-1473
    if (K.pursue(world, u, D.walkSpeed, 6)) return;
    K.setState(u, K.ST.IDLE);
    K.roam(world, u, dt, 0.5 * D.walkSpeed, 120);
    return;
  }
  const n = e.x - u.x, o = e.y - u.y, h = K.hypot(n, o) || 0.001, m = Math.atan2(o, n);
  if (ready(world, u, S_ROAR) && h < ROAR_R) { roar(world, u); return; } // OG game.js:1479
  const w = around(world, u, 2.6 * u.radius);
  const wCount = w.total, wBehind = w.behind, wcx = w.cx, wcy = w.cy;
  if (ready(world, u, S_FLY) && around(world, u, 1.9 * u.radius).total >= 7) { // OG game.js:1480-1486: escape a mob
    const ex = u.x - wcx, ey = u.y - wcy, a = K.hypot(ex, ey) > 1 ? Math.atan2(ey, ex) : m + Math.PI;
    takeOff(world, u, u.x + 180 * Math.cos(a), u.y + 180 * Math.sin(a), 0);
    return;
  }
  if (ready(world, u, S_FLY) && h > 3 * u.radius) {        // OG game.js:1487-1501: relocate by air
    if ((K.waterCells(world) > 0 && K.wetAt(world, e) && !K.wetAt(world, u)) || (K.wallCount(world) > 0 && u.los === 0) || h > 260) {
      const r = u.radius * BITE_R + e.radius, c = world.rng();
      if (c < 0.35) takeOff(world, u, e.x + (n / h) * 170, e.y + (o / h) * 170, 1);           // strafing pass
      else if (c < 0.35 + 0.3) takeOff(world, u, e.x, e.y, world.rng() < 0.5 ? 2 : 3);        // circle it
      else takeOff(world, u, e.x - (n / h) * r, e.y - (o / h) * r, 0);                         // land short of it
      return;
    }
  }
  if (ready(world, u, S_TAIL) && wCount >= 3 && wBehind >= 2) { // OG game.js:1502-1503
    u.subState = TAIL; b.timer = now + TAIL_T; b.aimY = 0; setReady(world, u, S_TAIL, 4 + TAIL_T);
    return;
  }
  if (h <= u.radius * BITE_R + e.radius) {                 // OG game.js:1504-1520: bite
    K.setState(u, K.ST.ENGAGE);
    u.face = m;
    if (u.cooldown <= 0 && Math.abs(K.angleDiff(u.heading, m)) < 0.7) bite(world, u, e, n / h, o / h);
    return;
  }
  if (ready(world, u, S_BREATH) && h <= 1.1 * BREATH_RANGE && Math.abs(K.angleDiff(u.heading, m)) < 1.2) { // OG 1522-1531
    const a = breathAim(world, u);
    if (a === a) {
      u.subState = BREATH; b.timer = now + 2; b.aimX = a; setReady(world, u, S_BREATH, 4.5);
      K.emit(world, 'flame', { x: u.x, y: u.y, v: 3, type: u.type });
      return;
    }
  }
  K.setState(u, h < 330 ? K.ST.CHARGE : K.ST.ADVANCE);    // OG game.js:1533-1535
  u.face = m;
  K.pathTo(world, u, e.x, e.y, h > BREATH_RANGE ? D.runSpeed : D.walkSpeed, u.los === 1 || K.wallCount(world) === 0);
}

// OG game.js:1298-1413: takeoff 0.6 s → flying at height 45 (circle / straight + strafe) → landing 0.5 s.
function fly(world, u, e) {
  const b = u.b, now = world.time, sub = u.subState;
  K.setState(u, K.ST.CHARGE);
  const n = b.aimX - u.x, o = b.aimY - u.y, h = K.hypot(n, o) || 0.001;
  if (sub === TAKEOFF) {
    const p = 1 - Math.max(0, b.timer - now) / 0.6;
    u.z = FLY_H * p * p; u.vz = 0;
    u.goalX = (n / h) * D.walkSpeed; u.goalY = (o / h) * D.walkSpeed;
    u.face = Math.atan2(o, n);
    if (now >= b.timer) { u.subState = FLYING; if (u.role === 2 || u.role === 3) b.timer = now + 3.2 * K.range(world, 0.85, 1.15); }
    return;
  }
  if (sub === FLYING) {
    u.z = FLY_H; u.vz = 0;
    const circling = u.role === 2 || u.role === 3;
    if (circling) {                                        // orbit radius 110 at 160, radial correction clamp(2.5 (110 − d), ±160)
      const tx = e ? e.x : b.aimX, ty = e ? e.y : b.aimY;
      const cx = u.x - tx, cy = u.y - ty, d = K.hypot(cx, cy) || 0.001, f = u.role === 2 ? 1 : -1;
      const m = Math.max(-D.maxSpeed, Math.min(D.maxSpeed, 2.5 * (110 - d)));
      let vx = (-cy / d) * f * D.maxSpeed + (cx / d) * m, vy = (cx / d) * f * D.maxSpeed + (cy / d) * m;
      const s = K.hypot(vx, vy) || 0.001;
      vx = (vx / s) * D.maxSpeed; vy = (vy / s) * D.maxSpeed;
      u.goalX = vx; u.goalY = vy; u.face = Math.atan2(vy, vx);
      if (now >= b.timer) {                                // then land 2.5 R + r_t past the target, on our side
        const r = u.radius * BITE_R + (e ? e.radius : 0);
        b.aimX = Math.max(u.radius, Math.min(world.W - u.radius, tx + (cx / d) * r));
        b.aimY = Math.max(u.radius, Math.min(world.H - u.radius, ty + (cy / d) * r));
        u.role = 0;
      }
    } else {
      const t = Math.min(D.maxSpeed, 2.5 * h);
      u.goalX = (n / h) * t; u.goalY = (o / h) * t; u.face = Math.atan2(o, n);
    }
    if (e) {                                               // strafe: one flame every 1.5/40 s
      const ex = e.x - u.x, ey = e.y - u.y, ea = Math.atan2(ey, ex);
      if (K.hypot(ex, ey) < BREATH_RANGE && Math.abs(K.angleDiff(u.heading, ea)) < (circling ? 1.7 : 0.8) && u.cooldown <= 0) {
        u.cooldown = 1.5 * BREATH_EVERY;
        if (u.attack <= 0) K.emit(world, 'flame', { x: u.x, y: u.y, v: 3, type: u.type });
        flame(world, u, ea + K.tri(world) * SPREAD, u.z);
      }
    }
    if (!circling && h < 20) { u.subState = LANDING; b.timer = now + LAND_T; K.emit(world, 'descend', { x: u.x, y: u.y, v: 3, type: u.type }); }
    return;
  }
  const f = Math.max(0, b.timer - now) / LAND_T;           // landing
  u.z = FLY_H * f * f; u.vz = 0;
  u.goalX = (n / h) * Math.min(D.walkSpeed, 2 * h); u.goalY = (o / h) * Math.min(D.walkSpeed, 2 * h);
  if (now >= b.timer) touchdown(world, u);
}
// OG game.js:1365-1412: touchdown: velocity ×0.2; grounded enemies within 2.4 R take 20, push 180, stun 0.4.
function touchdown(world, u) {
  u.z = 0; u.vz = 0; u.leaping = 0; u.subState = 0; u.vx *= 0.2; u.vy *= 0.2;
  const e = 2.4 * u.radius;
  K.queryMask(world, u.x, u.y, e + K.MARGIN, K.enemyMask(u.faction), Q, 64);
  const list = Q.slice();
  for (const n of list) {
    const ox = n.x - u.x, oy = n.y - u.y, l = K.hypot(ox, oy) || 0.001;
    if (n.hp <= 0 || l > e + n.radius || n.z > 0) continue;
    const h = K.damage(world, n, 20, u);
    if (n.hp > 0) K.knock(world, n, ox / l, oy / l, 180 * h, 0.4 * h);
  }
  K.emit(world, 'blast', { x: u.x, y: u.y, r: 1.6 * u.radius, kind: 3 });
  for (let k = 0; k < 6; k++) K.emit(world, 'puff', { x: u.x + K.signed(world) * u.radius * 1.5, y: u.y + K.signed(world) * u.radius * 0.5, ang: world.rng() * Math.PI * 2, size: 1.6, kind: 'dust' });
  K.emit(world, 'trample', { x: u.x, y: u.y, v: 3, type: u.type });
}
// OG it (game.js:1636-1655): start a flight to (x, y). role 0 land / 1 strafe pass / 2-3 circle cw/ccw.
function takeOff(world, u, x, y, role) {
  const b = u.b, r = u.radius;
  u.subState = TAKEOFF; u.role = role; b.timer = world.time + 0.6;
  b.aimX = Math.max(r, Math.min(world.W - r, x)); b.aimY = Math.max(r, Math.min(world.H - r, y));
  u.leaping = K.LEAP_FLY;
  setReady(world, u, S_FLY, 6);
  K.emit(world, 'flap', { x: u.x, y: u.y, v: 2, type: u.type });
  for (let k = 0; k < 5; k++) K.emit(world, 'puff', { x: u.x + K.signed(world) * r * 1.5, y: u.y + K.signed(world) * r * 0.5, ang: world.rng() * Math.PI * 2, size: 1.3, kind: 'dust' });
}
// OG nt (game.js:1625-1635): 1.3 s Alert; enemies within 200 lose 0.25 × (1 − d/200) morale; noise splat 1 at r 400.
function roar(world, u) {
  u.subState = ROAR; u.b.timer = world.time + ROAR_T; setReady(world, u, S_ROAR, 10);
  K.splatNoise(world, u.x, u.y, 1, 400);
  K.queryMask(world, u.x, u.y, ROAR_R, K.enemyMask(u.faction), Q, 64);
  for (let k = 0; k < Q.length; k++) {
    const e = Q[k], d = K.hypot(e.x - u.x, e.y - u.y);
    if (d > ROAR_R) continue;
    e.morale = Math.max(0, e.morale - 0.25 * (1 - d / ROAR_R));
  }
  K.emit(world, 'roar', { x: u.x, y: u.y, v: 3, type: u.type });
}
// OG game.js:1505-1520: 75 ± 10, push 200 × pass, stun 0.5 × pass, cooldown 1.4 × U(0.85, 1.15).
function bite(world, u, e, nx, ny) {
  const r = K.perch(world, e);
  const l = K.damage(world, r, 75 + 10 * K.signed(world), u);
  if (r === e && e.hp > 0) K.knock(world, e, nx, ny, 200 * l, 0.5 * l);
  K.emit(world, 'strike', { x: e.x, y: e.y, v: 2, type: u.type });
  u.attack = 1;
  u.cooldown = 1.4 * K.range(world, 0.85, 1.15);
}
// OG game.js:1424-1447: at 0.45 s, grounded enemies within 2.6 R in the rear arc (2.2 rad) take 40 + a toss 200/200.
function tailSwipe(world, u) {
  const e = 2.6 * u.radius, back = u.heading + Math.PI;
  K.queryMask(world, u.x, u.y, e + K.MARGIN, K.enemyMask(u.faction), Q, 64);
  const list = Q.slice();
  for (const n of list) {
    const rx = n.x - u.x, ry = n.y - u.y, h = K.hypot(rx, ry) || 0.001;
    if (n.hp <= 0 || h > e + n.radius || n.z > 0) continue;
    if (Math.abs(K.angleDiff(back, Math.atan2(ry, rx))) > 2.2) continue;
    const f = K.damage(world, K.perch(world, n), 40, u);
    if (n.hp > 0) K.toss(world, n, rx / h, ry / h, 200 * f, 200 * f);
  }
  K.emit(world, 'trample', { x: u.x, y: u.y, v: 2.5, type: u.type });
}
// OG Z (game.js:1537-1557): grounded enemies within r: count, behind-or-beside count (cos < 0.35), centre.
const AR = { total: 0, behind: 0, cx: 0, cy: 0 };
function around(world, u, r) {
  K.queryMask(world, u.x, u.y, r + K.MARGIN, K.enemyMask(u.faction), Q, 64);
  let n = 0, c = 0, sx = 0, sy = 0;
  const hx = Math.cos(u.heading), hy = Math.sin(u.heading);
  for (let k = 0; k < Q.length; k++) {
    const o = Q[k], rx = o.x - u.x, ry = o.y - u.y, d = K.hypot(rx, ry);
    if (o.hp <= 0 || d > r + o.radius || o.z > 0) continue;
    n++; sx += o.x; sy += o.y;
    if ((rx * hx + ry * hy) / (d || 1) < 0.35) c++;
  }
  AR.total = n; AR.behind = c; AR.cx = n > 0 ? sx / n : u.x; AR.cy = n > 0 ? sy / n : u.y;
  return AR;
}
// OG game.js:1450-1468: aim re-centres every 12 ticks; flame angle sweeps aim + 0.75 sin(2π p); one flame per 1/40 s.
function breathTick(world, u) {
  const b = u.b;
  if ((world.tick + K.idx(u)) % 12 === 0) {
    const e = breathAim(world, u);
    if (e === e) b.aimX += 0.5 * K.angleDiff(b.aimX, e);
  }
  const p = 1 - (b.timer - world.time) / 2, a = b.aimX + 0.75 * Math.sin(p * Math.PI * 2);
  u.face = b.aimX; b.aimY = a;
  if (u.cooldown > 1e-4) return;
  u.cooldown = BREATH_EVERY;
  flame(world, u, a + K.tri(world) * SPREAD, 0);
}
// OG tt (game.js:1588-1605): weighted mean direction of enemies 2.5 R..220 px within ±1.2 rad of heading.
function breathAim(world, u) {
  K.queryMask(world, u.x, u.y, BREATH_RANGE + K.MARGIN, K.enemyMask(u.faction), Q, 64);
  let n = 0, o = 0;
  for (let k = 0; k < Q.length; k++) {
    const e = Q[k], rx = e.x - u.x, ry = e.y - u.y, l = K.hypot(rx, ry) || 1;
    if (e.hp <= 0 || l > BREATH_RANGE + e.radius || l < u.radius * BITE_R) continue;
    const a = Math.atan2(ry, rx);
    if (Math.abs(K.angleDiff(u.heading, a)) > 1.2) continue;
    const h = 1 - (l / (BREATH_RANGE + e.radius)) * 0.6;
    n += Math.cos(a) * h; o += Math.sin(a) * h;
  }
  return n === 0 && o === 0 ? NaN : Math.atan2(o, n);
}
// Mouth position (OG J/Q/$, game.js:1559-1587). Side s = ±1 kept in `wander` with 0.2 hysteresis.
function side(u) {
  const f = u.face === u.face ? u.face : u.heading, c = Math.cos(f);
  if (c > 0.2) u.wander = 1; else if (c < -0.2) u.wander = -1; else if (u.wander === 0) u.wander = c >= 0 ? 1 : -1;
  return u.wander;
}
const MOUTH = [0, 0, 0];
function mouth(u, a) {
  const s = side(u);
  const q = Math.max(-HEAD_MAX, Math.min(HEAD_MAX, Math.atan2(Math.sin(a), Math.cos(a) * s) * HEAD_GAIN));
  const rot = (x, y, r) => [Math.cos(r) * x - Math.sin(r) * y, Math.sin(r) * x + Math.cos(r) * y];
  const e = 1, o = 1.45 + 0.25 * e, r = (2.35 - 1.95) * e - 2.35;
  const [c, l] = rot(o - 0.65, r - -1.45, 0.55 * q);
  const [h, d] = rot(0.972, 1.35 * (0.17 + 0.17 * e), -0.15 * e + q);
  MOUTH[0] = u.x + s * u.radius * (0.65 + c + h); MOUTH[1] = u.y; MOUTH[2] = u.radius * -(-1.45 + l + d);
  return MOUTH;
}
// OG et (game.js:1606-1624): alight flame, 560 × U(0.85, 1.1) px/s, life 0.7 × U(0.85, 1.1) s, 6 dmg, scale 1.8.
function flame(world, u, a, lift) {
  const m = mouth(u, a), rise = m[2] - 8 + lift, sp = 560 * K.range(world, 0.85, 1.1), life = 0.7 * K.range(world, 0.85, 1.1);
  const p = fireProjectile(world, 'flame', u, m[0] + Math.cos(a) * 100, m[1] + Math.sin(a) * 100, {
    x: m[0], y: m[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a, speed: sp, life, damage: 6,
    scale: 1.8, rise, alight: 1,
  });
  if (p) u.attack = 1;
}

registerUnit(D);
