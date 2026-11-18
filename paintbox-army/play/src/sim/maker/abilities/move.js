// Unit maker: A-MOVE modules (OURS, Part 2 step 8, STEP8.md). Owner: A-MOVE.
// Move abilities (one per unit; each replaces how the unit gets about) + movement-like passives, as registerAbility
// modules. Each is the source unit's trick made to work on any body, any size and any weapon:
//   move-fly.js     fly (dragon / jetpack), grabdrop (ptero), beam (UFO), firedive (phoenix). A flyer with a melee /
//                   body weapon dives down to z <= 6 to strike, then climbs (anyone can hit it while it is low).
//   move-ground.js  swim (crab), burrow (giant worm), ghost (ghost), lowgrav (astronaut).
//   move-passive.js fireproof (lava golem), heavy (long-neck), lavatrail (lava golem), sneak (cheetah), skates (hockey).
//   move-lib.js     shared pieces (bags from outside a hook, per-world lists for the 3 small world systems).
// Every file says which bag fields the art reads; fx-mine-move.js draws the beam cone, the burrow mound and the fire
// trail (OVER). Numbers: one T table per ability at the top of its section.
import './move-fly.js';
import './move-ground.js';
import './move-passive.js';
