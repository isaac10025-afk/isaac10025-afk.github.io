// Unit maker: A-SUPPORT modules (OURS, Part 2 step 8, STEP8.md). Owner: A-SUPPORT.
// abilities: rally, heal, dome, scare, raise, bees, crows, armour, shield, shell, dodge, spikes, split, rebirth
// Each = the source unit's trick made to work on any body (person / animal / beast / giant), any size, any weapon:
// areas × power(u) (the size step); helpers it spawns join the made unit's side; every event carries `as: <source>`.
// Code: support-aura.js (rally, heal, dome, scare), support-guard.js (armour, shield, shell, dodge, spikes),
// support-life.js (raise, bees, crows, split, rebirth), shared bits in support-lib.js. Number tables: one per ability
// at the top of its section (RALLY, HEAL, DOME_T, SCARE, ARMOUR, SHIELD, SHELL, DODGE, SPIKES, RAISE, BEES, CROWS, SPLIT, REB).
//
// Pose codes (u.b.act, lib.js ACT) each sets, only while it drives the unit or for a short beat (the weapon's codes win
// otherwise): rally ROAR (1 s shout on first sight of the enemy) · heal CHANNEL (while it stands healing) · raise CHANNEL
// (the 1.2 s cast) · crows ROAR (0.8 s call) · shield SHELL (braced against a charger: no BRACE code yet) · shell SHELL
// (4 s in the shell) · dodge HOP (0.25 s sidestep: no DODGE code yet) · spikes PUFF (0.3 s puff-up) · rebirth DOWN (5 s
// in the egg) then ROAR (0.6 s hatch). dome, scare, bees, armour, split: no pose.
//
// Bag fields the art reads (u.b.ab[slot]; fx-mine-support.js OVER[id] draws them):
//  heal:    patient (unit id, -1 none), healing (1 while it heals this tick)
//  dome:    up (1 while up), r (px), hp (0..400), hitAt (world time of the last block); the dome itself is the effect
//           projectile 'minedome' (p.r, p.k hp 0..1, p.hitT s since the last block)
//  raise:   castT / castEnd (world time; castEnd 0 = not casting), sx / sy (middle of the bodies), r (reach px)
//  bees:    outAt (world time bees last came out: the hive shakes), ids (its bees)
//  crows:   ids (its crows)
//  shell:   on (1 in the shell)
//  dodge:   dodgeT (world time of the last dodge)
//  spikes:  puffed (1 while the spikes are out), puffT (world time they popped out), until (world time they go back in)
//  rebirth: down (1 in the egg), crack (0..1 egg cracking), t0 (world time it went down), hatchT (world time it rose),
//           reborn (1 = used)
//  rally:   shoutT (world time of the last rally shout), quiet (s with no target)
// Events (sounds through `as`): rally 'charge' (captain) · heal 'weld' (repairbot) · dome 'dome' up/down, 'block' {dome},
// 'domebreak' (shieldbot) · scare 'roar' {scare} (scarecrow) · raise 'raise' (necro) + 'puff' per skeleton · bees 'flap'
// (as 'bee': the hive's own event type) · crows 'flap' {crows} (scarecrow) · shield 'block' + 'bounce' (shieldwall) ·
// shell 'block' (turtle) · dodge 'swing' {dodge} (boxer) · spikes 'puffup', 'strike' (puffer) · split 'split'
// (kingslime) + 'puff' · rebirth 'explosion' {fire}, 'ignite' {rebirth}, 'spell' {hatch}, 'ricochet' {eggbreak} (phoenix).
import './support-aura.js';
import './support-guard.js';
import './support-life.js';
