// Tree (prop): built on Barrel's def ({...Barrel, overrides} in OG), with its own brain and hooks. Never moves, burns
// once (13.2 s), drops leaves when hit, falls with 3 dust puffs. Snipers climb it and shooters hide behind it
// (tree-side helpers in terrain/props.js). OG module 626 (game.js:18804-18892).
import './barrel.js';
import { registerUnit, getDef } from '../../defs.js';
import { F } from '../../factions.js';
import { STATE, setState, hash2 } from '../../const.js';
import { TREE } from '../../terrain/props.js';

// Leaf puffs: look only, at most every 0.25 s, not once singed or while burning (OG game.js:18819-18831).
function leaves(world, u, amount) {
  if (u.singed === 1 || u.burning > 0 || world.time - (u.b.leafAt ?? -Infinity) < TREE.leafCooldown) return;
  u.b.leafAt = world.time;
  const r = u.radius, off = 0.25 * (u.wander - 0.5) * r * 3.2, n = 2 + (amount > TREE.leafBig ? 1 : 0);
  for (let e = 0; e < n; e++) {
    const h = (k) => hash2(u.index, 8 * world.tick + 3 * e + k);
    world.emit('puff', { kind: 'leaf', x: u.x + off + 2.6 * (2 * h(0) - 1) * r, y: u.y + 6 * (2 * h(2) - 1), ang: h(2) * Math.PI * 2, size: (4.8 + (2 * h(1) - 1)) * r });
  }
}

const barrel = getDef('barrel');
registerUnit({
  ...barrel,
  type: 'tree', og: 'Tree', category: 'terrain', faction: F.Props, prop: true,
  radius: 5.5, radiusJitter: 0.15, mass: 1000, density: 99, conductivity: 0.5, maxHp: 700,
  flammability: 0.45, burnTime: 13.2, fireReach: 36, burnsOnce: true, brushSpacing: 30,
  look: { fur: true, attack: { time: 0.1, kick: 0 } },   // fur: singed when lit, so burnsOnce holds (OG game.js:18853, 8856)
  init(world, u) { u.wander = world.rng(); },             // OG game.js:18860-18862
  brain(world, u) {
    if (u.burning > 0 && !u.b.burnTotal) u.b.burnTotal = u.burning;   // charred-look progress (OG game.js:18864)
    u.goalX = 0; u.goalY = 0; u.face = u.heading; setState(u, STATE.IDLE);
  },
  onHit(world, u, amount) { leaves(world, u, amount); },  // OG onDamaged (game.js:18868-18870)
  // Bullets damage it normally (false = not punctured); arrows stick and puff leaves (OG game.js:18871).
  onPunctured(world, u, isBullet) { if (!isBullet) leaves(world, u, 0); return false; },
  onLanded: undefined,
  onDeath(world, u) {                                      // OG game.js:18873-18884 (TreeFall sound comes from lifecycle)
    for (let k = 0; k < TREE.fallDust; k++)
      world.emit('puff', { kind: 'dust', x: u.x + 6 * (2 * world.rng() - 1), y: u.y + 4 * (2 * world.rng() - 1), ang: world.rng() * Math.PI * 2, size: 0.7 });
  },
});
