// Campaign UI (OURS, Part 2 step 9, STEP9.md). Owner: UI.
// - The panel: one painted kraft board, two pages, no scrolling on any screen (the grid is sized in JS for the screen it
//   is on, like ui/maps.js).
//   Worlds page: the 12 worlds as a wall of torn posters in their tab's paint, each with its star unit painted big, its
//   name and its stars (x / 24, a rubber-stamp star). Tap = that world's battles.
//   Battles page: the world's 8 battles as taped cards: the battle's number, its stars (0-3 stamps), the map (GROUND-ART's
//   drawMapThumb, cropped to the card) and the enemy: each unit's icon and how many. Tap = play it (main.js onPick).
//   A back button (to the worlds), the world's name + stars, an X. Everything is open (PLAN decision E): any battle.
// - In a battle: the budget bar (paint spent / budget, the 3-star and 2-star lines with their stars, a bump on
//   'budgetOut'), the 3:00 clock in the last 30 s, and the result card (win / lose / time's up, the stars stamped in one
//   by one, the spend against the lines, Retry / Next / Battles / Stats). Best stars + best spend go to the store.
// The sim side (budget, START lock, outcome) is the lead's sim/campaign/index.js; main.js does the game wiring (load a
// battle, team mode, toolbar, camera) and hands this module what it needs.
import { t } from './strings.js';

const T = {
  EDGE: 12,            // css px kept free to the screen edge (plus the safe area)
  PAD: 14,             // css px: kraft board padding round the grid
  GAP: 10,             // css px between cards
  HEAD: 50,            // css px: the header strip (back, title, X) on top, or the X column on the right (worlds page)
  EMPTY: 0.04,         // a layout's score loses this share per empty grid slot (12 posters: 4 x 3 beats 5 + 5 + 2)
  W_AIM: 0.82,         // world poster: the shape (w / h) its size is scored against
  W_SHAPE: [0.62, 1.6],// world poster: w / h kept inside this
  W_MAX: [220, 240],   // css px: biggest world poster
  B_AIM: 1.15,         // battle card: the shape its size is scored against
  B_SHAPE: [0.78, 1.9],// battle card: w / h kept inside this
  B_MAX: [300, 250],   // css px: biggest battle card
  CARD_PAD: 7,         // css px of paper round a card's insides (index.html .cp-battle / .cp-world padding)
  NAME_K: 0.13,        // world name font = this share of the poster width ...
  NAME_FONT: [11, 24], // ... kept in this range (css px)
  HEAD_K: 0.17,        // battle card: number + stars row = this share of the card height ...
  HEAD_H: [22, 40],    // ... in this range (css px)
  FOE_K: 0.3,          // battle card: the enemy row = this share of the card height ...
  FOE_H: [26, 64],     // ... in this range (css px)
  FOE_GAP: 4,          // css px between enemy icons
  FOE_MIN: 18,         // css px: an enemy icon smaller than this with its count = icons only + one total count
  FOE_GOOD: 22,        // css px: the enemy row grows (the map gives up height) until every card's icons are this big with counts
  MAP_MIN_K: 0.26,     // ... but the map keeps at least this share of the card height
  ICON_W: 102 / 82,    // toolbar icon shape (main.js iconFor canvases)
  ICON_TUCK: 0.92,     // with a count beside it an icon takes this share of its width (its empty edge tucks under the count)
  DIGIT_W: 0.62,       // a count digit's width / font size (Playpen Sans 800)
  COUNT_K: 0.56,       // count font = this share of the icon height ...
  COUNT_FONT: [11, 19],// ... in this range (css px)
  THUMB_DPR: 2,        // map pictures are painted at most at 2 device px per css px
  RETRY_MS: 120,       // ms between tries while drawMapThumb's scratch sim is still loading (it returns false)
  TRIES: 60,           // then give up on that card (its flat ground colour stays)
  BAR_MAX: 460,        // css px: widest budget bar
  LINE_NEAR: 40,       // css px: two star lines closer than this on a track put their stamps / numbers on their outer sides
  BAR_GAP: 10,         // css px kept between the bar and the round buttons
  CLOCK_FROM: 30,      // s: the clock shows in the last 30 s of the time limit
  BUMP_MS: 420,        // ms: the bar's bump when a stroke runs out of paint (index.html cp-bump)
  RESULT_PORT: [300, 344], // css px: the result card's portrait design
  RESULT_LAND: [540, 206], // css px: the result card's landscape design
  RESULT_MAX_K: 1.3,   // biggest scale of the result card (desktop)
  STAMP_FIRST: 700,    // ms after the card shows: the first star stamps down
  STAMP_MS: 430,       // ms between stamps
};
// The unit painted big on each world's poster (its best-known unit).
const POSTER = { army: 'rifle', animals: 'boar', mythical: 'dragon', dinos: 'trex', siege: 'catapult', pirates: 'captain',
  robots: 'mech', space: 'ufo', ocean: 'shark', sports: 'sumo', bugs: 'mantis', bosses: 'kraken' };

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function safeArea() {
  const p = document.getElementById('safe-probe'); if (!p) return { t: 0, r: 0, b: 0, l: 0 };
  const cs = getComputedStyle(p);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
const SVG = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
};
const clampN = (v, [a, b]) => Math.max(a, Math.min(b, v));
// 3 stamps, the first n won; or `of` stamps all alike (a star line's 3 or 2)
function stars(n, cls = 'cp-star', of = 3) { const box = h('span', 'cp-stars'); for (let i = 0; i < of; i++) box.append(h('i', `${cls}${i < n ? ' on' : ''}`)); return box; }

/** The biggest grid of n cards in a w x h box (css px): card shape kept inside shape = [lo, hi] (w / h), scored as the
 *  size of a card of shape `aim`, biggest card max = [w, h]. Exported for tests. */
export function layOutGrid(n, w, h, { aim, shape, max, gap = T.GAP }) {
  let best = null;
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    let cw = Math.min((w - (cols - 1) * gap) / cols, max[0]), ch = Math.min((h - (rows - 1) * gap) / rows, max[1]);
    if (cw <= 8 || ch <= 8) continue;
    if (cw / ch > shape[1]) cw = ch * shape[1];
    if (cw / ch < shape[0]) ch = cw / shape[0];
    const score = Math.min(cw / aim, ch) * (1 - T.EMPTY * (rows * cols - n));
    if (!best || score > best.score + 0.01) best = { cols, rows, cw: Math.floor(cw), ch: Math.floor(ch), score };
  }
  return best || { cols: Math.min(n, 3), rows: Math.ceil(n / 3), cw: 40, ch: 40, score: 0 };
}
/** Enemy row of a battle card: k types with counts in a fw x fh box. Returns { rows, per, ih (icon height), font,
 *  counts (false = icons only + one total) }. Exported for tests. */
export function layOutFoes(k, digits, fw, fh) {
  const fit = (rows, counts) => {
    const per = Math.ceil((k + (counts ? 0 : 1)) / rows);   // icons only: the total count takes a slot
    for (let ih = Math.floor((fh - (rows - 1) * 2) / rows); ih >= 8; ih--) {
      const font = clampN(ih * T.COUNT_K, T.COUNT_FONT);
      const cell = ih * T.ICON_W * (counts ? T.ICON_TUCK : 1) + (counts ? digits * T.DIGIT_W * font + 4 : 0);
      if (per * cell + (per - 1) * T.FOE_GAP <= fw) return { rows, per, ih, font, counts };
    }
    return null;
  };
  let best = null;
  for (let rows = 1; rows <= 3; rows++) { const L = fit(rows, true); if (L && L.ih >= T.FOE_MIN && (!best || L.ih > best.ih)) best = L; }
  if (best) return best;
  for (let rows = 1; rows <= 3; rows++) { const L = fit(rows, false); if (L && (!best || L.ih > best.ih)) best = L; }
  return best || { rows: 1, per: k + 1, ih: 8, font: T.COUNT_FONT[0], counts: false };
}
/** Which result card design and how big, for a w x h box (css px). Exported for tests. */
export function resultLayout(w, h) {
  const [pw, ph] = T.RESULT_PORT, [lw, lh] = T.RESULT_LAND;
  const kp = Math.min(w / pw, h / ph, T.RESULT_MAX_K), kl = Math.min(w / lw, h / lh, T.RESULT_MAX_K);
  const land = kl > kp + 1e-6;
  return { land, w: land ? lw : pw, h: land ? lh : ph, k: land ? kl : kp };
}

/**
 * opts: { root, cm: sim/campaign/index.js, store: ui/campaign-store.js, iconFor(tool, now), bigIcon(type, w, h),
 *         game() -> the game, onPick(id), onOpenChange(open), onRetry(id), onNext(id), onBattles(world), onReport(), onOver(result),
 *         sound: { ui(), stamp(i), out(), win(), lose() } }   (the panel's open / close rustle is main.js's onOpenChange)
 */
export function createCampaign(opts) {
  const { root, cm, store, iconFor, bigIcon, game, onPick, onOpenChange, onRetry, onNext, onBattles, onReport } = opts;
  const snd = (name, ...a) => { const f = opts.sound && opts.sound[name]; if (f) { try { f(...a); } catch (e) { /* no sound */ } } };

  // ================================================================ the panel
  const back = h('div', 'cp'); back.id = 'campaign'; back.hidden = true;
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  const sheet = h('div', 'cp-sheet');
  const head = h('div', 'cp-head');
  const backBtn = h('button', 'round-button cp-back'); backBtn.type = 'button'; backBtn.innerHTML = SVG.back;
  const title = h('div', 'cp-title'); const titleName = h('h2', 'cp-title-name'); const titleStars = h('span', 'cp-title-stars');
  title.append(titleName, titleStars);
  const close = h('button', 'round-button cp-close'); close.type = 'button'; close.innerHTML = SVG.close;
  head.append(backBtn, title);
  const grid = h('div', 'cp-grid');
  sheet.append(head, grid, close); back.append(sheet); root.append(back);
  let downOnBack = false;   // a tap on the backdrop closes it, on the click (report.js, attack 11-13)
  back.addEventListener('pointerdown', (e) => { downOnBack = e.target === back; });
  back.addEventListener('click', (e) => { if (downOnBack && e.target === back) hide(); downOnBack = false; });
  close.addEventListener('click', (e) => { e.currentTarget.blur(); hide(); });
  backBtn.addEventListener('click', (e) => { e.currentTarget.blur(); snd('ui'); showWorlds(); });

  let open = false, page = 'worlds', world = null, fromWorlds = false, lay = null, cards = [];
  const levelIds = (w) => Array.from({ length: cm.PER_WORLD }, (_, i) => `${w}-${i + 1}`);
  const worldStars = (w) => store.total(levelIds(w));
  const starWord = (n, m) => `${n} / ${m}`;

  // ---- jobs painted a few per frame (posters, map pictures): show the board at once, pictures fill in ----
  const jobs = []; let pumping = false;
  function queue(fn) { jobs.push({ fn, tries: 0 }); if (!pumping) { pumping = true; requestAnimationFrame(pump); } }
  function pump() {
    const t0 = performance.now();
    let wait = false;
    while (jobs.length && performance.now() - t0 < 8) {
      const j = jobs.shift(), r = j.fn();
      if (r === false && ++j.tries < T.TRIES) { jobs.push(j); if (jobs.every((x) => x.tries > 0)) { wait = true; break; } }
    }
    if (!jobs.length) { pumping = false; return; }
    if (wait) setTimeout(() => requestAnimationFrame(pump), T.RETRY_MS); else requestAnimationFrame(pump);
  }
  let thumbMod; // render/art/maps-art.js: undefined = not tried yet, null = not there (flat paper)
  import('../render/art/maps-art.js').then((m) => { thumbMod = typeof m.drawMapThumb === 'function' ? m : null; if (thumbMod && thumbMod.warm) thumbMod.warm(); }).catch(() => { thumbMod = null; });
  const posterCache = new Map();   // `${type}|${w}x${h}` -> canvas
  const mapCache = new Map();      // `${map}|${w}x${h}` -> canvas

  // ---- worlds page ----
  function buildWorlds() {
    grid.replaceChildren();
    cards = cm.WORLDS.map((w) => {
      const el = h('button', 'cp-world'); el.type = 'button'; el.dataset.world = w;
      const pic = h('span', 'cp-world-pic'), name = h('span', 'cp-world-name'), st = h('span', 'cp-world-stars');
      const n = worldStars(w), m = cm.PER_WORLD * 3;
      st.append(h('i', 'cp-star on'), h('b', null, starWord(n, m)));
      el.append(pic, name, st);
      el.addEventListener('click', () => { snd('ui'); showBattles(w, true); });
      grid.append(el);
      return { kind: 'world', id: w, el, pic, name, st };
    });
  }
  // ---- battles page ----
  function foesOf(lv) {
    const m = new Map();
    for (const g of lv.enemy || []) m.set(g.type, (m.get(g.type) || 0) + (g.n || 0));
    return [...m.entries()];
  }
  function buildBattles(w) {
    grid.replaceChildren();
    cards = levelIds(w).map((id, i) => {
      const lv = cm.getLevel(id), won = store.stars(id);
      const el = h('button', 'cp-battle' + (lv ? '' : ' none') + (id === battle.id ? ' now' : '')); el.type = 'button'; el.dataset.id = id; // now = the battle on the field
      const top = h('span', 'cp-battle-head'); const num = h('b', 'cp-num', String(i + 1)); top.append(num, stars(won));
      const map = h('span', 'cp-map'), foes = h('span', 'cp-foes');
      el.append(top, map, foes);
      if (lv) el.addEventListener('click', () => { snd('ui'); if (onPick) onPick(id); });
      else el.disabled = true;
      grid.append(el);
      return { kind: 'battle', id, lv, el, map, foes, won, foeList: lv ? foesOf(lv) : [] };
    });
  }
  function relabel() {
    close.setAttribute('aria-label', t('close')); close.title = `${t('close')} (Esc)`;
    backBtn.setAttribute('aria-label', t('back')); backBtn.title = `${t('back')} (Esc)`;
    back.setAttribute('aria-label', t('campaign'));
    if (page === 'battles' && world) {
      titleName.textContent = t('tab_' + world);
      titleStars.replaceChildren(h('i', 'cp-star on'), h('b', null, starWord(worldStars(world), cm.PER_WORLD * 3)));
    }
    for (const c of cards) {
      if (c.kind === 'world') {
        const nm = t('tab_' + c.id); c.name.textContent = nm;
        c.el.setAttribute('aria-label', `${nm}: ${t('c_stars', { n: worldStars(c.id), m: cm.PER_WORLD * 3 })}`);
      } else c.el.setAttribute('aria-label', `${t('c_battle', { n: c.id.split('-')[1] })}: ${t('c_stars', { n: c.won, m: 3 })}`);
    }
    fitWords();
    resultRelabel();
  }
  // ---- size the board for this screen ----
  function layout() {
    if (!open) return;
    const sa = safeArea();
    const aw = innerWidth - 2 * T.EDGE - sa.l - sa.r, ah = innerHeight - 2 * T.EDGE - sa.t - sa.b;
    const worlds = page === 'worlds', n = cards.length;
    const spec = worlds ? { aim: T.W_AIM, shape: T.W_SHAPE, max: T.W_MAX } : { aim: T.B_AIM, shape: T.B_SHAPE, max: T.B_MAX };
    let best = null;
    for (const side of worlds ? ['top', 'right'] : ['top']) {
      const gw = aw - 2 * T.PAD - (side === 'right' ? T.HEAD : 0), gh = ah - 2 * T.PAD - (side === 'top' ? T.HEAD : 0);
      const L = layOutGrid(n, gw, gh, spec);
      if (!best || L.score > best.score + 0.5) best = { ...L, side };
    }
    lay = best;
    const st = sheet.style;
    st.setProperty('--cp-cols', lay.cols); st.setProperty('--cp-cw', `${lay.cw}px`); st.setProperty('--cp-ch', `${lay.ch}px`);
    sheet.classList.toggle('x-right', lay.side === 'right');
    sheet.classList.toggle('worlds', worlds); sheet.classList.toggle('battles', !worlds);
    if (worlds) {
      const nf = clampN(lay.cw * T.NAME_K, T.NAME_FONT);
      st.setProperty('--cp-name', `${Math.round(nf)}px`);
      st.setProperty('--cp-wstar', `${Math.round(Math.max(16, nf * 1.05))}px`);
      for (const c of cards) paintPoster(c);
    } else {
      const inner = lay.cw - 2 * T.CARD_PAD, hh = Math.round(clampN(lay.ch * T.HEAD_K, T.HEAD_H));
      // the enemy row: as tall as the most crowded card on this page needs (one height for all: the cards stay alike)
      const fh0 = Math.round(clampN(lay.ch * T.FOE_K, T.FOE_H)), fhMax = Math.max(fh0, Math.round(lay.ch - 2 * T.CARD_PAD - hh - 8 - lay.ch * T.MAP_MIN_K));
      let fh = fh0;
      for (const c of cards) {
        if (!c.lv || !c.foeList.length) continue;
        const dg = String(Math.max(...c.foeList.map(([, n]) => n))).length;
        let f = fh;
        while (f < fhMax) { const L = layOutFoes(c.foeList.length, dg, inner, f); if (L.counts && L.ih >= T.FOE_GOOD) break; f += 2; }
        fh = Math.min(fhMax, Math.max(fh, f));
      }
      const mh = Math.max(16, lay.ch - 2 * T.CARD_PAD - hh - fh - 8);
      st.setProperty('--cp-hh', `${hh}px`); st.setProperty('--cp-fh', `${fh}px`); st.setProperty('--cp-mh', `${mh}px`);
      for (const c of cards) { if (c.lv) { paintMap(c, inner, mh); fillFoes(c, inner, fh, fh0); } }
    }
    fitWords();
  }
  // a world name wider than its poster shrinks to fit (one line, never cut)
  function fitWords() {
    if (!open || !lay) return;
    for (const c of cards) {
      if (c.kind !== 'world') continue;
      c.name.style.fontSize = '';
      const room = lay.cw - 2 * T.CARD_PAD - 4, wd = c.name.scrollWidth;
      if (wd > room) c.name.style.fontSize = `${Math.max(9, Math.floor(parseFloat(getComputedStyle(c.name).fontSize) * room / wd))}px`;
    }
    titleName.style.fontSize = '';
    if (page === 'battles') {
      const room = title.clientWidth - titleStars.offsetWidth - 10, wd = titleName.scrollWidth;
      if (room > 0 && wd > room) titleName.style.fontSize = `${Math.max(12, Math.floor(parseFloat(getComputedStyle(titleName).fontSize) * room / wd))}px`;
    }
  }
  // ---- the poster's unit, painted big (one per frame; kept for the next open) ----
  function paintPoster(c) {
    const pw = Math.max(10, Math.round(lay.cw - 2 * T.CARD_PAD - 6)), ph = Math.max(10, Math.round(lay.ch - 2 * T.CARD_PAD - parseFloat(sheet.style.getPropertyValue('--cp-name')) * 1.3 - parseFloat(sheet.style.getPropertyValue('--cp-wstar')) * 1.35 - 6));
    const type = POSTER[c.id], key = `${type}|${pw}x${ph}`;
    c.pic.style.width = `${pw}px`; c.pic.style.height = `${ph}px`;
    if (c.pic.dataset.k === key && c.pic.firstChild) return;
    c.pic.dataset.k = key;
    // a copy of the painted picture (the source stays in the cache for the next open)
    const put = (src) => { const cv = h('canvas', 'cp-world-cv'); cv.width = src.width; cv.height = src.height; cv.style.width = `${pw}px`; cv.style.height = `${ph}px`; cv.setAttribute('aria-hidden', 'true'); cv.getContext('2d').drawImage(src, 0, 0); c.pic.replaceChildren(cv); };
    const have = posterCache.get(key);
    if (have) { put(have); return; }
    c.pic.replaceChildren();
    queue(() => {
      if (!c.el.isConnected || c.pic.dataset.k !== key) return true;
      let src = posterCache.get(key);
      if (!src) {
        try { src = bigIcon ? bigIcon(type, pw, ph) : null; } catch (e) { src = null; }
        if (!src) src = iconFor({ kind: 'unit', type }, true);
        posterCache.set(key, src);
      }
      put(src);
      return true;
    });
  }
  // ---- the battle's map, cropped to the card (cover), painted one per frame; flat paper until then ----
  function paintMap(c, w, hh) {
    const dpr = Math.min(devicePixelRatio || 1, T.THUMB_DPR), pw = Math.max(8, Math.round(w * dpr)), ph = Math.max(8, Math.round(hh * dpr));
    const key = `${c.lv.map}|${pw}x${ph}`;
    let cv = c.map.firstChild;
    if (!cv) { cv = h('canvas', 'cp-map-cv'); cv.setAttribute('aria-hidden', 'true'); c.map.append(cv); }
    if (cv.dataset.k === key) return;
    cv.dataset.k = key; cv.width = pw; cv.height = ph;
    const done = mapCache.get(key);
    const g = cv.getContext('2d');
    if (done) { g.drawImage(done, 0, 0); return; }
    g.fillStyle = '#6cbd45'; g.fillRect(0, 0, pw, ph);
    queue(() => {
      if (cv.dataset.k !== key || !cv.isConnected) return true;
      if (thumbMod === undefined) return false;
      if (!thumbMod) return true;
      const gm = game(), W = gm ? gm.world.W : 1, H = gm ? gm.world.H : 1, a = W / H;
      // the whole map at the world's shape, then the middle of it that has the card's shape
      let tw = pw, th = Math.round(pw / a);
      if (th < ph) { th = ph; tw = Math.round(ph * a); }
      const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
      let ok = false;
      try { ok = thumbMod.drawMapThumb(tmp.getContext('2d'), c.lv.map, tw, th) !== false; } catch (e) { console.warn('campaign map', c.lv.map, e); return true; }
      if (!ok) return false;
      const out = document.createElement('canvas'); out.width = pw; out.height = ph;
      out.getContext('2d').drawImage(tmp, Math.round((tw - pw) / 2), Math.round((th - ph) / 2), pw, ph, 0, 0, pw, ph);
      mapCache.set(key, out);
      g.drawImage(out, 0, 0);
      return true;
    });
  }
  // ---- the enemy: each unit's icon and how many (icons only + one total when there is no room for every count) ----
  function fillFoes(c, w, fh, cap = fh) {   // cap = biggest icon (a page's tall row never blows one unit up)
    const list = c.foeList, k = list.length;
    if (!k) { c.foes.replaceChildren(); return; }
    const total = list.reduce((s, [, n]) => s + n, 0), digits = String(Math.max(...list.map(([, n]) => n))).length;
    const L = layOutFoes(k, digits, w, fh);
    if (L.ih > cap) { L.ih = Math.floor(cap); L.font = clampN(L.ih * T.COUNT_K, T.COUNT_FONT); }
    const key = `${w}|${fh}|${L.ih}|${L.counts}`;
    if (c.foes.dataset.k === key) return;
    c.foes.dataset.k = key;
    c.foes.style.setProperty('--cp-ih', `${L.ih}px`); c.foes.style.setProperty('--cp-cf', `${Math.round(L.font)}px`);
    c.foes.classList.toggle('icons', !L.counts);
    const kids = list.map(([type, n]) => {
      const f = h('span', 'cp-foe'); const ic = iconFor({ kind: 'unit', type }, true); ic.classList.add('cp-foe-icon');
      f.append(ic); if (L.counts) f.append(h('b', 'cp-foe-n', String(n)));
      return f;
    });
    if (!L.counts) kids.push(h('b', 'cp-foe-total', `×${total}`));
    c.foes.replaceChildren(...kids);
  }

  function showWorlds() {
    page = 'worlds'; world = null; fromWorlds = false;
    head.hidden = true; buildWorlds(); relabel(); layout();
    focusFirst();
  }
  function showBattles(w, viaWorlds = false) {
    page = 'battles'; world = w; fromWorlds = viaWorlds;
    head.hidden = false; buildBattles(w); relabel(); layout();
    focusFirst();
  }
  function focusFirst() {
    if (!matchMedia('(hover: hover)').matches) return;
    const cur = battle.id ? grid.querySelector(`[data-id="${battle.id}"], [data-world="${battle.id.split('-')[0]}"]`) : null;
    (cur || grid.querySelector('button:not([disabled])') || close).focus({ preventScroll: true });
  }
  /** Open the panel: world = that world's battles page, else the worlds page. */
  function show(w = null) {
    const was = open;
    if (!open) { open = true; back.hidden = false; }
    if (w && cm.WORLDS.includes(w)) showBattles(w, false); else showWorlds();
    if (!was && onOpenChange) onOpenChange(true);
  }
  function hide() {
    if (!open) return;
    open = false; back.hidden = true;
    for (const j of jobs) j.tries = T.TRIES;   // nothing left to paint into
    jobs.length = 0;
    if (document.activeElement && back.contains(document.activeElement)) document.activeElement.blur();
    if (onOpenChange) onOpenChange(false);
  }
  /** Esc / Back: a battles page opened from the worlds goes back to them, else the panel closes. */
  function escape() { if (!open) return false; if (page === 'battles' && fromWorlds) { snd('ui'); showWorlds(); } else hide(); return true; }

  // ================================================================ in a battle: the budget bar, the clock
  const bar = h('div', 'cp-bar'); bar.id = 'camp-bar'; bar.hidden = true; bar.setAttribute('role', 'meter');
  const track = h('div', 'cp-track'); const fill = h('i', 'cp-fill');
  const line3 = h('i', 'cp-line l3'), line2 = h('i', 'cp-line l2');
  line3.append(stars(3, 'cp-mini', 3)); line2.append(stars(2, 'cp-mini', 2));
  track.append(fill, line3, line2);
  const num = h('span', 'cp-num-box'); const numSpent = h('b', 'cp-spent'), numTotal = h('span', 'cp-total');
  num.append(numSpent, document.createTextNode(' / '), numTotal);
  bar.append(track, num);
  const clock = h('div', 'cp-clock'); clock.id = 'camp-clock'; clock.hidden = true; clock.setAttribute('role', 'timer');
  root.append(bar, clock);

  const battle = { id: null, lines: null, spentAtStart: null, over: '', shownKey: '', clockKey: '', result: null };
  function begin(id) {
    battle.id = id; battle.over = ''; battle.spentAtStart = null; battle.shownKey = ''; battle.clockKey = ''; battle.result = null;
    battle.lines = cm.budgetOf(id);
    hideResult();
    bar.hidden = false; clock.hidden = true;
    sync(true);
    placeBar();
  }
  function end() {
    battle.id = null; battle.over = ''; battle.lines = null; battle.result = null;
    bar.hidden = true; clock.hidden = true; hideResult();
  }
  function started() { const B = game() && game().budget; if (B) battle.spentAtStart = B.spent; }
  // the bar: paint spent / budget, the two star lines (their stars go empty once passed)
  function sync(force = false) {
    const g = game(), B = g && g.budget;
    if (!B || !battle.lines) return;
    const key = `${B.spent}|${B.total}`;
    if (!force && key === battle.shownKey) return;
    battle.shownKey = key;
    const tot = B.total > 0 ? B.total : 1, L = battle.lines;
    fill.style.width = `${Math.min(100, 100 * B.spent / tot)}%`;
    placeLines(track, line3, line2, L, tot);
    line3.classList.toggle('past', B.spent > L.star3); line2.classList.toggle('past', B.spent > L.star2);
    for (const s of line3.querySelectorAll('i')) s.classList.toggle('on', B.spent <= L.star3);
    for (const s of line2.querySelectorAll('i')) s.classList.toggle('on', B.spent <= L.star2);
    numSpent.textContent = String(Math.round(B.spent)); numTotal.textContent = String(Math.round(B.total));
    bar.setAttribute('aria-valuenow', String(B.spent)); bar.setAttribute('aria-valuemax', String(B.total));
    bar.setAttribute('aria-label', t('c_paint'));
  }
  // the two star lines on a track; equal lines (nice() rounding) = only the 3-star one (2 stars can't happen); close lines
  // put their stamps (and numbers) on their outer sides so they never sit on each other
  function placeLines(tr, l3, l2, L, tot) {
    const p3 = Math.min(100, 100 * L.star3 / tot), p2 = Math.min(100, 100 * L.star2 / tot);
    l3.style.left = `${p3}%`; l2.style.left = `${p2}%`;
    l2.hidden = L.star2 <= L.star3;
    const near = !l2.hidden && (p2 - p3) / 100 * (tr.clientWidth || 300) < T.LINE_NEAR;
    l3.classList.toggle('near', near); l2.classList.toggle('near', near);
  }
  // centred over the field, kept clear of the round buttons when they run along the top (desktop, phones on their side)
  function placeBar() {
    if (bar.hidden) return;
    const sa = safeArea(), st = document.documentElement.style;
    let lo = sa.l + T.EDGE, hi = innerWidth - sa.r - T.EDGE;
    const ctl = document.getElementById('controls'), cr = ctl ? ctl.getBoundingClientRect() : null;
    const top = sa.t + 10, bh = bar.offsetHeight || 46;
    if (cr && cr.width && cr.top < top + bh + 4 && cr.bottom > top) hi = Math.min(hi, cr.left - T.BAR_GAP);
    const w = Math.max(160, Math.min(T.BAR_MAX, hi - lo));
    const fl = parseFloat(st.getPropertyValue('--field-l')) || 0, fw = parseFloat(st.getPropertyValue('--field-w')) || innerWidth;
    const cx = Math.max(lo + w / 2, Math.min(hi - w / 2, fl + fw / 2));
    bar.style.width = `${w}px`; bar.style.left = `${Math.round(cx - w / 2)}px`; bar.style.top = `${top}px`;
    st.setProperty('--camp-under', `${Math.round(top + bh + 8)}px`);
    st.setProperty('--camp-mid', `${Math.round(cx)}px`);
  }
  function bump() {
    bar.classList.remove('cp-bump'); void bar.offsetWidth; bar.classList.add('cp-bump');
    clearTimeout(bump.t); bump.t = setTimeout(() => bar.classList.remove('cp-bump'), T.BUMP_MS);
  }
  /** Sim events of this frame: a stroke that ran out of paint bumps the bar (+ its sound), once per stroke. */
  let strokeBumped = false;
  function handleEvents(events) {
    if (!battle.id || !events || !events.length || strokeBumped) return;
    for (let i = 0; i < events.length; i++) if (events[i] && events[i].name === 'budgetOut') { bump(); snd('out'); strokeBumped = true; break; }
  }
  /** A paint stroke began (main.js): the next one that runs out of paint bumps again. */
  function newStroke() { strokeBumped = false; }
  /** Every drawn frame in a battle: the bar, the clock, the outcome. */
  function frame() {
    if (!battle.id) return;
    const g = game(), B = g && g.budget;
    if (!B) return;
    sync();
    // clock: the last 30 s of the time limit, after START
    let left = -1;
    if (B.locked && !battle.over) left = Math.max(0, cm.TIME_LIMIT - (g.world.time - B.startTime));
    const showClock = left >= 0 && left <= T.CLOCK_FROM;
    if (clock.hidden === showClock) clock.hidden = !showClock;
    if (showClock) {
      const s = Math.ceil(left), key = String(s);
      if (key !== battle.clockKey) { battle.clockKey = key; clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; clock.classList.toggle('last', s <= 10); }
    }
    if (!battle.over) { const res = cm.outcome(g); if (res) finish(res); }
  }

  // ================================================================ the result card
  const resBox = h('div', 'cp-result'); resBox.id = 'camp-result'; resBox.hidden = true; resBox.setAttribute('role', 'dialog');
  const card = h('div', 'cp-rcard port');
  const rTitle = h('h2', 'cp-rtitle');
  const rStars = h('div', 'cp-rstars'); const slots = [0, 1, 2].map(() => { const s = h('i', 'cp-rslot'); s.append(h('i', 'cp-rstamp')); rStars.append(s); return s; });
  const rBar = h('div', 'cp-rbar');
  const rSpent = h('b', 'cp-rspent');
  const rTrack = h('div', 'cp-track'); const rFill = h('i', 'cp-fill'); const rl3 = h('i', 'cp-line l3'), rl2 = h('i', 'cp-line l2');
  rl3.append(stars(3, 'cp-mini', 3), h('b', 'cp-lnum')); rl2.append(stars(2, 'cp-mini', 2), h('b', 'cp-lnum'));
  rTrack.append(rFill, rl3, rl2); rBar.append(rSpent, rTrack);
  const rBtns = h('div', 'cp-rbtns');
  const bRetry = h('button', 'big-button cp-retry'); bRetry.type = 'button';
  const bNext = h('button', 'big-button cp-next'); bNext.type = 'button';
  const bBattles = h('button', 'big-button secondary cp-battles'); bBattles.type = 'button';
  const bStats = h('button', 'big-button secondary cp-stats'); bStats.type = 'button';
  rBtns.append(bRetry, bNext, bBattles, bStats);
  const paper = h('div', 'cp-rpaper');   // the card itself (pops in); `card` places + scales it
  paper.append(rTitle, rStars, rBar, rBtns); card.append(paper); resBox.append(card); root.append(resBox);
  const blurIt = (e) => { if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); };
  bRetry.addEventListener('click', (e) => { blurIt(e); if (battle.id && onRetry) onRetry(battle.id); });
  bNext.addEventListener('click', (e) => { blurIt(e); const n = battle.id && cm.nextLevel(battle.id); if (n && onNext) onNext(n.id); });
  bBattles.addEventListener('click', (e) => { blurIt(e); if (battle.id && onBattles) onBattles(battle.id.split('-')[0]); });
  bStats.addEventListener('click', (e) => { blurIt(e); if (onReport) onReport(); });
  let stampT = [], resLay = null;

  function finish(res) {
    const g = game(), B = g.budget, won = res === 'win';
    const spent = battle.spentAtStart ?? B.spent;
    const st = cm.starsFor(battle.id, won, spent);
    battle.over = res;
    const best = store.record(battle.id, st, spent);
    battle.result = { res, won, stars: st, spent, best };
    clock.hidden = true;
    showResult();
    if (opts.onOver) opts.onOver(battle.result);
  }
  function showResult() {
    const r = battle.result; if (!r) return;
    const L = battle.lines, tot = (game().budget || {}).total || L.budget;
    resBox.hidden = false;
    resBox.classList.toggle('won', r.won); resBox.classList.toggle('lost', !r.won);
    for (const s of slots) s.classList.remove('stamped');
    rFill.style.width = `${Math.min(100, 100 * r.spent / tot)}%`;
    placeLines(rTrack, rl3, rl2, L, tot);
    rl3.querySelector('.cp-lnum').textContent = String(L.star3); rl2.querySelector('.cp-lnum').textContent = String(L.star2);
    rSpent.textContent = String(Math.round(r.spent));
    bNext.hidden = !cm.nextLevel(battle.id);
    bNext.classList.toggle('secondary', !r.won); bRetry.classList.toggle('secondary', r.won);
    resultRelabel();
    document.body.classList.add('camp-over');
    layoutResult();
    placeLines(rTrack, rl3, rl2, L, tot);   // again at its laid-out width
    if (r.won) snd('win'); else snd('lose');
    stampT.forEach(clearTimeout); stampT = [];
    for (let i = 0; i < r.stars; i++) stampT.push(setTimeout(() => { slots[i].classList.add('stamped'); snd('stamp', i); }, T.STAMP_FIRST + i * T.STAMP_MS));
    const primary = r.won && !bNext.hidden ? bNext : bRetry;
    if (matchMedia('(hover: hover)').matches) primary.focus({ preventScroll: true });
  }
  function hideResult() {
    stampT.forEach(clearTimeout); stampT = [];
    resBox.hidden = true; document.body.classList.remove('camp-over');
    if (document.activeElement && resBox.contains(document.activeElement)) document.activeElement.blur();
  }
  function resultRelabel() {
    const r = battle.result;
    rTitle.textContent = !r ? '' : r.won ? t('c_win') : r.res === 'time' ? t('c_time') : t('c_lose');
    bRetry.textContent = t('c_retry'); bNext.textContent = t('c_next'); bBattles.textContent = t('c_battles'); bStats.textContent = t('stats');
    rStars.setAttribute('aria-label', r ? t('c_stars', { n: r.stars, m: 3 }) : '');
    rSpent.setAttribute('aria-label', t('c_paint'));
    if (!resBox.hidden) fitResult();
  }
  // the card in the free part of the screen: under the bar / the round buttons' row, left of their column on a phone
  function layoutResult() {
    if (resBox.hidden) return;
    const sa = safeArea();
    let l = sa.l + T.EDGE, r = innerWidth - sa.r - T.EDGE, tp = sa.t + T.EDGE, b = innerHeight - sa.b - T.EDGE;
    const ctl = document.getElementById('controls'), cr = ctl ? ctl.getBoundingClientRect() : null;
    let L = null;
    if (cr && cr.width) {
      if (cr.height > cr.width) {   // a column (phone upright): keep left of it
        // STEP10 LEAD: a small phone wraps the column into a second one (one or two buttons at its top): either keep
        // left of the main column and under the wrapped buttons, or left of both, whichever gives the bigger card
        const bs = [...ctl.children].filter((e) => !e.hidden && e.offsetWidth).map((e) => e.getBoundingClientRect());
        const mainL = Math.max(...bs.map((x) => x.left)), extra = bs.filter((x) => x.right <= mainL + 1);
        const B = resultLayout(Math.min(r, cr.left - 8) - l, b - tp);
        if (extra.length) {
          const tpA = Math.max(tp, Math.max(...extra.map((x) => x.bottom)) + 8), A = resultLayout(Math.min(r, mainL - 8) - l, b - tpA);
          if (A.k > B.k) { L = A; r = Math.min(r, mainL - 8); tp = tpA; }
        }
        if (!L) { L = B; r = Math.min(r, cr.left - 8); }
      } else tp = Math.max(tp, cr.bottom + 8);                  // a row along the top
    }
    if (!L) L = resultLayout(r - l, b - tp);
    resLay = L;
    card.classList.toggle('land', L.land); card.classList.toggle('port', !L.land);
    const st = card.style;
    st.width = `${L.w}px`; st.height = `${L.h}px`; st.transform = `scale(${L.k})`;
    st.left = `${Math.round(l + (r - l - L.w * L.k) / 2)}px`; st.top = `${Math.round(tp + (b - tp - L.h * L.k) / 2)}px`;
    fitResult();
  }
  function fitResult() {
    for (const e of [rTitle, bRetry, bNext, bBattles, bStats]) {
      e.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(e).fontSize);
      for (let k = 0; k < 14 && fs > 9 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2); k++) { fs *= 0.9; e.style.fontSize = `${fs.toFixed(1)}px`; }
    }
  }

  addEventListener('resize', () => { layout(); placeBar(); layoutResult(); });
  relabel();

  return {
    el: back, show, hide, escape, relabel, layout, placeBar,
    showWorlds() { show(null); }, showBattles: (w) => show(w),
    get open() { return open; }, get page() { return page; }, get world() { return world; }, get layout_() { return lay; },
    begin, end, started, frame, handleEvents, newStroke, bump,
    get id() { return battle.id; }, get active() { return !!battle.id; }, get over() { return battle.over; },
    get result() { return battle.result ? { ...battle.result } : null; }, get resultLayout() { return resLay; },
    get resultOpen() { return !resBox.hidden; },
    /** the primary result button (Enter): Next after a win, else Retry */
    primary() { if (resBox.hidden) return false; const b = battle.result && battle.result.won && !bNext.hidden ? bNext : bRetry; b.click(); return true; },
    hideResult,
  };
}
