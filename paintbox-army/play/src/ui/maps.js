// Maps panel + the Found card (OURS, Part 2 step 7, STEP7.md). Owner: UI.
// Maps panel: a kraft board over the field with one taped paper card per map (Blank + every registered map, a map
// whose file isn't there yet has no card). A card = the map's thumbnail (GROUND-ART's drawMapThumb from
// render/art/maps-art.js, drawn a card per frame after the panel opens; until it exists or if it fails: the map's flat
// ground colour), its name, and for maps with a secret unit a badge: the unit's icon once found, else "?". The loaded
// map's card is yellow (Blank: the plain field, drawMapThumb's 'blank' when it has one). Tap a card = load it (main.js loadMap). Closes on the X, Esc / N (controls.js), or a tap on the
// dark backdrop. The grid is sized in JS for the screen it is on (cards the world's shape: tall on a phone held
// upright, wide on its side and on desktop), so it always fits without scrolling.
// Found card: "Found: Yeti!" with the unit big, wobbles in with confetti, closes on a tap anywhere or after 3 s.
import { t, unitName } from './strings.js';

const T = {
  GAP: 10,          // css px between cards
  PAD: 14,          // css px: kraft board padding round the grid
  EDGE: 12,         // css px kept free to the screen edge (plus the safe area)
  CLOSE: 46,        // css px strip for the X: a top row or a right column, whichever leaves the bigger cards
  CARD_PAD: 8,      // css px of paper round the thumbnail (index.html .map-card padding)
  NAME_H: 34,       // css px: the name line under the thumbnail + the paper under it (index.html .map-name)
  MAX_TW: 280,      // css px: biggest thumbnail width (desktop)
  MIN_TW: 40,       // css px: smallest thumbnail width a layout may use
  EMPTY_COST: 0.04, // a layout's score loses this share per empty grid slot (9 cards: 3 x 3 beats 4 + 4 + 1)
  FONT: [11, 22],   // css px: map name size range, picked from the card width (card / 7.5)
  BADGE: [28, 40],  // css px: badge size range, picked from the thumbnail width (x BADGE_K)
  BADGE_K: 0.22,    // badge size = this share of the thumbnail width, inside BADGE
  THUMB_DPR: 2,     // thumbnails are painted at most at 2 device px per css px
  THUMB_RETRY: 120, // ms between tries while drawMapThumb's scratch sim is still loading (it returns false)
  THUMB_TRIES: 60,  // then give up on that card (flat ground colour stays)
  FOUND_MS: 3000,   // ms: the Found card closes itself after this
  CONFETTI: 40,     // paint dabs the Found card throws
};
// Fallback thumbnail colour per ground (STEP7.md grounds; grass = the field's paint green)
const GROUND_COL = { grass: '#6cbd45', sand: '#f0d27c', snow: '#eef3fa', dirt: '#d9773f', rock: '#4a4340', swamp: '#6d7b3b' };
const CONFETTI_COL = ['#e3241a', '#1f57d8', '#ffd51e', '#6cbd45', '#ff8a12', '#8d4fd6', '#ff9fd0', '#fffdf2'];

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function safeArea() {
  const p = document.getElementById('safe-probe'); if (!p) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(p);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
const closeSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** The biggest card grid for n cards of world aspect a (W / H) in a w x h box (css px). Exported for tests. */
export function layOutMaps(n, a, w, h) {
  let best = null;
  for (const side of ['top', 'right']) {
    const gw = w - 2 * T.PAD - (side === 'right' ? T.CLOSE : 0), gh = h - 2 * T.PAD - (side === 'top' ? T.CLOSE : 0);
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (gw - (cols - 1) * T.GAP) / cols, ch = (gh - (rows - 1) * T.GAP) / rows;
      const tw = Math.floor(Math.min(cw - 2 * T.CARD_PAD, (ch - 2 * T.CARD_PAD - T.NAME_H) * a, T.MAX_TW));
      if (tw < T.MIN_TW) continue;
      const score = tw * (1 - T.EMPTY_COST * (rows * cols - n));
      if (!best || score > best.score + 0.5) best = { side, cols, rows, tw, th: Math.max(1, Math.round(tw / a)), score };
    }
  }
  if (!best) best = { side: 'top', cols: Math.min(n, 3), rows: Math.ceil(n / 3), tw: T.MIN_TW, th: Math.round(T.MIN_TW / a), score: 0 }; // tiny window: smallest cards
  best.cw = best.tw + 2 * T.CARD_PAD; best.ch = best.th + 2 * T.CARD_PAD + T.NAME_H;
  return best;
}

let thumbMod; // render/art/maps-art.js: undefined = not tried yet, null = not there (flat colours)
async function thumbModule() {
  if (thumbMod === undefined) {
    try { const m = await import('../render/art/maps-art.js'); thumbMod = typeof m.drawMapThumb === 'function' ? m : null; }
    catch (e) { thumbMod = null; }
  }
  return thumbMod;
}
function paintBlank(c, w, h) { // Blank = the plain painted field: grass green with a few darker scrubs
  c.fillStyle = GROUND_COL.grass; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#57a838'; c.lineCap = 'round'; c.lineWidth = Math.max(2, w / 40);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, l = w * (0.06 + r() * 0.08); c.beginPath(); c.moveTo(x - l, y + l * 0.15); c.lineTo(x + l, y - l * 0.15); c.stroke(); }
}

/**
 * opts: { root, maps: { order, secretOf, has(id), groundOf(id) }, secrets, iconFor(tool), current() -> map id,
 *         aspect() -> world W / H, onPick(id), onOpenChange(open) }
 */
export function createMapsPanel(opts) {
  const { root, maps, secrets, iconFor, current, aspect, onPick, onOpenChange } = opts;
  const back = h('div', 'maps'); back.id = 'maps'; back.hidden = true;
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  const sheet = h('div', 'maps-sheet');
  const grid = h('div', 'maps-grid');
  const close = h('button', 'round-button maps-close'); close.type = 'button'; close.innerHTML = closeSvg;
  sheet.append(grid, close); back.append(sheet); root.append(back);
  // a tap on the backdrop closes it: on the click (down and up both on the backdrop), so the same tap can't land on
  // whatever is under it once the panel is gone (report.js, attack 11-13)
  let downOnBack = false;
  back.addEventListener('pointerdown', (e) => { downOnBack = e.target === back; });
  back.addEventListener('click', (e) => { if (downOnBack && e.target === back) hide(); downOnBack = false; });
  close.addEventListener('click', (e) => { e.currentTarget.blur(); hide(); });

  let open = false, hint = null, cards = [], lay = null, queue = [], pumping = false;
  const thumbs = new Map(); // id -> { cv, key } painted thumbnails, kept between opens

  const ids = () => ['blank', ...maps.order.filter((id) => maps.has(id))];
  function relabel() {
    close.setAttribute('aria-label', t('close')); close.title = `${t('close')} (Esc)`;
    back.setAttribute('aria-label', t('maps'));
    for (const c of cards) {
      const nm = t('map_' + c.id); c.name.textContent = nm;
      const type = maps.secretOf[c.id];
      c.el.setAttribute('aria-label', type ? `${nm}: ${secrets.has(type) ? unitName(type) : '?'}` : nm);
    }
    fitNames();
  }
  function build() {
    grid.replaceChildren();
    cards = ids().map((id) => {
      const el = h('button', 'map-card'); el.type = 'button'; el.dataset.map = id;
      const thumb = h('span', 'map-thumb'), name = h('span', 'map-name');
      el.append(thumb, name);
      const type = maps.secretOf[id];
      if (type) {
        const found = secrets.has(type), badge = h('span', 'map-badge ' + (found ? 'found' : 'q'));
        if (found) { const ic = iconFor({ kind: 'unit', type }, true); ic.classList.add('map-badge-icon'); badge.append(ic); }
        else badge.textContent = '?';
        el.append(badge);
      }
      el.addEventListener('click', () => { onPick(id); });
      grid.append(el);
      return { id, el, thumb, name };
    });
    mark();
  }
  function mark() {
    const cur = current() || 'blank';
    for (const c of cards) { c.el.classList.toggle('on', c.id === cur); c.el.classList.toggle('hint', c.id === hint); c.el.setAttribute('aria-pressed', String(c.id === cur)); }
  }
  // ---- size the grid for this screen ----
  function layout() {
    if (!open) return;
    const sa = safeArea();
    const w = innerWidth - 2 * T.EDGE - sa.l - sa.r, hh = innerHeight - 2 * T.EDGE - sa.t - sa.b;
    lay = layOutMaps(cards.length, Math.max(0.2, Math.min(5, aspect() || 1)), w, hh);
    const st = sheet.style;
    st.setProperty('--map-cols', lay.cols); st.setProperty('--map-cw', `${lay.cw}px`);
    st.setProperty('--map-tw', `${lay.tw}px`); st.setProperty('--map-th', `${lay.th}px`);
    st.setProperty('--map-badge', `${Math.round(Math.max(T.BADGE[0], Math.min(T.BADGE[1], lay.tw * T.BADGE_K)))}px`);
    st.setProperty('--map-font', `${Math.round(Math.max(T.FONT[0], Math.min(T.FONT[1], lay.cw / 7.5)))}px`);
    sheet.classList.toggle('x-right', lay.side === 'right');
    fitNames();
    for (const c of cards) paintThumb(c);
  }
  // a name wider than its card shrinks to fit (one line, never cut)
  function fitNames() {
    if (!open || !lay) return;
    for (const c of cards) {
      c.name.style.fontSize = '';
      const room = lay.cw - 6, wd = c.name.scrollWidth;
      if (wd > room) c.name.style.fontSize = `${Math.max(9, Math.floor(parseFloat(getComputedStyle(c.name).fontSize) * room / wd))}px`;
    }
  }
  // ---- thumbnails: flat ground colour at once, the painted picture a card per frame ----
  function paintThumb(c) {
    const dpr = Math.min(devicePixelRatio || 1, T.THUMB_DPR), w = Math.round(lay.tw * dpr), hh = Math.round(lay.th * dpr), key = `${w}x${hh}`;
    let e = thumbs.get(c.id);
    if (!e) { const cv = h('canvas', 'map-thumb-cv'); cv.setAttribute('aria-hidden', 'true'); e = { cv, key: '' }; thumbs.set(c.id, e); }
    if (e.cv.parentElement !== c.thumb) c.thumb.replaceChildren(e.cv);
    if (e.key === key) return;
    e.cv.width = w; e.cv.height = hh; e.key = key;
    const g = e.cv.getContext('2d');
    if (c.id === 'blank') paintBlank(g, w, hh);
    else { g.fillStyle = GROUND_COL[maps.groundOf(c.id)] || GROUND_COL.grass; g.fillRect(0, 0, w, hh); }
    queue.push([c.id, e, key, 0]);
    pump();
  }
  // one card per frame; drawMapThumb returns false while its scratch sim is still loading: that card goes to the back
  // of the queue and is tried again a little later
  async function pump() {
    if (pumping) return;
    pumping = true;
    const m = await thumbModule();
    if (!m) { queue.length = 0; pumping = false; return; }
    if (typeof m.warm === 'function') { try { m.warm(); } catch (e) { /* draws flat until ready */ } }
    const step = () => {
      const job = queue.shift();
      if (!job) { pumping = false; return; }
      const [id, e, key, tries] = job;
      let wait = false;
      if (e.key === key) {
        try {
          const g = e.cv.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
          const ok = m.drawMapThumb(g, id, e.cv.width, e.cv.height); g.restore();
          if (ok === false && tries < T.THUMB_TRIES) { queue.push([id, e, key, tries + 1]); wait = queue.every((j) => j[3] > 0); }
        } catch (err) { console.warn('map thumb', id, err); }
      }
      if (wait) setTimeout(step, T.THUMB_RETRY); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function show(hintId = null) {
    hint = hintId && maps.has(hintId) ? hintId : null;
    if (!open) { open = true; back.hidden = false; build(); relabel(); layout(); onOpenChange && onOpenChange(true); }
    else mark();
    const first = cards.find((c) => c.el.classList.contains(hint ? 'hint' : 'on')) || cards[0];
    if (first && matchMedia('(hover: hover)').matches) first.el.focus({ preventScroll: true });
  }
  function hide() {
    if (!open) return;
    open = false; back.hidden = true; hint = null;
    for (const job of queue) job[1].key = '';   // not painted yet: painted on the next open
    queue.length = 0;
    onOpenChange && onOpenChange(false);
  }
  addEventListener('resize', () => layout());
  return {
    el: back, show, hide, relabel,
    toggle() { if (open) hide(); else show(); },
    get open() { return open; },
    get layout() { return lay; },
    get cards() { return cards.map((c) => c.id); },
  };
}

/** The Found card. opts: { root, bigIcon(type, w, h) -> canvas (css size w x h), onClose(type) } */
export function createFound({ root, bigIcon, onClose }) {
  let el = null, timer = 0, type = null;
  function show(tp) {
    close(true);
    type = tp;
    el = h('div', 'found'); el.id = 'found'; el.setAttribute('role', 'alertdialog');
    const card = h('div', 'found-card');
    const icon = h('span', 'found-icon');
    try { const cv = bigIcon(tp, 240, 192); if (cv) icon.append(cv); } catch (e) { console.warn('found icon', e); }
    const text = h('p', 'found-text', t('found', { name: unitName(tp) }));
    card.append(icon, text);
    const conf = h('div', 'confetti'); conf.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < T.CONFETTI; i++) {
      const d = h('i'), a = (i / T.CONFETTI) * Math.PI * 2 + Math.random() * 0.4, r = 150 + Math.random() * 230;
      d.style.setProperty('--dx', `${Math.round(Math.cos(a) * r)}px`);
      d.style.setProperty('--dy', `${Math.round(Math.sin(a) * r * 0.8 + 90)}px`);
      d.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 720)}deg`);
      d.style.setProperty('--c', CONFETTI_COL[i % CONFETTI_COL.length]);
      d.style.setProperty('--d', `${(0.9 + Math.random() * 0.7).toFixed(2)}s`);
      if (i % 3 === 0) d.className = 'strip';
      conf.append(d);
    }
    el.append(conf, card);
    // any tap closes it (on the click, so the tap can't fall through to the field or a button)
    let down = false;
    el.addEventListener('pointerdown', (e) => { down = true; e.preventDefault(); });
    el.addEventListener('click', () => { if (down) close(); down = false; });
    root.append(el);
    timer = setTimeout(() => close(), T.FOUND_MS);
  }
  function close(silent = false) {
    clearTimeout(timer);
    if (!el) return;
    el.remove(); el = null;
    const tp = type; type = null;
    if (!silent && onClose) onClose(tp);
  }
  return { show, close: () => close(), get open() { return !!el; }, get type() { return type; } };
}
