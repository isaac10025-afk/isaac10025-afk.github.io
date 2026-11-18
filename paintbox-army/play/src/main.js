// Boot, fixed-step loop, wiring between sim, render, UI and audio. Owner: UI.
// Loop (OG game.js:6962-6987, core-move.md §1): fixed 1/60 s ticks from an accumulator, at most 4 per frame,
// frame dt capped at 0.25 s, leftover capped at 0.25 s (slow devices run slower instead of jumping),
// draw every frame with alpha = acc/step (1 while paused); a draw is skipped if still behind and the last
// draw was < 120 ms ago. Field = canvas CSS size / 1.075 (OG game.js:8007, 8053-8057).
import { createToolbar } from './ui/toolbar.js';
import { createCounts } from './ui/counts.js';
import { createControls } from './ui/controls.js';
import { attachInput, ZOOM } from './ui/input.js';
import { openReport } from './ui/report.js';
import { TOOLS, teamable } from './ui/tools.js';
import { onLang, toggleLang, getLang } from './ui/strings.js';
import { createMockGame } from './ui/mock-game.js';
import { createFallbackRecord, teamOf } from './ui/fallback-report.js';
import * as debugRender from './render/debug.js';
import { createGL2D, dropGL2D } from './render/gl2d.js';
import { wrapCam } from './render/cam2d.js';
import { createCamera, CAM } from './camera.js';
import { createPilot } from './ui/pilot.js';
import { t as say } from './ui/strings.js';
import { createSecrets } from './ui/secrets.js';
import { createMapsPanel, createFound } from './ui/maps.js';
import { createMineStore } from './ui/mine.js'; // STEP8 UI: the made units' store
import { createMaker } from './ui/maker.js';    // STEP8 UI: the unit maker panel
import { setMadeLookup } from './ui/strings.js'; // STEP8 UI: made units' names
import { createIntro, wantIntro } from './ui/intro.js'; // first visit: opening fight + a hand that paints (user pick A, 11-17)
import { initPortal, loaded as portalLoaded, playing as portalPlaying, onSiteMute, onSiteHold, breakThen, portal } from './portal.js'; // web sites (Poki / CrazyGames / GamePix); does nothing elsewhere

const STEP = 1 / 60;            // OG game.js:8656
const MAX_TICKS = 4;            // OG game.js:6982
const DT_CAP = 0.25;            // OG game.js:6962, 6984
const PHONE = '(max-width: 640px)'; // OG game.js:8031
const PHONE_BAR = 60;           // canvas is 60 CSS px shorter on phone (OG game.js:8221)
const ROUND_OVER = 1.2;         // s of sim time with a team at 0 before the result (OG game.js:8279-8282)
const MUTE_KEY = 'paint-battle:muted';
const TAP_GUARD = 350;          // ms the field ignores new presses after a panel / vanishing button closes (double taps)

const params = new URLSearchParams(location.search);
let canvas = document.getElementById('game');
// The field draws through WebGL2 (render/gl2d.js: one batch a frame; Samsung 11-13: canvas 2D fell to 15 fps with ~30
// sprite kinds mixed). ?gl=0, ?debug, or no WebGL2: plain canvas 2D as before.
let ctx = (!params.has('debug') && params.get('gl') !== '0' && createGL2D(canvas)) || plain2d();
function plain2d() { // a canvas that already has a WebGL context can't give a 2D one: swap in a fresh copy
  let c = canvas.getContext('2d', { alpha: false });
  if (!c) { const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh); canvas = fresh; c = fresh.getContext('2d', { alpha: false }); }
  return wrapCam(c);
}
// Camera over the big field (Part 2 step 2): the world is CAM.WORLD x the field at boot, each way, and stays that size;
// window resizes and phone rotations only change the view. Starts zoomed to fit (the whole world on screen).
const camera = createCamera();
let worldSet = false;
const SPEEDS = [1, 0.5, 0.25];   // slow motion button: sim speed (OURS; OG has pause only)
let speedI = 0;
const OUTSIDE = '#efe1b3';       // paper colour around the world when it doesn't fill the screen
const ring = document.getElementById('brush');
const probe = document.getElementById('safe-probe');
const phoneQuery = matchMedia(PHONE);
// The page stays hidden (index.html: html:not(.ready)) until the first whole frame is drawn, then everything appears
// at once. Before: a flat field-green canvas showed ~0.5 s while the code loaded (user, 11-14: "the og game doesn't
// have it"); before that the opaque canvas showed black (11-13). If boot fails or hangs, show the page anyway.
window.__pbBooted = true; // index.html shows a 'couldn't load' line if this never runs
let shown = false;
function reveal() { if (shown) return; shown = true; document.documentElement.classList.add('ready'); portalLoaded(); }
// Web sites (portal.js): the site's own sound switch and an ad's sound both mute on top of ours; while a break holds the
// game (ad asked for or playing) the sim stops and no press or key reaches the game. 'played' = the player has touched
// the page once (sites want gameplayStart only once the player is playing).
initPortal();
let siteMuted = false, adQuiet = false, adHold = false, touched = false;
// Only presses on the game (#app) are held back: CrazyGames draws its ad inside this page, and its buttons must work.
const ownTarget = (e) => { const t = e.target; return !t || t === window || t === document || t === document.body || t === document.documentElement || !!(t.closest && t.closest('#app')); };
for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'wheel', 'keydown', 'keyup', 'contextmenu']) {
  const moving = /move|wheel/.test(ev);   // passive: a held-back move needs no preventDefault, and scrolling stays smooth
  addEventListener(ev, (e) => {
    if (adHold) { if (ownTarget(e)) { e.stopImmediatePropagation(); if (!moving && e.cancelable) e.preventDefault(); } return; }
    if (ev === 'pointerdown' || ev === 'keydown') touched = true;
  }, { capture: true, passive: moving });
}
setTimeout(reveal, 4000);
addEventListener('error', reveal);
addEventListener('unhandledrejection', reveal);

// ---- field size ----
function safe() {
  const cs = getComputedStyle(probe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function fieldRect() {
  const s = safe();
  return { left: s.l, top: s.t, w: Math.max(1, innerWidth - s.l - s.r), h: Math.max(1, innerHeight - s.t - s.b - (phoneQuery.matches ? PHONE_BAR : 0)) };
}

// ---- pick the game: CORE-A's once it has units, else the mock ----
async function pickGame(W, H, seed) {
  if (!params.has('mock')) {
    try {
      const [{ createGame }, defs] = await Promise.all([import('./sim/game.js'), import('./sim/defs.js')]);
      if (params.has('real') || defs.allDefs().length > 0) return { game: createGame({ W, H, seed, march: !params.has('nomarch') }), kind: 'real' };
    } catch (e) { console.warn('sim/game.js failed, using the mock', e); }
  }
  return { game: createMockGame({ W, H, seed }), kind: 'mock' };
}

// ---- audio (AUDIO agent's src/audio, optional) ----
// Entry: src/audio/index.js with any of init, unlock, setMuted, ui, win, handleEvents(events, world),
// update(paused, world), onPaint(tool, x, y, n, segLen). Every call is optional.
async function loadAudio() {
  try { return await import('./audio/index.js'); } catch (e) { return null; }
}

// ---- art (look A, POSTER PAINT): src/render/art/index.js replaces debug.js unless ?debug. Optional hooks:
// handleEvents(events, world), clear(), prewarm(tool, teams). ui-paint.js paints the UI images (CSS vars). ----
async function loadArt() {
  if (params.has('debug')) return null;
  try { const m = await import('./render/art/index.js'); return typeof m.draw === 'function' ? m : null; } catch (e) { console.warn('art renderer failed, using debug', e); return null; }
}
let uiDone = false, audioOn = false;
function startAudio() {
  if (audioOn || !game) return;
  audioOn = true;
  call('init', { muted: state.muted || siteMuted, world: game.world });
  applyMute();
}
function applyMute() { call('setMuted', state.muted || siteMuted || adQuiet); }
onSiteMute((m) => { siteMuted = m; applyMute(); });
let breakHold = false, siteHold = false;   // a break's ad / the site's own pause (GamePix): either holds the game
function syncHold() { adHold = breakHold || siteHold; if (game) game.setPaused(adHold || state.paused); }
function holdForAd(b) { breakHold = !!b; syncHold(); }
onSiteHold((b) => { siteHold = !!b; syncHold(); });
// A natural break (Clear, New battle, a map pick) goes through the site: maybe an ad first (portal.js breakThen).
// No site: fn runs at once, in the same call.
const viaBreak = (fn) => breakThen(fn, { hold: holdForAd, quiet: (b) => { adQuiet = !!b; applyMute(); } });
async function paintUI() {
  if (params.has('debug')) return;
  try { const m = await import('./render/art/ui-paint.js'); if (m.paintUI) await m.paintUI(); } catch (e) { console.warn('ui-paint failed', e); }
}
const rcall = (name, ...args) => { if (typeof renderer[name] === 'function') { try { return renderer[name](...args); } catch (e) { console.warn('render.' + name, e); } } };

// ---- icons: drawn by the renderer onto canvases. Copies are plain drawImage; the first paint of each icon is queued
// and painted a few per frame (FIFO, so the first tab's cards come first). No toDataURL: PNG-encoding 29 icons
// blocked start-up for ~0.35 s (1.4 s on a slow phone) and the field showed black meanwhile (user, 11-13). ----
const iconCache = new Map(), iconQueue = [];
iconSource.all = () => iconCache.values();
function iconSource(tool) {
  const key = tool.kind === 'unit' ? tool.type : tool.kind;
  let e = iconCache.get(key);
  if (!e) {
    const c = document.createElement('canvas'); c.width = 102; c.height = 82;
    e = { c, tool, done: false, waiting: [] }; iconCache.set(key, e); iconQueue.push(e);
  }
  return e;
}
function paintIcon(e) {
  if (e.done) return;
  e.done = true;
  try { (renderer.drawIcon || debugRender.drawIcon)(e.c.getContext('2d'), e.tool, e.c.width, e.c.height); } catch (err) { console.warn('icon', err); }
  for (const cv of e.waiting) cv.getContext('2d').drawImage(e.c, 0, 0);
  e.waiting.length = 0;
}
function pumpIcons(ms) {
  const t0 = performance.now();
  while (iconQueue.length && performance.now() - t0 < ms) paintIcon(iconQueue.shift());
}
// STEP8 UI: a made unit was edited / deleted: its icon (and its zombie copy's) is painted again next time
function dropIcon(type) {
  for (const k of [type, 'risen_' + type]) { const e = iconCache.get(k); if (!e) continue; iconCache.delete(k); const i = iconQueue.indexOf(e); if (i >= 0) iconQueue.splice(i, 1); }
}
// now = true: on screen at once (count chip, hp bar, maps badges, report): painted right away, not at the back of the
// queue. Before (attack 11-16): a map loaded at start-up (?map=) or soon after showed its count chip as bare numbers
// ("32" trees, no picture) for seconds, behind ~100 queued toolbar icons.
function iconFor(tool, now = false) {
  const e = iconSource(tool), cv = document.createElement('canvas');
  if (now && !e.done) { const i = iconQueue.indexOf(e); if (i >= 0) iconQueue.splice(i, 1); paintIcon(e); }
  cv.width = e.c.width; cv.height = e.c.height; cv.setAttribute('aria-hidden', 'true');
  if (e.done) cv.getContext('2d').drawImage(e.c, 0, 0); else e.waiting.push(cv);
  return cv;
}

// A unit's icon painted big (the Found card): css size w x h at the screen's pixel density. The sprite is painted at
// that size (sprites.js paintStandalone), not blown up from the 102 x 82 toolbar icon (blurry); the debug look, or a
// paint error, uses the renderer's drawIcon.
let spritesM = null;
function bigIcon(type, w, h) {
  const dpr = Math.min(devicePixelRatio || 1, 3), cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  cv.setAttribute('aria-hidden', 'true');
  const c = cv.getContext('2d');
  if (spritesM) {
    try {
      const { ent } = spritesM.entOf(type), [bw, bh] = ent.box;
      const k = Math.min(cv.width / (bw * ent.scale), cv.height / (bh * ent.scale));
      const src = spritesM.paintStandalone(type, null, 0, k).cv, g = src.getContext('2d', { willReadFrequently: true });
      const d = g.getImageData(0, 0, src.width, src.height).data;
      let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= x0) {
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1, sc = Math.min(cv.width * 0.92 / cw, cv.height * 0.92 / ch);
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(src, x0, y0, cw, ch, (cv.width - cw * sc) / 2, (cv.height - ch * sc) / 2, cw * sc, ch * sc);
        return cv;
      }
    } catch (e) { console.warn('big icon', type, e); }
  }
  (renderer.drawIcon || debugRender.drawIcon)(c, { kind: 'unit', type }, cv.width, cv.height);
  return cv;
}
// A locked Secret card's silhouette from SECRET-ART's HIDE_ICON (sprites-secret.js), if it has one: HIDE_ICON(ctx, type,
// w, h) paints it, or HIDE_ICON(type) returns a picture. Nothing painted = null (the toolbar darkens the icon instead).
function secretHide(type) {
  if (!hideIcon) return null;
  const cv = document.createElement('canvas'); cv.width = 102; cv.height = 82; cv.setAttribute('aria-hidden', 'true');
  const c = cv.getContext('2d', { willReadFrequently: true });
  try {
    if (hideIcon.length >= 2) hideIcon(c, type, cv.width, cv.height);
    else { const r = hideIcon(type); if (r && r.width && r.height) c.drawImage(r, 0, 0, cv.width, cv.height); }
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 40) return cv;
  } catch (e) { console.warn('HIDE_ICON', type, e); }
  return null;
}

let renderer = debugRender;
let game, gameKind, audio = null;
// Maps (Part 2 step 7, STEP7.md): sim/maps/index.js (MAP_ORDER, MAP_SECRET, getMap) once the real game is up; the
// secrets store (ui/secrets.js) keeps which map secret units were found.
let mapsM = null, secrets = createSecrets([]), maps = null, found = null, hideIcon = null;
let mapPick = false; // STEP7 AUDIO: the panel closes because a card was picked (the map's page flip plays, not the rustle)
// STEP8 UI: the unit maker (sim/maker/index.js once the real game is up), the made units' store (ui/mine.js), the panel
let makerM = null, mine = null, makerPanel = null;
const hasMaps = () => !!(mapsM && game && typeof game.loadMap === 'function' && mapsM.allMaps().length > 0);
const state = { paused: false, muted: false, teams: false, result: '', reportOpen: false, statsOn: false, speed: 1, followArmed: false, following: false };
let report = null, toolbar, counts, controls, input, pilot, view = { scale: ZOOM, W: 1, H: 1 };
let intro = null;   // ui/intro.js, first visit only
let overSince = -1, fielded = [false, false], frameMs = 16.7, tickMs = 0;
const record = createFallbackRecord(); // only used while game.report() returns null

function holding() { return !!(game.holding ?? game.world?.holding); }
function canReport() { return typeof game.report === 'function' || record.active; }
const call = (name, ...args) => { if (audio && typeof audio[name] === 'function') { try { return audio[name](...args); } catch (e) { console.warn('audio.' + name, e); } } };

function uiState() { return { ...state, following: !!camera.follow, holding: holding(), canReport: canReport(), piloting: !!(pilot && pilot.active), mapsOpen: !!(maps && maps.open), foundOpen: !!(found && found.open), hasMaps: hasMaps(), makerOpen: !!(makerPanel && makerPanel.open) }; } // STEP8 UI: makerOpen

// Setting the canvas size clears it. A cleared canvas must never reach the screen: resize() repaints the whole field
// right away. Before (user, 11-14: "when I resize it [the green] comes out again"): it filled flat field green and left
// the repaint to the next frame, and the loop skips a draw when it is behind (a resize re-lays the ground, so it often
// is), so window drags and phone rotations showed flat green frames. tools/resizetest.mjs checks it.
function resize() {
  const r = fieldRect(), dpr = Math.min(devicePixelRatio || 1, 2); // OG caps DPR at 2 (game.js:8053-8057)
  canvas.style.left = `${r.left}px`; canvas.style.top = `${r.top}px`;
  canvas.style.width = `${r.w}px`; canvas.style.height = `${r.h}px`;
  const bw = Math.round(r.w * dpr), bh = Math.round(r.h * dpr), cleared = canvas.width !== bw || canvas.height !== bh;
  if (cleared) { canvas.width = bw; canvas.height = bh; } // same size twice (resize + phone-query events) = no clear
  if (cleared && !game) { ctx.fillStyle = (renderer.theme && renderer.theme.field) || debugRender.theme.field; ctx.fillRect(0, 0, bw, bh); } // boot only (page still hidden): never black
  if (!worldSet) { worldSet = true; camera.setWorld(Math.round(CAM.WORLD * r.w / ZOOM), Math.round(CAM.WORLD * r.h / ZOOM)); }
  const W = camera.W, H = camera.H;
  camera.setView(r.w, r.h, ZOOM, dpr);
  if (!game) camera.toFit();
  view = { scale: ZOOM * dpr, W, H, dpr, cssW: r.w, cssH: r.h, cam: camera };
  document.documentElement.style.setProperty('--field-l', `${r.left}px`);
  document.documentElement.style.setProperty('--field-t', `${r.top}px`);
  document.documentElement.style.setProperty('--field-w', `${r.w}px`);
  document.documentElement.style.setProperty('--field-h', `${r.h}px`);
  if (game) {   // the world keeps its size (camera); only the view changed
    placeOverlays(true);
    if (cleared) { drawFrame(); drew = true; }
  }
  return { W, H };
}

// Team battle midline + team labels follow the world's middle on screen (they were fixed at the window's middle).
let overlayV = '';
const teamLabels = document.getElementById('team-labels');
function placeOverlays(force) {
  const key = `${camera.version}|${teamLabels.hidden}|${getLang()}`;   // labels: placed once they show (widths known)
  if (!force && overlayV === key) return;
  overlayV = key;
  const r = fieldRect(), [mx] = camera.toView(camera.W / 2, 0), [, top] = camera.toView(0, 0), [, bot] = camera.toView(0, camera.H);
  const [lx] = camera.toView(camera.W / 4, 0), [rx] = camera.toView(camera.W * 3 / 4, 0);
  const st = document.documentElement.style;
  // Red / Blue team labels stay whole on screen and clear of the round buttons beside them (attack 11-16: panned far,
  // "Red team" ran off the left edge and "Blue team" under the phone's Team battle button). Desktop: centred on the
  // quarter points (--lab-l / --lab-r); phone: their inner edges hug the midline (--lab-pl / --lab-pr). Sizes are read
  // before any style is written (no forced layout while the camera moves).
  const [L, R] = teamLabels.children, lw = teamLabels.hidden ? 0 : L.offsetWidth, rw = teamLabels.hidden ? 0 : R.offsetWidth;
  let lo = r.left + 8, hi = r.left + r.w - 8;
  if (lw || rw) {
    const lb = L.getBoundingClientRect();
    for (const b of document.querySelectorAll('#controls > button, #teams, #pilot-x')) {
      const q = b.getBoundingClientRect();
      if (!q.width || q.bottom <= lb.top || q.top >= lb.bottom) continue;
      if (q.left + q.right > 2 * r.left + r.w) hi = Math.min(hi, q.left - 8); else lo = Math.max(lo, q.right + 8);   // by screen half
    }
  }
  st.setProperty('--mid-x', `${r.left + mx}px`);
  st.setProperty('--mid-t', `${r.top + Math.max(0, top)}px`);
  st.setProperty('--mid-h', `${Math.max(0, Math.min(r.h, bot) - Math.max(0, top))}px`);
  st.setProperty('--lab-l', `${Math.max(lo + lw / 2, Math.max(r.left + 60, Math.min(r.left + mx - 60, r.left + lx)))}px`);
  st.setProperty('--lab-r', `${Math.min(hi - rw / 2, Math.min(r.left + r.w - 60, Math.max(r.left + mx + 60, r.left + rx)))}px`);
  let pl = Math.max(lo + lw, r.left + mx - 9), pr = Math.min(hi - rw, r.left + mx + 9);
  if (pr < pl + 18) { if (pl > r.left + mx - 9) pr = Math.min(hi - rw, pl + 18); else pl = Math.max(lo + lw, pr - 18); }
  st.setProperty('--lab-pl', `${pl}px`);
  st.setProperty('--lab-pr', `${pr}px`);
}
function drawFrame() {
  const m = camera.matrix(view.scale);
  if (ctx.setCamera) { ctx.setCamera(m[0], m[4], m[5]); ctx.setMip && ctx.setMip(camera.z < 0.85); }
  renderer.draw(ctx, game.world, view, state.paused ? 1 : Math.min(1, acc / STEP));
}

// OG watchRound (game.js:8271-8289), used only if the game has no result() of its own.
function teamCounts(world) { // alive with hp > 0 per team (OG game.js:11553-11561)
  let a = 0, b = 0;
  for (const u of world.units) { if (!u || u.dead || !(u.hp > 0)) continue; const t = teamOf(u); if (t === 0) a++; else if (t === 1) b++; }
  return [a, b];
}
function watchRound() {
  let res = '';
  if (typeof game.result === 'function') res = game.result() || '';
  else if (state.teams && !holding()) {
    if (!state.result) record.sample(game.world);
    const [n, o] = teamCounts(game.world);
    if (n > 0) fielded[0] = true;
    if (o > 0) fielded[1] = true;
    if (fielded[0] && fielded[1] && (n === 0 || o === 0)) {
      if (overSince < 0) overSince = game.world.time;
      if (game.world.time - overSince >= ROUND_OVER) res = n > 0 ? 'left' : o > 0 ? 'right' : 'draw';
    } else overSince = -1;
  } else overSince = -1;
  if (res !== state.result) {
    state.result = res;
    if (res) record.finish(game.world, res); else record.resume();
    // the sim's own watch emits a 'win' event; play it here only on the local fallback path
    if ((res === 'left' || res === 'right') && typeof game.result !== 'function') call('win');
    controls.update();
  }
}

// ---- actions ----
const actions = {
  state: uiState,
  clearField(click) { viaBreak(() => clearNow(click)); },
  newBattle() { viaBreak(() => { clearNow(true); input && input.guard(TAP_GUARD); }); },
  togglePause(click) { setPaused(!state.paused); if (click) call('ui'); },
  toggleSound() {
    state.muted = !state.muted;
    try { localStorage.setItem(MUTE_KEY, state.muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
    applyMute();
    if (!state.muted) call('ui');
    controls.update();
  },
  toggleLang() { toggleLang(); call('ui'); },
  toggleTeams() {
    state.teams = !state.teams;
    game.setTeamMode(state.teams); // on: every unit joins its half's team + holding; off: back to own sides (user 11-17: never wipes)
    if (state.teams) { camera.toFit(); input && input.syncRadius(); }   // both halves + the midline in view
    if (game.tool) rcall('prewarm', game.tool, state.teams);   // bake the picked tool's red/blue (or own) sprites now (attack L4)
    fielded = [false, false]; overSince = -1; record.clear();
    call('ui'); input.restyle(); controls.update(); placeStart();
  },
  startRound() {
    if (!holding()) return;
    game.start(); record.begin(game.world); setPaused(false); call('ui'); controls.update(); // OG game.js:8259-8261
    input && input.guard(TAP_GUARD);   // START hides: a double tap's second tap must not paint where it was
  },
  openReport() {
    const s = (game.report && game.report()) || record.summary(game.world);
    call('ui');
    if (!s) return;
    report = openReport(document.getElementById('app'), s, { iconFor, teamColors: [(renderer.theme || debugRender.theme).red, (renderer.theme || debugRender.theme).blue], onClose: actions.closeReport });
    state.reportOpen = true;
  },
  closeReport() { if (report) { report.close(); input && input.guard(TAP_GUARD); } report = null; state.reportOpen = false; },
  toggleStats() { state.statsOn = !state.statsOn; controls.setStats(state.statsOn ? statsText() : null); },
  stepOnce() { if (state.paused) game.stepOnce(); },
  cycleSpeed() { speedI = (speedI + 1) % SPEEDS.length; state.speed = SPEEDS[speedI]; call('ui'); controls.update(); },
  armFollow() { if (pilot && pilot.active) return; if (camera.follow || state.followArmed) { camera.follow = null; state.followArmed = false; camera.version++; } else state.followArmed = true; call('ui'); controls.update(); },
  panKey(dx, dy) { camera.panBy(dx, dy); },
  zoomKey(k) { camera.zoomAt(camera.vw / 2, camera.vh / 2, k); input && input.syncRadius(); },
  fit() { camera.toFit(); input && input.syncRadius(); },
  nextTab(d) { toolbar.nextTab(d); },
  // Possess (Part 2 step 3): hold a unit 0.5 s to take it over (ui/input.js), X / Esc to leave (ui/pilot.js)
  possess(u, pointerId) {
    if (!game.possess || !game.possess(u)) return;
    state.followArmed = false;
    pilot.begin(u, pointerId);
    camera.follow = u; camera.version++;
    call('ui'); controls.update();
  },
  leave() { if (game.release) game.release(); endPilot(); call('ui'); },
  selectSlot(i) { toolbar.selectSlot(i); },
  // Maps (Part 2 step 7): clear + paint map `id` ('blank' = the empty field), its secret left out once found; the
  // view goes back to the whole field. Team battle stays on (the sim goes back to holding, as Clear).
  loadMap(id, click) {
    if (typeof game.loadMap !== 'function') return;
    if (click) { viaBreak(() => actions.loadMap(id, false)); return; }   // a pick in the maps panel = a natural break
    const type = mapsM && mapsM.MAP_SECRET[id];
    game.loadMap(id, { secret: !(type && secrets.has(type)) });
    rcall('clear'); record.clear(); fielded = [false, false]; overSince = -1;
    camera.toFit(); input && input.syncRadius();
    if (maps) { mapPick = true; maps.hide(); mapPick = false; } // STEP7 AUDIO: no rustle, no ui click: the sim's 'map' event plays the page flip
    controls.update(); placeStart();
  },
  toggleMaps(click) { if (!maps || !hasMaps()) return; if (maps.open) maps.hide(); else maps.show(); }, // STEP7 AUDIO: the panel's rustle (onOpenChange) is its sound
  openMaps(hint) { if (maps && hasMaps()) { maps.show(hint || null); } }, // STEP7 AUDIO: rustle via onOpenChange (was a ui click)
  closeMaps() { if (maps) maps.hide(); },
  // A tap on the map's hidden secret unit (ui/input.js): off the map, saved as found, the Found card; when the card
  // closes the Secret tab opens with the unit picked.
  findSecret() {
    if (typeof game.findSecret !== 'function') return null;
    const type = game.findSecret();
    if (!type) return null;
    secrets.add(type);
    toolbar.refreshSecret();
    if (found) found.show(type);
    call('foundCard'); controls.update(); // STEP7 AUDIO: a paper pop as the card lands (the sim's 'secret' event plays the fanfare)
    return type;
  },
  closeFound() { if (found) found.close(); },
  // STEP8 UI: the unit maker. openMaker(type) edits that made unit, openMaker() makes a new one.
  openMaker(type) {
    if (!makerPanel || (pilot && pilot.active)) return;
    const r = type && makerM ? makerM.recipeOf(type) : null;
    if (!r && type) return;
    if (!r && mine.full) return;
    makerPanel.show(r); call('ui');
  },
  closeMaker() { if (makerPanel) makerPanel.hide(); },
  makerEscape() { if (makerPanel) { makerPanel.escape(); call('ui'); } },
};
// STEP8 UI: register the stored made units (and drop the ones that are gone): a recipe that changed is registered again
// and its look and icons are made again. Returns the types that changed (their field copies come off: clearMadeUnits).
function syncMade() {
  if (!makerM || !mine) return [];
  const changed = [], want = new Set();
  for (const r of mine.list()) {
    const type = makerM.madeType(r.id), had = makerM.recipeOf(type);
    want.add(type);
    if (had && JSON.stringify(had) === JSON.stringify(r)) continue;
    try { makerM.registerMade(r); } catch (e) { console.warn('maker: register', type, e); continue; }
    if (had) changed.push(type);
    rcall('forgetType', type); dropIcon(type); if (counts) counts.forget(type);
  }
  for (const type of makerM.madeTypes()) if (!want.has(type)) { makerM.unregisterMade(type); changed.push(type); rcall('forgetType', type); dropIcon(type); if (counts) counts.forget(type); }
  return changed;
}
// STEP8 UI: Save = cleanRecipe (the panel) -> store -> registerMade -> renderer.forgetType -> clearMadeUnits (edit) ->
// toolbar refresh -> that unit picked. Delete = its copies off the field, unregistered, out of the store.
function saveMade(recipe, isNew) {
  const r = mine.save(recipe, isNew);
  if (!r) return;
  const type = makerM.madeType(r.id);
  for (const tp of syncMade()) makerM.clearMadeUnits(game.world, tp);   // an edit: the old copies come off the field (no deaths)
  syncPilot();
  toolbar.refreshMine(type);
  rcall('prewarm', { kind: 'unit', type }, state.teams);
  input && input.guard(TAP_GUARD);
  call('ui'); controls.update();
}
function deleteMade(recipe) {
  const type = makerM.madeType(recipe.id);
  makerM.clearMadeUnits(game.world, type);
  mine.remove(recipe.id);
  for (const tp of syncMade()) makerM.clearMadeUnits(game.world, tp);
  syncPilot();
  toolbar.refreshMine();
  input && input.guard(TAP_GUARD);
  call('ui'); controls.update();
}
// The sim drops the player (unit died, turned, Clear) or hands them to a new unit (rider thrown, frog): follow along.
function endPilot() {
  if (!pilot || !pilot.active) return;
  pilot.end();
  camera.follow = null; camera.version++;
  controls.update();
}
function syncPilot() {
  if (!pilot || !pilot.active) return;
  const u = game.possessed;
  if (!u) { endPilot(); return; }
  if (camera.follow !== u) { camera.follow = u; camera.version++; }
  pilot.update();
}
function setPaused(b) { state.paused = !!b; game.setPaused(state.paused || adHold); controls.update(); }
function clearNow(click) { game.clear(); rcall('clear'); record.clear(); fielded = [false, false]; overSince = -1; if (click) call('ui'); controls.update(); }
function placeStart() { controls.placeStart(toolbar.el); setInsets(); }
// Step 7 (lead): tell the camera which parts of the view the UI covers, so the map under the tool bar / round buttons can
// be panned into sight (camera.js inset).
function setInsets() {
  if (!toolbar || !toolbar.el) return;
  const cr = canvas.getBoundingClientRect(), tb = toolbar.el.getBoundingClientRect(), bt = document.getElementById('clear');
  const br = bt ? bt.getBoundingClientRect() : null;
  const b = tb.height > 0 && tb.top < cr.bottom ? Math.max(0, Math.min(cr.height * 0.6, cr.bottom - tb.top)) : 0;
  const t = br && br.height > 0 && br.bottom > cr.top ? Math.max(0, Math.min(cr.height * 0.3, br.bottom - cr.top + 6)) : 0;
  camera.setInset(Math.round(t), 0, Math.round(b), 0);
}

function statsText() { // OG game.js:8290-8310 (our own lines)
  const w = game.world, c = game.counts ? game.counts() : {};
  const units = Object.values(c).reduce((x, y) => x + y, 0);
  const list = Object.entries(c).map(([k, v]) => `${k} ${v}`).join('  ');
  return `${(1000 / frameMs).toFixed(0)} fps  tick ${tickMs.toFixed(2)} ms\nunits ${units}  (${list})\nbullets ${(w.projectiles || []).length}  ${gameKind}`;
}

// ---- loop ----
let acc = 0, last = -1, drawnBy = -Infinity, drew = false, statsAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (drew) { drawnBy = now; drew = false; }
  const dt = last < 0 ? 0 : Math.min((now - last) / 1000, DT_CAP);
  last = now;
  if (iconQueue.length) pumpIcons(6);
  if (dt > 0) frameMs += 0.05 * (1000 * dt - frameMs);
  portalPlaying(shown && touched && !state.paused && !adHold && !state.reportOpen && !(maps && maps.open) && !(found && found.open) && !(makerPanel && makerPanel.open) && !document.hidden, dt);
  if (!state.paused && !adHold) acc += dt * state.speed;   // slow motion: the sim runs slower, the screen doesn't
  syncPilot();
  const fv = camera.follow; camera.update(dt); if (fv && !camera.follow) controls.update();
  placeOverlays(false);
  let n = 0;
  const t0 = performance.now();
  while (acc >= STEP && n < MAX_TICKS) { game.tick(); acc -= STEP; n++; }
  if (n > 0) tickMs += 0.05 * ((performance.now() - t0) / n - tickMs);
  if (acc > DT_CAP) acc = DT_CAP;
  if (acc >= STEP && now - drawnBy < 120) return;
  drew = true;
  drawFrame();
  if (!shown && uiDone) { for (const e of iconSource.all()) if (!e.done && e.waiting.some(cv => cv.isConnected)) paintIcon(e); reveal(); } // the open tab's icons are in the first shown frame
  else if (shown && !audioOn) startAudio();
  if (shown && intro && !intro.started) intro.play();
  const events = game.drainEvents ? game.drainEvents() : [];
  if (events.length) rcall('handleEvents', events, game.world);
  call('handleEvents', events, game.world);   // every frame: the audio engine's demand counts decay per call (11-15)
  watchRound();
  syncPilot();   // a death or hand-over this frame shows at once
  call('update', state.paused || adHold, game.world);
  if (state.statsOn && now - statsAt > 250) { statsAt = now; controls.setStats(statsText()); }
}

async function boot() {
  try { state.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* storage blocked */ }
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  debugRender.refreshTheme();
  // UI pictures before the game boots: toBlob encodes in idle time, so running frames would hold it up (measured 11-14)
  const [art] = await Promise.all([loadArt(), paintUI()]);
  uiDone = true;
  if (art) { renderer = art; document.body.dataset.art = 'paint'; }
  else if (ctx.isGL) { dropGL2D(); ctx = plain2d(); } // the debug renderer draws with the full 2D API
  document.body.dataset.gl = ctx.isGL ? '1' : '0';
  const { W, H } = resize();
  if (ctx.setClear) ctx.setClear(OUTSIDE);
  const seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 32) >>> 0;
  ({ game, kind: gameKind } = await pickGame(W, H, seed));
  if (gameKind === 'real') { try { mapsM = await import('./sim/maps/index.js'); } catch (e) { console.warn('maps', e); } }
  if (art) {
    try { const m = await import('./render/art/sprites-secret.js'); if (typeof m.HIDE_ICON === 'function') hideIcon = m.HIDE_ICON; } catch (e) { /* no secret art yet */ }
    try { const m = await import('./render/art/sprites.js'); if (typeof m.paintStandalone === 'function' && typeof m.entOf === 'function') spritesM = m; } catch (e) { /* drawIcon then */ }
  }
  secrets = createSecrets(mapsM ? Object.values(mapsM.MAP_SECRET) : [], params.get('secrets'));
  // STEP8 UI: the unit maker: the stored made units are registered before the toolbar is built (their Mine cards)
  if (gameKind === 'real') {
    try { const m = await import('./sim/maker/index.js'); if (typeof m.registerMade === 'function') makerM = m; } catch (e) { console.warn('maker', e); }
    if (makerM) {
      try { mine = createMineStore({ mode: params.get('mine'), clean: makerM.cleanRecipe, max: makerM.MINE_MAX }); setMadeLookup(makerM.recipeOf); syncMade(); }
      catch (e) { console.warn('mine store', e); makerM = null; mine = null; }
    }
  }
  audio = await loadAudio(); // init() runs once the page is shown (startAudio): its 250 ms context timer counts from then

  controls = createControls(actions);
  let unlocked = false;
  const unlock = () => { if (unlocked || !audioOn) return; unlocked = true; call('unlock'); }; // OG game.js:6345-6352
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });

  let tool = null;
  pilot = createPilot({
    root: document.getElementById('app'), camera, game: () => game, iconFor, label: say,
    teamColors: [(renderer.theme || debugRender.theme).red, (renderer.theme || debugRender.theme).blue],
    onLeave: () => actions.leave(),
  });
  input = attachInput(canvas, ring, {
    camera,
    pilot,
    grab: document.getElementById('grab'),
    onGrab: (u, pid) => actions.possess(u, pid),
    followArmed: () => state.followArmed,
    onFollowPick: (u) => { state.followArmed = false; camera.follow = u || null; camera.version++; controls.update(); },
    game: () => game,
    getTool: () => tool,
    onPaint: (tl, x, y, n, len) => call('onPaint', tl, x, y, n, len),
    onSecret: () => actions.findSecret(),   // step 7: a tap on the map's hidden secret unit
    ringColor: (tl, x) => {
      if (!tl) return debugRender.theme.outline;
      if (state.teams && tl.kind === 'unit' && teamable(tl.type)) return x < game.world.W / 2 ? debugRender.theme.red : debugRender.theme.blue;
      return (renderer.toolColor || debugRender.toolColor)(tl);
    },
  });
  toolbar = createToolbar(document.getElementById('toolbar'), {
    iconFor,
    onSelect: (tl) => { tool = tl; game.setTool(tl); input.setTool(); call('ui'); rcall('prewarm', tl, state.teams); }, // every pick plays ui (OG game.js:8223-8228)
    onLayout: () => { placeStart(); counts && counts.keepClear(); },
    secret: { // step 7: Secret tab cards stay locked until found; a locked card opens the maps panel at its map
      has: (type) => secrets.has(type),
      mapOf: (type) => (mapsM ? mapsM.MAP_ORDER.find((id) => mapsM.MAP_SECRET[id] === type) || 'blank' : 'blank'),
      onLocked: (type) => { call('lockedCard'); actions.openMaps(mapsM && mapsM.MAP_ORDER.find((id) => mapsM.MAP_SECRET[id] === type)); }, // STEP7 AUDIO: padlock rattle
      hideIcon: secretHide,
    },
    mine: mine ? { // STEP8 UI: the Mine tab: made cards (store order), the + card, the edit button
      types: () => mine.list().map((r) => makerM.madeType(r.id)).filter((tp) => !!makerM.recipeOf(tp)),
      canAdd: () => !mine.full,
      tag: (type) => { const r = makerM.recipeOf(type); return r ? r.name : ''; },
      onAdd: () => actions.openMaker(),
      onEdit: (type) => actions.openMaker(type),
    } : null,
  });
  if (mine) {
    makerPanel = createMaker({
      root: document.getElementById('app'), maker: makerM, store: mine,
      onSave: (r, isNew) => saveMade(r, isNew), onDelete: (r) => deleteMade(r),
      onOpenChange: (open) => { if (!open) input.guard(TAP_GUARD); controls.update(); },
      sound: () => call('ui'),
    });
  }
  if (mapsM) {
    maps = createMapsPanel({
      root: document.getElementById('app'), secrets, iconFor,
      maps: { order: mapsM.MAP_ORDER, secretOf: mapsM.MAP_SECRET, has: (id) => !!mapsM.getMap(id), groundOf: (id) => (mapsM.getMap(id) || {}).ground || 'grass' },
      current: () => game.mapId || 'blank', aspect: () => camera.W / camera.H,
      onPick: (id) => actions.loadMap(id, true),
      onOpenChange: (open) => { if (!mapPick) call('mapsPanel', open); if (!open) input.guard(TAP_GUARD); controls.update(); }, // STEP7 AUDIO: paper rustle as it opens / closes (button, N, Esc, X, backdrop)
    });
    found = createFound({ root: document.getElementById('app'), bigIcon, onClose: (type) => { input.guard(TAP_GUARD); toolbar.openSecret(type); controls.update(); } });
  }
  counts = createCounts(document.getElementById('counts'), { getCounts: () => (game.counts ? game.counts() : {}), iconFor, toolbarEl: () => toolbar.el });
  toolbar.selectIndex(0); // starting tool = tool 0 (OG page-ui.js:1071)

  onLang(() => { toolbar.relabel(); counts.relabel(); controls.relabel(); pilot.relabel(); if (maps) maps.relabel(); if (makerPanel) makerPanel.relabel(); }); // STEP8 UI: + maker
  const onResize = () => { resize(); placeStart(); counts.keepClear(); };
  addEventListener('resize', onResize);
  phoneQuery.addEventListener('change', onResize);
  // iOS: block pinch-zoom gestures and double-tap zoom outside the canvas too
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  // Embedded (itch iframe): a wheel over the buttons or the toolbar scrolled the page around the game (Firefox; Chrome
  // between the round buttons). Let it through only where something inside can still scroll that way (report card,
  // phone tool row); Ctrl+wheel stays the browser's zoom. The field's own wheel = brush size (ui/input.js).
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    for (let n = e.target; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (e.deltaY && /auto|scroll/.test(cs.overflowY) && (e.deltaY < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return;
      if (e.deltaX && /auto|scroll/.test(cs.overflowX) && (e.deltaX < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1)) return;
    }
    e.preventDefault();
  }, { passive: false });

  controls.update(); placeStart();
  if (params.get('map')) actions.loadMap(params.get('map'));   // ?map=<id>: start on that map (shots, tests)
  if (gameKind === 'real' && wantIntro(params)) {
    try {
      intro = createIntro({
        root: document.getElementById('app'), canvas, camera, game, toolbar, tools: TOOLS, getTool: () => tool,
        radius: () => input.radius / Math.min(1, camera.z),   // = ui/input.js simR(): what a finger paints with
        prewarm: (tl) => rcall('prewarm', tl, state.teams),
        onPaint: (tl, x, y, n, len) => call('onPaint', tl, x, y, n, len),
      });
      intro.setup();
    } catch (e) { console.warn('intro', e); intro = null; }
  }
  document.body.dataset.game = gameKind;
  window.__pb = { get game() { return game; }, get ctx() { return ctx; }, kind: gameKind, state, toolbar, counts, actions, TOOLS, camera, pilot, get view() { return view; }, get audio() { return audio; }, secrets, maps, found, portal, get intro() { return intro; },
    mine, maker: makerPanel, makerM, CATEGORIES: toolbar.tabs }; // STEP8 UI: made units store, maker panel, maker module, the tabs shown
  // Phone app (Android / iOS shell, step 5): Back button + app pause. Never loaded on the web.
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
    import('./app-shell.js').then((m) => m.installAppShell({ actions, state, camera, pilot: () => pilot, audio: () => audio })).catch((e) => console.error('app shell', e));
  requestAnimationFrame(frame);
}
boot();
