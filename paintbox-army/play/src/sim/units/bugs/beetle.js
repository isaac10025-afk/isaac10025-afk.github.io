// Beetle (OURS, Part 2 step 6): a slow armoured tank with a horn. Armour: bullets, arrows, shuriken, blunderbuss pellets
// and crossbow bolts do x0.4 (def.damageMul; blades, bites, blasts and fire hurt it in full). damage() gets no projectile
// kind for shots, so the armour knows a shot by the attacker's own projectile of one of those kinds sitting at its body
// this tick (a hit with no attacker = a stray shot of those kinds there). Flip: an enemy within r + 12 is caught on the
// horn and tossed up and over its back: it lands behind the beetle, knocked down, 18 dmg, every 1.5 s. Heavy units
// (mass 8+, the game's toss rule) are only shoved. Owner: BUGS-SIM. Pose codes (STEP6.md): b.act 1 flip → `flip`.
import {
  bug, initBag, targetOf, act, setState, hunt, idle, fleeing, canAuto, high, grounded, isRisen, tossTo, damage, push, infect,
  hypot, angleDiff, STATE, ENEMY, BUG,
} from './_lib.js';

const T = {
  radius: 10,         // OG-raw radius (registerUnit ×1.1)
  hp: 260,
  mass: 3,
  walk: 45, run: 110, // px/s
  armour: 0.4,        // x damage from the shot kinds below
  shotNear: 40,       // px past its body: the attacker's shot this close is what hit it
  flipReach: 12,      // px past both bodies
  flipDmg: 18,
  flipEvery: 1.5,     // s between flips
  flipBehind: 30,     // px past the beetle's back: where the victim comes down
  flipUp: 320,        // upward speed of the toss (before the toss's own mass scaling)
  knock: 0.6,         // s knocked down after it lands
  frontArc: 1.2,      // rad: prefers a victim in front of the horn (within ±1.2 rad of its heading)
  pose: 0.45,         // s of the `flip` pose
};
const ARMOUR = { bullet: 1, arrow: 1, shuriken: 1, pellet: 1, bolt: 1 };   // STEP6: bullets, arrows, shuriken, pellets, bolts

// Was this hit one of the armour's shot kinds? (see the header)
function shot(w, v, att) {
  const ps = w.projectiles; if (!ps || ps.length === 0) return false;
  const lim = v.radius + T.shotNear, lim2 = lim * lim, id = att ? att.id : -2;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (ARMOUR[p.kind] !== 1 || (id !== -2 && p.owner !== id)) continue;
    const dx = p.x - v.x, dy = p.y - v.y;
    if (dx * dx + dy * dy <= lim2) return true;
  }
  return false;
}
function damageMul(w, v, amount, att, kind) {
  // STEP6 (lead): damage.js now passes the projectile kind stepping in ballistics (world.projKind) when the hit came with no kind
  if (!(kind === undefined || kind === 'blow' || kind === w.projKind)) return 1;   // blasts, fire, thrown, poison: full
  if (ARMOUR[kind] === 1) return T.armour;                                          // a shot of the armour's kinds: known exactly
  return shot(w, v, att) ? T.armour : 1;
}

const FQ = new Array(32);
// the victim for a flip: the target if it's on the horn, else the enemy nearest the horn within reach
function flipVictim(w, u, t) {
  const R = u.radius + T.flipReach;
  if (t && reachable(u, t, R)) return t;
  if ((w.tick + u.index) % 3 !== 0) return null;   // the look round for another: every 3rd tick is plenty
  const n = w.queryMask(u.x, u.y, R + BUG.MARGIN, ENEMY[u.faction], FQ, FQ.length);
  let best = null, bs = Infinity;
  for (let k = 0; k < n; k++) {
    const o = FQ[k]; FQ[k] = null;
    if (!reachable(u, o, R)) continue;
    const off = Math.abs(angleDiff(u.heading, Math.atan2(o.y - u.y, o.x - u.x)));
    const s = hypot(o.x - u.x, o.y - u.y) * (off < T.frontArc ? 1 : 2);
    if (s < bs) { bs = s; best = o; }
  }
  return best;
}
function reachable(u, o, R) {
  return !o.dead && o.hp > 0 && !o.def.prop && !high(o) && o.inside < 0 && o.hurled !== 1 && hypot(o.x - u.x, o.y - u.y) <= R + o.radius;
}
// horn flip: up and over its back, lands behind it knocked down
function flip(w, u, v) {
  const dx = u.x - v.x, dy = u.y - v.y, d = hypot(dx, dy) || 0.001, ux = dx / d, uy = dy / d;
  const pass = damage(w, v, T.flipDmg, u, undefined, u.x, u.y);
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  if (v.hp > 0 && pass >= 0.5) {
    if (v.mass < 8 && !v.def.untossable && !v.def.boss && grounded(v)) {
      const air = tossTo(w, v, ux, uy, d + u.radius + T.flipBehind, T.flipUp);
      v.stun = Math.max(v.stun, air + T.knock); v.thrownAt = w.time;
      v.spin = (ux >= 0 ? 1 : -1) * 2 * Math.PI / Math.max(0.25, air);   // head over heels
    } else push(w, v, -ux, -uy, 160 * pass, 0.3 * pass);   // too heavy to lift: shoved back
  }
  u.b.next = w.time + T.flipEvery; u.attack = 1; u.face = Math.atan2(-dy, -dx);
  act(w, u, 1);
  w.emit('throw', { x: v.x, y: v.y, v: 0.9, type: u.type });
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (now >= b.next && canAuto(w, u)) {
    const v = flipVictim(w, u, t);   // possessed: only while the attack is held (canAuto)
    if (v) { flip(w, u, v); setState(u, STATE.ENGAGE); return; }
  }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d <= u.radius + t.radius + T.flipReach) { setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx); return; }   // horn on it, waiting
  hunt(w, u, t, d < 200 ? T.run : T.walk, d < 200 ? STATE.CHARGE : STATE.ADVANCE);
}

bug({
  type: 'beetle', og: 'Beetle (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.8,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 180, accel: 500, decel: 600, turnRate: 6,
  sightRange: 260, alertSightRange: 320, flammability: 0.4, density: 2.5,   // dense shell: shots don't go through
  brushSpacing: 26,
  morale: { baseline: 1, oddsWeight: 0.2, breakAt: 0.15, woundWeight: 0.2 },
  look: { attack: { time: 0.4 } },
  damageMul,
  init(w, u) { initBag(w, u); u.b.next = w.time + T.flipEvery * w.rng(); },
  brain,
});
export { T };
