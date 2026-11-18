// Mosquito (OURS, Part 2 step 6): a thin low flyer (z 14). Lands on a living (not machine) enemy and rides it (the sim
// moves it with its host, on its back) drinking 5 hp/s for up to 4 s, healing itself and GROWING: radius +0.6 (x1.1) per
// 10 hp drunk, slower as it grows; at 2.5x its own size it POPS: 20 dmg to its host, and it dies (blood spray, no kill
// credit to anyone). After a drink it buzzes off 1 s, then lands again (same host or the nearest one). It lets go when
// hit hard (stun), webbed (drops to the ground), or its host dies / is swallowed. Never breaks. Owner: BUGS-SIM.
// Pose codes (STEP6.md): b.act 1 drink → `drink` (b.victim = the host; legs on, belly red); bigger by u.radius (render
// sizes by radius); flying → `fly0`/`fly1` (art). b.drunk = hp drunk so far (the belly can swell with it).
import {
  bug, initBag, targetOf, act, setState, fleeing, living, high, flyUpkeep, flyTo, flyIdle, nearestReachable, unitOf, damage,
  hypot, STATE, LEAP, RADIUS_K,
} from './_lib.js';
import { attackHeld } from '../../systems/possess.js';

const T = {
  radius: 4,          // OG-raw radius (registerUnit ×1.1)
  hp: 15,
  mass: 0.2,
  speed: 150,         // px/s flying (at its own size)
  flyH: 14,           // px: flying height (a low flyer: melee reaches it)
  drink: 5,           // hp/s drunk from its host (heals itself as much)
  drinkMax: 4,        // s per landing
  sipEvery: 0.25,     // s between sips (the damage comes in these chunks)
  rest: 1,            // s off after a drink before it lands again
  grow: 0.6,          // OG-raw radius per 10 hp drunk (x1.1 like every radius)
  popAt: 2.5,         // x its own radius: pops
  pop: 20,            // damage to its host when it pops
  slowest: 0.5,       // x speed at full size
  landReach: 4,       // px past both bodies: close enough to land
  letGo: 0.25,        // a stun this long knocks it off its host
  sit: 1.25,          // x host radius: rides this high on its host (z)
  hostScan: 15,       // ticks between looks for a host when its target can't be drunk from
  restOrbit: 26,      // px past the host's body: buzzes round it while resting
};
const DRINK = 1;   // subState

/** Can it drink from o? Living (not a machine, prop or swallowed), not up high, not hidden underground. */
function hostOk(o) { return !!o && o.hp > 0 && !o.dead && living(o) && !high(o) && !(o.hidden > 0); }
const baseR = (u) => u.b.r0 * (u.shrink > 0 ? u.shrink : 1);   // its own size (a shrink ray makes it smaller for good)
function speedOf(u) {
  const f = Math.max(1, Math.min(T.popAt, u.radius / baseR(u)));
  return T.speed * (1 - (1 - T.slowest) * (f - 1) / (T.popAt - 1));
}

function land(w, u, h) {
  const b = u.b;
  u.subState = DRINK; b.victim = h.id; b.t0 = w.time; b.t1 = w.time + T.sipEvery;
  b.x0 = Math.atan2(u.y - h.y, u.x - h.x) - h.heading;   // where on its back it sits, in the host's own frame
  act(w, u, 1); setState(u, STATE.ENGAGE);
  ride(u, h);
  w.emit('land', { x: h.x, y: h.y, v: 0.2, type: u.type });
}
// sit on its host's back (moved with it every tick)
function ride(u, h) {
  const a = u.b.x0 + h.heading, r = h.radius * 0.35;
  u.x = h.x + Math.cos(a) * r; u.y = h.y + Math.sin(a) * r * 0.5 + 0.5;   // on its back (+0.5: drawn over it)
  u.z = u.pz = h.z + h.radius * T.sit; u.vz = 0; u.leaping = LEAP.FLY;
  u.vx = u.goalX = h.vx; u.vy = u.goalY = h.vy;
  u.face = h.heading; u.heading = h.heading;
}
function takeOff(w, u, rest) {
  const b = u.b;
  u.subState = 0; b.victim = -1; act(w, u, 0);
  b.next = w.time + rest;
  if (u.webbed > w.time) { u.leaping = 0; u.vz = 0; } else u.leaping = LEAP.FLY;
}
// riding + drinking: returns false when it stopped this tick
function drink(w, u) {
  const b = u.b, h = unitOf(w, b.victim), now = w.time;
  const stick = u.possessed === 1 && (!attackHeld(w) || (w.possess.mx * w.possess.mx + w.possess.my * w.possess.my) > 0.0144);
  if (!hostOk(h) || u.stun > T.letGo || u.webbed > now || u.inside >= 0 || stick) { takeOff(w, u, h ? T.rest * 0.5 : 0); return false; }
  if (now - b.t0 >= T.drinkMax) { takeOff(w, u, T.rest); return false; }
  ride(u, h);
  setState(u, STATE.ENGAGE);
  if (now >= b.t1) {
    b.t1 = now + T.sipEvery;
    const hp0 = h.hp;
    damage(w, h, T.drink * T.sipEvery, u, undefined, h.x, h.y);   // from its own back: shields don't help
    const got = Math.max(0, hp0 - Math.max(0, h.hp));
    b.drunk += got;
    u.hp = Math.min(u.maxHp, u.hp + got);
    const r0 = baseR(u), sh = u.shrink > 0 ? u.shrink : 1;
    u.radius = Math.min(r0 * T.popAt, r0 + sh * RADIUS_K * T.grow * b.drunk / 10);
    u.attack = 1;
    if (u.radius >= r0 * T.popAt - 1e-6) { pop(w, u, h); return true; }
  }
  return true;
}
// full: it bursts on its host
function pop(w, u, h) {
  damage(w, h, T.pop, u, undefined, h.x, h.y);
  w.emit('spray', { x: u.x, y: u.y - u.z, ang: -Math.PI / 2, size: 1.2, goo: 0 });
  w.emit('strike', { x: h.x, y: h.y, v: 1.4, type: u.type });
  u.subState = 0; u.b.victim = -1; act(w, u, 0);
  u.harmBy = -1; u.harmByType = null; u.harmCause = 0;   // nobody gets the kill
  u.hp = 0;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === DRINK && drink(w, u)) return;
  if (u.inside >= 0) return;   // swallowed: the swallower moves it
  const down = flyUpkeep(w, u, T.flyH);
  if (b.act !== 0) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  let t = targetOf(w, u);
  if (!hostOk(t)) {   // a robot or something up high: blood it can reach instead (the player picks for a possessed one)
    if (u.possessed === 1) t = null;
    else {
      let h = unitOf(w, b.prey);
      if (!hostOk(h) || hypot(h.x - u.x, h.y - u.y) > u.def.alertSightRange) h = (w.tick + u.index) % T.hostScan === 0 ? nearestReachable(w, u, u.def.sightRange, hostOk) : null;
      b.prey = h ? h.id : -1; t = h;
    }
  }
  if (fleeing(w, u, t)) return;
  const sp = speedOf(u);
  if (!t) { if (!down) flyIdle(w, u, sp); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  if (down) return;   // webbed on the ground: waits
  if (now < b.next) {   // resting after a drink: buzz round it
    setState(u, STATE.ENGAGE);
    const a = u.index * 2.39996 + now * 2.2 * (u.index & 1 ? 1 : -1), R = t.radius + T.restOrbit;
    flyTo(u, t.x + Math.cos(a) * R, t.y + Math.sin(a) * R, sp);
    return;
  }
  setState(u, d < 80 ? STATE.ENGAGE : STATE.CHARGE);
  if (d <= u.radius + t.radius + T.landReach) { land(w, u, t); return; }
  flyTo(u, t.x, t.y, sp);
}

bug({
  type: 'mosquito', og: 'Mosquito (ours)',   // ours (no OG unit): the name is for tracing (and the possess tests drive it)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.3,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 220, accel: 1000, decel: 1000, turnRate: 12,
  sightRange: 280, alertSightRange: 340, reactionTime: 0.1, flammability: 0.9,
  flies: true,        // a flyer (low: melee reaches it)
  lowFlyer: true,     // STEP6: z 14, crosses walls and water
  brushSpacing: 12,
  flock: { separation: 10, personalSpace: 1, herd: 0 },
  morale: { baseline: 1, canBreak: false, oddsWeight: 0, fearWeight: 0, woundWeight: 0, hitShock: 0 },   // never breaks
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.leaping = LEAP.FLY; u.z = u.pz = 0.5 * T.flyH; },
  onDeath(w, u) { if (u.subState === DRINK) { u.subState = 0; u.b.victim = -1; } },
  brain,
});
export { T };
