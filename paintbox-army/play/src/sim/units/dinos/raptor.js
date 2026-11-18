// Raptor (OURS, Part 2 step 4): fast pack hunter. Pounces on a target 60-110 px away: a light victim is knocked down and
// pinned while the raptor bites it; on a heavy one it clings to the side biting until it is shaken off. Owner: DINOS-SIM.
// Pose codes (STEP4.md): b.act 1 leap, 2 pin / cling; b.victim = the pinned / clung-to unit.
import {
  dino, initBag, targetOf, act, setState, hunt, idle, fleeing, bite, chew, braced, grabbable, grounded, tossTo, clearLine, high,
  damage, push, stun, hypot, STATE, LEAP, DINO, ENEMY, unitOf,
} from './_lib.js';

const T = {
  radius: 9,          // OG-raw radius (registerUnit ×1.1)
  hp: 110,
  mass: 1.2,
  walk: 90, run: 215, // px/s
  bite: 12,           // plain bite damage ...
  biteEvery: 0.5,     // ... every 0.5 s
  pounceMin: 60,      // pounce at a target this far (centre to centre, px) ...
  pounceMax: 110,     // ... up to this far
  leapTime: 0.45,     // s in the air
  leapHeight: 24,     // px at the top of the arc
  pounceEvery: 3,     // s between pounces
  landReach: 10,      // px past both bodies: still lands on it
  pinMass: 4,         // victims this light or lighter are knocked down and pinned
  pinTime: 1.4,       // s pinned (stunned, can't act)
  pinBite: 14,        // pin / cling bite ...
  pinEvery: 0.35,     // ... every 0.35 s
  clingTime: 1.5,     // s on a heavy victim's side, then shaken off ...
  shakeOff: 60,       // ... and tossed this far (px)
  shakeUp: 160,       // upward speed of that toss
  letGo: 0.4,         // a hit that stuns it this long knocks it off its victim
  braceStun: 0.5,     // landed on a braced shield: bounces off, stunned
};
const LEAP_S = 1, PIN = 2, CLING = 3;   // subState

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === LEAP_S) { leap(w, u); return; }
  if ((u.subState === PIN || u.subState === CLING) && hold(w, u)) return;
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d <= u.radius + t.radius + 4) {
    setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx);
    if (u.cooldown <= 0) bite(w, u, t, T.bite, T.biteEvery, 50, 0.1);
    return;
  }
  if (now >= b.next && d >= T.pounceMin && d <= T.pounceMax && clearLine(w, u) && pounceable(t)) { pounce(w, u, t); return; }
  hunt(w, u, t, d < 320 ? T.run : T.walk, d < 320 ? STATE.CHARGE : STATE.ADVANCE);
}

// anything on the ground can be pounced on (heavy ones are clung to); not props, held or flying units
function pounceable(t) { return !t.def.prop && t.hurled !== 1 && t.leaping === 0 && grounded(t) && !high(t) && t.hp > 0; }
// leap: fly in a fixed line to where the victim will be, z arc 0.45 s (leaping = flight: no gravity, no walls, brain runs)
function pounce(w, u, t) { leapTo(w, u, t.x + t.vx * T.leapTime * 0.8, t.y + t.vy * T.leapTime * 0.8, 0.5 * t.radius, t.id); }
function leapTo(w, u, px, py, short, prey) {
  const b = u.b, lt = T.leapTime;
  const ex = px - u.x, ey = py - u.y, dd = hypot(ex, ey) || 0.001, f = Math.max(0, dd - short);
  b.prey = prey; b.t0 = w.time; b.x0 = u.x; b.y0 = u.y; b.dx = ex / dd * f / lt; b.dy = ey / dd * f / lt;
  b.next = w.time + T.pounceEvery;
  u.subState = LEAP_S; u.leaping = LEAP.FLY; u.heading = Math.atan2(ey, ex);
  act(w, u, 1); setState(u, STATE.CHARGE);
  w.emit('charge', { x: u.x, y: u.y, type: u.type });
}
function leap(w, u) {
  const b = u.b, f = (w.time - b.t0) / T.leapTime;
  if (f < 1) {
    u.z = 4 * T.leapHeight * f * (1 - f); u.vz = 0;
    u.vx = u.goalX = b.dx; u.vy = u.goalY = b.dy; u.face = Math.atan2(b.dy, b.dx);
    return;
  }
  u.z = 0; u.vz = 0; u.leaping = 0; u.subState = 0;
  let v = unitOf(w, b.prey); b.prey = -1;
  if (!v) v = w.findNearest(u.x, u.y, u.radius + DINO.MARGIN, ENEMY[u.faction], null, 0);   // a leap at a spot: whoever is there
  const dx = v ? v.x - u.x : 0, dy = v ? v.y - u.y : 0, d = hypot(dx, dy) || 0.001;
  if (!v || !(v.hp > 0) || d > u.radius + v.radius + T.landReach || !pounceable(v)) { // missed
    u.vx *= 0.3; u.vy *= 0.3; act(w, u, 0); u.cooldown = 0.3;
    w.emit('land', { x: u.x, y: u.y, v: 0.5, type: u.type });
    return;
  }
  if (braced(v, b.x0, b.y0)) { // a braced shield: it takes the hit, the raptor bounces off
    damage(w, v, T.pinBite, u, undefined, b.x0, b.y0);
    damage(w, u, v.def.shield.brace * 0.5, v);
    push(w, u, -dx / d, -dy / d, 160, T.braceStun); stun(w, u, T.braceStun);
    act(w, u, 0); w.emit('block', { x: v.x, y: v.y, v: 1, type: v.type });
    return;
  }
  b.victim = v.id; b.t0 = w.time; b.t1 = w.time; act(w, u, 2);
  b.x0 = Math.atan2(u.y - v.y, u.x - v.x) - v.heading;   // where on the victim it hangs, in the victim's own frame
  if (grabbable(v, T.pinMass)) {
    u.subState = PIN;
    v.vx = 0; v.vy = 0; stun(w, v, T.pinTime);
    w.emit('trample', { x: v.x, y: v.y, v: 0.8, type: u.type });
  } else u.subState = CLING;
  u.leaping = LEAP.FLY;   // sits on / hangs off its victim: no shoving, no walls, the brain keeps it there
  setState(u, STATE.ENGAGE);
}
// pinned / clinging: ride the victim and bite it every 0.35 s. Returns false when it let go this tick.
function hold(w, u) {
  const b = u.b, v = unitOf(w, b.victim), pin = u.subState === PIN, now = w.time;
  if (!v || !(v.hp > 0) || (pin && v.z > 8) || u.stun > T.letGo || u.hp <= 0) { release(w, u, v, false); return false; }
  if (now - b.t0 >= (pin ? T.pinTime : T.clingTime)) { release(w, u, v, !pin); return true; }
  const a = b.x0 + v.heading, c = Math.cos(a), s = Math.sin(a);
  if (pin) {
    v.vx = 0; v.vy = 0; if (v.stun < 0.2) v.stun = 0.2;
    u.x = v.x + c * v.radius * 0.45; u.y = v.y + s * v.radius * 0.45 - 0.5; u.z = v.radius * 0.5;
  } else {
    const r = v.radius + u.radius * 0.55;
    u.x = v.x + c * r; u.y = v.y + s * r; u.z = Math.max(1, v.z + v.radius * 0.6);
  }
  u.vx = u.goalX = v.vx; u.vy = u.goalY = v.vy; u.vz = 0;
  u.face = Math.atan2(v.y - u.y, v.x - u.x); u.heading = u.face;
  setState(u, STATE.ENGAGE);
  if (now >= b.t1) { chew(w, u, v, T.pinBite); u.attack = 1; b.t1 = now + T.pinEvery; }
  return true;
}
function release(w, u, v, shaken) {
  const b = u.b;
  u.subState = 0; u.leaping = 0; b.victim = -1; act(w, u, 0);
  if (shaken && v) { // shaken off: thrown away from the victim
    const dx = u.x - v.x, dy = u.y - v.y, d = hypot(dx, dy) || 0.001;
    tossTo(w, u, dx / d, dy / d, T.shakeOff, T.shakeUp);
    w.emit('throw', { x: u.x, y: u.y, v: 0.8, type: v.type });
  } else if (!(u.vz > 0)) { u.z = 0; u.vz = 0; }   // steps off (victim dead); a toss that knocked it loose keeps flying
}

dino({
  type: 'raptor', og: 'Raptor',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.1,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 360, accel: 900, decel: 800, turnRate: 9,
  sightRange: 340, alertSightRange: 400, reactionTime: 0.2, predator: true, flammability: 0.6, density: 1.2,
  brushSpacing: 26,
  flock: { herd: 0.35, herdSpacing: 14, cohesion: 0.1 },   // pack hunter
  morale: { baseline: 0.85, oddsWeight: 0.4, breakAt: 0.3, rallyAt: 0.45 },
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); },
  // possessed, attack held at nobody: leap at the aim point (up to the longest pounce) and pin whoever is there
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next) return;
    const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(T.pounceMin, Math.min(T.pounceMax, d)) / d;
    leapTo(w, u, u.x + dx * k, u.y + dy * k, 0, -1);
  },
  holdsNerve(w, u) { return u.subState !== 0; },   // no running off mid-pounce or mid-pin
  onDeath(w, u) { if (u.subState === PIN || u.subState === CLING) release(w, u, unitOf(w, u.b.victim), false); },
  brain,
});
