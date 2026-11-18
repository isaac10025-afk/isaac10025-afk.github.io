// Shark (OURS, Part 2 step 6): water only (aquatic, painted only on deep water). Hunts anything in the water or on the
// beach within 30 px of it. Cruises at 70, then LUNGES at 200 (it breaches, and can bite 30 px up the beach): bite 40;
// a victim of mass ≤ 4 is dragged under for 2 s (8 dmg every 0.25 s, it can't act, it's under the water: not drawn,
// not targeted) while the shark swims for deep water, then let go. The kill is the shark's (damage(..., src)).
// Water erased under it: it dries out on the sand and wriggles back to water. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 lunge (breach, jaws open), 2 drag (b.victim; fin + thrashing); cruising → fin0/fin1.
import {
  sea, initBag, prelude, act, setState, seekPrey, swimTo, cruise, deeper, stranded, wetNow, holdable, glue, chew, bite, heldBy,
  unitOf, hypot, STATE, FISH_MORALE, SEA, ENEMY,
} from './_lib.js';

const T = {
  radius: 13,         // OG-raw radius (registerUnit ×1.1)
  hp: 300,            // hit points
  mass: 4,            // heavy as a boar
  walk: 70,           // px/s cruising
  run: 200,           // px/s lunging
  sight: 320,         // px: looks this far for prey (in the water or within 30 px of it)
  lungeR: 130,        // px centre to centre: lunges at prey closer than this
  lungeTime: 1,       // s: a lunge that hasn't reached its prey by then gives up
  lungeEvery: 1.5,    // s between lunges
  reach: 8,           // px past both bodies: bites while cruising
  lungeReach: 30,     // px past both bodies while lunging (it breaches up the beach: STEP6 "within 30 px of it")
  bite: 40,           // damage of the bite
  biteEvery: 1.2,     // s between bites
  bitePose: 0.35,     // s the jaws stay open after a bite that didn't drag (b.act 1)
  bitePush: 120,      // shove on a victim too heavy to drag
  dragMass: 4,        // victims this light or lighter are dragged under ...
  dragTime: 2,        // ... for 2 s ...
  dragDmg: 8,         // ... taking 8 ...
  dragEvery: 0.25,    // ... every 0.25 s (can't act)
  dragSpeed: 90,      // px/s it swims for deep water with the victim
  dragZ: 7,           // px: the held victim rides this high (out of the crowd's way; it's not drawn)
  letGoPush: 60,      // px/s the victim floats off with when let go
  stealth: 100,       // px: in the water it's seen only this close (OG's gator 70, piranha 60)
  dryDps: 20,         // hp/s on dry land (water erased under it)
  wriggle: 30,        // px/s wriggling back to water
  flammability: 0.1,  // wet
};
const LUNGE = 1, DRAG = 2;   // subState (= the pose code)

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  if (u.subState === DRAG) return;   // carry() runs the drag (and its swim)
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (!wetNow(w, u)) { if (u.subState === LUNGE) endLunge(w, u); act(w, u, 0); if (!(u.z > 0)) stranded(w, u, T.dryDps, T.wriggle); return; }
  if (b.act === 1 && u.subState === 0 && now - b.actT > T.bitePose) act(w, u, 0);
  if (u.stun > 0) { if (u.subState === LUNGE) endLunge(w, u); u.face = u.heading; return; }
  const t = seekPrey(w, u, T.sight);
  if (u.subState === LUNGE) { lunge(w, u, t); return; }
  if (!t) { act(w, u, 0); cruise(w, u, 0.6 * T.walk); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE);
    if (u.cooldown <= 0) chomp(w, u, t);
    return;
  }
  if (now >= b.next && d <= T.lungeR) { startLunge(w, u, t.id, t.x, t.y); return; }
  setState(u, STATE.ADVANCE);
  swimTo(w, u, t.x, t.y, T.walk);
}

function startLunge(w, u, prey, tx, ty) {
  const b = u.b;
  u.subState = LUNGE; b.prey = prey; b.t0 = w.time; b.x0 = tx; b.y0 = ty;
  act(w, u, 1); setState(u, STATE.CHARGE);
  w.emit('splash', { x: u.x, y: u.y, v: 0.8, type: u.type, breach: 1 });   // STEP6 AUDIO: breach = the lunge
}
function endLunge(w, u) { const b = u.b; u.subState = 0; b.prey = -1; b.next = w.time + T.lungeEvery; if (b.act === 1) act(w, u, 0); }
// lunge: full speed at the prey (or at the aimed spot when the player lunged at nothing); bite whatever comes in reach
function lunge(w, u, seen) {
  const b = u.b;
  let t = unitOf(w, b.prey);
  if (t && !(t.hp > 0 && !t.dead && t.inside < 0)) t = null;
  if (!t && b.prey >= 0) t = seen;   // its prey died: the next one
  if (!t) t = w.findNearest(u.x, u.y, u.radius + T.lungeReach + SEA.MARGIN, ENEMY[u.faction], null, 0);   // aimed at a spot
  if (t && !(t.z > SEA.reachUp)) {
    const d = hypot(t.x - u.x, t.y - u.y);
    if (d <= u.radius + t.radius + T.lungeReach) { u.face = Math.atan2(t.y - u.y, t.x - u.x); endLunge(w, u); chomp(w, u, t); return; }
  }
  if (w.time - b.t0 >= T.lungeTime) { endLunge(w, u); return; }
  const tx = t && b.prey >= 0 ? t.x : b.x0, ty = t && b.prey >= 0 ? t.y : b.y0;
  u.face = Math.atan2(ty - u.y, tx - u.x);
  swimTo(w, u, tx, ty, T.run, true);   // presses into the shore: the breach reaches up the beach
}
// the bite: 40, then a light victim is dragged under
function chomp(w, u, t) {
  const can = holdable(t, T.dragMass);
  const pass = bite(w, u, t, T.bite, T.biteEvery, can ? 0 : T.bitePush, can ? 0 : 0.3);
  act(w, u, 1);
  w.emit('splash', { x: t.x, y: t.y, v: 1, type: u.type });
  if (!can || !(t.hp > 0) || pass < 0.5) return;
  const b = u.b;
  u.subState = DRAG; b.victim = t.id; b.t0 = w.time; b.t1 = w.time + T.dragEvery;
  t.hurled = 1; t.inside = u.id; t.hidden = 0.001; t.target = -1;   // under the water: not drawn, not targeted
  heldBy(w, u, t);
  act(w, u, 2); setState(u, STATE.ENGAGE);
}
// dragged under: held at the jaws, bitten every 0.25 s, while the shark swims for deeper water
function drag(w, u) {
  const b = u.b, v = unitOf(w, b.victim), now = w.time;
  if (!v || !(v.hp > 0) || u.hp <= 0 || v.dead) { letGo(w, u, v); return; }
  if (!deeper(w, u, T.dragSpeed)) cruise(w, u, 0.5 * T.dragSpeed);
  setState(u, STATE.ENGAGE);
  const h = u.heading, r = u.radius * 0.9;
  glue(v, u.x + Math.cos(h) * r, u.y + Math.sin(h) * r, T.dragZ, u.vx, u.vy);
  if ((w.tick + u.index) % 9 === 0) w.emit('splash', { x: u.x, y: u.y, v: 0.5, type: u.type });   // thrashing
  if (now >= b.t1 - 1e-6) { b.t1 += T.dragEvery; chew(w, u, v, T.dragDmg); if (!(v.hp > 0)) { letGo(w, u, v); return; } }
  if (now - b.t0 >= T.dragTime - 1e-6) letGo(w, u, v);
}
function letGo(w, u, v) {
  const b = u.b;
  u.subState = 0; b.victim = -1; act(w, u, 0);
  b.next = w.time + T.lungeEvery; u.cooldown = Math.max(u.cooldown, T.biteEvery);
  if (!v) return;
  v.hurled = 0; v.inside = -1; v.hidden = 0;
  v.z = Math.min(v.z, 1); v.vz = 0;
  if (v.hp > 0) { const h = u.heading + Math.PI / 2; v.vx = Math.cos(h) * T.letGoPush; v.vy = Math.sin(h) * T.letGoPush; }
  else { v.vx = 0; v.vy = 0; }
  w.emit('splash', { x: v.x, y: v.y, v: 1.2, type: u.type });
}

const D = sea({
  type: 'shark', og: 'Shark (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  aquatic: true,                        // water only: steering keeps it wet (OG piranha's flag)
  waterPace: 1,                         // its speeds are water speeds
  waterStealth: T.stealth,
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 2.2,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.15, accel: 520, decel: 500, turnRate: 4.5,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.15, predator: true,
  flammability: T.flammability, density: 1.3, brushSpacing: 44,
  flock: { separation: 26, herd: 0, cohesion: 0, alignment: 0 },
  morale: FISH_MORALE,
  look: { attack: { time: 0.4 } },
  placeOk(w, x, y) { return w.waterCells > 0 && w.waterAt(x, y) >= 0.75; },   // deep water only
  init(w, u) { initBag(w, u); u.wander = w.rng() * Math.PI * 2; u.lastVictim = -1; },
  holdsNerve() { return true; },
  // every tick, before the brain (which skips ticks while it reacts to a new target): the victim stays in the jaws
  carry(w, u) { if (u.subState === DRAG) drag(w, u); },
  onDeath(w, u) { if (u.subState === DRAG) letGo(w, u, unitOf(w, u.b.victim)); },
  // possessed, attack held at nobody: lunge at the aimed spot and bite whatever is there
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next || !wetNow(w, u)) return;
    startLunge(w, u, -1, ax, ay);
  },
  brain,
});
export default D;
export { T };
