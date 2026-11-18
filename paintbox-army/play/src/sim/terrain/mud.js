// Mud (OURS, Part 2 step 7, STEP7.md TERRAIN-SIM): a full-brush ground kind on the 8 px terrain tiles.
// Ground units in mud move at x0.5 (mass >= 10 at x0.75; hoppers and flyers x1): Mud7.pace, called from
// systems/steering.js next to the OG wade factor. Units standing in mud are put out and get u.muddy = world.time + 3 (the
// art's brown feet / footprints). Fire never spreads onto mud: burning oil over mud goes out, and anything standing in it
// can't keep burning (trees included). Rolling things on the ground (bowling ball, rolling boulder / bomb) drag in mud.
// Mud never goes on water tiles (the water rules win there) and lava and mud take tiles from each other.
// Store: world.mud7 (Mud7). Art fields (TERRAIN-ART): grid, cells, version; units: u.muddy.
import { DT, WET } from '../const.js';
import { forCapsule, terrainOf } from './grid.js';
import { onWorldClear } from '../world.js';
import { registerSystem } from '../systems/extra.js';

export const T = {
  pace: 0.5,          // x speed for a ground unit in mud ...
  heavyMass: 10,      // ... units this heavy or more ...
  heavyPace: 0.75,    // ... wade through at this
  muddy: 3,           // s u.muddy lasts after leaving the mud (art)
  groundZ: 2,         // px: a unit higher than this is not in the mud
  rollDrag: 2.5,      // 1/s speed lost by rolling things on mud (bowling ball, rolling boulder / bomb): about x0.5 over a patch
  squelchEvery: 4,    // ticks: at most one `squelch` event (a unit stepping into mud) this often
};

// ---------------------------------------------------------------- store
export class Mud7 {
  constructor(cols, rows) {
    const n = cols * rows;
    this.cols = cols; this.rows = rows; this.n = n; this.tile = 8; this.inv = 1 / 8;
    this.grid = new Uint8Array(n);        // 1 = mud
    this.cells = 0; this.version = 0; this.squelchAt = -1;
  }
  clear() { this.grid.fill(0); this.cells = 0; this.version++; }
  idx(x, y) { const tx = Math.floor(x * this.inv), ty = Math.floor(y * this.inv); return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows ? -1 : ty * this.cols + tx; }
  /** Mud under (x, y) that no plank covers. */
  at(world, x, y) {
    const i = this.idx(x, y);
    if (i < 0 || this.grid[i] === 0) return false;
    const B = world.bridge7;
    return B === undefined || B.cells === 0 || !(B.hp[i] > 0);
  }
  /** Speed factor for unit u (systems/steering.js, after the wade factor). def.mudPace overrides (bog monster: its own). */
  pace(world, u, def) {
    if (def.hopper || u.z > 0 || u.wet > 0) return 1;                          // hoppers hop over it; in water the wade rules win
    if (!this.at(world, u.x, u.y)) return 1;
    if (def.mudPace !== undefined) return def.mudPace;
    return u.mass >= T.heavyMass ? T.heavyPace : T.pace;
  }
}

export function mudOf(world) {
  const w = world.walls;
  let M = world.mud7;
  if (M === undefined || M.cols !== w.cols || M.rows !== w.rows) M = world.mud7 = new Mud7(w.cols, w.rows);
  return M;
}
onWorldClear((world) => { if (world.mud7 !== undefined) world.mud7.clear(); });

// ---------------------------------------------------------------- painting
let _M = null, _lava = null, _depth = null, _v = 0, _n = 0;
function paintTile(i) {
  const M = _M;
  if (_v === 1) {
    if (_depth !== null && _depth[i] >= WET) return;                           // never on water
    if (_lava !== null && _lava.grid[i] === 1) { _lava.grid[i] = 0; _lava.cells--; _lava.version++; }   // mud takes the tile from lava
  }
  if (M.grid[i] !== _v) { M.grid[i] = _v; M.cells += _v ? 1 : -1; _n++; }
}
/** Mud (erase = false) or no mud on tiles within max(r, 4) px of the segment, full brush. Returns tiles changed. */
export function paintMud(world, x0, y0, x1, y1, r, erase = false) {
  if (erase && (world.mud7 === undefined || world.mud7.cells === 0)) return 0;
  const M = mudOf(world);
  _M = M; _v = erase ? 0 : 1; _n = 0;
  _lava = !erase && world.lava7 !== undefined && world.lava7.cells > 0 ? world.lava7 : null;
  _depth = !erase && (world.waterCells > 0 || world.mapBuilding) ? terrainOf(world).depth : null;   // painted depth: right during a map build too
  forCapsule(M, x0, y0, x1, y1, r, paintTile);
  const n = _n; _M = null; _lava = null; _depth = null;
  if (n > 0) M.version++;
  return n;
}
export function eraseMud(world, x0, y0, x1, y1, r) { return paintMud(world, x0, y0, x1, y1, r, true); }
export function clearMud(world) { if (world.mud7 !== undefined) world.mud7.clear(); }
/** u.muddy-style query for other owners: mud under (x, y)? */
export function mudAt(world, x, y) { const M = world.mud7; return M !== undefined && M.cells > 0 && M.at(world, x, y); }

// ---------------------------------------------------------------- system (after the oil step: put out what the oil lit)
const ROLL = { bowlball: 1, boulder: 1, bomb: 1 };
export function run(world) {
  const M = world.mud7;
  if (M === undefined || M.cells === 0) return;
  if (M.cols !== world.walls.cols || M.rows !== world.walls.rows) { world.mud7 = undefined; return; }   // the field changed size (never after boot)
  const g = M.grid, B = world.bridge7, bh = B !== undefined && B.cells > 0 ? B.hp : null;
  // burning oil over mud goes out (fire never spreads onto mud)
  const oil = world.oil;
  if (oil && oil.burning > 0) {
    const ot = oil.tile, fire = oil.fire;
    let out = 0;
    for (let j = Math.max(0, oil.y0); j <= Math.min(oil.rows - 1, oil.y1); j++) for (let q = Math.max(0, oil.x0); q <= Math.min(oil.cols - 1, oil.x1); q++) {
      const c = j * oil.cols + q;
      if (fire[c] === 0) continue;
      const i = M.idx((q + 0.5) * ot, (j + 0.5) * ot);
      if (i >= 0 && g[i] === 1 && (bh === null || !(bh[i] > 0))) { fire[c] = 0; out++; }
    }
    if (out > 0) { oil.burning = Math.max(0, oil.burning - out); world.oilBurning = oil.burning; oil.version++; }
  }
  const us = world.units, t = world.time;
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead || !(u.hp > 0) || u.inside >= 0 || u.z > T.groundZ || u.leaping !== 0 || u.climb > 0) continue;
    const i = M.idx(u.x, u.y);
    if (i < 0 || g[i] === 0 || (bh !== null && bh[i] > 0)) continue;
    if (u.burning > 0 || u.kindled === 1) {
      if (u.burning > 0) world.emit('steampuff', { x: u.x, y: u.y - u.radius, mud: 1 });
      u.burning = 0; u.kindled = 0;
    }
    if (u.muddy <= t && world.tick - M.squelchAt >= T.squelchEvery) { M.squelchAt = world.tick; world.emit('squelch', { x: u.x, y: u.y, v: Math.min(2, u.radius / 9), type: u.type }); }   // stepped in
    u.muddy = t + T.muddy;
  }
  // rolling things drag in mud
  const ps = world.projectiles;
  if (ps && ps.length) for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    if (ROLL[p.kind] !== 1 || (p.kind === 'boulder' && p.roll !== 1) || (p.kind === 'bomb' && p.drop !== 1)) continue;
    const i = M.idx(p.x, p.y);
    if (i < 0 || g[i] === 0 || (bh !== null && bh[i] > 0)) continue;
    const f = Math.max(0, 1 - T.rollDrag * DT);
    p.vx *= f; p.vy *= f;
  }
}

registerSystem('mud7', run, 'oil');
