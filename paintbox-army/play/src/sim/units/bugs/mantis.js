// Mantis (OURS, Part 2 step 6): two scythe arms, a slash every 0.3 s (14 each), the arms taking turns (b.arm 0 / 1).
// Lunge: a target 30-80 px away → it jumps at it (z arc 0.3 s, flies over the ground in a fixed line) and lands at its
// side, slashing at once. With nothing to fight it stands still, blades raised (praying): it doesn't roam.
// Owner: BUGS-SIM. Pose codes (STEP6.md): b.act 1 lunge → `lunge`; `atk` slash, the arm in b.arm (0 / 1, flips each
// slash); idle → `pray` = b.act 0 with u.state 0 (idle), standing still.
import {
  bug, initBag, targetOf, act, setState, hunt, fleeing, bite, clearLine, high, grounded, unitOf, nearestReachable,
  hypot, STATE, LEAP, ENEMY, BUG,
} from './_lib.js';
import { followGroup } from '../../systems/navigation.js';

const T = {
  radius: 9,          // OG-raw radius (registerUnit ×1.1)
  hp: 120,
  mass: 1,
  walk: 90, run: 190, // px/s
  slash: 14,          // damage per slash
  slashEvery: 0.3,    // s between slashes (the arms take turns)
  reach: 6,           // px past both bodies
  lungeMin: 30,       // px (centre to centre): lunges at a target this far ...
  lungeMax: 80,       // ... up to this far
  lungeTime: 0.3,     // s in the air
  lungeH: 16,         // px at the top of the arc
  lungeEvery: 2,      // s between lunges
  landGap: 2,         // px between the bodies where it lands
};
const LUNGE = 1;   // subState

function slash(w, u, t) {
  u.b.arm ^= 1;   // the other arm this time (art: b.arm)
  bite(w, u, t, T.slash, T.slashEvery, 30, 0.05);
}

function lungeTo(w, u, px, py, short, prey) {
  const b = u.b, ex = px - u.x, ey = py - u.y, dd = hypot(ex, ey) || 0.001, f = Math.max(0, dd - short);
  b.prey = prey; b.t0 = w.time; b.dx = ex / dd * f / T.lungeTime; b.dy = ey / dd * f / T.lungeTime;
  b.next = w.time + T.lungeEvery;
  u.subState = LUNGE; u.leaping = LEAP.FLY; u.heading = Math.atan2(ey, ex);
  act(w, u, 1); setState(u, STATE.CHARGE);
  w.emit('charge', { x: u.x, y: u.y, type: u.type });
}
function lunge(w, u) {
  const b = u.b, f = (w.time - b.t0) / T.lungeTime;
  if (f < 1) {
    u.z = 4 * T.lungeH * f * (1 - f); u.vz = 0;
    u.vx = u.goalX = b.dx; u.vy = u.goalY = b.dy; u.face = Math.atan2(b.dy, b.dx);
    return;
  }
  u.z = 0; u.vz = 0; u.leaping = 0; u.subState = 0; u.vx *= 0.3; u.vy *= 0.3;
  act(w, u, 0);
  w.emit('land', { x: u.x, y: u.y, v: 0.4, type: u.type });
  const v = unitOf(w, b.prey) || w.findNearest(u.x, u.y, u.radius + BUG.MARGIN, ENEMY[u.faction], null, 0);
  b.prey = -1;
  if (v && v.hp > 0 && !high(v) && hypot(v.x - u.x, v.y - u.y) <= u.radius + v.radius + T.reach + 4) {
    u.face = Math.atan2(v.y - u.y, v.x - u.x);
    u.cooldown = 0; slash(w, u, v);   // lands slashing
  }
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === LUNGE) { lunge(w, u); return; }
  if (u.stun > 0) { u.face = u.heading; return; }
  let t = targetOf(w, u);
  if (t && high(t)) {   // up out of reach (ptero, jetpack): its own pick instead, kept while reachable
    let p = unitOf(w, b.k);
    if (!p || !(p.hp > 0) || high(p)) p = (w.tick + u.index) % 12 === 0 ? nearestReachable(w, u, u.def.sightRange) : null;
    b.k = p ? p.id : -1; t = p;
  }
  if (fleeing(w, u, t)) return;
  if (!t) {   // waiting: to the group's fight if there is one, else stand still praying
    if (!followGroup(w, u, u.def.walkSpeed, 6)) { setState(u, STATE.IDLE); u.face = u.heading; }
    return;
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0) slash(w, u, t);
    return;
  }
  if (now >= b.next && d >= T.lungeMin && d <= T.lungeMax && clearLine(w, u) && grounded(t) && t.hurled !== 1) {
    const lead = T.lungeTime * 0.8;
    lungeTo(w, u, t.x + t.vx * lead, t.y + t.vy * lead, u.radius + t.radius + T.landGap, t.id);
    return;
  }
  hunt(w, u, t, d < 300 ? T.run : T.walk, d < 300 ? STATE.CHARGE : STATE.ADVANCE);
}

bug({
  type: 'mantis', og: 'Mantis (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.4,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 320, accel: 900, decel: 900, turnRate: 10,
  sightRange: 300, alertSightRange: 360, reactionTime: 0.15, predator: true, flammability: 0.6,
  brushSpacing: 24,
  morale: { baseline: 0.95, oddsWeight: 0.3, breakAt: 0.2 },
  look: { attack: { time: 0.25 } },
  init(w, u) { initBag(w, u); u.b.arm = u.index & 1; u.b.k = -1; },
  holdsNerve(w, u) { return u.subState !== 0; },   // no running off mid-lunge
  // possessed, attack held at nobody: lunge at the aim point (30-80 px) and slash whoever is there
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0) return;
    if (w.time >= u.b.next) {
      const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(T.lungeMin, Math.min(T.lungeMax, d)) / d;
      lungeTo(w, u, u.x + dx * k, u.y + dy * k, 0, -1);
    } else if (u.cooldown <= 0) { u.b.arm ^= 1; u.attack = 1; u.cooldown = T.slashEvery; }   // empty slash
  },
  brain,
});
export { T };
