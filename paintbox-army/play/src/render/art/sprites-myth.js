// Mythical sprites + the two props (tree, barrel), POSTER PAINT look. Owner: MYTHICAL art agent.
// Contract: src/render/art/ART.md. Every entry paints ONE frame facing RIGHT, feet at (0,0), up = -y.
// The zombie, dragon and tree are ported from looks/src/kid-a.js; the rest are new kid paintings in the same hand.
// Visual states come from OG's renderer (reference/og-src/game.js 19150-19430 pose code, 20810-21140 unit params,
// dragon pose game.js:1658-1688, slime lift game.js:19462-19467, raise glow game.js:21481-21540). Each entry's comment
// says which unit field picks which pose, so RENDER can wire it.
//
// Pose-name rules RENDER composes:
//   slime  pose + (u.subState > 0 ? '_' + u.subState : '')           e.g. 'hop_2'
//   giant  pose + club suffix ('' wooden club | '_tree' | '_char' | '_fire'), see the giant entry
// o.risen: true = zombie copy (C.zskin skin, zombie eyes, arms reaching like a zombie); 'bone' = a skeleton copy of this
// type (bone-white skin, black eye holes); RENDER may pass either.
// Hooks (RENDER index.js): every entry but zombie / skeleton has pick(u, info) -> pose name, wired to the unit fields
// listed in its section; giant and slime also have drawUnit(ctx, u, x, y, flip, k, t, api) in sim px (giant: the club in
// its fist; slime: the hop lift); necro has alpha(u) (55% while lurking). Nothing in a hook allocates per frame.
//
// Floppy bodies (RIG.md, OURS not OG): every entry is also painted as parts, extra poses named 'r:<part>' painted in their
// rest place (drawn unturned, all the parts together look like the whole sprite), and its `rig` names the parts of each
// pose for the drivers in rig-myth.js (zombie, bones, robe, giant, dragon, jelly) or rig.js ('wobble': tree, barrel).
// The whole painters below are built from the same layer helpers as the parts, so the two always agree.
import { C, TAU, lerp, tone, brush, ring, poly, fill, outline, part, dab, tube, spark, shift, spline } from './paint.js';
import { human, humanLeg, humanJoints } from './people.js';
import { TREE_EXTRA, treeThemed, paintThemedTree } from './maps-art.js';   // STEP7 GROUND-ART: tree look by map ground

const BONE = C.white;
const GLOW = '#d8ff4a';     // necromancer eyes + raise magic
const MAGIC = '#5fd35a';    // curse swirl / raise swirl
const GSKIN = '#f2a894';    // giant skin: ruddier than a person's, so a giant reads as "not a big soldier"

// ---------- shared bits ----------
const isPart = p => p.charCodeAt(0) === 114 && p.charCodeAt(1) === 58;   // 'r:' floppy-body part
const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
function lookOf(o, skin0) {
  const burnt = o.dead === 'burnt', bone = o.risen === 'bone';
  return {
    burnt, bone, zomb: !!o.risen && !bone,
    skin: burnt ? C.charL : bone ? BONE : o.risen ? C.zskin : skin0,
    cl: col => burnt ? C.char : col,      // clothes / body paint
    acc: col => burnt ? C.charL : col,    // small accents
  };
}
function xMark(c, R, x, y, s = 1, col = C.ink) {
  brush(c, [[x - 0.9 * s, y - 0.9 * s], [x + 0.9 * s, y + 0.9 * s]], 0.75 * s, col, R, { bristles: 2, dry: 0 });
  brush(c, [[x + 0.9 * s, y - 0.9 * s], [x - 0.9 * s, y + 0.9 * s]], 0.75 * s, col, R, { bristles: 2, dry: 0 });
}
/** Two eyes in side view: far eye at x0, near eye at x1 (the zombie's near eye is the big white one). */
function eyes(c, R, x0, x1, y, o, L, s = 1) {
  if (o.dead) { xMark(c, R, x0, y, s); xMark(c, R, x1, y, s); return; }
  if (L.bone) { dab(c, x0, y, 1.05 * s, C.ink, R); dab(c, x1, y, 1.2 * s, C.ink, R); return; }
  if (L.zomb) { dab(c, x1, y - 0.4 * s, 1.55 * s, C.white, R); dab(c, x1 + 0.3 * s, y - 0.3 * s, 0.62 * s, C.ink, R); dab(c, x0, y + 0.2 * s, 0.72 * s, C.ink, R); return; }
  dab(c, x0, y, 0.72 * s, C.ink, R); dab(c, x1, y, 0.72 * s, C.ink, R);
}
/** A kid's flame pointing up from (x, y): red tongue, orange, yellow core. */
function flame(c, x, y, h, R) {
  const tongue = (w, hh, bend, col, outl) => {
    const pts = [[x - w / 2, y], [x - w * 0.42, y - hh * 0.4], [x + bend * 0.5 - w * 0.12, y - hh * 0.75], [x + bend, y - hh], [x + bend * 0.4 + w * 0.2, y - hh * 0.68], [x + w * 0.46, y - hh * 0.34], [x + w / 2, y], [x, y + 1]];
    fill(c, poly(pts, R, 0.25), col, R, { vary: 0.08, sp: 0.9, edge: 0 });
    if (outl) outline(c, pts, R, 1.1, { jit: 0.3, gap: true });
  };
  const b = (R() - 0.5) * h * 0.3;
  tongue(h * 0.62, h, b, C.fireR, true); tongue(h * 0.42, h * 0.68, b * 0.7, C.fireO, false); tongue(h * 0.24, h * 0.4, b * 0.4, C.fireY, false);
}
function arm(c, R, pts, w = 1.3) { brush(c, pts, w, C.ink, R, { bristles: 2, taper: 0.2, dry: 0.1 }); }
const FEET = { idle: [-2.4, 3], walk0: [-4.4, 4.8], walk1: [-0.8, 1.8] };
function reach(c, R, skin) {   // risen copies: both arms reach forward (Zombie brain)
  tube(c, [[1, -17.4], [6, -18], [11.4, -17.8]], 1.7, skin, R, 0.85); tube(c, [[-0.4, -14], [5, -13.2], [10.4, -12.4]], 1.7, skin, R, 0.85);
  dab(c, 11.8, -17.8, 1.2, skin, R); dab(c, 10.8, -12.4, 1.2, skin, R);
}

// ---------- ZOMBIE (kid-a human 'zombie') ----------
// poses: idle (u not moving), walk0/walk1 (moving, alternate), atk (u.attack > 0: the bite lunge, mouth open).
// OG also coils back just before a bite (Engage, cooldown < 0.22 s) and 30% of zombies limp: RENDER offsets, no new art.
// Parts (driver 'zombie'): r:leg (people.js humanLeg), r:body, r:head, r:headA (bite: mouth open), r:arm (both arms).
const ZPOSE = { idle: 'aim', walk0: 'walk0', walk1: 'walk1', atk: 'walk0' };
function zombieMouth(c, R, M) {
  part(c, ring(2.9, -18.3, 1.9, 1.5, R, 0.1, 7), '#7a1610', M, { lw: 1.0 });
  for (let i = 0; i < 2; i++) brush(c, [[2 + i * 1.6, -19.6], [2.3 + i * 1.6, -18.7]], 0.6, C.white, R, { bristles: 1, dry: 0 });
}
function zombie(c, o) {
  const skin = o.dead === 'burnt' ? undefined : C.zskin, p = o.pose;
  if (isPart(p)) {
    if (p === 'r:leg') { humanLeg(c, 'zombie', o.M, o.dead === 'burnt'); return; }
    human(c, 'zombie', o.col, 'aim', o.M, o.dead, skin, { layer: p === 'r:body' ? 'body' : p === 'r:arm' ? 'arms' : 'head' });
    if (p === 'r:headA' && !o.dead) zombieMouth(c, o.R, o.M);
    return;
  }
  if (p === 'atk' && !o.dead) {
    c.save(); c.translate(1.4, 0); c.rotate(0.2);
    human(c, 'zombie', o.col, 'walk0', o.M, false, skin);
    zombieMouth(c, o.R, o.M);
    c.restore();
    return;
  }
  human(c, 'zombie', o.col, ZPOSE[p] || 'aim', o.M, o.dead, skin);
}

// ---------- MAGE ----------
// poses: idle, walk0/walk1, castFire (u.subState === 1: fireball windup), castBolt (u.subState === 2: chain lightning),
// castCurse (u.subState === 3: the frog curse). OG shows the windup progress 1 - (timer - now) / 0.5 (game.js:19310) and
// the spell in the hand (flourish = subState, game.js:19399): show the cast pose for the whole windup.
// Blink when routed = RENDER fx ('blast' kind 2 at both ends). Risen (zombie mage): no staff, arms reach forward.
// Parts (driver 'robe'): r:robe (+ feet), r:arms (staff at rest; risen: reaching arms), r:arms:<cast pose> (staff thrust +
// the spell), r:head (face + beard), r:hat (floppy, on its own spring).
function mageFoot(c, R, M, L, x) { part(c, ring(x, -1.1, 2.3, 1.3, R, 0.1, 6), L.cl(C.brown), M, { lw: 1.2 }); }
function mageRobe(c, R, M, L, robe, sw) {
  part(c, poly([[-4.3, -19.6], [4.6, -19.8], [6, -12], [7.8 + sw, -2.6], [3, -1.6], [-2, -1.9], [-6.8 + sw, -2.4], [-6, -11.6]], R, 0.3), robe, M);
  brush(c, [[-5.6, -11.4], [0.6, -10.8], [6.4, -11.6]], 1.3, L.acc(C.yellow), R, { bristles: 2, dry: 0.2 });
}
function mageHead(c, o, R, M, L) {   // the white beard over the arm: the wizard tell
  part(c, ring(1, -23, 5.4, 5.2, R, 0.08, 8), L.skin, M, { lw: 1.4 });
  eyes(c, R, 1.5, 4.3, -23.6, o, L);
  if (!L.burnt && !L.bone && !L.zomb) part(c, poly([[-0.2, -20.8], [6.2, -21.2], [5, -17.2], [2.8, -13.6], [0.6, -17]], R, 0.25), C.white, M, { lw: 1.0 });
}
function mageHat(c, R, M, L, robe, dark) {   // pointy hat with a star, tip bent back
  part(c, ring(0.8, -27.6, 7.8, 1.9, R, 0.08, 9), dark, M, { lw: 1.3 });
  part(c, poly([[-4.4, -28], [5.8, -28.2], [2.6, -35.6], [-2.4, -42.4], [-1.6, -35]], R, 0.3), robe, M);
  if (!L.burnt) spark(c, 0.8, -32.6, 1.7, R);
}
function mageArms(c, o, R, M, L, p) {
  if (o.risen) { reach(c, R, L.skin); return; }   // zombie / skeleton mage: the Zombie brain, no spells
  const wood = L.acc(C.brown);
  if (!p.startsWith('cast')) {
    brush(c, [[8.6, -0.6], [8.9, -15], [9.4, -28.6]], 1.6, wood, R, { taper: 0.1, dry: 0.1, bristles: 3 });
    part(c, ring(9.6, -30.4, 2.1, 2.1, R, 0.1, 7), L.acc('#58c8f0'), M, { lw: 1.1 });
    arm(c, R, [[2.4, -16.4], [6, -15.2], [8.6, -14.6]]); dab(c, 8.9, -14.5, 1.15, L.skin, R);
    return;
  }
  // casting: staff thrust up and forward, the spell at its tip
  brush(c, [[5, -7], [10, -20], [14.6, -32.4]], 1.6, wood, R, { taper: 0.1, dry: 0.1, bristles: 3 });
  arm(c, R, [[2.4, -17.4], [6.4, -20.4], [10, -21.2]]); dab(c, 10.2, -21.2, 1.15, L.skin, R);
  arm(c, R, [[-1.6, -16.4], [3.4, -13.4], [6.6, -11.8]]); dab(c, 6.8, -11.6, 1.05, L.skin, R);
  const tx = 15.4, ty = -34.6;
  if (p === 'castFire') {
    part(c, ring(tx, ty, 3.6, 3.3, R, 0.15, 8), C.fireO, M, { lw: 1.2 });
    dab(c, tx + 0.4, ty + 0.3, 1.7, C.fireY, R);
    for (let i = 0; i < 3; i++) brush(c, [[tx - 2 + i * 1.8, ty - 2.4], [tx - 2.6 + i * 2.2, ty - 6.4]], 1.3, i === 1 ? C.fireY : C.fireR, R, { bristles: 2, taper: 0.8, dry: 0.2 });
  } else if (p === 'castBolt') {
    for (let i = 0; i < 4; i++) {
      const a = -2.2 + i * 0.75, s = 5.6;
      brush(c, [[tx, ty], [tx + Math.cos(a) * s * 0.45 + 1, ty + Math.sin(a) * s * 0.45], [tx + Math.cos(a) * s * 0.6 - 1, ty + Math.sin(a) * s * 0.6], [tx + Math.cos(a) * s, ty + Math.sin(a) * s]], 1.1, C.yellow, R, { bristles: 2, taper: 0.5, dry: 0 });
    }
    dab(c, tx, ty, 2.1, C.white, R); dab(c, tx, ty, 1.1, C.yellow, R);
  } else {
    const sp = []; for (let th = 0; th < 3.4 * Math.PI; th += 0.55) { const r = 0.6 + th * 0.42; sp.push([tx + Math.cos(th) * r, ty + Math.sin(th) * r]); }
    brush(c, sp, 1.4, MAGIC, R, { bristles: 2, taper: 0.3, dry: 0.15 });
    for (let i = 0; i < 3; i++) dab(c, tx - 4 + i * 4, ty - 5 + (i % 2) * 2, 0.8, MAGIC, R);
  }
}
function mage(c, o) {
  const R = o.R, M = o.M, L = lookOf(o, C.skin);
  const robe = L.cl(o.col), dark = L.cl(tone(o.col, -0.2));
  const q = o.pose;
  if (isPart(q)) {
    if (q === 'r:robe') { for (const x of FEET.idle) mageFoot(c, R, M, L, x); mageRobe(c, R, M, L, robe, 0); }
    else if (q === 'r:head') mageHead(c, o, R, M, L);
    else if (q === 'r:hat') mageHat(c, R, M, L, robe, dark);
    else mageArms(c, o, R, M, L, q === 'r:arms' || o.dead ? 'idle' : q.slice(7));
    return;
  }
  const p = o.dead ? 'idle' : q;
  for (const x of FEET[p] || FEET.idle) mageFoot(c, R, M, L, x);
  mageRobe(c, R, M, L, robe, p === 'walk0' ? 1.3 : p === 'walk1' ? -1.1 : 0);
  mageArms(c, o, R, M, L, p);
  mageHead(c, o, R, M, L);
  mageHat(c, R, M, L, robe, dark);
}

// ---------- NECROMANCER ----------
// poses: idle, walk0/walk1, raise (u.subState === 1: the 1.2 s raise cast, OG signature = 1 - (timer - now) / 1.2,
// game.js:19311-19312). Lurking: OG draws it at 55% alpha while NOT in raise mode (u.role !== 1, game.js:20829): the
// entry's alpha(u) hook. Teleport puffs / raise glow rings / corpses standing up = RENDER fx.
// Risen (zombie necromancer): green face in the hood, arms reach forward, no staff.
// Parts (driver 'robe'): r:robe (+ feet), r:back (raise: the far arm up + magic, behind the hood), r:head (hood + face),
// r:arms (staff + arm; risen: reaching arms), r:arms:raise (staff up + both hands).
function necroFoot(c, R, M, x) { part(c, ring(x, -1, 2.1, 1.2, R, 0.1, 6), C.ink, M, { lw: 1 }); }
function necroRobe(c, R, M, robe, sw) {
  const hem = [[-4.2, -20], [4.4, -20.2], [6, -12], [8 + sw, -3.2], [6.6 + sw, -0.6], [4.6, -2.4], [2.6, -0.4], [0.6, -2.2], [-1.6, -0.4], [-3.6, -2.2], [-6 + sw, -0.6], [-7.6 + sw, -3.2], [-5.8, -12]];
  part(c, poly(hem, R, 0.2), robe, M, { sharp: true });
}
function necroBack(c, R, L) {   // raise: the far arm up, magic over both hands (behind the hood so the head stays clear)
  arm(c, R, [[-2, -17.4], [-4.6, -24], [-4.2, -30.6]]);
  for (const [x, y] of [[-4.4, -32], [8.8, -32.6]]) {
    const sp = []; for (let th = 0; th < 2.6 * Math.PI; th += 0.6) { const r = 0.8 + th * 0.5; sp.push([x + Math.cos(th) * r, y - 2.4 + Math.sin(th) * r * 0.9]); }
    brush(c, sp, 1.3, MAGIC, R, { bristles: 2, taper: 0.4, dry: 0.15 });
    dab(c, x + 2.6, y - 6.2, 0.8, GLOW, R); dab(c, x - 2.4, y - 4.4, 0.7, GLOW, R);
  }
  dab(c, -4.2, -30.8, 1.1, L.skin, R);
}
function necroHead(c, o, R, M, L, hood) {   // hood with a dark face hole and two glowing eyes
  part(c, poly([[-4.6, -17.6], [-6.4, -24.4], [-4.2, -29.6], [0.4, -31.6], [5, -29.4], [7, -24], [6.2, -18]], R, 0.3), hood, M);
  const face = ring(3, -23, 3.1, 3.7, R, 0.08, 8);
  if (L.zomb || L.bone) { part(c, face, L.skin, M, { lw: 1 }); eyes(c, R, 2, 4.4, -23.6, o, L, 0.85); }
  else {
    fill(c, face, L.burnt ? C.ink : '#120e14', R, { vary: 0.05, edge: 0 });
    if (o.dead) { xMark(c, R, 2, -23.6, 0.8, L.burnt ? C.charL : C.white); xMark(c, R, 4.3, -23.6, 0.8, L.burnt ? C.charL : C.white); }
    else { dab(c, 2, -23.6, 0.95, GLOW, R); dab(c, 4.4, -23.6, 1.0, GLOW, R); }
  }
}
function necroArms(c, o, R, M, L, up) {   // crooked staff with a little skull on top, in the front hand
  if (o.risen) { reach(c, R, L.skin); return; }
  const wood = L.acc(C.brown);
  const st = up ? [[6.2, -14], [8.4, -27], [9.6, -38.4], [11.6, -40.6]] : [[8.4, -0.4], [8.8, -14], [9.2, -26.4], [11.2, -28.4]];
  brush(c, st, 1.5, wood, R, { taper: 0.05, dry: 0.1, bristles: 3 });
  const [sx, sy] = up ? [9.4, -42] : [9, -30];
  part(c, ring(sx, sy, 2.4, 2.2, R, 0.08, 7), L.acc(BONE), M, { lw: 1 });
  dab(c, sx + 0.2, sy - 0.3, 0.55, C.ink, R); dab(c, sx + 1.4, sy - 0.3, 0.55, C.ink, R);
  if (up) { arm(c, R, [[2.4, -17.4], [6.6, -24], [8.6, -30.6]]); dab(c, 8.8, -30.8, 1.1, L.skin, R); }
  else { arm(c, R, [[2.4, -17.2], [6, -15.4], [8.6, -15]]); dab(c, 8.9, -15, 1.1, L.skin, R); }
}
function necro(c, o) {
  const R = o.R, M = o.M, L = lookOf(o, C.skin);
  const robe = L.cl(o.col), hood = L.cl(tone(o.col, 0.12));
  const q = o.pose;
  if (isPart(q)) {
    if (q === 'r:robe') { for (const x of FEET.idle) necroFoot(c, R, M, x); necroRobe(c, R, M, robe, 0); }
    else if (q === 'r:back') necroBack(c, R, L);
    else if (q === 'r:head') necroHead(c, o, R, M, L, hood);
    else necroArms(c, o, R, M, L, q === 'r:arms:raise' && !o.dead);
    return;
  }
  const p = o.dead ? 'idle' : q;
  for (const x of FEET[p] || FEET.idle) necroFoot(c, R, M, x);
  necroRobe(c, R, M, robe, p === 'walk0' ? 1.2 : p === 'walk1' ? -1 : 0);
  const up = p === 'raise' && !o.risen;
  if (up) necroBack(c, R, L);
  necroHead(c, o, R, M, L, hood);
  necroArms(c, o, R, M, L, up);
}

// ---------- SKELETON (a necromancer's raised dead) ----------
// OG skeletons are risen copies with u.skeleton === 1 drawn in bone colour (game.js:20828, colour game.js:14809) and the
// Zombie brain + bite. This entry is the bony PERSON, sized for a person (radius 9.5): RENDER scales it by
// u.radius / 9.5. poses: idle, walk0/walk1, atk (u.attack > 0: bite lunge, jaw dropped open). OG skeletons leave a dust
// puff and no corpse; 'dead' here is a pile of bones (lie: 'none') in case RENDER wants one.
// Team battle: a torn rag scarf in the team colour (no rag outside Team battle).
// Parts (driver 'bones'): r:leg, r:farm (far arm), r:body (pelvis, spine, ribs, rag), r:skull, r:jaw (hinged at the back
// of the skull: it chatters), r:arm (near arm). Every bone hangs on its own loose spring.
const SK_LEGS = {
  idle: [[[-1.6, -8], [-2.8, -4], [-2.2, -0.6]], [[1.6, -8], [2.6, -4], [3.6, -0.6]]],
  walk0: [[[-1.6, -8], [-4, -4], [-5, -0.6]], [[1.6, -8], [4, -4.4], [5.8, -0.6]]],
  walk1: [[[-1.4, -8], [-0.8, -4], [0.4, -0.6]], [[1.4, -8], [3.4, -4.2], [2, -1.4]]],
};
const SK_LEG = [[0, -8], [1, -4], [2, -0.6]];          // the leg part: the idle near leg with its hip at (0, -8)
const SK_HINGE = [-0.6, -20.8], SK_OPEN = 0.42;        // jaw hinge, jaw drop when biting
function skLook(o) {
  const burnt = o.dead === 'burnt';
  return { burnt, bone: burnt ? C.charL : BONE, ink: burnt ? C.char : C.ink, team: o.col && o.col !== C.white && o.col !== '#fffdf2' };
}
function bone2(c, R, pts, w, S) { brush(c, pts, w + 1.1, S.ink, R, { taper: 0.1, dry: 0.05, vary: 0.05, swell: 0, bristles: 3 }); brush(c, pts, w, S.bone, R, { taper: 0.1, dry: 0.1, vary: 0.06, swell: 0.05, bristles: 3 }); }
function skLeg(c, R, M, lg, S) { bone2(c, R, lg, 1.5, S); const f = lg[lg.length - 1]; part(c, ring(f[0] + 1, f[1] - 0.2, 1.6, 0.9, R, 0.1, 6), S.bone, M, { lw: 0.8 }); }
function skFarArm(c, R, S) {   // far arm behind the ribs, reaching forward (Zombie brain)
  bone2(c, R, [[0.4, -17.6], [5.6, -18.6], [10.8, -18.4]], 1.4, S);
  for (let k = -1; k <= 1; k++) brush(c, [[11.2, -18.4], [13.2, -18.4 + k * 1.1]], 0.6, S.ink, R, { bristles: 1, dry: 0 });
}
function skNearArm(c, R, S) {
  bone2(c, R, [[0.6, -14.6], [5.4, -13.8], [10.2, -13.2]], 1.4, S);
  for (let k = -1; k <= 1; k++) brush(c, [[10.6, -13.2], [12.6, -13.2 + k * 1.1]], 0.6, S.ink, R, { bristles: 1, dry: 0 });
}
function skBody(c, o, R, M, S) {   // pelvis, spine, ribcage (+ the team rag)
  part(c, ring(0, -8.6, 3.2, 1.8, R, 0.1, 7), S.bone, M, { lw: 1 });
  brush(c, [[0, -9.2], [0.2, -18]], 1.3, S.ink, R, { bristles: 2, dry: 0 });
  part(c, ring(0.4, -14.4, 4.2, 4, R, 0.08, 8), S.bone, M, { lw: 1.05 });
  if (!S.burnt) for (let i = 0; i < 3; i++) brush(c, [[-2.6, -16 + i * 1.9], [0.6, -15.4 + i * 1.9], [3.2, -16 + i * 1.9]], 0.5, C.ink, R, { bristles: 1, dry: 0, taper: 0 });
  if (S.team) { brush(c, [[-4, -18.6], [0.4, -17.2], [4.6, -18.8]], 2.8, o.col, R, { taper: 0.1, dry: 0.15, bristles: 4 }); brush(c, [[-3.4, -18.2], [-6.6, -14.6]], 2.4, o.col, R, { taper: 0.6, dry: 0.25, bristles: 3 }); }
}
function skSkull(c, R, M, S) {   // big white cranium, black eye holes; a dark mouth the jaw hides until it drops
  if (!S.burnt) fill(c, ring(3.4, -20.3, 2.3, 1.2, R, 0.1, 7), '#2a0d0a', R, { edge: 0 });
  part(c, ring(1.4, -24, 5.4, 4.7, R, 0.08, 8), S.bone, M, { lw: 1.3 });
  if (!S.burnt) { dab(c, 3.8, -24.4, 1.45, C.ink, R); dab(c, 0.1, -24.2, 1.15, C.ink, R); dab(c, 5.7, -22.3, 0.5, C.ink, R); }
}
function skJaw(c, R, M, S) {   // the lower jaw with a row of teeth
  part(c, poly([[-1.2, -21.4], [6.2, -21.6], [6.5, -19.6], [5.2, -18.3], [0.8, -18.4], [-1, -19.6]], R, 0.12), S.bone, M, { lw: 1.0 });
  if (!S.burnt) for (let i = 0; i < 4; i++) brush(c, [[1.6 + i * 1.3, -21.5], [1.6 + i * 1.3, -20.1]], 0.4, C.ink, R, { bristles: 1, dry: 0 });
}
function skeleton(c, o) {
  const R = o.R, M = o.M, S = skLook(o), p = o.pose;
  if (isPart(p)) {
    if (p === 'r:leg') skLeg(c, R, M, SK_LEG, S);
    else if (p === 'r:farm') skFarArm(c, R, S);
    else if (p === 'r:body') skBody(c, o, R, M, S);
    else if (p === 'r:skull') skSkull(c, R, M, S);
    else if (p === 'r:jaw') skJaw(c, R, M, S);
    else skNearArm(c, R, S);
    return;
  }
  if (o.dead) {
    const bone = S.bone, burnt = S.burnt;
    for (const [a, x, y, l] of [[0.3, -6, -2, 9], [-0.5, 3, -2.6, 8], [1.3, 0, -1.5, 7], [-1.1, -3, -3, 6]]) {
      const dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
      tube(c, [[x - dx, y - dy], [x + dx, y + dy]], 1.3, bone, R, 0.7);
      dab(c, x - dx, y - dy, 1.1, bone, R); dab(c, x + dx, y + dy, 1.1, bone, R);
    }
    part(c, ring(6.6, -4.6, 4.2, 3.8, R, 0.08, 8), bone, M, { lw: 1.3 });
    if (!burnt) { xMark(c, R, 5.6, -5, 0.8); xMark(c, R, 8.2, -5, 0.8); }
    return;
  }
  const atk = p === 'atk';
  c.save(); if (atk) { c.translate(1.4, 0); c.rotate(0.2); }
  for (const lg of SK_LEGS[atk ? 'walk0' : p] || SK_LEGS.idle) skLeg(c, R, M, lg, S);
  skFarArm(c, R, S);
  skBody(c, o, R, M, S);
  skSkull(c, R, M, S);
  if (atk) { c.save(); c.translate(SK_HINGE[0], SK_HINGE[1]); c.rotate(SK_OPEN); c.translate(-SK_HINGE[0], -SK_HINGE[1]); skJaw(c, R, M, S); c.restore(); }
  else skJaw(c, R, M, S);
  skNearArm(c, R, S);
  c.restore();
}

// ---------- SLIME ----------
// poses (split 0): idle, squash (just landed, or about to hop), hop (in the air).
//   hop:    now - u.b.hopStart < 0.32 and u.b.timer <= u.b.hopStart (OG game.js:19315). RENDER also lifts it by
//           4 * 0.9 * u.radius * p * (1 - p), p = (now - hopStart) / 0.32 (OG game.js:19462-19467).
//   squash: u.b.timer - now < 0.14 (about to take off) or within 0.16 s after landing (now - hopStart - 0.32 < 0.16).
//   idle:   otherwise.
// extra: the same three for each split size: pose + '_' + u.subState (1..3), painted chunkier so the small ones still
// read after RENDER scales them by u.radius / def.radius (0.71, 0.5, 0.35).
// Team battle: the whole jelly is the team colour (OG colours the whole unit). Risen (zombie slime): green jelly with
// zombie eyes and a team-coloured bow in Team battle. Dead: a flat puddle with X eyes (lie: 'none').
// Floppy body (driver 'jelly'): the pose's whole sprite squashes, stretches and shears like jelly on landings and hits;
// the hop itself stays the drawUnit lift. The dead puddle jiggles flat.
const SLIME_OWN = '#7ee0c8';
function slime(c, o) {
  const R = o.R, M = o.M, L = lookOf(o, SLIME_OWN);
  const [p0, sk] = o.pose.split('_'), k = +sk || 0;
  const team = o.col !== SLIME_OWN;
  let body = L.burnt ? C.char : L.zomb ? C.zskin : L.bone ? BONE : team ? tone(o.col, 0.2) : SLIME_OWN;
  const big = Math.pow(Math.SQRT2, k);                 // 1 / size factor
  const lw = 1.7 * Math.pow(big, 0.8), es = Math.pow(big, 0.45);
  if (o.dead) {
    const pts = ring(0, -2.4, 15.5, 4.4, R, 0.14, 11);
    part(c, pts, body, M, { lw });
    for (let i = 0; i < 4; i++) dab(c, -18 + i * 12 + R() * 3, -0.6 + R(), 1.3 + R(), body, R);
    xMark(c, R, 2.6, -3.2, es * 1.1, L.burnt ? C.charL : C.ink); xMark(c, R, 8, -3.2, es * 1.1, L.burnt ? C.charL : C.ink);
    return;
  }
  const p = p0 || 'idle';
  const [rx, ry] = p === 'squash' ? [16.2, 7.6] : p === 'hop' ? [11.6, 12.8] : [14, 9.8];
  const cy = -ry;
  let pts = ring(0, cy, rx, ry, R, 0.07, 12, R() * 0.3).map(([x, y]) => [x * (1 + 0.16 * (y - cy) / ry), y]); // a gumdrop: wide at the bottom
  if (p !== 'hop') pts = pts.map(([x, y]) => y > cy + ry * 0.55 ? [x, cy + ry * 0.62 + (y - cy - ry * 0.55) * 0.35] : [x, y]); // flat bottom on the ground
  part(c, pts, body, M, { lw, sp: 1.0 });
  // bubbles and a shine
  if (k < 2 && !L.burnt) { dab(c, -rx * 0.45, cy + ry * 0.25, 1.4, tone(body, 0.35), R); dab(c, -rx * 0.15, cy + ry * 0.5, 0.9, tone(body, 0.35), R); }
  if (!L.burnt) brush(c, [[-rx * 0.66, cy - ry * 0.05], [-rx * 0.5, cy - ry * 0.55], [-rx * 0.14, cy - ry * 0.78]], 1.5 * es, C.white, R, { bristles: 3, taper: 0.6, dry: 0.35 });
  if (p === 'hop' && !L.burnt) for (let i = 0; i < 2; i++) dab(c, -2 + i * 5, 2.4 + i * 1.6, 1.1 * es, body, R);
  // face on the front side
  const ex = rx * 0.22 - (es - 1) * 5, ey = cy - ry * 0.12;
  if (L.zomb) { dab(c, ex + 4.6 * es, ey - 0.4, 2.2 * es, C.white, R); dab(c, ex + 5.2 * es, ey - 0.2, 0.9 * es, C.ink, R); dab(c, ex, ey + 0.4, 1.0 * es, C.ink, R); }
  else if (L.bone) { dab(c, ex, ey, 1.4 * es, C.ink, R); dab(c, ex + 4.6 * es, ey, 1.6 * es, C.ink, R); }
  else {
    for (const [x, r] of [[ex, 2.5], [ex + 5.4 * es, 2.8]]) { dab(c, x, ey, r * es, C.white, R); dab(c, x + 0.8 * es, ey + 0.2, 1.2 * es, C.ink, R); }
  }
  const my = ey + 3.6 * Math.min(es, 1.3) + (p === 'squash' ? -0.8 : 0);
  brush(c, [[ex + 1, my], [ex + 2.9 * es, my + 1.2 * es], [ex + 5.2 * es, my]], 0.8 * es, C.ink, R, { bristles: 2, dry: 0, taper: 0 });
  if (L.zomb && team) {      // zombie slime in Team battle: a team-coloured bow on top
    const bx = -rx * 0.1, by = cy - ry * 0.95;
    part(c, poly([[bx, by], [bx - 4 * es, by - 2.6 * es], [bx - 4 * es, by + 2.4 * es]], R, 0.2), o.col, M, { sharp: true, lw: 1 });
    part(c, poly([[bx, by], [bx + 4 * es, by - 2.6 * es], [bx + 4 * es, by + 2.4 * es]], R, 0.2), o.col, M, { sharp: true, lw: 1 });
    dab(c, bx, by, 1.1 * es, tone(o.col, -0.2), R);
  }
}

// ---------- GIANT ----------
// Paint units, scale 1.3 (radius 20.9 sim px: a body about 2.2 people wide). The club is NOT in the body frames: the
// entry's drawUnit() puts a separate club sprite in its fist (turned per pose; dropped on the ground while it eats or
// rips up a tree, as OG drops it, shader giantBean), then returns false so RENDER draws the body as usual on top.
// pick() (first match wins):
//   eat      u.subState === 3 (EAT 1.3 s: both fists at its mouth; club dropped)
//   lift     u.subState === 2 (HOLD 0.7 s: the free arm hoists the victim overhead; the club stays in the other fist)
//   pull     u.subState === 8 (TREE_PULL 0.8 s: leaning back, both fists on the tree; club dropped)
//   stomp    u.subState === 5 (front foot up)       stomped  u.subState === 6 (foot down, ground cracks)
//   panic    u.subState === 4 (running from rats) or u.state === 5 (Flee): OG's scared mood
//   throw    u.firedAt > 0 and now - u.firedAt < 0.35 (follow-through, OG pose 1..2)
//   atk      u.attack > 0 (club smash, OG kick -4.5 twist 0.35)
//   windup   u.state === 2 (Engage), u.attack <= 0, u.cooldown < 0.3 (club heaved overhead, OG game.js:19348-19351)
//   walk0 / walk1 while moving, else idle;  + '_blind' on idle / walk0 / walk1 / windup / atk when u.blind === 1
//            (front eye shut on an arrow, OG giantBean "put out by an arrow").
// Club sprites (OG more.w = kindled + 2 role, game.js:21086): u.role 0 'club' (wooden); u.kindled 'club_fire' plus the
// unturned 'flames' sprite on its crown; u.role 1 'club_tree'; u.role 2 'club_char'. Fist = the sprite anchor.
// 'stand' = idle with the wooden club painted in: the toolbar icon, the corpse frame (dead: no club, X eyes, lie 'side').
// Risen (zombie / skeleton giant, OG body copy): no club, both arms reach forward; atk = the bite lunge.
// Parts (driver 'giant'): r:leg (one leg, turned per pose), r:legUp (stomp: the raised front leg), r:body, r:head /
// r:headO (mouth open) / r:headP (panic) / r:headB (blind), r:barm:<k> (back arm), r:farm:<k> (front arm, the club's),
// r:crack (stomped ground cracks), r:swoosh (the smash's motion lines, in the body's frame). The driver leaves the front arm's matrix in rig.club so drawUnit puts the club in the
// swinging fist (one frame late, which nobody sees); with no fresh rig data the club goes where the whole sprite has it.
const G_SCALE = 1.3;
const GPOSE = {
  //        lean   front arm [shoulder, elbow, fist]          back arm                                   club [fist x, y, angle] | 'drop', back arm over the body?
  idle:    [0,     [[5, -35], [9.6, -27.6], [12, -21]],        [[-5, -35], [-9, -27.4], [-10, -20.4]],    [12, -21, 1.15]],
  walk0:   [0,     [[5, -35], [9.6, -27.6], [12, -21]],        [[-5, -35], [-10.6, -29.6], [-13, -24.4]], [12, -21, 1.15]],
  walk1:   [0,     [[5, -35], [9.6, -27.6], [12, -21]],        [[-5, -35], [-7.4, -27], [-6.6, -20.4]],   [12, -21, 1.15]],
  windup:  [-0.08, [[5, -35], [5.4, -45], [1, -52.6]],         [[-5, -35], [-10.6, -30], [-13, -24]],     [1, -52.6, -2.62]],
  atk:     [0.12,  [[5, -35], [12, -32], [18.4, -27.4]],       [[-5, -35], [-11, -31.4], [-15, -27]],     [18.4, -27.4, 0.72]],
  lift:    [-0.04, [[5, -35], [9.6, -27.6], [12, -21]],        [[-4, -36], [-7, -48], [-2, -60]],         [12, -21, 1.15], true],
  throw:   [0.14,  [[5, -35], [9, -28], [11, -21]],            [[-2, -34], [9, -37.4], [21, -41]],        [11, -21, 1.25], true],
  eat:     [0.06,  [[5, -35], [14, -32.4], [12.6, -40.4]],     [[-3, -35], [6, -33], [9.4, -41.4]],       'drop', true],
  stomp:   [-0.05, [[5, -35], [12.6, -36], [18.6, -33]],       [[-5, -35], [-12, -36.6], [-18, -34]],     [18.6, -33, 1.55]],
  stomped: [0.06,  [[5, -35], [12.6, -33], [17.4, -28]],       [[-5, -35], [-11.6, -33.4], [-16.6, -30]], [17.4, -28, 1.2]],
  pull:    [-0.2,  [[5, -35], [12, -30.6], [19, -28.4]],       [[-5, -35], [5, -30], [16.4, -29.8]],      'drop'],
  panic:   [-0.03, [[5, -35], [11, -45], [13.6, -55]],         [[-5, -35], [-10.6, -45.4], [-9.6, -55.6]], [13.6, -55, -2.1]],
};
GPOSE.stand = GPOSE.idle;
const GLEGS = {
  idle:    [[[-4.6, -15], [-5.4, -7], [-6.4, -2.4]], [[4.6, -15], [5.6, -7], [6.6, -2.4]]],
  walk0:   [[[-4.6, -15], [-7.6, -8], [-10.6, -2.4]], [[4.6, -15], [8, -8.4], [10.6, -2.4]]],
  walk1:   [[[-4.6, -15], [-3.6, -7], [-2.4, -2.4]], [[4.6, -15], [6.6, -9.6], [4.6, -4.6]]],
  stomp:   [[[-4.6, -15], [-5.4, -7], [-6.4, -2.4]], [[4.6, -15], [11.6, -20], [12.6, -11.4]]],
  stomped: [[[-4.6, -15], [-6.6, -7], [-8, -2.4]], [[4.6, -15], [10, -8], [12.6, -2.4]]],
  pull:    [[[-4.6, -15], [-8, -7], [-11.6, -2.4]], [[4.6, -15], [8.6, -8], [11, -2.4]]],
  panic:   [[[-4.6, -15], [-7.6, -8], [-10.6, -2.4]], [[4.6, -15], [8, -8.4], [10.6, -2.4]]],
  throw:   [[[-4.6, -15], [-7.6, -8], [-10.6, -2.4]], [[4.6, -15], [8, -8.4], [10.6, -2.4]]],
  atk:     [[[-4.6, -15], [-7.6, -8], [-10.6, -2.4]], [[4.6, -15], [8, -8.4], [10.6, -2.4]]],
};
const G_BLIND = ['idle', 'walk0', 'walk1', 'windup', 'atk'];
const G_DROP = { eat: [9, -1.4, -0.05], pull: [-12, -1.4, Math.PI + 0.05] };
const G_BASE = Object.fromEntries(Object.keys(GPOSE).flatMap(p => [[p, p], [p + '_blind', p]]));
const G_ZOM = { fa: [[5, -35], [13, -36.4], [21, -36]], ba: [[-5, -35], [6, -30.6], [18.6, -29.4]] };
function giantPose(u, now, moving, wf) {
  const risen = !!(u.def && u.def.risenFrom);
  let p;
  if (risen) p = u.attack > 0 ? 'atk' : moving ? (wf ? 'walk1' : 'walk0') : 'idle';
  else {
    const s = u.subState;
    p = s === 3 ? 'eat' : s === 2 ? 'lift' : s === 8 ? 'pull' : s === 5 ? 'stomp' : s === 6 ? 'stomped' : s === 4 || u.state === 5 ? 'panic'
      : u.firedAt > 0 && now - u.firedAt < 0.35 ? 'throw' : u.attack > 0 ? 'atk'
      : u.state === 2 && u.cooldown < 0.3 ? 'windup' : moving ? (wf ? 'walk1' : 'walk0') : 'idle';
    if (u.blind === 1 && G_BLIND_OF[p]) p = G_BLIND_OF[p];
  }
  return p;
}
const G_BLIND_OF = Object.fromEntries(G_BLIND.map(p => [p, p + '_blind']));   // no string building per frame
function giantClubKind(u) { return u.kindled === 1 ? 'club_fire' : u.role === 1 ? 'club_tree' : u.role === 2 ? 'club_char' : 'club'; }
/** The club alone, fist at (0,0), pointing along +x. kind: 'club' | 'club_tree' | 'club_char' | 'club_fire'. */
function giantClub(c, o, M, x, y, ang, kind, flames = true) {
  const R = o.R, burnt = o.dead === 'burnt';
  c.save(); c.translate(x, y); c.rotate(ang);
  if (kind === 'club') {         // wooden club: thin handle, fat knobbly end
    part(c, poly([[-3, -1.3], [9, -2.2], [16, -3.6], [20.6, -4], [23, -1.8], [23, 1.8], [20.6, 4], [16, 3.6], [9, 2.2], [-3, 1.3]], R, 0.3), burnt ? C.char : C.brownL, M, { lw: 1.4, ang: 0 });
    if (!burnt) for (const [kx, ky] of [[17.4, -1.6], [20.4, 1.6], [13, 0.8]]) dab(c, kx, ky, 0.75, C.brown, R);
    c.restore(); return;
  }
  // a whole tree: roots at the fist, trunk, leafy (or charred) crown at the far end
  const trunk = kind === 'club_char' || burnt ? C.char : C.brown;
  for (const [a, l] of [[2.6, 4.6], [3.4, 4], [-2.8, 4.4]]) brush(c, [[-1.6, 0], [-1.6 + Math.cos(a) * l, Math.sin(a) * l]], 1.2, trunk, R, { bristles: 2, taper: 0.8, dry: 0.2 });
  tube(c, [[-2, 0], [10, 0.4], [21, -0.4]], 3.4, trunk, R, 1.2);
  if (kind === 'club_char') {
    for (const [a, l] of [[-0.6, 7], [0.5, 6.4], [-0.1, 8.4], [1.2, 4.8], [-1.3, 5.2]]) brush(c, [[20, 0], [20 + Math.cos(a) * l, Math.sin(a) * l]], 1.1, C.char, R, { bristles: 2, taper: 0.7, dry: 0.2 });
    for (let i = 0; i < 3; i++) dab(c, 23 + R() * 4, (R() - 0.5) * 7, 1.8, C.charL, R);
    c.restore(); return;
  }
  const crown = ring(26.4, 0, 7.8, 7, R, 0.12, 10);
  fill(c, shift(crown, M.mx, M.my, 0.4), burnt ? C.char : C.leaf, R, { vary: 0.14, sp: 1.0 });
  if (!burnt) for (let i = 0; i < 4; i++) { const a = R() * TAU, d = R() * 4, lx = 26.4 + Math.cos(a) * d, ly = Math.sin(a) * d * 0.8;
    brush(c, [[lx - 2, ly + 0.8], [lx - 0.8, ly - 1.6], [lx + 1.2, ly - 1.1], [lx + 2.6, ly + 0.5]], 1.1, kind === 'club_fire' ? (i % 2 ? C.char : '#b8862e') : i % 2 ? C.leafL : C.leafD, R, { bristles: 2, dry: 0.2 }); }
  outline(c, crown, R, 1.5);
  c.restore();
  if (kind === 'club_fire' && flames && !burnt) giantFlames(c, R, x + Math.cos(ang) * 26.4, y + Math.sin(ang) * 26.4);
}
/** Flames licking straight up off a burning club's crown at (x, y) (OG: up off the end, whatever the club's angle). */
function giantFlames(c, R, x, y) { flame(c, x - 2.6, y + 1, 16, R); flame(c, x + 3.6, y + 3, 12, R); flame(c, x - 6.4, y + 4, 9, R); }
// layer helpers (the whole giant and its parts)
const G_LEG = [[0, -15], [1, -7], [2, -2.4]];            // the leg part: the idle front leg with its hip at (0, -15)
function gLeg(c, R, M, L, lg, bx) { tube(c, lg, 5, L.skin, R, 1.4); part(c, ring(lg[2][0] + bx, lg[2][1] + 0.6, 4.2, 2.2, R, 0.1, 7), L.cl(C.brown), M, { lw: 1.3 }); }
function gBackArm(c, R, M, ba, skin) { tube(c, ba, 4, skin, R, 1.3); part(c, ring(ba[2][0], ba[2][1], 3, 2.8, R, 0.1, 7), skin, M, { lw: 1.3 }); }
function gFrontArm(c, R, M, fa, skin) { tube(c, fa, 4.2, skin, R, 1.3); part(c, ring(fa[2][0], fa[2][1], 3.2, 3, R, 0.1, 7), skin, M, { lw: 1.3 }); }
function gSwoosh(c, R) {
  for (let i = 0; i < 3; i++) {
    const a0 = -1.9 + i * 0.12, r = 20 + i * 4;
    brush(c, [[5 + Math.cos(a0) * r, -35 + Math.sin(a0) * r], [5 + Math.cos(a0 + 0.6) * r, -35 + Math.sin(a0 + 0.6) * r], [5 + Math.cos(a0 + 1.2) * r, -35 + Math.sin(a0 + 1.2) * r]], 0.8, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 });
  }
}
function gCrack(c, R, fx) {
  for (const a of [-2.6, -1.9, -1.2, -0.5]) brush(c, [[fx + Math.cos(a) * 5.6, 1 + Math.sin(a) * 3], [fx + Math.cos(a) * 9.4, 1 + Math.sin(a) * 5.4]], 1.1, C.ink, R, { bristles: 2, dry: 0.2 });
  for (let i = 0; i < 4; i++) dab(c, fx - 6 + i * 4 + R() * 2, 0.4 + R(), 1.3 + R() * 0.6, C.brownL, R);
}
function gBody(c, o, R, M, L, zomb) {   // a big tunic with a belt, a strap and a patch
  const body = ring(0, -27, 12.4, 13, R, 0.07, 11, R() * 0.3);
  part(c, zomb ? body.map(([x, y], i) => y > -20 ? [x + (i % 2 ? 1 : -0.8), y + (i % 2 ? 2 : -0.4)] : [x, y]) : body, L.cl(o.col), M, { lw: 1.8 });
  brush(c, [[-11.6, -19.8], [0, -18.4], [11.8, -20]], 2.2, L.cl(C.brown), R, { bristles: 3, dry: 0.15 });
  if (!L.burnt) { const pc = tone(o.col, -0.22); part(c, poly([[-6.6, -31], [-2.4, -31.4], [-2.2, -27], [-6.4, -26.8]], R, 0.3), pc, M, { lw: 1, sharp: true }); }
  brush(c, [[-3.4, -38.6], [2.6, -33], [9.6, -24]], 1.4, L.cl(tone(o.col, -0.3)), R, { bristles: 2, dry: 0.2 });
}
function gHead(c, o, R, M, L, zomb, open, scared, blind) {   // forward, hunched: tuft, ear, small eyes, big nose, mouth
  const hx = 4.6, hy = -44.6, skin = L.skin;
  part(c, ring(hx, hy, 7.2, 6.8, R, 0.08, 9), skin, M, { lw: 1.7 });
  part(c, ring(hx - 4.4, hy + 0.6, 1.8, 2.2, R, 0.1, 6), skin, M, { lw: 1.1 });
  if (!L.burnt) for (let i = 0; i < 3; i++) brush(c, [[hx - 3 + i * 2.2, hy - 6], [hx - 3.8 + i * 2.6, hy - 9.6]], 1.1, zomb ? C.ink : C.brown, R, { bristles: 2, dry: 0.1 });
  if (blind && !o.dead) {   // front eye shut round an arrow (OG: blinded by an arrow in the eye)
    dab(c, hx + 1.6, hy - 1.4, 0.75, C.ink, R);
    brush(c, [[hx + 3.4, hy - 1.2], [hx + 5.8, hy - 1.6]], 0.8, C.ink, R, { bristles: 2, dry: 0 });
    brush(c, [[hx + 4.6, hy - 1.4], [hx + 12, hy - 5.4]], 0.9, C.brownL, R, { bristles: 2, dry: 0, taper: 0 });
    for (const dy of [-1.6, 1.6]) brush(c, [[hx + 11, hy - 4.8], [hx + 13.4, hy - 5.4 + dy]], 1.1, C.red, R, { bristles: 2, dry: 0 });
  } else eyes(c, R, hx + 1.6, hx + 4.6, hy - 1.4, o, L, 1.05);
  if (!o.dead && !zomb) brush(c, scared ? [[hx + 0.6, hy - 4.6], [hx + 3, hy - 5.6], [hx + 6, hy - 4.8]] : [[hx + 0.8, hy - 4.2], [hx + 3.6, hy - 3.2], [hx + 6.4, hy - 3.8]], 1.0, C.ink, R, { bristles: 2, dry: 0 });
  if (!L.bone) part(c, ring(hx + 7.4, hy + 1, 2.4, 2.1, R, 0.1, 7), skin, M, { lw: 1.2 });
  if (open) { part(c, ring(hx + 3.6, hy + 4.4, 2.2, scared ? 2 : 1.7, R, 0.1, 7), '#7a1610', M, { lw: 1 }); dab(c, hx + 3.2, hy + 3.2, 0.6, C.white, R); }
  else if (L.bone) for (let i = 0; i < 4; i++) brush(c, [[hx + 1.6 + i * 1.4, hy + 3.6], [hx + 1.6 + i * 1.4, hy + 5.4]], 0.5, C.ink, R, { bristles: 1, dry: 0 });
  else { brush(c, [[hx + 1.6, hy + 4.4], [hx + 4, hy + 4.8], [hx + 6, hy + 4.2]], 0.8, C.ink, R, { bristles: 2, dry: 0 }); if (!L.burnt) dab(c, hx + 3.4, hy + 5.4, 0.65, C.white, R); }
  if (scared) {
    dab(c, hx - 3.6, hy - 6.6, 0.9, '#8cc9fa', R); dab(c, hx - 4.6, hy - 4.4, 0.7, '#8cc9fa', R);
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) brush(c, [[hx + sx * (9.4 + i * 2), hy - 2 + i * 3], [hx + sx * (10.4 + i * 2), hy + 1 + i * 3]], 0.8, C.ink, R, { bristles: 2, dry: 0.2 });
  }
}
function giantPart(c, o, R, M, L, q) {
  const zomb = !!o.risen && !o.dead;
  if (q === 'r:leg') gLeg(c, R, M, L, G_LEG, 1.6);
  else if (q === 'r:legUp') gLeg(c, R, M, L, GLEGS.stomp[1], 1.6);
  else if (q === 'r:body') gBody(c, o, R, M, L, zomb);
  else if (q === 'r:head') gHead(c, o, R, M, L, zomb, false, false, false);
  else if (q === 'r:headO') gHead(c, o, R, M, L, zomb, !o.dead, false, false);
  else if (q === 'r:headP') gHead(c, o, R, M, L, zomb, !o.dead, !o.dead, false);
  else if (q === 'r:headB') gHead(c, o, R, M, L, zomb, false, false, true);
  else if (q === 'r:crack') { if (!o.dead) gCrack(c, R, GLEGS.stomped[1][2][0] + 1.6); }
  else if (q === 'r:swoosh') { if (!o.dead) gSwoosh(c, R); }
  else {
    const k = q.slice(7);   // 'r:barm:' / 'r:farm:'
    if (q.charCodeAt(2) === 98) gBackArm(c, R, M, k === 'zom' ? G_ZOM.ba : GPOSE[k][2], L.skin);
    else gFrontArm(c, R, M, k === 'zom' ? G_ZOM.fa : GPOSE[k][1], L.skin);
  }
}
function giant(c, o) {
  const R = o.R, M = o.M, L = lookOf(o, GSKIN);
  if (isPart(o.pose)) { giantPart(c, o, R, M, L, o.pose); return; }
  if (o.pose.startsWith('club')) { giantClub(c, o, M, 0, 0, 0, o.pose, false); return; }
  if (o.pose === 'flames') { if (o.dead !== 'burnt') giantFlames(c, R, 0, 0); return; }
  let [pose, blind] = o.pose.split('_');
  if (o.dead) pose = 'stand';
  const zomb = !!o.risen && !o.dead;
  if (zomb && !['idle', 'walk0', 'walk1', 'atk'].includes(pose)) pose = 'idle';
  const G = GPOSE[pose] || GPOSE.idle, legs = GLEGS[pose] || GLEGS.idle;
  let lean = G[0], fa = G[1], ba = G[2], over = !!G[4];
  if (zomb) { lean = pose === 'atk' ? 0.14 : 0.04; fa = G_ZOM.fa; ba = G_ZOM.ba; over = true; }
  const skin = L.skin;
  c.save(); c.rotate(lean);
  if (pose === 'stomped') c.translate(0, 1.2);
  if (!over) gBackArm(c, R, M, ba, skin);
  gLeg(c, R, M, L, legs[0], 1.4); gLeg(c, R, M, L, legs[1], 1.6);
  gBody(c, o, R, M, L, zomb);
  const scared = pose === 'panic';
  gHead(c, o, R, M, L, zomb, pose === 'eat' || pose === 'lift' || scared || (zomb && pose === 'atk'), scared, !!blind);
  // 'stand' (icon / corpse frame) has its wooden club painted in; live frames get theirs from drawUnit
  if (pose === 'stand' && !o.dead) giantClub(c, o, M, fa[2][0], fa[2][1], G[3][2], 'club');
  if (over) gBackArm(c, R, M, ba, skin);
  gFrontArm(c, R, M, fa, skin);
  if (pose === 'atk' && !zomb && !o.dead) gSwoosh(c, R);
  if (pose === 'stomped' && !o.dead) gCrack(c, R, legs[1][2][0] + 1.6);
  c.restore();
}
// Floppy-body tables (driver 'giant', rig-myth.js): which arm / leg parts a pose uses and their rest angles.
const G_FKEY = { idle: 'idle', walk0: 'idle', walk1: 'idle', lift: 'idle', windup: 'windup', atk: 'atk', throw: 'throw', eat: 'eat', stomp: 'stomp', stomped: 'stomped', pull: 'pull', panic: 'panic' };
const G_BKEY = { idle: 'idle', walk0: 'idle', walk1: 'idle', windup: 'idle', atk: 'idle', stomped: 'idle', stomp: 'stomp', lift: 'lift', throw: 'throw', eat: 'eat', pull: 'pull', panic: 'panic' };
const G_FARMS = ['idle', 'windup', 'atk', 'throw', 'eat', 'stomp', 'stomped', 'pull', 'panic', 'zom'];
const G_BARMS = ['idle', 'stomp', 'lift', 'throw', 'eat', 'pull', 'panic', 'zom'];
const G_CODE = Object.fromEntries(Object.keys(GPOSE).map((p, i) => [p, i]));
const legTurn = lg => wrap(angOf(lg[0], lg[2]) - angOf(G_LEG[0], G_LEG[2]));   // turn of the leg part that lands its foot like lg
function giantParts(pose, zom) {
  if (pose.startsWith('club') || pose === 'flames') return null;
  const sp = pose.split('_');
  let p = sp[0] === 'stand' ? 'idle' : sp[0];
  if (!GPOSE[p]) return null;
  if (zom && !['idle', 'walk0', 'walk1', 'atk'].includes(p)) p = 'idle';
  const G = GPOSE[p], legs = GLEGS[p] || GLEGS.idle, walk = p === 'walk0' || p === 'walk1';
  const ba = zom ? G_ZOM.ba : G[2], fa = zom ? G_ZOM.fa : G[1], bk = zom ? 'zom' : G_BKEY[p];
  const brot = zom || bk !== 'idle' || walk ? 0 : wrap(angOf(ba[0], ba[2]) - angOf(GPOSE.idle[2][0], GPOSE.idle[2][2]));
  const head = zom ? (p === 'atk' ? 'r:headO' : 'r:head') : sp[1] === 'blind' ? 'r:headB' : p === 'panic' ? 'r:headP' : p === 'eat' || p === 'lift' ? 'r:headO' : 'r:head';
  return {
    leg: 'r:leg', legUp: p === 'stomp' && !zom ? 'r:legUp' : null, body: 'r:body', head,
    barm: 'r:barm:' + bk, farm: 'r:farm:' + (zom ? 'zom' : G_FKEY[p]), crack: p === 'stomped' && !zom ? 'r:crack' : null, sw: p === 'atk' && !zom ? 'r:swoosh' : null,
    over: zom || G[4] ? 1 : 0, lean: zom ? (p === 'atk' ? 0.14 : 0.04) : G[0], bob: p === 'stomped' ? 1.2 : 0,
    legN: walk ? 0 : legTurn(legs[1]), legF: walk ? legTurn(GLEGS.idle[0]) : legTurn(legs[0]), brot,
    fdir: angOf(fa[0], fa[2]), bdir: angOf(ba[0], ba[2]) , code: G_CODE[p] + (zom ? 32 : 0), zom: zom ? 1 : 0, atk: p === 'atk' ? 1 : 0,
  };
}
// drawUnit: the club (and its flames) behind the body, in the fist of the pose RENDER is about to draw. api.put draws at
// size factor m without the entry scale (index.js api.put), so the giant's sizes go in as k * G_SCALE.
const G_CLUB_N = 1024, G_CLUB = new Float64Array(G_CLUB_N * 8).fill(-1);   // [id, now, a b c d e f] of the front arm, by id & 1023
function giantDraw(ctx, u, x, y, flip, k, t, api) {
  if (u.def && u.def.risenFrom) return false;
  const moving = (u.vx * u.vx + u.vy * u.vy) > 49 && !(u.stun > 0.3);
  const pose = G_BASE[giantPose(u, api.now, moving, 0)];
  const G = GPOSE[pose] || GPOSE.idle, kind = giantClubKind(u), ks = k * G_SCALE;
  let fx, fy, a;
  if (G[3] === 'drop') { const d = G_DROP[pose]; fx = d[0]; fy = d[1]; a = d[2]; }
  else {
    let px = G[3][0], qy = G[3][1], aa = G[3][2];
    if (kind !== 'club' && aa > 0.5 && aa < 1.6) aa -= 0.3;   // long tree clubs: carried a bit more forward
    const o = (u.id & (G_CLUB_N - 1)) * 8;
    if (G_CLUB[o] === u.id && Math.abs(G_CLUB[o + 1] - api.now) < 0.25) {   // floppy body: the fist where the rig's arm is
      fx = G_CLUB[o + 2] * px + G_CLUB[o + 4] * qy + G_CLUB[o + 6]; fy = G_CLUB[o + 3] * px + G_CLUB[o + 5] * qy + G_CLUB[o + 7];
      a = aa + Math.atan2(G_CLUB[o + 3], G_CLUB[o + 2]);
    } else {
      const lean = G[0], cs = Math.cos(lean), sn = Math.sin(lean);
      if (pose === 'stomped') qy += 1.2;
      fx = px * cs - qy * sn; fy = px * sn + qy * cs; a = aa + lean;
    }
  }
  const club = api.get('giant', kind, 0);
  if (club) api.put(club, x + flip * fx * ks, y + fy * ks, flip, ks, a * flip);
  if (kind === 'club_fire') {
    const fl = api.get('giant', 'flames', 0);
    if (fl) api.put(fl, x + flip * (fx + Math.cos(a) * 26.4) * ks, y + (fy + Math.sin(a) * 26.4) * ks, flip, ks, 0);
  }
  return false;
}

// ---------- DRAGON (kid-a dragon, parametric) ----------
// Paint units: kid-a's dragon, scale 1.3 (its body ellipse = radius 20.9 sim px). flying: true -> RENDER raises it by
// u.z with a ground shadow. Poses (OG dragon pose: wings / flap / jaws / tail / head, game.js:1658-1688):
//   fly0 / fly1  u.subState 4 TAKEOFF, 5 FLYING, 6 LANDING (wings out, flapping): alternate about 5 Hz (kid-a t * 5)
//   breath       u.subState === 1 (2 s fire breath: jaws wide, head aimed; the flames are projectiles RENDER draws)
//   tail         u.subState === 2 (0.9 s tail swipe at the units behind it)
//   roar         u.subState === 3 (1.3 s roar: head up, jaws wide, wings half open)
//   atk          u.attack > 0 on the ground (bite)
//   walk0/walk1  moving, idle otherwise (wings folded)
// Dead: on its back, legs up, X eye (lie: 'none'). It never burns (flammability 0) but 'burnt' paints charcoal anyway.
// Parts (driver 'dragon'): r:wingB:<fold|half> / r:wingF:<fold|half> (flapped by the rig in flight), the tail in 3
// segments (r:tailK0-2 their ink, under r:tail0-2 their paint, so the joints don't show), r:swoosh (tail swipe lines),
// r:leg / r:legT (tucked), r:body, r:neck (stretched + turned to each pose's head), r:head / r:headA (bite) / r:headF
// (fire breath) / r:headR (roar). Dead, the same names paint the belly-up dragon's pieces (legs kick, then go still).
const DPOSE = {
  //       wings    legs     head [x, y, rot]       jaws  tail
  idle:   ['fold', 'stand', [21.6, -33, 0],       0,    0],
  walk0:  ['fold', 'walk0', [22.2, -32.4, 0.04],  0,    0],
  walk1:  ['fold', 'walk1', [21.4, -33.4, -0.03], 0,    0],
  atk:    ['fold', 'walk0', [27, -25.4, 0.32],    1,    0],
  breath: ['half', 'stand', [31, -27.6, 0.12],    1.25, 0],   // neck stretched: mouth near OG's (2.7 R ahead, 1.6 R up)
  roar:   ['half', 'stand', [19.4, -38.4, -0.42], 1.3,  0],
  tail:   ['half', 'walk1', [21, -32, 0.1],       0,    1],
  fly0:   ['up',   'tuck',  [22.6, -32, -0.06],   0,    0],
  fly1:   ['down', 'tuck',  [22.6, -31, 0],       0,    0],
};
const D_LG = { stand: [[-7, -5.6], [8, -5.4]], walk0: [[-10.4, -5.6], [11, -5.8]], walk1: [[-4.4, -5.4], [5.4, -6.8]], tuck: [[-9, -9.4], [5, -9.6]] };
const D_TAIL = [[-12, -14], [-21, -10.5], [-29.5, -13], [-33, -20]];
const D_TAIL_SW = [[-12, -14], [-22, -17], [-29, -27], [-25.6, -37]];
const D_TAIL_DEAD = [[-12, -6], [-22, -2.6], [-31, -3.4], [-36, -1.6]];
const D_HEAD = DPOSE.idle[2];
function dragonWing(c, R, M, dx, mode, col, rib, dark) {
  const T = { up: [[-22, -56], [-8, -63], [7, -53]], down: [[-27, -40], [-15, -51], [0, -48]],
    half: [[-25, -45], [-13, -55], [3, -47]], fold: [[-19, -34], [-11, -42.6], [0, -38.6]] }[mode];
  const tips = T.map(([x, y]) => [x + dx, y]), base = [[-3 + dx, -24], [6 + dx, -25]];
  const pts = [base[1], tips[2], [lerp(tips[2][0], tips[1][0], 0.5) - 1, lerp(tips[2][1], tips[1][1], 0.5) + 5.6 * (mode === 'fold' ? 0.5 : 1)], tips[1],
    [lerp(tips[1][0], tips[0][0], 0.5) + 1.5, lerp(tips[1][1], tips[0][1], 0.5) + 6 * (mode === 'fold' ? 0.5 : 1)], tips[0], [(mode === 'fold' ? -11 : -14) + dx, mode === 'fold' ? -27 : -30], base[0]];
  fill(c, shift(pts, M.mx, M.my, 0.6), col, R, { sharp: true, vary: 0.12 });
  for (const tp of tips) brush(c, [[1 + dx, -25], [lerp(1 + dx, tp[0], 0.55) + 1, lerp(-25, tp[1], 0.55) - 1.5], tp], 1.3, dark ? C.ink : rib, R, { bristles: 2, taper: 0.5, dry: 0.15 });
  outline(c, pts, R, 1.5, { jit: 0.4 });
}
/** mood: '' | 'atk' | 'breath' (fire in the mouth) | 'roar' (frown); jaws = how far the lower jaw drops. */
function dragonHead(c, R, M, hx, hy, rot, jaws, col, o, L, mood) {
  c.save(); c.translate(hx, hy); c.rotate(rot);
  const belly = L.acc(C.yellow);
  if (jaws > 0) {      // lower jaw hinged down, red mouth, teeth
    c.save(); c.translate(1.6, 2); c.rotate(0.3 * jaws);
    part(c, ring(5.4, 1.4, 5.2, 2.2, R, 0.08, 7), col, M, { lw: 1.3 });
    for (let i = 0; i < 3; i++) brush(c, [[4 + i * 2, -0.4], [4.4 + i * 2, -1.8]], 0.7, C.white, R, { bristles: 1, dry: 0 });
    c.restore();
    fill(c, ring(6.4, 3.4, 4.2, 1.6 + jaws * 1.2, R, 0.1, 7), '#7a1610', R, { edge: 0 });
    if (mood === 'breath' && !L.burnt) { dab(c, 9.4, 3.6, 2.2, C.fireO, R); dab(c, 9.8, 3.6, 1.2, C.fireY, R); }
  }
  part(c, ring(0, 0, 6.8, 5.2, R, 0.07, 8), col, M, { lw: 1.6 });
  c.save(); if (jaws > 0) { c.translate(2.4, 0); c.rotate(-0.22 * jaws); c.translate(-2.4, 0); }
  part(c, ring(6, 1.8, 4.6, 3.3, R, 0.08, 7), col, M, { lw: 1.4 });
  dab(c, 9, 0.6, 0.6, C.ink, R);
  if (jaws <= 0) { brush(c, [[3.2, 3.4], [6.4, 3.6], [10, 3]], 0.8, C.ink, R, { bristles: 2, dry: 0 });
    for (let i = 0; i < 3; i++) brush(c, [[4 + i * 2, 3.4], [4.8 + i * 2, 4.8]], 0.7, C.white, R, { bristles: 1, dry: 0 }); }
  else for (let i = 0; i < 3; i++) brush(c, [[4 + i * 2, 4.4], [4.6 + i * 2, 5.8]], 0.7, C.white, R, { bristles: 1, dry: 0 });
  c.restore();
  part(c, poly([[-3.4, -4], [-5.4, -9.6], [-0.8, -5]], R, 0.2), belly, M, { sharp: true, lw: 1 });
  part(c, poly([[0.4, -5.2], [0.8, -11], [3.2, -4.8]], R, 0.2), belly, M, { sharp: true, lw: 1 });
  if (o.dead) xMark(c, R, 1, -1.6, 1.1);
  else { dab(c, 0.8, -1.6, 1.9, C.white, R); dab(c, 1.6, -1.4, 0.85, C.ink, R); if (mood) brush(c, [[-1.2, -4.2], [1.4, -3.4], [3.2, -3.8]], 0.8, C.ink, R, { bristles: 2, dry: 0 }); }
  c.restore();
}
function dRoar(c, R, hx, hy) { for (let i = 0; i < 3; i++) { const a = -1.1 + i * 0.42; brush(c, [[hx + 10 + Math.cos(a) * 4, hy - 2 + Math.sin(a) * 4], [hx + 10 + Math.cos(a) * 9, hy - 2 + Math.sin(a) * 9]], 1.0, C.ink, R, { bristles: 2, dry: 0.2 }); } }
/** Tail segment k (0..2) of a 4-point tail: layer 0 = its ink, 1 = its paint (+ the spiky tip on the last one). The
 *  segments overlap a little and every ink goes under every paint, so the joints never show. */
function dTailSeg(c, R, M, pts, k, w, lw, col, layer, tip) {
  const S = spline(pts, false, 7), n = S.length - 1;
  const seg = S.slice(Math.max(0, k * 7 - 2), Math.min(n, (k + 1) * 7 + (k < 2 ? 2 : 0)) + 1);
  if (layer === 0) brush(c, seg, w + lw * 2, C.ink, R, { taper: 0, dry: 0, vary: 0.05, swell: 0, per: 1 });
  else { brush(c, seg, w, col, R, { taper: 0, dry: k === 2 ? 0.15 : 0, vary: 0.1, swell: 0, per: 1 }); if (k === 2 && tip) tip(); }
}
function dTip(c, R, M, pts, yel) {
  const te = pts[3], tp = pts[2], ta = Math.atan2(te[1] - tp[1], te[0] - tp[0]);
  const tip = [[te[0] + Math.cos(ta + 1.2) * 3.2, te[1] + Math.sin(ta + 1.2) * 3.2], [te[0] + Math.cos(ta) * 6.6, te[1] + Math.sin(ta) * 6.6], [te[0] + Math.cos(ta - 1.2) * 3.2, te[1] + Math.sin(ta - 1.2) * 3.2]];
  part(c, poly(tip, R, 0.3), yel, M, { sharp: true, lw: 1.2 });
}
function dSwoosh(c, R) { for (let i = 0; i < 3; i++) { const r = 14 + i * 3.4; brush(c, [[-20 - r * 0.2, -40 - i * 2], [-30 - r * 0.4, -30 - i], [-34 - r * 0.4, -16 + i]], 0.8, C.ink, R, { bristles: 2, dry: 0.5, taper: 0.8 }); } }
function dLeg(c, R, M, col, x, y, fly) {
  part(c, ring(x, y, fly ? 2.6 : 3.2, fly ? 3.4 : 4.8, R, 0.08, 7, fly ? 0.6 : 0), col, M);
  if (!fly) for (let i = 0; i < 3; i++) brush(c, [[x - 2 + i * 2, y + 4], [x - 1.6 + i * 2.2, y + 6.2]], 0.7, C.ink, R, { bristles: 2, dry: 0 });
}
function dBody(c, R, M, L, col, yel) {   // back spikes, body, belly
  for (const [sx, sy] of [[-11.6, -22.6], [-5, -25.6], [1.6, -26], [8, -24.6]]) part(c, poly([[sx - 2.6, sy + 2.4], [sx + 0.2, sy - 3.6], [sx + 2.8, sy + 2.2]], R, 0.25), yel, M, { sharp: true, lw: 1.1 });
  part(c, ring(0, -15.6, 15.4, 9.6, R, 0.07, 10, 0.1), col, M, { lw: 1.7 });
  brush(c, [[-11.4, -10.6], [-3, -8.2], [6, -8.8], [12, -12.6]], 4.2, yel, R, { taper: 0.4, dry: 0.25, bristles: 6 });
  if (!L.burnt) for (let i = 0; i < 4; i++) brush(c, [[-8 + i * 5, -11.2], [-7.4 + i * 5, -7.4]], 0.7, C.orange, R, { bristles: 2, dry: 0 });
}
function dNeck(c, R, col, hx, hy) { tube(c, [[9, -19], [lerp(9, hx - 2.6, 0.55) + 1.2, lerp(-19, hy + 2, 0.55) - 1], [hx - 2.6, hy + 2]], 6.4, col, R, 1.4); }
// the dead dragon's pieces (belly up)
const D_DEAD_WING = [[-4, -6], [-30, -3], [-24, -10], [-18, -6.6], [-12, -14], [-6, -9]];
const D_DEAD_LEGS = [[-10.4, -0.45], [9.6, 0.4], [-4.2, -0.15], [3.4, 0.18]];   // [x, turn] of each stiff leg in the air
function ddWing(c, R, M, wing) { fill(c, shift(D_DEAD_WING, M.mx, M.my, 0.5), wing, R, { sharp: true, vary: 0.12 }); outline(c, D_DEAD_WING, R, 1.4, { jit: 0.4 }); }
function ddTip(c, R, M, yel) { part(c, poly([[-35, 0.4], [-41, -1.4], [-36, -4.6]], R, 0.3), yel, M, { sharp: true, lw: 1.1 }); }
function ddLeg(c, R, col) {   // one stiff leg in the air, hip at (0, -12)
  tube(c, [[0, -12], [0.2, -19], [0, -24.6]], 3.2, col, R, 1.3);
  for (let i = 0; i < 3; i++) brush(c, [[-1.6 + i * 1.6, -25.6], [-2 + i * 2, -27.6]], 0.75, C.ink, R, { bristles: 2, dry: 0 });
}
function ddBody(c, R, M, col, yel) { part(c, ring(0, -8.4, 15.2, 7.4, R, 0.07, 10), col, M, { lw: 1.7 }); brush(c, [[-11.4, -12.4], [-3, -14.6], [6, -14.2], [12, -11]], 4, yel, R, { taper: 0.4, dry: 0.25, bristles: 6 }); }
function ddNeck(c, R, col) { tube(c, [[11, -8], [18, -5], [23, -4]], 5.4, col, R, 1.4); }
function ddHead(c, R, M, col, yel) {   // on its side, tongue out
  c.save(); c.translate(27, -4.6); c.rotate(0.12);
  brush(c, [[8, 2.6], [11, 4.4], [12.6, 3]], 1.3, '#e8506a', R, { bristles: 2, dry: 0, taper: 0.3 });
  part(c, ring(0, 0, 6.4, 4.6, R, 0.07, 8), col, M, { lw: 1.5 });
  part(c, ring(5.6, 1.4, 4.2, 2.8, R, 0.08, 7), col, M, { lw: 1.3 });
  part(c, poly([[-3.4, -3.4], [-6.6, -6.6], [-1, -4.6]], R, 0.2), yel, M, { sharp: true, lw: 1 });
  xMark(c, R, 0.8, -1.2, 1.1);
  c.restore();
}
function dragonPart(c, o, R, M, L, q, col, wing, rib, yel) {
  const t = q.charCodeAt(2);   // r:w.. wing, r:t.. tail, r:l.. leg, r:b.. body, r:n.. neck, r:h.. head, r:s.. swoosh
  if (o.dead) {
    if (t === 119) ddWing(c, R, M, wing);
    else if (t === 116) { const k = +q[q.length - 1], ink = q.charCodeAt(6) === 75; dTailSeg(c, R, M, D_TAIL_DEAD, k, 4.6, 1.4, col, ink ? 0 : 1, () => ddTip(c, R, M, yel)); }
    else if (t === 108) ddLeg(c, R, col);
    else if (t === 98) ddBody(c, R, M, col, yel);
    else if (t === 110) ddNeck(c, R, col);
    else if (t === 104) ddHead(c, R, M, col, yel);
    return;
  }
  if (t === 119) { const back = q.charCodeAt(6) === 66, mode = q.slice(8); dragonWing(c, R, M, back ? 4 : -1, mode, back ? tone(wing, -0.25) : wing, rib, back); }
  else if (t === 116) { const k = +q[q.length - 1], ink = q.charCodeAt(6) === 75; dTailSeg(c, R, M, D_TAIL, k, 5.2, 1.4, col, ink ? 0 : 1, () => dTip(c, R, M, D_TAIL, yel)); }
  else if (t === 115) dSwoosh(c, R);
  else if (t === 108) dLeg(c, R, M, col, 0, q === 'r:legT' ? -9.4 : -5.6, q === 'r:legT');
  else if (t === 98) dBody(c, R, M, L, col, yel);
  else if (t === 110) dNeck(c, R, col, D_HEAD[0], D_HEAD[1]);
  else if (t === 104) {
    const v = q === 'r:headA' ? 'atk' : q === 'r:headF' ? 'breath' : q === 'r:headR' ? 'roar' : '';
    dragonHead(c, R, M, D_HEAD[0], D_HEAD[1], 0, v ? DPOSE[v][3] : 0, col, o, L, v);
    if (v === 'roar' && !L.burnt) dRoar(c, R, D_HEAD[0], D_HEAD[1]);
  }
}
function dragon(c, o) {
  const R = o.R, M = o.M, L = lookOf(o, o.col);
  const col = L.cl(o.col), wing = L.burnt ? C.char : tone(o.col, -0.28), rib = L.acc(C.orange), yel = L.acc(C.yellow);
  if (isPart(o.pose)) { dragonPart(c, o, R, M, L, o.pose, col, wing, rib, yel); return; }
  if (o.dead) { deadDragon(c, o, col, wing, yel); return; }
  const P = DPOSE[o.pose] || DPOSE.idle, [wm, lm, hd, jaws, tl] = P;
  const fly = lm === 'tuck';
  c.save(); if (fly) { c.translate(0, -4); c.rotate(-0.06); }
  dragonWing(c, R, M, 4, wm, tone(wing, -0.25), rib, true);
  // tail with spikes (swipe: whipped up high with swoosh lines)
  const tail = tl ? D_TAIL_SW : D_TAIL;
  for (let k = 0; k < 3; k++) dTailSeg(c, R, M, tail, k, 5.2, 1.4, col, 0);
  for (let k = 0; k < 3; k++) dTailSeg(c, R, M, tail, k, 5.2, 1.4, col, 1, () => dTip(c, R, M, tail, yel));
  if (tl) dSwoosh(c, R);
  // legs (back one first), body between them
  const LG = D_LG[lm];
  dLeg(c, R, M, col, LG[0][0], LG[0][1], fly);
  dBody(c, R, M, L, col, yel);
  dLeg(c, R, M, col, LG[1][0], LG[1][1], fly);
  // neck + head
  const [hx, hy, hr] = hd, mood = o.pose === 'atk' || o.pose === 'breath' || o.pose === 'roar' ? o.pose : '';
  dNeck(c, R, col, hx, hy);
  dragonHead(c, R, M, hx, hy, hr, jaws, col, o, L, mood);
  if (o.pose === 'roar' && !L.burnt) dRoar(c, R, hx, hy);
  dragonWing(c, R, M, -1, wm, wing, rib, false);
  c.restore();
}
function deadDragon(c, o, col, wing, yel) {
  const R = o.R, M = o.M;
  ddWing(c, R, M, wing);   // a wing flopped flat on the ground behind it
  for (let k = 0; k < 3; k++) dTailSeg(c, R, M, D_TAIL_DEAD, k, 4.6, 1.4, col, 0);
  for (let k = 0; k < 3; k++) dTailSeg(c, R, M, D_TAIL_DEAD, k, 4.6, 1.4, col, 1, () => ddTip(c, R, M, yel));
  for (const [lx, a] of D_DEAD_LEGS) {   // on its back: belly up, four stiff legs in the air
    c.save(); c.translate(lx, -12); c.rotate(a); c.translate(0, 12); ddLeg(c, R, col); c.restore();
  }
  ddBody(c, R, M, col, yel);
  ddNeck(c, R, col);   // neck flopped to the ground, head on its side, tongue out
  ddHead(c, R, M, col, yel);
}
// Floppy-body numbers per pose (driver 'dragon'): the neck part (painted to the idle head) is turned + stretched about
// its base to reach each pose's head; the tail chain bends to the swipe; wings fold / half open / flap.
const D_NB = [9, -19], D_NE = [D_HEAD[0] - 2.6, D_HEAD[1] + 2];
const D_TAILSW = (() => {   // chain turns (each relative to its parent) that lay the rest tail along the swipe
  const d = k => wrap(angOf(D_TAIL_SW[k], D_TAIL_SW[k + 1]) - angOf(D_TAIL[k], D_TAIL[k + 1]));
  return [d(0), wrap(d(1) - d(0)), wrap(d(2) - d(1))];
})();
function dragonParts(pose) {
  const P = DPOSE[pose];
  if (!P) return null;
  const [wm, lm, hd, jaws, tl] = P, fold = wm === 'fold', fly = lm === 'tuck';
  const E = [hd[0] - 2.6, hd[1] + 2];
  const v = pose === 'atk' ? 'r:headA' : pose === 'breath' ? 'r:headF' : pose === 'roar' ? 'r:headR' : 'r:head';
  return {
    wingB: fold ? 'r:wingB:fold' : 'r:wingB:half', wingF: fold ? 'r:wingF:fold' : 'r:wingF:half',
    tk0: 'r:tailK0', tk1: 'r:tailK1', tk2: 'r:tailK2', t0: 'r:tail0', t1: 'r:tail1', t2: 'r:tail2', sw: tl ? 'r:swoosh' : null,
    leg: 'r:leg', legT: 'r:legT', body: 'r:body', neck: 'r:neck', head: v,
    wm: fly ? 2 : fold ? 0 : 1, fly: fly ? 1 : 0, walk: lm === 'stand' ? 0 : 1, jaws,
    nA: wrap(angOf(D_NB, E) - angOf(D_NB, D_NE)), nS: Math.hypot(E[0] - D_NB[0], E[1] - D_NB[1]) / Math.hypot(D_NE[0] - D_NB[0], D_NE[1] - D_NB[1]) - 1, hR: hd[2],
    tA0: tl ? D_TAILSW[0] : 0, tA1: tl ? D_TAILSW[1] : 0, tA2: tl ? D_TAILSW[2] : 0, tail: tl, code: Object.keys(DPOSE).indexOf(pose),
  };
}

// ---------- TREE (kid-a treeSprite) ----------
// Prop. poses: idle / idle1 / idle2 = crown shape picked by u.wander (OG uses wander for the crown's side offset,
// game.js:21071): ['idle', 'idle1', 'idle2'][u.wander * 3 | 0].
// extra: burn0 = burning, first half (1 - u.burning / u.b.burnTotal < 0.5: leaves scorched), burn1 = burning, second
// half (crown mostly charcoal), singed = burnt out (u.singed === 1 and u.burning <= 0: charcoal, bare). The fire on a
// burning tree is RENDER's fire fx (OG writeBurning, 1.55 x height). Dead: the tree (lie: 'side' = it falls over; OG
// plays TreeFall + 3 dust puffs and keeps no corpse). Ripped up by a giant: it becomes the giant's '_tree' club.
// Floppy body: 'wobble' (rig.js): sways a little in the breeze, shakes when hit.
function tree(c, o) {
  if (paintThemedTree(c, o)) return;   // STEP7 GROUND-ART: palm / snowy pine / cactus / dead tree / willow poses (maps-art.js)
  const R = o.R, M = o.M, burnt = o.dead === 'burnt';
  const p = burnt ? 'singed' : o.pose;
  const v = p === 'idle1' ? 1 : p === 'idle2' ? 2 : 0;
  const ox = [0, -2.2, 2.4][v];
  const bark = p === 'singed' || p === 'burn1' ? C.char : C.brown;
  tube(c, [[0, 0], [0.8, -10], [0.2 + ox * 0.4, -21]], 3.6, bark, R, 1.3);
  brush(c, v === 1 ? [[0.4, -11], [-4.4, -15.6]] : [[0.6, -12], [5, -16.6]], 1.6, bark, R, { bristles: 2, dry: 0.2 });
  if (p === 'singed') {       // burnt out: bare charcoal branches
    brush(c, [[0.2, -20], [0.6 + ox * 0.3, -28], [0.4 + ox * 0.5, -36]], 2.2, C.char, R, { bristles: 3, taper: 0.7, dry: 0.15 });
    for (const [x0, y0, a, l] of [[0.3, -20, -2.1, 11], [0.4, -17, -0.6, 11], [0.2, -15, -2.7, 9], [0.6, -26, -1.0, 9], [0.4, -28, -2.2, 8]]) {
      const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l;
      brush(c, [[x0, y0], [x1, y1]], 1.5, C.char, R, { bristles: 2, taper: 0.7, dry: 0.2 });
      brush(c, [[lerp(x0, x1, 0.6), lerp(y0, y1, 0.6)], [x1 + Math.cos(a + 0.8) * 3, y1 + Math.sin(a + 0.8) * 3]], 0.9, C.char, R, { bristles: 2, taper: 0.7, dry: 0.2 });
    }
    for (let i = 0; i < 3; i++) dab(c, -7 + i * 7 + R() * 2, -30 + R() * 8, 1.5, C.charL, R);
    return;
  }
  const crown = v === 1 ? ring(ox, -32, 10.6, 14.2, R, 0.1, 11) : v === 2 ? ring(ox, -29.4, 14.2, 11, R, 0.12, 11) : ring(0, -30, 13.4, 12.2, R, 0.1, 11);
  const leaf = p === 'burn1' ? C.char : C.leaf;
  fill(c, shift(crown, M.mx, M.my, 0.5), leaf, R, { vary: 0.14, sp: 1.1 });
  const cy = v === 1 ? -32 : v === 2 ? -29.4 : -30;
  for (let i = 0; i < 6; i++) { const a = R() * TAU, d = R() * 7; const x = ox + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
    const lc = p === 'burn1' ? (i % 2 ? C.charL : '#2b2421') : p === 'burn0' ? (i % 3 === 0 ? C.char : i % 3 === 1 ? '#b8862e' : C.orange) : i % 2 ? C.leafL : C.leafD;
    brush(c, [[x - 2.5, y + 1], [x - 1, y - 2], [x + 1.5, y - 1.4], [x + 0.6, y + 1.4], [x + 3.2, y + 0.6]], 1.3, lc, R, { bristles: 2, dry: 0.2 }); }
  if (p === 'burn0') for (let i = 0; i < 4; i++) dab(c, ox - 9 + i * 6 + R() * 2, cy + 6 - R() * 4, 1.7, i % 2 ? C.char : '#5a3a1e', R);
  if (p === 'burn1') for (let i = 0; i < 4; i++) dab(c, ox - 8 + i * 5.4 + R() * 2, cy - 4 + R() * 9, 0.9, i % 2 ? C.fireO : C.fireY, R);
  outline(c, crown, R, 1.6);
}

// ---------- BARREL ----------
// Prop. poses: idle (upright), tipped (u.prone === 1: on its side; OG tips it 1.5 rad toward the side of cos(heading),
// game.js:20997-21005; the lid end faces right, RENDER's flip puts it on the heading side, where the oil pours out).
// Leaking oil, floating (bob in deep water), burning = RENDER (oil grid, OG bob game.js:21134-21139, fire fx).
// It explodes on death and keeps no corpse; 'dead' paints burst staves (lie: 'none') in case RENDER wants it.
// Floppy body: 'wobble' (rig.js): rocks when hit or shoved, on top of RENDER's swim rock.
function barrel(c, o) {
  const R = o.R, M = o.M, burnt = o.dead === 'burnt';
  const wood = burnt ? C.char : C.brown, hoop = burnt ? C.charL : C.greyD;
  if (o.dead) {      // burst: planks and a hoop flat on the ground
    for (const [x, y, a] of [[-9, -1.6, 0.25], [-1, -0.6, -0.12], [7, -2.4, 0.4], [1, -4.4, -0.5]]) { c.save(); c.translate(x, y); c.rotate(a);
      part(c, poly([[-5.4, -1.2], [5.4, -1.5], [5.6, 1.3], [-5.4, 1.2]], R, 0.3), wood, M, { lw: 1.1, sharp: true }); c.restore(); }
    outline(c, ring(1, -2.6, 8, 2.2, R, 0.1, 9), R, 1.3, { col: hoop });
    return;
  }
  const tipped = o.pose === 'tipped', H = 23;
  c.save();
  if (tipped) { c.translate(0, -9); c.rotate(Math.PI / 2); c.translate(0, H / 2 + 0.4); }
  const pts = [[-7.6, -0.6], [-8.8, -H * 0.27], [-9.2, -H * 0.5], [-8.6, -H * 0.74], [-7.4, -H], [7.4, -H], [8.6, -H * 0.74], [9.2, -H * 0.5], [8.8, -H * 0.27], [7.6, -0.6]];
  part(c, poly(pts, R, 0.25), wood, M, { lw: 1.6, ang: Math.PI / 2 });
  if (!burnt) for (const x of [-4, 0, 4]) brush(c, [[x * 1.05, -2], [x * 1.12, -H * 0.5], [x * 1.05, -H + 1.4]], 0.55, tone(C.brown, -0.35), R, { bristles: 1, dry: 0.3, taper: 0 });
  for (const y of [-H * 0.2, -H * 0.8]) brush(c, [[-8.9, y], [0, y + 0.8], [8.9, y]], 1.9, hoop, R, { bristles: 3, dry: 0.15 });
  part(c, ring(0, -H, 7.4, 2.1, R, 0.08, 8), burnt ? C.char : C.brownL, M, { lw: 1.3 });
  c.restore();
  if (!burnt) {     // a kid's danger sign, always painted the right way up: yellow triangle, black "!"
    const cx = 0, cy = tipped ? -8.6 : -H * 0.5 + 0.6;
    const sg = poly([[cx, cy - 4], [cx - 3.8, cy + 3], [cx + 3.8, cy + 3]], R, 0.2);
    fill(c, sg, C.yellow, R, { sharp: true, edge: 0 }); outline(c, sg, R, 0.9, { jit: 0.2 });
    brush(c, [[cx, cy - 2.2], [cx, cy + 0.6]], 0.8, C.ink, R, { bristles: 1, dry: 0 }); dab(c, cx, cy + 1.9, 0.45, C.ink, R);
  }
}

// ---------- pose picks + drawUnit hooks (RENDER calls pick(u, info) and drawUnit(ctx, u, x, y, flip, k, t, api)) ----------
const isRisen = u => !!(u.def && u.def.risenFrom);
function slimePose(u, now) {                       // see SLIME above
  const b = u.b || {}, hs = b.hopStart ?? -1, e = now - hs;
  const p = u.leaping > 0 ? 'hop' : (b.timer > now && b.timer - now < 0.14) || (hs > 0 && e >= 0.32 && e < 0.48) ? 'squash' : 'idle';
  const k = u.subState | 0;
  return SLIME_NAMES[p][k > 0 && k <= 3 ? k : 0];
}
const SLIME_NAMES = { idle: ['idle', 'idle_1', 'idle_2', 'idle_3'], squash: ['squash', 'squash_1', 'squash_2', 'squash_3'], hop: ['hop', 'hop_1', 'hop_2', 'hop_3'] };
// The hop: OG lifts a hopping slime 4 * 0.9 * r * p * (1 - p) off the ground, p = air time fraction (game.js:19462-19467).
function slimeDraw(ctx, u, x, y, flip, k, t, api) {
  const b = u.b || {}, e = api.now - (b.hopStart ?? -1);
  if (!(u.leaping > 0) || !(e >= 0 && e < 0.32)) return false;
  const spr = api.get('slime', slimePose(u, api.now), api.col, { risen: u.skeleton === 1 ? 2 : isRisen(u) ? 1 : 0 });
  if (!spr) return false;
  const p = e / 0.32;
  api.put(spr, x, y - 4 * 0.9 * u.radius * p * (1 - p), flip, k);
  return true;
}
// Lurking: OG draws a (live, not risen) Necromancer at 55% alpha unless it is in raise mode (u.role === 1, game.js:20829).
function necroPose(u) { return u.subState === 1 && !isRisen(u) ? 'raise' : null; }
function necroAlpha(u) { return u.type === 'necro' && u.role !== 1 ? 0.55 : 1; }
function magePose(u) { if (isRisen(u)) return null; const s = u.subState; return s === 1 ? 'castFire' : s === 2 ? 'castBolt' : s === 3 ? 'castCurse' : null; }
function dragonPose(u, info) {                     // see DRAGON above
  const s = u.subState;
  if (s >= 4 && s <= 6) return (Math.floor(info.rt * 5 + (u.id % 5) * 0.4) & 1) ? 'fly1' : 'fly0';
  return s === 1 ? 'breath' : s === 2 ? 'tail' : s === 3 ? 'roar' : u.attack > 0 ? 'atk' : null;
}
const TREE_IDLE = ['idle', 'idle1', 'idle2'];
function treePose(u) {                             // see TREE above
  if (u.burning > 0) { const tot = (u.b && u.b.burnTotal) || 13.2; return 1 - u.burning / tot < 0.5 ? 'burn0' : 'burn1'; }
  if (u.singed === 1) return 'singed';
  return TREE_IDLE[Math.min(2, Math.max(0, (u.wander || 0) * 3 | 0))];
}
const whole = pose => ({ main: pose });           // 'wobble' / 'jelly': the pose's whole sprite is the one part

// ---------- registry ----------
// rig.joints are rest-pose pivots in sprite px (feet at 0,0, facing right); the drivers live in rig-myth.js.
export const SPRITES = {
  zombie: {   // poses / fields / parts: see ZOMBIE above
    box: [48, 46, 22, 41], scale: 1, own: '#7d6a9e', poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['r:leg', 'r:body', 'r:head', 'r:headA', 'r:arm'],
    paint: zombie,
    rig: {
      driver: 'zombie', joints: humanJoints('zombie'),
      parts(pose) { return { leg: 'r:leg', body: 'r:body', head: pose === 'atk' ? 'r:headA' : 'r:head', arm: 'r:arm', lean: pose === 'atk' ? 0.2 : 0 }; },
    },
  },
  slime: {    // poses / fields: see SLIME above (pose + '_' + u.subState for split pieces)
    box: [40, 34, 20, 30], scale: 1, own: SLIME_OWN, lie: 'none',
    poses: ['idle', 'squash', 'hop'],
    extra: ['idle_1', 'squash_1', 'hop_1', 'idle_2', 'squash_2', 'hop_2', 'idle_3', 'squash_3', 'hop_3'],
    paint: slime,
    pick(u, info) { return slimePose(u, info.now); },
    drawUnit: slimeDraw,
    rig: { driver: 'jelly', parts(pose) { return { main: pose, k: +(pose.split('_')[1] || 0) }; } },
  },
  mage: {     // poses / fields / parts: see MAGE above
    box: [46, 50, 20, 46], scale: 1, own: C.purple, poses: ['idle', 'walk0', 'walk1', 'castFire', 'castBolt', 'castCurse'],
    extra: ['r:robe', 'r:arms', 'r:arms:castFire', 'r:arms:castBolt', 'r:arms:castCurse', 'r:head', 'r:hat'],
    paint: mage,
    pick: magePose,
    rig: {
      driver: 'robe', armsFirst: true,
      joints: { top: -19.7, neck: [1, -18.4], shoulder: [2.4, -16.6], hat: [0.8, -28] },
      parts(pose, zom) {
        const cast = pose.startsWith('cast') && !zom;
        return { robe: 'r:robe', back: null, arms: cast ? 'r:arms:' + pose : 'r:arms', head: 'r:head', hat: 'r:hat', cast: cast ? 1 : 0, zom: zom ? 1 : 0 };
      },
    },
  },
  giant: {    // poses / fields / club sprites / parts: see GIANT above
    box: [96, 86, 40, 76], scale: G_SCALE, own: '#c47a3a',
    poses: ['stand', 'idle', 'walk0', 'walk1', 'windup', 'atk', 'lift', 'throw', 'eat', 'stomp', 'stomped', 'pull', 'panic'],
    extra: [...G_BLIND.map(p => p + '_blind'), 'club', 'club_tree', 'club_char', 'club_fire', 'flames',
      'r:leg', 'r:legUp', 'r:body', 'r:head', 'r:headO', 'r:headP', 'r:headB', 'r:crack', 'r:swoosh', ...G_BARMS.map(k => 'r:barm:' + k), ...G_FARMS.map(k => 'r:farm:' + k)],
    paint: giant,
    pick(u, info) { return giantPose(u, info.now, info.moving, info.walkFrame); },
    drawUnit: giantDraw,
    rig: {
      driver: 'giant', club: G_CLUB, clubN: G_CLUB_N,
      joints: { hip: [0, -15], legX: 4.6, neck: [3.6, -38.4], shF: [5, -35], shB: [-5, -35], up: [4.6, -15] },
      parts: giantParts,
    },
  },
  dragon: {   // poses / fields / parts: see DRAGON above
    box: [100, 82, 50, 74], scale: 1.3, own: '#d23b66', flying: true, lie: 'none',
    poses: ['idle', 'walk0', 'walk1', 'atk', 'breath', 'roar', 'tail', 'fly0', 'fly1'],
    extra: ['r:wingB:fold', 'r:wingB:half', 'r:wingF:fold', 'r:wingF:half', 'r:tailK0', 'r:tailK1', 'r:tailK2', 'r:tail0', 'r:tail1', 'r:tail2',
      'r:swoosh', 'r:leg', 'r:legT', 'r:body', 'r:neck', 'r:head', 'r:headA', 'r:headF', 'r:headR'],
    paint: dragon,
    pick: dragonPose,
    rig: {
      driver: 'dragon',
      joints: { body: [0, -14], neck: D_NB, head: D_HEAD, tail: D_TAIL, wingB: [5, -25], wingF: [0, -25], legs: D_LG,
        dead: { tail: D_TAIL_DEAD, legs: D_DEAD_LEGS, neck: [11, -8], head: [23, -4.4], wing: [-4, -7] } },
      parts: dragonParts,
    },
  },
  necro: {    // poses / fields / parts: see NECROMANCER above
    box: [44, 52, 18, 48], scale: 1, own: '#2a2140', poses: ['idle', 'walk0', 'walk1', 'raise'],
    extra: ['r:robe', 'r:back', 'r:head', 'r:arms', 'r:arms:raise'],
    paint: necro,
    pick: necroPose,
    alpha: necroAlpha,
    rig: {
      driver: 'robe', armsFirst: false,
      joints: { top: -20.1, neck: [0.6, -18.6], shoulder: [2.4, -17.2], hat: null },
      parts(pose, zom) {
        const up = pose === 'raise' && !zom;
        return { robe: 'r:robe', back: up ? 'r:back' : null, arms: up ? 'r:arms:raise' : 'r:arms', head: 'r:head', hat: null, cast: up ? 1 : 0, zom: zom ? 1 : 0 };
      },
    },
  },
  skeleton: { // poses / fields / parts: see SKELETON above
    box: [48, 46, 22, 41], scale: 1, own: C.white, lie: 'none', poses: ['idle', 'walk0', 'walk1', 'atk'],
    extra: ['r:leg', 'r:farm', 'r:body', 'r:skull', 'r:jaw', 'r:arm'],
    paint: skeleton,
    rig: {
      driver: 'bones',
      joints: { hip: [0, -8], legX: 1.6, legRest: [wrap(angOf(SK_LEGS.idle[0][0], SK_LEGS.idle[0][2]) - angOf(SK_LEG[0], SK_LEG[2])), 0],   // [far, near] turn at rest
        neck: [0.8, -18.6], hinge: SK_HINGE, shF: [0.4, -17.6], shN: [0.6, -14.6] },
      parts(pose) { return { leg: 'r:leg', farm: 'r:farm', body: 'r:body', skull: 'r:skull', jaw: 'r:jaw', arm: 'r:arm', lean: pose === 'atk' ? 0.2 : 0, open: pose === 'atk' ? SK_OPEN : 0 }; },
    },
  },
  tree: {     // poses / fields: see TREE above
    box: [44, 56, 22, 52], scale: 1, own: C.leaf, poses: ['idle', 'idle1', 'idle2'], extra: ['burn0', 'burn1', 'singed', ...TREE_EXTRA],   // STEP7 GROUND-ART: + themed poses
    paint: tree,
    pick: (u, info) => treeThemed(treePose(u), info),   // STEP7 GROUND-ART: the map ground's tree
    rig: { driver: 'wobble', parts: whole, wobble: { tilt: 0.3, squash: 0.25, sway: 0.02 } },
  },
  barrel: {   // poses / fields: see BARREL above
    box: [36, 32, 18, 28], scale: 1, own: C.brown, lie: 'none', poses: ['idle', 'tipped'],
    paint: barrel,
    pick(u) { return u.prone === 1 ? 'tipped' : 'idle'; },
    rig: { driver: 'wobble', parts: whole, wobble: { tilt: 0.6, squash: 0.45, sway: 0 } },
  },
};
