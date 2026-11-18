// Sprite sheet page (art-sheet.html): every type in every colour + pose, big and at game size.
// ?only=army|animals|myth  ?type=rifle  ?scale=3
// ?more=1: also every extra pose, a risen copy (idle, walk0, dead), hatless and kindled frames, and extras in the crowd.
// ?extra=1 also shows each entry's `extra` poses; ?risen=1 adds risen (zombie copy) frames (?risen=bone: skeleton copies); ?time=1 puts the slowest paint (ms) in the label
import { C, rng, hash, M0, tooth, grainTile, grainFill, TEAM_COL } from './paint.js';
const Q = new URLSearchParams(location.search);
const ONLY = Q.get('only'), ONE = Q.get('type'), BIG = +(Q.get('scale') || 3), MORE = Q.get('more') === '1';
const EXTRA = Q.has('extra'), RISEN = Q.has('risen') && (Q.get('risen') === 'bone' ? 'bone' : true), TIME = Q.has('time');
const MODS = { army: './sprites-army.js', animals: './sprites-animals.js', myth: './sprites-myth.js' };
MODS.pirates = './sprites-pirates.js';   // STEP4 PIRATES: ?only=pirates
MODS.dinos = './sprites-dinos.js';   // STEP4 DINOS: ?only=dinos
MODS.siege = './sprites-siege.js';   // STEP4 SIEGE: ?only=siege
for (const t of ['robots', 'space', 'ocean', 'sports', 'bugs', 'bosses', 'secret']) MODS[t] = `./sprites-${t}.js`;   // STEP6: ?only=<tab>
const errs = [], slow = {};
function bakeOne(e, type, col, pose, v, dead, k, fl = false) { // fl: risen (bool) or { risen, hatless, kindled } (?more=1)
  const f = typeof fl === 'object' ? fl : { risen: fl }, risen = f.risen === 'bone' ? 'bone' : !!f.risen, hatless = f.hatless ? 1 : 0, kindled = f.kindled ? 1 : 0;
  const [w, h, ax, ay] = e.box, cv = document.createElement('canvas');
  cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.setTransform(k, 0, 0, k, ax * k, ay * k);
  const seed = hash(`${type}|${col}|${pose}|${v}|${dead}${risen ? '|r' : ''}${hatless ? '|h' : ''}${kindled ? '|k' : ''}`), R = rng(seed);
  const t0 = performance.now();
  try { e.paint(c, { R, M: M0(R), pose, col, dead, risen, hatless, kindled, v, type }); } catch (err) { errs.push(type + ' ' + pose + ': ' + err.message); }
  const ms = performance.now() - t0; if (!(slow[type] >= ms)) slow[type] = ms;
  tooth(c, -ax, -ay, w, h, seed);
  return cv;
}
async function main() {
  const root = document.getElementById('root');
  const paper = grainTile(C.paper, C.paperL, '#e9dcc0', 31, 160, 0.12, 0.18);
  document.body.style.background = `url(${paper.toDataURL()})`;
  for (const [name, path] of Object.entries(MODS)) {
    if (ONLY && ONLY !== name) continue;
    let mod; try { mod = await import(path); } catch (e) { const p = document.createElement('p'); p.textContent = `${name}: ${e.message}`; root.append(p); continue; }
    const S = mod.SPRITES || {};
    const h2 = document.createElement('h2'); h2.textContent = name; root.append(h2);
    for (const [type, e] of Object.entries(S)) {
      if (ONE && ONE !== type) continue;
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('b'); lab.textContent = type; row.append(lab);
      const cols = [e.own || C.grey, ...TEAM_COL];
      const poses = EXTRA ? [...e.poses, ...(e.extra || [])] : e.poses;
      for (const col of cols) for (const pose of poses) row.append(bakeOne(e, type, col, pose, 0, false, BIG * (e.scale || 1)));
      row.append(bakeOne(e, type, cols[0], e.poses[0], 0, 'dead', BIG * (e.scale || 1)));
      row.append(bakeOne(e, type, cols[0], e.poses[0], 0, 'burnt', BIG * (e.scale || 1)));
      if (MORE) {
        const k = BIG * (e.scale || 1);
        for (const pose of e.extra || []) row.append(bakeOne(e, type, cols[0], pose, 0, false, k));
        for (const [pose, dead] of [[e.poses[0], false], ['walk0', false], [e.poses[0], 'dead']]) row.append(bakeOne(e, type, cols[1], pose, 0, dead, k, { risen: true }));
        row.append(bakeOne(e, type, cols[2], e.poses[0], 0, false, k, { hatless: true }));
        row.append(bakeOne(e, type, cols[2], (e.extra || []).includes('draw') ? 'draw' : e.poses[0], 0, false, k, { kindled: true }));
      }
      if (RISEN) { for (const pose of poses) row.append(bakeOne(e, type, cols[0], pose, 0, false, BIG * (e.scale || 1), RISEN));
        row.append(bakeOne(e, type, cols[0], e.poses[0], 0, 'dead', BIG * (e.scale || 1), RISEN)); }
      // game size: 2.15 device px per sim px, a little crowd of 8 (both teams), 3 boil variants
      const cp = MORE ? [...e.poses, ...(e.extra || [])] : e.poses, nc = MORE ? Math.max(8, cp.length * 2) : 8;
      const crowd = document.createElement('canvas'), gk = 2.15 * (e.scale || 1), cw = nc * e.box[0] * 0.8 * gk + 20;
      crowd.width = cw; crowd.height = e.box[1] * gk + 10; crowd.className = 'crowd';
      const cc = crowd.getContext('2d');
      for (let i = 0; i < nc; i++) { const s = bakeOne(e, type, TEAM_COL[i & 1], cp[(MORE ? i >> 1 : i) % cp.length], i % 3, false, gk);
        cc.save(); const x = 10 + i * e.box[0] * 0.8 * gk; if (i & 1) { cc.translate(x + s.width, 0); cc.scale(-1, 1); cc.drawImage(s, 0, 5); } else cc.drawImage(s, x, 5); cc.restore(); }
      row.append(crowd);
      if (TIME) lab.textContent = `${type} ${slow[type].toFixed(1)}ms`;
      root.append(row);
    }
  }
  if (errs.length) { const p = document.createElement('pre'); p.textContent = errs.join('\n'); root.append(p); }
  window.__errs = errs; window.__done = true;
}
main();
