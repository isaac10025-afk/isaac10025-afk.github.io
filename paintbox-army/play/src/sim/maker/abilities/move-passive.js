// Unit maker: A-MOVE passives (OURS, Part 2 step 8, STEP8.md). Owner: A-MOVE. Imported by move.js.
// fireproof (lava golem), heavy (long-neck), lavatrail (lava golem), sneak (cheetah), skates (hockey). None of them has
// gear of its own except what ART-ABILITY paints (skates at the feet); no pose codes; no OVER art (lava patches are the
// lava golem's 'lava' effect projectile, drawn by its PROJ art in sprites-bosses.js).
// Bag fields the art may read (u.b.ab[slot]): sneak: hid (1 = hidden right now: seen only within ~90 px);
// skates: ice (1 = skating on ice this tick).
import { registerAbility } from '../registry.js';
import { used, power, DT, ENEMY, hypot, registerSystem } from '../lib.js';
import { lavaPatch } from '../../units/bosses/lavagolem.js';
import { bagOf, lists, peekLists, listAdd, listDrop } from './move-lib.js';

// ---------------------------------------------------------------- fireproof (lava golem's flammability 0)
const T_FIREPROOF = {
  lavaEvery: 1,     // s between counted lava steps (used) while it stands in lava
};
registerAbility({
  id: 'fireproof',
  def: { flammability: 0 },   // never catches fire; flames pass it (ballistics flameTest); lava terrain does nothing (lava.js)
  init(w, u, bag) { bag.next = 0; },
  // lava terrain under its feet: nothing happens (counted so the player's trick shows in the matrix)
  tick(w, u, bag) {
    const L = w.lava7;
    if (L === undefined || L.cells === 0 || w.time < bag.next || u.z > 2 || u.leaping !== 0) return;
    if (L.hotAt(w, u.x, u.y)) { bag.next = w.time + T_FIREPROOF.lavaEvery; used(w, u, 'fireproof'); }
  },
  // fire hits (lava patches, a fire dive, burning bursts): x0
  damageMul(w, u, amount, att, kind) {
    if (kind !== 'fire') return 1;
    if (amount > 0) used(w, u, 'fireproof');
    return 0;
  },
  // the kitchen-sink field has no fire: a lava strip between it and the foes + an enemy lava patch under it
  test: {
    setup(g, w, u, foes) {
      g.setTool({ kind: 'lava' }); g.setBrushRadius(30); g.paintBegin(450, 350); g.paintMove(620, 350); g.paintEnd();
      lavaPatch(w, foes[0].faction, foes[0], u.x, u.y, 30);
    },
  },
});

// ---------------------------------------------------------------- heavy (long-neck: untossable, barely pushed; mech: stuns)
const T_HEAVY = {
  mass: 3,          // x mass (STEP8)
  stunMin: 0.5,     // s: a stun shorter than this is ignored (STEP8)
  grip: 1.05,       // x its own accel per tick: velocity it can't make itself is a shove (refused)
  shove: 10,        // px/s: a refused shove bigger than this counts (used)
  ownLunge: 0.7,    // cos: a speed-up along its own goal is its own move (a lunge, a dash): kept
};
registerAbility({
  id: 'heavy',
  def: (d) => ({ mass: d.mass * T_HEAVY.mass, untossable: true }),   // can't be tossed (toss() pushes it a little instead)
  init(w, u, bag) { bag.vx = 0; bag.vy = 0; bag.stun = 0; bag.on = 0; },
  // every tick (before its brain): a new stun under 0.5 s is shrugged off; a push that sped it up past what its own legs
  // can do in a tick is taken back (pushes from other units' blows, blasts, shoves). Own moves (ability poses, leaps,
  // a lunge along its goal) are left alone.
  tick(w, u, bag) {
    if (!(u.hp > 0)) { bag.on = 0; return; }
    const now = w.time, floating = u.floating > now;
    const exp = bag.stun > DT ? bag.stun - DT : 0;   // brain.js has already taken this tick's dt off
    if (u.stun > exp + 1e-4 && u.stun < T_HEAVY.stunMin && !floating && u.hurled !== 1 && u.inside < 0) { u.stun = exp; used(w, u, 'heavy'); }
    bag.stun = u.stun;
    const free = !(u.z > 0) && !(u.vz > 0) && u.leaping === 0 && !(u.climb > 0) && u.inside < 0 && u.hurled !== 1 && !floating && u.b.act < 20;
    if (free && bag.on === 1) {
      const dvx = u.vx - bag.vx, dvy = u.vy - bag.vy, dv = hypot(dvx, dvy), lim = u.def.accel * DT * T_HEAVY.grip + 1;
      if (dv > lim && hypot(u.vx, u.vy) > hypot(bag.vx, bag.vy) + lim) {
        const g = hypot(u.goalX, u.goalY), along = g > 1 ? (dvx * u.goalX + dvy * u.goalY) / (dv * g) : -1;
        if (along < T_HEAVY.ownLunge) {
          const k = lim / dv;
          u.vx = bag.vx + dvx * k; u.vy = bag.vy + dvy * k;
          if (dv - lim > T_HEAVY.shove) used(w, u, 'heavy');
        }
      }
    }
    bag.vx = u.vx; bag.vy = u.vy; bag.on = free ? 1 : 0;
  },
});

// ---------------------------------------------------------------- lavatrail (lava golem: units/bosses/lavagolem.js trail)
// The patches are the golem's own (lavaPatch: effect projectile 'lava', 8 s, 15 hp/s + set alight): they spare its own
// side, as the golem's do (HITTABLE of the patch's faction), so the made unit and its side walk through unhurt.
const T_LAVA = {
  every: 0.5,       // s of walking per lava patch at the golem's pace (lava golem) ...
  space: 1.6,       // ... or one per this x patch radius walked, whichever comes first: a fast unit leaves a trail, not dots
  gap: 0.2,         // s: at least this between two patches (caps the patches a very fast unit lays)
  r: 16,            // px (x power): patch radius (golem's trail patch)
  walk: 6,          // px/s: moving faster than this counts as walking
  lowZ: 14,         // px: drips only this low (a hop's landing, a ghost's float, a flyer's dive; not from the sky)
  back: 0.4,        // x radius behind it: where the patch lands (its back foot)
};
registerAbility({
  id: 'lavatrail',
  init(w, u, bag) { bag.walked = 0; bag.dist = 0; bag.last = -1; },
  tick(w, u, bag) {
    if (!(u.hp > 0) || u.inside >= 0 || u.hurled === 1 || (u.hidden > 0 && u.hidden < 1)) return;   // hidden 0.001 = underground / held
    const sp = hypot(u.vx, u.vy);
    if (sp <= T_LAVA.walk) return;
    const r = T_LAVA.r * power(u) * (u.shrink || 1);
    bag.walked += DT; bag.dist += sp * DT;
    if ((bag.walked < T_LAVA.every && bag.dist < T_LAVA.space * r) || w.time - bag.last < T_LAVA.gap || u.z > T_LAVA.lowZ) return;
    bag.walked = 0; bag.dist = 0; bag.last = w.time;
    const k = u.radius * T_LAVA.back / sp;
    const p = lavaPatch(w, u.faction, u, u.x - u.vx * k, u.y - u.vy * k + u.radius * 0.3, r);
    if (p) used(w, u, 'lavatrail');
  },
});

// ---------------------------------------------------------------- sneak (cheetah's stalk: units/animals/cheetah.js + conceal.js)
const T_SNEAK = {
  stalk: 90,        // px: seen only this close (cheetah's def.stalk)
  behind: 0.5,      // x behind its target's facing (conceal.js stalk rule)
  wall: 25,         // px: behind a wall from its target (conceal.js stalk rule)
  reveal: 2,        // s: an attack shows it this long (the cheetah shows when it sprints)
  look: 360,        // px: how far it checks for an enemy that can't see it (used)
  every: 0.5,       // s between those checks
};
// After conceal (which rebuilds u.unseen every tick): a sneaking made unit is seen only within 90 px (45 from behind, 25
// behind a wall), unless it attacked in the last 2 s. The cheetah does this only while it stalks (Alert); a made unit's
// weapon brain never sets Alert, so the rule here is "hidden while it isn't attacking".
function sneakSys(w) {
  const s = peekLists(w);
  if (s === undefined || s.sneak.length === 0) return;
  const L = s.sneak, now = w.time;
  for (let k = L.length - 1; k >= 0; k--) {
    const u = w.unitById(L[k]), bag = u ? bagOf(u, 'sneak') : null;
    if (bag === null) { listDrop(L, k); continue; }
    if (!(u.hp > 0)) continue;
    if (u.attack > 0.5) bag.seen = now + T_SNEAK.reveal;
    if (now < bag.seen) { bag.hid = 0; continue; }
    let r = T_SNEAK.stalk;
    const t = u.target >= 0 ? w.unitById(u.target) : null;
    if (t) {
      const dx = u.x - t.x, dy = u.y - t.y, d = hypot(dx, dy) || 0.001;
      if ((dx * Math.cos(t.heading) + dy * Math.sin(t.heading)) / d <= -0.25) r *= T_SNEAK.behind;
      if (w.walls.count > 0 && !w.walls.lineOfSight(t.x, t.y, u.x, u.y)) r = Math.min(r, T_SNEAK.wall);
    }
    u.unseen = u.unseen > 0 ? Math.min(u.unseen, r) : r;
    u.unseenBySeers = u.unseenBySeers > 0 ? Math.min(u.unseenBySeers, r) : r;
    bag.hid = 1;
    if (now >= bag.next) {   // an enemy near enough to have seen it doesn't: the trick at work
      bag.next = now + T_SNEAK.every;
      const o = w.findNearest(u.x, u.y, T_SNEAK.look, ENEMY[u.faction], null, 0);
      if (o && hypot(o.x - u.x, o.y - u.y) > u.unseen) used(w, u, 'sneak');
    }
  }
}
registerSystem('mineSneak', sneakSys, 'conceal');
registerAbility({
  id: 'sneak',
  def: { stalk: T_SNEAK.stalk },   // strategy / navigation treat it as a stalker (a hidden one never gives its group away)
  init(w, u, bag) { bag.seen = 0; bag.next = 0; bag.hid = 0; listAdd(lists(w).sneak, u.id); },
});

// ---------------------------------------------------------------- skates (hockey: units/sports/hockey.js skate())
const T_SKATE = {
  iceMul: 1.86,     // x pace on ice (hockey: skates at 260 px/s, runs at 140)
  grip: 1,          // iceGrip: full control on ice (no sliding, no falls; OG people 0.2)
  stride: 0.5,      // s between counted strides (used)
};
// After the player's stick, before steering: on ice whatever pace the brain (or the stick) asked for, skating makes it x1.86.
function skateSys(w) {
  const s = peekLists(w);
  if (s === undefined || s.skate.length === 0) return;
  const L = s.skate, now = w.time;
  for (let k = L.length - 1; k >= 0; k--) {
    const u = w.unitById(L[k]), bag = u ? bagOf(u, 'skates') : null;
    if (bag === null) { listDrop(L, k); continue; }
    const on = w.iceCells > 0 && u.hp > 0 && !(u.z > 0) && u.leaping === 0 && w.iceAt(u.x, u.y) > 0;
    bag.ice = on ? 1 : 0;
    if (!on) continue;
    const g = hypot(u.goalX, u.goalY);
    if (g < 1) continue;
    const m = Math.max(1, Math.min(T_SKATE.iceMul, T_SKATE.iceMul * u.def.runSpeed / g));
    u.goalX *= m; u.goalY *= m;
    if (now >= bag.next) { bag.next = now + T_SKATE.stride; used(w, u, 'skates'); }
  }
}
registerSystem('mineSkate', skateSys, 'possessPost');
registerAbility({
  id: 'skates',
  def: (d) => ({ iceGrip: T_SKATE.grip, maxSpeed: Math.max(d.maxSpeed, d.runSpeed * T_SKATE.iceMul * 1.15) }),
  init(w, u, bag) { bag.ice = 0; bag.next = 0; listAdd(lists(w).skate, u.id); },
  test: { setup(g, w, u) { u.x = u.px = u.homeX = 505; u.y = u.py = u.homeY = 120; } },   // starts on the kitchen-sink ice strip
});

export { T_FIREPROOF, T_HEAVY, T_LAVA, T_SNEAK, T_SKATE };
