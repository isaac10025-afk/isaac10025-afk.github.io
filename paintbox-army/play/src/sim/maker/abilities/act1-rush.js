// Unit maker: A-ACT1 rush tricks (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT1.
// pounce (raptor), charge (trike), tackle (tackler), slide (walrus): the source unit's trick on any body and any weapon.
// Body-contact numbers scale with power(u) (the size step) like the body weapons: ranges, reach, damage and pushes ×
// power, mass limits (pin, gore, tackle) × power². The weapon fights the rest of the time.
// Each ability keeps its state in its own bag (u.b.ab[slot]); bag.ph = phase (0 = nothing going on). The mid-move steps
// run in `tick` (every tick, before the brain), `busy` keeps the weapon out meanwhile. Fields the art may read:
//   pounce  bag.ph 1 leap (u.z arc, ACT.LEAP), 2 pin / 3 cling (ACT.PIN, u.b.victim = the pinned unit; the unit sits on /
//           hangs off it: the sim moves it)
//   charge  bag.ph 1 charging (ACT.CHARGE, head down), 2 dazed after a wall / braced shield (ACT.DOWN)
//   tackle  bag.ph 1 sprint (ACT.CHARGE), 2 down with the victim (ACT.DOWN, u.b.victim = who it took down)
//   slide   bag.ph 1 sliding, 2 lying there after (ACT.SLIDE both: on its belly)
import { registerAbility } from '../registry.js';
import {
  ACT, act, power, used, STATE, LEAP, DT, WET, hypot, angleDiff, ENEMY, damage, push, stun, toss, tossTo, braced, grabbable,
  setState, clearLine, high, grounded, targetOf,
} from '../lib.js';
import { hatKnock } from '../../combat/index.js';
import { wadeFactor } from '../../systems/steering.js';
import { A1, FIRST, canHit, free, stunned, drive, keep, initDrive, unitOf, bodyHit, say } from './act1-lib.js';

const RQ = new Array(48).fill(null);

// ================================================================ pounce (raptor: units/dinos/raptor.js)
const PO = {
  min: 60,          // px: pounces at a target this far (centre to centre) ... (× power)
  max: 110,         // ... up to this far (× power)
  leapTime: 0.45,   // s in the air
  leapHeight: 24,   // px at the top of the arc (× power)
  lead: 0.8,        // × the leap time: aims where the target will be
  every: 3,         // s between pounces
  landReach: 10,    // px past both bodies: still lands on it (× power)
  pinMass: 4,       // victims this light or lighter are knocked down and pinned (× power²) ...
  pinTime: 1.4,     // ... for this long (stunned, can't act)
  bite: 14,         // pin / cling bite (× power) ...
  biteEvery: 0.35,  // ... every 0.35 s
  clingTime: 1.5,   // s on a heavier victim's side, then shaken off ...
  shakeOff: 60,     // ... and tossed this far (px)
  shakeUp: 160,     // upward speed of that toss
  letGo: 0.4,       // a hit that stuns it this long knocks it off its victim
  braceStun: 0.5,   // landed on a braced shield: bounces off, stunned
  bracePush: 160,   // ... pushed back this hard
};
const P_LEAP = 1, P_PIN = 2, P_CLING = 3;

// anything on the ground can be pounced on (heavy ones are clung to); not props, held, swallowed or flying units
function pounceable(t) { return !t.def.prop && t.hurled !== 1 && t.leaping === 0 && grounded(t) && !high(t) && t.hp > 0 && t.inside < 0; }
// the nearest enemy u could pounce on standing lo..hi px away in clear sight (null if none)
function inBand(w, u, lo, hi) {
  const n = w.queryMask(u.x, u.y, hi, ENEMY[u.faction], RQ, RQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (o.dead || !pounceable(o) || !canHit(u, o) || (o.unseen > 0 && o.unseen < 1)) continue;
    const dd = hypot(o.x - u.x, o.y - u.y);
    if (dd < lo || dd > hi || dd >= bd) continue;
    if (w.walls.count > 0 && !w.walls.lineOfSight(u.x, u.y, o.x, o.y)) continue;
    bd = dd; best = o;
  }
  return best;
}
// leap: a fixed line to (px, py) minus `short`, z arc (leaping = flight: no gravity, no walls; the brain runs)
function leapTo(w, u, bag, px, py, short, prey) {
  const ex = px - u.x, ey = py - u.y, dd = hypot(ex, ey) || 0.001, f = Math.max(0, dd - short), lt = PO.leapTime;
  bag.ph = P_LEAP; bag.prey = prey; bag.t0 = w.time; bag.x0 = u.x; bag.y0 = u.y;
  bag.dx = ex / dd * f / lt; bag.dy = ey / dd * f / lt; bag.next = w.time + PO.every;
  u.leaping = LEAP.FLY; u.heading = Math.atan2(ey, ex);
  act(w, u, ACT.LEAP); setState(u, STATE.ENGAGE);   // not Charge: OG gunners sidestep a charger, and a leap can't steer
  drive(u, bag, bag.dx, bag.dy, u.heading);
  used(w, u, 'pounce');
  say(w, 'charge', u, u.x, u.y, 1, 'raptor');
}
function pRelease(w, u, bag, v, shaken) {
  const was = bag.ph;
  bag.ph = 0; if (u.leaping === LEAP.FLY) u.leaping = 0;
  if (u.b.victim === bag.vic && bag.vic >= 0) u.b.victim = -1;
  bag.vic = -1;
  if (u.b.act === ACT.PIN || u.b.act === ACT.LEAP) act(w, u, 0);
  if (shaken && v) {   // shaken off: thrown away from the victim
    const dx = u.x - v.x, dy = u.y - v.y, d = hypot(dx, dy) || 0.001;
    tossTo(w, u, dx / d, dy / d, PO.shakeOff, PO.shakeUp);
    say(w, 'throw', u, u.x, u.y, 0.8, 'raptor');
  } else if (!(u.vz > 0) && was !== 0) { u.z = 0; u.vz = 0; }   // steps off; a toss that knocked it loose keeps flying
}
function leapStep(w, u, bag) {
  const now = w.time, f = (now - bag.t0) / PO.leapTime, p = power(u);
  if (u.hurled === 1 || u.inside >= 0) { bag.ph = 0; if (u.leaping === LEAP.FLY) u.leaping = 0; act(w, u, 0); return; }   // grabbed mid-air
  if (f < 1) {
    u.leaping = LEAP.FLY; u.z = 4 * PO.leapHeight * p * f * (1 - f); u.vz = 0;
    u.vx = bag.dx; u.vy = bag.dy; drive(u, bag, bag.dx, bag.dy, Math.atan2(bag.dy, bag.dx));
    return;
  }
  u.z = 0; u.vz = 0; u.leaping = 0; bag.ph = 0;
  let v = unitOf(w, bag.prey); bag.prey = -1;
  if (!v) v = w.findNearest(u.x, u.y, u.radius + A1.MARGIN, ENEMY[u.faction], null, 0);   // a leap at a spot: whoever is there
  const dx = v ? v.x - u.x : 0, dy = v ? v.y - u.y : 0, d = hypot(dx, dy) || 0.001;
  if (!v || !(v.hp > 0) || d > u.radius + v.radius + PO.landReach * p || !pounceable(v) || !canHit(u, v)) {   // missed
    u.vx *= 0.3; u.vy *= 0.3; act(w, u, 0); drive(u, bag, 0, 0, u.heading);
    say(w, 'land', u, u.x, u.y, 0.5, 'raptor');
    return;
  }
  if (braced(v, bag.x0, bag.y0)) {   // a braced shield takes the hit; it bounces off
    damage(w, v, PO.bite * p, u, undefined, bag.x0, bag.y0);
    damage(w, u, v.def.shield.brace * 0.5, v);
    push(w, u, -dx / d, -dy / d, PO.bracePush * p, PO.braceStun); stun(w, u, PO.braceStun);
    act(w, u, 0); drive(u, bag, 0, 0, u.heading);
    say(w, 'block', v, v.x, v.y, 1, 'raptor');
    return;
  }
  bag.vic = v.id; u.b.victim = v.id; bag.t0 = now; bag.t1 = now; act(w, u, ACT.PIN);
  bag.ang = Math.atan2(u.y - v.y, u.x - v.x) - v.heading;   // where on the victim it hangs, in the victim's own frame
  if (grabbable(v, PO.pinMass * p * p) && v.inside < 0) {
    bag.ph = P_PIN;
    v.vx = 0; v.vy = 0; stun(w, v, PO.pinTime);
    say(w, 'trample', u, v.x, v.y, 0.8, 'raptor');
  } else bag.ph = P_CLING;
  u.leaping = LEAP.FLY;   // sits on / hangs off its victim: no shoving, no walls; the tick keeps it there
  setState(u, STATE.ENGAGE);
  holdStep(w, u, bag);
}
// pinned / clinging: ride the victim and bite it every 0.35 s
function holdStep(w, u, bag) {
  const v = unitOf(w, bag.vic), pin = bag.ph === P_PIN, now = w.time, p = power(u);
  if (!v || !(v.hp > 0) || (pin && v.z > 8) || stunned(u, PO.letGo) || u.hp <= 0 || u.hurled === 1 || u.inside >= 0) { pRelease(w, u, bag, v, false); return; }
  if (now - bag.t0 >= (pin ? PO.pinTime : PO.clingTime)) { pRelease(w, u, bag, v, !pin); return; }
  const a = bag.ang + v.heading, c = Math.cos(a), s = Math.sin(a);
  if (pin) {
    v.vx = 0; v.vy = 0; if (v.stun < 0.2) v.stun = 0.2;
    u.x = v.x + c * v.radius * 0.45; u.y = v.y + s * v.radius * 0.45 + 0.5; u.z = v.radius * 0.5;   // + 0.5: drawn over its victim (pinned under it)
  } else {
    const r = v.radius + u.radius * 0.55;
    u.x = v.x + c * r; u.y = v.y + s * r; u.z = Math.max(1, v.z + v.radius * 0.6);
  }
  u.leaping = LEAP.FLY; u.vx = v.vx; u.vy = v.vy; u.vz = 0;
  const f = Math.atan2(v.y - u.y, v.x - u.x); u.heading = f;
  drive(u, bag, v.vx, v.vy, f); setState(u, STATE.ENGAGE);
  if (now >= bag.t1) { bodyHit(w, u, v, PO.bite * p, v.x, v.y); bag.t1 = now + PO.biteEvery; say(w, 'strike', u, v.x, v.y, 1, 'raptor'); }
}
registerAbility({
  id: 'pounce',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.t1 = 0; bag.x0 = 0; bag.y0 = 0; bag.dx = 0; bag.dy = 0; bag.prey = -1; bag.vic = -1; bag.ang = 0; initDrive(bag); },
  tick(w, u, bag) { if (bag.ph === P_LEAP) leapStep(w, u, bag); else if (bag.ph !== 0) holdStep(w, u, bag); },
  busy(w, u, bag) { return bag.ph !== 0 ? keep(u, bag) : false; },
  act(w, u, t, dx, dy, d, bag) {
    const p = power(u);
    if (bag.ph !== 0 || w.time < bag.next || !free(u)) return false;
    let v = d >= PO.min * p && d <= PO.max * p && clearLine(w, u) && pounceable(t) ? t : null;
    if (!v && (w.tick + u.index) % 3 === 0) v = inBand(w, u, PO.min * p, PO.max * p);   // its target is too close / too far: anyone else in the band
    if (!v) return false;
    const lt = PO.leapTime * PO.lead;
    leapTo(w, u, bag, v.x + v.vx * lt, v.y + v.vy * lt, 0.5 * v.radius, v.id);
    return true;
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = bag.gx; u.goalY = bag.gy; } },
  holdsNerve(w, u, bag) { return bag.ph !== 0; },   // no running off mid-pounce or mid-pin
  onDeath(w, u, cause, killer, bag) { if (bag.ph !== 0) pRelease(w, u, bag, unitOf(w, bag.vic), false); },
});

// ================================================================ charge (trike: units/dinos/trike.js)
const CH = {
  mul: 1.4,         // charge speed = 1.4 × the unit's own run speed
  min: 90,          // px: charges at a target this far ... (× power)
  max: 260,         // ... up to this far (× power)
  time: 2.2,        // s: the longest charge
  every: 4,         // s between charges
  lead: 0.4,        // s: aims where the target will be
  gore: 45,         // first enemy hit: damage (× power) ...
  goreOut: 110,     // ... flipped back over the unit at this ground speed ...
  goreUp: 380,      // ... and this upward speed (heavy ones are shoved instead)
  horns: 8,         // px: the first hit reaches this far past its body (× power)
  shove: 180,       // others in the way: pushed aside this hard (× power) ...
  shoveStun: 0.3,   // ... and stunned this long
  stopMass: 8,      // the first enemy hit is this heavy (× power²): the charge stops on it
  wallStun: 1.2,    // s dazed after running into a wall
  braceStun: 0.5,   // s stunned after hitting a braced shield
  stall: 0.3,       // a charge slowed under 30 % of its speed (after 0.4 s) is over
  home: 1.2,        // rad/s: until it hits someone the charge bends this much toward its target
};
const C_RUN = 1, C_DAZED = 2;
function startCharge(w, u, bag, dx, dy) {
  const d = hypot(dx, dy) || 0.001;
  bag.dx = dx / d; bag.dy = dy / d; bag.t0 = w.time; bag.k = -1; bag.ph = C_RUN;
  u.heading = Math.atan2(bag.dy, bag.dx);
  act(w, u, ACT.CHARGE); setState(u, STATE.CHARGE);
  const sp = u.def.runSpeed * CH.mul;
  drive(u, bag, bag.dx * sp, bag.dy * sp, u.heading);
  used(w, u, 'charge');
  say(w, 'charge', u, u.x, u.y, 1, 'trike');
}
function daze(w, u, bag, t) {
  bag.ph = C_DAZED; bag.t1 = w.time + t; bag.next = w.time + CH.every; bag.k = -1; act(w, u, ACT.DOWN);
  setState(u, STATE.ALERT); drive(u, bag, 0, 0, u.heading);
}
function endCharge(w, u, bag) {
  bag.ph = 0; bag.next = w.time + CH.every; bag.k = -1;
  if (u.b.act === ACT.CHARGE) act(w, u, 0);
  setState(u, STATE.ENGAGE); drive(u, bag, 0, 0, u.heading);
}
function charging(w, u, bag) {
  const now = w.time, sp = u.def.runSpeed * CH.mul, p = power(u);
  if (stunned(u) || u.hurled === 1 || u.inside >= 0 || u.leaping !== 0 || u.z > A1.GROUNDED || now - bag.t0 >= CH.time) { endCharge(w, u, bag); return; }
  if (now - bag.t0 > 0.4 && hypot(u.vx, u.vy) < CH.stall * sp) { endCharge(w, u, bag); return; }
  const t = bag.k < 0 && u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0) {   // bend a little toward the target
    const a = Math.atan2(bag.dy, bag.dx), want = Math.atan2(t.y - u.y, t.x - u.x), da = angleDiff(a, want), step = CH.home * DT;
    if (Math.abs(da) < 1.2) { const na = a + Math.max(-step, Math.min(step, da)); bag.dx = Math.cos(na); bag.dy = Math.sin(na); }
  }
  drive(u, bag, bag.dx * sp, bag.dy * sp, Math.atan2(bag.dy, bag.dx));
  setState(u, STATE.CHARGE);
  // wall straight ahead: dazed
  const ahead = u.radius + 3 + sp * DT;
  if (w.walls.count > 0 && w.walls.isSolidAt(u.x + bag.dx * ahead, u.y + bag.dy * ahead)) {
    const bx = bag.dx, by = bag.dy;
    daze(w, u, bag, CH.wallStun);
    stun(w, u, CH.wallStun); push(w, u, -bx, -by, 0.4 * sp * u.mass, 0);
    say(w, 'trample', u, u.x + bx * u.radius, u.y + by * u.radius, 2, 'trike');
    say(w, 'bounce', u, u.x + bx * u.radius, u.y + by * u.radius, 1, 'trike', 'snd', 'trike');
    return;
  }
  // bodies in the way: the first enemy is gored, the rest are shoved aside
  const n = w.queryMask(u.x, u.y, u.radius + A1.MARGIN + 3 + CH.horns * p, A1.PROPS_OUT, RQ, RQ.length);
  let stop = false;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (stop || o === u || o.dead || !(o.hp > 0) || !grounded(o) || o.hurled === 1 || o.inside >= 0 || o.id === bag.k) continue;
    const ox = o.x - u.x, oy = o.y - u.y, d = hypot(ox, oy) || 0.001;
    if (ox * bag.dx + oy * bag.dy <= 0) continue;   // ahead only
    const first = bag.k < 0 && canHit(u, o);
    if (d > u.radius + o.radius + (first ? CH.horns * p : 2)) continue;   // touching (the horns reach further)
    if (first) {
      if (braced(o, u.x, u.y)) {   // the shield takes the hit; the unit bounces off
        damage(w, o, CH.gore * p, u);
        damage(w, u, o.def.shield.brace, o);
        const bx = bag.dx, by = bag.dy;
        push(w, u, -bx, -by, 0.5 * sp * u.mass, CH.braceStun); stun(w, u, CH.braceStun);
        say(w, 'block', o, o.x, o.y, 1, 'trike');
        daze(w, u, bag, CH.braceStun); stop = true; continue;
      }
      bag.k = o.id;
      const pass = damage(w, o, CH.gore * p, u);
      say(w, 'trample', u, o.x, o.y, 1.5, 'trike');
      const heavy = o.mass >= CH.stopMass * p * p;
      if (o.hp > 0) {
        if (!heavy && !o.def.untossable && pass >= 0.5) toss(w, o, -bag.dx, -bag.dy, CH.goreOut * pass, CH.goreUp * pass);   // up over its back
        else push(w, o, bag.dx, bag.dy, 2 * CH.shove * p * pass, 0.4 * pass);
      }
      if (heavy) { u.vx *= 0.2; u.vy *= 0.2; endCharge(w, u, bag); stop = true; }
      continue;
    }
    const side = bag.dx * oy - bag.dy * ox >= 0 ? 1 : -1;
    push(w, o, -bag.dy * side, bag.dx * side, CH.shove * p, CH.shoveStun);
  }
}
registerAbility({
  id: 'charge',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.t1 = 0; bag.dx = 1; bag.dy = 0; bag.k = -1; initDrive(bag); },
  tick(w, u, bag) {
    if (bag.ph === C_RUN) charging(w, u, bag);
    else if (bag.ph === C_DAZED && w.time >= bag.t1) { bag.ph = 0; if (u.b.act === ACT.DOWN) act(w, u, 0); }
  },
  busy(w, u, bag) { return bag.ph !== 0 ? keep(u, bag) : false; },
  act(w, u, t, dx, dy, d, bag) {
    const p = power(u);
    if (bag.ph !== 0 || w.time < bag.next || d < CH.min * p || d > CH.max * p || d <= u.radius + t.radius + 6 || !free(u) || !clearLine(w, u) || high(t)) return false;
    startCharge(w, u, bag, t.x + t.vx * CH.lead - u.x, t.y + t.vy * CH.lead - u.y);
    return true;
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = bag.gx; u.goalY = bag.gy; } },
  holdsNerve(w, u, bag) { return bag.ph === C_RUN; },
});

// ================================================================ tackle (tackler: units/sports/tackler.js)
const TK = {
  min: 50,          // px: closest target it sprints at (× power)
  max: 200,         // px: farthest (× power)
  sprint: 235 / 180,// sprint speed = the unit's run × this (the tackler's 235 sprint over his 180 run)
  time: 1.5,        // s: longest sprint
  every: 3,         // s between sprints
  damage: 25,       // to the one it takes down (× power)
  stun: 1.4,        // s the victim is down
  slide: 40,        // px the victim slides (× power); push = sqrt(2 × 300 px/s² stunned brake × slide) × its mass
  downTime: 0.8,    // s it is down too
  heavy: 5,         // mass (× power²): anything heavier (or a boss, or a braced shield) just stops it
  gap: 3,           // px past both radii: contact (× power)
  front: 0.2,       // cos: only someone ahead of it (within ~78° of its run) counts
  bounceStun: 0.4,  // s dazed after running into something it can't take down
  selfSlide: 0.35,  // it keeps this share of its speed going down with the victim
};
const T_RUN = 1, T_DOWN = 2;
let _tu = null, _thit = null, _thd = Infinity, _tgap = 0;
function contactOne(o) {
  const u = _tu;
  if (o === u || !(o.hp > 0) || o.inside >= 0 || o.def.prop || !grounded(o) || o.hurled === 1 || !canHit(u, o)) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d > u.radius + o.radius + _tgap) return;
  if ((dx * Math.cos(u.heading) + dy * Math.sin(u.heading)) / d < TK.front) return;
  if (d < _thd) { _thd = d; _thit = o; }
}
function endSprint(w, u, bag, ph) {
  bag.next = w.time + TK.every; bag.ph = ph; bag.t0 = w.time;
  if (ph === 0 && (u.b.act === ACT.CHARGE || u.b.act === ACT.DOWN)) act(w, u, 0);
  if (ph === T_DOWN) act(w, u, ACT.DOWN);
  drive(u, bag, 0, 0, u.heading);
}
function tackle(w, u, bag, o) {
  const p = power(u), dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001, ux = dx / d, uy = dy / d;
  if (o.mass > TK.heavy * p * p || o.def.boss === true || braced(o, u.x, u.y)) {   // a wall of meat (or a shield): stops dead
    u.vx = 0; u.vy = 0;
    if (u.stun < TK.bounceStun) u.stun = TK.bounceStun;
    say(w, 'bounce', u, u.x, u.y, 1, 'tackler');
    endSprint(w, u, bag, 0);
    return;
  }
  damage(w, o, TK.damage * p, u);
  if (o.hp > 0) push(w, o, ux, uy, Math.sqrt(2 * 300 * TK.slide * p) * Math.max(0.25, o.mass), TK.stun);
  hatKnock(w, o, ux, uy, 0.8);
  u.b.victim = o.id; bag.vic = o.id;
  u.vx *= TK.selfSlide; u.vy *= TK.selfSlide;
  if (u.stun < TK.downTime) u.stun = TK.downTime;
  say(w, 'trample', u, o.x, o.y, 1, 'tackler');
  if (w.stats) w.stats.impacts = (w.stats.impacts || 0) + 1;
  endSprint(w, u, bag, T_DOWN);
}
/** One sprint tick: steer after the target (none: straight on), tackle the first enemy in its way. */
function sprintStep(w, u, bag) {
  const t = targetOf(w, u), p = power(u);
  if (stunned(u) || u.state === STATE.FLEE || u.hurled === 1 || u.inside >= 0 || u.leaping !== 0 || u.z > A1.GROUNDED || w.time - bag.t0 >= TK.time) { endSprint(w, u, bag, 0); return; }
  if (t) bag.sa = Math.atan2(t.y - u.y, t.x - u.x);
  const sp = u.def.runSpeed * TK.sprint;
  drive(u, bag, Math.cos(bag.sa) * sp, Math.sin(bag.sa) * sp, bag.sa); u.pathing = 1;
  setState(u, STATE.CHARGE);
  _tu = u; _thit = null; _thd = Infinity; _tgap = TK.gap * p;
  w.query(u.x, u.y, u.radius + A1.MARGIN + _tgap, contactOne, ENEMY[u.faction]);
  const o = _thit; _tu = null; _thit = null;
  if (o) tackle(w, u, bag, o);
}
registerAbility({
  id: 'tackle',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.sa = 0; bag.vic = -1; initDrive(bag); },
  tick(w, u, bag) {
    if (bag.ph === T_RUN) sprintStep(w, u, bag);
    else if (bag.ph === T_DOWN && w.time - bag.t0 >= TK.downTime) {
      bag.ph = 0; if (u.b.act === ACT.DOWN) act(w, u, 0);
      if (u.b.victim === bag.vic && bag.vic >= 0) u.b.victim = -1;
      bag.vic = -1;
    }
  },
  busy(w, u, bag) { return bag.ph !== 0 ? keep(u, bag) : false; },
  act(w, u, t, dx, dy, d, bag) {
    const p = power(u);
    if (bag.ph !== 0 || w.time < bag.next || d < TK.min * p || d > TK.max * p || !free(u) || !clearLine(w, u) || !grounded(t)) return false;
    bag.ph = T_RUN; bag.sa = Math.atan2(dy, dx); bag.t0 = w.time;
    act(w, u, ACT.CHARGE); setState(u, STATE.CHARGE);
    used(w, u, 'tackle');
    say(w, 'charge', u, u.x, u.y, 1, 'tackler');
    sprintStep(w, u, bag);
    return true;
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = bag.gx; u.goalY = bag.gy; } },
  holdsNerve(w, u, bag) { return bag.ph === T_RUN; },
});

// ================================================================ slide (walrus belly slide: units/ocean/walrus.js)
const SL = {
  min: 60,          // px: slides at a target this far ... (× power)
  max: 260,         // ... up to this far (× power)
  speed: 240,       // px/s on its belly
  past: 40,         // px: aims this far past where the target was (× power)
  ground: 0.6,      // s of plain ground and the slide is over (ice and water don't count)
  long: 2.5,        // s: any slide is over after this
  stuck: 0.45,      // × speed: slower than this after the first 0.1 s = it hit something (a wall)
  every: 4,         // s between slides
  getUp: 0.4,       // s it lies there after a slide (still the slide pose, can't act)
  hit: 30,          // damage to each enemy it slides into (× power) ...
  hitGap: 4,        // ... (px past both bodies, × power) ...
  tossAside: 70,    // ... tossed this far to the side (× power) ...
  tossUp: 150,      // ... with this upward speed
  hitsMax: 24,      // units remembered per slide (each is hit once)
};
const S_RUN = 1, S_UP = 2;
function slick(w, x, y) { return (w.iceCells > 0 && w.iceAt(x, y) > 0) || (w.waterCells > 0 && w.depthUnder(x, y) >= WET); }
function slideGoal(w, u, bag) {   // the slide's goal = its velocity (steering slows goals down in water: not on a slide)
  const wf = Math.max(0.35, wadeFactor(w, u, u.def));
  drive(u, bag, bag.dx * SL.speed / wf, bag.dy * SL.speed / wf, Math.atan2(bag.dy, bag.dx));
}
function startSlide(w, u, bag, tx, ty) {
  const dx = tx - u.x, dy = ty - u.y, d = hypot(dx, dy) || 0.001;
  bag.dx = dx / d; bag.dy = dy / d; bag.len = d + SL.past * power(u); bag.t0 = w.time; bag.gt = 0; bag.n = 0;
  bag.hits.fill(-1);
  bag.ph = S_RUN; act(w, u, ACT.SLIDE); setState(u, STATE.ENGAGE);   // not Charge: OG gunners sidestep a charger, and a slide can't steer
  u.vx = bag.dx * SL.speed; u.vy = bag.dy * SL.speed; u.heading = Math.atan2(bag.dy, bag.dx);
  slideGoal(w, u, bag);
  used(w, u, 'slide');
  say(w, 'trample', u, u.x, u.y, 1.2, 'walrus');
}
function slideStep(w, u, bag) {
  const age = w.time - bag.t0, p = power(u);
  if (!slick(w, u.x, u.y)) bag.gt += DT;
  const sp = hypot(u.vx, u.vy);
  if (bag.gt >= SL.ground || age >= SL.long || age * SL.speed >= bag.len || (age > 0.1 && sp < SL.stuck * SL.speed) ||
      stunned(u) || u.hurled === 1 || u.inside >= 0 || u.leaping !== 0 || u.z > A1.GROUNDED) {
    bag.ph = S_UP; bag.t0 = w.time; bag.next = w.time + SL.every;
    drive(u, bag, 0, 0, u.heading);
    return;
  }
  u.vx = bag.dx * SL.speed; u.vy = bag.dy * SL.speed;
  slideGoal(w, u, bag); setState(u, STATE.ENGAGE);
  // everyone it hits: 30 + tossed aside (each once per slide)
  const gap = SL.hitGap * p;
  const n = w.queryMask(u.x, u.y, u.radius + gap + A1.MARGIN, ENEMY[u.faction], RQ, RQ.length);
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.z > 8 || o.climb > 0 || o.inside >= 0 || o.hurled === 1 || !canHit(u, o)) continue;
    const ox = o.x - u.x, oy = o.y - u.y;
    if (hypot(ox, oy) > u.radius + o.radius + gap || bag.hits.indexOf(o.id) >= 0) continue;
    if (bag.n < SL.hitsMax) bag.hits[bag.n++] = o.id;
    damage(w, o, SL.hit * p, u, undefined, u.x, u.y);
    if (o.hp > 0) {
      const side = ox * -bag.dy + oy * bag.dx >= 0 ? 1 : -1;   // the side of its path the unit was on
      tossTo(w, o, -bag.dy * side * 0.85 + bag.dx * 0.5, bag.dx * side * 0.85 + bag.dy * 0.5, SL.tossAside * p, SL.tossUp);
    }
    say(w, 'trample', u, o.x, o.y, 1, 'walrus');
  }
}
registerAbility({
  id: 'slide',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.dx = 1; bag.dy = 0; bag.len = 0; bag.gt = 0; bag.n = 0; bag.hits = new Int32Array(SL.hitsMax).fill(-1); initDrive(bag); },
  tick(w, u, bag) {
    if (bag.ph === S_RUN) slideStep(w, u, bag);
    else if (bag.ph === S_UP && w.time - bag.t0 >= SL.getUp) { bag.ph = 0; if (u.b.act === ACT.SLIDE) act(w, u, 0); }
  },
  busy(w, u, bag) { return bag.ph !== 0 ? keep(u, bag) : false; },
  act(w, u, t, dx, dy, d, bag) {
    const p = power(u);
    if (bag.ph !== 0 || w.time < bag.next || d < SL.min * p || d > SL.max * p || !free(u) || !clearLine(w, u) || t.z > 8) return false;
    startSlide(w, u, bag, t.x, t.y);
    return true;
  },
  // sliding / lying on its belly: the stick doesn't steer it
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = bag.gx; u.goalY = bag.gy; } },
  holdsNerve(w, u, bag) { return bag.ph !== 0; },
});

export { PO, CH, TK, SL };
