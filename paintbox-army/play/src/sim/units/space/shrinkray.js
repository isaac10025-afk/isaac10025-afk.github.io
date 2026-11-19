// shrinkray (OURS, Space tab): picks the heaviest enemy not yet shrunk within 240 px, aims 0.4 s, and fires a wobbly ring
// (projectile `shrink`, 350 px/s, steering a little after its mark). Whoever the ring touches first (not a prop, not one
// already small: it passes those) becomes `u.shrink` 0.5 (bosses 0.75): radius, hp and maxHp × it, mass × it² (once,
// never undone; damage() already makes a shrunk unit hit at its size, render draws it by its radius). Reload 3 s. It
// keeps its distance between rings; with nobody left to shrink it goes in and zaps (5) (ATTACK3 L3). Owner: SPACE-SIM.
// Pose codes (STEP6.md): b.act 1 aim → `aim`; 2 fire → `fire`; `atk` zap.
import {
  alien, initBag, act, actAge, targetOf, setState, idle, fleeing, closeOn, keepAt, meleeFight, clearLine, swing, unitOf,
  hypot, angleDiff, STATE, DT, ENEMY, registerProjectileKind, removeProjectile, spawnProjectile, sweepFirst, outside, raycast,
} from './_lib.js';

const T = {
  hp: 75, mass: 1, radius: 8,
  walk: 80, run: 130,       // px/s
  range: 240,               // px: picks marks this close (in sight)
  scanEvery: 10,            // ticks between mark searches (ready, not possessed)
  aimTime: 0.4,             // s aiming (b.act 1)
  aimTol: 0.25,             // rad: fires once facing the mark this well
  firePose: 0.3,            // s of the `fire` pose (b.act 2)
  reload: 3,                // s between rings
  ringSpeed: 350,           // px/s
  ringTurn: 2.5,            // rad/s: the ring steers after its mark this fast
  ringPad: 2,               // px past a body: the ring touches it
  ringLife: 1.3,            // × range / speed: the ring fades after flying this long
  shrink: 0.5,              // size factor for everyone ...
  bossShrink: 0.75,         // ... but bosses
  want: 170,                // px: keeps this far from its target while reloading
  band: 40,                 // px slack
  zap: {
    damage: 5, damageJitter: 1, cooldown: 0.8, cooldownJitter: 0.2, push: 40, stun: 0.1,
    reach: 5, band: 8, facing: 0.7, circle: 0.3, backStep: true, chase: true,   // ATTACK3 L3: in close, it follows a runner (meleeFight)
  },
};
const IDLE_S = 0, AIM = 1;   // subState

/** Shrink v (STEP6 shared status): once, never undone. Returns true if it shrank. */
export function shrinkUnit(w, v, by) {
  if (!v || !(v.hp > 0) || v.def.prop || v.shrink < 1) return false;
  const f = v.def.boss ? T.bossShrink : T.shrink;
  v.shrink = f; v.radius *= f; v.hp *= f; v.maxHp *= f; v.mass *= f * f;
  if (v.heldRadius > 0) v.heldRadius *= f;
  w.emit('spell', { x: v.x, y: v.y, v: 0.7, type: v.type, shrink: 1, by: by ? by.type : null });   // STEP6 SPACE AUDIO: shrink = a falling warble
  return true;
}

// ---------------------------------------------------------------- the ring (projectile `shrink`)
const shrunk = (o) => o.shrink < 1;
function stepRing(w, p, i) {
  const m = p.host >= 0 ? w.unitById(p.host) : null;
  if (m && m.hp > 0) {   // steer a little after its mark
    const want = Math.atan2(m.y - p.y, m.x - p.x), cur = Math.atan2(p.vy, p.vx), turn = Math.max(-T.ringTurn * DT, Math.min(T.ringTurn * DT, angleDiff(cur, want)));
    const a = cur + turn; p.vx = Math.cos(a) * T.ringSpeed; p.vy = Math.sin(a) * T.ringSpeed;
  }
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT;
  p.px = x0; p.py = y0;
  const wall = w.walls.count > 0 ? raycast(w, x0, y0, x0 + dx, y0 + dy) : Infinity;
  // ATTACK3 L3: the ring passes through a unit that is already small: the front rank, shrunk first, soaked up every later
  // ring, so the men behind it never shrank and the shrink rays fired at them all battle
  const hit = sweepFirst(w, p, x0, y0, dx, dy, Math.min(1, wall), T.ringPad, false, shrunk);
  if (hit) {
    shrinkUnit(w, hit, p.owner >= 0 ? w.unitById(p.owner) : null);
    removeProjectile(w, i); return;
  }
  if (wall <= 1) { w.emit('spell', { x: x0 + dx * wall, y: y0 + dy * wall, v: 0.3, fizzle: 1 }); removeProjectile(w, i); return; }
  p.x = x0 + dx; p.y = y0 + dy; p.life -= DT;
  if (p.life <= 0 || outside(w, p.x, p.y)) removeProjectile(w, i);
}
registerProjectileKind('shrink', stepRing);

function fire(w, u, m, aim) {
  const c = Math.cos(aim), s = Math.sin(aim);
  const p = spawnProjectile(w, 'shrink', u.x + c * u.radius * 1.4, u.y + s * u.radius * 1.4, c * T.ringSpeed, s * T.ringSpeed,
    T.ringLife * T.range / T.ringSpeed, 0, u.faction, u);
  if (p) p.host = m ? m.id : -1;
  const b = u.b;
  b.next = w.time + T.reload; b.prey = -1; u.subState = IDLE_S; u.attack = 1; u.firedAt = w.time;
  act(w, u, 2);
  w.emit('spell', { x: u.x, y: u.y, v: 0.5, type: u.type, cast: 1 });   // STEP6 SPACE AUDIO
  if (w.stats) w.stats.shots++;
}

const MQ = new Array(48);
function shrinkable(o) { return o.hp > 0 && !o.dead && !o.def.prop && o.shrink >= 1 && o.inside < 0; }
// heaviest unshrunk enemy within range, in sight
function findMark(w, u) {
  const n = w.queryMask(u.x, u.y, T.range, ENEMY[u.faction], MQ, MQ.length);
  let best = null, bm = -1;
  for (let k = 0; k < n; k++) {
    const o = MQ[k]; MQ[k] = null;
    if (!shrinkable(o) || o.unseen > 0 && hypot(o.x - u.x, o.y - u.y) > o.unseen) continue;
    if (o.mass > bm && (w.walls.count === 0 || w.walls.lineOfSight(u.x, u.y, o.x, o.y))) { bm = o.mass; best = o; }
  }
  return best;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (b.act === 2 && actAge(w, u) > T.firePose) act(w, u, 0);
  if (u.stun > 0) { if (u.subState === AIM) { u.subState = IDLE_S; act(w, u, 0); } u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) { u.subState = IDLE_S; if (b.act === 1) act(w, u, 0); return; }
  const ready = now >= b.next;
  let m = unitOf(w, b.prey);
  if (u.possessed === 1) m = t && shrinkable(t) ? t : null;   // the player picks the mark
  else if (ready && u.subState !== AIM && (w.tick + u.index) % T.scanEvery === 0) m = findMark(w, u);
  if (m && (!shrinkable(m) || hypot(m.x - u.x, m.y - u.y) > T.range * 1.15)) m = null;
  b.prey = m ? m.id : -1;
  if (ready && m) {   // aim, then fire
    const dx = m.x - u.x, dy = m.y - u.y, d = hypot(dx, dy) || 0.001, lead = d / T.ringSpeed;
    const aim = Math.atan2(dy + m.vy * lead, dx + m.vx * lead);
    setState(u, STATE.ENGAGE); u.face = aim;
    if (u.subState !== AIM) { u.subState = AIM; b.t0 = now; act(w, u, 1); return; }
    if (now - b.t0 >= T.aimTime && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) fire(w, u, m, aim);
    return;
  }
  if (u.subState === AIM) { u.subState = IDLE_S; act(w, u, 0); }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (meleeFight(w, u, t, T.zap, dx, dy, d) !== 0) return;
  // ATTACK3 L3: ring ready but nobody left to shrink (its last look found none): go in and zap. Keeping its distance
  // then left it staring at shrunk foes for the rest of the battle (a legion stopped 120 px off it: neither moved again)
  if (u.possessed === 1 || !clearLine(w, u) || d > T.range || (ready && !m)) { closeOn(w, u, t, dx, dy, d); return; }
  keepAt(w, u, t, dx, dy, d, T.want, T.band);
}

const D = alien({
  type: 'shrinkray', og: 'Shrink Ray (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.7,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3,
  weapon: { range: T.range },   // possess: aim reach
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.b.next = w.time + T.reload * 0.5 * w.rng(); },
  // possessed, attack held at nobody: a ring toward the aim (it shrinks whatever it touches first)
  possessFire(w, u, aim) {
    if (w.time < u.b.next) { swing(w, u, T.zap.cooldown); return; }
    fire(w, u, null, aim);
  },
  brain,
});
export default D;
export { T };
