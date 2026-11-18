// Bosses tab shared helpers (Part 2 step 6, OURS: no OG source, our own design). Owner: BOSSES-SIM. Not a unit def.
// Contract: STEP6.md BOSSES table (tricks, starting numbers, b.act pose codes). Every boss: boss: true (one tap, one per
// field, everyone targets it: sim/game.js placeBoss + systems/perception.js), never flees, shrugs off stuns and
// knock-downs, can't be tossed / floated / webbed / infected, never raised (no risenMode), Bosses faction.
//  - boss(def): registers a boss with the tab's defaults; slime(def): the spawned slimes (not bosses, same side).
//  - captives: a unit swallowed (u.inside = holder id: hidden, stunned, carried, no body if it dies in there) or held by
//    a kraken arm (u.hurled = 1, carried at the arm tip). One per-world list; the 'bosses-captives' system (after
//    steering) carries them and frees any whose holder is gone (erased, cursed, Cleared) so nobody is stuck for good.
//  - brain pieces: pose codes, hunting, crowd finding, knock-downs.
// Per-world state lives in a WeakMap (reset by Clear). No allocation per tick; no random draws unless a boss acts.
import { registerUnit } from '../../defs.js';
import { F, ENEMY, INT, canHit, maskHas } from '../../factions.js';
import { STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff } from '../../const.js';
import { damage, push, toss, splatNoise, depthAt, meleeStrike, hooks, unperch } from '../../combat/index.js';
import { moveTo, followGroup } from '../../systems/navigation.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear } from '../../world.js';
import { attackHeld } from '../../systems/possess.js';

export { STATE, LEAP, GRAVITY, WET, DEEP, DT, hypot, angleDiff, F, ENEMY, INT, canHit, maskHas };
export { damage, push, toss, splatNoise, depthAt, meleeStrike, hooks, attackHeld };
export const TAU = Math.PI * 2;

// Shared numbers (ours; the user tunes them).
export const BOSS = {
  MARGIN: 46,          // max unit radius, added to radius queries (the core's margin)
  SKY: 30,             // a flyer higher than this (z px) is out of reach of bites, arms and stomps
  KNOCK_STUN: 0.6,     // s: default knock-down
  SIGHT: 700,          // px: bosses see far (they hunt the whole field)
  ALERT_SIGHT: 1000,   // px: once alerted
  HELD_Z: 2,           // px: a captive hangs this high (keeps its own brain and steering off, as the trex jaws do)
  POP_OUT: 130,        // px/s: captives let out alive fly out this fast ...
  POP_UP: 220,         // ... and this high (toss up speed)
};

// ---------------------------------------------------------------- defs
const BOSS_MORALE = { baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
  canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 0, recoverRate: 0, panicFear: 0, deathFear: 1 };
const BOSS_FLOCK = { personalSpace: 1.05, separation: 8, alignment: 0, cohesion: 0, formation: 0, herd: 0, herdSpacing: 0,
  flockByState: [0, 0, 0, 0, 0, 0], formationByState: [0, 0, 0, 0, 0, 0] };

/** Register a boss. `over` = the boss's own fields (radius, maxHp, speeds, brain, hooks...). */
export function boss(over) {
  return registerUnit({
    category: 'bosses', faction: F.Side, boss: true, intelligence: INT.Animal, infectable: false, raisable: false,
    untossable: true, melee: true,   // float / web / mind control / shrink: the other tabs check def.boss
    locomotion: 0, radiusJitter: 0, accel: 300, decel: 400, turnRate: 2.5, turnSpeedFalloff: Infinity,
    sightRange: BOSS.SIGHT, alertSightRange: BOSS.ALERT_SIGHT, stickyTarget: true, huntRange: Infinity, minDistance: 0,
    reactionTime: 0,   // no reaction delay: the brain also runs a boss's clocks (arms, hops, digesting), which must not stall
    drilled: false, flammability: 0.4, density: 8, iceGrip: 0.8, brushSpacing: 80,
    holdsNerve() { return true; },
    ...over,
    flock: { ...BOSS_FLOCK, ...(over.flock || {}) },
    morale: { ...BOSS_MORALE, ...(over.morale || {}) },
    look: { attack: { time: 0.4 }, ...(over.look || {}) },
  });
}
const SLIME_MORALE = BOSS_MORALE;   // slimes never break (OG slime morale = Zombie morale)
/** Register a spawned slime (bigslime, slimelet): Bosses side, Mindless, not a boss. */
export function spawnedSlime(over) {
  return registerUnit({
    category: 'bosses', faction: F.Side, intelligence: INT.Mindless, infectable: false, raisable: false, unpaintable: true,
    melee: true, locomotion: 0, radiusJitter: 0.06, turnRate: 8, turnSpeedFalloff: Infinity,
    sightRange: 360, alertSightRange: 420, stickyTarget: false, reactionTime: 0, huntRange: Infinity, minDistance: 0,   // no delay: the hop clock runs in the brain
    drilled: false, flammability: 0.15, density: 0.3,
    ...over,
    flock: { personalSpace: 1.15, separation: 30, alignment: 0.15, cohesion: 0.25, formation: 0, herd: 0.3, herdSpacing: 14,
      flockByState: [1, 1, 0.2, 1, 0.2, 0], formationByState: [0, 0, 0, 0, 0, 0], ...(over.flock || {}) },
    morale: { ...SLIME_MORALE, ...(over.morale || {}) },
    look: { attack: { time: 0.25 }, ...(over.look || {}) },
  });
}

/** Every boss's u.b starts with the pose contract keys (STEP6.md): act, actT, victim. */
export function initBag(u) {
  const b = u.b;
  b.act = 0; b.actT = 0; b.victim = -1;
  b.next = 0; b.next2 = 0; b.next3 = 0; b.t0 = 0; b.t1 = 0; b.x0 = 0; b.y0 = 0; b.k = 0;
  u.subState = 0; u.leaping = 0; u.plagueFree = 1;
}

// ---------------------------------------------------------------- brain pieces
export const unitOf = (w, id) => (id >= 0 ? w.unitById(id) : null);
/** The current target if it still lives (and isn't swallowed), else -1 and null. */
export function targetOf(w, u) {
  const t = u.target >= 0 ? w.unitById(u.target) : null;
  if (t && t.hp > 0 && t.inside < 0) return t;
  u.target = -1; return null;
}
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }
/** Pose code (STEP6.md): b.act + the time it started. */
export function act(w, u, code) { if (u.b.act !== code) { u.b.act = code; u.b.actT = w.time; } }
/** A target-free attack (stomp, breath, burst) may go off: always on its own, only while the player attacks when possessed. */
export function canAuto(w, u) { return u.possessed !== 1 || attackHeld(w); }
export function clearLine(w, u) { return u.los === 1 || w.walls.count === 0; }
export function high(o) { return o.z > BOSS.SKY; }
export function grounded(o) { return !(o.z > 6) && !(o.climb > 0); }
/** Can this unit be grabbed / swallowed at all? */
export function grabbable(o, maxMass) {
  const d = o.def;
  return o.mass <= maxMass && !d.prop && !d.untossable && !d.boss && o.hurled !== 1 && o.inside < 0 && grounded(o) && o.leaping === 0 && o.hp > 0;
}
/** A unit this boss may hurt with an area hit (stomp, slam, burst): its shots could hit it, alive, not swallowed. */
export function hittable(u, o) { return o !== u && !o.dead && o.hp > 0 && o.inside < 0 && canHit(u, o); }
/** Walk / run at a point (flow field around walls); faces it when the line is clear. */
export function hunt(w, u, t, speed, state = STATE.ADVANCE) {
  setState(u, state);
  const clear = clearLine(w, u);
  moveTo(w, u, t.x, t.y, speed, clear);
  if (clear) u.face = Math.atan2(t.y - u.y, t.x - u.x);
}
/** No target: follow the group's contact, else stand. */
export function idle(w, u) {
  if (followGroup(w, u, u.def.walkSpeed, 6)) return;
  setState(u, STATE.IDLE);
}
/** Boss defaults every tick: no stun (bosses shrug them off), no web, no float, no fleeing. */
export function shrug(w, u) {
  u.stun = 0; u.webbed = -0.5; u.floating = -0.5;
  if (u.state === STATE.FLEE) setState(u, STATE.IDLE);
}
/** Knock a unit down: push away from (x, y) with force f (÷ mass) and stun t. */
export function knock(w, o, x, y, f, t) {
  const dx = o.x - x, dy = o.y - y, d = hypot(dx, dy) || 0.001;
  push(w, o, dx / d, dy / d, f, t);
}
/** Toss o up and away from (x, y): `out` px/s outward, `up` px/s up (toss's own mass scaling applies). */
export function tossFrom(w, o, x, y, out, up) {
  let dx = o.x - x, dy = o.y - y; const d = hypot(dx, dy);
  if (d < 0.001) { const a = w.rng() * TAU; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
  toss(w, o, dx, dy, out, up);
}
/** Ring hit around (x, y): everyone u may hit within `ring` px of their edge takes `ringDmg` falling off with distance
 * (and `under` px: crushed for `underDmg`), is knocked down `knockT` s and pushed out `pushF`. Returns how many were hit. */
const RQ = new Array(128), HIT = new Array(128);
export function stompRing(w, u, x, y, under, underDmg, ring, ringDmg, knockT, pushF) {
  const R = u.radius + ring;
  const n = w.queryMask(x, y, R + BOSS.MARGIN, ENEMY[u.faction], RQ, RQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (!hittable(u, o) || !grounded(o) || o.def.prop) continue;
    if (hypot(o.x - x, o.y - y) <= R + o.radius) HIT[m++] = o;
  }
  for (let k = 0; k < m; k++) {
    const o = HIT[k]; HIT[k] = null;
    const dx = o.x - x, dy = o.y - y, d = hypot(dx, dy) || 0.001, edge = Math.max(0, d - u.radius - o.radius);
    const f = Math.max(0, 1 - edge / ring), crushed = d <= u.radius + o.radius + under;
    damage(w, o, crushed ? underDmg : ringDmg * f, u, undefined, o.x, o.y);   // from below: shields don't help
    if (o.hp > 0) push(w, o, dx / d, dy / d, pushF * (0.3 + 0.7 * f), knockT);
  }
  splatNoise(w, x, y, 1, 320);
  if (hooks.iceHarm) hooks.iceHarm(w, x, y, R, 2, 0.5);
  w.emit('blast', { x, y, r: R, kind: 3 });
  w.emit('trample', { x, y, v: 3, type: u.type });
  return m;
}
/** A bite / blow that comes down from above (a head on a long neck, a worm's jaws): shields don't help. Pushes v away
 * from u. Returns the pass fraction. */
export function strikeDown(w, u, v, dmg, jitter, pushF, stunT) {
  const dx = v.x - u.x, dy = v.y - u.y, d = hypot(dx, dy) || 0.001;
  const pass = damage(w, v, dmg + jitter * (w.rng() - w.rng()), u, undefined, v.x, v.y);
  if (v.hp > 0) push(w, v, dx / d, dy / d, pushF * pass, stunT * pass);
  u.attack = 1;
  w.emit('strike', { x: v.x, y: v.y, v: 1, type: u.type });
  return pass;
}
/** Is any enemy u may hit standing within `pad` px of its body edge (grounded, low enough)? */
export function enemyClose(w, u, pad) {
  const n = w.queryMask(u.x, u.y, u.radius + pad + BOSS.MARGIN, ENEMY[u.faction], RQ, RQ.length);
  let yes = false;
  for (let k = 0; k < n; k++) {
    const o = RQ[k]; RQ[k] = null;
    if (!yes && hittable(u, o) && grounded(o) && !o.def.prop && (o.unseen <= 0 || o.unseen > 1) && hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + pad) yes = true;
  }
  return yes;
}
/** The point of the thickest enemy crowd near (cx, cy) within `scan` px (counted within `r` px of a sampled enemy),
 * skipping points where `ok(w, x, y)` says no. Writes out[0..2] = x, y, count; false if no enemy. */
const CQ = new Array(256), CQ2 = new Array(96);
export function thickestCrowd(w, u, cx, cy, scan, r, ok, out) {
  const n = w.queryMask(cx, cy, scan, ENEMY[u.faction], CQ, CQ.length);
  const step = Math.max(1, Math.floor(n / 40));   // at most ~40 candidates
  let best = -1, bx = 0, by = 0, bd = Infinity;
  for (let k = 0; k < n; k += step) {
    const c = CQ[k];
    if (!hittable(u, c) || !grounded(c) || c.def.prop || (c.unseen > 0 && c.unseen < 1)) continue;
    if (ok && !ok(w, c.x, c.y)) continue;
    const m = w.queryMask(c.x, c.y, r, ENEMY[u.faction], CQ2, CQ2.length);
    let cnt = 0;
    for (let j = 0; j < m; j++) { const o = CQ2[j]; CQ2[j] = null; if (hittable(u, o) && grounded(o) && !o.def.prop) cnt++; }
    const d = hypot(c.x - u.x, c.y - u.y);
    if (cnt > best || (cnt === best && d < bd)) { best = cnt; bx = c.x; by = c.y; bd = d; }
  }
  for (let k = 0; k < n; k++) CQ[k] = null;
  if (best < 0) return false;
  out[0] = bx; out[1] = by; out[2] = best;
  return true;
}

// ---------------------------------------------------------------- captives (per-world list)
export const INSIDE = 1, HELD = 2;
const WS = new WeakMap();
function ws(w) {
  let s = WS.get(w);
  if (!s) { s = { caps: [], free: [] }; WS.set(w, s); }
  return s;
}
onWorldClear((w) => { const s = WS.get(w); if (s) { for (let k = 0; k < s.caps.length; k++) s.free.push(s.caps[k]); s.caps.length = 0; } });
function rec(s) { return s.free.pop() || { v: -1, by: -1, slot: 0, mode: 0 }; }
function dropRec(s, k) { s.free.push(s.caps[k]); s.caps[k] = s.caps[s.caps.length - 1]; s.caps.pop(); }
function findRec(s, id) { for (let k = 0; k < s.caps.length; k++) if (s.caps[k].v === id) return k; return -1; }

/** v is swallowed by `by`: hidden, stunned, carried inside; if it dies in there it leaves no body (eaten = 1). */
export function swallow(w, by, v, slot) {
  const s = ws(w);
  if (findRec(s, v.id) >= 0) return false;
  const e = rec(s); e.v = v.id; e.by = by.id; e.slot = slot; e.mode = INSIDE; s.caps.push(e);
  unperch(v);
  v.inside = by.id; v.eaten = 1; v.hidden = 0.001; v.hurled = 1; v.target = -1; v.leaping = 0; v.prone = 0;
  v.x = by.x; v.y = by.y; v.z = v.pz = BOSS.HELD_Z; v.vx = v.vy = v.vz = 0; v.spin = 0;
  if (v.stun < 0.3) v.stun = 0.3;
  w.emit('swallow', { x: v.x, y: v.y, id: v.id, type: by.type, v: v.radius / 9 });   // STEP6 AUDIO: gulp
  return true;
}
/** v is held by `by` at arm / jaw `slot` (kraken): carried there by the system, can't act. */
export function hold(w, by, v, slot) {
  const s = ws(w);
  if (findRec(s, v.id) >= 0) return false;
  const e = rec(s); e.v = v.id; e.by = by.id; e.slot = slot; e.mode = HELD; s.caps.push(e);
  unperch(v);
  v.hurled = 1; v.leaping = 0; v.prone = 0; v.z = v.pz = BOSS.HELD_Z; v.vx = v.vy = v.vz = 0; v.spin = 0;
  if (v.stun < 0.3) v.stun = 0.3;
  return true;
}
/** Let v go. Alive and swallowed: it pops out (tossed away from the holder). Held: it drops where it is. */
export function release(w, v, popOut) {
  const s = WS.get(w);
  if (s) { const k = findRec(s, v.id); if (k >= 0) dropRec(s, k); }
  const was = v.inside;
  v.hurled = 0;
  if (was >= 0) { v.inside = -1; v.hidden = 0; if (v.hp > 0) v.eaten = 0; }
  if (!(v.hp > 0)) return;
  v.stun = Math.max(v.stun, 0.4);
  if (popOut && was >= 0) {
    const h = w.unitById(was), hx = h ? h.x : v.x, hy = h ? h.y : v.y;
    if (h) { const a = w.rng() * TAU, r = Math.max(4, h.radius * 0.6); v.x = h.x + Math.cos(a) * r; v.y = h.y + Math.sin(a) * r; }
    tossFrom(w, v, hx, hy, BOSS.POP_OUT, BOSS.POP_UP);
    if (v.z <= 0) v.z = 1;
  } else if (v.z <= 0) v.z = 1;
}
/** Free every captive of `by` (it died): swallowed ones pop out alive. */
export function releaseAll(w, by, popOut = true) {
  const s = WS.get(w); if (!s) return 0;
  let n = 0;
  for (let k = s.caps.length - 1; k >= 0; k--) {
    const e = s.caps[k];
    if (e.by !== by.id) continue;
    const v = w.unitById(e.v);
    if (v) { release(w, v, popOut); n++; } else dropRec(s, k);
  }
  return n;
}
/** The captives of `by` (ids into out[]; returns the count). */
export function captivesOf(w, by, out) {
  const s = WS.get(w); if (!s) return 0;
  let n = 0;
  for (let k = 0; k < s.caps.length && n < out.length; k++) if (s.caps[k].by === by.id) out[n++] = s.caps[k].v;
  return n;
}
/** How many units `by` holds inside right now. */
export function insideCount(w, by) {
  const s = WS.get(w); if (!s) return 0;
  let n = 0;
  for (let k = 0; k < s.caps.length; k++) if (s.caps[k].by === by.id && s.caps[k].mode === INSIDE) n++;
  return n;
}
/** Is v a captive right now? */
export function isCaptive(w, v) { const s = WS.get(w); return !!s && findRec(s, v.id) >= 0; }

// After steering: carry every captive with its holder (inside: at its middle; held: at the arm tip b.ax / b.ay[slot]).
// A holder that is gone (erased, cursed into a frog, Cleared) frees its captives.
function carry(w) {
  const s = WS.get(w); if (!s || s.caps.length === 0) return;
  for (let k = s.caps.length - 1; k >= 0; k--) {
    const e = s.caps[k], v = w.byId.get(e.v);
    if (!v || v.dead) { dropRec(s, k); continue; }
    const h = w.unitById(e.by);
    if (!h) { release(w, v, true); continue; }
    if (!(v.hp > 0)) continue;   // dies this tick: lifecycle takes it (no body if it was inside)
    let x = h.x, y = h.y;
    if (e.mode === HELD) { const b = h.b; if (b.ax) { x = b.ax[e.slot]; y = b.ay[e.slot]; } }
    v.x = v.px = x; v.y = v.py = y; v.z = BOSS.HELD_Z; v.vz = 0; v.vx = 0; v.vy = 0; v.spin = 0;
    v.hurled = 1; v.leaping = 0;
    if (v.stun < 0.3) v.stun = 0.3;
    if (e.mode === INSIDE) { v.hidden = 0.001; v.inside = h.id; v.target = -1; }
  }
}
registerSystem('bosses-captives', carry, 'steering');

// After perception (before the brains): a mage winding up its curse at a boss loses it (bosses are never turned into
// frogs: OG's curse picks the strongest unit around, which is always the boss, and has no boss check; mage.js is an OG
// file, so the guard lives here). The mage's curse goes on its cooldown and it casts something else.
const CURSE_SLOT = 2, CURSE_WINDUP = CURSE_SLOT + 1, CURSE_COOLDOWN = 9;   // mage.js: spell slot 2, subState slot + 1, 9 s
function noCurse(w) {
  if (w.bosses().length === 0) return;
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.subState !== CURSE_WINDUP || u.type !== 'mage' || u.dead) continue;
    const b = u.b, v = b.victim >= 0 ? w.unitById(b.victim) : null;
    if (!v || !v.def.boss) continue;
    b.victim = -1; u.subState = 0;
    if (b.spell) b.spell[CURSE_SLOT] = w.time + CURSE_COOLDOWN;
  }
}
registerSystem('bosses-nocurse', noCurse, 'perception');
