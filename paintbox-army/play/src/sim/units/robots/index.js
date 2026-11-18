// ROBOTS tab (OURS, Part 2 step 6, STEP6.md): imports this tab's unit files. Owner: ROBOTS-SIM.
// Tab order = ui/tools.js ORDER: drone, laserbot, sawbot, magnetbot, repairbot, shieldbot, bombbot, mech.
// Every robot is a machine (def.machine, no risenMode): the necro can't raise a wreck and zombies can't turn one.
import './drone.js';
import './magnetbot.js';
import './shieldbot.js';
import './laserbot.js';
import './sawbot.js';
import './repairbot.js';
import './bombbot.js';
import './mech.js';
export { isMetal, METAL_TYPES } from './magnetbot.js';
