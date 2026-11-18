// Spider (OURS, Part 2 step 6): shoots a web at a target 40-180 px away (projectile `web`, 450 px/s): the unit it hits is
// webbed 3 s (u.webbed: steering.js holds its own steps, it can still turn and attack) and a web patch r 20 stays 8 s where
// it hit (or where it landed / met a wall). An enemy that steps into a patch is webbed 1 s, then gets 1 s free to walk out
// (a patch never holds anyone forever). Bugs walk through patches. It webs the ones that aren't webbed yet, then runs in
// and bites (12 + poison 2 hp/s for 3 s). Owner: BUGS-SIM.
// Pose codes (STEP6.md): b.act 1 shoot → `shoot` (rears up); `atk` bite. Effect projectiles: `webon` on a webbed unit
// (_lib.js: follows it, p.r = its radius), `webpatch` on the floor (ground: true; p.r = 20, p.age, p.life / p.maxLife).
import { fireProjectile } from '../../combat/index.js';
import {
  bug, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, poison, perchOf, clearLine, high, grounded, isBug, webbable, webFor,
  spawnProjectile, removeProjectile, registerProjectileKind, raycast, hypot, angleDiff, STATE, ENEMY, F, BUG, DT,
} from './_lib.js';

const T = {
  radius: 8,          // OG-raw radius (registerUnit ×1.1)
  hp: 90,
  mass: 1,
  walk: 70, run: 150, // px/s
  webMin: 40,         // px: a target closer than this gets bitten, not webbed
  webMax: 180,        // px: web range
  webSpeed: 450,      // px/s
  webTime: 3,         // s the unit it hits is webbed
  webH: 7,            // px: the web flies at this height (art)
  hitPad: 3,          // px past a body: the web still sticks
  overshoot: 8,       // px: a web that misses lands this far past the aim point
  patchR: 20,         // px: the web patch left where it hit
  patchLife: 8,       // s
  patchHold: 1,       // s webbed for stepping into a patch ...
  patchFree: 1,       // ... then this long free of patches (it can walk out)
  patchEvery: 3,      // ticks between patch checks
  reload: 2.5,        // s between webs
  aimTol: 0.5,        // rad: shoots only when facing this close to the aim
  pose: 0.4,          // s of the `shoot` pose (rearing up)
  freshWeb: 0.6,      // s: a target still webbed this much longer isn't webbed again (it runs in to bite)
  waitWeb: 1.5,       // s: with its web this close to ready it holds at range (an unwebbed target) instead of running in ...
  holdAt: 110,        // px: ... once it's this close
  bite: 12,           // bite damage (+ one poison stack when it gets through)
  biteEvery: 0.9,     // s between bites
};

// ---- the web shot (projectile kind 'web'): flies straight; sticks to the first enemy it touches (webs it), leaves a patch
const HQ = new Array(24);
function stepWeb(w, p, i) {
  p.px = p.x; p.py = p.y; p.age += DT; p.life -= DT;
  let nx = p.x + p.vx * DT, ny = p.y + p.vy * DT;
  if (w.walls.count > 0) {
    const t = raycast(w, p.x, p.y, nx, ny);
    if (t <= 1) { const k = Math.max(0, t - 0.1); patch(w, p, p.x + (nx - p.x) * k, p.y + (ny - p.y) * k); removeProjectile(w, i); return; }
  }
  p.x = nx = Math.min(w.W, Math.max(0, nx)); p.y = ny = Math.min(w.H, Math.max(0, ny));
  let best = null, bd = Infinity;
  const n = w.queryMask(nx, ny, BUG.MARGIN + T.hitPad, ENEMY[p.faction] || 0, HQ, HQ.length);
  for (let k = 0; k < n; k++) {
    const o = HQ[k]; HQ[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0 || o.hidden > 0) continue;
    const c = hypot(o.x - nx, o.y - ny) - o.radius;
    if (c < T.hitPad && c < bd) { bd = c; best = o; }
  }
  if (best) {
    const owner = w.unitById(p.owner);
    if (webFor(w, best, T.webTime, owner)) w.emit('strike', { x: best.x, y: best.y, v: 0.4, type: 'spider', web: 1 });   // STEP6 AUDIO: web splat
    patch(w, p, best.x, best.y);
    removeProjectile(w, i); return;
  }
  if (p.life <= 0) { patch(w, p, nx, ny); removeProjectile(w, i); }
}
registerProjectileKind('web', stepWeb);

// ---- the web patch (effect projectile 'webpatch'): sits on the floor 8 s and webs enemies that step in
function patch(w, p, x, y) {
  const q = spawnProjectile(w, 'webpatch', x, y, 0, 0, T.patchLife, 0, F.Props, p.owner);   // faction Props: nobody's enemy (domes ignore it)
  if (q) { q.r = T.patchR; q.age = 0; q.fac = p.faction; }
}
const PQ = new Array(32);
function stepPatch(w, p, i) {
  p.px = p.x; p.py = p.y; p.age += DT; p.life -= DT;
  if (p.life <= 0) { removeProjectile(w, i); return; }
  if ((w.tick + i) % T.patchEvery !== 0) return;   // patches are few; spread their checks over ticks
  const now = w.time, n = w.queryMask(p.x, p.y, p.r + BUG.MARGIN, ENEMY[p.fac] || 0, PQ, PQ.length);
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (o.dead || isBug(o) || !grounded(o) || o.leaping !== 0 || !webbable(o)) continue;
    if (o.webbed > now - T.patchFree) continue;   // held now, or only just let go: give it time to walk out
    if (hypot(o.x - p.x, o.y - p.y) > p.r + 0.5 * o.radius) continue;
    webFor(w, o, T.patchHold, w.unitById(p.owner));
  }
}
registerProjectileKind('webpatch', stepPatch);

function shoot(w, u, ax, ay, over) {
  const life = (Math.min(T.webMax, hypot(ax - u.x, ay - u.y)) - 1.1 * u.radius + over) / T.webSpeed;   // from the muzzle to `over` px past the aim
  const p = fireProjectile(w, 'web', u, ax, ay, { speed: T.webSpeed, life, muzzle: 1.1 });
  if (p) { p.z = T.webH; p.age = 0; }
  u.b.next = w.time + T.reload;
  act(w, u, 1);
  w.emit('throw', { x: u.x, y: u.y, v: 0.4, type: u.type });
  return p;
}
function biteIt(w, u, t) {
  const v = perchOf(w, t), pass = bite(w, u, t, T.bite, T.biteEvery, 40, 0.1);
  if (pass >= 0.5) poison(w, v, u);
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
  if (d <= u.radius + t.radius + 4 && !high(t)) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0) biteIt(w, u, t);
    return;
  }
  const fresh = t.webbed > now + T.freshWeb, webIt = !fresh && webbable(t) && !high(t) && d >= T.webMin && d <= T.webMax && clearLine(w, u);
  if (webIt && now >= b.next) {
    setState(u, STATE.ENGAGE); u.face = a;
    const lead = d / T.webSpeed;
    if (Math.abs(angleDiff(u.heading, a)) < T.aimTol) shoot(w, u, t.x + t.vx * lead, t.y + t.vy * lead, T.overshoot);
    return;
  }
  if (webIt && now >= b.next - T.waitWeb && d <= T.holdAt) { setState(u, STATE.ENGAGE); u.face = a; return; }   // web nearly ready: wait at range
  hunt(w, u, t, d < 260 ? T.run : T.walk, d < 260 ? STATE.CHARGE : STATE.ADVANCE);
}

bug({
  type: 'spider', og: 'Spider (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 230, accel: 800, decel: 800, turnRate: 9,
  sightRange: 300, alertSightRange: 360, flammability: 0.6,
  brushSpacing: 24,
  weapon: { range: T.webMax },   // for possess (aim reach) and readers
  init(w, u) { initBag(w, u); u.b.next = w.time + T.reload * 0.5 * w.rng(); },
  // possessed, attack held at nobody: web the aim point (kept inside 40-180 px): the patch lands there
  possessFire(w, u, aim, ax, ay) {
    if (w.time < u.b.next) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(T.webMin, Math.min(T.webMax, d)) / d;
    u.face = aim;
    shoot(w, u, u.x + dx * k, u.y + dy * k, 0);
  },
  brain,
});
export { T };
