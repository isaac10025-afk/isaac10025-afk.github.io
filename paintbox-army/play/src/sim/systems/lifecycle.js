// Lifecycle: infection timers and deaths, processed after every damage system. OG core-combat §0, core-move §1
// (game.js:5337-5397; kill record game.js:11605-11627). Calls CORE-B onDeath (corpse, then def.onDeath).
import { DT, CAUSE } from '../const.js';
import { fearLayer } from '../world.js';

async function opt(p) { try { return await import(p); } catch (e) { return null; } }
const [deathMod, reportM] = await Promise.all([opt('../combat/death.js'), opt('../report.js')]);
const KILL_LIST_MAX = 50000; // OG game.js:11612

// Kill credit: last harmer if cause is Blow, Blast or Eaten, or the harm was ≤ 6 s ago (OG game.js:11609-11611).
export function killerOf(world, u, cause) {
  const ok = u.harmByType !== null && (cause === CAUSE.Blow || cause === CAUSE.Blast || cause === CAUSE.Eaten || world.time - u.harmByAt <= 6);
  return ok ? u.harmBy : -1;
}

function fallbackDeath(world, u, cause, killer) {
  if (u.def.onDeath) u.def.onDeath(world, u, cause, killer);
  if (cause !== CAUSE.Turned && !u.eaten && !u.skeleton) world.emit(u.type === 'tree' ? 'treefall' : 'death', { x: u.x, y: u.y, type: u.type, r: u.radius });
  if (cause !== CAUSE.Turned && !u.eaten && !u.skeleton && !u.def.prop)
    world.corpses.push({ x: u.x, y: u.y, z: u.z, r: u.radius, type: u.type, team: u.team, faction: u.faction, heading: u.heading, t: world.time });
}

export function run(world) {
  const us = world.units, fields = world.fields;
  for (let i = 0, n = us.length; i < n; i++) {
    const u = us[i]; if (u.dead) continue;
    let turned = false;
    if (u.infection > 0) { u.infection -= DT; turned = u.infection <= 0 || u.hp <= 0; } // OG game.js:5343-5345
    if (!turned && u.hp > 0) continue;
    fields.splat(fearLayer(u.faction), u.x, u.y, u.def.morale.deathFear, 90);           // OG game.js:5350
    world.stats.deaths[u.type] = (world.stats.deaths[u.type] || 0) + 1;
    const cause = turned ? CAUSE.Turned : u.eaten === 1 ? CAUSE.Eaten : u.harmCause;   // OG game.js:11611
    const killer = killerOf(world, u, cause);
    if (world.kills.enabled) {                                                          // OG game.js:5352, 11612-11624
      if (reportM && reportM.recordKill) reportM.recordKill(world, u, turned);          // TERRAIN's kill log
      else {
        if (world.kills.list.length >= KILL_LIST_MAX) world.kills.list.shift();
        world.kills.list.push({ t: world.time, victimType: u.type, victimFaction: u.faction, victimMass: u.mass,
          killer, killerType: killer >= 0 ? u.harmByType : null, killerFaction: killer >= 0 ? u.harmByFaction : -1, cause });
      }
    }
    if (killer >= 0) { const k = world.unitById(killer); if (k) k.kills++; }
    u.deathCause = cause;
    if (deathMod && deathMod.onDeath) deathMod.onDeath(world, u, cause, killer); else fallbackDeath(world, u, cause, killer);
    if (!u.removed) world.remove(u);
  }
}
