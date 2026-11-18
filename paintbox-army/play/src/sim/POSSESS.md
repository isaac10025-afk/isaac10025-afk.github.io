# POSSESS.md: driving a unit (Part 2 step 3, OURS)

`sim/systems/possess.js`. The player takes over one unit. The unit keeps its own brain, so it attacks with its own
weapon and moves (dragon breath, ape barrel throw, gator hold...). The player picks where it goes and what it attacks.

- Tick: `possessPre` after morale (no fleeing, no reaction delay, target = the enemy in the aim while the attack is
  held, else none), `possessPost` after brain (stick replaces the goal, aim replaces the facing; attack held with the
  stick let go = the brain's own moves). Nobody possessed = both do nothing and draw no random numbers.
- Game API: `possessed`, `unitAt(x, y, r)`, `possess(u)`, `release()`, `setPossessInput({mx, my, aim, aimX, aimY, fire, tap})`.
- `world.handOver(from, to)`: call it wherever a unit turns into another in place (rider thrown -> rider, mount ->
  cavalry, curse -> frog). Turned into a zombie = released ('turned').
- Unit hooks, all optional, in the def (copied to 'keep' risen copies):
  - `possessFire(world, u, aim, ax, ay)`: attack held with nobody in the aim (horse: trample). Without it: gun units
    use the shared gun rule (shoot the ground), others an empty swing.
  - `possessMove(world, u, mx, my, firing)`: every tick; hoppers redirect their hop at takeoff (slime, frog).
  - `possessSpeed`: stick speed (default runSpeed; while attacking, the brain's speed if faster).
  - A brain can read `u.possessed === 1`, `attackHeld(world)`, `aimAngle(world, u)` (necro, frog do).
- New units (step 4+): add a case to `tests/possess.test.mjs` only if the generic path can't attack with it.
