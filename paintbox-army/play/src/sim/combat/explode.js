// Explosions (OG 412.i, game.js:8883-8959) and the blast def registry (412.t / 412.f, game.js:8864-8870).
// Blast defs belong to the units / props that own them; they call registerBlast(name, def).
import { QUERY_MARGIN, CAUSE, initCombat, isDeepAt, lineOfSight, wallCount, rnd, emit, hooks, splatNoise, stat } from './env.js';
import { damage, hatKnock } from './damage.js';
import { push, toss } from './push.js';
import { startleAround } from './status.js';
import { getOil } from './oil.js';

export const WALL_R = 0.7, WALL_MUL = 2.5;      // OG game.js:8871-8872 (G, B)
export const OIL_R = 0.6;                       // OG game.js:8874 (z)
export const DEEP_DMG = 0.4, DEEP_PUSH = 0.4, DEEP_UP = 1.4, DEEP_SPEED = 0.3; // OG game.js:8875-8878 (Y, W, K, X)
export const ICE_R = 1.1;                       // OG game.js:8880 (V)
export const MINE_R = 1.25;                     // OG game.js:8940, 16193 (v)
export const NOISE_AMT = 1.2;                   // OG game.js:8942

const BLASTS = new Map();
/** registerBlast(name, def): def = {radius, damage, minFalloff, push, stun, tossUp?, tossSpeed?, tossFrom?, hatChance?, noiseRadius, plasma?} */
export function registerBlast(name, def) { BLASTS.set(name, def); return def; }
export function getBlast(name) { return typeof name === 'object' ? name : BLASTS.get(name) || null; }

let _w = null, _x = 0, _y = 0, _def = null, _dmg = 0, _own = null;
function blastOne(u) {
  if (!(u.hp > 0)) return;
  initCombat(u);
  const def = _def, cx = u.x - _x, cy = u.y - _y, d = Math.sqrt(cx * cx + cy * cy), reach = def.radius + u.radius;
  if (d > reach) return;                                                        // OG game.js:8910-8911
  if (wallCount(_w) > 0 && !lineOfSight(_w, _x, _y, u.x, u.y)) return;          // OG game.js:8912
  const fall = Math.max(def.minFalloff || 0, 1 - d / reach);                    // OG game.js:8913
  const pass = damage(_w, u, _dmg * fall, _own, 'blast', _x, _y);               // OG game.js:8914
  u.harmCause = CAUSE.Blast;
  let dx, dy;
  if (d > 0.001) { dx = cx / d; dy = cy / d; } else { const a = rnd(_w) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
  const tossing = def.tossUp !== undefined && fall * pass >= (def.tossFrom || 0); // OG game.js:8923
  if (tossing && u.hp > 0) toss(_w, u, dx, dy, (def.tossSpeed || 0) * fall * pass, def.tossUp * fall * pass);
  else push(_w, u, dx, dy, (def.push || 0) * fall * pass, (def.stun || 0) * fall * pass);
  if ((tossing || u.hp <= 0) && rnd(_w) < (def.hatChance || 0)) hatKnock(_w, u, dx, dy, 0.6 + fall); // OG 8927-8929
}

/**
 * explode(world, x, y, spec, src, dmg = spec.damage): spec is a blast def or a registered blast name.
 * src: owner unit / id / -1 (−1 = nobody; plasma timing out uses −1).
 */
export function explode(world, x, y, spec, src, dmg) {
  let def = getBlast(spec);
  if (!def) return;
  if (dmg === undefined) dmg = def.damage;
  const deep = !def.plasma && isDeepAt(world, x, y);                            // OG game.js:8886
  if (deep) {
    dmg *= DEEP_DMG;
    def = { ...def, push: (def.push || 0) * DEEP_PUSH, tossUp: (def.tossUp !== undefined ? def.tossUp : (def.push || 0)) * DEEP_UP, tossSpeed: (def.tossSpeed || 0) * DEEP_SPEED, tossFrom: 0 };
  }
  emit(world, 'explosion', { x, y, r: def.radius, plasma: !!def.plasma, deep });
  startleAround(world, x, y, def.noiseRadius);                                   // OG game.js:8898
  if (hooks.iceHarm) hooks.iceHarm(world, x, y, def.radius * ICE_R, 1.6, 0.25);  // OG game.js:8899 (Z, J)
  if (deep) emit(world, 'splash', { x, y, v: 2 });
  const sw = _w, sx = _x, sy = _y, sd = _def, sg = _dmg, so = _own;             // re-entrant (a hit hook may explode)
  _w = world; _x = x; _y = y; _def = def; _dmg = dmg; _own = src == null ? -1 : src;
  world.query(x, y, def.radius + QUERY_MARGIN, blastOne);                       // all factions (OG game.js:8902)
  _w = sw; _x = sx; _y = sy; _def = sd; _dmg = sg; _own = so;
  if (hooks.wallBlast) hooks.wallBlast(world, x, y, def.radius * WALL_R, dmg * WALL_MUL); // OG game.js:8931-8938
  if (hooks.armMinesNear) hooks.armMinesNear(world, x, y, def.radius);           // OG game.js:8940 (mines within 1.25·r, TERRAIN)
  if (hooks.peelsBlast) hooks.peelsBlast(world, x, y, def.radius);               // OG game.js:8941
  splatNoise(world, x, y, NOISE_AMT, def.noiseRadius);                          // OG game.js:8942
  stat(world, 'blasts');
  if (deep) return;                                                              // no oil lit in deep water (OG 8943-8956)
  getOil(world).ignite(x, y, def.radius * OIL_R);                                // OG game.js:8958
}
