// Campaign: space world, 8 battles (STEP9.md level format). Owner: LEVELS-B.
// The comment above each battle names the counter we expect (the bot finds its own: tools/campaign-bot.mjs).
// Space maps: the canyon (red dirt), the frozen lake, the swamp and the volcano look the most like other planets.
export default [
  // 1: an alien squad with ray guns (16 a shot at 220 px, 80 hp each). Counter: run them down (cavalry, boars) or out-shoot them (snipers, mages, crossbows, riflemen); a slow shield wall gets picked apart.
  { n: 1, map: 'blank', enemy: [{ type: 'alien', n: 14, x: 0.6, y: 0.42, w: 0.06, h: 0.25 }] },
  // 2: jetpacks fly high (melee can't reach them up there) and rocket you. Counter: guns that hit flyers (riflemen, mages, snipers, aliens); melee only catches them when they land to refuel; arrows and bolts miss.
  { n: 2, map: 'blank', enemy: [{ type: 'jetpack', n: 10, x: 0.6, y: 0.42, w: 0.08, h: 0.25 }] },
  // 3: astronauts in front (a punch floats you), shrink rays behind (each ring halves the heaviest unit), on the snow by the frozen lake. Counter: a swarm of small units (ants) or a few mages; a few big units get shrunk one by one.
  { n: 3, map: 'lake', enemy: [
    { type: 'astronaut', n: 10, x: 0.75, y: 0.17, w: 0.06, h: 0.06 },
    { type: 'shrinkray', n: 6, x: 0.55, y: 0.17, w: 0.05, h: 0.05 },
  ] },
  // 4: teleporters blink behind your line and backstab (x2), aliens shoot from the front, in the swamp. Counter: riders and boars run the shooters down before the backstabs add up (cavalry, boars); snipers and mages at the back get blinked on; a slow shield wall gets stabbed.
  { n: 4, map: 'swamp', enemy: [
    { type: 'alien', n: 12, x: 0.6, y: 0.27, w: 0.05, h: 0.12 },
    { type: 'teleporter', n: 8, x: 0.78, y: 0.27, w: 0.04, h: 0.12 },
  ] },
  // 5: mind aliens turn your strongest unit, gravity aliens float the rest, aliens shoot; on the crater rim. Counter: machines can't be taken and a mech is too heavy to float (mechs), or splash them before they act (grenadiers, mages); one big living unit fights for them.
  { n: 5, map: 'volcano', enemy: [
    { type: 'alien', n: 10, x: 0.55, y: 0.16, w: 0.05, h: 0.05 },
    { type: 'gravity', n: 5, x: 0.42, y: 0.16, w: 0.04, h: 0.04 },
    { type: 'mindalien', n: 4, x: 0.3, y: 0.16, w: 0.03, h: 0.04 },
  ] },
  // 6: the sky over the frozen lake: UFOs beam up light units, jetpacks rocket, aliens and astronauts hold the snow behind a minefield (flyers don't set mines off). Counter: guns for the flyers (riflemen, snipers, mages, grenadiers); boars and big walkers get rocketed and beamed, arrows and bolts miss.
  { n: 6, map: 'lake',
    terrain: [{ kind: 'mine', pts: [[0.92, 0.05], [0.92, 0.3]], r: 22 }],
    enemy: [
    { type: 'ufo', n: 2, x: 0.4, y: 0.17, w: 0.06, h: 0.05 },
    { type: 'jetpack', n: 8, x: 0.55, y: 0.17, w: 0.04, h: 0.05 },
    { type: 'alien', n: 10, x: 0.68, y: 0.17, w: 0.04, h: 0.05 },
    { type: 'astronaut', n: 8, x: 0.8, y: 0.17, w: 0.03, h: 0.05 },
  ] },
  // 7: a crater base: walls with a gate, aliens and shrink rays behind them, gravity aliens, astronauts and teleporters out front, mines on the flanks. Counter: catapults over the walls (the boulders roll on through the lines), mages from range; halberds, grenades, giants and shield walls fail.
  { n: 7, map: 'canyon',
    terrain: [
      { kind: 'wall', pts: [[0.45, 0.17], [0.7, 0.25], [0.7, 0.36]], r: 12 },
      { kind: 'wall', pts: [[0.7, 0.5], [0.7, 0.61], [0.45, 0.69]], r: 12 },
      { kind: 'mine', pts: [[0.86, 0.17], [0.86, 0.3]], r: 20 },
      { kind: 'mine', pts: [[0.86, 0.56], [0.86, 0.69]], r: 20 },
    ],
    enemy: [
      { type: 'alien', n: 12, x: 0.55, y: 0.43, w: 0.04, h: 0.2 },
      { type: 'shrinkray', n: 5, x: 0.45, y: 0.43, w: 0.03, h: 0.12 },
      { type: 'gravity', n: 5, x: 0.62, y: 0.43, w: 0.02, h: 0.12 },
      { type: 'astronaut', n: 6, x: 0.76, y: 0.43, w: 0.02, h: 0.08 },
      { type: 'teleporter', n: 8, x: 0.82, y: 0.43, w: 0.03, h: 0.12 },
    ] },
  // 8: the invasion: two UFOs, jetpacks overhead, mind aliens and shrink rays at the back, gravity aliens, aliens and astronauts in front, teleporters ready to blink. Counter: massed guns (riflemen, snipers, mages) for the flyers and the shooters; melee walks into floats, shrinks and blinks, big units get turned or shrunk.
  { n: 8, map: 'canyon', enemy: [
    { type: 'ufo', n: 2, x: 0.45, y: 0.42, w: 0.04, h: 0.3 },
    { type: 'jetpack', n: 10, x: 0.6, y: 0.42, w: 0.04, h: 0.3 },
    { type: 'astronaut', n: 12, x: 0.88, y: 0.42, w: 0.03, h: 0.3 },
    { type: 'alien', n: 16, x: 0.78, y: 0.42, w: 0.04, h: 0.3 },
    { type: 'teleporter', n: 8, x: 0.7, y: 0.42, w: 0.03, h: 0.25 },
    { type: 'gravity', n: 6, x: 0.62, y: 0.42, w: 0.03, h: 0.2 },
    { type: 'shrinkray', n: 6, x: 0.52, y: 0.42, w: 0.03, h: 0.2 },
    { type: 'mindalien', n: 4, x: 0.35, y: 0.42, w: 0.03, h: 0.15 },
  ] },
];
