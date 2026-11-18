// Pointer painting, 1:1 with OG's brush (game.js:7553-7742, terrain-team-ui.md §5.5, core-move.md §2), plus the camera
// over the big field (Part 2 step 2, OURS). Owner: UI (camera parts: lead).
// OG:
// - button 0 (mouse left / touch / pen) paints, button 2 erases; others ignored (game.js:7626-7635)
// - brush radius 14 px, r * exp(0.0015 * -deltaY), clamped 4..160 (game.js:7556, 7589-7593)
// - wall ring shows radius * 0.75 (game.js:7552, 7730); the sim applies the 0.75 when painting
// - ring tint: team colour of the side under the cursor for team-able unit tools in Team battle, else tool colour (game.js:7735-7740)
// - painting works while paused or holding (game.js:7624-7694)
// OURS (step 2):
// - Zoomed out, the brush keeps its size ON SCREEN: in the world it is radius / zoom (one stroke covers more field).
//   Zoomed in past 1 it stays OG's size in the world (radius) and the ring grows on screen (attack 11-16).
// - Touch: a finger that lands paints after 90 ms or 10 px of movement (a tap paints at once on lift); a second finger
//   in that time = pinch zoom + two-finger pan instead, nothing painted. A second finger landing mid-stroke ends the
//   stroke and starts the pinch (OG let the second finger take the stroke over). After a pinch, painting waits until
//   every finger has lifted; one finger left pans.
// - Mouse: wheel = zoom at the cursor (OG: brush size), Shift + wheel = brush size, Ctrl + wheel (trackpad pinch) = zoom,
//   middle-drag = pan.
// - Follow: when armed (the eye button), the next tap picks the nearest unit to follow instead of painting.
// OURS (step 3, possess):
// - Hold a unit still for 0.5 s (finger or left button) and you take it over. A press that lands on a unit waits:
//   moving 10 px paints as usual (from where it landed), lifting early paints there (a tap), holding still takes over.
//   A ring closes on the unit while you hold.
// - While driving, every pointer goes to the pilot (ui/pilot.js): thumbs / mouse aim + attack. Wheel zoom still works.
// OURS (step 7, maps): a press on the map's hidden secret unit (game.secretAt, finger slack added) is checked before
// painting and before the possess hold. Mouse: the click finds it at once. Touch: lifting without moving finds it; a
// drag from there paints as usual (from where it landed) and a second finger pinches, so pinch / pan never find.
export const ZOOM = 1.075;          // CSS px per sim px at zoom 1 (OG game.js:8007)
export const BRUSH_RADIUS = 14;     // OG game.js:7556
const WALL_SCALE = 0.75;            // OG game.js:7552
const HOLD_MS = 90, HOLD_PX = 10;   // touch: wait this long / far before painting, so a pinch never paints
const FOLLOW_PICK = 40;             // css px: a follow tap picks units this close
const GRAB_MS = 500;                // hold a unit this long to take it over
const GRAB_PAD = { touch: 12, mouse: 3 }; // css px of slack around a unit's body for the hold
const SECRET_PAD = { touch: 12, mouse: 4 }; // css px of slack around the secret's hiding spot (step 7)

export function attachInput(canvas, ring, opts) {
  const { game, getTool, onPaint, onFirstInput, ringColor, camera, followArmed, onFollowPick, pilot, onGrab, grab, onSecret } = opts;
  let radius = BRUSH_RADIUS, mode = null, lastX = 0, lastY = 0, cursorX = 0, cursorY = 0, color = '';
  let cssX = 0, cssY = 0;
  const g = () => game();
  const z = () => (camera ? camera.z : 1);
  // Zoomed out, the brush keeps its size on screen (bigger in the world). Zoomed in past 1 (OG's size) it keeps OG's size
  // in the world and grows on screen: before (attack 11-16), after a follow or possess left the camera at 1.15 a tap
  // painted nothing with 65 of 96 unit tools, the starting rifle among them (the painter's first dab was under one unit).
  const simR = () => radius / Math.min(1, z());
  const pts = new Map();            // pointerId -> [cssX, cssY] (touch / pen)
  let pend = null, pendTimer = 0;   // a touch waiting to become a stroke: { id, x, y, moves: [[x, y]...] }
  let gest = null;                  // pinch: { d, mx, my } of the last move
  let panLast = null;               // middle-drag
  let guardUntil = 0;               // presses before this (performance.now ms) are swallowed: see guard()

  const cssOf = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toWorld = (x, y) => (camera ? camera.toWorld(x, y) : [x / ZOOM, y / ZOOM]);

  function styleRing() {
    const c = ringColor(getTool(), cursorX);
    if (c !== color) { color = c; ring.style.setProperty('--brush-color', c); }
  }
  function moveRing(x, y) {   // css px in the canvas
    cssX = x; cssY = y;
    [cursorX, cursorY] = toWorld(x, y);
    const tool = getTool();
    const r = simR() * (tool && tool.kind === 'wall' ? WALL_SCALE : 1) * ZOOM * z();   // = the painted circle on screen
    const cr = canvas.getBoundingClientRect();
    ring.style.width = ring.style.height = `${2 * r}px`;
    ring.style.transform = `translate(${cr.left + x - r}px, ${cr.top + y - r}px)`;
    styleRing();
  }
  // the sim keeps its own brush radius (CORE-A setBrushRadius); the radius is also passed as a 3rd arg
  function syncRadius() { const gm = g(); if (gm && gm.setBrushRadius) gm.setBrushRadius(simR()); }
  function report(n, x, y, len) { if (onPaint) onPaint(getTool(), x, y, typeof n === 'number' ? n : 0, len); }

  function endStroke() {
    if (mode === 'paint' || mode === 'erase') g().paintEnd(); // also ends CORE-A's erase mode
    if (mode === 'paint' || mode === 'erase' || mode === 'pending') mode = null;
    clearTimeout(pendTimer); pend = null; grabOff();
    ring.classList.remove('erasing');
  }
  function beginPaint(x, y) {   // css
    const [wx, wy] = toWorld(x, y);
    lastX = wx; lastY = wy;
    mode = 'paint';
    syncRadius();
    report(g().paintBegin(wx, wy, simR()), wx, wy, 0);
  }
  function paintTo(x, y) {
    const [wx, wy] = toWorld(x, y);
    if (mode === 'paint') report(g().paintMove(wx, wy, simR()), wx, wy, Math.hypot(wx - lastX, wy - lastY));
    else if (mode === 'erase') { if (g().eraseMove) g().eraseMove(wx, wy, simR()); else if (g().erase) g().erase(lastX, lastY, wx, wy, simR()); }
    lastX = wx; lastY = wy;
  }
  function commitPending() {   // the held touch becomes a stroke: paint from where it landed through its moves
    if (mode !== 'pending' || !pend) return;
    clearTimeout(pendTimer); grabOff();
    const p = pend; pend = null;
    beginPaint(p.x, p.y);
    for (const [x, y] of p.moves) paintTo(x, y);
  }
  // ---- hold to take over (possess) ----
  function grabOn(u) {
    if (!grab) return;
    const [vx, vy] = camera ? camera.toView(u.x, u.y - (u.z || 0) * 0.5) : [u.x * ZOOM, u.y * ZOOM];
    const r = Math.max(14, (u.radius + 6) * ZOOM * z()), cr = canvas.getBoundingClientRect();
    grab.style.width = grab.style.height = `${2 * r}px`;
    grab.style.setProperty('--grab-at', `translate(${cr.left + vx - r}px, ${cr.top + vy - r}px)`);   // the animation scales on top of it
    grab.classList.remove('on'); void grab.offsetWidth; grab.classList.add('on');
  }
  function grabOff() { if (grab) grab.classList.remove('on'); }
  function grabDone() {
    if (mode !== 'pending' || !pend || !pend.unit) return;
    const p = pend, u = p.unit;
    clearTimeout(pendTimer); pend = null; mode = null; grabOff();
    ring.classList.remove('visible');
    if (!u.dead && u.hp > 0 && onGrab) onGrab(u, p.id);
  }
  function unitUnder(x, y, touch) {
    const gm = g(); if (!gm || !gm.unitAt || !onGrab) return null;
    const [wx, wy] = toWorld(x, y);
    return gm.unitAt(wx, wy, (touch ? GRAB_PAD.touch : GRAB_PAD.mouse) / (ZOOM * z()));
  }
  function secretUnder(x, y, touch) {   // step 7: the hiding spot under this press, or null
    const gm = g(); if (!gm || typeof gm.secretAt !== 'function' || !onSecret) return null;
    const [wx, wy] = toWorld(x, y);
    return gm.secretAt(wx, wy, (touch ? SECRET_PAD.touch : SECRET_PAD.mouse) / (ZOOM * z()));
  }
  function followPick(x, y) {
    const [wx, wy] = toWorld(x, y), us = g().world && g().world.units;
    let best = null, bd = (FOLLOW_PICK / (ZOOM * z())) ** 2;
    if (us) for (const u of us) { if (!u || u.dead || !(u.hp > 0) || (u.def && u.def.prop)) continue; const d = (u.x - wx) ** 2 + (u.y - wy) ** 2; if (d < bd) { bd = d; best = u; } }
    if (onFollowPick) onFollowPick(best);
  }
  // Two fingers move the camera once a frame, from where both fingers are by then. Before (attack 11-16) every finger's
  // own move event zoomed + panned: one finger moving first made a passing zoom-out, the camera clamped to the edge
  // for that zoom, and a two-finger drag toward an edge stalled ~100-180 px short of it (the map under the tool bar
  // could not be dragged into sight).
  let gestRaf = 0;
  function gestureStep() {
    gestRaf = 0;
    if (mode !== 'gesture' || !gest || pts.size < 2) return;
    const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    camera.zoomAt(gest.mx, gest.my, d / gest.d);
    camera.panBy(mx - gest.mx, my - gest.my);
    gest = { d, mx, my };
    syncRadius();
  }
  function flushGesture() { if (gestRaf) { cancelAnimationFrame(gestRaf); gestureStep(); } }
  function startGesture() {
    const [a, b] = [...pts.values()];
    gest = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
  }

  function down(e) {
    if (onFirstInput) onFirstInput();
    // preventDefault below also cancels the mousedown that would focus the page. Inside an embed (web portal iframe) the
    // keys then stayed with the page around it: paint, press Space = that page scrolled and the game didn't pause.
    if (!document.hasFocus()) window.focus();
    const [x, y] = cssOf(e);
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (e.button !== 0 && e.button !== 2 && !(e.button === 1 && !touch)) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    if (pilot && pilot.active) { endStroke(); mode = null; pts.clear(); pilot.down(e, x, y); return; }
    moveRing(x, y);
    if (touch) pts.set(e.pointerId, [x, y]);
    if (performance.now() < guardUntil && e.button !== 1 && pts.size <= 1) { endStroke(); mode = 'swallow'; ring.classList.remove('visible'); return; }
    if (followArmed && followArmed() && e.button === 0 && pts.size <= 1) { endStroke(); mode = 'swallow'; followPick(x, y); return; }
    if (e.button === 1) { endStroke(); mode = 'pan'; panLast = [x, y]; return; }
    if (touch && pts.size >= 2) {   // second finger: pinch + pan, never paint
      endStroke(); mode = 'gesture'; ring.classList.remove('visible'); startGesture(); return;
    }
    if (mode === 'gesture') return;  // a finger while the last pinch's fingers are still down
    endStroke();
    ring.classList.add('visible');
    if (e.button === 2) {
      const [wx, wy] = toWorld(x, y);
      lastX = wx; lastY = wy;
      mode = 'erase'; ring.classList.add('erasing');
      if (g().eraseBegin) g().eraseBegin(wx, wy, simR()); else if (g().erase) g().erase(wx, wy, wx, wy, simR());
      return;
    }
    const sec = e.button === 0 && pts.size <= 1 ? secretUnder(x, y, touch) : null;
    if (sec) {   // step 7: a find, not paint (touch waits for the lift: a drag paints, a second finger pinches)
      if (touch) { mode = 'pending'; pend = { id: e.pointerId, x, y, moves: [], secret: sec }; return; }
      mode = 'swallow'; ring.classList.remove('visible'); onSecret(sec); return;
    }
    const held = e.button === 0 && pts.size <= 1 ? unitUnder(x, y, touch) : null;
    if (held) { mode = 'pending'; pend = { id: e.pointerId, x, y, moves: [], unit: held }; pendTimer = setTimeout(grabDone, GRAB_MS); grabOn(held); return; }
    if (touch) { mode = 'pending'; pend = { id: e.pointerId, x, y, moves: [] }; pendTimer = setTimeout(commitPending, HOLD_MS); return; }
    beginPaint(x, y);
  }
  function move(e) {
    const [x, y] = cssOf(e);
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (pilot && pilot.active) { pilot.move(e, x, y); return; }
    if (touch && pts.has(e.pointerId)) pts.set(e.pointerId, [x, y]);
    if (mode === 'gesture') {
      if (pts.size >= 2) {
        if (!gestRaf) gestRaf = requestAnimationFrame(gestureStep);
      } else if (pts.size === 1 && pts.has(e.pointerId) && gest) {   // one finger left after a pinch: it pans
        camera.panBy(x - gest.mx, y - gest.my); gest = { d: gest.d, mx: x, my: y };
      }
      return;
    }
    if (mode === 'pan') { camera.panBy(x - panLast[0], y - panLast[1]); panLast = [x, y]; moveRing(x, y); return; }
    moveRing(x, y); if (mode !== 'swallow') ring.classList.add('visible');
    if (mode === 'pending' && pend && e.pointerId === pend.id) {
      pend.moves.push([x, y]);
      if (Math.hypot(x - pend.x, y - pend.y) > HOLD_PX) commitPending();
      return;
    }
    if (mode === 'paint' || mode === 'erase') paintTo(x, y);
  }
  function up(e) {
    try { if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (pilot && pilot.active) { pts.delete(e.pointerId); pilot.up(e); return; }
    if (mode === 'gesture') flushGesture();   // the last move before a finger lifts still counts
    const had = pts.delete(e.pointerId);
    if (mode === 'gesture') {
      if (pts.size === 1) { const [p] = pts.values(); gest = { d: 1, mx: p[0], my: p[1] }; }
      if (pts.size === 0) { mode = null; gest = null; }
      return;
    }
    if (mode === 'swallow' || mode === 'pan') { if (pts.size === 0) mode = null; panLast = null; return; }
    if (mode === 'pending' && pend && e.pointerId === pend.id && pend.secret) {   // step 7: lifted on the secret = found
      const sec = pend.secret; clearTimeout(pendTimer); pend = null; mode = null; grabOff();
      ring.classList.remove('visible'); onSecret(sec); return;
    }
    if (mode === 'pending' && pend && e.pointerId === pend.id) commitPending();   // a quick tap: paint it now
    if (had || e.pointerType === 'mouse' || !e.pointerType) endStroke();
  }
  function wheel(e) {
    e.preventDefault();
    const [x, y] = cssOf(e);
    if (e.shiftKey || !camera) {   // OG: wheel = brush size (now Shift + wheel)
      const dy = e.deltaY || e.deltaX;
      radius = Math.min(160, Math.max(4, radius * Math.exp(0.0015 * -dy)));
    } else camera.zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    syncRadius();
    moveRing(x, y);
  }
  const enter = () => { if (!(pilot && pilot.active)) ring.classList.add('visible'); };
  const leave = () => ring.classList.remove('visible');
  const ctxmenu = (e) => e.preventDefault();

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerenter', enter);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', ctxmenu);

  syncRadius();
  return {
    get radius() { return radius; },
    syncRadius,
    get painting() { return mode === 'paint' || mode === 'erase'; },
    setTool() { endStroke(); moveRing(cssX, cssY); },
    restyle: styleRing,
    endStroke,
    // A panel or button that vanishes when tapped (maps card, Found card, report, START, New battle) calls this: a fast
    // second tap of a double tap then lands on the field where it was. Before (attack 11-16) it painted there.
    guard(ms) { guardUntil = performance.now() + ms; },
  };
}
