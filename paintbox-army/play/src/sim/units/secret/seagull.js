// Seagull (OURS, Secret tab, Part 2 step 7): a small low flyer (z 26: melee can still reach it) in tight flocks. Dive +
// peck: it dives at an enemy (z → 6), pecks 3, BLINDS it 3 s (the spitter's blind: dinos blindFor: it can't aim, sees
// 55 px, swings at whoever is nearest) and knocks its hat off; then climbs away and comes back after 2 s. A flyer up in
// the air is pecked up there (no dive). Webbed = drops and sits on the ground. Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 dive → `dive` (from the dive start to the peck); flying `fly0`/`fly1` (art).
import {
  secret, initBag, targetOf, setState, act, canAuto, idle, fleeing, flyAt, easeZ, circleAround, webbedDown, nearestFoe,
  damage, hatKnock, blindFor, high, grounded, unitOf, hypot, STATE, LEAP, DT, SEC,
} from './_lib.js';

const T = {
  radius: 5,          // OG-raw radius (registerUnit ×1.1)
  hp: 30,             // hit points
  mass: 0.3,          // featherweight
  speed: 150,         // px/s flying
  flyZ: 26,           // px: cruising height (low flyer: melee reaches it)
  diveZ: 6,           // px: bottom of a dive
  diveStart: 70,      // px (ground distance): starts a dive at its target this close
  diveTime: 0.35,     // s down
  reach: 6,           // px past both bodies at the bottom: the peck lands
  peck: 3,            // damage of a peck
  blind: 3,           // s blind
  every: 2,           // s between dives
  climb: 0.5,         // s climbing away after a peck
  circleR: 70,        // px: circles its target this far out between dives
  airPeckEvery: 0.8,  // s between pecks at another flyer up in the air
  sight: 320,         // px
};
const DIVE = 1, CLIMB = 2;   // subState

// every tick, before the brain (which skips ticks while it reacts to a new target): the dive and the climb away
function carry(w, u) {
  if (w.holding || u.subState === 0) return;
  const b = u.b;
  u.leaping = LEAP.FLY; u.vz = 0;
  if (webbedDown(w, u)) { u.subState = 0; act(w, u, 0); return; }
  if (u.subState === DIVE) { dive(w, u); return; }
  easeZ(u, T.flyZ, 5);   // climbing away
  u.goalX = b.dx * T.speed; u.goalY = b.dy * T.speed; u.face = Math.atan2(b.dy, b.dx);
  if (w.time - b.t0 >= T.climb) u.subState = 0;
}
function brain(w, u) {
  const b = u.b, now = w.time;
  if (u.subState !== 0) return;   // carry() runs the dive / climb
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.leaping = LEAP.FLY; u.vz = 0;
  if (webbedDown(w, u)) return;
  easeZ(u, T.flyZ, 4);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (high(t) || (t.leaping === LEAP.FLY && t.z > SEC.GROUNDED)) {   // another flyer: chase it and peck it up there
    setState(u, STATE.ENGAGE);
    flyAt(u, t.x, t.y, T.speed);
    u.z += Math.max(-2, Math.min(2, t.z - u.z));
    if (hypot(d, t.z - u.z) <= u.radius + t.radius + T.reach && u.cooldown <= 0) {
      damage(w, t, T.peck, u); u.cooldown = T.airPeckEvery; u.attack = 1;
      w.emit('strike', { x: t.x, y: t.y, v: 0.3, type: u.type });
    }
    return;
  }
  const ready = now >= b.next;
  setState(u, STATE.ENGAGE);
  if (ready && d < T.diveStart && grounded(t) && canAuto(w, u)) { startDive(w, u, t.id, t.x, t.y); return; }
  if (ready) { flyAt(u, t.x, t.y, T.speed); return; }
  circleAround(u, t.x, t.y, T.circleR, T.speed);
}

function startDive(w, u, prey, x, y) {
  const b = u.b;
  u.subState = DIVE; b.prey = prey; b.t0 = w.time; b.t1 = u.z; b.x0 = x; b.y0 = y;
  act(w, u, 1); setState(u, STATE.ENGAGE);
  w.emit('flap', { x: u.x, y: u.y, v: 0.4, type: u.type, caw: 1 });   // STEP7 AUDIO: seagull squawk
}
function dive(w, u) {
  const b = u.b, now = w.time, f = Math.min(1, (now - b.t0) / T.diveTime);
  const p = unitOf(w, b.prey);
  if (p && p.hp > 0 && !high(p) && p.inside < 0) { b.x0 = p.x; b.y0 = p.y; }
  u.z = b.t1 - (b.t1 - T.diveZ) * f * f;
  const dx = b.x0 - u.x, dy = b.y0 - u.y, d = hypot(dx, dy) || 0.001, left = Math.max(DT, T.diveTime - (now - b.t0));
  const sp = Math.min(u.def.maxSpeed, d / left);
  u.goalX = dx / d * sp; u.goalY = dy / d * sp; u.face = Math.atan2(dy, dx);
  if (f < 1) return;
  // bottom of the dive: peck the prey (or whoever is right there), blind it, knock its hat off; climb away
  let v = p && p.hp > 0 && p.inside < 0 ? p : null;
  if (!v || hypot(v.x - u.x, v.y - u.y) > u.radius + v.radius + T.reach) v = nearestFoe(w, u, u.x, u.y, u.radius + T.reach, okPeck, null);
  u.subState = CLIMB; b.t0 = now; b.prey = -1; b.next = now + T.every; act(w, u, 0);
  const ax = v ? u.x - v.x : -dx, ay = v ? u.y - v.y : -dy, ad = hypot(ax, ay) || 1, wob = (w.rng() - 0.5) * 1.2;
  const c = Math.cos(wob), s = Math.sin(wob);
  b.dx = (ax * c - ay * s) / ad; b.dy = (ax * s + ay * c) / ad;   // away from the victim, a little to one side
  if (!v || !grounded(v) || hypot(v.x - u.x, v.y - u.y) > u.radius + v.radius + T.reach) return;
  damage(w, v, T.peck, u, undefined, v.x, v.y);   // from above: shields don't help
  u.attack = 1;
  if (v.hp > 0) { blindFor(w, v, T.blind); hatKnock(w, v, -b.dx, -b.dy, 0.7); }
  w.emit('strike', { x: v.x, y: v.y, v: 0.4, type: u.type, peck: 1 });
}
function okPeck(u, o) { return grounded(o); }

secret({
  type: 'seagull', og: 'Seagull (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.4,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 320, accel: 900, decel: 900, turnRate: 8,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.15,
  intelligence: 1, flammability: 0.6, density: 0.5,
  flies: false,       // low flyer (z 26): melee reaches it
  risenMode: 'keep',  // a risen seagull: same dives, Undead
  brushSpacing: 12,   // tight flock
  flock: { personalSpace: 1.4, separation: 14, alignment: 0.3, cohesion: 0.1, herd: 0.3, herdSpacing: 8, formation: 0.2 },
  init(w, u) { initBag(u); u.leaping = LEAP.FLY; u.z = u.pz = 0; u.b.next = w.time + 0.5 + w.rng(); },
  holdsNerve(w, u) { return u.subState !== 0; },
  carry,
  // possessed, attack held at nobody: dive at the aim point (pecks whatever is there)
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next || webbedDown(w, u)) return;
    let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.min(T.diveStart, d) / d;
    startDive(w, u, -1, u.x + dx * k, u.y + dy * k);
  },
  brain,
});
export { T };
