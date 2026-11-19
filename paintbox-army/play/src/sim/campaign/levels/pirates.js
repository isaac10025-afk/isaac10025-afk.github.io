// Campaign: pirates world, 8 battles (STEP9.md level format). Owner: LEVELS-B.
// The comment above each battle names the counter we expect (the bot finds its own: tools/campaign-bot.mjs).
// Beach: the sea runs along the top on desk and phone-sideways and along the bottom on an upright phone, so the pirates
// stand on the sand band (y 0.4-0.56) on every shape, and the ships get a cove of their own (a `water` stroke).
export default [
  // 1: a deckhand rush: fast cutlasses that sidestep. Counter: long reach and splash (halberds, flamers, grenadiers, mages) or riders; scattered archers get cut down.
  { n: 1, map: 'blank', enemy: [{ type: 'deckhand', n: 14, x: 0.6, y: 0.42, w: 0.08, h: 0.25 }] },
  // 2: a pistol line: one big shot each (45), then a weak whip, and no reload with you close. Counter: tough melee walks through the one volley (legion, cavalry, boars), or out-shoot it (snipers, mages).
  { n: 2, map: 'beach', enemy: [{ type: 'pistol', n: 12, x: 0.6, y: 0.47, w: 0.04, h: 0.14 }] },
  // 3: anchors in front (wide swings, a hook that yanks you in), bombers behind (bouncing bombs out to 220 px). Counter: shoot from range (crossbows, snipers, mages), out-lob them (grenadiers), or ride them down; a tight block of halberds or shields eats the bombs.
  { n: 3, map: 'beach', enemy: [
    { type: 'anchor', n: 6, x: 0.8, y: 0.47, w: 0.03, h: 0.14 },
    { type: 'bomber', n: 10, x: 0.6, y: 0.47, w: 0.04, h: 0.14 },
  ] },
  // 4: blunderbusses held by a captain (no one near him runs), deckhands on the flanks. Counter: riders through the 120 px cone (cavalry, boars), mages, saw bots; archers lose: the deckhands run them down.
  { n: 4, map: 'beach', enemy: [
    { type: 'blunderbuss', n: 10, x: 0.75, y: 0.47, w: 0.03, h: 0.1 },
    { type: 'captain', n: 1, x: 0.62, y: 0.47 },
    { type: 'deckhand', n: 6, x: 0.8, y: 0.4, w: 0.05, h: 0.03 },
    { type: 'deckhand', n: 6, x: 0.8, y: 0.54, w: 0.05, h: 0.03 },
  ] },
  // 5: three cannons behind a deckhand screen and pistols, by the river (a ball goes through 4 in a line and skips on water). Counter: fast and tough (cavalry, boars, legion) or snipers; a slow column over a bridge gets skewered.
  { n: 5, map: 'canyon', enemy: [
    { type: 'deckhand', n: 12, x: 0.85, y: 0.42, w: 0.04, h: 0.25 },
    { type: 'pistol', n: 8, x: 0.7, y: 0.42, w: 0.04, h: 0.2 },
    { type: 'cannon', n: 3, x: 0.45, y: 0.42, w: 0.04, h: 0.3 },
  ] },
  // 6: two ships in a cove fire broadsides (2500 hp each; sunk, 6 deckhands swim out), cannons and pistols on the shore. Counter: ships never leave the water: snipers out-range them, or tough units wade in (boars, legion).
  { n: 6, map: 'beach',
    terrain: [{ kind: 'water', pts: [[0.34, 0.48], [0.34, 0.56]], r: 62 }],
    enemy: [
      { type: 'ship', n: 2, x: 0.34, y: 0.52, w: 0.04, h: 0.1 },
      { type: 'cannon', n: 2, x: 0.58, y: 0.47, w: 0.03, h: 0.12 },
      { type: 'pistol', n: 10, x: 0.74, y: 0.47, w: 0.03, h: 0.12 },
      { type: 'deckhand', n: 10, x: 0.84, y: 0.47, w: 0.03, h: 0.12 },
    ] },
  // 7: a fort: a captain holds anchors and blunderbusses in its gate, bombers and pistols behind the wall, mines on the flanks. Counter: shoot or lob into it from range (mages, snipers, crossbows, grenadiers, a catapult) or ride in through the gate (cavalry); a shield wall never gets in.
  { n: 7, map: 'beach',
    terrain: [
      { kind: 'wall', pts: [[0.5, 0.39], [0.74, 0.39], [0.74, 0.44]], r: 12 },
      { kind: 'wall', pts: [[0.74, 0.51], [0.74, 0.56], [0.5, 0.56]], r: 12 },
      { kind: 'mine', pts: [[0.84, 0.39], [0.94, 0.39]], r: 18 },
      { kind: 'mine', pts: [[0.84, 0.56], [0.94, 0.56]], r: 18 },
    ],
    enemy: [
      { type: 'captain', n: 1, x: 0.66, y: 0.475 },
      { type: 'anchor', n: 4, x: 0.76, y: 0.475, w: 0.02, h: 0.04 },
      { type: 'blunderbuss', n: 6, x: 0.7, y: 0.475, w: 0.02, h: 0.06 },
      { type: 'bomber', n: 10, x: 0.6, y: 0.475, w: 0.05, h: 0.1 },
      { type: 'pistol', n: 8, x: 0.52, y: 0.475, w: 0.03, h: 0.1 },
    ] },
  // 8: the whole crew: a ship in the cove, cannons on the beach, two captains with anchors, blunderbusses, pistols and deckhands, bombers behind. Counter: tough melee holds the beach (legion) with snipers behind for the ship and the cannons; riflemen or riders alone lose.
  { n: 8, map: 'beach',
    terrain: [{ kind: 'water', pts: [[0.2, 0.47], [0.2, 0.57]], r: 56 }],
    enemy: [
      { type: 'ship', n: 1, x: 0.2, y: 0.52 },
      { type: 'cannon', n: 3, x: 0.56, y: 0.47, w: 0.03, h: 0.14 },
      { type: 'bomber', n: 10, x: 0.63, y: 0.47, w: 0.03, h: 0.14 },
      { type: 'pistol', n: 12, x: 0.7, y: 0.47, w: 0.03, h: 0.14 },
      { type: 'captain', n: 2, x: 0.77, y: 0.47, w: 0.02, h: 0.12 },
      { type: 'blunderbuss', n: 10, x: 0.81, y: 0.47, w: 0.02, h: 0.14 },
      { type: 'anchor', n: 6, x: 0.87, y: 0.47, w: 0.02, h: 0.14 },
      { type: 'deckhand', n: 16, x: 0.93, y: 0.47, w: 0.03, h: 0.15 },
    ] },
];
