// SPACE tab sprites (Part 2 step 6, OURS: no OG source). Owner: SPACE-ART. Contract: ART.md + RIG.md + STEP6.md (SPACE).
// A 7-year-old's tempera space war: lime-green aliens with huge black eyes and bobbly antennas in silver space suits,
// silver ray guns with a green glow, a jetpack, a dish-mouthed shrink ray, a glowing gravity orb, a crystal dagger, a big
// pink brain in a glass dome, an astronaut in a puffy white suit with a gold visor, and a silver flying saucer with a glass
// dome (a little alien pilot inside) and blinking lights. Every entry paints ONE frame facing RIGHT, feet at (0,0), up = -y.
//
// Colours. Aliens wear silver suits in every mode; o.col (own colour in free-for-all, team colour in Team battle) is the
// suit band: belt, collar, boots, antenna bobbles (STEP6 "team colour = a suit band"), so a red alien never reads as a
// red-shirted zombie. Astronaut: belt, helmet ring, flag patch, backpack stripe. UFO: the stripe round the dome.
// Aliens are people-shaped: human() (people.js) paints the body ring, humanLeg() the floppy legs; heads, arms, kit here.
//
// Pose picking (pick(u, info), after RENDER's dead / burnt / risen):
//   alien       act 1 'shoot' (ray gun out, green flash), atk = 'atk' (a kick: near leg up, arms back)
//   jetpack     act 1 'fire' (launcher at the shoulder, flash + back blast; flame on), act 2 'land' (standing, launcher down,
//               steam from the nozzles); z > 4: 'fly0' / 'fly1' (legs dangle, flame flickers); on the ground: idle / walk
//   shrinkray   act 1 'aim' (dish levelled), act 2 'fire' (pink rings out of the dish), atk = 'atk' (zap: dish jabbed, spark)
//   gravity     act 1 'cast' (hands up, the orb big over its head, swirls), atk = 'atk' (slap)
//   teleporter  act 1 'blink' (squeezed thin into sparkles, fades out: alpha(u)), act 2 'appear' (crouched in a portal ring,
//               sparkle burst, fades in), atk = 'atk' (dagger stab, lunging)
//   mindalien   act 1 'channel' (hands to its temples, brain glowing, psychic waves), atk = 'atk' (feeble slap)
//   ufo         act 1 'beam' (lights all on, hatch glowing; drawUnit paints the light cone down to the ground and a
//               swallowed victim rising in it), act 2 'crash' (tilted, dome cracked, smoking, lights dead); else 'fly0' /
//               'fly1' (lights blink). Dead: 'wreck' frame (saucer nose-down in the dirt, smoking), lie 'none'.
//   astronaut   z > 0.5 'hop' (floaty hop: knees up, arms out; act 1 is the hop), atk = 'atk' (big-glove punch)
//   all aliens  'fly' when tossed (u.z > 1; not jetpack / astronaut): arms and legs flung out.
// Floppy bodies (rig-space.js): people on 'spacer' (the biped plus antennas on a bouncy spring, the teleporter's scarf
// tails, a jetpack flame that flickers + legs that dangle and swing in flight, the astronaut's floaty tuck, the kick);
// the UFO on 'saucer' (tilts into its turns, hovers, the dome jiggles, the pilot sloshes about inside, crash wobble).
// Projectiles (PROJ): 'ray' (green bolt), 'shrink' (pink rings), 'minirocket' (little red rocket + flame), effects
// 'bubble' (soap bubble round a floating victim: p.r, p.z) and 'mind' (hypno swirl over a thrall: p.k, p.r, p.z).
import { C, TAU, tone, brush, ring, poly, fill, outline, part, dab, tube, spline, path } from './paint.js';
import { human, humanLeg, LEGS, flameLick } from './people.js';

// ---------------------------------------------------------------- our colours
const ALIEN = '#a2e632', ZALIEN = '#a9b98e', SUIT = '#dde2ea', SILVER = '#c4cad4', SILVERD = '#7f8796', GUNMETAL = '#555b66';
const GLOW = '#6cff4c', GLOWL = '#dcffc8', GLASS = '#bfe9ff', VISOR = '#f2ae1e', PUFF = '#f8f7f0', PUFFD = '#d8dbe1';
const PINK = '#ff83c3', PINKD = '#cf4a8c', PINKL = '#ffc3e0', ORB = '#7d66ff', ORBL = '#d2c8ff', CRYSTAL = '#8aeeff', MILK = '#e7edd6';
const SHRINK = '#ff4fa8', SHRINKL = '#ffc0dd', SPARK = '#fff36b', ROCKET = '#e3241a';
const OWN = {
  alien: '#8b45e6', jetpack: '#ff6a1a', shrinkray: '#ff3f9a', gravity: '#16b4d8', teleporter: '#ffc21a', mindalien: '#3d2c9a',
  ufo: '#22c7b8', astronaut: '#2d56c9',
};

const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:' floppy-body part
const act = (u) => (u.b ? u.b.act | 0 : 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// RENDER's frame info, kept from the last pick() (world time for alpha(), the world for victims the UFO draws itself)
let NOW = 0, WORLD = null;

// Paint look for one frame: burnt = all charcoal; man = human skin (astronaut) instead of alien green.
function look(o, man = false) {
  const burnt = o.dead === 'burnt', team = o.col === C.red || o.col === C.blue;
  return {
    o, R: o.R, M: o.M, burnt, zom: !!o.risen && !burnt, dead: o.dead, team, col: o.col,
    skin: burnt ? C.charL : man ? (o.risen ? C.zskin : C.skin) : (o.risen ? ZALIEN : ALIEN),
    cl: (x) => (burnt ? C.char : x),       // big areas
    acc: (x) => (burnt ? C.charL : x),     // small accents
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
function lines(c, R, x, y, n = 2, len = 3, gap = 2) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap]], 0.5, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.6 }); }
function puff(c, L, x, y, r) {
  const R = L.R;
  for (const [dx, dy, k, col] of [[0, 0, 1, C.smokeL], [r * 0.9, -r * 0.55, 0.8, C.smoke], [-r * 0.7, -r * 0.7, 0.72, C.smokeL]]) part(c, ring(x + dx, y + dy, r * k, r * k * 0.86, R, 0.16, 8), col, L.M, { lw: 0.8, vary: 0.06 });
}
function rotPts(pts, cx, cy, a) { const cs = Math.cos(a), sn = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]); }
/** A tilted ellipse (rot = clockwise on screen: the top leans forward). */
function oval(cx, cy, rx, ry, rot, R, irr = 0.05, n = 9) { return rotPts(ring(cx, cy, rx, ry, R, irr, n), cx, cy, rot); }
function xEye(c, x, y, s, R, w = 0.7) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
/** A 4-point sparkle (teleport glitter, zaps): col fill, thin ink edge. */
function sparkle(c, x, y, r, col, R, ink = true) {
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, k = i % 2 ? 0.32 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.08 * r), col, R, { sharp: true, vary: 0.05, edge: 0 });
  if (ink) outline(c, pts, R, Math.max(0.45, r * 0.22), { jit: 0.08, bristles: 2 });
}
/** A five-point star (suit emblem). */
function star5(c, x, y, r, col, R) {
  const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, k = i % 2 ? 0.45 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.06), col, R, { sharp: true, vary: 0.04, edge: 0 });
}
/** Ray-gun zap: a green star burst with a white middle. */
function zap(c, x, y, r, R, col = GLOW, mid = GLOWL) {
  const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.15, k = i % 2 ? 0.42 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.12), col, R, { sharp: true, vary: 0.05, edge: 0 });
  dab(c, x, y, r * 0.4, mid, R);
}
/** A flame from (x, y) pointing along ang (0 = +x), size s. */
function flameAt(c, x, y, ang, s, R) { c.save(); c.translate(x, y); c.rotate(ang); flameLick(c, 0, 0, s, R); c.restore(); }

// ---------------------------------------------------------------- gear
/** Ray gun: grip in the hand at (hx, hy), barrel along ang. flash = green zap at the tip. */
function raygun(c, L, hx, hy, ang, flash) {
  const R = L.R;
  c.save(); c.translate(hx, hy); c.rotate(ang);
  brush(c, [[0.4, -0.6], [-0.6, 1.4], [-1.4, 3]], 1.7, L.acc(SILVERD), R, { bristles: 3, dry: 0.05, taper: -0.2 });
  part(c, poly([[-2.6, -2.3], [2.6, -2.8], [4.8, -1.6], [4.9, 0.3], [2.8, 1.1], [-2.6, 0.7]], R, 0.15), L.cl(SILVER), L.M, { lw: 1 });
  for (const x of [-0.6, 1.6]) brush(c, [[x, -3.1], [x + 0.1, 1.2]], 0.95, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  brush(c, [[4.8, -0.7], [8, -0.7]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, 8.5, -0.7, 1.25, L.acc(GLOW), R); if (!L.burnt) dab(c, 8.2, -1.1, 0.45, C.white, R);
  if (flash && !L.burnt) {
    zap(c, 10.8, -0.7, 3, R);
    for (const [dx, dy] of [[13.4, -3.6], [13.8, 2.4]]) brush(c, [[dx - 1.4, dy * 0.6 - 0.7], [dx, dy - 0.7]], 0.55, GLOW, R, { bristles: 1, dry: 0.2, taper: 0.5 });
  }
  c.restore();
}
/** Mini-rocket launcher: a fat tube carried in the hand at (hx, hy), mouth along ang. loaded = rocket nose in the mouth. */
function launcher(c, L, hx, hy, ang, flash, loaded = true) {
  const R = L.R;
  c.save(); c.translate(hx, hy); c.rotate(ang); c.scale(0.86, 0.86);
  if (loaded && !flash) part(c, poly([[6.6, -1.4], [9.2, -0.2], [6.6, 1.1]], R, 0.1), L.acc(ROCKET), L.M, { lw: 0.8, sharp: true });
  part(c, poly([[-5, -2.4], [6.8, -2.6], [7.2, 1.7], [-5, 2]], R, 0.18), L.cl(SILVER), L.M, { lw: 1.1 });
  brush(c, [[-1.2, -2.6], [-1, 1.9]], 1.5, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  brush(c, [[4.6, -2.7], [4.7, 1.8]], 1.1, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  dab(c, 7, -0.4, 1.3, C.ink, R);
  brush(c, [[0.4, 1.8], [-0.2, 3.8]], 1.3, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // the grip
  if (flash && !L.burnt) { flameAt(c, 7.6, -0.4, 0, 1.2, R); puff(c, L, -7.6, -0.6, 2.2); puff(c, L, 11.8, -2.6, 1.8); }
  c.restore();
}
/** Shrink ray: (hx, hy) = the rear hand on the grip, barrel along ang; front hand sits at x 4.2 along it. rings = firing. */
function shrinkGun(c, L, hx, hy, ang, rings, spk) {
  const R = L.R;
  c.save(); c.translate(hx, hy); c.rotate(ang);
  brush(c, [[-0.2, 0.6], [-1, 3.4]], 1.6, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  part(c, poly([[-4.4, -1.8], [8.4, -1.6], [8.4, 1.4], [-4.4, 1.6]], R, 0.15), L.cl(SILVER), L.M, { lw: 1.05 });
  for (const x of [1, 3, 5]) brush(c, [[x, -2.4], [x + 0.2, 2.2]], 1.05, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  part(c, poly([[8, -1.6], [13.4, -5.4], [14.2, 4.8], [8, 1.4]], R, 0.15), L.cl(SILVER), L.M, { lw: 1.1, sharp: true });   // the dish
  fill(c, poly([[9.6, -1], [13, -3.8], [13.4, 3.2], [9.6, 0.8]], R, 0.1), L.acc(SHRINK), R, { sharp: true, edge: 0 });
  dab(c, 11.6, -0.2, 0.9, L.acc(SHRINKL), R);
  if (rings && !L.burnt) for (let i = 0; i < 3; i++) {
    const x = 16 + i * 3.2, r = 4.2 + i * 1.7, P = [];
    for (let k = 0; k <= 6; k++) { const a = -1.1 + 2.2 * k / 6; P.push([x + Math.cos(a) * r * 0.45, Math.sin(a) * r]); }
    tube(c, P, 0.9, i === 1 ? SHRINKL : SHRINK, R, 0.45);
  }
  if (spk && !L.burnt) zap(c, 14.6, -0.2, 2.6, R, SHRINK, SHRINKL);
  c.restore();
}
/** Gravity orb at (x, y), radius r: glowing violet ball, a tilted orbit ring, a glint. big = swirl + stars (casting). */
function orb(c, L, x, y, r, big) {
  const R = L.R;
  if (big && !L.burnt) for (let i = 0; i < 2; i++) {   // swirl lines round it
    const P = []; for (let k = 0; k <= 7; k++) { const a = i * Math.PI + k / 7 * 2.6; P.push([x + Math.cos(a) * r * (1.5 + k * 0.09), y + Math.sin(a) * r * (1.2 + k * 0.07)]); }
    brush(c, P, 0.8, ORBL, R, { bristles: 2, dry: 0.3, taper: 0.7 });
  }
  part(c, ring(x, y, r, r, R, 0.06, 9), L.cl(ORB), L.M, { lw: Math.max(0.9, r * 0.4) });
  if (!L.burnt) { dab(c, x - r * 0.35, y - r * 0.38, r * 0.3, C.white, R); dab(c, x + r * 0.25, y + r * 0.2, r * 0.35, tone(ORB, 0.35), R); }
  const P = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * 0.05 + k / 8 * Math.PI * 0.9; P.push([x + Math.cos(a) * r * 1.65, y + Math.sin(a) * r * 0.5 - r * 0.15]); }
  brush(c, P, Math.max(0.6, r * 0.3), L.band, R, { bristles: 2, dry: 0.1, taper: 0.1 });
  if (big && !L.burnt) for (const [dx, dy, s] of [[1.9, -1.3, 0.55], [-1.8, -1.6, 0.42], [2.1, 1.2, 0.36]]) sparkle(c, x + dx * r, y + dy * r, s * r, SPARK, R);
}
/** Crystal dagger: grip in the hand at (hx, hy), blade to (tx, ty). */
function dagger(c, L, hx, hy, tx, ty) {
  const R = L.R, dx = tx - hx, dy = ty - hy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const gx = hx + ux * 1.3, gy = hy + uy * 1.3;
  part(c, poly([[gx + nx * 1.2, gy + ny * 1.2], [tx, ty], [gx - nx * 1.2, gy - ny * 1.2]], R, 0.1), L.acc(CRYSTAL), L.M, { lw: 0.85, sharp: true });
  if (!L.burnt) brush(c, [[gx + ux * 1.5, gy + uy * 1.5], [hx + dx * 0.75, hy + dy * 0.75]], 0.4, C.white, R, { bristles: 1, dry: 0.2, taper: 0.6 });
  brush(c, [[hx - ux * 1.8, hy - uy * 1.8], [hx + ux * 0.3, hy + uy * 0.3]], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[gx - nx * 1.9, gy - ny * 1.9], [gx + nx * 1.9, gy + ny * 1.9]], 0.95, L.band, R, { bristles: 2, dry: 0.1, taper: 0.1 });
}

// ---------------------------------------------------------------- bodies + legs
const BODY_CLIP = (L, rx, ry) => spline(ring(L.M.mx * 0.6, -12.8 + L.M.my * 0.6, rx, ry, L.R, 0.04, 9), true, 5);
/** Silver space suit (human() body) with the band: belt + collar in L.band, a yellow star on the chest. */
function suit(c, L, col = SUIT, emblem = true) {
  const R = L.R;
  human(c, 'alien', L.cl(col), 'aim', L.M, L.dead, L.skin, { layer: 'body', risen: L.o.risen });
  c.save(); path(c, BODY_CLIP(L, 4.7, 5.7)); c.clip();
  brush(c, [[-6.2, -10], [0, -9.3], [6.2, -10]], 3.1, L.band, R, { bristles: 4, dry: 0.08, taper: 0 });
  brush(c, [[-4.8, -18.6], [0.4, -17.6], [5.2, -18.4]], 2.3, L.band, R, { bristles: 3, dry: 0.1, taper: 0 });
  if (!L.burnt) brush(c, [[-3.8, -16.6], [-3.4, -12.4]], 0.7, tone(col, -0.18), R, { bristles: 2, dry: 0.3, taper: 0.4 });   // a suit crease
  c.restore();
  if (emblem && !L.burnt) star5(c, 2.4, -14.2, 1.45, C.yellow, R);
}
/** The astronaut's puffy white suit: quilting, a flag patch, the belt. */
function puffSuit(c, L) {
  const R = L.R;
  human(c, 'astro', L.cl(PUFF), 'aim', L.M, L.dead, L.skin, { layer: 'body', risen: L.o.risen });
  c.save(); path(c, BODY_CLIP(L, 4.8, 5.8)); c.clip();
  brush(c, [[-6.2, -9.8], [0, -9.2], [6.2, -9.8]], 2.6, L.band, R, { bristles: 3, dry: 0.08, taper: 0 });
  if (!L.burnt) for (const y of [-15.4, -12.6]) brush(c, [[-5, y], [0, y + 0.5], [5, y]], 0.5, PUFFD, R, { bristles: 1, dry: 0.3, taper: 0.2 });
  c.restore();
  if (!L.burnt) {
    part(c, poly([[0.6, -16.6], [4.2, -16.8], [4.2, -14], [0.6, -13.8]], R, 0.12), L.band, L.M, { lw: 0.7, sharp: true });
    star5(c, 1.6, -15.6, 0.75, C.white, R);
    dab(c, 3.6, -9.6, 0.9, C.yellow, R);
  }
}
const KICK = [[[-1.8, -8], [-3.6, -0.4], [-1.4, 0]], [[1.8, -8], [6.4, -7.2], [10, -7.8]]];
const HANG = [[[-1.8, -8], [-3.2, -2.4], [-4.6, 0.6]], [[1.8, -8], [1.2, -2.4], [0, 1.2]]];
const TUCK = [[[-1.8, -8], [-5.6, -5.4], [-4.4, -1.8]], [[1.8, -8], [5.8, -6.4], [4.6, -2.4]]];
const CROUCH = [[[-1.8, -8], [-5.2, -3.6], [-3.8, 0]], [[1.8, -8], [5.4, -4.6], [5.6, 0]]];
const MYLEGS = { kick: KICK, hang: HANG, tuck: TUCK, crouch: CROUCH };
function legs(c, L, key, puffy) {
  const ls = MYLEGS[key] || LEGS[key] || LEGS.aim;
  for (const lg of ls) {
    const [fx, fy] = lg[lg.length - 1];
    if (puffy) { tube(c, lg, 2.2, L.cl(PUFF), L.R, 0.75); part(c, ring(fx + 0.4, fy - 0.9, 2, 1.4, L.R, 0.1, 7), L.cl(PUFFD), L.M, { lw: 0.9 }); }
    else { brush(c, lg, 1.9, C.ink, L.R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 }); dab(c, fx, fy - 0.4, 1.3, L.band, L.R); }
  }
}
/** One floppy leg in its rest place (hip (0, -8), foot forward), with a boot. */
function legPart(c, L, puffy) {
  if (puffy) { tube(c, [[0, -8], [0.3, -0.8], [1.6, -0.4]], 2.2, L.cl(PUFF), L.R, 0.75); part(c, ring(2, -0.9, 2, 1.4, L.R, 0.1, 7), L.cl(PUFFD), L.M, { lw: 0.9 }); return; }
  humanLeg(c, 'alien', L.M, L.burnt);
  dab(c, 2.4, -0.4, 1.3, L.band, L.R);
}

// ---------------------------------------------------------------- heads
// Alien head: a big egg, wide dome, narrow chin; two huge slanted black eyes with a glint; a tiny mouth.
const HEAD = [[-5.2, -22.4], [-5.8, -26.6], [-3.8, -30.2], [0.6, -31.6], [4.8, -30.6], [7.4, -27.4], [7.6, -23.4], [6, -20], [3.4, -18], [0.4, -17.6], [-2.8, -18.8]];
function alienEyes(c, L, glow, s = 1, dy = 0) {
  const R = L.R;
  if (L.dead) { xEye(c, 4.5, -24.2 + dy, 1.5 * s, R, 0.8); xEye(c, 0.7, -24.3 + dy, 1.25 * s, R, 0.75); return; }
  if (L.zom) {
    fill(c, oval(4.5, -24.3 + dy, 1.8 * s, 2.6 * s, 0.5, R), MILK, R, { edge: 0, vary: 0.04 });
    fill(c, oval(0.6, -24.4 + dy, 1.3 * s, 2.2 * s, -0.25, R), MILK, R, { edge: 0, vary: 0.04 });
    dab(c, 5, -23.6 + dy, 0.6 * s, C.ink, R); dab(c, 0.2, -23.8 + dy, 0.5 * s, C.ink, R);
    return;
  }
  const ec = glow ? SPARK : C.ink;
  fill(c, oval(4.5, -24.3 + dy, 1.85 * s, 2.85 * s, 0.5, R), ec, R, { edge: 0, vary: 0.05 });
  fill(c, oval(0.6, -24.4 + dy, 1.35 * s, 2.35 * s, -0.25, R), ec, R, { edge: 0, vary: 0.05 });
  if (glow) { outline(c, oval(4.5, -24.3 + dy, 1.85 * s, 2.85 * s, 0.5, R), R, 0.6, { jit: 0.08, bristles: 2 }); outline(c, oval(0.6, -24.4 + dy, 1.35 * s, 2.35 * s, -0.25, R), R, 0.55, { jit: 0.08, bristles: 2 }); }
  dab(c, 4, -25.8 + dy, 0.62 * s, C.white, R); dab(c, 0.35, -25.7 + dy, 0.45 * s, C.white, R);
}
function alienMouth(c, L, open, x = 3.9, y = -20.2) {
  const R = L.R;
  if (L.zom && !L.dead) { brush(c, [[x - 1.6, y], [x - 0.5, y + 0.6], [x + 0.6, y], [x + 1.6, y + 0.5]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); return; }
  if (open || L.dead) { dab(c, x, y + 0.1, L.dead ? 0.7 : 0.9, '#2e5a14', R); return; }
  brush(c, [[x - 1, y], [x, y + 0.45], [x + 1, y - 0.1]], 0.5, '#2e5a14', R, { bristles: 1, dry: 0, taper: 0.2 });
}
function alienHead(c, L, open) {
  part(c, poly(HEAD, L.R, 0.2), L.skin, L.M, { lw: 1.5 });
  if (!L.burnt) brush(c, [[-3.6, -28.8], [-1.6, -30.4]], 0.7, tone(L.skin, 0.35), L.R, { bristles: 2, dry: 0.4, taper: 0.5 });   // shine on the dome
  alienEyes(c, L, false);
  alienMouth(c, L, open);
}
/** Two antennas from the top of the head with bobbles in the band colour (their own floppy part). Root ~ (1.2, -30.8). */
function antennas(c, L) {
  const R = L.R, st = { bristles: 2, dry: 0, taper: 0.15 };
  brush(c, [[-0.4, -30.2], [-1.6, -33.4], [-3.4, -35.6]], 0.8, C.ink, R, st);
  brush(c, [[2.8, -30.8], [3.6, -34], [5, -36.2]], 0.8, C.ink, R, st);
  part(c, ring(-3.7, -36.1, 1.4, 1.3, R, 0.1, 7), L.band, L.M, { lw: 0.85 });
  part(c, ring(5.3, -36.7, 1.4, 1.3, R, 0.1, 7), L.band, L.M, { lw: 0.85 });
}
/** Jetpack pilot's goggles pushed up on the dome. */
function goggles(c, L) {
  const R = L.R;
  brush(c, [[-5.6, -28], [0.6, -29.6], [7, -28.6]], 1.25, L.acc('#6b4220'), R, { bristles: 2, dry: 0.1, taper: 0 });
  for (const [x, y, r] of [[4, -29.4, 1.8], [0.6, -29.9, 1.45]]) part(c, ring(x, y, r, r * 0.9, R, 0.08, 7), L.acc(GLASS), L.M, { lw: 0.9 });
  if (!L.burnt) dab(c, 3.4, -30, 0.45, C.white, R);
}
/** Teleporter's scarf: wound round the neck and up over its mouth (the tails are their own floppy part). */
function scarf(c, L) {
  const R = L.R, col = L.band;
  brush(c, [[-4.6, -18.6], [0.6, -17.6], [5.6, -18.8]], 2.4, col, R, { bristles: 3, dry: 0.1, taper: 0 });
  brush(c, [[-2.6, -19.6], [2.4, -19.4], [7, -20.4]], 2.5, col, R, { bristles: 3, dry: 0.1, taper: 0 });
  part(c, ring(-5.2, -19.2, 1.5, 1.4, R, 0.1, 7), col, L.M, { lw: 0.9 });
}
function scarfTails(c, L) {
  const R = L.R, col = L.band;
  brush(c, [[-5.4, -19.2], [-8.6, -18.6], [-11.8, -19.8]], 1.7, col, R, { bristles: 3, dry: 0.15, taper: 0.4 });
  brush(c, [[-5.2, -18.8], [-7.8, -16.6], [-10.2, -15]], 1.45, col, R, { bristles: 3, dry: 0.15, taper: 0.45 });
}
// Mind alien: a short face with sleepy lidded eyes, and on top a huge pink brain under a glass dome on a silver ring.
const FACE = [[-5, -21.2], [-5.4, -24.4], [-2.8, -25.6], [2.4, -25.8], [6.6, -24.8], [7.6, -22.4], [6.2, -19.6], [3.4, -17.8], [0.4, -17.6], [-2.8, -18.8]];
function brainHead(c, L, glow) {
  const R = L.R;
  if (glow && !L.burnt) for (let i = 0; i < 2; i++) {   // glow rings round the dome
    const r = 10.8 + i * 2.4, P = []; for (let k = 0; k <= 9; k++) { const a = Math.PI * (1.05 + 0.9 * k / 9); P.push([1 + Math.cos(a) * r, -27.4 + Math.sin(a) * r * 0.86]); }
    brush(c, P, 1.1 - i * 0.3, i ? PINKL : SPARK, R, { bristles: 2, dry: 0.35, taper: 0.3 });
  }
  part(c, poly(FACE, R, 0.2), L.skin, L.M, { lw: 1.45 });
  const bc = L.burnt ? C.charL : L.zom ? '#c9a2b4' : glow ? PINKL : PINK;
  part(c, ring(1, -29.6, 7, 5, R, 0.12, 11), bc, L.M, { lw: 1.3 });
  if (!L.burnt) for (const P of [[[-3.6, -30.6], [-2.4, -32], [-1, -30.8], [0.2, -32.2]], [[1.4, -31.2], [2.8, -32.6], [4.2, -31.4]], [[-4.6, -28], [-3, -27], [-1.6, -28.4]], [[0.4, -28.6], [1.8, -27.4], [3.4, -28.6], [5, -27.6]], [[5.2, -30.4], [6.4, -29.2]]])
    brush(c, P, 0.6, PINKD, R, { bristles: 1, dry: 0.15, taper: 0.3 });
  brush(c, [[-6.4, -25.4], [1, -24.6], [8.4, -25.6]], 1.6, L.acc(SILVER), R, { bristles: 3, dry: 0.05, taper: 0 });   // the dome ring
  const D = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * (1 + k / 10); D.push([1 + Math.cos(a) * 8.6, -25.2 + Math.sin(a) * 9.4]); }
  brush(c, D, 0.75, L.burnt ? C.ink : '#5aa6d6', R, { bristles: 2, dry: 0.2, taper: 0.1 });
  if (!L.burnt) { brush(c, [[-4.8, -31.6], [-2.6, -34]], 0.85, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 }); dab(c, -0.8, -34.4, 0.5, C.white, R); }
  // eyes: smaller, half-lidded (or glowing while it channels)
  if (L.dead) { xEye(c, 4.6, -22.6, 1.25, R, 0.7); xEye(c, 0.8, -22.6, 1.05, R, 0.65); }
  else if (L.zom) { dab(c, 4.6, -22.6, 1.3, MILK, R); dab(c, 0.8, -22.6, 1.1, MILK, R); dab(c, 5, -22.2, 0.45, C.ink, R); }
  else {
    const ec = glow ? SPARK : C.ink;
    fill(c, oval(4.6, -22.6, 1.4, 2, 0.45, R), ec, R, { edge: 0, vary: 0.05 });
    fill(c, oval(0.8, -22.6, 1.1, 1.75, -0.2, R), ec, R, { edge: 0, vary: 0.05 });
    if (glow) dab(c, 4.4, -23, 0.5, C.white, R);
    else { brush(c, [[3, -23.6], [4.6, -24.2], [6.2, -23.4]], 1.1, L.skin, R, { bristles: 2, dry: 0, taper: 0 }); brush(c, [[3, -23.4], [4.6, -23.9], [6.2, -23.2]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
  }
  alienMouth(c, L, false, 4, -19.6);
}
// Astronaut: a round white helmet, a big gold visor with a shine, a helmet ring in the band colour.
function astroHead(c, L, open) {
  const R = L.R;
  part(c, ring(0.8, -23.4, 6.9, 6.7, R, 0.06, 10), L.cl(PUFF), L.M, { lw: 1.5 });
  part(c, ring(-3.6, -23.2, 1.5, 1.8, R, 0.1, 7), L.acc(SILVER), L.M, { lw: 0.8 });
  const V = [[-0.4, -27.6], [5, -28.4], [7.6, -25.8], [7.6, -21], [5.2, -19.2], [0.2, -19.6], [-1.2, -23.4]];
  const vc = L.burnt ? C.ink : L.zom ? '#6d7f4a' : L.dead ? tone(VISOR, -0.25) : VISOR;
  part(c, poly(V, R, 0.15), vc, L.M, { lw: 1.2 });
  if (L.zom && !L.dead) { dab(c, 4.8, -24, 1, MILK, R); dab(c, 1.6, -23.8, 0.8, MILK, R); dab(c, 5.1, -23.7, 0.38, C.ink, R); }
  if (L.dead || L.zom) {   // cracked visor
    brush(c, [[2.2, -27.4], [3.4, -24.6], [2.2, -22.6], [3.8, -20]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
    brush(c, [[3.4, -24.6], [6.4, -23.8]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  } else if (!L.burnt) {
    brush(c, [[0.8, -26.2], [3.6, -27]], 0.85, C.white, R, { bristles: 2, dry: 0.2, taper: 0.4 });
    dab(c, 6, -26.2, 0.5, C.white, R);
    if (open) dab(c, 3.4, -21.2, 0.8, tone(VISOR, -0.45), R);
  }
  brush(c, [[-5.4, -17.8], [0.8, -16.8], [6.6, -17.8]], 2.1, L.band, R, { bristles: 3, dry: 0.08, taper: 0 });
}
/** Jetpack tanks on the back: silver body, nose cone in the band colour, a dark nozzle, a strap. */
function jetPack(c, L) {
  const R = L.R;
  part(c, poly([[-9.8, -20.6], [-4.8, -21], [-4.6, -9.6], [-9.6, -9.2]], R, 0.2), L.cl(SILVER), L.M, { lw: 1.2 });
  part(c, poly([[-9.8, -20.6], [-7.4, -24.6], [-4.8, -21]], R, 0.15), L.band, L.M, { lw: 1, sharp: true });
  part(c, poly([[-8.9, -9.4], [-5.4, -9.5], [-5.9, -7.3], [-8.4, -7.2]], R, 0.12), L.cl(GUNMETAL), L.M, { lw: 0.9, sharp: true });
  if (!L.burnt) { brush(c, [[-8.6, -18.6], [-8.4, -11.4]], 0.7, C.white, R, { bristles: 2, dry: 0.4, taper: 0.4 }); dab(c, -6.4, -15.2, 0.75, ROCKET, R); }
}
/** Flame out of the nozzle, pointing down (s = size). */
function jetFlame(c, L, s = 1) {
  if (L.burnt) return;
  const R = L.R;
  flameAt(c, -7.3, -7.8, Math.PI / 2 + 0.1, 2.5 * s, R);
  flameAt(c, -6.9, -7.4, Math.PI / 2 - 0.12, 1.5 * s, R);
  dab(c, -5.6, 2.6 * s, 0.6, C.fireY, R); dab(c, -8.8, 4.2 * s, 0.5, C.fireO, R); dab(c, -6.6, 5.6 * s, 0.4, C.fireY, R);
}
function jetSteam(c, L) { puff(c, L, -7.6, -4.6, 1.7); puff(c, L, -9.6, -1.8, 1.3); }
/** Astronaut's life-support backpack with an antenna. */
function astroPack(c, L) {
  const R = L.R;
  brush(c, [[-8.2, -21.6], [-8.8, -25.6]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  dab(c, -8.9, -26, 0.85, L.acc(ROCKET), R);
  part(c, poly([[-9.6, -21.8], [-3.8, -22], [-3.6, -9.6], [-9.4, -9.4]], R, 0.2), L.cl(PUFF), L.M, { lw: 1.25 });
  brush(c, [[-6.6, -20.4], [-6.5, -11]], 1.2, L.band, R, { bristles: 2, dry: 0.1, taper: 0 });
  if (!L.burnt) for (const [x, y] of [[-8.4, -13], [-4.8, -13]]) dab(c, x, y, 0.55, C.ink, R);
}

// ---------------------------------------------------------------- per-type arms (+ gear) for an arm key
const hangFar = (c, L) => { arm(c, L, [[-1.6, -15.6], [-3.4, -12.4], [-4, -10.6]]); hand(c, L, -4.1, -10.3); };
function parm(c, L, pts) { tube(c, pts, 1.9, L.cl(PUFF), L.R, 0.7); }
function glove(c, L, x, y, r = 1.5) { part(c, ring(x, y, r, r * 0.92, L.R, 0.1, 7), L.cl(PUFFD), L.M, { lw: 0.85 }); }
const ARMS = {
  alien(c, L, k) {
    if (k === 'shoot') {
      arm(c, L, [[-1.6, -15.6], [2, -15.2], [5.4, -16]]); hand(c, L, 5.6, -16);
      arm(c, L, [[2.4, -16.8], [6, -17.2], [9, -17.2]]); raygun(c, L, 9, -17.2, 0, true); hand(c, L, 9, -17.2);
      return;
    }
    if (k === 'atk') {   // kicking: arms thrown back for balance, the gun up
      arm(c, L, [[-1.6, -15.6], [-5, -16.6], [-7.8, -18.2]]); hand(c, L, -8, -18.4);
      arm(c, L, [[2.2, -16.2], [3.8, -13.2], [5.8, -12]]); raygun(c, L, 5.8, -12, 0.3, false); hand(c, L, 5.8, -12);
      lines(c, L.R, 11.6, -10.4, 3, 2.6, 1.7);
      return;
    }
    hangFar(c, L);
    arm(c, L, [[2.2, -16.2], [5, -14.6], [7, -14.2]]); raygun(c, L, 7, -14.2, -0.35, false); hand(c, L, 7, -14.2);
  },
  jetpack(c, L, k) {
    if (k === 'fire') {
      arm(c, L, [[-1.6, -15.6], [1.6, -16.4], [4.4, -17.4]]); hand(c, L, 4.6, -17.6);
      launcher(c, L, 4.6, -18.6, -0.04, true); arm(c, L, [[2.4, -16.8], [5.6, -17.6], [7.6, -17.2]]); hand(c, L, 7.6, -17.2);
      return;
    }
    if (k === 'land') {
      arm(c, L, [[-1.6, -15.6], [-4.4, -13.6], [-3.4, -10.6]]); hand(c, L, -3.2, -10.4);
      launcher(c, L, 5.4, -12, 0.55, false); arm(c, L, [[2.2, -16.2], [4.6, -14.2], [5.6, -12.6]]); hand(c, L, 5.6, -12.4);
      return;
    }
    hangFar(c, L);
    launcher(c, L, 4.4, -14.2, -0.12, false); arm(c, L, [[2.2, -16.2], [4.2, -14.6], [5.4, -14]]); hand(c, L, 5.4, -13.9);
  },
  shrinkray(c, L, k) {
    if (k === 'aim' || k === 'fire') {
      const f = k === 'fire';
      arm(c, L, [[-1.6, -15.6], [-0.4, -14.8], [0.6, -14.6]]); hand(c, L, 0.6, -14.6);
      shrinkGun(c, L, 0.6, -15.4, f ? -0.06 : 0, f, false);
      arm(c, L, [[2.4, -16.6], [4, -16.2], [4.8, -16]]); hand(c, L, 4.8, -16.2);
      return;
    }
    if (k === 'atk') {   // zap: the dish jabbed forward and down
      arm(c, L, [[-1.6, -15.6], [0.6, -14.4], [2, -13.8]]); hand(c, L, 2, -13.8);
      shrinkGun(c, L, 2, -14.4, 0.32, false, true);
      arm(c, L, [[2.4, -16.4], [5, -14.6], [6, -13]]); hand(c, L, 6, -13);
      return;
    }
    arm(c, L, [[-1.6, -15.6], [-0.6, -13], [0.2, -11.6]]); hand(c, L, 0.2, -11.6);
    shrinkGun(c, L, 0.2, -12.2, -0.6, false, false);
    arm(c, L, [[2.2, -16.2], [3.6, -15.6], [4, -14.8]]); hand(c, L, 4, -14.8);
  },
  gravity(c, L, k) {
    if (k === 'cast') {
      arm(c, L, [[-1.6, -15.8], [6.2, -19], [7.6, -26.2]]); hand(c, L, 7.8, -26.6);
      arm(c, L, [[2.4, -16.6], [8.8, -19.2], [11.4, -25.8]]); hand(c, L, 11.6, -26.2);
      orb(c, L, 10.4, -31.8, 4.3, true);
      return;
    }
    if (k === 'atk') {   // a slap, the orb kept in the other hand
      orb(c, L, -5, -10.8, 2.4, false); arm(c, L, [[-1.6, -15.6], [-3.4, -12.6], [-4, -11.6]]); hand(c, L, -4.2, -11.4);
      swoosh(c, L, [[6, -26], [11.4, -22.4], [13.4, -16]]);
      arm(c, L, [[2.4, -16.8], [6.4, -17.4], [10, -17.4]]); hand(c, L, 10.4, -17.4, 1.4);
      return;
    }
    arm(c, L, [[-1.6, -15.6], [1.6, -12.8], [4.4, -12]]); hand(c, L, 4.4, -12);
    orb(c, L, 7.4, -14.6, 3.5, false);
    arm(c, L, [[2.2, -16.2], [6, -16.6], [8.6, -17.4]]); hand(c, L, 8.8, -17.6);
  },
  teleporter(c, L, k) {
    if (k === 'atk') {   // stab: lunging, the dagger straight out
      arm(c, L, [[-1.6, -15.6], [-4.8, -14.2], [-7, -15.8]]); hand(c, L, -7.2, -16);
      arm(c, L, [[2.2, -16.6], [6.4, -16.4], [10.4, -15.8]]); dagger(c, L, 10.6, -15.8, 17.6, -15.2); hand(c, L, 10.6, -15.8);
      lines(c, L.R, 18.6, -18.4, 2, 2.4, 2.4);
      return;
    }
    hangFar(c, L);
    arm(c, L, [[2.2, -16.2], [5, -14.6], [6.6, -14]]); dagger(c, L, 6.8, -13.9, 11.4, -18.4); hand(c, L, 6.8, -13.9);
  },
  mindalien(c, L, k) {
    if (k === 'channel') {   // fingers to its temples, psychic waves out in front
      arm(c, L, [[-1.6, -15.8], [-3.4, -19.4], [-2.2, -22.8]]); hand(c, L, -2, -23);
      arm(c, L, [[2.4, -16.6], [6, -19.2], [7.6, -22.4]]); hand(c, L, 7.8, -22.6);
      if (!L.burnt) for (let i = 0; i < 3; i++) {
        const x = 11 + i * 2.6, r = 2.4 + i * 1.3, P = [];
        for (let q = 0; q <= 6; q++) { const a = -1 + 2 * q / 6; P.push([x + Math.cos(a) * r * 0.5, -24.6 + Math.sin(a) * r]); }
        brush(c, P, 0.9 - i * 0.15, i === 1 ? PINK : SPARK, L.R, { bristles: 2, dry: 0.25, taper: 0.2 });
      }
      return;
    }
    if (k === 'atk') {   // a feeble slap
      hangFar(c, L);
      swoosh(c, L, [[5, -24], [9.6, -21.4], [11.6, -16]], 0.9);
      arm(c, L, [[2.4, -16.8], [6, -17], [9, -16.6]]); hand(c, L, 9.4, -16.6, 1.25);
      return;
    }
    arm(c, L, [[-1.6, -15.6], [1.6, -13.4], [4.2, -12.8]]);
    arm(c, L, [[2.2, -16.2], [4.8, -14.6], [5, -13]]);
    hand(c, L, 4.4, -12.8, 1.15); hand(c, L, 5.2, -12.6, 1.1);
  },
  astronaut(c, L, k) {
    if (k === 'atk') {   // big-glove punch
      parm(c, L, [[-1.4, -15.8], [-4.6, -14.6], [-5.6, -16.4]]); glove(c, L, -5.8, -16.8);
      parm(c, L, [[2.2, -16.6], [6.4, -16.6], [10.2, -16.4]]); glove(c, L, 11.4, -16.4, 2.1);
      lines(c, L.R, 14.6, -18, 3, 2.6, 1.7);
      return;
    }
    if (k === 'hop' || k === 'fly') {   // arms out for balance, floating
      parm(c, L, [[-1.4, -16], [-5.2, -18.6], [-8.4, -19.8]]); glove(c, L, -9, -20);
      parm(c, L, [[2.2, -16.4], [6.2, -19.4], [9.4, -20.6]]); glove(c, L, 10, -20.8);
      return;
    }
    parm(c, L, [[-1.4, -15.8], [-3.4, -12.6], [-3.8, -11]]); glove(c, L, -3.9, -10.4);
    parm(c, L, [[2.2, -16.2], [5, -14.8], [6.4, -15.6]]); glove(c, L, 6.8, -16);
  },
};

// ---------------------------------------------------------------- one person type
// cfg: scale, box, poses (first = default), acts (b.act code -> pose), more (extra whole poses), atk ('atk' or null),
// keys (arm keys), arm(pose) -> key, legs(pose) -> leg key, lean(pose), open(pose), head ('alien' | 'brain' | 'astro'),
// hat(c, L) (over the head), tails (scarf tails part), back(c, L) (pack behind the body), flame (jetpack), puffy (astronaut),
// body(c, L), mode(pose) -> 0 ground, 1 flying (legs dangle), 2 floaty hop, 3 kick, 4 tossed; whole: poses never rigged;
// pick(u, info) -> pose or null (before the common picks).
const FLAMES = new Set(['fly0', 'fly1', 'fire']);
function spaceman(type, cfg) {
  const poses = cfg.poses;
  const acts = Object.values(cfg.acts || {}).concat(cfg.more || []).filter((p) => !poses.includes(p));
  const keys = cfg.keys.concat(['fly']);
  const man = cfg.head === 'astro';
  const parts = ['r:leg', 'r:body', 'r:head', 'r:headO'].concat(cfg.head === 'alien' ? ['r:ant'] : [], cfg.back ? ['r:back'] : [],
    cfg.flame ? ['r:flame', 'r:steam'] : [], cfg.tails ? ['r:tails'] : [], keys.map((k) => 'r:arm:' + k));
  const armOf = (p) => (p === 'fly' ? 'fly' : cfg.arm(p));
  const legOf = (p) => (p === 'fly' ? 'fly' : cfg.legs(p));
  const doArms = (c, L, k) => {
    if (L.o.risen || (k === 'fly' && !man)) { human(c, 'alien', L.cl(SUIT), k === 'fly' ? 'fly' : 'aim', L.M, L.dead, L.skin, { layer: 'arms', risen: L.o.risen }); return; }
    ARMS[type](c, L, k);
  };
  const doHead = (c, L, open, partMode) => {
    if (cfg.head === 'brain') brainHead(c, L, open);
    else if (cfg.head === 'astro') astroHead(c, L, open);
    else { if (!partMode) antennas(c, L); alienHead(c, L, open); }
    if (cfg.hat) cfg.hat(c, L);
  };
  const figure = (c, o, pose, L) => {
    const k = armOf(pose), lean = cfg.lean(pose) || 0;
    if (cfg.flame && FLAMES.has(pose) && !o.dead) { c.save(); if (lean) { c.translate(0, -8); c.rotate(lean); c.translate(0, 8); } jetFlame(c, L, pose === 'fly1' ? 0.72 : 1); c.restore(); }
    legs(c, L, legOf(pose), cfg.puffy);
    c.save(); if (lean) { c.translate(0, -8); c.rotate(lean); c.translate(0, 8); }
    if (cfg.tails) scarfTails(c, L);
    if (cfg.back) cfg.back(c, L);
    if (cfg.flame && pose === 'land' && !o.dead) jetSteam(c, L);
    cfg.body(c, L);
    doHead(c, L, cfg.open(pose), false);
    doArms(c, L, k);
    c.restore();
  };
  const whole = (c, o, pose) => {
    const L = look(o, man);
    if (pose === 'blink') {   // squeezed thin, breaking into sparkles, streaks going up
      c.save(); c.translate(0, -14); c.scale(0.52, 1.14); c.translate(0, 14); figure(c, o, 'idle', L); c.restore();
      if (!L.burnt) {
        for (const [x, y, r, w] of [[-7, -30, 2.2, 1], [8, -24, 1.8, 0], [-8, -13, 1.6, 0], [7.4, -8, 2, 1], [0.4, -39, 2.4, 1], [9.6, -34, 1.3, 0]]) sparkle(c, x, y, r, w ? C.white : L.band, L.R);
        for (const x of [-4.4, 0.4, 4.6]) brush(c, [[x, -36], [x + 0.2, -44 - Math.abs(x)]], 0.6, L.band, L.R, { bristles: 2, dry: 0.3, taper: 0.8 });
      }
      return;
    }
    if (pose === 'appear') {   // crouched in a portal ring, a sparkle burst
      if (!L.burnt) { c.save(); c.globalAlpha = 0.85; fill(c, ring(0.4, -0.4, 10.6, 3, L.R, 0.06, 11), tone(L.band, 0.55), L.R, { edge: 0 }); c.restore(); }
      outline(c, ring(0.4, -0.4, 10.6, 3, L.R, 0.06, 11), L.R, 1.4, { col: L.band, jit: 0.15 });
      figure(c, o, 'appear', L);
      if (!L.burnt) for (const [x, y, r] of [[-10, -18, 1.9], [11, -22, 2.1], [-6, -32, 1.5], [9, -9, 1.4], [3, -38, 1.8]]) sparkle(c, x, y, r, r > 1.7 ? C.white : L.band, L.R);
      return;
    }
    figure(c, o, pose, L);
  };
  const paintPart = (c, o, p) => {
    const L = look(o, man);
    if (p === 'r:leg') { legPart(c, L, cfg.puffy); return; }
    if (p === 'r:body') { cfg.body(c, L); return; }
    if (p === 'r:head' || p === 'r:headO') { doHead(c, L, p === 'r:headO', true); return; }
    if (p === 'r:ant') { antennas(c, L); return; }
    if (p === 'r:back') { if (cfg.back) cfg.back(c, L); return; }
    if (p === 'r:flame') { jetFlame(c, L, 1); return; }
    if (p === 'r:steam') { jetSteam(c, L); return; }
    if (p === 'r:tails') { scarfTails(c, L); return; }
    const k = p.slice(6);   // 'r:arm:<key>'
    doArms(c, L, k);
  };
  const acts0 = cfg.acts || {}, atk = cfg.atk;
  return {
    box: cfg.box || [56, 58, 26, 46], scale: cfg.scale, own: OWN[type],
    poses, extra: acts.concat(['fly'], parts),
    paint(c, o) {
      const p = o.pose;
      if (isPart(p)) { paintPart(c, o, p); return; }
      whole(c, o, o.dead ? (man || cfg.flame ? 'idle' : poses[0]) : p);
    },
    pick(u, info) {
      NOW = info.now; WORLD = info.world;
      if (cfg.pick) { const q = cfg.pick(u, info); if (q) return q; }
      if ((u.z || 0) > 1) return 'fly';
      const a = act(u);
      if (a > 0 && acts0[a]) return acts0[a];
      return atk && u.attack > 0 ? atk : null;
    },
    alpha: cfg.alpha || undefined,
    rig: {
      driver: 'spacer',
      joints: { hip: [0, -8], neck: [0.5, -17.6], shoulder: [1, -16.4], legX: 1.8, ant: [1.2, -30.8], knot: [-5.4, -19], nozzle: [-7.1, -7.4] },
      parts(pose) {
        if (cfg.whole && cfg.whole.includes(pose)) return null;
        const k = armOf(pose);
        return {
          leg: 'r:leg', body: 'r:body', head: cfg.open(pose) ? 'r:headO' : 'r:head', ant: cfg.head === 'alien' ? 'r:ant' : null,
          arm: 'r:arm:' + k, back: cfg.back ? 'r:back' : null, tails: cfg.tails ? 'r:tails' : null,
          flame: cfg.flame && FLAMES.has(pose) ? 'r:flame' : null, steam: cfg.flame && pose === 'land' ? 'r:steam' : null,
          lean: cfg.lean(pose) || 0, mode: pose === 'fly' ? (man ? 2 : 4) : cfg.mode ? cfg.mode(pose) : 0, puffy: cfg.puffy ? 1 : 0,
        };
      },
    },
  };
}
const SHUT = () => false;
const leanT = (t) => (p) => t[p] || 0;
const STAND = (p) => (p === 'walk0' || p === 'walk1' ? p : 'aim');
const LUNGE = (set) => (p) => (set.includes(p) ? 'walk0' : STAND(p));
const P4 = ['idle', 'walk0', 'walk1', 'atk'];

// ---------------------------------------------------------------- UFO (silver saucer, side view, flips by heading)
// Rest layout (sprite px): the anchor (0, 0) = the bottom of the hatch (it hovers at u.z over its shadow); the rim (widest,
// half-width 21) at y -8, the dome base at y -12.6, the dome top at y -21.6. The beam cone hangs from (0, 0) down CONE_L px
// (drawUnit stretches it to the ground).
const CONE_L = 64;
const HULL = [[-21.4, -8], [-17, -11], [-11, -12.8], [0, -13.4], [11, -12.8], [17, -11], [21.4, -8], [18, -5.2], [10, -3.4], [0, -2.8], [-10, -3.4], [-18, -5.2]];
const LIGHTS = [[-16.4, -7.4], [-8.4, -6.6], [0, -6.4], [8.4, -6.6], [16.4, -7.4]];
const LCOL = [C.yellow, '#ff4a3a', '#5dff5a', '#ff4a3a', C.yellow];
const DOME = [[-9.6, -12.4], [-8.8, -16.4], [-5.8, -20.2], [0, -21.8], [5.8, -20.2], [8.8, -16.4], [9.6, -12.4]];
function lookU(o) { return look(o, false); }
function hull(c, L) {
  const R = L.R;
  part(c, poly([[-5.6, -3.6], [5.6, -3.6], [3.8, -0.4], [-3.8, -0.4]], R, 0.12), L.cl(GUNMETAL), L.M, { lw: 1, sharp: true });   // hatch
  part(c, poly(HULL, R, 0.25), L.cl(SILVER), L.M, { lw: 1.7, ang: 0.08 });
  brush(c, [[-21, -8.1], [-10, -7.2], [0, -7], [10, -7.2], [21, -8.1]], 1.7, L.cl(SILVERD), R, { bristles: 3, dry: 0.1, taper: 0.05 });   // rim
  brush(c, [[-10.6, -12.2], [0, -12.8], [10.6, -12.2]], 2.2, L.band, R, { bristles: 3, dry: 0.08, taper: 0 });               // dome stripe
  if (!L.burnt) {
    brush(c, [[-15.6, -10.2], [-8, -11.6]], 0.8, C.white, R, { bristles: 2, dry: 0.4, taper: 0.5 });
    brush(c, [[-12, -4.6], [0, -3.8], [12, -4.6]], 0.6, tone(SILVER, -0.25), R, { bristles: 2, dry: 0.3, taper: 0.3 });
    for (const x of [-13.4, 13.4]) dab(c, x, -9.8, 0.42, C.ink, R);
  }
}
/** Rim lights: on = which are lit (bit i = light i). */
function lights(c, L, on) {
  const R = L.R;
  for (let i = 0; i < LIGHTS.length; i++) {
    const [x, y] = LIGHTS[i], lit = (on >> i) & 1 && !L.burnt && !L.dead;
    part(c, ring(x, y, 1.45, 1.25, R, 0.1, 7), lit ? LCOL[i] : L.cl(tone(LCOL[i], -0.55)), L.M, { lw: 0.8 });
    if (lit) dab(c, x - 0.4, y - 0.4, 0.4, C.white, R);
  }
}
function domeBack(c, L) { fill(c, poly(DOME, L.R, 0.15), L.cl(GLASS), L.R, { edge: 0, vary: 0.06 }); }
function domeFront(c, L, cracked) {
  const R = L.R;
  outline(c, poly(DOME, R, 0.15), R, 1.35, { gap: true });
  brush(c, [[-8.8, -14.2], [0, -14.6], [8.8, -14.2]], 1, L.band, R, { bristles: 2, dry: 0.15, taper: 0.1 });   // tint stripe
  if (!L.burnt) { brush(c, [[-6.4, -15.6], [-5.2, -18.4], [-2.6, -20.2]], 0.9, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 }); dab(c, 4.4, -19.2, 0.5, C.white, R); }
  if (cracked) { brush(c, [[2, -21.2], [3, -18.4], [1.6, -16.6], [3.4, -14.4]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); brush(c, [[3, -18.4], [6.2, -17.6]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
}
/** The little alien pilot in the dome (head + shoulders, antennas). */
function pilot(c, L, scared) {
  const R = L.R;
  part(c, ring(0.6, -13.6, 3.4, 2, R, 0.1, 7), L.cl(SUIT), L.M, { lw: 0.9 });
  brush(c, [[0, -19.4], [-0.8, -21], [-1.8, -21.6]], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  brush(c, [[1.8, -19.6], [2.4, -21.2], [3.4, -21.6]], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  dab(c, -1.9, -21.7, 0.7, L.band, R); dab(c, 3.5, -21.7, 0.7, L.band, R);
  part(c, poly([[-2.4, -16.4], [-2.4, -18.6], [0.4, -19.8], [3.2, -19], [4, -16.6], [2.4, -14.6], [0, -14.6]], R, 0.1), L.skin, L.M, { lw: 0.95 });
  if (L.dead) { xEye(c, 2.4, -17.4, 0.7, R, 0.45); xEye(c, 0.2, -17.4, 0.6, R, 0.45); return; }
  fill(c, oval(2.4, -17.4, 0.85, 1.25, 0.45, R), C.ink, R, { edge: 0 });
  fill(c, oval(0.3, -17.4, 0.7, 1.1, -0.2, R), C.ink, R, { edge: 0 });
  if (scared) dab(c, 1.8, -15.4, 0.45, '#2e5a14', R);
}
/** The hatch glowing (beam on). */
function hatchGlow(c, L) {
  if (L.burnt) return;
  const R = L.R;
  dab(c, 0, -1.6, 4.4, tone(C.yellow, 0.5), R); dab(c, 0, -1.6, 2.6, C.white, R);
  for (const a of [0.5, 1.2, 1.9, 2.6]) brush(c, [[Math.cos(a) * 4.6, -1.6 + Math.sin(a) * 2.8], [Math.cos(a) * 6.8, -1.6 + Math.sin(a) * 4.2]], 0.55, C.yellow, R, { bristles: 1, dry: 0.2, taper: 0.5 });
}
function crashSmoke(c, L) {
  puff(c, L, -15.6, -14.4, 4.2); puff(c, L, -21.4, -21.4, 2.8);
  if (!L.burnt) { flameAt(c, -12, -9, -1.9, 1.15, L.R); sparkle(c, 15, -12, 1.8, SPARK, L.R); sparkle(c, 9, -3, 1.3, SPARK, L.R); }
}
/** The tractor beam: a pale yellow cone from the hatch (0, 0) to y CONE_L, light streaks, rings, a pool at the bottom.
 *  Painted see-through (the victim shows inside); drawUnit stretches it to the ground. */
function cone(c, L) {
  const R = L.R, w0 = 5, w1 = 19, H = CONE_L;
  c.save();
  c.globalAlpha = 0.42; fill(c, poly([[-w0, 0], [w0, 0], [w1, H], [-w1, H]], R, 0.3), '#fff3a6', R, { sharp: true, edge: 0, vary: 0.08 });
  c.globalAlpha = 0.42; fill(c, ring(0, H, w1 + 1, 5.2, R, 0.08, 11), '#fff6b8', R, { edge: 0 });
  c.globalAlpha = 0.55;
  for (const t of [-0.7, -0.2, 0.3, 0.75]) brush(c, [[t * w0, 1], [t * (w0 + w1) * 0.5, H * 0.5], [t * w1, H - 2]], 1.2, '#fffbe0', R, { bristles: 2, dry: 0.5, taper: 0.4 });
  c.globalAlpha = 0.7;
  for (const f of [0.28, 0.55, 0.82]) { const w = w0 + (w1 - w0) * f; outline(c, ring(0, H * f, w, 1.6 + f * 2.2, R, 0.05, 10), R, 0.7, { col: '#ffe14a', jit: 0.1, gap: true }); }
  c.globalAlpha = 0.9;
  for (const [x, y] of [[-6, 18], [7, 30], [-11, 44], [10, 52], [2, 40]]) sparkle(c, x, y, 1.2, C.white, R, false);
  c.restore();
  outline(c, [[-w0, 0.5], [-w1, H]], R, 0.55, { col: '#e8c21a', jit: 0.2, over: 0, gap: true });
  outline(c, [[w0, 0.5], [w1, H]], R, 0.55, { col: '#e8c21a', jit: 0.2, over: 0, gap: true });
}
/** A wrecked saucer nose-down in the dirt: tilted hull, cracked dome, a dead light, smoke. */
function wreck(c, L) {
  const R = L.R;
  part(c, ring(2, 1.2, 22, 3.4, R, 0.12, 12), L.cl(C.kraftD), L.M, { lw: 1 });   // the dirt it ploughed up
  c.save(); c.translate(0, -2); c.rotate(0.3); c.translate(0, 8);
  domeBack(c, L); pilot(c, L, true); domeFront(c, L, true); hull(c, L); lights(c, L, 0);
  c.restore();
  puff(c, L, -15, -11, 4.2); if (!L.burnt) puff(c, L, -20, -18.6, 2.8);
  for (const [x, y, a] of [[18, 1, 0.4], [-20, 2, -0.3]]) { c.save(); c.translate(x, y); c.rotate(a); part(c, poly([[-2.6, -0.8], [2.6, -1], [2.4, 0.9], [-2.6, 0.8]], R, 0.2), L.cl(SILVERD), L.M, { lw: 0.8, sharp: true }); c.restore(); }
}
function ufoWhole(c, o, pose) {
  const L = lookU(o);
  if (o.dead) { wreck(c, L); return; }
  const crash = pose === 'crash';
  c.save();
  if (crash) { c.translate(0, -8); c.rotate(0.32); c.translate(0, 8); }
  domeBack(c, L); pilot(c, L, crash || pose === 'beam'); domeFront(c, L, crash);
  hull(c, L);
  lights(c, L, crash ? 0 : pose === 'beam' ? 31 : pose === 'fly1' ? 10 : 21);
  if (pose === 'beam') hatchGlow(c, L);
  if (crash) crashSmoke(c, L);
  c.restore();
}
function ufoPart(c, o, p) {
  const L = lookU(o);
  switch (p) {
    case 'r:domeB': domeBack(c, L); return;
    case 'r:pilot': pilot(c, L, false); return;
    case 'r:pilotS': pilot(c, L, true); return;
    case 'r:domeF': domeFront(c, L, false); return;
    case 'r:domeX': domeFront(c, L, true); return;
    case 'r:hull': hull(c, L); return;
    case 'r:lit0': lights(c, L, 21); return;
    case 'r:lit1': lights(c, L, 10); return;
    case 'r:litA': lights(c, L, 31); return;
    case 'r:litX': lights(c, L, 0); return;
    case 'r:glow': hatchGlow(c, L); return;
    case 'r:smoke': crashSmoke(c, L); return;
    case 'r:cone': cone(c, L); return;
  }
}

// ---------------------------------------------------------------- UFO drawUnit: the beam cone (+ a swallowed victim)
// Runs before the body and returns false (RENDER then draws the saucer, rigged or whole, over the cone). While beaming
// (b.act 1) the cone hangs from the hatch to the ground (stretched to u.z), shimmering. If the sim has already marked the
// victim `inside` (RENDER skips it) while it is still rising, it is drawn here in the cone, shrinking and turning.
// sprites.js is loaded lazily (bake cache: is the cone baked yet?); read only.
let SPX = null, spxP = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; }, () => { spxP = null; }); return SPX; }
let coneIdx = -2;
function ufoDraw(ctx, u, x, y, flip, k, rt, api) {
  if (act(u) !== 1) return false;
  const SPm = spx(); if (!SPm) return false;
  const z = u.z || 0; if (z < 6) return false;
  const ent = SPm.entOf(u.type).ent, kk = k * ent.scale, S = api.S;
  if (coneIdx === -2) coneIdx = ent.pose('r:cone');
  if (coneIdx < 0) return false;
  const key = SPm.key(ent.id, api.col, coneIdx, api.v, 0, 0, 0, 0);
  let s = SPm.peek(key);
  if (!s) { SPm.want(key); s = SPm.peek(SPm.key(ent.id, api.col, coneIdx, 0, 0, 0, 0, 0)); }
  if (!s) { SPm.get(SPm.key(ent.id, api.col, coneIdx, 0, 0, 0, 0, 0)); return false; }
  const ph = (u.id % 13) * 0.7, wsc = 1 + 0.06 * Math.sin(rt * 9 + ph), m = S / s.k;
  ctx.globalAlpha = 0.82 + 0.18 * Math.sin(rt * 23 + ph);
  ctx.setTransform(flip * kk * m * wsc, 0, 0, (z / CONE_L) * m, x * S, y * S);
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax, -s.ay, s.sw, s.sh);
  ctx.globalAlpha = 1;
  const b = u.b, vic = WORLD && b && b.victim >= 0 && WORLD.unitById ? WORLD.unitById(b.victim) : null;
  if (vic && vic.inside >= 0 && (vic.z || 0) < z - 2) {
    const ve = SPm.entOf(vic.type).ent, vr = Math.min(1.7, Math.max(0.35, (vic.radius || ve.defR) / ve.defR));
    const f = clamp01((vic.z || 0) / z), spr = api.get(vic.type, 'fly', vic.team === 0 ? 1 : vic.team === 1 ? 2 : 0);
    api.put(spr, vic.x, y + z - (vic.z || 0), Math.cos(vic.heading || 0) >= 0 ? 1 : -1, ve.scale * vr * (1 - 0.45 * f), 0.5 * Math.sin(rt * 3 + ph));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return false;
}

// ---------------------------------------------------------------- the entries
export const SPRITES = {
  // alien: the plain trooper. Silver suit, violet band, ray gun. act 1 shoot, atk = kick.
  alien: spaceman('alien', {
    scale: 0.94, poses: P4, atk: 'atk', acts: { 1: 'shoot' }, keys: ['idle', 'shoot', 'atk'], head: 'alien',
    arm: (p) => (p === 'shoot' || p === 'atk' ? p : 'idle'), legs: (p) => (p === 'atk' ? 'kick' : STAND(p)),
    lean: leanT({ atk: -0.16, shoot: -0.03 }), open: (p) => p === 'fly', body: (c, L) => suit(c, L), mode: (p) => (p === 'atk' ? 3 : 0),
  }),
  // jetpack: alien with silver tanks on its back (band-colour nose cone), goggles up on its dome, a mini-rocket launcher.
  // Flies at z 40 (fly0 / fly1: legs dangle, the flame flickers), act 1 fire, act 2 land (standing, steaming), on the
  // ground (z <= 4) idle / walk0 / walk1.
  jetpack: spaceman('jetpack', {
    scale: 0.98, box: [60, 66, 28, 48], poses: ['fly0', 'fly1', 'fire', 'land'], more: ['idle', 'walk0', 'walk1'], atk: null, acts: { 1: 'fire', 2: 'land' },
    keys: ['idle', 'fire', 'land'], head: 'alien', hat: goggles, back: jetPack, flame: true,
    arm: (p) => (p === 'fire' || p === 'land' ? p : 'idle'), legs: (p) => (FLAMES.has(p) ? 'hang' : STAND(p)),
    lean: leanT({ fly0: 0.1, fly1: 0.1, fire: 0.02 }), open: (p) => p === 'fly', body: (c, L) => suit(c, L), mode: (p) => (FLAMES.has(p) ? 1 : 0),
    pick(u, info) {   // act 2 while still coming down to refuel (z > 4, not webbed) keeps its flame on
      const a = act(u), up = (u.z || 0) > 4;
      if (a === 2 && !(up && !(u.webbed > info.now))) return 'land';
      if (a === 1) return 'fire';   // landed and firing: the rig stands it up with no flame (rig-space.js)
      if (up) return (Math.floor(info.rt * 10 + u.id * 0.37) & 1) ? 'fly1' : 'fly0';
      return info.moving ? (info.walkFrame ? 'walk1' : 'walk0') : 'idle';
    },
  }),
  // shrinkray: alien with a dish-mouthed shrink ray (band-colour coils). act 1 aim, act 2 fire (rings), atk = zap.
  shrinkray: spaceman('shrinkray', {
    scale: 0.94, poses: P4, atk: 'atk', acts: { 1: 'aim', 2: 'fire' }, keys: ['idle', 'aim', 'fire', 'atk'], head: 'alien',
    arm: (p) => (p === 'aim' || p === 'fire' || p === 'atk' ? p : 'idle'), legs: LUNGE(['atk', 'fire']),
    lean: leanT({ fire: -0.08, atk: 0.08 }), open: (p) => p === 'fly' || p === 'fire', body: (c, L) => suit(c, L),
  }),
  // gravity: alien holding a glowing violet gravity orb with a band-colour orbit ring. act 1 cast (hands up, the orb big over
  // its head), atk = slap. The bubble round its victim is the PROJ 'bubble'.
  gravity: spaceman('gravity', {
    scale: 0.94, poses: P4, atk: 'atk', acts: { 1: 'cast' }, keys: ['idle', 'cast', 'atk'], head: 'alien',
    arm: (p) => (p === 'cast' || p === 'atk' ? p : 'idle'), legs: LUNGE(['atk']),
    lean: leanT({ cast: -0.1, atk: 0.1 }), open: (p) => p === 'fly' || p === 'cast', body: (c, L) => suit(c, L),
  }),
  // teleporter: alien with a band-colour scarf over its mouth (tails flying) and a crystal dagger. act 1 blink (squeezed
  // into sparkles, fading out), act 2 appear (crouched in a portal ring, fading in): both drawn whole. atk = stab.
  teleporter: spaceman('teleporter', {
    scale: 0.94, poses: P4, atk: 'atk', acts: { 1: 'blink', 2: 'appear' }, keys: ['idle', 'atk'], head: 'alien', hat: scarf, tails: true,
    arm: (p) => (p === 'atk' ? 'atk' : 'idle'), legs: (p) => (p === 'appear' ? 'crouch' : p === 'atk' ? 'dash' : STAND(p)),
    lean: leanT({ atk: 0.2, appear: 0.12 }), open: SHUT, body: (c, L) => suit(c, L), whole: ['blink', 'appear'],
    alpha(u) {   // blink out over 0.25 s, appear over 0.25 s (the sparkles stay a little visible)
      const a = act(u); if (a !== 1 && a !== 2) return 1;
      const t = clamp01((NOW - (u.b.actT ?? NOW)) / 0.25);
      return a === 1 ? 1 - 0.8 * t : 0.3 + 0.7 * t;
    },
  }),
  // mindalien: a big pink brain under a glass dome, sleepy lidded eyes, hands clasped. act 1 channel (fingers to temples,
  // brain + eyes glowing, psychic waves; b.victim gets the PROJ 'mind' swirl), atk = feeble slap.
  mindalien: spaceman('mindalien', {
    scale: 0.94, box: [56, 62, 26, 50], poses: P4, atk: 'atk', acts: { 1: 'channel' }, keys: ['idle', 'channel', 'atk'], head: 'brain',
    arm: (p) => (p === 'channel' || p === 'atk' ? p : 'idle'), legs: STAND,
    lean: leanT({ channel: -0.06, atk: 0.06 }), open: (p) => p === 'channel', body: (c, L) => suit(c, L),
  }),
  // ufo: silver saucer, glass dome with a little alien pilot, band-colour stripe round the dome, 5 rim lights. fly0 / fly1
  // (lights blink), act 1 beam (all lights on, hatch glowing + the cone drawn by drawUnit), act 2 crash (tilted, cracked,
  // smoking). Dead: wreck (lie 'none'). Floppy ('saucer', rig-space.js).
  ufo: {
    box: [104, 128, 52, 46], scale: 1, own: OWN.ufo, lie: 'none', flying: true,
    poses: ['fly0', 'fly1', 'beam', 'crash'],
    extra: ['r:domeB', 'r:pilot', 'r:pilotS', 'r:domeF', 'r:domeX', 'r:hull', 'r:lit0', 'r:lit1', 'r:litA', 'r:litX', 'r:glow', 'r:smoke', 'r:cone'],
    paint(c, o) { if (isPart(o.pose)) ufoPart(c, o, o.pose); else ufoWhole(c, o, o.dead ? 'fly0' : o.pose); },
    pick(u, info) {
      NOW = info.now; WORLD = info.world;
      const a = act(u); if (a === 2) return 'crash'; if (a === 1) return 'beam';
      return (Math.floor(info.rt * 2.6 + (u.id % 5) * 0.4) & 1) ? 'fly1' : 'fly0';
    },
    drawUnit: ufoDraw,
    rig: {
      driver: 'saucer',
      joints: { pivot: [0, -8], dome: [0, -12.6], pilot: [0.6, -13.4] },
      parts(pose) {
        const crash = pose === 'crash', beam = pose === 'beam';
        return {
          domeB: 'r:domeB', pilot: crash || beam ? 'r:pilotS' : 'r:pilot', domeF: crash ? 'r:domeX' : 'r:domeF', hull: 'r:hull',
          lit: crash ? 'r:litX' : beam ? 'r:litA' : pose === 'fly1' ? 'r:lit1' : 'r:lit0', glow: beam ? 'r:glow' : null, smoke: crash ? 'r:smoke' : null,
          crash: crash ? 1 : 0, beam: beam ? 1 : 0,
        };
      },
    },
  },
  // astronaut: a person in a puffy white suit, round white helmet with a gold visor, band-colour helmet ring + belt + flag
  // patch, a life-support backpack. z > 0.5 hop (floaty: knees up, arms out), atk = big-glove punch.
  astronaut: spaceman('astronaut', {
    scale: 1.04, poses: P4, atk: 'atk', acts: { 1: 'hop' }, keys: ['idle', 'atk', 'hop'], head: 'astro', back: astroPack, puffy: true,
    arm: (p) => (p === 'atk' || p === 'hop' ? p : 'idle'), legs: (p) => (p === 'hop' ? 'tuck' : LUNGE(['atk'])(p)),
    lean: leanT({ atk: 0.1, hop: -0.05 }), open: (p) => p === 'hop', body: (c, L) => puffSuit(c, L), mode: (p) => (p === 'hop' ? 2 : 0),
    pick(u) { return (u.z || 0) > 0.5 ? 'hop' : null; },
  }),
};

// ---------------------------------------------------------------- projectiles + effects (sprites.js PROJ_SRC, fx.js draws)
/** Draw sprite spr centred on its anchor at sim (x, y) with x / y scale and a turn (non-uniform: fx's put can't). */
function putS(api, spr, x, y, sx, sy, rot) {
  if (!spr || !api.ctx) return;
  const ctx = api.ctx, S = api.S, m = S / spr.k, cs = Math.cos(rot), sn = Math.sin(rot);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
/** Height of a shot: p.z, or a bullet-style rise / drop, or an arc from p.apex over its life. */
function shotZ(p) {
  if (p.z > 0) return p.z;
  if (p.rise > 0) { const sp = Math.hypot(p.vx || 0, p.vy || 0); return Math.max(0, p.rise - (p.drop || 0) * sp * ((p.maxLife || 0) - (p.life || 0))); }
  if (p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; return 4 * p.apex * f * (1 - f); }
  return 0;
}
/** The unit an effect follows: p.z (the sim's rideOn copies it), else looked up by id (p.host, SPACE-SIM's spawnEffect),
 *  else dflt. */
function followZ(p, dflt) {
  if (p.z > 0) return p.z;
  const id = p.host >= 0 ? p.host : p.vid ?? p.victim ?? p.target;
  if (id >= 0 && WORLD && WORLD.unitById) { const v = WORLD.unitById(id); if (v) return v.z || 0; }
  return dflt;
}
export const PROJ = {
  // ray: alien / UFO ray-gun bolt: a fat green dash, white-hot core, glowing head with an ink rim. Faces its flight.
  ray: {
    box: [28, 10, 18, 5], n: 3, boil: true, lift: 9,
    paint(c, R) {
      outline(c, [[3.4, -2.6], [-4, -1.9], [-14.6, -0.5], [-15.4, 0.3], [-4, 1.9], [3.4, 2.6]], R, 0.8, { jit: 0.15, over: 0, gap: true, bristles: 2 });
      brush(c, [[3, 0], [-5, 0.1], [-15, 0]], 3.6, '#c8ff4a', R, { bristles: 4, taper: 0.92, dry: 0.3, vary: 0.06 });
      brush(c, [[3, 0], [-4, 0], [-10, 0]], 1.5, C.white, R, { bristles: 2, taper: 0.9, dry: 0.25 });
      fill(c, ring(3, 0, 2.7, 2.2, R, 0.12, 8), GLOW, R, { edge: 0, vary: 0.06 });
      outline(c, ring(3, 0, 2.8, 2.3, R, 0.1, 8), R, 0.85, { jit: 0.12, bristles: 2 });
      dab(c, 3.5, -0.3, 1.15, C.white, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = shotZ(p), v = ((rt * 10 + i) | 0) % 3;
      if (z > 14) api.shadowAt(x, y, 0.18, 0.5);
      api.put(api.bit(api.sprite, v), x, y - 9 - z, 1, ang);
      return true;
    },
  },
  // shrink: the shrink ray's wobbly rings (pink arcs, ")))"), facing its flight, pulsing.
  shrink: {
    box: [24, 26, 9, 13], n: 3, boil: true, lift: 9,
    paint(c, R) {
      for (let i = 0; i < 3; i++) {
        const x = -4 + i * 4, r = 4 + i * 2.6, P = [];
        for (let k = 0; k <= 7; k++) { const a = -1.05 + 2.1 * k / 7; P.push([x + Math.cos(a) * r * 0.42 + (R() - 0.5) * 0.5, Math.sin(a) * r + (R() - 0.5) * 0.5]); }
        tube(c, P, 1.25, i === 1 ? SHRINKL : SHRINK, R, 0.5);
      }
      sparkle(c, 9.6, -7, 1.3, C.white, R); sparkle(c, 6.4, 8.6, 1, SHRINKL, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = shotZ(p), w = 1 + 0.14 * Math.sin(rt * 16 + i * 1.7);
      putS(api, api.bit(api.sprite, ((rt * 8 + i) | 0) % 3), x, y - 9 - z, 1 / w, w, ang);
      return true;
    },
  },
  // minirocket: the jetpack's little red rocket, white body, red fins, a flame and a smoke trail. Faces its flight, slight
  // arc (p.z / p.apex), ground shadow.
  minirocket: {
    box: [30, 14, 16, 7], n: 2, lift: 8, shadow: 0.22,
    paint(c, R, v, M) {
      for (const [x, y, r] of [[-14, 0.6, 1.5], [-11, -0.4, 1.2], [-9, 0.4, 1]]) dab(c, x, y, r + v * 0.2, C.smokeL, R);
      c.save(); c.scale(-1, 1); flameLick(c, 5.4, 0, 0.75 + v * 0.15, R); c.restore();
      part(c, poly([[-5.4, -1.6], [-7.6, -3.6], [-3.6, -1.6]], R, 0.1), ROCKET, M, { lw: 0.7, sharp: true });
      part(c, poly([[-5.4, 1.6], [-7.6, 3.6], [-3.6, 1.6]], R, 0.1), ROCKET, M, { lw: 0.7, sharp: true });
      part(c, poly([[-5.6, -1.7], [3, -1.8], [3, 1.8], [-5.6, 1.7]], R, 0.1), C.white, M, { lw: 0.85, sharp: true });
      part(c, poly([[3, -1.8], [6.6, 0], [3, 1.8]], R, 0.1), ROCKET, M, { lw: 0.8, sharp: true });
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = shotZ(p);
      api.shadowAt(x, y, 0.22, 0.75);
      api.put(api.bit(api.sprite, ((rt * 14 + i) | 0) & 1), x, y - 8 - z, 1, ang + 0.06 * Math.sin(rt * 30 + i));
      return true;
    },
  },
  // bubble: the gravity alien's soap bubble round its floating victim (follows it). Painted for a victim of radius 9.5;
  // scaled by p.r; centred on the victim's middle at its height (p.z, the floating victim's u.z); wobbles.
  bubble: {
    box: [52, 52, 26, 26], n: 3, boil: true,
    paint(c, R) {
      c.save(); c.globalAlpha = 0.24; fill(c, ring(0, 0, 19, 19, R, 0.04, 12), '#c6ecff', R, { edge: 0, vary: 0.06 }); c.restore();
      c.save(); c.globalAlpha = 0.5;
      const P = []; for (let k = 0; k <= 8; k++) { const a = 0.2 + k / 8 * 1.3; P.push([Math.cos(a) * 15.6, Math.sin(a) * 15.6]); }
      brush(c, P, 2.2, '#ffb3e6', R, { bristles: 3, dry: 0.4, taper: 0.3 });
      c.restore();
      outline(c, ring(0, 0, 19, 19, R, 0.04, 12), R, 1.1, { jit: 0.2 });
      outline(c, ring(0, 0, 17.6, 17.6, R, 0.04, 12), R, 1.2, { col: '#7cc8ff', jit: 0.2, gap: true });
      const G = []; for (let k = 0; k <= 6; k++) { const a = Math.PI * (1.12 + 0.36 * k / 6); G.push([Math.cos(a) * 14.4, Math.sin(a) * 14.4]); }
      brush(c, G, 1.6, C.white, R, { bristles: 3, dry: 0.3, taper: 0.5 });
      dab(c, -5.6, -14.6, 1.1, C.white, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const r = p.r > 0 ? p.r : 9.5, k = r / 9.5, z = followZ(p, 36), w = 0.05 * Math.sin(rt * 6.5 + i * 2.1);
      putS(api, api.bit(api.sprite, ((rt * 8 + i) | 0) % 3), x, y - z - r * 1.45, k * (1 + w), k * (1 - w), 0);
      return true;
    },
  },
  // mind: the mind alien's hypno swirl over its thrall's head (follows it): grows and spins faster while the channel
  // builds (p.k 0..1), full size + slow spin + a bob once held (p.k = 1). Height: p.z + the thrall's head (p.r).
  mind: {
    box: [30, 30, 15, 15], n: 3, boil: true,
    paint(c, R) {
      for (let s = 0; s < 2; s++) {
        const P = []; for (let k = 0; k <= 16; k++) { const a = s * Math.PI + k / 16 * TAU * 1.15, rr = 1.2 + k * 0.62; P.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.62]); }
        brush(c, P, 1.35, s ? '#ff7ad9' : '#b45cff', R, { bristles: 3, dry: 0.2, taper: 0.35 });
      }
      outline(c, ring(0, 0, 11.4, 7.2, R, 0.08, 10), R, 0.8, { jit: 0.15, gap: true });
      sparkle(c, -11, -6, 1.6, SPARK, R); sparkle(c, 11.4, 3.6, 1.3, '#ff7ad9', R); sparkle(c, 3, -9.4, 1, C.white, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const k = clamp01(p.k >= 0 && p.k <= 1 ? p.k : 1), r = p.r > 0 ? p.r : 9.5, z = followZ(p, 0);
      const held = k >= 1, sc = (0.35 + 0.65 * k) * Math.min(1.5, Math.max(0.7, r / 9.5));
      const spin = rt * (held ? 2.2 : 5 + 6 * k) + i, bob = held ? 1.2 * Math.sin(rt * 3 + i) : 0;
      putS(api, api.bit(api.sprite, ((rt * 8 + i) | 0) % 3), x, y - z - r * 3.25 - 7 * sc + bob, sc * (1 + 0.08 * Math.sin(spin)), sc, 0.25 * Math.sin(spin * 0.5));
      return true;
    },
  },
};
