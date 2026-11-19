// Octopus (OURS, Part 2 step 6): land 35 / water 80. GRAB FOUR: up to 4 enemies within its body + 45 px are held
// (pulled in to tentacle length, can't move or act), squeezed 6 each every 0.5 s for up to 3 s, then thrown 60 px.
// INK: the first time it drops below 70 % hp, then on a hit every 10 s: an ink cloud r 70 for 4 s where it is (enemies
// inside are blinded by the game's blind rule, dinos blindFor: sight 55 px, shots spray, melee swings at whoever is
// nearest; they see again 0.35 s after leaving it), and it backs away 1.5 s
// (unless it's holding someone). Owner: OCEAN-SIM.
// Pose codes (STEP6.md): b.act 1 grab / hold (b.v0..b.v3 = held unit ids, -1 none: a tentacle to each), 2 ink.
// Effect projectile 'ink' (sits still, hits nothing): p.r radius px, p.age s since it spread, p.life its total s (4).
import {
  sea, initBag, prelude, targetOf, act, setState, hunt, idle, fleeing, chew, holdable, glue, tossTo, blindFor, heldBy, bite,
  canAuto, hypot, STATE, ENEMY, DT, SEA,
} from './_lib.js';
import { registerProjectileKind, spawnProjectile, removeProjectile } from '../../combat/projectiles.js';

const T = {
  radius: 12,         // OG-raw radius (registerUnit ×1.1)
  hp: 260,            // hit points
  mass: 3,            // heavy-ish
  walk: 25,           // px/s walking on land
  run: 35,            // px/s on land (STEP6 "land 35")
  swim: 80,           // px/s in water (waterPace = swim / run)
  grabGap: 45,        // px past its body (to the victim's edge): enemies this close are grabbed ...
  grabMax: 4,         // ... up to 4 at once
  grabMass: 8,        // heavier ones (and bosses, untossable ones) slip its grip
  holdTime: 3,        // s held at most ...
  squeeze: 6,         // ... squeezed 6 each ...
  squeezeEvery: 0.5,  // ... every 0.5 s
  holdGap: 10,        // px past both bodies: where a held unit hangs (tentacle length)
  throwDist: 60,      // px: then thrown this far, away from it
  throwUp: 150,       // upward speed of the throw (px/s)
  grabEvery: 1.5,     // s after a throw before it grabs again
  inkAt: 0.7,         // first ink when its hp drops below 70 % ...
  inkEvery: 10,       // ... then on a hit at most every 10 s
  inkR: 70,           // px: cloud radius
  inkLife: 4,         // s the cloud lasts
  inkLinger: 0.35,    // s a unit stays blind after it leaves the cloud
  inkHigh: 30,        // px: flyers higher than this are above the cloud
  inkPose: 0.5,       // s of the ink pose (b.act 2)
  backTime: 1.5,      // s it backs away after inking
  chargeAt: 160,      // px: runs at a target closer than this, else walks
  slam: 14,           // ATTACK3 L3 (ours): a tentacle slam at a foe it can't hold (giant, boss, a flying bee) ...
  slamEvery: 1.1,     // ... every 1.1 s (the table gives it no plain attack: next to a giant it did nothing all battle)
  flammability: 0.3,  // soft and wet-ish
};
const HOLD = 1;   // subState
const GQ = new Array(48).fill(null);

/** Never holdable, whatever happens (heavy, boss, untossable): the octopus slams it instead. */
function tooBig(o) { return o.mass > T.grabMass || !!o.def.boss || !!o.def.untossable || !!o.def.prop; }
function getV(b, k) { return k === 0 ? b.v0 : k === 1 ? b.v1 : k === 2 ? b.v2 : b.v3; }
function setV(b, k, id) { if (k === 0) b.v0 = id; else if (k === 1) b.v1 = id; else if (k === 2) b.v2 = id; else b.v3 = id; }

/** Grab up to 4 enemies in reach. Returns how many it took. */
function grab(w, u) {
  const b = u.b, reach = u.radius + T.grabGap;
  const n = w.queryMask(u.x, u.y, reach + SEA.MARGIN, ENEMY[u.faction], GQ, GQ.length);
  let got = 0;
  for (let k = 0; k < n; k++) {
    const o = GQ[k]; GQ[k] = null;
    if (got >= T.grabMax || !holdable(o, T.grabMass)) continue;
    if (hypot(o.x - u.x, o.y - u.y) - o.radius > reach) continue;
    setV(b, got++, o.id);
    o.hurled = 1; o.vx = 0; o.vy = 0; o.target = -1;   // hurled: no other grabber takes it
    heldBy(w, u, o);
    if (o.stun < 0.3) o.stun = 0.3;
  }
  if (got === 0) return 0;
  u.subState = HOLD; b.t0 = w.time; b.t1 = w.time + T.squeezeEvery;
  act(w, u, 1); setState(u, STATE.ENGAGE); u.attack = 1;
  w.emit('strike', { x: u.x, y: u.y, v: got, type: u.type });
  return got;
}
// holding: each victim hangs at tentacle length where it was grabbed, squeezed every 0.5 s; thrown after 3 s
function hold(w, u) {
  const b = u.b, now = w.time, squeeze = now >= b.t1 - 1e-6;
  if (squeeze) b.t1 += T.squeezeEvery;
  let left = 0;
  for (let k = 0; k < T.grabMax; k++) {
    const id = getV(b, k); if (id < 0) continue;
    const v = w.unitById(id);
    if (!v || v.dead || !(v.hp > 0)) { if (v) v.hurled = 0; setV(b, k, -1); continue; }
    const dx = v.x - u.x, dy = v.y - u.y, d = hypot(dx, dy) || 0.001, r = Math.min(d, u.radius + v.radius + T.holdGap);
    glue(v, u.x + dx / d * r, u.y + dy / d * r, 2, 0, 0);
    if (squeeze) { chew(w, u, v, T.squeeze); if (!(v.hp > 0)) { v.hurled = 0; setV(b, k, -1); continue; } }
    left++;
  }
  u.goalX = 0; u.goalY = 0;
  if (left === 0 || now - b.t0 >= T.holdTime - 1e-6) letGo(w, u, left > 0);
}
function letGo(w, u, thrown) {
  const b = u.b;
  for (let k = 0; k < T.grabMax; k++) {
    const id = getV(b, k); if (id < 0) continue;
    setV(b, k, -1);
    const v = w.unitById(id); if (!v || v.dead) continue;
    v.hurled = 0;
    if (thrown && v.hp > 0) {
      const dx = v.x - u.x, dy = v.y - u.y, d = hypot(dx, dy) || 0.001;
      tossTo(w, v, dx / d, dy / d, T.throwDist, T.throwUp);
    } else v.z = Math.min(v.z, 1);
  }
  u.subState = 0; b.next = w.time + T.grabEvery;
  if (b.act === 1) act(w, u, 0);
  if (thrown) w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type });
}

function ink(w, u) {
  const b = u.b, p = spawnProjectile(w, 'ink', u.x, u.y, 0, 0, T.inkLife, 0, u.faction, u);
  if (p) { p.r = T.inkR; p.age = 0; }
  b.inked = 1; b.inkNext = w.time + T.inkEvery;
  w.emit('splash', { x: u.x, y: u.y, v: 1.5, type: u.type, ink: 1 });   // STEP6 AUDIO: ink squirt
  if (u.subState === HOLD) return;   // holding: stays put
  act(w, u, 2); b.next2 = w.time + T.backTime;
}
// the cloud: sits where it was spread, blinds every enemy whose middle is inside it (checked every 3 ticks)
const IQ = new Array(64).fill(null);
function stepInk(w, p, i) {
  p.age += DT;
  if (p.age >= p.life) { removeProjectile(w, i); return; }
  if (w.tick % 3 !== 0) return;
  const n = w.queryMask(p.x, p.y, p.r, ENEMY[p.faction], IQ, IQ.length);
  for (let k = 0; k < n; k++) { const o = IQ[k]; IQ[k] = null; if (!o.dead && o.hp > 0 && !o.def.prop && !(o.z > T.inkHigh) && o.inside < 0) blindFor(w, o, T.inkLinger); }
}
registerProjectileKind('ink', stepInk);

function brain(w, u) {
  const b = u.b, now = w.time;
  prelude(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === HOLD) { u.face = u.heading; setState(u, STATE.ENGAGE); return; }   // carry() runs the hold
  if (b.act === 2 && now - b.actT > T.inkPose && now >= b.next2) act(w, u, 0);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (now < b.next2 && u.possessed !== 1) {   // backing away from the fight after inking
    setState(u, STATE.ALERT);
    const away = t || w.findNearest(u.x, u.y, 200, ENEMY[u.faction], null, 0);
    if (away) { const dx = u.x - away.x, dy = u.y - away.y, d = hypot(dx, dy) || 0.001; u.goalX = dx / d * T.run; u.goalY = dy / d * T.run; u.face = Math.atan2(-dy, -dx); }
    return;
  }
  if (fleeing(w, u, t)) return;
  if (now >= b.next && canAuto(w, u) && (t || u.possessed !== 1)) {   // its target in reach (or a look every 6 ticks): grab
    const near = t !== null && hypot(t.x - u.x, t.y - u.y) - t.radius <= u.radius + T.grabGap;
    if ((near || (w.tick + u.index) % 6 === 0) && grab(w, u) > 0) return;
  }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d - t.radius <= u.radius + T.grabGap * 0.6) {   // close enough: waits for its grab ...
    setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx);
    if ((tooBig(t) || !holdable(t, T.grabMass)) && u.cooldown <= 0) { bite(w, u, t, T.slam, T.slamEvery, 60, 0.1); u.attack = 1; }   // ... or slams one it can't hold (too big, a bee or drone flying)
    return;
  }
  hunt(w, u, t, d < T.chargeAt ? T.run : T.walk, d < T.chargeAt ? STATE.CHARGE : STATE.ADVANCE);
}

const D = sea({
  type: 'octopus', og: 'Octopus (ours)',   // no OG unit: the name is for tracing (and the generic possess tests)
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 2,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.swim * 1.15, accel: 400, decel: 500, turnRate: 5,
  waterPace: T.swim / T.run,
  flammability: T.flammability, density: 1.1, brushSpacing: 34,
  look: { attack: { time: 0.35 } },
  init(w, u) { initBag(w, u); u.b.next = w.rng() * 0.5; },
  holdsNerve(w, u) { return u.subState === HOLD; },
  // every tick, before the brain (which skips ticks while it reacts to a new target): the held ones stay held
  carry(w, u) { if (u.subState === HOLD) hold(w, u); },
  onHit(w, u, amount) {
    if (!(u.hp > 0) || amount <= 0) return;
    const b = u.b;
    if (b.inked === 0 ? u.hp < T.inkAt * u.maxHp : w.time >= b.inkNext) ink(w, u);
  },
  onDeath(w, u) { if (u.subState === HOLD) letGo(w, u, false); },
  // possessed, attack held at nobody: grab whoever is in reach
  possessFire(w, u) { if (u.subState === 0 && w.time >= u.b.next) grab(w, u); },
  // holding: anchored (the stick can't drag four people about)
  possessMove(w, u) { if (u.subState === HOLD) { u.goalX = 0; u.goalY = 0; } },
  brain,
});
export default D;
export { T };
