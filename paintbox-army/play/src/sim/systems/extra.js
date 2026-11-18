// Extra tick systems registered by unit modules (Part 2 step 4+, OURS). No imports here, so any unit file can import it.
// registerSystem(name, run, after): run(world) every tick, right after the system named `after` (default 'lifecycle',
// i.e. after deaths are processed). Same name again = replaced. Order among systems with the same `after` = import order.
export const EXTRA = [];
export let extraVersion = 0;
export function registerSystem(name, run, after = 'lifecycle') {
  if (typeof run !== 'function') throw new Error('registerSystem: run must be a function');
  const i = EXTRA.findIndex((e) => e.name === name);
  if (i >= 0) EXTRA[i] = { name, run, after }; else EXTRA.push({ name, run, after });
  extraVersion++;
}
