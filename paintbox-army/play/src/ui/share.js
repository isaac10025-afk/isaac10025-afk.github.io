// Share panel (OURS, Part 2 step 10, sim/share.js). Owner: LEAD.
// A kraft board over the field, taped like the maps panel:
//   COPY BATTLE      the big red button: the field as it was when the panel opened goes to the clipboard as a code
//                    (a campaign battle: the level + your army). The code is made when the panel opens, so the tap
//                    copies at once (Safari only lets a tap write the clipboard straight away).
//   COPY A UNIT      one paper card per made unit (only when there are some): a tap copies that unit's code
//   paste box        long-press -> Paste (or Ctrl+V): a code loads as soon as it is in; LOAD does the same
//   message chip     what just happened, only when something did (copied, added, a code that doesn't work)
// If the clipboard won't take it (old browser, blocked), the code shows in a box, selected, to copy by hand.
// Closes on the X, Esc (controls.js), or a tap on the dark backdrop. Keys typed in the box never reach the field.
import { t, unitName } from './strings.js';

const T = {
  MSG_MS: 2600,     // ms a message chip stays
  COPIED_MS: 1400,  // ms the Copy button says "Copied!"
  CARD: 52,         // css px: a made unit's card (icon + paper)
};
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const closeSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** Put text on the clipboard. Returns true when it got there. */
export async function copyText(s) {
  try { if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { await navigator.clipboard.writeText(s); return true; } } catch (e) { /* blocked: try the old way */ }
  const ta = document.createElement('textarea');
  ta.value = s; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(ta); ta.select(); ta.setSelectionRange(0, s.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

/**
 * opts: { root, iconFor(tool, now), units() -> [type] (made units), battleCode() -> Promise<text | null> (null = nothing
 *         to copy), unitCode(type) -> Promise<text>, onLoad(text) -> Promise<{ ok, msg }>, onOpenChange(open), sound() }
 */
export function createSharePanel(opts) {
  const { root, iconFor, units, battleCode, unitCode, onLoad, onOpenChange, sound } = opts;
  const back = h('div', 'share'); back.id = 'share'; back.hidden = true;
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  const sheet = h('div', 'share-sheet');
  const close = h('button', 'round-button share-close'); close.type = 'button'; close.innerHTML = closeSvg;
  const copyBtn = h('button', 'big-button sh-copy'); copyBtn.type = 'button';
  const box = h('div', 'sh-box'); box.hidden = true;
  const boxLabel = h('span', 'sh-box-label'); const boxText = h('textarea', 'sh-box-text'); boxText.readOnly = true; boxText.rows = 3;
  box.append(boxLabel, boxText);
  const unitWrap = h('div', 'sh-units'); const unitTitle = h('span', 'sh-title'); const unitRow = h('div', 'sh-unit-row');
  unitWrap.append(unitTitle, unitRow);
  const paste = h('div', 'sh-paste');
  const input = h('textarea', 'sh-in'); input.rows = 2; input.spellcheck = false; input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off');
  const load = h('button', 'big-button secondary sh-load'); load.type = 'button';
  paste.append(input, load);
  const msg = h('p', 'sh-msg'); msg.setAttribute('role', 'status'); msg.hidden = true;
  sheet.append(copyBtn, box, unitWrap, paste, msg, close); back.append(sheet); root.append(back);

  let open = false, code = null, codeP = null, copiedT = 0, msgT = 0, busy = false, unitCards = [];
  let downOnBack = false;
  back.addEventListener('pointerdown', (e) => { downOnBack = e.target === back; });
  back.addEventListener('click', (e) => { if (downOnBack && e.target === back) hide(); downOnBack = false; });
  close.addEventListener('click', (e) => { e.currentTarget.blur(); hide(); });
  // keys in the panel stay in the panel (controls.js also returns early while it is open)
  for (const el of [input, boxText]) el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

  function say(text, bad = false) {
    msg.textContent = text; msg.hidden = false; msg.classList.toggle('bad', bad);
    clearTimeout(msgT); msgT = setTimeout(() => { msg.hidden = true; }, T.MSG_MS);
  }
  function relabel() {
    close.setAttribute('aria-label', t('close')); close.title = `${t('close')} (Esc)`;
    back.setAttribute('aria-label', t('share'));
    copyBtn.textContent = copiedT ? t('sh_copied') : t('sh_copy');
    unitTitle.textContent = t('sh_units');
    boxLabel.textContent = t('sh_box');
    input.placeholder = t('sh_paste'); input.setAttribute('aria-label', t('sh_paste'));
    load.textContent = t('sh_load');
    for (const c of unitCards) { const n = unitName(c.type); c.el.setAttribute('aria-label', `${t('sh_units')}: ${n}`); c.el.title = n; }
  }
  function buildUnits() {
    const list = units ? units() : [];
    unitRow.replaceChildren(); unitCards = [];
    unitWrap.hidden = list.length === 0;
    for (const type of list) {
      const el = h('button', 'sh-unit'); el.type = 'button'; el.dataset.type = type;
      const ic = iconFor({ kind: 'unit', type }, true); ic.classList.add('sh-unit-icon'); el.append(ic);
      el.addEventListener('click', async (e) => {
        e.currentTarget.blur(); if (sound) sound();
        const text = await unitCode(type);
        if (text && await copyText(text)) say(t('sh_unit_copied').replace('{name}', unitName(type)));
        else if (text) showBox(text);
      });
      unitRow.append(el); unitCards.push({ type, el });
    }
  }
  function showBox(text) { box.hidden = false; boxText.value = text; boxText.focus({ preventScroll: true }); boxText.select(); }
  copyBtn.addEventListener('click', async (e) => {
    e.currentTarget.blur(); if (sound) sound();
    const text = code !== null ? code : await codeP;
    if (!text) { say(t('sh_empty'), true); return; }
    if (await copyText(text)) {
      clearTimeout(copiedT); copiedT = setTimeout(() => { copiedT = 0; copyBtn.textContent = t('sh_copy'); }, T.COPIED_MS);
      copyBtn.textContent = t('sh_copied'); copyBtn.classList.remove('pop'); void copyBtn.offsetWidth; copyBtn.classList.add('pop');
    } else showBox(text);
  });
  async function tryLoad(fromButton) {
    const text = input.value;
    if (busy || !text.trim()) { if (fromButton) say(t('sh_none'), true); return; }
    busy = true;
    try {
      const r = await onLoad(text);
      if (r && r.ok) { input.value = ''; if (r.msg) say(r.msg); if (r.close !== false) hide(); }
      else if (r && r.msg) say(r.msg, true);
    } finally { busy = false; }
  }
  load.addEventListener('click', (e) => { e.currentTarget.blur(); if (sound) sound(); tryLoad(true); });
  // a paste loads at once when it holds a code (a phone: long-press -> Paste, no second tap)
  input.addEventListener('input', () => { if (input.value.indexOf('PBA') >= 0) tryLoad(false); });

  function show() {
    if (open) return;
    open = true; back.hidden = false;
    box.hidden = true; boxText.value = ''; msg.hidden = true; input.value = '';
    clearTimeout(copiedT); copiedT = 0;
    code = null; codeP = battleCode().then((c) => { if (open) code = c; return c; }, () => null);
    buildUnits(); relabel();
    onOpenChange && onOpenChange(true);
    sheet.tabIndex = -1; sheet.focus({ preventScroll: true });   // the board, not Copy: no focus ring on a tap-opened panel
  }
  function hide() {
    if (!open) return;
    open = false; back.hidden = true; code = null; codeP = null;
    if (document.activeElement && back.contains(document.activeElement)) document.activeElement.blur();
    onOpenChange && onOpenChange(false);
  }
  return {
    el: back, show, hide, relabel,
    get open() { return open; },
    /** tests: the battle code made when the panel opened */
    code: () => codeP,
    /** tests: paste text into the box as a player would */
    paste(text) { input.value = text; input.dispatchEvent(new Event('input')); },
  };
}
