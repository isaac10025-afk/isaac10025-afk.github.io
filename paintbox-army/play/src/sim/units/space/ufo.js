// ufo (OURS, Space tab): a silver saucer, high flyer (z 90: crosses walls and water; melee units can't reach it, shots
// can), machine + metal (no blood, sparks, not raisable, not mind-controllable, no morale). Slow (70 px/s).
// Beam: hovers over a light enemy (mass ≤ 4, not a boss, on the ground) and lifts it up the beam over 1.5 s into the
// saucer: gone, killed with no body (eaten = 1, inside = the UFO for its last tick; the report credits the UFO,
// cause 'swallowed'). While it rises the victim is stunned, untargetable (hidden) and drawn by the core at its own u.z.
// Cooldown 4 s. Ray: projectile `ray` (alien.js), 12 every 1.2 s at up to 250 px, fired down from the saucer.
// At 0 hp it wobbles and crashes over 1 s (falls from its height), then blows up: r 50, 70 (system after water, before
// deaths: held at 1 hp, untargetable, like the pirate ship's sinking). Webbed: drops to the ground until the web goes.
// Owner: SPACE-SIM. Pose codes (STEP6.md): b.act 1 beam → `beam` (b.victim rising; the sim moves its z, art draws the
// cone); 2 crash → `crash`; flying → `fly0`/`fly1` (art, lights blink).
import { registerBlast, explode, splatNoise } from '../../combat/index.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import {
  alien, initBag, act, targetOf, setState, idle, hypot, angleDiff, STATE, LEAP, DT, ENEMY, damage,
  markSky, flying, grounded, unitOf, shotHeight, spawnProjectile, MACHINE_MORALE,
} from './_lib.js';

const T = {
  hp: 900, mass: 8, radius: 18,
  speed: 70,            // px/s flying
  flyH: 90,             // px: cruising height (a high flyer)
  rise: 2,              // 1/s: eases to cruising height
  // beam
  beamMass: 4,          // lifts units this light or lighter (not bosses)
  beamTime: 1.5,        // s up the beam
  beamCool: 4,          // s from one abduction to the next
  beamR: 10,            // px: the beam starts when the prey is within this + its radius of the saucer's middle (on the ground)
  pull: 8,              // 1/s: the beam draws the victim in under the saucer this fast
  preyR: 320,           // px: looks this far for something to lift
  scanEvery: 12,        // ticks between prey searches
  // ray
  ray: {
    range: 250,         // px
    projectileSpeed: 650, // px/s
    damage: 12,         // per bolt
    damageJitter: 2,
    noiseRadius: 240,
  },
  rayEvery: 1.2,        // s between bolts
  aimTol: 0.6,          // rad (it turns slowly; the gun is under the saucer)
  hover: 150,           // px: with nothing to lift it hangs this far from its target
  band: 40,
  // crash
  crashTime: 1,         // s wobbling down
  crash: { radius: 50, damage: 70, minFalloff: 0.3, push: 260, stun: 0.6, tossUp: 220, tossSpeed: 160, tossFrom: 0.5, hatChance: 0.6, noiseRadius: 400 },
};
const CRASH = registerBlast('ufocrash', T.crash);
const FLY = 0, BEAM = 1, DROPPED = 2;   // subState

// something it can lift: light, not a boss / prop / flyer, on the ground, not held / swallowed / floating
function liftable(w, o) {
  const d = o.def;
  return o.hp > 0 && !o.dead && o.mass <= T.beamMass && !d.boss && !d.prop && !flying(o) && grounded(o) && o.inside < 0 &&
    o.hurled !== 1 && o.leaping === 0 && !(o.floating > w.time) && d.aquatic !== true && !(o.hidden > 0);
}
const PQ = new Array(48);
function findPrey(w, u) {
  const n = w.queryMask(u.x, u.y, T.preyR, ENEMY[u.faction], PQ, PQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (!liftable(w, o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// ---------------------------------------------------------------- beam
// Who is up which beam (per world): a UFO can vanish without dying (a mage's curse turns it into a frog, Erase), and its
// victim must not be left hanging hidden: beamSys lets go of any victim whose UFO is no longer beaming it.
const WS = new WeakMap();
function beams(w) { let l = WS.get(w); if (!l) { l = []; WS.set(w, l); } return l; }
onWorldClear((w) => { const l = WS.get(w); if (l) l.length = 0; });
function freeVictim(w, v) { v.hurled = 0; v.hidden = 0; v.vz = 0; v.thrownAt = w.time; }
function startBeam(w, u, v) {
  const b = u.b;
  beams(w).push(v.id, u.id);
  u.subState = BEAM; b.victim = v.id; b.t0 = w.time; b.prey = -1;
  v.hurled = 1; v.hidden = 0.001; v.target = -1; v.stun = Math.max(v.stun, 0.3);
  act(w, u, 1);
  w.emit('charge', { x: v.x, y: v.y, v: 1, type: u.type, beam: 1 });   // STEP6 SPACE AUDIO: beam = a rising hum
}
function letGo(w, u) {   // the victim drops (UFO hit out of the sky, webbed, ...): gravity takes it
  const b = u.b, v = unitOf(w, b.victim);
  if (v) freeVictim(w, v);
  b.victim = -1; u.subState = FLY; b.next = w.time + T.beamCool * 0.5;
  if (u.b.act === 1) act(w, u, 0);
}
function beam(w, u) {
  const b = u.b, v = unitOf(w, b.victim);
  if (!v || !(v.hp > 0) || v.inside >= 0) { b.victim = -1; u.subState = FLY; b.next = w.time + T.beamCool; act(w, u, 0); return; }
  const f = Math.min(1, (w.time - b.t0) / T.beamTime), e = f * f * (3 - 2 * f);
  const k = Math.min(1, T.pull * DT);
  v.x += (u.x - v.x) * k; v.y += (u.y - v.y) * k;
  v.z = v.pz = Math.max(2, (u.z - 0.6 * u.radius) * e); v.vz = 0; v.vx = u.vx; v.vy = u.vy; v.spin = 2;
  if (v.stun < 0.3) v.stun = 0.3;
  v.hurled = 1; v.hidden = 0.001;
  setState(u, STATE.ENGAGE);
  if (f < 1) return;
  // into the saucer: gone (no body), the UFO gets the kill
  v.hurled = 0; v.eaten = 1; v.inside = u.id; v.infection = 0;
  damage(w, v, v.hp + 1e3, u, 'eaten');
  v.hp = Math.min(v.hp, 0);
  w.emit('descend', { x: u.x, y: u.y, v: 1, type: u.type, abduct: 1, victim: v.type });   // STEP6 SPACE AUDIO: abduct = a slurp
  b.victim = -1; u.subState = FLY; b.next = w.time + T.beamCool;
  act(w, u, 0);
}

// a bolt from under the saucer's middle (so it hits what is right below too), falling from the saucer's height
function fireRay(w, u, aim, dist) {
  const R = T.ray, c = Math.cos(aim), s = Math.sin(aim), x = u.x + c * u.radius * 0.3, y = u.y + s * u.radius * 0.3;
  const dmg = R.damage + (2 * w.rng() - 1) * R.damageJitter;
  const p = spawnProjectile(w, 'ray', x, y, c * R.projectileSpeed, s * R.projectileSpeed, 1.3 * R.range / R.projectileSpeed, dmg, u.faction, u);
  if (p) shotHeight(p, Math.max(0, u.z - 0.4 * u.radius), Math.max(20, dist));
  u.b.next2 = w.time + T.rayEvery; u.attack = 1; u.firedAt = w.time;
  splatNoise(w, u.x, u.y, 0.4, R.noiseRadius);
  w.emit('shot', { x: u.x, y: u.y, v: 0.8, type: u.type, snd: 'ray' });   // STEP6 SPACE AUDIO: snd 'ray' = a zap
  if (w.stats) w.stats.shots++;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  markSky(w);   // a flyer is about: melee units drop it as a target while it's up high (dinos' rule: def.flies + z > 30)
  if (b.crash > 0) { u.goalX = 0.4 * u.vx; u.goalY = 0.4 * u.vy; return; }   // crashing: drifts on, the crash system brings it down
  // webbed: drops (gravity, leaping 0) and sits until the web lets go
  if (u.webbed > now && u.subState !== DROPPED) { if (u.subState === BEAM) letGo(w, u); u.subState = DROPPED; u.leaping = 0; u.vz = 0; return; }
  if (u.subState === DROPPED) { if (u.webbed > now || u.z > 0) return; u.subState = FLY; }
  u.leaping = LEAP.FLY; u.vz = 0;
  u.z += (T.flyH - u.z) * Math.min(1, T.rise * DT);
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  // ray at its target whenever it's ready (also while beaming)
  if (t && now >= b.next2) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d <= T.ray.range * (u.state === STATE.ENGAGE ? 1.1 : 1)) {
      const lead = d / T.ray.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
      if (Math.abs(angleDiff(u.heading, aim)) < T.aimTol || u.subState === BEAM) fireRay(w, u, aim, d);
      if (u.subState !== BEAM) u.face = aim;
    }
  }
  if (u.subState === BEAM) return;   // holds still over the victim
  // pick something to lift: the target if light enough, else the nearest light enemy
  let p = unitOf(w, b.prey);
  if (u.possessed === 1) p = t && liftable(w, t) ? t : null;
  else if (now >= b.next && (w.tick + u.index) % T.scanEvery === 0) p = t && liftable(w, t) ? t : findPrey(w, u);
  if (p && !liftable(w, p)) p = null;
  b.prey = p ? p.id : -1;
  if (p && now >= b.next) {
    const dx = p.x - u.x, dy = p.y - u.y, d = hypot(dx, dy) || 0.001;
    setState(u, STATE.CHARGE);
    if (d <= T.beamR + p.radius) { startBeam(w, u, p); return; }
    const sp = Math.min(T.speed, 4 * d);
    u.goalX = dx / d * sp; u.goalY = dy / d * sp;
    return;
  }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  setState(u, STATE.ENGAGE);
  if (d > T.hover + T.band) { u.goalX = dx / d * T.speed; u.goalY = dy / d * T.speed; }
  else if (d < T.hover - T.band) { u.goalX = -dx / d * T.speed * 0.6; u.goalY = -dy / d * T.speed * 0.6; }
}

// The beam runs every tick in its own system (after the brains): a brain can skip ticks (a reaction delay on a new
// target), and a victim left a tick unheld would drop.
function beamSys(w) {
  const l = WS.get(w);
  if (!l || !l.length) return;
  for (let k = l.length - 2; k >= 0; k -= 2) {   // pairs: victim id, UFO id
    const v = w.unitById(l[k]), u = w.unitById(l[k + 1]);
    if (v && u && u.subState === BEAM && u.b.victim === v.id && u.b.crash === 0) { beam(w, u); if (u.b.victim === v.id) continue; }
    else if (v && v.inside < 0) freeVictim(w, v);   // its UFO is gone / done with it: it drops
    l[k] = l[l.length - 2]; l[k + 1] = l[l.length - 1]; l.length -= 2;
  }
}
registerSystem('spaceUfoBeam', beamSys, 'brain');

// ---------------------------------------------------------------- crash (after water, before deaths are processed)
function crashSys(w) {
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || u.def !== D) continue;
    const b = u.b;
    if (b.crash === 0) {
      if (u.hp > 0) continue;
      b.crash = 1; b.t0 = w.time; b.x0 = Math.max(0, u.z);
      if (u.subState === BEAM) letGo(w, u);
      act(w, u, 2);
      w.emit('hurt', { x: u.x, y: u.y, v: 1, type: u.type, crash: 1 });
    }
    // wobble down
    const f = Math.min(1, (w.time - b.t0) / T.crashTime);
    u.hp = 1; u.hidden = 0.001; u.target = -1; u.burning = 0;
    u.leaping = LEAP.FLY; u.z = u.pz = b.x0 * (1 - f * f); u.vz = 0;
    u.heading += Math.sin(w.time * 18) * 0.12;
    if (f < 1) continue;
    // down: boom. hp 0 first (its own blast must not hit it: its killer keeps the kill)
    u.hp = 0; u.hidden = 0; u.z = u.pz = 0; u.leaping = 0;
    explode(w, u.x, u.y, CRASH, u);
  }
}
registerSystem('spaceUfoCrash', crashSys, 'water');

const D = alien({
  type: 'ufo', og: 'UFO (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 4,
  walkSpeed: T.speed, runSpeed: T.speed, maxSpeed: 140, accel: 200, decel: 200, turnRate: 2.5,
  sightRange: 380, alertSightRange: 400, reactionTime: 0.2,
  infectable: false, flammability: 0, density: 3,
  machine: true, metal: true,       // STEP6: no blood, not raisable / infectable / mind-controllable; magnets pull it
  risenMode: undefined,             // a machine: no risen copy
  flies: true,                      // dinos' rule: melee units don't target it up there
  untossable: true,                 // a hovering saucer isn't flipped by blasts (pushed a little: mass 8)
  brushSpacing: 44,
  flock: { separation: 20, formation: 0.2, alignment: 0.05, flockByState: [0.5, 0.5, 0.2, 0.5, 0.2, 0.2] },
  morale: MACHINE_MORALE,
  weapon: { range: T.ray.range },   // possess: aim reach
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.b.crash = 0; u.b.next2 = w.time + T.rayEvery * w.rng(); u.b.next = w.time + 1; u.leaping = LEAP.FLY; u.z = u.pz = 0; },
  holdsNerve() { return true; },
  onDeath(w, u) { if (u.subState === BEAM) letGo(w, u); },
  // possessed, attack held at nobody: lift whatever is under the saucer, else a ray at the aim point
  possessFire(w, u, aim, ax, ay) {
    if (u.b.crash > 0 || u.subState !== FLY) return;
    if (w.time >= u.b.next) {
      const o = w.findNearest(u.x, u.y, T.beamR + 12, ENEMY[u.faction], null, 0);
      if (o && liftable(w, o)) { startBeam(w, u, o); return; }
    }
    if (w.time >= u.b.next2) fireRay(w, u, aim, hypot(ax - u.x, ay - u.y));
  },
  brain,
});
export default D;
export { T };
