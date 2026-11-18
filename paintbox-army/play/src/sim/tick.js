// step(world): one fixed 1/60 s tick in the OG system order (OG core-move §1, game.js:5519-5530, list game.js:4758-5461).
// Systems owned by other agents are loaded if their file exists and exports run(); missing ones are skipped.
import { DT } from './const.js';
import * as strategy from './systems/strategy.js';
import * as navigation from './systems/navigation.js';
import * as formation from './systems/formation.js';
import * as conceal from './systems/conceal.js';
import * as perception from './systems/perception.js';
import * as brain from './systems/brain.js';
import * as steering from './systems/steering.js';
import * as domino from './systems/domino.js';
import * as lifecycle from './systems/lifecycle.js';
import * as possess from './systems/possess.js';
import * as extra from './systems/extra.js';
import * as march from './systems/march.js';

function missing(e) { return /ERR_MODULE_NOT_FOUND|Cannot find module|Failed to fetch|error loading dynamically imported module|404|Importing a module script failed/i.test(String((e && (e.code + ' ' + e.message)) || e)); }
async function opt(p) {
  try { return await import(p); }
  catch (e) { if (!missing(e)) console.error('[tick] failed to load', p, e); return null; }
}
const [morale, mines, peels, ballistics, fire, plague, oil, ice, water, ants, bodies] = await Promise.all([
  opt('./combat/morale.js'), opt('./terrain/mines.js'), opt('./terrain/peels.js'), opt('./combat/ballistics.js'), opt('./combat/fire.js'),
  opt('./combat/plague.js'), opt('./combat/oil.js'), opt('./terrain/ice.js'), opt('./terrain/water.js'), opt('./units/animals/ants-system.js'), opt('./combat/death.js'),
]);

// [name, module] in OG order (OG game.js:4758-5461).
export const SYSTEMS = [
  ['strategy', strategy], ['navigation', navigation], ['formation', formation], ['conceal', conceal], ['perception', perception],
  ['morale', morale],
  ['possessPre', { run: possess.runPre }],    // OURS (Part 2 step 3): the player's unit, before its brain
  ['brain', brain],
  ['possessPost', { run: possess.runPost }],  // OURS: the player's stick + aim, after its brain
  ['march', march],                           // OURS (PLAN H): stalled battles march (off unless world.march > 0)
  ['steering', steering], ['domino', domino], ['mines', mines], ['peels', peels],
  ['ballistics', ballistics], ['fire', fire], ['plague', plague], ['oil', oil], ['ice', ice], ['water', water],
  ['lifecycle', lifecycle], ['ants', ants],
  ['bodies', bodies],   // OURS: flying bodies (combat/death.js run), after OG's list
].filter(([, m]) => m && typeof m.run === 'function');
let LIST = SYSTEMS, RUN = SYSTEMS.map(([, m]) => m.run), builtFor = -1;
// Extra systems from unit modules (systems/extra.js) slot in after the system they name; unknown name = at the end.
function rebuild() {
  builtFor = extra.extraVersion;
  if (!extra.EXTRA.length) { LIST = SYSTEMS; RUN = SYSTEMS.map(([, m]) => m.run); return; }
  const out = SYSTEMS.slice();
  for (const e of extra.EXTRA) {
    let at = out.length;
    for (let k = out.length - 1; k >= 0; k--) if (out[k][0] === e.after || out[k][0] === 'x:' + e.after) { at = k + 1; break; }
    while (at < out.length && out[at][0].startsWith('x:') && out[at].after === e.after) at++;
    const row = ['x:' + e.name, { run: e.run }]; row.after = e.after;
    out.splice(at, 0, row);
  }
  LIST = out; RUN = out.map(([, m]) => m.run);
}

export function step(world) {
  world.tick++; world.time += DT;                         // OG game.js:5520
  const us = world.units;
  for (let i = 0, n = us.length; i < n; i++) { const u = us[i]; u.px = u.x; u.py = u.y; u.pheading = u.heading; u.pz = u.z; } // OG game.js:5522-5525
  world.rebuildGrid(); world.groups.update(us, DT);       // OG game.js:5526
  if (builtFor !== extra.extraVersion) rebuild();
  const tm = world.timings;
  if (tm) {
    let t0 = performance.now();
    for (let k = 0; k < RUN.length; k++) { RUN[k](world); const t1 = performance.now(); tm[LIST[k][0]] = (tm[LIST[k][0]] || 0) + t1 - t0; t0 = t1; }
  } else for (let k = 0; k < RUN.length; k++) RUN[k](world);
  world.fields.decay(DT);                                 // fear/noise fade (OG game.js:5529)
}
