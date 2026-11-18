// Strategy: group hunt intel, every 15 ticks, not while holding (OG core-move §9 huntRange, game.js:4760-4797).
// Each group with huntRange > 0 learns the centroid of the nearest hostile group within huntRange of its own centroid.
import { factionHostile } from '../factions.js';

let visible = new Uint8Array(64);
export function run(world) {
  if (world.tick % 15 !== 0 || world.holding) return; // OG game.js:4762
  const gs = world.groups, n = gs.highWater, us = world.units;
  // A group with stalkers counts only while one of them is unhidden (OG game.js:4765-4776).
  if (visible.length < n) visible = new Uint8Array(Math.max(n, 2 * visible.length, 64));
  visible.fill(1, 0, n);
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.dead && u.group >= 0 && u.def.stalk !== undefined) visible[u.group] = 0; }
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.dead && u.group >= 0 && u.def.stalk !== undefined && u.unseen <= 0) visible[u.group] = 1; }
  for (let g = 0; g < n; g++) {
    if (gs.alive[g] === 0 || gs.size[g] === 0) continue;
    const def = world.defOf(gs.type[g]); if (!def) continue;
    const range = def.huntRange, had = gs.hasIntel[g];
    gs.hasIntel[g] = 0;
    if (!(range > 0)) continue;                         // huntRange 0 → never intel (OG game.js:4781)
    const cx = gs.cx[g], cy = gs.cy[g], seers = def.seesLurkers === true;
    let best = range * range;
    for (let t = 0; t < n; t++) {
      if (gs.alive[t] === 0 || gs.size[t] === 0) continue;
      if (!factionHostile(gs.faction[g], gs.faction[t])) continue;
      const tdef = world.defOf(gs.type[t]);
      if ((!seers && tdef && tdef.lurk !== undefined) || visible[t] === 0) continue;
      const dx = gs.cx[t] - cx, dy = gs.cy[t] - cy, d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; gs.intelX[g] = gs.cx[t]; gs.intelY[g] = gs.cy[t]; gs.hasIntel[g] = 1; }
    }
    if (gs.hasIntel[g] === 1 && had === 0) gs.intelSince[g] = world.time; // OG game.js:4795
  }
}
