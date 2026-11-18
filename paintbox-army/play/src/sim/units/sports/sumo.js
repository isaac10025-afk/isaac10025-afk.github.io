// sumo (OURS, Sports tab): huge, can't be tossed. SHOVE: every 1.2 s, every enemy in his front 90° within r + 25 is
// shoved back hard (12 dmg, push 320); one that slams into a wall takes 25 more. STOMP: the first time enemies come close
// after a quiet spell, he raises a leg and stomps: everyone within 80 px is knocked down 0.5 s.
// b.act: 1 shove → `shove` (both palms out), 2 stomp → `stomp` (leg high, then down: the ring lands at the end).
import { athlete, initB, begin, closeOn, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, damage, push, ENEMY, shoved, shrugs, grounded, knockDown, mayAct, COMMON, fleeSteer } from './_lib.js';
import { oddsApproach } from '../../combat/melee.js';

const T = {
  hp: 500, // hit points (STEP6)
  walk: 40, // px/s (STEP6)
  run: 80, // px/s (STEP6)
  shove: {
    every: 1.2, // s (STEP6)
    reach: 25, // px past his radius to their edge (STEP6 "within r + 25")
    arc: Math.PI / 4, // ± rad: the front 90° (STEP6) ...
    pivot: 0.8, // ... measured from 0.8 × his radius behind his centre, so men at his shoulders count (he is wide)
    damage: 12, // (STEP6)
    push: 320, // (STEP6) ÷ their mass
    stun: 0.25, // s: they slide (can't dig in) while the shove carries them
    pose: 0.35, // s of the `shove` pose (b.act 1)
    facing: 0.5, // rad: turns to face before shoving
  },
  stomp: {
    trigger: 110, // px: the first enemy this close (after a quiet spell) gets the stomp
    quiet: 6, // s with no target re-arms it ("when it first sees enemies")
    raise: 0.6, // s leg up (b.act 2); the ring lands at the end
    downPose: 0.25, // s of the stamp after it lands
    radius: 80, // px ring (STEP6)
    down: 0.5, // s knocked down (STEP6)
    push: 90, // shove outward (÷ mass)
  },
};
const S = T.shove;

const Q_CAP = 64, _q = new Array(Q_CAP).fill(null);
function doShove(world, u) {
  const c = Math.cos(u.heading), s = Math.sin(u.heading), reach = u.radius + S.reach;
  const px = u.x - c * u.radius * S.pivot, py = u.y - s * u.radius * S.pivot;   // the arc opens from behind his belly: both palms
  const n = world.queryMask(u.x, u.y, reach + COMMON.margin, ENEMY[u.faction], _q, Q_CAP);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const o = _q[k]; _q[k] = null;
    if (!(o.hp > 0) || o.def.prop || o.inside >= 0 || !grounded(o)) continue;
    const dx = o.x - u.x, dy = o.y - u.y, d = hypot(dx, dy) || 0.001;
    if (d - o.radius > reach || dx * c + dy * s < 0) continue;
    const ax = o.x - px, ay = o.y - py, ad = hypot(ax, ay) || 0.001;
    if ((ax * c + ay * s) / ad < Math.cos(S.arc)) continue;
    const ux = dx / d, uy = dy / d;
    const pass = damage(world, o, S.damage, u);
    if (o.hp > 0 && !shrugs(o)) { push(world, o, ux, uy, S.push * pass, S.stun * pass); shoved(world, o, u, ux, uy); }
    hit++;
  }
  setAct(world, u, 1);
  u.attack = 1; u.cooldown = S.every;
  world.emit(hit > 0 ? 'strike' : 'swing', { x: u.x + c * reach, y: u.y + s * reach, v: 1.4, type: u.type, id: u.id, units: hit });
  return hit;
}
function stompRing(world, u) {
  const R = T.stomp.radius;
  const n = world.queryMask(u.x, u.y, R + COMMON.margin, ENEMY[u.faction], _q, Q_CAP);
  for (let k = 0; k < n; k++) {
    const o = _q[k]; _q[k] = null;
    if (!(o.hp > 0) || o.def.prop || !grounded(o) || o.inside >= 0) continue;
    if (hypot(o.x - u.x, o.y - u.y) - o.radius > R) continue;
    knockDown(world, o, u.x, u.y, T.stomp.push, T.stomp.down);
  }
  world.emit('land', { x: u.x, y: u.y, v: 2.5 * u.radius, type: u.type, stomp: 1 });   // STEP6 SPORTS AUDIO: big thud
  world.emit('puff', { kind: 'dust', x: u.x, y: u.y, ang: 0, size: 1.6 });
}

const D = athlete({
  type: 'sumo',
  og: 'Sumo (ours)', // no OG original
  radius: 15, // OG-raw (STEP6)
  mass: 6, // STEP6
  maxHp: T.hp,
  melee: true,
  strength: 2.5,
  walkSpeed: T.walk,
  runSpeed: T.run,
  accel: 400,
  decel: 400,
  turnRate: 4,
  untossable: true, // can't be tossed (STEP6)
  density: 2,
  brushSpacing: 34,
  morale: { baseline: 0.95, oddsWeight: 0.3, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: true, breakAt: 0.15, rallyAt: 0.5, minFleeTime: 2.5, dropRate: 2, recoverRate: 0.3, panicFear: 0.3, deathFear: 0.8 }, // steady
  look: { attack: { time: 0.35 } },
  weapon: { range: S.reach + 20, reach: S.reach },
  init(world, u) { initB(u); u.b.quiet = T.stomp.quiet; u.b.stompAt = 0; u.cooldown = world.rng() * S.every; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 1 && actAge(world, u) >= S.pose) setAct(world, u, 0);
    if (b.act === 2 && actAge(world, u) >= T.stomp.raise + T.stomp.downPose) setAct(world, u, 0);
    if (b.act === 2 && b.stompAt < 0 && actAge(world, u) >= T.stomp.raise) { b.stompAt = world.time; stompRing(world, u); }
    if (begin(world, u)) { if (b.act === 2 && b.stompAt < 0) setAct(world, u, 0); return; }
    if (b.act === 2) { u.face = u.heading; return; }   // leg up: planted
    const t = targetOf(world, u);
    if (!t) b.quiet += DT;
    if (u.state === STATE.FLEE) { fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (b.quiet >= T.stomp.quiet && d <= T.stomp.trigger && mayAct(world, u)) { b.quiet = 0; b.stompAt = -1; setAct(world, u, 2); world.emit('charge', { x: u.x, y: u.y, v: 1, type: u.type }); return; }
    b.quiet = 0;
    const a = Math.atan2(dy, dx);
    u.face = a;
    if (d - t.radius <= u.radius + S.reach) {
      setState(u, STATE.ENGAGE);
      if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < S.facing) doShove(world, u);
      oddsApproach(world, u, t, dx, dy, d, u.def);
      u.goalX += (dx / d) * u.def.walkSpeed * 0.5; u.goalY += (dy / d) * u.def.walkSpeed * 0.5;   // keeps leaning in
      return;
    }
    closeOn(world, u, t, dx, dy, d);
  },
  // possessed, attack held at nobody: a shove at whatever stands in front
  possessFire(world, u) { if (u.cooldown <= 0 && u.b.act === 0) doShove(world, u); },
});
export default D;
export { T };
