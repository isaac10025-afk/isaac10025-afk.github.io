// Crab (OURS, Part 2 step 6): a red crab, land and water. Pinches every 0.5 s, and the pinched unit moves at half
// speed for 1 s (the oceanSlow status in _lib.js scales its goal, so it works on any unit, the player's too).
// Swims 90 in water, never drowns. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 pinch (claw shut, 0.25 s); swimming → `swim` (b.swim = 1 in deep water).
import {
  sea, initBag, prelude, targetOf, act, setState, hunt, idle, fleeing, bite, slowUntil, perchOf, hypot, angleDiff, STATE,
} from './_lib.js';

const T = {
  radius: 7,          // OG-raw radius (registerUnit ×1.1)
  hp: 80,             // hit points
  mass: 1,            // a person's weight
  walk: 55,           // px/s walking on land
  run: 110,           // px/s running on land (closing in)
  swim: 90,           // px/s in water (waterPace = swim / run)
  pinch: 10,          // damage per pinch ...
  pinchEvery: 0.5,    // ... every 0.5 s
  reach: 5,           // px past both bodies: in pinching reach
  facing: 0.9,        // rad: must face the target this well to pinch
  slowMul: 0.5,       // the pinched unit moves at half speed ...
  slowTime: 1,        // ... for 1 s
  pinchPose: 0.25,    // s the claw stays shut (b.act 1)
  chargeAt: 160,      // px: runs at a target closer than this, else walks
  flammability: 0.2,  // wet shell: hard to light
};

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pinchPose) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < T.facing) {
      const pass = bite(w, u, t, T.pinch, T.pinchEvery, 20, 0);
      const v = perchOf(w, t);
      if (pass > 0 && v.hp > 0) slowUntil(w, v, now + T.slowTime, T.slowMul);
      act(w, u, 1);
    }
    return;
  }
  hunt(w, u, t, d < T.chargeAt ? T.run : T.walk, d < T.chargeAt ? STATE.CHARGE : STATE.ADVANCE);
}

const D = sea({
  type: 'crab', og: 'Crab (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.6,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3, accel: 700, decel: 700, turnRate: 9,
  waterPace: T.swim / T.run,
  flammability: T.flammability, density: 1.4, brushSpacing: 18,
  look: { attack: { time: 0.25 } },
  init(w, u) { initBag(w, u); u.cooldown = w.rng() * T.pinchEvery; },
  brain,
});
export default D;
export { T };
