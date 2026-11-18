// Local battle record, used ONLY while game.report() returns null (TERRAIN's src/sim/report.js not wired yet).
// Owner: UI. Same shape as the real summary (see report.js) but without highlight cards.
// OG record (game.js:7810-7869): a sample every 0.25 s of sim time [t since Start, red alive, blue alive],
// forced at Start and at the end; fielded = every unit seen alive on a team (late = first seen after the first
// sample); lost = a fielded unit that is no longer the same unit alive with hp > 0 on the same team.
// Outcome (game.js:7890-7896): draw -> mutual; survivor share >= 0.5 decisive, < 0.15 pyrrhic, else victory.
const SAMPLE_EVERY = 0.25; // s, OG game.js:7810-7842

// Team by faction only, like OG teamCounts (game.js:11553-11561). Before (L3 11-14): any unit with u.team 0/1 counted,
// so a frog (mage curse), tree, barrel or loose horse kept its side "alive" and a team battle never ended (no result, no report).
export function teamOf(u) { return u.faction === 20 ? 0 : u.faction === 21 ? 1 : -1; }

export function createFallbackRecord() {
  let rec = null;
  function alive(u) { return u && !u.dead && u.hp > 0; }
  function sample(world, force) {
    if (!rec || rec.result) return;
    const t = world.time - rec.t0;
    if (!force && rec.samples.length && t - rec.last < SAMPLE_EVERY) return;
    let a = 0, b = 0;
    for (const u of world.units) {
      if (!alive(u)) continue;
      const tm = teamOf(u); if (tm < 0) continue;
      if (tm === 0) a++; else b++;
      if (!rec.fielded.has(u.id)) rec.fielded.set(u.id, { team: tm, type: u.type, late: rec.samples.length > 0 });
    }
    rec.samples.push(t, a, b); rec.last = t;
  }
  return {
    get active() { return !!rec; },
    begin(world) { rec = { t0: world.time, samples: [], fielded: new Map(), result: null, last: 0 }; sample(world, true); },
    sample(world) { sample(world, false); },
    finish(world, result) { if (!rec) return; sample(world, true); rec.result = result; },
    resume() { if (rec) rec.result = null; },
    clear() { rec = null; },
    summary(world) {
      if (!rec) return null;
      const byId = new Map(); for (const u of world.units) if (alive(u)) byId.set(u.id, u);
      const strength = [new Map(), new Map()], losses = [new Map(), new Map()], total = [0, 0], lost = [0, 0];
      for (const [id, f] of rec.fielded) {
        total[f.team]++; strength[f.team].set(f.type, (strength[f.team].get(f.type) || 0) + 1);
        const u = byId.get(id);
        if (!u || teamOf(u) !== f.team) { lost[f.team]++; losses[f.team].set(f.type, (losses[f.team].get(f.type) || 0) + 1); }
      }
      const s = rec.samples, duration = s.length ? s[s.length - 3] : 0, result = rec.result || null;
      let outcome = 'ongoing';
      if (result === 'draw') outcome = 'mutual';
      else if (result) { const w = result === 'left' ? 0 : 1, share = total[w] > 0 ? (total[w] - lost[w]) / total[w] : 0; outcome = share >= 0.5 ? 'decisive' : share < 0.15 ? 'pyrrhic' : 'victory'; }
      return { local: true, duration, result, outcome, strength, losses, total, lost, samples: s.slice(), highlights: [] };
    },
  };
}
