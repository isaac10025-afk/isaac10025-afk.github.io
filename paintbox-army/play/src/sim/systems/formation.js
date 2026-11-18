// Formation: drilled groups (Roman) wheel, march and relay their slots. OG core-move §5 (system game.js:4817-4864,
// layout game.js:3239-3311).
import { DT, angleDiff, turnToward } from '../const.js';
import { getDef } from '../defs.js';

const members = [], along = new Map(), across = new Map();

// Lay out slots for group g. initial = true on stroke release: pick the front from the blob's principal axis (OG game.js:3249-3284).
export function layoutFormation(world, g, initial) {
  const gs = world.groups, us = world.units;
  members.length = 0;
  for (let i = 0; i < us.length; i++) { const u = us[i]; if (!u.dead && u.group === g) members.push(u); }
  const n = members.length; gs.laidOut[g] = n;
  if (n === 0) return;
  const def = getDef(gs.type[g]), bs = def.brushSpacing, sp = 1.06 * bs; // slot spacing (OG game.js:3246)
  let mx = 0, my = 0;
  for (const u of members) { mx += u.x; my += u.y; }
  mx /= n; my /= n;
  if (initial) {
    let sxx = 0, syy = 0, sxy = 0, hx = 0, hy = 0;
    for (const u of members) { const dx = u.x - mx, dy = u.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; hx += Math.cos(u.heading); hy += Math.sin(u.heading); }
    const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy), ca = Math.cos(axis), sa = Math.sin(axis);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const u of members) { const dx = u.x - mx, dy = u.y - my, a = dx * ca + dy * sa, b = -dx * sa + dy * ca; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
    const longE = a1 - a0 + sp, shortE = b1 - b0 + sp, meanH = Math.atan2(hy, hx);
    if (longE >= 1.4 * shortE) { // a line: face across the long axis, on the side nearest the mean heading
      const perp = axis + Math.PI / 2;
      gs.front[g] = Math.abs(angleDiff(perp, meanH)) <= Math.PI / 2 ? perp : perp + Math.PI;
      gs.files[g] = Math.max(1, Math.min(n, Math.round((a1 - a0) / bs) + 1));
    } else { gs.front[g] = meanH; gs.files[g] = Math.ceil(Math.sqrt(n)); }
  }
  // Ranks of `files`, sorted front to back, left to right; slots centred (OG game.js:3285-3310).
  const files = Math.max(1, Math.min(gs.files[g], n)), ranks = Math.ceil(n / files), fc = Math.cos(gs.front[g]), fs = Math.sin(gs.front[g]);
  along.clear(); across.clear();
  for (const u of members) { const dx = u.x - mx, dy = u.y - my; along.set(u, dx * fc + dy * fs); across.set(u, -dx * fs + dy * fc); }
  members.sort((a, b) => along.get(b) - along.get(a));
  let sx = 0, sy = 0;
  for (let r = 0; r < ranks; r++) {
    const row = members.slice(r * files, (r + 1) * files).sort((a, b) => across.get(a) - across.get(b));
    for (let k = 0; k < row.length; k++) {
      const u = row[k];
      u.slotX = ((ranks - 1) / 2 - r) * sp; u.slotY = (k - (row.length - 1) / 2) * sp;
      sx += u.slotX; sy += u.slotY;
    }
  }
  sx /= n; sy /= n;
  for (const u of members) { u.slotX -= sx; u.slotY -= sy; }
}

export function run(world) {
  const gs = world.groups, dt = DT;
  for (let g = 0, n = gs.highWater; g < n; g++) {
    if (gs.alive[g] === 0 || gs.drilled[g] === 0 || gs.size[g] === 0) continue;
    if (gs.charging[g] === 1) { // charge ends 3 s after contact with nobody engaged; turn to intel, relay (OG game.js:4823-4831)
      gs.marching[g] = 0; gs.wheeling[g] = 0;
      if (gs.contactAge[g] > 3 && gs.inContact[g] === 0) {
        gs.charging[g] = 0;
        if (gs.hasIntel[g] === 1) gs.front[g] = Math.atan2(gs.intelY[g] - gs.cy[g], gs.intelX[g] - gs.cx[g]);
        layoutFormation(world, g, false);
      }
      continue;
    }
    if (gs.size[g] < gs.laidOut[g] && world.tick % 12 === g % 12) layoutFormation(world, g, false); // relay after losses (OG game.js:4833)
    let hasObj = true; // objective: contact < 5 s old, else intel (OG game.js:4834-4839)
    if (gs.contactAge[g] < 5) { gs.objX[g] = gs.contactX[g]; gs.objY[g] = gs.contactY[g]; }
    else if (gs.hasIntel[g] === 1) { gs.objX[g] = gs.intelX[g]; gs.objY[g] = gs.intelY[g]; }
    else hasObj = false;
    const ox = gs.objX[g] - gs.cx[g], oy = gs.objY[g] - gs.cy[g], objAng = Math.atan2(oy, ox), k = Math.min(1, dt / 0.5);
    gs.calmPressureX[g] += (gs.pressureX[g] - gs.calmPressureX[g]) * k;           // OG game.js:4843-4847
    gs.calmPressureY[g] += (gs.pressureY[g] - gs.calmPressureY[g]) * k;
    gs.calmPressureTotal[g] += (gs.pressureTotal[g] - gs.calmPressureTotal[g]) * k;
    const px = gs.calmPressureX[g], py = gs.calmPressureY[g], pm = Math.sqrt(px * px + py * py), total = gs.calmPressureTotal[g], pressed = pm > 0.6;
    if (pressed && !(pm >= 0.35 * total)) gs.wheeling[g] = 0;                      // threats from all round (OG game.js:4848)
    else if (pressed || hasObj) {
      const want = pressed ? Math.atan2(py, px) : objAng, off = Math.abs(angleDiff(gs.front[g], want));
      if (off > 0.35) gs.wheeling[g] = 1; else if (off < 0.04) gs.wheeling[g] = 0;   // OG game.js:4852-4853
      if (gs.wheeling[g] === 1) gs.front[g] = turnToward(gs.front[g], want, (gs.inContact[g] === 1 ? 0.4 : 0.9) * dt); // OG game.js:4854-4857
    }
    const facing = Math.abs(angleDiff(gs.front[g], objAng)) < 0.3;
    gs.marching[g] = hasObj && gs.inContact[g] === 0 && facing && ox * ox + oy * oy > 576 ? 1 : 0; // OG game.js:4861-4862
  }
}
