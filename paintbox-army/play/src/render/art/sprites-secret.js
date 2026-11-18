// SECRET tab sprites (OURS, Part 2 step 7, STEP7.md). Owner: SECRET-ART. Contract: ART.md + RIG.md + PROJ (sprites.js),
// plus drawSecret() for the hidden unit on its map (STEP7.md).
// A 7-year-old's tempera secret friends: a white bed-sheet ghost with a kid face and a bow tie, a grumpy seagull with a
// yellow beak, a shaggy white yeti with a blue face, a cowboy with a huge hat, a moustache and two revolvers, a patched
// scarecrow on a pole with button eyes, a fiery phoenix with a flame tail (and its egg), a mossy bog monster with googly
// eyes and a lily on its head, a giant toddler in a nappy with a rattle, and the scarecrow's black crows. Every entry
// paints ONE frame facing RIGHT, feet (the ground point under it) at (0, 0), up = -y, 1 sprite px = 1 sim px.
//
// Colours. FFA = natural colours (own). The team colour (o.col) is: ghost bow tie, seagull + crow neck band, yeti scarf,
// cowboy shirt, scarecrow shirt, phoenix neck band, bog monster's lily, baby's bib (own colour in FFA for the ghost,
// yeti, cowboy, scarecrow, bog, baby; birds show no band in FFA). o.dead 'dead' = X eyes; 'burnt' = all charcoal.
// o.risen = zombie skin / milky eyes (+ RENDER's green wash). Ghost + phoenix are never raised.
//
// Poses (pick(u, info), from STEP7.md b.act codes):
//   ghost      float0 / float1 (bobbing; hem sways), spook (b.act 1 or u.attack: arms up, mouth wide). Dead: an empty
//              crumpled sheet on the ground (lie 'none'). Floppy ('sghost'): the sheet shears like cloth (the hem lags
//              behind speed changes and flutters), floats up and down, the stubby arms wave.
//   seagull    fly0 / fly1 (wings up / down), dive (b.act 1: nose down, wings folded, beak open), stand (z < 3: on the
//              ground). Dead: on its back, feet up. Floppy ('sbird'): wings flap, the body bobs on the beat and pitches.
//   crow       fly0 / fly1, peck (b.act 1 / u.attack), stand. Same as the seagull, black, smaller, faster flap.
//   phoenix    fly0 / fly1, dive (b.act 1: swept back, flames streaming), egg / egg1 / egg2 (b.act 2 by b.crack 0..1),
//              hatch (b.act 3: shell bursts, the bird pops out). Dead: on its back in a heap of ash. Floppy ('sbird'):
//              big slow flaps, the flame tail streams and lags behind.
//   yeti       idle, walk0 / walk1, throw (b.act 1: snowball overhead), slam (b.act 2 or u.attack: both fists down,
//              snow flies). Floppy ('sbrute'): gorilla arms swing after the body, heavy steps, head lags. Dead: limp.
//   cowboy     idle, walk0 / walk1, shootL / shootR (b.act 1 by b.hand 0 / 1), lasso (b.act 2: the loop just thrown),
//              pull (b.act 3: leaning back, hauling), reload (b.act 4). Hat knocked off = hair (o.hatless). Floppy:
//              the lead's 'biped'. Hat: paintHat (the flying-hat fx).
//   scarecrow  idle, hop0 / hop1 (moving: squat / up on its pole), call (b.act 1: sleeves flap up, mouth open,
//              feathers), atk (pole bonk: leans in). Floppy ('sscare'): hops on its pole, floppy sack head, sleeves flap.
//   bogmonster idle, walk0 / walk1, under (b.under / b.act 1 / u.hidden: two eyes + bubbles in the mud), grab (b.act 2 while
//              up: rears up, mouth wide, arms reaching), chew (b.act 2 while under: churning mud, bubbles, a hand sticking
//              up), punch (b.act 3 or u.attack). Dead: a flat puddle with X eyes (lie 'none').
//              Floppy ('sbrute'): blob squash, eyes wobble on top, arms swing.
//   baby       idle (sitting, shaking the rattle), walk0 / walk1 (crawling), hold (b.act 1: hands round the held unit at its
//              hand, "ooh"), throw (b.act 2), sit (b.act 3: plop!, arms up), cry (b.act 4: tears), atk (u.attack: rattle bonk). Dead: on its back, legs up (lie 'none').
//              Floppy ('sbrute'): crawls in diagonal pairs, a big wobbly bobble head, sitting arms swing.
// Projectiles (PROJ): snowball (lob, spins, shadow), lasso (rope from the cowboy's hand to the loop / victim: p.host,
// p.victim), iceblock (ice cube over a frozen victim: p.host, p.r), feather (a crow / gull feather drifting, if the sim
// sends one).
// drawSecret(ctx, world, S, now, rt): the secret unit hiding on its map (world.map.secret {type, x, y, look}) in its
// look (tower, wreck, underice, rock, field, egg, eyes, sandpit), atlas bits only, a notice-me move every ~3.5 s.
import { C, TAU, lerp, tone, brush, ring, poly, fill, outline, part, dab, tube, spark } from './paint.js';
import { human, humanLeg, humanJoints, LEGS, flameLick } from './people.js';
import { SEC } from './rig-secret.js';

// ---------------------------------------------------------------- shared helpers
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const act = (u) => (u.b ? u.b.act | 0 : 0);
const cl01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const MILK = '#e7edd6';
// RENDER's frame info, kept from the last pick(): world time, real time, the world (the lasso + ice block look units up)
let NOW = 0, WORLD = null;
function keepInfo(info) { if (info) { NOW = info.now; WORLD = info.world || WORLD; } }

/** Paint look for one frame. team = the team colour when it isn't the own colour (Team battle), else null. */
function look(o, own) {
  const burnt = o.dead === 'burnt';
  return {
    o, R: o.R, M: o.M, burnt, zom: !!o.risen && !burnt, dead: o.dead,
    col: burnt ? C.charL : o.col, team: burnt ? null : (o.col && !sameCol(o.col, own) ? o.col : null),
    cl: (x) => (burnt ? C.char : x), acc: (x) => (burnt ? C.charL : x),
  };
}
/** Small misregistration for small parts (a 3 px bow tie can't miss its outline by 1.5 px). */
function sm(L, k = 0.45, lw = 0.85) { const M = L.M; return { R: M.R, mx: M.mx * k, my: M.my * k, grow: M.grow * k, lw }; }
const jit = (P, R, j = 0.25) => P.map(([x, y]) => [x + (R() - 0.5) * 2 * j, y + (R() - 0.5) * 2 * j]);
function ink(c, P, w, R) { brush(c, jit(P, R, 0.15), w, C.ink, R, { bristles: 2, taper: 0.35, dry: 0.2, vary: 0.06 }); }
function xEye(c, x, y, s, R, w = 0.75) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
function rotPts(pts, cx, cy, a) { const cs = Math.cos(a), sn = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]); }
function oval(cx, cy, rx, ry, rot, R, irr = 0.05, n = 9) { return rotPts(ring(cx, cy, rx, ry, R, irr, n), cx, cy, rot); }
/** Paint fn() turned by a about (x, y). */
function about(c, x, y, a, fn) { if (!a) { fn(); return; } c.save(); c.translate(x, y); c.rotate(a); c.translate(-x, -y); fn(); c.restore(); }
/** A sausage round a centre line (widths per point), round caps: chubby limbs with a proper ink outline. */
function capsule(pts0, ws0, shag = 0) {
  let pts = pts0, ws = ws0;
  if (shag) {   // subdivide the centre line, alternate the half-widths: fur tufts along both sides
    pts = []; ws = [];
    for (let i = 0; i < pts0.length - 1; i++) for (let k = 0; k < 4; k++) { const t = k / 4; pts.push([lerp(pts0[i][0], pts0[i + 1][0], t), lerp(pts0[i][1], pts0[i + 1][1], t)]); ws.push(lerp(ws0[Math.min(i, ws0.length - 1)], ws0[Math.min(i + 1, ws0.length - 1)], t) * (k & 1 ? 1 + shag : 1 - shag * 0.3)); }
    pts.push(pts0[pts0.length - 1]); ws.push(ws0[ws0.length - 1]);
  }
  const n = pts.length, Lf = [], Rt = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, w = ws[Math.min(i, ws.length - 1)] / 2;
    Lf.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); Rt.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  const cap = (p, q, w, out) => {   // half circle round p, going out along q -> p
    const dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy) || 1, tx = dx / l, ty = dy / l, nx = -ty, ny = tx;
    for (let k = 1; k < 6; k++) { const t = k / 6 * Math.PI; out.push([p[0] + nx * w * Math.cos(t) + tx * w * Math.sin(t), p[1] + ny * w * Math.cos(t) + ty * w * Math.sin(t)]); }
  };
  const out = Lf.slice();
  cap(pts[n - 1], pts[n - 2], ws[Math.min(n - 1, ws.length - 1)] / 2, out);
  for (let i = n - 1; i >= 0; i--) out.push(Rt[i]);
  cap(pts[0], pts[1], ws[0] / 2, out);
  return out;
}
function limb(c, L, pts, ws, col, M = L.M, lw = 1.2, shag = 0) { part(c, capsule(pts, ws, shag), col, M, { lw, vary: 0.07 }); }
/** Big cartoon eye: white, pupil (px, py = offset as a fraction of r), glint; dead = X; risen = milky. lid 0..1 from the top. */
function eye(c, L, x, y, r, opt = {}) {
  const R = L.R;
  if (L.dead) { xEye(c, x, y, r * 0.75, R, Math.max(0.6, r * 0.35)); return; }
  if (L.zom) { dab(c, x, y, r, MILK, R); dab(c, x + r * 0.2, y + r * 0.2, r * 0.38, C.ink, R); return; }
  if (opt.shut) { brush(c, [[x - r, y + r * 0.1], [x, y - r * 0.55 * opt.shut], [x + r, y + r * 0.1]], Math.max(0.6, r * 0.32), C.ink, R, { bristles: 2, dry: 0, taper: 0.1 }); return; }
  const ry = opt.ry || r;
  fill(c, ring(x, y, r, ry, R, 0.05, 9), opt.white || C.white, R, { edge: 0, vary: 0.03 });
  dab(c, x + r * (opt.px ?? 0.3), y + ry * (opt.py ?? 0.05), r * (opt.pupil || 0.52), C.ink, R);
  if (opt.glint !== false) dab(c, x + r * ((opt.px ?? 0.3) - 0.22), y + ry * ((opt.py ?? 0.05) - 0.3), r * 0.18, C.white, R);
  outline(c, ring(x, y, r, ry, R, 0.04, 9), R, Math.max(0.5, r * 0.2), { jit: 0.08, bristles: 2 });
  if (opt.lid) {   // the top of the eye ball under a lid (a dome cut by the lid line)
    const yy = y - ry + 2 * ry * opt.lid, hw = r * Math.sqrt(Math.max(0, 1 - ((yy - y) / ry) ** 2)), P = [[x - hw, yy]];
    for (let i = 1; i < 10; i++) { const a = Math.PI + i / 10 * Math.PI, py = y + Math.sin(a) * ry * 1.04; if (py < yy) P.push([x + Math.cos(a) * r * 1.04, py]); }
    P.push([x + hw, yy]);
    fill(c, P, opt.lidCol || C.skin, R, { edge: 0, sharp: true });
    brush(c, [[x - hw, yy], [x, yy + ry * 0.12], [x + hw, yy]], Math.max(0.55, r * 0.22), C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  }
}
/** A cloud of puffs (snow, dust): [x, y, r] each. */
function puffs(c, pts, col, R, lw = 0.8) { for (const [x, y, r] of pts) part(c, ring(x, y, r, r * 0.86, R, 0.16, 8), col, { R, mx: 0.4, my: 0.3, grow: 0.15, lw }, { lw, vary: 0.05 }); }
/** Impact lines radiating from (x, y). */
function burst(c, x, y, r0, r1, n, a0, a1, R, w = 0.7) {
  for (let i = 0; i < n; i++) { const a = lerp(a0, a1, n > 1 ? i / (n - 1) : 0.5); brush(c, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], w, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.6 }); }
}
/** A 4-point sparkle. */
function sparkle(c, x, y, r, col, R) {
  const pts = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, k = i % 2 ? 0.32 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.06 * r), col, R, { sharp: true, vary: 0.05, edge: 0 });
  outline(c, pts, R, Math.max(0.4, r * 0.2), { jit: 0.06, bristles: 2 });
}
/** A star burst (hatch, plop): n spikes. */
function starBurst(c, x, y, r, n, col, mid, R) {
  const pts = []; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU + 0.2, k = i % 2 ? 0.5 : 1; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
  fill(c, poly(pts, R, 0.08 * r), col, R, { sharp: true, vary: 0.06, edge: 0 });
  if (mid) dab(c, x, y, r * 0.42, mid, R);
}
function flameAt(c, x, y, ang, s, R) { c.save(); c.translate(x, y); c.rotate(ang); flameLick(c, 0, 0, s, R); c.restore(); }

// ================================================================ GHOST
// A white bed sheet with a kid face (big black oval eyes, pink cheeks), a bow tie in its colour, two stubby arms.
// Floats: the hem sits at y 0 (the sim lifts it to z 12). Parts: armB, sheet (sheet + face + bow), armF; spook variants.
const GH = { own: '#a47bff', sheet: '#fffdf4', shade: '#cad5ea', cheek: '#ffa6c2', mouth: '#4a1424', tongue: '#ff6f93', spook: '#c9b4ff' };
function ghostPts(wave) {
  const P = [[-8.8, -1.4], [-9.5, -10], [-8.8, -18.6], [-6.8, -25.6], [-2.8, -30], [2.4, -30.6], [6.8, -27.8], [9.2, -21.4], [9.8, -12]];
  for (let i = 0; i <= 10; i++) {
    const x = 10.2 - i * 1.9, down = i % 2 === 0;
    P.push([x + (wave && !down ? 0.7 : 0), down ? 1.1 + (wave ? 0.7 * Math.sin(i * 1.3) : 0.3 * Math.sin(i * 2.1)) : -1.9 + (wave ? 0.5 : 0)]);
  }
  return P;
}
function bowTie(c, L, x, y, s = 1) {
  const R = L.R, col = L.burnt ? C.charL : L.o.col, M = sm(L, 0.3, 0.75);
  part(c, poly([[x, y], [x - 3.3 * s, y - 2.1 * s], [x - 3.1 * s, y + 2.1 * s]], R, 0.1), col, M, { lw: 0.75, sharp: true });
  part(c, poly([[x, y], [x + 3.3 * s, y - 2.1 * s], [x + 3.1 * s, y + 2.1 * s]], R, 0.1), col, M, { lw: 0.75, sharp: true });
  dab(c, x, y, 1.15 * s, L.burnt ? C.char : tone(col, -0.3), R);
}
function ghostFace(c, L, spook) {
  const R = L.R;
  if (L.dead) { xEye(c, 2.6, -21.4, 1.3, R, 0.8); xEye(c, 6.9, -21.6, 1.3, R, 0.8); dab(c, 5, -16.6, 0.9, C.ink, R); return; }
  const ey = spook ? -22.4 : -21.6, ry = spook ? 2.9 : 2.4, eyeC = L.burnt ? C.ink : C.ink;
  for (const ex of [2.6, 6.9]) {
    fill(c, ring(ex, ey, 1.7, ry, R, 0.06, 8), eyeC, R, { edge: 0, vary: 0.03 });
    if (!L.burnt) dab(c, ex + 0.5, ey - ry * 0.45, 0.62, C.white, R);
  }
  if (spook) {
    brush(c, [[0.8, -26.2], [3.4, -27.4]], 0.7, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 });
    brush(c, [[5.8, -27.4], [8.4, -26.6]], 0.7, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 });
    fill(c, ring(5, -15.8, 2.5, 3.3, R, 0.1, 9), L.acc(GH.mouth), R, { edge: 0 });
    if (!L.burnt) dab(c, 5.3, -14, 1.25, GH.tongue, R);
  } else fill(c, ring(5.2, -16.7, 1.15, 1.4, R, 0.1, 8), L.acc(GH.mouth), R, { edge: 0 });
  if (!L.burnt) { dab(c, 9, -18.4, 1.15, GH.cheek, R); dab(c, 0.6, -18.2, 0.95, GH.cheek, R); }
}
function ghostSheet(c, L, spook, wave) {
  const R = L.R;
  part(c, poly(ghostPts(wave), R, 0.18), L.cl(GH.sheet), L.M, { vary: 0.05, sp: 0.8 });
  if (!L.burnt) {
    brush(c, [[-6.6, -3.2], [-7.4, -11], [-6.6, -19], [-4.4, -25.2]], 2.4, GH.shade, R, { bristles: 4, dry: 0.55, taper: 0.7, vary: 0.04 });
    brush(c, [[-2.2, -2.6], [-2.8, -8]], 1.1, GH.shade, R, { bristles: 2, dry: 0.6, taper: 0.8 });
    brush(c, [[3.6, -2.2], [4, -7]], 1, GH.shade, R, { bristles: 2, dry: 0.6, taper: 0.8 });
  }
  ghostFace(c, L, spook);
  bowTie(c, L, 2.8, -12.8);
}
function ghostArm(c, L, front, spook) {
  const P = front ? (spook ? [[9, -10.6], [12.4, -14.6], [14, -20]] : [[9.2, -9.6], [12.2, -7.8], [13.6, -5]])
    : (spook ? [[-8.8, -10.8], [-12.2, -14.8], [-13.6, -20.2]] : [[-9, -9.6], [-12, -7.6], [-13.4, -4.8]]);
  limb(c, L, P, [3.4, 3, 3.2], L.cl(front ? GH.sheet : GH.shade), sm(L, 0.4, 1), 1);
  if (spook && !L.burnt) { const e = P[2]; for (let k = -1; k <= 1; k++) brush(c, [[e[0] + k * 1.6, e[1] - 2.4], [e[0] + k * 2.2 + 0.4, e[1] - 4]], 0.5, C.ink, L.R, { bristles: 1, dry: 0.4, taper: 0.6 }); }
}
function ghostDead(c, L) {
  const R = L.R;
  part(c, poly([[-13, -1], [-12, -4.4], [-7, -6.8], [-1, -7.9], [5, -7.2], [10, -5.8], [13.4, -2.6], [12, 0.6], [6, 1.2], [0, 0.3], [-6, 1.2]], R, 0.3), L.cl(GH.sheet), L.M, { vary: 0.05 });
  for (const P of [[[-6.4, -5], [-3.6, -1.4]], [[1.6, -6.8], [3, -2]], [[8, -5.2], [9.6, -1.2]]]) brush(c, P, 0.55, L.burnt ? C.ink : GH.shade, R, { bristles: 2, dry: 0.3, taper: 0.5 });
  xEye(c, 0.8, -4.4, 1.05, R, 0.7); xEye(c, 4.6, -4.7, 1.05, R, 0.7);
  bowTie(c, L, 9, -1.2, 0.8);
}
function ghostPaint(c, o) {
  const L = look(o, GH.own), p = o.pose;
  if (isPart(p)) {
    if (p === 'r:sheet' || p === 'r:sheetS') ghostSheet(c, L, p === 'r:sheetS', 0);
    else ghostArm(c, L, p === 'r:armF' || p === 'r:armFS', p === 'r:armFS' || p === 'r:armBS');
    return;
  }
  if (L.dead) { ghostDead(c, L); return; }
  const spook = p === 'spook';
  ghostArm(c, L, false, spook);
  ghostSheet(c, L, spook, p === 'float1' ? 1 : 0);
  ghostArm(c, L, true, spook);
  if (spook && !L.burnt) for (const [x, y, s] of [[-11.6, -24, 1], [12.6, -27, -1]]) brush(c, [[x, y], [x + 1.4 * s, y - 2], [x, y - 4], [x + 1.4 * s, y - 6]], 0.8, GH.spook, L.R, { bristles: 2, dry: 0.3, taper: 0.5 });
}

// ================================================================ BIRDS (seagull, crow)
// Side view, body round (0, -7), head (5.8, -10.6), wing shoulder SH. Parts: wingB (far, darker), body (tail + body +
// head + beak + feet + band), wingF. The wing's rest place is half up (a glide); the rig flaps it about SH.
const GULL = { s: 1, own: '#ffc81e', body: '#fbfbf6', shade: '#cdd4dc', wing: '#a9b5c2', wingD: '#8693a2', tip: '#1c1916', beak: '#ffc81e', spot: '#e3241a', feet: '#ff9a3c', crow: false };
const CROW = { s: 0.84, own: '#4a4458', body: '#2e2a35', shade: '#4d4860', wing: '#38333f', wingD: '#221f28', tip: '#141217', beak: '#6a6a74', spot: null, feet: '#6a6a74', crow: true };
const SH = [1, -8.6];
function birdWing(c, L, B, far, ang) {
  const R = L.R, M = sm(L, 0.35, 1);
  c.save(); c.translate(SH[0], SH[1]); c.rotate(ang); c.translate(-SH[0], -SH[1]);
  if (far) c.translate(1.3, -0.9);
  const P = poly([[2.6, -8], [0.8, -10.8], [-2.8, -13.6], [-7.6, -15.8], [-12.2, -16.6], [-8.8, -13.8], [-5, -11], [-1.6, -8.2]], R, 0.12);
  part(c, P, L.cl(far ? B.wingD : B.wing), M, { lw: 1 });
  fill(c, poly([[-7.2, -15.5], [-12.1, -16.5], [-8.9, -13.9], [-6.8, -13.3]], R, 0.1), L.acc(B.tip), R, { edge: 0, sharp: true });
  if (B.crow) for (const [a, b] of [[[-9, -15.2], [-13.6, -17.6]], [[-9.6, -14.4], [-13.8, -15.2]], [[-9.2, -13.8], [-12.8, -12.8]]]) brush(c, [a, b], 0.9, L.acc(B.tip), R, { bristles: 2, dry: 0.2, taper: 0.7 });
  else if (!L.burnt) { dab(c, -10.2, -15.7, 0.55, C.white, R); brush(c, [[-1, -9.6], [-5.4, -12.4]], 0.45, tone(B.wing, -0.3), R, { bristles: 1, dry: 0.4, taper: 0.5 }); }
  c.restore();
}
function birdFold(c, L, B, far) {
  const R = L.R, M = sm(L, 0.35, 1), dx = far ? 0.8 : 0, dy = far ? -0.8 : 0;
  part(c, poly([[3.4 + dx, -9.4 + dy], [-1 + dx, -10.9 + dy], [-6 + dx, -10.7 + dy], [-11.6 + dx, -8.8 + dy], [-6.4 + dx, -7.2 + dy], [-0.4 + dx, -7.4 + dy]], R, 0.12), L.cl(far ? B.wingD : B.wing), M, { lw: 1 });
  fill(c, poly([[-7.6 + dx, -10.3 + dy], [-11.5 + dx, -8.8 + dy], [-7.2 + dx, -7.7 + dy]], R, 0.1), L.acc(B.tip), R, { edge: 0, sharp: true });
}
function birdBody(c, L, B, open, stand) {
  const R = L.R, M = sm(L, 0.4, 1.05);
  part(c, poly([[-4.6, -8.8], [-10.8, -9.8], [-10, -7.8], [-11.2, -6.4], [-4.8, -5.6]], R, 0.12), L.cl(B.crow ? B.wing : B.body), M, { lw: 1 });
  if (stand) {
    for (const x of [-0.8, 1.6]) { brush(c, [[x, -4.2], [x - 0.2, -0.3]], 0.8, L.acc(B.feet), R, { bristles: 2, dry: 0, taper: 0 }); fill(c, poly([[x - 1.6, 0.2], [x + 1.4, 0.3], [x - 0.2, -0.9]], R, 0.1), L.acc(B.feet), R, { edge: 0, sharp: true }); }
  } else dab(c, -1.4, -3.6, 1, L.acc(B.feet), R);
  part(c, oval(0, -7, 6.6, 3.9, -0.1, R, 0.05, 10), L.cl(B.body), M, { lw: 1.1 });
  if (!L.burnt) brush(c, [[-4.6, -4.6], [0, -3.6], [4.4, -4.6]], 1.4, B.shade, R, { bristles: 3, dry: 0.4, taper: 0.5 });
  part(c, ring(5.8, -10.6, 3.3, 3.1, R, 0.06, 8), L.cl(B.body), M, { lw: 1.05 });
  // beak (open: the lower half drops)
  const bc = L.acc(B.beak), bm = sm(L, 0.2, 0.8);
  if (B.crow) {
    part(c, poly([[8.2, -11.8], [13.8, -10.6], [8.6, -10.2]], R, 0.08), bc, bm, { lw: 0.8, sharp: true });
    about(c, 8.4, -10.2, open ? 0.5 : 0, () => part(c, poly([[8.6, -10.2], [12.8, -10.1], [8.4, -9.2]], R, 0.08), tone(bc, -0.15), bm, { lw: 0.8, sharp: true }));
  } else {
    part(c, poly([[8.4, -11.7], [12.8, -11.1], [13.5, -9.9], [8.6, -10.3]], R, 0.08), bc, bm, { lw: 0.8, sharp: true });
    about(c, 8.6, -10.2, open ? 0.55 : 0, () => {
      part(c, poly([[8.6, -10.2], [12.2, -9.9], [8.8, -9.1]], R, 0.08), bc, bm, { lw: 0.8, sharp: true });
      if (!L.burnt) dab(c, 11.3, -9.95, 0.6, B.spot, R);
    });
  }
  // eye: the gull glares (a cross brow), the crow's is beady
  if (L.dead) xEye(c, 6.8, -11.3, 0.75, R, 0.6);
  else if (L.zom) dab(c, 6.8, -11.3, 1, MILK, R);
  else if (B.crow) { dab(c, 6.9, -11.4, 1.05, '#ece6d2', R); dab(c, 7.2, -11.4, 0.55, C.ink, R); }
  else { dab(c, 6.9, -11.3, 0.78, C.ink, R); brush(c, [[5.3, -13.1], [7.9, -12]], 0.7, C.ink, R, { bristles: 2, dry: 0, taper: 0.2 }); }
  if (L.team) brush(c, [[3.4, -13], [3.1, -10.6], [3.3, -8.4]], 1.5, L.team, R, { bristles: 2, dry: 0.1, taper: 0 });
}
function birdDead(c, L, B) { about(c, 0, -4.6, Math.PI, () => { birdFold(c, L, B, true); birdBody(c, L, B, true, true); birdFold(c, L, B, false); }); }
function birdPaint(c, o, B) {
  const L = look(o, B.own), p = o.pose;
  c.save(); if (B.s !== 1) c.scale(B.s, B.s);
  if (isPart(p)) {
    if (p === 'r:body') birdBody(c, L, B, false, false);
    else birdWing(c, L, B, p === 'r:wingB', 0);
  } else if (L.dead) birdDead(c, L, B);
  else if (p === 'fly0' || p === 'fly1') {
    const up = p === 'fly0';
    birdWing(c, L, B, true, up ? 0.5 : -0.62);
    birdBody(c, L, B, false, false);
    birdWing(c, L, B, false, up ? 0.62 : -0.78);
  } else if (p === 'dive' || p === 'peck') {
    if (p === 'dive') for (let i = 0; i < 3; i++) brush(c, [[-8 - i * 1.4, -18 + i * 2.6], [-14 - i * 1.4, -22 + i * 2.6]], 0.6, C.ink, L.R, { bristles: 1, dry: 0.4, taper: 0.7 });
    about(c, 0, -7, p === 'dive' ? 0.62 : 0.34, () => { birdFold(c, L, B, true); birdBody(c, L, B, true, false); birdFold(c, L, B, false); });
  } else { birdFold(c, L, B, true); birdBody(c, L, B, false, true); birdFold(c, L, B, false); }
  c.restore();
}

// ================================================================ PHOENIX
// A fire bird: red body, orange belly, flame crest, golden hooked beak, wings of flame feathers, a long streaming flame
// tail. Body round (0, -14), wing shoulder PSH. Parts: wingB, tail, body, wingF. Egg: a golden egg with flame spots.
const PX = { own: '#ff5a1f', red: '#e8341c', redD: '#b42410', orange: '#ff8f1f', gold: '#ffc52e', yellow: '#ffe44a', beak: '#ffcf2e', ash: '#8f8a84', ashL: '#b9b3ab' };
const PSH = [2, -16.5];
const PFEATH = [[[-1, -18.4], [-13, -19]], [[-4, -21.2], [-17.4, -25]], [[-7, -23.8], [-20.4, -31]], [[-10, -26.2], [-21.4, -37.4]], [[-12.6, -28], [-19, -42]]];
function phxWing(c, L, far, ang) {
  const R = L.R;
  c.save(); c.translate(PSH[0], PSH[1]); c.rotate(ang); c.translate(-PSH[0], -PSH[1]);
  if (far) c.translate(1.6, -1.4);
  for (let i = PFEATH.length - 1; i >= 0; i--) {
    const [r0, t] = PFEATH[i], m = [lerp(r0[0], t[0], 0.55), lerp(r0[1], t[1], 0.55) - 1];
    brush(c, [r0, m, t], 4.2, L.cl(far ? PX.redD : PX.orange), R, { bristles: 5, taper: 0.85, dry: 0.25, vary: 0.08 });
    if (!L.burnt) brush(c, [m, t], 1.8, far ? PX.orange : PX.yellow, R, { bristles: 3, taper: 0.8, dry: 0.3 });
    ink(c, [[r0[0] + 0.8, r0[1] - 1.6], [m[0] + 0.6, m[1] - 1.8], t], 0.55, R);
  }
  part(c, poly([[4.4, -15.6], [1.4, -20.6], [-3.6, -25.6], [-10, -28.8], [-14, -28.6], [-8, -24], [-3, -19.2], [0, -15.2]], R, 0.15), L.cl(far ? PX.redD : PX.red), sm(L, 0.5, 1.2), { lw: 1.2 });
  if (!L.burnt) brush(c, [[2.6, -17.6], [-2.4, -23.4], [-9, -27.4]], 1.1, far ? PX.orange : PX.yellow, R, { bristles: 2, dry: 0.4, taper: 0.5 });
  c.restore();
}
function phxTail(c, L, stream = 1) {
  const R = L.R, k = stream;
  const plumes = [
    [[-8, -15], [-17, -16], [-26 * k, -17], [-34 * k, -21]],
    [[-8, -13], [-16, -11], [-25 * k, -8], [-33 * k, -9]],
    [[-8, -12], [-15, -7], [-23 * k, -3], [-30 * k, 1]],
  ];
  for (const P of plumes) {
    brush(c, P, 4.8, L.cl(PX.red), R, { bristles: 5, taper: 0.55, dry: 0.3, vary: 0.08 });
    if (!L.burnt) { brush(c, P, 2.8, PX.orange, R, { bristles: 4, taper: 0.7, dry: 0.3 }); brush(c, P.slice(1), 1.2, PX.yellow, R, { bristles: 2, taper: 0.8, dry: 0.3 }); }
    const a = P[3], b = P[2], ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
    if (!L.burnt) { flameAt(c, a[0], a[1], ang, 1.1, R); dab(c, P[2][0], P[2][1], 1.5, PX.gold, R); dab(c, P[2][0], P[2][1], 0.7, PX.redD, R); }
    ink(c, [[P[0][0], P[0][1] - 2], [P[1][0], P[1][1] - 2.2], [P[2][0], P[2][1] - 2]], 0.5, R);
  }
}
function phxBody(c, L, open) {
  const R = L.R, M = L.M;
  if (!L.burnt) for (const x of [-1.6, 1.4]) brush(c, [[x, -8.6], [x + 1.6, -6.4]], 1, PX.gold, R, { bristles: 2, dry: 0, taper: 0.4 });
  part(c, oval(0, -14, 10.8, 6.6, -0.12, R, 0.05, 11), L.cl(PX.red), M, { lw: 1.4 });
  if (!L.burnt) {
    fill(c, oval(2.4, -11.2, 7, 3.2, -0.1, R, 0.06, 9), PX.orange, R, { edge: 0 });
    brush(c, [[-1, -10.6], [3, -9.8], [7, -11]], 1, PX.yellow, R, { bristles: 2, dry: 0.4, taper: 0.5 });
  }
  if (!L.burnt) for (const [x, y, a, s] of [[7.4, -24.2, -2.3, 1.25], [9.6, -24.8, -1.9, 1.1], [5.6, -22.8, -2.75, 1.05]]) flameAt(c, x, y, a, s, R);
  part(c, ring(10.2, -20.4, 5.1, 4.7, R, 0.07, 9), L.cl(PX.red), sm(L, 0.5, 1.25), { lw: 1.25 });
  // beak
  const bm = sm(L, 0.2, 0.85);
  part(c, poly([[13.8, -22], [18.6, -21], [18.2, -18.6], [16.6, -19.6], [14, -19.4]], R, 0.1), L.acc(PX.beak), bm, { lw: 0.9, sharp: true });
  if (open) part(c, poly([[14, -19.2], [17.6, -17.4], [14.4, -17.6]], R, 0.1), L.acc(PX.beak), bm, { lw: 0.8, sharp: true });
  if (!L.burnt) brush(c, [[9.6, -21.4], [6.6, -21.6], [4.6, -23.6]], 0.9, PX.yellow, R, { bristles: 2, dry: 0.3, taper: 0.6 });
  if (L.dead) xEye(c, 12, -21.6, 1.2, R, 0.75);
  else eye(c, L, 12, -21.6, 1.75, { px: 0.32, pupil: 0.55 });
  if (L.team) brush(c, [[6.4, -18.4], [7.8, -15.8], [10, -15.4]], 1.6, L.team, R, { bristles: 2, dry: 0.1, taper: 0 });
}
function eggPts(R) { const P = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, s = Math.sin(a); P.push([7.6 * Math.cos(a), -10 + s * (s < 0 ? 11.4 : 9.6)]); } return poly(P, R, 0.15); }
function phxEgg(c, L, crack) {
  const R = L.R;
  if (!L.burnt) { c.save(); c.globalAlpha = 0.55; for (const [x, r] of [[-7, 2.6], [-2.4, 3.2], [3, 3], [7.4, 2.4]]) dab(c, x, -0.8, r, PX.orange, R); c.restore(); }
  part(c, eggPts(R), L.cl(PX.gold), L.M, { lw: 1.4 });
  if (!L.burnt) {
    for (const [x, y, s] of [[-3, -6, 0.75], [3.4, -12.6, 0.65], [-2.2, -15.4, 0.55], [3.6, -4.2, 0.6]]) flameAt(c, x, y, -Math.PI / 2, s, R);
    dab(c, -3.6, -15.8, 1.6, '#fff4c2', R); brush(c, [[-5.4, -11], [-5, -15]], 0.9, '#fff4c2', R, { bristles: 2, dry: 0.4, taper: 0.6 });
  }
  if (crack >= 1) {
    if (crack >= 2 && !L.burnt) brush(c, [[-7, -11.6], [-3.6, -13.6], [-1, -10.8], [2.4, -13.8], [5, -11], [7.4, -12.6]], 2, '#fff7b0', R, { bristles: 3, dry: 0.2, taper: 0 });
    ink(c, [[-7.2, -11.4], [-3.6, -13.6], [-1, -10.8], [2.4, -13.8], [5, -11], [7.4, -12.4]], 0.7, R);
  }
  if (crack >= 2) {
    ink(c, [[-1, -10.8], [-1.6, -7.4], [0.4, -5]], 0.6, R); ink(c, [[2.4, -13.8], [3, -17], [1.6, -19.4]], 0.6, R);
    if (!L.burnt) flameAt(c, 0.6, -21.2, -Math.PI / 2, 0.8, R);
  }
}
function phxHatch(c, L) {
  const R = L.R;
  if (!L.burnt) starBurst(c, 0, -18, 17, 9, PX.yellow, PX.orange, R);
  c.save(); c.translate(0, -5); c.scale(0.86, 0.86);
  phxWing(c, L, true, 0.55); phxBody(c, L, true); phxWing(c, L, false, 0.7);
  c.restore();
  // bottom shell half (jagged rim) in front, the top piece flying off
  const P = poly([[-7.6, -8], [-5, -11.4], [-2.6, -8.4], [0, -11.6], [2.6, -8.2], [5.2, -11.2], [7.6, -8], [7, -3], [3, -0.2], [-3, -0.2], [-7, -3]], R, 0.15);
  part(c, P, L.cl(PX.gold), L.M, { lw: 1.3 });
  about(c, -13, -32, -0.7, () => part(c, poly([[-19, -30], [-16, -36], [-11, -38], [-7, -35], [-8, -31], [-10.6, -33], [-13, -30], [-15.6, -32]], R, 0.15), L.cl(PX.gold), L.M, { lw: 1.2 }));
}
function phxDead(c, L) {
  const R = L.R;
  puffs(c, [[-12, -2, 3.2], [-5, -2.6, 3.8], [3, -2.4, 3.6], [10, -1.8, 3]], L.burnt ? C.charL : PX.ash, R);
  about(c, 0, -8.6, Math.PI, () => { phxWing(c, L, true, -0.9); phxBody(c, L, true); phxWing(c, L, false, -0.95); });
  if (!L.burnt) brush(c, [[-4, -1], [-9, -9], [-10, -14]], 1.8, PX.red, R, { bristles: 3, taper: 0.8, dry: 0.3 });
}
function phxPaint(c, o) {
  const L = look(o, PX.own), p = o.pose;
  if (isPart(p)) {
    if (p === 'r:tail') phxTail(c, L);
    else if (p === 'r:body') phxBody(c, L, false);
    else phxWing(c, L, p === 'r:wingB', 0);
    return;
  }
  if (L.dead) { phxDead(c, L); return; }
  if (p === 'egg' || p === 'egg1' || p === 'egg2') { phxEgg(c, L, p === 'egg' ? 0 : p === 'egg1' ? 1 : 2); return; }
  if (p === 'hatch') { phxHatch(c, L); return; }
  if (p === 'dive') {
    if (!L.burnt) for (const [y, l] of [[-24, 14], [-16, 18], [-8, 12]]) brush(c, [[-14, y], [-14 - l, y - 3]], 2.2, PX.orange, L.R, { bristles: 3, dry: 0.5, taper: 0.9 });
    about(c, 0, -14, 0.45, () => { phxWing(c, L, true, -0.72); phxTail(c, L, 1.12); phxBody(c, L, true); phxWing(c, L, false, -0.66); });
    return;
  }
  const up = p === 'fly0';
  phxWing(c, L, true, up ? 0.35 : -0.5);
  phxTail(c, L);
  phxBody(c, L, false);
  phxWing(c, L, false, up ? 0.45 : -0.62);
}

// ================================================================ YETI
// White shaggy ape, blue face with little fangs, long arms knuckling the ground, big blue feet, a scarf in its colour.
// Parts: legB, legF, armB, body (torso + scarf), head (+ open-mouth variant), armF (+ throw / slam variants).
const YT = { own: '#2fa8ff', fur: '#f6f8fc', furS: '#c9d7ea', furD: '#9cb0cb', face: '#8cc4f4', faceD: '#4f88cc', foot: '#7fb0e6', mouth: '#2b1d3a', snow: '#ffffff', snowS: '#cfe3f7' };
export const YJ = { hipB: [-5, -15], hipF: [5, -15], neck: [7, -40], shB: [-6, -37], shF: [7, -36], pivot: [0, -15] };
function shaggy(cx, cy, rx, ry, n, tuft, R) {
  const P = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, k = 1 + (i % 2 ? tuft : -tuft * 0.3) + (R() - 0.5) * 0.06; P.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  return P;
}
function furFlicks(c, R, pts, col = C.ink, w = 0.5) { for (const [x, y, a, l] of pts) brush(c, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], w, col, R, { bristles: 1, dry: 0.3, taper: 0.7 }); }
function yetiLeg(c, L, far) {
  const R = L.R, x = far ? -5 : 5;
  part(c, poly([[x - 5.6, -18], [x - 6.6, -12], [x - 5.6, -9], [x - 6.4, -5], [x - 5.6, -3.4], [x + 5.8, -3.2], [x + 6.6, -7], [x + 5.8, -10], [x + 6.4, -14], [x + 5.2, -18]], R, 0.3), L.cl(far ? YT.furS : YT.fur), L.M, { lw: 1.4 });
  if (!L.burnt) brush(c, [[x - 3, -16], [x - 3.6, -6]], 1.6, far ? YT.furD : YT.furS, R, { bristles: 3, dry: 0.5, taper: 0.6 });
  const sole = L.zom ? C.zskin : YT.foot;
  part(c, ring(x + 1.8, -1.8, 6.6, 2.6, R, 0.08, 8), L.cl(sole), sm(L, 0.4, 1.1), { lw: 1.1 });
  furFlicks(c, R, [[x + 6.6, -2.8, 0.2, 1], [x + 7.6, -1.2, 0.4, 0.9]]);
}
function yetiBody(c, L) {
  const R = L.R;
  part(c, poly(shaggy(-0.8, -26.6, 15.6, 17, 26, 0.09, R), R, 0.2), L.cl(YT.fur), L.M, { lw: 1.6 });
  if (!L.burnt) {
    brush(c, [[-10, -16], [-12, -26], [-9.6, -36]], 3.4, YT.furS, R, { bristles: 5, dry: 0.5, taper: 0.6 });
    brush(c, [[-4, -14], [2, -13], [8, -15]], 2, YT.furS, R, { bristles: 4, dry: 0.5, taper: 0.6 });
    for (const [x, y] of [[-3, -30], [3, -24], [-6, -21], [5, -32]]) brush(c, [[x, y], [x + 1.2, y + 2], [x + 0.4, y + 3.6]], 0.7, YT.furS, R, { bristles: 2, dry: 0.4, taper: 0.6 });
  }
  furFlicks(c, R, [[-14.6, -22, 3.3, 1.6], [-14.2, -31, 3.5, 1.4], [13.6, -18, -0.2, 1.4], [-6, -42.6, -1.9, 1.4]]);
  const sc = L.acc(L.o.col);
  brush(c, [[-8.8, -41.6], [-6.4, -45.2], [-9.6, -48.6]], 2.4, sc, R, { bristles: 3, dry: 0.15, taper: 0.4 });
  brush(c, [[-8.4, -41.4], [-11.6, -38], [-12.4, -33.4]], 2.4, sc, R, { bristles: 3, dry: 0.15, taper: 0.4 });
  brush(c, [[-8.6, -40.4], [0, -37.6], [9, -36.6], [15, -37.6]], 4, sc, R, { bristles: 4, dry: 0.1, taper: 0 });
  if (!L.burnt) for (const x of [-4, 3, 9]) brush(c, [[x, -40], [x + 0.6, -35.8]], 0.7, tone(sc, -0.3), R, { bristles: 1, dry: 0.2, taper: 0.2 });
}
function yetiHead(c, L, open) {
  const R = L.R, face = L.cl(L.zom ? C.zskin : YT.face);
  part(c, poly(shaggy(7, -46.4, 10.4, 9.6, 18, 0.11, R), R, 0.2), L.cl(YT.fur), L.M, { lw: 1.5 });
  part(c, ring(12.4, -44.6, 6.8, 6.8, R, 0.08, 9), face, sm(L, 0.4, 1.1), { lw: 1.15 });
  if (!L.burnt) brush(c, [[8.4, -42], [10, -39.8]], 0.9, YT.faceD, R, { bristles: 2, dry: 0.4, taper: 0.6 });
  brush(c, [[6.2, -50.2], [11.6, -51.8], [17.6, -50.2]], 3.2, L.cl(YT.fur), R, { bristles: 4, dry: 0.2, taper: 0.2 });
  ink(c, [[6.8, -48.8], [11.6, -50.2], [17, -48.8]], 0.6, R);
  if (L.dead) { xEye(c, 11.6, -47.2, 1, R, 0.65); xEye(c, 15, -47.4, 1, R, 0.65); }
  else if (L.zom) { dab(c, 11.6, -47.2, 1.1, MILK, R); dab(c, 15, -47.4, 1.1, MILK, R); }
  else for (const x of [11.6, 15.2]) { dab(c, x, -47, 1.45, C.white, R); dab(c, x + 0.3, -46.9, 0.9, C.ink, R); dab(c, x, -47.3, 0.3, C.white, R); }
  for (const x of [16.6, 17.8]) dab(c, x, -44.8, 0.5, L.burnt ? C.ink : YT.faceD, R);
  const fang = (x, y, d) => { fill(c, [[x - 0.8, y], [x, y + d * 1.6], [x + 0.8, y]], C.white, R, { edge: 0, sharp: true }); brush(c, [[x - 0.8, y], [x, y + d * 1.6], [x + 0.8, y]], 0.35, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); };
  if (open || L.dead) {
    fill(c, ring(14, -41.4, 3.4, open ? 2.6 : 1.4, R, 0.1, 9), L.acc(YT.mouth), R, { edge: 0 });
    if (L.dead) dab(c, 15.4, -40, 1.1, '#ff7a90', R);
    else { fang(12.4, -43.6, 1); fang(15.6, -43.6, 1); fang(12.8, -39.2, -1); fang(15.2, -39.2, -1); }
  } else {
    ink(c, [[10.4, -41.8], [13.6, -40.8], [16.8, -42]], 0.65, R);
    fang(12.2, -41.2, -1); fang(15.4, -41.4, -1);
  }
}
const Y_ARMS = {
  idle: { B: [[-6, -37], [-11.4, -26], [-10.6, -11]], F: [[8, -36], [16.4, -27], [16.4, -11]] },
  throw: { B: [[-6, -38], [-9, -51], [-6, -61]], F: [[8, -36], [17, -34], [25, -37]] },
  slam: { B: [[-5, -36], [9, -25], [17, -8]], F: [[7, -35], [17, -24], [23, -8.4]] },
};
function yetiArm(c, L, far, key) {
  const R = L.R, P = Y_ARMS[key][far ? 'B' : 'F'], e = P[2];
  limb(c, L, P, [13, 11, 9], L.cl(far ? YT.furS : YT.fur), L.M, 1.4, 0.16);
  if (!L.burnt) brush(c, [P[0], P[1], e], 2, far ? YT.furD : YT.furS, R, { bristles: 3, dry: 0.55, taper: 0.7 });
  const fist = L.cl(L.zom ? C.zskin : YT.face), up = key === 'throw' && far;
  part(c, ring(e[0] + (up ? 0 : 0.6), e[1] + (up ? -1.6 : 2.4), 4.4, 3.8, R, 0.1, 8), fist, sm(L, 0.4, 1.1), { lw: 1.1 });
  if (!up) for (const dx of [-1.6, 0.4, 2.4]) brush(c, [[e[0] + dx, e[1] + 4.2], [e[0] + dx + 0.3, e[1] + 2.4]], 0.45, C.ink, R, { bristles: 1, dry: 0.2, taper: 0.4 });
  if (up) {
    part(c, ring(e[0] - 0.6, e[1] - 7.4, 6.2, 5.9, R, 0.08, 9), L.cl(YT.snow), L.M, { lw: 1.3 });
    if (!L.burnt) { brush(c, [[e[0] - 5, e[1] - 6], [e[0] - 2, e[1] - 2.6], [e[0] + 3, e[1] - 3]], 1.6, YT.snowS, R, { bristles: 3, dry: 0.4, taper: 0.5 }); dab(c, e[0] - 2.4, e[1] - 10, 1.1, '#ffffff', R); }
  }
  if (key === 'slam' && !far && !L.burnt) {
    burst(c, e[0] + 1, e[1] + 4, 6, 11, 4, -2.6, -0.6, R, 0.75);
    puffs(c, [[e[0] - 4, e[1] + 5, 2.6], [e[0] + 6, e[1] + 4.6, 3], [e[0] + 2, e[1] + 1.6, 2]], YT.snow, R, 0.7);
  }
}
function yetiWhole(c, L, pose) {
  const key = pose === 'throw' ? 'throw' : pose === 'slam' ? 'slam' : 'idle';
  const lean = pose === 'throw' ? -0.12 : pose === 'slam' ? 0.26 : 0;
  const w = pose === 'walk0' ? 0.32 : pose === 'walk1' ? -0.32 : 0.05;
  about(c, YJ.hipB[0], YJ.hipB[1], w, () => yetiLeg(c, L, true));
  about(c, YJ.hipF[0], YJ.hipF[1], -w, () => yetiLeg(c, L, false));
  about(c, YJ.pivot[0], YJ.pivot[1], lean, () => {
    about(c, YJ.shB[0], YJ.shB[1], key === 'idle' ? -w * 0.6 : 0, () => yetiArm(c, L, true, key));
    yetiBody(c, L);
    yetiHead(c, L, key !== 'idle');
    about(c, YJ.shF[0], YJ.shF[1], key === 'idle' ? w * 0.6 : 0, () => yetiArm(c, L, false, key));
  });
}
function yetiPaint(c, o) {
  const L = look(o, YT.own), p = o.pose;
  if (!isPart(p)) { yetiWhole(c, L, L.dead ? 'idle' : p); return; }
  switch (p) {
    case 'r:legB': yetiLeg(c, L, true); break;
    case 'r:legF': yetiLeg(c, L, false); break;
    case 'r:body': yetiBody(c, L); break;
    case 'r:head': yetiHead(c, L, false); break;
    case 'r:headO': yetiHead(c, L, true); break;
    default: { const [, side, key] = p.split(':'); yetiArm(c, L, side === 'armB', key || 'idle'); }
  }
}

// ================================================================ COWBOY
// human() body + head (people.js) in his colour, a big brown hat, a moustache, a red spotted neckerchief, a leather
// vest with a tin star, a belt buckle and two revolvers. Parts (biped): leg, body, head, arm:<pose>.
const CB = { own: '#dc9b1f', hat: '#7a4a22', hatB: '#3b2414', vest: '#8a5a30', star: '#ffd51e', kerch: '#e3241a', gun: '#5b5f68', grip: '#8b5a2b', rope: '#d9b878', ropeD: '#a8844a' };
const CB_J = humanJoints('soldier');
function revolver(c, L, hx, hy, ang, flash) {
  const R = L.R, M = sm(L, 0.25, 0.75);
  c.save(); c.translate(hx, hy); c.rotate(ang);
  part(c, poly([[-0.8, -0.6], [1, -0.2], [0.2, 3], [-1.8, 2.8]], R, 0.08), L.acc(CB.grip), M, { lw: 0.7, sharp: true });
  part(c, poly([[-1.2, -2], [2.8, -2.2], [3, 0.4], [-1, 0.6]], R, 0.08), L.acc(CB.gun), M, { lw: 0.75, sharp: true });
  brush(c, [[2.4, -1.2], [7.2, -1.2]], 1.4, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, 7, -2.2, 0.45, C.ink, R);
  if (flash && !L.burnt) { spark(c, 9.4, -1.2, 2.8, R); for (const dy of [-3.6, 1.6]) brush(c, [[10.6, -1.2 + dy * 0.4], [13, -1.2 + dy]], 0.5, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.6 }); }
  c.restore();
}
function cowArm(c, L, pts) { brush(c, pts, 1.3, C.ink, L.R, { bristles: 2, taper: 0.2, dry: 0.1 }); }
function cowHand(c, L, x, y) { dab(c, x, y, 1.1, L.burnt ? C.charL : L.zom ? C.zskin : C.skin, L.R); }
function rope(c, L, P, w = 0.95) { brush(c, P, w + 0.9, C.ink, L.R, { bristles: 2, dry: 0.05, taper: 0 }); brush(c, P, w, L.acc(CB.rope), L.R, { bristles: 2, dry: 0.1, taper: 0 }); }
function cowArms(c, L, key) {
  if (L.zom) { human(c, 'cowboy', L.col, 'aim', L.M, L.dead, C.zskin, { layer: 'arms', risen: true }); return; }
  const R = L.R;
  switch (key) {
    case 'shootR':
      cowArm(c, L, [[-1.8, -15.6], [0.6, -18.4], [2.6, -20.6]]); revolver(c, L, 2.6, -21, -1.3, false); cowHand(c, L, 2.6, -21);
      cowArm(c, L, [[2.4, -16.6], [6.6, -16.8], [10.4, -17]]); revolver(c, L, 10.6, -17, -0.05, true); cowHand(c, L, 10.6, -17);
      break;
    case 'shootL':
      cowArm(c, L, [[-1.6, -15.4], [3.4, -15.2], [9.2, -15.4]]); revolver(c, L, 9.4, -15.4, 0.02, true); cowHand(c, L, 9.4, -15.4);
      cowArm(c, L, [[2.4, -16.4], [4.8, -18.6], [5.8, -21.6]]); revolver(c, L, 5.8, -22, -1.35, false); cowHand(c, L, 5.8, -22);
      break;
    case 'lasso': {   // the loop just thrown (the flying loop is the projectile): arm flung forward-up, coil in the other hand
      cowArm(c, L, [[-1.8, -15.4], [0.4, -12.4], [3, -11.4]]);
      for (let i = 0; i < 2; i++) rope(c, L, ring(4.4, -10.6 + i * 0.6, 2.6, 1.8, R, 0.1, 7).concat([[6.8, -10.4]]), 0.6);
      cowHand(c, L, 3, -11.4);
      if (!L.burnt) brush(c, [[-3, -31], [2.6, -33.6], [9, -31.6], [12.6, -26]], 1.6, '#f1eee6', R, { bristles: 3, taper: 0.9, dry: 0.6 });
      cowArm(c, L, [[2.4, -17], [6.4, -21], [9.4, -24.4]]);
      rope(c, L, [[5.6, -10.6], [8, -16], [9.4, -24.4]], 0.6);
      cowHand(c, L, 9.4, -24.4);
      break;
    }
    case 'pull':
      rope(c, L, [[7.2, -14.6], [11.6, -14.8], [17, -15]], 0.9);
      rope(c, L, [[1.8, -14.2], [-3, -10], [-6, -6.2], [-9, -6.8]], 0.8);
      cowArm(c, L, [[-1.8, -15.4], [2.6, -14.8], [6.4, -14.6]]); cowHand(c, L, 6.4, -14.6);
      cowArm(c, L, [[2.4, -16.6], [6.6, -15.4], [9.6, -15]]); cowHand(c, L, 9.6, -15);
      break;
    case 'reload':
      cowArm(c, L, [[-1.8, -15.4], [0.6, -12.6], [3.2, -12.4]]); revolver(c, L, 3.2, -12.4, 0.5, false); cowHand(c, L, 3.2, -12.4);
      cowArm(c, L, [[2.4, -16.4], [5.6, -15.4], [6.6, -17.6]]); revolver(c, L, 6.6, -18, -0.7, false); cowHand(c, L, 6.6, -18);
      if (!L.burnt) for (const [x, y] of [[10.6, -22], [12.4, -19], [9.4, -25.4]]) { dab(c, x, y, 0.75, C.yellow, R); dab(c, x - 0.3, y - 0.3, 0.25, C.white, R); }
      break;
    default:   // idle / walk: both guns held low, ready
      cowArm(c, L, [[-1.8, -15.6], [-2.6, -12.6], [-3.6, -10.8]]); revolver(c, L, -3.6, -10.8, 0.95, false); cowHand(c, L, -3.6, -10.8);
      cowArm(c, L, [[2.4, -16.4], [4.2, -13.4], [6.2, -11.8]]); revolver(c, L, 6.2, -11.8, 0.42, false); cowHand(c, L, 6.2, -11.8);
  }
}
function cowBody(c, L) {
  const R = L.R, skin = L.burnt ? C.charL : L.zom ? C.zskin : C.skin;
  human(c, 'cowboy', L.col, 'aim', L.M, L.dead, skin, { layer: 'body', risen: L.o.risen });
  if (!L.zom) {
    fill(c, poly([[-5, -17.6], [-2.8, -18.1], [-2.6, -9.6], [-5.2, -10]], R, 0.15), L.acc(CB.vest), R, { edge: 0, sharp: true });
    brush(c, [[-2.8, -18.1], [-2.5, -9.8]], 0.55, C.ink, R, { bristles: 1, dry: 0.2, taper: 0 });
    if (!L.burnt) sparkle(c, 3, -13.8, 1.35, CB.star, R);
  }
  brush(c, [[-5.4, -9.6], [0, -9.1], [5.4, -9.6]], 1.4, L.acc('#3b2414'), R, { bristles: 2, dry: 0.1, taper: 0 });
  if (!L.burnt) dab(c, 3.4, -9.4, 0.85, C.yellow, R);
  part(c, poly([[-1.6, -18.8], [5.2, -19], [2.4, -14.8]], R, 0.1), L.acc(CB.kerch), sm(L, 0.25, 0.75), { lw: 0.75, sharp: true });
  if (!L.burnt) for (const [x, y] of [[0.6, -18], [3.2, -17.8], [2.2, -16.2]]) dab(c, x, y, 0.32, C.white, R);
  dab(c, -1.6, -18.4, 0.9, L.acc(tone(CB.kerch, -0.2)), R);
}
function cowHat(c, L, M = L.M) {
  const R = M.R, felt = L.acc(CB.hat);
  part(c, poly([[-4.6, -26.4], [-4.4, -31.4], [-2.6, -33.6], [-0.4, -32.4], [1.6, -33.8], [4.2, -33.2], [5.6, -31], [5.8, -26.4]], R, 0.2), felt, M, { lw: 1.15 });
  brush(c, [[-4.6, -28], [0.6, -27.6], [5.8, -28]], 1.5, L.acc(CB.hatB), R, { bristles: 2, dry: 0.1, taper: 0 });
  part(c, poly([[-10, -28.8], [-7, -26.8], [0.6, -26], [8, -26.6], [11.2, -29], [9.8, -25.2], [0.6, -24.3], [-8.8, -25]], R, 0.18), felt, M, { lw: 1.15 });
  if (!L.burnt) brush(c, [[-3, -31], [-2.6, -28.8]], 0.6, tone(CB.hat, 0.25), R, { bristles: 1, dry: 0.4, taper: 0.5 });
}
function cowHead(c, L) {
  const R = L.R, skin = L.burnt ? C.charL : L.zom ? C.zskin : C.skin;
  human(c, 'cowboy', L.col, 'aim', L.M, L.dead, skin, { layer: 'head', risen: L.o.risen, hatless: L.o.hatless });
  if (!L.zom && !L.dead) brush(c, [[-0.6, -18.8], [0.8, -19.8], [2.4, -19.4], [4, -19.8], [5.2, -18.6]], 1.3, L.burnt ? C.ink : '#3b2618', R, { bristles: 3, dry: 0.1, taper: 0.2 });
  if (!L.o.hatless) cowHat(c, L);
}
const CB_LEGS = { pull: [[[-1.8, -8], [-5, -1.2], [-7.4, -0.2]], [[1.8, -8], [4.4, -1.4], [6.8, 0]]] };
const CB_KEY = { shootL: 'shootL', shootR: 'shootR', lasso: 'lasso', pull: 'pull', reload: 'reload' };
const CB_LEAN = { pull: -0.22, shootL: -0.03, shootR: -0.03, lasso: 0.04 };
function cowPaint(c, o) {
  const L = look(o, CB.own), p = o.pose;
  if (isPart(p)) {
    if (p === 'r:leg') humanLeg(c, 'soldier', L.M, L.burnt);
    else if (p === 'r:body') cowBody(c, L);
    else if (p === 'r:head') cowHead(c, L);
    else cowArms(c, L, p.slice(6));
    return;
  }
  const legs = CB_LEGS[p] || LEGS[p === 'walk0' || p === 'walk1' ? p : 'aim'];
  for (const lg of legs) brush(c, lg, 1.9, C.ink, L.R, { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 });
  about(c, 0, -8, L.dead ? 0 : (CB_LEAN[p] || 0), () => { cowBody(c, L); cowHead(c, L); cowArms(c, L, L.dead ? 'idle' : CB_KEY[p] || 'idle'); });
}

// ================================================================ SCARECROW
// Hops on its wooden pole. Patched shirt in its colour, straw tufts at the hem, cuffs and neck, a burlap sack head with
// two button eyes and a stitched mouth, a floppy straw hat. Parts: pole, armB, body, head, armF (+ raised / open variants).
const SC = { own: '#e05a2b', pole: '#9c6b3c', straw: '#ecc65a', strawD: '#c9962c', sack: '#d8b47a', sackD: '#b08a52', patch: '#f2c94c', hatB: '#d64a2a', feather: '#26222e' };
export const SCJ = { base: [0, 0], hip: [0, -13], neck: [1, -26.4], shB: [-4.4, -23.6], shF: [4.6, -23.6] };
function straw(c, L, pts) { for (const [x0, y0, x1, y1, d] of pts) brush(c, [[x0, y0], [x1, y1]], 0.9, L.acc(d ? SC.strawD : SC.straw), L.R, { bristles: 2, dry: 0.3, taper: 0.7 }); }
function scPole(c, L) { tube(c, [[0.2, 0], [0, -8], [0, -15]], 1.9, L.cl(SC.pole), L.R, 1); }
function scBody(c, L) {
  const R = L.R;
  straw(c, L, [[-4.4, -13.6, -5.8, -9.8, 0], [-1.6, -13, -2, -9.2, 1], [1.4, -13, 1.6, -9.4, 0], [4.4, -13.4, 6, -10, 1], [-3, -13, -3.6, -10.4, 0]]);
  part(c, poly([[-5.4, -25.8], [5.8, -26], [6.8, -13.4], [3, -12.4], [0, -13.4], [-3, -12.4], [-6.4, -13.2]], R, 0.25), L.cl(L.o.col), L.M, { lw: 1.3 });
  part(c, poly([[-4.6, -21.4], [-0.8, -21.6], [-0.6, -17.6], [-4.6, -17.4]], R, 0.12), L.acc(SC.patch), sm(L, 0.3, 0.7), { lw: 0.7, sharp: true });
  for (const [x, y] of [[-4.6, -21.4], [-0.8, -21.6], [-0.6, -17.6], [-4.6, -17.4]]) brush(c, [[x - 0.6, y - 0.6], [x + 0.6, y + 0.6]], 0.4, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  if (!L.burnt) brush(c, [[2.6, -24], [3, -15]], 0.6, tone(L.o.col, -0.3), R, { bristles: 1, dry: 0.3, taper: 0.4 });
  for (const [x, y] of [[1.2, -22.6], [1.4, -19.4], [1.6, -16.2]]) dab(c, x, y, 0.55, C.ink, R);
  brush(c, [[-6.2, -15.6], [0, -15.2], [6.6, -15.8]], 1.1, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });
  straw(c, L, [[-2.2, -26, -3.4, -28.2, 0], [0.6, -26.2, 0.6, -28.8, 1], [3, -26, 4.4, -28, 0]]);
}
function scArm(c, L, far, up) {
  const R = L.R, s = far ? -1 : 1, sh = far ? SCJ.shB : SCJ.shF;
  about(c, sh[0], sh[1], up ? -0.75 * s : 0, () => {
    const x0 = sh[0], y0 = sh[1];
    straw(c, L, [[x0 + 8.4 * s, y0 - 1, x0 + 12 * s, y0 - 2.8, 0], [x0 + 8.8 * s, y0 + 0.2, x0 + 12.8 * s, y0 + 0.4, 1], [x0 + 8.4 * s, y0 + 1.4, x0 + 11.6 * s, y0 + 3.4, 0]]);
    part(c, poly([[x0 - 1.4 * s, y0 - 2.2], [x0 + 8.6 * s, y0 - 1.6], [x0 + 9 * s, y0 + 2], [x0 - 1.2 * s, y0 + 2.8]], R, 0.18), L.cl(far ? tone(L.o.col, -0.18) : L.o.col), sm(L, 0.4, 1.1), { lw: 1.1 });
    if (!L.burnt) brush(c, [[x0 + 7.4 * s, y0 - 1.6], [x0 + 7.6 * s, y0 + 2.2]], 0.7, tone(L.o.col, -0.35), R, { bristles: 1, dry: 0.2, taper: 0 });
  });
}
function scHead(c, L, open) {
  const R = L.R, sack = L.cl(L.zom ? C.zskin : SC.sack);
  straw(c, L, [[-0.8, -26.6, -2, -24.8, 1], [1.6, -26.6, 1.8, -24.4, 0], [3.6, -26.4, 4.6, -24.8, 1]]);
  part(c, ring(1.4, -31, 5.6, 5.2, R, 0.12, 9), sack, L.M, { lw: 1.3 });
  if (!L.burnt) for (const [x0, y0, x1, y1] of [[-2.4, -33, 0, -27.6], [-0.6, -34.6, 2.6, -27.6], [4.2, -34.6, 5.6, -29]]) brush(c, [[x0, y0], [x1, y1]], 0.45, SC.sackD, R, { bristles: 1, dry: 0.4, taper: 0.3 });
  brush(c, [[-3.4, -26.8], [1.4, -26.2], [6, -26.8]], 0.9, L.acc(C.brown), R, { bristles: 2, dry: 0.1, taper: 0 });
  if (L.dead) { xEye(c, 2.6, -32, 1, R, 0.6); xEye(c, 5.8, -32.2, 1, R, 0.6); }
  else if (L.zom) { dab(c, 2.6, -32, 1.2, MILK, R); dab(c, 5.8, -32.2, 1.2, MILK, R); }
  else for (const x of [2.6, 5.8]) { dab(c, x, -32, 1.3, C.ink, R); for (const [dx, dy] of [[-0.4, -0.4], [0.4, 0.4]]) dab(c, x + dx, -32 + dy, 0.22, '#8a8a8a', R); }
  if (open && !L.dead) fill(c, ring(4.2, -28.6, 2, 1.5, R, 0.1, 8), '#3a1e12', R, { edge: 0 });
  else {
    ink(c, [[1.2, -28.6], [3.6, -28.2], [6.2, -28.8]], 0.5, R);
    for (const x of [1.8, 3.2, 4.6, 5.8]) brush(c, [[x, -29.4], [x + 0.2, -27.8]], 0.35, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  }
  // floppy straw hat with a red band and a patch
  const hat = L.acc(SC.straw);
  part(c, poly([[-7.8, -34.4], [0.6, -35.6], [9.4, -34.8], [10.8, -33], [0.8, -33.8], [-8.8, -33]], R, 0.18), hat, sm(L, 0.4, 1.1), { lw: 1.1 });
  part(c, poly([[-3.6, -35], [-3.2, -39.4], [1, -41], [4.8, -39.4], [5.2, -35.2]], R, 0.18), hat, sm(L, 0.4, 1.1), { lw: 1.1 });
  brush(c, [[-3.6, -36.2], [0.8, -36], [5.2, -36.4]], 1.2, L.acc(SC.hatB), R, { bristles: 2, dry: 0.1, taper: 0 });
  if (!L.burnt) { fill(c, poly([[0.6, -40], [3, -40.2], [3, -38.2], [0.8, -38]], R, 0.1), '#7fb7e6', R, { edge: 0, sharp: true }); straw(c, L, [[-7.8, -33.4, -9.6, -31.4, 1], [9.6, -33.6, 11.4, -31.8, 0]]); }
}
function feather(c, x, y, a, s, col, R) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  fill(c, poly([[-3.4, 0], [-1, -1.3], [2.6, -0.9], [3.6, 0], [2.4, 0.9], [-1, 1.2]], R, 0.1), col, R, { edge: 0 });
  brush(c, [[-4.2, 0.2], [3.4, 0]], 0.35, C.ink, R, { bristles: 1, dry: 0, taper: 0.3 });
  c.restore();
}
function scWhole(c, L, pose) {
  const call = pose === 'call';
  let lift = 0, sy = 1, lean = 0;
  if (pose === 'hop1') lift = -5; else if (pose === 'hop0') sy = 0.9; else if (pose === 'atk') lean = 0.38;
  if (pose === 'hop1' && !L.burnt) for (let i = 0; i < 3; i++) brush(c, [[-3 + i * 3, 1.4], [-3.6 + i * 3, 3.6]], 0.55, C.ink, L.R, { bristles: 1, dry: 0.3, taper: 0.6 });
  c.save(); c.translate(0, lift); c.scale(1, sy);
  about(c, 0, 0, lean, () => {
    scPole(c, L); scArm(c, L, true, call); scBody(c, L); scHead(c, L, call); scArm(c, L, false, call);
  });
  c.restore();
  if (call && !L.burnt) { feather(c, 13, -37, -0.5, 1, SC.feather, L.R); feather(c, -12, -39, 0.6, 0.9, SC.feather, L.R); feather(c, 15, -26, 0.3, 0.8, SC.feather, L.R); }
  if (pose === 'atk' && !L.burnt) starBurst(c, 19, -27, 4.2, 6, C.yellow, C.orange, L.R);
}
function scPaint(c, o) {
  const L = look(o, SC.own), p = o.pose;
  if (!isPart(p)) { scWhole(c, L, L.dead ? 'idle' : p); return; }
  switch (p) {
    case 'r:pole': scPole(c, L); break;
    case 'r:body': scBody(c, L); break;
    case 'r:head': scHead(c, L, false); break;
    case 'r:headO': scHead(c, L, true); break;
    case 'r:armB': scArm(c, L, true, false); break;
    case 'r:armBU': scArm(c, L, true, true); break;
    case 'r:armF': scArm(c, L, false, false); break;
    case 'r:armFU': scArm(c, L, false, true); break;
  }
}

// ================================================================ BOG MONSTER
// A lumpy mossy mound with two big googly eyes on top, a wide crooked grin, blobby arms, mud dripping off it, weeds,
// and a water lily on its head in its colour. Parts: armB, body (+ open-mouth variant), eyes, armF (+ punch).
const BG = { own: '#ff6fb0', base: '#6f7d32', dark: '#4b5222', moss: '#a3b23c', mud: '#5b4127', mudL: '#7a5a38', mouth: '#2a1a12', weed: '#3f8a2a', lily: '#f6f0a0' };
export const BGJ = { pivot: [0, 0], neck: [8, -30], shB: [-13, -15], shF: [13, -15] };
function bogBodyPts(R, tall = 1) {
  return poly([[-19, -1], [-20.4, -8], [-18.6, -17], [-14, -26], [-7, -32], [1, -34.6], [8, -33.4], [13.6, -28.6], [17.4, -20], [19.8, -10], [20.4, -1.4], [13, 0.6], [4, -0.4], [-5, 0.8], [-12, -0.4]].map(([x, y]) => [x, y * tall]), R, 0.35);
}
function drips(c, L, xs, y) { for (const [x, l] of xs) { brush(c, [[x, y], [x + 0.2, y + l]], 1.5, L.cl(BG.mud), L.R, { bristles: 2, dry: 0, taper: -0.3 }); dab(c, x + 0.2, y + l + 0.4, 1, L.cl(BG.mud), L.R); } }
function lily(c, L, x, y) {
  const R = L.R, col = L.burnt ? C.charL : L.o.col;
  fill(c, ring(x, y + 0.8, 4.4, 1.4, R, 0.1, 8), L.acc(BG.weed), R, { edge: 0 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, px = x + Math.cos(a) * 2.2, py = y - 1.2 + Math.sin(a) * 1.1; part(c, ring(px, py, 1.6, 1.1, R, 0.1, 7), col, sm(L, 0.2, 0.55), { lw: 0.55 }); }
  dab(c, x, y - 1.4, 1, L.acc(C.yellow), R);
}
function bogBody(c, L, open, tall = 1) {
  const R = L.R, M = L.M, base = L.cl(L.zom ? tone(C.zskin, -0.25) : BG.base);
  if (!L.burnt) for (const [x0, y0, x1, y1] of [[-9, -30, -12, -38], [-6, -32, -5, -40], [-11, -27, -16, -33]]) brush(c, [[x0, y0 * tall], [x1, y1 * tall]], 0.9, BG.weed, R, { bristles: 2, dry: 0.3, taper: 0.7 });
  part(c, bogBodyPts(R, tall), base, M, { lw: 1.7 });
  if (!L.burnt) {
    for (const [x, y, r] of [[-12, -12, 3.2], [-6, -20, 2.6], [10, -8, 2.8], [-15, -4, 2.2], [2, -6, 2.2]]) dab(c, x, y * tall, r, BG.dark, R);
    for (const [x, y, r] of [[-8, -29, 2.2], [-2, -32, 2], [4, -32.6, 1.6], [-13, -24, 1.8], [13, -25, 1.4]]) dab(c, x, y * tall, r, BG.moss, R);
    brush(c, [[-16, -10 * tall], [-17, -20 * tall], [-12, -27 * tall]], 2, tone(BG.base, -0.2), R, { bristles: 3, dry: 0.5, taper: 0.6 });
  }
  if (!L.burnt) for (const [x, y, r] of [[-16, -1.4, 2.6], [-9, -0.6, 2.2], [-2, -0.8, 2.4], [6, -0.4, 2], [13, -0.8, 2.4]]) dab(c, x, y, r, BG.mud, R);
  drips(c, L, [[-19.4, 1.6], [19.6, 1.4]], -9);
  // mouth: a wide crooked grin (open: a dark cave with teeth)
  const my = open ? -16 * tall : -21;
  if (open) {
    fill(c, poly([[2, my - 4.4], [9, my - 6], [17, my - 4], [16.4, my + 4], [9, my + 5.6], [2.4, my + 2]], R, 0.3), L.acc(BG.mouth), R, { edge: 0 });
    if (!L.burnt) dab(c, 10, my + 2.4, 2.2, '#c2485a', R);
  } else fill(c, poly([[3, my - 2.6], [9, my - 0.4], [16.4, my - 2], [15, my + 1.4], [9, my + 3.2], [3.6, my + 1]], R, 0.25), L.acc(BG.mouth), R, { edge: 0 });
  for (const [x, d] of [[5.6, 1], [9.4, 1.3], [13.4, 1]]) { const ty = open ? my - 5 + (x === 9.4 ? -0.6 : 0) : my - 1; fill(c, [[x - 1, ty], [x, ty + 2 * d], [x + 1, ty]], C.white, R, { edge: 0, sharp: true }); brush(c, [[x - 1, ty], [x, ty + 2 * d], [x + 1, ty]], 0.35, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
  lily(c, L, -3.4, -34.2 * tall);
}
function bogEyes(c, L, y0 = 0, lid = 0.2) {
  const lidCol = L.cl(L.zom ? tone(C.zskin, -0.25) : BG.base);
  for (const [x, y, r] of [[5, -34.6, 4.9], [12.6, -31.6, 4.3]]) {
    part(c, ring(x, y + y0 + 2.6, r * 0.8, r * 0.6, L.R, 0.1, 8), lidCol, sm(L, 0.3, 1), { lw: 1 });
    eye(c, L, x, y + y0, r, { px: 0.32, py: 0.12, pupil: 0.48, lid, lidCol });
  }
}
const BG_ARMS = {
  B: [[-13, -15], [-18.6, -9], [-21.6, -3.6]],
  F: [[13, -15], [18.6, -9], [21.6, -3.6]],
  punch: [[13, -16], [22, -15], [30, -14]],
  grabB: [[-10, -26], [2, -34], [14, -38]],
  grabF: [[12, -26], [22, -32], [29, -36]],
};
function bogArm(c, L, key) {
  const R = L.R, P = BG_ARMS[key], far = key === 'B' || key === 'grabB', e = P[2];
  limb(c, L, P, [8.4, 7.4, 6.6], L.cl(far ? tone(BG.base, -0.2) : L.zom ? tone(C.zskin, -0.25) : BG.base), L.M, 1.4);
  part(c, ring(e[0] + (key === 'punch' ? 1.2 : 0), e[1] + (key === 'punch' ? 0 : 1), 4.6, 4.2, R, 0.14, 8), L.cl(far ? tone(BG.base, -0.25) : BG.base), sm(L, 0.4, 1.2), { lw: 1.2 });
  if (!L.burnt) dab(c, P[1][0], P[1][1] - 1.4, 1.6, BG.moss, R);
  if (key !== 'punch' && key !== 'grabB' && key !== 'grabF') drips(c, L, [[e[0] - 1, 2.6]], e[1] + 4.6);
  if (key === 'punch' && !L.burnt) burst(c, e[0] + 2, e[1], 6, 10.4, 4, -0.8, 0.8, R, 0.7);
}
function bogUnder(c, L) {
  const R = L.R;
  part(c, ring(0, -1, 15, 4.4, R, 0.12, 11), L.cl(BG.mud), L.M, { lw: 1.2 });
  if (!L.burnt) { brush(c, [[-10, -1.6], [-2, -3.6], [8, -2]], 1.2, BG.mudL, R, { bristles: 2, dry: 0.4, taper: 0.5 }); fill(c, ring(4, -2.2, 9, 2.4, R, 0.1, 9), tone(BG.mud, -0.2), R, { edge: 0 }); }
  bogEyes(c, L, 29, 0.3);
  for (const [x, y, r] of [[-9, -5.4, 1.5], [-6.4, -8, 1], [14, -4.6, 1.2]]) outline(c, ring(x, y, r, r, R, 0.1, 7), R, 0.55, { jit: 0.05, bristles: 2 });
}
function bogChew(c, L) {   // under the mud with someone in its grip: churning, bubbles, a splash, a hand sticking up
  const R = L.R;
  bogUnder(c, L);
  if (L.burnt) return;
  puffs(c, [[-12, -3, 2.2], [-15.6, -5.6, 1.6], [16, -3.6, 2], [18.6, -6.6, 1.4]], BG.mudL, R, 0.6);
  for (const [x, y, r] of [[-4, -9, 1.4], [1, -12, 1], [-1.4, -14.6, 0.7], [15.6, -10, 1.1]]) outline(c, ring(x, y, r, r, R, 0.1, 7), R, 0.5, { jit: 0.05, bristles: 2 });
  brush(c, [[-7, -1.8], [-7.6, -6.4]], 1.6, C.ink, R, { bristles: 2, dry: 0.1, taper: 0 }); dab(c, -7.8, -7.4, 1.5, C.skin, R);
  burst(c, -7.6, -8, 3, 5.4, 3, -2.4, -0.8, R, 0.5);
}
function bogDead(c, L) {
  const R = L.R;
  part(c, ring(0, -2.6, 22, 5.6, R, 0.14, 13), L.cl(BG.base), L.M, { lw: 1.5 });
  if (!L.burnt) { dab(c, -10, -3, 2.6, BG.dark, R); dab(c, 8, -2, 2.2, BG.dark, R); dab(c, -2, -5, 2, BG.moss, R); }
  for (const x of [3, 9]) { part(c, ring(x, -6.4, 2.6, 2.2, R, 0.1, 8), L.cl(C.white), sm(L, 0.2, 0.8), { lw: 0.8 }); xEye(c, x, -6.4, 1.1, R, 0.6); }
  lily(c, L, -14, -4);
}
function bogPaint(c, o) {
  const L = look(o, BG.own), p = o.pose;
  if (isPart(p)) {
    switch (p) {
      case 'r:body': bogBody(c, L, false); break;
      case 'r:bodyO': bogBody(c, L, true); break;
      case 'r:eyes': bogEyes(c, L); break;
      case 'r:armB': bogArm(c, L, 'B'); break;
      case 'r:armF': bogArm(c, L, 'F'); break;
      case 'r:armP': bogArm(c, L, 'punch'); break;
    }
    return;
  }
  if (L.dead) { bogDead(c, L); return; }
  if (p === 'under') { bogUnder(c, L); return; }
  if (p === 'chew') { bogChew(c, L); return; }
  if (p === 'grab') {
    bogArm(c, L, 'grabB'); bogBody(c, L, true, 1.18); bogEyes(c, L, -6.4, 0.05); bogArm(c, L, 'grabF');
    return;
  }
  const w = p === 'walk0' ? 0.14 : p === 'walk1' ? -0.14 : 0, lean = p === 'punch' ? 0.1 : w * 0.3;
  about(c, 0, 0, lean, () => {
    about(c, BGJ.shB[0], BGJ.shB[1], -w * 1.6, () => bogArm(c, L, 'B'));
    bogBody(c, L, false); bogEyes(c, L);
    if (p === 'punch') bogArm(c, L, 'punch'); else about(c, BGJ.shF[0], BGJ.shF[1], w * 1.6, () => bogArm(c, L, 'F'));
  });
}

// ================================================================ BABY
// A giant toddler in a nappy with a bib in its colour and a rattle. Crawls on all fours (walk0 / walk1), sits up when it
// stops (idle, hold, throw, sit, cry). Crawl parts: legB armB crawl chead armF legF. Sit parts: sit (body + legs +
// nappy + bib), sh:<face> (calm, cry, ooh, laugh), sa:<pose> (both arms: idle, cry, hold, throw).
const BB = { own: '#5fc4ff', skin: C.skin, skinD: '#e89a6c', blush: '#ff8fa6', nappy: '#fcfcf6', trim: '#9fd1ff', pin: '#c9c9cf', hair: '#e8b34a', mouth: '#7a1a24', tongue: '#ff7f95', tear: '#7fcaff', rattle: '#ffd51e', ball: '#e3241a' };
export const BBJ = {
  crawl: { pivot: [-2, -22], hipB: [-12, -21], hipF: [-9, -20], shB: [11, -25], shF: [14, -24], neck: [16, -30] },
  sit: { pivot: [0, -12], neck: [3, -42], shB: [-5, -38], shF: [7, -38] },
};
function bskin(L, d = 0) { return L.burnt ? (d ? C.char : C.charL) : L.zom ? (d ? C.zskinD : C.zskin) : (d ? BB.skinD : BB.skin); }
function foot(c, L, x, y, a, s = 1) {
  const R = L.R;
  about(c, x, y, a, () => {
    part(c, ring(x, y, 3.6 * s, 4.8 * s, R, 0.1, 8), bskin(L), sm(L, 0.4, 1.1), { lw: 1.1 });
    if (!L.burnt) dab(c, x + 0.6 * s, y + 0.4 * s, 2.2 * s, '#ffb2a0', R);
    for (let i = 0; i < 4; i++) dab(c, x + (1.6 + i * 0.1) * s, y - (3.2 - i * 1.7) * s, 0.9 * s, bskin(L), R);
  });
}
function hand(c, L, x, y, r = 3.4) { part(c, ring(x, y, r, r * 0.86, L.R, 0.12, 8), bskin(L), sm(L, 0.4, 1.1), { lw: 1.1 }); }
function nappy(c, L, cx, cy, rx, ry) {
  const R = L.R;
  part(c, ring(cx, cy, rx, ry, R, 0.08, 10), L.cl(BB.nappy), L.M, { lw: 1.5 });
  if (!L.burnt) {
    brush(c, [[cx - rx * 0.8, cy - ry * 0.55], [cx, cy - ry * 0.75], [cx + rx * 0.8, cy - ry * 0.55]], 1.2, BB.trim, R, { bristles: 2, dry: 0.2, taper: 0.2 });
    brush(c, [[cx - rx * 0.4, cy + ry * 0.2], [cx - rx * 0.1, cy + ry * 0.6]], 0.6, '#d9dde2', R, { bristles: 1, dry: 0.4, taper: 0.5 });
    dab(c, cx + rx * 0.45, cy - ry * 0.5, 1.4, BB.pin, R); brush(c, [[cx + rx * 0.45, cy - ry * 0.5], [cx + rx * 0.45 + 3.6, cy - ry * 0.5 + 0.6]], 0.7, '#9a9aa2', R, { bristles: 1, dry: 0, taper: 0 });
    dab(c, cx + rx * 0.45 + 3.6, cy - ry * 0.5 + 0.6, 0.9, C.yellow, R);
  }
}
function bib(c, L, P) {
  const R = L.R, col = L.burnt ? C.charL : L.o.col;
  part(c, poly(P, R, 0.2), col, sm(L, 0.4, 1), { lw: 1 });
  if (!L.burnt) { brush(c, P.slice(0, 2), 1, C.white, R, { bristles: 2, dry: 0.2, taper: 0 }); const m = P[3]; dab(c, m[0] - 1.6, m[1] - 4, 1.4, C.yellow, R); dab(c, m[0] - 0.6, m[1] - 4.6, 0.5, C.ink, R); }
}
/** Baby head (big, round) centred (x, y), radius r. face: 'calm' | 'cry' | 'ooh' | 'laugh' | 'plop'. */
function babyHead(c, L, x, y, r, face) {
  const R = L.R, k = r / 14;
  part(c, ring(x - r * 0.62, y + 0.4 * k, 2.6 * k, 3.2 * k, R, 0.1, 7), bskin(L), sm(L, 0.3, 1), { lw: 1 });
  part(c, ring(x, y, r, r * 0.97, R, 0.05, 12), bskin(L), L.M, { lw: 1.6 });
  if (!L.burnt) for (const [x0, x1, h] of [[-2.4, -4.2, 3.4], [0.2, 0.6, 4.6], [2.6, 4.8, 3.6]]) brush(c, [[x + x0 * k, y - r + 1.6 * k], [x + (x0 + x1) * 0.5 * k, y - r - h * 0.6 * k], [x + x1 * k, y - r - h * k]], 1.3 * k, BB.hair, R, { bristles: 3, dry: 0.15, taper: 0.7 });
  const e1 = [x + 5 * k, y - 1.8 * k], e2 = [x + 10.4 * k, y - 1.4 * k], er = 2.6 * k;
  if (face === 'cry' || face === 'laugh') for (const e of [e1, e2]) eye(c, L, e[0], e[1], er, { shut: face === 'cry' ? -1 : 1 });
  else for (const e of [e1, e2]) eye(c, L, e[0], e[1], face === 'plop' ? er * 1.15 : er, { px: face === 'ooh' ? 0.15 : 0.3, py: face === 'ooh' ? -0.45 : 0.05, pupil: 0.62 });
  if (!L.burnt) { dab(c, x + 10 * k, y + 4.4 * k, 2.6 * k, BB.blush, R); dab(c, x + 1.6 * k, y + 4 * k, 2.2 * k, BB.blush, R); }
  dab(c, x + 13.2 * k, y + 2 * k, 0.9 * k, bskin(L, 1), R);
  const mx = x + 8.4 * k, my = y + 7.6 * k;
  if (L.dead) { fill(c, ring(mx, my, 1.6 * k, 1 * k, R, 0.1, 7), BB.mouth, R, { edge: 0 }); return; }
  if (face === 'cry') {
    fill(c, ring(mx, my + 0.6 * k, 4 * k, 3.6 * k, R, 0.1, 9), L.acc(BB.mouth), R, { edge: 0 });
    if (!L.burnt) {
      dab(c, mx + 0.4 * k, my + 2.2 * k, 1.8 * k, BB.tongue, R);
      for (const [dx, dy, l, a] of [[e1[0] + 1, e1[1] + 1.6, 9, 2.4], [e2[0] + 2, e2[1] + 1, 11, 0.5], [e2[0] + 2.4, e2[1] + 1.6, 8, 1.2]]) brush(c, [[dx, dy], [dx + Math.cos(a) * l * 0.5 * k, dy + Math.sin(a) * l * 0.4 * k - 1], [dx + Math.cos(a) * l * k, dy + Math.sin(a) * l * 0.6 * k + 1]], 1.6 * k, BB.tear, R, { bristles: 3, dry: 0.3, taper: 0.5 });
    }
  } else if (face === 'ooh' || face === 'plop') fill(c, ring(mx, my, 1.8 * k, 2.2 * k, R, 0.1, 8), L.acc(BB.mouth), R, { edge: 0 });
  else {
    fill(c, poly([[mx - 3.4 * k, my - 1 * k], [mx + 3.4 * k, my - 1.2 * k], [mx + 1.6 * k, my + 2.4 * k], [mx - 1.8 * k, my + 2.2 * k]], R, 0.2 * k), L.acc(BB.mouth), R, { edge: 0 });
    if (!L.burnt) { dab(c, mx, my + 1.2 * k, 1.2 * k, BB.tongue, R); fill(c, [[mx - 0.8 * k, my - 1 * k], [mx + 0.8 * k, my - 1 * k], [mx, my + 0.4 * k]], C.white, R, { edge: 0, sharp: true }); }
  }
}
function rattle(c, L, x, y, a) {
  const R = L.R;
  about(c, x, y, a, () => {
    brush(c, [[x, y + 3], [x, y - 7]], 1.6, L.acc(BB.rattle), R, { bristles: 2, dry: 0, taper: 0 });
    ink(c, [[x - 0.9, y + 3], [x - 0.9, y - 7]], 0.4, R);
    part(c, ring(x, y - 10.4, 3.8, 3.6, R, 0.08, 8), L.acc(BB.ball), sm(L, 0.3, 1), { lw: 1 });
    if (!L.burnt) for (const [dx, dy] of [[-1.4, -11.4], [1.2, -9.4], [0.6, -12.6]]) dab(c, x + dx, y + dy, 0.6, C.yellow, R);
  });
}
// ---- crawling
function bbLeg(c, L, far) {
  const dx = far ? 0 : 3, s = far ? 0.94 : 1, col = far ? bskin(L, 1) : bskin(L);
  limb(c, L, [[-12 + dx, -21], [-9 + dx, -11], [-7 + dx, -4]], [12 * s, 10.6 * s, 9 * s], col, L.M, 1.4);
  limb(c, L, [[-7 + dx, -4.4], [-14 + dx, -3.6], [-21 + dx, -4.4]], [8.6 * s, 7.6 * s, 6.8 * s], col, L.M, 1.4);
  foot(c, L, -23 + dx, -6.6, -0.5, 0.95 * s);
}
function bbArm(c, L, far) {
  const dx = far ? 0 : 3, s = far ? 0.94 : 1, col = far ? bskin(L, 1) : bskin(L);
  limb(c, L, [[11 + dx, -25], [13.6 + dx, -13], [15.6 + dx, -3.6]], [9.4 * s, 8.4 * s, 7.6 * s], col, L.M, 1.3);
  hand(c, L, 17 + dx, -2.6, 3.6 * s);
  if (!far && !L.burnt) brush(c, [[12.4 + dx, -14.2], [15.2 + dx, -14.6]], 0.5, bskin(L, 1), L.R, { bristles: 1, dry: 0.2, taper: 0.4 });
}
function bbCrawl(c, L) {
  part(c, oval(-1, -26.6, 17, 11.4, -0.06, L.R, 0.05, 11), bskin(L), L.M, { lw: 1.6 });
  if (!L.burnt) brush(c, [[-8, -33], [0, -36.4], [8, -35.6]], 1, bskin(L, 1), L.R, { bristles: 2, dry: 0.4, taper: 0.5 });
  nappy(c, L, -14, -26.6, 10.6, 11.2);
  bib(c, L, [[8, -31], [16.4, -32.6], [19, -22], [14, -14.6], [9, -20]]);
}
function bbCHead(c, L, face) { babyHead(c, L, 24, -34, 14, face); }
// ---- sitting
function bbSit(c, L) {
  const R = L.R;
  limb(c, L, [[-1, -9], [10, -6.4], [19, -8]], [12, 10.6, 9.4], bskin(L, 1), L.M, 1.4);
  foot(c, L, 22, -11, 0.15, 1);
  nappy(c, L, -2, -12, 15, 11);
  part(c, oval(1.4, -29.6, 12.6, 13.6, 0.04, R, 0.05, 11), bskin(L), L.M, { lw: 1.6 });
  if (!L.burnt) dab(c, 7, -24, 0.8, bskin(L, 1), R);
  limb(c, L, [[2, -8], [13, -4.6], [22.6, -6]], [12.4, 11, 9.6], bskin(L), L.M, 1.4);
  foot(c, L, 25.6, -9.4, 0.2, 1.05);
  bib(c, L, [[2, -40.6], [12.4, -40.6], [14.2, -29], [8.4, -22], [2.6, -30]]);
}
const BB_SA = {
  idle: { B: [[-6, -38], [-11, -31], [-10, -23.6]], F: [[7, -38], [16, -33], [22, -37]], r: [22.4, -37.6, 0.3] },
  cry: { B: [[-5, -38], [-14, -35], [-19, -42]], F: [[7, -38], [18, -34], [24, -40]] },
  hold: { B: [[-5, -39], [2, -44], [7, -48]], F: [[7, -38], [16, -40], [20, -47]] },
  up: { B: [[-5, -39], [-12, -49], [-13, -61]], F: [[7, -38], [20, -46], [26, -59]] },
  atk: { B: [[-6, -38], [-11, -31], [-10, -23.6]], F: [[7, -38], [18, -37], [25, -30]], r: [25.4, -30, 1.9] },
  throw: { B: [[-5, -38], [-14, -42], [-21, -40]], F: [[7, -38], [19, -40], [29, -46]] },
};
function bbSArmB(c, L, key) { const A = BB_SA[key]; limb(c, L, A.B, [9, 8, 7.4], bskin(L, 1), L.M, 1.3); hand(c, L, A.B[2][0], A.B[2][1], 3.6); }
function bbSArms(c, L, key, back = true) {
  const A = BB_SA[key];
  if (back) bbSArmB(c, L, key);
  if (A.r) rattle(c, L, A.r[0], A.r[1], A.r[2]);
  limb(c, L, A.F, [9.4, 8.4, 7.6], bskin(L), L.M, 1.3); hand(c, L, A.F[2][0], A.F[2][1], 3.8);
  if (key === 'throw' && !L.burnt) { const P = [[8, -70], [22, -68], [32, -60], [35, -50]]; brush(c, P, 2.6, '#f1eee6', L.R, { bristles: 3, taper: 0.9, dry: 0.6 }); }
  if (key === 'up' && !L.burnt) for (const [x, y] of [[-18, -66], [31, -64]]) sparkle(c, x, y, 2, C.yellow, L.R);
  if (key === 'atk' && !L.burnt) starBurst(c, 36, -27, 4.4, 6, C.yellow, C.orange, L.R);
}
const BB_FACE = { idle: 'calm', cry: 'cry', hold: 'ooh', throw: 'laugh', sit: 'plop', atk: 'laugh' };
/** Sitting in the sandpit, digging with a spade (drawSecret 'sandpit'): up 0 = spade in the sand, 1 = raised with sand. */
function bbDig(c, L, up) {
  const R = L.R;
  bbSArmB(c, L, 'idle');
  bbSit(c, L);
  babyHead(c, L, 4, -55, 15, up ? 'laugh' : 'calm');
  const F = up ? [[7, -38], [18, -36], [27, -32]] : [[7, -38], [17, -30], [24, -21]], h = F[2];
  const t = up ? [h[0] + 13, h[1] - 3] : [h[0] + 6, h[1] + 16], a = Math.atan2(t[1] - h[1], t[0] - h[0]);
  brush(c, [[h[0] - Math.cos(a) * 3, h[1] - Math.sin(a) * 3], t], 1.6, '#ff8a12', R, { bristles: 2, dry: 0, taper: 0 });
  ink(c, [[h[0] - Math.cos(a) * 3 + 0.8, h[1] - Math.sin(a) * 3], [t[0] + 0.8, t[1]]], 0.4, R);
  about(c, t[0], t[1], a - Math.PI / 2, () => part(c, poly([[t[0] - 4.6, t[1] - 0.8], [t[0] + 4.6, t[1] - 0.8], [t[0] + 4, t[1] + 6.6], [t[0], t[1] + 9.2], [t[0] - 4, t[1] + 6.6]], R, 0.15), L.acc('#1f57d8'), sm(L, 0.3, 1), { lw: 1 }));
  if (up && !L.burnt) for (const [dx, dy, r] of [[3, -1.6, 2.2], [6, -0.6, 1.8], [4.6, -3.8, 1.6], [8, -2.6, 1.3]]) dab(c, t[0] + dx, t[1] + dy, r, '#e8c77a', R);
  if (!up && !L.burnt) for (const [dx, dy, r] of [[-3, 3.4, 2.4], [3.4, 3.8, 2.2], [0, 5, 2.6]]) dab(c, t[0] + dx, t[1] + dy, r, '#d9b465', R);
  limb(c, L, F, [9.4, 8.4, 7.6], bskin(L), L.M, 1.3); hand(c, L, h[0], h[1], 3.8);
}
function bbSitWhole(c, L, pose) {
  const key = pose === 'cry' || pose === 'hold' || pose === 'throw' || pose === 'atk' ? pose : 'idle';
  if (pose === 'sit' && !L.burnt) { burst(c, -2, -4, 17, 24, 3, Math.PI * 0.95, Math.PI * 1.15, L.R, 0.8); burst(c, 0, -4, 20, 27, 3, -0.15, 0.1, L.R, 0.8); puffs(c, [[-19, -1.6, 3.4], [-13, 0.4, 2.6], [27, -0.6, 3], [32, 1, 2.2]], C.smokeL, L.R); }
  const ak = pose === 'sit' ? 'up' : key;
  bbSArmB(c, L, ak);
  bbSit(c, L);
  babyHead(c, L, 4, -55, 15, BB_FACE[pose] || 'calm');
  bbSArms(c, L, ak, false);
}
function bbCrawlWhole(c, L, pose) {
  const w = pose === 'walk0' ? 0.22 : -0.22;
  about(c, BBJ.crawl.hipB[0], BBJ.crawl.hipB[1], -w, () => bbLeg(c, L, true));
  about(c, BBJ.crawl.shB[0], BBJ.crawl.shB[1], w, () => bbArm(c, L, true));
  bbCrawl(c, L); bbCHead(c, L, 'laugh');
  about(c, BBJ.crawl.shF[0], BBJ.crawl.shF[1], -w, () => bbArm(c, L, false));
  about(c, BBJ.crawl.hipF[0], BBJ.crawl.hipF[1], w, () => bbLeg(c, L, false));
}
function bbDead(c, L) {
  const R = L.R;
  limb(c, L, [[-13, -14], [-18, -24], [-20, -33]], [11, 10, 9], bskin(L, 1), L.M, 1.4); foot(c, L, -20.4, -36.6, 2.9, 1);
  limb(c, L, [[-9, -13], [-11, -24], [-11, -34]], [11.6, 10.4, 9.4], bskin(L), L.M, 1.4); foot(c, L, -11, -37.6, 3.1, 1.05);
  part(c, oval(0, -11, 17, 10.4, 0.02, R, 0.05, 11), bskin(L), L.M, { lw: 1.6 });
  nappy(c, L, -13, -11, 9.6, 9.6);
  limb(c, L, [[10, -15], [11, -24], [8, -30]], [9, 8, 7.4], bskin(L), L.M, 1.3); hand(c, L, 7.6, -31.4, 3.6);
  babyHead(c, L, 25, -14, 14, 'calm');
  rattle(c, L, 31, 1, 1.5);
}
function babyPaint(c, o) {
  const L = look(o, BB.own), p = o.pose;
  if (isPart(p)) {
    switch (p) {
      case 'r:legB': bbLeg(c, L, true); break;
      case 'r:legF': bbLeg(c, L, false); break;
      case 'r:armB': bbArm(c, L, true); break;
      case 'r:armF': bbArm(c, L, false); break;
      case 'r:crawl': bbCrawl(c, L); break;
      case 'r:chead': bbCHead(c, L, 'laugh'); break;
      case 'r:sit': bbSit(c, L); break;
      default:
        if (p.startsWith('r:sh:')) babyHead(c, L, 4, -55, 15, p.slice(5));
        else if (p.startsWith('r:sa:')) bbSArms(c, L, p.slice(5), false);
        else if (p.startsWith('r:sb:')) bbSArmB(c, L, p.slice(5));
    }
    return;
  }
  if (L.dead) { bbDead(c, L); return; }
  if (p === 'walk0' || p === 'walk1') bbCrawlWhole(c, L, p);
  else bbSitWhole(c, L, p);
}

// ================================================================ the registry
const NOB = {};
function birdPick(B) {
  return (u, info) => {
    keepInfo(info);
    const a = act(u);
    if (a === 1 || u.attack > 0.3) return B.crow ? 'peck' : 'dive';
    if (!((u.z || 0) > 3)) return 'stand';
    return ((info.rt * (B.crow ? 13 : 9) + (u.id % 7) * 0.43) | 0) & 1 ? 'fly1' : 'fly0';
  };
}
const birdRig = (cfg) => ({ driver: 'sbird', cfg, parts: (pose) => (pose === 'fly0' || pose === 'fly1' ? { wingB: 'r:wingB', tail: null, body: 'r:body', wingF: 'r:wingF', main: null } : { main: pose }) });
export const SPRITES = {
  ghost: {
    box: [32, 36, 16, 33], scale: 1, own: GH.own, lie: 'none', poses: ['float0', 'float1', 'spook'], extra: ['r:armB', 'r:sheet', 'r:armF', 'r:armBS', 'r:sheetS', 'r:armFS'],
    paint: ghostPaint,
    pick(u, info) { keepInfo(info); if (act(u) === 1 || u.attack > 0.3) return 'spook'; return ((info.rt * 2.2 + u.id * 0.31) | 0) & 1 ? 'float1' : 'float0'; },
    rig: { driver: 'sghost', J: { top: [0, -30.4], mid: [0, -15], shB: [-9, -9.6], shF: [9.2, -9.6] }, parts: (pose) => (pose === 'spook' ? { sheet: 'r:sheetS', armB: 'r:armBS', armF: 'r:armFS', spook: 1 } : { sheet: 'r:sheet', armB: 'r:armB', armF: 'r:armF', spook: 0 }) },
  },
  seagull: {
    box: [32, 28, 16, 22], scale: 1, own: GULL.own, lie: 'none', flying: true, poses: ['fly0', 'fly1', 'dive'], extra: ['stand', 'r:wingB', 'r:body', 'r:wingF'],
    paint: (c, o) => birdPaint(c, o, GULL), pick: birdPick(GULL),
    rig: birdRig(SEC.gull),
  },
  crow: {
    box: [30, 26, 15, 20], scale: 1, own: CROW.own, lie: 'none', flying: true, poses: ['fly0', 'fly1', 'peck'], extra: ['stand', 'r:wingB', 'r:body', 'r:wingF'],
    paint: (c, o) => birdPaint(c, o, CROW), pick: birdPick(CROW),
    rig: birdRig(SEC.crow),
  },
  phoenix: {
    box: [72, 60, 44, 50], scale: 1, own: PX.own, lie: 'none', flying: true, poses: ['fly0', 'fly1', 'dive', 'egg', 'hatch'], extra: ['egg1', 'egg2', 'r:wingB', 'r:tail', 'r:body', 'r:wingF'],
    paint: phxPaint,
    pick(u, info) {
      keepInfo(info);
      const a = act(u), b = u.b || NOB;
      if (a === 2) { const k = b.crack || 0; return k < 0.34 ? 'egg' : k < 0.67 ? 'egg1' : 'egg2'; }
      if (a === 3) return 'hatch';
      if (a === 1) return 'dive';
      return ((info.rt * 6 + (u.id % 5) * 0.37) | 0) & 1 ? 'fly1' : 'fly0';
    },
    rig: { driver: 'sbird', cfg: SEC.phoenix, parts: (pose) => (pose === 'fly0' || pose === 'fly1' ? { wingB: 'r:wingB', tail: 'r:tail', body: 'r:body', wingF: 'r:wingF', main: null } : { main: pose }) },
  },
  yeti: {
    box: [66, 82, 28, 78], scale: 1, own: YT.own, poses: ['idle', 'walk0', 'walk1', 'throw', 'slam'],
    extra: ['r:legB', 'r:legF', 'r:armB:idle', 'r:body', 'r:head', 'r:headO', 'r:armF:idle', 'r:armB:throw', 'r:armF:throw', 'r:armB:slam', 'r:armF:slam'],
    paint: yetiPaint,
    pick(u, info) { keepInfo(info); const a = act(u); if (a === 1) return 'throw'; if (a === 2 || u.attack > 0.35) return 'slam'; return null; },
    rig: {
      driver: 'sbrute', J: YJ, cfg: SEC.yeti,
      parts(pose) {
        const k = pose === 'throw' || pose === 'slam' ? pose : 'idle';
        return { legB: 'r:legB', legF: 'r:legF', armB: 'r:armB:' + k, body: 'r:body', head: k === 'idle' ? 'r:head' : 'r:headO', xtra: null, armF: 'r:armF:' + k, lean: k === 'throw' ? -0.12 : k === 'slam' ? 0.26 : 0, crawl: 0, arms: k === 'idle' ? 1 : 0 };
      },
    },
  },
  cowboy: {
    box: [50, 50, 23, 46], scale: 1, own: CB.own, poses: ['idle', 'walk0', 'walk1', 'shootL', 'shootR', 'lasso', 'pull', 'reload'],
    extra: ['r:leg', 'r:body', 'r:head', 'r:arm:idle', 'r:arm:shootL', 'r:arm:shootR', 'r:arm:lasso', 'r:arm:pull', 'r:arm:reload'],
    paint: cowPaint,
    paintHat(c, col, M) { cowHat(c, look({ R: M.R, M, col, dead: false, risen: false }, CB.own), M); },
    pick(u, info) {
      keepInfo(info);
      const a = act(u), b = u.b || NOB;
      if (a === 1) return b.hand ? 'shootR' : 'shootL';
      if (a === 2) return 'lasso'; if (a === 3) return 'pull'; if (a === 4) return 'reload';
      if (u.attack > 0.35) return 'shootR';
      return null;
    },
    rig: { driver: 'biped', joints: CB_J, parts: (pose) => ({ leg: 'r:leg', body: 'r:body', head: 'r:head', arm: 'r:arm:' + (CB_KEY[pose] || 'idle'), back: null, lean: CB_LEAN[pose] || 0 }) },
  },
  scarecrow: {
    box: [52, 52, 24, 48], scale: 1, own: SC.own, poses: ['idle', 'hop0', 'hop1', 'call', 'atk'], extra: ['r:pole', 'r:armB', 'r:armBU', 'r:body', 'r:head', 'r:headO', 'r:armF', 'r:armFU'],
    paint: scPaint,
    pick(u, info) { keepInfo(info); if (act(u) === 1) return 'call'; if (u.attack > 0.35) return 'atk'; if (info.moving) return info.walkFrame ? 'hop1' : 'hop0'; return 'idle'; },
    rig: { driver: 'sscare', J: SCJ, cfg: SEC.scare, parts: (pose) => ({ pole: 'r:pole', armB: pose === 'call' ? 'r:armBU' : 'r:armB', body: 'r:body', head: pose === 'call' ? 'r:headO' : 'r:head', armF: pose === 'call' ? 'r:armFU' : 'r:armF', lean: pose === 'atk' ? 0.38 : 0, call: pose === 'call' ? 1 : 0 }) },
  },
  bogmonster: {
    box: [80, 60, 32, 54], scale: 1, own: BG.own, lie: 'none', poses: ['idle', 'walk0', 'walk1', 'under', 'grab', 'punch'], extra: ['chew', 'r:armB', 'r:body', 'r:bodyO', 'r:eyes', 'r:armF', 'r:armP'],
    paint: bogPaint,
    pick(u, info) {
      keepInfo(info);
      const a = act(u), under = (u.b && u.b.under) || a === 1 || u.hidden > 0;
      if (a === 2) return under ? 'chew' : 'grab';
      if (under) return 'under';
      if (a === 3 || u.attack > 0.35) return 'punch';
      return null;
    },
    rig: {
      driver: 'sbrute', J: BGJ, cfg: SEC.bog,
      parts: (pose) => (pose === 'under' || pose === 'grab' || pose === 'chew' ? { main: pose } : { legB: null, legF: null, armB: 'r:armB', body: 'r:body', head: 'r:eyes', xtra: null, armF: pose === 'punch' ? 'r:armP' : 'r:armF', lean: pose === 'punch' ? 0.1 : 0, crawl: 0, arms: pose === 'punch' ? 0 : 1 }),
    },
  },
  baby: {
    box: [78, 86, 34, 82], scale: 1, own: BB.own, lie: 'none', poses: ['idle', 'walk0', 'walk1', 'hold', 'throw', 'sit', 'cry', 'atk'],
    extra: ['r:legB', 'r:armB', 'r:crawl', 'r:chead', 'r:armF', 'r:legF', 'r:sit', 'r:sh:calm', 'r:sh:cry', 'r:sh:ooh', 'r:sh:laugh', 'r:sa:idle', 'r:sa:cry', 'r:sa:hold', 'r:sa:throw', 'r:sa:atk', 'r:sb:idle', 'r:sb:cry', 'r:sb:hold', 'r:sb:throw', 'r:sb:atk'],
    paint: babyPaint,
    pick(u, info) {
      keepInfo(info);
      const a = act(u);
      if (a === 1) return 'hold'; if (a === 2) return 'throw'; if (a === 3) return 'sit'; if (a === 4) return 'cry';
      if (u.attack > 0.35) return 'atk';
      return info.moving ? (info.walkFrame ? 'walk1' : 'walk0') : 'idle';
    },
    rig: {
      driver: 'sbrute', cfg: SEC.baby,
      J: BBJ.crawl, J2: BBJ.sit,
      parts(pose) {
        if (pose === 'walk0' || pose === 'walk1') return { legB: 'r:legB', legF: 'r:legF', armB: 'r:armB', body: 'r:crawl', head: 'r:chead', xtra: null, armF: 'r:armF', lean: 0, crawl: 1, arms: 1, sit: 0 };
        if (pose === 'sit') return { main: pose };
        const wg = SEC.baby.wig[pose];
        return { legB: null, legF: null, armB: 'r:sb:' + pose, body: 'r:sit', head: 'r:sh:' + BB_FACE[pose], xtra: null, armF: 'r:sa:' + pose, lean: 0, crawl: 0, arms: 0, sit: 1, wig: wg ? wg[0] : 0, wigW: wg ? wg[1] : 0, cry: pose === 'cry' ? 1 : 0 };
      },
    },
  },
};

// ================================================================ projectiles + effects (sprites.js PROJ_SRC, fx.js draws)
/** Draw sprite spr with its anchor at sim (x, y), x / y scale and a turn. */
function putS(api, spr, x, y, sx, sy, rot) {
  if (!spr || !api.ctx) return;
  const ctx = api.ctx, S = api.S, m = S / spr.k, cs = Math.cos(rot), sn = Math.sin(rot);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
function shotZ(p) {
  if (p.z > 0) return p.z;
  if (p.apex > 0 && p.maxLife > 0) { const f = 1 - p.life / p.maxLife; return 4 * p.apex * f * (1 - f); }
  return 0;
}
function unit(id) { return id >= 0 && WORLD && WORLD.unitById ? WORLD.unitById(id) : null; }
// the lasso: a rope piece (stretched + turned along the rope) and the loop at the end
let ropeBit = null;
const ROPE_N = 7;
function ropePiece(c, R) { rope(c, { R, acc: (x) => x }, [[0, 0], [3.4, 0.2], [6.8, -0.1], [10.2, 0]], 0.9); }
export const PROJ = {
  // snowball: a white ball with a blue shadow crescent, lobbed (p.z / p.apex), spinning, ground shadow.
  snowball: {
    box: [16, 16, 8, 8], n: 2,
    paint(c, R) {
      part(c, ring(0, 0, 4.6, 4.4, R, 0.08, 9), YT.snow, { R, mx: 0.4, my: 0.3, grow: 0.2, lw: 1.1 }, { lw: 1.1 });
      brush(c, [[-3.4, 1.4], [-0.6, 3.2], [3, 2.2]], 1.4, YT.snowS, R, { bristles: 3, dry: 0.3, taper: 0.5 });
      dab(c, -1.4, -1.8, 1, C.white, R);
      for (const [x, y] of [[1.6, -0.6], [-0.4, 1]]) dab(c, x, y, 0.4, '#a8c8ea', R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = shotZ(p);
      api.shadowAt(x, y, 0.3, 0.75);
      api.put(api.bit(api.sprite, i & 1), x, y - 6 - z, 1.15, rt * 9 + i);
      return true;
    },
  },
  // lasso: the cowboy's rope, from his raised hand (p.host) to the loop: the projectile while it flies, then round the
  // victim (p.victim) while he drags it in. The rope sags while it flies, pulls taut while he hauls.
  lasso: {
    box: [24, 14, 12, 7], n: 2,
    paint(c, R) {
      const L = { R, acc: (x) => x };
      const lp = ring(0, 0, 9, 4.6, R, 0.06, 12); rope(c, L, lp.concat([lp[0]]), 1);
      rope(c, L, [[-9, 0], [-11.4, 0.6]], 1);
    },
    draw(p, x, y, ang, rt, i, api) {
      const h = unit(p.host), v = p.k === 1 ? unit(p.victim) : null;
      const ex = x, ey = y - (p.z > 0 ? p.z : 0) - (v ? Math.max(6, (v.radius || 9) * 0.9) : 6);
      if (!ropeBit && spx()) ropeBit = SPm.defineBit('proj:lasso:rope', 1, [14, 6, 1, 3], (c, R) => ropePiece(c, R));
      if (h) {
        const f = Math.cos(h.heading || 0) >= 0 ? 1 : -1, pull = !!v, hk = (h.radius || 9.5) / 9.5;
        const hx = h.x + f * (pull ? 9.6 : 9.4) * hk, hy = h.y - (h.z || 0) - (pull ? 15 : 24.4) * hk;
        const dx = ex - hx, dy = ey - hy, len = Math.hypot(dx, dy), sag = pull ? 1.5 : Math.min(14, len * 0.16);
        const rb = ropeBit ? api.bit(ropeBit, 0) : null;
        if (rb) {
          let px = hx, py = hy;
          for (let k = 1; k <= ROPE_N; k++) {
            const t = k / ROPE_N, qx = hx + dx * t, qy = hy + dy * t + sag * 4 * t * (1 - t) + (pull ? Math.sin(rt * 40 + k) * 0.5 : 0);
            const sx = qx - px, sy = qy - py, l = Math.hypot(sx, sy);
            putS(api, rb, px, py, l / 10.2, 1, Math.atan2(sy, sx));
            px = qx; py = qy;
          }
        }
      }
      const a = h ? Math.atan2(ey - (h.y - 20), ex - h.x) : ang;
      putS(api, api.bit(api.sprite, i & 1), ex, ey, v ? Math.max(0.7, (v.radius || 9) / 9) : 0.8, v ? 0.75 : 0.9, v ? 0 : a + Math.sin(rt * 20) * 0.3);
      return true;
    },
  },
  // iceblock: an ice cube round a frozen victim (p.host = the victim, p.r = its radius), drawn over it a bit see-through
  // so the victim shows inside; painted for radius 9.5, scaled by p.r; icicles + frost; cracks as it melts (p.life).
  iceblock: {
    box: [34, 42, 17, 37], n: 2,
    paint(c, R, v) {
      const M = { R, mx: 0.6, my: 0.5, grow: 0.3, lw: 1.3 };
      part(c, poly([[-12, -26], [-6.6, -32], [13.4, -32], [8, -26]], R, 0.3), '#e4f6ff', M, { lw: 1.2, sharp: true });
      part(c, poly([[8, -26], [13.4, -32], [13.6, -6], [8.2, 0.4]], R, 0.3), '#8fd2f2', M, { lw: 1.2, sharp: true });
      part(c, poly([[-12, -26], [8, -26], [8.2, 0.4], [-12.2, 0.6]], R, 0.3), '#bfe9ff', M, { lw: 1.4, sharp: true });
      brush(c, [[-9, -23], [-9.6, -10]], 1.6, C.white, R, { bristles: 3, dry: 0.4, taper: 0.6 });
      brush(c, [[-6.6, -23.6], [-2, -23.8]], 1.1, C.white, R, { bristles: 2, dry: 0.3, taper: 0.5 });
      for (const [x, l] of [[-9, 3.4], [-3, 2.4], [3.6, 3]]) { fill(c, [[x - 1.2, 0.4], [x, 0.4 + l], [x + 1.2, 0.4]], '#d9f3ff', R, { edge: 0, sharp: true }); brush(c, [[x - 1.2, 0.4], [x, 0.4 + l], [x + 1.2, 0.4]], 0.4, C.ink, R, { bristles: 1, dry: 0, taper: 0 }); }
      if (v) ink(c, [[-4, -26], [-2, -19], [-5, -14], [-3, -8]], 0.6, R);
      sparkle(c, 10.6, -29, 1.6, C.white, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const h = unit(p.host), r = p.r > 0 ? p.r : h && h.radius > 0 ? h.radius : 9.5, k = Math.max(0.5, Math.min(3, r / 9.5));
      const px = h ? h.x : x, py = h ? h.y - (h.z || 0) : y - (p.z > 0 ? p.z : 0);
      const melt = p.maxLife > 0 && p.life >= 0 ? cl01(p.life / p.maxLife) : 1;
      api.ctx.globalAlpha = 0.72 * (melt < 0.15 ? melt / 0.15 : 1);
      api.put(api.bit(api.sprite, melt < 0.4 ? 1 : 0), px, py + 1.5 * k, k, 0);
      api.ctx.globalAlpha = 1;
      return true;
    },
  },
  // feather: a black (crow) or white (gull) feather seesawing down (p.k 1 = white), if the sim sends one.
  feather: {
    box: [12, 6, 6, 3], n: 2,
    paint(c, R, v) { feather(c, 0, 0, 0, 0.9, v ? '#f4f4ee' : SC.feather, R); },
    draw(p, x, y, ang, rt, i, api) {
      const z = p.z > 0 ? p.z : 0, sw = Math.sin(rt * 3 + i * 1.7);
      api.put(api.bit(api.sprite, p.k ? 1 : 0), x + sw * 3, y - 4 - z, 1, sw * 0.6);
      return true;
    },
  },
};

// ================================================================ drawSecret: the hidden unit on its map
// Same style as terrain.js drawProps: atlas bits placed with setTransform + drawImage, nothing painted per frame. The bits
// are painted once (lazily, the first frame a map shows its secret). sprites.js imports this module, so it is imported here
// lazily too. Every look sits at (s.x, s.y) = the hiding spot (the sim's tap circle), with a small move every T.period s.
const T = {
  period: 3.6,        // s between notice-me moves
  move: 0.75,         // s a notice-me move lasts
  size: { ghost: 1, seagull: 1.2, yeti: 1.25, cowboy: 1, scarecrow: 1, phoenix: 1.3, bogmonster: 1.3, baby: 0.62 },   // drawn size (x the unit's own)
  ice: 0.42,          // alpha of the dark shape under the ice
};
let SPm = null, spP = null;
function spx() { if (!spP) spP = import('./sprites.js').then((m) => { SPm = m; }, () => { spP = null; }); return SPm; }
const BITS = {};
function art(name, n, box, paint) { let b = BITS[name]; if (!b) b = BITS[name] = SPm.defineBit('secret:' + name, n, box, paint); return b; }
/** Paint one of our entries into a bit (pose, own colour). */
function entryBit(type, pose, box, extra) {
  const e = SPRITES[type];
  return art(type + ':' + pose, 1, box, (c, R, v, M) => { e.paint(c, { R, M, pose, col: e.own, dead: false, risen: false, v: 0, type }); if (extra) extra(c, R, M); });
}
function putB(ctx, spr, x, y, sx, sy, rot, S) {
  if (!spr) return;
  const m = S / spr.k, cs = Math.cos(rot), sn = Math.sin(rot);
  ctx.setTransform(cs * m * sx, sn * m * sx, -sn * m * sy, cs * m * sy, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
/** Only the top of a sprite down to `keep` sim px above its anchor (peeking over something): cut in the sprite's own rows. */
function putTop(ctx, spr, x, y, k, flip, cutH, S) {
  if (!spr) return;
  const m = S * k / spr.k, rows = Math.max(1, Math.min(spr.sh, Math.floor(spr.ay - cutH / k * spr.k)));
  ctx.setTransform(m * flip, 0, 0, m, x * S, y * S);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, rows, -spr.ax, -spr.ay, spr.sw, rows);
}
const ease = (q) => q * q * (3 - 2 * q);
/** 0 -> 1 -> 0 over a notice-me move, 0 between them (phase offset per spot so two maps never sync). */
function nudge(rt, ph) {
  const t = (rt + ph) % T.period, a = t - (T.period - T.move);
  if (a <= 0) return 0;
  return Math.sin(a / T.move * Math.PI);
}
function moveT(rt, ph) { const t = (rt + ph) % T.period, a = t - (T.period - T.move); return a <= 0 ? -1 : a / T.move; }
// ---- the look painters (bits)
function brickLedge(c, R, w) {
  const M = { R, mx: 0.4, my: 0.3, grow: 0.2, lw: 1.1 };
  for (let x = -w / 2, i = 0; x < w / 2 - 1; x += 7.4, i++) part(c, poly([[x, -3.4], [x + 7, -3.6], [x + 7.1, 1.6], [x, 1.8]], R, 0.3), i & 1 ? C.greyL : C.grey, M, { lw: 1, sharp: true });
}
function rockBit(c, R) {
  const M = { R, mx: 0.8, my: 0.6, grow: 0.3, lw: 1.5 };
  part(c, poly([[-12, 0], [-13, -6], [-9, -12.6], [-2, -15], [6, -13.4], [11, -8], [12.6, 0], [3, 1.6], [-6, 1.4]], R, 0.4), C.grey, M, { lw: 1.5 });
  brush(c, [[-8, -8], [-3, -11.6], [3, -11.6]], 1.6, C.greyL, R, { bristles: 3, dry: 0.4, taper: 0.5 });
  brush(c, [[2, -3], [7, -5], [9.6, -2]], 1.2, C.greyD, R, { bristles: 2, dry: 0.4, taper: 0.5 });
  dab(c, -6, -4, 1.4, '#6f9c34', R); dab(c, -4.4, -3.2, 1, '#88cf58', R);
}
function cropClump(c, R) {   // leafy crop plants in front of the pole (like the village's crop rows)
  const M = { R, mx: 0.4, my: 0.3, grow: 0.2, lw: 0.9 };
  for (const [x, y, r] of [[-8, -1, 4.4], [8, -0.6, 4.2], [0, 1, 4.8]]) {
    part(c, ring(x, y - r * 0.6, r, r * 0.75, R, 0.16, 9), '#3f8f2c', M, { lw: 0.9 });
    brush(c, [[x - r * 0.5, y - r * 0.6], [x, y - r * 1.1], [x + r * 0.5, y - r * 0.6]], 1, '#6fbf3a', R, { bristles: 2, dry: 0.3, taper: 0.4 });
  }
}
function mastBit(c, R) {
  tube(c, [[0, 18], [0.4, 8], [0, 0]], 2.4, C.brown, R, 1.1);
  tube(c, [[-6, 6], [6.4, 5.4]], 1.6, C.brownL, R, 1);
  fill(c, poly([[0.6, 8], [7, 9.4], [3, 12.6], [7.6, 15]], R, 0.3), C.white, R, { edge: 0 });
  brush(c, [[0.6, 8], [7, 9.4], [3, 12.6], [7.6, 15]], 0.5, C.ink, R, { bristles: 1, dry: 0.2, taper: 0 });
  brush(c, [[-2, 1.2], [2, 1]], 1, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
}
function yetiShadow(c, R) {   // seen from above, under the ice: blurry dark body, head, arms reaching forward, feet
  for (const [x, y, r, a] of [[0, 0, 12, 0.5], [0, 0, 9, 0.6], [12, 0, 6.6, 0.55], [2, -12, 5, 0.5], [2, 12, 5, 0.5], [10, -16, 4.2, 0.5], [10, 16, 4.2, 0.5], [17, -17, 3.4, 0.45], [17, 17, 3.4, 0.45], [-13, -6, 4.2, 0.4], [-13, 6, 4.2, 0.4], [-17, -7, 3, 0.35], [-17, 7, 3, 0.35]]) {
    c.save(); c.globalAlpha = a; dab(c, x, y, r, '#1d3150', R, 0.25); c.restore();
  }
}
function glowBit(c, R) { for (let i = 5; i >= 1; i--) { c.save(); c.globalAlpha = 0.16; dab(c, 0, 0, i * 3.2, i > 3 ? C.fireO : C.fireY, R, 0.1); c.restore(); } }
function eyeGlow(c, R) { for (const y of [-2.6, 2.6]) { c.save(); c.globalAlpha = 0.5; dab(c, 0, y, 2, '#bfe9ff', R); c.restore(); dab(c, 0, y, 1, C.white, R); } }
function sandSpray(c, R) { for (const [x, y, r] of [[0, 0, 1.4], [3, -3, 1.1], [-2.6, -4.4, 1.2], [5.4, -6.4, 0.9], [1, -8, 1], [-4.6, -8.6, 0.8], [7, -1.6, 0.9]]) dab(c, x, y, r, '#e8c77a', R); }
// ---- the looks
// Bit handles, defined once (defineBit paints nothing until a bit is first drawn): no strings or closures per frame.
let HB = null;
function bogShut(c, R, v, M) {
  const L = look({ R, M, pose: 'under', col: BG.own, dead: false, risen: false, v: 0 }, BG.own);
  part(c, ring(0, -1, 15, 4.4, R, 0.12, 11), BG.mud, M, { lw: 1.2 });
  for (const [x, y, r] of [[5, -5.6, 4.9], [12.6, -2.6, 4.3]]) {
    part(c, ring(x, y + 2.6, r * 0.8, r * 0.6, R, 0.1, 8), BG.base, sm(L, 0.3, 1), { lw: 1 });
    fill(c, ring(x, y, r, r, R, 0.05, 9), BG.base, R, { edge: 0 });
    brush(c, [[x - r, y], [x, y + r * 0.3], [x + r, y]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  }
}
function handles() {
  if (HB) return HB;
  const G = [32, 36, 16, 33], GU = [32, 28, 16, 22];
  const lookOf = (type, own) => (R, M) => look({ R, M, pose: 'idle', col: own, dead: false, risen: false, v: 0, type }, own);
  const bbL = lookOf('baby', BB.own), cbL = lookOf('cowboy', CB.own);
  HB = {
    ghost: entryBit('ghost', 'float0', G), ghostS: entryBit('ghost', 'spook', G), ledge: art('ledge', 1, [30, 10, 15, 5], (c, R) => brickLedge(c, R, 26)),
    mast: art('mast', 1, [18, 24, 8, 2], (c, R) => mastBit(c, R)),
    gull: entryBit('seagull', 'stand', GU), gull0: entryBit('seagull', 'fly0', GU), gull1: entryBit('seagull', 'fly1', GU),
    shadow: art('yetiShadow', 1, [48, 48, 24, 24], (c, R) => yetiShadow(c, R)), eyeGlow: art('eyeGlow', 1, [8, 12, 4, 6], (c, R) => eyeGlow(c, R)),
    cowHead: art('cowHead', 1, [26, 22, 13, 11], (c, R, v, M) => { c.translate(-0.5, 23); cowHead(c, cbL(R, M)); }), rock: art('rock', 1, [30, 20, 15, 16], (c, R) => rockBit(c, R)),
    scare: entryBit('scarecrow', 'idle', [52, 52, 24, 48]), crops: art('crops', 1, [30, 16, 15, 10], (c, R) => cropClump(c, R)),
    egg0: entryBit('phoenix', 'egg', [24, 30, 12, 26]), egg1: entryBit('phoenix', 'egg1', [24, 30, 12, 26]), glow: art('glow', 1, [36, 36, 18, 18], (c, R) => glowBit(c, R)),
    bogEyes: entryBit('bogmonster', 'under', [40, 26, 20, 16]), bogShut: art('bogShut', 1, [40, 26, 20, 16], bogShut),
    dig0: art('dig0', 1, [80, 92, 34, 86], (c, R, v, M) => bbDig(c, bbL(R, M), 0)), dig1: art('dig1', 1, [80, 92, 34, 86], (c, R, v, M) => bbDig(c, bbL(R, M), 1)),
    sand: art('sand', 1, [16, 14, 6, 10], (c, R) => sandSpray(c, R)),
  };
  return HB;
}
const bt = (h) => SPm.bit(h, 0);
const PEEK = {
  // tower (ghost): peeking over the tower wall top, the top of its head + eyes; the move = it rises up, arms up ("boo"),
  // then sinks back. A painted brick ledge hides the cut.
  tower(ctx, s, S, rt, ph, H) {
    const k = T.size.ghost, n = nudge(rt, ph), bob = Math.sin(rt * 2.3 + ph) * 0.8;
    const keep = (12.5 + 13 * n + bob) * k, cut = 30.6 * k - keep;   // sim px of ghost shown above the ledge line (s.y)
    putTop(ctx, bt(n > 0.55 ? H.ghostS : H.ghost), s.x, s.y + cut, k, Math.sin(rt * 0.4 + ph) > 0 ? 1 : -1, cut, S);
    putB(ctx, bt(H.ledge), s.x, s.y + 1, k, k, 0, S);
  },
  // wreck (seagull): standing on the wreck's mast tip; the move = a hop with wings flapping; it turns now and then.
  wreck(ctx, s, S, rt, ph, H) {
    const k = T.size.seagull, q = moveT(rt, ph), face = Math.sin(rt * 0.5 + ph * 3) > 0 ? 1 : -1;
    putB(ctx, bt(H.mast), s.x, s.y, 1, 1, 0, S);
    if (q < 0) putB(ctx, bt(H.gull), s.x, s.y + 0.5, face * k, k, 0, S);
    else putB(ctx, bt(((rt * 10) | 0) & 1 ? H.gull1 : H.gull0), s.x, s.y + 2 - 9 * Math.sin(q * Math.PI), face * k, k, 0, S);
  },
  // underice (yeti): a dark blurred shape under the ice; it turns slowly, and on the move it turns fast and two pale eyes
  // glow up through the ice.
  underice(ctx, s, S, rt, ph, H) {
    const n = nudge(rt, ph), a = Math.sin(rt * 0.23 + ph) * 1.4 + n * 0.9, k = T.size.yeti;
    ctx.globalAlpha = T.ice; putB(ctx, bt(H.shadow), s.x, s.y, k, k, a, S);
    if (n > 0.05) { ctx.globalAlpha = n; putB(ctx, bt(H.eyeGlow), s.x + Math.cos(a) * 13 * k, s.y + Math.sin(a) * 13 * k, k, k, a, S); }
    ctx.globalAlpha = 1;
  },
  // rock (cowboy): hat + eyes peeking round a rock; the move = he leans out round the side, then ducks back.
  rock(ctx, s, S, rt, ph, H) {
    const k = T.size.cowboy, n = nudge(rt, ph), lean = ease(n), bob = Math.sin(rt * 1.7 + ph) * 0.4;
    putB(ctx, bt(H.cowHead), s.x - 6 * k + 11 * k * lean, s.y - 9 * k - 3 * lean + bob, k, k, 0.35 * lean, S);
    putB(ctx, bt(H.rock), s.x, s.y + 6, k, k, 0, S);
  },
  // field (scarecrow): standing still among the crops; the move = a wiggle (it shakes like the wind took it).
  field(ctx, s, S, rt, ph, H) {
    const n = nudge(rt, ph), q = moveT(rt, ph), w = q < 0 ? 0 : Math.sin(q * Math.PI * 6) * 0.16 * n, k = T.size.scarecrow;
    putB(ctx, bt(H.scare), s.x, s.y + 6, k, k * (1 - 0.04 * n), w + Math.sin(rt * 0.9 + ph) * 0.015, S);
    putB(ctx, bt(H.crops), s.x, s.y + 7, 1, 1, 0, S);
  },
  // egg (phoenix): a glowing golden egg bobbing in the lava; the move = it rocks hard and flashes a crack.
  egg(ctx, s, S, rt, ph, H) {
    const n = nudge(rt, ph), q = moveT(rt, ph), bob = Math.sin(rt * 2 + ph) * 1.2, rock = q < 0 ? Math.sin(rt * 1.3 + ph) * 0.06 : Math.sin(q * Math.PI * 5) * 0.28 * n, k = T.size.phoenix;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + 0.25 * Math.sin(rt * 3.1 + ph) + 0.3 * n;
    putB(ctx, bt(H.glow), s.x, s.y - 6, 1 + 0.2 * n, 0.9 + 0.2 * n, 0, S);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    putB(ctx, bt(n > 0.4 ? H.egg1 : H.egg0), s.x, s.y + 3 + bob, k, k, rock, S);
  },
  // eyes (bog monster): two eyes peeking out of the mud with bubbles; they blink, and on the move they look left + right.
  eyes(ctx, s, S, rt, ph, H) {
    const q = moveT(rt, ph), blink = ((rt + ph * 1.7) % 2.3) < 0.13, look2 = q < 0 ? 1 : (q < 0.5 ? -1 : 1), k = T.size.bogmonster;
    putB(ctx, bt(blink ? H.bogShut : H.bogEyes), s.x - 6 * k * look2, s.y + 2, look2 * k, k, 0, S);
  },
  // sandpit (baby): sitting in the sandpit digging with a spade (up / down slowly); the move = a big scoop of sand flies.
  sandpit(ctx, s, S, rt, ph, H) {
    const k = T.size.baby, n = nudge(rt, ph), up = n > 0.2 || Math.sin(rt * 2.2 + ph) > 0.35, bob = (up ? -0.5 : 0) - 1.8 * n;
    putB(ctx, bt(up ? H.dig1 : H.dig0), s.x - 5, s.y + 8 + bob, k, k * (1 - 0.03 * n), 0, S);
    if (n > 0.1) { ctx.globalAlpha = n; putB(ctx, bt(H.sand), s.x + 14 * k, s.y - 30 * k - 10 * n, 1 + n * 0.5, 1 + n * 0.5, 0, S); ctx.globalAlpha = 1; }
  },
};
const LOOK_OF = { ghost: 'tower', seagull: 'wreck', yeti: 'underice', cowboy: 'rock', scarecrow: 'field', phoenix: 'egg', bogmonster: 'eyes', baby: 'sandpit' };
/** The secret unit on its map (index.js calls it after the props while world.map.secret is set). */
export function drawSecret(ctx, world, S, now, rt) {
  const s = world.map && world.map.secret;
  if (!s || !spx()) return;
  const fn = PEEK[s.look] || PEEK[LOOK_OF[s.type]];
  if (!fn) return;
  const ph = ((s.x * 0.013 + s.y * 0.007) % 1) * T.period;
  fn(ctx, s, S, rt, ph, handles());
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
