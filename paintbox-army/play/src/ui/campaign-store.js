// Campaign store (OURS, Part 2 step 9, STEP9.md). Owner: UI.
// Best stars and best spend per campaign battle, kept on the device in localStorage 'paint-battle:campaign' =
// { v: 1, best: { '<world>-<n>': { stars: 1..3, spent: paint } } }. Only wins are kept: stars = the most won, spent = the
// least paint any win used. Every storage access is in try/catch: with storage blocked (private window, iframe rules) the
// campaign still plays, the stars just aren't kept after this visit.
// Two tabs open: a write first reads what is saved and keeps the better of both for every battle.
// URL switches (tests, shots):
//   ?campaign=none  start with no stars: what was saved is wiped, then wins are kept as usual
//   ?campaign=demo  a fixed spread of stars for this visit (worlds page shots); storage left alone
export const CAMP_KEY = 'paint-battle:campaign';
export const CAMP_V = 1;

const T = {
  MAX_STARS: 3,      // a battle gives at most 3 stars (STEP9.md)
  DEMO_EVERY: 3,     // ?campaign=demo: every battle n with (n + world index) % 3 = 0 has none, the rest 1-3 stars
};

function readRaw() { try { const s = localStorage.getItem(CAMP_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function writeRaw(v) { try { localStorage.setItem(CAMP_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }
const idOk = (id) => typeof id === 'string' && /^[a-z]+-\d{1,2}$/.test(id);
// one saved row -> { stars, spent } or null (junk out)
function cleanRow(r) {
  if (!r || typeof r !== 'object') return null;
  const stars = Math.round(Number(r.stars)), spent = Number(r.spent);
  if (!(stars >= 1 && stars <= T.MAX_STARS) || !(spent >= 0) || !Number.isFinite(spent)) return null;
  return { stars, spent };
}
function parse(raw) {
  const out = new Map();
  if (!raw || raw.v !== CAMP_V || !raw.best || typeof raw.best !== 'object') return out;
  for (const [id, r] of Object.entries(raw.best)) { const c = idOk(id) ? cleanRow(r) : null; if (c) out.set(id, c); }
  return out;
}
// the better of two rows: most stars, least paint
function better(a, b) {
  if (!a) return b; if (!b) return a;
  return { stars: Math.max(a.stars, b.stars), spent: Math.min(a.spent, b.spent) };
}

/** opts: { mode: ?campaign= value ('none' | 'demo' | null), worlds: world ids (demo only), perWorld (demo only) } */
export function createCampaignStore({ mode = null, worlds = [], perWorld = 8 } = {}) {
  const demo = mode === 'demo';
  let best = new Map(), kept = true;
  if (demo) {
    worlds.forEach((w, wi) => { for (let n = 1; n <= perWorld; n++) if ((n + wi) % T.DEMO_EVERY) best.set(`${w}-${n}`, { stars: 1 + ((n * 7 + wi) % T.MAX_STARS), spent: 100 }); });
  } else {
    if (mode === 'none') kept = writeRaw({ v: CAMP_V, best: {} });
    best = parse(readRaw());
  }
  function persist() {
    if (demo) return false;
    for (const [id, r] of parse(readRaw())) best.set(id, better(best.get(id), r));   // another tab's wins stay
    kept = writeRaw({ v: CAMP_V, best: Object.fromEntries(best) });
    return kept;
  }
  return {
    /** { stars, spent } of the best win, or null (never won) */
    get(id) { const r = best.get(id); return r ? { ...r } : null; },
    stars(id) { const r = best.get(id); return r ? r.stars : 0; },
    /** stars won over a list of battle ids */
    total(ids) { let n = 0; for (const id of ids) n += this.stars(id); return n; },
    /** A battle ended. Only a win (stars >= 1) is kept. Returns { stars, spent, newStars, newSpend } (the kept best). */
    record(id, stars, spent) {
      const had = best.get(id) || null;
      if (!idOk(id) || !(stars >= 1)) return { stars: had ? had.stars : 0, spent: had ? had.spent : null, newStars: false, newSpend: false };
      const now = better(had, { stars: Math.min(T.MAX_STARS, Math.round(stars)), spent: Math.max(0, spent) });
      best.set(id, now);
      persist();
      return { ...now, newStars: !had || now.stars > had.stars, newSpend: !had || now.spent < had.spent };
    },
    get demo() { return demo; },
    /** false = the last write didn't stick (storage blocked or full): the stars live for this visit only */
    get kept() { return kept; },
  };
}
