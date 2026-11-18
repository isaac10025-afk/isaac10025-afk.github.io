// Necromancer (OG "Necromancer", type 48): never attacks; only seen within 60 px (lurk); keeps corpses that fall while
// it lives; when the field goes quiet (8 s with no blow anywhere, or 1.5 s with no two hostile factions left) it raises
// every corpse within 90 px of the chosen one as skeletons of its side, with a fear burst.
// Rules 1:1 from OG game.js:14789-15107 (our own code). Corpse records are CORE-B's (world.corpses: t, r, side, kept, ...).
import { registerUnit, getDef } from '../../defs.js';
import * as K from './_lib.js';
import { attackHeld, aimAngle } from '../../systems/possess.js';

const SENSE = 300;                                         // OG game.js:14800 (x): enemy awareness / keep-away
const RAISE_R = 90;                                        // OG game.js:14801 (k)
const CAST_T = 1.2;                                        // OG game.js:14802 (A)
const HOP = 260;                                           // OG game.js:14803 (S): escape teleport distance
const HOP_OFFS = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]; // OG game.js:14804 (M)
const CASTING = 1, RAISE_MODE = 1;                         // OG game.js:14810-14811 (_, j)
const KEEP_S = 0.7;                                        // OG game.js:14859, 14864
const HOP_COOLDOWN = 6;                                    // OG game.js:14869, 14985
const FEAR_R = 240, FEAR_BASE = 0.8, FEAR_EACH = 0.05, FEAR_MAX = 1; // OG game.js:15090-15093 (C, F, G, B)

const N = {
  type: 'necro', og: 'Necromancer', ogId: 48,              // OG game.js:14816-14818, id game.js:8500
  category: 'mythical',                                    // OG game.js:14819
  faction: 24,                                             // OG game.js:14820 (Necromancers = 24)
  radius: 8.63,                                            // OG game.js:14821
  radiusJitter: 0.06,                                      // OG game.js:14822
  mass: 1,                                                 // OG game.js:14823
  maxHp: 60,                                               // OG game.js:14824
  melee: false,                                            // OG game.js:14825
  strength: 0.3,                                           // OG game.js:14826
  locomotion: 0,                                           // OG game.js:14827 (Holonomic)
  walkSpeed: 50,                                           // OG game.js:14828
  runSpeed: 100,                                           // OG game.js:14829
  maxSpeed: 120,                                           // OG game.js:14830
  accel: 450,                                              // OG game.js:14831
  decel: 450,                                              // OG game.js:14832
  turnRate: 5,                                             // OG game.js:14833
  turnSpeedFalloff: Infinity,                              // OG game.js:14834
  sightRange: 320,                                         // OG game.js:14835
  alertSightRange: 340,                                    // OG game.js:14836
  stickyTarget: false,                                     // OG game.js:14837
  reactionTime: 0.4,                                       // OG game.js:14838
  huntRange: 0,                                            // OG game.js:14839
  minDistance: 0,                                          // OG game.js:14840
  drilled: false,                                          // OG game.js:14841
  intelligence: 2,                                         // OG game.js:14842 (Trained)
  lurk: 60,                                                // OG game.js:14843: enemies see it only within 60 px
  infectable: false,                                       // OG game.js:14844
  flammability: 0.5,                                       // OG game.js:14845
  brushSpacing: 22,                                        // OG game.js:14846
  flock: {                                                 // OG game.js:14847 = Soldier flock (game.js:9940-9948)
    personalSpace: 1.25, separation: 38, alignment: 0.3, cohesion: 0, formation: 1.2, herd: 0, herdSpacing: 0,
    flockByState: [1, 1, 0.3, 1, 0.3, 0.25], formationByState: [1, 1, 0.35, 1, 0, 0],
  },
  morale: {                                                // OG game.js:14848 = Soldier morale (game.js:9951-9965)
    baseline: 0.82, oddsWeight: 0.55, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.22, rallyAt: 0.55, minFleeTime: 2.5, dropRate: 3.2, recoverRate: 0.2, panicFear: 0.5, deathFear: 1,
  },
  look: { hat: false, attack: { time: 0.3 } },             // OG game.js:14851, 14856

  init(world, u) {                                         // OG game.js:14858-14860
    keepRecent(world, world.time - KEEP_S);
    u.role = 0; u.subState = 0; u.b.hopAt = -6; u.b.timer = 0; u.b.corpse = null; u.b.corpseTime = 0;
  },

  brain(world, u) {                                        // OG game.js:14861-15033
    const b = u.b, now = world.time;
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    keepRecent(world, now - KEEP_S);                       // keep every corpse from the last 0.7 s
    if (u.stun > 0) { u.subState = 0; u.face = u.heading; return; }
    const e = nearestEnemy(world, u, u.x, u.y, SENSE), fleeing = u.state === K.ST.FLEE;
    // Possessed (OURS, Part 2 step 3): no escape teleports and no keeping away (the player moves it); the attack is the
    // raise: while the player attacks, it casts on the bodies in the aim, and a started cast isn't broken by enemies.
    const own = u.possessed === 1;
    if (own) { possessedBrain(world, u, b, now); return; }
    // OURS (PLAN H, systems/march.js): no escape teleports during a stall march, or two necro armies never meet
    if (!(world.marching === 1 && world.marchFac[u.faction] > 0) && e && (fleeing || K.hypot(e.x - u.x, e.y - u.y) < 150) && now - b.hopAt >= HOP_COOLDOWN && escape(world, u, e)) { // OG 14866-14882
      u.subState = 0; return;
    }
    if (fleeing) { u.subState = 0; K.flee(world, u, e, N.runSpeed); return; } // OG game.js:14883
    if (u.subState === CASTING) {                          // OG game.js:14885-14940
      const c = b.corpse;
      if (!(e && K.hypot(e.x - u.x, e.y - u.y) < 120) && raisable(world, c) && K.cTime(c) === b.corpseTime) {
        K.setState(u, K.ST.ENGAGE);
        u.face = Math.atan2(c.y - u.y, c.x - u.x);
        if (now >= b.timer) raise(world, u, c);
        return;
      }
      u.subState = 0;
    }
    if (u.role !== RAISE_MODE && quiet(world)) u.role = RAISE_MODE; // OG game.js:14942-14963
    const s = u.role === RAISE_MODE ? pickCorpse(world, u) : null;  // OG game.js:14964-14980
    if (u.role === RAISE_MODE && !s) u.role = 0;
    if (s) {
      if (K.hypot(s.x - u.x, s.y - u.y) > 120 && now - b.hopAt >= HOP_COOLDOWN && !nearestEnemy(world, u, s.x, s.y, 120)) { // OG 14984-14993
        const ox = u.x - s.x, oy = u.y - s.y, oc = K.hypot(ox, oy) || 1;
        teleport(world, u, s.x + (ox / oc) * 28, s.y + (oy / oc) * 28, u.radius);
      }
      const dx = s.x - u.x, dy = s.y - u.y, r = K.hypot(dx, dy);
      K.setState(u, K.ST.ADVANCE);
      if (r > 320) K.pathTo(world, u, s.x, s.y, N.walkSpeed, K.wallCount(world) === 0 || K.lineOfSight(world, u.x, u.y, s.x, s.y));
      else if (u.cooldown <= 0) {                          // start a 1.2 s cast
        u.subState = CASTING; b.timer = now + CAST_T; b.corpse = s; b.corpseTime = K.cTime(s);
        u.face = Math.atan2(dy, dx);
        K.emit(world, 'raise', { x: s.x, y: s.y, v: 1, type: u.type });
      } else u.face = Math.atan2(dy, dx);
    } else K.setState(u, K.ST.IDLE);
    keepAway(world, u, e);                                 // OG game.js:15012-15033
  },
};

function corpses(world) { return world.corpses || []; }
// OG L (game.js:15040-15047): mark corpses that died at or after time `t` as kept.
function keepRecent(world, t) {
  const cs = corpses(world);
  for (let k = cs.length - 1; k >= 0; k--) {
    const c = cs[k];
    if (c && K.cTime(c) >= t) c.kept = 1;
  }
}
// OG N (game.js:15048-15062): kept, not raised, not eaten, not held by ants, not undead, lying low, has a risen copy.
function raisable(world, c) {
  return !!c && c.kept === 1 && c.raised !== 1 && c.eaten !== 1 && !(c.colony > 0) && c.undead !== 1 && !((c.z || 0) > 4) &&
    K.risenOf(c.type) !== null && world.time >= K.cTime(c);
}
// OG D (game.js:15094-15106): nearest hostile non-prop unit strictly within o of (x, y).
const Q = [];
function nearestEnemy(world, u, x, y, o) {
  K.queryMask(world, x, y, o + K.MARGIN, K.enemyMask(u.faction), Q, 64);
  let f = null, m = o;
  for (let k = 0; k < Q.length; k++) {
    const n = Q[k];
    if (n.hp <= 0 || n.def.prop) continue;
    const r = K.hypot(n.x - x, n.y - y);
    if (r < m) { m = r; f = n; }
  }
  return f;
}
// OG P (game.js:15063-15076): teleport if the spot is inside the field by `edge` and not in a wall.
function teleport(world, u, x, y, edge) {
  if (x < edge || y < edge || x > world.W - edge || y > world.H - edge || (K.wallCount(world) > 0 && K.solidAt(world, x, y))) return false;
  puffs(world, u.x, u.y);
  u.x = u.px = x; u.y = u.py = y; u.vx = u.vy = 0;
  u.b.hopAt = world.time;
  puffs(world, x, y);
  K.emit(world, 'teleport', { x, y, v: 1, type: u.type });
  return true;
}
function puffs(world, x, y) { for (let o = 0; o < 6; o++) K.emit(world, 'puff', { x, y, ang: (o / 6) * Math.PI * 2, size: 0.7 }); }
// OG game.js:14870-14881: 260 px away from the threat, first spot with no enemy within 120 px.
function escape(world, u, e) {
  const n = Math.atan2(u.y - e.y, u.x - e.x);
  for (const o of HOP_OFFS) {
    const x = u.x + Math.cos(n + o) * HOP, y = u.y + Math.sin(n + o) * HOP;
    if (!nearestEnemy(world, u, x, y, 120) && teleport(world, u, x, y, u.radius + 30)) return true;
  }
  return false;
}
// OG game.js:14942-14963: quiet = 8 s since the last blow anywhere; or ≥ 1.5 s and no faction left that is hostile
// to the first living faction found (skeletons, Necromancers, props and Strays ignored).
function quiet(world) {
  const e = world.time - (world.lastBlow ?? -Infinity);
  if (e >= 8) return true;
  if (e < 1.5) return false;
  let first = -1;
  const us = world.units;
  for (let k = 0; k < us.length; k++) {
    const t = us[k];
    if (t.dead || t.removed || t.hp <= 0 || t.skeleton === 1 || t.type === 'necro' || t.def.prop) continue;
    const f = t.faction;
    if (f === K.FAC.Strays) continue;
    if (first < 0) first = f;
    else if (f !== first && K.factionHostile(first, f)) return false;
  }
  return true;
}
// OG game.js:14964-14980: nearest raisable corpse not within 180 px of another Necromancer's cast target.
// The possessed necromancer (OURS): cast on the raisable body nearest the aim (the cursor, or along the aim) within OG's
// 320 px cast reach, while the attack is held; the cast itself is OG's (1.2 s, raise() below).
const AIM_CONE = 0.7, AIM_POINT = 120, CAST_REACH = 320;   // CAST_REACH = OG game.js:14994-14995 (r > 320 walks)
function possessedBrain(world, u, b, now) {
  if (u.subState === CASTING) {
    const c = b.corpse;
    if (raisable(world, c) && K.cTime(c) === b.corpseTime) {
      K.setState(u, K.ST.ENGAGE);
      u.face = Math.atan2(c.y - u.y, c.x - u.x);
      if (now >= b.timer) raise(world, u, c);
      return;
    }
    u.subState = 0;
  }
  if (!attackHeld(world) || u.cooldown > 0) { K.setState(u, K.ST.IDLE); return; }
  const P = world.possess, point = P && P.aimX === P.aimX && P.aimY === P.aimY, aim = aimAngle(world, u), cs = corpses(world);
  let s = null, bd = Infinity;
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (!raisable(world, c)) continue;
    const d = K.hypot(c.x - u.x, c.y - u.y);
    if (d > CAST_REACH) continue;
    let score;
    if (point) { score = K.hypot(c.x - P.aimX, c.y - P.aimY); if (score > AIM_POINT) continue; }
    else { const off = Math.abs(K.angleDiff(aim, Math.atan2(c.y - u.y, c.x - u.x))); if (off > AIM_CONE && d > 30) continue; score = d * (1 + 2 * off); }
    if (score < bd) { bd = score; s = c; }
  }
  if (!s) { K.setState(u, K.ST.IDLE); return; }
  u.subState = CASTING; b.timer = now + CAST_T; b.corpse = s; b.corpseTime = K.cTime(s);   // OG game.js:14996-15000
  u.face = Math.atan2(s.y - u.y, s.x - u.x);
  K.setState(u, K.ST.ENGAGE);
  K.emit(world, 'raise', { x: s.x, y: s.y, v: 1, type: u.type });
}
function pickCorpse(world, u) {
  const cs = corpses(world);
  let best = null, bd = Infinity;
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (!raisable(world, c)) continue;
    const d = K.hypot(c.x - u.x, c.y - u.y);
    if (d >= bd || claimed(world, u, c.x, c.y, 2 * RAISE_R)) continue;
    bd = d; best = c;
  }
  return best;
}
function claimed(world, u, x, y, r) {                      // OG H (game.js:15077-15089)
  const us = world.units;
  for (let k = 0; k < us.length; k++) {
    const t = us[k];
    if (t === u || t.dead || t.removed || t.type !== 'necro' || t.subState !== CASTING || !t.b.corpse) continue;
    if (K.hypot(t.b.corpse.x - x, t.b.corpse.y - y) < r) return true;
  }
  return false;
}
// OG game.js:14898-14936: every raisable corpse within 90 px rises as a skeleton of our side.
function raise(world, u, s) {
  const cs = corpses(world), x0 = s.x, y0 = s.y;
  let n = 0;
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (!raisable(world, c) || K.hypot(c.x - x0, c.y - y0) > RAISE_R) continue;
    const rt = K.risenOf(c.type);
    const f = K.spawnUnit(world, rt, c.x, c.y, -1, K.cFacing(c) > 0 ? 0 : Math.PI, u.team);
    if (!f) break;                                         // pool full
    n++;
    c.raised = 1;
    f.faction = u.faction;
    f.home = u.home; f.homeGen = u.homeGen; f.likeId = u.id;   // team switch 11-17: a skeleton's own side = its necro's
    f.skeleton = 1;
    f.hatless = c.hatless | 0;
    const m = getDef(rt), y = Math.min(K.MAX_R, K.cSize(c)), area = (y / m.radius) ** 2;
    f.radius = y; f.mass = m.mass * area; f.maxHp = f.hp = m.maxHp * area;
    f.curseType = c.curseType ?? null;
  }
  if (n > 0) fearBurst(world, u, x0, y0, n);
  u.subState = 0; u.cooldown = 0.5; u.attack = 1;
}
function fearBurst(world, u, x, y, n) {                    // OG game.js:14922-14935
  const r = Math.min(FEAR_MAX, FEAR_BASE + FEAR_EACH * (n - 1));
  K.queryMask(world, x, y, FEAR_R, K.enemyMask(u.faction), Q, 4096);
  for (let k = 0; k < Q.length; k++) {
    const o = Q[k];
    if (o.hp <= 0 || o.def.prop || K.isUndead(o.def)) continue;
    const d = K.hypot(o.x - x, o.y - y);
    if (d > FEAR_R) continue;
    o.morale = Math.max(0, o.morale - r * (1 - d / FEAR_R));
  }
}
// OG game.js:15012-15033: back away from the nearest enemy within 300 (100 × min(1, (300 − d)/75)); slide along edges.
function keepAway(world, u, e) {
  if (!e) return;
  let nx = u.x - e.x, ny = u.y - e.y;
  const r = K.hypot(nx, ny) || 0.001;
  nx /= r; ny /= r;
  const c = -(u.goalX * nx + u.goalY * ny);
  if (c > 0) { u.goalX += nx * c; u.goalY += ny * c; }
  const l = N.runSpeed * Math.min(1, (SENSE - r) / 75);
  u.goalX += nx * l; u.goalY += ny * l;
  const d = u.radius + 30;
  const fx = (u.x < d && u.goalX < 0) || (u.x > world.W - d && u.goalX > 0);
  const fy = (u.y < d && u.goalY < 0) || (u.y > world.H - d && u.goalY > 0);
  if (fx) { u.goalX = 0; u.goalY = (u.y >= e.y ? 1 : -1) * N.runSpeed; }
  if (fy) { u.goalY = 0; u.goalX = (u.x >= e.x ? 1 : -1) * N.runSpeed; }
  u.face = Math.atan2(-ny, -nx);
}

registerUnit(N);
