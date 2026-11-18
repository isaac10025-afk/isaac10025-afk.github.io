// Secrets store (OURS, Part 2 step 7, STEP7.md): which map secret units the player has found. Owner: UI.
// Saved on the device in localStorage 'paint-battle:secrets' as a JSON list of unit types. Every storage access is in
// try/catch: with storage blocked (private window, iframe rules) finds still work for this visit, they just aren't kept.
// URL switches (tests, shots):
//   ?secrets=all   every secret unlocked for this visit (storage left alone)
//   ?secrets=none  start locked: what was saved is wiped, then finds are saved as usual
const KEY = 'paint-battle:secrets';

function readStore() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch (e) { return []; }
}
function writeStore(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

/** types = every secret unit type (the store ignores anything else). mode = the ?secrets= value ('all' | 'none' | null). */
export function createSecrets(types, mode = null) {
  const known = new Set(types);
  const found = new Set();
  const all = mode === 'all';
  if (mode === 'none') writeStore([]);
  else if (!all) for (const t of readStore()) if (known.has(t)) found.add(t);
  const listeners = new Set();
  return {
    /** found (or ?secrets=all) */
    has(type) { return all ? known.has(type) : found.has(type); },
    /** Mark found; returns true when it is new. Saved at once (unless ?secrets=all). */
    add(type) {
      if (!known.has(type) || this.has(type)) return false;
      found.add(type);
      // ATTACK L2 (11-16): keep what another tab saved meanwhile (two tabs open: the second find used to overwrite the
      // first tab's finds with its own list). Unknown junk in the store is dropped on the way.
      for (const t of readStore()) if (known.has(t)) found.add(t);
      writeStore([...found]);
      for (const fn of listeners) { try { fn(type); } catch (e) { console.warn('secrets listener', e); } }
      return true;
    },
    list() { return all ? [...known] : [...found]; },
    get all() { return all; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
