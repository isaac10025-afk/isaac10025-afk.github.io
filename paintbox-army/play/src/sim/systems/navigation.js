// Navigation: per-faction flow fields on 24 px cells + the shared path helpers brains call.
// OG core-move §9 "Path following" (OG nav class game.js:2455-2655, system game.js:4800-4815, module 447 game.js:9431-9511).
import { NAV_CELL, WALL_TILE, NAV_REFRESH, MINE_AVOID, STATE, setState } from '../const.js';
import { FACTION_COUNT, ENEMY, maskHas } from '../factions.js';

const SQRT2 = Math.SQRT2;
const TILES_PER_CELL = NAV_CELL / WALL_TILE; // 3×3 wall tiles per nav cell (OG game.js:2456)

export class Nav {
  constructor() {
    this.cell = NAV_CELL; this.cols = 1; this.rows = 1;
    this.blocked = new Uint8Array(1); this.nearWall = new Uint8Array(1); this.mined = new Uint8Array(1); this.nearMined = new Uint8Array(1);
    this.dist = []; this.careful = [];
    this.ready = new Uint8Array(FACTION_COUNT); this.readyCareful = new Uint8Array(FACTION_COUNT);
    this.wallsVersion = -1; this.minesVersion = -1; this.hasWalls = false; this.hasCareful = false;
    this.lavaKey = -1; // STEP7 TERRAIN-SIM: lava (+ planks over it) the fields were built with (-1 none)
    this.walls = null; // OURS (attack 3): the walls the cells were built from (direction() checks a step out of a walled cell)
    this.heapCell = new Int32Array(1); this.heapKey = new Float32Array(1); this.heapSize = 0;
  }
  resize(W, H) {
    this.cols = Math.max(1, Math.ceil(W / this.cell)); this.rows = Math.max(1, Math.ceil(H / this.cell));
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n); this.nearWall = new Uint8Array(n); this.mined = new Uint8Array(n); this.nearMined = new Uint8Array(n);
    this.dist = []; this.careful = [];
    for (let f = 0; f < FACTION_COUNT; f++) { this.dist.push(new Float32Array(n).fill(Infinity)); this.careful.push(new Float32Array(n).fill(Infinity)); }
    this.heapCell = new Int32Array(9 * n + 16); this.heapKey = new Float32Array(9 * n + 16);
    this.ready.fill(0); this.readyCareful.fill(0); this.wallsVersion = -1; this.minesVersion = -1;
  }
  // Rebuild blocked cells from walls (any solid tile in the 3×3) and the careful grid (+ cells within 13.45 px of a mine)
  // (OG game.js:2491-2517). nearWall/nearMined = 8-neighbourhood dilation (OG game.js:2646-2652).
  syncWalls(walls, mines, world = null, lava = null) { // STEP7 TERRAIN-SIM: world + lava (terrain/lava.js Lava7) or null
    const { cols, rows, blocked, mined } = this;
    this.walls = walls;
    blocked.fill(0);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      let b = 0;
      for (let j = 0; j < TILES_PER_CELL && !b; j++) for (let i = 0; i < TILES_PER_CELL && !b; i++) if (walls.isSolidTile(cx * TILES_PER_CELL + i, cy * TILES_PER_CELL + j)) b = 1;
      blocked[cy * cols + cx] = b;
    }
    if (lava !== null) lava.blockNav(world, blocked);   // STEP7 TERRAIN-SIM: mostly-lava cells are blocked for paths (units go round)
    this.hasWalls = walls.count > 0 || lava !== null; this.hasCareful = mines.count > 0;
    mined.set(blocked);
    if (mines.count > 0) {
      const inv = 1 / this.cell;
      for (let k = 0; k < mines.high; k++) {
        if (!mines.alive[k]) continue;
        const x0 = Math.max(0, Math.floor((mines.x[k] - MINE_AVOID) * inv)), x1 = Math.min(cols - 1, Math.floor((mines.x[k] + MINE_AVOID) * inv));
        const y0 = Math.max(0, Math.floor((mines.y[k] - MINE_AVOID) * inv)), y1 = Math.min(rows - 1, Math.floor((mines.y[k] + MINE_AVOID) * inv));
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) mined[cy * cols + cx] = 1;
      }
    }
    dilate(blocked, this.nearWall, cols, rows); dilate(mined, this.nearMined, cols, rows);
    this.wallsVersion = walls.version; this.minesVersion = mines.version;
    this.lavaKey = lava !== null ? lava.navKey(world) : -1;   // STEP7 TERRAIN-SIM
    this.ready.fill(0); this.readyCareful.fill(0);
  }
  compute(faction, world) {
    if (this.hasWalls) { this.computeField(faction, world, this.dist[faction], this.blocked, this.nearWall); this.ready[faction] = 1; }
    if (this.hasCareful) { this.computeField(faction, world, this.careful[faction], this.mined, this.nearMined); this.readyCareful[faction] = 1; }
  }
  isReady(f) { return !((this.hasWalls && this.ready[f] !== 1) || (this.hasCareful && this.readyCareful[f] !== 1)); }
  // Dijkstra from every cell holding a visible enemy of `faction` (OG game.js:2523-2573).
  // Step 24 px (×√2 diagonal, no corner cutting), ×1.6 into a cell next to a wall.
  computeField(faction, world, dist, blk, near) {
    const { cols, rows } = this, inv = 1 / this.cell, mask = ENEMY[faction], us = world.units;
    dist.fill(Infinity); this.heapSize = 0;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.dead || maskHas(mask, u.faction) === 0 || u.def.lurk !== undefined) continue;   // lurkers never seed (OG game.js:2530)
      if (u.def.stalk !== undefined && u.unseen > 0) continue;                                  // hidden stalkers never seed (OG game.js:2531)
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(u.x * inv))), cy = Math.min(rows - 1, Math.max(0, Math.floor(u.y * inv))), c = cy * cols + cx;
      if (blk[c] === 1) {
        for (let y = Math.max(0, cy - 1); y <= Math.min(rows - 1, cy + 1); y++) for (let x = Math.max(0, cx - 1); x <= Math.min(cols - 1, cx + 1); x++) if (blk[y * cols + x] !== 1) this.seed(dist, y * cols + x);
      } else this.seed(dist, c);
    }
    while (this.heapSize > 0) {
      const key = this.heapKey[0], c = this.pop();
      if (key > dist[c]) continue;
      const cx = c % cols, cy = (c - cx) / cols;
      for (let dy = -1; dy <= 1; dy++) {
        const y = cy + dy; if (y < 0 || y >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = cx + dx; if (x < 0 || x >= cols) continue;
          const v = y * cols + x;
          if (blk[v] === 1) continue;
          if (dx !== 0 && dy !== 0 && (blk[cy * cols + x] === 1 || blk[y * cols + cx] === 1)) continue;
          let step = (dx !== 0 && dy !== 0 ? SQRT2 : 1) * this.cell;
          if (near[v] === 1) step *= 1.6;
          const nd = key + step;
          if (nd < dist[v]) { dist[v] = nd; this.push(v, nd); }
        }
      }
    }
  }
  // Unit direction toward the lowest neighbour; false when no field / no way (OG game.js:2581-2606).
  // OURS (attack 3, 11-18): a unit standing in a walled cell (any wall tile in its 24 px cell) next to a wall one or two
  // tiles thick (the step-7 maps' fences, walls and gates; a thin painted wall) could be sent to the neighbour cell on the
  // FAR side of that wall: its own cell is blocked (no distance), the cell beyond is open and nearer the enemy, so the
  // unit walked into the wall for good (village: a legion pressed against the enclosure wall, charging, until the battle
  // ended). OG does the same, but OG's painted walls are rarely that thin. Fix: from a walled cell, a neighbour whose
  // centre the unit can't see in a straight line is skipped (if every open neighbour is behind a wall, OG's pick stands).
  direction(faction, x, y, out, careful = false) {
    if (careful) careful = this.hasCareful;
    if ((careful ? this.readyCareful[faction] : this.ready[faction]) === 0) return false;
    const { cols, rows } = this, d = careful ? this.careful[faction] : this.dist[faction], blk = careful ? this.mined : this.blocked, inv = 1 / this.cell;
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x * inv))), cy = Math.min(rows - 1, Math.max(0, Math.floor(y * inv)));
    const walled = this.blocked[cy * cols + cx] === 1 && this.walls !== null && this.walls.count > 0, C = this.cell;
    let best = d[cy * cols + cx], bx = -1, by = -1, seen = best, sx = -1, sy = -1;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy; if (yy < 0 || yy >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = cx + dx; if (xx < 0 || xx >= cols) continue;
        const v = yy * cols + xx;
        if (blk[v] === 1 || (dx !== 0 && dy !== 0 && (blk[cy * cols + xx] === 1 || blk[yy * cols + cx] === 1))) continue;
        if (d[v] < best) { best = d[v]; bx = xx; by = yy; }
        if (walled && d[v] < seen && this.walls.lineOfSight(x, y, (xx + 0.5) * C, (yy + 0.5) * C)) { seen = d[v]; sx = xx; sy = yy; } // OURS (above)
      }
    }
    if (walled && sx >= 0 && seen !== Infinity) { best = seen; bx = sx; by = sy; }
    if (bx < 0 || best === Infinity) return false;
    const ax = (bx + 0.5) * this.cell - x, ay = (by + 0.5) * this.cell - y, m = Math.sqrt(ax * ax + ay * ay) || 1;
    out[0] = ax / m; out[1] = ay / m; return true;
  }
  clear() {
    this.blocked.fill(0); this.nearWall.fill(0); this.mined.fill(0); this.nearMined.fill(0); this.ready.fill(0); this.readyCareful.fill(0);
    this.wallsVersion = -1; this.minesVersion = -1; this.hasWalls = false; this.hasCareful = false;
    this.lavaKey = -1; // STEP7 TERRAIN-SIM
  }
  seed(d, c) { if (d[c] !== 0) { d[c] = 0; this.push(c, 0); } }
  push(c, k) {
    const hc = this.heapCell, hk = this.heapKey; let i = this.heapSize++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hc[i] = hc[p]; hk[i] = hk[p]; i = p; }
    hc[i] = c; hk[i] = k;
  }
  pop() {
    const hc = this.heapCell, hk = this.heapKey, top = hc[0], n = --this.heapSize, lc = hc[n], lk = hk[n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hc[i] = hc[c]; hk[i] = hk[c]; i = c; }
    hc[i] = lc; hk[i] = lk; return top;
  }
}
function dilate(src, dst, cols, rows) {
  dst.fill(0);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (src[y * cols + x] !== 0)
    for (let j = Math.max(0, y - 1); j <= Math.min(rows - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(cols - 1, x + 1); i++) dst[j * cols + i] = 1;
}

// System: refresh each present faction's field when walls/mines changed, or on its slot of the 20-tick cycle (OG game.js:4800-4815).
const PRESENT = new Uint8Array(FACTION_COUNT);
// Tick of the 20-tick cycle on which faction f's field refreshes: floor(f * 20 / 37), the faction count the maps and
// the march were tuned with (step 8), so adding side slots 37-52 (side split 11-17) moves no existing faction's tick;
// slots 37-52 spread over the cycle the same way. (OG: floor(f * 20 / 27), OG game.js:4813; tried 11-17: the OG checker
// matched 66/66 either way, and one 60 v 60 lake battle went from 89 s to 321 s.)
const NAV_SPREAD = 37;
function navSlot(f) { return f < NAV_SPREAD ? Math.floor((f * NAV_REFRESH) / NAV_SPREAD) : Math.floor(((f - NAV_SPREAD) * NAV_REFRESH) / (FACTION_COUNT - NAV_SPREAD)); }
export function run(world) {
  const nav = world.nav, walls = world.walls, mines = world.mines;
  const lava = world.lava7 !== undefined && world.lava7.cells > 0 ? world.lava7 : null;   // STEP7 TERRAIN-SIM: lava blocks paths too
  if (walls.count === 0 && mines.count === 0 && lava === null) return;
  // which factions are on the field (side split 11-17: a byte per faction; the old 32-bit `1 << faction` folded
  // factions 32+ onto 0-3, so Sports/Bugs/Bosses/Secret paths were only refreshed by luck)
  const us = world.units, present = PRESENT; present.fill(0);
  for (let i = 0; i < us.length; i++) if (!us[i].dead) present[us[i].faction] = 1;
  const lk = lava !== null ? lava.navKey(world) : -1;   // STEP7 TERRAIN-SIM
  const changed = nav.wallsVersion !== walls.version || nav.minesVersion !== mines.version || nav.lavaKey !== lk;
  if (changed) nav.syncWalls(walls, mines, world, lava);
  const slot = world.tick % NAV_REFRESH;
  for (let f = 0; f < FACTION_COUNT; f++) {
    if (present[f] === 0) continue;
    if (!changed && nav.isReady(f) && slot !== navSlot(f)) continue;
    nav.compute(f, world);
  }
}

// ---------------------------------------------------------------- shared path helpers (OG module 447)
const dirTmp = new Float32Array(2), ptTmp = new Float32Array(2);
const SIDE_KEEP = 0.85; // keep 85 % of the unit's sideways offset from the group axis (OG game.js:9446, 9488-9500)

// Mine caution is off while burning or fleeing (OG game.js:11665-11667).
export function ignoresMines(u) { return u.burning > 0 || u.state === STATE.FLEE; }

// moveTo (447.c): goal toward (tx,ty) at `speed`. Straight when `clear` says the line is open; otherwise, if walls exist
// (or mines for a mine-aware unit), follow the faction flow field and set pathing = 1 (OG game.js:9448-9460).
export function moveTo(world, u, tx, ty, speed, clear = false) {
  const careful = !ignoresMines(u) && world.mines.count > 0 && u.def.mineAware;
  if (clear && careful && world.mines.blocks(u.x, u.y, tx, ty, u.radius + MINE_AVOID)) clear = false;
  const lv = world.lava7 !== undefined && world.lava7.cells > 0 && world.lava7.avoids(u) ? world.lava7 : null;   // STEP7 TERRAIN-SIM: lava on the
  if (clear && lv !== null && lv.blocks(world, u.x, u.y, tx, ty)) clear = false;                                 // straight line: follow the field round it
  if (!clear && (world.walls.count > 0 || careful || lv !== null) && world.nav.direction(u.faction, u.x, u.y, dirTmp, careful)) {
    u.goalX = dirTmp[0] * speed; u.goalY = dirTmp[1] * speed; u.pathing = 1; return;
  }
  const dx = tx - u.x, dy = ty - u.y, m = Math.sqrt(dx * dx + dy * dy) || 1;
  u.goalX = (dx / m) * speed; u.goalY = (dy / m) * speed;
}

// Group point with the unit's sideways offset kept ×0.85 (OG game.js:9488-9500).
export function offsetPoint(world, u, g, px, py, out) {
  const gs = world.groups, ax = px - gs.cx[g], ay = py - gs.cy[g], d = Math.sqrt(ax * ax + ay * ay) || 1, fx = ax / d, fy = ay / d;
  const ox = u.x - gs.cx[g], oy = u.y - gs.cy[g], along = ox * fx + oy * fy;
  out[0] = px + (ox - along * fx) * SIDE_KEEP; out[1] = py + (oy - along * fy) * SIDE_KEEP;
  return out;
}

// followGroup (447.a): with no target, go to the group's contact point (if younger than `memory` s and at least reactTime old),
// else its hunt intel point (if at least reactTime old); else an Advancing unit moving ≥ 0.3·speed keeps going straight.
// Stops within 24 px. Sets Advance. Returns true when it set a goal (OG game.js:9461-9487).
export function followGroup(world, u, speed, memory) {
  const g = u.group; if (g < 0) return false;
  const gs = world.groups, react = u.reactTime, fresh = gs.contactAge[g] < memory, intel = gs.hasIntel[g] === 1;
  let px, py;
  if (fresh && world.time - gs.contactSince[g] >= react) { px = gs.contactX[g]; py = gs.contactY[g]; }
  else if (intel && world.time - gs.intelSince[g] >= react) { px = gs.intelX[g]; py = gs.intelY[g]; }
  else {
    const sp = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
    if ((!fresh && !intel) || u.state !== STATE.ADVANCE || sp < 0.3 * speed) return false;
    u.goalX = (u.vx / sp) * speed; u.goalY = (u.vy / sp) * speed; return true;
  }
  offsetPoint(world, u, g, px, py, ptTmp);
  const dx = ptTmp[0] - u.x, dy = ptTmp[1] - u.y;
  if (dx * dx + dy * dy < 576) return false; // within 24 px
  setState(u, STATE.ADVANCE);
  moveTo(world, u, ptTmp[0], ptTmp[1], speed, false);
  return true;
}

// groupPoint (447.b): where this unit's group thinks the fight is: contact (younger than memory), else intel, else the
// target's position. Writes out[0..1]; false if none (OG game.js:9501-9510).
export function groupPoint(world, u, target, memory, out) {
  if (typeof target === 'number') target = world.unitById(target);
  const g = u.group, gs = world.groups;
  if (g >= 0 && gs.contactAge[g] < memory) { offsetPoint(world, u, g, gs.contactX[g], gs.contactY[g], out); return true; }
  if (g >= 0 && gs.hasIntel[g] === 1) { offsetPoint(world, u, g, gs.intelX[g], gs.intelY[g], out); return true; }
  if (target) { out[0] = target.x; out[1] = target.y; return true; }
  return false;
}
