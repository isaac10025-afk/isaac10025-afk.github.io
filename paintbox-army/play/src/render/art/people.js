// Painted people (ported from looks/src/kid-a.js human(), then extended). Owner: ARMY art agent.
// MYTHICAL imports human() for the zombie, mage, necromancer and skeleton bodies.
// Local coords: feet at (0,0), facing right (+x), up = -y. One person is about 14 wide, 30 tall at scale 1.
//
// human(c, kind, col, pose, M, dead, skin, opt)
//   kind: 'soldier' | 'sniper' | 'flamer' | 'grenadier' | 'archer' | 'heavy' (Roman: shield + plumed helmet)
//         | 'knight' (grey armour, kite shield, pointed helm) | 'ninja' (hood, eye slit, headband, katana) | 'zombie'
//   col:  clothing colour (team colour in Team battle, else the type's own colour)
//   pose: kid-a's 'aim' | 'walk0' | 'walk1', plus (where the kind has it):
//         'atk'     soldier/sniper recoil, flamer spraying, heavy thrust, knight overhand swing, ninja katana cut
//         'reload'  soldier/sniper muzzle up + fresh magazine; grenadier hand in its bomb bag
//         'windup'  grenadier arm cocked far back, leaning back     'throw' grenadier arm flung forward, empty hand
//         'nock'    archer: arrow on a slack string                  'loose' archer: string snapped, arrow gone
//         'perch'   sniper sitting on a branch, aiming               'prone' sniper on its belly, rifle on a bipod
//         'run0' | 'run1' long running stride (ninja walk)          'dash' ninja lunging, katana swept back
//         'star'    ninja flinging a shuriken                        'fly'  any kind: tossed in the air, arms and legs out
//   dead: false | 'dead' (X eyes) | 'burnt' (all charcoal)
//   skin: optional skin colour override (risen copies pass C.zskin)
//   opt:  { risen, hatless, kindled, band } (all optional)
//         risen   zombie face, arms reaching out, weapon dropped (a Roman keeps its shield), as OG's risen copies
//         hatless the hat (helmet) was knocked off or singed away: messy hair instead
//         kindled archer: the arrow head burns (fire arrows)
//         band    ninja headband colour (default red)
//         layer   floppy bodies (rig.js): paint ONE layer of the figure in its rest place: 'back' (gear behind the body),
//                 'body', 'head', 'arms' (both arms + weapon for this pose). No legs (humanLeg) and no lean (the rig
//                 turns the parts). Unset = the whole figure as before.
import { C, tone, brush, ring, poly, part, fill, outline, shift, dab, tube, spark } from './paint.js';

const NO = {};
const HAIR = '#3b2618';

export const LEGS = {
  aim: [[[-1.8, -8], [-3.4, -0.3], [-1.2, 0.1]], [[1.8, -8], [3.4, -0.3], [5.8, 0]]],
  walk0: [[[-1.8, -8], [-5.4, -0.5], [-3.3, -0.1]], [[1.8, -8], [5, -0.2], [7.3, 0]]],
  walk1: [[[-1.5, -8], [-0.6, -0.2], [1.7, 0.1]], [[1.5, -8], [2.6, -3.2], [1.4, -0.6], [3.4, -0.4]]],
  run0: [[[-1.8, -8], [-6.2, -3.4], [-8.8, -1.6], [-7.2, -0.6]], [[1.8, -8], [6.6, -2.2], [9, -0.1]]],
  run1: [[[-1.5, -8], [-0.4, -3], [-3.4, -1.2], [-2.2, -0.2]], [[1.6, -8], [5.4, -6.2], [4.6, -2], [6.6, -1.6]]],
  dash: [[[-1.8, -8], [-7.4, -4.6], [-12.4, -1.4], [-11, -0.3]], [[1.8, -8], [7.6, -6.4], [9.4, -0.6], [11.4, -0.2]]],
  fly: [[[-1.8, -8], [-6.4, -4.4], [-9.2, -1.4]], [[1.8, -8], [6, -5.4], [9.6, -3.4]]],
  perch: [[[-1.4, -8], [3.8, -8.8], [4.6, -3.2], [6.2, -2.8]], [[1.6, -8], [6, -7.8], [7.2, -2.4], [8.8, -2.2]]],
};
// Upper-body lean (radians, + = forward), turned about the hips so the feet stay planted.
const LEAN = { dash: 0.36, run0: 0.12, run1: 0.12, windup: -0.16, throw: 0.12 };
const LEAN_KIND = { heavy: { atk: 0.07 }, knight: { atk: 0.1 }, ninja: { atk: 0.08, star: 0.06 } };

export function face(c, M, dead, kind, x = 0, y = 0, mouth) {
  const R = M.R;
  if (dead) {
    for (const ex of [-1.4, 2.3]) { brush(c, [[x + ex - 0.9, y - 22.6], [x + ex + 0.9, y - 20.8]], 0.75, C.ink, R, { bristles: 2, dry: 0 }); brush(c, [[x + ex + 0.9, y - 22.6], [x + ex - 0.9, y - 20.8]], 0.75, C.ink, R, { bristles: 2, dry: 0 }); }
    dab(c, x + 0.5, y - 18.6, 0.95, C.ink, R);
    return;
  }
  if (kind === 'zombie') {
    dab(c, x + 3, y - 22.4, 1.55, '#fffdf2', R); dab(c, x + 3.3, y - 22.3, 0.62, C.ink, R); dab(c, x - 0.6, y - 21.8, 0.72, C.ink, R);
    brush(c, [[x - 1, y - 18.8], [x, y - 18], [x + 1, y - 18.9], [x + 2, y - 18], [x + 3, y - 18.9]], 0.6, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
    return;
  }
  if (kind === 'ninja') { dab(c, x + 2.6, y - 22.5, 0.8, C.ink, R); dab(c, x - 0.6, y - 22.4, 0.8, C.ink, R); return; } // mask: eyes only
  if (kind === 'sniper' && mouth !== 'o') brush(c, [[x + 1.6, y - 21.8], [x + 3.3, y - 21.7]], 0.65, C.ink, R, { bristles: 2, dry: 0 });
  else dab(c, x + 2.5, y - 21.8, mouth === 'o' ? 0.9 : 0.72, C.ink, R);
  dab(c, x - 1.1, y - 21.7, mouth === 'o' ? 0.9 : 0.72, C.ink, R);
  if (mouth === 'o') { dab(c, x + 0.9, y - 18.5, 1.05, '#7a1610', R); return; }
  brush(c, [[x - 0.6, y - 19.1], [x + 0.9, y - 18.1], [x + 2.4, y - 19.1]], 0.55, '#c22a1c', R, { bristles: 2, dry: 0, taper: 0.2 });
}
export function helmet(c, M, col) {
  part(c, poly([[-5.8, -23.6], [-5.4, -27.1], [-2, -29.6], [2.8, -29.7], [6.4, -27.2], [7, -23.6]], M.R, 0.3), col, M);
  brush(c, [[-6.6, -23.4], [0.5, -23.1], [8, -23.5]], 1.5, C.ink, M.R, { bristles: 3, dry: 0.2 });
}
/** Messy hair where a hat was (hat knocked off / singed). (hx, hy) = head centre. */
export function hair(c, R, hx = 0.5, hy = -22.9, col = HAIR) {
  for (let i = 0; i < 4; i++) brush(c, [[hx - 3.4 + i * 2.3, hy - 4.2], [hx - 4.4 + i * 2.6 + (R() - 0.5) * 0.8, hy - 7.2 - R() * 0.8]], 1.05, col, R, { bristles: 2, dry: 0.2, taper: 0.55 });
}
/** Just the hat of a kind, where it sits on the head (about HAT_AT): for a knocked-off hat flying away (RENDER fx). */
export const HAT_AT = [0.5, -27];
export function paintHat(c, kind, col0, M, burnt) {
  const R = M.R, col = burnt ? C.char : col0;
  if (kind === 'soldier' || kind === 'flamer' || kind === 'grenadier') helmet(c, M, burnt ? C.char : tone(col, -0.12));
  else if (kind === 'sniper') { part(c, ring(0.2, -27.4, 7, 2.6, R, 0.08, 9, -0.18), burnt ? C.char : tone(col, -0.12), M); dab(c, -1.6, -30.2, 1.1, C.ink, R); }
  else if (kind === 'archer') {
    part(c, poly([[-6, -23.4], [-11.6, -26.4], [-3.4, -30.3], [3.8, -29.8], [6.9, -25.8], [6.6, -23.4]], R, 0.3), burnt ? C.char : tone(col, -0.1), M);
    brush(c, [[-3.6, -28.8], [-6.6, -33.4], [-9.8, -35.6]], 1.9, burnt ? C.charL : C.yellow, R, { taper: 0.7, dry: 0.2 });
  } else if (kind === 'heavy') {
    part(c, poly([[-5, -17.9], [-5.7, -24.2], [-3.8, -28.6], [0.6, -29.6], [5, -28.6], [6.7, -24.2], [6.1, -17.9]], R, 0.3), burnt ? C.char : C.greyL, M);
    brush(c, [[0.6, -29.2], [-2.4, -33.4], [-7.4, -33], [-9.6, -29.6]], 2.6, burnt ? C.charL : col, R, { taper: 0.6, dry: 0.3 });
  } else if (kind === 'knight') knightHelm(c, M, col, burnt, false);
}
function knightHelm(c, M, col, burnt, slit) {
  const R = M.R;
  // a pointed great helm with a feather tuft on its point
  brush(c, [[1, -31.4], [1.4, -34.6], [-0.8, -37.4]], 2.3, burnt ? C.charL : col, R, { taper: 0.65, dry: 0.25 });
  part(c, poly([[-5.2, -18.6], [-5.8, -24.6], [-3, -29], [1, -32.4], [4.8, -28.8], [6.9, -24.4], [6.6, -18.6]], R, 0.3), burnt ? C.char : C.greyL, M);
  if (slit) {
    brush(c, [[0.2, -23.6], [6.6, -23.8]], 1.15, C.ink, R, { bristles: 2, dry: 0 });
    for (const [x, y] of [[3, -20.4], [4.8, -20.6], [3.9, -19.2]]) dab(c, x, y, 0.45, C.ink, R);
  }
}
const SWOOSH = '#e9eef2';
/** Swoosh lines behind a swing (kid style motion marks). pts = the arc the tip followed. */
function swoosh(c, pts, R, w = 1.1) {
  brush(c, pts, w * 1.25, SWOOSH, R, { bristles: 3, taper: 0.95, dry: 0.6, vary: 0.04 });
  brush(c, pts.map(([x, y]) => [x - 0.8, y + 2.2]), w * 0.6, C.greyL, R, { bristles: 2, taper: 0.95, dry: 0.6 });
}
/** A blade with an ink edge (katana, sword): grip from g0 to g1 (dark), blade from g1 to tip. */
function blade(c, g0, g1, tip, R, burnt, w = 0.9) {
  tube(c, [g1, tip], w, burnt ? C.charL : C.greyL, R, w < 0.7 ? 0.42 : 0.5);
  brush(c, [g0, g1], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
/** A kite shield (white, cross in col). (x, y) = centre. */
function kite(c, M, x, y, col, burnt, s = 1) {
  const R = M.R;
  part(c, poly([[x - 3.8 * s, y - 6 * s], [x + 3.8 * s, y - 6.2 * s], [x + 4 * s, y + 0.4 * s], [x + 0.2 * s, y + 6.8 * s], [x - 3.9 * s, y + 0.4 * s]], R, 0.25), burnt ? C.char : C.white, M, { lw: 1.5 });
  if (!burnt) { brush(c, [[x + 0.1 * s, y - 5 * s], [x + 0.2 * s, y + 4.6 * s]], 1.5 * s, col, R, { bristles: 2, dry: 0.1 }); brush(c, [[x - 3 * s, y - 1.8 * s], [x + 3.2 * s, y - 1.9 * s]], 1.5 * s, col, R, { bristles: 2, dry: 0.1 }); }
}
/** A four-pointed throwing star. */
export function shuriken(c, x, y, r, R, burnt) {
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.3; const k = i % 2 ? 0.38 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.12), burnt ? C.charL : C.greyL, R, { sharp: true, vary: 0.05, edge: 0 });
  outline(c, pts, R, 0.75, { jit: 0.12, bristles: 2 });
  dab(c, x, y, r * 0.22, C.ink, R);
}
/** A little flame (fire arrow head, flamer pilot light), pointing along +x from (x, y). */
export function flameLick(c, x, y, s, R) {
  const tongue = (col, k) => fill(c, poly([[x - 0.6 * s * k, y - 1.2 * s * k], [x + 2.6 * s * k, y - 2.6 * s * k], [x + 2 * s * k, y - 0.8 * s * k], [x + 4.4 * s * k, y - 0.2 * s * k], [x + 1.6 * s * k, y + 1.2 * s * k], [x - 0.6 * s * k, y + 1 * s * k]], R, 0.15 * s), col, R, { vary: 0.06, edge: 0 });
  tongue(C.fireR, 1.15); tongue(C.fireO, 0.8); tongue(C.fireY, 0.45);
}

export function human(c, kind, col0, pose, M, dead, skin0, opt = NO) {
  const R = M.R, burnt = dead === 'burnt', col = burnt ? C.char : col0;
  const risen = !!opt.risen && kind !== 'zombie';
  const zom = kind === 'zombie' || risen;
  const skin = burnt ? C.charL : (skin0 || (zom ? C.zskin : C.skin));
  const hatless = !!opt.hatless;
  if (pose === 'prone') return prone(c, kind, col, skin, M, dead, opt);
  const L = opt.layer, want = (n) => !L || L === n;
  const fly = pose === 'fly';
  const big = kind === 'heavy' || kind === 'knight' ? 1.12 : 1;
  c.save(); c.scale(big, big);
  const legs = LEGS[pose] || LEGS.aim;
  // back gear first
  if (want('back') && kind === 'flamer') { part(c, poly([[-9, -19.4], [-4.6, -19.8], [-4.2, -9.2], [-8.8, -8.8]], R, 0.3), burnt ? C.char : C.greyL, M, { sharp: false }); brush(c, [[-9.2, -15.4], [-4.4, -15.6]], 1.2, C.ink, R, { bristles: 2 }); }
  if (want('back') && kind === 'heavy' && pose === 'aim' && !zom) { brush(c, [[-2.4, -15.5], [-6, -23], [-8.8, -30.5]], 2.3, burnt ? C.charL : C.greyL, R, { taper: 0.3, dry: 0.1 }); }
  if (!L) for (const lg of legs) brush(c, lg, 1.9, C.ink, R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 });
  // upper body: leans about the hips
  const lean = (LEAN_KIND[kind] && LEAN_KIND[kind][pose]) ?? LEAN[pose] ?? 0;
  if (lean && !L) { c.translate(0, -8); c.rotate(lean); c.translate(0, 8); }
  if (want('back') && (kind === 'knight' && pose === 'walk0' || kind === 'knight' && pose === 'walk1')) {
    // sword resting back on the shoulder (behind the body)
    blade(c, [3.2, -15.4], [1.6, -17.6], [-6.4, -29.2], R, burnt);
  }
  if (want('back') && kind === 'ninja' && pose === 'dash' && !zom) blade(c, [-1.2, -12.6], [-3, -12], [-14.6, -7.6], R, burnt, 0.55); // swept back low
  // body
  const nin = kind === 'ninja';
  let body = ring(0, -12.8, kind === 'heavy' ? 5.8 : nin ? 4.9 : 5.2, kind === 'heavy' ? 6.7 : nin ? 6.1 : 6.2, R, 0.14, 9, R() * 0.4);
  if (zom) body = body.map(([x, y], i) => y > -11 ? [x + (i % 2 ? 0.8 : -0.6), y + (i % 2 ? 1.6 : -0.4)] : [x, y]);
  if (want('body')) part(c, body, col, M);
  if (want('body') && kind === 'knight') brush(c, [[-4.8, -9.8], [0, -9.2], [5, -9.8]], 1.5, burnt ? C.charL : C.greyD, R, { bristles: 3, dry: 0.2, taper: 0.1 }); // sword belt
  // head
  const hx = kind === 'zombie' ? 1.4 : 0.5, hy = kind === 'zombie' ? -22 : -22.6;
  if (want('head')) {
  part(c, ring(hx, hy - 0.3, 5.6, 5.3, R, 0.08, 8), nin ? col : skin, M);
  if (nin) { // the mask's eye slit, then the headband knotted at the back, its tails streaming
    fill(c, shift(poly([[-1.6, -24.3], [5.6, -24.6], [6, -21], [-1.4, -20.6]], R, 0.2), M.mx * 0.4, M.my * 0.4), skin, R, { vary: 0.06, edge: 0 });
    const bc = burnt ? C.charL : (opt.band || C.red), st = pose === 'dash' ? 1.6 : pose === 'run0' || pose === 'run1' ? 1.25 : 1;
    brush(c, [[-5.4, -25.8], [0.4, -26.4], [6, -26.2]], 1.7, bc, R, { bristles: 3, dry: 0.1, taper: 0.1 });
    brush(c, [[-5, -25.8], [-8.2 * st, -24.6 - 0.4 / st], [-11.6 * st, -25.6 + 1.4 / st]], 1.5, bc, R, { bristles: 2, dry: 0.2, taper: 0.5 });
    brush(c, [[-5, -25.4], [-7.6 * st, -22.8 + 0.4 * st], [-10.4 * st, -21.8 + 1.2 * st]], 1.3, bc, R, { bristles: 2, dry: 0.2, taper: 0.55 });
    dab(c, -5.2, -25.6, 1.25, bc, R);
  }
  // hats
  if (!hatless) {
    if (kind === 'soldier' || kind === 'flamer' || kind === 'grenadier') helmet(c, M, burnt ? C.char : tone(col, -0.12));
    if (kind === 'sniper') { part(c, ring(0.2, -27.4, 7, 2.6, R, 0.08, 9, -0.18), burnt ? C.char : tone(col, -0.12), M); dab(c, -1.6, -30.2, 1.1, C.ink, R); }
    if (kind === 'archer') {
      part(c, poly([[-6, -23.4], [-11.6, -26.4], [-3.4, -30.3], [3.8, -29.8], [6.9, -25.8], [6.6, -23.4]], R, 0.3), burnt ? C.char : tone(col, -0.1), M);
      brush(c, [[-3.6, -28.8], [-6.6, -33.4], [-9.8, -35.6]], 1.9, burnt ? C.charL : C.yellow, R, { taper: 0.7, dry: 0.2 });
    }
  } else if (kind !== 'zombie' && !nin) hair(c, R, hx, hy, burnt ? C.ink : HAIR);
  const mouth = fly && !dead ? 'o' : undefined;
  if (kind === 'heavy' && !hatless) {
    part(c, poly([[-5, -17.9], [-5.7, -24.2], [-3.8, -28.6], [0.6, -29.6], [5, -28.6], [6.7, -24.2], [6.1, -17.9]], R, 0.3), burnt ? C.char : C.greyL, M);
    if (!dead) brush(c, [[-0.4, -23.2], [6.2, -23.3]], 1.1, C.ink, R, { bristles: 2, dry: 0 });
    else face(c, M, true, kind, 0.4, -0.6);
    brush(c, [[0.6, -29.2], [-2.4, -33.4], [-7.4, -33], [-9.6, -29.6]], 2.6, burnt ? C.charL : col, R, { taper: 0.6, dry: 0.3 });
  } else if (kind === 'knight' && !hatless) {
    knightHelm(c, M, col, burnt, !dead);
    if (dead) face(c, M, true, kind, 0.4, -0.6);
  } else face(c, M, dead, zom ? 'zombie' : kind, hx - 0.5, hy + 22.6, mouth);
  if (kind === 'zombie') for (let i = 0; i < 3; i++) brush(c, [[hx - 2 + i * 1.8, hy - 4.6], [hx - 2.6 + i * 2.2, hy - 7.2]], 0.55, C.ink, R, { bristles: 2, dry: 0 });
  }
  const armsLayer = () => {
  // arms + weapons, in front
  const arm = (pts, w = 1.3) => brush(c, pts, w, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 });
  const hand = (x, y) => dab(c, x, y, 1.05, skin, R);
  if (fly) { // tossed: everything let go, arms and legs flung out
    if (kind === 'heavy') part(c, ring(6.4, -13.2, 4.7, 6.3, R, 0.07, 8), col, M, { lw: 1.6 });
    arm([[-1.4, -16.8], [-5.4, -21], [-7.8, -25.2]]); arm([[2, -17], [6, -21.2], [8.6, -25]]); hand(-8, -25.6); hand(8.8, -25.4);
    return;
  }
  if (risen) { // OG: risen, its weapon's gone and its arms reach out (a Roman keeps its shield)
    if (kind === 'heavy') part(c, ring(6.4, -13.2, 4.7, 6.3, R, 0.07, 8), col, M, { lw: 1.6 });
    tube(c, [[0.6, -18], [6, -18.8], [11.4, -18.6]], 1.7, skin, R, 0.85); tube(c, [[-0.6, -13.8], [5, -13], [10.4, -12]], 1.7, skin, R, 0.85); dab(c, 11.8, -18.6, 1.2, skin, R); dab(c, 10.8, -12, 1.2, skin, R);
    return;
  }
  if (kind === 'soldier' || kind === 'sniper') {
    const longer = kind === 'sniper' ? 4.5 : 0;
    const aimGun = () => {
      brush(c, [[-3.2, -13.4], [3, -15.1]], 2.7, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 4 });
      brush(c, [[2, -15.2], [13.5 + longer, -16.8]], 1.75, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 3 });
      if (kind === 'sniper') { brush(c, [[3.2, -17.6], [9, -18.2]], 2.6, C.ink, R, { bristles: 3, dry: 0 }); dab(c, 9.3, -18.2, 1.3, '#9fd8ff', R); }
      arm([[2.4, -16.6], [7.4, -16]]); arm([[-2, -15.4], [1.4, -14.6]]); hand(7.4, -16); hand(1.2, -14.4);
    };
    if (pose === 'aim' || pose === 'perch') aimGun();
    else if (pose === 'atk') { c.save(); c.translate(-1, -15); c.rotate(-0.16); c.translate(0, 15); aimGun(); c.restore(); }
    else if (pose === 'reload') { // muzzle up, a fresh magazine going in from below
      brush(c, [[-1.4, -9.6], [1.8, -13.6]], 2.7, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 4 });
      brush(c, [[1.4, -13.2], [4.6, -27.8 - longer * 0.6]], 1.75, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 3 });
      if (kind === 'sniper') { brush(c, [[1.2, -16.2], [2.4, -21.6]], 2.4, C.ink, R, { bristles: 3, dry: 0 }); dab(c, 2.5, -22, 1.2, '#9fd8ff', R); }
      arm([[2.2, -16.8], [4, -20.4]]); arm([[-1.8, -14.6], [1.6, -11.2], [4.2, -11.6]]);
      brush(c, [[3.4, -12.6], [5.4, -11.6]], 2.2, C.ink, R, { bristles: 3, dry: 0 });
      hand(4.2, -20.6); hand(4.6, -11.4);
    } else {
      brush(c, [[-2, -8.6], [2, -13.8]], 2.7, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 4 });
      brush(c, [[1.6, -13.4], [8.4, -26.6]], 1.75, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 3 });
      arm([[2.6, -16.4], [4.6, -17.4]]); arm([[-2, -14.8], [1.2, -11.6]]); hand(4.8, -17.6); hand(1.2, -11.4);
    }
  }
  if (kind === 'grenadier') {
    const bomb = (x, y) => { dab(c, x, y, 2.9, C.ink, R); dab(c, x - 1, y - 1, 0.7, '#6d6d6d', R); brush(c, [[x + 1.2, y - 2.4], [x + 2.4, y - 4.8]], 0.8, burnt ? C.charL : C.brown, R, { bristles: 2, dry: 0 }); if (!burnt) spark(c, x + 2.7, y - 5.6, 2.3, R); };
    if (pose === 'windup') { // cocked far back over the shoulder, the other arm pointing at the target
      arm([[-1.6, -16.6], [-5.8, -18.4], [-9.2, -21.4]]); bomb(-10.4, -23.4);
      arm([[2.2, -16.6], [6.2, -18.4], [9.2, -19.6]]); hand(9.6, -19.8);
    } else if (pose === 'throw') { // flung forward, empty-handed
      swoosh(c, [[-11.4, -27], [-7.6, -34.2], [-0.8, -37.4], [6.6, -35]], R, 0.85);
      arm([[1.2, -17.2], [6, -19.8], [11, -21.6]]); hand(11.4, -21.7);
      arm([[-1.4, -15.6], [-4.6, -13.4], [-6.6, -11]]); hand(-6.8, -10.8);
    } else if (pose === 'reload') { // a hand in the bomb bag on the hip
      part(c, ring(5, -9.6, 3, 2.5, R, 0.1, 7), burnt ? C.char : C.brownL, M, { lw: 1.2 });
      dab(c, 4.8, -12, 1.8, C.ink, R);
      arm([[1.6, -16], [3.8, -13.6], [4.6, -12.2]]); hand(4.6, -12.4);
      arm([[-1.6, -15.4], [-3.6, -11.4]]); hand(-3.8, -11);
    } else { // kid-a: the lit bomb held up behind the head
      arm([[-1.6, -16.4], [-4.6, -21], [-6.2, -25.6]]); dab(c, -6.6, -28, 2.9, C.ink, R); dab(c, -7.6, -29, 0.7, '#6d6d6d', R);
      brush(c, [[-5.4, -30.4], [-4.2, -32.8]], 0.8, burnt ? C.charL : C.brown, R, { bristles: 2, dry: 0 });
      if (!burnt) spark(c, -3.9, -33.6, 2.3, R);
      arm([[2.2, -15.8], [6.6, -14.2]]); hand(6.8, -14.1);
    }
  }
  if (kind === 'flamer') {
    const spray = pose === 'atk', jx = spray ? -0.7 : 0, jy = spray ? (R() - 0.5) * 0.8 : 0;
    brush(c, [[-6.4, -9.4], [-2, -6.8], [2.6 + jx, -11.4 + jy]], 0.9, C.ink, R, { bristles: 2, dry: 0 });
    brush(c, [[1 + jx, -12.6 + jy], [11.6 + jx, -14 + jy]], 2.4, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 4 });
    brush(c, [[3 + jx, -12.6 + jy], [7 + jx, -13.4 + jy]], 1.4, burnt ? C.charL : C.yellow, R, { taper: 0.1, dry: 0, bristles: 2 });
    if (spray && !burnt) flameLick(c, 12 + jx, -14.1 + jy, 1.25, R);
    arm([[2.4, -16.4], [6.6 + jx, -14.4 + jy]]); arm([[-2, -15], [1.6 + jx, -12.4 + jy]]); hand(6.6 + jx, -14.2 + jy);
  }
  if (kind === 'archer') {
    const fire = opt.kindled && !burnt;
    if (pose === 'aim') { // full draw (kid-a)
      brush(c, [[7.6, -27.4], [10.9, -21.4], [11.1, -13.6], [7.6, -6.4]], 1.8, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 3 });
      brush(c, [[7.6, -27.4], [2.4, -16.6], [7.6, -6.4]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      brush(c, [[2.4, -16.6], [14.6, -16.6]], 0.85, C.brownL, R, { bristles: 2, dry: 0, taper: 0 });
      dab(c, 15, -16.6, 1, C.ink, R); if (fire) flameLick(c, 15.2, -16.8, 0.9, R);
      arm([[2.6, -17], [10.6, -17.1]]); arm([[-1.4, -15.4], [2.4, -16.6]]); hand(10.8, -17); hand(2.4, -16.6);
    } else if (pose === 'nock') { // arrow on a slack string, bow held up in front
      brush(c, [[6.4, -26.6], [9.4, -21], [9.6, -13.4], [6.4, -7]], 1.8, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 3 });
      brush(c, [[6.4, -26.6], [6.2, -16.6], [6.4, -7]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      brush(c, [[5.4, -16.2], [15.4, -17.4]], 0.85, C.brownL, R, { bristles: 2, dry: 0, taper: 0 });
      dab(c, 15.8, -17.4, 1, C.ink, R); if (fire) flameLick(c, 16, -17.6, 0.9, R);
      arm([[2.6, -16.8], [9.2, -16.9]]); arm([[-1.4, -15.2], [2.4, -15.4], [5.8, -16.2]]); hand(9.4, -16.9); hand(5.8, -16.2);
    } else if (pose === 'loose') { // the string snapped back straight and still humming, the draw hand flung back open
      brush(c, [[7.6, -27.4], [10.9, -21.4], [11.1, -13.6], [7.6, -6.4]], 1.8, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 3 });
      brush(c, [[7.6, -27.4], [7.4, -16.6], [7.6, -6.4]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      for (const k of [-1, 1]) brush(c, [[7.4 + k * 1.3, -21.4], [7.3 + k * 1.6, -16.6], [7.4 + k * 1.3, -11.8]], 0.35, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.4 });
      arm([[2.6, -17], [10.6, -17.1]]); arm([[-1.4, -15.6], [-4.4, -17.6], [-6.4, -19.4]]); hand(10.8, -17); hand(-6.8, -19.6);
    } else { // walking: bow at the side (kid-a)
      brush(c, [[5.4, -24.6], [8, -17], [5.4, -8.4]], 1.8, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 3 });
      brush(c, [[5.4, -24.6], [5.4, -8.4]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      arm([[2.2, -16.2], [7.2, -17]]); hand(7.4, -17);
    }
  }
  if (kind === 'heavy') {
    if (pose !== 'aim' && pose !== 'atk') brush(c, [[3.2, -17.4], [6, -24], [8.4, -31.4]], 2.3, burnt ? C.charL : C.greyL, R, { taper: 0.3, dry: 0.1 });
    if (pose !== 'aim' && pose !== 'atk') brush(c, [[1.4, -18.6], [5.2, -16.4]], 1.4, C.ink, R, { bristles: 2, dry: 0 });
    if (pose === 'atk') { // thrust out over the shield's rim
      tube(c, [[3.4, -11.6], [21.4, -11.2]], 1.7, burnt ? C.charL : C.greyL, R, 0.5);
      for (const [y, x0] of [[-14.8, 14.4], [-7.8, 13.6]]) brush(c, [[x0, y], [x0 + 6, y + 0.1]], 0.6, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.7 });
    }
    part(c, ring(6.4, -13.2, 4.7, 6.3, R, 0.07, 8), col, M, { lw: 1.6 });
    if (pose === 'atk') brush(c, [[-0.6, -16.4], [3.4, -13.4], [8.8, -11.6]], 1.4, C.ink, R, { bristles: 2, dry: 0 }); // the sword arm, across the shield
    if (!burnt) { brush(c, [[6.4, -18.4], [6.5, -8.2]], 1.6, C.yellow, R, { bristles: 2, dry: 0.1 }); brush(c, [[2.4, -13.6], [10.4, -13.3]], 1.6, C.yellow, R, { bristles: 2, dry: 0.1 }); }
    if (pose === 'aim') brush(c, [[-4.6, -17.6], [-0.6, -14.2]], 1.4, C.ink, R, { bristles: 2, dry: 0 });
  }
  if (kind === 'knight') {
    if (pose === 'atk') { // overhand swing, brought down in front
      swoosh(c, [[-1, -33.4], [6.4, -33], [13.2, -27.6], [17, -19.6]], R, 1);
      arm([[1.4, -17.6], [5.6, -18.6], [8.4, -18.4]]);
      blade(c, [7.4, -17.6], [9.2, -18.6], [18.8, -12.8], R, burnt, 1.05); brush(c, [[8.2, -20.6], [10.2, -16.6]], 1.1, C.ink, R, { bristles: 2, dry: 0 });
      hand(8.6, -18.4);
      kite(c, M, 4.4, -11.8, col, burnt, 0.85);
    } else if (pose === 'walk0' || pose === 'walk1') {
      kite(c, M, 6, -12.2, col, burnt, 0.85);
      arm([[1.6, -16.6], [3.4, -14.4], [3.4, -14.2]]); hand(3.2, -15);
    } else { // sword held high in front, shield up
      blade(c, [8.6, -14.8], [8.8, -18.2], [10.2, -33.2], R, burnt, 1.05); brush(c, [[6.6, -18.6], [11, -18.8]], 1.1, C.ink, R, { bristles: 2, dry: 0 });
      kite(c, M, 4.8, -12, col, burnt, 0.85);
      arm([[2.2, -17.2], [5.6, -16.4], [8.4, -16.4]]); hand(8.8, -16.6);
    }
  }
  if (nin) {
    const kat = (g0, g1, tip) => blade(c, g0, g1, tip, R, burnt, 0.55);
    if (pose === 'atk') { // a quick cut from high over the shoulder, down and across
      swoosh(c, [[0, -33], [7.6, -32], [13.6, -26], [16.2, -17.6]], R, 1);
      arm([[1.4, -17.4], [5.4, -18.2], [8, -17]]);
      kat([6.4, -16.2], [8.2, -17.2], [17.4, -12.4]); hand(8, -17);
      arm([[-1.6, -15.6], [-4.4, -12.6]]); hand(-4.6, -12.2);
    } else if (pose === 'star') { // free hand flicked out, a star just leaving it; katana held low behind
      kat([-1.2, -11.2], [-2.6, -10.6], [-12.6, -5.8]);
      arm([[-1.4, -14.8], [-2.8, -11]]); hand(-2.8, -10.8);
      arm([[1.4, -17.6], [6, -18.6], [9.8, -19.4]]); hand(10.2, -19.4);
      for (let i = 0; i < 2; i++) brush(c, [[12.2, -18.4 + i * 2.4], [14.4, -18.8 + i * 2.4]], 0.45, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.6 });
      shuriken(c, 16, -20.2, 2.5, R, burnt);
    } else if (pose === 'dash') { // katana swept back low (painted before the body)
      arm([[-1.2, -15.6], [-3, -12.2]]); hand(-3, -12);
      arm([[1.6, -17], [5.4, -19.2], [7.6, -18.6]]); hand(7.8, -18.6);
      for (let i = 0; i < 3; i++) brush(c, [[-13 - i * 1.6, -25.6 + i * 6.4], [-19.6 - i * 1.6, -25.4 + i * 6.4]], 0.7, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.7 });
    } else { // held low and forward, the tip up
      kat([3.6, -12], [5.4, -13.6], [13.4, -21.2]);
      arm([[1.6, -16.6], [4, -15.4], [5.2, -13.8]]); arm([[-1.6, -15.4], [1.6, -12.8], [4, -12.4]]); hand(5.2, -13.8); hand(3.8, -12.2);
    }
  }
  if (kind === 'zombie') {
    tube(c, [[0.6, -18], [6, -18.8], [11.4, -18.6]], 1.7, skin, R, 0.85); tube(c, [[-0.6, -13.8], [5, -13], [10.4, -12]], 1.7, skin, R, 0.85); dab(c, 11.8, -18.6, 1.2, skin, R); dab(c, 10.8, -12, 1.2, skin, R);
  }
  };
  if (want('arms')) armsLayer();
  c.restore();
}

/** Floppy bodies (rig.js): one leg in its rest place, hip at (0, -8), foot forward at (2.2, 0). Ink like the painted legs. */
export function humanLeg(c, kind, M, burnt) {
  const big = kind === 'heavy' || kind === 'knight' ? 1.12 : 1;
  c.save(); c.scale(big, big);
  brush(c, [[0, -8], [0.3, -0.4], [2.4, 0.1]], 1.9, burnt ? C.ink : C.ink, M.R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 });
  c.restore();
}
/** Upper-body lean (radians, + = forward) human() gives this kind + pose; the rig springs toward it. */
export function leanOf(kind, pose) { return (LEAN_KIND[kind] && LEAN_KIND[kind][pose]) ?? LEAN[pose] ?? 0; }
/** Does this kind + pose paint anything in the 'back' layer? */
export function hasBack(kind, pose, zom) {
  return kind === 'flamer' || (kind === 'heavy' && pose === 'aim' && !zom) || (kind === 'knight' && (pose === 'walk0' || pose === 'walk1')) || (kind === 'ninja' && pose === 'dash' && !zom);
}
/** Rest-pose joints of a painted person (sprite px, feet at 0,0; times the kind's size). */
export function humanJoints(kind) {
  const big = kind === 'heavy' || kind === 'knight' ? 1.12 : 1;
  return { big, hip: [0, -8 * big], neck: [0.5 * big, -17.6 * big], shoulder: [1 * big, -16.4 * big], legX: 1.8 * big };
}

// A sniper lying on its belly (OG: stretched out along the ground, feet out behind, head up at the front looking
// down the scope, the rifle resting on its bipod). Feet anchor = the middle of the body on the ground.
function prone(c, kind, col, skin, M, dead, opt) {
  const R = M.R, burnt = dead === 'burnt', zom = !!opt.risen;
  for (const lg of [[[-7, -3.4], [-13, -2.4], [-17.6, -1.6], [-18.6, -3.2]], [[-7.4, -2], [-12.6, -0.8], [-17, -0.3], [-19.6, -1]]]) brush(c, lg, 1.9, C.ink, R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 });
  part(c, ring(-1.6, -4.4, 8.6, 3.9, R, 0.1, 9), col, M);
  if (!zom) { // rifle on its bipod, stock under the chin
    brush(c, [[19.4, -7.2], [18, -0.6]], 0.7, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); brush(c, [[19.6, -7.2], [21.4, -0.6]], 0.7, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
    brush(c, [[3.2, -5.6], [9.2, -6.8]], 2.6, burnt ? C.char : C.brown, R, { taper: 0.1, dry: 0.1, bristles: 4 });
    brush(c, [[8.6, -7], [24.6, -7.6]], 1.75, C.ink, R, { taper: 0.05, dry: 0.05, bristles: 3 });
  }
  const hx = 7.6, hy = -8.4;
  part(c, ring(hx, hy, 5.4, 5.1, R, 0.08, 8), skin, M);
  if (!opt.hatless) { part(c, ring(hx - 0.4, hy - 4.6, 7, 2.5, R, 0.08, 9, -0.1), burnt ? C.char : tone(col, -0.12), M); dab(c, hx - 2.2, hy - 7.4, 1.1, C.ink, R); }
  else hair(c, R, hx, hy, burnt ? C.ink : HAIR);
  face(c, M, dead, zom ? 'zombie' : 'sniper', hx - 0.5, hy + 22.6);
  const arm = (pts) => brush(c, pts, 1.3, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 });
  if (zom) { tube(c, [[3, -6], [9, -4.6], [14.4, -4]], 1.7, skin, R, 0.85); dab(c, 14.8, -4, 1.2, skin, R); return; }
  brush(c, [[10, -10.4], [15.4, -10.8]], 2.4, C.ink, R, { bristles: 3, dry: 0 }); dab(c, 15.6, -10.8, 1.2, '#9fd8ff', R);
  arm([[1.4, -5.6], [6.8, -4.2], [12.6, -6.4]]); arm([[-0.6, -6.4], [3, -3.4], [6, -5.2]]); dab(c, 12.8, -6.6, 1.05, skin, R); dab(c, 6.2, -5.4, 1.05, skin, R);
}

// ---------- the horse (cavalry, loose horse; ANIMALS' ape cavalry may ride it too) ----------
// Side view facing right, hooves on y = 0, back top at about y = -24, nose at about x = 23, tail at x = -18.
// horse(c, M, pose, cloth, dead, opt)
//   pose:  'idle' | 'walk0' | 'walk1' (a trot, diagonal pairs) | 'run0' (stretched out, all hooves off the ground)
//          | 'run1' (gathered up under it) | 'drink' (neck down, muzzle to the water)
//   cloth: saddle cloth colour (the rider's colours)      dead: false | 'dead' (on its back, legs up) | 'burnt'
//   opt:   { risen (rotten green coat, staring eye), saddle: 'empty' (default: stirrup hanging) | 'rider' | 'none',
//            layer: floppy bodies (rig-quad.js): paint ONE part in its rest place (the 'idle' horse): 'legNF' | 'legFF' |
//            'legNH' | 'legFH' (near / far, fore / hind leg), 'tail', 'neck' (neck, mane and head), 'body' (body, saddle
//            cloth, empty saddle). Dead: the part upright with an X eye (and tongue out), turned onto its back
//            (y -> -HORSE_BACK - y) like the whole dead frame. }
export const HORSE = { coat: C.brownL, mane: '#4a2f1c' };
export const HORSE_BACK = 24.6;   // a dead horse's parts lie with the top of the back on the ground
const HLEGS = { // [near front, far front, near hind, far hind]: hip, knee, hoof
  idle: [[[7.4, -14], [7.9, -6.8], [7.6, -0.7]], [[5.2, -14], [5, -6.8], [4.8, -0.7]], [[-8.6, -14], [-9.8, -7], [-8.8, -0.7]], [[-10.8, -14], [-11.8, -7], [-11, -0.7]]],
  walk0: [[[7.4, -14], [11, -8.4], [9.8, -3.6]], [[5.2, -14], [3.4, -7], [1.6, -0.7]], [[-8.6, -14], [-11.6, -7.4], [-13.4, -0.7]], [[-10.8, -14], [-8, -8.2], [-9.4, -3.4]]],
  walk1: [[[7.4, -14], [5.8, -7], [4.2, -0.7]], [[5.2, -14], [8.8, -8.4], [7.6, -3.6]], [[-8.6, -14], [-5.8, -8.2], [-7.2, -3.4]], [[-10.8, -14], [-13.8, -7.4], [-15.6, -0.7]]],
  run0: [[[7.4, -14], [12.6, -10.2], [17.4, -8.6]], [[5.2, -14], [10.4, -9.4], [14.8, -6.8]], [[-8.6, -14], [-14, -10], [-19.4, -9]], [[-10.8, -14], [-15.4, -8.6], [-20, -6.6]]],
  run1: [[[7.4, -14], [6.4, -7.2], [2.8, -2]], [[5.2, -14], [5.6, -7], [1.6, -3]], [[-8.6, -14], [-4.8, -7.8], [-2.6, -1.2]], [[-10.8, -14], [-7, -7.4], [-4.8, -2]]],
};
HLEGS.drink = [[[7.4, -14], [9, -7], [9.8, -0.7]], HLEGS.idle[1], HLEGS.idle[2], HLEGS.idle[3]];
/** An ellipse ring turned by ang. */
export function oval(cx, cy, rx, ry, ang, R, irr = 0.07, n = 9) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return ring(0, 0, rx, ry, R, irr, n).map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
}
export function horse(c, M, pose, cloth0, dead, opt = NO) {
  const R = M.R, burnt = dead === 'burnt', risen = !!opt.risen && !burnt;
  const coat = burnt ? C.char : risen ? '#93b85a' : (opt.coat || HORSE.coat);
  const mane = burnt ? C.charL : risen ? C.zskinD : HORSE.mane;
  const cloth = burnt ? C.char : cloth0, far = tone(coat, -0.2);
  const Ly = opt.layer, want = (n) => !Ly || Ly === n;
  if (dead && !Ly) return horseDead(c, M, coat, mane, cloth, far, dead, risen);
  if (Ly) pose = 'idle';
  const L = HLEGS[pose] || HLEGS.idle, up = pose === 'run0' ? -2.4 : pose === 'run1' ? -1 : 0;
  c.save();
  if (Ly && dead) { c.translate(0, -HORSE_BACK); c.scale(1, -1); }   // a dead part: on its back
  c.translate(0, up);
  const leg = (lg, col) => { tube(c, lg, 2.3, col, R, 1.05); const [x, y] = lg[2], [px, py] = lg[1]; const a = Math.atan2(y - py, x - px); dab(c, x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.6, 1.45, C.ink, R); };
  if (want('legFF')) leg(L[1], far);
  if (want('legFH')) leg(L[3], far);
  // tail, flowing back from the rump (out behind when it gallops)
  const fast = pose === 'run0' || pose === 'run1';
  if (want('tail')) brush(c, fast ? [[-12.6, -20.6], [-17, -21], [-21, -18.4], [-23, -15]] : [[-12.8, -20.8], [-16.4, -19.2], [-18, -13.6], [-17.4, -9.4]], 3.3, mane, R, { taper: 0.6, dry: 0.35, bristles: 5 });
  if (want('legNF')) leg(L[0], coat);
  if (want('legNH')) leg(L[2], coat);
  const drink = pose === 'drink';
  // neck (under the body's outline), then the body
  const neck = drink ? [[6.6, -19.4], [11.6, -15.6], [14.6, -9.4]] : [[6.6, -19.8], [11.2, -25.4], [14.4, -29.4]];
  if (want('neck')) tube(c, neck, 7.6, coat, R, 1.4);
  if (want('body')) {
    part(c, ring(-1, -17.6, 12.6, 6.4, R, 0.06, 10), coat, M, { lw: 1.7 });
    // saddle cloth in the rider's colours, a darker fringe along its bottom
    part(c, poly([[-6.8, -24.2], [4.2, -24.4], [4.8, -15.4], [-7.2, -15.2]], R, 0.3), cloth, M, { lw: 1.3, sharp: false });
    brush(c, [[-6.8, -15.8], [-1, -15.6], [4.6, -16]], 1.2, burnt ? C.ink : tone(cloth, -0.3), R, { bristles: 2, dry: 0.2, taper: 0.1 });
  }
  if (want('neck')) {
    // mane down the top of the neck, then the head
    if (drink) brush(c, [[14.2, -11.6], [11, -17.6], [7.4, -21.6]], 2.6, mane, R, { taper: 0.35, dry: 0.3, bristles: 4 });
    else brush(c, [[15.6, -33.4], [12.6, -30], [8.8, -24.6]], 2.7, mane, R, { taper: 0.35, dry: 0.3, bristles: 4 });
    const ha = drink ? 1.3 : 0.62, hcx = drink ? 16.6 : 17.8, hcy = drink ? -5.4 : -29.2;
    const ca = Math.cos(ha), sa = Math.sin(ha), at = (x, y) => [hcx + x * ca - y * sa, hcy + x * sa + y * ca]; // head frame: +x to the nose
    part(c, poly([at(-2.4, -2.2), at(-3.6, -6.4), at(-0.8, -2.8)], R, 0.15), coat, M, { lw: 1.1, sharp: true }); // ear
    part(c, oval(hcx, hcy, 6.6, 3.9, ha, R), coat, M, { lw: 1.5 });
    const [mx, my] = at(4.6, 0.4); dab(c, mx, my, 2.3, burnt ? C.charL : tone(coat, -0.3), R);
    const [nx, ny] = at(5.6, -0.7); dab(c, nx, ny, 0.5, C.ink, R);
    const [ex, ey] = at(-1.2, -1.2);
    if (dead) { // a dead part: X eye, tongue out (as horseDead)
      for (const s of [-1, 1]) brush(c, [[ex - 0.9, ey - 0.9 * s], [ex + 0.9, ey + 0.9 * s]], 0.7, C.ink, R, { bristles: 2, dry: 0 });
      if (!burnt) { const [tx, ty] = at(4.4, 2.8); dab(c, tx, ty, 1.35, C.pink, R); }
    } else if (risen) { dab(c, ex, ey, 1.3, '#fffdf2', R); dab(c, ex + 0.2, ey, 0.55, C.ink, R); } else dab(c, ex, ey, 0.85, C.ink, R);
    const [fx, fy] = at(-2.6, -2.8), [gx, gy] = at(-0.6, -3.8); brush(c, [[fx, fy], [gx, gy]], 1.6, mane, R, { bristles: 2, dry: 0.2, taper: 0.5 }); // forelock
  }
  if (want('body') && (!opt.saddle || opt.saddle === 'empty')) { // the empty saddle and a stirrup hanging down
    brush(c, [[-4.8, -26], [-3, -24.6], [1.2, -24.6], [3, -26.4]], 2.2, burnt ? C.charL : C.brown, R, { bristles: 3, dry: 0.15, taper: 0.1 });
    brush(c, [[-0.6, -24.6], [-0.4, -17.4]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
    brush(c, [[-1.8, -17.2], [-0.4, -16.4], [1, -17.2]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  }
  c.restore();
}
/** The horse parts a rigged entry paints (rig-quad.js 'quad', table 'horse'). */
export const HORSE_PARTS = ['r:legNF', 'r:legFF', 'r:legNH', 'r:legFH', 'r:tail', 'r:neck', 'r:body'];
/** rig.parts() for a horse (+ rider): every field the 'quad' driver reads, the horse's parts, p on top. */
export function horseParts(p) {
  return Object.assign({ l0: 'r:legNF', l1: 'r:legFF', l2: 'r:legNH', l3: 'r:legFH', body: 'r:body', head: 'r:neck', tail: 'r:tail', tip: null, jawL: null, rider: null,
    gait: 1, headA: 0, hx: 0, lift: 0, pitch: 0, tailT: 0, up: 0, dn: 0, rlean: 0 }, p);
}
// Dead: rolled onto its back, four stiff legs in the air, head down on the grass, X eye, tongue out.
function horseDead(c, M, coat, mane, cloth, far, dead, risen) {
  const R = M.R;
  part(c, poly([[-6.4, -4.4], [4.6, -4.6], [4.4, 0.6], [-6.6, 0.8]], R, 0.3), cloth, M, { lw: 1.2, sharp: false });
  brush(c, [[-12.4, -6.6], [-16.6, -4.4], [-19.6, -1.2]], 3, mane, R, { taper: 0.6, dry: 0.35, bristles: 5 });
  const leg = (lg, col) => { tube(c, lg, 2.3, col, R, 1.05); dab(c, lg[2][0], lg[2][1] - 0.6, 1.45, C.ink, R); };
  leg([[3.6, -11], [5, -19.4], [4.4, -27.4]], far); leg([[-10, -10.4], [-12, -18.6], [-13.4, -26.4]], far);
  leg([[6.6, -11], [9, -19.6], [9.4, -28.4]], coat); leg([[-7.6, -11], [-8.8, -19.6], [-8.2, -28.2]], coat);
  tube(c, [[8, -7.4], [13, -4.6], [15.6, -4]], 6, coat, R, 1.4);
  part(c, ring(-1, -8.2, 12.8, 5.8, R, 0.06, 10), coat, M, { lw: 1.7 });
  part(c, oval(19.6, -4.4, 6.6, 3.8, 0.1, R), coat, M, { lw: 1.5 });
  dab(c, 24, -3.6, 2.3, dead === 'burnt' ? C.charL : tone(coat, -0.3), R);
  if (dead !== 'burnt') dab(c, 25.2, -0.4, 1.35, C.pink, R);
  for (const s of [-1, 1]) brush(c, [[17.6 - 0.9, -6.6 - 0.9 * s], [17.6 + 0.9, -6.6 + 0.9 * s]], 0.7, C.ink, R, { bristles: 2, dry: 0 });
  brush(c, [[12.4, -1.8], [15, -0.8], [17.4, -1.2]], 2.2, mane, R, { taper: 0.4, dry: 0.3, bristles: 3 });
}
// The cavalry rider: a little knight in the saddle, his boot down the horse's side, a kite shield on his arm, and a
// lance: raised with its pennant flying on the move, lowered for the charge, thrust out on a hit.
// rider(c, M, col, pose, dead, skin, opt): pose 'idle' | 'walk0' | 'walk1' | 'run0' | 'run1' (lance up)
//   | 'charge0' | 'charge1' (lance lowered) | 'atk' (lance thrust, leaning in). opt { risen, hatless, rest }.
//   rest: floppy bodies (rig-quad.js): the rider in the saddle of the idle horse, no bounce and no lean in (the rig adds
//   them: the seat is at (-0.4, -25.6), the atk lean 0.16 about it).
export function rider(c, M, col0, pose, dead, skin0, opt = NO) {
  const R = M.R, burnt = dead === 'burnt', col = burnt ? C.char : col0, zom = !!opt.risen && !burnt;
  const skin = burnt ? C.charL : (skin0 || (zom ? C.zskin : C.skin));
  const low = pose === 'charge0' || pose === 'charge1' || pose === 'atk', thrust = pose === 'atk' ? 4.2 : 0;
  const up = opt.rest ? 0 : pose === 'run0' ? -2.4 : pose === 'run1' || pose === 'charge1' ? -1 : pose === 'charge0' || pose === 'atk' ? -2.4 : 0;
  c.save(); c.translate(-0.4, -18.6 + up); // person coords from here: hip at (0, -7)
  if (pose === 'atk' && !opt.rest) { c.translate(0, -7); c.rotate(0.16); c.translate(0, 7); }
  const shaft = burnt ? C.charL : C.brownL;
  const lance = (b, t, pa, pb, pc) => {
    if (!burnt) fill(c, poly([pa, pb, pc], R, 0.15), col, R, { sharp: true, vary: 0.08, edge: 0 }); // pennant
    tube(c, [b, t], 1.15, shaft, R, 0.55);
    const dx = t[0] - b[0], dy = t[1] - b[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    part(c, poly([[t[0] - ux * 0.6 - uy * 1.2, t[1] - uy * 0.6 + ux * 1.2], [t[0] + ux * 3.6, t[1] + uy * 3.6], [t[0] - ux * 0.6 + uy * 1.2, t[1] - uy * 0.6 - ux * 1.2]], R, 0.1), burnt ? C.charL : C.greyL, M, { lw: 0.9, sharp: true });
  };
  if (!low) lance([3, -2.6], [10.2, -34.4], [9.2, -31.2], [8.5, -27.8], [2.6, -30.4]);
  brush(c, [[-0.4, -7.2], [3.8, -3.8], [2.8, 1.6]], 2.1, C.ink, R, { bristles: 3, taper: 0.2, dry: 0.1 });
  dab(c, 3.8, 1.9, 1.35, C.ink, R);
  part(c, ring(0, -12.6, 4.8, 5.6, R, 0.12, 9, R() * 0.4), col, M);
  part(c, ring(0.5, -22.9, 5.6, 5.3, R, 0.08, 8), skin, M);
  if (!opt.hatless) { knightHelm(c, M, col, burnt, !dead); if (dead) face(c, M, true, 'knight', 0.4, -0.6); }
  else { hair(c, R, 0.5, -22.9, burnt ? C.ink : HAIR); face(c, M, dead, zom ? 'zombie' : 'knight', 0, 0); }
  kite(c, M, 1.8, -12.2, col, burnt, 0.78);
  if (low) {
    const dx = thrust;
    lance([-7.4 + dx, -15.2], [31.6 + dx, -13], [27 + dx, -13.4], [23.2 + dx, -13.2], [20.4 + dx, -9.4]);
    brush(c, [[1.6, -17.2], [3.8 + dx * 0.6, -16.4], [5.6 + dx, -14.6]], 1.3, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 }); dab(c, 5.8 + dx, -14.4, 1.1, skin, R);
  } else { brush(c, [[1.8, -17], [4, -15.8], [5.2, -14.4]], 1.3, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 }); dab(c, 5.3, -14.2, 1.1, skin, R); }
  c.restore();
}
