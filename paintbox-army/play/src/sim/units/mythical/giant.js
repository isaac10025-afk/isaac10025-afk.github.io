// Giant (OG "Giant", type 27): club sweeps, grab-and-throw, eat to heal, stomp the small, tree clubs,
// stun-immune, panics at rats. Rules 1:1 from OG game.js:17041-17533 (our own code).
import { registerUnit } from '../../defs.js';
import * as K from './_lib.js';

// subState values (OG game.js:17066-17073 and inline 1/4/7)
const SWING = 1, HOLD = 2, EAT = 3, PANIC = 4, STOMP = 5, STOMPED = 6, TREE_WALK = 7, TREE_PULL = 8;
const HOLD_T = 0.7;                                        // OG game.js:17066 (_): grab → throw
const THROW_POSE = 0.35;                                   // OG game.js:17068 (T)
const EAT_T = 1.3;                                         // OG game.js:17069 (R)
const EAT_LIFT = 0.2;                                      // OG game.js:17070 (L)
const TREE_REACH = 110;                                    // OG game.js:17075 (C)
const TREE_PULL_T = 0.8;                                   // OG game.js:17076 (F)
const STOMP_T = 0.7;                                       // OG game.js:17077 (G)
const RAT_R = 60, RAT_R_PANIC = 150, PANIC_MAX = 8, CALM = 1.5; // OG game.js:17458-17461 (W, K, X, U)
const ROAM_MUL = 0.5, ROAM_CROWD = 45;                     // OG game.js:17490-17491 (J, Q)

const G = {
  type: 'giant', og: 'Giant', ogId: 27,                    // OG game.js:17080-17082, id game.js:8481
  category: 'mythical',                                    // OG game.js:17083
  deepWalker: true,                                        // OG game.js:17084
  faction: 13,                                             // OG game.js:17085 (Giants = 13)
  radius: 19,                                              // OG game.js:17086
  radiusJitter: 0.05,                                      // OG game.js:17087
  mass: 12,                                                // OG game.js:17088
  iceGrip: 1,                                              // OG game.js:17089
  density: 5,                                              // OG game.js:17090
  deflects: true,                                          // OG game.js:17091
  maxHp: 2200,                                             // OG game.js:17092
  melee: true,                                             // OG game.js:17093
  strength: 6,                                             // OG game.js:17094
  locomotion: 0,                                           // OG game.js:17095 (Holonomic)
  walkSpeed: 46,                                           // OG game.js:17096
  runSpeed: 75,                                            // OG game.js:17097
  maxSpeed: 90,                                            // OG game.js:17098
  accel: 220,                                              // OG game.js:17099
  decel: 220,                                              // OG game.js:17100
  turnRate: 2.2,                                           // OG game.js:17101
  turnSpeedFalloff: Infinity,                              // OG game.js:17102
  sightRange: 320,                                         // OG game.js:17103
  alertSightRange: 340,                                    // OG game.js:17104
  stickyTarget: true,                                      // OG game.js:17105
  reactionTime: 0.5,                                       // OG game.js:17106
  huntRange: Infinity,                                     // OG game.js:17107
  minDistance: 0,                                          // OG game.js:17108
  drilled: false,                                          // OG game.js:17109
  intelligence: 1,                                         // OG game.js:17110 (Animal)
  infectable: true,                                        // OG game.js:17111
  turnsWhenKilled: true,                                   // OG game.js:17112
  flammability: 0.3,                                       // OG game.js:17113
  eyeShot: 0.015,                                          // OG game.js:17114
  brushSpacing: 52,                                        // OG game.js:17115
  flock: {                                                 // OG game.js:17116-17124: Soldier flock (game.js:9940-9948) + overrides
    personalSpace: 1.1, separation: 38, alignment: 0.1, cohesion: 0, formation: 1.2, herd: 0.3, herdSpacing: 14,
    flockByState: [1, 1, 0.3, 1, 0.3, 0.25], formationByState: [0, 1, 0.35, 1, 0, 0], idleSpread: 2.5,
  },
  morale: {                                                // OG game.js:17125: Soldier morale (game.js:9951-9965) + overrides
    baseline: 1, oddsWeight: 0.1, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.08, rallyAt: 0.55, minFleeTime: 2.5, dropRate: 3.2, recoverRate: 0.2, panicFear: 0.5, deathFear: 1,
  },
  look: { attack: { time: 0.6 } },                         // OG game.js:17132

  init(world, u) {                                         // OG game.js:17134-17136
    u.cooldown = 1.5 * world.rng();
    u.b.nextThrow = world.time + 5 * world.rng();
    u.subState = 0; u.role = 0; u.b.timer = 0; u.b.victim = -1; u.b.panicAt = 0;
  },

  brain(world, u) {                                        // OG game.js:17137-17381
    if (u.b.carryTick !== world.tick) G.carry(world, u);  // fallback if the brain system does not call carry
    const b = u.b, now = world.time;
    u.goalX = 0; u.goalY = 0; u.face = NaN; u.stun = 0;   // stun-immune (OG game.js:17139)
    if (ratPanic(world, u)) return;
    if (u.subState === HOLD) {                             // OG game.js:17141-17168: holding a unit overhead
      const e = K.target(world, u);
      if (!e || !held(world, u)) { drop(world, u); return; }
      K.setState(u, K.ST.ENGAGE);
      u.face = Math.atan2(e.y - u.y, e.x - u.x);
      if (now >= b.timer) release(world, u, e);
      return;
    }
    if (u.subState === EAT) { u.face = u.heading; return; }
    if ((u.subState === TREE_WALK || u.subState === TREE_PULL) && treeStep(world, u)) return;
    if (u.subState === STOMP || u.subState === STOMPED) {  // OG game.js:17171-17200
      u.face = u.heading;
      K.setState(u, K.ST.ENGAGE);
      if (u.subState === STOMP && now >= b.timer - 0.3) { u.subState = STOMPED; stompHit(world, u); }
      if (now >= b.timer) u.subState = 0;
      return;
    }
    if (u.subState === SWING) {                            // OG game.js:17201-17239
      u.face = u.heading;
      if (now >= b.timer) { u.subState = 0; swingHit(world, u); }
      return;
    }
    const e = K.target(world, u);
    if (u.state === K.ST.FLEE) { K.flee(world, u, e, G.runSpeed); return; } // OG game.js:17241
    if (u.role === 0 && u.subState === 0 && (world.tick + K.idx(u)) % 30 === 0 && K.hash2(K.idx(u), world.tick) < 0.175 &&
        (!e || K.hypot(e.x - u.x, e.y - u.y) > 140)) {     // OG game.js:17242-17264: look for a tree club
      const tr = nearestTree(world, u);
      if (tr) { u.subState = TREE_WALK; b.victim = tr.id; if (treeStep(world, u)) return; }
    }
    if (!e) {                                              // OG game.js:17265-17277
      if (u.blind === 1) { blindWander(world, u); return; }
      if (K.pursue(world, u, G.walkSpeed, 6)) return;
      K.setState(u, K.ST.IDLE);
      K.roam(world, u, K.DT, G.walkSpeed * ROAM_MUL, ROAM_CROWD);
      return;
    }
    const dx = e.x - u.x, dy = e.y - u.y, w = K.hypot(dx, dy) || 0.001;
    const reach = u.radius + e.radius + 0.8 * (22 + (u.role > 0 ? 10 : 0)); // OG game.js:17281
    if (w > 70 + reach && w < 260 && now >= b.nextThrow && u.los === 1) { // OG game.js:17282-17322: throw
      const p = throwPick(world, u, 110);
      if (p) {
        const px = p.x - u.x, py = p.y - u.y, pd = K.hypot(px, py) || 0.001;
        if (pd - u.radius - p.radius <= 22) grab(world, u, p, HOLD, HOLD_T);
        else {
          K.setState(u, K.ST.ADVANCE);
          u.goalX = (px / pd) * G.walkSpeed; u.goalY = (py / pd) * G.walkSpeed;
          u.face = Math.atan2(py, px);
        }
        return;
      }
    }
    if (e.type === 'anthill' || (e.radius < 0.4 * u.radius && !K.airborne(e) && !(e.climb > 0))) { // OG 17323-17348: stomp
      foot(u, FT);
      if (K.hypot(e.x - FT[0], e.y - FT[1]) > e.radius + 0.6 * u.radius * 0.8) {
        K.setState(u, K.ST.CHARGE);                         // OG sets Charge, then 495.a sets Advance (game.js:17336-17337)
        K.advanceTo(world, u, e, dx, dy, u.los === 1 || K.wallCount(world) === 0, G.walkSpeed);
        return;
      }
      K.setState(u, K.ST.ENGAGE);
      const a = Math.atan2(dy, dx);
      u.face = a;
      if (u.cooldown <= 0 && Math.abs(K.angleDiff(u.heading, a)) < 0.5) {
        u.subState = STOMP; b.timer = now + STOMP_T; u.cooldown = 1.1 * K.range(world, 0.85, 1.15);
      }
      return;
    }
    if (w > reach) {                                       // OG game.js:17350-17361
      K.setState(u, w < 120 ? K.ST.CHARGE : K.ST.ADVANCE); // then 495.a sets Advance, as in OG
      K.advanceTo(world, u, e, dx, dy, u.los === 1 || K.wallCount(world) === 0, w < 120 ? G.runSpeed : G.walkSpeed);
      return;
    }
    K.setState(u, K.ST.ENGAGE);                            // OG game.js:17362-17381: in reach
    const a = Math.atan2(dy, dx);
    u.face = a;
    if (u.cooldown <= 0 && Math.abs(K.angleDiff(u.heading, a)) < 0.5) {
      if (e.mass < 2.5 && e.hurled !== 1 && !K.airborne(e) && world.rng() < 0.2) {
        grab(world, u, e, EAT, EAT_T); u.cooldown = Math.max(u.cooldown, EAT_T + 0.3); return;
      }
      u.attack = 1;
      u.cooldown = 1.5 * K.range(world, 0.85, 1.15);
      u.subState = SWING; b.timer = now + 0.09;
    }
  },

  // OG carry hook (game.js:17383-17435): keep the held unit at the mouth (eat) or overhead (throw).
  carry(world, u) {
    u.b.carryTick = world.tick;
    if (u.subState === EAT) {
      const e = held(world, u);
      if (!e || K.airborne(u) || u.hp <= 0) { drop(world, u); return; }
      const n = pose(world, u) - 2, o = Math.min(1, n / EAT_LIFT), r = Math.max(0, (n - EAT_LIFT) / 0.8);
      const l = u.radius, h = Math.cos(u.heading) >= 0 ? 1 : -1, d = e.def.radius * (1 - 0.65 * r);
      e.radius = d;
      e.x = u.x + h * l * 0.95 * (0.5 + 0.5 * o); e.y = u.y + 1;
      e.vx = u.vx; e.vy = u.vy;
      e.z = e.pz = Math.max(1, o * (l * (2.05 + 0.25 * r) - 2.47 * d));
      e.vz = 0; e.spin = 0; e.stun = Math.max(e.stun || 0, 0.3);
      if (n >= 1) {                                        // swallow (OG game.js:17405-17420)
        u.subState = 0; e.hurled = 0;
        K.hatKnock(world, e, h, -0.3, 0.6);
        K.emit(world, 'puff', { x: u.x + h * u.radius * 1.2, y: u.y - 2.2 * u.radius, size: 0.8, kind: 'smoke' });
        u.hp = Math.min(u.maxHp, u.hp + 160);
        K.eat(world, u, e);
      }
      return;
    }
    if (u.subState !== HOLD) return;
    const e = held(world, u);
    if (!e || K.airborne(u) || u.hp <= 0 || u.target < 0) { drop(world, u); return; }
    e.x = u.x + Math.cos(u.heading) * u.radius * 0.15; e.y = u.y - 1;
    e.vx = u.vx; e.vy = u.vy;
    e.z = e.pz = 2.85 * u.radius * Math.min(1, 1.4 * pose(world, u));
    e.vz = 0; e.spin = 0; e.stun = Math.max(e.stun || 0, 0.3);
  },

  // OG onDamaged (game.js:17436-17443): a blind Giant charges toward whoever hit it for 2.5 s.
  onHit(world, u, amount, src) {
    if (u.blind !== 1 || !src || u.subState !== 0) return;
    u.wander = Math.atan2(src.y - u.y, src.x - u.x) + 0.35 * K.signed(world);
    u.b.timer = world.time + 2.5;
  },
};

// OG D (game.js:17445-17454): animation progress per action.
function pose(world, u) {
  const b = u.b, now = world.time;
  if (u.subState === HOLD) return Math.min(1, 1 - (b.timer - now) / HOLD_T);
  if (u.subState === EAT) return 2 + Math.min(1, Math.max(0, 1 - (b.timer - now) / EAT_T));
  if (u.subState === TREE_PULL) return Math.min(1, Math.max(0, 1 - (b.timer - now) / TREE_PULL_T));
  if (u.subState === STOMP || u.subState === STOMPED) return 3 + Math.min(1, Math.max(0, 1 - (b.timer - now) / STOMP_T));
  const e = now - (u.firedAt ?? -1e9);
  return u.firedAt > 0 && e < THROW_POSE ? 1 + e / THROW_POSE : 0;
}
// OG z (game.js:17455-17460): the unit in hand.
function held(world, u) {
  if (u.subState !== HOLD && u.subState !== EAT) return null;
  const e = K.cur(world, u.b.victim);
  return e && e.hurled === 1 ? e : null;
}
// OG Y (game.js:17461-17467): let go.
function drop(world, u) {
  const e = held(world, u), wasEat = u.subState === EAT;
  u.subState = 0;
  if (e) { e.hurled = 0; if (wasEat) e.radius = e.def.radius; e.z = Math.max(e.z, 1); }
}
function grab(world, u, e, sub, t) {                       // OG game.js:17309-17318, 17366-17376
  u.subState = sub; u.b.victim = e.id; u.b.timer = world.time + t;
  e.hurled = 1; K.unperch(e);
}
// OG game.js:17143-17167: throw at the target, flight time clamp(dist/300, 0.45, 1.1), led by its velocity.
function release(world, u, e) {
  K.emit(world, 'throw', { x: u.x, y: u.y, v: 2, type: u.type });
  const n = held(world, u);
  u.subState = 0;
  if (!n) return;
  const ox = e.x - n.x, oy = e.y - n.y, l = Math.min(1.1, Math.max(0.45, K.hypot(ox, oy) / 300));
  const dx = ox + e.vx * l, dy = oy + e.vy * l;
  n.vx = dx / l; n.vy = dy / l; n.vz = (0.5 * K.GRAVITY * l * l - n.z) / l;
  n.spin = (2 * (dx >= 0 ? 1 : -1) * Math.PI) / l;
  n.thrownAt = world.time;
  n.stun = Math.max(n.stun || 0, l + 0.4);
  u.firedAt = world.time;
  u.b.nextThrow = world.time + 5 * K.range(world, 0.8, 1.2);
  u.cooldown = Math.max(u.cooldown, 0.6);
}
// OG game.js:17201-17239: club sweep. Reach 22 (+10 with a tree club), ±1.1 rad, 75 ± 8 (×1.6 club).
const Q = [];
function swingHit(world, u) {
  const x = u.x, y = u.y, h = u.heading, d = 22 + (u.role > 0 ? 10 : 0), m = u.role > 0 ? 1.6 : 1;
  K.queryMask(world, x, y, u.radius + d + 20, K.enemyMask(u.faction), Q, 32);
  for (let k = 0; k < Q.length; k++) {
    const f = Q[k];
    if (f.hp <= 0) continue;
    const dx = f.x - x, dy = f.y - y, r = K.hypot(dx, dy) || 0.001;
    if (r > u.radius + f.radius + d) continue;
    if (Math.abs(K.angleDiff(h, Math.atan2(dy, dx))) > 1.1) continue;
    const p = K.damage(world, f, (75 + 8 * K.signed(world)) * m, u);
    if (u.kindled === 1) K.igniteNow(world, f, 4);         // flaming club (OG 509.a = 4 s)
    if (f.mass < 2.5 && p > 0.6 && world.rng() < 0.5) K.toss(world, f, dx / r, dy / r, 170 * p, 420 * p);
    else K.knock(world, f, dx / r, dy / r, 260 * p, 0.5 * p);
  }
  const w = u.radius + 0.7 * d, px = x + Math.cos(h) * w, py = y + Math.sin(h) * w;
  K.emit(world, 'puff', { x: px, y: py, size: 2.2, kind: 'dust' });
  K.emit(world, 'blast', { x: px, y: py, r: 34, kind: 3 });
  K.iceImpact(world, px, py, 0.8 * u.radius, K.impactDmg(75 * m));
  K.emit(world, 'strike', { x: px, y: py, v: 2, type: u.type });
}
// OG game.js:17171-17199: stomp at the foot, 0.6 R: 55 dmg (90 to an Anthill), push 120, stun 0.4.
const FT = new Float32Array(2);
function foot(u, out) {                                    // OG game.js:17526-17531
  out[0] = u.x + Math.cos(u.heading) * u.radius * 0.7; out[1] = u.y + Math.sin(u.heading) * u.radius * 0.25; return out;
}
function stompHit(world, u) {
  foot(u, FT);
  const ex = FT[0], ey = FT[1], o = 0.6 * u.radius;
  K.queryMask(world, ex, ey, o + K.MARGIN, K.enemyMask(u.faction), Q, 32);
  for (let k = 0; k < Q.length; k++) {
    const l = Q[k];
    if (l.hp <= 0 || K.airborne(l) || l.climb > 0) continue;
    const dx = l.x - ex, dy = l.y - ey, v = K.hypot(dx, dy) || 0.001;
    if (v > o + l.radius) continue;
    const hill = l.type === 'anthill';
    K.damage(world, l, hill ? 90 : 55, u);
    if (!hill && l.hp > 0) K.knock(world, l, dx / v, dy / v, 120, 0.4);
  }
  K.emit(world, 'puff', { x: ex, y: ey, size: 1.6, kind: 'dust' });
  K.emit(world, 'blast', { x: ex, y: ey, r: 34 * 0.8, kind: 3 });
  K.iceImpact(world, ex, ey, o, K.impactDmg(55));
  K.emit(world, 'trample', { x: ex, y: ey, v: 1.6, type: u.type });
}
// OG game.js:17286-17302: what to throw. Barrel 2, Frog 1 (≤ 110 px gap), any light non-ally 0 (≤ 22 px); −0.01 × gap.
function throwPick(world, u, reach) {
  K.queryMask(world, u.x, u.y, u.radius + reach + K.MARGIN, K.ALL, Q, 32);
  let best = null, bs = -Infinity;
  for (let k = 0; k < Q.length; k++) {
    const o = Q[k];
    if (o === u || o.hp <= 0 || o.hurled === 1 || K.airborne(o)) continue;
    const barrel = o.type === 'barrel', frog = K.FROGS.has(o.type);
    if (frog && K.wetAt(world, o)) continue;
    if (!barrel && !frog && (o.mass >= 2.5 || o.faction === u.faction)) continue;
    const gap = K.hypot(o.x - u.x, o.y - u.y) - u.radius - o.radius;
    if (gap > reach || (gap > 22 && !barrel && !frog)) continue;
    const s = (barrel ? 2 : frog ? 1 : 0) - 0.01 * gap;
    if (s > bs) { bs = s; best = o; }
  }
  return best;
}
// OG game.js:17244-17260: nearest Tree whose edge gap ≤ 110.
function nearestTree(world, u) {
  K.queryMask(world, u.x, u.y, u.radius + TREE_REACH, 1 << K.FAC.Props, Q, 32);
  let o = null, best = Infinity;
  const walled = K.wallCount(world);
  for (let k = 0; k < Q.length; k++) {
    const n = Q[k];
    if (n.type !== 'tree' || n.hp <= 0) continue;
    const c = K.hypot(n.x - u.x, n.y - u.y);
    if (c < best && c - u.radius - n.radius <= TREE_REACH && (walled === 0 || K.lineOfSight(world, u.x, u.y, n.x, n.y))) { best = c; o = n; } // OURS (attack 3): a tree it can see (army/sniper.js TREE_LOS)
  }
  return o;
}
// OG $ (game.js:17492-17525): walk to the tree (≤ 6 px), pull 0.8 s, rip it out as a club.
function treeStep(world, u) {
  const b = u.b, e = K.cur(world, b.victim), n = K.target(world, u);
  const close = n && K.hypot(n.x - u.x, n.y - u.y) < 70;
  if (!e || e.hp <= 0 || e.type !== 'tree' || close) { u.subState = 0; return false; }
  const rx = e.x - u.x, ry = e.y - u.y, d = K.hypot(rx, ry) || 0.001;
  if (u.subState === TREE_WALK) {
    if (K.wallCount(world) > 0 && !K.lineOfSight(world, u.x, u.y, e.x, e.y)) { u.subState = 0; return false; } // OURS (attack 3): sniper.js TREE_LOS
    if (d - u.radius - e.radius > 6) {
      K.setState(u, K.ST.ADVANCE);
      u.goalX = (rx / d) * G.walkSpeed; u.goalY = (ry / d) * G.walkSpeed;
      u.face = Math.atan2(ry, rx);
      return true;
    }
    u.subState = TREE_PULL; b.timer = world.time + TREE_PULL_T;
  }
  K.setState(u, K.ST.ENGAGE);
  u.face = Math.atan2(ry, rx);
  if (world.time < b.timer) return true;
  const lit = e.burning > 0;
  u.role = e.singed !== 1 || lit ? 1 : 2;                  // 1 club, 2 charred club
  if (lit) u.kindled = 1;                                  // flaming club
  for (let k = 0; k < 4; k++) K.emit(world, 'puff', { x: e.x + 8 * K.signed(world), y: e.y + 4 * K.signed(world), ang: world.rng() * Math.PI * 2, size: 0.9, kind: 'dust' });
  K.emit(world, 'treeuproot', { x: e.x, y: e.y, v: 1, type: e.type });
  world.remove(e);
  u.subState = 0;
  return true;
}
// OG game.js:17266-17274: blind with no target: wander at 0.6 walk; charge (run) for 2.5 s after a hit.
function blindWander(world, u) {
  const charging = world.time < u.b.timer;
  K.setState(u, charging ? K.ST.CHARGE : K.ST.ADVANCE);
  if (!charging && world.rng() < 0.02) u.wander += 0.9 * K.signed(world) * 2;
  const n = charging ? G.runSpeed : 0.6 * G.walkSpeed;
  u.goalX = Math.cos(u.wander) * n; u.goalY = Math.sin(u.wander) * n;
}
// OG Z (game.js:17462-17489): rats within r + 60 (r + 150 once panicking) → drop everything and run at 75.
const RV = new Float32Array(2);
function ratPanic(world, u) {
  const b = u.b, now = world.time, p = u.subState === PANIC;
  if (!p && now < b.panicAt) return false;                 // calm window
  if (p && now - b.panicAt > PANIC_MAX) { u.subState = 0; b.panicAt = now + CALM; K.setState(u, K.ST.CHARGE); return false; }
  const n = K.ratsAway(world, u.x, u.y, u.radius + (p ? RAT_R_PANIC : RAT_R), RV);
  if (n === 0) { if (p) u.subState = 0; return false; }
  if (u.subState === HOLD || u.subState === EAT) drop(world, u);
  if (!p) b.panicAt = now;
  u.subState = PANIC;
  K.setState(u, K.ST.FLEE);
  const a = K.hypot(RV[0], RV[1]) || 1;
  u.goalX = (RV[0] / a) * G.runSpeed; u.goalY = (RV[1] / a) * G.runSpeed;
  return true;
}

registerUnit(G);
