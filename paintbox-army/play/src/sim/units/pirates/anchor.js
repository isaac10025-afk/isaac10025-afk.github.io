// anchor (OURS, Pirates tab): big lad with a ship's anchor on a chain. Swing: winds up, then hits ALL enemies in a
// 120° arc within r + 40: 34 each + a shove of 260 (people are tossed). Every 6 s it hooks an enemy 60-130 px away and
// yanks it to its feet (it lands stunned, ready for the swing).
// b.act: 1 wind-up → `wind`, 2 swing → `swing`, 3 hook throw → `hook` (b.victim = the hooked unit while it flies in).
import { person, initB, begin, idle, closeOn, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, CB } from './_lib.js';
import { isHostile } from '../../factions.js';

const T = {
  hp: 260, // hit points
  walk: 50, // px/s
  run: 110, // px/s
  mass: 2.5, // heavy
  swing: {
    damage: 34, // to each unit in the arc
    damageJitter: 4, // ±
    reach: 40, // px past its own radius (to the victim's edge)
    arcCos: 0.5, // cos(60°): a 120° arc in front
    windup: 0.35, // s winding up (b.act 1)
    pose: 0.25, // s of the swing pose (b.act 2)
    cooldown: 1.8, // s from swing to swing
    push: 260, // shove (heavier units)
    stun: 0.35, // s on the shoved
    tossMass: 1.5, // people (mass ≤ 1.5) are tossed instead
    tossOut: 200, // px/s outward
    tossUp: 190, // px/s up
    facing: 0.5, // rad: starts the wind-up once facing the target this well
  },
  hook: {
    every: 6, // s between hooks
    min: 60, // px: closest hook
    max: 130, // px: farthest hook
    throwTime: 0.25, // s from the throw to the yank
    hold: 0.45, // s the hook pose stays after the yank
    damage: 8, // the hook bites
    up: 170, // px/s: hop height of the yank
    gap: 4, // px: lands this far from its feet
    maxMass: 4, // heavier units can't be hooked
  },
  fend: { // a plain blow, only while manning a cannon
    damage: 20, damageJitter: 3, cooldown: 1.4, cooldownJitter: 0.2, push: 160, stun: 0.2, reach: 10, band: 14, facing: 0.6, circle: 0,
  },
};

let _u = null, _w = null, _n = 0, _fx = 0, _fy = 0;
function swingOne(o) {
  const u = _u;
  if (o === u || !(o.hp > 0) || !isHostile(u, o) || o.climb > 0) return;
  const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
  if (d - o.radius > u.radius + T.swing.reach) return;
  if ((dx * _fx + dy * _fy) / d < T.swing.arcCos && d > u.radius + o.radius + 2) return;   // outside the arc (touching always hit)
  const w = _w, nx = dx / d, ny = dy / d;
  const pass = CB.damage(w, o, T.swing.damage + T.swing.damageJitter * (w.rng() - w.rng()), u);
  if (o.hp > 0 && o.mass <= T.swing.tossMass && pass > 0.5) CB.toss(w, o, nx, ny, T.swing.tossOut * pass, T.swing.tossUp * pass);
  else CB.push(w, o, nx, ny, T.swing.push * pass, T.swing.stun * pass);
  CB.blockedSpark(w, u, o, pass);
  _n++;
}
function swing(world, u) {
  _u = u; _w = world; _n = 0; _fx = Math.cos(u.heading); _fy = Math.sin(u.heading);
  world.query(u.x, u.y, u.radius + T.swing.reach + 46, swingOne);
  const n = _n; _u = null; _w = null;
  world.emit(n > 0 ? 'strike' : 'swing', { x: u.x + _fx * u.radius * 2, y: u.y + _fy * u.radius * 2, v: Math.min(2, 0.6 + 0.4 * n), type: u.type, id: u.id });
  if (n > 0 && world.stats) world.stats.impacts = (world.stats.impacts || 0) + 1;
  u.attack = 1; u.cooldown = T.swing.cooldown;
  setAct(world, u, 2);
}
function yank(world, u, v) {
  const dx = u.x - v.x, dy = u.y - v.y, d = hypot(dx, dy) || 0.001;
  const dist = Math.max(0, d - (u.radius + v.radius + T.hook.gap));
  CB.damage(world, v, T.hook.damage, u);
  if (!(v.hp > 0)) return;
  const k = 1 / Math.sqrt(Math.max(1, v.mass)), air = (2 * T.hook.up * k) / 900;
  CB.toss(world, v, dx / d, dy / d, dist / (k * air), T.hook.up);
  world.emit('throw', { x: v.x, y: v.y, v: 0.8, type: u.type });
}

const D = person({
  type: 'anchor',
  og: 'Anchor (ours)', // no OG original
  radius: 11, // OG-raw
  mass: T.mass,
  maxHp: T.hp,
  melee: true,
  strength: 1.6,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 500, decel: 500, turnRate: 6,
  brushSpacing: 26,
  look: { attack: { time: 0.45 } },
  weapon: T.swing,
  init(world, u) { initB(u); u.b.hookCd = 1 + world.rng() * 2; u.b.yanked = 0; u.b.aimA = u.heading; u.cooldown = world.rng() * T.swing.cooldown * 0.5; },
  brain(world, u) {
    const b = u.b;
    if (b.hookCd > 0) b.hookCd -= DT;
    if (b.act === 2 && actAge(world, u) >= T.swing.pose) setAct(world, u, 0);
    if (begin(world, u, T.fend)) { if (b.act === 1 || b.act === 3) { setAct(world, u, 0); b.victim = -1; } return; }
    const t = targetOf(world, u);
    if (b.act === 1) {                                     // winding up: track the target, then swing
      if (t) b.aimA = Math.atan2(t.y - u.y, t.x - u.x);
      u.face = b.aimA;
      if (actAge(world, u) >= T.swing.windup) swing(world, u);
      return;
    }
    if (b.act === 2) { u.face = u.heading; return; }       // follow-through
    if (b.act === 3) {                                     // hook out
      const v = world.unitById(b.victim);
      if (v) u.face = Math.atan2(v.y - u.y, v.x - u.x);
      const age = actAge(world, u);
      if (!b.yanked && age >= T.hook.throwTime) {
        b.yanked = 1;
        if (v && v.hp > 0 && hypot(v.x - u.x, v.y - u.y) <= T.hook.max + 30 && world.lineOfSight(u.x, u.y, v.x, v.y)) yank(world, u, v);
        else { setAct(world, u, 0); b.victim = -1; }
      } else if (b.yanked && age >= T.hook.throwTime + T.hook.hold) { setAct(world, u, 0); b.victim = -1; }
      return;
    }
    if (u.state === STATE.FLEE) { CB.fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
    if (d - t.radius <= u.radius + T.swing.reach) {        // in swing reach: wind up when ready
      setState(u, STATE.ENGAGE);
      if (world.groups.markEngaged && u.group >= 0) world.groups.markEngaged(u.group);
      u.face = a;
      if (d > u.radius + t.radius + 14) { u.goalX = (dx / d) * u.def.walkSpeed * 0.5; u.goalY = (dy / d) * u.def.walkSpeed * 0.5; }
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < T.swing.facing) { b.aimA = a; setAct(world, u, 1); }
      return;
    }
    if (b.hookCd <= 0 && d >= T.hook.min && d <= T.hook.max && t.mass <= T.hook.maxMass && !(t.z > 0) && !t.def.untossable && losClear(world, u)) {
      b.victim = t.id; b.yanked = 0; b.hookCd = T.hook.every; u.face = a;
      setAct(world, u, 3);
      world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id, hook: 1 });   // STEP4 AUDIO: hook: the chain flies out
      return;
    }
    closeOn(world, u, t, dx, dy, d);
  },
  // possessed, attack held at nobody: swing at the empty arc
  possessFire(world, u, aim) {
    const b = u.b;
    if (b.act === 0 && u.cooldown <= 0) { b.aimA = aim; setAct(world, u, 1); }
  },
});
export default D;
export { T };
