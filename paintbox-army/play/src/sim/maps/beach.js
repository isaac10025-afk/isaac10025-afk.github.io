// Beach map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Sand on top, the sea along the bottom (deep, with the shallow rim the water grid gives every shore), a wavy surf line
// with a bay in the middle,
// rocks in the water and on the sand, a shipwreck outline out at sea in the middle (its deck is a dry sandbar the
// seagull sits on), palms in clumps, sandcastles, shells along the surf and a few barrels washed up.
// On a short wide world (phone sideways) the toolbar covers the bottom half of the screen, so the sea goes along the top.
// The def is default-exported: sim/maps/index.js registers it (a map file can't import index.js: see its last lines).

const T = {
  sea: 0.3,          // the sea covers about this much of H at the bottom
  seaPortrait: 0.28, // same, phone upright
  wave: 0.022,       // surf line wobble = this × H
  waves: 3,          // big wobbles across the whole width (symmetric about the middle; the middle is a bay)
  seaUpAspect: 1.2,  // W / H above this (any landscape screen): the sea goes along the top instead (lead 11-16: on desktop the wreck + its secret sat under the tool bar)
  wreckL: 0.2,       // wreck length = this × W, clamped below
  wreckMin: 140, wreckMax: 420,
  wreckBeam: 0.34,   // wreck width = this × its length
  wreckWall: 12,     // px hull thickness
  wreckGaps: [[0.18, 1], [0.6, -1]], // broken hull: [where along the half hull (0 bow .. 1 middle), 1 lower / -1 upper side]
  wreckGap: 48,      // px each broken gap (a giant, r 21, must get through)
  wreckAt: 0.36,     // wreck centre this far down into the sea (desktop: above the toolbar) ...
  wreckEdge: 48,     // ... but at least this many px of sea between its hull and the bottom edge ...
  wreckShore: 36,    // ... and between its hull and the surf
  wreckFill: 0.45,   // the wreck is never wider (top to bottom) than this share of the sea
  mast: 7,           // px mast radius (a wall)
  rockEvery: 90000,  // px² of sea per rock
  palmEvery: 22000,  // px² of sand per palm
  palmGap: 30,       // px min distance between palms
  castleEvery: 100000, // px² of sand per sandcastle
  shellEvery: 70,    // px of surf line per shell
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
  id: 'beach',
  ground: 'sand',
  build(api) {
    const { W, H, portrait, rng } = api;
    const seaTop = H * (1 - (portrait ? T.seaPortrait : T.sea));
    // everything is laid out with the sea at the bottom; Y() turns it upside down on a phone held sideways
    const up = W / H > T.seaUpAspect, Y = up ? (y) => H - y : (y) => y, A = up ? (a) => -a : (a) => a;
    // surf line: symmetric about the middle (cos of the distance from it), so both halves get the same beach
    const ph = rng() * 0.6;
    const shore = (x) => seaTop + H * T.wave * (-Math.cos(((x - W / 2) / W) * Math.PI * 2 * T.waves) * 0.7 + Math.cos(((x - W / 2) / W) * Math.PI * 2 * (T.waves * 2 + 1) + ph) * 0.3 * Math.cos(ph));
    const sea = H - seaTop, L = Math.max(T.wreckMin * 0.7, Math.min(T.wreckMax, T.wreckL * W, (sea * T.wreckFill) / T.wreckBeam)), B = L * T.wreckBeam;
    const wyLo = shore(W / 2) + B / 2 + T.wreckShore, wyHi = H - B / 2 - T.wreckEdge;   // clear of the surf, clear of the bottom edge
    const wy = wyLo > wyHi ? (wyLo + wyHi) / 2 : Math.max(wyLo, Math.min(wyHi, seaTop + sea * T.wreckAt));
    const inWreck = (x, y, pad) => Math.abs(x - W / 2) < L / 2 + pad && Math.abs(y - wy) < B / 2 + pad;
    // hull: a lens from bow (left) to the middle; the other half is the mirror. Half-beam at fraction f of the half length.
    const hull = (f) => (B / 2) * Math.sqrt(Math.max(0, 1 - (1 - f) * (1 - f)));
    const sand = (x, y, pad) => y < shore(x) - pad && y > 14 && x > 12 && x < W / 2 - 14;
    const seaOk = (x, y) => y > shore(x) + 30 && y < H - 16 && x > 16 && x < W / 2 - 20 && !inWreck(x, y, 40);
    const sandArea = (W / 2) * seaTop, seaArea = (W / 2) * (H - seaTop);
    const rocks = scatter(rng, Math.max(1, Math.round(seaArea / T.rockEvery)), 16, seaTop, W / 2 - 20, H - 16, seaOk, 90).map(([x, y]) => [x, y, 9 + rng() * 14]);
    const shoreRocks = scatter(rng, 2, W * 0.05, seaTop - 20, W * 0.45, seaTop + 10, (x, y) => Math.abs(y - shore(x)) < 10, W * 0.15).map(([x, y]) => [x, y, 12 + rng() * 10]);
    const palms = [];
    const clumps = scatter(rng, Math.max(3, Math.round(sandArea / (T.palmEvery * 3.5))), 30, 20, W / 2 - 30, seaTop - 40, (x, y) => sand(x, y, 30), 110);
    for (const [cx, cy] of clumps) scatter(rng, 2 + Math.floor(rng() * 3), cx - 45, cy - 35, cx + 45, cy + 35, (x, y) => sand(x, y, 24), T.palmGap, palms);
    scatter(rng, Math.round(sandArea / T.palmEvery * 0.5), 14, 14, W / 2 - 16, seaTop * 0.35, (x, y) => sand(x, y, 20), T.palmGap * 1.6, palms);
    const castles = scatter(rng, Math.max(1, Math.round(sandArea / T.castleEvery)), 30, seaTop * 0.35, W / 2 - 40, seaTop - 30, (x, y) => sand(x, y, 26), 120, []).filter(([x, y]) => !palms.some((p) => (p[0] - x) ** 2 + (p[1] - y) ** 2 < 30 * 30));
    const castleAng = castles.map(() => (rng() - 0.5) * 0.6);
    const shells = [];
    for (let x = 20 + rng() * T.shellEvery; x < W / 2 - 16; x += T.shellEvery * (0.6 + rng() * 0.8)) shells.push([x, shore(x) - 10 - rng() * 22, rng() * Math.PI * 2]);
    const barrels = scatter(rng, Math.max(1, Math.round(W / 900)), 30, seaTop - 40, W / 2 - 40, seaTop, (x, y) => y < shore(x) - 14 && y > shore(x) - 40, 140);

    api.mirror((m) => {
      // the sea: columns from the surf line down past the bottom edge
      for (let x = 0; x <= W / 2; x += 8) m.water(x, Y(shore(x)), x, Y(H + 8), 6);
      // the wreck (half of it; the mirror draws the other half): hull lens, a broken plank gap, dry deck, half the mast
      const n = 16, bow = W / 2 - L / 2, hl = L / 2, th = T.wreckWall / 2;
      const broken = (f, side) => T.wreckGaps.some(([g, sd]) => sd === side && Math.abs(f - g) * hl < (T.wreckGap + T.wreckWall) / 2);
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n, fm = (f0 + f1) / 2, xa = bow + f0 * hl, xb = bow + f1 * hl;
        m.dry(xa, Y(wy - hull(f0) * 0.7), xb, Y(wy - hull(f1) * 0.7), 0).dry(xa, Y(wy), xb, Y(wy), Math.max(4, hull(f1) - th));
        if (!broken(fm, -1)) m.wall(xa, Y(wy - hull(f0)), xb, Y(wy - hull(f1)), th);      // broken gaps in the hull (the sea gets in)
        if (!broken(fm, 1)) m.wall(xa, Y(wy + hull(f0)), xb, Y(wy + hull(f1)), th);
      }
      m.wall(W / 2 - 2, Y(wy), W / 2, Y(wy), T.mast);
      for (const [x, y, r] of rocks) m.disc('wall', x, Y(y), r);
      for (const [x, y, r] of shoreRocks) m.disc('wall', x, Y(y), r);
      for (const [x, y] of palms) m.prop('tree', x, Y(y));
      castles.forEach(([x, y], i) => m.deco('sandcastle', x, Y(y), 1, A(castleAng[i])));
      for (const [x, y, a] of shells) m.deco('shell', x, Y(y), 1, A(a));
      for (const [x, y] of barrels) m.prop('barrel', x, Y(y));
    });
    api.prop('barrel', W / 2 - L * 0.2, Y(wy + 2));                       // one more on the wreck's deck
    // the seagull sits on the wreck, by the mast
    api.secret(W / 2 + T.mast + 9, Y(wy - 3), 'wreck');
  },
};
