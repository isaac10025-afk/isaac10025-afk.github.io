// Campaign: bugs world, 8 battles (STEP9.md level format). Owner: LEVELS-C.
// Beehives are homes (not for sale): each one sends out bees while enemies are near (up to 12 alive), and a hit on it
// bursts 4 bees out at the attacker. No mines here: bugs aren't trained, they would walk into their own.
export default [
  // 1. A bee swarm. Counter: fire (a flamer): bees burn easily and the fire jumps through the swarm.
  { n: 1, map: 'blank', enemy: [{ type: 'bee', n: 24, x: 0.6, y: 0.5, w: 0.1, h: 0.2 }] },
  // 2. A few beetles. Counter: blades or fire (legionaries, flamers): their armour takes bullets and arrows at 0.4.
  { n: 2, map: 'blank', enemy: [{ type: 'beetle', n: 5, x: 0.6, y: 0.5, w: 0.05, h: 0.25 }] },
  // 3. Mantises in front, spiders behind. Counter: shoot the mantises before they lunge in (snipers, crossbows), or
  //    shields that soak the slashes (legionaries).
  { n: 3, map: 'swamp', enemy: [
    { type: 'mantis', n: 8, x: 0.45, y: 0.5, w: 0.05, h: 0.25 },
    { type: 'spider', n: 6, x: 0.22, y: 0.5, w: 0.04, h: 0.25 },
  ] },
  // 4. Beehives behind a beetle line. Counter: shields and blades (legionaries) walk through the stings and cut down
  //    beetles and hives alike; arrows (beetle armour) and grenades (bees are tiny and quick) fail here.
  { n: 4, map: 'village', enemy: [
    { type: 'beehive', n: 3, x: 0.22, y: 0.5, w: 0.04, h: 0.3 },
    { type: 'beetle', n: 4, x: 0.58, y: 0.5, w: 0.04, h: 0.2 },
    { type: 'bee', n: 10, x: 0.4, y: 0.5, w: 0.06, h: 0.1 },
  ] },
  // 5. Stink bugs, bombardiers and mosquitoes. Counter: machines (magnet bots, laser bots, a mech): no blood for a
  //    mosquito, no nose for the stink; or snipers that never let them close.
  { n: 5, map: 'canyon', enemy: [
    { type: 'stinkbug', n: 6, x: 0.8, y: 0.5, w: 0.04, h: 0.25 },
    { type: 'bombardier', n: 6, x: 0.6, y: 0.5, w: 0.04, h: 0.25 },
    { type: 'mosquito', n: 16, x: 0.35, y: 0.5, w: 0.06, h: 0.2 },
  ] },
  // 6. A walled nest: beetles at the gap, mantises and spiders by the walls, bombardiers and bees inside. Counter: shields
  //    and blades through the gap (legionaries) or crossbow bolts; grenades and flames do badly here.
  { n: 6, map: 'swamp',
    terrain: [
      { kind: 'wall', pts: [[0.4, 0.15], [0.4, 0.4]], r: 12 },
      { kind: 'wall', pts: [[0.4, 0.6], [0.4, 0.85]], r: 12 },
    ],
    enemy: [
      { type: 'beetle', n: 4, x: 0.45, y: 0.5, w: 0.03, h: 0.12 },
      { type: 'mantis', n: 6, x: 0.58, y: 0.27, w: 0.05, h: 0.08 },
      { type: 'spider', n: 6, x: 0.58, y: 0.73, w: 0.05, h: 0.08 },
      { type: 'bombardier', n: 6, x: 0.3, y: 0.5, w: 0.04, h: 0.2 },
      { type: 'bee', n: 16, x: 0.15, y: 0.5, w: 0.06, h: 0.15 },
    ] },
  // 7. The castle hive: hives and spiders in the courtyard, mantises and beetles at the gate, stink bugs and mosquitoes
  //    out front behind a barricade. Counter: mechs (machines don't mind the stink or the mosquitoes, and their rockets
  //    reach over the walls) or snipers.
  { n: 7, map: 'castle',
    terrain: [
      { kind: 'wall', pts: [[0.9, 0.3], [0.9, 0.42]], r: 10 },
      { kind: 'wall', pts: [[0.9, 0.58], [0.9, 0.7]], r: 10 },
    ],
    enemy: [
      { type: 'beehive', n: 2, x: 0.4, y: 0.5, w: 0.03, h: 0.12 },
      { type: 'spider', n: 5, x: 0.52, y: 0.5, w: 0.03, h: 0.12 },
      { type: 'mantis', n: 6, x: 0.86, y: 0.3, w: 0.04, h: 0.08 },
      { type: 'beetle', n: 4, x: 0.86, y: 0.7, w: 0.04, h: 0.08 },
      { type: 'stinkbug', n: 6, x: 0.7, y: 0.17, w: 0.08, h: 0.04 },
      { type: 'mosquito', n: 14, x: 0.7, y: 0.83, w: 0.08, h: 0.04 },
    ] },
  // 8. The whole colony: all eight. Hives at the back, bees and mosquitoes in the air, beetles and mantises in front,
  //    spiders, bombardiers and stink bugs between. Counter: mechs (no blood, no nose: the mosquitoes and the stink do
  //    nothing to a machine; rockets and stomps break the swarms).
  { n: 8, map: 'village', enemy: [
    { type: 'beehive', n: 3, x: 0.12, y: 0.5, w: 0.03, h: 0.4 },
    { type: 'bee', n: 24, x: 0.3, y: 0.3, w: 0.08, h: 0.1 },
    { type: 'mosquito', n: 14, x: 0.3, y: 0.7, w: 0.08, h: 0.1 },
    { type: 'stinkbug', n: 6, x: 0.48, y: 0.25, w: 0.05, h: 0.1 },
    { type: 'bombardier', n: 6, x: 0.48, y: 0.75, w: 0.05, h: 0.1 },
    { type: 'spider', n: 6, x: 0.5, y: 0.5, w: 0.04, h: 0.15 },
    { type: 'mantis', n: 8, x: 0.7, y: 0.3, w: 0.05, h: 0.1 },
    { type: 'beetle', n: 5, x: 0.7, y: 0.75, w: 0.04, h: 0.1 },
  ] },
];
