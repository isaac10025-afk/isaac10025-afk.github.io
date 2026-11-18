// Plugs TERRAIN into CORE-B's combat hooks (combat/env.js setCombatHook). Lambdas, so load order between the
// terrain files never matters. Imported by every terrain system file.
import * as env from '../combat/env.js';
import { armMinesNear, grenadeLanded, arrowLanded, propLanded } from './mines.js';
import { peelsBlast } from './peels.js';
import { harmIce } from './ice.js';
import { blastWalls } from './wall.js';

function set(name, fn) { try { if (env.setCombatHook) env.setCombatHook(name, fn); } catch (e) { /* hook name not offered (yet) */ } }
set('armMinesNear', (w, x, y, r) => armMinesNear(w, x, y, r));            // blast arms mines within 1.25 r (OG game.js:8940)
set('peelsBlast', (w, x, y, r) => peelsBlast(w, x, y, r));                // OG game.js:8941
set('iceHarm', (w, x, y, r, amount, edge) => harmIce(w, x, y, r, amount, edge)); // OG game.js:8899, 2984, 13506-13511
set('wallBlast', (w, x, y, r, dmg) => blastWalls(w, x, y, r, dmg));      // OG game.js:8931-8938
set('grenadeLanded', (w, x, y) => grenadeLanded(w, x, y));               // OG game.js:3073
set('arrowLanded', (w, x, y) => arrowLanded(w, x, y));                   // OG game.js:3195
set('unitLanded', (w, u) => propLanded(w, u));                           // props ≥ 0.7 mass (OG game.js:9122)
set('steam', (w, x, y, size, life) => { if (w.steam) w.steam.add(x, y, size, life, w.time); }); // OG game.js:727, 2994, 18373
