// OCEAN tab (OURS, Part 2 step 6, STEP6.md): imports this tab's unit files. Owner: OCEAN-SIM.
// Tab order = ui/tools.js ORDER: crab, shark, octopus, puffer, eel, turtle, walrus, swordfish.
import './_lib.js';
import './crab.js';
import './shark.js';
import './octopus.js';
import './puffer.js';
import './eel.js';
import './turtle.js';
import './walrus.js';
import './swordfish.js';
import { getDef } from '../../defs.js';
import { buildRisen } from '../mythical/risen.js';

// All 8 are living animals: the necro raises them and zombies turn them ('keep' copies: same brain and tricks, Undead).
// risen.js's own `risenMode` loop already ran when pirates/index.js first imported it (before this tab registered), so
// the copies are built here, as pirates/index.js does. Like OG's Zombie Alligator (game.js:4723), a risen sea animal
// keeps its own swimming (no bottom-walking, its own waterPace); water-only ones stay water-only (aquatic, placeOk).
export const RAISABLE = ['crab', 'shark', 'octopus', 'puffer', 'eel', 'turtle', 'walrus', 'swordfish'];
for (const t of RAISABLE) {
  const d = buildRisen(t, 'keep') || getDef('risen_' + t);   // (already built if risen.js got to this tab first)
  if (d) { d.deepWalker = false; d.waterPace = getDef(t).waterPace; }
}
