// Stink bug (OURS, Part 2 step 6): every 6 s with an enemy within 90 px (and once at once when a hit first takes it below
// half hp) it puffs a stink cloud r 80 that lasts 5 s and drifts slowly (effect projectile `gas`). Units inside that are
// hostile to it and not bugs lose morale fast (they break and run: a strong fright, like burning; Mindless units and
// machines don't care) and take 2 hp/s (machines don't breathe: no damage). Bugs of any side don't mind the stink.
// Bites 8. Owner: BUGS-SIM.
// Pose codes (STEP6.md): b.act 1 puff → `puff`. Cloud = effect projectile `gas` (ground: false): p.r = 80, p.age (s),
// p.life / p.maxLife (5 s); it drifts (p.vx, p.vy ~ 6 px/s).
import {
  bug, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, canAuto, isBug, living, damage,
  spawnProjectile, removeProjectile, registerProjectileKind, hypot, STATE, ENEMY, INT, F, BUG, DT,
} from './_lib.js';

const T = {
  radius: 8,          // OG-raw radius (registerUnit ×1.1)
  hp: 100,
  mass: 1.2,
  walk: 50, run: 100, // px/s
  puffEvery: 6,       // s between clouds ...
  puffNear: 90,       // ... with an enemy this close (px, centre to centre)
  halfAt: 0.5,        // a hit that first takes it below half hp: a cloud at once
  cloudR: 80,         // px
  cloudLife: 5,       // s
  drift: 6,           // px/s: the cloud wanders off this slowly (no wind)
  dps: 2,             // hp/s to the living inside
  fright: 1.6,        // morale lost per s inside (burning costs 1.2/s): soldiers break in about half a second
  every: 0.25,        // s between the cloud's checks (damage + fright come in these chunks)
  coughEvery: 0.5,    // s: one of the units inside coughs (fx + sound)
  pose: 0.6,          // s of the `puff` pose
  bite: 8, biteEvery: 0.9,
};
const EVERY_T = Math.round(T.every / DT);

// ---- the cloud (effect projectile 'gas')
const GQ = new Array(64);
function stepGas(w, p, i) {
  p.px = p.x; p.py = p.y; p.age += DT; p.life -= DT;
  if (p.life <= 0) { removeProjectile(w, i); return; }
  p.x = Math.min(w.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(w.H, Math.max(0, p.y + p.vy * DT));
  if ((w.tick + i) % EVERY_T !== 0) return;
  const n = w.queryMask(p.x, p.y, p.r + BUG.MARGIN, ENEMY[p.fac] || 0, GQ, GQ.length);
  let cough = null;
  for (let k = 0; k < n; k++) {
    const o = GQ[k]; GQ[k] = null;
    if (o.dead || !(o.hp > 0) || isBug(o) || !living(o)) continue;   // bugs and machines don't care (living: no machines, props)
    if (hypot(o.x - p.x, o.y - p.y) > p.r + 0.5 * o.radius) continue;
    damage(w, o, T.dps * T.every, p.owner, 'gas', o.x, o.y);   // from its own spot: shields don't keep out a smell
    const m = o.def.morale;
    if (o.def.intelligence !== INT.Mindless && m && m.canBreak && o.possessed !== 1) {
      o.morale = Math.max(0, o.morale - T.fright * T.every);
      if (o.morale < m.breakAt && o.state !== STATE.FLEE && !(o.def.holdsNerve && o.def.holdsNerve(w, o) === true)) {
        o.state = STATE.FLEE; o.stateTime = 0;
        w.emit('panic', { x: o.x, y: o.y, type: o.type });
      }
    }
    if (!cough || w.rng() < 0.3) cough = o;
  }
  if (cough && Math.floor(p.age / T.coughEvery) !== Math.floor((p.age - T.every) / T.coughEvery)) w.emit('cough', { x: cough.x, y: cough.y, type: cough.type });
}
registerProjectileKind('gas', stepGas);

function puff(w, u) {
  const a = w.rng() * Math.PI * 2;
  const p = spawnProjectile(w, 'gas', u.x, u.y, Math.cos(a) * T.drift, Math.sin(a) * T.drift, T.cloudLife, 0, F.Props, u);   // faction Props: nobody's enemy (domes ignore it)
  if (p) { p.r = T.cloudR; p.age = 0; p.fac = u.faction; }
  u.b.next = w.time + T.puffEvery;
  act(w, u, 1);
  w.emit('cough', { x: u.x, y: u.y, type: u.type });
  return p;
}

const NQ = new Array(16);
function enemyNear(w, u) {
  const n = w.queryMask(u.x, u.y, T.puffNear, ENEMY[u.faction], NQ, NQ.length);
  let any = false;
  for (let k = 0; k < n; k++) { const o = NQ[k]; NQ[k] = null; if (!any && !o.dead && o.hp > 0 && !isBug(o) && !o.def.prop) any = true; }
  return any;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.pose) act(w, u, 0);
  if (b.flag === 1) { b.flag = 0; if (canAuto(w, u)) puff(w, u); }   // hit below half: a cloud at once
  if (u.stun > 0) { u.face = u.heading; return; }
  if (now >= b.next && canAuto(w, u) && (w.tick + u.index) % 6 === 0 && enemyNear(w, u)) puff(w, u);
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d <= u.radius + t.radius + 4) {
    setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx);
    if (u.cooldown <= 0) bite(w, u, t, T.bite, T.biteEvery, 30, 0);
    return;
  }
  hunt(w, u, t, d < 200 ? T.run : T.walk, d < 200 ? STATE.CHARGE : STATE.ADVANCE);
}

bug({
  type: 'stinkbug', og: 'Stinkbug (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 160, accel: 600, decel: 600, turnRate: 7,
  sightRange: 260, alertSightRange: 320, flammability: 0.5,
  brushSpacing: 24,
  morale: { baseline: 0.95, breakAt: 0.2 },
  init(w, u) { initBag(w, u); u.b.next = w.time + 1 + 2 * w.rng(); },
  onHit(w, u, amount) {
    if (u.b.n === 0 && u.hp > 0 && u.hp < T.halfAt * u.maxHp) { u.b.n = 1; u.b.flag = 1; }   // once: the next brain tick puffs
  },
  // possessed, attack held at nobody: puff a cloud right here (when ready)
  possessFire(w, u) { if (w.time >= u.b.next) puff(w, u); },
  brain,
});
export { T };
