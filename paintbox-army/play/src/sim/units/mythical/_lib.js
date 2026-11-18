// MYTHICAL shared brain kit: our own ports of the small shared OG brain helpers the mythical units call
// (target getter 412.z, path follow 447.c, group pursuit 447.a, gun range/approach/sidestep 495.a/c/d,
// circling 497.a, flee steer 412.l, roam 510.a, frog finder 508.a, eat 508.c, wall vault 506.c,
// rat finder 511.d, ice impact 568). ARCH rule: local fallbacks live in our own file; swap for core
// exports once CORE-A / CORE-B / TERRAIN ship them (listed under Asks).
import { getDef } from '../../defs.js';
import { damage, push, stun, toss, infect } from '../../combat/index.js';
import * as C from '../../combat/index.js';
import * as env from '../../combat/env.js';
import * as dmgx from '../../combat/damage.js';
import * as firex from '../../combat/fire.js';
import * as fac from '../../factions.js';
import * as oilx from '../../combat/oil.js';
import * as navx from '../../systems/navigation.js';

export const DT = 1 / 60;                                  // OG game.js:8656
export const ST = { IDLE: 0, ADVANCE: 1, ENGAGE: 2, ALERT: 3, CHARGE: 4, FLEE: 5 }; // OG game.js:9219
export const LEAP_HOP = 1, LEAP_VAULT = 2, LEAP_FLY = 3;   // OG game.js:10649-10650 (506.b = 2 vault, 506.a = 3 flight); 1 = plain hop
export const MARGIN = 46;                                  // OG game.js:8667 (max unit radius, added to radius queries)
export const MAX_R = 46;                                   // OG game.js:8667
export const GRAVITY = 900;                                // OG game.js:9009
export const DEEP = 0.75, WET = 0.05;                      // OG game.js:9554-9556
export const INT = { Mindless: 0, Animal: 1, Trained: 2 }; // OG game.js:8442
export const LOCO = { Holonomic: 0, Vehicle: 1 };          // OG game.js:8508
// Faction ids we name directly (OG game.js:8370-8395).
export const FAC = { Soldiers: 0, Wild: 1, Undead: 2, Slimes: 8, Props: 9, Strays: 11, Mages: 12, Giants: 13, Rats: 14,
  Dragons: 19, TeamLeft: 20, TeamRight: 21, Necromancers: 24 };
const NFAC = 27;                                           // OG game.js:8396
export const ALL = fac.ALL_MASK;                           // OG game.js:8397 (373.a). OURS 11-15: every faction, our 8 new ones too
                                                           // (was OG's 27: giants never threw, chain lightning never jumped to, frogs never fled Siege/Pirates)

// ---- faction masks (CORE-A factions.js; local copy of the OG rules if missing, OG game.js:8403-8408) ----
const localEnemy = new Float64Array(NFAC);
for (let f = 0; f < NFAC; f++) localEnemy[f] = (f === FAC.Props || f === FAC.Strays) ? 0 : (ALL & ~(1 << f) & ~(1 << FAC.Props) & ~(1 << FAC.Strays));
localEnemy[FAC.Wild] |= 1 << FAC.Strays;
localEnemy[FAC.Rats] &= ~(1 << FAC.Undead); localEnemy[FAC.Undead] &= ~(1 << FAC.Rats);
export function enemyMask(f) { return fac.ENEMY ? fac.ENEMY[f] : localEnemy[f]; }                       // 373.e
export function hitMask(f) { return fac.HITTABLE ? fac.HITTABLE[f] : (localEnemy[f] | (1 << FAC.Props) | (1 << FAC.Strays)); } // 373.d
export function factionHostile(a, b) { return fac.maskHas(enemyMask(a), b) === 1; }                       // 373.f
export function inMask(mask, u) { return fac.maskHas(mask, u.faction) === 1; }
export function teamable(def) { return !!def && def.faction !== FAC.Props && def.faction !== FAC.Strays; } // OG game.js:11549-11552
export function teamFaction(team) { return team === 0 ? FAC.TeamLeft : team === 1 ? FAC.TeamRight : -1; }

// ---- rng / math (all randomness through world.rng) ----
export const rnd = (w) => w.rng();
export const signed = (w) => 2 * w.rng() - 1;              // OG game.js:2694-2696
export const tri = (w) => w.rng() - w.rng();               // OG game.js:2697-2699
export const range = (w, a, b) => a + (b - a) * w.rng();   // OG game.js:2700
export const rint = (w, n) => Math.floor(w.rng() * n);     // OG game.js:2701
export function hypot(x, y) { return Math.sqrt(x * x + y * y); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const TAU = Math.PI * 2;
function wrap(a) {                                         // OG 392 (c)
  if (a >= Math.PI) { if (a < 3 * Math.PI) return a - TAU; } else { if (a >= -Math.PI) return a; if (a >= -3 * Math.PI) return a + TAU; }
  a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI;
}
export function angleDiff(from, to) { return wrap(to - from); } // OG 392.b
export function hash2(i, t) {                              // OG 392.f, game.js:8599-8602
  let e = Math.imul(i + 1, 374761393) ^ Math.imul(t, 668265263);
  e = Math.imul(e ^ (e >>> 13), 1274126177); e ^= e >>> 16; return (e >>> 0) / 4294967296;
}
// OG uses the unit's pool slot for per-unit phases (wander, parity, staggers). We use the unit id.
export function idx(u) { return u.index | 0; } // OG i (unit-table index)

// ---- unit state ----
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } } // OG 414.b, game.js:9220-9222
export function airborne(u) { return u.z > 0 || u.vz > 0; }                             // OG 412.e, game.js:9060
export function isUndead(def) { return !!(def && def.look && def.look.undead); }        // OG look.undead (game.js:4199)
// Live unit by id (OG isCurrent: slot alive + same generation). Ids are never reused, so id alone is enough.
export function cur(world, id) {
  if (id == null || id < 0) return null;
  const v = world.unitById(id);
  return v && !v.removed ? v : null;
}
// OG 412.z (game.js:8774-8780): current target if alive with hp > 0, else cleared.
export function target(world, u) {
  if (env.targetOf) return env.targetOf(world, u);
  if (u.target == null || u.target < 0) return null;
  const t = world.unitById(u.target);
  if (t && !t.removed && t.hp > 0) return t;
  u.target = -1; return null;
}
// OG 412.B (game.js:9051-9056): a strike on a climbing unit lands on its perch.
export function perch(world, t) {
  if (dmgx.perchOf) return dmgx.perchOf(world, t);
  return t;
}
// OG 412.r (game.js:9057-9059): unperch.
export function unperch(u) { if (C.unperch) C.unperch(u); else { u.perch = -1; u.climb = 0; u.hidden = 0; } }
// OG 412.p (game.js:8983-8988): knockback + stun. Stun applied through stun() as well (idempotent max).
export function knock(world, t, dx, dy, f, s) {
  push(world, t, dx, dy, f, s);
  if (s > 0 && !(t.climb > 0)) stun(world, t, s);
}
export function hatKnock(world, u, dx, dy, pow) { if (dmgx.hatKnock) dmgx.hatKnock(world, u, dx, dy, pow); }
// OG 412.m (game.js:8847-8863): ignite now with a base burn time.
export function igniteNow(world, u, base) { if (firex.igniteNow) firex.igniteNow(world, u, base); }
export function igniteRoll(world, u, chance, base) { if (firex.ignite) firex.ignite(world, u, chance, base); } // OG 412.j
export { damage, push, stun, toss, infect };

export function emit(world, name, data) { if (typeof world.emit === 'function') world.emit(name, data); }

// ---- queries (OG grid.queryRadius / findNearest, game.js:2799-2882): centre distance, faction mask, count cap ----
let qMask = 0, qMax = 0, qOut = null;
function qCb(o) { if (fac.maskHas(qMask, o.faction)) { qOut.push(o); if (qOut.length >= qMax) return true; } return false; }
export function queryMask(world, x, y, r, mask, out, max = 4096) {
  if (typeof world.queryMask === 'function') { const n = world.queryMask(x, y, r, mask, out, max); out.length = n; return n; }
  qMask = mask; qMax = max; qOut = out; out.length = 0;
  world.query(x, y, r, qCb);
  qOut = null; return out.length;
}
let nMask = 0, nX = 0, nY = 0, nBest = null, nD2 = 0, nEx = null;
function nCb(o) {
  if (o === nEx || !fac.maskHas(nMask, o.faction)) return false;
  const dx = o.x - nX, dy = o.y - nY, d2 = dx * dx + dy * dy;
  if (d2 < nD2) { nD2 = d2; nBest = o; }
  return false;
}
// Nearest unit of the mask strictly inside r (OG findNearest; `exclude` = OG's skip index).
export function findNearest(world, x, y, r, mask, exclude = null) {
  if (typeof world.findNearest === 'function') return world.findNearest(x, y, r, mask, exclude, 0);
  nMask = mask; nX = x; nY = y; nBest = null; nD2 = r * r; nEx = exclude;
  world.query(x, y, r, nCb);
  const b = nBest; nBest = null; nEx = null; return b;
}

// ---- walls (CORE-A grid; env adapters) ----
export function wallCount(world) {
  if (world.walls && typeof world.walls.count === 'number') return world.walls.count;
  return env.wallCount ? env.wallCount(world) : (typeof world.wallCount === 'number' ? world.wallCount : 1);
}
export function solidAt(world, x, y) { return env.solidAt ? env.solidAt(world, x, y) : world.wallAt(x, y) === 1; }
export function raycast(world, x0, y0, x1, y1) { return env.raycast ? env.raycast(world, x0, y0, x1, y1) : Infinity; }
export function lineOfSight(world, x0, y0, x1, y1) {
  if (typeof world.lineOfSight === 'function') return world.lineOfSight(x0, y0, x1, y1);
  return raycast(world, x0, y0, x1, y1) === Infinity;
}
// ---- water (TERRAIN grids) ----
export function depthAt(world, x, y) { return env.depthAt ? env.depthAt(world, x, y) : (world.waterAt ? world.waterAt(x, y) : 0); }
export function wetAt(world, u) { return env.wetAt ? env.wetAt(world, u) : depthAt(world, u.x, u.y) >= WET; }
export function waterCells(world) { return typeof world.waterCells === 'number' ? world.waterCells : 0; }
export function nearestWet(world, x, y, r, out) { return env.nearestWet ? env.nearestWet(world, x, y, r, out) : false; }
export function oil(world) { return oilx.getOil ? oilx.getOil(world) : null; }
// Corpse record fields (CORE-B combat/death.js addCorpse): t = death time, r = size, side = facing ±1.
export function cTime(c) { return c.t !== undefined ? c.t : c.time; }
export function cSize(c) { return c.r !== undefined ? c.r : c.size; }
export function cFacing(c) { return c.side !== undefined ? c.side : c.facing; }
// OG 568.c (game.js:13506-13510): impact = mass × speed / 400 (568.b) or dmg / 20 (568.a); ice harmed when impact > 1.
export function impactOf(mass, speed) { return (mass * speed) / 400; }   // OG 568.b
export function impactDmg(d) { return d / 20; }                          // OG 568.a
export function iceImpact(world, x, y, r, impact) {
  if (impact > 1 && env.hooks && typeof env.hooks.iceHarm === 'function') env.hooks.iceHarm(world, x, y, r, (impact - 1) * 0.3, 0.5);
}
// ---- fields ----
export function splatNoise(world, x, y, amt, r) { if (env.splatNoise) env.splatNoise(world, x, y, amt, r); }

// ---- groups (CORE-A; OG field names: alive, faction, type, cx, cy, contactAge, contactSince, contactX/Y, hasIntel, intelSince, intelX/Y) ----
export function gf(world, g, k) {
  const G = world.groups;
  if (!G || g == null || g < 0) return undefined;
  if (typeof G.get === 'function') { const o = G.get(g); return o ? o[k] : undefined; }
  if (G[k] && typeof G[k] === 'object' && !Array.isArray(G)) return G[k][g];
  const o = G[g]; return o ? o[k] : undefined;
}
export function groupLeave(world, g) {
  if (g == null || g < 0) return;
  const G = world.groups;
  if (G && typeof G.leave === 'function') G.leave(g); else if (typeof world.leaveGroup === 'function') world.leaveGroup(g);
}
export function createGroup(world, type, team) { return typeof world.createGroup === 'function' ? world.createGroup(type, team) : -1; }
export function releaseGroup(world, g) { if (g >= 0 && typeof world.releaseGroup === 'function') world.releaseGroup(g); }

// ---- spawning ----
// OG spawnUnit(type, x, y, group, heading, team) (game.js:5569-5604). CORE-A's spawn derives faction from team.
export function spawnUnit(world, type, x, y, group = -1, heading = 0, team = -1) {
  const v = world.spawn(type, x, y, { team, group, heading });
  if (!v) return null;
  if (v.heading !== heading) { v.heading = v.pheading = heading; } // fallback if spawn ignores opts.heading
  return v;
}

// ---- navigation: OG 447.c path follow (game.js:9448-9460) ----
const NAV = new Float32Array(2);
export function navDirection(world, faction, x, y, out, careful) {
  const N = world.nav;
  if (N && typeof N.direction === 'function') return N.direction(faction, x, y, out, careful);
  if (typeof world.navDirection === 'function') return world.navDirection(faction, x, y, out, careful);
  return false;
}
function mineAware(def) { return def.mines !== undefined && def.mines !== null ? !!def.mines : def.intelligence >= INT.Trained; } // OG 8444-8446
export function pathTo(world, u, x, y, speed, straight) {
  if (navx.moveTo) return navx.moveTo(world, u, x, y, speed, straight);
  const M = world.mines;
  const careful = !(u.burning > 0 || u.state === ST.FLEE) && !!M && M.count > 0 && mineAware(u.def); // OG 526.d + 371.a
  if (straight && careful && typeof M.blocks === 'function' && M.blocks(u.x, u.y, x, y, u.radius + 13.45)) straight = false; // 526.a = 13.45
  if (!straight && (wallCount(world) > 0 || careful) && navDirection(world, u.faction, u.x, u.y, NAV, careful)) {
    u.goalX = NAV[0] * speed; u.goalY = NAV[1] * speed; u.pathing = 1; return;
  }
  const dx = x - u.x, dy = y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
  u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed;
}
// OG 447.a (game.js:9461-9500): go to group contact (age < memory, after reactTime) or intel; else keep going.
const PT = new Float32Array(2);
export function pursue(world, u, speed, memory) {
  if (navx.followGroup) return navx.followGroup(world, u, speed, memory);
  const g = u.group;
  if (g == null || g < 0 || !world.groups) return false;
  const react = u.reactTime || 0;
  const contact = (gf(world, g, 'contactAge') ?? Infinity) < memory;
  const intel = gf(world, g, 'hasIntel') === 1 || gf(world, g, 'hasIntel') === true;
  let px, py;
  if (contact && world.time - (gf(world, g, 'contactSince') ?? 0) >= react) { px = gf(world, g, 'contactX'); py = gf(world, g, 'contactY'); }
  else if (intel && world.time - (gf(world, g, 'intelSince') ?? 0) >= react) { px = gf(world, g, 'intelX'); py = gf(world, g, 'intelY'); }
  else {
    const vx = u.vx, vy = u.vy, s = Math.sqrt(vx * vx + vy * vy);
    if ((!contact && !intel) || u.state !== ST.ADVANCE || s < 0.3 * speed) return false;
    u.goalX = (vx / s) * speed; u.goalY = (vy / s) * speed; return true;
  }
  // keep the unit's sideways offset from the group axis ×0.85 (OG 447 v, game.js:9488-9500)
  const cx = gf(world, g, 'cx') ?? u.x, cy = gf(world, g, 'cy') ?? u.y;
  const ax = px - cx, ay = py - cy, ad = Math.sqrt(ax * ax + ay * ay) || 1, fx = ax / ad, fy = ay / ad;
  const ox = u.x - cx, oy = u.y - cy, along = ox * fx + oy * fy;
  PT[0] = px + (ox - along * fx) * 0.85; PT[1] = py + (oy - along * fy) * 0.85;
  const dx = PT[0] - u.x, dy = PT[1] - u.y;
  if (dx * dx + dy * dy < 576) return false;               // within 24 px: stop
  setState(u, ST.ADVANCE);
  pathTo(world, u, PT[0], PT[1], speed, false);
  return true;
}
// Group contact point if fresher than `age` (used by the slime hop).
export function groupContact(world, g, age, out) {
  if (g == null || g < 0) return false;
  if (!((gf(world, g, 'contactAge') ?? Infinity) < age)) return false;
  out[0] = gf(world, g, 'contactX'); out[1] = gf(world, g, 'contactY'); return true;
}

// ---- gun helpers used by Mage/Giant (OG 495, game.js:10447-10477) ----
export function inRange(u, d, range) { return d <= (u.state === ST.ENGAGE ? range * 1.1 + 6 : range); } // 495.d (H)
export function advanceTo(world, u, t, dx, dy, los, speed) {                                          // 495.a (G)
  if (C.advanceTo) return C.advanceTo(world, u, t, dx, dy, los, speed);
  setState(u, ST.ADVANCE);
  pathTo(world, u, t.x, t.y, speed, los);
  if (los) u.face = Math.atan2(dy, dx);
}
export function sidestep(world, u, t, dx, dy, d, def) {                                                // 495.c (z)
  if (C.sidestep) return C.sidestep(world, u, t, dx, dy, d, def);
  const vx = t.vx, vy = t.vy, m = Math.sqrt(vx * vx + vy * vy);
  if (t.state === ST.CHARGE && d < 70 && m > 60 && -(vx * dx + vy * dy) / (m * d) > 0.8) {
    const c = vy * dx - vx * dy, sx = c >= 0 ? -vy : vy, sy = c >= 0 ? vx : -vx;
    u.goalX = (sx / m) * def.runSpeed; u.goalY = (sy / m) * def.runSpeed; return;
  }
  if (d < def.minDistance) { u.goalX = (-dx / d) * def.walkSpeed * 0.5; u.goalY = (-dy / d) * def.walkSpeed * 0.5; }
}
// ---- circling around a melee target (OG 497.a, game.js:10625-10636) ----
export function circle(world, u, t, dx, dy, d, def, amount, backoff) {
  if (C.circle) return C.circle(world, u, t, dx, dy, d, def, amount, backoff);
  const hx = dx / d, hy = dy / d;
  const side = u.detour ? Math.sign(u.detour) : (idx(u) & 1 ? 1 : -1);
  const m = Math.max(0, Math.min(1, 1 - ((t.attackers || 0) - 2) / (5 - 2)));
  const s = 0.3 * amount * m * def.walkSpeed * side;
  u.goalX += -hy * s; u.goalY += hx * s;
  if (backoff && u.attack > 0.45) { const b = 0.9 * def.walkSpeed * u.attack; u.goalX -= hx * b; u.goalY -= hy * b; }
}
// ---- flee steer (OG 412.l, game.js:9182-9209) ----
const WP = new Float32Array(2);
export function flee(world, u, t, speed) {
  if (C.fleeSteer) return C.fleeSteer(world, u, t, speed);
  let hx = -(u.threatX || 0), hy = -(u.threatY || 0);
  if (hx * hx + hy * hy < 1e-6) {
    if (t) { hx = u.x - t.x; hy = u.y - t.y; } else { hx = Math.cos(u.heading); hy = Math.sin(u.heading); }
  }
  let v = hypot(hx, hy) || 1; hx /= v; hy /= v;
  if (u.burning > 0) {
    u.wander += 9 * signed(world) * DT;
    if (waterCells(world) > 0 && u.def.intelligence !== INT.Mindless && nearestWet(world, u.x, u.y, 220, WP)) {
      const ex = WP[0] - u.x, ey = WP[1] - u.y, en = hypot(ex, ey) || 1;
      hx = (ex / en) * 0.8 + 0.2 * Math.cos(u.wander); hy = (ey / en) * 0.8 + 0.2 * Math.sin(u.wander);
    } else { hx = 0.35 * hx + 0.65 * Math.cos(u.wander); hy = 0.35 * hy + 0.65 * Math.sin(u.wander); }
  }
  const E = 90, W = world.W, H = world.H;
  if (u.x < E) hx += (E - u.x) / E; else if (u.x > W - E) hx -= (u.x - (W - E)) / E;
  if (u.y < E) hy += (E - u.y) / E; else if (u.y > H - E) hy -= (u.y - (H - E)) / E;
  v = hypot(hx, hy) || 1;
  u.goalX = (hx / v) * speed; u.goalY = (hy / v) * speed;
}
// ---- roam helper (OG 510.a, game.js:11155-11193) ----
const RQ = [];
export function roam(world, u, dt, speed, crowd) {
  const b = u.b;
  if (b.roamUntil === undefined) { b.roamUntil = 0; b.roaming = 0; }
  if (world.time >= b.roamUntil) {
    const start = b.roaming === 0;
    let sx = 0, sy = 0, n = 0;
    const g = u.group;
    queryMask(world, u.x, u.y, crowd + u.radius, fac.maskBit(u.faction), RQ, 24);
    for (let k = 0; k < RQ.length; k++) {
      const o = RQ[k];
      if (o === u || o.type !== u.type || (g >= 0 && o.group !== g)) continue;
      const dx = u.x - o.x, dy = u.y - o.y, d = hypot(dx, dy) || 0.001;
      if (d > crowd + u.radius) continue;
      sx += dx / d; sy += dy / d; n++;
    }
    b.roaming = start ? 1 : 0;
    if (start) {
      b.roamUntil = world.time + range(world, 1, 3.5);
      u.wander = n > 0 ? Math.atan2(sy, sx) + signed(world) * 0.6 : u.heading + 1.3 * signed(world);
    } else b.roamUntil = world.time + range(world, 1.5, 5) * (n >= 2 ? 0.25 : 1);
  }
  if (b.roaming === 1) {
    u.wander += signed(world) * 1.5 * dt;
    u.goalX = Math.cos(u.wander) * speed; u.goalY = Math.sin(u.wander) * speed;
  }
}

// ---- type sets ----
export const FROGS = new Set(['frog', 'risen_frog']);
export const SLIMES = new Set(['slime', 'risen_slime']);
export const RATS = new Set(['rat', 'risen_rat']);
// OG 508.a (game.js, module 508): nearest live, dry, non-undead frog among the first 32 Props-faction units within r.
// L3 11-14: before, this scanned every faction with no cap: each idle zombie walked all units within 260 px every tick
// (2k zombies: brain 17 ms a tick, OG's whole tick 7 ms; 4k: 51 ms vs 17 ms).
const FROGQ = [];
export function nearestFrog(world, x, y, r) {
  const n = queryMask(world, x, y, r, 1 << FAC.Props, FROGQ, 32);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = FROGQ[k];
    if (o.type !== 'frog' || o.hp <= 0 || isUndead(o.def) || wetAt(world, o)) continue;
    const d = hypot(o.x - x, o.y - y);
    if (d < bd) { bd = d; best = o; }
  }
  FROGQ.length = 0;
  return best;
}
// OG 511.d (game.js:11483-11500): rats (and zombie rats) whose edge is within r: away vector Σ d/|d|², count.
const RATQ = [];
const RAT_MASK = (1 << FAC.Rats) | (1 << FAC.Undead) | (1 << FAC.TeamLeft) | (1 << FAC.TeamRight);
export function ratsAway(world, x, y, r, out) {
  queryMask(world, x, y, r + 10, RAT_MASK, RATQ, 48);
  let sx = 0, sy = 0, n = 0;
  for (let k = 0; k < RATQ.length; k++) {
    const o = RATQ[k];
    if (o.hp <= 0 || !RATS.has(o.type)) continue;
    const dx = x - o.x, dy = y - o.y, d = hypot(dx, dy) || 0.001;
    if (d - o.radius > r) continue;
    sx += dx / (d * d); sy += dy / (d * d); n++;
  }
  out[0] = sx; out[1] = sy; return n;
}
// OG 508.c (game.js:11070-11086): eater eats victim (Giant eat, Frog tongue).
export function eat(world, eater, v) {
  if (v.burning > 0) igniteNow(world, eater, 4);                                  // OG 509.a = 4 s base
  if (isUndead(v.def) || v.infection > 0) infect(world, eater, v, 1, 0);
  if ((v.plague > 0 || v.def.plagueCarrier) && C.catchPlague) C.catchPlague(world, eater);
  v.hurled = 0; v.infection = 0; v.eaten = 1;
  damage(world, v, v.hp + 1e3, eater, 'eaten');
  v.hp = Math.min(v.hp, 0);
}
// OG 506.c (game.js:10653-10675): hop/vault reach past a wall. 36 px max wall, 80 px max landing reach.
export function vault(world, u, dx, dy, reach, dist) {
  const x = u.x, y = u.y, m = u.radius, v = Math.max(reach, dist) + m;
  const ex = x + dx * v, ey = y + dy * v;
  const rc = raycast(world, x, y, ex, ey);
  const hitAt = Math.max(0, (rc === Infinity ? Infinity : rc) * v);
  if (hitAt >= v) return VR(reach, false, false);
  let a = hitAt;
  while (a - hitAt <= 36 && solidAt(world, x + dx * (a + 1), y + dy * (a + 1))) a += 2;
  if (a - hitAt > 36) return VR(reach, false, true);
  const s = Math.max(reach, a + m + 3), lx = x + dx * s, ly = y + dy * s;
  const clear = !(solidAt(world, lx, ly) || solidAt(world, lx + dx * m, ly + dy * m) || solidAt(world, lx - dy * m, ly + dx * m) || solidAt(world, lx + dy * m, ly - dx * m));
  return s <= 80 && clear ? VR(s, true, false) : VR(Math.min(reach, Math.max(4, hitAt - m - 2)), false, false);
}
const VRES = { reach: 0, vault: false, round: false };
function VR(reach, vlt, round) { VRES.reach = reach; VRES.vault = vlt; VRES.round = round; return VRES; }

// risen type of a base type, if any (OG registry map b, game.js:8343).
export function risenOf(type) { return getDef('risen_' + type) ? 'risen_' + type : null; }
