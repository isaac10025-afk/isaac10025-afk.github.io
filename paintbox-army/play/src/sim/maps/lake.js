// Lake map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Snow field with a big deep lake in the middle, frozen over, with 4 open fishing holes; a little fishing hut on each
// shore (door to the lake, a barrel by it), pines all round the lake and along the edges, snowdrifts.
// The yeti hides under the ice near the middle. The def is default-exported: sim/maps/index.js registers it.

const T = {
  rx: 0.27, ry: 0.3,          // lake half sizes, × W and × H (landscape)
  rxP: 0.36, ryP: 0.22,       // same, phone upright
  wobble: 0.07,               // shore wobble (fraction of the radius)
  hole: 0.075,                // hole radius = this × short side, clamped below
  holeMin: 24, holeMax: 46,
  hutW: 0.05, hutH: 0.04,     // fishing hut box = this × short side, clamped below
  hutMinW: 64, hutMaxW: 96, hutMinH: 60, hutMaxH: 80,
  hutWall: 10,                // px hut wall thickness
  hutDoor: 52,                // px door gap (a giant, r 21, must get through)
  hutOff: 46,                 // px from the lake's side to the hut middle
  hutDownP: 0.42,             // phone upright: huts this × ry below the lake middle
  shorePines: 0.012,          // pines round the lake per px of shore
  edgeEvery: 26000,           // px² of land per pine elsewhere
  pineGap: 30,                // px min distance between pines
  driftEvery: 60000,          // px² of land per snowdrift
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
  id: 'lake',
  ground: 'snow',
  build(api) {
    const { W, H, portrait, short, rng } = api;
    const cx = W / 2, cy = H / 2;
    const rx = (portrait ? T.rxP : T.rx) * W, ry = (portrait ? T.ryP : T.ry) * H;
    const p1 = rng() * 6.28, p2 = rng() * 6.28;
    // lake edge: an ellipse with a wobble that only depends on |x − middle| (so it mirrors exactly)
    const lakeR = (x, y) => { const u = Math.abs(x - cx) / rx, v = (y - cy) / ry, a = Math.atan2(v, u); return Math.hypot(u, v) / (1 + T.wobble * (Math.cos(3 * a + p1) * 0.6 + Math.cos(5 * a + p2) * 0.4)); };
    const inLake = (x, y) => lakeR(x, y) <= 1;
    const hr = Math.max(T.holeMin, Math.min(T.holeMax, T.hole * short));
    const holes = [[cx - rx * 0.66, cy + ry * 0.08], [cx - rx * 0.3, cy - ry * 0.5]];   // left half; mirrored
    const inHole = (x, y) => holes.some(([hx, hy]) => (Math.abs(x - cx) - Math.abs(hx - cx)) ** 2 + (y - hy) ** 2 <= hr * hr);
    // water + ice by tile rows (row runs of tiles; ice skips the holes)
    const t = api.tile, bx0 = Math.max(t / 2, Math.floor((cx - rx * 1.2) / t) * t + t / 2), bx1 = Math.min(W + t, cx + rx * 1.2 + t);
    for (let y = Math.max(t / 2, Math.floor((cy - ry * 1.2) / t) * t + t / 2); y < Math.min(H, cy + ry * 1.2); y += t) {
      let w0 = -1, i0 = -1;
      for (let x = bx0; x < bx1; x += t) {
        const wet = x < W && x < bx1 - t && inLake(x, y), ice = wet && !inHole(x, y);
        if (wet && w0 < 0) w0 = x;
        if (!wet && w0 >= 0) { api.water(w0, y, x - t, y, t / 2); w0 = -1; }
        if (ice && i0 < 0) i0 = x;
        if (!ice && i0 >= 0) { api.ice(i0, y, x - t, y, t / 2); i0 = -1; }
      }
    }
    // the huts: on the shore left / right of the lake, door facing the lake
    const hw = Math.max(T.hutMinW, Math.min(T.hutMaxW, T.hutW * short)), hh = Math.max(T.hutMinH, Math.min(T.hutMaxH, T.hutH * short));
    const hy = portrait ? cy + ry * T.hutDownP : cy;          // phone upright: below the round buttons down the right side
    let hutX = cx - rx - T.hutOff;
    while (hutX < cx && !inLake(hutX + hw / 2 + 18, hy)) hutX += 8;   // up to the shore where it's lower down
    while (hutX > hw / 2 + 14 && inLake(hutX + hw / 2 + 10, hy)) hutX -= 8;
    hutX = Math.max(hw / 2 + 14, hutX);
    const nearHut = (x, y) => Math.abs(x - hutX) < hw / 2 + 30 && Math.abs(y - hy) < hh / 2 + 30;
    const land = (x, y, pad) => lakeR(x, y) > 1 + pad && !nearHut(x, y) && x > 12 && y > 14 && y < H - 14 && x < cx - 14;
    // pines: a ring round the lake shore, then along the edges / corners
    const pines = [];
    const shoreLen = Math.PI * (rx + ry);
    scatter(rng, Math.round(shoreLen * T.shorePines), cx - rx * 1.5, cy - ry * 1.5, cx - 10, cy + ry * 1.5, (x, y) => { const r = lakeR(x, y); return r > 1.12 && r < 1.45 && land(x, y, 0.1); }, T.pineGap, pines);
    const landArea = (W / 2) * H - (Math.PI * rx * ry) / 2;
    scatter(rng, Math.round(landArea / T.edgeEvery), 12, 14, cx - 14, H - 14, (x, y) => land(x, y, 0.5) && (x < W * 0.14 || y < H * 0.14 || y > H * 0.86 || lakeR(x, y) > 1.9), T.pineGap, pines);
    const drifts = scatter(rng, Math.round(landArea / T.driftEvery) + 2, 20, 20, cx - 20, H - 20, (x, y) => land(x, y, 0.2), 60).map(([x, y]) => [x, y, 0.8 + rng() * 0.6, rng() * 3.14]);

    api.mirror((m) => {
      m.box('wall', hutX - hw / 2, hy - hh / 2, hw, hh, T.hutWall, [['e', 0.5, T.hutDoor + T.hutWall]]);
      m.prop('barrel', hutX + hw / 2 + 4, hy + hh / 2 + 12);
      m.prop('barrel', hutX - 6, hy - hh / 2 - 14);
      for (const [x, y] of pines) m.prop('tree', x, y);
      for (const [x, y, s, a] of drifts) m.deco('snowdrift', x, y, s, a);
    });
    // the yeti: a dark shape under the ice a little off the middle
    api.secret(cx + rx * 0.12, cy - ry * 0.16, 'underice');   // above the middle: the phone-sideways toolbar covers the lower half
  },
};
