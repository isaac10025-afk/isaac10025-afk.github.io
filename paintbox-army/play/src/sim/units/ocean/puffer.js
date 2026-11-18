// Puffer (OURS, Part 2 step 6): little hops on land (32), fast in water (120). PUFF: when an enemy comes within 60 px
// or it's hit, it puffs up for 4 s: spikes out. Any melee hit on it then costs the attacker 12 (a melee unit's blow from
// close by; shots, blasts and fire don't count), and enemies touching it take 6 every 0.5 s. Flat, it bites
// 6. Puffed, it bobs after its target at half speed. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 puffed (round, spikes out); swimming → `swim` (b.swim = 1 in deep water).
import {
  sea, initBag, prelude, targetOf, act, setState, hunt, idle, fleeing, bite, damage, canAuto, hypot, STATE, ENEMY, SEA,
} from './_lib.js';

const T = {
  radius: 7,          // OG-raw radius (registerUnit ×1.1)
  hp: 70,             // hit points
  mass: 0.8,          // light
  walk: 24,           // px/s hopping about on land
  run: 32,            // px/s on land (STEP6 said 25: a driven puffer then can't reach a foe 250 px off in 10 s, possess test)
  swim: 120,          // px/s in water (waterPace = swim / run)
  puffR: 60,          // px from its middle to an enemy's edge: that close puffs it up ...
  puffTime: 4,        // ... for 4 s (a hit puffs it too, and a hit while puffed keeps it puffed 4 s more)
  rest: 1,            // s flat after a puff before a nearby enemy can puff it again
  lookEvery: 6,       // ticks between looks for enemies close by
  spikeBack: 12,      // a melee hit on it while puffed costs the attacker 12
  meleeGap: 30,       // px past both bodies: a melee unit's blow from this close is a melee hit
  touch: 6,           // enemies touching it while puffed take 6 ...
  touchEvery: 0.5,    // ... every 0.5 s
  touchGap: 3,        // px past both bodies = touching
  puffSlow: 0.5,      // moves at half speed while puffed
  bite: 6,            // flat bite ...
  biteEvery: 0.7,     // ... every 0.7 s
  reach: 4,           // px past both bodies
  chargeAt: 140,      // px: runs at a target closer than this
  flammability: 0.3,  // small and wet-ish
};
const PQ = new Array(32).fill(null);

function puff(w, u) {
  const b = u.b, fresh = b.act !== 1;
  act(w, u, 1); b.t1 = w.time + T.puffTime;
  if (fresh) b.t0 = w.time + T.touchEvery;   // first spike check 0.5 s after it puffs
  if (fresh) w.emit('puffup', { x: u.x, y: u.y, type: u.type });   // STEP6 AUDIO: puff-up bloop
}
// spikes: every enemy touching it takes 6
function spikes(w, u) {
  const n = w.queryMask(u.x, u.y, u.radius + T.touchGap + SEA.MARGIN, ENEMY[u.faction], PQ, PQ.length);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.z > 8 || o.climb > 0) continue;
    if (hypot(o.x - u.x, o.y - u.y) > u.radius + o.radius + T.touchGap) continue;
    damage(w, o, T.touch, u, 'spike', o.x, o.y); hit++;   // from its own spot: spikes poke round shields
  }
  if (hit > 0) { u.attack = 1; w.emit('strike', { x: u.x, y: u.y, v: 0.5, type: u.type }); }
}

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  const puffed = b.act === 1;
  if (puffed) {
    if (now >= b.t1) { act(w, u, 0); b.next = now + T.rest; }
    else if (now >= b.t0) { b.t0 += T.touchEvery; spikes(w, u); }
  } else if (now >= b.next && (w.tick + u.index) % T.lookEvery === 0 && canAuto(w, u)) {
    const o = w.findNearest(u.x, u.y, T.puffR + SEA.MARGIN, ENEMY[u.faction], null, 0);
    if (o && hypot(o.x - u.x, o.y - u.y) - o.radius <= T.puffR) puff(w, u);
  }
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); if (b.act === 1) { u.goalX *= T.puffSlow; u.goalY *= T.puffSlow; } return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (b.act === 1) {   // puffed: bob into it (the spikes do the hurting)
    setState(u, d < 60 ? STATE.ENGAGE : STATE.CHARGE);
    hunt(w, u, t, T.puffSlow * T.run, u.state);
    return;
  }
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx);
    if (u.cooldown <= 0) bite(w, u, t, T.bite, T.biteEvery, 20, 0);
    return;
  }
  hunt(w, u, t, d < T.chargeAt ? T.run : T.walk, d < T.chargeAt ? STATE.CHARGE : STATE.ADVANCE);
}

const D = sea({
  type: 'puffer', og: 'Puffer (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.6,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.swim * 1.1, accel: 600, decel: 600, turnRate: 8,
  waterPace: T.swim / T.run,
  flammability: T.flammability, density: 0.8, brushSpacing: 18,
  look: { attack: { time: 0.25 } },
  init(w, u) { initBag(w, u); },
  // hit: a melee hit on the spikes hurts the attacker (kind 'spike' back, so two puffers can't ping-pong), then it puffs
  onHit(w, u, amount, att, kind) {
    if (!(u.hp > 0)) return;
    if (u.b.act === 1 && att && att !== u && att.def.melee === true && (kind === undefined || kind === 'blow') && att.hp > 0 && !att.dead
      && hypot(att.x - u.x, att.y - u.y) <= u.radius + att.radius + T.meleeGap) damage(w, att, T.spikeBack, u, 'spike', att.x, att.y);   // from its own spot: a shield doesn't help the arm that struck
    puff(w, u);
  },
  // possessed, attack held at nobody: puff up
  possessFire(w, u) { puff(w, u); },
  brain,
});
export default D;
export { T };
