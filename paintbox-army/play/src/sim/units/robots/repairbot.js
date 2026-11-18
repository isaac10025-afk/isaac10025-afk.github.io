// repairbot (OURS, Robots tab): can't fight. Follows its side's most hurt machine within 300 px (robots, siege machines,
// cannons, the ship, mechs...: any def.machine of its own faction / team) and welds it: +25 hp/s while within 40 px.
// Backs away from enemies within 80 px. Cornered (an enemy right on it) or driven by the player: wrench bonk 5.
// b.act: 1 weld → `weld`; b.victim = the patient's id (spark spray at the torch).
import { robot, initB, setAct, begin, targetOf, idle, melee, emptySwing, mayAttack, hypot, STATE, DT, ENEMY, moveTo, setState, losClear } from './_lib.js';
import { maskBit } from '../../factions.js';

const T = {
  hp: 100, // hit points
  mass: 1.5, // -
  walk: 70, // px/s
  run: 110, // px/s
  seekR: 300, // px: looks this far for a hurt machine
  seekEvery: 20, // ticks between patient searches
  switchBy: 0.15, // a new patient must be this much more hurt (hp fraction) to switch
  weldR: 40, // px between the bodies: welding reach
  keep: 14, // px between the bodies it closes to
  heal: 25, // hp/s welded
  sparkEvery: 10, // ticks between torch sparks
  scared: 80, // px: enemies this close make it back away
  scanEvery: 6, // ticks between enemy checks
  bonk: {
    damage: 5, // wrench bonk
    damageJitter: 1, // ±
    cooldown: 0.8, // s
    cooldownJitter: 0.2, // +
    push: 50, // shove
    stun: 0.1, // s
    reach: 3, // px past both radii: "cornered" = an enemy this close
    band: 0, // px: never steps in to fight
    facing: 1.2, // rad
    circle: 0, // no strafing
  },
};

// ---------------------------------------------------------------- the patient
let _pu = null, _pb = null, _pf = 0;
function hurtOne(o) {
  const u = _pu;
  if (o === u || o.dead || !(o.hp > 0) || o.def.machine !== true || o.faction !== u.faction || o.b.spent === 1 || o.inside >= 0) return;
  const f = o.hp / o.maxHp;
  if (f >= 0.999 || f >= _pf) return;
  if (hypot(o.x - u.x, o.y - u.y) > T.seekR) return;
  _pf = f; _pb = o;
}
function patientOk(u, o) { return !!o && !o.dead && o.hp > 0 && o.hp < o.maxHp && o.faction === u.faction && o.b.spent !== 1 && o.inside < 0; }
function seek(world, u) {
  const b = u.b, cur = b.victim >= 0 ? world.unitById(b.victim) : null, ok = patientOk(u, cur);
  _pu = u; _pb = null; _pf = ok ? cur.hp / cur.maxHp - T.switchBy : 0.999;
  world.query(u.x, u.y, T.seekR, hurtOne, maskBit(u.faction));
  const p = _pb; _pu = null; _pb = null;
  if (p) b.victim = p.id; else if (!ok) b.victim = -1;
}
// weld p if it is in reach; true when welding
function weld(world, u, p) {
  const gap = hypot(p.x - u.x, p.y - u.y) - u.radius - p.radius;
  if (gap > T.weldR) return false;
  p.hp = Math.min(p.maxHp, p.hp + T.heal * DT);
  u.face = Math.atan2(p.y - u.y, p.x - u.x);
  setAct(world, u, 1);
  if ((world.tick + u.index) % T.sparkEvery === 0) {
    const a = Math.atan2(u.y - p.y, u.x - p.x);
    world.emit('weld', { x: p.x + Math.cos(a) * p.radius, y: p.y + Math.sin(a) * p.radius, type: u.type, id: u.id, patient: p.id });
  }
  return true;
}

function brain(world, u) {
  const b = u.b;
  if (begin(world, u)) { setAct(world, u, 0); return; }
  if (b.victim < 0 || (world.tick + u.index) % T.seekEvery === 0) seek(world, u);
  let p = b.victim >= 0 ? world.unitById(b.victim) : null;
  if (!patientOk(u, p)) { b.victim = -1; p = null; }
  const welding = !!p && weld(world, u, p);
  if (!welding) setAct(world, u, 0);
  if (u.possessed === 1) {                              // the player drives: it welds what it is next to, bonks what it aims at
    const t = targetOf(world, u);
    if (t && mayAttack(world, u)) melee(world, u, t, T.bonk, t.x - u.x, t.y - u.y, hypot(t.x - u.x, t.y - u.y) || 0.001);
    return;
  }
  if ((world.tick + u.index) % T.scanEvery === 0) { const f = world.findNearest(u.x, u.y, T.scared + 20, ENEMY[u.faction], u, 1); b.foe = f ? f.id : -1; }
  const foe = b.foe >= 0 ? world.unitById(b.foe) : null;
  if (foe && foe.hp > 0) {
    const dx = foe.x - u.x, dy = foe.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d <= T.scared + foe.radius) {
      setState(u, STATE.ALERT);
      melee(world, u, foe, T.bonk, dx, dy, d);         // cornered: an enemy right on it gets the wrench
      u.goalX = (-dx / d) * T.run; u.goalY = (-dy / d) * T.run;
      if (!welding) u.face = Math.atan2(dy, dx);
      u.pathing = 1;
      return;
    }
  }
  if (p) {
    const dx = p.x - u.x, dy = p.y - u.y, d = hypot(dx, dy) || 0.001, gap = d - u.radius - p.radius;
    setState(u, welding ? STATE.ENGAGE : STATE.ADVANCE);
    if (gap > T.keep) moveTo(world, u, p.x, p.y, gap > 60 ? T.run : Math.max(20, Math.min(T.walk, 3 * gap)), losClear(world, u) || world.lineOfSight(u.x, u.y, p.x, p.y));
    u.pathing = 1;
    return;
  }
  const t = targetOf(world, u);
  idle(world, u);
  if (t && u.state === STATE.IDLE) u.face = Math.atan2(t.y - u.y, t.x - u.x);
}

const D = robot({
  type: 'repairbot',
  og: 'Repair Bot (ours)', // no OG original
  radius: 8, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: true, // the wrench (and it never shoots)
  strength: 0.4,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 600,
  decel: 600,
  brushSpacing: 22,
  minDistance: T.scared,
  look: { attack: { time: 0.3 } },
  weapon: T.bonk,
  repair: T, // readers (tests): heal, weldR
  init(world, u) { initB(u); u.b.foe = -1; u.cooldown = world.rng() * T.bonk.cooldown; },
  brain,
  possessFire(world, u) { emptySwing(world, u, T.bonk.cooldown); },
});
export default D;
export { T };
