// POSTER PAINT renderer (look A). Owner: RENDER. Same contract as render/debug.js: draw(ctx, world, view, alpha);
// plus handleEvents(events, world), clear(), prewarm(tool, teams), drawIcon(ctx, tool, w, h), toolColor(tool), theme.
// A frame = the ground canvas, the cached terrain layer, then atlas sprites placed with setTransform + drawImage
// (painting only happens at bake time, spread over frames by sprites.pump). No hp bars: hurt units limp (OG).
//
// Order: ground (grass, sky, decals) -> terrain layer (water, ice, walls) -> oil -> mines, peels, ground arrows ->
// burning-oil flames -> corpses (dead frame toppling onto its back, OG fade by 1.1 s) -> flying shadows -> units sorted
// by feet y (fire / stun stars / ripples with each) -> flying units -> projectiles -> event effects -> steam clouds.
//
// Pose picking: army + mythical rules are wired in PICK below from each entry's comment; animal entries bring
// pick(u, t = world.time, world). Other entry hooks honoured: poseR (scale by u.radius / poseR[pose]), noFlip,
// drawUnit(ctx, u, x, y, flip, k, t, api) / over(ctx, u, x, y, flip, k, t, world) / drawCorpse(ctx, rec, x, y, k, t)
// with ctx at the identity transform, (x, y) = the anchor in DEVICE px, k = device px per sim px, t = world time.
// api.get(type, pose, col, opts) -> sprite (col 0 own / 1 red / 2 blue / a colour string; opts { dead, risen, v, bare }),
// api.put(spr, x, y, flip, k, rot, alpha) with (x, y) in SIM px. Bake key options: o.hatless = o.singed = o.bare
// (u.hatless || u.singed), o.kindled (archer), o.risen true (risen_<type>) / 'bone' (u.skeleton === 1; person types
// use the 'skeleton' entry instead).
import { C } from './paint.js';
import * as SP from './sprites.js';
import * as GROUND from './ground.js';
import * as TER from './terrain.js';
import * as FX from './fx.js';
import { GPU } from './gpu.js';
import * as RIG from './rig.js';
import { getDef } from '../../sim/defs.js';
// floppy-body drivers in their own files (RIG.md): each registers itself on import; a broken one leaves its units whole
await Promise.allSettled([import('./rig-quad.js'), import('./rig-myth.js'), import('./rig-dinos.js'), import('./rig-siege.js'), import('./rig-pirates.js'),
  import('./rig-robots.js'), import('./rig-space.js'), import('./rig-ocean.js'), import('./rig-sports.js'), import('./rig-bugs.js'), import('./rig-bosses.js'), import('./rig-secret.js'), import('./rig-mine.js')]).then((rs) => rs.forEach((r) => { if (r.status === 'rejected') console.warn('art: rig driver module failed', r.reason); }));

// ---------------------------------------------------------------- corpse rules (OG game.js:22051-22059, 21724-21738)
let deathM = null;
try { deathM = await import('../../sim/combat/death.js'); } catch (e) { deathM = null; }
// STEP7 (lead): the secret unit hiding on a map (sprites-secret.js drawSecret, SECRET-ART), drawn over the props.
let secretArt = null, secretErr = 0;
try { secretArt = await import('./sprites-secret.js'); } catch (e) { secretArt = null; }
const FADE0 = 0.75, FADE1 = 1.1;
function held(c) { return (c.colony > 0) || (c.claimed >= 0) || c.kept === 1 || c.scavenged === 1; }
function corpseAlpha(c, now) {
  if (deathM && deathM.corpseAlpha && c.meat !== undefined) return deathM.corpseAlpha(c, now);
  const t0 = c.t ?? c.time ?? 0, age = now - t0;
  if (age < 0 || c.removed || c.raised === 1 || c.eaten === 1 || (c.z || 0) >= 4) return 0;
  if (age >= FADE1 && !held(c)) return 0;
  const a = held(c) ? Math.min(age, FADE0) : age;
  return Math.max(0, 1 - Math.max(0, (a - FADE0) / (FADE1 - FADE0)));
}
function corpseAge(c, now) { const age = now - (c.t ?? c.time ?? 0); return held(c) ? Math.min(age, FADE0) : age; }

// ---------------------------------------------------------------- theme
export const theme = { red: C.red, blue: C.blue, outline: C.ink, field: C.g1, paper: C.paper, ink: C.ink };
const TOOL_COL = { wall: C.grey, water: C.pond, ice: '#9fd8ff', mine: C.ink, peel: C.yellow, erase: C.ink };
export function toolColor(tool) {
  if (!tool) return C.ink;
  if (tool.kind === 'unit') return SP.entOf(tool.type).ent.own;
  return TOOL_COL[tool.kind] || TER.toolColor7(tool.kind) || C.ink;   // STEP7 TERRAIN-ART: lava / mud / bridge / tramp ring colours
}

// ---------------------------------------------------------------- per-unit render state (slot = id & MASK)
const MASK = 32767, NS = MASK + 1;
const sDust = new Float32Array(NS), sSwim = new Float32Array(NS);   // sSwim: OG swimEase (game.js:20867)
const sId = new Int32Array(NS).fill(-1), sFace = new Int8Array(NS), sWalk = new Float32Array(NS), sLX = new Float32Array(NS), sLY = new Float32Array(NS), sPh = new Float32Array(NS);
// hit-stop (OG game.js:20838-20843): a new u.stopAt (a blow of 45+ dealt) freezes the DRAWN x, y of attacker and victim for
// 0.06 s of interpolated sim time; the sim keeps moving them, the picture catches up after.
const HIT_STOP = 0.06, STEP = 1 / 60;
const sStopId = new Int32Array(NS).fill(-1), sSeenStop = new Float64Array(NS), sFrozenUntil = new Float64Array(NS), sFrozenX = new Float32Array(NS), sFrozenY = new Float32Array(NS);
function phaseOf(id) { let h = Math.imul(id + 1, 2654435761); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; }
const boilV = (rt, ph) => (((rt * 8 + ph * 3) | 0) % 3 + 3) % 3;       // line boil: 3 variants at 8 fps

// ---------------------------------------------------------------- sort buffers
let keys = new Float64Array(1024), airKeys = new Float64Array(1024), ix = new Float32Array(1024), iy = new Float32Array(1024), iz = new Float32Array(1024);   // STEP7 SECRET-ART: airKeys was 256 (ensure() only grows past 1024 units): > 256 flyers (a seagull flock) overran it and draw() threw
function ensure(n) {
  if (ix.length >= n) return;
  let m = ix.length; while (m < n) m *= 2;
  keys = new Float64Array(m); airKeys = new Float64Array(m); ix = new Float32Array(m); iy = new Float32Array(m); iz = new Float32Array(m);
}
const oilBuf = new Float32Array(240 * 3);

// ---------------------------------------------------------------- state
let inited = false, misses = 0, lastWorld = null, lastCorpseId = 0, frame = 0;
const stampedNoId = new WeakSet();
const PERCH = 26, PERCH_APE = 23; // OG game.js:9013-9015
// Gator jaws (OG game.js:20762-20778 jawsAt, 20988-20991, 21163-21171): a held victim is drawn with its middle at the
// gator's mouth (sprites-animals.js gator `mouth`) plus the sim's shake, turned 1.35 rad toward the snout (about its middle,
// OG BEAN_LIFT 1.345 r above its feet), and the gator's upper jaw ('jawU') is drawn again over it, sorted 2.5 px below
// the gator (after the victim at +1 px), so the victim sits between the jaws. At most 64 a frame (OG J < 64).
const JAW_CAP = 64, BEAN_LIFT = 1.345;
const jawG = new Int32Array(JAW_CAP), jawXf = new Float64Array(JAW_CAP * 6), jawCut = new Float32Array(JAW_CAP), jawKey = new Float64Array(JAW_CAP);
const jawOK = new Uint8Array(JAW_CAP), jawOf = new Map(), jawBy = new Map();   // victim -> record, gator -> record
let nJaw = 0;
const SLIMES = new Set(['slime', 'risen_slime', 'kingslime', 'bigslime', 'slimelet']);   // STEP6: the king slime and its split
const SCORCH = new Set(['lavagolem']);   // STEP6: rock + lava: a scorch mark, never blood
let ctx = null, S = 1, NOW = 0, RT = 0, lastRT = 0, FDT = 1 / 60;   // FDT: real frame dt (OG z.frameDt)

function init() {
  inited = true;
  if (pendingPrewarm) { const [t, tm] = pendingPrewarm; pendingPrewarm = null; prewarm(t, tm); }
  GROUND.prewarm(); TER.prewarm(); FX.prewarm();
}

// ---------------------------------------------------------------- sprite placement
// Place a sprite: feet (anchor) at sim (x, y), flip +-1, m = size factor, rot about a pivot pc device px above the feet.
function place(spr, x, y, flip, m, sy, rot, pc) {
  const mm = m * S / spr.k;
  if (rot === 0) ctx.setTransform(mm * flip, 0, 0, mm * sy, x * S, y * S);
  else {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    ctx.setTransform(cs * mm * flip, sn * mm * flip, -sn * mm * sy, cs * mm * sy, x * S - sn * pc, y * S + cs * pc - pc);
  }
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
}
// Floppy bodies (rig.js): draw RIG.OUT's parts through the base matrix B (entry units -> device px). Every part must be
// baked: a missing one is queued and the caller draws the whole sprite this frame instead (never a whole figure per part).
const B = new Float64Array(6);
function setBase(X, Y, flip, K, sy, rot, pc) {
  if (rot === 0) { B[0] = K * flip; B[1] = 0; B[2] = 0; B[3] = K * sy; B[4] = X; B[5] = Y; return; }
  const cs = Math.cos(rot), sn = Math.sin(rot);
  B[0] = cs * K * flip; B[1] = sn * K * flip; B[2] = -sn * K * sy; B[3] = cs * K * sy; B[4] = X - sn * pc; B[5] = Y + cs * pc - pc;
}
const PSPR = new Array(16).fill(null);
function partsReady(ent, col, v, dead, risen, bare, kindled) {
  const O = RIG.OUT; let ok = true;
  for (let i = 0; i < O.n; i++) {
    const k = SP.key(ent.id, col, O.pose[i], v, dead, risen, bare, kindled);
    let s = SP.peek(k);
    if (!s && v !== 0) { SP.want(k); s = SP.peek(SP.key(ent.id, col, O.pose[i], 0, dead, risen, bare, kindled)); }
    if (!s) { SP.get(SP.key(ent.id, col, O.pose[i], 0, dead, risen, bare, kindled)); ok = false; }
    PSPR[i] = s;
  }
  return ok;
}
function drawParts(flash, alpha) {
  const O = RIG.OUT, m = O.m;
  for (let pass = 0; pass < (flash > 0 ? 2 : 1); pass++) {
    if (pass === 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = flash * 0.55 * alpha; }
    for (let i = 0; i < O.n; i++) {
      const s = PSPR[i], o = i * 6, ik = 1 / s.k;
      const a = m[o], b = m[o + 1], c = m[o + 2], d = m[o + 3], e = m[o + 4], f = m[o + 5];
      ctx.setTransform((B[0] * a + B[2] * b) * ik, (B[1] * a + B[3] * b) * ik, (B[0] * c + B[2] * d) * ik, (B[1] * c + B[3] * d) * ik,
        B[0] * e + B[2] * f + B[4], B[1] * e + B[3] * f + B[5]);
      ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -s.ax, -s.ay, s.sw, s.sh);
    }
  }
  if (flash > 0) { ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over'; }
}
function colIdOf(team) { return team === 0 ? 1 : team === 1 ? 2 : 0; }
// Wanted frame not baked yet: queue it and draw the nearest baked frame instead. Boil variants 1-2 queue LOW so every
// missing variant-0 frame (right pose, right state) bakes first. A dead or burnt body with no dead frame yet borrows the
// alive frame for the moment (it topples the same way) instead of baking inside the frame: a new type's first death used
// to cost a whole bake right then (~5 ms here, more on a phone). Only a type with nothing baked at all bakes now.
function spriteFor(ent, col, pose, v, dead, risen, bare = 0, kindled = 0) {
  const k = SP.key(ent.id, col, pose, v, dead, risen, bare, kindled);
  let s = SP.peek(k);
  if (s) return s;
  misses++; CNT.miss++; CNT.byType[ent.type] = (CNT.byType[ent.type] || 0) + 1;
  const k0 = v === 0 ? k : SP.key(ent.id, col, pose, 0, dead, risen, bare, kindled);
  if (v !== 0) SP.want(k);
  s = SP.get(k0) || SP.peek(SP.key(ent.id, col, 0, 0, dead, risen, bare, kindled))
    || SP.peek(SP.key(ent.id, col, pose, v, dead, risen)) || SP.peek(SP.key(ent.id, col, pose, 0, dead, risen)) || SP.peek(SP.key(ent.id, col, 0, 0, dead, risen));
  if (s) { CNT.near++; return s; }
  if (dead !== 0) {   // body: burnt -> dead frame, then the alive frame of the same colour, then any alive frame
    s = (dead === 2 && (SP.peek(SP.key(ent.id, col, pose, 0, 1, risen, bare, kindled)) || SP.peek(SP.key(ent.id, col, 0, 0, 1, risen))))
      || SP.peek(SP.key(ent.id, col, pose, 0, 0, risen, bare, kindled)) || SP.peek(SP.key(ent.id, col, 0, 0, 0, risen)) || SP.peek(SP.key(ent.id, col, 0, 0, 0, 0));
    if (s) { CNT.near++; return s; }
  }
  s = SP.fallback(ent.id); if (s) { CNT.other++; return s; }
  CNT.sync++;
  return SP.getNow(SP.key(ent.id, col, 0, 0, dead, risen, bare, kindled)); // nothing of this type yet: bake one now
}
// Debug counters (cumulative; attack tools read + reset them): miss = wanted frame not baked; near = drew another
// variant / pose of the same key; other = drew any frame of the type; sync = baked during the frame.
const CNT = { miss: 0, near: 0, other: 0, sync: 0, byType: {} };
export function counters(reset = false) { const r = { ...CNT, byType: { ...CNT.byType } }; if (reset) { CNT.miss = CNT.near = CNT.other = CNT.sync = 0; CNT.byType = {}; } return r; }

// ---------------------------------------------------------------- pose rules (from each entry's comment)
// Army + mythical rules are wired here; animal entries bring their own pick(u, t = world.time, world).
// A rule returns a pose name, or null for the default (atk while u.attack > 0.35 if the entry has 'atk', walk0 / walk1 by
// distance walked while moving, else poses[0]). Pose names are interned constants: no string building per frame.
const ST = { IDLE: 0, ADVANCE: 1, ENGAGE: 2, ALERT: 3, CHARGE: 4, FLEE: 5 };       // OG game.js:9219
const NOB = {};
const speedOf = (u) => Math.sqrt((u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0));
const atkOnly = (u) => (u.attack > 0 ? 'atk' : null);
const PICK = {
  // ARMY (sprites-army.js comments)
  rifle: (u) => (u.attack > 0 ? 'atk' : u.reload > 0 ? 'reload' : null),
  flamer: atkOnly,
  sniper: (u) => (u.climb >= 0.5 ? 'perch' : u.prone >= 0.5 ? 'prone' : u.attack > 0 ? 'atk' : u.reload > 0 ? 'reload' : null),
  legion: atkOnly,
  grenadier: (u) => {
    const b = u.b || NOB;
    if (u.attack > 0) return 'atk';
    if (u.state === ST.ENGAGE && !(b.reload > 0) && b.ammo > 0 && u.cooldown < 0.35) return 'windup';
    return b.reload > 0 ? 'reload' : null;
  },
  archer: (u) => (u.attack > 0 ? 'atk' : u.b && u.b.timer > 0 && u.state === ST.ENGAGE ? 'draw' : null),
  cavalry: (u, I) => (u.state === ST.CHARGE ? (I.walkFrame ? 'charge1' : 'charge0') : u.attack > 0 ? 'atk' : speedOf(u) > 130 ? (I.walkFrame ? 'run1' : 'run0') : null),
  ninja: (u) => (u.leaping === 1 ? 'dash' : u.attack > 0 ? (u.b && (u.b.flags & 4) ? 'star' : 'atk') : null),
  knight: atkOnly,
  horse: (u, I) => (u.b && u.b.subState === 8 ? 'drink' : speedOf(u) > 130 ? (I.walkFrame ? 'run1' : 'run0') : null),
  // MYTHICAL (sprites-myth.js comments)
  zombie: atkOnly,
  skeleton: atkOnly,
  // the other mythical entries and the props bring their own pick(u, info) (sprites-myth.js); animals pick(u, t, world)
};
const FOOT = new Set(['rifle', 'flamer', 'sniper', 'legion', 'grenadier', 'archer', 'ninja', 'knight', 'zombie', 'mage', 'necro']);
// skeleton copies (u.skeleton === 1) of these use the bony-person entry; mage + necro paint o.risen === 'bone' themselves
const PERSON = new Set(['rifle', 'flamer', 'sniper', 'legion', 'grenadier', 'archer', 'ninja', 'knight', 'zombie']);

// ---------------------------------------------------------------- drawUnit api
const COLS = { [C.red]: 1, [C.blue]: 2 };
const api = {
  v: 0, col: 0, now: 0, S: 1,
  get(type, pose, col, opts) {
    const { ent, risen } = SP.entOf(type);
    const pi = typeof pose === 'number' ? pose : ent.pose(pose);
    const cid = typeof col === 'number' ? col : (COLS[col] || SP.colId(col));
    const v = opts && opts.v !== undefined ? opts.v : api.v, dead = opts && opts.dead ? opts.dead : 0, rz = opts && opts.risen !== undefined ? +opts.risen : risen;
    return spriteFor(ent, cid, pi < 0 ? 0 : pi, v, dead, rz, opts && opts.bare ? 1 : 0, 0);
  },
  /** Draw a sprite with its feet at (x, y) sim px. */
  put(spr, x, y, flip = 1, k = 1, rot = 0, alpha = 1) {
    if (!spr) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    place(spr, x, y, flip < 0 ? -1 : 1, k, 1, rot, 0);   // k = sim px per sprite px (the entry scale is NOT applied)
    if (alpha !== 1) ctx.globalAlpha = 1;
  },
};
const info = { moving: false, walkFrame: 0, now: 0, rt: 0, ph: 0, world: null };
const RIG_ON = !(typeof location !== 'undefined' && /[?&]rig=0\b/.test(location.search));   // ?rig=0: whole sprites (A/B)
const RI = { slot: 0, now: 0, flip: 1, moving: false, cyc: 0, z: 0, ph: 0, rt: 0, run: false };

// ---------------------------------------------------------------- units
function pickPose(ent, u, moving, wf, world, z) {
  info.moving = moving; info.walkFrame = wf;
  let p = null;
  if (z > 1 && ent.idx.has('fly') && FOOT.has(ent.type)) p = 'fly';           // tossed (ARMY: u.z > 1)
  else if (ent.pick) {
    try { p = ent.dev ? ent.pick(u, NOW, world) : ent.pick(u, info); } catch (e) { ent.pick = null; console.warn('art: pick failed', ent.type, e); }
  } else {
    const rule = PICK[ent.type];
    if (rule) { try { p = rule(u, info); } catch (e) { PICK[ent.type] = null; console.warn('art: pick failed', ent.type, e); } }
  }
  if (p != null) { const i = typeof p === 'number' ? p : ent.idx.get(p); if (i !== undefined && i >= 0 && i < ent.all.length) return i; }
  const P = ent.P;
  if (P.atk >= 0 && u.attack > 0.35) return P.atk;
  if (ent.walk && moving) return wf ? P.walk1 : P.walk0;
  return 0;
}
// OG waterline (game.js:20864-20880): px of the body under water. dep = u.wet (depth under it, 0 on ice).
function sinkOf(u, ent, dep) {
  if (!(dep >= 0.05)) return 0;
  const r = u.radius || ent.defR, t = u.type, d = u.def || NOB;
  const line = dep <= 0.45 ? 4 * Math.min(1, dep / 0.45) : (() => { const e = Math.min(1, (dep - 0.45) / 0.55); return 4 + 22 * e * e * (3 - 2 * e); })();
  if (t === 'piranha') return dep >= 0.75 ? 0.85 * r : 0;
  if (d.swims) {
    const nt = t === 'frog' ? 0.3 : t === 'gator' ? (u.state === ST.CHARGE || u.state === ST.ENGAGE ? 0.7 : 1.08) : 0.6;
    return Math.min(line, r * nt);
  }
  if (d.deepWalker || ent.flying) return line;
  return Math.min(line, r);
}
function drawUnit(world, u, x, y, z) {
  const jv = nJaw ? jawOf.get(u) : undefined, jg = nJaw ? jawBy.get(u) : undefined;
  let jx = 0, jy = 0, jside = 0;
  if (jv !== undefined) {   // held in a gator's jaws: middle at its mouth (OG jawsAt, game.js:20776-20777)
    const gi = jawG[jv], g = world.units[gi], ge = SP.entOf(g.type).ent, m = ge.e.mouth || [18, -5.4];
    const gk = Math.min(1.7, Math.max(0.35, (g.radius || ge.defR) / ge.defR)) * ge.scale;
    jside = Math.cos(g.heading || 0) >= 0 ? 1 : -1;
    const shake = u.x - (g.x + jside * (g.radius || ge.defR) * 1.15);   // the sim pins it at 1.15 r + its shake (gator.js carry)
    jx = ix[gi] + jside * m[0] * gk + shake; jy = iy[gi] + m[1] * gk;
  }
  let te = SP.entOf(u.type), risen = te.risen;
  if (u.skeleton === 1) {                                  // necromancer's raised dead (OG game.js:20828)
    const base = te.ent.type;
    if (PERSON.has(base)) { te = SP.entOf('skeleton'); risen = 0; } else risen = 2;
  }
  const ent = te.ent;
  const slot = u.id & MASK;
  if (sId[slot] !== u.id) { sId[slot] = u.id; sFace[slot] = Math.cos(u.heading || 0) >= 0 ? 1 : -1; sWalk[slot] = 0; sLX[slot] = x; sLY[slot] = y; sPh[slot] = phaseOf(u.id); sSwim[slot] = 0; }
  // facing: look = face if set, else heading; hysteresis +-0.2 (OG game.js:20191, 20853-20855)
  const look = u.face === u.face && u.face !== undefined && u.face !== null ? u.face : (u.heading || 0), cl = Math.cos(look);
  if (cl > 0.2) sFace[slot] = 1; else if (cl < -0.2) sFace[slot] = -1;
  const flip = ent.noFlip ? 1 : sFace[slot];
  const dx = x - sLX[slot], dy = y - sLY[slot], d = Math.sqrt(dx * dx + dy * dy);
  if (d < 30) sWalk[slot] += d;
  sLX[slot] = x; sLY[slot] = y;
  const ph = sPh[slot];
  info.ph = ph;
  const sp2 = (u.vx || 0) * (u.vx || 0) + (u.vy || 0) * (u.vy || 0), moving = sp2 > 49 && !(u.stun > 0.3);
  const stride = Math.max(3.2, ent.defR * 0.8);
  const hurt = u.maxHp > 0 && u.hp < u.maxHp * 0.5;
  const limper = hurt || (ent.type === 'zombie' && u.id % 10 < 3);   // 30 % of zombies limp (MYTHICAL / OG)
  const cyc = sWalk[slot] / stride;
  let wf = Math.floor(cyc) & 1;
  if (limper && moving) wf = (cyc % 2) < 1.35 ? 0 : 1;              // limp: the bad leg's step is short
  let col = colIdOf(u.team);
  if (u.type === 'frog' && u.curseType) col = SP.colId(SP.entOf(u.curseType).ent.own);   // frog wears the cursed type's colour
  const v = boilV(RT, ph);
  const pose = pickPose(ent, u, moving, wf, world, u.z || 0);
  const pname = ent.all[pose];
  let k = Math.min(1.7, Math.max(0.35, (u.radius || ent.defR) / (ent.poseR && ent.poseR[pname] ? ent.poseR[pname] : ent.defR)));
  const bare = u.hatless || u.singed ? 1 : 0, kindled = ent.kindled && u.kindled ? 1 : 0;
  const now = NOW;
  if (jv !== undefined) { const lift = BEAN_LIFT * (u.radius || ent.defR); x = jx; y = jy + lift; z = 0; }
  // body language: hit jolt + squash (OG game.js:20932-20937), flinch (0.61 s, OG game.js:19384-19386), limp, spin
  let ox = 0, oy = 0, sy = 1, rot = 0, pc = 0;
  const hdt = now - (u.hitAt || -9);
  if (hdt >= 0 && hdt < 0.2 && u.hitPow > 0) { const e = (1 - hdt / 0.2) * Math.min(1, u.hitPow); ox += (u.hitDx || 0) * 3.2 * e; sy -= 0.14 * e; }
  const fdt = now - (u.flinchAt || -9);
  if (fdt >= 0 && fdt < 0.61) { const e = Math.sin(fdt / 0.61 * Math.PI); sy -= 0.07 * e; rot -= flip * 0.12 * e; }
  if (limper && moving) { rot += flip * 0.09 * Math.sin(cyc * Math.PI); if (wf) oy += 0.9; }
  if (ent.type === 'zombie' && u.state === ST.ENGAGE && u.cooldown < 0.22 && !(u.attack > 0)) rot -= flip * 0.14;   // coils back before a bite
  if ((u.z || 0) > 0.5 && u.spin) rot += u.spin * (now - (u.thrownAt || now));
  if (jv !== undefined) rot += 1.35 * jside;
  xRot = jv !== undefined ? 1.35 * jside : 0; xPiv = jv !== undefined ? BEAN_LIFT * (u.radius || ent.defR) : 0;   // OG game.js:20991 (screen +y down: + = clockwise, head toward the snout)
  // water: the OG waterline (not flying, not perched; u.wet is 0 over ice)
  const sink = jv === undefined && z <= 0.5 && !(u.climb > 0) && world.waterCells > 0 ? sinkOf(u, ent, u.wet || 0) : 0;
  // swim bob (OG game.js:20862-20868, 21136-21140): afloat = rat / frog / gator / piranha in any water >= 0.05, anyone else
  // in deep water >= 0.75 unless a deepWalker or perched; eases in and out at 6/s. Afloat units ride the swell 1.6 px and
  // rock (barrel 0.12 rad, others 0.048), period 2.6 s, phase by unit. Rats and frogs don't; snakes have their own painter.
  const tp = ent.type, dep = z <= 0.5 && world.waterCells > 0 ? (u.wet || 0) : 0;
  const afloat = tp === 'rat' || tp === 'frog' || tp === 'gator' || tp === 'piranha' ? dep >= 0.05 : dep >= 0.75 && !(u.def && u.def.deepWalker) && !(u.climb > 0);
  sSwim[slot] += ((afloat ? 1 : 0) - sSwim[slot]) * Math.min(1, 6 * FDT);
  const swim = sSwim[slot];
  if (swim > 0.001 && tp !== 'rat' && tp !== 'frog' && tp !== 'snake') {
    oy -= 1.6 * swim * Math.sin(2.4 * NOW + 1.7 * u.id);
    rot += swim * (tp === 'barrel' ? 0.12 : 0.048) * Math.sin(2.4 * NOW * 0.73 + 2.3 * u.id);
  }
  let alpha = 1;
  if (ent.alpha) { try { alpha = Math.max(0, Math.min(1, +ent.alpha(u))); if (!(alpha >= 0)) alpha = 1; } catch (e) { ent.alpha = null; alpha = 1; } }
  if (alpha <= 0.01) return;
  // shadow under a tossed unit or a hopping slime (air units get theirs in drawUnits)
  if (z > 0.5 && z <= 14 && !(u.climb > 0)) FX.shadowAt(x, y, Math.max(0.4, k * ent.scale * 0.8), 0.8);
  else if (u.leaping > 0 && ent.type === 'slime' && u.b && now - (u.b.hopStart ?? -9) < 0.32) FX.shadowAt(x, y, Math.max(0.4, k * 0.9), 0.75);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  // custom draw: ANIMALS (snake) in device px, k = device px per sim px, t = world time; ARMY / MYTHICAL in sim px via
  // api (k = size factor, t = real time). Returning false draws the body as usual after it (giant: club behind the body).
  if (ent.drawUnit) {
    api.v = v; api.col = col; api.now = now; api.S = S;
    let done = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try {
      done = (ent.dev ? ent.drawUnit(ctx, u, (x + ox) * S, (y + oy - z) * S, flip, S, now, api)
        : ent.drawUnit(ctx, u, x + ox, y + oy - z, flip, k, RT, api)) === true;
    } catch (e) { ent.drawUnit = null; console.warn('art: drawUnit failed', ent.type, e); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha;
    if (done) { ctx.globalAlpha = 1; extras(u, ent, x, y, z, k, ph, sink, pname); return; }
  }
  const kk = k * ent.scale;
  // floppy bodies: a rigged pose, not wading (the waterline cut needs one sprite), not in a gator's jaws
  const rig = ent.e.rig;
  if (RIG_ON && rig && RIG.has(rig.driver) && !(sink > 0.3) && jv === undefined && jg === undefined && alpha > 0.999) {   // a holder draws its whole 'hold' frame (jawU overdraw)   // see-through (lurking necro): whole, or the parts overlap darker
    const rp = RIG.partsOf(ent, pose, risen > 0);
    if (rp) {
      RI.slot = slot; RI.now = now; RI.flip = flip; RI.moving = moving; RI.cyc = cyc; RI.z = z; RI.ph = ph; RI.rt = RT; RI.run = !!rig.run || speedOf(u) > 110;
      if (RIG.alive(ent, rp, u, RI) && partsReady(ent, col, v, 0, risen, bare, kindled)) {
        let pc2 = 0;
        if (rot !== 0 && (u.z || 0) > 0.5 && u.spin) pc2 = ent.box[3] * 0.45 * kk * S;
        setBase((x + ox) * S, (y + oy - z) * S, flip, kk * S, sy, rot, pc2);
        drawParts(u.flash > 0 ? Math.min(1, u.flash) : 0, alpha);
        if (alpha !== 1) ctx.globalAlpha = 1;
        if (ent.over) { ctx.setTransform(1, 0, 0, 1, 0, 0); try { ent.over(ctx, u, (x + ox) * S, (y + oy - z) * S, flip, S, now, world); } catch (e) { ent.over = null; } }
        extras(u, ent, x, y, z, k, ph, sink, pname);
        return;
      }
    }
  }
  const spr = spriteFor(ent, col, pose, v, 0, risen, bare, kindled);
  if (!spr) { if (alpha !== 1) ctx.globalAlpha = 1; return; }
  if (rot !== 0 && (u.z || 0) > 0.5 && u.spin) pc = spr.ay * 0.45 * (kk * S / spr.k);
  if (jv !== undefined) pc = BEAN_LIFT * (u.radius || ent.defR) * S;
  const fl = u.flash > 0 ? Math.min(1, u.flash) : 0;
  if (sink > 0.3) {
    const mm = kk * S / spr.k, cut = Math.min(spr.ay - 2, sink / kk * spr.k), wx = (x + ox) * S, wy = (y + oy) * S, cm = cut * mm;
    if (rot === 0) ctx.setTransform(mm * flip, 0, 0, mm * sy, wx, wy + cm);
    else { const cs = Math.cos(rot), sn = Math.sin(rot); ctx.setTransform(cs * mm * flip, sn * mm * flip, -sn * mm * sy, cs * mm * sy, wx - sn * cm, wy + cs * cm); }   // rocks about the waterline
    const sh = Math.max(1, Math.floor(spr.ay - cut));
    ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, sh, -spr.ax, -spr.ay, spr.sw, sh);
    if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * 0.55 * alpha; ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, sh, -spr.ax, -spr.ay, spr.sw, sh); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over'; }
    FX.rippleAt(x, y, Math.max(0.35, kk * 0.8), RT, ph);
    if (jg !== undefined) jawRecord(jg, ent, col, pose, v, risen, bare, kindled, spr, sh);
  } else {
    place(spr, x + ox, y + oy - z, flip, kk, sy, rot, pc);
    if (jg !== undefined) jawRecord(jg, ent, col, pose, v, risen, bare, kindled, spr, spr.sh);
    if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * 0.55 * alpha; ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over'; }
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
  if (ent.over) {   // frog tongue etc., device px
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try { ent.over(ctx, u, (x + ox) * S, (y + oy - z) * S, flip, S, now, world); } catch (e) { ent.over = null; console.warn('art: over failed', ent.type, e); }
  }
  if (pname === 'perch' || (u.climb >= 0.5 && ent.type === 'sniper')) FX.leavesOn(x, y - z + 1, Math.max(0.8, kk), ph);   // sitting inside the crown
  extras(u, ent, x, y, z, k, ph, sink, pname);
}
// The gator's body was drawn with the exact 'hold' sprite: keep its transform (and waterline cut) for the 'jawU' overdraw.
function jawRecord(r, ent, col, pose, v, risen, bare, kindled, spr, cutH) {
  const pj = ent.idx.get('jawU');
  if (pj === undefined || SP.get(SP.key(ent.id, col, pose, v, 0, risen, bare, kindled)) !== spr) return;   // a fallback frame: skip
  const m = ctx.getTransform(), o = r * 6;
  jawXf[o] = m.a; jawXf[o + 1] = m.b; jawXf[o + 2] = m.c; jawXf[o + 3] = m.d; jawXf[o + 4] = m.e; jawXf[o + 5] = m.f;
  jawCut[r] = cutH; jawKey[r] = SP.key(ent.id, col, pj, v, 0, risen, bare, kindled); jawOK[r] = 1;
}
function drawJaw(r) {
  if (!jawOK[r]) return;
  const spr = SP.get(jawKey[r]);   // not baked yet: queued, skip this frame (never a whole-gator fallback over the victim)
  if (!spr) return;
  const o = r * 6, h = jawCut[r];
  ctx.setTransform(jawXf[o], jawXf[o + 1], jawXf[o + 2], jawXf[o + 3], jawXf[o + 4], jawXf[o + 5]);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, h, -spr.ax, -spr.ay, spr.sw, h);
}
const CHARGERS = new Set(['cavalry', 'horse', 'boar', 'cheetah', 'apecav']);
const ACT_CHARGERS = new Set(['trike']);
const OWN_FIRE = new Set(['ship']);   // STEP4: the ship paints its own deck fires   // STEP4: charge = b.act 1, not state Charge
let xRot = 0, xPiv = 0;   // body turn + pivot height above the feet for extras() (a victim in a gator's jaws)
function extras(u, ent, x, y, z, k, ph, sink, pname) {
  const kk = k * ent.scale, r = u.radius || ent.defR;
  // charge speed lines (OG game.js:20915-20921; ANIMALS asked for apecav too)
  if ((u.state === ST.CHARGE && CHARGERS.has(ent.type)) || (ACT_CHARGERS.has(ent.type) && u.b && u.b.act === 1)) {
    const run = (u.def && u.def.runSpeed) || 150, sp = speedOf(u), n = Math.max(0, Math.min(1, (sp - 0.7 * run) / (run * 0.3)));
    if (n > 0) FX.speedLines(x, y - z, u.vx, u.vy, r, n, u.id, RT);
  }
  // boar pawing the ground: a dust puff every 0.4 s
  if ((pname === 'paw0' || pname === 'paw1') && NOW - sDust[u.id & MASK] > 0.4) { sDust[u.id & MASK] = NOW; FX.dustAt(x + sFace[u.id & MASK] * r * 0.6, y, 0.45); }
  // arrows stuck in it, max 2 drawn (OG game.js:3203, 10710; CORE-B leaves the placement to the renderer). a.back and
  // a.ang are in the body's facing-right frame (sim mirrors them for a left-facing unit), so draw them through the CURRENT
  // facing like OG writeArrowsIn (game.js:21197-21211: x * facing, angle facing > 0 ? a : PI - a).
  const na = Math.min(2, u.arrowsIn | 0);
  if (na > 0 && u.arrows) { const fc = sFace[u.id & MASK] < 0 ? -1 : 1; for (let q = 0; q < na; q++) {
    const a = u.arrows[q]; if (!a) continue;
    const bx = fc * (a.back || 0) * r * 0.35, by = -r * (1.25 - (a.t || 0) * 0.7), an = fc > 0 ? (a.ang || 0) : Math.PI - (a.ang || 0);
    if (xRot === 0) FX.stuckArrow(x + bx, y - z + by, an, -1);
    else { const cs = Math.cos(xRot), sn = Math.sin(xRot), py = by + xPiv; FX.stuckArrow(x + cs * bx - sn * py, y - z - xPiv + sn * bx + cs * py, an + xRot, -1); }
  } }
  // plague flies: 2 round a sick unit, 1 round every third plague carrier (OG game.js:21159-21161)
  const sick = u.plague > 0, carrier = u.def && u.def.plagueCarrier === true && u.id % 3 === 0;
  if (sick || carrier) FX.fliesAt(x, y - z, r, sick ? 2 : 1, u.id, NOW);
  if (u.burning > 0 && !OWN_FIRE.has(ent.type)) FX.fireOn(x, y - z + (sink > 0 ? sink * 0.5 : 0), Math.max(0.6, kk * (ent.defR > 12 ? 1.25 : 1)), RT, ph, ((u.id & 3) === 0));
  if (u.stun > 0.3 && z <= 0.5 && !(u.def && u.def.prop)) FX.stunOn(x, y - z - Math.min(46, 30 * kk) - 2, kk, RT, ph);
}

function drawUnits(world, alpha) {
  const units = world.units;
  if (!units || !units.length) return;
  ensure(units.length + JAW_CAP);
  let n = 0, na = 0;
  nJaw = 0; jawOf.clear(); jawBy.clear();
  for (let i = 0; i < units.length && nJaw < JAW_CAP; i++) {   // gators holding someone (OG game.js:20768-20778)
    const g = units[i];
    if (!g || g.dead || !g.b) continue;
    const ge = SP.entOf(g.type).ent;
    // gator (OG b.jaws) or an entry that says whom it holds (STEP4: trex holds(u) -> victim id, 0 none)
    const vid = ge.type === 'gator' ? (g.b.jaws > 0 ? g.b.jaws : 0) : ge.e.holds ? ge.e.holds(g) : 0;
    if (!(vid > 0)) continue;
    const vic = world.unitById ? world.unitById(vid) : null;
    if (!vic || vic === g) continue;
    jawG[nJaw] = i; jawOK[nJaw] = 0; jawOf.set(vic, nJaw); jawBy.set(g, nJaw); nJaw++;
  }
  const vt = NOW - (1 - alpha) * STEP;   // OG V: the interpolated sim time this frame shows
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u || u.dead) continue;
    if (u.inside >= 0) continue;   // OURS step 6: swallowed (worm, king slime, UFO): its swallower draws what shows
    const px = u.px ?? u.x, py = u.py ?? u.y;
    let x = px + (u.x - px) * alpha, y = py + (u.y - py) * alpha;
    const sl = u.id & MASK;
    if (sStopId[sl] !== u.id) { sStopId[sl] = u.id; sSeenStop[sl] = -1e9; sFrozenUntil[sl] = -1e9; }
    if (u.stopAt > sSeenStop[sl]) { sSeenStop[sl] = u.stopAt; sFrozenUntil[sl] = vt + HIT_STOP; sFrozenX[sl] = x; sFrozenY[sl] = y; }
    if (vt < sFrozenUntil[sl]) { x = sFrozenX[sl]; y = sFrozenY[sl]; }
    const pz = u.pz ?? u.z ?? 0;
    let z = Math.max(0, pz + ((u.z || 0) - pz) * alpha);
    if (u.climb > 0) z += u.climb * (u.type === 'ape' ? PERCH_APE : PERCH);
    if (nJaw && jawOf.has(u)) z = 0;   // held in jaws: drawn at the mouth (drawUnit), never in the air pass (the trex sim lifts it)
    ix[i] = x; iy[i] = y; iz[i] = z;
    const sortY = Math.max(0, y + 2000 + (u.climb > 0 ? 40 * u.climb : 0));
    const air = z > 14 && !(u.climb > 0);
    if (air) airKeys[na++] = Math.floor(sortY * 8) * 65536 + i;
    else keys[n++] = Math.floor(sortY * 8) * 65536 + i;
  }
  // shadows of airborne units on the ground
  for (let j = 0; j < na; j++) {
    const i = airKeys[j] % 65536, u = units[i];
    const k = Math.min(1.7, Math.max(0.55, (u.radius || 8) / 9.5));
    FX.shadowAt(ix[i], iy[i], k * (u.radius > 14 ? 1.5 : 0.8), Math.max(0.35, 1 - iz[i] / 220));
  }
  for (let r = 0; r < nJaw; r++) { const gi = jawG[r]; if (iz[gi] > 14) continue; keys[n++] = Math.floor(Math.max(0, iy[gi] + 2002.5) * 8) * 65536 + units.length + r; }
  const ks = keys.subarray(0, n); ks.sort();
  for (let j = 0; j < n; j++) { const i = ks[j] % 65536; if (i >= units.length) drawJaw(i - units.length); else drawUnit(world, units[i], ix[i], iy[i], iz[i]); }
  if (na) {
    const as = airKeys.subarray(0, na); as.sort();
    for (let j = 0; j < na; j++) { const i = as[j] % 65536; drawUnit(world, units[i], ix[i], iy[i], iz[i]); }
  }
}

// ---------------------------------------------------------------- corpses
const MACH = new Map();   // type -> def.machine (STEP4 siege + pirate machines)
function isMachine(t) { let m = MACH.get(t); if (m === undefined) { const d = getDef(t); m = !!(d && d.machine); MACH.set(t, m); } return m; }
function scanCorpses(world) {
  const list = world.corpses;
  if (world !== lastWorld) { lastWorld = world; lastCorpseId = 0; if (list) for (const c of list) if (c && c.id > lastCorpseId) lastCorpseId = c.id; return; }
  if (!list || !list.length) return;
  let maxId = lastCorpseId;
  for (let j = 0; j < list.length; j++) {
    const c = list[j];
    if (!c) continue;
    if (c.id !== undefined) { if (c.id <= lastCorpseId) continue; if (c.id > maxId) maxId = c.id; }
    else { if (stampedNoId.has(c)) continue; stampedNoId.add(c); }
    if ((c.z || 0) >= 4) continue;
    const mach = isMachine(c.type);
    if (mach && !c.burning) continue;   // STEP4: a broken machine leaves its wreck (painted in by the body pass), no blood
    const kind = c.burning || SCORCH.has(c.type) ? GROUND.DK.scorch : SLIMES.has(c.type) ? GROUND.DK.goo : GROUND.DK.splat;
    const fall = (c.fallDx ?? -1) >= 0 ? 1 : -1, r = c.r || 8;
    GROUND.stamp(kind, c.x + fall * r * 0.35, c.y + 1, Math.max(0.45, Math.min(2.4, r / 9.5)) * (c.burning ? 0.8 : 1));
  }
  if (maxId < lastCorpseId - 100000) maxId = 0;
  lastCorpseId = maxId;
}
// Necromancer raise (OG writeRaising, game.js:21481-21540): while casting (subState 1, 1.2 s) every kept corpse within
// 90 px of the target lifts by sin(pi h) and stands up by smoothstep(h); two glow rings grow at the target; a 0.4 s ring
// where a necromancer teleports.
const RAISE_CAP = 32, rX = new Float32Array(RAISE_CAP), rY = new Float32Array(RAISE_CAP), rH = new Float32Array(RAISE_CAP);
let nRaise = 0;
// A body no raise wants any more (cast cancelled: necro hit, stunned, killed) eases back down: lift and up each lose
// 1 - exp(-5 dt) a frame, dt = sim time since last frame capped at 0.1 s, until both < 0.001 (OG game.js:21522-21536).
const easing = new Map();   // corpse -> { lift, up, f }
let risingAt = 0;
function raising(world) {
  nRaise = 0;
  const us = world.units;
  if (!us) return;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (!u || u.dead || u.type !== 'necro') continue;
    const b = u.b || NOB;
    const ht = NOW - (b.hopAt ?? -9);
    if (ht >= 0 && ht < 0.4) { const e = ht / 0.4; FX.glowRingAt(u.x, u.y, 48 * (0.3 + 0.7 * e), 0.9 * (1 - e), 1); }
    if (u.subState !== 1 || !b.corpse || nRaise >= RAISE_CAP) continue;
    const h = Math.max(0, Math.min(1, 1 - (b.timer - NOW) / 1.2));
    rX[nRaise] = b.corpse.x; rY[nRaise] = b.corpse.y; rH[nRaise] = h; nRaise++;
    for (let t = 0; t < 2; t++) { const e = Math.min(1, 1.4 * h - 0.25 * t); if (e > 0) FX.glowRingAt(b.corpse.x, b.corpse.y, 65 * e, (0.35 + 0.55 * h) * (t === 0 ? 1 : 0.6), t); }
  }
}
// Floppy bodies (OURS): bodies no longer fade at 1.1 s. A body that flew (sim combat/death.js fling) tumbles about its
// middle, then rolls onto its side and its limbs flop; once it has settled and nobody holds it (OG's fade point, 0.75 s,
// and 0.6 s after it stopped), it is painted into the ground layer for good (GROUND.stampBody) and no longer drawn live.
// Held bodies (necro kept, ants, rats) stay live as in OG. Clear wipes the ground.
const stamped = new WeakSet(), bodyS = new WeakMap();   // corpse -> { rot, landT, flew, last }
// Attack 4 (L4): a made unit edited or deleted while its bodies still lie live (not yet painted into the ground): they
// were drawn from the type's entry, so after forgetType they turned into the NEW recipe (a dead person became a dead
// beast) or, deleted, into the grey blob, and were painted into the ground like that. Now each such body keeps the
// entry it died with (pinned at forgetType; the old entry still paints its own recipe).
const pinned = new WeakMap();   // corpse -> { ent, risen }
const corpseEnt = (c) => pinned.get(c) || SP.entOf(c.type);
const SETTLE = 0.6;
function visibleBody(c, now) {
  const age = now - (c.t ?? c.time ?? 0);
  return age >= 0 && !c.removed && c.raised !== 1 && c.eaten !== 1 && c.shape !== 'snake';
}
function meatAlpha(c) { const full = 0.3 * (c.r || 8) * (c.r || 8), left = full > 0 && c.meat !== undefined ? Math.min(1, c.meat / full) : 1; return 0.3 + 0.7 * left; }
const STAMP = [];   // [key, a, b, c, d, e, f] * parts, sim px
function drawCorpses(world) {
  raising(world);
  const edt = Math.max(0, Math.min(0.1, NOW - risingAt)); risingAt = NOW;
  const eh = 1 - Math.exp(-5 * edt);
  const list = world.corpses;
  if (!list || !list.length) { if (easing.size) easing.clear(); return; }
  for (let j = 0; j < list.length; j++) {
    const c = list[j];
    if (!c) continue;
    const ageR = NOW - (c.t ?? c.time ?? 0);
    if (stamped.has(c)) {   // painted into the ground: only its last flames (OG writeBody fade, 1.1 s)
      if (c.burning && ageR < FADE1 && visibleBody(c, NOW)) { const ft = 1 - ageR / FADE1, te = corpseEnt(c), kz = Math.min(1.7, Math.max(0.55, (c.r || te.ent.defR) / te.ent.defR)) * te.ent.scale; ctx.globalAlpha = ft * (235 / 255); FX.fireOn(c.x, c.y + 2, Math.max(0.5, kz * 0.8) * (0.4 + 0.6 * ft), (c.t || 0) + ageR, ((c.id || j) * 0.13) % 1, false); ctx.globalAlpha = 1; }
      continue;
    }
    if (!visibleBody(c, NOW)) continue;
    const a = meatAlpha(c);
    const te = corpseEnt(c), ent = te.ent;
    if (ent.drawUnit && c.shape === 'snake') continue;
    let col = colIdOf(c.team); const dead = c.burning ? 2 : 1, v = boilV(RT, ((c.id || j) * 0.37) % 1);
    if (c.type === 'frog' && c.curseType) col = SP.colId(SP.entOf(c.curseType).ent.own);   // as the living frog (OG game.js:22087)
    const bare = c.hatless ? 1 : 0, kin = ent.kindled && c.kindled ? 1 : 0;
    const k = Math.min(1.7, Math.max(0.55, (c.r || ent.defR) / ent.defR)) * ent.scale;
    const age = corpseAge(c, NOW), top = c.type === 'giant' ? 0.384 : 0.24;   // topple 0.24 s, Giant 0.384 s (OG game.js:22051-22053)
    const q = Math.min(1, Math.max(0, age / top)), e = q * q * (3 - 2 * q);
    const side = (c.side ?? 1) >= 0 ? 1 : -1, fall = (c.fallDx ?? -side) >= 0 ? 1 : -1;
    let lift = 0, up = 0, want = false;
    if (nRaise && c.kept === 1 && c.raised !== 1 && c.eaten !== 1 && !(c.colony > 0) && c.undead !== 1) {
      for (let n = 0; n < nRaise; n++) { const dx = c.x - rX[n], dy = c.y - rY[n]; if (dx * dx + dy * dy > 8100) continue; const h = rH[n]; want = true; lift = Math.max(lift, Math.sin(Math.PI * h)); up = Math.max(up, h * h * (3 - 2 * h)); }
    }
    if (want) { const s = easing.get(c); if (s) { s.lift = lift; s.up = up; s.f = frame; } else easing.set(c, { lift, up, f: frame }); }
    else if (easing.size) {
      const s = easing.get(c);
      if (s) { s.lift -= s.lift * eh; s.up -= s.up * eh; s.f = frame; if (s.lift < 0.001 && s.up < 0.001) easing.delete(c); else { lift = s.lift; up = s.up; } }
    }
    const ee = e * (1 - up);
    // where and how it lies
    const hgt = ent.box[3], z = Math.max(0, c.z || 0), air = c.fly === 1 && z > 0.5;
    let st = bodyS.get(c);
    if (!st && (c.fly === 1 || c.vx !== undefined)) { st = { rot: 0, landT: -1, flew: true, last: NOW }; bodyS.set(c, st); }
    let fx = c.x, fy = c.y - lift * 7, rot = 0, pc = 0, flopT = age;
    if (st && ent.lie === 'side') {   // flew: tumble about the middle while up, then roll down onto its side
      const dt = Math.max(0, Math.min(0.1, NOW - st.last)); st.last = NOW;
      const spd = Math.hypot(c.vx || 0, c.vy || 0);
      if (air) { st.rot += (c.vx >= 0 ? 1 : -1) * Math.min(14, 4 + spd / 25) * dt; st.landT = -1; }
      else {
        if (st.landT < 0) { st.landT = NOW; const tgt = (Math.sin(st.rot) >= 0 ? 1 : -1) * Math.PI / 2; let r0 = st.rot; while (r0 - tgt > Math.PI) r0 -= 2 * Math.PI; while (r0 - tgt < -Math.PI) r0 += 2 * Math.PI; st.r0 = r0; st.tgt = tgt; }
        const t = NOW - st.landT, dec = Math.exp(-6 * t) * (Math.cos(11 * t) + 0.55 * Math.sin(11 * t));
        st.rot = st.tgt + (st.r0 - st.tgt) * dec;
        flopT = t;
      }
      rot = st.rot * (1 - up);
      pc = hgt * 0.5 * k * S;                                     // about the middle of the body
      const lie = Math.abs(Math.sin(rot));
      fy = c.y + 1 - lift * 7 + hgt * 0.5 * k * lie * 0.78 - z;
    } else if (st) {   // lie 'none' (animals, horses: the dead frame already lies as it should): tumble while up, settle flat
      const dt = Math.max(0, Math.min(0.1, NOW - st.last)); st.last = NOW;
      const spd = Math.hypot(c.vx || 0, c.vy || 0);
      if (air) { st.rot += (c.vx >= 0 ? 1 : -1) * Math.min(10, 3 + spd / 30) * dt; st.landT = -1; }
      else {
        if (st.landT < 0) { st.landT = NOW; let r0 = st.rot % (2 * Math.PI); if (r0 > Math.PI) r0 -= 2 * Math.PI; else if (r0 < -Math.PI) r0 += 2 * Math.PI; st.r0 = r0; }
        const t = NOW - st.landT; st.rot = st.r0 * Math.exp(-6 * t) * (Math.cos(11 * t) + 0.55 * Math.sin(11 * t)); flopT = t;
      }
      rot = st.rot * (1 - up); pc = hgt * 0.5 * k * S;
      fy = c.y + 1 - lift * 7 - z;
    } else if (ent.lie === 'side') {
      fx = c.x - fall * hgt * k * 0.42 * ee; fy = c.y + 1 - lift * 7; rot = fall * Math.PI / 2 * ee;
    }
    ctx.globalAlpha = a;
    const rig = ent.e.rig;
    let drew = false;
    if (RIG_ON && rig && RIG.has(rig.driver)) {
      const rp = RIG.partsOf(ent, 0, te.risen > 0);
      if (rp && RIG.body(ent, rp, c.id || j, air ? 0 : flopT, air, NOW) && partsReady(ent, col, v, dead, te.risen, bare, kin)) {
        setBase(fx * S, fy * S, side, k * S, 1, rot, pc);
        drawParts(0, a);
        drew = true;
      }
    }
    let spr = null;
    if (!drew) {
      spr = spriteFor(ent, col, 0, v, dead, te.risen, bare, kin);   // dead frame = poses[0]
      if (!spr) { ctx.globalAlpha = 1; continue; }
      setBase(fx * S, fy * S, side, k * S, 1, rot, pc);
      ctx.setTransform(B[0] / spr.k, B[1] / spr.k, B[2] / spr.k, B[3] / spr.k, B[4], B[5]);
      ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -spr.ax, -spr.ay, spr.sw, spr.sh);
    }
    // arrows stuck in the body, max 2 (as on the living unit): body-frame offset (facing x back, up) turned with the body,
    // shaft angle mirrored by the corpse's facing, plus the turn (OG writeArrowsIn game.js:21197-21211)
    const ar = c.arrows, nar = ar ? Math.min(2, ar.length) : 0;
    if (nar > 0) {
      const cr = c.r || ent.defR, cs = Math.cos(rot), sn = Math.sin(rot), py0 = pc / S;
      for (let qq = 0; qq < nar; qq++) {
        const ao = ar[qq]; if (!ao) continue;
        const bx = side * (ao.back || 0) * cr * 0.35, by = -cr * (1.25 - (ao.t || 0) * 0.7) + py0;
        FX.stuckArrow(fx + cs * bx - sn * by, fy - py0 + sn * bx + cs * by, (side > 0 ? (ao.ang || 0) : Math.PI - (ao.ang || 0)) + rot, -1);
      }
    }
    ctx.globalAlpha = 1;
    if (c.sick && a > 0.3) FX.fliesAt(c.x, c.y, c.r || 8, 2, c.id || j, NOW);   // OG game.js:22135
    // Flames on a body that died burning (OG writeBody game.js:22120-22133): strength t = 1 - age/1.1 scales their alpha and
    // size (0.4 + 0.6t), and they move with the body's own clock (death time + look age). A held body (necro kept, ants,
    // rats) stops at look age 0.75, so it keeps a faint (t = 0.32), small, still flame for good, as in OG.
    if (c.burning && age < FADE1) {
      const ft = 1 - age / FADE1;
      ctx.globalAlpha = ft * (235 / 255);
      FX.fireOn(c.x, c.y + 2 - z, Math.max(0.5, k * 0.8) * (0.4 + 0.6 * ft), (c.t || 0) + age, ((c.id || j) * 0.13) % 1, false);
      ctx.globalAlpha = 1;
    }
    // settled and nobody holds it: paint it into the ground for good
    const restT = st ? (st.landT >= 0 && c.fly !== 1 ? NOW - st.landT : -1) : ageR;
    if (!held(c) && !want && up === 0 && lift === 0 && c.fly !== 1 && z < 0.5 && ageR >= FADE0 && restT >= SETTLE) {
      STAMP.length = 0;
      const iS = 1 / S;
      if (drew) {
        const O = RIG.OUT, m = O.m;
        for (let i = 0; i < O.n; i++) {
          const o = i * 6, aa = m[o], bb = m[o + 1], cc = m[o + 2], dd = m[o + 3], e2 = m[o + 4], f2 = m[o + 5];
          STAMP.push(SP.key(ent.id, col, O.pose[i], 0, dead, te.risen, bare, kin),
            (B[0] * aa + B[2] * bb) * iS, (B[1] * aa + B[3] * bb) * iS, (B[0] * cc + B[2] * dd) * iS, (B[1] * cc + B[3] * dd) * iS,
            (B[0] * e2 + B[2] * f2 + B[4]) * iS, (B[1] * e2 + B[3] * f2 + B[5]) * iS);
        }
      } else STAMP.push(SP.key(ent.id, col, 0, 0, dead, te.risen, bare, kin), B[0] * iS, B[1] * iS, B[2] * iS, B[3] * iS, B[4] * iS, B[5] * iS);
      // Attack 11-16 (L4): stamp only once every frame it needs is baked. GROUND.stampBody bakes missing frames on the
      // spot (getNow), and a body usually settles while its dead frames still wait in a long queue (a big mixed battle),
      // so several bodies settling in one frame cost a whole bake each (rigged ones one per part): 50-300 ms frames.
      // Missing frames go to the front of the queue; the body stays drawn live until they are in.
      let ready = true;
      for (let q = 0; q < STAMP.length; q += 7) if (!SP.peek(STAMP[q])) { SP.get(STAMP[q]); ready = false; }
      if (!ready) continue;
      GROUND.stampBody(STAMP, a);
      if (nar > 0) {   // its stuck arrows go into the ground with it (same place + angle as drawn above)
        const cr = c.r || ent.defR, cs = Math.cos(rot), sn = Math.sin(rot), py0 = pc / S, hb = FX.arrowBitFor(-1);
        for (let qq = 0; qq < nar; qq++) {
          const ao = ar[qq]; if (!ao) continue;
          const bx = side * (ao.back || 0) * cr * 0.35, by = -cr * (1.25 - (ao.t || 0) * 0.7) + py0, an = (side > 0 ? (ao.ang || 0) : Math.PI - (ao.ang || 0)) + rot;
          GROUND.stampBit(hb, fx + cs * bx - sn * by - Math.cos(an) * 4.5, fy - py0 + sn * bx + cs * by - Math.sin(an) * 4.5, 0.6, an);
        }
      }
      stamped.add(c);
    }
  }
  if (easing.size) for (const [ec, s] of easing) if (s.f !== frame) easing.delete(ec);   // bodies gone or no longer drawn
  // dead snakes: their own body painter (ANIMALS drawCorpse), device px
  const sn = world.snakes;
  if (sn && sn.dead && sn.dead.length) {
    const ent = SP.entOf('snake').ent;
    if (ent.drawCorpse) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (let j = 0; j < sn.dead.length; j++) {
        const rec = sn.dead[j];
        try { ent.drawCorpse(ctx, rec, rec.x * S, rec.y * S, S, NOW); } catch (e) { ent.drawCorpse = null; console.warn('art: drawCorpse failed', e); break; }
      }
      ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
}

// ---------------------------------------------------------------- draw
// per-frame draw time ring for attack tools (2 performance.now() a frame)
const DT_RING = new Float32Array(4096); let dtN = 0;
export function drawTimes(reset = false) { const n = Math.min(dtN, 4096), out = Array.from(DT_RING.subarray(0, n)); if (reset) dtN = 0; return out; }
export function draw(c, world, view, alpha = 1) {
  const tDraw0 = performance.now();
  ctx = c; S = view.scale; NOW = world.time || 0; RT = performance.now() / 1000; frame++;
  FDT = lastRT > 0 ? Math.min(0.1, Math.max(0, RT - lastRT)) : 1 / 60; lastRT = RT;
  SP.setScale(S); SP.frameStart();
  if (!inited) init();
  info.now = NOW; info.rt = RT; info.world = world;
  SP.pump(misses > 0 ? 8 : 2.5);
  misses = 0;
  // ground + terrain + oil layers cover the whole WORLD (Part 2 step 2: the camera shows part of it), at LS x the
  // sprite scale: 1 unless the world would pass ~12 Mpx or the GPU's texture size (big desktop screens at dpr 2)
  const LS = layerScale(world.W, world.H, S), LSS = S * LS;
  const w = Math.ceil(world.W * LSS), h = Math.ceil(world.H * LSS);
  scanCorpses(world);
  const g = GROUND.ensure(w, h, LSS, world.W, world.H, world);   // STEP7 GROUND-ART: world -> the map's ground, sky, decorations
  c.setTransform(1 / LS, 0, 0, 1 / LS, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = true;
  c.drawImage(g, 0, 0);
  TER.drawLayers(c, world, LSS, w, h);
  c.setTransform(1, 0, 0, 1, 0, 0);
  FX.begin(c, S, NOW);
  if (world.map) GROUND.drawTop(c, world, S, RT);   // STEP7 GROUND-ART: flags, reeds, lily pads, slides over the terrain
  TER.drawProps(c, world, S, NOW, RT);
  if (world.map && world.map.secret && secretArt && secretArt.drawSecret) { try { secretArt.drawSecret(c, world, S, NOW, RT); } catch (e) { if (!secretErr) { secretErr = 1; console.warn('drawSecret', e); } } }   // STEP7
  const nf = TER.burningOil(world, oilBuf, 240);
  if (nf) FX.oilFires(oilBuf, nf, RT);
  drawCorpses(world);
  FX.drawProjectiles(world, alpha, RT, true);   // OURS step 6: PROJ kinds with ground: true (lava, ink, gas, webs on the floor)
  drawUnits(world, alpha);
  FX.drawProjectiles(world, alpha, RT);
  FX.drawEffects(RT);
  FX.drawSteam(world, RT);
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
  if (c.endFrame) c.endFrame();   // WebGL (render/gl2d.js): draw the frame's batch now
  DT_RING[dtN++ & 4095] = performance.now() - tDraw0;
}

let lsKey = '', lsVal = 1;
const LAYER_PX = 12e6;
function layerScale(W, H, S) {
  const k = W + 'x' + H + '@' + S;
  if (k === lsKey) return lsVal;
  let max = 8192;
  try { if (GPU.gl && GPU.gl.gl) max = Math.min(max, GPU.gl.gl.getParameter(GPU.gl.gl.MAX_TEXTURE_SIZE) || 4096); } catch (e) { max = 4096; }
  const pw = W * S, ph = H * S;
  lsKey = k; lsVal = Math.min(1, Math.sqrt(LAYER_PX / (pw * ph)), max / pw, max / ph);
  return lsVal;
}
export function handleEvents(events, world) { if (events && events.length) FX.handleEvents(events, world); }
// STEP8 (lead): a made unit's recipe changed or it was deleted: its look is built again from the new recipe.
export function forgetType(type) {
  const base = typeof type === 'string' && type.startsWith('risen_') ? type.slice(6) : type, list = info.world && info.world.corpses;
  if (list) for (const c of list) {   // attack 4 (L4): bodies still drawn live keep the entry they died with
    if (!c || stamped.has(c) || pinned.has(c) || (c.type !== base && c.type !== 'risen_' + base)) continue;
    const te = SP.entIf(c.type); if (te) pinned.set(c, te);
  }
  SP.dropType(type);
}
export function clear() { GROUND.clear(); FX.clear(); TER.reset(); easing.clear(); RIG.reset(); }

// Types a tool also brings onto the field (spawned by the sim).
const SPAWNS = { cavalry: ['knight', 'horse'], ant: ['soldierant', 'anthill'], necro: ['skeleton'], mage: ['frog'], ape: ['apecav'],
  // STEP4: crews and passengers spawned by machines
  ram: ['siegecrew'], catapult: ['siegecrew'], ballista: ['siegecrew'], siegetower: ['halberd'], cannon: ['gunner'], ship: ['deckhand'],
  // STEP6
  beehive: ['bee'], kingslime: ['bigslime', 'slimelet'],
  scarecrow: ['crow'] };   // attack 4 (L4): the scarecrow's crows were never prewarmed (first crow baked inside a frame)
// Attack 4 (L4): helpers a made unit's abilities spawn (sim/maker/abilities/support-life.js: Bees, Crows, Raise), read
// from its def. They come out at once (bees, crows) or as soon as bodies lie near (raise), long before a busy battle's
// queue reaches them: the first bee / crow / skeleton of a made unit baked inside the frame it rose (CNT.sync, 13-15 ms
// at 4x CPU). Now prewarmed like SPAWNS, and one frame of each is baked at the pick if the type has none yet.
const MADE_SPAWNS = { bees: 'bee', crows: 'crow', raise: 'skeleton' };
function madeSpawns(type) {
  const out = [], d = getDef(type), mk = d && d.maker;
  if (mk && Array.isArray(mk.abs)) for (const a of mk.abs) if (a && MADE_SPAWNS[a.id] && !out.includes(MADE_SPAWNS[a.id])) out.push(MADE_SPAWNS[a.id]);
  return out;
}
let pendingPrewarm = null;
export function prewarm(tool, teams) {
  if (!S) { pendingPrewarm = [tool, teams]; return; }   // picked before the first frame: run it then
  if (!tool || tool.kind !== 'unit') return;
  const helpers = madeSpawns(tool.type);
  const types = [tool.type].concat(SPAWNS[tool.type] || [], helpers);
  const cols = teams ? [1, 2] : [0];
  for (const type of helpers) { const { ent, risen } = SP.entOf(type); if (!SP.fallback(ent.id)) SP.getNow(SP.key(ent.id, cols[0], 0, 0, 0, risen)); }
  // boil variant 0 of every pose first (the unit looks right at once), then the other two variants, then extras + dead
  for (const type of types) {
    const { ent, risen } = SP.entOf(type);
    for (const col of cols) {
      if (type === tool.type) SP.getNow(SP.key(ent.id, col, 0, 0, 0, risen));
      for (let p = 0; p < ent.poses.length; p++) SP.want(SP.key(ent.id, col, p, 0, 0, risen));
    }
  }
  // floppy-body parts (rig.js extra poses 'r:*') next: a rigged unit draws its whole sprite until every part is baked
  for (const type of types) {
    const { ent, risen } = SP.entOf(type);
    if (!ent.e.rig) continue;
    for (const col of cols) for (let p = ent.poses.length; p < ent.all.length; p++) if (ent.all[p].startsWith('r:')) SP.want(SP.key(ent.id, col, p, 0, 0, risen));
    for (const col of cols) for (let p = ent.poses.length; p < ent.all.length; p++) if (ent.all[p].startsWith('r:')) SP.want(SP.key(ent.id, col, p, 0, 1, risen));
  }
  // dead frames next: the first deaths come soon after contact (a body without its frame borrows the alive one)
  for (const type of types) { const { ent, risen } = SP.entOf(type); for (const col of cols) SP.want(SP.key(ent.id, col, 0, 0, 1, risen)); }
  for (const type of types) {
    const { ent, risen } = SP.entOf(type);
    for (const col of cols) for (let v = 1; v < 3; v++) for (let p = 0; p < ent.poses.length; p++) SP.want(SP.key(ent.id, col, p, v, 0, risen));
  }
  for (const type of types) {
    const { ent, risen } = SP.entOf(type);
    for (const col of cols) for (let p = ent.poses.length; p < ent.all.length; p++) SP.want(SP.key(ent.id, col, p, 0, 0, risen));
    for (const col of cols) SP.want(SP.key(ent.id, col, 0, 0, 2, risen));
  }
}

// ---------------------------------------------------------------- toolbar icons
export function drawIcon(c, tool, w, h) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  if (!tool) return;
  if (tool.kind !== 'unit') { TER.drawSwatch(c, tool.kind, w, h); return; }
  const { ent } = SP.entOf(tool.type);
  // paint at ~3x the size it is shown, at most 4 px per sprite px (attack 11-16, L4: a flat 4 painted the bosses and
  // machines at 500-800 px for a 102 x 82 card: 25-40 ms each, a long frame per icon while the tool bar fills in)
  const fit = Math.min(w * 0.9 / (ent.box[0] * ent.scale), h * 0.88 / (ent.box[1] * ent.scale));
  const kp = Math.max(1.5, Math.min(4, 3 * fit));
  const { cv } = SP.paintStandalone(tool.type, ent.all[0], 0, kp);
  // crop to the painted pixels, fit into the card with a small margin
  const g = cv.getContext('2d', { willReadFrequently: true }), d = g.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = Math.min(w * 0.9 / bw, h * 0.88 / bh);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(cv, x0, y0, bw, bh, (w - bw * sc) / 2, (h - bh * sc) / 2, bw * sc, bh * sc);
}
export const debugInfo = () => ({ ...SP.stats(), loadErrors: SP.loadErrors, sources: SP.sources(), gl: GPU.gl ? GPU.gl.stats() : null });
