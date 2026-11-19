// Lava golem (OURS, Bosses tab, Part 2 step 6): a walking heap of molten rock. Fire immune; sets on fire whatever it
// touches. Lava trail: every 0.5 s of walking it leaves a lava patch r 16 for 8 s where it stepped (anyone of another
// side in it: 15 hp/s + set alight). Punch 80 + toss. Lava blob: every 5 s at a target 150-400 px away (projectile
// `lavablob`, lobbed): splash r 40 for 50 + sets alight + a lava patch r 30. Deep water hurts it 30 hp/s (steam), and
// lava that lands in water (or gets water painted on it) goes out. Owner: BOSSES-SIM.
// Pose (STEP6.md): b.act 1 punch -> `punch`; 2 throw -> `throw`. Lava patch = effect projectile `lava` (ground: true):
// p.r radius (px), p.age s since it formed, p.life its whole life in s (constant: fade by p.age / p.life). Blob =
// projectile `lavablob`: p.z = height (px), lobbed.
import { removeProjectile, spawnProjectile, registerProjectileKind } from '../../combat/projectiles.js';
import { registerBlast, explode, ignite, igniteNow, fireProjectile } from '../../combat/index.js';
import { HITTABLE } from '../../factions.js';
import {
  boss, initBag, targetOf, setState, act, canAuto, shrug, hittable, high, grounded, hunt, idle,
  damage, toss, push, depthAt, splatNoise, hypot, angleDiff, STATE, ENEMY, BOSS, WET, DEEP, DT, TAU,
} from './_lib.js';

const T = {
  radius: 24, hp: 5500, mass: 45,   // STEP6 size
  walk: 28, run: 50,                // px/s
  charge: 600,                      // px: a target closer than this -> it runs at it (walking in under fire got it shot to bits)
  trailEvery: 0.5,                  // s of walking per lava patch
  trailR: 16,                       // px patch radius (trail)
  lavaLife: 8,                      // s a patch lasts
  lavaDps: 15,                      // damage per second to anyone standing in lava (dealt every 0.25 s) ...
  lavaIgnite: 1,                    // ... and an ignite roll this x flammability every 0.25 s
  lavaFoot: 0.5,                    // x the unit's radius: how far inside the patch edge its feet must be
  punch: 80,                        // punch damage ...
  punchJitter: 8,                   // ... ± this
  punchEvery: 1.6,                  // s
  punchReach: 10,                   // px past both bodies
  punchOut: 170, punchUp: 260,      // toss of a punched unit (px/s out, up)
  punchPose: 0.35,                  // s of the punch pose
  touchEvery: 0.5,                  // s: whatever touches it is set alight this often
  touchPad: 4,                      // px past both bodies counts as touching
  blobEvery: 5,                     // s between blobs
  blobMin: 110, blobMax: 400,       // px: a target in this range gets a blob. ATTACK3 L3: min 150 -> 110: riflemen back off
                                    // to ~120 px from what chases them, inside 150: it never threw again and walked after
                                    // them for the rest of the battle (110 still keeps its 40 px splash well off itself)
  blobFlight: 0.9,                  // s in the air
  blobApex: 70,                     // px: top of the lob
  blobR: 40,                        // splash radius ...
  blobDmg: 50,                      // ... damage
  blobPatchR: 30,                   // px: the lava patch it leaves
  throwPose: 0.5,                   // s of the throw pose
  waterDps: 30,                     // deep water hurts it (dealt every 0.25 s)
  firstBlob: 2,                     // s after it is placed before its first blob
};
const BLOB_BLAST = registerBlast('lava_blob', { radius: T.blobR, damage: T.blobDmg, minFalloff: 0.4, push: 120, stun: 0.25, noiseRadius: 260, hatChance: 0.3 });
const PUNCH = 1, THROW = 2;   // b.act codes (STEP6.md)

// ---------------------------------------------------------------- lava patches (effect projectile 'lava', ground: true)
// Sits still; p.r radius, p.age counts up to p.life (constant). Every 0.25 s it burns whoever of another side stands in
// it and goes out if water is under it.
const PQ = new Array(64);
function stepLava(w, p, i) {
  p.px = p.x; p.py = p.y;
  p.age += DT;
  if (p.age >= p.life) { removeProjectile(w, i); return; }
  if ((w.tick + p.bounces) % 15 !== 0) return;   // p.bounces: its own 0-14 phase
  if (w.waterCells > 0 && depthAt(w, p.x, p.y) >= WET) {
    w.emit('steam', { x: p.x, y: p.y, size: 10 + p.r, thick: 2 });
    removeProjectile(w, i); return;
  }
  const n = w.queryMask(p.x, p.y, p.r + BOSS.MARGIN, HITTABLE[p.faction], PQ, PQ.length);
  for (let k = 0; k < n; k++) {
    const o = PQ[k]; PQ[k] = null;
    if (!(o.hp > 0) || o.dead || o.inside >= 0 || !grounded(o) || o.leaping !== 0) continue;
    if (hypot(o.x - p.x, o.y - p.y) > p.r + o.radius * T.lavaFoot) continue;
    damage(w, o, T.lavaDps * 0.25, p.owner, 'fire', o.x, o.y);
    if (o.hp > 0) ignite(w, o, T.lavaIgnite);
  }
}
registerProjectileKind('lava', stepLava);
/** A lava patch at (x, y), radius r, of side `faction` (spared), credited to `owner` (unit or id). None in water (steam). */
export function lavaPatch(w, faction, owner, x, y, r) {
  if (w.waterCells > 0 && depthAt(w, x, y) >= WET) { w.emit('steam', { x, y, size: 10 + r, thick: 2 }); return null; }
  const p = spawnProjectile(w, 'lava', x, y, 0, 0, T.lavaLife, 0, faction, owner);
  if (!p) return null;
  p.r = r; p.age = 0; p.life = p.maxLife = T.lavaLife; p.bounces = Math.floor(w.rng() * 15); p.z = 0;
  return p;
}

// ---------------------------------------------------------------- lava blob (projectile 'lavablob', lobbed)
function stepBlob(w, p, i) {
  p.px = p.x; p.py = p.y;
  p.x = Math.min(w.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(w.H, Math.max(0, p.y + p.vy * DT));
  const f = 1 - p.life / p.maxLife; p.z = 4 * p.apex * f * (1 - f) + 20 * (1 - f);
  p.life -= DT;
  if (p.life > 0) return;
  const owner = p.owner >= 0 ? w.unitById(p.owner) : null;
  if (w.waterCells > 0 && depthAt(w, p.x, p.y) >= WET) {   // lands in water: it goes out (a weak splash, no patch)
    explode(w, p.x, p.y, BLOB_BLAST, p.owner, 0.5 * p.damage);
    w.emit('steam', { x: p.x, y: p.y, size: 40, thick: 3 });
    removeProjectile(w, i); return;
  }
  explode(w, p.x, p.y, BLOB_BLAST, p.owner, p.damage);
  const n = w.queryMask(p.x, p.y, T.blobR + BOSS.MARGIN, HITTABLE[p.faction], PQ, PQ.length);
  for (let k = 0; k < n; k++) { const o = PQ[k]; PQ[k] = null; if (o.hp > 0 && o.inside < 0 && hypot(o.x - p.x, o.y - p.y) <= T.blobR + o.radius) ignite(w, o, 1); }
  lavaPatch(w, p.faction, owner || p.owner, p.x, p.y, T.blobPatchR * (owner ? owner.shrink : 1));
  removeProjectile(w, i);
}
registerProjectileKind('lavablob', stepBlob);
function throwBlob(w, u, tx, ty) {
  const p = fireProjectile(w, 'lavablob', u, tx, ty, { life: T.blobFlight, apex: T.blobApex, damage: T.blobDmg, muzzle: 0.8 });
  if (p) p.z = 20;
  u.b.next = w.time + T.blobEvery;
  act(w, u, THROW); u.attack = 1;
  w.emit('throw', { x: u.x, y: u.y, v: 2, type: u.type });
}

// ---------------------------------------------------------------- brain
const TQ = new Array(32);
function touch(w, u) {   // whatever touches it catches fire
  const n = w.queryMask(u.x, u.y, u.radius + T.touchPad + BOSS.MARGIN, HITTABLE[u.faction], TQ, TQ.length);
  for (let k = 0; k < n; k++) {
    const o = TQ[k]; TQ[k] = null;
    if (o === u || !(o.hp > 0) || o.inside >= 0 || high(o)) continue;
    if (hypot(o.x - u.x, o.y - u.y) <= u.radius + o.radius + T.touchPad) igniteNow(w, o);
  }
}
function punch(w, u, t) {
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001;
  const pass = damage(w, t, T.punch + T.punchJitter * (w.rng() - w.rng()), u);
  if (t.hp > 0) { if (pass > 0.5) toss(w, t, dx / d, dy / d, T.punchOut * pass, T.punchUp * pass); else push(w, t, dx / d, dy / d, 120, 0.3); }
  igniteNow(w, t);
  u.cooldown = T.punchEvery * (0.9 + 0.2 * w.rng()); u.attack = 1;
  act(w, u, PUNCH);
  w.emit('strike', { x: t.x, y: t.y, v: 2, type: u.type });
}
function brain(w, u) {
  const b = u.b, now = w.time;
  shrug(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  if ((b.act === PUNCH && now - b.actT > T.punchPose) || (b.act === THROW && now - b.actT > T.throwPose)) act(w, u, 0);
  const deep = w.waterCells > 0 && depthAt(w, u.x, u.y) >= DEEP;
  if (now >= b.t1) {   // every 0.25 s: water hurts, touch burns
    b.t1 = now + 0.25;
    if (deep) { damage(w, u, T.waterDps * 0.25, null); w.emit('steam', { x: u.x, y: u.y - u.radius, size: 26 + u.radius, thick: 3 }); }
    if (now >= b.t0) { b.t0 = now + T.touchEvery; touch(w, u); }
  }
  if (!deep && w.waterCells > 0 && depthAt(w, u.x, u.y) < WET) { b.x0 = u.x; b.y0 = u.y; b.k = 1; }   // last dry spot
  // lava trail: every 0.5 s of walking (on dry ground)
  const sp = hypot(u.vx, u.vy);
  if (sp > 6 && grounded(u)) {
    b.walked += DT;
    if (b.walked >= T.trailEvery) { b.walked -= T.trailEvery; lavaPatch(w, u.faction, u, u.x - u.vx / sp * u.radius * 0.4, u.y - u.vy / sp * u.radius * 0.4 + u.radius * 0.3, T.trailR * u.shrink); }
  }
  if (deep && u.possessed !== 1 && b.k === 1) {   // get out of the water (back to the last dry spot)
    setState(u, STATE.ADVANCE);
    const dx = b.x0 - u.x, dy = b.y0 - u.y, d = hypot(dx, dy) || 1;
    u.goalX = dx / d * T.run; u.goalY = dy / d * T.run;
    return;
  }
  const t = targetOf(w, u);
  if (!t) { idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (d <= u.radius + t.radius + T.punchReach && !high(t)) {
    setState(u, STATE.ENGAGE); u.face = a;
    if (u.cooldown <= 0 && Math.abs(angleDiff(u.heading, a)) < 0.9) punch(w, u, t);
    return;
  }
  if (now >= b.next && d >= T.blobMin && d <= T.blobMax && b.act === 0 && canAuto(w, u)) {   // lobbed: walls don't stop it
    u.face = a;
    if (Math.abs(angleDiff(u.heading, a)) < 0.6) { throwBlob(w, u, t.x + t.vx * T.blobFlight, t.y + t.vy * T.blobFlight); return; }
  }
  hunt(w, u, t, d < T.charge ? T.run : T.walk, d < T.charge ? STATE.CHARGE : STATE.ADVANCE);
}

const D = boss({
  type: 'lavagolem', og: 'Lava golem (ours)',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 30,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 70, accel: 160, decel: 240, turnRate: 2,
  intelligence: 0, flammability: 0, density: 9,   // fire immune; Mindless (a heap of rock)
  weapon: { range: T.blobMax },   // possess: aim reach
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.walked = 0; b.next = w.time + T.firstBlob; b.t0 = w.time; b.t1 = w.time; b.x0 = u.x; b.y0 = u.y; b.k = 0;
  },
  // possessed, attack held at nobody: a lava blob at the aim point (kept in 150-400 px), else a punch at the air
  possessFire(w, u, aim, ax, ay) {
    const b = u.b;
    if (w.time >= b.next && b.act === 0) {
      let dx = ax - u.x, dy = ay - u.y; const d = hypot(dx, dy) || 0.001, k = Math.max(T.blobMin, Math.min(T.blobMax, d)) / d;
      throwBlob(w, u, u.x + dx * k, u.y + dy * k); return;
    }
    if (u.cooldown > 0) return;
    u.attack = 1; u.cooldown = T.punchEvery; act(w, u, PUNCH);
    w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
  },
  brain,
});

export default D;
export { T };
