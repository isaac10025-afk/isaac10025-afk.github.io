// mindalien (OURS, Space tab): mind control. Channels 2 s on the strongest enemy (def.strength) within 180 px in sight;
// then that unit fights for the alien's side: faction, team and a fresh group of its own (turn.js changes sides by
// making a new unit; a thrall keeps its body, so it is changed in place and given back later). Never takes machines,
// bosses, Mindless units (zombie, skeleton, slime, risen copies), props, the unit the player drives, or another
// alien's thrall. One thrall at a time; thrall dead → another after 4 s. 20+ damage taken while channelling breaks it.
// The alien dies (or is erased) → the thrall goes back to its old side. With a thrall it hangs back behind it; a weak
// zap (5, ours: STEP6 gives it no attack, but every unit must be able to fight when possessed) for anyone close.
// Owner: SPACE-SIM. Pose codes (STEP6.md): b.act 1 channel → `channel` (b.victim = the mark; head glows). b.thrall = the
// held unit (-1 none). Swirl = effect projectile `mind` riding on the mark / thrall: p.k = channel progress 0..1 (1 = held).
import {
  alien, initBag, act, targetOf, setState, idle, fleeing, closeOn, keepAt, meleeFight, clearLine, swing, unitOf,
  spawnEffect, rideOn, hypot, STATE, INT, ENEMY, registerProjectileKind, removeProjectile,
} from './_lib.js';
import { isHostile } from '../../factions.js';
import { registerSystem } from '../../systems/extra.js';
import { onWorldClear, onReside } from '../../world.js';

const T = {
  hp: 70, mass: 0.9, radius: 8,
  walk: 65, run: 110,       // px/s
  range: 180,               // px: channels on enemies this close, in sight
  keep: 1.25,               // × range: the channel breaks if the mark gets further than this (or out of sight)
  channel: 2,               // s to take a mind
  breakDmg: 20,             // damage taken while channelling that breaks it
  retry: 4,                 // s after its thrall dies before it looks for another
  failRetry: 1,             // s after a broken channel
  scanEvery: 10,            // ticks between searches (ready, not possessed)
  hang: 70,                 // px: with a thrall it stays this far behind it (away from the thrall's target)
  want: 150,                // px: keeps this far from its target with nobody to take
  band: 40,
  nerve: 0.6,               // a thrall's morale never drops below this (it doesn't run from its new fight)
  zap: {
    damage: 5, damageJitter: 1, cooldown: 0.8, cooldownJitter: 0.2, push: 40, stun: 0.1,
    reach: 5, band: 8, facing: 0.7, circle: 0.3, backStep: true,
  },
};
const NONE = 0, CHAN = 1;   // subState

// ---------------------------------------------------------------- thralls (per world): who holds whom, their old side
const WS = new WeakMap();
function ws(w) { let s = WS.get(w); if (!s) { s = { list: [], free: [] }; WS.set(w, s); } return s; }
onWorldClear((w) => { const s = WS.get(w); if (s) { for (const e of s.list) s.free.push(e); s.list.length = 0; } });
// Team switch (world.reside, 11-17): every thrall has just been put back on its own side / its half's team, so the
// aliens let go of them.
onReside((w) => {
  const s = WS.get(w); if (!s) return;
  for (const e of s.list) { const a = w.byId.get(e.by); if (a && a.b && a.b.thrall === e.id) a.b.thrall = -1; s.free.push(e); }
  s.list.length = 0;
});
function recOf(w, id) { const s = WS.get(w); if (!s) return null; for (const e of s.list) if (e.id === id) return e; return null; }
/** Is v some mind alien's thrall right now? */
export function thrallOf(w, v) { const e = recOf(w, v.id); return e ? e.by : -1; }

// STEP6 names the slimes Mindless, but OG's slime def says Animal: they are left out by type
const SLIMES = new Set(['slime', 'bigslime', 'slimelet', 'kingslime']);
/** May the alien take v's mind? (STEP6 rule + the obvious ones) */
export function controllable(w, v) {
  const d = v.def;
  return v.hp > 0 && !v.dead && !d.prop && !d.machine && !d.boss && d.intelligence !== INT.Mindless && d.risenFrom === undefined &&
    !SLIMES.has(v.type) &&
    v.possessed !== 1 && v.inside < 0 && v.hurled !== 1 && recOf(w, v.id) === null;
}
// one-off at a side change: units that now share v's side drop it as a target, and v drops its own
function retarget(w, v) {
  v.target = -1; v.state = STATE.IDLE; v.stateTime = 0;
  const us = w.units;
  for (let i = 0; i < us.length; i++) { const o = us[i]; if (!o.dead && o.target === v.id && !isHostile(o, v)) o.target = -1; }
}
function newGroup(w, v, faction) {
  const gs = w.groups, g = gs.create(v.type, faction);
  if (g >= 0) { gs.join(g); gs.release(g); }
  return g;
}
function seize(w, u, v) {
  const s = ws(w), e = s.free.pop() || { id: -1, by: -1, fac: 0, gen: 0, team: -1, group: -1 };
  e.id = v.id; e.by = u.id; e.fac = v.faction; e.gen = w.sides.gen[v.faction]; e.team = v.team; e.group = v.group;
  s.list.push(e);
  v.faction = u.faction; v.team = u.team; v.group = newGroup(w, v, u.faction);
  v.homeX = v.x; v.homeY = v.y; v.morale = Math.max(v.morale, 1);
  retarget(w, v);
  u.b.thrall = v.id; u.b.victim = -1; u.subState = NONE;
  act(w, u, 0);
  w.emit('curse', { x: v.x, y: v.y, v: 1, type: u.type, mind: 1, id: v.id });   // STEP6 SPACE AUDIO: mind = a warbly hum
}
// give v back to its old side (its old group if that still stands for it, else a fresh one)
function giveBack(w, e) {
  const v = w.unitById(e.id);
  if (v && v.hp > 0) {
    const gs = w.groups, g = e.group;
    // side split 11-17: if its old side slot changed hands while it was held (its side died out), it rejoins its own side
    if (w.sides.gen[e.fac] !== e.gen) e.fac = w.factionOf(v.def, e.team);
    v.faction = e.fac; v.team = e.team;
    v.group = g >= 0 && gs.alive[g] === 1 && gs.faction[g] === e.fac && gs.type[g] === v.type ? g : newGroup(w, v, e.fac);
    retarget(w, v);
    w.emit('curse', { x: v.x, y: v.y, v: 0.6, type: v.type, mind: 2, id: v.id });
  }
  const a = w.byId.get(e.by);
  if (a && a.b && a.b.thrall === e.id) a.b.thrall = -1;
}
function dropRec(s, k) { s.free.push(s.list[k]); s.list[k] = s.list[s.list.length - 1]; s.list.pop(); }
// after morale, before brains: a thrall whose alien is gone goes back; a held one never breaks
function mindSys(w) {
  const s = WS.get(w); if (!s || !s.list.length) return;
  for (let k = s.list.length - 1; k >= 0; k--) {
    const e = s.list[k], v = w.unitById(e.id);
    if (!v || !(v.hp > 0)) { const a = w.byId.get(e.by); if (a && a.b && a.b.thrall === e.id) a.b.thrall = -1; dropRec(s, k); continue; }
    const a = w.unitById(e.by);
    if (!a || !(a.hp > 0)) { giveBack(w, e); dropRec(s, k); continue; }
    if (v.state === STATE.FLEE) { v.state = STATE.IDLE; v.stateTime = 0; }
    if (v.morale < T.nerve) v.morale = T.nerve;
  }
}
registerSystem('spaceMind', mindSys, 'morale');
function freeThrallOf(w, u) {
  const s = WS.get(w); if (!s) return;
  for (let k = s.list.length - 1; k >= 0; k--) if (s.list[k].by === u.id) { giveBack(w, s.list[k]); dropRec(s, k); }
}

// ---------------------------------------------------------------- the swirl (effect projectile `mind`)
function stepMind(w, p, i) {
  const a = p.owner >= 0 ? w.unitById(p.owner) : null, v = p.host >= 0 ? w.unitById(p.host) : null;
  const held = !!a && !!v && a.b.thrall === v.id, chan = !!a && !!v && a.subState === CHAN && a.b.victim === v.id;
  if (!v || !(v.hp > 0) || !(a && a.hp > 0) || (!held && !chan)) { removeProjectile(w, i); return; }
  rideOn(p, v, 0); p.r = v.radius;
  p.k = held ? 1 : Math.min(1, (w.time - a.b.t0) / T.channel);
}
registerProjectileKind('mind', stepMind);

// ---------------------------------------------------------------- brain
const MQ = new Array(48);
function inSight(w, u, o) { return w.walls.count === 0 || w.walls.lineOfSight(u.x, u.y, o.x, o.y); }
// the strongest (def.strength) controllable enemy within range, in sight; ties: the nearest
function findMark(w, u) {
  const n = w.queryMask(u.x, u.y, T.range, ENEMY[u.faction], MQ, MQ.length);
  let best = null, bs = -1, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = MQ[k]; MQ[k] = null;
    if (!controllable(w, o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y), st = o.def.strength || 0;
    if (o.unseen > 0 && d > o.unseen) continue;
    if ((st > bs || (st === bs && d < bd)) && inSight(w, u, o)) { bs = st; bd = d; best = o; }
  }
  return best;
}
function startChannel(w, u, v) {
  const b = u.b;
  u.subState = CHAN; b.victim = v.id; b.t0 = w.time; b.hurt = 0;
  act(w, u, 1);
  spawnEffect(w, 'mind', u, v, 99);
  w.emit('spell', { x: u.x, y: u.y, v: 0.5, type: u.type, mind: 1 });
}
function stopChannel(w, u, retry) {
  u.subState = NONE; u.b.victim = -1; u.b.next = w.time + retry;
  act(w, u, 0);
}
function channel(w, u) {
  const b = u.b, v = unitOf(w, b.victim);
  if (!v || !controllable(w, v) || !isHostile(u, v) || u.stun > 0.25 || b.hurt >= T.breakDmg ||
      hypot(v.x - u.x, v.y - u.y) > T.range * T.keep || !inSight(w, u, v)) { stopChannel(w, u, T.failRetry); return; }
  setState(u, STATE.ENGAGE);
  u.face = Math.atan2(v.y - u.y, v.x - u.x);
  if (w.time - b.t0 >= T.channel) seize(w, u, v);
}

function brain(w, u) {
  const b = u.b, now = w.time;
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.subState === CHAN) { channel(w, u); return; }
  let th = unitOf(w, b.thrall);
  if (b.thrall >= 0 && (!th || !(th.hp > 0) || thrallOf(w, th) !== u.id)) { b.thrall = -1; th = null; b.next = now + T.retry; }
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!th && now >= b.next) {
    let m = null;
    if (t && controllable(w, t) && hypot(t.x - u.x, t.y - u.y) <= T.range && clearLine(w, u)) m = t;
    else if (u.possessed !== 1 && (w.tick + u.index) % T.scanEvery === 0) m = findMark(w, u);
    if (m) { startChannel(w, u, m); setState(u, STATE.ENGAGE); u.face = Math.atan2(m.y - u.y, m.x - u.x); return; }
  }
  if (t) {
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (meleeFight(w, u, t, T.zap, dx, dy, d) !== 0) return;
  }
  if (th && u.possessed !== 1) {   // hang back behind the thrall (away from what it fights)
    const tt = th.target >= 0 ? w.unitById(th.target) : null;
    let ax = th.x - (tt ? tt.x : th.x - Math.cos(th.heading)), ay = th.y - (tt ? tt.y : th.y - Math.sin(th.heading));
    const ad = hypot(ax, ay) || 1; ax /= ad; ay /= ad;
    const gx = th.x + ax * T.hang - u.x, gy = th.y + ay * T.hang - u.y, gd = hypot(gx, gy);
    if (gd > 12) { const sp = gd > 120 ? u.def.runSpeed : u.def.walkSpeed; u.goalX = gx / gd * sp; u.goalY = gy / gd * sp; }
    setState(u, STATE.ALERT);
    if (t) u.face = Math.atan2(t.y - u.y, t.x - u.x);
    return;
  }
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  if (u.possessed === 1 || !clearLine(w, u) || d > T.range) { closeOn(w, u, t, dx, dy, d); return; }
  keepAt(w, u, t, dx, dy, d, T.want, T.band);
}

const D = alien({
  type: 'mindalien', og: 'Mind Alien (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 0.8,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3,
  weapon: { range: T.range },   // possess: aim reach
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.b.thrall = -1; u.b.hurt = 0; u.b.next = w.time + 0.5 + w.rng(); },
  onHit(w, u, amount) { if (u.subState === CHAN) u.b.hurt += amount; },
  onDeath(w, u) { if (u.subState === CHAN) stopChannel(w, u, 0); freeThrallOf(w, u); },
  possessFire(w, u) { swing(w, u, T.zap.cooldown); },
  brain,
});
export default D;
export { T };
