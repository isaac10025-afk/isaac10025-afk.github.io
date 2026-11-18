// The single damage function (OG 412.h, game.js:8788-8818) plus its small shared helpers:
// shield block, harm record / kill credit, suppression, sparks, blocked-hit spark, hat knock, perch redirect.
import { CAUSE, initCombat, wetAt, unitOf, emit, rnd, signed, range, hypot } from './env.js';
import { getOil } from './oil.js';

export const HIT_POW_SCALE = 2.5;   // OG game.js:8784 (O)
export const HIT_STOP_DMG = 45;     // OG game.js:8785 (_): dealt >= 45 → hit-stop on both
export const HURT_SOUND_DMG = 8;    // OG game.js:8786 (j)
export const SICK_HIT_MUL = 0.7;    // OG game.js:8795, 10011 (d.c)
export const KILL_CREDIT_S = 6;     // OG game.js:11612

const KIND_CAUSE = { blast: CAUSE.Blast, fire: CAUSE.Fire, plague: CAUSE.Plague, thrown: CAUSE.Thrown, eaten: CAUSE.Eaten };

// Shield block fraction vs a source point (OG game.js:8819-8828).
export function blockFrac(u, sx, sy) {
  const sh = u.def && u.def.shield;
  if (!sh) return 0;
  const dx = sx - u.x, dy = sy - u.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return 0;
  return (dx * Math.cos(u.heading) + dy * Math.sin(u.heading)) / d >= sh.arc ? sh.block : 0;
}

// Plague contagious stage (OG game.js:10033-10035): sick from 4 s after catching.
export function isSick(u, time) { return u.plague > 0 && time - u.plagueAt >= 4; }

// Harm record (OG game.js:11596-11604).
export function recordHarm(world, u, attacker, cause) {
  u.harmCause = cause;
  if (!attacker) return;
  u.harmBy = attacker.id; u.harmByType = attacker.type; u.harmByFaction = attacker.faction; u.harmByAt = world.time;
}
// Kill credit (OG game.js:11609-11624): last harmer if cause Blow/Blast/Eaten, or harm ≤ 6 s ago.
export function killerOf(world, u, turned) {
  const cause = turned ? CAUSE.Turned : (u.eaten === 1 ? CAUSE.Eaten : u.harmCause);
  if (u.harmByType == null) return { killer: -1, cause };
  const ok = cause === CAUSE.Blow || cause === CAUSE.Blast || cause === CAUSE.Eaten || world.time - u.harmByAt <= KILL_CREDIT_S;
  return { killer: ok ? u.harmBy : -1, killerType: ok ? u.harmByType : null, killerFaction: ok ? u.harmByFaction : -1, cause };
}

/**
 * damage(world, target, amount, src, kind, fromX, fromY) → pass fraction m (1 = full hit).
 * src: attacker unit, unit id, or -1/null. kind: 'blow' (default) | 'blast' | 'fire' | 'thrown' | ... (harm cause).
 * fromX/fromY: optional source point for the shield check (blast centre, arrow origin).
 */
export function damage(world, target, amount, src, kind, fromX, fromY) {
  if (!target || target.hp <= 0) return 1;                                   // OG game.js:8791
  initCombat(target);
  const att = src == null || src === -1 ? null : unitOf(world, src);
  const def = target.def;
  let m = 1;
  if (fromX !== undefined && fromY !== undefined) m = 1 - blockFrac(target, fromX, fromY); // OG game.js:8794
  else if (att) m = 1 - blockFrac(target, att.x, att.y);
  if (att && att.plague > 0 && isSick(att, world.time)) amount *= SICK_HIT_MUL; // OG game.js:8795
  if (def.waterArmor !== undefined && wetAt(world, target)) amount *= def.waterArmor; // OG game.js:8796
  if (att && att.shrink < 1) amount *= att.shrink;                               // OURS step 6: a shrunk unit (shrink ray) hits at its size
  if (def.damageMul !== undefined) amount *= def.damageMul(world, target, amount, att, (kind === undefined || kind === 'blow') && world.projKind !== undefined ? world.projKind : kind); // OURS step 6: armour / shells / dodges (def hook, x factor). kind: the damage kind, else the projectile kind hitting now (ballistics sets world.projKind: 'bullet', 'arrow', 'bolt'...)
  const dealt = amount * m;
  target.hp -= dealt;                                                        // OG game.js:8797
  if (dealt > 0) recordHarm(world, target, att, KIND_CAUSE[kind] !== undefined ? KIND_CAUSE[kind] : (att ? CAUSE.Blow : CAUSE.Other)); // OG 8798
  target.flash = m < 1 ? 0.4 : 1;                                             // OG game.js:8799
  const sx = fromX != null ? fromX : att ? att.x : target.x, sy = fromY != null ? fromY : att ? att.y : target.y;
  const hx = target.x - sx, hy = target.y - sy, hd = Math.sqrt(hx * hx + hy * hy);
  target.hitAt = world.time;                                                  // OG game.js:8807
  if (att && dealt > 0) { world.lastBlow = world.time; if (world.blowAt) world.blowAt[att.faction] = world.time; } // OG game.js:8808 (+ OURS: per side, march.js)
  target.hitPow = Math.min(1, (dealt / target.maxHp) * HIT_POW_SCALE);       // OG game.js:8809
  target.hitDx = hd > 0.001 ? hx / hd : 0; target.hitDy = hd > 0.001 ? hy / hd : 0; // OG 8810-8811
  if (dealt >= HIT_STOP_DMG) { target.stopAt = world.time; if (att) att.stopAt = world.time; } // OG 8812
  const mo = def.morale;
  if (mo) target.morale = Math.max(0, target.morale - (mo.hitShock || 0) * m); // OG game.js:8813
  if (att) att.dmgDealt = (att.dmgDealt || 0) + dealt;
  if (dealt >= HURT_SOUND_DMG && target.hp > 0) emit(world, 'hurt', { x: target.x, y: target.y, v: dealt / target.maxHp, type: target.type }); // OG 8814
  const hook = def.onHit || def.onDamaged;                                    // OG game.js:8815 (onDamaged)
  if (hook) hook.call(def, world, target, dealt, att, kind);
  return m;
}

// Near miss (OG game.js:8979-8982).
export function suppress(world, u) {
  initCombat(u);
  const mo = u.def.morale;
  u.morale = Math.max(0, u.morale - ((mo && mo.suppression) || 0));
  u.flinchAt = world.time;
}

// Spark: puff + 30% chance to light oil 5 px ahead, radius 8 (OG game.js:8989-8995).
export function spark(world, x, y, ang, size = 1) {
  emit(world, 'spark', { x, y, ang, size });
  const oil = getOil(world);
  if (oil.cells > 0 && rnd(world) < 0.3) oil.ignite(x + 5 * Math.cos(ang), y + 5 * Math.sin(ang), 8);
}

// Blocked melee hit: block sound + spark at the victim's edge (OG 412.g, game.js:8996-9006).
export function blockedSpark(world, att, victim, pass) {
  if (pass >= 1) return;
  emit(world, 'block', { x: victim.x, y: victim.y, v: 1 - pass, type: victim.type });
  const dx = att.x - victim.x, dy = att.y - victim.y, d = hypot(dx, dy) || 1, r = victim.radius;
  const ang = Math.atan2(dy, dx) + (rnd(world) < 0.5 ? -1 : 1) * (0.9 + 0.6 * rnd(world));
  spark(world, victim.x + (dx / d) * r, victim.y + (dy / d) * r, ang, 0.8);
}

// Hat knock (OG 412.o, game.js:9024-9050): flag + cosmetic hat event.
export function hatKnock(world, u, dx, dy, pow = 1) {
  const look = u.def.look;
  if (!look || !look.hat || u.hatless === 1) return;
  u.hatless = 1;
  emit(world, 'hatoff', { x: u.x, y: u.y, v: pow, type: u.type });
  const sp = 110 * pow * range(world, 0.7, 1.3), side = 0.5 * signed(world);           // OG game.js:9033-9034
  const vx = (dx - dy * side) * sp + 0.5 * u.vx, vy = (dy + dx * side) * sp + 0.5 * u.vy;
  const dir = Math.abs(dx) > 0.2 ? Math.sign(dx) : rnd(world) < 0.5 ? -1 : 1;
  emit(world, 'hat', { x: u.x, y: u.y, z: u.z + u.radius * 2.2, r: u.radius, vx, vy, vz: 300 * Math.sqrt(pow) * range(world, 0.8, 1.2), spin: dir * 14 * range(world, 0.6, 1), type: u.type, life: 2 });
}

// Strikes on a climbing unit hit its perch instead (OG 412.B, game.js:9051-9056).
export function perchOf(world, u) {
  if (!u || !(u.climb > 0)) return u;
  const p = u.perch != null && u.perch >= 0 ? world.unitById(u.perch) : null;
  return p && !p.removed ? p : u;
}
