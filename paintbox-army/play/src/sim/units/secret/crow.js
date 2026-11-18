// Crow (OURS, Secret tab, Part 2 step 7): spawned only, by the scarecrow (its side: faction / team of the scarecrow).
// Low flyer (z 20: melee reaches it). Flies at its target and pecks 4 every 0.6 s, dipping down to it. After 12 s it
// flies off (up and away, gone with no body: it frees its place in the scarecrow's 9). Webbed = drops and sits.
// Owner: SECRET-SIM.
// Pose codes (STEP7.md): flying `fly0`/`fly1` (art); b.act 1 peck → `peck` (0.25 s from each peck). Leaving: b.act 0,
// u.z climbing to ~90 (art: it just flies off).
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, idle, flyAt, easeZ, webbedDown, damage, nearestFoe, high,
  unitOf, hypot, STATE, LEAP, SEC,
} from './_lib.js';

const T = {
  radius: 4,          // OG-raw radius (registerUnit ×1.1)
  hp: 18,             // hit points
  mass: 0.2,          // featherweight
  speed: 160,         // px/s flying
  flyZ: 20,           // px: cruising height (low flyer)
  peckZ: 8,           // px: dips this low to peck
  peck: 4,            // damage of a peck
  peckEvery: 0.6,     // s between pecks
  reach: 5,           // px past both bodies (ground distance)
  life: 12,           // s, then it flies off
  leave: 1.2,         // s flying off (up and away) before it is gone
  leaveZ: 90,         // px it climbs to while leaving
  leaveSpeed: 200,    // px/s
  sight: 300,         // px
};

function gone(w, u) {
  const h = unitOf(w, u.b.home);
  if (h && h.b && h.b.crows > 0) h.b.crows--;
  u.b.home = -1;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.leaping = LEAP.FLY;
  actDone(w, u, 1, 0.25);
  if (u.possessed === 1 && b.t1 < now + 1) b.t1 = now + 1;   // a driven crow stays as long as the player keeps it
  if (now >= b.t1) {   // time's up: fly off and away (out of every fight), then gone
    act(w, u, 0); setState(u, STATE.FLEE); u.target = -1;
    easeZ(u, T.leaveZ, 2);
    if (b.dx === 0 && b.dy === 0) { const a = w.rng() * Math.PI * 2; b.dx = Math.cos(a); b.dy = Math.sin(a); }
    u.goalX = b.dx * T.leaveSpeed; u.goalY = b.dy * T.leaveSpeed; u.face = Math.atan2(b.dy, b.dx);
    u.hidden = 0.001;   // nobody targets a crow on its way out
    if (now >= b.t1 + T.leave) { gone(w, u); w.remove(u); }
    return;
  }
  if (webbedDown(w, u)) return;
  if (u.stun > 0) { easeZ(u, T.flyZ, 3); u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (!t) { easeZ(u, T.flyZ, 3); idleNearHome(w, u); return; }
  setState(u, STATE.ENGAGE);
  const d = flyAt(u, t.x, t.y, T.speed), reach = u.radius + t.radius + T.reach;
  if (high(t)) { u.z += Math.max(-2, Math.min(2, t.z - u.z)); }
  else easeZ(u, d < reach + 20 ? T.peckZ : T.flyZ, 5);
  if (d <= reach && Math.abs(t.z - u.z) < 20 && u.cooldown <= 0 && canAuto(w, u)) peck(w, u, t);
}
function peck(w, u, t) {
  damage(w, t, T.peck, u, undefined, t.x, t.y);   // from above: shields don't help
  u.cooldown = T.peckEvery * (0.85 + 0.3 * w.rng()); u.attack = 1;
  act(w, u, 0); act(w, u, 1);
  w.emit('strike', { x: t.x, y: t.y, v: 0.3, type: u.type, peck: 1 });
}
// no target: circle over the scarecrow (or the group's fight)
function idleNearHome(w, u) {
  const h = unitOf(w, u.b.home);
  if (!h) { idle(w, u); return; }
  setState(u, STATE.IDLE);
  const dx = h.x - u.x, dy = h.y - u.y, d = hypot(dx, dy) || 0.001, s = u.index & 1 ? 1 : -1;
  const m = Math.max(-T.speed, Math.min(T.speed, 2 * (d - 30)));
  u.goalX = -dy / d * s * 60 + dx / d * m; u.goalY = dx / d * s * 60 + dy / d * m;
}

secret({
  type: 'crow', og: 'Crow (ours)',   // no OG unit; spawned only (the scarecrow)
  unpaintable: true,
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.3,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 260, accel: 900, decel: 900, turnRate: 9,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.1, stickyTarget: false,
  intelligence: 1, flammability: 0.6, density: 0.4, swarms: true,
  risenMode: 'keep',   // why not: a risen crow (it still flies off after 12 s)
  brushSpacing: 10,
  flock: { personalSpace: 1.4, separation: 12, alignment: 0.3, cohesion: 0.1, formation: 0 },
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.home = -1; b.t1 = w.time + T.life; u.leaping = LEAP.FLY; u.z = u.pz = 0; u.cooldown = 0.3 * w.rng();
  },
  holdsNerve() { return true; },
  onDeath(w, u) { gone(w, u); },
  // possessed, attack held at nobody: peck whoever is right under it
  possessFire(w, u) {
    if (u.cooldown > 0) return;
    const v = nearestFoe(w, u, u.x, u.y, u.radius + T.reach + 4, null, null);
    if (v) peck(w, u, v); else { u.attack = 1; u.cooldown = 0.4; act(w, u, 1); }
  },
  brain,
});
export { T };
