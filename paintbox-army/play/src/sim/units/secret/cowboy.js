// Cowboy (OURS, Secret tab, Part 2 step 7): two revolvers and a lasso. Revolvers: range 260, 6 shots 0.18 s apart (11
// each, plain bullets, the hands take turns), then a 2.2 s reload. Lasso: every 6 s, an enemy of mass ≤ 6 standing 60-200
// px away in clear sight: the rope flies 0.3 s (projectile `lasso`: p.host = the cowboy, p.victim = the one it's for),
// then he drags it to ~30 px in front of him over 0.8 s (stunned while dragged), then fires point blank. Hat (it can
// fly off). Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 shoot → `shootL` / `shootR` by b.hand (0 left, 1 right; 0.15 s per shot), 2 lasso
// throw → `lasso` (rope flying), 3 drag → `pull` (b.victim), 4 reload → `reload`.
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, hunt, idle, fleeing, clearLine, grabbable, glue, letGo,
  high, unitOf, shoot, spawnProjectile, removeProjectile, registerProjectileKind, heldBy,
  hypot, angleDiff, STATE, ENEMY, F, SEC, DT,
} from './_lib.js';

const T = {
  radius: 8.6,        // OG-raw radius (registerUnit ×1.1)
  hp: 160,            // hit points
  mass: 1,            // a person
  walk: 60, run: 100, // px/s
  gun: {              // the revolvers (both hands share one weapon spec)
    range: 260,           // px
    projectileSpeed: 820, // px/s
    damage: 11,           // per bullet
    damageJitter: 1,      // ±
    noiseRadius: 240,     // px: noise splat (wakes enemies)
    smoke: 0.7,           // muzzle smoke size
  },
  shots: 6,           // bullets per reload (both guns together)
  shotGap: 0.18,      // s between shots
  spread: 0.06,       // rad ± (triangular)
  aimTol: 0.2,        // rad: fires once facing the target this well
  reload: 2.2,        // s
  tooClose: 50,       // px: backs off from a target closer than this (unless it is the lassoed one)
  lassoEvery: 6,      // s between lassos
  lassoMass: 6,       // lassoes units this light or lighter ...
  lassoMin: 60,       // ... standing this far ...
  lassoMax: 200,      // ... up to this far
  lassoSlack: 50,     // px past lassoMax the victim may have got to while the rope flew: still caught
  ropeTime: 0.3,      // s the rope flies
  dragTime: 0.8,      // s dragging the victim in
  dragTo: 30,         // px from his middle: where the victim ends up (at least both radii + 6)
  dragHop: 5,         // px: the victim bumps along this high
  tangled: 0.8,       // s the victim stays stunned after the drag
  pointBlank: 1.5,    // s of point-blank shooting after a drag (or until it dies)
  scanEvery: 12,      // ticks between lasso target scans
  sight: 340,         // px
};
const PB = 1, ROPE = 2, DRAG = 3, RELOAD = 4;   // subState (1 point blank, 2 rope flying, 3 dragging, 4 reloading)

// ---- the rope (projectile 'lasso'): an effect that follows the cowboy's throw; the brain does the catching / dragging
function stepLasso(w, p, i) {
  const h = unitOf(w, p.host), v = unitOf(w, p.victim);
  if (!h || !v || !(h.hp > 0) || h.b.victim !== p.victim || (h.subState !== ROPE && h.subState !== DRAG)) { removeProjectile(w, i); return; }
  p.px = p.x; p.py = p.y;
  if (h.subState === ROPE) {
    const f = Math.min(1, (w.time - h.b.t0) / T.ropeTime), hx = h.x + Math.cos(h.heading) * h.radius, hy = h.y + Math.sin(h.heading) * h.radius;
    p.x = hx + (v.x - hx) * f; p.y = hy + (v.y - hy) * f; p.z = 8 + 10 * Math.sin(Math.PI * f); p.k = 0;
  } else { p.x = v.x; p.y = v.y; p.z = Math.max(0, v.z); p.k = 1; }
}
registerProjectileKind('lasso', stepLasso);

function lassoable(w, u, o) { return grabbable(o, T.lassoMass) && !high(o); }
const LQ = new Array(48);
function findLasso(w, u, t) {
  if (t && lassoable(w, u, t)) {
    const d = hypot(t.x - u.x, t.y - u.y);
    if (d >= T.lassoMin && d <= T.lassoMax && clearLine(w, u)) return t;
  }
  const n = w.queryMask(u.x, u.y, T.lassoMax, ENEMY[u.faction], LQ, LQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = LQ[k]; LQ[k] = null;
    if (o.dead || !lassoable(w, u, o) || (o.unseen > 0 && o.unseen < 1)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < T.lassoMin || d > T.lassoMax || d >= bd) continue;
    if (w.walls.count > 0 && !w.walls.lineOfSight(u.x, u.y, o.x, o.y)) continue;
    bd = d; best = o;
  }
  return best;
}
function throwRope(w, u, v) {
  const b = u.b;
  u.subState = ROPE; b.victim = v.id; b.t0 = w.time; b.next2 = w.time + T.lassoEvery;
  act(w, u, 2); u.face = Math.atan2(v.y - u.y, v.x - u.x);
  const p = spawnProjectile(w, 'lasso', u.x, u.y, 0, 0, 9, 0, F.Props, u);   // Props: nobody's enemy (domes ignore it)
  if (p) { p.host = u.id; p.victim = v.id; p.k = 0; p.z = 8; }
  w.emit('throw', { x: u.x, y: u.y, v: 0.6, type: u.type, lasso: 1 });   // STEP7 AUDIO: lasso whoosh
}
function endRope(w, u) { const b = u.b; u.subState = 0; b.victim = -1; act(w, u, 0); }
// the rope reaches: caught (still alive, free, near enough) -> drag; else it falls short
function ropeStep(w, u) {
  const b = u.b, v = unitOf(w, b.victim);
  if (v) u.face = Math.atan2(v.y - u.y, v.x - u.x);
  if (w.time - b.t0 < T.ropeTime) return;
  if (!v || !lassoable(w, u, v) || hypot(v.x - u.x, v.y - u.y) > T.lassoMax + T.lassoSlack) { endRope(w, u); return; }
  u.subState = DRAG; b.t0 = w.time; b.x0 = v.x; b.y0 = v.y;
  const d = hypot(v.x - u.x, v.y - u.y) || 1; b.dx = (v.x - u.x) / d; b.dy = (v.y - u.y) / d;
  v.hurled = 1; v.target = -1; if (v.stun < 0.3) v.stun = 0.3;
  heldBy(w, u, v);
  act(w, u, 3);
  w.emit('strike', { x: v.x, y: v.y, v: 0.5, type: u.type, lasso: 1 });
}
// dragged in: along the ground to `dragTo` px in front of him (where he faced at the catch), bumping along
function dragStep(w, u) {
  const b = u.b, v = unitOf(w, b.victim);
  u.goalX = 0; u.goalY = 0;
  if (!v || !(v.hp > 0) || v.inside >= 0) { if (v) letGo(w, v, 0); endRope(w, u); return; }
  const f = Math.min(1, (w.time - b.t0) / T.dragTime), e = f * f * (3 - 2 * f);
  const R = Math.max(T.dragTo, u.radius + v.radius + 6), fx = u.x + b.dx * R, fy = u.y + b.dy * R;
  u.face = Math.atan2(b.dy, b.dx); setState(u, STATE.ENGAGE);
  glue(v, b.x0 + (fx - b.x0) * e, b.y0 + (fy - b.y0) * e, SEC.HELD_Z + T.dragHop * Math.sin(Math.PI * Math.min(1, f * 3)), 0, 0);
  v.hurled = 1;
  if (f < 1) return;
  letGo(w, v, T.tangled); v.z = 0;
  u.subState = PB; b.t1 = w.time + T.pointBlank; u.target = v.id; b.victim = -1; act(w, u, 0);
}

function fire(w, u, aim) {
  const b = u.b;
  b.hand ^= 1;   // the hands take turns: b.hand = the gun that just fired (0 left, 1 right)
  shoot(w, u, aim + (w.rng() - w.rng()) * T.spread, T.gun, 'bullet');
  b.ammo--; u.cooldown = T.shotGap;
  act(w, u, 0); act(w, u, 1);   // restart the shot pose on every shot
  if (b.ammo <= 0) { u.subState = u.subState === PB ? PB : RELOAD; b.reloadAt = w.time + T.reload; if (u.subState === RELOAD) act(w, u, 4); }
}
function reloading(w, u) {
  const b = u.b;
  if (b.ammo > 0) return false;
  if (w.time >= b.reloadAt) { b.ammo = T.shots; if (u.subState === RELOAD) u.subState = 0; if (u.b.act === 4) act(w, u, 0); return false; }
  if (u.b.act !== 4 && u.b.act !== 2 && u.b.act !== 3 && w.time - u.b.actT > 0.15) act(w, u, 4);
  return true;
}

// every tick, before the brain (which skips ticks while it reacts to a new target): the rope and the drag
function carry(w, u) {
  if (w.holding) return;
  if (u.subState === DRAG) { dragStep(w, u); return; }
  if (u.subState !== ROPE) return;
  u.goalX = 0; u.goalY = 0;
  if (u.stun > 0) { endRope(w, u); return; }
  ropeStep(w, u);
}
function brain(w, u) {
  const b = u.b, now = w.time;
  if (u.subState === DRAG || u.subState === ROPE) return;   // carry() runs them
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  actDone(w, u, 1, 0.15);
  if (u.stun > 0) { u.face = u.heading; return; }
  const empty = reloading(w, u);
  if (u.subState === PB) {   // point blank at the one he just roped in
    const v = unitOf(w, u.target);
    if (!v || !(v.hp > 0) || now >= b.t1) { u.subState = empty ? RELOAD : 0; }
    else {
      setState(u, STATE.ENGAGE);
      const a = Math.atan2(v.y - u.y, v.x - u.x); u.face = a;
      if (!empty && u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < T.aimTol * 2) fire(w, u, a);
      return;
    }
  }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  // lasso when it's ready
  if (now >= b.next2 && canAuto(w, u) && (w.tick + u.index) % T.scanEvery === 0) {   // (reloading too: the rope fills the wait)
    const v = findLasso(w, u, t);
    if (v) { throwRope(w, u, v); return; }
  }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const range = u.state === STATE.ENGAGE ? T.gun.range * 1.08 : T.gun.range;
  if (d > range || !clearLine(w, u)) { hunt(w, u, t, d > range + 120 ? T.walk : T.run); return; }
  setState(u, STATE.ENGAGE);
  const lead = d / T.gun.projectileSpeed, a = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
  u.face = a;
  if (d < T.tooClose) { u.goalX = -dx / d * T.walk; u.goalY = -dy / d * T.walk; }
  if (!empty && u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < T.aimTol) fire(w, u, a);
}

secret({
  type: 'cowboy', og: 'Cowboy (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.4, melee: false,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3, accel: 700, decel: 700, turnRate: 9,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.25,
  intelligence: 2, flammability: 0.5, density: 1,   // a person (Trained: knows mines)
  weapon: T.gun,       // possess: aim reach (range)
  risenMode: 'body',   // a zombie in a cowboy's body (people-like, as pirates / aliens)
  brushSpacing: 22,
  flock: { separation: 30, formation: 0.8 },
  look: { attack: { time: 0.3 }, hat: true },
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.ammo = T.shots - Math.floor(w.rng() * 3); b.hand = 1; b.reloadAt = 0;   // first shot: left
    b.next2 = w.time + 1 + w.rng() * 2; u.cooldown = w.rng() * 0.4;
  },
  holdsNerve(w, u) { return u.subState === DRAG || u.subState === ROPE; },
  carry,
  onDeath(w, u) { if (u.subState === DRAG) letGo(w, unitOf(w, u.b.victim), 0.3); },
  // possessed, attack held at nobody: fan the hammers at the aim
  possessFire(w, u, aim) {
    if (u.subState === ROPE || u.subState === DRAG || reloading(w, u) || u.cooldown > 0) return;
    fire(w, u, aim);
  },
  brain,
});
export { T };
