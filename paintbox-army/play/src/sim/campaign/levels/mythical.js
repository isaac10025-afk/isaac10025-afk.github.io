// Campaign: mythical world, 8 battles (STEP9.md level format). Owner: LEVELS-A. Mythical has 6 units (no 7th, 8th).
// Boxes are fractions of the enemy half (x 0 = back edge, 1 = midline); every box was checked on the 3 screen shapes:
// all units placed, none in deep water, none on lava.
export default [
  // 1. A small horde of zombies. Counter: snipers (one shot goes through a whole row) or cavalry; foot soldiers that
  //    get bitten join the horde.
  { n: 1, map: 'blank', enemy: [{ type: 'zombie', n: 14, x: 0.55, y: 0.42, w: 0.08, h: 0.3 }] },
  // 2. Slimes. Counter: flamers (every hit splits a slime, fire keeps burning the halves); archers miss the hops.
  { n: 2, map: 'blank', enemy: [{ type: 'slime', n: 10, x: 0.55, y: 0.42, w: 0.08, h: 0.3 }] },
  // 3. A giant with zombies around it in the village. Counter: snipers (they drop the giant from range and pierce the
  //    zombie line); rats and riflemen get bitten and turned.
  { n: 3, map: 'village', enemy: [
    { type: 'giant', n: 1, x: 0.5, y: 0.42 },
    { type: 'zombie', n: 12, x: 0.62, y: 0.42, w: 0.05, h: 0.3 } ] },
  // 4. Mages in the castle, zombies at both corners. Counter: snipers kept at the back (out of the mages' reach, nothing
  //    for the zombies to bite); ninjas, rats and riders get bitten and turned.
  { n: 4, map: 'castle', enemy: [
    { type: 'mage', n: 6, x: 0.55, y: 0.5, w: 0.1, h: 0.08 },
    { type: 'zombie', n: 8, x: 0.82, y: 0.25, w: 0.08, h: 0.08 },
    { type: 'zombie', n: 8, x: 0.82, y: 0.7, w: 0.08, h: 0.06 } ] },
  // 5. Necromancers at the back of the swamp, zombies and slimes on both banks of the pond. Counter: snipers kept at the
  //    back (every corpse the necromancers raise walks into their fire); ninjas and grenadiers get bitten.
  { n: 5, map: 'swamp', enemy: [
    { type: 'necro', n: 3, x: 0.35, y: 0.45, w: 0.05, h: 0.12 },
    { type: 'zombie', n: 6, x: 0.7, y: 0.22, w: 0.08, h: 0.06 },
    { type: 'zombie', n: 6, x: 0.6, y: 0.7, w: 0.08, h: 0.05 },
    { type: 'slime', n: 4, x: 0.45, y: 0.5, w: 0.05, h: 0.15 } ] },
  // 6. A dragon over the volcano with mages, zombies and necromancers. Counter: snipers kept at the back (they bring
  //    the dragon down from out of its breath's reach); riflemen and archers burn, riders get bitten.
  { n: 6, map: 'volcano', enemy: [
    { type: 'dragon', n: 1, x: 0.45, y: 0.18 },
    { type: 'mage', n: 6, x: 0.25, y: 0.4, w: 0.06, h: 0.1 },
    { type: 'zombie', n: 14, x: 0.75, y: 0.15, w: 0.1, h: 0.06 },
    { type: 'necro', n: 2, x: 0.15, y: 0.25, w: 0.04, h: 0.04 } ] },
  // 7. On the frozen lake: a giant, necromancers, slimes, mages and zombies behind two walls. Counter: snipers kept at
  //    the back (nothing to bite, out of the mages' reach); grenadiers and riders are bitten and turned.
  { n: 7, map: 'lake', terrain: [{ kind: 'wall', pts: [[0.7, 0.18], [0.7, 0.3]], r: 12 }, { kind: 'wall', pts: [[0.7, 0.7], [0.7, 0.82]], r: 12 }],
    enemy: [
      { type: 'giant', n: 1, x: 0.75, y: 0.42 },
      { type: 'necro', n: 2, x: 0.3, y: 0.42, w: 0.05, h: 0.1 },
      { type: 'slime', n: 4, x: 0.55, y: 0.25, w: 0.06, h: 0.06 },
      { type: 'mage', n: 4, x: 0.42, y: 0.42, w: 0.05, h: 0.1 },
      { type: 'zombie', n: 12, x: 0.58, y: 0.66, w: 0.08, h: 0.06 } ] },
  // 8. Every mythical unit at the castle: the dragon and mages inside, two giants, two zombie hordes, slimes and
  //    necromancers outside. Counter: a big sniper line kept at the back (nothing to bite, out of the dragon's breath);
  //    riflemen and riders get bitten and turned.
  { n: 8, map: 'castle', enemy: [
    { type: 'dragon', n: 1, x: 0.55, y: 0.47 },
    { type: 'mage', n: 4, x: 0.5, y: 0.58, w: 0.06, h: 0.04 },
    { type: 'necro', n: 2, x: 0.25, y: 0.17, w: 0.04, h: 0.04 },
    { type: 'zombie', n: 15, x: 0.45, y: 0.17, w: 0.1, h: 0.05 },
    { type: 'slime', n: 2, x: 0.72, y: 0.17, w: 0.06, h: 0.04 },
    { type: 'giant', n: 1, x: 0.88, y: 0.29 },
    { type: 'giant', n: 1, x: 0.75, y: 0.8 },
    { type: 'zombie', n: 15, x: 0.55, y: 0.84, w: 0.1, h: 0.04 } ] },
];
