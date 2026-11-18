// Spitter (OURS, Part 2 step 4): small frilled dino that lobs a glob of spit 60-180 px. A hit blinds for 3 s: the blind
// unit's shots spray ±40° (projectiles.js), it sees 55 px, and its melee swings go to whoever is nearest, friend or foe
// (_lib.js dinoSense). Bites in melee. Owner: DINOS-SIM. Pose codes (STEP4.md): b.act 1 spit.
import { fireProjectile, removeProjectile } from '../../combat/index.js';
import { registerProjectileKind } from '../../combat/projectiles.js';
import { dino, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, clearLine, high, blindFor, damage, depthAt, hypot, angleDiff, ENEMY, STATE, WET, DINO } from './_lib.js';

const T = {
  radius: 8.5, hp: 90, mass: 1,
  walk: 80, run: 150,
  spitMin: 60,        // px: closer than this it backs off (or bites when touching)
  spitMax: 180,       // px: spit range
  flight: 0.5,        // s: the glob's flight
  apex: 28,           // px: top of the glob's arc
  spitDmg: 6,
  blind: 3,           // s blind
  reload: 1.6,        // s between spits
  aimTol: 0.5,        // rad: spits only when facing this close to the aim
  pose: 0.45,         // s: frill-open pose after a spit
  hitPad: 6,          // px past the body: the glob still hits
  bite: 8, biteEvery: 0.8,
};

// ---- the glob (projectile kind 'spit'): lobbed, lands on its point after `flight` s; hits the nearest enemy body there
const DT = 1 / 60, HQ = new Array(24);
function stepSpit(w, p, i) {
  p.px = p.x; p.py = p.y;
  p.x = Math.min(w.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(w.H, Math.max(0, p.y + p.vy * DT));
  const f = 1 - p.life / p.maxLife; p.z = 4 * p.apex * f * (1 - f);
  p.life -= DT;
  if (p.life > 0) return;
  let best = null, bd = Infinity;
  const n = w.queryMask(p.x, p.y, DINO.MARGIN + T.hitPad, ENEMY[p.faction] || 0, HQ, HQ.length);
  for (let k = 0; k < n; k++) {
    const o = HQ[k]; HQ[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop || high(o)) continue;
    const c = hypot(o.x - p.x, o.y - p.y) - o.radius;
    if (c < T.hitPad && c < bd) { bd = c; best = o; }
  }
  if (best) {
    const pass = damage(w, best, p.damage, p.owner, undefined, p.x - p.vx * 0.2, p.y - p.vy * 0.2);
    if (pass >= 0.5) blindFor(w, best, T.blind);
    w.emit(pass < 0.5 ? 'block' : 'arrowhit', { x: p.x, y: p.y, v: 0.4, type: best.type, spit: 1 });   // STEP4 AUDIO: spit: splat
  } else if (depthAt(w, p.x, p.y) >= WET) w.emit('splash', { x: p.x, y: p.y, v: 0.4 });
  else w.emit('arrowhit', { x: p.x, y: p.y, v: 0.3, spit: 1 });   // STEP4 AUDIO
  removeProjectile(w, i);
}
registerProjectileKind('spit', stepSpit);

function spit(w, u, ax, ay) {
  const p = fireProjectile(w, 'spit', u, ax, ay, { life: T.flight, apex: T.apex, damage: T.spitDmg, muzzle: 1.1 });
  u.b.next = w.time + T.reload;
  act(w, u, 1);
  w.emit('throw', { x: u.x, y: u.y, v: 0.5, type: u.type });
  return p;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + 4) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0) bite(w, u, t, T.bite, T.biteEvery, 40, 0.1);
    return;
  }
  const max = u.state === STATE.ENGAGE ? T.spitMax * 1.1 + 6 : T.spitMax;
  if (d > max || !clearLine(w, u)) { hunt(w, u, t, d > 300 ? T.walk : T.run); return; }
  setState(u, STATE.ENGAGE); u.face = a;
  if (d < T.spitMin) { u.goalX = -dx / d * T.run; u.goalY = -dy / d * T.run; } // too close: back off to spitting range
  if (now >= b.next && Math.abs(angleDiff(u.heading, a)) < T.aimTol && d >= 0.6 * T.spitMin) {
    spit(w, u, t.x + t.vx * T.flight, t.y + t.vy * T.flight);   // the glob always takes `flight` s: lead by that
  }
}

dino({
  type: 'spitter', og: 'Spitter',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.9, melee: false,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 220, accel: 700, decel: 700, turnRate: 8,
  sightRange: 320, alertSightRange: 360, flammability: 0.6, density: 1,
  brushSpacing: 26,
  morale: { baseline: 0.8, oddsWeight: 0.45, breakAt: 0.3 },
  init(w, u) { initBag(w, u); u.b.next = w.time + T.reload * w.rng(); },
  // possessed, attack held at nobody: spit at the aim point (kept inside 60-180 px)
  possessFire(w, u, aim, ax, ay) {
    if (w.time < u.b.next) return;
    let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.max(T.spitMin, Math.min(T.spitMax, d)) / d;
    dx *= k; dy *= k;
    spit(w, u, u.x + dx, u.y + dy);
  },
  brain,
});
