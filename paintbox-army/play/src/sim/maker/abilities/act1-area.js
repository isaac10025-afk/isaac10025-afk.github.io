// Unit maker: A-ACT1 area tricks + blink (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT1.
// roar (T-Rex), stomp (long-neck), sit (baby), blink (teleporter): the source unit's trick on any body and any weapon.
// Areas (roar circle, stomp ring, sit) × power(u); damage as the source; pushes × power. State in the ability's own bag.
// Fields the art may read:
//   roar   bag.ph 1 roaring (ACT.ROAR, 1.2 s from u.b.actT), bag.r = how far it reaches (px): OVER.roar draws the rings
//   stomp  bag.ph 1 rearing up (1 s), 2 the stomp (0.3 s): ACT.STOMP both, u.b.actT reset when the foot comes down
//          (bag.ph tells them apart); bag.r = the ring's reach (px). The ring itself = the 'blast' event (fx ring).
//   sit    bag.ph 1 sitting (ACT.SIT, 0.8 s)
//   blink  bag.ph 1 gone (ACT.BLINK, u.hidden > 0: fade out over 0.25 s from u.b.actT, then draw nothing), 2 appearing
//          (ACT.BLINK again, u.b.actT reset, u.hidden 0: fade in over 0.25 s); bag.x0 / bag.y0 = where it will appear
import { registerAbility } from '../registry.js';
import { ACT, act, power, used, STATE, INT, hypot, ENEMY, push, stun, splatNoise, setState, grounded, high, fleeFor, standable, targetOf, canAuto } from '../lib.js';
import { hooks } from '../../combat/index.js';
import { countFoes, eachFoe } from '../../units/secret/_lib.js';
import { A1, FIRST, steady, stunned, stand, initDrive, bodyHit, say, foeOf } from './act1-lib.js';

const RQ = new Array(96).fill(null), HIT = new Array(96).fill(null);

// ================================================================ roar (T-Rex: units/dinos/trex.js roar())
const RO = {
  every: 12,        // s between roars in a fight (and the first time it sees enemies)
  time: 1.2,        // s standing roaring
  R: 220,           // px: enemies within (× power) lose ...
  morale: 0.35,     // ... 0.35 × (1 − d/R) morale
  fleeR: 120,       // px (× power): Animal-level enemies this close ...
  flee: 2,          // ... run for 2 s
  noise: 400,       // px: noise splat radius (× power)
};
function roar(w, u, bag) {
  const p = power(u), R = RO.R * p, FR = RO.fleeR * p;
  bag.ph = 1; bag.t0 = w.time; bag.next = w.time + RO.every; bag.seen = 1; bag.r = R;
  act(w, u, ACT.ROAR); setState(u, STATE.ALERT);
  splatNoise(w, u.x, u.y, 1, RO.noise * p);
  const n = w.queryMask(u.x, u.y, R, ENEMY[u.faction], RQ, RQ.length);
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (!foeOf(u, o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d > R) continue;
    o.morale = Math.max(0, o.morale - RO.morale * (1 - d / R));
    if (d <= FR && o.def.intelligence === INT.Animal) fleeFor(w, o, RO.flee, u.x, u.y);
  }
  used(w, u, 'roar');
  say(w, 'roar', u, u.x, u.y, 3 * Math.min(1.5, p), 'trex');
}
registerAbility({
  id: 'roar',
  init(w, u, bag) { bag.ph = 0; bag.seen = 0; bag.next = 0; bag.t0 = 0; bag.r = 0; initDrive(bag); },
  tick(w, u, bag) { if (bag.ph === 1 && w.time - bag.t0 >= RO.time) { bag.ph = 0; if (u.b.act === ACT.ROAR) act(w, u, 0); } },
  busy(w, u, bag) {
    if (bag.ph === 0) return false;
    const t = targetOf(w, u);
    setState(u, STATE.ALERT);
    return stand(u, bag, t ? Math.atan2(t.y - u.y, t.x - u.x) : NaN);
  },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.ph !== 0 || (bag.seen === 1 && w.time < bag.next) || u.inside >= 0 || u.hurled === 1) return false;
    roar(w, u, bag);   // first sight, then every 12 s
    return stand(u, bag, Math.atan2(dy, dx));
  },
  idle(w, u, bag) { if (u.state === STATE.IDLE) bag.seen = 0; return false; },   // calm again: the next enemy it sees gets a roar
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = 0; u.goalY = 0; } },
  holdsNerve(w, u, bag) { return bag.ph !== 0; },
});

// ================================================================ stomp (long-neck: units/dinos/longneck.js)
const ST = {
  every: 2.5,       // s between stomps
  trigger: 40,      // px past both bodies (× power): an enemy this close starts a stomp
  rear: 1,          // s reared up
  pose: 0.3,        // s: stomp pose
  under: 12,        // px past both bodies (× power): under its feet ...
  underDmg: 120,    // ... crushed for 120
  ring: 90,         // px from its body's edge (× power): the shockwave ring ...
  ringDmg: 25,      // ... 25 at its feet, falling off to 0 at the ring's edge
  knock: 0.6,       // s knocked down (everyone in the ring)
  ringPush: 220,    // push outward (÷ mass, × power), falling off like the damage
  ice: 2,           // ice crack strength
  noise: 300,       // px noise splat
};
function enemyClose(w, u) {
  const R = ST.trigger * power(u);
  const n = w.queryMask(u.x, u.y, u.radius + R + A1.MARGIN, ENEMY[u.faction], RQ, RQ.length);
  let yes = false;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (!yes && foeOf(u, o) && grounded(o) && !high(o) && hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + R) yes = true;
  }
  return yes;
}
function stomp(w, u, bag) {
  const p = power(u), ring = ST.ring * p, R = u.radius + ring, under = ST.under * p;
  const n = w.queryMask(u.x, u.y, R + A1.MARGIN, ENEMY[u.faction], RQ, RQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (!foeOf(u, o) || !grounded(o) || high(o)) continue;
    if (hypot(o.x - u.x, o.y - u.y) <= R + o.radius && m < HIT.length) HIT[m++] = o;
  }
  for (let k = 0; k < m; k++) {   // compact first: damage can kill and change the grid
    const o = HIT[k]; HIT[k] = null;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001, edge = Math.max(0, d - u.radius - o.radius);
    const f = Math.max(0, 1 - edge / ring), crushed = d <= u.radius + o.radius + under;
    bodyHit(w, u, o, crushed ? ST.underDmg : ST.ringDmg * f, o.x, o.y);   // from below: shields don't help
    if (o.hp > 0) push(w, o, dx / d, dy / d, ST.ringPush * p * (0.3 + 0.7 * f), ST.knock);
  }
  splatNoise(w, u.x, u.y, 1, ST.noise * p);
  if (hooks.iceHarm) hooks.iceHarm(w, u.x, u.y, R, ST.ice, 0.5);
  w.emit('blast', { x: u.x, y: u.y, r: R, kind: 3, type: u.type, as: 'longneck' });
  say(w, 'trample', u, u.x, u.y, 3 * Math.min(1.5, p), 'longneck');
}
registerAbility({
  id: 'stomp',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.r = 0; initDrive(bag); },
  tick(w, u, bag) {
    if (bag.ph === 0) return;
    const now = w.time;
    if (bag.ph === 1) {
      if (now - bag.t0 < ST.rear) return;
      if (u.z > A1.GROUNDED || u.hurled === 1 || u.inside >= 0) { bag.ph = 0; act(w, u, 0); return; }   // knocked off its feet mid-rear
      stomp(w, u, bag); bag.ph = 2; bag.t0 = now; act(w, u, 0); act(w, u, ACT.STOMP);
      return;
    }
    if (now - bag.t0 >= ST.pose) { bag.ph = 0; if (u.b.act === ACT.STOMP) act(w, u, 0); }
  },
  // a reflex, like the long-neck's (before targets and fleeing): an enemy close and it is ready = it rears up (looked
  // for every 2nd brain tick)
  busy(w, u, bag) {
    if (bag.ph === 0) {
      if (w.time < bag.next || (w.tick + u.index) % 2 !== 0 || !steady(u) || !canAuto(w, u) || !enemyClose(w, u)) return false;
      bag.ph = 1; bag.t0 = w.time; bag.next = w.time + ST.every; bag.r = u.radius + ST.ring * power(u);
      act(w, u, ACT.STOMP);
      used(w, u, 'stomp');
      say(w, 'rear', u, u.x, u.y, 1, 'longneck');   // the bellow as it rears up
    }
    setState(u, STATE.ENGAGE);
    return stand(u, bag, u.heading);
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = 0; u.goalY = 0; } },
  holdsNerve(w, u, bag) { return bag.ph !== 0; },
});

// ================================================================ sit (baby: units/secret/baby.js sit())
const SI = {
  count: 5,         // enemies within R ...
  R: 60,            // ... px (edge distance from its middle, × power) = it sits on them
  hitR: 45,         // px (edge distance from its middle, × power): the plop hits everyone within ...
  dmg: 120,         // ... for this much ...
  stun: 1,          // ... and stuns them this long
  pose: 0.8,        // s sitting
  every: 3,         // s between sits
};
let _su = null, _sw = null;
function plopOne(o) { bodyHit(_sw, _su, o, SI.dmg, o.x, o.y); if (o.hp > 0) stun(_sw, o, SI.stun); }   // from above: shields don't help
function sit(w, u, bag, p) {
  bag.ph = 1; bag.t0 = w.time; bag.next = w.time + SI.every; act(w, u, ACT.SIT);
  u.vx = 0; u.vy = 0;
  _su = u; _sw = w;
  eachFoe(w, u, u.x, u.y, SI.hitR * p, true, plopOne);
  _su = null; _sw = null;
  used(w, u, 'sit');
  say(w, 'land', u, u.x, u.y, 3, 'baby', 'sit', 1);   // big plop
  say(w, 'trample', u, u.x, u.y, 2.5, 'baby');
}
registerAbility({
  id: 'sit',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; initDrive(bag); },
  tick(w, u, bag) { if (bag.ph === 1 && w.time - bag.t0 >= SI.pose) { bag.ph = 0; if (u.b.act === ACT.SIT) act(w, u, 0); } },
  // a reflex (before targets and fleeing: a cornered unit plops instead of running), scanned every 4th brain tick
  busy(w, u, bag) {
    if (bag.ph === 0) {
      const p = power(u);
      if (w.time < bag.next || (w.tick + u.index) % 4 !== 0 || !steady(u) || !canAuto(w, u) || countFoes(w, u, u.x, u.y, SI.R * p) < SI.count) return false;
      sit(w, u, bag, p);
    }
    u.vx *= 0.5; u.vy *= 0.5;
    return stand(u, bag, u.heading);
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = 0; u.goalY = 0; } },
  holdsNerve(w, u, bag) { return bag.ph !== 0; },
  // the kitchen-sink field never crowds 5 enemies round one unit: put them close
  test: {
    setup(g, w, u, foes) {
      for (let k = 0; k < foes.length; k++) {
        const a = k / foes.length * Math.PI * 2, r = u.radius + foes[k].radius + 2;
        foes[k].x = u.x + Math.cos(a) * r; foes[k].y = u.y + Math.sin(a) * r;
      }
    },
    within: 10,
  },
});

// ================================================================ blink (teleporter: units/space/teleporter.js)
const BL = {
  every: 5,         // s between blinks
  minD: 120,        // px: blinks only at a target at least this far
  out: 0.25,        // s vanished
  appear: 0.25,     // s of the appear pose
  behind: 30,       // px from the target's middle, on its far side (at least both radii + 4)
  homeAt: 0.3,      // hp share: blinks home once below this
  homeEdge: 60,     // px in from its team's edge (Team battle)
};
const SPOT = new Float64Array(2);
// where to appear: `dist` px past (tx, ty) along the line from u, else turned up to ±90° round it
function spotBehind(w, u, tx, ty, dist, out) {
  const a0 = Math.atan2(ty - u.y, tx - u.x);
  for (let k = 0; k < 5; k++) {
    const a = a0 + (k === 0 ? 0 : (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.785);
    const x = tx + Math.cos(a) * dist, y = ty + Math.sin(a) * dist;
    if (standable(w, x, y, u.radius + 2)) { out[0] = x; out[1] = y; return true; }
  }
  return false;
}
function blinkOut(w, u, bag, x, y) {
  bag.ph = 1; bag.t0 = w.time; bag.x0 = x; bag.y0 = y; bag.next = w.time + BL.every;
  if (!(u.hidden > 0)) u.hidden = 0.001;   // untargetable while gone (conceal.js reads it); damageMul 0 = untouchable
  act(w, u, ACT.BLINK);
  used(w, u, 'blink');
  say(w, 'teleport', u, u.x, u.y, 1, 'teleporter', 'out', 1);
}
function blinkIn(w, u, bag) {
  const t = bag.k === 0 ? targetOf(w, u) : null;
  if (t && spotBehind(w, u, t.x, t.y, Math.max(BL.behind, t.radius + u.radius + 4), SPOT)) { bag.x0 = SPOT[0]; bag.y0 = SPOT[1]; }   // follow the target if it moved
  u.x = u.px = bag.x0; u.y = u.py = bag.y0; u.vx = 0; u.vy = 0;
  if (u.hidden === 0.001) u.hidden = 0;
  bag.ph = 2; bag.t0 = w.time;
  if (t) u.face = u.heading = Math.atan2(t.y - u.y, t.x - u.x);
  act(w, u, 0); act(w, u, ACT.BLINK);   // restart the pose: fade in
  say(w, 'teleport', u, u.x, u.y, 1, 'teleporter', 'in', 1);
}
// its own side: its team's edge in Team battle, else back where it was painted
function blinkHome(w, u, bag) {
  let x = u.homeX, y = u.homeY;
  if (u.team === 0) x = BL.homeEdge; else if (u.team === 1) x = w.W - BL.homeEdge;
  if (u.team >= 0) y = u.y;
  if (!standable(w, x, y, u.radius + 2)) { x = u.homeX; y = u.homeY; }
  bag.k = 1; bag.home = 1;
  blinkOut(w, u, bag, x, y);
}
registerAbility({
  id: 'blink',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.x0 = 0; bag.y0 = 0; bag.k = 0; bag.home = 0; initDrive(bag); },
  // blink timing runs every tick (the brain can skip ticks): never gone longer than 0.25 s
  tick(w, u, bag) {
    if (bag.ph === 1) { if (w.time - bag.t0 >= BL.out - 1e-9) blinkIn(w, u, bag); }
    else if (bag.ph === 2 && w.time - bag.t0 >= BL.appear - 1e-9) { bag.ph = 0; if (u.b.act === ACT.BLINK) act(w, u, 0); }
  },
  busy(w, u, bag) {
    if (bag.ph === 1) return stand(u, bag, u.heading);   // gone: the tick brings it back
    // badly hurt: blinks home once (not while driven)
    if (bag.ph === 0 && bag.home === 0 && u.hp < BL.homeAt * u.maxHp && u.hp > 0 && u.possessed !== 1 && !stunned(u) && u.inside < 0 && u.hurled !== 1) {
      blinkHome(w, u, bag); return stand(u, bag, u.heading);
    }
    return false;
  },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.ph !== 0 || w.time < bag.next || d < BL.minD || u.inside >= 0 || u.hurled === 1 || stunned(u)) return false;
    if (!spotBehind(w, u, t.x, t.y, Math.max(BL.behind, t.radius + u.radius + 4), SPOT)) return false;
    bag.k = 0; setState(u, STATE.CHARGE);
    blinkOut(w, u, bag, SPOT[0], SPOT[1]);
    return stand(u, bag, Math.atan2(dy, dx));
  },
  damageMul(w, u, amount, att, kind, bag) { return bag.ph === 1 ? 0 : 1; },   // gone: nothing touches it
  onDeath(w, u, cause, killer, bag) { if (bag.ph === 1 && u.hidden === 0.001) u.hidden = 0; bag.ph = 0; },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph === 1) { u.goalX = 0; u.goalY = 0; } },
});

export { RO, ST, SI, BL };
