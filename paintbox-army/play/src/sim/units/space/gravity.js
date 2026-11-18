// gravity (OURS, Space tab): wraps one enemy at a time in a bubble (range 200; mass ≤ 8, not flying, not a boss): it
// floats 2.5 s (`u.floating`: stunned, drifting at FLOAT_Z, steering.js), then drops HARD: 20 + 5 × mass (max 60), and
// whoever it lands on takes 15 + is knocked down (_lib.js floatHard + the dinos' landing record). Over water: a splash.
// Cooldown 3.5 s. Keeps its distance between casts; slaps (5) whoever comes close. Owner: SPACE-SIM.
// Pose codes (STEP6.md): b.act 1 cast → `cast` (hands up while the bubble holds; b.victim = the floating unit).
// Bubble = effect projectile `bubble` riding on the victim: p.r = victim radius, p.life / p.maxLife count the float down.
import {
  alien, initBag, act, targetOf, setState, idle, fleeing, closeOn, keepAt, meleeFight, clearLine, swing, unitOf, canFloat,
  floatHard, spawnEffect, rideOn, hypot, STATE, ENEMY, registerProjectileKind, removeProjectile,
} from './_lib.js';

const T = {
  hp: 90, mass: 1, radius: 8,
  walk: 70, run: 120,       // px/s
  range: 200,               // px: casts on enemies this close, in sight
  float: 2.5,               // s afloat
  cooldown: 3.5,            // s from one cast to the next
  dropBase: 20,             // hard drop damage: 20 ...
  dropPerMass: 5,           // ... + 5 × mass ...
  dropMax: 60,              // ... at most 60
  landHit: 15,              // whoever it lands on: damage (+ knocked down)
  scanEvery: 10,            // ticks between searches (ready, not possessed)
  aimPick: 50,              // px: possessed, firing at the ground: the floatable enemy nearest the aim point this close
  want: 150,                // px: keeps this far from its target between casts
  band: 40,
  slap: {
    damage: 5, damageJitter: 1, cooldown: 0.7, cooldownJitter: 0.2, push: 70, stun: 0.1,
    reach: 5, band: 8, facing: 0.7, circle: 0.3, backStep: true,
  },
};

// ---------------------------------------------------------------- the bubble (effect projectile: follows, never hits)
function stepBubble(w, p, i) {
  const v = p.host >= 0 ? w.unitById(p.host) : null;
  if (!v || !(v.hp > 0) || !(v.floating > w.time) || v.inside >= 0) { removeProjectile(w, i); return; }
  rideOn(p, v, 0); p.r = v.radius;
  p.life = Math.max(0, v.floating - w.time);
}
registerProjectileKind('bubble', stepBubble);

function floatable(w, o) { return canFloat(w, o) && !o.def.flies; }
function cast(w, u, v) {
  const b = u.b;
  floatHard(w, v, T.float, u, T.dropBase, T.dropPerMass, T.dropMax, T.landHit);
  v.target = -1;
  spawnEffect(w, 'bubble', u, v, T.float);
  b.victim = v.id; b.next = w.time + T.cooldown; u.attack = 1;
  act(w, u, 1);
  u.face = Math.atan2(v.y - u.y, v.x - u.x);
  w.emit('spell', { x: v.x, y: v.y, v: 0.8, type: u.type, bubble: 1 });   // STEP6 SPACE AUDIO: bubble = a wobbly blorp
}
const MQ = new Array(48);
function inSight(w, u, o) { return w.walls.count === 0 || w.walls.lineOfSight(u.x, u.y, o.x, o.y); }
// nearest floatable enemy within range and in sight (around point px,py within r when given)
function findMark(w, u, px, py, r) {
  const n = w.queryMask(px, py, r, ENEMY[u.faction], MQ, MQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = MQ[k]; MQ[k] = null;
    if (!floatable(w, o) || hypot(o.x - u.x, o.y - u.y) > T.range || (o.unseen > 0 && hypot(o.x - u.x, o.y - u.y) > o.unseen)) continue;
    const d = hypot(o.x - px, o.y - py);
    if (d < bd && inSight(w, u, o)) { bd = d; best = o; }
  }
  return best;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1) {   // hands up while its bubble holds
    const v = unitOf(w, b.victim);
    if (!v || !(v.floating > now) || !(v.hp > 0)) { b.victim = -1; act(w, u, 0); }
  }
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (now >= b.next) {
    let m = null;
    if (t && floatable(w, t) && hypot(t.x - u.x, t.y - u.y) <= T.range && clearLine(w, u)) m = t;
    else if (u.possessed !== 1 && (w.tick + u.index) % T.scanEvery === 0) m = findMark(w, u, u.x, u.y, T.range);
    if (m) { setState(u, STATE.ENGAGE); cast(w, u, m); return; }
  }
  if (b.act === 1) { const v = unitOf(w, b.victim); if (v) u.face = Math.atan2(v.y - u.y, v.x - u.x); }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (meleeFight(w, u, t, T.slap, dx, dy, d) !== 0) return;
  if (u.possessed === 1 || !clearLine(w, u) || d > T.range) { closeOn(w, u, t, dx, dy, d); return; }
  keepAt(w, u, t, dx, dy, d, T.want, T.band);
}

const D = alien({
  type: 'gravity', og: 'Gravity Alien (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.8,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3,
  weapon: { range: T.range },   // possess: aim reach
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.b.next = w.time + T.cooldown * 0.4 * w.rng(); },
  // possessed, attack held at nobody: bubble the floatable enemy nearest the aim point, else an empty slap
  possessFire(w, u, aim, ax, ay) {
    const m = w.time >= u.b.next ? findMark(w, u, ax, ay, T.aimPick) : null;
    if (m) cast(w, u, m); else swing(w, u, T.slap.cooldown);
  },
  brain,
});
export default D;
export { T };
