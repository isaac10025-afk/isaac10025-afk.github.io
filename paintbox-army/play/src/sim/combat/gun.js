// The shared gun brain (OG module 495, game.js:10295-10477). Soldier and Sniper run gunBrain whole; other ranged
// units reuse its parts (gunFire, inRange, sidestep, closeToRange, advanceTo, takeCover, gunInit).
import { DT, STATE, initCombat, setState, targetOf, wallCount, angleDiff, tri, range, rnd, hypot } from './env.js';
import { shoot } from './projectiles.js';
import { fleeSteer } from './status.js';
import { oddsApproach } from './melee.js';
import * as NAV from '../systems/navigation.js';

export const RANGE_HYST = 1.1, RANGE_HYST_PAD = 6;      // OG game.js:10447-10448 (P, I)
export const CLOSE_SPEED = 0.6;                         // OG game.js:10452 (C)
export const SIDESTEP_R = 70, SIDESTEP_MIN_SPEED = 60, SIDESTEP_COS = 0.8, BACKOFF = 0.5; // OG game.js:10461-10477
export const SPREAD_FEAR = 1.2;                         // OG game.js:10442
export const RELOAD_JIT_LO = 0.9, RELOAD_JIT_HI = 1.15; // OG game.js:10438
// Cover behind trees (OG game.js:10297-10371)
export const COVER_STAGGER = 20, COVER_RATE = 0.35, COVER_NEW_MIN = 150, COVER_SEARCH = 110, COVER_MIN = 110, COVER_GAP = 1, COVER_STOP = 3;

/** gunInit(world, u, w): ammo = magazine − int(rng·ceil(magazine/2)); cooldown = rng·cooldown (OG game.js:10373-10376). */
export function gunInit(world, u, w) {
  initCombat(u);
  u.ammo = w.magazine - Math.floor(rnd(world) * Math.ceil(w.magazine / 2));
  u.cooldown = rnd(world) * w.cooldown;
}

/** In range with hysteresis while already Engaged (OG game.js:10447-10451). */
export function inRange(u, d, r) { if (u.state === STATE.ENGAGE) r = r * RANGE_HYST + RANGE_HYST_PAD; return d <= r; }

/** Fire rule (OG game.js:10435-10446). Returns the projectile if a shot went out. */
export function gunFire(world, u, aim, def, w) {
  if (u.cooldown > 0 || u.reload > 0) return null;
  if (u.ammo === 0) { u.reload = w.reloadTime * range(world, RELOAD_JIT_LO, RELOAD_JIT_HI); return null; }
  if (Math.abs(angleDiff(u.heading, aim)) > w.aimTolerance) return null;
  const sp = hypot(u.vx, u.vy);
  if (sp > w.steadySpeed) return null;
  const h = 1 + SPREAD_FEAR * (1 - u.morale) + (sp / def.walkSpeed) * (w.movingPenalty || 0);
  const p = shoot(world, u, aim + tri(world) * w.spread * h, w, w.kind || 'bullet');
  u.ammo--;
  u.cooldown = w.cooldown + rnd(world) * (w.cooldownJitter || 0);
  return p;
}

/** Sidestep a charger / keep minDistance (OG 495.c, game.js:10461-10477). Sets u.goal. */
export function sidestep(world, u, t, dx, dy, d, def) {
  const tvx = t.vx, tvy = t.vy, m = hypot(tvx, tvy);
  if (t.state === STATE.CHARGE && d < SIDESTEP_R && m > SIDESTEP_MIN_SPEED && -(tvx * dx + tvy * dy) / (m * d) > SIDESTEP_COS) {
    const cr = tvy * dx - tvx * dy, ex = cr >= 0 ? -tvy : tvy, ey = cr >= 0 ? tvx : -tvx;
    u.goalX = (ex / m) * def.runSpeed; u.goalY = (ey / m) * def.runSpeed; return;
  }
  if (d < def.minDistance) { u.goalX = (-dx / d) * def.walkSpeed * BACKOFF; u.goalY = (-dy / d) * def.walkSpeed * BACKOFF; }
}
/** Close to range at 0.6·walkSpeed (OG game.js:10452-10455). */
export function closeToRange(u, dx, dy, d, r, def) { if (d > r) { u.goalX = (dx / d) * def.walkSpeed * CLOSE_SPEED; u.goalY = (dy / d) * def.walkSpeed * CLOSE_SPEED; } }

// Path following (OG 447.c, game.js:9448-9460). CORE-A navigation owns flow fields; straight-line fallback.
export function moveTo(world, u, x, y, speed, clear) {
  if (typeof NAV.moveTo === 'function') return NAV.moveTo(world, u, x, y, speed, clear);
  const dx = x - u.x, dy = y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
  u.goalX = (dx / d) * speed; u.goalY = (dy / d) * speed;
}
// Group contact / intel pursuit (OG 447.a, game.js:9461-9500). CORE-A navigation.followGroup is the real one;
// the local fallback reads the same OG-named group fields (struct-of-arrays on CORE-A's Groups, or plain objects).
const _G = { cx: 0, cy: 0, contactAge: Infinity, contactSince: 0, contactX: 0, contactY: 0, hasIntel: 0, intelSince: 0, intelX: 0, intelY: 0 };
function grp(world, g) {
  const G = world.groups;
  if (g == null || g < 0 || !G) return null;
  if (G.contactAge && typeof G.contactAge.length === 'number') {
    for (const k in _G) _G[k] = G[k] ? G[k][g] : 0;
    return _G;
  }
  const r = typeof G.get === 'function' ? G.get(g) : G[g];
  return r && r.contactAge !== undefined ? r : null;
}
export function pursue(world, u, speed, memory) {
  const nav = NAV.followGroup || NAV.pursue;
  if (typeof nav === 'function') return nav(world, u, speed, memory);
  const G = grp(world, u.group);
  if (!G) return false;
  const rt = u.reactTime || 0, hasContact = G.contactAge < memory, hasIntel = G.hasIntel === 1 || G.hasIntel === true;
  let px, py;
  if (hasContact && world.time - G.contactSince >= rt) { px = G.contactX; py = G.contactY; }
  else if (hasIntel && world.time - G.intelSince >= rt) { px = G.intelX; py = G.intelY; }
  else {
    const sp = hypot(u.vx, u.vy);
    if ((!hasContact && !hasIntel) || u.state !== STATE.ADVANCE || sp < 0.3 * speed) return false;
    u.goalX = (u.vx / sp) * speed; u.goalY = (u.vy / sp) * speed; return true;
  }
  const ax = px - G.cx, ay = py - G.cy, ad = Math.sqrt(ax * ax + ay * ay) || 1, fx = ax / ad, fy = ay / ad; // keep sideways offset ×0.85
  const ox = u.x - G.cx, oy = u.y - G.cy, along = ox * fx + oy * fy;
  px += (ox - along * fx) * 0.85; py += (oy - along * fy) * 0.85;
  const wx = px - u.x, wy = py - u.y;
  if (wx * wx + wy * wy < 576) return false;                                   // within 24 px: stop
  setState(u, STATE.ADVANCE);
  moveTo(world, u, px, py, speed, false);
  return true;
}
/** Advance toward the target at walkSpeed (OG game.js:10456-10460). */
export function advanceTo(world, u, t, dx, dy, clear, speed) {
  setState(u, STATE.ADVANCE);
  moveTo(world, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(dy, dx);
}

// ---- cover behind trees (OG game.js:10304-10371) ----
const _spot = new Float64Array(2);
function treeFree(world, tree, u) {
  if (tree.type !== 'tree' || !(tree.hp > 0) || tree.burning > 0 || tree.hurled === 1) return false;
  const s = tree.shelter != null && tree.shelter >= 0 ? world.unitById(tree.shelter) : null;
  return !s || s === u || s.removed || s.cover !== tree.id;
}
function coverSpot(u, tree, tx, ty) {
  const dx = tree.x - tx, dy = tree.y - ty, d = hypot(dx, dy) || 0.001, f = tree.radius + u.radius + COVER_GAP;
  _spot[0] = tree.x + (dx / d) * f; _spot[1] = tree.y + (dy / d) * f;
}
function toSpot(u, def) {
  const dx = _spot[0] - u.x, dy = _spot[1] - u.y, d = hypot(dx, dy);
  if (d <= COVER_STOP) { u.goalX = u.goalY = 0; return; }
  const s = Math.min(def.runSpeed, 6 * d);
  u.goalX = (dx / d) * s; u.goalY = (dy / d) * s;
}
function hash01(a, b) { let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x61c88647, 0x85ebca77); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae3d); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
let _cw = null, _cu = null, _ct = null, _crange = 0, _cbest = null, _cbd = Infinity;
function coverCand(tree) {
  if (!treeFree(_cw, tree, _cu)) return;
  coverSpot(_cu, tree, _ct.x, _ct.y);
  if (hypot(_spot[0] - _ct.x, _spot[1] - _ct.y) > _crange) return;
  const l = hypot(_spot[0] - _cu.x, _spot[1] - _cu.y);
  if (l <= COVER_SEARCH && l < _cbd) { _cbd = l; _cbest = tree; }
}
/** takeCover(world, u, target, d, range, def) → true if the unit is moving to / holding a cover spot. */
export function takeCover(world, u, t, d, rng, def) {
  const ok = d >= COVER_MIN && !t.def.melee && !t.def.prop && !(u.burning > 0) && !(u.perch >= 0) && !u.prone;
  if (u.cover >= 0) {
    const tree = world.unitById(u.cover);
    if (ok && tree && !tree.removed && treeFree(world, tree, u)) {
      coverSpot(u, tree, t.x, t.y);
      if (hypot(_spot[0] - t.x, _spot[1] - t.y) > rng) { u.cover = -1; return false; }
      toSpot(u, def); return true;
    }
    u.cover = -1; return false;
  }
  if (!ok || d < COVER_NEW_MIN || (world.tick + u.index) % COVER_STAGGER !== 0 || hash01(u.index, world.tick) >= (COVER_RATE * COVER_STAGGER) / 60) return false;
  _cw = world; _cu = u; _ct = t; _crange = rng; _cbest = null; _cbd = Infinity;
  world.query(u.x, u.y, u.radius + COVER_SEARCH + 46, coverCand);
  const tree = _cbest; _cw = null; _cu = null; _ct = null; _cbest = null;
  if (!tree) return false;
  u.cover = tree.id; tree.shelter = u.id;
  coverSpot(u, tree, t.x, t.y); toSpot(u, def);
  return true;
}

/** gunBrain(world, u, w): the whole shared gun brain, every tick (OG game.js:10377-10434). w = weapon def. */
export function gunBrain(world, u, w) {
  initCombat(u);
  const def = u.def;
  if (u.reload > 0) { u.reload -= DT; if (u.reload <= 0) { u.reload = 0; u.ammo = w.magazine; } }
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(world, u);
  if (u.state === STATE.FLEE) { u.cover = -1; fleeSteer(world, u, t, def.runSpeed); return; }
  if (t) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    const clear = u.los === 1 || u.los === true || wallCount(world) === 0;
    if (!clear || !inRange(u, d, w.range)) {
      if (clear && !w.holdsGround && takeCover(world, u, t, d, w.range, def)) { setState(u, STATE.ADVANCE); u.face = Math.atan2(dy, dx); return; }
      u.cover = -1;
      if (w.holdsGround) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); sidestep(world, u, t, dx, dy, d, def); return; }
      advanceTo(world, u, t, dx, dy, clear, def.walkSpeed); return;
    }
    setState(u, STATE.ENGAGE);
    const lead = d / w.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead); // OG game.js:10402-10404
    u.face = aim;
    const settled = u.reload <= 0 && u.cooldown < w.settleTime;
    if (!takeCover(world, u, t, d, w.range, def) && !settled) {
      sidestep(world, u, t, dx, dy, d, def);
      if (!w.holdsGround) { closeToRange(u, dx, dy, d, w.range, def); oddsApproach(world, u, t, dx, dy, d, def); }
    }
    gunFire(world, u, aim, def, w);
    return;
  }
  if (w.holdsGround) {
    const G = grp(world, u.group);
    if (G && G.contactAge < w.contactMemory && !(world.time - G.contactSince < (u.reactTime || 0))) {
      setState(u, STATE.ALERT); u.face = Math.atan2(G.contactY - u.y, G.contactX - u.x); return;
    }
  } else if (pursue(world, u, def.walkSpeed, w.contactMemory)) return;
  u.cover = -1;
  setState(u, STATE.IDLE);
  if (u.ammo < w.magazine && u.reload <= 0) u.reload = w.reloadTime;
}
