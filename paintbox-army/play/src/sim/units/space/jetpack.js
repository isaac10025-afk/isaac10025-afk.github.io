// jetpack (OURS, Space tab): a high flyer (z 40, like the ptero: crosses walls and water, melee units can't reach it up
// there, shots can). Mini rockets (projectile `minirocket`: blast r 22, 25) at 100-300 px, one every 1.8 s. Every 6 s in
// the air it comes down for 1.5 s to refuel: on the ground it can be hit by anyone (it won't land on a wall or in deep
// water). Webbed = it drops (gravity) and sits on the ground until the web lets go. Owner: SPACE-SIM.
// Pose codes (STEP6.md): b.act 1 fire → `fire`; 2 landed / refuelling → `land`; flying → `fly0`/`fly1` (art, flame).
import { registerBlast, explode } from '../../combat/index.js';
import {
  alien, initBag, act, actAge, targetOf, setState, idle, fleeing, clearLine, hypot, angleDiff, STATE, LEAP, DT,
  registerProjectileKind, removeProjectile, spawnProjectile, sweepFirst, ownerOf, outside, shotHeight, stepHeight, markSky,
  standable, deepAt, SWEEP, raycast,
} from './_lib.js';

const T = {
  hp: 90, mass: 1, radius: 8.5,
  speed: 160,           // px/s flying (and walking while landed, possessed)
  flyH: 40,             // px: cruising height (a high flyer)
  rise: 3,              // 1/s: eases to cruising height
  minR: 100,            // px: rockets from this far ...
  maxR: 300,            // ... to this far
  want: 210,            // px: hovers this far from its target between shots
  band: 50,             // px: slack around `want`
  reload: 1.8,          // s between rockets
  aimTol: 0.35,         // rad: fires when facing the aim this well
  firePose: 0.3,        // s of the `fire` pose
  rocketSpeed: 380,     // px/s
  rocketPad: 2,         // px past a body: the rocket hits it
  highWalls: 20,        // px: a rocket flying higher than this passes over walls (fired from the air)
  air: 6,               // s in the air before it must refuel
  refuel: 1.5,          // s on the ground
  down: 0.35,           // s to come down for refuelling
  landTry: 0.5,         // s: over a wall / deep water it flies on and tries again this much later
  blast: {              // minirocket blast (registered as 'minirocket')
    radius: 22,         // px
    damage: 25,         // at the centre
    minFalloff: 0.35,   // the edge still takes 35 %
    push: 160,          // shove out of the blast
    stun: 0.25,         // s
    hatChance: 0.2,
    noiseRadius: 220,   // px
  },
};
const BLAST = registerBlast('minirocket', T.blast);
const FLY = 0, DOWN = 1, LANDED = 2, DROPPED = 3;   // subState

// ---------------------------------------------------------------- the minirocket: straight to its aim point, bursts on
// the first body it touches or at the point (shot at a flyer: at the flyer)
function stepRocket(w, p, i) {
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT;
  p.px = x0; p.py = y0;
  let tEnd = p.life <= DT ? Math.max(0, p.life / DT) : 1;
  const wall = p.z > T.highWalls || w.walls.count === 0 ? Infinity : raycast(w, x0, y0, x0 + dx, y0 + dy);   // low: a wall stops it
  if (wall < tEnd) tEnd = wall;
  const hit = sweepFirst(w, p, x0, y0, dx, dy, tEnd, T.rocketPad, true);
  if (hit || p.life <= DT || wall <= 1) {
    const t = hit ? SWEEP.t : tEnd;
    explode(w, x0 + dx * t, y0 + dy * t, BLAST, ownerOf(w, p) || -1);
    removeProjectile(w, i); return;
  }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  stepHeight(p);
  if (outside(w, p.x, p.y)) removeProjectile(w, i);
}
registerProjectileKind('minirocket', stepRocket);

function fire(w, u, ax, ay) {
  const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const mx = u.x + (dx / d) * u.radius, my = u.y + (dy / d) * u.radius, life = Math.max(DT, (d - u.radius) / T.rocketSpeed);
  const p = spawnProjectile(w, 'minirocket', mx, my, Math.cos(a) * T.rocketSpeed, Math.sin(a) * T.rocketSpeed, life, T.blast.damage, u.faction, u);
  if (p) { shotHeight(p, Math.max(0, u.z), d); p.smoky = 1; }
  u.b.next = w.time + T.reload; u.attack = 1; u.firedAt = w.time;
  act(w, u, 1);
  w.emit('shot', { x: u.x, y: u.y, v: 0.8, type: u.type, snd: 'rocket' });   // STEP6 SPACE AUDIO: snd 'rocket' = a whoosh
  if (w.stats) w.stats.shots++;
}

// ---------------------------------------------------------------- flight
function takeOff(w, u) { u.subState = FLY; u.leaping = LEAP.FLY; u.b.k = 0; act(w, u, 0); }
function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  markSky(w);   // a flyer is about: melee units drop it as a target while it's up high (dinos' rule: def.flies + z > 30)
  if (b.act === 1 && actAge(w, u) > T.firePose) act(w, u, u.subState === LANDED ? 2 : 0);
  // webbed: drop (gravity takes it: leaping 0) and sit until the web lets go
  if (u.webbed > now && u.subState !== DROPPED) { u.subState = DROPPED; u.leaping = 0; u.vz = 0; act(w, u, 2); return; }
  if (u.subState === DROPPED) {
    if (u.webbed > now || u.z > 0) return;
    takeOff(w, u);
  }
  if (u.subState === LANDED) {
    if (now - b.t0 >= T.refuel) takeOff(w, u);
    else { if (b.act !== 1) act(w, u, 2); fight(w, u, true); return; }
  }
  if (u.subState === DOWN) {
    u.leaping = LEAP.FLY; u.vz = 0;
    const f = Math.min(1, (now - b.t0) / T.down);
    u.z = b.x0 * (1 - f);
    if (f >= 1) { u.z = u.pz = 0; u.leaping = 0; u.subState = LANDED; b.t0 = now; act(w, u, 2); w.emit('land', { x: u.x, y: u.y, id: u.id, type: u.type, speed: 60 }); }
    return;
  }
  // flying
  u.leaping = LEAP.FLY; u.vz = 0;
  u.z += (T.flyH - u.z) * Math.min(1, T.rise * DT);
  b.k += DT;
  if (b.k >= T.air && u.stun <= 0) {
    if (standable(w, u.x, u.y, u.radius + 2) && !deepAt(w, u.x, u.y)) { u.subState = DOWN; b.t0 = now; b.x0 = u.z; act(w, u, 2); return; }
    b.k = T.air - T.landTry;
  }
  fight(w, u, false);
}

// target work: in the air keep 100-300 px off and fire; landed: stand and fire if it can
function fight(w, u, landed) {
  const b = u.b, now = w.time;
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (!landed && fleeing(w, u, t)) return;
  if (!t) { if (!landed) idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  setState(u, STATE.ENGAGE);
  u.face = a;
  const own = u.possessed === 1;
  if (!landed) {
    if (d > T.want + T.band) { u.goalX = dx / d * T.speed; u.goalY = dy / d * T.speed; }
    else if (d < T.want - T.band && !own) { u.goalX = -dx / d * T.speed; u.goalY = -dy / d * T.speed; }
    else { const s = u.index & 1 ? 1 : -1; u.goalX = -dy / d * s * 0.4 * T.speed; u.goalY = dx / d * s * 0.4 * T.speed; }   // drift sideways
  }
  const inRange = (d >= T.minR || own) && d <= (u.state === STATE.ENGAGE ? T.maxR * 1.1 : T.maxR);
  if (now >= b.next && inRange && (clearLine(w, u) || u.z > 20) && Math.abs(angleDiff(u.heading, a)) < T.aimTol) {
    const lead = d / T.rocketSpeed;
    fire(w, u, t.x + t.vx * lead, t.y + t.vy * lead);
  }
}

const D = alien({
  type: 'jetpack', og: 'Jetpack (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.9,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 260, accel: 600, decel: 600, turnRate: 7,
  sightRange: 360, alertSightRange: 380,
  flies: true,                 // dinos' rule: melee units don't target it while it's up high
  brushSpacing: 26,
  flock: { separation: 24, formation: 0.3 },
  weapon: { range: T.maxR },  // possess: aim reach
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.leaping = LEAP.FLY; u.z = u.pz = 0; u.b.next = w.time + T.reload * w.rng(); u.b.k = w.rng() * 2; },
  onDeath(w, u) { u.leaping = 0; },
  // possessed, attack held at nobody: a rocket at the aim point (kept within range)
  possessFire(w, u, aim, ax, ay) {
    if (w.time < u.b.next || u.subState === DOWN || u.subState === DROPPED) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(40, Math.min(T.maxR, d)) / d;
    fire(w, u, u.x + dx * k, u.y + dy * k);
  },
  brain,
});
export default D;
export { T };
