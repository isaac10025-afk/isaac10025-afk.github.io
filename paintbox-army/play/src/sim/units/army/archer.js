// archer (OG "Archer", type 7): volley fire at a predicted landing spot out to ~340 px. Arrows only hit what stands
// at the landing point. An archer that has been set alight (kindled) shoots fire arrows until it gets wet.
// OG def + brain game.js:17782-17929.
import { registerUnit } from '../../defs.js';
import { fireProjectile } from '../../combat/index.js';
import {
  DT, S, FACTION, LOCO, INTEL, SOLDIER_FLOCK, SOLDIER_MORALE, setState, targetOf, hasLos, inRange, advance, sidestep,
  oddsPush, followContact, flee, range, tri, signed, setAttack, emit, hyp, grpAlive,
} from './_shared.js';

// Bow numbers (OG game.js:17782-17785, 17843-17928).
const BOW = Object.freeze({
  range: 340, // base range 340 + 0.6·closing speed (OG game.js:17844)
  closingMul: 0.6, // OG game.js:17782 (k = 0.6), 17843
  alertClosing: 20, // out of range and closing faster than 20 px/s → Alert and wait (OG game.js:17847)
  draw: 0.6, // volley lead / solo draw 0.6·range(0.9, 1.15) s (OG game.js:17782, 17915)
  drawLo: 0.9, // OG game.js:17915
  drawHi: 1.15, // OG game.js:17915
  flightBase: 0.45, // flight = 0.45 + dist/520 s (OG game.js:17783)
  flightPer: 520, // OG game.js:17784 (S = 1/520)
  aimMaxMul: 1.15, // aim point clamped to 340·1.15 = 391 px (OG game.js:17926)
  aimLerp: 0.3, // aim smoothing min(1, dt/0.3) (OG game.js:17856)
  scatterPer: 0.05, // scatter (0.05·dist + 5)·c (OG game.js:17874)
  scatterBase: 5, // OG game.js:17874
  muzzle: 1.3, // spawn 1.3·radius ahead (OG game.js:17878)
  damage: 45, // 45 + 6·signed() (OG game.js:17890)
  damageJitter: 6, // OG game.js:17890
  apexPer: 0.35, // arc apex = 0.35·dist (OG game.js:17898)
  cooldown: 1.7 * 0.85, // 1.445 s (OG game.js:17902)
  initCooldown: 0.5, // init 0.5·next() (OG game.js:17828)
  volleyJoin: 0.35, // join the group volley if it is still >= 0.35 s away (OG game.js:17909)
  volleyReady: 1.7, // next volley ready 1.7 s after this one (OG game.js:17913)
  stagger: 0.2, // per-archer stagger ((0.618034·i) mod 1)·0.2 s (OG game.js:17907)
  contactMemory: 4, // OG game.js:17837
});

const _aim = new Float32Array(2);
function predict(u, t, d) { // OG game.js:17919-17928
  const fl = BOW.flightBase + d / BOW.flightPer;
  _aim[0] = t.x + t.vx * fl; _aim[1] = t.y + t.vy * fl;
  const rx = _aim[0] - u.x, ry = _aim[1] - u.y, a = hyp(rx, ry), h = BOW.range * BOW.aimMaxMul;
  if (a > h) { _aim[0] = u.x + (rx / a) * h; _aim[1] = u.y + (ry / a) * h; }
}

function loose(world, u) { // OG game.js:17864-17904
  const b = u.b;
  b.timer = 0;
  const ex = b.aimX - u.x, ey = b.aimY - u.y, o = hyp(ex, ey) || 1;
  const c = 1 - u.morale + 1 + hyp(u.vx, u.vy) / D.walkSpeed; // OG game.js:17873
  const sc = (BOW.scatterPer * o + BOW.scatterBase) * c; // OG game.js:17874
  const hx = b.aimX + tri(world) * sc, hy = b.aimY + tri(world) * sc; // OG game.js:17875-17876
  const r = u.radius, sx = u.x + (ex / o) * r * BOW.muzzle, sy = u.y + (ey / o) * r * BOW.muzzle; // OG game.js:17878-17879
  const dist = hyp(hx - sx, hy - sy), fl = BOW.flightBase + dist / BOW.flightPer; // OG game.js:17880-17881
  const dmg = BOW.damage + BOW.damageJitter * signed(world); // OG game.js:17890
  const p = fireProjectile(world, 'arrow', u, hx, hy, {
    x: sx, y: sy, vx: (hx - sx) / fl, vy: (hy - sy) / fl, life: fl, damage: dmg,
    apex: BOW.apexPer * dist, // OG game.js:17898
    alight: u.kindled ? 1 : 0, // fire arrow while kindled (OG game.js:17899)
  });
  if (!p) return; // pool full (OG game.js:17895)
  emit(world, 'bow', { x: u.x, y: u.y, v: 1, type: u.type }); // OG game.js:17900
  setAttack(u); // OG game.js:17901
  u.cooldown = BOW.cooldown; // OG game.js:17902
  if (world.stats) world.stats.shots = (world.stats.shots || 0) + 1; // OG game.js:17903
}

const D = registerUnit({
  type: 'archer',
  og: 'Archer', // OG game.js:17789
  key: 'archer', // OG game.js:17788
  category: 'army',
  faction: FACTION.Archers, // OG game.js:17790
  radius: 8.63, // OG game.js:17791
  radiusJitter: 0.08, // OG game.js:17792
  mass: 1, // OG game.js:17793
  maxHp: 80, // OG game.js:17794
  melee: false, // OG game.js:17795
  strength: 0.55, // OG game.js:17796
  locomotion: LOCO.Holonomic, // OG game.js:17797
  walkSpeed: 90, // OG game.js:17798
  runSpeed: 132, // OG game.js:17799
  maxSpeed: 160, // OG game.js:17800
  accel: 700, // OG game.js:17801
  decel: 700, // OG game.js:17802
  turnRate: 6, // OG game.js:17803
  turnSpeedFalloff: Infinity, // OG game.js:17804
  sightRange: 400, // OG game.js:17805
  alertSightRange: 400, // OG game.js:17806
  stickyTarget: false, // OG game.js:17807
  reactionTime: 0.35, // OG game.js:17808
  huntRange: Infinity, // OG game.js:17809
  minDistance: 200, // OG game.js:17810
  drilled: false, // OG game.js:17811
  intelligence: INTEL.Trained, // OG game.js:17812
  infectable: true, // OG game.js:17813
  flammability: 0.35, // OG game.js:17814
  brushSpacing: 21.12, // OG game.js:17815
  flock: SOLDIER_FLOCK, // OG game.js:17816 (= Soldier flock)
  morale: SOLDIER_MORALE, // OG game.js:17817 (= Soldier morale)
  look: {
    hat: true, // OG game.js:17820
    attack: { time: 0.3 }, // OG game.js:17825
  },
  weapon: BOW, // ours: the bow numbers, for readers
  init(world, u) { u.cooldown = BOW.initCooldown * world.rng(); u.b.timer = 0; u.b.aimX = u.x; u.b.aimY = u.y; }, // OG game.js:17827-17829
  brain(world, u, dt = DT) { // OG game.js:17830-17917
    const b = u.b;
    u.goalX = 0; u.goalY = 0; u.face = NaN;
    if (u.stun > 0) { b.timer = 0; u.face = u.heading; return; } // stun cancels the draw (OG game.js:17833)
    const t = targetOf(world, u);
    if (u.state === S.FLEE) { b.timer = 0; flee(world, u, t, D.runSpeed); return; } // OG game.js:17835
    if (!t) {
      b.timer = 0;
      if (followContact(world, u, D.walkSpeed, BOW.contactMemory)) return; // OG game.js:17836
      setState(u, S.IDLE); return;
    }
    const dx = t.x - u.x, dy = t.y - u.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const closing = Math.max(0, -(t.vx * dx + t.vy * dy) / d); // OG game.js:17842
    if (!inRange(u, d, BOW.range + closing * BOW.closingMul)) { // OG game.js:17843
      b.timer = 0;
      if (closing > BOW.alertClosing) { setState(u, S.ALERT); u.face = Math.atan2(dy, dx); return; } // OG game.js:17846-17847
      advance(world, u, t, dx, dy, hasLos(world, u), D.walkSpeed); return; // OG game.js:17848
    }
    const was = u.state === S.ENGAGE;
    setState(u, S.ENGAGE);
    predict(u, t, d);
    if (was) { const k = Math.min(1, dt / BOW.aimLerp); b.aimX += (_aim[0] - b.aimX) * k; b.aimY += (_aim[1] - b.aimY) * k; } // OG game.js:17855-17857
    else { b.aimX = _aim[0]; b.aimY = _aim[1]; } // OG game.js:17858
    u.face = Math.atan2(b.aimY - u.y, b.aimX - u.x); // OG game.js:17860
    sidestep(u, t, dx, dy, d, D); // OG game.js:17861
    oddsPush(world, u, t, dx, dy, d, D); // OG game.js:17862
    if (b.timer > 0) { if (world.time >= b.timer) loose(world, u); return; } // drawing (OG game.js:17863-17864)
    if (u.cooldown > 0) return; // OG game.js:17905
    // Volley sync (OG game.js:17906-17916): groups of 2+ share one volley clock; each archer adds its stagger.
    const j = ((0.618034 * u.index) % 1) * BOW.stagger; // OG game.js:17906
    const g = u.group, G = world.groups;
    if (grpAlive(world, g) && G.size[g] > 1) {
      if (G.volleyAt[g] - world.time >= BOW.volleyJoin) b.timer = G.volleyAt[g] + j; // OG game.js:17908-17909
      else if (world.time >= G.volleyReady[g]) { // OG game.js:17910-17913
        G.volleyAt[g] = world.time + BOW.draw; G.volleyReady[g] = G.volleyAt[g] + BOW.volleyReady; b.timer = G.volleyAt[g] + j;
      }
    } else b.timer = world.time + BOW.draw * range(world, BOW.drawLo, BOW.drawHi); // solo (OG game.js:17915)
    if (b.timer > 0) emit(world, 'bowdraw', { x: u.x, y: u.y, v: 1, type: u.type }); // OG game.js:17916
  },
});
