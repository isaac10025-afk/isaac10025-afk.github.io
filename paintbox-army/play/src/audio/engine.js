// AUDIO engine: Battle Draw's mixer rules 1:1 (module 2207 class G, game.js:6313-6939), playing our own
// synth sounds (synth.js) instead of their files. Rules and numbers live in rules.js with cites.
//
// What is ours, not theirs (platform glue, listed in the final report):
//   - sounds are made in code, not fetched: warmed up in a Worker at start (idle slices if Workers fail),
//     and made on the spot (at most 2 a frame) if one is needed before the warm-up reaches it
//   - a phone guard on the sfx bus: high-pass 100 Hz (no deep sub-bass)
//   - a limiter after their compressor: a fast compressor, then a soft clipper whose ceiling is -0.8 dBFS,
//     so 400 units at once never clip
//   - while muted the context is suspended (no CPU), and it is suspended while the page is hidden
//   - the iOS/Android unlock listens to more gesture events than theirs (pointerdown, touchstart/end,
//     mousedown, click, keydown), stays on to resume after an iOS interruption, and plays one silent
//     sample inside the gesture

import { SOUND, BEDS, MIX, srcOf, busyOf, eventVoices, rankOf, PLACE, PLACE_RATE, CALLS, baseOf,
  heavyOf, isHorse, isApe, isCat, isFootHuman, isRat, stepGain, OWN_CALLS, OWN_CALL_TYPES, ownStepOf,
  OWN_LOOPS, LOOP_TYPES, MAX_LOOPS, OWN_BEDS, BED_TYPES, LAVA7,
  unitMade, soundTypeOf, madePlaceOf, flamerOf, madeLoops, madeUnder, MADE_WINGS } from './rules.js'; // step 8: made units
import { SR, render, variantCount, RECIPES } from './synth.js';

const STATE_CHARGE = 4, STATE_FLEE = 5, STATE_ADVANCE = 1; // ARCH.md unit states (OG game.js:9219)
const GESTURES = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'];
const CEILING = 0.908; // soft clipper output ceiling (-0.84 dBFS)

// Starts per sound in the last 0.1 s. OG game.js:6221-6243 (class N)
class StartLimiter {
  constructor() { this.started = new Map(); }
  allow(id, time, scale = 1) {
    const def = SOUND[id];
    const cap = Math.ceil(((def && def.max) ?? MIX.maxDefault) * scale);
    let list = this.started.get(id);
    if (!list) { list = []; this.started.set(id, list); }
    while (list.length > 0 && time - list[0] >= MIX.window) list.shift();
    if (list.length >= cap) return false;
    list.push(time);
    return true;
  }
  recent(id, time) {
    const list = this.started.get(id);
    if (!list) return 0;
    let n = 0;
    for (const t of list) if (time - t < MIX.window) n++;
    return n;
  }
}

// Order the warm-up makes sounds in: what a fight needs first.
const WARM_FIRST = ['ui', 'shot-rifle', 'bullet-hit', 'death', 'punch', 'grunt', 'footstep', 'spear', 'arrow-hit', 'bow',
  'explosion', 'place-soldier', 'place-roman', 'place-archer', 'hit-solid', 'ricochet', 'zombie-bite', 'blade'];

const STRIDE = { rat: 1.9, ant: 1.74, snake: 2.4, ape: 2.8, cheetah: 3.4, boar: 1.8, giant: 2.6, dragon: 2.2, // fallback footfalls only
  raptor: 2.6, spitter: 2.6, trike: 2.2, stego: 2.2, ankylo: 2.2, trex: 2.4, longneck: 1.8, // ours (step 4)
  laserbot: 2.4, magnetbot: 2.4, repairbot: 2.6, shieldbot: 2.4, bombbot: 2.8, gmech: 1.8, hydra: 2, lavagolem: 2,
  sumo: 2.2, walrus: 2, crab: 2, turtle: 2 }; // ours (step 6)

export class AudioEngine {
  // opts: { ctx (use this context: tests / OfflineAudioContext), W (field width), storageKey,
  //         rules (false: skip the voice rules, tests only), limiter (false: no limiter, tests only) }
  constructor(opts = {}) {
    this.opts = opts;
    this.ctx = null; this.unlocked = false; this.disposed = false;
    this.master = null; this.sfx = null; this.bedBus = null;
    this.buffers = new Map();      // synth recipe id -> AudioBuffer[]
    this.beds = new Map();         // bed id -> gain node
    this.playing = [];             // live voices (OG game.js:6321)
    this.limiter = new StartLimiter();
    this.started = [];             // starts in the last 0.1 s (OG game.js:6323)
    this.nextBeds = 0; this.demand = 0; this.demandAt = 0;
    this.asked = new Map();        // perSecond demand (OG game.js:6328)
    this.stepsDue = 0; this.stepsAt = 0; this.marchHeard = false;
    this.poured = 0; this.pouredAt = -1; this.frozen = 0; this.frozenAt = -1; this.minedAt = -1;
    this.pingedAt = -1; this.pingCheckedAt = -1; this.placedAt = -1; this.tickedAt = -1;
    this.galloped = new Map(); this.roars = new Map();
    this.muted = false; this.played = 0;
    this.W = opts.W || 1;
    this.lastEventsAt = -1;
    this._stride = new Map(); this._ff = []; this._frame = 0;
    this._callCount = new Array(CALLS.length).fill(0); this._callPick = new Array(CALLS.length).fill(null);
    this._ownCount = new Array(OWN_CALLS.length).fill(0); this._ownPick = new Array(OWN_CALLS.length).fill(null); // ours (step 4)
    this.loops = OWN_LOOPS.map(() => new Map()); this._bedCount = new Array(OWN_BEDS.length).fill(0); // ours (step 6): unit -> loop
    this._syncBudget = 0; this._warm = null; this._suspendTimer = null;
    this.storageKey = opts.storageKey || 'paint-battle:muted';
    try { this.muted = typeof localStorage !== 'undefined' && localStorage.getItem(this.storageKey) === '1'; } catch { /* private mode */ } // OG game.js:6357-6359
    if (opts.ctx) { this.attach(opts.ctx); this.unlocked = true; }
  }

  // ---------------------------------------------------------------- context + unlock
  install() {
    if (typeof window === 'undefined' || this._installed || this.opts.ctx) return;
    this._installed = true;
    this._unlock = () => this.unlock();
    // OG game.js:6360 listens to pointerdown + keydown once. Ours stays on (cheap when running): iOS needs a
    // gesture to resume after an interruption (a call, Siri), and older iOS only counts touchend.
    for (const ev of GESTURES) window.addEventListener(ev, this._unlock, { capture: true, passive: true });
    this._startTimer = setTimeout(() => this.start(), MIX.startDelay * 1000); // OG game.js:6361
    this._vis = () => {
      if (!this.ctx || this.opts.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (this.unlocked && !this.muted) this.ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', this._vis);
  }
  start() { // OG game.js:6372-6396
    if (this.ctx || this.disposed) return;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* iOS 16.4+ only */ }
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
    this.attach(ctx);
    this.warmUp();
  }
  unlock() { // OG game.js:6345-6352
    this.unlocked = true;
    this.start();
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state === 'running' || (typeof document !== 'undefined' && document.hidden)) return;
    ctx.resume().catch(() => {});
    try { // one silent sample inside the gesture (older iOS)
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    } catch { /* ignore */ }
  }
  attach(ctx) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); // OG game.js:6378-6384
    const c = MIX.comp;
    comp.threshold.value = c.threshold; comp.knee.value = c.knee; comp.ratio.value = c.ratio; comp.attack.value = c.attack; comp.release.value = c.release;
    let tail = ctx.destination;
    if (this.opts.limiter !== false) {
      // ours: limiter + soft clipper, so a 400-unit fight never clips
      const clip = ctx.createWaveShaper();
      const N = 4096, curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x);
        const y = a <= 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25);
        curve[i] = Math.sign(x) * Math.min(CEILING, y);
      }
      clip.curve = curve; clip.oversample = 'none';
      clip.connect(ctx.destination);
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
      lim.connect(clip);
      tail = lim;
    }
    comp.connect(tail);
    this.master = ctx.createGain(); // OG game.js:6386-6388
    this.master.gain.value = this.muted ? 0 : MIX.masterOn;
    this.master.connect(comp);
    const lp = ctx.createBiquadFilter(); // OG game.js:6389-6393
    lp.type = 'lowpass'; lp.frequency.value = MIX.lowpass.f; lp.Q.value = MIX.lowpass.q;
    lp.connect(this.master);
    const hp = ctx.createBiquadFilter(); // ours: phone speakers
    hp.type = 'highpass'; hp.frequency.value = 100; hp.Q.value = 0.707;
    hp.connect(lp);
    this.sfx = ctx.createGain(); this.sfx.connect(hp);
    this.bedBus = ctx.createGain(); this.bedBus.connect(this.master); // OG game.js:6395 (beds skip the low-pass)
  }
  dispose() { // OG game.js:6362-6371
    this.disposed = true;
    if (typeof window !== 'undefined' && this._unlock) for (const ev of GESTURES) window.removeEventListener(ev, this._unlock, { capture: true });
    if (this._vis) document.removeEventListener('visibilitychange', this._vis);
    clearTimeout(this._startTimer); clearTimeout(this._suspendTimer);
    if (this._warm) clearTimeout(this._warm);
    if (this._worker) { this._worker.terminate(); this._worker = null; }
    if (this.ctx && !this.opts.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
  running() { return !!this.ctx && this.unlocked && (this.ctx.state === 'running' || !!this.opts.ctx); } // a given context (tests, offline) counts as running

  // ---------------------------------------------------------------- sounds (made in code)
  buffersFor(id) {
    const src = srcOf(id);
    let b = this.buffers.get(src);
    if (b) return b;
    if (!RECIPES[src] || !this.ctx) return null;
    if (this._syncBudget <= 0) return null; // too many first-time makes this frame; skip, the warm-up catches up
    this._syncBudget--;
    return this.make(src);
  }
  make(src) { return this.store(src, Array.from({ length: variantCount(src) }, (_, v) => render(src, v))); }
  store(src, datas) {
    const ctx = this.ctx, list = [];
    for (const data of datas) {
      const buf = ctx.createBuffer(1, data.length, SR);
      buf.getChannelData(0).set(data);
      list.push(buf);
    }
    this.buffers.set(src, list);
    return list;
  }
  prepareAll() { for (const id of Object.keys(RECIPES)) if (RECIPES[id] && !this.buffers.has(id)) this.make(id); }
  // Make every sound ahead of use, fight sounds first: in a Worker (off the main thread), or, if
  // Workers fail, in small idle slices.
  warmUp() {
    const ids = [...WARM_FIRST, ...Object.keys(RECIPES).filter((k) => RECIPES[k] && !WARM_FIRST.includes(k))];
    const slices = () => {
      let i = 0;
      const slice = () => {
        this._warm = null;
        if (!this.ctx || this.disposed) return;
        const t0 = performance.now();
        while (i < ids.length && performance.now() - t0 < 6) { const id = ids[i++]; if (!this.buffers.has(id)) this.make(id); }
        if (i < ids.length) this._warm = setTimeout(slice, 16);
      };
      this._warm = setTimeout(slice, 0);
    };
    let w;
    try { w = new Worker(new URL('./synth-worker.js', import.meta.url), { type: 'module' }); } catch { slices(); return; }
    this._worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.done || this.disposed || !this.ctx) { w.terminate(); this._worker = null; return; }
      if (!this.buffers.has(m.id)) this.store(m.id, m.data);
    };
    w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); w.terminate(); this._worker = null; slices(); };
    w.postMessage({ ids });
  }

  // ---------------------------------------------------------------- mute
  setMuted(b) { // OG game.js:6447-6457 (+ ours: suspend the context while muted)
    b = !!b;
    this.muted = b;
    try { localStorage.setItem(this.storageKey, b ? '1' : '0'); } catch { /* ignore */ }
    const ctx = this.ctx;
    if (!ctx || !this.master) return b;
    this.master.gain.setTargetAtTime(b ? 0 : MIX.masterOn, ctx.currentTime, MIX.muteFade);
    if (this.opts.ctx) return b;
    clearTimeout(this._suspendTimer);
    if (b) this._suspendTimer = setTimeout(() => { if (this.muted && this.ctx) this.ctx.suspend().catch(() => {}); }, 400);
    else if (this.unlocked) ctx.resume().catch(() => {});
    return b;
  }
  toggleMuted() { // OG game.js:8241-8243: unmuting plays the ui sound
    this.setMuted(!this.muted);
    if (!this.muted) this.ui();
    return this.muted;
  }

  // ---------------------------------------------------------------- one voice. OG game.js:6808-6840
  panAt(x) { // OG game.js:6804-6807
    if (x === undefined || x === null || !Number.isFinite(x)) return 0;
    const w = Math.max(1, this.W);
    return MIX.panSpread * Math.max(-1, Math.min(1, (x / w) * 2 - 1));
  }
  play(voice, pan, n) {
    const ctx = this.ctx, def = SOUND[voice.id];
    if (!ctx || !this.unlocked || !def || !this.sfx) return false;
    const bufs = this.buffersFor(voice.id);
    if (!bufs || bufs.length === 0) return false;
    const cap = this.opts.rules === false ? Infinity : MIX.maxVoices;
    if (this.playing.length >= cap) { // steal the lowest priority, oldest voice (OG game.js:6814-6823)
      let k = 0;
      for (let e = 1; e < this.playing.length; e++) {
        const a = this.playing[e], b = this.playing[k];
        if (a.priority < b.priority || (a.priority === b.priority && a.started < b.started)) k = e;
      }
      if (this.playing[k].priority > def.priority) return false;
      this.stopVoice(this.playing[k]);
    }
    const src = ctx.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = voice.rate * (1 + (2 * Math.random() - 1) * def.jitter); // OG game.js:6826
    const g = ctx.createGain();
    g.gain.value = Math.min(1.5, def.volume * voice.gain * n * (0.85 + 0.3 * Math.random())); // OG game.js:6828
    src.connect(g);
    let p = null;
    if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
    const rec = { source: src, gain: g, pan: p, priority: def.priority, started: ctx.currentTime };
    this.playing.push(rec);
    src.onended = () => {
      const i = this.playing.indexOf(rec);
      if (i >= 0) this.playing.splice(i, 1);
      try { src.disconnect(); g.disconnect(); if (p) p.disconnect(); } catch { /* ignore */ }
    };
    src.start(ctx.currentTime + (voice.delay || 0));
    this.played++;
    return true;
  }
  stopVoice(rec) { // OG game.js:6841-6848
    const ctx = this.ctx;
    if (!ctx) return;
    const i = this.playing.indexOf(rec);
    if (i >= 0) this.playing.splice(i, 1);
    rec.gain.gain.setTargetAtTime(0, ctx.currentTime, MIX.stealFade);
    try { rec.source.stop(ctx.currentTime + MIX.stealStop); } catch { /* ignore */ }
  }

  // play(name, {x, vol, rate, delay}): a named sound, straight to a voice (like OG ui()/win()).
  playNamed(name, { x, vol = 1, rate = 1, delay = 0 } = {}) {
    if (this.muted) return false;
    this._syncBudget = Math.max(this._syncBudget, 1);
    return this.play({ id: name, gain: vol, rate, delay }, this.panAt(x), 1);
  }
  ui(id = 'ui') { if (this.muted) return; this._syncBudget = Math.max(this._syncBudget, 1); this.play({ id, gain: 1, rate: 1 + 0.12 * (2 * Math.random() - 1), delay: 0 }, 0, 1); } // OG game.js:6552-6555
  win() { if (this.muted) return; this._syncBudget = Math.max(this._syncBudget, 1); this.play({ id: 'win', gain: 1, rate: 1, delay: 0 }, 0, 1); } // OG game.js:6549-6551

  // ---------------------------------------------------------------- sim events. OG game.js:6557-6627
  // Call once per drawn frame, even with an empty list (demand and the 0.1 s windows decay here).
  handleEvents(events) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (!this.running()) { if (ctx.state === 'suspended' && this.unlocked && !this.opts.ctx) ctx.resume().catch(() => {}); return; } // OG game.js:6560-6561
    this._syncBudget = 2;
    const now = ctx.currentTime;
    if (this.lastEventsAt >= 0 && now - this.lastEventsAt > MIX.window) this.pruneStarted(now);
    this.lastEventsAt = now;
    const list = events || [];
    const from = Math.max(0, list.length - MIX.ring); // OG game.js:6562: only the newest 1024
    const busy = busyOf(this.demand);
    const asked = [];
    for (let i = from; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      const size = e.size ?? e.v ?? 1,   // LEAD 11-14: the sims send OG's event size as `v` (it was read as 1: no Roman war cry)
            who = e.who ?? e.type ?? null, pan = this.panAt(e.x);
      const vs = eventVoices(e, who, size, Math.random(), busy); // OG's voicesFor, or ours for step-4 units (rules.js)
      for (let k = 0; k < vs.length; k++) asked.push({ voice: vs[k], pan, rank: rankOf(vs[k], size) });
    }
    if (this.opts.rules === false) { for (const a of asked) this.play(a.voice, a.pan, 1); return; }
    // demand, decaying with tau 1 s (OG game.js:6585-6600)
    const x = Math.exp(-Math.max(0, now - this.demandAt) / MIX.demandTau);
    this.demand = this.demand * x + asked.length;
    this.demandAt = now;
    for (const [k, val] of this.asked) this.asked.set(k, val * x);
    for (const a of asked) if (SOUND[a.voice.id] && SOUND[a.voice.id].perSecond !== undefined) this.asked.set(a.voice.id, (this.asked.get(a.voice.id) ?? 0) + 1);
    asked.sort((a, b) => b.rank - a.rank);
    for (const { voice, pan } of asked) { // OG game.js:6607-6621
      const def = SOUND[voice.id];
      if (!def) continue;
      const burst = def.burst === true;
      if (this.started.length >= MIX.newPerWindow && !def.always && !burst) continue;
      const ps = def.perSecond;
      if (ps !== undefined && Math.random() >= ps / Math.max(ps, this.asked.get(voice.id) ?? 0)) continue;
      const l = this.limiter.recent(voice.id, now);
      if (!burst && l > 0 && Math.random() * (1 + 0.6 * l * busy) >= 1) continue;
      if (this.limiter.allow(voice.id, now, 2 - busy)) {
        this.started.push(now);
        this.play(voice, def.center ? 0 : pan, 1 / Math.sqrt(1 + 0.35 * l)); // ours (step 7): `center` = a UI moment (map loaded, secret found)
      }
    }
    this.pruneStarted(now);
  }
  pruneStarted(now) { while (this.started.length > 0 && now - this.started[0] >= MIX.window) this.started.shift(); } // OG game.js:6622

  // ---------------------------------------------------------------- per frame: beds, steps, flames, pings
  // world: the sim world (units, W, waterAt, groups, mines, oil). opts: { paused, footfalls }
  //   footfalls: units (or ids) that put a foot down this frame (the renderer's walk cycle, OG
  //   game.js:19225-19229). Leave it out and the engine estimates them from distance walked.
  update(world, opts = {}) {
    if (!world || !this.running() || this.muted) return;
    this._syncBudget = Math.max(this._syncBudget, 2);
    if (world.W) this.W = world.W;
    const now = this.ctx.currentTime, paused = !!opts.paused;
    this._frame++;
    if (now >= this.nextBeds) { this.nextBeds = now + MIX.bedEvery; this.listen(world, paused, now); } // OG game.js:6623
    const ff = opts.footfalls !== undefined ? this.resolveUnits(world, opts.footfalls) : paused ? [] : this.autoFootfalls(world);
    this.footsteps(world, paused, now, ff); // OG game.js:6624
    this.flames(world, paused, now);        // OG game.js:6625
    this.minePings(world, paused, now);     // OG game.js:6626
    this.unitLoops(world, paused, now);     // ours (step 6): saws, beams, hums, hovers
  }
  resolveUnits(world, list) {
    if (!list || !list.length || typeof list[0] === 'object') return list || [];
    const out = this._ff; out.length = 0;
    for (const id of list) { const u = world.unitById ? world.unitById(id) : null; if (u) out.push(u); }
    return out;
  }

  // OG game.js:6849-6928: every 0.25 s
  listen(world, paused, now) {
    const units = world.units || [];
    let burning = 0, gallop = 0, slither = 0;
    const cnt = this._callCount.fill(0), pick = this._callPick.fill(null);
    const ocnt = this._ownCount.fill(0), opick = this._ownPick.fill(null), bcnt = this._bedCount.fill(0);
    const L = world.lava7, lava = L && L.cells > 0 && typeof L.hotAt === 'function' ? L : null; // ours (step 7): lava on the field
    let inLava = 0, lavaPick = null, flyN = 0, flyPick = null;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || u.dead) continue;
      const mi = u.def && u.def.maker ? unitMade(u) : null; // ours (step 8): a made unit calls with its body's voice
      const st = u.state, t = mi !== null ? mi.who : u.type, burn = u.burning > 0;
      if (mi !== null && mi.fly && !paused && flying(u)) { flyN++; if (Math.random() * flyN < 1) flyPick = u; } // made flyers' wings
      if (burn) burning++;
      if (burn && lava !== null && !((u.z || 0) > LAVA7.z) && lava.hotAt(world, u.x, u.y)) { inLava++; if (Math.random() * inLava < 1) lavaPick = u; } // burning in lava
      if (OWN_CALL_TYPES.has(t)) for (let k = 0; k < OWN_CALLS.length; k++) { // ours (step 4): rolling machines, ships; step 6: aliens
        const c = OWN_CALLS[k];
        if (!c.test(t) || (c.rolling && !rolling(u)) || (c.burning && !burn) || (c.fleeing && (st !== STATE_FLEE || burn))) continue;
        ocnt[k]++;
        if (Math.random() * ocnt[k] < 1) opick[k] = u;
      }
      if (BED_TYPES.has(t)) for (let k = 0; k < OWN_BEDS.length; k++) if (OWN_BEDS[k].test(u)) bcnt[k]++; // ours (step 6): swarms up
      const b = baseOf(t);
      if (st === STATE_CHARGE && (b === 'cavalry' || b === 'horse' || b === 'apecav')) gallop++; // OG game.js:6865-6866
      if (t === 'snake') { // OG game.js:6867-6870
        const d = u.def || {}, sp = Math.hypot(u.vx || 0, u.vy || 0);
        if (sp >= 0.4 * (d.walkSpeed || 0)) slither += Math.min(1, sp / Math.max(1e-6, d.runSpeed || 1));
      }
      if (t === 'dragon' && !paused && flying(u) && !(1 & Math.round(now / MIX.bedEvery))) // OG game.js:6871-6876
        this.play({ id: 'wings', gain: 0.9, rate: 0.7, delay: 0 }, this.panAt(u.x), 1);
      for (let k = 0; k < CALLS.length; k++) { // OG game.js:6877-6883 (one random pick per call kind; made units by their body)
        const c = CALLS[k];
        if (!c.test(t) || (c.burning && !burn) || (c.fleeing && (st !== STATE_FLEE || burn))) continue;
        cnt[k]++;
        if (Math.random() * cnt[k] < 1) pick[k] = u;
      }
    }
    if (flyPick !== null && !(1 & Math.round(now / MIX.bedEvery))) { // ours (step 8): one made flyer's wings per 0.5 s, by its size
      const W = MADE_WINGS, m = unitMade(flyPick), r = Math.max(5, flyPick.radius || 9);
      this.play({ id: W.id, gain: W.gain * (m ? m.gain : 1), rate: Math.min(W.hi, Math.max(W.lo, W.rate * Math.sqrt(W.refR / r))), delay: 0 }, this.panAt(flyPick.x), 1);
    }
    const lvl = (x) => Math.min(1, x) ** 0.6; // OG game.js:6885
    this.bed('amb-fire', paused ? 0 : lvl((burning + oilBurning(world) / 8) / 14), now); // OG game.js:6886
    this.bed('amb-water', paused ? 0 : lvl(waterCells(world) / 2500), now);             // OG game.js:6887
    this.bed('amb-gallop', paused ? 0 : lvl(gallop / 5), now);                          // OG game.js:6888
    this.bed('amb-slither', paused ? 0 : lvl(slither / 4), now);                        // OG game.js:6889
    const march = countMarching(world);                                                 // OG game.js:6890-6904
    this.marchHeard = march >= 4;                                                       // OG game.js:6906-6911
    this.bed('amb-march', paused || march < 4 ? 0 : 1, now);                            // OG game.js:6912
    this.bed('amb-march-crowd', paused || march < 11 ? 0 : 1, now);                     // OG game.js:6913
    for (let k = 0; k < OWN_BEDS.length; k++) this.bed(OWN_BEDS[k].id, paused ? 0 : lvl(bcnt[k] / OWN_BEDS[k].full), now); // ours (step 6)
    this.bed(LAVA7.bed, paused || lava === null ? 0 : lvl(lava.cells / LAVA7.full), now);               // ours (step 7): lava bubbles
    if (paused) return;
    if (lavaPick !== null) { // ours (step 7): a burning unit in lava sizzles now and then (OG's random-call rule)
      const p = 1 - Math.exp(-Math.min(LAVA7.cap, LAVA7.rate * inLava) * MIX.bedEvery);
      if (Math.random() < p && this.limiter.allow(LAVA7.sizzle, now))
        this.play({ id: LAVA7.sizzle, gain: 0.8, rate: 0.9 + 0.2 * Math.random(), delay: Math.random() * MIX.bedEvery }, this.panAt(lavaPick.x), 1);
    }
    for (let k = 0; k < CALLS.length; k++) { // OG game.js:6915-6927
      const c = CALLS[k], u = pick[k];
      const p = 1 - Math.exp(-Math.min(c.cap, c.rate * cnt[k]) * MIX.bedEvery);
      if (!u || Math.random() >= p) continue;
      if (!this.limiter.allow(c.id, now)) continue;
      const r = (u.radius || 1) / Math.max(1, (u.def && u.def.radius) || u.radius || 1);
      const mi = u.def && u.def.maker ? unitMade(u) : null, pk = mi !== null ? mi.pitch : 1; // ours (step 8): a small made unit calls higher
      this.play({ id: c.id, gain: 0.8, rate: Math.min(1.2 * pk, Math.max(0.7 * pk, pk / Math.sqrt(r))), delay: Math.random() * MIX.bedEvery }, this.panAt(u.x), 1);
    }
    for (let k = 0; k < OWN_CALLS.length; k++) { // ours (step 4), same rule; a bigger machine creaks lower
      const c = OWN_CALLS[k], u = opick[k];
      opick[k] = null;
      const p = 1 - Math.exp(-Math.min(c.cap, c.rate * ocnt[k]) * MIX.bedEvery);
      if (!u || Math.random() >= p || !this.limiter.allow(c.id, now)) continue;
      const rate = Math.min(1.25, Math.max(0.7, Math.sqrt(16 / Math.max(8, u.radius || 16)))) * (0.92 + 0.16 * Math.random());
      this.play({ id: c.id, gain: 0.8, rate, delay: Math.random() * MIX.bedEvery }, this.panAt(u.x), 1);
    }
  }
  bed(id, level, now) { // OG game.js:6930-6938 (+ ours: a bed starts on its first non-zero level)
    let g = this.beds.get(id);
    if (!g) {
      if (level <= 0.001) return;
      g = this.startBed(id);
      if (!g) return;
    }
    g.gain.setTargetAtTime(level * (SOUND[id].volume ?? 0.5), now, MIX.bedTau);
  }
  startBed(id) { // OG game.js:6429-6446
    const ctx = this.ctx;
    this._syncBudget = Math.max(this._syncBudget, 1);
    const bufs = this.buffersFor(id);
    if (!ctx || !bufs || !bufs[0] || !this.bedBus) return null;
    const s = ctx.createBufferSource();
    s.buffer = bufs[0]; s.loop = true; s.playbackRate.value = SOUND[id].rate ?? 1;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(this.bedBus);
    s.start(0, Math.random() * bufs[0].duration);
    this.beds.set(id, g);
    return g;
  }

  // OG game.js:6657-6713: up to 4 flamethrower roars at once (start sound, then a loop)
  flames(world, paused, now) {
    const ctx = this.ctx;
    for (const [u, r] of this.roars) {
      if (!paused && alive(world, u) && attacking(u)) r.pan && r.pan.pan.setTargetAtTime(this.panAt(u.x), now, 0.05);
      else {
        r.gain.gain.setTargetAtTime(0, now, 0.15 / 3);
        for (const s of r.sources) try { s.stop(now + MIX.flameStop); } catch { /* ignore */ }
        this.roars.delete(u);
      }
    }
    if (paused) return;
    const units = world.units || [];
    for (let i = 0; i < units.length && this.roars.size < MIX.flameLoops; i++) {
      const u = units[i];
      if (!u || u.dead || !flamerOf(u) || !attacking(u) || this.roars.has(u)) continue; // step 8: made units with the flamer too
      this._syncBudget = Math.max(this._syncBudget, 2);
      const startB = this.buffersFor('flame-start'), loopB = this.buffersFor('flame-loop');
      if (!startB && !loopB) return;
      const vol = SOUND['flame-loop'].volume;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol * (0.9 + 0.2 * Math.random()), now + MIX.flameRamp);
      let p = null;
      if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = this.panAt(u.x); g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
      const sources = [];
      let x = now;
      if (startB) {
        const c = startB[0], s = ctx.createBufferSource(); s.buffer = c;
        const eg = ctx.createGain(), ratio = SOUND['flame-start'].volume / vol, l = Math.max(x, x + c.duration - 0.5);
        eg.gain.setValueAtTime(ratio, x); eg.gain.setValueAtTime(ratio, l); eg.gain.linearRampToValueAtTime(1, x + c.duration);
        s.connect(eg); eg.connect(g); s.start(x); sources.push(s); x += c.duration;
      }
      if (loopB) { const s = ctx.createBufferSource(); s.buffer = loopB[0]; s.loop = true; s.connect(g); s.start(x); sources.push(s); }
      this.roars.set(u, { sources, gain: g, pan: p });
    }
  }

  // OG game.js:6714-6803: one footstep per footfall, thinned when many are due
  footsteps(world, paused, now, list) {
    if (paused) return;
    const m = Math.min(this.stepsDue, 24);
    const keep = this.stepsDue > 0 ? m / this.stepsDue : 1;
    const crowd = (1 + m / 8) ** -0.25;
    const hasWater = waterCells(world) > 0;
    let heard = 0;
    for (const u of list || []) {
      if (!u || u.dead) continue;
      const mi = u.def && u.def.maker ? unitMade(u) : null; // ours (step 8): a made unit steps like its body
      const t = mi !== null ? mi.who : u.type, rat = isRat(t), heavy = heavyOf(t), horse = isHorse(t), ape = isApe(t), cat = isCat(t);
      const own = ownStepOf(t); // ours (step 4): dinosaur feet; step 6: robots, big ones, sea animals on land
      if (!(isFootHuman(t) || rat || heavy > 0 || horse || ape || cat || own) || (u.z || 0) > 0 || (u.climb || 0) > 0) continue;
      if (mi !== null && madeUnder(u)) continue; // burrowed
      if (this.marchHeard && t === 'legion' && u.group >= 0 && groupMarching(world, u)) continue; // OG game.js:6744-6745
      const deep = hasWater && typeof world.waterAt === 'function' && world.waterAt(u.x, u.y) >= MIX.deep; // OG game.js:6746
      if ((rat || (own && own.dry)) && deep) continue; // a sea animal swims there (no steps)
      const d = u.def || {}, run = d.runSpeed || 1;
      const sp = Math.hypot(u.vx || 0, u.vy || 0);
      const galloping = horse && (u.state === STATE_CHARGE || sp >= 0.8 * run); // OG game.js:6749-6753
      let id = rat ? 'rat-step' : deep ? 'wade' : own ? own.id : heavy > 0 ? 'heavy-step' : horse ? (galloping ? 'gallop-run' : 'gallop') : ape || cat ? 'ape-step' : 'footstep';
      const hv = mi !== null && mi.heavy && id === 'footstep'; // ours (step 8): a Heavy person thuds
      if (hv) id = 'heavy-step';
      if (horse && !deep) { // OG game.js:6763-6767
        const g = this.galloped.get(u);
        if (g !== undefined && now - g < MIX.gallopGap) continue;
        this.galloped.set(u, now);
      }
      heard++;
      if (Math.random() >= keep) continue;
      const catDry = cat && !deep;
      const rate = own && !deep ? own.rate * (mi !== null ? mi.pitch : 1) * (0.95 + 0.1 * Math.random()) // ours (step 4); a made beast by its size (step 8)
        : catDry ? 1.2 + Math.random() * 0.15 : (!horse && !ape) || deep ? Math.min(1.15, Math.max(0.8, 1 / Math.sqrt((u.radius || 8.6) / 8.6))) : 1; // OG game.js:6771-6776
      const F = stepGain(sp, run), G = 1 + (0.08 * (1 - F)) / 0.7; // OG game.js:6777-6778
      const pan = this.panAt(u.x);
      this.play({ id, gain: crowd * F * (own && !deep ? own.gain * (mi !== null ? mi.gain : 1) : heavy > 0 && !deep ? heavy : hv ? 0.55 : catDry ? 0.5 : 1), rate: rate * G, delay: 0 }, pan, 1);
      if (horse && !deep) this.play({ id: 'hoof', gain: crowd * F * 0.85, rate: 0.95 + 0.1 * Math.random(), delay: 0.06 * (0.5 + Math.random()) }, pan, 1); // OG game.js:6785-6799
    }
    const dt = Math.max(0.001, now - this.stepsAt), R = 1 - Math.exp(-dt / 1); // OG game.js:6801-6802
    this.stepsDue += (heard / dt - this.stepsDue) * R;
    this.stepsAt = now;
    if ((this._frame & 255) === 0) for (const k of this.galloped.keys()) if (k.dead) this.galloped.delete(k);
  }
  // Ours: a stand-in for the renderer's walk cycle. One footfall per stride (stride x radius px walked),
  // gated like OG's (moving, not stunned: game.js:19225-19229).
  autoFootfalls(world) {
    const out = this._ff; out.length = 0;
    const units = world.units || [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || u.dead) continue;
      let s = this._stride.get(u.id);
      if (!s) { s = { x: u.x, y: u.y, d: Math.random(), seen: 0 }; this._stride.set(u.id, s); }
      const dx = u.x - s.x, dy = u.y - s.y;
      s.x = u.x; s.y = u.y; s.seen = this._frame;
      const sp = Math.hypot(u.vx || 0, u.vy || 0), walk = Math.max(1, (u.def && u.def.walkSpeed) || 30);
      if ((u.stun || 0) > 0 || sp - 8 < 0.35 * walk * 0.6) continue;
      const stride = (STRIDE[baseOf(u.def && u.def.maker ? soundTypeOf(u.type, u.def.maker.recipe) : u.type)] || 3) * (u.radius || 6); // step 8: a made unit's body
      s.d += Math.hypot(dx, dy);
      if (s.d >= stride) { s.d %= stride; out.push(u); }
    }
    if ((this._frame & 127) === 0) for (const [id, s] of this._stride) if (this._frame - s.seen > 60) this._stride.delete(id);
    return out;
  }

  // OG game.js:6628-6656: an idle mine pings now and then
  minePings(world, paused, now) {
    const dt = this.pingCheckedAt < 0 ? 0 : now - this.pingCheckedAt;
    this.pingCheckedAt = now;
    const m = mineInfo(world);
    if (paused || !m || m.count === 0 || now - this.pingedAt < MIX.pingGap) return;
    if (Math.random() >= MIX.pingRate * (m.count - m.armed) * dt) return;
    for (let k = 0; k < 8; k++) {
      const x = m.idleX(Math.floor(Math.random() * m.high));
      if (x === null) continue;
      this.pingedAt = now;
      this.play({ id: 'mine-ping', gain: 1, rate: 1 + 0.03 * (2 * Math.random() - 1), delay: 0 }, this.panAt(x), 1);
      return;
    }
  }

  // ---------------------------------------------------------------- painting sounds. OG game.js:6459-6547
  pour(x, len) { // OG game.js:6459-6472 (len 0 = stroke start)
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    this.poured += len;
    if ((len > 0 && this.poured < MIX.pourEvery) || ctx.currentTime - this.pouredAt < MIX.pourGap) return;
    this.poured = 0; this.pouredAt = ctx.currentTime;
    this._syncBudget = Math.max(this._syncBudget, 1);
    this.play({ id: 'pour', gain: 0.85 + 0.3 * Math.random(), rate: 0.9 + 0.25 * Math.random(), delay: 0 }, this.panAt(x), 1);
  }
  freeze(x, len) { // OG game.js:6473-6486
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    this.frozen += len;
    if ((len > 0 && this.frozen < MIX.freezeEvery) || ctx.currentTime - this.frozenAt < MIX.freezeGap) return;
    this.frozen = 0; this.frozenAt = ctx.currentTime;
    this._syncBudget = Math.max(this._syncBudget, 1);
    this.play({ id: 'freeze', gain: 0.8 + 0.3 * Math.random(), rate: 0.95 + 0.3 * Math.random(), delay: 0 }, this.panAt(x), 1);
  }
  mined(x, count) { // OG game.js:6487-6503
    const ctx = this.ctx;
    if (!ctx || this.muted || count <= 0 || ctx.currentTime - this.minedAt < MIX.mineGap) return;
    this.minedAt = ctx.currentTime;
    this._syncBudget = Math.max(this._syncBudget, 1);
    this.play({ id: 'place-mine', gain: 0.85 + 0.3 * Math.random(), rate: 0.75 + Math.random() * (0.95 - 0.75), delay: 0 }, this.panAt(x), 1);
  }
  placed(type, x, count) { // OG game.js:6504-6547: units painted (count = how many this move)
    const ctx = this.ctx;
    if (!ctx || this.muted || count <= 0) return;
    const now = ctx.currentTime, d = PLACE[type] ?? madePlaceOf(type); // step 8: a made unit by its body / weapon
    this._syncBudget = Math.max(this._syncBudget, 2);
    if (d && now - this.tickedAt >= MIX.placeGap) {
      const list = typeof d === 'string' ? [{ id: d }] : d;
      for (const s of list) {
        this.tickedAt = now;
        const lo = s.low ?? PLACE_RATE.low, hi = s.high ?? PLACE_RATE.high;
        this.play({ id: s.id, gain: s.gain ?? 1, rate: lo + Math.random() * (hi - lo), delay: 0 }, this.panAt(x), 1);
      }
    }
    if (now - this.placedAt < MIX.callGap) return;
    const ct = soundTypeOf(type); // step 8: a made unit calls with its body's voice
    const c = CALLS.find((e) => !e.burning && !e.fleeing && e.test(ct)); // OG game.js:6538
    if (!c) return;
    this.placedAt = now;
    this.play({ id: c.id, gain: 0.9, rate: 0.92 + 0.16 * Math.random(), delay: 0 }, this.panAt(x), 1);
  }

  // Ours (step 6): held loops per unit (OWN_LOOPS in rules.js), the flamer roars' pattern: a loop starts when a unit
  // starts its thing and stops (short fade) the frame it stops, dies, is cleared, or the game pauses. Pan follows it.
  unitLoops(world, paused, now) {
    const ctx = this.ctx;
    let total = 0;
    for (let k = 0; k < OWN_LOOPS.length; k++) {
      const spec = OWN_LOOPS[k], m = this.loops[k];
      for (const [u, L] of m) {
        if (!paused && alive(world, u) && spec.test(u)) {
          if (L.pan) L.pan.pan.setTargetAtTime(this.panAt(u.x), now, 0.05);
          if (spec.rate) L.src.playbackRate.setTargetAtTime(spec.rate(u), now, 0.06);
          total++;
          continue;
        }
        this.stopLoop(L, now);
        m.delete(u);
      }
    }
    if (paused || total >= MAX_LOOPS) return;
    const units = world.units || [];
    for (let i = 0; i < units.length && total < MAX_LOOPS; i++) {
      const u = units[i];
      if (!u || u.dead || !(LOOP_TYPES.has(u.type) || madeLoops(u))) continue; // step 8: made units' laser, saw, magnet, mind, beam
      for (let k = 0; k < OWN_LOOPS.length; k++) {
        const spec = OWN_LOOPS[k], m = this.loops[k];
        if (m.size >= spec.max || m.has(u) || !spec.test(u)) continue;
        this._syncBudget = Math.max(this._syncBudget, 1);
        const bufs = this.buffersFor(spec.id);
        if (!bufs || !bufs[0]) continue; // not made yet: next frame
        const g = ctx.createGain(), vol = SOUND[spec.id].volume * (spec.gain ?? 1);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + 0.06);
        let p = null;
        if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = this.panAt(u.x); g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
        const src = ctx.createBufferSource();
        src.buffer = bufs[0]; src.loop = true; src.playbackRate.value = spec.rate ? spec.rate(u) : 1;
        src.connect(g); src.start(now, Math.random() * bufs[0].duration);
        m.set(u, { src, gain: g, pan: p });
        total++;
      }
    }
  }
  stopLoop(L, now) {
    L.gain.gain.setTargetAtTime(0, now, 0.04);
    try { L.src.stop(now + 0.25); } catch { /* ignore */ }
    L.src.onended = () => { try { L.src.disconnect(); L.gain.disconnect(); if (L.pan) L.pan.disconnect(); } catch { /* ignore */ } };
  }
  loopCount() { let n = 0; for (const m of this.loops) n += m.size; return n; }

  stats() { return { playing: this.playing.length, demand: this.demand, played: this.played, beds: this.beds.size, roars: this.roars.size, loops: this.loopCount(), made: this.buffers.size }; }
}

// ---------------------------------------------------------------- world adapters (fields owned by other roles)
function alive(world, u) { return !u.dead && !u.removed && (!world.unitById || world.unitById(u.id) === u); }
function rolling(u) { return Math.hypot(u.vx || 0, u.vy || 0) >= Math.max(6, 0.3 * ((u.def && u.def.walkSpeed) || 20)) && !(u.stun > 0); } // ours: a machine on the move
function attacking(u) { return u.attack > 0 || !!(u.anim && u.anim.atk > 0); }     // OG u.attack > 0 (game.js:6666). 11-15 fix: our units set u.attack (anim.atk is animals only): flamers never roared
function flying(u) { return u.leap === 3 || (u.leap === undefined && (u.z || 0) > 20); } // OG leaping 3 = flying (game.js:10651)
function oilBurning(world) { const o = world.oil; return (o && o.burning) || world.oilBurning || 0; }
const waterCache = new WeakMap();
function waterCells(world) {
  if (typeof world.waterCells === 'number') return world.waterCells;
  const w = world.water;
  if (!w) return 0;
  if (typeof w.cells === 'number') return w.cells;
  if (w.length) { // count wet tiles (level >= 0.05, OG game.js:9557), once per sim tick
    const c = waterCache.get(world);
    if (c && c.tick === world.tick) return c.n;
    let n = 0;
    for (let i = 0; i < w.length; i++) if (w[i] >= 0.05) n++;
    waterCache.set(world, { tick: world.tick, n });
    return n;
  }
  return 0;
}
function groupFlag(world, g, key) {
  const G = world.groups;
  if (!G || g < 0 || g === undefined) return undefined;
  const arr = G[key];
  if (arr && typeof arr.length === 'number') return arr[g];
  const item = typeof G.get === 'function' ? G.get(g) : G[g];
  return item ? item[key] : undefined;
}
function groupMarching(world, u) { // OG groups.marching && !groups.charging; fallback: advancing, not charging
  const m = groupFlag(world, u.group, 'marching'), c = groupFlag(world, u.group, 'charging');
  if (m === undefined) return u.state === STATE_ADVANCE;
  return !!m && !c;
}
function countMarching(world) { // OG game.js:6890-6904
  let n = 0;
  for (const u of world.units || []) if (u && !u.dead && u.type === 'legion' && u.group >= 0 && groupMarching(world, u)) n++;
  return n;
}
function mineInfo(world) {
  const M = world.mines;
  if (!M) return null;
  if (Array.isArray(M)) {
    let armed = 0;
    for (const m of M) if (m && (m.armed || (m.fuse !== undefined && m.fuse >= 0))) armed++;
    return { count: M.length, armed, high: M.length, idleX: (i) => { const m = M[i]; return m && !m.armed && !(m.fuse >= 0) ? m.x : null; } };
  }
  if (typeof M.count === 'number') { // OG-like struct of arrays
    return { count: M.count, armed: M.armed || 0, high: M.high || M.count, idleX: (i) => (M.alive && M.alive[i] && !(M.fuse && M.fuse[i] >= 0) ? M.x[i] : null) };
  }
  return null;
}
