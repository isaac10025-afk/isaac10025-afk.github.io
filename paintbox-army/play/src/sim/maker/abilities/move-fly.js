// Unit maker: A-MOVE flyers (OURS, Part 2 step 8, STEP8.md). Owner: A-MOVE. Imported by move.js.
// fly (dragon / jetpack), grabdrop (ptero), beam (UFO), firedive (phoenix): each one replaces how the unit gets about.
//
// The shared flight (every flyer): LEAP.FLY at its cruising height (steering skips walls, water and bodies for it; the
// brain still runs up there), def.flies + markSky every tick above z 30 (dinos' rule: melee units drop it as a target up
// there, shots still hit). A web drops it: gravity takes it (leaping 0), it sits until the web lets go, then takes off.
// Guns, bows and throws fight from up there. A MELEE / BODY weapon (range 0) can't: the flyer closes in, circles its
// target while the weapon cools down, then DIVES to z <= 6 (b.act DIVE), lets the weapon strike, and climbs back
// (a strike, or 1.6 s low, ends the dive). While it is low anyone can hit it. Against another high flyer it fights up
// there. Possessed: the same, only while the attack is held.
//
// Bag fields the art reads (u.b.ab[slot], all flyers): ph (0 cruise, 1 dive, 2 low, 3 climb, 4 down: webbed on the
// ground), z0 (cruising height). grabdrop: g (0, 1 grab dive, 2 carrying; b.victim = the carried unit, the core draws it
// at its own z under the flyer). beam: bm (1 = beaming), victim (unit id rising up the beam; OVER.beam draws the cone from
// the unit down to the ground). firedive: fd (0, 1 flying to the run's start, 2 the swoop run; OVER.firedive draws the
// fire trail along dx, dy while fd = 2).
// Pose codes (lib.js ACT): DIVE (a melee dive, a grab dive, the fire swoop), CARRY (grabdrop carrying), CHANNEL (beam:
// nearest code; see the final reply's Asks).
import { registerAbility } from '../registry.js';
import {
  ACT, act, used, power, LEAP, STATE, DT, ENEMY, hypot, markSky, high, grounded, flying, grabbable, glue, flung,
  unitOf, setState, damage, igniteNow, registerSystem, GRAVITY,
} from '../lib.js';
import { HITTABLE, maskBit } from '../../factions.js';
import { thickestCrowd } from '../../units/bosses/_lib.js';
import { getOil } from '../../combat/index.js';
import { bagOf, meleeW, lists, peekLists, goAt, circleAt, endAct } from './move-lib.js';

// ---------------------------------------------------------------- shared flight
const F = {
  sky: 30,          // px: higher than this = out of melee reach (dinos' markSky / high line)
  lowZ: 3,          // px: bottom of a melee dive
  strikeZ: 6,       // px: at or under this the weapon may strike (STEP8: dives to z <= 6)
  diveRate: 9,      // 1/s: eases down this fast in a dive (40 -> 6 px in about 0.27 s)
  rise: 3,          // 1/s: eases up to cruising height (jetpack / ptero 3)
  diveStart: 60,    // px past both bodies (x power): a ready melee flyer this close dives
  ready: 0.25,      // s: dives when the weapon's cooldown is under this (it arrives as the weapon is ready)
  lowMax: 1.6,      // s low at most: a strike or this, then it climbs
  circleR: 70,      // px past both bodies: circles its target this far out while the weapon cools down
  circleSp: 0.8,    // x run speed while circling
};
const CRUISE = 0, DIVE = 1, LOW = 2, CLIMB = 3, DOWN = 4;   // bag.ph

function flyInit(w, u, bag, z0) {
  bag.ph = CRUISE; bag.t0 = 0; bag.z0 = z0; bag.up = 0; bag.cd = 0; bag.gx = 0; bag.gy = 0;
  bag.airId = -1; bag.airDmg = 0; bag.airT = 0;   // ATTACK3 L4 airStuck
  u.leaping = LEAP.FLY; u.z = u.pz = 0;   // takes off once the battle starts (tick hooks never run before START)
}
function climb(w, u, bag) { bag.ph = CLIMB; endAct(w, u, ACT.DIVE); }
/** Every tick: height, the web drop, the dive's phases. false = hands off (held, swallowed, someone else's leap, down). */
function flyTick(w, u, bag, id, as) {
  if (!(u.hp > 0) || u.inside >= 0 || u.hurled === 1 || u.leaping === LEAP.VAULT) return false;
  const now = w.time;
  if (u.webbed > now) {   // webbed: drops (gravity, leaping 0) and sits until the web lets go
    if (bag.ph !== DOWN) { bag.ph = DOWN; u.leaping = 0; u.vz = 0; endAct(w, u, ACT.DIVE); }
    return false;
  }
  if (bag.ph === DOWN) { if (u.z > 0 || u.vz > 0) return false; bag.ph = CLIMB; }
  u.leaping = LEAP.FLY; u.vz = 0;
  const low = bag.ph === DIVE || bag.ph === LOW;
  u.z += ((low ? F.lowZ : bag.z0) - u.z) * Math.min(1, (low ? F.diveRate : F.rise) * DT);
  if (bag.ph === DIVE) { if (u.z <= F.strikeZ) { bag.ph = LOW; bag.t0 = now; } }
  else if (bag.ph === LOW) { if (now - bag.t0 > F.lowMax) climb(w, u, bag); }
  else if (bag.ph === CLIMB && u.z >= bag.z0 - 3) bag.ph = CRUISE;
  if (u.z > F.sky) markSky(w);
  if (bag.up === 0 && u.z > F.strikeZ) {   // first take-off
    bag.up = 1;
    if (id !== null) used(w, u, id);
    w.emit('flap', { x: u.x, y: u.y, v: 2, type: u.type, as });
  }
  return true;
}
// ATTACK3 L4 (OURS): up against another high flyer, a melee weapon that can't strike up there (slam, ram, saw, shove,
// horns, tail, tail club, a second zombie bite: they need the ground or a grounded victim) did nothing: two such flyers
// hovered at each other for good (0 damage in 20 s). Close to it with no damage from its own weapon for AIR.giveUp s, it
// comes down to strike low; the other flyer, now facing a low target, dives at it, and the fight happens down there.
const AIR = {
  giveUp: 2.5,      // s close to a high flyer without hurting anyone
  near: 60,         // px past both bodies: "close to it"
};
function airStuck(w, u, t, d, bag) {
  const dealt = u.dmgDealt || 0;
  if (bag.airId !== t.id || dealt > bag.airDmg || d > u.radius + t.radius + AIR.near) { bag.airId = t.id; bag.airDmg = dealt; bag.airT = w.time; return false; }
  return w.time - bag.airT >= AIR.giveUp;
}
/** With a target (abilities' act): a melee weapon dives to strike; anything else fights from up there (false). */
function flyAct(w, u, t, dx, dy, d, bag, id, as) {
  if (bag.ph === DOWN || !meleeW(u)) return false;
  if (high(t) && !airStuck(w, u, t, d, bag)) { if (bag.ph === DIVE || bag.ph === LOW) climb(w, u, bag); return false; }   // another flyer: fight it up there
  if (bag.ph === LOW) return false;   // low enough: the weapon closes and strikes
  const sp = u.def.runSpeed, reach = u.radius + t.radius;
  if (bag.ph === DIVE) { goAt(u, dx, dy, d, sp); setState(u, STATE.CHARGE); return true; }
  if (bag.ph === CRUISE && u.cooldown <= F.ready && d < reach + F.diveStart * power(u)) {
    bag.ph = DIVE; bag.t0 = w.time; bag.cd = u.cooldown;
    act(w, u, ACT.DIVE);
    if (id !== null) used(w, u, id);
    w.emit('flap', { x: u.x, y: u.y, v: 1, type: u.type, as, dive: 1 });
    goAt(u, dx, dy, d, sp); setState(u, STATE.CHARGE);
    return true;
  }
  // close in; while the weapon cools down (or still climbing) circle it
  setState(u, STATE.ENGAGE);
  const R = reach + F.circleR;
  if (d > R + 25 || (bag.ph === CRUISE && u.cooldown <= F.ready)) goAt(u, dx, dy, d, sp);
  else { circleAt(u, dx, dy, d, R, sp * F.circleSp); u.face = Math.atan2(dy, dx); }
  return true;
}
/** After the weapon's fight: a strike while low ends the dive. */
function flyAfter(w, u, bag) {
  if (bag.ph === LOW && u.b.act !== ACT.WIND && (u.attack >= 0.999 || u.cooldown > bag.cd + 0.05)) climb(w, u, bag);   // ATTACK3 L4: not mid wind-up (the slam sets its cooldown as it starts: the flyer climbed off before its fists came down)
  bag.cd = u.cooldown;
}
function flyIdle(w, u, bag) { if (bag.ph === DIVE || bag.ph === LOW) climb(w, u, bag); return false; }

// ---------------------------------------------------------------- fly (dragon / jetpack)
const T_FLY = {
  z: 40,            // px: cruising height (jetpack 40, a high flyer: melee can't reach it up there)
};
registerAbility({
  id: 'fly',
  def: { flies: true },
  init(w, u, bag) { flyInit(w, u, bag, T_FLY.z); },
  tick(w, u, bag) { flyTick(w, u, bag, 'fly', 'dragon'); },
  act(w, u, t, dx, dy, d, bag) { return flyAct(w, u, t, dx, dy, d, bag, 'fly', 'dragon'); },
  after(w, u, bag) { flyAfter(w, u, bag); },
  idle(w, u, bag) { return flyIdle(w, u, bag); },
  onDeath(w, u) { u.leaping = 0; },
});

// ---------------------------------------------------------------- grabdrop (ptero: copied from units/dinos/ptero.js)
const T_GRAB = {
  z: 60,            // px: cruising height (ptero)
  diveStart: 70,    // px (ground distance): starts a grab dive at prey this close
  diveTime: 0.4,    // s down
  diveLow: 4,       // px: bottom of the dive (never quite lands)
  grabReach: 12,    // px past both bodies (x power) at the bottom of the dive
  grabMass: 2,      // grabs enemies this light (x power squared) ...
  loneR: 45,        // ... with none of their own side within 45 px
  preyR: 280,       // px: looks this far for prey
  scanEvery: 12,    // ticks between prey searches
  carryTime: 1.2,   // s climbing with the victim ...
  carryH: 110,      // ... up to this height ...
  carryDist: 160,   // ... flying this far toward its own side
  fall: 45,         // fall damage to the dropped victim (shared landing bump included; none over water)
  landHit: 20,      // whoever it lands on: damage (+ knocked down)
  every: 3,         // s between grab dives
  dropAt: 0.5,      // shot below this hp fraction while carrying: drops the victim
};
const GDIVE = 1, CARRY = 2;   // bag.g
const PQ = new Array(48), LQ = new Array(4);
function lone(w, o) {
  const n = w.queryMask(o.x, o.y, T_GRAB.loneR, maskBit(o.faction), LQ, LQ.length);
  let c = 0;
  for (let k = 0; k < n; k++) { const a = LQ[k]; LQ[k] = null; if (a !== o && !a.dead && a.hp > 0) c++; }
  return c === 0;
}
function grabOk(o, mass) { return !!o && grabbable(o, mass) && !high(o); }
function findPrey(w, u, mass) {   // nearest lone light enemy on the ground within 280 px
  const n = w.queryMask(u.x, u.y, T_GRAB.preyR, ENEMY[u.faction], PQ, PQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (o.dead || !grabOk(o, mass)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < bd && lone(w, o)) { bd = d; best = o; }
  }
  return best;
}
function startGrab(w, u, bag, x, y) {
  bag.g = GDIVE; bag.t0 = w.time; bag.t1 = u.z; bag.x0 = x; bag.y0 = y;
  act(w, u, ACT.DIVE); setState(u, STATE.CHARGE);
  w.emit('flap', { x: u.x, y: u.y, v: 1, type: u.type, as: 'ptero' });
}
// bottom of the grab dive: lift what is there, else climb (its weapon does the fighting)
function grabAt(w, u, bag) {
  const now = w.time, p = unitOf(w, bag.prey), pw = power(u);
  let v = p && p.hp > 0 ? p : null;
  if (!v) v = w.findNearest(u.x, u.y, u.radius + 46, ENEMY[u.faction], null, 0);
  bag.g = 0; bag.prey = -1; bag.next = now + T_GRAB.every; endAct(w, u, ACT.DIVE); bag.ph = CLIMB;
  if (!v || hypot(v.x - u.x, v.y - u.y) > u.radius + v.radius + T_GRAB.grabReach * pw || !grounded(v) || v.def.prop) return;
  if (!grabbable(v, T_GRAB.grabMass * pw * pw)) return;
  bag.g = CARRY; bag.victim = v.id; bag.t0 = now; v.hurled = 1; u.b.victim = v.id;
  // its own side: its team's half in Team battle, else back where it was painted, else straight away
  const dx = v.x - u.x, dy = v.y - u.y;
  let hx = u.team === 0 ? -1 : u.team === 1 ? 1 : u.homeX - u.x, hy = u.team >= 0 ? 0 : u.homeY - u.y;
  if (u.team < 0 && hx * hx + hy * hy < 1600) { hx = -dx; hy = -dy; }
  const hd = hypot(hx, hy) || 1; bag.dx = hx / hd; bag.dy = hy / hd;
  act(w, u, ACT.CARRY);
  used(w, u, 'grabdrop');
  w.emit('throw', { x: v.x, y: v.y, v: 0.8, type: u.type, as: 'ptero' });
}
function endCarry(w, u, bag) {
  bag.g = 0; bag.victim = -1; bag.next = w.time + T_GRAB.every; bag.ph = CLIMB;
  if (u.b.victim >= 0) u.b.victim = -1;
  endAct(w, u, ACT.CARRY);
}
// let go: it falls; dinoFlung adds the fall damage past the shared landing bump (8·impact/400) and hits whoever is under
function release(w, u, bag) {
  const v = unitOf(w, bag.victim);
  endCarry(w, u, bag);
  if (!v) return;
  v.hurled = 0; v.vx = u.vx * 0.6; v.vy = u.vy * 0.6; v.vz = 0;
  const z = Math.max(2, v.z), air = Math.sqrt(2 * z / GRAVITY), bump = 8 * Math.sqrt(2 * GRAVITY * z) / 400;
  v.stun = Math.max(v.stun, air + 0.3); v.thrownAt = w.time;
  v.spin = (v.vx >= 0 ? 1 : -1) * Math.PI / Math.max(0.2, air);
  flung(w, v, u, Math.max(0, T_GRAB.fall - bump), T_GRAB.landHit);
  w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, as: 'ptero' });
}
function grabTick(w, u, bag) {
  const now = w.time;
  if (bag.g !== 0 && (u.webbed > now || u.inside >= 0 || u.hurled === 1 || !(u.hp > 0))) {   // knocked out of it
    if (bag.g === CARRY) release(w, u, bag); else { bag.g = 0; bag.next = now + T_GRAB.every; endAct(w, u, ACT.DIVE); }
  }
  if (bag.g === GDIVE) {
    u.leaping = LEAP.FLY; u.vz = 0;
    const f = Math.min(1, (now - bag.t0) / T_GRAB.diveTime), p = unitOf(w, bag.prey);
    if (p && p.hp > 0 && !high(p)) { bag.x0 = p.x; bag.y0 = p.y; }
    u.z = bag.t1 - (bag.t1 - T_GRAB.diveLow) * f * f;
    if (f >= 1) grabAt(w, u, bag);
    return;
  }
  if (bag.g === CARRY) {
    const v = unitOf(w, bag.victim), f = (now - bag.t0) / T_GRAB.carryTime;
    if (!v || !(v.hp > 0)) { endCarry(w, u, bag); return; }
    if (f >= 1) { release(w, u, bag); return; }
    u.leaping = LEAP.FLY; u.vz = 0;
    const e = f * f * (3 - 2 * f);
    u.z = T_GRAB.diveLow + (T_GRAB.carryH - T_GRAB.diveLow) * e;
    markSky(w);
    glue(v, u.x, u.y - 1, u.z - 3.1 * v.radius, u.vx, u.vy);   // the ptero's hold: under it, claws on its head
    v.hurled = 1;
    return;
  }
  flyTick(w, u, bag, null, 'ptero');
}
// the goal while diving / carrying (busy, and again after the player's stick)
function grabGoal(w, u, bag) {
  if (bag.g === GDIVE) {
    const dx = bag.x0 - u.x, dy = bag.y0 - u.y, d = hypot(dx, dy) || 0.001, left = Math.max(DT, T_GRAB.diveTime - (w.time - bag.t0));
    goAt(u, dx, dy, d, Math.min(u.def.maxSpeed, d / left));
  } else {
    const sp = T_GRAB.carryDist / T_GRAB.carryTime;
    u.goalX = bag.dx * sp; u.goalY = bag.dy * sp; u.face = Math.atan2(bag.dy, bag.dx);
  }
}
registerAbility({
  id: 'grabdrop',
  def: { flies: true },
  init(w, u, bag) {
    flyInit(w, u, bag, T_GRAB.z);
    bag.g = 0; bag.prey = -1; bag.next = 1; bag.t1 = 0; bag.x0 = 0; bag.y0 = 0; bag.dx = 0; bag.dy = 0; bag.victim = -1;
  },
  tick: grabTick,
  busy(w, u, bag) { if (bag.g === 0) return false; grabGoal(w, u, bag); setState(u, bag.g === GDIVE ? STATE.CHARGE : STATE.ENGAGE); return true; },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.g !== 0) return true;
    if (bag.ph !== DOWN && w.time >= bag.next) {
      const pw = power(u), mass = T_GRAB.grabMass * pw * pw;
      let p = unitOf(w, bag.prey);
      if (u.possessed === 1) p = grabOk(t, mass) ? t : null;   // the player picks; no "lone" rule
      else if ((w.tick + u.index) % T_GRAB.scanEvery === 0) p = findPrey(w, u, mass);
      if (p && !grabOk(p, mass)) p = null;
      bag.prey = p ? p.id : -1;
      if (p) {
        const px = p.x - u.x, py = p.y - u.y, pd = hypot(px, py) || 0.001;
        setState(u, STATE.CHARGE);
        if (pd < T_GRAB.diveStart * Math.max(1, pw) && grounded(p)) { startGrab(w, u, bag, p.x, p.y); grabGoal(w, u, bag); return true; }
        goAt(u, px, py, pd, u.def.runSpeed);
        return true;
      }
    }
    return flyAct(w, u, t, dx, dy, d, bag, null, 'ptero');
  },
  after(w, u, bag) { flyAfter(w, u, bag); },
  idle(w, u, bag) { return flyIdle(w, u, bag); },
  holdsNerve(w, u, bag) { return bag.g !== 0; },
  onHit(w, u, amount, src, kind, bag) { if (bag.g === CARRY && u.hp < T_GRAB.dropAt * u.maxHp) release(w, u, bag); },
  onDeath(w, u, cause, killer, bag) { if (bag.g === CARRY) release(w, u, bag); u.leaping = 0; },
  possessMove(w, u, mx, my, firing, bag) { if (bag.g !== 0) grabGoal(w, u, bag); },
});

// ---------------------------------------------------------------- beam (UFO: copied from units/space/ufo.js)
const T_BEAM = {
  z: 90,            // px: cruising height (UFO, a high flyer)
  mass: 4,          // lifts units this light (x power squared), never bosses
  time: 1.5,        // s up the beam
  cool: 4,          // s from one abduction to the next
  r: 10,            // px (x power): the beam starts when the prey is within this + its radius of its middle
  pull: 8,          // 1/s: the beam draws the victim in under it this fast
  preyR: 320,       // px: looks this far for something to lift
  scanEvery: 12,    // ticks between prey searches
  startZ: 40,       // px: starts a beam only from this high (not in the middle of a melee dive)
  lead: 0.3,        // s: flies over where the prey will be this much later (the UFO, slow, never chased runners)
};
function liftable(w, o, mass) {   // light, not a boss / prop / flyer, on the ground, not held / swallowed / floating
  if (!o) return false;
  const d = o.def;
  return o.hp > 0 && !o.dead && o.mass <= mass && !d.boss && !d.prop && !flying(o) && grounded(o) && o.inside < 0 &&
    o.hurled !== 1 && o.leaping === 0 && !(o.floating > w.time) && d.aquatic !== true && !(o.hidden > 0);
}
function findLift(w, u, mass) {
  const n = w.queryMask(u.x, u.y, T_BEAM.preyR, ENEMY[u.faction], PQ, PQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (!liftable(w, o, mass)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
function freeVictim(w, v) { v.hurled = 0; v.hidden = 0; v.vz = 0; v.thrownAt = w.time; }
function startBeam(w, u, bag, v) {
  listAdd2(lists(w).beam, v.id, u.id);
  bag.bm = 1; bag.victim = v.id; bag.t0 = w.time; bag.prey = -1; u.b.victim = v.id;
  v.hurled = 1; v.hidden = 0.001; v.target = -1; v.stun = Math.max(v.stun, 0.3);
  act(w, u, ACT.CHANNEL);
  used(w, u, 'beam');
  w.emit('charge', { x: v.x, y: v.y, v: 1, type: u.type, as: 'ufo', beam: 1 });
}
function listAdd2(L, a, b) { for (let k = 0; k < L.length; k += 2) if (L[k] === a) { L[k + 1] = b; return; } L.push(a, b); }
function letGo(w, u, bag) {   // the victim drops (webbed, killed, ...): gravity takes it
  const v = unitOf(w, bag.victim);
  if (v && v.inside < 0) freeVictim(w, v);
  bag.victim = -1; bag.bm = 0; bag.next = w.time + T_BEAM.cool * 0.5;
  if (u.b.victim >= 0) u.b.victim = -1;
  endAct(w, u, ACT.CHANNEL);
}
function beamStep(w, u, bag) {
  const v = unitOf(w, bag.victim);
  if (!v || !(v.hp > 0) || v.inside >= 0) { bag.victim = -1; bag.bm = 0; bag.next = w.time + T_BEAM.cool; if (u.b.victim >= 0) u.b.victim = -1; endAct(w, u, ACT.CHANNEL); return; }
  const f = Math.min(1, (w.time - bag.t0) / T_BEAM.time), e = f * f * (3 - 2 * f);
  const k = Math.min(1, T_BEAM.pull * DT);
  v.x += (u.x - v.x) * k; v.y += (u.y - v.y) * k;
  v.z = v.pz = Math.max(2, (u.z - 0.6 * u.radius) * e); v.vz = 0; v.vx = u.vx; v.vy = u.vy; v.spin = 2;
  if (v.stun < 0.3) v.stun = 0.3;
  v.hurled = 1; v.hidden = 0.001;
  if (f < 1) return;
  // into it: gone (no body), the made unit gets the kill
  v.hurled = 0; v.eaten = 1; v.inside = u.id; v.infection = 0;
  damage(w, v, v.hp + 1e3, u, 'eaten');
  v.hp = Math.min(v.hp, 0);
  w.emit('descend', { x: u.x, y: u.y, v: 1, type: u.type, as: 'ufo', abduct: 1, victim: v.type });
  bag.victim = -1; bag.bm = 0; bag.next = w.time + T_BEAM.cool;
  if (u.b.victim >= 0) u.b.victim = -1;
  endAct(w, u, ACT.CHANNEL);
}
// Every tick after the brains (a brain can skip ticks: a victim left a tick unheld would drop). Pairs: victim id, unit id.
// A beamer that is gone (killed, Erase, edited away) or no longer beaming that victim lets it drop.
function beamSys(w) {
  const s = peekLists(w);
  if (s === undefined || s.beam.length === 0) return;
  const L = s.beam;
  for (let k = L.length - 2; k >= 0; k -= 2) {
    const v = w.unitById(L[k]), u = w.unitById(L[k + 1]), bag = u ? bagOf(u, 'beam') : null;
    if (v && bag && bag.bm === 1 && bag.victim === v.id && u.hp > 0) { beamStep(w, u, bag); if (bag.bm === 1 && bag.victim === v.id) continue; }
    else if (v && v.inside < 0) freeVictim(w, v);
    L[k] = L[L.length - 2]; L[k + 1] = L[L.length - 1]; L.length -= 2;
  }
}
registerSystem('mineBeam', beamSys, 'brain');
registerAbility({
  id: 'beam',
  def: { flies: true },
  init(w, u, bag) { flyInit(w, u, bag, T_BEAM.z); bag.bm = 0; bag.victim = -1; bag.next = 1; bag.prey = -1; },
  tick(w, u, bag) {
    if (bag.bm === 1 && (u.webbed > w.time || u.inside >= 0 || u.hurled === 1 || !(u.hp > 0))) letGo(w, u, bag);
    flyTick(w, u, bag, null, 'ufo');
  },
  // beaming: it holds still over the victim; a gun / bow / throw keeps firing (after() holds it still), melee waits
  busy(w, u, bag) { if (bag.bm === 1 && meleeW(u)) { u.goalX = 0; u.goalY = 0; setState(u, STATE.ENGAGE); return true; } return false; },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.bm === 1) return meleeW(u);
    if (bag.ph !== DOWN && w.time >= bag.next) {
      const pw = power(u), mass = T_BEAM.mass * pw * pw;
      let p = unitOf(w, bag.prey);
      if (u.possessed === 1) p = liftable(w, t, mass) ? t : null;
      else if ((w.tick + u.index) % T_BEAM.scanEvery === 0) p = liftable(w, t, mass) ? t : findLift(w, u, mass);
      if (p && !liftable(w, p, mass)) p = null;
      bag.prey = p ? p.id : -1;
      if (p) {
        const px = p.x - u.x, py = p.y - u.y, pd = hypot(px, py) || 0.001;
        setState(u, STATE.CHARGE);
        if (bag.ph === DIVE || bag.ph === LOW) climb(w, u, bag);
        if (pd <= T_BEAM.r * pw + p.radius && u.z >= T_BEAM.startZ) { startBeam(w, u, bag, p); u.goalX = 0; u.goalY = 0; return true; }
        // over where it is going (a lead), at up to its run speed, matching the prey's pace when close (UFO: min(speed, 4 d))
        const lx = px + p.vx * T_BEAM.lead, ly = py + p.vy * T_BEAM.lead, ld = hypot(lx, ly) || 0.001;
        goAt(u, lx, ly, ld, Math.min(u.def.runSpeed, 4 * ld + hypot(p.vx, p.vy)));
        return true;
      }
    }
    return flyAct(w, u, t, dx, dy, d, bag, null, 'ufo');
  },
  after(w, u, bag) { if (bag.bm === 1) { u.goalX = 0; u.goalY = 0; } flyAfter(w, u, bag); },
  idle(w, u, bag) { if (bag.bm === 1) { u.goalX = 0; u.goalY = 0; return true; } return flyIdle(w, u, bag); },
  holdsNerve(w, u, bag) { return bag.bm === 1; },
  onDeath(w, u, cause, killer, bag) { if (bag.bm === 1) letGo(w, u, bag); u.leaping = 0; },
  possessMove(w, u, mx, my, firing, bag) { if (bag.bm === 1) { u.goalX = 0; u.goalY = 0; } },
});

// ---------------------------------------------------------------- firedive (phoenix: copied from units/secret/phoenix.js)
const T_FIRE = {
  z: 50,            // px: cruising height (phoenix, a high flyer)
  dive: 260,        // px/s on the swoop run (or its own run speed if that is faster)
  diveZ: 6,         // px: bottom of the swoop
  every: 4,         // s between dives
  len: 200,         // px: the swoop run
  lineR: 18,        // px (x power): everything this close to its path burns ...
  dmg: 15,          // ... and takes this much (fire)
  lowZ: 20,         // px: it burns things only while this low
  scan: 480,        // px: looks this far for a crowd to swoop through
  crowdR: 60,       // px: a crowd is counted within this
  tries: 6,         // directions tried through the crowd
  approach: 1.3,    // x run speed flying to the run's start
  approachMax: 3,   // s: gives up flying to the run's start after this
  startNear: 18,    // px from the run's start: the run begins
  hits: 48,         // units burned per run (each once)
};
const APPROACH = 1, RUN = 2;   // bag.fd
const PT = new Float64Array(3), FQ = new Array(96);
function pickLine(w, u, bag) {
  if (!thickestCrowd(w, u, u.x, u.y, T_FIRE.scan, T_FIRE.crowdR, null, PT)) return false;
  const cx = PT[0], cy = PT[1], half = T_FIRE.len / 2, lr = T_FIRE.lineR * power(u);
  const n = w.queryMask(cx, cy, half + lr + 46, ENEMY[u.faction], FQ, FQ.length);
  let best = -1, ba = 0;
  for (let k = 0; k < T_FIRE.tries; k++) {
    const a = (k / T_FIRE.tries) * Math.PI, ex = Math.cos(a), ey = Math.sin(a);
    let c = 0;
    for (let j = 0; j < n; j++) {
      const o = FQ[j];
      if (o.dead || !(o.hp > 0) || o.inside >= 0 || o.z > T_FIRE.lowZ || o.def.prop) continue;
      const ox = o.x - cx, oy = o.y - cy, along = ox * ex + oy * ey;
      if (along < -half || along > half) continue;
      if (Math.abs(ox * ey - oy * ex) <= lr + o.radius) c++;
    }
    if (c > best) { best = c; ba = a; }
  }
  for (let j = 0; j < n; j++) FQ[j] = null;
  if (best <= 0) return false;
  let ex = Math.cos(ba), ey = Math.sin(ba);
  const s1 = hypot(cx - ex * half - u.x, cy - ey * half - u.y), s2 = hypot(cx + ex * half - u.x, cy + ey * half - u.y);
  if (s2 < s1) { ex = -ex; ey = -ey; }   // start at the nearer end
  bag.x0 = cx - ex * half; bag.y0 = cy - ey * half; bag.dx = ex; bag.dy = ey;
  return true;
}
function runSpeed(u) { return Math.max(T_FIRE.dive, u.def.runSpeed); }
function startRun(w, u, bag, dx, dy) {
  const d = hypot(dx, dy) || 1;
  bag.fd = RUN; bag.t0 = w.time; bag.dx = dx / d; bag.dy = dy / d; bag.nh = 0; bag.t1 = u.z;
  act(w, u, ACT.DIVE); setState(u, STATE.ENGAGE);
  used(w, u, 'firedive');
  w.emit('flap', { x: u.x, y: u.y, v: 1.4, type: u.type, as: 'phoenix', dive: 1 });
}
let _u = null, _w = null, _bag = null, _lr = 0;
function burnOne(o) {
  const u = _u, bag = _bag;
  if (o === u || o.dead || !(o.hp > 0) || o.inside >= 0 || o.z > T_FIRE.lowZ || o.climb > 0) return;
  if (hypot(o.x - u.x, o.y - u.y) > _lr + o.radius + u.radius * 0.5) return;
  for (let k = 0; k < bag.nh; k++) if (bag.hits[k] === o.id) return;
  if (bag.nh < T_FIRE.hits) bag.hits[bag.nh++] = o.id;
  damage(_w, o, T_FIRE.dmg, u, 'fire', o.x, o.y);   // from above: shields don't help
  igniteNow(_w, o);
}
// the swoop: along dx, dy at dive speed, dipping to diveZ; burns everything near its path once (every tick)
function runTick(w, u, bag) {
  const sp = runSpeed(u), f = Math.min(1, (w.time - bag.t0) / (T_FIRE.len / sp)), q = Math.abs(2 * f - 1);
  u.leaping = LEAP.FLY; u.vz = 0;
  u.goalX = bag.dx * sp; u.goalY = bag.dy * sp; u.face = Math.atan2(bag.dy, bag.dx);
  u.z = T_FIRE.diveZ + (Math.max(bag.t1, T_FIRE.diveZ) - T_FIRE.diveZ) * q * q * q;
  markSky(w);
  if (u.z <= T_FIRE.lowZ) {
    _u = u; _w = w; _bag = bag; _lr = T_FIRE.lineR * power(u);
    w.query(u.x, u.y, _lr + u.radius + 46, burnOne, HITTABLE[u.faction]);
    _u = null; _w = null; _bag = null;
    if (w.oilCells > 0 && (w.tick & 3) === 0) getOil(w).ignite(u.x, u.y, _lr * 0.6);
  }
  if (f >= 1) { bag.fd = 0; endAct(w, u, ACT.DIVE); bag.next = w.time + T_FIRE.every; bag.ph = CLIMB; }
}
registerAbility({
  id: 'firedive',
  def: { flies: true, flammability: 0 },   // fire immune (the phoenix's flammability 0: never catches fire, no lava harm)
  init(w, u, bag) {
    flyInit(w, u, bag, T_FIRE.z);
    bag.fd = 0; bag.t1 = 0; bag.x0 = 0; bag.y0 = 0; bag.dx = 0; bag.dy = 0; bag.next = 1; bag.nh = 0; bag.hits = new Int32Array(T_FIRE.hits);
  },
  tick(w, u, bag) {
    if (bag.fd === RUN) {
      if (u.webbed > w.time || u.inside >= 0 || u.hurled === 1 || !(u.hp > 0)) { bag.fd = 0; endAct(w, u, ACT.DIVE); bag.next = w.time + T_FIRE.every; }
      else { runTick(w, u, bag); return; }
    }
    flyTick(w, u, bag, null, 'phoenix');
  },
  busy(w, u, bag) {
    if (bag.fd === RUN) { const sp = runSpeed(u); u.goalX = bag.dx * sp; u.goalY = bag.dy * sp; u.face = Math.atan2(bag.dy, bag.dx); return true; }
    if (bag.fd !== APPROACH) return false;
    if (u.stun > 0 || bag.ph === DOWN) { bag.fd = 0; return false; }
    const dx = bag.x0 - u.x, dy = bag.y0 - u.y, d = hypot(dx, dy);
    if (d <= T_FIRE.startNear) { startRun(w, u, bag, bag.dx, bag.dy); return true; }
    if (w.time - bag.t0 > T_FIRE.approachMax) { bag.fd = 0; bag.next = w.time + 1; return false; }
    goAt(u, dx, dy, d, u.def.runSpeed * T_FIRE.approach); setState(u, STATE.ENGAGE);
    return true;
  },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.fd !== 0) return true;
    if (bag.ph !== DOWN && w.time >= bag.next) {
      if (u.possessed === 1) {   // the player picked it: swoop straight through it from here
        if (d < T_FIRE.len * 0.9) { startRun(w, u, bag, d > 1 ? dx : Math.cos(u.heading), d > 1 ? dy : Math.sin(u.heading)); return true; }
      } else if (pickLine(w, u, bag)) { bag.fd = APPROACH; bag.t0 = w.time; if (bag.ph === DIVE || bag.ph === LOW) climb(w, u, bag); return true; }
      else bag.next = w.time + 0.5;
    }
    return flyAct(w, u, t, dx, dy, d, bag, null, 'phoenix');
  },
  after(w, u, bag) { flyAfter(w, u, bag); },
  idle(w, u, bag) { if (bag.fd === APPROACH) bag.fd = 0; return flyIdle(w, u, bag); },
  damageMul(w, u, amount, att, kind) { return kind === 'fire' ? 0 : 1; },
  holdsNerve(w, u, bag) { return bag.fd !== 0; },
  onDeath(w, u) { u.leaping = 0; },
  possessMove(w, u, mx, my, firing, bag) { if (bag.fd === RUN) { const sp = runSpeed(u); u.goalX = bag.dx * sp; u.goalY = bag.dy * sp; } },
});

export { T_FLY, T_GRAB, T_BEAM, T_FIRE, F as FLIGHT };
