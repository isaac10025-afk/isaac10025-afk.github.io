# RIG.md: floppy bodies (Part 2 step 1, OURS not OG)

Read `ART.md` first (the look, sprite entries, bake keys). This adds **floppy bodies**: a unit is drawn as separate painted
parts turned about joints that are springs, so walks wobble, weapons swing with weight, hits knock the body about, and dead
bodies flop. The user asked for "the 2D version of TABS". The sim is NOT touched by any of this (drivers only read unit
fields). Flying bodies (a killed unit's corpse flies along the killing blow / blast) are done in the sim already
(`sim/combat/death.js` fling + run) and drawn by `index.js` drawCorpses: you don't need to do anything for that.

## How it works (built + working for people: rifle flamer sniper legion grenadier archer ninja knight)

1. **Parts are extra poses of the entry**, named `'r:<part>'` (e.g. `'r:leg'`, `'r:body'`, `'r:head'`, `'r:arm:aim'`). Add
   them to the entry's `extra` list. `paint(c, o)` paints ONE part when `o.pose` starts with `'r:'`, **in its rest place in
   the whole figure** (feet at 0,0, facing right, same coordinates as the whole sprite). Drawn with no turn, all the parts
   together must look like the whole sprite. Parts are baked and trimmed to their painted pixels automatically.
   Dead / burnt / risen / team colour / boil variants work exactly as for whole sprites (o.dead, o.risen, o.col, o.v).
2. **`rig` on the entry**: `{ driver: '<name>', parts(poseName, zom) { return {...} | null }, ...anything your driver needs }`.
   `parts()` says which parts draw for an entry pose (`zom` = a risen copy). Return `null` = draw this pose whole (e.g.
   sniper prone). Every string value must be a pose name of the entry (resolved once to an index and cached:
   `RIG.partsOf`); `null` values become `-1` (no such part); numbers pass through. If a named part is missing, the pose
   draws whole.
3. **A driver** turns the parts every frame: `RIG.register(name, { alive(ent, rp, u, I), body(ent, rp, id, t, air, now) })`
   in `rig.js` (lead) or your own `rig-*.js`. `rp` = the resolved parts (indices). Use the helpers in `rig.js`:
   - `fresh(slot, u, now)`, `inputs(slot, u, now, flip)` -> `IN { dt, ax, hit, hitPow, atkStart }` (dt = sim time since the
     last frame, 0 when paused: springs freeze in pause and slow with slow-motion later).
   - `spring(slot, i, target, [k, c], dt, lim)` (12 springs a unit: `i` 0..11), `kick(slot, i, dv)`, `setAngle`.
   - `rotAbout(px, py, ang, tx, ty)` / `squashAbout(px, py, sx, sy, ang)` set `M`; `keep(T)` copies M into a parent;
     `putM(pose)` outputs M; `putIn(pose, T)` outputs T·M (child inside parent); `inP(T)` makes M = T·M; `put(pose, a..f)`.
   - Output order = draw order (back to front). Up to 24 parts.
   - `I = { slot, now, flip, moving, cyc (strides walked: a full leg cycle = 2), z (height), ph (0..1 per unit), rt (real
     time), run }`. Angles are in the entry's facing-right frame: + = clockwise on screen = the top leans FORWARD.
   - `body(...)`: the dead body in its own frame; index.js turns it onto its back / tumbles it. `t` = s since it died (or
     landed, if it flew), `air` = still flying (flail). Settle with `flop(end, t)` to a resting angle from `h01(id, k)`.
     No body() = the dead frame is drawn whole (old way).
   - `alive()` returns true when it filled OUT; false = whole sprite this frame.
4. Drivers already there: **'biped'** (people; read `bipedAlive` / `bipedBody` in rig.js and `man()` in
   sprites-army.js as the worked example) and **'wobble'** (one whole sprite that tilts and squashes with motion, hits and
   attacks: `rig: { driver: 'wobble', parts: (pose) => ({ main: pose }), wobble: { tilt: 1, squash: 1, sway: 0 } }`).
5. Not rigged (drawn whole, as before): a unit wading (waterline cut), a victim in a gator's jaws, entries with
   `drawUnit` (your drawUnit can call `api.get` + `api.put` with your own transforms if you want parts there).

## The feel (what the user should see)

TABS: bodies are floppy and a bit silly. Heads bob and lag, tails and necks swing after the body, limbs swing with the
stride, a hit knocks the body back and it wobbles back up, big things jiggle when they land, dead things go limp in a heap
(limbs splayed, head lolled). Springs with damping ratio ~0.2-0.3 (they overshoot 2-3 times). Never stiff, never noisy
jitter. Keep every OG cue that the whole sprites show (attack poses, wings, jaws, frog tongue...): the parts carry them.

## Rules

- Own only your files (below). Never edit `index.js`, `rig.js`, `sprites.js`, `ground.js`, `gpu.js`, `gl2d.js`, the sim,
  or another agent's files. Need something there? Put a local workaround in your file and list it under **Asks**.
- Numbers you invent are ours (no OG source): put them in one named table at the top of your driver file.
- No allocation per unit per frame in a driver (no objects, arrays, strings, closures). Typed arrays / BANK only.
- Small units (radius under ~6: rat, ant, piranha, soldier ant) don't get limbs (they wouldn't read at 2 px per sim px):
  give them 'wobble' (or a 2-part body + head if it reads).
- Performance: 300-400 units must stay smooth on a phone. Measure draw JS with your types before/after
  (`node tools/drawjs.mjs boar,cheetah,...` from `game/`: same frozen battle, `?rig=0` vs on). Rigged should cost at most ~2x the whole
  sprite's draw JS for the same battle.
- No git. Kill only PIDs you started. Don't touch `looks/` or `reference/`.

## Checks

- `cd ~/Desktop/work/paint-battle && node tests/run.mjs` must stay all-pass (252 on 11-14).
- `cd game && node tools/floppy-shot.mjs <outDir> <typeA,typeB> [rows]`: a small team battle at 3x, shots over 11 s
  (0-hold = rest pose before START: compare with the whole sprites; then fighting, deaths, bodies painted into the
  ground). Look at every shot; crop + zoom where needed (python3 PIL). Prints page errors.
- `?rig=0` in the URL (or `PB_RIG=0` for tools/battle-shot.mjs) = whole sprites, for A/B.
- `node tools/battle-shot.mjs shots <dir>`: every type, both teams, phone + desktop, no page errors.
- Art sheet: `node tools/shot.mjs "art-sheet.html?only=<group>" out.png 1400 900 1` shows every pose incl. the 'r:' parts.

## Files (owner)

| file | owner |
|---|---|
| `rig.js`, `index.js`, `sprites.js`, `ground.js`, `people.js` human() + humanLeg/leanOf/hasBack/humanJoints, `sprites-army.js` foot entries | LEAD |
| `rig-quad.js` (new), `sprites-animals.js`, `people.js` horse() + rider() + their helpers, `sprites-army.js` **cavalry + horse entries only** | ANIMALS |
| `rig-myth.js` (new), `sprites-myth.js` (zombie slime mage giant dragon necro skeleton tree barrel) | MYTHICAL |

`index.js` imports `rig-quad.js` and `rig-myth.js` (they exist as empty stubs): register your drivers there.
