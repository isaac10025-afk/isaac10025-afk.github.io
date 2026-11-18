// Bee (OURS, Part 2 step 6): a tiny low flyer (z 12) in swarms. Crosses walls and water; melee CAN reach it, shots too
// (it's just very small). Sting: 6 + poison 2 hp/s for 3 s (stacks up to 3, _lib.js). Swarm: each bee buzzes round its
// target on its own orbit angle and darts in to sting when its sting is ready, so a swarm is a pulsing cloud round the
// victim, not one pile (flyers skip steering's neighbour push: this costs no neighbour scans). Never breaks (a swarm).
// Burns easily (flammability 1: fire jumps through a swarm). Webbed: drops and sits on the ground (still stings what
// touches it), takes off when the web lets go. Hive bees (beehive.js) carry b.home = the hive id and hover round it idle.
// Owner: BUGS-SIM. Pose codes (STEP6.md): b.act 1 sting → `sting`; flying → `fly0`/`fly1` (art).
import {
  bug, initBag, targetOf, act, setState, fleeing, bite, poison, perchOf, high, flyUpkeep, flyTo, flyIdle, nearestReachable, unitOf,
  hypot, STATE, LEAP,
} from './_lib.js';

const T = {
  radius: 3.5,        // OG-raw radius (registerUnit ×1.1)
  hp: 12,
  mass: 0.15,
  speed: 180,         // px/s flying
  flyH: 12,           // px: flying height (a low flyer: melee reaches it)
  sting: 6,           // damage per sting (+ one poison stack when it gets through)
  stingEvery: 1,      // s between stings
  reach: 3,           // px past both bodies: close enough to sting
  push: 6,            // a sting barely shoves
  pose: 0.2,          // s of the `sting` pose
  orbit: 9,           // px past the victim's body: the swarm buzzes round it this far out ...
  orbitVar: 6,        // ... ± this much (each bee its own wobble)
  spin: 2.6,          // rad/s round the victim (half the swarm each way)
  swarmAt: 70,        // px: farther than this it flies straight in
  weave: 110,         // px/s: side-to-side buzz on the way in ...
  weaveHz: 13,        // ... rad/s (a zig every quarter second)
  weaveIn: 40,        // px: the zigzag fades out this close to the victim (it still lands its sting)
  rescan: 12,         // ticks between looks for a reachable enemy when its target is up out of reach
};

function sting(w, u, t) {
  const v = perchOf(w, t), pass = bite(w, u, t, T.sting, T.stingEvery, T.push, 0);
  if (pass >= 0.5) poison(w, v, u);
  act(w, u, 1);
}

// its own pick when its target is up out of reach: kept while it stays reachable, else a fresh look now and then
function reachable(w, u) {
  let p = unitOf(w, u.b.prey);
  if (!p || !(p.hp > 0) || high(p)) p = (w.tick + u.index) % T.rescan === 0 ? nearestReachable(w, u, u.def.sightRange) : null;
  u.b.prey = p ? p.id : -1;
  return p;
}

// the buzz: a quick side-to-side zigzag on the way in (a gunner leading a bee by its speed mostly misses it)
function weave(u, ux, uy, now, d) {
  const k = T.weave * Math.min(1, (d - u.radius) / T.weaveIn) * Math.sin(now * T.weaveHz + u.index * 1.7);
  u.goalX -= uy * k; u.goalY += ux * k;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if (u.inside >= 0) return;                // swallowed: the swallower moves it
  const down = flyUpkeep(w, u, T.flyH);
  if (u.stun > 0) { u.face = u.heading; return; }
  let t = targetOf(w, u);
  if (t && high(t)) t = reachable(w, u);   // a ptero / jetpack up high: out of reach, something it can sting instead
  if (fleeing(w, u, t)) return;
  if (!t) {
    if (down) return;
    const hive = unitOf(w, b.home);
    if (hive && hive.hp > 0) { u.homeX = hive.x; u.homeY = hive.y - 6; }
    flyIdle(w, u, T.speed);
    return;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, reach = u.radius + t.radius + T.reach;
  setState(u, d < T.swarmAt ? STATE.ENGAGE : STATE.CHARGE);
  u.face = Math.atan2(dy, dx);
  if (d <= reach && u.cooldown <= 0) sting(w, u, t);
  if (down) return;                         // webbed on the ground: turns and stings only
  if (d > T.swarmAt || u.cooldown <= 0) { flyTo(u, t.x, t.y, T.speed); weave(u, dx / d, dy / d, now, d); return; }   // far, or sting ready: in
  // buzz round it on its own orbit until the sting is ready again
  const a = u.index * 2.39996 + now * T.spin * (u.index & 1 ? 1 : -1), R = t.radius + T.orbit + T.orbitVar * Math.sin(now * 3 + u.index);
  flyTo(u, t.x + Math.cos(a) * R, t.y + Math.sin(a) * R, T.speed);
}

bug({
  type: 'bee', og: 'Bee (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.2,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 260, accel: 1400, decel: 1400, turnRate: 14,
  sightRange: 260, alertSightRange: 320, reactionTime: 0.1, flammability: 1,
  flies: true,        // a flyer (low: melee reaches it)
  lowFlyer: true,     // STEP6: z 12, crosses walls and water
  swarms: true,       // perception: piles onto a victim with others (doesn't shy off a crowded one)
  brushSpacing: 7,    // a tight swarm from one stroke
  flock: { separation: 8, personalSpace: 1, herd: 0 },
  morale: { baseline: 1, canBreak: false, oddsWeight: 0, fearWeight: 0, woundWeight: 0, hitShock: 0 },   // a swarm never breaks
  look: { attack: { time: 0.2 } },
  init(w, u) { initBag(w, u); u.leaping = LEAP.FLY; u.z = u.pz = 0.5 * T.flyH; u.cooldown = w.rng() * T.stingEvery; },
  brain,
});
export { T };
