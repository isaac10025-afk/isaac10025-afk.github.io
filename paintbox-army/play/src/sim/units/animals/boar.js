// Boar: wild charging bruiser (OG "Boar", game.js:17930-18224; gore = trample module 1074, game.js:239-302). Owner: ANIMALS.
// Grazes until disturbed, then charges and gores. Startled boars gore anything that isn't a prop, own side included.
import { registerUnit } from '../../defs.js';
import {
  S, fac, LOCO, INTEL, hyp, signed, range, rint, setState, getTarget, setTarget, perchOf, hostile, isUndead, ensure, hitAnim,
  dmg, push, toss, infect, sfx, hasWalls, hasWater, wetAt, nearestWet, lineOfSight, gField, gSet, goTo, flee, roam, trample, startled,
} from './lib.js';
import { reinGoal } from '../army/cavalry.js'; // OURS (attack 3, 11-18): same rein-round as Cavalry (cavalry.js REIN)

const FULL_SPEED = 255; // OG game.js:17950
const GORE_MIN_SPEED = 112.5; // OG game.js:17951
// gore spec (OG game.js:17953-17964)
const GORE = {
  fullSpeed: FULL_SPEED, // OG game.js:17954
  minSpeed: GORE_MIN_SPEED, // OG game.js:17955
  damage: 45, // OG game.js:17956
  knockback: 150, // OG game.js:17957
  stun: 0.55, // OG game.js:17958
  tossChance: 0.25, // OG game.js:17959
  tossUp: 450, // OG game.js:17960
  tossSpeed: 170, // OG game.js:17961
  slowdown: 0.6, // OG game.js:17962
  infectChance: 0.5, // OG game.js:17963
};
const ROLE_CHARGER = 0; // OG game.js:17965
const ROLE_FLANKER = 1; // OG game.js:17966
const RAW_RADIUS = 13.44; // OG game.js:17974 (init reads the raw def, not the ×1.1 registry copy: OG game.js:18041)
const RAW_MASS = 4; // OG game.js:17976
const RAW_HP = 260; // OG game.js:17978
const WALLOW_BELOW = 0.85; // OG game.js:18196
const WALLOW_SEEK = 200; // OG game.js:18197
const ROAM_CROWD = 34; // OG game.js:18199
const BITE = 14; // OG game.js:18172
const BITE_COOLDOWN = 0.75; // OG game.js:18178
const ALERT_CREEP = 6; // OG game.js:18088
const FLANK_GAP = 90; // OG game.js:18122
// OURS (attack 3, 11-18, boar circling an archer / rifleman for good): a boar that charges a target close by and off its
// nose runs round it at ~100 px/s, 40-45 px centre to centre: too slow to gore (112.5), too far to bite (r + r + 4), and
// the vehicle mover can't turn tighter at that speed (6 / (1 + v / 56.25) rad/s). Archers and riflemen back off round
// it, so neither side ever lands a hit (lone boar v lone archer: both alive at 90 s in 4/10 OG runs, 6/10 ours). Fix:
// inside REIN_NEAR (centre gap past touching) a target more than REIN.angle off the nose = rein round first (brake and
// turn at the standing rate, cavalry.js reinGoal), then the OG charge runs straight in. Further out the OG arcs stay.
const REIN_NEAR = 120;
const propsFaction = fac('Props');
const notProp = (o) => o.faction !== propsFaction; // mask S: every faction but Props (OG game.js:17952)
const wet = new Float32Array(2);
const dir = new Float32Array(2);

// raise the boar's group alert to at least v (OG game.js:18206-18209)
function raiseAlert(w, u, v) {
  const g = u.group;
  if (g >= 0 && (gField(w, g, 'alert') ?? 0) < v) gSet(w, g, 'alert', v);
}
// go Alert with a bravery-scaled delay (OG game.js:18200-18205)
function alert(w, u) {
  setState(u, S.ALERT);
  u.b.timer = 0.2 + 0.9 * Math.max(0, 1.2 - u.bravery) + 0.35 * w.rng(); // OG game.js:18203
  raiseAlert(w, u, 6); // OG game.js:18204
}
// unit vector from own group centre (or self) to group g's centre (OG game.js:18211-18223)
function groupDir(w, u, g) {
  const own = u.group;
  const ox = own >= 0 ? (gField(w, own, 'cx') ?? u.x) : u.x, oy = own >= 0 ? (gField(w, own, 'cy') ?? u.y) : u.y;
  const gx = gField(w, g, 'cx') ?? u.x, gy = gField(w, g, 'cy') ?? u.y;
  let dx = gx - ox, dy = gy - oy, d = hyp(dx, dy);
  if (d < 1) { dx = gx - u.x; dy = gy - u.y; d = hyp(dx, dy) || 1; }
  dir[0] = dx / d; dir[1] = dy / d;
}
function goreIfFast(w, u, mask) {
  const sp = hyp(u.vx, u.vy);
  if (sp >= GORE_MIN_SPEED) trample(w, u, sp, GORE, mask);
}

function idle(w, u) { // OG game.js:18066-18078
  if (hasWater(w) && u.hp < u.maxHp * WALLOW_BELOW) {
    if (wetAt(w, u)) return; // wallows; the water system heals it (OG game.js:738-743)
    if (nearestWet(w, u.x, u.y, WALLOW_SEEK, wet)) {
      const dx = wet[0] - u.x, dy = wet[1] - u.y, d = hyp(dx, dy) || 1;
      u.goalX = dx / d * u.def.walkSpeed * 2; u.goalY = dy / d * u.def.walkSpeed * 2; // OG game.js:18074 (derived: 2 × walkSpeed)
      return;
    }
  }
  roam(w, u, u.def.walkSpeed, ROAM_CROWD); // OG game.js:18077
}

function advance(w, u, e) { // flank (OG game.js:18108-18133)
  if (!e) { setState(u, S.ALERT); u.b.timer = 0.3; return; } // OG game.js:18110
  raiseAlert(w, u, 3); // OG game.js:18111
  const g = e.group;
  if (g < 0 || u.stateTime > 8) { setState(u, S.CHARGE); return; } // OG game.js:18116
  groupDir(w, u, g);
  const fx = dir[0], fy = dir[1], cx = gField(w, g, 'cx') ?? e.x, cy = gField(w, g, 'cy') ?? e.y;
  const R = (gField(w, g, 'radius') ?? 0) + FLANK_GAP; // OG game.js:18122
  const k = u.subState === 1 ? 1 : -1, sx = -fy * k, sy = fx * k;
  const ahead = (u.x - cx) * fx + (u.y - cy) * fy;
  if (ahead > 0.35 * R) { setState(u, S.CHARGE); return; } // OG game.js:18127
  const behind = ahead < 0.15 * -R; // OG game.js:18128
  const tx = behind ? cx + sx * R : cx + fx * R + sx * R * 0.5;
  const ty = behind ? cy + sy * R : cy + fy * R + sy * R * 0.5;
  goTo(w, u, tx, ty, u.def.runSpeed, !hasWalls(w) || lineOfSight(w, u.x, u.y, tx, ty));
  goreIfFast(w, u);
}

function bite(w, u, e) { // OG game.js:18166-18185
  const dx = e.x - u.x, dy = e.y - u.y, d = hyp(dx, dy) || 0.001;
  if (d > u.radius + e.radius + 4) return; // OG game.js:18170
  const h = perchOf(w, e);
  const m = dmg(w, h, BITE, u);
  if (isUndead(u)) infect(w, h, u, 0.5 * m, 0); // OG game.js:18173
  if (h === e) {
    if (e.hp > 0 && m >= 0.6 && w.rng() < 0.3) toss(w, e, dx / d, dy / d, 110 * m, 380 * m); // OG game.js:18175-18176
    else push(w, e, dx / d, dy / d, 80, 0.15); // OG game.js:18177
  }
  u.cooldown = BITE_COOLDOWN;
  if (w.rng() < 0.45) { u.subState = 2; u.b.timer = w.time + 0.9 * range(w, 0.8, 1.25); } // back off (OG game.js:18179-18180)
  sfx(w, 'strike', u.x, u.y, { type: u.type }); hitAnim(u);
}

function charge(w, u, e) { // OG game.js:18136-18186
  if (!e) { setState(u, S.ALERT); u.b.timer = 0.3; return; } // OG game.js:18138
  raiseAlert(w, u, 3); // OG game.js:18139
  if (u.los === 0 && hasWalls(w)) { goTo(w, u, e.x, e.y, u.def.runSpeed, false); goreIfFast(w, u); return; } // OG game.js:18140-18144
  const dx = e.x - u.x, dy = e.y - u.y, d = hyp(dx, dy) || 0.001;
  if (u.subState === 2) { // backing off (OG game.js:18148-18155)
    if (w.time < u.b.timer) { u.goalX = -dx / d * u.def.runSpeed; u.goalY = -dy / d * u.def.runSpeed; goreIfFast(w, u); return; }
    u.subState = 0;
  }
  if (u.possessed === 1 || d > REIN_NEAR + u.radius + e.radius || !reinGoal(u, dx, dy, u.def.walkSpeed)) { // OURS: close + off the nose → rein round (REIN_NEAR above)
    const lead = Math.min(d / FULL_SPEED, 0.5); // OG game.js:18156
    const ax = dx + e.vx * lead, ay = dy + e.vy * lead, ad = hyp(ax, ay) || 0.001;
    u.goalX = ax / ad * FULL_SPEED; u.goalY = ay / ad * FULL_SPEED; // OG game.js:18160
  }
  const sp = hyp(u.vx, u.vy);
  if (sp >= GORE_MIN_SPEED) trample(w, u, sp, GORE);
  else if (u.cooldown <= 0) bite(w, u, e);
}

function brain(w, u) { // OG game.js:18049-18188
  u.goalX = 0; u.goalY = 0;
  if (u.stun > 0) return;
  const e = getTarget(w, u), g = u.group;
  if (u.burning > 0 && !isUndead(u)) { // OG game.js:18054-18058
    setState(u, S.FLEE); flee(w, u, e, u.def.runSpeed); goreIfFast(w, u); return;
  }
  if (startled(w, u, u.def.runSpeed)) { goreIfFast(w, u, notProp); return; } // OG game.js:18059-18062
  if (u.state === S.FLEE) alert(w, u); // OG game.js:18063
  switch (u.state) {
    case S.IDLE: {
      idle(w, u);
      const groupAlert = g >= 0 && (gField(w, g, 'alert') ?? 0) > 0;
      if (e || groupAlert || (u.noise || 0) > 0.5) alert(w, u); // OG game.js:18079-18080
      break;
    }
    case S.ALERT: // OG game.js:18083-18106
      if (e) {
        const dx = e.x - u.x, dy = e.y - u.y, d = hyp(dx, dy) || 1;
        u.goalX = dx / d * ALERT_CREEP; u.goalY = dy / d * ALERT_CREEP;
        if (u.stateTime >= u.b.timer) {
          const eg = e.group;
          if (u.b.role === ROLE_FLANKER && eg >= 0 && (gField(w, eg, 'size') ?? 0) >= 3 && d > 110) { // OG game.js:18090-18094
            groupDir(w, u, eg);
            const cross = dir[0] * (u.y - (gField(w, eg, 'cy') ?? e.y)) - dir[1] * (u.x - (gField(w, eg, 'cx') ?? e.x));
            const side = Math.abs(cross) > 1 ? cross > 0 : w.rng() < 0.5; // OG game.js:18097-18098
            u.subState = side ? 1 : 0; setState(u, S.ADVANCE);
          } else setState(u, S.CHARGE);
        }
      } else if (u.stateTime > 5 && (g < 0 || (gField(w, g, 'alert') ?? 0) <= 0)) setState(u, S.IDLE); // OG game.js:18105
      break;
    case S.ADVANCE: advance(w, u, e); break;
    case S.CHARGE: charge(w, u, e); break;
    default: setState(u, S.IDLE);
  }
}

registerUnit({
  type: 'boar',
  og: 'Boar', // OG game.js:17970
  category: 'animals', // OG game.js:17971
  faction: fac('Wild'), // OG game.js:17972
  skittish: true, // OG game.js:17973
  radius: 13.44, // OG game.js:17974
  radiusJitter: 0.15, // OG game.js:17975
  mass: 4, // OG game.js:17976
  density: 1.5, // OG game.js:17977
  maxHp: 260, // OG game.js:17978
  melee: true, // OG game.js:17979
  strength: 1, // OG game.js:17980
  locomotion: LOCO.Vehicle, // OG game.js:17981
  walkSpeed: 21, // OG game.js:17982
  runSpeed: 150, // OG game.js:17983
  maxSpeed: 262.5, // OG game.js:17984
  accel: 270, // OG game.js:17985
  decel: 390, // OG game.js:17986
  turnRate: 6, // OG game.js:17987
  turnSpeedFalloff: 56.25, // OG game.js:17988
  sightRange: 260, // OG game.js:17989
  alertSightRange: 680, // OG game.js:17990
  stickyTarget: true, // OG game.js:17991
  reactionTime: 0, // OG game.js:17992
  huntRange: 0, // OG game.js:17993
  minDistance: 0, // OG game.js:17994
  drilled: false, // OG game.js:17995
  intelligence: INTEL.Animal, // OG game.js:17996
  infectable: true, // OG game.js:17997
  turnsWhenKilled: true, // OG game.js:17998
  flammability: 1, // OG game.js:17999
  brushSpacing: 38.4, // OG game.js:18000
  flock: {
    personalSpace: 1.3, // OG game.js:18002
    separation: 45, // OG game.js:18003
    alignment: 0.25, // OG game.js:18004
    cohesion: 0.4, // OG game.js:18005
    formation: 0, // OG game.js:18006
    herd: 0.5, // OG game.js:18007
    herdSpacing: 12, // OG game.js:18008
    idleSpread: 2.2, // OG game.js:18009
    flockByState: [1, 0.1, 0.3, 1, 0.08, 0.6], // OG game.js:18010
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:18011
  },
  morale: {
    baseline: 0.9, // OG game.js:18014
    oddsWeight: 0.1, // OG game.js:18015
    fearWeight: 0.04, // OG game.js:18016
    casualtyWeight: 0.15, // OG game.js:18017
    woundWeight: 0.8, // OG game.js:18018
    hitShock: 0.02, // OG game.js:18019
    suppression: 0, // OG game.js:18020
    canBreak: false, // OG game.js:18021
    breakAt: 0.2, // OG game.js:18022
    rallyAt: 0.5, // OG game.js:18023
    minFleeTime: 3, // OG game.js:18024
    dropRate: 3, // OG game.js:18025
    recoverRate: 0.1, // OG game.js:18026
    panicFear: 0.2, // OG game.js:18027
    deathFear: 0.4, // OG game.js:18028
  },
  look: {
    fur: true, // OG game.js:18032
    attack: {
      time: 0.35, // OG game.js:18037
      kick: 0, // OG game.js:18037
    },
  },
  init(w, u) { // OG game.js:18039-18048
    ensure(u);
    const e = u.radius / RAW_RADIUS; // spawned radius carries ×1.1, so e ≈ 1.1 (OG game.js:18041)
    u.mass = RAW_MASS * e * e; // OG game.js:18042
    u.hp = u.maxHp = RAW_HP * e * e; // OG game.js:18043
    u.subState = rint(w, 2); // OG game.js:18044
    u.b.timer = range(w, 0, 3); // OG game.js:18045
    u.wander = u.heading; // OG game.js:18046
    u.b.role = w.rng() < 0.35 ? ROLE_FLANKER : ROLE_CHARGER; // OG game.js:18047
  },
  brain,
  onHit(w, u, amount, att) { // OG game.js:18189-18194
    if (att && !att.dead && hostile(u, att)) setTarget(u, att);
    raiseAlert(w, u, 6);
    if (u.state === S.IDLE || u.state === S.ALERT) setState(u, S.CHARGE);
  },
});
