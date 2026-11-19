// Unit maker: A-MOVE ground movers (OURS, Part 2 step 8, STEP8.md). Owner: A-MOVE. Imported by move.js.
// swim (crab), burrow (giant worm), ghost (ghost), lowgrav (astronaut): each one replaces how the unit gets about; its
// weapon fights as usual whenever the unit is in the open.
//
// Bag fields the art reads (u.b.ab[slot]):
//  swim:    swim (1 = in deep water this tick: swimming pose), wet (1 = in any water).
//  burrow:  ph (1 under, 2 rumble, 3 burst, 4 up, 5 dive), under (1 = underground: hidden, ×0 damage, shots pass;
//           the body art draws NO body while b.act = ACT.UNDER, OVER.burrow draws the dirt mound / cracks), t0 (s, the
//           phase start: rumble shake).
//  ghost:   none (the body art draws the ghost look for any recipe with 'ghost'; u.z = the float height).
//  lowgrav: hop (1 = mid-hop; u.z on the arc).
// Pose codes (lib.js ACT): UNDER (burrow under / rumbling), LEAP (burrow bursting up, 0.5 s), DOWN (burrow digging back
// in, 0.5 s), HOP (lowgrav mid-hop).
import { registerAbility } from '../registry.js';
import {
  ACT, act, used, power, LEAP, STATE, DT, GRAVITY, WET, DEEP, ENEMY, hypot, depthAt, deepAt, unitOf, setState, idle,
  damage, splatNoise, attackHeld,
} from '../lib.js';
import { hooks } from '../../combat/index.js';
import { thickestCrowd, tossFrom, hittable as canHitUnit, grounded as onGround } from '../../units/bosses/_lib.js';
import { onWorldClear } from '../../world.js';
import { bagOf, meleeW, goAt, endAct } from './move-lib.js';

// ---------------------------------------------------------------- swim (crab: copied from units/ocean/crab.js + _lib sea())
const T_SWIM = {
  pace: 1.5,        // x speed in any water (STEP8; steering's waterPace, the crab's own rule for its water speed)
  moving: 10,       // px/s: entering the water at least this fast counts as a swim (used)
};
registerAbility({
  id: 'swim',
  def: { swims: true, waterPace: T_SWIM.pace },   // never drowns (nobody does), crosses deep water at x1.5
  init(w, u, bag) { bag.swim = 0; bag.wet = 0; },
  tick(w, u, bag) {
    if (w.waterCells === 0 || u.z > 0) { bag.swim = 0; bag.wet = 0; return; }
    const d = depthAt(w, u.x, u.y);
    bag.swim = d >= DEEP ? 1 : 0;
    if (d < WET) { bag.wet = 0; return; }
    if (bag.wet === 0 && u.vx * u.vx + u.vy * u.vy > T_SWIM.moving * T_SWIM.moving) {   // in it, swimming
      bag.wet = 1;
      used(w, u, 'swim');
      w.emit('splash', { x: u.x, y: u.y, v: 0.6, type: u.type, as: 'crab' });
    }
  },
  test: { setup(g, w, u) { u.x = u.px = u.homeX = 510; u.y = u.py = u.homeY = 600; } },   // starts in the kitchen-sink pond
});

// ---------------------------------------------------------------- burrow (giant worm: copied from units/bosses/worm.js)
const T_BUR = {
  under: 120,       // px/s tunnelling (the worm's; its own run speed if faster)
  scan: 900,        // px: looks this far for crowds
  crowdEvery: 1,    // s between crowd re-picks while tunnelling
  arrive: 12,       // px from its burst point: close enough
  rumble: 0.6,      // s of rumble (cracks) before it bursts
  burstR: 40,       // px (x power): the burst hits everyone within this (+ half their radius) (STEP8: r 40 x power)
  burstDmg: 60,     // burst damage (x power, like a body weapon) ...
  burstOut: 90,     // ... tossed out this fast (x power) ...
  burstUp: 460,     // ... and this high (x power, px/s up)
  burstPose: 0.5,   // s of the burst pose
  upTime: 6,        // s it fights on the surface from the burst (STEP8 ~6 s; the worm stays up 4)
  dive: 0.5,        // s digging back in
  downTime: 3,      // s under after a dive before it may burst again
  first: 1.5,       // s under after the battle starts before its first burst
  share: 1,         // s: a crowd picked by a burrower of the same side this recently ...
  shareR: 300,      // ... within this many px is used again (a hundred burrowers don't each scan 900 px every second)
};
const UNDER = 1, RUMBLE = 2, BURST = 3, UP = 4, DIVE = 5;   // bag.ph
const BPT = new Float64Array(3), BQ = new Array(96);
// Per-world crowd picks to share (ring of 8): faction, where it was picked from, when, the burst point.
const PICKS = new WeakMap();
onWorldClear((w) => { const P = PICKS.get(w); if (P) P.n = 0; });
function pickCrowd(w, u, bag) {
  let P = PICKS.get(w);
  if (!P) { P = { n: 0, k: 0, f: new Float64Array(8), x: new Float64Array(8), y: new Float64Array(8), t: new Float64Array(8), px: new Float64Array(8), py: new Float64Array(8) }; PICKS.set(w, P); }
  const now = w.time;
  for (let i = 0; i < P.n; i++) {
    if (P.f[i] !== u.faction || now - P.t[i] > T_BUR.share || hypot(P.x[i] - u.x, P.y[i] - u.y) > T_BUR.shareR) continue;
    bag.x0 = P.px[i]; bag.y0 = P.py[i]; return true;
  }
  if (!thickestCrowd(w, u, u.x, u.y, T_BUR.scan, Math.max(50, T_BUR.burstR * power(u)), canSurface, BPT)) return false;
  const i = P.k; P.k = (P.k + 1) % 8; if (P.n < 8) P.n++;
  P.f[i] = u.faction; P.x[i] = u.x; P.y[i] = u.y; P.t[i] = now; P.px[i] = BPT[0]; P.py[i] = BPT[1];
  bag.x0 = BPT[0]; bag.y0 = BPT[1];
  return true;
}
function canSurface(w, x, y) {
  if (x < 20 || y < 20 || x > w.W - 20 || y > w.H - 20) return false;
  if (w.walls.count > 0 && w.walls.isSolidAt(x, y)) return false;
  return !(w.waterCells > 0 && depthAt(w, x, y) >= WET);
}
function phase(w, u, bag, s, code) { bag.ph = s; bag.t0 = w.time; act(w, u, code); }
function goUnder(w, u, bag) {
  phase(w, u, bag, UNDER, ACT.UNDER);
  bag.under = 1; u.hidden = 0.001; u.leaping = LEAP.FLY; u.z = 0; u.vz = 0; u.burning = 0; u.target = -1;   // the dirt puts a fire out
  bag.next = w.time + T_BUR.downTime; bag.next2 = w.time;
}
function burst(w, u, bag) {
  phase(w, u, bag, BURST, ACT.LEAP);
  bag.under = 0; bag.t1 = w.time; u.hidden = 0; u.leaping = 0; u.z = 0; u.vx = 0; u.vy = 0;
  const pw = power(u), R = T_BUR.burstR * pw;
  const n = w.queryMask(u.x, u.y, R + 46, ENEMY[u.faction], BQ, BQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = BQ[k]; BQ[k] = null;
    if (!canHitUnit(u, o) || !onGround(o) || o.def.prop) continue;
    if (hypot(o.x - u.x, o.y - u.y) <= R + o.radius * 0.5) BQ[m++] = o;   // compact first: damage may kill / move
  }
  for (let k = 0; k < m; k++) {
    const o = BQ[k]; BQ[k] = null;
    damage(w, o, T_BUR.burstDmg * pw, u, undefined, o.x, o.y);   // from below: shields don't help
    if (o.hp > 0) tossFrom(w, o, u.x, u.y, T_BUR.burstOut * pw, T_BUR.burstUp * pw);
  }
  splatNoise(w, u.x, u.y, 1.2, 400);
  if (hooks.iceHarm) hooks.iceHarm(w, u.x, u.y, R, 2, 0.5);
  used(w, u, 'burrow');
  w.emit('blast', { x: u.x, y: u.y, r: R, kind: 3 });
  w.emit('burst', { x: u.x, y: u.y, v: 2 * pw, type: u.type, as: 'worm' });
  w.emit('trample', { x: u.x, y: u.y, v: 2 * pw, type: u.type, as: 'worm' });
}
function rumble(w, u, bag) {
  phase(w, u, bag, RUMBLE, ACT.UNDER); u.vx = 0; u.vy = 0;
  w.emit('rumble', { x: u.x, y: u.y, v: 1.5, type: u.type, as: 'worm' });
}
registerAbility({
  id: 'burrow',
  // under the ground nothing hurts it and shots pass (combat/env.js submerged asks def.underground, as for the worm)
  def: { underground(u) { const b = bagOf(u, 'burrow'); return b !== null && b.under === 1; } },
  init(w, u, bag) {
    bag.ph = UNDER; bag.under = 1; bag.t0 = 0; bag.t1 = 0; bag.next = -1; bag.next2 = -1; bag.k = 0; bag.x0 = u.x; bag.y0 = u.y;
    u.hidden = 0.001; u.leaping = LEAP.FLY; act(w, u, ACT.UNDER);   // starts under, like the worm
  },
  tick(w, u, bag) {
    if (!(u.hp > 0)) return;
    const now = w.time, s = bag.ph;
    if (bag.next < 0) { bag.next = now + T_BUR.first; bag.next2 = now + T_BUR.crowdEvery * ((u.index * 0.618) % 1); }   // the first tick after START: first scans spread
    if (s === UNDER || s === RUMBLE) {
      if (u.inside >= 0 || u.hurled === 1) return;
      u.hidden = 0.001; u.burning = 0; u.leaping = LEAP.FLY; u.z = 0; u.vz = 0;
      if (s === RUMBLE) {
        u.vx *= 0.8; u.vy *= 0.8;
        if (now - bag.t0 >= T_BUR.rumble) { if (canSurface(w, u.x, u.y)) burst(w, u, bag); else phase(w, u, bag, UNDER, ACT.UNDER); }
      }
      return;
    }
    if (s === BURST) { if (now - bag.t0 >= T_BUR.burstPose) { bag.ph = UP; endAct(w, u, ACT.LEAP); } return; }
    if (s === UP) {
      if (now - bag.t1 >= T_BUR.upTime && u.inside < 0 && u.hurled !== 1 && !(u.z > 0)) { phase(w, u, bag, DIVE, ACT.DOWN); w.emit('dive', { x: u.x, y: u.y, v: 1.5, type: u.type, as: 'worm' }); }
      return;
    }
    if (s === DIVE) { u.vx = 0; u.vy = 0; if (now - bag.t0 >= T_BUR.dive) goUnder(w, u, bag); }
  },
  busy(w, u, bag) {
    const s = bag.ph, now = w.time;
    if (s === UP) return false;   // in the open: its weapon fights
    if (s !== UNDER) { u.goalX = 0; u.goalY = 0; setState(u, STATE.ENGAGE); return true; }
    if (u.possessed === 1) {   // the stick drives the mound; attack held = rumble and burst right here (when it may)
      if (attackHeld(w) && now >= bag.next && canSurface(w, u.x, u.y)) rumble(w, u, bag);
      return true;
    }
    if (now >= bag.next2) {
      bag.next2 = now + T_BUR.crowdEvery * (0.8 + 0.4 * ((u.index * 0.618) % 1));   // spread over the second, by unit
      bag.k = pickCrowd(w, u, bag) ? 1 : 0;
    }
    if (bag.k !== 1) {
      // ATTACK3 L4 (OURS): no crowd to go for (the enemies left are all under the ground too, or out of reach): come up
      // where it is once it may, and fight on the surface. Two burrowers never found each other (a burrowed unit is no
      // crowd: thickestCrowd skips hidden units) and stayed under for good, 0 damage in 90 s with the march on.
      if (now >= bag.next && canSurface(w, u.x, u.y)) { rumble(w, u, bag); return true; }
      idle(w, u); return true;
    }
    const dx = bag.x0 - u.x, dy = bag.y0 - u.y, d = hypot(dx, dy);
    setState(u, STATE.ADVANCE);
    if (d > T_BUR.arrive) { goAt(u, dx, dy, d, Math.max(T_BUR.under, u.def.runSpeed)); return true; }
    if (now >= bag.next && canSurface(w, u.x, u.y)) rumble(w, u, bag);
    return true;
  },
  damageMul(w, u, amount, att, kind, bag) { return bag.under === 1 ? 0 : 1; },
  holdsNerve(w, u, bag) { return bag.under === 1; },
  onDeath(w, u, cause, killer, bag) { if (bag.under === 1) { bag.under = 0; u.hidden = 0; u.leaping = 0; } },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== UNDER && bag.ph !== UP) { u.goalX = 0; u.goalY = 0; } },
});

// ---------------------------------------------------------------- ghost (copied from units/secret/ghost.js)
const T_GHOST = {
  z: 12,            // px: floats this high (low flyer: melee still reaches it)
  bob: 2,           // px: up / down bob ...
  bobRate: 3,       // ... at this many rad/s
  zEase: 6,         // 1/s: how fast it eases to its height
  hardMul: 0.15,    // plain shots + blows do this much (the ghost's damageMul)
};
// Shot kinds that count as "plain" (x0.15); fire, blasts, shocks, gas and magic (mage bolts, rays, lasers) x1 (ghost.js).
const PLAIN = new Set(['bullet', 'arrow', 'shuriken', 'bolt', 'bigbolt', 'pellet', 'cannonball', 'baseball', 'puck', 'bowlball',
  'boulder', 'spit', 'web', 'snowball', 'blow', 'thrown', 'spike', 'poison', 'eaten']);
const MAGIC_TYPES = new Set(['mage', 'risen_mage', 'laserbot', 'gmech', 'eel']);
function hardMul(att, kind) {
  if (kind === 'blast' || kind === 'fire' || kind === 'shock' || kind === 'gas') return 1;
  if (kind === undefined) return att && MAGIC_TYPES.has(att.type) ? 1 : T_GHOST.hardMul;   // a blow (melee), or a spell / beam
  return PLAIN.has(kind) ? (att && MAGIC_TYPES.has(att.type) ? 1 : T_GHOST.hardMul) : 1;
}
registerAbility({
  id: 'ghost',
  def: { ghost: true },   // STEP7: walls never block it (LEAP.FLY: steering skips its wall collision, bodies don't push it)
  init(w, u, bag) { bag.wall = 0; u.leaping = LEAP.FLY; u.z = u.pz = T_GHOST.z; },
  tick(w, u, bag) {
    if (!(u.hp > 0) || u.inside >= 0 || u.hurled === 1) return;
    u.leaping = LEAP.FLY; u.webbed = -1; u.floating = -1;   // no web holds a ghost, no bubble floats it
    u.z += (T_GHOST.z + T_GHOST.bob * Math.sin(w.time * T_GHOST.bobRate + u.id) - u.z) * Math.min(1, T_GHOST.zEase * DT); u.vz = 0;
    if (w.walls.count > 0) {   // floating through a wall
      const inWall = w.walls.isSolidAt(u.x, u.y) ? 1 : 0;
      if (inWall === 1 && bag.wall === 0) used(w, u, 'ghost');
      bag.wall = inWall;
    }
  },
  // walls don't stop it: with a wall between it and its target, a weapon path that goes round the wall goes straight
  // through instead (at the pace the weapon asked for; the ghost flies straight at what it hunts)
  after(w, u, bag) {
    if (w.walls.count === 0 || u.los === 1) return;
    const t = unitOf(w, u.target), g = hypot(u.goalX, u.goalY);
    if (!t || g < 1) return;
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    u.goalX = dx / d * g; u.goalY = dy / d * g; u.face = Math.atan2(dy, dx);
  },
  damageMul(w, u, amount, att, kind) {
    const m = hardMul(att, kind);
    if (m < 1 && amount > 0) used(w, u, 'ghost');   // a hit it shrugged off
    return m;
  },
});

// ---------------------------------------------------------------- lowgrav (astronaut: copied from units/space/astronaut.js)
const T_LOW = {
  hopTime: 0.6,     // s per hop
  hopH: 18,         // px: top of the hop arc
  hopMin: 40,       // px/s: a goal this fast or faster starts a hop (slower = steps on the ground)
  hopShort: 10,     // px: a hop shorter than this isn't worth it (it steps instead)
  landIn: 4,        // px inside melee reach: where a hop at its target comes down
  reach: 6,         // px past both bodies (x power): melee reach a hop aims at
  near: 45,         // px past melee reach: this close to its target a melee unit steps instead of hopping (a hop is
                    // committed for 0.6 s: a side-stepping gunman would make it land short every time)
};
// Every tick (also airborne: the brain is skipped while it hops). A grounded unit whose last goal (its brain's or the
// stick's) asks for walking speed takes off along it; while up, z stays on the arc and it lands softly (no landing bump).
// Walls still stop it (never a flyer); no hops in deep water; a web holds it down; a float, a blast or a grab takes over.
function hopTick(w, u, bag) {
  const now = w.time;
  if (bag.hop === 1) {
    if (!(u.hp > 0) || u.floating > now || u.inside >= 0 || u.hurled === 1 || u.thrownAt > bag.hopT || u.climb > 0 || u.leaping !== 0) {
      bag.hop = 0; endAct(w, u, ACT.HOP); return;
    }
    const f = (now - bag.hopT + DT) / T_LOW.hopTime;   // where it will be after this tick's physics
    if (f >= 1) { u.z = 0; u.vz = 0; bag.hop = 0; endAct(w, u, ACT.HOP); return; }   // soft landing: no bump
    u.z = 4 * T_LOW.hopH * f * (1 - f); u.vz = GRAVITY * DT;   // steering's gravity takes vz back to 0: z stays on the arc
    return;
  }
  if (u.z > 0 || u.vz > 0 || u.stun > 0 || u.webbed > now || u.floating > now || u.leaping !== 0 || u.climb > 0 || u.inside >= 0 || u.hurled === 1 || !(u.hp > 0)) return;
  const gx = u.goalX, gy = u.goalY, g = hypot(gx, gy);
  if (g < T_LOW.hopMin || deepAt(w, u.x, u.y)) return;
  // a melee hop never sails over its target: it comes down within reach (too short a hop = it steps the rest)
  let dist = Math.min(g * u.speedMul, u.def.maxSpeed) * T_LOW.hopTime;
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0 && meleeW(u)) {
    const reach = u.radius + t.radius + T_LOW.reach * power(u);
    // in the fight (in reach): it steps (circling, backing off after a blow); the astronaut's punch goals are slow there,
    // any made weapon's may not be, and a hop would carry it out of the fight
    if (hypot(t.x - u.x, t.y - u.y) < reach + T_LOW.near) return;
    // where the target will be when it comes down (a gunman backing off: the hop must not land short every time)
    const ex = t.x + t.vx * T_LOW.hopTime - u.x, ey = t.y + t.vy * T_LOW.hopTime - u.y;
    const along = (ex * gx + ey * gy) / g, side = Math.abs(ex * gy - ey * gx) / g;
    if (along > 0 && side < reach + 4) dist = Math.min(dist, Math.max(0, along - reach + T_LOW.landIn));
  }
  if (dist < T_LOW.hopShort) return;
  const sp = dist / T_LOW.hopTime;
  bag.hop = 1; bag.hopT = now;
  u.vx = gx / g * sp; u.vy = gy / g * sp; u.heading = Math.atan2(gy, gx);
  const f = DT / T_LOW.hopTime;
  u.z = 4 * T_LOW.hopH * f * (1 - f); u.vz = GRAVITY * DT;
  act(w, u, ACT.HOP);
  used(w, u, 'lowgrav');
  w.emit('lowhop', { x: u.x, y: u.y, type: u.type, as: 'astronaut' });
}
registerAbility({
  id: 'lowgrav',
  init(w, u, bag) { bag.hop = 0; bag.hopT = -1; },
  tick: hopTick,
});

export { T_SWIM, T_BUR, T_GHOST, T_LOW };
