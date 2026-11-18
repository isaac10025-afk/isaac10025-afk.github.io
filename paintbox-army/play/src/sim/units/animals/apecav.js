// Ape Cavalry: an Ape riding a loose horse (OG "Ape Cavalry", game.js:13076-13087 = {...Cavalry, overrides}). Owner: ANIMALS.
// Brain is our own port of the shared Cavalry brain (OG game.js:12716-12780) with Ape as the rider (OG C(), game.js:12821-12831).
import { registerUnit, getRisenType } from '../../defs.js';
import * as DMG from '../../combat/damage.js';
import * as DEATH from '../../combat/death.js';
import {
  S, fac, LOCO, INTEL, range, hyp, setState, getTarget, perchOf, isUndead, ensure, hitAnim,
  dmg, push, toss, lightUp, sfx, hasWalls, hasWater, wetAt, goTo, followIntel, flee, trample, startled,
} from './lib.js';

const FULL = 290; // OG game.js:12627 (N: trample full speed, charge speed)
// trample spec (OG P, game.js:12628-12639)
const TRAMPLE = {
  fullSpeed: FULL, // = N (see FULL above)
  minSpeed: 130, // OG game.js:12630
  damage: 55, // OG game.js:12631
  knockback: 180, // OG game.js:12632
  stun: 0.6, // OG game.js:12633
  tossChance: 0.3, // OG game.js:12634
  tossUp: 470, // OG game.js:12635
  tossSpeed: 190, // OG game.js:12636
  slowdown: 0.72, // OG game.js:12637
  infectChance: 0.5, // OG game.js:12638
};
const FEAR_R = 50; // OG game.js:12833
const FEAR_R_FLEE = 130; // OG game.js:12834
const FEAR_THROW = 0.5; // OG game.js:12835
const ROLE_FEAR = 2; // OG game.js:12836
const BURN_THROW = 0.75; // OG game.js:12722
const MELEE_DMG = 32; // OG game.js:12875
const SNAKE_STRIDE = 3; // OG game.js:16829 (R: body points checked every 3rd)
const SNAKE_SPACING = 3; // OG game.js:16892 (617.c: body point spacing px)

let WALK = 75, RUN = 150;
const fearVec = new Float32Array(2), fearVec2 = new Float32Array(2);
const notProp = (o) => !o.def.prop; // startled mask: every non-prop unit, own side included (OG V, game.js:12990)

const def = registerUnit({
  type: 'apecav',
  og: 'Ape Cavalry', // OG game.js:13080
  mines: false, // OG game.js:13081
  category: 'animals', // OG game.js:13082
  faction: fac('Apes'), // OG game.js:13083
  unpaintable: true, // OG game.js:13084
  conductivity: 1, // OG game.js:13085
  skittish: true, // OG game.js:12662
  radius: 13.5, // OG game.js:12663
  radiusJitter: 0.06, // OG game.js:12664
  mass: 4.5, // OG game.js:12665
  iceGrip: 0.05, // OG game.js:12666
  density: 2, // OG game.js:12667
  maxHp: 200, // OG game.js:12669
  melee: true, // OG game.js:12670
  strength: 1.8, // OG game.js:12671
  locomotion: LOCO.Vehicle, // OG game.js:12672
  walkSpeed: 75, // OG game.js:12673
  runSpeed: 150, // OG game.js:12674
  maxSpeed: 300, // OG game.js:12675
  accel: 340, // OG game.js:12676
  decel: 340, // OG game.js:12677
  turnRate: 3, // OG game.js:12678
  turnSpeedFalloff: 70, // OG game.js:12679
  sightRange: 380, // OG game.js:12680
  alertSightRange: 420, // OG game.js:12681
  stickyTarget: true, // OG game.js:12682
  reactionTime: 0.25, // OG game.js:12683
  huntRange: Infinity, // OG game.js:12684
  minDistance: 0, // OG game.js:12685
  drilled: false, // OG game.js:12686
  intelligence: INTEL.Animal, // OG game.js:12687
  infectable: true, // OG game.js:12689
  turnsWhenKilled: true, // OG game.js:12690
  flammability: 0.4, // OG game.js:12691
  brushSpacing: 34, // OG game.js:12692
  bodyShape: 'Horse', // OG game.js:12781
  flock: {
    personalSpace: 1.2, // OG game.js:12694
    separation: 40, // OG game.js:12695
    alignment: 0.35, // OG game.js:12696
    cohesion: 0.1, // OG game.js:12697
    formation: 0.8, // OG game.js:12698
    herd: 0, // OG game.js:12699
    herdSpacing: 0, // OG game.js:12700
    flockByState: [1, 1, 0.2, 1, 0.3, 0], // OG game.js:12701
    formationByState: [1, 1, 0, 1, 0, 0], // OG game.js:12702
  },
  morale: {
    baseline: 0.9, // OG game.js:12641
    oddsWeight: 0.25, // OG game.js:12642
    fearWeight: 0.05, // OG game.js:12643
    casualtyWeight: 0.3, // OG game.js:12644
    woundWeight: 0.3, // OG game.js:12645
    hitShock: 0.02, // OG game.js:12646
    suppression: 0.01, // OG game.js:12647
    canBreak: true, // OG game.js:12648
    breakAt: 0.18, // OG game.js:12649
    rallyAt: 0.5, // OG game.js:12650
    minFleeTime: 2.5, // OG game.js:12651
    dropRate: 2, // OG game.js:12652
    recoverRate: 0.3, // OG game.js:12653
    panicFear: 0.3, // OG game.js:12654
    deathFear: 0.5, // OG game.js:12655
  },
  look: {
    attack: {
      time: 0.35, // OG game.js:12711
      kick: -2.5, // OG game.js:12711
    },
  },
  init(w, u) {
    ensure(u);
    u.cooldown = 1 * w.rng(); // OG game.js:12714
    u.b.role = 0; u.b.timer = 0; // OG generic role/timer start at 0
  },
  brain,
  onDeath,
});
WALK = def.walkSpeed; RUN = def.runSpeed;

// rider type for this mount (OG C, game.js:12821-12831): Ape, or Zombie Ape for the zombie form
function riderType(u) { return isUndead(u) ? (getRisenType('ape') ?? 'ape') : 'ape'; }
function canTrample(w, u, sp) { return sp >= TRAMPLE.minSpeed && !wetAt(w, u); }

// ---------- brain (OG game.js:12716-12780) ----------
function brain(w, u) {
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) return; // OG game.js:12718
  const b = u.b, sp = hyp(u.vx, u.vy), tgt = getTarget(w, u), undead = isUndead(u);
  if (u.burning > 0 && !undead) { // OG game.js:12721-12726: first time burning, 75% the rider is thrown
    if (b.role === 0) { b.role = 1; if (w.rng() < BURN_THROW) { throwRider(w, u); return; } }
    setState(u, S.FLEE); flee(w, u, tgt, RUN);
    if (canTrample(w, u, sp)) trample(w, u, sp, TRAMPLE);
    return;
  }
  if (startled(w, u, RUN)) { if (canTrample(w, u, sp)) trample(w, u, sp, TRAMPLE, notProp); return; } // OG game.js:12727-12728
  if (!undead && ratSnakeFear(w, u, RUN)) { // OG game.js:12729-12733: first time, 50% the rider is thrown
    if (b.role !== ROLE_FEAR) { b.role = ROLE_FEAR; if (w.rng() < FEAR_THROW) { throwRider(w, u); return; } }
    if (canTrample(w, u, sp)) trample(w, u, sp, TRAMPLE);
    return;
  }
  b.role = 0; // OG game.js:12734
  if (u.state === S.FLEE) { flee(w, u, tgt, RUN); return; }
  if (u.subState !== 0) { // ride-through (1) / back-off (2) (OG game.js:12735-12746)
    if (w.time < b.timer) {
      if (u.subState === 1) { u.goalX = Math.cos(u.heading) * FULL; u.goalY = Math.sin(u.heading) * FULL; }
      else if (tgt) {
        const ax = u.x - tgt.x, ay = u.y - tgt.y, o = hyp(ax, ay) || 1;
        u.goalX = ax / o * RUN; u.goalY = ay / o * RUN;
      }
      if (canTrample(w, u, sp)) trample(w, u, sp, TRAMPLE);
      return;
    }
    u.subState = 0;
  }
  if (!tgt) { // OG game.js:12747-12750
    if (followIntel(w, u, WALK, 5)) return;
    setState(u, S.IDLE); return;
  }
  const dx = tgt.x - u.x, dy = tgt.y - u.y, d = hyp(dx, dy) || 0.001, charging = u.state === S.CHARGE;
  const clear = u.los === 1 || !hasWalls(w);
  if (hasWater(w) && wetAt(w, u) && d <= 380) { // in water: wade in and melee (OG game.js:12756-12763)
    setState(u, S.ENGAGE); u.face = Math.atan2(dy, dx);
    if (d > u.radius + tgt.radius + 8) goTo(w, u, tgt.x, tgt.y, WALK, clear);
    else if (u.cooldown <= 0) melee(w, u, tgt, dx / d, dy / d);
    return;
  }
  if ((!charging && d > 240) || d > 380) { setState(u, S.ADVANCE); goTo(w, u, tgt.x, tgt.y, WALK, clear); return; } // OG game.js:12764-12768
  setState(u, S.CHARGE); // OG game.js:12769-12779
  const lead = Math.min(d / FULL, 0.4), lx = dx + tgt.vx * lead, ly = dy + tgt.vy * lead, A = hyp(lx, ly) || 0.001;
  u.goalX = lx / A * FULL; u.goalY = ly / A * FULL;
  if (canTrample(w, u, sp)) {
    if (trample(w, u, sp, TRAMPLE) > 0) { u.subState = 1; b.timer = w.time + 0.8 * range(w, 0.8, 1.25); } // OG game.js:12777
  } else if (u.cooldown <= 0 && d <= u.radius + tgt.radius + 10) melee(w, u, tgt, dx / d, dy / d); // OG game.js:12779
}

// melee blow (OG X, game.js:12872-12882)
function melee(w, u, tgt, nx, ny) {
  const e = perchOf(w, tgt);
  const c = dmg(w, e, MELEE_DMG, u);
  push(w, e, nx, ny, 100 * c, 0.25 * c); // OG game.js:12876
  if (DMG.blockedSpark) DMG.blockedSpark(w, u, e, c);
  if (c >= 1) sfx(w, 'strike', e.x, e.y, { v: 1, type: u.type });
  hitAnim(u);
  u.cooldown = 1 * range(w, 0.8, 1.25); // OG game.js:12880
  if (w.rng() < 0.5) { u.subState = 2; u.b.timer = w.time + 1 * range(w, 0.8, 1.25); } // OG game.js:12881
}

// ---------- rat / snake fear (OG W, game.js:12839-12846; rats 511.P 11484-11501; snakes 616.N 16830-16855) ----------
function ratSnakeFear(w, u, speed) {
  const reach = u.radius + (u.state === S.FLEE ? FEAR_R_FLEE : FEAR_R);
  if (ratsNear(w, u.x, u.y, reach, fearVec) + snakesNear(w, u.x, u.y, reach, fearVec2) === 0) return false;
  const ox = fearVec[0] + fearVec2[0], oy = fearVec[1] + fearVec2[1], a = hyp(ox, oy) || 1;
  setState(u, S.FLEE);
  u.goalX = ox / a * speed; u.goalY = oy / a * speed;
  return true;
}
// rats (and zombie rats) whose edge is within o: sum of away / d² (OG 511.P, game.js:11485-11500)
function ratsNear(w, x, y, o, out) {
  let sx = 0, sy = 0, n = 0;
  w.query(x, y, o + 10, (r) => {
    if (r.hp <= 0 || (r.type !== 'rat' && r.def.risenFrom !== 'rat')) return;
    const lx = x - r.x, ly = y - r.y, d = hyp(lx, ly) || 0.001;
    if (d - r.radius > o) return;
    sx += lx / (d * d); sy += ly / (d * d); n++;
  });
  out[0] = sx; out[1] = sy; return n;
}
// live snakes whose head or body comes within o + snake radius (OG 616.N, game.js:16830-16855).
// Body points: reads the snake's own trail if snake.js exposes one (u.b.body {count, length, pointX(q), pointY(q)}).
function snakesNear(w, x, y, o, out) {
  let sx = 0, sy = 0, n = 0;
  const us = w.units;
  for (let k = 0; k < us.length; k++) {
    const s = us[k];
    if (s.type !== 'snake' || s.dead || s.hp <= 0) continue;
    const body = s.b && s.b.body, blen = body && body.length > 0 ? body.length : 0;
    const v = o + s.radius;
    let best = hyp(x - s.x, y - s.y);
    if (best > v + blen) continue;
    let px = s.x, py = s.y;
    if (body && typeof body.pointX === 'function') {
      const cnt = Math.min(body.count, Math.ceil(blen / SNAKE_SPACING) + 1);
      for (let q = 0; q < cnt; q += SNAKE_STRIDE) {
        const bx = body.pointX(q), by = body.pointY(q), r = hyp(x - bx, y - by);
        if (r < best) { best = r; px = bx; py = by; }
      }
    }
    if (best > v) continue;
    const A = Math.max(best, 0.001);
    sx += (x - px) / (A * A); sy += (y - py) / (A * A); n++;
  }
  out[0] = sx; out[1] = sy; return n;
}

// ---------- rider thrown: riderless horse + a fresh full-hp Ape tossed back (OG K, game.js:12848-12871) ----------
function throwRider(w, u) {
  const x = u.x, y = u.y, o = u.heading, g = u.group, burn = u.burning, frac = u.hp / u.maxHp, rad = u.radius;
  const st = snapshot(u), rider = riderType(u), team = u.team;
  if (g >= 0 && w.groups && w.groups.leave) w.groups.leave(g);
  const h = w.replace(u, 'horse', -1); // OG game.js:12862
  if (h) {
    applyStatus(h, st); h.hatless = 0; h.radius = rad; h.hp = h.maxHp * frac;
    h.role = 1; // OG game.js:12863 (horse role flag; ARMY reads it)
  }
  const a = w.spawn(rider, x, y, { group: g, heading: o, team }); // OG game.js:12864
  if (!a) return;
  w.handOver(u, a); // OURS (possess): the player goes on as the thrown ape
  a.hatless = st.hatless;
  const k = w.rng() < 0.5 ? -1 : 1, ang = o + Math.PI + 0.9 * k; // OG game.js:12867-12868
  toss(w, a, Math.cos(ang), Math.sin(ang), 90, 208); // OG game.js:12869
  if (w.rng() < 0.4) lightUp(w, a, 0.6 * burn); // OG game.js:12869
}

// ---------- death: 25% rider dies too (corpse), else an Ape at 75% hp is thrown forward (OG game.js:12782-12819) ----------
function onDeath(w, u) {
  if (u.infection > 0) return; // OG game.js:12784
  const rider = riderType(u);
  if (w.rng() >= 0.75) { // OG game.js:12785-12806: an extra unseated rider corpse
    const facing = Math.cos(u.heading) >= 0 ? 1 : -1, hit = w.time - (u.hitAt ?? -1e9) < 0.5 && (u.hitDx || 0) !== 0;
    const spec = { type: rider, x: u.x, y: u.y + 1, facing, hatless: u.hatless || 0, undead: isUndead(u), unseated: true,
      burning: u.burning > 0, fall: hit ? u.hitDx : -facing, from: u };
    if (DEATH.addCorpse) DEATH.addCorpse(w, spec); else w.emit('riderCorpse', spec);
    return;
  }
  const a = w.spawn(rider, u.x, u.y, { group: u.group, heading: u.heading, team: u.team }); // OG game.js:12808
  if (!a) return;
  w.handOver(u, a); // OURS (possess): the horse died, the player goes on as the ape
  a.hp = 0.75 * a.maxHp; // OG game.js:12811
  toss(w, a, Math.cos(u.heading), Math.sin(u.heading), 90 + 0.3 * hyp(u.vx, u.vy), 260); // OG game.js:12812-12817
}

// ---------- status carried across a unit swap (OG module 571 b/a, game.js:14517-14562) ----------
function snapshot(u) {
  return {
    hatless: u.hatless || 0, singed: u.singed || 0, blind: u.blind || 0, plague: u.plague || 0, plagueAt: u.plagueAt ?? -1e9,
    plagueFree: u.plagueFree || 0, kindled: u.kindled || 0, burning: u.burning || 0, curseType: u.curseType ?? null,
    infection: u.infection || 0, infectGroup: u.infectGroup ?? -1, z: u.z, vz: u.vz, spin: u.spin || 0,
    thrownAt: u.thrownAt ?? -1e9, arrows: u.arrows ? u.arrows.slice() : null, arrowsIn: u.arrowsIn || 0,
  };
}
function applyStatus(u, s) {
  const d = u.def;
  u.hatless = s.hatless; u.singed = s.singed; u.blind = s.blind; u.plagueFree = s.plagueFree;
  const sick = s.plague > 0 && !(d.look && d.look.undead) && !d.risenFrom && d.faction !== fac('Undead') && !d.prop && !d.plagueCarrier; // OG game.js:14548
  u.plague = sick ? s.plague : 0; u.plagueAt = s.plagueAt; u.kindled = s.kindled;
  u.burning = d.flammability > 0 ? s.burning : 0; // OG game.js:14552
  u.curseType = s.curseType;
  const risen = getRisenType(u.type), inf = s.infection > 0 && d.infectable && risen != null; // OG game.js:14554-14555
  u.infection = inf ? (d.turnsWhenKilled ? Infinity : (Number.isFinite(s.infection) ? s.infection : 1)) : 0;
  u.infectType = inf ? risen : null; u.infectGroup = inf ? s.infectGroup : -1;
  u.z = u.pz = s.z; u.vz = s.vz; u.spin = s.spin; u.thrownAt = s.thrownAt;
  u.arrows = s.arrows; u.arrowsIn = s.arrowsIn;
}
