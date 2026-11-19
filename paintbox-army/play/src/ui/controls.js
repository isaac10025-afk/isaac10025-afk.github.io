// Buttons, chips, Team battle switch, START, result overlay, keys. Owner: UI.
// OG: page-ui.js:1098-1176 (actions + keys), 1186-1532 (DOM), terrain-team-ui.md §5.2.
import { t } from './strings.js';

export function createControls(a) {
  const $ = (id) => document.getElementById(id);
  const el = {
    maps: $('maps-button'), clear: $('clear'), pause: $('pause'), sound: $('sound'), lang: $('lang'), slow: $('slow'), follow: $('follow'), speed: document.querySelector('#slow .speed'), teams: $('teams'), start: $('start'),
    paused: $('paused'), labels: $('team-labels'), labelL: document.querySelector('.team-label.left'), labelR: document.querySelector('.team-label.right'),
    midline: $('midline'), result: $('result'), resultText: $('result-text'), again: $('again'), statsBtn: $('stats-button'), stats: $('stats'),
    campaign: $('campaign-button'), leave: $('leave-button'), // STEP9 UI: the campaign panel, leave a campaign battle
    share: $('share-button'), // STEP10 LEAD: the share panel (ui/share.js)
  };
  const blur = (e) => { if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); };
  const on = (b, fn) => b.addEventListener('click', (e) => { fn(e); blur(e); });
  on(el.maps, () => a.toggleMaps(true));   // Part 2 step 7: the maps panel (ui/maps.js)
  if (el.campaign) on(el.campaign, () => a.toggleCampaign()); // STEP9 UI: the campaign panel (ui/campaign.js)
  if (el.leave) on(el.leave, () => a.leaveCampaign());        // STEP9 UI: back to the sandbox
  if (el.share) on(el.share, () => a.toggleShare());           // STEP10 LEAD: share codes
  on(el.clear, () => a.clearField(true));
  on(el.pause, () => a.togglePause(true));
  on(el.sound, () => a.toggleSound());
  on(el.lang, () => a.toggleLang());
  on(el.slow, () => a.cycleSpeed());
  on(el.follow, () => a.armFollow());
  on(el.teams, () => a.toggleTeams());
  on(el.start, () => a.startRound());
  on(el.again, () => a.newBattle());
  on(el.statsBtn, () => a.openReport());

  // keys, OG page-ui.js:1155-1176 (no modifier keys; report open = only Esc)
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const s = a.state();
    if (s.reportOpen) { if (e.code === 'Escape') a.closeReport(); return; }
    // step 8: the unit maker takes every key (typing a name must never clear the field); Esc = back / close
    if (s.makerOpen) { if (e.code === 'Escape') a.makerEscape(); return; }
    // step 7: the maps panel takes every key (Esc / N close it); Esc closes the Found card
    if (s.mapsOpen) { if (e.code === 'Escape' || e.code === 'KeyN') a.closeMaps(); return; }
    if (s.foundOpen && e.code === 'Escape') { a.closeFound(); return; }
    // STEP9 UI: the campaign panel takes every key (Esc = back to the worlds / close); the result card: Enter = Next / Retry
    if (s.campOpen) { if (e.code === 'Escape') a.campEscape(); return; }
    // STEP10 LEAD: the share panel takes every key (typing / pasting a code must never clear the field); Esc closes it
    if (s.shareOpen) { if (e.code === 'Escape') a.closeShare(); return; }
    if (s.campOver && (e.code === 'Enter' || e.code === 'NumpadEnter')) { a.campPrimary(); return; }
    const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
    if (e.code === 'Space') { e.preventDefault(); a.togglePause(false); }
    else if (enter && s.holding) a.startRound();
    else if (enter && s.result) a.newBattle();
    else if (e.code === 'KeyC') a.clearField(false);
    else if (e.code === 'KeyM') a.toggleSound();
    else if (e.code === 'KeyN' && s.hasMaps && !s.inCamp) a.toggleMaps(false);   // N = maps (M is mute); STEP9 UI: none in a campaign battle
    else if (e.code === 'Backquote') a.toggleStats();
    else if (e.code === 'Period' && s.paused) a.stepOnce();
    else if (e.code === 'Tab') { e.preventDefault(); a.nextTab(e.shiftKey ? -1 : 1); }
    else if (/^Digit[1-9]$/.test(e.code)) a.selectSlot(Number(e.code.slice(5)) - 1);
    // camera + speed (OURS, step 2): arrows pan, +/- zoom, 0 = whole field, S = slow motion, F = follow
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault(); const k = 120;
      a.panKey(e.code === 'ArrowLeft' ? k : e.code === 'ArrowRight' ? -k : 0, e.code === 'ArrowUp' ? k : e.code === 'ArrowDown' ? -k : 0);
    }
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') a.zoomKey(1.25);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') a.zoomKey(0.8);
    else if (e.code === 'Digit0' || e.code === 'Numpad0') a.fit();
    else if (e.code === 'KeyS') a.cycleSpeed();
    else if (e.code === 'KeyF') a.armFollow();
  });

  function relabel() {
    const s = a.state();
    if (!el.result.hidden) requestAnimationFrame(placeResult);   // new words, new width (中文 / EN)
    el.maps.setAttribute('aria-label', t('maps')); el.maps.title = `${t('maps')} (N)`;
    if (el.campaign) { el.campaign.setAttribute('aria-label', t('campaign')); el.campaign.title = t('campaign'); } // STEP9 UI
    if (el.leave) { el.leave.setAttribute('aria-label', t('c_leave')); el.leave.title = t('c_leave'); }
    if (el.share) { el.share.setAttribute('aria-label', t('share')); el.share.title = t('share'); } // STEP10 LEAD
    el.clear.setAttribute('aria-label', t('clear')); el.clear.title = `${t('clear')} (C)`;
    el.pause.setAttribute('aria-label', s.paused ? t('play') : t('pause')); el.pause.title = `${s.paused ? t('play') : t('pause')} (Space)`;
    el.sound.setAttribute('aria-label', t('sound')); el.sound.title = `${t('sound')} (M)`;
    el.slow.setAttribute('aria-label', t('slow')); el.slow.title = `${t('slow')} (S)`;
    el.follow.setAttribute('aria-label', t('follow')); el.follow.title = `${t('follow')} (F)`;
    el.lang.textContent = t('lang'); el.lang.setAttribute('aria-label', t('lang_title')); el.lang.title = t('lang_title');
    el.teams.setAttribute('aria-label', t('teams')); el.teams.title = t('teams'); el.teams.querySelector('.label').textContent = t('teams');
    el.start.textContent = t('start'); el.start.title = `${t('start')} (Enter)`;
    el.paused.textContent = t('paused');
    el.labelL.textContent = t('red'); el.labelR.textContent = t('blue');
    el.again.textContent = t('again'); el.statsBtn.textContent = t('stats');
    el.resultText.textContent = s.result ? t('win_' + s.result) : '';
  }
  function update() {
    const s = a.state();
    el.maps.hidden = !s.hasMaps || !!s.inCamp; // STEP9 UI: a campaign battle's map is the level
    el.maps.setAttribute('aria-expanded', String(!!s.mapsOpen));
    if (el.campaign) { el.campaign.hidden = !s.hasCampaign; el.campaign.setAttribute('aria-expanded', String(!!s.campOpen)); } // STEP9 UI
    if (el.leave) el.leave.hidden = !s.inCamp;
    if (el.share) { el.share.hidden = !s.hasShare; el.share.setAttribute('aria-expanded', String(!!s.shareOpen)); } // STEP10 LEAD
    el.teams.hidden = !!s.inCamp;                       // STEP9 UI: no Team switch in a campaign battle (always teams)
    document.body.classList.toggle('campaign', !!s.inCamp);
    document.body.classList.toggle('camp-locked', !!s.campLocked);   // STEP9 UI: after START the tool bar slides away (index.html)
    el.pause.classList.toggle('paused', s.paused);
    el.sound.setAttribute('aria-pressed', String(!s.muted));
    el.speed.textContent = s.speed === 0.5 ? '½' : s.speed === 0.25 ? '¼' : '';   // shown only when slowed
    el.slow.classList.toggle('on', s.speed !== 1);
    el.follow.setAttribute('aria-pressed', String(!!(s.followArmed || s.following)));
    document.body.classList.toggle('follow-armed', !!s.followArmed);
    el.teams.setAttribute('aria-checked', String(s.teams));
    el.paused.hidden = !s.paused;
    el.paused.classList.toggle('teams', s.teams && s.holding);
    el.midline.hidden = !s.teams;
    el.labels.hidden = !(s.teams && s.holding) || !!s.inCamp; // STEP9 UI: the budget bar holds the top in a campaign battle
    el.start.hidden = !s.holding;
    el.result.hidden = !s.result;
    el.resultText.className = s.result || '';
    el.statsBtn.hidden = !s.canReport;
    relabel();
    placeResult();
  }
  // ---- where the result goes (attack 11-16) ----
  // OG puts it in the middle of the field, 36 % down. Since Slow, Follow (step 2) and Maps (step 7) the phone's
  // round-button column reaches that far: on 320-430 px phones "BLUE TEAM WINS!" and the Stats button ran under Slow /
  // Follow / 中文 (a tap on the right of Stats hit Follow), and on a phone held sideways (568 x 320) the buttons ran
  // under the tool bar. Where it hits a button, the tool bar or the count chip, it moves to the nearest clear spot
  // (up / down first: on tall phones it lands just under the column, still centred); with no room the two buttons
  // stack, then the words shrink. Where nothing is in the way it stays where it always was.
  const GAP = 8;
  function shownRect(e) {
    if (!e || e.hidden || e.closest('[hidden]')) return null;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) if (getComputedStyle(n).display === 'none') return null;
    const q = e.getBoundingClientRect();
    return q.width > 0 && q.height > 0 ? q : null;
  }
  function placeResult() {
    const r = el.result, txt = el.resultText;
    r.style.top = ''; r.style.left = ''; r.classList.remove('stack'); txt.style.removeProperty('--result-size');
    if (r.hidden) return;
    const obst = [...document.querySelectorAll('#controls > button'), el.teams, $('toolbar'), $('counts'), el.paused, $('pilot-x'), $('pilot-hp')].map(shownRect).filter(Boolean);
    const probe = getComputedStyle($('safe-probe') || document.body);
    const sa = { t: parseFloat(probe.paddingTop) || 0, r: parseFloat(probe.paddingRight) || 0, b: parseFloat(probe.paddingBottom) || 0, l: parseFloat(probe.paddingLeft) || 0 };
    const W = innerWidth, H = innerHeight;
    const tryPlace = () => {
      // layout sizes (the pop-in animation scales the box for its first 0.35 s; offsets ignore transforms)
      const cs = getComputedStyle(r), w = r.offsetWidth, h = r.offsetHeight, x0 = parseFloat(cs.left), y0 = parseFloat(cs.top);
      const parts = [txt, el.again, el.statsBtn].filter((e) => !e.hidden && e.offsetWidth).map((e) => {
        let dx = -w / 2, dy = 0;
        for (let n = e; n && n !== r; n = n.offsetParent) { dx += n.offsetLeft; dy += n.offsetTop; }
        return { dx, dy, w: e.offsetWidth, h: e.offsetHeight };
      });
      const minL = Math.min(...parts.map((p) => p.dx)), maxR = Math.max(...parts.map((p) => p.dx + p.w));
      const ok = (x, y) => {
        if (x + minL < sa.l + GAP || x + maxR > W - sa.r - GAP || y < sa.t + GAP || y + h > H - sa.b - GAP) return false;
        for (const p of parts) {
          const l = x + p.dx, t = y + p.dy, rr = l + p.w, b = t + p.h;
          for (const q of obst) if (l < q.right + GAP && q.left - GAP < rr && t < q.bottom + GAP && q.top - GAP < b) return false;
        }
        return true;
      };
      if (ok(x0, y0)) return true;
      const xs = [x0], ys = [y0];
      for (const q of obst) { xs.push(q.right + GAP - minL, q.left - GAP - maxR); ys.push(q.bottom + GAP, q.top - GAP - h); }
      let best = null, bd = Infinity;
      for (const x of xs) for (const y of ys) { const d = 2 * Math.abs(x - x0) + Math.abs(y - y0); if (d < bd && ok(x, y)) { bd = d; best = [x, y]; } }
      if (!best) return false;
      r.style.left = `${Math.round(best[0])}px`; r.style.top = `${Math.round(best[1])}px`;
      return true;
    };
    if (tryPlace()) return;
    r.classList.add('stack');
    if (tryPlace()) return;
    const size = parseFloat(getComputedStyle(txt).fontSize);
    for (const k of [0.9, 0.8, 0.7, 0.6]) { txt.style.setProperty('--result-size', `${Math.floor(size * k)}px`); if (tryPlace()) return; }
    r.style.top = ''; r.style.left = ''; r.classList.remove('stack'); txt.style.removeProperty('--result-size'); // nothing fits: the middle, as before
  }
  addEventListener('resize', () => requestAnimationFrame(placeResult));
  function placeStart(toolbarEl) { // OG page-ui.js:1114-1117: 16 px above the toolbar
    if (toolbarEl) el.start.style.bottom = `${innerHeight - toolbarEl.getBoundingClientRect().top + 16}px`;
  }
  function setStats(text) { el.stats.hidden = text == null; if (text != null) el.stats.textContent = text; }
  return { update, relabel, placeStart, setStats, placeResult, el };
}
