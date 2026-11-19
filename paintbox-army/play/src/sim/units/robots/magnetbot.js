// magnetbot (OURS, Robots tab): a suicide unit. Walks at the enemy; when a metal enemy is within 260 px (or any enemy
// within 120) it plants itself and charges 1 s, then PULLS every metal unit within 260 px toward itself for 1.5 s (friends
// too, at a third of the pull; mass ≤ 20; strong on light ones, weak on heavy ones: knights skid in, a mech barely creeps), then it POPS: blast
// r 60, 90 dmg, toss. Killed before it pops = it pops at half power where it fell.
// METAL (STEP6 shared rule: magnet pull, eel shock ×2, laser no fire): every def with `metal: true` (all robots, UFO,
// giant mech) plus the OG / step-4 types in METAL_TYPES below (and their risen copies). Other tabs: import { isMetal }.
// b.act: 1 charge → `charge`; 2 pull → `pull` (arms up, coils glow); the art reads b.pullR (px) for the field lines.
import { robot, initB, setAct, begin, shortOut, targetOf, idle, closeOn, mayAttack, blowUp, spentMul, hypot, STATE, DT, CB, ENEMY, setState, ROBOT } from './_lib.js';
import { ALL_MASK, isHostile, maskBit } from '../../factions.js';

export const METAL_TYPES = new Set(['knight', 'cavalry', 'legion', 'shieldwall', 'halberd', 'cannon']);
/** Is u metal (armour, steel)? Robots, UFO, giant mech (def.metal) + METAL_TYPES and their risen copies. */
export function isMetal(u) {
  const d = u.def;
  return d.metal === true || METAL_TYPES.has(u.type) || (d.risenFrom !== undefined && METAL_TYPES.has(d.risenFrom));
}

const T = {
  hp: 160, // hit points
  mass: 3, // -
  walk: 45, // px/s
  run: 70, // px/s
  metalR: 260, // px: a metal enemy this close starts it ...
  anyR: 55, // px: ... or any enemy this close (inside the blast). attack 3 (11-18): was 120, twice the blast radius: against
  // anything not metal (the pull can't move it) it planted itself 120 px out, a rifleman backed off, and 2.5 s later the pop
  // hit nothing but the bots its own pull had dragged in (23 magnet bots v 1 rifleman: all 23 dead, he lived)
  scanEvery: 6, // ticks between trigger checks
  charge: 1, // s charging (planted)
  pull: 1.5, // s pulling
  pullR: 260, // px: pull reach
  pullMass: 20, // heavier units aren't moved
  pullSpeed: 190, // px/s: how fast a light (mass ≤ 1) unit is dragged in ...
  pullHeavy: 0.35, // ... ÷ (1 + 0.35 × (mass − 1)): knight ~170, cavalry ~85, mech ~35
  pullAccel: 1600, // px/s² ÷ mass: how hard the field grabs (beats a soldier's own legs, ~400)
  friendPull: 0.33, // friends are pulled too, at a third of it (full pull dragged a robot army into its own pop: battle test)
  stopAt: 6, // px past both bodies: dragged units stop here (no pile-up inside it)
  blast: {
    radius: 60, // px
    damage: 90, // at the centre (falls off to 0.25)
    minFalloff: 0.25, // edge keeps 25 %
    push: 260, // shove
    stun: 0.5, // s
    tossUp: 360, // people fly
    tossSpeed: 200, // px/s outward
    tossFrom: 0.3, // toss when falloff × pass ≥ 0.3
    hatChance: 0.6, // hats fly
    noiseRadius: 380, // px
  },
  half: 0.5, // killed before it pops: blast × 0.5 (damage, push, toss)
  // attack 3 (11-18): with no metal enemy to pull in (hunting a rifleman, an archer...) it runs after its target while it
  // charges, pulls only enemies (dragging its own bots together was all the pull did there), and pops only with an enemy
  // inside popR; still none after holdMax s it winds down and walks on. It used to pop on its 2.5 s timer wherever it was:
  // a fleeing rifleman (136 px/s) got away and the pops chained through the bots chasing him (23 v 1: 1300 hp of own bots)
  popR: 50, // px between bodies: an enemy this close sets off a hunting magnet bot
  holdMax: 1.5, // s past the pull time a hunting one waits for an enemy in reach, then it winds down
  rearm: 1, // s before a wound-down magnet bot can start again
  friendBlast: 0.3, // a magnet bot takes x0.3 from its own side's magnet pops (still shoved and tossed). attack 3: the pops
  // chained through the pack (a bot killed by a friend's pop pops at half power): 23 v 1 legionary = all 23 dead
  waitR: 110, // px: won't start while another of its side's magnet bots this close is charging or pulling (one pops at a
  // time: the whole pack used to plant round one legionary, drag each other in and chain-pop: 23 v 1 = all 23 dead)
};
const BLAST = CB.registerBlast('magnetbot', Object.freeze({ ...T.blast }));
const HALF = CB.registerBlast('magnetbot-half', Object.freeze({ ...T.blast, damage: T.blast.damage * T.half, push: T.blast.push * T.half, tossUp: T.blast.tossUp * T.half, tossSpeed: T.blast.tossSpeed * T.half }));

// ---------------------------------------------------------------- trigger
let _tu = null, _tm = false;
function metalOne(o) {
  if (_tm || o === _tu || !(o.hp > 0) || o.def.prop) return;
  if (isMetal(o) && hypot(o.x - _tu.x, o.y - _tu.y) <= T.metalR) { _tm = true; return true; }
}
let _bu = null, _bb = false;
function busyOne(o) { if (!_bb && o !== _bu && o.type === _bu.type && o.hp > 0 && (o.b.phase === 1 || o.b.phase === 2)) { _bb = true; return true; } }
function busyNear(world, u) { _bu = u; _bb = false; world.query(u.x, u.y, T.waitR, busyOne, maskBit(u.faction)); _bu = null; return _bb; }
function triggered(world, u, t) {
  if (u.possessed !== 1 && busyNear(world, u)) return false;
  if (t && hypot(t.x - u.x, t.y - u.y) <= T.anyR) return true;
  if (u.possessed === 1) return !!t && isMetal(t) && hypot(t.x - u.x, t.y - u.y) <= T.metalR;   // the player's aim only
  if (world.findNearest(u.x, u.y, T.anyR, ENEMY[u.faction], u, 1)) return true;
  _tu = u; _tm = false;
  world.query(u.x, u.y, T.metalR, metalOne, ENEMY[u.faction]);
  _tu = null;
  return _tm;
}

// ---------------------------------------------------------------- pull
let _pu = null;
function pullOne(o) {
  const u = _pu;
  if (o === u || !(o.hp > 0) || o.def.prop || o.mass > T.pullMass || o.climb > 0 || o.inside >= 0 || !isMetal(o)) return;
  const dx = u.x - o.x, dy = u.y - o.y, d = hypot(dx, dy) || 0.001;
  if (d > T.pullR || d <= u.radius + o.radius + T.stopAt) return;
  const hostile = isHostile(u, o);
  if (!hostile && u.b.hunt === 1) return;   // attack 3: hunting (no metal enemy in reach): no use dragging its own side in
  const ex = dx / d, ey = dy / d, m = Math.max(1, o.mass), k = hostile ? 1 : T.friendPull;
  const want = (k * T.pullSpeed) / (1 + T.pullHeavy * (m - 1)), along = o.vx * ex + o.vy * ey;
  if (along >= want) return;
  const dv = Math.min(want - along, ((k * T.pullAccel) / m) * DT);
  o.vx += ex * dv; o.vy += ey * dv;
}
function pull(world, u) {
  _pu = u;
  world.query(u.x, u.y, T.pullR + ROBOT.margin, pullOne, ALL_MASK);   // friends too
  _pu = null;
}

// attack 3: an enemy metal unit in pull reach? (none: the pull can't bring the enemy in, so it keeps after its target)
let _mu = null, _mm = false;
function enemyMetalOne(o) { if (!_mm && o !== _mu && o.hp > 0 && !o.def.prop && isMetal(o) && o.mass <= T.pullMass && hypot(o.x - _mu.x, o.y - _mu.y) <= T.pullR) { _mm = true; return true; } }
function enemyMetal(world, u) { _mu = u; _mm = false; world.query(u.x, u.y, T.pullR, enemyMetalOne, ENEMY[u.faction]); _mu = null; return _mm; }

let _eu = null, _er = 0, _eh = false;
function enemyAtOne(o) { if (!_eh && o !== _eu && o.hp > 0 && !o.def.prop && !(o.z > 30) && hypot(o.x - _eu.x, o.y - _eu.y) - o.radius - _eu.radius <= _er) { _eh = true; return true; } }
function enemyAt(world, u, r) { _eu = u; _er = r; _eh = false; world.query(u.x, u.y, r + u.radius + ROBOT.margin, enemyAtOne, ENEMY[u.faction]); _eu = null; return _eh; }

function start(world, u) {
  const b = u.b;
  b.phase = 1; b.t0 = world.time; b.pullR = 0; b.hunt = enemyMetal(world, u) ? 0 : 1;
  setAct(world, u, 1);
  setState(u, STATE.ENGAGE);
  world.emit('magnet', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 1 });
}
function pop(world, u) {
  const b = u.b;
  b.phase = 3; b.pullR = 0; setAct(world, u, 0);
  blowUp(world, u, BLAST);
}

function brain(world, u) {
  const b = u.b;
  if (b.spent === 1) { u.goalX = 0; u.goalY = 0; return; }
  if (b.phase === 1 || b.phase === 2) {   // a timer: charging and pulling go on even when stunned
    shortOut(world, u);
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    const age = world.time - b.t0;
    if (b.phase === 1 && age >= T.charge) {
      b.phase = 2; b.t0 = world.time; b.pullR = T.pullR; setAct(world, u, 2);
      world.emit('magnet', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 2 });
    } else if (b.phase === 2) {
      pull(world, u);
      if (b.hunt === 1 && u.possessed !== 1 && enemyAt(world, u, T.popR)) { pop(world, u); return; }   // hunting: the moment one is in reach
      if (age >= T.pull) {
        if (b.hunt !== 1 || u.possessed === 1) { pop(world, u); return; }
        if (age >= T.pull + T.holdMax) {   // attack 3: nobody in reach: wind down, walk on
          b.phase = 0; b.pullR = 0; b.hunt = 0; setAct(world, u, 0); u.cooldown = T.rearm;
          world.emit('magnet', { x: u.x, y: u.y, type: u.type, id: u.id, phase: 0 });
        }
      }
    }
    if (u.stun > 0) u.face = u.heading;
    const t = targetOf(world, u);
    if (t) u.face = Math.atan2(t.y - u.y, t.x - u.x);
    // attack 3: nothing metal to pull in: it doesn't plant, it runs after its target with the coils charging (the pop
    // has to reach it). A possessed one stays the player's (the stick drives it).
    if (b.hunt === 1 && t && !(u.stun > 0) && u.possessed !== 1) {
      const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
      if (d > u.radius + t.radius + 4) { u.goalX = (dx / d) * T.run; u.goalY = (dy / d) * T.run; }
    }
    return;
  }
  if (begin(world, u)) return;
  const t = targetOf(world, u);
  if (mayAttack(world, u) && !(u.cooldown > 0) && (world.tick + u.index) % T.scanEvery === 0 && triggered(world, u, t)) { start(world, u); return; }
  if (!t) { idle(world, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  closeOn(world, u, t, dx, dy, d < 200 ? T.run : T.walk);
  if (d < 200) setState(u, STATE.CHARGE);
}

const D = robot({
  type: 'magnetbot',
  og: 'Magnet Bot (ours)', // no OG original
  radius: 10, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: true, // walks into the enemy (a suicide unit: picks targets like melee)
  strength: 1.5,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 400,
  decel: 400,
  turnRate: 5,
  brushSpacing: 28,
  look: { attack: { time: 0.4 } },
  weapon: { range: T.metalR }, // for possess (aim reach) and readers
  blast: BLAST,
  init(world, u) { initB(u); const b = u.b; b.phase = 0; b.t0 = 0; b.pullR = 0; b.spent = 0; b.spentTick = 0; b.hunt = 0; },
  brain,
  // a spent (popped) magnet bot is a wreck about to go: nothing hurts it; its own side's pops barely do (attack 3)
  damageMul(world, u, amount, att, kind) {
    if (spentMul(world, u) === 0) return 0;
    return kind === 'blast' && att && att !== u && att.type === u.type && att.faction === u.faction ? T.friendBlast : 1;
  },
  // killed before it popped: it pops at half power where it fell
  onDeath(world, u) {
    if (u.b.spent === 1 || u.b.phase === 3) return;
    u.b.phase = 3; u.b.pullR = 0;
    CB.explode(world, u.x, u.y, HALF, u);
  },
  // possessed, attack held at nobody: start the charge anyway (charge, pull, pop)
  possessFire(world, u) { if (u.b.phase === 0 && u.b.spent !== 1) start(world, u); },
});
export default D;
export { T };
