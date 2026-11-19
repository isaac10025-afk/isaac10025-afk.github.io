// Unit maker: A-ACT2 abilities (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT2.
// bomb, magnet, ink, stink, mind, grabfour, drink, shock, curse, smoke: each = the source unit's trick (its numbers, its
// events with `as: '<source type>'`) made to work on ANY body, size and weapon. Areas (blast, pull, clouds, reach, shock
// ring) × size step × shrink (`area(u)`), grab mass limits × power², squeeze / drink / blast damage × power. The weapon runs
// whenever no trick is mid-move: `act` returns true only on the tick a trick starts, `busy` while it is mid-move (running in,
// planted, channelling, holding four, latched on, winding up a spell, backing off, running from the smoke).
// State lives in the ability's own bag (u.b.ab[slot]); u.cooldown / u.attack / u.subState are never touched.
//
// Bag fields the art reads (fx-mine-act2.js OVER[id], ART-BODY poses from u.b.act):
//   bomb     armed (1 = fuse lit, running in), beepT (world.time of the last beep: the light blinks), spent (1 = blown)
//            pose ACT.CHARGE while running in.
//   magnet   phase (1 charging, 2 pulling), pullR (px, while pulling: the field rings), t0 (world.time the phase began)
//            pose ACT.CHANNEL (charge + pull).
//   ink      (none: the cloud is the octopus's own effect projectile 'ink', p.r px) · pose ACT.PUFF 0.5 s.
//   stink    (none: the cloud is the stink bug's own effect projectile 'gas', p.r px) · pose ACT.PUFF 0.6 s.
//   mind     phase (1 channelling), mark (unit id being taken), thrall (unit id held, -1 none), t0 (channel start)
//            pose ACT.CHANNEL; the swirl = effect projectile 'mindmine' on the mark / thrall (the mind alien's 'mind' art:
//            p.k 0..1 channel progress, 1 = held; p.r = its radius; p.host / p.vid = its id; p.z).
//   grabfour holding (1), v0..v3 (held unit ids, -1 none: a tentacle to each) · pose ACT.GRAB.
//   drink    latched (1), host (unit id), drunk (hp drunk this life) · pose ACT.DRINK. The unit grows by u.radius.
//   shock    shockT (world.time of the last shock), shockR (px of that shock) · pose ACT.CHANNEL 0.45 s; arcs = 'bolt'
//            events (fx draws them, as for the eel).
//   curse    phase (1 winding up), victim (unit id), t (world.time it goes off) · pose ACT.CAST.
//   smoke    smokeAt (world.time of the bomb; it runs for T.smoke.run s) · pose ACT.SMOKE while it runs.
// u.b.victim (the shared pose field) = the first unit held by grabfour / the drink host, -1 when they let go.
import { registerAbility } from '../registry.js';
import {
  ACT, act, power, used, STATE, LEAP, hypot, ENEMY, F, INT, damage, stun, attackHeld, targetOf, setState, canAuto, clearLine,
  advanceTo, spawnProjectile, removeProjectile, registerProjectileKind, spawnEffect, rideOn, unitOf, explode, registerSystem,
  glue, tossTo,
} from '../lib.js';
import { ALL_MASK, HITTABLE, isHostile } from '../../factions.js';
import { onWorldClear, onReside } from '../../world.js';
import { infect } from '../../combat/index.js';
import { submerged } from '../../combat/env.js';
import { pondAt } from '../../terrain/water.js';
import { touchable } from '../../units/robots/_lib.js';
import { isMetal } from '../../units/robots/magnetbot.js';                  // STEP6 metal rule (robots, UFO, mech + armour types)
import { controllable as alienCanTake, setHeldElsewhere } from '../../units/space/mindalien.js';
import { holdable } from '../../units/ocean/_lib.js';
import { living, high as upHigh } from '../../units/bugs/_lib.js';
import { transformUnit } from '../../units/mythical/turn.js';
import { groupLeave } from '../../units/mythical/_lib.js';
import '../../units/ocean/octopus.js';    // registers the 'ink' cloud kind (already loaded by units/index.js: no-op import)
import '../../units/bugs/stinkbug.js';    // registers the 'gas' cloud kind (same)
import '../../units/mythical/mage.js';    // registers the frog (same)

// ---------------------------------------------------------------- numbers (the user tunes them)
const T = {
  margin: 46,             // px: max unit radius, added to radius queries (the core's margin)
  bomb: {                 // from units/robots/bombbot.js T
    scanR: 320,           // px: looks this far for a crowd
    scanEvery: 15,        // ticks between crowd searches
    crowdMin: 3,          // OURS: lights the fuse for a crowd of 3+ enemies inside its blast (the weapon fights smaller ones) ...
    lowHp: 0.35,          // ... or once it is down to 35 % hp (a made unit carries a weapon: it isn't a bomb from the start)
    touch: 2,             // px past both radii (× size): touching an enemy with the fuse lit = boom
    stillBlows: 0.6,      // killed (fuse lit or not): chance it blows anyway
    beepFar: 250,         // px: beeping starts this close ...
    beepSlow: 0.6,        // ... one beep per 0.6 s there ...
    beepFast: 0.1,        // ... one per 0.1 s at the touch
    blast: {              // × size: radius, damage, push, tossSpeed
      radius: 55, damage: 110, minFalloff: 0.25, push: 240, stun: 0.5, tossUp: 420, tossSpeed: 220, tossFrom: 0.3, hatChance: 0.7, noiseRadius: 420,
    },
  },
  magnet: {               // from units/robots/magnetbot.js T
    metalR: 260,          // px (× area): a metal enemy this close starts it ...
    anyR: 120,            // px (× area): ... or any enemy this close; enemies this close are pulled too, metal or not
    scanEvery: 6,         // ticks between trigger checks
    charge: 1,            // s charging (planted)
    pull: 1.5,            // s pulling
    pullR: 260,           // px (× area): metal pull reach
    pullMass: 20,         // × power²: heavier units aren't moved
    pullSpeed: 190,       // px/s: how fast a light (mass ≤ 1) unit is dragged in ...
    pullHeavy: 0.35,      // ... ÷ (1 + 0.35 × (mass − 1))
    pullAccel: 1600,      // px/s² ÷ mass: how hard the field grabs
    friendPull: 0.33,     // its own side's metal is pulled at a third
    stopAt: 6,            // px past both bodies: dragged units stop here
    every: 10,            // OURS: s after a pop before it charges again (a made unit survives its own pop: see below)
    half: 0.5,            // killed while charging / pulling: it pops at half power where it fell
    blast: {              // × size: radius, damage, push, tossSpeed
      radius: 60, damage: 90, minFalloff: 0.25, push: 260, stun: 0.5, tossUp: 360, tossSpeed: 200, tossFrom: 0.3, hatChance: 0.6, noiseRadius: 380,
    },
  },
  ink: {                  // from units/ocean/octopus.js T
    at: 0.7,              // first ink when its hp drops below 70 % ...
    every: 10,            // ... then on a hit at most every 10 s
    r: 70,                // px (× area): cloud radius
    life: 4,              // s the cloud lasts (it blinds enemies inside: the game's blind rule)
    pose: 0.5,            // s of the PUFF pose
    back: 1.5,            // s it backs away after inking (not while it holds someone)
  },
  stink: {                // from units/bugs/stinkbug.js T
    every: 6,             // s between clouds ...
    near: 90,             // ... with an enemy this close (px × area, centre to centre)
    halfAt: 0.5,          // a hit that first takes it below half hp: a cloud at once
    r: 80,                // px (× area): cloud radius (2 hp/s + fright to the living inside: stinkbug.js)
    life: 5,              // s
    drift: 6,             // px/s: the cloud wanders off this slowly
    pose: 0.6,            // s of the PUFF pose
  },
  mind: {                 // from units/space/mindalien.js T
    range: 180,           // px: channels on enemies this close, in sight
    keep: 1.25,           // × range: the channel breaks past this (or out of sight)
    channel: 2,           // s to take a mind
    breakDmg: 20,         // damage taken while channelling that breaks it ...
    breakFrac: 0.286,     // ... OURS: or this share of its max hp if more (20 of the alien's 70: a 3000 hp giant isn't broken by 2 bullets)
    retry: 4,             // s after its thrall dies before it looks for another
    failRetry: 1,         // s after a broken channel
    scanEvery: 10,        // ticks between searches
    first: 0.2,           // OURS: first look after 0.2 + 0.3 × rng s (the alien: 0.5 + rng; a made unit runs in at once and
    firstRnd: 0.3,        //   should start its channel from range, not in the middle of the melee)
    nerve: 0.6,           // a thrall's morale never drops below this
    pauseStun: 0.25,      // a stun longer than this pauses the channel (the alien's would break: see busy)
  },
  grab: {                 // from units/ocean/octopus.js T (grab four)
    gap: 45,              // px past its body (× area) to the victim's edge: enemies this close are grabbed ...
    max: 4,               // ... up to 4 at once
    mass: 8,              // × power²: heavier ones (and bosses, untossable ones) slip its grip
    hold: 3,              // s held at most ...
    squeeze: 6,           // ... squeezed 6 (× power) each ...
    every: 0.5,           // ... every 0.5 s
    holdGap: 10,          // px past both bodies (× area): where a held unit hangs
    throwDist: 60,        // px (× power): then thrown this far, away from it
    throwUp: 150,         // upward speed of the throw (px/s)
    regrab: 1.5,          // s after a throw before it grabs again
  },
  drink: {                // from units/bugs/mosquito.js T
    rate: 5,              // hp/s (× power) drunk from its host; heals itself as much
    max: 4,               // s per latch
    sip: 0.25,            // s between sips
    rest: 1,              // s off after a drink before it latches again
    grow: 0.5,            // OURS: +50 % radius ...
    growHp: 100,          // ... per 100 hp (× power) drunk (the mosquito's +0.6 raw r per 10 hp, made relative) ...
    cap: 1.5,             // ... up to ×1.5 of its own radius. A made unit NEVER pops (STEP8)
    reach: 20,            // px past both bodies (× area): close enough to latch on (a short hop: melee weapons and blows keep it ~15 px off)
    letGo: 0.25,          // a stun this long knocks it off
    gap: 0.5,             // px past both bodies where it clings to its host's side
    tossZ: 6,             // px: knocked up higher than this (not a flyer) = it lets go
  },
  shock: {                // from units/ocean/eel.js T
    r: 160,               // px (× area): enemies in the same water this close ...
    dmg: 25,              // ... take 25 ...
    stun: 0.6,            // ... and are stunned 0.6 s
    machineMul: 2,        // machines take ×2
    every: 3,             // s between shocks
    look: 0.25,           // s: with nobody to shock, looks again after this
    pose: 0.45,           // s of the glow
    maxBolts: 10,         // arcs drawn per shock (the rest are hit all the same)
    flyZ: 6,              // px: higher than this it isn't in the water
  },
  curse: {                // from units/mythical/mage.js (OG game.js:15421-15765)
    range: 240,           // px: candidates this close (OG 15684)
    min: 0.35,            // strength × maxHp / 100 must beat this (OG 15684-15698)
    windup: 0.6,          // s (OG 15462)
    cd: 9,                // s × U(0.8, 1.2) after a cast (OG 15568)
    first: 0.3,           // OURS: first cast after 0.3 + 0.7 × rng s (OG 2 + 4.5 × rng: a backline mage; a made unit with a sword
    firstRnd: 0.7,        //   was dead before its first curse in most short fights)
    scanEvery: 6,         // OURS: ticks between candidate searches while ready
    frogR: 7.5,           // OG raw frog radius (OG 15790) ...
    refR: 8.63,           // ... over the OG reference radius (OG 15764): the frog's size
  },
  smoke: {                // from units/army/ninja.js SMOKE (OG game.js:18366-18402)
    hpFrac: 0.4,          // once per life when hp ≤ 40 % ...
    near: 140,            // ... and the target is under 140 px
    r: 48,                // px (× area, the steam cloud caps at 70): cloud radius ...
    life: 3.5,            // ... for 3.5 s (hides units: perception + conceal)
    run: 1.6,             // s it runs away
    puffs: 6,             // smoke puffs (looks)
  },
};

// ---------------------------------------------------------------- shared helpers
const area = (u) => power(u) * (u.shrink > 0 ? u.shrink : 1);   // areas follow the body (a shrunk unit's cloud is smaller)
const slotOf = (u, bag) => { const A = u.b.ab; return A ? A.indexOf(bag) : -1; };
/** Clear the pose if it is still ours. */
function unpose(w, u, code) { if (u.b.act === code) act(w, u, 0); }
function inSight(w, u, o) { return w.walls.count === 0 || w.walls.lineOfSight(u.x, u.y, o.x, o.y); }
// blast defs per size step (made once, frozen; explode() takes a def object)
const BLASTS = new Map();
function blastOf(name, base, s, mul = 1) {
  const key = name + s + '|' + mul;
  let d = BLASTS.get(key);
  if (!d) {
    d = Object.freeze({ ...base, radius: base.radius * s, damage: base.damage * s * mul, push: base.push * s * mul, tossSpeed: base.tossSpeed * s * mul, tossUp: base.tossUp * mul });
    BLASTS.set(key, d);
  }
  return d;
}
/** u blows `blast` from where it stands without hurting itself (its hp reads 0 for that one call: robots _lib blowUp). */
function blastFrom(w, u, blast) { const hp = u.hp; u.hp = 0; explode(w, u.x, u.y, blast, u); u.hp = hp; }

// per-world records (Clear resets them): wrecks (blown bombs), thralls (mind), held victims (grab four)
const WS = new WeakMap();
function ws(w) { let s = WS.get(w); if (!s) { s = { wu: [], wt: [], thralls: [], held: [], free: [] }; WS.set(w, s); } return s; }
onWorldClear((w) => { const s = WS.get(w); if (!s) return; s.wu.length = 0; s.wt.length = 0; for (const e of s.thralls) s.free.push(e); for (const e of s.held) s.free.push(e); s.thralls.length = 0; s.held.length = 0; });
function rec(s) { return s.free.pop() || { id: -1, by: -1, slot: -1, fac: 0, gen: 0, team: -1, group: -1 }; }
// Team switch (world.reside, 11-17): every thrall has just been put back on its own side / its half's team, so the made
// units let go of them (mindalien.js does the same).
onReside((w) => {
  const s = WS.get(w); if (!s) return;
  for (const e of s.thralls) { const a = w.byId.get(e.by), bag = a && a.b && a.b.ab ? a.b.ab[e.slot] : null; if (bag && bag.thrall === e.id) bag.thrall = -1; s.free.push(e); }
  s.thralls.length = 0;
});
function dropRec(s, L, k) { s.free.push(L[k]); L[k] = L[L.length - 1]; L.pop(); }

// ================================================================ BOMB (bomb bot: runs at the biggest crowd, blows on touch)
const CQ = new Array(48).fill(null), CN = new Array(64).fill(null);
let _crowdN = 0;
// from units/robots/_lib.js crowdTarget: the enemy with the most enemies within `near` of it (here: inside the blast), nearer
// ones winning ties; ground units only. Also leaves that count in _crowdN.
function crowdOf(w, u, R, near) {
  const mask = ENEMY[u.faction], n = w.queryMask(u.x, u.y, R, mask, CQ, CQ.length);
  let best = null, bs = -Infinity, bn = 0, scored = 0;
  for (let k = 0; k < n; k++) {
    const o = CQ[k]; CQ[k] = null;
    if (scored >= 16 || o.dead || !(o.hp > 0) || !touchable(o) || submerged(w, o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y);
    if (d > R || (o.unseen > 0 && d > o.unseen)) continue;
    scored++;
    const c = w.queryMask(o.x, o.y, near, mask, CN, CN.length);
    for (let j = 0; j < c; j++) CN[j] = null;
    const sc = c - (1.5 * d) / R;
    if (sc > bs) { bs = sc; best = o; bn = c; }
  }
  _crowdN = bn;
  return best;
}
function bombTouching(w, u) {
  const tg = T.bomb.touch * power(u), o = w.findNearest(u.x, u.y, u.radius + T.margin + tg, ENEMY[u.faction], u, 1);
  return !!o && o.hp > 0 && touchable(o) && hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + tg;
}
function bombBeep(w, u, bag, d) {
  const B = T.bomb;
  if (d > B.beepFar || w.time < bag.beepAt) return;
  const k = Math.max(0, Math.min(1, d / B.beepFar));
  bag.beepT = w.time; bag.beepAt = w.time + B.beepFast + (B.beepSlow - B.beepFast) * k;
  w.emit('beep', { x: u.x, y: u.y, v: 1 - k, type: u.type, id: u.id, as: 'bombbot' });
}
function bombBoom(w, u, bag) {
  unpose(w, u, ACT.CHARGE);
  blastFrom(w, u, blastOf('bomb', T.bomb.blast, power(u)));
  bag.spent = 1; bag.spentTick = w.tick; bag.armed = 0;
  u.target = -1; u.burning = 0;
  const s = ws(w); s.wu.push(u); s.wt.push(w.tick);   // the wreck goes next tick (wreckRun), nothing hurts it till then
  used(w, u, 'bomb');
}
// after brains: a blown made unit dies the tick after its blast, credited to nobody (robots _lib wreckRun)
function wreckRun(w) {
  const s = WS.get(w); if (!s || s.wu.length === 0) return;
  for (let i = s.wu.length - 1; i >= 0; i--) {
    const u = s.wu[i];
    if (!u.dead && w.tick <= s.wt[i]) continue;
    if (!u.dead) { u.harmBy = -1; u.harmByType = null; u.harmByFaction = -1; u.burning = 0; u.hp = 0; }
    const j = s.wu.length - 1; s.wu[i] = s.wu[j]; s.wt[i] = s.wt[j]; s.wu.pop(); s.wt.pop();
  }
}
registerSystem('mine-act2:wreck', wreckRun, 'brain');

registerAbility({
  id: 'bomb',
  init(w, u, bag) { bag.armed = 0; bag.crowd = -1; bag.beepAt = 0; bag.beepT = -1e9; bag.spent = 0; bag.spentTick = 0; },
  // fuse lit: sprint at the crowd (or the player's pick), blow on touching any enemy
  busy(w, u, bag) {
    if (bag.spent === 1) {
      if (w.tick > bag.spentTick + 2 && u.hp > 0) bag.spent = 0;   // it came back (a death trick: rebirth): a fresh bomb
      else { u.goalX = 0; u.goalY = 0; return true; }
    }
    if (bag.armed !== 1) return false;
    if (u.stun > 0) { u.face = u.heading; return true; }
    const may = canAuto(w, u);
    if (may && bombTouching(w, u)) { bombBoom(w, u, bag); return true; }
    const t = targetOf(w, u);
    let c = bag.crowd >= 0 ? w.unitById(bag.crowd) : null;
    if (u.possessed === 1) c = may && t && touchable(t) ? t : null;   // the player picks who
    else if ((w.tick + u.index) % T.bomb.scanEvery === 0 || !c || !(c.hp > 0) || c.dead) c = crowdOf(w, u, T.bomb.scanR, T.bomb.blast.radius * area(u)) || t;
    bag.crowd = c ? c.id : -1;
    if (!c) return false;   // nobody about: the core idles it (still lit)
    const dx = c.x - u.x, dy = c.y - u.y, d = hypot(dx, dy) || 0.001;
    act(w, u, ACT.CHARGE);
    advanceTo(w, u, c, dx, dy, clearLine(w, u), u.def.runSpeed);
    setState(u, STATE.CHARGE);
    u.face = Math.atan2(dy, dx);
    bombBeep(w, u, bag, d - c.radius - u.radius);
    return true;
  },
  // light the fuse: a crowd of 3+ inside its blast within sight, or low on hp
  act(w, u, t, dx, dy, d, bag) {
    if (bag.armed === 1 || bag.spent === 1 || (w.tick + u.index) % T.bomb.scanEvery !== 0) return false;
    const c = crowdOf(w, u, T.bomb.scanR, T.bomb.blast.radius * area(u));
    if (!c || (_crowdN < T.bomb.crowdMin && u.hp > T.bomb.lowHp * u.maxHp)) return false;
    bag.armed = 1; bag.crowd = c.id; bag.beepAt = 0;
    act(w, u, ACT.CHARGE);
    w.emit('beep', { x: u.x, y: u.y, v: 0.3, type: u.type, id: u.id, as: 'bombbot' });
    return true;
  },
  holdsNerve(w, u, bag) { return bag.armed === 1 || bag.spent === 1; },
  damageMul(w, u, amount, att, kind, bag) { return bag.spent === 1 ? 0 : 1; },   // a blown unit is a wreck about to go
  // killed: 60 % it blows where it fell (lit or not)
  onDeath(w, u, cause, killer, bag) {
    if (bag.spent === 1 || w.rng() >= T.bomb.stillBlows) return;
    bag.spent = 1;
    explode(w, u.x, u.y, blastOf('bomb', T.bomb.blast, power(u)), u);
    used(w, u, 'bomb');
  },
});

// ================================================================ MAGNET (magnet bot: plant, charge, pull, pop)
// A made unit SURVIVES its pop (the blast skips it) and charges again after T.magnet.every s: Magnet is a trick, Self-
// destruct is the bomb. Killed while charging / pulling = it pops at half power where it fell (as the bot).
let _mu = null, _mHit = false, _mMetalR = 0;
function metalOne(o) {
  if (_mHit || o === _mu || !(o.hp > 0) || o.def.prop) return;
  if (isMetal(o) && hypot(o.x - _mu.x, o.y - _mu.y) <= _mMetalR) { _mHit = true; return true; }
}
function magTriggered(w, u, t) {
  const a = area(u), anyR = T.magnet.anyR * a, metalR = T.magnet.metalR * a;
  if (t && hypot(t.x - u.x, t.y - u.y) <= anyR) return true;
  if (u.possessed === 1) return !!t && isMetal(t) && hypot(t.x - u.x, t.y - u.y) <= metalR;   // the player's aim only
  if (w.findNearest(u.x, u.y, anyR, ENEMY[u.faction], u, 1)) return true;
  _mu = u; _mHit = false; _mMetalR = metalR;
  w.query(u.x, u.y, metalR, metalOne, ENEMY[u.faction]);
  _mu = null;
  return _mHit;
}
let _pu = null, _pR = 0, _pAny = 0, _pMass = 0;
// from magnetbot.js pullOne: metal within pullR (friends at a third), + any enemy within anyR
function pullOne(o) {
  const u = _pu, M = T.magnet;
  if (o === u || !(o.hp > 0) || o.def.prop || o.mass > _pMass || o.climb > 0 || o.inside >= 0) return;
  const dx = u.x - o.x, dy = u.y - o.y, d = hypot(dx, dy) || 0.001, foe = isHostile(u, o);
  if (d <= u.radius + o.radius + M.stopAt * power(u)) return;
  if (isMetal(o)) { if (d > _pR) return; }
  else if (!foe || d > _pAny) return;
  const ex = dx / d, ey = dy / d, m = Math.max(1, o.mass), k = foe ? 1 : M.friendPull;
  const want = (k * M.pullSpeed) / (1 + M.pullHeavy * (m - 1)), along = o.vx * ex + o.vy * ey;
  if (along >= want) return;
  const dv = Math.min(want - along, ((k * M.pullAccel) / m) * (1 / 60));
  o.vx += ex * dv; o.vy += ey * dv;
}
function magPop(w, u, bag) {
  bag.phase = 0; bag.pullR = 0; bag.next = w.time + T.magnet.every;
  unpose(w, u, ACT.CHANNEL);
  blastFrom(w, u, blastOf('magnet', T.magnet.blast, power(u)));
}
registerAbility({
  id: 'magnet',
  init(w, u, bag) { bag.phase = 0; bag.t0 = 0; bag.pullR = 0; bag.next = 0; },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.phase !== 0 || w.time < bag.next || (w.tick + u.index) % T.magnet.scanEvery !== 0 || !magTriggered(w, u, t)) return false;
    bag.phase = 1; bag.t0 = w.time; bag.pullR = 0;
    act(w, u, ACT.CHANNEL); setState(u, STATE.ENGAGE);
    u.goalX = 0; u.goalY = 0;
    w.emit('magnet', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 1, as: 'magnetbot' });
    return true;
  },
  // the timer runs every tick (also stunned / tossed): charge 1 s, pull 1.5 s, pop
  tick(w, u, bag) {
    if (bag.phase === 0 || !(u.hp > 0)) return;
    const age = w.time - bag.t0;
    if (bag.phase === 1) {
      if (age < T.magnet.charge) return;
      bag.phase = 2; bag.t0 = w.time; bag.pullR = T.magnet.pullR * area(u);
      w.emit('magnet', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 2, as: 'magnetbot' });
      used(w, u, 'magnet');
      return;
    }
    const a = area(u), p = power(u);
    _pu = u; _pR = T.magnet.pullR * a; _pAny = T.magnet.anyR * a; _pMass = T.magnet.pullMass * p * p;
    w.query(u.x, u.y, Math.max(_pR, _pAny) + T.margin, pullOne, ALL_MASK);   // friends too (metal ones)
    _pu = null;
    if (age >= T.magnet.pull) magPop(w, u, bag);
  },
  busy(w, u, bag) {
    if (bag.phase === 0) return false;
    u.goalX = 0; u.goalY = 0;
    setState(u, STATE.ENGAGE);
    const t = u.stun > 0 ? null : targetOf(w, u);
    u.face = t ? Math.atan2(t.y - u.y, t.x - u.x) : u.heading;
    return true;
  },
  holdsNerve(w, u, bag) { return bag.phase !== 0; },
  onDeath(w, u, cause, killer, bag) {
    if (bag.phase === 0) return;
    bag.phase = 0; bag.pullR = 0;
    explode(w, u.x, u.y, blastOf('magnet', T.magnet.blast, power(u), T.magnet.half), u);
  },
});

// ================================================================ INK (octopus: a cloud when hurt, then backs off)
function inkOut(w, u, bag) {
  const I = T.ink, p = spawnProjectile(w, 'ink', u.x, u.y, 0, 0, I.life, 0, u.faction, u);
  if (p) { p.r = I.r * area(u); p.age = 0; }
  bag.inked = 1; bag.inkNext = w.time + I.every;
  w.emit('splash', { x: u.x, y: u.y, v: 1.5, type: u.type, ink: 1, as: 'octopus' });
  used(w, u, 'ink');
  act(w, u, ACT.PUFF); bag.poseT = w.time; bag.posed = 1;
  if (u.b.victim < 0) bag.back = w.time + I.back;   // holding someone (grab four, a drink): stays put
}
registerAbility({
  id: 'ink',
  init(w, u, bag) { bag.inked = 0; bag.inkNext = 0; bag.back = 0; bag.poseT = -1e9; bag.posed = 0; },
  onHit(w, u, amount, src, kind, bag) {
    if (!(u.hp > 0) || amount <= 0) return;
    if (bag.inked === 0 ? u.hp < T.ink.at * u.maxHp : w.time >= bag.inkNext) inkOut(w, u, bag);
  },
  // backing away from the fight after inking
  busy(w, u, bag) {
    const now = w.time;
    if (bag.posed === 1 && now - bag.poseT > T.ink.pose) { bag.posed = 0; unpose(w, u, ACT.PUFF); }   // only once: other tricks share PUFF
    if (now >= bag.back || u.possessed === 1) return false;
    if (u.stun > 0) { u.face = u.heading; return true; }
    setState(u, STATE.ALERT);
    const t = targetOf(w, u), away = t || w.findNearest(u.x, u.y, 200, ENEMY[u.faction], null, 0);
    if (away) {
      const dx = u.x - away.x, dy = u.y - away.y, d = hypot(dx, dy) || 0.001, sp = u.def.runSpeed;
      u.goalX = (dx / d) * sp; u.goalY = (dy / d) * sp; u.face = Math.atan2(-dy, -dx);
    }
    return true;
  },
});

// ================================================================ STINK (stink bug: a cloud every 6 s with an enemy close)
const NQ = new Array(16).fill(null);
function stinkNear(w, u, r) {
  const n = w.queryMask(u.x, u.y, r, ENEMY[u.faction], NQ, NQ.length);
  let any = false;
  for (let k = 0; k < n; k++) { const o = NQ[k]; NQ[k] = null; if (!any && !o.dead && o.hp > 0 && o.def.category !== 'bugs' && !o.def.prop) any = true; }
  return any;
}
function stinkPuff(w, u, bag) {
  const S = T.stink, a = w.rng() * Math.PI * 2;
  const p = spawnProjectile(w, 'gas', u.x, u.y, Math.cos(a) * S.drift, Math.sin(a) * S.drift, S.life, 0, F.Props, u);   // faction Props: nobody's enemy (domes ignore it)
  if (p) { p.r = S.r * area(u); p.age = 0; p.fac = u.faction; }
  bag.next = w.time + S.every;
  act(w, u, ACT.PUFF); bag.poseT = w.time; bag.posed = 1;
  w.emit('cough', { x: u.x, y: u.y, type: u.type, as: 'stinkbug' });
  used(w, u, 'stink');
}
registerAbility({
  id: 'stink',
  init(w, u, bag) { bag.next = w.time + 1 + 2 * w.rng(); bag.n = 0; bag.flag = 0; bag.poseT = -1e9; bag.posed = 0; },
  busy(w, u, bag) {
    if (bag.posed === 1 && w.time - bag.poseT > T.stink.pose) { bag.posed = 0; unpose(w, u, ACT.PUFF); }
    if (bag.flag === 1) { bag.flag = 0; if (canAuto(w, u)) stinkPuff(w, u, bag); }   // hit below half: a cloud at once
    return false;
  },
  act(w, u, t, dx, dy, d, bag) {
    if (w.time >= bag.next && (w.tick + u.index) % 6 === 0 && stinkNear(w, u, T.stink.near * area(u))) stinkPuff(w, u, bag);
    return false;   // the weapon still runs this tick
  },
  onHit(w, u, amount, src, kind, bag) { if (bag.n === 0 && u.hp > 0 && u.hp < T.stink.halfAt * u.maxHp) { bag.n = 1; bag.flag = 1; } },
});

// ================================================================ MIND (mind alien: channel 2 s, the target joins our side)
const MQ = new Array(48).fill(null);
function mindRecOf(w, id) { const s = WS.get(w); if (!s) return null; for (const e of s.thralls) if (e.id === id) return e; return null; }
/** May a made unit take v's mind? The mind alien's rule (no machines, bosses, Mindless, risen, slimes, the driven unit, its
 *  thralls) + not already some made unit's thrall. */
function canTake(w, v) { return alienCanTake(w, v) && mindRecOf(w, v.id) === null; }
// attack 4 L2: a mind alien may not take a made unit's thrall. It could: the made unit dropped its record without giving
// the unit back, the alien then gave it back to the side it took it from (the made unit's), so it fought for the made
// unit's side for good.
setHeldElsewhere((w, v) => mindRecOf(w, v.id) !== null);
function newGroup(w, v, faction) { const gs = w.groups, g = gs.create(v.type, faction); if (g >= 0) { gs.join(g); gs.release(g); } return g; }
// one-off at a side change: units that now share v's side drop it as a target, and v drops its own (mindalien.js retarget)
function retarget(w, v) {
  v.target = -1; v.state = STATE.IDLE; v.stateTime = 0;
  const us = w.units;
  for (let i = 0; i < us.length; i++) { const o = us[i]; if (!o.dead && o.target === v.id && !isHostile(o, v)) o.target = -1; }
}
function mindStop(w, u, bag, retry) { bag.phase = 0; bag.mark = -1; bag.next = w.time + retry; unpose(w, u, ACT.CHANNEL); }
function mindSeize(w, u, bag, v) {
  const s = ws(w), e = rec(s);
  e.id = v.id; e.by = u.id; e.slot = bag.slot; e.fac = v.faction; e.gen = w.sides.gen[v.faction]; e.team = v.team; e.group = v.group;
  s.thralls.push(e);
  v.faction = u.faction; v.team = u.team; v.group = newGroup(w, v, u.faction);
  v.homeX = v.x; v.homeY = v.y; v.morale = Math.max(v.morale, 1);
  retarget(w, v);
  bag.thrall = v.id; bag.phase = 0; bag.mark = -1;
  unpose(w, u, ACT.CHANNEL);
  w.emit('curse', { x: v.x, y: v.y, v: 1, type: u.type, mind: 1, id: v.id, as: 'mindalien' });
  used(w, u, 'mind');
}
function mindGiveBack(w, e) {
  const v = w.unitById(e.id);
  if (v && v.hp > 0) {
    const gs = w.groups, g = e.group;
    if (w.sides.gen[e.fac] !== e.gen) e.fac = w.factionOf(v.def, e.team);   // its side's slot changed hands meanwhile (side split 11-17)
    v.faction = e.fac; v.team = e.team;
    v.group = g >= 0 && gs.alive[g] === 1 && gs.faction[g] === e.fac && gs.type[g] === v.type ? g : newGroup(w, v, e.fac);
    retarget(w, v);
    w.emit('curse', { x: v.x, y: v.y, v: 0.6, type: v.type, mind: 2, id: v.id, as: 'mindalien' });
  }
  const a = w.byId.get(e.by), bag = a && a.b && a.b.ab ? a.b.ab[e.slot] : null;
  if (bag && bag.thrall === e.id) bag.thrall = -1;
}
// after morale, before brains: a thrall whose made unit is gone goes back; a held one never breaks (mindalien.js mindSys)
function mindSys(w) {
  const s = WS.get(w); if (!s || s.thralls.length === 0) return;
  const L = s.thralls;
  for (let k = L.length - 1; k >= 0; k--) {
    const e = L[k], v = w.unitById(e.id);
    if (!v || !(v.hp > 0)) { const a = w.byId.get(e.by), bag = a && a.b && a.b.ab ? a.b.ab[e.slot] : null; if (bag && bag.thrall === e.id) bag.thrall = -1; dropRec(s, L, k); continue; }
    const a = w.unitById(e.by);
    if (!a || !(a.hp > 0)) { mindGiveBack(w, e); dropRec(s, L, k); continue; }
    if (v.faction !== a.faction) { mindGiveBack(w, e); dropRec(s, L, k); continue; }   // our unit changed sides (a mind alien or another made Mind took it): the thrall goes home (attack 4 L2: it was dropped where it stood, on our old side for good)
    if (v.state === STATE.FLEE) { v.state = STATE.IDLE; v.stateTime = 0; }
    if (v.morale < T.mind.nerve) v.morale = T.mind.nerve;
  }
}
registerSystem('mine-act2:mind', mindSys, 'morale');
function mindFreeAll(w, u) {
  const s = WS.get(w); if (!s) return;
  for (let k = s.thralls.length - 1; k >= 0; k--) if (s.thralls[k].by === u.id) { mindGiveBack(w, s.thralls[k]); dropRec(s, s.thralls, k); }
}
// the strongest (def.strength) takeable enemy within range, in sight; ties: the nearest (mindalien.js findMark)
function findMark(w, u) {
  const R = T.mind.range, n = w.queryMask(u.x, u.y, R, ENEMY[u.faction], MQ, MQ.length);
  let best = null, bs = -1, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = MQ[k]; MQ[k] = null;
    if (!canTake(w, o)) continue;
    const d = hypot(o.x - u.x, o.y - u.y), st = o.def.strength || 0;
    if (d > R || (o.unseen > 0 && d > o.unseen)) continue;
    if ((st > bs || (st === bs && d < bd)) && inSight(w, u, o)) { bs = st; bd = d; best = o; }
  }
  return best;
}
// the swirl on the mark / thrall: the mind alien's 'mind' art (p.k = channel progress, 1 = held)
function stepMindMine(w, p, i) {
  const a = p.owner >= 0 ? w.unitById(p.owner) : null, v = p.host >= 0 ? w.unitById(p.host) : null;
  const bag = a && a.hp > 0 && a.b && a.b.ab ? a.b.ab[p.slot] : null;
  const ok = !!bag && !!v && v.hp > 0 && bag.mark !== undefined;
  const held = ok && bag.thrall === v.id, chan = ok && bag.phase === 1 && bag.mark === v.id;
  if (!held && !chan) { removeProjectile(w, i); return; }
  rideOn(p, v, 0); p.r = v.radius;
  p.k = held ? 1 : Math.min(1, (w.time - bag.t0) / T.mind.channel);
}
registerProjectileKind('mindmine', stepMindMine);
registerAbility({
  id: 'mind',
  init(w, u, bag) { bag.slot = slotOf(u, bag); bag.phase = 0; bag.mark = -1; bag.thrall = -1; bag.t0 = 0; bag.hurt = 0; bag.next = w.time + T.mind.first + T.mind.firstRnd * w.rng(); },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.phase === 1) return false;
    const now = w.time;
    if (bag.thrall >= 0) {
      const th = unitOf(w, bag.thrall), e = th ? mindRecOf(w, th.id) : null;
      if (!th || !(th.hp > 0) || !e || e.by !== u.id) { bag.thrall = -1; bag.next = now + T.mind.retry; }
    }
    if (bag.thrall >= 0 || now < bag.next) return false;
    let m = null;
    if (canTake(w, t) && d <= T.mind.range && clearLine(w, u)) m = t;
    else if (u.possessed !== 1 && (w.tick + u.index) % T.mind.scanEvery === 0) m = findMark(w, u);
    if (!m) return false;
    bag.phase = 1; bag.mark = m.id; bag.t0 = now; bag.hurt = 0;
    act(w, u, ACT.CHANNEL); setState(u, STATE.ENGAGE);
    u.goalX = 0; u.goalY = 0; u.face = Math.atan2(m.y - u.y, m.x - u.x);
    const p = spawnEffect(w, 'mindmine', u, m, 99);
    if (p) p.slot = bag.slot;
    w.emit('spell', { x: u.x, y: u.y, v: 0.5, type: u.type, mind: 1, as: 'mindalien' });
    return true;
  },
  // channelling: stands, faces the mark; breaks on 20+ damage (or its share of hp), range, sight. OURS: a stun over 0.25 s
  // (the alien's break rule) only PAUSES it here: a boar's charge would otherwise stop a 3000 hp giant every time
  busy(w, u, bag) {
    if (bag.phase !== 1) return false;
    const v = unitOf(w, bag.mark), brk = Math.max(T.mind.breakDmg, T.mind.breakFrac * u.maxHp);
    u.goalX = 0; u.goalY = 0;
    if (u.stun > T.mind.pauseStun) bag.t0 += 1 / 60;   // knocked about: the channel waits
    if (!v || !canTake(w, v) || !isHostile(u, v) || bag.hurt >= brk ||
        hypot(v.x - u.x, v.y - u.y) > T.mind.range * T.mind.keep || !inSight(w, u, v)) { mindStop(w, u, bag, T.mind.failRetry); u.face = u.heading; return true; }
    setState(u, STATE.ENGAGE);
    u.face = Math.atan2(v.y - u.y, v.x - u.x);
    if (w.time - bag.t0 >= T.mind.channel) mindSeize(w, u, bag, v);
    return true;
  },
  onHit(w, u, amount, src, kind, bag) { if (bag.phase === 1) bag.hurt += amount; },
  onDeath(w, u, cause, killer, bag) { if (bag.phase === 1) mindStop(w, u, bag, 0); mindFreeAll(w, u); },
  holdsNerve(w, u, bag) { return bag.phase === 1; },
  // In the full kitchen-sink fight a 200 hp person (sword) takes 60+ damage within any 2 s and dies in ~3 s: every channel
  // broke. One legionary stays close; the other six start at the far edge, out of sight (they walk in after ~6 s)
  test: { setup(g, w, u, foes) { for (let k = 0; k < foes.length; k++) { if (k === 3) continue; const f = foes[k]; f.x = f.px = 985; f.y = f.py = 40 + 100 * k; } } },
});

// ================================================================ GRAB FOUR (octopus: up to 4 held, squeezed, thrown)
const GQ = new Array(48).fill(null);
const getV = (b, k) => (k === 0 ? b.v0 : k === 1 ? b.v1 : k === 2 ? b.v2 : b.v3);
function setV(b, k, id) { if (k === 0) b.v0 = id; else if (k === 1) b.v1 = id; else if (k === 2) b.v2 = id; else b.v3 = id; }
function grabHeld(w, u, bag, v) {
  const s = ws(w);
  for (let k = 0; k < s.held.length; k++) if (s.held[k].id === v.id) { s.held[k].by = u.id; s.held[k].slot = bag.slot; return; }
  const e = rec(s); e.id = v.id; e.by = u.id; e.slot = bag.slot; s.held.push(e);
}
function grabFour(w, u, bag) {
  const G = T.grab, a = area(u), p = power(u), reach = u.radius + G.gap * a, maxM = G.mass * p * p;
  const n = w.queryMask(u.x, u.y, reach + T.margin, ENEMY[u.faction], GQ, GQ.length);
  let got = 0;
  for (let k = 0; k < n; k++) {
    const o = GQ[k]; GQ[k] = null;
    if (got >= G.max || !holdable(o, maxM) || hypot(o.x - u.x, o.y - u.y) - o.radius > reach) continue;
    setV(bag, got++, o.id);
    o.hurled = 1; o.vx = 0; o.vy = 0; o.target = -1;   // hurled: no other grabber takes it
    if (o.stun < 0.3) o.stun = 0.3;
    grabHeld(w, u, bag, o);
  }
  if (got === 0) return 0;
  bag.holding = 1; bag.t0 = w.time; bag.t1 = w.time + G.every;
  if (u.b.victim < 0) u.b.victim = bag.v0;
  act(w, u, ACT.GRAB); setState(u, STATE.ENGAGE);
  u.goalX = 0; u.goalY = 0;
  w.emit('strike', { x: u.x, y: u.y, v: got, type: u.type, as: 'octopus' });
  used(w, u, 'grabfour');
  return got;
}
function grabSqueeze(w, u, v, dmg) {
  const pass = damage(w, v, dmg, u, undefined, v.x, v.y);   // from its own grip: shields don't help
  if (u.def.risenFrom !== undefined) infect(w, v, u, 0.5 * pass, 0);   // a zombie copy's grip infects (ocean chew)
  w.emit('strike', { x: v.x, y: v.y, v: 1, type: u.type, as: 'octopus' });
}
// each victim hangs at tentacle length, squeezed every 0.5 s; thrown after 3 s (octopus.js hold)
function grabHold(w, u, bag) {
  const G = T.grab, now = w.time, sq = now >= bag.t1 - 1e-6, a = area(u);
  if (sq) bag.t1 += G.every;
  let left = 0;
  for (let k = 0; k < G.max; k++) {
    const id = getV(bag, k); if (id < 0) continue;
    const v = w.unitById(id);
    if (!v || v.dead || !(v.hp > 0)) { if (v) v.hurled = 0; setV(bag, k, -1); continue; }
    const dx = v.x - u.x, dy = v.y - u.y, d = hypot(dx, dy) || 0.001, r = Math.min(d, u.radius + v.radius + G.holdGap * a);
    glue(v, u.x + (dx / d) * r, u.y + (dy / d) * r, 2, 0, 0);
    if (sq) { grabSqueeze(w, u, v, G.squeeze * power(u)); if (!(v.hp > 0)) { v.hurled = 0; setV(bag, k, -1); continue; } }
    left++;
  }
  if (left === 0 || now - bag.t0 >= G.hold - 1e-6) grabLetGo(w, u, bag, left > 0);
}
function grabLetGo(w, u, bag, thrown) {
  const G = T.grab, dist = G.throwDist * power(u);
  for (let k = 0; k < G.max; k++) {
    const id = getV(bag, k); if (id < 0) continue;
    setV(bag, k, -1);
    if (u.b.victim === id) u.b.victim = -1;
    const v = w.unitById(id); if (!v || v.dead) continue;
    v.hurled = 0;
    if (thrown && v.hp > 0) { const dx = v.x - u.x, dy = v.y - u.y, d = hypot(dx, dy) || 0.001; tossTo(w, v, dx / d, dy / d, dist, G.throwUp); }
    else v.z = Math.min(v.z, 1);
  }
  bag.holding = 0; bag.next = w.time + G.regrab;
  unpose(w, u, ACT.GRAB);
  if (thrown) w.emit('throw', { x: u.x, y: u.y, v: 1, type: u.type, as: 'octopus' });
}
// after deaths: a victim whose holder is gone (cursed, turned, erased) or no longer holds it is let go
function heldSys(w) {
  const s = WS.get(w); if (!s || s.held.length === 0) return;
  const L = s.held;
  for (let k = L.length - 1; k >= 0; k--) {
    const e = L[k], v = w.unitById(e.id);
    if (!v || v.dead) { dropRec(s, L, k); continue; }
    const h = w.unitById(e.by), bag = h && !h.dead && h.b && h.b.ab ? h.b.ab[e.slot] : null;
    if (bag && bag.holding === 1 && (bag.v0 === e.id || bag.v1 === e.id || bag.v2 === e.id || bag.v3 === e.id)) continue;
    if (v.hurled === 1 && v.inside < 0) { v.hurled = 0; v.z = Math.min(v.z, 1); }
    dropRec(s, L, k);
  }
}
registerSystem('mine-act2:held', heldSys, 'lifecycle');
registerAbility({
  id: 'grabfour',
  init(w, u, bag) { bag.slot = slotOf(u, bag); bag.holding = 0; bag.v0 = -1; bag.v1 = -1; bag.v2 = -1; bag.v3 = -1; bag.t0 = 0; bag.t1 = 0; bag.next = w.rng() * 0.5; },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.holding === 1 || w.time < bag.next) return false;
    const near = d - t.radius <= u.radius + T.grab.gap * area(u);
    return (near || (w.tick + u.index) % 6 === 0) && grabFour(w, u, bag) > 0;
  },
  tick(w, u, bag) { if (bag.holding === 1 && u.hp > 0) grabHold(w, u, bag); },   // every tick (the brain skips some): held stay held
  busy(w, u, bag) {
    if (bag.holding !== 1) return false;
    u.goalX = 0; u.goalY = 0; u.face = u.heading;
    setState(u, STATE.ENGAGE);
    return true;
  },
  holdsNerve(w, u, bag) { return bag.holding === 1; },
  onDeath(w, u, cause, killer, bag) { if (bag.holding === 1) grabLetGo(w, u, bag, false); },
});

// ================================================================ DRINK (mosquito: latch on, drink, heal, grow; never pops)
/** Blood it can reach: living (not a machine / prop / swallowed), not up high, not hidden underground (mosquito.js hostOk). */
function hostOk(o) { return !!o && o.hp > 0 && !o.dead && living(o) && !upHigh(o) && !(o.hidden > 0); }
function drinkOff(w, u, bag, rest) {
  if (u.b.victim === bag.host) u.b.victim = -1;
  bag.latched = 0; bag.host = -1; bag.next = w.time + rest;
  unpose(w, u, ACT.DRINK);
}
// clings to its host's side (moved with it every tick) and sips; false = it let go this tick
function drinkOn(w, u, bag) {
  const D = T.drink, h = unitOf(w, bag.host), now = w.time;
  const stick = u.possessed === 1 && (!attackHeld(w) || (w.possess.mx * w.possess.mx + w.possess.my * w.possess.my) > 0.0144);
  const tossed = u.leaping !== LEAP.FLY && (u.z > D.tossZ || u.vz > 0);
  if (!hostOk(h) || u.stun > D.letGo || u.webbed > now || u.inside >= 0 || tossed || stick) { drinkOff(w, u, bag, h ? D.rest * 0.5 : 0); return false; }
  if (now - bag.t0 >= D.max) { drinkOff(w, u, bag, D.rest); return false; }
  const a = bag.ang + h.heading, r = h.radius + u.radius + D.gap, nx = h.x + Math.cos(a) * r, ny = h.y + Math.sin(a) * r;
  if (nx < u.radius || ny < u.radius || nx > w.W - u.radius || ny > w.H - u.radius || (w.walls.count > 0 && w.walls.isSolidAt(nx, ny))) { drinkOff(w, u, bag, D.rest); return false; }
  u.x = nx; u.y = ny; u.vx = h.vx; u.vy = h.vy;
  if (now >= bag.t1) {
    bag.t1 = now + D.sip;
    const hp0 = h.hp;
    damage(w, h, D.rate * power(u) * D.sip, u, undefined, h.x, h.y);   // from its own skin: shields don't help
    const got = Math.max(0, hp0 - Math.max(0, h.hp));
    bag.drunk += got;
    u.hp = Math.min(u.maxHp, u.hp + got);
    const r0 = bag.r0 * (u.shrink > 0 ? u.shrink : 1), want = r0 * Math.min(D.cap, 1 + (D.grow * bag.drunk) / (D.growHp * power(u)));
    if (want > u.radius) u.radius = want;   // grows; never pops (STEP8)
    used(w, u, 'drink');
  }
  return true;
}
registerAbility({
  id: 'drink',
  init(w, u, bag) { bag.latched = 0; bag.host = -1; bag.t0 = 0; bag.t1 = 0; bag.ang = 0; bag.next = 0; bag.drunk = 0; bag.r0 = u.radius; },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.latched === 1 || w.time < bag.next || !hostOk(t) || d > u.radius + t.radius + T.drink.reach * area(u)) return false;
    bag.latched = 1; bag.host = t.id; bag.t0 = w.time; bag.t1 = w.time + T.drink.sip;
    bag.ang = Math.atan2(u.y - t.y, u.x - t.x) - t.heading;   // where on its side it clings, in the host's own frame
    if (u.b.victim < 0) u.b.victim = t.id;
    act(w, u, ACT.DRINK); setState(u, STATE.ENGAGE);
    u.goalX = t.vx; u.goalY = t.vy; u.face = Math.atan2(t.y - u.y, t.x - u.x);
    w.emit('land', { x: t.x, y: t.y, v: 0.2, type: u.type, as: 'mosquito' });
    used(w, u, 'drink');
    return true;
  },
  tick(w, u, bag) { if (bag.latched === 1 && u.hp > 0) drinkOn(w, u, bag); },
  busy(w, u, bag) {
    if (bag.latched !== 1) return false;
    const h = unitOf(w, bag.host);
    if (!h) { drinkOff(w, u, bag, 0); return false; }
    u.goalX = h.vx; u.goalY = h.vy; u.face = Math.atan2(h.y - u.y, h.x - u.x);
    setState(u, STATE.ENGAGE);
    return true;
  },
  holdsNerve(w, u, bag) { return bag.latched === 1; },
  onDeath(w, u, cause, killer, bag) { if (bag.latched === 1) drinkOff(w, u, bag, 0); },
});

// ================================================================ SHOCK (eel: every 3 s, every enemy in the same water)
const SQ = new Array(96).fill(null);
function inWater(w, u) { return w.waterCells > 0 && !(u.z > T.shock.flyZ) && w.wetAt(u); }
function shockNow(w, u, bag) {
  const S = T.shock, pond = pondAt(w, u.x, u.y), R = S.r * area(u);
  const n = w.queryMask(u.x, u.y, R, ENEMY[u.faction], SQ, SQ.length);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = SQ[k]; SQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.def.prop || o.def.category === 'ocean' || o.inside >= 0) continue;   // sea animals don't mind it
    if (!w.wetAt(o) || pondAt(w, o.x, o.y) !== pond || hypot(o.x - u.x, o.y - u.y) > R) continue;   // only through the water
    const pass = damage(w, o, S.dmg * (o.def.machine === true ? S.machineMul : 1), u, 'shock');
    stun(w, o, S.stun * pass);
    if (hit < S.maxBolts) w.emit('bolt', { x: u.x, y: u.y, x1: o.x, y1: o.y, type: u.type, as: 'eel' });
    hit++;
  }
  if (hit === 0) { bag.next = w.time + S.look; return; }
  bag.next = w.time + S.every; bag.shockT = w.time; bag.shockR = R;
  act(w, u, ACT.CHANNEL); bag.posed = 1;
  w.emit('watershock', { x: u.x, y: u.y, v: hit, type: u.type, as: 'eel' });
  used(w, u, 'shock');
}
registerAbility({
  id: 'shock',
  init(w, u, bag) { bag.next = w.rng() * T.shock.every * 0.5; bag.shockT = -1e9; bag.shockR = 0; bag.posed = 0; },
  // every brain tick (target or not): shock when charged, standing / swimming in water, not stunned
  busy(w, u, bag) {
    const now = w.time;
    if (bag.posed === 1 && now - bag.shockT > T.shock.pose) { bag.posed = 0; unpose(w, u, ACT.CHANNEL); }   // once: mind / magnet share CHANNEL
    if (now >= bag.next && !(u.stun > 0) && canAuto(w, u) && inWater(w, u)) shockNow(w, u, bag);
    return false;
  },
  // the kitchen-sink field has no enemy in the water: put the unit and two foes in the pond
  test: {
    setup(g, w, u, foes) {
      u.x = u.px = 470; u.y = u.py = 600;
      foes[0].x = foes[0].px = 560; foes[0].y = foes[0].py = 600;
      foes[3].x = foes[3].px = 530; foes[3].y = foes[3].py = 620;
    },
    within: 15,
  },
});

// ================================================================ CURSE (mage: the strongest enemy becomes a frog)
// OG game.js:15710-15713: not a prop, not Props / Strays; bosses + machines can't be frogged (STEP6 lead)
function curseable(v) { const d = v.def; return !d.prop && d.faction !== F.Strays && d.faction !== F.Props && !d.boss && !d.machine; }
const KQ = new Array(48).fill(null);
// OG game.js:15684-15698: hittable within 240, the highest strength × maxHp / 100, must beat 0.35
function curseCandidate(w, u) {
  const n = w.queryMask(u.x, u.y, T.curse.range, HITTABLE[u.faction], KQ, KQ.length);
  let o = null, best = T.curse.min;
  for (let k = 0; k < n; k++) {
    const c = KQ[k]; KQ[k] = null;
    if (!(c.hp > 0) || c.dead || !curseable(c)) continue;
    const l = (c.def.strength * c.maxHp) / 100;
    if (l > best) { best = l; o = c; }
  }
  return o;
}
// OG game.js:15638-15656: the victim leaves its group and becomes a Frog in place, scale 7.5 / 8.63. Permanent.
function curseCast(w, u, v) {
  w.emit('curse', { x: v.x, y: v.y, v: 1, type: u.type, victim: v.type, as: 'mage' });
  if (!curseable(v)) return;
  const oldType = v.type;
  groupLeave(w, v.group);
  w.emit('puff', { x: v.x, y: v.y, size: 1.4 * Math.max(1, v.radius / T.curse.frogR), kind: 'dust' });
  const f = transformUnit(w, v, 'frog', -1, T.curse.frogR / T.curse.refR);
  if (f) f.curseType = oldType;
}
registerAbility({
  id: 'curse',
  init(w, u, bag) { bag.phase = 0; bag.victim = -1; bag.t = 0; bag.next = w.time + T.curse.first + T.curse.firstRnd * w.rng(); },
  act(w, u, t, dx, dy, d, bag) {
    if (bag.phase === 1 || w.time < bag.next || (w.tick + u.index) % T.curse.scanEvery !== 0) return false;
    const c = curseCandidate(w, u);
    if (!c) return false;
    bag.phase = 1; bag.victim = c.id; bag.t = w.time + T.curse.windup;
    act(w, u, ACT.CAST); setState(u, STATE.ENGAGE);
    u.goalX = 0; u.goalY = 0; u.face = Math.atan2(c.y - u.y, c.x - u.x);
    return true;
  },
  // winding up: stands facing the victim. OURS: a stun PAUSES the windup (the mage's is cancelled: a made unit in a melee is
  // stunned by nearly every blow and never got a curse off)
  busy(w, u, bag) {
    if (bag.phase !== 1) return false;
    const v = unitOf(w, bag.victim), live = v && v.hp > 0 && !v.dead ? v : null;
    u.goalX = 0; u.goalY = 0;
    if (u.stun > 0) { bag.t += 1 / 60; u.face = u.heading; return true; }
    if (live) u.face = Math.atan2(live.y - u.y, live.x - u.x);
    if (w.time < bag.t) return true;
    bag.phase = 0; bag.victim = -1;
    unpose(w, u, ACT.CAST);
    if (live) {
      bag.next = w.time + T.curse.cd * (0.8 + 0.4 * w.rng());
      curseCast(w, u, live);
      used(w, u, 'curse');
    }
    return true;
  },
  holdsNerve(w, u, bag) { return bag.phase === 1; },
});

// ================================================================ SMOKE (ninja: smoke bomb when badly hurt, then it runs)
function smokeBomb(w, u, bag) {   // OG game.js:18372-18391
  const S = T.smoke, a0 = area(u);
  bag.smoked = 1; bag.smokeAt = w.time;
  if (w.steam && typeof w.steam.add === 'function') w.steam.add(u.x, u.y, Math.min(70, S.r * a0), S.life, w.time);
  for (let k = 0; k < S.puffs; k++) {
    const a = (k / S.puffs) * Math.PI * 2 + 0.4 * (2 * w.rng() - 1);
    w.emit('smoke', { x: u.x + 10 * a0 * Math.cos(a), y: u.y + 8 * a0 * Math.sin(a), ang: a, v: 1.4, type: u.type, as: 'ninja' });
  }
  w.emit('steam', { x: u.x, y: u.y, v: 1.4, size: 20 * a0, type: u.type, as: 'ninja' });
  u.target = -1;
  act(w, u, ACT.SMOKE);
  used(w, u, 'smoke');
}
registerAbility({
  id: 'smoke',
  init(w, u, bag) { bag.smoked = 0; bag.smokeAt = -1e9; },
  busy(w, u, bag) {
    const now = w.time, S = T.smoke;
    if (bag.smoked === 0 && u.hp <= S.hpFrac * u.maxHp && u.hp > 0 && !(u.stun > 0)) {   // once per life (OG 18366-18369)
      const t = targetOf(w, u);
      if (t && hypot(t.x - u.x, t.y - u.y) < S.near) smokeBomb(w, u, bag);
    }
    if (now - bag.smokeAt >= S.run) { if (bag.smoked === 1 && bag.smokeAt > 0) { bag.smokeAt = -1e9; unpose(w, u, ACT.SMOKE); } return false; }
    if (u.stun > 0) { u.face = u.heading; return true; }
    setState(u, STATE.ADVANCE);   // run from the threat (or the old target) for 1.6 s (OG 18392-18402)
    let ax = -(u.threatX || 0), ay = -(u.threatY || 0);
    if (ax * ax + ay * ay < 1e-6) { const t = w.findNearest(u.x, u.y, 200, ENEMY[u.faction], null, 0); if (t) { ax = u.x - t.x; ay = u.y - t.y; } }
    const r = hypot(ax, ay);
    if (r < 1e-6) { u.goalX = 0; u.goalY = 0; return true; }
    u.goalX = (ax / r) * u.def.runSpeed; u.goalY = (ay / r) * u.def.runSpeed;
    return true;
  },
  test: { setup(g, w, u) { u.hp = 0.39 * u.maxHp; } },   // "badly hurt" from the start: the first foe within 140 px sets it off
});

export { T };
