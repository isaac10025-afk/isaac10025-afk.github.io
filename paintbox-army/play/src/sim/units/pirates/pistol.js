// pistol (OURS, Pirates tab): one big shot. Aims, fires (45 at up to 200 px), then reloads for 6 s, but only while no
// enemy is within 140 px; with one that close it pistol-whips (12). b.act: 1 aim → `aim`, 2 shoot → `shoot`; `atk` whip.
import { person, initB, begin, meleeBody, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, CB } from './_lib.js';

const T = {
  hp: 85, // hit points
  walk: 90, // px/s
  run: 150, // px/s
  gun: {
    range: 200, // px
    projectileSpeed: 720, // px/s
    damage: 45, // one shot
    damageJitter: 4, // ±
    noiseRadius: 240, // px: noise splat (wakes enemies)
    smoke: 1.3, // muzzle smoke size
    spread: 0.05, // rad, ± (triangular)
  },
  aimTime: 0.4, // s aiming before the shot (b.act 1)
  aimTol: 0.15, // rad: fires once facing the aim this well
  shootPose: 0.3, // s the `shoot` pose shows (b.act 2)
  reload: 6, // s to reload, counted only with no enemy within reloadClear
  reloadClear: 140, // px
  whip: {
    damage: 12, // pistol-whip
    damageJitter: 2, // ±
    cooldown: 0.9, // s
    cooldownJitter: 0.2, // +
    push: 60, // shove
    stun: 0.15, // s
    reach: 5, // px past both radii
    band: 16, // px
    facing: 0.6, // rad
    circle: 0.4, // strafing
  },
};

function fire(world, u, aim) {
  const b = u.b;
  CB.shoot(world, u, aim, T.gun);
  b.loaded = 0; b.reload = T.reload;
  setAct(world, u, 2);
}

const D = person({
  type: 'pistol',
  og: 'Pistol (ours)', // no OG original
  radius: 9, // OG-raw
  maxHp: T.hp,
  melee: false,
  strength: 0.6,
  walkSpeed: T.walk,
  runSpeed: T.run,
  minDistance: 60,
  brushSpacing: 21,
  look: { attack: { time: 0.3 } },
  weapon: { range: T.gun.range }, // for possess (aim reach) and readers
  init(world, u) { initB(u); u.b.loaded = 1; u.b.reload = T.reload; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) > T.shootPose) setAct(world, u, 0);
    if (begin(world, u, T.whip)) { if (b.act === 1) setAct(world, u, 0); return; }
    const t = targetOf(world, u);
    if (u.state === STATE.FLEE || !b.loaded) {
      if (b.act === 1) setAct(world, u, 0);
      const d = t ? hypot(t.x - u.x, t.y - u.y) : Infinity;
      if (u.state === STATE.FLEE || d <= T.reloadClear) { meleeBody(world, u, T.whip); return; }
      b.reload -= DT;                                  // nobody close: reload
      if (b.reload <= 0) { b.loaded = 1; b.reload = T.reload; }
      if (t) { setState(u, STATE.ALERT); u.face = Math.atan2(t.y - u.y, t.x - u.x); } else idle(world, u);
      return;
    }
    if (!t) { if (b.act === 1) setAct(world, u, 0); idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, clear = losClear(world, u);
    const r = u.state === STATE.ENGAGE ? T.gun.range * 1.1 + 6 : T.gun.range;
    if (!clear || d > r) { if (b.act === 1) setAct(world, u, 0); CB.advanceTo(world, u, t, dx, dy, clear, u.def.walkSpeed); return; }
    setState(u, STATE.ENGAGE);
    const lead = d / T.gun.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    u.face = aim;
    CB.sidestep(world, u, t, dx, dy, d, u.def);
    if (b.act !== 1) { setAct(world, u, 1); return; }
    if (actAge(world, u) >= T.aimTime && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) fire(world, u, aim + T.gun.spread * (world.rng() - world.rng()));
  },
  // possessed, attack held at nobody: a quick shot at the aim if loaded, else an empty whip
  possessFire(world, u, aim) {
    if (u.b.loaded) { fire(world, u, aim + T.gun.spread * (world.rng() - world.rng())); return; }
    if (u.cooldown > 0) return;
    u.attack = 1; u.cooldown = T.whip.cooldown;
    world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
  },
});
export default D;
export { T };
