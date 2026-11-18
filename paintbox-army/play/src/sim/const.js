// Shared constants and tiny math helpers. OG core-move §0, core-combat §0 (OG module 394, game.js:8656-8671).

export const DT = 1 / 60;              // sim step (OG game.js:8656)
export const THINK_MIN = 4;            // think stride 4..8 ticks: next = tick + 4 + int(5) (OG game.js:8657-8658, 4925)
export const THINK_SPAN = 5;
export const FIRST_THINK_SPAN = 6;     // first think = spawn tick + 1 + int(6) (OG game.js:5583)
export const MORALE_STEP = 6 * DT;     // 0.1 s fixed morale step (OG game.js:8659)
export const UNIT_CAP = 32768;         // OG game.js:8660
export const GROUP_CAP = 8192;         // OG game.js:8661
export const PROJECTILE_CAP = 16384;   // OG game.js:8662
export const GRID_CELL = 44;           // spatial grid cell px (OG game.js:8663)
export const NEIGHBOUR_RADIUS = 44;    // steering neighbour radius (OG game.js:8664)
export const NEIGHBOUR_CAP = 28;       // steering neighbour cap (OG game.js:8665)
export const FIELD_CELL = 40;          // fear/noise field cell (OG game.js:8666)
export const QUERY_MARGIN = 46;        // max unit radius margin added to radius queries (OG game.js:8667)
export const RADIUS_SCALE = 1.1;       // def radius + brushSpacing scale (OG game.js:8668)
export const WALL_TILE = 8;            // OG game.js:8669
export const NAV_CELL = 24;            // OG game.js:8670
export const NAV_REFRESH = 20;         // ticks (OG game.js:8671)
export const SCRATCH = 4096;           // default max hits per radius query (OG game.js:5499)
export const CSS_PER_SIM = 1.075;      // CSS px per sim px (OG game.js:8007, 8056)
export const GRAVITY = 900;            // px/s² (OG game.js:9009)
export const BRUSH_RADIUS = 14;        // default brush radius px (OG game.js:7556)
export const BRUSH_MIN = 4, BRUSH_MAX = 160; // wheel clamp (OG game.js:7590)
export const MINE_RADIUS = 9.45;      // OG game.js:11670
export const MINE_AVOID = MINE_RADIUS + 4; // 13.45: nav block + mine push radius (OG game.js:11671)
export const WALL_BRUSH_SCALE = 0.75;  // walls paint at radius × 0.75 (OG game.js:7552)

// Unit states (OG game.js:9219).
export const STATE = Object.freeze({ IDLE: 0, ADVANCE: 1, ENGAGE: 2, ALERT: 3, CHARGE: 4, FLEE: 5 });
// Locomotion (OG game.js:8508).
export const LOCO = Object.freeze({ HOLONOMIC: 0, VEHICLE: 1 });
// Leaping modes that steering reads (OG module 506: 2 = vault, 3 = dragon flight, game.js:10649-10650).
export const LEAP = Object.freeze({ NONE: 0, VAULT: 2, FLY: 3 });
// Harm / death causes (OG game.js:11595).
export const CAUSE = Object.freeze({ Other: 0, Blow: 1, Blast: 2, Fire: 3, Plague: 4, Thrown: 5, Eaten: 7, Turned: 8 });
// Water depth thresholds (OG game.js:9554-9557).
export const WET = 0.05, DEEP = 0.75, SWIM_CAP = 0.45;

// Math helpers (OG module 392).
export const TAU = Math.PI * 2;
export function hypot(x, y) { return Math.sqrt(x * x + y * y); }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function wrapAngle(a) {
  if (a >= Math.PI) { if (a < 3 * Math.PI) return a - TAU; }
  else { if (a >= -Math.PI) return a; if (a >= -3 * Math.PI) return a + TAU; }
  a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI;
}
export function angleDiff(from, to) { return wrapAngle(to - from); }
// Turn angle a toward b by at most step rad.
export function turnToward(a, b, step) { const d = wrapAngle(b - a); return wrapAngle(d > step ? a + step : d < -step ? a - step : a + d); }
// Deterministic hash of two ints into [0,1) (OG game.js:8599-8602).
export function hash2(i, t) { let e = Math.imul(i + 1, 374761393) ^ Math.imul(t, 668265263); e = Math.imul(e ^ (e >>> 13), 1274126177); e ^= e >>> 16; return (e >>> 0) / 4294967296; }
// State setter: a new state resets stateTime (OG game.js:9220-9222).
export function setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }
