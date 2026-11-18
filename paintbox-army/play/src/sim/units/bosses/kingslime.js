// King slime (OURS, Bosses tab, Part 2 step 6) + the slimes it splits into. Owner: BOSSES-SIM.
// Hops like OG's slime (units/mythical/slime.js: rest, take off at the target, land; never edited): a long, high hop
// (z arc), then a short rest. Landing squashes: 30 to everyone within r 50 (pushed out, knocked down); a unit of mass
// <= 2.5 right under it is swallowed (u.inside: 10 hp/s until it dies in there, no body; max 6 inside; they pop out
// alive if the slime dies). At 0 hp it SPLITS into 4 `bigslime` (spawned-only, r 18, hp 600, mass 8, same hop +
// swallow, max 2 inside), each splitting into 4 `slimelet` (r 8, hp 70, mass 1, hop + bite 8). The king is a boss;
// the spawned slimes are normal units of the Bosses side.
// Pose (STEP6.md, same codes for all three): b.act 1 hop -> `hop` (stretched, u.z > 0 along the arc), 2 land ->
// `land` (squashed, 0.25 s); art reads b.inside (count) for dark shapes inside.
import {
  boss, spawnedSlime, initBag, targetOf, setState, act, canAuto, shrug, hittable, grounded, grabbable, knock,
  swallow, releaseAll, insideCount, captivesOf, damage, depthAt, splatNoise, hooks, hypot, STATE, ENEMY, BOSS, WET, LEAP, TAU,
} from './_lib.js';
import { followGroup } from '../../systems/navigation.js';

const T = {
  king: {
    radius: 30, hp: 6000, mass: 30,  // STEP6 size, hp 4000 -> 6000: at 4000 (+ squash 30) it lost to 60 legion
    walk: 30, run: 60,               // px/s (STEP6 "hops 30 / 60": the pace its hops make)
    hop: 75,                         // px: longest hop
    air: 0.55,                       // s in the air per hop
    apex: 34,                        // px: top of the hop
    restMin: 0.4, restMax: 0.75,     // s resting between hops
    squash: 60,                      // landing: damage ... (STEP6 30: it killed 2 of 60 legion in 18 s)
    squashR: 50,                     // ... to everyone within 50 px (+ their radius)
    squashPush: 170,                 // ... pushed out (÷ mass) ...
    squashKnock: 0.4,                // ... knocked down 0.4 s
    swallowMass: 2.5,                // units this light or lighter right under it are swallowed ...
    under: 1,                        // ... "right under" = within its radius (+ theirs x 0.5)
    maxInside: 6,                    // ... at most 6 inside
    digest: 10,                      // hp/s to each unit inside (dealt every 0.5 s)
    split: 'bigslime',               // what it splits into at 0 hp ...
    splits: 4,                       // ... how many
    splitHop: 55,                    // px: the pieces fly apart in a first hop this long
  },
  bigslime: {
    radius: 18, hp: 600, mass: 8,    // STEP6 size
    walk: 35, run: 70,
    hop: 55, air: 0.45, apex: 22, restMin: 0.35, restMax: 0.65,
    squash: 20, squashR: 30, squashPush: 110, squashKnock: 0.3,
    swallowMass: 2.5, under: 0.85, maxInside: 2, digest: 10,
    split: 'slimelet', splits: 4, splitHop: 40,
  },
  slimelet: {
    radius: 8, hp: 70, mass: 1,      // STEP6 size
    walk: 50, run: 110,
    hop: 40, air: 0.32, apex: 12, restMin: 0.3, restMax: 0.6,
    bite: 8,                         // landing next to an enemy (gap < 6 px): bite 8 (+ a small shove)
    biteGap: 6,
    swallowMass: 0, maxInside: 0, split: null, splits: 0,
  },
  landPose: 0.25,                    // s of the land pose
  idleHop: 22,                       // px: no target -> a little bounce (OG slime 21.7)
  lead: 1,                           // x its air time: it hops at where its target will be (aiming at where it was missed every kiting rifleman)
};
const HOP = 1, LAND = 2;   // b.act codes (STEP6.md)
const SQ = new Array(96), CAPS = new Array(8);

function S(u) { return u.def.slime; }
function takeoff(w, u, dx, dy, len) {
  const b = u.b, s = S(u), d = hypot(dx, dy);
  const L = d > 0.001 ? Math.min(len, s.hop * u.shrink) : 0, v = L / s.air;
  b.hvx = d > 0.001 ? dx / d * v : 0; b.hvy = d > 0.001 ? dy / d * v : 0;
  b.hopping = 1; b.hopT = w.time;
  u.leaping = LEAP.FLY; u.vx = b.hvx; u.vy = b.hvy; u.goalX = b.hvx; u.goalY = b.hvy;
  if (d > 0.001) u.heading = Math.atan2(dy, dx);
  act(w, u, HOP);
}
function land(w, u) {
  const b = u.b, s = S(u);
  b.hopping = 0; u.leaping = 0; u.z = 0; u.vz = 0; u.vx = 0; u.vy = 0; u.goalX = 0; u.goalY = 0;
  b.next = w.time + s.restMin + (s.restMax - s.restMin) * w.rng();
  act(w, u, LAND);
  const wet = w.waterCells > 0 && depthAt(w, u.x, u.y) >= WET;
  w.emit(wet ? 'splash' : 'hop', { x: u.x, y: u.y, v: u.radius / 13, type: u.type });
  if (s.maxInside > 0) { gulp(w, u); squash(w, u); }
  else nip(w, u);
  if (u.mass >= 8 && hooks.iceHarm) hooks.iceHarm(w, u.x, u.y, u.radius, u.mass / 15, 0.5);
}
// Units of mass <= 2.5 right under it go inside (up to the max).
function gulp(w, u) {
  const b = u.b, s = S(u);
  let room = s.maxInside - insideCount(w, u);
  if (room <= 0) return;
  const n = w.queryMask(u.x, u.y, u.radius + BOSS.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (room <= 0 || !hittable(u, o) || !grabbable(o, s.swallowMass)) continue;
    if (hypot(o.x - u.x, o.y - u.y) > u.radius * s.under + o.radius * 0.5) continue;
    if (swallow(w, u, o, s.maxInside - room)) { room--; b.victim = o.id; }
  }
  b.inside = insideCount(w, u);
}
function squash(w, u) {
  const s = S(u), R = s.squashR * u.shrink;
  const n = w.queryMask(u.x, u.y, R + BOSS.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (!hittable(u, o) || !grounded(o) || o.def.prop) continue;
    if (hypot(o.x - u.x, o.y - u.y) > R + o.radius) continue;
    damage(w, o, s.squash, u, undefined, o.x, o.y);   // from above: shields don't help
    if (o.hp > 0) knock(w, o, u.x, u.y, s.squashPush, s.squashKnock);
  }
  splatNoise(w, u.x, u.y, 0.8, 260);
  u.attack = 1;
  w.emit('strike', { x: u.x, y: u.y, v: u.radius / 13, type: u.type });
}
// Slimelet: bite the nearest enemy it landed next to (OG slime landing hit, gap < 6).
function nip(w, u) {
  const s = S(u);
  const n = w.queryMask(u.x, u.y, u.radius + BOSS.MARGIN + s.biteGap, ENEMY[u.faction], SQ, SQ.length);
  let o = null, best = Infinity;
  for (let k = 0; k < n; k++) {
    const c = SQ[k]; SQ[k] = null;
    if (!hittable(u, c) || c.def.prop || c.z > 12) continue;
    const gap = hypot(c.x - u.x, c.y - u.y) - u.radius - c.radius;
    if (gap < s.biteGap && gap < best) { best = gap; o = c; }
  }
  u.attack = 1;
  if (!o) return;
  const pass = damage(w, o, s.bite, u);
  if (o.hp > 0) knock(w, o, u.x, u.y, 60 * pass, 0.1 * pass);
  w.emit('strike', { x: o.x, y: o.y, v: 0.6, type: u.type });
}
// Everything inside takes digest hp/s (every 0.5 s); the count for the art.
function digest(w, u) {
  const b = u.b, s = S(u);
  if (s.maxInside === 0 || w.time < b.t1) return;
  b.t1 = w.time + 0.5;
  const n = captivesOf(w, u, CAPS);
  for (let k = 0; k < n; k++) {
    const v = w.unitById(CAPS[k]); CAPS[k] = -1;
    if (v && v.hp > 0 && v.inside === u.id) damage(w, v, s.digest * 0.5, u, 'eaten');
  }
  b.inside = insideCount(w, u);
  if (b.victim >= 0 && !(w.unitById(b.victim))) b.victim = -1;
}

function brain(w, u) {
  const b = u.b, s = S(u), now = w.time;
  if (u.def.boss) shrug(w, u);
  u.face = NaN;
  digest(w, u);
  if (b.act === LAND && now - b.actT > T.landPose) act(w, u, 0);
  if (b.hopping) {
    if (u.vz > 1 || u.leaping !== LEAP.FLY) { b.hopping = 0; u.leaping = 0; act(w, u, 0); return; }   // knocked out of its hop (tossed)
    const f = (now - b.hopT) / s.air;
    if (f < 1 - 1e-6) { u.z = 4 * s.apex * u.shrink * f * (1 - f); u.vx = b.hvx; u.vy = b.hvy; u.goalX = b.hvx; u.goalY = b.hvy; return; }
    land(w, u);
  }
  u.goalX = 0; u.goalY = 0;
  if ((!u.def.boss && u.stun > 0) || now < b.next) return;
  if (u.possessed === 1 && !canAuto(w, u)) { takeoff(w, u, 0, 0, 0); return; }   // possessed: possessMove aims this hop
  const t = targetOf(w, u);
  if (t) {
    const lx = t.x + t.vx * s.air * T.lead, ly = t.y + t.vy * s.air * T.lead;   // where it will be when it comes down
    const dx = lx - u.x, dy = ly - u.y, d = hypot(dx, dy);
    setState(u, d < s.hop + u.radius + t.radius ? STATE.ENGAGE : STATE.ADVANCE);
    takeoff(w, u, dx, dy, Math.max(8, d));   // lands on it when it can
    return;
  }
  if (followGroup(w, u, s.run, 6)) { takeoff(w, u, u.goalX, u.goalY, s.hop); return; }
  setState(u, STATE.IDLE);
  const a = w.rng() * TAU;
  takeoff(w, u, Math.cos(a), Math.sin(a), T.idleHop);
}

// Split at 0 hp into `splits` smaller slimes that fly apart in a first hop; whatever was inside pops out alive.
function onDeath(w, u) {
  const s = S(u);
  releaseAll(w, u, true);
  u.b.inside = 0;
  if (!s.split || s.splits <= 0) return;
  u.eaten = 1;   // it became the pieces: no body
  const g = w.createGroup(s.split, u.team), a0 = w.rng() * TAU;
  let first = null;
  for (let k = 0; k < s.splits; k++) {
    const a = a0 + k * TAU / s.splits + 0.3 * (w.rng() - w.rng()), r = u.radius * 0.5;
    const c = w.spawn(s.split, u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, { group: g >= 0 ? g : -1, team: u.team, heading: a, faction: u.faction, like: u });
    if (!c) break;
    takeoff(w, c, Math.cos(a), Math.sin(a), s.splitHop);
    c.b.hopT = w.time - 0.05;
    if (!first) first = c;
  }
  if (g >= 0) w.releaseGroup(g);
  if (first && u.possessed === 1) w.handOver(u, first);   // the player goes on as one of the pieces
  w.emit('split', { x: u.x, y: u.y, v: u.radius / 13, type: u.type });
}

// Shared def pieces for all three.
function common(kind) {
  const s = T[kind];
  return {
    radius: s.radius, mass: s.mass, maxHp: s.hp,
    walkSpeed: s.walk, runSpeed: s.run, maxSpeed: 260, accel: 3000, decel: 3000,
    hopper: true,   // OG slime rule: no sliding or shoving on the ground; it moves only by hopping
    slime: s,
    init(w, u) {
      initBag(u);
      const b = u.b;
      b.hopping = 0; b.hopT = -1; b.hvx = 0; b.hvy = 0; b.inside = 0;
      b.next = w.time + 0.2 + 0.4 * w.rng();
    },
    onDeath,
    // possessed: the stick aims each hop at takeoff (stick let go: a bounce on the spot); attacking with an enemy
    // picked: its own hop at it. The hop keeps its line in the air.
    possessMove(w, u, mx, my, firing) {
      const b = u.b;
      if (!b.hopping) { u.goalX = 0; u.goalY = 0; return; }
      if (b.hopT === w.time && !(firing && u.target >= 0)) {
        const m = hypot(mx, my), sp = m > 0 ? S(u).hop * u.shrink * Math.min(1, m) / S(u).air : 0;
        b.hvx = m > 0 ? mx / m * sp : 0; b.hvy = m > 0 ? my / m * sp : 0;
      }
      u.goalX = b.hvx; u.goalY = b.hvy; u.vx = b.hvx; u.vy = b.hvy;
    },
    // attack held at nobody: the next hop is a squash on the spot (the land pose plays when it comes down)
    possessFire(w, u) { if (!u.b.hopping && w.time >= u.b.next) takeoff(w, u, 0, 0, 0); },
    brain,
  };
}

boss({
  type: 'kingslime', og: 'King slime (ours)',   // ours (no OG unit): the name is for tracing only
  strength: 25, intelligence: 0, flammability: 0.15, density: 1, turnRate: 6,
  ...common('king'),
});
spawnedSlime({
  type: 'bigslime', og: 'Big slime (ours)',     // spawned only (the king slime splits into 4)
  strength: 3,
  ...common('bigslime'),
});
spawnedSlime({
  type: 'slimelet', og: 'Slimelet (ours)',      // spawned only (a big slime splits into 4)
  strength: 0.5,
  ...common('slimelet'),
});

export { T };
