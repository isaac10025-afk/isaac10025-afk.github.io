// Ant colonies: the colony store (OG module 619, game.js:17535-17657) and the "ants" tick step 19
// (OG game.js:5399-5461; scouting/settled/send-out/dig helpers game.js:3592-3884; entrances game.js:12240-12248).
// Owner: ANIMALS. Exports run(world) for tick.js plus the colony helpers the ant/anthill brains use.
// Corpse fields read (CORE-B w.corpses, combat/death.js addCorpse): x, y, z, t (death time), type, r (radius),
// burning, sick, eaten, kept, colony, removed. Written: x, y (dragging), colony (OG claim, index+1), claimed (index or -1,
// CORE-B's name for the same claim), eaten, kept, antSeen.
import * as FAC from '../../factions.js';
import { getDef } from '../../defs.js';
import { RADIUS_SCALE } from '../../const.js';
import { fac, hyp, rnd, range, rint, hasWalls, hasWater, wallAt, depthAt, lightUp, givePlague, WET } from './lib.js';
import { onReside } from '../../world.js';

export const MAX_COLONIES = 4; // OG game.js:17570
export const MAX_CLAIMS = 12; // OG game.js:17571
export const SCOUTING = 0, SETTLED = 1; // OG game.js:17572
export const JOB = Object.freeze({ Home: 0, Digging: 1, Defending: 2, Foraging: 3, Returning: 4, Carrying: 5 }); // OG game.js:11934
export const HILL_SENSE = 110; // OG game.js:11932 (M)
const DIG_TIME = 3; // OG game.js:11933 (E)
const FOOD_PER_MASS = 3; // OG game.js:11936 (j)
const OUT_TIMER = 3; // OG game.js:11937 (T)
export const ALARM_TIME = 5; // OG game.js:12152 (N)
const MAX_SIZE = 3; // OG game.js:12176 (F)
const HILL_R0 = 7; // OG game.js:12177 (G)
const HILL_R_PER = 5; // OG game.js:12178 (B)
const HILL_HP0 = 150; // OG game.js:12182 (z)
const HILL_HP_PER = 150; // OG game.js:12183 (Y)
const ENTRANCE_SPREAD = 0.62; // OG game.js:12248 (X)
const SITE_RING = 26; // OG game.js:3592 (Wt)
const SITE_ENEMY_R = 150; // OG game.js:3593 (Kt)
const CORPSE_CLAIM_TIME = 90; // OG game.js:3771
const MAX_OUT = 15; // OG game.js:3812
const POP_CAP = 40; // OG game.js:3753
const EGG_FOOD = 1.5; // OG game.js:3753
const HATCH_TIME = 3; // OG game.js:3754

const hostileF = FAC.factionHostile || ((a, b) => a !== b);
const teamF = FAC.teamFaction || ((t) => (t === 0 ? 20 : 21));
const ANTS = fac('Ants');
const PROPS = fac('Props');

// hill radius for a colony size (OG D, game.js:12179-12181)
export function hillRadius(size) { return (HILL_R0 + HILL_R_PER * size) * RADIUS_SCALE; }

class Colonies {
  constructor() {
    const n = MAX_COLONIES, q = n * MAX_CLAIMS;
    this.alive = new Uint8Array(n); this.state = new Uint8Array(n); this.group = new Int32Array(n); this.team = new Int32Array(n);
    this.bornAt = new Float64Array(n); this.x = new Float64Array(n); this.y = new Float64Array(n);
    this.hill = new Int32Array(n); // hill unit id, -1 none (read by steering)
    this.hillUnit = new Array(n).fill(null);
    this.workers = new Uint16Array(n); this.soldiers = new Uint16Array(n); this.dug = new Float64Array(n); this.size = new Float64Array(n);
    this.nextOut = new Float64Array(n); this.food = new Float64Array(n); this.eggs = new Uint16Array(n); this.nextHatch = new Float64Array(n);
    this.claims = new Array(q).fill(null); this.claimedAt = new Float64Array(q);
    this.wanted = new Array(n).fill(null); this.wantedMore = new Int32Array(n);
    this.plague = new Float64Array(n); this.hillHp = new Float64Array(n); this.alarmUntil = new Float64Array(n);
    this.nextPour = new Float64Array(n); this.foe = new Int32Array(n);
    this.spawning = 0;
    this.clear();
  }
  clear() { // OG game.js:17607-17614
    this.alive.fill(0); this.hill.fill(-1); this.hillUnit.fill(null); this.foe.fill(-1); this.claims.fill(null); this.wanted.fill(null);
    this.spawning = 0;
  }
  // colony faction: its team faction in Team battle, else Ants (OG game.js:17615-17617)
  faction(e) { const t = this.team[e]; return t >= 0 ? teamF(t) : ANTS; }
  // OG game.js:17618-17651
  create(x, y, group, time, team = -1) {
    for (let r = 0; r < MAX_COLONIES; r++) {
      if (this.alive[r] === 1) continue;
      this.alive[r] = 1; this.state[r] = SCOUTING; this.group[r] = group; this.team[r] = team; this.bornAt[r] = time;
      this.x[r] = x; this.y[r] = y; this.hill[r] = -1; this.hillUnit[r] = null; this.workers[r] = 0; this.soldiers[r] = 0;
      this.dug[r] = 0; this.size[r] = 0; this.nextOut[r] = time; this.food[r] = 0; this.eggs[r] = 0; this.plague[r] = 0;
      this.nextHatch[r] = 0; this.hillHp[r] = 0; this.alarmUntil[r] = 0; this.nextPour[r] = 0; this.foe[r] = -1;
      this.claims.fill(null, r * MAX_CLAIMS, (r + 1) * MAX_CLAIMS); this.wanted[r] = null; this.wantedMore[r] = 0;
      return r;
    }
    return -1;
  }
  indoors(e) { return this.workers[e] + this.soldiers[e]; } // OG game.js:17652-17654
}
export function colonies(w) { return w.colonies || (w.colonies = new Colonies()); }
// Team switch (OURS, world.reside, 11-17): a colony joins the team of the half its hill (else its founding spot) is on,
// or goes back to Ants; its ants follow it, whichever half they are out on (a founder whose stroke group is now another
// side leaves that group, like a hatched ant).
onReside((w) => {
  const col = w.colonies; if (!col || !col.alive) return;
  for (let e = 0; e < MAX_COLONIES; e++) {
    if (col.alive[e] !== 1) continue;
    const h = col.hillUnit[e];
    col.team[e] = w.teamMode ? w.teamAt(h && !h.dead ? h.x : col.x[e]) : -1;
  }
  const ANTS = fac('Ants'), gs = w.groups;
  for (const u of w.units) {
    if (u.dead || !(u.colony > 0) || u.def.faction !== ANTS) continue;
    const e = u.colony - 1; if (col.alive[e] !== 1) continue;
    u.team = col.team[e]; u.faction = col.faction(e); u.target = -1;
    if (u.team < 0) { u.home = u.faction; u.homeGen = 0; }
    if (u.group >= 0 && gs.faction[u.group] !== u.faction) { gs.leave(u.group); u.group = -1; }
  }
});
export function colonyHill(w, e) { return e >= 0 ? w.unitById(w.colonies.hill[e]) : null; }

// ---------- corpse accessors (CORE-B corpse objects; OG ghosts store game.js:12510-12575) ----------
export function corpseTime(c) { return c.t ?? c.time ?? 0; }
export function corpseSize(c) { return c.size ?? c.r ?? c.radius ?? 0; }
function corpseMass(c) { const d = getDef(c.type); return d ? d.mass : 1; } // OG game.js:3613-3616
function corpseBurnt(c) { return ((c.status | 0) & 1) !== 0 || c.burning > 0 || !!c.burnt; } // OG Burning bit, game.js:12475
function corpseSick(c) { return ((c.status | 0) & 2) !== 0 || !!c.sick || c.plague > 0; } // OG Sick bit, game.js:12475
function isAntCorpse(c) { // OG game.js:3603-3611
  const t = c.type;
  return t === 'ant' || t === 'soldierant' || t === 'risen_ant' || t === 'risen_soldierant' || t === 'anthill';
}
// carriers a corpse needs (OG game.js:3617-3621)
function crewNeeded(c) { const m = corpseMass(c); return m < 0.7 ? 1 : Math.min(8, Math.ceil(2 * Math.sqrt(m))); }
function release(c) { c.colony = 0; c.claimed = -1; }
function letLie(w, c) { if (c.kept !== 1) { c.kept = 1; if (typeof w.letLie === 'function') w.letLie(c); } } // OG game.js:12573-12575

// ---------- geometry ----------
// entrance n of the hill (OG K, game.js:12240-12247)
export function entrance(hill, n, out) {
  const r = Math.max(1, hill.b.entrances), R = hill.radius;
  const a = Math.PI / 2 + hill.wander + (Math.min(n, r - 1) - (r - 1) / 2) * ENTRANCE_SPREAD;
  const l = 0.1 + 0.72 * hill.b.size / MAX_SIZE;
  out[0] = hill.x + Math.cos(a) * R * 0.66;
  out[1] = hill.y + (0.08 + 0.32 * Math.sin(a) - 0.2 * l) * R;
}
const E2 = new Float64Array(2);
// nearest entrance index to a point (OG ce, game.js:3837-3848)
export function nearestEntrance(hill, x, y) {
  const r = Math.max(1, hill.b.entrances); let best = 0, bd = Infinity;
  for (let h = 0; h < r; h++) { entrance(hill, h, E2); const d = hyp(E2[0] - x, E2[1] - y); if (d < bd) { bd = d; best = h; } }
  return best;
}
// the carrier's spot around a corpse (OG Z, game.js:12275-12284)
export function carrySpot(u, c, out) {
  const a = u.wander * Math.PI, n = corpseSize(c);
  out[0] = c.x + Math.cos(a) * (1.1 * n + 0.5 * u.radius);
  out[1] = c.y + Math.sin(a) * (0.6 * n + 0.4 * u.radius);
}
// is this claimed corpse job still current for colony e (OG V check, game.js:12253)
export function jobValid(c, jobTime, e) { return !!c && c.removed !== true && corpseTime(c) === jobTime && c.colony === e + 1 && c.eaten !== 1; }

// colony members pass through their own hill / anything near it (OG game.js:13671-13672, 13912-13922)
export function colonyIgnores(w, a, b) {
  if (!a.colony || a.colony !== b.colony) return false;
  if (a.type === 'anthill' || b.type === 'anthill') return true;
  const col = w.colonies; if (!col) return false;
  const e = a.colony - 1; if (!col.alive[e]) return false;
  const h = w.unitById(col.hill[e]); if (!h || h.type !== 'anthill') return false;
  const r = h.radius + 10, dx = a.x - h.x, dy = a.y - h.y;
  return dx * dx + dy * dy < r * r;
}

// ---------- nearest unit by faction rule (OG grid.findNearest, game.js:2800) ----------
let nb = null, nbd = 0, nbx = 0, nby = 0, nbMode = 0, nbF = 0;
function nbVisit(o) {
  if (o.dead || o.removed) return;
  if (nbMode === 0) { if (!hostileF(nbF, o.faction)) return; } // enemies of faction nbF
  else if (nbMode === 1) { if (o.faction !== nbF) return; } // exactly faction nbF
  else if (FAC.maskHas(nbF, o.faction) === 0) return; // faction bitmask
  const d = (o.x - nbx) * (o.x - nbx) + (o.y - nby) * (o.y - nby);
  if (d < nbd) { nbd = d; nb = o; }
}
// mode 0: enemy of faction f; 1: faction f; 2: faction bitmask f
export function nearestByFaction(w, x, y, r, mode, f) {
  nb = null; nbd = r * r; nbx = x; nby = y; nbMode = mode; nbF = f;
  w.query(x, y, r, nbVisit);
  const o = nb; nb = null; return o;
}

// ---------- per-tick scratch (OG Qt/$t/te/ee/Xt/Ut/Vt/Zt, game.js:3594-3602) ----------
const outN = new Int32Array(MAX_COLONIES), sumX = new Float64Array(MAX_COLONIES), sumY = new Float64Array(MAX_COLONIES);
const anyDef = new Uint8Array(MAX_COLONIES), foragers = new Int32Array(MAX_COLONIES), diggers = new Int32Array(MAX_COLONIES);
const crew = new Uint8Array(MAX_COLONIES * MAX_CLAIMS), crewIn = new Uint8Array(MAX_COLONIES * MAX_CLAIMS);
const P = new Float64Array(2);

// send an ant out of entrance ent on a job (OG le, game.js:3851-3874)
function sendOut(w, col, e, job, ent) {
  const soldier = job === JOB.Defending && col.soldiers[e] > 0;
  if (!soldier && col.workers[e] === 0) return null;
  const hill = col.hillUnit[e];
  entrance(hill, ent, P);
  col.spawning = e + 1;
  const a = Math.atan2(P[1] - hill.y, P[0] - hill.x);
  const u = w.spawn(soldier ? 'soldierant' : 'ant', P[0], P[1], { group: -1, heading: a, team: col.team[e], faction: col.faction(e) });
  col.spawning = 0;
  if (!u) return null;
  if (soldier) col.soldiers[e]--; else col.workers[e]--;
  outN[e]++;
  u.subState = job;
  u.b.timer = w.time + OUT_TIMER; // OG game.js:3864
  u.vx = 40 * Math.cos(a); u.vy = 40 * Math.sin(a); // OG game.js:3867
  if (hill.burning > 0 && rnd(w) < 0.5 * u.def.flammability) lightUp(w, u, 4); // OG game.js:3869 (509.a = 4 s)
  if (col.plague[e] > 0 && rnd(w) < 0.5) givePlague(w, u); // OG game.js:3870
  return u;
}
// send an ant digging at a random spot round the hill (OG he, game.js:3875-3884)
function setDig(w, col, u, e) {
  const n = hillRadius(col.size[e]), a = rnd(w) * Math.PI * 2, o = n + 4 + 6 * rnd(w);
  u.subState = JOB.Digging;
  u.b.aimX = col.x[e] + Math.cos(a) * o;
  u.b.aimY = col.y[e] + Math.sin(a) * o * 0.7;
  u.b.timer = w.time + DIG_TIME * range(w, 0.6, 1.4);
}

// new corpses get claimed by a nearby settled colony (OG game.js:5416-5437)
function claimNew(w, col) {
  const cs = w.corpses; if (!cs || !cs.length) return;
  let mask = 0;
  for (let e = 0; e < MAX_COLONIES; e++) if (col.alive[e] === 1) mask = FAC.maskWith(mask, col.faction(e));
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (c.antSeen === 1) continue;
    c.antSeen = 1;
    if ((c.z || 0) >= 4 || w.time - corpseTime(c) > 0.5) continue;
    if (isAntCorpse(c)) continue;
    const o = nearestByFaction(w, c.x, c.y, 40, 2, mask);
    const r = o && o.colony ? o.colony - 1 : -1;
    for (let n = 0; n < MAX_COLONIES; n++) {
      if (col.alive[n] === 0 || col.state[n] !== SETTLED) continue;
      const d = hyp(c.x - col.x[n], c.y - col.y[n]);
      if (d > 300 && !(n === r && d < 600)) continue;
      let slot = -1;
      for (let q = n * MAX_CLAIMS; q < (n + 1) * MAX_CLAIMS; q++) if (col.claims[q] === null) { slot = q; break; }
      if (slot >= 0) { col.claims[slot] = c; col.claimedAt[slot] = w.time; c.colony = n + 1; c.claimed = n; break; }
    }
  }
}

// pick the hill site (OG game.js:3640-3681)
function pickSite(w, col, e) {
  const margin = hillRadius(MAX_SIZE) + 4; // OG game.js:3645
  let bx = col.x[e], by = col.y[e], best = -Infinity;
  const walls = hasWalls(w), water = hasWater(w), oil = w.oil || null, cf = col.faction(e);
  for (let l = 0; l < 18; l++) {
    const a = rnd(w) * Math.PI * 2, h = l === 0 ? 0 : 90 * Math.sqrt(rnd(w)); // OG game.js:3650-3651
    const px = Math.min(w.W - margin, Math.max(margin, col.x[e] + Math.cos(a) * h));
    const py = Math.min(w.H - margin, Math.max(margin, col.y[e] + Math.sin(a) * h));
    let score = 0.2 * -h; // OG game.js:3654
    if (walls) {
      let bad = wallAt(w, px, py);
      for (let s = 0; s < 8 && !bad; s++) bad = wallAt(w, px + Math.cos(0.785 * s) * SITE_RING, py + Math.sin(0.785 * s) * SITE_RING);
      if (bad) continue;
    }
    if (oil && (oil.slickAt(px, py) > 0 || oil.burningAt(px, py))) continue; // OG game.js:3661
    if (water) {
      let bad = depthAt(w, px, py) >= WET;                                                     // OG game.js:3663 (K.d = 467.d = 0.05)
      for (let s = 0; s < 8 && !bad; s++) bad = depthAt(w, px + Math.cos(0.785 * s) * SITE_RING, py + Math.sin(0.785 * s) * SITE_RING) >= WET; // OG game.js:3665
      if (bad) continue;
    }
    let near = false;
    for (let t = 0; t < MAX_COLONIES; t++) if (t !== e && col.alive[t] !== 0 && col.state[t] === SETTLED && hyp(col.x[t] - px, col.y[t] - py) < 170) near = true;
    if (near) score -= 200; // OG game.js:3675
    const foe = nearestByFaction(w, px, py, SITE_ENEMY_R, 0, cf);
    score += foe ? 0.5 * hyp(foe.x - px, foe.y - py) : 75; // OG game.js:3677
    if (nearestByFaction(w, px, py, margin, 1, PROPS)) score -= 40; // OG game.js:3678
    if (score > best) { best = score; bx = px; by = py; }
  }
  return [bx, by];
}

// scouting colony: follow the ants, then found the hill (OG oe, game.js:3632-3699)
function scout(w, col, e) {
  if (outN[e] === 0) { col.alive[e] = 0; return; }
  col.x[e] = sumX[e] / outN[e]; col.y[e] = sumY[e] / outN[e];
  const age = w.time - col.bornAt[e];
  if (age < 3 || (anyDef[e] === 1 && age < 9)) return; // OG game.js:3637-3638
  const [sx, sy] = pickSite(w, col, e);
  const hill = w.spawn('anthill', sx, sy, { group: -1, heading: 0, team: col.team[e], faction: col.faction(e) });
  if (!hill) return;
  hill.colony = e + 1;
  col.state[e] = SETTLED; col.hill[e] = hill.id; col.hillUnit[e] = hill;
  col.x[e] = hill.x; col.y[e] = hill.y; col.hillHp[e] = hill.hp;
  col.nextOut[e] = w.time + 0.6; // OG game.js:3692
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || u.removed || u.colony !== e + 1 || u === hill) continue;
    if (u.subState === JOB.Defending || rnd(w) >= 0.5) continue; // OG game.js:3697
    setDig(w, col, u, e);
  }
}

// the hill is gone: burst it open and free the colony (OG game.js:3705-3733)
function dissolve(w, col, e, burst) {
  if (burst) {
    const x = col.x[e], y = col.y[e], r = hillRadius(col.size[e]);
    for (let c = col.indoors(e), s = col.soldiers[e]; c > 0; c--, s--) {
      const a = rnd(w) * Math.PI * 2;
      const u = w.spawn(s > 0 ? 'soldierant' : 'ant', x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.4,
        { group: -1, heading: a, team: col.team[e], faction: col.faction(e) });
      if (!u) break;
      u.colony = 0; u.vx = 80 * Math.cos(a); u.vy = 80 * Math.sin(a); // OG game.js:3723
    }
  }
  const us = w.units;
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.removed && u.colony === e + 1) u.colony = 0; }
  for (let n = 0; n < MAX_CLAIMS; n++) {
    const q = e * MAX_CLAIMS + n, c = col.claims[q];
    if (c && c.colony === e + 1) { release(c); letLie(w, c); }
    col.claims[q] = null;
  }
  col.alive[e] = 0; col.workers[e] = 0; col.soldiers[e] = 0; col.hill[e] = -1; col.hillUnit[e] = null;
}

// food → eggs → hatching (OG game.js:3751-3759)
function eggs(w, col, e, pop) {
  while (col.food[e] >= EGG_FOOD && pop + col.eggs[e] < POP_CAP) { col.food[e] -= EGG_FOOD; col.eggs[e]++; }
  if (col.eggs[e] === 0) { col.nextHatch[e] = w.time + HATCH_TIME; return; }
  if (w.time < col.nextHatch[e]) return;
  col.eggs[e]--; col.nextHatch[e] = w.time + HATCH_TIME;
  if (pop >= 16 && col.soldiers[e] < 0.2 * (pop + 1)) col.soldiers[e]++; else col.workers[e]++; // OG game.js:3758
}

// a corpse reaches the entrance and is eaten (OG se, game.js:3622-3631)
function eatCorpse(w, col, e, hill, c) {
  const burnt = corpseBurnt(c);
  col.food[e] += FOOD_PER_MASS * corpseMass(c) * (burnt ? 0.5 : 1);
  c.eaten = 1;
  if (burnt) lightUp(w, hill, 4); // OG game.js:3629 (509.a = 4 s; the hill's burnTime 8 replaces it)
  if (corpseSick(c)) col.plague[e] = 20; // OG game.js:3630
}

// claimed corpses: drop stale ones, pick the wanted job, drag crewed ones home (OG game.js:3761-3796)
function claims(w, col, e, hill) {
  let r = -1, best = 0;
  col.wanted[e] = null; col.wantedMore[e] = 0;
  for (let l = 0; l < MAX_CLAIMS; l++) {
    const q = e * MAX_CLAIMS + l, c = col.claims[q];
    if (c === null) continue;
    if (c.colony !== e + 1 || c.eaten === 1 || c.removed || w.time - col.claimedAt[q] > CORPSE_CLAIM_TIME) {
      if (c.colony === e + 1 && c.eaten !== 1) { release(c); letLie(w, c); }
      col.claims[q] = null; continue;
    }
    const need = crewNeeded(c);
    if (crew[q] < need) {
      const m = corpseMass(c);
      if (r < 0 || m > best) { r = q; best = m; col.wanted[e] = c; col.wantedMore[e] = need - crew[q]; }
    }
    if (crewIn[q] < need) continue;
    entrance(hill, nearestEntrance(hill, c.x, c.y), P);
    const dx = P[0] - c.x, dy = P[1] - c.y, v = hyp(dx, dy) || 0.001;
    if (v < 0.5 * corpseSize(c) + 6) { eatCorpse(w, col, e, hill, c); col.claims[q] = null; continue; } // OG game.js:3786
    const step = Math.min(v, 0.5); // OG game.js:3790 (0.5 px per tick)
    const nx = c.x + dx / v * step, ny = c.y + dy / v * step;
    if (!(hasWalls(w) && wallAt(w, nx, ny))) { c.x = nx; c.y = ny; }
  }
  return r;
}

// settled colony, every tick (OG re, game.js:3700-3836)
function settled(w, col, e) {
  const hill = col.hillUnit[e];
  if (!hill || hill.removed || hill.dead || hill.hp <= 0) { dissolve(w, col, e, !!hill && hill.hp <= 0); return; }
  const hx = hill.x, hy = hill.y;
  col.x[e] = hx; col.y[e] = hy;
  const inside = col.indoors(e), pop = inside + outN[e];
  const target = Math.min(MAX_SIZE, pop / 8), dugLimit = Math.sqrt(col.dug[e] / 16); // OG game.js:3738-3739
  const size = Math.max(col.size[e], Math.min(target, dugLimit));
  if (size !== col.size[e]) { // OG game.js:3742-3750
    const old = hill.maxHp;
    col.size[e] = size;
    hill.radius = hillRadius(size);
    hill.maxHp = HILL_HP0 + HILL_HP_PER * size;
    hill.hp += hill.maxHp - old;
    hill.b.size = size;
    hill.b.entrances = Math.min(4, 1 + Math.floor(size));
  }
  eggs(w, col, e, pop);
  if (col.plague[e] > 0) col.plague[e] -= 1 / 60; // OG game.js:3760
  const wanted = claims(w, col, e, hill);
  const t = w.time, lost = col.hillHp[e] - hill.hp;
  col.hillHp[e] = hill.hp;
  if (lost > 0.5) col.alarmUntil[e] = t + ALARM_TIME; // OG game.js:3797-3799
  const foe = nearestByFaction(w, hx, hy, HILL_SENSE + hill.radius, 0, col.faction(e)); // OG game.js:3800
  if (t < col.alarmUntil[e]) { // OG game.js:3801-3806
    if (t >= col.nextPour[e]) {
      for (let o = 0, r = Math.max(1, hill.b.entrances); o < r && col.indoors(e) > 0; o++) sendOut(w, col, e, JOB.Defending, o);
      col.nextPour[e] = t + 0.08;
    }
    return;
  }
  if (foe) { // OG game.js:3808-3814
    if (t >= col.nextOut[e] && col.indoors(e) > 0 && outN[e] < MAX_OUT) {
      sendOut(w, col, e, JOB.Defending, nearestEntrance(hill, foe.x, foe.y)); col.nextOut[e] = t + 0.15;
    }
    return;
  }
  if (t < col.nextOut[e] || col.workers[e] === 0) return; // OG game.js:3815
  if (wanted >= 0 && outN[e] < MAX_OUT) { // OG game.js:3816-3820
    const c = col.claims[wanted];
    const u = sendOut(w, col, e, JOB.Carrying, nearestEntrance(hill, c.x, c.y));
    if (u) { u.b.job = c; u.b.jobTime = corpseTime(c); }
    col.nextOut[e] = t + 0.15; return;
  }
  const canGrow = target > col.size[e] + 0.01, outCap = Math.min(MAX_OUT, 2 + Math.floor(inside / 3)); // OG game.js:3821-3822
  if (canGrow && diggers[e] < 3 && outN[e] < outCap) {
    const u = sendOut(w, col, e, JOB.Digging, rint(w, hill.b.entrances));
    if (u) setDig(w, col, u, e);
    col.nextOut[e] = t + 0.6 * range(w, 0.6, 1.4); return; // OG game.js:3825
  }
  if (foragers[e] < 4 && pop + col.eggs[e] < POP_CAP && outN[e] < MAX_OUT) { // OG game.js:3827-3835
    const a = rnd(w) * Math.PI * 2, d = 60 + 240 * Math.sqrt(rnd(w));
    const px = Math.min(w.W - 10, Math.max(10, hx + Math.cos(a) * d)), py = Math.min(w.H - 10, Math.max(10, hy + Math.sin(a) * d));
    if (hasWalls(w) && wallAt(w, px, py)) return;
    const u = sendOut(w, col, e, JOB.Foraging, nearestEntrance(hill, px, py));
    if (u) { u.b.aimX = px; u.b.aimY = py; u.b.timer = t + 14; }
    col.nextOut[e] = t + 1.6 * range(w, 0.6, 1.4);
  }
}

// tick step 19 (OG game.js:5400-5460)
export function run(w) {
  if (w.holding) return;
  const col = w.colonies; if (!col) return;
  let any = false;
  for (let e = 0; e < MAX_COLONIES; e++) if (col.alive[e] === 1) any = true;
  if (!any) return;
  outN.fill(0); sumX.fill(0); sumY.fill(0); anyDef.fill(0); crew.fill(0); crewIn.fill(0); foragers.fill(0); diggers.fill(0);
  claimNew(w, col);
  const us = w.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || u.removed || !u.colony || u.type === 'anthill') continue;
    const e = u.colony - 1;
    outN[e]++; sumX[e] += u.x; sumY[e] += u.y;
    const s = u.subState;
    if (s === JOB.Defending) anyDef[e] = 1;
    if (s === JOB.Foraging || s === JOB.Returning) foragers[e]++;
    if (s === JOB.Digging) diggers[e]++;
    if (s === JOB.Carrying) {
      for (let n = 0; n < MAX_CLAIMS; n++) {
        const q = e * MAX_CLAIMS + n, c = col.claims[q];
        if (c === null || c !== u.b.job || corpseTime(c) !== u.b.jobTime) continue;
        crew[q]++;
        carrySpot(u, c, P);
        if (hyp(P[0] - u.x, P[1] - u.y) < 14) crewIn[q]++;
      }
    }
  }
  for (let e = 0; e < MAX_COLONIES; e++) {
    if (col.alive[e] === 0) continue;
    if (col.state[e] === SCOUTING) scout(w, col, e); else settled(w, col, e);
  }
}
