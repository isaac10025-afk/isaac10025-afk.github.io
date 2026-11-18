// Village map (OURS, Part 2 step 7, STEP7.md MAPS). Owner: MAPS.
// Three little houses per side (wall boxes with a door gap, top-down so no roofs), a fenced pig pen with mud in it,
// garden fences with gaps, a pond in the middle with a footbridge over it, a crop field across the top middle (the
// scarecrow stands in it), an orchard, barrels by the doors, flowers, trees and a dirt path to the bridge.
// The def is default-exported: sim/maps/index.js registers it.

const T = {
  house: 0.075,       // house side = this × short side, clamped below
  houseMin: 84, houseMax: 160,
  houseWall: 12,      // px house wall thickness
  door: 60,           // px door gap (a giant, r 21, must get in and out)
  fence: 3,           // px fence stroke radius (thin)
  fenceOff: 48,       // px from a house's middle-side wall out to its garden fence (a giant walks between)
  fenceRoom: 700,     // garden fences only when the short side is at least this (small fields get too tight for giants)
  pen: 1.3,           // pig pen side = this × house side
  penGate: 60,        // px pen gate gap (a giant must get in)
  pondR: [0.075, 0.12], // pond half sizes × W, × H (landscape)
  pondRP: [0.2, 0.065], // same, phone upright
  footbridge: 13,     // px footbridge stroke radius
  cropRow: 24,        // px between crop rows (the art's crop row is 90 x 20)
  cropStep: 84,       // px between crop stamps along a row
  treeEvery: 32000,   // px² per tree
  treeGap: 32,
  flowerEvery: 70000, // px² per flower patch
  // layouts (left half; mirrored): houses [x, y (× W, × H), door side], pen, orchard, crop field [cx, cy, half w, half h], pond
  land: { houses: [[0.1, 0.27, 's'], [0.3, 0.38, 'e'], [0.12, 0.6, 'e']], road: 2, pen: [0.3, 0.8], orchard: [0.07, 0.88], crops: [0.5, 0.13, 0.13, 0.085], pond: [0.5, 0.58] },
  port: { houses: [[0.2, 0.24, 'e'], [0.27, 0.37, 'e'], [0.2, 0.88, 'n']], road: 1, pen: [0.24, 0.66], orchard: [0.12, 0.56], crops: [0.5, 0.1, 0.38, 0.055], pond: [0.5, 0.5] },
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
  id: 'village',
  ground: 'grass',
  build(api) {
    const { W, H, portrait, short, rng } = api;
    const L = portrait ? T.port : T.land;
    const hs = Math.max(T.houseMin, Math.min(T.houseMax, T.house * short)), ps = hs * T.pen;
    const houses = L.houses.map(([fx, fy, door]) => [Math.max(fx * W, hs / 2 + 56), Math.max(fy * H, hs / 2 + 56), door]);   // a giant fits round them
    const [penX, penY] = [L.pen[0] * W, L.pen[1] * H];
    const [ccx, ccy, chw, chh] = [L.crops[0] * W, L.crops[1] * H, L.crops[2] * W, L.crops[3] * H];
    const [pcx, pcy] = [L.pond[0] * W, L.pond[1] * H], [prx, pry] = (portrait ? T.pondRP : T.pondR).map((f, i) => Math.max(34, f * (i ? H : W)));
    const [ox, oy] = [L.orchard[0] * W, L.orchard[1] * H];
    // keep-outs (left half)
    const boxes = [...houses.map(([x, y]) => [x, y, hs / 2 + 26]), [penX, penY, ps / 2 + 22], [ox + 30, oy - 20, 60]];
    const inBox = (x, y) => boxes.some(([bx, by, r]) => Math.abs(x - bx) < r && Math.abs(y - by) < r);
    const inPond = (x, y, pad) => ((x - pcx) / (prx + pad)) ** 2 + ((y - pcy) / (pry + pad)) ** 2 < 1;
    const inCrops = (x, y, pad) => Math.abs(x - ccx) < chw + pad && Math.abs(y - ccy) < chh + pad;
    const roadY = pcy, [rhx, rhy] = houses[L.road], onRoad = (x, y) => x > rhx && x < pcx && Math.abs(y - (rhy + (roadY - rhy) * Math.max(0, Math.min(1, (x - rhx) / Math.max(1, pcx - prx - rhx))))) < 30;
    const free = (x, y, pad = 0) => x > 14 && y > 14 && y < H - 14 && x < W / 2 - 18 && !inBox(x, y) && !inPond(x, y, 30 + pad) && !inCrops(x, y, 16 + pad) && !onRoad(x, y);
    const trees = [];
    // orchard: a little grid of trees
    const og = hs * 0.55;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const x = ox + i * og, y = oy - j * og; if (x > 14 && y > 14 && y < H - 14 && x < W / 2 - 20 && !inPond(x, y, 20)) trees.push([x, y]); }
    scatter(rng, Math.round((W / 2) * H / T.treeEvery), 14, 14, W / 2 - 18, H - 14, (x, y) => free(x, y, 8), T.treeGap, trees);
    const flowers = scatter(rng, Math.round((W / 2) * H / T.flowerEvery) + 2, 20, 20, W / 2 - 20, H - 20, (x, y) => free(x, y) && !trees.some(([a, b]) => Math.hypot(x - a, y - b) < 22), 46).map(([x, y]) => [x, y, rng() * 6.28]);

    // the pond (middle, painted once) and its footbridge
    api.blob('water', pcx, pcy, prx, pry);
    api.mirror((m) => {
      m.bridge(pcx - prx - 18, pcy, pcx, pcy, T.footbridge);
      // houses: wall box, door gap, a barrel or two by the door
      for (const [x, y, door] of houses) {
        const side = { s: [0.5, hs / 2 + 12, 0], e: [0.5, 0, hs / 2 + 12], n: [0.5, -hs / 2 - 12, 0] }[door];
        m.box('wall', x - hs / 2, y - hs / 2, hs, hs, T.houseWall, [[door, 0.5, T.door + T.houseWall]]);   // + the wall: round stroke ends
        const [dx, dy] = door === 'e' ? [hs / 2 + 14, -T.door / 2 - 12] : [T.door / 2 + 14, side[1]];
        m.prop('barrel', x + dx, y + dy);
        if (door === 'e') m.prop('barrel', x + dx + 2, y + T.door / 2 + 14);
        m.deco('flowers', x - hs / 2 - 14, y + hs / 2 - 6, 0.8, 0);
      }
      // pig pen: fence box with a gate toward the middle, mud inside
      m.mud(penX - ps * 0.3, penY, penX + ps * 0.3, penY, ps * 0.24);
      m.box('wall', penX - ps / 2, penY - ps / 2, ps, ps, T.fence * 2, [['e', 0.5, T.penGate + T.fence * 2]]);
      // garden fences with gaps: along the side of each house's yard
      for (const [x, y, door] of houses) {
        // two short bits with a wide gate between them (giants walk through), never close to the field edge
        const fy = y + (door === 'n' ? -hs / 2 - T.fenceOff : hs / 2 + T.fenceOff), len = hs * 0.4, gate = T.door + 16;
        if (fy < 50 || fy > H - 50 || short < T.fenceRoom) continue;
        m.wall(Math.max(50, x - gate / 2 - len), fy, x - gate / 2, fy, T.fence).wall(x + gate / 2, fy, x + gate / 2 + len, fy, T.fence);
      }
      // a dirt path from a house door to the bridge
      const [hx, hy] = houses[L.road], x0 = hx + hs / 2 + 30, x1 = pcx - prx - 26, len = Math.hypot(x1 - x0, roadY - hy), a = Math.atan2(roadY - hy, x1 - x0);
      for (let d = 0; d <= len; d += 30) m.deco('path', x0 + (x1 - x0) * d / len, hy + (roadY - hy) * d / len, 1, a);
      for (const [x, y] of trees) m.prop('tree', x, y);
      for (const [x, y, a2] of flowers) m.deco('flowers', x, y, 1, a2);
    });
    // the crop field across the top middle (rows of plants), a fence on its outer sides with a gap
    const rows = Math.max(2, Math.floor((chh * 2) / T.cropRow));
    for (let r = 0; r < rows; r++) {
      const y = ccy - chh + T.cropRow / 2 + r * ((chh * 2 - T.cropRow) / Math.max(1, rows - 1));
      const n = Math.max(1, Math.round((chw * 2 - 90) / T.cropStep) + 1), step = n > 1 ? (chw * 2 - 90) / (n - 1) : 0;
      for (let k = 0; k < n; k++) api.deco('crop', n > 1 ? ccx - chw + 45 + k * step : ccx, y, 1, 0);
    }
    api.mirror((m) => {
      const fx = ccx - chw - 10;
      m.wall(fx, Math.max(56, ccy - chh * 0.2), fx, ccy + chh + 6, T.fence);   // the lower side only: open at the top
    });
    api.secret(ccx - Math.min(chw * 0.35, 60), ccy + 4, 'field');
  },
};
