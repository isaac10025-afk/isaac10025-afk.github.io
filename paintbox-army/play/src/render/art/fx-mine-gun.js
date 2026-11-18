// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: W-GUN. POSTER PAINT.
// PROJ: none of our own: every gun shoots the source unit's projectile kind and that kind's art (bullet, flame, pellet,
// bolt, bigbolt, ray, shrink, minirocket, missile, web, webpatch, webon, cannonball).
// OVER (mine-hooks.js, called by the made unit's entry over() with the identity transform, X / Y = device px of the
// unit's feet raised by its z, S = device px per sim px, now = world.time):
//  - laser: charging (bag.phase 1): a flare growing on the muzzle over 0.4 s; beam (bag.phase 2): the beam from the muzzle
//    to the point bag.beamL px past the body's edge along bag.beamA (world rad), flickering, with an impact flare
//    (sprites-robots.js laserOver, read from the weapon bag instead of u.b; sim/maker/weapons/guns-more.js).
//  - zap: for 0.16 s after each zap (bag.at), a jagged cyan spark line from the muzzle to the unit it hit (bag.vid),
//    else to the spark point (bag.x1, bag.y1) (sprites-robots.js droneOver).
// The muzzle: the held gun's tip for two legs (person, giant), the gun strapped on the back for four legs (animal,
// beast); MUZ below, in body radii, facing right (ART-BODY's rig puts the gun there; see rig-mine.js).
import { OVER, MINE } from './mine-hooks.js';
import { C, TAU, brush, fill, outline, dab, spark } from './paint.js';
export const PROJ = {};

const LASER = '#ff3420', CYAN = '#7fe6ff', HOT = '#fffbe0';
// muzzle in body radii (x forward, y up = negative), per body (the drawn gun's tip / the back gun's barrel end)
const MUZ = { person: [1.55, -1.45], giant: [1.5, -1.55], animal: [1.05, -1.55], beast: [1.0, -1.45] };
const T = {
  charge: 0.4,       // s: the charge flare grows over this (laserbot T.charge)
  beamLift: 9,       // px: the beam's far end sits this high above the ground
  zapShow: 0.16,     // s: a zap line shows this long (drone art)
  zapAim: 56,        // px: a spark at nobody reaches this far when no point was kept
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const boil3 = (rt, ph) => (((rt * 8 + ph * 3) | 0) % 3 + 3) % 3;
const nowRT = () => performance.now() / 1000;

// Effect bits come from sprites.js defineBit; sprites.js imports this module, so it is loaded lazily on the first draw
// (fully loaded by then), as sprites-robots.js does.
let SPX = null, spxP = null, BITS = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function defineBits(m) {
  const noT = { tooth: false };
  return {
    beam: m.defineBit('mg:beam', 3, [104, 10, 2, 5], (c, R) => {   // a 100 px beam, scaled to length
      const pts = []; for (let i = 0; i <= 10; i++) pts.push([i * 10, (R() - 0.5) * 0.9]);
      brush(c, pts, 3.8, C.ink, R, { bristles: 3, dry: 0.04, taper: 0.05, swell: 0.1, per: 3 });
      brush(c, pts, 2.8, LASER, R, { bristles: 3, dry: 0.05, taper: 0.05, swell: 0.1, per: 3 });
      brush(c, pts, 1.6, C.fireO, R, { bristles: 2, dry: 0.08, taper: 0.05, per: 3 });
      brush(c, pts, 0.7, HOT, R, { bristles: 1, dry: 0.1, taper: 0.05, per: 3 });
    }, noT),
    flare: m.defineBit('mg:flare', 3, [26, 26, 13, 13], (c, R) => {   // a spiky star, r 9.5
      const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + R() * 0.2, r = (i % 2 ? 3 : 9.5) * (0.8 + R() * 0.4); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      fill(c, pts, C.yellow, R, { sharp: true, edge: 0 }); outline(c, pts, R, 0.9, { jit: 0.2 });
      dab(c, 0, 0, 3.4, C.fireO, R); dab(c, 0, 0, 1.8, HOT, R);
    }, noT),
    zap: m.defineBit('mg:zap', 3, [104, 20, 2, 10], (c, R) => {   // a 100 px jagged spark line, scaled to length
      const pts = [[0, 0]]; for (let i = 1; i < 8; i++) pts.push([i * 12.5, (R() - 0.5) * 11]); pts.push([100, 0]);
      brush(c, pts, 4, C.ink, R, { bristles: 3, dry: 0.05, taper: 0.1, per: 2 });
      brush(c, pts, 2.5, CYAN, R, { bristles: 3, dry: 0.05, taper: 0.1, per: 2 });
      brush(c, pts, 0.9, '#ffffff', R, { bristles: 1, dry: 0.1, taper: 0.1, per: 2 });
    }, noT),
    spk: m.defineBit('mg:spk', 2, [10, 10, 5, 5], (c, R) => { spark(c, 0, 0, 2.6, R); }, noT),
  };
}
/** Draw a bit with its anchor at (x, y) sim px, x / y scale, turned by ang. */
function blit(ctx, spr, S, x, y, sx, sy, ang) {
  if (!spr) return;
  const m = S / spr.k, cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
// the gun's tip (sim px) for unit u drawn at X, Y (device px)
const MZ = new Float64Array(2);
const MA = [0, 0];
function muzzle(u, X, Y, flip, S) {
  // STEP8 (lead): ART-BODY's live gun tip (MINE.anchor 'muzzle': this frame's rig pose); the table above only as a fallback
  if (MINE.anchor && MINE.anchor(u, 'muzzle', MA)) { MZ[0] = X / S + flip * MA[0]; MZ[1] = Y / S + MA[1]; return MZ; }
  const m = u.def && u.def.maker, k = MUZ[(m && m.body) || 'person'] || MUZ.person, r = u.radius || 9.9;
  MZ[0] = X / S + flip * k[0] * r; MZ[1] = Y / S + k[1] * r;
  return MZ;
}

// laser: charge flare, then the beam + impact flare (sprites-robots.js laserOver)
OVER.laser = function laserOver(ctx, u, bag, X, Y, flip, S, now) {
  const ph0 = bag ? bag.phase | 0 : 0;
  if (ph0 !== 1 && ph0 !== 2) return;
  if (!spx() || !BITS) return;
  const rt = nowRT(), ph = (u.id % 13) * 0.1, k = clamp((u.radius || 9.9) / 9.9, 0.5, 2.4);
  const mz = muzzle(u, X, Y, flip, S), ex = mz[0], ey = mz[1];
  if (ph0 === 1) {
    const q = clamp((now - (bag.t0 ?? now)) / T.charge, 0, 1);
    blit(ctx, SPX.bit(BITS.flare, boil3(rt, ph)), S, ex, ey, (0.2 + 0.45 * q) * k, (0.2 + 0.45 * q) * k, rt * 3);
  } else {
    const L = bag.beamL > 0 ? bag.beamL : 0, A = bag.beamA;
    if (!(L > 0) || A !== A || A === undefined) return;
    const gx = X / S, gy = Y / S + (u.z || 0), r0 = (u.radius || 9.9) + L;   // the ground under the unit; the beam runs L px from its edge
    const tx = gx + Math.cos(A) * r0, ty = gy + Math.sin(A) * r0 - T.beamLift;
    const dx = tx - ex, dy = ty - ey, len = Math.sqrt(dx * dx + dy * dy) || 1, fl = 0.85 + 0.25 * Math.sin(rt * 47 + ph * 9);
    blit(ctx, SPX.bit(BITS.beam, boil3(rt * 1.6, ph)), S, ex, ey, len / 100, fl * Math.max(0.7, Math.min(1.6, k)), Math.atan2(dy, dx));
    blit(ctx, SPX.bit(BITS.flare, boil3(rt * 1.3, ph + 0.4)), S, tx, ty, 0.6 * fl, 0.6 * fl, rt * 5);
    blit(ctx, SPX.bit(BITS.flare, boil3(rt, ph)), S, ex, ey, 0.55 * k, 0.55 * k, -rt * 4);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

// zap: the spark line to its victim for 0.16 s after each zap (sprites-robots.js droneOver)
OVER.zap = function zapOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || !(now - (bag.at ?? -9) <= T.zapShow) || now < bag.at) return;
  if (!spx() || !BITS) return;
  const rt = nowRT(), mz = muzzle(u, X, Y, flip, S), x0 = mz[0], y0 = mz[1];
  const t = bag.vid >= 0 && world && world.unitById ? world.unitById(bag.vid) : null;
  let x1, y1;
  if (t && !t.dead) { x1 = t.x; y1 = t.y - (t.z || 0) - (t.radius || 8) * 1.1; }
  else if (bag.x1 || bag.y1) { x1 = bag.x1; y1 = bag.y1 - 10; }
  else { const a = u.face === u.face && u.face !== undefined ? u.face : (u.heading || 0); x1 = x0 + Math.cos(a) * T.zapAim; y1 = Y / S + (u.z || 0) + Math.sin(a) * T.zapAim - 10; }
  const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
  blit(ctx, SPX.bit(BITS.zap, ((rt * 30) | 0) % 3), S, x0, y0, len / 100, 0.75, Math.atan2(dy, dx));
  blit(ctx, SPX.bit(BITS.spk, ((rt * 20) | 0) & 1), S, x1, y1, 1.1, 1.1, rt * 9);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};
