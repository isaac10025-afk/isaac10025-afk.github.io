// magnetbot (OURS, Robots tab): a suicide unit. Walks at the enemy; when a metal enemy is within 260 px (or any enemy
// within 120) it plants itself and charges 1 s, then PULLS every metal unit within 260 px toward itself for 1.5 s (friends
// too, at a third of the pull; mass ≤ 20; strong on light ones, weak on heavy ones: knights skid in, a mech barely creeps), then it POPS: blast
// r 60, 90 dmg, toss. Killed before it pops = it pops at half power where it fell.
// METAL (STEP6 shared rule: magnet pull, eel shock ×2, laser no fire): every def with `metal: true` (all robots, UFO,
// giant mech) plus the OG / step-4 types in METAL_TYPES below (and their risen copies). Other tabs: import { isMetal }.
// b.act: 1 charge → `charge`; 2 pull → `pull` (arms up, coils glow); the art reads b.pullR (px) for the field lines.
import { robot, initB, setAct, begin, shortOut, targetOf, idle, closeOn, mayAttack, blowUp, spentMul, hypot, STATE, DT, CB, ENEMY, setState, ROBOT } from './_lib.js';
import { ALL_MASK, isHostile } from '../../factions.js';

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
  anyR: 120, // px: ... or any enemy this close
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
};
const BLAST = CB.registerBlast('magnetbot', Object.freeze({ ...T.blast }));
const HALF = CB.registerBlast('magnetbot-half', Object.freeze({ ...T.blast, damage: T.blast.damage * T.half, push: T.blast.push * T.half, tossUp: T.blast.tossUp * T.half, tossSpeed: T.blast.tossSpeed * T.half }));

// ---------------------------------------------------------------- trigger
let _tu = null, _tm = false;
function metalOne(o) {
  if (_tm || o === _tu || !(o.hp > 0) || o.def.prop) return;
  if (isMetal(o) && hypot(o.x - _tu.x, o.y - _tu.y) <= T.metalR) { _tm = true; return true; }
}
function triggered(world, u, t) {
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
  const ex = dx / d, ey = dy / d, m = Math.max(1, o.mass), k = isHostile(u, o) ? 1 : T.friendPull;
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

function start(world, u) {
  const b = u.b;
  b.phase = 1; b.t0 = world.time; b.pullR = 0;
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
      if (age >= T.pull) { pop(world, u); return; }
    }
    if (u.stun > 0) u.face = u.heading;
    const t = targetOf(world, u);
    if (t) u.face = Math.atan2(t.y - u.y, t.x - u.x);
    return;
  }
  if (begin(world, u)) return;
  const t = targetOf(world, u);
  if (mayAttack(world, u) && (world.tick + u.index) % T.scanEvery === 0 && triggered(world, u, t)) { start(world, u); return; }
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
  init(world, u) { initB(u); const b = u.b; b.phase = 0; b.t0 = 0; b.pullR = 0; b.spent = 0; b.spentTick = 0; },
  brain,
  damageMul: spentMul, // a spent (popped) magnet bot is a wreck about to go: nothing hurts it
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
