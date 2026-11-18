// deckhand (OURS, Pirates tab): fast cutlass fighter. Slashes every 0.5 s and sidesteps after each swing.
// Swims (all pirates). Poses: `atk` slash; swimming → `swim` (b.swim = 1 in deep water). No b.act codes.
import { person, initB, begin, meleeBody, hypot } from './_lib.js';

const T = {
  hp: 90, // hit points
  walk: 95, // px/s walking
  run: 165, // px/s running (closing in, fleeing)
  cutlass: {
    damage: 16, // per slash
    damageJitter: 3, // ± per slash
    cooldown: 0.5, // s between slashes
    cooldownJitter: 0.12, // + up to this much
    push: 40, // small shove on each hit
    stun: 0, // no stun
    reach: 6, // px past both radii
    band: 18, // px past reach: still "in the fight" (steps in)
    facing: 0.6, // rad: must face the target this well to swing
    circle: 0.6, // strafes round the target (OG soldiers 0..1)
    backStep: false, // no step back after the swing: it sidesteps instead
    close: 140, // px/s stepping back in (fast: soldiers step in at walk × 0.6)
  },
  dodge: {
    time: 0.18, // s of sidestep after each swing
    speed: 0.8, // × runSpeed
  },
};

const D = person({
  type: 'deckhand',
  og: 'Deckhand (ours)', // no OG original; a name so the generic possess tests drive it
  radius: 9, // OG-raw (×1.1 on register)
  maxHp: T.hp,
  melee: true,
  strength: 0.7,
  walkSpeed: T.walk,
  runSpeed: T.run,
  brushSpacing: 21,
  look: { attack: { time: 0.25 } },
  weapon: T.cutlass,
  init(world, u) { initB(u); u.cooldown = world.rng() * T.cutlass.cooldown; },
  brain(world, u) {
    if (begin(world, u, T.cutlass)) return;
    if (meleeBody(world, u, T.cutlass) !== 2) return;
    // sidestep after the swing: off to one side of the target (brain.js runs the dodge mover after this brain)
    const t = world.unitById(u.target);
    if (!t) return;
    const dx = t.x - u.x, dy = t.y - u.y, d = (hypot(dx, dy) || 1) / T.dodge.speed, side = world.rng() < 0.5 ? -1 : 1;
    u.dodgeX = (-dy / d) * side; u.dodgeY = (dx / d) * side;
    u.dodgeDelay = 0; u.dodgeTime = T.dodge.time;
  },
});
export default D;
export { T };
