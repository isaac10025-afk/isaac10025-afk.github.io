// Cheetah (OG "Cheetah", game.js:18495-18803). Owner: ANIMALS.
// Stalks unseen (def.stalk, read by conceal), circles behind its prey, sprints at 380 px/s, pounces, mauls, then recovers.
import { registerUnit } from '../../defs.js';
import {
  S, fac, LOCO, INTEL, hyp, setState, getTarget, unit, perchOf, isUndead, ensure, hitAnim, dmg, push, stun, infect, sfx,
  hasWalls, lineOfSight, goTo, flee, roam, carryOnce, runCarry,
} from './lib.js';

const SPRINT = 380;     // sprint speed = maxSpeed (OG game.js:18520)
const BACK_OFF = 150;   // recover back-off speed (OG game.js:18521)
const SPRINTING = 1;    // subStates (OG game.js:18522-18524); 2 = maul
const MAUL = 2;         // derived (literal 2 in OG game.js:18614)
const RECOVER = 3;      // OG game.js:18523
const POUNCE = 4;       // OG game.js:18524
const MISS_SLOW = 0.3;  // a missed pounce keeps 30 % speed (OG game.js:18776)

const victimOf = (w, u) => { const v = unit(w, u.lastVictim); return v && v.hp > 0 ? v : null; }; // OG game.js:18728-18732
function zInfect(w, u, v, m) { if (isUndead(u)) infect(w, v, u, 0.5 * m, 0); } // OG game.js:18792-18794

// hunt over: back off for 2.5 s (OG game.js:18795-18802)
function recover(w, u) {
  if (u.subState === POUNCE) u.leaping = 0;
  u.subState = RECOVER;
  u.b.timer = w.time + 2.5;
  u.lastVictim = -1;
  setState(u, S.IDLE);
}

// contact strike (OG game.js:18777-18791)
function strike(w, u, v, nx, ny, pounced) {
  const o = perchOf(w, v);
  hitAnim(u);
  sfx(w, 'strike', o.x, o.y, { power: 1, type: u.type });
  if (o !== v || v.mass >= 3) { // up a tree or heavy: one blow, then recover (OG game.js:18780-18782)
    const m = dmg(w, o, 20, u);
    zInfect(w, u, o, m);
    push(w, o, nx, ny, 60 * m, 0.15 * m);
    recover(w, u); return;
  }
  // pounce: 25 from the victim's own spot (beats shields); else 15 (OG game.js:18784)
  const m = pounced ? dmg(w, v, 25, u, undefined, v.x, v.y) : dmg(w, v, 15, u);
  zInfect(w, u, v, m);
  if (m < 0.5 || v.hp <= 0) { push(w, v, nx, ny, 120 * m * 0.5, 0.2); recover(w, u); return; } // OG game.js:18785
  push(w, v, nx, ny, 120, 1.25); // OG game.js:18786
  u.subState = MAUL; u.b.timer = w.time + 0.95; u.cooldown = 0.3; // OG game.js:18787-18789
  setState(u, S.ENGAGE);
}

// pounce leap: flight time clamp(d/330, 0.22, 0.36), lands 0.5 r short of the predicted spot (OG game.js:18749-18766)
function pounce(w, u, v, d) {
  const t = Math.min(0.36, Math.max(0.22, d / 330));
  const px = v.x + v.vx * t, py = v.y + v.vy * t, cx = px - u.x, cy = py - u.y, dd = hyp(cx, cy) || 0.001;
  const f = Math.max(0, dd - 0.5 * v.radius);
  u.vx = cx / dd * f / t; u.vy = cy / dd * f / t;
  u.heading = Math.atan2(cy, cx); u.face = u.heading;
  u.leaping = 1; u.subState = POUNCE; u.hopStart = w.time; u.b.timer = w.time + t;
}

// sprint toward the victim's predicted spot (OG game.js:18733-18774)
function sprint(w, u) {
  const v = victimOf(w, u);
  if (!v || w.time >= u.b.timer) { recover(w, u); return; }
  const dx = v.x - u.x, dy = v.y - u.y, d = hyp(dx, dy) || 0.001;
  if (d <= u.radius + v.radius + 6) { strike(w, u, v, dx / d, dy / d, false); return; } // OG game.js:18741
  if (u.b.pounce === 1 && d >= 45 && d <= 95 && v.mass <= 1.5 && !((v.climb || 0) > 0) && (u.los === 1 || !hasWalls(w))) { // OG game.js:18743-18748
    pounce(w, u, v, d); return;
  }
  const lead = Math.min(0.35, d / SPRINT); // OG game.js:18768
  const lx = dx + v.vx * lead, ly = dy + v.vy * lead, m = hyp(lx, ly) || 0.001;
  if (u.los === 0 && hasWalls(w)) goTo(w, u, v.x, v.y, SPRINT, false);
  else { u.goalX = lx / m * SPRINT; u.goalY = ly / m * SPRINT; }
}

// maul: pin the victim, 30 damage every 0.3 s from its own spot until 0.95 s pass (OG game.js:18617-18632)
function maul(w, u) {
  const v = victimOf(w, u);
  if (!v || w.time >= u.b.timer) { recover(w, u); return; }
  const dx = v.x - u.x, dy = v.y - u.y, d = hyp(dx, dy) || 0.001;
  stun(w, v, 0.25);
  u.face = Math.atan2(dy, dx);
  if (d > u.radius + v.radius + 2) { u.goalX = dx / d * u.def.runSpeed; u.goalY = dy / d * u.def.runSpeed; }
  if (u.cooldown > 0) return;
  const m = dmg(w, v, 30, u, undefined, v.x, v.y);
  zInfect(w, u, v, m);
  sfx(w, 'strike', v.x, v.y, { power: 0.8, type: u.type });
  hitAnim(u);
  u.cooldown = 0.3;
}

// recover: back away from the threat, or from the target when it is within a 240 px gap (OG game.js:18633-18651)
function backOff(w, u, t) {
  let hx = -(u.threatX || 0), hy = -(u.threatY || 0);
  if (hx * hx + hy * hy < 1e-6) {
    if (!t) return;
    hx = u.x - t.x; hy = u.y - t.y;
    if (hyp(hx, hy) - u.radius - t.radius > 240) return;
  }
  const d = hyp(hx, hy) || 0.001;
  u.goalX = hx / d * BACK_OFF; u.goalY = hy / d * BACK_OFF;
}

// 3+ of the target's own faction within 60 px of it (count includes it, capped at 4) (OG game.js:18671-18676)
function crowded(w, t) {
  let n = 0;
  w.query(t.x, t.y, 60, (o) => { if (o.faction === t.faction && !o.dead) { n++; if (n >= 4) return true; } });
  return n - 1 >= 3;
}

function brain(w, u) {
  runCarry(w, u);
  const now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { if (u.stun > 0.3 && (u.subState === SPRINTING || u.subState === MAUL)) recover(w, u); return; } // OG game.js:18606
  const t = getTarget(w, u);
  if (u.state === S.FLEE) { flee(w, u, t, u.def.runSpeed); return; } // OG game.js:18608
  switch (u.subState) {
    case POUNCE: return;
    case SPRINTING: sprint(w, u); return;
    case MAUL: maul(w, u); return;
    case RECOVER:
      if (now < u.b.timer) { backOff(w, u, t); return; }
      u.subState = 0;
  }
  if (!t) { setState(u, S.IDLE); roam(w, u, u.def.walkSpeed, 40); return; } // OG game.js:18653
  const dx = t.x - u.x, dy = t.y - u.y, d = hyp(dx, dy) || 0.001;
  const clear = u.los === 1 || !hasWalls(w);
  const fleeing = t.state === S.FLEE;
  const hx = Math.cos(t.heading), hy = Math.sin(t.heading);
  const behind = -(dx * hx + dy * hy) / d <= -0.25; // target faces away (OG game.js:18661)
  const stalkable = !fleeing && d > 170 && t.target !== u.id && !(u.state === S.ALERT && u.stateTime > 12); // OG game.js:18662
  const approaching = (t.vx * -dx + t.vy * -dy) / d > 30; // OG game.js:18663
  const closeAlert = u.state === S.ALERT && d <= 200; // OG game.js:18664
  if (clear && (behind || !stalkable || (approaching && closeAlert)) &&
      (closeAlert || (d <= (fleeing ? 380 : 280) && (fleeing || !crowded(w, t))))) { // OG game.js:18665-18676
    u.subState = SPRINTING; u.b.timer = now + 3; u.lastVictim = t.id; // OG game.js:18681-18684
    u.b.pounce = w.rng() < 0.35 ? 1 : 0; // OG game.js:18685
    setState(u, S.CHARGE);
    sfx(w, 'charge', u.x, u.y, { type: u.type });
    sprint(w, u); return;
  }
  if (d <= 420) { // stalking (OG game.js:18691-18706)
    setState(u, S.ALERT);
    u.face = Math.atan2(dy, dx);
    if (stalkable && !behind && approaching) { u.goalX = u.goalY = 0; return; } // freeze
    if (stalkable && !behind) { // circle toward the target's back
      const a0 = Math.atan2(-dy, -dx), back = Math.atan2(-hy, -hx);
      let df = back - a0; df = Math.atan2(Math.sin(df), Math.cos(df));
      const a = a0 + Math.sign(df) * Math.min(Math.abs(df), 0.7); // OG game.js:18698
      const r = Math.max(230, Math.min(d, 315)); // OG game.js:18699
      const px = Math.min(w.W, Math.max(0, t.x + Math.cos(a) * r)), py = Math.min(w.H, Math.max(0, t.y + Math.sin(a) * r));
      goTo(w, u, px, py, 120, !hasWalls(w) || lineOfSight(w, u.x, u.y, px, py)); // OG game.js:18703
      return;
    }
    goTo(w, u, t.x, t.y, 65, clear); // creep in (OG game.js:18705)
    return;
  }
  setState(u, S.ADVANCE);
  goTo(w, u, t.x, t.y, 95, clear); // OG game.js:18707
}

// pounce landing: strike if within r + r + 10, else a miss (OG game.js:18709-18719)
const carry = carryOnce(function (w, u) {
  if (u.subState !== POUNCE || w.time < u.b.timer) return;
  u.leaping = 0;
  const v = victimOf(w, u);
  const dx = v ? v.x - u.x : 0, dy = v ? v.y - u.y : 0, d = hyp(dx, dy) || 0.001;
  if (v && d <= u.radius + v.radius + 10) { strike(w, u, v, dx / d, dy / d, true); return; }
  u.vx *= MISS_SLOW; u.vy *= MISS_SLOW;
  sfx(w, 'dust', u.x, u.y, { angle: u.heading, size: 0.8 });
  recover(w, u);
});

registerUnit({
  type: 'cheetah',
  og: 'Cheetah', // OG game.js:18528
  category: 'animals', // OG game.js:18529
  faction: fac('Cheetahs'), // OG game.js:18530
  radius: 12.7, // OG game.js:18531
  radiusJitter: 0.08, // OG game.js:18532
  mass: 1.6, // OG game.js:18533
  density: 1.2, // OG game.js:18534
  maxHp: 170, // OG game.js:18535
  melee: true, // OG game.js:18536
  strength: 0.9, // OG game.js:18537
  locomotion: LOCO.Vehicle, // OG game.js:18538
  walkSpeed: 45, // OG game.js:18539
  runSpeed: 170, // OG game.js:18540
  maxSpeed: 380, // OG game.js:18541 (x = 380 at game.js:18520)
  accel: 950, // OG game.js:18542
  decel: 700, // OG game.js:18543
  turnRate: 9, // OG game.js:18544
  turnSpeedFalloff: 110, // OG game.js:18545
  sightRange: 460, // OG game.js:18546
  alertSightRange: 520, // OG game.js:18547
  stickyTarget: false, // OG game.js:18548
  reactionTime: 0.3, // OG game.js:18549
  huntRange: Infinity, // OG game.js:18550
  minDistance: 0, // OG game.js:18551
  drilled: false, // OG game.js:18552
  intelligence: INTEL.Animal, // OG game.js:18553
  infectable: true, // OG game.js:18554
  flammability: 0.7, // OG game.js:18555
  stalk: 90, // OG game.js:18556
  predator: true, // OG game.js:18557
  iceGrip: 0.6, // OG game.js:18558
  brushSpacing: 38.6, // OG game.js:18559
  flock: {
    personalSpace: 1.3, // OG game.js:18561
    separation: 40, // OG game.js:18562
    alignment: 0.1, // OG game.js:18563
    cohesion: 0.1, // OG game.js:18564
    formation: 0, // OG game.js:18565
    herd: 0.3, // OG game.js:18566
    herdSpacing: 14, // OG game.js:18567
    idleSpread: 2, // OG game.js:18568
    flockByState: [1, 0.3, 0.1, 0.2, 0, 0.4], // OG game.js:18569
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:18570
  },
  morale: {
    baseline: 0.85, // OG game.js:18573
    oddsWeight: 0.45, // OG game.js:18574
    fearWeight: 0.05, // OG game.js:18575
    casualtyWeight: 0.1, // OG game.js:18576
    woundWeight: 0.25, // OG game.js:18577
    hitShock: 0.03, // OG game.js:18578
    suppression: 0, // OG game.js:18579
    canBreak: true, // OG game.js:18580
    breakAt: 0.3, // OG game.js:18581
    rallyAt: 0.45, // OG game.js:18582
    minFleeTime: 2.5, // OG game.js:18583
    dropRate: 3, // OG game.js:18584
    recoverRate: 0.35, // OG game.js:18585
    panicFear: 0.1, // OG game.js:18586
    deathFear: 0.2, // OG game.js:18587
  },
  look: {
    fur: true, // OG game.js:18591
    attack: {
      time: 0.3, // OG game.js:18596
    },
  },
  // OG game.js:18598-18601
  init(w, u) {
    ensure(u);
    u.subState = 0; u.b.timer = 0; u.b.pounce = 0; u.lastVictim = -1; u.wander = u.heading;
    if (u.leaping === undefined) u.leaping = 0;
    if (u.hopStart === undefined) u.hopStart = 0;
  },
  // can't break while sprinting, mauling or pouncing (OG game.js:18720-18723)
  holdsNerve(w, u) { const s = u.subState; return s === SPRINTING || s === MAUL || s === POUNCE; },
  // a single hit of ≥ 30 % maxHp breaks off a maul (OG game.js:18724-18727)
  onHit(w, u, amount) { if (u.subState === MAUL && amount >= 0.3 * u.maxHp) recover(w, u); },
  brain,
  carry,
});
