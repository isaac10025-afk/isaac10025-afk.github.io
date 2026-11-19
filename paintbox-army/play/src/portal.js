// Web game sites (Poki, CrazyGames, GamePix, Yandex Games / Playhop, Y8): the one place the game talks to a site's SDK. OURS.
// The web build (tools/web-build.mjs) adds the site's SDK <script> and <meta name="pb-portal" content="poki|crazygames">
// to index.html (GamePix also gets window.GamePixConfig = { lifecycle: 'manual' } before its tag). Everywhere else (laptop Play tile, the phone app, tests, the plain game folder) there is no meta and
// no SDK: every call here does nothing and a break runs its callback at once, in the same tick.
// An ad blocker can stop the SDK script on a site build: same as no SDK (init fails -> nothing is ever called).
//
// Contract read from the live SDKs headless (11-17, ~/.venvs/itch Playwright): Poki v2 init / gameLoadingFinished /
// gameplayStart / gameplayStop / commercialBreak(onStart) -> promise; CrazyGames 3.8.0 SDK.init, SDK.game (a getter:
// a new object each read) loadingStart / loadingStop / gameplayStart / gameplayStop / settings.muteAudio +
// addSettingsChangeListener, SDK.ad.requestAd('midgame', { adStarted, adFinished, adError }). GamePix v3 (manual
// lifecycle, partners.gamepix.com/sdk/doc, re-read 10-29 for queens-puzzle): lifecycle.loading(n), lifecycle.loaded()
// -> promise (the gate: no ad before it resolves), lifecycle.gameStart() once, ads.interstitial() -> { success },
// events.on('pause' | 'resume'). GamePix has no gameplay start/stop and no "ad started" callback: its pause during one
// of our breaks (page visible) is that signal; any other pause holds the game and mutes until its resume.
// Yandex Games v2 (bundle read 11-18 from yandex.ru/games/sdk/v2; the build loads /sdk.js, served by Yandex next to the
// game): YaGames.init() -> ysdk; ysdk.features.LoadingAPI.ready(); ysdk.features.GameplayAPI.start() / stop();
// ysdk.adv.showFullscreenAdv({ callbacks: { onOpen, onClose(wasShown), onError, onOffline } }); ysdk.on('game_api_pause' |
// 'game_api_resume') = the site holds the game (its own overlays, hidden tab): hold + mute, like GamePix's pause; during
// our break the ad's own hold is ours already. ysdk.environment.i18n.lang picks the language when the player never did.
// Y8 minimal SDK 2.0 (bundle read 11-18, cdn.y8.com/minimal-sdk/2-0/y8.min.js, docs.y8.com/sdk): the script fires
// 'y8sdk.ready' on window (or is there already); y8.sdk().init({ appId, autoLogin }, { gameId, preloadAdBreaks, sound,
// onReady }); showAd({ type: 'next', name, beforeAd, afterAd, adBreakDone }) - adBreakDone always comes, also when Y8's own
// cap (ad_timing, 180 s default) skips the ad. The app / game ids come from the build (<meta name="pb-y8-app|pb-y8-game">).
// No gameplay start/stop, no site pause. autoLogin off: nothing here needs a Y8 login.
// Rules kept (game-platform-port skill + CrazyGames requirements): gameplay calls at most one per second (CrazyGames
// logs an ERROR under 1 s); gameplayStop before an ad; mute only once the ad really starts; every ad races a 60 s
// timeout; no ad before the player has played; every SDK call in try/catch (CrazyGames can init, then throw).

const meta = typeof document !== 'undefined' && document.querySelector('meta[name="pb-portal"]');
const SITE = (meta && meta.content) || '';
const GAP_MS = 1100;          // between two gameplay calls (CrazyGames throttles under 1000 ms)
const AD_TIMEOUT_MS = 60000;  // an ad that never answers gives the game back
export const PLAY_BEFORE_BREAK = 60; // s of gameplay since the session start / the last break before a break may show an ad

let sdk = null;               // { start(), stop(), loaded(), ad(onStart) -> Promise } once init worked
let ready = false, loadedAsked = false, loadedSent = false, noAds = false;
let want = false, sent = false, sentAt = -Infinity;
let played = 0;               // s of gameplay since the last break
let inBreak = false;
const muteFns = [], holdFns = [];
let adStartCb = null;         // GamePix: the running break's onStart, fired by GamePix's pause
const log = [];               // calls made, for tests (window.__pb.portal.log)
function note(s) { if (log.length < 400) log.push(s); }
function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

function poki() {
  const P = window.PokiSDK;
  return {
    start: () => P.gameplayStart(),
    stop: () => P.gameplayStop(),
    loaded: () => P.gameLoadingFinished(),
    ad: (onStart) => P.commercialBreak(onStart),
  };
}
function crazy() {
  const S = window.CrazyGames.SDK;
  const tell = () => { const m = !!safe(() => S.game.settings.muteAudio); for (const f of muteFns) safe(() => f(m)); };
  safe(() => S.game.addSettingsChangeListener(tell));
  return {
    start: () => S.game.gameplayStart(),
    stop: () => S.game.gameplayStop(),
    loaded: () => S.game.loadingStop(),
    ad: (onStart) => new Promise((done) => S.ad.requestAd('midgame', { adStarted: onStart, adFinished: done, adError: done })),
    begin: () => S.game.loadingStart(),
    muted: () => !!safe(() => S.game.settings.muteAudio),
  };
}

function gamepix() {
  const G = window.GamePix;
  let begun = false;
  const sitePause = (b) => { note(b ? 'sitePause' : 'siteResume'); for (const f of holdFns) safe(() => f(b)); for (const f of muteFns) safe(() => f(b)); };
  let paused = false;
  safe(() => G.events.on('pause', () => {
    if (inBreak) { if (adStartCb && document.visibilityState === 'visible') { const f = adStartCb; adStartCb = null; f(); } return; }
    if (!paused) { paused = true; sitePause(true); }
  }));
  safe(() => G.events.on('resume', () => { if (paused) { paused = false; sitePause(false); } }));
  return {
    start: () => { if (!begun) { begun = true; G.lifecycle.gameStart(); note('gameStart'); } },
    stop: () => {},
    loaded: () => G.lifecycle.loaded(),
    ad: (onStart) => { adStartCb = onStart; return Promise.resolve(G.ads.interstitial()).finally(() => { adStartCb = null; }); },
  };
}

function yandex(Y) {
  const F = Y.features || {};
  let paused = false;
  const sitePause = (b) => { note(b ? 'sitePause' : 'siteResume'); for (const f of holdFns) safe(() => f(b)); for (const f of muteFns) safe(() => f(b)); };
  safe(() => Y.on('game_api_pause', () => { if (!inBreak && !paused) { paused = true; sitePause(true); } }));
  safe(() => Y.on('game_api_resume', () => { if (paused) { paused = false; sitePause(false); } }));
  const calm = (p) => { if (p && p.catch) p.catch(() => {}); };   // its calls answer with promises that can reject (off its page: no parent frame)
  return {
    start: () => calm(F.GameplayAPI.start()),
    stop: () => calm(F.GameplayAPI.stop()),
    loaded: () => calm(F.LoadingAPI.ready()),
    ad: (onStart) => new Promise((done) => Y.adv.showFullscreenAdv({ callbacks: {
      onOpen: onStart, onClose: () => done(), onError: () => done(), onOffline: () => done(),
    } })),
    lang: () => safe(() => Y.environment.i18n.lang) || '',
  };
}

function y8site(Y) {
  return {
    start: () => {}, stop: () => {}, loaded: () => {},
    ad: (onStart) => new Promise((done) => {
      const p = Y.showAd({ type: 'next', name: 'new-battle', beforeAd: onStart, afterAd: () => {}, adBreakDone: () => done() });
      if (p && p.catch) p.catch(() => done());
    }),
  };
}
const metaOf = (n) => { const m = typeof document !== 'undefined' && document.querySelector(`meta[name="${n}"]`); return (m && m.content) || ''; };

const langFns = [];
/** The site's language (Yandex: ysdk.environment.i18n.lang, e.g. 'ru', 'en', 'zh'); cb(code) once it is known. */
export function onSiteLang(cb) { langFns.push(cb); }

/** Call once at boot. Never awaited by the game. */
export function initPortal() {
  if (SITE === 'poki' && window.PokiSDK) {
    // init rejects under an ad blocker; Poki: carry on, the other calls still work (its breaks just answer at once)
    new Promise((res, rej) => { try { Promise.resolve(window.PokiSDK.init()).then(res, rej); } catch (e) { rej(e); } })
      .catch(() => note('init rejected')).then(() => { sdk = poki(); up(); });
  } else if (SITE === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
    new Promise((res, rej) => { try { Promise.resolve(window.CrazyGames.SDK.init()).then(res, rej); } catch (e) { rej(e); } }).then(() => {
      if (!window.CrazyGames.SDK.game) throw new Error('no game module');
      sdk = crazy(); safe(sdk.begin); note('loadingStart');
      // Basic Launch: ads are off and prefetchAd throws at once -> breaks never ask (no 1 s gameplayStop wait for nothing)
      try { const pf = window.CrazyGames.SDK.ad.prefetchAd('midgame'); if (pf && pf.catch) pf.catch(() => {}); } catch (e) { noAds = true; note('ads off'); }
      up();
      if (sdk.muted()) for (const f of muteFns) safe(() => f(true));
    }).catch(() => note('init failed'));
  } else if (SITE === 'yandex' && window.YaGames) {
    new Promise((res, rej) => { try { Promise.resolve(window.YaGames.init()).then(res, rej); } catch (e) { rej(e); } }).then((Y) => {
      if (!Y || !Y.adv) throw new Error('no ysdk');
      sdk = yandex(Y); const l = sdk.lang(); note('lang ' + l);
      if (l) for (const f of langFns) safe(() => f(l));
      up();
    }).catch(() => note('init failed'));
  } else if (SITE === 'y8') {
    const app = metaOf('pb-y8-app'), game = metaOf('pb-y8-game') || app;
    const go = () => {
      if (sdk || !window.y8 || !window.y8.sdk) return;
      let Y, p;
      try { Y = window.y8.sdk(); p = Promise.resolve(Y.init({ appId: app, autoLogin: false }, { gameId: game, preloadAdBreaks: 'on', sound: 'on', onReady: () => note('y8 ads ready') })); }
      catch (e) { p = Promise.reject(e); }
      p.then(() => { sdk = y8site(Y); up(); }, () => note('init failed'));
    };
    if (window.y8 && window.y8.sdk) go(); else addEventListener('y8sdk.ready', go, { once: true });
  } else if (SITE === 'gamepix' && window.GamePix && window.GamePix.lifecycle) {
    sdk = gamepix(); safe(() => window.GamePix.lifecycle.loading(10)); note('loading');
    if (loadedAsked) loaded();   // ready comes once lifecycle.loaded() resolves (loaded() asks it)
  }
}
function up() { ready = true; note('ready ' + SITE); if (loadedAsked) loaded(); }

/** The first whole frame is on screen. */
export function loaded() {
  loadedAsked = true;
  if (SITE === 'gamepix') {
    if (!sdk || loadedSent) return;
    loadedSent = true; note('loaded');
    let p; try { p = Promise.resolve(sdk.loaded()); } catch (e) { p = Promise.reject(e); }
    p.then(() => { ready = true; note('ready gamepix'); }, () => note('loaded failed'));
    return;
  }
  if (!ready || loadedSent) return;
  loadedSent = true; safe(sdk.loaded); note('loaded');
}

/** Every frame: is the player playing right now (field shown, no panel / report / pause / ad)? dt in s. */
export function playing(on, dt) {
  want = !!on && !inBreak;
  if (want && dt > 0) played += dt;
  if (!ready || want === sent) return;
  const now = performance.now();
  if (now - sentAt < GAP_MS) return;   // the next frame past the gap sends the newest state
  sent = want; sentAt = now;
  safe(sent ? sdk.start : sdk.stop); note(sent ? 'gameplayStart' : 'gameplayStop');
}

/** The site pauses the game (GamePix's pause outside our breaks: its menus, a hidden tab). cb(true|false). */
export function onSiteHold(cb) { holdFns.push(cb); }

/** Site settings mute (CrazyGames' own sound switch; GamePix's pause). cb(true|false); called again on every change. */
export function onSiteMute(cb) { muteFns.push(cb); if (ready && sdk.muted && sdk.muted()) cb(true); }

/**
 * A natural break (Clear, New battle, a map pick): maybe an ad, then then().
 * hold(true) as the ad is asked for (the game stops the sim and takes no input), quiet(true) once the ad really
 * starts (mute), both false again before then(). No site / not ready / not played enough: then() at once.
 */
export function breakThen(then, { hold = () => {}, quiet = () => {} } = {}) {
  if (!ready || noAds || inBreak || played < PLAY_BEFORE_BREAK) { then(); return; }
  inBreak = true; played = 0; want = false;
  hold(true); note('break');
  let started = false;
  const go = () => {
    if (sent && SITE !== 'gamepix') {   // gameplayStop goes out first (GamePix has none), keeping the 1 s gap (frames may have stopped: hidden tab)
      const wait = GAP_MS - (performance.now() - sentAt);
      if (wait > 0) { setTimeout(go, wait); return; }
      sent = false; sentAt = performance.now(); safe(sdk.stop); note('gameplayStop');
    }
    let ad;
    try { ad = Promise.resolve(sdk.ad(() => { started = true; note('adStarted'); safe(() => quiet(true)); })); }
    catch (e) { ad = Promise.resolve(); }
    Promise.race([ad.catch(() => {}), new Promise((r) => setTimeout(r, AD_TIMEOUT_MS))]).then(() => {
      note(started ? 'adDone' : 'adNone');
      if (started) safe(() => quiet(false));
      safe(() => hold(false));
      inBreak = false;
      then();
    });
  };
  go();
}

export const portal = { get site() { return SITE; }, get ready() { return ready; }, get played() { return played; }, set played(v) { played = v; }, get inBreak() { return inBreak; }, get sent() { return sent; }, log };
