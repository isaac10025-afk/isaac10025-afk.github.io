// Melee helpers. OG has no shared melee routine (each brain hand-codes its strike, e.g. Roman game.js:4619-4636);
// meleeStrike packages the shared pieces those strikes use: perch redirect (412.B), 412.h damage, push/stun (412.p),
// blocked-hit spark (412.g), cooldown and attack = 1. Also: odds approach/retreat (497.b), circling (497.a),
// trample (1074.a).
import { QUERY_MARGIN, initCombat, signed, rnd, hypot, emit } from './env.js';
import { damage, perchOf, blockedSpark } from './damage.js';
import { push, toss } from './push.js';
import { infect } from './infect.js';
import { isHostile } from '../factions.js';

/**
 * meleeStrike(world, u, target, spec) → pass fraction.
 * spec: {damage, damageJitter?, push?, stun?, cooldown?, cooldownJitter?, dirX?, dirY?, sound?}
 * Order matches the OG strikes: damage roll, push by push·pass / stun·pass, block spark, cooldown roll, attack = 1.
 */
export function meleeStrike(world, u, target, spec) {
  initCombat(u);
  const t = perchOf(world, target);
  initCombat(t);
  let dx = spec.dirX, dy = spec.dirY;
  if (dx === undefined) { const ex = t.x - u.x, ey = t.y - u.y, d = hypot(ex, ey) || 0.001; dx = ex / d; dy = ey / d; }
  const amt = spec.damage + (spec.damageJitter ? signed(world) * spec.damageJitter : 0);
  const pass = damage(world, t, amt, u);
  if (spec.push || spec.stun) push(world, t, dx, dy, (spec.push || 0) * pass, (spec.stun || 0) * pass);
  blockedSpark(world, u, t, pass);
  if (pass >= 1) emit(world, spec.sound || 'strike', { x: t.x, y: t.y, v: 1, type: u.type });
  if (spec.cooldown !== undefined) u.cooldown = spec.cooldown + (spec.cooldownJitter ? rnd(world) * spec.cooldownJitter : 0);
  u.attack = 1;
  return pass;
}

// ---- odds approach / retreat (OG 497.b, game.js:10602-10624) ----
export const ODDS_LOW = 0.8, ODDS_LOW_SPAN = 0.35, ODDS_STEP_IN = 0.4;    // OG game.js:10590-10594 (r, c→0.8−0.45, d)
export const ODDS_HIGH = 1.25, ODDS_HIGH_SPAN = 0.65, ODDS_STEP_OUT = 0.35; // OG game.js:10592-10595 (l, h→1.9−1.25, f)
export const ODDS_RANGED_PAD = 30;                                         // OG game.js:10596 (m)
function groupSize(world, g) {
  if (g == null || g < 0 || !world.groups) return 0;
  const G = world.groups;
  // CORE-A Groups is struct-of-arrays (OG groups.size[g], game.js:10609-10612). Before 11-14 this fell through to G[g]
  // (undefined) -> 0 -> odds 1, so gunners never backed off from or stepped in on uneven odds.
  if (G.size && typeof G.size.length === 'number') return G.size[g];
  if (typeof G.size === 'function') return G.size(g);
  const r = typeof G.get === 'function' ? G.get(g) : G[g];
  return r ? (r.size !== undefined ? r.size : r.alive || 0) : 0;
}
export function localOdds(world, u, t) {
  if (u.odds > 0) return u.odds;
  const gs = groupSize(world, u.group), gt = groupSize(world, t.group);
  if (u.group < 0 || t.group < 0 || gs === 0) return 1;
  return (gt * (t.def.strength || 1)) / (gs * (u.def.strength || 1));
}
/** oddsApproach(world, u, target, dx, dy, d, def): adds to u.goal. */
export function oddsApproach(world, u, t, dx, dy, d, def) {
  const b = localOdds(world, u, t), x = dx / d, y = dy / d;
  if (b < ODDS_LOW) {
    if (!def.melee && d < def.minDistance + ODDS_RANGED_PAD) return;
    const s = Math.min(1, (ODDS_LOW - b) / ODDS_LOW_SPAN) * ODDS_STEP_IN * def.walkSpeed;
    u.goalX += x * s; u.goalY += y * s;
  } else if (b > ODDS_HIGH && def.morale && def.morale.canBreak) {
    const s = Math.min(1, (b - ODDS_HIGH) / ODDS_HIGH_SPAN) * ODDS_STEP_OUT * def.walkSpeed;
    u.goalX -= x * s; u.goalY -= y * s;
  }
}

// ---- circling (OG 497.a, game.js:10625-10636) ----
export const CIRCLE_SPEED = 0.3, CIRCLE_FULL = 2, CIRCLE_NONE = 5, BACKOFF_AT = 0.45, BACKOFF_SPEED = 0.9;
/** circle(world, u, target, dx, dy, d, def, amount, backOff): sideways speed 0.3·amount·m·walkSpeed. */
export function circle(world, u, t, dx, dy, d, def, amount, backOff) {
  const hx = dx / d, hy = dy / d;
  const side = u.detour !== 0 && u.detour !== undefined ? Math.sign(u.detour) : (u.index & 1 ? 1 : -1);
  const m = Math.max(0, Math.min(1, 1 - ((t.attackers || 0) - CIRCLE_FULL) / (CIRCLE_NONE - CIRCLE_FULL)));
  const a = CIRCLE_SPEED * amount * m * def.walkSpeed * side;
  u.goalX += -hy * a; u.goalY += hx * a;
  if (backOff && u.attack > BACKOFF_AT) { const s = BACKOFF_SPEED * def.walkSpeed * u.attack; u.goalX -= hx * s; u.goalY -= hy * s; }
}

// ---- trample (OG 1074.a, game.js:252-301) ----
export const TRAMPLE_PAD = 1.5, TRAMPLE_TOSS_PASS = 0.6, TRAMPLE_COOLDOWN = 0.35;
let _tu = null, _tw = null, _ts = null, _tspeed = 0, _tn = 0, _tmask = null, _tstop = false;
function trampleOne(c) {
  const u = _tu, w = _tw, p = _ts;
  if (_tstop || c === u || !(c.hp > 0) || c.climb > 0) return;
  if (_tmask ? !_tmask(u, c) : !isHostile(u, c)) return;
  initCombat(c);
  if (c.id === u.lastVictim && u.cooldown > 0) return;
  const ax = c.x - u.x, ay = c.y - u.y;
  if (hypot(ax, ay) > u.radius + c.radius + (p.reach ?? TRAMPLE_PAD)) return; // OURS: p.reach = cavalry pass cut (apecav.js)
  const fx = Math.cos(u.heading), fy = Math.sin(u.heading);
  if (ax * fx + ay * fy < 0) return;                                           // only in front
  const j = Math.min(1, _tspeed / p.fullSpeed), pass = damage(w, c, p.damage * j, u);
  emit(w, 'trample', { x: c.x, y: c.y, v: j, type: u.type });
  if (u.def.look && u.def.look.undead) infect(w, c, u, (p.infectChance || 0) * pass, 0);
  const side = fx * ay - fy * ax >= 0 ? 1 : -1, px = 0.8 * fx - fy * side * 0.6, py = 0.8 * fy + fx * side * 0.6;
  if (pass >= TRAMPLE_TOSS_PASS && rnd(w) < (p.tossChance || 0)) toss(w, c, px, py, p.tossSpeed * j * pass, p.tossUp * j * pass);
  else push(w, c, px, py, (p.knockback || 0) * j * pass, (p.stun || 0) * pass);
  const brace = c.def.shield && c.def.shield.brace ? c.def.shield.brace : 0;
  if (pass < 1 && brace > 0) damage(w, u, brace * j, c);                       // braced shield hurts the rider
  u.vx *= p.slowdown; u.vy *= p.slowdown; _tspeed *= p.slowdown;
  u.lastVictim = c.id; u.cooldown = TRAMPLE_COOLDOWN; u.attack = 1;
  if (w.stats) w.stats.impacts = (w.stats.impacts || 0) + 1;                    // "charges landed" (OG game.js:294)
  _tn++;
  if (_tspeed < p.minSpeed) _tstop = true;
}
/** trample(world, u, speed, spec, mask?) → victims hit. spec: {fullSpeed, damage, tossChance, tossSpeed, tossUp, knockback, stun, slowdown, minSpeed, infectChance}. */
export function trample(world, u, speed, spec, mask) {
  initCombat(u);
  _tu = u; _tw = world; _ts = spec; _tspeed = speed; _tn = 0; _tmask = mask || null; _tstop = false;
  world.query(u.x, u.y, u.radius + QUERY_MARGIN + (spec.reach ?? TRAMPLE_PAD), trampleOne);
  const n = _tn; _tu = null; _tw = null; _ts = null; _tmask = null;
  return n;
}
