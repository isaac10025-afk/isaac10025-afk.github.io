// Campaign: bosses world, 8 battles (STEP9.md level format). Owner: LEVELS-C.
// One boss per battle (one per field: the player can't paint the boss the enemy has), escorts from any tab.
// All six bosses appear; 7 and 8 are the biggest. The kraken gets its own deep lagoon (it needs 5 tiles from the shore).
// A boss box keeps 1.25 brush spacings + its radius from the midline: on an upright phone that is x <= ~0.6.
export default [
  // 1. The king slime alone. Counter: guns from range (riflemen, snipers): it hops slowly and only squashes what is
  //    under its landing; keep shooting when it splits (4 big slimes, then 16 little ones).
  { n: 1, map: 'blank', enemy: [{ type: 'kingslime', n: 1, x: 0.5, y: 0.5 }] },
  // 2. The lava golem alone on the volcano. Counter: anything but fire (it is fire immune), from out of its punch (80):
  //    archers, snipers, or dragons over its lava trail.
  { n: 2, map: 'volcano', enemy: [{ type: 'lavagolem', n: 1, x: 0.3, y: 0.5 }] },
  // 3. The hydra in the castle courtyard with archers. Counter: archers: arrows arc over the walls from out of its bites'
  //    reach (fire seals a cut stump, but flamers have to stand in reach).
  { n: 3, map: 'castle', enemy: [
    { type: 'hydra', n: 1, x: 0.5, y: 0.5 },
    { type: 'archer', n: 12, x: 0.3, y: 0.5, w: 0.04, h: 0.15 },
  ] },
  // 4. The giant worm under the swamp with legionaries on both flanks. Counter: snipers, spread out and far back: it
  //    bursts up where the crowd is thickest and swallows anything of mass 2 or less (it can't burst up in water).
  { n: 4, map: 'swamp', enemy: [
    { type: 'worm', n: 1, x: 0.3, y: 0.5 },
    { type: 'legion', n: 7, x: 0.6, y: 0.25, w: 0.06, h: 0.08 },
    { type: 'legion', n: 7, x: 0.6, y: 0.75, w: 0.06, h: 0.08 },
  ] },
  // 5. The kraken in its lagoon with a pirate crew on the shore. Counter: long range out of its arms' 160 px: crossbows
  //    and archers from the sand.
  { n: 5, map: 'beach',
    terrain: [{ kind: 'water', pts: [[0.4, 0.4], [0.4, 0.6]], r: 95 }],
    enemy: [
      { type: 'kraken', n: 1, x: 0.4, y: 0.5 },
      { type: 'pistol', n: 8, x: 0.82, y: 0.42, w: 0.05, h: 0.08 },
      { type: 'deckhand', n: 10, x: 0.82, y: 0.58, w: 0.05, h: 0.08 },
    ] },
  // 6. The giant mech behind walls with drones, shield bots and repair bots. Counter: dragons (they fly over the walls
  //    and the stomp and burn the drones); ground armies melt in its missiles and laser.
  { n: 6, map: 'canyon',
    terrain: [
      { kind: 'wall', pts: [[0.7, 0.2], [0.7, 0.4]], r: 12 },
      { kind: 'wall', pts: [[0.7, 0.6], [0.7, 0.8]], r: 12 },
    ],
    enemy: [
      { type: 'gmech', n: 1, x: 0.4, y: 0.5 },
      { type: 'drone', n: 10, x: 0.82, y: 0.5, w: 0.05, h: 0.15 },
      { type: 'shieldbot', n: 2, x: 0.55, y: 0.5, w: 0.03, h: 0.15 },
      { type: 'repairbot', n: 3, x: 0.25, y: 0.5, w: 0.03, h: 0.15 },
    ] },
  // 7. The hydra leads the dead out of the castle: two zombie packs at the gate behind a barricade, a giant outside
  //    the walls, mages with the hydra in the courtyard. Counter: machines (saw bots: no flesh to bite and turn) or
  //    cannons from far back; a living army only feeds the zombie packs. (No necromancers: seen only within 60 px, they
  //    hid until the 3:00 ran out.)
  { n: 7, map: 'castle',
    terrain: [
      { kind: 'wall', pts: [[0.95, 0.25], [0.95, 0.42]], r: 10 },
      { kind: 'wall', pts: [[0.95, 0.58], [0.95, 0.75]], r: 10 },
    ],
    enemy: [
      { type: 'hydra', n: 1, x: 0.5, y: 0.5 },
      { type: 'zombie', n: 13, x: 0.86, y: 0.3, w: 0.05, h: 0.1 },
      { type: 'zombie', n: 13, x: 0.86, y: 0.7, w: 0.05, h: 0.1 },
      { type: 'giant', n: 1, x: 0.75, y: 0.12 },
      { type: 'mage', n: 4, x: 0.32, y: 0.5, w: 0.04, h: 0.08 },
    ] },
  // 8. The giant mech leads the robot army: saw bots and bomb bots in front, drones over the wall, laser bots and mechs
  //    behind, shield and repair bots at the back. Counter: dragons (saw bots, bomb bots and stomps can't reach a flyer);
  //    magnets and catapults fail here.
  { n: 8, map: 'village',
    terrain: [{ kind: 'wall', pts: [[0.72, 0.3], [0.72, 0.7]], r: 12 }],
    enemy: [
      { type: 'gmech', n: 1, x: 0.35, y: 0.5 },
      { type: 'sawbot', n: 8, x: 0.85, y: 0.25, w: 0.05, h: 0.1 },
      { type: 'bombbot', n: 8, x: 0.85, y: 0.75, w: 0.05, h: 0.1 },
      { type: 'drone', n: 14, x: 0.6, y: 0.5, w: 0.05, h: 0.2 },
      { type: 'laserbot', n: 4, x: 0.5, y: 0.25, w: 0.05, h: 0.06 },
      { type: 'mech', n: 2, x: 0.5, y: 0.75, w: 0.04, h: 0.06 },
      { type: 'shieldbot', n: 2, x: 0.2, y: 0.3, w: 0.03, h: 0.05 },
      { type: 'repairbot', n: 3, x: 0.2, y: 0.7, w: 0.03, h: 0.1 },
    ] },
];
