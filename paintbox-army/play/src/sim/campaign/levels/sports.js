// Campaign: sports world, 8 battles (STEP9.md level format). Owner: LEVELS-C.
// Hockey players get ice (the frozen lake, or an `ice` stroke under them = the rink): on ice they skate at 260.
// Sports people are trained: they step round mines (their own too), animals and machines don't.
export default [
  // 1. A few tacklers. Counter: shields (legionaries): a tackle into a braced shield, or into anything over mass 5,
  //    just stops dead.
  { n: 1, map: 'blank', enemy: [{ type: 'tackler', n: 8, x: 0.6, y: 0.5, w: 0.08, h: 0.25 }] },
  // 2. A pitching line. Counter: outrange it: snipers (450 px) out-shoot a pitcher's 280; a shield wall also blocks
  //    the fastballs from the front.
  { n: 2, map: 'playground', enemy: [{ type: 'pitcher', n: 10, x: 0.5, y: 0.5, w: 0.04, h: 0.4 }] },
  // 3. Boxers in front, pitchers behind. Counter: fire (flamers): boxers dodge a third of the fists, bullets and arrows,
  //    never a flame.
  { n: 3, map: 'playground', enemy: [
    { type: 'boxer', n: 10, x: 0.8, y: 0.5, w: 0.06, h: 0.3 },
    { type: 'pitcher', n: 6, x: 0.45, y: 0.5, w: 0.04, h: 0.3 },
  ] },
  // 4. A hockey team on the frozen lake with cheerleaders behind. Counter: don't fight on the ice (only they keep their
  //    feet there): hold the snow with long guns (snipers, crossbows) and let them skate in.
  { n: 4, map: 'lake', enemy: [
    { type: 'hockey', n: 10, x: 0.75, y: 0.5, w: 0.06, h: 0.25 },
    { type: 'cheerleader', n: 3, x: 0.12, y: 0.5, w: 0.03, h: 0.2 },
  ] },
  // 5. Sumos in front, batters on the flanks, bowlers at the back. Counter: guns, not throws (batters hit grenades and
  //    bombs back: grenadiers are the worst pick here) and not a tight block (one bowling ball knocks a line down).
  { n: 5, map: 'village', enemy: [
    { type: 'sumo', n: 2, x: 0.5, y: 0.5, w: 0.04, h: 0.12 },
    { type: 'batter', n: 6, x: 0.7, y: 0.3, w: 0.08, h: 0.06 },
    { type: 'batter', n: 6, x: 0.7, y: 0.75, w: 0.08, h: 0.06 },
    { type: 'bowler', n: 6, x: 0.35, y: 0.5, w: 0.04, h: 0.25 },
  ] },
  // 6. Behind a broken fence: tacklers and batters in front, pitchers and bowlers behind it, cheerleaders at the back.
  //    Counter: long guns over the fence (snipers, crossbows); no grenades (the batters send them back).
  { n: 6, map: 'playground',
    terrain: [
      { kind: 'wall', pts: [[0.62, 0.15], [0.62, 0.4]], r: 10 },
      { kind: 'wall', pts: [[0.62, 0.6], [0.62, 0.85]], r: 10 },
    ],
    enemy: [
      { type: 'tackler', n: 6, x: 0.85, y: 0.5, w: 0.05, h: 0.2 },
      { type: 'batter', n: 6, x: 0.75, y: 0.5, w: 0.05, h: 0.2 },
      { type: 'pitcher', n: 6, x: 0.45, y: 0.3, w: 0.05, h: 0.15 },
      { type: 'bowler', n: 5, x: 0.45, y: 0.7, w: 0.05, h: 0.15 },
      { type: 'cheerleader', n: 2, x: 0.2, y: 0.5, w: 0.03, h: 0.1 },
    ] },
  // 7. The canyon (the river can only be crossed on its 3 bridges, at y 0.19, 0.5, 0.79): a mine belt on the near
  //    bank, a sumo on each bridge mouth, boxers between, bowlers lined up to roll down the bridges, pitchers and
  //    cheerleaders behind. Counter: snipers from across the river, or trained people (they step round the mines,
  //    animals and machines don't) with grenades for the boxers; flyers skip the bridges.
  { n: 7, map: 'canyon',
    terrain: [{ kind: 'mine', pts: [[0.88, 0.1], [0.88, 0.9]], r: 18 }],
    enemy: [
      { type: 'sumo', n: 1, x: 0.78, y: 0.19 },
      { type: 'sumo', n: 1, x: 0.78, y: 0.5 },
      { type: 'sumo', n: 1, x: 0.78, y: 0.79 },
      { type: 'boxer', n: 4, x: 0.66, y: 0.34, w: 0.05, h: 0.06 },
      { type: 'boxer', n: 4, x: 0.66, y: 0.65, w: 0.05, h: 0.06 },
      { type: 'bowler', n: 2, x: 0.5, y: 0.19, w: 0.06, h: 0.02 },
      { type: 'bowler', n: 2, x: 0.5, y: 0.5, w: 0.06, h: 0.02 },
      { type: 'bowler', n: 2, x: 0.5, y: 0.79, w: 0.06, h: 0.02 },
      { type: 'pitcher', n: 6, x: 0.32, y: 0.5, w: 0.04, h: 0.25 },
      { type: 'cheerleader', n: 3, x: 0.15, y: 0.5, w: 0.03, h: 0.2 },
    ] },
  // 8. The whole league: all eight. Hockey on the rink in front, tacklers and boxers beside it, sumos anchoring the
  //    middle, batters, pitchers and bowlers behind, cheerleaders at the back. Counter: long guns (snipers) behind a
  //    shield front the tackles bounce off; no throws (the batters return them).
  { n: 8, map: 'playground',
    terrain: [{ kind: 'ice', pts: [[0.82, 0.32], [0.82, 0.68]], r: 45 }],
    enemy: [
      { type: 'hockey', n: 8, x: 0.82, y: 0.5, w: 0.04, h: 0.25 },
      { type: 'tackler', n: 8, x: 0.78, y: 0.2, w: 0.08, h: 0.06 },
      { type: 'boxer', n: 8, x: 0.78, y: 0.78, w: 0.08, h: 0.06 },
      { type: 'sumo', n: 3, x: 0.62, y: 0.5, w: 0.03, h: 0.2 },
      { type: 'batter', n: 8, x: 0.5, y: 0.3, w: 0.06, h: 0.08 },
      { type: 'bowler', n: 6, x: 0.5, y: 0.7, w: 0.06, h: 0.08 },
      { type: 'pitcher', n: 8, x: 0.32, y: 0.5, w: 0.04, h: 0.25 },
      { type: 'cheerleader', n: 4, x: 0.15, y: 0.5, w: 0.03, h: 0.2 },
    ] },
];
