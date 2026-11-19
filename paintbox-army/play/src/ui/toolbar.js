// Toolbar: tabs + tool row (OG page-ui.js:509-659, terrain-team-ui.md §5.3). Owner: UI.
// - tabs in OG order, each tab remembers its last pick (page-ui.js:550, 587-590)
// - starting tool = tool 0, first Army unit (page-ui.js:1071)
// - phone: the row scrolls sideways to keep the pick in view (page-ui.js:563-574)
// - desktop: panel min-width = widest tab so it doesn't jump (page-ui.js:605-659)
// - hover tooltip with name + 1-9 key (page-ui.js:591-603)
// - look A: tabs are painted blobs with icons (index.html --img-tab-*); the tab word stays as an sr-only label
// - OURS (Part 2 step 4 + 6, up to 13 tabs): the tab strip sizes its slots to the room it has.
//   Desktop / landscape: one row while it is no more than a tab wider than the tool cards, else two rows (13 tabs =
//   7 + 6, as wide as the cards: no empty kraft). Phones: one row; all tabs fit at 64 px or squeezed to 58 (an unpicked
//   blob is 50 wide: 8 px of kraft between blobs), else it scrolls sideways like the tool row, slots sized so a half tab
//   peeks out at the edge, the blobs fading into the kraft where there is more, the open tab kept in view with half a
//   neighbour showing on each side.
// - the bar is centred; when that would put it under the Team battle pill (bottom right, 641-810 px wide screens) it
//   slides left until it clears the pill.
// - ?alltabs: every tab shows even before its units are registered; a tool whose unit isn't registered yet is greyed
//   and can't be picked (painting a type with no def would crash the painter). ?alltabs=N: only the first N tabs
//   (Terrain kept last), to check the strip at the tab counts between 7 and 13 while the units land.
// - OURS (Part 2 step 7, STEP7.md): the Secret tab shows all 8 map secret units once any of them is registered. A unit
//   not found yet is a locked card: its dark silhouette, a padlock and the name of the map it hides on; tapping it opens
//   the maps panel with that map marked (opts.secret.onLocked). Found = a normal card. refreshSecret() after a find,
//   openSecret(type) opens the tab with that unit picked.
// - OURS (Part 2 step 8, STEP8.md): the Mine tab = the units the player made (opts.mine). It shows whenever the maker is
//   there (even with none made: its + card opens the maker). Cards = the made units in store order (their own icon, the
//   name the player typed on a chip when there is one), then the + card (gone at 12 made). The picked made card gets an
//   edit button right after it (a narrow pencil card). refreshMine(pick) after a save / delete rebuilds the made cards
//   (tools.js setMineTools) and picks `pick`.
// - OURS (Part 2 step 9, STEP9.md): setCampaign(on, priceOf) for a campaign battle: the Terrain tab is hidden (the map
//   is the level) and every unit card shows its paint price on a blue chip (priceOf(type) -> paint, or null = not for
//   sale here: the card can't be picked). Off again = the sandbox's bar as it was.
import { CATEGORIES as ALL_CATEGORIES, TOOLS, toolSpec, setMineTools } from './tools.js';
import { getDef } from '../sim/defs.js';
import { t, unitName } from './strings.js';

const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const ALL = QS.has('alltabs');
const ALL_N = parseInt(QS.get('alltabs'), 10) || 0; // ?alltabs=7: the first 6 tabs + Terrain
// tab slot widths, CSS px: PIC = the painted tab picture (ui-paint.js SIZE.tab). An unpicked blob is 50 wide, the picked
// one 57: MIN keeps 8 px of kraft between blobs (54-56 px slots looked like touching, 11-14); a scrolling strip's slots
// sit between MIN and MAX, nearest AIM. PAD = strip padding each side (clears the torn edge). PILL = gap kept to the
// Team battle pill.
const PIC = 64, MIN = 58, MAX = 72, AIM = 62, PAD = 8, PILL = 8;
const TPAD = 6; // STEP8 UI: tight two rows (15 tabs on a 667 px phone on its side): strip flush with the panel, this padding

export function createToolbar(root, { iconFor, onSelect, onLayout, secret = null, mine = null }) {
  if (mine) setMineTools(mine.types());   // STEP8 UI: the made units' tools (end of TOOLS)
  let tab = ALL_CATEGORIES[0], selected = -1;
  const lastPicked = {};
  let hiddenCats = new Set(), priceOf = null; // STEP9 UI: a campaign battle: tabs left out (Terrain), unit prices
  root.innerHTML = '';
  const tabs = document.createElement('div'); tabs.className = 'tool-tabs';
  const strip = document.createElement('div'); strip.className = 'tab-scroll'; strip.setAttribute('role', 'tablist');
  tabs.append(strip);
  const panel = document.createElement('div'); panel.className = 'tool-panel';
  const row = document.createElement('div'); row.className = 'tool-row';
  panel.append(row); root.append(tabs, panel);
  const tip = document.createElement('div'); tip.className = 'tool-tip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip);

  // A unit tool shows only once its unit is registered (Part 2 step 4: a new tab appears when its first unit lands).
  // Secret tab (step 7): all 8 show once any is registered; one not found yet is locked (shown, can't be picked).
  const registered = (tl) => tl.kind !== 'unit' || !!getDef(tl.type);
  const isSecret = (tl) => tl.category === 'secret';
  const locked = (tl) => !!secret && isSecret(tl) && !secret.has(tl.type);
  const priced = (tl) => !priceOf || tl.kind !== 'unit' || priceOf(tl.type) != null; // STEP9 UI: not for sale = can't pick
  const live = (tl) => registered(tl) && !locked(tl) && priced(tl);
  const anySecret = TOOLS.some((tl) => isSecret(tl) && registered(tl));
  const members = (cat) => { const m = []; TOOLS.forEach((tl, i) => { if (tl.category === cat && (ALL || registered(tl) || (cat === 'secret' && anySecret))) m.push(i); }); return m; };
  const firstLive = (cat) => members(cat).find((i) => live(TOOLS[i]));
  let CATEGORIES = ALL_CATEGORIES.filter((c) => (c === 'mine' ? !!mine : ALL || members(c).length > 0)); // STEP8 UI: Mine = the maker is there
  if (ALL_N > 1 && ALL_N < CATEGORIES.length) CATEGORIES = [...CATEGORIES.filter((c) => c !== 'terrain').slice(0, ALL_N - 1), 'terrain'];
  const shownCats = () => CATEGORIES.filter((c) => !hiddenCats.has(c)); // STEP9 UI
  const nameOf = (tl) => unitName(tl.kind === 'unit' ? tl.type : tl.kind);
  const whereOf = (tl) => (secret && secret.mapOf ? t('map_' + secret.mapOf(tl.type)) : ''); // a locked card's map name
  const tabWord = (cat) => { const w = t('tab_' + cat); return w === 'tab_' + cat ? cat : w; };

  const tabEls = CATEGORIES.map(cat => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool-tab'; b.setAttribute('role', 'tab'); b.dataset.tab = cat;
    const label = document.createElement('span'); label.className = 'tab-label'; b.append(label); // painted look: icon blob, word kept for screen readers
    b.addEventListener('click', () => openTab(cat, true));
    strip.append(b); return b;
  });
  const makeToolEl = (tl, i, now = false) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.dataset.tool = tl.key;
    const img = iconFor(toolSpec(tl), now); img.classList.add('tool-icon');   // now: a made card after a save shows its picture at once
    const nm = document.createElement('span'); nm.className = 'tool-name';
    b.append(img, nm);
    if (tl.kind === 'unit') { const pr = document.createElement('span'); pr.className = 'tool-price'; pr.hidden = true; pr.setAttribute('aria-hidden', 'true'); b.append(pr); } // STEP9 UI: its price in a campaign battle
    if (tl.category === 'mine') { // STEP8 UI: a made unit: the name the player typed on a chip (none = no chip)
      b.classList.add('made');
      const tag = document.createElement('span'); tag.className = 'tool-tag'; tag.setAttribute('aria-hidden', 'true');
      b.append(tag);
    }
    if (isSecret(tl)) { // locked look: silhouette (SECRET-ART's HIDE_ICON picture, else the icon darkened by CSS), padlock, map name
      b.classList.add('secret');
      const hide = secret && secret.hideIcon ? secret.hideIcon(tl.type) : null;
      if (hide) { hide.classList.add('tool-hide'); b.append(hide); b.classList.add('has-hide'); }
      const lock = document.createElement('span'); lock.className = 'tool-lock'; lock.setAttribute('aria-hidden', 'true');
      const where = document.createElement('span'); where.className = 'tool-where'; where.setAttribute('aria-hidden', 'true');
      b.append(lock, where);
    }
    b.addEventListener('click', () => {
      const t0 = TOOLS[i];
      if (locked(t0)) { hideTip(); if (secret.onLocked) secret.onLocked(t0.type); return; }
      if (live(t0)) selectIndex(i);
    });
    b.addEventListener('pointerenter', () => showTip(i));
    b.addEventListener('pointerleave', hideTip);
    return b;
  };
  const toolEls = TOOLS.map((tl, i) => makeToolEl(tl, i));
  // STEP8 UI: the + card (opens the maker for a new unit) and the edit button after the picked made card
  const addEl = document.createElement('button'); addEl.type = 'button'; addEl.className = 'tool tool-add';
  addEl.addEventListener('click', () => { hideTip(); if (mine && mine.onAdd) mine.onAdd(); });
  addEl.addEventListener('pointerenter', () => showTipEl(addEl, t('make_new')));
  addEl.addEventListener('pointerleave', hideTip);
  const editEl = document.createElement('button'); editEl.type = 'button'; editEl.className = 'tool-edit';
  editEl.addEventListener('click', () => { hideTip(); const tl = TOOLS[selected]; if (mine && mine.onEdit && tl && tl.category === 'mine') mine.onEdit(tl.type); });
  editEl.addEventListener('pointerenter', () => showTipEl(editEl, t('edit')));
  editEl.addEventListener('pointerleave', hideTip);
  const canAdd = () => !!mine && (!mine.canAdd || mine.canAdd());

  function relabel() {
    tabEls.forEach((b, k) => { const w = tabWord(CATEGORIES[k]); b.firstChild.textContent = w; b.setAttribute('aria-label', w); b.title = w; });
    toolEls.forEach((b, i) => {
      const tl = TOOLS[i], n = nameOf(tl), lk = locked(tl);
      b.setAttribute('aria-label', lk ? `${t('locked')}: ${whereOf(tl)}` : n);
      b.querySelector('.tool-name').textContent = lk ? '' : n;
      const wh = b.querySelector('.tool-where'); if (wh) { wh.textContent = whereOf(tl); fitWhere(wh); }
      const tg = b.querySelector('.tool-tag'); if (tg) { const s = mine && mine.tag ? mine.tag(tl.type) : ''; tg.textContent = s; tg.hidden = !s; b.classList.toggle('tagged', !!s); if (s) fitTag(tg); }
      const pr = b.querySelector('.tool-price'); // STEP9 UI: the paint price (campaign battle only; a locked card shows none)
      if (pr) { const p = priceOf && !lk ? priceOf(tl.type) : null; pr.textContent = p != null ? String(p) : ''; pr.hidden = p == null; b.classList.toggle('priced', p != null); if (p != null) b.setAttribute('aria-label', `${n}: ${p}`); }
    });
    addEl.setAttribute('aria-label', t('make_new')); editEl.setAttribute('aria-label', t('edit'));
  }
  // a map name wider than the card shrinks to fit (Frozen Lake)
  function fitWhere(wh) {
    wh.style.fontSize = '';
    if (!wh.isConnected || !wh.offsetParent) { wh.dataset.fit = '1'; return; }
    delete wh.dataset.fit;
    const room = wh.clientWidth - 3, wd = wh.scrollWidth - 2;   // its own box less the padding (overflow: hidden)
    if (wd > room) wh.style.fontSize = `${Math.max(7, parseFloat(getComputedStyle(wh).fontSize) * room / wd).toFixed(1)}px`;
  }
  // STEP8 UI: a made card's name chip: one line, shrinking to 7.5 px; a longer name (up to 16 letters) takes two lines
  function fitTag(tg) {
    tg.style.fontSize = ''; tg.classList.remove('two');
    if (!tg.isConnected || !tg.offsetParent) { tg.dataset.fit = '1'; return; }
    delete tg.dataset.fit;
    let fs = parseFloat(getComputedStyle(tg).fontSize);
    while (tg.scrollWidth > tg.clientWidth + 0.5 && fs > 7.5) { fs -= 0.5; tg.style.fontSize = `${fs}px`; }
    if (tg.scrollWidth <= tg.clientWidth + 0.5) return;
    tg.classList.add('two'); fs = 9;
    tg.style.fontSize = `${fs}px`;
    while ((tg.scrollHeight > tg.clientHeight + 0.5 || tg.scrollWidth > tg.clientWidth + 0.5) && fs > 7) { fs -= 0.5; tg.style.fontSize = `${fs}px`; }
  }
  function renderRow(cat, measure = false) {
    const kids = members(cat).map(i => {
      const b = toolEls[i], lk = locked(TOOLS[i]), off = !lk && (!registered(TOOLS[i]) || !priced(TOOLS[i])); // STEP9 UI: + not for sale
      b.classList.toggle('off', off);
      b.classList.toggle('locked', lk);
      if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      return b;
    });
    if (cat === 'mine') { // STEP8 UI: + card last; measuring the panel width: room for the edit button too
      if (measure && kids.length) kids.push(editEl);
      if (canAdd()) kids.push(addEl);
    }
    row.replaceChildren(...kids);
    if (cat === 'mine' && !measure) placeEdit();
    for (const wh of row.querySelectorAll('.tool-where[data-fit]')) fitWhere(wh);
    for (const tg of row.querySelectorAll('.tool-tag[data-fit]')) fitTag(tg);
  }
  // STEP8 UI: the edit button sits right after the picked made card (only while the Mine tab is open)
  function placeEdit() {
    const tl = TOOLS[selected], b = tl && tl.category === 'mine' && tab === 'mine' ? toolEls[selected] : null;
    if (b && b.parentElement === row) { if (b.nextSibling !== editEl) b.after(editEl); }
    else if (editEl.parentElement) editEl.remove();
  }
  function paintState() {
    tabEls.forEach((b, k) => { const open = CATEGORIES[k] === tab; b.classList.toggle('open', open); b.setAttribute('aria-selected', String(open)); });
    toolEls.forEach((b, i) => b.classList.toggle('active', i === selected));
    placeEdit();
  }
  function switchTab(cat, smooth) {
    if (cat === tab) return;
    tab = cat; hideTip(); renderRow(tab);
    requestAnimationFrame(() => { revealTab(smooth); onLayout && onLayout(); });
  }
  function selectIndex(i, user = true, smooth = false) {
    const tl = TOOLS[i]; if (!tl || !live(tl)) return;
    lastPicked[tl.category] = i;
    switchTab(tl.category, smooth);
    selected = i; paintState();
    onSelect(toolSpec(tl), user, tl);
    requestAnimationFrame(() => reveal(i));
  }
  function reveal(i) {
    const b = toolEls[i]; if (!b || b.parentElement !== row) return;
    if (row.scrollWidth <= row.clientWidth) return;
    const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    const br = b.getBoundingClientRect(), rr = row.getBoundingClientRect();
    const right = b.nextSibling === editEl ? editEl.getBoundingClientRect().right : br.right; // STEP8 UI: the edit button comes into view with its card
    const lo = row.scrollLeft + br.left - rr.left - pad, hi = row.scrollLeft + right - rr.left + pad - row.clientWidth;
    if (row.scrollLeft > lo) row.scrollLeft = lo; else if (row.scrollLeft < hi) row.scrollLeft = hi;
  }
  // Keep the open tab in view with half a neighbour showing each side (so the fade never covers it).
  function revealTab(smooth = false) {
    const b = tabEls[CATEGORIES.indexOf(tab)];
    const max = strip.scrollWidth - strip.clientWidth;
    if (b && max > 1) {
      const peek = b.offsetWidth * 0.5, lo = b.offsetLeft - peek, hi = b.offsetLeft + b.offsetWidth + peek - strip.clientWidth;
      let to = strip.scrollLeft;
      if (to > lo) to = lo; else if (to < hi) to = hi;
      to = Math.max(0, Math.min(max, Math.round(to)));
      if (Math.abs(to - strip.scrollLeft) > 0.5) strip.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' });
    }
    edges();
  }
  // .more-l / .more-r: there are tabs past that edge (CSS fades the blobs into the kraft there)
  function edges() {
    const max = strip.scrollWidth - strip.clientWidth;
    strip.classList.toggle('more-l', max > 1 && strip.scrollLeft > 1);
    strip.classList.toggle('more-r', max > 1 && strip.scrollLeft < max - 1);
  }
  strip.addEventListener('scroll', edges, { passive: true });
  // a mouse wheel over a strip or row that scrolls sideways scrolls it (a narrow desktop window has no swipe)
  for (const sc of [strip, row]) sc.addEventListener('wheel', (e) => {
    if (e.ctrlKey || sc.scrollWidth <= sc.clientWidth + 1) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    sc.scrollLeft += d * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? sc.clientWidth : 1);
    e.preventDefault();
  }, { passive: false });

  function openTab(cat, smooth = false) {
    const i = lastPicked[cat] ?? firstLive(cat);
    if (i !== undefined) { selectIndex(i, false, smooth); return; }
    switchTab(cat, smooth); paintState(); // ?alltabs: a tab with no registered unit yet opens greyed; the old tool stays
  }
  function nextTab(dir) { const C = shownCats(), k = C.indexOf(tab); openTab(C[(k + dir + C.length) % C.length], true); } // STEP9 UI: shown tabs only
  function selectSlot(slot) { const i = members(tab)[slot]; if (i !== undefined) selectIndex(i); }
  function showTip(i) {
    const b = toolEls[i]; if (!b) return;
    const slot = members(tab).indexOf(i), r = b.getBoundingClientRect();
    tip.replaceChildren(document.createTextNode(locked(TOOLS[i]) ? whereOf(TOOLS[i]) : nameOf(TOOLS[i])));
    if (slot >= 0 && slot < 9) { const k = document.createElement('kbd'); k.textContent = String(slot + 1); tip.append(k); }
    tip.style.left = `${Math.round(r.left + r.width / 2)}px`; tip.style.top = `${Math.round(r.top - 7)}px`;
    tip.classList.add('show');
  }
  function showTipEl(b, text) { // STEP8 UI: + card / edit button
    const r = b.getBoundingClientRect();
    tip.replaceChildren(document.createTextNode(text));
    tip.style.left = `${Math.round(r.left + r.width / 2)}px`; tip.style.top = `${Math.round(r.top - 7)}px`;
    tip.classList.add('show');
  }
  function hideTip() { tip.classList.remove('show'); }

  const phone = () => matchMedia('(max-width: 640px)').matches;
  const pillBox = () => { const tm = document.getElementById('teams'), r = tm && tm.getBoundingClientRect(); return r && r.width && r.left > innerWidth / 2 ? r : null; };
  const edges2 = () => { // left / right gap the bar keeps to the screen edge: --edge + the safe area
    const sp = getComputedStyle(document.getElementById('safe-probe') || document.body);
    const e = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge')) || 14;
    return [e + (parseFloat(sp.paddingLeft) || 0), e + (parseFloat(sp.paddingRight) || 0)];
  };
  // Size the tab slots to the room the strip has; returns the strip width (CSS px).
  function layoutTabs(toolsW) {
    const n = shownCats().length, cs = getComputedStyle(tabs); // STEP9 UI: a hidden tab takes no slot
    const margins = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
    let room, rows = 1, per = n, slot, scroll = false;
    if (phone()) room = root.getBoundingClientRect().width - margins;
    else {
      const [el, er] = edges2(), pill = pillBox();
      room = innerWidth - el - er;
      if (pill) room = Math.min(room, pill.left - PILL - el); // the bar slides left of the pill (place())
      room = Math.max(room, toolsW) - margins;
    }
    const V = room - 2 * PAD, VT = room + margins - 2 * TPAD;
    let tight = false;
    // desktop: more than a tab wider than the cards -> two rows (13 = 7 + 6), so the strip isn't a long empty kraft card
    if (!phone() && n > 1 && n * PIC + 2 * PAD + margins > toolsW + PIC && Math.ceil(n / 2) * MIN <= V) {
      rows = 2; per = Math.ceil(n / 2); slot = Math.min(PIC, Math.floor(V / per));
    } else if (!phone() && n > 1 && n * MIN > V && Math.ceil(n / 2) * MIN <= VT) { // STEP8 UI: two rows only fit flush (15 tabs, 667 px)
      rows = 2; per = Math.ceil(n / 2); slot = Math.min(PIC, Math.floor(VT / per)); tight = true;
    } else if (n * PIC <= V) slot = PIC;
    else if (n * MIN <= V) slot = Math.floor(V / n);
    else { // scrolls: k whole tabs + half of the next one show, slot between MIN and MAX, nearest AIM
      scroll = true;
      if (!phone()) { room = Math.min(room, Math.max(toolsW - margins, 6 * MIN)); } // as wide as the cards, no wider
      const W = room - 2 * PAD;
      let k = Math.max(1, Math.floor(W / MIN - 0.5));
      for (let j = k; j >= 1 && W / (j + 0.5) <= MAX; j--) if (Math.abs(W / (j + 0.5) - AIM) < Math.abs(W / (k + 0.5) - AIM)) k = j;
      slot = W / (k + 0.5);
    }
    root.style.setProperty('--tab-slot', `${slot}px`);
    root.classList.toggle('tabs-2', rows === 2);
    root.classList.toggle('tabs-tight', tight);
    const w = scroll ? room : per * slot + 2 * (tight ? TPAD : PAD);
    tabs.style.width = `${w}px`;
    return w + (tight ? 0 : margins);
  }
  // Centred, unless that puts the bar under the Team battle pill: then it slides left until it clears it.
  function place() {
    root.style.left = ''; root.style.transform = '';
    if (phone()) return;
    const pill = pillBox(); if (!pill) return;
    const r = root.getBoundingClientRect();
    if (r.right <= pill.left - PILL || pill.bottom <= r.top || r.bottom <= pill.top) return;
    root.style.left = `${Math.max(edges2()[0], pill.left - PILL - r.width)}px`; root.style.transform = 'none';
  }
  let stale = false;
  function fitWidth(notify = true) {
    if (!root.getClientRects().length) { stale = true; return; } // hidden (possess): lay out again when it shows
    stale = false;
    panel.style.minWidth = ''; panel.style.maxWidth = '';
    let w = 0;
    if (!phone()) {
      const keep = tab;
      for (const cat of shownCats()) { renderRow(cat, true); w = Math.max(w, panel.getBoundingClientRect().width); } // STEP9 UI: shown tabs only
      renderRow(keep);
      // step 7: Terrain has 11 tools (654 px). Where that is wider than the room left of the Team battle pill (641-810 px
      // wide windows, phones on their side) the panel stops there and the long row wraps to a second line.
      const [el, er] = edges2(), pill = pillBox();
      const cap = Math.floor(pill ? Math.min(innerWidth - el - er, pill.left - PILL - el) : innerWidth - el - er);
      if (w > cap) { w = cap; panel.style.maxWidth = `${cap}px`; }
    }
    const tw = layoutTabs(Math.ceil(w));
    if (!phone()) panel.style.minWidth = `${Math.ceil(Math.min(Math.max(w, tw), parseFloat(panel.style.maxWidth) || Infinity))}px`;
    root.classList.toggle('tabs-wide', tabs.getBoundingClientRect().right >= panel.getBoundingClientRect().right - 12);
    place();
    revealTab();
    if (notify && onLayout) onLayout();
  }

  relabel(); renderRow(tab); paintState();
  addEventListener('resize', () => fitWidth());
  // the Team battle pill changes width with the language (and the font load): keep clear of it
  const pillEl = document.getElementById('teams');
  if (pillEl && typeof ResizeObserver !== 'undefined') { let pw = pillEl.offsetWidth; new ResizeObserver(() => { if (pillEl.offsetWidth !== pw) { pw = pillEl.offsetWidth; fitWidth(); } }).observe(pillEl); }
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(() => { if (stale) fitWidth(); }).observe(root);
  fitWidth(false); // sized before the first frame (main.js gets the toolbar object back only after this returns)
  requestAnimationFrame(() => fitWidth());
  // Step 7: after a find, the unit's card unlocks; openSecret opens the Secret tab with it picked (greyed if its unit
  // isn't registered yet: the tab opens on the old tool)
  function refreshSecret() { relabel(); renderRow(tab); paintState(); }
  function openSecret(type) {
    const i = TOOLS.findIndex((tl) => isSecret(tl) && tl.type === type);
    if (i >= 0 && live(TOOLS[i])) selectIndex(i, true, true);
    else if (CATEGORIES.includes('secret')) openTab('secret', true);
  }
  // STEP8 UI: the made units changed (save, delete, another tab's units merged in): rebuild the Mine cards. pick = the type
  // to pick (a save: the unit just made / edited). The picked made unit gone (deleted): its neighbour is picked, or with
  // none left the Mine tab stays open on its + card and the tool goes back to tool 0 (a deleted type can't be painted).
  function refreshMine(pick = null) {
    if (!mine) return;
    const keyOf = (i) => (i >= 0 && TOOLS[i] ? TOOLS[i].key : null);
    const selKey = keyOf(selected), selMine = selected >= 0 && TOOLS[selected].category === 'mine';
    const oldSlot = selMine ? members('mine').indexOf(selected) : -1;
    const lastKey = lastPicked.mine !== undefined ? keyOf(lastPicked.mine) : null;
    const first = TOOLS.findIndex((tl) => tl.category === 'mine');
    toolEls.length = first < 0 ? TOOLS.length : first;
    setMineTools(mine.types());
    for (let i = toolEls.length; i < TOOLS.length; i++) toolEls.push(makeToolEl(TOOLS[i], i, true));
    const idx = (k) => (k == null ? -1 : TOOLS.findIndex((tl) => tl.key === k));
    selected = idx(selKey);
    const lp = idx(lastKey); if (lp >= 0 && TOOLS[lp].category === 'mine') lastPicked.mine = lp; else delete lastPicked.mine;
    relabel();
    const pi = idx(pick);
    if (pi >= 0 && live(TOOLS[pi])) selectIndex(pi, true, true);
    else if (selMine && selected < 0) {
      const m = members('mine').filter((i) => live(TOOLS[i]));
      if (m.length) selectIndex(m[Math.max(0, Math.min(oldSlot, m.length - 1))], true);
      else { selected = 0; lastPicked[TOOLS[0].category] = 0; onSelect(toolSpec(TOOLS[0]), true, TOOLS[0]); }
    }
    renderRow(tab); paintState(); fitWidth();
  }
  // STEP9 UI: a campaign battle (on) or the sandbox (off). on: Terrain hidden, prices on the unit cards, a picked tool that
  // can't be used here (terrain, not for sale) gives way to the open tab's first unit (Army's when Terrain was open).
  function setCampaign(on, price = null) {
    hiddenCats = on ? new Set(['terrain']) : new Set();
    priceOf = on && typeof price === 'function' ? price : null;
    tabEls.forEach((b, k) => { b.hidden = hiddenCats.has(CATEGORIES[k]); });
    relabel();
    const cur = TOOLS[selected];
    if (hiddenCats.has(tab) || !cur || !live(cur)) {
      const cat = hiddenCats.has(tab) ? shownCats()[0] : tab;
      const i = (lastPicked[cat] !== undefined && live(TOOLS[lastPicked[cat]]) ? lastPicked[cat] : firstLive(cat)) ?? firstLive(shownCats()[0]);
      if (i !== undefined) selectIndex(i, true);
    }
    renderRow(tab); paintState(); fitWidth();
  }
  return {
    el: root, selectIndex, selectSlot, nextTab, openTab, refreshSecret, openSecret, refreshMine, relabel() { relabel(); fitWidth(); }, fitWidth, setCampaign, // STEP9 UI: setCampaign
    get tab() { return tab; }, get tabs() { return shownCats(); }, // STEP9 UI: the tabs shown
    get selected() { return selected; }, get tool() { return selected >= 0 ? toolSpec(TOOLS[selected]) : null; },
  };
}
