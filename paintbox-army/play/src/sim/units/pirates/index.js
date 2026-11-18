// pirates tab (Part 2 step 4, OURS): imports every unit file of this tab. Owner: PIRATES agent.
// Tab order = ui/tools.js ORDER: deckhand, pistol, blunderbuss, bomber, anchor, cannon, captain, ship (+ gunner, crew).
import './gunner.js';
import './deckhand.js';
import './pistol.js';
import './blunderbuss.js';
import './bomber.js';
import './anchor.js';
import './cannon.js';
import './captain.js';
import './ship.js';
import { buildRisen } from '../mythical/risen.js';

// The necro raises (and zombies turn) the people, as OG's soldiers: a 'body' copy = zombie brain in a pirate's body.
// The cannon and the ship are machines (def.machine): no risen copy, so their wrecks can't be raised.
export const RAISABLE = ['deckhand', 'pistol', 'blunderbuss', 'bomber', 'anchor', 'captain', 'gunner'];
for (const t of RAISABLE) buildRisen(t, 'body');
