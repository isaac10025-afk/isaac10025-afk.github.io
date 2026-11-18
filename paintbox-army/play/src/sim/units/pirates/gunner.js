// gunner (OURS, Pirates tab, spawned only): a cannon's crew. Stands at its slot behind the cannon and walks with it;
// hits anyone who comes right up (cutlass 10). If the cannon is lost it fights on as a normal pirate.
// Poses: `atk` slash; swimming → `swim`. No b.act codes.
import { person, initB, begin, meleeBody } from './_lib.js';

const T = {
  hp: 70, // hit points
  walk: 85, // px/s
  run: 150, // px/s (keeps up with the cannon, runs back to its slot)
  cutlass: {
    damage: 10, // per slash
    damageJitter: 2, // ±
    cooldown: 0.8, // s between slashes
    cooldownJitter: 0.2, // + up to this much
    push: 30, // small shove
    stun: 0, // -
    reach: 6, // px past both radii
    band: 16, // px past reach still in the fight
    facing: 0.7, // rad
    circle: 0.4, // strafing
  },
};

const D = person({
  type: 'gunner',
  og: 'Gunner (ours)', // no OG original
  unpaintable: true, // spawned only (crew)
  radius: 8.8, // OG-raw
  maxHp: T.hp,
  melee: true,
  strength: 0.5,
  walkSpeed: T.walk,
  runSpeed: T.run,
  brushSpacing: 21,
  look: { attack: { time: 0.3 } },
  weapon: T.cutlass,
  init(world, u) { initB(u); u.cooldown = world.rng() * T.cutlass.cooldown; },
  brain(world, u) {
    if (begin(world, u, T.cutlass)) return;
    meleeBody(world, u, T.cutlass);
  },
});
export default D;
export { T };
