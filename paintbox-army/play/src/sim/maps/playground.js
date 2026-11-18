// Playground map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Grass with, on each side: a block of trampolines (2 rows of 4), a paddling pool, a slide (a short wall rail + the slide
// picture) with banana peels at its foot, an ice slide strip, hopscotch, benches (short walls), trees round the edges,
// flowers. One big sandpit in the top middle (the giant baby sits in it; clear of the toolbar on every screen).
// The def is default-exported: sim/maps/index.js registers it.

const T = {
  trampGap: 0.032,    // px between trampolines = this × short side, clamped below (pads are r 14)
  trampMin: 44, trampMax: 76,
  poolLen: 0.035,     // paddling pool half length = this × short side, clamped below
  poolMin: 36, poolMax: 80,
  poolR: 15,          // px pool stroke radius (≤ 16: stays shallow)
  slideRail: 5,       // px slide rail (wall) radius
  slideLen: 100,      // px slide length (the art's slide is 120 x 40 at scale 1: scaled to fit)
  iceLen: 0.09,       // ice strip length = this × short side, clamped below
  iceMin: 90, iceMax: 220,
  iceR: 12,           // px ice strip radius
  benchLen: 40,       // px bench length
  bench: 5,           // px bench (wall) radius
  sandpit: 1.1,       // sandpit picture scale (the art's sandpit is 120 x 90 at scale 1)
  treeEvery: 34000,   // px² per tree (edges only)
  treeGap: 34,
  flowerEvery: 60000, // px² per flower patch
  big: 1000,          // short side ≥ this: the big layout (two of most things: the desktop world is huge)
  sizeK: 640,         // slide, bench, hopscotch, pool length and sandpit grow with short side / this (1..2.2)
  // layouts (left half; mirrored), × W and × H. tramps [cx, cy, columns, rows], pools [x, y], slides / ices / hops /
  // benches [x, y, angle], sandpit [x, y] (middle)
  land: { tramps: [[0.29, 0.27, 4, 2]], pools: [[0.13, 0.22]], slides: [[0.12, 0.6, 0.5]], ices: [[0.3, 0.58, -0.25]], hops: [[0.27, 0.84, 0]], benches: [[0.06, 0.42, Math.PI / 2], [0.4, 0.92, 0], [0.4, 0.08, 0]], sandpit: [0.5, 0.25] },
  port: { tramps: [[0.26, 0.16, 2, 4]], pools: [[0.24, 0.36]], slides: [[0.16, 0.52, 0.9]], ices: [[0.28, 0.64, 1.25]], hops: [[0.24, 0.86, Math.PI / 2]], benches: [[0.05, 0.3, Math.PI / 2], [0.05, 0.72, Math.PI / 2], [0.4, 0.96, 0]], sandpit: [0.5, 0.47] },
  wide: { tramps: [[0.3, 0.2, 4, 2], [0.17, 0.66, 4, 2]], pools: [[0.1, 0.18], [0.39, 0.47]], slides: [[0.08, 0.42, 0.5], [0.31, 0.56, -0.4]], ices: [[0.25, 0.4, -0.25], [0.37, 0.76, 0.3]], hops: [[0.27, 0.9, 0], [0.06, 0.86, Math.PI / 2]], benches: [[0.03, 0.3, Math.PI / 2], [0.03, 0.6, Math.PI / 2], [0.42, 0.94, 0], [0.38, 0.06, 0], [0.18, 0.4, 0]], sandpit: [0.5, 0.25] },
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
  id: 'playground',
  ground: 'grass',
  build(api) {
    const { W, H, portrait, short, rng } = api;
    const L = portrait ? T.port : short >= T.big ? T.wide : T.land, P = ([fx, fy, ...r]) => [fx * W, fy * H, ...r];
    const k = Math.max(1, Math.min(2.2, short / T.sizeK));
    const sp = Math.max(T.trampMin, Math.min(T.trampMax, T.trampGap * short));
    const blocks = L.tramps.map(P), pads = [];
    for (const [tcx, tcy, cols, rows] of blocks) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) pads.push([tcx + (i - (cols - 1) / 2) * sp, tcy + (j - (rows - 1) / 2) * sp]);
    const pools = L.pools.map(P), pl = Math.max(T.poolMin, Math.min(T.poolMax, T.poolLen * short));
    const slides = L.slides.map(P), ices = L.ices.map(P), il = Math.max(T.iceMin, Math.min(T.iceMax, T.iceLen * short));
    const hops = L.hops.map(P), benches = L.benches.map(P), [spx, spy] = P(L.sandpit);
    const sk = T.sandpit * k, spR = 55 * sk, slideLen = T.slideLen * k, benchLen = T.benchLen * k;
    // keep-outs for trees and flowers (left half)
    const keep = [...blocks.map(([x, y, c, r]) => [x, y, (c * sp) / 2 + 30, (r * sp) / 2 + 30]), ...pools.map(([x, y]) => [x, y, pl + 30, 40]), ...slides.map(([x, y]) => [x, y, slideLen, slideLen]),
      ...ices.map(([x, y]) => [x, y, il / 2 + 24, il / 2 + 24]), ...hops.map(([x, y]) => [x, y, 70 * k, 70 * k]), [spx, spy, spR + 30, spR + 20]];
    const free = (x, y) => x > 14 && y > 14 && y < H - 14 && x < W / 2 - 18 && !keep.some(([a, b, kw, kh]) => Math.abs(x - a) < kw && Math.abs(y - b) < kh) && !benches.some(([a, b]) => Math.hypot(x - a, y - b) < 40);
    const edge = (x, y) => x < W * 0.08 || y < H * 0.09 || y > H * 0.91;
    const trees = scatter(rng, Math.round((W / 2) * H / T.treeEvery), 14, 14, W / 2 - 18, H - 14, (x, y) => free(x, y) && edge(x, y), T.treeGap);
    scatter(rng, Math.max(3, Math.round((W / 2) * H / 140000)), W * 0.1, H * 0.1, W / 2 - 60, H * 0.9, (x, y) => free(x, y) && !edge(x, y), 140, trees);   // a few shade trees inside
    const flowers = scatter(rng, Math.round((W / 2) * H / T.flowerEvery) + 2, 20, 20, W / 2 - 20, H - 20, (x, y) => free(x, y) && !trees.some(([a, b]) => Math.hypot(x - a, y - b) < 24), 50).map(([x, y]) => [x, y, rng() * 6.28]);
    const peels = slides.map(([sx, sy, sa]) => [0.3, 0.75, 1.2].map((f) => [sx + Math.cos(sa) * (slideLen / 2 + 14 + f * 12) + (rng() - 0.5) * 16, sy + Math.sin(sa) * (slideLen / 2 + 14 + f * 12) + (rng() - 0.5) * 16]));

    api.deco('sandpit', spx, spy, sk, 0);
    api.mirror((m) => {
      for (const [x, y] of pads) m.tramp(x, y);
      for (const [px, py] of pools) m.water(px - pl, py, px + pl, py, T.poolR);
      // a slide: the picture, and a short wall along one side of it (its rail); peels at its foot
      slides.forEach(([sx, sy, sa], i) => {
        const c = Math.cos(sa), s = Math.sin(sa), half = slideLen / 2, off = (slideLen / 120) * 20 + T.slideRail + 2;
        m.deco('slide', sx, sy, slideLen / 120, sa);
        m.wall(sx - c * half - s * off, sy - s * half + c * off, sx + c * half - s * off, sy + s * half + c * off, T.slideRail);
        for (const [x, y] of peels[i]) m.peel(x, y);
      });
      for (const [ix, iy, ia] of ices) m.ice(ix - Math.cos(ia) * il / 2, iy - Math.sin(ia) * il / 2, ix + Math.cos(ia) * il / 2, iy + Math.sin(ia) * il / 2, T.iceR);
      for (const [hx, hy, ha] of hops) m.deco('hopscotch', hx, hy, k, ha);
      for (const [x, y, a] of benches) m.wall(x - Math.cos(a) * benchLen / 2, y - Math.sin(a) * benchLen / 2, x + Math.cos(a) * benchLen / 2, y + Math.sin(a) * benchLen / 2, T.bench);
      for (const [x, y] of trees) m.prop('tree', x, y);
      for (const [x, y, a] of flowers) m.deco('flowers', x, y, 1, a);
    });
    // the giant baby sits in the sandpit
    api.secret(spx - spR * 0.3, spy + spR * 0.1, 'sandpit');
  },
};
