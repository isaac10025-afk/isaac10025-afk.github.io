// Bog monster (OURS, Secret tab, Part 2 step 7): a mossy blob that LURKS. In a patch of mud or water (TERRAIN-SIM's mud,
// any water) it is under: u.hidden (untargetable), damageMul 0 and shots pass over it (combat/env.js submerged asks
// def.underground, as for the worm), fast (70), eyes showing. Grab: an enemy within 50 px while it's under: it rises
// (0.35 s, hittable then), grabs it (mass ≤ 6) and drags it under: held (u.inside = the bog monster: not drawn, not
// targeted), 25 hp/s until dead (credited; the body floats up where it is). One at a time. On dry land: a slow brute
// (25 / 40), punch 45 + toss. Mud trail: every 0.4 s walking on dry land it paints mud r 12 under itself (TERRAIN-SIM's
// painter through terrain/index.js): it grows its own swamp. A single trail line is too thin to lurk in (lurking needs
// mud / water 14 px out all round), trails that cross or a painted patch are not. Never burns. Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 under → `under` (eyes + bubbles; u.hidden), 2 grab → `grab` (b.victim; the rise is
// the first 0.35 s from b.actT, then it is under again holding the victim: draw it as `under` with a struggle), 3 punch →
// `punch` (0.4 s). b.under = 1 while it is under (art: eyes only).
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, idle, hunt, blow, swing, grabbable, glue, letGo, high,
  nearestFoe, damage, lurkable, soggy, paintMud, unitOf, heldBy, hypot, angleDiff, STATE, SEC, FEARLESS,
  inReach,
} from './_lib.js';

const T = {
  radius: 15,         // OG-raw radius (registerUnit ×1.1)
  hp: 1200,           // hit points
  mass: 12,           // heavy: can't be tossed
  walk: 25, run: 40,  // px/s on dry land
  swim: 70,           // px/s in mud or water
  grabR: 50,          // px (centre to the victim's edge): grabs from under within this
  grabMass: 6,        // grabs units this light or lighter
  rise: 0.35,         // s it is up (hittable) while it grabs
  holdDps: 25,        // hp/s to the held victim ...
  holdEvery: 0.25,    // ... dealt in bites this often
  grabEvery: 0.6,     // s after a hold ends before the next grab
  punch: 45,          // punch damage on land
  punchEvery: 1.6,    // s between punches
  reach: 8,           // px past both bodies
  punchOut: 150,      // px/s: a punched unit is tossed out this fast ...
  punchUp: 220,       // ... and this high
  trailEvery: 0.4,    // s between mud splats while walking on dry land
  trailR: 12,         // px: mud splat radius
  trailSpeed: 6,      // px/s: walking at least this fast leaves a trail
  peek: 0.12,         // s look-ahead: a step that would leave its bog ...
  wait: 4,            // ... is put off this long while it lies in wait for its target
  sight: 360,         // px
  shrug: 0.4,        // s: shrugs off stuns this short (ours: mixed armies kept it knocked down for good)
  upTime: 0.9,        // s it stays up out of its bog to punch a foe too big to grab (ATTACK3 L3)
};
const UNDER = 1, GRAB = 2;   // subState

function goUnder(w, u) { const b = u.b; b.under = 1; u.hidden = 0.001; u.burning = 0; if (u.subState === 0) u.subState = UNDER; if (b.act !== 2) act(w, u, 1); }
function surface(w, u) { const b = u.b; b.under = 0; u.hidden = 0; b.wait = 0; if (u.subState === UNDER) u.subState = 0; if (b.act === 1) act(w, u, 0); }
function okGrab(u, o) { return grabbable(o, T.grabMass) && !high(o); }
/** Never grabbable, whatever happens (heavy, a boss, untossable): it rises and punches those instead (ATTACK3 L3). */
function tooBig(o) { return o.mass > T.grabMass || !!o.def.boss || !!o.def.untossable; }

function startGrab(w, u, v) {
  const b = u.b;
  u.subState = GRAB; b.victim = v.id; b.t0 = w.time; b.t1 = w.time + T.holdEvery;
  b.under = 0; u.hidden = 0;   // it rises: hittable for a moment
  v.hurled = 1; v.target = -1; if (v.stun < 0.5) v.stun = 0.5;
  heldBy(w, u, v);
  act(w, u, 2); u.face = Math.atan2(v.y - u.y, v.x - u.x); u.attack = 1;
  w.emit('splash', { x: u.x, y: u.y, v: 1.2, type: u.type, grab: 1 });   // STEP7 AUDIO: bog grab (gloop)
}
function endGrab(w, u, v) {
  const b = u.b;
  if (v && v.hurled === 1) letGo(w, v, 0.4);
  u.subState = b.under ? UNDER : 0; b.victim = -1; b.next = w.time + T.grabEvery;
  act(w, u, b.under ? 1 : 0);
}
// every tick, before the brain: the held victim stays in its grip (up for the rise, then under) and is chewed
function hold(w, u) {
  const b = u.b, v = unitOf(w, b.victim), now = w.time;
  if (!v || !(v.hp > 0) || v.dead) { endGrab(w, u, v); return; }
  if (!lurkable(w, u.x, u.y)) { endGrab(w, u, v); return; }   // it got out of its bog (mud erased): it lets go
  const up = now - b.t0 < T.rise;
  if (!up && b.under === 0) { b.under = 1; u.hidden = 0.001; v.inside = u.id; v.hidden = 0.001; }   // dragged under
  const h = u.heading, r = up ? u.radius + v.radius * 0.6 : 0;
  glue(v, u.x + Math.cos(h) * r, u.y + Math.sin(h) * r, up ? 8 : SEC.HELD_Z, u.vx, u.vy);
  v.hurled = 1;
  if (!up) { v.inside = u.id; v.hidden = 0.001; v.target = -1; }
  if (now >= b.t1 - 1e-6) {
    b.t1 += T.holdEvery;
    damage(w, v, T.holdDps * T.holdEvery, u, undefined, v.x, v.y);
    if ((w.tick + u.index) % 12 < 3) w.emit('splash', { x: u.x, y: u.y, v: 0.4, type: u.type, bubbles: 1 });   // STEP7 AUDIO: was % 12 === 0, which bites every 15 ticks hit only for 1 grab in 3: now 1 bite in 4 (~1/s) for every grab
    if (!(v.hp > 0)) endGrab(w, u, v);
  }
}
function carry(w, u) { if (!w.holding && u.subState === GRAB) hold(w, u); }

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  actDone(w, u, 3, 0.4);
  if (u.subState === GRAB) { setState(u, STATE.ENGAGE); return; }   // carry() holds; it sits still dragging it under
  let lurk = lurkable(w, u.x, u.y) && !(now < b.upT);
  // ATTACK3 L3: a foe too big to drag under, right on top of it: it rises out of the bog and punches (up T.upTime s,
  // hittable). Under, it only grabbed: it followed a giant round the field in its own mud trail for the rest of the
  // battle, neither of them ever landing a blow (the giant can't see it under).
  if (lurk && u.cooldown <= 0 && !(u.stun > T.shrug) && canAuto(w, u)) {
    const t0 = targetOf(w, u);
    if (t0 && tooBig(t0) && inReach(t0) && hypot(t0.x - u.x, t0.y - u.y) <= u.radius + t0.radius + T.reach + 4) { b.upT = now + T.upTime; lurk = false; }
  }
  if (lurk) goUnder(w, u); else surface(w, u);
  if (u.state === STATE.FLEE) setState(u, STATE.IDLE);
  if (u.stun > T.shrug) { u.face = u.heading; return; }   // too heavy to be stun-locked by small knocks (cavalry, blows)
  const t = targetOf(w, u);
  const wetFoot = soggy(w, u.x, u.y);
  if (lurk && now >= b.next && canAuto(w, u)) {   // under: grab whoever comes near
    let v = t && okGrab(u, t) && hypot(t.x - u.x, t.y - u.y) - t.radius <= T.grabR ? t : null;
    if (!v && u.possessed !== 1) v = nearestFoe(w, u, u.x, u.y, T.grabR, okGrab, null);
    if (v) { startGrab(w, u, v); return; }
  }
  if (!t) { idle(w, u); trail(w, u, wetFoot); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const reach = u.radius + t.radius + T.reach;
  if (!lurk && d <= reach + 4 && inReach(t)) {   // on land: punch
    setState(u, STATE.ENGAGE); u.face = a;
    if (d > reach) { u.goalX = dx / d * T.walk; u.goalY = dy / d * T.walk; }
    else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.8) punch(w, u, t);
    return;
  }
  hunt(w, u, t, wetFoot ? T.swim : d > 320 ? T.walk : T.run, lurk ? STATE.ENGAGE : STATE.ADVANCE);
  if (lurk && u.possessed !== 1) ambush(w, u, t);
  trail(w, u, wetFoot);
}
// under, with its target out on dry land: it waits at the edge of its bog (eyes on it) for up to `wait` s before it
// climbs out after it (a lurker that never left would stall a battle)
function ambush(w, u, t) {
  const b = u.b, ax = u.x + u.goalX * T.peek, ay = u.y + u.goalY * T.peek;
  if (lurkable(w, ax, ay)) { b.wait = 0; return; }
  if (b.wait === 0) b.wait = w.time + T.wait;
  if (w.time < b.wait) { u.goalX = 0; u.goalY = 0; u.face = Math.atan2(t.y - u.y, t.x - u.x); setState(u, STATE.ALERT); }
}
function punch(w, u, t) {
  blow(w, u, t, T.punch, T.punchEvery, 0, 0, T.punchOut, T.punchUp);
  act(w, u, 3);
}
// walking on dry land: a mud splat under it every 0.4 s
function trail(w, u, wetFoot) {
  const b = u.b;
  if (wetFoot || w.time < b.next3 || hypot(u.goalX, u.goalY) < T.trailSpeed) return;
  b.next3 = w.time + T.trailEvery;
  paintMud(w, u.x, u.y, T.trailR);
}

secret({
  type: 'bogmonster', og: 'Bog monster (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 10,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.swim * 1.2, accel: 400, decel: 500, turnRate: 4,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.25,
  intelligence: 1, flammability: 0, density: 3,   // never burns
  waterPace: 1, mudPace: 1,   // in water and mud it moves at its own swim speed (the brain picks it), not the wade / mud factor
  risenMode: 'keep',          // a risen bog monster: same lurking, Undead
  brushSpacing: 40,
  flock: { separation: 36, formation: 0.3 },
  morale: FEARLESS,
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(u); u.b.under = 0; u.b.wait = 0; u.b.upT = 0; u.b.next3 = w.time + T.trailEvery * w.rng(); },
  // under the mud / water: nothing hurts it and shots pass (combat/env.js submerged asks this)
  underground(u) { return u.b.under === 1; },
  damageMul(w, u) { return u.b.under === 1 ? 0 : 1; },
  carry,
  onDeath(w, u) { if (u.subState === GRAB) { const v = unitOf(w, u.b.victim); if (v) letGo(w, v, 0.3); } },
  possessMove(w, u) { if (u.subState === GRAB) { u.goalX = 0; u.goalY = 0; } },
  // possessed, attack held at nobody: under: grab whoever is within reach; on land: punch whoever is in reach
  possessFire(w, u) {
    if (u.subState === GRAB) return;
    if (u.b.under === 1) {
      if (w.time < u.b.next) return;
      const v = nearestFoe(w, u, u.x, u.y, T.grabR, okGrab, null);
      if (v) startGrab(w, u, v); else swing(w, u, T.punchEvery * 0.4);
      return;
    }
    const v = nearestFoe(w, u, u.x, u.y, u.radius + T.reach, null, null);
    if (v && inReach(v)) { if (u.cooldown <= 0) punch(w, u, v); return; }
    swing(w, u, T.punchEvery * 0.4);
  },
  brain,
});
export { T };
