// Unit maker: A-ACT1 grab tricks (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT1.
// throw (baby: units/secret/baby.js), lasso (cowboy: units/secret/cowboy.js), swallow (snake: units/animals/snake.js):
// the source unit's trick on any body and any weapon. Reaches and rope ranges × power(u), mass limits × power². State in
// the ability's own bag; held victims are registered (act1-lib holding()) so a made unit taken off the field mid-hold
// lets them go. Fields the art may read:
//   throw    bag.ph 1 holding it up (ACT.GRAB, u.b.victim = the held unit: the sim keeps it at the hands, z = 1.5 × the
//            unit's radius, like the baby), 2 the throw (ACT.THROW, 0.4 s)
//   lasso    bag.ph 1 rope flying (ACT.THROW), 2 dragging it in (ACT.GRAB, u.b.victim); bag.lx / bag.ly / bag.lz = the loop
//            (sim px, ground point + height) every tick of both phases: OVER.lasso draws the rope from the hand to it
//   swallow  bag.ph 1 swallowing (ACT.SWALLOW, u.b.victim: the sim pulls it into the mouth and shrinks it to 40 %, like the
//            snake's); after: u.radius is bigger (up to ×1.5 its start size)
import { registerAbility } from '../registry.js';
import { ACT, act, power, used, STATE, hypot, ENEMY, setState, clearLine, grounded, high, glue, tossTo, flung, GRAVITY } from '../lib.js';
import { aimAngle } from '../../systems/possess.js';
import { nearestFoe, letGo, thickestCrowd } from '../../units/secret/_lib.js';
import { eat } from '../../units/animals/lib.js';
import { A1, FIRST, low, stunned, stand, initDrive, unitOf, say, holding, unheld } from './act1-lib.js';

const RQ = new Array(48).fill(null);
const PT = new Float64Array(3);
/** Can o be picked up / roped / swallowed at all? (+ the mass limit) */
function liftable(o, maxMass) {
  const d = o.def;
  return o.mass <= maxMass && !d.prop && !d.untossable && !d.boss && o.hurled !== 1 && o.inside < 0 && grounded(o) &&
    o.leaping === 0 && o.hp > 0 && !o.dead && !(o.floating > 0 && o.z > 1) && !high(o);
}

// ================================================================ throw (baby: grab + throw)
const TH = {
  every: 3,         // s between grabs
  mass: 4,          // picks up enemies this light or lighter (× power²) ...
  reach: 24,        // ... this far past both bodies (× power)
  look: 0.6,        // s it holds the unit up and looks at it
  holdUp: 1.5,      // × its radius: how high it holds the unit
  hands: 0.55,      // × its radius: how far in front
  throwMin: 150,    // px: throws at least this far ...
  throwMax: 300,    // ... and at most this far
  throwUp: 320,     // px/s up
  crowdScan: 340,   // px: looks this far for a crowd to throw at
  crowdR: 60,       // px: a crowd = enemies within this of one another
  landSelf: 20,     // the thrown unit takes this when it lands (the shared landing bump included)
  landHit: 15,      // whoever it lands on takes this (+ knocked down)
  pose: 0.4,        // s of the throw pose
};
let _tu = null, _tmax = 0;
function okGrab(u, o) { return liftable(o, _tmax); }
function grab(w, u, bag, v) {
  bag.ph = 1; bag.vic = v.id; bag.t0 = w.time; bag.next = w.time + TH.every;
  u.b.victim = v.id;
  v.hurled = 1; v.target = -1; if (v.stun < TH.look + 0.3) v.stun = TH.look + 0.3;
  holding(w, u, bag, v, 0);
  act(w, u, ACT.GRAB);
  holdStep(w, u, bag, v);
  used(w, u, 'throw');
  say(w, 'throw', u, v.x, v.y, 0.3, 'baby', 'grab', 1);   // the giggle
}
function dropIt(w, u, bag, v) {   // let go where it hangs (holder hurt, victim taken)
  if (v) { letGo(w, v, 0.3); unheld(w, v.id); }
  if (u.b.victim === bag.vic && bag.vic >= 0) u.b.victim = -1;
  bag.ph = 0; bag.vic = -1; if (u.b.act === ACT.GRAB) act(w, u, 0);
}
function holdStep(w, u, bag, v) {
  const h = u.heading, r = u.radius * TH.hands;
  glue(v, u.x + Math.cos(h) * r, u.y + Math.sin(h) * r, u.radius * TH.holdUp, u.vx, u.vy);
  v.hurled = 1;
}
function throwIt(w, u, bag, v) {
  let tx, ty;
  const P = u.possessed === 1 ? w.possess : null;
  if (P && P.aimX === P.aimX && P.aimY === P.aimY) { tx = P.aimX; ty = P.aimY; }   // driven: at the mouse point ...
  else if (P) { const a = aimAngle(w, u); tx = u.x + Math.cos(a) * TH.throwMax * 0.7; ty = u.y + Math.sin(a) * TH.throwMax * 0.7; }   // ... or along the aim
  else if (thickestCrowd(w, u, u.x, u.y, TH.crowdScan, TH.crowdR, null, PT)) { tx = PT[0]; ty = PT[1]; }
  else { tx = u.x + Math.cos(u.heading) * TH.throwMin; ty = u.y + Math.sin(u.heading) * TH.throwMin; }
  let dx = tx - v.x, dy = ty - v.y; const d = hypot(dx, dy) || 0.001;
  const dist = Math.max(TH.throwMin, Math.min(TH.throwMax, d));
  dx /= d; dy /= d;
  if (u.b.victim === bag.vic) u.b.victim = -1;
  bag.ph = 2; bag.t0 = w.time; bag.vic = -1; act(w, u, ACT.THROW); u.face = u.heading = Math.atan2(dy, dx);
  v.hurled = 0; unheld(w, v.id);
  tossTo(w, v, dx, dy, dist, TH.throwUp);
  // the shared landing bump (8·impact/400) is part of the 20 it takes
  const k = 1 / Math.sqrt(Math.max(1, v.mass)), up = TH.throwUp * k, impact = Math.sqrt(up * up + 2 * GRAVITY * Math.max(0, v.z));
  flung(w, v, u, Math.max(0, TH.landSelf - 8 * impact / 400), TH.landHit);
  say(w, 'throw', u, u.x, u.y, 1.4, 'baby');
}
registerAbility({
  id: 'throw',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.vic = -1; initDrive(bag); },
  tick(w, u, bag) {
    if (bag.ph === 1) {
      const v = unitOf(w, bag.vic);
      if (!v || !(v.hp > 0) || v.inside >= 0 || u.hp <= 0 || u.inside >= 0 || u.hurled === 1 || stunned(u, 0.5)) { dropIt(w, u, bag, v); return; }
      holdStep(w, u, bag, v);
      if (w.time - bag.t0 >= TH.look) throwIt(w, u, bag, v);
    } else if (bag.ph === 2 && w.time - bag.t0 >= TH.pose) { bag.ph = 0; if (u.b.act === ACT.THROW) act(w, u, 0); }
  },
  busy(w, u, bag) { if (bag.ph !== 1) return false; setState(u, STATE.ENGAGE); return stand(u, bag, u.heading); },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.ph !== 0 || w.time < bag.next || !low(u) || stunned(u)) return false;
    const p = power(u), reach = TH.reach * p;
    _tmax = TH.mass * p * p;
    let v = liftable(t, _tmax) && d <= u.radius + t.radius + reach ? t : null;
    if (!v && u.possessed !== 1) v = nearestFoe(w, u, u.x, u.y, u.radius + reach, okGrab, null);
    if (!v) return false;
    u.heading = Math.atan2(v.y - u.y, v.x - u.x);
    grab(w, u, bag, v);
    return stand(u, bag, u.heading);
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph === 1) { u.goalX = 0; u.goalY = 0; } },
  holdsNerve(w, u, bag) { return bag.ph === 1; },
  onDeath(w, u, cause, killer, bag) { if (bag.ph === 1) dropIt(w, u, bag, unitOf(w, bag.vic)); },
});

// ================================================================ lasso (cowboy)
const LA = {
  every: 6,         // s between lassos
  mass: 6,          // lassoes units this light or lighter (× power²) ...
  min: 60,          // ... standing this far (× power) ...
  max: 200,         // ... up to this far (× power)
  slack: 50,        // px past max the victim may have got to while the rope flew: still caught
  ropeTime: 0.3,    // s the rope flies
  dragTime: 0.8,    // s dragging the victim in
  dragTo: 30,       // px from its middle: where the victim ends up (at least both radii + 6)
  dragHop: 5,       // px: the victim bumps along this high
  heldZ: 2,         // px: a dragged victim hangs this high (steering leaves it alone)
  tangled: 0.8,     // s the victim stays stunned after the drag
  scanEvery: 12,    // ticks between lasso target scans
};
function lassoable(o, p) { return liftable(o, LA.mass * p * p); }
function findLasso(w, u, t) {
  const p = power(u), lo = LA.min * p, hi = LA.max * p;
  if (t && lassoable(t, p)) {
    const d = hypot(t.x - u.x, t.y - u.y);
    if (d >= lo && d <= hi && clearLine(w, u)) return t;
  }
  const n = w.queryMask(u.x, u.y, hi, ENEMY[u.faction], RQ, RQ.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (o.dead || o === u || !lassoable(o, p) || (o.unseen > 0 && o.unseen < 1)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d < lo || d > hi || d >= bd) continue;
    if (w.walls.count > 0 && !w.walls.lineOfSight(u.x, u.y, o.x, o.y)) continue;
    bd = d; best = o;
  }
  return best;
}
function handX(u) { return u.x + Math.cos(u.heading) * u.radius; }
function handY(u) { return u.y + Math.sin(u.heading) * u.radius; }
function throwRope(w, u, bag, v) {
  bag.ph = 1; bag.vic = v.id; bag.t0 = w.time; bag.next = w.time + LA.every;
  u.b.victim = v.id;
  act(w, u, ACT.THROW); u.heading = Math.atan2(v.y - u.y, v.x - u.x);
  bag.lx = handX(u); bag.ly = handY(u); bag.lz = 8;
  used(w, u, 'lasso');
  say(w, 'throw', u, u.x, u.y, 0.6, 'cowboy', 'lasso', 1);   // lasso whoosh
}
function endRope(w, u, bag) {
  if (u.b.victim === bag.vic && bag.vic >= 0) u.b.victim = -1;
  bag.ph = 0; bag.vic = -1;
  if (u.b.act === ACT.THROW || u.b.act === ACT.GRAB) act(w, u, 0);
}
// the rope reaches: caught (still alive, free, near enough) -> drag; else it falls short
function ropeStep(w, u, bag) {
  const v = unitOf(w, bag.vic), p = power(u);
  if (stunned(u) || u.hurled === 1 || u.inside >= 0) { endRope(w, u, bag); return; }
  if (v) u.face = Math.atan2(v.y - u.y, v.x - u.x);
  const f = Math.min(1, (w.time - bag.t0) / LA.ropeTime), hx = handX(u), hy = handY(u);
  if (v) { bag.lx = hx + (v.x - hx) * f; bag.ly = hy + (v.y - hy) * f; bag.lz = 8 + 10 * Math.sin(Math.PI * f); }
  if (f < 1) return;
  if (!v || !lassoable(v, p) || hypot(v.x - u.x, v.y - u.y) > LA.max * p + LA.slack) { endRope(w, u, bag); return; }
  bag.ph = 2; bag.t0 = w.time; bag.x0 = v.x; bag.y0 = v.y;
  const d = hypot(v.x - u.x, v.y - u.y) || 1; bag.dx = (v.x - u.x) / d; bag.dy = (v.y - u.y) / d;
  v.hurled = 1; v.target = -1; if (v.stun < 0.3) v.stun = 0.3;
  holding(w, u, bag, v, 0);
  act(w, u, ACT.GRAB);
  say(w, 'strike', u, v.x, v.y, 0.5, 'cowboy', 'lasso', 1);
}
// dragged in: along the ground to `dragTo` px in front of it (where it faced at the catch), bumping along
function dragStep(w, u, bag) {
  const v = unitOf(w, bag.vic);
  if (!v || !(v.hp > 0) || v.inside >= 0 || u.hurled === 1 || u.inside >= 0) { if (v) { letGo(w, v, 0); unheld(w, v.id); } endRope(w, u, bag); return; }
  const f = Math.min(1, (w.time - bag.t0) / LA.dragTime), e = f * f * (3 - 2 * f);
  const R = Math.max(LA.dragTo, u.radius + v.radius + 6), fx = u.x + bag.dx * R, fy = u.y + bag.dy * R;
  setState(u, STATE.ENGAGE);
  glue(v, bag.x0 + (fx - bag.x0) * e, bag.y0 + (fy - bag.y0) * e, LA.heldZ + LA.dragHop * Math.sin(Math.PI * Math.min(1, f * 3)), 0, 0);
  v.hurled = 1;
  bag.lx = v.x; bag.ly = v.y; bag.lz = Math.max(0, v.z);
  if (f < 1) return;
  letGo(w, v, LA.tangled); v.z = 0; unheld(w, v.id);
  u.target = v.id;   // the weapon gets it now (the cowboy fired point blank)
  endRope(w, u, bag);
}
registerAbility({
  id: 'lasso',
  init(w, u, bag) { bag.ph = 0; bag.next = w.time + FIRST * w.rng(); bag.t0 = 0; bag.vic = -1; bag.x0 = 0; bag.y0 = 0; bag.dx = 0; bag.dy = 0; bag.lx = 0; bag.ly = 0; bag.lz = 0; initDrive(bag); },
  tick(w, u, bag) { if (bag.ph === 1) ropeStep(w, u, bag); else if (bag.ph === 2) dragStep(w, u, bag); },
  busy(w, u, bag) {
    if (bag.ph === 0) return false;
    setState(u, STATE.ENGAGE);
    return stand(u, bag, bag.ph === 2 ? Math.atan2(bag.dy, bag.dx) : u.face === u.face ? u.face : u.heading);
  },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.ph !== 0 || w.time < bag.next || !low(u) || stunned(u) || (w.tick + u.index) % LA.scanEvery !== 0) return false;
    const v = findLasso(w, u, t);
    if (!v) return false;
    throwRope(w, u, bag, v);
    return stand(u, bag, u.heading);
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph !== 0) { u.goalX = 0; u.goalY = 0; } },
  holdsNerve(w, u, bag) { return bag.ph !== 0; },
  onDeath(w, u, cause, killer, bag) {
    if (bag.ph === 2) { const v = unitOf(w, bag.vic); if (v) { letGo(w, v, 0.3); unheld(w, v.id); } }
    if (bag.ph !== 0) endRope(w, u, bag);
  },
});

// ================================================================ swallow (snake: strike() + carry + digest())
const SW = {
  weak: 0.35,       // swallows a unit at or below this share of its hp ...
  size: 1.9,        // ... whose radius is at most this × its own (the snake's rule) ...
  mass: 4,          // ... and light: mass at most this (× power²)
  reach: 20,        // px past both bodies (× power; the snake's strike reach is 12, a made unit's weapon reaches further)
  time: 0.8,        // s: the victim shrinks into the mouth
  shrink: 0.6,      // ... down to 40 % of its size
  heldZ: 7,         // px: up at the mouth (the snake's, low: animal / beast bodies)
  mouthUp: 1.7,     // × radius: a person's / giant's mouth height (it lifts the victim up to its face) ...
  frontUp: 0.45,    // ... and that far in front of its middle
  growBase: 1.04,   // radius × (1.04 + victim maxHp × 8e-4) per meal ...
  growPerHp: 8e-4,
  growMax: 1.5,     // ... up to ×1.5 its start radius
  hpGain: 0.5,      // + 0.5 × the victim's maxHp to its maxHp (and hp)
  massGain: 0.3,    // + 0.3 × the victim's mass (at most ×2.25 its start mass)
  every: 0.5,       // s between swallows
};
const UPRIGHT = { person: 1, giant: 1, animal: 0, beast: 0 };   // bodies that stand up (mouth high)
let _wmax = 0, _wsize = 0;
function swallowable(u, o) {
  return liftable(o, _wmax) && o.radius <= _wsize && o.hp <= SW.weak * o.maxHp && o.type !== 'snake' && !(o.climb > 0);
}
function startSwallow(w, u, bag, v) {
  bag.ph = 1; bag.vic = v.id; bag.t0 = w.time; bag.heldR = v.radius;
  u.b.victim = v.id;
  v.hurled = 1; v.perch = -1; v.climb = 0; v.hidden = 0; v.target = -1;
  holding(w, u, bag, v, v.radius);
  act(w, u, ACT.SWALLOW);
  u.heading = Math.atan2(v.y - u.y, v.x - u.x);
  used(w, u, 'swallow');
  say(w, 'strike', u, v.x, v.y, 1, 'snake', 'swallow', 1);
}
function spit(w, u, bag, v) {   // out at full size (the swallower was hurt / died / got lifted)
  if (v) { v.hurled = 0; v.radius = bag.heldR > 0 ? bag.heldR : v.def.radius; v.z = Math.max(v.z, 1); unheld(w, v.id); }
  if (u.b.victim === bag.vic && bag.vic >= 0) u.b.victim = -1;
  bag.ph = 0; bag.vic = -1; bag.next = w.time + SW.every;
  if (u.b.act === ACT.SWALLOW) act(w, u, 0);
}
function digest(w, u, bag, v) {
  const vMax = v.maxHp, g = SW.hpGain * vMax;
  u.maxHp += g; u.hp = Math.min(u.maxHp, u.hp + g);
  u.radius = Math.min(SW.growMax * bag.r0, u.radius * (SW.growBase + vMax * SW.growPerHp));
  u.mass = Math.min(bag.m0 * SW.growMax * SW.growMax, u.mass + SW.massGain * v.mass);
}
function swallowStep(w, u, bag) {
  const v = unitOf(w, bag.vic);
  if (!v || !(v.hp > 0) || u.hp <= 0 || u.hurled === 1 || u.inside >= 0 || u.z > A1.GROUNDED + 30) { spit(w, u, bag, v); return; }
  const f = Math.min(1, (w.time - bag.t0) / SW.time), up = UPRIGHT[u.def.maker ? u.def.maker.body : 'animal'] === 1;
  v.radius = bag.heldR * (1 - SW.shrink * f);
  // into the mouth: the snake's is at the ground (z 7); a person / giant lifts it up to its face over the first half
  const reach = (u.radius * (up ? SW.frontUp : 1) + v.radius) * (1 - SW.shrink * f);
  const mz = up ? u.radius * SW.mouthUp : SW.heldZ, z = SW.heldZ + (mz - SW.heldZ) * Math.min(1, 2 * f);
  v.x = u.x + Math.cos(u.heading) * reach; v.y = u.y + Math.sin(u.heading) * reach + 1;
  v.z = v.pz = Math.max(SW.heldZ, u.z + z); v.vx = 0; v.vy = 0; v.vz = 0; v.spin = 0;
  v.stun = Math.max(v.stun || 0, 0.3); v.hurled = 1;
  if (f < 1) return;
  digest(w, u, bag, v);
  v.radius = bag.heldR;   // its body (none: eaten) keeps its real size in the report
  unheld(w, v.id);
  if (u.b.victim === bag.vic) u.b.victim = -1;
  bag.ph = 0; bag.vic = -1; bag.next = w.time + SW.every;
  if (u.b.act === ACT.SWALLOW) act(w, u, 0);
  eat(w, u, v);   // dies whole (no body), the kill is the swallower's
}
registerAbility({
  id: 'swallow',
  init(w, u, bag) { bag.ph = 0; bag.vic = -1; bag.t0 = 0; bag.heldR = 0; bag.r0 = u.radius; bag.m0 = u.mass; bag.next = 0; initDrive(bag); },
  tick(w, u, bag) { if (bag.ph === 1) swallowStep(w, u, bag); },
  busy(w, u, bag) { if (bag.ph !== 1) return false; setState(u, STATE.ENGAGE); return stand(u, bag, u.heading); },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.ph !== 0 || w.time < bag.next || !low(u) || stunned(u)) return false;
    const p = power(u), reach = SW.reach * p;
    _wmax = SW.mass * p * p; _wsize = SW.size * u.radius;
    let v = swallowable(u, t) && d - u.radius - t.radius <= reach ? t : null;
    if (!v) v = nearestFoe(w, u, u.x, u.y, u.radius + reach, swallowable, null);
    if (!v) return false;
    startSwallow(w, u, bag, v);
    return stand(u, bag, u.heading);
  },
  possessMove(w, u, mx, my, firing, bag) { if (bag.ph === 1) { u.goalX = 0; u.goalY = 0; } },
  holdsNerve(w, u, bag) { return bag.ph === 1; },
  onDeath(w, u, cause, killer, bag) { if (bag.ph === 1) spit(w, u, bag, unitOf(w, bag.vic)); },
  // the weapon has to wear a foe down to 35 % first: start the light foes there (the made unit may die before)
  test: {
    setup(g, w, u, foes) { for (const f of foes) if (f.mass <= 4) f.hp = Math.min(f.hp, 0.3 * f.maxHp); },
  },
});

export { TH, LA, SW };
