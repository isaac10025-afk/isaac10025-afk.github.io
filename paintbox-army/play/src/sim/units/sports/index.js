// SPORTS tab (OURS, Part 2 step 6, STEP6.md): imports this tab's unit files. Owner: SPORTS-SIM.
// Tab order = ui/tools.js ORDER: tackler, batter, pitcher, bowler, hockey, sumo, boxer, cheerleader.
// All eight are people with `risenMode: 'body'` (_lib.js athlete()): risen.js builds their risen copies after this file
// (the necro raises them, zombies turn them, like OG soldiers).
import './_lib.js';
import './tackler.js';
import './batter.js';
import './pitcher.js';
import './bowler.js';
import './hockey.js';
import './sumo.js';
import './boxer.js';
import './cheerleader.js';
// risen.js's own risenMode loop runs when risen.js is first imported, and pirates/index.js imports it (buildRisen) before
// this tab loads, so the loop never sees these defs: build the copies here (buildRisen skips a copy that already exists).
import { buildRisen } from '../mythical/risen.js';
export const RAISABLE = ['tackler', 'batter', 'pitcher', 'bowler', 'hockey', 'sumo', 'boxer', 'cheerleader'];
for (const t of RAISABLE) buildRisen(t, 'body');
