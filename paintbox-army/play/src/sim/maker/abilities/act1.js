// Unit maker: A-ACT1 modules (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT1.
// abilities: pounce, charge, tackle, blink, roar, throw, lasso, slide, stomp, sit, swallow. Each = the source unit's
// trick made to work on any body (person / animal / beast / giant, every size) and next to any weapon.
//   act1-rush.js  pounce (raptor), charge (trike), tackle (tackler), slide (walrus)
//   act1-area.js  roar (T-Rex), stomp (long-neck), sit (baby), blink (teleporter)
//   act1-grab.js  throw (baby), lasso (cowboy), swallow (snake)
//   act1-lib.js   shared helpers + the held-victims safety net (system act1Held)
// Scaling (STEP8.md): ranges, reaches and areas × power(u) (the size step 0.5 .. 2.25); grab / pin / gore / tackle mass
// limits × power²; body-contact damage and pushes (pounce bites, gore, tackle, slide hits) × power like the body weapons;
// area damage (stomp, sit) and the throw distance as the source. Every trick calls used(w, u, id) when it goes off and
// emits the source's event names with as: '<source type>'. Art fields per trick: the header of each part file;
// effects beyond the body (lasso rope, roar rings) are in render/art/fx-mine-act1.js (OVER.lasso, OVER.roar).
import './act1-rush.js';
import './act1-area.js';
import './act1-grab.js';
