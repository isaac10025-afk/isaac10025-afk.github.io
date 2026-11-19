// Campaign: siege world, 8 battles (STEP9.md level format). Owner: LEVELS-B.
// The comment above each battle names the counter we expect (the bot finds its own: tools/campaign-bot.mjs).
export default [
  // 1: a crossbow line: each bolt goes through 3 in a row, then a long crank. Counter: close in fast before the crank (cavalry, boars, legion) or fly (pteros, jetpacks); a slow shield wall never catches them.
  { n: 1, map: 'blank', enemy: [{ type: 'crossbow', n: 10, x: 0.6, y: 0.42, w: 0.04, h: 0.35 }] },
  // 2: a halberd block: long reach, and a charge into the set polearms takes 3x. Counter: shoot it (snipers, mages, grenadiers, archers); a cavalry charge dies on the polearms.
  { n: 2, map: 'blank', enemy: [{ type: 'halberd', n: 12, x: 0.6, y: 0.42, w: 0.1, h: 0.25 }] },
  // 3: shield wall in front (90 % of shots from the front blocked), crossbows behind, by the village. Counter: tough melee into the shields (legion) or flyers onto the crossbows (jetpacks); riflemen and archers can't shoot through the shields.
  { n: 3, map: 'village', enemy: [
    { type: 'shieldwall', n: 8, x: 0.9, y: 0.27, w: 0.04, h: 0.14 },
    { type: 'crossbow', n: 6, x: 0.77, y: 0.27, w: 0.04, h: 0.12 },
  ] },
  // 4: halberds hold the river bank, two ballistas behind (a bolt pins a whole row). Counter: shooters from range (snipers, archers, crossbows, riflemen); charging riders and boars die on the polearms.
  { n: 4, map: 'canyon', enemy: [
    { type: 'halberd', n: 16, x: 0.8, y: 0.42, w: 0.04, h: 0.5 },
    { type: 'ballista', n: 2, x: 0.45, y: 0.42, w: 0.06, h: 0.3 },
  ] },
  // 5: a castle: catapults inside the walls, crossbows at the gate, oil pots by the moat. Counter: get in close, the boulders need 180 px (legion, cavalry through the gate, jetpacks over the walls); snipers and mages lose the shoot-out with the crossbows.
  { n: 5, map: 'castle', enemy: [
    { type: 'catapult', n: 2, x: 0.45, y: 0.5, w: 0.05, h: 0.12 },
    { type: 'crossbow', n: 8, x: 0.9, y: 0.5, w: 0.03, h: 0.12 },
    { type: 'oilpot', n: 6, x: 0.86, y: 0.28, w: 0.05, h: 0.05 },
  ] },
  // 6: a wall across the field with two gaps: shield walls in the gaps, crossbows and burning oil behind, a ballista. Counter: fly over the wall (jetpacks, pteros) or out-shoot the crossbows (mages, snipers); a slow army dies in the gaps.
  { n: 6, map: 'blank',
    terrain: [
      { kind: 'wall', pts: [[0.75, 0.03], [0.75, 0.24]], r: 12 },
      { kind: 'wall', pts: [[0.75, 0.34], [0.75, 0.5]], r: 12 },
      { kind: 'wall', pts: [[0.75, 0.6], [0.75, 0.97]], r: 12 },
    ],
    enemy: [
      { type: 'shieldwall', n: 6, x: 0.8, y: 0.29, w: 0.03, h: 0.06 },
      { type: 'shieldwall', n: 6, x: 0.8, y: 0.55, w: 0.03, h: 0.06 },
      { type: 'crossbow', n: 10, x: 0.6, y: 0.42, w: 0.04, h: 0.3 },
      { type: 'oilpot', n: 6, x: 0.67, y: 0.42, w: 0.03, h: 0.25 },
      { type: 'ballista', n: 1, x: 0.35, y: 0.42 },
    ] },
  // 7: the siege train rolls out from behind a palisade: a ram and a siege tower with a shield wall and halberds, catapults behind the stakes. Counter: it's slow: shoot it apart (snipers, grenadiers, archers, crossbows) or fly at the catapults (jetpacks, pteros); a charge into the halberds dies.
  { n: 7, map: 'canyon',
    terrain: [{ kind: 'wall', pts: [[0.42, 0.2], [0.42, 0.64]], r: 10 }],
    enemy: [
      { type: 'ram', n: 1, x: 0.72, y: 0.27 },
      { type: 'siegetower', n: 1, x: 0.72, y: 0.57 },
      { type: 'shieldwall', n: 10, x: 0.82, y: 0.42, w: 0.03, h: 0.15 },
      { type: 'halberd', n: 10, x: 0.6, y: 0.42, w: 0.04, h: 0.2 },
      { type: 'catapult', n: 2, x: 0.28, y: 0.42, w: 0.05, h: 0.2 },
    ] },
  // 8: the whole siege: crossbows and oil pots in the castle, a shield wall and halberds at the bridge, catapults and ballistas behind, a ram and a siege tower ready to roll. Counter: big bodies the bolts and the oil can't stop (mechs, giants, UFOs) or a huge legion; riders, mages and riflemen melt in the crossfire.
  { n: 8, map: 'castle', enemy: [
    { type: 'shieldwall', n: 14, x: 0.94, y: 0.5, w: 0.02, h: 0.25 },
    { type: 'halberd', n: 14, x: 0.88, y: 0.5, w: 0.02, h: 0.25 },
    { type: 'crossbow', n: 10, x: 0.42, y: 0.5, w: 0.05, h: 0.08 },
    { type: 'oilpot', n: 8, x: 0.55, y: 0.5, w: 0.03, h: 0.08 },
    { type: 'catapult', n: 2, x: 0.3, y: 0.12, w: 0.1, h: 0.04 },
    { type: 'ballista', n: 2, x: 0.55, y: 0.12, w: 0.08, h: 0.04 },
    { type: 'ram', n: 1, x: 0.88, y: 0.2 },
    { type: 'siegetower', n: 1, x: 0.88, y: 0.8 },
  ] },
];
