// Kraken (OURS, Bosses tab, Part 2 step 6): a giant octopus that lives in deep water (painted only on deep water, its
// body never leaves it). 8 arms, each on its own clock, reach up to 160 px past its body, over land too: an arm slams
// (40 in r 20, knocked down) or grabs a unit of mass <= 6, drags it into the water and holds it under (15 every 0.5 s
// until it drowns or the arm takes 150 damage: attackers close to a holding arm's tip are hacking at that arm). Drops
// below 50 % hp: an ink cloud r 120 for 5 s (units inside are blinded). Owner: BOSSES-SIM.
// Pose (STEP6.md): b.act 1 ink -> `ink`; head -> `head0`/`head1` (art). Arms: b.ax[i], b.ay[i] tip (world px),
// b.as[i] 0 idle sway, 1 reach, 2 slam, 3 hold, 4 pull back; b.av[i] held unit id or -1 (i 0..7, typed arrays).
// Systems: 'bosses-kraken-water' (after steering) keeps its middle on deep water; 'bosses-kraken-ink' (after
// perception) blinds units in its ink when the Ocean tab's `ink` projectile isn't there to do it.
import { spawnProjectile, PROJ_STEP } from '../../combat/projectiles.js';
import { shoreAt } from '../../terrain/water.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { blindFor } from '../dinos/_lib.js';
import {
  boss, initBag, targetOf, setState, act, canAuto, shrug, hittable, grabbable, high, hold, release, releaseAll, isCaptive,
  damage, push, depthAt, splatNoise, hooks, hypot, angleDiff, STATE, ENEMY, WET, TAU, BOSS,
} from './_lib.js';

const T = {
  radius: 30, hp: 6000, mass: 60,   // STEP6 size
  walk: 30, run: 50,                // px/s, water only
  arms: 8,                          // arms, each on its own clock
  reach: 160,                       // px past its body edge an arm tip reaches (over land too)
  rest: 1.3,                        // x radius: idle tips rest this far from its middle
  sway: 7,                          // px: idle sway
  reachTime: 0.45,                  // s an arm takes to reach a target (faster for far ones, at least `tipMin` px/s)
  tipMin: 300,                      // px/s slowest reaching tip
  backSpeed: 320,                   // px/s a tip pulls back
  restMin: 0.5, restMax: 1.5,       // s an arm rests between strikes (random in this range)
  slamDmg: 40,                      // slam: damage ...
  slamR: 20,                        // ... to everyone within 20 px of the tip (+ their radius)
  slamPush: 140,                    // ... pushed off the tip (÷ mass) ...
  slamKnock: 0.5,                   // ... and knocked down 0.5 s
  slamPose: 0.25,                   // s the arm stays slammed down
  grabMass: 6,                      // units this light or lighter can be grabbed ...
  grabChance: 0.6,                  // ... and an arm reaching one grabs it this often (else it slams)
  pullSpeed: 90,                    // px/s an arm drags its victim to the water
  holdIn: 14,                       // px past its body edge: where a victim is held under
  drownDmg: 15,                     // held under: damage ...
  drownEvery: 0.5,                  // ... every 0.5 s (until dead or the arm is hit for `armHurt`)
  armHurt: 150,                     // damage on a holding arm that makes it let go
  armHitR: 90,                      // px: an attacker this close to a holding arm's tip is hitting that arm
  armZ: 34,                         // px: arms reach units up to this high (low flyers yes, the dragon up high no)
  inkAt: 0.5,                       // hp share: dropping below it spills the ink (once)
  inkR: 120,                        // px ink cloud radius ...
  inkTime: 5,                       // ... lasting 5 s
  inkPose: 0.8,                     // s of the `ink` pose
  inkBlind: 0.5,                    // s blind per check for a unit in the ink (checked every 0.25 s)
  approach: 0.7,                    // x reach: it swims until its target is this deep inside the arms' reach
  keepShore: 5,                     // 8 px tiles from the shore its middle stays (its whole body stays in the water)
  placeShore: 5,                    // tiles from the shore where it can be painted (deep water, room for its body)
  feel: 14,                         // px past its radius: looks ahead for the shore
};
const IDLE = 0, REACH = 1, SLAM = 2, HOLD = 3, BACK = 4;   // b.as codes (STEP6.md)
const AQ = new Array(96), SQ = new Array(48);

function initArms(w, u) {
  const b = u.b, n = T.arms;
  b.ax = new Float32Array(n); b.ay = new Float32Array(n); b.as = new Uint8Array(n); b.av = new Int32Array(n).fill(-1);
  b.tg = new Int32Array(n).fill(-1);        // unit an arm is reaching for (-1: a point, b.px / b.py)
  b.px = new Float32Array(n); b.py = new Float32Array(n);
  b.at = new Float64Array(n);               // world.time the arm's state started
  b.cd = new Float64Array(n);               // world.time the arm may strike again
  b.sp = new Float32Array(n);               // px/s this reach
  b.hurt = new Float32Array(n);             // damage taken by a holding arm
  b.hx = new Float32Array(n); b.hy = new Float32Array(n);   // hold point, from its middle
  b.dn = new Float64Array(n);               // next drown tick
  b.inked = 0;
  for (let i = 0; i < n; i++) {
    const a = base(i);
    b.ax[i] = u.x + Math.cos(a) * u.radius * T.rest; b.ay[i] = u.y + Math.sin(a) * u.radius * T.rest;
    b.cd[i] = w.time + 0.3 + T.restMax * w.rng();
  }
}
function base(i) { return (i + 0.5) * TAU / T.arms; }
function setArm(w, b, i, s) { b.as[i] = s; b.at[i] = w.time; }
function reachOf(u) { return u.radius + T.reach * u.shrink; }
// Move tip i toward (x, y) at up to `sp` px/s; true when there.
function tipTo(b, i, x, y, sp) {
  const dx = x - b.ax[i], dy = y - b.ay[i], d = hypot(dx, dy), s = sp / 60;
  if (d <= s) { b.ax[i] = x; b.ay[i] = y; return true; }
  b.ax[i] += dx / d * s; b.ay[i] += dy / d * s; return false;
}
function claimed(b, id) { for (let i = 0; i < T.arms; i++) if (b.tg[i] === id || b.av[i] === id) return true; return false; }
function armTarget(w, u, o) { return hittable(u, o) && !o.def.prop && !high(o) && o.z <= T.armZ && !isCaptive(w, o) && (o.unseen <= 0 || o.unseen >= 1); }

// ---------------------------------------------------------------- arms
function startReach(w, u, i, t, x, y) {
  const b = u.b;
  b.tg[i] = t ? t.id : -1; b.px[i] = x; b.py[i] = y;
  b.sp[i] = Math.max(T.tipMin, hypot(x - b.ax[i], y - b.ay[i]) / T.reachTime);
  setArm(w, b, i, REACH);
}
// Ready arms pick the enemy nearest their own side (claimed ones skipped), or the player's target when possessed.
function pickTargets(w, u) {
  const b = u.b, now = w.time, R = reachOf(u);
  let ready = 0;
  for (let i = 0; i < T.arms; i++) if (b.as[i] === IDLE && now >= b.cd[i]) ready++;
  if (ready === 0 || !canAuto(w, u)) return;
  if (u.possessed === 1) {
    const t = targetOf(w, u);
    if (!t || !armTarget(w, u, t) || hypot(t.x - u.x, t.y - u.y) > R + t.radius) return;
    for (let i = 0; i < T.arms; i++) if (b.as[i] === IDLE && now >= b.cd[i]) { startReach(w, u, i, t, t.x, t.y); break; }
    return;
  }
  const n = w.queryMask(u.x, u.y, R + BOSS.MARGIN, ENEMY[u.faction], AQ, AQ.length);
  for (let i = 0; i < T.arms && ready > 0; i++) {
    if (b.as[i] !== IDLE || now < b.cd[i]) continue;
    const a = base(i);
    let best = null, bs = Infinity;
    for (let k = 0; k < n; k++) {
      const o = AQ[k];
      if (!o || !armTarget(w, u, o) || claimed(b, o.id)) continue;
      const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy);
      if (d > R + o.radius) continue;
      const s = d + 60 * Math.abs(angleDiff(a, Math.atan2(dy, dx)));
      if (s < bs) { bs = s; best = o; }
    }
    if (best) { startReach(w, u, i, best, best.x, best.y); ready--; }
    else b.cd[i] = now + 0.15;   // nothing for this arm: look again soon
  }
  for (let k = 0; k < n; k++) AQ[k] = null;
}
function slam(w, u, i) {
  const b = u.b, x = b.ax[i], y = b.ay[i];
  const n = w.queryMask(x, y, T.slamR + BOSS.MARGIN, ENEMY[u.faction], SQ, SQ.length);
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (!armTarget(w, u, o) || hypot(o.x - x, o.y - y) > T.slamR * u.shrink + o.radius) continue;
    damage(w, o, T.slamDmg, u, undefined, o.x, o.y);   // an arm slamming down from above: shields don't help
    if (o.hp > 0) { const dx = o.x - x, dy = o.y - y, d = hypot(dx, dy) || 0.001; push(w, o, dx / d, dy / d, T.slamPush, T.slamKnock); }
  }
  const wet = depthAt(w, x, y) >= WET;
  w.emit(wet ? 'splash' : 'trample', { x, y, v: 2, type: u.type });
  if (hooks.iceHarm) hooks.iceHarm(w, x, y, T.slamR + 6, 1.2, 0.4);
  splatNoise(w, x, y, 0.6, 200);
  setArm(w, b, i, SLAM);
  u.attack = 1;
}
function grab(w, u, i, t) {
  const b = u.b;
  if (!hold(w, u, t, i)) { slam(w, u, i); return; }
  b.av[i] = t.id; b.tg[i] = -1; b.hurt[i] = 0; b.dn[i] = w.time + T.drownEvery;
  const dx = b.ax[i] - u.x, dy = b.ay[i] - u.y, d = hypot(dx, dy) || 1, r = u.radius + T.holdIn;
  b.hx[i] = dx / d * r; b.hy[i] = dy / d * r;
  setArm(w, b, i, HOLD);
  u.attack = 1;
  w.emit('strike', { x: t.x, y: t.y, v: 1, type: u.type });
}
function letGo(w, u, i, rest) {
  const b = u.b, v = b.av[i] >= 0 ? w.unitById(b.av[i]) : null;
  if (v && isCaptive(w, v)) release(w, v, false);
  b.av[i] = -1; b.tg[i] = -1; b.hurt[i] = 0;
  b.cd[i] = w.time + rest;
  setArm(w, b, i, BACK);
}
function arms(w, u) {
  const b = u.b, now = w.time, R = reachOf(u), wob = u.radius * T.rest;
  if ((w.tick + u.index) % 3 === 0) pickTargets(w, u);
  for (let i = 0; i < T.arms; i++) {
    const s = b.as[i];
    if (s === IDLE || s === BACK) {
      const a = base(i), sw = T.sway * Math.sin(now * 1.7 + i * 1.3);
      const rx = u.x + Math.cos(a) * (wob + sw), ry = u.y + Math.sin(a) * (wob + sw);
      if (tipTo(b, i, rx, ry, s === BACK ? T.backSpeed : 200) && s === BACK) {
        setArm(w, b, i, IDLE);
        if (b.cd[i] < now) b.cd[i] = now + T.restMin + (T.restMax - T.restMin) * w.rng();
      }
    } else if (s === REACH) {
      let t = null;
      if (b.tg[i] >= 0) {
        t = w.unitById(b.tg[i]);
        if (!t || !armTarget(w, u, t) || hypot(t.x - u.x, t.y - u.y) > R + t.radius + 30) { letGo(w, u, i, 0.2); continue; }
        b.px[i] = t.x; b.py[i] = t.y;
      }
      const there = tipTo(b, i, b.px[i], b.py[i], b.sp[i]);
      if (!there && now - b.at[i] < 3 * T.reachTime) continue;
      if (t && grabbable(t, T.grabMass) && w.rng() < T.grabChance) grab(w, u, i, t);
      else { b.tg[i] = -1; slam(w, u, i); }
    } else if (s === SLAM) {
      if (now - b.at[i] >= T.slamPose) { b.cd[i] = now + T.restMin + (T.restMax - T.restMin) * w.rng(); setArm(w, b, i, BACK); }
    } else if (s === HOLD) {
      const v = b.av[i] >= 0 ? w.unitById(b.av[i]) : null;
      if (!v || !(v.hp > 0) || !isCaptive(w, v) || u.hp <= 0) { letGo(w, u, i, T.restMin); continue; }
      const hx = u.x + b.hx[i], hy = u.y + b.hy[i];
      tipTo(b, i, hx, hy, T.pullSpeed);   // drag it in; then hold it under, moving with the body
      if (now >= b.dn[i] - 1e-6) {
        b.dn[i] += T.drownEvery;
        if (depthAt(w, b.ax[i], b.ay[i]) >= WET || hypot(b.ax[i] - hx, b.ay[i] - hy) < 4) {
          damage(w, v, T.drownDmg, u, undefined, v.x, v.y);   // under water: shields don't help
          if (v.hp > 0 && (w.tick & 1) === 0) w.emit('splash', { x: v.x, y: v.y, v: 0.6 });
        }
      }
    }
  }
}

// ---------------------------------------------------------------- body
const FEEL = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3];
function shore(w, x, y) { return w.waterCells > 0 ? shoreAt(w, x, y) : 0; }
function swim(w, u, ang, sp) {
  const r = u.radius + T.feel;
  for (let k = 0; k < FEEL.length; k++) {
    const a = ang + FEEL[k];
    if (shore(w, u.x + Math.cos(a) * r, u.y + Math.sin(a) * r) >= T.keepShore) { u.goalX = Math.cos(a) * sp; u.goalY = Math.sin(a) * sp; return; }
  }
  u.goalX = 0; u.goalY = 0;
}
function brain(w, u) {
  const b = u.b, now = w.time;
  shrug(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 1 && now - b.actT > T.inkPose) act(w, u, 0);
  if (!b.inked && u.hp < T.inkAt * u.maxHp && u.hp > 0) ink(w, u);
  const onWater = shore(w, u.x, u.y) > 0;
  const t = targetOf(w, u);
  if (t) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    u.face = Math.atan2(dy, dx);
    if (d > u.radius + T.approach * T.reach * u.shrink + t.radius) { setState(u, STATE.ADVANCE); if (onWater) swim(w, u, u.face, d > 300 ? T.walk : T.run); }
    else setState(u, STATE.ENGAGE);
  } else setState(u, STATE.IDLE);
  arms(w, u);
}

// ---------------------------------------------------------------- ink
const INK = new WeakMap();   // world -> [{x, y, until, next}]
function clouds(w) { let a = INK.get(w); if (!a) { a = []; INK.set(w, a); } return a; }
onWorldClear((w) => { const a = INK.get(w); if (a) a.length = 0; });
function ink(w, u) {
  const b = u.b;
  b.inked = 1; act(w, u, 1);
  // the Ocean tab's ink cloud (ocean/octopus.js): the same effect projectile `ink` (p.r, p.age, p.life): its step blinds
  // the enemies inside and its art draws it. Without it (Ocean tab not loaded) a cloud of our own does the blinding.
  const p = PROJ_STEP.ink !== undefined ? spawnProjectile(w, 'ink', u.x, u.y, 0, 0, T.inkTime, 0, u.faction, u) : null;
  if (p) { p.r = T.inkR; p.age = 0; }
  else clouds(w).push({ x: u.x, y: u.y, until: w.time + T.inkTime, next: w.time, faction: u.faction });
  w.emit('ink', { x: u.x, y: u.y, r: T.inkR, type: u.type });   // STEP6 AUDIO: a big wet bloop
  w.emit('splash', { x: u.x, y: u.y, v: 3 });
}
const IQ = new Array(128);
function inkSystem(w) {
  const a = INK.get(w); if (!a || a.length === 0) return;
  for (let k = a.length - 1; k >= 0; k--) {
    const c = a[k];
    if (w.time >= c.until) { a[k] = a[a.length - 1]; a.pop(); continue; }
    if (w.time < c.next) continue;
    c.next = w.time + 0.25;
    const n = w.queryMask(c.x, c.y, T.inkR, ENEMY[c.faction], IQ, IQ.length);
    for (let j = 0; j < n; j++) { const o = IQ[j]; IQ[j] = null; if (o.hp > 0 && !o.def.prop && o.inside < 0 && !high(o)) blindFor(w, o, T.inkBlind); }
  }
}
registerSystem('bosses-kraken-ink', inkSystem, 'perception');

// ---------------------------------------------------------------- def
const D = boss({
  type: 'kraken', og: 'Kraken (ours)',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 30,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 70, accel: 120, decel: 160, turnRate: 1.5,
  aquatic: true, swims: true, waterPace: 1,   // lives in deep water: steering keeps it wet (OG piranha rule)
  flammability: 0.3, density: 6,
  weapon: { range: T.radius * 1.1 + T.reach },   // possess: aim reach
  placeOk(w, x, y) { return shore(w, x, y) >= T.placeShore; },
  init(w, u) { initBag(u); initArms(w, u); },
  onHit(w, u, dealt, att) {
    if (!att || !(dealt > 0)) return;
    const b = u.b; let best = -1, bd = T.armHitR;
    for (let i = 0; i < T.arms; i++) {
      if (b.as[i] !== HOLD) continue;
      const d = hypot(att.x - b.ax[i], att.y - b.ay[i]);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    b.hurt[best] += dealt;
    if (b.hurt[best] >= T.armHurt) { letGo(w, u, best, T.restMax); w.emit('splash', { x: b.ax[best], y: b.ay[best], v: 1.5 }); }
  },
  onDeath(w, u) { releaseAll(w, u, false); for (let i = 0; i < T.arms; i++) { u.b.av[i] = -1; u.b.as[i] = IDLE; } },
  // possessed, attack held at nobody: the free arm nearest the aim slams the aim point (kept inside its reach)
  possessFire(w, u, aim, ax, ay) {
    const b = u.b, now = w.time;
    let best = -1, bd = Infinity;
    for (let i = 0; i < T.arms; i++) {
      if (b.as[i] !== IDLE || now < b.cd[i]) continue;
      const d = Math.abs(angleDiff(base(i), aim));
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.min(1, reachOf(u) / d);
    dx *= k; dy *= k;
    startReach(w, u, best, null, u.x + dx, u.y + dy);
  },
  brain,
});

// After steering: its middle stays on water at least `keepShore` tiles from the shore (or only moves deeper).
function okAt(w, x, y, s0) { const s = shore(w, x, y); return s >= T.keepShore || s > s0; }
function keepWet(w) {
  if (w.waterCells === 0) return;
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.def !== D || u.dead) continue;
    const s0 = shore(w, u.px, u.py);
    if (s0 === 0 || okAt(w, u.x, u.y, s0)) continue;
    if (okAt(w, u.x, u.py, s0)) { u.y = u.py; u.vy = 0; }
    else if (okAt(w, u.px, u.y, s0)) { u.x = u.px; u.vx = 0; }
    else { u.x = u.px; u.y = u.py; u.vx = 0; u.vy = 0; }
  }
}
registerSystem('bosses-kraken-water', keepWet, 'steering');

export default D;
export { T };
