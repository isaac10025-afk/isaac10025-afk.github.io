// siege tab (Part 2 step 4, OURS): imports every unit file of this tab. Owner: SIEGE agent.
// Tab order = ui/tools.js ORDER: shieldwall, halberd, crossbow, ram, catapult, ballista, oilpot, siegetower (+ siegecrew).
// People carry `risenMode: 'body'` (risen.js builds their risen copies); machines carry none, so their wrecks can't be raised.
import './_lib.js';
import './siegecrew.js';
import './shieldwall.js';
import './halberd.js';
import './crossbow.js';
import './ram.js';
import './catapult.js';
import './ballista.js';
import './oilpot.js';
import './siegetower.js';
