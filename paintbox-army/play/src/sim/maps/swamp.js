// Swamp map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Dark olive ground full of mud patches, small shallow ponds with lilypads and reeds, willows, fallen logs (short thick
// wall bars), and one big pond in the middle with a narrow zigzag wooden walkway over it. The bog monster's eyes peek
// out of a mud patch near the top-left. The def is default-exported: sim/maps/index.js registers it.

const T = {
  mudShare: 0.18,     // mud patches cover about this much of the field
  mudR: 0.045,        // mud patch radius = this × short side (± half), clamped below
  mudMin: 34, mudMax: 110,
  pond: [0.11, 0.17], // big pond half sizes × W, × H (landscape)
  pondP: [0.27, 0.09],// same, phone upright
  pondY: 0.5,         // big pond middle (× H)
  walkway: 10,        // px walkway stroke radius (narrow)
  puddleEvery: 110000,// px² per small pond
  puddleRy: 15,       // px small pond stroke radius (≤ 16: 4 tiles across, so it stays shallow)
  puddleRx: [30, 80], // px small pond half length range
  logEvery: 90000,    // px² per fallen log
  logR: 9,            // px log thickness / 2
  logLen: [0.03, 0.05], // log length range × short side, at least logMin
  logMin: 38,
  treeEvery: 24000,   // px² per willow
  treeGap: 34,
  secretMud: [0.2, 0.18], // the bog monster's mud patch (× W, × H; top-left: clear of the buttons and the toolbar)
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
  id: 'swamp',
  ground: 'swamp',
  build(api) {
    const { W, H, portrait, short, rng } = api;
    const cx = W / 2, cy = T.pondY * H;
    const [prx, pry] = (portrait ? T.pondP : T.pond).map((f, i) => Math.max(40, f * (i ? H : W)));
    const inPond = (x, y, pad) => ((x - cx) / (prx + pad)) ** 2 + ((y - cy) / (pry + pad)) ** 2 < 1;
    const half = (W / 2) * H;
    // things placed so far (left half): [x, y, r] circles to keep apart
    const taken = [];
    const freeOf = (x, y, r) => !taken.some(([a, b, q]) => Math.hypot(x - a, y - b) < q + r);
    const inside = (x, y, r) => x > r + 6 && y > r + 6 && y < H - r - 6 && x < cx - r - 10;
    // the bog monster's mud patch (the left copy is where it hides)
    const smx = T.secretMud[0] * W, smy = T.secretMud[1] * H, smr = Math.max(T.mudMin + 8, Math.min(T.mudMax, T.mudR * short * 1.2));
    taken.push([smx, smy, smr + 20]);
    // small shallow ponds (long and thin so they stay shallow)
    const puddles = [];
    scatter(rng, Math.max(2, Math.round(half / T.puddleEvery)), 30, 30, cx - 40, H - 30, (x, y) => !inPond(x, y, 60) && inside(x, y, T.puddleRx[1]) && freeOf(x, y, T.puddleRx[1] + 20), 140).forEach(([x, y]) => {
      const rx = T.puddleRx[0] + rng() * (T.puddleRx[1] - T.puddleRx[0]), a = (rng() - 0.5) * 1.4;
      puddles.push([x, y, rx, a]); taken.push([x, y, rx + 18]);
    });
    // fallen logs
    const logs = [];
    scatter(rng, Math.max(2, Math.round(half / T.logEvery)), 30, 30, cx - 30, H - 30, (x, y) => inside(x, y, 40) && !inPond(x, y, 50) && freeOf(x, y, 46), 120).forEach(([x, y]) => {
      const l = Math.max(T.logMin, short * (T.logLen[0] + rng() * (T.logLen[1] - T.logLen[0]))), a = rng() * Math.PI;
      logs.push([x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2, x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2]);
    });
    const nearLog = (x, y, r) => logs.some(([x0, y0, x1, y1]) => Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2) < r + Math.hypot(x1 - x0, y1 - y0) / 2 + 10);
    // mud patches until they cover the share (each patch = 2-3 overlapping blobs)
    const muds = [];
    let mudArea = Math.PI * smr * smr * 0.8;
    for (let tries = 0; tries < 4000 && mudArea < T.mudShare * half; tries++) {
      const r = Math.max(T.mudMin, Math.min(T.mudMax, T.mudR * short * (0.5 + rng())));
      const x = 20 + rng() * (cx - 40), y = 20 + rng() * (H - 40);
      if (!inside(x, y, r * 0.6) || inPond(x, y, r + 30) || !freeOf(x, y, r * 0.8)) continue;   // logs may lie in the mud
      const parts = [[x, y, r, r * (0.6 + rng() * 0.3)]];
      for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) { const a = rng() * 6.28; parts.push([x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.5, r * (0.45 + rng() * 0.3), r * (0.35 + rng() * 0.25)]); }
      muds.push(parts); taken.push([x, y, r * 1.2]); mudArea += Math.PI * r * r * 0.85;
    }
    // willows (round the ponds first, then anywhere free), reeds and lilypads
    const trees = [];
    scatter(rng, Math.round(half / T.treeEvery), 14, 14, cx - 16, H - 14, (x, y) => inside(x, y, 8) && !inPond(x, y, 24) && freeOf(x, y, 10) && !nearLog(x, y, 6), T.treeGap, trees);
    const reeds = [], pads = [];
    for (const [x, y, rx, a] of puddles) {
      const c = Math.cos(a), s2 = Math.sin(a);
      reeds.push([x - c * (rx + 18), y - s2 * (rx + 18) - 4, rng() * 0.6], [x + c * (rx + 16), y + s2 * (rx + 16) + 4, rng() * 0.6]);
      for (let k = 0; k < 2 + Math.floor(rx / 30); k++) { const f = (rng() - 0.5) * 1.6; pads.push([x + c * rx * f, y + s2 * rx * f + (rng() - 0.5) * 8, rng() * 6.28]); }
    }
    for (let k = 0; k < 5; k++) { const a = Math.PI * (0.55 + k * 0.22); reeds.push([cx + Math.cos(a) * (prx + 10), cy + Math.sin(a) * (pry + 10), a]); }
    for (let k = 0; k < 4; k++) pads.push([cx - prx * (0.2 + rng() * 0.6), cy + (rng() - 0.5) * pry * 1.2, rng() * 6.28]);
    // the walkway: a zigzag from the left shore to the middle (the mirror lays the other half)
    const walk = [[cx - prx - 22, cy + pry * 0.12], [cx - prx * 0.55, cy - pry * 0.28], [cx - prx * 0.15, cy + pry * 0.22], [cx, cy + pry * 0.22]];

    api.blob('water', cx, cy, prx, pry);
    api.mirror((m) => {
      m.line('bridge', walk, T.walkway);
      for (const [x, y, rx, a] of puddles) m.water(x - Math.cos(a) * rx, y - Math.sin(a) * rx, x + Math.cos(a) * rx, y + Math.sin(a) * rx, T.puddleRy);
      for (const parts of muds) for (const [x, y, rx, ry] of parts) m.blob('mud', x, y, rx, ry);
      m.blob('mud', smx, smy, smr, smr * 0.75).blob('mud', smx + smr * 0.6, smy + smr * 0.3, smr * 0.55, smr * 0.4);
      for (const [x0, y0, x1, y1] of logs) m.wall(x0, y0, x1, y1, T.logR);
      for (const [x, y] of trees) m.prop('tree', x, y);
      for (const [x, y, a] of reeds) m.deco('reeds', x, y, 1, a);
      for (const [x, y, a] of pads) m.deco('lilypad', x, y, 1, a);
    });
    // the bog monster: eyes peeking out of the left copy of its mud patch
    api.secret(smx, smy, 'eyes');
  },
};
