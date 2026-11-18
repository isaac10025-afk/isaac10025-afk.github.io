// Ape: brawler (OG "Ape", game.js:13924-14501). Owner: ANIMALS.
// Ground slam, tree climb + pounce, chest beat, mounts loose horses (→ apecav), lifts and throws light units / barrels.
import { registerUnit, getRisenType } from '../../defs.js';
import { hash2 } from '../../const.js';
import { enemyMask } from '../../factions.js';
import { hooks } from '../../combat/env.js';
import { NOISE_LAYER } from '../../world.js';
import {
  S, DT, fac, LOCO, INTEL, MAX_R, GRAVITY, signed, range, hyp, setState, getTarget, unit, airborne, perchOf,
  isUndead, ensure, hitAnim, dmg, push, infect, sfx, hasWalls, followIntel, flee, roam, goTo, nearestHorse,
} from './lib.js';

// subStates (OG game.js:13952-13956)
const WINDUP = 1; // OG game.js:13952
const RECOVER = 2; // OG game.js:13953
const SEEK_THROW = 3; // derived: OG uses the literal 3 (game.js:14196)
const HOLD = 4; // OG game.js:13954
const SEEK_HORSE = 5; // derived: OG uses the literal 5 (game.js:14197)
const BEAT = 6; // OG game.js:13955
const POUNCE = 7; // OG game.js:13956

const POUNCE_VZ = 120; // OG game.js:13957
const POUNCE_DMG = 60; // OG game.js:13958
const SLAM_WINDUP = 0.45; // OG game.js:13959
const SLAM_LAND_AT = 0.6; // OG game.js:13960
const SLAM_DMG = 46; // OG game.js:13961
const LUNGE = 0.75; // OG game.js:13963
const SLAM_AHEAD = 1.2; // OG game.js:13964
const LIFT_TIME = 0.55; // OG game.js:13965
const BEAT_TIME = 1.2; // OG game.js:13967
const BEAT_R = 140; // OG game.js:13968
const RAGE_MUL = 1.25; // OG game.js:13969
const FALL_VZ = 60; // OG game.js:14488
const FALL_V = 70; // OG game.js:14489
const PERCH_H_APE = 23; // OG game.js:9012 (412.b, ape perch height)
const ICE_CRUSH_DIV = 20; // OG game.js:13498 (568.a: dmg / 20)
const ICE_CRUSH_MIN = 1; // OG game.js:13500
const ICE_CRUSH_K = 0.3; // OG game.js:13501
const ICE_CRUSH_T = 0.5; // OG game.js:13502

let WALK = 90, RUN = 185; // set from the registered def below (OG reads X.walkSpeed / X.runSpeed)
const hitList = [];

const def = registerUnit({
  type: 'ape',
  og: 'Ape', // OG game.js:13974
  waterPace: 0.5, // OG game.js:13975
  category: 'animals', // OG game.js:13976
  faction: fac('Apes'), // OG game.js:13977
  radius: 13.5, // OG game.js:13978
  radiusJitter: 0.08, // OG game.js:13979
  mass: 2.2, // OG game.js:13980
  iceGrip: 1, // OG game.js:13981
  density: 1.5, // OG game.js:13982
  maxHp: 210, // OG game.js:13983
  melee: true, // OG game.js:13984
  strength: 1.6, // OG game.js:13985
  locomotion: LOCO.Holonomic, // OG game.js:13986
  walkSpeed: 90, // OG game.js:13987
  runSpeed: 185, // OG game.js:13988
  maxSpeed: 240, // OG game.js:13989
  accel: 900, // OG game.js:13990
  decel: 700, // OG game.js:13991
  turnRate: 6, // OG game.js:13992
  turnSpeedFalloff: Infinity, // OG game.js:13993
  sightRange: 320, // OG game.js:13994
  alertSightRange: 380, // OG game.js:13995
  stickyTarget: true, // OG game.js:13996
  reactionTime: 0.18, // OG game.js:13997
  huntRange: Infinity, // OG game.js:13998
  minDistance: 0, // OG game.js:13999
  drilled: false, // OG game.js:14000
  intelligence: INTEL.Animal, // OG game.js:14001
  infectable: true, // OG game.js:14002
  flammability: 0.7, // OG game.js:14003
  brushSpacing: 28, // OG game.js:14004
  flock: {
    personalSpace: 1.2, // OG game.js:14006
    separation: 40, // OG game.js:14007
    alignment: 0.2, // OG game.js:14008
    cohesion: 0.35, // OG game.js:14009
    formation: 0, // OG game.js:14010
    herd: 0.4, // OG game.js:14011
    herdSpacing: 10, // OG game.js:14012
    idleSpread: 2, // OG game.js:14013
    flockByState: [1, 0.6, 0.2, 1, 0.2, 0.6], // OG game.js:14014
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:14015
  },
  morale: {
    baseline: 0.85, // OG game.js:14018
    oddsWeight: 0.25, // OG game.js:14019
    fearWeight: 0.06, // OG game.js:14020
    casualtyWeight: 0.15, // OG game.js:14021
    woundWeight: 0.35, // OG game.js:14022
    hitShock: 0.03, // OG game.js:14023
    suppression: 0.02, // OG game.js:14024
    canBreak: true, // OG game.js:14025
    breakAt: 0.12, // OG game.js:14026
    rallyAt: 0.45, // OG game.js:14027
    minFleeTime: 3, // OG game.js:14028
    dropRate: 2.5, // OG game.js:14029
    recoverRate: 0.12, // OG game.js:14030
    panicFear: 0.25, // OG game.js:14031
    deathFear: 0.35, // OG game.js:14032
  },
  look: {
    fur: true, // OG game.js:14036
    attack: {
      time: 0.3, // OG game.js:14041
      kick: 0, // OG game.js:14041
    },
  },
  init(w, u) {
    ensure(u);
    u.cooldown = 0.7 * w.rng(); // OG game.js:14044
    const b = u.b; b.timer = 0; b.rage = 0; b.nextBeat = 0; b.nextThrow = 0; // OG aimY / nextThrow / rage start at 0
  },
  // OG onDamaged (game.js:14046-14048): a hit of ≥ 5 dealt → rage 5 s
  onHit(w, u, amount) { if (amount >= 5) enrage(w, u); },
  // OG onLanded (game.js:14049-14081): a tree pounce lands as a slam
  onLanded(w, u) { if (u.subState === POUNCE) pounceLand(w, u); },
  brain,
});
WALK = def.walkSpeed; RUN = def.runSpeed;

function enrage(w, u) { u.b.rage = w.time + 5; } // OG game.js:14275-14277
function dist(a, b) { return hyp(b.x - a.x, b.y - a.y); }
function unperch(u) { u.perch = -1; u.climb = 0; u.hidden = 0; } // OG 412.r (game.js:9055-9057)
function iceCrack(w, x, y, r, d) { // OG 568.c (game.js:13509-13511)
  const crush = d / ICE_CRUSH_DIV;
  if (hooks.iceHarm && crush > ICE_CRUSH_MIN) hooks.iceHarm(w, x, y, r, (crush - ICE_CRUSH_MIN) * ICE_CRUSH_K, ICE_CRUSH_T);
}
function gather(w, x, y, r, mask) { hitList.length = 0; w.query(x, y, r, (o) => { if (hitList.length < 32) hitList.push(o); }, mask); return hitList; }

// ---------- brain (OG game.js:14086-14274) ----------
function brain(w, u) {
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  const b = u.b, undead = isUndead(u);
  let tgt = getTarget(w, u);
  if (u.subState === POUNCE) u.subState = 0; // OG game.js:14090 (landing normally ran onLanded already)
  if (u.perch > 0 && treeStep(w, u, tgt)) return; // OG game.js:14091
  if (!undead && u.subState === 0) tryClaimTree(w, u, tgt); // OG game.js:14092-14122
  if (u.perch > 0 && treeStep(w, u, tgt)) return; // OG game.js:14123
  const raging = b.rage > w.time; // OG game.js:14124
  if (raging) u.morale = Math.max(u.morale, 0.6); // OG game.js:14125
  const rm = raging ? RAGE_MUL : 1; // OG game.js:14126
  if (u.subState === WINDUP || u.subState === RECOVER) { // OG game.js:14127-14186
    if (!(u.stun > 0.6 || airborne(u))) { slamStep(w, u, tgt); return; }
    u.subState = 0;
  }
  if (u.subState === HOLD && holdStep(w, u, tgt)) return; // OG game.js:14188
  if (u.stun > 0) { u.face = u.heading; if (u.subState !== HOLD) u.subState = 0; return; } // OG game.js:14189
  if (u.state === S.FLEE) { if (u.subState === HOLD) drop(w, u); u.subState = 0; flee(w, u, tgt, RUN); return; } // OG game.js:14190-14191
  if (u.subState === BEAT) { // OG game.js:14192-14200
    if (w.time < b.timer && (!tgt || dist(u, tgt) > 120)) {
      setState(u, S.ALERT);
      u.face = tgt ? Math.atan2(tgt.y - u.y, tgt.x - u.x) : u.heading;
      return;
    }
    u.subState = 0;
  }
  if (u.subState === SEEK_THROW && seekThrowable(w, u, tgt)) return; // OG game.js:14201
  if (u.subState === SEEK_HORSE && seekHorse(w, u, tgt)) return; // OG game.js:14202
  const L = tgt ? dist(u, tgt) : Infinity; // OG game.js:14203
  // chest beat: checked every 30 ticks, 3% with a target / 2.5% without, target > 200 px (OG game.js:14204-14223)
  if (!undead && u.subState === 0 && w.time >= b.nextBeat && (w.tick + u.index) % 30 === 0 && L > 200) {
    const p = tgt ? 0.06 : 0.05; // OG game.js:14205
    if (hash2(u.index, w.tick) < (30 * p) / 60) { chestBeat(w, u); return; } // OG game.js:14206
  }
  // ride a loose horse within 260 px when the target is > 120 px away (OG game.js:14224-14227)
  if (!undead && L > 120) {
    const h = nearestHorse(w, u.x, u.y, 260);
    if (h) { u.subState = SEEK_HORSE; u.lastVictim = h.id; if (seekHorse(w, u, tgt)) return; }
  }
  if (!tgt) { // OG game.js:14228-14231
    if (followIntel(w, u, WALK, 5)) return;
    setState(u, S.IDLE); roam(w, u, 0.6 * WALK, 38); return;
  }
  const dx = tgt.x - u.x, dy = tgt.y - u.y, D = L || 0.001;
  // throw: target 70-260 px, timer ready, no visible enemy within 60 px (OG game.js:14235-14252)
  if (!undead && D >= 70 && D <= 260 && w.time >= b.nextThrow && !enemyNear(w, u, 60)) {
    const v = pickThrowable(w, u);
    if (v) { u.subState = SEEK_THROW; u.lastVictim = v.id; if (seekThrowable(w, u, tgt)) return; }
  }
  if (D <= u.radius + tgt.radius + 7) { // OG game.js:14254-14262
    setState(u, S.ENGAGE);
    u.face = Math.atan2(dy, dx);
    if (u.cooldown <= 0) {
      u.subState = WINDUP; b.timer = w.time + SLAM_WINDUP;
      u.cooldown = SLAM_WINDUP + 0.7 * (raging ? 0.75 : 1) * range(w, 0.85, 1.15); // OG game.js:14261
    } else { u.goalX = dx / D * WALK * 0.6 * rm; u.goalY = dy / D * WALK * 0.6 * rm; } // OG game.js:14262
    return;
  }
  setState(u, D < 280 ? S.CHARGE : S.ADVANCE); // OG game.js:14264-14272
  goTo(w, u, tgt.x, tgt.y, (D < 280 ? RUN : WALK) * rm, u.los === 1 || !hasWalls(w));
}

// ---------- slam (OG game.js:14131-14185) ----------
function slamStep(w, u, tgt) {
  setState(u, S.ENGAGE);
  if (tgt && u.subState === WINDUP) {
    const dx = tgt.x - u.x, dy = tgt.y - u.y, d = hyp(dx, dy) || 0.001;
    u.face = Math.atan2(dy, dx);
    if (d > u.radius + tgt.radius + 3.5) { // OG game.js:14137
      const e = u.b.rage > w.time ? RAGE_MUL : 1;
      u.goalX = dx / d * RUN * LUNGE * e; u.goalY = dy / d * RUN * LUNGE * e; // OG game.js:14139
    }
  } else u.face = u.heading;
  const p = 1 - (u.b.timer - w.time) / SLAM_WINDUP; // OG game.js:14142
  if (u.subState === WINDUP && p >= SLAM_LAND_AT) { u.subState = RECOVER; slamHit(w, u); } // OG game.js:14143-14146
  if (w.time >= u.b.timer) u.subState = 0; // OG game.js:14184
}
function slamHit(w, u) { // OG game.js:14146-14183
  const r = u.radius, px = u.x + Math.cos(u.heading) * r * SLAM_AHEAD, py = u.y + Math.sin(u.heading) * r * SLAM_AHEAD;
  const h = 1.25 * r, undead = isUndead(u); // OG game.js:14151
  const list = gather(w, px, py, h + MAX_R, enemyMask(u.faction));
  let best = 0;
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    if (e.dead || e.hp <= 0 || airborne(e)) continue;
    const cx = e.x - px, cy = e.y - py, m = hyp(cx, cy) || 0.001;
    if (m > h + e.radius) continue;
    const v = perchOf(w, e);
    const pass = dmg(w, v, SLAM_DMG + 6 * signed(w), u); // OG game.js:14164
    best = Math.max(best, pass);
    if (v === e && e.hp > 0) push(w, e, cx / m, cy / m, 150 * pass, 0.4 * pass); // OG game.js:14166
    if (v.hp <= 0) enrage(w, u); // OG game.js:14167
    if (undead) infect(w, v, u, 0.5 * pass, 0); // OG game.js:14168
  }
  for (let k = 0; k < 3; k++) sfx(w, 'dust', px + signed(w) * r * 0.5, py + signed(w) * r * 0.3, { size: 1.1 });
  sfx(w, 'shock', px, py, { radius: 26, life: 3 }); // OG blasts.add (game.js:14179, V = 26, Z = 3 at 14278-14279)
  iceCrack(w, px, py, h, SLAM_DMG); // OG game.js:14180
  sfx(w, 'strike', px, py, { v: 1, type: u.type });
  if (best > 0) sfx(w, 'trample', px, py, { v: 1.2 * best, type: u.type }); // OG game.js:14181 (C = 1.2)
  hitAnim(u);
}
// tree pounce landing slam (OG game.js:14050-14080)
function pounceLand(w, u) {
  u.subState = RECOVER; u.b.timer = w.time + 0.4 * SLAM_WINDUP; u.stun = 0; // OG game.js:14053
  const r = u.radius, n = 1.4 * r; // OG game.js:14054-14055
  const list = gather(w, u.x, u.y, n + MAX_R, enemyMask(u.faction));
  let best = 0;
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    if (e.dead || e.hp <= 0 || airborne(e)) continue;
    const ox = e.x - u.x, oy = e.y - u.y, l = hyp(ox, oy) || 0.001;
    if (l > n + e.radius) continue;
    const v = perchOf(w, e);
    const pass = dmg(w, v, POUNCE_DMG + 6 * signed(w), u); // OG game.js:14066
    best = Math.max(best, pass);
    if (v === e && e.hp > 0) push(w, e, ox / l, oy / l, 190 * pass, 0.6 * pass); // OG game.js:14067
  }
  if (best > 0) sfx(w, 'trample', u.x, u.y, { v: (72 / 46) * best, type: u.type }); // OG game.js:14069
  enrage(w, u); iceCrack(w, u.x, u.y, n, POUNCE_DMG); // OG game.js:14070
  for (let k = 0; k < 4; k++) sfx(w, 'dust', u.x + signed(w) * r * 0.6, u.y + signed(w) * r * 0.3, { size: 1.2 });
  sfx(w, 'shock', u.x, u.y, { radius: 26, life: 3 });
  sfx(w, 'strike', u.x, u.y, { v: 1.2, type: u.type });
  hitAnim(u);
}

// ---------- chest beat (OG game.js:14207-14222) ----------
function chestBeat(w, u) {
  u.subState = BEAT; u.b.timer = w.time + BEAT_TIME;
  sfx(w, 'chestbeat', u.x, u.y, { v: 1, type: u.type });
  u.b.nextBeat = w.time + BEAT_TIME + 7 * range(w, 0.8, 1.2); // OG game.js:14212
  setState(u, S.ALERT);
  if (w.fields && w.fields.splat) w.fields.splat(NOISE_LAYER, u.x, u.y, 0.6, 260); // OG game.js:14214 (noise layer, 0.6 in 260 px)
  const list = gather(w, u.x, u.y, BEAT_R, enemyMask(u.faction));
  for (let k = 0; k < list.length; k++) {
    const o = list[k];
    if (hyp(o.x - u.x, o.y - u.y) <= BEAT_R) o.morale = Math.max(0, o.morale - 0.08); // OG game.js:14219-14220
  }
}

// ---------- throw (OG game.js:14280-14352) ----------
// any visible enemy within e + radius (OG J, game.js:14280-14283; hidden units count only inside their hidden radius)
function enemyNear(w, u, e) {
  const R = e + u.radius; let found = false;
  w.query(u.x, u.y, R, (o) => {
    const d = hyp(o.x - u.x, o.y - u.y);
    if (d >= R || (o.hidden > 0 && d > o.hidden)) return;
    found = true; return true;
  }, enemyMask(u.faction));
  return found;
}
// throwable = Barrel, or a light grounded unit of another faction (OG Q, game.js:14284-14289)
function throwable(u, v) {
  if (v.hp <= 0 || v.hurled === 1 || airborne(v) || v.climb > 0) return false;
  return v.type === 'barrel' || (!v.def.prop && v.faction !== u.faction && v.mass < 0.8);
}
function pickThrowable(w, u) { // OG game.js:14236-14250
  const list = gather(w, u.x, u.y, u.radius + 90 + MAX_R);
  let best = null, bs = -Infinity;
  for (let k = 0; k < list.length; k++) {
    const v = list[k];
    if (v === u || v.dead || !throwable(u, v)) continue;
    const gap = hyp(v.x - u.x, v.y - u.y) - u.radius - v.radius;
    if (gap > 90) continue;
    const s = (v.type === 'barrel' ? 2 : 0) - 0.01 * gap; // OG game.js:14246
    if (s > bs) { bs = s; best = v; }
  }
  return best;
}
function seekThrowable(w, u, tgt) { // OG $ (game.js:14290-14304)
  const v = unit(w, u.lastVictim);
  if (!tgt || !v || !throwable(u, v) || enemyNear(w, u, 60)) { u.subState = 0; return false; }
  const ox = v.x - u.x, oy = v.y - u.y, l = hyp(ox, oy) || 0.001;
  if (l > u.radius + v.radius + 4) {
    setState(u, S.ADVANCE);
    u.goalX = ox / l * RUN; u.goalY = oy / l * RUN; u.face = Math.atan2(oy, ox);
    return true;
  }
  u.subState = HOLD; u.b.timer = w.time + LIFT_TIME; v.hurled = 1; unperch(v); // OG game.js:14303
  holdStep(w, u, tgt);
  return true;
}
function heldUnit(w, u) { // OG tt (game.js:14305-14310)
  if (u.subState !== HOLD) return null;
  const v = unit(w, u.lastVictim);
  return v && v.hurled === 1 ? v : null;
}
function holdStep(w, u, tgt) { // OG et (game.js:14311-14346)
  const v = heldUnit(w, u);
  if (!v || airborne(u) || u.hp <= 0 || !tgt || u.stun > 0.6) { drop(w, u); return false; }
  setState(u, S.ENGAGE); u.face = Math.atan2(tgt.y - u.y, tgt.x - u.x);
  const p = Math.min(1, 1 - (u.b.timer - w.time) / LIFT_TIME);
  v.x = u.x + Math.cos(u.heading) * u.radius * 0.2; v.y = u.y - 1; // OG game.js:14318-14319
  v.vx = u.vx; v.vy = u.vy;
  v.z = v.pz = 3.1 * u.radius * Math.min(1, 1.6 * p); // OG game.js:14322
  v.vz = 0; v.spin = 0; v.stun = Math.max(v.stun || 0, 0.3);
  if (w.time >= u.b.timer) throwHeld(w, u, v, tgt);
  return true;
}
function throwHeld(w, u, v, tgt) { // OG game.js:14327-14344
  sfx(w, 'throw', u.x, u.y, { v: 1.5, type: u.type });
  u.subState = 0;
  const ox = tgt.x - v.x, oy = tgt.y - v.y;
  const l = Math.min(1, Math.max(0.4, hyp(ox, oy) / 280)); // OG game.js:14332
  const hx = ox + tgt.vx * l, hy = oy + tgt.vy * l;
  v.vx = hx / l; v.vy = hy / l;
  v.vz = (0.5 * GRAVITY * l * l - v.z) / l; // OG game.js:14337
  v.spin = (2 * (hx >= 0 ? 1 : -1) * Math.PI) / l;
  v.thrownAt = w.time;
  v.stun = Math.max(v.stun || 0, l + 0.4); // OG game.js:14340
  u.firedAt = w.time;
  u.b.nextThrow = w.time + 4 * range(w, 0.8, 1.2); // OG game.js:14342
  u.cooldown = Math.max(u.cooldown, 0.5); // OG game.js:14343
  // v.hurled stays 1: CORE-B's landing makes the thrown unit hit everyone near (OG game.js:9102-9129)
}
function drop(w, u) { // OG nt (game.js:14347-14351)
  const v = heldUnit(w, u);
  u.subState = 0;
  if (v) { v.hurled = 0; v.z = Math.max(v.z, 1); }
}

// ---------- horse riding (OG it, game.js:14353-14384) ----------
function seekHorse(w, u, tgt) {
  const h = unit(w, u.lastVictim);
  if ((tgt && dist(u, tgt) < 120) || !h || h.type !== 'horse' || h.hp <= 0 || h.burning > 0) { u.subState = 0; return false; }
  const ox = h.x - u.x, oy = h.y - u.y, c = hyp(ox, oy) || 0.001;
  if (c > u.radius + h.radius + 4) {
    setState(u, S.ADVANCE);
    u.goalX = ox / c * RUN; u.goalY = oy / c * RUN;
    return true;
  }
  mount(w, u, h);
  return true;
}
function mount(w, u, h) { // OG game.js:14374-14383
  const g = u.group, frac = h.hp / h.maxHp, st = snapshot(h), team = u.team;
  st.hatless = 0;
  if (g >= 0 && w.groups && w.groups.leave) w.groups.leave(g);
  w.remove(u);
  const c = w.replace(h, 'apecav', g, team);
  if (!c) return;
  w.handOver(u, c); w.handOver(h, c); // OURS (possess): the ape or the horse becomes the ape cavalry
  applyStatus(c, st);
  c.hp = c.maxHp * frac; // OG game.js:14382
  sfx(w, 'dust', c.x, c.y, { size: 1.2 });
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
  const sick = s.plague > 0 && !isUndead(u) && d.faction !== fac('Undead') && !d.prop && !d.plagueCarrier; // OG game.js:14548
  u.plague = sick ? s.plague : 0; u.plagueAt = s.plagueAt; u.kindled = s.kindled;
  u.burning = d.flammability > 0 ? s.burning : 0; // OG game.js:14552
  u.curseType = s.curseType;
  const risen = getRisenType(u.type), inf = s.infection > 0 && d.infectable && risen != null; // OG game.js:14554-14555
  u.infection = inf ? (d.turnsWhenKilled ? Infinity : (Number.isFinite(s.infection) ? s.infection : 1)) : 0;
  u.infectType = inf ? risen : null; u.infectGroup = inf ? s.infectGroup : -1;
  u.z = u.pz = s.z; u.vz = s.vz; u.spin = s.spin; u.thrownAt = s.thrownAt;
  u.arrows = s.arrows; u.arrowsIn = s.arrowsIn;
}

// ---------- trees (OG game.js:14092-14122, 14385-14487; free check 16555-16560) ----------
// A tree is free if alive, unburnt, unsinged and not claimed by another percher (OG M, game.js:16555-16560).
// OG keeps the claim in the tree's role/aimY; we keep it in tree.claimBy (ape id).
function freeTree(w, tree, u) {
  if (tree.type !== 'tree' || tree.hp <= 0 || tree.burning > 0 || tree.singed === 1) return false;
  const s = unit(w, tree.claimBy ?? -1);
  return !s || s === u || s.perch !== tree.id;
}
function tryClaimTree(w, u, tgt) {
  if ((w.tick + u.index) % 30 !== 0 || hash2(u.index, w.tick) >= 0.125) return; // OG game.js:14097
  if (u.state === S.FLEE || u.burning > 0 || u.stun > 0 || airborne(u) || u.b.rage > w.time) return; // OG game.js:14098-14104
  if (tgt && dist(u, tgt) < 220) return; // OG game.js:14106
  let best = null, bd = Infinity;
  w.query(u.x, u.y, u.radius + 170, (o) => { // OG game.js:14107
    if (!freeTree(w, o, u)) return;
    const d = dist(u, o); if (d < bd) { bd = d; best = o; }
  }, 1 << fac('Props'));
  if (!best) return;
  u.perch = best.id; u.climb = 0; u.b.timer = 0; best.claimBy = u.id; // OG game.js:14117-14121
}
// perch step: walk to the trunk, climb, watch, pounce, climb down (OG at, game.js:14385-14487). true = handled.
function treeStep(w, u, tgt) {
  const tree = unit(w, u.perch);
  const ok = !!tree && tree.type === 'tree' && tree.hp > 0 && !(tree.burning > 0) && tree.singed !== 1 && tree.hurled !== 1;
  const side = u.index % 2 === 0 ? 1 : -1;
  const fx = tree ? tree.x + 30 * side : u.x, fy = tree ? tree.y + 1 : u.y; // OG game.js:14397-14398
  const y = u.climb, tr = tree ? tree.radius : 0;
  if (y === 0 && u.b.timer >= 0) { // walking to the trunk (OG game.js:14400-14419)
    const rx = fx - u.x, ry = fy - u.y, l = hyp(rx, ry) || 0.001;
    if (!ok || u.burning > 0 || u.state === S.FLEE || (tgt && dist(u, tgt) < 110)) { u.perch = -1; return false; }
    if (l > u.radius + tr + 6) {
      setState(u, S.ADVANCE);
      u.goalX = rx / l * WALK; u.goalY = ry / l * WALK; u.face = Math.atan2(ry, rx);
      return true;
    }
    u.b.timer = w.time;
  }
  if (!ok || u.burning > 0) { // falls off (OG game.js:14421-14432)
    u.z = Math.max(u.z, u.climb * PERCH_H_APE); u.vz = FALL_VZ; u.vy = FALL_V; u.vx = signed(w) * FALL_V * 0.5;
    unperch(u);
    return true;
  }
  if (y > 0 && hyp(fx - u.x, fy - u.y) > u.radius + tr + 12) { unperch(u); return false; } // OG game.js:14433
  setState(u, tgt ? S.ALERT : S.IDLE);
  u.goalX = u.goalY = 0; u.vx = u.vy = 0;
  u.heading = side > 0 ? 0 : Math.PI; u.face = NaN;
  const k = Math.min(1, 8 * DT); // OG game.js:14439
  u.x += (fx - u.x) * k; u.y += (fy - u.y) * k;
  if (u.b.timer < 0) { // climbing down (OG game.js:14440-14445)
    u.climb = Math.max(0, y - DT / 0.9); u.hidden = 0;
    if (u.climb !== 0) return true;
    unperch(u); u.y = fy + tr + u.radius;
    return false;
  }
  u.climb = Math.min(1, y + DT / 0.9); // OG game.js:14446
  u.hidden = u.climb < 0.5 ? 0 : 80;
  if (u.climb < 1) return true;
  const v = pounceVictim(w, u);
  if (v) { pounce(w, u, v); return true; }
  const t = w.time - u.b.timer; // OG game.js:14485-14486
  if ((tgt && t > 6) || t > 25) u.b.timer = -1;
  return true;
}
function pounceVictim(w, u) { // OG game.js:14448-14463: nearest grounded enemy within a 45 px gap
  let best = null, bg = Infinity;
  w.query(u.x, u.y, 45 + u.radius + MAX_R, (o) => {
    if (o.hp <= 0 || airborne(o) || o.climb > 0 || o.def.prop) return;
    const g = hyp(o.x - u.x, o.y - u.y) - u.radius - o.radius;
    if (g < 45 && g < bg) { bg = g; best = o; }
  }, enemyMask(u.faction));
  return best;
}
function pounce(w, u, v) { // OG game.js:14466-14480
  const n = PERCH_H_APE * u.climb;
  unperch(u);
  const o = (POUNCE_VZ + Math.sqrt(14400 + 2 * GRAVITY * n)) / GRAVITY; // OG game.js:14469
  const cx = v.x + v.vx * o - u.x, cy = v.y + v.vy * o - u.y;
  u.z = u.pz = n; u.vz = POUNCE_VZ; u.vx = cx / o; u.vy = cy / o;
  u.heading = Math.atan2(cy, cx);
  u.subState = POUNCE; u.lastVictim = v.id; u.target = v.id;
  sfx(w, 'chestbeat', u.x, u.y, { v: 0.6, type: u.type });
}
