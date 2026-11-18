# ART.md: the POSTER PAINT look in the game (every art agent reads this first)

The user picked look **A POSTER PAINT** from `looks/look3.html` (2026-11-13). It must look like that page: a 7-year-old's
tempera painting on cream cartridge paper. Fat bristly brush strokes that run dry at the ends, colour fills that miss
their wobbly black outlines, a green scrubbed field, a red paint splat where a body falls, line boil (3 variants of
every sprite, swapped at 8 fps).

- Reference picture: `looks/shots3/solo-A.png` (whole phone screen) and `looks/shots3/crop-A-mid.png`.
- Reference code (read only, never edit `looks/`): `looks/src/kid-a.js` (all of look A) and `looks/src/engine.js`.
- The game: `game/` (plain ES modules, no build step). Read `ARCH.md` (sim layout, unit fields) and `GAPS.md`.
- The look must cover EVERY unit, prop, terrain tool, projectile and effect in the game, not only the ones on the look page.
  Units the look page never showed get new kid paintings in the same hand: same outline weight, same misregistered
  fills, same palette, same proportions (big head, stubby body, side view).

## Files and owners (own only your files; ask for anything else in your final reply under "Asks")

| file (game/src/render/art/) | owner |
|---|---|
| `paint.js` primitives + palette `C` (ported from kid-a.js) | LEAD (read only for you) |
| `people.js` `human()` painted person (ported kid-a human) | ARMY (MYTHICAL imports it) |
| `sprites-army.js` | ARMY |
| `sprites-animals.js` | ANIMALS |
| `sprites-myth.js` (mythical + props tree, barrel) | MYTHICAL |
| `index.js` `draw()` + `handleEvents` + `clear` + `prewarm` + `drawIcon` + `toolColor`, `sprites.js` (registry, bake cache), `ground.js`, `terrain.js`, `fx.js` | RENDER |
| `ui-paint.js` (painted UI images -> CSS vars), `game/index.html` (CSS), `game/src/ui/*.js` | UI |
| `game/src/main.js` | LEAD (already wired, see below) |
| `sheet.js`, `game/art-sheet.html`, `game/tools/shot.mjs` | LEAD (you may add query options to sheet.js) |

`main.js` already: imports `art/index.js` (if it exports `draw`) instead of `render/debug.js` unless the URL has `?debug`;
awaits `art/ui-paint.js` `paintUI()` before the toolbar is built; calls `renderer.handleEvents(events, world)` after each
draw, `renderer.clear()` on the clear button and when Team battle turns on (field wiped), `renderer.prewarm(tool, teams)`
on every tool pick, and `renderer.drawIcon(ctx, tool, 102, 82)` for toolbar / count / report icons.

## Sprite modules (ARMY, ANIMALS, MYTHICAL)

Each exports `SPRITES = { <type>: entry, ... }` with one entry per type id from `ARCH.md` (army: rifle flamer sniper legion
grenadier archer cavalry ninja + spawned knight horse; animals: boar rat ant ape gator piranha snake cheetah + spawned
apecav soldierant anthill frog; mythical: zombie slime mage giant dragon necro + spawned skeleton; props: tree barrel).
`risen_<type>` copies are NOT entries: RENDER paints the base type with `o.risen = true` (see below).

```js
rifle: {
  box: [w, h, ax, ay],   // sprite box in sim px; (ax, ay) = the anchor = the unit's (x, y) on the ground (feet)
  scale: 1,              // drawn size at the def radius (RENDER multiplies by u.radius / def.radius for size jitter)
  own: '#1f57d8',        // paint colour when NOT in Team battle (see the colour table)
  poses: ['idle', 'walk0', 'walk1', 'atk'],   // first = default; walk0/walk1 alternate while moving; atk optional
  paint(c, o) { ... },   // paint ONE frame, facing RIGHT, feet at (0,0), up = -y
  // optional:
  flying: true,          // drawn raised by u.z with a ground shadow (dragon)
  lie: 'side' | 'none',  // how the corpse lies: default 'side' = RENDER rotates the dead frame -90 deg onto its back
  extra: ['prone', ...], // more pose names RENDER may ask for (document when in the entry comment)
  drawUnit(ctx, u, x, y, flip, k, t, api) { ... return true }  // per-frame custom draw for multi-part units only
                                                              // (snake body chain, rider + horse...). api.get(type, pose, col, opts) returns a baked sprite.
}
```

`o` passed to `paint`: `{ R, M, pose, col, dead, risen, v, type, u0 }`
- `R` seeded random (use it for EVERY random choice so the same key paints the same), `M` misregistration (`part()` uses it).
- `col` the clothing / team colour to paint with (team colour in Team battle, else `own`).
- `dead`: `false` | `'dead'` (X eyes, limp) | `'burnt'` (everything charcoal `C.char` / `C.charL`, like kid-a's burnt corpses).
- `risen`: `true` = a zombie copy of this type: paint skin / fur `C.zskin`, eyes as kid-a's zombie face. RENDER also lays a
  light green wash over it. Humans: pass `C.zskin` as `human()`'s skin argument.
- `v` boil variant 0..2 (already mixed into the seed; you rarely need it).

Sizes: 1 sim px = 1.075 css px; a phone draws ~2.15 device px per sim px. A rifle is radius 9.5 sim px and the kid-a soldier
(about 14 wide, 30 tall) fits it at `scale: 1`. Scale every other type by its def radius (`ui/tools.js` FALLBACK has them
all: rat 5, ant 5.7, piranha 4.6, boar 14.8, cavalry 14.9, gator 16.5, giant 20.9, dragon 20.9...). Small units must still read
at 2.15 px/sim px: fewer, fatter strokes, big eyes, bold silhouettes, no detail under ~1.5 sim px.

Facing: RENDER flips the sprite by the sign of cos(heading). Paint side views only.

Colour table (`own`, used outside Team battle; every type must read apart from the others and from the green grass):

| type | own | type | own | type | own |
|---|---|---|---|---|---|
| rifle | `#1f57d8` blue | boar | natural browns | zombie | clothes `#7d6a9e`, skin `C.zskin` |
| flamer | `#ff8a12` orange | rat | natural greys | slime | `#7ee0c8` mint (not grass green) |
| sniper | `#55606e` slate | ant / soldierant / anthill | natural `#3a2a22` / red-brown | mage | `#8d4fd6` purple |
| legion | `#e3241a` red | ape / apecav | natural brown-black | giant | `#c47a3a` ochre |
| grenadier | `#8b5a2b` brown | gator | `#3f9c4a` with yellow belly, thick ink | dragon | `#d23b66` magenta |
| archer | `#0f9c8c` teal | piranha | `#e85a7a` pink-red | necro | `#2a2140` plum |
| cavalry / knight / horse | armour `C.greyL`, cloth `#ffd51e` | snake | `#9ac21f` lime with bands | skeleton | bones `C.white` |
| ninja | `#26222e` black | cheetah | `C.cheetah` (kid-a) | tree / barrel | kid-a tree / `C.brown` |

Team battle: `col` = `C.red` (left team) or `C.blue` (right team). People wear it as clothes; animals wear it as a painted
scarf or band (kid-a cheetah), so their natural colours stay.

Poses: read OG's renderer for your units (`reference/og-src/game.js`, the draw code is roughly lines 18500-22400; your
`reference/og/units-*.md` names the states). Give every visual state OG shows a pose or a `drawUnit` branch: e.g. sniper
prone, archer drawing, grenadier throwing, cavalry rider on horse / knight unseated, ape climbing,
frog tongue, slime sizes, giant throw, dragon flap, mage spell, necro raising. Unit fields to read are in `ARCH.md`
(`state, anim {walk, atk, hit}, attack, hatless, prone, hidden, climb, perch, leaping, z, burning, stun, b.*`).
Document in the entry comment which field picks which pose so RENDER can wire it; if a pose needs RENDER logic, ask.

## RENDER rules
- Same contract as `render/debug.js`: `draw(ctx, world, view, alpha)`; also export `drawIcon(ctx, tool, w, h)`, `toolColor(tool)`,
  `theme` (for main.js: `theme.red/blue/outline`), and the hooks above.
- The main canvas is WebGL2 through `render/gl2d.js` (a Canvas 2D look-alike: one batch a frame), canvas 2D with `?gl=0` / no WebGL2.
  Draw only with the subset it answers (transforms, globalAlpha, 'lighter', drawImage, fillRect, lines / arcs / ellipses with
  stroke + fill). A canvas the field draws from must tell `gpu.js` what changed (`touched()`), atlas pages use `pageCanvas()`.
- A frame is only `drawImage` of baked sprites + a few cached layers. Painting happens at bake time, lazily, spread over frames
  (budget a few ms per frame), with `prewarm(tool)` baking the picked tool's sprites ahead. No allocation per unit per frame.
- Target: 300 painted units at 60 fps on a phone; 400 fighting units smooth in desktop Chrome.

## Checks
- `node tests/run.mjs` must stay 239/239 (add your own tests if you like; never break others).
- Sprite sheet: `cd game && node tools/shot.mjs "art-sheet.html?only=army" /path/out.png 1400 900 1` (waits for the sheet,
  prints page errors), then look at the PNG. `?type=rifle&scale=4` for one type. Look at EVERY sprite you make, at 3x and
  in the game-size crowd strip, and compare with `looks/shots3/solo-A.png`. Fix anything that doesn't read.
- Kill only PIDs you started. No git here (plain folder; backup in `.backup/`). Never touch `looks/` or `reference/`.
- Final reply: what you made, what you checked (with the PNG paths), gaps, and Asks.
