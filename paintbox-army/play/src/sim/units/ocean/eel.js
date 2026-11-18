// Eel (OURS, Part 2 step 6): water only (aquatic, painted only on deep water). SHOCK every 3 s: every non-Ocean enemy
// standing in the same water (depth ≥ wet, same pond) within 160 px takes 25 + stunned 0.6 s (machines ×2). A unit on
// dry land right beside it is safe. Bites 8 otherwise. Water erased under it: dries out, wriggles back. Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 shock (glowing, arcs; 0.45 s). Events: 'bolt' eel → each victim (fx draws the arc),
// 'watershock' (sound).
import {
  sea, initBag, prelude, act, setState, canAuto, seekPrey, swimTo, cruise, stranded, wetNow, bite, damage, stun, pondAt,
  hypot, STATE, F, ENEMY, FISH_MORALE,
} from './_lib.js';

const T = {
  radius: 6,          // OG-raw radius (registerUnit ×1.1)
  hp: 90,             // hit points
  mass: 1,            // light
  walk: 120,          // px/s cruising
  run: 180,           // px/s chasing
  sight: 280,         // px: looks this far for prey (in the water or within 30 px of it)
  shockR: 160,        // px: units in the same water this close ...
  shockDmg: 25,       // ... take 25 ...
  shockStun: 0.6,     // ... and are stunned 0.6 s
  machineMul: 2,      // machines (def.machine) take ×2
  shockEvery: 3,      // s between shocks
  shockLook: 0.25,    // s: with nobody to shock, looks again after this
  shockPose: 0.45,    // s of the glow (b.act 1)
  maxBolts: 10,       // arcs drawn per shock (the rest are hit all the same)
  bite: 8,            // damage per bite ...
  biteEvery: 0.6,     // ... every 0.6 s
  reach: 4,           // px past both bodies
  stealth: 70,        // px: in the water it's seen only this close
  dryDps: 6,          // hp/s on dry land (water erased under it)
  wriggle: 30,        // px/s wriggling back to water
  flammability: 0.1,  // wet
};
const SQ = new Array(96).fill(null);

/** Shock everyone it can: returns how many were hit (0 = nobody there, nothing happened). */
function shock(w, u) {
  const b = u.b, pond = pondAt(w, u.x, u.y);
  const n = w.queryMask(u.x, u.y, T.shockR, ENEMY[u.faction], SQ, SQ.length);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.def.category === 'ocean' || o.inside >= 0) continue;   // sea animals don't mind it
    if (!w.wetAt(o) || pondAt(w, o.x, o.y) !== pond) continue;                                     // only through the water
    if (hypot(o.x - u.x, o.y - u.y) > T.shockR) continue;
    const pass = damage(w, o, T.shockDmg * (o.def.machine === true ? T.machineMul : 1), u, 'shock');
    stun(w, o, T.shockStun * pass);
    if (hit < T.maxBolts) w.emit('bolt', { x: u.x, y: u.y, x1: o.x, y1: o.y, type: u.type });
    hit++;
  }
  if (hit === 0) { b.next = w.time + T.shockLook; return 0; }
  b.next = w.time + T.shockEvery;
  act(w, u, 1); u.attack = 1;
  w.emit('watershock', { x: u.x, y: u.y, v: hit, type: u.type });
  return hit;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.shockPose) act(w, u, 0);
  if (!wetNow(w, u)) { if (!(u.z > 0)) stranded(w, u, T.dryDps, T.wriggle); return; }
  if (u.stun > 0) { u.face = u.heading; return; }
  if (now >= b.next && canAuto(w, u)) shock(w, u);
  const t = seekPrey(w, u, T.sight);
  if (!t) { cruise(w, u, 0.5 * T.walk); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.reach) {
    setState(u, STATE.ENGAGE);
    if (u.cooldown <= 0) bite(w, u, t, T.bite, T.biteEvery, 30, 0.05);
    return;
  }
  setState(u, d < 200 ? STATE.CHARGE : STATE.ADVANCE);
  swimTo(w, u, t.x, t.y, d < 200 ? T.run : T.walk, d < u.radius + t.radius + 20);
}

const D = sea({
  type: 'eel', og: 'Eel (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  aquatic: true,                    // water only: steering keeps it wet (OG piranha's flag)
  waterPace: 1,                     // its speeds are water speeds
  waterStealth: T.stealth,
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.15, accel: 700, decel: 600, turnRate: 9,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.15,
  flammability: T.flammability, density: 0.9, brushSpacing: 16,
  flock: { separation: 18, herd: 0, cohesion: 0, alignment: 0 },
  morale: FISH_MORALE,
  look: { attack: { time: 0.3 } },
  placeOk(w, x, y) { return w.waterCells > 0 && w.waterAt(x, y) >= 0.75; },   // deep water only
  init(w, u) { initBag(w, u); u.wander = w.rng() * Math.PI * 2; u.lastVictim = -1; u.b.next = w.rng() * T.shockEvery * 0.5; },
  holdsNerve() { return true; },
  // possessed, attack held at nobody: shock now if it's charged
  possessFire(w, u) { if (w.time >= u.b.next && wetNow(w, u)) shock(w, u); },
  brain,
});
export default D;
export { T };
