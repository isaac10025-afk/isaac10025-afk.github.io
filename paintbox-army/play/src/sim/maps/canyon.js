// Canyon map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Red dirt with a deep river down the middle (it swells and narrows), steep banks = wall bands along both sides of it,
// open only where 3 wooden bridges cross. Rock blobs, cacti, bones, and a dirt path from each side's camp to every
// bridge. The cowboy peeks from behind a rock near the top-left. Teams are left / right, so the river runs top to bottom
// on every screen shape. The def is default-exported: sim/maps/index.js registers it.

const T = {
  river: 0.04,        // river width = this × W, clamped below (≥ 56 px so its middle is deep)
  riverMin: 64, riverMax: 112,
  swell: 0.18,        // river width wobble (fraction)
  bank: 14,           // px bank wall thickness
  bridges: [0.19, 0.5, 0.79], // bridge heights (× H; the low one clear of the desktop toolbar)
  bridgeR: 18,        // px bridge stroke radius (36 px wide planks)
  bridgeOver: 22,     // px a bridge reaches past each bank
  bankGap: 18,        // px extra opening in the bank on each side of a bridge
  camp: [0.13, 0.5],  // where each side's paths start (× W, × H)
  pathStep: 30,       // px between path stamps
  rockEvery: 70000,   // px² of land per rock blob
  rockMin: 12, rockMax: 34,
  cactusEvery: 30000, // px² of land per cactus
  cactusGap: 34,
  boneEvery: 90000,   // px² of land per bones
  secretRock: [0.09, 0.12], // the cowboy's rock (× W, × H)
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
  id: 'canyon',
  ground: 'dirt',
  build(api) {
    const { W, H, rng } = api;
    const cx = W / 2, rw = Math.max(T.riverMin, Math.min(T.riverMax, T.river * W));
    const ph = rng() * 6.28, waves = 2 + Math.round(H / 900);
    const half = (y) => (rw / 2) * (1 + T.swell * Math.sin((y / H) * Math.PI * 2 * waves + ph));   // half the river width at y
    const by = T.bridges.map((f) => f * H);
    const bankX = (y) => cx - half(y) - T.bank / 2;
    const open = (y) => by.some((b) => Math.abs(y - b) < T.bridgeR + T.bankGap);
    // paths: camp → the near end of each bridge
    const campX = T.camp[0] * W, campY = T.camp[1] * H;
    // each path bends to meet its bridge straight on: a curve camp → (60 % across, bridge height) → bridge end, as points
    const paths = by.map((b) => { const x2 = bankX(b) - T.bridgeOver, x1 = campX + (x2 - campX) * 0.6, pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16, u = 1 - t; pts.push([u * u * campX + 2 * u * t * x1 + t * t * x2, u * u * campY + 2 * u * t * b + t * t * b]); } return pts; });
    const onPath = (x, y, pad) => paths.some((pts) => pts.some((p, k) => k > 0 && segD(x, y, pts[k - 1][0], pts[k - 1][1], p[0], p[1]) < pad)) || Math.hypot(x - campX, y - campY) < pad + 20;
    const sx = T.secretRock[0] * W, sy = T.secretRock[1] * H, sr = 26;
    const land = (x, y, pad) => x > 14 && y > 14 && y < H - 14 && x < bankX(y) - T.bank - pad && !onPath(x, y, pad + 18) && Math.hypot(x - sx, y - sy) > sr + 50;
    const area = (W / 2 - rw) * H;
    const rocks = scatter(rng, Math.round(area / T.rockEvery), 20, 20, cx - rw, H - 20, (x, y) => land(x, y, 30) && Math.abs(y - campY) > 40, 90).map(([x, y]) => [x, y, T.rockMin + rng() * (T.rockMax - T.rockMin), 0.6 + rng() * 0.6]);
    const clear = (x, y, pad) => land(x, y, pad) && !rocks.some(([rx, ry, r]) => Math.hypot(x - rx, y - ry) < r + 16);
    const cacti = scatter(rng, Math.round(area / T.cactusEvery), 14, 14, cx - rw, H - 14, (x, y) => clear(x, y, 6), T.cactusGap);
    const bones = scatter(rng, Math.round(area / T.boneEvery) + 1, 20, 20, cx - rw, H - 20, (x, y) => clear(x, y, 10) && !cacti.some(([a, b]) => Math.hypot(x - a, y - b) < 24), 80).map(([x, y]) => [x, y, rng() * 6.28]);

    api.mirror((m) => {
      // the river (half of it: from the bank to the middle line), then the bank wall with its 3 openings
      const step = 8;
      for (let y = 0; y <= H + step; y += step) m.water(cx - half(y), y, cx, y, step * 0.75);
      let run = null;
      for (let y = 0; y <= H + step; y += step) {
        const x = bankX(y), o = open(y) || y > H + 4;
        if (!o) { if (run) m.wall(run[0], run[1], x, y, T.bank / 2); run = [x, y]; }
        else run = null;
      }
      // bridges (each half reaches the middle; the mirror lays the other half)
      for (const b of by) m.bridge(bankX(b) - T.bridgeOver, b, cx, b, T.bridgeR);
      // paths, rocks, cacti, bones; the cowboy's rock
      for (const pts of paths) {   // stamps every pathStep px along the curve
        let carry = 0;
        for (let k = 1; k < pts.length; k++) {
          const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
          for (let d = carry; d < len; d += T.pathStep) m.deco('path', x0 + (x1 - x0) * d / len, y0 + (y1 - y0) * d / len, 1, a);
          carry = (carry - len) % T.pathStep; if (carry < 0) carry += T.pathStep;
        }
      }
      for (const [x, y, r, k] of rocks) m.blob('wall', x, y, r, r * k);
      m.blob('wall', sx, sy, sr, sr * 0.8);
      for (const [x, y] of cacti) m.prop('tree', x, y);
      for (const [x, y, a] of bones) m.deco('bones', x, y, 1, a);
      m.prop('barrel', campX - 16, campY - 26); m.prop('barrel', campX + 4, campY - 30);
    });
    api.secret(sx + sr + 11, sy + 4, 'rock');
  },
};
