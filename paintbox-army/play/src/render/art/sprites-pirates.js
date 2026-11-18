// Pirates tab sprites (Part 2 step 4, OURS: no OG source). Owner: PIRATES-ART. Contract: ART.md + RIG.md + STEP4.md.
// A 7-year-old's tempera pirates: striped shirts, bandanas and tricorns, cutlasses, flintlocks, a bell-mouthed blunderbuss,
// round black bombs, a big anchor on a chain, a wooden cannon on red-hubbed wheels and a fat little ship with patched,
// striped sails and a skull flag. Every entry paints ONE frame facing RIGHT, feet at (0,0), up = -y.
//
// Colours. FFA (o.col = the type's own colour): shirt stripes in own colour on white, sash gold (the blunderbuss: red).
// Team battle (o.col = C.red / C.blue): stripes in the team colour, sash a darker team colour, the captain's coat, the
// deckhand's bandana, the blunderbuss's hat band, the ship's sail stripes + hull band and the cannon's band + hubs too.
// People are human() (people.js) with kind 'pirate' (no kind gear: a plain body + head + face) plus our own hats, beards,
// eye patch, peg leg, parrot, weapons painted here.
//
// Pose picking (every pirate person, first match wins after RENDER's dead):
//   'fly'   u.z > 1 (tossed)             'swim'  u.wet >= 0.75 (deep water; all pirates swim): whole sprite, waterline cut
//   then the b.act codes of STEP4.md, then 'atk' while u.attack > 0, else RENDER's walk0 / walk1 / idle.
//   deckhand  atk = cutlass slash
//   pistol    act 1 'aim' (arm out), act 2 'shoot' (flash + smoke, kick up), atk = pistol-whip, 'reload' u.b.loaded === 0
//             (shot fired, not loaded yet: ramrod down the barrel)
//   blunderbuss act 1 'aim', act 2 'fire' (flash, smoke, leaning back from the kick); u.attack > 0 alone also = 'fire'
//   bomber    act 1 'light' (match to the fuse, sparkles), act 2 'throw' (arm flung, empty), atk = punch,
//             'fists' (fists up) when u.b.bombs <= 0 (out of bombs)
//   anchor    act 1 'wind' (anchor swung back over the shoulder), act 2 'swing' (swept round in front), act 3 'hook'
//             (thrown out on its chain)
//   captain   act 1 'rally' (cutlass up, shouting), act 2 'shoot' (pistol), atk = cutlass slash
//   gunner    atk = ramrod whack
//   cannon    act 1 'fire' (barrel recoils, smoke + flash); moving: 'roll0' / 'roll1'; else 'idle'
//   ship      act 1 'fire' (broadside smoke at the 3 gunports), act 2 'sink'; else 'bob0' / 'bob1' (the flag flaps)
// Floppy bodies (rig-pirates.js): people on 'pirate' (the biped plus peg leg, floppy hat, bandana tails, parrot, a dangling
// anchor), the cannon on 'cannon' (wheels turn, carriage rocks, barrel recoils, smoke grows). The ship draws itself
// (drawUnit, below): it always sits in water, so it does its own waterline cut, and rolls, heaves, sways its mast, kicks on
// a broadside and tilts and goes down when sinking.
// Projectiles (PROJ): 'bomb' (lobbed, rolls with the ground it covers, fuse sparkles), 'cannonball' (iron ball + speed
// streak, faces its flight, shadow under a skip), 'pellet' (blunderbuss shot, if the sim gives it its own kind).
import { C, TAU, tone, brush, ring, poly, fill, outline, part, dab, tube, spark, spline, path } from './paint.js';
import { human, humanLeg, LEGS, hair, flameLick } from './people.js';
import { fresh, spring, kick, inputs } from './rig.js';

// ---------------------------------------------------------------- our colours
const GOLD = '#f6b41c', IRON = '#46474e', IRONL = '#7a7e88', SAIL = '#fbf3dc', WOODD = '#6b4220', HAIR = '#3b2618';
const PEG = '#a8703a', BEARD = '#2a221d', GINGER = '#d4601c', CAPHAT = '#25212b', FOAM = '#f6fbff', SOOT = '#5d5a58';
const OWN = {
  deckhand: '#e0301e', pistol: '#2a2630', blunderbuss: '#e8a317', bomber: '#ff8a12', anchor: '#23408e',
  captain: '#b3141d', gunner: '#6b6e73', cannon: '#d0281c', ship: '#d0281c',
};
const DEEP = 0.75;   // sim/const.js DEEP: from here pirates swim

const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:' floppy-body part
const smooth = (e) => e * e * (3 - 2 * e);

// Paint look for one frame: burnt = all charcoal, team = Team battle colour.
function look(o, sashOwn = GOLD) {
  const burnt = o.dead === 'burnt', team = o.col === C.red || o.col === C.blue;
  return {
    o, R: o.R, M: o.M, burnt, zom: !!o.risen && !burnt, dead: o.dead, team, col: o.col,
    skin: burnt ? C.charL : o.risen ? C.zskin : C.skin,
    cl: (x) => (burnt ? C.char : x),       // big areas
    acc: (x) => (burnt ? C.charL : x),     // small accents
    sash: burnt ? C.charL : team ? tone(o.col, -0.3) : sashOwn,
    band: burnt ? C.charL : o.col,
  };
}

// ---------------------------------------------------------------- small painted bits
const ARMB = { bristles: 2, taper: 0.2, dry: 0.1 };
function arm(c, L, pts, w = 1.3) { brush(c, pts, w, C.ink, L.R, ARMB); }
function hand(c, L, x, y, r = 1.05) { dab(c, x, y, r, L.skin, L.R); }
function swoosh(c, L, pts, w = 1.1) {
  brush(c, pts, w * 1.25, '#e9eef2', L.R, { bristles: 3, taper: 0.95, dry: 0.6, vary: 0.04 });
  brush(c, pts.map(([x, y]) => [x - 0.8, y + 2.2]), w * 0.6, C.greyL, L.R, { bristles: 2, taper: 0.95, dry: 0.6 });
}
function lines(c, L, x, y, n = 2, len = 3, gap = 2) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap]], 0.5, C.ink, L.R, { bristles: 1, dry: 0.4, taper: 0.6 }); }
/** A smoke cloud: three grey blobs with a thin ink edge. */
function puff(c, L, x, y, r) {
  const R = L.R;
  for (const [dx, dy, k, col] of [[0, 0, 1, C.smokeL], [r * 0.9, -r * 0.55, 0.8, C.smoke], [-r * 0.7, -r * 0.7, 0.72, C.smokeL]]) part(c, ring(x + dx, y + dy, r * k, r * k * 0.86, R, 0.16, 8), col, L.M, { lw: 0.8, vary: 0.06 });
}
/** Cutlass: grip in the hand at (hx, hy), a broad curved blade to (tx, ty), a gold guard. bend = which way it curves. */
function cutlass(c, L, hx, hy, tx, ty, bend = 1) {
  const R = L.R, dx = tx - hx, dy = ty - hy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const gx = hx + ux * 1.5, gy = hy + uy * 1.5;
  tube(c, [[gx, gy], [hx + dx * 0.55 + nx * 1.4 * bend, hy + dy * 0.55 + ny * 1.4 * bend], [tx, ty]], 1.55, L.acc(C.greyL), R, 0.5);
  brush(c, [[hx - ux * 1.9, hy - uy * 1.9], [hx + ux * 0.4, hy + uy * 0.4]], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[gx - nx * 2, gy - ny * 2], [gx + nx * 2, gy + ny * 2]], 0.95, L.acc(GOLD), R, { bristles: 2, dry: 0.1, taper: 0.1 });
}
/** Flintlock pistol: grip in the hand at (hx, hy), barrel along ang. flash = muzzle flash + smoke. */
function flint(c, L, hx, hy, ang, flash) {
  const R = L.R;
  c.save(); c.translate(hx, hy); c.rotate(ang);
  brush(c, [[0.8, -0.6], [-0.4, 1.4], [-1.8, 2.9]], 2, L.acc(C.brown), R, { bristles: 3, dry: 0.1, taper: -0.3 });
  dab(c, -2, 3.1, 1.1, L.acc(GOLD), R);
  brush(c, [[-0.2, -1], [8, -1.1]], 1.5, C.ink, R, { bristles: 3, dry: 0.05, taper: 0 });
  dab(c, 8.1, -1.1, 0.7, L.acc(GOLD), R); dab(c, 0.9, -2.1, 0.75, L.acc(GOLD), R);
  if (flash && !L.burnt) { spark(c, 10.6, -1.3, 2.6, R); puff(c, L, 14, -3.4, 2.2); }
  c.restore();
}
/** Blunderbuss: (x, y) = the trigger hand, gun along ang: stock behind, barrel, brass bell. */
function blunder(c, L, x, y, ang, flash) {
  const R = L.R;
  c.save(); c.translate(x, y); c.rotate(ang);
  brush(c, [[-6.2, 2.1], [-2.6, 0.9], [0.6, 0.1]], 2.9, L.acc(C.brown), R, { bristles: 4, dry: 0.1, taper: -0.2 });
  brush(c, [[0, -0.2], [9.2, -0.5]], 1.9, C.ink, R, { bristles: 3, dry: 0.05, taper: 0 });
  part(c, poly([[8.6, -1.5], [13.6, -4], [14, 3.2], [8.6, 0.7]], R, 0.15), L.acc(GOLD), L.M, { lw: 1, sharp: true });
  dab(c, 13.8, -0.4, 1.4, C.ink, R);
  if (flash && !L.burnt) { flameLick(c, 14.2, -0.4, 1.8, R); spark(c, 15.6, -0.6, 3, R); }
  c.restore();
}
/** A round black bomb, its fuse up-right; lit = spark radius (0 = not lit). */
function bomb(c, L, x, y, lit, r = 2.9) {
  const R = L.R;
  dab(c, x, y, r, C.ink, R); dab(c, x - r * 0.35, y - r * 0.38, r * 0.27, '#80808a', R);
  brush(c, [[x + r * 0.4, y - r * 0.8], [x + r * 0.72, y - r * 1.45], [x + r * 1.05, y - r * 1.72]], 0.75, L.acc(C.brown), R, { bristles: 2, dry: 0 });
  if (lit && !L.burnt) spark(c, x + r * 1.15, y - r * 1.95, lit, R);
}
/** Anchor: ring at (x, y), shank pointing along ang (0 = straight down), s = size (1 = 12 px long). */
function anchorShape(c, L, x, y, ang, s = 1) {
  const R = L.R, ir = L.acc(IRONL);
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  outline(c, ring(0, 0, 1.5, 1.5, R, 0.05, 7), R, 1.1, { jit: 0.1 });
  tube(c, [[0, 1.3], [0, 11]], 1.9, ir, R, 0.75);
  tube(c, [[-3.9, 3.2], [3.9, 3.2]], 1.4, ir, R, 0.65);
  tube(c, [[-6.5, 6.4], [-5, 9.9], [0, 11.8], [5, 9.9], [6.5, 6.4]], 1.9, ir, R, 0.75);
  for (const k of [-1, 1]) part(c, poly([[k * 7.8, 4.6], [k * 4.8, 7.2], [k * 6.9, 8.8]], R, 0.1), ir, L.M, { lw: 0.8, sharp: true });
  c.restore();
}
/** A chain along pts: an ink line studded with grey links. */
function chain(c, L, pts) {
  const R = L.R;
  brush(c, pts, 1.15, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.7));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; dab(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.42, L.acc(IRONL), R, 0.1); }
  }
}
/** Gunner's ramrod: a wooden pole from a to b with a black sponge head at b. */
function rammer(c, L, a, b) {
  const R = L.R, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  tube(c, [a, b], 0.95, L.acc(C.brownL), R, 0.45);
  part(c, ring(b[0] + ux * 1.4, b[1] + uy * 1.4, 1.7, 1.7, R, 0.12, 7), L.burnt ? C.ink : '#3d3833', L.M, { lw: 0.8 });
}
/** Hook hand (the captain's far hand): (x, y) = the wrist. */
function hookHand(c, L, x, y) {
  const pts = [[x, y - 0.4], [x + 0.2, y + 1.6], [x + 1.8, y + 2.3], [x + 2.6, y + 1]];
  brush(c, pts, 0.95, C.ink, L.R, { bristles: 2, dry: 0, taper: 0.2 });
  brush(c, pts, 0.45, L.acc(C.greyL), L.R, { bristles: 1, dry: 0, taper: 0.2 });
  dab(c, x, y - 0.6, 1.1, L.acc(GOLD), L.R);
}

// ---------------------------------------------------------------- bodies
const BODY_CLIP = (L, rx, ry) => spline(ring(L.M.mx * 0.6, -12.8 + L.M.my * 0.6, rx, ry, L.R, 0.04, 9), true, 5);
/** White shirt (human() body) with stripes in `stripe` painted across it. */
function shirt(c, L, stripe) {
  const R = L.R;
  human(c, 'pirate', C.white, 'aim', L.M, L.dead, L.skin, { layer: 'body', risen: L.o.risen });
  c.save(); path(c, BODY_CLIP(L, 4.6, 5.6)); c.clip();
  const sc = L.burnt ? C.charL : stripe;
  for (const y of [-17.6, -14.6, -11.6, -8.6]) brush(c, [[-6.2, y + (R() - 0.5) * 0.7], [0, y + (R() - 0.5) * 0.9], [6.2, y + (R() - 0.5) * 0.7]], 1.6, sc, R, { bristles: 3, dry: 0.12, taper: 0, swell: 0.05 });
  c.restore();
}
/** Waist sash in L.sash, knotted at the back hip, two tails hanging. */
function sash(c, L, y = -9.4) {
  const R = L.R, s = L.sash;
  c.save(); path(c, BODY_CLIP(L, 5.1, 6.1)); c.clip();
  brush(c, [[-6, y - 0.3], [0, y + 0.4], [6, y - 0.2]], 2.7, s, R, { bristles: 4, dry: 0.1, taper: 0 });
  c.restore();
  brush(c, [[-4.8, y], [-7.2, y + 3.2], [-7.9, y + 5.4]], 1.45, s, R, { bristles: 2, dry: 0.2, taper: 0.5 });
  brush(c, [[-4.6, y + 0.2], [-6, y + 3.6], [-5.7, y + 6]], 1.25, s, R, { bristles: 2, dry: 0.2, taper: 0.5 });
  dab(c, -4.9, y, 1.4, s, R);
}
/** Bomb bag on the back hip, its strap across the chest. */
function bag(c, L) {
  const R = L.R;
  brush(c, [[-4.6, -11.4], [-0.6, -14.8], [3, -18.2]], 0.95, L.burnt ? C.ink : WOODD, R, { bristles: 2, dry: 0.1, taper: 0 });
  dab(c, -6.6, -12.3, 1.5, C.ink, R); dab(c, -4.6, -12.7, 1.45, C.ink, R);
  part(c, poly([[-9.2, -12], [-2.6, -12.2], [-2.8, -7.2], [-5.8, -6.4], [-8.8, -7.4]], R, 0.25), L.cl(C.kraft), L.M, { lw: 1.2 });
  brush(c, [[-9, -11.4], [-2.8, -11.6]], 0.8, L.burnt ? C.ink : C.kraftD, R, { bristles: 2, dry: 0.1 });
}
/** The captain's long coat (col), tails flaring behind, gold buttons, belt + buckle, a white frill at the neck. */
function coat(c, L) {
  const R = L.R, cc = L.cl(L.col);
  part(c, poly([[-3.6, -12.6], [-8, -3.4], [-4.6, -2.8], [-1.6, -6.4]], R, 0.25), tone(cc, -0.15), L.M, { lw: 1.3 });
  human(c, 'pirate', L.col, 'aim', L.M, L.dead, L.skin, { layer: 'body', risen: L.o.risen });
  brush(c, [[-5.4, -9.2], [0, -8.5], [5.4, -9.2]], 1.7, C.ink, R, { bristles: 3, dry: 0.1, taper: 0 });
  if (!L.burnt) {
    dab(c, 3.4, -8.9, 1, GOLD, R);
    for (const y of [-16.2, -13.4]) dab(c, 3.8, y, 0.75, GOLD, R);
    dab(c, 2.4, -18.2, 1.35, C.white, R); dab(c, 3.4, -17.2, 1, C.white, R);
  }
}

// ---------------------------------------------------------------- heads, hats, faces
function bandanaTails(c, L) {
  const R = L.R, col = L.cl(L.col);
  brush(c, [[-6.2, -24.6], [-9.2, -24.4], [-11.8, -22.6]], 1.7, col, R, { bristles: 3, dry: 0.15, taper: 0.4 });
  brush(c, [[-6, -24], [-8.4, -21.8], [-9.8, -19.2]], 1.45, col, R, { bristles: 3, dry: 0.15, taper: 0.45 });
}
function bandana(c, L, tails) {
  const R = L.R, col = L.cl(L.col);
  if (tails) bandanaTails(c, L);
  part(c, poly([[-6, -23.2], [-5.7, -26.6], [-2.8, -29.4], [2, -29.8], [5.6, -27.8], [7, -24.6], [6.6, -23.4], [0.6, -24.4]], R, 0.25), col, L.M, { lw: 1.4 });
  if (!L.burnt) for (const [x, y] of [[-3, -26.4], [0.8, -28.2], [3.8, -26], [-0.4, -25.4]]) dab(c, x, y, 0.62, C.white, R);
  part(c, ring(-6.2, -24.3, 1.6, 1.4, R, 0.1, 7), col, L.M, { lw: 1 });
}
/** Tricorn: black, gold trim; big = the captain's (skull on the front, a plume behind). */
function tricorn(c, L, big) {
  const R = L.R, s = big ? 1.24 : 1;
  c.save(); c.translate(0.5, -26); c.scale(s, s); c.translate(-0.5, 26);
  if (big) brush(c, [[-1.6, -30.6], [-5.8, -34.4], [-9.8, -34], [-12, -31.2]], 2.7, L.acc(C.white), R, { taper: 0.6, dry: 0.3, bristles: 4 });
  part(c, poly([[-8.8, -27.6], [-5.4, -24.4], [0.6, -23.9], [6.4, -24.2], [9.2, -27.4], [5.6, -27.2], [4, -30.8], [0.4, -31.8], [-2.8, -31.2], [-4.8, -27.6]], R, 0.25), L.cl(CAPHAT), L.M, { lw: 1.4 });
  const g = L.acc(GOLD), gb = { bristles: 2, dry: 0.15, taper: 0.1 };
  brush(c, [[-8.4, -27.4], [-4.8, -27.6]], 0.85, g, R, gb); brush(c, [[5.6, -27], [8.8, -27.2]], 0.85, g, R, gb);
  brush(c, [[-5.2, -24.8], [0.6, -24.4], [6.2, -24.6]], 0.85, g, R, gb);
  if (big && !L.burnt) {
    dab(c, 0.6, -28.6, 1.55, C.white, R); dab(c, 0.6, -27.2, 0.9, C.white, R);
    dab(c, 0, -28.8, 0.38, C.ink, R); dab(c, 1.2, -28.8, 0.38, C.ink, R);
    brush(c, [[-1.6, -25.6], [2.8, -27.2]], 0.55, C.white, R, { bristles: 1, dry: 0 }); brush(c, [[-1.6, -27.2], [2.8, -25.6]], 0.55, C.white, R, { bristles: 1, dry: 0 });
  }
  c.restore();
}
function knit(c, L, col, pom) {
  const R = L.R, cc = L.cl(col);
  part(c, poly([[-5.8, -23.4], [-5.6, -27.4], [-2.4, -30.2], [2.4, -30.4], [5.8, -27.6], [6.8, -23.6]], R, 0.25), cc, L.M, { lw: 1.4 });
  brush(c, [[-6.2, -24.2], [0.4, -24.7], [7, -24.2]], 2.2, tone(cc, -0.25), R, { bristles: 3, dry: 0.1, taper: 0 });
  for (const x of [-2.8, 0.4, 3.4]) brush(c, [[x, -25.8], [x + 0.2, -29]], 0.4, tone(cc, -0.3), R, { bristles: 1, dry: 0.2, taper: 0.3 });
  if (pom) part(c, ring(-0.6, -31.6, 2.1, 1.9, R, 0.15, 8), L.acc(C.white), L.M, { lw: 1 });
}
function floppyHat(c, L) {
  const R = L.R, h = L.cl('#7a4a22');
  part(c, poly([[-4.8, -24.8], [-4.4, -29.4], [-1.2, -31.6], [3, -31.4], [5.6, -28.6], [5.8, -24.8]], R, 0.25), h, L.M, { lw: 1.4 });
  brush(c, [[-4.6, -26.4], [0.6, -26], [5.8, -26.4]], 1.7, L.sash, R, { bristles: 3, dry: 0.1, taper: 0 });
  part(c, poly([[-10.6, -22.8], [-6.2, -25.4], [0.6, -26], [7.4, -25.4], [11.8, -23], [7.2, -23.8], [0.6, -24.2], [-6.2, -23.8]], R, 0.25), tone(h, -0.1), L.M, { lw: 1.3 });
}
function patch(c, L) {
  const R = L.R, st = { bristles: 1, dry: 0, taper: 0 };
  brush(c, [[3.4, -22.6], [0, -25], [-5.2, -25.6]], 0.6, C.ink, R, st);
  brush(c, [[3.4, -22.6], [6.2, -23.8]], 0.6, C.ink, R, st);
  dab(c, 2.8, -21.9, 1.6, C.ink, R);
}
function beard(c, L, col, big, open) {
  const R = L.R, bc = L.burnt ? C.ink : col;
  part(c, ring(2.6, -17.3, big ? 3.9 : 3.3, big ? 2.4 : 2, R, 0.2, 10), bc, L.M, { lw: 1, vary: 0.14 });
  for (let i = 0; i < (big ? 4 : 3); i++) { const x = 0 + i * 1.5, y = -16.2 - (i & 1) * 0.9; brush(c, [[x, y], [x + 0.7, y + 0.9], [x + 1.3, y]], 0.45, tone(bc, 0.3), R, { bristles: 1, dry: 0.2, taper: 0.3 }); }
  if (L.dead || L.zom) return;
  if (open) dab(c, 1.6, -18.4, 1.15, '#7a1610', R);
  else brush(c, [[-0.1, -19.3], [1.3, -18.5], [2.7, -19.3]], 0.6, '#c22a1c', R, { bristles: 2, dry: 0, taper: 0.2 });
}
function stache(c, L) {
  brush(c, [[-1.4, -19.1], [0.2, -19.9], [1.4, -19.4], [2.6, -19.9], [4.4, -19.1], [5, -20]], 1.25, L.burnt ? C.ink : '#5a3418', L.R, { bristles: 3, dry: 0.1, taper: 0.2 });
}
function soot(c, L) { if (!L.burnt) { dab(c, 4.4, -20.4, 0.8, SOOT, L.R); dab(c, -1.6, -19.6, 0.7, SOOT, L.R); dab(c, 3.2, -25.2, 0.6, SOOT, L.R); } }
/** The captain's parrot on his back shoulder: green body, red head, yellow beak, blue tail. */
function parrot(c, L) {
  const R = L.R, b = L.burnt ? C.char : L.zom ? '#8fb85a' : '#2fae3c', h = L.burnt ? C.charL : '#e3241a';
  brush(c, [[-7.6, -19.4], [-9, -15.6], [-9.4, -12.8]], 1.6, L.acc('#1f57d8'), R, { bristles: 2, dry: 0.15, taper: 0.5 });
  brush(c, [[-8.2, -18.6], [-7.2, -18.2]], 0.5, C.ink, R, { bristles: 1, dry: 0 });
  part(c, ring(-7.6, -21, 2, 2.6, R, 0.1, 8, 0.3), b, L.M, { lw: 1 });
  brush(c, [[-8.2, -22.2], [-9, -20], [-8.6, -18.6]], 1, L.acc(C.yellow), R, { bristles: 2, dry: 0.1, taper: 0.3 });
  part(c, ring(-6.9, -24.1, 1.65, 1.5, R, 0.1, 7), h, L.M, { lw: 0.9 });
  fill(c, poly([[-5.6, -24.8], [-4.2, -24], [-5.4, -23.1]], R, 0.08), L.acc(C.yellow), R, { sharp: true, edge: 0 });
  if (L.dead) { brush(c, [[-7.2, -24.9], [-6.2, -24]], 0.4, C.ink, R, { bristles: 1, dry: 0 }); brush(c, [[-6.2, -24.9], [-7.2, -24]], 0.4, C.ink, R, { bristles: 1, dry: 0 }); }
  else dab(c, -6.6, -24.4, 0.42, C.ink, R);
}
/** A peg leg from the hip to the ground: trouser stump in ink, then a wooden peg. */
function pegLeg(c, L, hip, foot) {
  const R = L.R, kx = hip[0] + (foot[0] - hip[0]) * 0.42, ky = hip[1] + (foot[1] - hip[1]) * 0.42;
  brush(c, [hip, [kx, ky]], 2.2, C.ink, R, { bristles: 3, taper: 0, dry: 0.1 });
  tube(c, [[kx, ky], foot], 1.05, L.acc(PEG), R, 0.55);
  dab(c, foot[0], foot[1] - 0.2, 0.85, C.ink, R);
}
function legs(c, L, lp, peg) {
  const ls = LEGS[lp] || LEGS.aim;
  for (let i = 0; i < ls.length; i++) {
    const lg = ls[i];
    if (peg && i === 1) pegLeg(c, L, lg[0], lg[lg.length - 2]);
    else brush(c, lg, 1.9, C.ink, L.R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 });
  }
}

// ---------------------------------------------------------------- per-type arms (+ weapons) for an arm key
const hangFar = (c, L) => { arm(c, L, [[-1.6, -15.6], [-3.4, -12.4], [-4, -10.6]]); hand(c, L, -4.1, -10.3); };
const slash = (c, L) => {   // cutlass slash, shared by deckhand + captain
  swoosh(c, L, [[-1, -33], [7, -32.4], [13.6, -26.4], [16.8, -17.4]]);
  arm(c, L, [[1.4, -17.4], [5.6, -18.4], [8.4, -17.2]]);
  cutlass(c, L, 8.6, -17.2, 18.8, -10.6, 1);
  hand(c, L, 8.6, -17.2);
};
const ready = (c, L) => {   // cutlass held up in front, ready
  arm(c, L, [[2.2, -16.4], [5, -15.2], [6.8, -14.6]]);
  cutlass(c, L, 7, -14.6, 12, -26.8, -1);
  hand(c, L, 7, -14.5);
};
const shootArm = (c, L, sh) => {
  const hx = sh ? 8.4 : 9, hy = sh ? -19.4 : -17;
  arm(c, L, [[2.4, -16.8], [6, sh ? -18 : -17], [hx, hy]]);
  flint(c, L, hx, hy, sh ? -0.42 : -0.02, sh);
  hand(c, L, hx, hy);
};
const ARMS = {
  deckhand(c, L, k) {
    if (k === 'atk') { arm(c, L, [[-1.6, -15.6], [-4.6, -13.8], [-6.4, -15.2]]); hand(c, L, -6.6, -15.4); slash(c, L); return; }
    hangFar(c, L); ready(c, L);
  },
  pistol(c, L, k) {
    if (k === 'aim' || k === 'shoot') { arm(c, L, [[-1.6, -15.6], [-4, -13.6], [-5, -11.8]]); hand(c, L, -5.2, -11.6); shootArm(c, L, k === 'shoot'); return; }
    if (k === 'atk') {   // pistol-whip: raised by the grip, the butt comes down first
      swoosh(c, L, [[3, -34], [10.4, -32], [15.4, -25], [16.6, -16]]);
      hangFar(c, L);
      arm(c, L, [[1.4, -17.4], [5, -21], [8.2, -22]]);
      flint(c, L, 8.2, -22, 2.5, false); hand(c, L, 8.2, -22);
      return;
    }
    if (k === 'reload') {   // barrel up, ramrod down it
      flint(c, L, 5.4, -13.2, -1.52, false);
      brush(c, [[5.9, -20.6], [6.1, -27]], 0.6, L.acc(C.brownL), L.R, { bristles: 1, dry: 0, taper: 0 });
      arm(c, L, [[2.2, -16], [4, -14], [5.4, -13.2]]); hand(c, L, 5.4, -13.2);
      arm(c, L, [[-1.6, -15.8], [1.8, -21.4], [5.8, -26]]); hand(c, L, 6, -26.4);
      return;
    }
    hangFar(c, L);
    arm(c, L, [[2.2, -16.2], [5, -13.8], [7.4, -13.4]]);
    flint(c, L, 7.4, -13.6, 0.28, false); hand(c, L, 7.4, -13.6);
  },
  blunderbuss(c, L, k) {
    if (k === 'aim') {
      blunder(c, L, 0.4, -14.4, -0.05, false);
      arm(c, L, [[-1.8, -15.6], [-0.6, -14.6], [0.8, -14.2]]); hand(c, L, 0.8, -14.2);
      arm(c, L, [[2.4, -16.6], [5.4, -16], [7.6, -15.2]]); hand(c, L, 7.6, -15.2);
      return;
    }
    if (k === 'fire') {
      blunder(c, L, 0.4, -15, -0.34, true);
      puff(c, L, 17.4, -23.6, 2.8); puff(c, L, 20.4, -20.4, 2.1);
      arm(c, L, [[-1.8, -15.6], [-0.6, -15], [0.6, -14.8]]); hand(c, L, 0.6, -14.8);
      arm(c, L, [[2.4, -16.8], [5, -17.8], [7, -17.4]]); hand(c, L, 7, -17.4);
      return;
    }
    blunder(c, L, 0.4, -11.8, -0.42, false);   // at the hip, the bell up in front
    arm(c, L, [[-1.6, -15.4], [-0.8, -12.8], [0.4, -11.8]]); hand(c, L, 0.4, -11.8);
    arm(c, L, [[2.4, -16.6], [5.4, -15.8], [6.6, -14.6]]); hand(c, L, 6.6, -14.6);
  },
  bomber(c, L, k) {
    if (k === 'light') {   // a match to the fuse, sparkles
      arm(c, L, [[2.2, -16.2], [5, -14.8], [6.6, -15.6]]);
      bomb(c, L, 7.6, -18, 3); hand(c, L, 6.6, -15.6);
      if (!L.burnt) for (const [x, y] of [[13.4, -24.8], [8.8, -27.4], [13.8, -20.4]]) dab(c, x, y, 0.55, C.yellow, L.R);
      arm(c, L, [[-1.4, -15.6], [2.4, -20.6], [5.4, -22.8]]);
      brush(c, [[5.6, -23], [8.6, -22.4]], 0.55, L.acc(C.brownL), L.R, { bristles: 1, dry: 0, taper: 0 });
      if (!L.burnt) flameLick(c, 8.8, -22.5, 0.55, L.R);
      hand(c, L, 5.6, -23);
      return;
    }
    if (k === 'throw') {
      swoosh(c, L, [[-11.4, -27], [-7.6, -34.2], [-0.8, -37.4], [6.6, -35]], 0.85);
      arm(c, L, [[1.2, -17.2], [6, -19.8], [11, -21.6]]); hand(c, L, 11.4, -21.7);
      arm(c, L, [[-1.4, -15.6], [-4.6, -13.4], [-6.6, -11]]); hand(c, L, -6.8, -10.8);
      return;
    }
    if (k === 'atk' || k === 'fists') {   // a punch / fists up, out of bombs
      const p = k === 'atk';
      arm(c, L, [[-1.4, -15.6], [1.8, -19], [3.4, -19.8]]); hand(c, L, 3.6, -20, 1.35);
      arm(c, L, p ? [[2.2, -16.6], [6.6, -16.8], [10.4, -16.4]] : [[2.2, -16.4], [5.6, -15.6], [7.2, -18]]);
      hand(c, L, p ? 10.8 : 7.4, p ? -16.4 : -18.4, 1.4);
      if (p) lines(c, L, 12.8, -17.6, 2, 2.6, 2.2);
      return;
    }
    hangFar(c, L);
    arm(c, L, [[2.2, -16.2], [5, -14.8], [6.6, -15.6]]);
    bomb(c, L, 7.6, -18, 0); hand(c, L, 6.6, -15.6);
  },
  anchor(c, L, k, partMode) {
    if (k === 'wind') {   // the anchor is behind (back layer); both hands up over the shoulder
      arm(c, L, [[-1.4, -15.6], [-1.6, -20.6], [-3.4, -24.2]]); hand(c, L, -3.6, -24.6);
      arm(c, L, [[2.2, -16.6], [1, -21.4], [-1.6, -25.2]]); hand(c, L, -1.8, -25.6);
      return;
    }
    if (k === 'swing') {
      swoosh(c, L, [[-10, -30], [2, -38], [18, -32.4], [26.6, -19], [26.8, -6]], 1.7);
      arm(c, L, [[-1.4, -15.6], [3.6, -15], [8.4, -15.2]]); hand(c, L, 8.4, -15.2);
      arm(c, L, [[2.2, -16.8], [6.4, -16.6], [9.6, -15.6]]);
      chain(c, L, [[9.8, -15.4], [15.2, -14.6]]);
      anchorShape(c, L, 15.8, -14.4, -Math.PI / 2, 0.82);
      hand(c, L, 9.8, -15.6);
      return;
    }
    if (k === 'hook') {
      arm(c, L, [[-1.4, -15.6], [-4.4, -13], [-5.6, -11]]); hand(c, L, -5.8, -10.8);
      arm(c, L, [[2.2, -16.6], [6.6, -17.4], [10.4, -17.6]]);
      chain(c, L, [[10.8, -17.4], [16.6, -16], [22.6, -16.2], [28, -17]]);
      anchorShape(c, L, 28.6, -17, -Math.PI / 2, 0.74);
      lines(c, L, 18.6, -22, 2, 3.4, 2.2);
      hand(c, L, 10.6, -17.6);
      return;
    }
    arm(c, L, [[-1.4, -15.4], [1.6, -12.4], [4.4, -11.4]]); hand(c, L, 4.4, -11.4);
    arm(c, L, [[2.2, -16.2], [4.6, -13.6], [6, -12.2]]);
    if (!partMode) anchorHang(c, L);
    hand(c, L, 6, -12.2);
  },
  captain(c, L, k) {
    const hook = () => { arm(c, L, [[-1.6, -15.6], [-3.2, -12.4], [-3.8, -10.8]]); hookHand(c, L, -3.9, -10.4); };
    if (k === 'rally') {
      arm(c, L, [[-1.6, -15.8], [-4.4, -17.8], [-6, -20.4]]); hookHand(c, L, -6.2, -20.8);
      arm(c, L, [[1.4, -17.6], [2.8, -23.6], [4, -29]]);
      cutlass(c, L, 4.2, -29.4, 6.6, -43, 0.6);
      hand(c, L, 4.2, -29.4); dab(c, 3.8, -28, 1, L.acc(GOLD), L.R);
      if (!L.burnt) { brush(c, [[9.2, -44.6], [11, -45.6]], 0.5, C.yellow, L.R, { bristles: 1, dry: 0 }); brush(c, [[8.6, -41.6], [10.8, -41.4]], 0.5, C.yellow, L.R, { bristles: 1, dry: 0 }); }
      return;
    }
    if (k === 'shoot') { hook(); shootArm(c, L, true); return; }
    if (k === 'atk') { arm(c, L, [[-1.6, -15.6], [-4.6, -13.8], [-6.4, -15.2]]); hookHand(c, L, -6.6, -15.2); slash(c, L); return; }
    hook(); ready(c, L);
  },
  gunner(c, L, k) {
    if (k === 'atk') {
      swoosh(c, L, [[0, -33], [8, -32], [15, -25], [19, -14]]);
      arm(c, L, [[-1.6, -15.6], [-4.6, -13.8], [-6.4, -15.2]]); hand(c, L, -6.6, -15.4);
      arm(c, L, [[1.4, -17.4], [5.6, -18.4], [8.4, -17.2]]);
      rammer(c, L, [4.4, -20.6], [19.4, -8.8]); hand(c, L, 8.4, -17.2);
      return;
    }
    hangFar(c, L);
    rammer(c, L, [4.8, -3.6], [6.8, -30.4]);
    arm(c, L, [[2.2, -16.2], [4.4, -15], [5.8, -15]]); hand(c, L, 5.9, -15);
  },
};
/** The anchor dangling from the near hand (6, -12.2) on a short chain, its flukes on the ground. */
function anchorHang(c, L) { chain(c, L, [[6.1, -11.6], [6.3, -9.6]]); anchorShape(c, L, 6.3, -9.2, 0, 0.78); }
/** Back layer (behind the body) for an arm key. */
const BACK = {
  anchor(c, L, k) { if (k !== 'wind') return; chain(c, L, [[-2.6, -25.2], [-5.4, -27.4], [-7.6, -28.4]]); anchorShape(c, L, -7.9, -28.6, 2.3, 0.82); },
};
/** Swimming (whole sprite only): pirates have def.swims, so RENDER cuts them r * 0.6 up (~5.7 sprite px at every size):
 *  the swimmer sits SWIM_DY lower, head + shoulders out, one arm stroking or holding its weapon up dry. */
const SWIM_DY = 9.2, SWIM_LINE = 6.2;
const SWIM = {
  deckhand(c, L) { cutlass(c, L, -3.4, -9.4, 10.8, -10.8, 0.4); arm(c, L, [[1.8, -7.6], [5, -13.2], [8.8, -10.6]]); hand(c, L, 9, -10.4); },
  pistol(c, L) { arm(c, L, [[1.4, -7.6], [3, -13.6], [4, -18.4]]); flint(c, L, 4, -18.6, -1.3, false); hand(c, L, 4, -18.6); },
  blunderbuss(c, L) { arm(c, L, [[1.4, -7.6], [2.4, -14.4], [1.6, -19.4]]); blunder(c, L, -2.6, -20, -0.12, false); hand(c, L, 1.6, -19.8); },
  bomber(c, L) { arm(c, L, [[1.4, -7.6], [3, -13.6], [4, -18.4]]); bomb(c, L, 4.8, -21, 0); hand(c, L, 4, -18.6); },
  anchor(c, L) { arm(c, L, [[1.8, -7.6], [5, -13.2], [8.8, -10.8]]); hand(c, L, 9, -10.6); chain(c, L, [[-4, -7], [-6.6, -9.4], [-8.4, -7.2]]); },
  captain(c, L) { arm(c, L, [[1.4, -7.6], [2.6, -13.4], [3.4, -17.8]]); cutlass(c, L, 3.6, -18.2, 5.4, -29, 0.5); hand(c, L, 3.6, -18.2); },
  gunner(c, L) { arm(c, L, [[1.4, -7.6], [3, -13.6], [4, -18.4]]); rammer(c, L, [2.6, -12.6], [5.6, -28]); hand(c, L, 4, -18.6); },
};

// ---------------------------------------------------------------- one person type
// cfg: own, scale, box, acts (b.act code -> pose), more (extra whole poses), arm(pose) -> arm key, keys (arm keys used),
// legs(pose) -> people.js LEGS key, lean(pose), open(pose) (mouth open), body(c, L), head extras face(c, L, open),
// hat(c, L) (+ hatPart: its own floppy part), tails (bandana tails as their own part), parrot, peg (near leg), anchor,
// sashOwn (FFA sash colour), atk (the u.attack pose: 'atk' or another name, null = none), pickMore(u) (extra picks).
const STAND = (p) => (p === 'walk0' || p === 'walk1' || p === 'fly' ? p : 'aim');
const LUNGE = (set) => (p) => (set.includes(p) ? 'walk0' : STAND(p));
function crew(type, cfg) {
  const poses = ['idle', 'walk0', 'walk1'].concat(cfg.atk === 'atk' ? ['atk'] : []);
  const acts = Object.values(cfg.acts || {}).concat(cfg.more || []).filter((p) => !poses.includes(p));
  const keys = cfg.keys.concat(['fly']);
  const parts = ['r:leg', 'r:body', 'r:head', 'r:headO'].concat(cfg.peg ? ['r:peg'] : [], cfg.hatPart ? ['r:hat'] : [], cfg.tails ? ['r:tails'] : [],
    cfg.parrot ? ['r:parrot'] : [], cfg.anchor ? ['r:anchor'] : [], keys.map((k) => 'r:arm:' + k), (cfg.backKeys || []).map((k) => 'r:back:' + k));
  const armOf = (p) => (p === 'walk0' || p === 'walk1' ? 'idle' : p === 'fly' ? 'fly' : cfg.arm(p));
  const sashOwn = cfg.sashOwn || GOLD;
  const doArms = (c, L, k, partMode) => {
    if (k === 'fly' || L.o.risen) { human(c, 'pirate', L.col, k === 'fly' ? 'fly' : 'aim', L.M, L.dead, L.skin, { layer: 'arms', risen: L.o.risen }); return; }
    ARMS[type](c, L, k, partMode);
  };
  const doHead = (c, L, open, partMode) => {
    human(c, 'pirate', L.col, open ? 'fly' : 'aim', L.M, L.dead, L.skin, { layer: 'head', risen: L.o.risen });
    if (cfg.face) cfg.face(c, L, open);
    if (cfg.hat && !(partMode && cfg.hatPart)) {
      if (L.o.hatless) hair(c, L.R, 0.5, -22.9, L.burnt ? C.ink : HAIR);
      else cfg.hat(c, L, !(partMode && cfg.tails));
    }
  };
  const whole = (c, o, pose) => {
    const L = look(o, sashOwn), k = armOf(pose), lean = cfg.lean(pose) || 0;
    legs(c, L, cfg.legs(pose), cfg.peg);
    c.save(); if (lean) { c.translate(0, -8); c.rotate(lean); c.translate(0, 8); }
    if (BACK[type] && !o.risen) BACK[type](c, L, k);
    cfg.body(c, L);
    doHead(c, L, cfg.open(pose), false);
    if (cfg.parrot) parrot(c, L);
    doArms(c, L, k, false);
    c.restore();
  };
  const swimmer = (c, o) => {
    const L = look(o, sashOwn);
    c.save(); c.translate(0, SWIM_DY);
    cfg.body(c, L); doHead(c, L, false, false); if (cfg.parrot) parrot(c, L);
    if (o.risen) human(c, 'pirate', L.col, 'aim', L.M, L.dead, L.skin, { layer: 'arms', risen: true });
    c.restore();
    if (!o.risen) SWIM[type](c, L);
    const R = L.R, w = -SWIM_LINE;   // the water round its shoulders: a foam crest + splash drops
    brush(c, [[-8.6, w], [-4.4, w - 1], [0, w - 0.1], [4.2, w - 1.1], [9.8, w]], 1.7, FOAM, R, { bristles: 3, dry: 0.3, taper: 0.1 });
    brush(c, [[-7, w + 0.6], [0, w + 0.4], [7.4, w + 0.6]], 1, C.pondL, R, { bristles: 2, dry: 0.3, taper: 0.2 });
    for (const [x, y] of [[10.6, w - 2.6], [-8.4, w - 2.2], [11.4, w - 4.8]]) dab(c, x, y, 0.6, FOAM, R);
  };
  const paintPart = (c, o, p) => {
    const L = look(o, sashOwn);
    if (p === 'r:leg') { humanLeg(c, 'pirate', L.M, L.burnt); return; }
    if (p === 'r:peg') { pegLeg(c, L, [0, -8], [0.5, 0]); return; }
    if (p === 'r:body') { cfg.body(c, L); return; }
    if (p === 'r:head' || p === 'r:headO') { doHead(c, L, p === 'r:headO', true); return; }
    if (p === 'r:hat') { if (!o.hatless) cfg.hat(c, L, false); return; }
    if (p === 'r:tails') { if (!o.hatless) bandanaTails(c, L); return; }
    if (p === 'r:parrot') { parrot(c, L); return; }
    if (p === 'r:anchor') { if (!o.risen) anchorHang(c, L); return; }
    const [, layer, k] = p.split(':');
    if (layer === 'arm') doArms(c, L, k, true);
    else if (layer === 'back' && BACK[type] && !o.risen) BACK[type](c, L, k);
  };
  const acts0 = cfg.acts || {}, atk = cfg.atk;
  return {
    box: cfg.box || [52, 50, 22, 44], scale: cfg.scale, own: OWN[type],
    poses, extra: acts.concat(['swim', 'fly'], parts),
    paint(c, o) {
      const p = o.pose;
      if (isPart(p)) { paintPart(c, o, p); return; }
      if (p === 'swim' && !o.dead) { swimmer(c, o); return; }
      whole(c, o, o.dead ? 'idle' : p);
    },
    pick(u, info) {
      if ((u.z || 0) > 1) return 'fly';
      if ((u.wet || 0) >= DEEP && !(u.climb > 0)) return 'swim';
      const a = u.b ? u.b.act | 0 : 0;
      if (a > 0 && acts0[a]) return acts0[a];
      if (cfg.pickMore) { const q = cfg.pickMore(u, info); if (q) return q; }
      return atk && u.attack > 0 ? atk : null;
    },
    /** Hat flying off (RENDER fx 'hatoff', an ask): paints just the hat, centred near people.js HAT_AT. */
    paintHat: cfg.hat ? (c, col, M) => cfg.hat(c, look({ R: M.R, M, col, dead: false, risen: false }, sashOwn), true) : null,
    rig: {
      driver: 'pirate',
      joints: { hip: [0, -8], neck: [0.5, -17.6], shoulder: [1, -16.4], legX: 1.8, hat: [0.5, -24.6], knot: [-6.2, -24.4], parrot: [-7.4, -18.6], hand: [6, -12.2] },
      parts(pose, zom) {
        if (pose === 'swim') return null;
        const k = armOf(pose);
        return {
          legN: cfg.peg ? 'r:peg' : 'r:leg', legF: 'r:leg', body: 'r:body', head: cfg.open(pose) ? 'r:headO' : 'r:head',
          arm: 'r:arm:' + k, back: !zom && cfg.backKeys && cfg.backKeys.includes(k) ? 'r:back:' + k : null,
          hat: cfg.hatPart ? 'r:hat' : null, tails: cfg.tails ? 'r:tails' : null, parrot: cfg.parrot ? 'r:parrot' : null,
          anc: cfg.anchor && k === 'idle' && !zom ? 'r:anchor' : null,
          lean: cfg.lean(pose) || 0, peg: cfg.peg ? 1 : 0, heavy: cfg.heavy || 0,
        };
      },
    },
  };
}
const NOLEAN = () => 0, SHUT = (p) => p === 'fly';
const leanT = (t) => (p) => t[p] || 0;
const hasReload = (u) => !!u.b && u.b.loaded === 0;

// ---------------------------------------------------------------- cannon (wooden carriage on two wheels, iron barrel)
// Rest layout (sprite px): axle (0, -6.8), wheel radius 6.8, barrel trunnion (-2, -13), muzzle at about (18.2, -13).
const CAN = { axle: [0, -6.8], wr: 6.8, far: [2.2, -1.2], trun: [-2, -13], muzzle: [20.6, -13.2] };
function wheel(c, L, cx, cy, r, rot, far) {
  const R = L.R, wood = L.cl(far ? tone(C.brownL, -0.25) : C.brownL);
  part(c, ring(cx, cy, r, r, R, 0.04, 10), wood, L.M, { lw: 1.6 });
  for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; brush(c, [[cx + Math.cos(a) * 1.4, cy + Math.sin(a) * 1.4], [cx + Math.cos(a) * (r - 0.9), cy + Math.sin(a) * (r - 0.9)]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0.1 }); }
  outline(c, ring(cx, cy, r - 0.5, r - 0.5, R, 0.03, 10), R, 1.1, { col: L.burnt ? C.ink : IRON, jit: 0.15 });
  part(c, ring(cx, cy, 1.8, 1.8, R, 0.1, 7), far ? tone(L.band, -0.25) : L.band, L.M, { lw: 0.9 });
}
function carriage(c, L) {
  const R = L.R;
  part(c, poly([[-17.8, -0.6], [-15.8, -3.8], [-2.2, -10.8], [5.6, -11.6], [6.8, -7.4], [2, -5.4], [-14.8, 0.6]], R, 0.3), L.cl(C.brown), L.M, { lw: 1.5 });
  brush(c, [[-14.2, -2.4], [-6, -6.4], [3.6, -9.4]], 1.7, L.band, R, { bristles: 3, dry: 0.1, taper: 0.1 });
  for (const [x, y] of [[-10.6, -3], [-3.4, -6.8], [3, -8.4]]) dab(c, x, y, 0.5, C.ink, R);
  brush(c, [[-18.6, -2.6], [-17, -0.4]], 1, C.ink, R, { bristles: 2, dry: 0 });
}
/** Barrel about the trunnion: recoil (px back), up (rad, + = muzzle down), flash = smoke + flash at the muzzle. */
function cannonBarrel(c, L, recoil = 0, up = 0) {
  const R = L.R;
  c.save(); c.translate(CAN.trun[0] - recoil, CAN.trun[1]); c.rotate(up);
  part(c, poly([[-10.4, -3.5], [19.8, -2.5], [20.4, 2.3], [-10.4, 3.3]], R, 0.2), L.cl(IRON), L.M, { lw: 1.5 });
  dab(c, -12, 0, 1.7, C.ink, R);
  const g = L.acc(GOLD);
  brush(c, [[-7.4, -3.4], [-7.2, 3.2]], 1.4, g, R, { bristles: 2, dry: 0.1 }); brush(c, [[6, -3], [6.1, 2.8]], 1, g, R, { bristles: 2, dry: 0.1 });
  brush(c, [[18.8, -2.9], [18.9, 2.7]], 1.6, g, R, { bristles: 2, dry: 0.1 });
  if (!L.burnt) brush(c, [[-5.6, -1.8], [15.6, -1.3]], 0.75, IRONL, R, { bristles: 2, dry: 0.3, taper: 0.3 });
  dab(c, 20.6, -0.1, 1.25, C.ink, R);
  dab(c, 0, 0, 1.2, L.acc(IRONL), R);
  c.restore();
}
function cannonSmoke(c, L) {
  const [mx, my] = CAN.muzzle;
  if (!L.burnt) { flameLick(c, mx, my, 1.7, L.R); spark(c, mx + 3, my, 3.2, L.R); }
  puff(c, L, mx + 8.4, my - 2, 4); puff(c, L, mx + 4.4, my - 6.4, 2.8);
}
function cannonWhole(c, o, pose) {
  const L = look(o, OWN.cannon);
  if (o.dead) { cannonDead(c, L); return; }
  const rot = pose === 'roll1' ? Math.PI / 6 + 0.15 : 0.15, fire = pose === 'fire';
  wheel(c, L, CAN.axle[0] + CAN.far[0], CAN.axle[1] + CAN.far[1], CAN.wr, rot + 0.3, true);
  carriage(c, L);
  cannonBarrel(c, L, fire ? 2.6 : 0, fire ? -0.07 : 0);
  if (fire) { c.save(); c.translate(-2.6, -1.4); cannonSmoke(c, L); c.restore(); }
  wheel(c, L, CAN.axle[0], CAN.axle[1], CAN.wr, rot, false);
}
function cannonDead(c, L) {   // knocked apart: carriage on its side, barrel in the grass, a wheel lying flat
  const R = L.R;
  c.save(); c.translate(-2, 2); c.rotate(0.22); carriage(c, L); c.restore();
  c.save(); c.translate(3, 9); c.rotate(0.08); cannonBarrel(c, L, 0, 0); c.restore();
  part(c, ring(13, -1.6, 6.6, 2.4, R, 0.06, 10), L.cl(C.brownL), L.M, { lw: 1.4 });
  for (let i = 0; i < 3; i++) brush(c, [[13 - 5.4 + i * 1.2, -1.6 - 1.4 + i * 1.4], [13 + 5.4 - i * 1.2, -1.6 + 1.4 - i * 1.4]], 0.7, C.ink, R, { bristles: 1, dry: 0 });
}

// ---------------------------------------------------------------- ship (side view, waterline y = 0, sim px at scale 1)
const SHIP = { foot: [2.2, -15], hull: 39 };
function hull(c, L) {
  const R = L.R, wood = L.cl(C.brown), dark = L.burnt ? C.ink : WOODD;
  tube(c, [[29, -19], [48.4, -28.6]], 1.7, L.cl(C.brownL), R, 0.75);   // bowsprit
  part(c, poly([[-37, -25.2], [-21, -25.6], [-20, -16], [25, -15.6], [31, -21.2], [38.8, -22.6], [34.4, -9], [25, 2], [0, 5.4], [-26, 3.4], [-35, -5], [-38.6, -15]], R, 0.3), wood, L.M, { lw: 1.9, ang: 0.05 });
  for (const ys of [[-10.8, -10.2, -11.4], [-4.4, -3.4, -4.6]]) brush(c, [[-35, ys[0]], [0, ys[1]], [31, ys[2]]], 0.6, dark, R, { bristles: 2, dry: 0.3, taper: 0.2 });
  brush(c, [[-37.4, -15.4], [-20, -13.6], [0, -12.8], [26, -13.2], [35.6, -15.8]], 2.5, L.band, R, { bristles: 4, dry: 0.1, taper: 0.05 });
  for (const x of [-16, -8, 0, 8, 16, 23]) brush(c, [[x, -15.6], [x + 0.1, -18.8]], 0.6, C.ink, R, { bristles: 1, dry: 0 });
  brush(c, [[-19.6, -18.8], [0, -18.6], [25.6, -18.8]], 0.95, C.ink, R, { bristles: 2, dry: 0.1, taper: 0 });
  part(c, poly([[-32.4, -22.6], [-27.4, -22.6], [-27.2, -18.4], [-32.2, -18.4]], R, 0.2), L.acc(C.yellow), L.M, { lw: 0.9, sharp: true });
  brush(c, [[-29.8, -22.4], [-29.8, -18.6]], 0.5, C.ink, R, { bristles: 1, dry: 0 }); brush(c, [[-32.2, -20.5], [-27.4, -20.5]], 0.5, C.ink, R, { bristles: 1, dry: 0 });
  dab(c, -36.4, -27.4, 1.5, L.acc(C.yellow), R); brush(c, [[-36.6, -25.2], [-36.4, -26.4]], 0.6, C.ink, R, { bristles: 1, dry: 0 });
  for (const x of [-14, 0, 14]) {   // gunports, a muzzle poking out of each
    part(c, poly([[x - 2.7, -9.4], [x + 2.7, -9.4], [x + 2.7, -4.4], [x - 2.7, -4.4]], R, 0.2), C.ink, L.M, { lw: 0.8, sharp: true });
    dab(c, x + 1.4, -6.9, 1.35, L.acc(IRONL), R);
  }
  part(c, poly([[8.6, -3.6], [14.6, -3.4], [14.4, -0.6], [8.4, -0.8]], R, 0.2), L.cl(C.kraftD), L.M, { lw: 0.9, sharp: true });   // a nailed-on plank patch
  if (!L.burnt) for (const x of [9.2, 13.8]) dab(c, x, -2.1, 0.4, C.ink, R);
}
function flag(c, L, v) {
  const R = L.R;
  const pts = v ? [[2.6, -76], [-6, -77.6], [-15.2, -74.4], [-13.4, -67.4], [-5, -69.6], [2.6, -68.4]] : [[2.6, -76], [-6, -74.4], [-15.6, -76.2], [-14, -68.6], [-5.6, -66.8], [2.6, -68.4]];
  part(c, poly(pts, R, 0.2), L.cl('#1f1b22'), L.M, { lw: 1.2 });
  if (L.burnt) return;
  const sx = -6.2, sy = v ? -73 : -71.8;
  dab(c, sx, sy, 1.9, C.white, R); dab(c, sx, sy + 1.7, 1.1, C.white, R);
  dab(c, sx - 0.7, sy - 0.2, 0.45, C.ink, R); dab(c, sx + 0.7, sy - 0.2, 0.45, C.ink, R);
  brush(c, [[sx - 3, sy + 1.4], [sx + 3, sy + 3.8]], 0.65, C.white, R, { bristles: 1, dry: 0 }); brush(c, [[sx - 3, sy + 3.8], [sx + 3, sy + 1.4]], 0.65, C.white, R, { bristles: 1, dry: 0 });
}
function sailPatch(c, L, x, y, w, h, col) {
  const R = L.R;
  part(c, poly([[x, y], [x + w, y + 0.2], [x + w - 0.2, y + h], [x + 0.1, y + h - 0.2]], R, 0.2), col, L.M, { lw: 0.8, sharp: true });
  for (let i = 0; i < 3; i++) { const t = (i + 0.5) / 3; brush(c, [[x + w * t - 0.6, y - 0.6], [x + w * t + 0.6, y + 0.6]], 0.35, C.ink, R, { bristles: 1, dry: 0 }); brush(c, [[x + w * t - 0.6, y + h - 0.6], [x + w * t + 0.6, y + h + 0.6]], 0.35, C.ink, R, { bristles: 1, dry: 0 }); }
}
/** Mast, crow's nest, yard, jib, main sail (team-colour stripes, patches; torn = holes and a ripped edge), flag frame v. */
function mast(c, L, v, torn) {
  const R = L.R, sail = L.cl(SAIL);
  fill(c, poly([[5, -51], [46, -29], [28, -19.4]], R, 0.3), torn ? tone(sail, -0.06) : sail, R, { sharp: false, vary: 0.05, edge: 0 });
  outline(c, poly([[5, -51], [46, -29], [28, -19.4]], R, 0.3), R, 1.2);
  tube(c, [[2.2, -14], [2.6, -75]], 2.2, L.cl(C.brown), R, 0.9);
  tube(c, [[-15.4, -57.6], [19.4, -57.2]], 1.1, L.cl(C.brown), R, 0.6);
  const S = torn ? [[-14, -56], [18, -55.6], [20.6, -46], [16.4, -42], [20.8, -36], [18.6, -25], [6, -28.4], [-13.6, -25.4], [-11, -40]]
    : [[-14, -56], [18, -55.6], [21.8, -40], [18.6, -25], [-13.6, -25.4], [-10.8, -40]];
  const SP = poly(S, R, 0.3);
  part(c, SP, sail, L.M, { lw: 1.6, ang: Math.PI / 2 });
  c.save(); path(c, spline(SP, true, 5)); c.clip();
  for (const x of [-5.2, 9.4]) brush(c, [[x - 0.4, -57], [x + 0.6, -40], [x + 0.2, -24]], 4.6, L.band, R, { bristles: 5, dry: 0.08, taper: 0 });
  c.restore();
  sailPatch(c, L, -9.6, -50.4, 5.4, 5, L.cl(C.kraft));
  sailPatch(c, L, 11.6, -35.8, 4.6, 4.4, L.cl('#e8d48a'));
  if (torn) for (const [x, y, r] of [[-2, -44, 2.2], [6, -33, 1.6]]) part(c, ring(x, y, r, r * 0.8, R, 0.25, 7), C.paperL, L.M, { lw: 0.9 });
  part(c, poly([[-3.2, -66.4], [7.8, -66.2], [6.6, -61], [-2, -61.2]], R, 0.2), L.cl(C.brownL), L.M, { lw: 1.2 });
  if (torn) { c.save(); c.translate(2.6, -75); c.rotate(0.5); c.translate(-2.6, 75); flag(c, L, v); c.restore(); }
  else flag(c, L, v);
}
function broadside(c, L) {
  for (const x of [-14, 0, 14]) { puff(c, L, x + 3.4, -11, 3.8); puff(c, L, x + 7, -14.6, 2.6); if (!L.burnt) spark(c, x + 3, -6.9, 2.6, L.R); }
}
function foam(c, L) {
  const R = L.R;
  brush(c, [[-43, 0.6], [-31, -0.8], [-19, 0.5], [-7, -0.9], [5, 0.5], [17, -0.8], [29, 0.5], [41, -0.6], [46, 0.4]], 2.2, FOAM, R, { bristles: 4, dry: 0.3, taper: 0.15 });
  for (const x of [-34, -18, -2, 14, 30]) brush(c, [[x - 2.4, 2], [x, 3], [x + 2.4, 2]], 0.7, FOAM, R, { bristles: 2, dry: 0.2, taper: 0.2 });
  for (const x of [-40, -24, 22, 38]) dab(c, x, 1.4 + (R() - 0.5), 0.6, C.pondL, R);
}
function wreck(c, L) {   // what floats up after it went down: planks, a barrel, the torn flag, bubbles, foam
  const R = L.R;
  for (const [x, y, a] of [[-15, -0.8, 0.18], [13, -0.4, -0.3], [-2, 1, 0.05], [24, 0.6, 0.4]]) { c.save(); c.translate(x, y); c.rotate(a); part(c, poly([[-5.6, -1.2], [5.6, -1.4], [5.8, 1.2], [-5.6, 1.1]], R, 0.3), L.cl(C.brown), L.M, { lw: 1, sharp: true }); c.restore(); }
  part(c, poly([[-6, -2.4], [2.4, -3.6], [4.6, -0.4], [-4.4, 0.6]], R, 0.3), L.cl('#1f1b22'), L.M, { lw: 0.9 });
  if (!L.burnt) dab(c, -0.6, -1.6, 0.9, C.white, R);
  part(c, poly([[30, -0.6], [30.4, -6.6], [36.2, -6.4], [36, -0.4]], R, 0.3), L.cl(C.brownL), L.M, { lw: 1.1 });
  brush(c, [[29.8, -3.4], [36.6, -3.4]], 0.7, C.ink, R, { bristles: 1, dry: 0 });
  if (!L.burnt) for (const [x, y, r] of [[6, -4, 1.3], [8.4, -8.6, 0.9], [-9, -4, 1], [-10.6, -8, 0.7]]) outline(c, ring(x, y, r, r, R, 0.05, 7), R, 0.6, { col: C.white, jit: 0.1 });
  foam(c, L);
}
function shipWhole(c, o, pose) {
  const L = look(o, OWN.ship);
  if (o.dead) { wreck(c, L); return; }
  mast(c, L, pose === 'bob1' ? 1 : 0, pose === 'sink');
  hull(c, L);
  if (pose === 'fire') broadside(c, L);
}
function shipPart(c, o, p) {
  const L = look(o, OWN.ship);
  if (p === 'r:hull') hull(c, L);
  else if (p === 'r:mast' || p === 'r:mast1' || p === 'r:mastS') mast(c, L, p === 'r:mast1' ? 1 : 0, p === 'r:mastS');
  else if (p === 'r:smoke') broadside(c, L);
  else if (p === 'r:foam') foam(c, L);
}

// ---------------------------------------------------------------- ship drawUnit: springs + waterline cut (OURS)
// RENDER skips the floppy rig for anything cut at the waterline, and its cut would take ~26 px off the hull, so the ship
// draws itself: hull + mast parts turned by springs (roll about the waterline middle, heave, the mast swaying on its own
// spring after the hull), the part below the water cut off in device-space strips (a horizontal waterline even when the
// ship is tilted), foam over the cut. Broadside: smoke + a heel kick. Sinking (b.act 2): bow up, down 92 px over 3 s.
export const SHIP_RIG = {
  K: { roll: [38, 2.4], heave: [30, 2.2], mast: [55, 2.2] },   // damping ratio ~0.2: rocks and settles
  swell: { roll: 0.035, rollW: 1.15, heave: 1.1, heaveW: 1.6 },
  accel: 0.00035, mastAccel: 0.0009,                            // speeding up / slowing heels the ship and sways the mast
  hit: 0.18, hitPow: 0.7,                                       // a blow rocks it a little (2500 hp: it's heavy)
  fire: { roll: -0.7, heave: 10, mast: 1.2, t: 0.4 },           // a broadside heels it and sways the mast
  sink: { t: 3, roll: -0.42, depth: 92, mast: 0.22 },
  cutBias: 0.6,                                                 // waterline px below the feet
  flagHz: 3.2,
};
// sprites.js (bake cache: is a part baked yet?) and fx.js (flames on the burning deck) import this module, so they are
// loaded lazily on the first ship drawn (both are loaded by then; read only, never edited).
let SPX = null, spxP = null, FXM = null, fxP = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; }, () => { spxP = null; }); return SPX; }
function fxm() { if (!fxP) fxP = import('./fx.js').then((m) => { FXM = m; }, () => { fxP = null; }); return FXM; }
const SHIP_FIRES = [[-24, -26, 0.9], [4, -36, 1.1], [21, -19, 0.8]];   // deck fires while it burns: hull x, y, size
const NS = 32768, LASTACT = new Int8Array(NS), ACT0 = new Float64Array(NS), SID = new Int32Array(NS).fill(-1);
const SHIP_IDX = new Map();   // ent -> pose indices
function shipIdx(ent) {
  let r = SHIP_IDX.get(ent);
  if (!r) { r = { hull: ent.pose('r:hull'), mast: ent.pose('r:mast'), mast1: ent.pose('r:mast1'), mastS: ent.pose('r:mastS'), smoke: ent.pose('r:smoke'), foam: ent.pose('r:foam') }; SHIP_IDX.set(ent, r); }
  return r;
}
function partSpr(SPm, ent, col, pi, v) {
  if (pi < 0) return null;
  const k = SPm.key(ent.id, col, pi, v, 0, 0, 0, 0);
  let s = SPm.peek(k);
  if (!s && v !== 0) { SPm.want(k); s = SPm.peek(SPm.key(ent.id, col, pi, 0, 0, 0, 0, 0)); }
  if (!s) { SPm.get(SPm.key(ent.id, col, pi, 0, 0, 0, 0, 0)); return null; }
  return s;
}
// Draw sprite s through entry matrix (a..f) and base (bx = flip * kk * S, by = kk * S, ex, ey device px), cut at device y Wy.
function blit(ctx, s, a, b, c, d, e, f, bx, by, ex, ey, Wy) {
  const ik = 1 / s.k;
  const A = bx * a * ik, Bq = by * b * ik, Cq = bx * c * ik, D = by * d * ik, E = bx * e + ex, F = by * f + ey;
  ctx.setTransform(A, Bq, Cq, D, E, F);
  const x0 = -s.ax, y0 = -s.ay, w = s.sw, h = s.sh;
  const vL = (Wy - F - Bq * x0) / D, vR = (Wy - F - Bq * (x0 + w)) / D;   // cut row (rel. anchor) at the left / right edge
  if (vL >= y0 + h && vR >= y0 + h) { ctx.drawImage(s.img, s.sx, s.sy, w, h, x0, y0, w, h); return; }
  if (vL <= y0 && vR <= y0) return;
  const n = Math.max(1, Math.min(24, Math.ceil(Math.abs(vL - vR) / 1.2))), sw = Math.ceil(w / n);
  for (let i = 0; i < n; i++) {
    const ua = i * sw, uw = Math.min(sw + 1, w - ua);
    if (uw <= 0) break;
    const v = (Wy - F - Bq * (x0 + ua + uw * 0.5)) / D;
    let hh = v - y0; if (hh <= 0) continue; if (hh > h) hh = h;
    ctx.drawImage(s.img, s.sx + ua, s.sy, uw, hh, x0 + ua, y0, uw, hh);
  }
}
function shipDraw(ctx, u, x, y, flip, k, rt, api) {
  const SPm = spx(), S = api.S, now = api.now, slot = u.id & (NS - 1), Q = SHIP_RIG;
  if (SID[slot] !== u.id) { SID[slot] = u.id; LASTACT[slot] = 0; ACT0[slot] = now; }
  fresh(slot, u, now);
  const In = inputs(slot, u, now, flip), dt = In.dt;
  const b = u.b, act = b ? b.act | 0 : 0;
  if (act !== LASTACT[slot]) {
    ACT0[slot] = b && b.actT !== undefined && now - b.actT < 1 ? b.actT : now;
    if (act === 1 && dt >= 0) { kick(slot, 0, Q.fire.roll); kick(slot, 1, Q.fire.heave); kick(slot, 2, Q.fire.mast); }
    LASTACT[slot] = act;
  }
  if (dt > 0) {
    kick(slot, 0, -In.ax * Q.accel * dt); kick(slot, 2, -In.ax * Q.mastAccel * dt);
    if (In.hit) kick(slot, 0, In.hit * (Q.hit + Q.hitPow * In.hitPow));
  }
  const ph = (u.id % 97) * 0.37, tA = now - ACT0[slot];
  const sinkE = act === 2 ? Math.min(1, Math.max(0, tA / Q.sink.t)) : 0;
  const roll = spring(slot, 0, Q.swell.roll * Math.sin(now * Q.swell.rollW + ph) + Q.sink.roll * smooth(sinkE), Q.K.roll, dt, 0.9);
  const heave = spring(slot, 1, Q.swell.heave * Math.sin(now * Q.swell.heaveW + ph * 1.7), Q.K.heave, dt, 30);
  const sway = spring(slot, 2, Q.sink.mast * sinkE, Q.K.mast, dt, 0.7);
  const down = Q.sink.depth * Math.pow(sinkE, 1.7);
  const ent = SPm ? SPm.entOf(u.type).ent : null, kk = k * (ent ? ent.scale : 1);
  const bx = flip * kk * S, by = kk * S, ex = x * S, ey = y * S, Wy = (y + Q.cutBias * kk) * S;
  const cs = Math.cos(roll), sn = Math.sin(roll), dy = heave * 0.1 + down;   // hull: turn about (0, 0), then down
  const col = api.col, v = api.v, fl = u.flash > 0 ? Math.min(1, u.flash) : 0;
  const I = ent && shipIdx(ent);
  const flagV = (Math.floor(rt * Q.flagHz + ph) & 1);
  let hullS = null, mastS = null, smokeS = null, foamS = null;
  if (I) {
    hullS = partSpr(SPm, ent, col, I.hull, v);
    mastS = partSpr(SPm, ent, col, act === 2 ? I.mastS : flagV ? I.mast1 : I.mast, v);
    foamS = partSpr(SPm, ent, col, I.foam, v);
    smokeS = act === 1 ? partSpr(SPm, ent, col, I.smoke, v) : null;
  }
  for (let pass = 0; pass < (fl > 0 ? 2 : 1); pass++) {
    if (pass === 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * 0.55; }
    if (hullS && mastS) {
      // mast: about its foot on the deck, inside the hull's turn
      const fx = SHIP.foot[0], fy = SHIP.foot[1], c2 = Math.cos(sway), s2 = Math.sin(sway);
      const me = fx - c2 * fx + s2 * fy, mf = fy - s2 * fx - c2 * fy;   // rotAbout(foot, sway)
      blit(ctx, mastS, cs * c2 - sn * s2, sn * c2 + cs * s2, -cs * s2 - sn * c2, -sn * s2 + cs * c2, cs * me - sn * mf, sn * me + cs * mf + dy, bx, by, ex, ey, Wy);
      // broadside smoke: b.side = +1 right of its heading; that side faces the viewer when side * flip > 0 (in front of the
      // hull), else it billows up from behind the far rail
      const near = (b && b.side < 0 ? -1 : 1) * flip > 0, ge = Math.min(1, tA / Q.fire.t), g = 0.75 + 0.5 * ge;
      if (smokeS && pass === 0 && !near) blit(ctx, smokeS, cs * g * 0.9, sn * g * 0.9, -sn * g * 0.9, cs * g * 0.9, 0, dy - 9 - 3 * ge, bx, by, ex, ey, 1e9);
      blit(ctx, hullS, cs, sn, -sn, cs, 0, dy, bx, by, ex, ey, Wy);
      if (smokeS && pass === 0 && near) blit(ctx, smokeS, cs * g, sn * g, -sn * g, cs * g, 0, dy - 3 * ge, bx, by, ex, ey, 1e9);
    } else {   // parts not baked yet: the whole pose, same springs + cut
      const spr = api.get(u.type, act === 1 ? 'fire' : act === 2 ? 'sink' : flagV ? 'bob1' : 'bob0', col);
      if (spr) blit(ctx, spr, cs, sn, -sn, cs, 0, dy, bx, by, ex, ey, Wy);
    }
  }
  if (fl > 0) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  if (foamS) { const fw = 1 + 0.25 * sinkE + 0.02 * Math.sin(now * 2.3 + ph); blit(ctx, foamS, fw, 0, 0, 1, 0, 0.25 * Math.sin(now * 1.9 + ph), bx, by, ex, ey, 1e9); }
  // its deck burns (sim: flammability, even afloat): flames on the stern, the sail and the bow, turned with the hull
  // (RENDER adds its own small one at the waterline)
  const F = u.burning > 0 ? fxm() : null;
  if (F && F.fireOn) for (let i = 0; i < 3; i++) {
    const [hx, hy, fs] = SHIP_FIRES[i], wy = sn * hx + cs * hy + dy;
    if (wy < -2) F.fireOn(x + flip * kk * (cs * hx - sn * hy), y + kk * wy, fs * kk, rt, ph * 0.1 + i * 0.31, i === 1);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return true;
}

// ---------------------------------------------------------------- the entries
const BOX_BIG = [64, 54, 24, 46];
export const SPRITES = {
  // deckhand: red-striped shirt, red bandana (white dots, tails flying), gold sash, cutlass held up. atk = slash.
  deckhand: crew('deckhand', {
    scale: 1.04, atk: 'atk', keys: ['idle', 'atk'], arm: (p) => (p === 'atk' ? 'atk' : 'idle'),
    legs: LUNGE(['atk']), lean: leanT({ atk: 0.1 }), open: SHUT, tails: true,
    body: (c, L) => { shirt(c, L, L.col); sash(c, L); }, hat: (c, L, tails) => bandana(c, L, tails),
  }),
  // pistol: black-striped shirt, small black tricorn, eye patch, a long flintlock. act 1 aim, act 2 shoot, atk whip,
  // reload (u.b.loaded === 0).
  pistol: crew('pistol', {
    scale: 1.04, atk: 'atk', acts: { 1: 'aim', 2: 'shoot' }, more: ['reload'], keys: ['idle', 'aim', 'shoot', 'atk', 'reload'],
    arm: (p) => (p === 'aim' || p === 'shoot' || p === 'atk' || p === 'reload' ? p : 'idle'),
    legs: LUNGE(['atk']), lean: leanT({ atk: 0.1, shoot: -0.06 }), open: SHUT,
    body: (c, L) => { shirt(c, L, L.col); sash(c, L); }, face: (c, L) => patch(c, L), hat: (c, L) => tricorn(c, L, false),
    pickMore: (u) => (hasReload(u) && !(u.attack > 0) ? 'reload' : null),
  }),
  // blunderbuss: gold-striped shirt, red sash, big black beard, floppy brown hat (band in the sash colour), the bell-mouthed
  // gun. act 1 aim, act 2 fire (flash, smoke, leaning back from the kick); u.attack > 0 = fire too.
  blunderbuss: crew('blunderbuss', {
    scale: 1.1, atk: 'fire', acts: { 1: 'aim', 2: 'fire' }, keys: ['idle', 'aim', 'fire'], sashOwn: C.red,
    arm: (p) => (p === 'aim' || p === 'fire' ? p : 'idle'),
    legs: LUNGE(['fire']), lean: leanT({ fire: -0.15, aim: 0.03 }), open: SHUT,
    body: (c, L) => { shirt(c, L, L.col); sash(c, L); }, face: (c, L, open) => beard(c, L, GINGER, true, open), hat: (c, L) => floppyHat(c, L),
  }),
  // bomber: orange-striped shirt, slate knit cap with a white pompom, soot on its face, a bag of bombs on its hip, a bomb in
  // hand. act 1 light (match to the fuse), act 2 throw, atk punch, fists (u.b.bombs <= 0).
  bomber: crew('bomber', {
    scale: 1.04, atk: 'atk', acts: { 1: 'light', 2: 'throw' }, more: ['fists'], keys: ['idle', 'light', 'throw', 'atk', 'fists'],
    arm: (p) => (p === 'light' || p === 'throw' || p === 'atk' || p === 'fists' ? p : 'idle'),
    legs: LUNGE(['throw', 'atk']), lean: leanT({ throw: 0.12, atk: 0.1 }), open: SHUT,
    body: (c, L) => { shirt(c, L, L.col); sash(c, L); bag(c, L); }, face: (c, L) => soot(c, L), hat: (c, L) => knit(c, L, '#5c6672', true),
    pickMore: (u) => (u.b && u.b.bombs <= 0 && !(u.attack > 0) ? 'fists' : null),
  }),
  // anchor: a big bald sailor (navy stripes, moustache, peg leg) dragging a ship's anchor on a chain. act 1 wind (anchor
  // swung back over his shoulder), act 2 swing (swept round in front), act 3 hook (thrown out on the chain).
  anchor: crew('anchor', {
    scale: 1.27, box: BOX_BIG, acts: { 1: 'wind', 2: 'swing', 3: 'hook' }, keys: ['idle', 'wind', 'swing', 'hook'], backKeys: ['wind'],
    arm: (p) => (p === 'wind' || p === 'swing' || p === 'hook' ? p : 'idle'), peg: true, anchor: true, heavy: 1,
    legs: LUNGE(['wind', 'swing', 'hook']), lean: leanT({ wind: -0.16, swing: 0.14, hook: 0.1 }), open: SHUT,
    body: (c, L) => { shirt(c, L, L.col); sash(c, L); },
    face: (c, L) => { stache(c, L); if (!L.burnt && !L.zom) dab(c, 2.6, -26.6, 0.9, '#ffe0c6', L.R); },
  }),
  // captain: long coat (own deep red / team colour) with gold buttons, a big black tricorn with a skull and a white plume
  // (its own floppy part), a black beard, a hook hand, a peg leg, a parrot on his back shoulder. act 1 rally (cutlass up,
  // shouting), act 2 shoot (pistol), atk = cutlass slash.
  captain: crew('captain', {
    scale: 1.1, box: [56, 58, 24, 50], atk: 'atk', acts: { 1: 'rally', 2: 'shoot' }, keys: ['idle', 'rally', 'shoot', 'atk'],
    arm: (p) => (p === 'rally' || p === 'shoot' || p === 'atk' ? p : 'idle'), peg: true, parrot: true, hatPart: true,
    legs: LUNGE(['atk']), lean: leanT({ rally: -0.05, atk: 0.1, shoot: -0.05 }), open: (p) => p === 'fly' || p === 'rally',
    body: (c, L) => coat(c, L), face: (c, L, open) => beard(c, L, BEARD, true, open), hat: (c, L) => tricorn(c, L, true),
  }),
  // gunner (spawned only: cannon crew): grey-striped shirt, brown knit cap, soot, a ramrod. atk = ramrod whack.
  gunner: crew('gunner', {
    scale: 1.04, atk: 'atk', keys: ['idle', 'atk'], arm: (p) => (p === 'atk' ? 'atk' : 'idle'),
    legs: LUNGE(['atk']), lean: leanT({ atk: 0.1 }), open: SHUT,
    body: (c, L) => { shirt(c, L, L.col); sash(c, L); }, face: (c, L) => soot(c, L), hat: (c, L) => knit(c, L, '#7a4a22', false),
  }),
  // cannon: iron barrel with gold bands on a wooden carriage, two wheels with team-colour hubs and a team-colour band. act 1
  // fire (barrel recoiled, flash + smoke); moving roll0 / roll1 (spokes turned); idle. Dead: knocked apart (lie 'none').
  // Floppy ('cannon', rig-pirates.js): wheels turn with the ground covered, the carriage rocks on the axle (speed changes,
  // hits, the shot), the barrel recoils and kicks up, the smoke puff grows from the muzzle.
  cannon: {
    box: [64, 40, 24, 34], scale: 1, own: OWN.cannon, lie: 'none',
    poses: ['idle', 'roll0', 'roll1', 'fire'], extra: ['r:wheelF', 'r:trail', 'r:barrel', 'r:smoke', 'r:wheelN'],
    paint(c, o) {
      const p = o.pose;
      if (!isPart(p)) { cannonWhole(c, o, p); return; }
      const L = look(o, OWN.cannon);
      if (p === 'r:wheelF') wheel(c, L, CAN.axle[0] + CAN.far[0], CAN.axle[1] + CAN.far[1], CAN.wr, 0.45, true);
      else if (p === 'r:wheelN') wheel(c, L, CAN.axle[0], CAN.axle[1], CAN.wr, 0.15, false);
      else if (p === 'r:trail') carriage(c, L);
      else if (p === 'r:barrel') cannonBarrel(c, L, 0, 0);
      else if (p === 'r:smoke') cannonSmoke(c, L);
    },
    pick(u, info) { const a = u.b ? u.b.act | 0 : 0; return a === 1 ? 'fire' : info.moving ? (info.walkFrame ? 'roll1' : 'roll0') : null; },
    rig: {
      driver: 'cannon', joints: { axle: CAN.axle, wr: CAN.wr, far: CAN.far, trun: CAN.trun, muzzle: CAN.muzzle },
      parts(pose) { const f = pose === 'fire'; return { wheelF: 'r:wheelF', trail: 'r:trail', barrel: 'r:barrel', wheelN: 'r:wheelN', smoke: f ? 'r:smoke' : null, fire: f ? 1 : 0 }; },
    },
  },
  // ship: a fat little ship, side view (flips by heading): brown hull with a team-colour band, 3 gunports, a stern window
  // and lantern; one mast with a crow's nest, a patched sail with team-colour stripes, a jib, a black skull flag.
  // act 1 fire (broadside smoke + flashes at the gunports; b.side picks the near or the far hull), act 2 sink (torn sail, tilting down), else bob0 / bob1 (the flag
  // flaps). Drawn by drawUnit above (springs + waterline cut); the poses are for the icon, the sheet and the fallback.
  // Dead (the sim keeps a corpse once it has gone down): debris on the water (planks, a barrel, the flag, bubbles, foam),
// lie 'none'. RENDER stamps a settled body into the ground under the water layer, so it shows ~0.75 s.
  ship: {
    box: [96, 92, 44, 82], scale: 1, own: OWN.ship, lie: 'none',
    poses: ['bob0', 'bob1', 'fire', 'sink'], extra: ['r:hull', 'r:mast', 'r:mast1', 'r:mastS', 'r:smoke', 'r:foam'],
    paint(c, o) { if (isPart(o.pose)) shipPart(c, o, o.pose); else shipWhole(c, o, o.pose); },
    pick(u, info) { const a = u.b ? u.b.act | 0 : 0; return a === 1 ? 'fire' : a === 2 ? 'sink' : (Math.floor(info.rt * SHIP_RIG.flagHz) & 1) ? 'bob1' : 'bob0'; },
    drawUnit: shipDraw,
  },
};

// ---------------------------------------------------------------- projectiles (sprites.js PROJ_SRC, drawn by fx.js)
export const PROJ = {
  // bomb: round black bomb, fuse spark flickering (3 frames, twice as fast in the last 0.5 s: p.rise = fuse left). Turns
  // with the ground it covers (rolls when it rolls, tumbles in the air), sits on the ground (lift = its radius), shadow
  // under it, lifted by p.z.
  bomb: {
    box: [16, 16, 7, 9], n: 3, lift: 3, shadow: 0.3,
    paint(c, R, v) {
      dab(c, 0, 0, 3.1, C.ink, R); dab(c, -1.1, -1.2, 0.85, '#80808a', R);
      brush(c, [[1.2, -2.6], [2.2, -4.4], [3.2, -5]], 0.8, C.brown, R, { bristles: 2, dry: 0 });
      spark(c, 3.6, -5.6, 1.6 + v * 0.45, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = p.z > 0 ? p.z : 0;
      api.shadowAt(x, y, 0.3, 0.8);
      api.put(api.bit(api.sprite, ((rt * (p.rise < 0.5 ? 30 : 14) + i * 1.3) | 0) % 3), x, y - 3 - z, 1, ((p.x || 0) + (p.y || 0) * 0.35) / 3.1);
      return true;
    },
  },
  // cannonball: iron ball with a highlight and a grey speed streak behind it, facing its flight; shadow (it skips on water).
  // p.z = its height (8 at the muzzle, cannon.js BALL.z0), so lift is just the ball's radius.
  cannonball: {
    box: [34, 12, 26, 6], n: 2, lift: 3.6, shadow: 0.36,
    paint(c, R) {
      brush(c, [[-3, -1.8], [-12, -1.6], [-22, -1.2]], 1.6, C.smokeL, R, { bristles: 3, dry: 0.5, taper: 0.9 });
      brush(c, [[-3, 1.6], [-10, 1.6], [-17, 1.2]], 1.2, C.smoke, R, { bristles: 2, dry: 0.5, taper: 0.9 });
      dab(c, 0, 0, 3.6, C.ink, R); dab(c, -1.1, -1.3, 1, '#80808a', R);
    },
  },
  // pellet: blunderbuss shot (sim kind 'pellet', blunderbuss.js): a lead ball with a short smoke streak.
  pellet: {
    box: [14, 6, 10, 3], n: 2, lift: 10,
    paint(c, R) { brush(c, [[-1, 0], [-8, 0.1]], 0.9, C.smoke, R, { bristles: 2, dry: 0.4, taper: 0.9 }); dab(c, 0, 0, 1.25, C.ink, R); },
  },
};
