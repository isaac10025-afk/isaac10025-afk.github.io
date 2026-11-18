// ROBOTS tab sprites (OURS, Part 2 step 6, STEP6.md). Owner: ROBOTS-ART. Contract: ART.md + RIG.md + STEP6.md (+ PROJ in sprites.js).
// POSTER PAINT: a 7-year-old's tempera robots. Steel-grey tin bodies with wobbly ink outlines and misregistered fills,
// hazard-orange bands with ink stripes, ONE big lens eye each (bezel, pale glass, ink pupil, glint), rivets, kid antennas
// with a ball on top. Team colour = a big painted panel / band (FFA: hazard orange). Every entry paints ONE frame facing
// RIGHT, feet (ground middle) at (0, 0), up = -y. The drone's (0, 0) is the ground point under it (RENDER lifts it by u.z).
//
// Pose picking (pick(u, info), codes from STEP6.md u.b.act; RENDER does walk0 / walk1 / atk / idle otherwise):
//   drone      act 1 -> 'zap' (eye lit, zapper prong sparking); on the ground (u.z < 3, webbed) -> 'idle' (rotors still);
//              else 'fly0' / 'fly1' (rotor blur, swapped ~11 times a second by real time)
//   laserbot   act 2 -> 'beam' (eye blazing); act 1 -> 'charge' (eye glowing); atk = bonk (arm swung up)
//   sawbot     act 1 -> 'spin0' / 'spin1' (blade blurred + sparks, swapped by real time); atk = saw thrust
//   magnetbot  act 2 -> 'pull' (magnet raised overhead, coils glowing, crackling); act 1 -> 'charge' (coils glowing,
//              crackle, the body shudders); atk = magnet bonk
//   repairbot  act 1 -> 'weld' (visor down, torch flame + spark spray); atk = torch bonk
//   shieldbot  act 1 -> 'dome' (antenna emitter glowing); atk = zapper fork jab
//   bombbot    act 1 -> 'run0' / 'run1' (red beacon lit, running); no melee pose
//   mech       act 2 -> 'stomp' (near leg up); act 1 -> 'rockets' (pod lid open)
// Floppy bodies (rig-robots.js, one 'robot' driver, rig.mode legs / wheel / tread / fly / mech): parts 'r:leg' (or
// 'r:legN' + 'r:legF'), 'r:wheel', 'r:tread0' / 'r:tread1', 'r:body*', 'r:head*', 'r:top*' (antenna / beacon / emitter),
// 'r:hat', 'r:arm:<key>' (arm + what it holds), 'r:saw' / 'r:sawB' + 'r:sparks', 'r:pod' + 'r:lid', 'r:key', 'r:rotor*';
// dead only: 'r:scrap' (loose bolts, nuts, a gear) and 'r:smoke' (a puff off the heap for ~0.55 s). Whole poses are laid
// out by the same placement code (layout / layoutDead), so whole and rigged agree. Dead (lie 'none') = a scrap heap.
// Extra drawing per frame (entry over(), device px, after the body; bits baked once via sprites.js defineBit):
//   laserbot   charge: a flare growing on the eye; beam: the beam from the eye along b.beamA (world rad) for b.beamL px,
//              flickering, with an impact flare at its end (STEP6: the sim keeps beamA / beamL up to date in act 2)
//   drone      zap: a jagged spark line from the prong to b.victim (else u.target) for 0.16 s after b.actT
//   magnetbot  pull: field rings on the ground shrinking from b.pullR (px) into the bot
//   repairbot  weld, sawbot spin: little sparks flying off the torch / the blade
//   bombbot    act 1: a red glow on the beacon, blinking faster as its target gets closer (u.target)
// PROJ (fx.js default case): 'rocket' (mech salvo: white rocket, red nose, flame + a smoke trail, comes off the pod height
// and arcs), 'dome' (shieldbot effect projectile: a painted glass dome of radius p.r over the units, see-through; cracks as
// p.k (hp 0..1) drops; flashes for 0.18 s after p.hitAt (world time)).
import { C, TAU, tone, brush, ring, poly, fill, outline, part, dab, tube, spark, path, spline, shift } from './paint.js';
import { RB, POSE_CODE, layout, layoutDead } from './rig-robots.js';

// ---------------------------------------------------------------- our colours
const OWN = '#ff8a12';             // FFA panel colour = hazard orange (STEP6: steel grey + hazard orange)
const STEEL = '#b7bfc7', STEELL = '#d8dee4', STEELD = '#949da7', DARK = '#666b75', RUBBER = '#4b4d54', IRON = '#626771';
const HAZ = '#ff8a12', GLASS = '#a6ecff', GLASSD = '#3d5f70', COPPER = '#c8682a', BRASS = '#e3b13a', CREAM = '#fbf3dc';
const BLADE = '#e2e7eb', CYAN = '#7fe6ff', LASER = '#ff3420';

const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Paint look for one frame: dead = dented + X eye, burnt = all charcoal, team = the panel colour. */
function look(o) {
  const burnt = o.dead === 'burnt', B = (x, dark) => (burnt ? (dark ? C.char : C.charL) : x);
  return {
    o, R: o.R, M: o.M, burnt, dead: !!o.dead, team: burnt ? C.char : o.col,
    st: B(STEEL, 1), stl: B(STEELL, 1), std: B(STEELD, 1), dk: B(DARK, 1), haz: B(HAZ), rub: B(RUBBER, 1), iron: B(IRON, 1),
    copper: B(COPPER), brass: B(BRASS), blade: B(BLADE), B,
  };
}

// ---------------------------------------------------------------- painted bits
/** Points every ~step px along a closed polygon's edges (straight sides survive the paint spline). */
function sub(pts, step = 3) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
/** Rounded box corner points (clockwise from the top right). */
function rbox(x0, y0, x1, y1, r) {
  const pts = [], cs = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  for (const [cx, cy, a0] of cs) for (let k = 0; k <= 2; k++) { const a = a0 + k * Math.PI / 4; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
/** Half an ellipse standing on a flat bottom (domes): middle (cx, by), half-width rx, height h. */
function dome(cx, by, rx, h, n = 10) {
  const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI; pts.push([cx + Math.cos(a) * rx, by - Math.sin(a) * h]); }
  for (let i = 1; i < 4; i++) pts.push([cx - rx + (2 * rx) * i / 4, by]);
  return pts;
}
function plate(c, L, pts, col, o = {}) { part(c, poly(sub(pts, o.step || 3), L.R, o.j ?? 0.12), col, L.M, { lw: o.lw ?? 1.1, ang: o.ang, sp: o.sp }); }
/** A sloped bar from (x0,y0) to (x1,y1), w wide. */
function bar(c, L, x0, y0, x1, y1, w, col, lw = 1.2) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
  part(c, poly(sub([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], 2.4), L.R, 0.1), col, L.M, { sharp: true, lw, ang: Math.atan2(dy, dx), sp: 0.7 });
}
/** A band from y0 to y1 across the clip shape P: team colour (edge lines) or hazard (ink stripes). */
function bandIn(c, L, P, y0, y1, col, stripes) {
  const R = L.R;
  let x0 = 1e9, x1 = -1e9; for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; }
  c.save(); path(c, P); c.clip();
  fill(c, [[x0 - 1, y0], [x1 + 1, y0], [x1 + 1, y1], [x0 - 1, y1]], col, R, { sharp: true, edge: 0, vary: 0.08, ang: 0 });
  if (stripes && !L.burnt) { const h = y1 - y0; for (let x = x0 - h; x < x1 + 1; x += 3.3) brush(c, [[x, y1 + 0.3], [x + h * 0.9, y0 - 0.3]], 0.75, C.ink, R, { bristles: 2, dry: 0.15, taper: 0, swell: 0 }); }
  else if (!stripes) for (const y of [y0, y1]) brush(c, [[x0, y], [x1, y + (R() - 0.5) * 0.4]], 0.4, tone(col, -0.45), R, { bristles: 1, dry: 0.35, taper: 0 });
  c.restore();
}
/** A body shell: fill (misregistered) + bands clipped inside + its own ink outline. bands: [y0, y1, col, stripes]. */
function shell(c, L, pts, col, bands, o = {}) {
  const R = L.R, M = L.M, P = spline(shift(pts, M.mx, M.my, M.grow), true, 6);
  fill(c, P, col, R, { sharp: true, sp: o.sp, ang: o.ang });
  if (bands) for (const bd of bands) bandIn(c, L, P, bd[0], bd[1], bd[2], bd[3]);
  if (o.dent && L.dead && !L.burnt) dent(c, L, o.dent[0], o.dent[1], o.dent[2]);
  outline(c, pts, R, o.lw ?? 1.3);
}
function dent(c, L, x, y, r) {   // a dead machine's dent + scorch
  const R = L.R;
  dab(c, x, y, r, 'rgba(40,30,25,0.35)', R, 0.35);
  brush(c, [[x - r * 0.7, y - r * 0.2], [x, y + r * 0.3], [x + r * 0.6, y - r * 0.4]], 0.6, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.3 });
}
function rivet(c, L, x, y, r = 0.55) { dab(c, x, y, r, C.ink, L.R); if (!L.burnt) dab(c, x - r * 0.3, y - r * 0.35, r * 0.38, STEELL, L.R); }
/** The big lens eye. st: 'on' (pale glass, pupil, glint), 'glow' (charging: orange-yellow, rays), 'blaze' (firing), 'visor'. */
function lens(c, L, x, y, r, st = 'on') {
  const R = L.R;
  part(c, ring(x, y, r, r, R, 0.05, 10), L.burnt ? C.char : STEELD, L.M, { lw: r > 3.5 ? 1.15 : 0.95, edge: 0 });
  if (L.burnt) { dab(c, x, y, r * 0.6, C.charL, R); return; }
  if (L.dead) {   // smashed: dark glass, a crack, X
    dab(c, x, y, r * 0.7, GLASSD, R);
    brush(c, [[x - r * 0.6, y - r * 0.2], [x - r * 0.1, y + r * 0.1], [x + r * 0.2, y - r * 0.5]], 0.5, '#d8f6ff', R, { bristles: 1, dry: 0, taper: 0.3 });
    for (const s of [-1, 1]) brush(c, [[x - r * 0.5, y - r * 0.5 * s], [x + r * 0.5, y + r * 0.5 * s]], Math.max(0.6, r * 0.22), C.ink, R, { bristles: 2, dry: 0, taper: 0 });
    return;
  }
  if (st === 'glow' || st === 'blaze') {
    const n = st === 'blaze' ? 10 : 8, l0 = r * 1.15, l1 = st === 'blaze' ? r * 2.3 : r * 1.75;
    for (let i = 0; i < n; i++) { const a = i / n * TAU + R() * 0.3; brush(c, [[x + Math.cos(a) * l0, y + Math.sin(a) * l0], [x + Math.cos(a) * l1, y + Math.sin(a) * l1]], st === 'blaze' ? 0.9 : 0.7, i & 1 ? C.fireO : C.yellow, R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
    dab(c, x, y, r * 0.78, st === 'blaze' ? LASER : C.fireO, R);
    dab(c, x, y, r * 0.55, C.yellow, R);
    dab(c, x, y, r * (st === 'blaze' ? 0.36 : 0.24), '#fffef0', R);
    return;
  }
  if (st === 'visor') { dab(c, x, y, r * 0.74, '#26343c', R); brush(c, [[x - r * 0.4, y - r * 0.3], [x + r * 0.1, y - r * 0.5]], 0.5, '#e8fbff', R, { bristles: 1, dry: 0, taper: 0.4 }); return; }
  dab(c, x, y, r * 0.76, GLASS, R);
  dab(c, x + r * 0.14, y + r * 0.04, r * 0.36, C.ink, R);
  dab(c, x - r * 0.3, y - r * 0.32, r * 0.2, '#ffffff', R);
}
function antenna(c, L, x0, y0, x1, y1, br, ball) {
  const R = L.R;
  brush(c, [[x0, y0], [(x0 + x1) / 2 + 0.35, (y0 + y1) / 2], [x1, y1]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, x1, y1, br + 0.45, C.ink, R); dab(c, x1 - 0.1, y1 - 0.1, br, ball, R);
  if (!L.burnt) dab(c, x1 - br * 0.38, y1 - br * 0.4, br * 0.32, '#ffffff', R);
}
/** A robot leg from the hip (0, hy) straight down + a boxy foot plate (fx0..fx1, fh tall). */
function rleg(c, L, hy, w, fx0, fx1, fh) {
  tube(c, [[0, hy], [0.25, (hy - fh) / 2], [0, -fh + 0.4]], w, L.st, L.R, 0.55);
  plate(c, L, rbox(fx0, -fh, fx1, 0.3, Math.min(0.9, fh * 0.45)), L.std, { lw: 1.0, step: 2 });
}
const rarm = (c, L, pts, w = 1.5) => tube(c, pts, w, L.std, L.R, 0.5);
/** A claw hand at (x, y), opening toward angle a. */
function claw(c, L, x, y, a) {
  const R = L.R, cs = Math.cos(a), sn = Math.sin(a), at = (u, v) => [x + cs * u - sn * v, y + sn * u + cs * v];
  dab(c, x, y, 1.15, L.dk, R);
  brush(c, [at(0, -0.4), at(1.4, -1.5), at(2.6, -0.8)], 0.7, C.ink, R, { bristles: 2, dry: 0, taper: 0.3 });
  brush(c, [at(0, 0.4), at(1.4, 1.5), at(2.6, 0.8)], 0.7, C.ink, R, { bristles: 2, dry: 0, taper: 0.3 });
}
function streaks(c, L, x, y, n, len, gap = 2.4) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap - 0.3]], 0.55, C.ink, L.R, { bristles: 1, dry: 0.4, taper: 0.7 }); }
function sparkFan(c, L, x, y, angs, len) {
  if (L.dead) return;
  const R = L.R;
  for (let i = 0; i < angs.length; i++) { const a = angs[i] + (R() - 0.5) * 0.3, l = len * (0.7 + R() * 0.5); brush(c, [[x + Math.cos(a) * 1, y + Math.sin(a) * 1], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 0.75, i & 1 ? C.fireO : C.yellow, R, { bristles: 2, dry: 0.25, taper: 0.85 }); }
  spark(c, x + Math.cos(angs[0]) * len * 0.8, y + Math.sin(angs[0]) * len * 0.8, 1.5, R);
  spark(c, x, y, 1.9, R);
}
function zig(c, L, x0, y0, x1, y1, n, amp) {   // a little crackle
  const R = L.R, pts = [[x0, y0]];
  for (let i = 1; i < n; i++) { const t = i / n, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1; const o = (i & 1 ? 1 : -1) * amp * (0.6 + R() * 0.6); pts.push([x0 + (x1 - x0) * t + nx / l * o, y0 + (y1 - y0) * t + ny / l * o]); }
  pts.push([x1, y1]);
  brush(c, pts, 1.3, C.ink, R, { bristles: 2, dry: 0, taper: 0.1, per: 2 });
  brush(c, pts, 0.75, C.yellow, R, { bristles: 2, dry: 0, taper: 0.1, per: 2 });
}
/** Smoke puff: three grey blobs (rises off a scrap heap). */
function puff(c, L, x, y, r) {
  const R = L.R;
  for (const [dx, dy, k, col] of [[0, 0, 1, C.smokeL], [r * 0.85, -r * 0.6, 0.78, C.smoke], [-r * 0.7, -r * 0.75, 0.7, C.smokeL]]) part(c, ring(x + dx, y + dy, r * k, r * k * 0.86, R, 0.16, 8), col, L.M, { lw: 0.8, vary: 0.06 });
}
/** Loose scrap on the ground: [kind, x, y, r] with kind 'gear' | 'nut' | 'bolt' | 'spring'. */
function scrap(c, L, list) {
  const R = L.R;
  for (const [k, x, y, r] of list) {
    if (k === 'gear') {
      const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; for (const [da, rr] of [[-0.2, 0.7], [-0.13, 1], [0.13, 1], [0.2, 0.7]]) pts.push([x + Math.cos(a + da) * r * rr, y + Math.sin(a + da) * r * rr * 0.9]); }
      part(c, pts, L.std, L.M, { sharp: true, lw: 0.9, edge: 0 }); dab(c, x, y, r * 0.32, C.ink, R);
    } else if (k === 'nut') {
      const pts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8]); }
      part(c, pts, L.st, L.M, { sharp: true, lw: 0.8, edge: 0 }); dab(c, x, y, r * 0.38, C.ink, R);
    } else if (k === 'bolt') {
      brush(c, [[x - r, y], [x + r, y - r * 0.3]], r * 0.55, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
      brush(c, [[x - r, y], [x + r, y - r * 0.3]], r * 0.3, L.stl, R, { bristles: 1, dry: 0, taper: 0 });
      dab(c, x + r, y - r * 0.3, r * 0.45, L.st, R);
    } else {
      const pts = []; for (let i = 0; i <= 10; i++) pts.push([x - r + i * r * 0.2, y + (i & 1 ? -r * 0.55 : r * 0.1)]);
      brush(c, pts, 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0, per: 2 });
    }
  }
}

// ---------------------------------------------------------------- entry factory
const GAIT = { walk0: 1, walk1: 2, run0: 3, run1: 4 };
/** Paint a whole frame: the entry's rig parts laid out at rest (alive) or as the finished heap (dead). */
function paintWhole(c, o, ent, cfg) {
  const pose = o.dead ? cfg.poses[0] : o.pose, names = ent.rig.parts(pose, false), list = [], rp = {};
  for (const k in names) { const v = names[k]; if (typeof v === 'string') { rp[k] = list.length; list.push(v.slice(2)); } else if (v === null || v === undefined) rp[k] = -1; else rp[k] = v; }
  const paintFn = (pi, a, b, cc, d, e, f) => { c.save(); c.transform(a, b, cc, d, e, f); cfg.part(c, o, list[pi]); c.restore(); };
  if (o.dead) layoutDead(ent.rig, rp, paintFn); else layout(ent.rig, rp, paintFn);
}
function robot(cfg) {
  const ent = {
    box: cfg.box, scale: 1, own: OWN, lie: 'none', poses: cfg.poses, extra: cfg.parts.map((n) => 'r:' + n),
    pick: cfg.pick,
    rig: { driver: 'robot', mode: cfg.mode, J: cfg.J, wreck: cfg.wreck, smokeAt: cfg.smokeAt, parts: cfg.rigParts },
    paint(c, o) { if (isPart(o.pose)) cfg.part(c, o, o.pose.slice(2)); else paintWhole(c, o, ent, cfg); },
  };
  if (cfg.flying) ent.flying = true;
  if (cfg.over) ent.over = cfg.over;
  return ent;
}
const ACT = (u) => (u.b ? u.b.act | 0 : 0);
// world time + world for the effect drawing (RENDER hands them to pick(u, info) every frame, before over() and the projectiles)
const NOWS = { now: 0, world: null };
const stash = (info) => { NOWS.now = info.now; NOWS.world = info.world; };
const sw2 = (info, hz, a, b) => ((((info.rt || 0) * hz + (info.ph || 0) * 7) | 0) & 1 ? b : a);

// ================================================================ DRONE (r 5.5, flies at z 22)
const DZ = { pivot: [0, -6.4], prong: [6.8, -2.8], top: [0, 0] };
function dronePart(c, o, name) {
  const L = look(o), R = L.R, M = L.M;
  if (name === 'body' || name === 'bodyZ') {
    for (const s of [-1, 1]) brush(c, [[s * 1.8, -3.4], [s * 3.1, -0.5]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // skids
    brush(c, [[-5, -0.3], [-1.6, -0.45]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); brush(c, [[1.6, -0.45], [5, -0.3]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
    antenna(c, L, -2.6, -9.6, -4.4, -14.4, 0.9, L.haz);
    plate(c, L, [[-7.4, -11.4], [7.4, -11.4], [7.4, -9.4], [-7.4, -9.4]], L.haz, { lw: 0.85, step: 2 });   // rotor arm, hazard orange
    if (!L.burnt) for (const x of [-4.6, -2, 2, 4.6]) brush(c, [[x - 0.5, -9.6], [x + 0.5, -11.2]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
    for (const s of [-1, 1]) part(c, ring(s * 6.7, -11.9, 1.05, 0.85, R, 0.06, 7), L.dk, M, { lw: 0.7 });
    const body = ring(0, -6.4, 5.4, 4.1, R, 0.05, 12), F = spline(shift(body, M.mx, M.my, M.grow), true, 6);
    fill(c, F, L.stl, R, { sharp: true });
    const belly = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; belly.push([Math.cos(a) * 5.6, -6.2 + Math.sin(a) * 4.2]); }
    c.save(); path(c, F); c.clip(); fill(c, belly, L.team, R, { sharp: true, edge: 0, vary: 0.08 }); c.restore();
    outline(c, body, R, 1.1);
    rivet(c, L, -3.2, -8.4, 0.45); rivet(c, L, -1.2, -9.2, 0.45);
    lens(c, L, 2.7, -6.8, 2.5, name === 'bodyZ' ? 'glow' : 'on');
    if (name === 'bodyZ' && !L.dead) { brush(c, [[4.4, -4.2], [6.8, -2.8]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); spark(c, 7.4, -2.6, 2.4, R); }
    return;
  }
  if (name.startsWith('rotor')) {   // rotor0 long blur, rotor1 short blade + blur arcs, rotorS still blades (on the ground / wreck)
    for (const s of [-1, 1]) {
      const x = s * 6.7, y = -12.9;
      if (name === 'rotorS') { brush(c, [[x - 4, y + 0.3], [x + 4, y - 0.3]], 0.95, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); brush(c, [[x - 3.6, y + 0.3], [x + 3.6, y - 0.3]], 0.4, L.stl, R, { bristles: 1, dry: 0, taper: 0 }); }
      else if (name === 'rotor0') { const e = ring(x, y, 5, 1.2, R, 0.05, 10); fill(c, e, L.burnt ? C.charL : '#f4f7f9', R, { edge: 0, vary: 0.05 }); outline(c, e, R, 0.55, { bristles: 2, jit: 0.15 }); brush(c, [[x - 4.4, y + 0.2], [x + 4.4, y - 0.2]], 0.7, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.2 }); }
      else { const e = ring(x, y, 5, 1.2, R, 0.05, 10); fill(c, e, L.burnt ? C.charL : '#f4f7f9', R, { edge: 0, vary: 0.05 }); outline(c, e, R, 0.55, { bristles: 2, jit: 0.15 }); brush(c, [[x - 1.7, y], [x + 1.7, y]], 1.0, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); }
      dab(c, x, y + 0.2, 0.7, C.ink, R);
    }
    return;
  }
  if (name === 'scrap') { scrap(c, L, [['nut', -6.5, -0.8, 1.1], ['bolt', 9, -0.7, 1.3], ['spring', 3, -0.6, 1.6]]); return; }
  if (name === 'smoke') puff(c, L, 0, -7, 2.8);
}
const drone = robot({
  box: [30, 24, 14, 19], mode: 'fly', flying: true, poses: ['fly0', 'fly1', 'idle', 'zap'],
  parts: ['body', 'bodyZ', 'rotor0', 'rotor1', 'rotorS', 'scrap', 'smoke'], part: dronePart, J: DZ,
  rigParts: (pose) => ({ body: pose === 'zap' ? 'r:bodyZ' : 'r:body', rot: pose === 'fly1' ? 'r:rotor1' : pose === 'idle' ? 'r:rotorS' : 'r:rotor0', rotD: 'r:rotorS',
    scrap: 'r:scrap', smoke: 'r:smoke', code: POSE_CODE(pose) }),
  wreck: [
    { key: 'body', c: [0, -5.8], to: [0.5, -5.4], a: 2.95 },
    { key: 'rotD', c: [0, -12.9], to: [5, -1.1], a: 0.35, t0: 0.05 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -6],
  pick(u, info) { stash(info); if (ACT(u) === 1) return 'zap'; if ((u.z || 0) < 3) return 'idle'; return sw2(info, 11, 'fly0', 'fly1'); },
  over: droneOver,
});

// ================================================================ LASERBOT (r 9.9)
const LZ = { hip: [0, -8.6], legX: 2.5, pivot: [0, -8.6], neck: [0, -16.6], shoulder: [2.4, -15.2], top: [-2.6, -28.8], eye: [3.3, -22.6] };
function laserPart(c, o, name) {
  const L = look(o), R = L.R;
  switch (name) {
    case 'leg': rleg(c, L, LZ.hip[1], 2.3, -2.6, 3.8, 1.9); return;
    case 'body':
      shell(c, L, sub(rbox(-6, -17.2, 6, -8, 1.6), 3), L.team, [[-10.4, -8.2, L.haz, 1]], { dent: [-3, -14, 1.6] });
      plate(c, L, rbox(-4.2, -15.8, -0.6, -12, 0.6), L.stl, { lw: 0.8, step: 1.5 });
      if (!L.burnt) { dab(c, -2.4, -14.6, 0.7, L.dead ? C.charL : C.yellow, R); dab(c, -2.4, -12.9, 0.5, L.dead ? C.charL : '#7be07b', R); }
      rivet(c, L, 4.4, -15.6, 0.5); rivet(c, L, 4.4, -12, 0.5);
      return;
    case 'head': case 'headC': case 'headB':
      shell(c, L, sub(rbox(-6.8, -29.2, 7.2, -16.4, 2.4), 3), L.stl, [[-28.6, -26.6, L.team, 0]], { dent: [-3.6, -19.4, 1.8] });
      for (let i = 0; i < 3; i++) brush(c, [[-5.2, -24.4 + i * 1.9], [-2.6, -24.4 + i * 1.9]], 0.6, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.2 });
      dab(c, -7.1, -22.2, 1.25, C.ink, R); dab(c, -7.1, -22.2, 0.75, L.std, R);
      for (let i = 0; i < 3; i++) brush(c, [[1.8 + i * 1.6, -19], [1.9 + i * 1.6, -17.5]], 0.55, C.ink, R, { bristles: 1, dry: 0.1, taper: 0 });
      lens(c, L, LZ.eye[0], LZ.eye[1], 4.1, name === 'headC' ? 'glow' : name === 'headB' ? 'blaze' : 'on');
      return;
    case 'top': antenna(c, L, -2.6, -28.8, -3.9, -35, 1.3, L.haz); return;
    case 'arm:idle': rarm(c, L, [[2.4, -15.2], [3.4, -12.6], [4.8, -10.4]]); claw(c, L, 5.1, -9.8, 0.9); return;
    case 'arm:atk': rarm(c, L, [[2.4, -15.2], [6.2, -17.2], [9.6, -18.2]]); claw(c, L, 10.2, -18.4, -0.2); streaks(c, L, 12.6, -22, 2, 3.4); return;
    case 'scrap': scrap(c, L, [['gear', -15.5, -2, 2.2], ['nut', 13.5, -0.9, 1.2], ['bolt', -6, -0.8, 1.6], ['spring', 5.5, -0.7, 2]]); return;
    case 'smoke': puff(c, L, 0, -9, 4.2);
  }
}
const LEAN = { laserbot: { charge: -0.07, beam: -0.11, atk: 0.07 } };
const laserbot = robot({
  box: [58, 48, 27, 42], mode: 'legs', poses: ['idle', 'walk0', 'walk1', 'atk', 'charge', 'beam'],
  parts: ['leg', 'body', 'head', 'headC', 'headB', 'top', 'arm:idle', 'arm:atk', 'scrap', 'smoke'], part: laserPart, J: LZ,
  rigParts: (pose) => ({ legF: 'r:leg', legN: 'r:leg', body: 'r:body', head: pose === 'charge' ? 'r:headC' : pose === 'beam' ? 'r:headB' : 'r:head', top: 'r:top',
    arm: pose === 'atk' ? 'r:arm:atk' : 'r:arm:idle', scrap: 'r:scrap', smoke: 'r:smoke', gait: GAIT[pose] | 0, lean: LEAN.laserbot[pose] || 0, code: POSE_CODE(pose) }),
  wreck: [
    { key: 'legF', c: [0, -4.6], to: [-12.5, -1.4], a: 1.55 },
    { key: 'legN', c: [0, -4.6], to: [3, -1.4], a: -1.5, t0: 0.03 },
    { key: 'body', c: [0, -12.6], to: [-4.5, -6], a: -1.5 },
    { key: 'head', c: [0.2, -22.8], to: [9.5, -7.2], a: 1.35, t0: 0.06 },
    { key: 'top', c: [-3.2, -31.9], to: [17, -1.4], a: 1.75, t0: 0.12 },
    { key: 'arm', c: [3.6, -12.8], to: [-9.5, -2.4], a: -1.3, t0: 0.04 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -9],
  pick(u) { const a = ACT(u); return a === 2 ? 'beam' : a === 1 ? 'charge' : null; },
  over: laserOver,
});

// ================================================================ SAWBOT (r 8.8): a unicycle with a big round saw
const SZ = { pivot: [0, -5.6], hub: [0, -5.6], wr: 5.6, shoulder: [4.6, -13.6], toolHub: [14, -11.6], top: [-2.6, -20.2], eye: [3.8, -16.4] };
function sawBlade(c, L, x, y, r, blur) {
  const R = L.R;
  if (!blur) {
    const n = 14, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push([x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8]); const a2 = a + TAU / n * 0.6; pts.push([x + Math.cos(a2) * r * 1.07, y + Math.sin(a2) * r * 1.07]); }
    part(c, poly(pts, R, 0.05), L.blade, L.M, { sharp: true, lw: 0.9, edge: 0 });
  } else {
    part(c, ring(x, y, r, r, R, 0.04, 12), L.burnt ? C.charL : '#d4dade', L.M, { lw: 1.0 });
    for (let k = 0; k < 3; k++) {
      const a0 = k * TAU / 3 + R() * 0.4, P = [], P2 = [];
      for (let a = a0; a < a0 + 1.5; a += 0.25) { P.push([x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78]); P2.push([x + Math.cos(a + 0.4) * r * 0.97, y + Math.sin(a + 0.4) * r * 0.97]); }
      brush(c, P, 0.8, '#ffffff', R, { bristles: 2, dry: 0.3, taper: 0.8 }); brush(c, P2, 0.45, C.ink, R, { bristles: 1, dry: 0.4, taper: 0.8 });
    }
  }
  outline(c, ring(x, y, r * 0.55, r * 0.55, R, 0.03, 10), R, 0.5, { col: L.burnt ? C.ink : tone(BLADE, -0.42), bristles: 2, jit: 0.1 });
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.4; dab(c, x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, r * 0.09, C.ink, R); }
  dab(c, x, y, r * 0.22, L.dk, R); dab(c, x - r * 0.05, y - r * 0.05, r * 0.1, L.stl, R);
}
function sawPart(c, o, name) {
  const L = look(o), R = L.R, M = L.M;
  switch (name) {
    case 'wheel': {
      const [hx, hy] = SZ.hub, r = SZ.wr;
      part(c, ring(hx, hy, r, r, R, 0.04, 12), L.rub, M, { lw: 1.2 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; brush(c, [[hx + Math.cos(a) * r * 0.82, hy + Math.sin(a) * r * 0.82], [hx + Math.cos(a) * r * 1.02, hy + Math.sin(a) * r * 1.02]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
      part(c, ring(hx, hy, r * 0.62, r * 0.62, R, 0.04, 10), L.stl, M, { lw: 0.8 });
      for (let k = 0; k < 2; k++) { const a = k * Math.PI / 2 + 0.3, ex = Math.cos(a) * r * 0.52, ey = Math.sin(a) * r * 0.52; brush(c, [[hx - ex, hy - ey], [hx + ex, hy + ey]], 0.75, L.std, R, { bristles: 2, dry: 0, taper: 0 }); }
      dab(c, hx, hy, 1.1, C.ink, R); dab(c, hx - 0.2, hy - 0.2, 0.5, L.stl, R);
      return;
    }
    case 'body': {
      plate(c, L, [[-2, -5.8], [2, -5.8], [2.4, -10.4], [-2.4, -10.4]], L.dk, { lw: 1.1, step: 2 });   // fork
      shell(c, L, sub(dome(0, -9.4, 7.3, 11.2, 12), 2.8), L.st, [[-16.2, -12.2, L.team, 0], [-11, -9.2, L.haz, 1]], { dent: [-3.4, -17, 1.6] });
      rivet(c, L, -5.2, -14.2, 0.5); rivet(c, L, -2.2, -14.2, 0.5);
      lens(c, L, SZ.eye[0], SZ.eye[1], 2.9);
      return;
    }
    case 'top': antenna(c, L, -2.6, -20.2, -4, -25.2, 1.05, L.haz); return;
    case 'arm': case 'arm:atk': {
      bar(c, L, 4.2, -13.6, 14, -11.6, 2.8, L.haz, 1.1);
      if (!L.burnt) for (const t of [0.3, 0.55]) { const x = 4.2 + 9.8 * t, y = -13.6 + 2 * t; brush(c, [[x - 0.6, y + 1.2], [x + 0.6, y - 1.2]], 0.7, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
      part(c, ring(12.4, -11.9, 2.8, 2.6, R, 0.06, 8), L.dk, M, { lw: 1.0 });
      rivet(c, L, 12.4, -11.9, 0.6);
      if (name === 'arm:atk') streaks(c, L, 21.6, -15.6, 3, 3.6, 2.6);
      return;
    }
    case 'saw': sawBlade(c, L, SZ.toolHub[0], SZ.toolHub[1], 6.2, false); return;
    case 'sawB': sawBlade(c, L, SZ.toolHub[0], SZ.toolHub[1], 6.2, true); return;
    case 'sparks': sparkFan(c, L, 19.6, -9.4, [-0.9, -0.4, 0.15, -1.5, 0.6], 6.5); return;
    case 'scrap': scrap(c, L, [['gear', 9, -2.2, 2.2], ['nut', -15.5, -0.9, 1.2], ['bolt', 22, -0.8, 1.4], ['spring', -4.5, -0.7, 2]]); return;
    case 'smoke': puff(c, L, 0, -8, 3.8);
  }
}
const sawbot = robot({
  box: [52, 36, 22, 30], mode: 'wheel', poses: ['idle', 'walk0', 'walk1', 'atk', 'spin0', 'spin1'],
  parts: ['wheel', 'body', 'top', 'arm', 'arm:atk', 'saw', 'sawB', 'sparks', 'scrap', 'smoke'], part: sawPart, J: SZ,
  rigParts: (pose) => {
    const spin = pose === 'spin0' || pose === 'spin1';
    return { wheel: 'r:wheel', body: 'r:body', top: 'r:top', arm: pose === 'atk' ? 'r:arm:atk' : 'r:arm', tool: spin ? 'r:sawB' : 'r:saw', fx: spin ? 'r:sparks' : null,
      scrap: 'r:scrap', smoke: 'r:smoke', gait: pose === 'spin1' ? 2 : GAIT[pose] | 0, lean: spin ? 0.12 : pose === 'atk' ? 0.08 : 0, spin: spin ? 1 : 0, code: POSE_CODE(pose) };
  },
  wreck: [
    { key: 'wheel', c: [0, -5.6], to: [-11.5, -5.6], a: -2.6 },
    { key: 'body', c: [0, -14.6], to: [0.5, -5.8], a: 2.95, t0: 0.03 },
    { key: 'top', c: [-3.3, -22.7], to: [-4, -1.4], a: -1.65, t0: 0.1 },
    { key: 'arm', c: [9.2, -12.6], to: [12, -2], a: 0.2, t0: 0.04 },
    { key: 'tool', c: [14, -11.6], to: [19.5, -5.2], a: 1.2, t0: 0.06 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -8],
  pick(u, info) { stash(info); return ACT(u) === 1 ? sw2(info, 14, 'spin0', 'spin1') : null; },
  over: sawOver,
});

// ================================================================ MAGNETBOT (r 11): a stout coil body + a giant horseshoe magnet
const MZ = { hip: [0, -8], legX: 3.2, pivot: [0, -8], neck: [0.4, -21.6], shoulder: [1.4, -18.2], eye: [2.9, -24.4], top: [0, 0] };
function magnet(c, L, x, y, ang, crackle) {
  const R = L.R;
  c.save(); c.translate(x, y); c.rotate(ang);
  const pts = [[7.2, -3.7], [2.4, -3.7], [-1.4, -2.9], [-3.7, 0], [-1.4, 2.9], [2.4, 3.7], [7.2, 3.7]];
  tube(c, pts, 3.3, L.team, R, 0.75);
  for (const s of [-1, 1]) tube(c, [[5.2, s * 3.7], [7.6, s * 3.7]], 3.3, L.stl, R, 0.75);
  if (!L.burnt) brush(c, [[-2.2, -1.4], [-1.2, -2.6], [1.6, -3.2]], 0.6, '#ffffff', R, { bristles: 1, dry: 0.2, taper: 0.5 });
  if (crackle && !L.dead) { zig(c, L, 8.4, -3.2, 8.4, 3.2, 4, 1.1); spark(c, 9.6, -3.6, 1.3, R); }
  c.restore();
}
function magPart(c, o, name) {
  const L = look(o), R = L.R;
  switch (name) {
    case 'leg': rleg(c, L, MZ.hip[1], 2.9, -3.4, 4.6, 2.1); return;
    case 'body': case 'bodyG': {
      const glow = name === 'bodyG' && !L.dead && !L.burnt;
      if (glow) for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + 0.2, rx = 9.6, ry = 9.4; brush(c, [[Math.cos(a) * rx, -14.6 + Math.sin(a) * ry], [Math.cos(a) * (rx + 2.6), -14.6 + Math.sin(a) * (ry + 2.6)]], 0.75, i & 1 ? C.fireO : C.yellow, R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
      shell(c, L, sub(rbox(-7.8, -22.2, 7.8, -7.4, 2.8), 3), L.st, [[-22.2, -19.2, L.team, 0], [-9.8, -7.4, L.haz, 1]], { dent: [4, -10.8, 1.6] });
      const cc = glow ? '#ffd23a' : L.copper;
      plate(c, L, rbox(-6.4, -17.8, 6.6, -11.2, 1), cc, { lw: 1.1, step: 2 });
      if (!L.burnt) for (let x = -5.2; x < 6; x += 1.5) brush(c, [[x, -17.2], [x + 0.2, -11.8]], 0.38, glow ? C.fireO : tone(COPPER, -0.4), R, { bristles: 1, dry: 0.25, taper: 0 });
      if (glow) { dab(c, -2, -14.6, 1.6, '#fff6c0', R); dab(c, 3, -14.4, 1.2, '#fff6c0', R); zig(c, L, -7.4, -16.8, -10.6, -18.6, 3, 0.8); zig(c, L, 7.4, -12, 10.6, -10.4, 3, 0.8); }
      rivet(c, L, -5.8, -20.8, 0.5); rivet(c, L, 5.8, -20.8, 0.5);
      return;
    }
    case 'head':
      shell(c, L, sub(dome(0.4, -21.6, 5, 5.2, 10), 2.4), L.st, null, { lw: 1.4 });
      lens(c, L, MZ.eye[0], MZ.eye[1], 2.3);
      return;
    case 'arm:hold': case 'arm:holdG': case 'arm:atk':
      if (name === 'arm:atk') { tube(c, [[0, -18.6], [5, -20.4], [8.4, -21]], 1.4, L.B(tone(STEELD, -0.25), 1), R, 0.55); magnet(c, L, 9.4, -20, -0.35, false); rarm(c, L, [[1.4, -18.2], [5.2, -17.4], [8.6, -17.4]], 1.6); streaks(c, L, 18, -26, 2, 3.4); return; }
      tube(c, [[0, -18.6], [4.6, -17], [8, -16.6]], 1.4, L.B(tone(STEELD, -0.25), 1), R, 0.55);
      magnet(c, L, 9, -14, 0, name === 'arm:holdG');
      rarm(c, L, [[1.4, -18.2], [4.8, -14], [8.4, -11.6]], 1.6);
      dab(c, 8.4, -11.4, 1.2, L.dk, R);
      return;
    case 'arm:up':
      tube(c, [[0, -18.6], [-0.8, -24], [0.8, -28.6]], 1.4, L.B(tone(STEELD, -0.25), 1), R, 0.55);
      magnet(c, L, 2.6, -31.6, -1.15, true);
      rarm(c, L, [[1.4, -18.2], [4.4, -23.4], [4.8, -28]], 1.6);
      dab(c, 4.8, -28.2, 1.2, L.dk, R);
      return;
    case 'scrap': scrap(c, L, [['gear', 18, -2.4, 2.6], ['gear', -16, -2, 2], ['nut', 6.5, -0.9, 1.3], ['spring', -6, -0.7, 2.2]]); return;
    case 'smoke': puff(c, L, 0, -11, 4.8);
  }
}
const magnetbot = robot({
  box: [56, 52, 26, 46], mode: 'legs', poses: ['idle', 'walk0', 'walk1', 'atk', 'charge', 'pull'],
  parts: ['leg', 'body', 'bodyG', 'head', 'arm:hold', 'arm:holdG', 'arm:up', 'arm:atk', 'scrap', 'smoke'], part: magPart, J: MZ,
  rigParts: (pose) => ({ legF: 'r:leg', legN: 'r:leg', body: pose === 'charge' || pose === 'pull' ? 'r:bodyG' : 'r:body', head: 'r:head',
    arm: pose === 'pull' ? 'r:arm:up' : pose === 'charge' ? 'r:arm:holdG' : pose === 'atk' ? 'r:arm:atk' : 'r:arm:hold', scrap: 'r:scrap', smoke: 'r:smoke',
    gait: GAIT[pose] | 0, lean: pose === 'pull' ? -0.06 : pose === 'atk' ? 0.08 : 0, shake: pose === 'charge' || pose === 'pull' ? 1 : 0, swing: 0.34, code: POSE_CODE(pose) }),
  wreck: [
    { key: 'legF', c: [0, -4], to: [-11, -1.6], a: 1.5 },
    { key: 'legN', c: [0, -4], to: [4.5, -1.6], a: -1.5, t0: 0.03 },
    { key: 'body', c: [0, -14.8], to: [-2, -8], a: -1.55 },
    { key: 'head', c: [0.4, -24.2], to: [-13.5, -2.8], a: -2.8, t0: 0.08 },
    { key: 'arm', c: [8, -15], to: [12.5, -4.2], a: 0.25, t0: 0.05 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -11],
  pick(u, info) { stash(info); const a = ACT(u); return a === 2 ? 'pull' : a === 1 ? 'charge' : null; },
  over: magOver,
});

// ================================================================ REPAIRBOT (r 8.8): treads, hard hat, gas tank, torch
const PZ = { pivot: [0, -6.4], neck: [0.4, -15.4], shoulder: [2.6, -13.6], hat: [0.6, -21.6], eye: [3.1, -18.6], top: [0, 0] };
function repPart(c, o, name) {
  const L = look(o), R = L.R, M = L.M;
  switch (name) {
    case 'tread0': case 'tread1': {
      const v = name === 'tread1' ? 1 : 0;
      shell(c, L, sub(rbox(-8.4, -6.8, 8.4, 0.2, 3.3), 2.6), L.rub, null, { lw: 1.4 });
      for (let x = -6 + v * 1.2; x < 6.4; x += 2.4) { brush(c, [[x, -6.7], [x - 0.3, -7.6]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); brush(c, [[x, 0.1], [x + 0.3, 1]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
      for (const x of [-4.9, 0, 4.9]) {
        part(c, ring(x, -3.3, 2.15, 2.15, R, 0.05, 8), L.st, M, { lw: 0.9 });
        const a = v ? 0.8 : 0; brush(c, [[x - Math.cos(a) * 1.6, -3.3 - Math.sin(a) * 1.6], [x + Math.cos(a) * 1.6, -3.3 + Math.sin(a) * 1.6]], 0.55, L.std, R, { bristles: 1, dry: 0, taper: 0 });
        dab(c, x, -3.3, 0.6, C.ink, R);
      }
      return;
    }
    case 'body': {
      shell(c, L, sub(rbox(-10.6, -14.8, -5.8, -7.2, 2), 2.4), L.stl, [[-11.8, -10.2, L.haz, 1]], { lw: 1.1 });   // gas tank
      if (!L.burnt) { dab(c, -8.2, -12.6, 1.35, C.ink, R); dab(c, -8.2, -12.6, 0.95, CREAM, R); brush(c, [[-8.2, -12.6], [-7.6, -13.3]], 0.35, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
      brush(c, [[-8.2, -14.9], [-5.4, -17.8], [-0.6, -16.8], [2.2, -14.6]], 0.85, C.ink, R, { bristles: 2, dry: 0, taper: 0 });   // hose
      shell(c, L, sub(rbox(-6, -15.8, 6, -6.2, 1.4), 3), L.team, [[-8.2, -6.4, L.haz, 1]], { dent: [3.4, -12.6, 1.5] });
      if (!L.burnt) {   // a cream wrench on the panel
        brush(c, [[-3.6, -9.6], [0.4, -13.2]], 1.0, CREAM, R, { bristles: 2, dry: 0, taper: 0 });
        brush(c, [[-0.4, -14.2], [1.2, -13.8], [1.1, -12.2]], 0.85, CREAM, R, { bristles: 2, dry: 0, taper: 0 });
      }
      rivet(c, L, 4.4, -14.6, 0.5); rivet(c, L, 4.4, -9.6, 0.5);
      return;
    }
    case 'head': case 'headV':
      shell(c, L, ring(0.6, -18.8, 4.9, 3.9, R, 0.05, 10), L.st, null, { lw: 1.4 });
      for (let i = 0; i < 3; i++) brush(c, [[-2.6 + i * 1.3, -16.6], [-2.5 + i * 1.3, -15.6]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      lens(c, L, PZ.eye[0], PZ.eye[1], 2.5, name === 'headV' ? 'visor' : 'on');
      return;
    case 'hat': {   // yellow hard hat
      const ht = L.B(C.yellow);
      shell(c, L, sub(dome(0.6, -21.4, 4.6, 4, 10), 2.2), ht, null, { lw: 1.3 });
      bar(c, L, -4.8, -21.4, 7.8, -21.4, 1.5, ht, 1.0);
      if (!L.burnt) { brush(c, [[0.6, -25.2], [0.7, -21.8]], 0.7, tone(C.yellow, -0.3), R, { bristles: 1, dry: 0.2, taper: 0 }); dab(c, -1.6, -23.6, 0.6, '#ffffff', R); }
      return;
    }
    case 'arm:idle':
      rarm(c, L, [[2.6, -13.6], [4.4, -11.6], [6.4, -11]]);
      tube(c, [[6, -11.4], [10.2, -10.2]], 1.7, L.dk, R, 0.55); dab(c, 10.5, -10.1, 0.75, L.copper, R);
      if (!L.dead) dab(c, 11.5, -10, 0.55, CYAN, R);
      dab(c, 6.3, -11.1, 1.15, L.dk, R);
      return;
    case 'arm:weld':
      rarm(c, L, [[2.6, -13.6], [5.8, -12.4], [8.4, -10.8]]);
      tube(c, [[8, -11.4], [12.2, -8.6]], 1.7, L.dk, R, 0.55); dab(c, 12.4, -8.4, 0.75, L.copper, R);
      dab(c, 8.3, -11, 1.15, L.dk, R);
      if (!L.dead) {
        fill(c, poly([[12.4, -9.5], [17, -6.6], [12.8, -7.3]], R, 0.15), '#79cfff', R, { edge: 0, vary: 0.06 });
        fill(c, poly([[12.6, -8.8], [15.4, -7.2], [12.8, -7.8]], R, 0.1), '#f2fdff', R, { edge: 0, vary: 0.04 });
        sparkFan(c, L, 16.8, -6.6, [-2.4, -1.6, -0.9, -0.3, 0.5, -2.9], 5.5);
      }
      return;
    case 'arm:atk':
      rarm(c, L, [[2.6, -13.6], [6, -16.8], [8.4, -18.8]]);
      tube(c, [[8, -19], [11.6, -22.4]], 1.7, L.dk, R, 0.55); dab(c, 11.8, -22.6, 0.75, L.copper, R);
      dab(c, 8.4, -18.9, 1.15, L.dk, R);
      streaks(c, L, 14.4, -24.6, 2, 3.2);
      return;
    case 'scrap': scrap(c, L, [['gear', -17.5, -2, 2], ['nut', 19.5, -0.9, 1.2], ['bolt', 7, -0.8, 1.5], ['spring', -6, -0.6, 1.8]]); return;
    case 'smoke': puff(c, L, 0, -9, 4);
  }
}
const repairbot = robot({
  box: [52, 38, 25, 31], mode: 'tread', poses: ['idle', 'walk0', 'walk1', 'atk', 'weld'],
  parts: ['tread0', 'tread1', 'body', 'head', 'headV', 'hat', 'arm:idle', 'arm:weld', 'arm:atk', 'scrap', 'smoke'], part: repPart, J: PZ,
  rigParts: (pose) => ({ tread0: pose === 'walk1' ? 'r:tread1' : 'r:tread0', tread1: pose === 'walk1' ? 'r:tread0' : 'r:tread1', body: 'r:body', head: pose === 'weld' ? 'r:headV' : 'r:head', hat: 'r:hat',
    arm: pose === 'weld' ? 'r:arm:weld' : pose === 'atk' ? 'r:arm:atk' : 'r:arm:idle', scrap: 'r:scrap', smoke: 'r:smoke',
    lean: pose === 'weld' ? 0.07 : pose === 'atk' ? 0.06 : 0, code: POSE_CODE(pose) }),
  wreck: [
    { key: 'tread0', c: [0, -3.3], to: [-1.5, -3.3], a: 0.1 },
    { key: 'body', c: [-1, -11], to: [-11, -6], a: -1.5, t0: 0.03 },
    { key: 'head', c: [0.6, -18.8], to: [11.5, -3.9], a: 1.9, t0: 0.07 },
    { key: 'hat', c: [1.4, -22.6], to: [16.5, -1.6], a: 3.05, t0: 0.11 },
    { key: 'arm', c: [6.4, -11.4], to: [1.5, -8.4], a: 0.3, t0: 0.05 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -9],
  pick(u, info) { stash(info); const a = ACT(u); return a === 1 ? 'weld' : null; },
  over: repOver,
});

// ================================================================ SHIELDBOT (r 9.9): a bell with a shield emblem + an emitter antenna
const HZ = { hip: [0, -6.6], legX: 2.8, pivot: [0, -6.6], shoulder: [3, -15.8], top: [-0.9, -25.2], eye: [4, -19.6] };
function shieldPart(c, o, name) {
  const L = look(o), R = L.R, M = L.M;
  switch (name) {
    case 'leg': rleg(c, L, HZ.hip[1], 2.5, -3.2, 4.2, 2); return;
    case 'body': {
      const bell = [[-8, -6.4], [-4, -6.4], [0, -6.4], [4, -6.4], [8, -6.4], [7.6, -11], [6.6, -17.6], [5, -22.6], [2, -25.4], [-2.4, -25.4], [-5.4, -22.6], [-7, -17.6], [-7.8, -11]];
      shell(c, L, bell, L.st, [[-9, -6.4, L.haz, 1]], { dent: [2, -11.8, 1.6] });
      part(c, poly([[-6.8, -21.8], [1.4, -21.8], [1.5, -14.8], [-2.7, -10.2], [-6.9, -14.8]], R, 0.12), L.team, M, { lw: 1.15, sharp: false });
      if (!L.burnt) brush(c, [[-5, -18.4], [-2.7, -15.6], [-0.4, -18.4]], 1.2, CREAM, R, { bristles: 2, dry: 0.1, taper: 0.1 });
      lens(c, L, HZ.eye[0], HZ.eye[1], 2.8);
      rivet(c, L, -6.2, -10.2, 0.5); rivet(c, L, 6, -10.2, 0.5);
      return;
    }
    case 'top': case 'topG': {
      const g = name === 'topG' && !L.dead && !L.burnt;
      tube(c, [[-0.9, -25.2], [-1, -28], [-1.2, -30.4]], 1.0, L.std, R, 0.5);
      dab(c, -1.2, -30.6, 1.35, L.dk, R);
      if (g) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; brush(c, [[-1.2 + Math.cos(a) * 3.2, -33 + Math.sin(a) * 3], [-1.2 + Math.cos(a) * 5.4, -33 + Math.sin(a) * 5]], 0.75, i & 1 ? CYAN : '#e8fdff', R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
      part(c, ring(-1.2, -33, 2.4, 2.2, R, 0.05, 8), g ? '#c8f8ff' : L.B(CYAN), M, { lw: 1.0 });
      if (g) { dab(c, -1.2, -33, 1.2, '#ffffff', R); for (const s of [-1, 1]) brush(c, [[-1.2 + s * 6.4, -36], [-1.2 + s * 7.6, -33], [-1.2 + s * 6.4, -30]], 0.7, CYAN, R, { bristles: 2, dry: 0.3, taper: 0.3 }); }
      else if (!L.burnt) dab(c, -2, -33.8, 0.6, '#ffffff', R);
      return;
    }
    case 'arm:idle':
      rarm(c, L, [[3, -15.8], [5, -13.6], [6.6, -11.6]]);
      brush(c, [[6.6, -11.6], [8, -11.4]], 1.0, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
      for (const [x, y] of [[9.8, -10.4], [9.6, -12.6]]) { brush(c, [[8, -11.4], [x, y]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); dab(c, x, y, 0.5, L.copper, R); }
      dab(c, 6.6, -11.6, 1.1, L.dk, R);
      return;
    case 'arm:atk':
      rarm(c, L, [[3, -15.8], [6.6, -16.4], [9.4, -15.6]]);
      brush(c, [[9.4, -15.6], [10.8, -15.6]], 1.0, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
      for (const [x, y] of [[12.6, -16.8], [12.8, -14.4]]) { brush(c, [[10.8, -15.6], [x, y]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 }); dab(c, x, y, 0.5, L.copper, R); }
      if (!L.dead) { spark(c, 14, -15.6, 2, R); zig(c, L, 12.8, -16.6, 13, -14.6, 3, 0.6); }
      dab(c, 9.4, -15.6, 1.1, L.dk, R);
      return;
    case 'scrap': scrap(c, L, [['gear', 16, -2.2, 2.2], ['nut', -16, -0.9, 1.2], ['bolt', 5.5, -0.8, 1.5], ['spring', -6.5, -0.7, 1.9]]); return;
    case 'smoke': puff(c, L, 0, -10, 4.2);
  }
}
const shieldbot = robot({
  box: [50, 46, 25, 41], mode: 'legs', poses: ['idle', 'walk0', 'walk1', 'atk', 'dome'],
  parts: ['leg', 'body', 'top', 'topG', 'arm:idle', 'arm:atk', 'scrap', 'smoke'], part: shieldPart, J: HZ,
  rigParts: (pose) => ({ legF: 'r:leg', legN: 'r:leg', body: 'r:body', top: pose === 'dome' ? 'r:topG' : 'r:top', arm: pose === 'atk' ? 'r:arm:atk' : 'r:arm:idle',
    scrap: 'r:scrap', smoke: 'r:smoke', gait: GAIT[pose] | 0, lean: pose === 'atk' ? 0.07 : 0, swing: 0.36, code: POSE_CODE(pose) }),
  wreck: [
    { key: 'legF', c: [0, -3.4], to: [-11, -1.6], a: 1.5 },
    { key: 'legN', c: [0, -3.4], to: [4, -1.6], a: -1.5, t0: 0.03 },
    { key: 'body', c: [0, -15.9], to: [-1, -8.2], a: -1.5 },
    { key: 'top', c: [-1.1, -29.4], to: [13.5, -2], a: 1.6, t0: 0.1 },
    { key: 'arm', c: [6, -13], to: [-12, -2.2], a: -1.2, t0: 0.05 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -10],
  pick(u, info) { stash(info); return ACT(u) === 1 ? 'dome' : null; },
});

// ================================================================ BOMBBOT (r 7.7): a round iron bomb on running legs, a beacon, a wind-up key
const BZ = { hip: [0, -5.6], legX: 2.1, pivot: [0, -5.6], top: [0, -17.4], keyHub: [-6.6, -11.2], eye: [3.6, -12.8], beacon: [0, -19.8] };
function bombPart(c, o, name) {
  const L = look(o), R = L.R, M = L.M;
  switch (name) {
    case 'leg':
      tube(c, [[0, -5.6], [0.25, -3.4], [0, -1.6]], 1.6, L.dk, R, 0.6);
      part(c, ring(0.9, -1.1, 2.1, 1.3, R, 0.06, 8), L.dk, M, { lw: 1.0 });
      return;
    case 'body':
      shell(c, L, ring(0, -11.2, 6.8, 6.5, R, 0.04, 12), L.iron, [[-14.8, -12.4, L.team, 0], [-8.8, -6.8, L.haz, 1]], { dent: [-3, -9.6, 1.5] });
      lens(c, L, BZ.eye[0], BZ.eye[1], 2.4);
      if (!L.dead) brush(c, [[0.8, -16.2], [3.4, -15.6], [5.8, -15]], 1.0, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 });   // angry brow
      if (!L.burnt) brush(c, [[-4.6, -13.4], [-3.8, -15.4], [-2, -16.6]], 0.8, '#d7dbe0', R, { bristles: 2, dry: 0.3, taper: 0.5 });
      rivet(c, L, -4.8, -13.6, 0.45); rivet(c, L, -1.6, -13.6, 0.45);
      return;
    case 'top': case 'topOn': {
      const on = name === 'topOn' && !L.dead && !L.burnt;
      plate(c, L, [[-2, -17], [2, -17], [1.7, -18.6], [-1.7, -18.6]], L.dk, { lw: 0.9, step: 1.5 });
      if (on) for (let i = 0; i < 7; i++) { const a = -Math.PI + (i + 0.5) / 7 * Math.PI; brush(c, [[Math.cos(a) * 2.9, -19.8 + Math.sin(a) * 2.7], [Math.cos(a) * 5, -19.8 + Math.sin(a) * 4.6]], 0.75, i & 1 ? C.fireO : '#ff3018', R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
      part(c, ring(0, -19.8, 1.95, 1.75, R, 0.05, 8), on ? '#ff3018' : L.B('#8f2a20'), M, { lw: 0.95 });
      if (on) dab(c, 0, -19.9, 0.95, C.yellow, R); else if (!L.burnt) dab(c, -0.6, -20.4, 0.45, '#ffffff', R);
      return;
    }
    case 'key':
      brush(c, [[-6.4, -11.2], [-8.9, -11.2]], 1.1, L.dk, R, { bristles: 2, dry: 0, taper: 0 });
      for (const y of [-12.9, -9.5]) { part(c, ring(-10.3, y, 1.5, 1.7, R, 0.06, 8), L.brass, M, { lw: 0.9 }); dab(c, -10.4, y, 0.45, C.ink, R); }
      return;
    case 'scrap': scrap(c, L, [['nut', -14, -0.9, 1.1], ['bolt', 13, -0.8, 1.3], ['spring', 6, -0.6, 1.7]]); return;
    case 'smoke': puff(c, L, 0, -8, 3.6);
  }
}
const bombbot = robot({
  box: [38, 34, 19, 29], mode: 'legs', poses: ['idle', 'walk0', 'walk1', 'run0', 'run1'],
  parts: ['leg', 'key', 'body', 'top', 'topOn', 'scrap', 'smoke'], part: bombPart, J: BZ,
  rigParts: (pose) => ({ legF: 'r:leg', legN: 'r:leg', key: 'r:key', body: 'r:body', top: pose === 'run0' || pose === 'run1' ? 'r:topOn' : 'r:top',
    scrap: 'r:scrap', smoke: 'r:smoke', gait: GAIT[pose] | 0, lean: pose === 'run0' || pose === 'run1' ? 0.14 : 0, swing: 0.5, code: POSE_CODE(pose) }),
  wreck: [
    { key: 'legF', c: [0, -3.2], to: [-7, -1.2], a: 1.5 },
    { key: 'legN', c: [0, -3.2], to: [7.5, -1.2], a: -1.5, t0: 0.03 },
    { key: 'key', c: [-8.6, -11.2], to: [-12.5, -2], a: -1.3, t0: 0.08 },
    { key: 'body', c: [0, -11.2], to: [1, -6.5], a: 2.3 },
    { key: 'top', c: [0, -18.6], to: [11, -1.8], a: 1.45, t0: 0.1 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -8],
  pick(u, info) { stash(info); return ACT(u) === 1 ? (info.moving ? (info.walkFrame ? 'run1' : 'run0') : sw2(info, 6, 'run0', 'run1')) : null; },
  over: bombOver,
});

// ================================================================ MECH (r 18.7): a big two-legged walker with a rocket pod
const KZ = { hip: [0, -26], legX: 3.4, pivot: [0, -26], top: [7, -46.8], lid: [6, -54.8], eye: [8.4, -37.6], nearFront: true };
function mechLeg(c, L, far) {
  const st = far ? L.B(tone(STEEL, -0.22), 1) : L.st, dk = far ? L.B(tone(DARK, -0.2), 1) : L.dk;
  part(c, ring(0, -26, 3.7, 3.7, L.R, 0.05, 9), dk, L.M, { lw: 1.3 });
  bar(c, L, 0, -26, 5.2, -15, 6, st, 1.5);
  bar(c, L, 5.2, -15, 0.8, -4.4, 5.2, st, 1.5);
  part(c, ring(5.2, -15, 2.8, 2.8, L.R, 0.05, 8), far ? L.B(tone(HAZ, -0.2)) : L.haz, L.M, { lw: 1.2 });
  rivet(c, L, 5.2, -15, 0.7);
  plate(c, L, [[-6.8, -4.8], [6.4, -4.8], [9.8, -1.2], [9.4, 0.4], [-6.8, 0.4], [-7.6, -2.2]], dk, { lw: 1.4 });
  rivet(c, L, -4, -2.2, 0.55); rivet(c, L, 5, -2.2, 0.55);
  dab(c, 0, -26, 1.2, C.ink, L.R);
}
function mechPart(c, o, name) {
  const L = look(o), R = L.R;
  switch (name) {
    case 'legN': mechLeg(c, L, false); return;
    case 'legF': mechLeg(c, L, true); return;
    case 'body':
      tube(c, [[-15, -36.6], [-18.6, -39.6], [-19.6, -43.6]], 2, L.dk, R, 0.7);   // exhaust
      shell(c, L, sub(rbox(-15.8, -47.6, 14.2, -25, 4.2), 3), L.st, [[-29.4, -25, L.haz, 1]], { lw: 1.9, dent: [-8, -36, 2.4] });
      plate(c, L, rbox(-13, -43.8, 2.8, -31.8, 1.8), L.team, { lw: 1.4 });
      if (!L.burnt) brush(c, [[-9.4, -40.4], [-5.1, -35.4], [-0.8, -40.4]], 1.5, CREAM, R, { bristles: 3, dry: 0.1, taper: 0.1 });
      lens(c, L, KZ.eye[0], KZ.eye[1], 5.9);
      for (let i = 0; i < 3; i++) brush(c, [[9.2, -32.4 + i * 1.6], [12.6, -32.4 + i * 1.6]], 0.6, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.1 });
      for (let x = -11.5; x < 11; x += 5.5) rivet(c, L, x, -45.6, 0.6);
      return;
    case 'pod':
      shell(c, L, sub(rbox(-14.8, -55.2, 6.2, -46.8, 1.6), 2.8), L.dk, [[-52.6, -50.8, L.haz, 1]], { lw: 1.4 });
      for (const y of [-53.4, -49.2]) {   // rocket noses in the pod's mouth (the lid covers them when shut)
        part(c, poly([[5.6, y - 1.5], [9.2, y], [5.6, y + 1.5]], R, 0.06), L.B('#f6f2e6'), L.M, { sharp: true, lw: 0.8 });
        dab(c, 8.4, y, 0.7, L.B(C.red), R);
      }
      rivet(c, L, -12.4, -53.4, 0.5); rivet(c, L, -12.4, -48.6, 0.5);
      return;
    case 'lid':
      shell(c, L, [[2.4, -55], [6.2, -55], [6.2, -46.8], [2.4, -46.8]], L.std, [[-51.6, -50, L.haz, 1]], { lw: 1.2 });
      rivet(c, L, 4.3, -53.6, 0.5);
      return;
    case 'top': antenna(c, L, 7, -46.8, 8.8, -54, 1.5, L.haz); return;
    case 'scrap': scrap(c, L, [['gear', -26, -3, 3.2], ['gear', 25, -2.4, 2.4], ['nut', 9, -1, 1.6], ['bolt', -10, -1, 2], ['spring', 18, -0.8, 2.6]]); return;
    case 'smoke': puff(c, L, 0, -22, 7);
  }
}
const mech = robot({
  box: [86, 70, 43, 64], mode: 'mech', poses: ['idle', 'walk0', 'walk1', 'rockets', 'stomp'],
  parts: ['legF', 'legN', 'body', 'pod', 'lid', 'top', 'scrap', 'smoke'], part: mechPart, J: KZ,
  rigParts: (pose) => ({ legF: 'r:legF', legN: 'r:legN', body: 'r:body', pod: 'r:pod', lid: 'r:lid', top: 'r:top', scrap: 'r:scrap', smoke: 'r:smoke',
    gait: GAIT[pose] | 0, swing: RB.mech.swing, lean: pose === 'stomp' ? -0.07 : pose === 'rockets' ? -0.04 : 0,
    lidA: pose === 'rockets' ? RB.mech.lid : 0, lift: pose === 'stomp' ? RB.mech.lift : 0, code: POSE_CODE(pose) }),
  wreck: [
    { key: 'legF', c: [2, -14], to: [-15, -3.6], a: 1.45 },
    { key: 'body', c: [-0.8, -36.3], to: [2, -11.8], a: 0.28, t0: 0.02 },
    { key: 'pod', c: [-4.3, -51], to: [-23, -4.6], a: -0.45, t0: 0.08 },
    { key: 'lid', c: [4.3, -50.9], to: [24, -1.8], a: 1.57, t0: 0.12 },
    { key: 'top', c: [7.9, -50.4], to: [-11, -1.6], a: -1.6, t0: 0.1 },
    { key: 'legN', c: [2, -14], to: [16, -3.6], a: -1.4, t0: 0.04 },
    { key: 'scrap', c: [0, 0], to: [0, 0], a: 0, j: 0 },
  ],
  smokeAt: [0, -22],
  pick(u, info) { stash(info); const a = ACT(u); return a === 2 ? 'stomp' : a === 1 ? 'rockets' : null; },
});

export const SPRITES = { drone, laserbot, sawbot, magnetbot, repairbot, shieldbot, bombbot, mech };

// ================================================================ per-frame effects (entry over(), device px)
// Effect bits come from sprites.js defineBit; sprites.js imports this module, so it is loaded lazily on the first use
// (it is fully loaded by then; read only, never edited), as sprites-pirates.js does for the ship.
let SPX = null, spxP = null, BITS = null;
function spx() { if (!spxP) spxP = import('./sprites.js').then((m) => { SPX = m; BITS = defineBits(m); }, () => { spxP = null; }); return SPX; }
function defineBits(m) {
  const noT = { tooth: false };
  return {
    beam: m.defineBit('rb:beam', 3, [104, 10, 2, 5], (c, R) => {
      const pts = []; for (let i = 0; i <= 10; i++) pts.push([i * 10, (R() - 0.5) * 0.9]);
      brush(c, pts, 3.8, C.ink, R, { bristles: 3, dry: 0.04, taper: 0.05, swell: 0.1, per: 3 });
      brush(c, pts, 2.8, LASER, R, { bristles: 3, dry: 0.05, taper: 0.05, swell: 0.1, per: 3 });
      brush(c, pts, 1.6, C.fireO, R, { bristles: 2, dry: 0.08, taper: 0.05, per: 3 });
      brush(c, pts, 0.7, '#fffbe0', R, { bristles: 1, dry: 0.1, taper: 0.05, per: 3 });
    }, noT),
    flare: m.defineBit('rb:flare', 3, [26, 26, 13, 13], (c, R) => {
      const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + R() * 0.2, r = (i % 2 ? 3 : 9.5) * (0.8 + R() * 0.4); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      fill(c, pts, C.yellow, R, { sharp: true, edge: 0 }); outline(c, pts, R, 0.9, { jit: 0.2 });
      dab(c, 0, 0, 3.4, C.fireO, R); dab(c, 0, 0, 1.8, '#fffbe0', R);
    }, noT),
    zap: m.defineBit('rb:zap', 3, [104, 20, 2, 10], (c, R) => {
      const pts = [[0, 0]]; for (let i = 1; i < 8; i++) pts.push([i * 12.5, (R() - 0.5) * 11]); pts.push([100, 0]);
      brush(c, pts, 4, C.ink, R, { bristles: 3, dry: 0.05, taper: 0.1, per: 2 });
      brush(c, pts, 2.5, CYAN, R, { bristles: 3, dry: 0.05, taper: 0.1, per: 2 });
      brush(c, pts, 0.9, '#ffffff', R, { bristles: 1, dry: 0.1, taper: 0.1, per: 2 });
    }, noT),
    field: m.defineBit('rb:field', 2, [112, 56, 56, 28], (c, R, v) => {   // a dashed ring on the ground, r 50
      for (let k = 0; k < 10; k++) {
        const a0 = k / 10 * TAU + v * 0.31, P = [];
        for (let a = a0; a < a0 + 0.3; a += 0.06) P.push([Math.cos(a) * 50, Math.sin(a) * 23]);
        brush(c, P, 1.15, k & 1 ? '#bfe8ff' : '#ffffff', R, { bristles: 2, dry: 0.3, taper: 0.5 });
      }
    }, noT),
    spk: m.defineBit('rb:spk', 3, [10, 10, 5, 5], (c, R, v) => { if (v === 2) dab(c, 0, 0, 1.6, C.yellow, R); else spark(c, 0, 0, 2.6, R); }, noT),
    glow: m.defineBit('rb:glow', 2, [20, 20, 10, 10], (c, R) => {
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + R() * 0.3; brush(c, [[Math.cos(a) * 3.4, Math.sin(a) * 3.4], [Math.cos(a) * 7.6, Math.sin(a) * 7.6]], 1.1, i & 1 ? C.fireO : '#ff3018', R, { bristles: 2, dry: 0.2, taper: 0.7 }); }
      dab(c, 0, 0, 2.8, '#ff3018', R); dab(c, 0, 0, 1.4, C.yellow, R);
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
const boil3 = (rt, ph) => (((rt * 8 + ph * 3) | 0) % 3 + 3) % 3;
function sizeK(SPm, u) { const e = SPm.entOf(u.type).ent; return clamp((u.radius || e.defR) / e.defR, 0.35, 1.7) * e.scale; }
const nowRT = () => performance.now() / 1000;

// laserbot: charge flare on the eye; the beam from the eye along b.beamA for b.beamL px + an impact flare
function laserOver(ctx, u, X, Y, flip, S, now, world) {
  const b = u.b, act = b ? b.act | 0 : 0;
  if (act !== 1 && act !== 2) return;
  const SPm = spx(); if (!SPm || !BITS) return;
  const k = sizeK(SPm, u), rt = nowRT(), ph = (u.id % 13) * 0.1;
  const ex = X / S + flip * LZ.eye[0] * k, ey = Y / S + LZ.eye[1] * k;
  if (act === 1) {
    const q = clamp((now - (b.actT ?? now)) / 0.4, 0, 1);
    blit(ctx, SPX.bit(BITS.flare, boil3(rt, ph)), S, ex, ey, (0.2 + 0.45 * q) * k, (0.2 + 0.45 * q) * k, rt * 3);
    return;
  }
  const L = b.beamL > 0 ? b.beamL : 0, A = b.beamA;
  if (!(L > 0) || A !== A || A === undefined) return;
  const gx = X / S, gy = Y / S + (u.z || 0), r0 = (u.radius || 9.9) + L;   // ground under the bot; the beam runs L px from its edge (sim)
  const tx = gx + Math.cos(A) * r0, ty = gy + Math.sin(A) * r0 - 9;
  const dx = tx - ex, dy = ty - ey, len = Math.sqrt(dx * dx + dy * dy) || 1, fl = 0.85 + 0.25 * Math.sin(rt * 47 + ph * 9);
  blit(ctx, SPX.bit(BITS.beam, boil3(rt * 1.6, ph)), S, ex, ey, len / 100, fl * Math.max(0.7, k), Math.atan2(dy, dx));
  blit(ctx, SPX.bit(BITS.flare, boil3(rt * 1.3, ph + 0.4)), S, tx, ty, 0.6 * fl, 0.6 * fl, rt * 5);
  blit(ctx, SPX.bit(BITS.flare, boil3(rt, ph)), S, ex, ey, 0.55 * k, 0.55 * k, -rt * 4);
}
// drone: the zap's spark line from the prong to its victim, 0.16 s after each zap (b.actT)
function droneOver(ctx, u, X, Y, flip, S, now, world) {
  const b = u.b;
  if (!b || (b.act | 0) !== 1 || now - (b.actT ?? -9) > 0.16 || !world || !world.unitById) return;
  const tid = b.victim >= 0 ? b.victim : u.target, t = tid >= 0 ? world.unitById(tid) : null;
  const SPm = spx(); if (!SPm || !BITS) return;
  const k = sizeK(SPm, u), rt = nowRT();
  const x0 = X / S + flip * DZ.prong[0] * k, y0 = Y / S + DZ.prong[1] * k;
  let x1, y1;
  if (t && !t.dead) { x1 = t.x; y1 = t.y - (t.z || 0) - (t.radius || 8) * 1.1; }
  else { const a = u.face === u.face && u.face !== undefined ? u.face : (u.heading || 0); x1 = x0 + Math.cos(a) * 56; y1 = Y / S + (u.z || 0) + Math.sin(a) * 56 - 10; }   // possessed, zapping at nobody
  const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
  blit(ctx, SPX.bit(BITS.zap, ((rt * 30) | 0) % 3), S, x0, y0, len / 100, 0.75, Math.atan2(dy, dx));
  blit(ctx, SPX.bit(BITS.spk, ((rt * 20) | 0) & 1), S, x1, y1, 1.1, 1.1, rt * 9);
}
// magnetbot: field rings on the ground shrinking from b.pullR into the bot
function magOver(ctx, u, X, Y, flip, S, now, world) {
  const b = u.b;
  if (!b || (b.act | 0) !== 2) return;
  const SPm = spx(); if (!SPm || !BITS) return;
  const R0 = b.pullR > 0 ? b.pullR : 260, gx = X / S, gy = Y / S + (u.z || 0), rt = nowRT();
  const a0 = ctx.globalAlpha;
  for (let i = 0; i < 2; i++) {
    const q = (rt * 0.7 + i / 2 + (u.id % 5) * 0.11) % 1, r = R0 * (1 - q) + 14 * q, al = q < 0.2 ? q / 0.2 : q > 0.85 ? (1 - q) / 0.15 : 1;
    ctx.globalAlpha = a0 * al * 0.55;
    blit(ctx, SPX.bit(BITS.field, i & 1), S, gx, gy, r / 50, r / 50, 0);
  }
  ctx.globalAlpha = a0;
}
// sparks flying off a tool tip (weld, saw run): 5 sparks on short arcs, by real time
function flySparks(ctx, S, x, y, flip, k, rt, ph, up) {
  for (let i = 0; i < 5; i++) {
    const q = (rt * 3.1 + i * 0.213 + ph) % 1, a = -0.4 - i * 0.55 + Math.sin(i * 7.3) * 0.3, sp = (10 + i * 2.2) * k;
    const px = x + flip * Math.cos(a) * sp * q, py = y + Math.sin(a) * sp * q * up + 22 * q * q * k;
    blit(ctx, SPX.bit(BITS.spk, i === 4 ? 2 : (i & 1)), S, px, py, 0.55 * (1 - q * 0.7) * k, 0.55 * (1 - q * 0.7) * k, rt * 7 + i);
  }
}
function repOver(ctx, u, X, Y, flip, S, now, world) {
  const b = u.b;
  if (!b || (b.act | 0) !== 1) return;
  const SPm = spx(); if (!SPm || !BITS) return;
  const k = sizeK(SPm, u);
  flySparks(ctx, S, X / S + flip * 16.8 * k, Y / S - 6.6 * k, flip, k, nowRT(), (u.id % 7) * 0.13, 1);
}
function sawOver(ctx, u, X, Y, flip, S, now, world) {
  const b = u.b;
  if (!b || (b.act | 0) !== 1) return;
  const SPm = spx(); if (!SPm || !BITS) return;
  const k = sizeK(SPm, u);
  flySparks(ctx, S, X / S + flip * 19.6 * k, Y / S - 9.4 * k, flip, k, nowRT(), (u.id % 7) * 0.13, 1.2);
}
// bombbot: the beacon blinks, faster as its target gets closer
function bombOver(ctx, u, X, Y, flip, S, now, world) {
  const b = u.b;
  if (!b || (b.act | 0) !== 1) return;
  const SPm = spx(); if (!SPm || !BITS) return;
  const rt = nowRT();
  if (b.beepT !== undefined && b.beepT > -1e8) { if (now - b.beepT > 0.09) return; }   // lit with each beep (the sim beeps faster as it closes in)
  else {
    let d = 250;
    if (world && world.unitById && u.target >= 0) { const t = world.unitById(u.target); if (t && !t.dead) { const dx = t.x - u.x, dy = t.y - u.y; d = Math.sqrt(dx * dx + dy * dy); } }
    if (((rt * (2.5 + 9 * (1 - clamp(d / 250, 0, 1))) * 2) | 0) & 1) return;
  }
  const k = sizeK(SPm, u);
  blit(ctx, SPX.bit(BITS.glow, ((rt * 8) | 0) & 1), S, X / S + flip * BZ.beacon[0] * k, Y / S + BZ.beacon[1] * k, 0.85 * k, 0.85 * k, 0);
}

// ================================================================ projectiles (fx.js default case)
/** Height of an arcing projectile: the sim's p.z, else its apex arc over its life. */
function zOf(p) {
  if (p.z > 0) return p.z;
  if (p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; return 4 * p.apex * f * (1 - f); }
  return 0;
}
function domeRim(c, R, M, cracks, white) {   // the dome's painted rim, base radius 70: arc 56 high, footprint 70 x 30
  const col = white ? '#ffffff' : '#4cc3f0', arc = [], back = [], front = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + i / 16 * Math.PI; arc.push([Math.cos(a) * 70, Math.sin(a) * 56]); back.push([Math.cos(a) * 70, Math.sin(a) * 30]); }
  for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; front.push([Math.cos(a) * 70, Math.sin(a) * 30]); }
  if (!white) brush(c, back, 1.6, '#bfeeff', R, { bristles: 3, dry: 0.45, taper: 0.2 });
  brush(c, arc, white ? 5 : 3.6, C.ink, R, { bristles: 4, dry: 0.15, taper: 0.1, swell: 0.1 });
  brush(c, arc, white ? 3.6 : 2.4, col, R, { bristles: 4, dry: 0.2, taper: 0.1 });
  brush(c, front, white ? 4 : 3, C.ink, R, { bristles: 4, dry: 0.2, taper: 0.1 });
  brush(c, front, white ? 3 : 2, col, R, { bristles: 3, dry: 0.25, taper: 0.1 });
  if (!white) for (const [a0, a1, rr] of [[3.5, 4.1, 0.86], [3.75, 4.3, 0.72], [4.6, 4.75, 0.9]]) { const P = []; for (let a = a0; a <= a1; a += 0.08) P.push([Math.cos(a) * 70 * rr, Math.sin(a) * 56 * rr]); brush(c, P, 1.7, '#ffffff', R, { bristles: 3, dry: 0.3, taper: 0.6 }); }
  for (let n = 0; n < cracks; n++) {   // cracks running in from the rim
    const a = Math.PI + 0.35 + (n / Math.max(1, cracks)) * 2.4 + (R() - 0.5) * 0.3, P = [[Math.cos(a) * 70, Math.sin(a) * 56]];
    let x = P[0][0], y = P[0][1];
    for (let s = 0; s < 4; s++) { x += -Math.cos(a) * 7 + (R() - 0.5) * 7; y += -Math.sin(a) * 6 + (R() - 0.5) * 6; P.push([x, y]); }
    brush(c, P, 1.4, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.5, per: 2 });
    brush(c, P, 0.6, '#ffffff', R, { bristles: 1, dry: 0.1, taper: 0.5, per: 2 });
  }
}
const ROCKET = { lift0: 4, lift1: 26 };   // art lift px: from the pod mouth (k = 1: ~29 px over the sim's 22) to ~4 px at the end
export const PROJ = {
  // mech rocket: white body, red nose, fins, a flickering flame; a smoke trail behind it. Comes off the pod height (the sim
  // fires it from the mech's feet) and arcs a little (p.z / p.apex if the sim gives them).
  rocket: {
    box: [26, 14, 13, 7], n: 6,
    paint(c, R, v, M) {
      if (v >= 3) { const L = { R, M, burnt: false }; puff(c, L, 0, 0, 2.6 + (v - 3) * 0.5); return; }
      const fl = [[-6.4, -1.4], [-10.6 - v * 1.2, 0], [-6.4, 1.4]];
      fill(c, poly(fl, R, 0.2), C.fireO, R, { edge: 0, vary: 0.06 }); fill(c, poly([[-6.4, -0.7], [-8.8 - v * 0.6, 0], [-6.4, 0.7]], R, 0.1), C.fireY, R, { edge: 0 });
      for (const s of [-1, 1]) part(c, poly([[-6.2, s * 0.8], [-6.8, s * 3], [-3.8, s * 1.2]], R, 0.06), C.red, M, { sharp: true, lw: 0.7 });
      part(c, poly([[-6.2, -1.6], [3.4, -1.6], [6.6, 0], [3.4, 1.6], [-6.2, 1.6]], R, 0.08), '#f6f2e6', M, { sharp: true, lw: 0.9 });
      fill(c, poly([[3.4, -1.5], [6.4, 0], [3.4, 1.5]], R, 0.05), C.red, R, { sharp: true, edge: 0 });
      brush(c, [[-1, -1.4], [-1, 1.4]], 0.7, HAZ, R, { bristles: 1, dry: 0, taper: 0 });
    },
    draw(p, x, y, ang, rt, i, api) {
      // drawn height H = the sim's p.z (arc from the pod height p.rise) + a lift that takes it from the pod's mouth (the art's
      // pod is higher than the sim's launch height) down to just off the ground at the end; the nose follows dH/dt
      const ml = p.maxLife > 0 ? p.maxLife : 1, f = p.maxLife > 0 ? clamp(1 - p.life / p.maxLife, 0, 1) : 0.5, g = 1 - f;
      const z = zOf(p), H = z + ROCKET.lift0 + ROCKET.lift1 * g * g;
      let dH = -2 * ROCKET.lift1 * g;
      if (p.apex > 0) dH += 4 * p.apex * (1 - 2 * f); if (p.rise > 0) dH -= p.rise;
      const vx = p.vx || 0, vy = (p.vy || 0) - dH / ml, a2 = Math.atan2(vy, vx), cs = Math.cos(a2), sn = Math.sin(a2);
      if (H > 6) api.shadowAt(x, y, 0.25, 0.55);
      const yy = y - H;
      for (let k = 0; k < 3; k++) { const d = 10 + k * 6.5; api.put(api.bit(api.sprite, 3 + ((k + ((rt * 9 + i) | 0)) % 3)), x - cs * d, yy - sn * d - k * 0.8, 0.55 + k * 0.22, 0); }
      api.put(api.bit(api.sprite, ((rt * 14 + i) | 0) % 3), x, yy, 1, a2);
      return true;
    },
  },
  // shield dome (effect projectile following its shieldbot, STEP6): see-through wash + painted rim; cracks as p.k drops;
  // flashes white for 0.18 s after a block (p.hitAt, world time). Drawn over the units, radius p.r (base 70).
  dome: {
    box: [156, 102, 78, 66], n: 5,
    paint(c, R, v, M) {
      if (v === 0) {
        const pts = []; for (let i = 0; i <= 20; i++) { const a = Math.PI + i / 20 * Math.PI; pts.push([Math.cos(a) * 69, Math.sin(a) * 55]); }
        for (let i = 1; i < 20; i++) { const a = i / 20 * Math.PI; pts.push([Math.cos(a) * 69, Math.sin(a) * 29]); }
        fill(c, pts, '#c4f0ff', R, { sharp: true, edge: 0, sp: 2.2, vary: 0.14 });
        return;
      }
      domeRim(c, R, M, v === 2 ? 3 : v === 3 ? 7 : 0, v === 4);
    },
    draw(p, x, y, ang, rt, i, api) {
      const r = p.r > 0 ? p.r : 70, sc = r / 70, k = p.k >= 0 ? p.k : 1, ctx = api.ctx;
      const ht = p.hitAt !== undefined ? NOWS.now - p.hitAt : 9, fl = ht >= 0 && ht < 0.18 ? 1 - ht / 0.18 : 0;
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
};
export { OWN as ROBOTS_OWN };
