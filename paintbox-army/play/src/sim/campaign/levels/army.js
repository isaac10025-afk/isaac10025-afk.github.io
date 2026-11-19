// Campaign: army world, 8 battles (STEP9.md level format). Owner: LEVELS-A.
// Boxes are fractions of the enemy half (x 0 = back edge, 1 = midline); every box was checked on the 3 screen shapes
// (desk, phone upright, phone on its side): all units placed, none in deep water, none on lava.
export default [
  // 1. A line of riflemen. Counter: grenadiers (a tight line is one blast); a rifle line of the same size is a coin toss.
  { n: 1, map: 'blank', enemy: [{ type: 'rifle', n: 12, x: 0.55, y: 0.42, w: 0.08, h: 0.3 }] },
  // 2. Archers far back. Counter: fast riders (cavalry, cheetahs): volleys land where you were, too late.
  { n: 2, map: 'blank', enemy: [{ type: 'archer', n: 16, x: 0.3, y: 0.42, w: 0.1, h: 0.35 }] },
  // 3. Shield wall at the middle bridge, archers behind it. Counter: zombies (every legionary they bite joins them) or
  //    mages; grenadiers get shot before they can throw, snipers only win on a wide field.
  { n: 3, map: 'canyon', enemy: [
    { type: 'legion', n: 18, x: 0.8, y: 0.46, w: 0.08, h: 0.25 },
    { type: 'archer', n: 12, x: 0.45, y: 0.45, w: 0.1, h: 0.3 } ] },
  // 4. Riflemen and grenadiers inside the castle. Counter: snipers kept at the back (they pick the garrison off through
  //    the gate from out of reach); archers' volleys can't touch them.
  { n: 4, map: 'castle', enemy: [
    { type: 'rifle', n: 14, x: 0.55, y: 0.45, w: 0.1, h: 0.1 },
    { type: 'grenadier', n: 6, x: 0.5, y: 0.55, w: 0.1, h: 0.08 } ] },
  // 5. Riflemen in the middle, cavalry on both flanks. Counter: legion (a braced shield line breaks the charge) or
  //    grenadiers; riflemen and riders of your own get run down.
  { n: 5, map: 'village', enemy: [
    { type: 'rifle', n: 14, x: 0.55, y: 0.42, w: 0.08, h: 0.25 },
    { type: 'cavalry', n: 4, x: 0.6, y: 0.16, w: 0.1, h: 0.06 },
    { type: 'cavalry', n: 4, x: 0.58, y: 0.72, w: 0.1, h: 0.06 } ] },
  // 6. A dug-in line behind a mine field at the middle bridge: shields, flamers, grenadiers, snipers. Counter: mages
  //    (fireballs land behind the mines, lightning jumps along the packed line); riders and riflemen walk into the mines
  //    and the flames.
  { n: 6, map: 'canyon', terrain: [{ kind: 'mine', pts: [[0.86, 0.3], [0.86, 0.64]], r: 30 }],
    enemy: [
      { type: 'legion', n: 16, x: 0.72, y: 0.44, w: 0.06, h: 0.35 },
      { type: 'flamer', n: 8, x: 0.62, y: 0.44, w: 0.05, h: 0.3 },
      { type: 'grenadier', n: 8, x: 0.5, y: 0.44, w: 0.06, h: 0.3 },
      { type: 'sniper', n: 4, x: 0.42, y: 0.44, w: 0.04, h: 0.3 } ] },
  // 7. Ninjas and cavalry on the flanks, flamers and riflemen behind two low walls, archers at the back.
  //    Counter: a legion line in front with archers behind it; one type alone struggles.
  { n: 7, map: 'village', terrain: [{ kind: 'wall', pts: [[0.68, 0.24], [0.68, 0.36]], r: 10 }, { kind: 'wall', pts: [[0.68, 0.5], [0.68, 0.62]], r: 10 }],
    enemy: [
      { type: 'ninja', n: 4, x: 0.85, y: 0.2, w: 0.06, h: 0.06 },
      { type: 'ninja', n: 4, x: 0.85, y: 0.66, w: 0.06, h: 0.06 },
      { type: 'cavalry', n: 4, x: 0.55, y: 0.16, w: 0.1, h: 0.05 },
      { type: 'flamer', n: 6, x: 0.62, y: 0.43, w: 0.04, h: 0.2 },
      { type: 'rifle', n: 12, x: 0.5, y: 0.43, w: 0.05, h: 0.3 },
      { type: 'archer', n: 10, x: 0.3, y: 0.43, w: 0.08, h: 0.3 } ] },
  // 8. The whole army at the castle: a garrison inside, shields and flamers at the corners, riders on both wings.
  //    Counter: a big sniper line at the back (it outranges every gun here), with riders or zombies in front on a short
  //    field; rifle, archer or grenadier spam loses.
  { n: 8, map: 'castle', enemy: [
    { type: 'rifle', n: 12, x: 0.55, y: 0.45, w: 0.1, h: 0.05 },
    { type: 'archer', n: 12, x: 0.55, y: 0.56, w: 0.1, h: 0.05 },
    { type: 'grenadier', n: 6, x: 0.45, y: 0.5, w: 0.04, h: 0.1 },
    { type: 'legion', n: 10, x: 0.85, y: 0.25, w: 0.06, h: 0.06 },
    { type: 'legion', n: 10, x: 0.85, y: 0.69, w: 0.06, h: 0.05 },
    { type: 'flamer', n: 8, x: 0.8, y: 0.32, w: 0.04, h: 0.05 },
    { type: 'sniper', n: 6, x: 0.3, y: 0.18, w: 0.1, h: 0.04 },
    { type: 'cavalry', n: 5, x: 0.6, y: 0.16, w: 0.1, h: 0.04 },
    { type: 'cavalry', n: 5, x: 0.58, y: 0.83, w: 0.1, h: 0.04 },
    { type: 'ninja', n: 8, x: 0.9, y: 0.17, w: 0.05, h: 0.05 } ] },
];
