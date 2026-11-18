// Ballistics system (OG game.js:5085-5222): bullets, shurikens, plasma, flames, grenades, arrows.
import { DT, WET, QUERY_MARGIN, CAUSE, initCombat, raycast, wallCount, solidAt, depthAt, frozenAt, onIce, submerged, rnd, signed, range, hypot, emit, hooks, stat } from './env.js';
import { damage, blockFrac, suppress, spark, hatKnock } from './damage.js';
import { push } from './push.js';
import { explode, getBlast } from './explode.js';
import { ignite, igniteNow, BURN_BASE } from './fire.js';
import { dodgeWarn } from './status.js';
import { getOil } from './oil.js';
import { removeProjectile, flameRadius, HOST_FREED, PROJ_STEP } from './projectiles.js';
import { canHit } from '../factions.js';

export const SUPPRESS_PAD = 10;          // OG game.js:5151: near miss within radius (+4) + 10
export const PLASMA_PAD = 4;             // OG game.js:5123
export const RICO_START = 0.35, RICO_SPAN = 0.5, RICO_DMG = 0.2, RICO_KEEP = 0.7, RICO_PEN = 0.5; // OG 2917-2951
export const HEAVY_SHOT = 50, HEAVY_STUN = 0.22; // OG game.js:5188-5189
export const FLAME_DRAG = 2.5;           // OG game.js:2972
export const FLAME_WATER_DRAIN = 4;      // OG game.js:2991: extra 4·dt life per tick in water
export const ALIGHT_BURN = 1.6 * BURN_BASE, ALIGHT_CHANCE = 2.5, ALIGHT_PUSH = 0.35; // OG game.js:3026-3029
export const GRENADE_LOW = 10;           // OG game.js:3062
export const SLIME_STICK_PAD = 3, SLIME_FUSE = 1.1; // OG game.js:3128-3129 (ht, ut)
export const ARROW_REACH = 5;            // OG game.js:3151
export const ARROW_PERCH = 0.6, EYE_COS = -0.8, EYE_BONUS = 60, ARROW_PUSH = 45, ARROW_STUN = 0.1; // OG 3157-3189
export const ARROW_OIL_R = 6;            // OG game.js:3196 (D.a)
export const MAX_STUCK = 2;              // OG game.js:3203, 10710
export const GROUND_ARROW_CAP = 2048;     // OG stuckArrows ring capacity (game.js:2174, 5478)
export const GROUND_ARROW_LIFE = 5;      // OG game.js:21564-21571 (drawn 5 s, fades last 1 s)

const _probe = { id: -1, faction: 0, team: -1, def: null, x: 0, y: 0 };
function maskHit(p, u) {
  if (p.wild === 1) return true;
  _probe.faction = p.faction; _probe.team = p.team;
  return canHit(_probe, u);
}
function ownerOf(world, p) { if (p.owner < 0) return null; const o = world.unitById(p.owner); return o && !o.removed ? o : null; }
function outside(world, x, y) { return x < 0 || y < 0 || x > world.W || y > world.H; }

// ---------- bullet / shuriken / plasma ----------
let _w = null, _p = null, _x0 = 0, _y0 = 0, _dx = 0, _dy = 0, _F = 1, _wall = Infinity, _best = null, _bestT = Infinity, _extra = 0;
function segTest(u) {
  if (!(u.hp > 0) || u.id === _p.passed || !maskHit(_p, u)) return;
  if (u.def.aquatic && frozenAt(_w, u.x, u.y)) return;                       // OG game.js:5139
  if (submerged(_w, u)) return;                                              // OG game.js:5140
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ox - _dx * t, qy = oy - _dy * t, d2 = qx * qx + qy * qy, R = u.radius + _extra;
  if (d2 < R * R) { if (t < _bestT) { _bestT = t; _best = u; } }
  else if (t < _wall) { const n = R + SUPPRESS_PAD; if (d2 < n * n) suppress(_w, u); } // near miss (OG 5151-5154)
}

// Glancing hits on deflecting / shield-facing units bounce (OG game.js:2917-2923).
function ricochetRoll(world, u, sx, sy, off2, extra) {
  if (u.def.armorBounce) return u.def.armorBounce(world, u, sx, sy) === true;   // STEP4 DINOS: armour (ankylo) decides: bounces unless from behind
  if (!u.def.deflects && blockFrac(u, sx, sy) === 0) return false;
  const l = Math.sqrt(off2) / (u.radius + extra), h = Math.min(1, Math.max(0, (l - RICO_START) / RICO_SPAN));
  return h > 0 && rnd(world) < h;
}
// Apply a ricochet (OG game.js:2924-2951).
function ricochet(world, p, u, x0, y0, dx, dy, tc, off2) {
  const r = u.radius, m = hypot(dx, dy) || 0.001;
  const back = Math.sqrt(Math.max(0, r * r - off2)) / m, t = Math.min(1, Math.max(0, tc - back));
  const cx = x0 + dx * t, cy = y0 + dy * t;
  let nx = cx - u.x, ny = cy - u.y; const nd = hypot(nx, ny) || 1; nx /= nd; ny /= nd;
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) { p.vx -= 2 * vn * nx; p.vy -= 2 * vn * ny; }
  p.vx *= RICO_KEEP; p.vy *= RICO_KEEP;
  const pass = damage(world, u, RICO_DMG * p.damage, ownerOf(world, p));
  push(world, u, dx / m, dy / m, p.damage * RICO_DMG * pass, 0);
  p.damage *= RICO_KEEP; p.pen *= RICO_PEN; p.passed = u.id; p.wild = 1;     // wild: hits every faction from now on
  p.x = cx + nx; p.y = cy + ny;
  spark(world, cx, cy, Math.atan2(p.vy, p.vx));
  emit(world, 'ricochet', { x: cx, y: cy, v: 1, type: u.type });
  stat(world, 'hits');
}
// Pierce through (OG game.js:2952-2966).
function pierce(world, p, u, t, resist) {
  const pen = p.pen;
  p.damage *= (pen - resist) / pen; p.pen = pen - resist; p.passed = u.id;
  p.x += p.vx * DT * t; p.y += p.vy * DT * t;
  const a = Math.atan2(p.vy, p.vx);
  emit(world, 'spray', { x: u.x + Math.cos(a) * u.radius, y: u.y + Math.sin(a) * u.radius, ang: a, size: Math.min(2, u.radius / 9), goo: u.type === 'slime' ? 1 : u.type === 'risen_slime' ? 2 : 0, mach: u.def.machine ? 1 : 0 }); // STEP6 (lead): mach = sparks, not blood
}

// Returns true if the projectile was removed.
function stepBullet(world, p, i) {
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT, x1 = x0 + dx, y1 = y0 + dy, F = dx * dx + dy * dy || 1e-6;
  p.px = x0; p.py = y0;
  const plasma = p.kind === 'plasma', extra = plasma ? PLASMA_PAD : 0;
  const wall = raycast(world, x0, y0, x1, y1);
  _w = world; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F; _wall = wall; _best = null; _bestT = wall; _extra = extra;
  const len = Math.sqrt(F);
  world.query(x0 + dx / 2, y0 + dy / 2, len / 2 + QUERY_MARGIN + SUPPRESS_PAD + 5, segTest);
  const hit = _best, tHit = _bestT;
  _w = null; _p = null; _best = null;
  if (plasma && (hit || wall <= 1)) {                                          // OG game.js:5157-5164
    explode(world, x0 + dx * tHit, y0 + dy * tHit, p.blast, ownerOf(world, p), p.damage);
    if (hit) stat(world, 'hits');
    removeProjectile(world, i); return true;
  }
  const resist = hit ? (hit.def.density !== undefined ? hit.def.density : 1) + (blockFrac(hit, x0, y0) > 0 ? 2 : 0) : 0; // OG 5165-5170
  const pierces = !!hit && p.pen > resist;
  if (hit && !pierces) {
    const tc = ((hit.x - x0) * dx + (hit.y - y0) * dy) / F, qx = hit.x - x0 - dx * tc, qy = hit.y - y0 - dy * tc, off2 = qx * qx + qy * qy;
    if (ricochetRoll(world, hit, x0, y0, off2, extra)) { ricochet(world, p, hit, x0, y0, dx, dy, tc, off2); return false; }
  }
  if (hit && hit.def.onPunctured && hit.def.onPunctured(world, hit, true, pierces) === true) { // props (OG 5181-5185)
    stat(world, 'hits');
    emit(world, 'ricochet', { x: hit.x, y: hit.y, v: 1, type: hit.type });
    if (pierces) pierce(world, p, hit, tHit, resist); else { removeProjectile(world, i); return true; }
    return false;
  }
  if (hit) {                                                                   // OG game.js:5186-5204
    const own = ownerOf(world, p), dmg = p.damage;
    const pass = damage(world, hit, dmg, own);
    push(world, hit, dx / len, dy / len, dmg * pass, dmg >= HEAVY_SHOT ? HEAVY_STUN * pass : 0);
    if (dmg >= HEAVY_SHOT && pass > 0.5) hatKnock(world, hit, dx / len, dy / len);
    stat(world, 'hits');
    const shur = p.kind === 'shuriken';
    emit(world, pass < 0.5 ? 'ricochet' : shur ? 'arrowhit' : 'bullethit', { x: hit.x, y: hit.y, v: shur ? 0.5 : Math.min(1.5, dmg / 30), type: hit.type });
    if (pierces) { pierce(world, p, hit, tHit, resist); return false; }
    removeProjectile(world, i); return true;
  }
  if (wall <= 1) {                                                             // wall: spark, removed (OG 5206-5210)
    const wx = x0 + dx * wall, wy = y0 + dy * wall;
    emit(world, 'ricochet', { x: wx, y: wy, v: 0.6 });
    spark(world, wx, wy, Math.atan2(-dy, -dx) + 0.9 * signed(world), 0.7);
    removeProjectile(world, i); return true;
  }
  p.x = x1; p.y = y1; p.life -= DT;
  if (p.life <= 0 || outside(world, x1, y1)) {                                 // OG game.js:5211-5221
    if (plasma) explode(world, x1, y1, p.blast, -1, p.damage);
    else if (depthAt(world, x1, y1) >= WET) emit(world, 'splash', { x: x1, y: y1, v: 0.5 });
    removeProjectile(world, i); return true;
  }
  return false;
}

// ---------- flame ----------
let _fr = 0, _fwall = Infinity, _fhit = false, _fown = null;
function flameTest(u) {
  if (!(u.hp > 0) || !(u.def.flammability > 0) || !maskHit(_p, u)) return;   // flammability 0 = immune (OG 3017)
  const ox = u.x - _x0, oy = u.y - _y0;
  let t = (ox * _dx + oy * _dy) / _F; t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (t >= _fwall) return;
  const qx = ox - _dx * t, qy = oy - _dy * t, R = u.radius + _fr;
  if (qx * qx + qy * qy >= R * R) return;
  initCombat(u);
  damage(_w, u, _p.damage, _fown);
  if (_p.alight) {
    ignite(_w, u, ALIGHT_CHANCE, ALIGHT_BURN);
    const v = hypot(_p.vx, _p.vy) || 1;
    if (u.hp > 0) push(_w, u, _p.vx / v, _p.vy / v, ALIGHT_PUSH * _p.damage, 0);
  } else ignite(_w, u, 1, BURN_BASE);
  _fhit = true;
}
function stepFlame(world, p, i) {
  const drag = Math.max(0, 1 - FLAME_DRAG * DT);                               // OG game.js:2972-2973
  p.vx *= drag; p.vy *= drag;
  const x0 = p.x, y0 = p.y, dx = p.vx * DT, dy = p.vy * DT, x1 = x0 + dx, y1 = y0 + dy;
  p.px = x0; p.py = y0;
  const wall = raycast(world, x0, y0, x1, y1), fr = flameRadius(p), oil = getOil(world);
  if (oil.cells > 0) oil.ignite(x0, y0, fr);                                   // OG game.js:2983
  if (hooks.iceHarm && hooks.iceHarm(world, x0, y0, fr, 0.9 * p.scale * DT) && rnd(world) < 3 * DT) emit(world, 'steampuff', { x: x0, y: y0 });
  if (depthAt(world, x0, y0) >= WET && oil.slickAt(x0, y0) === 0) {           // OG game.js:2988-2995
    p.life -= FLAME_WATER_DRAIN * DT;
    if (rnd(world) < 0.08) {
      emit(world, 'steam', { x: x0, y: y0 - 6, size: 18, thick: 1.6 });
      if (hooks.steam) hooks.steam(world, x0, y0 - 6, 18, 1.6);
    }
  }
  if (p.damage > 0) {
    const F = dx * dx + dy * dy || 1e-6;
    _w = world; _p = p; _x0 = x0; _y0 = y0; _dx = dx; _dy = dy; _F = F; _fr = fr; _fwall = wall; _fhit = false; _fown = ownerOf(world, p);
    world.query(x0 + dx / 2, y0 + dy / 2, Math.sqrt(F) / 2 + QUERY_MARGIN + fr + 5, flameTest);
    if (_fhit) p.damage = p.alight ? 0.5 * p.damage : 0;                        // OG game.js:3035
    _w = null; _p = null; _fown = null;
  }
  if (wall <= 1) { removeProjectile(world, i); return true; }
  p.x = x1; p.y = y1; p.life -= DT;
  if (p.life <= 0 || outside(world, x1, y1)) { removeProjectile(world, i); return true; }
  return false;
}

// ---------- grenade ----------
function isSlime(u) { return u.type === 'slime' || u.type === 'risen_slime'; }
let _gp = null, _gs = null;
function slimeTest(u) {
  if (_gs || !(u.hp > 0) || !isSlime(u)) return;
  const dx = u.x - _gp.x, dy = u.y - _gp.y, l = u.radius + SLIME_STICK_PAD;
  if (dx * dx + dy * dy <= l * l) { _gs = u; return true; }
}
function stepGrenade(world, p, i) {
  p.px = p.x; p.py = p.y;
  if (p.host >= 0) {                                                           // stuck to a slime (OG game.js:3047-3058)
    const h = world.unitById(p.host);
    if (!h || h.removed || !(h.hp > 0) || (h.subState | 0) !== p.hostSplit) { p.host = -1; p.hostSplit = HOST_FREED; p.apex = 0; return false; }
    p.x = h.x; p.y = h.y; p.life -= DT;
    if (p.life > 0) return false;
    explode(world, p.x, p.y, p.blast, ownerOf(world, p), p.damage);
    removeProjectile(world, i); return true;
  }
  const nx = Math.min(world.W, Math.max(0, p.x + p.vx * DT)), ny = Math.min(world.H, Math.max(0, p.y + p.vy * DT));
  const f = 1 - p.life / p.maxLife;
  p.z = 4 * p.apex * f * (1 - f);                                              // height (looks + wall rule)
  if (p.z < GRENADE_LOW && wallCount(world) > 0 && solidAt(world, nx, ny)) {  // OG game.js:3062-3066
    emit(world, 'bounce', { x: p.x, y: p.y, v: 0.8 * Math.min(1, hypot(p.vx, p.vy) / 200) });
    p.vx *= -0.5; p.vy *= -0.5;
  } else { p.x = nx; p.y = ny; }
  p.life -= DT;
  if (p.life > 0) return false;
  p.z = 0;
  if (hooks.grenadeLanded) hooks.grenadeLanded(world, p.x, p.y);              // may arm a mine (OG 3072)
  if (p.hostSplit !== HOST_FREED) {                                            // stick to a slime (OG 3073-3102)
    _gp = p; _gs = null;
    world.query(p.x, p.y, QUERY_MARGIN + SLIME_STICK_PAD + 5, slimeTest);
    const s = _gs; _gp = null; _gs = null;
    if (s) {
      p.host = s.id; p.hostSplit = s.subState | 0; p.vx = p.vy = 0; p.bounces = 0; p.apex = 0;
      p.life = p.maxLife = SLIME_FUSE * range(world, 0.7, 1.3);
      s.flash = Math.max(s.flash || 0, 0.5);
      return false;
    }
  }
  if (depthAt(world, p.x, p.y) >= WET) { p.bounces = 0; emit(world, 'splash', { x: p.x, y: p.y, v: 0.8 }); } // OG 3103-3104
  const ice = onIce(world, p.x, p.y);
  if (ice && p.scale < 2) { p.scale = 2; p.bounces++; }                        // first landing on ice adds a bounce
  if (p.bounces > 0) {                                                         // OG game.js:3107-3123
    p.bounces--;
    emit(world, 'bounce', { x: p.x, y: p.y, v: Math.min(1, hypot(p.vx, p.vy) / 200) });
    const a = 0.5 * signed(world) * (ice ? 0.3 : 1), k = ice ? 0.85 : 0.5, c = Math.cos(a) * k, s = Math.sin(a) * k;
    const vx = p.vx * c - p.vy * s, vy = p.vx * s + p.vy * c, h = Math.max(0.18, 0.4 * p.maxLife);
    p.vx = vx; p.vy = vy; p.life = p.maxLife = h; p.apex *= ice ? 0.12 : 0.3; p.trail = -1;
    const b = getBlast(p.blast);
    if (b) dodgeWarn(world, p.x + vx * h, p.y + vy * h, b.radius, h);
    return false;
  }
  explode(world, p.x, p.y, p.blast, ownerOf(world, p), p.damage);              // OG game.js:3124-3126
  removeProjectile(world, i); return true;
}

// ---------- arrow ----------
let _ap = null, _ab = null, _abd = Infinity;
function arrowTest(u) {
  if (!(u.hp > 0) || !maskHit(_ap, u) || submerged(_w, u)) return;
  const c = hypot(u.x - _ap.x, u.y - _ap.y) - u.radius;
  if (c < ARROW_REACH && c < _abd) { _abd = c; _ab = u; }
}
// Arrow stuck in a body, max 2 drawn (OG game.js:3200-3230); cosmetic offsets for the renderer.
function stickArrow(world, u, vx, vy, inShield) {
  if ((u.arrowsIn | 0) >= MAX_STUCK || !(u.hp > 0)) return;
  if (!u.arrows) u.arrows = [];
  const side = Math.cos(u.heading) >= 0 ? 1 : -1, m = hypot(vx, vy) || 1;
  let ang = Math.atan2(vy + 0.5 * m, vx) + 0.3 * signed(world); if (side < 0) ang = Math.PI - ang;
  u.arrows[u.arrowsIn] = { t: range(world, -0.75, 0.6), ang, shield: inShield ? 1 : 0, back: vx >= 0 ? -side : side };
  u.arrowsIn = (u.arrowsIn | 0) + 1;
}
function stepArrow(world, p, i) {
  p.px = p.x; p.py = p.y;
  p.x = Math.min(world.W, Math.max(0, p.x + p.vx * DT)); p.y = Math.min(world.H, Math.max(0, p.y + p.vy * DT));
  p.life -= DT;
  if (p.life > 0) return false;                                                // no hits in flight (OG 3134)
  const x = p.x, y = p.y, vx = p.vx, vy = p.vy;
  _w = world; _ap = p; _ab = null; _abd = Infinity;
  world.query(x, y, QUERY_MARGIN + ARROW_REACH + 5, arrowTest);
  let t = _ab; _w = null; _ap = null; _ab = null;
  if (t && t.climb > 0.5 && rnd(world) < ARROW_PERCH) {                        // climbing target: hit the perch 60%
    const pr = t.perch >= 0 ? world.unitById(t.perch) : null; if (pr && !pr.removed) t = pr;
  }
  if (t) initCombat(t);
  if (t && p.alight) igniteNow(world, t, BURN_BASE);                           // OG game.js:3162
  const own = ownerOf(world, p);
  if (t && t.def.prop) {
    if (t.def.onPunctured) t.def.onPunctured(world, t, false);
    stickArrow(world, t, vx, vy, false);
    emit(world, 'arrowhit', { x, y, v: 1, type: t.type });
    if (t.type === 'anthill' || t.type === 'beehive') damage(world, t, p.damage, own);   // STEP6 BUGS: the beehive (a prop like the anthill) is hurt by arrows too
  } else if (t) {
    const v = hypot(vx, vy) || 1, eye = t.def.eyeShot || 0;
    const facing = (Math.cos(t.heading) * vx + Math.sin(t.heading) * vy) / v;
    if (eye > 0 && t.blind === 0 && facing < EYE_COS && rnd(world) < eye) {   // eye shot (OG 3175-3184)
      t.blind = 1; t.target = -1;
      damage(world, t, p.damage + EYE_BONUS, own);
      stat(world, 'hits');
      removeProjectile(world, i); return true;
    }
    if (t.def.armorBounce && t.def.armorBounce(world, t, x - vx, y - vy) === true) { // STEP4 DINOS: armour (ankylo): the arrow glances off
      damage(world, t, RICO_DMG * p.damage, own, 'blow', x - vx, y - vy); spark(world, x, y, Math.atan2(-vy, -vx) + 0.9 * signed(world), 0.7);
      emit(world, 'ricochet', { x, y, v: 1, type: t.type }); stat(world, 'hits'); removeProjectile(world, i); return true;
    }
    const pass = damage(world, t, p.damage, own, 'blow', x - vx, y - vy);     // from = landing point − velocity·1 s
    push(world, t, vx / v, vy / v, ARROW_PUSH * pass, ARROW_STUN * pass);
    stickArrow(world, t, vx, vy, pass < 0.5);
    emit(world, pass < 0.5 ? 'block' : 'arrowhit', { x, y, v: 1, type: t.type });
    stat(world, 'hits');
  } else {
    const wet = depthAt(world, x, y) >= WET;
    emit(world, wet ? 'splash' : 'arrowhit', { x, y, v: wet ? 0.6 : 0.5 });
    if (!wet) {
      if (!world.groundArrows) world.groundArrows = [];
      const ga = world.groundArrows, rec = { x, y, ang: Math.atan2(vy, vx), t: world.time };
      if (ga.length < GROUND_ARROW_CAP) ga.push(rec);
      else { let o = 0; for (let k = 1; k < ga.length; k++) if (ga[k].t < ga[o].t) o = k; ga[o] = rec; } // full: the oldest goes (OG ring of 2048, game.js:2172-2195)
      if (hooks.arrowLanded) hooks.arrowLanded(world, x, y);
    }
    if (p.alight) getOil(world).ignite(x, y, ARROW_OIL_R);
  }
  removeProjectile(world, i); return true;
}

// STEP6 ROBOTS: shield domes (units/robots/shieldbot.js sets both). live(world) → a dome is up this tick; stop(world, p, i)
// → true when p crossed into an enemy dome and was removed at its edge. Unset or no dome up = nothing runs (OG battles).
export const DOME = { live: null, stop: null };

export function run(world) {
  const list = world.projectiles;
  if (list && list.length) {
    const dome = DOME.live !== null && DOME.live(world) ? DOME.stop : null;   // STEP6 ROBOTS
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      world.projKind = p.kind;                                               // STEP6 (lead): def.damageMul sees what hit it (damage.js)
      if (dome !== null && dome(world, p, i)) continue;                      // STEP6 ROBOTS: stopped at a shield dome
      if (p.kind === 'flame') stepFlame(world, p, i);
      else if (p.kind === 'grenade') stepGrenade(world, p, i);
      else if (p.kind === 'arrow') stepArrow(world, p, i);
      else if (PROJ_STEP[p.kind] !== undefined) PROJ_STEP[p.kind](world, p, i);   // OURS: registered kinds (step 4+)
      else stepBullet(world, p, i);
    }
    world.projKind = undefined;
  }
  const ga = world.groundArrows;
  if (ga && ga.length) for (let i = ga.length - 1; i >= 0; i--) if (world.time - ga[i].t > GROUND_ARROW_LIFE) { ga[i] = ga[ga.length - 1]; ga.pop(); }
}
