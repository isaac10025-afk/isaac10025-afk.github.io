// Count chip (#counts), OG page-ui.js:780-930, terrain-team-ui.md §5.4. Owner: UI.
// - polls every 150 ms; counts every live unit by type, props included
// - sort: count high->low, ties keep the previous order, then type index
// - top 7 shown, "+N more" / "Show less" toggle
// - bottom-left; moves up 8 px above the toolbar when they would overlap; hidden when empty
// - look A: icon + painted digits; the name stays as screen-reader text (index.html .count-name)
import { t, unitName } from './strings.js';
import { typeIndex } from './tools.js';

const MAX_ROWS = 7;

export function createCounts(el, { getCounts, iconFor, toolbarEl }) {
  let shown = new Map(), order = [], expanded = false;
  const rows = new Map(); // type -> {row, b, span}
  const more = document.createElement('button'); more.type = 'button'; more.className = 'count-more';
  more.addEventListener('click', () => { expanded = !expanded; render(); });

  function rowFor(type) {
    let r = rows.get(type);
    if (!r) {
      const row = document.createElement('div'); row.className = 'count'; row.dataset.type = type;
      const img = iconFor({ kind: 'unit', type }, true); img.classList.add('count-icon');   // painted at once (main.js iconFor)
      // the number twice: plain text (screen readers, fallback look) and painted digits (look A, --img-d0..9)
      const b = document.createElement('b'); b.className = 'count-n';
      const num = document.createElement('span'); num.className = 'num';
      const dg = document.createElement('span'); dg.className = 'count-dg'; dg.setAttribute('aria-hidden', 'true');
      b.append(num, dg);
      const span = document.createElement('span'); span.className = 'count-name';
      row.append(img, b, span); r = { row, num, dg, span, v: '' }; rows.set(type, r);
    }
    return r;
  }
  function setNumber(r, v) {
    r.v = v; r.num.textContent = v;
    r.dg.replaceChildren(...[...v].map(ch => { const i = document.createElement('i'); i.className = 'd' + ch; return i; }));
  }
  function render() {
    const listed = expanded ? order : order.slice(0, MAX_ROWS);
    const kids = listed.map(type => { const r = rowFor(type); const v = String(shown.get(type)); if (r.v !== v) setNumber(r, v); const nm = unitName(type); if (r.span.textContent !== nm) r.span.textContent = nm; return r.row; });
    if (order.length > MAX_ROWS) { more.textContent = expanded ? t('less') : t('more', { n: order.length - MAX_ROWS }); kids.push(more); }
    el.replaceChildren(...kids);
    el.hidden = order.length === 0;
    keepClear();
  }
  function update() {
    const c = getCounts() || {};
    let changed = false;
    const next = new Map();
    for (const k in c) if (c[k] > 0) next.set(k, c[k]);
    if (next.size !== shown.size) changed = true;
    else for (const [k, v] of next) if (shown.get(k) !== v) { changed = true; break; }
    if (!changed) return;
    shown = next;
    const prev = new Map(order.map((k, i) => [k, i]));
    const list = [...shown.keys()];
    list.sort((a, b) => (shown.get(b) - shown.get(a)) || ((prev.get(a) ?? Infinity) - (prev.get(b) ?? Infinity)) || (typeIndex(a) - typeIndex(b)));
    order = list;
    if (order.length <= MAX_ROWS) expanded = false;
    render();
  }
  function keepClear() {
    const tb = toolbarEl();
    el.style.bottom = '';
    if (!tb || order.length === 0) return;
    const b = tb.getBoundingClientRect(), o = el.getBoundingClientRect();
    if (b.top >= innerHeight - 1) return;   // STEP9 UI: the bar slid out of sight (a campaign battle after START): the chip stays down
    if (o.right + 8 > b.left && o.left < b.right) el.style.bottom = `${innerHeight - b.top + 8}px`;
  }
  const timer = setInterval(update, 150);
  addEventListener('resize', keepClear);
  update();
  // STEP8 UI: a made unit was edited / deleted: its row (with its old icon) is made again next time it is counted
  function forget(type) { rows.delete(type); rows.delete('risen_' + type); render(); }
  return { update, keepClear, relabel: render, forget, stop() { clearInterval(timer); }, get order() { return order; } };
}
