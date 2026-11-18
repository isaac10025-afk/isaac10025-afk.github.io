// flamer (OG "Flamethrower", type 3): short-range flame stream that sets enemies alight. Fireproof itself,
// no spraying while standing in water. OG def + brain game.js:3896-3999.
import { registerUnit } from '../../defs.js';
import { fireProjectile } from '../../combat/index.js';
import {
  DT, S, FACTION, LOCO, INTEL, SOLDIER_FLOCK, SOLDIER_MORALE, setState, targetOf, hasLos, inRange, advance, sidestep,
  closeIn, oddsPush, followContact, flee, wetAt, angDiff, range, tri, noise, setAttack, emit,
} from './_shared.js';

// Flame stream numbers (inline in OG, game.js:3897, 3941-3998).
const FLAME = Object.freeze({
  range: 80, // OG game.js:3955
  leadPer: 300, // aim lead = min(d/300, 0.3) s (OG game.js:3957)
  leadMax: 0.3, // OG game.js:3957
  aimTolerance: 0.3, // OG game.js:3970
  spread: 0.22, // angle + 0.22·tri() (OG game.js:3971)
  speed: 300, // ×range(0.85, 1.1) (OG game.js:3972)
  speedLo: 0.85, // OG game.js:3972
  speedHi: 1.1, // OG game.js:3972
  muzzle: 1.7, // spawn 1.7·radius ahead (OG game.js:3977)
  life: 0.5, // ×range(0.85, 1.1) s (OG game.js:3981)
  damage: 2, // per puff (OG game.js:3982)
  cooldown: 1 / 30, // OG game.js:3897 (Ae = 1/30): 30 puffs/s
  magazine: 90, // OG game.js:3941
  reloadTime: 2.2, // no jitter, empty or idle top-up (OG game.js:3969, 3998)
  initCooldown: 0.3, // init cooldown = 0.3·next() (OG game.js:3941)
  noiseAmount: 0.03, // OG game.js:3988
  noiseRadius: 180, // OG game.js:3988
  contactMemory: 4, // OG game.js:3997
});

function spray(world, u, aim) { // OG game.js:3966-3993
  const b = u.b;
  if (u.cooldown > 0 || b.reload > 0) return;
  if (b.ammo === 0) { b.reload = FLAME.reloadTime; return; } // OG game.js:3969
  if (Math.abs(angDiff(u.heading, aim)) > FLAME.aimTolerance) return; // OG game.js:3970
  const a = aim + FLAME.spread * tri(world); // OG game.js:3971
  const sp = FLAME.speed * range(world, FLAME.speedLo, FLAME.speedHi); // OG game.js:3972
  const c = Math.cos(a), s = Math.sin(a), r = u.radius;
  const x = u.x + c * r * FLAME.muzzle, y = u.y + s * r * FLAME.muzzle; // OG game.js:3977-3978
  const life = FLAME.life * range(world, FLAME.speedLo, FLAME.speedHi); // OG game.js:3981
  const vx = c * sp, vy = s * sp;
  fireProjectile(world, 'flame', u, x + vx * life, y + vy * life, { x, y, vx, vy, life, damage: FLAME.damage }); // OG game.js:3974-3985
  noise(world, u.x, u.y, FLAME.noiseAmount, FLAME.noiseRadius); // OG game.js:3988
  b.ammo--; // OG game.js:3989
  emit(world, 'flame', { x: u.x, y: u.y, v: 1, type: u.type }); // OG game.js:3990
  setAttack(u); // OG game.js:3991
  u.cooldown = FLAME.cooldown; // OG game.js:3992
}

const D = registerUnit({
  type: 'flamer',
  og: 'Flamethrower', // OG game.js:3901
  key: 'flamethrower', // OG game.js:3900
  category: 'army',
  faction: FACTION.Flamers, // OG game.js:3902
  radius: 8.63, // OG game.js:3903
  radiusJitter: 0.08, // OG game.js:3904
  mass: 1.1, // OG game.js:3905
  conductivity: 1.8, // OG game.js:3906
  maxHp: 100, // OG game.js:3907
  melee: false, // OG game.js:3908
  strength: 0.9, // OG game.js:3909
  locomotion: LOCO.Holonomic, // OG game.js:3910
  walkSpeed: 90, // OG game.js:3911
  runSpeed: 132, // OG game.js:3912
  maxSpeed: 162, // OG game.js:3913
  accel: 720, // OG game.js:3914
  decel: 720, // OG game.js:3915
  turnRate: 6, // OG game.js:3916
  turnSpeedFalloff: Infinity, // OG game.js:3917
  sightRange: 330, // OG game.js:3918
  alertSightRange: 330, // OG game.js:3919
  stickyTarget: false, // OG game.js:3920
  reactionTime: 0.35, // OG game.js:3921
  huntRange: Infinity, // OG game.js:3922
  minDistance: 40, // OG game.js:3923
  drilled: false, // OG game.js:3924
  intelligence: INTEL.Trained, // OG game.js:3925
  infectable: true, // OG game.js:3926
  flammability: 0, // OG game.js:3927 (fireproof: flames pass through it)
  brushSpacing: 21.12, // OG game.js:3928
  flock: SOLDIER_FLOCK, // OG game.js:3929 (= Soldier flock)
  morale: SOLDIER_MORALE, // OG game.js:3930 (= Soldier morale)
  look: {
    attack: { time: 0.12 }, // OG game.js:3937
  },
  weapon: FLAME, // ours: the stream numbers, for readers
  init(world, u) { // OG game.js:3939-3942
    u.b.ammo = FLAME.magazine; u.b.reload = 0;
    u.cooldown = FLAME.initCooldown * world.rng();
  },
  brain(world, u, dt = DT) { // OG game.js:3943-3999
    const b = u.b;
    if (b.reload > 0) { b.reload -= dt; if (b.reload <= 0) { b.reload = 0; b.ammo = FLAME.magazine; } } // OG game.js:3945
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.face = u.heading; return; }
    const t = targetOf(world, u);
    if (u.state === S.FLEE) { flee(world, u, t, D.runSpeed); return; }
    if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const clear = hasLos(world, u);
      if (!clear || !inRange(u, d, FLAME.range)) { advance(world, u, t, dx, dy, clear, D.walkSpeed); return; } // OG game.js:3955
      setState(u, S.ENGAGE);
      const lead = Math.min(d / FLAME.leadPer, FLAME.leadMax); // OG game.js:3957
      const aim = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
      u.face = aim;
      sidestep(u, t, dx, dy, d, D); // OG game.js:3961
      closeIn(u, dx, dy, d, FLAME.range, D); // OG game.js:3962
      oddsPush(world, u, t, dx, dy, d, D); // OG game.js:3963
      if (!wetAt(world, u)) spray(world, u, aim); // no fire in water (OG game.js:3965)
      return;
    }
    if (followContact(world, u, D.walkSpeed, FLAME.contactMemory)) return; // OG game.js:3997
    setState(u, S.IDLE);
    if (b.ammo < FLAME.magazine && b.reload <= 0) b.reload = FLAME.reloadTime; // OG game.js:3998
  },
});
