// Swordfish (OURS, Part 2 step 6): water only (aquatic, painted only on deep water), 110 / 240. LEAP: a target within
// 180 px (on land or in the water) → it leaps out in a straight line 140-220 px (aimed 40 px past the target), z arc
// 0.6 s, and spears every enemy on the line: 45, ×0.7 for each next one, up to 4. Lands in water: swims on. Lands on
// land: flops (4 dmg/s out of water) and wriggles back to the water at 30 px/s. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 leap (u.z = the arc), 2 flop (on dry land); cruising → fin0/fin1.
import {
  sea, initBag, prelude, targetOf, act, setState, swimTo, cruise, stranded, wetNow, damage, push, clearLine,
  hypot, STATE, LEAP, ENEMY, SEA, FISH_MORALE,
} from './_lib.js';

const T = {
  radius: 9,          // OG-raw radius (registerUnit ×1.1)
  hp: 120,            // hit points
  mass: 1.4,          // light
  walk: 110,          // px/s cruising
  run: 240,           // px/s chasing
  sight: 300,         // px: notices enemies this far
  leapR: 180,         // px: leaps at a target this close (centre to centre, land or water)
  leapMin: 140,       // px: shortest leap ...
  leapMax: 220,       // ... longest leap
  leapPast: 40,       // px: aims this far past the target (it goes on through)
  leapTime: 0.6,      // s in the air
  leapHeight: 34,     // px at the top of the arc
  leapEvery: 2.5,     // s between leaps
  lookEvery: 6,       // ticks between looks for a closer target to leap at
  spear: 45,          // damage to the first unit on the line ...
  spearFall: 0.7,     // ... ×0.7 for each next one ...
  spearMax: 4,        // ... up to 4 units
  spearGap: 2,        // px past both bodies: speared
  spearUp: 30,        // px: units higher than this (flyers) are over the arc
  spearPush: 90,      // shove along the line on each unit speared
  dryDps: 4,          // hp/s flopping on dry land
  wriggle: 30,        // px/s wriggling back to the water
  stealth: 90,        // px: in the water it's seen only this close
  flammability: 0.15, // wet
};
const LEAP_S = 1;   // subState
const SQ = new Array(32).fill(null);

function startLeap(w, u, tx, ty) {
  const b = u.b, dx = tx - u.x, dy = ty - u.y, d = hypot(dx, dy) || 0.001;
  const L = Math.max(T.leapMin, Math.min(T.leapMax, d + T.leapPast));
  b.dx = (dx / d) * L / T.leapTime; b.dy = (dy / d) * L / T.leapTime; b.t0 = w.time; b.n = 0; b.hits.fill(-1);
  b.next = w.time + T.leapEvery;
  u.subState = LEAP_S; u.leaping = LEAP.FLY; u.heading = Math.atan2(dy, dx);
  act(w, u, 1); setState(u, STATE.CHARGE); u.attack = 1;
  w.emit('splash', { x: u.x, y: u.y, v: 1, type: u.type, leap: 1 });   // STEP6 AUDIO: leap whoosh
}
// in the air: a fixed line (leaping = flight: no gravity, no walls, steering leaves it alone), spearing what it passes
function leap(w, u) {
  const b = u.b, f = (w.time - b.t0) / T.leapTime;
  if (f < 1) {
    u.z = 4 * T.leapHeight * f * (1 - f); u.vz = 0;
    u.vx = u.goalX = b.dx; u.vy = u.goalY = b.dy; u.face = Math.atan2(b.dy, b.dx);
    if (b.n < T.spearMax) spearLine(w, u);
    return;
  }
  u.z = 0; u.vz = 0; u.leaping = 0; u.subState = 0;
  u.vx *= 0.4; u.vy *= 0.4;
  if (wetNow(w, u)) { act(w, u, 0); w.emit('splash', { x: u.x, y: u.y, v: 1.2, type: u.type }); }
  else { act(w, u, 2); w.emit('flop', { x: u.x, y: u.y, v: u.radius, type: u.type }); }
}
function spearLine(w, u) {
  const b = u.b, sp = hypot(b.dx, b.dy) || 1, ux = b.dx / sp, uy = b.dy / sp;
  const n = w.queryMask(u.x, u.y, u.radius + T.spearGap + SEA.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (b.n >= T.spearMax || !(o.hp > 0) || o.dead || o.def.prop || o.z > T.spearUp || o.inside >= 0) continue;
    if (hypot(o.x - u.x, o.y - u.y) > u.radius + o.radius + T.spearGap || b.hits.indexOf(o.id) >= 0) continue;
    b.hits[b.n] = o.id;
    damage(w, o, T.spear * Math.pow(T.spearFall, b.n), u, undefined, u.x - ux * 20, u.y - uy * 20);
    b.n++;
    if (o.hp > 0) push(w, o, ux, uy, T.spearPush, 0.2);
    w.emit('strike', { x: o.x, y: o.y, v: 1, type: u.type });
  }
}

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  if (u.subState === LEAP_S) return;   // carry() flies the leap
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (!wetNow(w, u)) { act(w, u, 2); if (!(u.z > 0)) stranded(w, u, T.dryDps, T.wriggle); return; }
  if (b.act === 2) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  let t = targetOf(w, u);
  if (u.possessed !== 1 && (!t || hypot(t.x - u.x, t.y - u.y) > T.leapR) && (w.tick + u.index) % T.lookEvery === 0) {
    const o = w.findNearest(u.x, u.y, T.leapR, ENEMY[u.faction], null, 1);   // something closer to leap at
    if (o && !(o.z > T.spearUp)) { t = o; u.target = o.id; }
  }
  if (!t || t.z > T.spearUp) { cruise(w, u, 0.5 * T.walk); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  if (now >= b.next && d <= T.leapR && clearLine(w, u)) {
    const lead = Math.min(0.5, d / 400);   // leads a moving target a little
    startLeap(w, u, t.x + t.vx * lead, t.y + t.vy * lead);
    return;
  }
  setState(u, d < 260 ? STATE.CHARGE : STATE.ADVANCE);
  if (d <= T.leapR * 0.8) { setState(u, STATE.ALERT); swimTo(w, u, t.x, t.y, 0.3 * T.walk); return; }   // in range, reloading: hangs there
  swimTo(w, u, t.x, t.y, d < 260 ? T.run : T.walk);
}

const D = sea({
  type: 'swordfish', og: 'Swordfish (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  aquatic: true,                                // water only: steering keeps it wet (OG piranha's flag)
  waterPace: 1,                                 // its speeds are water speeds
  waterStealth: T.stealth,
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.4,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.15, accel: 700, decel: 600, turnRate: 7,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.15,
  flammability: T.flammability, density: 1, brushSpacing: 28,
  flock: { separation: 22, herd: 0, cohesion: 0, alignment: 0 },
  morale: FISH_MORALE,
  look: { attack: { time: 0.3 } },
  placeOk(w, x, y) { return w.waterCells > 0 && w.waterAt(x, y) >= 0.75; },   // deep water only
  init(w, u) { initBag(w, u); u.b.hits = new Int32Array(T.spearMax).fill(-1); u.wander = w.rng() * Math.PI * 2; u.b.next = w.rng(); },
  holdsNerve() { return true; },
  // every tick, before the brain (which skips ticks while it reacts to a new target): the leap flies on
  carry(w, u) { if (u.subState === LEAP_S) leap(w, u); },
  onDeath(w, u) { if (u.subState === LEAP_S) { u.leaping = 0; u.subState = 0; } },
  // possessed, attack held at nobody: leap at the aim (140-220 px)
  possessFire(w, u, aim, ax, ay) {
    if (u.subState !== 0 || w.time < u.b.next || !wetNow(w, u)) return;
    startLeap(w, u, ax, ay);
  },
  brain,
});
export default D;
export { T };
