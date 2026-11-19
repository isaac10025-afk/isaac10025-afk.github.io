// Campaign: dinos world, 8 battles (STEP9.md level format). Owner: LEVELS-A.
// Boxes are fractions of the enemy half (x 0 = back edge, 1 = midline); every box was checked on the 3 screen shapes:
// all units placed, none in deep water, none on lava (the volcano's crater and river move with the screen shape).
export default [
  // 1. A raptor pack. Counter: ninjas (they dash through the pack) or legion (a pinned shield-bearer still fights);
  //    riflemen get pounced.
  { n: 1, map: 'blank', enemy: [{ type: 'raptor', n: 8, x: 0.55, y: 0.42, w: 0.08, h: 0.3 }] },
  // 2. Triceratops. Counter: legion (a braced shield bounces the charge and dazes it); a loose crowd gets gored.
  { n: 2, map: 'blank', enemy: [{ type: 'trike', n: 4, x: 0.55, y: 0.42, w: 0.06, h: 0.3 }] },
  // 3. Ankylosaurs hold the canyon bridges, spitters behind them. Counter: grenadiers (blasts go through the shell that
  //    bullets bounce off); riflemen lose, flamers are slow.
  { n: 3, map: 'canyon', enemy: [
    { type: 'ankylo', n: 3, x: 0.8, y: 0.45, w: 0.05, h: 0.3 },
    { type: 'spitter', n: 10, x: 0.5, y: 0.45, w: 0.06, h: 0.3 } ] },
  // 4. Pterodactyls over a raptor pack on the beach. Counter: riflemen (melee can't reach a flyer, archers miss it).
  { n: 4, map: 'beach', enemy: [
    { type: 'ptero', n: 6, x: 0.45, y: 0.5, w: 0.08, h: 0.1 },
    { type: 'raptor', n: 8, x: 0.75, y: 0.5, w: 0.06, h: 0.12 } ] },
  // 5. Stegosaurs and triceratops lead over the top of the volcano, spitters behind. Counter: riflemen in front of them
  //    (a stego's tail only sweeps behind it, a charge runs into the bullets).
  { n: 5, map: 'volcano', enemy: [
    { type: 'stego', n: 3, x: 0.72, y: 0.18, w: 0.08, h: 0.04 },
    { type: 'trike', n: 2, x: 0.5, y: 0.18, w: 0.06, h: 0.04 },
    { type: 'spitter', n: 10, x: 0.3, y: 0.3, w: 0.08, h: 0.1 } ] },
  // 6. A T-Rex with raptors, pteros and spitters in the swamp. Counter: riflemen (the pteros overhead need guns);
  //    melee armies can't reach them and run out of time.
  { n: 6, map: 'swamp', enemy: [
    { type: 'trex', n: 1, x: 0.4, y: 0.45 },
    { type: 'raptor', n: 5, x: 0.7, y: 0.2, w: 0.08, h: 0.05 },
    { type: 'raptor', n: 5, x: 0.6, y: 0.7, w: 0.08, h: 0.05 },
    { type: 'ptero', n: 4, x: 0.5, y: 0.18, w: 0.08, h: 0.04 },
    { type: 'spitter', n: 8, x: 0.25, y: 0.3, w: 0.06, h: 0.06 } ] },
  // 7. A long-neck with trikes, stegos, ankylos and pteros in the canyon, two walls in front. Counter: a big rifle line
  //    (the pteros need guns, the long-neck's stomp only hits what is close) or grenadiers for the shells.
  { n: 7, map: 'canyon', terrain: [{ kind: 'wall', pts: [[0.85, 0.3], [0.85, 0.42]], r: 12 }, { kind: 'wall', pts: [[0.85, 0.58], [0.85, 0.7]], r: 12 }],
    enemy: [
      { type: 'longneck', n: 1, x: 0.4, y: 0.45 },
      { type: 'trike', n: 3, x: 0.7, y: 0.45, w: 0.05, h: 0.2 },
      { type: 'stego', n: 2, x: 0.55, y: 0.25, w: 0.05, h: 0.05 },
      { type: 'ankylo', n: 2, x: 0.55, y: 0.66, w: 0.05, h: 0.05 },
      { type: 'ptero', n: 4, x: 0.3, y: 0.22, w: 0.08, h: 0.05 } ] },
  // 8. Every dinosaur on the volcano, coming over the top of the crater. Counter: a big rifle line (grenadiers work too:
  //    the armour doesn't stop blasts).
  { n: 8, map: 'volcano', enemy: [
    { type: 'longneck', n: 1, x: 0.18, y: 0.3 },
    { type: 'trex', n: 1, x: 0.38, y: 0.2 },
    { type: 'trike', n: 3, x: 0.8, y: 0.18, w: 0.08, h: 0.04 },
    { type: 'stego', n: 2, x: 0.6, y: 0.16, w: 0.06, h: 0.04 },
    { type: 'ankylo', n: 2, x: 0.6, y: 0.27, w: 0.06, h: 0.04 },
    { type: 'raptor', n: 12, x: 0.85, y: 0.74, w: 0.06, h: 0.05 },
    { type: 'spitter', n: 12, x: 0.35, y: 0.42, w: 0.06, h: 0.1 },
    { type: 'ptero', n: 6, x: 0.15, y: 0.5, w: 0.06, h: 0.06 } ] },
];
