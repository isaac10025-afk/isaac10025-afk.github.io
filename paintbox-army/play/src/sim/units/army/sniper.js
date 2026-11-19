// sniper (OG "Sniper", type 4): long-range picker. Never walks toward the enemy (holdsGround). Settles and fires slow,
// piercing shots out to 450 px; lies prone for ×1.35 damage; climbs trees for range ×1.2 and stealth.
// OG def + brain game.js:16330-16563 (rifle brain = CORE-B gunBrain, OG 495.f).
import { registerUnit } from '../../defs.js';
import { gunBrain, gunInit } from '../../combat/index.js';
import {
  DT, S, FACTION, LOCO, INTEL, SOLDIER_FLOCK, SOLDIER_MORALE, PERCH_H, setState, peekTarget, wetAt, hashRoll, signed,
  turnToward, emit, hyp, anyWater,
  anyWalls, wallLine,
} from './_shared.js';

// Standing rifle `y` (OG game.js:16347-16368).
const STAND = Object.freeze({
  range: 450, // OG game.js:16348
  projectileSpeed: 2250, // OG game.js:16349
  damage: 70, // OG game.js:16350
  damageJitter: 10, // OG game.js:16351
  noiseRadius: 420, // OG game.js:16352
  tracer: 140, // OG game.js:16353
  smokeTrail: true, // OG game.js:16354
  smoke: 1.6, // OG game.js:16355
  penetration: 3, // OG game.js:16356
  cooldown: 3, // OG game.js:16357
  cooldownJitter: 0.8, // OG game.js:16358
  magazine: 5, // OG game.js:16359
  reloadTime: 3.6, // OG game.js:16360
  spread: 0.012, // OG game.js:16361
  aimTolerance: 0.08, // OG game.js:16362
  movingPenalty: 3, // OG game.js:16363
  steadySpeed: 12, // OG game.js:16364
  settleTime: 0.6, // OG game.js:16365
  contactMemory: 4, // OG game.js:16366
  holdsGround: true, // OG game.js:16367
});
// Prone `w`: damage ×1.35, spread ×0.3 (OG game.js:16369).
const PRONE_DMG = 1.35, PRONE_SPREAD = 0.3; // OG game.js:16369
const PRONE = Object.freeze({ ...STAND, damage: STAND.damage * PRONE_DMG, spread: STAND.spread * PRONE_SPREAD });
// Perched `A`: range ×1.2 (OG game.js:16372, r.d = 1.2 at game.js:9011).
const PERCH_RANGE = 1.2; // OG game.js:9011
const PERCHED = Object.freeze({ ...STAND, range: STAND.range * PERCH_RANGE });

// Prone and perch numbers (OG game.js:16370-16371, 16419-16562).
const P = Object.freeze({
  proneMinTarget: 300, // wants to lie down with a target >= 300 px away (OG game.js:16540)
  proneQuitTarget: 260, // gives up under 260 px (OG game.js:16536)
  proneRate: 0.4, // chance 0.4·dt per tick (OG game.js:16544)
  proneIdleQuit: 4, // gives up after > 4 s Idle (OG game.js:16535)
  lieDown: 0.7, // s to lie down (OG game.js:16549)
  standUp: 0.55, // s to stand up (OG game.js:16550)
  perchEvery: 20, // perch search every 20 ticks ... (OG game.js:16508)
  perchRoll: 10 / 60, // ... with a roll < 10/60 (OG game.js:16508)
  perchNoTarget: 160, // no target within 160 px to look for a tree; stays-up check (OG game.js:16370 x = 160, 16510)
  perchSearch: 150, // trees within radius + 150 (OG game.js:16513)
  perchQuitTarget: 100, // walking to the tree: a target under 100 px makes it give up (OG game.js:16443)
  climbTime: 1.1, // OG game.js:16371 (k = 1.1)
  climbReach: 6, // starts climbing within r + r_tree + 6 (OG game.js:16446)
  slipOff: 12, // farther than r + r_tree + 12 from the tree while climbed → drops off (OG game.js:16470)
  downAfter: 8, // wants to move with no target within 160 for 8 s → climbs down (OG game.js:16472)
  snap: 8, // pulled to the tree at min(1, 8·dt) (OG game.js:16482)
  hideFired: 350, // spotted within 350 px for 1.2 s after firing ... (OG game.js:16497)
  hideFiredTime: 1.2, // OG game.js:16497
  hide: 90, // ... else within 90 px (OG game.js:16497)
  jumpVz: 60, // jump down: vz 60 (OG game.js:16561 E = 60)
  jumpVy: 70, // vy 70, vx ±35 (OG game.js:16562 O = 70)
});

// Tree claims: tree -> sniper id (OG keeps it on the tree as role/aimY, game.js:16527-16528).
const CLAIMS = new WeakMap();
function treeFree(world, tree, u) { // OG `M` (game.js:16555-16560)
  if (!tree || tree.dead || tree.type !== 'tree' || !(tree.hp > 0) || tree.burning > 0 || tree.singed === 1) return false;
  const id = CLAIMS.get(tree);
  if (id === undefined || id === u.id) return true;
  const s = world.unitById(id);
  return !s || s.perch !== tree.id;
}
function jumpDown(world, u) { // OG game.js:16461-16469
  u.z = Math.max(u.z, u.climb * PERCH_H); u.vz = P.jumpVz; u.vy = P.jumpVy; u.vx = signed(world) * P.jumpVy * 0.5;
  u.perch = -1; u.climb = 0; u.hidden = 0;
  emit(world, 'dust', { x: u.x, y: u.y - PERCH_H, v: 0.6, type: u.type });
}
// Up-a-tree step (OG game.js:16419-16499). Returns true if it handled this tick.
function perchStep(world, u, dt) {
  const b = u.b, tree = world.unitById(u.perch);
  const ok = !!tree && tree.type === 'tree' && tree.hp > 0 && !(tree.burning > 0) && tree.singed !== 1; // OG game.js:16423-16427
  const ox = tree ? tree.x : u.x, oy = tree ? tree.y + 1 : u.y, tr = tree ? tree.radius : 0;
  const t = peekTarget(world, u), climb = u.climb || 0;
  if (climb === 0) { // still walking to the tree (OG game.js:16431-16453)
    const ax = ox - u.x, ay = oy - u.y, h = hyp(ax, ay) || 0.001;
    if (!ok || u.burning > 0 || u.state === S.FLEE || (t && hyp(t.x - u.x, t.y - u.y) < P.perchQuitTarget)) { u.perch = -1; return false; }
    if (anyWalls(world) && !wallLine(world, u.x, u.y, ox, oy)) { u.perch = -1; return false; } // OURS (attack 3): TREE_LOS below
    if (h > u.radius + tr + P.climbReach) {
      setState(u, S.ADVANCE);
      u.goalX = (ax / h) * D.walkSpeed; u.goalY = (ay / h) * D.walkSpeed; u.face = Math.atan2(ay, ax);
      return true;
    }
  }
  if (!ok || u.burning > 0) { jumpDown(world, u); return true; } // tree dies / burns, or sniper catches fire (OG game.js:16455)
  if (climb > 0 && hyp(ox - u.x, oy - u.y) > u.radius + tr + P.slipOff) { u.perch = -1; u.climb = 0; u.hidden = 0; return false; } // OG game.js:16472
  const down = climb > 0 && b.perchTimer > 0 && world.time - b.perchTimer > P.downAfter; // OG game.js:16473
  u.climb = down ? Math.max(0, climb - dt / P.climbTime) : Math.min(1, climb + dt / P.climbTime); // OG game.js:16474
  u.prone = 0; b.proneWant = 0;
  if (down && u.climb === 0) { u.perch = -1; b.perchTimer = 0; u.hidden = 0; u.y = oy + tr + u.radius; return true; } // OG game.js:16476-16478
  const k = Math.min(1, P.snap * dt), ty = down ? oy + (tr + u.radius) * (1 - u.climb) : oy; // OG game.js:16479-16480
  u.x += (ox - u.x) * k; u.y += (ty - u.y) * k;
  if (u.climb < 1) u.cooldown = Math.max(u.cooldown, dt); // can't fire until fully up (OG game.js:16484)
  else {
    gunBrain(world, u, PERCHED); // range 540 up top (OG game.js:16486)
    const near = t && hyp(t.x - u.x, t.y - u.y) < P.perchNoTarget;
    if ((u.goalX === 0 && u.goalY === 0) || near) b.perchTimer = 0; else if (b.perchTimer === 0) b.perchTimer = world.time; // OG game.js:16487-16491
  }
  u.goalX = u.goalY = 0; u.vx = u.vy = 0; // never moves up there (OG game.js:16493-16494)
  if (!Number.isNaN(u.face)) u.heading = turnToward(u.heading, u.face, D.turnRate * dt); // OG game.js:16495
  u.hidden = u.climb < 0.5 ? 0 : (u.firedAt > 0 && world.time - u.firedAt < P.hideFiredTime ? P.hideFired : P.hide); // OG game.js:16497
  return true;
}
// OURS (attack 3, 11-18): TREE_LOS. A sniper (ape, giant: same rule in their files) took the nearest free tree within
// 150 px and walked to it in a straight line, walls or not, so on the step-7 maps (village, castle) one picked a tree on
// the far side of a wall and stood pressed into the wall until a target came within 100 px (village: 13-20 s). OG does
// the same; its painted fields rarely have a wall between a sniper and a tree that close. Now only a tree it can see is
// picked, and one walking to its tree gives it up if a wall comes between them.
// Look for a tree to climb (OG game.js:16506-16529).
function perchSearch(world, u) {
  if ((world.tick + u.index) % P.perchEvery !== 0 || hashRoll(u.index, world.tick) >= P.perchRoll) return;
  if (u.state === S.FLEE || u.burning > 0 || u.stun > 0 || u.z > 0) return;
  const t = peekTarget(world, u);
  if (t && hyp(t.x - u.x, t.y - u.y) < P.perchNoTarget) return;
  let best = null, bd = Infinity;
  const walled = anyWalls(world);
  world.query(u.x, u.y, u.radius + P.perchSearch, (o) => {
    if (o.faction !== FACTION.Props || !treeFree(world, o, u)) return;
    if (walled && !wallLine(world, u.x, u.y, o.x, o.y)) return; // OURS: TREE_LOS
    const d = hyp(o.x - u.x, o.y - u.y);
    if (d < bd) { bd = d; best = o; }
  });
  if (!best) return;
  u.perch = best.id; u.climb = 0; u.b.perchTimer = 0; CLAIMS.set(best, u.id); // OG game.js:16523-16528
}

const D = registerUnit({
  type: 'sniper',
  og: 'Sniper', // OG game.js:16376
  key: 'sniper', // OG game.js:16375
  category: 'army',
  faction: FACTION.Snipers, // OG game.js:16377
  radius: 8.63, // OG game.js:16378
  radiusJitter: 0.08, // OG game.js:16379
  mass: 1, // OG game.js:16380
  maxHp: 80, // OG game.js:16381
  melee: false, // OG game.js:16382
  strength: 0.5, // OG game.js:16383
  locomotion: LOCO.Holonomic, // OG game.js:16384
  walkSpeed: 66, // OG game.js:16385
  runSpeed: 102, // OG game.js:16386
  maxSpeed: 126, // OG game.js:16387
  accel: 480, // OG game.js:16388
  decel: 480, // OG game.js:16389
  turnRate: 5, // OG game.js:16390
  turnSpeedFalloff: Infinity, // OG game.js:16391
  sightRange: 500, // OG game.js:16392
  alertSightRange: 500, // OG game.js:16393
  stickyTarget: false, // OG game.js:16394
  reactionTime: 0.45, // OG game.js:16395
  huntRange: Infinity, // OG game.js:16396
  minDistance: 250, // OG game.js:16397
  drilled: false, // OG game.js:16398
  intelligence: INTEL.Trained, // OG game.js:16399
  infectable: true, // OG game.js:16400
  flammability: 0.3, // OG game.js:16401
  brushSpacing: 21.12, // OG game.js:16402
  flock: Object.freeze({ ...SOLDIER_FLOCK, // OG game.js:16403 (Soldier flock with overrides)
    alignment: 0, // OG game.js:16403
    formationByState: [0.5, 0.5, 0, 0, 0, 0], // OG game.js:16403
  }),
  morale: SOLDIER_MORALE, // OG game.js:16404 (= Soldier morale)
  look: {
    hat: true, // OG game.js:16407
    attack: { time: 0.5 }, // OG game.js:16413
  },
  weapon: STAND, // ours: standing rifle; prone / perched variants below
  weaponProne: PRONE,
  weaponPerched: PERCHED,
  init(world, u) { gunInit(world, u, STAND); u.b.proneWant = 0; u.b.perchTimer = 0; }, // OG game.js:16415-16417
  brain(world, u, dt = DT) { // OG game.js:16418-16553
    const b = u.b;
    if (u.perch >= 0 && perchStep(world, u, dt)) return;
    const e = u.prone || 0;
    gunBrain(world, u, e >= 1 ? PRONE : STAND); // OG game.js:16503
    if (e === 0 && !b.proneWant) perchSearch(world, u); // OG game.js:16504-16505
    const t = peekTarget(world, u), o = t ? hyp(t.x - u.x, t.y - u.y) : Infinity, s = u.state;
    const moving = u.goalX !== 0 || u.goalY !== 0;
    if (b.proneWant === 1) { // OG game.js:16532-16536
      if (o < P.proneQuitTarget || moving || (s === S.IDLE && u.stateTime > P.proneIdleQuit) || s === S.FLEE) b.proneWant = 0;
    } else if (t && !(u.cover >= 0) && o >= P.proneMinTarget && (s === S.ENGAGE || s === S.ALERT) && !moving && u.stun <= 0 &&
      world.rng() < P.proneRate * dt) b.proneWant = 1; // OG game.js:16537-16545
    if (anyWater(world) && wetAt(world, u)) b.proneWant = 0; // never prone in water (OG game.js:16546)
    if (b.proneWant === 1 && e < 1) u.prone = Math.min(1, e + dt / P.lieDown); // OG game.js:16548-16549
    else if (b.proneWant === 0 && e > 0) u.prone = Math.max(0, e - dt / P.standUp); // OG game.js:16550
    if (u.prone > 0) { u.goalX = u.goalY = 0; if (u.prone < 1) u.cooldown = Math.max(u.cooldown, dt); } // OG game.js:16551-16552
  },
});
