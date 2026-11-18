// Unit maker effect art (OURS, Part 2 step 8, STEP8.md). Owner: A-ACT2. POSTER PAINT.
// OVER[id](ctx, u, bag, X, Y, flip, S, now, world): per-frame extras for the A-ACT2 abilities, called by the made body's
// over() (device px, identity transform; X, Y = the unit's feet raised by its z; bag = u.b.ab[slot]; now = world time).
// Bits are baked once through sprites.js defineBit (loaded lazily: sprites.js imports this module), never painted per frame.
// Bag fields read: see the header of sim/maker/abilities/act2.js.
//  - bomb      fuse lit (bag.armed): the bomb bot's red beacon over the head, flashing with each beep (bag.beepT).
//  - magnet    charging (bag.phase 1): sparks crackle round the head; pulling (2): the magnet bot's field rings on the
//              ground shrinking from bag.pullR into the unit.
//  - mind      channelling (bag.phase 1): pink psychic ripples rolling from the head to the mark (bag.mark). The swirl over
//              the mark / thrall is the projectile 'mindmine' = the mind alien's own 'mind' art (PROJ below).
//  - grabfour  holding (bag.holding): an octopus tentacle from its middle to each held unit (bag.v0..v3), a loop round each.
//  - drink     latched (bag.latched): a red sipping tube from its mouth into the host (bag.host), drops running up it.
//  - shock     0.45 s after a shock (bag.shockT): blue-white arcs crackling out of the body (the arcs to each victim are
//              the 'bolt' events: fx.js, as for the eel).
//  - curse     winding up (bag.phase 1): green sparkles spinning in the front hand, bigger as the cast nears (bag.t).
//  ink / stink / smoke: their clouds are the octopus's 'ink', the stink bug's 'gas' and the game's steam (already drawn).
import { OVER, MINE } from './mine-hooks.js';
import { C, TAU, brush, ring, dab, spark, fill, outline } from './paint.js';

// the mind alien's swirl art for our own 'mindmine' effect kind (sim: act2.js); its module failing just leaves it out
let SPACE = {};
try { SPACE = (await import('./sprites-space.js')).PROJ || {}; } catch (e) { SPACE = {}; }
export const PROJ = {};
if (SPACE.mind) PROJ.mindmine = SPACE.mind;

const OCTO = '#9b4fc8', OCTO_L = '#c88ae8', SUCKER = '#f6d6ee';   // the octopus's own colours (sprites-ocean.js)
const CYAN = '#7fe6ff', PSY = '#ff7ad9', PSY_D = '#b45cff', HEX = '#7dff6a';
// body points in sprite px (feet at 0,0, facing right), copied from sprites-mine.js J_* tables: head centre, mouth, front
// hand, chest (tentacle root), head top; sc = the body's sprite scale (sprites-mine.js BODY[...].scale)
const PTS = {
  person: { head: [0.5, -22.9], mouth: [4.6, -19.2], hand: [8.2, -16.6], chest: [0.5, -13], top: [3.4, -27.9], sc: 9.9 / 9.49 },
  giant: { head: [4.6, -44.6], mouth: [10.6, -40.2], hand: [20, -35], chest: [2, -27], top: [9, -51.6], sc: 1.3 },
  animal: { head: [11.2, -14.8], mouth: [17.4, -12.6], hand: [17.4, -12.6], chest: [3, -11], top: [12, -19.4], sc: 13.2 / 14.78 },
  beast: { head: [16.6, -19.4], mouth: [26.6, -14.4], hand: [26.6, -14.4], chest: [2, -16], top: [17.4, -25.4], sc: 18.7 / 17.6 },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rtNow = () => performance.now() / 1000;
/** sprite px -> sim px for this unit (sprites-mine.js scale x size x index.js radius factor) + its body's points. */
function bodyOf(u) {
  const m = u.def && u.def.maker, P = (m && PTS[m.body]) || PTS.person, s = m ? m.size : 1, r0 = u.def && u.def.radius > 0 ? u.def.radius : u.radius;
  _B.P = P; _B.k = P.sc * s * clamp((u.radius || r0) / r0, 0.35, 1.7);
  // STEP8 (lead): ART-BODY's live points (MINE.anchor, sim px, this frame's rig pose) in place of the copied table (the
  // chest stays from it); k stays the size factor the effects scale by, so the points are stored / k.
  if (MINE.anchor && _B.k > 0 && MINE.anchor(u, 'head', _L.head)) {
    MINE.anchor(u, 'mouth', _L.mouth); MINE.anchor(u, 'hand', _L.hand); MINE.anchor(u, 'headTop', _L.top);
    const ik = 1 / _B.k;
    for (const q of _LQ) { q[0] *= ik; q[1] *= ik; }
    _L.chest[0] = P.chest[0]; _L.chest[1] = P.chest[1];
    _B.P = _L;
  }
  return _B;
}
const _L = { head: [0, 0], mouth: [0, 0], hand: [0, 0], chest: [0, 0], top: [0, 0] }, _LQ = [_L.head, _L.mouth, _L.hand, _L.top];
const _B = { P: PTS.person, k: 1 };
const px = (X, S, flip, k, pt) => X / S + flip * pt[0] * k;
const py = (Y, S, k, pt) => Y / S + pt[1] * k;

// ---------------------------------------------------------------- bits (sprites.js defineBit, lazily)
let SPX = null, spxP = null, BITS = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function defineBits(m) {
  const noT = { tooth: false };
  return {
    // the bomb bot's beacon glow (sprites-robots.js rb:glow): red rays, red dab, yellow core
    glow: m.defineBit('a2:glow', 2, [20, 20, 10, 10], (c, R) => {
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + R() * 0.3; brush(c, [[Math.cos(a) * 3.4, Math.sin(a) * 3.4], [Math.cos(a) * 7.6, Math.sin(a) * 7.6]], 1.1, i & 1 ? C.fireO : '#ff3018', R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
      dab(c, 0, 0, 3.6, C.ink, R); dab(c, 0, 0, 2.8, '#ff3018', R); dab(c, 0, 0, 1.4, C.yellow, R);
    }, noT),
    // the beacon dome itself when it is dark between beeps (a small red cap with an ink rim)
    cap: m.defineBit('a2:cap', 1, [10, 8, 5, 6], (c, R) => {
      const P = [[-3.4, 0], [-3, -2.6], [-1.4, -4], [1.4, -4], [3, -2.6], [3.4, 0]];
      fill(c, P, '#a3121a', R, { edge: 0 }); outline(c, P, R, 0.8, { jit: 0.1 });
      dab(c, -1, -2.6, 0.8, '#ff8a80', R);
    }, noT),
    // one dash of the magnet field ring (the magnet bot's rb:field look, sprites-robots.js), 9 px along +x, bent a little;
    // placed round the ring one by one so it stays crisp at any radius (a 260-585 px field)
    dash: m.defineBit('a2:dash', 2, [14, 6, 7, 3], (c, R, v) => {
      const P = []; for (let i = 0; i <= 4; i++) { const t = i / 4; P.push([-4.5 + 9 * t, 0.9 * (t - 0.5) * (t - 0.5) * 4 - 0.9]); }
      brush(c, P, 2.2, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.45 });
      brush(c, P, 1.25, v ? '#bfe8ff' : '#ffffff', R, { bristles: 2, dry: 0.25, taper: 0.5 });
    }, noT),
    // a spark (magnet crackle, shock sparks)
    spk: m.defineBit('a2:spk', 2, [12, 12, 6, 6], (c, R) => spark(c, 0, 0, 3, R), noT),
    // a short jagged arc along +x, 20 px (shock crackle)
    arc: m.defineBit('a2:arc', 3, [24, 12, 1, 6], (c, R) => {
      const P = [[0, 0]]; for (let i = 1; i < 5; i++) P.push([i * 4.5, (R() - 0.5) * 6]); P.push([20, 0]);
      brush(c, P, 2.6, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.4, per: 2 });
      brush(c, P, 1.6, CYAN, R, { bristles: 2, dry: 0.05, taper: 0.4, per: 2 });
      brush(c, P, 0.6, '#ffffff', R, { bristles: 1, dry: 0.1, taper: 0.4, per: 2 });
    }, noT),
    // one psychic ripple: three arcs fanned round +x, radius ~8 (rolled out and scaled up along the line)
    ripple: m.defineBit('a2:ripple', 3, [16, 26, 4, 13], (c, R) => {
      for (let i = 0; i < 3; i++) {
        const r = 4 + i * 3, P = [];
        for (let k = 0; k <= 6; k++) { const a = -0.8 + 1.6 * k / 6 + (R() - 0.5) * 0.05; P.push([Math.cos(a) * r - 2, Math.sin(a) * r]); }
        brush(c, P, 2.1, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.45 });
        brush(c, P, 1.1, i === 1 ? PSY_D : PSY, R, { bristles: 2, dry: 0.2, taper: 0.5 });
      }
    }, noT),
    // a tentacle piece along +x from 0 to 6 (no ink at the ends: pieces overlap into one), suckers under it (sprites-ocean r:tseg)
    tseg: m.defineBit('a2:tseg', 1, [10, 8, 1, 4], (c, R) => {
      brush(c, [[-0.5, 0], [6.5, 0]], 3, OCTO, R, { bristles: 3, dry: 0, taper: 0, vary: 0.1, swell: 0 });
      for (const y of [-1.9, 1.9]) brush(c, [[-0.2, y], [6.2, y]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0, swell: 0 });
      brush(c, [[0.4, -0.7], [5.6, -0.7]], 0.6, OCTO_L, R, { bristles: 1, dry: 0.3, taper: 0, swell: 0 });
      dab(c, 1.6, 0.8, 0.5, SUCKER, R); dab(c, 4.6, 0.8, 0.5, SUCKER, R);
    }, noT),
    // the loop wrapped round a held unit's middle (sprites-ocean r:tcoil)
    tcoil: m.defineBit('a2:tcoil', 1, [16, 10, 8, 4], (c, R) => {
      const P = []; for (let i = 0; i <= 12; i++) { const a = 2.4 - i / 12 * 4.6; P.push([Math.cos(a) * 5.4, Math.sin(a) * 2.2 + i * 0.1]); }
      brush(c, P, 3.6, C.ink, R, { bristles: 3, dry: 0, taper: 0.5 });
      brush(c, P, 2.3, OCTO, R, { bristles: 3, dry: 0.1, taper: 0.55 });
      dab(c, -1.6, 2.6, 0.45, SUCKER, R); dab(c, 1.8, 2.4, 0.45, SUCKER, R);
    }, noT),
    // the sipping tube: a 10 px piece along +x, red inside a thin ink skin
    straw: m.defineBit('a2:straw', 1, [12, 6, 1, 3], (c, R) => {
      brush(c, [[-0.4, 0], [10.4, 0]], 2.3, C.ink, R, { bristles: 2, dry: 0, taper: 0, swell: 0 });
      brush(c, [[-0.4, 0], [10.4, 0]], 1.3, '#c8202a', R, { bristles: 2, dry: 0, taper: 0, swell: 0 });
    }, noT),
    // a blood drop running up the tube
    drop: m.defineBit('a2:drop', 2, [8, 8, 4, 4], (c, R) => { dab(c, 0, 0, 1.9, C.ink, R); dab(c, 0, 0, 1.3, C.blood, R); dab(c, -0.4, -0.5, 0.45, '#ff9b8f', R); }, noT),
    // a curse sparkle (4 points, green, ink edge)
    hex: m.defineBit('a2:hex', 3, [12, 12, 6, 6], (c, R, v) => {
      const P = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + v * 0.3, r = i & 1 ? 1.3 : 4.6; P.push([Math.cos(a) * r, Math.sin(a) * r]); }
      fill(c, P, v === 2 ? C.white : HEX, R, { sharp: true, edge: 0 }); outline(c, P, R, 0.7, { jit: 0.1 });
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
const ready = () => !!spx() && !!BITS;
const live = (world, id) => { if (!(id >= 0) || !world || typeof world.unitById !== 'function') return null; const v = world.unitById(id); return v && !v.dead ? v : null; };

// ---------------------------------------------------------------- bomb: the beacon, lit with each beep
OVER.bomb = (ctx, u, bag, X, Y, flip, S, now) => {
  if (bag.armed !== 1 || !ready()) return;
  const B = bodyOf(u), k = B.k, x = px(X, S, flip, k, B.P.top), y = py(Y, S, k, B.P.top);
  blit(ctx, SPX.bit(BITS.cap, 0), S, x, y + 1.6 * k, k, k, 0);
  if (now - bag.beepT > 0.09) return;   // dark between beeps (the sim beeps faster as it closes in)
  blit(ctx, SPX.bit(BITS.glow, ((rtNow() * 8) | 0) & 1), S, x, y - 1.2 * k, 1.1 * k, 1.1 * k, 0);
};

// ---------------------------------------------------------------- magnet: crackle while charging, field rings while pulling
OVER.magnet = (ctx, u, bag, X, Y, flip, S, now) => {
  if (bag.phase !== 1 && bag.phase !== 2) return;
  if (!ready()) return;
  const rt = rtNow(), B = bodyOf(u), k = B.k;
  if (bag.phase === 1) {   // charging: 4 sparks circling the head, faster as the charge fills
    const q = clamp((now - bag.t0) / 1, 0, 1), hx = px(X, S, flip, k, B.P.head), hy = py(Y, S, k, B.P.head);
    for (let i = 0; i < 4; i++) {
      const a = rt * (5 + 7 * q) + i * TAU / 4, r = (7 + 3 * Math.sin(rt * 9 + i)) * k;
      blit(ctx, SPX.bit(BITS.spk, (i + ((rt * 12) | 0)) & 1), S, hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.7, (0.75 + 0.6 * q) * k, (0.75 + 0.6 * q) * k, rt * 6 + i);
    }
    return;
  }
  // pulling: 3 dashed field rings on the ground shrinking from pullR into the unit (flattened 0.46: the ground seen at 3/4)
  const R0 = bag.pullR > 0 ? bag.pullR : 260, gx = X / S, gy = Y / S + (u.z || 0), a0 = ctx.globalAlpha, ds = Math.max(0.9, Math.min(1.6, k));
  for (let i = 0; i < 3; i++) {
    const q = (rt * 0.7 + i / 3 + (u.id % 5) * 0.11) % 1, r = R0 * (1 - q) + 14 * q, al = q < 0.2 ? q / 0.2 : q > 0.85 ? (1 - q) / 0.15 : 1;
    const n = Math.max(8, Math.min(40, Math.round(r / 13))), sp = rt * 0.6 * (i & 1 ? 1 : -1);
    ctx.globalAlpha = a0 * al;
    for (let j = 0; j < n; j++) {
      const a = j / n * TAU + sp, ca = Math.cos(a), sa = Math.sin(a);
      blit(ctx, SPX.bit(BITS.dash, j & 1), S, gx + ca * r, gy + sa * r * 0.46, ds, ds, Math.atan2(ca * 0.46, -sa));
    }
  }
  ctx.globalAlpha = a0;
};

// ---------------------------------------------------------------- mind: ripples rolling from the head to the mark
OVER.mind = (ctx, u, bag, X, Y, flip, S, now, world) => {
  if (bag.phase !== 1) return;
  const v = live(world, bag.mark);
  if (!v || !ready()) return;
  const rt = rtNow(), B = bodyOf(u), k = B.k, x0 = px(X, S, flip, k, B.P.head), y0 = py(Y, S, k, B.P.head);
  const x1 = v.x, y1 = v.y - (v.z || 0) - (v.radius || 9) * 2, dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy) || 1, ang = Math.atan2(dy, dx);
  const q = clamp((now - bag.t0) / 2, 0, 1);
  for (let i = 0; i < 4; i++) {
    const f = (rt * (0.8 + 0.8 * q) + i / 4) % 1, s = (0.55 + 0.9 * f) * Math.max(0.8, Math.min(1.6, k));
    blit(ctx, SPX.bit(BITS.ripple, (i + ((rt * 8) | 0)) % 3), S, x0 + dx * f, y0 + dy * f, s, s, ang);
  }
};

// ---------------------------------------------------------------- grab four: a tentacle to each held unit
const TSEG = 6;   // tseg length (sprite px)
function tentacleTo(ctx, S, x0, y0, vic, rt, i, k) {
  const vr = vic.radius || 8, vx = vic.x, vy = vic.y - (vic.z || 0) - vr * 1.05;
  const dx = vx - x0, dy = vy - y0, d = Math.sqrt(dx * dx + dy * dy);
  if (!(d > 2) || d > 260) return;
  const seg = SPX.bit(BITS.tseg, 0), coil = SPX.bit(BITS.tcoil, 0);
  const nx = -dy / d, ny = dx / d, bend = (i & 1 ? 1 : -1) * Math.min(18, d * 0.3);
  const cx = (x0 + vx) / 2 + nx * bend, cy = (y0 + vy) / 2 + ny * bend - d * 0.12;
  const n = Math.max(3, Math.min(24, Math.round(d / 4.2))), th = Math.max(0.8, Math.min(1.8, k));
  let qx0 = x0, qy0 = y0;
  if (seg) for (let j = 1; j <= n; j++) {
    const t = j / n, it = 1 - t, wv = Math.sin(rt * 6 + i * 1.7 + t * 5) * 1.4 * Math.sin(t * Math.PI);
    const qx = it * it * x0 + 2 * it * t * cx + t * t * vx + nx * wv, qy = it * it * y0 + 2 * it * t * cy + t * t * vy + ny * wv;
    const ex = qx - qx0, ey = qy - qy0, l = Math.sqrt(ex * ex + ey * ey) || 1;
    const ux = ex / l, uy = ey / l, sx = (l * 1.25) / TSEG, sy = th * (1.2 - 0.55 * t), m = S / seg.k;
    ctx.setTransform(ux * sx * m, uy * sx * m, -uy * sy * m, ux * sy * m, (qx0 - ux * l * 0.1) * S, (qy0 - uy * l * 0.1) * S);
    ctx.drawImage(seg.img, seg.sx, seg.sy, seg.sw, seg.sh, -seg.ax, -seg.ay, seg.sw, seg.sh);
    qx0 = qx; qy0 = qy;
  }
  if (coil) { const m = S / coil.k * Math.max(0.55, Math.min(1.6, vr / 9)); ctx.setTransform(m, 0, 0, m, vx * S, vy * S); ctx.drawImage(coil.img, coil.sx, coil.sy, coil.sw, coil.sh, -coil.ax, -coil.ay, coil.sw, coil.sh); }
}
OVER.grabfour = (ctx, u, bag, X, Y, flip, S, now, world) => {
  if (bag.holding !== 1 || !ready()) return;
  const rt = rtNow(), B = bodyOf(u), k = B.k, x0 = px(X, S, flip, k, B.P.chest), y0 = py(Y, S, k, B.P.chest);
  for (let i = 0; i < 4; i++) {
    const v = live(world, i === 0 ? bag.v0 : i === 1 ? bag.v1 : i === 2 ? bag.v2 : bag.v3);
    if (v && v !== u) tentacleTo(ctx, S, x0, y0, v, rt, i, k);
  }
};

// ---------------------------------------------------------------- drink: the sipping tube into the host, drops running up
OVER.drink = (ctx, u, bag, X, Y, flip, S, now, world) => {
  if (bag.latched !== 1 || !ready()) return;
  const h = live(world, bag.host);
  if (!h) return;
  const rt = rtNow(), B = bodyOf(u), k = B.k, x0 = px(X, S, flip, k, B.P.mouth), y0 = py(Y, S, k, B.P.mouth);
  const x1 = h.x, y1 = h.y - (h.z || 0) - (h.radius || 9) * 1.2, dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy) || 1;
  if (d > 120) return;
  const ang = Math.atan2(dy, dx), th = Math.max(0.8, Math.min(1.6, k));
  blit(ctx, SPX.bit(BITS.straw, 0), S, x0, y0, d / 10, th, ang);
  for (let i = 0; i < 3; i++) {   // drops run from the host up into it
    const f = 1 - ((rt * 1.6 + i / 3 + (u.id % 7) * 0.09) % 1);
    blit(ctx, SPX.bit(BITS.drop, i & 1), S, x0 + dx * f, y0 + dy * f, 0.7 * th, 0.7 * th, 0);
  }
};

// ---------------------------------------------------------------- shock: arcs crackling out of the body
OVER.shock = (ctx, u, bag, X, Y, flip, S, now) => {
  const age = now - bag.shockT;
  if (!(age >= 0 && age < 0.45) || !ready()) return;
  const rt = rtNow(), B = bodyOf(u), k = B.k, cx = px(X, S, flip, k, B.P.chest), cy = py(Y, S, k, B.P.chest), fade = 1 - age / 0.45;
  const n = 7, ph = ((rt * 20) | 0);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + ph * 0.7 + Math.sin(i * 3.1) * 0.4, r0 = 4 * k, len = (0.6 + 0.6 * fade) * Math.max(0.9, k);
    blit(ctx, SPX.bit(BITS.arc, (i + ph) % 3), S, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8, len, Math.max(0.8, k * 0.8), a);
  }
  blit(ctx, SPX.bit(BITS.spk, ph & 1), S, cx, cy, 1.2 * k * fade + 0.4, 1.2 * k * fade + 0.4, rt * 7);
};

// ---------------------------------------------------------------- curse: green sparkles spinning in the front hand
OVER.curse = (ctx, u, bag, X, Y, flip, S, now) => {
  if (bag.phase !== 1 || !ready()) return;
  const rt = rtNow(), B = bodyOf(u), k = B.k, hx = px(X, S, flip, k, B.P.hand), hy = py(Y, S, k, B.P.hand);
  const q = clamp(1 - (bag.t - now) / 0.6, 0, 1), s = (0.5 + 0.7 * q) * Math.max(0.8, Math.min(1.6, k));
  for (let i = 0; i < 5; i++) {
    const a = rt * (4 + 6 * q) + i * TAU / 5, r = (3 + 5 * q) * k;
    blit(ctx, SPX.bit(BITS.hex, i === 0 ? 2 : i % 2), S, hx + Math.cos(a) * r, hy - 3 * k + Math.sin(a) * r * 0.7, s, s, rt * 3 + i);
  }
};
