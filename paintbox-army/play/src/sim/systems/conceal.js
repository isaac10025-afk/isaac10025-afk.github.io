// Conceal: rebuild per-unit `unseen` (visible only within that many px; 0 = not hidden) every tick.
// OG core-move §9 "Hidden units" (OG game.js:4867-4900). `hidden` (tree perch) is written by perch code.
import { DT, STATE } from '../const.js';

export function run(world) {
  const us = world.units, steam = world.steam;
  if (steam.count > 0) steam.step(DT, world.time);
  const hasSteam = steam.count > 0, hasWater = world.waterCells > 0, walls = world.walls, time = world.time;
  for (let i = 0; i < us.length; i++) {
    const u = us[i]; if (u.dead) continue;
    const def = u.def; let r = u.hidden;
    if (hasSteam && steam.at(u.x, u.y, time) > 0.35) r = r > 0 ? Math.min(r, 50) : 50;          // steam ≤ 50 px (OG game.js:4874)
    if (hasWater) {
      if (def.aquatic && world.frozenAt(u.x, u.y)) r = 0.001;                                     // under ice (OG game.js:4878)
      const ws = def.waterStealth;
      if (ws !== undefined && world.wetAt(u)) r = r > 0 ? Math.min(r, ws) : ws; // while wet (OG game.js:4879-4880)
    }
    const stalk = def.stalk;
    if (stalk !== undefined && u.state === STATE.ALERT) {                                          // OG game.js:4882-4893
      let s = stalk; const t = u.target >= 0 ? world.unitById(u.target) : null;
      if (t) {
        const dx = u.x - t.x, dy = u.y - t.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if ((dx * Math.cos(t.heading) + dy * Math.sin(t.heading)) / d <= -0.25) s *= 0.5;          // behind its facing
        if (walls.count > 0 && !walls.lineOfSight(t.x, t.y, u.x, u.y)) s = Math.min(s, 25);
      }
      r = r > 0 ? Math.min(r, s) : s;
    }
    const seen = r, lurk = def.lurk;
    if (lurk !== undefined) r = r > 0 ? Math.min(r, lurk) : lurk;                                   // OG game.js:4895-4897
    u.unseen = r; u.unseenBySeers = seen;
  }
}
