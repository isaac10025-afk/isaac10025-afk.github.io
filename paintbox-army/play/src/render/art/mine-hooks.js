// Unit maker art hooks (OURS, Part 2 step 8, STEP8.md). Owner: LEAD. No imports, so every art module can import it
// without a cycle. The mine art modules (loaded by sprites.js with the other sprite modules) fill these in at import:
//  - MINE.entry(type) -> sprite entry | null     ART-BODY (sprites-mine.js): the entry for a made type 'mine_<id>',
//                                               built from its recipe (sim/maker recipeOf). sprites.js entOf() calls
//                                               it the first time it meets the type; dropType(type) forgets it again.
//  - GEAR[id]   weapon / ability gear art       ART-WEAPONS (gear-weapons.js), ART-ABILITY (gear-abilities.js); the body
//                                               draws it at its anchor (STEP8.md "Art contract").
//  - ICON[id](ctx, w, h)                        picker icons for every weapon and ability (same two owners).
//  - OVER[id](ctx, u, bag, X, Y, flip, S, now, world)   per-frame extra drawing a weapon / ability needs beyond its
//                                               projectiles (a beam, a spark line, a field): the sim agent that built
//                                               it, in its own fx-mine-<agent>.js. The body's over() calls it.
export const MINE = { entry: null };
export const GEAR = Object.create(null);
export const ICON = Object.create(null);
export const OVER = Object.create(null);
