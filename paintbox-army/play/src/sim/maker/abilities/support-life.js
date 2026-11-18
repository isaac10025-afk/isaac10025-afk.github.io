// Unit maker A-SUPPORT: raise, bees, crows, split, rebirth (OURS, Part 2 step 8, STEP8.md). Owner: A-SUPPORT.
// Helpers it spawns (skeletons, bees, crows, split copies) join the made unit's side: { team: u.team, faction: u.faction, like: u }
// (like: they go back to its side when Team battle goes off, world.js reside).
import { registerAbility } from '../registry.js';
import { ACT, power, used, STATE, DT, hypot, ENEMY, damage, push, setState, canAuto, igniteNow, registerSystem } from '../lib.js';
import { maskBit, canHit } from '../../factions.js';
import { onWorldClear } from '../../world.js';
import { CAUSE } from '../../const.js';
import { getDef } from '../../defs.js';
import { addCorpse } from '../../combat/death.js';
import { pose, unpose, poseFor, slotOf, MARGIN, Q } from './support-lib.js';

const TAU = Math.PI * 2;

// ================================================================ raise (from units/mythical/necro.js raise(), STEP8 rule)
// STEP8: every 8 s with 2+ bodies within 120 px (× power), up to 6 of them rise as skeletons of its side. The rising is
// the necro's (risen copy, skeleton flag, sized by the body, fear burst on the enemy); the cast is the necro's 1.2 s.
const RAISE = {
  every: 8,        // s between raises
  retry: 0.5,      // s between looks for bodies when there aren't enough
  first: 0.5,      // s after it appears before the first look
  min: 2,          // bodies needed within reach ...
  r: 120,          // ... px × power from it
  max: 6,          // at most this many rise per raise
  cast: 1.2,       // s of the cast (necro CAST_T): it stands, arms out (ACT.CHANNEL); a stun breaks it
  keepEvery: 10,   // ticks between looks for fresh bodies to keep (they'd fade after 1.1 s: necro keepRecent)
  keepWindow: 0.7, // s: bodies younger than this are kept (necro KEEP_S) ...
  keepPad: 40,     // ... when they fell within reach + this many px
  fearR: 240,      // px: the raise frightens enemies this close (necro fearBurst) ...
  fearBase: 0.8,   // ... morale lost: base ...
  fearEach: 0.05,  // ... + this per extra skeleton ...
  fearMax: 1,      // ... at most
  maxR: 46,        // px: largest skeleton radius (OG MAX_R)
};
function risenOf(type) { return getDef('risen_' + type) ? 'risen_' + type : null; }
// a body that can rise: lying low, not raised / eaten / an ant meal, not undead, has a risen copy, still drawn
function raisable(w, c) {
  return !!c && !c.removed && c.raised !== 1 && c.eaten !== 1 && !(c.colony > 0) && c.undead !== 1 && !((c.z || 0) > 4) &&
    w.time >= c.t && (c.kept === 1 || w.time - c.t < 1.1) && risenOf(c.type) !== null;
}
function keepNear(w, u, bag) {
  const cs = w.corpses; if (!cs || cs.length === 0) return;
  const R = bag.r + RAISE.keepPad, t0 = w.time - RAISE.keepWindow;
  for (let k = cs.length - 1; k >= 0; k--) {
    const c = cs[k];
    if (!c || c.kept === 1 || c.t < t0 || c.raised === 1 || c.removed) continue;
    if (hypot(c.x - u.x, c.y - u.y) <= R) c.kept = 1;
  }
}
// how many bodies can rise within reach (their middle in bag.sx / sy)
function countBodies(w, u, bag) {
  const cs = w.corpses; if (!cs) return 0;
  let n = 0, sx = 0, sy = 0;
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (!raisable(w, c) || hypot(c.x - u.x, c.y - u.y) > bag.r) continue;
    n++; sx += c.x; sy += c.y;
  }
  if (n > 0) { bag.sx = sx / n; bag.sy = sy / n; }
  return n;
}
function raiseNow(w, u, bag) {
  const cs = w.corpses || [];
  let n = 0;
  for (let m = 0; m < RAISE.max; m++) {   // nearest first
    let best = null, bd = Infinity;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (!raisable(w, c)) continue;
      const d = hypot(c.x - u.x, c.y - u.y);
      if (d <= bag.r && d < bd) { bd = d; best = c; }
    }
    if (!best) break;
    const rt = risenOf(best.type), md = getDef(rt);
    const f = w.spawn(rt, best.x, best.y, { team: u.team, faction: u.faction, like: u, heading: best.side > 0 ? 0 : Math.PI });
    best.raised = 1;
    if (!f) break;   // pool full
    f.faction = u.faction; f.skeleton = 1; f.hatless = best.hatless | 0;
    const y = Math.min(RAISE.maxR, best.r), area = (y / md.radius) ** 2;
    f.radius = y; f.mass = md.mass * area; f.maxHp = f.hp = md.maxHp * area;
    f.curseType = best.curseType ?? null;
    w.emit('puff', { x: best.x, y: best.y, ang: -Math.PI / 2, size: 0.8 });
    n++;
  }
  if (n > 0) {
    used(w, u, 'raise');
    const r = Math.min(RAISE.fearMax, RAISE.fearBase + RAISE.fearEach * (n - 1));   // necro fearBurst
    const k = w.queryMask(bag.sx, bag.sy, RAISE.fearR, ENEMY[u.faction], Q, Q.length);
    for (let j = 0; j < k; j++) {
      const o = Q[j]; Q[j] = null;
      if (!(o.hp > 0) || o.def.prop || (o.def.look && o.def.look.undead)) continue;
      const d = hypot(o.x - bag.sx, o.y - bag.sy);
      if (d <= RAISE.fearR) o.morale = Math.max(0, o.morale - r * (1 - d / RAISE.fearR));
    }
  }
  bag.n = n; bag.next = w.time + (n > 0 ? RAISE.every : RAISE.retry);
}
registerAbility({
  id: 'raise',
  init(w, u, bag) { bag.r = RAISE.r * power(u); bag.next = w.time + RAISE.first; bag.castT = -9; bag.castEnd = 0; bag.sx = u.x; bag.sy = u.y; bag.n = 0; bag.pc = 0; bag.pt = 0; },
  tick(w, u, bag) { if (u.hp > 0 && (w.tick + u.index) % RAISE.keepEvery === 0) keepNear(w, u, bag); },
  // the cast drives the unit (it stands); a stun, running or dying breaks it
  busy(w, u, bag) {
    const now = w.time;
    if (bag.castEnd > 0) {
      if (u.stun > 0 || !(u.hp > 0) || u.state === STATE.FLEE) { bag.castEnd = 0; unpose(w, u, bag); bag.next = now + RAISE.retry; return false; }
      u.goalX = 0; u.goalY = 0; u.face = Math.atan2(bag.sy - u.y, bag.sx - u.x); setState(u, STATE.ENGAGE);
      pose(w, u, bag, ACT.CHANNEL);
      if (now < bag.castEnd) return true;
      bag.castEnd = 0; unpose(w, u, bag);
      raiseNow(w, u, bag);
      return true;
    }
    if (now < bag.next || u.stun > 0 || !(u.hp > 0) || u.state === STATE.FLEE || !canAuto(w, u)) return false;
    if (countBodies(w, u, bag) < RAISE.min) { bag.next = now + RAISE.retry; return false; }
    bag.castT = now; bag.castEnd = now + RAISE.cast;
    pose(w, u, bag, ACT.CHANNEL);
    u.goalX = 0; u.goalY = 0; u.face = Math.atan2(bag.sy - u.y, bag.sx - u.x);
    w.emit('raise', { x: bag.sx, y: bag.sy, v: 1, type: u.type, as: 'necro' });
    return true;
  },
  // the matrix field has no bodies: five riflemen's bodies lie in a line from it toward the foes (a fast body runs on)
  test: { setup(g, w, u) { for (let k = 0; k < 5; k++) { const c = addCorpse(w, { type: 'rifle', x: u.x + 50 * k, y: u.y + 25 * (k & 1 ? 1 : -1) }); if (c) c.kept = 1; } }, within: 10 },
});

// ================================================================ bees (from units/bugs/beehive.js, on its back)
const BEES = {
  every: 2.5,      // s between bees while enemies are near
  sense: 300,      // px: enemies this close wake the hive
  max: 6,          // its own bees alive at once (STEP8: 6 per unit; the beehive's is 12)
  burst: 2,        // bees out at once when it's hit (STEP8: 2; the beehive's is 4) ...
  burstEvery: 3,   // ... at most every 3 s
  scanEvery: 15,   // ticks between looks for enemies
  outR: 5,         // px: bees come out this far apart ...
  outZ: 6,         // ... and this high (they rise to flying height)
};
// its helpers still alive (ids kept in slots; a gone one frees its slot); `kind` = 'bee' | 'crow'
function liveHelpers(w, u, ids, kind) {
  let n = 0;
  for (let k = 0; k < ids.length; k++) {
    if (ids[k] < 0) continue;
    const o = w.unitById(ids[k]);
    if (o && o.hp > 0 && o.type === kind && o.b.home === u.id) n++; else ids[k] = -1;
  }
  return n;
}
function keepId(ids, id) { for (let k = 0; k < ids.length; k++) if (ids[k] < 0) { ids[k] = id; return; } }
function releaseBees(w, u, bag, n, foe) {
  const room = BEES.max - liveHelpers(w, u, bag.ids, 'bee');
  let made = 0;
  for (let k = 0; k < n && made < room; k++) {
    const a = w.rng() * TAU, r = BEES.outR + u.radius * 0.3;
    const o = w.spawn('bee', u.x + Math.cos(a) * r, u.y + Math.sin(a) * r * 0.5 - 2, { team: u.team, faction: u.faction, like: u, heading: a });
    if (!o) break;
    o.b.home = u.id; o.z = o.pz = BEES.outZ; o.homeX = u.x; o.homeY = u.y - 6;
    if (foe) { o.target = foe.id; o.react = 0; o.state = STATE.CHARGE; }   // out angry (beehive release)
    keepId(bag.ids, o.id);
    used(w, u, 'bees');
    made++;
  }
  if (made > 0) { bag.outAt = w.time; w.emit('flap', { x: u.x, y: u.y, v: 0.4 * made, type: u.type, as: 'bee' }); }   // the hive's own flap event carries type 'bee'
  return made;
}
registerAbility({
  id: 'bees',
  init(w, u, bag) { bag.ids = new Int32Array(BEES.max).fill(-1); bag.next = w.time + 0.5; bag.next2 = 0; bag.flag = 0; bag.k = -1; bag.prey = -1; bag.outAt = -9; },
  // every tick (the hive works whatever the unit is doing): a bee every 2.5 s with enemies near; hit = a burst
  tick(w, u, bag) {
    if (!(u.hp > 0) || u.inside >= 0) return;
    const now = w.time;
    if ((w.tick + u.index) % BEES.scanEvery === 0) { const f = w.findNearest(u.x, u.y, BEES.sense, ENEMY[u.faction], u, 1); bag.prey = f && f.hp > 0 ? f.id : -1; }
    if (bag.flag === 1 && now >= bag.next2) {
      bag.flag = 0; bag.next2 = now + BEES.burstEvery;
      const a = bag.k >= 0 ? w.unitById(bag.k) : null, p = bag.prey >= 0 ? w.unitById(bag.prey) : null, foe = a && a.hp > 0 ? a : p && p.hp > 0 ? p : null;
      releaseBees(w, u, bag, BEES.burst, foe);
      bag.k = -1;
      if (now >= bag.next - BEES.every * 0.5) bag.next = now + BEES.every;
      return;
    }
    bag.flag = 0;
    const foe = bag.prey >= 0 ? w.unitById(bag.prey) : null;
    if (foe && foe.hp > 0 && now >= bag.next) { bag.next = now + BEES.every; releaseBees(w, u, bag, 1, foe); }
  },
  onHit(w, u, amount, att, kind, bag) {   // any hit: bees burst out at the attacker (next tick), at most every 3 s
    if (!(amount > 0) || w.time < bag.next2) return;
    bag.flag = 1;
    if (att && att.hp > 0 && att !== u) bag.k = att.id;
  },
});

// ================================================================ crows (from units/secret/scarecrow.js callCrows)
const CROWS = {
  every: 7,        // s between crow calls (with an enemy about)
  per: 3,          // crows per call
  max: 9,          // crows alive per unit
  spread: 16,      // px: crows appear this far round it (× power)
  call: 0.8,       // s of the call pose (ACT.ROAR: arms up)
};
registerAbility({
  id: 'crows',
  init(w, u, bag) { bag.ids = new Int32Array(CROWS.max).fill(-1); bag.next = w.time + 1 + w.rng(); bag.pc = 0; bag.pt = 0; },
  tick(w, u, bag) { poseFor(w, u, bag, CROWS.call); },
  act(w, u, t, dx, dy, d, bag) {
    if (w.time < bag.next) return false;
    bag.next = w.time + CROWS.every;
    const k = Math.min(CROWS.per, CROWS.max - liveHelpers(w, u, bag.ids, 'crow'));
    let made = 0;
    for (let i = 0; i < k; i++) {
      const a = w.rng() * TAU, r = CROWS.spread * power(u) * (0.6 + 0.4 * w.rng());
      const c = w.spawn('crow', u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, { team: u.team, faction: u.faction, like: u, heading: a });
      if (!c) break;
      c.b.home = u.id; c.z = c.pz = 6;
      keepId(bag.ids, c.id);
      made++;
    }
    if (made > 0) {
      used(w, u, 'crows');
      pose(w, u, bag, ACT.ROAR);
      w.emit('flap', { x: u.x, y: u.y, v: 1, type: u.type, crows: made, as: 'scarecrow' });
    }
    return false;
  },
});

// ================================================================ split (from units/bosses/kingslime.js onDeath, STEP8 rule)
const SPLIT = {
  copies: 2,       // copies on death ...
  size: 0.6,       // ... at this size (the shared `shrink` status: radius × it, mass × it², its hits × it) ...
  hp: 0.5,         // ... and this × its max hp
  gens: 2,         // generations: the copies split once more, theirs don't
  out: 0.5,        // × its radius: the copies start this far apart ...
  push: 110,       // ... and are shoved apart this hard (px/s at mass 1)
};
registerAbility({
  id: 'split',
  init(w, u, bag) { bag.gen = 0; },
  onDeath(w, u, cause, killer, bag) {
    if (bag.gen >= SPLIT.gens || cause === CAUSE.Turned || cause === 'turned' || u.inside >= 0 || u.eaten === 1) return;
    const slot = slotOf(u, bag); if (slot < 0) return;
    const g = typeof w.createGroup === 'function' ? w.createGroup(u.type, u.team) : -1, a0 = w.rng() * TAU, sh = u.shrink > 0 ? u.shrink : 1;
    let first = null, n = 0;
    for (let k = 0; k < SPLIT.copies; k++) {
      const a = a0 + k * TAU / SPLIT.copies + 0.3 * (w.rng() - w.rng()), r = u.radius * SPLIT.out;
      const c = w.spawn(u.type, u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, { group: g >= 0 ? g : -1, team: u.team, faction: u.faction, like: u, heading: a });
      if (!c) break;
      c.shrink = sh * SPLIT.size; c.radius = u.radius * SPLIT.size; c.mass = u.mass * SPLIT.size * SPLIT.size;
      c.maxHp = c.hp = Math.max(1, u.maxHp * SPLIT.hp);
      const cb = c.b.ab && c.b.ab[slot]; if (cb) cb.gen = bag.gen + 1;
      push(w, c, Math.cos(a), Math.sin(a), SPLIT.push * Math.max(1, c.mass), 0.2);
      if (!first) first = c;
      n++;
    }
    if (g >= 0 && typeof w.releaseGroup === 'function') w.releaseGroup(g);
    if (n === 0) return;
    u.eaten = 1;   // it became the copies: no body (the king slime's rule)
    if (first && u.possessed === 1) w.handOver(u, first);   // the player goes on as one of the copies
    used(w, u, 'split');
    w.emit('split', { x: u.x, y: u.y, v: u.radius / 13, type: u.type, as: 'kingslime' });
    for (let k = 0; k < 3; k++) w.emit('puff', { x: u.x, y: u.y, ang: a0 + k * 2.1, size: 0.6 + 0.2 * k });
  },
  test: { setup(g, w, u) { u.hp = 1; }, within: 15 },
});

// ================================================================ rebirth (from units/secret/phoenix.js)
// At 0 hp, once: it bursts (fire blast) and lies in a burning egg for 5 s (it can't act; egg hp; fire can't hurt it),
// then rises at full hp. Broken in the egg = dead for good (a normal body: any body can have this, not just a bird).
const REB = {
  burstR: 60,      // px × power: the rebirth burst radius ...
  burstDmg: 40,    // ... damage (+ ignite) to enemies in it
  down: 5,         // s in the egg (ACT.DOWN; bag.down 1, bag.crack 0..1)
  eggHp: 120,      // × power: egg hit points
  hatch: 0.6,      // s of the hatch pose (ACT.ROAR) after it rises
};
const RB = new WeakMap();   // world -> { us, slots }: the made units with rebirth
function rebList(w) { let L = RB.get(w); if (L === undefined) { L = { us: [], slots: [] }; RB.set(w, L); } return L; }
onWorldClear((w) => { const L = RB.get(w); if (L) { L.us.length = 0; L.slots.length = 0; } });
let _bu = null, _bw = null, _br = 0;
function burstOne(o) {
  const u = _bu;
  if (o.dead || !(o.hp > 0) || o.inside >= 0 || o.def.prop || !canHit(u, o) || hypot(o.x - u.x, o.y - u.y) - o.radius > _br) return;
  damage(_bw, o, REB.burstDmg, u, 'fire', u.x, u.y);
  if (o.hp > 0) igniteNow(_bw, o);
}
function becomeEgg(w, u, bag) {
  _bu = u; _bw = w; _br = REB.burstR * power(u);
  w.query(u.x, u.y, _br + MARGIN, burstOne, ENEMY[u.faction]);
  _bu = null; _bw = null;
  w.emit('explosion', { x: u.x, y: u.y, r: _br, fire: 1, type: u.type, as: 'phoenix' });   // the blast look + boom
  w.emit('ignite', { x: u.x, y: u.y, v: u.radius, type: u.type, rebirth: 1, as: 'phoenix' });
  bag.reborn = 1; bag.down = 1; bag.maxHp0 = u.maxHp; bag.crack = 0; bag.t0 = w.time;
  u.maxHp = u.hp = REB.eggHp * power(u) * (u.shrink > 0 ? u.shrink : 1);
  u.vx *= 0.3; u.vy *= 0.3; u.target = -1; u.burning = 0;
  if (u.stun < 0.1) u.stun = 0.1;
  pose(w, u, bag, ACT.DOWN);
  used(w, u, 'rebirth');
}
// after water, before deaths are processed (as the phoenix's 'secret-rebirth'): a made unit at 0 hp goes into its egg
// (once); one broken in its egg dies as normal
function rebirthRun(w) {
  const L = RB.get(w); if (L === undefined || L.us.length === 0) return;
  const us = L.us;
  for (let i = us.length - 1; i >= 0; i--) {
    const u = us[i];
    if (u.dead) { us[i] = us[us.length - 1]; us.pop(); L.slots[i] = L.slots[L.slots.length - 1]; L.slots.pop(); continue; }
    const bag = u.b.ab && u.b.ab[L.slots[i]];
    if (!bag || u.hp > 0) continue;
    if (bag.down === 1) {   // broken in its egg: dies as itself (its own max hp back, e.g. for split's half-hp copies)
      bag.down = 0; u.maxHp = bag.maxHp0;
      w.emit('ricochet', { x: u.x, y: u.y, v: 0.6, type: u.type, eggbreak: 1, as: 'phoenix' });
      continue;
    }
    if (bag.reborn === 1 || u.inside >= 0 || u.eaten === 1 || u.infection > 0) continue;
    becomeEgg(w, u, bag);
  }
}
registerSystem('maker-rebirth', rebirthRun, 'water');
registerAbility({
  id: 'rebirth',
  init(w, u, bag) {
    bag.reborn = 0; bag.down = 0; bag.t0 = -9; bag.crack = 0; bag.maxHp0 = u.maxHp; bag.hatchT = -9; bag.pc = 0; bag.pt = 0;
    const L = rebList(w); L.us.push(u); L.slots.push(slotOf(u, bag));
  },
  // the egg's clock (every tick, stunned or not): it can't act, doesn't burn; at 5 s it hatches at full hp
  tick(w, u, bag) {
    if (bag.down !== 1) { if (bag.pc === ACT.ROAR) poseFor(w, u, bag, REB.hatch); return; }
    if (!(u.hp > 0)) return;
    u.target = -1; u.burning = 0;
    if (u.stun < 0.1) u.stun = 0.1;
    pose(w, u, bag, ACT.DOWN);
    bag.crack = Math.min(1, (w.time - bag.t0) / REB.down);
    if (w.time - bag.t0 < REB.down) return;
    bag.down = 0; bag.crack = 1; bag.hatchT = w.time;
    u.maxHp = bag.maxHp0; u.hp = u.maxHp; u.stun = 0;
    pose(w, u, bag, ACT.ROAR);
    w.emit('spell', { x: u.x, y: u.y, v: 1, type: u.type, hatch: 1, as: 'phoenix' });
  },
  damageMul(w, u, amount, att, kind, bag) { return bag.down === 1 && kind === 'fire' ? 0 : 1; },
  holdsNerve(w, u, bag) { return bag.down === 1; },
  test: { setup(g, w, u) { u.hp = 1; }, within: 15 },
});

export { RAISE, BEES, CROWS, SPLIT, REB };
