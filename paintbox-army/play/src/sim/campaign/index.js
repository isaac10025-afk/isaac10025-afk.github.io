// CAMPAIGN (OURS, Part 2 step 9, STEP9.md). Owner: LEAD.
// 12 worlds x 8 battles. A battle = a map, the enemy already painted on the left (red) half, a paint budget for the
// player on the right (blue) half. Spend less = more stars. Everything is open (PLAN decision E): no locks.
// The sim side of the rules lives in game.js (setBudget: only your half, only before START, stops at the budget,
// erase refunds, possess only your own units). This file: the level list, painting a level, stars, win / lose.
// Plain data + functions, no DOM: the UI, the bot (tools/campaign-bot.mjs) and the tests all use it.
import { getDef } from '../defs.js';
import { F } from '../factions.js';
import { STATE } from '../const.js';
import { priceOf } from './prices.js';
import { BUDGETS } from './budgets.js';
import { LEVEL_SETS } from './levels/index.js';

export const WORLDS = ['army', 'animals', 'mythical', 'dinos', 'siege', 'pirates', 'robots', 'space', 'ocean', 'sports', 'bugs', 'bosses'];
export const PER_WORLD = 8;
export const ENEMY = 0, PLAYER = 1;   // team ids: enemy = left half (red), player = right half (blue)
export const TIME_LIMIT = 180;        // s after START: not won by then = lost ('time')
export const MOP_UP = 0.1;            // at 3:00: enemy down to <= 10% of its starting paint value and you have more left = a win
                                      // (LEVELS-A 11-19: idle stragglers - zombie slimes, frogs - sit in corners and never come)
export const ROUT_TIME = 5;           // s: every unit a side has left running away (Flee) this long = that side lost
                                      // (LEVELS-B 11-19: one fleeing pistol at 13 hp outran 10 legion until 3:00)
// Star lines, x C = the bot's cheapest sure win (tools/campaign-bot.mjs, worst of the 3 screen shapes), rounded up nice.
// The bot's budget is at least `budget` x C and big enough that `ways` different unit types each win alone; its 2-star
// line = nice(sqrt(3-star x budget)). The x C numbers below are only the stand-in before the bot has run.
export const STAR_RULE = { star3: 1.15, star2: 1.5, budget: 2, ways: 8 };
const MARGIN = 14;                    // px kept clear of the field edge
const MID_GAP = 1.25;                 // x brush spacing kept clear of the midline (a unit never lands on the other half)

// ---------------------------------------------------------------- levels
// A level: { id: '<world>-<n>', world, n (1..8), map ('blank' | a MAP_ORDER id),
//   enemy: [{ type, n, x, y, w?, h? }],          // a box per group, in fractions of the ENEMY HALF:
//                                                 //   x 0 = back edge, 1 = midline; y 0 = top, 1 = bottom (centre)
//                                                 //   w, h (optional) = the box's shape; its size always comes from n
//   terrain: [{ kind, pts: [[x, y], ...], r }] }  // optional extra terrain on the enemy half (same fractions, r in px)
const REG = new Map();
for (const w of WORLDS) {
  const list = LEVEL_SETS[w] || [];
  list.forEach((lv, i) => { const n = lv.n || i + 1, id = `${w}-${n}`; REG.set(id, { ...lv, id, world: w, n, map: lv.map || 'blank', enemy: lv.enemy || [], terrain: lv.terrain || [] }); });
}
export function getLevel(id) { return REG.get(id) || null; }
export function levelsOf(world) { const out = []; for (let n = 1; n <= PER_WORLD; n++) { const lv = REG.get(`${world}-${n}`); if (lv) out.push(lv); } return out; }
export function allLevels() { return WORLDS.flatMap(levelsOf); }
export function nextLevel(id) {
  const lv = getLevel(id); if (!lv) return null;
  const same = getLevel(`${lv.world}-${lv.n + 1}`); if (same) return same;
  const wi = WORLDS.indexOf(lv.world);
  for (let k = wi + 1; k < WORLDS.length; k++) { const f = levelsOf(WORLDS[k])[0]; if (f) return f; }
  return null;
}

// ---------------------------------------------------------------- prices, budget, stars
// Paint price of a unit the player can paint, or null (not for sale: props, terrain, spawned-only, risen copies).
export function forSale(type) {
  const d = getDef(type);
  // props of the Props side (tree, barrel) aren't units; a prop of a fighting side (beehive) is, as Team battle has it
  if (!d || d.unpaintable || (d.prop && d.faction === F.Props) || d.category === 'terrain' || String(type).startsWith('risen_')) return null;
  const p = priceOf(type);
  return p > 0 ? p : null;
}
export function enemyValue(lv) { let v = 0; for (const g of lv.enemy) v += (priceOf(g.type) || 0) * g.n; return v; }
// Round up to 2 significant figures, steps of at least 5.
export function nice(v) { if (!(v > 0)) return 0; const step = Math.max(5, 10 ** (Math.floor(Math.log10(v)) - 1)); return Math.ceil(v / step - 1e-9) * step; }
// { budget, star2, star3, cheapest (C), checked (bot data present) }. Before the bot has run: C = the enemy's own price.
export function budgetOf(id) {
  const lv = getLevel(id); if (!lv) return null;
  const b = BUDGETS[id];
  if (b && b.budget) return { budget: b.budget, star2: b.star2, star3: b.star3, cheapest: b.cheapest, checked: true };
  const C = Math.max(10, enemyValue(lv));
  return { budget: nice(C * STAR_RULE.budget), star2: nice(C * STAR_RULE.star2), star3: nice(C * STAR_RULE.star3), cheapest: C, checked: false };
}
export function starsFor(id, won, spent) {
  if (!won) return 0;
  const b = budgetOf(id); if (!b) return 0;
  return spent <= b.star3 ? 3 : spent <= b.star2 ? 2 : 1;
}

// ---------------------------------------------------------------- geometry
const HEX = Math.sqrt(3) / 2;   // painter: unit area = spacing² · √3/2 (game.js)
export function halfX(W, team, fx) { return team === ENEMY ? fx * (W / 2) : W - fx * (W / 2); }
// The rectangle a group of n `type` units fills on `team`'s half: centred on (x, y), shaped like (w, h), sized so
// the brush paints exactly n at its normal density. Same density on every screen; only the place is a fraction.
export function boxRect(W, H, team, type, n, g) {
  const def = getDef(type), sp = def ? def.brushSpacing : 24;
  const need = Math.max(1, n) * sp * sp * HEX;
  const aspect = g.w && g.h ? (g.w * W / 2) / (g.h * H) : 0.5;
  let w = Math.sqrt(need * aspect), h = need / w;
  if (w < sp) { w = sp; h = need / w; }
  if (h < sp) { h = sp; w = need / h; }
  const gap = MID_GAP * sp + (def ? def.radius : 10);
  const lo = team === ENEMY ? MARGIN : W / 2 + gap, hi = team === ENEMY ? W / 2 - gap : W - MARGIN;
  w = Math.min(w, hi - lo); h = Math.min(h, H - 2 * MARGIN);
  let cx = halfX(W, team, g.x ?? 0.5), cy = (g.y ?? 0.5) * H;
  cx = Math.min(hi - w / 2, Math.max(lo + w / 2, cx)); cy = Math.min(H - MARGIN - h / 2, Math.max(MARGIN + h / 2, cy));
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h };
}

// Paint n `type` units into the group box g on `team`'s half with the real brush (one stroke = one group, a
// serpentine over the box). Stops at n, or when the budget (if any) runs out. Returns the number placed.
export function paintBox(game, team, type, n, g) {
  const w = game.world, def = getDef(type);
  if (!def || !(n > 0)) return 0;
  const r = boxRect(w.W, w.H, team, type, n, g), sp = def.brushSpacing;
  const prevTool = game.tool, prevR = game.brushRadius, id0 = w.nextId;
  w.paintCap = n;
  game.setTool({ kind: 'unit', type });
  let placed = 0;
  if (def.boss) { game.setBrushRadius(Math.max(4, sp / 2)); placed += game.paintBegin(r.cx, r.cy); game.paintEnd(); }
  else {
    // Rows 2d apart, centred in the box; the stroke is made just long enough to paint n (+8%) at the brush's density
    // (painter: πd² for the first dab, 2d per px after), so a group is never short because its box is small.
    const rows = Math.max(1, Math.round(r.h / (2 * Math.max(sp, 12)))), d = Math.max(sp / 2, r.h / (2 * rows));
    const need = n * sp * sp * HEX * 1.08, len = Math.max(0, (need - Math.PI * d * d) / (2 * d) - (rows - 1) * 2 * d);
    const lo = team === ENEMY ? MARGIN : w.W / 2 + d, hi = team === ENEMY ? w.W / 2 - d : w.W - MARGIN;
    const rowLen = Math.min(hi - lo, len / rows), x0 = Math.max(lo, r.cx - rowLen / 2), x1 = Math.min(hi, x0 + rowLen), step = 6;
    game.setBrushRadius(d);
    for (let pass = 0; pass < 6 && w.paintCap !== 0; pass++) {
      let x = x0, y = r.cy - (rows - 1) * d + (pass % 2) * d * 0.5;
      const was = placed;
      placed += game.paintBegin(x, y);
      for (let k = 0; k < rows && w.paintCap !== 0; k++) {
        const tx = k % 2 ? x0 : x1, dist = Math.abs(tx - x), m = Math.max(1, Math.ceil(dist / step));
        for (let i = 1; i <= m && w.paintCap !== 0; i++) placed += game.paintMove(x + (tx - x) * i / m, y);
        x = tx;
        if (k + 1 < rows) { const ty = y + 2 * d; placed += game.paintMove(x, (y + ty) / 2); placed += game.paintMove(x, ty); y = ty; }
      }
      game.paintEnd();
      if (placed === was) break;   // nothing fits (wall, water-only unit off water, a boss already out, budget gone)
    }
  }
  w.paintCap = undefined;
  // Units that face along the drag (def.faceStroke) face the enemy instead: a serpentine would point them every way.
  if (def.faceStroke) for (const u of w.units) if (!u.dead && u.id >= id0 && u.type === type && u.team === team) { u.heading = u.pheading = u.wander = team === ENEMY ? 0 : Math.PI; def.faceStroke(w, u); }
  game.setBrushRadius(prevR); if (prevTool) game.setTool(prevTool);
  return placed;
}

// ---------------------------------------------------------------- loading + outcome
// Clear the field, load the map (its secret left out), Team battle on and holding, paint the level's terrain and
// enemy, then give the player the budget. opts.budget overrides the level's (the bot uses it).
export function loadLevel(game, id, opts = {}) {
  const lv = getLevel(id); if (!lv) return null;
  const w = game.world;
  game.setBudget(null);
  if (!game.teamMode) game.setTeamMode(true);
  game.loadMap(lv.map, { secret: false });
  const prevTool = game.tool, prevR = game.brushRadius;
  for (const t of lv.terrain) {
    const pts = t.pts || [];
    if (!pts.length) continue;
    game.setTool({ kind: t.kind }); game.setBrushRadius(t.r || 16);
    const P = ([fx, fy]) => [halfX(w.W, ENEMY, fx), fy * w.H];
    let [x, y] = P(pts[0]);
    game.paintBegin(x, y);
    for (let i = 1; i < pts.length; i++) {
      const [tx, ty] = P(pts[i]), m = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 6));
      for (let k = 1; k <= m; k++) game.paintMove(x + (tx - x) * k / m, y + (ty - y) * k / m);
      x = tx; y = ty;
    }
    game.paintEnd();
  }
  game.setBudget({ team: ENEMY, total: Infinity, price: () => 0 });   // the enemy half only (none spills over the midline)
  for (const g of lv.enemy) paintBox(game, ENEMY, g.type, g.n, g);
  const b = budgetOf(id);
  game.setBudget({ team: PLAYER, total: opts.budget ?? b.budget, price: forSale });
  game.setBrushRadius(prevR); if (prevTool) game.setTool(prevTool);
  w.campaign = { id };
  return lv;
}
// '' (going, or not started) | 'win' | 'lose' | 'time'. Call after a tick (reads the tick's own watch).
export function outcome(game) {
  const B = game.budget, w = game.world, C = w.campaign || (w.campaign = {});
  if (!B || !B.locked) { C.routSince = -1; C.startValue = null; return ''; }
  if (!C.startValue) C.startValue = [sideValue(w, ENEMY), sideValue(w, PLAYER)];
  const r = game.lastResult;
  if (r === 'right') return PLAYER === 1 ? 'win' : 'lose';
  if (r === 'left') return PLAYER === 0 ? 'win' : 'lose';
  if (r === 'draw') return 'lose';
  // A rout: every unit one side has left is running away, for ROUT_TIME s in a row (a rally resets it).
  const er = routed(w, ENEMY), pr = !er && routed(w, PLAYER), side = er ? ENEMY : pr ? PLAYER : -1;
  if (side < 0) C.routSince = -1;
  else if (!(C.routSince >= 0) || C.routSide !== side) { C.routSince = w.time; C.routSide = side; }
  else if (w.time - C.routSince >= ROUT_TIME) return side === ENEMY ? 'win' : 'lose';
  if (w.time - B.startTime >= TIME_LIMIT) {
    const e = sideValue(w, ENEMY), p = sideValue(w, PLAYER);
    return e <= MOP_UP * C.startValue[ENEMY] && p > e ? 'win' : 'time';
  }
  return '';
}
// Paint value of a side's standing units: the for-sale price of its type (a zombie copy = its original's; crews and
// other spawns that can't be bought = 0).
export function unitValue(type) { const t = String(type); return forSale(t.startsWith('risen_') ? t.slice(6) : t) || 0; }
function sideValue(w, team) { let v = 0; for (const u of w.units) if (!u.dead && u.hp > 0 && u.team === team) v += unitValue(u.type); return v; }
function routed(w, team) {
  let alive = 0;
  for (const u of w.units) {
    if (u.dead || !(u.hp > 0) || u.team !== team) continue;
    if (u.state !== STATE.FLEE) return false;
    alive++;
  }
  return alive > 0;
}
// Leave the campaign: back to the sandbox (budget off). The UI then clears or loads what it wants.
export function leaveCampaign(game) { game.setBudget(null); game.world.campaign = null; }
