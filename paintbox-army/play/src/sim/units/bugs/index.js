// BUGS tab (OURS, Part 2 step 6, STEP6.md): imports this tab's unit files. Owner: BUGS-SIM.
import './_lib.js';
import './bee.js';
import './beehive.js';
import './spider.js';
import './beetle.js';
import './mantis.js';
import './bombardier.js';
import './mosquito.js';
import './stinkbug.js';
// risen.js's own risenMode loop runs when it is first imported (pirates/index.js imports it, before this tab loads), so it
// never sees these defs: build the copies here (buildRisen skips one that exists). 'keep' = same brain and tricks as
// Undead (a risen spider still webs). The beehive is a home, not a body: none (like OG's anthill).
import { buildRisen } from '../mythical/risen.js';
export const RAISABLE = ['bee', 'spider', 'beetle', 'mantis', 'bombardier', 'mosquito', 'stinkbug'];
for (const t of RAISABLE) buildRisen(t, 'keep');
