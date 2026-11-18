// The unit maker panel (OURS, Part 2 step 8, STEP8.md). Owner: UI.
// One painted kraft board over the field, no scrolling on any screen: a live preview of the unit on a painted stage
// (ART-BODY's MINE.preview; until it lands a plain painted stand-in) and the rows: body (4 pictures), size (5 dots),
// health (10 steps, 10-6000), speed (7 steps), weapon (a chip: icon + name), 2 abilities (2 chips; an empty one shows a
// +), hat (a chip with the hat's name) + 12 colours, the name (tap to type, phone keyboard, max 16), Save / Delete / X.
// Weapon, ability and hat chips open a picker grid that fills the board (the caption on top names the current pick):
// weapons grouped by catalogue group, abilities by kind (one card colour per group), only what is built
// (readyWeapons / readyAbilities; ?makerall = every catalogue row, for shots and tests before the modules land). A second
// move ability replaces the first. Icons: ART-WEAPONS' / ART-ABILITY's ICON[id]; until one lands, the catalogue name on
// the painted card.
// Layout: two fixed designs (portrait 304 x 552, landscape 560 x 320 CSS px; index.html .maker-sheet.port / .land),
// whichever comes out bigger, scaled as a whole to fit the screen (transform: scale, at most T.MAX_K): every row keeps
// its shape on every screen and both languages, and nothing can scroll. Long words shrink to fit their box.
// Save (main.js onSave) = cleanRecipe -> store -> registerMade -> forgetType -> clearMadeUnits (edit) -> toolbar
// refresh -> that unit picked. Delete: the first tap arms it ("Delete it?"), a second tap within T.ARM_MS deletes.
import { WEAPONS, ABILITIES, BODY_IDS, BODY_NAMES, SIZES, HP_STEPS, SPEED_STEPS, COLORS, HATS, HAT_NAMES } from '../sim/maker/catalog.js';
import { MINE, ICON } from '../render/art/mine-hooks.js';
import { t, getLang } from './strings.js';

const T = {
  PORT: [304, 552],   // css px: the portrait design (fits a 320 x 568 phone at scale 1 with T.EDGE round it)
  LAND: [560, 320],   // css px: the landscape design (a 568 x 320 phone on its side: scale 0.95)
  EDGE: 8,            // css px kept free to the screen edge (plus the safe area)
  MAX_K: 1.6,         // biggest scale (desktop): bigger reads like a poster, not a form
  ARM_MS: 3000,       // ms the armed Delete waits for its second tap
  FPS: 30,            // preview frames per second (a phone's battery)
  CELL_GAP: 5,        // css px between picker cells
  CELL_MAX: [76, 70], // css px: biggest weapon / ability card
  HAT_MAX: [100, 96], // css px: biggest hat card (12 of them: the unit wearing each hat)
  CELL_ASPECT: [0.8, 1.5], // picker cell width / height kept inside this
  ICON_K: 0.8,        // picker icon = this share of the cell
  NAME_MIN: 8,        // css px: smallest a long word shrinks to
};
const KIND_ORDER = ['move', 'act', 'support', 'passive', 'death']; // ability picker blocks (catalogue order inside each)
const W_ROW = new Map(WEAPONS.map((r) => [r.id, r]));
const A_ROW = new Map(ABILITIES.map((r) => [r.id, r]));
const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const SHOW_ALL = QS.has('makerall');

/** Which design and how big, for a w x h box (css px). Exported for tests. */
export function makerLayout(w, h) {
  const kp = Math.min(w / T.PORT[0], h / T.PORT[1]), kl = Math.min(w / T.LAND[0], h / T.LAND[1]);
  const land = Math.min(kl, T.MAX_K) > Math.min(kp, T.MAX_K) + 1e-6 || (Math.min(kl, T.MAX_K) >= Math.min(kp, T.MAX_K) - 1e-6 && w > h);
  const [bw, bh] = land ? T.LAND : T.PORT;
  return { land, w: bw, h: bh, k: Math.min(land ? kl : kp, T.MAX_K) };
}
/** The biggest picker grid for n cells in a w x h box (css px, gap between cells, biggest card max = [w, h]). Equal
 *  card sizes: the grid whose shape is nearest the box's wins (12 hats: 3 x 4, not a 2 x 6 strip). Exported for tests. */
export function layOutCells(n, w, h, gap = T.CELL_GAP, max = T.CELL_MAX) {
  let best = null;
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    let cw = Math.min((w - (cols - 1) * gap) / cols, max[0]), ch = Math.min((h - (rows - 1) * gap) / rows, max[1]);
    if (cw <= 0 || ch <= 0) continue;
    cw = Math.min(cw, ch * T.CELL_ASPECT[1]); ch = Math.min(ch, cw / T.CELL_ASPECT[0]);
    const score = Math.floor(Math.min(cw, ch) * 2) / 2, off = Math.abs(Math.log((rows * ch) / (cols * cw) / (h / w)));
    if (!best || score > best.score || (score === best.score && off < best.off)) best = { cols, rows, cw: Math.floor(cw), ch: Math.floor(ch), score, off };
  }
  return best || { cols: 1, rows: n, cw: 10, ch: 10, score: 0, off: 0 };
}

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function safeArea() {
  const p = document.getElementById('safe-probe'); if (!p) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(p);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
const nm = (row) => (row ? (getLang() === 'zh' ? row.zh : row.en) : '');
const pair = (p) => (p ? p[getLang() === 'zh' ? 1 : 0] : '');
const closeSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** A long word shrinks (font size) until it fits its box; lines = how many lines it may use. */
function fit(el, lines = 1) {
  el.style.fontSize = '';
  if (!el.isConnected || !el.offsetParent) return;
  let fs = parseFloat(getComputedStyle(el).fontSize);
  for (let k = 0; k < 14 && fs > T.NAME_MIN && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1); k++) {
    fs = Math.max(T.NAME_MIN, fs * 0.9); el.style.fontSize = `${fs.toFixed(1)}px`;
  }
  void lines;
}

/**
 * opts: { root, maker: sim/maker/index.js (cleanRecipe, newRecipe, isMoveAbility, readyWeapons, readyAbilities),
 *         store: ui/mine.js store, onSave(recipe, isNew), onDelete(recipe), onOpenChange(open), sound() }
 */
export function createMaker(opts) {
  const { root, maker, store, onSave, onDelete, onOpenChange, sound } = opts;
  const play = () => { if (sound) { try { sound(); } catch (e) { /* no sound */ } } };
  const back = h('div', 'maker'); back.id = 'maker'; back.hidden = true;
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  const sheet = h('div', 'maker-sheet port'); sheet.tabIndex = -1;
  back.append(sheet); root.append(back);

  // ---- stage (live preview) ----
  const stage = h('div', 'mk-stage'); const stageCv = h('canvas', 'mk-stage-cv'); stageCv.setAttribute('aria-hidden', 'true'); stage.append(stageCv);
  const close = h('button', 'round-button mk-close'); close.type = 'button'; close.innerHTML = closeSvg;
  // ---- name ----
  const nameBox = h('label', 'mk-name'); const nameIn = h('input', 'mk-name-in'); nameIn.type = 'text'; nameIn.maxLength = 16;
  nameIn.autocomplete = 'off'; nameIn.spellcheck = false; nameIn.setAttribute('enterkeyhint', 'done'); nameIn.setAttribute('autocapitalize', 'words');
  const pencil = h('i', 'mk-pencil'); pencil.setAttribute('aria-hidden', 'true');
  nameBox.append(nameIn, pencil);
  // ---- body ----
  const bodyRow = h('div', 'mk-body'); bodyRow.setAttribute('role', 'radiogroup');
  const bodyBtns = BODY_IDS.map((id) => {
    const b = h('button', 'mk-cell mk-bodybtn'); b.type = 'button'; b.dataset.body = id; b.setAttribute('role', 'radio');
    const cv = h('canvas', 'mk-bodycv'); cv.setAttribute('aria-hidden', 'true'); b.append(cv);
    const word = h('span', 'mk-bodyword'); word.setAttribute('aria-hidden', 'true'); b.append(word); // the plain look (?debug) only
    b.addEventListener('click', () => { if (draft.body === id) return; draft.body = id; play(); sync(); }); // the health step stays
    bodyRow.append(b); return { id, b, cv };
  });
  // ---- tracks: size (dots), health, speed (steps filled up to the pick) ----
  function track(cls, n, key, icon) {
    const el = h('div', `mk-track ${cls}`); el.tabIndex = 0; el.setAttribute('role', 'slider');
    el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', String(n - 1));
    if (icon) { const i = h('i', `mk-tico ${icon}`); i.setAttribute('aria-hidden', 'true'); el.append(i); }
    const steps = h('span', 'mk-steps'); const segs = [];
    for (let i = 0; i < n; i++) { const s = h('i', 'mk-seg'); s.style.setProperty('--i', i); steps.append(s); segs.push(s); }
    el.append(steps);
    const val = cls === 'mk-size' ? null : h('b', 'mk-val'); if (val) el.append(val);
    const setFrom = (x) => {
      const r = steps.getBoundingClientRect(); if (!r.width) return;
      const i = Math.max(0, Math.min(n - 1, Math.floor((x - r.left) / r.width * n)));
      if (draft[key] !== i) { draft[key] = i; sync(); }
    };
    let pid = null;
    el.addEventListener('pointerdown', (e) => { pid = e.pointerId; try { el.setPointerCapture(pid); } catch (er) { /* old browser */ } setFrom(e.clientX); e.preventDefault(); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) setFrom(e.clientX); });
    const up = (e) => { if (e.pointerId === pid) { pid = null; play(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
      if (!d) return; e.preventDefault(); e.stopPropagation();
      const i = Math.max(0, Math.min(n - 1, draft[key] + d)); if (i !== draft[key]) { draft[key] = i; sync(); }
    });
    return { el, segs, val, n, key };
  }
  const tSize = track('mk-size', SIZES.length, 'size', null);
  const tHp = track('mk-hp', HP_STEPS.length, 'hp', 'heart');
  const tSpeed = track('mk-speed', SPEED_STEPS.length, 'speed', 'speed');
  // ---- weapon + ability chips ----
  function chip(cls) {
    const b = h('button', `mk-cell mk-chip ${cls}`); b.type = 'button';
    const ic = h('span', 'mk-chip-ico'); const tx = h('span', 'mk-chip-name');
    b.append(ic, tx); return { b, ic, tx };
  }
  const wChip = chip('mk-weapon');
  wChip.b.addEventListener('click', () => { play(); openPick('weapon'); });
  const abilRow = h('div', 'mk-abil');
  const aChips = [0, 1].map((s) => { const c = chip('mk-ability'); c.b.dataset.slot = s; c.b.addEventListener('click', () => { play(); openPick('ability', s); }); abilRow.append(c.b); return c; });
  // ---- hat + colours ----
  const lookRow = h('div', 'mk-look');
  const hatChip = chip('mk-hat'); hatChip.b.addEventListener('click', () => { play(); openPick('hat'); });
  const colorBox = h('div', 'mk-colors'); colorBox.setAttribute('role', 'radiogroup');
  const swatches = COLORS.map((col, i) => {
    const b = h('button', 'mk-swatch'); b.type = 'button'; b.style.setProperty('--sw', col); b.style.setProperty('--sw-img', `var(--img-sw-c${i})`);
    b.setAttribute('role', 'radio'); b.dataset.color = i;
    b.addEventListener('click', () => { if (draft.color === i) return; draft.color = i; play(); sync(); });
    colorBox.append(b); return b;
  });
  lookRow.append(hatChip.b, colorBox);
  // ---- Save / Delete ----
  const btns = h('div', 'mk-buttons');
  const del = h('button', 'big-button secondary mk-del'); del.type = 'button';
  const save = h('button', 'big-button mk-save'); save.type = 'button';
  btns.append(del, save);
  // ---- picker ----
  const cap = h('div', 'mk-cap'); const capIco = h('span', 'mk-cap-ico'); const capName = h('span', 'mk-cap-name'); cap.append(capIco, capName);
  const grid = h('div', 'mk-grid'); grid.setAttribute('role', 'listbox');
  sheet.append(stage, nameBox, bodyRow, tSize.el, tHp.el, tSpeed.el, wChip.b, abilRow, lookRow, btns, cap, grid, close);

  // ---- state ----
  let open = false, isNew = true, draft = null, pick = null, armT = 0, armed = false, lay = null, raf = 0, last = 0, t0 = 0;

  const ready = (kind) => {
    if (SHOW_ALL) return (kind === 'weapon' ? WEAPONS : ABILITIES).map((r) => r.id);
    try { return kind === 'weapon' ? maker.readyWeapons() : maker.readyAbilities(); } catch (e) { return []; }
  };

  // ---- icons: ICON[id] painted on a canvas at the box's device size; until it lands, the name on the card ----
  function iconInto(box, id, wCss, hCss, label) {
    const fn = ICON[id], key = `${id}|${wCss}|${hCss}|${lay ? lay.k : 1}|${draft ? draft.color : ''}|${typeof fn}|${getLang()}`;
    if (box.dataset.k === key && box.firstChild) return !box.classList.contains('txt'); // same picture: keep it (a track drag syncs every step)
    box.dataset.k = key;
    box.replaceChildren();
    if (typeof fn === 'function') {
      const dpr = Math.min(devicePixelRatio || 1, 3) * (lay ? lay.k : 1), cv = h('canvas');
      cv.width = Math.max(1, Math.round(wCss * dpr)); cv.height = Math.max(1, Math.round(hCss * dpr)); cv.setAttribute('aria-hidden', 'true');
      try { const c = cv.getContext('2d'); fn(c, cv.width, cv.height, draft ? COLORS[draft.color] : undefined); box.append(cv); box.classList.remove('txt'); return true; } // 4th arg: the unit's colour (weapon accents)
      catch (e) { console.warn('maker icon', id, e); }
    }
    if (label != null) { const s = h('span', 'mk-ico-txt', label); box.append(s); box.classList.add('txt'); }
    return false;
  }
  // stills of the unit (body / hat cards): MINE.preview at t = 0 on a scratch canvas, cropped to the painted pixels and
  // fitted to the card (the preview frames every body at one scale: a person came out tiny). MINE.preview bakes a recipe
  // a few ms per call into ONE shared cache and says when it is done, so stills are painted from a queue in the preview
  // loop, one at a time until each is done; the stage waits meanwhile (its last frame stays on screen).
  let scratch = null;
  const stills = [];
  function queueStill(cv, recipe, wCss, hCss) {
    const dpr = Math.min(devicePixelRatio || 1, 3) * (lay ? lay.k : 1);
    cv.width = Math.max(1, Math.round(wCss * dpr)); cv.height = Math.max(1, Math.round(hCss * dpr));
    for (let i = stills.length - 1; i >= 0; i--) if (stills[i].cv === cv) stills.splice(i, 1);
    stills.push({ cv, recipe: { ...recipe, abilities: recipe.abilities.slice() }, tries: 0 });
    if (open && !raf) raf = requestAnimationFrame(loop);
  }
  function paintStill(job) {
    const cv = job.cv, sw = cv.width * 2, sh = cv.height * 2;
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== sw || scratch.height !== sh) { scratch.width = sw; scratch.height = sh; }
    const g = scratch.getContext('2d', { willReadFrequently: true });
    let done = false;
    try { done = MINE.preview(g, job.recipe, sw, sh, 0) !== false; } catch (e) { console.warn('maker still', e); return true; }
    if (!done && ++job.tries < 120) return false;
    const d = g.getImageData(0, 0, sw, sh).data;
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y += 2) for (let x = 0; x < sw; x += 2) if (d[(y * sw + x) * 4 + 3] > 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    if (x1 < x0) return true;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(sw - 1, x1 + 2); y1 = Math.min(sh - 1, y1 + 2);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(cv.width * 0.94 / bw, cv.height * 0.92 / bh);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(scratch, x0, y0, bw, bh, (cv.width - bw * k) / 2, (cv.height - bh * k) / 2, bw * k, bh * k);
    return true;
  }
  function pumpStills(budget) {
    const t1 = performance.now();
    while (stills.length && performance.now() - t1 < budget) { if (paintStill(stills[0])) stills.shift(); else break; }
  }

  // ---- the live preview: painted on a buffer, shown once the recipe's parts are baked (the last frame stays meanwhile,
  // so a tap on a row never blanks the stage) ----
  const stageBuf = document.createElement('canvas');
  function drawStage(now) {
    const c = stageCv.getContext('2d'), w = stageCv.width, hh = stageCv.height;
    const tt = (now - t0) / 1000;
    if (typeof MINE.preview === 'function') {
      if (stills.length) return; // the shared preview cache is busy with the stills
      if (stageBuf.width !== w || stageBuf.height !== hh) { stageBuf.width = w; stageBuf.height = hh; }
      try {
        const g = stageBuf.getContext('2d');
        if (MINE.preview(g, draft, w, hh, tt) !== false) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, hh); c.drawImage(stageBuf, 0, 0); }
        return;
      } catch (e) { console.warn('maker preview', e); }
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, hh);
    standIn(c, w, hh, tt);
  }
  // until ART-BODY's preview lands: a plain painted body in the picked colour, scaled by size, the weapon's icon beside it
  function standIn(c, w, hh, tt) {
    const k = Math.min(w, hh) / 120, s = SIZES[draft.size], R = { person: 9, animal: 12, beast: 17, giant: 19 }[draft.body] * 1.6 * s * k;
    const cx = w / 2, gy = hh * 0.8, bob = Math.sin(tt * 4) * 2 * k, col = COLORS[draft.color];
    c.fillStyle = 'rgba(28,25,22,0.25)'; c.beginPath(); c.ellipse(cx, gy, R * 1.1, R * 0.32, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = Math.max(2, 2.4 * k); c.strokeStyle = '#1c1916'; c.fillStyle = col;
    const four = draft.body === 'animal' || draft.body === 'beast';
    c.beginPath();
    if (four) c.ellipse(cx, gy - R * 0.9 + bob, R * 1.35, R * 0.8, 0, 0, Math.PI * 2); else c.ellipse(cx, gy - R * 1.2 + bob, R * 0.75, R * 1.15, 0, 0, Math.PI * 2);
    c.fill(); c.stroke();
    const hx = four ? cx + R * 1.2 : cx, hy = four ? gy - R * 1.3 + bob : gy - R * 2.5 + bob;
    c.beginPath(); c.arc(hx, hy, R * 0.55, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#1c1916'; c.beginPath(); c.arc(hx + R * 0.2, hy - R * 0.08, Math.max(1.5, R * 0.1), 0, Math.PI * 2); c.fill();
    const fn = ICON[draft.weapon];
    if (typeof fn === 'function') {
      const iw = Math.max(20, R * 1.4), ih = iw * 0.8;
      c.save(); c.translate(cx + (four ? -R * 2.4 : R * 0.7), gy - R * 1.4 - ih / 2 + bob);
      try { fn(c, iw, ih, col); } catch (e) { /* icon broke */ }
      c.restore();
    }
  }
  function loop(now) {
    raf = 0;
    if (!open) return;
    raf = requestAnimationFrame(loop);
    if (stills.length) { pumpStills(12); return; }
    if (now - last < 1000 / T.FPS - 2) return;
    last = now;
    drawStage(now);
  }

  // ---- fill the rows from the draft ----
  function sync() {
    if (!draft) return;
    // body
    for (const bb of bodyBtns) { const on = draft.body === bb.id; bb.b.classList.toggle('on', on); bb.b.setAttribute('aria-checked', String(on)); }
    // tracks
    for (const tr of [tSize, tHp, tSpeed]) {
      const v = draft[tr.key];
      tr.segs.forEach((s, i) => { s.classList.toggle('on', tr === tSize ? i === v : i <= v); s.classList.toggle('hi', i === v); });
      tr.el.setAttribute('aria-valuenow', String(v));
      if (tr.val) tr.val.textContent = tr === tHp ? String(HP_STEPS[v]) : `×${SPEED_STEPS[v]}`;
      tr.el.setAttribute('aria-valuetext', tr === tHp ? String(HP_STEPS[v]) : tr === tSpeed ? `×${SPEED_STEPS[v]}` : `×${SIZES[v]}`);
    }
    // weapon + abilities
    const wr = W_ROW.get(draft.weapon);
    wChip.b.dataset.group = wr ? wr.group : 'plain';
    wChip.tx.textContent = nm(wr);
    if (lay) iconInto(wChip.ic, draft.weapon, chipIcon()[0], chipIcon()[1], null);
    aChips.forEach((c, s) => {
      const id = draft.abilities[s], ar = id ? A_ROW.get(id) : null;
      c.b.dataset.group = ar ? ar.kind : 'plain';
      c.b.classList.toggle('empty', !ar);
      c.tx.textContent = ar ? nm(ar) : '';
      c.b.setAttribute('aria-label', ar ? `${t('m_ability')}: ${nm(ar)}` : `${t('m_ability')}: ${t('m_none')}`);
      if (lay) { if (ar) iconInto(c.ic, id, chipIcon()[0], chipIcon()[1], null); else c.ic.replaceChildren(); }
      c.b.hidden = s === 1 && draft.abilities.length === 0; // the second slot shows once the first is filled
    });
    // hat + colour
    hatChip.tx.textContent = pair(HAT_NAMES[draft.hat]);
    hatChip.b.setAttribute('aria-label', `${t('m_hat')}: ${pair(HAT_NAMES[draft.hat])}`);
    swatches.forEach((b, i) => { const on = draft.color === i; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    // name: empty = its weapon's name, shown in ink (never see-through placeholder text)
    if (document.activeElement !== nameIn && nameIn.value !== draft.name) nameIn.value = draft.name;
    nameIn.placeholder = nm(wr);
    // buttons
    del.hidden = isNew;
    btns.classList.toggle('new', isNew);
    paintBodies();
    if (pick) fillPick();
    if (lay) fitWords();
  }
  // body pictures: each body in the picked colour, hat and gear (MINE.preview stills), else the painted plain silhouette;
  // painted again only when something they show changed
  let bodyKey = '';
  function paintBodies() {
    if (!lay) return;
    const has = typeof MINE.preview === 'function';
    bodyRow.classList.toggle('plain', !has);
    if (!has) return;
    const [bw, bh] = bodyBox(), key = [draft.color, draft.hat, draft.weapon, draft.abilities.join('+'), bw, bh, lay.k].join('|');
    if (key === bodyKey) return;
    bodyKey = key;
    for (const bb of bodyBtns) queueStill(bb.cv, { ...draft, body: bb.id, size: 2 }, bw, bh);
  }
  const chipIcon = () => (lay && lay.land ? [42, 34] : [44, 35]);
  const bodyBox = () => (lay && lay.land ? [60, 40] : [60, 42]);

  function fitWords() {
    fit(wChip.tx); aChips.forEach((c) => fit(c.tx)); fit(hatChip.tx);
    fit(save); fit(del); fit(capName);
    for (const s of grid.querySelectorAll('.mk-ico-txt')) fit(s, 2);
    for (const s of [wChip.ic, ...aChips.map((c) => c.ic)]) for (const x of s.querySelectorAll('.mk-ico-txt')) fit(x, 2);
  }

  // ---- picker ----
  function openPick(kind, slot = 0) {
    pick = { kind, slot };
    sheet.classList.add('picking');
    grid.dataset.kind = kind;
    buildPick();
    const on = grid.querySelector('.on') || grid.firstChild;
    if (on && matchMedia('(hover: hover)').matches) on.focus({ preventScroll: true });
  }
  function closePick() {
    if (!pick) return;
    pick = null; sheet.classList.remove('picking'); grid.replaceChildren();
    for (let i = stills.length - 1; i >= 0; i--) if (!stills[i].cv.isConnected) stills.splice(i, 1);
    sync();
  }
  function pickItems() {
    if (!pick) return [];
    if (pick.kind === 'weapon') return ready('weapon').map((id) => ({ id, row: W_ROW.get(id), group: W_ROW.get(id).group }));
    if (pick.kind === 'hat') return HATS.map((id) => ({ id, group: 'plain' }));
    const ab = ready('ability').map((id, i) => ({ id, row: A_ROW.get(id), group: A_ROW.get(id).kind, i }));
    ab.sort((a, b) => (KIND_ORDER.indexOf(a.group) - KIND_ORDER.indexOf(b.group)) || (a.i - b.i)); // one block per kind
    return [{ id: null, group: 'plain' }, ...ab];
  }
  const pickValue = () => (pick.kind === 'weapon' ? draft.weapon : pick.kind === 'hat' ? draft.hat : (draft.abilities[pick.slot] || null));
  function buildPick() {
    const items = pickItems();
    const gr = grid.getBoundingClientRect(), k = lay ? lay.k : 1;
    const gw = (grid.clientWidth || gr.width / k), gh = (grid.clientHeight || gr.height / k);
    const L = layOutCells(items.length, gw, gh, T.CELL_GAP, pick.kind === 'hat' ? T.HAT_MAX : T.CELL_MAX);
    grid.style.setProperty('--cols', L.cols); grid.style.setProperty('--cw', `${L.cw}px`); grid.style.setProperty('--ch', `${L.ch}px`);
    grid.replaceChildren(...items.map((it) => {
      const b = h('button', 'mk-cell mk-pcell'); b.type = 'button'; b.dataset.group = it.group; b.dataset.id = it.id ?? '';
      b.setAttribute('role', 'option');
      const label = pick.kind === 'hat' ? pair(HAT_NAMES[it.id]) : it.id ? nm(it.row) : t('m_none');
      b.title = label; b.setAttribute('aria-label', label);
      const box = h('span', 'mk-pico');
      if (pick.kind === 'hat') {
        if (typeof MINE.preview === 'function') { const cv = h('canvas'); cv.setAttribute('aria-hidden', 'true'); box.append(cv); queueStill(cv, { ...draft, hat: it.id }, L.cw * 0.9, L.ch * 0.9); }
        else { box.append(h('span', 'mk-ico-txt', label)); box.classList.add('txt'); }
      } else if (!it.id) { box.classList.add('none'); }
      else iconInto(box, it.id, L.cw * T.ICON_K, L.ch * T.ICON_K, label);
      b.append(box);
      b.addEventListener('click', () => choose(it.id));
      return b;
    }));
    for (let i = stills.length - 1; i >= 0; i--) if (!stills[i].cv.isConnected) stills.splice(i, 1); // an older grid's cards
    fillPick();
    for (const s of grid.querySelectorAll('.mk-ico-txt')) fit(s, 2);
  }
  // caption (the current pick: icon + name) and the picked cell
  function fillPick() {
    const v = pickValue();
    for (const b of grid.children) { const on = (b.dataset.id || null) === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    let label;
    if (pick.kind === 'weapon') { label = nm(W_ROW.get(v)); iconInto(capIco, v, 46, 37, null); cap.dataset.group = (W_ROW.get(v) || {}).group || 'plain'; }
    else if (pick.kind === 'hat') { label = pair(HAT_NAMES[v]); capIco.replaceChildren(); cap.dataset.group = 'plain'; }
    else { const ar = v ? A_ROW.get(v) : null; label = ar ? nm(ar) : t('m_none'); if (v) iconInto(capIco, v, 46, 37, null); else { capIco.replaceChildren(); } capIco.classList.toggle('none', !v); cap.dataset.group = ar ? ar.kind : 'plain'; }
    capName.textContent = label;
    fit(capName);
  }
  // a tap on a cell picks it at once (the caption + preview show it); the X / Esc goes back to the rows
  function choose(id) {
    if (!pick) return;
    if (pick.kind === 'weapon') { if (id) draft.weapon = id; }
    else if (pick.kind === 'hat') draft.hat = id;
    else {
      const abs = draft.abilities.slice(), s = Math.min(pick.slot, abs.length);
      if (!id) { if (s < abs.length) abs.splice(s, 1); }
      else {
        const other = abs[1 - s];
        if (other === id || (other && maker.isMoveAbility(id) && maker.isMoveAbility(other))) abs.splice(1 - s, 1); // a second move ability replaces the first
        const at = Math.min(s, abs.length); abs[at] = id;
        pick.slot = at;
      }
      draft.abilities = abs.filter(Boolean).slice(0, 2);
      if (pick.slot > draft.abilities.length) pick.slot = draft.abilities.length;
    }
    play();
    fillPick();
  }

  // ---- size the board for this screen ----
  function layout() {
    if (!open) return;
    if (document.activeElement === nameIn && lay) return; // typing: the phone keyboard must not shrink the board under the finger
    const sa = safeArea();
    const aw = innerWidth - 2 * T.EDGE - sa.l - sa.r, ah = innerHeight - 2 * T.EDGE - sa.t - sa.b;
    const L = makerLayout(aw, ah), changed = !lay || lay.land !== L.land || Math.abs(lay.k - L.k) > 1e-3;
    lay = L;
    sheet.classList.toggle('land', L.land); sheet.classList.toggle('port', !L.land);
    const st = sheet.style;
    st.width = `${L.w}px`; st.height = `${L.h}px`;
    st.left = `${Math.round(sa.l + T.EDGE + (aw - L.w * L.k) / 2)}px`; st.top = `${Math.round(sa.t + T.EDGE + (ah - L.h * L.k) / 2)}px`;
    st.transform = `scale(${L.k})`;
    // the stage canvas at device px
    const dpr = Math.min(devicePixelRatio || 1, 3) * L.k;
    stageCv.width = Math.max(1, Math.round(stage.clientWidth * dpr)); stageCv.height = Math.max(1, Math.round(stage.clientHeight * dpr));
    sync(); if (pick && (changed || !grid.firstChild)) buildPick();
    drawStage(performance.now());
  }

  function relabel() {
    close.setAttribute('aria-label', pick ? t('back') : t('close')); close.title = `${pick ? t('back') : t('close')} (Esc)`;
    back.setAttribute('aria-label', t('maker'));
    nameIn.setAttribute('aria-label', t('m_name'));
    bodyRow.setAttribute('aria-label', t('m_body'));
    for (const bb of bodyBtns) { const n = pair(BODY_NAMES[bb.id]); bb.b.setAttribute('aria-label', n); bb.b.title = n; bb.b.querySelector('.mk-bodyword').textContent = n; }
    tSize.el.setAttribute('aria-label', t('m_size')); tHp.el.setAttribute('aria-label', t('m_hp')); tSpeed.el.setAttribute('aria-label', t('m_speed'));
    wChip.b.setAttribute('aria-label', t('m_weapon')); colorBox.setAttribute('aria-label', t('m_colour'));
    swatches.forEach((b, i) => b.setAttribute('aria-label', `${t('m_colour')} ${i + 1}`));
    save.textContent = t('save');
    del.textContent = armed ? t('del_sure') : t('del');
    sync();
  }

  // ---- buttons ----
  function disarm() { armed = false; clearTimeout(armT); del.classList.remove('armed'); del.textContent = t('del'); fit(del); }
  del.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (isNew || !draft) return;
    if (!armed) { armed = true; del.classList.add('armed'); del.textContent = t('del_sure'); fit(del); play(); clearTimeout(armT); armT = setTimeout(disarm, T.ARM_MS); return; }
    disarm();
    const r = maker.cleanRecipe(draft);
    hide();
    if (onDelete) onDelete(r);
  });
  save.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (!draft) return;
    draft.name = nameIn.value;
    const r = maker.cleanRecipe(draft), wasNew = isNew;
    hide();
    if (onSave) onSave(r, wasNew);
  });
  close.addEventListener('click', (e) => { e.currentTarget.blur(); play(); if (pick) closePick(); else hide(); relabel(); });
  nameIn.addEventListener('input', () => { draft.name = nameIn.value.slice(0, 16); });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } e.stopPropagation(); });
  nameIn.addEventListener('blur', () => { layout(); });
  // keys inside the board never reach the field's shortcuts (controls.js returns early while the maker is open)

  function show(recipe = null) {
    isNew = !recipe;
    let r = recipe ? maker.cleanRecipe(recipe) : maker.newRecipe(store ? store.nextId() : 1);
    if (isNew) { const w = ready('weapon'); if (w.length && !w.includes(r.weapon)) r = { ...r, weapon: w[0] }; }
    draft = { ...r, abilities: r.abilities.slice() };
    pick = null; sheet.classList.remove('picking'); grid.replaceChildren(); disarm();
    nameIn.value = draft.name;
    if (!open) { open = true; back.hidden = false; onOpenChange && onOpenChange(true); }
    t0 = performance.now(); lay = null;
    relabel(); layout();
    if (!raf) raf = requestAnimationFrame(loop);
    sheet.focus({ preventScroll: true }); // the board itself, not Save: a stray Space / Enter must never save
  }
  function hide() {
    if (!open) return;
    open = false; back.hidden = true; pick = null; sheet.classList.remove('picking'); grid.replaceChildren(); disarm(); stills.length = 0; bodyKey = '';
    if (document.activeElement && back.contains(document.activeElement)) document.activeElement.blur();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    onOpenChange && onOpenChange(false);
  }
  /** Esc: a picker goes back to the rows, else the maker closes (nothing saved). */
  function escape() { if (!open) return; if (document.activeElement === nameIn) { nameIn.blur(); return; } if (pick) { closePick(); relabel(); } else hide(); }
  addEventListener('resize', () => layout());

  return {
    el: back, show, hide, escape, relabel,
    get open() { return open; },
    get picking() { return pick ? pick.kind : null; },
    get draft() { return draft ? { ...draft, abilities: draft.abilities.slice() } : null; },
    get isNew() { return isNew; },
    get layout() { return lay; },
    /** tests: pick a value as a tap would */
    choose(kind, id, slot = 0) { openPick(kind, slot); choose(id); closePick(); relabel(); },
  };
}
