// Barrel (prop): never moves by itself, leaks oil when punctured or tipped, floats in deep water, and blows up
// (8 oil puddles, then the barrel blast) when its fuse ends. OG module 572 (game.js:14587-14765).
import { registerUnit } from '../../defs.js';
import { F, INT } from '../../factions.js';
import { DT, STATE, QUERY_MARGIN, LOCO, setState } from '../../const.js';
import { isDeepAt } from '../../terrain/water.js';
import { deps } from '../../terrain/deps.js';
import { BARREL, BARREL_BLAST } from '../../terrain/props.js';

const B = BARREL;

// Schedule the blast: now + base × rand(0.6, 1.4); an earlier fuse already set is kept (OG game.js:14749-14753).
function fuse(world, u, base) {
  const at = world.time + base * (B.fuseJitterLo + (B.fuseJitterHi - B.fuseJitterLo) * world.rng());
  if (u.b.fuse === 1 && u.b.fuseAt <= at) return;
  u.b.fuse = 1; u.b.fuseAt = at;
}
// Tip over away from (dx,dy)'s source: lies down, slides at 110 px/s, leaks 3.5 s (OG game.js:14754-14762).
function tip(world, u, dx, dy) {
  u.prone = 1; u.heading = Math.atan2(dy, dx);
  u.vx = B.tipSpeedOut * dx; u.vy = B.tipSpeedOut * dy;
  u.b.leakEnd = world.time + B.tipLeak;
  world.emit('puff', { kind: 'dust', x: u.x, y: u.y, ang: 0, size: 0.6 });
}
// Upright barrel tips when it moves > 60 px/s itself, or a toucher closes on it with speed × mass ≥ 420
// (150 if that toucher is airborne or stunned; resting props are ignored). OG looks at the first 16 units near it
// (OG game.js:14680-14699).
let _b = null, _seen = 0, _hit = false, _hitX = 0, _hitY = 0;
function shoveTest(o) {
  const u = _b;
  if (++_seen > B.tipQueryMax) return true;
  if (o === u || o.hp <= 0 || o.z > B.tipHigh * u.radius) return false;
  const loose = o.z > 0 || o.vz > 0 || o.stun > 0;
  if (o.def.prop && !loose) return false;
  const lx = u.x - o.x, ly = u.y - o.y, f = Math.hypot(lx, ly) || 0.001;
  if (f > u.radius + o.radius + B.tipGap) return false;
  const v = (o.vx * lx + o.vy * ly) / f;
  if (v > 0 && v * o.mass >= (loose ? B.tipShoveLoose : B.tipShove)) { _hit = true; _hitX = lx / f; _hitY = ly / f; return true; }
  return false;
}
function tipCheck(world, u) {
  const sp = Math.hypot(u.vx, u.vy);
  if (sp > B.tipSpeed) { tip(world, u, u.vx / sp, u.vy / sp); return; }
  _b = u; _seen = 0; _hit = false;
  world.query(u.x, u.y, u.radius + QUERY_MARGIN + B.tipGap, shoveTest);
  _b = null;
  if (_hit) tip(world, u, _hitX, _hitY);
}

registerUnit({
  type: 'barrel', og: 'Barrel', category: 'terrain',
  // Barrel is {...Soldier, overrides} in OG; the only Soldier field it keeps that matters is turnSpeedFalloff ∞.
  swims: true, faction: F.Props, prop: true,
  radius: 9, radiusJitter: 0.03, mass: 40, density: 2, conductivity: 2, maxHp: 45,
  melee: false, strength: 0, locomotion: LOCO.HOLONOMIC,
  walkSpeed: 0, runSpeed: 0, maxSpeed: 0, accel: 160, decel: 500, turnRate: 0, turnSpeedFalloff: Infinity,
  sightRange: 0, alertSightRange: 0, stickyTarget: false, reactionTime: 0, huntRange: 0, minDistance: 0,
  drilled: false, intelligence: INT.Mindless, infectable: false, flammability: 0.9, brushSpacing: 19,
  flock: { personalSpace: 1, separation: 0, alignment: 0, cohesion: 0, formation: 0, herd: 0, herdSpacing: 0,
    flockByState: [0, 0, 0, 0, 0, 0], formationByState: [0, 0, 0, 0, 0, 0] },
  // Zombie morale with deathFear 0 (OG game.js:14660, 12369-12385).
  morale: { baseline: 1, oddsWeight: 0, fearWeight: 0, casualtyWeight: 0, woundWeight: 0, hitShock: 0, suppression: 0,
    canBreak: false, breakAt: 0, rallyAt: 1, minFleeTime: 0, dropRate: 1, recoverRate: 1, panicFear: 0, deathFear: 0 },
  look: { attack: { time: 0.1, kick: 0 } },
  init(world, u) { u.b.fuse = 0; u.b.fuseAt = 0; u.b.leakEnd = 0; u.b.leakRate = 0; },   // OG game.js:14664-14666
  brain(world, u) {
    u.goalX = 0; u.goalY = 0; u.face = u.heading; setState(u, STATE.IDLE);
    if (u.burning > 0) fuse(world, u, B.fuseBurning);
    if (u.prone === 0) tipCheck(world, u);
    if (world.time < u.b.leakEnd) {                                   // leaking (OG game.js:14700-14713)
      const r = u.radius;
      if (u.prone === 1) {
        const side = Math.cos(u.heading) >= 0 ? 1 : -1;
        deps.pour(world, u.x + side * r * B.leakSide + B.leakJitter * (2 * world.rng() - 1), u.y + B.leakJitter * (2 * world.rng() - 1), (B.leakTotal / B.leakTipped) * DT);
      } else {
        const a = world.rng() * Math.PI * 2;
        deps.pour(world, u.x + Math.cos(a) * r * B.leakOut, u.y + Math.sin(a) * r * B.leakOut + B.leakDown * r, (B.leakTotal / B.leakStanding) * Math.max(1, u.b.leakRate) * DT);
      }
    }
    if (u.b.fuse === 1 && world.time >= u.b.fuseAt) u.hp = 0;         // OG game.js:14714
    if (u.z <= 0 && isDeepAt(world, u.x, u.y)) {                       // drift (OG game.js:14715-14720)
      u.wander += (2 * world.rng() - 1) * B.floatTurn * DT;
      const nx = u.x + Math.cos(u.wander) * B.floatSpeed * DT, ny = u.y + Math.sin(u.wander) * B.floatSpeed * DT;
      if (isDeepAt(world, nx, ny)) { u.x = nx; u.y = ny; } else u.wander += 0.5 * Math.PI;
    }
  },
  // OG onDamaged: a hit that would kill sets hp back to 1 and lights a 0.15 s fuse (OG game.js:14722-14725).
  onHit(world, u) { if (!(u.hp > 0)) { u.hp = 1; fuse(world, u, B.fuseKilled); } },
  // 8 oil puddles, then the blast; no killer credited (OG game.js:14726-14735).
  onDeath(world, u) {
    for (let k = 0; k < B.oilPuddles; k++) {
      const a = (k / B.oilPuddles) * Math.PI * 2 + B.oilSpread * world.rng();
      const d = B.oilReach * (B.oilReachMin + (1 - B.oilReachMin) * world.rng());
      deps.pour(world, u.x + Math.cos(a) * d, u.y + Math.sin(a) * d, B.oilEach);
    }
    deps.explode(world, u.x, u.y, BARREL_BLAST, -1);
  },
  // Arrows always puncture (no damage); a bullet punctures only if no leak was ever started, 60 % of the time.
  // A new puncture leaks 9 s, or 4.5 s at double rate when the bullet passes through (OG game.js:14737-14744).
  onPunctured(world, u, isBullet, passes) {
    const leaking = u.b.leakEnd > 0;
    if (isBullet && (leaking || world.rng() >= B.punctureChance)) return false;
    if (!leaking) { u.b.leakEnd = world.time + (passes ? B.leakThrough : B.leakArrow); u.b.leakRate = passes ? 2 : 1; }
    return true;
  },
  onLanded(world, u, impact) { if (impact > B.landingSpeed) fuse(world, u, B.fuseLanding); },  // OG game.js:14745-14747
});
