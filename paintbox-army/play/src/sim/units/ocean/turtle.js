// Turtle (OURS, Part 2 step 6): slow on land (25 / 40), swims 70. SHELL: below 60 % hp, or with 3+ enemies within 30 px
// of its shell, it hides 4 s: every hit on it does ×0.15 (def.damageMul), it can't move or attack. Then 6 s before it
// can hide again. Bites 18 every 1.2 s. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 in shell; swimming → `swim` (b.swim = 1 in deep water).
import {
  sea, initBag, prelude, targetOf, act, setState, hunt, idle, fleeing, bite, hypot, angleDiff, STATE, ENEMY, SEA,
} from './_lib.js';

const T = {
  radius: 11,         // OG-raw radius (registerUnit ×1.1)
  hp: 320,            // hit points
  mass: 4,            // heavy
  walk: 25,           // px/s walking on land
  run: 40,            // px/s on land (closing in)
  swim: 70,           // px/s in water (waterPace = swim / run)
  shellAt: 0.6,       // hides below 60 % hp ...
  crowd: 3,           // ... or with 3+ enemies ...
  crowdGap: 30,       // ... within 30 px of its shell (edge to edge)
  crowdEvery: 6,      // ticks between crowd counts
  shellTime: 4,       // s in the shell
  shellEvery: 6,      // s after coming out before it can hide again
  shellMul: 0.15,     // damage factor in the shell
  bite: 18,           // damage per bite ...
  biteEvery: 1.2,     // ... every 1.2 s
  reach: 6,           // px past both bodies
  facing: 0.7,        // rad: must face the target this well to bite
  chargeAt: 140,      // px: runs at a target closer than this
  flammability: 0.15, // shell
};
const SHELL = 1;   // b.act
const CQ = new Array(24).fill(null);

function crowded(w, u) {
  const n = w.queryMask(u.x, u.y, u.radius + T.crowdGap + SEA.MARGIN, ENEMY[u.faction], CQ, CQ.length);
  let c = 0;
  for (let k = 0; k < n; k++) {
    const o = CQ[k]; CQ[k] = null;
    if (c >= T.crowd || !(o.hp > 0) || o.dead || o.def.prop) continue;
    if (hypot(o.x - u.x, o.y - u.y) - o.radius - u.radius <= T.crowdGap) c++;
  }
  return c >= T.crowd;
}
function hide(w, u) { act(w, u, SHELL); u.goalX = 0; u.goalY = 0; u.attack = 0; w.emit('block', { x: u.x, y: u.y, v: 0.6, type: u.type }); }

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === SHELL) {
    if (now - b.actT < T.shellTime) { u.face = u.heading; setState(u, STATE.ALERT); return; }
    act(w, u, 0); b.next = now + T.shellEvery;
  }
  if (now >= b.next && u.possessed !== 1 && (u.hp < T.shellAt * u.maxHp ||((w.tick + u.index) % T.crowdEvery === 0 && crowded(w, u)))) { hide(w, u); return; }
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < T.facing) bite(w, u, t, T.bite, T.biteEvery, 60, 0.1);
    return;
  }
  hunt(w, u, t, d < T.chargeAt ? T.run : T.walk, d < T.chargeAt ? STATE.CHARGE : STATE.ADVANCE);
}

const D = sea({
  type: 'turtle', og: 'Turtle (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 2,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.swim * 1.15, accel: 350, decel: 500, turnRate: 4,
  waterPace: T.swim / T.run,
  flammability: T.flammability, density: 1.6, brushSpacing: 32,
  morale: { woundWeight: 0.15, breakAt: 0.18 },   // it has a shell to hide in: it rarely runs
  look: { attack: { time: 0.35 } },
  init(w, u) { initBag(w, u); },
  damageMul(w, u) { return u.b.act === SHELL ? T.shellMul : 1; },
  holdsNerve(w, u) { return u.b.act === SHELL; },
  // possessed, attack held at nobody: pull into the shell (when it can)
  possessFire(w, u) { if (u.b.act !== SHELL && w.time >= u.b.next) hide(w, u); },
  // in the shell it can't move, the player's stick neither
  possessMove(w, u) { if (u.b.act === SHELL) { u.goalX = 0; u.goalY = 0; } },
  brain,
});
export default D;
export { T };
