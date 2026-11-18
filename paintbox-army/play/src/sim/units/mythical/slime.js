// Slime (OG "Slime", type 8): hop cycle, landing shove/hit, drip coat, split on hit, regrow.
// Rules 1:1 from OG game.js:15137-15402 (our own code).
import { registerUnit } from '../../defs.js';
import * as K from './_lib.js';
import * as TW from '../../terrain/water.js';                        // shoreAt, taintedAt, flood, taintAt: terrain functions, not world methods
import { terrainOf } from '../../terrain/grid.js';

const AIR = 0.32;                                          // OG game.js:15138 (O): hop air time
const HOP = 62;                                            // OG game.js:15139 (_): max hop length
const SPLIT_V = 130;                                       // OG game.js:15141 (T): split fly-apart speed
const COAT_WATER = 1, COAT_TAINT = 2, COAT_OIL = 3;        // OG game.js:15368-15370 (N, P, I)
const COAT_HOPS = 4;                                       // OG game.js:15371 (H)
const DRIP_R = 0.75, DRIP_BIG = 1.6, OIL_POUR = 1.8;       // OG game.js:15372-15374 (C, F, G)
const SHORE_MIN = 2, OIL_PROBE = 12;                       // OG game.js:15375-15376 (B, D)
const TAINT_S = 25;                                        // OG game.js:679 (A.a): tainted water lasts 25 s

const S = {
  type: 'slime', og: 'Slime', ogId: 8,                     // OG game.js:15142-15144, id game.js:8462
  category: 'mythical',                                    // OG game.js:15145
  faction: 8,                                              // OG game.js:15146 (Slimes = 8)
  radius: 13,                                              // OG game.js:15147
  radiusJitter: 0.06,                                      // OG game.js:15148
  mass: 2,                                                 // OG game.js:15149
  density: 0.3,                                            // OG game.js:15150
  conductivity: 2,                                         // OG game.js:15151
  maxHp: 220,                                              // OG game.js:15152
  melee: true,                                             // OG game.js:15153
  strength: 0.8,                                           // OG game.js:15154
  locomotion: 0,                                           // OG game.js:15155 (Holonomic)
  walkSpeed: 60,                                           // OG game.js:15156
  runSpeed: HOP / AIR,                                     // OG game.js:15157 (62 / 0.32 = 193.75)
  maxSpeed: 230,                                           // OG game.js:15158
  accel: 1400,                                             // OG game.js:15159
  decel: 1400,                                             // OG game.js:15160
  turnRate: 8,                                             // OG game.js:15161
  turnSpeedFalloff: Infinity,                              // OG game.js:15162
  sightRange: 300,                                         // OG game.js:15163
  alertSightRange: 300,                                    // OG game.js:15164
  stickyTarget: false,                                     // OG game.js:15165
  reactionTime: 0.4,                                       // OG game.js:15166
  huntRange: Infinity,                                     // OG game.js:15167
  minDistance: 0,                                          // OG game.js:15168
  drilled: false,                                          // OG game.js:15169
  intelligence: 1,                                         // OG game.js:15170 (Animal = 1)
  infectable: true,                                        // OG game.js:15171
  turnsWhenKilled: true,                                   // OG game.js:15172
  hopper: true,                                            // OG game.js:15173
  flammability: 0.15,                                      // OG game.js:15174
  brushSpacing: 32,                                        // OG game.js:15175
  flock: {                                                 // OG game.js:15176 = Zombie flock (game.js:12358-12368)
    personalSpace: 1.15, separation: 30, alignment: 0.15, cohesion: 0.25, formation: 0, herd: 0.3, herdSpacing: 14,
    flockByState: [1, 1, 0.2, 1, 0.2, 0], formationByState: [0, 0, 0, 0, 0, 0],
  },
  morale: {                                                // OG game.js:15177 = Zombie morale (game.js:12369-12385)
    baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 1, recoverRate: 1, panicFear: 0, deathFear: 0,
  },
  look: { attack: { time: 0.25 } },                        // OG game.js:15184

  init(world, u) {                                         // OG game.js:15186-15189
    u.subState = 0;                                        // split level 0..3
    u.b.splitAt = 0;                                       // OG keeps the split cooldown in `wander`
    u.b.hopStart = -1;
    u.b.timer = world.time + 0.38 * world.rng();
    u.b.coat = 0; u.b.coatHops = 0;
  },

  brain(world, u) {                                        // OG game.js:15190-15326
    const b = u.b, now = world.time;
    u.face = NaN;
    if (b.timer <= b.hopStart) {                           // mid-hop
      if (now - b.hopStart < AIR) return;                  // OG game.js:15193
      land(world, u);                                      // OG game.js:15194-15284
      b.timer = now + (0.38 + 0.35 * world.rng()) * (0.6 + 0.4 * L(u)); // OG game.js:15285: rest
    }
    u.goalX = 0; u.goalY = 0;
    if (u.stun > 0 || now < b.timer) return;               // OG game.js:15287
    takeoff(world, u, now);
  },

  // Possessed (OURS, Part 2 step 3): at takeoff the hop goes where the stick points, a full-length hop; stick let go =
  // a bounce on the spot. Attacking with an enemy picked: the slime's own hop at it (OG takeoff above).
  possessMove(world, u, mx, my, firing) {
    const b = u.b;
    if (b.hopStart !== world.time || b.timer !== world.time) return;    // only on the tick it takes off
    if (firing && u.target >= 0) return;
    const m = K.hypot(mx, my);
    const D = m > 0 ? (HOP * Math.min(1, m) * (0.85 + 0.15 * L(u))) / AIR : 0;
    u.vx = u.goalX = m > 0 ? (mx / m) * D : 0;
    u.vy = u.goalY = m > 0 ? (my / m) * D : 0;
  },

  // Split when hit (OG onDamaged, game.js:15327-15363). Burn damage bypasses damage() and never splits.
  onHit(world, u) {
    if (u.hp <= 0 || u.subState >= 3 || world.time < u.b.splitAt || K.isUndead(u.def)) return;
    split(world, u);
  },
};

function L(u) { return Math.pow(Math.SQRT1_2, u.subState); } // OG game.js:15365-15367: size factor

const PT = new Float32Array(2);
function takeoff(world, u, now) {                          // OG game.js:15288-15326
  const b = u.b, x = u.x, y = u.y;
  let n = K.target(world, u);
  const fr = K.isUndead(u.def) ? null : K.nearestFrog(world, x, y, 150);  // OG game.js:15291-15294
  if (fr && (!n || K.hypot(fr.x - x, fr.y - y) < 0.6 * K.hypot(n.x - x, n.y - y))) n = fr;
  let sx, sy, R = HOP;
  if (n) {
    sx = n.x - x; sy = n.y - y;
    const d = K.hypot(sx, sy);
    R = Math.min(HOP, Math.max(8, d));
    K.setState(u, d < HOP + u.radius + n.radius ? K.ST.ENGAGE : K.ST.ADVANCE);
  } else if (K.groupContact(world, u.group, 6, PT)) {     // OG game.js:15302-15303: contact seen < 6 s ago
    sx = PT[0] - x; sy = PT[1] - y; K.setState(u, K.ST.ADVANCE);
  } else {                                                 // OG game.js:15304-15306: random 21.7 px hop
    const a = world.rng() * Math.PI * 2;
    sx = Math.cos(a); sy = Math.sin(a); R = 21.7; K.setState(u, K.ST.IDLE);
  }
  let H = K.hypot(sx, sy) || 1, leap = K.LEAP_HOP;
  if (K.wallCount(world) > 0) {                            // OG game.js:15312-15318
    const e = K.vault(world, u, sx / H, sy / H, R, H);
    if (e.round && K.navDirection(world, u.faction, x, y, PT, false)) { sx = PT[0]; sy = PT[1]; H = 1; R = HOP; }
    else { R = e.reach; leap = e.vault ? K.LEAP_VAULT : K.LEAP_HOP; }
  }
  const D = (R * (0.85 + 0.15 * L(u))) / AIR;               // OG game.js:15319
  u.vx = u.goalX = (sx / H) * D;
  u.vy = u.goalY = (sy / H) * D;
  b.hopStart = now; b.timer = now;
  u.leaping = leap;
  coatCheck(world, u);
}

const Q = [];
function land(world, u) {
  u.leaping = 0;
  K.emit(world, 'hop', { x: u.x, y: u.y, v: u.radius / u.def.radius, type: u.type });
  u.vx = u.vy = 0;
  drip(world, u);                                          // 1. drip (OG game.js:15200-15226)
  const s = L(u);
  // 2. shove every enemy within 2.6 r (+ its radius) (OG game.js:15229-15248)
  const reach = 2.6 * u.radius;
  K.queryMask(world, u.x, u.y, reach + K.MARGIN, K.enemyMask(u.faction), Q, 24);
  for (let k = 0; k < Q.length; k++) {
    const o = Q[k];
    if (o.hp <= 0) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = K.hypot(dx, dy), m = reach + o.radius;
    if (d >= m) continue;
    const f = 1 - d / m;
    const a = d > 0.001 ? 0 : world.rng() * Math.PI * 2;
    const nx = d > 0.001 ? dx / d : Math.cos(a), ny = d > 0.001 ? dy / d : Math.sin(a);
    K.knock(world, o, nx, ny, 120 * s * f, 0.3 * s * f);
  }
  if (K.hash2(K.idx(u), world.tick) < 0.5) K.emit(world, 'puff', { x: u.x, y: u.y, size: (u.radius / 8.63) * 1.2, kind: 'dust' });
  // 3. ice crack (OG game.js:15251)
  K.iceImpact(world, u.x, u.y, u.radius, K.impactOf(u.mass, (4 * 0.9 * u.radius) / AIR));
  // 4. frog eat, not when undead (OG game.js:15252-15259)
  if (!K.isUndead(u.def)) {
    const fr = K.nearestFrog(world, u.x, u.y, u.radius + 4 + 12);
    if (fr && K.hypot(fr.x - u.x, fr.y - u.y) <= u.radius + fr.radius + 4) {
      fr.hp = 0; u.attack = 1;
      if (u.subState > 0 && u.infection === 0) regrow(u);
    }
  }
  // 5. hit the nearest enemy with edge gap < 6 (OG game.js:15260-15284)
  K.queryMask(world, u.x, u.y, u.radius + K.MARGIN + 6, K.enemyMask(u.faction), Q, 12);
  let o = null, best = Infinity;
  for (let k = 0; k < Q.length; k++) {
    const c = Q[k];
    if (c.hp <= 0) continue;
    const gap = K.hypot(c.x - u.x, c.y - u.y) - u.radius - c.radius;
    if (gap < 6 && gap < best) { best = gap; o = c; }
  }
  u.attack = 1;
  K.emit(world, 'strike', { x: u.x, y: u.y, v: u.radius / 13, type: u.type });
  if (!o) return;
  o = K.perch(world, o);
  const m = K.damage(world, o, 32 * s, u);
  if (K.isUndead(u.def)) K.infect(world, o, u, 0.5 * m, 0); // OG game.js:15277
  if (o.hp <= 0 && !o.def.prop) {                           // kill: regrow
    if (u.subState > 0 && u.infection === 0 && !K.isUndead(u.def)) regrow(u);
    return;
  }
  const dx = o.x - u.x, dy = o.y - u.y, d = K.hypot(dx, dy) || 1;
  K.knock(world, o, dx / d, dy / d, 110 * s * m, 0.12 * m);
}

// OG game.js:15327-15362: two pieces at r·√½, half hp each, maxHp 220 × 0.5^(split+1), fly apart at 130.
function split(world, u) {
  const now = world.time, e = u.radius * Math.SQRT1_2;
  const nx = -Math.sin(u.heading), ny = Math.cos(u.heading);
  const v = K.spawnUnit(world, u.type, u.x + nx * e, u.y + ny * e, u.group, u.heading, u.team);
  if (!v) return;
  const hp = u.hp / 2, mass = 0.5 * u.mass, h = u.subState + 1;
  for (const [p, f] of [[u, -1], [v, 1]]) {
    p.radius = e; p.mass = mass; p.hp = hp;
    p.maxHp = S.maxHp * Math.pow(0.5, h);
    p.subState = h;
    p.b.splitAt = now + 0.25;
    p.vx = nx * f * SPLIT_V; p.vy = ny * f * SPLIT_V;
    p.b.hopStart = -1; p.leaping = 0;
    p.b.timer = now + 0.25 + 0.2 * world.rng();
    p.flash = 1;
    p.target = u.target;
  }
  K.emit(world, 'split', { x: u.x, y: u.y, v: (e * Math.SQRT2) / S.radius, type: u.type });
}

// OG game.js:15392-15401: one split step back.
function regrow(u) {
  const e = u.subState - 1, old = u.maxHp;
  u.subState = e;
  u.radius *= Math.SQRT2;
  u.mass *= 2;
  u.maxHp = S.maxHp * Math.pow(0.5, e);
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp - old);
}

// OG game.js:15377-15390: coated after hopping through water (any depth >= 0.05 = OG 467.d, game.js:15383) at least
// 2 tiles from shore, or a full oil slick.
function coatCheck(world, u) {
  const x = u.x, y = u.y, b = u.b;
  if (K.waterCells(world) > 0 && K.depthAt(world, x, y) >= K.WET) {
    if (TW.shoreAt(world, x, y) >= SHORE_MIN) {
      b.coat = TW.taintedAt(world, x, y, world.time) ? COAT_TAINT : COAT_WATER;
      b.coatHops = COAT_HOPS;
    }
    return true;
  }
  const oil = K.oil(world);
  if (oil && oil.cells > 0 && typeof oil.slickAt === 'function' && oil.slickAt(x, y) > 0) {
    let full = true;
    for (let a = 0; a < 4 && full; a++) full = oil.slickAt(x + Math.cos(1.57 * a) * OIL_PROBE, y + Math.sin(1.57 * a) * OIL_PROBE) > 0;
    if (full) { b.coat = COAT_OIL; b.coatHops = COAT_HOPS; }
    return true;
  }
  return false;
}

// OG game.js:15200-15226: a coated slime drips on landing (floods water tiles in 0.75 r, or pours oil 1.8 × L).
const TILES = [];
function drip(world, u) {
  const b = u.b;
  if (coatCheck(world, u) || b.coatHops === 0) return;
  b.coatHops--;
  const x = u.x, y = u.y;
  if (b.coat === COAT_OIL) { const oil = K.oil(world); if (oil && typeof oil.pour === 'function') oil.pour(x, y, OIL_POUR * L(u)); return; }
  const T = terrainOf(world), c = T.tile, l = u.radius * DRIP_R; // water tile 8 px (OG o.tile)
  const tx = Math.floor(x / c), ty = Math.floor(y / c), f = l >= DRIP_BIG * c ? Math.ceil(l / c) : 1, skip = K.rint(world, 4);
  const cols = T.cols, rows = T.rows;                     // the water grid (OG o.cols / o.rows)
  TILES.length = 0;
  for (let r = ty - f; r <= ty + f; r++) for (let q = tx - f; q <= tx + f; q++) {
    if (q < 0 || r < 0 || q >= cols || r >= rows) continue;
    const cx = (q + 0.5) * c, cy = (r + 0.5) * c;
    if (f === 1) { if ((q !== tx && r !== ty ? (q < tx ? 0 : 1) + (r < ty ? 0 : 2) : -1) === skip) continue; }
    else if ((cx - x) ** 2 + (cy - y) ** 2 > l * l) continue;
    if (!K.solidAt(world, cx, cy) && !(world.iceAt && world.iceAt(cx, cy) > 0)) TILES.push(r * cols + q);
  }
  if (TILES.length === 0) return;
  TW.flood(world, TILES);                                  // OG game.js:15224 (o.flood)
  if (b.coat === COAT_TAINT) TW.taintAt(world, x, y, world.time + TAINT_S, world.time); // OG game.js:15224 (o.taintAt)
}

registerUnit(S);
