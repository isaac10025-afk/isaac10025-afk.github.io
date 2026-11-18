// Ankylosaurus (OURS, Part 2 step 4): armoured tank. Arrows, bullets and shurikens bounce off its shell unless they come
// from straight behind (def.armorBounce, read by combat/ballistics.js); flames and blasts hurt it normally. Its club
// tail LAUNCHES an enemy behind or beside it into the air like a rag doll. Owner: DINOS-SIM.
// Pose codes (STEP4.md): b.act 1 club (tail over the back).
import { dino, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, canAuto, grounded, high, isRisen, tossTo, damage, push, infect, hypot, STATE, DINO, ENEMY } from './_lib.js';

const T = {
  radius: 14, hp: 700, mass: 8,
  walk: 26, run: 60,
  rearCos: -0.8,      // a shot from within ~37° of straight behind (cos < -0.8) gets through the shell
  clubReach: 30,      // px past its body (+ the enemy's)
  clubSide: 0.35,     // "behind or beside": cos(angle off its heading) below this
  clubDmg: 30,
  launchUp: 260,      // upward toss speed ...
  launchDist: 90,     // ... and how far (px) a man-sized victim flies (heavier ones fly less; mass 8+ is only shoved)
  clubEvery: 2.2,     // s
  pose: 0.5,          // s: tail-over-the-back pose
  tailTurn: 30,       // px: a target this close to the club's reach and the club ready: turn the tail to it
  butt: 10, buttEvery: 1.2,   // head butt in front (ours: STEP4 gives it nothing in front)
};
const CQ = new Array(48);

// the nearest enemy behind or beside within reach gets clubbed and launched
function club(w, u) {
  const hx = Math.cos(u.heading), hy = Math.sin(u.heading), R = u.radius + T.clubReach;
  const n = w.queryMask(u.x, u.y, R + DINO.MARGIN, ENEMY[u.faction], CQ, CQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = CQ[k]; CQ[k] = null;
    if (o.dead || !(o.hp > 0) || !grounded(o) || high(o)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d > R + o.radius || (dx * hx + dy * hy) / d >= T.clubSide) continue;
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return false;
  const dx = best.x - u.x, dy = best.y - u.y, d = bd || 0.001;
  const pass = damage(w, best, T.clubDmg, u, undefined, u.x - hx * u.radius, u.y - hy * u.radius);
  if (isRisen(u)) infect(w, best, u, 0.5 * pass, 0);
  if (best.hp > 0) {
    if (best.mass < 8 && !best.def.untossable && !best.def.prop) {
      const k = Math.sqrt(Math.max(1, best.mass));   // heavier: shorter flight
      tossTo(w, best, dx / d, dy / d, T.launchDist * pass / k, T.launchUp * pass);
    } else push(w, best, dx / d, dy / d, 300 * pass, 0.4 * pass);
  }
  u.b.next = w.time + T.clubEvery;
  act(w, u, 1);
  w.emit('trample', { x: best.x, y: best.y, v: 1.6, type: u.type });
  return true;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  if (now >= b.next && canAuto(w, u)) club(w, u);
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (now >= b.next && d <= u.radius + t.radius + T.clubReach + T.tailTurn) { // swing the tail round to it
    setState(u, STATE.ENGAGE); u.face = a + Math.PI;
    return;
  }
  if (d <= u.radius + t.radius + 5) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0) bite(w, u, t, T.butt, T.buttEvery, 90, 0.2);
    return;
  }
  hunt(w, u, t, d < 160 ? T.run : T.walk);
}

dino({
  type: 'ankylo', og: 'Ankylosaurus',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 4,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 110, accel: 350, decel: 450, turnRate: 3.2,
  sightRange: 260, alertSightRange: 320, flammability: 0.2, density: 5,
  deflects: true,     // the shell: glancing hits bounce like the giant's and dragon's (ballistics)
  brushSpacing: 40,
  morale: { baseline: 1, oddsWeight: 0.1, woundWeight: 0.1, canBreak: false },
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(w, u); },
  // arrows / bullets / shurikens from (sx, sy) bounce off the shell unless they come from straight behind
  armorBounce(w, u, sx, sy) {
    const dx = sx - u.x, dy = sy - u.y, d = hypot(dx, dy);
    if (d < 0.001) return true;
    return (dx * Math.cos(u.heading) + dy * Math.sin(u.heading)) / d > T.rearCos;
  },
  // possessed, attack held at nobody: swing the club anyway
  possessFire(w, u) {
    if (w.time < u.b.next) return;
    if (!club(w, u)) { u.b.next = w.time + T.clubEvery; act(w, u, 1); w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); }
  },
  brain,
});
