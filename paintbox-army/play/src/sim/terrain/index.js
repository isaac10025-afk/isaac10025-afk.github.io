// TERRAIN brush API for createGame (CORE-A) and the one-call Clear. OG brush: game.js:7620-7716.
// Tools: 'wall' | 'water' | 'ice' | 'mine' | 'peel'. One stroke = begin + moves; each move paints the segment from the
// last point. Walls paint at brush × 0.75; erasing uses the full brush on every terrain kind.
// STEP7 TERRAIN-SIM: + 'lava' | 'mud' (full brush) | 'bridge' (brush × 0.75, like walls) | 'tramp' (points, like mines),
// ours (STEP7.md); their files: lava.js, mud.js, bridge.js, tramp.js. Each also registers with the maps core.
import { BRUSH_RADIUS, WALL_BRUSH_SCALE } from '../const.js';
import { paintWall } from './wall.js';
import { paintWater, beginWaterStroke } from './water.js';
import { paintIce } from './ice.js';
import { paintMines, eraseMines, minesOf } from './mines.js';
import { paintPeels, erasePeels, peelsOf } from './peels.js';
import { clearGrids } from './grid.js';
import './hooks.js';
// STEP7 TERRAIN-SIM: the 4 new kinds (each registers its own tick system on import)
import { paintLava, eraseLava, clearLava, settle as settleLava, afterMap as afterLavaMap } from './lava.js';
import { paintMud, eraseMud, clearMud } from './mud.js';
import { paintBridge, beginBridgeStroke, eraseBridge, clearBridge, blastBridge, mapBridge } from './bridge.js';
import { paintTramp, eraseTramp, clearTramp, blastTramp, mapTramp } from './tramp.js';
import * as env from '../combat/env.js';

export const TERRAIN_TOOLS = ['wall', 'water', 'ice', 'mine', 'peel', 'lava', 'mud', 'bridge', 'tramp']; // Terrain tab order before the props (OG game.js:7766-7775); STEP7 TERRAIN-SIM: + lava, mud, bridge, tramp

// Paint one segment with a terrain tool. Returns how many tiles / mines / peels changed (UI uses it for paint sounds).
export function paintTerrain(world, kind, x0, y0, x1, y1, radius = BRUSH_RADIUS) {
  switch (kind) {
    case 'wall': { const n = paintWall(world, x0, y0, x1, y1, radius * WALL_BRUSH_SCALE, true); if (n > 0) unrock(world); return n; } // OG game.js:7637, 7671 (STEP7: a painted wall is no rock)
    case 'water': { const n = paintWater(world, x0, y0, x1, y1, radius); if (n > 0) settleLava(world); return n; } // OG game.js:7644, 7674 (STEP7: water meets lava = rock)
    case 'ice': { const n = paintIce(world, x0, y0, x1, y1, radius); if (n > 0) settleLava(world, true); return n; }       // OG game.js:7649, 7680 (STEP7: ice on lava melts)
    case 'mine': return paintMines(world, x0, y0, x1, y1, radius);                         // OG game.js:7655, 7686
    case 'peel': return paintPeels(world, x0, y0, x1, y1, radius);                         // OG game.js:7658, 7690
    // STEP7 TERRAIN-SIM: the new brushes
    case 'lava': return paintLava(world, x0, y0, x1, y1, radius);
    case 'mud': return paintMud(world, x0, y0, x1, y1, radius);
    case 'bridge': return paintBridge(world, x0, y0, x1, y1, radius * WALL_BRUSH_SCALE);
    case 'tramp': return paintTramp(world, x0, y0, x1, y1);
    default: return 0;
  }
}
// pointerdown with a terrain tool: water bumps its stroke id first, then the tool paints at the point (OG game.js:7636-7658).
export function beginTerrainStroke(world, kind, x, y, radius = BRUSH_RADIUS) {
  if (kind === 'water') beginWaterStroke(world);
  if (kind === 'bridge') beginBridgeStroke(world);   // STEP7 TERRAIN-SIM: planks of one stroke share its angle
  return paintTerrain(world, kind, x, y, x, y, radius);
}
// Erase stroke: call beginErase on pointerdown (bumps the water stroke), then eraseTerrain per segment.
// Clears walls, unarmed mines, peels, water and ice within the full brush (OG game.js:7629-7634, 7708-7713).
// Units are erased by CORE-A's eraseCircle (OG game.js:7714-7715), not here.
export function beginErase(world, x, y, radius = BRUSH_RADIUS) { beginWaterStroke(world); return eraseTerrain(world, x, y, x, y, radius); }
export function eraseTerrain(world, x0, y0, x1, y1, radius = BRUSH_RADIUS) {
  return paintWall(world, x0, y0, x1, y1, radius, false)
    + eraseMines(world, x0, y0, x1, y1, radius)
    + erasePeels(world, x0, y0, x1, y1, radius)
    + paintWater(world, x0, y0, x1, y1, radius, true)
    + paintIce(world, x0, y0, x1, y1, radius, true)
    + eraseLava(world, x0, y0, x1, y1, radius) + eraseMud(world, x0, y0, x1, y1, radius)          // STEP7 TERRAIN-SIM
    + eraseBridge(world, x0, y0, x1, y1, radius) + eraseTramp(world, x0, y0, x1, y1, radius);    // STEP7 TERRAIN-SIM
}
// Clear: every terrain grid and pool (OG sim.clear, game.js:5728-5736). Walls and steam belong to world.clearAll too.
export function clearTerrain(world) {
  world.walls.clear();
  minesOf(world).clear();
  peelsOf(world).clear();
  clearGrids(world);
  if (world.steam) world.steam.clear();
  clearLava(world); clearMud(world); clearBridge(world); clearTramp(world);   // STEP7 TERRAIN-SIM (also on onWorldClear)
}

// ---------------------------------------------------------------- STEP7 TERRAIN-SIM: glue for the 4 new kinds
// A wall painted over rock made by lava + water is a plain wall again (the rock flag only marks the basalt look).
function unrock(world) {
  const L = world.lava7;
  if (L === undefined || L.rockCells === 0) return;
  const s = world.walls.solid, r = L.rock;
  let ch = 0;
  for (let i = 0; i < r.length; i++) if (r[i] === 1 && s[i] === 0) { r[i] = 0; ch++; }
  if (ch > 0) { L.rockCells -= ch; L.rockVersion++; }
}
// Blasts break planks (wall falloff) and tear pads: chained onto CORE-B's wallBlast hook (explode.js calls it with
// r = blast radius × 0.7, dmg = damage × 2.5), after the wall damage terrain/hooks.js plugs in. Nothing runs without them.
{
  const prev = env.hooks.wallBlast;
  try {
    env.setCombatHook('wallBlast', (w, x, y, r, dmg) => {
      const n = prev ? prev(w, x, y, r, dmg) : 0;
      if (w.bridge7 !== undefined && w.bridge7.cells > 0) blastBridge(w, x, y, r, dmg);
      if (w.tramp7 !== undefined && w.tramp7.count > 0) blastTramp(w, x, y, r);
      return n;
    });
  } catch (e) { /* hook not offered */ }
}
// Maps core (sim/maps/index.js registerMapKind): the map builder paints the new kinds through these. Loaded without
// waiting (the maps core awaits its map files; a map file may import this one): registered long before a map loads.
import('../maps/index.js').then((m) => {
  if (typeof m.registerMapKind !== 'function') return;
  m.registerMapKind('lava', (w, x0, y0, x1, y1, r) => paintLava(w, x0, y0, x1, y1, r), afterLavaMap);
  m.registerMapKind('mud', (w, x0, y0, x1, y1, r) => paintMud(w, x0, y0, x1, y1, r));
  m.registerMapKind('bridge', (w, x0, y0, x1, y1, r) => mapBridge(w, x0, y0, x1, y1, r));
  m.registerMapKind('tramp', (w, x0, y0) => mapTramp(w, x0, y0));
}, () => { /* no maps core: the brushes still work */ });
