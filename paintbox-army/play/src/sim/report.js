// Battle record and report (TERRAIN). Team mode only: the end-of-battle watch (result + 'win' event), the kill log,
// the 0.25 s samples, and the report summary with its highlight cards, ranked and capped at 3.
// OG: record game.js:7801-7911, cards 7145-7530, watchRound 8247-8289, kill log 11595-11628, chart 7912-7957.
import { CAUSE } from './const.js';
import { teamOfFaction, teamFaction, teamCounts } from './factions.js';
import { getDef } from './defs.js';

export const TEAM_NAMES = ['Red team', 'Blue team'];   // OG game.js:7145
export const TEAM_COLORS = ['#f74444', '#4580f7'];     // OG game.js:7146
export const TEAM_WORDS = ['red', 'blue'];             // OG game.js:7147
export const OUTNUMBERED = 0.67;                       // underdog / comeback ratio (OG game.js:7148)
export const SAMPLE_EVERY = 0.25;                      // s (OG game.js:7820)
export const OVER_AFTER = 1.2;                         // s of one side empty before the result (OG game.js:8281)
export const KILL_LOG_CAP = 50000;                     // OG game.js:11613
export const KILL_CREDIT = 6;                          // s (OG game.js:11612)
export const MAX_CARDS = 3;                            // OG game.js:7201 (gt default), 7886
export const BLAST_STREAK = 0.2;                       // s (OG game.js:7279)
export const MOMENT_WINDOW = 3, MOMENT_ICON_PAD = 0.5; // s (OG game.js:7397, 7404)

// Verbs (OG game.js:7184-7199).
const KILL_VERB = { [CAUSE.Blast]: 'blew up', [CAUSE.Eaten]: 'swallowed', [CAUSE.Fire]: 'burned', [CAUSE.Turned]: 'turned' };
const DIE_VERB = { [CAUSE.Blast]: 'was blown up', [CAUSE.Fire]: 'burned', [CAUSE.Plague]: 'died of plague', [CAUSE.Thrown]: 'was flung to its death', [CAUSE.Turned]: 'turned' };
const CAUSE_WORDS = { [CAUSE.Blast]: 'blown up', [CAUSE.Fire]: 'burned', [CAUSE.Plague]: 'died of plague', [CAUSE.Thrown]: 'flung to their deaths', [CAUSE.Eaten]: 'swallowed whole', [CAUSE.Turned]: 'turned' };

// ---------------------------------------------------------------- kill log (OG kills.record, game.js:11609-11625)
// CORE-A's lifecycle calls this for every death (before def.onDeath). On only in team mode (OG game.js:8248).
export function recordKill(world, u, turned = false) {
  const K = world.kills;
  if (!K || !(K.enabled || world.teamMode)) return;
  const cause = turned ? CAUSE.Turned : u.eaten === 1 ? CAUSE.Eaten : (u.harmCause || 0);
  const harmed = u.harmByType !== null && u.harmByType !== undefined && u.harmByType !== -1;
  const credit = harmed && (cause === CAUSE.Blow || cause === CAUSE.Blast || cause === CAUSE.Eaten || world.time - u.harmByAt <= KILL_CREDIT);
  if (K.list.length >= KILL_LOG_CAP) K.list.shift();
  K.list.push({ t: world.time, victimType: u.type, victimFaction: u.faction, victimMass: u.mass,
    killer: credit ? u.harmBy : -1, killerType: credit ? u.harmByType : null, killerFaction: credit ? u.harmByFaction : -1, cause });
}

// ---------------------------------------------------------------- text helpers (OG game.js:7149-7183)
// Our working role names (type ids) until names are picked; the UI rebuilds EN/中文 text from each card's args.
function defName(type) { const d = getDef(type); return (d && d.name) || String(type); }
const CAUSE_KEY = { [CAUSE.Blow]: 'blow', [CAUSE.Blast]: 'blast', [CAUSE.Fire]: 'fire', [CAUSE.Plague]: 'plague', [CAUSE.Thrown]: 'thrown', [CAUSE.Eaten]: 'eaten', [CAUSE.Turned]: 'turned' };
export function causeKey(c) { return CAUSE_KEY[c] || 'other'; }
export function clock(s) { if (s < 60) return `${Math.round(s)}s`; const m = Math.floor(s / 60), r = Math.round(s % 60); return `${m}:${String(r).padStart(2, '0')}`; }
export function avg1(v) { return String(Math.round(10 * v) / 10); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// Most common value: the first to reach the top count (OG game.js:7170-7178). −1 for an empty list.
export function mostCommon(list) {
  const c = new Map(); let best = -1;
  for (const v of list) { c.set(v, (c.get(v) || 0) + 1); if (best === -1 || c.get(v) > c.get(best)) best = v; }
  return best;
}
// A team's main type: most fielded, first inserted on ties (OG game.js:7179-7183).
function mainType(strength, team) { let best = -1; for (const [t, n] of strength[team]) if (best === -1 || n > strength[team].get(best)) best = t; return best; }

// Outcome words (OG game.js:7890-7896).
export function outcome(result, total, lost) {
  if (result === null) return 'Ongoing';
  if (result === 'draw') return 'Mutual destruction';
  const o = result === 'left' ? 0 : 1, s = total[o] > 0 ? (total[o] - lost[o]) / total[o] : 0;
  return s >= 0.5 ? 'Decisive victory' : s < 0.15 ? 'Pyrrhic victory' : 'Victory';
}
// Duration in words, at least 1 s (OG game.js:7897-7911).
export function durationWords(s) {
  const t = Math.max(1, Math.round(s)), m = Math.floor(t / 60), sec = t % 60, w = (n, u) => `${n} ${u}${n === 1 ? '' : 's'}`;
  return m === 0 ? w(sec, 'second') : sec === 0 ? w(m, 'minute') : `${w(m, 'minute')} ${w(sec, 'second')}`;
}

// ---------------------------------------------------------------- highlight cards (OG gt, game.js:7202-7530)
// t = {result, samples, kills (t relative to start), strength [Map type→n ×2], total [2], lost [2]}. Returns the shown cards:
// {kind (dedupe group), id (card), label, text (EN fallback), icon (unit type), team, score, ...args the UI builds EN/中文 text from}.
export function highlights(t, max = MAX_CARDS, nameOf = defName) {
  const all = buildCards(t, nameOf).sort((a, b) => b.score - a.score);   // stable: ties keep build order
  const out = [];
  const trio = (k) => k === 'mvp' || k === 'multi' || k === 'deadliest';
  for (const c of all) {
    if (out.length >= max) break;
    if (out.some((p) => p.kind === c.kind || (trio(p.kind) && trio(c.kind) && (p.kind === 'deadliest') !== (c.kind === 'deadliest') && p.team === c.team && p.icon === c.icon))) continue;
    out.push(c);
  }
  return out;
}

export function buildCards(t, nameOf = defName) {
  const name = (type) => String(nameOf(type)).toLowerCase();
  const a = (team, type) => `a ${TEAM_WORDS[team]} ${name(type)}`;
  const tv = (k) => teamOfFaction(k.victimFaction), tk = (k) => teamOfFaction(k.killerFaction);
  const enemyKill = (k) => k.killer >= 0 && tk(k) >= 0 && tk(k) !== tv(k);
  const e = [];
  const n = t.kills.filter((k) => tv(k) >= 0);
  const o = t.result === 'left' ? 0 : t.result === 'right' ? 1 : -1, r = o >= 0 ? 1 - o : -1;
  // Per-unit enemy kills → MVP candidate (OG game.js:7209-7218).
  const per = new Map();
  for (const k of n) {
    if (!enemyKill(k)) continue;
    const rec = per.get(k.killer) || { n: 0, type: k.killerType, team: tk(k), key: k.killer };
    rec.n++; per.set(k.killer, rec);
  }
  let m = null;
  for (const v of per.values()) if (!m || v.n > m.n) m = v;
  // Deadliest: enemy kills per fielded unit of a (team, type), kills ≥ 4, fielded ≥ 2, rate ≥ 1.5 (OG game.js:7219-7248).
  const byType = new Map();
  for (const k of n) {
    if (!enemyKill(k)) continue;
    const key = `${tk(k)}\u0000${k.killerType}`;
    byType.set(key, (byType.get(key) || 0) + 1);
  }
  let w = null;
  for (const [key, kills] of byType) {
    const [ts, type] = key.split('\u0000'), team = +ts, fielded = t.strength[team].get(type) || 0;
    if (kills < 4 || fielded < 2) continue;
    const rate = kills / fielded;
    if (rate >= 1.5 && (!w || rate > w.rate)) w = { rate, type, team };
  }
  if (w) e.push({ kind: 'deadliest', label: 'Deadliest', text: `Each ${TEAM_WORDS[w.team]} ${name(w.type)} took out ${avg1(w.rate)} on average`, icon: w.type, team: w.team, score: 25 + Math.min(40, 10 * w.rate), id: 'deadliest', type: w.type, rate: w.rate });
  // First blood: the first kill, always (OG game.js:7249-7273).
  const k0 = n[0];
  if (k0) {
    const vt = tv(k0), kt = tk(k0), when = `${clock(k0.t)} in`, credited = k0.killer >= 0 && kt >= 0;
    const text = credited ? `${cap(a(kt, k0.killerType))} ${KILL_VERB[k0.cause] ?? 'took down'} ${a(vt, k0.victimType)} ${when}`
      : `${cap(a(vt, k0.victimType))} ${DIE_VERB[k0.cause] ?? 'fell'} first, ${when}`;
    e.push({ kind: 'first', label: 'First blood', text, icon: credited ? k0.killerType : k0.victimType, team: credited ? kt : vt, score: 12, id: 'first', killerType: credited ? k0.killerType : null, killerTeam: credited ? kt : -1, victimType: k0.victimType, victimTeam: vt, cause: causeKey(k0.cause), t: k0.t });
  }
  // Best blast streak: one unit's Blast kills within 0.2 s of the first (OG game.js:7275-7281).
  let M = null;
  const E = n.filter((k) => k.cause === CAUSE.Blast && k.killer >= 0 && tk(k) >= 0);
  for (let i = 0; i < E.length; i++) {
    let c = 0;
    for (let j = i; j < E.length && E[j].t - E[i].t <= BLAST_STREAK; j++) if (E[j].killer === E[i].killer) c++;
    if (!M || c > M.n) M = { n: c, type: E[i].killerType, team: tk(E[i]), key: E[i].killer };
  }
  const hasMvp = m !== null && m.n >= 3, hasMulti = M !== null && M.n >= 3, same = hasMvp && hasMulti && m.key === M.key;
  if (hasMvp && !(same && M.n >= m.n))                                           // OG game.js:7282-7299
    e.push({ kind: 'mvp', label: 'MVP', text: `${cap(a(m.team, m.type))} took down ${m.n}${same ? `, ${M.n} of them in one blast` : ''}`, icon: m.type, team: m.team, score: Math.max(30 + 6 * m.n, same ? 40 + 8 * M.n : 0), id: 'mvp', type: m.type, n: m.n, m: same ? M.n : 0 });
  if (hasMulti && !(same && M.n < m.n))                                          // OG game.js:7300-7310
    e.push({ kind: 'multi', label: 'Multi-kill', text: `${cap(a(M.team, M.type))} took out ${M.n} in one blast`, icon: M.type, team: M.team, score: 40 + 8 * M.n, id: 'multi', type: M.type, m: M.n });
  // Friendly fire (OG game.js:7311-7338).
  const T = n.filter((k) => k.killer >= 0 && tk(k) >= 0 && tk(k) === tv(k));
  if (T.length > 0) {
    const type = mostCommon(T.map((k) => k.killerType)), team = tk(T.find((k) => k.killerType === type));
    const c = T.filter((k) => k.killerType === type && tk(k) === team).length, nm = name(type);
    const text = c === 1 ? `${cap(a(team, type))} took out one of its own` : `${cap(TEAM_WORDS[team])} ${nm.endsWith('cavalry') ? nm : nm + 's'} took out ${c} of their own`;
    e.push({ kind: 'friendly', label: 'Friendly fire', text, icon: type, team, score: c >= 2 ? 45 + 8 * c : 22, id: 'friendly', type, n: c });
  }
  // Giant slayer: victim mass / killer def mass ≥ 6, not an anthill (OG game.js:7340-7360).
  let R = null;
  for (const k of n) {
    if (!enemyKill(k) || k.victimType === 'anthill') continue;
    const kd = getDef(k.killerType), ratio = k.victimMass / Math.max(0.001, kd ? kd.mass : 1);
    if (ratio >= 6 && (!R || ratio > R.ratio)) R = { ratio, k };
  }
  if (R) { const k = R.k, kt = tk(k); e.push({ kind: 'giant', label: 'Giant slayer', text: `${cap(a(kt, k.killerType))} brought down ${a(tv(k), k.victimType)}`, icon: k.killerType, team: kt, score: 30 + 6 * Math.log2(R.ratio), id: 'giant', type: k.killerType, victimType: k.victimType, victimTeam: tv(k), ratio: R.ratio }); }
  // How they fell: causes with ≥ 2, top 3, sum ≥ 3 and ≥ 25 % of all kills (OG game.js:7361-7392).
  const L = new Map();
  for (const k of n) if (CAUSE_WORDS[k.cause]) L.set(k.cause, (L.get(k.cause) || 0) + 1);
  const P = [...L].filter(([, c]) => c >= 2).sort((x, y) => y[1] - x[1]).slice(0, 3), I = P.reduce((s, [, c]) => s + c, 0);
  if (n.length > 0 && I >= 3 && I / n.length >= 0.25)
    e.push({ kind: 'causes', label: 'How they fell', text: cap(P.map(([c, cnt]) => `${cnt} ${CAUSE_WORDS[c]}`).join(', ')), icon: mostCommon(n.filter((k) => CAUSE_WORDS[k.cause]).map((k) => k.victimType)), team: -1, score: 25 + (I / n.length) * 50, id: 'causes', counts: P.map(([c, cnt]) => [causeKey(c), cnt]) });
  // Bloodiest moment: biggest drop in red + blue standing over any 3 s window (OG game.js:7393-7412).
  const s = t.samples, H = s.length / 3;
  let C = null;
  for (let i = 0, j = 0; j < H; j++) {
    while (s[3 * j] - s[3 * i] > MOMENT_WINDOW) i++;
    const fell = s[3 * i + 1] + s[3 * i + 2] - s[3 * j + 1] - s[3 * j + 2];
    if (!C || fell > C.fell) C = { fell, t: s[3 * i] };
  }
  const F = t.total[0] + t.total[1];
  if (C && C.fell >= 4 && C.fell >= 0.2 * F)
    e.push({ kind: 'moment', label: 'Bloodiest moment', text: `${C.fell} fell in ${MOMENT_WINDOW} seconds, ${clock(C.t)} in`, icon: mostCommon(n.filter((k) => k.t >= C.t && k.t <= C.t + MOMENT_WINDOW + MOMENT_ICON_PAD).map((k) => k.victimType)), team: -1, score: Math.min(60, 20 + 4 * C.fell), id: 'moment', n: C.fell, t: C.t });
  if (o >= 0) {
    // Underdog (start ratio) or Comeback (lowest ratio) (OG game.js:7414-7448).
    const start = H > 0 && s[1 + r] > 0 && s[1 + o] > 0 ? s[1 + o] / s[1 + r] : 1;
    let low = null;
    for (let i = 0; i < H; i++) {
      const mine = s[3 * i + 1 + o], theirs = s[3 * i + 1 + r];
      if (theirs === 0 || mine === 0) continue;
      const ratio = mine / theirs;
      if (!low || ratio < low.ratio) low = { ratio, t: s[3 * i], mine, theirs };
    }
    if (start <= OUTNUMBERED) {
      const k = s[1 + r] / s[1 + o], odds = k >= 1.95 ? `${Math.round(k)} to 1` : `${s[1 + r]} to ${s[1 + o]}`;
      e.push({ kind: 'comeback', label: 'Underdog', text: `${TEAM_NAMES[o]} won despite being outnumbered ${odds}`, icon: mainType(t.strength, o), team: o, score: 50 + 40 * (1 - start), id: 'underdog', theirs: s[1 + r], mine: s[1 + o], ratio: start });
    } else if (low && low.ratio <= OUTNUMBERED) {
      const k = low.theirs / low.mine, odds = k >= 1.95 ? `outnumbered ${Math.round(k)} to 1` : `down ${low.mine} to ${low.theirs}`;
      e.push({ kind: 'comeback', label: 'Comeback', text: `${TEAM_NAMES[o]} was ${odds} at ${clock(low.t)}, and still won`, icon: mainType(t.strength, o), team: o, score: 55 + 40 * (1 - low.ratio), id: 'comeback', theirs: low.theirs, mine: low.mine, t: low.t, ratio: low.ratio });
    }
    // Close call, else Flawless, else Rout (OG game.js:7450-7477).
    const left = t.total[o] - t.lost[o];
    if (t.total[o] >= 3 && (left <= 2 || left / t.total[o] <= 0.1))
      e.push({ kind: 'close', label: 'Close call', text: `${TEAM_NAMES[o]} won with just ${left} left standing`, icon: mainType(t.strength, o), team: o, score: 40 + 20 * (1 - left / t.total[o]), id: 'close', s: left });
    else if (t.total[r] >= 5 && t.lost[o] === 0)
      e.push({ kind: 'rout', label: 'Flawless', text: `${TEAM_NAMES[o]} won without losing a single unit`, icon: mainType(t.strength, o), team: o, score: 60, id: 'flawless' });
    else if (t.total[r] >= 5 && t.lost[o] <= 0.1 * t.total[o])
      e.push({ kind: 'rout', label: 'Rout', text: `${TEAM_NAMES[o]} lost just ${t.lost[o]} of ${t.total[o]}`, icon: mainType(t.strength, o), team: o, score: 40, id: 'rout', lost: t.lost[o], total: t.total[o] });
    // Last stand: the loser's last unit alone ≥ 5 s, the last episode counts (OG game.js:7479-7504).
    let since = -1, alone = 0;
    for (let i = 1; i < H; i++) {
      const prev = s[3 * (i - 1) + 1 + r], now = s[3 * i + 1 + r];
      if (now === 1 && prev > 1) since = s[3 * i];
      else if (now > 1) since = -1;
      else if (now === 0 && prev === 1 && since >= 0) alone = s[3 * i] - since;
    }
    const last = [...n].reverse().find((k) => tv(k) === r);
    if (alone >= 5 && last)
      e.push({ kind: 'stand', label: 'Last stand', text: `The last ${TEAM_WORDS[r]} ${name(last.victimType)} held out alone for ${Math.round(alone)}s`, icon: last.victimType, team: r, score: Math.min(65, 25 + 2 * alone), id: 'stand', type: last.victimType, f: alone });
  } else if (t.result === 'draw')                                               // OG game.js:7505-7513
    e.push({ kind: 'wipeout', label: 'Wipeout', text: 'The two teams wiped each other out', icon: mainType(t.strength, 0), team: -1, score: 50, id: 'wipeout' });
  return e;
}

// ---------------------------------------------------------------- report panels and chart (OG game.js:7912-7986)
// One row per fielded type, most fielded first, "from → to"; a Total row when more than one type.
export function teamRows(summary, team, nameOf = defName) {
  const rows = [...summary.strength[team]].sort((x, y) => y[1] - x[1]).map(([type, from]) => ({ type, name: nameOf(type), from, to: from - (summary.losses[team].get(type) || 0), total: false }));
  if (rows.length > 1) rows.push({ type: null, name: 'Total', from: summary.total[team], to: summary.total[team] - summary.lost[team], total: true });
  return rows;
}
function niceStep(max, n) { const s = Math.max(max, 1) / n, p = 10 ** Math.floor(Math.log10(s)), f = s / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
// "Units standing" step chart geometry: height 160 under 420 px wide, else 180; width ≥ 260 (OG game.js:7918-7957).
export function chartLayout(samples, width) {
  const W = Math.max(260, width), Hh = W < 420 ? 160 : 180, pad = { l: 34, r: 34, t: 10, b: 26 }, n = samples.length / 3;
  const tEnd = Math.max(n > 0 ? samples[3 * (n - 1)] : 0, 1);
  let top = 1;
  for (let i = 0; i < n; i++) top = Math.max(top, samples[3 * i + 1], samples[3 * i + 2]);
  const yStep = niceStep(top, 4), yMax = Math.ceil(top / yStep) * yStep, xStep = niceStep(tEnd, W < 420 ? 4 : 6);
  const sx = (t) => pad.l + (t / tEnd) * (W - pad.l - pad.r), sy = (v) => pad.t + (1 - v / yMax) * (Hh - pad.t - pad.b);
  const rows = []; for (let v = 0; v <= yMax + 1e-9; v += yStep) rows.push({ y: sy(v), label: String(Math.round(10 * v) / 10), axis: v === 0 });
  const ticks = []; for (let t = 0; t <= tEnd + 1e-9; t += xStep) ticks.push({ x: sx(t), label: clock(t) });
  const lines = [0, 1].map((tm) => { let d = ''; for (let i = 0; i < n; i++) { const x = sx(samples[3 * i]), y = sy(samples[3 * i + 1 + tm]); d += i === 0 ? `M${x},${y}` : `H${x}V${y}`; } return d; });
  const endN = [0, 1].map((tm) => (n > 0 ? samples[3 * (n - 1) + 1 + tm] : 0));
  const ends = [0, 1].map((tm) => {
    const y = sy(endN[tm]), nudge = Math.abs(sy(endN[0]) - sy(endN[1])) < 14 ? (endN[tm] >= endN[1 - tm] ? (tm === 0 ? -7 : 7) : tm === 0 ? 7 : -7) : 0;
    return { x: sx(tEnd), y, labelY: y + 4 + (endN[0] === endN[1] ? (tm === 0 ? -7 : 7) : nudge), count: endN[tm] };
  });
  return { width: W, height: Hh, pad, rows, ticks, lines, ends, tEnd };
}

// ---------------------------------------------------------------- the record (one per game; survives Clear)
// CORE-A: record.begin(world) on START, record.watch(world) after every tick, game.report() → record.summary(world).
export class BattleRecord {
  constructor() { this.samples = []; this.fielded = new Map(); this.started = 0; this.lastSample = -Infinity; this.result = null; this.killsFrom = 0; this.seen = [false, false]; this.overSince = -1; this.won = ''; }
  // START: fresh samples, forced first sample (OG game.js:7810-7817).
  begin(world) {
    this.samples = []; this.fielded.clear(); this.started = world.time; this.lastSample = -Infinity; this.result = null;
    this.killsFrom = world.kills ? world.kills.list.length : 0;
    this.sample(world, true);
  }
  // Every 0.25 s: [time since START, red alive, blue alive]; every team unit seen alive is fielded ("late" after the first sample).
  sample(world, force = false) {
    if (!force && world.time - this.lastSample < SAMPLE_EVERY) return;
    this.lastSample = world.time;
    let red = 0, blue = 0;
    const us = world.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.dead || u.hp <= 0) continue;
      const team = teamOfFaction(u.faction);
      if (team < 0) continue;
      if (team === 0) red++; else blue++;
      if (!this.fielded.has(u.id)) this.fielded.set(u.id, { team, type: u.type, late: this.samples.length > 0 });
    }
    this.samples.push(world.time - this.started, red, blue);
  }
  finish(world, result) { this.sample(world, true); this.result = result; }
  resume() { this.result = null; }
  // End-of-battle watch (OG watchRound, game.js:8271-8289). Returns '' | 'left' | 'right' | 'draw'.
  watch(world) {
    let res = '';
    if (world.teamMode && !world.holding) {
      if (this.result === null) this.sample(world);
      const [red, blue] = teamCounts(world);
      if (red > 0) this.seen[0] = true;
      if (blue > 0) this.seen[1] = true;
      if (this.seen[0] && this.seen[1] && (red === 0 || blue === 0)) {
        if (this.overSince < 0) this.overSince = world.time;
        if (world.time - this.overSince >= OVER_AFTER) res = red > 0 ? 'left' : blue > 0 ? 'right' : 'draw';
      } else this.overSince = -1;
    } else {
      this.overSince = -1;
      if (world.holding) this.seen[0] = this.seen[1] = false;   // holding turned on resets "fielded" (OG game.js:8257)
    }
    if (res !== this.won) {
      this.won = res;
      if (res !== '') this.finish(world, res); else this.resume();
      if (res === 'left' || res === 'right') world.emit('win', { result: res });  // OG audio.win (game.js:8287)
      world.emit('result', { result: res });                                      // overlay: "Red team wins!" / … (page-ui.js:1322-1353)
    }
    return res;
  }
  // The report (OG summary, game.js:7846-7889, and the page header, page-ui.js:127-148).
  summary(world, nameOf = defName) {
    const strength = [new Map(), new Map()], losses = [new Map(), new Map()], late = [0, 0], total = [0, 0], lost = [0, 0];
    for (const [id, f] of this.fielded) {
      total[f.team]++;
      if (f.late) late[f.team]++;
      strength[f.team].set(f.type, (strength[f.team].get(f.type) || 0) + 1);
      const u = world.unitById(id);
      if (!(u && !u.dead && u.hp > 0 && u.faction === teamFaction(f.team))) { lost[f.team]++; losses[f.team].set(f.type, (losses[f.team].get(f.type) || 0) + 1); }
    }
    const S = this.samples, duration = S.length > 0 ? S[S.length - 3] : 0;
    const list = world.kills ? world.kills.list : [];
    const kills = list.slice(Math.min(this.killsFrom, list.length)).map((k) => ({ ...k, t: k.t - this.started })).filter((k) => k.t >= 0 && k.t <= duration + 0.01);
    const winner = this.result === 'left' ? 0 : this.result === 'right' ? 1 : -1;
    const out = outcome(this.result, total, lost);
    const sum = {
      duration, result: this.result, outcome: out, strength, losses, late, total, lost, samples: S,
      title: winner >= 0 ? `${TEAM_NAMES[winner]} wins` : this.result === 'draw' ? "It's a draw" : 'Battle report',
      subtitle: `${out} in ${durationWords(duration)}`, winner,
      highlights: highlights({ result: this.result, samples: S, kills, strength, total, lost }, MAX_CARDS, nameOf),
    };
    sum.rows = [teamRows(sum, 0, nameOf), teamRows(sum, 1, nameOf)];
    return sum;
  }
}

// ---------------------------------------------------------------- module API for createGame (one record per world; it survives Clear like OG's)
export function recordOf(world) { if (!(world.battleRecord instanceof BattleRecord)) world.battleRecord = new BattleRecord(); return world.battleRecord; }
export function begin(world) { recordOf(world).begin(world); }              // game.start()
export function watch(world) { return recordOf(world).watch(world); }       // after every tick (idempotent within a tick)
export function summary(world, nameOf) { return recordOf(world).summary(world, nameOf); } // game.report()
