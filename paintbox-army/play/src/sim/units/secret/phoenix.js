// Phoenix (OURS, Secret tab, Part 2 step 7): a fire bird, high flyer (z 50: melee can't reach it, shots can; dinos'
// markSky rule). Fire immune (flammability 0, fire hits ×0). Fire dive: every 4 s it picks the thickest line of enemies
// (the thickest crowd, then the best of 6 directions through it), flies to one end and swoops along it: down to z 6 on a
// 200 px run at 260 px/s, and everything within 18 px of its path (enemies, trees, barrels, oil) takes 15 and catches
// fire. Rebirth: at 0 hp it bursts (fire blast r 60: 40 + ignite) and becomes an EGG where it falls, for 5 s (can't act,
// hp 120, fire ×0), then hatches at full hp. Once per phoenix. An egg in deep water, or broken, is gone (no body). Not
// raisable. Owner: SECRET-SIM.
// Pose codes (STEP7.md): b.act 1 dive → `dive` (the swoop run), 2 egg → `egg` (+ `b.crack` 0..1), 3 hatch → `hatch`
// (0.6 s from the hatch); flying `fly0`/`fly1` (art). Egg: u.z 0, u.leaping 0.
import {
  secret, initBag, targetOf, setState, act, actDone, canAuto, idle, flyAt, easeZ, circleAround, webbedDown, damage,
  igniteNow, getOil, markSky, high, thickestCrowd, phoenixList, registerSystem, depthAt, eachFoe, swing,
  hypot, STATE, LEAP, DEEP, DT, SEC, ENEMY, F, FEARLESS,
} from './_lib.js';
import { HITTABLE } from '../../factions.js';

const T = {
  radius: 12,         // OG-raw radius (registerUnit ×1.1)
  hp: 500,            // hit points
  mass: 3,            // a big bird
  fly: 120,           // px/s flying
  dive: 260,          // px/s on the swoop run
  flyZ: 50,           // px: cruising height (high flyer)
  diveZ: 6,           // px: bottom of the swoop
  diveEvery: 4,       // s between dives
  diveLen: 200,       // px: the swoop run
  lineR: 18,          // px: everything this close to its path burns ...
  diveDmg: 15,        // ... and takes this much
  lowZ: 20,           // px: it burns things only while this low
  hitZ: 30,           // px: ... and things up to this high (every low flyer: a drone flies at 22, a seagull at 26; ATTACK3
                      //     L3: at 20 a drone swarm zapped a phoenix to death, its dives passing under them)
  scan: 480,          // px: looks this far for a crowd to swoop through
  crowdR: 60,         // px: a crowd is counted within this
  lineTries: 6,       // directions tried through the crowd
  approachMax: 3,     // s: gives up flying to the dive start after this
  startNear: 18,      // px from the dive start: the run begins
  circleR: 110,       // px: circles its target this far out between dives
  burstR: 60,         // px: rebirth burst radius ...
  burstDmg: 40,       // ... damage (+ ignite)
  egg: 5,             // s as an egg
  eggHp: 120,         // egg hit points
  hatchPose: 0.6,     // s of the hatch pose
  sight: 440,         // px
  claw: 14,           // ATTACK3 L3 (ours): talons on another high flyer (its dive burns only things low down) ...
  clawEvery: 0.9,     // ... every 0.9 s ...
  clawGap: 30,        // ... wheeling round it this far past both bodies between rakes ...
  clawReach: 16,      // ... in reach within this
};
const RUN = 1, EGG = 2, HATCH = 3, APPROACH = 4;   // subState
const HITS = 48;      // units burned per run (each once)

// ---- line picking
const PT = new Float64Array(3), LQ = new Array(96);
function pickLine(w, u) {
  const b = u.b;
  if (!thickestCrowd(w, u, u.x, u.y, T.scan, T.crowdR, null, PT)) return false;
  const cx = PT[0], cy = PT[1], half = T.diveLen / 2;
  const n = w.queryMask(cx, cy, half + T.lineR + SEC.MARGIN, ENEMY[u.faction], LQ, LQ.length);
  let best = -1, ba = 0;
  for (let k = 0; k < T.lineTries; k++) {
    const a = (k / T.lineTries) * Math.PI, ex = Math.cos(a), ey = Math.sin(a);
    let c = 0;
    for (let j = 0; j < n; j++) {
      const o = LQ[j];
      if (o.dead || !(o.hp > 0) || o.inside >= 0 || o.z > T.hitZ || o.def.prop) continue;
      const ox = o.x - cx, oy = o.y - cy, along = ox * ex + oy * ey;
      if (along < -half || along > half) continue;
      if (Math.abs(ox * ey - oy * ex) <= T.lineR + o.radius) c++;
    }
    if (c > best) { best = c; ba = a; }
  }
  for (let j = 0; j < n; j++) LQ[j] = null;
  if (best <= 0) return false;
  let ex = Math.cos(ba), ey = Math.sin(ba);
  const s1 = hypot(cx - ex * half - u.x, cy - ey * half - u.y), s2 = hypot(cx + ex * half - u.x, cy + ey * half - u.y);
  if (s2 < s1) { ex = -ex; ey = -ey; }   // start at the nearer end
  b.x0 = cx - ex * half; b.y0 = cy - ey * half; b.dx = ex; b.dy = ey;
  return true;
}
function startRun(w, u, dx, dy) {
  const b = u.b, d = hypot(dx, dy) || 1;
  u.subState = RUN; b.t0 = w.time; b.dx = dx / d; b.dy = dy / d; b.nh = 0; b.t1 = u.z;
  act(w, u, 1); setState(u, STATE.ENGAGE);
  w.emit('flap', { x: u.x, y: u.y, v: 1.4, type: u.type, dive: 1 });   // STEP7 AUDIO: phoenix screech + whoosh
}
// ---- the swoop: along b.dx/b.dy at dive speed, dipping to diveZ; burns everything near its path once
let _u = null, _w = null;
function burnOne(o) {
  const u = _u, b = u.b;
  if (o === u || o.dead || !(o.hp > 0) || o.inside >= 0 || o.z > T.hitZ || o.climb > 0) return;
  if (hypot(o.x - u.x, o.y - u.y) > T.lineR + o.radius + u.radius * 0.5) return;
  for (let k = 0; k < b.nh; k++) if (b.hits[k] === o.id) return;
  if (b.nh < HITS) b.hits[b.nh++] = o.id;
  damage(_w, o, T.diveDmg, u, 'fire', o.x, o.y);   // from above: shields don't help
  igniteNow(_w, o);
}
function run(w, u) {
  const b = u.b, f = Math.min(1, (w.time - b.t0) / (T.diveLen / T.dive)), q = Math.abs(2 * f - 1);
  u.goalX = b.dx * T.dive; u.goalY = b.dy * T.dive; u.face = Math.atan2(b.dy, b.dx);
  u.z = T.diveZ + (Math.max(b.t1, T.diveZ) - T.diveZ) * q * q * q;
  markSky(w);
  if (u.z <= T.lowZ) {
    _u = u; _w = w;
    w.query(u.x, u.y, T.lineR + u.radius + SEC.MARGIN, burnOne, HITTABLE[u.faction]);
    _u = null; _w = null;
    if (w.oilCells > 0 && (w.tick & 3) === 0) getOil(w).ignite(u.x, u.y, T.lineR * 0.6);
  }
  if (f >= 1) { u.subState = 0; act(w, u, 0); u.b.next = w.time + T.diveEvery; }
}

// every tick, before the brain (which skips ticks while it reacts to a new target): the egg's clock and the swoop run
function carry(w, u) {
  if (w.holding) return;
  if (u.subState === EGG) { egg(w, u); return; }
  if (u.subState !== RUN) return;
  u.leaping = LEAP.FLY; u.vz = 0;
  if (webbedDown(w, u)) { u.subState = 0; act(w, u, 0); return; }
  run(w, u);
}
function brain(w, u) {
  const b = u.b, now = w.time, s = u.subState;
  if (s === EGG || s === RUN) return;   // carry() runs them
  u.goalX = 0; u.goalY = 0; u.face = NaN; u.vz = 0;
  u.leaping = LEAP.FLY;
  if (webbedDown(w, u)) { if (s !== 0) { u.subState = 0; act(w, u, 0); } return; }
  if (u.z > SEC.SKY) markSky(w);   // up there: melee units drop it as a target (dinos' rule)
  if (s === HATCH) {
    easeZ(u, T.flyZ, 2);
    if (now - b.t0 >= T.hatchPose) { u.subState = 0; act(w, u, 0); }
    return;
  }
  easeZ(u, T.flyZ, 3);
  if (u.stun > 0) { if (s === APPROACH) u.subState = 0; u.face = u.heading; return; }
  if (s === APPROACH) {
    const d = flyAt(u, b.x0, b.y0, T.fly * 1.3);
    if (d <= T.startNear) startRun(w, u, b.dx, b.dy);
    else if (now - b.t0 > T.approachMax) { u.subState = 0; b.next = now + 1; }
    return;
  }
  const t = targetOf(w, u);
  if (u.state === STATE.FLEE) setState(u, STATE.IDLE);
  if (!t) { idle(w, u); return; }
  setState(u, STATE.ENGAGE);
  if (now >= b.next && canAuto(w, u)) {
    if (u.possessed === 1) {   // the player picked it: swoop straight through it from here
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy);
      if (d < T.diveLen * 0.9) { startRun(w, u, d > 1 ? dx : Math.cos(u.heading), d > 1 ? dy : Math.sin(u.heading)); return; }
    } else if (pickLine(w, u)) { u.subState = APPROACH; b.t0 = now; return; }
    else {
      // ATTACK3 L3: no crowd on the ground (a drone swarm, bees, crows): swoop straight through its target when it's a low
      // flyer in range; the crowd pick counts only units on the ground, so it circled drones until they zapped it dead
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy);
      if (t.z > 6 && t.z <= T.hitZ && d > 1 && d < T.diveLen * 0.9) { startRun(w, u, dx, dy); return; }
      b.next = now + 0.5;
    }
  }
  if (high(t)) { clawFight(w, u, t); return; }   // another high flyer: circle it close and rake it
  circleAround(u, t.x, t.y, T.circleR, T.fly);
}

// ---- another high flyer (ATTACK3 L3): its dive only burns things low down, and it used to fly AT a high target: two
// phoenixes (or one and a jetpack / UFO / dragon) met in one spot and hung there, stacked and still, for the rest of the
// battle. Now it wheels round the flyer and dives at it to rake it with its talons whenever they're ready.
function clawFight(w, u, t) {
  const R = u.radius + t.radius, dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  u.face = Math.atan2(dy, dx);
  if (u.cooldown <= 0) {   // talons ready: straight at it
    flyAt(u, t.x, t.y, T.fly * 1.3);
    if (d > R + T.clawReach) return;
    damage(w, t, T.claw, u);
    u.cooldown = T.clawEvery; u.attack = 1;
    w.emit('strike', { x: t.x, y: t.y, v: 0.8, type: u.type, id: u.id });
    return;
  }
  // between rakes: wheel round it a little way out, every phoenix the same way round (a pair circles its middle
  // instead of both sliding off together into the field edge)
  const want = R + T.clawGap, m = Math.max(-T.fly, Math.min(T.fly, 2.5 * (d - want)));
  let vx = -dy / d * T.fly + dx / d * m, vy = dx / d * T.fly + dy / d * m;
  const v = hypot(vx, vy) || 0.001; u.goalX = vx * T.fly / v; u.goalY = vy * T.fly / v;
}
// ---- egg (5 s, then it hatches at full hp)
function egg(w, u) {
  const b = u.b, now = w.time;
  u.leaping = 0; u.target = -1; u.burning = 0;
  if (u.stun < 0.1) u.stun = 0.1;   // can't act
  b.crack = Math.min(1, (now - b.t0) / T.egg);
  if (now - b.t0 < T.egg) return;
  b.egg = 0; u.maxHp = b.maxHp0; u.hp = u.maxHp; u.stun = 0;
  u.subState = HATCH; b.t0 = now; act(w, u, 3); u.leaping = LEAP.FLY; b.crack = 1;
  w.emit('spell', { x: u.x, y: u.y, v: 1, type: u.type, hatch: 1 });   // STEP7 AUDIO: egg cracks, phoenix cry
}
// burst + egg (the rebirth system calls this at 0 hp, once)
let _bu = null, _bw = null;
function burstOne(o) { damage(_bw, o, T.burstDmg, _bu, 'fire', _bu.x, _bu.y); if (o.hp > 0) igniteNow(_bw, o); }
function becomeEgg(w, u) {
  const b = u.b;
  _bu = u; _bw = w;
  eachFoe(w, u, u.x, u.y, T.burstR, false, burstOne);
  _bu = null; _bw = null;
  w.emit('explosion', { x: u.x, y: u.y, r: T.burstR, fire: 1 });   // the blast look + boom
  w.emit('ignite', { x: u.x, y: u.y, v: u.radius, type: u.type, rebirth: 1 });   // STEP7 AUDIO: rebirth whoosh
  b.reborn = 1; b.egg = 1; b.maxHp0 = u.maxHp; b.crack = 0;
  u.maxHp = u.hp = T.eggHp * u.shrink;
  u.subState = EGG; b.t0 = w.time; act(w, u, 2);
  u.leaping = 0; u.vz = 0; u.vx *= 0.3; u.vy *= 0.3; u.target = -1; u.burning = 0; u.attack = 0;
}
// After water (before deaths are processed): a phoenix at 0 hp becomes an egg (once); an egg that sank in deep water or
// was broken is gone (no body; the killer keeps the kill).
function rebirthSys(w) {
  const list = phoenixList(w);
  for (let k = list.length - 1; k >= 0; k--) {
    const u = w.unitById(list[k]);
    if (!u) { list[k] = list[list.length - 1]; list.pop(); continue; }
    const b = u.b;
    if (b.egg === 1) {
      if (!(u.z > 0) && w.waterCells > 0 && depthAt(w, u.x, u.y) >= DEEP && u.hp > 0) { u.hp = 0; w.emit('splash', { x: u.x, y: u.y, v: 1 }); }
      if (!(u.hp > 0)) { u.eaten = 1; w.emit('ricochet', { x: u.x, y: u.y, v: 0.6, type: u.type, eggbreak: 1 }); }   // STEP7 AUDIO: egg shell crunch
      continue;
    }
    if (u.hp > 0 || b.reborn === 1 || u.inside >= 0 || u.eaten === 1 || u.infection > 0) continue;
    becomeEgg(w, u);
  }
}
registerSystem('secret-rebirth', rebirthSys, 'water');

secret({
  type: 'phoenix', og: 'Phoenix (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 6,
  walkSpeed: T.fly, runSpeed: T.fly, maxSpeed: T.dive * 1.1, accel: 1400, decel: 1000, turnRate: 6,
  sightRange: T.sight, alertSightRange: T.sight + 40, reactionTime: 0.15,
  intelligence: 1, infectable: false, raisable: false,   // not raisable: no risenMode
  flammability: 0, density: 1,   // fire immune: never catches fire (lava too)
  flies: true,        // high flyer: melee units don't target it up there (dinos' rule, z > 30)
  weapon: { range: T.diveLen },   // possess: aim reach
  brushSpacing: 36,
  flock: { separation: 26, alignment: 0, cohesion: 0, formation: 0.2 },
  morale: FEARLESS,
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.egg = 0; b.reborn = 0; b.crack = 0; b.maxHp0 = u.maxHp; b.hits = new Int32Array(HITS); b.nh = 0;
    b.next = w.time + 1 + w.rng();
    u.leaping = LEAP.FLY; u.z = u.pz = 0;
    phoenixList(w).push(u.id);
  },
  damageMul(w, u, amount, att, kind) { return kind === 'fire' ? 0 : 1; },
  holdsNerve() { return true; },
  carry,
  possessMove(w, u) { if (u.subState === EGG || u.subState === RUN) { u.goalX = u.subState === RUN ? u.b.dx * T.dive : 0; u.goalY = u.subState === RUN ? u.b.dy * T.dive : 0; } },
  // possessed, attack held at nobody: swoop along the aim from here
  possessFire(w, u, aim) {
    if (u.subState !== 0 || w.time < u.b.next || u.webbed > w.time) { if (u.subState === 0) swing(w, u, 0.5); return; }
    startRun(w, u, Math.cos(aim), Math.sin(aim));
  },
  brain,
});
export { T };
