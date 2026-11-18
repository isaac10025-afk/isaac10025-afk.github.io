// Perception (targeting) on think ticks: sight, nearest enemy, target choice, reaction delay, LOS, contact, odds/threat,
// fear/noise samples. OG core-move §9, core-combat §2 (system game.js:4902-4964, choice game.js:3455-3545, odds game.js:3546-3589).
import { THINK_MIN, THINK_SPAN, STATE, hypot } from '../const.js';
import { ENEMY, FACTION_COUNT, maskBit, maskHas } from '../factions.js';
import { fearLayer, NOISE_LAYER } from '../world.js';

const PICK_MAX = 48;                       // OG game.js:3446
const pickList = new Array(PICK_MAX), pickW = new Float64Array(PICK_MAX), tmp = new Array(PICK_MAX), allyTmp = new Array(9);
const CLIMB_SIGHT = 1.2;                   // ×1.2 sight when fully climbed (OG game.js:9011)
const ODDS_RANGE = 110;                    // OG game.js:3554

// D(r) = 1.2r + min(20, 0.4r) (OG game.js:3543-3545)
export function pickReach(r) { return 1.2 * r + Math.min(20, 0.4 * r); }
// "Weak" prey: fleeing or under half hp (OG game.js:3533-3535)
export function isWeak(u) { return u.state === STATE.FLEE || u.hp < 0.5 * u.maxHp; }

function hiddenFrom(t, d, hidden) { const h = hidden === 2 ? t.unseenBySeers : t.unseen; return h > 0 && d > h; }

// Predator weight Bt (OG game.js:3536-3542).
function preyScore(world, u, t) {
  let w = t.state === STATE.FLEE ? 5 : 1;
  w *= 1 + 3 * (1 - Math.max(0, t.hp) / t.maxHp);
  w /= Math.max(1, t.mass / u.mass);
  const allies = world.queryMask(t.x, t.y, 60, maskBit(t.faction), allyTmp, 9);
  return w / (1 + 0.5 * Math.max(0, allies - 1));
}

// Target choice Ft (OG game.js:3455-3532). cur = current target or null, near = nearest enemy or null, r = its distance,
// R = sight radius. Returns the chosen unit or null.
export function chooseTarget(world, u, def, cur, near, r, R, mask, hidden) {
  const ux = u.x, uy = u.y, melee = !!def.melee;
  let v = 0;
  if (!melee && near) { // ranged spread factor from N's distance minus its closing speed (OG game.js:3461-3466)
    const dx = near.x - ux, dy = near.y - uy, rr = r - 1.2 * Math.max(0, -(near.vx * dx + near.vy * dy) / (r || 1));
    v = Math.min(1, Math.max(0, (rr - 90) / 110));
  }
  const y = melee ? 70 + (def.swarms ? 110 : 0) + (def.assassin ? 160 : 0) + (def.predator ? 200 : 0) : 60 * v; // OG game.js:3467
  const w = 0.3 + 0.5 * v;
  if (cur) {
    const cd = hypot(cur.x - ux, cur.y - uy);
    const crowded = melee
      ? !def.swarms && cur.attackers - 1 >= 4 && cd > u.radius + cur.radius + 8
      : v > 0 && cur.shooters - 1 >= 3 && world.rng() < 0.35 * v;               // OG game.js:3471-3473
    let swap = false;
    if (def.assassin === true && cur.def.melee && near) {                         // assassin: any visible non-melee in reach (OG game.js:3474-3488)
      const n = world.queryMask(ux, uy, pickReach(r) + y, mask, tmp, PICK_MAX);
      for (let k = 0; k < n; k++) { const o = tmp[k]; if (!o.def.melee && !hiddenFrom(o, hypot(o.x - ux, o.y - uy), hidden)) { swap = true; break; } }
    } else if (def.predator === true && !isWeak(cur) && near) {                  // predator: any visible weak prey in reach (OG game.js:3489-3500)
      const n = world.queryMask(ux, uy, pickReach(r) + y, mask, tmp, PICK_MAX);
      for (let k = 0; k < n; k++) { const o = tmp[k]; if (isWeak(o) && !hiddenFrom(o, hypot(o.x - ux, o.y - uy), hidden)) { swap = true; break; } }
    }
    if (cd <= 1.25 * R && !crowded && !swap) {
      if (def.stickyTarget) { if (!near || r > 0.6 * cd) return cur; }           // OG game.js:3502-3503
      else if (near && cd <= pickReach(r) + y) return cur;                          // OG game.js:3504
    }
  }
  if (!near) return null;
  const reach = pickReach(r) + y;
  const n = world.queryMask(ux, uy, reach, mask, pickList, PICK_MAX);
  if (n <= 1) return near;
  let sum = 0;
  for (let k = 0; k < n; k++) { // weighted random (OG game.js:3511-3529)
    const c = pickList[k], d = hypot(c.x - ux, c.y - uy);
    if (hiddenFrom(c, d, hidden)) { pickW[k] = 0; continue; }
    let wt = Math.max(0.05, 1 - (0.7 * (d - r)) / (reach - r));
    wt /= melee ? 1 + (def.swarms ? 0.08 : 0.6) * (c.attackers - (c === cur ? 1 : 0)) : 1 + w * (c.shooters - (c === cur ? 1 : 0));
    if (def.swarms && !c.def.melee) wt *= 4;
    if (def.assassin && !c.def.melee) wt *= 6;
    if (def.predator) wt *= preyScore(world, u, c);
    pickW[k] = wt; sum += wt;
  }
  let roll = world.rng() * sum;
  for (let k = 0; k < n; k++) { roll -= pickW[k]; if (roll <= 0) return pickList[k]; }
  return near;
}

// Local odds and threat within 110 px, hidden units included (OG zt game.js:3546-3589).
export function computeOdds(world, u, ownFaction, mask) {
  const g = world.grid, us = world.units, st = g.start, it = g.items, cols = g.cols, FC = FACTION_COUNT;
  const x = u.x, y = u.y, K = ODDS_RANGE, K2 = K * K;
  let tx = 0, ty = 0, tt = 0, enemy = 0, own = u.def.strength;
  const lo = mask >>> 0, hi = (mask / 4294967296) >>> 0; // 53-bit mask (factions.js)
  const act = g.act, na = g.nAct;   // factions in the grid, ascending (world.js Grid): same order as 0..FC-1
  for (let cy = g.cy(y - K), cy1 = g.cy(y + K); cy <= cy1; cy++) for (let cx = g.cx(x - K), cx1 = g.cx(x + K); cx <= cx1; cx++) {
    const base = (cy * cols + cx) * FC;
    for (let a = 0; a < na; a++) {
      const f = act[a];
      const hostile = (f < 32 ? (lo >>> f) & 1 : (hi >>> (f - 32)) & 1) === 1;
      if (!hostile && f !== ownFaction) continue;
      for (let p = st[base + f], e = st[base + f + 1]; p < e; p++) {
        const o = us[it[p]]; if (o === u || o.dead) continue;
        const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
        if (d2 >= K2) continue;
        const d = Math.sqrt(d2), s = o.def.strength * (1 - d / K);
        if (!hostile) { own += s; continue; }
        enemy += s;
        if (d < 0.001) continue;
        const closing = -(o.vx * dx + o.vy * dy) / d, wgt = closing > 20 ? s * (1 + Math.min(closing, 150) / 150) : s;
        tx += (dx / d) * wgt; ty += (dy / d) * wgt; tt += wgt;
      }
    }
  }
  u.threatX = tx; u.threatY = ty; u.threat = tt; u.odds = enemy / own;
}

function nearestBoss(bosses, x, y, mask) {
  let best = null, bd = Infinity;
  for (const b of bosses) { if (maskHas(mask, b.faction) === 0) continue; const d = (b.x - x) ** 2 + (b.y - y) ** 2; if (b.unseen > 0 && d > b.unseen * b.unseen) continue; if (d < bd) { bd = d; best = b; } }   // STEP6 BOSSES: a hidden boss (worm under the ground, a breaking-down mech) pulls nobody
  return best;
}

export function run(world) {
  const us = world.units, gs = world.groups, fields = world.fields, tick = world.tick, n = us.length;
  // Attackers / shooters on each unit (OG game.js:4912-4921).
  for (let i = 0; i < n; i++) { const u = us[i]; u.attackers = 0; u.shooters = 0; }
  for (let i = 0; i < n; i++) {
    const u = us[i]; if (u.dead || u.target < 0) continue;
    const t = world.unitById(u.target); if (!t) continue;
    if (u.def.melee) t.attackers++; else t.shooters++;
  }
  const bosses = world.bosses(), steam = world.steam, walls = world.walls;
  for (let i = 0; i < n; i++) {
    const u = us[i];
    if (u.dead || u.nextThink > tick) continue;
    u.lastThink = tick; u.nextThink = tick + THINK_MIN + ((world.rng() * THINK_SPAN) | 0); // OG game.js:4925
    if (world.holding) { u.target = -1; continue; }                                  // OG game.js:4925-4927
    const def = u.def, x = u.x, y = u.y, fac = u.faction, mask = ENEMY[fac], g = u.group;
    const alerted = u.state !== STATE.IDLE || (g >= 0 && gs.alert[g] > 0), blind = u.blind === 1;
    const R = (blind ? 55 : alerted ? def.alertSightRange : def.sightRange) * (u.climb === 1 ? CLIMB_SIGHT : 1); // OG game.js:4935-4937
    const hidden = def.seesLurkers ? 2 : 1;
    const near = R > 0 && mask !== 0 ? world.findNearest(x, y, R, mask, null, hidden) : null;
    const nd2 = near ? (near.x - x) ** 2 + (near.y - y) ** 2 : R * R;
    let cur = u.target >= 0 ? world.unitById(u.target) : null;
    if (cur) { // dropped if it became hidden beyond its hidden radius (OG game.js:4943)
      const h = hidden === 2 ? cur.unseenBySeers : cur.unseen;
      if (h > 0 && (cur.x - x) ** 2 + (cur.y - y) ** 2 > h * h) cur = null;
    }
    let pick = chooseTarget(world, u, def, cur, near, Math.sqrt(nd2), R, mask, hidden);
    if (bosses.length > 0 && (!near || nd2 > 1600 || near.def.boss)) {            // boss pull (OG game.js:4945-4948)
      const b = nearestBoss(bosses, x, y, mask); if (b) pick = b;
    }
    if (pick && !pick.def.boss && steam.count > 0 && (pick.x - x) ** 2 + (pick.y - y) ** 2 > 2500 && steam.blocks(x, y, pick.x, pick.y, world.time)) pick = null; // OG game.js:4949-4954
    if (!cur && pick) u.react = u.reactTime;                                         // OG game.js:4955
    u.target = pick ? pick.id : -1;
    u.los = pick && walls.lineOfSight(x, y, pick.x, pick.y) ? 1 : 0;                 // OG game.js:4958
    if (pick && g >= 0 && !blind) gs.reportContact(g, pick.x, pick.y, world.time);   // OG game.js:4959
    if (nd2 < ODDS_RANGE * ODDS_RANGE) computeOdds(world, u, fac, mask);             // OG game.js:4960
    else { u.threat = u.threatX = u.threatY = u.odds = 0; }
    u.fear = fields.sample(fearLayer(fac), x, y);                                    // OG game.js:4961
    u.noise = fields.sample(NOISE_LAYER, x, y);                                      // OG game.js:4962
  }
}
