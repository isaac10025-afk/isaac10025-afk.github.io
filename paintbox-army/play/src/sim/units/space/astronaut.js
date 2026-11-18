// astronaut (OURS, Space tab): low gravity. It gets about in floaty hops (0.6 s each, a z arc 18 px high) and punches
// (18 every 0.9 s): what it hits floats (`u.floating` 1.8 s, steering.js lifts it; no hard drop, it just falls back:
// the shared landing bump). Owner: SPACE-SIM. Pose codes (STEP6.md): b.act 1 hop → `hop` (while z > 0); `atk` punch.
// The hops are a world system run after the player's stick (possessPost), before steering: a grounded astronaut whose
// goal (its brain's, or the stick's) asks for walking speed takes off along it; while up, the system keeps its z on the
// arc and lands it softly (no landing bump). Walls still stop it (it is never a flyer); it wades in deep water (no hops),
// a web holds it down, a float or a blast takes it over (the hop just stops).
import { registerSystem } from '../../systems/extra.js';
import {
  alien, initBag, act, targetOf, idle, fleeing, closeOn, meleeFight, swing, canFloat,
  hypot, GRAVITY, DT, deepAt,
} from './_lib.js';

const T = {
  hp: 120, mass: 1.3, radius: 9,
  walk: 60, run: 100,       // px/s (the hop's ground speed)
  hopTime: 0.6,             // s per hop
  hopH: 18,                 // px: top of the hop arc
  hopMin: 40,               // px/s: a goal this fast or faster starts a hop (slower = steps on the ground)
  hopShort: 10,             // px: a hop shorter than this isn't worth it (it steps instead)
  landIn: 4,                // px inside punching reach: where a hop at its target comes down
  float: 1.8,               // s a punched unit floats
  punch: {
    damage: 18, damageJitter: 3, cooldown: 0.9, cooldownJitter: 0.15, push: 60, stun: 0.15,
    reach: 6, band: 16, facing: 0.7, circle: 0.3, backStep: false, close: 36,
  },
};

function brain(w, u) {
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if (u.stun > 0) { u.face = u.heading; return; }
  const t = targetOf(w, u);
  if (fleeing(w, u, t)) return;
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const r = meleeFight(w, u, t, T.punch, dx, dy, d);
  if (r === 2 && t.hp > 0 && canFloat(w, t)) { t.floating = w.time + T.float; t.vz = 0; w.emit('spell', { x: t.x, y: t.y, v: 0.4, type: u.type, float: 1 }); }   // STEP6 SPACE AUDIO
  if (r !== 0) return;
  closeOn(w, u, t, dx, dy, d);
}

// ---------------------------------------------------------------- hops (system after possessPost)
function hopSys(w) {
  const us = w.units, now = w.time;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || u.def !== D) continue;
    const b = u.b;
    if (b.hop === 1) {
      // something else has it (a float, a blast, a grab, swallowed, dead): the hop just stops, gravity has it
      if (!(u.hp > 0) || u.floating > now || u.inside >= 0 || u.hurled === 1 || u.thrownAt > b.hopT || u.climb > 0 || u.leaping !== 0) {
        b.hop = 0; act(w, u, 0); continue;
      }
      const f = (now - b.hopT + DT) / T.hopTime;   // where it will be after this tick's physics
      if (f >= 1) { u.z = 0; u.vz = 0; b.hop = 0; act(w, u, 0); continue; }   // soft landing: no bump
      u.z = 4 * T.hopH * f * (1 - f); u.vz = GRAVITY * DT;   // steering's gravity takes vz back to 0: z stays on the arc
      continue;
    }
    if (u.z > 0 || u.vz > 0 || u.stun > 0 || u.webbed > now || u.floating > now || u.leaping !== 0 || u.climb > 0 || u.inside >= 0 || !(u.hp > 0)) continue;
    const gx = u.goalX, gy = u.goalY, g = hypot(gx, gy);
    if (g < T.hopMin || deepAt(w, u.x, u.y)) continue;
    // a hop never sails over its target: it comes down within punching reach (too short a hop = it steps the rest)
    let dist = Math.min(g * u.speedMul, u.def.maxSpeed) * T.hopTime;
    const t = u.target >= 0 ? w.unitById(u.target) : null;
    if (t && t.hp > 0) {
      const ex = t.x - u.x, ey = t.y - u.y, along = (ex * gx + ey * gy) / g, side = Math.abs(ex * gy - ey * gx) / g;
      const reach = u.radius + t.radius + T.punch.reach;
      if (along > 0 && side < reach + 4) dist = Math.min(dist, Math.max(0, along - reach + T.landIn));
    }
    if (dist < T.hopShort) continue;
    const sp = dist / T.hopTime;
    b.hop = 1; b.hopT = now;
    u.vx = gx / g * sp; u.vy = gy / g * sp; u.heading = Math.atan2(gy, gx);
    const f = DT / T.hopTime;
    u.z = 4 * T.hopH * f * (1 - f); u.vz = GRAVITY * DT;
    act(w, u, 1);
    w.emit('lowhop', { x: u.x, y: u.y, type: u.type });   // STEP6 AUDIO: low-gravity boing (own name: 'hop' would puff dust in fx.js)
  }
}
registerSystem('spaceHop', hopSys, 'possessPost');

const D = alien({
  type: 'astronaut', og: 'Astronaut (ours)',   // no OG unit
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 1, melee: true,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: T.run * 1.3,
  weapon: T.punch,
  look: { attack: { time: 0.3 } },
  init(w, u) { initBag(w, u); u.b.hop = 0; u.b.hopT = -1; u.cooldown = w.rng() * 0.9; },
  possessFire(w, u) { swing(w, u, T.punch.cooldown); },
  brain,
});
export default D;
export { T };
