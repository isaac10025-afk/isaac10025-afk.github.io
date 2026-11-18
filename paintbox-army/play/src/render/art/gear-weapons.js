// Unit maker weapon gear + picker icons (OURS, Part 2 step 8, STEP8.md "Art contract"). Owner: ART-WEAPONS.
// GEAR[id] for all 57 weapons of sim/maker/catalog.js WEAPONS, ICON[id](ctx, w, h) for the maker's weapon picker cards.
// Every weapon is painted the way its source unit carries it: the painting is lifted from the source's sprite module into
// the frame below (each painter cites where it comes from). POSTER PAINT (ART.md): same brushes, ink weights, palette.
//
// GEAR[id] = { at, hold, box: [w, h, ax, ay], poses, paint(c, o), behind?, hand2?, hand2A?, tip?, pair?, empty? }
//   Sim px for a PERSON at size 1 (ART-BODY scales per body). paint(c, o) paints with the frame's root at (0, 0) and
//   facing right; box = the paint's extent around the root, like a sprite box: x from -ax to w - ax, y from -ay to h - ay.
//   at      'hand'  held weapons (hold gun / pistol / bow / throw / cast / swing / pole / heavy): the MAIN GRIP (trigger
//                   hand, sword hand, the front hand on a pole) at (0, 0), the weapon pointing along +x (muzzle, blade,
//                   head forward); a dangling hose or a stock may go back / down from it.
//           'mouth' root at the mouth (the hinge of the jaws), pointing +x (snout, beak, jaws).
//           'head'  tusks: root at the snout, curving up; horns: root at the top-front of the head; up = -y.
//           'fist'  on the front hand / paw (root = the hand), +x forward (gloves, fists, claws, mantis blades).
//           'tail'  root at the rear of the body, the tail pointing -x (tail, tail club, stinger, bombardier abdomen).
//   hold    the catalogue's hold class (catalog.js), repeated here for ART-BODY.
//   poses   the gear pose names that look different. 'idle' always; 'atk' = while the weapon's attack shows (u.attack > 0:
//           the flash, string snapped, jaws open, nozzle lit, blade struck out...). Extra poses some weapons have:
//             'loose'  bow: just loosed, the string snapped back and humming, no arrow ('atk' = full draw; 'aim' = 'atk')
//             'aim'    bombs: the fuse lit (b.act AIM / WIND)
//             'ladle'  oilpot out of pots (W-THROW's bag says none left): the ladle, swung like a club
//           A pose the gear doesn't list paints as 'idle'. 'atk' never moves the root or turns the weapon (the body's
//           attack pose does that): it only changes the look.
//   empty   poses that paint nothing (a thrown thing has left the hand): ART-BODY can skip baking them.
//   behind  true = draw behind the body (tails).
//   root    'snout' (tusks): a head gear rooted at the snout instead of the top-front of the head (ART-BODY reads it).
//   hand2   [x, y] where the off hand holds a two-handed weapon (gun, heavy, pole; bow: the string hand); hand2A the
//           same for 'atk' / 'aim' when it moves (the bow's drawn string).
//   tip     [x, y] the muzzle / blade tip / spout (where a flash, beam or breath starts).
//   pair    true = the body carries a second copy in the off hand / on the other paw (revolvers, gloves, fists, blades).
// o = { R, M, body, col, dead, v, pose } (+ risen: true for a zombie copy: jaws / tails / claws turn zombie green).
//   col = the recipe colour (Team battle: the team colour): used where the source unit puts its team colour (ray gun bands,
//   launcher bands, crossbow + ballista fletching, the dagger's guard, the laser's panel, the zapper's belly, the
//   gravity orb's ring). dead 'burnt' = charcoal like every burnt sprite; dead 'dead' = no flashes / sparks / flames.
//
// ICON[id](ctx, w, h, col?) paints the weapon big and bold into (0, 0)-(w, h) of ctx's current transform, transparent
// round it (the maker's picker card shows through), cached per size. Readable at 44 css px: long weapons diagonal,
// spells as the spell (fireball, bolt, orb), jaws open, the flamer lit.
//
// Shapes are drawn at person scale with person line weights (machines like the cannon, ballista, ram and catapult arm
// are repainted small with full-weight ink, never scaled down, so they stay bold at 2.15 device px per sim px).
import { C, TAU, lerp, tone, brush, ring, poly, fill, outline, part, dab, tube, spark, shift, spline, path, rng, hash, M0, canvas, tooth } from './paint.js';
import { shuriken, flameLick } from './people.js';
import { GEAR, ICON } from './mine-hooks.js';
import { WEAPONS } from '../../sim/maker/catalog.js';

// ---------------------------------------------------------------- shared helpers
const PI = Math.PI;
/** Paint look for one frame (cf. the sources' look()): burnt = charcoal, band = the recipe / team colour. */
function look(o) {
  const burnt = o.dead === 'burnt', risen = !!o.risen && !burnt;
  const col = o.col || C.red;
  return {
    o, R: o.R, M: o.M, burnt, dead: !!o.dead, risen, pose: o.pose || 'idle',
    band: burnt ? C.charL : col,
    cl: (x) => (burnt ? C.char : x),                          // big areas
    acc: (x) => (burnt ? C.charL : x),                        // small accents
    nat: (x, z) => (burnt ? C.char : risen ? (z || C.zskin) : x),   // living parts (jaws, tails, claws, fur)
    skin: burnt ? C.charL : risen ? C.zskin : C.skin,
    fx: !o.dead,                                              // flashes, sparks, flames: the living only
  };
}
/** A smaller misregistration for small parts (cf. sprites-bugs.js smallM / sprites-secret.js sm). */
function sm(L, k = 0.45, lw = 0.85) { const M = L.M; return { R: M.R, mx: M.mx * k, my: M.my * k, grow: M.grow * k, lw }; }
function about(c, x, y, a, fn) { if (!a) { fn(); return; } c.save(); c.translate(x, y); c.rotate(a); c.translate(-x, -y); fn(); c.restore(); }
function swoosh(c, R, pts, w = 1.1) {   // people.js / sprites-pirates.js swoosh: motion marks behind a swing
  brush(c, pts, w * 1.25, '#e9eef2', R, { bristles: 3, taper: 0.95, dry: 0.6, vary: 0.04 });
  brush(c, pts.map(([x, y]) => [x - 0.8, y + 2.2]), w * 0.6, C.greyL, R, { bristles: 2, taper: 0.95, dry: 0.6 });
}
function lines(c, R, x, y, n = 2, len = 3, gap = 2) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap]], 0.5, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.6 }); }
function streaks(c, R, x, y, n, len, gap = 2.6) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap - 0.2]], 0.55, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.7 }); }
function puff(c, L, x, y, r) {   // sprites-pirates.js puff: a smoke cloud, three grey blobs
  const R = L.R;
  for (const [dx, dy, k, col] of [[0, 0, 1, C.smokeL], [r * 0.9, -r * 0.55, 0.8, C.smoke], [-r * 0.7, -r * 0.7, 0.72, C.smokeL]]) part(c, ring(x + dx, y + dy, r * k, r * k * 0.86, R, 0.16, 8), col, L.M, { lw: 0.8, vary: 0.06 });
}
/** Points every ~step px along a closed polygon's edges (sprites-siege.js sub: straight sides survive the spline). */
function sub(pts, step = 3) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
/** A wooden beam (sprites-siege.js beam): plank fill, grain line, nails. */
function beam(c, x0, y0, x1, y1, w, col, M, o = {}) {
  const R = M.R, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
  const pts = poly(sub([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], 2.6), R, 0.12);
  part(c, pts, col, M, { sharp: true, lw: o.lw ?? 1.3, ang: Math.atan2(dy, dx), sp: 0.7 });
  if (o.grain !== false && l > 7 && w > 1.8) brush(c, [[x0 + dx * 0.1 + nx * 0.25, y0 + dy * 0.1 + ny * 0.25], [x0 + dx * 0.55 - nx * 0.1, y0 + dy * 0.55 - ny * 0.1], [x0 + dx * 0.9 + nx * 0.2, y0 + dy * 0.9 + ny * 0.2]], 0.45, tone(col, -0.32), R, { bristles: 1, dry: 0.45, taper: 0.3 });
  if (o.nails) for (const t of [0.12, 0.88]) dab(c, x0 + dx * t, y0 + dy * t, 0.55, C.ink, R);
}
function coil(c, L, x, y, r) {   // sprites-siege.js coil: a rope bundle
  const R = L.R;
  part(c, ring(x, y, r, r, R, 0.08, 9), L.acc('#dcbb7c'), L.M, { lw: 1.1 });
  for (let i = 0; i < 3; i++) brush(c, [[x - r * 0.6, y - r * 0.55 + i * r * 0.5], [x + r * 0.6, y - r * 0.85 + i * r * 0.5]], 0.4, L.burnt ? C.ink : tone('#dcbb7c', -0.45), R, { bristles: 1, dry: 0.2, taper: 0.2 });
}
/** A row of white teeth (sprites-dinos.js teeth): a zigzag along x0..x1 at y, pointing dir (+1 down, -1 up). */
function teeth(c, x0, x1, y, n, h, dir, col, R, w = 0.75) {
  const P = []; for (let i = 0; i <= n * 2; i++) P.push([lerp(x0, x1, i / (n * 2)), y + (i & 1 ? dir * h : 0)]);
  brush(c, P, w, col, R, { bristles: 2, dry: 0, taper: 0 });
}
const jit = (P, R, j = 0.3) => P.map(([x, y]) => [x + (R() - 0.5) * 2 * j, y + (R() - 0.5) * 2 * j]);
function inkLine(c, P, w, R) { brush(c, jit(P, R), w, C.ink, R, { bristles: 3, taper: 0.45, dry: 0.3, vary: 0.07, swell: 0.25, per: 5 }); }
/** A fill whose ink outline runs only along index ranges of pts (sprites-dinos.js partEdges: the rest joins the body). */
function partEdges(c, pts, ranges, col, M, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  for (const [i0, i1] of ranges) { const P = []; for (let i = i0; i <= i1; i++) P.push(pts[i % pts.length]); inkLine(c, P, o.lw ?? M.lw, M.R); }
}
/** A 4-point sparkle (sprites-space.js sparkle). */
function sparkle(c, x, y, r, col, R) {
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - PI / 2, k = i % 2 ? 0.32 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.08 * r), col, R, { sharp: true, vary: 0.05, edge: 0 });
  outline(c, pts, R, Math.max(0.45, r * 0.22), { jit: 0.08, bristles: 2 });
}
/** A green / pink star burst with a pale middle (sprites-space.js zap). */
function zapBurst(c, x, y, r, R, col, mid) {
  const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.15, k = i % 2 ? 0.42 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.12), col, R, { sharp: true, vary: 0.05, edge: 0 });
  dab(c, x, y, r * 0.4, mid, R);
}
/** A little crackle (sprites-robots.js zig): ink + yellow zigzag. */
function zig(c, R, x0, y0, x1, y1, n, amp) {
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) { const t = i / n, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1; const o = (i & 1 ? 1 : -1) * amp * (0.6 + R() * 0.6); pts.push([x0 + (x1 - x0) * t + nx / l * o, y0 + (y1 - y0) * t + ny / l * o]); }
  pts.push([x1, y1]);
  brush(c, pts, 1.3, C.ink, R, { bristles: 2, dry: 0, taper: 0.1, per: 2 });
  brush(c, pts, 0.75, C.yellow, R, { bristles: 2, dry: 0, taper: 0.1, per: 2 });
}
/** A kid's flame tongue pointing along +x from (x, y) (sprites-myth.js flame, laid on its side). */
function flameX(c, x, y, h, R) {
  c.save(); c.translate(x, y); c.rotate(PI / 2);
  const tongue = (w, hh, bend, col, outl) => {
    const pts = [[-w / 2, 0], [-w * 0.42, -hh * 0.4], [bend * 0.5 - w * 0.12, -hh * 0.75], [bend, -hh], [bend * 0.4 + w * 0.2, -hh * 0.68], [w * 0.46, -hh * 0.34], [w / 2, 0], [0, 1]];
    fill(c, poly(pts, R, 0.25), col, R, { vary: 0.08, sp: 0.9, edge: 0 });
    if (outl) outline(c, pts, R, 1.1, { jit: 0.3, gap: true });
  };
  const b = (R() - 0.5) * h * 0.3;
  tongue(h * 0.62, h, b, C.fireR, true); tongue(h * 0.42, h * 0.68, b * 0.7, C.fireO, false); tongue(h * 0.24, h * 0.4, b * 0.4, C.fireY, false);
  c.restore();
}

// ---------------------------------------------------------------- held: guns
// rifle / sniper: people.js human() soldier / sniper aimGun, turned level about the trigger hand (1.2, -14.4).
function rifleGun(c, L, sniper) {
  const R = L.R, longer = sniper ? 4.5 : 0;
  c.save(); c.rotate(0.14); c.translate(-1.2, 14.4);
  brush(c, [[-3.2, -13.4], [3, -15.1]], 2.7, L.cl(C.brown), R, { taper: 0.1, dry: 0.1, bristles: 4 });
  brush(c, [[2, -15.2], [13.5 + longer, -16.8]], 1.75, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 3 });
  if (sniper) { brush(c, [[3.2, -17.6], [9, -18.2]], 2.6, C.ink, R, { bristles: 3, dry: 0 }); dab(c, 9.3, -18.2, 1.3, L.acc('#9fd8ff'), R); }
  c.restore();
}
// flamer: people.js human() flamer nozzle + hose (to the tank on its back), about the trigger hand (1.6, -12.4).
function flamerGun(c, L, atk) {
  const R = L.R, jx = atk ? -0.7 : 0, jy = atk ? (R() - 0.5) * 0.8 : 0;
  c.save(); c.rotate(0.13); c.translate(-1.6, 12.4);
  brush(c, [[-6.4, -9.4], [-2, -6.8], [2.6 + jx, -11.4 + jy]], 0.9, C.ink, R, { bristles: 2, dry: 0 });
  brush(c, [[1 + jx, -12.6 + jy], [11.6 + jx, -14 + jy]], 2.4, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 4 });
  brush(c, [[3 + jx, -12.6 + jy], [7 + jx, -13.4 + jy]], 1.4, L.acc(C.yellow), R, { taper: 0.1, dry: 0, bristles: 2 });
  if (atk && L.fx) flameLick(c, 12 + jx, -14.1 + jy, 1.25, R);
  c.restore();
}
const GOLD = '#f6b41c', IRON = '#46474e', IRONL = '#7a7e88';   // sprites-pirates.js colours
// pistol: sprites-pirates.js flint (flintlock): grip in the hand at (0, 0), barrel along +x; flash = shot.
function flint(c, L, flash) {
  const R = L.R;
  brush(c, [[0.8, -0.6], [-0.4, 1.4], [-1.8, 2.9]], 2, L.acc(C.brown), R, { bristles: 3, dry: 0.1, taper: -0.3 });
  dab(c, -2, 3.1, 1.1, L.acc(GOLD), R);
  brush(c, [[-0.2, -1], [8, -1.1]], 1.5, C.ink, R, { bristles: 3, dry: 0.05, taper: 0 });
  dab(c, 8.1, -1.1, 0.7, L.acc(GOLD), R); dab(c, 0.9, -2.1, 0.75, L.acc(GOLD), R);
  if (flash && L.fx) { spark(c, 10.6, -1.3, 2.6, R); puff(c, L, 14, -3.4, 2.2); }
}
// blunderbuss: sprites-pirates.js blunder: trigger hand at (0, 0), stock behind, barrel, brass bell; flash = flame + spark.
function blunder(c, L, flash) {
  const R = L.R;
  brush(c, [[-6.2, 2.1], [-2.6, 0.9], [0.6, 0.1]], 2.9, L.acc(C.brown), R, { bristles: 4, dry: 0.1, taper: -0.2 });
  brush(c, [[0, -0.2], [9.2, -0.5]], 1.9, C.ink, R, { bristles: 3, dry: 0.05, taper: 0 });
  part(c, poly([[8.6, -1.5], [13.6, -4], [14, 3.2], [8.6, 0.7]], R, 0.15), L.acc(GOLD), L.M, { lw: 1, sharp: true });
  dab(c, 13.8, -0.4, 1.4, C.ink, R);
  if (flash && L.fx) { flameLick(c, 14.2, -0.4, 1.8, R); spark(c, 15.6, -0.6, 3, R); puff(c, L, 18, -4, 2.4); }
}
// revolvers: sprites-secret.js revolver (the cowboy's two guns; pair).
const CB = { gun: '#5b5f68', grip: '#8b5a2b' };
function revolver(c, L, flash) {
  const R = L.R, M = sm(L, 0.25, 0.75);
  part(c, poly([[-0.8, -0.6], [1, -0.2], [0.2, 3], [-1.8, 2.8]], R, 0.08), L.acc(CB.grip), M, { lw: 0.7, sharp: true });
  part(c, poly([[-1.2, -2], [2.8, -2.2], [3, 0.4], [-1, 0.6]], R, 0.08), L.acc(CB.gun), M, { lw: 0.75, sharp: true });
  brush(c, [[2.4, -1.2], [7.2, -1.2]], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, 7, -2.2, 0.45, C.ink, R);
  if (flash && L.fx) { spark(c, 9.4, -1.2, 2.8, R); for (const dy of [-3.6, 1.6]) brush(c, [[10.6, -1.2 + dy * 0.4], [13, -1.2 + dy]], 0.5, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.6 }); }
}
// crossbow: sprites-siege.js crossbow (x1.18), its rear hand (-3.05, 1.0 in crossbow units) at (0, 0). state 'spanned' / 'loose'.
const WOOD = C.brown, SIRON = C.greyL, SIROND = C.grey;
function crossbowGun(c, L, state) {
  const R = L.R, M = L.M, burnt = L.burnt;
  c.save(); c.scale(1.18, 1.18); c.translate(3.05, -1.0);
  if (state === 'spanned') {
    brush(c, [[-2.4, -1.2], [9.2, -1.2]], 0.9, burnt ? C.charL : '#e2c48c', R, { bristles: 2, dry: 0, taper: 0 });
    part(c, poly([[9, -2.4], [11.6, -1.2], [9, 0]], R, 0.06), burnt ? C.charL : SIRON, M, { lw: 0.7, sharp: true });
    if (!burnt) fill(c, poly([[-2.6, -1.4], [-0.6, -1.4], [-2.2, -3.4]], R, 0.05), L.band, R, { sharp: true, edge: 0, vary: 0.05 });
  }
  part(c, poly([[-7.4, -0.4], [-6.8, 2.4], [-2.6, 1.3], [7.2, 1.0], [7.4, -0.9], [-2.4, -0.9]], R, 0.15), burnt ? C.char : WOOD, M, { lw: 1.1, ang: 0 });
  brush(c, [[-2.6, 1.2], [-3.4, 3.4]], 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });
  const tp = state === 'loose' ? 4.6 : 3.4;
  brush(c, [[tp, -5.8], [6.6, -2.6], [7, 0], [6.6, 2.6], [tp, 5.8]], 1.5, burnt ? C.charL : SIROND, R, { bristles: 3, dry: 0.1, taper: 0 });
  const nut = state === 'loose' ? tp + 0.3 : -2.2;
  brush(c, [[tp, -5.8], [nut, 0], [tp, 5.8]], 0.42, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  outline(c, ring(8.6, 0, 1.3, 1.6, R, 0.05, 7), R, 0.7, { bristles: 2, jit: 0.1 });
  if (state === 'loose') for (const dy of [-2.4, 1.8]) brush(c, [[12.6, dy - 1], [17, dy - 1.2]], 0.9, '#e9eef2', R, { bristles: 2, dry: 0.5, taper: 0.8 });
  c.restore();
}
// ballista: sprites-siege.js balPart 'stock' / 'stockF' (the stock, winch, bow on torsion coils, big bolt), repainted at
// 0.55 size round its grip (-3, -20.8) with full-weight ink so it stays bold carried by one unit (no cart).
function ballistaGun(c, L, fired) {
  const R = L.R, M = L.M, k = 0.55, m = (x, y) => [(x + 3) * k, (y + 20.8) * k];
  const [b0x, b0y] = m(-17.4, -22.4), [b1x, b1y] = m(15.6, -22.6);
  beam(c, b0x, b0y, b1x, b1y, 2.4, L.cl(WOOD), M, { nails: true, lw: 1.2 });
  const [wx, wy] = m(-14.6, -22.6); coil(c, L, wx, wy, 1.5);
  brush(c, [[wx, wy], m(-17.2, -26.6)], 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); const [kx, ky] = m(-17.4, -26.8); dab(c, kx, ky, 0.75, C.ink, R);
  const bx = 12.4, bt = fired ? 11.4 : 6.6, y0 = -22.6;
  tube(c, [m(bt, y0 - 15), m(bx + 0.6, y0 - 8.6), m(bx + 2.2, y0), m(bx + 0.6, y0 + 8.6), m(bt, y0 + 15)], 1.7, L.cl('#6a4321'), R, 0.6);
  for (const s of [-1, 1]) { const [cx, cy] = m(bx + 1.4, y0 + s * 5); coil(c, L, cx, cy, 1.6); }
  brush(c, [m(bt, y0 - 15), m(fired ? bt + 0.6 : -8.8, y0), m(bt, y0 + 15)], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  if (!fired) {   // the big bolt in its groove (bigBolt), fletching in the team colour
    const [x0, y] = m(-9.2, -25.6), [x1] = m(18.6, 0);
    if (!L.burnt) for (const s of [-1, 1]) fill(c, poly([[x0 - 0.2, y], [x0 + 3, y], [x0 + 0.3, y + s * 1.9]], R, 0.06), L.band, R, { sharp: true, edge: 0, vary: 0.05 });
    tube(c, [[x0, y], [x1, y]], 1.15, L.burnt ? C.charL : '#e2c48c', R, 0.5);
    part(c, poly([[x1 - 0.3, y - 1.7], [x1 + 4.2, y], [x1 - 0.3, y + 1.7]], R, 0.06), L.burnt ? C.charL : SIRON, sm(L, 0.4, 0.85), { lw: 0.85, sharp: true });
  } else { const [sx, sy] = m(21, -28.4); streaks(c, R, sx, sy, 3, 4.6, 1.8); }
}
// ray gun: sprites-space.js raygun (silver, bands in the suit-band colour, green glow tip); flash = green zap.
const SILVER = '#c4cad4', SILVERD = '#7f8796', GLOW = '#6cff4c', GLOWL = '#dcffc8';
function raygun(c, L, flash) {
  const R = L.R;
  brush(c, [[0.4, -0.6], [-0.6, 1.4], [-1.4, 3]], 1.7, L.acc(SILVERD), R, { bristles: 3, dry: 0.05, taper: -0.2 });
  part(c, poly([[-2.6, -2.3], [2.6, -2.8], [4.8, -1.6], [4.9, 0.3], [2.8, 1.1], [-2.6, 0.7]], R, 0.15), L.cl(SILVER), L.M, { lw: 1 });
  for (const x of [-0.6, 1.6]) brush(c, [[x, -3.1], [x + 0.1, 1.2]], 0.95, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  brush(c, [[4.8, -0.7], [8, -0.7]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, 8.5, -0.7, 1.25, L.acc(GLOW), R); if (!L.burnt) dab(c, 8.2, -1.1, 0.45, C.white, R);
  if (flash && L.fx) {
    zapBurst(c, 10.8, -0.7, 3, R, GLOW, GLOWL);
    for (const [dx, dy] of [[13.4, -3.6], [13.8, 2.4]]) brush(c, [[dx - 1.4, dy * 0.6 - 0.7], [dx, dy - 0.7]], 0.55, GLOW, R, { bristles: 1, dry: 0.2, taper: 0.5 });
  }
}
// shrink ray: sprites-space.js shrinkGun, the rear hand on its grip (0, 0.8 in gun units) at (0, 0); rings = firing.
const SHRINK = '#ff4fa8', SHRINKL = '#ffc0dd';
function shrinkGun(c, L, rings) {
  const R = L.R;
  c.save(); c.translate(0, -0.8);
  brush(c, [[-0.2, 0.6], [-1, 3.4]], 1.6, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  part(c, poly([[-4.4, -1.8], [8.4, -1.6], [8.4, 1.4], [-4.4, 1.6]], R, 0.15), L.cl(SILVER), L.M, { lw: 1.05 });
  for (const x of [1, 3, 5]) brush(c, [[x, -2.4], [x + 0.2, 2.2]], 1.05, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  part(c, poly([[8, -1.6], [13.4, -5.4], [14.2, 4.8], [8, 1.4]], R, 0.15), L.cl(SILVER), L.M, { lw: 1.1, sharp: true });
  fill(c, poly([[9.6, -1], [13, -3.8], [13.4, 3.2], [9.6, 0.8]], R, 0.1), L.acc(SHRINK), R, { sharp: true, edge: 0 });
  dab(c, 11.6, -0.2, 0.9, L.acc(SHRINKL), R);
  if (rings && L.fx) for (let i = 0; i < 3; i++) {
    const x = 16 + i * 3.2, r = 4.2 + i * 1.7, P = [];
    for (let q = 0; q <= 6; q++) { const a = -1.1 + 2.2 * q / 6; P.push([x + Math.cos(a) * r * 0.45, Math.sin(a) * r]); }
    tube(c, P, 0.9, i === 1 ? SHRINKL : SHRINK, R, 0.45);
  }
  c.restore();
}
// rockets: sprites-space.js launcher (the jetpack's mini-rocket tube, x0.86), its handle top at (0, 0); flash = fired.
const ROCKET = '#e3241a';
function launcher(c, L, flash) {
  const R = L.R;
  c.save(); c.translate(-0.1, -1.4); c.scale(0.86, 0.86);
  if (!flash) part(c, poly([[6.6, -1.4], [9.2, -0.2], [6.6, 1.1]], R, 0.1), L.acc(ROCKET), L.M, { lw: 0.8, sharp: true });
  part(c, poly([[-5, -2.4], [6.8, -2.6], [7.2, 1.7], [-5, 2]], R, 0.18), L.cl(SILVER), L.M, { lw: 1.1 });
  brush(c, [[-1.2, -2.6], [-1, 1.9]], 1.5, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  brush(c, [[4.6, -2.7], [4.7, 1.8]], 1.1, L.band, R, { bristles: 2, dry: 0.05, taper: 0 });
  dab(c, 7, -0.4, 1.3, C.ink, R);
  brush(c, [[0.4, 1.8], [-0.2, 3.8]], 1.3, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  if (flash && L.fx) { c.save(); c.translate(7.6, -0.4); flameLick(c, 0, 0, 1.2, R); c.restore(); puff(c, L, -7.6, -0.6, 2.2); puff(c, L, 11.8, -2.6, 1.8); }
  c.restore();
}
// missiles: the giant mech's shoulder rocket pod (sprites-bosses.js gmLayer 'r:pod' / 'r:podO'), repainted carried size:
// steel box, hazard band, the lid shut; atk = lid flipped back, four red rockets out (leaning forward) + smoke.
const GM = { steel: '#a3a8b0', steelD: '#6f747c', dark: '#3d4046', haz: '#ff8a12' };
function hazardBand(c, L, x0, y0, x1, y1) {   // sprites-bosses.js hazard: stripe colour with black diagonal stripes
  const R = L.R;
  fill(c, poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], R, 0.15), L.acc(GM.haz), R, { sharp: true, sp: 0.8, edge: 0 });
  if (!L.burnt) { c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); for (let x = x0 - (y1 - y0); x < x1; x += 2.6) brush(c, [[x, y1], [x + (y1 - y0), y0]], 0.9, C.ink, R, { bristles: 2, dry: 0.15, taper: 0 }); c.restore(); }
}
function missilePod(c, L, open) {
  const R = L.R, M = L.M;
  if (open) {   // rockets first (they stick out of the top), then the box over their tails
    for (let i = 0; i < 4; i++) {
      const x = -4.2 + i * 2.9;
      c.save(); c.translate(x, -7.4); c.rotate(0.45);
      part(c, poly([[-1.1, 1.6], [1.1, 1.6], [1, -2.2], [0, -4.2], [-1, -2.2]], R, 0.1), L.acc(ROCKET), sm(L, 0.3, 0.8), { lw: 0.8, sharp: true });
      dab(c, 0, -1.2, 0.45, L.acc(C.white), R);
      c.restore();
    }
    part(c, poly([[-7.6, -7.6], [-5.4, -8.2], [-8.4, -15], [-10.4, -14]], R, 0.15), L.cl(GM.steelD), M, { lw: 1.1, sharp: true });   // lid flipped back
  }
  part(c, poly(sub([[-7, -7.4], [6.4, -7.4], [7.2, -0.2], [-7, -0.2]], 2.4), R, 0.12), L.cl(GM.steel), M, { lw: 1.4, sharp: true });
  hazardBand(c, L, -6.6, -4.6, 6.6, -2.8);
  for (const [x, y] of [[-5.6, -6.2], [5.4, -6.2], [-5.6, -1.4], [5.8, -1.4]]) dab(c, x, y, 0.5, L.acc(GM.dark), R);
  if (!open) part(c, poly(sub([[-7.4, -9.6], [6.6, -9.6], [6.8, -7], [-7.4, -7]], 2.4), R, 0.1), L.cl(GM.steelD), M, { lw: 1.2, sharp: true });
  brush(c, [[-0.6, -0.2], [-1, 2.6]], 1.6, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // the carry grip
  if (open && L.fx) { puff(c, L, -9, -2.4, 2.2); spark(c, 8.6, -12.6, 1.8, R); }
}
// laser: the laserbot fires from its big lens eye (sprites-robots.js laserPart / lens); carried, that eye sits at the
// front of a robot blaster: team-colour body with a hazard band (the laserbot's body), steel muzzle, the lens, a little
// antenna. atk = the lens blazing (the bot's 'beam' eye). The beam itself is W-GUN's OVER.
const RB = { steel: '#b7bfc7', steelL: '#d8dee4', steelD: '#949da7', dark: '#666b75', haz: '#ff8a12', glass: '#a6ecff', laser: '#ff3420', blade: '#e2e7eb' };
function lensEye(c, L, x, y, r, st) {   // sprites-robots.js lens: 'on' | 'glow' | 'blaze'
  const R = L.R;
  part(c, ring(x, y, r, r, R, 0.05, 10), L.burnt ? C.char : RB.steelD, sm(L, 0.4, r > 2.5 ? 1.0 : 0.85), { lw: r > 2.5 ? 1.0 : 0.85, edge: 0 });
  if (L.burnt) { dab(c, x, y, r * 0.6, C.charL, R); return; }
  if ((st === 'glow' || st === 'blaze') && L.fx) {
    const n = st === 'blaze' ? 10 : 8, l0 = r * 1.15, l1 = st === 'blaze' ? r * 2.3 : r * 1.75;
    for (let i = 0; i < n; i++) { const a = i / n * TAU + R() * 0.3; brush(c, [[x + Math.cos(a) * l0, y + Math.sin(a) * l0], [x + Math.cos(a) * l1, y + Math.sin(a) * l1]], st === 'blaze' ? 0.85 : 0.7, i & 1 ? C.fireO : C.yellow, R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
    dab(c, x, y, r * 0.78, st === 'blaze' ? RB.laser : C.fireO, R); dab(c, x, y, r * 0.55, C.yellow, R); dab(c, x, y, r * (st === 'blaze' ? 0.36 : 0.24), '#fffef0', R);
    return;
  }
  dab(c, x, y, r * 0.76, RB.glass, R); dab(c, x + r * 0.14, y + r * 0.04, r * 0.36, C.ink, R); dab(c, x - r * 0.3, y - r * 0.32, r * 0.2, '#ffffff', R);
}
function laserGun(c, L, blaze) {
  const R = L.R, M = L.M;
  brush(c, [[-2.6, -2.6], [-3.4, -4.8], [-4.4, -6.4]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // antenna + its hazard ball
  dab(c, -4.5, -6.6, 1.25, C.ink, R); dab(c, -4.6, -6.7, 0.85, L.acc(RB.haz), R);
  brush(c, [[0.2, 1.2], [-0.8, 3.8]], 1.7, L.burnt ? C.char : RB.dark, R, { bristles: 3, dry: 0, taper: 0 });   // grip
  const body = poly(sub([[-4.6, -2.6], [5.4, -2.8], [5.6, 1.8], [-4.4, 1.8]], 2.2), R, 0.1);
  fill(c, shift(body, M.mx * 0.6, M.my * 0.6, M.grow * 0.6), L.band, R, { sharp: true });
  c.save(); path(c, body); c.clip();   // the hazard band (ink stripes on orange) across the body
  fill(c, [[-1.4, -3.2], [1.4, -3.2], [1.4, 2.4], [-1.4, 2.4]], L.acc(RB.haz), R, { sharp: true, edge: 0, ang: 0 });
  if (!L.burnt) for (let x = -3; x < 2; x += 1.6) brush(c, [[x, 2.2], [x + 2.4, -3]], 0.6, C.ink, R, { bristles: 2, dry: 0.1, taper: 0 });
  c.restore();
  outline(c, body, R, 1.2);
  part(c, poly(sub([[5, -3.6], [9.4, -3.6], [9.6, 2.6], [5, 2.6]], 2), R, 0.1), L.cl(RB.steelL), sm(L, 0.5, 1.1), { lw: 1.1, sharp: true });   // the muzzle housing
  for (const x of [6.4]) dab(c, x, -2.4, 0.45, C.ink, R);
  lensEye(c, L, 9.8, -0.5, 2.7, blaze ? 'blaze' : 'on');
}
// zapper: the drone's zap (sprites-robots.js dronePart 'bodyZ'): its steel body + team belly, lens eye and zapper prong,
// on a grip. atk = the eye glowing, a spark on the prong.
function zapper(c, L, atk) {
  const R = L.R, M = L.M;
  brush(c, [[0.2, 0.8], [-0.8, 3.4]], 1.6, L.burnt ? C.char : RB.dark, R, { bristles: 3, dry: 0, taper: 0 });
  for (const s of [-1, 1]) { brush(c, [[4.4, -0.1 + s * 0.5], [9.4, -0.1 + s * 1.5]], 1.0, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); dab(c, 9.6, -0.1 + s * 1.5, 0.7, L.acc('#e3b13a'), R); }   // the prong, brass tips
  const body = ring(1.6, -0.6, 3.9, 2.9, R, 0.05, 12), F = spline(shift(body, M.mx * 0.6, M.my * 0.6, M.grow * 0.6), true, 6);
  fill(c, F, L.cl(RB.steelL), R, { sharp: true });
  const belly = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI; belly.push([1.6 + Math.cos(a) * 4.1, -0.4 + Math.sin(a) * 3.1]); }
  c.save(); path(c, F); c.clip(); fill(c, belly, L.band, R, { sharp: true, edge: 0, vary: 0.08 }); c.restore();
  outline(c, body, R, 1.05);
  dab(c, -0.8, -2.3, 0.45, C.ink, R);
  lensEye(c, L, 3, -1, 1.7, atk ? 'glow' : 'on');
  if (atk && L.fx) { zig(c, R, 9.6, -1.6, 9.6, 1.4, 3, 0.7); spark(c, 10.8, -0.1, 2.7, R); }
}
// web: the spider's silk, carried as the spider itself held tail-first (sprites-bugs.js spiLayer 'r:ab' + 'r:body'):
// the hairy black abdomen with its chevrons forward, the spinnerets at the muzzle, the red-eyed head-chest at the back,
// two legs folded under. atk = a web ball bursting out of the spinnerets.
const SPI = { body: '#352d3d', far: '#1c1820', mark: '#776a8c', eye: '#ff2a2a', gloss: '#8a7f9c' };
function hairs(c, cx, cy, rx, ry, a0, a1, n, len, w, R) {   // sprites-bugs.js hairs
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, (i + 0.5) / n) + (R() - 0.5) * 0.12, ca = Math.cos(a), sa = Math.sin(a), l = len * (0.75 + R() * 0.5);
    brush(c, [[cx + ca * rx * 0.96, cy + sa * ry * 0.96], [cx + ca * (rx + l), cy + sa * (ry + l)]], w, C.ink, R, { bristles: 1, dry: 0, taper: 0.6 });
  }
}
function webBall(c, R, x, y, r) {   // a web shot: white ball, radial threads, a ring
  dab(c, x, y, r, '#f6f4ee', R);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; brush(c, [[x, y], [x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35]], 0.4, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.5 }); }
  outline(c, ring(x, y, r * 0.62, r * 0.62, R, 0.1, 7), R, 0.4, { bristles: 1, jit: 0.1 });
  outline(c, ring(x, y, r, r, R, 0.08, 9), R, 0.55, { bristles: 2, jit: 0.1 });
}
function webGun(c, L, atk) {
  const R = L.R, M = L.M, burnt = L.burnt, body = L.nat(SPI.body), far = L.nat(SPI.far, tone(C.zskin, -0.32));
  for (const P of [[[-2.6, 0.6], [-0.8, 3.4], [1.6, 4.4]], [[-4, 0.4], [-3.4, 3.6], [-1.2, 4.8]]]) { tube(c, P, 0.85, far, R, 0.45); }   // folded legs under
  hairs(c, 3.2, -1.2, 5, 4, 1.15 * PI, 2.85 * PI, 13, 1.1, 0.5, R);
  fill(c, shift(ring(3.2, -1.2, 5, 4, R, 0.08, 11, 0.2), M.mx, M.my, M.grow), body, R);
  if (!burnt) {
    for (const [x, y, s] of [[1.2, -3.6, 1.1], [3.8, -4, 1.25], [6.4, -3, 1.1]]) brush(c, [[x - s * 0.9, y - s], [x + s * 0.3, y], [x - s * 0.9, y + s]], 0.8, L.nat(SPI.mark, tone(C.zskin, 0.35)), R, { bristles: 2, dry: 0.2, taper: 0.2 });
    dab(c, 2.4, -3.8, 1, L.nat(SPI.gloss, tone(C.zskin, 0.45)), R);
  }
  outline(c, ring(3.2, -1.2, 5, 4, R, 0.08, 11, 0.2), R, 1.4);
  dab(c, 8.4, -0.8, 0.85, L.nat(SPI.mark, tone(C.zskin, 0.35)), R);   // spinnerets
  hairs(c, -3.6, -0.8, 2.9, 2.3, 0.6 * PI, 1.4 * PI, 5, 0.9, 0.45, R);
  part(c, ring(-3.6, -0.8, 2.9, 2.3, R, 0.07, 9), body, sm(L, 0.5, 1.2), { lw: 1.2 });
  if (L.dead) { /* eyes out */ } else for (const [x, y, r] of [[-4.6, -2.2, 1.05], [-2.8, -2.6, 0.9], [-5.6, -1, 0.5]]) { dab(c, x, y, r, L.nat(SPI.eye, '#e7edd6'), R); if (r > 0.8 && !burnt && !L.risen) dab(c, x - r * 0.3, y - r * 0.35, r * 0.36, C.white, R); }
  if (atk && L.fx) { brush(c, [[8.6, -0.8], [11.4, -0.9]], 0.5, '#f6f4ee', R, { bristles: 1, dry: 0, taper: 0 }); webBall(c, R, 13.6, -0.9, 2.6); }
  else if (!burnt) brush(c, [[8.8, -0.6], [10, 0.6], [9.6, 2.6]], 0.45, '#f6f4ee', R, { bristles: 1, dry: 0.1, taper: 0.3 });   // a strand of silk
}
// cannon: sprites-pirates.js cannonBarrel (iron, gold bands, cascabel, muzzle) repainted at 0.62 on a short wooden
// carry block (the carriage's wood + its team band). atk = recoiled 1.2 px, flame + spark + smoke at the muzzle.
function cannonGun(c, L, atk) {
  const R = L.R, M = L.M, k = 0.62, rc = atk ? -1.2 : 0, cy = -3;
  part(c, poly([[-4.2, -1.6], [4, -1.8], [3.2, 1.4], [-3.6, 1.6]], R, 0.15), L.cl(C.brown), M, { lw: 1.3 });   // carry block
  brush(c, [[-3.4, -0.2], [3.2, -0.4]], 1.1, L.band, R, { bristles: 2, dry: 0.1, taper: 0.1 });
  c.save(); c.translate(rc, cy);
  part(c, poly([[-10.4 * k, -3.5 * k], [19.8 * k, -2.5 * k], [20.4 * k, 2.3 * k], [-10.4 * k, 3.3 * k]], R, 0.15), L.cl(IRON), M, { lw: 1.4 });
  dab(c, -12 * k, 0, 1.25, C.ink, R);
  const g = L.acc(GOLD);
  brush(c, [[-7.4 * k, -3.4 * k], [-7.2 * k, 3.2 * k]], 1.2, g, R, { bristles: 2, dry: 0.1 }); brush(c, [[6 * k, -3 * k], [6.1 * k, 2.8 * k]], 0.9, g, R, { bristles: 2, dry: 0.1 });
  brush(c, [[18.8 * k, -2.9 * k], [18.9 * k, 2.7 * k]], 1.3, g, R, { bristles: 2, dry: 0.1 });
  if (!L.burnt) brush(c, [[-5.6 * k, -1.8 * k], [15.6 * k, -1.3 * k]], 0.65, IRONL, R, { bristles: 2, dry: 0.3, taper: 0.3 });
  dab(c, 20.6 * k, -0.1 * k, 1, C.ink, R);
  dab(c, 0, 0, 0.9, L.acc(IRONL), R);
  if (atk && L.fx) { const mx = 20.6 * k + 0.4; flameLick(c, mx, 0, 1.4, R); spark(c, mx + 2.4, 0, 2.6, R); puff(c, L, mx + 7, -1.6, 3); puff(c, L, mx + 3.6, -5, 2.2); }
  c.restore();
}

// ---------------------------------------------------------------- held: thrown things + magic
// grenade: people.js human() grenadier bomb: black ball, grey glint, fuse, always lit (spark).
function grenadeBall(c, L, x, y) {
  const R = L.R;
  dab(c, x, y, 2.9, C.ink, R); dab(c, x - 1, y - 1, 0.7, '#6d6d6d', R);
  brush(c, [[x + 1.2, y - 2.4], [x + 2.4, y - 4.8]], 0.8, L.acc(C.brown), R, { bristles: 2, dry: 0 });
  if (L.fx && !L.burnt) spark(c, x + 2.7, y - 5.6, 2.3, R);
}
// bombs: sprites-pirates.js bomb (the bomber's: grey glint, fuse up-right; lit = sparkles).
function pirateBomb(c, L, x, y, lit, r = 2.9) {
  const R = L.R;
  dab(c, x, y, r, C.ink, R); dab(c, x - r * 0.35, y - r * 0.38, r * 0.27, '#80808a', R);
  brush(c, [[x + r * 0.4, y - r * 0.8], [x + r * 0.72, y - r * 1.45], [x + r * 1.05, y - r * 1.72]], 0.75, L.acc(C.brown), R, { bristles: 2, dry: 0 });
  if (lit && L.fx && !L.burnt) { spark(c, x + r * 1.15, y - r * 1.95, lit, R); for (const [dx, dy] of [[5.4, -6.8], [1.2, -8.4], [5.8, -3.4]]) dab(c, x + dx, y + dy, 0.5, C.yellow, R); }
}
// oil pot: sprites-siege.js pot (terracotta, dark mouth, rope band, a lit rag) and, out of pots, the ladle.
const TERRA = '#c9622c', ROPE = '#dcbb7c', LINEN = '#f3ecd8';
function oilPot(c, L, x, y, r, lit) {
  const R = L.R, burnt = L.burnt;
  part(c, ring(x, y, r, r * 0.95, R, 0.06, 9), burnt ? C.char : TERRA, L.M, { lw: 1.25 });
  dab(c, x, y - r * 0.82, r * 0.5, C.ink, R);
  if (burnt) return;
  brush(c, [[x - r * 0.95, y - r * 0.15], [x, y + r * 0.05], [x + r * 0.95, y - r * 0.15]], 0.6, ROPE, R, { bristles: 1, dry: 0.1, taper: 0 });
  dab(c, x - r * 0.45, y - r * 0.4, r * 0.22, '#f1a46c', R);
  if (lit) {
    brush(c, [[x + r * 0.1, y - r * 0.85], [x + r * 0.3, y - r * 1.5]], 0.9, LINEN, R, { bristles: 2, dry: 0, taper: 0.2 });
    if (L.fx) {
      const fx = x + r * 0.3, fy = y - r * 1.55;
      fill(c, poly([[fx - 1.4, fy], [fx - 0.6, fy - 2.6], [fx + 0.2, fy - 4.4], [fx + 0.8, fy - 2.2], [fx + 1.5, fy]], R, 0.15), C.fireO, R, { edge: 0, vary: 0.06 });
      fill(c, poly([[fx - 0.7, fy], [fx - 0.1, fy - 2.4], [fx + 0.7, fy]], R, 0.1), C.fireY, R, { edge: 0, vary: 0.05 });
    }
  }
}
function ladle(c, L, h, cup) {   // sprites-siege.js ladle
  const R = L.R;
  brush(c, [h, cup], 0.95, L.burnt ? C.charL : C.brownL, R, { bristles: 2, dry: 0.05, taper: 0 });
  outline(c, [h, cup], R, 0.35, { bristles: 1, jit: 0.05, gap: true });
  part(c, ring(cup[0], cup[1], 2.1, 1.8, R, 0.08, 7), L.burnt ? C.charL : SIROND, L.M, { lw: 1.0 });
  dab(c, cup[0], cup[1] - 0.5, 1.1, C.ink, R);
}
// baseball: sprites-sports.js ball (white, ink rim, red seams), a little bigger to read in a hand.
function baseball(c, L, x, y, r) {
  const R = L.R;
  dab(c, x, y, r + 0.5, C.ink, R); dab(c, x, y, r, L.acc(C.white), R);
  if (!L.burnt) for (const k of [-1, 1]) brush(c, [[x + k * r * 0.3, y - r * 0.75], [x + k * r * 0.72, y], [x + k * r * 0.3, y + r * 0.75]], 0.38, '#d8281c', R, { bristles: 1, dry: 0, taper: 0 });
}
// bowling ball: sprites-sports.js bowlBall (purple, swirl, three finger holes, glint).
function bowlBall(c, L, x, y, r) {
  const R = L.R;
  part(c, ring(x, y, r, r, R, 0.05, 9), L.cl('#5b2f93'), L.M, { lw: 1.25 });
  if (L.burnt) return;
  brush(c, [[x - r * 0.7, y + r * 0.3], [x - r * 0.1, y + r * 0.55], [x + r * 0.5, y + r * 0.2]], 0.5, '#9a72d6', R, { bristles: 2, dry: 0.4, taper: 0.4 });
  for (const [dx, dy] of [[0.05, -0.45], [0.42, -0.2], [0.42, -0.62]]) dab(c, x + dx * r, y + dy * r, r * 0.16, C.ink, R);
  dab(c, x - r * 0.45, y - r * 0.4, r * 0.18, '#fffdf2', R);
}
// hockey stick + puck: sprites-sports.js stick (shaft, taped blade, taped grip) along +x, the blade bending down at the
// far end, the puck resting at its toe (gone on atk: the slapshot).
function hockeyStick(c, L, puck, top = -3) {
  const R = L.R, a = [top, 0], b = [14.4, 0.4], bx = 4.2, by = 1.6;
  tube(c, [a, b], 1.05, L.acc('#cf9152'), R, 0.55);
  tube(c, [b, [b[0] + bx * 0.55 - by * 0.25, b[1] + by * 0.55 + bx * 0.25], [b[0] + bx, b[1] + by]], 1.35, L.burnt ? C.char : '#26222e', R, 0.5);
  brush(c, [a, [a[0] + (b[0] - a[0]) * 0.14, a[1] + (b[1] - a[1]) * 0.14]], 1.45, '#26222e', R, { bristles: 2, dry: 0, taper: 0 });
  if (puck) { part(c, ring(20.6, 3, 2, 1, R, 0.06, 8), L.burnt ? C.char : '#1c1916', sm(L, 0.3, 0.8), { lw: 0.8 }); if (!L.burnt) brush(c, [[19.4, 2.6], [21.2, 2.5]], 0.4, '#6a6a74', R, { bristles: 1, dry: 0.2, taper: 0.3 }); }
}
// snowball: sprites-secret.js PROJ snowball (white, blue shadow crescent, glint).
function snowball(c, L, x, y, r) {
  const R = L.R;
  part(c, ring(x, y, r, r * 0.96, R, 0.08, 9), L.cl('#ffffff'), sm(L, 0.4, 1.1), { lw: 1.1 });
  if (L.burnt) return;
  brush(c, [[x - r * 0.74, y + r * 0.3], [x - r * 0.13, y + r * 0.7], [x + r * 0.65, y + r * 0.48]], 1.2, '#cfe3f7', R, { bristles: 3, dry: 0.3, taper: 0.5 });
  dab(c, x - r * 0.3, y - r * 0.4, r * 0.22, C.white, R);
  for (const [dx, dy] of [[0.35, -0.13], [-0.1, 0.22]]) dab(c, x + dx * r, y + dy * r, 0.4, '#a8c8ea', R);
}
// boulder: the catapult's throwing arm (sprites-siege.js catPart 'arm' + 'stone' + boulder): a wooden beam with the cup
// at its end, the boulder in it. atk = the cup empty (the stone's away) and a swoosh over it.
function boulderStone(c, L, x, y, r) {
  const R = L.R;
  part(c, ring(x, y, r, r * 0.92, R, 0.12, 8), L.burnt ? C.char : '#8a8780', L.M, { lw: 1.3 });
  if (!L.burnt) { dab(c, x + r * 0.3, y + r * 0.25, r * 0.28, '#6e6b65', R); dab(c, x - r * 0.4, y + r * 0.1, r * 0.18, '#6e6b65', R); dab(c, x - r * 0.3, y - r * 0.4, r * 0.24, '#b4b1aa', R); }
}
function catapultArm(c, L, thrown) {
  const R = L.R, M = L.M, tx = 14.4, ty = -1.2;
  if (thrown && L.fx) swoosh(c, R, [[6, -9], [11, -11.6], [16.4, -10.2]], 1.2);
  beam(c, -3.4, 0.2, tx + 0.8, ty + 0.3, 3.2, L.cl(C.brownL), M, { lw: 1.15 });
  part(c, poly([[tx - 3.6, ty - 2.3], [tx + 3, ty - 2.1], [tx + 2.2, ty + 1.3], [tx - 2.7, ty + 1.4]], R, 0.15), L.cl(C.brown), M, { lw: 1.25 });
  dab(c, tx - 0.3, ty - 2.2, 2.2, C.ink, R);
  if (!thrown) boulderStone(c, L, tx - 0.2, ty - 5, 3.2);
}
// lava blob: the lava golem's blob (sprites-bosses.js lgLayer 'r:blob' / PROJ lavablob): molten, hot core, drips.
function lavaBlob(c, L, x, y, r) {
  const R = L.R, burnt = L.burnt;
  part(c, ring(x, y, r, r * 0.9, R, 0.18, 9), burnt ? C.char : C.fireO, L.M, { lw: 1.3 });
  if (burnt) return;
  dab(c, x - 0.3, y - 0.3, r * 0.6, C.fireY, R); dab(c, x - r * 0.25, y - r * 0.25, r * 0.26, '#fff3b0', R);
  for (const [dx, dy, s] of [[0.45, 0.35, 0.19], [-0.5, 0.45, 0.15], [0.55, -0.45, 0.12]]) dab(c, x + dx * r, y + dy * r, r * s, '#5b4842', R);
  for (const [dx, dy] of [[-0.35, 1.05], [0.35, 1.2]]) dab(c, x + dx * r, y + dy * r, r * 0.15, C.fireR, R);
}
// fireball / lightning: the mage's staff (sprites-myth.js mageArms: wood, the blue gem) held in the middle, its gem
// forward; atk ('cast') = the spell at the gem: a fireball (flames along the staff) / forked yellow bolts.
function mageStaff(c, L, spell) {
  const R = L.R, M = L.M;
  brush(c, [[-13.6, 0.4], [0.3, 0], [13.6, -0.5]], 1.6, L.acc(C.brown), R, { taper: 0.1, dry: 0.1, bristles: 3 });
  part(c, ring(15.4, -0.6, 2.1, 2.1, R, 0.1, 7), L.acc('#58c8f0'), M, { lw: 1.1 });
  if (!L.fx || !spell) return;
  const tx = 18.4, ty = -0.6;
  if (spell === 'fire') {
    for (let i = 0; i < 3; i++) brush(c, [[tx + 2.4, ty - 2 + i * 1.8], [tx + 6.4, ty - 2.6 + i * 2.2]], 1.3, i === 1 ? C.fireY : C.fireR, R, { bristles: 2, taper: 0.8, dry: 0.2 });
    part(c, ring(tx, ty, 3.6, 3.3, R, 0.15, 8), C.fireO, M, { lw: 1.2 });
    dab(c, tx - 0.3, ty + 0.4, 1.7, C.fireY, R);
  } else {
    for (let i = 0; i < 4; i++) {
      const a = -1.15 + i * 0.75, s = 6;
      brush(c, [[tx, ty], [tx + Math.cos(a) * s * 0.45, ty + Math.sin(a) * s * 0.45 - 1], [tx + Math.cos(a) * s * 0.6, ty + Math.sin(a) * s * 0.6 + 1], [tx + Math.cos(a) * s, ty + Math.sin(a) * s]], 1.1, C.yellow, R, { bristles: 2, taper: 0.5, dry: 0 });
    }
    dab(c, tx, ty, 2.1, C.white, R); dab(c, tx, ty, 1.1, C.yellow, R);
  }
}
// bubble: the gravity alien's orb (sprites-space.js orb: violet ball, ring in the suit-band colour, glint); atk = cast:
// the orb big with swirls and sparkles.
const ORB = '#7d66ff', ORBL = '#d2c8ff', SPARKY = '#fff36b';
function gravOrb(c, L, x, y, r, big) {
  const R = L.R;
  if (big && L.fx) for (let i = 0; i < 2; i++) {
    const P = []; for (let q = 0; q <= 7; q++) { const a = i * PI + q / 7 * 2.6; P.push([x + Math.cos(a) * r * (1.5 + q * 0.09), y + Math.sin(a) * r * (1.2 + q * 0.07)]); }
    brush(c, P, 0.8, ORBL, R, { bristles: 2, dry: 0.3, taper: 0.7 });
  }
  part(c, ring(x, y, r, r, R, 0.06, 9), L.cl(ORB), L.M, { lw: Math.max(0.9, r * 0.3) });
  if (!L.burnt) { dab(c, x - r * 0.35, y - r * 0.38, r * 0.3, C.white, R); dab(c, x + r * 0.25, y + r * 0.2, r * 0.35, tone(ORB, 0.35), R); }
  const P = []; for (let q = 0; q <= 8; q++) { const a = PI * 0.05 + q / 8 * PI * 0.9; P.push([x + Math.cos(a) * r * 1.65, y + Math.sin(a) * r * 0.5 - r * 0.15]); }
  brush(c, P, Math.max(0.6, r * 0.3), L.band, R, { bristles: 2, dry: 0.1, taper: 0.1 });
  if (big && L.fx) for (const [dx, dy, s] of [[1.9, -1.3, 0.55], [-1.8, -1.6, 0.42], [2.1, 1.2, 0.36]]) sparkle(c, x + dx * r, y + dy * r, s * r, SPARKY, R);
}

// ---------------------------------------------------------------- held: melee
// sword: the legion's gladius (people.js heavy: a broad grey blade thrust over the shield rim; sprites-siege.js sword
// for the grip + crossguard): grip in the hand, blade forward.
function gladius(c, L) {
  const R = L.R;
  tube(c, [[1.3, 0], [8, -0.1], [14.2, 0]], 1.7, L.acc(C.greyL), R, 0.5);
  brush(c, [[13.2, -0.2], [15.6, 0]], 0.9, C.ink, R, { bristles: 2, dry: 0, taper: 0.6 });   // the point
  if (!L.burnt) brush(c, [[3, -0.3], [12, -0.4]], 0.4, '#f4f6f8', R, { bristles: 1, dry: 0.3, taper: 0.4 });
  brush(c, [[-2, 0], [1.2, 0]], 1.5, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[1.2, -2.2], [1.3, 2.2]], 1.05, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, -2.4, 0, 0.95, L.acc(GOLD), R);
}
// club: the giant's wooden club (sprites-myth.js giantClub 'club': thin handle, fat knobbly end), carried size.
function giantClub(c, L) {
  const R = L.R, kx = 0.66, ky = 0.8;
  part(c, poly([[-3, -1.3], [9, -2.2], [16, -3.6], [20.6, -4], [23, -1.8], [23, 1.8], [20.6, 4], [16, 3.6], [9, 2.2], [-3, 1.3]].map(([x, y]) => [x * kx, y * ky]), R, 0.25), L.cl(C.brownL), L.M, { lw: 1.4, ang: 0 });
  if (!L.burnt) for (const [x, y] of [[17.4, -1.6], [20.4, 1.6], [13, 0.8]]) dab(c, x * kx, y * ky, 0.75, C.brown, R);
}
// halberd: sprites-siege.js halberd (pole, spike, axe blade on the forward side, hook behind) from butt to top.
function halberdPole(c, L, b, t) {
  const R = L.R, M = L.M, burnt = L.burnt, dx = t[0] - b[0], dy = t[1] - b[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const at = (a, n) => [t[0] + ux * a + nx * n, t[1] + uy * a + ny * n];
  tube(c, [b, [(b[0] + t[0]) / 2 + nx * 0.2, (b[1] + t[1]) / 2 + ny * 0.2], t], 1.35, burnt ? C.char : C.brownL, R, 0.55);
  const st = burnt ? C.charL : SIRON;
  part(c, poly([at(-0.6, -1.2), at(6.4, 0), at(-0.6, 1.2)], R, 0.08), st, M, { lw: 0.9, sharp: true });
  part(c, poly([at(-1, 0.4), at(-0.2, 3.6), at(-2.4, 5.8), at(-5.6, 6), at(-7.8, 4.2), at(-7.4, 0.4)], R, 0.1), st, M, { lw: 1.1 });
  part(c, poly([at(-2.6, -0.4), at(-2.4, -4.4), at(-4.6, -0.4)], R, 0.08), st, M, { lw: 0.9, sharp: true });
}
// cutlass: sprites-pirates.js cutlass (broad curved blade, gold guard), grip at (hx, hy).
function cutlassBlade(c, L, hx, hy, tx, ty, bend) {
  const R = L.R, dx = tx - hx, dy = ty - hy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const gx = hx + ux * 1.5, gy = hy + uy * 1.5;
  tube(c, [[gx, gy], [hx + dx * 0.55 + nx * 1.4 * bend, hy + dy * 0.55 + ny * 1.4 * bend], [tx, ty]], 1.55, L.acc(C.greyL), R, 0.5);
  brush(c, [[hx - ux * 1.9, hy - uy * 1.9], [hx + ux * 0.4, hy + uy * 0.4]], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[gx - nx * 2, gy - ny * 2], [gx + nx * 2, gy + ny * 2]], 0.95, L.acc(GOLD), R, { bristles: 2, dry: 0.1, taper: 0.1 });
}
// anchor: sprites-pirates.js anchorShape + chain: a short chain from the hands to the ring, the anchor pointing +x.
function anchorShape(c, L, x, y, ang, s) {
  const R = L.R, ir = L.acc(IRONL);
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  outline(c, ring(0, 0, 1.5, 1.5, R, 0.05, 7), R, 1.1, { jit: 0.1 });
  tube(c, [[0, 1.3], [0, 11]], 1.9, ir, R, 0.75);
  tube(c, [[-3.9, 3.2], [3.9, 3.2]], 1.4, ir, R, 0.65);
  tube(c, [[-6.5, 6.4], [-5, 9.9], [0, 11.8], [5, 9.9], [6.5, 6.4]], 1.9, ir, R, 0.75);
  for (const k of [-1, 1]) part(c, poly([[k * 7.8, 4.6], [k * 4.8, 7.2], [k * 6.9, 8.8]], R, 0.1), ir, L.M, { lw: 0.8, sharp: true });
  c.restore();
}
function chain(c, L, pts) {
  const R = L.R;
  brush(c, pts, 1.15, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.7));
    for (let q = 0; q < n; q++) { const t = (q + 0.5) / n; dab(c, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.42, L.acc(IRONL), R, 0.1); }
  }
}
// bat: sprites-sports.js bat (knob, taped grip, barrel fattening to the tip).
function baseBat(c, L, h, t) {
  const R = L.R, dx = t[0] - h[0], dy = t[1] - h[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const k0 = [h[0] - ux * 1.6, h[1] - uy * 1.6];
  brush(c, [k0, t], 2.1, C.ink, R, { bristles: 3, taper: -0.95, dry: 0, vary: 0.04, swell: 0 });
  brush(c, [[k0[0] + ux * 0.4, k0[1] + uy * 0.4], [t[0] - ux * 0.5, t[1] - uy * 0.5]], 1.0, L.acc('#e6b06a'), R, { bristles: 3, taper: -1.05, dry: 0.1, swell: 0 });
  if (!L.burnt) brush(c, [[h[0] + ux * 5, h[1] + uy * 5 - 0.3], [t[0] - ux * 2, t[1] - uy * 2 - 0.3]], 0.35, '#fbe3b8', R, { bristles: 1, dry: 0.4, taper: 0.4 });
  brush(c, [[h[0] - ux * 0.8, h[1] - uy * 0.8], [h[0] + ux * 2.6, h[1] + uy * 2.6]], 1.25, '#26222e', R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, k0[0], k0[1], 1.05, C.ink, R);
}
// dagger: the teleporter's crystal dagger (sprites-space.js dagger; its guard in the suit-band colour).
function crystalDagger(c, L, hx, hy, tx, ty) {
  const R = L.R, dx = tx - hx, dy = ty - hy, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  const gx = hx + ux * 1.3, gy = hy + uy * 1.3;
  part(c, poly([[gx + nx * 1.3, gy + ny * 1.3], [tx, ty], [gx - nx * 1.3, gy - ny * 1.3]], R, 0.1), L.acc('#8aeeff'), sm(L, 0.4, 0.85), { lw: 0.85, sharp: true });
  if (!L.burnt) brush(c, [[gx + ux * 1.5, gy + uy * 1.5], [hx + dx * 0.75, hy + dy * 0.75]], 0.4, C.white, R, { bristles: 1, dry: 0.2, taper: 0.6 });
  brush(c, [[hx - ux * 1.8, hy - uy * 1.8], [hx + ux * 0.3, hy + uy * 0.3]], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[gx - nx * 1.9, gy - ny * 1.9], [gx + nx * 1.9, gy + ny * 1.9]], 0.95, L.band, R, { bristles: 2, dry: 0.1, taper: 0.1 });
}
// ram: the siege ram's log with its iron ram's head (sprites-siege.js ramPart 'log'), carried size: log 0.42 long,
// 0.7 thick, iron bands, the curly horn, the eye. atk = speed streaks ahead.
function ramLog(c, L, atk) {
  const R = L.R, M = L.M, burnt = L.burnt, kx = 0.42, ky = 0.7, ox = 4.6, oy = -2.2, m = (x, y) => [x * kx + ox, y * ky + oy];
  const P = (pts) => pts.map(([x, y]) => m(x, y));
  part(c, poly(P([[-25.6, -2.8], [21, -3.1], [22, 2.9], [-25.4, 2.8], [-26.6, 0]]), R, 0.15), burnt ? C.char : WOOD, M, { lw: 1.3, ang: 0 });
  if (!burnt) for (const dy of [-1.2, 1.2]) brush(c, P([[-22, dy], [-6, dy * 0.6], [16, dy]]), 0.45, tone(WOOD, -0.35), R, { bristles: 1, dry: 0.5, taper: 0.3 });
  { const [ex, ey] = m(-25.4, 0); outline(c, ring(ex, ey, 0.8, 1.6, R, 0.08, 7), R, 0.6, { bristles: 1 }); }
  for (const x of [-12, 7]) { const [a0, a1] = m(x, -3.4), [b0, b1] = m(x, 3.4); beam(c, a0, a1, b0, b1, 1.6, burnt ? C.char : SIROND, M, { lw: 0.9, grain: false }); }
  part(c, poly(P([[20.4, -3.8], [26, -4.6], [30.6, -2.6], [31.8, 0.2], [30, 2.8], [25, 3.6], [20.4, 3.4]]), R, 0.12), burnt ? C.char : SIRON, M, { lw: 1.3 });
  const [hx, hy] = m(24.2, -0.6), sp = []; for (let a = -2.2; a < 3.6; a += 0.45) { const r = 2.1 - (a + 2.2) * 0.26; sp.push([hx + Math.cos(a) * r * 0.9, hy + Math.sin(a) * r]); }
  brush(c, sp, 1.0, burnt ? C.ink : SIROND, R, { bristles: 2, dry: 0, taper: 0.4 });
  brush(c, sp, 0.4, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.5 });
  if (!L.dead) { const [ex, ey] = m(28.4, -1.6); dab(c, ex, ey, 0.8, '#fffdf2', R); dab(c, ex + 0.1, ey + 0.05, 0.4, C.ink, R); }
  if (atk && L.fx) { const [sx, sy] = m(33, -3); streaks(c, R, sx + 1, sy, 3, 4, 1.8); }
}
// saw: the sawbot's hazard arm with the round saw on its end (sprites-robots.js sawPart 'arm' + 'saw' / 'sawB' +
// 'sparks', sawBlade), repainted 0.8 size, the arm level. atk = the blade a blur, sparks flying.
function sawBlade(c, L, x, y, r, blur) {
  const R = L.R;
  if (!blur) {
    const n = 14, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push([x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8]); const a2 = a + TAU / n * 0.6; pts.push([x + Math.cos(a2) * r * 1.07, y + Math.sin(a2) * r * 1.07]); }
    part(c, poly(pts, R, 0.05), L.cl(RB.blade), L.M, { sharp: true, lw: 0.9, edge: 0 });
  } else {
    part(c, ring(x, y, r, r, R, 0.04, 12), L.burnt ? C.charL : '#d4dade', L.M, { lw: 1.0 });
    for (let k = 0; k < 3; k++) {
      const a0 = k * TAU / 3 + R() * 0.4, P = [], P2 = [];
      for (let a = a0; a < a0 + 1.5; a += 0.25) { P.push([x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78]); P2.push([x + Math.cos(a + 0.4) * r * 0.97, y + Math.sin(a + 0.4) * r * 0.97]); }
      brush(c, P, 0.8, '#ffffff', R, { bristles: 2, dry: 0.3, taper: 0.8 }); brush(c, P2, 0.45, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.8 });
    }
  }
  outline(c, ring(x, y, r * 0.55, r * 0.55, R, 0.03, 10), R, 0.5, { col: L.burnt ? C.ink : tone(RB.blade, -0.42), bristles: 2, jit: 0.1 });
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.4; dab(c, x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, r * 0.09, C.ink, R); }
  dab(c, x, y, r * 0.22, L.cl(RB.dark), R); dab(c, x - r * 0.05, y - r * 0.05, r * 0.1, L.acc(RB.steelL), R);
}
function sawArm(c, L, spin) {
  const R = L.R, M = L.M;
  { const w = 2.3, pts = poly(sub([[-1.2, -w / 2], [8.2, -w / 2], [8.2, w / 2], [-1.2, w / 2]], 2.4), R, 0.1);   // sprites-robots.js bar, hazard
    part(c, pts, L.acc(RB.haz), M, { sharp: true, lw: 1.1, ang: 0, sp: 0.7 }); }
  if (!L.burnt) for (const x of [2.4, 4.8]) brush(c, [[x - 0.6, 1.1], [x + 0.6, -1.1]], 0.7, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  part(c, ring(7, 0, 2.2, 2.1, R, 0.06, 8), L.cl(RB.dark), sm(L, 0.5, 1), { lw: 1.0 });
  sawBlade(c, L, 8.8, 0, 5, spin);
  if (spin && L.fx) {
    const x = 12.4, y = 2.4;
    for (const a0 of [-0.9, -0.4, 0.15, -1.5, 0.6]) { const a = a0 + (R() - 0.5) * 0.3, l = 5.2 * (0.7 + R() * 0.5); brush(c, [[x + Math.cos(a), y + Math.sin(a)], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 0.75, R() < 0.5 ? C.fireO : C.yellow, R, { bristles: 2, dry: 0.25, taper: 0.85 }); }
    spark(c, x, y, 1.8, R);
  }
}

// ---------------------------------------------------------------- fist gear (on the front hand)
// fists: the boxer's gold glove (sprites-sports.js glove: white cuff behind it, thumb bump, glint).
function boxGlove(c, L, x, y, ex, ey, r) {
  const R = L.R, dx = x - ex, dy = y - ey, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  brush(c, [[x - ux * r * 1.5, y - uy * r * 1.5], [x - ux * r * 0.7, y - uy * r * 0.7]], 2.4, C.ink, R, { bristles: 3, dry: 0, taper: 0 });
  brush(c, [[x - ux * r * 1.45, y - uy * r * 1.45], [x - ux * r * 0.75, y - uy * r * 0.75]], 1.4, L.acc(C.white), R, { bristles: 2, dry: 0, taper: 0 });
  part(c, ring(x, y, r, r * 0.92, R, 0.1, 9, Math.atan2(uy, ux)), L.cl('#ffc21a'), L.M, { lw: 1.2 });
  dab(c, x - uy * r * 0.7 - ux * r * 0.1, y + ux * r * 0.7 - uy * r * 0.1, r * 0.42, L.cl('#d4920a'), R);
  if (!L.burnt) dab(c, x + ux * r * 0.2 - uy * r * 0.35, y + uy * r * 0.2 + ux * r * 0.35 - r * 0.25, r * 0.22, '#fff3c4', R);
}
// slam: the ape's great knuckled fist (sprites-animals.js apeDraw arm: hairy forearm, fur strokes, knuckle line).
const APE = { body: '#3d3330', limb: '#54463f', fur: '#8a776d' };
function apeFist(c, L, atk) {
  const R = L.R, limb = L.nat(APE.limb, tone(C.zskin, 0.12)), body = L.nat(APE.body);
  tube(c, [[-4, 0.4], [-2, 0.1], [0, 0]], 3.2, limb, R, 1.2);
  if (!L.burnt) brush(c, [[-3.6, -0.8], [-1, -1]], 0.7, L.nat(APE.fur, tone(C.zskin, 0.4)), R, { bristles: 2, dry: 0.4 });
  part(c, ring(1.4, -0.2, 2.7, 2.4, R, 0.1, 7), body, L.M, { lw: 1.1 });
  brush(c, [[0.4, -1.2], [2.8, -1.1]], 0.45, C.ink, R, { bristles: 1, dry: 0 });
  brush(c, [[3.4, -1.6], [3.6, 1]], 0.45, C.ink, R, { bristles: 1, dry: 0 });
  if (atk && L.fx) for (let i = 0; i < 3; i++) { const a = -0.9 + i * 0.9; brush(c, [[1.4 + Math.cos(a) * 3.6, -0.2 + Math.sin(a) * 3.4], [1.4 + Math.cos(a) * 5.4, -0.2 + Math.sin(a) * 5]], 0.7, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.6 }); }
}
// shove: the sumo's big open palm (sprites-sports.js palm + thick arm), a little bigger to read.
function sumoPalm(c, L, atk) {
  const R = L.R;
  tube(c, [[-3.4, 0.4], [-1.4, 0.1], [0.4, 0]], 2.6, L.skin, R, 1);
  part(c, ring(1.8, -0.4, 2.3, 2.7, R, 0.12, 8), L.skin, L.M, { lw: 1.0 });
  for (let i = 0; i < 3; i++) brush(c, [[3.1, -2 + i * 1.4], [4.3, -2.2 + i * 1.5]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });
  brush(c, [[0.6, -2.6], [0.2, -4.2]], 1.1, L.skin, R, { bristles: 2, dry: 0, taper: 0.3 });   // thumb
  if (atk && L.fx) lines(c, R, 6.4, -2.6, 3, 2.6, 1.8);
}
// float punch: the astronaut's big puffy glove (sprites-space.js parm + glove); atk = punch lines + floaty sparkles.
const PUFF = '#f8f7f0', PUFFD = '#d8dbe1';
function astroGlove(c, L, atk) {
  const R = L.R;
  tube(c, [[-3.6, 0.3], [-1.6, 0.1], [0, 0]], 2.1, L.cl(PUFF), R, 0.75);
  part(c, ring(1.7, -0.1, 2.4, 2.2, R, 0.1, 7), L.cl(PUFFD), L.M, { lw: 0.95 });
  brush(c, [[0.2, -1.6], [0.6, 1.4]], 0.5, L.acc('#aab0ba'), R, { bristles: 1, dry: 0.2, taper: 0.2 });
  if (atk && L.fx) { lines(c, R, 5.2, -1.8, 3, 2.6, 1.7); sparkle(c, 4.6, -4.6, 1, SPARKY, R); sparkle(c, 6.6, 2.6, 0.8, SPARKY, R); }
}
// claws (pinch): the crab's big claw (sprites-ocean.js crabLayer 'r:armN' / 'r:fingN'), turned to point +x: palm,
// fixed finger, moving finger hinged on top. idle open, atk = shut (the pinch).
const CRAB = { shell: '#e8402a', dark: '#9e2416', light: '#ff8f6c' };
function crabClaw(c, L, shut) {
  const R = L.R, M = L.M, shell = L.nat(CRAB.shell);
  tube(c, [[-2.6, 0.8], [-1, 0.3], [0.6, 0]], 2.2, shell, R, 1);
  about(c, 5.4, -1.4, shut ? 0 : -0.55, () => part(c, poly([[4.6, -2], [7.8, -2.9], [10.6, -1.9], [11.6, -0.6], [8.4, -0.8], [5.2, -0.2]], R, 0.12), shell, M, { lw: 1.15 }));
  part(c, poly([[5.2, 0.4], [8.4, 0.5], [11.4, -0.2], [10.8, 1.6], [8, 2.8], [4.8, 2.4]], R, 0.12), shell, M, { lw: 1.15 });
  part(c, ring(3, 0, 3.4, 2.8, R, 0.1, 9), shell, M, { lw: 1.4 });
  if (!L.burnt) { dab(c, 2.2, -0.9, 1.05, L.nat(CRAB.light, tone(C.zskin, 0.3)), R); brush(c, [[9.6, 1.2], [10.8, 0.4]], 0.55, L.nat(CRAB.dark, C.zskinD), R, { bristles: 1, dry: 0.2 }); }
}
// blades: the mantis's raptorial arm (sprites-bugs.js manArm): folded up praying (idle), struck out forward (atk);
// spiky femur, the shin with its hook, a purple-and-yellow eye spot. pair (two blades, in turn).
const MAN = { skin: '#b8d82b', zom: '#93ab72', spot: '#7a3a8c', spotR: '#ffe14a' };
function mantisBlade(c, L, out) {
  const R = L.R, col = L.nat(MAN.skin, MAN.zom);
  const spikes = (fem, side) => { for (let i = 0; i < 4; i++) { const t = 0.18 + i * 0.2, X = lerp(fem[0][0], fem[2][0], t), Y = lerp(fem[0][1], fem[2][1], t); brush(c, side ? [[X, Y + 1.1], [X - 0.8, Y + 2.6]] : [[X - 1.1, Y], [X - 2.6, Y + 0.8]], 0.65, C.ink, R, { bristles: 1, dry: 0, taper: 0.7 }); } };
  const spot = (X, Y) => { if (!L.dead) { dab(c, X, Y, 0.9, L.acc(MAN.spotR), R); dab(c, X, Y, 0.5, L.acc(MAN.spot), R); } };
  if (!out) {
    const fem = [[0, 0], [2, -3.4], [3.4, -6.6]];
    spikes(fem, 0); tube(c, fem, 3, col, R, 0.7);
    tube(c, [[3.4, -6.6], [2.6, -3.6], [1.7, -1.1]], 1.5, col, R, 0.55);
    brush(c, [[1.7, -1.1], [0.8, -0.5], [0.6, -1.4]], 0.7, C.ink, R, { bristles: 1, dry: 0 });
    spot(0.8, -1.8);
    return;
  }
  const fem = [[0, 0], [3.4, -0.7], [6.8, -0.7]];
  spikes(fem, 1); tube(c, fem, 3, col, R, 0.7);
  tube(c, [[6.8, -0.7], [9.3, 0.7], [11.4, 2.5]], 1.5, col, R, 0.55);
  brush(c, [[11.4, 2.5], [11.7, 3.9], [10.9, 4.3]], 0.75, C.ink, R, { bristles: 1, dry: 0 });
  spot(1.6, -0.6);
  if (L.fx) for (let i = 0; i < 3; i++) brush(c, [[3 + i * 2.9, -3.4 - i * 0.2], [5.2 + i * 2.9, -3.8 - i * 0.2]], 0.55, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.5 });
}

// ---------------------------------------------------------------- mouth gear (root = the hinge of the jaws)
/** Jaws (cf. sprites-dinos.js bipedHead without the eye): the lower jaw hinged at (0, 0) and opened by ja, the red
 *  mouth inside, the upper jaw over it with its teeth. S = { up, jaw, mouth, ut, lt, tw, lw, skin, teeth, mouthCol }. */
function jaws(c, L, S, ja) {
  const R = L.R, M = L.M;
  if (ja > 0.05) fill(c, poly(S.mouth, R, 0.15), S.mouthCol, R, { edge: 0 });
  about(c, 0, 0, ja, () => {
    part(c, poly(S.jaw, R, 0.12), S.jawCol || S.skin, M, { lw: S.lw * 0.85 });
    if (S.belly) brush(c, S.belly, S.bw || 1.2, S.bellyCol, R, { taper: 0.4, dry: 0.35, bristles: 3 });
    if (ja > 0.05) teeth(c, S.lt[0], S.lt[1], S.lt[2], S.lt[3], S.lt[4], -1, S.teeth, R, S.tw);
  });
  part(c, poly(S.up, R, 0.15), S.skin, M, { lw: S.lw });
  teeth(c, S.ut[0], S.ut[1], S.ut[2], S.ut[3], S.ut[4], 1, S.teeth, R, S.tw);
}
const scaleP = (pts, k) => pts.map(([x, y]) => [x * k, y * k]);
// bite: the raptor's snout (sprites-dinos.js RAP_HEAD / RAP_JAW front, raptor palette): orange, a dark stripe, white teeth.
function raptorSnout(c, L, open) {
  const R = L.R, burnt = L.burnt;
  const S = {
    up: [[-1.6, -3.4], [2.6, -4.6], [7.2, -3.9], [10, -2.4], [10.6, -0.7], [6, -0.1], [1.2, 0], [-1.6, 0.3]],
    jaw: [[-0.6, -0.3], [4.6, -0.1], [9.6, -0.2], [9.2, 1.6], [4.6, 2.2], [-0.2, 1.6]],
    mouth: [[0, -0.2], [10, -0.4], [8.6, 4.8], [0.6, 2]], ut: [1.6, 9.8, -0.1, 5, 1.2], lt: [2, 8.6, 0.1, 4, 1.1], tw: 0.75, lw: 1.5,
    skin: L.nat('#f28b2c'), teeth: L.nat(C.white, '#e8ecd2'), mouthCol: L.nat('#9e1f2a', '#7a5a4a'),
    belly: [[1, 1.4], [5, 1.8], [8.4, 1]], bellyCol: L.nat('#ffe0a6', tone(C.zskin, 0.35)), bw: 1,
  };
  jaws(c, L, S, open ? 0.55 : 0);
  if (!burnt) brush(c, [[0.8, -4.2], [3, -2.8], [0.6, -1.4]], 1.1, L.nat('#8a3a12', C.zskinD), R, { bristles: 2, dry: 0.3 });
  dab(c, 9.4, -2.4, 0.45, C.ink, R);
}
// jaws: the T-Rex's (sprites-dinos.js REX_HEAD / REX_JAW front + 'r:jaw'): huge, green-brown, great white teeth,
// dark bumps, a pale belly on the lower jaw.
function rexSnout(c, L, open) {
  const R = L.R, burnt = L.burnt, k = 1.5;
  const S = {
    up: scaleP([[-1.6, -3.6], [2.6, -4.8], [7.2, -4.1], [10, -2.6], [10.6, -0.7], [6, -0.1], [1.2, 0], [-1.6, 0.3]], k),
    jaw: scaleP([[-0.6, -0.3], [4.6, -0.1], [9.8, -0.2], [9.4, 1.8], [4.6, 2.4], [-0.2, 1.8]], k),
    mouth: scaleP([[0, -0.2], [10.2, -0.4], [8.6, 5.2], [0.6, 2.2]], k), ut: [2.4, 15, 0, 5, 2], lt: [3, 13.4, 0.2, 4, 1.7], tw: 1.15, lw: 1.8,
    skin: L.nat('#6e7d36'), teeth: L.nat(C.white, '#e8ecd2'), mouthCol: L.nat('#8e1a24', '#7a5a4a'),
    belly: [[1.8, 2.2], [7.4, 2.8], [12.6, 1.6]], bellyCol: L.nat('#e9d49a', tone(C.zskin, 0.35)), bw: 1.6,
  };
  jaws(c, L, S, open ? 0.7 : 0);
  if (!burnt) { for (const [x, y] of [[1, -4.8], [3.8, -6], [6.6, -6]]) dab(c, x, y, 0.9, L.nat('#434a1e', C.zskinD), R); brush(c, [[9, -5.4], [12.4, -3.4]], 1.2, L.nat('#434a1e', C.zskinD), R, { bristles: 2, dry: 0.3 }); }
  dab(c, 14.2, -3.4, 0.6, C.ink, R);
}
// zombie bite: the zombie's gaping mouth (sprites-myth.js zombieMouth: dark red, white teeth) on a rotten green jaw:
// always a little open, wide on atk with a green drool drop.
function zombieJaw(c, L, open) {
  const R = L.R, M = L.M, burnt = L.burnt, skin = burnt ? C.char : C.zskin, dark = burnt ? C.charL : C.zskinD, ja = open ? 0.5 : 0.15;
  fill(c, poly([[0.2, -0.6], [6.4, -1], [6, 2.6 + ja * 7], [0.6, 1.6 + ja * 4]], R, 0.15), burnt ? C.charL : '#7a1610', R, { edge: 0 });
  about(c, 0, 0, ja, () => {
    part(c, poly([[-0.6, 0.2], [3.4, 0.6], [6.4, 0.4], [6.2, 2.2], [3, 2.8], [-0.4, 2]], R, 0.12), skin, M, { lw: 1.25 });
    if (!burnt) { brush(c, [[1.2, 0.5], [1.5, -0.6]], 0.75, C.white, R, { bristles: 1, dry: 0 }); brush(c, [[4.6, 0.6], [4.4, -0.3]], 0.75, '#e8e4c8', R, { bristles: 1, dry: 0 }); }
    brush(c, [[0.6, 2.2], [3, 2.6], [5.4, 2.1]], 0.6, dark, R, { bristles: 1, dry: 0.3, taper: 0.3 });
  });
  part(c, poly([[-1.4, -3.2], [3, -3.6], [6, -2.6], [6.8, -1], [3.6, -0.6], [-1.4, -0.2]], R, 0.12), skin, M, { lw: 1.3 });
  if (!burnt) for (const [x, h] of [[1.6, 1.3], [3.4, 0.9], [5.2, 1.2]]) brush(c, [[x, -0.7], [x + 0.2, -0.7 + h]], 0.75, C.white, R, { bristles: 1, dry: 0 });
  for (const [x, y] of [[0.4, -2.4], [2, -2.6]]) brush(c, [[x - 0.6, y - 0.6], [x + 0.6, y + 0.6]], 0.45, C.ink, R, { bristles: 1, dry: 0 });   // a stitch
  if (open && L.fx && !burnt) { brush(c, [[4.6, 2.6], [4.8, 4.6]], 0.8, '#c8ec3a', R, { bristles: 2, dry: 0, taper: 0.5 }); dab(c, 4.9, 5.1, 0.65, '#c8ec3a', R); }
}
// peck: the seagull's yellow beak with its red spot (sprites-secret.js birdBody beak), a bit bigger to read.
function gullBeak(c, L, open) {
  const R = L.R, k = 1.5, bc = L.acc('#ffc81e'), bm = sm(L, 0.2, 0.85);
  part(c, poly(scaleP([[-0.2, -1.5], [4.2, -0.9], [4.9, 0.3], [0, -0.1]], k), R, 0.08), bc, bm, { lw: 0.85, sharp: true });
  about(c, 0, 0, open ? 0.55 : 0, () => {
    part(c, poly(scaleP([[0, 0], [3.6, 0.3], [0.2, 1.1]], k), R, 0.08), bc, bm, { lw: 0.85, sharp: true });
    if (!L.burnt) dab(c, 2.7 * k, 0.25 * k, 0.65, '#e3241a', R);
  });
  dab(c, 1.6, -1.3, 0.35, C.ink, R);
}
// spit: the spitter's snout + red frill (sprites-dinos.js spitLayer 'r:head' / 'r:headS', spitFrill): green, a red
// crest; atk = the frill flared into a great fan behind the jaws, the jaws open, a glob of spit at the lips.
function spitterSnout(c, L, open) {
  const R = L.R, M = L.M, burnt = L.burnt, frill = L.nat('#de3a35', '#b98a6a'), skin = L.nat('#2f8f5b');
  if (!open) {
    part(c, poly([[-2.4, -5.2], [-5.4, -2.6], [-5.6, 0.8], [-4, 3.4], [-1.6, 1.8], [-1.2, -2]], R, 0.2), frill, M, { lw: 0.9 });
    for (const y of [-2.6, 0]) brush(c, [[-2.4, y + 0.6], [-4.8, y]], 0.5, tone(frill, -0.4), R, { bristles: 1, dry: 0.2 });
  } else {
    const cx = 0.6, cy = -1.2, pts = [];
    for (let i = 0; i <= 12; i++) { const a = -2.75 + i / 12 * 3.6 - 0.9, r = i & 1 ? 7.6 : 9.4; pts.push([cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r]); }
    pts.push([cx + 1, cy + 3.4], [cx - 1.6, cy + 4.4]);
    part(c, poly(pts, R, 0.25), frill, M, { lw: 1.3, sharp: true });
    for (let i = 0; i < 6; i++) { const a = -3.5 + i * 0.62; brush(c, [[cx + Math.cos(a) * 2.8, cy + Math.sin(a) * 2.8], [cx + Math.cos(a) * 7.2, cy + Math.sin(a) * 7.6]], 0.55, tone(frill, -0.45), R, { bristles: 1, dry: 0.3, taper: 0.5 }); }
    if (!burnt) for (let i = 0; i < 5; i++) { const a = -3.25 + i * 0.68; dab(c, cx + Math.cos(a) * 5.4, cy + Math.sin(a) * 5.8, 0.85, L.nat('#ffd51e', tone(C.zskin, 0.45)), R); }
  }
  part(c, poly([[-0.4, -4.6], [0, -7.4], [2, -8], [3.4, -6.6], [3.4, -4.4]], R, 0.15), frill, sm(L, 0.4, 0.85), { lw: 0.85 });   // the crest
  jaws(c, L, {
    up: [[-1.6, -4.2], [2.4, -5.4], [5.6, -4.2], [8, -2.4], [8.4, -0.8], [4.2, -0.2], [-0.2, 0], [-1.8, 0.2]],
    jaw: [[-0.4, -0.5], [4, -0.3], [7.6, -0.3], [7.2, 1.2], [3.6, 1.6], [0, 1.2]],
    mouth: [[0.2, -0.4], [8.2, -0.6], [7, 4.4], [0.6, 1.8]], ut: [1.4, 7.6, -0.2, 4, 1.0], lt: [1.6, 6.6, 1.0, 3, 0.9], tw: 0.7, lw: 1.45,
    skin, teeth: L.nat(C.white, '#e8ecd2'), mouthCol: L.nat('#9e1f2a', '#7a5a4a'),
    belly: [[0.8, 1.2], [4, 1.5], [6.6, 0.9]], bellyCol: L.nat('#f3e27a', tone(C.zskin, 0.35)), bw: 0.9,
  }, open ? 0.62 : 0);
  if (!burnt) for (const [x, y, r] of [[1.6, -3.4, 0.8], [4, -3.4, 0.7]]) dab(c, x, y, r, L.nat('#ffd51e', tone(C.zskin, 0.45)), R);
  dab(c, 7.4, -2.4, 0.42, C.ink, R);
  if (open && L.fx && !burnt) {
    part(c, ring(9.4, 0.6, 2.1, 1.8, R, 0.15, 7), '#c8ec3a', sm(L, 0.4, 0.9), { lw: 0.9 });
    dab(c, 8.9, 0, 0.55, C.white, R);
    for (const [x, y, r] of [[7.8, 3.2, 0.65], [8.6, 5, 0.5]]) dab(c, x, y, r, '#c8ec3a', R);
  }
}
// fire breath: the dragon's snout (sprites-myth.js dragonHead: magenta upper snout + nostril, a lower jaw hinged down,
// red mouth, white teeth); atk = jaws wide, fire in the mouth and a flame licking out.
function dragonSnout(c, L, open) {
  const R = L.R, M = L.M, burnt = L.burnt, col = L.nat('#d23b66'), jw = open ? 1.25 : 0;
  if (jw > 0) {
    about(c, 0, 0, 0.3 * jw, () => {
      part(c, ring(4.2, 1.2, 5, 2.1, R, 0.08, 7), col, M, { lw: 1.3 });
      for (let i = 0; i < 3; i++) brush(c, [[3 + i * 2, -0.6], [3.4 + i * 2, -2]], 0.7, L.acc(C.white), R, { bristles: 1, dry: 0 });
    });
    fill(c, ring(5, 1.4, 4.2, 1.6 + jw * 1.2, R, 0.1, 7), burnt ? C.charL : '#7a1610', R, { edge: 0 });
    if (L.fx && !burnt) { dab(c, 7.8, 1.6, 2.2, C.fireO, R); dab(c, 8.2, 1.6, 1.2, C.fireY, R); }
  }
  about(c, 0.8, -2, -0.22 * jw, () => {
    part(c, ring(4.4, -0.2, 4.8, 3.3, R, 0.08, 7), col, M, { lw: 1.4 });
    dab(c, 7.4, -1.4, 0.6, C.ink, R);
    if (jw <= 0) { brush(c, [[1.6, 1.4], [4.8, 1.6], [8.4, 1]], 0.8, C.ink, R, { bristles: 2, dry: 0 }); for (let i = 0; i < 3; i++) brush(c, [[2.4 + i * 2, 1.4], [3.2 + i * 2, 2.8]], 0.7, L.acc(C.white), R, { bristles: 1, dry: 0 }); }
    else for (let i = 0; i < 3; i++) brush(c, [[2.4 + i * 2, 2.4], [3 + i * 2, 3.8]], 0.7, L.acc(C.white), R, { bristles: 1, dry: 0 });
    part(c, poly([[1.4, -3], [2.4, -6], [3.8, -3.2]], R, 0.15), L.acc(C.yellow), sm(L, 0.4, 0.9), { sharp: true, lw: 0.9 });   // a little nose horn
  });
  if (open && L.fx && !burnt) { c.save(); c.translate(9.2, 1.6); flameLick(c, 0, 0, 1.6, R); c.restore(); }
}

// ---------------------------------------------------------------- head gear
// tusks: the boar's (sprites-animals.js boarDraw: a white tube curving up from the snout), both of them, bolder.
function boarTusks(c, L) {
  const R = L.R;
  tube(c, [[-1.6, 0], [0.4, -1.1], [0.8, -3.4], [-0.2, -5]], 1.15, L.nat('#e8e0c8', '#d8dcbc'), R, 0.55);
  tube(c, [[0, 0.6], [2.4, -0.6], [2.8, -3.4], [1.8, -5.4]], 1.35, L.nat(C.white, '#e8ecd2'), R, 0.6);
  if (!L.burnt) brush(c, [[1.6, 0], [2.2, -2.6]], 0.4, '#fffdf2', R, { bristles: 1, dry: 0.3, taper: 0.4 });
}
// horns: the beetle's great horn (sprites-bugs.js btlLayer 'r:head': forward, then up, a teal shine), x1.25.
function beetleHorn(c, L) {
  const R = L.R, k = 1.25, horn = L.nat('#2b4f4c', C.zskinD);
  part(c, poly(scaleP([[-0.8, -0.4], [1.6, -3.4], [4, -6], [5.4, -9.6], [6.4, -6.2], [5.4, -2.4], [2.4, 0.5]], k), R, 0.15), horn, L.M, { lw: 1.25, sharp: true });
  if (!L.burnt) brush(c, scaleP([[1.6, -2], [4, -4.4], [5.4, -8]], k), 0.7, L.nat('#5fd0c6', tone(C.zskin, 0.4)), R, { bristles: 1, dry: 0.3, taper: 0.5 });
  part(c, poly([[-2.6, 0.2], [-2.2, -2.6], [-0.6, -0.6]], R, 0.1), horn, sm(L, 0.4, 0.9), { lw: 0.9, sharp: true });   // a little second horn
}

// ---------------------------------------------------------------- tail gear (root at the rear, pointing -x)
// tail: the stegosaurus tail (sprites-dinos.js steLayer 'r:tail' + 'r:tip'): green, an orange plate, four big cream
// spikes at the end, x0.75 round its root. atk = swoosh lines over the swing.
function stegoTail(c, L, atk) {
  const R = L.R, M = L.M;
  const skin = L.nat('#5b8f3c'), plateC = L.nat('#f08a24', '#c9b07a'), spike = L.nat('#f6ead0', '#e8ecd2');
  if (atk && L.fx) for (let i = 0; i < 3; i++) { const r = 12 + i * 2.6, pts = []; for (let q = 0; q <= 5; q++) { const a = lerp(-2.75, -1.65, q / 5); pts.push([Math.cos(a) * r, Math.sin(a) * r]); } brush(c, pts, 0.85, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 }); }
  // the back plates (orange, the stego's 'r:tail' plate), then the spikes, then the tapering green tail over their roots
  for (const [x, h, w] of [[-3.6, 4.2, 4], [-8.4, 3.4, 3.4]]) { const y = -2.6 + (x < -6 ? 0.5 : 0), tx = x + Math.sin(-0.3) * h, ty = y - Math.cos(-0.3) * h; part(c, poly([[x - w / 2, y + 1.4], [x - w * 0.55, y - h * 0.4], [tx, ty], [x + w * 0.55, y - h * 0.45], [x + w / 2, y + 1.4]], R, 0.12), plateC, M, { lw: 1.1, sharp: true }); }
  for (const [bx, by, ex, ey] of [[-11.8, -1.8, -14.2, -6.6], [-14.6, -1.2, -18.6, -5.4], [-12.2, 1.4, -14.8, 6], [-14.8, 0.8, -19.2, 3.8]]) {
    const dx = ex - bx, dy = ey - by, l = Math.hypot(dx, dy), nx = -dy / l * 1.2, ny = dx / l * 1.2;
    part(c, poly([[bx + nx, by + ny], [ex, ey], [bx - nx, by - ny]], R, 0.08), spike, sm(L, 0.4, 0.9), { lw: 0.9, sharp: true });
  }
  partEdges(c, poly([[0.4, -3.4], [-5, -3.1], [-10, -2.4], [-14.6, -1.5], [-16.8, -0.3], [-14.6, 0.9], [-10, 1.7], [-5, 2.7], [0.4, 3.3]], R, 0.15), [[0, 4], [4, 8]], skin, M, { lw: 1.4 });
  if (!L.burnt) for (const x of [-4, -9]) dab(c, x, 0.2, 0.8, L.nat('#33602a', C.zskinD), R);
}
// tail club: the ankylosaurus tail (sprites-dinos.js ankLayer 'r:tail' + 'r:tip'): brown, pale knobs, the great bony
// club at its end, x0.75 (the club x0.85). atk = swoosh lines.
function ankyloTail(c, L, atk) {
  const R = L.R, M = L.M, k = 0.75, ox = 13.6, oy = 10.7, m = (x, y) => [(x + ox) * k, (y + oy) * k], P = (pts) => pts.map(([x, y]) => m(x, y));
  const skin = L.nat('#9b6b3e'), knob = L.nat('#d2a56a', tone(C.zskin, 0.3));
  if (atk && L.fx) for (let i = 0; i < 3; i++) { const r = 12 + i * 2.6, pts = []; for (let q = 0; q <= 5; q++) { const a = lerp(-2.95, -1.75, q / 5); pts.push([Math.cos(a) * r, Math.sin(a) * r]); } brush(c, pts, 0.85, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 }); }
  partEdges(c, poly(P([[-13.6, -14], [-20, -13.4], [-26.6, -12.6], [-26.6, -9.4], [-20, -8.4], [-13.6, -7.4]]), R, 0.2), [[0, 2], [3, 5]], skin, M);
  if (!L.burnt) for (const x of [-18, -22.6]) { const [a, b] = m(x, -11.6); dab(c, a, b, 0.9, knob, R); }
  partEdges(c, poly(P([[-26, -12.4], [-31, -12], [-31, -9.8], [-26, -9.4]]), R, 0.12), [[0, 3]], skin, M, { lw: 1.3 });
  const [cx, cy] = m(-35, -10.8);
  part(c, ring(cx, cy, 4.1, 3.3, R, 0.12, 9), knob, M, { lw: 1.6 });
  if (!L.burnt) { const d = tone(knob, -0.25); dab(c, cx - 1.2, cy - 1, 0.85, d, R); dab(c, cx + 1.2, cy + 1.2, 0.75, d, R); dab(c, cx - 1.4, cy + 1.2, 0.6, d, R); }
}
// stinger: the bee's striped abdomen + black stinger (sprites-bugs.js beeLayer 'r:body' / 'r:bodyS'), x1.5 round
// the waist. atk = curled under, the stinger forward (as the bee stings).
function beeStinger(c, L, atk) {
  const R = L.R, M = sm(L, 0.6, 1), yel = L.nat('#ffd51e'), blk = L.burnt ? C.ink : L.risen ? C.zskinD : '#2a2018';
  c.save(); if (atk) c.rotate(-0.95);
  part(c, poly([[-9.4, -0.8], [-13.2, 0.45], [-9.4, 1.4]], R, 0.1), blk, M, { lw: 0.7, sharp: true });
  const body = ring(-5, 0, 5.4, 4.5, R, 0.06, 9);
  fill(c, shift(body, M.mx, M.my, M.grow), yel, R);
  if (!L.burnt) {
    c.save(); path(c, spline(body, true, 6)); c.clip();
    for (const [x, h] of [[-8.1, 3.5], [-4.35, 4.2]]) brush(c, [[x + 0.4, -h], [x, 0], [x + 0.2, h]], 1.45, blk, R, { bristles: 3, dry: 0.05, taper: 0 });
    c.restore();
    dab(c, -3, -2.4, 0.9, '#fff1a0', R);
  }
  outline(c, body, R, 1.15);
  c.restore();
}
// boiling spray: the bombardier's abdomen (sprites-bugs.js bomLayer 'r:ab' + 'r:spray'): black shell, two orange spots,
// the red nozzle at its tip; atk = the boiling yellow-white cone out of the nozzle, puffs, hot drops, steam.
function bombardierRear(c, L, atk) {
  const R = L.R, M = L.M, burnt = L.burnt, k = 0.85, m = (x, y) => [(x - 2.6) * k, (y + 7.6) * k], P = (pts) => pts.map(([x, y]) => m(x, y));
  const red = L.nat('#e0441c'), shell = L.nat('#241c24', tone(C.zskin, -0.4)), spot = L.nat('#ff8a1a', tone(C.zskin, 0.3));
  part(c, poly(P([[-8.4, -4.4], [-10.6, -6.2], [-11.4, -4.4], [-9.4, -3.0]]), R, 0.12), red, M, { lw: 1.0 });
  const body = poly(P([[2.4, -4], [3, -9.2], [0.2, -11.8], [-4.6, -12.2], [-8.6, -10.2], [-10.4, -6.8], [-9.6, -4], [-4, -3.2]]), R, 0.2);
  fill(c, shift(body, M.mx, M.my, M.grow), shell, R);
  if (!burnt) {
    c.save(); path(c, spline(body, true, 6)); c.clip();
    brush(c, P([[-1.8, -11.6], [-2.5, -8], [-2.1, -3.9]]), 1.8, spot, R, { bristles: 3, dry: 0.15, taper: 0 });
    brush(c, P([[-6.0, -11.0], [-6.9, -7.6], [-6.6, -4.0]]), 1.7, spot, R, { bristles: 3, dry: 0.15, taper: 0 });
    brush(c, P([[1.2, -10.4], [-1.6, -11.4], [-4.4, -11.6]]), 0.8, L.nat('#9a90a6', tone(C.zskin, 0.4)), R, { bristles: 2, dry: 0.3, taper: 0.5 });
    c.restore();
  }
  outline(c, body, R, 1.4);
  if (atk && L.fx && !burnt) {
    const [x0, y0] = m(-10.8, -5.2), ang = 0.2, ca = -Math.cos(ang), sa = Math.sin(ang), at = (d, w) => [x0 + ca * d - sa * w, y0 + sa * d + ca * w];
    const cone = []; for (const d of [0, 6, 12, 18, 22]) cone.push(at(d, -(0.8 + d * 0.22))); for (const d of [22, 18, 12, 6, 0]) cone.push(at(d, 0.8 + d * 0.22));
    part(c, poly(cone, R, 0.25), '#ffe680', M, { lw: 0.95 });
    brush(c, [at(0.5, 0), at(9, 0.3), at(17, -0.2)], 1.5, '#fffdf0', R, { bristles: 2, dry: 0.3, taper: 0.5 });
    for (const [d, w, r, col] of [[23, 0, 3.8, '#fff6c8'], [20, -4, 2.8, '#ffe266'], [21, 3.8, 3, '#ffe680'], [26, -2.2, 2.4, '#ffe266'], [26, 2.6, 2.2, '#fff4c0']]) { const [x, y] = at(d, w); part(c, ring(x, y, r, r * 0.86, R, 0.2, 8), col, M, { lw: 0.8 }); }
    for (let i = 0; i < 8; i++) { const [x, y] = at(7 + R() * 22, (R() - 0.5) * (5 + R() * 9)); dab(c, x, y, 0.45 + R() * 0.4, R() < 0.5 ? '#ff8a1a' : '#ffd23a', R); }
    const [sx, sy] = at(13, 6); brush(c, [[sx + 2, sy + 2], [sx, sy], [sx + 1.6, sy - 1.8], [sx + 3.2, sy - 0.6]], 0.75, '#cfcac3', R, { bristles: 2, dry: 0.3, taper: 0.4 });
  }
}

// ---------------------------------------------------------------- the table: one GEAR per catalogue weapon
// G(at, box, poses, paint, more): box [w, h, ax, ay] in sim px round the root (generous: bakes trim to the paint).
const G = (at, box, poses, paint, more = {}) => ({ at, box, poses, paint, ...more });
const P_ATK = ['idle', 'atk'];
const T = {
  // ---- guns
  rifle: G('hand', [21, 8, 7, 4], ['idle'], (c, L) => rifleGun(c, L, false), { hand2: [6.4, -0.7], tip: [12.5, -0.7] }),
  sniper: G('hand', [25, 11, 7, 7], ['idle'], (c, L) => rifleGun(c, L, true), { hand2: [6.4, -0.7], tip: [17, -1.3] }),
  flamer: G('hand', [30, 15, 11, 7], P_ATK, (c, L) => flamerGun(c, L, L.pose === 'atk'), { hand2: [5.2, -0.6], tip: [10.4, -1.2] }),
  pistol: G('hand', [28, 18, 6, 11], P_ATK, (c, L) => flint(c, L, L.pose === 'atk'), { tip: [8.4, -1.1] }),
  blunderbuss: G('hand', [36, 20, 9, 12], P_ATK, (c, L) => blunder(c, L, L.pose === 'atk'), { hand2: [6.8, -0.8], tip: [14.2, -0.4] }),
  revolvers: G('hand', [21, 14, 6, 8], P_ATK, (c, L) => revolver(c, L, L.pose === 'atk'), { tip: [7.4, -1.2], pair: true }),
  crossbow: G('hand', [37, 19, 11, 11], P_ATK, (c, L) => crossbowGun(c, L, L.pose === 'atk' ? 'loose' : 'spanned'), { hand2: [5.6, -0.6], tip: [17.3, -2.6] }),
  ballista: G('hand', [33, 23, 13, 13], P_ATK, (c, L) => ballistaGun(c, L, L.pose === 'atk'), { hand2: [5, 0], tip: [16.4, -2.6] }),
  raygun: G('hand', [25, 13, 8, 8], P_ATK, (c, L) => raygun(c, L, L.pose === 'atk'), { tip: [9.4, -0.7] }),
  shrink: G('hand', [40, 20, 11, 11], P_ATK, (c, L) => shrinkGun(c, L, L.pose === 'atk'), { hand2: [4.2, -0.8], tip: [14, -1] }),
  rockets: G('hand', [31, 15, 14, 10], P_ATK, (c, L) => launcher(c, L, L.pose === 'atk'), { hand2: [3.4, -0.6], tip: [6.9, -1.7] }),
  missiles: G('hand', [30, 25, 17, 20], P_ATK, (c, L) => missilePod(c, L, L.pose === 'atk'), { hand2: [4.4, 0], tip: [2, -10] }),
  laser: G('hand', [27, 19, 9, 11], P_ATK, (c, L) => laserGun(c, L, L.pose === 'atk'), { hand2: [4.6, 2], tip: [12.6, -0.5] }),
  zap: G('hand', [23, 14, 7, 8], P_ATK, (c, L) => zapper(c, L, L.pose === 'atk'), { tip: [10.4, -0.1] }),
  web: G('hand', [30, 18, 11, 10], P_ATK, (c, L) => webGun(c, L, L.pose === 'atk'), { hand2: [3.6, 3.2], tip: [8.8, -0.8] }),
  cannon: G('hand', [43, 22, 15, 16], P_ATK, (c, L) => cannonGun(c, L, L.pose === 'atk'), { hand2: [5.2, -1.4], tip: [13.2, -3] }),
  // ---- thrown + magic (the thing in the hand; atk = thrown: an empty hand)
  grenade: G('hand', [14, 17, 5, 12], P_ATK, (c, L) => { if (L.pose !== 'atk') grenadeBall(c, L, 1, -1.4); }, { empty: ['atk'] }),
  shuriken: G('hand', [17, 11, 4, 7], P_ATK, (c, L) => { if (L.pose === 'atk') { for (let i = 0; i < 2; i++) brush(c, [[1.6, -1 + i * 2.2], [4, -1.3 + i * 2.2]], 0.45, C.ink, L.R, { bristles: 1, dry: 0.4, taper: 0.6 }); shuriken(c, 7.4, -0.6, 2.7, L.R, L.burnt); } else shuriken(c, 1.6, -0.6, 2.7, L.R, L.burnt); }),
  bow: G('hand', [21, 27, 11, 13], ['idle', 'atk', 'loose'], (c, L) => bowPaint(c, L), { hand2: [-3.2, 0.5], hand2A: [-8.4, 0.4], tip: [6.4, -0.5] }),
  bombs: G('hand', [15, 18, 5, 14], ['idle', 'aim', 'atk'], (c, L) => { if (L.pose !== 'atk') pirateBomb(c, L, 1.2, -1.6, L.pose === 'aim' ? 2.6 : 0); }, { empty: ['atk'] }),
  oilpot: G('hand', [25, 20, 6, 14], ['idle', 'atk', 'ladle'], (c, L) => { if (L.pose === 'ladle') ladle(c, L, [-1.6, 0.2], [12.4, -0.4]); else if (L.pose !== 'atk') oilPot(c, L, 2, -1.6, 3.4, true); }, { empty: ['atk'] }),
  fastball: G('hand', [11, 12, 5, 7], P_ATK, (c, L) => { if (L.pose !== 'atk') baseball(c, L, 0.9, -1, 1.9); }, { empty: ['atk'] }),
  bowling: G('hand', [16, 16, 7, 9], P_ATK, (c, L) => { if (L.pose !== 'atk') bowlBall(c, L, 1.4, -0.9, 3.3); }, { empty: ['atk'] }),
  puck: G('hand', [32, 11, 6, 4], P_ATK, (c, L) => hockeyStick(c, L, L.pose !== 'atk'), { hand2: [6.4, 0.2], tip: [18.6, 2] }),
  snowball: G('hand', [14, 13, 6, 8], P_ATK, (c, L) => { if (L.pose !== 'atk') snowball(c, L, 1.4, -1.2, 3.1); }, { empty: ['atk'] }),
  boulder: G('hand', [31, 21, 9, 15], P_ATK, (c, L) => catapultArm(c, L, L.pose === 'atk'), { hand2: [4.6, -0.1], tip: [14.2, -6] }),
  lavablob: G('hand', [17, 16, 7, 9], P_ATK, (c, L) => { if (L.pose !== 'atk') lavaBlob(c, L, 1.6, -1.4, 3.6); }, { empty: ['atk'] }),
  spit: G('mouth', [27, 25, 12, 15], P_ATK, (c, L) => spitterSnout(c, L, L.pose === 'atk'), { tip: [9.4, 0.6] }),
  fireball: G('hand', [44, 16, 17, 9], P_ATK, (c, L) => mageStaff(c, L, L.pose === 'atk' ? 'fire' : null), { tip: [18.4, -0.6] }),
  lightning: G('hand', [43, 17, 17, 9], P_ATK, (c, L) => mageStaff(c, L, L.pose === 'atk' ? 'bolt' : null), { tip: [18.4, -0.6] }),
  bubble: G('hand', [26, 21, 8, 13], P_ATK, (c, L) => (L.pose === 'atk' ? gravOrb(c, L, 4.4, -1.2, 4.3, true) : gravOrb(c, L, 3, -2.4, 3.5, false)), { tip: [4.4, -1.2] }),
  firebreath: G('mouth', [26, 20, 6, 10], P_ATK, (c, L) => dragonSnout(c, L, L.pose === 'atk'), { tip: [9.2, 1.6] }),
  spray: G('tail', [50, 26, 45, 9], P_ATK, (c, L) => bombardierRear(c, L, L.pose === 'atk'), { behind: true, tip: [-11.4, 2.2] }),
  // ---- held melee
  sword: G('hand', [25, 9, 6, 5], ['idle'], (c, L) => gladius(c, L), { tip: [15.6, 0] }),
  club: G('hand', [28, 16, 8, 8], ['idle'], (c, L) => giantClub(c, L), { hand2: [3, 0], tip: [15.2, 0] }),
  halberd: G('hand', [52, 20, 19, 9], ['idle'], (c, L) => halberdPole(c, L, [-16, 0.2], [22, -0.2]), { hand2: [-6, 0.1], tip: [28.4, -0.2] }),
  cutlass: G('hand', [19, 9, 5, 5], ['idle'], (c, L) => cutlassBlade(c, L, 0, 0, 12, 0, 1), { tip: [12, 0] }),
  anchor: G('hand', [23, 23, 3, 11], ['idle'], (c, L) => { chain(c, L, [[0, 0], [2.6, 0.5], [4.6, 0.4]]); anchorShape(c, L, 5.6, 0.4, -PI / 2, 0.92); }, { hand2: [2.4, 0.4], tip: [16.6, 0.4] }),
  bat: G('hand', [23, 9, 6, 5], ['idle'], (c, L) => baseBat(c, L, [0, 0], [14.6, 0]), { hand2: [2.4, 0], tip: [14.6, 0] }),
  dagger: G('hand', [16, 10, 5, 5], ['idle'], (c, L) => crystalDagger(c, L, 0, 0, 7.8, 0), { tip: [7.8, 0] }),
  ram: G('hand', [38, 16, 13, 11], P_ATK, (c, L) => ramLog(c, L, L.pose === 'atk'), { hand2: [8, -0.2], tip: [18, -2.2] }),
  saw: G('hand', [27, 20, 6, 10], P_ATK, (c, L) => sawArm(c, L, L.pose === 'atk'), { tip: [13.8, 0] }),
  fists: G('fist', [15, 14, 6, 8], ['idle'], (c, L) => boxGlove(c, L, 1.6, 0, -4, 0, 2.8), { pair: true }),
  slam: G('fist', [16, 14, 7, 8], P_ATK, (c, L) => apeFist(c, L, L.pose === 'atk'), { pair: true }),
  shove: G('fist', [18, 15, 7, 8], P_ATK, (c, L) => sumoPalm(c, L, L.pose === 'atk'), { pair: true }),
  floatpunch: G('fist', [17, 15, 7, 9], P_ATK, (c, L) => astroGlove(c, L, L.pose === 'atk'), { pair: true }),
  // ---- body weapons
  bite: G('mouth', [22, 20, 7, 9], P_ATK, (c, L) => raptorSnout(c, L, L.pose === 'atk'), { tip: [10.6, -0.4] }),
  jaws: G('mouth', [29, 27, 8, 12], P_ATK, (c, L) => rexSnout(c, L, L.pose === 'atk'), { tip: [15.8, -0.5] }),
  zombiebite: G('mouth', [19, 18, 7, 9], P_ATK, (c, L) => zombieJaw(c, L, L.pose === 'atk'), { tip: [6.6, 0] }),
  peck: G('mouth', [16, 13, 5, 6], P_ATK, (c, L) => gullBeak(c, L, L.pose === 'atk'), { tip: [7.4, 0.4] }),
  tusks: G('head', [11, 13, 5, 9], ['idle'], (c, L) => boarTusks(c, L), { root: 'snout' }),
  horns: G('head', [18, 22, 7, 17], ['idle'], (c, L) => beetleHorn(c, L)),
  pinch: G('fist', [22, 17, 6, 9], P_ATK, (c, L) => crabClaw(c, L, L.pose === 'atk')),
  blades: G('fist', [19, 17, 5, 10], P_ATK, (c, L) => mantisBlade(c, L, L.pose === 'atk'), { pair: true }),
  tail: G('tail', [28, 29, 23, 20], P_ATK, (c, L) => stegoTail(c, L, L.pose === 'atk'), { behind: true }),
  tailclub: G('tail', [30, 28, 25, 20], P_ATK, (c, L) => ankyloTail(c, L, L.pose === 'atk'), { behind: true }),
  sting: G('tail', [23, 23, 17, 8], P_ATK, (c, L) => beeStinger(c, L, L.pose === 'atk'), { behind: true }),
};
// bow: the archer's (people.js human() archer 'nock' / 'aim' / 'loose'), round the bow hand: idle = an arrow on a slack
// string, atk = full draw (the archer's 'aim'), loose = loosed (the string snapped back straight and humming, no arrow).
function bowPaint(c, L) {
  const R = L.R, wood = L.burnt ? C.char : C.brown, p = L.pose;
  if (p === 'atk' || p === 'loose') {
    brush(c, [[-3.2, -10.4], [0.1, -4.4], [0.3, 3.4], [-3.2, 10.6]], 1.8, wood, R, { taper: 0.1, dry: 0.1, bristles: 3 });
    if (p === 'atk') {
      brush(c, [[-3.2, -10.4], [-8.4, 0.4], [-3.2, 10.6]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      brush(c, [[-8.4, 0.4], [3.8, 0.4]], 0.85, L.acc(C.brownL), R, { bristles: 2, dry: 0, taper: 0 });
      dab(c, 4.2, 0.4, 1, C.ink, R);
    } else {
      brush(c, [[-3.2, -10.4], [-3.4, 0.4], [-3.2, 10.6]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      for (const k of [-1, 1]) brush(c, [[-3.4 + k * 1.3, -4.4], [-3.5 + k * 1.6, 0.4], [-3.4 + k * 1.3, 5.2]], 0.35, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.4 });
    }
    return;
  }
  brush(c, [[-3, -9.7], [0, -4.1], [0.2, 3.5], [-3, 9.9]], 1.8, wood, R, { taper: 0.1, dry: 0.1, bristles: 3 });
  brush(c, [[-3, -9.7], [-3.2, 0.3], [-3, 9.9]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  brush(c, [[-4, 0.7], [6, -0.5]], 0.85, L.acc(C.brownL), R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, 6.4, -0.5, 1, C.ink, R);
}

// ---------------------------------------------------------------- GEAR: wire the table to the hooks
const IDS = WEAPONS.map((w) => w.id);
const HOLD = Object.fromEntries(WEAPONS.map((w) => [w.id, w.hold]));
for (const id of IDS) {
  const t = T[id];
  if (!t) { console.warn('gear-weapons: no gear for', id); continue; }
  const poses = t.poses;
  GEAR[id] = {
    ...t, hold: HOLD[id],
    /** Paint one frame: (c, o) with o = { R, M, body, col, dead, v, pose, risen? } (see the header). */
    paint(c, o) {
      const R = o.R || rng(hash('gear|' + id + '|' + (o.v | 0))), M = o.M || M0(R);
      const pose = poses.includes(o.pose) ? o.pose : o.pose === 'aim' && poses.includes('atk') && id === 'bow' ? 'atk' : 'idle';
      const L = look({ ...o, R, M, pose });
      t.paint(c, L);
    },
  };
}

// ---------------------------------------------------------------- ICON: picker card pictures
// Per weapon: rot = turn (rad, + clockwise) so a long weapon lies diagonal, pose = which gear pose shows, paint = an
// icon-only painter where the spell / the business end reads better than the carrier (fireball, lightning, bubble).
const DIAG = -0.72, BLADE = -0.78;
const ICO = {
  rifle: { rot: DIAG }, sniper: { rot: DIAG }, flamer: { rot: DIAG, pose: 'atk' }, pistol: { rot: -0.3 }, blunderbuss: { rot: DIAG },
  revolvers: { rot: -0.3 }, crossbow: { rot: DIAG }, ballista: { rot: -0.4 }, raygun: { rot: -0.3, pose: 'atk' }, shrink: { rot: DIAG, pose: 'atk' },
  rockets: { rot: -0.45 }, missiles: { rot: 0, pose: 'atk' }, laser: { rot: -0.35, pose: 'atk' }, zap: { rot: -0.3, pose: 'atk' }, web: { rot: -0.4, pose: 'atk' },
  cannon: { rot: -0.4, pose: 'atk' },
  grenade: { paint: (c, L) => { c.scale(1.6, 1.6); grenadeBall(c, L, 0, 0); } }, shuriken: {}, bow: { rot: -0.7, pose: 'atk' }, bombs: { paint: (c, L) => pirateBomb(c, L, 0, 0, 4, 4.6) }, oilpot: { paint: (c, L) => oilPot(c, L, 0, 0, 5, true) },
  fastball: { paint: (c, L) => baseball(c, L, 0, 0, 5) }, bowling: { paint: (c, L) => bowlBall(c, L, 0, 0, 5.5) }, puck: { rot: 0.7, paint: (c, L) => hockeyStick(c, L, true, 5) },
  snowball: { paint: (c, L) => snowball(c, L, 0, 0, 5.5) }, boulder: { rot: -0.35 }, lavablob: { paint: (c, L) => lavaBlob(c, L, 0, 0, 5.5) }, spit: { pose: 'atk' },
  fireball: { paint: (c, L) => { flameX(c, 3.4, 0, 9, L.R); part(c, ring(0, 0, 4.6, 4.3, L.R, 0.15, 8), C.fireO, L.M, { lw: 1.4 }); dab(c, -0.4, 0.4, 2.3, C.fireY, L.R); dab(c, -1.2, -0.6, 0.9, '#fff3b0', L.R); }, rot: -0.5 },
  lightning: { paint: (c, L) => iconBolt(c, L) },
  bubble: { paint: (c, L) => gravOrb(c, L, 0, 0, 4.3, true) },
  firebreath: { pose: 'atk' }, spray: { paint: (c, L) => iconSpray(c, L) },
  sword: { rot: BLADE }, club: { rot: BLADE }, halberd: { rot: -0.85, paint: (c, L) => halberdPole(c, L, [-5, 0.1], [17, -0.1]) }, cutlass: { rot: BLADE }, anchor: { rot: 0.5 }, bat: { rot: BLADE },
  dagger: { rot: BLADE }, ram: { rot: -0.6 }, saw: { rot: -0.3, pose: 'atk' },
  fists: {}, slam: {}, shove: {}, floatpunch: {},
  bite: { pose: 'atk' }, jaws: { pose: 'atk' }, zombiebite: { pose: 'atk' }, peck: { pose: 'atk' }, tusks: {}, horns: {}, pinch: {},
  blades: { pose: 'atk', rot: -0.2 }, tail: { rot: 0.2 }, tailclub: { rot: 0.15 }, sting: {},
};
/** The spray icon: the bombardier's rear with a short boiling burst out of its nozzle (the full jet is too long for a card). */
function iconSpray(c, L) {
  const R = L.R, M = L.M;
  bombardierRear(c, L, false);
  const x0 = -10.6, y0 = 2.1;
  for (const [dx, dy, r, col] of [[-4.6, 0.6, 3.4, '#fff6c8'], [-8.2, -1.8, 2.6, '#ffe266'], [-8.6, 2.8, 2.8, '#ffe680'], [-11.6, 0.4, 2.2, '#fff2b0']]) part(c, ring(x0 + dx, y0 + dy, r, r * 0.86, R, 0.2, 8), col, M, { lw: 0.85 });
  for (let i = 0; i < 6; i++) dab(c, x0 - 3 - R() * 10, y0 + (R() - 0.5) * 9, 0.55 + R() * 0.3, R() < 0.5 ? '#ff8a1a' : '#ffd23a', R);
}
/** The lightning icon: a fat yellow zigzag bolt with an ink edge and a white spark at its tip. */
function iconBolt(c, L) {
  const R = L.R, pts = [[-2.6, -9], [3.4, -9.4], [0.6, -2.4], [4.8, -2.6], [-3.2, 9.6], [-0.6, 0.6], [-4.6, 0.8]];
  part(c, poly(pts, R, 0.12), C.yellow, L.M, { lw: 1.5, sharp: true });
  brush(c, [[0.4, -7.6], [-1.2, -1.6]], 0.7, '#fff6b0', R, { bristles: 2, dry: 0.3, taper: 0.5 });
  spark(c, -3, 9, 2.4, R);
}
const ICON_CACHE = new Map();
/** Paint the icon of `id` into a fresh canvas W x H device px: measure the painted bounds once, then paint again fitted. */
function renderIcon(id, W, H, col) {
  const spec = ICO[id] || {}, g = GEAR[id], seed = hash('icon|' + id);
  const draw = (c) => {
    const R = rng(seed), M = M0(R), L = look({ R, M, col, dead: false, pose: spec.pose || 'idle' });
    if (spec.rot) c.rotate(spec.rot);
    if (spec.paint) spec.paint(c, L); else g.paint(c, { R, M, col, dead: false, v: 0, pose: spec.pose || 'idle', body: 'person' });
  };
  // 1. measure: paint at 6 px per sim px on a scratch big enough for any gear turned any way
  const S = 6, ext = 60, N = ext * 2 * S, scr = canvas(N, N), sc = scr.getContext('2d', { willReadFrequently: true });
  sc.setTransform(S, 0, 0, S, N / 2, N / 2); draw(sc);
  const d = sc.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = canvas(W, H), oc = out.getContext('2d', { willReadFrequently: true });
  if (x1 < 0) return out;
  const bx0 = (x0 - N / 2) / S, by0 = (y0 - N / 2) / S, bw = (x1 - x0 + 1) / S, bh = (y1 - y0 + 1) / S;
  // 2. fit into the card picture with a small margin, centred, and paint again at that scale (crisp, same strokes)
  const pad = Math.min(W, H) * 0.06, f = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  oc.setTransform(f, 0, 0, f, W / 2 - (bx0 + bw / 2) * f, H / 2 - (by0 + bh / 2) * f);
  draw(oc);
  oc.setTransform(2.15, 0, 0, 2.15, 0, 0);   // paper tooth at the game's grain: ~1 device px specks, whatever the icon size
  tooth(oc, 0, 0, W / 2.15, H / 2.15, seed, 0.32);
  return out;
}
for (const id of IDS) {
  if (!GEAR[id]) continue;
  /** Picker card picture: (ctx, w, h, col?) into (0, 0)-(w, h) of ctx's current transform. */
  ICON[id] = (ctx, w, h, col) => {
    const T0 = ctx.getTransform ? ctx.getTransform() : null, k = T0 ? Math.max(1, Math.hypot(T0.a, T0.b)) : 1;
    const W = Math.max(8, Math.round(w * k)), H = Math.max(8, Math.round(h * k)), key = id + '|' + W + 'x' + H + '|' + (col || '');
    let cv = ICON_CACHE.get(key);
    if (!cv) { cv = renderIcon(id, W, H, col || C.red); if (ICON_CACHE.size > 400) ICON_CACHE.clear(); ICON_CACHE.set(key, cv); }
    ctx.drawImage(cv, 0, 0, w, h);
  };
}
