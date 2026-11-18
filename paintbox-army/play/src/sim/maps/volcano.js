// Volcano map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Charcoal rock with a crater in the middle: a wall ring with a lava lake inside and two gaps low on each side where
// lava rivers pour out and run down toward the bottom-left and bottom-right corners, ending in a lava pool with a lane round it (so the middle wedge never gets cut off once the bridges burn). One wooden bridge over each river (it
// can burn), rock outcrops, dead trees, glowing cracks. The open way between the sides is over the top of the crater
// (and over the bridges through the middle wedge). The phoenix egg bobs in the crater lava.
// The def is default-exported: sim/maps/index.js registers it.

const T = {
  crater: 0.22,       // crater radius = this × short side (ry); rx = ry × craterWide in landscape
  craterWide: 1.25,
  craterY: 0.46,      // crater middle (× H)
  rim: 20,            // px crater wall thickness
  rimLava: 14,        // px between the rim and the lava lake
  gapAt: 0.72,        // rad below horizontal where the river gaps are (0 = side, PI/2 = straight down)
  gapHalf: 0.2,       // rad half-width of each gap
  river: 21,          // px lava river stroke radius (42 px wide)
  riverEnd: 0.14,     // the river ends in a lava pool this × W from the side ...
  poolUp: 0.1,        // ... this × H (at least poolLane px) up from the bottom edge, so a lane runs round it
  poolR: 34,          // px pool radius
  poolLane: 70,       // px of open ground at least between the pool and the field edges
  bridgeR: 16,        // px bridge stroke radius
  bridgeOver: 20,     // px the bridge reaches past each side of the river
  rockEvery: 60000,   // px² per rock outcrop
  rockMin: 14, rockMax: 40,
  treeEvery: 34000,   // px² per dead tree
  treeGap: 36,
  crackEvery: 60000,  // px² per glowing crack (the rock ground already has small glowing bits of its own)
};

// Random points in a box that pass ok(x, y), at least gap apart (also from the points already in out). A cell grid keeps
// the distance check short when hundreds of trees go down.
function scatter(rng, n, x0, y0, x1, y1, ok, gap, out = []) {
  const cell = Math.max(8, gap), grid = new Map(), key = (cx, cy) => (cx + 4096) * 16384 + cy + 4096;
  const add = (p) => { const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell)), a = grid.get(k); if (a) a.push(p); else grid.set(k, [p]); };
  for (const p of out) add(p);
  for (let tries = 0; tries < n * 30 && n > 0; tries++) {
    const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
    if (!ok(x, y)) continue;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const a = grid.get(key(cx + dx, cy + dy));
      if (a) for (const p of a) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < gap * gap) { near = true; break; }
    }
    if (near) continue;
    const p = [x, y]; out.push(p); add(p);
    if (--n <= 0) break;
  }
  return out;
}
const segD = (px, py, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l = dx * dx + dy * dy, s = l > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l)) : 0; return Math.hypot(px - x0 - dx * s, py - y0 - dy * s); };

export default {
  id: 'volcano',
  ground: 'rock',
  build(api) {
    const { W, H, portrait, short, rng } = api;
    const cx = W / 2, cy = T.craterY * H;
    const ry = T.crater * short, rx = portrait ? ry * 1.05 : ry * T.craterWide;
    const ga = Math.PI - T.gapAt;                                         // the left gap's angle (down-left)
    // the left river: from the gap down to the bottom edge near the left corner, with one bend (a kink outward)
    const gx = cx + Math.cos(ga) * rx, gy = cy + Math.sin(ga) * ry;
    const ex = Math.max(T.riverEnd * W, T.poolR + T.poolLane), ey = H - Math.max(T.poolUp * H, T.poolR + T.poolLane);
    const bend = 0.12 * Math.min(W / 2, H) * (0.6 + rng() * 0.4);
    const mx = (gx + ex) / 2 - bend * 0.4, my = (gy + ey) / 2 + bend * 0.2;
    const river = [[cx + Math.cos(ga) * (rx - T.rim - T.rimLava) * 0.85, cy + Math.sin(ga) * (ry - T.rim - T.rimLava) * 0.85], [gx, gy], [mx, my], [ex, ey]];
    const nearRiver = (x, y, pad) => { if (Math.hypot(x - ex, y - ey) < T.poolR + pad) return true; for (let i = 1; i < river.length; i++) if (segD(x, y, river[i - 1][0], river[i - 1][1], river[i][0], river[i][1]) < T.river + pad) return true; return false; };
    const inCrater = (x, y, pad) => ((x - cx) / (rx + pad)) ** 2 + ((y - cy) / (ry + pad)) ** 2 < 1;
    // bridge across the middle of the river's second leg, square to it
    const bx = (gx + mx) / 2 + (mx - gx) * 0.25, by = (gy + my) / 2 + (my - gy) * 0.25;
    const len = Math.hypot(mx - gx, my - gy), nx = -(my - gy) / len, ny = (mx - gx) / len, bl = T.river + T.bridgeOver;
    const land = (x, y, pad) => x > 14 && y > 14 && y < H - 14 && x < cx - 16 && !inCrater(x, y, 30 + pad) && !nearRiver(x, y, 18 + pad) && Math.hypot(x - bx, y - by) > bl + 30;
    const inLane = (x, y, r) => Math.hypot(x - ex, y - ey) < T.poolR + T.poolLane * 1.6 + r || y > H - 40 - r;   // keep the lane round the pool clear of rocks
    const area = (W / 2) * H;
    // rocks: never in the lane round a pool, never touching their own mirror copy (two would wall off the middle)
    const rocks = scatter(rng, Math.round(area / T.rockEvery), 20, 20, cx - 30, H - 20, (x, y) => land(x, y, 34) && !inLane(x, y, T.rockMax) && x < cx - T.rockMax - 30, 100).map(([x, y]) => [x, y, T.rockMin + rng() * (T.rockMax - T.rockMin), 0.55 + rng() * 0.6]);
    const clear = (x, y, pad) => land(x, y, pad) && !rocks.some(([a, b, r]) => Math.hypot(x - a, y - b) < r + 14);
    const trees = scatter(rng, Math.round(area / T.treeEvery), 14, 14, cx - 16, H - 14, (x, y) => clear(x, y, 4), T.treeGap);
    const cracks = scatter(rng, Math.round(area / T.crackEvery), 20, 20, cx - 20, H - 20, (x, y) => clear(x, y, 0) || (inCrater(x, y, 60) && !inCrater(x, y, 6)), 50).map(([x, y]) => [x, y, 0.7 + rng() * 0.7, rng() * 6.28]);

    // the crater: rim with two low gaps, the lava lake inside (painted once: it's in the middle)
    api.ring('wall', cx, cy, rx, ry, T.rim, [[ga, T.gapHalf], [Math.PI - ga, T.gapHalf]], 48);
    api.blob('lava', cx, cy, rx - T.rim / 2 - T.rimLava, ry - T.rim / 2 - T.rimLava);
    api.mirror((m) => {
      m.line('lava', river, T.river).disc('lava', ex, ey, T.poolR);
      m.bridge(bx - nx * bl, by - ny * bl, bx + nx * bl, by + ny * bl, T.bridgeR);
      for (const [x, y, r, k] of rocks) m.blob('wall', x, y, r, r * k);
      for (const [x, y] of trees) m.prop('tree', x, y);
      for (const [x, y, s, a] of cracks) m.deco('glowcrack', x, y, s, a);
    });
    // the phoenix egg bobs in the crater lava, a little off the middle
    api.secret(cx - rx * 0.22, cy - ry * 0.08, 'egg');
  },
};
