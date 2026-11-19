// Giant worm (OURS, Bosses tab, Part 2 step 6): tunnels underground most of the time: a dirt mound moving at 120 px/s
// that nobody can target or hurt (u.hidden, damageMul 0, shots pass over it like a deep-water wader's: env.submerged).
// It picks the thickest enemy crowd, rumbles there 0.6 s (cracks), then BURSTS UP: units within 70 px take 60 and are
// tossed high. It stays up 4 s biting (90, reach r + 40; a unit of mass <= 2 is swallowed whole: u.inside, dead in
// 1 s, no body), then dives back down for 3 s before it can burst again. It can't surface in water (or in a wall): it
// tunnels on to dry ground. Owner: BOSSES-SIM.
// Pose (STEP6.md): b.act 1 under -> `under` (mound), 2 rumble -> `rumble`, 3 burst -> `burst`, 4 up, biting -> `bite`,
// 5 dive -> `dive`. b.act always equals u.subState. b.victim = the unit it just swallowed (-1 none).
import {
  boss, initBag, targetOf, setState, act, canAuto, shrug, hittable, high, grounded, grabbable, thickestCrowd, tossFrom,
  swallow, releaseAll, strikeDown, damage, depthAt, splatNoise, hooks, hypot,
  STATE, ENEMY, BOSS, WET, LEAP,
} from './_lib.js';

const T = {
  radius: 22, hp: 7500, mass: 40,   // STEP6 size, hp 5000 -> 7500: each 4 s up under 150 guns cost ~4000, it died on its 2nd burst
  under: 120,                       // px/s tunnelling
  scan: 900,                        // px: looks this far for crowds
  crowdR: 70,                       // px: a crowd is counted (and burst) within this
  crowdEvery: 1,                    // s between crowd re-picks while tunnelling
  arrive: 12,                       // px from its burst point: close enough
  rumble: 0.6,                      // s of rumble (cracks) before it bursts
  burstDmg: 60,                     // burst: damage to everyone within crowdR (+ half their radius) ...
  burstOut: 90,                     // ... tossed out this fast (px/s) ...
  burstUp: 460,                     // ... and this high (px/s up)
  burstPose: 0.5,                   // s of the burst pose
  upTime: 4,                        // s it stays up (from the burst)
  bite: 90,                         // bite damage ...
  biteJitter: 8,                    // ... ± this
  biteReach: 40,                    // ... reaching this far past both bodies
  biteEvery: 1.1,                   // s between bites
  biteStun: 0.3,                    // s
  swallowMass: 2,                   // units this light or lighter are swallowed whole ...
  digest: 1,                        // ... and are dead this long after (no body)
  dive: 0.5,                        // s of the dive pose
  downTime: 3,                      // s under after a dive before it may burst again
  first: 1.5,                       // s under after it is placed before its first burst
  shore: 12,                        // ATTACK3 L3: a crowd in the water: dry spots looked for in rings this far apart ...
  shoreReach: 0.8,                  // ... out to 0.8 x crowdR from it (the burst still reaches them)
};
const UNDER = 1, RUMBLE = 2, BURST = 3, UP = 4, DIVE = 5;   // u.subState = b.act (STEP6.md)
const PT = new Float64Array(3), BQ = new Array(96);

function phase(w, u, s) { u.subState = s; act(w, u, s); u.b.t0 = w.time; }
function canSurface(w, x, y) {
  if (x < 20 || y < 20 || x > w.W - 20 || y > w.H - 20) return false;
  if (w.walls.count > 0 && w.walls.isSolidAt(x, y)) return false;
  return !(w.waterCells > 0 && depthAt(w, x, y) >= WET);
}
// Where to burst: the thickest crowd standing on dry ground; else (ATTACK3 L3) the thickest crowd anywhere, burst from the
// dry ground next to it (the burst reaches 70 px). Riflemen wading in the shallows of a river had no crowd "on dry
// ground", so the worm lay under their feet doing nothing, and they couldn't see it: neither side moved again.
function pickBurst(w, u) {
  const R = T.crowdR * u.shrink;
  if (thickestCrowd(w, u, u.x, u.y, T.scan, R, canSurface, PT)) return true;
  if (!thickestCrowd(w, u, u.x, u.y, T.scan, R, null, PT)) return false;
  const cx = PT[0], cy = PT[1];
  for (let r = T.shore; r <= R * T.shoreReach; r += T.shore) {
    let best = Infinity, bx = 0, by = 0;
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!canSurface(w, x, y)) continue;
      const d = hypot(x - u.x, y - u.y);
      if (d < best) { best = d; bx = x; by = y; }
    }
    if (best < Infinity) { PT[0] = bx; PT[1] = by; return true; }
  }
  return false;
}
function goUnder(w, u) {
  const b = u.b;
  phase(w, u, UNDER);
  b.under = 1; u.hidden = 0.001; u.leaping = LEAP.FLY; u.burning = 0; u.target = -1;   // the dirt puts a fire out
  b.next = w.time + T.downTime; b.next2 = w.time;
}
function burst(w, u) {
  const b = u.b;
  phase(w, u, BURST);
  b.under = 0; u.hidden = 0; u.leaping = 0; u.z = 0; u.vx = 0; u.vy = 0;
  b.next3 = w.time + 0.25;   // first bite
  const R = T.crowdR * u.shrink;
  const n = w.queryMask(u.x, u.y, R + BOSS.MARGIN, ENEMY[u.faction], BQ, BQ.length);
  for (let k = 0; k < n; k++) {
    const o = BQ[k]; BQ[k] = null;
    if (!hittable(u, o) || !grounded(o) || o.def.prop) continue;
    if (hypot(o.x - u.x, o.y - u.y) > R + o.radius * 0.5) continue;
    damage(w, o, T.burstDmg, u, undefined, o.x, o.y);   // from below: shields don't help
    if (o.hp > 0) tossFrom(w, o, u.x, u.y, T.burstOut, T.burstUp);
  }
  splatNoise(w, u.x, u.y, 1.2, 400);
  if (hooks.iceHarm) hooks.iceHarm(w, u.x, u.y, R, 2, 0.5);
  w.emit('blast', { x: u.x, y: u.y, r: R, kind: 3 });
  w.emit('burst', { x: u.x, y: u.y, v: 3, type: u.type });   // STEP6 AUDIO: earth bursting + roar
  w.emit('trample', { x: u.x, y: u.y, v: 3, type: u.type });
}
// Up: the nearest enemy in reach is bitten (the target first); a light one is swallowed whole.
function biteNow(w, u, t) {
  const b = u.b, R = u.radius + T.biteReach * u.shrink;
  let v = null;
  if (t && !high(t) && hypot(t.x - u.x, t.y - u.y) <= R + t.radius) v = t;
  if (!v && u.possessed !== 1) {
    const n = w.queryMask(u.x, u.y, R + BOSS.MARGIN, ENEMY[u.faction], BQ, BQ.length);
    let bd = Infinity;
    for (let k = 0; k < n; k++) {
      const o = BQ[k]; BQ[k] = null;
      if (!hittable(u, o) || high(o) || o.def.prop || (o.unseen > 0 && o.unseen < 1)) continue;
      const d = hypot(o.x - u.x, o.y - u.y) - o.radius;
      if (d <= R && d < bd) { bd = d; v = o; }
    }
  }
  if (!v) return false;
  u.face = Math.atan2(v.y - u.y, v.x - u.x);
  b.next3 = w.time + T.biteEvery * (0.9 + 0.2 * w.rng());
  u.attack = 1;
  if (grabbable(v, T.swallowMass) && swallow(w, u, v, 0)) {
    b.victim = v.id; b.sw[b.ns % 4] = v.id; b.swT[b.ns % 4] = w.time + T.digest; b.ns++;
    w.emit('strike', { x: v.x, y: v.y, v: 2, type: u.type });
    return true;
  }
  strikeDown(w, u, v, T.bite, T.biteJitter, 160, T.biteStun);   // jaws from above: shields don't help
  return true;
}
// Swallowed units die 1 s after going down (no body: they were eaten).
function digest(w, u) {
  const b = u.b;
  for (let k = 0; k < 4; k++) {
    if (b.sw[k] < 0 || w.time < b.swT[k]) continue;
    const v = w.unitById(b.sw[k]); b.sw[k] = -1;
    if (v && v.hp > 0 && v.inside === u.id) damage(w, v, v.hp + 1000, u, 'eaten');
    if (b.victim >= 0 && (!v || b.victim === v.id)) b.victim = -1;
  }
}

function brain(w, u) {
  const b = u.b, now = w.time, s = u.subState;
  shrug(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  digest(w, u);
  if (s === UNDER) {
    u.hidden = 0.001; u.burning = 0; u.leaping = LEAP.FLY;
    const t = u.possessed === 1 ? targetOf(w, u) : null;
    let have = false;
    if (t) { b.x0 = t.x; b.y0 = t.y; have = true; }
    else if (u.possessed !== 1) {
      if (now >= b.next2) { b.next2 = now + T.crowdEvery; b.k = pickBurst(w, u) ? 1 : 0; if (b.k) { b.x0 = PT[0]; b.y0 = PT[1]; } }
      have = b.k === 1;
    }
    if (!have) { setState(u, STATE.IDLE); return; }
    const dx = b.x0 - u.x, dy = b.y0 - u.y, d = hypot(dx, dy);
    setState(u, STATE.ADVANCE);
    if (d > T.arrive) { u.goalX = dx / d * T.under; u.goalY = dy / d * T.under; return; }
    if (now >= b.next && canAuto(w, u) && canSurface(w, u.x, u.y)) { phase(w, u, RUMBLE); u.vx = 0; u.vy = 0; w.emit('rumble', { x: u.x, y: u.y, v: 2, type: u.type }); }   // STEP6 AUDIO: rumble
    return;
  }
  if (s === RUMBLE) {
    u.hidden = 0.001; u.vx *= 0.8; u.vy *= 0.8; setState(u, STATE.ENGAGE);
    if (now - b.t0 >= T.rumble) { if (canSurface(w, u.x, u.y)) burst(w, u); else phase(w, u, UNDER); }
    return;
  }
  if (s === BURST || s === UP) {
    setState(u, STATE.ENGAGE); u.vx = 0; u.vy = 0;
    if (s === BURST && now - b.t0 >= T.burstPose) { u.subState = UP; act(w, u, UP); }
    const t = targetOf(w, u);
    if (t) u.face = Math.atan2(t.y - u.y, t.x - u.x);
    if (now >= b.next3 && canAuto(w, u)) biteNow(w, u, t);
    if (s === UP && now - b.t0 >= T.upTime) { phase(w, u, DIVE); w.emit('dive', { x: u.x, y: u.y, v: 2, type: u.type }); }   // b.t0 = the burst; STEP6 AUDIO: dig in
    return;
  }
  if (s === DIVE) {
    u.vx = 0; u.vy = 0;
    if (now - b.t0 >= T.dive) goUnder(w, u);
  }
}

const D = boss({
  type: 'worm', og: 'Giant worm (ours)',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 30,
  walkSpeed: T.under, runSpeed: T.under, maxSpeed: 140, accel: 600, decel: 600, turnRate: 4,
  flammability: 0.4, density: 6,
  weapon: { range: 300 },   // possess: aim reach
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.under = 0; b.sw = new Int32Array(4).fill(-1); b.swT = new Float64Array(4); b.ns = 0;
    goUnder(w, u);
    b.next = w.time + T.first;
  },
  // under the ground: nothing hurts it and shots pass (combat/env.js submerged asks this)
  underground(u) { return u.b.under === 1; },
  damageMul(w, u) { return u.b.under === 1 ? 0 : 1; },
  onDeath(w, u) { releaseAll(w, u, true); },
  // stick: drives the mound; up (or bursting / diving) it stays where it is
  possessMove(w, u) { if (u.subState !== UNDER) { u.goalX = 0; u.goalY = 0; } },
  // possessed, attack held at nobody: under -> rumble and burst right here (when it may); up -> bite whoever is in reach
  possessFire(w, u) {
    const s = u.subState;
    if (s === UNDER) { if (w.time >= u.b.next && canSurface(w, u.x, u.y)) { phase(w, u, RUMBLE); u.vx = 0; u.vy = 0; } return; }
    if ((s === UP || s === BURST) && w.time >= u.b.next3) {
      const n = w.queryMask(u.x, u.y, u.radius + T.biteReach + BOSS.MARGIN, ENEMY[u.faction], BQ, BQ.length);
      let best = null, bd = Infinity;
      for (let k = 0; k < n; k++) { const o = BQ[k]; BQ[k] = null; if (hittable(u, o) && !o.def.prop) { const d = hypot(o.x - u.x, o.y - u.y); if (d < bd) { bd = d; best = o; } } }
      if (best && !biteNow(w, u, best)) u.b.next3 = w.time + 0.3;
      if (!best) { u.attack = 1; u.b.next3 = w.time + T.biteEvery; w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id }); }
    }
  },
  brain,
});

export default D;
export { T };
