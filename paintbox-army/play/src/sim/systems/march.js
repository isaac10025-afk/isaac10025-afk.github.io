// March: battles that never end (OURS, PLAN Part 2 decision H; user pick "fix it").
// In 16 of OG's own 66 test matchups some battles never end (OG checker, 12 battles each: necros hang back, flamers and
// snipers hold, gators sit, dragons circle). Rule (PLAN: "a side that hasn't fought for 20 s marches at the enemy"): when
// hostile units are on the field and a side (faction; in Team battle = team) has not dealt damage or fired for
// MARCH.after seconds, and nothing was painted, its units march: one with a target walks at it until it's in reach
// (flamers and snipers that face off out of range), one without walks at the nearest enemy unit anywhere (necros are
// seen only within 60 px; gators that sit on land). Still no damage 10 s later: they walk up and scuffle (small hits that
// don't reset the clock): two fireproof flamer armies or two necro armies can't hurt each other any other way. Flow field around walls, same as OG's own moveTo. Damage dealt or a shot by that side ends its march and its units'
// own brains take over again; if it goes quiet for another MARCH.after seconds, it marches again.
// Off unless the world has `march > 0` (createGame({ march: true }); main.js turns it on), so every test and the OG
// checker keep OG's behaviour.
import { STATE, LEAP, setState } from '../const.js';
import { ENEMY, F, FACTION_COUNT, maskHas } from '../factions.js';
import { moveTo } from './navigation.js';
import { damage } from '../combat/damage.js';

export const MARCH = {
  after: 20,        // s with no shot, no hit and no painting before a march
  every: 15,        // ticks between checks (OG strategy cadence)
  far: 4000,        // px: how far a target-less marcher looks for the nearest enemy (the whole field)
  inRange: 0.85,    // a gunner with a target walks until the target is within 0.85 x its weapon range
  melee: 12,        // a fighter without a gun walks until it touches its target (+12 px)
  scuffleAfter: 10, // s of marching with still no damage dealt: walk up to the target and scuffle
  touch: 4,         // px between bodies for a scuffle
  bash: 6,          // scuffle damage (a tank, a staff, a fist: two fireproof flamer armies used to stare forever)
  bashEvery: 0.8,   // s between a unit's scuffle hits
};


// Per side (faction; in Team battle = team): the last time one of its units dealt damage (damage.js), fired a gun, or
// anything was painted. A side quiet for MARCH.after s marches; quiet MARCH.scuffleAfter s more: it scuffles.
function quietCheck(world) {
  const q = world.marchQuiet, ba = world.blowAt, us = world.units;
  for (let f = 0; f < FACTION_COUNT; f++) { if (ba[f] > q[f]) q[f] = ba[f]; if (world.lastPaintAt > q[f]) q[f] = world.lastPaintAt; }
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.dead && u.firedAt > q[u.faction]) q[u.faction] = u.firedAt; }
  let any = 0;
  for (let f = 0; f < FACTION_COUNT; f++) {
    const quiet = world.time - q[f];
    world.marchFac[f] = quiet >= MARCH.after + MARCH.scuffleAfter ? 2 : quiet >= MARCH.after ? 1 : 0;
    if (world.marchFac[f]) any = 1;
  }
  return any === 1;
}

// Is there anyone a quiet side could march at? Live units per faction, then any quiet faction with a live enemy faction.
const live = new Int32Array(FACTION_COUNT);
function anyEnemy(world) {
  live.fill(0);
  const us = world.units;
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.dead && u.hp > 0) live[u.faction]++; }
  let any = false;
  for (let f = 0; f < FACTION_COUNT; f++) {
    if (world.marchFac[f] === 0 || live[f] === 0) { world.marchFac[f] = 0; continue; }
    let e = false;
    for (let g = 0; g < FACTION_COUNT && !e; g++) if (live[g] > 0 && maskHas(ENEMY[f], g) === 1) e = true;
    if (e) any = true; else world.marchFac[f] = 0;
  }
  return any;
}

// Per unit slot (u.index): the enemy a target-less marcher walks at, refreshed on check ticks.
function slots(world, name, fill, Arr) {
  let a = world[name], n = world.units.length + 1;
  for (let i = 0; i < world.units.length; i++) if (world.units[i].index >= n) n = world.units[i].index + 1;
  if (!a || a.length < n) { const b = new Arr(Math.max(n, 2 * (a ? a.length : 64))).fill(fill); if (a) b.set(a); world[name] = a = b; }
  return a;
}

// STEP7 lead (MAPS agent's ask, 11-16): a sniper or ape up a tree never marched (climb > 0 is skipped), so tree-heavy maps
// stalled for good (castle: 12 perched snipers still sitting at 240 s). Their own climb-down paths do it: the sniper's
// "no target for 8 s" timer (sniper.js perchStep) and the ape's climb-down timer (ape.js treeStep, b.timer < 0). One
// still walking to its tree drops the claim and marches. Others with a perch (siege tower climbers) keep it.
// true = leave this unit alone this tick.
const SNIPERS = new Set(['sniper', 'risen_sniper']), APES = new Set(['ape', 'risen_ape']);
function comeDown(world, u) {
  const b = u.b;
  if (SNIPERS.has(u.type)) {
    if (u.climb > 0) { if (b && (!(b.perchTimer > 0) || world.time - b.perchTimer <= 8)) b.perchTimer = world.time - 8.5; return true; }
    u.perch = -1; return false;
  }
  if (APES.has(u.type)) {
    if (u.climb > 0) { if (b) b.timer = -1; return true; }
    u.perch = -1; return false;
  }
  return u.climb > 0;
}

export function run(world) {
  if (!(world.march > 0)) return;
  if (!world.marchQuiet) { world.marchQuiet = new Float64Array(FACTION_COUNT); world.marchFac = new Uint8Array(FACTION_COUNT); world.blowAt = new Float64Array(FACTION_COUNT).fill(-1e9); }
  if (world.holding || world.marchQuietAt === undefined) { world.marchQuietAt = world.time; world.marchQuiet.fill(world.time); world.marchFac.fill(0); world.marching = 0; return; }
  const check = world.tick % MARCH.every === 0;
  if (check) world.marching = quietCheck(world) && anyEnemy(world) ? 1 : 0;
  if (world.marching !== 1) return;
  const us = world.units, P = world.possess, pid = P ? P.id : -1, fac = world.marchFac;
  const clock = slots(world, '_marchBash', -1e9, Float64Array), aim = slots(world, '_marchAim', -1, Int32Array);
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || !(u.hp > 0) || u.id === pid || u.state === STATE.FLEE || u.index < 0 || fac[u.faction] === 0) continue;
    if ((u.climb > 0 || u.perch >= 0) && comeDown(world, u)) continue;   // step 7: tree sitters come down first
    // attack L1 11-16: flyers (leaping FLY: bees, mosquitoes, drones...) march too. They used to be skipped with the units
    // mid-vault, so two swarms that never saw each other (bee v bee, mosquito v mosquito, bee v mosquito) idled for good.
    if (u.stun > 0 || u.climb > 0 || (u.leaping > 0 && u.leaping !== LEAP.FLY) || u.faction === F.Props || u.faction === F.Strays) continue;
    const scuffle = fac[u.faction] === 2;
    const d = u.def, speed = d.walkSpeed > 0 ? d.walkSpeed : d.runSpeed, k = u.index;
    if (!(speed > 0)) continue;
    let t = u.target >= 0 ? world.unitById(u.target) : null, own = true;
    if (!t || t.dead || !(t.hp > 0)) {
      // no target of its own (can't see anyone: necros lurk, gators sit): the nearest enemy anywhere, looked up on check ticks
      own = false;
      if (check || aim[k] < 0) { const n = world.findNearest(u.x, u.y, MARCH.far, ENEMY[u.faction], u, 0); aim[k] = n ? n.id : -1; }
      t = aim[k] >= 0 ? world.unitById(aim[k]) : null;
      if (!t || t.dead || !(t.hp > 0)) { aim[k] = -1; continue; }
    }
    // close in until it's in reach, then the unit's own brain decides; still no damage MARCH.scuffleAfter s later: walk up
    // to it and scuffle
    const touch = u.radius + t.radius + MARCH.touch;
    const reach = scuffle || !own ? touch : d.weapon && d.weapon.range > 0 ? MARCH.inRange * d.weapon.range : u.radius + t.radius + MARCH.melee;
    const dx = t.x - u.x, dy = t.y - u.y, d2 = dx * dx + dy * dy;
    if (d2 <= touch * touch) {
      if (scuffle && world.time - clock[k] >= MARCH.bashEvery) {
        clock[k] = world.time;
        const keep = world.lastBlow, keepF = world.blowAt[u.faction];
        damage(world, t, MARCH.bash, u, 'blow');
        world.lastBlow = keep; world.blowAt[u.faction] = keepF;   // a scuffle doesn't count as the fight starting again
        u.attack = 1; u.face = Math.atan2(dy, dx);
        world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
      }
      continue;
    }
    if (d2 <= reach * reach) continue;
    // attack 3 L2 (11-18): a unit whose own brain already closes on its own target at least as fast as the march would
    // (a trike's charge at 210 px/s, a raptor running in) keeps its brain's goal. The march used to overwrite it with the
    // walk speed every tick: a trike walked at 40 px/s behind a rifleman backing off at 45, its charge died on the stall
    // check, and the battle never ended (trike v rifle 1v1 / 9 trikes v 1 rifle, every seed). The march still drives
    // units that hold back, circle or back away (no goal toward the target).
    if (own && !scuffle) {
      const dd = Math.sqrt(d2) || 1, toward = (u.goalX * dx + u.goalY * dy) / dd;
      if (toward >= speed) continue;
    }
    u.proneWant = 0; if (u.b && u.b.proneWant === 1) u.b.proneWant = 0;   // a prone sniper gets up (it can't crawl)
    if (u.state !== STATE.ENGAGE) setState(u, STATE.ADVANCE);
    moveTo(world, u, t.x, t.y, speed, false);
  }
}
