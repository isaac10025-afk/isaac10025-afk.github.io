// Bombardier beetle (OURS, Part 2 step 6): sprays boiling liquid out of its REAR. With a target within 70 px it turns
// its back to it, then sprays for 1 s: every enemy in the 50° cone behind it out to 70 px takes 8 every 0.25 s (4 puffs),
// and a flammable one may catch fire (0.25 x flammability per puff). Reload 2 s. The cone doesn't go through walls.
// Bites 6 when it can't spray. Owner: BUGS-SIM.
// Pose codes (STEP6.md): b.act 1 spray → `spray` (rear raised, back to the target; also while it turns its back, before
// the first puff). Each puff emits `steampuff` at the cone's middle (the boiling cloud; existing fx + sound).
import {
  bug, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, canAuto, high, isRisen, damage, infect, raycast,
  hypot, angleDiff, STATE, ENEMY, BUG,
} from './_lib.js';
import { ignite } from '../../combat/index.js';

const T = {
  radius: 8,          // OG-raw radius (registerUnit ×1.1)
  hp: 90,
  mass: 1,
  walk: 70, run: 130, // px/s
  range: 70,          // px from its rear: the spray's reach (+ the victim's body)
  cone: 50 * Math.PI / 180,   // rad: the spray's full width
  sprayTime: 1,       // s of spraying ...
  puffEvery: 0.25,    // ... a puff every 0.25 s (4 puffs)
  puffDmg: 8,         // damage per puff
  ignite: 0.25,       // per puff: catches fire with chance 0.25 x its flammability
  reload: 2,          // s from the end of a spray to the next
  turnTol: 0.35,      // rad: its back must point this close at the target before it sprays
  turnMax: 0.8,       // s: gives up turning after this long (and sprays anyway if anyone's in the cone)
  standOff: 42,       // px (centre to centre): closes in to about here before spraying
  bite: 6,            // when it can't spray
  biteEvery: 0.8,
};
const TURN = 1, SPRAY = 2;   // subState

const SQ = new Array(32);
// one puff: everyone hostile in the rear cone within range, not through walls
function puff(w, u) {
  const back = u.heading + Math.PI, bx = Math.cos(back), by = Math.sin(back);
  const rx = u.x + bx * u.radius, ry = u.y + by * u.radius, half = T.cone / 2;
  const n = w.queryMask(rx, ry, T.range + BUG.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (o.dead || !(o.hp > 0) || high(o) || o.inside >= 0 || o.def.prop) continue;
    const dx = o.x - rx, dy = o.y - ry, d = hypot(dx, dy);
    if (d > T.range + o.radius) continue;
    if (d > o.radius && Math.abs(angleDiff(back, Math.atan2(dy, dx))) > half + Math.asin(Math.min(1, o.radius / d))) continue;
    if (w.walls.count > 0 && raycast(w, rx, ry, o.x, o.y) <= 1) continue;
    const pass = damage(w, o, T.puffDmg, u, undefined, rx, ry);
    if (isRisen(u)) infect(w, o, u, 0.3 * pass, 0);
    if (pass >= 0.5) ignite(w, o, T.ignite);
    hit++;
  }
  u.attack = 1;
  w.emit('steampuff', { x: rx + bx * T.range * 0.45, y: ry + by * T.range * 0.45, type: u.type });
  return hit;
}

function startSpray(w, u) {
  const b = u.b;
  u.subState = SPRAY; b.t0 = w.time; b.k = 0;
  act(w, u, 1);
  const back = u.heading + Math.PI;
  w.emit('steam', { x: u.x + Math.cos(back) * u.radius * 2, y: u.y + Math.sin(back) * u.radius * 2, size: 12, type: u.type });   // the boil starts (fx + steam hiss)
}
function spraying(w, u, t) {
  const b = u.b, el = w.time - b.t0;
  if (t && t.hp > 0) u.face = Math.atan2(t.y - u.y, t.x - u.x) + Math.PI;   // keeps its rear on the target
  else u.face = u.heading;
  setState(u, STATE.ENGAGE);
  while (b.k < 4 && el >= b.k * T.puffEvery) { b.k++; puff(w, u); }
  if (el >= T.sprayTime) { u.subState = 0; b.next = w.time + T.reload; act(w, u, 0); }
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  const t = targetOf(w, u);
  if (u.subState === SPRAY) { if (u.stun > 0.3) { u.subState = 0; b.next = now + T.reload; act(w, u, 0); } else { spraying(w, u, t); return; } }
  if (u.stun > 0) { u.face = u.heading; return; }
  if (fleeing(w, u, t)) { if (u.subState) { u.subState = 0; act(w, u, 0); } return; }
  if (!t) { if (u.subState) { u.subState = 0; act(w, u, 0); } idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const inRange = d <= T.range + u.radius + t.radius && !high(t);
  if (u.subState === TURN) {   // turning its back to the target
    setState(u, STATE.ENGAGE); u.face = a + Math.PI;
    if (!inRange) { u.subState = 0; act(w, u, 0); }
    else if (Math.abs(angleDiff(u.heading, a + Math.PI)) < T.turnTol || now - b.t1 > T.turnMax) startSpray(w, u);
    return;
  }
  if (inRange && now >= b.next && canAuto(w, u) && (u.los === 1 || w.walls.count === 0)) {
    u.subState = TURN; b.t1 = now; act(w, u, 1);
    setState(u, STATE.ENGAGE); u.face = a + Math.PI;
    return;
  }
  if (d <= u.radius + t.radius + 4) {   // touching, spray not ready: bite
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0 && !high(t)) bite(w, u, t, T.bite, T.biteEvery, 30, 0);
    return;
  }
  if (d < T.standOff && now < b.next) { setState(u, STATE.ENGAGE); u.face = a; return; }   // close enough: wait for the reload
  hunt(w, u, t, d < 220 ? T.run : T.walk, d < 220 ? STATE.CHARGE : STATE.ADVANCE);
}

bug({
  type: 'bombardier', og: 'Bombardier (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.1,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 200, accel: 700, decel: 700, turnRate: 9,
  sightRange: 280, alertSightRange: 340, flammability: 0.5,
  brushSpacing: 24,
  look: { attack: { time: 0.3 } },
  weapon: { range: T.range },   // for possess (aim reach) and readers
  init(w, u) { initBag(w, u); u.b.next = w.time + T.reload * w.rng(); },
  holdsNerve(w, u) { return u.subState === SPRAY; },
  // possessed, attack held at nobody: turn the rear to the aim and spray there
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next) return;
    u.subState = TURN; u.b.t1 = w.time; act(w, u, 1);
    u.face = aim + Math.PI; u.heading = aim + Math.PI;   // the player swings it round at once
    startSpray(w, u);
  },
  brain,
});
export { T };
