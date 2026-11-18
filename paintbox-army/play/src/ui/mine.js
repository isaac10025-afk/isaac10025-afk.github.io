// Mine store (OURS, Part 2 step 8, STEP8.md): the units the player made in the unit maker. Owner: UI.
// Saved on the device in localStorage 'paint-battle:mine' = { v: 1, next, units: [recipe, ...] } (at most MINE_MAX).
// Every recipe read goes through the maker's cleanRecipe (junk in, a working unit out), ids are unique, `next` is the
// id the next new unit gets. Every storage access is in try/catch: with storage blocked (private window, iframe rules)
// the maker still works for this visit, the units just aren't kept.
// Two tabs open: a write first reads what is saved and keeps the units another tab added (its ids stay theirs), so the
// second tab never wipes the first one's units.
// URL switches (tests, shots):
//   ?mine=none  start with no made units: what was saved is wiped, then saves are kept as usual
//   ?mine=demo  a fixed set of 6 made units (the 4 bodies, several hold classes) for this visit; storage left alone
export const MINE_KEY = 'paint-battle:mine';
export const STORE_V = 1;

// ?mine=demo: plain catalogue names only (STEP8.md: no made-up flavour); recipe fields are catalogue step indexes.
export const DEMO = [
  { id: 1, name: '', body: 'person', size: 2, hp: 3, speed: 3, weapon: 'rifle', abilities: ['rally'], color: 5, hat: 'helmet' },
  { id: 2, name: 'Knight', body: 'person', size: 2, hp: 4, speed: 4, weapon: 'sword', abilities: ['shield', 'charge'], color: 0, hat: 'viking' },
  { id: 3, name: 'Wolf', body: 'animal', size: 2, hp: 4, speed: 5, weapon: 'bite', abilities: ['pounce', 'sneak'], color: 8, hat: 'none' },
  { id: 4, name: '', body: 'beast', size: 3, hp: 7, speed: 3, weapon: 'jaws', abilities: ['roar', 'heavy'], color: 3, hat: 'crown' },
  { id: 5, name: 'Big Club', body: 'giant', size: 3, hp: 8, speed: 2, weapon: 'club', abilities: ['stomp'], color: 1, hat: 'none' },
  { id: 6, name: '', body: 'person', size: 1, hp: 2, speed: 5, weapon: 'fireball', abilities: ['fly'], color: 6, hat: 'wizard' },
];

function readRaw() {
  try { const s = localStorage.getItem(MINE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function writeRaw(v) {
  try { localStorage.setItem(MINE_KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
}
const idOk = (id) => Number.isInteger(id) && id >= 1 && id < 1e6;

/**
 * opts: { mode: ?mine= value ('none' | 'demo' | null), clean: cleanRecipe (sim/maker/index.js), max: MINE_MAX }.
 * Returns the store: list(), get(id), count, full, nextId(), save(recipe) -> recipe | null, remove(id) -> bool, kept.
 */
export function createMineStore({ mode = null, clean, max = 12 } = {}) {
  if (typeof clean !== 'function') throw new Error('createMineStore: clean (cleanRecipe) missing');
  const demo = mode === 'demo';
  let units = [], next = 1, kept = true;
  const gone = new Set(); // ids deleted in this visit (a merge with another tab's save doesn't bring them back)

  // saved data -> clean, unique, at most max recipes (a recipe without a usable id gets a fresh one)
  function parse(raw) {
    const out = [], seen = new Set();
    let nx = raw && idOk(raw.next) ? raw.next : 1;
    const list = raw && raw.v === STORE_V && Array.isArray(raw.units) ? raw.units : [];
    for (const u of list) if (u && typeof u === 'object' && idOk(u.id)) nx = Math.max(nx, u.id + 1);
    for (const u of list) {
      if (out.length >= max || !u || typeof u !== 'object') continue;
      let r;
      try { r = clean(u); } catch (e) { continue; }
      if (!idOk(u.id) || seen.has(r.id)) r = { ...r, id: nx++ };
      seen.add(r.id); out.push(r);
    }
    return { units: out, next: nx };
  }
  function load() {
    if (demo) { const p = parse({ v: STORE_V, next: 1, units: DEMO }); units = p.units; next = p.next; return; }
    if (mode === 'none') kept = writeRaw({ v: STORE_V, next: 1, units: [] });
    const p = parse(readRaw()); units = p.units; next = p.next;
  }
  // write, keeping what another tab saved meanwhile (its units we don't know and didn't delete)
  function persist() {
    if (demo) return false;
    const saved = parse(readRaw());
    next = Math.max(next, saved.next);
    const mine = new Set(units.map((r) => r.id));
    for (const r of saved.units) if (!mine.has(r.id) && !gone.has(r.id) && units.length < max) { units.push(r); mine.add(r.id); }
    kept = writeRaw({ v: STORE_V, next, units });
    return kept;
  }
  load();

  return {
    list() { return units.slice(); },
    get(id) { return units.find((r) => r.id === id) || null; },
    get count() { return units.length; },
    get full() { return units.length >= max; },
    get demo() { return demo; },
    /** false = the last write didn't stick (storage blocked or full): the units live for this visit only */
    get kept() { return kept; },
    /** the id a new unit gets (the maker opens with newRecipe(nextId())) */
    nextId() {
      if (!demo) { const s = parse(readRaw()); next = Math.max(next, s.next); }
      while (units.some((r) => r.id === next) || gone.has(next)) next++;
      return next;
    },
    /** Save a new (isNew) or edited recipe (cleaned). A new one when full -> null. Returns the saved recipe. A new one
     *  whose id got taken meanwhile (another tab) gets a fresh id; an edit of a unit that is gone is saved as new. */
    save(recipe, isNew = false) {
      let r = clean(recipe);
      const i = isNew ? -1 : units.findIndex((u) => u.id === r.id);
      if (i >= 0) units[i] = r;
      else {
        if (units.length >= max) return null;
        if (!idOk(recipe && recipe.id) || gone.has(r.id) || units.some((u) => u.id === r.id)) r = { ...r, id: this.nextId() };
        units.push(r);
        next = Math.max(next, r.id + 1);
      }
      persist();
      return this.get(r.id);
    },
    remove(id) {
      const i = units.findIndex((u) => u.id === id);
      if (i < 0) return false;
      units.splice(i, 1); gone.add(id);
      persist();
      return true;
    },
  };
}
