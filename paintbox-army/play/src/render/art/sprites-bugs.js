// BUGS tab sprites (OURS, Part 2 step 6, STEP6.md). Owner: BUGS-ART. Contract: ART.md + RIG.md (+ PROJ in sprites.js).
// A 7-year-old's tempera bugs, big friendly-scary: a yellow + black bee, a honey-gold hive, a black hairy spider with red eyes,
// a shiny blue-green horned beetle, a lime mantis, a red + black bombardier, a thin grey mosquito whose red belly swells, a
// brown stink bug with green stink lines. Natural colours; in Team battle (o.col !== own) each wears the team colour as a
// stripe painted along its back (the bee: its fuzzy thorax; the hive: a band round its middle ring). o.dead 'dead' = flipped
// onto its back, legs curled up, X eyes (lie: 'none', painted lying); 'burnt' = the same, all charcoal. o.risen = zombie copy
// (shell / skin C.zskin, milky eyes, stitches).
//
// Every type but the hive is painted as LAYERS ('r:<layer>' poses, each at rest: feet at 0,0, facing right) and every whole
// pose is those layers put together by rig-bugs.js emit() with the pose's numbers (the same code the floppy driver runs every
// frame), so whole sprites and floppy parts always agree. rig.parts(pose) names each pose's layers + numbers.
//
// Poses (entry pick(u, info), from STEP6.md b.act codes; RENDER's default = atk while u.attack > 0.35, walk0 / walk1 moving):
//   bee        sting (b.act 1 or u.attack > 0: abdomen curled under, stinger forward), fly0 / fly1 (wings buzzing, ~22 Hz),
//              stand (z < 3: webbed or landed, wings folded back). flying: true (RENDER raises it by u.z, z 12).
//   beehive    buzz (b.act 1: bees pour out, it shakes, motion lines), idle. Static: noFlip; 'hive' driver shudders it.
//              Dead = broken open, honeycomb + a honey puddle.
//   spider     shoot (b.act 1: reared up, front legs high, fangs out), atk (bite: lunges, fangs open), walk0 / walk1, idle
//   beetle     flip (b.act 1: head up, horn high, front legs up), atk (horn jab), walk0 / walk1, idle
//   mantis     lunge (b.act 1: stretched out flat, both blades snapped out forward, legs trailing), atk / atk1 (u.attack > 0:
//              the near / far blade slashes, b.arm 0 / 1), walk0 / walk1, pray (idle: blades folded up in front)
//   bombardier spray (b.act 1 + u.subState 2: rear raised, a boiling yellow-white jet out of its rear: the sim has turned its
//              back to the target), aim (b.act 1 + u.subState 1 TURN: still turning its back, rear raised, no jet yet),
//              atk (bite, jaws open), walk0 / walk1, idle
//   mosquito   drink (b.act 1 or u.attack > 0: legs gripping, head down, beak stuck in), fly0 / fly1 (buzz), stand (z < 3).
//              Every pose comes in 3 sizes for its swollen red belly: '' (radius up to 1.45x its own), 'M' (painted 1.7x,
//              belly fat), 'L' (painted 2.4x, belly a balloon); poseR tells RENDER the size each is painted at, so it
//              grows past RENDER's 1.7x size cap (u.radius / own radius, own = the base radius x u.shrink).
//   stinkbug   puff (b.act 1: body up, shuddering, green stink lines out of its back), atk (bite), walk0 / walk1, idle
// Projectiles / effects (sim fields read): web (the shot in flight, faces its flight, shadow), webon (silk wrapped round a
// victim's legs + anchor threads to the ground: p.r = victim radius, p.z if up; fades with p.life / p.maxLife when set),
// webpatch (ground: true; a flat web on the floor, p.r; fades at the end), gas (stink cloud, over units: drifting translucent
// puffs + rising stink lines, p.r, p.age, fades in over 0.5 s and out over its last 1 s by p.life (else 5 s - p.age)).
import { C, TAU, lerp, tone, brush, ring, poly, fill, outline, part, dab, tube, shift, rng } from './paint.js';
import { resolveJ, emitWith, restP, newP, BT, NK } from './rig-bugs.js';

// ---------------------------------------------------------------- shared helpers
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'
const sameCol = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const teamOf = (o, own) => (o.col && !sameCol(o.col, own)) ? o.col : null;
/** colour for a part: natural / zombie / charcoal. */
const pc = (o, nat, zom = C.zskin, burnt = C.char) => (o.dead === 'burnt' ? burnt : o.risen ? zom : nat);
const MILK = '#e7edd6';
const act = (u) => (u.b && u.b.act) | 0;
function onBack(c, h, fn) { c.save(); c.translate(0, -h); c.scale(1, -1); fn(); c.restore(); }
function xEye(c, x, y, s, R, w = 0.7, col = C.ink) {
  brush(c, [[x - s, y - s], [x + s, y + s]], w, col, R, { bristles: 2, dry: 0, taper: 0 });
  brush(c, [[x + s, y - s], [x - s, y + s]], w, col, R, { bristles: 2, dry: 0, taper: 0 });
}
/** A big cartoon eye: white + pupil; dead = X; risen = milky, pupil adrift. brow: an angry stroke over it (alive only). */
function eye(c, o, x, y, r, R, brow = 0, xcol = C.ink) {
  if (o.dead) { xEye(c, x, y, r * 0.85, R, Math.max(0.5, r * 0.5), xcol); return; }
  if (o.risen) { dab(c, x, y, r * 1.1, MILK, R); dab(c, x + r * 0.35, y + r * 0.35, r * 0.4, C.ink, R); return; }
  dab(c, x, y, r, C.white, R); dab(c, x + r * 0.32, y + r * 0.08, r * 0.55, C.ink, R);
  if (brow) brush(c, [[x - r * 1.2, y - r * 1.3 - brow * 0.3], [x + r * 1.1, y - r * 0.75]], Math.max(0.5, r * 0.5), C.ink, R, { bristles: 2, dry: 0 });
}
function stitches(c, x, y, n, gap, h, R) {   // risen: a row of cross stitches
  brush(c, [[x, y], [x + gap * (n - 1), y + 0.2]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  for (let i = 0; i < n; i++) brush(c, [[x + i * gap - 0.3, y - h], [x + i * gap + 0.3, y + h]], 0.4, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
}
function scorch(c, pts, R) { for (const [x, y, r] of pts) dab(c, x, y, r, C.charL, R, 0.35); }
/** the team stripe painted along the back (o.col in Team battle). */
function stripe(c, o, own, pts, w, R) {
  const col = teamOf(o, own); if (!col) return;
  brush(c, pts, w, o.dead === 'burnt' ? C.charL : col, R, { taper: 0.15, dry: 0.12, bristles: Math.max(3, Math.round(w * 1.4)) });
}
/** a fill (misregistered) + something painted inside it + its outline on top. */
function partIn(c, pts, col, M, lw, inner, o = {}) {
  fill(c, shift(pts, M.mx, M.my, M.grow), col, M.R, o);
  if (inner) inner();
  outline(c, pts, M.R, lw, o);
}
/** a smaller misregistration for tiny bugs (a 1.5 px miss would swallow a bee). */
const smallM = (M, k) => ({ R: M.R, mx: M.mx * k, my: M.my * k, grow: M.grow * k, lw: M.lw });
/** points round an ellipse turned by rot (wings), no wobble (poly() adds it). */
function ell(cx, cy, rx, ry, rot, n = 10) {
  const cs = Math.cos(rot), sn = Math.sin(rot), P = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; P.push([cx + x * cs - y * sn, cy + x * sn + y * cs]); }
  return P;
}
const shiftP = (P, dx, dy) => P.map(([x, y]) => [x + dx, y + dy]);
/** a dead leg: pointing down from the hip, bent at the knee, the foot curled back in toward the body (painted standing, so
 *  once the dead body is flipped onto its back the legs stick up in the air, curled). */
function curl(P) {
  const [h, k, f] = P, L = Math.hypot(k[0] - h[0], k[1] - h[1]) + Math.hypot(f[0] - k[0], f[1] - k[1]), sx = f[0] >= h[0] ? 1 : -1;
  const k2 = [h[0] + sx * 0.22 * L, h[1] + 0.36 * L];
  return [h, k2, [k2[0] - sx * 0.2 * L, k2[1] + 0.13 * L]];
}
/** a jointed bug leg (hip, knee, foot): ink tube, a knee dab, a little foot claw; hair: tiny ticks (spider). */
function bugLeg(c, R, P, w, col, lw, o, hair = 0) {
  const L = o.dead ? curl(P) : P;
  tube(c, L, w, col, R, lw);
  dab(c, L[1][0], L[1][1], w * 0.62, tone(col, 0.12), R);
  const [k, f] = [L[1], L[2]], dx = f[0] - k[0], dy = f[1] - k[1], l = Math.hypot(dx, dy) || 1;
  brush(c, [[f[0], f[1]], [f[0] + dx / l * w * 0.9 + (dx > 0 ? 0.6 : -0.6), f[1] + dy / l * w * 0.5]], Math.max(0.45, w * 0.45), C.ink, R, { bristles: 1, dry: 0, taper: 0.4 });
  if (hair) for (let s = 0; s < 2; s++) { const A = L[s], B = L[s + 1]; for (let i = 1; i <= hair; i++) { const t = i / (hair + 1), x = lerp(A[0], B[0], t), y = lerp(A[1], B[1], t), ex = B[0] - A[0], ey = B[1] - A[1], el = Math.hypot(ex, ey) || 1, nx = -ey / el, ny = ex / el, sg = ny > 0 ? -1 : 1;
    brush(c, [[x + nx * w * 0.5 * sg, y + ny * w * 0.5 * sg], [x + nx * (w * 0.5 + 0.9) * sg + ex / el * 0.3, y + ny * (w * 0.5 + 0.9) * sg + ey / el * 0.3]], 0.42, C.ink, R, { bristles: 1, dry: 0, taper: 0.5 }); } }
}
/** short ink hairs sticking out of an ellipse's outline between angles a0..a1 (canvas angles: 0 right, PI/2 down). */
function hairs(c, cx, cy, rx, ry, a0, a1, n, len, w, R, col = C.ink) {
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, (i + 0.5) / n) + (R() - 0.5) * 0.12, ca = Math.cos(a), sa = Math.sin(a), l = len * (0.75 + R() * 0.5);
    brush(c, [[cx + ca * rx * 0.96, cy + sa * ry * 0.96], [cx + ca * (rx + l), cy + sa * (ry + l)]], w, col, R, { bristles: 1, dry: 0, taper: 0.6 });
  }
}

// ---------------------------------------------------------------- poses -> layers (shared with the floppy driver)
/** rig.parts() result: every node's part (n0..n15, null = none), rest angles A, numbers (rig-bugs.js reads them). */
function bp(nodes, pose, p) {
  const r = { A: new Array(nodes).fill(0), gait: 1, flap: 0, pitch: 0, lift: 0, hx: 0, shake: 0, sc: 1, wf: 0, code: code(pose), kp: 0, kb: 0, ka: 0, kh: 0, k0: 0, k1: 0, kw: 0 };
  for (let i = 0; i < 16; i++) r[NK[i]] = null;
  return Object.assign(r, p);
}
const POSE_CODE = new Map();
const code = (pose) => { let k = POSE_CODE.get(pose.replace(/[ML]$/, '').replace(/^fly1$/, 'fly0').replace(/^walk1$/, 'walk0')); if (k === undefined) { k = POSE_CODE.size + 1; POSE_CODE.set(pose.replace(/[ML]$/, '').replace(/^fly1$/, 'fly0').replace(/^walk1$/, 'walk0'), k); } return k; };
const SCR = newP();
/** Paint a whole pose: every layer of rig.parts(pose) through emit() with the pose's rest numbers. */
function paintPose(c, o, T, pose) {
  const J = resolveJ(T.rig.joints), rp = T.rig.parts(pose, !!o.risen), D = BT[T.rig.q];
  const p = restP(J, rp, D, SCR, !!o.dead);
  const list = [];
  emitWith(J, rp, p, (nm, a, b, cc, d, e, f) => list.push([nm, a, b, cc, d, e, f]));
  for (const [nm, a, b, cc, d, e, f] of list) { c.save(); c.transform(a, b, cc, d, e, f); T.layer(c, o, nm); c.restore(); }
}
function paintBug(c, o, T) {
  const dh = T.rig.joints.deadH;
  if (isPart(o.pose)) { if (o.dead) onBack(c, dh * (T.scOf ? T.scOf(o.pose) : 1), () => T.layer(c, o, o.pose)); else T.layer(c, o, o.pose); return; }
  if (o.dead) { onBack(c, dh, () => paintPose(c, o, T, T.rest)); return; }
  paintPose(c, o, T, o.pose);
}
const H = Math.PI / 2;

// ================================================================ SPIDER (r 8.8): black, hairy, red eyes, 8 high-kneed legs
const SPI_OWN = '#352d3d';
// legs (hip, knee, foot), front to back; the far ones are these, shifted up + back, darker
// (all 8 come out from under the body: the round body + face stay clear, the knees arch up over it, the feet splay below)
const SPI_LEGS = [[[5.0, -5.4], [10.8, -11.6], [15.0, -0.3]], [[3.8, -5.6], [7.8, -13.6], [10.0, -0.3]], [[2.2, -5.6], [-1.6, -14.8], [-4.0, -0.3]], [[1.0, -5.2], [-7.6, -15.0], [-12.8, -0.3]]];
const SPI_FAR = [[[4.2, -6.0], [9.0, -12.6], [12.6, -1.2]], [[3.2, -6.2], [5.6, -14.4], [7.2, -1.2]], [[1.6, -6.2], [-3.6, -15.4], [-6.4, -1.2]], [[0.6, -6.0], [-9.6, -14.2], [-14.6, -1.2]]];
// reared up to shoot (in the body's frame, before it tips back): the front two legs (near + far) held up and forward
const SPI_UP = { 0: [[5.0, -5.4], [10.4, -14.6], [15.6, -11.0]], 1: [[3.8, -5.6], [8.6, -14.2], [12.2, -6.4]] };
const SPI_UPF = { 0: [[4.2, -6.0], [9.2, -15.0], [13.6, -12.6]], 1: [[3.2, -6.2], [7.0, -15.6], [10.0, -8.6]] };
function spiPal(o) {
  return { body: pc(o, SPI_OWN), far: pc(o, '#1c1820', tone(C.zskin, -0.32)), hair: pc(o, '#6a5f78', C.zskinD, C.charL), mark: pc(o, '#776a8c', tone(C.zskin, 0.35), C.charL),
    eye: pc(o, '#ff2a2a', MILK, C.charL), fang: pc(o, '#9a1f26', '#7a5a4a', C.charL), gloss: pc(o, '#8a7f9c', tone(C.zskin, 0.45), C.charL) };
}
function spiLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = spiPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:lF': case 'r:lFU': for (let i = 3; i >= 0; i--) bugLeg(c, R, L === 'r:lFU' && SPI_UPF[i] ? SPI_UPF[i] : SPI_FAR[i], 0.85, Pl.far, 0.45, o, 1); return;
    case 'r:lNa': case 'r:lNaU': for (const i of [3, 1]) bugLeg(c, R, L === 'r:lNaU' && SPI_UP[i] ? SPI_UP[i] : SPI_LEGS[i], 0.95, Pl.body, 0.5, o, 2); return;   // near legs 1 + 3 (one step)
    case 'r:lNb': case 'r:lNbU': for (const i of [2, 0]) bugLeg(c, R, L === 'r:lNbU' && SPI_UP[i] ? SPI_UP[i] : SPI_LEGS[i], 0.95, Pl.body, 0.5, o, 2); return;   // near legs 0 + 2 (the other)
    case 'r:ab': {
      const pts = ring(-5.6, -8.2, 6.2, 5.3, R, 0.08, 11, 0.2);
      hairs(c, -5.6, -8.2, 6.2, 5.3, 0.62 * Math.PI, 1.9 * Math.PI, 15, 1.25, 0.55, R);
      partIn(c, pts, Pl.body, M, 1.45, () => {
        if (!burnt) {
          for (const [x, y, s] of [[-2.6, -10.6, 1.1], [-5.6, -11, 1.25], [-8.6, -9.8, 1.1]]) brush(c, [[x - s, y - s * 0.9], [x, y + s * 0.3], [x + s, y - s * 0.9]], 0.8, Pl.mark, R, { bristles: 2, dry: 0.2, taper: 0.2 });
          dab(c, -3.6, -11.2, 1.05, Pl.gloss, R);
          dab(c, -11.4, -7.4, 0.8, Pl.mark, R);   // spinnerets
        }
        if (o.risen) stitches(c, -8.4, -6.4, 4, 1.5, 0.7, R);
        if (burnt) scorch(c, [[-6, -8, 1.6], [-3, -6, 1.1]], R);
        stripe(c, o, SPI_OWN, [[-1.2, -12.2], [-5.4, -13.4], [-9.8, -11.6]], 2.5, R);
      });
      return;
    }
    case 'r:body': case 'r:bodyO': {
      const open = L === 'r:bodyO' || o.dead === 'dead';
      // fangs + palps under the front, then the head-chest, eyes on top
      if (open) {
        brush(c, [[7.0, -4.4], [8.8, -3.6], [9.4, -2.2]], 1.0, Pl.fang, R, { bristles: 2, dry: 0, taper: 0.6 });
        brush(c, [[6.2, -4.4], [5.8, -2.6], [6.6, -1.6]], 0.95, Pl.fang, R, { bristles: 2, dry: 0, taper: 0.6 });
        if (!burnt) { dab(c, 9.5, -2.1, 0.45, C.white, R); dab(c, 6.7, -1.5, 0.4, C.white, R); }
      } else {
        brush(c, [[6.6, -4.6], [7.1, -3.2], [6.5, -2.4]], 0.95, Pl.fang, R, { bristles: 2, dry: 0, taper: 0.6 });
        brush(c, [[5.8, -4.6], [6.0, -3.2], [5.5, -2.6]], 0.85, tone(Pl.fang, -0.3), R, { bristles: 2, dry: 0, taper: 0.6 });
      }
      tube(c, [[6.4, -6.0], [8.2, -5.6], [9.0, -4.4]], 0.9, Pl.body, R, 0.5);
      hairs(c, 3.0, -6.6, 4.4, 3.4, 1.12 * Math.PI, 1.88 * Math.PI, 7, 1.0, 0.5, R);
      part(c, ring(3.0, -6.6, 4.4, 3.4, R, 0.07, 9), Pl.body, M, { lw: 1.35 });
      if (burnt) scorch(c, [[2.4, -6, 1.2]], R);
      if (o.dead) { const xc = burnt ? '#9a918a' : '#ffb3b3'; xEye(c, 5.0, -8.2, 1.2, R, 0.7, xc); xEye(c, 2.9, -9.0, 1.0, R, 0.65, xc); return; }
      for (const [x, y, r] of [[5.0, -8.2, 1.6], [2.9, -9.0, 1.3], [6.5, -6.8, 0.65], [1.5, -9.3, 0.55]]) { dab(c, x, y, r, Pl.eye, R); if (r > 1 && !o.risen && !burnt) dab(c, x - r * 0.3, y - r * 0.35, r * 0.36, C.white, R); }
      if (o.risen) { dab(c, 5.4, -7.8, 0.55, C.ink, R); stitches(c, 1.6, -5.4, 3, 1.3, 0.55, R); }
      else if (!burnt) brush(c, [[3.4, -10.6], [5.2, -10.2], [6.8, -9.2]], 0.8, Pl.eye === C.charL ? C.ink : '#ff8a8a', R, { bristles: 2, dry: 0.1 });   // a red angry brow
      return;
    }
  }
}
const SPIDER = {
  layer: spiLayer, rest: 'idle',
  rig: {
    driver: 'bug', q: 'spider',
    joints: { pivot: [1, -6.6], deadH: 13.6, dpitch: 0,
      nodes: [['lF', 'leg', -1, 2.4, -6.1, H, 0.5], ['lNa', 'leg', -1, 2.4, -5.4, Math.PI], ['lNb', 'leg', -1, 3.6, -5.5, 0], ['ab', 'ab', -1, -0.4, -7.2], ['body', 'body', -1, 0, 0]],
      dead: [0.1, 0.2, -0.2, 0.12, 0] },
    parts(pose) {
      const p = { n0: 'r:lF', n1: 'r:lNa', n2: 'r:lNb', n3: 'r:ab', n4: 'r:body' };
      if (pose === 'walk0') p.wf = 1; else if (pose === 'walk1') p.wf = 2;
      else if (pose === 'atk') { p.n4 = 'r:bodyO'; p.pitch = 0.12; p.hx = 1.6; p.A = [-0.2, -0.15, -0.3, 0.05, 0]; p.kp = 2; }
      else if (pose === 'shoot') { p.n0 = 'r:lFU'; p.n1 = 'r:lNaU'; p.n2 = 'r:lNbU'; p.n4 = 'r:bodyO'; p.gait = 0; p.pitch = -0.42; p.lift = -1.2; p.A = [0.12, 0.1, 0.1, 0.3, 0]; p.kp = -3; p.kb = -20; }
      return bp(5, pose, p);
    },
  },
};

// ================================================================ BEETLE (r 11): shiny blue-green dome, a great curved horn
const BTL_OWN = '#1f8f8a';
const BTL_SHELL = [[4.8, -4.4], [5.4, -10.2], [2, -14.8], [-3.8, -16.2], [-9.2, -14], [-11.8, -9.2], [-11.4, -5], [-7, -3.6], [-1, -3.4]];
const BTL_PRON = [[4.2, -4.2], [4.6, -11.2], [7.8, -12.6], [10.8, -11.2], [11.6, -7], [10, -4.2]];
const BTL_LEGS = [[[7.2, -4.4], [10.4, -5.8], [12.2, -0.3]], [[2.6, -4.0], [4.8, -5.0], [4.2, -0.3]], [[-2.6, -4.0], [-6.2, -5.4], [-8.6, -0.3]]];
function btlPal(o) {
  return { shell: pc(o, BTL_OWN), shellD: pc(o, '#0f5552', C.zskinD, C.charL), shine: pc(o, '#a6f7ec', tone(C.zskin, 0.5), C.charL), pron: pc(o, '#16716e', tone(C.zskin, -0.12)),
    head: pc(o, '#164e4b', tone(C.zskin, -0.25)), horn: pc(o, '#22403e', C.zskinD, C.char), leg: pc(o, '#1d3d3b', C.zskinD), legF: pc(o, '#10201f', tone(C.zskinD, -0.3)), belly: pc(o, '#123432', C.zskinD, C.charL) };
}
function btlLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = btlPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:lF': for (const P of BTL_LEGS) bugLeg(c, R, shiftP(P, -1.8, -0.8), 1.5, Pl.legF, 0.6, o); return;
    case 'r:lN0': case 'r:lN1': case 'r:lN2': {
      const P = BTL_LEGS[+L[4]]; bugLeg(c, R, P, 1.75, Pl.leg, 0.7, o);
      if (!o.dead) for (const t of [0.4, 0.7]) { const x = lerp(P[1][0], P[2][0], t), y = lerp(P[1][1], P[2][1], t), sg = P[2][0] > P[1][0] ? 1 : -1; brush(c, [[x, y], [x + sg * 1.1, y - 0.5]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0.6 }); }   // spiky shins
      return;
    }
    case 'r:body': {
      brush(c, [[-9.6, -4.2], [-1, -3.4], [8.4, -4.0]], 2.6, Pl.belly, R, { taper: 0.1, dry: 0.15, bristles: 4 });
      partIn(c, poly(BTL_SHELL, R, 0.3), Pl.shell, M, 1.75, () => {
        brush(c, [[-11, -6.4], [-5, -4.6], [3.6, -5.2]], 1.6, Pl.shellD, R, { taper: 0.3, dry: 0.3, bristles: 3 });
        if (!burnt) {
          for (const [k, w] of [[0.55, 0.7], [0.78, 0.6]]) brush(c, [[4.6 * k, -14 * k - 1.6], [-3.6, -15.4 * k - 0.6], [-10.6 * k, -9.4 * k - 1.4]], w, tone(Pl.shell, 0.28), R, { bristles: 2, dry: 0.35, taper: 0.4 });   // ridges
          brush(c, [[2.4, -13.4], [-1.6, -14.8], [-5.4, -14.6]], 1.5, Pl.shine, R, { taper: 0.6, dry: 0.25, bristles: 3 });
          dab(c, 1.6, -12.2, 0.85, C.white, R);
        }
        if (o.risen) stitches(c, -8, -9, 4, 1.8, 0.8, R);
        if (burnt) scorch(c, [[-4, -10, 2], [1, -8, 1.4]], R);
        stripe(c, o, BTL_OWN, [[3.4, -14.2], [-3.6, -16.4], [-9.6, -13.6]], 2.6, R);
      });
      part(c, poly(BTL_PRON, R, 0.25), Pl.pron, M, { lw: 1.55 });
      if (!burnt) { brush(c, [[6, -11.4], [8.6, -11.8], [10.2, -10.4]], 1.0, Pl.shine, R, { bristles: 2, dry: 0.3, taper: 0.5 }); dab(c, 7.4, -10.2, 0.6, C.white, R); }
      return;
    }
    case 'r:head': {
      part(c, poly([[12.2, -8.8], [14.6, -11.8], [17.0, -14.4], [18.4, -18.0], [19.4, -14.6], [18.4, -10.8], [15.4, -7.9]], R, 0.15), Pl.horn, M, { lw: 1.2, sharp: true });   // the horn: forward, then up
      if (!burnt) brush(c, [[14.6, -10.4], [17.0, -12.8], [18.4, -16.4]], 0.6, tone(Pl.shell, 0.35), R, { bristles: 1, dry: 0.3, taper: 0.5 });
      part(c, poly([[10.2, -8.8], [13, -9.8], [15.2, -7.6], [15, -5], [12, -3.8], [10.4, -4.6]], R, 0.2), Pl.head, M, { lw: 1.35 });
      brush(c, [[14.8, -5.2], [16.4, -4.4], [16.8, -3.2]], 0.6, C.ink, R, { bristles: 1, dry: 0 });   // a little jaw
      eye(c, o, 13.2, -6.9, 1.0, R, 0.6);
      if (o.risen && !o.dead) stitches(c, 11.4, -5.0, 2, 1.2, 0.5, R);
      return;
    }
  }
}
const BEETLE = {
  layer: btlLayer, rest: 'idle',
  rig: {
    driver: 'bug', q: 'beetle',
    joints: { pivot: [0, -7], deadH: 16.6, dpitch: 0,
      nodes: [['lF', 'leg', -1, 2.0, -4.8, H, 0.5], ['body', 'body', -1, 0, 0], ['head', 'head', -1, 10.6, -7.0],
        ['lN2', 'leg', -1, -2.6, -4.0, 0], ['lN1', 'leg', -1, 2.6, -4.0, Math.PI], ['lN0', 'leg', -1, 7.2, -4.4, 0]],
      dead: [0.1, 0, 1.25, 0.3, 0.05, -0.3] },
    parts(pose) {
      const p = { n0: 'r:lF', n1: 'r:body', n2: 'r:head', n3: 'r:lN2', n4: 'r:lN1', n5: 'r:lN0' };
      if (pose === 'walk0') p.wf = 1; else if (pose === 'walk1') p.wf = 2;
      else if (pose === 'atk') { p.pitch = 0.06; p.hx = 1.8; p.A = [0, 0, 0.32, 0, 0, -0.15]; p.kh = 3; }
      else if (pose === 'flip') { p.gait = 0; p.pitch = -0.16; p.lift = -0.6; p.A = [-0.1, 0, -0.72, 0.25, -0.2, -0.55]; p.kh = -6; p.kp = -2.5; }
      return bp(6, pose, p);
    },
  },
};

// ================================================================ MANTIS (r 9.9): lime, upright, praying blades
const MAN_OWN = '#b8d82b', MAN_ZOM = '#93ab72';
const MAN_AB = [[-0.6, -8.2], [-5, -8.7], [-10, -8.3], [-14.4, -7.3], [-16.4, -6.2], [-14.2, -4.7], [-9, -3.9], [-4, -4.1], [-0.4, -5.3]];
const MAN_WING = [[0.8, -8.5], [-4, -9.9], [-9.6, -9.7], [-13.8, -8.2], [-10, -7.5], [-4, -7.5]];
const MAN_LEGS = [[[1.4, -6.2], [4.6, -9.4], [7.2, -0.3]], [[-0.4, -5.8], [-4.6, -9.8], [-8.2, -0.3]]];
function manPal(o) {
  return { skin: pc(o, MAN_OWN, MAN_ZOM), dark: pc(o, '#5c8a14', C.zskinD, C.charL), far: pc(o, tone(MAN_OWN, -0.28), tone(MAN_ZOM, -0.28)), belly: pc(o, '#eef59a', tone(MAN_ZOM, 0.4), C.charL),
    wing: pc(o, '#8fbf1e', tone(MAN_ZOM, -0.12)), spot: pc(o, '#7a3a8c', '#5a5a4a', C.charL), spotR: pc(o, '#ffe14a', '#c8c8a0', C.charL) };
}
/** a raptorial arm: folded (praying: blade up, the shin folded down on it) or struck out (blade forward, shin flung out). */
function manArm(c, o, R, M, Pl, far, x) {
  const dx = far ? -1.2 : 0, dy = far ? -0.6 : 0, col = far ? Pl.far : Pl.skin, P = (pts) => pts.map(([a, b]) => [a + dx, b + dy]);
  const spikes = (fem, side) => { for (let i = 0; i < 4; i++) { const t = 0.18 + i * 0.2, X = lerp(fem[0][0], fem[2][0], t), Y = lerp(fem[0][1], fem[2][1], t); brush(c, side ? [[X, Y + 0.9], [X - 0.7, Y + 2.2]] : [[X - 0.9, Y], [X - 2.2, Y + 0.7]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0.7 }); } };
  const spot = (X, Y) => { if (!far && o.dead !== 'burnt' && !o.dead) { dab(c, X + dx, Y + dy, 0.8, Pl.spotR, R); dab(c, X + dx, Y + dy, 0.45, Pl.spot, R); } };
  if (!x) {   // folded (praying): coxa down + forward, the spiky blade up, the shin folded back down along it
    tube(c, P([[5.2, -14.0], [6.8, -12.6], [8.4, -11.4]]), 1.8, col, R, 0.6);
    const fem = P([[8.4, -11.4], [10.2, -14.4], [11.4, -17.2]]);
    spikes(fem, 0);
    tube(c, fem, 2.7, col, R, 0.65);
    tube(c, P([[11.4, -17.2], [10.7, -14.6], [9.9, -12.4]]), 1.3, col, R, 0.5);
    brush(c, P([[9.9, -12.4], [9.1, -11.9], [8.9, -12.7]]), 0.65, C.ink, R, { bristles: 1, dry: 0 });
    spot(7.0, -12.5);
    return;
  }
  // struck out: the blade forward, the shin flung out with its hook, whoosh lines over it
  tube(c, P([[5.2, -14.0], [7.0, -13.6], [8.6, -12.8]]), 1.8, col, R, 0.6);
  const fem = P([[8.6, -12.8], [11.6, -13.4], [14.6, -13.4]]);
  spikes(fem, 1);
  tube(c, fem, 2.7, col, R, 0.65);
  tube(c, P([[14.6, -13.4], [16.8, -12.2], [18.6, -10.6]]), 1.3, col, R, 0.5);
  brush(c, P([[18.6, -10.6], [18.9, -9.4], [18.2, -9.0]]), 0.7, C.ink, R, { bristles: 1, dry: 0 });
  spot(7.2, -13.4);
  if (!o.dead) for (let i = 0; i < 3; i++) brush(c, P([[11 + i * 2.6, -16.4 - i * 0.2], [13 + i * 2.6, -16.8 - i * 0.2]]), 0.55, C.ink, R, { bristles: 1, dry: 0.3, taper: 0.5 });
}
function manLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = manPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:lF': for (const P of MAN_LEGS) bugLeg(c, R, shiftP(P, -1.4, -0.7), 0.95, Pl.far, 0.5, o); return;
    case 'r:lN0': case 'r:lN1': bugLeg(c, R, MAN_LEGS[+L[4]], 1.05, Pl.skin, 0.55, o); return;
    case 'r:aN': manArm(c, o, R, M, Pl, false, false); return;
    case 'r:aNX': manArm(c, o, R, M, Pl, false, true); return;
    case 'r:aFX': manArm(c, o, R, M, Pl, true, true); return;
    case 'r:ab':
      partIn(c, poly(MAN_AB, R, 0.25), Pl.skin, M, 1.45, () => {
        brush(c, [[-1.4, -4.8], [-6, -4.2], [-12, -4.8]], 1.2, Pl.belly, R, { taper: 0.5, dry: 0.4, bristles: 3 });
        for (const x of [-4, -7.4, -10.8, -13.6]) brush(c, [[x + 0.3, -7.6], [x - 0.3, -4.6]], 0.55, Pl.dark, R, { bristles: 1, dry: 0.3 });
        if (burnt) scorch(c, [[-8, -6, 1.4]], R);
      });
      part(c, poly(MAN_WING, R, 0.2), Pl.wing, M, { lw: 1.05 });
      brush(c, [[0, -8.6], [-6, -8.9], [-12.6, -8.1]], 0.5, Pl.dark, R, { bristles: 1, dry: 0.3, taper: 0.4 });
      if (o.risen) stitches(c, -10, -6.0, 3, 1.4, 0.6, R);
      stripe(c, o, MAN_OWN, [[0.2, -9.6], [-6, -10.2], [-12.4, -9.2]], 2.2, R);
      return;
    case 'r:body': case 'r:bodyA': {
      if (L === 'r:bodyA') manArm(c, o, R, M, Pl, true, false);   // the far blade, folded, behind the chest
      part(c, ring(0.6, -6.7, 2.7, 2.0, R, 0.08, 8), Pl.skin, M, { lw: 1.35 });
      const pts = [[0.2, -7.0], [2.6, -10.6], [4.6, -14.2], [6.4, -16.9]], ws = [3.5, 3.1, 2.7, 2.3];
      const Lp = [], Rp = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; Lp.push([pts[i][0] + nx * ws[i] / 2, pts[i][1] + ny * ws[i] / 2]); Rp.push([pts[i][0] - nx * ws[i] / 2, pts[i][1] - ny * ws[i] / 2]); }
      const all = Lp.concat(Rp.slice().reverse());
      fill(c, shift(all, M.mx * 0.7, M.my * 0.7, M.grow * 0.4), Pl.skin, R);
      brush(c, Rp.map(([x, y]) => [x - 0.4, y + 0.2]), 0.9, Pl.belly, R, { bristles: 2, dry: 0.3, taper: 0.3 });
      brush(c, poly(Lp, R, 0.2), 0.95, C.ink, R, { bristles: 3, taper: 0.4, dry: 0.3 }); brush(c, poly(Rp, R, 0.2), 0.95, C.ink, R, { bristles: 3, taper: 0.4, dry: 0.3 });
      if (burnt) scorch(c, [[2.6, -10.4, 1]], R);
      return;
    }
    case 'r:head': {
      brush(c, [[9.2, -20.8], [11.2, -24.4], [14.6, -26.2]], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0.2 });   // antennae
      brush(c, [[8.4, -21.0], [9.4, -24.8], [11.6, -27.6]], 0.5, tone(C.ink, 0.25), R, { bristles: 1, dry: 0, taper: 0.2 });
      part(c, poly([[5.4, -18.2], [7.2, -20.8], [10.2, -21.4], [11.4, -19.4], [9.8, -16.2], [7.2, -16.6]], R, 0.15), Pl.skin, M, { lw: 1.3 });
      brush(c, [[9.8, -16.4], [10.6, -15.4]], 0.6, Pl.dark, R, { bristles: 1, dry: 0 });   // mouth parts
      if (!o.dead && !o.risen && !burnt) dab(c, 9.4, -19.4, 1.75, Pl.belly, R);   // the bulging eye's rim
      eye(c, o, 9.4, -19.4, 1.45, R, 0.5);
      if (o.risen && !o.dead) stitches(c, 7, -17.4, 2, 1.1, 0.45, R);
      return;
    }
  }
}
const MANTIS = {
  layer: manLayer, rest: 'pray',
  rig: {
    driver: 'bug', q: 'mantis',
    joints: { pivot: [0.4, -6.4], deadH: 10.4, dpitch: 0.75,
      nodes: [['lF', 'leg', -1, 0.6, -6.4, H, 0.5], ['aF', 'arm1', -1, 3.8, -14.6], ['ab', 'ab', -1, -0.4, -6.6], ['body', 'body', -1, 0, 0], ['head', 'head', -1, 6.4, -17.4],
        ['lN1', 'leg', -1, -0.4, -5.8, Math.PI], ['lN0', 'leg', -1, 1.4, -6.2, 0], ['aN', 'arm0', -1, 5.0, -14.0]],
      dead: [0.4, 0.9, -0.78, 0, 0.35, 0.45, -0.3, 1.0] },
    parts(pose) {
      const p = { n0: 'r:lF', n1: null, n2: 'r:ab', n3: 'r:bodyA', n4: 'r:head', n5: 'r:lN1', n6: 'r:lN0', n7: 'r:aN' };
      if (pose === 'walk0' || pose === 'walk1') { p.wf = pose === 'walk0' ? 1 : 2; p.A = [0, 0.12, 0, 0, 0, 0, 0, 0.12]; }
      else if (pose === 'atk') { p.n7 = 'r:aNX'; p.pitch = 0.14; p.hx = 1.5; p.A = [0, 0.1, -0.05, 0, 0.18, 0, 0, 0.3]; p.k0 = 10; }
      else if (pose === 'atk1') { p.n1 = 'r:aFX'; p.n3 = 'r:body'; p.pitch = 0.14; p.hx = 1.5; p.A = [0, 0.3, -0.05, 0, 0.18, 0, 0, 0.1]; p.k1 = 10; }
      else if (pose === 'lunge') { p.n7 = 'r:aNX'; p.n1 = 'r:aFX'; p.n3 = 'r:body'; p.gait = 0; p.pitch = 0.6; p.lift = -1.8; p.A = [0.7, -0.12, -0.35, 0, -0.35, 0.85, 0.7, -0.2]; p.kp = 4; p.k0 = -6; p.k1 = -6; }
      return bp(8, pose, p);
    },
  },
};

// ================================================================ BOMBARDIER (r 8.8): red-orange front, black shell with orange spots
const BOM_OWN = '#e0441c';
const BOM_ELY = [[2.4, -4], [3, -9.2], [0.2, -11.8], [-4.6, -12.2], [-8.6, -10.2], [-10.4, -6.8], [-9.6, -4], [-4, -3.2]];
const BOM_PRO = [[2, -4.2], [2.4, -9.2], [5, -10.2], [7, -8.4], [7.2, -4.6]];
const BOM_LEGS = [[[5.2, -4.0], [7.8, -5.4], [9.8, -0.3]], [[1.8, -3.8], [3.2, -5.0], [2.4, -0.3]], [[-2.2, -3.8], [-5.4, -5.2], [-7.8, -0.3]]];
function bomPal(o) {
  return { red: pc(o, BOM_OWN), redD: pc(o, '#9a2a10', C.zskinD, C.charL), shell: pc(o, '#241c24', tone(C.zskin, -0.4)), spot: pc(o, '#ff8a1a', tone(C.zskin, 0.3), C.charL),
    shine: pc(o, '#9a90a6', tone(C.zskin, 0.4), C.charL), leg: pc(o, '#d8461e', C.zskin), legF: pc(o, '#8a2c12', tone(C.zskin, -0.3)) };
}
function bomLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = bomPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:lF': for (const P of BOM_LEGS) bugLeg(c, R, shiftP(P, -1.6, -0.7), 0.85, Pl.legF, 0.45, o); return;
    case 'r:lN0': case 'r:lN1': case 'r:lN2': bugLeg(c, R, BOM_LEGS[+L[4]], 0.95, Pl.leg, 0.5, o); return;
    case 'r:ab':
      part(c, poly([[-8.4, -4.4], [-10.6, -6.2], [-11.4, -4.4], [-9.4, -3.0]], R, 0.15), Pl.red, M, { lw: 1.0 });   // the rear tip (the nozzle)
      partIn(c, poly(BOM_ELY, R, 0.25), Pl.shell, M, 1.5, () => {
        if (!burnt) {
          brush(c, [[-1.8, -11.6], [-2.5, -8], [-2.1, -3.9]], 2.0, Pl.spot, R, { bristles: 3, dry: 0.15, taper: 0 });
          brush(c, [[-6.0, -11.0], [-6.9, -7.6], [-6.6, -4.0]], 1.9, Pl.spot, R, { bristles: 3, dry: 0.15, taper: 0 });
          brush(c, [[1.2, -10.4], [-1.6, -11.4], [-4.4, -11.6]], 0.9, Pl.shine, R, { bristles: 2, dry: 0.3, taper: 0.5 });
        }
        if (o.risen) stitches(c, -8, -6, 3, 1.4, 0.6, R);
        if (burnt) scorch(c, [[-4, -8, 1.6]], R);
        stripe(c, o, BOM_OWN, [[1.6, -11.0], [-3.4, -12.4], [-8.0, -10.6]], 2.3, R);
      });
      return;
    case 'r:spray': {   // a boiling cone out of the rear (painted aimed back + down: the raised rear tips it level), puffs boiling at
      if (o.dead) return; // its end, hot drops flying, steam curls
      const x0 = -10.8, y0 = -5.2, ca = -Math.cos(0.4), sa = Math.sin(0.4), at = (d, w) => [x0 + ca * d - sa * w, y0 + sa * d + ca * w];
      const cone = []; for (const d of [0, 7, 14, 21, 26]) cone.push(at(d, -(0.9 + d * 0.24))); for (const d of [26, 21, 14, 7, 0]) cone.push(at(d, 0.9 + d * 0.24));
      part(c, poly(cone, R, 0.3), '#fff0a0', o.M, { lw: 0.9 });
      brush(c, [at(0.5, 0), at(10, 0.3), at(20, -0.2)], 1.6, '#fffdf0', R, { bristles: 2, dry: 0.3, taper: 0.5 });
      for (const [d, w, r, col] of [[27, 0, 4.4, '#fff6c8'], [24, -4.6, 3.2, '#ffe266'], [25, 4.4, 3.4, '#ffe680'], [19, -3.2, 2.4, '#fff2b0'], [31, -2.6, 2.8, '#ffe266'], [31, 3, 2.6, '#fff4c0']]) {
        const [x, y] = at(d, w); part(c, ring(x, y, r, r * 0.86, R, 0.2, 8), col, o.M, { lw: 0.8 }); }
      for (let i = 0; i < 10; i++) { const [x, y] = at(8 + R() * 26, (R() - 0.5) * (6 + R() * 10)); dab(c, x, y, 0.45 + R() * 0.45, R() < 0.5 ? '#ff8a1a' : '#ffd23a', R); }
      for (let i = 0; i < 2; i++) { const [x, y] = at(14 + i * 9, 6.4 + i * 1.6); brush(c, [[x + 2, y + 2], [x, y], [x + 1.6, y - 1.8], [x + 3.2, y - 0.6]], 0.8, '#cfcac3', R, { bristles: 2, dry: 0.3, taper: 0.4 }); }
      return;
    }
    case 'r:body': case 'r:bodyO': {
      const open = L === 'r:bodyO' || o.dead === 'dead';
      brush(c, [[8.8, -8.4], [10.8, -10.6], [13.4, -11.8]], 0.55, C.ink, R, { bristles: 1, dry: 0, taper: 0.2 });   // antennae
      brush(c, [[8.2, -8.6], [9.6, -11.4], [11.6, -13.2]], 0.5, tone(C.ink, 0.25), R, { bristles: 1, dry: 0, taper: 0.2 });
      if (!burnt) for (const [x, y] of [[10.8, -10.6], [12.2, -11.4], [9.6, -11.4]]) dab(c, x, y, 0.4, Pl.leg, R);
      part(c, poly(BOM_PRO, R, 0.2), Pl.red, M, { lw: 1.35 });
      if (!burnt) dab(c, 4.4, -7.4, 0.9, Pl.shell, R);
      // jaws, then the head over them
      const jo = open ? 0.9 : 0.2;
      brush(c, [[9.6, -6.2], [11.0, -6.6 - jo], [11.6, -5.6 - jo]], 0.7, Pl.redD, R, { bristles: 2, dry: 0, taper: 0.5 });
      brush(c, [[9.6, -5.2], [11.0, -4.6 + jo], [11.4, -5.4 + jo]], 0.7, Pl.redD, R, { bristles: 2, dry: 0, taper: 0.5 });
      part(c, ring(8.3, -6.4, 2.1, 1.9, R, 0.08, 7), Pl.red, M, { lw: 1.2 });
      eye(c, o, 8.9, -7.1, 0.85, R, 0.6);
      if (o.risen && !o.dead) stitches(c, 3.4, -6.2, 3, 1.2, 0.5, R);
      return;
    }
  }
}
const BOMBARDIER = {
  layer: bomLayer, rest: 'idle',
  rig: {
    driver: 'bug', q: 'bombardier',
    joints: { pivot: [1, -6.4], deadH: 12.4, dpitch: 0,
      nodes: [['lF', 'leg', -1, 1.6, -4.6, H, 0.5], ['ab', 'ab', -1, 2.2, -6.4], ['spray', 'fx', 1, -10.6, -5.2], ['body', 'body', -1, 0, 0],
        ['lN2', 'leg', -1, -2.2, -3.8, 0], ['lN1', 'leg', -1, 1.8, -3.8, Math.PI], ['lN0', 'leg', -1, 5.2, -4.0, 0]],
      dead: [0.2, 0.1, 0, 0, 0.4, 0.05, -0.4] },
    parts(pose) {
      const p = { n0: 'r:lF', n1: 'r:ab', n2: null, n3: 'r:body', n4: 'r:lN2', n5: 'r:lN1', n6: 'r:lN0' };
      if (pose === 'walk0') p.wf = 1; else if (pose === 'walk1') p.wf = 2;
      else if (pose === 'atk') { p.n3 = 'r:bodyO'; p.pitch = 0.1; p.hx = 1.4; p.kp = 2; }
      else if (pose === 'spray') { p.n2 = 'r:spray'; p.gait = 0; p.pitch = 0.05; p.lift = -0.5; p.shake = 0.035; p.A = [0, 0.34, 0, 0, 0.25, 0, -0.25]; p.ka = 5; }
      else if (pose === 'aim') { p.gait = 1; p.pitch = 0.04; p.lift = -0.3; p.A = [0, 0.26, 0, 0, 0.15, 0, -0.15]; p.ka = 3; }
      return bp(7, pose, p);
    },
  },
};

// ================================================================ STINKBUG (r 8.8): a brown shield, pale freckles, green stink lines
const STK_OWN = '#8a5a2e';
const STK_BODY = [[6.4, -4.4], [6.8, -7.6], [5.2, -10.2], [3, -10.9], [-1, -11.0], [-4.6, -10.6], [-8.4, -8.9], [-10.6, -6.3], [-9.8, -4.1], [-4, -3.2], [2, -3.3]];
const STK_LEGS = [[[4.2, -3.6], [6.6, -5.4], [8.6, -0.3]], [[1.0, -3.4], [2.4, -5.2], [1.4, -0.3]], [[-2.6, -3.4], [-5.8, -5.4], [-8.4, -0.3]]];
function stkPal(o) {
  return { body: pc(o, STK_OWN), dark: pc(o, '#5a3818', C.zskinD, C.charL), light: pc(o, '#d9ad6e', tone(C.zskin, 0.4), C.charL), scut: pc(o, '#b5864e', tone(C.zskin, 0.18)),
    edge: pc(o, '#f0cd84', tone(C.zskin, 0.5), C.charL), leg: pc(o, '#b07a3f', C.zskin), legF: pc(o, '#6e4a24', tone(C.zskin, -0.3)), mem: pc(o, '#4a2c14', C.zskinD, C.char) };
}
function stkLayer(c, o, L) {
  const R = o.R, M = o.M, Pl = stkPal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:lF': for (const P of STK_LEGS) bugLeg(c, R, shiftP(P, -1.6, -0.7), 0.85, Pl.legF, 0.5, o); return;
    case 'r:lN0': case 'r:lN1': case 'r:lN2': bugLeg(c, R, STK_LEGS[+L[4]], 0.95, Pl.leg, 0.55, o); return;
    case 'r:stink': {   // three wavy green stink lines rising out of its back, a whiff either side
      if (o.dead) return;
      for (const [x0, h, s] of [[-4.8, 11, -1], [-0.8, 13.5, 0.3], [3.0, 10.5, 1]]) {
        const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([x0 + s * t * 2.6 + Math.sin(t * TAU * 1.25) * 1.4, -11.6 - t * h]); }
        brush(c, pts, 1.45, '#3f7a18', R, { bristles: 2, dry: 0.1, taper: 0.5 });
        brush(c, pts, 0.8, '#a6e256', R, { bristles: 2, dry: 0.15, taper: 0.5 });
      }
      for (const [x, y] of [[-9.6, -12.8], [7.8, -13.4]]) { const s = x < 0 ? -1 : 1; brush(c, [[x, y], [x + s * 1.2, y - 1.4], [x + s * 2.6, y - 1.2]], 0.9, '#7fc23a', R, { bristles: 2, dry: 0.2, taper: 0.6 }); }
      for (const [x, y, r] of [[-7.2, -20.4, 0.6], [5.6, -19.6, 0.55], [1.6, -26.2, 0.5]]) dab(c, x, y, r, '#8fd044', R);
      return;
    }
    case 'r:body': {
      // antennae (behind), the shoulder spike, the shield, then the head
      brush(c, [[8.8, -7.0], [11.4, -9.8], [14.4, -9.4]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0.2 });
      brush(c, [[8.2, -7.2], [9.8, -10.8], [12.4, -12.0]], 0.55, tone(C.ink, 0.25), R, { bristles: 1, dry: 0, taper: 0.2 });
      if (!burnt) for (const [x, y] of [[11.4, -9.8], [9.8, -10.8]]) dab(c, x, y, 0.45, Pl.edge, R);
      part(c, poly([[3.4, -10.6], [5.6, -12.4], [5.6, -9.8]], R, 0.12), Pl.body, M, { lw: 1.0, sharp: true });
      partIn(c, poly(STK_BODY, R, 0.25), Pl.body, M, 1.5, () => {
        fill(c, poly([[-6.4, -9.6], [-10.6, -6.4], [-9.2, -5.4], [-6.0, -7.6]], R, 0.15), Pl.mem, R, { edge: 0 });
        fill(c, poly([[3.0, -10.4], [-5.4, -9.8], [-0.8, -7.2]], R, 0.15), Pl.scut, R, { edge: 0 });
        if (!burnt) {
          for (let i = 0; i < 9; i++) dab(c, -8 + R() * 13, -9.6 + R() * 5, 0.32 + R() * 0.22, R() < 0.55 ? Pl.light : Pl.dark, R);
          for (let i = 0; i < 5; i++) brush(c, [[-7.4 + i * 2.6, -4.3], [-6.4 + i * 2.6, -4.1]], 0.75, Pl.edge, R, { bristles: 2, dry: 0, taper: 0 });   // the banded edge
        }
        if (o.risen) stitches(c, -6, -6.6, 3, 1.5, 0.6, R);
        if (burnt) scorch(c, [[-3, -7, 1.6]], R);
        stripe(c, o, STK_OWN, [[4.4, -11.2], [-1.6, -11.8], [-7.6, -9.6]], 2.4, R);
      });
      part(c, ring(8.0, -5.8, 2.1, 1.6, R, 0.08, 7), Pl.body, M, { lw: 1.15 });
      eye(c, o, 8.5, -6.6, 0.8, R, 0.7);
      return;
    }
  }
}
const STINKBUG = {
  layer: stkLayer, rest: 'idle',
  rig: {
    driver: 'bug', q: 'stinkbug',
    joints: { pivot: [0, -6.4], deadH: 11.8, dpitch: 0,
      nodes: [['lF', 'leg', -1, 1.0, -4.0, H, 0.5], ['body', 'body', -1, 0, 0], ['stink', 'fx', 1, -1, -11],
        ['lN2', 'leg', -1, -2.6, -3.4, 0], ['lN1', 'leg', -1, 1.0, -3.4, Math.PI], ['lN0', 'leg', -1, 4.2, -3.6, 0]],
      dead: [0.15, 0, 0, 0.4, 0.05, -0.4] },
    parts(pose) {
      const p = { n0: 'r:lF', n1: 'r:body', n2: null, n3: 'r:lN2', n4: 'r:lN1', n5: 'r:lN0' };
      if (pose === 'walk0') p.wf = 1; else if (pose === 'walk1') p.wf = 2;
      else if (pose === 'atk') { p.pitch = 0.12; p.hx = 1.4; p.kp = 2; }
      else if (pose === 'puff') { p.n2 = 'r:stink'; p.gait = 0; p.pitch = -0.12; p.lift = -1.2; p.shake = 0.05; p.kb = -30; p.kp = -2; }
      return bp(6, pose, p);
    },
  },
};

// ================================================================ BEE (r 3.85): round, yellow + black stripes, big white wings
const BEE_OWN = '#ffd51e';
function beePal(o) {
  return { yel: pc(o, BEE_OWN), blk: pc(o, '#2a2018', C.zskinD, C.ink), fur: pc(o, '#e89a1c', C.zskinD, C.charL), wing: pc(o, '#eef8ff', '#e2ecd8', C.charL), wingF: pc(o, '#cfe0ef', '#c8d4bc', C.char) };
}
const BEE_WING = ell(0.1, -9.6, 1.95, 3.5, 0.42, 10);
function beeLayer(c, o, L) {
  const R = o.R, M = smallM(o.M, 0.5), Pl = beePal(o), burnt = o.dead === 'burnt';
  switch (L) {
    case 'r:wB': part(c, poly(shiftP(BEE_WING.map(([x, y]) => [lerp(1.6, x, 0.9), lerp(-6.4, y, 0.9)]), -1.3, 0.3), R, 0.12), Pl.wingF, M, { lw: 0.75 }); return;
    case 'r:wF':
      part(c, poly(BEE_WING, R, 0.12), Pl.wing, M, { lw: 0.8 });
      if (!burnt) brush(c, [[1.2, -7.4], [0.5, -9.4], [-0.3, -11.4]], 0.4, '#9fb7cf', R, { bristles: 1, dry: 0.3, taper: 0.4 });
      return;
    case 'r:body': case 'r:bodyS': {
      // the striped abdomen (curled under about the waist to sting), then legs, the fuzzy thorax, the head
      c.save(); if (L === 'r:bodyS' && !o.dead) { c.translate(0.3, -4.6); c.rotate(-0.95); c.translate(-0.3, 4.6); }
      part(c, poly([[-4.8, -4.9], [-7.2, -4.1], [-4.8, -3.5]], R, 0.1), Pl.blk, M, { lw: 0.5, sharp: true });   // stinger
      partIn(c, ring(-1.7, -4.4, 3.6, 3.0, R, 0.06, 9), Pl.yel, M, 0.85, () => {
        if (!burnt) for (const [x, h] of [[-3.8, 2.3], [-1.3, 2.75]]) brush(c, [[x + 0.25, -4.4 - h], [x, -4.4], [x + 0.15, -4.4 + h]], 0.95, Pl.blk, R, { bristles: 3, dry: 0.05, taper: 0 });
        if (!burnt) dab(c, -0.4, -6.0, 0.6, '#fff1a0', R);
        if (o.risen) stitches(c, -3.8, -3.2, 3, 1.1, 0.45, R);
      });
      c.restore();
      const leg = (P) => brush(c, o.dead ? P.map(([x, y], i) => [x + (i ? 0.4 : 0), lerp(P[0][1], y, 0.6)]) : P, 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0.2 });
      leg([[0.9, -3.1], [0.3, -1.6], [0.6, -0.5]]); leg([[1.8, -3.0], [1.9, -1.4], [2.2, -0.4]]); leg([[2.6, -3.1], [3.4, -1.5], [3.9, -0.7]]);
      const tc = teamOf(o, BEE_OWN), th = tc ? (burnt ? C.charL : tc) : Pl.fur;
      hairs(c, 1.7, -4.9, 2.1, 2.0, 1.05 * Math.PI, 1.95 * Math.PI, 6, 0.7, 0.4, R);
      part(c, ring(1.7, -4.9, 2.15, 2.05, R, 0.08, 8), th, M, { lw: 0.8 });
      brush(c, [[4.2, -6.1], [5.0, -7.6], [6.0, -8.2]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });   // antenna
      dab(c, 6.1, -8.2, 0.45, C.ink, R);
      part(c, ring(4.0, -4.6, 1.75, 1.65, R, 0.08, 7), Pl.blk, M, { lw: 0.8 });
      eye(c, o, 4.5, -5.0, 1.05, R, 0, C.white);
      if (!o.dead && !o.risen && !burnt) brush(c, [[4.8, -3.6], [5.4, -3.4], [5.8, -3.8]], 0.35, C.white, R, { bristles: 1, dry: 0, taper: 0 });   // a little smile
      return;
    }
  }
}
const BEE = {
  layer: beeLayer, rest: 'stand',
  rig: {
    driver: 'bug', q: 'bee',
    joints: { pivot: [1, -4.6], deadH: 7.6, dpitch: 0, fly: true,
      nodes: [['wB', 'wingF', -1, 1.6, -6.4], ['body', 'body', -1, 0, 0], ['wF', 'wingN', -1, 1.6, -6.4]],
      dead: [-1.35, 0, 0.9] },
    parts(pose) {
      const p = { n0: 'r:wB', n1: 'r:body', n2: 'r:wF', gait: 0, flap: 1 };
      if (pose === 'fly0') p.wf = 3; else if (pose === 'fly1') p.wf = 4;
      else if (pose === 'sting') { p.n1 = 'r:bodyS'; p.pitch = -0.12; p.kp = -4; p.wf = 3; }
      else if (pose === 'stand') { p.flap = 0; p.lift = 0.6; p.A = [-1.05, 0, -0.95]; }
      return bp(3, pose, p);
    },
  },
};

// ================================================================ MOSQUITO (r 4.4): thin, grey, long banded legs, a red belly that swells
const MOS_OWN = '#a3a9b3', MOS_R = 4.4;
const MOS_SC = { '': 1, M: 1.7, L: 2.4 }, MOS_F = { '': 0, M: 0.55, L: 1 };
const MOS_LEGS = [[[1.9, -5.8], [4.6, -4.4], [7.8, -0.2]], [[1.4, -5.6], [1.8, -3.6], [0.8, 0]], [[0.9, -5.6], [-2.6, -3.6], [-6.8, -8.6]]];
const MOS_GRIP = [[[1.9, -5.8], [5.2, -5.4], [7.4, -0.4]], [[1.4, -5.6], [1.0, -3.0], [-0.6, -0.2]], [[0.9, -5.6], [-3.0, -4.0], [-6.0, -0.4]]];
const MOS_WING = ell(-3.3, -9.3, 4.6, 1.3, -0.14, 10);
function mosPal(o) {
  return { grey: pc(o, MOS_OWN), greyD: pc(o, '#5e646e', C.zskinD, C.charL), band: pc(o, '#f4f4ee', '#dfe6cf', C.charL), red: pc(o, '#e0262a', '#a07a6a', C.charL), redL: pc(o, '#ff7a7a', '#c8a090', C.charL),
    wing: pc(o, '#eef4f8', '#e0e8d4', C.charL), wingF: pc(o, '#d2dce4', '#c8d2bc', C.char), head: pc(o, '#5e646e', tone(C.zskin, -0.2)) };
}
function mosLegs(c, o, R, Pl, legs, far) {
  const dx = far ? -1.0 : 0, dy = far ? -0.6 : 0, col = far ? Pl.greyD : tone(Pl.grey, -0.15);
  for (const P0 of legs) {
    const P = (o.dead ? curl(P0) : P0).map(([x, y]) => [x + dx, y + dy]);
    brush(c, P, 0.75, C.ink, R, { bristles: 2, dry: 0.05, taper: 0.35 });
    brush(c, P, 0.38, col, R, { bristles: 1, dry: 0.1, taper: 0.35 });
    if (!far && o.dead !== 'burnt') for (const t of [0.35, 0.65]) dab(c, lerp(P[1][0], P[2][0], t), lerp(P[1][1], P[2][1], t), 0.36, Pl.band, R);   // white leg bands
  }
}
function mosLayer(c, o, L0) {
  const sz = L0.endsWith('M') ? 'M' : L0.endsWith('L') ? 'L' : '', L = sz ? L0.slice(0, -1) : L0, sc = MOS_SC[sz], F = MOS_F[sz];
  const R = o.R, M = smallM(o.M, 0.5), Pl = mosPal(o), burnt = o.dead === 'burnt';
  c.save(); c.scale(sc, sc);
  switch (L) {
    case 'r:wB': part(c, poly(shiftP(MOS_WING, -0.6, -0.5), R, 0.1), Pl.wingF, M, { lw: 0.65 }); break;
    case 'r:wF':
      part(c, poly(MOS_WING, R, 0.1), Pl.wing, M, { lw: 0.7 });
      if (!burnt) for (const dy of [-0.4, 0.4]) brush(c, [[0.6, -8.6 + dy], [-3.4, -9.2 + dy], [-7, -9.6 + dy]], 0.3, '#a7b4bf', R, { bristles: 1, dry: 0.3, taper: 0.4 });
      break;
    case 'r:lF': mosLegs(c, o, R, Pl, MOS_LEGS, true); break;
    case 'r:lN': mosLegs(c, o, R, Pl, MOS_LEGS, false); break;
    case 'r:lGF': mosLegs(c, o, R, Pl, MOS_GRIP, true); break;
    case 'r:lG': mosLegs(c, o, R, Pl, MOS_GRIP, false); break;
    case 'r:ab': {
      const fF = o.dead ? F * 0.4 : F;
      const pts = [[0.4, -7.2], [-3, -7.5 - fF * 1.8], [-6.4, -7.2 - fF * 1.6], [-9.2, -6.6 - fF * 0.6], [-9.9, -6.3], [-9.0, -5.8 + fF * 1.2], [-6.6, -5.6 + fF * 3.4], [-3, -5.0 + fF * 4.0], [0.2, -5.6 + fF * 1.2]];
      partIn(c, poly(pts, R, 0.12), fF > 0.3 ? Pl.red : Pl.grey, M, 0.72, () => {
        if (fF <= 0.3) brush(c, [[-0.2, -5.5], [-3.4, -5.6], [-6.6, -6.0], [-8.8, -6.2]], 1.6, Pl.red, R, { bristles: 2, dry: 0.1, taper: 0.4 });   // the red belly
        else if (!burnt) dab(c, -3.4, -6.4 - fF * 0.4, 0.6 + fF * 0.7, Pl.redL, R);   // a shine on the swollen belly
        if (!burnt) for (const x of [-2.2, -4.6, -7]) brush(c, [[x + 0.2, -7.4 - fF * 1.6], [x - 0.2, -6.4 - fF * 0.6]], 0.5, Pl.greyD, R, { bristles: 1, dry: 0.2 });
        if (o.risen) stitches(c, -6, -6.4, 3, 1.1, 0.4, R);
      });
      break;
    }
    case 'r:body': case 'r:bodyD': {
      const down = L === 'r:bodyD' && !o.dead;
      stripe(c, o, MOS_OWN, [[0.4, -9.0], [2.0, -9.6], [3.2, -9.0]], 1.6, R);
      partIn(c, ring(1.8, -7.4, 2.2, 1.9, R, 0.08, 8), Pl.grey, M, 0.75, () => {
        if (!burnt) brush(c, [[0.8, -8.6], [1.9, -9.0], [2.8, -8.6]], 0.45, Pl.band, R, { bristles: 1, dry: 0.2 });
        const tc = teamOf(o, MOS_OWN);
        if (tc) brush(c, [[0.2, -8.4], [1.8, -9.0], [3.4, -8.4]], 1.3, burnt ? C.charL : tc, R, { bristles: 3, dry: 0.1, taper: 0.1 });
      });
      // the head on its neck (drinking: tipped down, the beak stuck in below), beak, antenna, eye
      c.save(); if (down) { c.translate(2.9, -7.0); c.rotate(0.75); c.translate(-2.9, 7.0); }
      brush(c, [[5.0, -6.8], [8.0, -5.9], [10.6, -4.8]], 0.8, C.ink, R, { bristles: 2, dry: 0, taper: 0.5 });
      brush(c, [[4.4, -8.0], [5.2, -9.4], [5.9, -10.0]], 0.45, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
      for (let i = 0; i < 3; i++) brush(c, [[4.6 + i * 0.4, -8.4 - i * 0.5], [5.4 + i * 0.4, -8.2 - i * 0.6]], 0.3, C.ink, R, { bristles: 1, dry: 0, taper: 0 });   // feathery
      part(c, ring(4.0, -7.0, 1.4, 1.3, R, 0.08, 7), Pl.head, M, { lw: 0.7 });
      eye(c, o, 4.3, -7.3, 0.95, R, 0, C.white);
      c.restore();
      break;
    }
  }
  c.restore();
}
// poses by size: ['fly0', 'fly0M', 'fly0L'] ... (interned once: no strings built per frame)
const MOS_P = {}; for (const b of ['fly0', 'fly1', 'drink', 'stand']) MOS_P[b] = [b, b + 'M', b + 'L'];
const MOS_POSES = []; for (const s of ['', 'M', 'L']) for (const b of ['fly0', 'fly1', 'drink', 'stand']) MOS_POSES.push(b + s);
const MOS_POSER = {}; for (const p of MOS_POSES) MOS_POSER[p] = MOS_R * MOS_SC[p.endsWith('M') ? 'M' : p.endsWith('L') ? 'L' : ''];
const MOS_PARTS = []; for (const s of ['', 'M', 'L']) for (const b of ['r:wB', 'r:wF', 'r:lF', 'r:lN', 'r:lGF', 'r:lG', 'r:ab', 'r:body', 'r:bodyD']) MOS_PARTS.push(b + s);
const MOSQUITO = {
  layer: mosLayer, rest: 'fly0', scOf: (pose) => MOS_SC[pose.endsWith('M') ? 'M' : pose.endsWith('L') ? 'L' : ''],
  rig: {
    driver: 'bug', q: 'mosquito',
    joints: { pivot: [1.2, -6.6], deadH: 9.8, dpitch: 0, fly: true,
      nodes: [['wB', 'wingF', -1, 1.4, -8.4], ['lF', 'leg', -1, 1.2, -5.8, H, 0.4], ['ab', 'ab', -1, 0.4, -6.4], ['body', 'body', -1, 0, 0], ['lN', 'leg', -1, 1.4, -5.8, 0, 0.4], ['wF', 'wingN', -1, 1.4, -8.4]],
      dead: [-0.55, 0.15, 0.1, 0, -0.15, 0.2] },
    parts(pose) {
      const sz = pose.endsWith('M') ? 'M' : pose.endsWith('L') ? 'L' : '', b = sz ? pose.slice(0, -1) : pose;
      const p = { n0: 'r:wB' + sz, n1: 'r:lF' + sz, n2: 'r:ab' + sz, n3: 'r:body' + sz, n4: 'r:lN' + sz, n5: 'r:wF' + sz, sc: MOS_SC[sz], gait: 3, flap: 1, A: [0.95, 0, 0, 0, 0, 0.95] };
      if (b === 'fly0') p.wf = 3; else if (b === 'fly1') p.wf = 4;
      else if (b === 'drink') { p.n1 = 'r:lGF' + sz; p.n4 = 'r:lG' + sz; p.n3 = 'r:bodyD' + sz; p.gait = 0; p.flap = 0; p.pitch = 0.1; p.lift = 0.4 * MOS_SC[sz]; p.A = [0.12, 0, -0.1, 0, 0, 0.08]; p.kb = 25; }
      else if (b === 'stand') { p.gait = 0; p.flap = 0; p.A = [0, 0, 0, 0, 0, 0]; }
      return bp(6, pose, p);
    },
  },
};

// ================================================================ BEEHIVE (r 9.9): a honey-gold hive of stacked rings, a twig on top
const HIVE_OWN = '#e8a628';
const HIVE_RINGS = [[-3.4, 9.2], [-8.4, 9.8], [-13.2, 9.0], [-17.6, 7.2], [-21.4, 4.8], [-24.4, 2.4]];   // [centre y, half width]
function hivePal(o) {
  return { gold: pc(o, HIVE_OWN, '#c9b866'), goldD: pc(o, '#b8721a', C.zskinD, C.charL), goldL: pc(o, '#ffd36a', tone(C.zskin, 0.4), C.charL), hole: pc(o, '#3a2412', '#2a2a1a', C.ink),
    honey: pc(o, '#f59a12', '#b8a050', C.charL), twig: pc(o, '#7a4a22', '#6a6a4a', C.char), leaf: pc(o, C.leafL, C.zskinD, C.charL), comb: pc(o, '#ffe08a', '#d8d6a0', C.charL) };
}
function hiveOutline(R, top = 5) {   // the silhouette: a bump per ring (right side up, then the left side down)
  const rs = HIVE_RINGS.slice(0, top + 1), Rt = [], Lt = [];
  rs.forEach(([y, w], i) => {
    const yb = i === 0 ? -0.6 : (rs[i - 1][0] + y) / 2, wb = i === 0 ? w * 0.9 : Math.min(w, rs[i - 1][1]) * 0.93;
    Rt.push([wb, yb], [w, y]); Lt.push([-wb, yb], [-w, y]);
  });
  const ty = rs[rs.length - 1][0] - 2.2;
  return poly(Rt.concat([[0, ty]], Lt.reverse()), R, 0.25);
}
function bee1(c, R, x, y, s) {   // a tiny bee peeking out (buzz)
  dab(c, x - 0.6 * s, y - 1.6 * s, 1.0 * s, '#eef8ff', R); dab(c, x + 0.4 * s, y - 1.8 * s, 0.9 * s, '#dfeefa', R);
  part(c, ring(x, y, 1.6 * s, 1.25 * s, R, 0.08, 7), BEE_OWN, { R, mx: 0.2, my: 0.2, grow: 0.1, lw: 0.6 }, { lw: 0.6 });
  brush(c, [[x - 0.3 * s, y - 1.1 * s], [x - 0.4 * s, y + 1.1 * s]], 0.65 * s, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, x + 1.1 * s, y - 0.2 * s, 0.45 * s, C.ink, R);
}
function hivePaint(c, o) {
  const R = o.R, M = o.M, Pl = hivePal(o), burnt = o.dead === 'burnt', buzz = o.pose === 'buzz' && !o.dead;
  if (o.dead) {   // broken open: the bottom rings with a jagged top, honeycomb inside, a honey puddle, the top rolled off beside it
    fill(c, ring(2, 0.4, 13, 3.4, R, 0.15, 11), Pl.honey, R, { vary: 0.06 });
    if (!burnt) dab(c, -2, -0.2, 1.4, Pl.goldL, R);
    const base = [[-9.6, -0.6], [-10.2, -3.4], [-9.8, -7.4], [-7, -9.6], [-4.6, -6.8], [-2, -10.4], [0.6, -7], [3.6, -10], [6.2, -7.2], [9.4, -8.6], [10.2, -4], [9.6, -0.6]];
    partIn(c, poly(base, R, 0.25), Pl.gold, M, 1.6, () => {
      fill(c, poly([[-7, -7], [-4.6, -5], [-2, -7.6], [0.6, -5], [3.6, -7.4], [6.2, -5], [8, -6], [7, -3], [-6.6, -3]], R, 0.2), Pl.comb, R, { edge: 0 });
      if (!burnt) for (let i = 0; i < 6; i++) { const x = -5.4 + i * 2.2, y = -4.8 - (i & 1) * 0.8; brush(c, [[x - 0.8, y], [x - 0.4, y - 0.7], [x + 0.4, y - 0.7], [x + 0.8, y], [x + 0.4, y + 0.7], [x - 0.4, y + 0.7], [x - 0.8, y]], 0.35, Pl.goldD, R, { bristles: 1, dry: 0, taper: 0 }); }
      brush(c, [[-9.4, -2.4], [0, -1.8], [9.4, -2.4]], 0.9, C.ink, R, { bristles: 2, dry: 0.1 });
    });
    part(c, poly([[10.4, -1], [11.6, -5.6], [15.4, -6.6], [17.6, -3.2], [16.2, -0.6]], R, 0.2), Pl.gold, M, { lw: 1.3 });   // the top piece, rolled off
    brush(c, [[12.2, -4.4], [16.4, -3.8]], 0.7, C.ink, R, { bristles: 2, dry: 0.1 });
    if (burnt) scorch(c, [[-3, -5, 2], [4, -4, 1.6]], R);
    return;
  }
  // the twig it hung from + a leaf
  tube(c, [[0.4, -25.4], [1.0, -28.4]], 1.2, Pl.twig, R, 0.6);
  tube(c, [[-4.6, -28.0], [1.0, -28.6], [6.4, -29.6]], 1.3, Pl.twig, R, 0.6);
  part(c, poly([[5.4, -29.4], [7.6, -32.4], [10.6, -32.2], [8.4, -29.2]], R, 0.15), Pl.leaf, M, { lw: 0.9 });
  const sil = hiveOutline(R);
  partIn(c, sil, Pl.gold, M, 1.75, () => {
    brush(c, [[-8.6, -2.4], [-9.6, -9], [-7.8, -16.8], [-4.4, -22.4]], 2.4, Pl.goldD, R, { taper: 0.4, dry: 0.35, bristles: 4 });   // shade down its left
    if (!burnt) brush(c, [[5.6, -6.6], [6.8, -11.4], [5.4, -16.2]], 1.6, Pl.goldL, R, { taper: 0.5, dry: 0.4, bristles: 3 });
    // the rings: a sagging ink line between each, a light band over it
    for (let i = 1; i < HIVE_RINGS.length - 1; i++) {
      const y = (HIVE_RINGS[i - 1][0] + HIVE_RINGS[i][0]) / 2, w = Math.min(HIVE_RINGS[i - 1][1], HIVE_RINGS[i][1]) * 0.92;
      if (!burnt) brush(c, [[-w * 0.8, y - 1.0], [0, y + 0.1], [w * 0.8, y - 1.0]], 0.9, Pl.goldL, R, { bristles: 2, dry: 0.4, taper: 0.3 });
      brush(c, [[-w, y], [0, y + 1.3], [w, y]], 1.0, C.ink, R, { bristles: 2, dry: 0.15, taper: 0.2 });
    }
    // the team band round the middle ring
    const tc = teamOf(o, HIVE_OWN);
    if (tc) { const y = HIVE_RINGS[2][0], w = HIVE_RINGS[2][1] * 0.95; brush(c, [[-w, y - 0.4], [0, y + 0.9], [w, y - 0.4]], 2.4, burnt ? C.charL : tc, R, { bristles: 4, dry: 0.1, taper: 0.1 }); }
    if (o.risen) stitches(c, -4, -11, 4, 2, 0.8, R);
    if (burnt) scorch(c, [[-3, -12, 2.4], [3, -6, 2], [-1, -19, 1.6]], R);
  });
  // the door: a dark hole at the bottom front with a little ledge
  part(c, ring(2.6, -3.4, 2.7, 1.9, R, 0.1, 8), Pl.hole, M, { lw: 1.1 });
  brush(c, [[-0.6, -1.2], [2.6, -0.8], [5.8, -1.2]], 1.1, Pl.goldD, R, { bristles: 2, dry: 0.2 });
  // honey drips off the rings
  if (!burnt) for (const [x, y, l] of [[-5.6, -10.4, 3.4], [6.4, -15, 2.6], [-2.4, -19.4, 2]]) {
    brush(c, [[x, y], [x + 0.1, y + l]], 1.1, Pl.honey, R, { bristles: 2, dry: 0, taper: -0.3 });
    dab(c, x + 0.1, y + l + 0.5, 0.95, Pl.honey, R); dab(c, x - 0.2, y + l + 0.2, 0.3, C.white, R);
  }
  if (buzz) {   // bees pouring out of the door, shake lines either side
    bee1(c, R, 3.4, -3.6, 0.9); bee1(c, R, 7.6, -6.4, 0.85); bee1(c, R, 5.4, -9.6, 0.7);
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const x = s * (12 + i * 2.4), y = -12 - i * 3; brush(c, [[x, y - 3], [x + s * 1.2, y], [x, y + 3]], 0.9, C.ink, R, { bristles: 2, dry: 0.3, taper: 0.4 }); }
  }
}

// ================================================================ projectiles + effects
const SILK = '#fbfbf4', SILK_D = '#aeb8c4';
function silk(c, P, w, R) { brush(c, P, w * 1.9, SILK_D, R, { bristles: 2, dry: 0.15, taper: 0.3 }); brush(c, P, w, SILK, R, { bristles: 2, dry: 0.1, taper: 0.3 }); }
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** fade from the sim's life fields when it keeps them (p.life left of p.maxLife), else from p.age over a nominal span. */
function fadeOf(p, tin, tout, span) {
  let age = p.age, left;
  if (p.maxLife > 0 && p.life !== undefined) { left = p.life; if (!(age >= 0)) age = p.maxLife - p.life; }
  else left = (span || 0) - (age || 0);
  const a = tin > 0 && age >= 0 ? clamp01(age / tin) : 1, b = tout > 0 && left === left ? clamp01(left / tout) : 1;
  return a * b;
}
export const PROJ = {
  // the web shot: a sticky silk ball with threads trailing behind it, faces its flight
  web: {
    box: [22, 14, 13, 7], n: 3, boil: true, lift: 0, shadow: 0.22,   // the sim flies it at p.z 7
    paint(c, R) {
      for (const dy of [-1.4, 0, 1.4]) silk(c, [[-1.4, dy * 0.4], [-6, dy * 0.8 + (R() - 0.5)], [-11.4, dy * 1.4 + (R() - 0.5)]], 0.45, R);
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + R() * 0.3; silk(c, [[0, 0], [Math.cos(a) * 3.6, Math.sin(a) * 3.2]], 0.45, R); }
      dab(c, 0, 0, 2.1, SILK, R); outline(c, ring(0, 0, 2.2, 2.0, R, 0.12, 7), R, 0.6, { col: '#7d8794' });
      brush(c, [[-0.9, -0.6], [0.6, -1.2]], 0.5, '#d9e4ee', R, { bristles: 1, dry: 0 });
    },
  },
  // silk wrapped round a webbed unit's legs + lower body, threads anchoring it to the ground (painted for r 9, scaled by p.r)
  webon: {
    box: [34, 28, 17, 22], n: 3, boil: true,
    paint(c, R) {
      for (const [x0, x1] of [[-5, -12], [5, 12], [-2.4, -6.4], [2.6, 7.2]]) silk(c, [[x0, -2.4], [lerp(x0, x1, 0.55), -0.4], [x1, 1.8 + R()]], 0.45, R);
      for (let i = 0; i < 7; i++) { const y0 = -1.2 - i * 2.2 - R(), y1 = y0 - 1.8 - R() * 1.6, s = i & 1 ? 1 : -1;
        silk(c, [[-6.2 * s, y0], [0, (y0 + y1) / 2 + 1.2], [6.2 * s, y1]], 0.55, R); }
      for (let i = 0; i < 6; i++) dab(c, (R() - 0.5) * 11, -1 - R() * 14, 0.45 + R() * 0.3, SILK, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const k = Math.max(0.45, Math.min(3, (p.r || 9.5) / 9.5)), z = p.z > 0 ? p.z : 0, al = fadeOf(p, 0.12, 0.4, 0), ctx = api.ctx;
      const spr = api.bit(api.sprite, (rt * 8 + i) % 3 | 0);
      if (!spr || al <= 0.01) return true;
      if (al < 1) ctx.globalAlpha = al;
      api.put(spr, x, y - z, k, 0);
      if (al < 1) ctx.globalAlpha = 1;
      return true;
    },
  },
  // a web stuck to the floor (drawn under the units): spokes + a spiral, seen at a slant (painted for r 20, scaled by p.r)
  webpatch: {
    box: [48, 26, 24, 13], n: 2, ground: true,
    paint(c, R) {
      const N = 9, sp = []; for (let i = 0; i < N; i++) sp.push(i / N * TAU + (R() - 0.5) * 0.25);
      for (const a of sp) silk(c, [[0, 0], [Math.cos(a) * 21, Math.sin(a) * 9.6]], 0.5, R);
      for (const k of [0.3, 0.55, 0.8]) { const P = []; for (let i = 0; i <= N; i++) { const a = sp[i % N], kk = k * (0.94 + R() * 0.1); P.push([Math.cos(a) * 20 * kk, Math.sin(a) * 9 * kk]); }
        silk(c, P, 0.42, R); }
      for (let i = 0; i < 5; i++) { const a = R() * TAU, d = 4 + R() * 14; dab(c, Math.cos(a) * d, Math.sin(a) * d * 0.45, 0.5, '#e8f2fa', R); }
    },
    draw(p, x, y, ang, rt, i, api) {
      const k = Math.max(0.3, (p.r || 20) / 20), al = fadeOf(p, 0.15, 0.6, 0), ctx = api.ctx;
      const spr = api.bit(api.sprite, i & 1);
      if (!spr || al <= 0.01) return true;
      if (al < 1) ctx.globalAlpha = al;
      api.put(spr, x, y, k, 0);
      if (al < 1) ctx.globalAlpha = 1;
      return true;
    },
  },
  // the stink cloud: v 0..2 = a green puff, v 3..5 = rising stink lines; drawn as drifting puffs round the cloud + lines
  gas: {
    box: [44, 32, 22, 18], n: 6,
    paint(c, R, v, M) {
      if (v < 3) {   // a lumpy cumulus puff: dark-green bumps under, pale bumps over (only the outer edge stays dark), swirls
        const B = []; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + R() * 0.4; B.push([Math.cos(a) * (9 + R() * 3), Math.sin(a) * (4.6 + R() * 2) - 1, 5.2 + R() * 2.6]); }
        B.push([0, -1, 8.5]);
        for (const [x, y, r] of B) dab(c, x, y, r + 1.1, '#5f8f2a', R, 0.12);
        for (const [x, y, r] of B) dab(c, x + M.mx * 0.6, y + M.my * 0.6, r, '#bde07a', R, 0.12);
        for (let i = 0; i < 2; i++) { const a = R() * TAU, r = 3.5 + R() * 3, x0 = (R() - 0.5) * 10, P = []; for (let k = 0; k <= 7; k++) { const t = a + k * 0.8; P.push([x0 + Math.cos(t) * r * (1 - k * 0.09), Math.sin(t) * r * 0.62 * (1 - k * 0.09)]); }
          brush(c, P, 1.1, '#88ba45', R, { bristles: 2, dry: 0.35, taper: 0.5 }); }
        dab(c, -5, -5, 2.4, '#e2f4b4', R);
        return;
      }
      for (const x0 of [-5, 0, 5]) { const P = []; for (let k = 0; k <= 6; k++) { const t = k / 6; P.push([x0 + Math.sin(t * 8 + x0) * 1.6, 8 - t * 22]); }
        brush(c, P, 1.8, '#4f8c1e', R, { bristles: 2, dry: 0.15, taper: 0.4 }); brush(c, P, 1.0, '#a8e05a', R, { bristles: 2, dry: 0.2, taper: 0.4 }); }
    },
    draw(p, x, y, ang, rt, i, api) {
      const r = p.r || 80, age = p.age >= 0 ? p.age : 0, ctx = api.ctx, h = api.sprite;
      const fin = clamp01(age / 0.5), al = fadeOf(p, 0.5, 1, 5);
      if (al <= 0.01) return true;
      const grow = 0.55 + 0.45 * fin, k = r / 52 * grow, seed = (i * 1.7) % TAU, bv = (rt * 3 + i) % 3 | 0;
      ctx.globalAlpha = 0.46 * al;
      for (let j = 0; j < 8; j++) {
        const a = seed + j * (TAU / 7) + rt * 0.13, d = j === 7 ? 0 : r * 0.55 * grow, s = k * (0.85 + 0.18 * Math.sin(rt * 1.3 + j * 2.1));
        api.put(api.bit(h, (j + bv) % 3), x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55 - 9, s, Math.sin(rt * 0.4 + j) * 0.15);
      }
      for (let q = 0; q < 3; q++) {   // stink lines drifting up out of it and fading
        const f = (rt * 0.45 + q / 3 + i * 0.13) % 1, a = seed + q * 2.1;
        ctx.globalAlpha = 0.85 * al * Math.sin(f * Math.PI);
        api.put(api.bit(h, 3 + ((q + bv) % 3)), x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.16 - 16 - f * 26, Math.max(0.6, k * 0.8), 0);
      }
      ctx.globalAlpha = 1;
      return true;
    },
  },
};

// ================================================================ the registry
const ent = (T, e) => Object.assign({ scale: 1, lie: 'none', paint(c, o) { paintBug(c, o, T); }, rig: T.rig }, e);
const LEGS3 = ['r:lF', 'r:lN0', 'r:lN1', 'r:lN2'];
const sizeOf = (u) => { const f = (u.radius || MOS_R) / (MOS_R * (u.shrink > 0 ? u.shrink : 1)); return f >= 2 ? 2 : f >= 1.45 ? 1 : 0; };
export const SPRITES = {
  // BEE: floppy ('bug', 3 parts): wings buzz (fast flutter + squash, the far wing a beat behind), the body hover-bobs and tips
  // into the sting (abdomen curled under). Dead = on its back, wings splayed. Webbed / landed (z < 3) = 'stand'.
  bee: ent(BEE, {
    box: [20, 18, 10, 15], own: BEE_OWN, flying: true, poses: ['fly0', 'fly1', 'sting'], extra: ['stand', 'r:wB', 'r:body', 'r:bodyS', 'r:wF'],
    pick(u, info) {
      if (act(u) === 1 || u.attack > 0) return 'sting';
      if (!((u.z || 0) > 3)) return 'stand';
      return ((info.rt * 22 + (u.id % 7) * 0.43) | 0) & 1 ? 'fly1' : 'fly0';
    },
  }),
  // BEEHIVE: a placed home (static, like the anthill): one whole sprite, 'hive' driver: sways on a stiff spring, squashes
  // when hit, shudders while bees pour out ('buzz', b.act 1). noFlip (its door stays front-right).
  beehive: {
    box: [40, 40, 18, 34], scale: 1, own: HIVE_OWN, lie: 'none', noFlip: true, poses: ['idle'], extra: ['buzz'],
    paint: hivePaint,
    rig: { driver: 'hive', parts: (pose) => ({ main: pose, shake: pose === 'buzz' ? 1 : 0 }) },
    pick(u) { return act(u) === 1 ? 'buzz' : null; },
  },
  // SPIDER: floppy ('bug'): 8 high-kneed legs scuttle (the near ones in two alternating pairs, the far four rocking), the fat hairy
  // abdomen lags + bobs behind, rears up to shoot a web, lunges to bite. Dead = on its back, legs curled up, kicking at first.
  spider: ent(SPIDER, {
    box: [40, 30, 19, 24], own: SPI_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['shoot', 'r:lF', 'r:lFU', 'r:lNa', 'r:lNaU', 'r:lNb', 'r:lNbU', 'r:ab', 'r:body', 'r:bodyO'],
    pick(u) { if (act(u) === 1) return 'shoot'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // BEETLE: floppy ('bug'): stubby legs scuttle, the heavy shell rocks, the horned head nods + tosses up to flip (b.act 1).
  beetle: ent(BEETLE, {
    box: [42, 34, 16, 26], own: BTL_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['flip', ...LEGS3, 'r:body', 'r:head'],
    pick(u) { if (act(u) === 1) return 'flip'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // MANTIS: floppy ('bug', 7 parts; 8 while the far blade slashes): stands tall on 4 thin legs, the long abdomen lags behind, the head nods; the blades sit folded
  // (praying) and snap out on their own springs to slash (atk = near blade, atk1 = far blade, by b.arm), both out in the lunge.
  mantis: ent(MANTIS, {
    box: [44, 36, 20, 30], own: MAN_OWN, poses: ['pray', 'walk0', 'walk1', 'atk'], extra: ['atk1', 'lunge', 'r:lF', 'r:aFX', 'r:ab', 'r:body', 'r:bodyA', 'r:head', 'r:lN1', 'r:lN0', 'r:aN', 'r:aNX'],
    pick(u) { if (act(u) === 1) return 'lunge'; if (u.attack > 0) return u.b && u.b.arm ? 'atk1' : 'atk'; return null; },
  }),
  // BOMBARDIER: floppy ('bug'): scuttles; spraying it raises its rear (the abdomen spring kicks up), shudders, and the boiling
  // jet pulses out behind it (the sim turns its back to the target).
  bombardier: ent(BOMBARDIER, {
    box: [60, 36, 44, 24], own: BOM_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['spray', 'aim', 'r:lF', 'r:ab', 'r:spray', 'r:body', 'r:bodyO', 'r:lN0', 'r:lN1', 'r:lN2'],
    pick(u) { if (act(u) === 1) return u.subState === 1 ? 'aim' : 'spray'; if (u.attack > 0) return 'atk'; return null; },
  }),
  // MOSQUITO: floppy ('bug'): wings buzz, the long banded legs dangle and swing after it, the abdomen lags; drinking it grips
  // with its legs, head down, wings still. Grows with u.radius (3 painted sizes: see the header).
  mosquito: ent(MOSQUITO, {
    box: [62, 48, 30, 40], own: MOS_OWN, flying: true, poses: ['fly0', 'fly1'], extra: [...MOS_POSES.filter((p) => p !== 'fly0' && p !== 'fly1'), ...MOS_PARTS], poseR: MOS_POSER,
    pick(u, info) {
      const s = sizeOf(u);
      if (act(u) === 1 || u.attack > 0) return MOS_P.drink[s];
      if (!((u.z || 0) > 3)) return MOS_P.stand[s];
      return MOS_P[((info.rt * 24 + (u.id % 5) * 0.37) | 0) & 1 ? 'fly1' : 'fly0'][s];
    },
  }),
  // STINKBUG: floppy ('bug'): scuttles; puffing (b.act 1) it rears up, shudders, and green stink lines pulse out of its back.
  stinkbug: ent(STINKBUG, {
    box: [34, 36, 16, 30], own: STK_OWN, poses: ['idle', 'walk0', 'walk1', 'atk'], extra: ['puff', ...LEGS3, 'r:body', 'r:stink'],
    pick(u) { if (act(u) === 1) return 'puff'; if (u.attack > 0) return 'atk'; return null; },
  }),
};
