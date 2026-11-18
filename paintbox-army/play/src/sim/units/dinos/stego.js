// Stegosaurus (OURS, Part 2 step 4): slow plated tank. Every 1.6 s its spiked tail sweeps the half-circle behind it and
// hits EVERY enemy there; it turns its tail toward a close enemy when the swipe is ready. Weak bite in front. Never
// breaks while 3+ enemies are within 80 px (back to the wall). Owner: DINOS-SIM. Pose codes (STEP4.md): b.act 1 swipe.
import { dino, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, canAuto, grounded, high, isRisen, damage, push, infect, hypot, STATE, DINO, ENEMY } from './_lib.js';

const T = {
  radius: 15, hp: 460, mass: 6,
  walk: 30, run: 80,
  swipeEvery: 1.6,    // s between tail swipes
  swipeReach: 34,     // px past its body (+ the enemy's): the tail's reach behind it
  swipeDmg: 28,
  swipePush: 220,     // push outward (÷ the victim's mass)
  swipeStun: 0.3,
  pose: 0.5,          // s: the tail-swung-round pose
  tailTurn: 30,       // px: a target this close to the tail's reach and the swipe ready: turn the tail to it
  bite: 8, biteEvery: 1,
  holdNear: 80,       // px ...
  holdCount: 3,       // ... this many enemies that close: it won't break
};
const SQ = new Array(48), HIT = new Array(48);

// every enemy on the ground in the rear half-circle within reach: hit them all
function swipe(w, u) {
  const hx = Math.cos(u.heading), hy = Math.sin(u.heading), R = u.radius + T.swipeReach;
  const n = w.queryMask(u.x, u.y, R + DINO.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (o.dead || !(o.hp > 0) || !grounded(o) || high(o)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy);
    if (d > R + o.radius || dx * hx + dy * hy > 0) continue;
    HIT[m++] = o;
  }
  if (m === 0) return false;
  for (let k = 0; k < m; k++) {
    const o = HIT[k]; HIT[k] = null;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
    const pass = damage(w, o, T.swipeDmg, u, undefined, u.x - hx * u.radius, u.y - hy * u.radius);
    if (isRisen(u)) infect(w, o, u, 0.5 * pass, 0);
    if (o.hp > 0) push(w, o, dx / d, dy / d, T.swipePush * pass, T.swipeStun * pass);
  }
  u.b.next = w.time + T.swipeEvery;
  act(w, u, 1);
  w.emit('trample', { x: u.x - hx * u.radius, y: u.y - hy * u.radius, v: 1.4, type: u.type });
  return true;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const ready = now >= b.next && canAuto(w, u);
  if (ready) swipe(w, u);
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (now >= b.next && d <= u.radius + t.radius + T.swipeReach + T.tailTurn) { // turn the tail to it
    setState(u, STATE.ENGAGE); u.face = a + Math.PI;
    return;
  }
  if (d <= u.radius + t.radius + 5) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0) bite(w, u, t, T.bite, T.biteEvery, 60, 0.1);
    return;
  }
  hunt(w, u, t, d < 200 ? T.run : T.walk);
}

dino({
  type: 'stego', og: 'Stegosaurus',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 3.5,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 140, accel: 400, decel: 500, turnRate: 3.5,
  sightRange: 280, alertSightRange: 330, flammability: 0.4, density: 3,
  brushSpacing: 42,
  morale: { baseline: 0.9, oddsWeight: 0.35, breakAt: 0.22 },
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(w, u); },
  // back to the wall: 3+ enemies within 80 px and it won't break
  holdsNerve(w, u) {
    const n = w.queryMask(u.x, u.y, T.holdNear, ENEMY[u.faction], SQ, T.holdCount + 4);
    let c = 0;
    for (let k = 0; k < n; k++) { const o = SQ[k]; SQ[k] = null; if (!o.dead && o.hp > 0 && hypot(o.x - u.x, o.y - u.y) <= T.holdNear) c++; }
    return c >= T.holdCount;
  },
  // possessed, attack held at nobody: swing the tail anyway
  possessFire(w, u) {
    if (w.time < u.b.next) return;
    if (!swipe(w, u)) { u.b.next = w.time + T.swipeEvery; act(w, u, 1); w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); }
  },
  brain,
});
