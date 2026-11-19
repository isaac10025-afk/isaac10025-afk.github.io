// Steering + locomotion + collision + flocking, then the physics pass. OG core-move §3-6, §11
// (module 569, game.js:13513-13923). One desired velocity per unit, handed to a Holonomic or Vehicle mover.
import { DT, STATE, LOCO, LEAP, GRAVITY, NEIGHBOUR_RADIUS, NEIGHBOUR_CAP, MINE_AVOID, WET, DEEP, SWIM_CAP, TAU, hypot, turnToward, angleDiff } from '../const.js';
import { FACTION_COUNT, F, isAnimalPlus } from '../factions.js';

// Optional hooks from other owners (missing file or export → local fallback).
async function opt(p) { try { return await import(p); } catch (e) { return null; } }
const [oilMod, pushMod, damageMod] = await Promise.all([opt('../combat/oil.js'), opt('../combat/push.js'), opt('../combat/damage.js')]);

const PUSH_SHARE = 0.6;      // stored push = 0.6 × overlap push sum (OG game.js:13535, 13721)
const DETOUR_PERP = 0.9;     // OG game.js:13555
const DETOUR_SIDE = 0.15;    // OG game.js:13556
const DETOUR_EASE = 0.1;     // OG game.js:13557
const JAM_SIDE = 0.5;        // OG game.js:13558
const JAMMED = 0.4;          // OG game.js:13559
const STUN_ACCEL = 300;      // accel cap while stunned (OG game.js:13560)
const AIR_IGNORE = 6;        // neighbours with z > 6 are skipped (OG game.js:13561)
const WEAVE = 0.22, WEAVE_BASE = 0.5; // advance weave (OG game.js:13561-13562)
const EDGE = 24, EDGE_PUSH = 4;       // field edge band (OG game.js:13548-13549)
const FACE_GOAL = 5, FACE_VEL = 30;   // heading follows goal > 5 px/s, else velocity > 30 px/s (OG game.js:13550-13551)
const BLOCK_FULL = 0.75;     // blocking weight 1 inside 0.75·contact, fading to 0 at contact (OG game.js:13552-13553)
const SEP_CLAMP = 1.5;       // OG game.js:13546
const FIRE_R = 34, FIRE_GAIN = 0.6;   // fire escape (OG game.js:13541-13542)
const ICE_GRIP = 0.2, ICE_ACCEL_MIN = 0.35, MINE_GRIP = 0.5; // OG game.js:13538-13540
const OIL_SLOW = 0.9, OIL_FULL = 0.25; // OG game.js:13536-13537
const UNDERFOOT_RATIO = 1.5; // OG game.js:13546
const HILL_PAD = 10;         // OG game.js:13922
const SICK_SLOW = 0.75, SICK_AFTER = 4; // plague: goal ×0.75 after 4 s (OG game.js:10010, 10033-10035)
const LAND_DAMP = 0.35, LAND_STUN = 0.3; // fallback landing (OG game.js:9083-9089)
const fireTmp = new Float32Array(2);
const lavaTmp = new Float32Array(2); // STEP7 TERRAIN-SIM

export function isSick(u, time) { return u.plague > 0 && time - u.plagueAt >= SICK_AFTER; }

// Oil grip factor (props exempt) (OG game.js:13834-13836).
function oilGrip(world, x, y, def) {
  if (world.oilCells > 0 && !def.prop && oilMod && oilMod.slickAt) return 1 - OIL_SLOW * Math.min(1, oilMod.slickAt(world, x, y) / OIL_FULL);
  return 1;
}
function onIce(world, x, y, def) { return world.iceCells > 0 && !def.prop && !def.aquatic && world.iceAt(x, y) > 0; } // OG game.js:13837-13839
// Mine-aware units are pushed off mines only when not stunned/burning/fleeing and grip ≥ 0.5 (OG game.js:13840-13854).
export function avoidsMines(world, u) {
  if (!u.def.mineAware || u.burning > 0 || u.state === STATE.FLEE || u.stun > 0) return false;
  let g = oilGrip(world, u.x, u.y, u.def);
  if (onIce(world, u.x, u.y, u.def)) g *= u.def.iceGrip ?? ICE_GRIP;
  return g >= MINE_GRIP;
}
// Wade factor on the goal (OG game.js:9715-9723).
export function wadeFactor(world, u, def) {
  if (world.waterCells === 0 || def.hopper || u.z > 0) return 1;
  let d = world.waterAt(u.x, u.y);
  if (d < WET) return 1;
  if (def.waterPace !== undefined) return def.waterPace;
  if (def.swims) d = Math.min(d, SWIM_CAP);
  const k = Math.min(1.3, Math.max(0.45, 9.5 / u.radius));
  return Math.max(0.35, 1 - 0.8 * d * k);
}
function nearOwnHill(world, u) { // inside own anthill radius + 10 (OG game.js:13913-13922)
  const col = world.colonies; if (!col || !col.alive || !col.hill) return false;
  const c = u.colony - 1; if (!col.alive[c]) return false;
  const hill = world.unitById(col.hill[c]); if (!hill || hill.type !== 'anthill') return false;
  const r = hill.radius + HILL_PAD, dx = u.x - hill.x, dy = u.y - hill.y;
  return dx * dx + dy * dy < r * r;
}

// Holonomic mover (OG tt, game.js:13856-13886). ga = accel grip, gb = brake/side grip.
export function holonomicMove(u, def, gx, gy, ga = 1, gb = ga) {
  const dt = DT, m = hypot(gx, gy);
  if (m > def.maxSpeed) { gx *= def.maxSpeed / m; gy *= def.maxSpeed / m; }
  let dx = gx - u.vx, dy = gy - u.vy;
  const dm = hypot(dx, dy), a = (u.stun > 0 ? Math.min(def.accel, STUN_ACCEL) : def.accel) * dt, sp = hypot(u.vx, u.vy);
  if (gb < ga && sp > 1) { // ice: limit along-velocity and sideways change separately
    const ux = u.vx / sp, uy = u.vy / sp;
    let al = dx * ux + dy * uy, sx = dx - al * ux, sy = dy - al * uy;
    al = al > 0 ? Math.min(al, a * ga) : Math.max(al, -a * gb);
    const sm = hypot(sx, sy); if (sm > a * gb) { sx *= (a * gb) / sm; sy *= (a * gb) / sm; }
    dx = al * ux + sx; dy = al * uy + sy;
  } else if (dm > a * ga) { dx *= (a * ga) / dm; dy *= (a * ga) / dm; }
  const vx = (u.vx += dx), vy = (u.vy += dy), face = u.face;
  if (face === face) u.heading = turnToward(u.heading, face, def.turnRate * dt);
  else if (u.goalX * u.goalX + u.goalY * u.goalY > FACE_GOAL * FACE_GOAL) u.heading = turnToward(u.heading, Math.atan2(u.goalY, u.goalX), def.turnRate * dt);
  else if (vx * vx + vy * vy > FACE_VEL * FACE_VEL) u.heading = turnToward(u.heading, Math.atan2(vy, vx), def.turnRate * dt);
}
// Vehicle mover (OG et, game.js:13888-13912): drives along its heading; ignores `face`.
export function vehicleMove(u, def, gx, gy, ga = 1, gb = ga) {
  const dt = DT, vx = u.vx, vy = u.vy, sp = hypot(vx, vy);
  let h = u.heading, target = 0;
  const gm = hypot(gx, gy);
  if (gm > 1) {
    const ang = Math.atan2(gy, gx), rate = def.turnRate / (1 + sp / def.turnSpeedFalloff);
    h = turnToward(h, ang, rate * dt);
    const c = Math.cos(angleDiff(h, ang));
    target = c > 0 ? Math.min(gm, def.maxSpeed) * c * c : 0;
  }
  const cx = Math.cos(h), cy = Math.sin(h);
  let fwd = vx * cx + vy * cy, side = vy * cx - vx * cy;
  const d = target - fwd;
  fwd += d > 0 ? Math.min(d, def.accel * ga * dt) : Math.max(d, -def.decel * gb * dt);
  const M = gb < ga ? gb / ga : 1;
  side *= Math.max(0, 1 - 8 * dt * M);
  u.vx = cx * fwd - cy * side; u.vy = cy * fwd + cx * side; u.heading = h;
}

export const FLOAT_Z = 36; // OURS step 6: px, how high a floating unit hangs (u.floating, STEP6.md)

// Fallback landing if CORE-B has no land(): z = 0, velocity ×0.35, stun ≥ 0.3 s, 8·speed/400 damage (OG game.js:9082-9127).
function land(world, u, impact) {
  if (pushMod && pushMod.land) return pushMod.land(world, u, impact);
  u.z = 0; u.vz = 0; u.vx *= LAND_DAMP; u.vy *= LAND_DAMP; u.stun = Math.max(u.stun, LAND_STUN);
  world.emit('land', { x: u.x, y: u.y, id: u.id, type: u.type, speed: impact });
  if (u.def.onLanded) u.def.onLanded(world, u, impact);
  if (damageMod && damageMod.damage) damageMod.damage(world, u, (8 * impact) / 400, null, 'thrown');
}

export function run(world) {
  const us = world.units, n = us.length, g = world.grid, gs = world.groups, dt = DT, time = world.time;
  const cols = g.cols, rows = g.rows, st = g.start, items = g.items, ix = g.itemX, iy = g.itemY, FC = FACTION_COUNT;
  const W = world.W, H = world.H, R2 = NEIGHBOUR_RADIUS * NEIGHBOUR_RADIUS;
  const oilBurning = world.oilBurning > 0 && oilMod && oilMod.awayFromFire;
  const mud7 = world.mud7 !== undefined && world.mud7.cells > 0 ? world.mud7 : null, lava7 = world.lava7 !== undefined && world.lava7.cells > 0 ? world.lava7 : null; // STEP7 TERRAIN-SIM: null while empty
  if (lava7 !== null) lava7.ensureNav(world);
  for (let i = 0; i < n; i++) {
    const u = us[i]; if (u.dead) continue;
    const def = u.def, fl = def.flock, x = u.x, y = u.y, r = u.radius, mass = u.mass, grp = u.group, fac = u.faction, ps = fl.personalSpace, uid = u.index; // OG i (unit-table index), not our id
    // 0. airborne / leaping / climbing: no steering (OG game.js:13617-13620)
    if (u.z > 0 || u.vz > 0 || u.leaping !== 0 || u.climb > 0) {
      u.pushX = u.pushY = 0;
      if (u.leaping === LEAP.FLY) holonomicMove(u, def, u.goalX, u.goalY, 1, 1);
      continue;
    }
    // 1. goal × speedMul × sick factor (OG game.js:13630-13632)
    const mul = (def.drilled ? 1 : u.speedMul) * (isSick(u, time) ? SICK_SLOW : 1);
    let vx = u.goalX * mul, vy = u.goalY * mul;
    const own = u.possessed === 1;   // OURS (possess): the player's unit goes where the stick says: no weave, flocking or formation
    // 2. advance weave (OG game.js:13633-13637)
    if (u.state === STATE.ADVANCE && !def.drilled && !own) {
      const a = WEAVE * Math.sin(time * (WEAVE_BASE + ((0.618034 * uid) % 1) * 0.5) + 2.39996 * uid), nx = vx - vy * a;
      vy += vx * a; vx = nx;
    }
    const holo = def.locomotion !== LOCO.VEHICLE, s0sq = holo ? vx * vx + vy * vy : 0;
    const pushy = s0sq > 1 && (u.state === STATE.ADVANCE || u.state === STATE.CHARGE), rawX = vx, rawY = vy, s0 = pushy ? Math.sqrt(s0sq) : 0;
    let sepX = 0, sepY = 0, alX = 0, alY = 0, coX = 0, coY = 0, gn = 0, puX = 0, puY = 0, blocked = 0, sideSum = 0, jamP = false, jamN = false;
    const underI = def.underfoot === true, lowI = def.lowLying === true ? 1 : def.prop ? 2 : 0, col = u.colony;
    // 3. neighbour scan over the 3×3 cells (OG game.js:13647-13705)
    const gx = g.cx(x), gy = g.cy(y), x0 = gx > 0 ? gx - 1 : 0, x1 = gx < cols - 1 ? gx + 1 : gx, y1 = gy < rows - 1 ? gy + 1 : gy;
    let seen = 0;
    scan: for (let cy = gy > 0 ? gy - 1 : 0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const base = (cy * cols + cx) * FC;
      for (let p = st[base], e = st[base + FC]; p < e; p++) {
        let ax = x - ix[p], ay = y - iy[p];
        const d2 = ax * ax + ay * ay;
        if (d2 > R2) continue;
        const c = us[items[p]];
        if (c === u) continue;
        if (++seen > NEIGHBOUR_CAP) break scan;
        if (c.dead || c.z > AIR_IGNORE || c.leaping !== 0 || c.climb > 0) continue;
        const cd = c.def;
        if (grp >= 0 && c.group === grp) { alX += c.vx; alY += c.vy; coX += c.x; coY += c.y; gn++; }
        if (c.faction !== fac && (underI ? c.radius > r * UNDERFOOT_RATIO : cd.underfoot === true && r > c.radius * UNDERFOOT_RATIO)) continue;
        const lowC = cd.lowLying === true ? 1 : cd.prop ? 2 : 0;
        if ((lowI === 1) !== (lowC === 1) && lowI !== 2 && lowC !== 2) continue;
        if (col !== 0 && c.colony === col && (u.type === 'anthill' || c.type === 'anthill' || nearOwnHill(world, u))) continue;
        const contact = r + c.radius, f = contact * ps;
        if (d2 >= f * f) continue;
        let dist = Math.sqrt(d2);
        if (dist > 1e-4) { ax /= dist; ay /= dist; }
        else { // coincident: fixed pseudo-random direction (OG game.js:13678-13682)
          const ci = c.index, lo = uid < ci ? uid : ci, hi = uid < ci ? ci : uid, ang = ((0.618034 * lo + 0.381966 * hi) % 1) * TAU, sg = uid < ci ? 1 : -1;
          ax = Math.cos(ang) * sg; ay = Math.sin(ang) * sg; dist = 0;
        }
        const w = 1 - dist / f;
        sepX += ax * w; sepY += ay * w;
        if (holo && dist < contact) { // blocking (OG game.js:13684-13695)
          const into = -(vx * ax + vy * ay);
          if (into > 0) {
            const away = -(c.vx * ax + c.vy * ay), rr = into - (away > 0 ? away : 0);
            if (rr > 0) {
              const k = dist <= BLOCK_FULL * contact ? 1 : (contact - dist) / ((1 - BLOCK_FULL) * contact);
              vx += ax * rr * k; vy += ay * rr * k;
              if (pushy && (c.faction === fac || lowC === 2)) { blocked += rr * k; sideSum += ((rawY * ax - rawX * ay) / s0) * rr * k; } // OURS (attack 3): || a prop (PROP_DETOUR below)
            }
          }
        }
        if (pushy && dist < contact && c.faction === fac) { // jam flags (OG game.js:13697-13700)
          const side = (rawY * ax - rawX * ay) / s0;
          if (side > JAM_SIDE) jamP = true; else if (side < -JAM_SIDE) jamN = true;
        }
        if (dist < contact) { const k = (contact - dist) * (c.mass / (mass + c.mass)); puX += ax * k; puY += ay * k; } // overlap push
      }
    }
    // 4. blocked twice: speed s·s0 → s²·s0 (OG game.js:13707-13710)
    if (s0sq > 1) { const s = Math.sqrt((vx * vx + vy * vy) / s0sq); if (s < 1) { vx *= s; vy *= s; } }
    // 5. detour around blocking friends (OG game.js:13711-13720). OURS (attack 3, 11-18): PROP_DETOUR. Trees and barrels
    // (props) count as blockers too: OG only slid round friends, so a unit walking at a gap between two trees narrower than
    // its body (the swamp willows; a giant needs 42 px) stood wedged in it, pushing, 6-11 s at a time; one tree in the
    // way it only got round by luck. Now it slides round the trunk the same way it slides round a friend.

    if (blocked > 0) {
      const mean = sideSum / blocked;
      let side = mean > DETOUR_SIDE ? -1 : mean < -DETOUR_SIDE ? 1 : u.detour !== 0 ? Math.sign(u.detour) : (uid & 1 ? 1 : -1);
      if (side > 0 ? jamP && !jamN : jamN && !jamP) side = -side;
      u.detour += (side - u.detour) * DETOUR_EASE;
      const sg = u.detour >= 0 ? 1 : -1, sq = Math.sqrt(s0sq), jam = (sg > 0 ? jamP : jamN) ? JAMMED : 1, k = (Math.min(blocked, sq) * DETOUR_PERP * jam) / sq;
      vx -= rawY * sg * k; vy += rawX * sg * k;
    }
    // 6. push into position next physics pass (OG game.js:13721)
    u.pushX = def.hopper ? 0 : puX * PUSH_SHARE; u.pushY = def.hopper ? 0 : puY * PUSH_SHARE;
    if (own) { sepX = sepY = 0; gn = 0; }
    // 7. separation (OG game.js:13722-13723)
    const sm = hypot(sepX, sepY); if (sm > SEP_CLAMP) { sepX *= SEP_CLAMP / sm; sepY *= SEP_CLAMP / sm; }
    vx += sepX * fl.separation; vy += sepY * fl.separation;
    // 8. alignment + cohesion with groupmates (OG game.js:13724-13733)
    const stt = u.state, k = fl.flockByState[stt], S = stt === STATE.IDLE && fl.idleSpread !== undefined ? fl.idleSpread : 1;
    if (k > 0 && gn > 0) {
      const inv = 1 / gn, a = (fl.alignment * k) / (S * S);
      vx += (alX * inv - vx) * a; vy += (alY * inv - vy) * a;
      const co = (fl.cohesion * k) / (S * S);
      vx += (coX * inv - x) * co; vy += (coY * inv - y) * co;
    }
    if (grp >= 0 && u.pathing === 0 && !own) {
      // 9. formation pull, capped at walkSpeed (OG game.js:13734-13747)
      const fw = gs.charging[grp] === 1 ? 0 : fl.formation * fl.formationByState[stt];
      if (fw > 0) {
        let fx, fy;
        if (gs.drilled[grp] === 1) { const c = Math.cos(gs.front[grp]), s = Math.sin(gs.front[grp]); fx = (gs.cx[grp] + c * u.slotX - s * u.slotY - x) * fw; fy = (gs.cy[grp] + s * u.slotX + c * u.slotY - y) * fw; }
        else { fx = (u.homeX + gs.offX[grp] - x) * fw; fy = (u.homeY + gs.offY[grp] - y) * fw; }
        const fm = hypot(fx, fy); if (fm > def.walkSpeed) { fx *= def.walkSpeed / fm; fy *= def.walkSpeed / fm; }
        vx += fx; vy += fy;
      }
      // 10. herd toward the group centroid beyond herdSpacing·√size·S (OG game.js:13748-13759)
      const hw = fl.herd * k;
      if (hw > 0) {
        const hx = gs.cx[grp] - x, hy = gs.cy[grp] - y, hd = hypot(hx, hy), lim = fl.herdSpacing * Math.sqrt(gs.size[grp]) * S;
        if (hd > lim) { const c = Math.min((hd - lim) * hw, 2 * def.walkSpeed) / hd; vx += hx * c; vy += hy * c; }
      }
    }
    // 11. field edge band (OG game.js:13761-13762)
    if (x < EDGE) vx += (EDGE - x) * EDGE_PUSH; else if (x > W - EDGE) vx -= (x - (W - EDGE)) * EDGE_PUSH;
    if (y < EDGE) vy += (EDGE - y) * EDGE_PUSH; else if (y > H - EDGE) vy -= (y - (H - EDGE)) * EDGE_PUSH;
    // 12. prone / hopper stop; tree cover = raw goal only (OG game.js:13763-13765)
    if (u.prone > 0 || def.hopper) { vx = vy = 0; }
    else if (u.cover >= 0) { vx = u.goalX * mul; vy = u.goalY * mul; }
    // 13. fire escape from burning oil within 34 px (OG game.js:13766-13783)
    if (oilBurning && !own && !def.hopper && u.prone === 0 && isAnimalPlus(def) && stt !== STATE.FLEE && u.blind === 0 && oilMod.awayFromFire(world, x, y, FIRE_R, fireTmp)) {
      const jm = hypot(fireTmp[0], fireTmp[1]);
      if (jm > 0) {
        const ex = fireTmp[0] / jm, ey = fireTmp[1] / jm, toward = -(vx * ex + vy * ey);
        if (toward > 0) { vx += ex * toward; vy += ey * toward; }
        const c = Math.min(1, jm * FIRE_GAIN) * def.runSpeed; vx += ex * c; vy += ey * c;
      }
    }
    // 14. grip: oil, then ice (OG game.js:13784-13790)
    let ga = oilGrip(world, x, y, def), gb = ga;
    if (onIce(world, x, y, def)) { const ig = def.iceGrip ?? ICE_GRIP; gb = ga * ig; ga *= Math.max(ig, ICE_ACCEL_MIN); }
    // 15. wading (OG game.js:13791-13794)
    if (world.waterCells > 0) { const wf = wadeFactor(world, u, def); vx *= wf; vy *= wf; }
    // STEP7 TERRAIN-SIM: mud pace (terrain/mud.js), lava as a soft wall for units that keep off it (terrain/lava.js)
    if (mud7 !== null) { const mf = mud7.pace(world, u, def); vx *= mf; vy *= mf; }
    if (lava7 !== null && lava7.avoids(u) && lava7.steer(world, u, vx, vy, lavaTmp)) { vx = lavaTmp[0]; vy = lavaTmp[1]; }
    // 16. mover
    if (def.locomotion === LOCO.VEHICLE) vehicleMove(u, def, vx, vy, ga, gb); else holonomicMove(u, def, vx, vy, ga, gb);
  }

  // Physics pass (OG game.js:13797-13832).
  const walls = world.walls, hasWalls = walls.count > 0, mines = world.mines, hasMines = mines.count > 0, hasWater = world.waterCells > 0, holding = world.holding, half = W / 2;
  for (let i = 0; i < n; i++) {
    const u = us[i]; if (u.dead) continue;
    const grounded = u.z <= 0 && u.vz <= 0;
    // OURS step 6 (STEP6.md "Status"): a web holds a grounded unit's own steps (pushes still move it); a float lifts the unit
    // to FLOAT_Z, it bobs and drifts, can't act (stun), and falls with normal gravity when it ends. OG units never get either.
    if (u.webbed > world.time && grounded) { u.vx = 0; u.vy = 0; }
    if (u.floating > world.time) {
      u.stun = Math.max(u.stun, 0.05); u.vz = 0; u.vx *= 0.9; u.vy *= 0.9;
      u.z += (FLOAT_Z + 3 * Math.sin(world.time * 4 + u.id) - u.z) * Math.min(1, 4 * dt);
    } else if ((u.z > 0 || u.vz > 0) && u.leaping !== LEAP.FLY) { // gravity + landing
      u.vz -= GRAVITY * dt; u.z += u.vz * dt;
      if (u.z <= 0) land(world, u, -u.vz);
    }
    const r = u.radius;
    let nx = u.x + u.vx * dt + u.pushX, ny = u.y + u.vy * dt + u.pushY;
    if (nx < r) { nx = r; if (u.vx < 0) u.vx = 0; } else if (nx > W - r) { nx = W - r; if (u.vx > 0) u.vx = 0; }
    if (ny < r) { ny = r; if (u.vy < 0) u.vy = 0; } else if (ny > H - r) { ny = H - r; if (u.vy > 0) u.vy = 0; }
    if (holding && u.faction === F.TeamLeft && nx > half - r) { nx = half - r; if (u.vx > 0) u.vx = 0; }          // OG game.js:13815-13819
    else if (holding && u.faction === F.TeamRight && nx < half + r) { nx = half + r; if (u.vx < 0) u.vx = 0; }
    // aquatic units can't leave the water: wet (>= 0.05) to dry is blocked. OG h.d here is 467.d = 0.05, not 0.75 (game.js:13819-13828)
    if (hasWater && grounded && u.def.aquatic && world.depthUnder(u.x, u.y) >= WET && world.depthUnder(nx, ny) < WET) {
      if (world.depthUnder(nx, u.y) >= WET) { ny = u.y; u.vy = 0; }
      else if (world.depthUnder(u.x, ny) >= WET) { nx = u.x; u.vx = 0; }
      else { nx = u.x; ny = u.y; u.vx = 0; u.vy = 0; }
    }
    u.x = nx; u.y = ny;
    if (hasWalls && u.leaping !== LEAP.VAULT && u.leaping !== LEAP.FLY) walls.collide(u);
    if (hasMines && u.def.mineAware && u.z <= 0 && u.leaping === 0 && avoidsMines(world, u)) mines.collide(u);
  }
}
export { MINE_AVOID };
