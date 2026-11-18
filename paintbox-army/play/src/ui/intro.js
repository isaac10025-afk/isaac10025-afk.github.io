// First visit (user pick A, 11-17): the field opens on a small fight that is already going (a T-Rex against a pirate
// crew, our units), then a hand taps the picked card and paints one line of it into the fight, lifts and is gone.
// No words. Any press or key from the player ends it at once (what is on the field stays: it is a real battle).
// Seen once: localStorage 'paint-battle:intro'. ?intro=1 forces it, ?intro=0 turns it off; automated browsers (tests,
// shot tools: navigator.webdriver) and ?map=<id> start without it unless ?intro=1. OURS (OG shows no help at all).
export const INTRO_KEY = 'paint-battle:intro';

export function wantIntro(params) {
  const q = params.get('intro');
  if (q === '1') return true;
  if (q === '0' || params.get('map') || (typeof navigator !== 'undefined' && navigator.webdriver)) return false;
  try { return localStorage.getItem(INTRO_KEY) !== '1'; } catch (e) { return true; }
}
function markSeen() { try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* storage blocked: shows again next visit */ } }

// The hand: an outline pass (thick dark strokes) under a white fill pass, so overlapping parts have one clean outline.
// Fingertip = (18, 3) in the 48 x 58 box.
const SHAPES = '<rect x="13" y="3" width="10" height="28" rx="5"/><rect x="11" y="22" width="29" height="29" rx="10"/><rect x="3" y="28" width="14" height="10" rx="5" transform="rotate(-28 10 33)"/>';
const HAND = `<svg viewBox="0 0 48 58" aria-hidden="true"><g fill="#2b2118" stroke="#2b2118" stroke-width="5" stroke-linejoin="round">${SHAPES}</g><g fill="#fff">${SHAPES}</g><path d="M23.5 26v7M31 26.5v7" fill="none" stroke="#2b2118" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const TIP = [18 / 48, 3 / 58];   // fingertip as a share of the box
const W = 50;                    // css px wide on screen

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/**
 * opts: root (#app), canvas, camera, game (the real game), toolbar ({ el }), tools (TOOLS), getTool() -> the picked
 * tool, radius() -> sim brush radius, prewarm(tool), onPaint(tool, x, y, n, len) (sounds), onEnd().
 */
export function createIntro(opts) {
  const { root, canvas, camera, game, toolbar, tools } = opts;
  let started = false, ended = false, raf = 0, t0 = 0, painting = false, lastW = null;
  let hand = null, ring = null, path = null;
  const toolOf = (type) => tools.find((tl) => tl.kind === 'unit' && tl.type === type);
  const toWorld = (x, y) => { const r = canvas.getBoundingClientRect(); return camera.toWorld(x - r.left, y - r.top); };

  // The free part of the view (page px): under the round buttons, above the tool bar.
  function area() {
    const cr = canvas.getBoundingClientRect();
    const tb = toolbar.el ? toolbar.el.getBoundingClientRect() : null;
    const bottom = tb && tb.height > 0 && tb.top > cr.top + cr.height * 0.4 ? tb.top : cr.bottom;
    const top = cr.top + Math.min(90, cr.height * 0.12);
    return { left: cr.left, width: cr.width, top, height: Math.max(80, bottom - top - 10) };
  }
  const at = (a, fx, fy) => [a.left + a.width * fx, a.top + a.height * fy];

  const toPage = (wx, wy) => { const r = canvas.getBoundingClientRect(), [x, y] = camera.toView(wx, wy); return [r.left + x, r.top + y]; };
  const FIGHT_R = 20;   // world px brush for the opening fight (fixed: same fight on every screen)
  let mid = null;       // world point the fight is laid out around (free part of the view, a bit above its middle)

  function stroke(tool, pts) {   // paint a whole stroke at once (the opening fight), world points
    if (!tool) return 0;
    game.setTool(tool); game.setBrushRadius(FIGHT_R);
    let n = game.paintBegin(pts[0][0], pts[0][1]) || 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = pts[i - 1], [c, d] = pts[i];
      for (let k = 1; k <= 8; k++) n += game.paintMove(lerp(a, c, k / 8), lerp(b, d, k / 8)) || 0;
    }
    game.paintEnd();
    return n;
  }

  /** Before the first frame: the opening fight. */
  function setup() {
    const back = opts.getTool();
    const rex = toolOf('trex'), crew = [toolOf('deckhand'), toolOf('pistol')];
    for (const tl of [rex, ...crew, back]) if (tl) opts.prewarm(tl);
    const a = area();
    mid = toWorld(...at(a, 0.5, 0.40));
    const [x, y] = mid;
    stroke(rex, [[x - 170, y], [x - 120, y]]);                    // one T-Rex (a dab paints none: it needs a short stroke)
    stroke(crew[0], [[x + 40, y - 45], [x + 40, y + 45]]);         // deckhands in a line...
    stroke(crew[1], [[x + 95, y - 30], [x + 95, y + 30]]);         // ...pistols behind them (one crew: SIDE_GROUPS)
    game.setTool(back); game.setBrushRadius(opts.radius());
  }

  // ---- the hand ----
  function place(x, y, s = 1, o = 1) {   // fingertip at page (x, y); the hand is position: fixed
    hand.style.transform = `translate(${x - W * TIP[0]}px, ${y - W * 58 / 48 * TIP[1]}px) scale(${s})`;
    hand.style.opacity = String(o);
  }
  function tap(x, y) {
    ring.style.left = `${x}px`; ring.style.top = `${y}px`;
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
  }
  function paintStep(p) {   // the hand's own stroke, at fraction p of its line
    const [x, y] = [lerp(path.from[0], path.to[0], p), lerp(path.from[1], path.to[1], p)];
    const [wx, wy] = toWorld(x, y), tool = opts.getTool();
    if (!painting) { painting = true; game.setBrushRadius(opts.radius()); const n = game.paintBegin(wx, wy) || 0; if (opts.onPaint) opts.onPaint(tool, wx, wy, n, 0); }
    else { const n = game.paintMove(wx, wy) || 0; if (opts.onPaint) opts.onPaint(tool, wx, wy, n, Math.hypot(wx - lastW[0], wy - lastW[1])); }
    lastW = [wx, wy];
    return [x, y];
  }
  // ms: fade in on the card, tap it, glide to the field, press, drag (paints), lift, fade out
  const T = { in: 300, tapDown: 430, tapUp: 560, glide: 1160, press: 1260, drag: 2160, out: 2560 };
  function step(now) {
    if (ended) return;
    const t = now - t0;
    const card = path.card, from = path.from;
    if (t < T.in) place(card[0], card[1] + 14 * (1 - t / T.in), 1, t / T.in);
    else if (t < T.tapUp) { const down = t < T.tapDown; place(card[0], card[1], down ? 0.86 : 1); if (down && !path.tapped) { path.tapped = true; tap(card[0], card[1]); } }
    else if (t < T.glide) { const k = ease(clamp01((t - T.tapUp) / (T.glide - T.tapUp))); place(lerp(card[0], from[0], k), lerp(card[1], from[1], k)); }
    else if (t < T.press) { place(from[0], from[1], 0.86); if (!painting) { paintStep(0); tap(from[0], from[1]); } }
    else if (t < T.drag) { const [x, y] = paintStep(ease(clamp01((t - T.press) / (T.drag - T.press)))); place(x, y, 0.86); }
    else if (t < T.out) { if (painting) { paintStep(1); game.paintEnd(); painting = false; } const k = clamp01((t - T.drag) / (T.out - T.drag)); place(path.to[0], path.to[1] - 18 * k, 1, 1 - k); }
    else { end(); return; }
    raf = requestAnimationFrame(step);
  }

  const stopKeys = ['pointerdown', 'keydown', 'wheel'];
  function onPlayer() { end(); }
  function end() {
    if (ended) return;
    ended = true; cancelAnimationFrame(raf);
    if (painting) { game.paintEnd(); painting = false; }
    if (hand) hand.remove();
    if (ring) ring.remove();
    for (const ev of stopKeys) removeEventListener(ev, onPlayer, true);
    removeEventListener('resize', onPlayer);
    markSeen();
    if (opts.onEnd) opts.onEnd();
  }

  /** Once the field is on screen: the hand, after a short look at the fight. */
  function play(delay = 800) {
    if (started) return;
    started = true;
    for (const ev of stopKeys) addEventListener(ev, onPlayer, true);
    addEventListener('resize', onPlayer);
    setTimeout(() => {
      if (ended) return;
      const el = toolbar.el && toolbar.el.querySelector('.active');
      const cr = el ? el.getBoundingClientRect() : null;
      const [x, y] = mid;   // the hand's line: under the fight, world px (same length everywhere)
      const from = toPage(x - 80, y + 150), to = toPage(x + 60, y + 150);
      const card = cr && cr.width > 0 && cr.bottom > 0 && cr.top < innerHeight ? [cr.left + cr.width / 2, cr.top + cr.height * 0.3] : [from[0], from[1] + 40];
      path = { card, from, to, tapped: false };
      hand = document.createElement('div'); hand.className = 'intro-hand'; hand.innerHTML = HAND; hand.style.width = `${W}px`;
      ring = document.createElement('div'); ring.className = 'intro-tap';
      root.append(ring, hand);
      place(card[0], card[1], 1, 0);
      t0 = performance.now();
      raf = requestAnimationFrame(step);
    }, delay);
  }

  return { setup, play, end, get started() { return started; }, get ended() { return ended; } };
}
