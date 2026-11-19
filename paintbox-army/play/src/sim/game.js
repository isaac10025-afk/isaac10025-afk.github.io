// createGame(): the API the UI drives. Painting (one stroke = one group), erase, clear, pause/step, team mode, START,
// loop helper, counts, events, report. OG core-move §1-2 (painter game.js:7026-7141, brush game.js:7553-7722,
// controls game.js:8225-8266, loop game.js:6962-6999).
import { World } from './world.js';
import { step, SYSTEMS } from './tick.js';
import { getDef } from './defs.js';
import { DT, BRUSH_RADIUS, BRUSH_MIN, BRUSH_MAX, TAU, clamp, hypot } from './const.js';
import { ENEMY, ALL_MASK, F, teamable, teamFaction, maskBit } from './factions.js';
import * as POS from './systems/possess.js';
import './units/index.js';

function missing(e) { return /ERR_MODULE_NOT_FOUND|Cannot find module|Failed to fetch|error loading dynamically imported module|404|Importing a module script failed/i.test(String((e && (e.code + ' ' + e.message)) || e)); }
async function opt(p) { try { return await import(p); } catch (e) { if (!missing(e)) console.error('[game] failed to load', p, e); return null; } }
// TERRAIN brush API (terrain/index.js: beginTerrainStroke, paintTerrain, beginErase, eraseTerrain, clearTerrain) and the
// battle record (report.js: BattleRecord). Both optional: without them terrain tools paint nothing and report() is null.
const [terrainM, reportM, mapsM] = await Promise.all([opt('./terrain/index.js'), opt('./report.js'), opt('./maps/index.js')]);

const HEX = Math.sqrt(3) / 2; // unit area = spacing² · √3/2 (OG game.js:7025)
const BATCH_SYNC = 64;        // re-sync the grid every 64 placed units (OG game.js:7085)
const pendingTmp = [];

// One stroke of one unit type (OG painter J, game.js:7026-7141).
class Painter {
  constructor(world, type, group, heading) {
    this.world = world; this.type = type; this.group = group; this.heading = heading; this.other = -1;
    this.def = getDef(type); this.spacing = this.def.brushSpacing; this.unitArea = this.spacing * this.spacing * HEX;
    this.carry = 0; this.started = false; this.pending = pendingTmp; this.pending.length = 0; this.dirX = 0; this.dirY = 0; this.unturned = [];
  }
  paint(x0, y0, x1, y1, brushR) {
    const w = this.world, def = this.def, rng = w.rng;
    if (def.boss) { if (this.started) return 0; this.started = true; return this.placeBoss(x1, y1); }
    const face = this.strokeFacing(x1 - x0, y1 - y0);
    const d = Math.max(brushR, 0.5 * this.spacing);                                   // OG game.js:7048
    const area = this.started ? 2 * d * hypot(x1 - x0, y1 - y0) : Math.PI * d * d;    // OG game.js:7049
    this.started = true; this.carry += area / this.unitArea;
    const m = Math.floor(this.carry); if (m === 0) return 0;
    this.carry -= m; w.syncGrid(); this.pending.length = 0;
    const r = def.radius, clear = 1.5 * this.spacing, propMin = def.prop ? (1 * this.spacing) ** 2 : -1;
    let placed = 0;
    for (let k = 0; k < m; k++) {
      const f = (k + rng()) / m, ax = x0 + (x1 - x0) * f, ay = y0 + (y1 - y0) * f;   // anchor (OG game.js:7060-7062)
      let bx = ax, by = ay, best = -1;
      for (let t = 0; t < 6; t++) {                                                    // 6 tries (OG game.js:7066-7076)
        const a = rng() * Math.PI * 2, rr = d * Math.sqrt(rng());
        const px = clamp(ax + Math.cos(a) * rr, r, w.W - r), py = clamp(ay + Math.sin(a) * rr, r, w.H - r);
        let s = w.walls.isSolidAt(px, py) ? -0.5 : this.clearance(px, py, clear, ALL_MASK);
        if (s >= 0 && propMin > 0 && this.clearance(px, py, clear, maskBit(def.faction)) < propMin) s = -0.5;
        if (s >= 0 && def.placeOk && !def.placeOk(w, px, py)) s = -0.5;                  // OURS (step 4): e.g. ship = water only
        if (s > best) { best = s; bx = px; by = py; if (s >= clear * clear) break; }
      }
      if (best < 0) continue;                                                           // OG game.js:7078
      if (w.paintCap === 0) break;                                                      // STEP9 LEAD: campaign box count reached
      const h = (face !== null ? face : this.heading) + 0.3 * (rng() - rng());               // OG game.js:7079
      const team = w.teamMode ? w.teamAt(bx) : -1;
      const cost = budgetCost(w, this.type, team);                                      // STEP9 LEAD: campaign budget
      if (cost < 0) { if (cost === OUT) break; continue; }
      const id0 = w.nextId;
      const u = w.spawn(this.type, bx, by, { group: this.groupAt(bx), heading: h, team });
      if (!u) break;                                                                    // cap reached (OG game.js:7081)
      if (w.budget) budgetPaid(w, u, cost, id0);
      if (w.paintCap > 0) w.paintCap--;
      placed++;
      if (def.faceStroke) { if (face === null) this.unturned.push(u); else def.faceStroke(w, u); }
      this.pending.push(u);
      if (this.pending.length >= BATCH_SYNC) { w.syncGrid(); this.pending.length = 0; }
    }
    return placed;
  }
  // faceStroke types face along the drag once it has moved ≥ 6 px (OG game.js:7089-7103).
  strokeFacing(dx, dy) {
    const def = this.def; if (!def.faceStroke) return null;
    this.dirX += dx; this.dirY += dy;
    const m = hypot(this.dirX, this.dirY);
    if (m > 24) { this.dirX *= 24 / m; this.dirY *= 24 / m; }
    if (m < 6) return null;
    const a = Math.atan2(this.dirY, this.dirX), w = this.world;
    for (const u of this.unturned) if (!u.dead) { u.heading = u.pheading = u.wander = a + 0.3 * (w.rng() - w.rng()); def.faceStroke(w, u); }
    this.unturned.length = 0;
    return a;
  }
  placeBoss(x, y) { // one per field (OG game.js:7105-7119)
    const w = this.world;
    for (const u of w.units) if (!u.dead && u.type === this.type) return 0;
    const r = this.def.radius, px = clamp(x, r, w.W - r), py = clamp(y, r, w.H - r);
    if (w.walls.isSolidAt(px, py)) return 0;
    if (this.def.placeOk && !this.def.placeOk(w, px, py)) return 0;                 // OURS (step 4)
    const team = w.teamMode ? w.teamAt(px) : -1, cost = budgetCost(w, this.type, team);   // STEP9 LEAD: campaign budget
    if (cost < 0 || w.paintCap === 0) return 0;
    const id0 = w.nextId;
    const u = w.spawn(this.type, px, py, { group: this.groupAt(px), heading: this.heading, team });
    if (u && w.budget) budgetPaid(w, u, cost, id0);
    if (u && w.paintCap > 0) w.paintCap--;
    return u ? 1 : 0;
  }
  // Team mode: crossing the midline opens a second group for the other team (OG game.js:7120-7127).
  groupAt(x) {
    const w = this.world;
    if (!w.teamMode || this.group < 0 || !teamable(this.def)) return this.group;
    const fac = teamFaction(w.teamAt(x));
    if (w.groups.faction[this.group] === fac) return this.group;
    if (this.other < 0) this.other = w.createGroup(this.type, w.teamAt(x));
    return this.other;
  }
  groups() { return this.other >= 0 ? [this.group, this.other] : [this.group]; }
  // Squared distance to the nearest unit (any faction by default) within `range`, counting this batch (OG game.js:7131-7141).
  clearance(x, y, range, mask) {
    const w = this.world; let best = range * range;
    const n = w.findNearest(x, y, range, mask, null, 0);
    if (n) best = Math.min(best, (n.x - x) ** 2 + (n.y - y) ** 2);
    for (const p of this.pending) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < best) best = d; }
    return best;
  }
}

// ---- STEP9 LEAD (campaign, STEP9.md): the paint budget. world.budget = null in the sandbox (nothing below runs).
// { team, total, spent, price(type), paid: Map(id -> price), kids: Map(id -> [ids]), locked, out }
// Only `team`'s half can be painted, only before START (locked), and a stroke stops at the first unit it can't pay for.
const OUT = -2, SKIP = -1;
function budgetCost(w, type, team) {
  const B = w.budget; if (!B) return 0;
  if (B.locked || team !== B.team) return SKIP;
  const c = B.price(type);
  if (!(c >= 0)) return SKIP;                       // no price = not for sale here
  if (B.spent + c > B.total + 1e-9) { if (!B.out) { B.out = true; w.emit('budgetOut', { team, type }); } return OUT; }
  return c;
}
// Units a painted unit spawns while it is placed (a cannon's crew, a cavalry rider) are its kids: erased with it.
function budgetPaid(w, u, cost, id0) {
  const B = w.budget;
  B.spent += cost; B.paid.set(u.id, cost);
  if (w.nextId > id0 + 1) { const k = []; for (let id = id0; id < w.nextId; id++) if (id !== u.id) k.push(id); B.kids.set(u.id, k); }
}

// Stroke heading: team side, else toward the centroid of this type's enemies, else random for Wild, else up (OG game.js:7717-7722).
function strokeHeading(w, type, x, y) {
  const def = getDef(type);
  if (w.teamMode && teamable(def)) return w.teamAt(x) === 0 ? 0 : Math.PI;
  const c = w.centroid(ENEMY[w.factionOf(def, -1)]);   // side split 11-17: a new-tab type's own side slot, not F.Side
  return c ? Math.atan2(c.y - y, c.x - x) : def.faction === F.Wild ? w.rng() * TAU : -Math.PI / 2;
}

export function createGame({ W = 800, H = 600, seed = 1, march = false } = {}) {
  const world = new World({ W, H, seed });
  world.march = march ? 1 : 0; world.lastPaintAt = -1e9;          // OURS (PLAN H, systems/march.js): the game page turns it on
  let tool = { kind: 'unit', type: 'rifle' }, paused = false, painter = null, mode = null, lastX = 0, lastY = 0, acc = 0;
  let brushRadius = BRUSH_RADIUS;
  let mapId = null, mapSecret = true;   // OURS (step 7, STEP7.md): the loaded map; Clear rebuilds it

  const record = reportM && reportM.BattleRecord ? new reportM.BattleRecord() : null;
  let lastResult = '';   // STEP9 LEAD: the watch's last answer (campaign outcome reads it without watching twice)
  function watch() { lastResult = record ? record.watch(world) : ''; return lastResult; } // end-of-battle watch (OG watchRound game.js:8271-8289)
  function eraseCircle(x, y, r) { // remove every unit within r; they leave their group (OG game.js:5617-5627)
    world.syncGrid();
    const hit = [], B = world.budget;
    world.query(x, y, r, (u) => { if (!B || canErase(B, u)) hit.push(u); });
    if (B) for (let i = 0, n = hit.length; i < n; i++) { const k = B.kids.get(hit[i].id); if (k) for (const id of k) { const c = world.unitById(id); if (c && !c.dead && !hit.includes(c)) hit.push(c); } }
    for (const u of hit) {
      if (u.dead) continue;
      if (B && B.paid.has(u.id)) { B.spent = Math.max(0, B.spent - B.paid.get(u.id)); B.paid.delete(u.id); B.kids.delete(u.id); B.out = false; }   // STEP9 LEAD: refund
      if (u.group >= 0) world.groups.leave(u.group); world.remove(u);
    }
    return hit.length;
  }
  // STEP9 LEAD: in a campaign battle the eraser only takes the player's own units, and only before START
  function canErase(B, u) { return !B.locked && !u.dead && u.team === B.team; }
  // Erase along a drag: terrain under the brush, then units every max(2, r/2) px (OG game.js:7708-7716).
  function eraseSegment(x0, y0, x1, y1, first = false) {
    const r = brushRadius;
    if (terrainM && !world.budget) { // STEP9 LEAD: !world.budget = a campaign battle's terrain is the level's, never erased
      if (first && terrainM.beginErase) terrainM.beginErase(world, x0, y0, r); else if (terrainM.eraseTerrain) terrainM.eraseTerrain(world, x0, y0, x1, y1, r); }
    const steps = Math.max(1, Math.ceil(hypot(x1 - x0, y1 - y0) / Math.max(2, 0.5 * r)));
    let n = 0;
    for (let c = 1; c <= steps; c++) n += eraseCircle(x0 + ((x1 - x0) * c) / steps, y0 + ((y1 - y0) * c) / steps, r);
    return n;
  }
  // Terrain tools; terrain/index.js applies the wall ×0.75 brush (OG game.js:7552) and the water stroke id.
  function terrainPaint(kind, x0, y0, x1, y1, first = false) {
    if (!terrainM || world.budget) return 0;   // STEP9 LEAD: no terrain painting in a campaign battle
    if (first && terrainM.beginTerrainStroke) return terrainM.beginTerrainStroke(world, kind, x0, y0, brushRadius);
    return terrainM.paintTerrain ? terrainM.paintTerrain(world, kind, x0, y0, x1, y1, brushRadius) : 0;
  }
  function endStroke() {
    if (painter) { for (const g of painter.groups()) world.releaseGroup(g); painter = null; } // OG game.js:7695-7699
    mode = null;
  }

  const game = {
    world,
    get paused() { return paused; },
    get teamMode() { return world.teamMode; },
    get holding() { return world.holding; },
    get brushRadius() { return brushRadius; },
    get tool() { return tool; },
    setTool(t) { endStroke(); tool = t; },
    // Mouse wheel only in OG: radius × e^(−0.0015·deltaY), clamped 4..160 (OG game.js:7590).
    wheel(deltaY) { brushRadius = clamp(brushRadius * Math.exp(0.0015 * -deltaY), BRUSH_MIN, BRUSH_MAX); return brushRadius; },
    setBrushRadius(r) { brushRadius = clamp(r, BRUSH_MIN, BRUSH_MAX); },
    paintBegin(x, y) {
      endStroke(); lastX = x; lastY = y; world.lastPaintAt = world.time;   // OURS: a stroke resets the march clock (PLAN H)
      if (world.budget) world.budget.out = false;   // STEP9 LEAD: 'budgetOut' once per stroke (UI ask)
      if (tool.kind === 'erase') { mode = 'erase'; return eraseSegment(x, y, x, y, true); }
      if (tool.kind !== 'unit') { mode = tool.kind; return terrainPaint(tool.kind, x, y, x, y, true); }
      const def = getDef(tool.type); if (!def) return 0;
      const g = world.createGroup(tool.type, world.teamMode ? world.teamAt(x) : -1); // OG game.js:7659
      if (g < 0) return 0;
      mode = 'unit'; painter = new Painter(world, tool.type, g, strokeHeading(world, tool.type, x, y));
      const n = painter.paint(x, y, x, y, brushRadius);
      if (n > 0) world.emit('paint', { x, y, type: tool.type, n });
      return n;
    },
    paintMove(x, y) {
      let n = 0; world.lastPaintAt = world.time;
      if (mode === 'unit' && painter) { n = painter.paint(lastX, lastY, x, y, brushRadius); if (n > 0) world.emit('paint', { x, y, type: painter.type, n }); }
      else if (mode === 'erase') n = eraseSegment(lastX, lastY, x, y);
      else if (mode) n = terrainPaint(mode, lastX, lastY, x, y);
      else return 0;
      lastX = x; lastY = y; return n;
    },
    paintEnd() { endStroke(); },
    // Right-drag erase as its own calls (the UI can also use setTool({kind:'erase'})).
    eraseBegin(x, y) { endStroke(); mode = 'erase'; lastX = x; lastY = y; return eraseSegment(x, y, x, y, true); },
    eraseMove(x, y) { if (mode !== 'erase') return 0; const n = eraseSegment(lastX, lastY, x, y); lastX = x; lastY = y; return n; },
    erase(x0, y0, x1, y1) { return eraseSegment(x0, y0, x1 ?? x0, y1 ?? y0); },
    // Clear: wipe everything; in team mode go back to holding (OG game.js:8262-8264, 5714-5749).
    clear() {
      endStroke(); world.clearAll(); // also runs every onWorldClear hook (world.js)
      if (terrainM && terrainM.clearTerrain) terrainM.clearTerrain(world);
      for (const [, m] of SYSTEMS) if (typeof m.clear === 'function') m.clear(world); // a system module's own clear(world)
      world.map = null;
      if (mapId && mapsM) mapsM.buildMap(world, mapId, { secret: mapSecret });   // OURS (step 7): Clear = the fresh map again
      if (world.teamMode) world.holding = true;
      const B = world.budget; if (B) { B.spent = 0; B.paid.clear(); B.kids.clear(); B.locked = false; B.out = false; B.startTime = -1; }   // STEP9 LEAD
    },
    // ---- share codes (OURS, Part 2 step 10, sim/share.js): one unit at an exact place, as the brush would place it ----
    /** opts { heading, team (Team battle: 0 | 1, default the half it is on), group (-1 none) }. Same rules as a brush
     *  dab: a boss once per field, def.placeOk (water-only units), a campaign budget (your half, before START, paid).
     *  Returns the unit or null. */
    place(type, x, y, opts = {}) {
      const def = getDef(type); if (!def) return null;
      const w = world, px = clamp(x, def.radius, w.W - def.radius), py = clamp(y, def.radius, w.H - def.radius);
      if (def.boss) for (const u of w.units) if (!u.dead && u.type === type) return null;
      if (def.placeOk && !def.placeOk(w, px, py)) return null;
      const team = !w.teamMode ? -1 : w.budget ? w.teamAt(px) : opts.team === 0 || opts.team === 1 ? opts.team : w.teamAt(px);
      const cost = budgetCost(w, type, team); if (cost < 0) return null;
      const id0 = w.nextId;
      const u = w.spawn(type, px, py, { group: opts.group ?? -1, heading: opts.heading || 0, team });
      if (u && w.budget) budgetPaid(w, u, cost, id0);
      if (u && def.faceStroke) def.faceStroke(w, u);
      return u;
    },
    // ---- campaign paint budget (OURS, Part 2 step 9, STEP9.md; sim/campaign/index.js drives it) ----
    /** spec { team, total, price(type) -> paint (no number = can't be painted) } or null (sandbox). Spent starts at 0. */
    setBudget(spec) {
      endStroke();
      world.budget = spec ? { team: spec.team, total: spec.total, spent: 0, price: spec.price, paid: new Map(), kids: new Map(), locked: false, out: false, startTime: -1 } : null;
      world.emit('budget', { on: !!spec });
    },
    /** null in the sandbox, else { team, total, spent, left, locked, startTime } (a copy). */
    get budget() { const B = world.budget; return B ? { team: B.team, total: B.total, spent: B.spent, left: B.total - B.spent, locked: B.locked, startTime: B.startTime } : null; },
    // ---- maps (OURS, Part 2 step 7, STEP7.md: sim/maps/index.js) ----
    get mapId() { return mapId; },
    get map() { return world.map || null; },
    /** Load map `id` ('blank' or null = the empty field): clears the field, then paints the map. opts.secret false = leave
     *  the secret unit out (the player found it before). Team mode goes back to holding, as Clear does. */
    loadMap(id, opts = {}) {
      mapId = id && id !== 'blank' && mapsM && mapsM.getMap(id) ? id : null;
      mapSecret = opts.secret !== false;
      game.clear();
      world.emit('map', { id: mapId || 'blank' });
      return world.map || null;
    },
    /** The secret hiding spot under world (x, y) with a finger of radius r, or null. */
    secretAt(x, y, r = 0) { return mapsM ? mapsM.secretAt(world, x, y, r) : null; },
    /** Take the secret off the map (the UI unlocks it). Emits 'secret' {type, x, y}. Returns the type or null. */
    findSecret() {
      const s = world.map && world.map.secret;
      if (!s) return null;
      world.map.secret = null; mapSecret = false; world.mapVersion = (world.mapVersion || 0) + 1;
      world.emit('secret', { type: s.type, x: s.x, y: s.y });
      return s.type;
    },
    setPaused(b) { paused = !!b; world.emit('paused', { paused }); },
    stepOnce() { if (paused) { step(world); watch(); } },                      // single step only while paused (OG game.js:8235-8237)
    // Team switch: kill list on; holding = on (OG game.js:8248-8250). OG clears the field when it goes on; ours never
    // wipes it (user 11-17): on, every unit joins the team of its half and waits for START; off, every unit goes back
    // to its own side (world.reside).
    setTeamMode(b) {
      b = !!b; const was = world.teamMode; world.teamMode = b;
      if (b !== was) world.reside();
      world.kills.enabled = b; world.holding = b;
      world.emit('holding', { holding: b });
    },
    // START: leave holding, start the battle record, unpause (OG game.js:8258-8260).
    start() {
      if (!world.holding) return;
      world.holding = false; world.emit('holding', { holding: false });
      if (world.budget) { endStroke(); world.budget.locked = true; world.budget.startTime = world.time; }   // STEP9 LEAD: the army is set
      if (record) record.begin(world);
      paused = false;
    },
    tick() { if (!paused) { step(world); watch(); } },
    // End-of-battle watch: '' | 'left' | 'right' | 'draw' (tick() and advance() already run it).
    watchRound: watch,
    get lastResult() { return lastResult; },   // STEP9 LEAD: what the last tick's watch said
    // Fixed-step loop helper: real dt clipped to 0.25 s, ≤ 4 ticks per frame, leftover clipped to 0.25 s.
    // Returns the draw alpha (1 when paused) (OG game.js:6962-6986).
    advance(realDt) {
      if (paused) { acc = 0; return 1; }
      acc += Math.min(realDt, 0.25);
      let n = 0;
      while (acc >= DT && n < 4) { step(world); acc -= DT; n++; }
      acc = Math.min(acc, 0.25);
      watch();
      return Math.min(1, acc / DT);
    },
    // Live units per type (OG countByType counts every allocated unit, game.js:5697-5704).
    counts() { const c = {}; for (const u of world.units) if (!u.dead) c[u.type] = (c[u.type] || 0) + 1; return c; },
    drainEvents() { return world.drainEvents(); },
    // Possess (Part 2 step 3, OURS): take a unit over, drive it, leave. systems/possess.js, contract sim/POSSESS.md.
    get possessed() { return POS.possessed(world); },
    canPossess: POS.canPossess,
    /** The unit a long press at world (x, y) would take over: the nearest non-prop unit whose body is within r. */
    unitAt(x, y, r = 0) {
      world.syncGrid();
      let best = null, bd = Infinity;
      const B = world.budget;
      world.query(x, y, r + 46, (u) => {
        if (!POS.canPossess(u)) return;
        if (B && u.team !== B.team) return;   // STEP9 LEAD: a campaign battle: only your own units
        const d = hypot(u.x - x, u.y - (y + (u.z || 0) * 0.5)) - u.radius;   // a unit in the air is drawn higher
        if (d <= r && d < bd) { bd = d; best = u; }
      });
      return best;
    },
    possess(u) { endStroke(); return POS.possess(world, u); },
    release() { POS.release(world, 'leave'); },
    setPossessInput(inp) { POS.setInput(world, inp); },
    // Battle report (team mode): BattleRecord.summary (OG game.js:8265-8267), or null without report.js.
    report() { return record ? record.summary(world) : null; },
  };
  return game;
}
