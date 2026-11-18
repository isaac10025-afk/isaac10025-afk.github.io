// Hydra (OURS, Bosses tab, Part 2 step 6): a many-headed serpent. Starts with 3 heads (max 7), each biting on its own
// clock (60, reach r + 70, every 1.4 s). Every 15 % of its max hp lost, a head is cut off (it drops) and 4 s later TWO
// grow back from the stump, unless the hydra burns before then: fire seals the stump for good (it smokes). The middle
// head breathes fire every 6 s (cone 40 degrees, 110 px, sets alight: OG `flame` projectiles, like the dragon's).
// Owner: BOSSES-SIM.
// Pose (STEP6.md): b.heads = necks in use (slots 0..heads-1; slot 0 is the middle one); per slot b.hs[i] 0 idle sway,
// 1 bite, 2 stump, 3 growing, 4 breath, b.hT[i] = world.time that state started, b.hb[i] = 1 for a stump that fire
// sealed (stays a stump, smokes). Body: walk0/walk1.
import { fireProjectile } from '../../combat/index.js';
import {
  boss, initBag, targetOf, setState, canAuto, shrug, hittable, high, hunt, idle,
  strikeDown, splatNoise, hypot, angleDiff, STATE, ENEMY, BOSS,
} from './_lib.js';

const T = {
  radius: 26, hp: 7500, mass: 50,   // STEP6 size, hp 5000 -> 7500: at 5000 the mixed 150 killed it in 13 s (it took 14 with it)
  walk: 25, run: 45,                // px/s
  charge: 600,                      // px: a target closer than this -> it runs at it (walking in under fire got it shot to bits)
  startHeads: 3,                    // heads when placed
  maxHeads: 7,                      // necks at most
  bite: 60,                         // per head bite ...
  biteJitter: 6,                    // ... ± this
  biteReach: 70,                    // ... reaching this far past its body edge
  biteEvery: 1.4,                   // s per head (each on its own clock)
  bitePush: 120,                    // push on a bitten unit (÷ mass)
  biteStun: 0.2,                    // s
  bitePose: 0.35,                   // s of a head's bite pose
  cutEvery: 0.15,                   // share of max hp lost per head cut off
  regrow: 4,                        // s from the cut until two heads grow from the stump (unless it burned meanwhile)
  growTime: 1,                      // s a new head takes to grow before it bites
  breathEvery: 6,                   // s between fire breaths
  breathCone: 40 * Math.PI / 180,   // rad: the whole cone
  breathRange: 110,                 // px past its body edge
  breathTime: 1,                    // s a breath lasts ...
  breathFlameEvery: 2,              // ... one flame every 2 ticks
  flameSpeed: 420,                  // px/s a flame leaves the mouth (OG flame drag slows it: ~110 px in 0.4 s)
  flameLife: 0.4,                   // s
  flameDmg: 5,                      // per flame (alight: sets units on fire)
  firstBreath: 2,                   // s after it is placed before its first breath
};
const IDLE = 0, BITE = 1, STUMP = 2, GROW = 3, BREATH = 4;   // b.hs codes (STEP6.md)
const HQ = new Array(64), CAND = new Array(64);

function aliveHead(s) { return s === IDLE || s === BITE || s === BREATH; }
function setHead(w, b, i, s) { b.hs[i] = s; b.hT[i] = w.time; }
function middleHead(b) { for (let i = 0; i < b.heads; i++) if (aliveHead(b.hs[i])) return i; return -1; }

// Every 15 % of max hp lost: one head comes off (a random living one; a growing one if that's all there is).
function cuts(w, u) {
  const b = u.b;
  while (u.hp > 0 && u.maxHp - u.hp >= (b.cuts + 1) * T.cutEvery * u.maxHp) {
    b.cuts++;
    let n = 0;
    for (let i = 0; i < b.heads; i++) if (aliveHead(b.hs[i])) CAND[n++] = i;
    if (n === 0) for (let i = 0; i < b.heads; i++) if (b.hs[i] === GROW) CAND[n++] = i;
    if (n === 0) continue;
    const i = CAND[Math.floor(w.rng() * n)];
    setHead(w, b, i, STUMP); b.hb[i] = 0;
    if (b.mouth === i) b.mouth = -1;
    const a = u.heading + (i === 0 ? 0 : (i & 1 ? 1 : -1) * 0.35 * Math.ceil(i / 2));
    w.emit('headoff', { x: u.x + Math.cos(a) * u.radius, y: u.y - u.radius, slot: i, type: u.type, ang: a });   // STEP6 AUDIO + art: a head drops
    w.emit('roar', { x: u.x, y: u.y, v: 2, type: u.type });
  }
}
// Stumps: fire seals a fresh one for good; 4 s after the cut an unsealed stump grows two heads (room permitting).
function stumps(w, u) {
  const b = u.b, now = w.time, burning = u.burning > 0;
  for (let i = 0, n = b.heads; i < n; i++) {
    const s = b.hs[i];
    if (s === STUMP && b.hb[i] === 0) {
      if (burning) { b.hb[i] = 1; w.emit('steam', { x: u.x, y: u.y - u.radius, size: 20, thick: 1.4 }); continue; }   // sealed: it smokes
      if (now - b.hT[i] >= T.regrow) {
        setHead(w, b, i, GROW);
        if (b.heads < T.maxHeads) { const j = b.heads++; setHead(w, b, j, GROW); b.hb[j] = 0; b.hn[j] = now + T.growTime; }
        b.hn[i] = now + T.growTime;
        w.emit('grow', { x: u.x, y: u.y - u.radius, type: u.type, heads: b.heads });   // STEP6 AUDIO: squelch + hiss
      }
    } else if (s === GROW && now - b.hT[i] >= T.growTime) setHead(w, b, i, IDLE);
    else if (s === BITE && now - b.hT[i] >= T.bitePose) setHead(w, b, i, IDLE);
  }
}
// Every ready head bites something in reach: the target first, the others spread over the enemies around.
function bites(w, u, t) {
  const b = u.b, now = w.time;
  let ready = 0;
  for (let i = 0; i < b.heads; i++) if (b.hs[i] === IDLE && now >= b.hn[i]) ready++;
  if (ready === 0 || !canAuto(w, u)) return;
  const R = u.radius + T.biteReach * u.shrink;
  const n = w.queryMask(u.x, u.y, R + BOSS.MARGIN, ENEMY[u.faction], HQ, HQ.length);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const o = HQ[k]; HQ[k] = null;
    if (!hittable(u, o) || high(o) || o.def.prop || (o.unseen > 0 && o.unseen < 1)) continue;
    if (hypot(o.x - u.x, o.y - u.y) <= R + o.radius) CAND[m++] = o;
  }
  if (m === 0) return;
  let tIn = -1;
  if (t) for (let k = 0; k < m; k++) if (CAND[k] === t) tIn = k;
  if (u.possessed === 1 && tIn < 0) { for (let k = 0; k < m; k++) CAND[k] = null; return; }   // the player picks what it bites
  let j = 0;
  for (let i = 0; i < b.heads; i++) {
    if (b.hs[i] !== IDLE || now < b.hn[i]) continue;
    const v = u.possessed === 1 ? CAND[tIn] : CAND[((tIn >= 0 ? tIn : 0) + j) % m];   // the target first, then the others in turn
    j++;
    strikeDown(w, u, v, T.bite, T.biteJitter, T.bitePush, T.biteStun);   // a head on a long neck comes down from above: shields don't help
    setHead(w, b, i, BITE);
    b.hn[i] = now + T.biteEvery * (0.9 + 0.2 * w.rng());
  }
  for (let k = 0; k < m; k++) CAND[k] = null;
}
// Fire breath from the middle head: a cone of OG alight flames for 1 s.
function startBreath(w, u, aim) {
  const b = u.b, i = middleHead(b);
  if (i < 0) return false;
  b.mouth = i; b.t0 = aim; b.t1 = w.time;
  setHead(w, b, i, BREATH);
  b.next = w.time + T.breathEvery;
  w.emit('flame', { x: u.x, y: u.y, v: 3, type: u.type });
  return true;
}
function breathStep(w, u) {
  const b = u.b, i = b.mouth;
  if (i < 0 || b.hs[i] !== BREATH) { b.mouth = -1; return; }
  const age = w.time - b.hT[i];
  if (age >= T.breathTime) { setHead(w, b, i, IDLE); b.mouth = -1; return; }
  u.face = b.t0;
  if ((w.tick + u.index) % T.breathFlameEvery !== 0) return;
  const sweep = Math.sin(age / T.breathTime * Math.PI * 2) * 0.5, a = b.t0 + T.breathCone * (sweep + 0.25 * (w.rng() - w.rng()));
  const mx = u.x + Math.cos(b.t0) * u.radius * 0.9, my = u.y + Math.sin(b.t0) * u.radius * 0.9;
  const sp = T.flameSpeed * (0.9 + 0.2 * w.rng()), life = T.flameLife * u.shrink * (0.9 + 0.2 * w.rng());
  const p = fireProjectile(w, 'flame', u, mx + Math.cos(a) * 100, my + Math.sin(a) * 100, {
    x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, angle: a, speed: sp, life, damage: T.flameDmg, scale: 1.6, rise: u.radius * 1.2, alight: 1,
  });
  if (p) u.attack = 1;
}

function brain(w, u) {
  const b = u.b, now = w.time;
  shrug(w, u);
  u.goalX = 0; u.goalY = 0; u.face = NaN;
  cuts(w, u);
  stumps(w, u);
  if (b.mouth >= 0) breathStep(w, u);
  const t = targetOf(w, u);
  bites(w, u, t);
  if (!t) { if (b.mouth < 0) idle(w, u); return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = hypot(dx, dy) || 0.001, a = Math.atan2(dy, dx);
  if (b.mouth < 0 && now >= b.next && canAuto(w, u) && !high(t) && d <= u.radius + T.breathRange * u.shrink + t.radius) startBreath(w, u, a);
  if (b.mouth >= 0) { setState(u, STATE.ENGAGE); return; }
  if (d <= u.radius + t.radius + T.biteReach * 0.6 * u.shrink) { setState(u, STATE.ENGAGE); u.face = a; return; }
  hunt(w, u, t, d < T.charge ? T.run : T.walk, d < T.charge ? STATE.CHARGE : STATE.ADVANCE);
}

const D = boss({
  type: 'hydra', og: 'Hydra (ours)',   // ours (no OG unit): the name is for tracing only
  radius: T.radius, mass: T.mass, maxHp: T.hp, strength: 30,
  walkSpeed: T.walk, runSpeed: T.run, maxSpeed: 65, accel: 160, decel: 240, turnRate: 2,
  flammability: 0.5, density: 6,
  weapon: { range: T.radius * 1.1 + T.breathRange },   // possess: aim reach
  init(w, u) {
    initBag(u);
    const b = u.b;
    b.heads = T.startHeads; b.cuts = 0; b.mouth = -1;
    b.hs = new Uint8Array(T.maxHeads); b.hT = new Float64Array(T.maxHeads); b.hb = new Uint8Array(T.maxHeads); b.hn = new Float64Array(T.maxHeads);
    for (let i = 0; i < T.maxHeads; i++) { b.hT[i] = w.time; b.hn[i] = w.time + 0.3 + T.biteEvery * w.rng(); }
    b.next = w.time + T.firstBreath;
  },
  // possessed, attack held at nobody: fire breath at the aim (when ready), else the heads snap at the air
  possessFire(w, u, aim) {
    const b = u.b;
    if (b.mouth < 0 && w.time >= b.next && startBreath(w, u, aim)) return;
    if (u.cooldown > 0) return;
    for (let i = 0; i < b.heads; i++) if (b.hs[i] === IDLE) { setHead(w, b, i, BITE); break; }
    u.attack = 1; u.cooldown = 0.5;
    w.emit('swing', { x: u.x, y: u.y, type: u.type, id: u.id });
  },
  brain,
});

export default D;
export { T };
