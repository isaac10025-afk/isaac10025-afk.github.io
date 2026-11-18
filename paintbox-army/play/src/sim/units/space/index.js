// SPACE tab (OURS, Part 2 step 6, STEP6.md): imports this tab's unit files. Owner: SPACE-SIM.
// Tab order = ui/tools.js ORDER: alien, jetpack, shrinkray, gravity, teleporter, mindalien, ufo, astronaut.
// The living ones carry risenMode 'body' (risen.js builds their zombie copies); the UFO is a machine (none).
import './_lib.js';
import './alien.js';
import './jetpack.js';
import './shrinkray.js';
import './gravity.js';
import './teleporter.js';
import './mindalien.js';
import './ufo.js';
import './astronaut.js';
import { buildRisen } from '../mythical/risen.js';

// The necro raises (and zombies turn) the living aliens: a 'body' copy = a zombie in an alien's body (as the pirates).
// Called here because risen.js runs its own risenMode loop the first time it is imported (by pirates/index.js, before
// this tab loads); buildRisen skips types that already have a copy. The UFO is a machine: no copy, no raised wreck.
export const RAISABLE = ['alien', 'jetpack', 'shrinkray', 'gravity', 'teleporter', 'mindalien', 'astronaut'];
for (const t of RAISABLE) buildRisen(t, 'body');
