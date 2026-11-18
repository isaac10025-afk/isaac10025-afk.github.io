// Unit maker: W-BODY modules (OURS, Part 2 step 8, STEP8.md). Owner: W-BODY.
// The 11 body weapons: bite, jaws, zombiebite, peck, tusks, horns, pinch, blades, tail, tailclub, sting. Each is the
// source unit's attack with the source's numbers (its T table, its brain), made to work on any body (person / animal /
// beast / giant) at any size: damage, reach (the gap past both bodies) and push × power(u); grab / toss mass limits ×
// power². Every one closes at RUN speed, then strikes (gunmen back away from melee: walk speed never catches them).
// Sounds: the source's event names with `type: u.type, as: '<source type>'`. used(w, u, id) on every hit that lands.
//
// Bag fields (u.b.wb) the art may read (fx-mine-body.js OVER + the body art):
//   jaws      victim (id held in the jaws, -1 none) + the shared pose: u.b.act = ACT.HOLD and u.b.victim = the id while
//             it holds (the made body's entry should say `holds(u)` -> u.b.victim when u.b.act === ACT.HOLD, as the
//             T-Rex's does; the sim glues the victim at 1.15 r in front of the body, up at 1.3 r, shaking).
//   tusks     ch (1 while running fast enough to gore: speed lines)
//   blades    arm (0 / 1: which blade slashed last, flips each slash), slashT (world.time of the last slash),
//             lunging (1 in the air: u.b.act = ACT.LEAP)
//   tail      swipeT (world.time of the last swipe: the swoosh behind)
//   tailclub  clubT (world.time of the last club), cx / cy (sim px: where the club landed)
//   others    nothing beyond u.attack (the plain attack pose of the hold class: mouth bite, head butt, fist, tail swing)
//
// Changed from the sources (and why), all small:
//   - every source's chase speed: always run (STEP8.md rule); the gull's dive / climb = a peck then a 0.5 s step back
//     (a body on the ground can't dive); the bee's orbit = the shared melee circling.
//   - tusks: the charge and the gore threshold are ratios of the unit's own run speed (charge at 1.7 × run, gores from
//     0.75 × run: the boar's 255 / 112.5 of its 150), so every body and speed step can gore (else a slow giant never
//     would); the gore's hit still scales with real speed (× speed / 255, the boar's), so a slow gore is a soft one.
//   - every bite / jab / slash / sting: an enemy already in reach is bitten before the picked target further off
//     (every 4th tick, the beetle's own look-round rule), else a unit with a boar pressing on its face never bit back.
//   - tail / tailclub: with the swing ready and the target close, the sources turn the tail and wait; a made unit also
//     backs into it (else a gunman keeping his distance is never hit).
//   - jaws: a hard knock (stun > 0.4 s) or being thrown makes it drop the victim (the raptor's let-go rule): a person
//     or animal body can be stunned; beast / giant bodies shrug stuns off like the T-Rex (core), so they keep hold.
//   - horns / tailclub: the mass limits × power² may go past the game's toss limit (mass 8), and the throw treats the
//     victim's weight as mass / power² (a copy of combat toss(): the same as the source at size 1), so a big unit's
//     flip is a real flip, not a 4 px hop. Bosses and untossable units never go up.
//   - zombiebite: victims rise on the biter's side (STEP8.md): a chained combat 'turn' hook moves the risen copy onto the
//     biter's faction (Mine) and group in a free-for-all (Team battle already puts it on the biter's team).
import { registerWeapon } from '../registry.js';
import {
  ACT, act, power, used, STATE, LEAP, GRAVITY, hypot, angleDiff, ENEMY,
  damage, push, setState, canAuto, clearLine, grounded, high, advanceTo,
  grabbable, glue, flung, blindFor,
} from '../lib.js';
import { infect, perchOf, blockedSpark, hatKnock, circle, oddsApproach, toss, unperch, hooks as CHOOKS, setCombatHook } from '../../combat/index.js';
import { onWorldClear, onReside } from '../../world.js';
import { slowUntil, heldBy } from '../../units/ocean/_lib.js';
import { poison } from '../../units/bugs/_lib.js';

// ---------------------------------------------------------------- shared numbers
const G = {
  margin: 46,         // px: max unit radius, added to radius queries (the core's margin)
  sky: 30,            // px: heights further apart than this can't reach each other (a flyer up there, STEP6 high flyers)
  chase: 160,         // px: closer than this the run at the target is a Charge (state), farther an Advance; both at run speed
  aimCone: 1.0,       // rad: possessed, attack at nobody: whoever is in reach within this of the aim gets it
  emptySwing: 0.45,   // s: an empty swing's cooldown (possess.js SWING_COOLDOWN)
  tossKeepV: 0.3,     // combat/push.js TOSS_KEEP_V
  tossStunPad: 0.3,   // combat/push.js TOSS_STUN_PAD
};
const Q = new Array(48), HIT = new Array(48);

// ---------------------------------------------------------------- shared pieces
const isRisen = (u) => u.def.risenFrom !== undefined;
/** Can u reach t up or down? (a flyer up high can't be bitten from the ground; a diving flyer can bite) */
const zOk = (u, t) => Math.abs((t.z || 0) - (u.z || 0)) <= G.sky;
/** Close on t at run speed (round walls by the flow field), facing it when the line is clear. */
function chase(w, u, t, dx, dy, d) {
  advanceTo(w, u, t, dx, dy, clearLine(w, u), u.def.runSpeed);
  if (d < G.chase) setState(u, STATE.CHARGE);
}
/** In reach: Engage, face it; circle round it like any melee unit (combat circle + odds step, as meleeFight). */
function engage(w, u, t, dx, dy, d, circ) {
  setState(u, STATE.ENGAGE);
  if (u.group >= 0) w.groups.markEngaged(u.group);
  u.face = Math.atan2(dy, dx);
  if (circ > 0) { circle(w, u, t, dx, dy, d, u.def, circ, true); oddsApproach(w, u, t, dx, dy, d, u.def); }
}
/**
 * A melee strike (combat meleeStrike's rules, its event carries `as`): damage ± 10 %, push + stun × pass, a block spark,
 * cooldown every + up to 15 %, the attack pose; risen copies infect at 0.5 × pass (dinos / bugs bite()). Returns pass.
 * fromSelf: damage from the victim's own spot (beats shields: a peck from above, a jaw).
 */
function strike(w, u, t, dmg, pushF, stunT, every, as, id, fromSelf) {
  const v = perchOf(w, t);
  const ex = v.x - u.x, ey = v.y - u.y, d = hypot(ex, ey) || 0.001;
  const amt = dmg * (1 + 0.1 * (2 * w.rng() - 1));
  const pass = fromSelf ? damage(w, v, amt, u, undefined, v.x, v.y) : damage(w, v, amt, u);
  if (pushF > 0 || stunT > 0) push(w, v, ex / d, ey / d, pushF * pass, stunT * pass);
  blockedSpark(w, u, v, pass);
  if (pass >= 1) w.emit('strike', { x: v.x, y: v.y, v: 1, type: u.type, as });
  if (every > 0) u.cooldown = every * (1 + 0.15 * w.rng());
  u.attack = 1;
  if (pass > 0) used(w, u, id);
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  return pass;
}
/** Possessed, attack at nobody: the nearest enemy in reach (gap past both bodies) within the aim cone, or null. */
function inReach(w, u, gap, aim) {
  const n = w.queryMask(u.x, u.y, u.radius + gap + G.margin, ENEMY[u.faction], Q, Q.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0 || !zOk(u, o)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy);
    if (d > u.radius + o.radius + gap) continue;
    if (aim === aim && d > 0.5 && Math.abs(angleDiff(aim, Math.atan2(dy, dx))) > G.aimCone) continue;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/**
 * Wraps a fight: when the picked target is out of reach and another enemy is IN reach (gap past both bodies), that one
 * becomes the target (looked for every 4th tick; the beetle's flipVictim rule). Without it a unit walked into a boar or a
 * shield line pressing on its face kept pushing past them toward a target behind and never bit back.
 */
function nearFirst(gapOf, fight) {
  return function fightNear(w, u, t, dx, dy, d, bag) {
    if ((w.tick + u.index) % 4 === 0 && d > u.radius + t.radius + gapOf(u)) {
      const o = inReach(w, u, gapOf(u), NaN);
      if (o && o !== t) { u.target = o.id; t = o; dx = o.x - u.x; dy = o.y - u.y; d = hypot(dx, dy) || 0.001; }
    }
    fight(w, u, t, dx, dy, d, bag);
  };
}
/** The plain attack pose with nothing hit (possessed, attack at nobody). */
function emptySwing(w, u, as, cd) {
  if (u.cooldown > 0) return;
  u.attack = 1; u.cooldown = cd || G.emptySwing;
  w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, as });
}
/**
 * Throw v along (dx, dy) so it lands about `dist` px away with upward speed `up` (dinos tossTo), by a unit of power p.
 * A copy of combat/push.js toss() (OG game.js:9063-9081) with two changes: the victim's weight counts as mass / p² (so
 * at size 1 it is exactly the game's toss; a big unit throws a heavy victim as a small one throws a light one), and
 * there is no mass-8 refusal (the callers check their own limit × power²). Returns the time in the air (s).
 */
function lift(w, v, dx, dy, dist, up, p) {
  const k = 1 / Math.sqrt(Math.max(1, v.mass / (p * p))), h = up * k;
  const air = (h + Math.sqrt(h * h + 2 * GRAVITY * Math.max(0, v.z))) / GRAVITY;
  const out = dist / Math.max(0.05, air);   // ground speed: lands `dist` away
  if (v.climb > 0) v.z = Math.max(v.z, 1);
  unperch(v);
  v.vx = dx * out + G.tossKeepV * v.vx; v.vy = dy * out + G.tossKeepV * v.vy;
  v.vz = h;
  const side = Math.abs(dx) > 0.2 ? Math.sign(dx) : w.rng() < 0.5 ? -1 : 1;
  v.spin = (2 * side * Math.PI) / Math.max(0.2, air);
  v.thrownAt = w.time;
  v.stun = Math.max(v.stun, air + G.tossStunPad);
  v.prone = 0; v.proneWant = 0;
  return air;
}
/** May v be thrown at all (not bosses, untossable units, props, swallowed or held ones)? `mass` = the caller's limit. */
function liftable(v, mass) {
  const d = v.def;
  return v.mass <= mass && !d.prop && !d.untossable && !d.boss && v.hurled !== 1 && v.inside < 0 && grounded(v);
}
const lookOf = (time) => ({ look: { attack: { time } } });
/**
 * Tail turned to t (stego / ankylo turn the tail toward a close enemy when the swing is ready): shuffle backwards into
 * it at run speed until it's inside the tail's reach (`gap` past both bodies, less a 4 px margin). Ours: the sources
 * only wait with the tail turned, which works on melee foes coming in but never on a gunman keeping his distance.
 */
function backIn(u, t, dx, dy, d, gap) {
  if (d <= u.radius + t.radius + gap - 4) return;
  const sp = u.def.runSpeed;
  u.goalX = dx / d * sp; u.goalY = dy / d * sp;
}

// ================================================================ bite (raptor's plain bite)
// from units/dinos/raptor.js brain: d <= r + r + 4 -> bite(w, u, t, T.bite, T.biteEvery, 50, 0.1)
const BITE = {
  dmg: 12,            // raptor T.bite
  every: 0.5,         // raptor T.biteEvery (s)
  push: 50,           // raptor's bite push
  stun: 0.1,          // s
  reach: 4,           // px past both bodies
  pose: 0.3,          // s: raptor look.attack.time
};
registerWeapon({
  id: 'bite', range: 0, def: lookOf(BITE.pose),
  fight: nearFirst((u) => BITE.reach * power(u), (w, u, t, dx, dy, d) => {
    const p = power(u);
    if (d <= u.radius + t.radius + BITE.reach * p && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      if (u.cooldown <= 0) strike(w, u, t, BITE.dmg * p, BITE.push * p, BITE.stun, BITE.every, 'raptor', 'bite', false);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  possessFire(w, u, aim) {
    const p = power(u), v = u.cooldown <= 0 ? inReach(w, u, BITE.reach * p, aim) : null;
    if (v) strike(w, u, v, BITE.dmg * p, BITE.push * p, BITE.stun, BITE.every, 'raptor', 'bite', false);
    else emptySwing(w, u, 'raptor', BITE.every);
  },
});

// ================================================================ jaws (T-Rex: bite, lift + shake + throw a light victim)
// from units/dinos/trex.js chomp() / shake() / letGo()
const JAWS = {
  bite: 60,           // trex T.bite
  every: 1.3,         // trex T.biteEvery (s)
  push: 140,          // trex T.bitePush (a victim too heavy to lift)
  stun: 0.3,          // s: a victim too heavy to lift
  reach: 8,           // px past both bodies (trex: d <= r + r + 8)
  facing: 0.8,        // rad: must face it this well to bite
  liftMass: 4.5,      // trex T.liftMass (× power²): victims this light are lifted in the jaws
  shakeTime: 0.8,     // s shaken ...
  shakeDmg: 15,       // ... for 15 ...
  shakeEvery: 0.2,    // ... every 0.2 s
  throwMin: 120,      // px thrown (× power) ...
  throwMax: 200,      // ... up to
  throwSpread: 0.7,   // rad either side of straight ahead
  landHit: 15,        // whoever the thrown victim lands on (× power, + knocked down: dinos flung)
  ahead: 1.15,        // × radius: the victim is held this far in front (the render's jaw draw reads it: trex / gator)
  up: 1.3,            // × radius: and this high
  letGo: 0.4,         // s: a stun this long knocks the victim out of its jaws (raptor T.letGo)
  pose: 0.4,          // s: trex look.attack.time
};
function chomp(w, u, t, bag) {
  const p = power(u);
  const can = grabbable(t, JAWS.liftMass * p * p) && t.climb === 0 && t.inside < 0;
  const pass = strike(w, u, t, JAWS.bite * p, can ? 0 : JAWS.push * p, can ? 0 : JAWS.stun, JAWS.every, 'trex', 'jaws', false);
  if (!can || !(t.hp > 0) || pass < 0.5) return;
  bag.victim = t.id; bag.t0 = w.time; bag.t1 = w.time + JAWS.shakeEvery; t.hurled = 1;
  u.b.victim = t.id; act(w, u, ACT.HOLD);
  heldBy(w, u, t);   // ocean's safety net: if this unit vanishes (edited away, cursed) the victim is let go
}
// every tick (also stunned): held at the mouth, shaken, chewed, then thrown
function shake(w, u, bag) {
  const v = bag.victim >= 0 ? w.unitById(bag.victim) : null, now = w.time;
  const knocked = u.stun > JAWS.letGo && !(u.def.maker && u.def.maker.shrug);   // beast / giant bodies shrug stuns off (core)
  if (!v || !(v.hp > 0) || !(u.hp > 0) || knocked || (u.z > 8 && u.leaping !== LEAP.FLY)) { jawsLetGo(w, u, bag, v, false); return; }
  const side = Math.cos(u.heading) >= 0 ? 1 : -1, r = u.radius, jig = 3 * Math.sin(40 * now + u.id);
  glue(v, u.x + side * r * JAWS.ahead + jig, u.y + 1, (u.z || 0) + r * JAWS.up + 0.6 * jig, u.vx, u.vy);
  if (now >= bag.t1 - 1e-6) {
    const pass = damage(w, v, JAWS.shakeDmg * power(u), u, undefined, v.x, v.y);   // from its own spot: shields can't help
    if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
    w.emit('strike', { x: v.x, y: v.y, v: 1, type: u.type, as: 'trex' });
    if (pass > 0) used(w, u, 'jaws');
    u.attack = 1; bag.t1 += JAWS.shakeEvery;   // 0.2, 0.4, 0.6, 0.8 s
  }
  if (now - bag.t0 >= JAWS.shakeTime - 1e-6) jawsLetGo(w, u, bag, v, true);
}
function jawsLetGo(w, u, bag, v, thrown) {
  bag.victim = -1;
  if (u.b.act === ACT.HOLD) act(w, u, ACT.NONE);
  if (v && u.b.victim === v.id) u.b.victim = -1;
  u.cooldown = Math.max(u.cooldown, 0.5);
  if (!v) return;
  v.hurled = 0;
  if (!thrown || !(v.hp > 0)) { v.z = Math.max(v.z, 1); return; }   // dropped: falls where it is
  const p = power(u);
  const dist = (JAWS.throwMin + (JAWS.throwMax - JAWS.throwMin) * w.rng()) * p, ang = u.heading + JAWS.throwSpread * (2 * w.rng() - 1);
  const tt = Math.min(0.8, Math.max(0.45, dist / 260));
  v.vx = Math.cos(ang) * dist / tt; v.vy = Math.sin(ang) * dist / tt;
  v.vz = (0.5 * GRAVITY * tt * tt - v.z) / tt;
  v.spin = (Math.cos(ang) >= 0 ? 1 : -1) * 2 * Math.PI / tt; v.thrownAt = w.time;
  v.stun = Math.max(v.stun, tt + 0.4);
  flung(w, v, u, 0, JAWS.landHit * p);
  w.emit('throw', { x: u.x, y: u.y, v: 2, type: u.type, as: 'trex' });
}
registerWeapon({
  id: 'jaws', range: 0, def: lookOf(JAWS.pose),
  init(w, u, bag) { bag.victim = -1; bag.t0 = 0; bag.t1 = 0; },
  tick(w, u, bag) { if (bag.victim >= 0) shake(w, u, bag); },
  busy(w, u, bag) {   // shaking: stands still, jaws forward
    if (bag.victim < 0) return false;
    setState(u, STATE.ENGAGE); u.face = u.heading;
    return true;
  },
  fight: nearFirst((u) => JAWS.reach * power(u), (w, u, t, dx, dy, d, bag) => {
    const p = power(u);
    if (d <= u.radius + t.radius + JAWS.reach * p && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, u.face)) < JAWS.facing) chomp(w, u, t, bag);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  possessFire(w, u, aim, ax, ay, bag) {
    if (bag.victim >= 0) return;
    const v = u.cooldown <= 0 ? inReach(w, u, JAWS.reach * power(u), aim) : null;
    if (v) chomp(w, u, v, bag); else emptySwing(w, u, 'trex', JAWS.every);
  },
  holdsNerve(w, u, bag) { return bag.victim >= 0; },   // no running off with a victim in its jaws
  onDeath(w, u, cause, killer, bag) { if (bag.victim >= 0) jawsLetGo(w, u, bag, w.unitById(bag.victim), false); },
});

// ================================================================ zombiebite (zombie bite + infection: rises on OUR side)
// from units/mythical/zombie.js brain + bite() (OG game.js:12409-12426)
const ZB = {
  dmg: 16,            // zombie bite (OG game.js:12421)
  push: 45,           // × pass (OG game.js:12422)
  stun: 0.1,          // s (OG game.js:12422)
  infect: 0.8,        // × pass, timer 0 = turns at once unless its type waits for death (OG game.js:12423)
  every: 1.1,         // s (OG game.js:12425)
  reach: 3,           // px past both bodies (OG game.js:12409)
  pushIn: 0.5,        // × walk speed: leans in at contact (OG game.js:12413-12414)
  circle: 0.5,        // circling amount at contact (OG game.js:12415)
  pose: 0.3,          // s: zombie look.attack.time (OG game.js:12391)
};
// victims bitten by a made unit: they rise on the biter's side, not Undead. One record per infected victim (per world).
const ZW = new WeakMap();
onWorldClear((w) => { const s = ZW.get(w); if (s) { for (const e of s.list) s.free.push(e); s.list.length = 0; } });
// Team switch (world.reside, 11-17): a bitten unit not yet risen will rise on its biter's new side (still standing), else
// on the side the biter had in free-for-all / the team of the half the victim stands on.
onReside((w) => {
  const s = ZW.get(w); if (!s) return;
  for (const e of s.list) {
    const by = w.unitById(e.by), v = w.unitById(e.id);
    if (by && by.hp > 0) { e.fac = by.faction; e.team = by.team; e.home = by.home; e.homeGen = by.homeGen; }
    else if (w.teamMode) { e.team = v ? w.teamAt(v.x) : 0; e.fac = w.factionOf(e.def, e.team); }
    else { e.team = -1; e.fac = e.home >= 0 && w.sides.gen[e.home] === e.homeGen ? e.home : w.factionOf(e.def, -1); }
    e.gen = w.sides.gen[e.fac];
  }
});
let prevTurn = null;
function zbRecord(w, v, u) {
  let s = ZW.get(w);
  if (!s) { s = { list: [], free: [] }; ZW.set(w, s); }
  for (let k = s.list.length - 1; k >= 0; k--) {   // stale ones out (gone, or no longer carrying the bite)
    const e = s.list[k], o = w.unitById(e.id);
    if (!o || !(o.infection > 0) || o.id === v.id) { s.free.push(e); s.list[k] = s.list[s.list.length - 1]; s.list.pop(); }
  }
  const e = s.free.pop() || { id: -1, by: -1, fac: 0, gen: 0, team: -1, def: null, home: -1, homeGen: 0 };
  e.id = v.id; e.by = u.id; e.fac = u.faction; e.gen = w.sides.gen[u.faction]; e.team = u.team; e.def = u.def; e.home = u.home; e.homeGen = u.homeGen;
  s.list.push(e);
  if (CHOOKS.turn !== zbTurn) {   // chain the combat 'turn' hook (units/mythical/turn.js installs the base one); again if
    prevTurn = CHOOKS.turn;        // someone re-set it since (tests re-arm turnUnit: the bite's victims then rose Undead)
    setCombatHook('turn', zbTurn);
  }
}
// The combat 'turn' hook, chained: the base turn (turn.js turnUnit), then a made unit's victim joins the biter's side.
function zbTurn(w, u) {
  const k = prevTurn ? prevTurn(w, u) : null;
  const s = ZW.get(w);
  if (!s || s.list.length === 0) return k;
  for (let i = 0; i < s.list.length; i++) {
    const e = s.list[i];
    if (e.id !== u.id) continue;
    s.list[i] = s.list[s.list.length - 1]; s.list.pop(); s.free.push(e);
    if (k && !k.dead && k.faction !== e.fac) toSide(w, k, e);
    break;
  }
  return k;
}
// k (the fresh risen copy) onto the biter's side: its faction + team, the biter's group if that still stands for the side
function toSide(w, k, e) {
  const gs = w.groups, by = w.unitById(e.by);
  if (w.sides.gen[e.fac] !== e.gen) { e.fac = w.factionOf(e.def, e.team); e.gen = w.sides.gen[e.fac]; }   // the biter's side slot changed hands (side split 11-17)
  k.faction = e.fac; k.team = e.team; k.target = -1;
  k.home = e.home; k.homeGen = e.homeGen; k.likeId = e.by;   // back to the biter's side when Team battle goes off (world.js reside)
  let g = by && by.hp > 0 && by.group >= 0 && gs.alive[by.group] === 1 && gs.faction[by.group] === e.fac ? by.group : -1;
  if (k.group >= 0 && gs.alive[k.group] === 1) gs.leave(k.group);
  if (g >= 0) gs.join(g);
  else { g = gs.create(k.type, e.fac); if (g >= 0) { gs.join(g); gs.release(g); } }
  k.group = g;
}
function zbite(w, u, t, dx, dy, d) {
  const v = perchOf(w, t), p = power(u);
  const m = damage(w, v, ZB.dmg * p, u);
  push(w, v, dx / d, dy / d, ZB.push * m * p, ZB.stun);
  if (infect(w, v, u, ZB.infect * m, 0)) zbRecord(w, v, u);
  w.emit('strike', { x: u.x, y: u.y, v: 1, type: u.type, as: 'zombie' });
  u.cooldown = ZB.every; u.attack = 1;
  if (m > 0) used(w, u, 'zombiebite');
}
registerWeapon({
  id: 'zombiebite', range: 0, def: lookOf(ZB.pose),
  fight: nearFirst((u) => ZB.reach * power(u), (w, u, t, dx, dy, d) => {
    if (d <= u.radius + t.radius + ZB.reach * power(u) && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      u.goalX = (dx / d) * u.def.walkSpeed * ZB.pushIn; u.goalY = (dy / d) * u.def.walkSpeed * ZB.pushIn;
      circle(w, u, t, dx, dy, d, u.def, ZB.circle, false);
      if (u.cooldown <= 0) zbite(w, u, t, dx, dy, d);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  possessFire(w, u, aim) {
    const v = u.cooldown <= 0 ? inReach(w, u, ZB.reach * power(u), aim) : null;
    if (!v) { emptySwing(w, u, 'zombie', ZB.every); return; }
    const dx = v.x - u.x, dy = v.y - u.y; zbite(w, u, v, dx, dy, hypot(dx, dy) || 0.001);
  },
});

// ================================================================ peck (seagull: blinds + knocks the hat off)
// from units/secret/seagull.js dive(): the peck at the bottom of the dive
const PECK = {
  dmg: 3,             // seagull T.peck (from above: shields don't help)
  blind: 3,           // s blind (dinos blindFor: sees 55 px, shots spray, swings at whoever is nearest)
  every: 2,           // s between pecks (seagull T.every)
  reach: 6,           // px past both bodies (seagull T.reach)
  hat: 0.7,           // hat knock power (seagull hatKnock(..., 0.7))
  back: 0.5,          // s stepping back after a peck (the gull's climb away, T.climb)
  wobble: 1.2,        // rad: the step back goes a little to one side (seagull's wob)
  pose: 0.35,         // s: seagull look.attack.time
};
function peck(w, u, v, bag) {
  const dx = v.x - u.x, dy = v.y - u.y, d = hypot(dx, dy) || 0.001, wob = (w.rng() - 0.5) * PECK.wobble;
  const c = Math.cos(wob), s = Math.sin(wob);
  bag.dx = (-dx * c + dy * s) / d; bag.dy = (-dx * s - dy * c) / d;   // away from the victim, a little to one side
  bag.backT = w.time + PECK.back;
  const pass = damage(w, v, PECK.dmg * power(u), u, undefined, v.x, v.y);
  u.cooldown = PECK.every; u.attack = 1;
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  if (v.hp > 0) { blindFor(w, v, PECK.blind); hatKnock(w, v, -bag.dx, -bag.dy, PECK.hat); }
  w.emit('strike', { x: v.x, y: v.y, v: 0.4, type: u.type, peck: 1, as: 'seagull' });
  if (pass > 0) used(w, u, 'peck');
}
registerWeapon({
  id: 'peck', range: 0, def: lookOf(PECK.pose),
  init(w, u, bag) { bag.backT = 0; bag.dx = 0; bag.dy = 0; },
  fight: nearFirst((u) => PECK.reach * power(u), (w, u, t, dx, dy, d, bag) => {
    if (w.time < bag.backT) {   // stepping back after a peck
      setState(u, STATE.ENGAGE);
      u.goalX = bag.dx * u.def.runSpeed; u.goalY = bag.dy * u.def.runSpeed; u.face = Math.atan2(dy, dx);
      return;
    }
    if (d <= u.radius + t.radius + PECK.reach * power(u) && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0.5);
      if (u.cooldown <= 0) peck(w, u, perchOf(w, t), bag);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  possessFire(w, u, aim, ax, ay, bag) {
    const v = u.cooldown <= 0 ? inReach(w, u, PECK.reach * power(u), aim) : null;
    if (v) peck(w, u, v, bag); else emptySwing(w, u, 'seagull', PECK.every);
  },
});

// ================================================================ tusks (boar: charge + gore + toss)
// from units/animals/boar.js charge() / bite() and the gore = trample (animals/lib.js trample, OG game.js:252-301)
const TUSK = {
  fullK: 1.7,         // charge at 1.7 × run speed (boar FULL_SPEED 255 / run 150), capped at the unit's max speed
  minK: 0.75,         // gores from 0.75 × run speed (boar GORE_MIN_SPEED 112.5 / 150)
  full: 255,          // px/s: a gore at this speed or faster hits in full (boar FULL_SPEED); slower ones × speed / 255
  dmg: 45,            // gore damage × (speed / full) (boar GORE.damage)
  knock: 150,         // gore knockback (GORE.knockback)
  stun: 0.55,         // s × pass (GORE.stun)
  tossChance: 0.25,   // a gore that gets through tosses (GORE.tossChance) ...
  tossUp: 450,        // ... up (GORE.tossUp) ...
  tossOut: 170,       // ... and out (GORE.tossSpeed)
  slowdown: 0.6,      // speed kept after each gore (GORE.slowdown)
  pad: 1.5,           // px past both bodies (trample pad)
  goreCd: 0.35,       // s: the same victim isn't gored again this soon (trample cooldown)
  bite: 14,           // the jab when it isn't running (boar BITE)
  biteEvery: 0.75,    // s (BITE_COOLDOWN)
  biteReach: 4,       // px past both bodies
  biteToss: 0.3,      // chance a jab tosses (110 out, 380 up × pass) ...
  bitePush: 80,       // ... else pushes 80, stun 0.15
  backChance: 0.45,   // after a jab: chance it backs off for a fresh run-up ...
  backTime: 0.9,      // ... 0.9 s × 0.8-1.25
  lead: 0.5,          // s: leads a moving target at most this far
  pose: 0.35,         // s: boar look.attack.time
};
function goreFull(u) { return Math.min(TUSK.fullK * u.def.runSpeed, u.def.maxSpeed); }
function gore(w, u, speed) {
  const cs = Math.cos(u.heading), sn = Math.sin(u.heading), p = power(u), min = TUSK.minK * u.def.runSpeed;
  const n = w.queryMask(u.x, u.y, u.radius + G.margin + TUSK.pad, ENEMY[u.faction], Q, 16);
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (speed < min) continue;
    if (o === u || o.dead || !(o.hp > 0) || o.climb > 0 || o.def.prop || o.inside >= 0 || !zOk(u, o)) continue;
    if (o.id === u.lastVictim && u.cooldown > 0) continue;
    const dx = o.x - u.x, dy = o.y - u.y;
    if (hypot(dx, dy) > u.radius + o.radius + TUSK.pad || dx * cs + dy * sn < 0) continue;   // only ahead
    const j = Math.min(1, speed / TUSK.full), m = damage(w, o, TUSK.dmg * j * p, u, 'trample');
    w.emit('trample', { x: o.x, y: o.y, v: j, power: j, type: u.type, as: 'boar' });
    if (isRisen(u)) infect(w, o, u, 0.5 * m, 0);
    const side = cs * dy - sn * dx >= 0 ? 1 : -1, lx = 0.8 * cs - sn * side * 0.6, ly = 0.8 * sn + cs * side * 0.6;
    if (m >= 0.6 && w.rng() < TUSK.tossChance) toss(w, o, lx, ly, TUSK.tossOut * j * m * p, TUSK.tossUp * j * m);
    else push(w, o, lx, ly, TUSK.knock * j * m * p, TUSK.stun * m);
    const brace = (o.def.shield && o.def.shield.brace) || 0;
    if (m < 1 && brace > 0) damage(w, u, brace * j, o, 'brace');   // a braced shield hurts the charger
    u.vx *= TUSK.slowdown; u.vy *= TUSK.slowdown; speed *= TUSK.slowdown;
    u.lastVictim = o.id; u.cooldown = TUSK.goreCd; u.attack = 1;
    if (m > 0) used(w, u, 'tusks');
    hits++;
  }
  return hits;
}
function goreIfFast(w, u, bag) {
  const sp = hypot(u.vx, u.vy);
  bag.ch = sp >= TUSK.minK * u.def.runSpeed ? 1 : 0;
  if (bag.ch === 1) gore(w, u, sp);
  return bag.ch === 1;
}
function jab(w, u, t, bag) {
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, p = power(u);
  if (d > u.radius + t.radius + TUSK.biteReach * p) return;
  const h = perchOf(w, t), m = damage(w, h, TUSK.bite * p, u);
  if (isRisen(u)) infect(w, h, u, 0.5 * m, 0);
  if (h === t) {
    if (t.hp > 0 && m >= 0.6 && w.rng() < TUSK.biteToss) toss(w, t, dx / d, dy / d, 110 * m * p, 380 * m);
    else push(w, t, dx / d, dy / d, TUSK.bitePush * p, 0.15);
  }
  u.cooldown = TUSK.biteEvery; u.attack = 1;
  if (w.rng() < TUSK.backChance) bag.backT = w.time + TUSK.backTime * (0.8 + 0.45 * w.rng());
  w.emit('strike', { x: u.x, y: u.y, type: u.type, as: 'boar' });
  if (m > 0) used(w, u, 'tusks');
}
registerWeapon({
  id: 'tusks', range: 0, def: lookOf(TUSK.pose),
  init(w, u, bag) { bag.backT = 0; bag.ch = 0; },
  idle(w, u, bag) { bag.ch = 0; return false; },
  fight: nearFirst((u) => TUSK.biteReach * power(u), (w, u, t, dx, dy, d, bag) => {
    const run = u.def.runSpeed;
    if (w.time < bag.backT) {   // backing off for a run-up (boar subState 2)
      setState(u, STATE.CHARGE);
      u.goalX = -dx / d * run; u.goalY = -dy / d * run;
      goreIfFast(w, u, bag);
      return;
    }
    if (u.los === 0 && w.walls.count > 0) { chase(w, u, t, dx, dy, d); goreIfFast(w, u, bag); return; }   // round the wall first
    const full = goreFull(u), lead = Math.min(d / full, TUSK.lead);
    const ax = dx + t.vx * lead, ay = dy + t.vy * lead, ad = hypot(ax, ay) || 0.001;
    setState(u, STATE.CHARGE);
    u.goalX = ax / ad * full; u.goalY = ay / ad * full; u.face = Math.atan2(ay, ax);
    if (!goreIfFast(w, u, bag) && u.cooldown <= 0 && zOk(u, t)) jab(w, u, t, bag);
  }),
  // possessed, attack at nobody: running hard gores what's ahead, else a jab at whoever is in reach
  possessFire(w, u, aim, ax, ay, bag) {
    if (goreIfFast(w, u, bag)) return;
    const v = u.cooldown <= 0 ? inReach(w, u, TUSK.biteReach * power(u), aim) : null;
    if (v) jab(w, u, v, bag); else emptySwing(w, u, 'boar', TUSK.biteEvery);
  },
});

// ================================================================ horns (beetle: flip over the back)
// from units/bugs/beetle.js flipVictim() / flip()
const HORN = {
  reach: 12,          // px past both bodies (beetle T.flipReach)
  dmg: 18,            // beetle T.flipDmg
  every: 1.5,         // s between flips
  behind: 30,         // px past its back: where the victim comes down (× power)
  up: 320,            // upward toss speed (before the toss's own mass scaling)
  knock: 0.6,         // s down after it lands
  heavy: 8,           // victims this heavy (× power²) or more are only shoved (the beetle's toss rule)
  shove: 160,         // push × pass (× power) for a heavy one ...
  shoveStun: 0.3,     // ... and stun × pass
  frontArc: 1.2,      // rad: prefers a victim in front of the horn
  pose: 0.4,          // s: beetle look.attack.time
};
function hornReach(u, o, R) {
  return !o.dead && o.hp > 0 && !o.def.prop && !high(o) && zOk(u, o) && o.inside < 0 && o.hurled !== 1 && hypot(o.x - u.x, o.y - u.y) <= R + o.radius;
}
function flipVictim(w, u, t) {
  const R = u.radius + HORN.reach * power(u);
  if (t && hornReach(u, t, R)) return t;
  if ((w.tick + u.index) % 3 !== 0) return null;   // the look round for another: every 3rd tick
  const n = w.queryMask(u.x, u.y, R + G.margin, ENEMY[u.faction], Q, 32);
  let best = null, bs = Infinity;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (!hornReach(u, o, R)) continue;
    const off = Math.abs(angleDiff(u.heading, Math.atan2(o.y - u.y, o.x - u.x)));
    const s = hypot(o.x - u.x, o.y - u.y) * (off < HORN.frontArc ? 1 : 2);
    if (s < bs) { bs = s; best = o; }
  }
  return best;
}
function flip(w, u, v, bag) {
  const p = power(u), dx = u.x - v.x, dy = u.y - v.y, d = hypot(dx, dy) || 0.001, ux = dx / d, uy = dy / d;
  const pass = damage(w, v, HORN.dmg * p, u, undefined, u.x, u.y);
  if (isRisen(u)) infect(w, v, u, 0.5 * pass, 0);
  if (v.hp > 0 && pass >= 0.5) {
    if (liftable(v, HORN.heavy * p * p - 1e-9)) {   // up and over its back
      const air = lift(w, v, ux, uy, d + u.radius + HORN.behind * p, HORN.up, p);
      v.stun = Math.max(v.stun, air + HORN.knock); v.thrownAt = w.time;
      v.spin = (ux >= 0 ? 1 : -1) * 2 * Math.PI / Math.max(0.25, air);   // head over heels
    } else push(w, v, -ux, -uy, HORN.shove * pass * p, HORN.shoveStun * pass);   // too heavy to lift: shoved back
  }
  bag.next = w.time + HORN.every; u.attack = 1; u.face = Math.atan2(-dy, -dx);
  w.emit('throw', { x: v.x, y: v.y, v: 0.9, type: u.type, as: 'beetle' });
  if (pass > 0) used(w, u, 'horns');
}
registerWeapon({
  id: 'horns', range: 0, def: lookOf(HORN.pose),
  init(w, u, bag) { bag.next = w.time + HORN.every * w.rng(); },
  fight(w, u, t, dx, dy, d, bag) {
    if (w.time >= bag.next && canAuto(w, u)) {
      const v = flipVictim(w, u, t);
      if (v) { flip(w, u, v, bag); setState(u, STATE.ENGAGE); return; }
    }
    if (d <= u.radius + t.radius + HORN.reach * power(u) && zOk(u, t)) { engage(w, u, t, dx, dy, d, 0); return; }   // horn on it, waiting
    chase(w, u, t, dx, dy, d);
  },
  possessFire(w, u, aim, ax, ay, bag) {
    const v = w.time >= bag.next ? inReach(w, u, HORN.reach * power(u), aim) : null;
    if (v) flip(w, u, v, bag); else emptySwing(w, u, 'beetle', HORN.every);
  },
});

// ================================================================ pinch (crab: slows)
// from units/ocean/crab.js brain
const PINCH = {
  dmg: 10,            // crab T.pinch
  every: 0.5,         // s (crab T.pinchEvery)
  reach: 5,           // px past both bodies
  facing: 0.9,        // rad: must face it this well
  push: 20,           // crab's pinch push
  slowMul: 0.5,       // the pinched unit moves at half speed ...
  slowTime: 1,        // ... for 1 s (ocean slowUntil: scales its goal, the player's stick too)
  pose: 0.25,         // s: crab look.attack.time
};
function pinch(w, u, t) {
  const p = power(u), pass = strike(w, u, t, PINCH.dmg * p, PINCH.push * p, 0, PINCH.every, 'crab', 'pinch', false);
  const v = perchOf(w, t);
  if (pass > 0 && v.hp > 0) slowUntil(w, v, w.time + PINCH.slowTime, PINCH.slowMul);
}
registerWeapon({
  id: 'pinch', range: 0, def: lookOf(PINCH.pose),
  fight: nearFirst((u) => PINCH.reach * power(u), (w, u, t, dx, dy, d) => {
    if (d <= u.radius + t.radius + PINCH.reach * power(u) && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, u.face)) < PINCH.facing) pinch(w, u, t);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  possessFire(w, u, aim) {
    const v = u.cooldown <= 0 ? inReach(w, u, PINCH.reach * power(u), aim) : null;
    if (v) pinch(w, u, v); else emptySwing(w, u, 'crab', PINCH.every);
  },
});

// ================================================================ blades (mantis: two blades in turn + short lunge)
// from units/bugs/mantis.js slash() / lungeTo() / lunge()
const BLADE = {
  dmg: 14,            // per slash (mantis T.slash)
  every: 0.3,         // s between slashes, the arms take turns
  reach: 6,           // px past both bodies
  push: 30,           // mantis slash push
  stun: 0.05,         // s
  lungeMin: 30,       // px centre to centre (× power): lunges at a target this far ...
  lungeMax: 80,       // ... up to this far (× power)
  lungeTime: 0.3,     // s in the air
  lungeH: 16,         // px at the top of the arc (× power)
  lungeEvery: 2,      // s between lunges
  landGap: 2,         // px between the bodies where it lands
  lead: 0.24,         // s: aims where the target will be (mantis lungeTime × 0.8)
  pose: 0.25,         // s: mantis look.attack.time
};
function slash(w, u, t, bag) {
  bag.arm ^= 1; bag.slashT = w.time;   // the other arm this time
  const p = power(u);
  strike(w, u, t, BLADE.dmg * p, BLADE.push * p, BLADE.stun, BLADE.every, 'mantis', 'blades', false);
}
const canLunge = (u) => u.leaping === 0 && !(u.z > 1) && u.def.flies !== true && u.hurled !== 1;
function lungeTo(w, u, px, py, short, prey, bag) {
  const ex = px - u.x, ey = py - u.y, dd = hypot(ex, ey) || 0.001, f = Math.max(0, dd - short);
  bag.prey = prey; bag.t0 = w.time; bag.dx = ex / dd * f / BLADE.lungeTime; bag.dy = ey / dd * f / BLADE.lungeTime;
  bag.next = w.time + BLADE.lungeEvery; bag.lunging = 1;
  u.leaping = LEAP.FLY; u.heading = Math.atan2(ey, ex);
  act(w, u, ACT.LEAP); setState(u, STATE.CHARGE);
  w.emit('charge', { x: u.x, y: u.y, type: u.type, as: 'mantis' });
}
// every tick (also while the brain waits): the arc, then the landing (slashing at once)
function lungeStep(w, u, bag) {
  const f = (w.time - bag.t0) / BLADE.lungeTime;
  if (f < 1) {
    u.z = 4 * BLADE.lungeH * power(u) * f * (1 - f); u.vz = 0;
    u.vx = u.goalX = bag.dx; u.vy = u.goalY = bag.dy; u.face = Math.atan2(bag.dy, bag.dx);
    return;
  }
  bag.lunging = 0;
  u.z = 0; u.vz = 0; u.leaping = 0; u.vx *= 0.3; u.vy *= 0.3;
  if (u.b.act === ACT.LEAP) act(w, u, ACT.NONE);
  w.emit('land', { x: u.x, y: u.y, v: 0.4, type: u.type, as: 'mantis' });
  const v = (bag.prey >= 0 ? w.unitById(bag.prey) : null) || w.findNearest(u.x, u.y, u.radius + G.margin, ENEMY[u.faction], null, 0);
  bag.prey = -1;
  if (v && v.hp > 0 && zOk(u, v) && hypot(v.x - u.x, v.y - u.y) <= u.radius + v.radius + BLADE.reach * power(u) + 4) {
    u.face = Math.atan2(v.y - u.y, v.x - u.x);
    u.cooldown = 0; slash(w, u, v, bag);   // lands slashing
  }
}
registerWeapon({
  id: 'blades', range: 0, def: lookOf(BLADE.pose),
  init(w, u, bag) { bag.arm = u.id & 1; bag.slashT = -9; bag.next = 0; bag.t0 = 0; bag.dx = 0; bag.dy = 0; bag.prey = -1; bag.lunging = 0; },
  tick(w, u, bag) { if (bag.lunging === 1) lungeStep(w, u, bag); },
  busy(w, u, bag) {
    if (bag.lunging !== 1) return false;
    u.goalX = bag.dx; u.goalY = bag.dy; u.face = Math.atan2(bag.dy, bag.dx);
    return true;
  },
  fight: nearFirst((u) => BLADE.reach * power(u), (w, u, t, dx, dy, d, bag) => {
    const p = power(u);
    if (d <= u.radius + t.radius + BLADE.reach * p && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      if (u.cooldown <= 0) slash(w, u, t, bag);
      return;
    }
    if (w.time >= bag.next && d >= BLADE.lungeMin * p && d <= BLADE.lungeMax * p && clearLine(w, u) && grounded(t) && t.hurled !== 1 && canLunge(u)) {
      lungeTo(w, u, t.x + t.vx * BLADE.lead, t.y + t.vy * BLADE.lead, u.radius + t.radius + BLADE.landGap, t.id, bag);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  // possessed, attack at nobody: lunge at the aim point (30-80 px × power) and slash whoever is there, else a slash
  possessFire(w, u, aim, ax, ay, bag) {
    if (bag.lunging === 1) return;
    const p = power(u), v = u.cooldown <= 0 ? inReach(w, u, BLADE.reach * p, aim) : null;
    if (v) { slash(w, u, v, bag); return; }
    if (w.time >= bag.next && canLunge(u)) {
      const dx = ax - u.x, dy = ay - u.y, d = hypot(dx, dy) || 0.001, k = Math.max(BLADE.lungeMin * p, Math.min(BLADE.lungeMax * p, d)) / d;
      lungeTo(w, u, u.x + dx * k, u.y + dy * k, 0, -1, bag);
    } else if (u.cooldown <= 0) { bag.arm ^= 1; bag.slashT = w.time; emptySwing(w, u, 'mantis', BLADE.every); }
  },
  holdsNerve(w, u, bag) { return bag.lunging === 1; },   // no running off mid-lunge
});

// ================================================================ tail (stego: rear half-circle swipe, turns its back)
// from units/dinos/stego.js swipe() / brain
const TAIL = {
  every: 1.6,         // s between swipes
  reach: 34,          // px past its body (+ the enemy's): the tail's reach behind it (× power)
  dmg: 28,            // stego T.swipeDmg
  push: 220,          // push outward × pass (× power)
  stun: 0.3,          // s × pass
  tailTurn: 30,       // px (× power): a target this close to the reach and the swipe ready: turn the tail to it
  bite: 8,            // weak bite in front (stego T.bite) ...
  biteEvery: 1,       // ... every 1 s
  biteReach: 5,       // px past both bodies
  bitePush: 60,       // stego bite push
  biteStun: 0.1,      // s
  pose: 0.4,          // s: stego look.attack.time
};
// every enemy in the rear half-circle within reach, all hit at once
function swipe(w, u, bag) {
  const p = power(u), hx = Math.cos(u.heading), hy = Math.sin(u.heading), R = u.radius + TAIL.reach * p;
  const n = w.queryMask(u.x, u.y, R + G.margin, ENEMY[u.faction], Q, Q.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0 || !zOk(u, o) || high(o)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy);
    if (d > R + o.radius || dx * hx + dy * hy > 0) continue;
    HIT[m++] = o;
  }
  if (m === 0) return false;
  const tx = u.x - hx * u.radius, ty = u.y - hy * u.radius;
  let landed = 0;
  for (let k = 0; k < m; k++) {
    const o = HIT[k]; HIT[k] = null;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
    const pass = damage(w, o, TAIL.dmg * p, u, undefined, tx, ty);
    if (isRisen(u)) infect(w, o, u, 0.5 * pass, 0);
    if (o.hp > 0) push(w, o, dx / d, dy / d, TAIL.push * pass * p, TAIL.stun * pass);
    if (pass > 0) landed++;
  }
  bag.next = w.time + TAIL.every; bag.swipeT = w.time; u.attack = 1;
  w.emit('trample', { x: tx, y: ty, v: 1.4, type: u.type, as: 'stego' });
  if (landed > 0) used(w, u, 'tail');
  return true;
}
registerWeapon({
  id: 'tail', range: 0, def: lookOf(TAIL.pose),
  init(w, u, bag) { bag.next = 0; bag.swipeT = -9; },
  fight: nearFirst((u) => TAIL.biteReach * power(u), (w, u, t, dx, dy, d, bag) => {
    const p = power(u), ready = w.time >= bag.next;
    if (ready && canAuto(w, u)) swipe(w, u, bag);
    if (w.time >= bag.next && d <= u.radius + t.radius + (TAIL.reach + TAIL.tailTurn) * p) {   // turn the tail to it ...
      setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx) + Math.PI;
      backIn(u, t, dx, dy, d, TAIL.reach * p);   // ... and back into it (a gunman never walks onto the tail)
      return;
    }
    if (d <= u.radius + t.radius + TAIL.biteReach * p && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      if (u.cooldown <= 0) strike(w, u, t, TAIL.bite * p, TAIL.bitePush * p, TAIL.biteStun, TAIL.biteEvery, 'stego', 'tail', false);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  // possessed, attack at nobody: swing the tail anyway
  possessFire(w, u, aim, ax, ay, bag) {
    if (w.time < bag.next) return;
    if (!swipe(w, u, bag)) { bag.next = w.time + TAIL.every; bag.swipeT = w.time; u.attack = 1; w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, as: 'stego' }); }
  },
});

// ================================================================ tailclub (ankylo: launches what it hits)
// from units/dinos/ankylo.js club() / brain
const CLUB = {
  reach: 30,          // px past its body (+ the enemy's), × power
  side: 0.35,         // "behind or beside": cos(angle off its heading) below this
  dmg: 30,            // ankylo T.clubDmg
  launchUp: 260,      // upward toss speed × pass ...
  launchDist: 90,     // ... and how far (px × power) a man-sized victim flies (÷ √(mass / power²): heavier ones fly less)
  heavy: 8,           // victims this heavy (× power²) or more are only shoved
  shove: 300,         // push × pass (× power) for a heavy one ...
  shoveStun: 0.4,     // ... and stun × pass
  every: 2.2,         // s between clubs
  tailTurn: 30,       // px (× power): a target this close to the reach and the club ready: turn the tail to it
  butt: 10,           // head butt in front (ankylo T.butt) ...
  buttEvery: 1.2,     // ... every 1.2 s
  buttReach: 5,       // px past both bodies
  buttPush: 90,       // ankylo butt push
  buttStun: 0.2,      // s
  pose: 0.4,          // s: ankylo look.attack.time
};
function club(w, u, bag) {
  const p = power(u), hx = Math.cos(u.heading), hy = Math.sin(u.heading), R = u.radius + CLUB.reach * p;
  const n = w.queryMask(u.x, u.y, R + G.margin, ENEMY[u.faction], Q, Q.length);
  let best = null, bd = Infinity;
  for (let k = 0; k < n; k++) {
    const o = Q[k]; Q[k] = null;
    if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0 || !zOk(u, o) || high(o)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d > R + o.radius || (dx * hx + dy * hy) / d >= CLUB.side) continue;
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return false;
  const dx = best.x - u.x, dy = best.y - u.y, d = bd || 0.001;
  const pass = damage(w, best, CLUB.dmg * p, u, undefined, u.x - hx * u.radius, u.y - hy * u.radius);
  if (isRisen(u)) infect(w, best, u, 0.5 * pass, 0);
  if (best.hp > 0) {
    if (liftable(best, CLUB.heavy * p * p - 1e-9)) {
      const k = Math.sqrt(Math.max(1, best.mass / (p * p)));   // heavier (for its size): shorter flight
      lift(w, best, dx / d, dy / d, CLUB.launchDist * p * pass / k, CLUB.launchUp * pass, p);
    } else push(w, best, dx / d, dy / d, CLUB.shove * pass * p, CLUB.shoveStun * pass);
  }
  bag.next = w.time + CLUB.every; bag.clubT = w.time; bag.cx = best.x; bag.cy = best.y; u.attack = 1;
  w.emit('trample', { x: best.x, y: best.y, v: 1.6, type: u.type, as: 'ankylo' });
  if (pass > 0) used(w, u, 'tailclub');
  return true;
}
registerWeapon({
  id: 'tailclub', range: 0, def: lookOf(CLUB.pose),
  init(w, u, bag) { bag.next = 0; bag.clubT = -9; bag.cx = 0; bag.cy = 0; },
  fight: nearFirst((u) => CLUB.buttReach * power(u), (w, u, t, dx, dy, d, bag) => {
    const p = power(u);
    if (w.time >= bag.next && canAuto(w, u)) club(w, u, bag);
    if (w.time >= bag.next && d <= u.radius + t.radius + (CLUB.reach + CLUB.tailTurn) * p) {   // swing the tail round to it ...
      setState(u, STATE.ENGAGE); u.face = Math.atan2(dy, dx) + Math.PI;
      backIn(u, t, dx, dy, d, CLUB.reach * p);   // ... and back into it
      return;
    }
    if (d <= u.radius + t.radius + CLUB.buttReach * p && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, 0);
      if (u.cooldown <= 0) strike(w, u, t, CLUB.butt * p, CLUB.buttPush * p, CLUB.buttStun, CLUB.buttEvery, 'ankylo', 'tailclub', false);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  // possessed, attack at nobody: swing the club anyway
  possessFire(w, u, aim, ax, ay, bag) {
    if (w.time < bag.next) return;
    if (!club(w, u, bag)) { bag.next = w.time + CLUB.every; bag.clubT = w.time; bag.cx = u.x - Math.cos(u.heading) * u.radius * 2; bag.cy = u.y - Math.sin(u.heading) * u.radius * 2; u.attack = 1; w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, as: 'ankylo' }); }
  },
});

// ================================================================ sting (bee: poison 2 hp/s 3 s, stacks to 3)
// from units/bugs/bee.js sting(); the poison is bugs/_lib.js poison() (2 hp/s per stack, 3 s, up to 3 stacks)
const STING = {
  dmg: 6,             // bee T.sting (+ one poison stack when it gets through)
  every: 1,           // s between stings
  reach: 3,           // px past both bodies
  push: 6,            // a sting barely shoves
  through: 0.5,       // pass needed for the poison to go in (bee: pass >= 0.5)
  circle: 1,          // buzzes round the victim between stings (the bee's orbit = the shared melee circling)
  pose: 0.2,          // s: bee look.attack.time
};
function sting(w, u, t) {
  const v = perchOf(w, t), p = power(u);
  const pass = strike(w, u, t, STING.dmg * p, STING.push * p, 0, STING.every, 'bee', 'sting', false);
  if (pass >= STING.through) poison(w, v, u);
}
registerWeapon({
  id: 'sting', range: 0, def: lookOf(STING.pose),
  fight: nearFirst((u) => STING.reach * power(u), (w, u, t, dx, dy, d) => {
    if (d <= u.radius + t.radius + STING.reach * power(u) && zOk(u, t)) {
      engage(w, u, t, dx, dy, d, STING.circle);
      if (u.cooldown <= 0) sting(w, u, t);
      return;
    }
    chase(w, u, t, dx, dy, d);
  }),
  possessFire(w, u, aim) {
    const v = u.cooldown <= 0 ? inReach(w, u, STING.reach * power(u), aim) : null;
    if (v) sting(w, u, v); else emptySwing(w, u, 'bee', STING.every);
  },
});

export { BITE, JAWS, ZB, PECK, TUSK, HORN, PINCH, BLADE, TAIL, CLUB, STING };
