// Imports every unit file. Agents append their own import line above the marker (append only, never reorder).
import './props/barrel.js';
import './props/tree.js';
import './army/rifle.js';
import './army/flamer.js';
import './army/sniper.js';
import './army/legion.js';
import './army/grenadier.js';
import './army/archer.js';
import './army/cavalry.js';
import './army/ninja.js';
import './army/knight.js';
import './army/horse.js';
import './animals/boar.js';
import './animals/rat.js';
import './animals/ant.js';
import './animals/ape.js';
import './animals/gator.js';
import './animals/piranha.js';
import './animals/snake.js';
import './animals/cheetah.js';
import './animals/apecav.js';
import './animals/soldierant.js';
import './animals/anthill.js';
import './mythical/zombie.js';
import './mythical/slime.js';
import './mythical/mage.js';
import './mythical/giant.js';
import './mythical/dragon.js';
import './mythical/necro.js';
import './mythical/frog.js';
// --- add unit imports above this line ---
// Part 2 step 4 tabs (OURS): each folder's index.js imports its own units. Before risen.js so the necro can raise them.
// Part 2 step 6 tabs (OURS, STEP6.md): same rule.
for (const p of ['./dinos/index.js', './siege/index.js', './pirates/index.js', './robots/index.js', './space/index.js', './ocean/index.js', './sports/index.js', './bugs/index.js', './bosses/index.js', './secret/index.js']) {   // STEP7: secret
  try { await import(p); } catch (e) { if (!/Cannot find|not found|Failed to fetch|ERR_MODULE_NOT_FOUND|404/i.test(String(e && (e.code || e.message)))) console.error(p, e); }
}
try { const R = await import('./mythical/risen.js'); if (R.buildPendingRisen) R.buildPendingRisen(); } catch (e) { if (!/Cannot find|not found|Failed to fetch|ERR_MODULE_NOT_FOUND|404/i.test(String(e && (e.code || e.message)))) console.error('risen.js', e); }
// Part 2 step 8 (OURS, STEP8.md): the unit maker (weapon + ability modules, made units registered at run time by the UI).
try { await import('../maker/index.js'); } catch (e) { console.error('maker', e); }
