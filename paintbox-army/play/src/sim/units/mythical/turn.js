// Turning and transform-in-place (MYTHICAL). No registrations here, so any system may import it safely.
// - transformUnit: OG 571.c (game.js:14568-14585) with the carried-status snapshot 571.h/d (game.js:14517-14567).
//   Used by the Mage's curse (→ Frog) and by turning.
// - turnUnit: OG Ot (game.js:3331-3344): an infected unit becomes its risen copy. Installed as CORE-B's
//   combat hook 'turn'; CORE-A's lifecycle calls it (OG game.js:5345-5362 does the dying-side bookkeeping).
import { getDef } from '../../defs.js';
import * as env from '../../combat/env.js';
import * as K from './_lib.js';
import { release as releasePossess } from '../../systems/possess.js';

export const risenOf = K.risenOf;

// OG 571.h: what survives a transform.
function snapshot(u) {
  return {
    hatless: u.hatless | 0, singed: u.singed | 0, blind: u.blind | 0, plague: u.plague || 0, plagueAt: u.plagueAt,
    plagueFree: u.plagueFree | 0, kindled: u.kindled | 0, burning: u.burning || 0, curseType: u.curseType ?? null,
    infection: u.infection || 0, infectGroup: u.infectGroup ?? -1, z: u.z || 0, vz: u.vz || 0, spin: u.spin || 0,
    infectTeam: u.infectTeam ?? -1,   // attack 4 L2: + infectTeam (OG drops it)
    thrownAt: u.thrownAt, arrowsIn: u.arrowsIn | 0, arrows: u.arrows || null,
  };
}
// OG 571.d (game.js:14540-14566).
function restore(k, c) {
  const d = k.def;
  k.hatless = c.hatless; k.singed = c.singed; k.blind = c.blind; k.plagueFree = c.plagueFree;
  const keepPlague = c.plague > 0 && !K.isUndead(d) && d.faction !== K.FAC.Undead && !d.prop && !d.plagueCarrier;
  k.plague = keepPlague ? c.plague : 0;
  k.plagueAt = c.plagueAt;
  k.kindled = c.kindled;
  k.burning = d.flammability > 0 ? c.burning : 0;
  k.curseType = c.curseType;
  const rt = K.risenOf(k.type);
  const inf = c.infection > 0 && d.infectable && rt !== null;
  k.infection = inf ? (d.turnsWhenKilled ? Infinity : (Number.isFinite(c.infection) ? c.infection : 1)) : 0; // Infinity → 1 s
  k.infectType = inf ? rt : null;
  k.infectGroup = inf ? c.infectGroup : -1;
  // attack 4 L2 (OURS; OG 571.d drops it too): the bite's team survives the curse. A bitten soldier frogged by a Mage in a
  // Team battle rose as an Undead zombie frog (team -1): a third side the result never counts, its bites more of them.
  k.infectTeam = inf ? c.infectTeam : -1;
  k.z = k.pz = c.z; k.vz = c.vz; k.spin = c.spin; k.thrownAt = c.thrownAt;
  k.arrowsIn = Math.min(2, c.arrowsIn);                     // OG game.js:10710: 2 stuck arrows max
  k.arrows = c.arrows;
}
// OG replaceUnit (game.js:5605-5616): free, then spawn in place with the same heading and velocity.
function replaceUnit(world, u, type, group, team) {
  const x = u.x, y = u.y, h = u.heading, vx = u.vx, vy = u.vy;
  world.remove(u);
  const k = K.spawnUnit(world, type, x, y, group, h, team);
  if (k) { k.vx = vx; k.vy = vy; }
  return k;
}
/**
 * transformUnit(world, u, newType, group, scale = 1, team = u.team) → new unit | null  (OG 571.c)
 * radius = min(46, r × scale); w = (newR / r) × (oldDef.radius / newDef.radius);
 * mass = newDef.mass × w²; maxHp = hp = newDef.maxHp × w² × (u.maxHp / oldDef.maxHp).
 */
export function transformUnit(world, u, newType, group, scale = 1, team = u.team) {
  const od = u.def, nd = getDef(newType);
  if (!nd) return null;
  const c = snapshot(u);
  const y = Math.min(K.MAX_R, u.radius * scale);
  const w = (y / u.radius) * (od.radius / nd.radius);
  const area = w * w, hpFrac = u.maxHp / od.maxHp;
  const k = replaceUnit(world, u, newType, group, team);
  if (!k) return null;
  world.handOver(u, k); // OURS (possess): a cursed unit's player goes on as the frog
  k.radius = y; k.mass = nd.mass * area; k.maxHp = k.hp = nd.maxHp * area * hpFrac;
  restore(k, c);
  return k;
}

/**
 * turnUnit(world, u) → risen unit | null  (OG Ot, game.js:3331-3344)
 * Joins the biter's team (team battle, if the risen type can join teams) else the risen faction (Undead);
 * joins the biter's group if alive, same faction and not drilled, else a fresh group. Keep-mode copies
 * (same brain) keep subState, so a split Slime rises at its split size.
 */
export function turnUnit(world, u) {
  const nType = u.infectType || K.risenOf(u.type);
  const nd = nType && getDef(nType);
  if (!nd) return null;
  const team = u.infectTeam === 0 || u.infectTeam === 1 ? u.infectTeam : -1;
  const fac = team >= 0 && K.teamable(nd) ? K.teamFaction(team) : nd.faction;
  let g = u.infectGroup ?? -1;
  const gType = K.gf(world, g, 'type');
  const joined = g >= 0 && (K.gf(world, g, 'alive') === 1 || K.gf(world, g, 'alive') === true) &&
    K.gf(world, g, 'faction') === fac && !(gType != null && getDef(gType) && getDef(gType).drilled);
  if (!joined) g = K.createGroup(world, nType, team);
  const sameBrain = u.def.brain === nd.brain;
  const sub = u.subState;
  const k = transformUnit(world, u, nType, g, 1, team);
  if (k && sameBrain) k.subState = sub;
  if (k && k.possessed === 1) releasePossess(world, 'turned'); // OURS (possess): turned = died, back to watching
  if (!joined) K.releaseGroup(world, g);
  return k;                                                // stats.turned is counted by CORE-B onDeath

}

if (env.setCombatHook) env.setCombatHook('turn', turnUnit);
