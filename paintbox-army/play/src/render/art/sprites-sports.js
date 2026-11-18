// SPORTS tab sprites (OURS, Part 2 step 6, STEP6.md: no OG source). Owner: SPORTS-ART. Contract: ART.md + RIG.md + STEP4/6.
// POSTER PAINT: a 7-year-old's tempera painting of sports players. People are kid-a people (people.js human(), kind 'sport'
// = a plain person with no kit of its own) in a JERSEY of the team colour with a big painted number, plus helmets, caps,
// hair and gear painted here: a wooden bat, a baseball + a brown mitt, a purple bowling ball, a hockey stick + skates, gold
// boxing gloves, pom-poms. The sumo is his own big body (skin, a mawashi belt in the team colour, a topknot).
// Every entry paints ONE frame facing RIGHT, feet (ground middle) at (0,0), up = -y.
//
// Colours. FFA (o.col = own): the tab is orange + white. Jersey orange with white numbers / stripes (tackler, bowler,
// hockey, sumo's mawashi, boxer, cheerleader); the two baseball players wear white with orange numbers, pinstripes, caps
// and helmets. Team battle (o.col = C.red / C.blue): the jersey (the mawashi) is the team colour, trim white, helmets /
// caps in the team colour (hockey helmet stays white with a team band). Gear keeps its own colours (no team on it).
// No real teams, logos or brands: plain numbers only.
//
// Pose picking (pick(u, info), RENDER index.js pickPose; first match wins after RENDER's dead):
//   'fly'  u.z > 1 (tossed: home run victims, uppercuts, blasts)
//   then the b.act codes of STEP6.md:
//     tackler  1 'sprint' (leaning in, arms pumping), 2 'tackle' (diving flat on the grass, arms out); atk = 'atk' punch
//     batter   1 'wind' (bat cocked back), 2 'swing' (bat swept through, swoosh); atk = 'swing'
//     pitcher  1 'wind' (leg kick, ball back, mitt at the target), 2 'throw' (follow-through); atk = 'throw'
//     bowler   1 'aim' (ball at the chin), 2 'bowl' (deep lunge, arm low, released); atk = 'atk' (ball bonk);
//              walking = 'walk0'/'walk1' with the ball carried low in one hand (it swings, heavy)
//     hockey   1 'wind' (stick up behind), 2 'slap' (stick through low); atk = 'atk' (stick at chest height);
//              moving on ice (world.iceAt under it) = 'skate0'/'skate1' (leaning, gliding)
//     sumo     1 'shove' (both palms out), 2 'stomp' (near leg high; the rig slams it down); atk = 'shove'
//     boxer    1 'jab0' / 'jab1' by b.arm (0 near, 1 far glove), 2 'upper', 3 'dodge'; atk = 'jab0'/'jab1' by b.arm
//     cheerleader 1 'cheer' (jumping, poms up, shouting); atk = 'atk' (pom slap)
//   else null: RENDER's walk0 / walk1 while moving, else 'idle'.
//
// Floppy bodies (RIG.md, driver 'sport' in rig-sports.js): parts 'r:leg' (or 'r:skate' with a skate, 'r:sleg' the sumo's
// fat leg, painted bent legs 'r:lunge0/1', 'r:slunge0/1', 'r:knee', 'r:tuck0/1'), 'r:body', 'r:head' / 'r:headO' (mouth
// open), 'r:tail' (cheerleader ponytail, sumo topknot), 'r:armN:<key>' (near arm + its gear) and 'r:armF:<key>' (far arm
// + its gear; none for two-handed gear: bat, stick, bowling ball held in both hands). Whole poses are built from the same
// part painters at the same rest transforms (POSE table below), so whole and rigged always agree.
//
// PROJ (fx.js default case): 'baseball' (white ball, red stitches spinning, speed streak), 'bowlball' (purple ball rolling
// along the ground, turned by the ground it covers, dust streak behind), 'puck' (flat black disc sliding, streak behind).
import { C, tone, brush, ring, poly, fill, outline, part, dab, tube, spline, path } from './paint.js';
import { human, humanLeg, hair, face } from './people.js';
import { POSE_CODE } from './rig-sports.js';

// ---------------------------------------------------------------- our colours
const ORANGE = '#f26a1b', WHITE = C.white, HAIR = '#3b2618', BLOND = '#f6c636', WOOD = '#e6b06a', WOODD = '#9c6a35';
const MITT = '#a5602a', MITTD = '#6b3a17', STITCH = '#d8281c', BOWL = '#5b2f93', BOWLL = '#9a72d6', STICK = '#cf9152';
const TAPE = '#26222e', GOLD = '#ffc21a', GOLDD = '#d4920a', SKATE = '#2e2a33', CAGE = '#7c8088', SWOOSH = '#e9eef2';
const KIND = 'sport';   // human() kind with no kit: body, head, face (hair when hatless); everything else is ours
const isPart = (p) => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:'

/** Paint look for one frame: burnt = all charcoal; trim = numbers / stripes (orange on a white jersey, else white). */
function look(o, D) {
  const burnt = o.dead === 'burnt', white = o.col === WHITE;
  return {
    o, D, R: o.R, M: o.M, burnt, risen: !!o.risen, dead: o.dead, hatless: !!o.hatless,
    skin: burnt ? C.charL : o.risen ? C.zskin : C.skin,
    jer: burnt ? C.char : o.col,
    trim: burnt ? C.charL : white ? ORANGE : WHITE,
    hel: burnt ? C.char : white ? ORANGE : o.col,
    cl: (x) => (burnt ? C.char : x),     // big areas
    acc: (x) => (burnt ? C.charL : x),   // small accents
  };
}

// ---------------------------------------------------------------- small painted bits
const ARMB = { bristles: 2, taper: 0.2, dry: 0.1 };
const arm = (c, L, pts, w = 1.3) => brush(c, pts, w, C.ink, L.R, ARMB);
const hand = (c, L, x, y, r = 1.05) => dab(c, x, y, r, L.skin, L.R);
const fist = (c, L, x, y) => dab(c, x, y, 1.3, L.skin, L.R);
/** An arm ending in a hand / fist / nothing (gear paints the hand). */
function limb(c, L, pts, end = 'hand') {
  arm(c, L, pts);
  const [x, y] = pts[pts.length - 1];
  if (end === 'hand') hand(c, L, x, y); else if (end === 'fist') fist(c, L, x, y);
}
function swoosh(c, L, pts, w = 1.1) {
  if (L.burnt) return;
  brush(c, pts, w * 1.25, SWOOSH, L.R, { bristles: 3, taper: 0.95, dry: 0.6, vary: 0.04 });
  brush(c, pts.map(([x, y]) => [x - 0.8, y + 2.2]), w * 0.6, C.greyL, L.R, { bristles: 2, taper: 0.95, dry: 0.6 });
}
function lines(c, L, x, y, n = 2, len = 3, gap = 2) { for (let i = 0; i < n; i++) brush(c, [[x, y + i * gap], [x + len, y + i * gap]], 0.5, C.ink, L.R, { bristles: 1, dry: 0.4, taper: 0.6 }); }
/** Painted jersey numbers: kid digits brushed on a 0..1 box (spline-smoothed, so corners come out round). */
const DIG = {
  0: [[0.1, 0.05], [0.95, 0], [1, 1], [0, 0.96], [0.08, 0.1]], 1: [[0.2, 0.22], [0.6, 0], [0.62, 1]],
  2: [[0, 0.18], [0.5, 0], [1, 0.22], [0.85, 0.5], [0, 1], [1, 0.98]], 3: [[0, 0.04], [0.95, 0.08], [0.35, 0.48], [1, 0.72], [0.55, 1], [0, 0.92]],
  4: [[0.82, 1], [0.78, 0], [0, 0.66], [1, 0.66]], 5: [[1, 0], [0.05, 0.02], [0, 0.45], [0.9, 0.5], [0.95, 0.92], [0, 1]],
  6: [[0.95, 0.02], [0.1, 0.4], [0, 0.95], [0.95, 1], [1, 0.58], [0.05, 0.56]], 7: [[0, 0.02], [1, 0], [0.32, 1]],
  8: [[0.5, 0.5], [0, 0.24], [0.5, 0], [1, 0.24], [0.5, 0.5], [0, 0.78], [0.5, 1], [1, 0.76], [0.52, 0.48]], 9: [[1, 0.42], [0, 0.4], [0.02, 0], [1, 0.02], [0.98, 1], [0.05, 1]],
};
function number(c, L, str, cx, cy, h = 3.6) {
  if (L.burnt) return;
  const w = h * 0.58, gap = h * 0.26, n = str.length, x0 = cx - (n * w + (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) brush(c, DIG[str[i]].map(([x, y]) => [x0 + i * (w + gap) + x * w, cy - h / 2 + y * h]), 0.9, L.trim, L.R, { bristles: 2, dry: 0.05, taper: 0, per: 4, vary: 0.04 });
}
/** Clip to (inside) the human() body ring, for stripes painted on the jersey. */
const bodyClip = (c, L, rx = 4.7, ry = 5.7) => { path(c, spline(ring(L.M.mx * 0.6, -12.8 + L.M.my * 0.6, rx, ry, L.R, 0.04, 9), true, 5)); c.clip(); };
function jersey(c, L) { human(c, KIND, L.o.col, 'aim', L.M, L.dead, L.skin, { layer: 'body', risen: L.o.risen }); }
function belt(c, L, y = -9.6) {
  c.save(); bodyClip(c, L, 5.1, 6.1);
  brush(c, [[-6, y - 0.2], [0, y + 0.4], [6, y - 0.2]], 1.15, C.ink, L.R, { bristles: 2, dry: 0.1, taper: 0 });
  c.restore();
  if (!L.burnt) dab(c, 3.4, y + 0.1, 0.7, '#d9d4c4', L.R);
}

// ---------------------------------------------------------------- gear
/** Baseball bat: knob at the hands end h, barrel fattening to the tip t; grip tape by the hands. */
function bat(c, L, h, t) {
  const R = L.R, dx = t[0] - h[0], dy = t[1] - h[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const k0 = [h[0] - ux * 1.6, h[1] - uy * 1.6];
  brush(c, [k0, t], 1.9, C.ink, R, { bristles: 3, taper: -0.95, dry: 0, vary: 0.04, swell: 0 });
  brush(c, [[k0[0] + ux * 0.4, k0[1] + uy * 0.4], [t[0] - ux * 0.5, t[1] - uy * 0.5]], 0.85, L.acc(WOOD), R, { bristles: 3, taper: -1.05, dry: 0.1, swell: 0 });
  if (!L.burnt) brush(c, [[h[0] + ux * 5, h[1] + uy * 5 - 0.3], [t[0] - ux * 2, t[1] - uy * 2 - 0.3]], 0.35, '#fbe3b8', R, { bristles: 1, dry: 0.4, taper: 0.4 });
  brush(c, [[h[0] - ux * 0.8, h[1] - uy * 0.8], [h[0] + ux * 2.6, h[1] + uy * 2.6]], 1.25, TAPE, R, { bristles: 2, dry: 0, taper: 0 });
  dab(c, k0[0], k0[1], 1.05, C.ink, R);
}
/** A baseball: white with an ink edge and red stitches. */
function ball(c, L, x, y, r = 1.5) {
  const R = L.R;
  dab(c, x, y, r + 0.45, C.ink, R); dab(c, x, y, r, L.acc(WHITE), R);
  if (!L.burnt) for (const k of [-1, 1]) brush(c, [[x + k * r * 0.3, y - r * 0.75], [x + k * r * 0.72, y], [x + k * r * 0.3, y + r * 0.75]], 0.32, STITCH, R, { bristles: 1, dry: 0, taper: 0 });   // seams ( )
}
/** Pitcher's mitt: a big brown leather paw (round, a thumb, a laced web), facing ang. */
function mitt(c, L, x, y, ang = 0) {
  const R = L.R;
  c.save(); c.translate(x, y); c.rotate(ang);
  part(c, ring(0, 0, 2.7, 3, R, 0.12, 9), L.cl(MITT), L.M, { lw: 1.1 });
  part(c, ring(2.1, 1.4, 1.2, 1, R, 0.1, 7), L.cl(MITT), L.M, { lw: 0.9 });
  if (!L.burnt) for (let i = 0; i < 3; i++) brush(c, [[-1.6 + i * 1.1, -2.2], [-1.4 + i * 1.1, 1.4]], 0.32, MITTD, R, { bristles: 1, dry: 0.2, taper: 0.2 });
  c.restore();
}
/** Bowling ball: purple with a swirl, three finger holes and a white glint. */
function bowlBall(c, L, x, y, r = 3) {
  const R = L.R;
  part(c, ring(x, y, r, r, R, 0.05, 9), L.cl(BOWL), L.M, { lw: 1.25 });
  if (L.burnt) return;
  brush(c, [[x - r * 0.7, y + r * 0.3], [x - r * 0.1, y + r * 0.55], [x + r * 0.5, y + r * 0.2]], 0.5, BOWLL, R, { bristles: 2, dry: 0.4, taper: 0.4 });
  for (const [dx, dy] of [[0.05, -0.45], [0.42, -0.2], [0.42, -0.62]]) dab(c, x + dx * r, y + dy * r, r * 0.16, C.ink, R);
  dab(c, x - r * 0.45, y - r * 0.4, r * 0.18, '#fffdf2', R);
}
/** Hockey stick: shaft from the top end a to the heel b, the blade from the heel forward (dir +1 / -1), taped black. */
function stick(c, L, a, b, bx, by) {
  const R = L.R;
  tube(c, [a, b], 0.95, L.acc(STICK), R, 0.55);
  tube(c, [b, [b[0] + bx * 0.55 - by * 0.25, b[1] + by * 0.55 + bx * 0.25], [b[0] + bx, b[1] + by]], 1.2, L.burnt ? C.char : TAPE, R, 0.5);
  brush(c, [[a[0], a[1]], [a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12]], 1.35, TAPE, R, { bristles: 2, dry: 0, taper: 0 });
}
/** Boxing glove: a big gold mitten, white cuff behind it (toward the elbow at ex, ey), a thumb bump. */
function glove(c, L, x, y, ex, ey, r = 2.5) {
  const R = L.R, dx = x - ex, dy = y - ey, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  brush(c, [[x - ux * r * 1.5, y - uy * r * 1.5], [x - ux * r * 0.7, y - uy * r * 0.7]], 2.3, C.ink, R, { bristles: 3, dry: 0, taper: 0 });
  brush(c, [[x - ux * r * 1.45, y - uy * r * 1.45], [x - ux * r * 0.75, y - uy * r * 0.75]], 1.3, L.acc(WHITE), R, { bristles: 2, dry: 0, taper: 0 });
  part(c, ring(x, y, r, r * 0.92, R, 0.1, 9, Math.atan2(uy, ux)), L.cl(GOLD), L.M, { lw: 1.15 });
  dab(c, x - uy * r * 0.7 - ux * r * 0.1, y + ux * r * 0.7 - uy * r * 0.1, r * 0.42, L.cl(GOLDD), R);
  if (!L.burnt) dab(c, x + ux * r * 0.2 - uy * r * 0.35, y + uy * r * 0.2 + ux * r * 0.35 - r * 0.25, r * 0.22, '#fff3c4', R);
}
/** Pom-pom: a burst of short strokes in the jersey colour with white streamers. */
function pom(c, L, x, y, r = 3) {
  const R = L.R, n = 13, col = L.jer, wh = L.trim;
  dab(c, x, y, r * 0.75, C.ink, R);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.4, k = 0.85 + R() * 0.35;
    brush(c, [[x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2], [x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]], 0.95, i % 3 === 2 ? wh : col, R, { bristles: 2, dry: 0.3, taper: 0.7 });
  }
  brush(c, [[x - r * 0.3, y - r * 0.2], [x + r * 0.3, y + r * 0.1]], 0.6, wh, R, { bristles: 1, dry: 0.3, taper: 0.4 });
}

// ---------------------------------------------------------------- legs
const LEGB = { bristles: 3, taper: 0.25, dry: 0.15, swell: 0.1 };
const LUNGE = (d) => [[[-1.8, -8 + d], [-4.6, -3.6], [-7.6, -0.3], [-9.2, -0.1]], [[1.8, -8 + d], [6, -5.4], [6.6, -0.4], [8.6, -0.1]]];
const SLUNGE = (d) => [[[-3.6, -7.5 + d], [-7.2, -3.6], [-9.6, -0.8]], [[3.6, -7.5 + d], [7.8, -5.2], [8.8, -0.8]]];
const KNEE = [[1.8, -8], [6.4, -11], [4.6, -5.2], [6, -4.6]];
const TUCK = [[[-1.6, -8], [-1.4, -3.2], [-6, -4.6]], [[1.6, -8], [2.8, -3.2], [-2.2, -3.4]]];
function skateUnder(c, L, x, y) {
  const R = L.R;
  part(c, ring(x - 0.6, y - 0.9, 2.3, 1.35, R, 0.1, 8), L.cl(SKATE), L.M, { lw: 0.8 });
  tube(c, [[x - 2.8, y + 0.9], [x + 1.8, y + 0.9]], 0.45, L.acc(C.greyL), R, 0.45);
  brush(c, [[x + 1.8, y + 0.9], [x + 2.4, y + 0.2]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
}
function fatLeg(c, L, pts) {
  const R = L.R, f = pts[pts.length - 1];
  tube(c, pts, 3.4, L.skin, R, 1.1);
  part(c, ring(f[0] + 1.2, f[1] + 0.2, 2.4, 1.15, R, 0.1, 8), L.skin, L.M, { lw: 1 });
}
function paintLeg(c, L, D, name) {
  const R = L.R;
  if (name === 'r:leg' || name === 'r:skate') { humanLeg(c, KIND, L.M, L.burnt); if (name === 'r:skate') skateUnder(c, L, 2.4, 0.1); return; }
  if (name === 'r:sleg') { fatLeg(c, L, [[0, -7.5], [0.3, -3.6], [0.6, -1]]); return; }
  if (name === 'r:lunge0' || name === 'r:lunge1') { brush(c, LUNGE(D.crouch)[+name.slice(7)], 1.9, C.ink, R, LEGB); return; }
  if (name === 'r:slunge0' || name === 'r:slunge1') { fatLeg(c, L, SLUNGE(D.crouch)[+name.slice(8)]); return; }
  if (name === 'r:knee') { brush(c, KNEE, 1.9, C.ink, R, LEGB); return; }
  if (name === 'r:tuck0' || name === 'r:tuck1') brush(c, TUCK[+name.slice(6)], 1.9, C.ink, R, LEGB);
}

// ---------------------------------------------------------------- hats, hair, heads
function footballHelmet(c, L) {
  const R = L.R, h = L.hel;
  part(c, poly([[-6.4, -18.8], [-6.9, -24.4], [-4.6, -28.8], [0.4, -30.4], [5.2, -29.2], [7.4, -25.8], [6.9, -23.4], [3.2, -24.8], [-0.2, -24.4], [-1.4, -21.4], [-1.8, -18.6]], R, 0.22), h, L.M, { lw: 1.45 });
  brush(c, [[-6, -25.4], [-3.8, -29], [0.6, -30.4], [5.2, -28.8]], 1.3, L.trim, R, { bristles: 2, dry: 0.15, taper: 0.15 });
  dab(c, -3.6, -22.2, 0.75, C.ink, R);
  const g = L.acc(C.greyL);   // face mask: a bar down the front + two across
  tube(c, [[6.6, -24.2], [8.4, -21.6], [8.2, -18.2], [5.8, -17.2]], 0.42, g, R, 0.4);
  tube(c, [[3.4, -20.8], [8.4, -20.8]], 0.4, g, R, 0.38); tube(c, [[3.8, -18.4], [8.2, -18.8]], 0.4, g, R, 0.38);
}
function battingHelmet(c, L) {
  const R = L.R, h = L.hel;
  part(c, poly([[-5.9, -21.2], [-6.2, -25.6], [-3.8, -29.4], [1, -30.4], [5.4, -28.8], [6.9, -25.6], [10, -25.2], [10.2, -24.1], [6.4, -23.9], [1.6, -24.6], [-1, -23.6]], R, 0.2), h, L.M, { lw: 1.4 });
  part(c, ring(-2.4, -21.4, 2.6, 2.6, R, 0.08, 8), h, L.M, { lw: 1.1 });   // ear flap
  dab(c, -2.4, -21.4, 0.6, C.ink, R);
  if (!L.burnt) dab(c, -0.6, -28.2, 0.75, '#fffdf2', R);
}
function cap(c, L) {
  const R = L.R, h = L.hel;
  brush(c, [[-5.4, -23.4], [-6.2, -20.8]], 1.2, L.burnt ? C.ink : HAIR, R, { bristles: 2, dry: 0.2, taper: 0.5 });
  part(c, poly([[-5.6, -24.2], [-5.3, -27.6], [-2.4, -30], [2, -30.4], [5.2, -28.6], [6.3, -25]], R, 0.22), h, L.M, { lw: 1.35 });
  part(c, poly([[5, -25.6], [10.6, -25.1], [10.9, -23.9], [5.4, -23.7]], R, 0.15), tone(h, -0.12), L.M, { lw: 1.1, sharp: true });
  dab(c, -0.2, -30.4, 0.7, L.trim, R);
}
function hockeyHelmet(c, L) {
  const R = L.R, h = L.cl(WHITE);
  part(c, poly([[-5.7, -20.6], [-6.1, -25.6], [-3.6, -29.4], [1, -30.5], [5.5, -28.9], [6.9, -25.6], [6.4, -23.8], [1.8, -24.9], [-1.4, -24.4], [-2.2, -20.6]], R, 0.2), h, L.M, { lw: 1.4 });
  c.save(); path(c, spline(ring(L.M.mx * 0.5, -26.2 + L.M.my * 0.5, 6, 3.6, R, 0.03, 9), true, 5)); c.clip();
  brush(c, [[-6.4, -25.2], [0, -26.2], [6.6, -25.2]], 1.3, L.burnt ? C.charL : (L.o.col === WHITE ? ORANGE : L.o.col), R, { bristles: 2, dry: 0.1, taper: 0 });
  c.restore();
  const g = L.acc(CAGE), st = { bristles: 1, dry: 0, taper: 0 };   // wire cage over the face
  for (const x of [4.4, 6, 7.5]) brush(c, [[x - 0.3, -24.6], [x + 0.4, -21], [x - 0.2, -17.6]], 0.42, g, R, st);
  for (const y of [-22.6, -20.2, -17.9]) brush(c, [[3.2, y], [8, y + 0.2]], 0.42, g, R, st);
  brush(c, [[3, -24.6], [8, -23.8], [8.2, -18.6], [6, -17]], 0.55, C.ink, R, { bristles: 1, dry: 0.1, taper: 0 });
}
function headguard(c, L) {
  const R = L.R, h = L.hel;
  part(c, poly([[-5.6, -19.4], [-6.6, -24.6], [-4.4, -28.9], [0.6, -30.3], [5.2, -29], [7, -26.4], [6.2, -25.2], [2.4, -26.2], [-1.4, -25.8], [-3, -23.4], [-3.4, -19.6]], R, 0.22), h, L.M, { lw: 1.45 });
  brush(c, [[-5.6, -27], [0.6, -27.6], [6.4, -26.4]], 1.1, tone(h, -0.25), R, { bristles: 2, dry: 0.2, taper: 0.1 });
  if (!L.burnt) dab(c, -4.8, -22.6, 0.9, tone(h, 0.35), R);
}
function bowlerHair(c, L) {
  const R = L.R, h = L.burnt ? C.ink : HAIR;
  part(c, poly([[-5.8, -21.6], [-6, -26], [-3.6, -28.8], [0.6, -29.6], [4.8, -28.6], [6.6, -26], [4, -26.6], [0.6, -26.2], [-2.4, -24.6], [-3.6, -21.6]], R, 0.2), h, L.M, { lw: 1 });
  brush(c, [[1.6, -28.8], [4.6, -30.2], [6.8, -28.8]], 1.3, h, R, { bristles: 2, dry: 0.2, taper: 0.4 });   // the quiff
  if (!L.dead && !L.risen) brush(c, [[0.4, -19.7], [1.6, -20.3], [2.6, -19.9], [3.6, -20.3], [4.6, -19.6]], 0.75, h, R, { bristles: 2, dry: 0.1, taper: 0.2 });
}
function cheerHair(c, L) {
  const R = L.R, h = L.burnt ? C.charL : BLOND;
  part(c, poly([[-5.8, -20.8], [-6.1, -25.8], [-3.6, -29.2], [0.8, -29.8], [5, -28.6], [6.6, -25.6], [5.4, -25.4], [3.6, -26.8], [0.8, -25.4], [-2.6, -24.8], [-3.8, -20.6]], R, 0.2), h, L.M, { lw: 1.1 });
  brush(c, [[2.4, -28.4], [4.4, -26.6], [6.2, -25.8]], 1.1, h, R, { bristles: 2, dry: 0.15, taper: 0.4 });
  if (!L.burnt) dab(c, -0.4, -27.6, 0.7, '#fff1a8', R);
}
/** Ponytail from the back of the head (pivot (-5.2, -25.4)), a bow in the trim colour at its root. */
function ponytail(c, L) {
  const R = L.R;
  tube(c, [[-5, -25.6], [-8.2, -25.4], [-10.4, -22.6], [-10.8, -18.8]], 2.2, L.burnt ? C.charL : BLOND, R, 0.9);
  for (const k of [-1, 1]) part(c, poly([[-5.4, -25.6], [-6.8, -25.6 + k * 2.2], [-4.2, -25.6 + k * 2]], R, 0.1), L.burnt ? C.charL : L.jer, L.M, { lw: 0.8 });
  dab(c, -5.4, -25.6, 0.85, L.acc(L.trim), R);
}
function headLayer(c, L, D, open) {
  const hatted = !!D.hat, bald = hatted && !L.hatless;
  human(c, KIND, L.o.col, open ? 'fly' : 'aim', L.M, L.dead, L.skin, { layer: 'head', risen: L.o.risen, hatless: hatted && L.hatless });
  if (D.hair) D.hair(c, L);
  if (bald) D.hat(c, L);
}

// ---------------------------------------------------------------- the sumo (his own body)
// Rest layout (sprite px): hip (0, -7.5), legs at x +-3.6, belly centre (0.4, -14.6) 9.4 x 8.4, head (0.8, -27.6) r 5.4,
// shoulders near (5, -20.4) / far (-4, -19.6), topknot pivot (-0.4, -32.2).
function sumoBody(c, L) {
  const R = L.R, M = L.M, sk = L.skin, mw = L.jer;
  part(c, poly([[-6.4, -9], [6.6, -9.4], [3.6, -5.2], [0.4, -4.4], [-3.4, -5.2]], R, 0.2), mw, M, { lw: 1.3 });   // mawashi between the legs
  part(c, ring(0.4, -14.8, 9.4, 8.4, R, 0.06, 11), sk, M, { lw: 1.75 });
  c.save(); path(c, spline(ring(0.4 + M.mx * 0.6, -14.8 + M.my * 0.6, 8.9, 7.9, R, 0.03, 11), true, 5)); c.clip();
  brush(c, [[-10, -10.4], [0, -9.6], [10, -10.6]], 3.6, mw, R, { bristles: 4, dry: 0.08, taper: 0 });   // the belt
  brush(c, [[-10, -8.4], [0, -7.6], [10, -8.6]], 0.6, L.burnt ? C.ink : tone(mw, -0.3), R, { bristles: 1, dry: 0.3, taper: 0 });
  c.restore();
  outline(c, ring(0.4, -14.8, 9.4, 8.4, R, 0.06, 11), R, 0.6, { jit: 0.2 });
  dab(c, -8.8, -10.6, 2, mw, R); outline(c, ring(-8.8, -10.6, 2, 1.8, R, 0.1, 7), R, 0.7, { jit: 0.1 });   // the knot behind
  for (const x of [5.6, 7.2, 8.6]) brush(c, [[x, -8.6], [x + 0.3, -5.2]], 0.7, L.burnt ? C.charL : tone(mw, -0.15), R, { bristles: 2, dry: 0.2, taper: 0.3 });   // sagari
  if (!L.burnt) {
    brush(c, [[3.2, -19.6], [5.2, -18.6], [7.4, -19.4]], 0.5, tone(sk, -0.3), R, { bristles: 1, dry: 0.3, taper: 0.3 });
    dab(c, 8.2, -13.6, 0.55, tone(sk, -0.4), R);   // belly button
    dab(c, -3, -18.6, 1.6, tone(sk, 0.25), R);
  }
}
function sumoHead(c, L, open) {
  const R = L.R;
  part(c, ring(0.8, -27.6, 5.5, 5.2, R, 0.08, 8), L.skin, L.M);
  part(c, poly([[-4.8, -27.2], [-4.6, -30.6], [-1.4, -32.8], [2.8, -32.8], [5.6, -30.8], [6.4, -28.6], [3.4, -30], [0, -29.8], [-2.6, -28.4], [-3.4, -25.6]], R, 0.18), L.burnt ? C.ink : '#24201d', L.M, { lw: 0.9 });
  dab(c, -2.4, -26.2, 1, L.burnt ? C.charL : tone(L.skin, -0.12), R);   // ear
  face(c, L.M, L.dead, L.risen ? 'zombie' : KIND, 0.3, -4.7, open && !L.dead ? 'o' : undefined);
  if (!L.dead && !L.risen && !open) for (const x of [-1.4, 2.6]) brush(c, [[x - 1, -29], [x + 1, -29.5]], 0.6, C.ink, R, { bristles: 1, dry: 0, taper: 0 });   // fierce brows
}
function topknot(c, L) {
  const R = L.R;
  part(c, poly([[-1.6, -32], [-0.6, -35], [2.4, -36.4], [4.6, -35.2], [3.2, -34], [1, -33.6], [0.6, -31.8]], R, 0.12), L.burnt ? C.ink : '#24201d', L.M, { lw: 0.9 });
  if (!L.burnt) brush(c, [[0, -34.4], [2.6, -35.4]], 0.4, '#6a625c', R, { bristles: 1, dry: 0.3, taper: 0.4 });
}
const thick = (c, L, pts, w = 2.6) => tube(c, pts, w, L.skin, L.R, 1);
const palm = (c, L, x, y) => { part(c, ring(x, y, 1.9, 2.2, L.R, 0.12, 8), L.skin, L.M, { lw: 0.9 }); for (let i = 0; i < 3; i++) brush(c, [[x + 1.2, y - 1.4 + i * 1.2], [x + 2.2, y - 1.6 + i * 1.3]], 0.45, C.ink, L.R, { bristles: 1, dry: 0, taper: 0.3 }); };
const sumoHand = (c, L, x, y) => part(c, ring(x, y, 1.7, 1.7, L.R, 0.1, 7), L.skin, L.M, { lw: 0.85 });

// ---------------------------------------------------------------- arms per type: { key: { N(c, L), F(c, L) | null, w: [near, far] gear angles, heavy } }
// w = the direction the gear (or forearm) points in the facing-right frame, rad: a pose change swings it round from there.
const FLY = {
  N: (c, L) => limb(c, L, [[2, -17], [6, -21.2], [8.6, -25]]),
  F: (c, L) => limb(c, L, [[-1.4, -16.8], [-5.4, -21], [-7.8, -25.2]]),
  w: [-0.95, -2.2],
};
const ARMS = {
  tackler: {
    idle: { N: (c, L) => limb(c, L, [[2.2, -16.6], [4.8, -13.8], [6.6, -14.8]], 'fist'), F: (c, L) => limb(c, L, [[-1.6, -15.8], [-3.6, -12.8], [-2.6, -10.8]], 'fist'), w: [0.37, 1.72] },
    sprint: { N: (c, L) => limb(c, L, [[2.2, -16.6], [5.8, -15.2], [7.6, -18.6]], 'fist'), F: (c, L) => limb(c, L, [[-1.6, -15.8], [-5, -14], [-7.6, -16]], 'fist'), w: [-0.4, -3.08] },
    tackle: { N: (c, L) => limb(c, L, [[2.2, -16.6], [7.6, -19.8], [9.6, -30]]), F: (c, L) => limb(c, L, [[-1.6, -15.8], [5.6, -18.6], [7.6, -29.4]]), w: [-1.26, -1.17] },   // reaching on past the helmet (the body lies flat)
    atk: {
      N: (c, L) => { limb(c, L, [[2.2, -16.6], [6.6, -16.8], [10.6, -16.4]], 'fist'); lines(c, L, 13, -18.4, 2, 3, 2.4); },
      F: (c, L) => limb(c, L, [[-1.6, -15.8], [1.6, -18.8], [3.4, -19.8]], 'fist'), w: [0.02, -0.67],
    },
    fly: FLY,
  },
  batter: {
    rest: {   // bat resting back on the shoulder, both hands on the handle
      N: (c, L) => { bat(c, L, [4.6, -14.4], [-11.8, -21.6]); limb(c, L, [[-1.6, -15.8], [1.6, -13.4], [4.6, -13.6]]); limb(c, L, [[2.2, -16.6], [4.6, -14.4], [4.8, -15.4]]); },
      F: null, w: [-2.73, -2.73],
    },
    wind: {   // cocked back by the rear shoulder
      N: (c, L) => { bat(c, L, [0.2, -18.4], [-14.2, -25.8]); limb(c, L, [[-1.6, -15.8], [-2, -18], [-0.4, -18.2]]); limb(c, L, [[2.2, -16.6], [3, -18.8], [1, -19]]); },
      F: null, w: [-2.67, -2.67],
    },
    swing: {   // swept through level, a big swoosh behind it
      N: (c, L) => {
        swoosh(c, L, [[-8, -31], [4, -35], [17, -29], [25.6, -18.6]], 1.4);
        bat(c, L, [6.8, -15.2], [24.4, -16.8]);
        limb(c, L, [[-1.6, -15.8], [2.4, -14.4], [6.2, -14.6]]); limb(c, L, [[2.2, -16.6], [5, -15], [7.6, -15.6]]);
      },
      F: null, w: [-0.09, -0.09],
    },
    fly: FLY,
  },
  pitcher: {
    idle: { N: (c, L) => { limb(c, L, [[2.2, -16.6], [3.8, -13.4], [5.4, -11.8]]); ball(c, L, 6.4, -11.4); }, F: (c, L) => { limb(c, L, [[-1.6, -15.8], [1.6, -13.8], [4, -15]], null); mitt(c, L, 5.2, -15.6, 0.3); }, w: [0.98, 0.04] },
    wind: { N: (c, L) => { limb(c, L, [[2.2, -16.6], [-1.6, -18.6], [-6.2, -21]]); ball(c, L, -7.2, -21.6); }, F: (c, L) => { limb(c, L, [[-1.6, -15.8], [3.4, -18.4], [7, -19.6]], null); mitt(c, L, 8, -20, -0.4); }, w: [-2.66, -0.42] },
    throw: {
      N: (c, L) => { swoosh(c, L, [[-9, -24], [-3, -31.6], [7.6, -30.4], [13.6, -20]], 1); limb(c, L, [[2.2, -16.6], [7.4, -15.6], [10.8, -11.4]]); },
      F: (c, L) => { limb(c, L, [[-1.6, -15.8], [-4, -13.6], [-4.6, -11.6]], null); mitt(c, L, -4.9, -10.8, 1.4); }, w: [0.54, 2.15],
    },
    fly: { N: FLY.N, F: (c, L) => { limb(c, L, [[-1.4, -16.8], [-5.4, -21], [-7.8, -25.2]], null); mitt(c, L, -8.6, -26.4, -2.2); }, w: FLY.w },
  },
  bowler: {
    hold: {   // both hands under the ball at the chest
      N: (c, L) => { bowlBall(c, L, 7.4, -13.8, 3.5); limb(c, L, [[-1.6, -15.8], [2.4, -12.2], [5.4, -10.8]]); limb(c, L, [[2.2, -16.6], [5.2, -15.4], [6.4, -17.2]]); },
      F: null, w: [0.56, 0.56], heavy: 1,
    },
    carry: {   // walking: the ball hangs from one hand (soft spring: it swings and lags), the free arm swings
      N: (c, L) => { limb(c, L, [[2.2, -16.6], [3.2, -12.8], [4.2, -9.8]], null); bowlBall(c, L, 4.9, -6.8, 3.4); hand(c, L, 4.2, -9.6); },
      F: (c, L) => limb(c, L, [[-1.6, -15.8], [-3.2, -12.6], [-3.8, -10.6]]), w: [1.3, 1.68], heavy: 1,
    },
    aim: {
      N: (c, L) => { bowlBall(c, L, 7, -21, 3.5); limb(c, L, [[-1.6, -15.8], [2.2, -17.8], [4.6, -18]]); limb(c, L, [[2.2, -16.6], [5, -17.6], [6.4, -17.8]]); },
      F: null, w: [-0.74, -0.74], heavy: 1,
    },
    bowl: {   // released low out in front, the far arm flung back for balance
      N: (c, L) => { swoosh(c, L, [[-9.6, -11], [-4.4, -5.4], [4, -3.6], [11.6, -6.4]], 1); limb(c, L, [[2.2, -16.6], [5.4, -11.6], [9.2, -7.2]]); },
      F: (c, L) => limb(c, L, [[-1.6, -15.8], [-5.6, -17.6], [-9, -16.8]]), w: [0.92, -3.01],
    },
    atk: {   // the ball swung at a head
      N: (c, L) => { swoosh(c, L, [[-1, -34], [8, -33.4], [14.6, -26]], 1.1); limb(c, L, [[2.2, -16.6], [6, -19.8], [9.4, -19.2]], null); bowlBall(c, L, 11.8, -18.6, 3.5); hand(c, L, 9.6, -19.4); },
      F: (c, L) => limb(c, L, [[-1.6, -15.8], [-3.6, -13], [-2.6, -11]], 'fist'), w: [-0.3, 1.72], heavy: 1,
    },
    fly: FLY,
  },
  hockey: {
    idle: {   // stick low in front, blade on the ice
      N: (c, L) => { stick(c, L, [2.4, -17.4], [13.6, -0.8], 4.8, 0.3); limb(c, L, [[-1.6, -15.8], [2.6, -13], [6.2, -11.6]]); limb(c, L, [[2.2, -16.6], [3.4, -15.2], [3.8, -15.8]]); },
      F: null, w: [1, 1],
    },
    wind: {   // up behind for the slapshot
      N: (c, L) => { stick(c, L, [3.6, -18], [-12.4, -31.4], -3.6, 1.6); limb(c, L, [[-1.6, -15.8], [-1.4, -19.6], [-2.8, -22]]); limb(c, L, [[2.2, -16.6], [3.4, -19.6], [1.6, -20.6]]); },
      F: null, w: [-2.45, -2.45],
    },
    slap: {   // swept through low, the blade out in front
      N: (c, L) => {
        swoosh(c, L, [[-10, -30], [0.6, -31], [14, -19], [21.6, -5]], 1.3);
        stick(c, L, [4.6, -17.6], [19.8, -2.6], 4.6, -0.6);
        limb(c, L, [[-1.6, -15.8], [4.4, -13.4], [9.4, -11.2]]); limb(c, L, [[2.2, -16.6], [5, -15.4], [6.6, -15.4]]);
      },
      F: null, w: [0.79, 0.79],
    },
    atk: {   // a whack at chest height
      N: (c, L) => {
        swoosh(c, L, [[1, -33], [11.6, -30.6], [19, -20]], 1.1);
        stick(c, L, [4.4, -16.4], [19.2, -10.6], 1.4, 4.4);
        limb(c, L, [[-1.6, -15.8], [4, -14.6], [8.6, -13.6]]); limb(c, L, [[2.2, -16.6], [5, -15.4], [6.6, -15.6]]);
      },
      F: null, w: [0.37, 0.37],
    },
    fly: FLY,
  },
  sumo: {
    idle: { N: (c, L) => { thick(c, L, [[5, -20.4], [8.6, -16.4], [9.8, -12.4]]); sumoHand(c, L, 10, -11.6); }, F: (c, L) => { thick(c, L, [[-4, -19.6], [-7.6, -15.4], [-7.8, -11.8]]); sumoHand(c, L, -7.8, -11); }, w: [1.13, 1.88] },
    shove: {   // both palms out, hard
      N: (c, L) => { thick(c, L, [[5, -20.4], [10.4, -20.4], [14.8, -20.2]]); palm(c, L, 15.6, -20.2); lines(c, L, 19.4, -23.4, 3, 3.2, 2.6); },
      F: (c, L) => { thick(c, L, [[-3.6, -19.6], [4, -21.8], [11.4, -22.6]]); palm(c, L, 12.2, -22.6); }, w: [1.13, 1.88],   // no swing: the palms shoot out (punch 3)
    },
    stomp: {   // arms out wide for balance
      N: (c, L) => { thick(c, L, [[5, -20.4], [9.6, -24], [13, -27.4]]); sumoHand(c, L, 13.6, -28); },
      F: (c, L) => { thick(c, L, [[-4, -19.6], [-9, -22.4], [-12.6, -24.6]]); sumoHand(c, L, -13.2, -25); }, w: [-0.82, -2.65],
    },
    fly: {
      N: (c, L) => { thick(c, L, [[5, -20.4], [9.4, -25], [11.6, -29]]); sumoHand(c, L, 12, -29.8); },
      F: (c, L) => { thick(c, L, [[-4, -19.6], [-8.8, -24.6], [-10.8, -28.4]]); sumoHand(c, L, -11.2, -29.2); }, w: [-1.0, -2.1],
    },
  },
  boxer: {
    guard: {
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [6, -14.6], [8.2, -17.4]]); glove(c, L, 8.8, -18.6, 6.8, -15); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [2.6, -13.2], [5.4, -14.6]]); glove(c, L, 6.2, -15.6, 3.6, -13.4); }, w: [-0.6, -0.3], heavy: 2,
    },
    jabN: {
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [7, -17.6], [11.2, -18]]); glove(c, L, 12.6, -18, 8, -17.8); lines(c, L, 16.2, -20.8, 3, 3.2, 2.2); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [2.6, -13.2], [5.4, -14.6]]); glove(c, L, 6.2, -15.6, 3.6, -13.4); }, w: [-0.13, -0.3], heavy: 2,
    },
    jabF: {
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [5.4, -14.4], [7.2, -16.8]]); glove(c, L, 7.8, -18, 6, -14.8); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [4.4, -17.4], [9.8, -18]]); glove(c, L, 11.2, -18, 6, -17.6); lines(c, L, 14.8, -20.6, 3, 3.2, 2.2); }, w: [-0.82, -0.17], heavy: 2,
    },
    upper: {
      N: (c, L) => { swoosh(c, L, [[5.6, -6], [11, -12.6], [12.4, -23], [9.6, -31]], 1); arm(c, L, [[2.2, -16.6], [6.6, -17.2], [8.4, -23.4]]); glove(c, L, 8.8, -25, 7.4, -19.6); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [2.6, -13.2], [5.4, -14.6]]); glove(c, L, 6.2, -15.6, 3.6, -13.4); }, w: [-1.3, -0.3], heavy: 2,
    },
    dodge: {   // gloves high over the face, swaying out of the way
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [5.4, -17.6], [6, -21.6]]); glove(c, L, 6.4, -23, 5.6, -18.2); lines(c, L, 9.6, -27.6, 2, 2.4, 2.6); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [2.4, -17.6], [3.8, -21]]); glove(c, L, 4.2, -22.4, 3, -17.8); }, w: [-0.98, -0.95], heavy: 2,
    },
    fly: {
      N: (c, L) => { arm(c, L, [[2, -17], [6, -21.2], [8.2, -24.4]]); glove(c, L, 8.8, -25.8, 6.2, -21.6); },
      F: (c, L) => { arm(c, L, [[-1.4, -16.8], [-5.4, -21], [-7.4, -24.6]]); glove(c, L, -8, -26, -5.4, -21.4); }, w: FLY.w, heavy: 2,
    },
  },
  cheerleader: {
    idle: {   // poms on her hips
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [5.4, -14], [4.2, -10.8]]); pom(c, L, 4.8, -10, 2.8); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [-4.6, -13.4], [-3.8, -10.6]]); pom(c, L, -4.4, -9.8, 2.8); }, w: [1.21, 2.02],
    },
    swing: {   // walking: poms swinging at her sides
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [3.4, -13], [4, -10.4]]); pom(c, L, 4.4, -9.2, 2.8); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [-2.6, -12.6], [-3, -10.2]]); pom(c, L, -3.2, -9, 2.8); }, w: [1.28, 1.8],
    },
    cheer: {   // poms high in a V
      N: (c, L) => { arm(c, L, [[2.2, -16.6], [5.4, -21.8], [8, -27]]); pom(c, L, 8.8, -28.6, 3.1); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [-4.8, -21.2], [-7.4, -26.4]]); pom(c, L, -8, -28, 3.1); }, w: [-1.07, -2.05],
    },
    atk: {   // pom slap
      N: (c, L) => { swoosh(c, L, [[2, -32], [10.6, -30], [15.4, -20.6]], 1); arm(c, L, [[2.2, -16.6], [6.6, -17.8], [10.4, -16]]); pom(c, L, 11.8, -15.6, 3); },
      F: (c, L) => { arm(c, L, [[-1.6, -15.8], [-4.6, -13.4], [-3.8, -10.6]]); pom(c, L, -4.4, -9.8, 2.8); }, w: [0.12, 2.02],
    },
    fly: {
      N: (c, L) => { arm(c, L, [[2, -17], [6, -21.2], [8.6, -25]]); pom(c, L, 9.4, -26.4, 2.8); },
      F: (c, L) => { arm(c, L, [[-1.4, -16.8], [-5.4, -21], [-7.8, -25.2]]); pom(c, L, -8.6, -26.6, 2.8); }, w: FLY.w,
    },
  },
};

// ---------------------------------------------------------------- bodies per type
const BODY = {
  tackler(c, L) {   // shoulder pads under the jersey, white pants, a big number
    const R = L.R;
    jersey(c, L);
    c.save(); bodyClip(c, L, 5, 6);
    fill(c, [[-7, -9], [7, -9.3], [7, -4], [-7, -4]], L.trim, R, { sharp: true, edge: 0, vary: 0.06 });
    brush(c, [[-6, -9.2], [0, -8.8], [6, -9.3]], 0.9, C.ink, R, { bristles: 2, dry: 0.2, taper: 0 });
    c.restore();
    part(c, poly([[-6.9, -16.4], [-6.2, -19.4], [-2.6, -20.8], [2.8, -20.8], [6.4, -19.4], [7.3, -16.2], [3.4, -15.4], [-3.2, -15.4]], R, 0.2), L.jer, L.M, { lw: 1.3 });
    number(c, L, '55', 0.4, -12.6, 3.4);
  },
  batter(c, L) {   // pinstripes, a number, a belt
    const R = L.R;
    jersey(c, L);
    if (!L.burnt) { c.save(); bodyClip(c, L); for (const x of [-3.4, -1.1, 1.2, 3.5]) brush(c, [[x, -19], [x + 0.3, -12], [x, -6]], 0.36, L.trim, R, { bristles: 1, dry: 0.15, taper: 0 }); c.restore(); }
    number(c, L, '7', 0.6, -13.8, 3.8);
    belt(c, L);
  },
  pitcher(c, L) { jersey(c, L); number(c, L, '21', 0.4, -13.6, 3.6); belt(c, L); },
  bowler(c, L) {   // bowling shirt: a white collar, a stripe down the front, a bowling pin on the chest
    const R = L.R;
    jersey(c, L);
    c.save(); bodyClip(c, L); brush(c, [[3.2, -19], [3.6, -12.6], [3.4, -6]], 1.7, L.trim, R, { bristles: 3, dry: 0.08, taper: 0 }); c.restore();
    for (const [a, b, d] of [[[-0.4, -19.4], [3.6, -18.9], [2.2, -16.6]], [[-3.6, -18.8], [-0.4, -19.4], [-1.8, -17]]]) part(c, poly([a, b, d], R, 0.1), L.acc(WHITE), L.M, { lw: 0.8, sharp: true });
    if (!L.burnt) {
      dab(c, -1.8, -15.6, 0.85, WHITE, R); brush(c, [[-1.8, -15], [-1.8, -13.8]], 0.7, WHITE, R, { bristles: 1, dry: 0 }); dab(c, -1.8, -12.4, 1.45, WHITE, R);
      brush(c, [[-2.6, -14.4], [-1, -14.4]], 0.4, STITCH, R, { bristles: 1, dry: 0 });
      outline(c, [[-1.8, -16.5], [-0.9, -15.6], [-1.3, -14], [-0.3, -12.4], [-1.8, -11], [-3.3, -12.4], [-2.3, -14], [-2.7, -15.6]], R, 0.45, { jit: 0.08, bristles: 1 });
    }
  },
  hockey(c, L) {   // two stripes round the hem, a number
    const R = L.R;
    jersey(c, L);
    c.save(); bodyClip(c, L, 5, 6.1);
    for (const y of [-9.4, -7.4]) brush(c, [[-6.4, y], [0, y + 0.3], [6.4, y - 0.1]], 1.1, L.trim, R, { bristles: 2, dry: 0.08, taper: 0 });
    c.restore();
    number(c, L, '12', 0.4, -14.4, 3.4);
  },
  sumo: sumoBody,
  boxer(c, L) {   // singlet + trunks (a darker tone) with a white waistband and side stripe
    const R = L.R;
    jersey(c, L);
    c.save(); bodyClip(c, L, 5, 6.1);
    fill(c, [[-7, -9.2], [7, -9.6], [7, -4], [-7, -4]], L.burnt ? C.char : tone(L.jer, -0.22), R, { sharp: true, edge: 0, vary: 0.08 });
    brush(c, [[-6.4, -9.8], [0, -9.4], [6.4, -9.9]], 1.4, L.trim, R, { bristles: 2, dry: 0.08, taper: 0 });
    brush(c, [[-2.2, -9], [-2.4, -6]], 0.8, L.trim, R, { bristles: 1, dry: 0.1, taper: 0 });
    c.restore();
    if (!L.burnt) brush(c, [[3.4, -18.6], [2, -15.6], [3.6, -12.6]], 0.45, tone(L.jer, -0.3), R, { bristles: 1, dry: 0.3, taper: 0.3 });   // armhole
  },
  cheerleader(c, L) {   // top with a white V, a flared pleated skirt
    const R = L.R;
    jersey(c, L);
    if (!L.burnt) brush(c, [[-3.8, -17.8], [0.2, -13.6], [3.9, -18]], 1.35, L.trim, R, { bristles: 2, dry: 0.1, taper: 0.05 });
    part(c, poly([[-5.4, -10.4], [5.6, -10.6], [7.8, -5.4], [3.4, -4.4], [-1, -4.2], [-5.6, -4.6], [-7.6, -5.6]], R, 0.18), L.jer, L.M, { lw: 1.3 });
    if (!L.burnt) {
      for (const [a, b] of [[[-3, -9.8], [-4, -5.2]], [[0.4, -10], [0.3, -4.8]], [[3.4, -10], [4.6, -5]]]) brush(c, [a, b], 0.45, tone(L.jer, -0.3), R, { bristles: 1, dry: 0.2, taper: 0.2 });
      brush(c, [[-7.2, -5.8], [-1, -4.9], [7.4, -5.8]], 0.9, L.trim, R, { bristles: 2, dry: 0.15, taper: 0.1 });
    }
  },
};

// ---------------------------------------------------------------- per-type table (our numbers)
// P: per pose { k arm key, lean (rad), drop (px), legs (gait, rig-sports.js), nLeg / fLeg (leg parts), nFix / fFix, legNA /
// legFA (leg angles: rest / the whole frame's), punch, anim, open (mouth), lift (whole frame only, px), atk }.
const WALK = (k, extra = {}) => ({ idle: { k, ...extra }, walk0: { k, legNA: -0.45, legFA: 0.45, ...extra }, walk1: { k, legNA: 0.12, legFA: -0.1, ...extra } });
const FLYP = { fly: { k: 'fly', legNA: -0.6, legFA: 0.75, open: true } };
const TYPES = {
  // tackler: orange jersey with shoulder pads + white number, white pants, an orange football helmet (white stripe, face
  // mask). act 1 sprint, act 2 tackle (dive, flat on the grass), atk punch.
  tackler: {
    own: ORANGE, scale: 1.16, box: [66, 52, 26, 46], hat: footballHelmet, leg: 'r:leg',
    acts: { 1: 'sprint', 2: 'tackle' }, atk: 'atk',
    P: { ...WALK('idle', { lean: 0.06 }), atk: { k: 'atk', lean: 0.1, legNA: -0.3, legFA: 0.3, punch: 1 },
      sprint: { k: 'sprint', lean: 0.42, legs: 1, legNA: -0.85, legFA: 0.8 },
      tackle: { k: 'tackle', lean: 1.32, drop: 4.6, legs: 6, legNA: 1.62, legFA: 1.95, open: true }, ...FLYP },
  },
  // batter: white pinstripe jersey (orange number), orange batting helmet with an ear flap, a wooden bat. act 1 wind, act 2
  // swing (also the u.attack pose).
  batter: {
    own: WHITE, scale: 1.04, box: [64, 54, 26, 48], hat: battingHelmet, leg: 'r:leg',
    acts: { 1: 'wind', 2: 'swing' }, atk: 'swing',
    P: { ...WALK('rest'), wind: { k: 'wind', lean: -0.14, drop: 1, legNA: -0.28, legFA: 0.32 },
      swing: { k: 'swing', lean: 0.16, legNA: -0.42, legFA: 0.38 }, ...FLYP },
  },
  // pitcher: white jersey (orange number), orange cap, a brown mitt, a baseball. act 1 wind (leg kick), act 2 throw.
  pitcher: {
    own: WHITE, scale: 1.04, box: [58, 52, 26, 46], hat: cap, leg: 'r:leg',
    acts: { 1: 'wind', 2: 'throw' }, atk: 'throw',
    P: { ...WALK('idle'), wind: { k: 'wind', lean: -0.2, nLeg: 'r:knee', nFix: 2, legFA: 0.05 },
      throw: { k: 'throw', lean: 0.32, legNA: -0.55, legFA: 0.6 }, ...FLYP },
  },
  // bowler: orange bowling shirt (white collar, front stripe, a pin on the chest), slick brown hair + moustache, a purple
  // bowling ball. act 1 aim, act 2 bowl (lunge), atk = ball bonk.
  bowler: {
    own: ORANGE, scale: 1.1, box: [60, 52, 26, 46], hair: bowlerHair, leg: 'r:leg', crouch: 4,
    acts: { 1: 'aim', 2: 'bowl' }, atk: 'atk',
    P: { idle: { k: 'hold' }, walk0: { k: 'carry', legNA: -0.45, legFA: 0.45 }, walk1: { k: 'carry', legNA: 0.12, legFA: -0.1 },
      aim: { k: 'aim', lean: 0.08, drop: 1, legNA: -0.14, legFA: 0.1 },
      bowl: { k: 'bowl', lean: 0.36, drop: 4, legs: 3, nLeg: 'r:lunge1', fLeg: 'r:lunge0', nFix: 1, fFix: 1 },
      atk: { k: 'atk', lean: 0.1, legNA: -0.3, legFA: 0.3 }, ...FLYP },
  },
  // hockey: orange jersey with white hem stripes + number, white helmet (team band, wire cage), a taped stick, skates.
  // act 1 wind, act 2 slap, atk stick whack, on ice skate0 / skate1.
  hockey: {
    own: ORANGE, scale: 1.04, box: [66, 54, 28, 48], hat: hockeyHelmet, leg: 'r:skate',
    acts: { 1: 'wind', 2: 'slap' }, atk: 'atk',
    P: { ...WALK('idle', { lean: 0.1 }), skate0: { k: 'idle', lean: 0.3, legs: 2, legNA: 0.62, legFA: -0.18 }, skate1: { k: 'idle', lean: 0.3, legs: 2, legNA: -0.18, legFA: 0.62 },
      wind: { k: 'wind', lean: -0.12, legNA: -0.2, legFA: 0.26 }, slap: { k: 'slap', lean: 0.28, legNA: -0.42, legFA: 0.45 },
      atk: { k: 'atk', lean: 0.12, legNA: -0.25, legFA: 0.25 }, ...FLYP },
  },
  // sumo: big bare belly, a mawashi in the jersey colour (knot behind, sagari in front), black topknot. act 1 shove (both
  // palms), act 2 stomp (near leg high then down), atk = shove.
  sumo: {
    own: ORANGE, scale: 1.45, box: [64, 58, 28, 52], sumo: true, leg: 'r:sleg', crouch: 2,
    acts: { 1: 'shove', 2: 'stomp' }, atk: 'shove',
    P: { idle: { k: 'idle', lean: 0.04, legNA: -0.08, legFA: 0.08 }, walk0: { k: 'idle', legs: 5, legNA: -0.36, legFA: 0.3 }, walk1: { k: 'idle', legs: 5, legNA: 0.1, legFA: -0.08 },
      shove: { k: 'shove', lean: 0.24, drop: 2, legs: 3, nLeg: 'r:slunge1', fLeg: 'r:slunge0', nFix: 1, fFix: 1, punch: 3 },
      stomp: { k: 'stomp', lean: -0.18, anim: 2, legNA: -2, legFA: 0.1, legFront: 1 },
      fly: { k: 'fly', legNA: -0.6, legFA: 0.75, open: true } },
  },
  // boxer: orange singlet + darker trunks (white waistband), orange padded headguard, gold gloves. act 1 jab0 / jab1 (by
  // b.arm), act 2 upper, act 3 dodge; atk = jab by b.arm. Bounces on his toes when standing.
  boxer: {
    own: ORANGE, scale: 1.04, box: [60, 52, 24, 46], hat: headguard, leg: 'r:leg',
    acts: { 2: 'upper', 3: 'dodge' }, atk: 'jab0',
    P: { ...WALK('guard', { lean: 0.08, anim: 4, legNA: -0.2, legFA: 0.22 }), walk0: { k: 'guard', lean: 0.08, legNA: -0.45, legFA: 0.45 }, walk1: { k: 'guard', lean: 0.08, legNA: 0.12, legFA: -0.1 },
      jab0: { k: 'jabN', lean: 0.14, punch: 1, legNA: -0.35, legFA: 0.32 }, jab1: { k: 'jabF', lean: 0.12, punch: 2, legNA: -0.3, legFA: 0.3 },
      upper: { k: 'upper', lean: -0.08, drop: 1.4, legNA: -0.25, legFA: 0.3 }, dodge: { k: 'dodge', lean: -0.38, anim: 3, legNA: -0.3, legFA: 0.15 }, ...FLYP },
  },
  // cheerleader: orange top with a white V, flared pleated skirt, yellow hair with a ponytail (its own floppy part) and a bow,
  // pom-poms. act 1 cheer (jump, poms up, shouting), atk = pom slap.
  cheerleader: {
    own: ORANGE, scale: 0.98, box: [54, 56, 24, 50], hair: cheerHair, tail: ponytail, tailAt: [-5.2, -25.6], leg: 'r:leg',
    acts: { 1: 'cheer' }, atk: 'atk',
    P: { idle: { k: 'idle' }, walk0: { k: 'swing', legNA: -0.45, legFA: 0.45 }, walk1: { k: 'swing', legNA: 0.12, legFA: -0.1 },
      cheer: { k: 'cheer', lean: -0.05, legs: 3, nLeg: 'r:tuck1', fLeg: 'r:tuck0', nFix: 2, fFix: 2, anim: 1, open: true, lift: 5 },
      atk: { k: 'atk', lean: 0.1, legNA: -0.3, legFA: 0.3 }, ...FLYP },
  },
};
const BASE = new Set(['idle', 'walk0', 'walk1', 'skate0', 'skate1']);
const ACT = (u) => (u.b ? u.b.act | 0 : 0);
const onIce = (w, u) => !!w && w.iceCells > 0 && typeof w.iceAt === 'function' && w.iceAt(u.x, u.y) > 0;

// ---------------------------------------------------------------- painting a type
function paintArm(c, L, D, key, side) {
  if (L.risen) {   // a risen copy: its gear is gone, zombie arms reach out (both in the near part)
    if (side !== 'N') return;
    if (D.sumo) { const sk = L.skin; for (const [p, w] of [[[[5, -20.4], [11, -21], [16, -20.6]], 2.6], [[[3, -17], [9, -16.4], [14.4, -15.8]], 2.4]]) { tube(c, p, w, sk, L.R, 1); sumoHand(c, L, p[2][0] + 0.6, p[2][1]); } return; }
    human(c, KIND, L.o.col, key === 'fly' ? 'fly' : 'aim', L.M, L.dead, L.skin, { layer: 'arms', risen: true });
    return;
  }
  const A = D.arms[key] || D.arms[D.P.idle.k], f = side === 'N' ? A.N : A.F;
  if (f) f(c, L);
}
function paintHead(c, L, D, open) {
  if (D.sumo) { sumoHead(c, L, open); return; }
  headLayer(c, L, D, open);
}
function paintPart(c, o, D, p) {
  const L = look(o, D);
  if (p === 'r:body') { D.body(c, L); return; }
  if (p === 'r:head' || p === 'r:headO') { paintHead(c, L, D, p === 'r:headO'); return; }
  if (p === 'r:tail') { D.tail(c, L); return; }
  if (p.startsWith('r:arm')) { paintArm(c, L, D, p.slice(7), p.charAt(5)); return; }
  paintLeg(c, L, D, p);
}
/** The whole frame: the parts at the pose's rest transforms (the rig starts from exactly this). */
function whole(c, o, D, pose) {
  const L = look(o, D), P = D.P[pose] || D.P.idle, lift = P.lift || 0, drop = P.drop || 0, hipY = D.hipY, hy = hipY + drop;
  c.save(); c.translate(0, -lift);
  const leg = (near) => {
    const name = (near ? P.nLeg : P.fLeg) || D.leg, fix = (near ? P.nFix : P.fFix) || 0, ang = near ? (P.legNA ?? 0.09) : (P.legFA ?? -0.09);
    c.save();
    if (fix === 2) c.translate(0, drop);
    else if (fix === 0) { c.translate(near ? D.legX : -D.legX, 0); c.translate(0, hy); c.rotate(ang); c.translate(0, -hy); if (P.legs !== 6) c.scale(1, hy / hipY); }
    paintLeg(c, L, D, name);
    c.restore();
  };
  leg(0); if (!P.legFront) leg(1);
  c.save(); c.translate(0, drop); if (P.lean) { c.translate(0, hipY); c.rotate(P.lean); c.translate(0, -hipY); }
  D.body(c, L);
  c.restore();
  if (P.legFront) leg(1);
  c.translate(0, drop); if (P.lean) { c.translate(0, hipY); c.rotate(P.lean); c.translate(0, -hipY); }
  if (D.tail && !D.tailFront) D.tail(c, L);
  paintHead(c, L, D, !!P.open && !o.dead);
  if (D.tail && D.tailFront) D.tail(c, L);
  paintArm(c, L, D, P.k, 'F');
  paintArm(c, L, D, P.k, 'N');
  c.restore();
}

// ---------------------------------------------------------------- the entries
function entry(type) {
  const D = TYPES[type];
  D.arms = ARMS[type]; D.body = BODY[type]; D.hipY = D.sumo ? -7.5 : -8; D.legX = D.sumo ? 3.6 : 1.8;
  if (type === 'sumo') { D.tail = topknot; D.tailFront = true; }
  const poseNames = Object.keys(D.P);
  const base = ['idle', 'walk0', 'walk1'], poses = base.concat(D.atk === 'atk' ? ['atk'] : []);
  const extra = poseNames.filter((p) => !poses.includes(p));
  const legs = new Set([D.leg]); for (const p of poseNames) { if (D.P[p].nLeg) legs.add(D.P[p].nLeg); if (D.P[p].fLeg) legs.add(D.P[p].fLeg); }
  const parts = [...legs, 'r:body', 'r:head', 'r:headO'].concat(D.tail ? ['r:tail'] : []);
  for (const k of Object.keys(D.arms)) { parts.push('r:armN:' + k); if (D.arms[k].F) parts.push('r:armF:' + k); }
  const acts = D.acts;
  const joints = D.sumo
    ? { hip: [0, -7.5], neck: [0.6, -22], shN: [5, -20.4], shF: [-4, -19.6], legX: 3.6, tail: [-0.2, -32.2], tailFront: 1, belly: [0.4, -7], bellyTop: -23.2 }
    : { hip: [0, -8], neck: [0.5, -17.6], shN: [2.2, -16.6], shF: [-1.6, -15.8], legX: 1.8, tail: D.tailAt || [-5.2, -25.6], tailFront: 0, belly: [0, -7], bellyTop: -19 };
  return {
    box: D.box, scale: D.scale, own: D.own, poses, extra: extra.concat(parts),
    paint(c, o) {
      const p = o.pose;
      if (isPart(p)) { paintPart(c, o, D, p); return; }
      whole(c, o, D, o.dead ? 'idle' : p);
    },
    pick(u, info) {
      if ((u.z || 0) > 1) return 'fly';
      const a = ACT(u), b = u.b;
      if (type === 'boxer' && (a === 1 || (a === 0 && u.attack > 0))) return b && b.arm ? 'jab1' : 'jab0';
      if (a > 0 && acts[a]) return acts[a];
      if (u.attack > 0) return D.atk;
      if (type === 'hockey' && info.moving && b && (b.ice === 1 || onIce(info.world, u))) return info.walkFrame ? 'skate1' : 'skate0';
      return null;
    },
    /** Hat flying off (RENDER fx 'hatoff'): just the helmet / cap, centred near people.js HAT_AT. */
    paintHat: D.hat ? (c, col, M) => D.hat(c, look({ R: M.R, M, col, dead: false, risen: false }, D)) : null,
    rig: {
      driver: 'sport', joints, tune: D.sumo ? { belly: 1, steady: 0.6, swingN: 0.18, swingF: 0.22 } : D.tune || { swingN: 0.22, swingF: 0.34 },
      parts(pose, zom) {
        const P = D.P[pose] || D.P.idle, A = D.arms[P.k];
        const nLeg = P.nLeg || D.leg, fLeg = P.fLeg || D.leg;
        return {
          legN: nLeg, legF: fLeg, nFix: P.nFix || 0, fFix: P.fFix || 0, legNA: P.legNA ?? 0, legFA: P.legFA ?? 0, legs: P.legs || 0,
          body: 'r:body', head: P.open ? 'r:headO' : 'r:head', tail: D.tail ? 'r:tail' : null,
          armN: 'r:armN:' + P.k, armF: !zom && A.F ? 'r:armF:' + P.k : null,
          lean: P.lean || 0, drop: P.drop || 0, crouch: D.crouch || 0, legFront: P.legFront || 0,
          wN: zom ? 0 : A.w[0], wF: zom ? 0 : A.w[1], punch: zom ? 0 : P.punch || 0, anim: P.anim || 0, heavyN: zom ? 0 : A.heavy || 0,
          code: POSE_CODE(type + '|' + P.k + '|' + (BASE.has(pose) ? 'base' : pose)),
        };
      },
    },
  };
}
TYPES.cheerleader.tune = { swingN: 0.4, swingF: 0.45 };
TYPES.bowler.tune = { swingN: 0.3, swingF: 0.4 };
export const SPRITES = {};
for (const t of Object.keys(TYPES)) SPRITES[t] = entry(t);

// ---------------------------------------------------------------- projectiles (sprites.js PROJ_SRC, drawn by fx.js)
export const PROJ = {
  // baseball (pitcher fastball, sim kind 'baseball'): white ball with red stitches + a speed streak behind, facing its
  // flight at shoulder height; the two variants swap fast so the stitches spin. p.z (if the sim lobs it) lifts it.
  baseball: {
    box: [28, 10, 21, 5], n: 2, lift: 14,
    paint(c, R, v) {
      brush(c, [[-2.4, -1.2], [-10, -1], [-19, -0.6]], 1.4, SWOOSH, R, { bristles: 3, dry: 0.5, taper: 0.9 });
      brush(c, [[-2.4, 1.2], [-8, 1.2], [-14, 1]], 0.9, C.greyL, R, { bristles: 2, dry: 0.5, taper: 0.9 });
      dab(c, 0, 0, 2.5, C.ink, R); dab(c, 0, 0, 2, WHITE, R);
      const sh = v ? 0.55 : -0.25;   // the seams ( ) sit a little further round on the second frame: it spins
      for (const k of [-1, 1]) brush(c, [[sh + k * 0.55, -1.5], [sh + k * 1.35, 0], [sh + k * 0.55, 1.5]], 0.42, STITCH, R, { bristles: 1, dry: 0, taper: 0 });
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = p.z > 0 ? p.z : 0;
      if (z > 3) api.shadowAt(x, y, 0.2, 0.6);
      api.put(api.bit(api.sprite, ((rt * 24 + i) | 0) & 1), x, y - 14 - z, 1, ang);
      return true;
    },
  },
  // bowling ball (bowler, sim kind 'bowlball'): rolls on the ground, turning with the ground it covers (one turn per
  // 2·pi·r), a dust streak behind it (variant 2, faces its flight), a shadow under it.
  bowlball: {
    box: [36, 16, 25, 8], n: 3,
    paint(c, R, v, M) {
      if (v === 2) {
        for (const [y, w, l] of [[-3, 0.9, 14], [0.4, 1.2, 20], [3.4, 0.8, 12]]) brush(c, [[-5, y], [-5 - l * 0.5, y + 0.1], [-5 - l, y + 0.3]], w, C.kraft, R, { bristles: 2, dry: 0.6, taper: 0.9 });
        return;
      }
      part(c, ring(0, 0, 4.8, 4.8, R, 0.04, 10), BOWL, M, { lw: 1.5 });
      brush(c, [[-3.4, 1.6], [-0.4, 2.8], [2.6, 1]], 0.8, BOWLL, R, { bristles: 2, dry: 0.4, taper: 0.4 });
      for (const [dx, dy] of [[0.2, -2.2], [2.1, -0.9], [2.1, -3]]) dab(c, dx, dy, 0.7, C.ink, R);
      dab(c, -2.2, -2, 0.85, WHITE, R);
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = p.z > 0 ? p.z : 0, sp = Math.hypot(p.vx || 0, p.vy || 0);
      api.shadowAt(x, y, 0.4, 0.8);
      if (sp > 40) api.put(api.bit(api.sprite, 2), x, y - 4.8 - z, 1, ang);
      api.put(api.bit(api.sprite, i & 1), x, y - 4.8 - z, 1, ((p.x || 0) + (p.y || 0) * 0.35) / 4.8);
      return true;
    },
  },
  // puck (hockey slapshot, sim kind 'puck'): a flat black disc sliding just over the ground (it never turns), a speed
  // streak behind it facing its flight (variant 1).
  puck: {
    box: [30, 10, 23, 5], n: 2,
    paint(c, R, v) {
      if (v === 1) {
        brush(c, [[-3.6, -0.8], [-12, -0.6], [-21, -0.2]], 1.1, SWOOSH, R, { bristles: 3, dry: 0.5, taper: 0.9 });
        brush(c, [[-3.6, 1], [-9, 1], [-15, 0.8]], 0.7, C.greyL, R, { bristles: 2, dry: 0.5, taper: 0.9 });
        return;
      }
      fill(c, ring(0, 0.5, 3.4, 1.6, R, 0.04, 10), C.ink, R, { edge: 0, vary: 0.05 });
      fill(c, ring(0, -0.4, 3.1, 1.25, R, 0.04, 10), '#3d3842', R, { edge: 0, vary: 0.08 });
      brush(c, [[-1.6, -0.9], [1.2, -1.1]], 0.4, '#7a7680', R, { bristles: 1, dry: 0.3, taper: 0.4 });
    },
    draw(p, x, y, ang, rt, i, api) {
      const z = p.z > 0 ? p.z : 0;
      api.shadowAt(x, y, 0.28, 0.7);
      api.put(api.bit(api.sprite, 1), x, y - 2 - z, 1, ang);
      api.put(api.bit(api.sprite, 0), x, y - 2 - z, 1, 0);
      return true;
    },
  },
};
export { ORANGE as SPORTS_OWN };
