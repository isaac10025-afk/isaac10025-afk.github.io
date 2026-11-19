// Driving a possessed unit (Part 2 step 3, OURS: OG has no possession). Owner: lead.
// Phone: two thumbs. A finger landing on the left half of the field is the move stick (it appears where the thumb lands),
// one on the right half is the attack: holding it attacks, dragging it aims (no drag = straight ahead, aim assist picks
// the enemy in front). Desktop: WASD / arrows move, the mouse aims, the left button attacks. X / Esc / the X button
// leaves. The unit's hp shows at the top. Input goes to the sim every frame (game.setPossessInput).
const STICK_R = 46;      // css px: full stick
const AIM_DEAD = 12;     // css px: drag past this = aiming
const MOVE_KEYS = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0], ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0] };

export function createPilot({ root, camera, game, iconFor, teamColors, onLeave, label }) {
  const el = document.createElement('div');
  el.id = 'pilot'; el.hidden = true;
  el.innerHTML = `
    <button id="pilot-x" class="round-button" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <div id="pilot-hp" aria-hidden="true"><span class="pilot-icon"></span><span class="pilot-bar"><i></i></span></div>
    <div id="pilot-me" aria-hidden="true"></div>
    <div class="stick move" hidden><i></i></div>
    <div class="stick aim" hidden><i></i></div>`;
  root.appendChild(el);
  const xBtn = el.querySelector('#pilot-x'), hp = el.querySelector('#pilot-hp'), fill = hp.querySelector('i'), iconBox = hp.querySelector('.pilot-icon');
  const sMove = el.querySelector('.stick.move'), sAim = el.querySelector('.stick.aim'), me = el.querySelector('#pilot-me');
  xBtn.addEventListener('click', (e) => { e.currentTarget.blur(); onLeave(); });

  let active = false, unitId = -1, iconType = '', lastFrac = -1, lastColor = null;
  const keys = new Set();
  const ignore = new Set();                       // the finger / button that did the long press: ignored until lifted
  let move = null, aim = null;                    // touch sticks: { id, ox, oy, x, y }
  let mouse = null, mouseDown = false;            // css point of the mouse
  let tapPending = false;

  function place(st, s) {
    if (!s) { st.hidden = true; return; }
    st.hidden = false;
    st.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
    let dx = s.x - s.ox, dy = s.y - s.oy; const m = Math.hypot(dx, dy);
    if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
    st.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function begin(u, pointerId) {
    active = true; unitId = u.id; keys.clear(); ignore.clear(); move = aim = null; mouseDown = false; tapPending = false;
    if (pointerId !== undefined && pointerId !== null) ignore.add(pointerId);
    el.hidden = false; document.body.classList.add('piloting');
    lastFrac = -1; iconType = ''; lastColor = null;
    relabel(); fitHp(); sync(u);
  }
  // The hp bar sits in the middle of the top edge. Where the round buttons share that edge (desktop 641-823 px, tablets,
  // phones held sideways) it ran under them (attack 11-16: under Maps at 740 x 360 and 768 x 1024): it now keeps between
  // the X and the first button, centred on the field while it fits there.
  const HP_GAP = 8, HP_MIN = 120;
  function fitHp() {
    if (!active) return;
    hp.style.left = ''; hp.style.width = '';
    const h = hp.getBoundingClientRect(), x = xBtn.getBoundingClientRect();
    let lo = x.right + HP_GAP, hi = innerWidth - HP_GAP;
    for (const b of document.querySelectorAll('#controls > button')) {
      if (b.hidden) continue;
      const r = b.getBoundingClientRect();
      if (!r.width || r.bottom <= h.top || r.top >= h.bottom || r.right <= lo) continue;   // STEP9 LEAD: every button right of the X counts (was: right of the bar's centre; at 568x320 the Campaign button starts left of it)
      hi = Math.min(hi, r.left - HP_GAP);
    }
    if (h.left >= lo && h.right <= hi) return;
    const w = Math.max(HP_MIN, Math.min(h.width, hi - lo)), c = Math.max(lo + w / 2, Math.min(hi - w / 2, h.left + h.width / 2));
    hp.style.width = `${Math.round(w)}px`; hp.style.left = `${Math.round(c)}px`;
  }
  addEventListener('resize', () => { if (active) requestAnimationFrame(fitHp); });
  function end() {
    if (!active) return;
    active = false; unitId = -1; keys.clear(); ignore.clear(); move = aim = null; mouseDown = false;
    el.hidden = true; document.body.classList.remove('piloting');
    place(sMove, null); place(sAim, null);
  }
  function relabel() { const t = label('leave'); xBtn.setAttribute('aria-label', t); xBtn.title = `${t} (X)`; }

  // ---- pointers (input.js hands them over while active) ----
  function down(e, x, y) {
    if (ignore.has(e.pointerId)) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (!touch) {
      mouse = [x, y];
      if (e.button === 0) { mouseDown = true; tapPending = true; }
      return;
    }
    const left = x < camera.vw / 2;
    if (left && !move) { move = { id: e.pointerId, ox: x, oy: y, x, y }; place(sMove, move); }
    else if (!left && !aim) { aim = { id: e.pointerId, ox: x, oy: y, x, y }; tapPending = true; place(sAim, aim); }
  }
  function moveP(e, x, y) {
    if (ignore.has(e.pointerId)) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (!touch) { mouse = [x, y]; return; }
    if (move && move.id === e.pointerId) { move.x = x; move.y = y; place(sMove, move); }
    else if (aim && aim.id === e.pointerId) { aim.x = x; aim.y = y; place(sAim, aim); }
  }
  function up(e) {
    if (ignore.delete(e.pointerId)) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (!touch) { if (e.button === 0 || e.buttons === 0) mouseDown = false; return; }
    if (move && move.id === e.pointerId) { move = null; place(sMove, null); }
    else if (aim && aim.id === e.pointerId) { aim = null; place(sAim, null); }
  }

  // ---- keys (capture phase: while piloting, these keys drive and never reach the painter's shortcuts) ----
  // a panel over the field (maps, Found card, report) has the keys: Esc closes it, not the driving (attack 11-16: Esc
  // with the maps panel open left the unit and kept the panel)
  const overlayUp = () => !!document.querySelector('#maps:not([hidden]), #found, .report');
  function keydown(e) {
    if (!active || e.metaKey || e.ctrlKey || e.altKey || overlayUp()) return;
    if (MOVE_KEYS[e.code]) { keys.add(e.code); e.preventDefault(); e.stopImmediatePropagation(); }
    else if (e.code === 'KeyX' || e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onLeave(); }
    else if (e.code === 'KeyF') e.stopImmediatePropagation();   // follow is the pilot's while driving
  }
  function keyup(e) { if (MOVE_KEYS[e.code]) keys.delete(e.code); }
  addEventListener('keydown', keydown, { capture: true });
  addEventListener('keyup', keyup, { capture: true });
  addEventListener('blur', () => { keys.clear(); mouseDown = false; });

  // ---- every frame: hp, then the input to the sim ----
  function sync(u) {
    if (u.type !== iconType) {
      iconType = u.type; iconBox.textContent = '';
      try { const c = iconFor({ kind: 'unit', type: u.type }, true); iconBox.appendChild(c); } catch (err) { /* no icon */ }
    }
    const f = Math.max(0, Math.min(1, u.hp / u.maxHp));
    if (Math.abs(f - lastFrac) > 0.002) { lastFrac = f; fill.style.transform = `scaleX(${f})`; }
    const col = u.team === 0 ? teamColors[0] : u.team === 1 ? teamColors[1] : '';
    if (col !== lastColor) { lastColor = col; hp.style.setProperty('--hp-team', col || 'var(--hp-own)'); }
    hp.classList.toggle('low', f < 0.3);
    // "you": a marker over the unit's head, so it can be found in a crowd
    const [vx, vy] = camera.toView(u.x, u.y - (u.z || 0) * 0.5);
    const head = (u.radius * 1.9 + 8) * camera.zoomCss * camera.z;
    me.style.transform = `translate(${vx}px, ${vy - head}px)`;
  }
  function update() {
    if (!active) return;
    const g = game(), u = g.possessed;
    if (!u) return;
    if (u.id !== unitId) { unitId = u.id; }
    sync(u);
    let mx = 0, my = 0;
    for (const k of keys) { mx += MOVE_KEYS[k][0]; my += MOVE_KEYS[k][1]; }
    if (move) { mx += (move.x - move.ox) / STICK_R; my += (move.y - move.oy) / STICK_R; }
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    let a = NaN, ax = NaN, ay = NaN, fire = false;
    if (aim) {
      const dx = aim.x - aim.ox, dy = aim.y - aim.oy;
      if (Math.hypot(dx, dy) > AIM_DEAD) a = Math.atan2(dy, dx);
      fire = true;
    } else if (mouse) {
      [ax, ay] = camera.toWorld(mouse[0], mouse[1]);
      fire = mouseDown;
    }
    g.setPossessInput({ mx, my, aim: a, aimX: ax, aimY: ay, fire, tap: tapPending });
    tapPending = false;
  }
  return {
    get active() { return active; },
    begin, end, update, relabel,
    down, move: moveP, up,
    el,
  };
}
