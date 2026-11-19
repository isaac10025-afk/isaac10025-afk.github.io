// Campaign: animals world, 8 battles (STEP9.md level format). Owner: LEVELS-A.
// Boxes are fractions of the enemy half (x 0 = back edge, 1 = midline); every box was checked on the 3 screen shapes:
// all units placed, land units out of deep water, piranhas and gators in water (the swamp's and the village's ponds).
export default [
  // 1. A few boars. Counter: legion (a shield line holds the charge); shots and swarms get gored.
  { n: 1, map: 'blank', enemy: [{ type: 'boar', n: 5, x: 0.55, y: 0.42, w: 0.08, h: 0.3 }] },
  // 2. A rat swarm. Counter: flamers or grenadiers (one hit takes a clump); single shots can't keep up. Rats can't
  //    reach a flyer, so a few jetpacks win too.
  { n: 2, map: 'blank', enemy: [{ type: 'rat', n: 50, x: 0.5, y: 0.42, w: 0.1, h: 0.3 }] },
  // 3. Snakes in front of a rat pack in the canyon. Counter: legion (a snake only swallows the hurt, rats break on the
  //    shields); grenadiers get swarmed before they throw.
  { n: 3, map: 'canyon', enemy: [
    { type: 'snake', n: 8, x: 0.75, y: 0.44, w: 0.06, h: 0.3 },
    { type: 'rat', n: 30, x: 0.5, y: 0.44, w: 0.1, h: 0.3 } ] },
  // 4. Boars on both wings, apes in the orchard behind. Counter: legion (shields hold the charge and the apes' slams);
  //    grenadiers and archers are run over.
  { n: 4, map: 'village', enemy: [
    { type: 'boar', n: 3, x: 0.75, y: 0.22, w: 0.08, h: 0.06 },
    { type: 'boar', n: 3, x: 0.6, y: 0.7, w: 0.08, h: 0.06 },
    { type: 'ape', n: 6, x: 0.45, y: 0.42, w: 0.08, h: 0.25 } ] },
  // 5. Gators lurking in the swamp's big pond, cheetahs on both wings. Counter: riflemen or snipers that stay off the
  //    bank; archers' volleys miss the fast cats.
  { n: 5, map: 'swamp', enemy: [
    { type: 'gator', n: 4, x: 0.92, y: 0.5, w: 0.04, h: 0.1 },
    { type: 'cheetah', n: 3, x: 0.6, y: 0.2, w: 0.1, h: 0.05 },
    { type: 'cheetah', n: 3, x: 0.58, y: 0.72, w: 0.1, h: 0.05 } ] },
  // 6. Piranhas and a gator in the village pond, snakes and rats by the houses. Counter: riflemen shooting from the bank
  //    (anyone who wades in is eaten; flamers by the water fizzle).
  { n: 6, map: 'village', enemy: [
    { type: 'piranha', n: 24, x: 0.97, y: 0.52, w: 0.02, h: 0.08 },
    { type: 'gator', n: 2, x: 0.97, y: 0.45, w: 0.02, h: 0.03 },
    { type: 'snake', n: 6, x: 0.6, y: 0.3, w: 0.06, h: 0.1 },
    { type: 'rat', n: 24, x: 0.35, y: 0.56, w: 0.08, h: 0.06 } ] },
  // 7. The herd on the beach: boars and apes in front, cheetahs on the wings, snakes, ants digging in behind a mud
  //    strip. Counter: a legion line (riflemen work too); grenadiers are overrun.
  { n: 7, map: 'beach', terrain: [{ kind: 'mud', pts: [[0.3, 0.38], [0.3, 0.56]], r: 30 }],
    enemy: [
      { type: 'ant', n: 14, x: 0.15, y: 0.47, w: 0.05, h: 0.1 },
      { type: 'ape', n: 4, x: 0.7, y: 0.42, w: 0.05, h: 0.04 },
      { type: 'boar', n: 4, x: 0.7, y: 0.52, w: 0.05, h: 0.04 },
      { type: 'cheetah', n: 4, x: 0.85, y: 0.47, w: 0.04, h: 0.1 },
      { type: 'snake', n: 6, x: 0.5, y: 0.47, w: 0.04, h: 0.1 } ] },
  // 8. Every animal at the swamp: piranhas and gators in the big pond, the herd on both wings, rats and ants behind.
  //    Counter: a big rifle line, or legion in front of grenadiers; grenadiers or flamers alone are overrun.
  { n: 8, map: 'swamp', enemy: [
    { type: 'piranha', n: 24, x: 0.95, y: 0.5, w: 0.03, h: 0.1 },
    { type: 'gator', n: 3, x: 0.92, y: 0.42, w: 0.03, h: 0.04 },
    { type: 'boar', n: 5, x: 0.75, y: 0.2, w: 0.1, h: 0.05 },
    { type: 'ape', n: 5, x: 0.6, y: 0.72, w: 0.1, h: 0.05 },
    { type: 'cheetah', n: 5, x: 0.5, y: 0.18, w: 0.1, h: 0.04 },
    { type: 'snake', n: 8, x: 0.3, y: 0.55, w: 0.08, h: 0.05 },
    { type: 'rat', n: 40, x: 0.3, y: 0.32, w: 0.1, h: 0.1 },
    { type: 'ant', n: 12, x: 0.15, y: 0.45, w: 0.05, h: 0.1 } ] },
];
