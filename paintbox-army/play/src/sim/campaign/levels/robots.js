// Campaign: robots world, 8 battles (STEP9.md level format). Owner: LEVELS-B.
// The comment above each battle names the counter we expect (the bot finds its own: tools/campaign-bot.mjs).
// Robots are machines: no morale (they never run), metal (a magnet pulls them, laser fire can't burn them), and they
// short out in deep water, so they start on dry ground.
export default [
  // 1: a drone swarm: tiny low flyers that zap. Counter: anything that hits a low flyer every swing (cavalry, legion, saw bots) or a mage's lightning; slow grenades and arrows miss the swarm.
  { n: 1, map: 'blank', enemy: [{ type: 'drone', n: 30, x: 0.6, y: 0.42 }] },
  // 2: laser bots: a 260 px beam that sweeps a line and sets fire. Counter: close in fast, they stand still to fire and only bonk up close (cavalry, saw bots, boars), or out-range it (snipers, archers, crossbows); shield bots' domes stop the beams.
  { n: 2, map: 'blank', enemy: [{ type: 'laserbot', n: 10, x: 0.6, y: 0.42, w: 0.04, h: 0.3 }] },
  // 3: saw bots roll in front of laser bots (a saw run ploughs through a crowd and out the far side). Counter: halberds set against the saw runs, or shoot from range (snipers, mages, crossbows); archers and boars get sawn apart.
  { n: 3, map: 'canyon', enemy: [
    { type: 'sawbot', n: 8, x: 0.8, y: 0.42, w: 0.04, h: 0.2 },
    { type: 'laserbot', n: 8, x: 0.6, y: 0.42, w: 0.04, h: 0.2 },
  ] },
  // 4: shield bots dome a line of laser bots. Counter: the domes stop every shot, not feet: melee walks in (cavalry, saw bots, legion, boars); riflemen and crossbows waste their bullets on the domes.
  { n: 4, map: 'playground', enemy: [
    { type: 'laserbot', n: 10, x: 0.75, y: 0.42, w: 0.04, h: 0.25 },
    { type: 'shieldbot', n: 4, x: 0.6, y: 0.42, w: 0.03, h: 0.25 },
  ] },
  // 5: a mech kept alive by repair bots (+25 hp/s each), laser bots beside it, on the rim above the crater. Counter: riders and boars run down the welders and lasers first (cavalry, boars), snipers from range, or giants that out-hit the welding.
  { n: 5, map: 'volcano', enemy: [
    { type: 'mech', n: 1, x: 0.42, y: 0.16 },
    { type: 'repairbot', n: 4, x: 0.3, y: 0.16, w: 0.04, h: 0.05 },
    { type: 'laserbot', n: 6, x: 0.53, y: 0.16, w: 0.04, h: 0.05 },
  ] },
  // 6: a suicide wave over the snow above the frozen lake: bomb bots and magnet bots run in while laser bots fire from behind a scrap wall under shield domes. Counter: riders catch the runners in the open (cavalry), snipers or mages on the lasers; a slow tight block takes every blast.
  { n: 6, map: 'lake',
    terrain: [{ kind: 'wall', pts: [[0.63, 0.06], [0.63, 0.22]], r: 10 }],
    enemy: [
      { type: 'bombbot', n: 14, x: 0.82, y: 0.14, w: 0.05, h: 0.06 },
      { type: 'magnetbot', n: 4, x: 0.72, y: 0.14, w: 0.04, h: 0.05 },
      { type: 'laserbot', n: 8, x: 0.55, y: 0.14, w: 0.04, h: 0.06 },
      { type: 'shieldbot', n: 3, x: 0.45, y: 0.14, w: 0.03, h: 0.04 },
    ] },
  // 7: the factory: walls with a gate, two mechs with repair bots inside, laser bots in the corners, saw bots and a shield dome at the gate. Counter: jetpacks fly over the walls, snipers pick off the lasers from beyond the beam; riders at the gate meet the saws; catapult boulders barely dent the mechs.
  { n: 7, map: 'blank',
    terrain: [
      { kind: 'wall', pts: [[0.2, 0.18], [0.75, 0.18], [0.75, 0.37]], r: 12 },
      { kind: 'wall', pts: [[0.75, 0.53], [0.75, 0.72], [0.2, 0.72]], r: 12 },
    ],
    enemy: [
      { type: 'mech', n: 2, x: 0.45, y: 0.45, w: 0.05, h: 0.15 },
      { type: 'repairbot', n: 4, x: 0.3, y: 0.45, w: 0.03, h: 0.15 },
      { type: 'laserbot', n: 6, x: 0.62, y: 0.28, w: 0.04, h: 0.06 },
      { type: 'laserbot', n: 6, x: 0.62, y: 0.62, w: 0.04, h: 0.06 },
      { type: 'sawbot', n: 8, x: 0.85, y: 0.45, w: 0.03, h: 0.12 },
      { type: 'shieldbot', n: 3, x: 0.68, y: 0.45, w: 0.02, h: 0.08 },
    ] },
  // 8: the whole robot army: a drone cloud, saw bots and bomb bots in front, magnet bots, laser bots behind shield domes, two mechs with repair bots. Counter: riders and legion through the domes with crossbows or snipers behind; slow archers and grenades lose.
  { n: 8, map: 'playground', enemy: [
    { type: 'drone', n: 24, x: 0.9, y: 0.42, w: 0.04, h: 0.25 },
    { type: 'sawbot', n: 10, x: 0.82, y: 0.42, w: 0.03, h: 0.25 },
    { type: 'bombbot', n: 10, x: 0.75, y: 0.42, w: 0.03, h: 0.25 },
    { type: 'magnetbot', n: 4, x: 0.68, y: 0.42, w: 0.02, h: 0.25 },
    { type: 'laserbot', n: 12, x: 0.6, y: 0.42, w: 0.04, h: 0.25 },
    { type: 'shieldbot', n: 4, x: 0.52, y: 0.42, w: 0.02, h: 0.25 },
    { type: 'mech', n: 2, x: 0.4, y: 0.42, w: 0.04, h: 0.2 },
    { type: 'repairbot', n: 4, x: 0.3, y: 0.42, w: 0.03, h: 0.15 },
  ] },
];
