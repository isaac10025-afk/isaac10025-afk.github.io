// Scarecrow (OURS, Secret tab, Part 2 step 7): straw man on a pole. Scare: every Animal-intelligence enemy within 150 px
// gets a fright and runs (dinos fleeFor: 2.5 s, then back to its own brain) and loses morale. Crows: every 7 s with an
// enemy about it calls 3 `crow` (spawned-only, its side; max 9 alive per scarecrow). Straw burns twice as easily
// (flammability 1). Melee: pole bonk 8. It moves on the ground (no u.z); the art hops it by the walk cycle. Owner:
// SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 call crows → `call` (arms flap, 0.8 s); hop `hop0`/`hop1` (= the walk cycle).
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, hunt, idle, fleeing, blow, swing, eachFoe, fleeFor, high,
  nearestFoe, hypot, angleDiff, STATE, INT, TAU,
  inReach,
} from './_lib.js';

const T = {
  radius: 9,          // OG-raw radius (registerUnit ×1.1)
  hp: 320,            // hit points
  mass: 2,            // straw on a pole
  walk: 30, run: 45,  // px/s (hops)
  scareR: 150,        // px: Animal-intelligence enemies this close ...
  scareEvery: 1,      // ... are checked this often (s) ...
  scareFlee: 2.5,     // ... and run this long ...
  scareMorale: 0.2,   // ... losing this much morale
  crowEvery: 7,       // s between crow calls
  crowsPer: 3,        // crows per call
  crowMax: 9,         // crows alive per scarecrow
  crowSpread: 16,     // px: crows appear this far round it
  callPose: 0.8,      // s of the call pose
  bonk: 8,            // pole bonk damage
  bonkEvery: 1.1,     // s between bonks
  bonkPush: 50,       // the bonk shoves (÷ mass) ...
  bonkStun: 0.1,      // ... and stuns this long
  reach: 7,           // px past both bodies
  keep: 70,           // px: it stays this far from its target when it has crows out (lets the crows work)
  sight: 340,         // px
};

let _u = null, _w = null;
function fright(o) {
  if (o.def.intelligence !== INT.Animal || o.def.boss) return;
  fleeFor(_w, o, T.scareFlee, _u.x, _u.y);
  const m = o.def.morale;
  if (m && m.canBreak) o.morale = Math.max(0, o.morale - T.scareMorale);
}
function scare(w, u) {
  _u = u; _w = w;
  const n = eachFoe(w, u, u.x, u.y, T.scareR, true, fright);
  _u = null; _w = null;
  if (n > 0) w.emit('roar', { x: u.x, y: u.y, v: 0.4, type: u.type, scare: 1 });   // STEP7 AUDIO: scarecrow creak / rustle
}
// ATTACK L2 (11-16): b.crows only went down when a crow died or flew off. A crow erased with the brush, or turned into
// a frog (turn.js frees it with no death), stayed counted for good: after 9 the scarecrow never called crows again.
// Its crows' ids are kept in slots and b.crows is recounted from the live ones (the art reads b.crows too).
function countCrows(w, u) {
  const b = u.b, ids = b.crowIds;
  let n = 0;
  for (let k = 0; k < ids.length; k++) {
    if (ids[k] < 0) continue;
    const c = w.unitById(ids[k]);
    if (c && c.hp > 0 && c.b.home === u.id) n++; else ids[k] = -1;
  }
  b.crows = n;
  return n;
}
function callCrows(w, u) {
  const b = u.b;
  const room = T.crowMax - countCrows(w, u), k = Math.min(T.crowsPer, room);
  b.next2 = w.time + T.crowEvery;
  if (k <= 0) return false;
  for (let i = 0; i < k; i++) {
    const a = w.rng() * TAU, r = T.crowSpread * (0.6 + 0.4 * w.rng());
    const c = w.spawn('crow', u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, { team: u.team, faction: u.faction, heading: a, like: u });
    if (!c) break;
    c.b.home = u.id; c.z = c.pz = 6; b.crows++;
    for (let q = 0; q < b.crowIds.length; q++) if (b.crowIds[q] < 0) { b.crowIds[q] = c.id; break; }
  }
  act(w, u, 1);
  w.emit('flap', { x: u.x, y: u.y, v: 1, type: u.type, crows: k });   // STEP7 AUDIO: crows cawing
  return true;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  actDone(w, u, 1, T.callPose);
  if (now >= b.next3) { b.next3 = now + T.scareEvery; scare(w, u); }   // its look alone scares animals (an aura, also when driven)
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  if (now >= b.next2 && canAuto(w, u)) callCrows(w, u);
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  const reach = u.radius + t.radius + T.reach;
  if (d <= reach + 4 && inReach(t)) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (d > reach) { u.goalX = dx / d * T.walk; u.goalY = dy / d * T.walk; }
    else if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.9) blow(w, u, t, T.bonk, T.bonkEvery, T.bonkPush, T.bonkStun, 0, 0);
    return;
  }
  if (countCrows(w, u) > 0 && d < T.keep && u.possessed !== 1) { setState(u, STATE.ENGAGE); u.face = a; return; }   // the crows do the work
  hunt(w, u, t, d > 200 ? T.walk : T.run);
}

secret({
  type: 'scarecrow', og: 'Scarecrow (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 2,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3, accel: 400, decel: 500, turnRate: 6,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.3,
  intelligence: 1, flammability: 1, density: 0.8,   // straw: burns twice as easily as a person
  risenMode: 'keep',   // a risen scarecrow: same crows (Undead crows), Undead
  brushSpacing: 30,
  flock: { separation: 30, formation: 0.6 },
  morale: { baseline: 1, oddsWeight: 0.05, fearWeight: 0, casualtyWeight: 0, woundWeight: 0.05, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.1, rallyAt: 0.4, minFleeTime: 2, dropRate: 1, recoverRate: 0.4, panicFear: 0, deathFear: 0.2 },
  init(w, u) { initBag(u); const b = u.b; b.crows = 0; b.crowIds = new Int32Array(T.crowMax).fill(-1); b.next2 = w.time + 1 + w.rng(); b.next3 = w.time + w.rng(); },
  // possessed, attack held at nobody: call the crows when they're ready, else bonk whoever is in reach, else swing
  possessFire(w, u) {
    if (w.time >= u.b.next2 && callCrows(w, u)) return;
    const v = nearestFoe(w, u, u.x, u.y, u.radius + T.reach, null, null);
    if (v && inReach(v)) { if (u.cooldown <= 0) blow(w, u, v, T.bonk, T.bonkEvery, T.bonkPush, T.bonkStun, 0, 0); return; }
    swing(w, u, T.bonkEvery * 0.5);
  },
  brain,
});
export { T };
