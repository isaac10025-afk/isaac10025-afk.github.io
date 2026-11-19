// captain (OURS, Pirates tab): one pistol shot (50), then the sword (22). His AURA: pirates of his side within 160 px
// can't break or flee (morale held at 0.6 or more) and move 15 % faster. When he dies, pirates within 200 px lose 0.3
// morale. He raises his sword to rally (1 s) when his side meets the enemy after a quiet spell.
// b.act: 1 rally → `rally` (sword up), 2 shoot → `shoot`; `atk` sword.
import { person, initB, begin, meleeFight, closeOn, idle, losClear, setAct, actAge, setState, targetOf, hypot, angleDiff, STATE, DT, CB, PIRATE_MORALE } from './_lib.js';
import { registerSystem } from '../../systems/extra.js';
import { maskBit } from '../../factions.js';

const T = {
  hp: 200, // hit points
  walk: 85, // px/s
  run: 140, // px/s
  gun: {
    range: 200, // px
    projectileSpeed: 720, // px/s
    damage: 50, // his one shot
    damageJitter: 4, // ±
    noiseRadius: 240, // px
    smoke: 1.3, // muzzle smoke
  },
  spread: 0.04, // rad ±
  minShoot: 40, // px: closer than this he just uses the sword
  aimTime: 0.35, // s aiming
  aimTol: 0.15, // rad
  shootPose: 0.3, // s of the `shoot` pose (b.act 2)
  sword: {
    damage: 22, // per cut
    damageJitter: 3, // ±
    cooldown: 0.8, // s
    cooldownJitter: 0.15, // +
    push: 70, // shove
    stun: 0.1, // s
    reach: 7, // px past both radii
    band: 18, // px
    facing: 0.6, // rad
    circle: 0.5, // strafing
    close: 120, // px/s stepping in. attack 3 (11-18): OG soldiers step in at walk x 0.6 (51 px/s here); a rifleman backing
    // off at 48 plus the strafe kept him 20-30 px out of reach for whole fights (34 captains v 40 rifles: 45-60 s, circling)
  },
  aura: {
    radius: 160, // px
    hold: 0.6, // morale held at least this high
    speed: 1.15, // × speed
  },
  death: {
    radius: 200, // px
    morale: 0.3, // lost by every pirate of his side this close
  },
  rally: {
    time: 1, // s sword up (b.act 1)
    quiet: 4, // s with no target before the next sight of the enemy makes him rally again
  },
};

const D = person({
  type: 'captain',
  og: 'Captain (ours)', // no OG original
  radius: 9.5, // OG-raw
  mass: 1.3,
  maxHp: T.hp,
  melee: true,
  strength: 1.2,
  walkSpeed: T.walk,
  runSpeed: T.run,
  brushSpacing: 23,
  crew: false, // leads, doesn't man guns
  morale: { ...PIRATE_MORALE, baseline: 0.92, breakAt: 0.15 },
  look: { attack: { time: 0.3 } },
  weapon: T.sword,
  init(world, u) { initB(u); u.b.loaded = 1; u.b.aimT = 0; u.b.quiet = T.rally.quiet; u.cooldown = world.rng() * T.sword.cooldown; },
  brain(world, u) {
    const b = u.b;
    if (b.act === 2 && actAge(world, u) > T.shootPose) setAct(world, u, 0);
    if (b.act === 1 && actAge(world, u) >= T.rally.time) setAct(world, u, 0);
    if (begin(world, u, T.sword)) { b.aimT = 0; return; }
    const t = targetOf(world, u);
    if (!t) b.quiet += DT;
    if (u.state === STATE.FLEE) { CB.fleeSteer(world, u, t, u.def.runSpeed); return; }
    if (!t) { idle(world, u); return; }
    const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
    if (b.quiet >= T.rally.quiet && b.act === 0 && d > 60) {   // first sight after a quiet spell: rally the crew
      setAct(world, u, 1);
      world.emit('charge', { x: u.x, y: u.y, v: 1, type: u.type });
    }
    b.quiet = 0;
    if (b.act === 1) { setState(u, STATE.ALERT); u.face = Math.atan2(dy, dx); return; }
    if (b.loaded && d <= T.gun.range && d >= T.minShoot && losClear(world, u)) {
      setState(u, STATE.ENGAGE);
      const lead = d / T.gun.projectileSpeed, aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
      u.face = aim;
      b.aimT += DT;
      if (b.aimT >= T.aimTime && Math.abs(angleDiff(u.heading, aim)) < T.aimTol) {
        CB.shoot(world, u, aim + T.spread * (world.rng() - world.rng()), T.gun);
        b.loaded = 0; b.aimT = 0; setAct(world, u, 2);
      }
      return;
    }
    b.aimT = 0;
    if (meleeFight(world, u, t, T.sword, dx, dy, d) === 0) closeOn(world, u, t, dx, dy, d);
  },
  possessFire(world, u, aim) {   // possessed, attack held at nobody: his shot if he still has it, else a sword swing
    const b = u.b;
    if (b.loaded) { CB.shoot(world, u, aim, T.gun); b.loaded = 0; setAct(world, u, 2); return; }
    if (u.cooldown > 0) return;
    u.attack = 1; u.cooldown = T.sword.cooldown;
    world.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
  },
  onDeath(world, u) {   // his side loses heart
    const r = T.death.radius, m = maskBit(u.faction);
    const n = world.queryMask(u.x, u.y, r, m, _q, Q_CAP);
    for (let k = 0; k < n; k++) { const o = _q[k]; _q[k] = null; if (o !== u && o.def.pirate && o.hp > 0) o.morale = Math.max(0, o.morale - T.death.morale); }
  },
});

// ---------------------------------------------------------------- the aura: every tick, after morale, before the brains
const Q_CAP = 256, _q = new Array(Q_CAP).fill(null), _caps = [];
function auraRun(world) {
  const us = world.units; let n = 0;
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.def === D && !u.dead && u.hp > 0) _caps[n++] = u; }
  if (n === 0) return;
  const tick = world.tick, A = T.aura;
  for (let c = 0; c < n; c++) {
    const cap = _caps[c]; _caps[c] = null;
    const m = world.queryMask(cap.x, cap.y, A.radius, maskBit(cap.faction), _q, Q_CAP);
    for (let k = 0; k < m; k++) {
      const o = _q[k]; _q[k] = null;
      if (!o.def.pirate || !(o.hp > 0)) continue;
      const b = o.b; b.aura = tick; b.auraMul = A.speed;
      if (o.morale < A.hold) o.morale = A.hold;
      if (o.state === STATE.FLEE && o.possessed !== 1) setState(o, STATE.IDLE);
    }
  }
}
registerSystem('pirates-aura', auraRun, 'morale');

export default D;
export { T };
