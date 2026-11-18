// TERRAIN's calls into other owners, in one place. Namespace imports, so a missing export is undefined (not a
// load error) and each call has a tiny local fallback. Tests may swap any entry (deps.toss = spy) to watch calls.
import * as combat from '../combat/index.js';
import * as damageMod from '../combat/damage.js';
import * as statusMod from '../combat/status.js';
import * as fireMod from '../combat/fire.js';
import * as oilMod from '../combat/oil.js';
import * as plagueMod from '../combat/plague.js';

export const deps = {
  // CORE-B explode(world, x, y, spec, src): src -1 = no killer credited.
  explode(world, x, y, spec, src) { if (combat.explode) combat.explode(world, x, y, spec, src); },
  toss(world, u, dx, dy, out, up) { if (combat.toss) combat.toss(world, u, dx, dy, out, up); },
  damage(world, u, amount, src, kind) { return combat.damage ? combat.damage(world, u, amount, src, kind) : ((u.hp -= amount), 1); },
  stun(world, u, t) { if (combat.stun) combat.stun(world, u, t); else if (t > (u.stun || 0)) u.stun = t; },
  hatKnock(world, u, dx, dy, pow) { if (damageMod.hatKnock) damageMod.hatKnock(world, u, dx, dy, pow); },
  // Ice slip toss: speed 110, up 170, 25 % hat (OG game.js:3319-3324). CORE-B has it as status.slip(…, 'ice').
  slipIce(world, u, speed) {
    if (statusMod.slip) { statusMod.slip(world, u, speed, 'ice'); return; }
    const dx = u.vx / speed, dy = u.vy / speed;
    deps.toss(world, u, dx, dy, 110, 170);
    if (world.rng() < 0.25) deps.hatKnock(world, u, dx, -0.5, 0.5);
  },
  // Put out a wet unit (OG game.js:717-733). CORE-B's quench is idempotent; it also runs at the end of the oil step.
  quench(world, u) { if (fireMod.quench) fireMod.quench(world, u); },
  // Catch plague from tainted water (OG 492.d, game.js:747). CORE-B plague owns it.
  catchPlague(world, u) { const f = plagueMod.catchPlague || plagueMod.infectPlague; if (f) f(world, u); },
  // Oil grid (CORE-B): created lazily by its getOil; read-only lookups never create it.
  oil(world) { return world.oil || null; },
  pour(world, x, y, amount) { const o = world.oil || (oilMod.getOil ? oilMod.getOil(world) : null); if (o && o.pour) o.pour(x, y, amount); },
};
