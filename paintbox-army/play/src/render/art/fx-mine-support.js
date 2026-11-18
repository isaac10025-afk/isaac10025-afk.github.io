// Unit maker effect art for the A-SUPPORT abilities (OURS, Part 2 step 8, STEP8.md). Owner: A-SUPPORT. POSTER PAINT.
//  - PROJ.minedome: the made unit's dome (effect projectile 'minedome', sim/maker/abilities/support-aura.js): the shield
//    bot's painted glass dome (sprites-robots.js PROJ.dome paint, read only), radius p.r, cracks as p.k drops, a white
//    flash for 0.18 s after a block (p.hitT = s since it).
//  - OVER[id](ctx, u, bag, X, Y, flip, S, now, world): per-frame extras the body's over() calls (mine-hooks.js). ctx at the
//    identity transform, (X, Y) = the unit's anchor in DEVICE px (feet, raised by z), S = device px per sim px, now =
//    world time, bag = the ability's bag (fields: support.js header):
//      heal     green crosses flowing from its hands to the patient + a halo at the patient's feet (bag.healing, patient)
//      raise    the cast: a dashed green ring on the ground (its reach) + ghost wisps rising off the bodies (castT / castEnd, sx, sy, r)
//      spikes   a ring of bone spikes round the body while puffed (puffed, puffT: they pop out)
//      rebirth  a burning egg round it while down (down, crack 0..1), then a flame ring as it rises (hatchT)
//      dodge    speed streaks behind the sidestep (dodgeT; direction u.dodgeX / dodgeY)
//      rally    shout strokes over its head (shoutT)
//    dome = the projectile; scare, bees, crows, armour, shield, shell, split: nothing extra (gear + poses are the body art's,
//    bees / crows / skeletons are units, bounces and blocks are the game's sparks).
// Effect bits come from sprites.js defineBit; sprites.js imports this module, so it is loaded lazily on first use (as
// sprites-robots.js does).
import { OVER } from './mine-hooks.js';
import { C, TAU, clamp, brush, dab, fill, outline, poly } from './paint.js';
import { PROJ as ROBOT_PROJ } from './sprites-robots.js';

const GREEN = '#46c95a', GREEN_L = '#9df27f', GHOST = '#8dffb0', BONE = '#fff1c9', FLAME = C.fireO;

// ---------------------------------------------------------------- bits (baked once, sprites.js defineBit)
let SPX = null, spxP = null, B = null;
function bits() {
  if (B) return B;
  if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; B = defineBits(m); }, () => { spxP = null; });
  return null;
}
function defineBits(m) {
  const noT = { tooth: false };
  return {
    // heal: a fat green cross with an ink edge and a shine
    plus: m.defineBit('ms:plus', 2, [18, 18, 9, 9], (c, R, v) => {
      const a = 2.3, b = 7;
      const P = [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]];
      fill(c, poly(P, R, 0.3), v ? GREEN_L : GREEN, R, { sharp: true, edge: 0 });
      outline(c, P, R, 1.25, { jit: 0.2 });
      dab(c, -1, -4.4, 1.1, '#f2fff0', R);
    }, noT),
    // heal: dashed green halo on the ground (base radius 12)
    halo: m.defineBit('ms:halo', 2, [34, 18, 17, 9], (c, R, v) => {
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * TAU + v * 0.3, P = [];
        for (let a = a0; a < a0 + 0.55; a += 0.08) P.push([Math.cos(a) * 13, Math.sin(a) * 6]);
        brush(c, P, 1.6, k & 1 ? GREEN_L : '#ffffff', R, { bristles: 2, dry: 0.2, taper: 0.4 });
      }
    }, noT),
    // raise: a green ghost wisp, round head at the bottom, tail up, two ink eyes
    wisp: m.defineBit('ms:wisp', 3, [18, 32, 9, 27], (c, R, v) => {
      const s = v - 1, P = [[0 + s * 2, -25], [2.4, -17], [5.4, -9], [5.2, -2.5], [0, 2], [-5.2, -2.5], [-5.4, -9], [-2.6 + s, -16]];
      fill(c, poly(P, R, 0.35), GHOST, R, { edge: 0, vary: 0.08 });
      fill(c, poly([[0, -12], [3, -6], [2.8, -1.5], [0, 0.5], [-2.8, -1.5], [-3, -6]], R, 0.25), '#e4ffe9', R, { edge: 0 });
      outline(c, P, R, 1.05, { jit: 0.2 });
      dab(c, -1.8, -4.5, 0.9, C.ink, R); dab(c, 1.8, -4.5, 0.9, C.ink, R);
    }, noT),
    // spikes: a ring of bone spikes (inner radius 11, tips at 17)
    spikes: m.defineBit('ms:spikes', 2, [40, 40, 20, 20], (c, R, v) => {
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU + v * 0.2 + (R() - 0.5) * 0.08, w = 0.2, r0 = 10.5, r1 = 17 + (R() - 0.5) * 1.6;
        const P = [[Math.cos(a - w) * r0, Math.sin(a - w) * r0], [Math.cos(a) * r1, Math.sin(a) * r1], [Math.cos(a + w) * r0, Math.sin(a + w) * r0]];
        fill(c, P, BONE, R, { sharp: true, edge: 0 });
        outline(c, P, R, 0.85, { jit: 0.12, over: 0 });
      }
    }, noT),
    // rebirth: the burning egg, cracking with v (0 whole .. 3 nearly open); anchor at its bottom middle, 14 x 38 base
    egg: m.defineBit('ms:egg', 4, [36, 46, 18, 43], (c, R, v) => {
      const P = []; for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, k = Math.sin(a) < 0 ? 1 : 0.86; P.push([Math.cos(a) * 13.5 * (Math.sin(a) < 0 ? 0.92 : 1), -19 - Math.sin(a) * 19 * k]); }
      fill(c, poly(P, R, 0.3), C.fireR, R, { vary: 0.08 });
      fill(c, poly([[-7, -9], [-3, -22], [2, -30], [6, -20], [8, -8], [0, -3]], R, 0.4), FLAME, R, { edge: 0 });
      fill(c, poly([[-3, -10], [0, -21], [3.5, -12], [1, -6]], R, 0.3), C.fireY, R, { edge: 0 });
      outline(c, P, R, 1.5, { jit: 0.25 });
      for (let n = 0; n < [0, 2, 4, 7][v]; n++) {   // cracks running in from the shell edge
        const a = Math.PI + 0.3 + (n / 7) * 2.6 + (R() - 0.5) * 0.3, Q = [[Math.cos(a) * 12.5, -19 - Math.sin(a) * 18]];
        let x = Q[0][0], y = Q[0][1];
        for (let s = 0; s < 3; s++) { x += -Math.cos(a) * 3.2 + (R() - 0.5) * 3; y += Math.sin(a) * 3 + (R() - 0.5) * 3; Q.push([x, y]); }
        brush(c, Q, 1.3, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.5, per: 2 });
        brush(c, Q, 0.55, C.fireY, R, { bristles: 1, dry: 0.1, taper: 0.5, per: 2 });
      }
      dab(c, -5.5, -27, 1.6, '#ffe9c0', R);
    }, noT),
    // rebirth: a flame lick (flickers between 3)
    flame: m.defineBit('ms:flame', 3, [14, 22, 7, 20], (c, R, v) => {
      const s = (v - 1) * 1.5, P = [[0 + s, -19], [3, -11], [5, -4], [3, 0.5], [-3, 0.5], [-5, -4], [-3, -11]];
      fill(c, poly(P, R, 0.4), FLAME, R, { edge: 0 });
      fill(c, poly([[0 + s * 0.5, -11], [2, -5], [1.5, -0.5], [-1.5, -0.5], [-2, -5]], R, 0.3), C.fireY, R, { edge: 0 });
      outline(c, P, R, 0.9, { jit: 0.2 });
    }, noT),
    // rebirth: the hatch burst, a ring of flame petals (base radius 22)
    burst: m.defineBit('ms:burst', 2, [64, 40, 32, 20], (c, R, v) => {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU + v * 0.25, x = Math.cos(a) * 22, y = Math.sin(a) * 11;
        const P = [[x - Math.sin(a) * 3, y + Math.cos(a) * 1.5], [x + Math.cos(a) * 8, y + Math.sin(a) * 4 - 3], [x + Math.sin(a) * 3, y - Math.cos(a) * 1.5]];
        fill(c, P, i & 1 ? C.fireY : FLAME, R, { sharp: true, edge: 0 });
        outline(c, P, R, 0.8, { jit: 0.15, over: 0 });
      }
    }, noT),
    // dodge: a white speed streak (along +x, 20 long)
    streak: m.defineBit('ms:streak', 2, [24, 8, 2, 4], (c, R) => {
      brush(c, [[0, 0], [7, -0.4], [14, 0.2], [20, 0]], 2.6, C.ink, R, { bristles: 2, dry: 0.1, taper: 0.9 });
      brush(c, [[0, 0], [7, -0.4], [14, 0.2], [20, 0]], 1.7, '#ffffff', R, { bristles: 2, dry: 0.2, taper: 0.9 });
    }, noT),
    // rally: three bold shout strokes fanning up
    shout: m.defineBit('ms:shout', 2, [30, 18, 15, 16], (c, R, v) => {
      for (let i = -1; i <= 1; i++) {
        const a = -Math.PI / 2 + i * 0.62 + (v ? 0.06 : -0.04), P = [[Math.cos(a) * 4, Math.sin(a) * 4], [Math.cos(a) * 12, Math.sin(a) * 12]];
        brush(c, P, 3.6, C.ink, R, { bristles: 3, dry: 0.05, taper: 0.3 });
        brush(c, P, 2.4, C.yellow, R, { bristles: 3, dry: 0.1, taper: 0.3 });
      }
    }, noT),
  };
}
/** Draw a bit with its anchor at (x, y) sim px, x / y scale, turned by ang (device = sim × S, ctx at identity). */
function blit(ctx, spr, S, x, y, sx, sy, ang) {
  if (!spr) return;
  const m = S / spr.k, cs = Math.cos(ang), sn = Math.sin(ang);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
const nowRT = () => performance.now() / 1000;
const done = (ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);

// ---------------------------------------------------------------- dome (projectile)
const RD = ROBOT_PROJ && ROBOT_PROJ.dome;
export const PROJ = RD ? {
  minedome: {
    box: RD.box, n: RD.n, paint: RD.paint,
    // the shield bot's draw, flash from the sim's p.hitT (s since the last block: no robot on the field needed)
    draw(p, x, y, ang, rt, i, api) {
      const r = p.r > 0 ? p.r : 70, sc = r / 70, k = p.k >= 0 ? p.k : 1, ctx = api.ctx;
      const ht = p.hitT >= 0 ? p.hitT : 9, fl = ht < 0.18 ? 1 - ht / 0.18 : 0;
      const a0 = ctx.globalAlpha, wob = 1 + 0.012 * Math.sin(rt * 4.3 + i) + 0.04 * fl;
      ctx.globalAlpha = a0 * (0.2 + 0.3 * fl);
      api.put(api.bit(api.sprite, 0), x, y, sc * wob, 0);
      ctx.globalAlpha = a0 * 0.82;
      api.put(api.bit(api.sprite, k > 0.66 ? 1 : k > 0.33 ? 2 : 3), x, y, sc * wob, 0);
      if (fl > 0) { ctx.globalAlpha = a0 * fl; api.put(api.bit(api.sprite, 4), x, y, sc * wob, 0); }
      ctx.globalAlpha = a0;
      return true;
    },
  },
} : {};

// ---------------------------------------------------------------- per-frame extras
OVER.heal = function healOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || bag.healing !== 1 || !world || !world.unitById || !bits()) return;
  const p = bag.patient >= 0 ? world.unitById(bag.patient) : null;
  if (!p || p.dead) return;
  const rt = nowRT(), r = u.radius || 9.9;
  const x0 = X / S + flip * r * 0.9, y0 = Y / S - r * 1.1;   // its hands
  const x1 = p.x, y1 = p.y - (p.z || 0) - (p.radius || 9.9) * 1.1;
  const pr = (p.radius || 9.9) / 12, pul = 1 + 0.08 * Math.sin(rt * 7);
  blit(ctx, SPX.bit(B.halo, ((rt * 6) | 0) & 1), S, p.x, p.y, pr * pul * 1.2, pr * pul * 1.2, 0);
  for (let i = 0; i < 4; i++) {
    const q = (rt * 1.5 + i / 4) % 1, s = 0.5 + 0.3 * Math.sin(q * Math.PI);
    blit(ctx, SPX.bit(B.plus, i & 1), S, x0 + (x1 - x0) * q, y0 + (y1 - y0) * q - Math.sin(q * Math.PI) * 12, s, s, 0);
  }
  done(ctx);
};
OVER.raise = function raiseOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || !(bag.castEnd > now) || !bits()) return;
  const rt = nowRT(), q = clamp((now - bag.castT) / Math.max(0.01, bag.castEnd - bag.castT), 0, 1), r = u.radius || 9.9;
  const gx = X / S, gy = Y / S + (u.z || 0), rr = (bag.r || 120) * (0.6 + 0.4 * q);
  // its reach: a dashed ring on the ground, drawn as strokes (a baked bit would thicken with the radius)
  // (separate arcs, no setLineDash: the WebGL canvas, render/gl2d.js, has none)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineCap = 'round';
  const n = 14, a0 = rt * 0.5;
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = (pass === 0 ? 3.4 : 2) * S; ctx.strokeStyle = pass === 0 ? C.ink : GHOST;
    for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU; ctx.beginPath(); ctx.ellipse(gx * S, gy * S, rr * S, rr * 0.46 * S, 0, a, a + TAU / n * 0.55); ctx.stroke(); }
  }
  for (let i = 0; i < 5; i++) {   // wisps rising off the bodies
    const t = (rt * 0.9 + i / 5) % 1, s = 1.3 * (0.55 + 0.45 * q) * (1 - 0.45 * t);
    const x = bag.sx + Math.sin(i * 2.3 + rt * 2) * (bag.r || 120) * 0.22, y = bag.sy + Math.cos(i * 1.7) * 10 - t * 34;
    blit(ctx, SPX.bit(B.wisp, (i + ((rt * 4) | 0)) % 3), S, x, y, s, s, Math.sin(rt * 3 + i) * 0.15);
  }
  const h = 0.4 + 0.2 * Math.sin(rt * 9);
  blit(ctx, SPX.bit(B.wisp, ((rt * 6) | 0) % 3), S, gx + flip * r * 0.8, Y / S - r * 1.6, h, h, 0);   // glow at its hands
  done(ctx);
};
OVER.spikes = function spikesOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || bag.puffed !== 1 || !bits()) return;
  const rt = nowRT(), r = u.radius || 9.9, pop = clamp((now - bag.puffT) / 0.15, 0, 1);
  const quad = !!(u.def.maker && (u.def.maker.body === 'animal' || u.def.maker.body === 'beast'));   // four legs: lower, wider middle
  const s = r / 11 * (0.7 + 0.45 * pop) * (1 + 0.03 * Math.sin(rt * 11 + (u.id || 0)));
  blit(ctx, SPX.bit(B.spikes, (u.id || 0) & 1), S, X / S, Y / S - r * (quad ? 0.75 : 1.05), s * (quad ? 1.15 : 1), s * (quad ? 0.9 : 1), 0);
  done(ctx);
};
OVER.rebirth = function rebirthOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || !bits()) return;
  const rt = nowRT(), r = u.radius || 9.9, k = r / 9.9, gx = X / S, gy = Y / S + (u.z || 0);
  if (bag.down === 1) {
    const c = bag.crack || 0, v = c < 0.25 ? 0 : c < 0.5 ? 1 : c < 0.8 ? 2 : 3;
    const rock = Math.sin(rt * (6 + 10 * c)) * 0.05 * (0.3 + c);
    for (let i = 0; i < 3; i++) blit(ctx, SPX.bit(B.flame, (i + ((rt * 10) | 0)) % 3), S, gx + (i - 1) * 9 * k, gy + 1, 0.8 * k, (0.8 + 0.25 * Math.sin(rt * 13 + i)) * k, (i - 1) * 0.35);
    blit(ctx, SPX.bit(B.egg, v), S, gx, gy, k * 1.05, k * 1.05, rock);
    done(ctx);
    return;
  }
  const h = now - (bag.hatchT ?? -9);
  if (h >= 0 && h < 0.6) {
    const q = h / 0.6, s = k * (0.7 + 1.1 * q);
    blit(ctx, SPX.bit(B.burst, ((rt * 12) | 0) & 1), S, gx, gy - r * 0.8, s, s, q * 0.8);
    done(ctx);
  }
};
OVER.dodge = function dodgeOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || !(now - bag.dodgeT < 0.25) || !(now >= bag.dodgeT) || !bits()) return;
  const q = (now - bag.dodgeT) / 0.25, r = u.radius || 9.9, k = r / 9.9;
  const a = Math.atan2(u.dodgeY || 0, u.dodgeX || 1), cs = Math.cos(a), sn = Math.sin(a);
  for (let i = 0; i < 3; i++) {
    const back = (10 + i * 4) * k, up = r * (0.5 + i * 0.55);
    blit(ctx, SPX.bit(B.streak, i & 1), S, X / S - cs * back, Y / S - up - sn * back * 0.5, (1 - q) * k, k * 0.8, a + Math.PI);
  }
  done(ctx);
};
OVER.rally = function rallyOver(ctx, u, bag, X, Y, flip, S, now, world) {
  if (!bag || !(now - bag.shoutT < 1) || !(now >= bag.shoutT) || !bits()) return;
  const rt = nowRT(), r = u.radius || 9.9, k = r / 9.9, q = (now - bag.shoutT) / 1;
  const s = k * (0.85 + 0.25 * Math.sin(rt * 16)) * (q < 0.15 ? q / 0.15 : 1);
  blit(ctx, SPX.bit(B.shout, ((rt * 8) | 0) & 1), S, X / S, Y / S - r * 2.5, s, s, 0);
  done(ctx);
};
