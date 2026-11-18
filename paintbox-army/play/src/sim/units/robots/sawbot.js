// sawbot (OURS, Robots tab): a buzz-saw on wheels. SAW RUN: picks the thickest enemy crowd within 250 px and rolls into
// it at 200 px/s, straight through and 70 px out the far side (2 s at most): every enemy it touches (r + 6) takes 12
// (once per 0.2 s each) and is shoved aside off its line. It ploughs on through (bodies don't block it: during the run
// it moves like the ninja's dash, `u.leaping` 1, so steering's crowd blocking skips it) and bounces off walls (twice at
// most). Then it brakes, turns round (0.4 s) and goes again. Out of runs (no enemy within 250) it walks to the fight.
// b.act: 1 sawing / rolling fast → `spin0`/`spin1` (blade spins, sparks).
import { robot, initB, setAct, begin, shortOut, targetOf, idle, closeOn, mayAttack, crowdTarget, touchable, hypot, STATE, DT, CB, setState, ROBOT, TAU } from './_lib.js';
import { canHit, ALL_MASK } from '../../factions.js';

const T = {
  hp: 140, // hit points
  mass: 2.5, // -
  walk: 60, // px/s walking to the fight
  run: 200, // px/s: saw-run speed
  accel: 900, // px/s² getting up to run speed
  scanR: 250, // px: looks this far for a crowd
  scanEvery: 15, // ticks between crowd searches
  over: 70, // px: runs on past the crowd point
  maxRun: 2, // s: longest run
  touch: 6, // px past both radii: touching the saw
  dmg: 12, // per touch ...
  every: 0.2, // ... at most once per 0.2 s per victim
  shove: 140, // push aside off the saw's line (÷ mass)
  shoveFwd: 0.35, // × shove along the run
  shoveStun: 0.15, // s
  bounces: 2, // wall bounces per run
  turn: 0.4, // s braking and turning round after a run
  steer: 2.5, // rad/s: a driving player can bend a run this fast
  home: 1.6, // rad/s: the run bends toward its pick until it reaches it (a straight run is too easy to step aside from)
};
const RUN = 1, TURN = 2;   // subState
const HN = 8;              // victims remembered per run (the 0.2 s rule)

// ---------------------------------------------------------------- the saw
let _w = null, _u = null;
function sawOne(o) {
  const u = _u, w = _w, b = u.b;
  if (o === u || !(o.hp > 0) || !canHit(u, o) || !touchable(o)) return;
  const ox = o.x - u.x, oy = o.y - u.y, d = hypot(ox, oy);
  if (d > u.radius + o.radius + T.touch) return;
  for (let k = 0; k < HN; k++) if (b.hitId[k] === o.id && w.time - b.hitT[k] < T.every) return;
  b.hitId[b.hk] = o.id; b.hitT[b.hk] = w.time; b.hk = (b.hk + 1) % HN;
  CB.damage(w, o, T.dmg, u);
  if (o.hp > 0) {
    const side = b.dx * oy - b.dy * ox >= 0 ? 1 : -1;
    CB.push(w, o, -b.dy * side + b.dx * T.shoveFwd, b.dx * side + b.dy * T.shoveFwd, T.shove, T.shoveStun);
  }
  w.emit('strike', { x: o.x, y: o.y, v: 1, type: u.type });
  if ((w.tick & 1) === 0) w.emit('spark', { x: u.x + ox * 0.5, y: u.y + oy * 0.5, ang: Math.atan2(-b.dy, -b.dx) + w.rng() - 0.5, size: 0.8 });
  u.attack = 1;
}
function saw(world, u) {
  _w = world; _u = u;
  world.query(u.x, u.y, u.radius + T.touch + ROBOT.margin, sawOne, ALL_MASK);
  _w = null; _u = null;
}

function startRun(world, u, tx, ty, pick) {
  const b = u.b, dx = tx - u.x, dy = ty - u.y, d = hypot(dx, dy) || 1;
  b.dx = dx / d; b.dy = dy / d; b.pick = pick ? pick.id : -1;
  b.until = world.time + Math.min(T.maxRun, (d + T.over) / T.run);
  b.bounces = 0;
  u.subState = RUN; u.leaping = 1;
  u.heading = Math.atan2(b.dy, b.dx);
  setAct(world, u, 1);
  setState(u, STATE.ENGAGE);   // not CHARGE: OG gunners sidestep a charger (the cavalry dodge); a saw just rolls in
  world.emit('saw', { x: u.x, y: u.y, type: u.type, id: u.id });
}
function endRun(world, u) {
  const b = u.b;
  u.subState = TURN; u.leaping = 0;
  b.until = world.time + T.turn;
  setAct(world, u, 0);
}
function bounce(world, u, flipX, flipY, x, y) {
  const b = u.b;
  if (flipX) b.dx = -b.dx;
  if (flipY) b.dy = -b.dy;
  b.bounces++;
  world.emit('ricochet', { x, y, v: 1, type: u.type });
  CB.spark(world, x, y, Math.atan2(b.dy, b.dx), 1);
}
function runStep(world, u) {
  const b = u.b;
  if (u.stun > 0 || world.time >= b.until || u.webbed > world.time || u.floating > world.time) { endRun(world, u); return; }
  const along = u.vx * b.dx + u.vy * b.dy, v = Math.min(T.run, Math.max(0, along) + T.accel * DT);
  const p = b.pick >= 0 ? world.unitById(b.pick) : null;
  if (p && p.hp > 0 && u.possessed !== 1) {             // bend toward the pick until it is reached, then straight on through
    const px = p.x - u.x, py = p.y - u.y, pd = hypot(px, py);
    if (pd < u.radius + p.radius || px * b.dx + py * b.dy <= 0) b.pick = -1;
    else turnRun(b, Math.atan2(py, px), T.home * DT);
  }
  // walls ahead: bounce off (per axis); the field edge too
  const r = u.radius, step = v * DT + r;
  if (world.walls.count > 0 && world.walls.isSolidAt(u.x + b.dx * step, u.y + b.dy * step)) {
    const fx = world.walls.isSolidAt(u.x + b.dx * step, u.y), fy = world.walls.isSolidAt(u.x, u.y + b.dy * step);
    bounce(world, u, fx || !fy, fy || !fx, u.x + b.dx * r, u.y + b.dy * r);
  }
  const ex = (u.x < r + 2 && b.dx < 0) || (u.x > world.W - r - 2 && b.dx > 0), ey = (u.y < r + 2 && b.dy < 0) || (u.y > world.H - r - 2 && b.dy > 0);
  if (ex || ey) bounce(world, u, ex, ey, u.x, u.y);
  if (b.bounces > T.bounces) { endRun(world, u); return; }
  u.vx = b.dx * v; u.vy = b.dy * v;
  u.heading = Math.atan2(b.dy, b.dx); u.face = u.heading;
  saw(world, u);
}

// turn the run direction toward angle `want` by at most `step` rad
function turnRun(b, want, step) {
  const a = Math.atan2(b.dy, b.dx);
  let da = want - a; da -= TAU * Math.round(da / TAU);
  const na = a + Math.max(-step, Math.min(step, da));
  b.dx = Math.cos(na); b.dy = Math.sin(na);
}

function brain(world, u) {
  const b = u.b;
  if (u.subState === RUN) { shortOut(world, u); runStep(world, u); return; }
  if (u.subState === TURN) {
    shortOut(world, u);
    u.goalX = 0; u.goalY = 0;
    saw(world, u);                                      // the blade still bites while it brakes
    const t = targetOf(world, u);
    u.face = t ? Math.atan2(t.y - u.y, t.x - u.x) : u.heading + Math.PI;
    if (world.time < b.until) return;
    u.subState = 0; b.scan = 1;
  }
  if (begin(world, u)) return;
  const t = targetOf(world, u);
  if (mayAttack(world, u)) {
    let c = null;
    if (u.possessed === 1) c = t && touchable(t) ? t : null;                      // the player picks who
    else if (b.scan === 1 || (world.tick + u.index) % T.scanEvery === 0) { b.scan = 0; c = crowdTarget(world, u, T.scanR); }
    if (c) { startRun(world, u, c.x, c.y, c); return; }
  }
  if (!t) { idle(world, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  closeOn(world, u, t, dx, dy, T.walk);
  if (d < T.scanR) b.scan = 1;
}

const D = robot({
  type: 'sawbot',
  og: 'Saw Bot (ours)', // no OG original
  radius: 8, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: true,
  strength: 1.4,
  walkSpeed: T.walk,
  runSpeed: T.run,
  maxSpeed: T.run * 1.1,
  accel: 700,
  decel: 500,
  turnRate: 7,
  brushSpacing: 24,
  look: { attack: { time: 0.25 } },
  weapon: { range: T.scanR }, // for possess (aim reach) and readers
  init(world, u) {
    initB(u);
    const b = u.b;
    b.dx = Math.cos(u.heading); b.dy = Math.sin(u.heading); b.until = 0; b.bounces = 0; b.scan = 0; b.pick = -1;
    b.hitId = new Int32Array(HN).fill(-1); b.hitT = new Float64Array(HN); b.hk = 0;
    u.subState = 0;
  },
  brain,
  // possessed, attack held at nobody: a saw run at the aim point
  possessFire(world, u, aim, ax, ay) {
    if (u.subState !== 0 || u.stun > 0) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy);
    if (d < 20) startRun(world, u, u.x + Math.cos(aim) * 100, u.y + Math.sin(aim) * 100, null);
    else startRun(world, u, ax, ay, null);
  },
  // driving a run: the stick bends it a little
  possessMove(world, u, mx, my) {
    if (u.subState !== RUN || mx * mx + my * my < 0.04) return;
    turnRun(u.b, Math.atan2(my, mx), T.steer * DT);
  },
});
export default D;
export { T };
