// ARMY shared pieces: the Soldier flock/morale blocks other Army defs reuse, the Cavalry morale block,
// and our own ports of the OG brain helpers the Army brains call. Owner: ARMY. Not a unit file.
// Core calls go through the ARCH contract (CORE-A world, CORE-B combat). Namespace imports + a small local
// fallback keep a renamed/missing helper from breaking the load; each fallback is listed under "Asks".
// Every rule and number cites OG game.js:<line>.
import * as C from '../../const.js';
import * as FAC from '../../factions.js';
import * as CB from '../../combat/index.js';
import * as ENV from '../../combat/env.js';
import * as ST from '../../combat/status.js';
import * as DMG from '../../combat/damage.js';
import * as FIRE from '../../combat/fire.js';
import * as NAV from '../../systems/navigation.js';
import { getDef, getRisenType } from '../../defs.js';

// ---------------------------------------------------------------- enums (OG numbering)
export const DT = C.DT; // OG game.js:8656
export const S = C.STATE; // Idle 0, Advance 1, Engage 2, Alert 3, Charge 4, Flee 5 (OG game.js:9219)
export const LOCO = { Holonomic: 0, Vehicle: 1 }; // OG game.js:8508
export const INTEL = { Mindless: 0, Animal: 1, Trained: 2 }; // OG game.js:8442
// OG faction ids (game.js:8370-8395); same numbers as factions.js F.
export const FACTION = {
  Soldiers: 0, Wild: 1, Undead: 2, Flamers: 3, Snipers: 4, Romans: 5, Grenadiers: 6, Archers: 7, Slimes: 8, Props: 9,
  Knights: 10, Strays: 11, Mages: 12, Giants: 13, Rats: 14, Ants: 15, Apes: 16, Reptiles: 17, Piranhas: 18, Dragons: 19,
  TeamLeft: 20, TeamRight: 21, Snakes: 23, Necromancers: 24, Ninjas: 25, Cheetahs: 26,
};
export const MAX_R = 46; // max unit radius margin added to radius queries (OG game.js:8667)
export const PERCH_H = 26; // climb height px per climb unit (OG game.js:9014)

// ---------------------------------------------------------------- shared def blocks
// Soldier flock (OG game.js:9939-9949). Flamethrower, Grenadier, Archer, Knight reuse it as is;
// Sniper and Ninja spread it with overrides (OG game.js:3929, 4050, 17816, 12917, 16403, 18284).
export const SOLDIER_FLOCK = Object.freeze({
  personalSpace: 1.25, // OG game.js:9940
  separation: 38, // OG game.js:9941
  alignment: 0.3, // OG game.js:9942
  cohesion: 0, // OG game.js:9943
  formation: 1.2, // OG game.js:9944
  herd: 0, // OG game.js:9945
  herdSpacing: 0, // OG game.js:9946
  flockByState: [1, 1, 0.3, 1, 0.3, 0.25], // OG game.js:9947
  formationByState: [1, 1, 0.35, 1, 0, 0], // OG game.js:9948
});
// Soldier morale (OG game.js:9950-9966). Flamethrower, Grenadier, Archer, Sniper reuse it; Ninja spreads it.
export const SOLDIER_MORALE = Object.freeze({
  baseline: 0.82, // OG game.js:9951
  oddsWeight: 0.55, // OG game.js:9952
  fearWeight: 0, // OG game.js:9953
  casualtyWeight: 0, // OG game.js:9954
  woundWeight: 0, // OG game.js:9955
  hitShock: 0, // OG game.js:9956
  suppression: 0, // OG game.js:9957
  canBreak: true, // OG game.js:9958
  breakAt: 0.22, // OG game.js:9959
  rallyAt: 0.55, // OG game.js:9960
  minFleeTime: 2.5, // OG game.js:9961
  dropRate: 3.2, // OG game.js:9962
  recoverRate: 0.2, // OG game.js:9963
  panicFear: 0.5, // OG game.js:9964
  deathFear: 1, // OG game.js:9965
});
// Cavalry morale `I`, shared by Cavalry, Knight and Horse (OG game.js:12640-12656).
export const CAVALRY_MORALE = Object.freeze({
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
});
// Cavalry flock (OG game.js:12693-12703); Horse spreads it.
export const CAVALRY_FLOCK = Object.freeze({
  personalSpace: 1.2, // OG game.js:12694
  separation: 40, // OG game.js:12695
  alignment: 0.35, // OG game.js:12696
  cohesion: 0.1, // OG game.js:12697
  formation: 0.8, // OG game.js:12698
  herd: 0, // OG game.js:12699
  herdSpacing: 0, // OG game.js:12700
  flockByState: [1, 1, 0.2, 1, 0.3, 0], // OG game.js:12701
  formationByState: [1, 1, 0, 1, 0, 0], // OG game.js:12702
});
// Trample config `P` (OG game.js:12628-12639), used by Cavalry and Horse brains.
export const TRAMPLE = Object.freeze({
  fullSpeed: 290, // OG game.js:12627 (N = 290), 12629
  minSpeed: 130, // OG game.js:12630
  damage: 55, // OG game.js:12631
  knockback: 180, // OG game.js:12632
  stun: 0.6, // OG game.js:12633
  tossChance: 0.3, // OG game.js:12634
  tossUp: 470, // OG game.js:12635
  tossSpeed: 190, // OG game.js:12636
  slowdown: 0.72, // OG game.js:12637
  infectChance: 0.5, // OG game.js:12638
});
export const TRAMPLE_TOSS_MIN_PASS = 0.6; // toss only if pass >= 0.6 (OG game.js:250, 279)
export const TRAMPLE_REACH = 1.5; // r + r_other + 1.5 (OG game.js:251, 268)
export const TRAMPLE_VICTIM_COOLDOWN = 0.35; // OG game.js:292

// ---------------------------------------------------------------- tiny utils
export const rnd = (w) => w.rng(); // OG next()
export const range = (w, a, b) => a + (b - a) * w.rng(); // OG range(a,b) (game.js:2691)
export const signed = (w) => 2 * w.rng() - 1; // OG signed() (game.js:2694-2696)
export const tri = (w) => w.rng() - w.rng(); // OG tri() (game.js:2697-2699)
export const rint = (w, n) => Math.floor(w.rng() * n); // OG int(n)
export const hyp = (x, y) => Math.sqrt(x * x + y * y);
export const angDiff = C.angleDiff; // wrap(to − from) (OG 392.b)
export const turnToward = C.turnToward; // OG 392.e
// Staggered per-unit roll in [0,1): our own integer hash of (unit, tick). Plays the role of OG 392.f.
export function hashRoll(id, tick) {
  let h = Math.imul((id | 0) ^ 0x5bd1e995, 0x27d4eb2d) + Math.imul(tick | 0, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } } // OG game.js:9220-9222
export function isUndead(u) { const d = u.def; return !!(d.risenFrom !== undefined || (d.look && d.look.undead)); }
export function alive(t) { return !!t && !t.dead && !t.removed && t.hp > 0; }
// Current target, cleared when gone or dead (OG 412.z, game.js:8774-8781).
export function targetOf(w, u) {
  if (u.target == null || u.target < 0) return null;
  const t = w.unitById(u.target);
  if (t && !t.removed && t.hp > 0) return t;
  u.target = -1; return null;
}
// Target peek without clearing (OG `isCurrent` reads in the sniper module, game.js:16429, 16511, 16531).
export function peekTarget(w, u) {
  if (u.target == null || u.target < 0) return null;
  const t = w.unitById(u.target);
  return t && !t.removed ? t : null;
}
// Attack pose: OG `attack = 1` (decays by dt / look.attack.time in the brain system, game.js:5009).
export function setAttack(u) { u.attack = 1; }
export function attackOf(u) { return u.attack || 0; }
export function emit(w, name, data) { if (typeof w.emit === 'function') w.emit(name, data); }

// ---------------------------------------------------------------- world reads
export function anyWalls(w) { const W = w.walls; if (W && typeof W.count === 'number') return W.count > 0; return typeof w.wallCount === 'number' ? w.wallCount > 0 : true; }
export function anyWater(w) { return typeof w.waterCells === 'number' ? w.waterCells > 0 : true; }
// LOS flag from perception: `los === 1 || walls.count === 0` (OG game.js:10393, 3954).
export function hasLos(w, u) { return u.los === 1 || u.los === true || u.los === undefined || !anyWalls(w); }
export function wallLine(w, x0, y0, x1, y1) {
  if (!anyWalls(w)) return true;
  if (typeof w.lineOfSight === 'function') return w.lineOfSight(x0, y0, x1, y1);
  return ENV.lineOfSight ? ENV.lineOfSight(w, x0, y0, x1, y1) : true;
}
export function wallRaycast(w, x0, y0, x1, y1) {
  if (w.walls && typeof w.walls.raycast === 'function') return w.walls.raycast(x0, y0, x1, y1);
  return ENV.raycast ? ENV.raycast(w, x0, y0, x1, y1) : Infinity;
}
export function solidAt(w, x, y) { return typeof w.wallAt === 'function' ? w.wallAt(x, y) === 1 : false; }
// wetAt (OG game.js:9824-9829): not airborne, not climbing, depth (0 over ice) >= 0.05.
export function wetAt(w, u) {
  if (u.z > 0 || (u.climb || 0) !== 0) return false;
  const d = u.def.aquatic ? (typeof w.depthUnder === 'function' ? w.depthUnder(u.x, u.y) : w.waterAt(u.x, u.y)) : w.waterAt(u.x, u.y);
  return d >= C.WET;
}
// Nearest wet tile centre within r (OG game.js:9835-9866: square rings, first ring with a hit decides).
export function nearestWet(w, x, y, r, out) {
  if (typeof w.nearestWet === 'function') return w.nearestWet(x, y, r, out);
  if (!anyWater(w) || !w.water) return false;
  const T = C.WALL_TILE, cols = w.tileCols || w.wallW, rows = w.tileRows || w.wallH;
  if (!cols || !rows) return ENV.nearestWet ? ENV.nearestWet(w, x, y, r, out) : false;
  const cx = Math.floor(x / T), cy = Math.floor(y / T), R = Math.ceil(r / T), water = w.water, ice = w.ice;
  for (let k = 0; k <= R; k++) {
    let best = -1, bd = Infinity;
    for (let ty = cy - k; ty <= cy + k; ty++) {
      if (ty < 0 || ty >= rows) continue;
      const edge = ty === cy - k || ty === cy + k;
      for (let tx = cx - k; tx <= cx + k; tx += (edge || k === 0) ? 1 : 2 * k) {
        if (tx < 0 || tx >= cols) continue;
        const i = ty * cols + tx;
        if (water[i] < C.WET || (ice && ice[i] > 0)) continue;
        const d = ((tx + 0.5) * T - x) ** 2 + ((ty + 0.5) * T - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best >= 0) {
      if (bd > r * r) return false;
      out[0] = ((best % cols) + 0.5) * T; out[1] = (Math.floor(best / cols) + 0.5) * T; return true;
    }
  }
  return false;
}
export function mineCount(w) { return w.mines && typeof w.mines.count === 'number' ? w.mines.count : 0; }
export function minesBlock(w, x0, y0, x1, y1, r) { return mineCount(w) > 0 && typeof w.mines.blocks === 'function' ? !!w.mines.blocks(x0, y0, x1, y1, r) : false; }
export function noise(w, x, y, amount, r) { if (ENV.splatNoise) ENV.splatNoise(w, x, y, amount, r); }

// ---------------------------------------------------------------- groups (CORE-A SoA, OG names)
export function grpAlive(w, g) { const G = w.groups; return !!G && g != null && g >= 0 && (!G.alive || G.alive[g] === 1); }
export function markEngaged(w, g) { if (g >= 0 && w.groups && typeof w.groups.markEngaged === 'function') w.groups.markEngaged(g); } // OG game.js:2377-2379
export function leaveGroup(w, u) { const g = u.group; if (g >= 0 && w.groups && typeof w.groups.leave === 'function') w.groups.leave(g); u.group = -1; } // OG g.leave

// ---------------------------------------------------------------- movement helpers (our ports)
const _out = new Float32Array(2);
// 447.c (game.js:9448-9460): straight at (x,y) if the line is clear, else follow the faction flow field.
export function pathTo(w, u, x, y, speed, clear) {
  if (typeof NAV.moveTo === 'function') return NAV.moveTo(w, u, x, y, speed, clear); // CORE-A ships 447.c
  const def = u.def;
  const careful = !(u.burning > 0 || u.state === S.FLEE) && mineCount(w) > 0 && (def.mineAware ?? FAC.mineAware(def)); // OG 526.d, 8344
  if (clear && careful && minesBlock(w, u.x, u.y, x, y, u.radius + C.MINE_AVOID)) clear = false; // OG game.js:9452
  if (!clear && (anyWalls(w) || careful) && w.nav && typeof w.nav.direction === 'function' &&
      w.nav.direction(u.faction, u.x, u.y, _out, careful)) {
    u.goalX = _out[0] * speed; u.goalY = _out[1] * speed; u.pathing = 1; return; // OG game.js:9453-9455
  }
  const dx = x - u.x, dy = y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
  u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed;
}
// 447.v (game.js:9488-9500): keep the unit's sideways offset from the group axis, ×0.85.
function sideKeep(w, u, g, px, py, out) {
  const G = w.groups, ax = px - G.cx[g], ay = py - G.cy[g], d = Math.sqrt(ax * ax + ay * ay) || 1, fx = ax / d, fy = ay / d;
  const ox = u.x - G.cx[g], oy = u.y - G.cy[g], along = ox * fx + oy * fy;
  out[0] = px + (ox - along * fx) * 0.85; out[1] = py + (oy - along * fy) * 0.85; // OG game.js:9490 (l = 0.85)
}
// 447.a (game.js:9461-9487): no target → walk to group contact / hunt intel. Returns true if it set a goal.
export function followContact(w, u, speed, memory) {
  if (typeof NAV.followGroup === 'function') return NAV.followGroup(w, u, speed, memory); // CORE-A ships 447.a
  const g = u.group;
  if (!grpAlive(w, g)) return false;
  const G = w.groups, rt = u.reactTime || 0;
  const fresh = G.contactAge[g] < memory, intel = G.hasIntel[g] === 1;
  let px, py;
  if (fresh && w.time - G.contactSince[g] >= rt) { px = G.contactX[g]; py = G.contactY[g]; }
  else if (intel && w.time - G.intelSince[g] >= rt) { px = G.intelX[g]; py = G.intelY[g]; }
  else {
    const s = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
    if ((!fresh && !intel) || u.state !== S.ADVANCE || s < 0.3 * speed) return false; // OG game.js:9478
    u.goalX = (u.vx / s) * speed; u.goalY = (u.vy / s) * speed; return true;
  }
  sideKeep(w, u, g, px, py, _out); px = _out[0]; py = _out[1];
  const dx = px - u.x, dy = py - u.y;
  if (dx * dx + dy * dy < 576) return false; // within 24 px (OG game.js:9485)
  setState(u, S.ADVANCE); pathTo(w, u, px, py, speed, false); return true;
}
// 447.b (game.js:9501-9510): the point to head for: fresh contact, else intel (both offset), else the target.
export function contactPoint(w, u, t, memory, out) {
  if (typeof NAV.groupPoint === 'function') return NAV.groupPoint(w, u, t, memory, out); // CORE-A ships 447.b
  const g = u.group, G = w.groups;
  if (grpAlive(w, g) && G.contactAge[g] < memory) { sideKeep(w, u, g, G.contactX[g], G.contactY[g], out); return true; }
  if (grpAlive(w, g) && G.hasIntel[g] === 1) { sideKeep(w, u, g, G.intelX[g], G.intelY[g], out); return true; }
  if (t) { out[0] = t.x; out[1] = t.y; return true; }
  return false;
}
// 495.d (game.js:10447-10451): in range, with hysteresis ×1.1 + 6 while already engaged.
export function inRange(u, d, range) { if (u.state === S.ENGAGE) range = range * 1.1 + 6; return d <= range; }
// 495.b (game.js:10452-10455): past range → walk in at 0.6·walkSpeed.
export function closeIn(u, dx, dy, d, range, def) { if (d <= range) return; u.goalX = (dx / d) * def.walkSpeed * 0.6; u.goalY = (dy / d) * def.walkSpeed * 0.6; }
// 495.a (game.js:10456-10460): Advance toward the target, pathing if no line of sight; face it when the line is clear.
export function advance(w, u, t, dx, dy, clear, speed) {
  setState(u, S.ADVANCE); pathTo(w, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(dy, dx);
}
// 495.c (game.js:10461-10477): sidestep a charger coming straight at us, else back off inside minDistance.
export function sidestep(u, t, dx, dy, d, def) {
  const tvx = t.vx, tvy = t.vy, ts = Math.sqrt(tvx * tvx + tvy * tvy);
  if (t.state === S.CHARGE && d < 70 && ts > 60 && -(tvx * dx + tvy * dy) / (ts * d) > 0.8) { // OG game.js:10465-10467
    const cr = tvy * dx - tvx * dy, sx = cr >= 0 ? -tvy : tvy, sy = cr >= 0 ? tvx : -tvx;
    u.goalX = (sx / ts) * def.runSpeed; u.goalY = (sy / ts) * def.runSpeed; return;
  }
  if (d < def.minDistance) { u.goalX = (-dx / d) * def.walkSpeed * 0.5; u.goalY = (-dy / d) * def.walkSpeed * 0.5; } // OG game.js:10476
}
// 497.b (game.js:10602-10624): odds push toward (b < 0.8) or away (b > 1.25) from the target.
export function oddsPush(w, u, t, dx, dy, d, def) {
  let b = u.odds;
  if (!(b > 0)) {
    const G = w.groups, g = u.group, h = t.group;
    if (!grpAlive(w, g) || h == null || h < 0 || !G || G.size[g] === 0) b = 1;
    else b = (G.size[h] * t.def.strength) / (G.size[g] * def.strength); // OG game.js:10611-10612
  }
  const nx = dx / d, ny = dy / d;
  if (b < 0.8) { // OG game.js:10614
    if (!def.melee && d < def.minDistance + 30) return; // OG game.js:10617
    const k = Math.min(1, (0.8 - b) / (0.8 - 0.45)) * 0.4 * def.walkSpeed; // OG game.js:10618
    u.goalX += nx * k; u.goalY += ny * k;
  } else if (b > 1.25 && def.morale.canBreak) { // OG game.js:10620
    const k = Math.min(1, (b - 1.25) / (1.9 - 1.25)) * 0.35 * def.walkSpeed; // OG game.js:10621
    u.goalX -= nx * k; u.goalY -= ny * k;
  }
}
// 497.a (game.js:10625-10636): strafe round the target; back-step while the swing pose is above 0.45.
export function circle(u, t, dx, dy, d, def, circ, backStep) {
  const nx = dx / d, ny = dy / d;
  const side = u.detour ? Math.sign(u.detour) : (u.index & 1 ? 1 : -1);
  const m = Math.max(0, Math.min(1, 1 - ((t.attackers || 0) - 2) / (5 - 2))); // OG game.js:10629
  const s = 0.3 * circ * m * def.walkSpeed * side; // OG game.js:10630
  u.goalX += -ny * s; u.goalY += nx * s;
  const a = attackOf(u);
  if (backStep && a > 0.45) { const k = 0.9 * def.walkSpeed * a; u.goalX -= nx * k; u.goalY -= ny * k; } // OG game.js:10632-10634
}
// 412.l flee steer (game.js:9182-9209). CORE-B ships it as fleeSteer.
export function flee(w, u, t, speed) {
  if (typeof ST.fleeSteer === 'function') return ST.fleeSteer(w, u, t, speed);
  let hx = -(u.threatX || 0), hy = -(u.threatY || 0);
  if (hx * hx + hy * hy < 1e-6) { if (t) { hx = u.x - t.x; hy = u.y - t.y; } else { hx = Math.cos(u.heading); hy = Math.sin(u.heading); } }
  let d = hyp(hx, hy) || 1; hx /= d; hy /= d;
  if (u.burning > 0) {
    u.wander = (u.wander || 0) + 9 * signed(w) * DT; // OG game.js:9193
    if (anyWater(w) && u.def.intelligence !== INTEL.Mindless && nearestWet(w, u.x, u.y, 220, _out)) {
      const ax = _out[0] - u.x, ay = _out[1] - u.y, ad = hyp(ax, ay) || 1;
      hx = (ax / ad) * 0.8 + 0.2 * Math.cos(u.wander); hy = (ay / ad) * 0.8 + 0.2 * Math.sin(u.wander);
    } else { hx = 0.35 * hx + 0.65 * Math.cos(u.wander); hy = 0.35 * hy + 0.65 * Math.sin(u.wander); }
  }
  const e = 90; // OG game.js:9203
  if (u.x < e) hx += (e - u.x) / e; else if (u.x > w.W - e) hx -= (u.x - (w.W - e)) / e;
  if (u.y < e) hy += (e - u.y) / e; else if (u.y > w.H - e) hy -= (u.y - (w.H - e)) / e;
  d = hyp(hx, hy) || 1; u.goalX = (hx / d) * speed; u.goalY = (hy / d) * speed;
}
// 613.a startle step (game.js:16257-16274). CORE-B ships it as startleStep.
export function startled(w, u, speed) {
  if (typeof ST.startleStep === 'function') return ST.startleStep(w, u, speed);
  if (!(w.time < (u.startle || 0))) return false;
  const dx = u.x - u.startleX, dy = u.y - u.startleY, d = hyp(dx, dy);
  setState(u, S.FLEE);
  if (d > 0.001) { u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed; } else { u.goalX = Math.cos(u.heading) * speed; u.goalY = Math.sin(u.heading) * speed; }
  return true;
}
// 412.A dodge warning (game.js:8960-8978). CORE-B ships it as dodgeWarn.
export function dodgeWarn(w, x, y, blastRadius, flight) {
  if (typeof ST.dodgeWarn === 'function') return ST.dodgeWarn(w, x, y, blastRadius, flight);
  w.query(x, y, blastRadius + MAX_R + 6, (o) => {
    if (!(o.hp > 0) || !(o.def.intelligence >= INTEL.Trained)) return;
    const rt = o.reactTime || 0; if (rt >= flight) return;
    let dx = o.x - x, dy = o.y - y, d = hyp(dx, dy);
    if (d < 0.001) { const a = rnd(w) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
    o.dodgeX = dx / d; o.dodgeY = dy / d; o.dodgeDelay = rt; o.dodgeTime = flight - rt + 0.25;
  });
}

// ---------------------------------------------------------------- combat helpers
export function damage(w, t, amount, src, kind, fx, fy) { return CB.damage(w, t, amount, src, kind, fx, fy); } // OG 412.h
export function push(w, t, dx, dy, f, stunT) { return CB.push(w, t, dx, dy, f, stunT); } // OG 412.p
export function toss(w, t, dx, dy, out, up) { return CB.toss(w, t, dx, dy, out, up); } // OG 412.y
// A blow on a climbing unit lands on its perch (OG 412.B, game.js:9051-9056).
export function perchOf(w, t) {
  if (typeof DMG.perchOf === 'function') return DMG.perchOf(w, t);
  if (!(t.climb > 0)) return t;
  const p = t.perch >= 0 ? w.unitById(t.perch) : null; return p || t;
}
// Blocked hit spark + block sound (OG 412.g, game.js:8996-9006).
export function blockFx(w, att, victim, pass) {
  if (pass >= 1) return;
  if (typeof DMG.blockedSpark === 'function') return DMG.blockedSpark(w, att, victim, pass);
  emit(w, 'block', { x: victim.x, y: victim.y, v: 1 - pass, type: victim.type });
}
// One melee blow, as every OG Army melee brain writes it: redirect to perch, damage, push·m, stun·m, block spark,
// strike sound on a clean hit (Roman game.js:4629-4634, Knight 12982-12986, Cavalry 12872-12876, Ninja 18485-18489).
export function strike(w, u, t, nx, ny, dmg, pushF, stunT) {
  const v = perchOf(w, t);
  const m = damage(w, v, dmg, u, 'blow');
  push(w, v, nx, ny, pushF * m, stunT * m);
  blockFx(w, u, t, m);
  if (m >= 1) emit(w, 'strike', { x: v.x, y: v.y, v: 1, type: u.type });
  return m;
}
// Forced ignite (OG 412.m, game.js:8847-8863), e.g. a dismounted Knight catching the horse's fire.
export function igniteNow(w, u, base) {
  if (typeof FIRE.igniteNow === 'function') return FIRE.igniteNow(w, u, base);
  return CB.ignite(w, u, Infinity, base);
}
export function infect(w, target, attacker, chance, timer) { return CB.infect(w, target, attacker, chance, timer); } // OG 412.n

// 1074.a trample (game.js:252-301): hit everyone in front within r + r_other + 1.5, scaled by speed/fullSpeed.
// maskFn(u, other) picks victims: default = enemies only (OG game.js:254).
const _tr = new Array(16);
let _trN = 0, _trU = null, _trPick = null;
function trampleCand(o) { if (o !== _trU && _trPick(_trU, o)) { _tr[_trN++] = o; if (_trN >= 16) return true; } } // cap 16 (OG game.js:258)
export function trample(w, u, speed, P, maskFn) {
  const r = u.radius, hx = Math.cos(u.heading), hy = Math.sin(u.heading), undead = isUndead(u);
  _trN = 0; _trU = u; _trPick = maskFn || FAC.isHostile;
  w.query(u.x, u.y, r + MAX_R + TRAMPLE_REACH, trampleCand); // OG game.js:258
  const n = _trN; _trU = null; _trPick = null;
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const o = _tr[k]; _tr[k] = null;
    if (!(o.hp > 0) || o.dead || (o.climb || 0) > 0) continue; // OG game.js:263
    if (o.id === u.lastVictim && u.cooldown > 0) continue; // OG game.js:264
    const dx = o.x - u.x, dy = o.y - u.y;
    if (hyp(dx, dy) > r + o.radius + TRAMPLE_REACH) continue; // OG game.js:268
    if (dx * hx + dy * hy < 0) continue; // in front only (OG game.js:269)
    const j = Math.min(1, speed / P.fullSpeed); // OG game.js:273
    const m = damage(w, o, P.damage * j, u, 'blow'); // OG game.js:274
    emit(w, 'trample', { x: o.x, y: o.y, v: j, type: u.type });
    if (undead) infect(w, o, u, P.infectChance * m, 0); // OG game.js:275
    const side = hx * dy - hy * dx >= 0 ? 1 : -1; // OG game.js:276
    const px = 0.8 * hx - hy * side * 0.6, py = 0.8 * hy + hx * side * 0.6; // OG game.js:277-278
    if (m >= TRAMPLE_TOSS_MIN_PASS && rnd(w) < P.tossChance) toss(w, o, px, py, P.tossSpeed * j * m, P.tossUp * j * m); // OG game.js:279-280
    else push(w, o, px, py, P.knockback * j * m, P.stun * m); // OG game.js:281
    const brace = (o.def.shield && o.def.shield.brace) || 0;
    if (m < 1 && brace > 0) damage(w, u, brace * j, o, 'blow'); // shield brace hurts the rider (OG game.js:282-287)
    u.vx *= P.slowdown; u.vy *= P.slowdown; speed *= P.slowdown; // OG game.js:288-290
    u.lastVictim = o.id; u.cooldown = TRAMPLE_VICTIM_COOLDOWN; setAttack(u); // OG game.js:291-293
    if (w.stats) w.stats.impacts = (w.stats.impacts || 0) + 1;
    hits++;
    if (speed < P.minSpeed) break; // OG game.js:296
  }
  return hits;
}
export const ALL_BUT_PROPS = (u, o) => o.faction !== FACTION.Props; // mask `V` (OG game.js:12993)

// Rats or snakes near → flee from them (Cavalry/Horse `W`, OG game.js:12832-12847). Rat sum: 1/d-weighted away vector over
// rats whose edge is within r (OG game.js:11484-11500). Snake sum: same over the closest body point, from ANIMALS'
// world.snakes.repel (OG 616.d, game.js:16830-16856); head-only if that registry is missing.
const SCARE = Object.freeze({
  gap: 50, // rats/snakes within r + 50 ... (OG game.js:12833 F = 50)
  gapFleeing: 130, // ... or r + 130 while fleeing (OG game.js:12834 G = 130)
  queryPad: 10, // rats queried within r + 10 (OG game.js:11487)
});
const _sc = new Float32Array(2);
let _ssx = 0, _ssy = 0, _ssn = 0, _ssu = null, _ssr = 0;
// OG queries rats with mask Rats|Undead|TeamLeft|TeamRight and stops at 48 hits (game.js:11483-11487). L3 11-14: before,
// every faction was scanned with no cap (cavalry/horse brain 7.7 ms a tick at 3.4k cavalry, OG's whole tick 7.5 ms).
const RAT_MASK = (1 << FACTION.Rats) | (1 << FACTION.Undead) | (1 << FACTION.TeamLeft) | (1 << FACTION.TeamRight), RAT_MAX = 48;
const SNAKE_MASK = (1 << FACTION.Snakes) | (1 << FACTION.Undead) | (1 << FACTION.TeamLeft) | (1 << FACTION.TeamRight);
let _ssk = 0;
function scareAdd(o) {
  const ax = _ssu.x - o.x, ay = _ssu.y - o.y, d = Math.max(hyp(ax, ay), 0.001);
  _ssx += ax / (d * d); _ssy += ay / (d * d); _ssn++;
}
function scareRat(o) {
  if (++_ssk > RAT_MAX) return true;
  if (!(o.hp > 0) || (o.type !== 'rat' && o.type !== 'risen_rat')) return;
  if (hyp(_ssu.x - o.x, _ssu.y - o.y) - o.radius > _ssr) return;                // OG game.js:11497
  scareAdd(o);
}
function scareHead(o) { // no snake registry (a world without ANIMALS' snakes): count heads only
  if (!(o.hp > 0) || (o.type !== 'snake' && o.type !== 'risen_snake')) return;
  if (Math.max(hyp(_ssu.x - o.x, _ssu.y - o.y), 0.001) > _ssr + o.radius) return; // OG game.js:16848
  scareAdd(o);
}
export function ratSnakeScare(w, u, speed) {
  _ssr = u.radius + (u.state === S.FLEE ? SCARE.gapFleeing : SCARE.gap); // OG game.js:12838
  const reg = w.snakes && typeof w.snakes.repel === 'function' ? w.snakes : null;
  _ssx = _ssy = 0; _ssn = 0; _ssu = u; _ssk = 0;
  w.query(u.x, u.y, _ssr + SCARE.queryPad, scareRat, RAT_MASK); // OG game.js:11487
  if (!reg) w.query(u.x, u.y, _ssr + SCARE.queryPad, scareHead, SNAKE_MASK);
  _ssu = null;
  if (reg) { const n = reg.repel(u.x, u.y, _ssr, _sc); if (n > 0) { _ssx += _sc[0]; _ssy += _sc[1]; _ssn += n; } }
  if (_ssn === 0) return false; // OG game.js:12839
  const a = hyp(_ssx, _ssy) || 1;
  setState(u, S.FLEE); u.goalX = (_ssx / a) * speed; u.goalY = (_ssy / a) * speed; // OG game.js:12845-12846
  return true;
}

// ---------------------------------------------------------------- unit swaps (Cavalry ↔ Horse + Knight)
// Rider left by a Cavalry (OG `C`, game.js:12822-12831).
export function riderType(type) {
  switch (type) {
    case 'risen_cavalry': return 'risen_knight';
    case 'apecav': return 'ape';
    case 'risen_apecav': return 'risen_ape';
    default: return 'knight';
  }
}
// Status carried across a swap (OG 571.b snapshot, game.js:14513-14540).
export function snapshot(u) {
  return {
    hatless: u.hatless || 0, singed: u.singed || 0, blind: u.blind || 0, plague: u.plague || 0, plagueAt: u.plagueAt,
    plagueFree: u.plagueFree || 0, kindled: u.kindled || 0, burning: u.burning || 0, curseType: u.curseType,
    infection: u.infection || 0, infectGroup: u.infectGroup, z: u.z || 0, vz: u.vz || 0, spin: u.spin || 0,
    thrownAt: u.thrownAt, arrowsIn: u.arrowsIn || 0, arrows: u.arrows ? u.arrows.slice() : null,
  };
}
// Apply a snapshot (OG 571.a, game.js:14541-14564).
export function applyStatus(w, u, s) {
  const d = u.def;
  u.hatless = s.hatless; u.singed = s.singed; u.blind = s.blind; u.plagueFree = s.plagueFree;
  const canSick = s.plague > 0 && !isUndead(u) && d.faction !== FACTION.Undead && !d.prop && !d.plagueCarrier; // OG game.js:14545
  u.plague = canSick ? s.plague : 0; u.plagueAt = s.plagueAt; u.kindled = s.kindled;
  u.burning = d.flammability > 0 ? s.burning : 0; // OG game.js:14549
  u.curseType = s.curseType;
  const risen = getRisenType(u.type), inf = s.infection > 0 && d.infectable && risen != null; // OG game.js:14551-14552
  u.infection = inf ? (d.turnsWhenKilled ? Infinity : (Number.isFinite(s.infection) ? s.infection : 1)) : 0; // OG game.js:14553
  u.infectType = inf ? risen : null; u.infectGroup = inf ? s.infectGroup : -1;
  u.z = u.pz = s.z; u.vz = s.vz; u.spin = s.spin; u.thrownAt = s.thrownAt;
  u.arrowsIn = Math.min(2, s.arrowsIn); u.arrows = s.arrows; // max 2 stuck arrows (OG game.js:10710)
}
// Swap a unit for another type in place, keeping position, heading, velocity (OG replaceUnit, game.js:5605-5616).
// CORE-A ships world.replace(u, type, group, team); faction follows team as in spawn.
export function replaceUnit(w, u, type, group, team) {
  if (typeof w.replace === 'function') return w.replace(u, type, group, team);
  const { x, y, heading, vx, vy } = u;
  w.remove(u);
  const n = w.spawn(type, x, y, { group, heading, team });
  if (n) { n.vx = vx; n.vy = vy; }
  return n;
}
