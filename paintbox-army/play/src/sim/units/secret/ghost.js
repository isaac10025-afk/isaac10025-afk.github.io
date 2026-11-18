// Ghost (OURS, Secret tab, Part 2 step 7): a low flyer (z 12: melee still reaches it) that floats THROUGH walls and
// bodies (LEAP.FLY: steering skips its wall collision and neither pushes nor is pushed) and sees through walls (it flies
// straight at what it hunts). Hard to hurt: plain shots and blows do ×0.15; fire, blasts and magic (mage bolts and shocks,
// plasma, rays, lasers, flames) ×1 (damageMul). Spook: passing through an enemy it does 10 + a morale hit, and every
// enemy within 60 px gets scared (morale drop + fear splat); once per victim per second. It swoops through and out the
// other side, then turns back. Not raisable, can't be webbed or floated. Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 spook → `spook` (0.45 s from each spook); idle `float0`/`float1` (art, by time).
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, idle, flyAt, easeZ, foe, damage, splatFear, swing, nearestFoe,
  hypot, STATE, LEAP, ENEMY, SEC, FEARLESS,
} from './_lib.js';

const T = {
  radius: 8.6,        // OG-raw radius (registerUnit ×1.1)
  hp: 220,            // hit points
  mass: 1,            // light
  walk: 60,           // px/s floating about
  run: 110,           // px/s swooping at a target
  flyZ: 12,           // px: floats this high (low flyer: melee reaches it)
  bob: 2,             // px: up / down bob ...
  bobRate: 3,         // ... at this many rad/s
  zEase: 6,           // 1/s: how fast it eases to its height
  hardMul: 0.15,      // plain shots + blows do this much
  spook: 20,          // damage of a spook (passing through an enemy). STEP7 said 10: 5 ghosts then killed 0 of 20 riflemen in 100 s
  spookMorale: 0.25,  // morale the spooked unit loses
  scareR: 60,         // px: enemies this close to the spooked one get scared ...
  scareMorale: 0.12,  // ... losing this much morale ...
  scareFear: 0.6,     // ... and a fear splat of this much on their side's fear field
  every: 1,           // s: a victim is spooked at most once per this
  overshoot: 0.45,    // s it keeps going after passing through before it turns back
  sight: 380,         // px: sees this far (walls don't block it)
  pose: 0.45,         // s of the spook pose
  recheck: 0.5,       // s: with its target running away, looks this often for one that isn't
};
// Shot kinds that count as "plain" (×0.15). Everything else that comes from a projectile (plasma, ray, shrink, flame,
// rockets, lava...) is magic / elemental (×1). Hits with no projectile: blows / thrown / spikes ×0.15 unless the
// attacker is a magic user (MAGIC_TYPES: their spells and beams come with no damage kind).
const PLAIN = new Set(['bullet', 'arrow', 'shuriken', 'bolt', 'bigbolt', 'pellet', 'cannonball', 'baseball', 'puck', 'bowlball',
  'boulder', 'spit', 'web', 'snowball', 'blow', 'thrown', 'spike', 'poison', 'eaten']);
const MAGIC_TYPES = new Set(['mage', 'risen_mage', 'laserbot', 'gmech', 'eel']);
const SLOTS = 8;      // victims remembered for the once-per-second rule

function hardMul(w, u, amount, att, kind) {
  if (kind === 'blast' || kind === 'fire' || kind === 'shock' || kind === 'gas') return 1;
  if (kind === undefined) return att && MAGIC_TYPES.has(att.type) ? 1 : T.hardMul;   // a blow (melee), or a spell / beam
  return PLAIN.has(kind) ? (att && MAGIC_TYPES.has(att.type) ? 1 : T.hardMul) : 1;
}

// once per victim per second: a ring of (victim id, time) in the bag
function ready(w, b, id) {
  for (let k = 0; k < SLOTS; k++) if (b.sv[k] === id && w.time - b.st[k] < T.every) return false;
  return true;
}
function remember(w, b, id) {
  for (let k = 0; k < SLOTS; k++) if (b.sv[k] === id) { b.st[k] = w.time; return; }
  b.sv[b.sn] = id; b.st[b.sn] = w.time; b.sn = (b.sn + 1) % SLOTS;
}
let _w = null, _u = null;
function scare(o) { const m = o.def.morale; if (m && m.canBreak) o.morale = Math.max(0, o.morale - T.scareMorale); }
function spook(w, u, o) {
  const b = u.b;
  remember(w, b, o.id);
  damage(w, o, T.spook, u, undefined, o.x, o.y);   // from inside it: a shield doesn't help
  const m = o.def.morale;
  if (m && m.canBreak) o.morale = Math.max(0, o.morale - T.spookMorale);
  splatFear(w, o.faction, o.x, o.y, T.scareFear, T.scareR);
  _w = w; _u = u;
  w.query(o.x, o.y, T.scareR + SEC.MARGIN, scareNear, ENEMY[u.faction]);
  _w = null; _u = null;
  act(w, u, 1); b.actT = w.time; u.attack = 1;
  w.emit('spook', { x: o.x, y: o.y, v: 1, type: u.type, id: u.id });   // STEP7 AUDIO: ghost "boo"
}
function scareNear(o) {
  if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0 || !foe(_u, o)) return;
  const d = hypot(o.x - _u.x, o.y - _u.y);
  if (d - o.radius <= T.scareR + _u.radius) scare(o);
}
function standing(u, o) { return o.state !== STATE.FLEE && !(o.z > SEC.SKY); }
// every enemy the ghost is inside of right now (not high flyers, not props): spooked if its second is up
const PQ = new Array(32);
function passThrough(w, u) {
  const n = w.queryMask(u.x, u.y, u.radius + SEC.MARGIN, ENEMY[u.faction], PQ, PQ.length);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (!foe(u, o) || o.z > SEC.SKY) continue;
    if (hypot(o.x - u.x, o.y - u.y) > u.radius + o.radius) continue;
    if (ready(w, u.b, o.id)) { spook(w, u, o); hit++; }
  }
  return hit;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  u.leaping = LEAP.FLY; u.webbed = -1; u.floating = -1;   // no web holds a ghost, no bubble floats it
  easeZ(u, T.flyZ + T.bob * Math.sin(now * T.bobRate + u.id), T.zEase);
  actDone(w, u, 1, T.pose);
  if (u.state === STATE.FLEE) setState(u, STATE.IDLE);
  if (u.stun > 0) { u.face = u.heading; return; }
  if (canAuto(w, u)) passThrough(w, u);
  let t = targetOf(w, u);
  if (b.k === 1) {   // swooping on through and out the other side
    if (now < b.t0) { u.goalX = b.dx * T.run; u.goalY = b.dy * T.run; u.face = Math.atan2(b.dy, b.dx); setState(u, STATE.ENGAGE); return; }
    b.k = 0;
  }
  if (!t) { idle(w, u); return; }
  // a spooked enemy runs faster than it floats: it goes for one that still stands its ground instead
  if (t.state === STATE.FLEE && u.possessed !== 1 && now >= b.next) {
    b.next = now + T.recheck;
    const o = nearestFoe(w, u, u.x, u.y, T.sight, standing, null);
    if (o) { u.target = o.id; t = o; }
  }
  setState(u, STATE.ENGAGE);
  const d = flyAt(u, t.x, t.y, T.run);
  if (d <= u.radius + t.radius && u.possessed !== 1 && d > 0.5) {
    b.k = 1; b.t0 = now + T.overshoot; b.dx = (t.x - u.x) / d; b.dy = (t.y - u.y) / d;
  }
}

secret({
  type: 'ghost', og: 'Ghost (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1.5,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3, accel: 500, decel: 500, turnRate: 7,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.1,
  intelligence: 1, infectable: false, raisable: false,   // not raisable (no risenMode), zombies can't turn it
  flammability: 0.4, density: 0.2,   // a sheet burns; bullets pass through it (low density: they pierce on)
  flies: false,       // low flyer: melee units still target it (dinos' rule only drops def.flies units above z 30)
  ghost: true,        // STEP7: walls never block it (it is LEAP.FLY), readers may check
  brushSpacing: 24,
  flock: { separation: 18, alignment: 0, cohesion: 0, formation: 0.2 },
  morale: FEARLESS,
  look: { attack: { time: 0.35 } },
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.sv = new Int32Array(SLOTS).fill(-1); b.st = new Float64Array(SLOTS); b.sn = 0;
    u.leaping = LEAP.FLY; u.z = u.pz = T.flyZ;
  },
  damageMul: hardMul,
  // possessed, attack held at nobody: spook whatever it is inside of; else a "boo"
  possessFire(w, u) {
    if (passThrough(w, u) === 0) { swing(w, u, T.every * 0.6); act(w, u, 1); }
  },
  brain,
});
export { T };
