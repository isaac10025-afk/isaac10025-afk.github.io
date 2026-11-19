// Campaign: ocean world, 8 battles (STEP9.md level format). Owner: LEVELS-C.
// Water-only animals (shark, eel, swordfish) always get their own lagoon: a `water` stroke under their box, so they sit on
// deep water on every screen shape (the beach's sea runs along the top on a wide screen, along the bottom upright).
// Land groups on the beach stay between y 0.35 and 0.65 (sand on all three shapes). No mines here: ocean animals
// aren't trained, they would walk into their own.
export default [
  // 1. A crab pack. Counter: hit the pack before it reaches you (grenades, flames, crossbow bolts through 3, snipers):
  //    crabs are fast and every pinch slows what it catches.
  { n: 1, map: 'blank', enemy: [{ type: 'crab', n: 14, x: 0.6, y: 0.5, w: 0.15, h: 0.25 }] },
  // 2. Sharks in a lagoon. Counter: flyers (drones: a shark can't bite up out of the water) or snipers from the sand,
  //    out of the 30 px a shark lunges up the bank. Never wade in.
  { n: 2, map: 'blank',
    terrain: [{ kind: 'water', pts: [[0.5, 0.35], [0.5, 0.65]], r: 75 }],
    enemy: [{ type: 'shark', n: 4, x: 0.5, y: 0.5, w: 0.06, h: 0.25 }] },
  // 3. A puffer line with crab packs on both flanks. Counter: a shield line (legionaries) that soaks the pinches and
  //    out-lasts the spikes, or grenades on the packs (a puffed puffer's spikes only answer fists and blades).
  { n: 3, map: 'beach', enemy: [
    { type: 'puffer', n: 12, x: 0.78, y: 0.5, w: 0.05, h: 0.25 },
    { type: 'crab', n: 10, x: 0.55, y: 0.38, w: 0.12, h: 0.05 },
    { type: 'crab', n: 10, x: 0.55, y: 0.62, w: 0.12, h: 0.05 },
  ] },
  // 4. A turtle wall in front of a swordfish lagoon. Counter: steady blades with shields (legionaries) or grenades: a
  //    hiding turtle takes hits at 0.15 but can't bite back, and the swordfish only leap at what comes within 180 px.
  { n: 4, map: 'swamp',
    terrain: [{ kind: 'water', pts: [[0.25, 0.3], [0.25, 0.7]], r: 70 }],
    enemy: [
      { type: 'turtle', n: 6, x: 0.47, y: 0.5, w: 0.04, h: 0.25 },
      { type: 'swordfish', n: 5, x: 0.25, y: 0.5, w: 0.05, h: 0.3 },
    ] },
  // 5. Walruses on the frozen lake (they slide the whole way on ice, tossing what they hit), octopuses and crabs on the
  //    snow behind. Counter: outrange them: snipers or crossbows drop the walruses on the ice before they slide in.
  { n: 5, map: 'lake', enemy: [
    { type: 'walrus', n: 3, x: 0.78, y: 0.5, w: 0.05, h: 0.2 },
    { type: 'octopus', n: 4, x: 0.15, y: 0.5, w: 0.05, h: 0.25 },
    { type: 'crab', n: 10, x: 0.3, y: 0.18, w: 0.15, h: 0.05 },
  ] },
  // 6. A reef: a moat full of eels and swordfish in front, turtles, octopuses and puffers behind it. Counter: guns from
  //    the bank (riflemen, snipers, crossbows); never wade in: one eel shocks everyone in the same water.
  { n: 6, map: 'beach',
    terrain: [{ kind: 'water', pts: [[0.8, 0.36], [0.8, 0.64]], r: 55 }],
    enemy: [
      { type: 'eel', n: 6, x: 0.8, y: 0.45, w: 0.04, h: 0.1 },
      { type: 'swordfish', n: 4, x: 0.8, y: 0.57, w: 0.04, h: 0.1 },
      { type: 'turtle', n: 4, x: 0.55, y: 0.5, w: 0.05, h: 0.2 },
      { type: 'octopus', n: 3, x: 0.38, y: 0.5, w: 0.05, h: 0.2 },
      { type: 'puffer', n: 10, x: 0.22, y: 0.5, w: 0.08, h: 0.2 },
    ] },
  // 7. Swamp: a broken sea wall, crabs and puffers at its gaps, walruses behind, a shark and eel pond at the back.
  //    Counter: bolts and bullets through the gaps (crossbows, snipers), then shoot into the pond from the bank.
  { n: 7, map: 'swamp',
    terrain: [
      { kind: 'wall', pts: [[0.62, 0.15], [0.62, 0.38]], r: 12 },
      { kind: 'wall', pts: [[0.62, 0.62], [0.62, 0.85]], r: 12 },
      { kind: 'water', pts: [[0.2, 0.35], [0.2, 0.65]], r: 70 },
    ],
    enemy: [
      { type: 'crab', n: 14, x: 0.75, y: 0.27, w: 0.1, h: 0.08 },
      { type: 'puffer', n: 10, x: 0.75, y: 0.73, w: 0.1, h: 0.08 },
      { type: 'walrus', n: 1, x: 0.45, y: 0.36 },
      { type: 'walrus', n: 1, x: 0.45, y: 0.64 },
      { type: 'shark', n: 3, x: 0.2, y: 0.55, w: 0.06, h: 0.2 },
      { type: 'eel', n: 5, x: 0.2, y: 0.38, w: 0.04, h: 0.06 },
    ] },
  // 8. The whole sea: all eight. A lagoon of sharks, eels and swordfish at the back, octopuses and walruses in the middle,
  //    turtles in front, crab and puffer packs on the flanks. Counter: crossbows (a bolt goes through 3: the packs) and
  //    snipers from far off; the fish never leave the water, so never wade in.
  { n: 8, map: 'beach',
    terrain: [{ kind: 'water', pts: [[0.2, 0.36], [0.2, 0.64]], r: 75 }],
    enemy: [
      { type: 'shark', n: 4, x: 0.2, y: 0.5, w: 0.06, h: 0.25 },
      { type: 'eel', n: 6, x: 0.2, y: 0.4, w: 0.04, h: 0.05 },
      { type: 'swordfish', n: 5, x: 0.2, y: 0.6, w: 0.04, h: 0.05 },
      { type: 'octopus', n: 4, x: 0.45, y: 0.42, w: 0.04, h: 0.1 },
      { type: 'walrus', n: 3, x: 0.45, y: 0.58, w: 0.04, h: 0.1 },
      { type: 'turtle', n: 6, x: 0.8, y: 0.5, w: 0.04, h: 0.25 },
      { type: 'crab', n: 20, x: 0.65, y: 0.37, w: 0.15, h: 0.05 },
      { type: 'puffer', n: 14, x: 0.65, y: 0.63, w: 0.15, h: 0.05 },
    ] },
];
