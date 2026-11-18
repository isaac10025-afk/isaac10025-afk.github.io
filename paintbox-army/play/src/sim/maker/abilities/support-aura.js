// Unit maker A-SUPPORT: rally, heal, dome, scare (OURS, Part 2 step 8, STEP8.md). Owner: A-SUPPORT.
// Each = the source unit's trick on any body + any weapon; areas × power(u) (the size step). Bag fields the art reads
// are listed in support.js.
import { registerAbility } from '../registry.js';
import {
  ACT, power, used, STATE, DT, hypot, ENEMY, INT, setState, spawnProjectile, removeProjectile, registerProjectileKind,
  registerSystem, hittable, ownerOf, explode, fleeFor,
} from '../lib.js';
import { maskBit, canHit } from '../../factions.js';
import { onWorldClear } from '../../world.js';
import { UNIT_CAP } from '../../const.js';
import { moveTo } from '../../systems/navigation.js';
import { DOME } from '../../combat/ballistics.js';
import { spark } from '../../combat/index.js';
import { pose, unpose, poseFor, slotOf, MARGIN, Q } from './support-lib.js';

// ================================================================ rally (from units/pirates/captain.js aura)
const RALLY = {
  r: 160,          // px × power: allies of its side this close ...
  hold: 0.6,       // ... keep morale at least this high (they can't break or flee) ...
  speed: 1.15,     // ... and move this much faster (the captain's aura)
  deathR: 200,     // px × power: when it dies, allies this close ...
  deathMorale: 0.3,// ... lose this much morale (captain onDeath)
  shout: 1,        // s of the rally shout (ACT.ROAR) ...
  quiet: 4,        // ... on the first sight of the enemy after this long with no target (captain rally)
  shoutAt: 60,     // px: no shout with the enemy already this close
};
// Per world: the rally units and the speed boosts it handed out, by unit index (typed arrays: an
// ally's boost is on while `who[index]` = its id; the list holds the indexes that are on). Pirates use their own aura
// fields (their prelude rewrites speedMul every brain tick: captain.js b.aura / b.auraMul).
const RS = new WeakMap();
function rallyStore(w) {
  let s = RS.get(w);
  if (s === undefined) { s = { us: [], who: new Int32Array(UNIT_CAP).fill(-1), at: new Int32Array(UNIT_CAP), list: new Int32Array(UNIT_CAP), n: 0 }; RS.set(w, s); }
  return s;
}
onWorldClear((w) => { const s = RS.get(w); if (s) { s.us.length = 0; s.who.fill(-1); s.n = 0; } });
// every tick after morale, before the brains (as the captain's 'pirates-aura')
function rallyRun(w) {
  const s = RS.get(w); if (s === undefined) return;
  const us = s.us, tick = w.tick;
  for (let i = us.length - 1; i >= 0; i--) {
    const u = us[i];
    if (u.dead) { us[i] = us[us.length - 1]; us.pop(); continue; }
    if (!(u.hp > 0) || w.holding || u.inside >= 0) continue;
    const n = w.queryMask(u.x, u.y, RALLY.r * power(u), maskBit(u.faction), Q, Q.length);
    let did = 0;
    for (let k = 0; k < n; k++) {
      const o = Q[k]; Q[k] = null;
      if (o.dead || !(o.hp > 0) || o.def.prop || o.inside >= 0) continue;
      if (o.def.pirate === true) { o.b.aura = tick; o.b.auraMul = RALLY.speed; }
      else {
        const ix = o.index;
        if (s.who[ix] !== o.id) {
          if (s.who[ix] < 0) s.list[s.n++] = ix;   // (a gone unit's stale slot is already listed)
          s.who[ix] = o.id; o.speedMul *= RALLY.speed;
          if (o !== u) did = 1;
        }
        s.at[ix] = tick;
      }
      if (o.morale < RALLY.hold) { o.morale = RALLY.hold; if (o !== u) did = 1; }
      if (o.state === STATE.FLEE && o.possessed !== 1) { setState(o, STATE.IDLE); if (o !== u) did = 1; }
    }
    if (did === 1) used(w, u, 'rally');
  }
  for (let k = s.n - 1; k >= 0; k--) {   // boosts not renewed this tick end
    const ix = s.list[k];
    if (s.at[ix] === tick && s.who[ix] >= 0) continue;
    const o = w.unitById(s.who[ix]);
    if (o && o.index === ix) o.speedMul /= RALLY.speed;
    s.who[ix] = -1; s.list[k] = s.list[--s.n];
  }
}
registerSystem('maker-rally', rallyRun, 'morale');

registerAbility({
  id: 'rally',
  init(w, u, bag) {
    bag.pc = 0; bag.pt = 0; bag.quiet = RALLY.quiet; bag.shoutT = -9;
    rallyStore(w).us.push(u);
  },
  tick(w, u, bag) { if (u.target < 0) bag.quiet += DT; poseFor(w, u, bag, RALLY.shout); },
  // first sight of the enemy after a quiet spell: the rally shout (captain: sword up + 'charge')
  act(w, u, t, dx, dy, d, bag) {
    if (bag.quiet >= RALLY.quiet && d > RALLY.shoutAt) {
      pose(w, u, bag, ACT.ROAR); bag.shoutT = w.time;
      w.emit('charge', { x: u.x, y: u.y, v: 1, type: u.type, as: 'captain' });
    }
    bag.quiet = 0;
    return false;
  },
  onDeath(w, u) {   // its side loses heart
    const n = w.queryMask(u.x, u.y, RALLY.deathR * power(u), maskBit(u.faction), Q, Q.length);
    for (let k = 0; k < n; k++) { const o = Q[k]; Q[k] = null; if (o !== u && o.hp > 0 && o.def.morale && o.def.morale.canBreak) o.morale = Math.max(0, o.morale - RALLY.deathMorale); }
  },
  // the matrix field has no allies: two riflemen of its side stand by it
  test: { setup(g, w, u) { for (let k = 0; k < 2; k++) w.spawn('rifle', u.x - 30, u.y - 25 + 50 * k, { team: u.team }); }, within: 10 },
});

// ================================================================ heal (from units/robots/repairbot.js, for ANY ally)
const HEAL = {
  heal: 25,        // hp/s to the patient (the repair bot's weld)
  reach: 40,       // px between the bodies × power: healing reach
  keep: 14,        // px between the bodies it closes to
  seekR: 300,      // px: looks this far for the most hurt ally of its side
  seekEvery: 20,   // ticks between patient searches
  switchBy: 0.15,  // a new patient must be this much more hurt (hp fraction) to switch
  foeR: 150,       // px: with an enemy this close it fights (weapon) instead of going to heal
  foeEvery: 6,     // ticks between enemy checks
  sparkEvery: 10,  // ticks between heal sparks (the repair bot's 'weld' event)
  far: 60,         // px gap: farther than this it runs to the patient, closer it walks in
};
let _hu = null, _hp = null, _hf = 0;
function hurtOne(o) {
  const u = _hu;
  if (o === u || o.dead || !(o.hp > 0) || o.def.prop || o.faction !== u.faction || o.inside >= 0) return;
  const f = o.hp / o.maxHp;
  if (f >= 0.999 || f >= _hf) return;
  if (hypot(o.x - u.x, o.y - u.y) > HEAL.seekR) return;
  _hf = f; _hp = o;
}
function patientOk(u, o) { return !!o && o !== u && !o.dead && o.hp > 0 && o.hp < o.maxHp && o.faction === u.faction && !o.def.prop && o.inside < 0; }
function seekPatient(w, u, bag) {
  const cur = bag.patient >= 0 ? w.unitById(bag.patient) : null, ok = patientOk(u, cur);
  _hu = u; _hp = null; _hf = ok ? cur.hp / cur.maxHp - HEAL.switchBy : 0.999;
  w.query(u.x, u.y, HEAL.seekR, hurtOne, maskBit(u.faction));
  const p = _hp; _hu = null; _hp = null;
  if (p) bag.patient = p.id; else if (!ok) bag.patient = -1;
}
// walk to the patient and stay by it (true = it drove the unit)
function goHeal(w, u, bag) {
  const p = bag.patient >= 0 ? w.unitById(bag.patient) : null;
  if (!patientOk(u, p)) return false;
  const dx = p.x - u.x, dy = p.y - u.y, d = hypot(dx, dy) || 0.001, gap = d - u.radius - p.radius;
  setState(u, bag.healing === 1 ? STATE.ENGAGE : STATE.ADVANCE);
  if (gap > HEAL.keep) {
    const sp = gap > HEAL.far ? u.def.runSpeed : Math.max(20, Math.min(u.def.walkSpeed, 3 * gap));
    moveTo(w, u, p.x, p.y, sp, w.walls.count === 0 || w.lineOfSight(u.x, u.y, p.x, p.y));
  }
  u.face = Math.atan2(dy, dx); u.pathing = 1;
  if (bag.healing === 1) pose(w, u, bag, ACT.CHANNEL);
  return true;
}
registerAbility({
  id: 'heal',
  init(w, u, bag) { bag.patient = -1; bag.healing = 0; bag.foe = 0; bag.pc = 0; bag.pt = 0; },
  // every tick: find the patient, heal it while it is in reach (also mid-fight), watch for enemies close by
  tick(w, u, bag) {
    bag.healing = 0;
    if (!(u.hp > 0) || u.stun > 0 || u.inside >= 0) { if (bag.pc === ACT.CHANNEL) unpose(w, u, bag); return; }
    const t = w.tick + u.index;
    if (t % HEAL.foeEvery === 0) bag.foe = w.findNearest(u.x, u.y, HEAL.foeR, ENEMY[u.faction], u, 1) ? 1 : 0;
    if (bag.patient < 0 || t % HEAL.seekEvery === 0) seekPatient(w, u, bag);
    const p = bag.patient >= 0 ? w.unitById(bag.patient) : null;
    if (!patientOk(u, p)) bag.patient = -1;
    else if (hypot(p.x - u.x, p.y - u.y) - u.radius - p.radius <= HEAL.reach * power(u)) {
      p.hp = Math.min(p.maxHp, p.hp + HEAL.heal * DT);
      bag.healing = 1;
      used(w, u, 'heal');
      if (t % HEAL.sparkEvery === 0) {
        const a = Math.atan2(u.y - p.y, u.x - p.x);
        w.emit('weld', { x: p.x + Math.cos(a) * p.radius, y: p.y + Math.sin(a) * p.radius, type: u.type, id: u.id, patient: p.id, as: 'repairbot' });
      }
    }
    if (bag.healing === 0 && bag.pc === ACT.CHANNEL) unpose(w, u, bag);
  },
  // a target, but no enemy within 150 px: go and heal (the weapon waits); driven by the player: only what it stands by
  act(w, u, t, dx, dy, d, bag) { return bag.foe === 0 && u.possessed !== 1 && goHeal(w, u, bag); },
  idle(w, u, bag) { return u.possessed !== 1 && goHeal(w, u, bag); },
  // the matrix field has nobody hurt on its side: a rifleman of its side at 30 % hp stands near it
  test: { setup(g, w, u) { const a = w.spawn('rifle', u.x - 60, u.y + 20, { team: u.team }); if (a) a.hp = a.maxHp * 0.3; }, within: 10 },
});

// ================================================================ dome (from units/robots/shieldbot.js)
const DOME_T = {
  r: 70,           // px × power: dome radius
  hp: 400,         // dome hit points
  regrow: 40,      // hp/s the dome regrows ...
  regrowAfter: 3,  // ... once this long without a hit (s)
  broken: 6,       // s the dome is down after it breaks
  sense: 320,      // px: enemies this close raise the dome
  senseEvery: 8,   // ticks between enemy checks
  senseHold: 0.6,  // s the dome stays up after the last enemy was seen in range
  minCost: 1,      // a stopped shot costs the dome at least this
  slowShot: 60,    // px/s: slower projectiles (drifting clouds, patches, effects) are not shots
};
// Per world: the made units whose dome is up (+ their bags).
const DS = new WeakMap();
function domeList(w) { let L = DS.get(w); if (L === undefined) { L = { us: [], bags: [] }; DS.set(w, L); } return L; }
onWorldClear((w) => { const L = DS.get(w); if (L) { L.us.length = 0; L.bags.length = 0; } });
function domeOn(u, bag) { return !u.dead && u.hp > 0 && bag.up === 1; }
function mineLive(w) {
  const L = DS.get(w); if (L === undefined || L.us.length === 0) return false;
  const us = L.us, bs = L.bags;
  for (let i = us.length - 1; i >= 0; i--) if (!domeOn(us[i], bs[i])) { us[i] = us[us.length - 1]; us.pop(); bs[i] = bs[bs.length - 1]; bs.pop(); }
  return us.length > 0;
}
// shieldbot's stopShot with each dome's own radius / hp (its bag): p crossing into an enemy dome this tick stops at the
// edge (removed). Effect projectiles (they follow a unit or sit on the floor) always pass (shieldbot PASS + ours).
const PASS = new Set(['dome', 'minedome', 'bubble', 'mind', 'webon', 'webpatch', 'gas', 'ink', 'lava', 'iceblock', 'lasso']);
function mineStop(w, p, i) {
  if (PASS.has(p.kind)) return false;
  const vx = p.vx, vy = p.vy;
  if (vx * vx + vy * vy < DOME_T.slowShot * DOME_T.slowShot) return false;
  const L = DS.get(w), x0 = p.x, y0 = p.y, dx = vx * DT, dy = vy * DT, a = dx * dx + dy * dy;
  for (let k = 0; k < L.us.length; k++) {
    const o = L.us[k], bag = L.bags[k];
    if (!domeOn(o, bag)) continue;
    const R = bag.r, fx = x0 - o.x, fy = y0 - o.y, f2 = fx * fx + fy * fy, reach = R + Math.abs(dx) + Math.abs(dy);
    if (f2 > reach * reach || f2 <= R * R) continue;               // too far to reach it this tick / already inside
    const hb = fx * dx + fy * dy;
    if (hb >= 0) continue;                                         // moving away
    const disc = hb * hb - a * (f2 - R * R);
    if (disc < 0) continue;
    const t1 = (-hb - Math.sqrt(disc)) / a;
    if (t1 > 1 || !hittable(p, o)) continue;
    const ex = x0 + dx * t1, ey = y0 + dy * t1;
    hitDome(w, o, bag, p.damage, ex, ey);
    if (p.blast) explode(w, ex, ey, p.blast, ownerOf(w, p), p.damage);
    else spark(w, ex, ey, Math.atan2(-dy, -dx) + 0.8 * (w.rng() - 0.5), 0.8);
    removeProjectile(w, i);
    return true;
  }
  return false;
}
function hitDome(w, o, bag, dmg, x, y) {
  bag.hp -= Math.max(DOME_T.minCost, dmg || 0); bag.hit = w.time; bag.hitAt = w.time;
  used(w, o, 'dome');
  w.emit('block', { x, y, v: 1, type: o.type, dome: 1, as: 'shieldbot' });
  if (bag.hp > 0) return;
  bag.hp = 0; bag.brokenUntil = w.time + DOME_T.broken;
  domeDown(w, o, bag);
  w.emit('domebreak', { x: o.x, y: o.y, r: bag.r, type: o.type, id: o.id, as: 'shieldbot' });
}
// The ballistics DOME hook holds one live / stop pair (shieldbot.js set it): ours wraps whatever is there, installed the
// first time a made dome unit spawns (any import order). Nothing up = one WeakMap miss per tick.
let prevLive = null, prevStop = null, prevOn = false, mineOn = false;
function liveAll(w) { prevOn = prevLive !== null && prevLive(w) === true; mineOn = mineLive(w); return prevOn || mineOn; }
function stopAll(w, p, i) { if (prevOn && prevStop !== null && prevStop(w, p, i) === true) return true; return mineOn && mineStop(w, p, i); }
function installDome() { if (DOME.live === liveAll) return; prevLive = DOME.live; prevStop = DOME.stop; DOME.live = liveAll; DOME.stop = stopAll; }

// the dome effect projectile 'minedome' (art: fx-mine-support.js, the shield bot's dome look): follows its unit; p.r
// radius px, p.k dome hp 0..1, p.hitT s since the last block (flash)
function stepDome(w, p, i) {
  const o = p.owner >= 0 ? w.unitById(p.owner) : null, bag = o && o.b.ab ? o.b.ab[p.slot] : null;
  if (!o || !bag || !domeOn(o, bag) || bag.gen !== p.gen) { removeProjectile(w, i); return; }
  p.px = p.x; p.py = p.y; p.x = o.x; p.y = o.y;
  p.r = bag.r; p.k = bag.hp / DOME_T.hp; p.hitT = w.time - bag.hitAt; p.life = 1;
}
registerProjectileKind('minedome', stepDome);
function domeUp(w, u, bag) {
  bag.up = 1; bag.gen++;
  const L = domeList(w); L.us.push(u); L.bags.push(bag);
  const p = spawnProjectile(w, 'minedome', u.x, u.y, 0, 0, 1, 0, u.faction, u);
  if (p) { p.slot = bag.slot; p.gen = bag.gen; p.r = bag.r; p.k = bag.hp / DOME_T.hp; p.hitT = 9; }
  w.emit('dome', { x: u.x, y: u.y, r: bag.r, type: u.type, id: u.id, up: 1, as: 'shieldbot' });
}
function domeDown(w, u, bag) {
  if (bag.up !== 1) return;
  bag.up = 0;
  w.emit('dome', { x: u.x, y: u.y, r: bag.r, type: u.type, id: u.id, up: 0, as: 'shieldbot' });
}
registerAbility({
  id: 'dome',
  init(w, u, bag) {
    bag.up = 0; bag.hp = DOME_T.hp; bag.hit = -1e9; bag.hitAt = -1e9; bag.brokenUntil = -1e9; bag.seen = -1e9; bag.gen = 0;
    bag.r = DOME_T.r * power(u); bag.slot = slotOf(u, bag);
    installDome();
  },
  // every tick, stunned or not (shieldbot domeTick): regrow, sense enemies, raise / drop
  tick(w, u, bag) {
    const now = w.time;
    if (!(u.hp > 0) || u.inside >= 0) { domeDown(w, u, bag); return; }
    if (now >= bag.brokenUntil && now - bag.hit >= DOME_T.regrowAfter && bag.hp < DOME_T.hp) bag.hp = Math.min(DOME_T.hp, bag.hp + DOME_T.regrow * DT);
    if ((w.tick + u.index) % DOME_T.senseEvery === 0 && w.findNearest(u.x, u.y, DOME_T.sense, ENEMY[u.faction], null, 1)) bag.seen = now;
    const want = now - bag.seen < DOME_T.senseHold && now >= bag.brokenUntil && bag.hp > 0;
    if (want && bag.up !== 1) domeUp(w, u, bag);
    else if (!want && bag.up === 1) domeDown(w, u, bag);
  },
  onDeath(w, u, cause, killer, bag) { domeDown(w, u, bag); },
});

// ================================================================ scare (from units/secret/scarecrow.js scare())
const SCARE = {
  r: 150,          // px × power: Animal-intelligence enemies this close (edge) ...
  every: 1,        // ... are checked this often (s) ...
  flee: 2.5,       // ... and run this long (dinos fleeFor) ...
  morale: 0.2,     // ... losing this much morale
};
let _su = null, _sw = null, _sn = 0;
function frightOne(o) {
  const u = _su;
  if (o.dead || !(o.hp > 0) || o.inside >= 0 || o.def.prop || o.def.boss || o.def.intelligence !== INT.Animal || o.possessed === 1 || !canHit(u, o)) return;
  if (hypot(o.x - u.x, o.y - u.y) - o.radius > SCARE.r * power(u)) return;
  fleeFor(_sw, o, SCARE.flee, u.x, u.y);
  const m = o.def.morale;
  if (m && m.canBreak) o.morale = Math.max(0, o.morale - SCARE.morale);
  _sn++;
}
registerAbility({
  id: 'scare',
  init(w, u, bag) { bag.next = w.time + w.rng() * SCARE.every; },
  // its look alone scares animals: an aura, every second (also stunned or driven), as the scarecrow's
  tick(w, u, bag) {
    if (w.time < bag.next || !(u.hp > 0) || u.inside >= 0) return;
    bag.next = w.time + SCARE.every;
    _su = u; _sw = w; _sn = 0;
    w.query(u.x, u.y, SCARE.r * power(u) + MARGIN, frightOne, ENEMY[u.faction]);
    const n = _sn; _su = null; _sw = null;
    if (n > 0) { used(w, u, 'scare'); w.emit('roar', { x: u.x, y: u.y, v: 0.4, type: u.type, scare: 1, as: 'scarecrow' }); }
  },
  // the matrix field's boar is its only animal: a gun can drop it before it comes near, so it starts 130 px away
  test: { setup(g, w, u, foes) { const b = foes.find((f) => f && f.type === 'boar'); if (b) { b.x = b.px = u.x + 130; b.y = b.py = u.y + 40; } }, within: 10 },
});

export { RALLY, HEAL, DOME_T, SCARE };
