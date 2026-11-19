// siegetower (OURS, Part 2 step 4): a tall wooden tower on wheels, self-moving (no crew), with 4 halberds inside. It
// rolls to the first wall between it and the enemy and docks against it (b.act 1 `docked`, drawbridge down). Docked,
// units of its side within 120 px (any ally in Team battle) whose fight is over the wall walk in, climb 1 s and arc over
// the wall 1.2 s to the far side (_lib.js crossing). The halberds come out when it docks, when it breaks, or 100 px from
// the enemy if there is no wall. It slams the drawbridge on enemies in front (40). Possessed: drive it into a wall to
// dock (drive away to undock); the attack slams.
import { registerUnit } from '../../defs.js';
import {
  A, act, damage, push, hyp, machineBase, machineInit, wallBetween, wallNear, farSide, objective, startCross, playerFiring,
  STATE as S, ENEMY,
} from './_lib.js';

const T = Object.freeze({
  radius: 22,          // STEP4 (tall)
  maxHp: 1400,         // STEP4
  mass: 18,            // STEP4
  walkSpeed: 22,       // STEP4, self-moving
  possessSpeed: 40,
  maxSpeed: 44,
  accel: 50,
  turnRate: 1.2,
  sight: 520,
  brushSpacing: 66,
  strength: 4,
  halberds: 4,         // STEP4: carries 4 halberds
  deployR: 100,        // STEP4: no wall: they come out 100 px from the enemy
});
export const DOCK = Object.freeze({
  gap: 3,              // px left between the tower and the wall
  reach: 9,            // px: docks when a wall tile is this close to its front edge
  maxThick: 120,       // px: a wall thicker than this can't be crossed (it looks for another way)
  exitGap: 16,         // px past the far face of the wall: where they land
  undock: 26,          // px: pushed (or driven) this far off its dock point, it undocks
  retry: 3,            // s before trying a too-thick wall again
});
const SLAM = Object.freeze({
  damage: 40,          // the drawbridge comes down on whoever is in front
  push: 220,
  stun: 0.4,
  reach: 30,           // px past both radii
  cone: 0.55,          // cos: in front only
  cooldown: 1.6,
  pose: 0.5,           // s of the `docked` pose for a slam
});

const _pt = new Float32Array(2), _wp = new Float64Array(2), _ex = new Float64Array(2);

function deploy(world, u, cross) {
  const b = u.b; if (b.deployed === 1) return;
  b.deployed = 1;
  const c = Math.cos(u.heading), s = Math.sin(u.heading);
  // attack 3 (11-18): the halberds get a group of their own (the tower's side). They used to join the tower's painted group:
  // its formation pull, anchored on the towers, held every halberd within ~60 px of where the towers stood, so they walked
  // on the spot instead of chasing (22 towers + halberds v cavalry: halberds stuck for 10+ s, 70 px/s goal, 0 speed)
  const g = world.createGroup(u.type, u.team);
  for (let k = 0; k < T.halberds; k++) {
    // docked: in a row at the door (behind it); else out both sides, two a side (not in front: the tower rolls on)
    const side = cross ? (k - (T.halberds - 1) / 2) * 9 : (k < 2 ? 1 : -1) * (u.radius + 12), back = cross ? (u.radius + 9.9 + 2) * 0.55 : (k % 2 ? 0.45 : -0.45) * u.radius;
    const x = u.x - c * back - s * side, y = u.y - s * back + c * side;
    const h = world.spawn('halberd', x, y, { group: g, team: u.team, heading: u.heading, faction: u.faction, like: u });
    if (!h) break;
    if (cross) startCross(world, h, u, 0);
  }
  if (g >= 0) world.releaseGroup(g);
  world.emit('deploy', { x: u.x, y: u.y, n: T.halberds, type: u.type, id: u.id });
}

function dock(world, u, dx, dy) {
  const b = u.b;
  if (world.time < b.noDockUntil) return false;
  const r = u.radius + DOCK.reach + 8, f = world.walls.raycast(u.x, u.y, u.x + dx * r, u.y + dy * r);
  if (!(f <= 1)) return false;
  const wx = u.x + dx * r * f, wy = u.y + dy * r * f;
  if (!farSide(world, wx, wy, dx, dy, DOCK.maxThick, DOCK.exitGap, _ex)) { b.noDockUntil = world.time + DOCK.retry; return false; }
  b.docked = 1; b.wx = wx; b.wy = wy; b.dx = dx; b.dy = dy; b.ex = _ex[0]; b.ey = _ex[1]; b.dockX = u.x; b.dockY = u.y;
  u.vx = 0; u.vy = 0;
  act(world, u, 1);
  world.emit('dock', { x: wx, y: wy, id: u.id, type: u.type });
  world.emit('land', { x: wx, y: wy, v: 14, type: 'siegetower' });     // the bridge lands on the wall (thud)
  deploy(world, u, true);
  return true;
}
function undock(world, u) { const b = u.b; b.docked = 0; act(world, u, 0); world.emit('undock', { x: u.x, y: u.y, id: u.id, type: u.type }); }

let _su = null, _sw = null, _sn = 0;
function slamOne(o) {
  const u = _su;
  if (!(o.hp > 0) || o.z > 10 || o.climb > 0) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hyp(dx, dy) || 0.001;
  if (d > u.radius + o.radius + SLAM.reach || (dx * Math.cos(u.heading) + dy * Math.sin(u.heading)) / d < SLAM.cone) return;
  const pass = damage(_sw, o, SLAM.damage, u, 'blow');
  if (o.hp > 0) push(_sw, o, dx / d, dy / d, SLAM.push * pass, SLAM.stun * pass);
  _sw.emit('strike', { x: o.x, y: o.y, v: 1.2, type: u.type });
  _sn++;
}
function slam(world, u) {
  const b = u.b;
  if (u.cooldown > 0 || u.stun > 0) return 0;
  _su = u; _sw = world; _sn = 0;
  world.query(u.x, u.y, u.radius + SLAM.reach + 46, slamOne, ENEMY[u.faction]);
  const n = _sn; _su = null; _sw = null;
  u.cooldown = SLAM.cooldown; b.slamAt = world.time; A.setAttack(u);
  world.emit('land', { x: u.x + Math.cos(u.heading) * u.radius, y: u.y + Math.sin(u.heading) * u.radius, v: 10, type: 'siegetower' });
  return n;
}
function enemyInFront(world, u, t) {
  if (!t) return false;
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  return d <= u.radius + t.radius + SLAM.reach * 0.8 && (dx * Math.cos(u.heading) + dy * Math.sin(u.heading)) / d >= SLAM.cone;
}

function brain(world, u) {
  const b = u.b;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.docked === 1) {
    if (hyp(u.x - b.dockX, u.y - b.dockY) > DOCK.undock) undock(world, u);
    else { act(world, u, 1); u.face = Math.atan2(b.dy, b.dx); A.setState(u, S.ENGAGE); return; }
  }
  act(world, u, world.time - b.slamAt < SLAM.pose ? 1 : 0);
  if (u.stun > 0) return;
  const own = u.possessed === 1;
  if (own && !playerFiring(world, u)) {                                  // the player drives: pressed into a wall, it docks
    A.setState(u, S.IDLE);
    if (world.walls.count > 0 && Math.hypot(u.vx, u.vy) < 8 && wallNear(world, u.x + Math.cos(u.heading) * (u.radius + 4), u.y + Math.sin(u.heading) * (u.radius + 4), DOCK.reach + 4)) {
      const P = world.possess, m = P ? Math.hypot(P.mx, P.my) : 0;
      if (m > 0.3 && (P.mx * Math.cos(u.heading) + P.my * Math.sin(u.heading)) / m > 0.5) dock(world, u, Math.cos(u.heading), Math.sin(u.heading));
    }
    return;
  }
  const t = objective(world, u, 6, _pt);
  if (!(_pt[0] === _pt[0])) { A.setState(u, S.IDLE); return; }
  const speed = own ? D.possessSpeed : D.walkSpeed;
  if (enemyInFront(world, u, t) && u.cooldown <= 0) { slam(world, u); return; }
  if (world.walls.count > 0 && world.time >= b.noDockUntil && wallBetween(world, u.x, u.y, _pt[0], _pt[1], _wp)) {
    let dx = _wp[0] - u.x, dy = _wp[1] - u.y; const d = hyp(dx, dy) || 0.001; dx /= d; dy /= d;
    u.face = Math.atan2(dy, dx);
    A.setState(u, S.ADVANCE);
    if (d <= u.radius + DOCK.gap + DOCK.reach && dock(world, u, dx, dy)) return;
    if (d > u.radius + DOCK.gap) { u.goalX = dx * speed; u.goalY = dy * speed; }
    return;
  }
  if (!t) { A.setState(u, S.ADVANCE); A.pathTo(world, u, _pt[0], _pt[1], speed, false); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  const clear = u.los === 1 || world.walls.count === 0;
  if (b.deployed === 0 && clear && d <= T.deployR + u.radius + t.radius) deploy(world, u, false);
  if (d <= u.radius + t.radius + 4) { A.setState(u, S.ENGAGE); return; }
  A.setState(u, S.ADVANCE);
  A.pathTo(world, u, t.x, t.y, speed, clear);
}

const D = registerUnit({
  ...machineBase(),
  type: 'siegetower', og: 'Siege Tower (ours)',
  radius: T.radius, radiusJitter: 0, mass: T.mass, maxHp: T.maxHp, strength: T.strength,
  walkSpeed: T.walkSpeed, runSpeed: T.walkSpeed, maxSpeed: T.maxSpeed, accel: T.accel, decel: T.accel, turnRate: T.turnRate,
  possessSpeed: T.possessSpeed, sightRange: T.sight, alertSightRange: T.sight, brushSpacing: T.brushSpacing,
  untossable: true,
  weapon: { range: SLAM.reach, dock: DOCK, slam: SLAM },
  init(world, u) {
    machineInit(world, u);
    const b = u.b; b.docked = 0; b.deployed = 0; b.noDockUntil = -1; b.slamAt = -9;
    b.wx = b.wy = b.dx = b.dy = b.ex = b.ey = b.dockX = b.dockY = 0;
  },
  brain,
  // Possessed, nobody in the aim: dock if it's against a wall, else bring the bridge down on whatever is in front.
  possessFire(world, u) {
    if (u.b.docked === 1 || u.stun > 0) return;
    const c = Math.cos(u.heading), s = Math.sin(u.heading);
    if (world.walls.count > 0 && wallNear(world, u.x + c * (u.radius + 4), u.y + s * (u.radius + 4), DOCK.reach + 4) && dock(world, u, c, s)) return;
    slam(world, u);
  },
  onDeath(world, u) { deploy(world, u, false); },
});
