// Frog (OG "Frog", type 24): the Mage's curse result. Never painted. Spreads the Zombie def like OG.
// Hops, flees to water, tongue-grabs small prey (bugs, slimes, or anything once big); the Zombie Frog bites.
// Rules 1:1 from OG game.js:15766-16069 (our own code).
import './zombie.js';
import { registerUnit, getDef } from '../../defs.js';
import * as K from './_lib.js';
import { ALL_MASK, F, maskWithout } from '../../factions.js';
import { attackHeld, aimAngle } from '../../systems/possess.js';

const AIR = 0.32;                                          // OG 574.c = slime air time (game.js:15138), used game.js:15833
const RAW_R = 7.5;                                         // OG game.js:15790 (bt.radius, raw), size factor Et = radius / 7.5
const TONGUE_SEEK = 220;                                   // OG game.js:15773 (ot)
const TONGUE_SPEED = 700;                                  // OG game.js:15774 (ct)
const RETRACT = 0.15;                                      // OG game.js:15775 (lt)
const EAT_REST = 1;                                        // OG game.js:15776 (ht)
const S_EXTEND = 1, S_PULL = 2, S_MISS = 3, S_EAT = 4;     // OG game.js:15777-15780 (ut, ft, pt, mt)
const MOUTH = 1.2, HOLD_H = 1.05;                          // OG game.js:15781 (gt), 15782 (vt)
const SIZE_LIMIT = 0.75;                                   // OG game.js:15771 (st)
const FLEE_R = 70, WET_SEEK = 200;                         // OG game.js:15902, 16061 (St)
const NON_PROPS = maskWithout(ALL_MASK, F.Props);          // OG game.js:15770 (at): every faction but Props (OURS 11-15: all 35, was OG's 27)
const POSSESS_CONE = 0.7;                                  // OURS: a possessed frog's tongue goes at prey this far off the aim

const zombie = getDef('zombie');
const zraw = { ...zombie, radius: zombie.ogRadius, brushSpacing: zombie.ogBrushSpacing };
delete zraw.ogRadius; delete zraw.ogBrushSpacing;

const FROG = {
  ...zraw,                                                 // OG game.js:15782 (...O.a): Zombie def
  init: undefined, brain: undefined,
  type: 'frog', og: 'Frog', ogId: 24,                      // OG game.js:15783-15785, id game.js:8478
  swims: true,                                             // OG game.js:15786
  waterPace: 1.4,                                          // OG game.js:15787
  faction: 9,                                              // OG game.js:15788 (Props = 9)
  unpaintable: true,                                       // OG game.js:15789
  radius: 7.5,                                             // OG game.js:15790
  radiusJitter: 0.05,                                      // OG game.js:15791
  mass: 0.5,                                               // OG game.js:15792
  density: 0.3,                                            // OG game.js:15793
  maxHp: 40,                                               // OG game.js:15794
  melee: false,                                            // OG game.js:15795
  strength: 0,                                             // OG game.js:15796
  walkSpeed: 40,                                           // OG game.js:15797
  runSpeed: 90,                                            // OG game.js:15798
  maxSpeed: 140,                                           // OG game.js:15799
  accel: 800,                                              // OG game.js:15800
  decel: 800,                                              // OG game.js:15801
  turnRate: 8,                                             // OG game.js:15802
  sightRange: 0,                                           // OG game.js:15803
  alertSightRange: 0,                                      // OG game.js:15804
  stickyTarget: false,                                     // OG game.js:15805
  reactionTime: 0,                                         // OG game.js:15806
  huntRange: 0,                                            // OG game.js:15807
  minDistance: 0,                                          // OG game.js:15808
  intelligence: 1,                                         // OG game.js:15809 (Animal)
  infectable: true,                                        // OG game.js:15810
  hopper: true,                                            // OG game.js:15811
  flammability: 0.3,                                       // OG game.js:15812
  brushSpacing: 14,                                        // OG game.js:15813
  flock: { ...zombie.flock, alignment: 0, cohesion: 0, herd: 0 }, // OG game.js:15814
  look: { attack: { time: 0.2 } },                         // OG game.js:15821

  init(world, u) {                                         // OG game.js:15823-15825
    u.b.hopStart = -1;
    u.b.timer = world.time + 0.35;
    u.wander = world.rng() * Math.PI * 2;
    u.subState = 0; u.b.link = -1; u.b.linkAt = 0; u.b.aimX = 0; u.b.aimY = 0; u.b.heldR = 0; u.b.preyHop = 0;
  },

  // Possessed (OURS, Part 2 step 3): at takeoff the hop goes where the stick points (OG hop length, OG rest between
  // hops); stick let go = a hop on the spot.
  possessMove(world, u, mx, my, firing) {
    const b = u.b;
    if (b.hopStart !== world.time || b.timer !== world.time) return;     // only on the tick it takes off
    if (firing && b.preyHop === 1) return;                                // attacking: its own hop at the prey
    const m = K.hypot(mx, my);
    const v = m > 0 ? (26 * Et(u) * Math.min(1, m) * (K.wetAt(world, u) && u.def.waterPace !== undefined ? u.def.waterPace : 1)) / AIR : 0;
    u.vx = u.goalX = m > 0 ? (mx / m) * v : 0;
    u.vy = u.goalY = m > 0 ? (my / m) * v : 0;
    if (m > 0) u.wander = Math.atan2(my, mx);
  },

  brain(world, u) {                                        // OG game.js:15826-15935
    if (u.b.carryTick !== world.tick) FROG.carry(world, u); // fallback if the brain system does not call carry
    const b = u.b, now = world.time, undead = K.isUndead(u.def);
    u.face = NaN;
    if (b.timer <= b.hopStart) {                           // mid-hop
      if (now - b.hopStart < AIR) return;
      u.leaping = 0; u.vx = u.vy = 0;
      b.timer = now + 0.35 + 0.6 * world.rng();            // OG game.js:15836: rest
      if (undead && (u.possessed !== 1 || attackHeld(world))) landBite(world, u); // OG game.js:15837-15847 (possessed: only while attacking)
    }
    u.goalX = 0; u.goalY = 0;
    K.setState(u, K.ST.IDLE);
    if (u.subState !== 0) return;                          // tongue busy
    // possessed (OURS): the tongue goes only while the player attacks, at prey in the aim
    const f = undead ? null : u.possessed === 1 ? (attackHeld(world) ? tonguePrey(world, u, aimAngle(world, u)) : null) : tonguePrey(world, u); // OG game.js:15850-15862
    if (f && u.stun <= 0) {
      const dx = f.x - u.x, dy = f.y - u.y;
      u.heading = Math.atan2(dy, dx);                      // OG game.js:15866
      mouth(u, MP);
      if (K.hypot(f.x - MP[0], f.y - MP[1]) - f.radius <= 3.6 * u.radius) { // OG game.js:15867-15872
        if (u.cooldown <= 0) { u.subState = S_EXTEND; b.link = f.id; b.linkAt = now; u.attack = 1; }
        return;
      }
    }
    if (u.stun > 0 || now < b.timer) return;               // OG game.js:15886
    let a = u.wander + 1.2 * K.signed(world), m = 0;       // OG game.js:15887-15888
    if (f) {
      a = Math.atan2(f.y - u.y, f.x - u.x) + 0.25 * K.signed(world);
      m = K.hypot(f.x - u.x, f.y - u.y);
    } else if (undead) {                                   // Zombie Frog: hop at enemies within 200 px
      const e = K.findNearest(world, u.x, u.y, 200, K.enemyMask(u.faction));
      if (e) { a = Math.atan2(e.y - u.y, e.x - u.x) + 0.3 * K.signed(world); m = K.hypot(e.x - u.x, e.y - u.y); }
    } else {                                               // hop away from non-Props within 70 px, keep to water
      const e = K.findNearest(world, u.x, u.y, FLEE_R, NON_PROPS);
      if (e && e !== u) a = Math.atan2(u.y - e.y, u.x - e.x) + 0.5 * K.signed(world);
      if (K.waterCells(world) > 0) {
        const e2 = 26 * Et(u);
        if (K.wetAt(world, u)) {
          for (let t = 0; t < 6 && K.depthAt(world, u.x + Math.cos(a) * e2, u.y + Math.sin(a) * e2) < K.WET; t++) a += Math.PI / 3; // OG game.js:15908 (r.d = 467.d = 0.05)
        } else if (K.nearestWet(world, u.x, u.y, WET_SEEK, MP)) {
          a = Math.atan2(MP[1] - u.y, MP[0] - u.x) + 0.3 * K.signed(world);
          m = K.hypot(MP[0] - u.x, MP[1] - u.y);
        }
      }
    }
    let v = 26 * Et(u) * (K.wetAt(world, u) && u.def.waterPace !== undefined ? u.def.waterPace : 1), leap = K.LEAP_HOP; // OG game.js:15915-15918
    if (K.wallCount(world) > 0) {                          // OG game.js:15919-15925
      let e = K.vault(world, u, Math.cos(a), Math.sin(a), v, Math.max(v, m));
      if (e.round) {
        a += (world.rng() < 0.5 ? -1 : 1) * Math.PI * (0.5 + 0.5 * world.rng());
        e = K.vault(world, u, Math.cos(a), Math.sin(a), v, v);
      }
      v = e.reach; leap = e.vault ? K.LEAP_VAULT : K.LEAP_HOP;
    }
    u.wander = a;
    b.preyHop = f ? 1 : 0;                                 // OURS (possess): this hop goes at prey
    const sp = v / AIR;
    u.vx = u.goalX = Math.cos(a) * sp;
    u.vy = u.goalY = Math.sin(a) * sp;
    b.hopStart = now; b.timer = now;
    u.leaping = leap;
  },

  // Tongue (OG carry hook, game.js:15936-16005): runs every tick before the brain.
  carry(world, u) {
    const b = u.b;
    b.carryTick = world.tick;
    const e = u.subState;
    if (e === 0) return;
    const now = world.time, o = now - b.linkAt;
    const r0 = K.cur(world, b.link), r = r0 && r0.hp > 0 ? r0 : null;
    if (e === S_EAT || e === S_MISS) { if (o >= (e === S_EAT ? EAT_REST : RETRACT)) u.subState = 0; return; }
    if (u.hp <= 0 || u.hurled === 1 || K.airborne(u) || u.stun > 0) {
      if (e === S_PULL && r) { r.hurled = 0; r.radius = b.heldR || r.def.radius; b.heldR = 0; r.z = Math.max(r.z, 1); }
      u.subState = 0; return;
    }
    mouth(u, MP);
    const c = u.radius;
    if (e === S_EXTEND) {
      const reach = o * TONGUE_SPEED, max = 4.2 * c;
      const gap = r ? K.hypot(r.x - MP[0], r.y - MP[1]) - r.radius : Infinity;
      if (r && reach >= gap && gap <= max && canGrab(world, u, r)) {   // hit: start pulling
        u.subState = S_PULL; b.linkAt = now; b.aimX = r.x; b.aimY = r.y;
        r.hurled = 1; b.heldR = r.radius;
        K.emit(world, 'tongue', { x: r.x, y: r.y, v: Et(u), type: u.type });
      } else if (!r || reach >= max) {                     // miss: retract
        const tx = r ? r.x : b.aimX, ty = r ? r.y : b.aimY, d = K.hypot(tx - MP[0], ty - MP[1]) || 1, h = Math.min(reach, max, d);
        b.aimX = MP[0] + ((tx - MP[0]) / d) * h; b.aimY = MP[1] + ((ty - MP[1]) / d) * h;
        u.subState = S_MISS; b.linkAt = now; u.cooldown = 1.25;
      } else if (r) { b.aimX = r.x; b.aimY = r.y; }
      return;
    }
    if (!r) { u.subState = 0; return; }                    // pulling
    const h = Math.min(1, o / 0.35), s = h * h, f = b.heldR || r.def.radius;
    r.radius = f * (1 - 0.5 * Math.max(0, (s - 0.7) / 0.3));
    r.x = b.aimX + (MP[0] - b.aimX) * s;
    r.y = b.aimY + (MP[1] + 1 - b.aimY) * s;
    r.z = r.pz = Math.max(1, s * (c * HOLD_H - r.radius) + Math.sin(Math.PI * s) * c * 0.5);
    r.vx = r.vy = r.vz = 0; r.spin = 0;
    r.stun = Math.max(r.stun || 0, 0.3);
    if (h < 1) return;
    K.eat(world, u, r);                                    // OG game.js:16000
    u.hp = Math.min(u.maxHp, u.hp + 0.25 * u.maxHp);
    u.subState = S_EAT; b.linkAt = now;
    u.cooldown = EAT_REST + 2.5;
  },
};

function Et(u) { return u.radius / RAW_R; }                // OG game.js:16067-16069
const MP = new Float32Array(2);
function mouth(u, out) {                                   // OG game.js:16006-16010
  const s = Math.cos(u.heading) >= 0 ? 1 : -1;
  out[0] = u.x + s * u.radius * MOUTH; out[1] = u.y;
}
// OG game.js:16012-16030: prey a frog's tongue can take.
function canGrab(world, u, e) {
  const d = e.def, slime = K.SLIMES.has(e.type);
  if (d.bug !== true && !slime && Et(u) < 1.8) return false;
  const lim = d.bug === true ? Math.max(SIZE_LIMIT, 0.85) : slime ? Math.max(SIZE_LIMIT, 1) : SIZE_LIMIT;
  return e !== u && !e.removed && e.hp > 0 && e.hurled !== 1 && e.radius <= u.radius * lim &&
    !d.prop && !d.boss && !d.untossable && !d.aquatic && !(e.climb > 0) && !K.airborne(e);
}
const Q = [];
function tonguePrey(world, u, aim = NaN) {                 // OG game.js:15852-15862 (aim: OURS, possessed frog)
  K.queryMask(world, u.x, u.y, TONGUE_SEEK, K.ALL, Q, 64);
  let o = null, best = TONGUE_SEEK;
  for (let k = 0; k < Q.length; k++) {
    const n = Q[k];
    if (!canGrab(world, u, n)) continue;
    if (aim === aim && Math.abs(K.angleDiff(aim, Math.atan2(n.y - u.y, n.x - u.x))) > POSSESS_CONE) continue;
    const l = K.hypot(n.x - u.x, n.y - u.y);
    if (l < best) { best = l; o = n; }
  }
  return o;
}
// Zombie Frog landing bite (OG game.js:15838-15846): 7 × Et² dmg, infection 0.35 × pass.
function landBite(world, u) {
  const e = K.findNearest(world, u.x, u.y, u.radius + 5 + K.MARGIN, K.enemyMask(u.faction));
  if (!e || K.hypot(e.x - u.x, e.y - u.y) > u.radius + e.radius + 5) return;
  const n = Et(u), o = K.perch(world, e);
  const m = K.damage(world, o, 7 * n * n, u);
  K.infect(world, o, u, 0.35 * m, 0);
  K.emit(world, 'strike', { x: u.x, y: u.y, v: n, type: u.type });
  u.attack = 1;
}

registerUnit(FROG);
