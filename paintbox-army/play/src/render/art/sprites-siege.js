// SIEGE tab sprites (Part 2 step 4, OURS: no OG source). Owner: SIEGE-ART. Contract: ART.md + RIG.md (+ PROJ in sprites.js).
// POSTER PAINT: a 7-year-old's tempera painting of a medieval siege. Soldiers are kid-a people (people.js human(), kind
// 'siege' = a plain person with no kit of its own) in a TABARD of the team colour over a grey mail skirt, with helmets,
// shields and weapons painted here. Machines are chunky wood with big spoked wheels, rope and nails; the team colour is
// on their pennants, banners and roof valance. Every entry paints ONE frame facing RIGHT, feet (ground middle) at (0,0).
//
// Pose picking: every entry brings pick(u, info) (RENDER index.js pickPose). Codes from STEP4.md (u.b.act):
//   people  'fly' u.z > 1 (tossed); then per unit, first match wins:
//     shieldwall  act 1 -> 'brace' (crouched, tower shield planted); u.attack > 0.35 -> 'atk' (sword jab over the shield)
//     halberd     act 1 -> 'set' (polearm levelled, butt on the ground); u.attack > 0.35 -> 'atk' (overhead chop)
//     crossbow    u.attack > 0.35 -> 'atk' (just shot: string snapped, bolt gone; the sim sets act 2 in the same tick);
//                 act 2 -> 'crank' (kneeling, foot in the stirrup, winding); act 1 -> 'aim' (at the shoulder)
//     oilpot      act 1 -> 'throw' (arm flung, pot gone); act 2 = out of pots: the 'e' set: 'eatk' (ladle swing) / 'ewalk0'
//                 'ewalk1' / 'empty' (ladle up), empty basket; else u.attack > 0.35 -> 'atk' (ladle swing, pots in the basket)
//     siegecrew   u.attack > 0.35 -> 'atk' (short sword swing)
//     else null: RENDER's walk0 / walk1 while moving, else 'idle'.
//   machines (lie 'none': a dead machine is a wreck, not turned onto its back):
//     ram         act 2 -> 'thrust' (log swung out); act 1 -> 'back' (log pulled back); moving -> 'roll0'/'roll1'
//     catapult    act 2 -> 'fire' (arm up against the crossbar); act 1 -> 'loaded' (boulder in the cup); moving -> roll
//     ballista    act 2 -> 'fire' (string snapped, bolt gone); act 1 -> 'aim' (raised a little); moving -> roll;
//                 reloading after a shot (u.b.fireAt > 0 && u.b.reload > 0), standing -> 'empty' (string forward, no bolt)
//     siegetower  act 1 -> 'docked' (drawbridge down); moving -> roll
//   Rolling = info.moving, roll0 / roll1 on info.walkFrame (wheel spokes a half step apart).
//
// Floppy bodies (RIG.md): people are parts 'r:leg' (+ 'r:lunge0/1' or 'r:kneel0/1' bent legs for crouched poses), 'r:body',
// 'r:head' / 'r:headO', 'r:arm:<key>' (arms + weapon), 'r:back:<key>', 'r:shield' / 'r:shieldP' (carried / planted) on the
// 'siegeman' driver; machines are 'r:frame' (body + far wheels), 'r:wheel' (one near wheel, put at each hub, turning) and
// their moving bits ('r:ropes' + 'r:log', 'r:arm' + 'r:stone' + 'r:swoosh', 'r:stock*', 'r:bridge' + 'r:chain' + 'r:flag')
// on the 'ram' / 'catapult' / 'ballista' / 'tower' drivers (rig-siege.js). Whole poses are built from the same part
// painters (same places), so whole and rigged always agree. Dead machines: the whole frame = the wreck the driver's body()
// settles into (rig-siege.js WRECK); people: the 'idle' frame with X eyes, turned onto its back by RENDER.
//
// PROJ (fx.js default case): bolt (crossbow), bigbolt (ballista), boulder (catapult, rolls along after landing), oilpot (lit
// pot, spinning). Fletching / nothing else is team-coloured: bolt v = 0 own, 1 red (team 0), 2 blue (team 1).
import { C, TAU, tone, brush, ring, poly, fill, outline, part, dab, tube, shift } from './paint.js';
import { human, humanLeg, LEGS } from './people.js';
import { POSE_CODE, G_RAM, G_CAT, G_BAL, G_TOW, WRECK, eachWreck, towChainEnd } from './rig-siege.js';

const OWN = '#d6a11a';            // mustard (STEP4: own colour = mustard + wood)
const WOOD = C.brown, WOODL = C.brownL, WOODD = '#6a4321', IRON = C.greyL, IROND = C.grey;
const ROPE = '#dcbb7c', TERRA = '#c9622c', LEATHER = '#7a4a26', LINEN = '#f3ecd8', PAD = '#e9d9b0';
const SWOOSH = '#e9eef2';
const KIND = 'siege';             // human() kind with no kit: only body, head, face, hair; we paint the rest
const HIP = -8;
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const BC = (burnt, col, dark) => (burnt ? (dark ? C.char : C.charL) : col);

// ================================================================ shared bits
/** Points every ~step px along a closed polygon's edges (so the painted spline keeps straight sides and corners). */
function sub(pts, step = 3) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
/** A wooden beam from (x0,y0) to (x1,y1), w wide: plank fill, grain line, nails at both ends (o.nails). */
function beam(c, x0, y0, x1, y1, w, col, M, o = {}) {
  const R = M.R, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
  const pts = poly(sub([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], 2.6), R, 0.12);
  part(c, pts, col, M, { sharp: true, lw: o.lw ?? 1.3, ang: Math.atan2(dy, dx), sp: 0.7 });
  if (o.grain !== false && l > 7 && w > 1.8) brush(c, [[x0 + dx * 0.1 + nx * 0.25, y0 + dy * 0.1 + ny * 0.25], [x0 + dx * 0.55 - nx * 0.1, y0 + dy * 0.55 - ny * 0.1], [x0 + dx * 0.9 + nx * 0.2, y0 + dy * 0.9 + ny * 0.2]], 0.45, tone(col, -0.32), R, { bristles: 1, dry: 0.45, taper: 0.3 });
  if (o.nails) for (const t of [0.12, 0.88]) dab(c, x0 + dx * t, y0 + dy * t, 0.55, C.ink, R);
}
/** A big kid wheel: wooden disc, cross of spokes (turned by ang), iron tyre line, hub. far = the darker one behind. */
function wheel(c, x, y, r, ang, M, burnt, far) {
  const R = M.R, disc = burnt ? (far ? C.char : C.charL) : far ? tone(WOODL, -0.3) : WOODL, sp = burnt ? C.char : far ? tone(WOOD, -0.35) : WOOD;
  part(c, ring(x, y, r, r, R, 0.05, 10), disc, M, { lw: far ? 1.4 : 1.8, sp: 0.9 });
  for (let k = 0; k < 2; k++) {
    const a = ang + k * Math.PI / 2, ex = Math.cos(a) * r * 0.8, ey = Math.sin(a) * r * 0.8;
    brush(c, [[x - ex, y - ey], [x + ex, y + ey]], Math.max(0.9, r * 0.2), sp, R, { bristles: 2, dry: 0.12, taper: 0, swell: 0 });
  }
  if (!far) outline(c, ring(x, y, r * 0.78, r * 0.78, R, 0.04, 10), R, 0.55, { col: burnt ? C.ink : tone(WOOD, -0.25), bristles: 2, jit: 0.15 });
  dab(c, x, y, r * 0.28, C.ink, R); dab(c, x - r * 0.07, y - r * 0.08, r * 0.12, burnt ? C.charL : IRON, R);
}
function rope(c, pts, w, R, burnt) {
  tube(c, pts, w, burnt ? C.charL : ROPE, R, 0.42);
  if (!burnt && pts.length >= 2) { const [a, b] = [pts[0], pts[pts.length - 1]]; for (let t = 0.2; t < 0.9; t += 0.25) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; brush(c, [[x - 0.4, y - 0.5], [x + 0.4, y + 0.5]], 0.32, tone(ROPE, -0.4), R, { bristles: 1, dry: 0, taper: 0 }); } }
}
/** A rope coil (torsion bundle, windlass, crew's rope). */
function coil(c, x, y, r, M, burnt) {
  const R = M.R;
  part(c, ring(x, y, r, r, R, 0.08, 9), burnt ? C.charL : ROPE, M, { lw: 1.2 });
  for (let i = 0; i < 3; i++) brush(c, [[x - r * 0.6, y - r * 0.55 + i * r * 0.5], [x + r * 0.6, y - r * 0.85 + i * r * 0.5]], 0.4, burnt ? C.ink : tone(ROPE, -0.45), R, { bristles: 1, dry: 0.2, taper: 0.2 });
}
/** A pennant on a pole: pole from base up h, flag in col flying back (-x). */
function pennant(c, x, y, h, len, col, M, burnt) {
  const R = M.R;
  brush(c, [[x, y], [x + 0.2, y - h * 0.5], [x, y - h]], 1.05, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  const f = poly([[x, y - h + 0.4], [x - len * 0.55, y - h + 1.4], [x - len, y - h + 2.6], [x - len * 0.5, y - h + 4.2], [x, y - h + 5.4]], R, 0.2);
  part(c, f, burnt ? C.char : col, M, { lw: 1.1, sharp: false });
  dab(c, x, y - h - 0.6, 0.8, burnt ? C.charL : C.yellow, R);
}
function swoosh(c, pts, R, w = 1.1) {
  brush(c, pts, w * 1.25, SWOOSH, R, { bristles: 3, taper: 0.95, dry: 0.6, vary: 0.04 });
  brush(c, pts.map(([x, y]) => [x - 0.8, y + 2.2]), w * 0.6, C.greyL, R, { bristles: 2, taper: 0.95, dry: 0.6 });
}
function streaks(c, x, y, n, len, R, gap = 2.6) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap - 0.2]], 0.55, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.7 }); }
const armL = (c, R, pts, w = 1.3) => brush(c, pts, w, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 });
const handAt = (c, R, x, y, skin) => dab(c, x, y, 1.05, skin, R);
/** A short sword: grip g0 -> g1 (dark), crossguard at g1, blade to tip. */
function sword(c, g0, g1, tip, R, burnt, w = 1) {
  tube(c, [g1, tip], w, burnt ? C.charL : IRON, R, 0.5);
  brush(c, [g0, g1], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  const dx = tip[0] - g1[0], dy = tip[1] - g1[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 1.9, ny = dx / l * 1.9;
  brush(c, [[g1[0] + nx, g1[1] + ny], [g1[0] - nx, g1[1] - ny]], 1.0, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}

// ================================================================ people
// Standing frame = people.js human(): feet (0,0), hip (0,-8), body (0,-12.8), head (0.5,-22.9) r 5.5, shoulder (1,-16.4).
// A crouched pose lowers the upper body by drop px and leans it about the hip (upper()); its bent legs are painted in place.
function upper(c, drop, lean) { if (drop) c.translate(0, drop); if (lean) { c.translate(0, HIP); c.rotate(lean); c.translate(0, -HIP); } }
const CROUCH = {   // [far leg, near leg] from the lowered hip (drop d) to the feet
  lunge: (d) => [[[-1.8, HIP + d], [-4.6, -3.6], [-7.6, -0.3], [-9.2, -0.1]], [[1.8, HIP + d], [6, -5.4], [6.6, -0.4], [8.6, -0.1]]],
  kneel: (d) => [[[-1.8, HIP + d], [3, -5.4], [3.2, -0.4], [5, -0.1]], [[1.8, HIP + d], [1.8, -0.5], [-3.6, -0.4]]],
};
function crouchLeg(c, kind, i, d, R) { brush(c, CROUCH[kind](d)[i], 1.9, C.ink, R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 }); }
function mail(c, M, burnt) { part(c, poly([[-5.6, -10.8], [5.6, -11], [6.5, -4.4], [0.4, -3.8], [-6, -4.4]], M.R, 0.25), burnt ? C.charL : IRON, M, { lw: 1.2 }); }
function belt(c, M, burnt) {
  const R = M.R;
  brush(c, [[-5.2, -9.6], [0, -9], [5.3, -9.6]], 1.35, burnt ? C.ink : LEATHER, R, { bristles: 2, dry: 0.1, taper: 0 });
  if (!burnt) dab(c, 2.4, -9.2, 0.75, C.yellow, R);
}
/** Tabard mark: a cream chevron on the chest (reads as a uniform; the tabard itself is the team colour). */
function chevron(c, M, burnt) { if (!burnt) brush(c, [[-3.4, -16.4], [0, -13.6], [3.6, -16.6]], 1.25, '#fbf3dc', M.R, { bristles: 2, dry: 0.15, taper: 0.1 }); }

// ---------- helmets (painted after human()'s head; skipped when hatless: human() paints messy hair then)
function kettle(c, M, burnt) {   // shieldwall: steel kettle hat, wide brim
  const R = M.R;
  part(c, poly([[-4.8, -25.2], [-4.4, -28.8], [-1.6, -31.3], [2.6, -31.4], [5.6, -28.9], [6, -25.2]], R, 0.25), BC(burnt, IRON, 1), M);
  part(c, poly([[-8.8, -25.6], [-6.6, -27.2], [7.8, -27.3], [10, -25.6], [8, -24.1], [-6.8, -24]], R, 0.2), BC(burnt, IROND), M, { lw: 1.3 });
  if (!burnt) dab(c, 0.6, -29.6, 0.65, '#fffdf2', R);
}
function morion(c, M, burnt) {   // halberd: crested steel morion, boat-shaped brim
  const R = M.R;
  part(c, poly([[-1.8, -30.8], [-0.6, -35.6], [2.8, -35.4], [3.8, -30.6]], R, 0.2), BC(burnt, IROND), M, { lw: 1.1 });
  part(c, ring(1, -28.4, 5.3, 4, R, 0.06, 9), BC(burnt, IRON, 1), M);
  part(c, poly([[-9.4, -29.8], [-6.4, -25.8], [0.6, -25], [7.8, -25.8], [10.8, -30], [7.4, -27.8], [0.8, -27.1], [-6, -27.8]], R, 0.2), BC(burnt, IRON, 1), M, { lw: 1.3 });
  if (!burnt) dab(c, -0.6, -29.6, 0.6, '#fffdf2', R);
}
function hoodBack(c, M, burnt, col) {   // crossbow: a hood in a dark team colour round the face, its pointy tail down the back
  const R = M.R, HOOD = tone(col, -0.32);
  part(c, poly([[-5.4, -24.6], [-8.4, -21.6], [-9.6, -15.6], [-7.6, -14.8], [-5.2, -19]], R, 0.18), BC(burnt, HOOD, 1), M, { lw: 1.2 });
  part(c, ring(0, -23.4, 6.5, 6.3, R, 0.06, 9), BC(burnt, HOOD, 1), M);
}
function hoodFront(c, M, burnt, col) {
  const HOOD = tone(col, -0.32);
  brush(c, [[-2, -17.6], [-2.8, -22.6], [-0.8, -27.4], [3.4, -28.4], [6.2, -26.4]], 1.5, burnt ? C.charL : tone(HOOD, -0.18), M.R, { bristles: 3, dry: 0.2, taper: 0.2 });
}
function oilCap(c, M, burnt, col) {     // oilpot: felt cap in the team colour, a leather earflap
  const R = M.R;
  part(c, poly([[-5.6, -24.6], [-5, -28.6], [-1.6, -30.9], [2.8, -30.9], [6, -28.4], [6.4, -25]], R, 0.22), BC(burnt, tone(col, -0.15), 1), M);
  part(c, poly([[-5.8, -25.6], [-6.2, -20.2], [-3.2, -20], [-3, -25.2]], R, 0.18), BC(burnt, tone(LEATHER, -0.15), 1), M, { lw: 1.2 });
}
function coif(c, M, burnt) {       // siegecrew: a white linen coif tied under the chin
  const R = M.R;
  part(c, poly([[-5.4, -21.4], [-5.8, -26.4], [-3.4, -29.8], [1, -30.8], [5, -29.2], [6.4, -26.2], [5.6, -24.8], [1, -26.4], [-2.6, -25.8], [-2.8, -20.4]], R, 0.2), BC(burnt, LINEN), M, { lw: 1.4 });
  brush(c, [[-2.6, -20.6], [-0.4, -17.4], [2.4, -17.2]], 0.7, burnt ? C.charL : LINEN, R, { bristles: 2, dry: 0.1, taper: 0 });
}

// ---------- weapons + gear
/** Tower shield (pavise): face in the team colour, plank seams, wooden rim, nails, iron boss. Carried in the standing frame;
 *  planted (brace) moved forward and down onto the ground (SHIELD_P). */
const SHIELD = [[2.2, -18.4], [3.4, -20.4], [7.6, -21.3], [11.8, -20.4], [13, -18.4], [13.2, -2.2], [12, -0.9], [3.2, -0.9], [2, -2.2]];
const SHIELD_P = [3.4, 0.4];
function towerShield(c, M, col, burnt, planted) {
  const R = M.R, [dx, dy] = planted ? SHIELD_P : [0, 0], at = (x, y) => [x + dx, y + dy];
  part(c, poly(sub(SHIELD.map(([x, y]) => at(x, y)), 3), R, 0.14), burnt ? C.char : col, M, { lw: 1.8, ang: Math.PI / 2 });
  if (!burnt) {
    for (const x of [5.8, 9.6]) brush(c, [at(x, -19.6), at(x + 0.1, -2)], 0.5, tone(col, -0.32), R, { bristles: 1, dry: 0.35, taper: 0 });
    brush(c, [at(3.1, -2.6), at(3.4, -17.8), at(7.6, -20.2), at(11.8, -17.8), at(12.2, -2.6)], 0.95, WOODL, R, { bristles: 2, dry: 0.25, taper: 0 });
  }
  for (const [x, y] of [[3.8, -17.4], [11.4, -17.4], [3.8, -2.4], [11.6, -2.4]]) dab(c, x + dx, y + dy, 0.55, C.ink, R);
  const [bx, by] = at(7.7, -10.6);
  dab(c, bx, by, 2.1, C.ink, R); dab(c, bx, by, 1.5, burnt ? C.charL : IRON, R); dab(c, bx - 0.5, by - 0.5, 0.5, '#fffdf2', R);
  if (planted) for (const x of [4.6, 11]) brush(c, [at(x, -0.6), at(x + 0.3, 1.6)], 0.9, C.ink, R, { bristles: 2, dry: 0, taper: 0.5 });   // spikes in the ground
}
/** Halberd from butt b to top t: pole, spike beyond t, axe blade on the forward side, hook behind. */
function halberd(c, b, t, R, M, burnt, flipBlade) {
  const dx = t[0] - b[0], dy = t[1] - b[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  let nx = -uy, ny = ux; if (flipBlade) { nx = -nx; ny = -ny; }
  const at = (a, n) => [t[0] + ux * a + nx * n, t[1] + uy * a + ny * n];
  tube(c, [b, [(b[0] + t[0]) / 2 + nx * 0.2, (b[1] + t[1]) / 2 + ny * 0.2], t], 1.15, burnt ? C.char : WOODL, R, 0.55);
  const st = burnt ? C.charL : IRON;
  part(c, poly([at(-0.6, -1.2), at(6.4, 0), at(-0.6, 1.2)], R, 0.08), st, M, { lw: 0.9, sharp: true });            // spike
  part(c, poly([at(-1, 0.4), at(-0.2, 3.6), at(-2.4, 5.8), at(-5.6, 6), at(-7.8, 4.2), at(-7.4, 0.4)], R, 0.1), st, M, { lw: 1.1 });   // axe blade
  part(c, poly([at(-2.6, -0.4), at(-2.4, -4.4), at(-4.6, -0.4)], R, 0.08), st, M, { lw: 0.9, sharp: true });       // hook
}
/** Crossbow: stock along +x from (ox, oy), turned by ang. state: 'spanned' (bolt in), 'loose' (string snapped, no bolt),
 *  'half' (cranking). Prod (the bow) seen edge-on at the front, a stirrup loop at the nose. */
function crossbow(c, ox, oy, ang, state, R, M, burnt, col) {
  c.save(); c.translate(ox, oy); c.rotate(ang); c.scale(1.18, 1.18);
  const wd = burnt ? C.char : WOOD;
  if (state === 'spanned') {   // the bolt lies in its groove, head out past the prod
    brush(c, [[-2.4, -1.2], [9.2, -1.2]], 0.9, burnt ? C.charL : '#e2c48c', R, { bristles: 2, dry: 0, taper: 0 });
    part(c, poly([[9, -2.4], [11.6, -1.2], [9, 0]], R, 0.06), burnt ? C.charL : IRON, M, { lw: 0.7, sharp: true });
    if (!burnt) fill(c, poly([[-2.6, -1.4], [-0.6, -1.4], [-2.2, -3.4]], R, 0.05), col, R, { sharp: true, edge: 0, vary: 0.05 });
  }
  part(c, poly([[-7.4, -0.4], [-6.8, 2.4], [-2.6, 1.3], [7.2, 1.0], [7.4, -0.9], [-2.4, -0.9]], R, 0.15), wd, M, { lw: 1.1, ang: 0 });   // stock
  brush(c, [[-2.6, 1.2], [-3.4, 3.4]], 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });                            // trigger
  const tip = state === 'loose' ? 4.6 : state === 'half' ? 3.8 : 3.4;
  brush(c, [[tip, -5.8], [6.6, -2.6], [7, 0], [6.6, 2.6], [tip, 5.8]], 1.5, burnt ? C.charL : IROND, R, { bristles: 3, dry: 0.1, taper: 0 });   // prod
  const nut = state === 'loose' ? tip + 0.3 : state === 'half' ? 1.2 : -2.2;
  brush(c, [[tip, -5.8], [nut, 0], [tip, 5.8]], 0.42, C.ink, R, { bristles: 1, dry: 0, taper: 0 });                    // string
  outline(c, ring(8.6, 0, 1.3, 1.6, R, 0.05, 7), R, 0.7, { bristles: 2, jit: 0.1 });                                   // stirrup
  c.restore();
}
/** Clay pot of hot oil: terracotta ball, dark mouth, rope band; lit = a burning rag stuck in its mouth. */
function pot(c, x, y, r, R, M, burnt, lit) {
  part(c, ring(x, y, r, r * 0.95, R, 0.06, 9), burnt ? C.char : TERRA, M, { lw: 1.25 });
  dab(c, x, y - r * 0.82, r * 0.5, C.ink, R);
  if (!burnt) {
    brush(c, [[x - r * 0.95, y - r * 0.15], [x, y + r * 0.05], [x + r * 0.95, y - r * 0.15]], 0.6, ROPE, R, { bristles: 1, dry: 0.1, taper: 0 });
    dab(c, x - r * 0.45, y - r * 0.4, r * 0.22, '#f1a46c', R);
    if (lit) {   // the rag and its little flame
      brush(c, [[x + r * 0.1, y - r * 0.85], [x + r * 0.3, y - r * 1.5]], 0.9, LINEN, R, { bristles: 2, dry: 0, taper: 0.2 });
      const fx = x + r * 0.3, fy = y - r * 1.55;
      fill(c, poly([[fx - 1.4, fy], [fx - 0.6, fy - 2.6], [fx + 0.2, fy - 4.4], [fx + 0.8, fy - 2.2], [fx + 1.5, fy]], R, 0.15), C.fireO, R, { edge: 0, vary: 0.06 });
      fill(c, poly([[fx - 0.7, fy], [fx - 0.1, fy - 2.4], [fx + 0.7, fy]], R, 0.1), C.fireY, R, { edge: 0, vary: 0.05 });
    }
  }
}
function ladle(c, h, cup, R, M, burnt) {
  brush(c, [h, cup], 0.95, burnt ? C.charL : WOODL, R, { bristles: 2, dry: 0.05, taper: 0 });
  outline(c, [h, cup], R, 0.35, { bristles: 1, jit: 0.05, gap: true });
  part(c, ring(cup[0], cup[1], 2.1, 1.8, R, 0.08, 7), burnt ? C.charL : IROND, M, { lw: 1.0 });
  dab(c, cup[0], cup[1] - 0.5, 1.1, C.ink, R);
}
/** Wicker basket on the back, with the tops of its pots when full. */
function basket(c, M, full, burnt) {
  const R = M.R;
  if (full) for (const [x, y] of [[-11.4, -20.6], [-8, -21.4]]) { part(c, ring(x, y, 2.2, 2.1, R, 0.08, 7), burnt ? C.char : TERRA, M, { lw: 1 }); dab(c, x, y - 1.5, 1, C.ink, R); }
  part(c, poly([[-13.4, -19.6], [-4.4, -19.8], [-5, -9.4], [-12.6, -9.2]], R, 0.2), burnt ? C.charL : '#c99b58', M, { lw: 1.3, ang: 0 });
  if (!burnt) for (let i = 0; i < 3; i++) { const y = -17.4 + i * 3; brush(c, [[-12.8, y], [-4.8, y - 0.2]], 0.5, tone('#c99b58', -0.4), R, { bristles: 1, dry: 0.3, taper: 0 }); }
}

// ---------- the person factory
// cfg: own, poses, extra (pose names beyond the standard 4), box, legs { pose: 'lunge' | 'kneel' }, drop { pose: px },
// lean { pose: rad }, arm { pose: arm key } (default: the pose; walk0/walk1 -> 'walk' unless given), wdir { arm key: rad
// (the weapon's direction, for the swing between poses) }, atkKick, under(c, M, burnt), over(c, o, M, burnt, col),
// headBack(c, M, burnt, col), hat(c, M, burnt, col), headFront(c, M, burnt, col), face(c, M) (alive extras), arms(c, o, key, M,
// burnt, col, skin), backKey(pose) -> key | null, back(c, o, key, M, burnt, col), shield { planted(pose) }, keepShield.
function siegeMan(cfg) {
  const poses = cfg.poses, extra = cfg.extra || [], all = poses.concat(extra);
  const legOf = (p) => cfg.legs[p] || (p === 'walk0' || p === 'walk1' || p === 'fly' ? p : cfg.walkLegs && cfg.walkLegs[p] || 'aim');
  const armOf = (p) => (p === 'fly' ? 'fly' : cfg.arm[p] || p);
  const crouched = (p) => { const l = legOf(p); return l === 'lunge' || l === 'kneel'; };
  const parts = ['r:leg', 'r:body', 'r:head', 'r:headO'];
  const ck = new Set(); for (const p of all) if (crouched(p)) ck.add(legOf(p));
  for (const k of ck) parts.push(`r:${k}0`, `r:${k}1`);
  const aks = new Set(all.map(armOf)); for (const k of aks) parts.push('r:arm:' + k);
  const bks = new Set(); if (cfg.backKey) for (const p of all) { const k = cfg.backKey(p); if (k) bks.add(k); }
  for (const k of bks) parts.push('r:back:' + k);
  if (cfg.shield) parts.push('r:shield', 'r:shieldP');
  const dropOfKind = {}; for (const p of all) if (crouched(p)) dropOfKind[legOf(p)] = cfg.drop[p];
  const skinOf = (o, burnt) => (burnt ? C.charL : o.risen ? C.zskin : C.skin);
  const bodyLayer = (c, o, M, burnt, col) => {
    if (cfg.under) cfg.under(c, M, burnt);
    human(c, KIND, o.col, 'aim', M, o.dead, skinOf(o, burnt), { risen: o.risen, hatless: o.hatless, layer: 'body' });
    if (cfg.over) cfg.over(c, o, M, burnt, col);
  };
  const headLayer = (c, o, M, burnt, col, open) => {
    if (cfg.headBack && !o.hatless) cfg.headBack(c, M, burnt, col);
    human(c, KIND, o.col, open ? 'fly' : 'aim', M, o.dead, skinOf(o, burnt), { risen: o.risen, hatless: o.hatless, layer: 'head' });
    if (!o.hatless) { cfg.hat(c, M, burnt, col); if (cfg.headFront) cfg.headFront(c, M, burnt, col); }
    if (cfg.face && !o.dead && !o.risen) cfg.face(c, M);
  };
  const armsLayer = (c, o, key, M, burnt, col) => {
    if (key === 'fly' || o.risen) { human(c, KIND, o.col, key === 'fly' ? 'fly' : 'aim', M, o.dead, skinOf(o, burnt), { risen: o.risen, layer: 'arms' }); return; }
    cfg.arms(c, o, key, M, burnt, col, skinOf(o, burnt));
  };
  const hasShield = (o) => cfg.shield && (!o.risen || cfg.keepShield);
  return {
    box: cfg.box, scale: cfg.scale || 1.04, own: cfg.own, poses, extra: extra.concat(parts),
    pick: cfg.pick,
    rig: {
      driver: 'siegeman',
      joints: { hip: [0, HIP], neck: [0.5, -17.6], shoulder: [1, -16.4], legX: 1.8, grip: [7.6, -12], plant: [7.6 + SHIELD_P[0], 0] },
      parts(pose, zom) {
        const lg = legOf(pose), cr = lg === 'lunge' || lg === 'kneel', ak = armOf(pose);
        const bk = cfg.backKey && !zom ? cfg.backKey(pose) : null;
        const sh = cfg.shield && (!zom || cfg.keepShield) ? (cfg.shield.planted(pose) ? 'r:shieldP' : 'r:shield') : null;
        return {
          legF: cr ? `r:${lg}0` : 'r:leg', legN: cr ? `r:${lg}1` : 'r:leg', crouch: cr ? dropOfKind[lg] : 0,
          body: 'r:body', head: pose === 'fly' ? 'r:headO' : 'r:head', arm: 'r:arm:' + ak, back: bk ? 'r:back:' + bk : null,
          shield: sh, plant: sh === 'r:shieldP' ? 1 : 0, lean: cfg.lean[pose] || 0, drop: cfg.drop[pose] || 0,
          wdir: zom || ak === 'fly' ? 0 : cfg.wdir[ak] ?? 0, kick: cfg.atkKick ?? -9, code: POSE_CODE(pose),
        };
      },
    },
    paint(c, o) {
      const p = o.pose, M = o.M, R = o.R, burnt = o.dead === 'burnt', col = burnt ? C.char : o.col;
      if (isPart(p)) {
        if (p === 'r:leg') { humanLeg(c, KIND, M, burnt); return; }
        if (p === 'r:body') { bodyLayer(c, o, M, burnt, col); return; }
        if (p === 'r:head' || p === 'r:headO') { headLayer(c, o, M, burnt, col, p === 'r:headO'); return; }
        if (p.startsWith('r:arm:')) { armsLayer(c, o, p.slice(6), M, burnt, col); return; }
        if (p.startsWith('r:back:')) { cfg.back(c, o, p.slice(7), M, burnt, col); return; }
        if (p === 'r:shield' || p === 'r:shieldP') { towerShield(c, M, col, burnt, p === 'r:shieldP'); return; }
        const k = p.slice(2, 7); if (CROUCH[k]) crouchLeg(c, k, +p.slice(7), dropOfKind[k], R);
        return;
      }
      const pose = o.dead ? poses[0] : p, lg = legOf(pose), drop = cfg.drop[pose] || 0, lean = cfg.lean[pose] || 0;
      const bk = cfg.backKey && !o.risen ? cfg.backKey(pose) : null;
      if (bk) { c.save(); upper(c, drop, lean); cfg.back(c, o, bk, M, burnt, col); c.restore(); }
      if (CROUCH[lg]) { crouchLeg(c, lg, 0, drop, R); crouchLeg(c, lg, 1, drop, R); }
      else for (const l of LEGS[lg] || LEGS.aim) brush(c, l, 1.9, C.ink, R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 });
      c.save(); upper(c, drop, lean);
      bodyLayer(c, o, M, burnt, col);
      headLayer(c, o, M, burnt, col, pose === 'fly');
      armsLayer(c, o, armOf(pose), M, burnt, col);
      const planted = hasShield(o) && cfg.shield.planted(pose);
      if (hasShield(o) && !planted) towerShield(c, M, col, burnt, false);
      c.restore();
      if (planted) towerShield(c, M, col, burnt, true);
    },
  };
}
const ACT = (u) => (u.b ? u.b.act | 0 : 0);
const flown = (u) => (u.z || 0) > 1;

// ---------- SHIELDWALL: kettle hat, tower shield in the team colour, short sword
const shieldwall = siegeMan({
  own: OWN, box: [50, 50, 22, 44], poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['brace', 'fly'],
  legs: { brace: 'lunge' }, drop: { brace: 3 }, lean: { brace: 0.13, atk: 0.07 },
  arm: { walk0: 'idle', walk1: 'idle' }, wdir: { idle: -1.25, atk: 0, brace: -0.28 }, atkKick: -6,
  under: mail, over: (c, o, M, burnt) => { belt(c, M, burnt); }, hat: kettle,
  shield: { planted: (p) => p === 'brace' }, keepShield: true,
  arms(c, o, key, M, burnt, col, skin) {
    const R = M.R;
    if (key === 'atk') {   // jab over the shield's top
      armL(c, R, [[1.8, -17.2], [5, -20.8], [8.2, -23.4]]);
      sword(c, [7.2, -22.8], [9.4, -23.6], [22.4, -24.8], R, burnt);
      handAt(c, R, 8.2, -23.3, skin);
      streaks(c, 11.6, -27.6, 2, 6, R, 6.2);
    } else if (key === 'brace') {   // sword resting on the planted shield's top, pointing out
      armL(c, R, [[1.8, -17], [4.4, -21.2], [6.6, -24.2]]);
      sword(c, [5.8, -23.8], [7.8, -24.8], [19.8, -28], R, burnt);
      handAt(c, R, 6.6, -24.2, skin);
    } else {               // sword held up behind the shield
      armL(c, R, [[1.6, -16.8], [3.6, -19.4], [5.4, -20.8]]);
      sword(c, [4.8, -19.6], [5.8, -21.8], [8.6, -33.8], R, burnt);
      handAt(c, R, 5.4, -20.8, skin);
    }
  },
  pick(u) { if (flown(u)) return 'fly'; const a = ACT(u); return a === 1 ? 'brace' : u.attack > 0.35 ? 'atk' : null; },
});

// ---------- HALBERD: crested morion, long halberd (reach r+30)
const halberdier = siegeMan({
  own: OWN, box: [80, 60, 30, 52], poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['set', 'fly'],
  legs: { set: 'lunge' }, drop: { set: 2.4 }, lean: { set: 0.1, atk: 0.12 },
  arm: { walk0: 'walk', walk1: 'walk' }, wdir: { idle: -1.57, walk: -1.44, atk: 0.5, set: -0.57 }, atkKick: -7,
  under: mail, over: (c, o, M, burnt) => { belt(c, M, burnt); chevron(c, M, burnt); }, hat: morion,
  arms(c, o, key, M, burnt, col, skin) {
    const R = M.R;
    if (key === 'atk') {   // overhead chop, brought down in front
      swoosh(c, [[-4, -41], [8, -42], [22, -33], [31, -16]], R, 1.2);
      armL(c, R, [[0.8, -17.6], [3.2, -19.4], [4, -19.6]]);
      halberd(c, [-5.6, -23.6], [27.6, -6.4], R, M, burnt);
      armL(c, R, [[2.2, -16.6], [5.6, -17.4], [8.6, -16.4]]);
      handAt(c, R, 4, -19.4, skin); handAt(c, R, 8.6, -16.4, skin);
    } else if (key === 'set') {   // levelled at chest height of a rider, butt planted behind
      armL(c, R, [[0.6, -17.4], [4.4, -15.2], [8.6, -13.8]]);
      halberd(c, [-11.4, -1.4], [25, -24.2], R, M, burnt, true);
      armL(c, R, [[2.2, -16.4], [3.4, -12.6], [4, -10.8]]);
      handAt(c, R, 8.6, -13.8, skin); handAt(c, R, 4, -10.8, skin);
    } else {               // upright in front (walking: carried, slanting forward a little)
      const walk = key === 'walk', b = walk ? [5.2, -2.6] : [8, 0.8], t = walk ? [10.4, -40.4] : [8.6, -38.4];
      armL(c, R, [[0.6, -17.6], [4.4, -19.8], [walk ? 8.4 : 8.3, -20]]);
      halberd(c, b, t, R, M, burnt);
      armL(c, R, [[2.2, -16.6], [5.4, -15.2], [walk ? 7.4 : 8.2, -14.8]]);
      handAt(c, R, walk ? 8.3 : 8.3, -20, skin); handAt(c, R, walk ? 7.5 : 8.2, -14.8, skin);
    }
  },
  pick(u) { if (flown(u)) return 'fly'; const a = ACT(u); return a === 1 ? 'set' : u.attack > 0.35 ? 'atk' : null; },
});

// ---------- CROSSBOW: brown hood, crossbow (bolt fletching in the team colour)
const crossbowman = siegeMan({
  own: OWN, box: [54, 50, 22, 44], poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['aim', 'crank', 'fly'],
  legs: { crank: 'kneel' }, drop: { crank: 4.4 }, lean: { crank: 0.14, aim: 0.03 },
  arm: { walk0: 'idle', walk1: 'idle' }, wdir: { idle: -0.27, aim: 0, atk: -0.2, crank: 1.5 }, atkKick: -4,
  under: mail, over: (c, o, M, burnt) => { belt(c, M, burnt); }, headBack: hoodBack, hat: () => {}, headFront: hoodFront,
  arms(c, o, key, M, burnt, col, skin) {
    const R = M.R;
    if (key === 'aim' || key === 'atk') {   // at the shoulder, cheek on the stock; atk = just shot: kicked up, string snapped
      const up = key === 'atk' ? -0.18 : 0;
      c.save(); c.translate(1, -18); c.rotate(up); c.translate(-1, 18);
      armL(c, R, [[0.6, -17.6], [4.4, -15.2], [9.4, -17.4]]);
      crossbow(c, 7.4, -18, 0, key === 'atk' ? 'loose' : 'spanned', R, M, burnt, col);
      armL(c, R, [[2.2, -16.6], [3.6, -16.8]]);
      handAt(c, R, 9.4, -17.4, skin); handAt(c, R, 3.8, -16.8, skin);
      if (key === 'atk') for (const dy of [-2.4, 1.8]) brush(c, [[20.6, -18 + dy], [26, -18.2 + dy]], 0.9, SWOOSH, R, { bristles: 2, dry: 0.5, taper: 0.8 });
      c.restore();
    } else if (key === 'crank') {   // nose down, foot in the stirrup, winding the windlass
      armL(c, R, [[0.6, -17.4], [4.2, -20.4], [6, -21.6]]);
      crossbow(c, 8.4, -14, Math.PI / 2, 'half', R, M, burnt, col);
      const k0 = [6, -21.4], k1 = [11.2, -21.6];
      brush(c, [[8.4, -21.4], k0], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); brush(c, [[8.4, -21.4], k1], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
      dab(c, 8.4, -21.6, 1.3, burnt ? C.charL : IROND, R);
      armL(c, R, [[2.2, -16.4], [7.6, -18.6], [11.2, -21.4]]);
      handAt(c, R, k0[0], k0[1], skin); handAt(c, R, k1[0], k1[1], skin);
      for (const a of [0.6, 2.4]) brush(c, [[8.4 + Math.cos(a) * 6, -23 - Math.sin(a) * 3], [8.4 + Math.cos(a + 0.9) * 6, -23 - Math.sin(a + 0.9) * 3]], 0.5, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.6 });
    } else {               // held at the hip, nose up a little, loaded
      armL(c, R, [[0.6, -17.4], [-0.8, -14.2], [1.8, -12.6]]);
      crossbow(c, 6.4, -14, -0.27, 'spanned', R, M, burnt, col);
      armL(c, R, [[2.2, -16.4], [5.2, -15.6], [7.4, -15]]);
      handAt(c, R, 7.4, -15, skin); handAt(c, R, 1.8, -12.6, skin);
    }
  },
  pick(u) { if (flown(u)) return 'fly'; const a = ACT(u); return u.attack > 0.35 ? 'atk' : a === 2 ? 'crank' : a === 1 ? 'aim' : null; },
});

// ---------- OILPOT: leather cap + apron, a lit pot of hot oil, a basket of pots on the back; then a ladle
const oilman = siegeMan({
  own: OWN, box: [54, 50, 24, 44], poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['throw', 'empty', 'ewalk0', 'ewalk1', 'eatk', 'fly'],
  legs: {}, walkLegs: { ewalk0: 'walk0', ewalk1: 'walk1' }, drop: {}, lean: { throw: 0.12, atk: 0.1, eatk: 0.1 },
  arm: { walk0: 'idle', walk1: 'idle', ewalk0: 'empty', ewalk1: 'empty', eatk: 'atk' }, wdir: { idle: -0.4, throw: -0.7, atk: 0.65, empty: -1.3 }, atkKick: -7,
  over(c, o, M, burnt) {   // leather apron over the tabard
    const R = M.R;
    part(c, poly([[-2.4, -9.8], [5.4, -10.2], [6.4, -3.8], [-2.6, -3.6]], R, 0.2), BC(burnt, LEATHER), M, { lw: 1.2 });
    belt(c, M, burnt);
  },
  hat: oilCap,
  face(c, M) { dab(c, 4.2, -19.8, 0.8, C.charL, M.R); dab(c, -1.8, -20.6, 0.6, C.charL, M.R); },   // soot
  backKey: (p) => (p === 'fly' ? null : p === 'empty' || p === 'ewalk0' || p === 'ewalk1' || p === 'eatk' ? 'empty' : 'full'),
  back(c, o, key, M, burnt) { basket(c, M, key === 'full', burnt); },
  arms(c, o, key, M, burnt, col, skin) {
    const R = M.R;
    if (key === 'throw') {   // flung forward, empty-handed
      swoosh(c, [[-11.6, -27.4], [-7.6, -34.4], [-0.6, -37.6], [7, -35]], R, 0.9);
      armL(c, R, [[1.2, -17.2], [6, -19.8], [11, -21.6]]); handAt(c, R, 11.4, -21.7, skin);
      armL(c, R, [[-1.4, -15.6], [-4.6, -13.4], [-6.6, -11]]); handAt(c, R, -6.8, -10.8, skin);
    } else if (key === 'atk') {   // ladle swung down in front
      swoosh(c, [[2, -36], [12, -34], [19, -25], [21, -15]], R, 1);
      armL(c, R, [[1.4, -17.4], [5.4, -18.6], [8.8, -17.6]]);
      ladle(c, [8.4, -17.8], [17.6, -10.8], R, M, burnt); handAt(c, R, 8.8, -17.6, skin);
      armL(c, R, [[-1.4, -15.4], [-3.6, -11.4]]); handAt(c, R, -3.8, -11, skin);
    } else if (key === 'empty') {   // out of pots: the ladle held up like a club
      armL(c, R, [[1.6, -16.6], [4.2, -15.4], [6.4, -15.2]]);
      ladle(c, [6.2, -14.8], [9.6, -28.6], R, M, burnt); handAt(c, R, 6.6, -15.4, skin);
      armL(c, R, [[-1.4, -15.4], [-3.6, -11.4]]); handAt(c, R, -3.8, -11, skin);
    } else {               // the lit pot held out in front in both hands
      armL(c, R, [[0.4, -17.2], [3.2, -14.6], [4.4, -12.4]]);
      pot(c, 8, -12.2, 3.6, R, M, burnt, true);
      armL(c, R, [[2.2, -16.4], [7.4, -15.6], [11.2, -12.8]]);
      handAt(c, R, 4.5, -12.2, skin); handAt(c, R, 11.4, -12.6, skin);
    }
  },
  pick(u, info) {
    if (flown(u)) return 'fly';
    const a = ACT(u);
    if (a === 1) return 'throw';
    if (a === 2 || (u.b && u.b.pots === 0)) return u.attack > 0.35 ? 'eatk' : info.moving ? (info.walkFrame ? 'ewalk1' : 'ewalk0') : 'empty';
    return u.attack > 0.35 ? 'atk' : null;
  },
});

// ---------- SIEGECREW (spawned crew of the machines): white linen coif, tabard, a coil of rope on the back, short sword
const crew = siegeMan({
  own: OWN, box: [50, 50, 22, 44], poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['fly'],
  legs: {}, drop: {}, lean: { atk: 0.08 },
  arm: { walk0: 'idle', walk1: 'idle' }, wdir: { idle: -1.3, atk: 0.55 }, atkKick: -8,
  under: null, over: (c, o, M, burnt) => { belt(c, M, burnt); }, hat: coif,
  backKey: (p) => (p === 'fly' ? null : 'rope'),
  back(c, o, key, M, burnt) { coil(c, -6.6, -14.4, 3.6, M, burnt); dab(c, -6.6, -14.4, 1.3, C.ink, M.R); },
  arms(c, o, key, M, burnt, col, skin) {
    const R = M.R;
    if (key === 'atk') {
      swoosh(c, [[-1, -33.4], [6.4, -33], [13, -27.6], [16.4, -19.6]], R, 1);
      armL(c, R, [[1.4, -17.6], [5.6, -18.6], [8.4, -18.4]]);
      sword(c, [7.4, -17.6], [9.2, -18.6], [17.4, -13.6], R, burnt);
      handAt(c, R, 8.6, -18.4, skin);
      armL(c, R, [[-1.4, -15.4], [-3.6, -11.4]]); handAt(c, R, -3.8, -11, skin);
    } else {
      armL(c, R, [[1.8, -16.8], [5, -16.2], [7.8, -15.6]]);
      sword(c, [7.4, -14.6], [8.2, -17], [11, -26.6], R, burnt);
      handAt(c, R, 7.8, -15.6, skin);
      armL(c, R, [[-1.2, -16.8], [-3.2, -13], [-1.6, -10.4]]); handAt(c, R, -1.4, -10.2, skin);
    }
  },
  pick(u) { if (flown(u)) return 'fly'; return u.attack > 0.35 ? 'atk' : null; },
});

// ================================================================ machines
// Each machine: G = geometry (sprite px), FRAME / bits painters, whole(c, o) composes them like its driver does.
// Wheel parts are painted at hub 0 and put at both hubs; far wheels are painted inside the frame (they peek out behind).
const machinePart = (o) => o.pose.slice(2);
const rollAng = (pose) => (pose === 'roll1' ? Math.PI / 4 : 0);
/** Paint a wheel at hub h with turn ang (whole sprites; the rig puts 'r:wheel' itself). */
function wheels(c, G, ang, M, burnt) { for (const h of G.hub) wheel(c, h[0], h[1], G.wr, ang, M, burnt, false); }
function farWheels(c, G, M, burnt) { for (const h of G.hub) wheel(c, h[0] + G.far[0], h[1] + G.far[1], G.wr * 0.96, 0.4, M, burnt, true); }
/** Wreck: a dead machine's whole frame = its parts where WRECK (rig-siege.js) settles them, plus splinters. */
function wreckWhole(c, o, paintPart) {
  eachWreck(o.type, (name, m) => { c.save(); c.transform(m[0], m[1], m[2], m[3], m[4], m[5]); paintPart(c, o, name); c.restore(); });
  splinters(c, o.M, o.dead === 'burnt', WRECK[o.type].splinters);
}
function splinters(c, M, burnt, list) {
  const R = M.R;
  for (const [x, y, a, l] of list) { const ex = Math.cos(a) * l / 2, ey = Math.sin(a) * l / 2; beam(c, x - ex, y - ey, x + ex, y + ey, 1.6, burnt ? C.char : WOODL, M, { lw: 0.9, grain: false }); }
  if (!burnt) for (let i = 0; i < 3; i++) dab(c, list.length ? list[i % list.length][0] + (R() - 0.5) * 6 : 0, -0.6, 0.9, C.smoke, R);
}

// ---------- RAM: a covered ram on four wheels; the log (iron ram's head) hangs on two ropes under the roof
function ramPart(c, o, name, ang = 0) {
  const G = G_RAM, M = o.M, R = M.R, burnt = o.dead === 'burnt', col = burnt ? C.char : o.col;
  if (name === 'wheel') { wheel(c, G.hub[0][0], G.hub[0][1], G.wr, ang, M, burnt, false); return; }
  if (name === 'frame') {
    farWheels(c, G, M, burnt);
    for (const x of [-21, -3, 15]) beam(c, x, -13, x + 0.4, -31.6, 2.6, BC(burnt, WOOD, 1), M, { lw: 1.1 });                 // posts
    beam(c, -27.6, -12.6, 25.6, -12.6, 4.4, BC(burnt, WOOD, 1), M, { nails: true });                                      // chassis
    pennant(c, -21, -40.8, 11, 9, col, M, burnt);
    const roof = poly(sub([[-32.6, -29.6], [-26.6, -40.6], [24.6, -40.8], [30.6, -29.6]], 3.2), R, 0.22);
    part(c, roof, BC(burnt, '#a06a3a', 1), M, { lw: 1.8, ang: Math.PI / 2, sharp: true });
    if (!burnt) for (let x = -24; x <= 22; x += 5.6) brush(c, [[x, -39.6], [x + (x < 0 ? -1.4 : 1.4) * 0.5, -31.6]], 0.6, tone('#a06a3a', -0.35), R, { bristles: 1, dry: 0.35, taper: 0 });   // planks
    if (!burnt) for (const [x, y, r] of [[-14, -35.6, 2.6], [9, -36.2, 2.2]]) { fill(c, ring(x, y, r * 1.4, r, R, 0.12, 7), '#c99459', R, { edge: 0, vary: 0.06 }); for (let i = -1; i <= 1; i++) dab(c, x + i * r * 0.9, y - r - 0.2, 0.32, C.ink, R); }   // hide patches, stitched on
    beam(c, -27.4, -40.8, 25.4, -40.8, 2.2, BC(burnt, WOODD, 1), M, { lw: 1.1, grain: false });                          // ridge
    const val = poly(sub([[-32.6, -31.4], [30.6, -31.4], [29.8, -26.2], [-31.6, -26.2]], 3), R, 0.15);                             // team valance
    part(c, val, col, M, { lw: 1.4, ang: 0, sharp: true });
    if (!burnt) for (let x = -24; x <= 24; x += 8) fill(c, poly([[x - 1.6, -26.4], [x + 1.6, -26.4], [x, -24]], R, 0.1), col, R, { sharp: true, edge: 0 });   // bunting points
    if (o.dead && !burnt) for (const [x0, y0] of [[-6, -39], [14, -36]]) brush(c, [[x0, y0], [x0 + 1.6, y0 + 2.2], [x0 - 0.6, y0 + 4], [x0 + 1, y0 + 6.4]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });   // cracks
    return;
  }
  if (name === 'ropes') { for (const x of G.ropeX) rope(c, [[x, G.ropeTop], [x + 0.25, G.ropeTop + G.L * 0.5], [x, G.ropeTop + G.L + 0.6]], 0.95, R, burnt); return; }
  if (name === 'log') {
    const y = G.ropeTop + G.L + 2.8;
    part(c, poly([[-25.6, y - 2.8], [21, y - 3.1], [22, y + 2.9], [-25.4, y + 2.8], [-26.6, y]], R, 0.2), BC(burnt, WOOD, 1), M, { lw: 1.4, ang: 0 });
    if (!burnt) for (const dy of [-1.2, 1.2]) brush(c, [[-22, y + dy], [-6, y + dy * 0.6], [16, y + dy]], 0.45, tone(WOOD, -0.35), R, { bristles: 1, dry: 0.5, taper: 0.3 });
    outline(c, ring(-25.4, y, 1.4, 2.4, R, 0.08, 7), R, 0.6, { bristles: 1 });                                            // end rings
    for (const x of G.ropeX) beam(c, x - 1, y - 3.4, x - 1, y + 3.4, 2, BC(burnt, IROND), M, { lw: 0.9, grain: false });  // iron bands
    // the iron ram's head: snout, curly horn, eye
    part(c, poly([[20.4, y - 3.8], [26, y - 4.6], [30.6, y - 2.6], [31.8, y + 0.2], [30, y + 2.8], [25, y + 3.6], [20.4, y + 3.4]], R, 0.15), BC(burnt, IRON, 1), M, { lw: 1.4 });
    const hc = [24.2, y - 0.6], sp = []; for (let a = -2.2; a < 3.6; a += 0.45) { const r = 3.4 - (a + 2.2) * 0.42; sp.push([hc[0] + Math.cos(a) * r, hc[1] + Math.sin(a) * r * 0.9]); }
    brush(c, sp, 1.3, burnt ? C.ink : IROND, R, { bristles: 2, dry: 0, taper: 0.4 });
    brush(c, sp, 0.45, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.5 });
    if (!o.dead) { dab(c, 28.4, y - 1.6, 0.9, '#fffdf2', R); dab(c, 28.6, y - 1.5, 0.45, C.ink, R); }
    else for (const s of [-1, 1]) brush(c, [[27.6, y - 2.4 * s - 0.2 + (s > 0 ? -0.4 : 0)], [29.4, y - 0.2 * s - 0.8]], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  }
}
function ramWhole(c, o) {
  if (o.dead) { wreckWhole(c, o, ramPart); return; }
  const G = G_RAM, s = G.swing[o.pose] || 0, k = Math.sin(s), cs = Math.cos(s);
  ramPart(c, o, 'frame');
  c.save(); c.transform(1, 0, k, cs, -k * G.ropeTop, G.ropeTop * (1 - cs)); ramPart(c, o, 'ropes'); c.restore();
  c.save(); c.translate(G.L * k, -G.L * (1 - cs)); ramPart(c, o, 'log'); c.restore();
  if (o.pose === 'thrust') streaks(c, 41, -20.6, 3, 5, o.R, 2.6);
  wheels(c, G, rollAng(o.pose), o.M, false);
}

// ---------- CATAPULT: a wheeled frame, A-frame with a padded crossbar, a throwing arm on a twisted-rope torsion bundle
function catTip() { const G = G_CAT; return [G.pivot[0] + Math.cos(G.cock) * G.arm, G.pivot[1] + Math.sin(G.cock) * G.arm]; }
function catPart(c, o, name, ang = 0) {
  const G = G_CAT, M = o.M, R = M.R, burnt = o.dead === 'burnt', col = burnt ? C.char : o.col;
  if (name === 'wheel') { wheel(c, G.hub[0][0], G.hub[0][1], G.wr, ang, M, burnt, false); return; }
  if (name === 'frame') {
    farWheels(c, G, M, burnt);
    beam(c, 1.6, -13, 7.4, -33.6, 2.6, BC(burnt, WOOD, 1), M, { lw: 1.1 });
    beam(c, 13.8, -13, 8.6, -33.6, 2.6, BC(burnt, WOOD, 1), M, { lw: 1.1 });
    pennant(c, 8.2, -36.6, 10, 8.6, col, M, burnt);
    part(c, poly(sub([[3.6, -37.2], [12.4, -37.4], [12.6, -31.4], [3.4, -31.2]], 2.4), R, 0.15), BC(burnt, WOODD, 1), M, { lw: 1.3, sharp: true });   // crossbar
    part(c, ring(3.2, -34.2, 1.8, 3.2, R, 0.08, 7), BC(burnt, PAD), M, { lw: 1.0 });                                      // padding
    part(c, ring(8.2, -22.4, 3.3, 3.8, R, 0.06, 8), col, M, { lw: 1.3 });                                                 // team shield
    if (!burnt) dab(c, 8.2, -22.6, 0.7, '#fbf3dc', R);
    beam(c, -20.6, -13, -20.4, -20.2, 2, BC(burnt, WOOD, 1), M, { lw: 1 });                                               // windlass post
    coil(c, -20.4, -20.6, 2.3, M, burnt);
    brush(c, [[-20.4, -20.6], [-23.6, -24.2]], 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); dab(c, -23.8, -24.4, 0.8, C.ink, R);
    beam(c, -25.6, -12.4, 23.8, -12.6, 4.4, BC(burnt, WOOD, 1), M, { nails: true });                                      // base
    coil(c, G.pivot[0], G.pivot[1], 3.7, M, burnt);                                                                        // torsion bundle
    if (o.dead && !burnt) brush(c, [[-2, -14.4], [0.4, -12], [-1, -10.6]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });
    return;
  }
  if (name === 'arm') {   // the arm at its cocked rest, the cup at its tip opening up
    const [tx, ty] = catTip();
    beam(c, G.pivot[0], G.pivot[1], tx + 1.2, ty + 0.3, 3, BC(burnt, WOODL, 1), M, { lw: 1.3 });
    part(c, poly([[tx - 4.6, ty - 3], [tx + 3.8, ty - 2.8], [tx + 2.8, ty + 1.6], [tx - 3.4, ty + 1.8]], R, 0.15), BC(burnt, WOOD, 1), M, { lw: 1.4 });
    dab(c, tx - 0.4, ty - 2.8, 2.9, C.ink, R);
    dab(c, G.pivot[0], G.pivot[1], 1.2, C.ink, R);
    return;
  }
  if (name === 'stone') { const [tx, ty] = catTip(); boulder(c, tx - 0.3, ty - 5.8, 4.2, R, M, burnt); return; }
  if (name === 'swoosh') {   // the arm's path, painted behind the frame on a fire
    const P = []; for (let a = G.cock + 0.25; a < G.cock + G.fire - 0.1; a += 0.22) P.push([G.pivot[0] + Math.cos(a) * (G.arm + 2), G.pivot[1] + Math.sin(a) * (G.arm + 2)]);
    swoosh(c, P, R, 1.4);
  }
}
function catWhole(c, o) {
  if (o.dead) { wreckWhole(c, o, catPart); return; }
  const G = G_CAT, fire = o.pose === 'fire';
  if (fire) catPart(c, o, 'swoosh');
  catPart(c, o, 'frame');
  c.save();
  if (fire) { c.translate(G.pivot[0], G.pivot[1]); c.rotate(G.fire); c.translate(-G.pivot[0], -G.pivot[1]); }
  catPart(c, o, 'arm');
  if (o.pose === 'loaded') catPart(c, o, 'stone');
  c.restore();
  wheels(c, G, rollAng(o.pose), o.M, false);
}
function boulder(c, x, y, r, R, M, burnt) {
  part(c, ring(x, y, r, r * 0.92, R, 0.12, 8), burnt ? C.char : '#8a8780', M, { lw: 1.3 });
  if (!burnt) { dab(c, x + r * 0.3, y + r * 0.25, r * 0.28, '#6e6b65', R); dab(c, x - r * 0.4, y + r * 0.1, r * 0.18, '#6e6b65', R); dab(c, x - r * 0.3, y - r * 0.4, r * 0.24, '#b4b1aa', R); }
}

// ---------- BALLISTA: a giant crossbow on a two-wheeled cart, torsion coils at the bow, a big bolt in the groove
function balPart(c, o, name, ang = 0) {
  const G = G_BAL, M = o.M, R = M.R, burnt = o.dead === 'burnt', col = burnt ? C.char : o.col;
  if (name === 'wheel') { wheel(c, G.hub[0][0], G.hub[0][1], G.wr, ang, M, burnt, false); return; }
  if (name === 'frame') {
    farWheels(c, G, M, burnt);
    beam(c, -5.6, -12, -1.4, -21.4, 2.3, BC(burnt, WOOD, 1), M, { lw: 1 });
    beam(c, 3.6, -12, -0.6, -21.4, 2.3, BC(burnt, WOOD, 1), M, { lw: 1 });
    beam(c, -17.4, -11.4, 16.4, -11.6, 3.8, BC(burnt, WOOD, 1), M, { nails: true });
    part(c, ring(5.4, -15.8, 2.7, 3.1, R, 0.06, 8), col, M, { lw: 1.2 });                                                  // team shield
    if (!burnt) dab(c, 5.4, -16, 0.6, '#fbf3dc', R);
    dab(c, G.pivot[0], G.pivot[1], 1.5, C.ink, R);
    return;
  }
  if (name.startsWith('stock')) {   // 'stock' loaded + spanned, 'stockF' just fired, 'stockE' empty (reloading)
    const st = name === 'stock' ? 'spanned' : 'loose';
    beam(c, -17.4, -22.4, 15.6, -22.6, 3.2, BC(burnt, WOOD, 1), M, { nails: true });
    coil(c, -14.6, -22.6, 2.1, M, burnt);                                                                                  // winch
    brush(c, [[-14.6, -22.6], [-17.2, -26.6]], 0.8, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); dab(c, -17.4, -26.8, 0.8, C.ink, R);
    const sp = st === 'spanned', bx = 12.4, bt = sp ? 6.6 : 11.4, y0 = -22.6;   // the bow, side-on: bent back when spanned
    const bow = [[bt, y0 - 15], [bx + 0.6, y0 - 8.6], [bx + 2.2, y0], [bx + 0.6, y0 + 8.6], [bt, y0 + 15]];
    tube(c, bow, 2.2, burnt ? C.charL : WOODD, R, 0.65);
    for (const s2 of [-1, 1]) coil(c, bx + 1.4, y0 + s2 * 5, 2.3, M, burnt);
    brush(c, [[bt, y0 - 15], [sp ? -8.8 : bt + 0.6, y0], [bt, y0 + 15]], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0 });   // string
    if (st === 'spanned') bigBolt(c, -9.2, -25.6, 18.6, R, M, burnt, col);
    if (name === 'stockF') { streaks(c, 21, -28.4, 3, 7, R, 2.8); for (const s2 of [-1, 1]) brush(c, [[bt + 2, y0 + s2 * 15.6], [bt + 4.2, y0 + s2 * 17]], 0.5, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.6 }); }
  }
}
/** The ballista's bolt: from tail x0 to head x1 at y (fletching in col). */
function bigBolt(c, x0, y, x1, R, M, burnt, col, only) {
  if (only !== 'head' && !burnt) for (const s of [-1, 1]) fill(c, poly([[x0 - 0.2, y], [x0 + 4.6, y], [x0 + 0.4, y + s * 2.8]], R, 0.08), col, R, { sharp: true, edge: 0, vary: 0.05 });
  tube(c, [[x0, y], [x1, y]], 1.5, burnt ? C.charL : '#e2c48c', R, 0.55);
  if (only !== 'tail') part(c, poly([[x1 - 0.4, y - 2.4], [x1 + 6.4, y], [x1 - 0.4, y + 2.4]], R, 0.08), burnt ? C.charL : IRON, M, { lw: 0.9, sharp: true });
}
/** Place a projectile bit with its own x / y scale (a stretched shaft): fx.js PROJ api (ctx, S) + the bit's atlas rect. */
function putXY(api, spr, x, y, sx, sy, ang) {
  if (!spr || !api.ctx) return;
  const m = api.S / spr.k, cs = Math.cos(ang), sn = Math.sin(ang);
  api.ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * api.S, y * api.S);
  api.ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
const BAL_STOCK = { idle: 'stock', roll0: 'stock', roll1: 'stock', aim: 'stock', fire: 'stockF', empty: 'stockE' };
const BAL_PITCH = { aim: -0.07, fire: -0.07 };
function balWhole(c, o) {
  if (o.dead) { wreckWhole(c, o, balPart); return; }
  const G = G_BAL, pt = BAL_PITCH[o.pose] || 0;
  balPart(c, o, 'frame');
  c.save(); if (pt) { c.translate(G.pivot[0], G.pivot[1]); c.rotate(pt); c.translate(-G.pivot[0], -G.pivot[1]); }
  balPart(c, o, BAL_STOCK[o.pose] || 'stock');
  c.restore();
  wheels(c, G, rollAng(o.pose), o.M, false);
}

// ---------- SIEGE TOWER: a tall plank tower on four wheels, a team banner, a drawbridge hinged at the top floor, a flag
function towPart(c, o, name, ang = 0) {
  const G = G_TOW, M = o.M, R = M.R, burnt = o.dead === 'burnt', col = burnt ? C.char : o.col;
  if (name === 'wheel') { wheel(c, G.hub[0][0], G.hub[0][1], G.wr, ang, M, burnt, false); return; }
  if (name === 'frame') {
    farWheels(c, G, M, burnt);
    const body = poly(sub([[-18.4, -11], [-15, -82.6], [15, -82.6], [18.4, -11]], 3.2), R, 0.22);
    part(c, body, BC(burnt, WOODL, 1), M, { lw: 2, ang: Math.PI / 2, sp: 1, sharp: true });
    const xAt = (s, y) => s * (18.4 - (-11 - y) / 71.6 * 3.4);   // the tower's side at height y
    if (!burnt) for (const f of [-0.6, -0.2, 0.2, 0.6]) brush(c, [[f * 18, -12.4], [f * 15.4, -81.6]], 0.55, tone(WOODL, -0.38), R, { bristles: 1, dry: 0.35, taper: 0 });   // plank seams
    for (const y of [-34, -58]) beam(c, xAt(-1, y) - 0.6, y, xAt(1, y) + 0.6, y, 2.2, BC(burnt, WOOD, 1), M, { lw: 1.1, grain: false, nails: true });   // floors
    for (const [a, b] of [[[-15.6, -14.4], [15.4, -32]], [[15.6, -14.4], [-15.4, -32]]]) brush(c, [a, b], 1.4, BC(burnt, WOOD, 1), R, { bristles: 2, dry: 0.15, taper: 0 });   // cross brace
    for (const [x, y] of [[-8, -46], [8, -46], [-6, -70], [6, -70]]) { part(c, poly([[x - 0.8, y - 3], [x + 0.8, y - 3], [x + 0.8, y + 3], [x - 0.8, y + 3]], R, 0.1), C.ink, M, { lw: 0.6, sharp: true }); }   // arrow slits
    for (const x of [-12.2, -1.6, 9]) part(c, poly([[x, -82.2], [x + 4.6, -82.4], [x + 4.4, -88.4], [x - 0.2, -88.2]], R, 0.18), BC(burnt, WOOD, 1), M, { lw: 1.2, sharp: true });   // merlons
    beam(c, -15.6, -82.8, 15.6, -82.8, 2.2, BC(burnt, WOODD, 1), M, { lw: 1.2, grain: false });
    const ban = poly(sub([[-5.6, -56], [5.8, -56.2], [6, -38.4], [0.2, -41.8], [-5.8, -38.2]], 3), R, 0.15);                       // team banner
    part(c, ban, col, M, { lw: 1.5, ang: Math.PI / 2, sharp: true });
    if (!burnt) { const sw = poly([[0, -52.6], [3, -49.4], [0, -46.2], [-3, -49.4]], R, 0.1); fill(c, sw, '#fbf3dc', R, { sharp: true, edge: 0, vary: 0.05 }); }
    brush(c, [[-7.2, -56.4], [7.4, -56.6]], 1.1, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
    if (o.dead && !burnt) for (const [x0, y0] of [[-10, -70], [6, -24], [10, -60]]) brush(c, [[x0, y0], [x0 + 2, y0 + 3], [x0 - 0.6, y0 + 5.6], [x0 + 1.4, y0 + 8.6]], 0.65, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });
    return;
  }
  if (name === 'bridge') {   // raised: standing up from its hinge along the tower's front
    const [hx, hy] = G.hinge, L = G.bridgeL;
    beam(c, hx + 0.2, hy, hx - 0.2, hy - L, 3.4, BC(burnt, WOOD, 1), M, { lw: 1.3, nails: true });
    for (let t = 4; t < L - 1; t += 4.4) brush(c, [[hx - 1.9, hy - t], [hx + 1.9, hy - t - 0.2]], 0.55, C.ink, R, { bristles: 1, dry: 0.2, taper: 0 });
    dab(c, hx, hy, 1.4, C.ink, R); dab(c, hx, hy, 0.6, burnt ? C.charL : IRON, R);
    return;
  }
  if (name === 'chain') {    // chain from the tower top to the bridge, painted at the docked rest (the driver stretches it)
    const [ax, ay] = G.chainTop, [bx, by] = towChainEnd(G.dock, [0, 0]), n = 8;
    for (let i = 0; i <= n; i++) { const t = i / n; outline(c, ring(ax + (bx - ax) * t, ay + (by - ay) * t, 0.75, 0.55, R, 0.05, 6), R, 0.42, { bristles: 1, jit: 0.05 }); }
    return;
  }
  if (name === 'flag') pennant(c, G.flagBase[0], G.flagBase[1], 15, 12, col, M, burnt);
}
function towWhole(c, o) {
  if (o.dead) { wreckWhole(c, o, towPart); return; }
  const G = G_TOW, dock = o.pose === 'docked';
  towPart(c, o, 'frame');
  towPart(c, o, 'flag');
  if (dock) towPart(c, o, 'chain');
  c.save(); if (dock) { c.translate(G.hinge[0], G.hinge[1]); c.rotate(G.dock); c.translate(-G.hinge[0], -G.hinge[1]); } towPart(c, o, 'bridge'); c.restore();
  wheels(c, G, rollAng(o.pose), o.M, false);
}

/** A machine entry: whole painter, part painter, parts list, driver. */
function machine(e) {
  return {
    box: e.box, scale: 1, own: OWN, lie: 'none', poses: e.poses, extra: e.extra.concat(e.parts.map((n) => 'r:' + n)),
    pick: e.pick,
    rig: { driver: e.driver, G: e.G, parts: e.rigParts },
    paint(c, o) { if (isPart(o.pose)) e.part(c, o, machinePart(o)); else e.whole(c, o); },
  };
}
const rollPick = (info) => (info.moving ? (info.walkFrame ? 'roll1' : 'roll0') : null);

export const SPRITES = {
  shieldwall, halberd: halberdier, crossbow: crossbowman, oilpot: oilman, siegecrew: crew,

  ram: machine({
    box: [78, 58, 35, 55], driver: 'ram', G: G_RAM, poses: ['idle', 'roll0', 'roll1'], extra: ['back', 'thrust'],
    parts: ['frame', 'ropes', 'log', 'wheel'], part: ramPart, whole: ramWhole,
    rigParts: (pose) => ({ frame: 'r:frame', ropes: 'r:ropes', log: 'r:log', wheel: 'r:wheel', swing: G_RAM.swing[pose] || 0, code: POSE_CODE(pose) }),
    pick(u, info) { const a = ACT(u); return a === 2 ? 'thrust' : a === 1 ? 'back' : rollPick(info); },
  }),
  catapult: machine({
    box: [74, 58, 42, 52], driver: 'catapult', G: G_CAT, poses: ['idle', 'roll0', 'roll1'], extra: ['loaded', 'fire'],
    parts: ['frame', 'arm', 'stone', 'swoosh', 'wheel'], part: catPart, whole: catWhole,
    rigParts: (pose) => ({ frame: 'r:frame', arm: 'r:arm', stone: pose === 'loaded' ? 'r:stone' : null, swoosh: pose === 'fire' ? 'r:swoosh' : null, wheel: 'r:wheel',
      fire: pose === 'fire' ? 1 : 0, code: POSE_CODE(pose) }),
    pick(u, info) { const a = ACT(u); return a === 2 ? 'fire' : a === 1 ? 'loaded' : rollPick(info); },
  }),
  ballista: machine({
    box: [62, 46, 24, 42], driver: 'ballista', G: G_BAL, poses: ['idle', 'roll0', 'roll1'], extra: ['aim', 'fire', 'empty'],
    parts: ['frame', 'stock', 'stockF', 'stockE', 'wheel'], part: balPart, whole: balWhole,
    rigParts: (pose) => ({ frame: 'r:frame', stock: 'r:' + (BAL_STOCK[pose] || 'stock'), wreck: 'r:stockE', wheel: 'r:wheel', pitch: BAL_PITCH[pose] || 0, fire: pose === 'fire' ? 1 : 0, code: POSE_CODE(pose) }),
    pick(u, info) {
      const a = ACT(u);
      if (a === 2) return 'fire';
      if (a === 1) return 'aim';
      const rl = u.b && u.b.fireAt > 0 && u.b.reload > 0;   // reloading after a shot (b.reload also holds the first-shot delay)
      return rl && !info.moving ? 'empty' : rollPick(info);
    },
  }),
  siegetower: machine({
    box: [162, 112, 114, 108], driver: 'tower', G: G_TOW, poses: ['idle', 'roll0', 'roll1'], extra: ['docked'],
    parts: ['frame', 'bridge', 'chain', 'flag', 'wheel'], part: towPart, whole: towWhole,
    rigParts: (pose) => ({ frame: 'r:frame', bridge: 'r:bridge', chain: 'r:chain', flag: 'r:flag', wheel: 'r:wheel', dock: pose === 'docked' ? 1 : 0, code: POSE_CODE(pose) }),
    pick(u, info) { return ACT(u) === 1 ? 'docked' : rollPick(info); },
  }),
};

// ================================================================ projectiles (fx.js default case)
const TEAM3 = [OWN, C.red, C.blue];
const KEBAB_STUCK = 6, KEBAB_PIN = 2.5;   // sim/units/siege/ballista.js KEBAB.stuck / .pin (s): how long a stopped bolt stays, the living pinned
const teamV = (p) => (p.team === 0 ? 1 : p.team === 1 ? 2 : 0);
/** Height of a lobbed / arcing projectile: the sim's p.z, else its apex arc over its life. */
function zOf(p) {
  if (p.z > 0) return p.z;
  if (p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; return 4 * p.apex * f * (1 - f); }
  return 0;
}
export const PROJ = {
  // crossbow bolt: stubby shaft, iron head, fletching in the team colour. Flat and fast: drawn at shoulder height.
  bolt: {
    box: [22, 10, 11, 5], n: 3, lift: 13,
    paint(c, R, v, M) {
      for (const s of [-1, 1]) fill(c, poly([[-8.6, 0], [-4.6, 0], [-8, s * 2.4]], R, 0.06), TEAM3[v], R, { sharp: true, edge: 0, vary: 0.05 });
      tube(c, [[-8.4, 0], [5.2, 0]], 1.1, '#e2c48c', R, 0.5);
      part(c, poly([[4.6, -1.8], [9.4, 0], [4.6, 1.8]], R, 0.06), IRON, M, { lw: 0.8, sharp: true });
    },
    draw(p, x, y, ang, rt, i, api) { const s = api.bit(api.sprite, teamV(p)); const z = zOf(p); if (z > 3) api.shadowAt(x, y, 0.22, 0.6); api.put(s, x, y - 13 - z, 1, ang); return true; },
  },
  // ballista bolt: a spear-sized bolt. TABS kebab: the sim carries the bodies it goes through along its shaft (p.skN bodies at
  // p.skX / p.skY, radius p.skR, slot 0 = first hit = farthest back), so the shaft is drawn from the tip (p.x) back past the
  // last body: tail (team fletching, v 0-2) + shaft (v 4, stretched) + head (v 3). Stopped (p.stuck): lying low, nose down.
  bigbolt: {
    box: [30, 12, 15, 6], n: 5,
    paint(c, R, v, M) {
      if (v <= 2) { bigBolt(c, -6, 0, 6, R, M, false, TEAM3[v], 'tail'); return; }
      if (v === 3) { bigBolt(c, -8, 0, -0.4, R, M, false, null, 'head'); return; }
      brush(c, [[-10, 0], [10, 0]], 1.5 + 0.55 * 2, C.ink, R, { bristles: 3, taper: 0, dry: 0, vary: 0.05, swell: 0 });
      brush(c, [[-10, 0], [10, 0]], 1.5, '#e2c48c', R, { bristles: 3, taper: 0, dry: 0, vary: 0.08, swell: 0 });
    },
    draw(p, x, y, ang, rt, i, api) {
      const stuck = p.stuck === 1, z = zOf(p), n = p.skN | 0;
      let L = 36;
      if (n > 0 && p.skX) L = Math.max(L, Math.hypot(p.x - p.skX[0], p.y - p.skY[0]) + (p.skR[0] || 9) + 9);
      // stopped: through the living it stays level at chest height while they are pinned, then drops onto the ground
      let lift = n > 0 ? 11 : 15, tl = lift;
      if (stuck) {
        let live = 0; for (let k = 0; k < n; k++) if (p.skId[k] >= 0) live = 1;
        const el = KEBAB_STUCK - p.life, f = Math.min(1, Math.max(0, (el - (live ? KEBAB_PIN : 0)) / 0.25));
        const l0 = n > 0 ? 11 : 9; lift = l0 + (3 - l0) * f; tl = lift + (n > 0 ? f : 1) * Math.min(10, 0.14 * L);
      }
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const tx = x, ty = y - lift - z, ex = x - ca * L, ey = y - sa * L - tl - z;   // tip, tail end (screen, sim px)
      const dx = tx - ex, dy = ty - ey, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, a2 = Math.atan2(dy, dx);
      if (!stuck && z > 3) api.shadowAt(x, y, 0.4, 0.6);
      const ls = Math.max(1, l - 10);
      putXY(api, api.bit(api.sprite, 4), ex + ux * (4 + ls / 2), ey + uy * (4 + ls / 2), ls / 20, 1, a2);
      api.put(api.bit(api.sprite, teamV(p)), ex + ux * 6, ey + uy * 6, 1, a2);
      api.put(api.bit(api.sprite, 3), tx - ux * 6, ty - uy * 6, 1, a2);   // the head bit's tip is 6 px ahead of its anchor
      return true;
    },
  },
  // catapult boulder: grey stone; flies high (p.z), lands, then rolls on: it turns with the ground it covers.
  boulder: {
    box: [20, 20, 10, 10], n: 2,
    paint(c, R, v, M) { boulder(c, 0, 0, 6.6, R, M, false); },
    draw(p, x, y, ang, rt, i, api) {
      const z = zOf(p), s = api.bit(api.sprite, i & 1);
      api.shadowAt(x, y, 0.6 + Math.min(0.2, z / 400), Math.max(0.35, 0.85 - z / 300));
      api.put(s, x, y - 6.6 - z, 1, (x + y * 0.35) / 6.6);   // rolls: one turn per 2·pi·r covered
      return true;
    },
  },
  // hot-oil pot: lit pot tumbling end over end
  oilpot: {
    box: [16, 20, 8, 11], n: 2, spin: 9,
    paint(c, R, v, M) { pot(c, 0, 1.6, 3.8, R, M, false, true); },
    draw(p, x, y, ang, rt, i, api) {
      const z = zOf(p);
      api.shadowAt(x, y, 0.3, 0.75);
      api.put(api.bit(api.sprite, (rt * 10 + i) & 1), x, y - 8 - z, 1, Math.sin(rt * 9 + i) * 0.5 + (p.vx >= 0 ? 0.35 : -0.35));
      return true;
    },
  },
};
export { OWN as SIEGE_OWN };
