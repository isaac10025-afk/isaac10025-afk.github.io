// Ant: colony founder and worker (OG "Ant", game.js:11938-12149; shared brain helpers game.js:12250-12308).
// Painted ants found a colony; the colony (ants-system.js, tick step 19) sends them out to dig, forage, carry corpses
// and defend. The Soldier ant (soldierant.js) reuses these hooks. Owner: ANIMALS.
import { registerUnit } from '../../defs.js';
import {
  S, fac, LOCO, INTEL, rnd, signed, range, hyp, setState, getTarget, unit, perchOf, ensure, hitAnim, dmg, sfx,
  hasWalls, lineOfSight, goTo, followIntel, flee,
} from './lib.js';
import {
  colonies, SETTLED, JOB, HILL_SENSE, ALARM_TIME, entrance, carrySpot, jobValid, nearestByFaction, corpseTime,
} from './ants-system.js';

const WALK = 48; // OG game.js:11953 (the brain always uses the worker's speeds, R.walkSpeed)
const RUN = 100; // OG game.js:11954 (R.runSpeed, also for soldier ants)
const JOIN_RANGE = 150; // OG game.js:11993
const FORAGE_LINGER = 1.4; // OG game.js:11935 (_)
const OUT_TIMER = 3; // OG game.js:11937 (T)
const HURT_RANGE = 60; // OG game.js:12151 (L: alarm if hit within 110 + 60 of the hill)
const BITE_WORKER = 7; // OG game.js:12153 (P)
const BITE_SOLDIER = 15; // OG game.js:12154 (I)
const BITE_JITTER = 0.25; // OG game.js:12155 (H)
const FOE_LEASH = 450; // OG game.js:12023
const ENT = new Float64Array(2), SPOT = new Float64Array(2);

// Ant init (OG game.js:11983-12006)
function antInit(w, u) {
  ensure(u);
  u.colony = 0; u.b.timer = 0; u.b.aimX = 0; u.b.aimY = 0; u.b.job = null; u.b.jobTime = 0;
  const col = colonies(w);
  u.cooldown = 0.6 * rnd(w); u.wander = signed(w); // OG game.js:11986
  if (col.spawning > 0) { u.colony = col.spawning; return; } // hatched by a hill (OG game.js:11986-11987)
  if (u.def.faction !== fac('Ants')) return; // zombie ants are Undead: never join (OG game.js:11988)
  const g = u.group, team = u.team ?? -1;
  let e = -1, nd = JOIN_RANGE, far = -1, fd = Infinity;
  for (let t = 0; t < 4; t++) {
    if (col.alive[t] === 0 || col.team[t] !== team) continue;
    if (g >= 0 && col.group[t] === g) { e = t; break; }
    const d = hyp(col.x[t] - u.x, col.y[t] - u.y);
    if (d < nd) { nd = d; e = t; }
    if (d < fd) { fd = d; far = t; }
  }
  if (e < 0) e = col.create(u.x, u.y, g, w.time, team); // found a new colony (OG game.js:12003)
  if (e < 0) e = far; // all 4 slots used: nearest same-team colony (OG game.js:12004)
  u.colony = e + 1; u.subState = JOB.Home;
}

// fight a target: charge, then bite (OG Q, game.js:12293-12308)
function fight(w, u, t) {
  const dx = t.x - u.x, dy = t.y - u.y;
  if ((hyp(dx, dy) || 0.001) > u.radius + t.radius + 3) {
    setState(u, S.CHARGE);
    goTo(w, u, t.x, t.y, RUN, u.los === 1 || !hasWalls(w));
    return;
  }
  setState(u, S.ENGAGE);
  u.face = Math.atan2(dy, dx);
  if (u.cooldown > 0) return;
  const soldier = u.type === 'soldierant' || u.def.risenFrom === 'soldierant';
  const bite = soldier ? BITE_SOLDIER : BITE_WORKER;
  dmg(w, perchOf(w, t), bite * (1 + signed(w) * BITE_JITTER), u); // OG game.js:12304
  sfx(w, 'strike', u.x, u.y, { type: u.type });
  hitAnim(u);
  u.cooldown = 0.6 * range(w, 0.8, 1.25); // OG game.js:12307
}

// carry the claimed corpse: walk to the carry spot, hug it (OG V, game.js:12250-12274)
function carry(w, u, e) {
  const c = u.b.job;
  if (!jobValid(c, u.b.jobTime, e)) return false;
  carrySpot(u, c, SPOT);
  const dx = SPOT[0] - u.x, dy = SPOT[1] - u.y, g = hyp(dx, dy);
  if (g > 14) {
    setState(u, S.ADVANCE);
    goTo(w, u, SPOT[0], SPOT[1], RUN, !hasWalls(w) || lineOfSight(w, u.x, u.y, SPOT[0], SPOT[1]));
    return true;
  }
  setState(u, S.ENGAGE);
  const h = Math.min(RUN, 8 * g);
  u.goalX = g > 0.5 ? dx / g * h : 0; u.goalY = g > 0.5 ? dy / g * h : 0;
  u.face = Math.atan2(c.y - u.y, c.x - u.x);
  if (u.cooldown <= 0) { hitAnim(u); u.cooldown = 0.5 * range(w, 0.8, 1.25); }
  return true;
}

// take the colony's wanted corpse job if one is open (OG J, game.js:12285-12292)
function takeJob(w, u, e) {
  const col = w.colonies, c = col.wanted[e];
  if (!c || col.wantedMore[e] <= 0) return false;
  col.wantedMore[e]--;
  u.subState = JOB.Carrying; u.b.job = c; u.b.jobTime = corpseTime(c);
  carry(w, u, e);
  return true;
}

// forage: walk out, linger, come back (OG game.js:12068-12092)
function forage(w, u) {
  const t = w.time, dx = u.b.aimX - u.x, dy = u.b.aimY - u.y, r = hyp(dx, dy);
  if (r < 8 && u.b.timer - t > 1.5 * FORAGE_LINGER) u.b.timer = t + FORAGE_LINGER * range(w, 0.6, 1.4); // OG game.js:12075
  if (t >= u.b.timer) { u.subState = r < 12 ? JOB.Returning : JOB.Home; return; } // OG game.js:12076
  if (r >= 8) {
    setState(u, S.ADVANCE);
    goTo(w, u, u.b.aimX, u.b.aimY, WALK, !hasWalls(w) || lineOfSight(w, u.x, u.y, u.b.aimX, u.b.aimY));
    return;
  }
  setState(u, S.IDLE);
  const a = 7 * u.wander + 1.6 * Math.sin(0.9 * t + 5 * u.wander); // OG game.js:12090
  u.goalX = Math.cos(a) * WALK * 0.35; u.goalY = Math.sin(a) * WALK * 0.35;
}

// Ant brain, every tick (OG game.js:12007-12141)
function antBrain(w, u) {
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return; }
  const tgt = getTarget(w, u);
  if (u.state === S.FLEE) { flee(w, u, tgt, RUN); return; }
  const col = w.colonies, e = (u.colony || 0) - 1;
  if (!(e >= 0 && col && col.alive[e] === 1)) { // no live colony (OG game.js:12014-12016)
    if (tgt) fight(w, u, tgt);
    else if (!followIntel(w, u, WALK, 4)) setState(u, S.IDLE);
    return;
  }
  const settled = col.state[e] === SETTLED, cx = col.x[e], cy = col.y[e];
  const hill = settled ? unit(w, col.hill[e]) : null;
  let foe = unit(w, col.foe[e]);
  if (col.foe[e] >= 0 && (!foe || foe.hp <= 0 || hyp(foe.x - cx, foe.y - cy) > FOE_LEASH)) { col.foe[e] = -1; foe = null; } // OG game.js:12021-12023
  if (tgt) { // OG game.js:12024-12029
    const nearHill = hyp(tgt.x - cx, tgt.y - cy) - tgt.radius < HILL_SENSE + (settled ? (hill ? hill.radius : 0) : 40);
    const close = hyp(tgt.x - u.x, tgt.y - u.y) - tgt.radius - u.radius < 30;
    if (nearHill || close || tgt === foe || u.subState === JOB.Defending) {
      u.subState = JOB.Defending; u.b.timer = w.time + OUT_TIMER; fight(w, u, tgt); return;
    }
  }
  if (u.subState === JOB.Defending) { // OG game.js:12030-12054
    const until = Math.max(u.b.timer, col.alarmUntil[e]);
    const r = w.time >= until ? null : foe ? foe : nearestByFaction(w, cx, cy, 1.5 * HILL_SENSE, 0, col.faction(e));
    if ((!r || hyp(r.x - u.x, r.y - u.y) > 150) && takeJob(w, u, e)) return;
    if (r) {
      if (r === foe) u.b.timer = w.time + OUT_TIMER;
      setState(u, S.CHARGE);
      goTo(w, u, r.x, r.y, RUN, u.los === 1 || !hasWalls(w));
      return;
    }
    if (w.time < until && settled) { // patrol a ring round the hill (OG game.js:12040-12052)
      setState(u, S.ALERT);
      const rad = (hill ? hill.radius : 0) + 26 + 10 * Math.abs(u.wander);
      const a = u.wander * Math.PI + 0.35 * Math.sin(0.6 * w.time + u.index);
      const ox = cx + Math.cos(a) * rad - u.x, oy = cy + Math.sin(a) * rad * 0.7 - u.y, g = hyp(ox, oy);
      if (g > 4) { const sp = Math.min(0.8 * RUN, 3 * g); u.goalX = ox / g * sp; u.goalY = oy / g * sp; }
      if (g < 14) u.face = Math.atan2(u.y - cy, u.x - cx);
      return;
    }
    u.subState = JOB.Home;
  }
  if (!settled) { // circle the scouting centroid (OG game.js:12055-12061)
    setState(u, S.IDLE);
    const a = u.wander * Math.PI + 0.7 * w.time;
    const ox = cx + 18 * Math.cos(a) - u.x, oy = cy + 12 * Math.sin(a) - u.y, g = hyp(ox, oy);
    if (g > 6) { u.goalX = ox / g * WALK; u.goalY = oy / g * WALK; }
    return;
  }
  if (!hill) return;
  if (u.subState === JOB.Carrying) { if (carry(w, u, e)) return; u.subState = JOB.Home; } // OG game.js:12064-12067
  if (u.subState === JOB.Foraging) { forage(w, u); return; }
  if (u.subState === JOB.Digging && w.time < u.b.timer) { // OG game.js:12093-12118
    const dx = u.b.aimX - u.x, dy = u.b.aimY - u.y, r = hyp(dx, dy);
    if (r > (u.state === S.ENGAGE ? 10 : 4)) {
      setState(u, S.ADVANCE); goTo(w, u, u.b.aimX, u.b.aimY, WALK, true); return;
    }
    setState(u, S.ENGAGE);
    if (r > 2) { const sp = Math.min(WALK, 3 * r); u.goalX = dx / r * sp; u.goalY = dy / r * sp; }
    u.face = Math.atan2(cy - u.y, cx - u.x);
    col.dug[e] += (1 / 60) * 2; // 2 dug per second (OG game.js:12104)
    if (u.cooldown <= 0) {
      hitAnim(u);
      u.cooldown = 0.45 * range(w, 0.8, 1.25); // OG game.js:12106
      if (rnd(w) < 0.3) sfx(w, 'puff', u.x + 6 * Math.cos(u.face), u.y + 6 * Math.sin(u.face), { kind: 'dust', angle: u.face + Math.PI, size: 0.25 });
    }
    return;
  }
  if (u.subState !== JOB.Returning && takeJob(w, u, e)) return; // OG game.js:12120
  if (u.subState !== JOB.Returning) u.subState = JOB.Home;
  const k = Math.max(1, hill.b.entrances); // head home to the nearest entrance (OG game.js:12122-12140)
  let best = 0, bd = Infinity;
  for (let n = 0; n < k; n++) { entrance(hill, n, ENT); const d = hyp(ENT[0] - u.x, ENT[1] - u.y); if (d < bd) { bd = d; best = n; } }
  entrance(hill, best, ENT);
  if (bd < 5) { // go inside (OG game.js:12130-12139)
    if (u.type === 'soldierant') col.soldiers[e]++; else col.workers[e]++;
    if (u.subState === JOB.Returning) col.food[e] += 0.3;
    if (u.group >= 0 && w.groups && w.groups.leave) w.groups.leave(u.group);
    w.remove(u);
    return;
  }
  setState(u, S.ADVANCE);
  goTo(w, u, ENT[0], ENT[1], 1.3 * WALK, true);
}

// hurt near the hill (or while defending): colony alarm, attacker becomes the foe (OG game.js:12142-12149)
function antOnHit(w, u, amount, att) {
  const col = w.colonies, n = (u.colony || 0) - 1;
  if (n < 0 || !att || !col || col.alive[n] === 0 || col.state[n] !== SETTLED) return;
  if (hyp(u.x - col.x[n], u.y - col.y[n]) < HILL_SENSE + HURT_RANGE || u.subState === JOB.Defending) {
    col.alarmUntil[n] = w.time + ALARM_TIME; col.foe[n] = att.id;
  }
}

registerUnit({
  type: 'ant',
  og: 'Ant', // OG game.js:11941
  swims: true, // OG game.js:11942
  category: 'animals', // OG game.js:11943
  faction: fac('Ants'), // OG game.js:11944
  bug: true, // OG game.js:11945
  radius: 5.2, // OG game.js:11946
  radiusJitter: 0.08, // OG game.js:11947
  mass: 0.6, // OG game.js:11948
  maxHp: 30, // OG game.js:11949
  melee: true, // OG game.js:11950
  strength: 0.3, // OG game.js:11951
  locomotion: LOCO.Holonomic, // OG game.js:11952
  walkSpeed: 48, // OG game.js:11953
  runSpeed: 100, // OG game.js:11954
  maxSpeed: 115, // OG game.js:11955
  accel: 600, // OG game.js:11956
  decel: 600, // OG game.js:11957
  turnRate: 7, // OG game.js:11958
  turnSpeedFalloff: Infinity, // OG game.js:11959
  sightRange: 170, // OG game.js:11960
  alertSightRange: 220, // OG game.js:11961
  stickyTarget: true, // OG game.js:11962
  reactionTime: 0.2, // OG game.js:11963
  huntRange: Infinity, // OG game.js:11964
  minDistance: 0, // OG game.js:11965
  drilled: false, // OG game.js:11966
  intelligence: INTEL.Animal, // OG game.js:11967
  infectable: true, // OG game.js:11968
  turnsWhenKilled: false, // OG game.js:11969
  flammability: 0.8, // OG game.js:11970
  swarms: true, // OG game.js:11971
  brushSpacing: 14, // OG game.js:11972
  flock: {
    personalSpace: 1.05, // OG game.js:11973
    separation: 26, // OG game.js:11973
    alignment: 0.4, // OG game.js:11271
    cohesion: 0.3, // OG game.js:11272
    formation: 0, // OG game.js:11273
    herd: 0.5, // OG game.js:11973
    herdSpacing: 6, // OG game.js:11973
    idleSpread: 1.8, // OG game.js:11276
    flockByState: [1, 0.6, 0.15, 1, 0.2, 0.5], // OG game.js:11277
    formationByState: [0, 0, 0, 0, 0, 0], // OG game.js:11278
  },
  morale: {
    baseline: 1, // OG game.js:11974
    oddsWeight: 0.55, // OG game.js:9952
    fearWeight: 0, // OG game.js:9953
    casualtyWeight: 0, // OG game.js:9954
    woundWeight: 0, // OG game.js:9955
    hitShock: 0, // OG game.js:9956
    suppression: 0, // OG game.js:9957
    canBreak: false, // OG game.js:11974
    breakAt: 0.22, // OG game.js:9959
    rallyAt: 0.55, // OG game.js:9960
    minFleeTime: 2.5, // OG game.js:9961
    dropRate: 3.2, // OG game.js:9962
    recoverRate: 0.2, // OG game.js:9963
    panicFear: 0.5, // OG game.js:9964
    deathFear: 0.1, // OG game.js:11974
  },
  look: {
    attack: {
      time: 0.22, // OG game.js:11981
      kick: 0.9, // OG game.js:11981
    },
  },
  init: antInit,
  brain: antBrain,
  onHit: antOnHit,
});
