// Risen copies `risen_<type>` (OG "Zombie <name>"), built from the registered base defs exactly as OG's factory He()
// does (OG game.js:4196-4233, registered game.js:4690-4732). units/index.js imports this file LAST.
//  - body copy: the Zombie def (brain, bite, speeds, flock, morale) with the base's radius, radiusJitter, mass, density,
//    conductivity, deflects, shield, eyeShot; maxHp = round(160 × base.maxHp / 100) (Zombie Giant 3520).
//  - keep copy: the whole base def (same brain and attacks) as Undead, not infectable, Mindless, no mine sense,
//    Zombie morale. Zombie Alligator keeps deepWalker false and its own waterPace.
// Skeletons are risen copies spawned by the Necromancer with u.skeleton = 1 (OG game.js:14912); no separate def.
// No copy exists for Zombie, Dragon, Horse, Piranha, Snake, Barrel, Tree, Anthill (absent from OG game.js:4690-4732).
import { registerUnit, getDef } from '../../defs.js';
import './turn.js';                                        // installs the combat 'turn' hook

// [our base type, mode] in OG registration order (OG game.js:4690-4732).
export const RISEN_BASES = [
  ['rifle', 'body'],       // ZombieSoldier       game.js:4690
  ['boar', 'keep'],        // ZombieBoar          game.js:4691
  ['flamer', 'body'],      // ZombieFlamethrower  game.js:4692
  ['sniper', 'body'],      // ZombieSniper        game.js:4693
  ['legion', 'body'],      // ZombieRoman         game.js:4694
  ['grenadier', 'body'],   // ZombieGrenadier     game.js:4695
  ['archer', 'body'],      // ZombieArcher        game.js:4696
  ['slime', 'keep'],       // ZombieSlime         game.js:4697
  ['cavalry', 'keep'],     // ZombieCavalry       game.js:4701
  ['knight', 'body'],      // ZombieKnight        game.js:4702
  ['mage', 'body'],        // ZombieMage          game.js:4706
  ['frog', 'keep'],        // ZombieFrog          game.js:4707
  ['giant', 'body'],       // ZombieGiant         game.js:4709
  ['rat', 'keep'],         // ZombieRat           game.js:4711
  ['ant', 'keep'],         // ZombieAnt           game.js:4716
  ['soldierant', 'keep'],  // ZombieSoldierAnt    game.js:4717
  ['ape', 'keep'],         // ZombieApe           game.js:4719
  ['apecav', 'keep'],      // ZombieApeCavalry    game.js:4721
  ['gator', 'keep'],       // ZombieAlligator     game.js:4723 (deepWalker false, own waterPace)
  ['necro', 'body'],       // ZombieNecromancer   game.js:4728
  ['ninja', 'body'],       // ZombieNinja         game.js:4730
  ['cheetah', 'keep'],     // ZombieCheetah       game.js:4732
];

// Registered defs carry radius/brushSpacing ×1.1; registerUnit scales again, so feed it the raw OG values.
function raw(def) {
  const d = { ...def };
  d.radius = def.ogRadius !== undefined ? def.ogRadius : def.radius / 1.1;
  d.brushSpacing = def.ogBrushSpacing !== undefined ? def.ogBrushSpacing : def.brushSpacing / 1.1;
  delete d.ogRadius; delete d.ogBrushSpacing;
  return d;
}

export function buildRisen(baseType, mode) {
  const zd = getDef('zombie'), bd = getDef(baseType);
  if (!zd || !bd || getDef('risen_' + baseType)) return null;
  const Z = raw(zd), B = raw(bd);
  const look = { ...(B.look || {}), undead: true };        // OG game.js:4198: recoloured Zombie green, undead
  const tag = {                                            // OG game.js:4200-4207
    type: 'risen_' + baseType, og: 'Zombie ' + (B.og || baseType), risenFrom: baseType, deepWalker: true, waterPace: 0.6,
  };
  let d;
  if (mode === 'keep') {                                   // OG game.js:4208-4218
    d = { ...B, ...tag, faction: 2, infectable: false, intelligence: 0, mines: false, morale: Z.morale, look };
    if (baseType === 'gator') { d.deepWalker = false; d.waterPace = B.waterPace; } // OG game.js:4723
  } else {                                                 // OG game.js:4219-4233
    d = {
      ...Z, ...tag,
      radius: B.radius, radiusJitter: B.radiusJitter, mass: B.mass, density: B.density, conductivity: B.conductivity,
      deflects: B.deflects, maxHp: Math.round((Z.maxHp * B.maxHp) / 100), shield: B.shield, eyeShot: B.eyeShot,
      look: { ...look, attack: (Z.look || {}).attack },
    };
  }
  delete d.ogId;
  return registerUnit(d);
}

for (const [t, m] of RISEN_BASES) buildRisen(t, m);
// STEP4 DINOS: Part 2 step 4+ units (OURS) opt in with `risenMode: 'keep' | 'body'` in their def: they get a risen copy
// built the same way (the necro raises their bodies, zombies turn them). Machines just leave it out.
import { allDefs } from '../../defs.js';   // STEP4 DINOS
for (const d of allDefs()) if (d.risenMode && d.risenFrom === undefined) buildRisen(d.type, d.risenMode);   // STEP4 DINOS
// STEP6 (lead): this file is first imported by a tab (pirates) before later tabs register, so units/index.js calls this once
// every tab has loaded. buildRisen skips types that already have a copy.
// STEP8 (lead): the OG list again first. In the browser the art loads the unit maker before units/index.js, and the
// maker's modules import risen.js before the OG units exist: its loop above then built none of the 22 OG copies.
// buildRisen skips copies that already exist, so in node (units first) this changes nothing.
export function buildPendingRisen() { for (const [t, m] of RISEN_BASES) buildRisen(t, m); for (const d of allDefs()) if (d.risenMode && d.risenFrom === undefined && !d.boss && !d.machine) buildRisen(d.type, d.risenMode); }
