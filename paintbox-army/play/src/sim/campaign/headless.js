// Campaign battles without a screen (OURS, Part 2 step 9, STEP9.md). Owner: LEAD. Used by the bot
// (tools/campaign-bot.mjs), the price bot (tools/price-bot.mjs) and tests. Node or browser, no DOM.
import { createGame } from '../game.js';
import { loadLevel, paintBox, outcome, PLAYER, ENEMY, TIME_LIMIT } from './index.js';

// World sizes the game makes (main.js: world = 2 x field / 1.075 each way): desktop 1440x900, phone upright 390x844
// (field 60 px shorter), phone on its side 844x390 (wider than 640: no phone bar).
export const SHAPES = { desk: [2679, 1674], phone: [726, 1459], wide: [1570, 726] };

const alive = (w, team) => { let n = 0; for (const u of w.units) if (!u.dead && u.hp > 0 && u.team === team) n++; return n; };

/** Play campaign battle `id` once.
 *  opts: shape ('desk' | 'phone' | 'wide' | [W, H]), seed, army: [{ type, n, x, y, w?, h? }] (player half, same box
 *  fractions as the enemy's), budget (default the level's), timeLimit (default TIME_LIMIT), noStart (just paint).
 *  Returns { result: 'win'|'lose'|'time', time, spent, budget, placed: {type: n}, playerLeft, enemyLeft, game }. */
export function playLevel(id, opts = {}) {
  const [W, H] = Array.isArray(opts.shape) ? opts.shape : SHAPES[opts.shape || 'desk'];
  const game = createGame({ W, H, seed: opts.seed ?? 1, march: true });
  if (!loadLevel(game, id, { budget: opts.budget })) throw new Error('no level ' + id);
  const w = game.world, placed = {};
  for (const g of opts.army || []) { const n = paintBox(game, PLAYER, g.type, g.n, g); placed[g.type] = (placed[g.type] || 0) + n; }
  const b = game.budget;
  if (opts.noStart) return { result: '', time: 0, spent: b.spent, budget: b.total, placed, playerLeft: alive(w, PLAYER), enemyLeft: alive(w, ENEMY), game };
  game.start();
  const limit = opts.timeLimit ?? TIME_LIMIT, t0 = w.time;
  let res = '';
  while (!res) {
    game.tick();
    res = outcome(game);
    if (!res && w.time - t0 >= limit) res = 'time';
  }
  return { result: res, time: w.time - t0, spent: b.spent, budget: b.total, placed, playerLeft: alive(w, PLAYER), enemyLeft: alive(w, ENEMY), game };
}
