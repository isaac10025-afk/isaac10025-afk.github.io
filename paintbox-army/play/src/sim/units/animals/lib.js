// ANIMALS shared helpers. Our own ports of the OG shared brain helpers the animal brains call,
// plus small local fallbacks for core calls (ARCH cross-call contract) that may still be stubs.
// Every rule cites OG game.js:<line>. Owner: ANIMALS. Nothing here is a unit def.
import * as C from '../../const.js';
import * as FAC from '../../factions.js';
import * as CB from '../../combat/index.js';
import * as FIRE from '../../combat/fire.js';
import { fleeOpen } from '../../combat/status.js'; // OURS (attack 3): FLEE_WALL
import * as NAV from '../../systems/navigation.js';
import * as TW from '../../terrain/water.js';
import * as TWALL from '../../terrain/wall.js';

// ---------- constants / enums ----------
export const DT = C.DT ?? 1 / 60; // OG game.js:8656
export const S = C.STATE ?? { IDLE: 0, ADVANCE: 1, ENGAGE: 2, ALERT: 3, CHARGE: 4, FLEE: 5 }; // OG game.js:9219
export const LOCO = { Holonomic: C.LOCO?.HOLONOMIC ?? 0, Vehicle: C.LOCO?.VEHICLE ?? 1 }; // OG game.js:8508
export const INTEL = { Mindless: FAC.INT?.Mindless ?? 0, Animal: FAC.INT?.Animal ?? 1, Trained: FAC.INT?.Trained ?? 2 }; // OG game.js:8442
export const CAUSE = C.CAUSE ?? { Other: 0, Blow: 1, Blast: 2, Fire: 3, Plague: 4, Thrown: 5, Eaten: 7, Turned: 8 }; // OG game.js:11595
export const MAX_R = 46; // OG game.js:8667 (max unit radius margin added to radius queries)
export const WET = 0.05; // OG game.js:9558
export const DEEP = 0.75; // OG game.js:9557
export const GRAVITY = 900; // OG game.js:9009
export const TILE = C.WALL_TILE ?? 8; // OG game.js:8669

// OG faction ids (game.js:8370-8398). Used only if factions.js has no id for the name yet.
const OG_FACTION = {
  Soldiers: 0, Wild: 1, Undead: 2, Flamers: 3, Snipers: 4, Romans: 5, Grenadiers: 6, Archers: 7, Slimes: 8, Props: 9,
  Knights: 10, Strays: 11, Mages: 12, Giants: 13, Rats: 14, Ants: 15, Apes: 16, Reptiles: 17, Piranhas: 18, Dragons: 19,
  TeamLeft: 20, TeamRight: 21, Snakes: 23, Necromancers: 24, Ninjas: 25, Cheetahs: 26,
};
export function fac(name) { const F = FAC.F || {}; return F[name] ?? OG_FACTION[name]; }

// ---------- rng (all through world.rng) ----------
export const rnd = (w) => w.rng(); // OG rng.next
export const signed = (w) => 2 * w.rng() - 1; // OG game.js:2694
export const range = (w, a, b) => a + (b - a) * w.rng(); // OG game.js:2691
export const rint = (w, n) => Math.floor(w.rng() * n);
export const hyp = (x, y) => Math.sqrt(x * x + y * y);

// ---------- unit helpers ----------
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } } // OG game.js:9220-9222
export function unit(w, id) { if (id == null || id < 0) return null; const t = w.unitById(id); return t && !t.dead && !t.removed ? t : null; }
// current target, dropped if gone or dead (OG 412 M, game.js:8774-8781)
export function getTarget(w, u) {
  const t = unit(w, u.target);
  if (!t || t.hp <= 0) { u.target = -1; return null; }
  return t;
}
export function setTarget(u, t) { u.target = t ? t.id : -1; } // OG game.js:8782-8784
export function airborne(u) { return u.z > 0 || u.vz > 0; } // OG game.js:9058-9060
export function climbing(u) { return (u.climb || 0) > 0; }
// a blow aimed at a unit up a tree lands on its perch (OG St, game.js:9052-9057)
export function perchOf(w, t) {
  if (!climbing(t)) return t;
  const p = unit(w, t.perch);
  return p || t;
}
export function hostile(a, b) { return FAC.isHostile ? FAC.isHostile(a, b) : (a.faction !== b.faction); }
export function isUndead(u) { return !!(u.def.look && u.def.look.undead) || !!u.def.risenFrom; }
// OG per-unit generic fields the animal brains read (OG unit store, game.js:10864-10995). Called from every init.
// Names follow CORE-B initCombat (unit-level OG names). Per-type extras live in u.b.
export function ensure(u) {
  const d = (k, v) => { if (u[k] === undefined) u[k] = v; };
  d('cooldown', 0); d('stateTime', 0); d('face', NaN); d('wander', u.heading || 0); d('lastVictim', -1); d('subState', 0);
  d('attack', 0); d('climb', 0); d('perch', -1); d('hurled', 0); d('eaten', 0); d('burning', 0); d('stun', 0); d('plague', 0);
  d('infection', 0); d('startle', 0); d('startleX', 0); d('startleY', 0); d('los', 1); d('pathing', 0); d('threatX', 0);
  d('threatY', 0); d('noise', 0); d('react', 0); d('singed', 0);
  if (!u.b) u.b = {};
  return u;
}
// attack pose (OG u.attack = 1); mirrored into ARCH anim.atk for the renderer
export function hitAnim(u) { u.attack = 1; if (u.anim) u.anim.atk = 1; }
export function dead(u) { return !u || u.dead || u.removed || u.hp <= 0; }

// ---------- combat (CORE-B contract, with fallbacks) ----------
// damage returns m = 1 - shield block (OG 412.h, game.js:8788-8818). sx,sy = blow source point (Ask CORE-B).
export function dmg(w, t, amount, src, kind, sx, sy) {
  if (CB.damage) return CB.damage(w, t, amount, src, kind, sx, sy);
  if (t.hp <= 0) return 1; t.hp -= amount; return 1;
}
// push: v += dir * f / max(0.25, mass); stun = max (OG 412.p, game.js:8983-8988)
export function push(w, u, dx, dy, f, st) {
  if (CB.push) return CB.push(w, u, dx, dy, f, st);
  if (climbing(u)) return;
  const k = f / Math.max(0.25, u.mass); u.vx += dx * k; u.vy += dy * k; if (st > (u.stun || 0)) u.stun = st;
}
// toss: launch into the air (OG 412.y, game.js:9063-9089)
export function toss(w, u, dx, dy, out, up) {
  if (CB.toss) return CB.toss(w, u, dx, dy, out, up);
  const l = 1 / Math.sqrt(Math.max(1, u.mass));
  if ((u.mass >= 8 && !u.def.prop) || u.def.untossable) { u.vx += dx * out * l * 0.5; u.vy += dy * out * l * 0.5; return; }
  u.vx = dx * out * l + 0.3 * u.vx; u.vy = dy * out * l + 0.3 * u.vy;
  const h = up * l, t = (u.vz + h + Math.sqrt(u.vz * u.vz + 2 * GRAVITY * u.z)) / GRAVITY;
  u.vz = h; u.stun = Math.max(u.stun || 0, t + 0.3);
}
export function stun(w, u, t) { if (CB.stun) return CB.stun(w, u, t); if (t > (u.stun || 0)) u.stun = t; }
export function infect(w, target, attacker, chance, timer) { if (CB.infect) return CB.infect(w, target, attacker, chance, timer); return false; }
// sure ignite with base burn time (OG 412.m, game.js:8848-8863). Ask CORE-B: igniteNow(world,u,base).
export function lightUp(w, u, base) {
  if (FIRE.igniteNow) return FIRE.igniteNow(w, u, base);
  if (CB.ignite) return CB.ignite(w, u, Infinity, base);
  return false;
}
// chance roll x flammability, then ignite (OG 412.j, game.js:8843-8846)
export function igniteChance(w, u, base, chance) { if (CB.ignite) return CB.ignite(w, u, chance, base); return false; }
export function givePlague(w, u) { if (CB.givePlague) return CB.givePlague(w, u); if (CB.catchPlague) return CB.catchPlague(w, u); return false; }
export function sfx(w, name, x, y, extra) { const e = { x, y }; if (extra) Object.assign(e, extra); w.emit(name, e); }

// ---------- terrain (TERRAIN grids via world.*, with fallbacks) ----------
let cacheTick = -1, cacheWalls = 0, cacheWater = 0;
function refreshCounts(w) {
  if (cacheTick === w.tick && w === refreshCounts.w) return;
  refreshCounts.w = w; cacheTick = w.tick;
  cacheWalls = typeof w.wallCount === 'number' ? w.wallCount : (w.walls && w.walls.count != null ? w.walls.count : countNZ(w.walls));
  cacheWater = typeof w.waterCells === 'number' ? w.waterCells : (w.water && w.water.cells != null ? w.water.cells : countNZ(w.water, WET));
}
function countNZ(a, min = 0) { if (!a || !a.length) return 0; let n = 0; for (let i = 0; i < a.length; i++) if (min > 0 ? a[i] >= min : a[i] > 0) n++; return n; }
export function hasWalls(w) { refreshCounts(w); return cacheWalls > 0; } // OG t.walls.count > 0
export function hasWater(w) { refreshCounts(w); return cacheWater > 0; } // OG t.water.cells > 0
let iceTick = -1, iceCount = 0;
export function hasIce(w) { // OG t.ice.cells > 0 (cached per tick)
  if (iceTick !== w.tick || hasIce.w !== w) {
    hasIce.w = w; iceTick = w.tick;
    iceCount = typeof w.iceCells === 'number' ? w.iceCells : (w.ice && w.ice.cells != null ? w.ice.cells : countNZ(w.ice));
  }
  return iceCount > 0;
}
export function depthAt(w, x, y) { return w.waterAt ? w.waterAt(x, y) || 0 : 0; } // OG game.js:9602-9610 (0 over ice)
export function depthUnder(w, x, y) { return w.depthUnder ? w.depthUnder(x, y) : depthAt(w, x, y); } // OG game.js:9611-9616
// OG wetAt (game.js:9824-9829)
export function wetAt(w, u) {
  if (w.wetAt) return w.wetAt(u);
  if (!hasWater(w) || u.z > 0 || climbing(u)) return false;
  return (u.def.aquatic ? depthUnder(w, u.x, u.y) : depthAt(w, u.x, u.y)) >= WET;
}
// OURS (attack 3, 11-18): WATER_LOS. Water behind a wall doesn't count: units walked to the nearest wet tile in a straight
// line (a wounded boar to wallow, a burning unit to put itself out, a loose horse to drink), so on the step-7 maps (castle
// moat, village pond) one stood pressed into the wall between it and the water for good (castle: a boar 20 s and on).
// OG does the same; its painted fields rarely put a wall between a unit and the water that close.
export function nearestWet(w, x, y, r, out) {
  return nearestWetRaw(w, x, y, r, out) && (!hasWalls(w) || lineOfSight(w, x, y, out[0], out[1]));
}
// nearest wet tile centre within r (ring scan, OG game.js:9835-9863). Writes out[0], out[1].
function nearestWetRaw(w, x, y, r, out) {
  if (TW.nearestWet) return TW.nearestWet(w, x, y, r, out);
  if (w.nearestWet) return w.nearestWet(x, y, r, out);
  if (!hasWater(w)) return false;
  const inv = 1 / TILE, cx = Math.floor(x * inv), cy = Math.floor(y * inv), R = Math.ceil(r * inv);
  const cols = Math.ceil(w.W / TILE), rows = Math.ceil(w.H / TILE);
  for (let k = 0; k <= R; k++) {
    let best = -1, bx = 0, by = 0, bd = Infinity;
    for (let ty = cy - k; ty <= cy + k; ty++) {
      if (ty < 0 || ty >= rows) continue;
      const edge = ty === cy - k || ty === cy + k;
      for (let tx = cx - k; tx <= cx + k; tx += (edge || k === 0) ? 1 : 2 * k) {
        if (tx < 0 || tx >= cols) continue;
        const px = (tx + 0.5) * TILE, py = (ty + 0.5) * TILE;
        if (depthAt(w, px, py) < WET) continue;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bd) { bd = d; best = 1; bx = px; by = py; }
      }
    }
    if (best >= 0) { if (bd > r * r) return false; out[0] = bx; out[1] = by; return true; }
  }
  return false;
}
// distance inside water to the shore in tiles (OG shore grid, game.js:9700-9712, 9773-9777). Fallback: Chebyshev ring, capped 3.
export function shoreAt(w, x, y) {
  if (TW.shoreAt) return TW.shoreAt(w, x, y);
  if (w.shoreAt) return w.shoreAt(x, y);
  if (depthUnder(w, x, y) < WET) return 0;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), cols = Math.ceil(w.W / TILE), rows = Math.ceil(w.H / TILE);
  for (let k = 1; k <= 3; k++) {
    for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue;
      const ax = tx + i, ay = ty + j;
      if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) return k;
      if (depthUnder(w, (ax + 0.5) * TILE, (ay + 0.5) * TILE) < WET) return k;
    }
  }
  return 4;
}
// best deeper-inside tile within 2 tiles (OG game.js:9778-9793)
export function inward(w, x, y, out) {
  if (TW.inward) return TW.inward(w, x, y, out);
  if (w.inward) return w.inward(x, y, out);
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let c = shoreAt(w, x, y), ok = false;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    const px = (tx + i + 0.5) * TILE, py = (ty + j + 0.5) * TILE;
    if (px < 0 || py < 0 || px >= w.W || py >= w.H) continue;
    const s = shoreAt(w, px, py);
    if (s > c) { c = s; out[0] = px; out[1] = py; ok = true; }
  }
  return ok;
}
export function pondAt(w, x, y) { if (TW.pondAt) return TW.pondAt(w, x, y); return w.pondAt ? w.pondAt(x, y) : (depthUnder(w, x, y) >= WET ? 0 : -1); }
export function frozenAt(w, x, y) { if (w.frozenAt) return w.frozenAt(x, y); return !!(w.iceAt && w.iceAt(x, y)) && depthUnder(w, x, y) >= WET; }
export function wallAt(w, x, y) { return w.wallAt ? !!w.wallAt(x, y) : false; }
// wall line of sight (OG walls.lineOfSight, game.js:946). Fallback: 4 px march.
export function lineOfSight(w, x0, y0, x1, y1) {
  if (w.lineOfSight) return w.lineOfSight(x0, y0, x1, y1);
  if (!hasWalls(w)) return true;
  const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(hyp(dx, dy) / 4);
  for (let i = 1; i < n; i++) if (wallAt(w, x0 + dx * i / n, y0 + dy * i / n)) return false;
  return true;
}

// ---------- groups (CORE-A; OG groups SoA, game.js:2279-2318) ----------
export function gField(w, g, f) {
  const G = w.groups; if (g == null || g < 0 || !G) return undefined;
  const a = G[f]; if (a && typeof a.length === 'number' && typeof a !== 'string') return a[g];
  const o = G.get ? G.get(g) : G[g]; return o ? o[f] : undefined;
}
export function gSet(w, g, f, v) {
  const G = w.groups; if (g == null || g < 0 || !G) return;
  const a = G[f]; if (a && typeof a.length === 'number' && typeof a !== 'string') { a[g] = v; return; }
  const o = G.get ? G.get(g) : G[g]; if (o) o[f] = v;
}

// ---------- movement helpers ----------
const navOut = new Float32Array(2);
// go to a point: straight if clear, else follow the faction flow field (OG 447.c, game.js:9448-9460)
export function goTo(w, u, x, y, speed, clear) {
  if (NAV.moveTo) return NAV.moveTo(w, u, x, y, speed, !!clear);
  const careful = false; // mine-aware: animals are Animal intelligence (OG game.js:8444-8446); apecav has mines:false
  if (!clear && hasWalls(w)) {
    const nav = w.nav;
    if (nav && nav.direction && nav.direction(u.faction, u.x, u.y, navOut, careful)) {
      u.goalX = navOut[0] * speed; u.goalY = navOut[1] * speed; u.pathing = 1; return;
    }
  }
  const dx = x - u.x, dy = y - u.y, d = hyp(dx, dy) || 1;
  u.goalX = dx / d * speed; u.goalY = dy / d * speed;
}
const pOut = new Float32Array(2);
// offset of the unit from the group axis toward a point, x0.85 (OG game.js:9488-9500)
function axisPoint(w, u, g, px, py, out) {
  const cx = gField(w, g, 'cx') ?? u.x, cy = gField(w, g, 'cy') ?? u.y;
  const ax = px - cx, ay = py - cy, d = hyp(ax, ay) || 1, fx = ax / d, fy = ay / d;
  const vx = u.x - cx, vy = u.y - cy, p = vx * fx + vy * fy;
  out[0] = px + (vx - p * fx) * 0.85; out[1] = py + (vy - p * fy) * 0.85;
}
// follow group contact / intel when the unit has no target (OG 447.a, game.js:9461-9487). Returns true if it set a goal.
export function followIntel(w, u, speed, memory) {
  if (NAV.followGroup) return NAV.followGroup(w, u, speed, memory);
  const g = u.group; if (g == null || g < 0 || !w.groups) return false;
  const react = u.reactTime || 0;
  const contact = (gField(w, g, 'contactAge') ?? Infinity) < memory;
  const intel = gField(w, g, 'hasIntel') == 1 || gField(w, g, 'hasIntel') === true;
  let px, py;
  if (contact && w.time - (gField(w, g, 'contactSince') ?? 0) >= react) { px = gField(w, g, 'contactX'); py = gField(w, g, 'contactY'); }
  else if (intel && w.time - (gField(w, g, 'intelSince') ?? 0) >= react) { px = gField(w, g, 'intelX'); py = gField(w, g, 'intelY'); }
  else {
    const sp = hyp(u.vx, u.vy);
    if ((!contact && !intel) || u.state !== S.ADVANCE || sp < 0.3 * speed) return false;
    u.goalX = u.vx / sp * speed; u.goalY = u.vy / sp * speed; return true;
  }
  axisPoint(w, u, g, px, py, pOut);
  const dx = pOut[0] - u.x, dy = pOut[1] - u.y;
  if (dx * dx + dy * dy < 576) return false; // 24 px
  setState(u, S.ADVANCE); goTo(w, u, pOut[0], pOut[1], speed, false); return true;
}
const fleeOut = new Float32Array(2);
// run from the threat (OG 412.l, game.js:9182-9209). threat = unit or null.
export function flee(w, u, threat, speed) {
  let hx = -(u.threatX || 0), hy = -(u.threatY || 0);
  if (hx * hx + hy * hy < 1e-6) {
    if (threat) { hx = u.x - threat.x; hy = u.y - threat.y; } else { hx = Math.cos(u.heading); hy = Math.sin(u.heading); }
  }
  let d = hyp(hx, hy) || 1; hx /= d; hy /= d;
  if (u.burning > 0) {
    u.wander += 9 * signed(w) * DT; // OG game.js:9193
    if (hasWater(w) && u.def.intelligence !== INTEL.Mindless && nearestWet(w, u.x, u.y, 220, fleeOut)) { // OG game.js:9180, 9196
      const tx = fleeOut[0] - u.x, ty = fleeOut[1] - u.y, n = hyp(tx, ty) || 1;
      hx = tx / n * 0.8 + 0.2 * Math.cos(u.wander); hy = ty / n * 0.8 + 0.2 * Math.sin(u.wander);
    } else { hx = 0.35 * hx + 0.65 * Math.cos(u.wander); hy = 0.35 * hy + 0.65 * Math.sin(u.wander); }
  }
  const E = 90; // OG game.js:9204
  if (u.x < E) hx += (E - u.x) / E; else if (u.x > w.W - E) hx -= (u.x - (w.W - E)) / E;
  if (u.y < E) hy += (E - u.y) / E; else if (u.y > w.H - E) hy -= (u.y - (w.H - E)) / E;
  d = hyp(hx, hy) || 1; fleeOpen(w, u, hx / d, hy / d, fleeOut); u.goalX = fleeOut[0] * speed; u.goalY = fleeOut[1] * speed; // OURS (attack 3): combat/status.js FLEE_WALL
}
const roamBuf = new Array(24).fill(null);
// rest/roam cycle (OG 510.a, game.js:11155-11193). crowd = neighbour radius.
export function roam(w, u, speed, crowd) {
  const b = u.b;
  if (w.time >= (b.roamUntil || 0)) {
    const start = !b.roaming;
    let sx = 0, sy = 0, n = 0;
    const m = w.queryMask(u.x, u.y, crowd + u.radius, FAC.maskBit(u.faction), roamBuf, 24); // OG game.js:11169: own faction, cap 24
    for (let k = 0; k < m; k++) {
      const o = roamBuf[k];
      if (o === u || o.type !== u.type || (u.group >= 0 && o.group !== u.group)) continue;
      const dx = u.x - o.x, dy = u.y - o.y, d = hyp(dx, dy) || 0.001;
      if (d > crowd + u.radius) continue;
      sx += dx / d; sy += dy / d; n++;
    }
    b.roaming = start ? 1 : 0;
    if (start) {
      b.roamUntil = w.time + range(w, 1, 3.5); // OG game.js:11156
      u.wander = n > 0 ? Math.atan2(sy, sx) + signed(w) * 0.6 : u.heading + 1.3 * signed(w); // OG game.js:11159, 11187
    } else b.roamUntil = w.time + range(w, 1.5, 5) * (n >= 2 ? 0.25 : 1); // OG game.js:11155, 11157-11158
  }
  if (b.roaming) {
    u.wander += signed(w) * 1.5 * DT; // OG game.js:11160
    u.goalX = Math.cos(u.wander) * speed; u.goalY = Math.sin(u.wander) * speed;
  }
}

// ---------- trample (OG module 1074, game.js:239-302) ----------
// spec: {fullSpeed, damage, tossChance, tossSpeed, tossUp, knockback, stun, slowdown, minSpeed, infectChance}
// mask(o) decides who can be hit (default: hostile). Returns hits.
const tScratch = [];
const maskAdapters = new Map();
export function trample(w, u, speed, spec, mask) {
  if (CB.trample) { // CORE-B's port takes mask(u, c)
    let m;
    if (mask) { m = maskAdapters.get(mask); if (!m) { m = (a, c) => mask(c); maskAdapters.set(mask, m); } }
    return CB.trample(w, u, speed, spec, m);
  }
  const cs = Math.cos(u.heading), sn = Math.sin(u.heading), undead = isUndead(u);
  tScratch.length = 0;
  w.query(u.x, u.y, u.radius + MAX_R + 1.5, (o) => { if (tScratch.length < 16) tScratch.push(o); }); // OG game.js:256, 1.5 at 248
  let hits = 0;
  for (let k = 0; k < tScratch.length; k++) {
    const o = tScratch[k];
    if (o === u || o.hp <= 0 || climbing(o) || o.dead) continue;
    if (mask ? !mask(o) : !hostile(u, o)) continue;
    if (o.id === u.lastVictim && u.cooldown > 0) continue; // OG game.js:268
    const dx = o.x - u.x, dy = o.y - u.y;
    if (hyp(dx, dy) > u.radius + o.radius + 1.5) continue;
    if (dx * cs + dy * sn < 0) continue; // only ahead
    const j = Math.min(1, speed / spec.fullSpeed);
    const m = dmg(w, o, spec.damage * j, u, 'trample');
    sfx(w, 'trample', o.x, o.y, { power: j, type: u.type });
    if (undead) infect(w, o, u, spec.infectChance * m, 0);
    const side = cs * dy - sn * dx >= 0 ? 1 : -1;
    const lx = 0.8 * cs - sn * side * 0.6, ly = 0.8 * sn + cs * side * 0.6; // OG game.js:276-278
    if (m >= 0.6 && w.rng() < spec.tossChance) toss(w, o, lx, ly, spec.tossSpeed * j * m, spec.tossUp * j * m); // OG game.js:279
    else push(w, o, lx, ly, spec.knockback * j * m, spec.stun * m);
    const brace = (o.def.shield && o.def.shield.brace) || 0;
    if (m < 1 && brace > 0) dmg(w, u, brace * j, o, 'brace'); // OG game.js:284-287
    u.vx *= spec.slowdown; u.vy *= spec.slowdown; speed *= spec.slowdown;
    u.lastVictim = o.id; u.cooldown = 0.35; hitAnim(u); // OG game.js:292
    hits++;
    if (speed < spec.minSpeed) break;
  }
  return hits;
}

// ---------- eat / nearest finders (OG module 508, game.js:11040-11100) ----------
// eater swallows victim whole: fire, infection, plague pass on; no corpse (OG game.js:11082-11092)
export function eat(w, eater, v) {
  if (v.burning > 0) lightUp(w, eater, 4); // OG game.js:11083 (509.a = 4 s)
  if (isUndead(v) || (v.infection || 0) > 0) infect(w, eater, v, 1, 0);
  if ((v.plague || 0) > 0 || v.def.plagueCarrier) givePlague(w, eater);
  v.hurled = 0; v.infection = 0; v.eaten = 1;
  dmg(w, v, v.hp + 1e3, eater, 'eaten');
  v.hp = Math.min(v.hp, 0);
}
// OG module 508 looks only at the first 32 Props (frog) / 16 Strays (horse) units the grid query finds (queryRadius with a
// faction mask and a cap, game.js:11053-11079). L3 11-14: before, both scanned every faction within r with no cap: every
// snake / ape walked all units within its sight each tick (3k apes: brain 40 ms a tick vs OG's whole tick 14 ms; 3k snakes:
// 42 ms vs 17 ms), and a frog or horse past the cap could be picked where OG's could not.
const NQ = [];
function firstOf(w, x, y, r, mask, max) {
  NQ.length = 0;
  w.query(x, y, r, (o) => { NQ.push(o); return NQ.length >= max; }, mask);
  return NQ;
}
// nearest dry, living, non-undead Frog among the first 32 Props within r (OG game.js:11053-11066)
export function nearestFrog(w, x, y, r) {
  let best = null, bd = Infinity;
  for (const o of firstOf(w, x, y, r, 1 << fac('Props'), 32)) {
    if (o.type !== 'frog' || o.hp <= 0 || isUndead(o) || wetAt(w, o)) continue;
    const d = hyp(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; }
  }
  NQ.length = 0;
  return best;
}
// nearest living, not-burning Horse among the first 16 Strays within r (OG game.js:11068-11079)
export function nearestHorse(w, x, y, r) {
  let best = null, bd = Infinity;
  for (const o of firstOf(w, x, y, r, 1 << fac('Strays'), 16)) {
    if (o.type !== 'horse' || o.hp <= 0 || o.burning > 0) continue;
    const d = hyp(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; }
  }
  NQ.length = 0;
  return best;
}

// ---------- carry hook fallback ----------
// OG runs def.carry for every unit each tick before brains (game.js:5012). If the core does not, brains call this.
// Wrap every def.carry with carryOnce so it runs once per tick whoever calls it first.
export function carryOnce(fn) { return function (w, u) { if (u.b._carryTick === w.tick) return; u.b._carryTick = w.tick; fn(w, u); }; }
export function runCarry(w, u) { if (u.def.carry) u.def.carry(w, u); }

// ---------- skittish startle (OG module 613, game.js:16211-16277) ----------
// can this unit be startled now? (OG game.js:16229-16238)
function startleable(w, o) {
  return o.def.skittish === true && !isUndead(o) && o.state !== S.CHARGE && (!o.startle || w.time >= o.startle + 6); // 6 at OG game.js:16228
}
// a blast at (x, y) with noise radius nr startles skittish units within 0.5·nr (OG 613.b, game.js:16239-16253).
// CORE-B's explode should call this (Ask); exported for that.
export function startleAt(w, x, y, nr) {
  const R = nr * 0.5; // OG game.js:16223
  w.query(x, y, R, (o) => {
    if (o.hp <= 0 || !startleable(w, o)) return;
    const d = hyp(o.x - x, o.y - y); if (d > R) return;
    const until = w.time + 1.2 + 1.8 * (1 - d / R); // OG game.js:16224-16225
    if (until <= (o.startle || 0)) return;
    o.startle = until; o.startleX = x; o.startleY = y;
  });
}
// startled brain step: flee from the blast point and spread the startle to skittish neighbours within a 30 px gap.
// Returns true while startled (OG 613.a, game.js:16255-16277).
export function startled(w, u, speed) {
  if (CB.startleStep) return CB.startleStep(w, u, speed);
  if (!(w.time < (u.startle || 0))) return false;
  const dx = u.x - u.startleX, dy = u.y - u.startleY, d = hyp(dx, dy);
  setState(u, S.FLEE);
  if (d > 0.001) { u.goalX = dx / d * speed; u.goalY = dy / d * speed; }
  else { u.goalX = Math.cos(u.heading) * speed; u.goalY = Math.sin(u.heading) * speed; }
  w.query(u.x, u.y, u.radius + 30 + u.radius + MAX_R, (o) => { // 30 at OG game.js:16226
    if (o === u || o.hp <= 0 || (o.startle || 0) >= u.startle - 0.25 || !startleable(w, o)) return; // 0.25 at OG game.js:16227
    if (hyp(o.x - u.x, o.y - u.y) > u.radius + o.radius + 30) return;
    o.startle = u.startle; o.startleX = u.startleX; o.startleY = u.startleY;
  });
  return true;
}

// ---------- walls: gnaw + holes (TERRAIN wall grid; OG game.js:857-895) ----------
export function gnawWalls(w, x, y, r, amount) {
  if (TWALL.gnawWalls) return TWALL.gnawWalls(w, x, y, r, amount);
  if (w.gnawWalls) return w.gnawWalls(x, y, r, amount);
  if (w.walls && typeof w.walls.gnaw === 'function') return w.walls.gnaw(x, y, r, amount);
  return 0; // TERRAIN Ask: world.gnawWalls(x, y, r, amount) — wall tiles 100 hp (OG game.js:791)
}
export function nearestHole(w, x, y, r, out) {
  if (TWALL.nearestHole) return TWALL.nearestHole(w, x, y, r, out);
  if (w.nearestHole) return w.nearestHole(x, y, r, out);
  if (w.walls && typeof w.walls.nearestHole === 'function') return w.walls.nearestHole(x, y, r, out);
  return false; // TERRAIN Ask: world.nearestHole(x, y, r, out) over the last 32 destroyed tiles (OG game.js:878-883)
}

// ---------- rats and carrion (OG module 511 exports, game.js:11462-11501) ----------
const isRatType = (t) => t === 'rat' || t === 'risen_rat';
// carrion list of scavenged corpses (OG ghosts.carrion). Corpses are CORE-B's objects in world.corpses.
export function carrion(w) { if (!w.carrion) w.carrion = []; return w.carrion; }
// can rats eat this corpse? (OG game.js:11462-11470)
export function edible(c) {
  return !!c && (c.meat || 0) > 0 && !c.eaten && !c.raised && !c.colony && (c.z || 0) < 4 && (c.scavenged === 1 || c.kept === 1);
}
// a new corpse is "scavenged" if a live rat or zombie rat is within 120 px (OG game.js:11472-11481; called at 5393).
// CORE-B Ask: call markScavenged(world, corpse) for each new corpse.
export function markScavenged(w, c) {
  let hit = false;
  w.query(c.x, c.y, 120, (o) => { if (!hit && o.hp > 0 && !o.dead && isRatType(o.type)) hit = true; }); // 120 at OG game.js:11226
  if (hit) { c.scavenged = 1; carrion(w).push(c); }
}
// sum of 1/d away-vectors from rats within r (edge distance) of (x, y); returns the count (OG game.js:11484-11501).
// Used by ARMY (cavalry/horse rat fear) and MYTHICAL (giant).
export function ratsNear(w, x, y, r, out) {
  let sx = 0, sy = 0, n = 0;
  w.query(x, y, r + 10, (o) => {
    if (o.hp <= 0 || o.dead || !isRatType(o.type)) return;
    const dx = x - o.x, dy = y - o.y, d = hyp(dx, dy) || 0.001;
    if (d - o.radius > r) return;
    sx += dx / (d * d); sy += dy / (d * d); n++;
  });
  out[0] = sx; out[1] = sy; return n;
}
