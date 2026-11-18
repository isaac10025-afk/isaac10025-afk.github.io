// grenadier (OG "Grenadier", type 6): lobs grenades at the middle of enemy clumps 80-230 px away. Won't throw near
// its own faction, but the blast hurts everyone. May drop a live grenade when killed. OG game.js:4002-4192.
import { registerUnit } from '../../defs.js';
import { fireProjectile, registerBlast } from '../../combat/index.js';
import { ENEMY } from '../../factions.js';
import {
  DT, S, FACTION, LOCO, INTEL, SOLDIER_FLOCK, SOLDIER_MORALE, setState, targetOf, hasLos, inRange, advance, sidestep,
  closeIn, oddsPush, followContact, flee, angDiff, range, tri, signed, rint, dodgeWarn, setAttack, attackOf, emit, hyp,
} from './_shared.js';

// Blast def `Ee` (OG game.js:4002-4013), registered as 'grenade' (OG 412.t, game.js:4014).
const GRENADE_BLAST = registerBlast('grenade', Object.freeze({
  radius: 50, // OG game.js:4003
  damage: 125, // OG game.js:4004
  minFalloff: 0.2, // OG game.js:4005
  push: 220, // OG game.js:4006
  stun: 0.5, // OG game.js:4007
  noiseRadius: 380, // OG game.js:4008
  tossUp: 480, // OG game.js:4009
  tossSpeed: 190, // OG game.js:4010
  tossFrom: 0.35, // OG game.js:4011
  hatChance: 0.6, // OG game.js:4012
}));

// Throw numbers (OG game.js:4015-4018, 4063-4164).
const THROW = Object.freeze({
  range: 200, // engage range (OG game.js:4015 `_e = 200`)
  flightBase: 0.45, // flight = 0.45 + dist/420 s (OG game.js:4016)
  flightPer: 420, // OG game.js:4017 (Te = 1/420)
  friendlyGap: 8, // no own-faction unit within blast radius + 8 of the aim (OG game.js:4018 `Re = Ee.radius + 8`)
  clumpRadius: 42, // aim = centroid of enemies within 42 px of the target (OG game.js:4085)
  aimLerp: 0.35, // aim smoothing min(1, dt/0.35) (OG game.js:4103)
  minDist: 80, // OG game.js:4121
  maxMul: 1.15, // max = 1.15·200 = 230 px (OG game.js:4121)
  aimTolerance: 0.25, // OG game.js:4122
  scatterPer: 0.07, // scatter (0.07·dist + 4)·c (OG game.js:4126)
  scatterBase: 4, // OG game.js:4126
  damageJitter: 12, // 125 + 12·signed() (OG game.js:4143)
  bouncesMax: 4, // int(4) → 0-3 bounces (OG game.js:4153)
  apexPer: 0.3, // apex = 0.3·dist (OG game.js:4151)
  cooldown: 1.7, // 1.7 + 0.5·next() (OG game.js:4158)
  cooldownJitter: 0.5, // OG game.js:4158
  magazine: 6, // OG game.js:4063
  reloadTime: 4, // empty: 4·range(0.9, 1.15) (OG game.js:4117); idle top-up 4 (OG game.js:4164)
  reloadLo: 0.9, // OG game.js:4117
  reloadHi: 1.15, // OG game.js:4117
  initCooldown: 1.7, // init cooldown 1.7·next() (OG game.js:4063)
  contactMemory: 4, // OG game.js:4163
});
// Death drop (OG game.js:4166-4191).
const DROP = Object.freeze({
  chance: 0.25, // passes when next() < 0.25 (OG game.js:4168)
  maxAttack: 0.5, // not mid-throw: attack <= 0.5 (OG game.js:4168)
  speed: 30, // 30·range(0.5, 1) (OG game.js:4170)
  speedLo: 0.5, // OG game.js:4170
  fuse: 0.9, // 0.9·range(0.85, 1.15) s (OG game.js:4171)
  fuseLo: 0.85, // OG game.js:4171
  fuseHi: 1.15, // OG game.js:4171
  apex: 5, // OG game.js:4188
  bounces: 0, // OG game.js:4190
});

const _aim = new Float32Array(2);
let _cx = 0, _cy = 0, _vx = 0, _vy = 0, _n = 0;
const CLUMP_CAP = 24, _clump = new Array(CLUMP_CAP).fill(null); // OG queryRadius(..., 42, enemies, scratch, 24) (game.js:4085)
function aimPoint(world, u, t) { // OG game.js:4083-4099: centroid + mean velocity of the first 24 enemies within 42 px of the target
  _cx = _cy = _vx = _vy = 0; _n = 0;
  const m = world.queryMask(t.x, t.y, THROW.clumpRadius, ENEMY[u.faction], _clump, CLUMP_CAP);
  for (let k = 0; k < m; k++) { const o = _clump[k]; if (!(o.hp > 0)) continue; _cx += o.x; _cy += o.y; _vx += o.vx; _vy += o.vy; _n++; } // OG game.js:4087-4096
  if (_n === 0) { _cx = t.x; _cy = t.y; _vx = t.vx; _vy = t.vy; _n = 1; }
  const mx = _cx / _n, my = _cy / _n;
  const fl = THROW.flightBase + hyp(mx - u.x, my - u.y) / THROW.flightPer;
  _aim[0] = mx + (_vx / _n) * fl; _aim[1] = my + (_vy / _n) * fl;
}
function ownNear(world, u, x, y, r) { // any unit of the thrower's own faction within r (OG game.js:4123-4124)
  let hit = false;
  world.query(x, y, r, (o) => { if (o.faction === u.faction) { hit = true; return true; } });
  return hit;
}
function lob(world, u, x, y, vx, vy, life, dmg, apex, bounces, tx, ty) {
  return fireProjectile(world, 'grenade', u, tx, ty, { x, y, vx, vy, life, damage: dmg, apex, bounces, blast: GRENADE_BLAST, warn: false });
}

function throwGrenade(world, u) { // OG game.js:4114-4160
  const b = u.b;
  if (u.cooldown > 0 || b.reload > 0) return;
  if (b.ammo === 0) { b.reload = THROW.reloadTime * range(world, THROW.reloadLo, THROW.reloadHi); return; } // OG game.js:4117
  const ex = b.aimX - u.x, ey = b.aimY - u.y, o = hyp(ex, ey);
  if (o < THROW.minDist || o > THROW.maxMul * THROW.range) return; // OG game.js:4121
  if (Math.abs(angDiff(u.heading, Math.atan2(ey, ex))) > THROW.aimTolerance) return; // OG game.js:4122
  if (ownNear(world, u, b.aimX, b.aimY, GRENADE_BLAST.radius + THROW.friendlyGap)) return; // OG game.js:4123-4124
  const c = 1 - u.morale + 1 + hyp(u.vx, u.vy) / D.walkSpeed; // OG game.js:4125
  const sc = (THROW.scatterPer * o + THROW.scatterBase) * c; // OG game.js:4126
  const hx = b.aimX + tri(world) * sc, hy = b.aimY + tri(world) * sc; // OG game.js:4127-4128
  const r = u.radius, sx = u.x + Math.cos(u.heading) * r, sy = u.y + Math.sin(u.heading) * r; // OG game.js:4129-4133
  const dist = hyp(hx - sx, hy - sy), fl = THROW.flightBase + dist / THROW.flightPer; // OG game.js:4134
  const dmg = GRENADE_BLAST.damage + THROW.damageJitter * signed(world); // OG game.js:4143
  const bounces = rint(world, THROW.bouncesMax); // OG game.js:4153
  const p = lob(world, u, sx, sy, (hx - sx) / fl, (hy - sy) / fl, fl, dmg, THROW.apexPer * dist, bounces, hx, hy);
  if (!p) return; // projectile pool full (OG game.js:4148)
  dodgeWarn(world, hx, hy, GRENADE_BLAST.radius, fl); // OG game.js:4154
  emit(world, 'throw', { x: u.x, y: u.y, v: 1, type: u.type }); // OG game.js:4155
  b.ammo--; setAttack(u); // OG game.js:4156-4157
  u.cooldown = THROW.cooldown + THROW.cooldownJitter * world.rng(); // OG game.js:4158
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1; // OG game.js:4159
}

const D = registerUnit({
  type: 'grenadier',
  og: 'Grenadier', // OG game.js:4023
  key: 'grenadier', // OG game.js:4022
  category: 'army',
  faction: FACTION.Grenadiers, // OG game.js:4024
  radius: 8.63, // OG game.js:4025
  radiusJitter: 0.08, // OG game.js:4026
  mass: 1, // OG game.js:4027
  maxHp: 100, // OG game.js:4028
  melee: false, // OG game.js:4029
  strength: 0.7, // OG game.js:4030
  locomotion: LOCO.Holonomic, // OG game.js:4031
  walkSpeed: 84, // OG game.js:4032
  runSpeed: 132, // OG game.js:4033
  maxSpeed: 162, // OG game.js:4034
  accel: 660, // OG game.js:4035
  decel: 660, // OG game.js:4036
  turnRate: 6, // OG game.js:4037
  turnSpeedFalloff: Infinity, // OG game.js:4038
  sightRange: 330, // OG game.js:4039
  alertSightRange: 330, // OG game.js:4040
  stickyTarget: false, // OG game.js:4041
  reactionTime: 0.35, // OG game.js:4042
  huntRange: Infinity, // OG game.js:4043
  minDistance: 120, // OG game.js:4044
  drilled: false, // OG game.js:4045
  intelligence: INTEL.Trained, // OG game.js:4046
  infectable: true, // OG game.js:4047
  flammability: 0.3, // OG game.js:4048
  brushSpacing: 21.12, // OG game.js:4049
  flock: SOLDIER_FLOCK, // OG game.js:4050 (= Soldier flock)
  morale: SOLDIER_MORALE, // OG game.js:4051 (= Soldier morale)
  look: {
    hat: true, // OG game.js:4054
    attack: { time: 0.8 }, // OG game.js:4059 (also gates the death drop)
  },
  weapon: THROW, // ours: the throw numbers, for readers
  blast: GRENADE_BLAST, // ours: the blast def, for readers
  init(world, u) { // OG game.js:4061-4064
    u.b.ammo = THROW.magazine; u.b.reload = 0; u.b.aimX = u.x; u.b.aimY = u.y;
    u.cooldown = THROW.initCooldown * world.rng();
  },
  brain(world, u, dt = DT) { // OG game.js:4065-4165
    const b = u.b;
    if (b.reload > 0) { b.reload -= dt; if (b.reload <= 0) { b.reload = 0; b.ammo = THROW.magazine; } } // OG game.js:4067
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { u.face = u.heading; return; }
    const t = targetOf(world, u);
    if (u.state === S.FLEE) { flee(world, u, t, D.runSpeed); return; }
    if (t) {
      if (b.reload > 0 && b.ammo > 0) b.reload = 0; // a target cancels a partial reload (OG game.js:4073)
      const dx = t.x - u.x, dy = t.y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if (!inRange(u, d, THROW.range)) { advance(world, u, t, dx, dy, hasLos(world, u), D.walkSpeed); return; } // OG game.js:4077-4078
      const was = u.state === S.ENGAGE;
      setState(u, S.ENGAGE);
      aimPoint(world, u, t);
      if (was) { const k = Math.min(1, dt / THROW.aimLerp); b.aimX += (_aim[0] - b.aimX) * k; b.aimY += (_aim[1] - b.aimY) * k; } // OG game.js:4101-4103
      else { b.aimX = _aim[0]; b.aimY = _aim[1]; } // snap on the first Engage tick (OG game.js:4104)
      u.face = Math.atan2(b.aimY - u.y, b.aimX - u.x); // OG game.js:4107
      sidestep(u, t, dx, dy, d, D); // OG game.js:4108
      closeIn(u, dx, dy, d, THROW.range, D); // OG game.js:4109
      oddsPush(world, u, t, dx, dy, d, D); // OG game.js:4110
      throwGrenade(world, u);
      return;
    }
    if (followContact(world, u, D.walkSpeed, THROW.contactMemory)) return; // OG game.js:4163
    setState(u, S.IDLE);
    if (b.ammo < THROW.magazine && b.reload <= 0) b.reload = THROW.reloadTime; // OG game.js:4164
  },
  onDeath(world, u) { // death drop (OG game.js:4166-4191)
    const b = u.b;
    if (!(b.ammo > 0) || attackOf(u) > DROP.maxAttack || world.rng() >= DROP.chance) return; // OG game.js:4168
    const a = world.rng() * Math.PI * 2; // OG game.js:4169
    const sp = DROP.speed * range(world, DROP.speedLo, 1); // OG game.js:4170
    const fuse = DROP.fuse * range(world, DROP.fuseLo, DROP.fuseHi); // OG game.js:4171
    const dmg = GRENADE_BLAST.damage + THROW.damageJitter * signed(world); // OG game.js:4180
    const lx = u.x + Math.cos(a) * sp * fuse, ly = u.y + Math.sin(a) * sp * fuse;
    const p = lob(world, u, u.x, u.y, Math.cos(a) * sp, Math.sin(a) * sp, fuse, dmg, DROP.apex, DROP.bounces, lx, ly);
    if (!p) return;
    dodgeWarn(world, lx, ly, GRENADE_BLAST.radius, fuse); // OG game.js:4190
  },
});
