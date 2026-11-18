// Snake (OG "Snake", game.js:16564-16857; body trail module 16858-17040). Owner: ANIMALS.
// Bites, swallows weakened units whole and grows with every meal. No venom anywhere in OG.
import { registerUnit } from '../../defs.js';
import {
  S, DT, fac, LOCO, INTEL, MAX_R, range, hyp, setState, getTarget, setTarget, unit, airborne, perchOf, hostile,
  ensure, hitAnim, dmg, push, sfx, hasWalls, lineOfSight, goTo, followIntel, roam, eat, nearestFrog, carryOnce, runCarry,
} from './lib.js';

const SWALLOW = 1;        // subState while a victim is in the mouth (OG game.js:16591)
const GROW_PER_HP = 8e-4; // radius growth per victim maxHp (OG game.js:16592)
const BITE = 14;          // bite × scale (OG game.js:16713)
const REACH = 12;         // strike when the gap is ≤ 12 px (OG game.js:16706)
const SWALLOW_TIME = 0.8; // victim shrinks into the mouth over 0.8 s (OG game.js:16776)
const REVENGE = 6;        // targets its attacker for 6 s (OG game.js:16687)
const TAU = Math.PI * 2;  // OG 392.a

// ---- body trail (OG module 617). Draw-only, but kept in sim as OG does. ----
const STEP = 3;           // px between trail points (OG game.js:16892)
const MAX_LEN = 640;      // body length cap (OG game.js:16893)
const CAP = Math.ceil(MAX_LEN / STEP) + 4; // ring size (OG game.js:16894, derived)
const MEALS = 4;          // meal bulges remembered (OG game.js:16897)
const DEAD_KEEP = 32;     // dead bodies kept for drawing (OG game.js:17027)
const LAY_LEN = 70, LAY_AMP = 7; // spawn layout: 70 px long, wave amplitude 7 (OG game.js:16670)
const scrX = new Float32Array(CAP), scrY = new Float32Array(CAP);

class Body {
  constructor() {
    this.xs = new Float32Array(CAP); this.ys = new Float32Array(CAP);
    this.head = 0; this.count = 0; this.length = 0;
    this.mealAt = new Float32Array(MEALS).fill(-1); this.mealSize = new Float32Array(MEALS);
    this.travelled = 0; this.weave = 0; this.sidle = 1;
  }
  // lay a fresh body behind the head along the heading, with a sine wave easing in over `ramp` px (OG game.js:16912-16927)
  layOut(x, y, heading, len, amp, waves = 1, ramp = 20) {
    this.length = len; this.count = 0; this.head = 0;
    const n = Math.min(CAP, Math.ceil(len / STEP) + 2);
    const k = (TAU * waves) / Math.max(len, 1), a0 = amp * k;
    let px = x, py = y; scrX[0] = px; scrY[0] = py;
    for (let q = 1; q < n; q++) {
      const s = (q - 0.5) * STEP, t = Math.min(1, s / Math.max(ramp, 0.001));
      const a = heading + a0 * Math.cos(k * s) * t * t * (3 - 2 * t);
      px -= Math.cos(a) * STEP; py -= Math.sin(a) * STEP; scrX[q] = px; scrY[q] = py;
    }
    for (let q = n - 1; q >= 0; q--) this.push(scrX[q], scrY[q]);
  }
  push(x, y) { this.head = (this.head + 1) % CAP; this.xs[this.head] = x; this.ys[this.head] = y; if (this.count < CAP) this.count++; }
  // head moved: drop points every 3 px; a jump over 40 px re-lays the body (OG game.js:16934-16940)
  track(x, y, heading) {
    if (this.count === 0) { this.layOut(x, y, heading, this.length, 0); return; }
    let hx = this.xs[this.head], hy = this.ys[this.head], d = Math.hypot(x - hx, y - hy);
    if (d > 40) { this.layOut(x, y, heading, this.length, 0); return; }
    while (d >= STEP) { hx += (x - hx) / d * STEP; hy += (y - hy) / d * STEP; this.push(hx, hy); d -= STEP; }
  }
  pointX(k) { return this.xs[(this.head - k + 2 * CAP) % CAP]; }
  pointY(k) { return this.ys[(this.head - k + 2 * CAP) % CAP]; }
  copyFrom(b) { this.xs.set(b.xs); this.ys.set(b.ys); this.head = b.head; this.count = b.count; this.length = b.length; this.mealAt.set(b.mealAt); this.mealSize.set(b.mealSize); }
  // remember a meal bulge in the oldest slot (OG game.js:16985-16989)
  swallowed(time, size) { let e = 0; for (let k = 1; k < MEALS; k++) if (this.mealAt[k] < this.mealAt[e]) e = k; this.mealAt[e] = time; this.mealSize[e] = size; }
}

// World registry (OG world.snakes, module 617 class v): living snakes, dead bodies for the renderer, and the
// body-repel query Horse/Cavalry use to flee snakes (OG 616.d, game.js:16834-16856; caller game.js:12842).
function snakes(w) {
  if (w.snakes) return w.snakes;
  const reg = {
    living: [],
    dead: [],
    // sum of (p − closest body point)/d² over snakes whose head or body is within r + snake radius; returns count
    repel(x, y, r, out) {
      let sx = 0, sy = 0, n = 0;
      const L = reg.living;
      for (let k = L.length - 1; k >= 0; k--) {
        const s = L[k];
        if (s.dead || s.removed) { L.splice(k, 1); continue; }
        if (s.hp <= 0 || !s.b.body || s.b.body.count === 0) continue;
        const body = s.b.body, reach = r + s.radius;
        let best = hyp(x - s.x, y - s.y);
        if (best > reach + body.length) continue;
        let bx = s.x, by = s.y;
        const m = Math.min(body.count, Math.ceil(body.length / STEP) + 1);
        for (let q = 0; q < m; q += 3) { // every 3rd point (OG game.js:16828, 16845)
          const px = body.pointX(q), py = body.pointY(q), d = hyp(x - px, y - py);
          if (d < best) { best = d; bx = px; by = py; }
        }
        if (best > reach) continue;
        const d = Math.max(best, 0.001);
        sx += (x - bx) / (d * d); sy += (y - by) / (d * d); n++;
      }
      out[0] = sx; out[1] = sy; return n;
    },
    // keep a copy of a dead snake's body, at most 32 (OG game.js:17021-17035)
    died(s, time) {
      const b = s.b.body; if (!b || b.count === 0) return;
      const rec = reg.dead.length >= DEAD_KEEP ? reg.dead.shift() : { body: new Body(), x: 0, y: 0, girth: 0, role: 0, time: 0 };
      rec.body.copyFrom(b); rec.x = s.x; rec.y = s.y; rec.girth = s.radius; rec.role = s.b.role || 0; rec.time = time;
      reg.dead.push(rec);
    },
  };
  w.snakes = reg;
  return reg;
}

const scale = (u) => u.radius / u.def.radius; // radius ÷ registry Snake radius (OG game.js:16819-16821)

// rotate a vector field pair on the unit by angle a (OG game.js:16812-16817)
function rotVel(u, a) { const c = Math.cos(a), s = Math.sin(a), x = u.vx; u.vx = x * c - u.vy * s; u.vy = x * s + u.vy * c; }
function rotGoal(u, a) { const c = Math.cos(a), s = Math.sin(a), x = u.goalX; u.goalX = x * c - u.goalY * s; u.goalY = x * s + u.goalY * c; }
// sideways weave: velocity and goal turn by 0.7·sin(travelled/(12r)·2π + 1.7i), change capped 0.7 rad (OG game.js:16807-16811)
function weave(u) {
  const body = u.b.body;
  body.travelled += hyp(u.vx, u.vy) * DT;
  const a = 0.7 * Math.sin((body.travelled / (12 * u.radius)) * TAU + 1.7 * u.index);
  rotVel(u, Math.max(-0.7, Math.min(0.7, a - body.weave)));
  body.weave = a;
  rotGoal(u, a);
}

// who can be swallowed (OG game.js:16717-16733)
function canSwallow(u, v) {
  const d = v.def;
  return !v.dead && !v.removed && v.hp > 0 && v.hurled !== 1 && v.type !== 'snake' && v.radius <= 1.9 * u.radius &&
    !d.prop && !d.boss && !d.untossable && !((v.climb || 0) > 0) && !airborne(v);
}
// spit the victim out at full size (OG game.js:16822-16827)
function spit(u, v) {
  v.hurled = 0;
  v.radius = u.b.heldR > 0 ? u.b.heldR : v.def.radius;
  v.z = Math.max(v.z, 1);
}

// bite or swallow (OG game.js:16707-16748)
function strike(w, u, v) {
  hitAnim(u);
  u.cooldown = 0.7 * range(w, 0.85, 1.15); // OG game.js:16710
  const body = u.b.body; body.sidle = -body.sidle; // OG game.js:16711-16712
  const n = BITE * scale(u);
  if ((v.hp <= 0.35 * v.maxHp || v.hp <= n) && canSwallow(u, v)) { // OG game.js:16715
    u.subState = SWALLOW; u.b.link = v.id; u.b.linkAt = w.time; u.b.heldR = v.radius; v.hurled = 1; // OG game.js:16735-16739
    v.perch = -1; v.climb = 0; v.hidden = 0; // clear any perch (OG 412.r, game.js:9061)
    return;
  }
  const o = perchOf(w, v), dx = o.x - u.x, dy = o.y - u.y, d = hyp(dx, dy) || 1;
  const m = dmg(w, o, n, u);
  push(w, o, dx / d, dy / d, 40 * m, 0.1); // OG game.js:16747
  sfx(w, 'strike', u.x, u.y, { power: scale(u), type: u.type });
}
// on cooldown in reach: circle-strafe at 0.4 × walk, in/out by the gap (OG game.js:16750-16758)
function circle(u, dx, dy, gap) {
  const d = hyp(dx, dy) || 1, sp = 0.4 * u.def.walkSpeed, s = u.b.body.sidle;
  const k = gap < 3 ? -1 : Math.max(-1, Math.min(1, (gap - 7) / 4));
  u.goalX = (-dy * s / d + dx / d * k) * sp;
  u.goalY = (dx * s / d + dy / d * k) * sp;
  weave(u);
}

// digest: longer, tougher, bigger, heavier (OG game.js:16792-16800)
function digest(w, u, v) {
  const vMax = v.maxHp, body = u.b.body;
  body.length = Math.min(MAX_LEN, body.length + 12 + 0.15 * vMax); // OG game.js:16794
  const g = 0.5 * vMax; // OG game.js:16795
  u.maxHp += g; u.hp = Math.min(u.maxHp, u.hp + g);
  u.radius = Math.min(3 * u.def.radius, MAX_R, u.radius * (1.04 + vMax * GROW_PER_HP)); // OG game.js:16797-16798
  u.mass += 0.3 * v.mass; // OG game.js:16799
  body.swallowed(w.time, Math.min(0.9, (v.def.radius / u.radius) * 0.6)); // OG game.js:16800
}

// every tick: track the body; while swallowing pull the victim in and digest it (OG game.js:16770-16805)
const carry = carryOnce(function (w, u) {
  u.b.body.track(u.x, u.y, u.heading);
  if (u.subState !== SWALLOW) return;
  let v = unit(w, u.b.link); if (v && v.hp <= 0) v = null;
  if (!v || u.hp <= 0 || u.hurled === 1 || airborne(u)) { if (v) spit(u, v); u.subState = 0; return; }
  const p = Math.min(1, (w.time - u.b.linkAt) / SWALLOW_TIME);
  v.radius = u.b.heldR * (1 - 0.6 * p); // shrinks to 40 %
  const reach = (u.radius + v.radius) * (1 - 0.6 * p);
  v.x = u.x + Math.cos(u.heading) * reach;
  v.y = u.y + Math.sin(u.heading) * reach + 1;
  v.z = v.pz = 7; v.vx = v.vy = v.vz = 0; v.spin = 0;
  v.stun = Math.max(v.stun || 0, 0.3);
  if (p < 1) return;
  digest(w, u, v);
  eat(w, u, v);
  u.subState = 0;
});

function brain(w, u) {
  runCarry(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === SWALLOW) { setState(u, S.ENGAGE); return; } // OG game.js:16690-16692
  if (u.stun > 0) return;
  // revenge target for 6 s after a hit, else the normal target (OG game.js:16694-16697)
  const rv = unit(w, u.lastVictim);
  let t = (w.time < (u.b.timer || 0) && rv && rv.hp > 0) ? rv : getTarget(w, u);
  if (t && t === rv) setTarget(u, t);
  if (t && t.hurled === 1) t = null;
  if (!t) t = nearestFrog(w, u.x, u.y, u.def.sightRange); // OG game.js:16698
  if (t && t.hurled === 1) t = null;
  if (!t && followIntel(w, u, u.def.runSpeed, 5)) { setState(u, S.ADVANCE); weave(u); return; } // OG game.js:16700
  if (!t) { setState(u, S.IDLE); roam(w, u, 0.6 * u.def.walkSpeed, 40); weave(u); return; } // OG game.js:16702
  const dx = t.x - u.x, dy = t.y - u.y, gap = hyp(dx, dy) - u.radius - t.radius;
  u.face = Math.atan2(dy, dx);
  setState(u, S.CHARGE);
  if (gap <= REACH) { if (u.cooldown <= 0) strike(w, u, t); else circle(u, dx, dy, gap); return; }
  goTo(w, u, t.x, t.y, u.def.runSpeed, !hasWalls(w) || lineOfSight(w, u.x, u.y, t.x, t.y)); // OG game.js:16760-16768
  weave(u);
}

registerUnit({
  type: 'snake',
  og: 'Snake', // OG game.js:16597
  category: 'animals', // OG game.js:16598
  faction: fac('Snakes'), // OG game.js:16599
  swims: true, // OG game.js:16600
  waterPace: 1.2, // OG game.js:16601
  radius: 5.5, // OG game.js:16602
  radiusJitter: 0.08, // OG game.js:16603
  mass: 0.8, // OG game.js:16604
  density: 0.6, // OG game.js:16605
  maxHp: 70, // OG game.js:16606
  melee: true, // OG game.js:16607
  strength: 0.7, // OG game.js:16608
  locomotion: LOCO.Holonomic, // OG game.js:16609
  walkSpeed: 63, // OG game.js:16610
  runSpeed: 158, // OG game.js:16611
  maxSpeed: 195, // OG game.js:16612
  accel: 750, // OG game.js:16613
  decel: 750, // OG game.js:16614
  turnRate: 6, // OG game.js:16615
  turnSpeedFalloff: Infinity, // OG game.js:16616
  sightRange: 320, // OG game.js:16617
  alertSightRange: 380, // OG game.js:16618
  stickyTarget: true, // OG game.js:16619
  reactionTime: 0.15, // OG game.js:16620
  huntRange: 600, // OG game.js:16621
  minDistance: 0, // OG game.js:16622
  drilled: false, // OG game.js:16623
  intelligence: INTEL.Animal, // OG game.js:16624
  infectable: false, // OG game.js:16625
  flammability: 0.5, // OG game.js:16626
  lowLying: true, // OG game.js:16627
  brushSpacing: 38, // OG game.js:16628
  flock: {
    personalSpace: 1.2, // OG game.js:16630
    separation: 30, // OG game.js:16631
    alignment: 0, // OG game.js:16632
    cohesion: 0, // OG game.js:16633
    formation: 0, // OG game.js:16634
    herd: 0, // OG game.js:16635
    herdSpacing: 0, // OG game.js:16636
    flockByState: [0, 0, 0, 0, 0, 0], // OG game.js:16637
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:16638
  },
  morale: {
    baseline: 0.9, // OG game.js:16641
    oddsWeight: 0.1, // OG game.js:16642
    fearWeight: 0.03, // OG game.js:16643
    casualtyWeight: 0.05, // OG game.js:16644
    woundWeight: 0.3, // OG game.js:16645
    hitShock: 0.02, // OG game.js:16646
    suppression: 0, // OG game.js:16647
    canBreak: false, // OG game.js:16648
    breakAt: 0.15, // OG game.js:16649
    rallyAt: 0.5, // OG game.js:16650
    minFleeTime: 3, // OG game.js:16651
    dropRate: 2, // OG game.js:16652
    recoverRate: 0.1, // OG game.js:16653
    panicFear: 0.2, // OG game.js:16654
    deathFear: 0.2, // OG game.js:16655
  },
  look: {
    attack: {
      time: 0.3, // OG game.js:16663
    },
  },
  // OG game.js:16665-16671: no link, role 0, cooldown 0.7 × rng, body laid out 70 px behind the head
  init(w, u) {
    ensure(u);
    u.b.link = -1; u.b.role = 0; u.b.timer = 0; u.b.linkAt = 0; u.b.heldR = 0;
    u.cooldown = 0.7 * w.rng();
    u.b.body = new Body();
    u.b.body.layOut(u.x, u.y, u.heading, LAY_LEN, LAY_AMP);
    snakes(w).living.push(u);
  },
  // paint stroke sets the heading: re-lay the body along it (OG game.js:16672-16675)
  faceStroke(w, u) { u.b.body.layOut(u.x, u.y, u.heading, LAY_LEN, LAY_AMP); },
  // spit out a victim mid-swallow; keep the body for drawing unless eaten (OG game.js:16676-16681)
  onDeath(w, u) {
    if (u.subState === SWALLOW) { const v = unit(w, u.b.link); if (v) spit(u, v); }
    u.subState = 0;
    if (u.eaten !== 1) snakes(w).died(u, w.time);
  },
  // a hostile attacker becomes the revenge target for 6 s (OG game.js:16682-16688)
  onHit(w, u, amount, att) {
    if (!att || att.dead || att.removed || !hostile(u, att)) return;
    u.lastVictim = att.id; u.b.timer = w.time + REVENGE;
  },
  brain,
  carry,
});
