// MOCK game with the createGame() API (ARCH.md). Owner: UI. Used only until CORE-A's game has units.
// Painting follows OG's painter (core-move.md §2) so the UI feels right; the fighting is fake (walk at the
// nearest enemy, lose hp on contact, a few shots) and exists only so the result screen and report can be tested.
import { fallbackDef, FAC } from './tools.js';

const DT = 1 / 60;
const HEX = Math.sqrt(3) / 2;
const RANGED = { rifle: 330, sniper: 500, archer: 400, grenadier: 330, mage: 340, ninja: 0 };
const KIND = { rifle: 'bullet', sniper: 'bullet', archer: 'arrow', grenadier: 'grenade', mage: 'plasma' };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createMockGame({ W = 800, H = 600, seed = 1 } = {}) {
  const R = rng(seed);
  const tri = () => R() - R();
  let tool = { kind: 'unit', type: 'rifle' }, paused = false, teamMode = false;
  let painter = null, lastX = 0, lastY = 0, nextId = 1, events = [];
  let record = null;
  const world = { W, H, tick: 0, time: 0, units: [], projectiles: [], corpses: [], mines: [], peels: [], teamMode: false, holding: false, wallTile: 8 };
  function grids() { world.wallW = Math.ceil(world.W / 8); world.wallH = Math.ceil(world.H / 8); const n = world.wallW * world.wallH; world.walls = new Uint8Array(n); world.water = new Float32Array(n); world.ice = new Uint8Array(n); }
  grids();
  const tileAt = (x, y) => { const tx = Math.floor(x / 8), ty = Math.floor(y / 8); return tx < 0 || ty < 0 || tx >= world.wallW || ty >= world.wallH ? -1 : ty * world.wallW + tx; };
  const wallAt = (x, y) => { const i = tileAt(x, y); return i < 0 ? 1 : world.walls[i]; };
  const hostile = (a, b) => a.faction !== b.faction && a.faction !== FAC.PROPS && b.faction !== FAC.PROPS && a.faction !== FAC.STRAYS && b.faction !== FAC.STRAYS;

  function spawn(type, x, y, heading) {
    const d = fallbackDef(type); if (!d) return null;
    const team = teamMode && !d.prop && d.faction !== FAC.PROPS && d.faction !== FAC.STRAYS ? (x < world.W / 2 ? 0 : 1) : -1;
    const u = { id: nextId++, type, def: d, team, faction: team >= 0 ? 20 + team : d.faction, x, y, z: 0, px: x, py: y, pz: 0, vx: 0, vy: 0,
      heading, pheading: heading, radius: d.radius * (1 + tri() * 0.08), hp: 100, maxHp: 100, dead: false, target: -1, cool: R(), kills: 0, burning: 0 };
    world.units.push(u);
    return u;
  }
  function headingFor(type, x, y) {
    const d = fallbackDef(type);
    if (teamMode && !d.prop) return x < world.W / 2 ? 0 : Math.PI;
    let sx = 0, sy = 0, n = 0;
    for (const v of world.units) if (!v.dead && hostile({ faction: d.faction }, v)) { sx += v.x; sy += v.y; n++; }
    return n ? Math.atan2(sy / n - y, sx / n - x) : (d.faction === 1 ? R() * Math.PI * 2 : -Math.PI / 2);
  }
  // OG painter (core-move.md §2): area / (spacing² · √3/2) units, best of 6 tries.
  function paintUnits(x0, y0, x1, y1, r) {
    const d0 = fallbackDef(painter.type); if (!d0) return 0;
    const sp = d0.brushSpacing, area1 = sp * sp * HEX, d = Math.max(r, 0.5 * sp);
    const seg = Math.hypot(x1 - x0, y1 - y0);
    painter.carry += (painter.started ? 2 * d * seg : Math.PI * d * d) / area1; painter.started = true;
    const m = Math.floor(painter.carry); if (!m) return 0; painter.carry -= m;
    const reach = 1.5 * sp; let placed = 0;
    for (let k = 0; k < m; k++) {
      const f = (k + R()) / m, ax = x0 + (x1 - x0) * f, ay = y0 + (y1 - y0) * f;
      let bx = ax, by = ay, best = -1;
      for (let t = 0; t < 6; t++) {
        const a = R() * Math.PI * 2, rr = d * Math.sqrt(R());
        const x = Math.min(Math.max(ax + Math.cos(a) * rr, d0.radius), world.W - d0.radius), y = Math.min(Math.max(ay + Math.sin(a) * rr, d0.radius), world.H - d0.radius);
        let sc = reach * reach;
        if (wallAt(x, y)) sc = -0.5;
        else for (const v of world.units) { if (v.dead) continue; const q = (v.x - x) ** 2 + (v.y - y) ** 2; if (q < sc) sc = q; if (d0.prop && v.def.prop && q < sp * sp) { sc = -0.5; break; } }
        if (sc > best) { best = sc; bx = x; by = y; if (sc >= reach * reach) break; }
      }
      if (best < 0) continue;
      spawn(painter.type, bx, by, painter.heading + 0.3 * tri()); placed++;
    }
    return placed;
  }
  function paintGrid(arr, x0, y0, x1, y1, r, val) {
    const rr = Math.max(r, 4), minx = Math.max(0, Math.floor((Math.min(x0, x1) - rr) / 8)), maxx = Math.min(world.wallW - 1, Math.floor((Math.max(x0, x1) + rr) / 8));
    const miny = Math.max(0, Math.floor((Math.min(y0, y1) - rr) / 8)), maxy = Math.min(world.wallH - 1, Math.floor((Math.max(y0, y1) + rr) / 8));
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
    for (let ty = miny; ty <= maxy; ty++) for (let tx = minx; tx <= maxx; tx++) {
      const cx = tx * 8 + 4, cy = ty * 8 + 4; let t = L ? ((cx - x0) * dx + (cy - y0) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      if ((cx - x0 - dx * t) ** 2 + (cy - y0 - dy * t) ** 2 <= rr * rr) arr[ty * world.wallW + tx] = val;
    }
  }
  function paintSeg(x0, y0, x1, y1, r) {
    switch (tool.kind) {
      case 'unit': return paintUnits(x0, y0, x1, y1, r);
      case 'wall': paintGrid(world.walls, x0, y0, x1, y1, r * 0.75, 1); return 0;
      case 'water': paintGrid(world.water, x0, y0, x1, y1, r, 1); return 0;
      case 'ice': paintGrid(world.ice, x0, y0, x1, y1, r, 1); return 0;
      case 'mine': case 'peel': {
        const list = tool.kind === 'mine' ? world.mines : world.peels, gap = tool.kind === 'mine' ? 19 : 16;
        if (wallAt(x1, y1) || list.some(m => (m.x - x1) ** 2 + (m.y - y1) ** 2 < gap * gap)) return 0;
        list.push({ x: x1, y: y1, armed: false, angle: R() * 6 }); return 1;
      }
    }
    return 0;
  }

  function sample() { if (record) record.samples.push(world.time - record.t0, alive(0), alive(1)); }
  function alive(team) { let n = 0; for (const u of world.units) if (!u.dead && u.hp > 0 && u.team === team) n++; return n; }

  function kill(u, killer) {
    u.dead = true;
    world.corpses.push({ x: u.x, y: u.y, radius: u.radius, type: u.type, team: u.team, faction: u.faction, heading: u.heading, time: world.time });
    events.push({ name: 'Death', x: u.x, y: u.y, type: u.type });
    if (record && u.team >= 0) record.kills.push({ t: world.time - record.t0, victimType: u.type, victimTeam: u.team, killerType: killer ? killer.type : null, killerTeam: killer ? killer.team : -1, cause: 'blow' });
    if (killer) killer.kills++;
  }

  function step() {
    world.tick++; world.time += DT;
    const units = world.units, fight = !world.holding;
    for (const u of units) { u.px = u.x; u.py = u.y; u.pheading = u.heading; }
    for (const u of units) {
      if (u.dead || u.def.prop) continue;
      let tgt = null, best = 1e9;
      if (fight) for (const v of units) { if (v.dead || !hostile(u, v)) continue; const q = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (q < best) { best = q; tgt = v; } }
      let vx = 0, vy = 0;
      if (tgt) {
        const dist = Math.sqrt(best), range = RANGED[u.type] || 0, a = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        u.heading = a;
        if (range && dist < range) {
          u.cool -= DT;
          if (u.cool <= 0) { u.cool = 0.8 + R() * 0.6; const sp = 520; world.projectiles.push({ x: u.x, y: u.y, px: u.x, py: u.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, kind: KIND[u.type] || 'bullet', life: dist / sp, target: tgt, owner: u, dead: false }); events.push({ name: 'Shot', x: u.x, y: u.y, type: u.type }); }
        } else if (dist > u.radius + tgt.radius + 1) { vx = Math.cos(a) * 60; vy = Math.sin(a) * 60; }
        else { tgt.hp -= 40 * DT; if (tgt.hp <= 0 && !tgt.dead) kill(tgt, u); }
      }
      // separation
      for (const v of units) { if (v === u || v.dead) continue; const dx = u.x - v.x, dy = u.y - v.y, q = dx * dx + dy * dy, m = u.radius + v.radius; if (q > 0 && q < m * m) { const k = (m - Math.sqrt(q)) * 3; vx += dx / Math.sqrt(q) * k; vy += dy / Math.sqrt(q) * k; } }
      let nx = u.x + vx * DT, ny = u.y + vy * DT;
      if (world.holding && u.team === 0) nx = Math.min(nx, world.W / 2 - u.radius); // OG holding clamp (game.js:13815-13817)
      if (world.holding && u.team === 1) nx = Math.max(nx, world.W / 2 + u.radius);
      nx = Math.min(Math.max(nx, u.radius), world.W - u.radius); ny = Math.min(Math.max(ny, u.radius), world.H - u.radius);
      if (!wallAt(nx, ny)) { u.x = nx; u.y = ny; }
    }
    for (const p of world.projectiles) {
      if (p.dead) continue; p.px = p.x; p.py = p.y; p.x += p.vx * DT; p.y += p.vy * DT; p.life -= DT;
      if (p.life <= 0) { p.dead = true; const t = p.target; if (t && !t.dead) { t.hp -= p.kind === 'grenade' ? 60 : 34; if (t.hp <= 0) kill(t, p.owner); } }
    }
    if (world.tick % 30 === 0) {
      world.projectiles = world.projectiles.filter(p => !p.dead);
      world.corpses = world.corpses.filter(c => world.time - c.time < 1.2);
      world.units = world.units.filter(u => !u.dead);
    }
    if (record && world.tick % 15 === 0) sample();
  }

  const game = {
    mock: true,
    get world() { return world; },
    get paused() { return paused; },
    get holding() { return world.holding; },
    get teamMode() { return teamMode; },
    setTool(t) { painter = null; tool = t; },
    paintBegin(x, y, r = 14) {
      lastX = x; lastY = y;
      if (tool.kind === 'unit') painter = { type: tool.type, carry: 0, started: false, heading: headingFor(tool.type, x, y) };
      else painter = { kind: tool.kind };
      return paintSeg(x, y, x, y, r);
    },
    paintMove(x, y, r = 14) { if (!painter) return 0; const n = paintSeg(lastX, lastY, x, y, r); lastX = x; lastY = y; return n; },
    paintEnd() { painter = null; },
    erase(x0, y0, x1, y1, r = 14) {
      paintGrid(world.walls, x0, y0, x1, y1, r, 0); paintGrid(world.water, x0, y0, x1, y1, r, 0); paintGrid(world.ice, x0, y0, x1, y1, r, 0);
      const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy;
      const near = (o) => { let t = L ? ((o.x - x0) * dx + (o.y - y0) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return (o.x - x0 - dx * t) ** 2 + (o.y - y0 - dy * t) ** 2 <= r * r; };
      world.units = world.units.filter(u => !near(u)); world.mines = world.mines.filter(m => m.armed || !near(m)); world.peels = world.peels.filter(p => !near(p));
    },
    clear() { world.units = []; world.projectiles = []; world.corpses = []; world.mines = []; world.peels = []; grids(); record = null; if (teamMode) world.holding = true; },
    setPaused(b) { paused = !!b; },
    stepOnce() { step(); },
    setTeamMode(b) { teamMode = !!b; world.teamMode = teamMode; for (const u of world.units) if (!u.dead && !u.def.prop) { u.team = teamMode ? (u.x < world.W / 2 ? 0 : 1) : -1; u.faction = teamMode ? 20 + u.team : u.def.faction; } world.holding = teamMode; record = null; },   // like the sim: never wipes (11-17)
    start() { if (!world.holding) return; world.holding = false; record = { t0: world.time, samples: [], kills: [], fielded: [0, 0], types: [new Map(), new Map()] }; for (const u of world.units) if (u.team >= 0) { record.fielded[u.team]++; record.types[u.team].set(u.type, (record.types[u.team].get(u.type) || 0) + 1); } sample(); },
    tick() { if (!paused) step(); },
    resize(w, h) { if (Math.abs(w - world.W) < 0.5 && Math.abs(h - world.H) < 0.5) return; const ow = world.wallW, oh = world.wallH, old = { walls: world.walls, water: world.water, ice: world.ice }; world.W = w; world.H = h; grids(); for (const k in old) for (let y = 0; y < Math.min(oh, world.wallH); y++) for (let x = 0; x < Math.min(ow, world.wallW); x++) world[k][y * world.wallW + x] = old[k][y * ow + x]; },
    counts() { const c = {}; for (const u of world.units) if (!u.dead) c[u.type] = (c[u.type] || 0) + 1; return c; },
    drainEvents() { const e = events; events = []; return e; },
    report() {
      if (!record) return null;
      sample();
      const s = record.samples, n = s.length / 3, dur = s[s.length - 3] || 0;
      const lostBy = [new Map(), new Map()];
      for (const k of record.kills) lostBy[k.victimTeam].set(k.victimType, (lostBy[k.victimTeam].get(k.victimType) || 0) + 1);
      const lost = [0, 1].map(t => [...lostBy[t].values()].reduce((a, b) => a + b, 0));
      const end = [s[(n - 1) * 3 + 1], s[(n - 1) * 3 + 2]];
      const result = end[0] > 0 && end[1] === 0 ? 'left' : end[1] > 0 && end[0] === 0 ? 'right' : end[0] === 0 && end[1] === 0 && n > 1 ? 'draw' : null;
      const w = result === 'left' ? 0 : result === 'right' ? 1 : -1;
      const share = w >= 0 && record.fielded[w] ? (record.fielded[w] - lost[w]) / record.fielded[w] : 0;
      const outcome = result === null ? 'ongoing' : result === 'draw' ? 'mutual' : share >= 0.5 ? 'decisive' : share < 0.15 ? 'pyrrhic' : 'victory';
      const hl = [];
      const k0 = record.kills[0];
      if (k0) hl.push({ id: 'first', kind: 'first', icon: k0.killerType || k0.victimType, team: k0.killerTeam >= 0 ? k0.killerTeam : k0.victimTeam, killerType: k0.killerType, killerTeam: k0.killerTeam, victimType: k0.victimType, victimTeam: k0.victimTeam, cause: k0.cause, t: k0.t });
      let mvp = null; for (const u of world.units) if (u.team >= 0 && (!mvp || u.kills > mvp.kills)) mvp = u;
      if (mvp && mvp.kills >= 3) hl.unshift({ id: 'mvp', kind: 'mvp', icon: mvp.type, team: mvp.team, type: mvp.type, n: mvp.kills, m: 0 });
      if (w >= 0) hl.push({ id: 'close', kind: 'close', icon: [...record.types[w].keys()][0], team: w, s: record.fielded[w] - lost[w] });
      if (result === 'draw') hl.push({ id: 'wipeout', kind: 'wipeout', icon: [...record.types[0].keys()][0], team: 0 });
      return { mock: true, duration: dur, result, outcome, strength: record.types, losses: lostBy, total: record.fielded, lost, samples: s, highlights: hl.slice(0, 3) };
    },
  };
  return game;
}
