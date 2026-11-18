// Unit maker art (OURS, Part 2 step 8, STEP8.md "Art contract"). Owner: ART-BODY. Contract: ART.md + RIG.md.
// MINE.entry(type) -> a rigged POSTER PAINT entry for a made unit 'mine_<id>', built from its recipe (sim/maker recipeOf):
// one of 4 bodies x 12 colours x 5 sizes x 12 hats, holding its weapon and wearing its abilities' gear.
//   person  the army's painted person (people.js human() body + head, humanLeg legs), clothes in the colour
//   giant   the giant's frame (sprites-myth.js giant, copied: big tunic in the colour, bare legs + boots, hunched head)
//   animal  a four-legged beast like the boar / cheetah: coat in the colour, lighter belly, darker patches, ears, snout
//   beast   a big heavy four-legged dino-like animal (trike-sized): pillar legs, plated back, blocky head, thick tail
// Colour: `own` = the recipe colour. Team battle: people and giants wear the team colour (o.col) with a badge in their own
// colour on the chest; animals and beasts keep their coat and wear a team scarf. Size: entry `scale` = body scale x the
// size step (the def radius already has the size in it, so RENDER's k stays ~1).
// Hats (12, every body): drawn in the head part, so they ride the head; o.hatless / o.singed (bake o.bare) = messy hair.
// Looks: o.dead 'dead' = X eyes, limp (rig body(); bodies lie 'side', animals 'none': on their back); 'burnt' = all
// charcoal; o.risen = zombie skin / coat (people C.zskin, animals the coat mixed toward it) + zombie face, the weapon
// kept (risenMode 'keep'); 'bone' = bone white. Ghost ability = the ghost look: pale colours, a wisp instead of legs.
//
// Poses. The floppy drivers in rig-mine.js ('mine2' two legs, 'mine4' four legs) pose every frame straight from the
// sim: u.b.act (sim/maker/lib.js ACT code: every weapon code < 20 and ability code >= 20 has a pose, built per hold class
// in POSE2 / POSE4 + ACT2 / ACT4 below) and u.attack (the weapon's attack 1 -> 0: animated from the hold class's wind-up
// keyframe atk0 to its strike atk1; melee classes wind up to atk0 while engaged with the cooldown nearly done).
// Whole poses (the fallback while parts bake, wading, ?rig=0, the toolbar icon): idle; hold (ACT.HOLD with b.victim: jaws
// round a victim, drawn whole as the trex: entry holds(u) + mouth); under (ACT.UNDER: a dirt mound; burrowers only).
// Every other pose is the rig's only: RENDER queues a whole frame for each pose it shows while parts bake, and a made
// unit's whole frame costs all its parts. pick(u, info): under, hold, else RENDER's default (idle).
// Hold classes (catalog.js hold, + heavy split by group): gun (two hands, the back hand on the barrel), pistol (one hand;
// revolvers: one in each hand), bow (drawn by the back hand), throw (overhand from behind the head), cast (staff up,
// both arms up / thrust), swing (one-hand overhead cut), pole (two-hand thrust; the ram too), heavy (two-hand smash:
// club, anchor), heavygun (ballista, missiles, cannon: on the hip, big recoil), heavythrow (boulder: overhead heave),
// mouth (bite / breath: head lunge, jaws open), head (butt), fist (guard + jab, both hands gloved), tail (tail swing /
// rear turn). Animals + beasts: gun / pistol / bow / throw / cast / heavygun / heavythrow strapped on the back (kicks
// back when it fires), swing / pole / heavy held in the mouth (head swing / thrust), fist = the near fore paw swipes.
//
// Gear (mine-hooks.js GEAR, ART-WEAPONS + ART-ABILITY): GEAR[id] = { at?, box: [w, h, ax, ay], paint(c, o), behind?,
// root? } in sim px for a person at size 1. paint() paints with the anchor / main grip at (0, 0), the weapon along +x,
// gear up = -y. ART-BODY scales it per body (person 1, giant 1.7, animal 0.95-1, beast 1.3-1.35) and bakes it as a rig
// part at its anchor (never painted per frame): held = the front hand (people) / the back strap or the mouth (animals);
// at 'mouth' | 'head' (root?: 'snout' | 'centre' moves the root there) | 'tail' (a tail weapon on an animal replaces its
// own tail) | 'fist' (people: both hands) | 'back' (behind: true = behind the body; move abilities' wings flap while
// it flies) | 'feet' | 'hand2' (the off hand; animals: the flank). o = { R, M, body, col (clothes / team colour), own
// (recipe colour), dead, risen, ghost, v, pose: 'idle' | 'atk' }. 'atk' frames show while the weapon attacks / fires
// (weapon) or, for ability gear, its own `acts` codes / `air` (else any ability pose). Gear hints read: hand2 / hand2A
// (where the back hand grips a two-handed weapon), pair (a second copy in the back hand / on both fists), poses ('atk'
// missing = one weapon part; 'loose' bow after the shot, 'aim' bombs lit, 'ladle' oil pot out of pots (wb.pots <= 0)),
// root, hidesHat (no hat), behind; the shell's closed 'atk' frame is drawn over everything. Missing gear: a simple
// placeholder per hold class (weapons only). over(): OVER[weapon] and OVER[each ability] with their bags (u.b.wb, u.b.ab[i]), each in its own
// try / catch. MINE.preview(ctx, recipe, w, h, t): the maker's live preview of an unsaved recipe (idle / walk / attack,
// 2 s each), the same parts and emit as the game. paintHat(c, col, M): the knocked-off hat (fx.js), HAT_AT frame.
import { C, TAU, tone, brush, ring, poly, part, fill, outline, shift, dab, tube, spark, rng, hash, M0, tooth, canvas, hexRgb, rgbHex } from './paint.js';
import { human, humanLeg } from './people.js';
import { MINE, GEAR, OVER } from './mine-hooks.js';
import { recipeOf, cleanRecipe, SIZES, COLORS, WEAPONS, ABILITIES } from '../../sim/maker/index.js';
import { ACT } from '../../sim/maker/lib.js';
import { V2, V4, ACTN, emit2, emit4, pose2, pose4, partsAll, anchors2, anchors4, AID, AP, ANCHOR_N } from './rig-mine.js';

export const SPRITES = {};   // no static types: made units come from MINE.entry

// ---------------------------------------------------------------- shared helpers
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const GHOST_SKIN = '#eef4f6';
function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function onBack(c, h, fn) { c.save(); c.translate(0, -h); c.scale(1, -1); fn(); c.restore(); }
function xEye(c, x, y, s, R) {
  brush(c, [[x - s, y - s], [x + s, y + s]], Math.max(0.55, s * 0.6), C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], Math.max(0.55, s * 0.6), C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
/** An animal eye: white with a pupil (reads on every coat colour). Dead: X. Zombie: milky, pupil adrift. */
function eyeW(c, L, x, y, r) {
  const R = L.R;
  if (L.dead) { xEye(c, x, y, r * 0.9, R); return; }
  if (L.zom) { dab(c, x, y, r * 1.1, '#e7edd6', R); dab(c, x + r * 0.4, y + r * 0.35, r * 0.4, C.ink, R); return; }
  dab(c, x, y, r, C.white, R); dab(c, x + r * 0.35, y + r * 0.05, r * 0.55, C.ink, R);
}
/** Team scarf round an animal's neck (kid-a cheetah): band + flapping end, ink edged so it reads on any coat. */
function scarf(c, L, band, end, w) {
  if (!L.team) return;
  const R = L.R, k = L.burnt ? C.charL : L.team;
  tube(c, band, w, k, R, 0.7);
  if (end) tube(c, end, w * 0.7, k, R, 0.6);
}
/** Badge in the own colour on a person's chest in Team battle (its identity stays readable). */
function badge(c, L, x, y, r) {
  if (!L.team || L.burnt || sameCol(L.team, L.own)) return;
  part(c, ring(x, y, r, r, L.R, 0.1, 7), L.own, L.M, { lw: 0.9 });
}

// ---------------------------------------------------------------- hats (person head frame: centre (0.5, -22.9), r 5.6)
const HAT_C = { helmet: '#6f7d45', crown: C.yellow, pirate: '#2a2430', cowboy: '#8b5a2b', tophat: '#26222e', party: C.pink, wizard: C.purple, viking: '#a9b0b6', chef: C.white, flower: '#ff6fae' };
function hatPaint(c, kind, L, own) {
  const R = L.R, M = L.M, B = L.burnt, k = (x) => (B ? C.char : x), a = (x) => (B ? C.charL : x);
  const flat = { bristles: 2, dry: 0.1, taper: 0 };
  switch (kind) {
    case 'helmet':
      part(c, poly([[-5.9, -23.4], [-5.5, -27.4], [-2, -30], [2.8, -30.1], [6.5, -27.5], [7.1, -23.4]], R, 0.3), k(HAT_C.helmet), M);
      brush(c, [[-6.9, -23.3], [0.5, -22.9], [8.3, -23.4]], 1.7, C.ink, R, { bristles: 3, dry: 0.2 });
      if (!B) dab(c, -1.8, -27.6, 0.85, tone(HAT_C.helmet, 0.4), R);
      return;
    case 'crown':
      part(c, poly([[-4.8, -25.4], [-5.8, -32], [-2.8, -28.6], [0.6, -33.6], [3.8, -28.6], [6.8, -32.2], [6.1, -25.4]], R, 0.15), k(C.yellow), M, { lw: 1.35, sharp: true });
      if (!B) { dab(c, 0.6, -27.3, 1.15, C.red, R); dab(c, -3, -27.1, 0.8, C.blue, R); dab(c, 4.3, -27.2, 0.8, '#2fae63', R); for (const [x, y] of [[-5.8, -32], [0.6, -33.6], [6.8, -32.2]]) dab(c, x, y, 0.6, C.white, R); }
      return;
    case 'pirate': {   // tricorn: black, gold trim, a white skull (as sprites-pirates.js tricorn, big)
      const g = a('#e8b93a');
      part(c, poly([[-9.4, -27.4], [-5.8, -24], [0.6, -23.4], [6.8, -23.8], [9.8, -27.2], [6, -27], [4.2, -31.4], [0.4, -32.6], [-3.2, -31.8], [-5.2, -27.4]], R, 0.25), k(HAT_C.pirate), M, { lw: 1.4 });
      brush(c, [[-9, -27.2], [-5.2, -27.4]], 0.95, g, R, flat); brush(c, [[6, -26.8], [9.4, -27]], 0.95, g, R, flat);
      brush(c, [[-5.6, -24.5], [0.6, -24], [6.6, -24.3]], 0.95, g, R, flat);
      if (!B) { dab(c, 0.6, -28.8, 1.6, C.white, R); dab(c, 0.6, -27.3, 0.95, C.white, R); dab(c, 0, -29, 0.4, C.ink, R); dab(c, 1.2, -29, 0.4, C.ink, R); }
      return;
    }
    case 'cowboy':   // felt crown with a dent + a wide curled brim (as sprites-secret.js cowHat)
      part(c, poly([[-4.6, -26.4], [-4.4, -31.6], [-2.6, -33.8], [-0.4, -32.6], [1.6, -34], [4.2, -33.4], [5.6, -31.2], [5.8, -26.4]], R, 0.2), k(HAT_C.cowboy), M, { lw: 1.2 });
      brush(c, [[-4.6, -28], [0.6, -27.6], [5.8, -28]], 1.6, a('#3b2414'), R, flat);
      part(c, poly([[-10.4, -29], [-7.2, -26.8], [0.6, -26], [8.2, -26.6], [11.6, -29.2], [10, -25.2], [0.6, -24.2], [-9, -25]], R, 0.18), k(tone(HAT_C.cowboy, -0.1)), M, { lw: 1.2 });
      return;
    case 'tophat':
      part(c, poly([[-4, -26.8], [-4.5, -37.4], [5.6, -37.6], [5.2, -26.8]], R, 0.2), k(HAT_C.tophat), M, { lw: 1.35 });
      brush(c, [[-4.2, -28.8], [0.6, -28.6], [5.4, -28.8]], 1.7, a(C.red), R, flat);
      part(c, ring(0.6, -26.4, 8.2, 1.7, R, 0.08, 9), k(HAT_C.tophat), M, { lw: 1.2 });
      return;
    case 'party':
      part(c, poly([[-4.4, -26.2], [0.8, -38.6], [6.2, -26.4]], R, 0.15), k(HAT_C.party), M, { lw: 1.3, sharp: true });
      if (!B) { brush(c, [[-2.6, -30], [4.6, -30.6]], 1.2, C.yellow, R, flat); brush(c, [[-0.8, -34], [2.8, -34.4]], 1.1, C.blue, R, flat); }
      dab(c, 0.8, -39.2, 1.7, a(C.white), R); dab(c, 0.8, -39.2, 0.9, a(C.yellow), R);
      return;
    case 'wizard':   // the mage's pointy hat: brim, bent tip, a yellow star
      part(c, ring(0.8, -27.4, 8.2, 1.9, R, 0.08, 9), k(tone(HAT_C.wizard, -0.25)), M, { lw: 1.3 });
      part(c, poly([[-4.4, -27.8], [5.8, -28], [2.8, -35.6], [-2.6, -42.6], [-1.6, -35]], R, 0.3), k(HAT_C.wizard), M);
      if (!B) spark(c, 0.9, -32.4, 1.8, R);
      return;
    case 'viking':
      for (const s of [-1, 1]) {   // two horns curling up and out (far one first, a shade darker)
        const x0 = s < 0 ? -4.4 : 5.4, pts = [[x0, -26.8], [x0 + s * 3.2, -28.6], [x0 + s * 4.6, -32.4], [x0 + s * 3.4, -35.4]];
        tube(c, pts, 1.9, B ? C.charL : s < 0 ? '#e8dcbc' : '#fbf1d6', R, 0.8);
      }
      part(c, poly([[-5.8, -23.6], [-5.4, -27.4], [-2, -30], [2.8, -30.1], [6.4, -27.5], [7, -23.6]], R, 0.3), k(HAT_C.viking), M);
      brush(c, [[-6.6, -23.6], [0.5, -23.2], [8, -23.6]], 1.6, a(C.brownL), R, { bristles: 3, dry: 0.15 });
      if (!B) for (const x of [-3.6, 0.6, 4.8]) dab(c, x, -24.6, 0.45, C.ink, R);
      return;
    case 'chef':
      part(c, poly([[-4.4, -25.2], [-4.2, -28.6], [5.4, -28.8], [5.6, -25.2]], R, 0.2), k(C.white), M, { lw: 1.2 });
      for (const [x, y, r] of [[-2.8, -31.4, 3.3], [4.6, -31.4, 3.1], [0.9, -33.2, 3.8]]) part(c, ring(x, y, r, r * 0.9, R, 0.12, 8), k(C.white), M, { lw: 1.1 });
      return;
    case 'flower':   // a big flower stuck on the head, leaning forward
      brush(c, [[1.6, -27.6], [2.4, -30.4], [3.6, -32.2]], 0.9, a(C.leaf), R, { bristles: 2, dry: 0.1 });
      fill(c, poly([[2, -29.6], [-0.6, -30.8], [0.4, -28.8]], R, 0.1), a(C.leafL), R, { sharp: true, edge: 0 });
      for (let i = 0; i < 5; i++) { const an = i / 5 * TAU + 0.3; dab(c, 3.8 + Math.cos(an) * 2.1, -33.6 + Math.sin(an) * 2.1, 1.65, a(HAT_C.flower), R); }
      dab(c, 3.8, -33.6, 1.35, a(C.yellow), R); dab(c, 3.5, -33.9, 0.5, a(C.orange), R);
      return;
    case 'cap': {   // baseball cap in the unit's own colour, the peak forward
      const cc = k(own);
      part(c, poly([[-5.6, -24.4], [-5.2, -27.8], [-2, -30], [2.8, -30], [6, -27.6], [6.4, -24.6]], R, 0.25), cc, M, { lw: 1.35 });
      part(c, poly([[5, -25.8], [11.8, -25.2], [11.4, -23.6], [5.4, -24]], R, 0.15), B ? C.char : tone(own, -0.22), M, { lw: 1.1, sharp: true });
      dab(c, 0.4, -30.2, 0.8, B ? C.charL : tone(own, -0.3), R);
      return;
    }
  }
}
/** Hat on a head: person-frame hat moved so the person's head centre lands on hc, scaled s, tilted ang. */
function hatOn(c, L, H) {
  const kind = L.E.hat;
  if (kind === 'none' || L.bare || L.E.noHat) return;
  c.save(); c.translate(H.hc[0], H.hc[1]); c.rotate(H.tilt || 0); c.scale(H.hs, H.hs); c.translate(-0.5, 22.9);
  hatPaint(c, kind, L, L.own);
  c.restore();
}

// ---------------------------------------------------------------- bodies: joints (sprite px, facing right, feet at 0,0)
// two legs: J for rig-mine.js emit2 (+ hc / hs / tilt: the hat; mouth, headTop, snout, centre: head gear roots)
const J_PERSON = { k: 1, hip: [0, -8], legX: 1.8, legL: 8, neck: [0.5, -17.6], sF: [1.6, -16.6], sB: [-1.4, -16.2], LA: 6.6,
  hand: [8.2, -16.6], hand2: [5.2, -16.2], back: [-4.4, -17.6], tail: [-4.4, -9.6], feet: [0.4, 0], mouth: [4.6, -19.2], headTop: [3.4, -27.9],
  snout: [5.8, -21.6], centre: [0.5, -22.9], hc: [0.5, -22.9], hs: 1, gs: 1, wisp: [0, -9] };
const J_GIANT = { k: 1.9, hip: [0, -15], legX: 4.6, legL: 15, neck: [3.6, -38.4], sF: [5, -35], sB: [-5, -35], LA: 15,
  hand: [20, -35], hand2: [10, -35], back: [-10.6, -36], tail: [-11.4, -20], feet: [0, 0], mouth: [10.6, -40.2], headTop: [9, -51.6],
  snout: [12.4, -43.6], centre: [4.6, -44.6], hc: [4.8, -48.4], hs: 1.3, gs: 1.7, wisp: [0, -17] };
// four legs: J for emit4 (+ gear roots and scales: gsBack strapped weapons, gsMouth weapons in the mouth, gs other gear)
const J_ANIMAL = { k: 1, pivot: [-1, -11], hips: [[6, -8], [3.8, -8], [-7, -8], [-9.3, -8]], legL: 8, neck: [7.4, -14.2], tailRoot: [-11.6, -13],
  back: [-0.4, -18.4], rear: [-12.2, -12.4], paw: [6.9, -0.6], mouth: [17.4, -12.6], headTop: [12, -19.4], snout: [17.2, -13.6], centre: [11.2, -14.8],
  flank: [-1, -11.4], feet: [-1, 0], deadH: 19.5, hc: [11.4, -17.8], hs: 0.85, tilt: -0.12, gs: 0.95, gsBack: 1, gsMouth: 0.95 };
const J_BEAST = { k: 1.5, pivot: [-3, -15], hips: [[6, -12], [3.6, -12], [-11, -12], [-13.4, -12]], legL: 12, neck: [8.6, -18.4], tailRoot: [-14.6, -17.6],
  back: [-3, -26.4], rear: [-15.6, -16.8], paw: [6.9, -0.9], mouth: [26.6, -14.4], headTop: [17.4, -25.4], snout: [26, -18], centre: [16.6, -19.4],
  flank: [-3, -16.6], feet: [-3, 0], deadH: 27, hc: [15.4, -23.4], hs: 1.15, tilt: -0.1, gs: 1.3, gsBack: 1.35, gsMouth: 1.3 };

// ---------------------------------------------------------------- PERSON layers (people.js human(), plain kind)
function personLayer(c, L, name) {
  const R = L.R, M = L.M, J = J_PERSON;
  switch (name) {
    case 'r:leg': humanLeg(c, 'plain', M, L.burnt); return;
    case 'r:wisp': wisp(c, L, 0, -9.6, 5.2, 9.6); return;
    case 'r:body':
      human(c, 'maker', L.col, 'aim', M, L.dead, L.skin, { layer: 'body', risen: L.zom });
      if (!L.burnt) brush(c, [[-4.8, -9.6], [0, -9], [5, -9.6]], 1.4, tone(L.col, -0.35), R, { bristles: 3, dry: 0.2, taper: 0.1 });   // belt
      badge(c, L, 1.6, -13.4, 1.6);
      return;
    case 'r:head': case 'r:headO':
      human(c, 'maker', L.col, name === 'r:headO' && !L.dead ? 'fly' : 'aim', M, L.dead, L.skin, { layer: 'head', risen: L.zom, hatless: L.E.hat === 'none' || L.bare });
      hatOn(c, L, J);
      return;
    case 'r:armF': case 'r:armB': {
      const S = name === 'r:armF' ? J.sF : J.sB, x0 = S[0], y = S[1], LA = J.LA;
      brush(c, [[x0, y], [x0 + LA * 0.5, y + 0.5], [x0 + LA, y]], 1.45, C.ink, R, { bristles: 2, taper: 0.15, dry: 0.08 });
      dab(c, x0 + LA, y, 1.2, L.skin, R);
      return;
    }
    case 'r:mound': mound(c, L, 11, 7); return;
  }
}
// ---------------------------------------------------------------- GIANT layers (copied from sprites-myth.js giant: gLeg,
// gBody, gHead, gFrontArm; arms painted straight out along +x from the shoulder so the rig can turn them)
const G_LEG = [[0, -15], [1, -7], [2, -2.4]];
function giantLayer(c, L, name) {
  const R = L.R, M = L.M, J = J_GIANT, skin = L.skin;
  switch (name) {
    case 'r:leg':   // from sprites-myth.js gLeg
      tube(c, G_LEG, 5, skin, R, 1.4); part(c, ring(G_LEG[2][0] + 1.6, G_LEG[2][1] + 0.6, 4.2, 2.2, R, 0.1, 7), L.burnt ? C.char : C.brown, M, { lw: 1.3 });
      return;
    case 'r:wisp': wisp(c, L, 0, -17, 11, 17); return;
    case 'r:body': {   // from sprites-myth.js gBody: a big tunic with a belt, a strap and a patch
      const body = ring(0, -27, 12.4, 13, R, 0.07, 11, R() * 0.3);
      part(c, L.zom ? body.map(([x, y], i) => (y > -20 ? [x + (i % 2 ? 1 : -0.8), y + (i % 2 ? 2 : -0.4)] : [x, y])) : body, L.col, M, { lw: 1.8 });
      brush(c, [[-11.6, -19.8], [0, -18.4], [11.8, -20]], 2.2, L.burnt ? C.char : C.brown, R, { bristles: 3, dry: 0.15 });
      if (!L.burnt) { const pc = tone(L.col, -0.22); part(c, poly([[-6.6, -31], [-2.4, -31.4], [-2.2, -27], [-6.4, -26.8]], R, 0.3), pc, M, { lw: 1, sharp: true }); }
      brush(c, [[-3.4, -38.6], [2.6, -33], [9.6, -24]], 1.4, L.burnt ? C.char : tone(L.col, -0.3), R, { bristles: 2, dry: 0.2 });
      badge(c, L, 3.4, -28, 2.6);
      return;
    }
    case 'r:head': case 'r:headO': {   // from sprites-myth.js gHead: forward, hunched: tuft, ear, small eyes, big nose, mouth
      const hx = 4.6, hy = -44.6, open = name === 'r:headO' && !L.dead;
      part(c, ring(hx, hy, 7.2, 6.8, R, 0.08, 9), skin, M, { lw: 1.7 });
      part(c, ring(hx - 4.4, hy + 0.6, 1.8, 2.2, R, 0.1, 6), skin, M, { lw: 1.1 });
      if (!L.burnt && (L.E.hat === 'none' || L.bare)) for (let i = 0; i < 3; i++) brush(c, [[hx - 3 + i * 2.2, hy - 6], [hx - 3.8 + i * 2.6, hy - 9.6]], 1.1, L.zom ? C.ink : C.brown, R, { bristles: 2, dry: 0.1 });
      if (L.dead) { xEye(c, hx + 1.6, hy - 1.4, 0.95, R); xEye(c, hx + 4.6, hy - 1.4, 0.95, R); }
      else if (L.zom) { dab(c, hx + 4.6, hy - 1.8, 1.6, C.white, R); dab(c, hx + 4.9, hy - 1.7, 0.65, C.ink, R); dab(c, hx + 1.6, hy - 1.2, 0.75, C.ink, R); }
      else { dab(c, hx + 1.6, hy - 1.4, 0.76, C.ink, R); dab(c, hx + 4.6, hy - 1.4, 0.76, C.ink, R); brush(c, [[hx + 0.8, hy - 4.2], [hx + 3.6, hy - 3.2], [hx + 6.4, hy - 3.8]], 1.0, C.ink, R, { bristles: 2, dry: 0 }); }
      part(c, ring(hx + 7.4, hy + 1, 2.4, 2.1, R, 0.1, 7), skin, M, { lw: 1.2 });
      if (open) { part(c, ring(hx + 3.6, hy + 4.4, 2.4, 2, R, 0.1, 7), '#7a1610', M, { lw: 1 }); dab(c, hx + 3.2, hy + 3.2, 0.6, C.white, R); }
      else { brush(c, [[hx + 1.6, hy + 4.4], [hx + 4, hy + 4.8], [hx + 6, hy + 4.2]], 0.8, C.ink, R, { bristles: 2, dry: 0 }); if (!L.burnt) dab(c, hx + 3.4, hy + 5.4, 0.65, C.white, R); }
      hatOn(c, L, J);
      return;
    }
    case 'r:armF': case 'r:armB': {   // from sprites-myth.js gFrontArm, straightened out along +x
      const S = name === 'r:armF' ? J.sF : J.sB, x0 = S[0], y = S[1], LA = J.LA, w = name === 'r:armF' ? 4.2 : 4;
      tube(c, [[x0, y], [x0 + LA * 0.5, y + 0.9], [x0 + LA, y]], w, skin, R, 1.3);
      part(c, ring(x0 + LA, y, w * 0.76, w * 0.72, R, 0.1, 7), skin, M, { lw: 1.3 });
      return;
    }
    case 'r:mound': mound(c, L, 22, 12); return;
  }
}
// ---------------------------------------------------------------- ANIMAL layers (a boar / cheetah-like beast in the colour)
function animalLayer(c, L, name) {
  const R = L.R, M = L.M, J = J_ANIMAL, coat = L.coat, dark = L.burnt ? C.charL : tone(coat, -0.28), far = L.burnt ? C.char : tone(coat, -0.22);
  const belly = L.burnt ? C.charL : tone(coat, 0.38), paw = L.burnt ? C.ink : tone(coat, -0.5);
  switch (name) {
    case 'r:legN': case 'r:legF': {
      const h = name === 'r:legN' ? J.hips[0] : J.hips[1], col = name === 'r:legN' ? coat : far;
      tube(c, [[h[0], h[1]], [h[0] + 0.5, h[1] + 4], [h[0] + 0.8, -0.9]], 2.7, col, R, 1.05);
      dab(c, h[0] + 1.3, -0.8, 1.45, paw, R);
      return;
    }
    case 'r:tail': {
      const t = J.tailRoot, pts = [[t[0] + 0.6, t[1]], [t[0] - 3.4, t[1] - 1.8], [t[0] - 5.8, t[1] - 5], [t[0] - 5, t[1] - 7.6]];
      tube(c, pts, 1.9, coat, R, 1);
      dab(c, pts[3][0], pts[3][1], 1.5, dark, R);
      return;
    }
    case 'r:wisp': wisp(c, L, -1, -8, 8, 8); return;
    case 'r:body': {
      part(c, ring(-1, -11.8, 11.4, 6.3, R, 0.07, 11, -0.04), coat, M);
      brush(c, [[-8.6, -7.4], [-1, -6.6], [6, -7.6]], 2.1, belly, R, { taper: 0.5, dry: 0.4 });
      if (!L.burnt && !L.ghost) for (const [x, y, r] of [[-6, -13.6, 1.7], [-1.2, -15, 1.4], [3.6, -13, 1.2]]) dab(c, x + (R() - 0.5) * 0.6, y + (R() - 0.5) * 0.6, r, dark, R);
      if (L.zom) for (let i = 0; i < 3; i++) brush(c, [[-5 + i * 2.8, -14.4], [-4.4 + i * 2.8, -11.4], [-5 + i * 2.8, -8.6]], 0.6, tone(C.zskinD, -0.45), R, { bristles: 2, dry: 0.15 });
      if (L.E.strap) strap(c, L, [[-3.4, -17.4], [-2, -11], [-2.6, -6.4]], 1.5);
      scarf(c, L, [[7.2, -17.4], [8.4, -13], [7.6, -8.4]], [[8, -10], [5.2, -6]], 2.4);
      return;
    }
    case 'r:head': case 'r:headO': {
      const open = name === 'r:headO' && !L.dead;
      part(c, poly([[8.4, -17], [8.6, -21.6], [11.6, -18.2]], R, 0.15), coat, M, { lw: 1.15, sharp: true });   // ear
      part(c, ring(11.4, -14.9, 5.1, 4.5, R, 0.08, 9), coat, M);
      part(c, ring(15.4, -13.1, 2.8, 2.2, R, 0.1, 8), belly, M, { lw: 1.2 });   // snout
      dab(c, 17.7, -13.9, 0.85, C.ink, R);
      eyeW(c, L, 12.8, -16.4, 1.3);
      if (!L.dead && !L.zom) brush(c, [[11.2, -18.4], [14.2, -17.8]], 0.75, C.ink, R, { bristles: 2, dry: 0 });
      if (open) { part(c, ring(15.4, -10.6, 2.6, 1.6, R, 0.1, 7), '#b8333a', M, { lw: 0.9 }); for (const x of [14.2, 16.4]) dab(c, x, -11.8, 0.45, C.white, R); }
      else brush(c, [[13, -11.4], [15.2, -11], [17.2, -11.6]], 0.6, C.ink, R, { bristles: 2, dry: 0 });
      if (L.dead === 'dead') dab(c, 16.2, -10.4, 0.9, '#ef8fa0', R);
      hatOn(c, L, J);
      return;
    }
    case 'r:mound': mound(c, L, 14, 7.5); return;
  }
}
// ---------------------------------------------------------------- BEAST layers (trike-sized, dino-like, in the colour)
function beastLayer(c, L, name) {
  const R = L.R, M = L.M, J = J_BEAST, coat = L.coat, dark = L.burnt ? C.charL : tone(coat, -0.3), far = L.burnt ? C.char : tone(coat, -0.24);
  const belly = L.burnt ? C.charL : tone(coat, 0.4), nail = L.burnt ? C.charL : '#f6ead0';
  switch (name) {
    case 'r:legN': case 'r:legF': {   // a pillar leg (as sprites-dinos.js pillarLeg)
      const h = name === 'r:legN' ? J.hips[0] : J.hips[1], w = name === 'r:legN' ? 5.4 : 5.1, col = name === 'r:legN' ? coat : far;
      tube(c, [[h[0], h[1]], [h[0] + 0.6, h[1] * 0.45], [h[0] + 0.2, -w * 0.28]], w, col, R, 1.35);
      for (let i = 0; i < 3; i++) dab(c, h[0] + 0.4 + (i - 1) * w * 0.28 + w * 0.18, -w * 0.16, Math.max(0.6, w * 0.13), nail, R);
      return;
    }
    case 'r:tail': {
      const P = poly([[-14, -22.4], [-19.6, -20.6], [-25, -17.8], [-30.4, -14.2], [-32.6, -12.2], [-28, -12.2], [-22, -13.2], [-17.4, -13], [-14, -12.4]], R, 0.25);
      part(c, P, coat, M, { lw: 1.6 });
      if (!L.burnt && !L.ghost) for (let i = 0; i < 3; i++) dab(c, -19 - i * 4, -18.4 + i * 1.8, 1.1, dark, R);
      return;
    }
    case 'r:wisp': wisp(c, L, -3, -11, 13, 11); return;
    case 'r:body': {
      // plates along the back (behind the body's outline), the barrel body, belly band, spots
      if (!L.ghost) for (let i = 0; i < 5; i++) { const x = -13 + i * 5.2, y = -24.4 - Math.sin((i + 0.5) / 5 * Math.PI) * 2.2;
        part(c, poly([[x - 2.4, y + 2.6], [x - 0.4, y - 3.2], [x + 2.6, y + 2.4]], R, 0.15), L.burnt ? C.char : tone(coat, -0.18), M, { lw: 1.1, sharp: true }); }
      part(c, ring(-3, -17, 14.6, 9, R, 0.07, 11, -0.04), coat, M, { lw: 1.85 });
      brush(c, [[-13, -10.6], [-3, -9.2], [7, -10.6]], 3.1, belly, R, { taper: 0.4, dry: 0.35, bristles: 4 });
      if (!L.burnt && !L.ghost) { for (let i = 0; i < 5; i++) dab(c, -12 + i * 4.6 + R(), -20.4 - Math.sin((i + 0.5) / 5 * Math.PI) * 1.6 + R() * 0.8, 1, dark, R);
        for (let i = 0; i < 3; i++) brush(c, [[-9 + i * 5.4, -16.6 + R()], [-10.4 + i * 5.4, -14 + R()]], 0.75, dark, R, { bristles: 2, dry: 0.3 }); }
      if (L.zom) for (let i = 0; i < 4; i++) brush(c, [[-9 + i * 3.4, -20.6], [-8.2 + i * 3.4, -17], [-9 + i * 3.4, -13.4]], 0.65, tone(C.zskinD, -0.45), R, { bristles: 2, dry: 0.15 });
      if (L.E.strap) strap(c, L, [[-6.4, -25.6], [-4.6, -16], [-5.2, -8.6]], 2);
      scarf(c, L, [[7.4, -24.4], [9.8, -17.6], [8.6, -10.8]], [[8.6, -14], [4.6, -9.6]], 3.2);
      return;
    }
    case 'r:head': case 'r:headO': {
      const open = name === 'r:headO' && !L.dead;
      if (open) part(c, poly([[13, -14.4], [20, -13], [25.4, -13.6], [24.4, -9.8], [18, -9.4], [13.4, -11.6]], R, 0.15), coat, M, { lw: 1.4 });   // dropped jaw
      part(c, poly([[7, -23.2], [12.6, -25.8], [19.6, -25], [24.6, -21.8], [27.6, -17.6], [26.6, -14], [20.6, -12.8], [13.6, -12.6], [8.6, -15], [6.6, -19.4]], R, 0.2), coat, M, { lw: 1.7 });
      brush(c, [[11.6, -24.6], [15.6, -25.6], [19.4, -24.4]], 1.6, dark, R, { bristles: 3, dry: 0.2, taper: 0.2 });   // brow ridge
      eyeW(c, L, 15.8, -20.4, 1.75);
      if (!L.dead && !L.zom) brush(c, [[13.6, -23], [17.8, -22.4]], 0.9, C.ink, R, { bristles: 2, dry: 0 });
      dab(c, 25, -19.8, 0.8, C.ink, R);   // nostril
      if (open) { part(c, ring(19.6, -12.4, 4.2, 1.6, R, 0.1, 8), '#b8333a', M, { lw: 0.9 }); for (let i = 0; i < 4; i++) dab(c, 15.6 + i * 2.6, -13.4, 0.55, C.white, R); }
      else { brush(c, [[16, -14.6], [21, -14], [26, -15]], 0.75, C.ink, R, { bristles: 2, dry: 0 }); if (!L.burnt) for (const x of [19.4, 23.2]) dab(c, x, -13.6, 0.5, C.white, R); }
      if (L.dead === 'dead') dab(c, 23.4, -12, 1.1, '#ef8fa0', R);
      hatOn(c, L, J);
      return;
    }
    case 'r:mound': mound(c, L, 22, 11); return;
  }
}
/** The strap of a weapon worn on an animal's back (round its middle). */
function strap(c, L, pts, w) { brush(c, pts, w, L.burnt ? C.ink : C.brown, L.R, { bristles: 3, dry: 0.15, taper: 0.05 }); }
/** A ghost's wisp instead of legs: a pale tapering tail of sheet swaying under the body. (x, y) = its top middle. */
function wisp(c, L, x, y, w, h) {
  const R = L.R, col = L.burnt ? C.char : L.ghostCol;
  const P = poly([[x - w * 0.9, y - h * 0.2], [x + w * 0.9, y - h * 0.2], [x + w * 0.7, y + h * 0.45], [x + w * 0.15, y + h * 0.95], [x - w * 0.35, y + h * 0.7], [x - w * 0.9, y + h * 0.35]], R, 0.3);
  fill(c, shift(P, L.M.mx, L.M.my, L.M.grow), col, R, { vary: 0.06 });
  outline(c, P.slice(1, 6), R, 1.2, { gap: true, over: 0 });
}
/** A dirt mound (ACT.UNDER: burrowed), a tuft of the unit's colour poking out of the top. */
function mound(c, L, w, h) {
  const R = L.R, M = L.M, dirt = L.burnt ? C.char : '#8a5a33';
  part(c, poly([[-w, 0], [-w * 0.72, -h * 0.62], [-w * 0.22, -h], [w * 0.34, -h * 0.94], [w * 0.8, -h * 0.5], [w, 0]], R, 0.3), dirt, M, { lw: 1.5 });
  if (!L.burnt) { for (let i = 0; i < 5; i++) dab(c, -w * 0.6 + i * w * 0.3 + R(), -h * (0.25 + 0.4 * R()), w * 0.09 + 0.4, '#6b4426', R);
    brush(c, [[-w * 0.15, -h * 0.95], [0, -h * 1.25], [w * 0.15, -h * 0.95]], Math.max(1.4, w * 0.16), L.own, R, { bristles: 3, dry: 0.2 }); }
}

// ---------------------------------------------------------------- placeholders (until ART-WEAPONS' GEAR lands), per class
// Same frame as GEAR: grip / root at (0, 0), weapon along +x (gear up = -y), person size.
const PH = {
  gun: { box: [20, 8, 6, 4], paint(c, o) { const R = o.R, b = o.dead === 'burnt'; brush(c, [[-5.4, 1.4], [0.4, -0.2]], 2.7, b ? C.char : C.brown, R, { taper: 0.1, bristles: 4 }); brush(c, [[-0.4, -0.4], [11.6, -1.6]], 1.75, C.ink, R, { taper: 0.05, bristles: 3 }); if (o.pose === 'atk' && !b) spark(c, 13, -1.8, 2, R); } },
  pistol: { box: [10, 6, 2, 3], paint(c, o) { const R = o.R; brush(c, [[0, 0], [-0.6, 2.6]], 1.6, C.ink, R, { bristles: 2, taper: 0 }); brush(c, [[-1, -0.8], [5, -0.9]], 1.6, C.ink, R, { bristles: 2, taper: 0 }); if (o.pose === 'atk' && o.dead !== 'burnt') spark(c, 6.4, -1, 1.6, R); } },
  bow: { box: [8, 22, 3, 11], paint(c, o) { const R = o.R, drawn = o.pose === 'atk'; brush(c, [[-1, -9.6], [1.4, -5], [1.9, 0], [1.4, 5], [-1, 9.6]], 1.7, o.dead === 'burnt' ? C.char : C.brown, R, { taper: 0.1, bristles: 3 }); brush(c, drawn ? [[-1, -9.6], [-8, 0], [-1, 9.6]] : [[-1, -9.6], [-1.2, 0], [-1, 9.6]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); if (drawn) { brush(c, [[-8, 0], [5, 0]], 0.8, C.brownL, R, { bristles: 2, dry: 0, taper: 0 }); dab(c, 5.4, 0, 0.9, C.ink, R); } } },
  throw: { box: [8, 10, 4, 6], paint(c, o) { const R = o.R; dab(c, 0.6, -1, 2.7, C.ink, R); dab(c, -0.4, -2, 0.7, '#6d6d6d', R); brush(c, [[1.6, -3.4], [2.8, -5.6]], 0.8, C.brown, R, { bristles: 2, dry: 0 }); if (o.dead !== 'burnt') spark(c, 3, -6.2, 1.8, R); } },
  cast: { box: [22, 6, 8, 3], paint(c, o) { const R = o.R; brush(c, [[-7.6, 0], [9, 0]], 1.6, o.dead === 'burnt' ? C.char : C.brown, R, { taper: 0.1, bristles: 3 }); part(c, ring(10.4, 0, 2.1, 2.1, R, 0.1, 7), o.pose === 'atk' ? '#9ff0ff' : '#58c8f0', o.M, { lw: 1.1 }); } },
  swing: { box: [16, 6, 3, 3], paint(c, o) { const R = o.R; tube(c, [[1.4, 0], [12.4, 0]], 1.1, o.dead === 'burnt' ? C.charL : C.greyL, R, 0.5); brush(c, [[-1.8, 0], [1.4, 0]], 1.5, C.ink, R, { bristles: 2, taper: 0 }); brush(c, [[1.4, -2], [1.4, 2]], 1.1, C.ink, R, { bristles: 2, dry: 0 }); } },
  pole: { box: [32, 8, 10, 4], paint(c, o) { const R = o.R; tube(c, [[-9.4, 0], [15.4, 0]], 1.05, o.dead === 'burnt' ? C.char : C.brownL, R, 0.5); part(c, poly([[15, -1.6], [21.2, 0], [15, 1.6]], R, 0.1), o.dead === 'burnt' ? C.charL : C.greyL, o.M, { lw: 0.9, sharp: true }); } },
  heavy: { box: [24, 10, 4, 5], paint(c, o) { part(c, poly([[-3, -1.2], [8, -2], [14, -3.4], [18.6, -3.8], [20.6, -1.6], [20.6, 1.6], [18.6, 3.8], [14, 3.4], [8, 2], [-3, 1.2]], o.R, 0.3), o.dead === 'burnt' ? C.char : C.brownL, o.M, { lw: 1.4, ang: 0 }); } },
  heavygun: { box: [20, 8, 7, 4], paint(c, o) { const R = o.R; tube(c, [[-6, -1], [11, -1.4]], 3, o.dead === 'burnt' ? C.char : C.greyD, R, 1); dab(c, 11.6, -1.4, 1.3, C.ink, R); if (o.pose === 'atk' && o.dead !== 'burnt') spark(c, 13.6, -1.4, 2.6, R); } },
  heavythrow: { box: [12, 12, 6, 9], paint(c, o) { part(c, ring(0, -3.2, 4.8, 4.2, o.R, 0.14, 9), o.dead === 'burnt' ? C.char : C.grey, o.M, { lw: 1.4 }); } },
  mouth: { at: 'mouth', box: [8, 6, 2, 3], paint(c, o) { const R = o.R; brush(c, [[-1, 0], [1.4, 0.4], [3.8, 0]], 1.2, '#b8333a', R, { bristles: 2, dry: 0 }); for (let i = 0; i < 3; i++) dab(c, -0.4 + i * 1.4, -0.5, 0.42, C.white, R); } },
  head: { at: 'head', box: [10, 10, 4, 8], paint(c, o) { const R = o.R; for (const s of [0, 3.4]) tube(c, [[-1.6 + s, 0.6], [-0.6 + s, -3], [1.8 + s, -5.6]], 1.1, o.dead === 'burnt' ? C.charL : '#f6ead0', R, 0.6); } },
  fist: { at: 'fist', box: [6, 6, 3, 3], paint(c, o) { part(c, ring(0.6, 0, 1.9, 1.7, o.R, 0.1, 7), o.dead === 'burnt' ? C.char : C.red, o.M, { lw: 0.9 }); } },
  tail: { at: 'tail', box: [14, 8, 13, 4], paint(c, o) { const R = o.R; tube(c, [[0.6, 0], [-5, 0.8], [-10, -0.6]], 2, o.dead === 'burnt' ? C.char : '#5b8f3c', R, 0.8); for (const x of [-6, -9]) brush(c, [[x, -0.8], [x - 1.2, -3.4]], 1, '#f6ead0', R, { bristles: 2, taper: 0.8 }); } },
};
const HOLD_AT = { mouth: 'mouth', head: 'head', fist: 'fist', tail: 'tail' };
const ANCHORS = new Set(['mouth', 'head', 'tail', 'fist', 'back', 'feet', 'hand2']);
function poseClass(row) {
  const h = row.hold, id = row.id, grp = row.group;
  if (id === 'ram') return 'pole';
  if (h === 'heavy') return grp === 'gun' ? 'heavygun' : grp === 'throw' ? 'heavythrow' : 'heavy';
  return PH[h] ? h : 'swing';
}
const QBACK = new Set(['gun', 'pistol', 'bow', 'throw', 'cast', 'heavygun', 'heavythrow']);   // animals: strapped on the back
/** Reach of a gear (px from its root to the farthest box corner, at scale 1). */
function reachOf(g) { const b = g && Array.isArray(g.box) ? g.box : [16, 8, 4, 4]; return Math.max(Math.hypot(b[2], b[3]), Math.hypot(b[0] - b[2], b[3]), Math.hypot(b[2], b[1] - b[3]), Math.hypot(b[0] - b[2], b[1] - b[3])); }

// ---------------------------------------------------------------- pose tables
// Two legs: hold class -> { idle, walk, atk0, atk1, <ACT name>: ... } (fields: rig-mine.js V2; unspecified = the class's
// idle; the default idle = arms hanging). dx / dy in person px (giants x J.k), bh in gear px (x J.gs).
const NaN_ = NaN;
const D2 = { lean: 0, hd: 0, aF: 1.25, aB: 1.4, sF: 1, sB: 1, wA: 0.35, bh: NaN_, dx: 0, dy: 0, rot: 0, leg: 0, ta: 0, fl: 0, sq: 0, wv: 1, ho: 0, ga: 0 };
const POSE2 = {
  gun: { idle: { aF: 0.15, wA: -0.02, bh: 4.5 }, walk: { aF: 0.62, wA: -0.75, bh: 4 },
    atk0: { aF: -0.05, wA: -0.34, dx: -1, lean: -0.07, bh: 4.5, wv: 2 }, atk1: {},
    AIM: { aF: 0.1, wA: 0, lean: 0.05 }, FIRE: { wv: 2, wA: -0.04 }, RELOAD: { aF: 0.9, wA: -1.35, bh: NaN_, aB: 1.0 }, BEAM: { wv: 2, lean: 0.06 }, SPRAY: { wv: 2 } },
  pistol: { idle: { aF: 0.35, wA: 0.05, aB: 1.35 }, walk: { aF: 1.0, wA: 0.7 },
    atk0: { aF: -0.32, wA: -0.8, sF: 1.05, wv: 2 }, atk1: { aF: 0, wA: -0.03, sF: 1.1 },
    AIM: { aF: 0, wA: 0, sF: 1.12, lean: 0.03 }, FIRE: { aF: -0.05, wA: -0.1, sF: 1.1, wv: 2 }, RELOAD: { aF: 0.95, wA: -1.4, aB: 0.55, sB: 0.85 }, BEAM: { aF: 0, wA: 0, sF: 1.12, wv: 2 } },
  bow: { idle: { aF: 0.2, wA: 0, bh: -3.2 }, walk: { aF: 1.0, wA: 0.55, bh: NaN_, aB: 1.35 },
    atk0: { aF: 0.02, wA: -0.03, bh: -9, wv: 2 }, atk1: { aF: 0.05, wA: 0, bh: NaN_, aB: 2.7, sB: 0.95, wv: 3 },
    AIM: { aF: 0, wA: -0.04, bh: -9, wv: 2, lean: -0.03 }, RELOAD: {} },
  throw: { idle: { aF: -2.1, sF: 0.9, wA: -1.6, aB: 0.35, sB: 0.95 }, walk: { aF: -2.0, sF: 0.9, wA: -1.5, aB: 0.9 },
    atk0: { aF: -2.8, wA: -2.4, lean: -0.15, aB: -0.05, sB: 1.05 }, atk1: { aF: 0.55, wA: 0.6, lean: 0.14, aB: 1.6, wv: 0 },
    WIND: { aF: -2.85, wA: -2.5, lean: -0.17, aB: -0.1, sB: 1.05, wv: 3 }, THROW: { aF: 0.55, wA: 0.6, lean: 0.14, aB: 1.6, wv: 0 }, RELOAD: { aF: 1.2, sF: 0.8, wA: 0.6, aB: 1.3 }, AIM: { aF: -2.85, wA: -2.5, lean: -0.17, aB: -0.1, wv: 3 } },
  cast: { idle: { aF: 0.55, wA: -1.5, aB: 1.25 }, walk: { aF: 0.6, wA: -1.45, aB: 1.2 },
    atk0: { aF: -1.35, wA: -1.6, aB: -1.5, lean: -0.08, wv: 2 }, atk1: { aF: -0.1, wA: -0.15, aB: -0.25, lean: 0.12, wv: 2 },
    CAST: { aF: -1.5, wA: -1.55, aB: -1.7, wv: 2, lean: -0.05 }, CHANNEL: { aF: -0.25, wA: -0.35, aB: -0.3, sB: 1.05, wv: 2 }, AIM: { aF: -0.25, wA: -0.35, aB: -0.3, wv: 2 } },
  swing: { wind: 1, idle: { aF: 0.6, wA: -1.15, aB: 1.0 }, walk: { aF: 0.95, wA: -2.0, aB: 1.2 },
    atk0: { aF: -2.3, wA: -2.3, lean: -0.08, aB: 0.6 }, atk1: { aF: 0.65, wA: 0.55, lean: 0.15, aB: 1.5, dx: 0.8, wv: 2 },
    SPIN: { aF: 0, wA: 0, aB: 0.2, wv: 2 } },
  pole: { wind: 1, idle: { aF: 0.4, wA: -0.3, bh: -6 }, walk: { aF: 0.95, wA: -1.3, bh: -5 },
    atk0: { aF: 0.55, wA: -0.12, dx: -1.6, lean: -0.05 }, atk1: { aF: -0.05, wA: -0.02, dx: 1.8, lean: 0.2, sF: 1.15, wv: 2 },
    HOLD: { aF: 0.45, wA: -0.32, dy: 1.6, leg: 2, lean: 0.05 }, SWING: { aF: 0.9, wA: 0.9, bh: -5, lean: 0.25, wv: 2 }, WIND: { aF: -1.6, wA: -2.2, bh: -5, lean: -0.1 } },
  heavy: { wind: 1, idle: { aF: 1.0, wA: 0.95, bh: -4.5 }, walk: { aF: 1.05, wA: 1.1 },
    atk0: { aF: -2.0, wA: -2.6, lean: -0.15, dy: -0.5 }, atk1: { aF: 0.8, wA: 0.75, lean: 0.25, dy: 1.2, leg: 2, wv: 2 },
    SPIN: { aF: 0.1, wA: 0, wv: 2, leg: 2 } },
  heavygun: { idle: { aF: 0.35, wA: -0.06, bh: 5, lean: -0.04 }, walk: { aF: 0.45, wA: -0.2, bh: 5 },
    atk0: { aF: 0.2, wA: -0.36, dx: -2.2, lean: -0.14, wv: 2 }, atk1: {},
    AIM: { aF: 0.3, wA: -0.04, leg: 2 }, FIRE: { aF: 0.25, wA: -0.2, dx: -1.2, wv: 2 }, RELOAD: { aF: 1.0, wA: -1.2, bh: NaN_, aB: 0.9 } },
  heavythrow: { wind: 1, idle: { aF: -1.5, sF: 0.85, wA: 0, bh: 0.01 }, walk: {},
    atk0: { aF: -2.4, sF: 0.95, lean: -0.18 }, atk1: { aF: 0.2, lean: 0.2, wv: 0 }, WIND: { aF: -2.4, sF: 0.95, lean: -0.18 }, THROW: { aF: 0.2, lean: 0.2, wv: 0 } },
  mouth: { wind: 1, idle: { aF: 0.7, aB: 0.9, sF: 0.85, sB: 0.85, lean: 0.06 }, walk: { aF: 0.9, aB: 1.1, lean: 0.08 },
    atk0: { lean: -0.1, hd: -0.35, aF: 0.4, aB: 0.6 }, atk1: { lean: 0.4, hd: 0.3, dx: 2, ho: 1, aF: 0.1, aB: 0.25, sF: 1.1, sB: 1.1, wv: 2 },
    BREATH: { lean: 0.12, hd: -0.12, ho: 1, wv: 2 }, SPRAY: { lean: 0.12, hd: -0.12, ho: 1, wv: 2 }, HOLD: { lean: -0.05, hd: -0.25, ho: 1, aF: 0.2, aB: 0.3, wv: 2 } },
  head: { wind: 1, idle: { lean: 0.12, hd: 0.15, aF: 1.45, aB: 1.6 }, walk: { lean: 0.14 },
    atk0: { lean: -0.2, hd: -0.25, aF: 1.6, aB: 1.7, dx: -1 }, atk1: { lean: 0.55, hd: 0.35, dx: 2.4, aF: 2.0, aB: 2.1, wv: 2 },
    CHARGE: { lean: 0.45, hd: 0.3, aF: 2.2, aB: 2.4 } },
  fist: { wind: 1, fists: 1, idle: { aF: -0.3, sF: 0.64, aB: -0.4, sB: 0.6, lean: 0.04 }, walk: { aF: -0.3, aB: -0.4 },
    atk0: { aF: 0.05, sF: 0.55, lean: -0.04 }, atk1: { aF: -0.08, sF: 1.18, lean: 0.14, dx: 1.2, wv: 2 },
    combo0: { aF: -0.45, sF: 0.6, aB: -0.12, sB: 1.15, lean: 0.12, dx: 1, wv: 2 }, combo1: { aF: -0.08, sF: 1.18, aB: -0.6, sB: 0.55, lean: 0.14, dx: 1.2, wv: 2 },
    SWING: { aF: -1.2, sF: 1.05, lean: -0.06, wv: 2 } },
  tail: { wind: 1, idle: { ta: 0 }, walk: { ta: 0.1 },
    atk0: { ta: -0.9, lean: 0.12 }, atk1: { ta: 0.85, lean: 0.25, wv: 2 },
    SPRAY: { lean: 0.55, ta: -0.6, aF: 1.7, aB: 1.8, wv: 2 }, SWING: { ta: 0.85, lean: 0.25, wv: 2 } },
};
// giants: the head sits low and forward between the shoulders, so the hands stay lower in front of it
const POSE2_GIANT = {
  fist: { idle: { aF: -0.08, sF: 0.75, aB: -0.2, sB: 0.7 }, walk: { aF: 0.05, aB: -0.05 }, atk0: { aF: 0.25, sF: 0.6 }, atk1: { aF: 0.05, sF: 1.15 },
    combo0: { aF: -0.08, sF: 0.72, aB: 0.05, sB: 1.15 }, combo1: { aF: 0.05, sF: 1.15, aB: -0.2, sB: 0.65 } },
  throw: { idle: { aF: -2.3, sF: 0.9 }, walk: { aF: -2.3 } },
};
// per weapon: different strikes in the same class
const POSE2_ID = {
  slam: { atk0: { aF: -2.4, aB: -2.5, sF: 1.05, sB: 1.05, lean: -0.1, dy: -1 }, atk1: { aF: 1.3, aB: 1.35, sF: 1, sB: 1, lean: 0.45, dy: 2, leg: 2, wv: 2 } },
  shove: { atk1: { aF: -0.05, aB: 0.05, sF: 1.2, sB: 1.2, lean: 0.25, dx: 2, wv: 2 } },
  ram: { idle: { aF: 0.5, wA: 0, bh: -6 }, walk: { aF: 0.5, wA: 0, bh: -6 }, atk0: { aF: 0.55, wA: 0, dx: -2, lean: -0.08 }, atk1: { aF: 0.1, wA: 0, dx: 2.4, lean: 0.25, sF: 1.1, wv: 2 } },
  puck: { atk0: { aF: -1.4, wA: -2.0, bh: -5, lean: -0.1 }, atk1: { aF: 0.95, wA: 0.95, bh: -5, lean: 0.25, wv: 2 } },
  bat: { idle: { aF: -0.4, sF: 0.75, wA: -2.2, aB: 0.2 }, atk0: { aF: -1.2, wA: -2.8, lean: -0.12 }, atk1: { aF: 0.4, wA: 0.3, lean: 0.2, wv: 2 } },
  dagger: { atk0: { aF: 0.1, wA: -0.2, sF: 0.6, lean: -0.05 }, atk1: { aF: 0, wA: 0, sF: 1.2, lean: 0.18, dx: 1.4, wv: 2 } },
  saw: { idle: { aF: 0.3, wA: 0.05 }, atk0: { aF: 0.3, wA: 0.3 }, atk1: { aF: 0, wA: -0.1, sF: 1.15, lean: 0.2, wv: 2 } },
};
// Ability poses (two legs), over the hold class's idle (the weapon arms stay unless a pose sets them)
const ACT2 = {
  LEAP: { leg: 1, lean: 0.3, dy: -1 }, CHARGE: { lean: 0.32, hd: 0.08 },
  PIN: { lean: 0.65, dy: 3, leg: 5, hd: 0.35, ho: 1, aF: 0.55, aB: 0.65, sF: 1.1, sB: 1.1, bh: NaN_ },
  ROAR: { lean: -0.18, hd: -0.45, ho: 1, aF: -1.0, aB: -1.2, bh: NaN_ },
  CARRY: { aF: -1.75, aB: -1.85, sF: 0.95, sB: 0.95, lean: -0.06, wv: 0, bh: NaN_ },
  SLIDE: { rot: 1.35, dy: 5, aF: -0.4, aB: -0.3, leg: 6, hd: -0.85, bh: NaN_ },
  STOMP: { leg: 7, lean: -0.1, aF: -0.7, aB: -0.9, bh: NaN_ },
  CHANNEL: { aF: -0.3, aB: -0.35, sF: 1.05, sB: 1.05, wv: 2, wA: -0.3, bh: NaN_ },
  SHELL: { dy: 4.5, leg: 5, lean: 0.65, hd: 0.4, aF: 1.9, aB: 2.0, sF: 0.6, sB: 0.6, bh: NaN_ },
  PUFF: { sq: 0.28, aF: -0.4, aB: -0.5, bh: NaN_ },
  DIVE: { rot: 0.95, leg: 1, hd: -0.5 },
  BLINK: { sq: -0.22, aF: -1.3, aB: -1.4, bh: NaN_ },
  SIT: { leg: 3, dy: 4.6, lean: -0.12, aF: -0.9, aB: -1.0, bh: NaN_ },
  DRINK: { lean: 0.5, hd: 0.45, ho: 1 },
  SMOKE: { dy: 1.4, leg: 2, lean: 0.2, aB: 0.9, sB: 1.1, bh: NaN_ },
  SWALLOW: { lean: -0.25, hd: -0.55, ho: 1 },
  HOP: { leg: 1 },
  DOWN: { rot: 1.5, dy: 5.6, leg: 6, aF: -0.5, aB: -0.4, hd: -0.6, bh: NaN_ },
  GRAB: { aF: -0.2, aB: -0.25, sF: 1.15, sB: 1.12, lean: 0.12, bh: NaN_ },
  UNDER: {},
};
// weapon codes a class doesn't name: from its keyframes
const WCODE = { AIM: 'idle', FIRE: 'atk1w', RELOAD: 'idle', WIND: 'atk0', THROW: 'atk1', SWING: 'atk1', CAST: 'atk0w', BREATH: 'open', SPRAY: 'atk1w', BEAM: 'atk1w', HOLD: 'open', COMBO: 'atk1', SPIN: 'atk1' };
const ANIM = new Set(['NONE', 'FIRE', 'THROW', 'SWING', 'CAST', 'COMBO']);   // codes the attack (u.attack) animates A0 -> A1
// Four legs: placement class -> keyframes (fields: rig-mine.js V4; li in px of the body)
const D4 = { pitch: 0, ha: 0, hx: 0, li: 0, ta: 0, gait: 0, pw: 0, wr: 0, wn: 0, fl: 0, sq: 0, re: 0, wv: 1, ho: 0, ga: 0 };
const POSE4 = {
  back: { idle: {}, walk: {}, atk0: { wr: 2.6, wn: -0.25, pitch: -0.05, wv: 2 }, atk1: {},
    FIRE: { wr: 0.9, wv: 2 }, BEAM: { wv: 2 }, CAST: { ha: -0.3, wv: 2 }, CHANNEL: { ha: -0.15, wv: 2 }, RELOAD: { ha: 0.35 }, AIM: { ha: 0.06 }, WIND: { wr: -0.8, wn: -0.35 } },
  mouthHeld: { wind: 1, idle: { ha: -0.08 }, walk: { ha: -0.05 }, atk0: { ha: -0.7, hx: -1.2, pitch: -0.06 }, atk1: { ha: 0.5, hx: 2.2, pitch: 0.07, wv: 2 },
    HOLD: { gait: 3, li: 1.5, ha: 0.1 } },
  pole4: { wind: 1, idle: { ha: -0.04 }, walk: {}, atk0: { hx: -2.2, ha: 0.05 }, atk1: { hx: 3.6, pitch: 0.05, wv: 2 }, HOLD: { gait: 3, li: 1.5, ha: 0.1 } },
  mouth: { wind: 1, idle: {}, walk: {}, atk0: { ha: -0.38, hx: -1 }, atk1: { ha: 0.28, hx: 3, ho: 1, pitch: 0.06, wv: 2 },
    BREATH: { ha: -0.05, hx: 1, ho: 1, wv: 2 }, SPRAY: { ha: -0.05, hx: 1, ho: 1, wv: 2 }, HOLD: { ha: -0.25, ho: 1, wv: 2 } },
  head: { wind: 1, idle: { ha: 0.08 }, walk: {}, atk0: { ha: 0.38, hx: -1.6, pitch: 0.05 }, atk1: { ha: -0.6, hx: 2.6, pitch: -0.08, wv: 2 }, CHARGE: { ha: 0.38, gait: 1 } },
  fist: { wind: 1, idle: {}, walk: {}, atk0: { pw: -1.5, pitch: -0.15, ha: -0.1 }, atk1: { pw: 0.35, pitch: 0.06, wv: 2 } },
  tail: { wind: 1, idle: {}, walk: {}, atk0: { ta: -1.0, pitch: 0.06 }, atk1: { ta: 0.9, pitch: -0.04, wv: 2 }, SPRAY: { ta: -0.85, pitch: 0.2, wv: 2 }, SWING: { ta: 0.9, pitch: -0.04, wv: 2 } },
};
const ACT4 = {
  LEAP: { gait: 2, pitch: -0.25 }, CHARGE: { gait: 1, ha: 0.25, pitch: 0.06 }, PIN: { gait: 3, pitch: 0.15, ha: 0.4, ho: 1, li: 2 },
  ROAR: { ha: -0.7, ho: 1, pitch: -0.14 }, CARRY: { ha: -0.3, ho: 1 }, SLIDE: { gait: 5, liL: 0.55, ha: -0.25 }, STOMP: { re: -0.45 },
  CHANNEL: { ha: -0.15, wv: 2 }, SHELL: { gait: 3, liL: 0.5, hx: -3, ha: 0.35 }, PUFF: { sq: 0.3 }, DIVE: { pitch: 0.6, gait: 2 },
  BLINK: { sq: -0.25 }, SIT: { gait: 4, re: -0.45, liL: 0.25 }, DRINK: { ha: 0.55, ho: 1, pitch: 0.1 }, SMOKE: { gait: 3, li: 2 },
  SWALLOW: { ha: -0.5, ho: 1 }, HOP: { gait: 2 }, DOWN: { gait: 5, liL: 0.5 }, GRAB: { ha: 0.05, hx: 2.5, ho: 1, pw: -1.0 }, UNDER: {},
};
const ACT_NAMES = Object.keys(ACT);   // NONE AIM FIRE ...
function vec(D, IDX, N, o, scaleXY) {
  const v = new Float32Array(N);
  for (const k in D) { const i = IDX[k]; let x = o[k] !== undefined ? o[k] : D[k]; if (scaleXY && (k === 'dx' || k === 'dy' || k === 'hx' || k === 'li')) x *= scaleXY; v[i] = x; }
  return v;
}

// ---------------------------------------------------------------- compile a recipe: parts, gear, pose tables
const BODY = {
  person: { legs: 2, scale: 9.9 / 9.49, J: J_PERSON, layer: personLayer, skin: C.skin, base: [-14, -41, 16, 3], fig: [-11, -40, 13, 1] },
  giant: { legs: 2, scale: 1.3, J: J_GIANT, layer: giantLayer, skin: '#f2a894', base: [-22, -66, 28, 4], fig: [-18, -62, 24, 1] },
  animal: { legs: 4, scale: 13.2 / 14.78, J: J_ANIMAL, layer: animalLayer, skin: C.skin, base: [-20, -30, 22, 3], fig: [-18, -28, 20, 1] },
  beast: { legs: 4, scale: 18.7 / 17.6, J: J_BEAST, layer: beastLayer, skin: C.skin, base: [-34, -36, 30, 3], fig: [-33, -33, 28, 1] },
};
const W_ROW = new Map(WEAPONS.map((r) => [r.id, r]));
const A_ROW = new Map(ABILITIES.map((r) => [r.id, r]));
const FLY_IDS = new Set(['fly', 'grabdrop', 'beam', 'firedive']);
const warned = new Set();
function warnOnce(k, e) { if (warned.has(k)) return; warned.add(k); console.warn('art: mine', k, e); }

function compile(r) {
  const B = BODY[r.body] || BODY.person, J = B.J, quad = B.legs === 4;
  const row = W_ROW.get(r.weapon) || W_ROW.get('sword'), pc = poseClass(row);
  const wg = GEAR[row.id] && typeof GEAR[row.id].paint === 'function' ? GEAR[row.id] : null;
  let wAt = (wg && ANCHORS.has(wg.at) ? wg.at : null) || HOLD_AT[row.hold] || null;
  const ghost = r.abilities.includes('ghost'), flies = r.abilities.some((a) => FLY_IDS.has(a));
  const parts = [], gearPart = {};   // name -> { src: 'w' | ability index, pose, x, y, s, ang }
  const names = { leg: null, wisp: null, body: 'r:body', head: 'r:head', headO: 'r:headO', armF: null, armB: null, w: null, wA: null, w2: false,
    wM: null, wMA: null, wF: null, wFA: null, wF2: null, tail: null, legN: null, legF: null, mound: null, G: [] };
  parts.push('r:body', 'r:head', 'r:headO');
  const burrows = r.abilities.includes('burrow');
  if (burrows) { names.mound = 'r:mound'; parts.push('r:mound'); }
  if (ghost) { names.wisp = 'r:wisp'; parts.push('r:wisp'); }
  else if (quad) { names.legN = 'r:legN'; names.legF = 'r:legF'; parts.push('r:legN', 'r:legF'); }
  else { names.leg = 'r:leg'; parts.push('r:leg'); }
  if (!quad) { names.armF = 'r:armF'; names.armB = 'r:armB'; parts.push('r:armF', 'r:armB'); }
  const anchor = (at) => {   // rest place of a gear root + its scale
    if (quad) {
      if (at === 'hand2') return [J.flank, J.gs];
      if (at === 'fist') return [J.paw, J.gs];
      if (at === 'tail') return [J.rear, J.gs];
      return [J[at] || J.back, J.gs];
    }
    if (at === 'fist') return [J.hand, J.gs];
    return [J[at] || J.hand, J.gs];
  };
  // the weapon's frames: idle, atk (or the idle part again when the gear has no 'atk' look), an extra ('loose' / 'aim')
  const wPoses = wg && Array.isArray(wg.poses) ? wg.poses : ['idle', 'atk'], wExtra = wPoses.includes('loose') ? 'loose' : wPoses.includes('aim') ? 'aim' : wPoses.includes('ladle') ? 'ladle' : null;
  const wpart = (nm, x, y, s, ang = 0) => {
    gearPart[nm] = { src: 'w', pose: 'idle', x, y, s, ang }; parts.push(nm);
    if (wPoses.includes('atk')) { gearPart[nm + 'A'] = { src: 'w', pose: 'atk', x, y, s, ang }; parts.push(nm + 'A'); }
    if (wExtra && nm === 'r:w') { gearPart['r:wX'] = { src: 'w', pose: wExtra, x, y, s, ang }; parts.push('r:wX'); }
    return wPoses.includes('atk') ? nm + 'A' : nm;
  };
  let strapOn = false, hideTail = false;
  let qcls = null;
  if (quad) {
    if (!wAt && QBACK.has(pc)) { const p = J.back; names.wA = wpart('r:w', p[0] + 0.6 * J.k, p[1] - 2.4 * J.k, J.gsBack, -0.1); names.w = 'r:w'; names.wX = wExtra ? 'r:wX' : null; strapOn = true; qcls = 'back'; }
    else if (!wAt) { const p = J.mouth; names.wMA = wpart('r:wM', p[0] - 1, p[1], J.gsMouth, 0); names.wM = 'r:wM'; qcls = pc === 'pole' ? 'pole4' : 'mouthHeld'; }
    else if (wAt === 'mouth' || wAt === 'head') { const p = headRoot(J, wAt, wg); names.wMA = wpart('r:wM', p[0], p[1], J.gs, 0); names.wM = 'r:wM'; qcls = wAt === 'head' ? 'head' : 'mouth'; }
    else if (wAt === 'fist') { const [p, s] = anchor('fist'); names.wFA = wpart('r:wF', p[0], p[1], s, 0); names.wF = 'r:wF'; qcls = 'fist'; }
    else { const [p, s] = anchor(wAt); const tA = wpart('r:gw', p[0], p[1], s, 0); names.G.push({ at: wAt === 'back' && wg && wg.behind ? 'backB' : wAt, tok: 'r:gw', tokA: tA, wpn: true }); qcls = wAt === 'tail' ? 'tail' : 'back'; if (wAt === 'tail') hideTail = true; }
  } else {
    if (!wAt) { names.wA = wpart('r:w', J.hand[0], J.hand[1], J.gs, 0); names.w = 'r:w'; names.wX = wExtra ? 'r:wX' : null; names.w2 = wg ? !!wg.pair : row.id === 'revolvers'; }
    else if (wAt === 'mouth' || wAt === 'head') { const p = headRoot(J, wAt, wg); names.wMA = wpart('r:wM', p[0], p[1], J.gs, 0); names.wM = 'r:wM'; }
    else if (wAt === 'fist') { names.wFA = wpart('r:wF', J.hand[0], J.hand[1], J.gs, 0); names.wF = 'r:wF'; names.wF2 = !wg || wg.pair ? 'r:wF' : null; }
    else { const [p, s] = anchor(wAt); const tA = wpart('r:gw', p[0], p[1], s, 0); names.G.push({ at: wAt === 'back' && wg && wg.behind ? 'backB' : wAt, tok: 'r:gw', tokA: tA, wpn: true }); }
  }
  if (quad && !hideTail && !ghost) { names.tail = 'r:tail'; parts.push('r:tail'); }
  // ability gear (only abilities with gear show; their roots by GEAR.at)
  let wings = false, moveGear = false, noHat = false;
  r.abilities.forEach((id, i) => {
    const g = GEAR[id];
    if (!g || typeof g.paint !== 'function' || !ANCHORS.has(g.at)) return;
    const nm = 'r:g' + i;
    let p, s;
    if (g.at === 'head' || g.at === 'mouth') { p = headRoot(J, g.at, g); s = J.gs; } else [p, s] = anchor(g.at);
    // one look only (no acts / air, and not the dome / bees that change by their own state): no 'atk' part to bake
    const one = !Array.isArray(g.acts) && !g.air && id !== 'dome' && id !== 'bees';
    gearPart[nm] = { src: i, pose: 'idle', x: p[0], y: p[1], s, ang: 0 }; parts.push(nm);
    if (!one) { gearPart[nm + 'A'] = { src: i, pose: 'atk', x: p[0], y: p[1], s, ang: 0 }; parts.push(nm + 'A'); }
    const at = g.at === 'back' && g.behind ? 'backB' : g.at;
    const acts = Array.isArray(g.acts) ? new Uint8Array(ACTN) : null; if (acts) for (const a of g.acts) if (a >= 0 && a < ACTN) acts[a] = 1;
    names.G.push({ at, tok: nm, tokA: one ? nm : nm + 'A', acts, air: !!g.air, top: id === 'shell' });
    if (g.hidesHat) noHat = true;
    if (A_ROW.get(id) && A_ROW.get(id).kind === 'move') { moveGear = true; if (g.at === 'back') wings = true; }
    if (quad && g.at === 'tail') hideTail = true;
  });
  if (hideTail && names.tail) { names.tail = null; parts.splice(parts.indexOf('r:tail'), 1); }
  // pose tables
  const X = { J, names, V: new Array(ACTN).fill(null), A0: new Array(ACTN).fill(null), A1: new Array(ACTN).fill(null), idle: null, walk: null,
    flies, wings, moveGear, ghost, hideTail, armSwing: false, fists: false, dual: names.w2, wind: false, windT: 0.28, hitK: r.body === 'beast' ? 0.6 : 1, quad,
    h2: wg && Array.isArray(wg.hand2) ? wg.hand2 : null, h2A: wg && Array.isArray(wg.hand2A) ? wg.hand2A : null,
    ladle: wExtra === 'ladle', flyAnchor: r.weapon === 'anchor' };   // STEP8 (lead): flyAnchor = hide the held anchor while OVER.anchor flies it   // oil pot: the ladle (weapon view 3) once its bag says no pots left (W-THROW wb.pots)
  // ACT.SHELL: a shield (no shell) braces behind it instead of curling up (A-SUPPORT's shield wall brace)
  const brace = r.abilities.includes('shield') && !r.abilities.includes('shell');
  X.brace = brace;
  if (quad) tables4(X, POSE4[qcls] || POSE4.back, J);
  else tables2(X, POSE2[pc] || POSE2.swing, [r.body === 'giant' ? POSE2_GIANT[pc] : null, POSE2_ID[row.id]], J, pc);
  // weapon anchors for MINE.anchor: where it rides, its grip at rest, its tip (gear `tip`, else the far end of its box)
  const wName = names.w ? 'r:w' : names.wM ? 'r:wM' : names.wF ? 'r:wF' : 'r:gw', wgp = gearPart[wName] || { x: J.hand ? J.hand[0] : 0, y: J.hand ? J.hand[1] : 0, s: 1, ang: 0 };
  const wgear = wg || PH[pc], tip0 = wgear && Array.isArray(wgear.tip) ? wgear.tip : [wgear && wgear.box ? wgear.box[0] - wgear.box[2] : 10, 0];
  X.wAt = names.w ? (quad ? 'back' : 'hand') : names.wM ? 'mouth' : names.wF ? 'fist' : 'tail';
  X.wGrip = [wgp.x, wgp.y]; X.wTip = [tip0[0] * wgp.s, tip0[1] * wgp.s]; X.wAng = wgp.ang || 0;
  X.rest = new Float32Array(ANCHOR_N);
  { const nop = () => {};
    if (quad) { const S = pose4(J, X.idle, -1); emit4(J, names, names.G, S, nop); anchors4(X.rest, 0, X, J, S); }
    else { const S = pose2(J, X.idle, null, 0, X); emit2(J, names, names.G, S, nop); anchors2(X.rest, 0, X, J, S); } }
  // box: tight round what is painted (every part at rest + every whole pose), so each bake scans a small canvas
  const bx = boxOf(B, J, quad, names, gearPart, (gp) => (gp.src === 'w' ? (wg || PH[pc]) : GEAR[r.abilities[gp.src]]), X);
  return { B, J, quad, row, pc, wg, wAt, ghost, flies, parts, gearPart, names, strap: strapOn, noHat, X, box: [Math.ceil(bx[2] - bx[0]), Math.ceil(bx[3] - bx[1]), Math.ceil(-bx[0]), Math.ceil(-bx[1])] };
}
/** The entry box [x0, y0, x1, y1] (sprite px): the body, every part's box at rest and in every whole pose (idle, walk,
 *  strike, tossed, hold) through the same emit as the painter, + a margin. Body layers use the body's base box. */
function boxOf(B, J, quad, names, gearPart, gearOf, X) {
  const bx = B.base.slice(), PB = {};
  for (const nm in gearPart) {
    const gp = gearPart[nm], g = gearOf(gp), b = g && Array.isArray(g.box) ? g.box : [16, 8, 4, 4], k = gp.s;
    PB[nm] = [gp.x - b[2] * k, gp.y - b[3] * k, gp.x + (b[0] - b[2]) * k, gp.y + (b[1] - b[3]) * k];
  }
  if (!quad) for (const [nm, S] of [['r:armF', J.sF], ['r:armB', J.sB]]) PB[nm] = [S[0] - 2.5 * J.k, S[1] - 3 * J.k, S[0] + J.LA + 3.5 * J.k, S[1] + 3 * J.k];
  const grow = (x, y) => { if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y; if (x > bx[2]) bx[2] = x; if (y > bx[3]) bx[3] = y; };
  for (const nm in PB) { const q = PB[nm]; grow(q[0], q[1]); grow(q[2], q[3]); }
  const put = (nm, a, b, c, d, e, f) => {
    const q = PB[nm]; if (!q) return;
    for (const [x, y] of [[q[0], q[1]], [q[2], q[1]], [q[0], q[3]], [q[2], q[3]]]) grow(a * x + c * y + e, b * x + d * y + f);
  };
  for (const V of [X.idle, X.walk, X.atkWhole, X.hold]) {   // the whole poses a unit shows for long (wading, the icon); tossed may clip
    if (!V) continue;
    if (quad) { const S = pose4(J, V, -1); S[23] = X.hideTail ? 1 : 0; emit4(J, names, names.G, S, put); }
    else emit2(J, names, names.G, pose2(J, V, null, 0, X), put);
  }
  const m = 2 * J.k;
  return [bx[0] - m, bx[1] - m, bx[2] + m, Math.min(bx[3] + m, 6 * J.k)];
}
/** Root of a head / mouth gear: GEAR.root 'snout' | 'centre' moves it from the top-front of the head / the mouth. */
function headRoot(J, at, g) { const rt = g && g.root; return rt === 'snout' ? J.snout : rt === 'centre' ? J.centre : at === 'mouth' ? J.mouth : J.headTop; }
function tables2(X, P, PID, J, pc) {
  const T = Object.assign({}, P);
  for (const O of PID) if (O) for (const k in O) T[k] = typeof O[k] === 'object' ? Object.assign({}, T[k] || {}, O[k]) : O[k];
  const base = Object.assign({}, D2, T.idle);
  const mk = (o) => vec(D2, V2, V2.N, Object.assign({}, base, o), J.k);
  X.idle = mk({}); X.walk = mk(T.walk || {});
  const a0 = Object.assign({}, T.atk0 || {}), a1 = Object.assign({}, T.atk1 || {});
  const A0 = mk(a0), A1 = mk(a1);
  X.armSwing = !(base.bh === base.bh) && pc !== 'fist';
  X.fists = !!T.fists; X.wind = !!T.wind;
  for (let code = 0; code < ACTN; code++) {
    const nm = ACT_NAMES.find((k) => ACT[k] === code);
    if (!nm) continue;
    if (code === 0) { X.A0[0] = A0; X.A1[0] = A1; continue; }
    let v = null;
    if (T[nm]) v = mk(T[nm]);
    else if (code < 20) {
      const w = WCODE[nm];
      v = w === 'idle' ? X.idle : w === 'atk0' ? A0 : w === 'atk1' ? A1 : w === 'atk1w' ? mk(Object.assign({}, a1, { wv: 2 })) : w === 'atk0w' ? mk(Object.assign({}, a0, { wv: 2 })) : mk({ ho: 1, lean: 0.1, wv: 2 });
    } else if (nm === 'SHELL' && X.brace) v = mk({ dy: 2, leg: 2, lean: 0.22, hd: 0.12 });
    else if (ACT2[nm]) v = mk(ACT2[nm]);
    X.V[code] = v;
    if (ANIM.has(nm)) { X.A0[code] = A0; X.A1[code] = A1; }
  }
  if (T.combo0) { X.A0[ACT.COMBO] = mk(T.combo0); X.A1[ACT.COMBO] = mk(T.combo1); }
  else { X.A0[ACT.COMBO] = A0; X.A1[ACT.COMBO] = A1; }
  X.fly = mk({ leg: 4, aF: -0.9, aB: -1.1, bh: NaN_, ho: 1, sF: 1, sB: 1 });
  X.stamp = mk({ leg: 2, dy: 1.6, lean: 0.18, aF: 1.1, aB: 1.2, bh: NaN_ });   // ACT.STOMP, the foot down (A-ACT1 stomp bag.ph 2)
  X.hold = mk({ lean: -0.08, hd: -0.3, ho: 1, wv: 2 });
  X.atkWhole = mk(Object.assign({}, a0, a1, { wv: a1.wv !== undefined ? a1.wv : 2 }));
}
function tables4(X, P, J) {
  const base = Object.assign({}, D4, P.idle);
  const mk = (o) => { const q = Object.assign({}, base, o); if (q.liL) q.li = (q.li || 0) + q.liL * J.legL / J.k; delete q.liL; return vec(D4, V4, V4.N, q, J.k); };
  X.idle = mk({}); X.walk = mk(P.walk || {});
  const a0 = P.atk0 || {}, a1 = P.atk1 || {}, A0 = mk(a0), A1 = mk(a1);
  X.wind = !!P.wind;
  for (let code = 0; code < ACTN; code++) {
    const nm = ACT_NAMES.find((k) => ACT[k] === code);
    if (!nm) continue;
    if (code === 0) { X.A0[0] = A0; X.A1[0] = A1; continue; }
    let v = null;
    if (P[nm]) v = mk(P[nm]);
    else if (code < 20) { const w = WCODE[nm]; v = w === 'idle' ? X.idle : w === 'atk0' ? A0 : w === 'atk1' ? A1 : w === 'open' ? mk({ ho: 1, wv: 2 }) : mk(Object.assign({}, a1, { wv: 2 })); }
    else if (nm === 'SHELL' && X.brace) v = mk({ gait: 3, li: 1.5, ha: 0.15 });
    else if (ACT4[nm]) v = mk(ACT4[nm]);
    X.V[code] = v;
    if (ANIM.has(nm)) { X.A0[code] = A0; X.A1[code] = A1; }
  }
  X.A0[ACT.COMBO] = A0; X.A1[ACT.COMBO] = A1;
  X.fly = mk({ gait: 7, ho: 1 });
  X.stamp = mk({ re: 0.06, li: 1.6, pitch: 0.08, ha: 0.15 });
  X.hold = mk({ ha: -0.25, ho: 1, wv: 2 });
  X.atkWhole = mk(Object.assign({}, a0, a1));
}

// ---------------------------------------------------------------- painting
/** Look for one bake: colours by state (burnt / zombie / bone / ghost) and team. */
function lookOf(o, E) {
  const burnt = o.dead === 'burnt', bone = o.risen === 'bone', zom = !!o.risen, own = E.own;
  const team = o.col && !sameCol(o.col, own) ? o.col : null;
  let col = burnt ? C.char : o.col || own;
  let coat = burnt ? C.char : bone ? C.white : zom ? mix(own, C.zskin, 0.6) : own;
  let skin = burnt ? C.charL : bone ? C.white : zom ? C.zskin : E.B.skin;
  let ghostCol = tone(own, 0.6);
  if (E.ghost && !burnt) { col = tone(col, 0.5); coat = tone(coat, 0.5); if (!zom) skin = GHOST_SKIN; ghostCol = tone(E.B.legs === 4 ? coat : col, 0.15); }
  return { o, R: o.R, M: o.M, burnt, zom, bone, dead: o.dead, ghost: E.ghost, own, team, col, coat, skin, ghostCol, bare: !!o.bare, E };
}
function paintGear(c, E, L, gp) {
  const id = gp.src === 'w' ? E.row.id : E.recipe.abilities[gp.src];
  let g = GEAR[id];
  if (!g || typeof g.paint !== 'function') g = gp.src === 'w' ? PH[E.pc] : null;
  if (!g) return;
  c.save(); c.translate(gp.x, gp.y); if (gp.ang) c.rotate(gp.ang); c.scale(gp.s, gp.s);
  try { g.paint(c, { R: L.R, M: L.M, body: E.recipe.body, col: L.col, own: L.own, dead: L.dead, risen: L.o.risen, ghost: L.ghost, v: L.o.v, pose: gp.pose }); }
  catch (err) { warnOnce('gear ' + id, err); }
  c.restore();
}
function paintLayer(c, E, L, name) {
  const gp = E.gearPart[name];
  if (gp) { paintGear(c, E, L, gp); return; }
  E.B.layer(c, L, name);
}
/** A whole pose: the parts put together by emit2 / emit4 with the pose's numbers (as the drivers do every frame). */
const LIST = [];
function paintWhole(c, E, L, pose) {
  const X = E.X;
  if (pose === 'under') { paintLayer(c, E, L, 'r:mound'); return; }
  let V = X.idle, legs = null, th = -1;
  if (L.dead) V = X.idle;
  else if (pose === 'walk0' || pose === 'walk1') { V = X.walk; legs = pose === 'walk0' ? [0.5, -0.5] : [-0.5, 0.5]; th = pose === 'walk0' ? Math.PI / 2 : 1.5 * Math.PI; }
  else if (pose === 'atk') V = X.atkWhole;
  else if (pose === 'fly') V = X.fly;
  else if (pose === 'hold') V = X.hold;
  paintVec(c, E, L, V, legs, th);
}
function paintVec(c, E, L, V, legs, th) {
  const X = E.X, J = E.J;
  LIST.length = 0;
  const N = E.names, G = N.G;
  const put = (nm, a, b, cc, d, e, f) => { if (typeof nm === 'string') LIST.push(nm, a, b, cc, d, e, f); };
  if (E.quad) {
    const S = pose4(J, V, th);
    if (L.dead) for (let i = 0; i < 4; i++) { S[5 + i] = (i < 2 ? -0.35 : 0.35); S[9 + i] = 1; }
    S[23] = X.hideTail ? 1 : 0;
    emit4(J, N, G, S, put);
  } else {
    const S = pose2(J, V, legs, 0, X);
    if (L.dead) { S[2] = 1.3; S[3] = 1.45; S[6] = V[V2.wA] + (1.3 - V[V2.aF]) * 0.7; S[7] = S[6]; }
    emit2(J, N, G, S, put);
  }
  const items = LIST.slice();
  for (let i = 0; i < items.length; i += 7) {
    c.save(); c.transform(items[i + 1], items[i + 2], items[i + 3], items[i + 4], items[i + 5], items[i + 6]);
    paintLayer(c, E, L, items[i]);
    c.restore();
  }
}
/** Test pages (tools/mine-art.html): paint the pose of ACT code `code` (prog 0..1 = that far through its attack, -1 =
 *  its still pose; code 0 + prog -1 = idle) for entry e with bake options o. */
export function paintAct(c, e, o, code, prog = -1, gearOn = false) {
  const E = e.made, X = E.X, L = lookOf(o, E);
  if (code === ACT.UNDER) { paintLayer(c, E, L, 'r:mound'); return; }
  let V = X.V[code] || X.idle;
  const A0 = X.A0[code], A1 = X.A1[code];
  if (prog >= 0 && A0 && A1) {
    const N = E.quad ? V4.N : V2.N, VV = new Float32Array(N), e2 = 1 - (1 - prog) * (1 - prog) * (1 - prog);
    for (let i = 0; i < N; i++) { const a = A0[i], b = A1[i]; VV[i] = a !== a || b !== b ? (e2 < 0.4 ? a : b) : a + (b - a) * e2; }
    for (const i of E.quad ? [V4.gait, V4.wv, V4.ho, V4.ga] : [V2.leg, V2.wv, V2.ho, V2.ga]) VV[i] = e2 < 0.4 ? A0[i] : A1[i];
    V = VV;
  }
  if (gearOn) { V = Float32Array.from(V); V[E.quad ? V4.ga : V2.ga] = 1; }
  paintVec(c, E, L, V, null, -1);
}
function paintEntry(E, c, o) {
  const L = lookOf(o, E), p = o.pose;
  if (isPart(p)) {
    if (E.quad && o.dead) onBack(c, E.J.deadH, () => paintLayer(c, E, L, p));
    else paintLayer(c, E, L, p);
    return;
  }
  if (E.quad && o.dead) { onBack(c, E.J.deadH, () => paintWhole(c, E, L, 'idle')); return; }
  paintWhole(c, E, L, o.dead ? 'idle' : p);
}

// ---------------------------------------------------------------- the entry
const NOB = {};
const BLINK_FADE = 0.25;   // s (A-ACT1 act1-area.js blink: fade out / in over 0.25 s)
let NOW = 0;               // world time, kept from RENDER's pick(u, info) (alpha() is asked right after it)
/** A sprite entry for a recipe (type = 'mine_<id>', or 'preview'). */
export function makeEntry(type, recipe) {
  const r = cleanRecipe(recipe);
  const K = compile(r), own = COLORS[r.color] || COLORS[0], size = SIZES[r.size] || 1;
  const E = Object.assign(K, { type, recipe: r, src: recipe, own, hat: r.hat });
  const X = E.X;
  let overs = null;   // [fn, ability slot (-1 weapon)] resolved on the first over() from the unit's own def (built specs)
  const e = {
    box: E.box, scale: E.B.scale * size, own, lie: E.quad ? 'none' : 'side',
    // whole poses: idle (+ hold, + under for a burrower); every other pose is the rig's (a whole frame per pose would be
    // queued by RENDER for each pose shown while the parts bake: all the parts painted again, per colour)
    poses: ['idle'], extra: (E.names.mound ? ['hold', 'under'] : ['hold']).concat(E.parts),
    mouth: (E.quad ? E.J.mouth : E.J.mouth).slice(),
    made: E,
    paint(c, o) { paintEntry(E, c, o); },
    pick(u, info) {
      if (info) NOW = info.now;
      const b = u.b || NOB, a = b.act | 0;
      if (a === ACT.UNDER && E.names.mound) return 'under';
      if (a === ACT.HOLD && b.victim > 0) return 'hold';
      return null;
    },
    /** Blink (A-ACT1): gone = u.hidden > 0 + ACT.BLINK: fades out over 0.25 s from b.actT; back = ACT.BLINK again (actT
     *  reset), u.hidden 0: fades in over 0.25 s. (RENDER draws a see-through unit whole, so the fade is the idle frame.) */
    alpha(u) {
      const b = u.b;
      if (!b || b.act !== ACT.BLINK) return 1;
      const t = (NOW - (b.actT || 0)) / BLINK_FADE;
      return u.hidden > 0 ? (t >= 1 ? 0 : 1 - t) : (t >= 1 ? 1 : t < 0 ? 0 : t);
    },
    /** the victim held in its jaws (ACT.HOLD + b.victim, W-BODY jaws), for RENDER's gator-style draw; 0 = none. */
    holds(u) { const b = u.b; return b && b.act === ACT.HOLD && b.victim > 0 ? b.victim : 0; },
    /** the knocked-off hat (fx.js hatBit): this recipe's hat in the person frame (HAT_AT). */
    paintHat(c, col, M) { if (r.hat !== 'none') hatPaint(c, r.hat, { R: M.R, M, burnt: false, E }, own); },
    over(ctx, u, X0, Y0, flip, S, now, world) {
      const b = u.b;
      if (!b) return;
      if (!overs) {
        overs = [];
        const mk = u.def && u.def.maker;
        if (mk) {
          if (mk.weapon && OVER[mk.weapon.id]) overs.push([OVER[mk.weapon.id], -1, mk.weapon.id]);
          (mk.abs || []).forEach((a, i) => { if (a && OVER[a.id]) overs.push([OVER[a.id], i, a.id]); });
        }
      }
      for (let i = 0; i < overs.length; i++) {
        const f = overs[i];
        if (!f[0]) continue;
        const bag = f[1] < 0 ? b.wb : b.ab ? b.ab[f[1]] : null;
        if (!bag) continue;
        try { f[0](ctx, u, bag, X0, Y0, flip, S, now, world); }
        catch (err) { f[0] = null; warnOnce('over ' + f[2], err); }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    },
    rig: { driver: E.quad ? 'mine4' : 'mine2', parts: partsAll, _X: X },
  };
  return e;
}
const MADE = new Map();   // type -> its entry's compiled recipe (for MINE.anchor)
MINE.entry = (type) => { const r = recipeOf(type); if (!r) return null; const e = makeEntry(type, r); MADE.set(type, e.made); return e; };
// MINE.anchor(u, name, out?) -> [x, y]: where a made unit's 'hand' (the weapon's grip; animals: on the back / in the
// mouth), 'muzzle' (the weapon's tip: GEAR tip), 'mouth', 'head' (centre), 'headTop', 'back' or 'tail' is, in sim px
// from its feet, facing right (mirror x for a unit facing left), body + size + its radius now applied: this frame's rig
// pose when the unit was drawn rigged lately, else its rest pose. Effects (fx-mine-*.js) start beams / sparks / breath
// there. out = an array to fill (no allocation). null for a non-made type or an unknown name.
const ANCHOR_I = { hand: 0, muzzle: 2, mouth: 4, head: 6, headTop: 8, back: 10, tail: 12 };
MINE.anchor = (u, name, out) => {
  const i = ANCHOR_I[name];
  if (i === undefined || !u) return null;
  const type = typeof u.type === 'string' && u.type.startsWith('risen_') ? u.type.slice(6) : u.type;
  let E = MADE.get(type);
  const rc = recipeOf(type);
  if (!rc) return null;
  if (!E || E.src !== rc) { E = makeEntry(type, rc).made; MADE.set(type, E); }   // registered again (edited): build it again
  const d = u.def, k = (SIZES[E.recipe.size] || 1) * E.B.scale * (d && d.radius > 0 && u.radius > 0 ? Math.min(1.7, Math.max(0.35, u.radius / d.radius)) : 1);
  const slot = (u.id | 0) & 32767, live = AID[slot] === u.id;
  const D = live ? AP : E.X.rest, o = live ? slot * ANCHOR_N + i : i;
  const r = out || [0, 0];
  r[0] = D[o] * k; r[1] = D[o + 1] * k;
  return r;
};

// ---------------------------------------------------------------- the maker's live preview
// MINE.preview(ctx, recipe, w, h, t): an unsaved recipe, animated: idle (0-2 s), walking (2-4 s), attacking (4-6 s), the
// same parts as the game (baked here into small canvases at the preview's scale, a few ms a call, so a tap on a maker row
// never stalls; until a new recipe's parts are in, the last finished preview keeps drawing). The unit is drawn bigger the
// bigger its body and size (the smallest at ~40 % of the box height, the biggest filling it).
const PV = { key: '', st: null, done: null, cache: new Map() };
const PV_MAX = 200;   // baked part canvases kept across recipes (a hat change re-bakes only the head)
/** What a preview part's look depends on (so recipes share the parts that look the same). */
function pvKey(E, name, kk) {
  const r = E.recipe;
  let k = name + '|' + r.body + '|' + E.own + '|' + kk.toFixed(3) + (E.ghost ? '|g' : '');
  if (name === 'r:head' || name === 'r:headO') k += '|' + r.hat + (E.noHat ? 'x' : '');
  else if (name === 'r:body') k += E.strap ? '|s' : '';
  else if (name.startsWith('r:w') || name.startsWith('r:gw')) k += '|' + r.weapon;
  else if (name.startsWith('r:g')) k += '|' + r.abilities[+name.charAt(3)];
  return k;
}
const PAD = 2;
function pvState(r, w, h) {
  const e = makeEntry('preview', r), E = e.made, size = SIZES[r.size] || 1;
  const f = E.B.fig, fh = (f[3] - f[1]) * E.B.scale * size, fw = (f[2] - f[0]) * E.B.scale * size;
  const HMIN = 40 * 1.04 * 0.5, HMAX = 63 * 1.3 * 2.25;
  const q = Math.max(0, Math.min(1, Math.log(fh / HMIN) / Math.log(HMAX / HMIN)));
  const bw = E.box[0] * E.B.scale * size, bh = E.box[1] * E.B.scale * size;   // with the gear (jaws, poles reach out)
  let k = (h * (0.44 + 0.4 * q)) / fh;                       // canvas px per sim px
  k = Math.min(k, (w * 0.94) / Math.max(fw, bw), (h * 0.95) / Math.max(fh, bh));
  const kk = k * E.B.scale * size;                             // canvas px per sprite px
  const names = E.parts.slice(), cvs = new Map();
  const cx = Math.max(f[2], E.box[0] - E.box[2]) / 2 + Math.min(f[0], -E.box[2]) / 2;   // middle of body + gear
  return { e, E, k, kk, names, cvs, i: 0, w, h, x0: w / 2 - cx * kk, y0: h * 0.9 - (E.flies ? h * 0.08 : 0) };
}
function pvBake(st, name) {
  const E = st.E, [bw, bh, ax, ay] = E.box, kk = st.kk;
  const hit = PV.cache.get(pvKey(E, name, kk));
  if (hit) { st.cvs.set(name, hit); return false; }
  const W = Math.ceil(bw * kk) + PAD * 2, H = Math.ceil(bh * kk) + PAD * 2;
  const cv = canvas(W, H), c = cv.getContext('2d');
  c.setTransform(kk, 0, 0, kk, PAD + ax * kk, PAD + ay * kk);
  const seed = hash(`preview|${E.own}|${name}|0|false`), R = rng(seed);
  try { st.e.paint(c, { R, M: M0(R), pose: name, col: E.own, dead: false, risen: false, v: 0, type: 'preview', bare: false, hatless: false }); } catch (err) { warnOnce('preview ' + name, err); }
  tooth(c, -ax, -ay, bw, bh, seed);
  const P = { cv, ox: PAD + ax * kk, oy: PAD + ay * kk };
  st.cvs.set(name, P);
  const k = pvKey(E, name, kk);
  PV.cache.delete(k); PV.cache.set(k, P);
  if (PV.cache.size > PV_MAX) PV.cache.delete(PV.cache.keys().next().value);
}
const PVV2 = new Float32Array(V2.N), PVV4 = new Float32Array(V4.N);
function pvDraw(ctx, st, t) {
  const E = st.E, X = E.X, J = E.J, kk = st.kk, T = ((t % 6) + 6) % 6;
  let V = X.idle, th = -1, legs = null, p = -1;
  if (T >= 2 && T < 4) { V = X.walk; th = (T - 2) * 2.4 * Math.PI; }
  else if (T >= 4) { const a = (T - 4) % 1; if (a < 0.38) p = a / 0.38; }
  const N = E.quad ? V4.N : V2.N, VV = E.quad ? PVV4 : PVV2;
  if (p >= 0) { const A0 = X.A0[0], A1 = X.A1[0], e = 1 - (1 - p) * (1 - p) * (1 - p); for (let i = 0; i < N; i++) { const a = A0[i], b = A1[i]; VV[i] = a !== a || b !== b ? (e < 0.4 ? a : b) : a + (b - a) * e; } for (const i of E.quad ? [V4.gait, V4.wv, V4.ho, V4.ga] : [V2.leg, V2.wv, V2.ho, V2.ga]) VV[i] = e < 0.4 ? A0[i] : A1[i]; V = VV; }
  else if (T >= 4 && X.wind) V = X.A0[0];
  const bob = E.flies ? Math.sin(t * 2.4) * 2 : 0;
  LIST.length = 0;
  const put = (nm, a, b, c, d, e, f) => LIST.push(nm, a, b, c, d, e, f);
  if (E.quad) { const S = pose4(J, V, th); S[23] = X.hideTail ? 1 : 0; if (E.flies) for (let i = 0; i < 4; i++) S[5 + i] = (i < 2 ? 0.25 : 0.4) + 0.1 * Math.sin(t * 3 + i); emit4(J, E.names, E.names.G, S, put); }
  else {
    if (th >= 0) legs = [0.55 * Math.sin(th), -0.55 * Math.sin(th)];
    const S = pose2(J, V, legs, 0, X);
    if (E.flies && !E.ghost) { S[11] = 0.18 + 0.1 * Math.sin(t * 3); S[12] = 0.36 + 0.1 * Math.sin(t * 2.7); }
    if (th >= 0) S[9] -= 0.45 * Math.abs(Math.sin(th)) * J.k;
    S[16] = E.flies && X.wings ? 0.5 * Math.sin(t * 9) : 0; S[21] = E.ghost ? 0.18 * Math.sin(t * 3) : 0;
    emit2(J, E.names, E.names.G, S, put);
  }
  const X0 = st.x0, Y0 = st.y0 + bob * st.k;
  // shadow on the ground
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(40,30,20,0.22)';
  ctx.beginPath(); ctx.ellipse(st.x0 + (E.B.fig[0] + E.B.fig[2]) / 2 * kk, st.h * 0.9, (E.B.fig[2] - E.B.fig[0]) * kk * 0.42, Math.max(2, kk * 2.2 * J.k), 0, 0, TAU); ctx.fill();
  for (let i = 0; i < LIST.length; i += 7) {
    const P = st.cvs.get(LIST[i]);
    if (!P) continue;
    const a = LIST[i + 1], b = LIST[i + 2], c = LIST[i + 3], d = LIST[i + 4], e = LIST[i + 5], f = LIST[i + 6], ik = 1 / kk;
    ctx.setTransform(kk * a * ik, kk * b * ik, kk * c * ik, kk * d * ik, X0 + kk * e, Y0 + kk * f);
    ctx.drawImage(P.cv, -P.ox, -P.oy);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
MINE.preview = function preview(ctx, recipe, w, h, t = 0) {
  const r = cleanRecipe(recipe);
  const key = [r.body, r.size, r.weapon, r.abilities.join('+'), r.color, r.hat, w, h, Object.keys(GEAR).length].join('|');
  if (key !== PV.key) { PV.key = key; PV.st = pvState(r, w, h); }
  const st = PV.st, t0 = performance.now();
  let baked = 0;
  while (st.i < st.names.length && (baked === 0 || performance.now() - t0 < 10)) if (pvBake(st, st.names[st.i++]) !== false) baked++;
  if (st.i >= st.names.length) PV.done = st;
  const d = PV.done;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  if (d && d.w === w && d.h === h) pvDraw(ctx, d, t);
  return st.i >= st.names.length;
};
