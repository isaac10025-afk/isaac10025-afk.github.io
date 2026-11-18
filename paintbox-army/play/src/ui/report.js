// Battle report screen (OG page-ui.js:95-420, terrain-team-ui.md §4.3). Owner: UI.
// Title, "{outcome} in {time}", the "Units standing" step chart with hover, one panel per team
// (rows "from -> to", Total row when more than one type, Winner badge) and up to 3 highlight cards.
// Closes with the X button, Esc (controls.js) or a tap on the backdrop.
//
// summary (from game.report()):
//   { duration, result: 'left'|'right'|'draw'|null, outcome, samples: [t, red, blue, t, red, blue, ...],
//     strength: [Map|obj type->fielded, ...x2], losses: [Map|obj type->lost, ...x2], total: [n, n], lost: [n, n],
//     highlights: [{ id, kind, icon: type, team, ...args } | { label, text, icon }] }
import { t, teamName, reportTitle, reportSub, chartClock, clock, cardLabel, cardText, unitName } from './strings.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const pairs = (m) => (m instanceof Map ? [...m.entries()] : Object.entries(m || {}));
const getN = (m, k) => (m instanceof Map ? m.get(k) : m && m[k]) || 0;

// "nice" tick step (1, 2, 2.5, 5, 10 x 10^n), OG game.js:7912-7917 behaviour
function niceStep(max, n) {
  const raw = Math.max(max, 1) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
// chart geometry, OG game.js:7918-7957: width max(260, panel), height 160 below 420 px wide else 180.
// minWidth 0 = fit the panel: the side-by-side landscape report (ours, OG has none) gives the chart under 260 px on
// phones held sideways (640-800 px wide), and a 260 px chart ran over the team cards.
export function layOutChart(samples, panelWidth, minWidth = 260) {
  const width = Math.max(minWidth, panelWidth), height = width < 420 ? 160 : 180, pad = { l: 34, r: 34, t: 10, b: 26 };
  const n = samples.length / 3, tEnd = Math.max(samples[3 * (n - 1)] || 0, 1);
  let top = 1;
  for (let i = 0; i < n; i++) top = Math.max(top, samples[3 * i + 1], samples[3 * i + 2]);
  const yStep = niceStep(top, 4), yMax = Math.ceil(top / yStep) * yStep, xStep = niceStep(tEnd, width < 420 ? 4 : 6);
  const sx = (v) => pad.l + (v / tEnd) * (width - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - v / yMax) * (height - pad.t - pad.b);
  const rows = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) rows.push({ y: sy(v), label: String(Math.round(v * 10) / 10), axis: v === 0 });
  const ticks = [];
  for (let v = 0; v <= tEnd + 1e-9; v += xStep) ticks.push({ x: sx(v), label: chartClock(v) });
  const lines = [0, 1].map(k => { let d = ''; for (let i = 0; i < n; i++) { const x = sx(samples[3 * i]), y = sy(samples[3 * i + 1 + k]); d += i === 0 ? `M${x},${y}` : `H${x}V${y}`; } return d; });
  const last = [0, 1].map(k => samples[3 * (n - 1) + 1 + k] || 0);
  const ends = [0, 1].map(k => {
    const y = sy(last[k]);
    const clash = Math.abs(sy(last[0]) - sy(last[1])) < 14 ? (last[k] >= last[1 - k] ? -7 : 7) : 0; // higher count's label goes up, lower one down (OG flips team 1's sign, so 13 v 0 drew both labels on one spot)
    return { x: sx(tEnd), y, labelY: y + 4 + (last[0] === last[1] ? (k === 0 ? -7 : 7) : clash), count: last[k] };
  });
  return { width, height, pad, rows, ticks, lines, ends, sx, sy, tEnd };
}
const SIDE_BY_SIDE = '(max-height:500px) and (min-width:600px)'; // = the landscape report block in index.html
function sampleAt(samples, time) { const n = samples.length / 3; let i = 0; while (i + 1 < n && samples[3 * (i + 1)] <= time) i++; return i; }

function svg(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; }
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function teamRows(summary, team) { // OG game.js:7959-7986
  const list = pairs(summary.strength?.[team]).sort((a, b) => b[1] - a[1]);
  const rows = list.map(([type, from]) => ({ type, name: unitName(type), from, to: from - getN(summary.losses?.[team], type), total: false }));
  if (list.length > 1) rows.push({ type: null, name: t('total'), from: summary.total?.[team] ?? 0, to: (summary.total?.[team] ?? 0) - (summary.lost?.[team] ?? 0), total: true });
  return rows;
}

export function openReport(host, summary, { iconFor, teamColors, onClose }) {
  const winner = summary.result === 'left' ? 0 : summary.result === 'right' ? 1 : -1;
  const back = h('div', 'report'); back.id = 'report'; back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  // A tap on the backdrop closes it. OG closes on pointerdown (page-ui.js:115), but on a phone the same tap's click
  // then lands on whatever is under the finger once the backdrop is gone: Team battle (wipes the field), Clear,
  // Pause (attack 11-13). Closing on the click itself (down and up both on the backdrop) leaves nothing to click.
  let downOnBack = false;
  back.addEventListener('pointerdown', (e) => { downOnBack = e.target === back; });
  back.addEventListener('click', (e) => { if (downOnBack && e.target === back) onClose(); downOnBack = false; });
  const sheet = h('div', 'report-sheet'); back.append(sheet); // the taped paper sheet; the card inside scrolls if it must
  const card = h('div', 'report-card'); sheet.append(card);

  const head = h('div', 'report-head');
  const titles = h('div');
  const title = h('h2', 'report-title' + (winner >= 0 ? ' ' + summary.result : ''), reportTitle(summary));
  const sub = h('div', 'report-sub', reportSub(summary));
  titles.append(title, sub);
  const close = h('button', 'report-close'); close.type = 'button'; close.setAttribute('aria-label', t('close'));
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener('click', onClose);
  head.append(titles, close); card.append(head);

  // chart
  const fig = h('figure', 'report-chart report-panel');
  const cap = h('figcaption', 'report-chart-head');
  cap.append(h('span', 'report-section-title', t('standing')));
  const legend = h('span', 'report-legend');
  for (const k of [0, 1]) { const key = h('span', 'report-key'); const i = h('i'); i.style.background = teamColors[k]; key.append(i, document.createTextNode(teamName(k))); legend.append(key); }
  cap.append(legend); fig.append(cap);
  const plot = h('div', 'report-plot'); fig.append(plot);
  const tip = h('div', 'report-tip'); tip.hidden = true;
  card.append(fig);

  const samples = summary.samples && summary.samples.length >= 3 ? summary.samples : [0, 0, 0];
  let chart = null;
  function drawChart() {
    chart = layOutChart(samples, plot.clientWidth, matchMedia(SIDE_BY_SIDE).matches ? 0 : 260);
    plot.replaceChildren();
    const s = svg('svg', { width: chart.width, height: chart.height, viewBox: `0 0 ${chart.width} ${chart.height}`, role: 'img' }, plot);
    for (const r of chart.rows) {
      svg('line', { class: r.axis ? 'axis' : 'grid', x1: chart.pad.l, x2: chart.width - chart.pad.r, y1: r.y, y2: r.y }, s);
      svg('text', { class: 'tick', x: chart.pad.l - 7, y: r.y + 4, 'text-anchor': 'end' }, s).textContent = r.label;
    }
    for (const tk of chart.ticks) svg('text', { class: 'tick', x: tk.x, y: chart.height - 7, 'text-anchor': 'middle' }, s).textContent = tk.label;
    for (const k of [0, 1]) svg('path', { class: 'line', d: chart.lines[k], fill: 'none', stroke: teamColors[k], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s);
    for (const k of [0, 1]) {
      const e = chart.ends[k];
      svg('circle', { cx: e.x, cy: e.y, r: 4, fill: teamColors[k], class: 'end-dot' }, s);
      svg('text', { class: 'end-label', x: e.x + 9, y: e.labelY }, s).textContent = String(e.count);
    }
    const cross = svg('line', { class: 'cross', y1: chart.pad.t, y2: chart.sy(0), visibility: 'hidden' }, s);
    const dots = [0, 1].map(k => svg('circle', { r: 4, fill: teamColors[k], class: 'end-dot', visibility: 'hidden' }, s));
    const hit = svg('rect', { x: chart.pad.l, y: chart.pad.t, width: chart.width - chart.pad.l - chart.pad.r, height: chart.sy(0) - chart.pad.t, fill: 'transparent' }, s);
    hit.addEventListener('pointermove', (ev) => {
      const box = s.getBoundingClientRect();
      const time = ((ev.clientX - box.left - chart.pad.l) / (chart.width - chart.pad.l - chart.pad.r)) * chart.tEnd;
      const i = sampleAt(samples, time), x = chart.sx(Math.max(0, Math.min(chart.tEnd, time)));
      const counts = [samples[3 * i + 1], samples[3 * i + 2]];
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      dots.forEach((d, k) => { d.setAttribute('cx', x); d.setAttribute('cy', chart.sy(counts[k])); d.setAttribute('visibility', 'visible'); });
      tip.replaceChildren(h('div', 'report-tip-time', clock(Math.max(0, time))));
      for (const k of [0, 1]) { const row = h('div', 'report-tip-row'); const i2 = h('i'); i2.style.background = teamColors[k]; row.append(i2, h('span', null, teamName(k)), h('b', null, String(counts[k]))); tip.append(row); }
      tip.hidden = false; tip.style.top = `${chart.pad.t}px`;
      const w = tip.offsetWidth; tip.style.left = `${x + 12 + w > box.width ? x - 12 - w : x + 12}px`;
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.hidden = true; });
    plot.append(tip);
  }

  // team panels
  const teams = h('div', 'report-teams');
  for (const k of [0, 1]) {
    const p = h('div', `report-team report-panel ${k === 0 ? 'left' : 'right'}` + (winner === k ? ' won' : '')); p.style.setProperty('--team', teamColors[k]);
    const th = h('div', 'report-team-head'); th.append(h('span', 'report-team-name', teamName(k)));
    if (winner === k) th.append(h('span', 'report-badge', t('winner')));
    p.append(th);
    const list = h('div', 'report-units');
    for (const r of teamRows(summary, k)) {
      const row = h('div', 'report-unit' + (r.total ? ' total' : ''));
      if (r.type) { const ic = iconFor({ kind: 'unit', type: r.type }, true); ic.classList.add('report-icon'); row.append(ic); } else row.append(h('span', 'report-icon'));
      const counts = h('span', 'report-unit-counts'); counts.append(document.createTextNode(String(r.from)), h('i', null, '→'), h('b', null, String(r.to)));
      row.append(h('span', 'report-unit-name', r.name), counts);
      list.append(row);
    }
    p.append(list); teams.append(p);
  }
  card.append(teams);

  // highlight cards (up to 3)
  const hl = (summary.highlights || []).slice(0, 3);
  if (hl.length) {
    const box = h('div', 'report-highlights');
    for (const c of hl) {
      const el = h('div', 'report-highlight report-panel');
      if (c.icon) { const ic = iconFor({ kind: 'unit', type: c.icon }, true); ic.classList.add('highlight-icon'); el.append(ic); }
      const body = h('div');
      body.append(h('div', 'report-highlight-label', cardLabel(c)), h('div', 'report-highlight-text', cardText(c)));
      el.append(body); box.append(el);
    }
    card.append(box);
  }

  host.append(back);
  const ret = document.activeElement;
  drawChart();
  addEventListener('resize', drawChart);
  close.focus();
  return {
    el: back,
    close() { removeEventListener('resize', drawChart); back.remove(); if (ret && ret.focus) ret.focus(); },
  };
}
