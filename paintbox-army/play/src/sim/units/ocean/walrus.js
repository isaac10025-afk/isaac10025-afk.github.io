// Walrus (OURS, Part 2 step 6): big and slow (30 / 70, swims 90), can't be tossed. BELLY SLIDE: a target 60-260 px
// away → it flops and slides at 240 px/s toward (and a little past) where the target was: on ice or in water it slides
// the whole way, on plain ground it stops after 0.6 s of ground. Every enemy it hits takes 30 and is tossed aside.
// A wall (or anything that stops it dead) ends the slide. 4 s between slides. Tusks 28 every 1.3 s. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 slide (on its belly, flippers back; also the 0.4 s it lies there after).
import {
  sea, initBag, prelude, targetOf, act, setState, hunt, idle, fleeing, bite, damage, tossTo, canAuto, clearLine,
  hypot, angleDiff, STATE, ENEMY, WET, DT, SEA,
} from './_lib.js';

const T = {
  radius: 15,         // OG-raw radius (registerUnit ×1.1)
  hp: 600,            // hit points
  mass: 6,            // heavy (and untossable)
  walk: 30,           // px/s walking on land
  run: 70,            // px/s on land (closing in)
  swim: 90,           // px/s in water (waterPace = swim / run)
  slideMin: 60,       // px: slides at a target this far ...
  slideMax: 260,      // ... up to this far
  slideSpeed: 240,    // px/s on its belly
  slidePast: 40,      // px: aims this far past where the target was
  slideGround: 0.6,   // s of plain ground and the slide is over (ice and water don't count)
  slideLong: 2.5,     // s: any slide is over after this
  slideStuck: 0.45,   // × slideSpeed: slower than this after the first 0.1 s = it hit something (a wall)
  slideEvery: 4,      // s between slides
  getUp: 0.4,         // s it lies there after a slide (still the slide pose, can't act)
  slideHit: 30,       // damage to each enemy it slides into ...
  hitGap: 4,          // ... (px past both bodies) ...
  tossAside: 70,      // ... tossed this far to the side ...
  tossUp: 150,        // ... with this upward speed
  tusk: 28,           // tusk damage ...
  tuskEvery: 1.3,     // ... every 1.3 s
  reach: 7,           // px past both bodies
  facing: 0.7,        // rad: must face the target this well to tusk
  hitsMax: 24,        // units remembered per slide (each is hit once)
  flammability: 0.3,  // blubber
};
const SLIDE = 1, GETUP = 2;   // subState
const HQ = new Array(32).fill(null);

function slick(w, x, y) { return (w.iceCells > 0 && w.iceAt(x, y) > 0) || (w.waterCells > 0 && w.depthUnder(x, y) >= WET); }

// the slide's goal = its velocity (steering speeds goals up in water by waterPace: not on a slide)
function slideGoal(w, u) {
  const b = u.b, wp = w.waterCells > 0 && w.waterAt(u.x, u.y) >= WET ? D.waterPace : 1;
  u.goalX = b.dx * T.slideSpeed / wp; u.goalY = b.dy * T.slideSpeed / wp;
}
function startSlide(w, u, tx, ty) {
  const b = u.b, dx = tx - u.x, dy = ty - u.y, d = hypot(dx, dy) || 0.001;
  b.dx = dx / d; b.dy = dy / d; b.x0 = d + T.slidePast; b.t0 = w.time; b.k = 0; b.n = 0;   // x0: length, k: ground time, n: hits
  b.hits.fill(-1);
  u.subState = SLIDE; act(w, u, 1); setState(u, STATE.CHARGE);
  u.vx = b.dx * T.slideSpeed; u.vy = b.dy * T.slideSpeed; u.heading = Math.atan2(b.dy, b.dx);
  w.emit('trample', { x: u.x, y: u.y, v: 1.2, type: u.type });
}
function slide(w, u) {
  const b = u.b, age = w.time - b.t0;
  if (!slick(w, u.x, u.y)) b.k += DT;
  const sp = hypot(u.vx, u.vy);
  if (b.k >= T.slideGround || age >= T.slideLong || age * T.slideSpeed >= b.x0 || (age > 0.1 && sp < T.slideStuck * T.slideSpeed)) {
    u.subState = GETUP; b.t0 = w.time; b.next = w.time + T.slideEvery;
    u.goalX = 0; u.goalY = 0;
    return;
  }
  u.vx = b.dx * T.slideSpeed; u.vy = b.dy * T.slideSpeed;
  slideGoal(w, u);
  u.face = Math.atan2(b.dy, b.dx); setState(u, STATE.CHARGE);
  // everyone it hits: 30 + tossed aside (each once per slide)
  const n = w.queryMask(u.x, u.y, u.radius + T.hitGap + SEA.MARGIN, ENEMY[u.faction], HQ, HQ.length);
  for (let k = 0; k < n; k++) {
    const o = HQ[k]; HQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.z > 8 || o.climb > 0 || o.inside >= 0) continue;
    const ox = o.x - u.x, oy = o.y - u.y;
    if (hypot(ox, oy) > u.radius + o.radius + T.hitGap || b.hits.indexOf(o.id) >= 0) continue;
    if (b.n < T.hitsMax) b.hits[b.n++] = o.id;
    damage(w, o, T.slideHit, u, undefined, u.x, u.y);
    if (o.hp > 0) {
      const side = ox * -b.dy + oy * b.dx >= 0 ? 1 : -1;   // the side of its path the unit was on
      tossTo(w, o, -b.dy * side * 0.85 + b.dx * 0.5, b.dx * side * 0.85 + b.dy * 0.5, T.tossAside, T.tossUp);
    }
    w.emit('trample', { x: o.x, y: o.y, v: 1, type: u.type });
  }
}

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  if (u.subState === SLIDE) return;   // carry() runs the slide
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === GETUP) {
    if (now - b.t0 < T.getUp) { u.face = u.heading; return; }
    u.subState = 0; act(w, u, 0);
  }
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < T.facing) bite(w, u, t, T.tusk, T.tuskEvery, 140, 0.2);
    return;
  }
  if (now >= b.next && d >= T.slideMin && d <= T.slideMax && clearLine(w, u) && !(t.z > 8) && canAuto(w, u)) { startSlide(w, u, t.x, t.y); return; }
  hunt(w, u, t, d < 200 ? T.run : T.walk, d < 200 ? STATE.CHARGE : STATE.ADVANCE);
}

const D = sea({
  type: 'walrus', og: 'Walrus (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 3.5,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.slideSpeed * 1.05, accel: 400, decel: 450, turnRate: 3.5,
  waterPace: T.swim / T.run,
  untossable: true,
  flammability: T.flammability, density: 2, brushSpacing: 44,
  morale: { oddsWeight: 0.15, woundWeight: 0.15, breakAt: 0.15 },   // big, stubborn
  look: { attack: { time: 0.4 } },
  init(w, u) { initBag(w, u); u.b.hits = new Int32Array(T.hitsMax).fill(-1); u.b.next = w.rng() * 1.5; },
  holdsNerve(w, u) { return u.subState !== 0; },
  // every tick, before the brain (which skips ticks while it reacts to a new target): the slide goes on
  carry(w, u) { if (u.subState === SLIDE) slide(w, u); },
  // possessed, attack held at nobody: slide at the aimed spot (60-260 px out)
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next || u.stun > 0) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(T.slideMin, Math.min(T.slideMax, d)) / d;
    startSlide(w, u, u.x + dx * k, u.y + dy * k);
  },
  // sliding / lying on its belly: the stick doesn't steer it
  possessMove(w, u) {
    if (u.subState === SLIDE) slideGoal(w, u);
    else if (u.subState === GETUP) { u.goalX = 0; u.goalY = 0; }
  },
  brain,
});
export default D;
export { T };
