// Seeded rng (mulberry32 step), the only randomness in the sim. OG game.js:2683-2702 has the same helpers.
// world.rng() → [0,1); world.rng.range(a,b), .signed(), .tri(), .int(n).
export function makeRng(seed) {
  let s = (seed ?? 1) >>> 0;
  const next = function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.signed = () => 2 * next() - 1;
  next.tri = () => next() - next();       // triangular (-1, 1) (OG game.js:2697-2699)
  next.int = (n) => (next() * n) | 0;
  next.getState = () => s >>> 0;
  next.setState = (v) => { s = v | 0; };
  return next;
}
// tri() as a free function: tri(rng) = rng() - rng().
export function tri(rng) { return rng() - rng(); }
