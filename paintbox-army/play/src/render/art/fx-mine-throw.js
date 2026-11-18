// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: W-THROW. POSTER PAINT.
// PROJ: none of our own: every W-THROW weapon throws the source unit's projectile kind and that kind's art (grenade,
// shuriken, arrow, bomb, oilpot, boulder, lavablob + lava, spit, snowball + iceblock, baseball, bowlball, puck, plasma,
// flame, bubble). Lightning bolts, pond shocks, puffs of steam are the sources' events (fx.js draws them).
// OVER (mine-hooks.js, called by the made unit's entry over() with the identity transform; X / Y = device px of the
// unit's feet raised by its z, S = device px per sim px, now = world.time). What each reads (sim/maker/weapons/throw*.js):
//  - firebreath: while breathing (u.b.act BREATH) a roaring gout of fire at the mouth along bag.breathA (the flames
//    themselves are 'flame' projectiles), + heat sparks.
//  - spray: turning its back (bag.phase 1) the rear steams; spraying (bag.phase 2) a boiling cone from the rear along
//    the back (u.heading + π), 70 px long, 50° wide (bombardier T.range / T.cone).
//  - fireball: winding up (bag.phase 1) a fireball grows in the casting hand over 0.35 s (mage wind-up).
//  - lightning: winding up (bag.phase 1) sparks crackle round the casting hand; 0.2 s after the cast a flash there.
//  - bombs: a lit bomb in the hand (bag.lit 1): the fuse spits sparks.
//  - bubble: while its bubble floats someone (bag.victim >= 0): a wobbly pink ribbon from the hand to the bubble.
//  - shuriken: mid-dash (bag.dashing 1): white speed streaks behind it.
// Anchors come from the made unit's own rig joints (ART-BODY sprites-mine.js entry.made.J: hand, mouth, tail / rear,
// back; sprite px facing right, feet at 0,0) × the entry scale, so they sit on every body and size; a two-legged body
// casts from the front hand, a four-legged one from the gear on its back.
import { OVER } from './mine-hooks.js';
import { C, TAU, brush, fill, outline, dab, spark } from './paint.js';
export const PROJ = {};

const HOT = '#fffbe0', CYAN = '#7fe6ff', STEAM = '#e6f6ff', BOIL = '#9fd8f7', PINK = '#ff7fc8';
const T = {
  gout: 1.7,         // × body radius: the fire gout's length at the mouth
  sprayLen: 70,      // px: the spray cone's length (bombardier T.range)
  sprayCone: 50,     // deg: its full width (bombardier T.cone)
  fireWind: 0.35,    // s: the fireball grows over the mage's fireball wind-up
  zapWind: 0.55,     // s: the lightning wind-up
  flash: 0.2,        // s: the hand flashes this long after a lightning cast
  castLift: 5,       // sprite px: the casting hand is raised this much above the rest place (cast pose)
  flameLift: 9,      // px: fx.js draws a new flame this high above its ground point (8 + growth)
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const boil3 = (rt, ph) => (((rt * 8 + ph * 3) | 0) % 3 + 3) % 3;
const nowRT = () => performance.now() / 1000;
// flames spawn this many body radii ahead (sim/maker/weapons/throw-magic.js MOUTH[body][0])
const MOUTH_FWD = { person: 0.5, animal: 1.25, beast: 1.3, giant: 0.5 };
const ACT_BREATH = 8, ACT_SPRAY = 9, ACT_CAST = 7, ACT_THROW = 5;   // sim/maker/lib.js ACT (no sim import in art)

// Effect bits come from sprites.js defineBit; sprites.js imports this module, so it is loaded lazily on the first draw
// (fully loaded by then), as sprites-robots.js / fx-mine-gun.js do.
let SPX = null, spxP = null, BITS = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function defineBits(m) {
  const noT = { tooth: false };
  return {
    gout: m.defineBit('mt:gout', 3, [36, 22, 1, 11], (c, R) => {   // a fire gout along +x, 32 px, root at (0, 0)
      const P = [[0, -2.2], [8, -5 - R()], [16, -8.5 - R() * 1.5], [24, -9 - R() * 2], [31, -5 - R() * 2], [33, 0], [31, 5 + R() * 2], [24, 9 + R() * 2], [16, 8.5 + R() * 1.5], [8, 5 + R()], [0, 2.2]];
      fill(c, P, C.fireR, R, { edge: 0 }); outline(c, P, R, 1.1, { jit: 0.3 });
      const Q = P.map(([x, y]) => [x * 0.8 + 1, y * 0.62]);
      fill(c, Q, C.fireO, R, { edge: 0 });
      const Y = P.map(([x, y]) => [x * 0.55 + 1, y * 0.32]);
      fill(c, Y, C.fireY, R, { edge: 0 });
      for (let i = 0; i < 4; i++) dab(c, 4 + R() * 12, (R() - 0.5) * 3, 1.2, HOT, R);
    }, noT),
    spray: m.defineBit('mt:spray', 3, [74, 72, 2, 36], (c, R) => {   // a boiling cone along +x: 70 px, 50° wide
      const half = (T.sprayCone / 2) * Math.PI / 180;
      for (let i = 0; i < 26; i++) {   // droplets + steam blobs, bigger and paler toward the far end
        const f = 0.12 + 0.88 * Math.sqrt(R()), a = (R() * 2 - 1) * half, x = Math.cos(a) * f * 68, y = Math.sin(a) * f * 68;
        const r = 1.6 + f * 4.2 * (0.6 + R() * 0.6);
        dab(c, x, y, r + 0.9, C.ink, R); dab(c, x, y, r, f > 0.55 ? STEAM : BOIL, R);
        if (R() < 0.4) dab(c, x - r * 0.3, y - r * 0.3, r * 0.4, HOT, R);
      }
      for (let k = -1; k <= 1; k++) {   // three jets out of the rear
        const a = k * half * 0.5, P = [];
        for (let s = 0; s <= 6; s++) P.push([Math.cos(a) * s * 8, Math.sin(a) * s * 8 + (R() - 0.5) * 2]);
        brush(c, P, 3.4, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.6 });
        brush(c, P, 2.2, BOIL, R, { bristles: 2, dry: 0.1, taper: 0.6 });
      }
    }, noT),
    fire: m.defineBit('mt:fire', 3, [18, 18, 9, 9], (c, R) => {   // a fireball, r ~6
      const P = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + R() * 0.3, r = (i % 2 ? 5 : 7.4) * (0.85 + R() * 0.3); P.push([Math.cos(a) * r, Math.sin(a) * r]); }
      fill(c, P, C.fireR, R, { sharp: true, edge: 0 }); outline(c, P, R, 1, { jit: 0.2 });
      dab(c, 0, 0, 4.2, C.fireO, R); dab(c, 0.4, -0.4, 2.4, C.fireY, R); dab(c, 0.8, -0.9, 1, HOT, R);
    }, noT),
    zap: m.defineBit('mt:zap', 3, [26, 26, 13, 13], (c, R) => {   // crackling sparks round a point
      for (let k = 0; k < 4; k++) {
        const a0 = R() * TAU, P = [[Math.cos(a0) * 2, Math.sin(a0) * 2]];
        for (let s = 1; s <= 3; s++) { const a = a0 + (R() - 0.5) * 1.2; P.push([Math.cos(a) * (2 + s * 3.4), Math.sin(a) * (2 + s * 3.4)]); }
        brush(c, P, 2.4, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.3 });
        brush(c, P, 1.4, k & 1 ? CYAN : C.yellow, R, { bristles: 2, dry: 0.05, taper: 0.3 });
      }
      dab(c, 0, 0, 2.6, CYAN, R); dab(c, 0, 0, 1.2, '#ffffff', R);
    }, noT),
    fuse: m.defineBit('mt:fuse', 2, [12, 12, 6, 6], (c, R, v) => { spark(c, 0, 0, v ? 3.4 : 2.6, R); dab(c, 0, 0, 1.1, HOT, R); }, noT),
    ribbon: m.defineBit('mt:ribbon', 3, [104, 14, 2, 7], (c, R) => {   // a 100 px wobbly ribbon, scaled to length
      const P = []; for (let i = 0; i <= 20; i++) P.push([i * 5, Math.sin(i * 0.9 + R() * 0.4) * 3.2]);
      brush(c, P, 3.2, C.ink, R, { bristles: 2, dry: 0.08, taper: 0.15, per: 3 });
      brush(c, P, 2, PINK, R, { bristles: 2, dry: 0.1, taper: 0.15, per: 3 });
      for (let i = 1; i < 5; i++) dab(c, i * 20 + (R() - 0.5) * 6, (R() - 0.5) * 4, 1, '#ffffff', R);
    }, noT),
    streak: m.defineBit('mt:streak', 2, [46, 22, 44, 11], (c, R) => {   // speed lines trailing back from (0, 0)
      for (let k = -1; k <= 1; k++) {
        const y = k * 6 + (R() - 0.5) * 2, L = 26 + R() * 14, P = [[-4, y], [-4 - L * 0.5, y + (R() - 0.5)], [-4 - L, y]];
        brush(c, P, 2.8, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.8 });
        brush(c, P, 1.7, '#ffffff', R, { bristles: 2, dry: 0.1, taper: 0.8 });
      }
    }, noT),
  };
}
/** Draw a bit with its anchor at (x, y) sim px, x / y scale, turned by ang. */
function blit(ctx, spr, S, x, y, sx, sy, ang) {
  if (!spr) return;
  const m = S / spr.k, cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}

// ---------------------------------------------------------------- anchors on the made unit's own rig
// fallback joints (sprite px, facing right) if the entry has none: ART-BODY's rest places, person scale
const FALL = { hand: [8.2, -16.6], mouth: [4.6, -19.2], tail: [-4.4, -9.6], back: [-4.4, -17.6] };
const PT = new Float64Array(2);
let _J = FALL, _k = 1, _quad = false;
function rigOf(u) {
  const r = SPX && SPX.entOf ? SPX.entOf(u.type) : null, ent = r && r.ent, E = ent && ent.e && ent.e.made;
  _J = (E && E.J) || FALL; _quad = !!(E && E.quad);
  _k = ent ? clamp((u.radius || 9.9) / (ent.defR || 9.9), 0.35, 1.7) * (ent.scale || 1) : (u.radius || 9.9) / 9.9;
}
/** Joint `name` of u (rigOf first) in sim px on screen: X / Y device px of its feet, flip ±1, lift = sprite px up. */
function at(name, X, Y, flip, S, lift) {
  const p = _J[name] || FALL[name] || FALL.hand;
  PT[0] = X / S + flip * p[0] * _k; PT[1] = Y / S + (p[1] - (lift || 0)) * _k;
  return PT;
}
/** The casting / throwing hand: the front hand on two legs, the gear strapped on the back on four. */
function hand(X, Y, flip, S, lift) { return _quad ? at('back', X, Y, flip, S, 3) : at('hand', X, Y, flip, S, lift); }
/** The rear: an animal's rump (J.rear), a person's / giant's seat (J.tail). */
function rear(X, Y, flip, S) { return _quad && _J.rear ? at('rear', X, Y, flip, S, 0) : at('tail', X, Y, flip, S, 0); }

// ---------------------------------------------------------------- the effects
OVER.firebreath = function breathOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!u.b || u.b.act !== ACT_BREATH) return;
  if (!spx() || !BITS) return;
  rigOf(u);
  const rt = nowRT(), ph = (u.id % 13) * 0.1, a = bag.breathA === bag.breathA ? bag.breathA : u.heading, m = at('mouth', X, Y, flip, S, 0);
  const mx = m[0], my = m[1], r = u.radius || 9.9, mk = MOUTH_FWD[(u.def && u.def.maker && u.def.maker.body) || 'person'] || 0.5;
  // the gout runs from the mouth down into the flame stream: flames spawn mk r ahead on the ground and draw 8 px up (fx.js)
  const high = Y / S + (u.z || 0) - T.flameLift - my, ahead = Math.max(r * (mk + T.gout * 0.6), high * 1.5);   // tall bodies join further out
  const gx = X / S + Math.cos(a) * ahead, gy = Y / S + (u.z || 0) + Math.sin(a) * ahead - T.flameLift;
  const dx = gx - mx, dy = gy - my, len = Math.max(r * 0.8, Math.sqrt(dx * dx + dy * dy)), fl = 0.88 + 0.16 * Math.sin(rt * 41 + ph * 7);
  blit(ctx, SPX.bit(BITS.gout, boil3(rt * 1.4, ph)), S, mx, my, (len / 32) * fl, Math.max(0.45, r / 14) * (0.9 + 0.15 * Math.sin(rt * 29)), Math.atan2(dy, dx));
  blit(ctx, SPX.bit(BITS.fuse, ((rt * 18) | 0) & 1), S, mx, my - 1, 0.8, 0.8, rt * 7);
};

OVER.spray = function sprayOver(ctx, u, bag, X, Y, flip, S, now) {
  const ph0 = bag ? bag.phase | 0 : 0;
  if (ph0 !== 1 && ph0 !== 2) return;
  if (!spx() || !BITS) return;
  rigOf(u);
  const rt = nowRT(), ph = (u.id % 13) * 0.1, p = rear(X, Y, flip, S), back = (u.heading || 0) + Math.PI;
  if (ph0 === 1) {   // turning its back: the rear steams
    blit(ctx, SPX.bit(BITS.fuse, ((rt * 12) | 0) & 1), S, p[0], p[1] - 2, 0.8, 0.8, rt * 5);
    return;
  }
  const r = u.radius || 9.9, fl = 0.92 + 0.12 * Math.sin(rt * 37 + ph * 5), reach = (T.sprayLen + r * 0.3) / 70;
  blit(ctx, SPX.bit(BITS.spray, boil3(rt * 1.7, ph)), S, p[0], p[1], reach * fl, reach * (0.95 + 0.1 * Math.sin(rt * 23)), back);
};

OVER.fireball = function fireballOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || bag.phase !== 1 || !u.b || u.b.act !== ACT_CAST) return;
  if (!spx() || !BITS) return;
  rigOf(u);
  const rt = nowRT(), q = clamp((now - (bag.phaseT ?? now)) / T.fireWind, 0.15, 1), h = hand(X, Y, flip, S, T.castLift);
  const s = (0.35 + 0.55 * q) * Math.max(0.7, _k);
  blit(ctx, SPX.bit(BITS.fire, boil3(rt * 1.5, u.id % 7)), S, h[0], h[1] - 3 * _k, s, s, rt * 3);
};

OVER.lightning = function lightningOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || !spx() || !BITS) return;
  const winding = bag.phase === 1 && u.b && u.b.act === ACT_CAST, cast = u.b && u.b.act === ACT_THROW && now - (u.b.actT ?? -9) < T.flash;
  if (!winding && !cast) return;
  rigOf(u);
  const rt = nowRT(), h = hand(X, Y, flip, S, T.castLift);
  const q = winding ? clamp((now - (bag.phaseT ?? now)) / T.zapWind, 0.2, 1) : 1.25;
  const s = (0.45 + 0.5 * q) * Math.max(0.7, _k);
  blit(ctx, SPX.bit(BITS.zap, ((rt * 24) | 0) % 3), S, h[0], h[1] - 3 * _k, s, s, rt * 6);
};

OVER.bombs = function bombsOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || bag.lit !== 1 || !spx() || !BITS) return;
  rigOf(u);
  const rt = nowRT(), h = hand(X, Y, flip, S, 0);
  blit(ctx, SPX.bit(BITS.fuse, ((rt * 20) | 0) & 1), S, h[0] + flip * 2 * _k, h[1] - 6 * _k, 0.8 * Math.max(0.7, _k), 0.8 * Math.max(0.7, _k), rt * 9);
};

OVER.bubble = function bubbleOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || !(bag.victim >= 0) || !world || !world.unitById || !spx() || !BITS) return;
  const v = world.unitById(bag.victim);
  if (!v || v.dead || !(v.hp > 0)) return;
  rigOf(u);
  const rt = nowRT(), h = hand(X, Y, flip, S, T.castLift);
  const x1 = v.x, y1 = v.y - Math.max(0, v.z || 0) - (v.radius || 8) * 1.2;
  const dx = x1 - h[0], dy = y1 - h[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
  blit(ctx, SPX.bit(BITS.ribbon, ((rt * 10) | 0) % 3), S, h[0], h[1], len / 100, 0.8, Math.atan2(dy, dx));
};

OVER.shuriken = function shurikenOver(ctx, u, bag, X, Y, flip, S, now) {
  if (!bag || bag.dashing !== 1 || !spx() || !BITS) return;
  rigOf(u);
  const sp = Math.hypot(u.vx || 0, u.vy || 0);
  if (sp < 1) return;
  const r = u.radius || 9.9;
  blit(ctx, SPX.bit(BITS.streak, ((nowRT() * 20) | 0) & 1), S, X / S - (u.vx / sp) * r * 0.6, Y / S - r * 1.1, Math.max(0.7, r / 10), Math.max(0.7, r / 10), Math.atan2(u.vy, u.vx));
};
