// Phone app shell (PLAN Part 2 step 5, OURS). Loaded by main.js only inside the Android / iOS app (Capacitor's
// native bridge sets window.Capacitor); the web build never imports it. Talks to the native side through the bridge
// itself (Capacitor.addListener / nativePromise), so no Capacitor JS has to ship with the game.
//
// Android Back, top-most first: close the Found card -> the maps panel -> the report -> leave the possessed unit ->
// stop following -> send the app to the background (attack 11-16: the panel and the card were missing, so Back did
// nothing for 3 s and then sent the app away with them still open; the report used to come after leaving the unit).
// Minimize, not exit: Android's own default finishes the activity and the battle on the field is lost.
// (With @capacitor/app installed and no listener, Back does nothing at all.)
// Gesture navigation + hidden bars: the first swipe in from a side edge reaches the page (it paints) and shows the bars
// for a moment; a second edge stroke while they show is taken by Android as Back (emulator test 11-15). So a top-level
// Back within PAINT_GRACE ms of a finger lifting is a paint stroke that strayed, not a request to leave: ignored.
//
// The app going to the background: the WebView marks the page hidden, so audio suspends (audio/engine.js
// visibilitychange) and requestAnimationFrame stops (main.js frame() caps the catch-up on return). The appStateChange
// hook below does the same suspend for WebViews that are slow to report hidden.
export function installAppShell({ actions, state, camera, pilot, audio }) {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || !cap.addListener) return false;
  const call = (method, opts = {}) => { try { return cap.nativePromise('App', method, opts).catch(() => {}); } catch (e) { return null; } };
  const PAINT_GRACE = 3000;   // about how long Android keeps the swiped-in bars showing
  let lastUp = -1e9;
  window.addEventListener('pointerup', () => { lastUp = performance.now(); }, { capture: true, passive: true });
  cap.addListener('App', 'backButton', () => {
    const s = actions.state(), p = pilot();
    if (s.makerOpen) { actions.makerEscape(); return; }   // STEP8 UI: the unit maker: a picker goes back to the rows, else it closes
    if (s.foundOpen) { actions.closeFound(); return; }
    if (s.mapsOpen) { actions.closeMaps(); return; }
    if (state.reportOpen) { actions.closeReport(); return; }
    if (p && p.active) { actions.leave(); return; }
    if (camera.follow || state.followArmed) { actions.armFollow(); return; }   // armFollow turns following off when on
    if (performance.now() - lastUp < PAINT_GRACE) return;
    call('minimizeApp');
  });
  cap.addListener('App', 'appStateChange', (e) => {
    const a = audio(), eng = a && a.engine && a.engine(), ctx = eng && eng.ctx;   // audio/index.js engine()
    if (!ctx) return;
    if (!e || !e.isActive) ctx.suspend().catch(() => {});
    else if (!document.hidden && eng.unlocked && !eng.muted) ctx.resume().catch(() => {});
  });
  document.documentElement.classList.add('app');
  return true;
}
