// Castle map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// One castle per side: a thick wall box with a round tower at each corner and the gate facing the middle, a deep moat
// round it with a wooden bridge at the gate, flags on the towers. The middle is an open field with a few trees, flowers
// and barrels by the gates; woods behind each castle and along the top / bottom edges.
// The def is default-exported: sim/maps/index.js registers it (a map file can't import index.js: see its last lines).
// Layout in fractions of the world, feature sizes in sim px (deep water needs 3+ tiles = 24 px in from the shore).

const T = {
  wall: 18,          // px castle wall thickness (STEP7: 16-20)
  gap: 16,           // px land between the castle wall and the moat
  moat: 58,          // px moat width (≥ 56: the middle 1-2 tiles are deep)
  sideH: 0.36,       // castle side ≤ this × H (landscape)
  sideW: 0.26,       // castle side ≤ this × W
  midGap: 70,        // px: at least this much field between the two moats
  tallPortrait: 2.2, // portrait: the castle is up to this much taller than wide
  tallMax: 0.3,      // portrait: castle height ≤ this × H
  groveEvery: 160000,// px² of field per grove (a clump of 3-6 trees)
  freeAt: 0.38,      // castle + moat sit this far into the free land of their half (0 = against the side, 1 = the middle)
  tower: 0.1,        // tower radius = this × castle side, clamped below
  towerMin: 18, towerMax: 46,
  towerHole: 0.38,   // hollow tower: open middle radius = this × tower radius (the ghost hides in one)
  gate: 0.24,        // gate gap = this × castle height, clamped below
  gateMin: 52, gateMax: 90,   // px (a giant, r 21, must get through)
  bridgeR: 0.42,     // bridge stroke radius = this × gate gap
  treeEvery: 26000,  // px² of free land per tree (more = fewer trees)
  treeGap: 34,       // px min distance between trees
  flowerEvery: 60000,// px² of field per flower patch
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

export default {
  id: 'castle',
  ground: 'grass',
  build(api) {
    const { W, H, portrait, rng } = api;
    const ring = T.gap + T.moat;                                         // castle wall → moat outer edge
    const cw = Math.max(110, Math.min(T.sideH * H, T.sideW * W, W / 2 - 2 * ring - T.midGap - 20));
    const ch = Math.min(H - 2 * ring - 60, portrait ? Math.min(cw * T.tallPortrait, H * T.tallMax) : cw);
    const free = W / 2 - (cw + 2 * ring);
    const cx = cw / 2 + ring + Math.max(10, free * T.freeAt), cy = H / 2;
    const x0 = cx - cw / 2, x1 = cx + cw / 2, y0 = cy - ch / 2, y1 = cy + ch / 2;
    const tr = Math.max(T.towerMin, Math.min(T.towerMax, T.tower * Math.min(cw, ch)));
    const gate = Math.max(T.gateMin, Math.min(T.gateMax, T.gate * ch));
    const mo = cw / 2 + T.gap + T.moat / 2, mh = ch / 2 + T.gap + T.moat / 2;    // moat centre line half sizes
    const outX0 = cx - cw / 2 - ring, outX1 = cx + cw / 2 + ring, outY0 = cy - ch / 2 - ring, outY1 = cy + ch / 2 + ring;

    // ---- where things may go (left half; mirrored)
    const inCastle = (x, y, pad) => x > outX0 - pad && x < outX1 + pad && y > outY0 - pad && y < outY1 + pad;
    const bridgeLane = (x, y) => x > x1 && x < W / 2 && Math.abs(y - cy) < gate * 0.9;   // keep the way out of the gate open
    const treeOk = (x, y) => !inCastle(x, y, 26) && !bridgeLane(x, y) && x > 14 && y > 16 && y < H - 16 && x < W / 2 - 22;
    const fieldW = W / 2 - outX1, back = outX0;
    const nTrees = Math.round(((W / 2) * H - (outX1 - outX0) * (outY1 - outY0)) / T.treeEvery);
    const trees = [];
    // woods behind the castle (a strip along the side) and along the top / bottom edges, then a few out in the field
    scatter(rng, Math.round(nTrees * 0.3), 14, 16, Math.max(30, back - 8), H - 16, treeOk, T.treeGap, trees);
    scatter(rng, Math.round(nTrees * 0.25), 14, 16, W / 2 - 22, Math.min(outY0 - 6, H * 0.16), treeOk, T.treeGap, trees);
    scatter(rng, Math.round(nTrees * 0.25), 14, Math.max(outY1 + 6, H * 0.84), W / 2 - 22, H - 16, treeOk, T.treeGap, trees);
    scatter(rng, Math.round(nTrees * 0.2), outX1 + 30, 16, W / 2 - 30, H - 16, (x, y) => treeOk(x, y) && Math.abs(y - cy) > H * 0.12, T.treeGap * 2.2, trees);
    // groves: clumps of trees in the open land above / below the castle and out in the field (not on the gate lane)
    const groves = scatter(rng, Math.round((W / 2) * H / T.groveEvery) + 1, 40, 40, W / 2 - 50, H - 40, (x, y) => treeOk(x, y) && !inCastle(x, y, 60) && Math.abs(y - cy) > Math.max(gate, H * 0.1), 160);
    for (const [gx, gy] of groves) scatter(rng, 3 + Math.floor(rng() * 4), gx - 50, gy - 40, gx + 50, gy + 40, treeOk, T.treeGap * 0.8, trees);
    const flowers = scatter(rng, Math.round(fieldW * H / T.flowerEvery) + 2, outX1 + 20, 20, W / 2 - 16, H - 20, (x, y) => treeOk(x, y), 50);
    const flowerAng = flowers.map(() => rng() * Math.PI * 2);

    api.mirror((m) => {
      // moat first (the castle walls sit on dry land inside it), then the bridge over it at the gate
      m.box('water', cx - mo, cy - mh, mo * 2, mh * 2, T.moat);
      m.bridge(x1 + T.wall / 2 - 2, cy, cx + mo + T.moat / 2 + 6, cy, gate * T.bridgeR);
      // wall box, gate facing the middle (east for the left castle)
      m.box('wall', x0, y0, cw, ch, T.wall, [['e', 0.5, gate + T.wall]]);   // + the wall: the strokes' round ends reach into the gap
      for (const [tx, ty] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        m.disc('wall', tx, ty, tr);
        m.disc('hole', tx, ty, tr * T.towerHole);                      // hollow: an open middle (the ghost peeks out of one)
        m.deco('flag', tx, ty - tr * 0.2, 1, 0);
      }
      m.deco('flag', x1, cy - gate / 2 - T.wall, 0.8, 0);
      m.deco('flag', x1, cy + gate / 2 + T.wall, 0.8, 0);
      // barrels: a pair inside the gate, a pair outside by the bridge end, one in each back corner of the courtyard
      const bx = cx + mo + T.moat / 2 + 22;
      for (const [x, y] of [[x1 - 26, cy - gate / 2 - 18], [x1 - 26, cy + gate / 2 + 18], [bx, cy - gate / 2 - 14], [bx + 8, cy + gate / 2 + 16], [x0 + 30, y0 + 30], [x0 + 30, y1 - 30]]) m.prop('barrel', x, y);
      // a path from the gate out into the field, flowers, trees
      for (let x = bx + 18; x < W / 2 - 30; x += 34) m.deco('path', x, cy, 1, 0);
      flowers.forEach(([x, y], i) => m.deco('flowers', x, y, 1, flowerAng[i]));
      for (const [x, y] of trees) m.prop('tree', x, y);
    });
    // the ghost hides in the far top tower of the left castle
    api.secret(x0, y0, 'tower');
  },
};
