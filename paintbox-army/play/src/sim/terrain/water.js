// Water: painting, the depth/wade queries other systems use, plague taint, and the water system (tick step 17).
// Level comes from distance to shore (grid.js shelve): deep only 3+ tiles (24 px) in from the edge. Nobody drowns.
// OG modules 467 (game.js:9553-9882) and 1076 (system, game.js:655-760).
import { DT, WET, DEEP, SWIM_CAP, STATE } from '../const.js';
import { terrainOf, forCapsule, recountWater, cellOf, wipeWater, FULL, SHALLOW, climbOf } from './grid.js';
import { deps } from './deps.js';
import './hooks.js';

export { WET, DEEP, SWIM_CAP };
// Water system numbers (OG game.js:672-687).
export const STEAM_QUENCH = 26, STEAM_QUENCH_LIFE = 3.5;   // cloud radius 26 + r, 3.5 s (x, k)
export const OIL_STEAM_EVERY = 20, OIL_STEAM_COUNT = 3, OIL_STEAM_R = 34, OIL_STEAM_LIFE = 3; // burning oil on deep water (A, S, M, E)
export const TAINT_LIFE = 25, TAINT_EVERY = 30, TAINT_SPREAD_EVERY = 30, TAINT_SPREAD_STEP = 1.5, TAINT_CATCH = 0.15; // (O, _, j, T, R)
export const SPLASH_SPEED = 25, SPLASH_EVERY = 14;         // wading splash (L, N)
export const ANTHILL_DPS = 30;                             // anthill in water loses 30 × min(1, depth) hp/s (P)
export const BOAR_HEAL = 6, BOAR_HEAL_BELOW = 0.85;        // idle boar in shallow water heals 6 hp/s below 85 % hp (I; OG game.js:18196)
// Wade (OG game.js:9715-9723) and the deepWalker depth contour (OG game.js:9867-9875).
export const WADE_MIN = 0.35, WADE_K = 0.8, WADE_REF_R = 9.5, WADE_CLAMP_LO = 0.45, WADE_CLAMP_HI = 1.3;
export const SUBMERGE_RATIO = 2.2, CONTOUR_SHALLOW = 4, CONTOUR_DEEP = 26;
// Taint spread hash gates (OG game.js:9873-9877).
const TDX = [1, -1, 0, 0, 1, 1, -1, -1], TDY = [0, 0, 1, -1, 1, -1, 1, -1], TAINT_GATE = 0.9, TAINT_GATE_DIAG = 0.6;

// ---------------------------------------------------------------- painting
// One stroke id per pointerdown (paint or erase); each tile toggles at most once per stroke (OG game.js:9639-9641, 9664-9665).
export function beginWaterStroke(world) { terrainOf(world).strokeId++; }
let _T = null, _v = 0, _n = 0;
function paintTile(i) { const T = _T; if (T.stroke[i] === T.strokeId) return; T.stroke[i] = T.strokeId; if (T.depth[i] !== _v) { T.depth[i] = _v; _n++; } }
// Depth 1 (or 0 when erasing) on tiles within max(r, 4) px of the segment, full brush radius (OG game.js:9642-9677).
export function paintWater(world, x0, y0, x1, y1, r, erase = false) {
  const T = terrainOf(world);
  _T = T; _v = erase ? 0 : FULL; _n = 0;
  forCapsule(T, x0, y0, x1, y1, r, paintTile);
  const n = _n; _T = null;
  if (n > 0) recountWater(world, T);
  return n;
}
// Broken ice leaves water: depth 1 on those tiles (OG flood, game.js:9634-9638).
export function flood(world, cells) {
  const T = terrainOf(world); let ch = false;
  for (const i of cells) if (i >= 0 && i < T.n && T.depth[i] !== FULL) { T.depth[i] = FULL; ch = true; }
  if (ch) recountWater(world, T);
}

// ---------------------------------------------------------------- queries (OG 467 API)
// Level under (x,y); 0 over intact ice (OG depthAt game.js:9602-9610).
export function depthAt(world, x, y) {
  if (world.waterCells === 0) return 0;
  const T = terrainOf(world), i = cellOf(T, x, y);
  if (i < 0) return 0;
  if (world.iceCells > 0 && T.iceHp[i] > 0) return 0;
  const B = world.bridge7; if (B !== undefined && B.cells > 0 && B.hp[i] > 0) return 0;   // STEP7 TERRAIN-SIM: a bridge plank over water is dry (aquatic units read depthUnder: they swim under)
  return T.level[i];
}
// Level ignoring ice (OG depthUnder game.js:9611-9616).
export function depthUnder(world, x, y) {
  if (world.waterCells === 0) return 0;
  const T = terrainOf(world), i = cellOf(T, x, y);
  return i < 0 ? 0 : T.level[i];
}
// Intact ice over water (OG frozenAt game.js:9617-9625).
export function frozenAt(world, x, y) {
  if (world.waterCells === 0 || world.iceCells === 0) return false;
  const T = terrainOf(world), i = cellOf(T, x, y);
  return i >= 0 && T.iceHp[i] > 0 && T.level[i] >= WET;
}
export function isDeepAt(world, x, y) { return world.waterCells > 0 && terrainOf(world).deepCells > 0 && depthAt(world, x, y) >= DEEP; } // OG 9626-9628
export function isDeepTile(world, tx, ty) { // OG game.js:9629-9633
  const T = terrainOf(world);
  if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) return false;
  const i = ty * T.cols + tx;
  const B = world.bridge7; if (B !== undefined && B.cells > 0 && B.hp[i] > 0) return false;   // STEP7 TERRAIN-SIM: a plank over it
  return T.level[i] >= DEEP && !(T.iceHp[i] > 0);
}
// In water: on the ground, not climbing, depth ≥ 0.05 (aquatic units ignore ice above them) (OG game.js:9824-9829).
export function wetAt(world, u) {
  if (world.waterCells === 0 || u.z > 0 || climbOf(u) !== 0) return false;
  return (u.def.aquatic ? depthUnder(world, u.x, u.y) : depthAt(world, u.x, u.y)) >= WET;
}
// Steering speed factor in water (OG wade, game.js:9715-9723; applied at game.js:13791-13794).
export function wade(world, u, def = u.def) {
  if (world.waterCells === 0 || def.hopper || u.z > 0) return 1;
  let e = depthAt(world, u.x, u.y);
  if (e < WET) return 1;
  if (def.waterPace !== undefined) return def.waterPace;
  if (def.swims) e = Math.min(e, SWIM_CAP);
  const n = Math.min(WADE_CLAMP_HI, Math.max(WADE_CLAMP_LO, WADE_REF_R / u.radius));
  return Math.max(WADE_MIN, 1 - WADE_K * e * n);
}
// Visual water depth in px for a level (OG game.js:9870-9875).
export function depthContour(t) {
  if (t < WET) return 0;
  if (t <= SHALLOW) return CONTOUR_SHALLOW * Math.min(1, t / SHALLOW);
  const e = Math.min(1, (t - SHALLOW) / (FULL - SHALLOW));
  return CONTOUR_SHALLOW + (CONTOUR_DEEP - CONTOUR_SHALLOW) * e * e * (3 - 2 * e);
}
// deepWalker under water: bullets and arrows pass over it (OG game.js:9830-9833).
export function submerged(world, u, def = u.def) {
  return !(world.waterCells === 0 || terrainOf(world).deepCells === 0 || !def.deepWalker || u.z > 0) && depthContour(depthAt(world, u.x, u.y)) >= u.radius * SUBMERGE_RATIO;
}
export function shoreAt(world, x, y) { const T = terrainOf(world), i = cellOf(T, x, y); return i < 0 ? 0 : T.shore[i]; } // OG 9765-9769
export function pondAt(world, x, y) { if (world.waterCells === 0) return -1; const T = terrainOf(world), i = cellOf(T, x, y); return i < 0 ? -1 : T.pond[i]; } // OG 9787-9792
// Tile centre within ±2 tiles with the largest shore distance (deeper inward), into out[] (OG game.js:9770-9786).
export function inward(world, x, y, out) {
  const T = terrainOf(world), ox = Math.floor(x * T.inv), oy = Math.floor(y * T.inv);
  if (ox < 0 || oy < 0 || ox >= T.cols || oy >= T.rows) return false;
  let best = T.shore[oy * T.cols + ox], found = false;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const tx = ox + dx, ty = oy + dy;
    if (tx < 0 || ty < 0 || tx >= T.cols || ty >= T.rows) continue;
    const s = T.shore[ty * T.cols + tx];
    if (s <= best) continue;
    best = s; out[0] = (tx + 0.5) * T.tile; out[1] = (ty + 0.5) * T.tile; found = true;
  }
  return found;
}
// Nearest open (not iced) water tile centre within r, ring by ring (OG game.js:9835-9866).
export function nearestWet(world, x, y, r, out) {
  if (world.waterCells === 0) return false;
  const T = terrainOf(world), cx = Math.floor(x * T.inv), cy = Math.floor(y * T.inv), R = Math.ceil(r * T.inv);
  const B = world.bridge7, bh = B !== undefined && B.cells > 0 ? B.hp : null;   // STEP7 TERRAIN-SIM: water under a plank isn't open water
  for (let k = 0; k <= R; k++) {
    let best = -1, bd = Infinity;
    for (let ty = cy - k; ty <= cy + k; ty++) {
      if (ty < 0 || ty >= T.rows) continue;
      const edge = ty === cy - k || ty === cy + k;
      for (let tx = cx - k; tx <= cx + k; tx += edge || k === 0 ? 1 : 2 * k) {
        const i = ty * T.cols + tx;
        if (tx < 0 || tx >= T.cols || T.level[i] < WET || T.iceHp[i] > 0 || (bh !== null && bh[i] > 0)) continue;
        const d = ((tx + 0.5) * T.tile - x) ** 2 + ((ty + 0.5) * T.tile - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best >= 0) {
      if (bd > r * r) return false;
      out[0] = ((best % T.cols) + 0.5) * T.tile; out[1] = (Math.floor(best / T.cols) + 0.5) * T.tile; return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- plague taint (OG game.js:9724-9764)
// taint[i] = time the taint ends. Sick units and carriers taint the tile under them; it spreads every 30 ticks.
export function taintAt(world, x, y, until, time) {
  const T = terrainOf(world), i = cellOf(T, x, y);
  if (i < 0 || T.level[i] < WET || T.taint[i] >= until) return;
  if (T.taint[i] < until - 1) T.taintVersion++;
  if (T.taint[i] <= time) T.taintSince[i] = time;
  T.taint[i] = until; T.taintEnds = Math.max(T.taintEnds, until);
}
function taintHash(i, s) { let n = Math.imul(i + 1, 374761393) ^ Math.imul(s + 7, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; } // OG 9878-9881
export function spreadTaint(world, time, step) {
  const T = terrainOf(world);
  if (T.taintEnds <= time) return;
  const C = T.cols, R = T.rows, o = T.taint, L = T.level, c = T.taintNext;
  c.set(o);
  let grew = false;
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const m = y * C + x;
    if (o[m] - step <= time) continue;
    for (let v = 0; v < 8; v++) {
      const dx = TDX[v], dy = TDY[v], nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
      const j = ny * C + nx, diag = dx !== 0 && dy !== 0;
      if (taintHash(j, T.spreadSteps) > (diag ? TAINT_GATE_DIAG : TAINT_GATE)) continue;
      const until = o[m] - step * (diag ? Math.SQRT2 : 1);
      if (until <= time || L[j] < WET || c[j] >= until) continue;
      if (c[j] <= time) { grew = true; T.taintSince[j] = time; }
      c[j] = until;
    }
  }
  o.set(c); T.spreadSteps++;
  if (grew) T.taintVersion++;
}
export function taintedAt(world, x, y, time) {
  const T = terrainOf(world);
  if (T.taintEnds <= time) return false;
  const i = cellOf(T, x, y);
  return i >= 0 && T.level[i] >= WET && T.taint[i] > time;
}

// ---------------------------------------------------------------- system (tick step 17)
function isBoar(t) { return t === 'boar' || t === 'risen_boar'; }
const steamPick = [];

export function run(world) {
  const us = world.units, T = terrainOf(world);
  if (world.waterCells === 0) {
    if (T.wetLeft) { for (let k = 0; k < us.length; k++) us[k].wet = 0; T.wetLeft = false; }
    return;
  }
  const oil = deps.oil(world), steam = world.steam;
  if (world.tick % TAINT_SPREAD_EVERY === 0) spreadTaint(world, world.time, TAINT_SPREAD_STEP);
  // Burning oil over deep water steams: up to 3 random cells every 20 ticks (OG game.js:692-715).
  if (oil && oil.burning > 0 && oil.fire && world.tick % OIL_STEAM_EVERY === 0) {
    steamPick.length = 0;
    for (let k = 0; k < oil.fire.length; k++) {
      if (oil.fire[k] === 0) continue;
      if (depthAt(world, ((k % oil.cols) + 0.5) * oil.tile, (Math.floor(k / oil.cols) + 0.5) * oil.tile) >= DEEP) steamPick.push(k);
    }
    for (let n = 0; n < OIL_STEAM_COUNT && steamPick.length > 0; n++) {
      const k = steamPick[Math.floor(world.rng() * steamPick.length)];
      const sx = ((k % oil.cols) + 0.5) * oil.tile, sy = (Math.floor(k / oil.cols) + 0.5) * oil.tile;
      if (steam) steam.add(sx, sy - 10, OIL_STEAM_R, OIL_STEAM_LIFE, world.time);
      world.emit('steam', { x: sx, y: sy, size: OIL_STEAM_R, v: OIL_STEAM_R / 26 });
    }
  }
  for (let k = 0; k < us.length; k++) {
    const u = us[k];
    if (u.dead) continue;
    const x = u.x, y = u.y, isWet = wetAt(world, u);
    // u.wet: this tick's water depth under the unit (0 = dry), for others to read next tick.
    u.wet = isWet ? (u.def.aquatic ? depthUnder(world, x, y) : depthAt(world, x, y)) : 0;
    if (isWet) T.wetLeft = true;
    if (!isWet || frozenAt(world, x, y)) continue;
    const E = depthAt(world, x, y), type = u.type, def = u.def, n = u.index; // OG i
    // Fire out + kindled cleared (CORE-B's quench, idempotent; OG game.js:719-733).
    if (u.burning > 0 || u.kindled === 1) deps.quench(world, u);
    if (type === 'anthill') {
      deps.damage(world, u, ANTHILL_DPS * Math.min(1, E) * DT, -1);             // OG game.js:734-737
      if ((world.tick + n) % 20 === 0) world.emit('puff', { kind: 'splash', x: x + (2 * world.rng() - 1) * u.radius, y, ang: -Math.PI / 2, size: 0.7 });
    } else if (isBoar(type) && E < DEEP && u.state === STATE.IDLE && u.hp < u.maxHp * BOAR_HEAL_BELOW) {
      u.hp = Math.min(u.maxHp, u.hp + BOAR_HEAL * DT);                          // OG game.js:738-744
      if ((world.tick + n) % 30 === 0) world.emit('puff', { kind: 'dust', x: x + 4 * (2 * world.rng() - 1), y, ang: world.rng() * Math.PI * 2, size: 0.6 });
    }
    // Plague: sick units and carriers taint the water; others may catch it from tainted water (OG game.js:745-747).
    if (u.plague > 0 || def.plagueCarrier) { if ((world.tick + n) % TAINT_EVERY === 0) taintAt(world, x, y, world.time + TAINT_LIFE, world.time); }
    else if (taintedAt(world, x, y, world.time) && world.rng() < TAINT_CATCH * DT) deps.catchPlague(world, u);
    // Wading splash (OG game.js:748-758).
    if (Math.hypot(u.vx, u.vy) > SPLASH_SPEED && (world.tick + n) % SPLASH_EVERY === 0) {
      world.emit('puff', { kind: 'splash', x, y, ang: -Math.PI / 2 + 0.15 * Math.atan2(u.vy, u.vx), size: 0.35 + u.radius / 30 });
      world.emit('splash', { x, y, v: 0.25 + u.radius / 40, type });
    }
  }
}

// ---------------------------------------------------------------- createGame tool contract
export function paint(world, x0, y0, x1, y1, r) { return paintWater(world, x0, y0, x1, y1, r, false); }
export function erase(world, x0, y0, x1, y1, r) { return paintWater(world, x0, y0, x1, y1, r, true); }
export function beginStroke(world) { beginWaterStroke(world); }
export function clear(world) { wipeWater(world, terrainOf(world)); }
