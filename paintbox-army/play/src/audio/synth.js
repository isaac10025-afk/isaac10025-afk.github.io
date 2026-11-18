// AUDIO: our own sounds, made in code. No audio files and nothing of theirs: every sound is
// oscillators, noise, plucked strings, struck "modes" and formant voices, written sample by sample
// into a mono Float32Array at SR. Toy-like, punchy, phone-speaker friendly: every sound is high-
// passed (no deep sub-bass) and gently low-passed, and its loudness is capped by short-term RMS
// as well as peak, so sustained sounds don't drown out clicks.
//
// render(id, variant) -> Float32Array   (pure JS, no WebAudio: runs in node too)
// RECIPES[id] = { dur, make(o, v), drive?, hp?, lp?, loop?, variants? }
// Several variants per sound, picked at random on play, like a sample set.

export const SR = 24000;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------- rng
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = rngFrom(1);
const rr = (a, b) => a + (b - a) * rnd();

// ---------------------------------------------------------------- filters
class Biquad {
  constructor(type, f, q = 0.707) { this.type = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f, q); }
  set(f, q) {
    const w = (TAU * clamp(f, 20, SR * 0.45)) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') { b1 = 1 - cs; b0 = b2 = b1 / 2; }
    else if (this.type === 'hp') { b1 = -(1 + cs); b0 = b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // 'bp': 0 dB at the centre
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
// filt spec: ['lp'|'hp'|'bp', freq | t=>freq, q] or a list of those (in series)
function chain(spec) {
  if (!spec) return null;
  const list = Array.isArray(spec[0]) ? spec : [spec];
  return list.map(([type, f, q = 0.707]) => {
    const dyn = typeof f === 'function';
    return { bq: new Biquad(type, dyn ? f(0) : f, q), f, q, dyn };
  });
}
function runChain(list, x, t, i) {
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    if (c.dyn && (i & 15) === 0) c.bq.set(c.f(t), c.q);
    x = c.bq.run(x);
  }
  return x;
}

// ---------------------------------------------------------------- envelopes and contours
const perc = (a, d) => (t) => (t < a ? t / a : Math.exp(-(t - a) / d));
const ar = (a, r, dur) => (t) => Math.max(0, Math.min(1, t / a, (dur - t) / r));
const hump = (dur, p = 1) => (t) => { const x = t / dur; return x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), p); };
const glide = (f0, f1, d) => (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / d));
// [t0, v0, t1, v1, ...]: exponential steps (frequencies)
const pts = (...p) => (t) => {
  if (t <= p[0]) return p[1];
  for (let i = 2; i < p.length; i += 2) if (t <= p[i]) return p[i - 1] * Math.pow(p[i + 1] / p[i - 1], (t - p[i - 2]) / (p[i] - p[i - 2]));
  return p[p.length - 1];
};
// [t0, v0, t1, v1, ...]: linear steps (gains)
const lin = (...p) => (t) => {
  if (t <= p[0]) return p[1];
  for (let i = 2; i < p.length; i += 2) if (t <= p[i]) return p[i - 1] + (p[i + 1] - p[i - 1]) * ((t - p[i - 2]) / (p[i] - p[i - 2]));
  return p[p.length - 1];
};
const fn = (v) => (typeof v === 'function' ? v : () => v);

// ---------------------------------------------------------------- layers (all add into o)
const EDGE = 64;
function span(o, at, dur) {
  const s0 = Math.max(0, Math.round(at * SR));
  return [s0, Math.max(0, Math.min(o.length - s0, Math.round(dur * SR)))];
}
function blep(p, dt) {
  if (p < dt) { p /= dt; return p + p - p * p - 1; }
  if (p > 1 - dt) { p = (p - 1) / dt; return p * p + p + p + 1; }
  return 0;
}
function wave(kind, p, dt) {
  switch (kind) {
    case 'tri': return 1 - 4 * Math.abs(p - 0.5);
    case 'saw': return 2 * p - 1 - blep(p, dt);
    case 'square': return (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
    default: return Math.sin(TAU * p);
  }
}

// An oscillator: freq(t), env(t).
function tone(o, at, dur, freq, env, { w = 'sine', amp = 1, filt, vib = 0, vibRate = 6, ph = 0 } = {}) {
  const [s0, n] = span(o, at, dur), F = fn(freq), E = fn(env), fl = chain(filt);
  let p = ph;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let f = F(t);
    if (vib) f *= 1 + vib * Math.sin(TAU * vibRate * t);
    const dt = f / SR;
    p += dt; p -= Math.floor(p);
    let x = wave(w, p, dt);
    if (fl) x = runChain(fl, x, t, i);
    o[s0 + i] += amp * E(t) * x * (i > n - EDGE ? (n - i) / EDGE : 1);
  }
}

// Noise: white, pink or brown, through a filter chain.
function noise(o, at, dur, env, { amp = 1, filt, color = 'white', am } = {}) {
  const [s0, n] = span(o, at, dur), E = fn(env), fl = chain(filt);
  let b0 = 0, b1 = 0, b2 = 0, br = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let x = rnd() * 2 - 1;
    if (color === 'pink') { b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913; x = (b0 + b1 + b2 + x * 0.1848) * 0.25; }
    else if (color === 'brown') { br = (br + 0.02 * x) / 1.02; x = br * 3.5; }
    if (fl) x = runChain(fl, x, t, i);
    if (am) x *= am(t);
    o[s0 + i] += amp * E(t) * x * (i > n - EDGE ? (n - i) / EDGE : 1);
  }
}

// Struck object: decaying sine modes [[freq, decay s, gain], ...] (wood, metal, glass, skin).
function modal(o, at, modes, { amp = 1, atk = 0.0006, k = 1 } = {}) {
  for (const [f, d, g] of modes) tone(o, at, Math.min(d * 7, 3), f * k, perc(atk, d), { amp: amp * g, ph: rnd() });
}

// Plucked string (Karplus-Strong).
function pluck(o, at, f, dur, { amp = 1, damp = 0.995, bright = 0.6 } = {}) {
  const [s0, n] = span(o, at, dur), N = Math.max(2, Math.round(SR / f)), buf = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += bright * (rnd() * 2 - 1 - lp); buf[i] = lp; }
  let j = 0;
  for (let i = 0; i < n; i++) {
    const a = buf[j], b = buf[(j + 1) % N];
    buf[j] = damp * 0.5 * (a + b);
    o[s0 + i] += amp * a * (i > n - EDGE ? (n - i) / EDGE : 1);
    j = (j + 1) % N;
  }
}

// Formant voice: a buzzy source at f0(t) through a bank of band-pass "formants".
// formants: [[f, q, gain], ...] or t => that list (vowel morph); fs scales them (small mouths).
const VOW = {
  a: [[730, 7, 1], [1090, 9, 0.5], [2440, 12, 0.22]],
  o: [[570, 7, 1], [840, 8, 0.45], [2410, 12, 0.18]],
  u: [[320, 5, 1], [870, 8, 0.35], [2240, 12, 0.14]],
  uh: [[640, 6, 1], [1190, 9, 0.45], [2390, 12, 0.2]],
  e: [[530, 6, 1], [1840, 11, 0.45], [2480, 12, 0.22]],
  i: [[300, 5, 1], [2290, 12, 0.4], [3010, 14, 0.22]],
};
function mix(A, B, u) { return A.map((m, k) => [m[0] + (B[k][0] - m[0]) * u, m[1], m[2] + (B[k][2] - m[2]) * u]); }
function voice(o, at, dur, f0, env, { formants = VOW.a, fs = 1, amp = 1, breath = 0.06, rough = 0, vib = 0, vibRate = 5.5, jit = 0.012, w = 'saw' } = {}) {
  const [s0, n] = span(o, at, dur), F = fn(f0), E = fn(env);
  const dynF = typeof formants === 'function';
  const first = dynF ? formants(0) : formants;
  const bank = first.map(([f, q]) => new Biquad('bp', f * fs, q));
  let p = 0, jv = 0, jt = 0, cr = 1, fm = first;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 63) === 0) jt = rnd() * 2 - 1;
    jv += 0.002 * (jt - jv);
    let f = F(t) * (1 + jit * jv * 8);
    if (vib) f *= 1 + vib * Math.sin(TAU * vibRate * t);
    const dt = f / SR;
    p += dt;
    if (p >= 1) { p -= 1; cr = 1 - rough * rnd(); }
    const src = (wave(w, p, dt) * 0.8 * cr + breath * (rnd() * 2 - 1));
    if (dynF && (i & 31) === 0) { fm = formants(t); for (let k = 0; k < bank.length; k++) bank[k].set(fm[k][0] * fs, fm[k][1]); }
    let y = 0;
    for (let k = 0; k < bank.length; k++) y += bank[k].run(src) * fm[k][2];
    o[s0 + i] += amp * E(t) * y * 3 * (i > n - EDGE ? (n - i) / EDGE : 1);
  }
}

// Crackle: random little bursts (fire, crunch, debris, splinters) at rate(t) per second.
function crackle(o, at, dur, rate, env, { amp = 1, filt = ['bp', 2500, 1.2], len = 0.0012, spread = 0.7 } = {}) {
  const [s0, n] = span(o, at, dur), R = fn(rate), E = fn(env), tmp = new Float32Array(n), L = len * SR;
  let t = 0;
  while (t < dur) {
    t += -Math.log(1 - rnd() * 0.999) / Math.max(0.5, R(t));
    const c = Math.round(t * SR);
    if (c >= n) break;
    const a = (1 - spread + spread * rnd()) * (rnd() < 0.5 ? 1 : -1), m = Math.min(n - c, Math.ceil(L * 5));
    for (let k = 0; k < m; k++) tmp[c + k] += a * (rnd() * 2 - 1) * Math.exp(-k / L);
  }
  const fl = chain(filt);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    o[s0 + i] += amp * E(tt) * (fl ? runChain(fl, tmp[i], tt, i) : tmp[i]);
  }
}

// Bubbles: little rising sine chirps.
function bubbles(o, at, dur, count, { amp = 0.3, lo = 500, hi = 1200 } = {}) {
  for (let k = 0; k < count; k++) {
    const t = at + rnd() * dur, f = rr(lo, hi), d = rr(0.02, 0.05);
    tone(o, t, d * 3, glide(f, f * rr(1.4, 2), d), perc(0.002, d), { amp: amp * rr(0.5, 1) });
  }
}

// Small kits used by many recipes.
function thump(o, at, f0, f1, d, amp = 1) { tone(o, at, d * 6, glide(f0, f1, d * 1.5), perc(0.0015, d), { amp }); }
function click(o, at, f = 3000, d = 0.003, amp = 0.6) { noise(o, at, d * 6, perc(0.0003, d), { amp, filt: ['bp', f, 0.9] }); }
function whoosh(o, at, dur, f0, fm, f1, amp = 1, q = 1.4) {
  noise(o, at, dur, hump(dur, 1.4), { amp, filt: ['bp', (t) => (t < dur / 2 ? f0 * Math.pow(fm / f0, t / (dur / 2)) : fm * Math.pow(f1 / fm, (t - dur / 2) / (dur / 2))), q] });
}
function wood(o, at, f, d = 0.035, amp = 1) { modal(o, at, [[f, d, 1], [f * 2.41, d * 0.55, 0.5], [f * 3.9, d * 0.3, 0.25]], { amp }); click(o, at, f * 2, 0.002, 0.4 * amp); }
function metal(o, at, f, d = 0.15, amp = 1) { modal(o, at, [[f, d, 1], [f * 1.48, d * 0.8, 0.6], [f * 2.09, d * 0.6, 0.4], [f * 2.74, d * 0.4, 0.22]], { amp }); }
function bell(o, at, f, d = 0.3, amp = 1) { modal(o, at, [[f, d, 1], [f * 2, d * 0.5, 0.35], [f * 3.01, d * 0.3, 0.15]], { amp }); }
function step(o, at, amp = 1, f = 1300) {
  noise(o, at, 0.06, perc(0.001, 0.011), { amp, filt: ['lp', f, 0.8] });
  thump(o, at, 210, 130, 0.014, 0.5 * amp);
}
function chirpVoice(o, at, f0, f1, d, amp = 1) { tone(o, at, d, glide(f0, f1, d), ar(0.006, d * 0.6, d), { amp }); tone(o, at, d, glide(f0 * 2, f1 * 2, d), ar(0.006, d * 0.5, d), { amp: 0.25 * amp }); }
// Creak (ours, step 4): stick-slip friction (wood on wood, a rope on a beam, a hull): little kicks at rate(t) per
// second (the creak's buzz) ringing two band-passes at f(t) (the timber's body).
function creak(o, at, dur, rate, env, { f = 700, q = 5, amp = 1, jit = 0.2 } = {}) {
  const [s0, n] = span(o, at, dur), R = fn(rate), E = fn(env), Fq = fn(f), dyn = typeof f === 'function';
  const b1 = new Biquad('bp', Fq(0), q), b2 = new Biquad('bp', Fq(0) * 2.3, q);
  let next = 0, kick = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (dyn && (i & 15) === 0) { const ff = Fq(t); b1.set(ff, q); b2.set(ff * 2.3, q); }
    if (i >= next) { kick = 0.5 + 0.5 * rnd(); next = i + Math.max(2, Math.round((SR / Math.max(2, R(t))) * (1 + jit * (2 * rnd() - 1)))); }
    const x = kick; kick *= 0.5;
    o[s0 + i] += amp * 12 * E(t) * (b1.run(x) + 0.45 * b2.run(x)) * (i > n - EDGE ? (n - i) / EDGE : 1);
  }
}
// Chain links (ours, step 4): `count` little metal clinks over dur; where(u) places link u (0..1) in time (0..1).
function links(o, at, dur, count, { amp = 0.4, lo = 1800, hi = 3400, where = (u) => u, fade = 0 } = {}) {
  for (let j = 0; j < count; j++) {
    const u = rnd(), p = where(u);
    modal(o, at + p * dur, [[rr(lo, hi), rr(0.008, 0.022), 1], [rr(3500, 5200), 0.006, 0.3]], { amp: amp * rr(0.45, 1) * (1 - fade * p) });
  }
}

// ---------------------------------------------------------------- recipes
// Every sound below is our own design. Names match the sound table in rules.js.
export const RECIPES = {
  // --- guns
  'shot-rifle': { dur: 0.32, drive: 1.6, make(o) {
    const k = rr(0.93, 1.07);
    click(o, 0, 3500, 0.0018, 0.9);
    noise(o, 0, 0.12, perc(0.0008, 0.024), { amp: 1.3, filt: ['bp', glide(2600 * k, 1000, 0.06), 0.9] });
    thump(o, 0, 300 * k, 120, 0.03, 0.6);
    noise(o, 0.008, 0.31, perc(0.01, 0.065), { amp: 0.3, filt: ['lp', glide(1400, 450, 0.25), 0.7] });
  } },
  'shot-sniper': { dur: 0.7, drive: 1.8, hp: 110, make(o) {
    const k = rr(0.95, 1.05);
    click(o, 0, 4200, 0.0015, 1);
    noise(o, 0, 0.18, perc(0.0006, 0.032), { amp: 1.2, filt: ['bp', glide(3300 * k, 1100, 0.08), 0.8] });
    thump(o, 0, 260 * k, 110, 0.05, 0.75);
    noise(o, 0.01, 0.65, perc(0.01, 0.16), { amp: 0.35, filt: ['lp', glide(1600, 380, 0.5), 0.7] });
    noise(o, 0.095, 0.2, perc(0.002, 0.04), { amp: 0.22, filt: ['bp', 1400, 0.8] }); // slap back
  } },
  'bullet-hit': { dur: 0.12, drive: 1.4, make(o) {
    noise(o, 0, 0.1, perc(0.0008, 0.017), { amp: 1, filt: ['lp', rr(1500, 2200), 0.8] });
    thump(o, 0, rr(300, 360), 140, 0.025, 0.7);
    click(o, 0, 3200, 0.0015, 0.35);
  } },
  ricochet: { dur: 0.5, make(o) {
    const f = rr(1500, 2200);
    click(o, 0, 2800, 0.002, 0.7);
    tone(o, 0.004, 0.48, glide(f, f * 0.68, 0.42), perc(0.003, 0.11), { amp: 0.6, vib: 0.018, vibRate: 32 });
    tone(o, 0.004, 0.3, glide(f * 1.5, f, 0.3), perc(0.003, 0.05), { amp: 0.15 });
  } },
  'hit-solid': { dur: 0.16, make(o) { wood(o, 0, rr(720, 900), 0.028, 1); } },

  // --- bows and throws
  bow: { dur: 0.36, make(o) {
    pluck(o, 0, rr(170, 210), 0.34, { amp: 1, damp: 0.993, bright: 0.5 });
    whoosh(o, 0.01, 0.16, 1700, 1200, 600, 0.35);
  } },
  'bow-draw': { dur: 0.42, make(o) {
    const d = 0.42;
    noise(o, 0, d, ar(0.05, 0.08, d), { amp: 0.9, filt: ['bp', glide(800, 1300, d), 6], am: (t) => (Math.sin(TAU * (28 * t + 14 * t * t)) > 0.3 ? 1 : 0.25) });
  } },
  'arrow-hit': { dur: 0.22, make(o) {
    noise(o, 0, 0.06, perc(0.0008, 0.012), { amp: 0.9, filt: ['bp', 900, 1.5] });
    wood(o, 0, rr(380, 450), 0.04, 0.9);
    tone(o, 0.01, 0.2, rr(240, 280), perc(0.004, 0.06), { amp: 0.25, filt: ['lp', 2000], vib: 0.04, vibRate: 24 });
  } },
  throw: { dur: 0.3, make(o) { whoosh(o, 0, rr(0.24, 0.29), 500, rr(1400, 1800), 700, 1); } },
  'shuriken-throw': { dur: 0.32, make(o) {
    whoosh(o, 0, 0.17, 900, 2400, 1200, 0.9, 1.8);
    modal(o, 0.01, [[3150, 0.07, 0.4], [4420, 0.05, 0.28], [5600, 0.035, 0.15]], { k: rr(0.92, 1.08), amp: 0.5 });
  } },
  'grenade-pin': { dur: 0.2, make(o) {
    modal(o, 0, [[2800, 0.018, 1], [4100, 0.01, 0.5]], { k: rr(0.95, 1.05) });
    modal(o, 0.065, [[1900, 0.05, 0.6], [3050, 0.025, 0.3]], { k: rr(0.95, 1.05) });
  } },
  explosion: { dur: 1.3, drive: 2.2, hp: 105, make(o) {
    const k = rr(0.92, 1.08);
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.9, filt: ['bp', 1800 * k, 0.7] });               // crack
    thump(o, 0, 210 * k, 112, 0.1, 1.1);                                                          // boom body
    thump(o, 0, 380 * k, 160, 0.05, 0.35);                                                        // its overtone (phones)
    noise(o, 0, 1.2, perc(0.004, 0.32), { amp: 1.1, color: 'brown', filt: ['lp', glide(3600, 320, 0.8), 0.8] }); // roar
    noise(o, 0.02, 0.5, perc(0.01, 0.12), { amp: 0.35, filt: ['bp', 900, 0.8] });
    crackle(o, 0.06, 1.1, (t) => 70 * Math.exp(-t / 0.35), 1, { amp: 0.3, filt: ['bp', 2400, 1] });  // debris
  } },
  'grenade-bounce': { dur: 0.16, make(o) {
    metal(o, 0, rr(500, 560), 0.035, 1);
    noise(o, 0, 0.04, perc(0.0006, 0.006), { amp: 0.5, filt: ['lp', 2500] });
  } },

  // --- magic
  raise: { dur: 1.05, make(o) {
    const d = 1.0;
    voice(o, 0, d, glide(150, 320, d), ar(0.3, 0.35, d), { formants: VOW.u, amp: 0.7, breath: 0.15, vib: 0.02 });
    voice(o, 0.02, d, glide(225, 480, d), ar(0.32, 0.35, d), { formants: VOW.o, amp: 0.5, breath: 0.15, vib: 0.02, vibRate: 4.7 });
    for (let k = 0; k < 6; k++) bell(o, 0.35 + rnd() * 0.55, rr(1300, 2400), 0.12, 0.12);
  } },
  teleport: { dur: 0.48, make(o) {
    tone(o, 0, 0.42, glide(280, 1600, 0.3), ar(0.01, 0.15, 0.42), { amp: 0.8, vib: 0.06, vibRate: 18 });
    for (let k = 0; k < 4; k++) bell(o, 0.08 + k * 0.07, rr(2300, 3200), 0.05, 0.25);
  } },
  spell: { dur: 0.7, make(o) {
    const k = rr(0.94, 1.06), notes = [880, 1109, 1319, 1760];
    notes.forEach((f, i) => bell(o, i * 0.06, f * k, 0.22, 0.8));
    noise(o, 0, 0.6, hump(0.6, 2), { amp: 0.08, filt: [['hp', 4000], ['lp', 7000]] });
  } },
  curse: { dur: 0.85, make(o) {
    const d = 0.8, k = rr(0.95, 1.05);
    tone(o, 0, d, glide(420 * k, 170 * k, d), ar(0.03, 0.3, d), { w: 'tri', amp: 0.7, vib: 0.05, vibRate: 7, filt: ['lp', 1600] });
    tone(o, 0, d, glide(428 * k, 166 * k, d), ar(0.03, 0.3, d), { w: 'saw', amp: 0.25, vib: 0.05, vibRate: 6.3, filt: ['lp', 1100] });
  } },
  lightning: { dur: 0.5, drive: 1.6, make(o) {
    noise(o, 0, 0.05, perc(0.0004, 0.009), { amp: 1.1, filt: ['hp', 1200] });
    tone(o, 0, 0.32, rr(85, 100), perc(0.002, 0.1), { w: 'saw', amp: 0.6, filt: ['bp', 1700, 0.8] });
    crackle(o, 0, 0.45, (t) => 900 * Math.exp(-t / 0.12), perc(0.001, 0.12), { amp: 0.8, filt: ['bp', 3000, 0.9] });
  } },
  thunder: { dur: 1.8, hp: 110, make(o) {
    noise(o, 0, 0.12, perc(0.002, 0.03), { amp: 0.6, filt: ['bp', 1200, 0.8] });
    let s = 0, target = 0;
    noise(o, 0.02, 1.75, (t) => (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.65), {
      amp: 1.2, color: 'brown', filt: [['lp', 650], ['hp', 140]],
      am: (t) => { if (Math.floor(t * SR) % 600 === 0) target = 0.35 + rnd(); s += 0.0012 * (target - s); return s; },
    });
  } },
  'lightning-water': null, // OG `from: "lightning"`: uses lightning's sounds (rules.js)

  // --- mines, ui, painting
  'mine-beep': { dur: 0.2, make(o) {
    const f = rr(1700, 1800);
    tone(o, 0, 0.055, f, ar(0.003, 0.012, 0.055), { w: 'tri', amp: 0.8, filt: ['lp', 4000] });
    tone(o, 0.09, 0.055, f, ar(0.003, 0.012, 0.055), { w: 'tri', amp: 0.8, filt: ['lp', 4000] });
  } },
  'mine-ping': { dur: 0.3, make(o) { bell(o, 0, rr(2100, 2300), 0.06, 1); } },
  ui: { dur: 0.1, make(o) {
    const k = rr(0.95, 1.05);
    tone(o, 0, 0.09, glide(1150 * k, 720 * k, 0.03), perc(0.0015, 0.018), { amp: 1 });
    tone(o, 0, 0.05, 2300, perc(0.001, 0.008), { amp: 0.18 });
  } },
  win: { dur: 1.7, make(o) {
    const n = [523.25, 659.25, 783.99];
    n.forEach((f, i) => { tone(o, i * 0.12, 0.35, f, perc(0.005, 0.1), { w: 'tri', amp: 0.55 }); bell(o, i * 0.12, f * 2, 0.1, 0.2); });
    const t = 0.38, chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f) => { tone(o, t, 1.3, f, (u) => Math.min(1, u / 0.01) * Math.exp(-u / 0.55), { w: 'tri', amp: 0.4, vib: 0.006, vibRate: 5 }); });
    bell(o, t, 2093, 0.4, 0.25);
    for (let k = 0; k < 5; k++) bell(o, t + 0.05 + k * 0.08, rr(2600, 3600), 0.08, 0.1);
  } },
  'place-soldier': { dur: 0.07, make(o) { tone(o, 0, 0.06, glide(640, 470, 0.02), perc(0.001, 0.014), { amp: 1 }); click(o, 0, 2500, 0.0015, 0.3); } },
  'place-roman': { dur: 0.09, make(o) { metal(o, 0, rr(500, 540), 0.022, 1); } },
  'place-archer': { dur: 0.14, make(o) { pluck(o, 0, rr(320, 350), 0.13, { damp: 0.99, bright: 0.4 }); } },
  'place-mage': { dur: 0.16, make(o) { bell(o, 0, rr(1450, 1550), 0.045, 1); } },
  'place-zombie': { dur: 0.13, make(o) {
    noise(o, 0, 0.1, perc(0.003, 0.025), { amp: 0.8, filt: ['bp', glide(500, 900, 0.05), 4] });
    thump(o, 0, 220, 140, 0.03, 0.6);
  } },
  'place-tree': { dur: 0.13, make(o) {
    wood(o, 0, rr(290, 320), 0.035, 1);
    noise(o, 0.005, 0.08, perc(0.004, 0.02), { amp: 0.25, filt: ['bp', 3200, 0.8] });
  } },

  // --- fire and water
  'flame-start': { dur: 0.6, hp: 120, make(o) {
    noise(o, 0, 0.6, lin(0, 0, 0.12, 1, 0.3, 0.8, 0.6, 0.75), { amp: 1, color: 'pink', filt: ['lp', pts(0, 300, 0.25, 2600, 0.6, 1300), 0.8] });
    noise(o, 0, 0.6, lin(0, 0, 0.1, 1, 0.6, 0.7), { amp: 0.5, filt: ['bp', 300, 1] });
    crackle(o, 0.1, 0.5, 25, 1, { amp: 0.3, filt: ['bp', 2500, 1] });
  } },
  'flame-loop': { dur: 2.0, loop: true, hp: 120, make(o) {
    const d = o.length / SR;
    noise(o, 0, d, 1, { amp: 1, color: 'pink', filt: ['lp', 1150, 0.7], am: (t) => 0.85 + 0.15 * Math.sin(TAU * 7 * t) * Math.sin(TAU * 1.5 * t) });
    noise(o, 0, d, 1, { amp: 0.45, filt: ['bp', 380, 1] });
    crackle(o, 0, d, 24, 1, { amp: 0.4, filt: ['bp', 2600, 1.1] });
  } },
  flame: { dur: 0.42, make(o) {
    noise(o, 0, 0.42, hump(0.42, 1.1), { amp: 1, color: 'pink', filt: ['lp', pts(0, 600, 0.15, 2400, 0.42, 1100), 0.8] });
    noise(o, 0, 0.42, hump(0.42, 1), { amp: 0.4, filt: ['bp', 350, 1] });
    crackle(o, 0.05, 0.35, 30, 1, { amp: 0.3 });
  } },
  ignite: { dur: 0.36, make(o) {
    noise(o, 0, 0.3, perc(0.025, 0.09), { amp: 1, filt: ['bp', glide(400, 2500, 0.08), 1.2] });
    crackle(o, 0.04, 0.32, 45, perc(0.01, 0.12), { amp: 0.5 });
  } },
  steam: { dur: 0.6, make(o) {
    noise(o, 0, 0.6, ar(0.04, 0.4, 0.6), { amp: 1, filt: [['hp', 2400], ['lp', 5200]], am: (t) => 0.8 + 0.2 * Math.sin(TAU * 11 * t) });
  } },
  splash: { dur: 0.46, make(o) {
    noise(o, 0, 0.3, perc(0.003, 0.07), { amp: 1, filt: ['bp', glide(2500, 900, 0.15), 0.7] });
    noise(o, 0.01, 0.4, hump(0.35, 1.5), { amp: 0.4, filt: ['lp', 1500] });
    bubbles(o, 0.03, 0.3, 5, { amp: 0.25 });
  } },
  'splash-big': { dur: 0.95, hp: 80, make(o) {
    noise(o, 0, 0.7, perc(0.004, 0.18), { amp: 1, filt: ['lp', glide(3200, 600, 0.4), 0.7] });
    thump(o, 0, 190, 95, 0.06, 0.6);
    noise(o, 0.05, 0.85, hump(0.8, 1.5), { amp: 0.35, filt: ['bp', 1100, 0.7] });
    bubbles(o, 0.06, 0.75, 11, { amp: 0.22, lo: 400, hi: 1000 });
  } },
  wade: { dur: 0.3, make(o) {
    noise(o, 0, 0.28, hump(0.26, 1.3), { amp: 1, filt: ['bp', glide(600, 1150, 0.2), 1.2] });
    bubbles(o, 0.04, 0.2, 3, { amp: 0.3 });
  } },
  flop: { dur: 0.16, make(o) {
    noise(o, 0, 0.08, perc(0.0008, 0.016), { amp: 1, filt: ['bp', 1500, 1] });
    noise(o, 0, 0.12, perc(0.002, 0.035), { amp: 0.6, filt: ['lp', 650] });
    thump(o, 0, 240, 160, 0.02, 0.4);
  } },

  // --- ice
  'ice-crack': { dur: 0.26, make(o) {
    const n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) noise(o, rnd() * 0.06, 0.03, perc(0.0002, 0.003), { amp: rr(0.6, 1), filt: ['bp', rr(3000, 4500), 1.4] });
    modal(o, 0, [[2600, 0.05, 0.45], [4100, 0.03, 0.25], [1350, 0.04, 0.2]], { k: rr(0.9, 1.1) });
    tone(o, 0, 0.1, glide(420, 300, 0.08), perc(0.002, 0.025), { amp: 0.3 });
  } },
  'ice-break': { dur: 0.95, make(o) {
    noise(o, 0, 0.3, perc(0.002, 0.05), { amp: 1, filt: ['bp', 3000, 0.8] });
    thump(o, 0, 220, 110, 0.04, 0.5);
    crackle(o, 0, 0.3, 300, perc(0.002, 0.08), { amp: 0.5, filt: ['bp', 2000, 1] });
    for (let k = 0; k < 18; k++) { const t = Math.pow(rnd(), 1.6) * 0.65; modal(o, t, [[rr(2000, 5200), rr(0.03, 0.08), 1]], { amp: rr(0.1, 0.35) * (1 - t) }); }
  } },
  freeze: null, // OG `from: "ice-crack"`

  // --- strikes
  blade: { dur: 0.42, make(o) {
    whoosh(o, 0, 0.12, 3000, 2200, 1200, 0.55, 1.2);
    metal(o, 0.05, rr(2350, 2600), 0.14, 0.5);
    modal(o, 0.05, [[1240, 0.1, 0.3]]);
    click(o, 0.05, 3000, 0.002, 0.5);
  } },
  spear: { dur: 0.26, make(o) {
    whoosh(o, 0, 0.1, 1200, 2200, 1500, 0.7, 1.3);
    wood(o, 0.08, rr(650, 760), 0.03, 0.7);
    noise(o, 0.08, 0.08, perc(0.001, 0.015), { amp: 0.6, filt: ['lp', 1400] });
  } },
  punch: { dur: 0.16, drive: 2, make(o) {
    noise(o, 0, 0.1, perc(0.0008, 0.022), { amp: 1.1, filt: ['lp', rr(1800, 2300), 0.8] });
    thump(o, 0, rr(240, 270), 120, 0.03, 0.8);
  } },
  club: { dur: 0.24, drive: 1.3, make(o) {
    wood(o, 0, rr(400, 450), 0.055, 1);
    thump(o, 0, 190, 100, 0.04, 0.7);
    noise(o, 0, 0.08, perc(0.001, 0.02), { amp: 0.5, filt: ['lp', 1500] });
  } },
  smash: { dur: 0.62, drive: 1.8, hp: 110, make(o) {
    thump(o, 0, 190, 95, 0.09, 1);
    noise(o, 0, 0.5, perc(0.002, 0.13), { amp: 0.9, filt: ['lp', glide(3000, 400, 0.3)] });
    crackle(o, 0.04, 0.5, (t) => 90 * Math.exp(-t / 0.2), 1, { amp: 0.35, filt: ['bp', 2000, 1] });
  } },
  'ape-smash': { dur: 0.42, drive: 1.6, hp: 110, make(o) {
    thump(o, 0, 200, 100, 0.06, 1);
    noise(o, 0, 0.3, perc(0.002, 0.06), { amp: 0.8, filt: ['lp', 1500] });
    crackle(o, 0.02, 0.3, 50, perc(0.01, 0.1), { amp: 0.25, filt: ['bp', 1800, 1] });
  } },
  trample: { dur: 0.52, drive: 1.5, hp: 110, make(o) {
    [0, 0.11, 0.2].forEach((t, i) => { thump(o, t, 195 - i * 10, 100, 0.04, 1 - i * 0.2); noise(o, t, 0.12, perc(0.002, 0.03), { amp: 0.6 - i * 0.12, filt: ['lp', 850] }); });
    noise(o, 0.05, 0.45, hump(0.45, 1.5), { amp: 0.15, filt: ['bp', 1400, 0.8] });
  } },
  block: { dur: 0.32, make(o) {
    metal(o, 0, rr(460, 500), 0.07, 0.8);
    noise(o, 0, 0.05, perc(0.0006, 0.008), { amp: 0.6, filt: ['lp', 2500] });
    thump(o, 0, 210, 140, 0.025, 0.5);
  } },
  death: { dur: 0.36, make(o) {
    noise(o, 0, 0.12, perc(0.002, 0.035), { amp: 0.7, filt: ['lp', 800] });
    tone(o, 0, 0.3, glide(rr(480, 560), 180, 0.2), perc(0.005, 0.075), { amp: 0.6, w: 'tri', filt: ['lp', 1800] });
    noise(o, 0.01, 0.24, hump(0.22, 1.2), { amp: 0.28, filt: ['bp', 1200, 1] });
  } },
  'zombie-bite': { dur: 0.3, make(o) {
    crackle(o, 0, 0.2, 320, perc(0.002, 0.05), { amp: 0.9, filt: ['bp', 1500, 1] });
    noise(o, 0, 0.25, perc(0.004, 0.06), { amp: 0.6, filt: ['bp', (t) => 700 + 300 * Math.sin(TAU * 25 * t), 3] });
    thump(o, 0, 170, 120, 0.03, 0.4);
  } },
  'bite-big': { dur: 0.42, drive: 1.4, hp: 110, make(o) {
    [0, 0.13].forEach((t, i) => {
      const g = i ? 0.6 : 1;
      click(o, t, 1800, 0.002, 0.6 * g);
      crackle(o, t, 0.15, 260, perc(0.002, 0.04), { amp: 0.8 * g, filt: ['bp', 950, 1] });
      thump(o, t, 170, 105, 0.035, 0.7 * g);
    });
  } },
  'bite-small': { dur: 0.06, make(o) {
    noise(o, 0, 0.04, perc(0.0005, 0.007), { amp: 1, filt: ['bp', 2500, 1.2] });
    modal(o, 0, [[2200, 0.01, 0.5]], { k: rr(0.9, 1.1) });
  } },
  'gator-bite': { dur: 0.3, drive: 1.5, hp: 110, make(o) {
    noise(o, 0, 0.03, perc(0.0004, 0.005), { amp: 1.1, filt: ['hp', 1200] });
    thump(o, 0, 220, 110, 0.04, 0.8);
    crackle(o, 0.01, 0.16, 220, perc(0.002, 0.05), { amp: 0.6, filt: ['bp', 1200, 1] });
  } },
  'cheetah-bite': { dur: 0.22, make(o) {
    click(o, 0, 2200, 0.002, 0.9);
    voice(o, 0, 0.18, glide(210, 170, 0.15), perc(0.006, 0.05), { formants: VOW.a, fs: 1.15, rough: 0.5, amp: 0.6, breath: 0.25 });
  } },
  'snake-bite': { dur: 0.25, make(o) {
    noise(o, 0, 0.12, perc(0.01, 0.04), { amp: 0.7, filt: [['hp', 2800], ['lp', 5200]] });
    click(o, 0.06, 2000, 0.002, 0.9);
    thump(o, 0.06, 260, 180, 0.015, 0.3);
  } },
  'snake-snap': { dur: 0.09, make(o) {
    noise(o, 0, 0.04, perc(0.0004, 0.005), { amp: 1, filt: ['bp', 2000, 1] });
    modal(o, 0, [[1600, 0.02, 0.6]], { k: rr(0.9, 1.1) });
  } },
  'rat-bite': { dur: 0.1, make(o) {
    crackle(o, 0, 0.06, 450, perc(0.001, 0.018), { amp: 1, filt: ['bp', 3000, 1.2] });
    click(o, 0, 3500, 0.001, 0.5);
  } },
  'piranha-bite': { dur: 0.16, make(o) {
    noise(o, 0, 0.05, perc(0.0006, 0.01), { amp: 1, filt: ['lp', 1500] });
    tone(o, 0.01, 0.1, glide(700, 1300, 0.04), perc(0.003, 0.025), { amp: 0.5 });
  } },
  slime: { dur: 0.26, make(o) {
    tone(o, 0, 0.24, glide(310, 150, 0.12), perc(0.004, 0.055), { amp: 0.8 });
    noise(o, 0, 0.22, perc(0.003, 0.05), { amp: 0.6, filt: ['bp', (t) => 600 + 250 * Math.sin(TAU * 30 * t), 3] });
  } },

  // --- slime, frog, hats, slips
  'slime-hop': { dur: 0.2, make(o) {
    tone(o, 0, 0.18, glide(230, 520, 0.1), perc(0.004, 0.05), { amp: 0.9, vib: 0.08, vibRate: 25 });
    noise(o, 0, 0.08, perc(0.002, 0.02), { amp: 0.25, filt: ['bp', 800, 2] });
  } },
  'slime-split': { dur: 0.36, make(o) {
    tone(o, 0, 0.3, glide(400, 240, 0.2), perc(0.004, 0.08), { amp: 0.6 });
    tone(o, 0.02, 0.3, glide(400, 680, 0.2), perc(0.004, 0.08), { amp: 0.5 });
    noise(o, 0, 0.3, hump(0.28, 1.2), { amp: 0.5, filt: ['bp', glide(600, 1500, 0.25), 3] });
  } },
  'slime-hit': { dur: 0.2, make(o) {
    noise(o, 0, 0.18, perc(0.003, 0.055), { amp: 1, filt: ['bp', (t) => 650 + 300 * Math.sin(TAU * 30 * t), 3] });
    thump(o, 0, 190, 120, 0.03, 0.5);
  } },
  'frog-tongue': { dur: 0.25, make(o) {
    tone(o, 0, 0.06, glide(350, 2200, 0.04), perc(0.002, 0.015), { amp: 0.8 });
    noise(o, 0.04, 0.2, hump(0.18, 1.2), { amp: 0.5, filt: ['bp', glide(1800, 600, 0.18), 4] });
  } },
  'hat-off': { dur: 0.26, make(o) {
    tone(o, 0, 0.05, glide(900, 400, 0.02), perc(0.001, 0.012), { amp: 0.8 });
    noise(o, 0, 0.03, perc(0.0006, 0.005), { amp: 0.5, filt: ['bp', 1800, 1] });
    noise(o, 0.02, 0.22, hump(0.22, 1.2), { amp: 0.4, filt: ['bp', 1200, 1.4], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 18 * t) });
  } },
  slip: { dur: 0.36, make(o) {
    tone(o, 0, 0.32, glide(380, 1500, 0.25), ar(0.01, 0.08, 0.32), { amp: 0.8, vib: 0.015, vibRate: 9 });
    noise(o, 0, 0.2, hump(0.2, 1), { amp: 0.25, filt: ['bp', 2000, 1.5] });
  } },

  // --- voices
  scream: { dur: 0.62, make(o) {
    const k = rr(0.85, 1.2), d = 0.58;
    voice(o, 0, d, pts(0, 330 * k, 0.08, 420 * k, 0.45, 310 * k, d, 260 * k), ar(0.02, 0.22, d), { formants: VOW.a, fs: 1.1, vib: 0.03, vibRate: 6.5, breath: 0.1, amp: 1 });
  } },
  grunt: { dur: 0.18, make(o) {
    const k = rr(0.85, 1.15);
    voice(o, 0, 0.17, glide(150 * k, 112 * k, 0.12), perc(0.008, 0.055), { formants: VOW.uh, breath: 0.2, rough: 0.15 });
  } },
  cough: { dur: 0.46, make(o) {
    const k = rr(0.9, 1.1);
    [0, 0.19].forEach((t, i) => {
      noise(o, t, 0.14, perc(0.004, 0.045), { amp: i ? 0.7 : 1, filt: [['bp', 1100 * k, 2.5]] });
      voice(o, t, 0.1, 190 * k, perc(0.003, 0.025), { formants: VOW.a, amp: i ? 0.35 : 0.5, breath: 0.5, rough: 0.3 });
    });
  } },
  'roman-charge': { dur: 0.85, make(o) {
    for (let k = 0; k < 3; k++) {
      const f = rr(145, 200), t0 = rr(0, 0.05), d = rr(0.65, 0.75);
      voice(o, t0, d, pts(0, f * 0.9, 0.1, f * 1.1, d, f), ar(0.04, 0.22, d), { formants: VOW.a, breath: 0.12, vib: 0.02, vibRate: rr(5, 7), amp: 0.6 });
    }
  } },
  'roman-charge-crowd': { dur: 1.35, make(o) {
    for (let k = 0; k < 9; k++) {
      const f = rr(120, 230), t0 = rr(0, 0.15), d = rr(1.0, 1.18);
      voice(o, t0, d, pts(0, f * 0.9, 0.12, f * 1.08, d, f * 0.95), ar(0.06, 0.3, d), { formants: rnd() < 0.5 ? VOW.a : VOW.o, breath: 0.15, vib: 0.02, vibRate: rr(4.5, 7), amp: 0.35 });
    }
    noise(o, 0, 1.3, hump(1.3, 0.8), { amp: 0.25, filt: ['bp', 900, 0.8] });
  } },

  // --- steps
  footstep: { dur: 0.08, make(o) { step(o, 0, 1, rr(1200, 1500)); noise(o, 0, 0.02, perc(0.0005, 0.003), { amp: 0.15, filt: ['bp', 3000, 1] }); } },
  'rat-step': { dur: 0.04, make(o) { noise(o, 0, 0.02, perc(0.0004, 0.0035), { amp: 1, filt: [['hp', 2500], ['bp', rr(3500, 4500), 1]] }); } },
  'heavy-step': { dur: 0.32, drive: 1.4, hp: 110, make(o) {
    thump(o, 0, 175, 95, 0.055, 1);
    noise(o, 0, 0.2, perc(0.002, 0.045), { amp: 0.7, filt: ['lp', 500] });
    noise(o, 0.01, 0.2, hump(0.2, 1.5), { amp: 0.1, filt: ['bp', 1200, 0.8] });
  } },
  gallop: { dur: 0.12, make(o) { wood(o, 0, rr(900, 1000), 0.024, 1); } },
  'gallop-run': { dur: 0.16, make(o) { wood(o, 0, rr(1000, 1100), 0.022, 1); wood(o, 0.055, rr(950, 1050), 0.02, 0.8); } },
  hoof: { dur: 0.1, make(o) { wood(o, 0, rr(1100, 1200), 0.02, 1); } },
  'ape-step': { dur: 0.13, make(o) {
    noise(o, 0, 0.1, perc(0.002, 0.028), { amp: 1, filt: ['lp', 600] });
    thump(o, 0, 175, 110, 0.03, 0.7);
  } },

  // --- animal calls
  'chest-beat': { dur: 0.62, make(o) {
    for (let k = 0; k < 4; k++) {
      const t = k * 0.09, f = k % 2 ? 205 : 235;
      tone(o, t, 0.25, glide(f, f * 0.78, 0.06), perc(0.001, 0.045), { amp: 1 - k * 0.08 });
      noise(o, t, 0.05, perc(0.0006, 0.012), { amp: 0.4, filt: ['lp', 900] });
    }
  } },
  gorilla: { dur: 0.72, make(o) {
    const k = rr(0.9, 1.1);
    [0, 0.3].forEach((t) => voice(o, t, 0.24, glide(215 * k, 265 * k, 0.2), hump(0.24, 0.8), { formants: VOW.u, breath: 0.12, amp: 1 }));
  } },
  gator: { dur: 0.75, make(o) {
    const d = 0.7;
    voice(o, 0, d, glide(rr(78, 88), 72, d), ar(0.05, 0.25, d), { formants: [[380, 5, 1], [820, 7, 0.4], [2000, 10, 0.1]], rough: 0.4, breath: 0.15, amp: 1, w: 'square' });
    noise(o, 0, d, ar(0.05, 0.3, d), { amp: 0.15, filt: ['bp', 600, 1], am: (t) => 0.5 + 0.5 * Math.sin(TAU * 22 * t) });
  } },
  'gator-hiss': { dur: 0.8, make(o) {
    noise(o, 0, 0.78, ar(0.05, 0.3, 0.78), { amp: 0.8, filt: [['bp', 3300, 0.8], ['lp', 6500]] });
    voice(o, 0, 0.7, 85, ar(0.08, 0.3, 0.7), { formants: [[420, 5, 1], [900, 7, 0.4], [2100, 10, 0.1]], rough: 0.45, amp: 0.4, breath: 0.2 });
  } },
  boar: { dur: 0.42, make(o) {
    [0, 0.15].forEach((t, i) => {
      voice(o, t, 0.13, glide(175, 140, 0.1), perc(0.006, 0.04), { formants: [[650, 6, 1], [1700, 9, 0.6], [2900, 12, 0.25]], rough: 0.3, breath: 0.15, amp: i ? 0.8 : 1 });
      noise(o, t, 0.06, perc(0.002, 0.015), { amp: 0.25, filt: ['bp', 1000, 1.5] });
    });
  } },
  'boar-hit': { dur: 0.26, make(o) {
    const d = 0.24;
    voice(o, 0, d, pts(0, 750, 0.06, 1000, d, 700), ar(0.01, 0.08, d), { formants: [[900, 5, 1], [1800, 8, 0.6], [2800, 10, 0.3]], vib: 0.04, vibRate: 22, rough: 0.12, amp: 1 });
  } },
  cheetah: { dur: 0.36, make(o) { const k = rr(0.92, 1.08); chirpVoice(o, 0, 1900 * k, 1400 * k, 0.09, 1); chirpVoice(o, 0.17, 1850 * k, 1350 * k, 0.09, 0.85); } },
  'cheetah-hit': { dur: 0.2, make(o) {
    voice(o, 0, 0.17, glide(900, 600, 0.14), perc(0.006, 0.05), { formants: [[1000, 5, 1], [2000, 8, 0.5], [3000, 10, 0.2]], amp: 1 });
  } },
  horse: { dur: 0.95, make(o) {
    const k = rr(0.93, 1.07), d = 0.9;
    voice(o, 0, d, pts(0, 540 * k, 0.15, 900 * k, 0.5, 700 * k, d, 430 * k), ar(0.04, 0.3, d), { formants: [[900, 5, 1], [1700, 8, 0.5], [2700, 10, 0.2]], vib: 0.05, vibRate: 9, breath: 0.15, amp: 1 });
  } },
  zombie: { dur: 1.0, make(o) {
    const k = rr(0.9, 1.1), d = 0.95;
    voice(o, 0, d, pts(0, 120 * k, 0.5, 105 * k, d, 90 * k), ar(0.15, 0.35, d), { formants: (t) => mix(VOW.u, VOW.a, Math.min(1, t / 0.6)), rough: 0.25, breath: 0.15, amp: 1 });
  } },
  giant: { dur: 0.72, drive: 1.3, make(o) {
    const d = 0.68;
    voice(o, 0, d, glide(rr(100, 110), 88, d), ar(0.03, 0.28, d), { formants: VOW.o, breath: 0.1, rough: 0.1, amp: 1 });
  } },
  'giant-hit': { dur: 0.46, drive: 1.2, make(o) {
    const d = 0.42;
    voice(o, 0, d, glide(rr(125, 135), 95, d), ar(0.01, 0.2, d), { formants: VOW.uh, breath: 0.2, rough: 0.15, amp: 1 });
  } },
  frog: { dur: 0.36, make(o) {
    const k = rr(0.92, 1.08);
    [0, 0.15].forEach((t) => tone(o, t, 0.1, 360 * k, ar(0.01, 0.03, 0.1), { w: 'square', amp: 1, filt: ['bp', 1100 * k, 2] }));
    // the croak's pulses
    for (let i = 0; i < o.length; i++) o[i] *= 0.55 + 0.45 * Math.sign(Math.sin(TAU * 28 * (i / SR)));
  } },
  rat: { dur: 0.2, make(o) { const k = rr(0.9, 1.1); chirpVoice(o, 0, 3000 * k, 3600 * k, 0.06, 1); chirpVoice(o, 0.09, 3100 * k, 3700 * k, 0.05, 0.8); } },
  drum: { dur: 0.42, hp: 90, make(o) {
    tone(o, 0, 0.4, glide(190, 140, 0.08), perc(0.002, 0.14), { amp: 1 });
    noise(o, 0, 0.08, perc(0.0008, 0.025), { amp: 0.5, filt: ['lp', 1000] });
    modal(o, 0, [[310, 0.08, 0.3]]);
  } },

  // --- trees and the dragon
  'tree-fall': { dur: 1.6, hp: 110, make(o) {
    crackle(o, 0, 0.18, 90, perc(0.003, 0.06), { amp: 0.5, filt: ['bp', 2500, 1] });
    noise(o, 0.02, 0.72, ar(0.05, 0.1, 0.72), { amp: 0.7, filt: ['bp', glide(400, 700, 0.7), 12], am: (t) => (Math.sin(TAU * (30 * t - 8 * t * t)) > 0.2 ? 1 : 0.2) });
    const c = 0.78;
    noise(o, c, 0.8, perc(0.005, 0.24), { amp: 1, filt: ['lp', glide(2500, 400, 0.5)] });
    thump(o, c, 170, 90, 0.09, 0.9);
    noise(o, c, 0.8, perc(0.01, 0.28), { amp: 0.35, filt: ['bp', 3500, 0.6] });
  } },
  'tree-uproot': { dur: 0.9, make(o) {
    crackle(o, 0, 0.7, (t) => 60 + 220 * Math.sin(Math.PI * Math.min(1, t / 0.7)), hump(0.7, 0.7), { amp: 0.8, filt: ['bp', 1500, 1] });
    noise(o, 0.05, 0.6, ar(0.05, 0.1, 0.6), { amp: 0.4, filt: ['bp', glide(500, 300, 0.6), 10], am: (t) => (Math.sin(TAU * 22 * t) > 0 ? 1 : 0.3) });
    noise(o, 0, 0.85, hump(0.85, 1.2), { amp: 0.35, filt: ['lp', 800] });
    tone(o, 0.68, 0.12, glide(500, 220, 0.04), perc(0.001, 0.02), { amp: 0.6 });
  } },
  'dragon-roar': { dur: 1.65, drive: 1.5, make(o) {
    const d = 1.6;
    const f0 = pts(0, 150, 0.3, 195, 1.2, 125, d, 100);
    voice(o, 0, d, f0, ar(0.08, 0.4, d), { formants: (t) => mix(VOW.o, VOW.a, Math.min(1, t / 0.35)), rough: 0.45, breath: 0.25, amp: 1, w: 'square' });
    voice(o, 0.01, d, (t) => f0(t) * 1.012, ar(0.08, 0.4, d), { formants: VOW.a, rough: 0.5, breath: 0.2, amp: 0.6 });
    noise(o, 0, d, hump(d, 0.8), { amp: 0.3, filt: ['bp', 900, 0.8] });
  } },
  'dragon-breath': { dur: 1.3, hp: 120, make(o) {
    const d = 1.3;
    noise(o, 0, d, ar(0.15, 0.4, d), { amp: 1, color: 'pink', filt: ['lp', 1700, 0.7], am: (t) => 0.8 + 0.2 * Math.sin(TAU * 6 * t) });
    noise(o, 0, d, ar(0.12, 0.4, d), { amp: 0.45, filt: ['bp', 320, 1] });
    crackle(o, 0.05, d - 0.1, 50, ar(0.1, 0.3, d - 0.1), { amp: 0.35 });
  } },
  'dragon-land': { dur: 0.72, drive: 1.6, hp: 110, make(o) {
    thump(o, 0, 175, 88, 0.1, 1);
    noise(o, 0, 0.6, perc(0.003, 0.17), { amp: 0.8, filt: ['lp', glide(1800, 300, 0.35)] });
    noise(o, 0.04, 0.6, hump(0.6, 1.3), { amp: 0.2, filt: ['bp', 1100, 0.8] });
  } },
  wings: { dur: 0.3, make(o) {
    noise(o, 0, 0.28, hump(0.24, 2), { amp: 1, filt: ['lp', glide(800, 380, 0.24), 0.8] });
    noise(o, 0.02, 0.2, hump(0.18, 1.5), { amp: 0.35, filt: ['bp', 260, 1.2] });
  } },
  'dragon-tail': { dur: 0.62, drive: 1.5, hp: 110, make(o) {
    whoosh(o, 0, 0.3, 400, 1200, 500, 0.8, 1.2);
    noise(o, 0.24, 0.3, perc(0.001, 0.04), { amp: 0.9, filt: ['lp', 1500] });
    thump(o, 0.24, 185, 95, 0.06, 0.9);
  } },

  // ---------------------------------------------------------------- OURS: Part 2 step 4 (Dinosaurs, Siege, Pirates)
  // --- dinosaurs
  'trex-roar': { dur: 2.0, drive: 1.7, hp: 110, make(o) {
    const d = 1.9, k = rr(0.93, 1.07);
    const f0 = pts(0, 92 * k, 0.28, 132 * k, 0.9, 122 * k, 1.5, 100 * k, d, 84 * k);
    const big = (fm) => fm.map(([f, q, g]) => [f * 0.78, q, g]); // a huge mouth: low formants
    voice(o, 0, d, f0, lin(0, 0, 0.18, 0.55, 0.32, 1, 1.4, 0.85, d, 0), { formants: (t) => big(mix(VOW.u, VOW.a, Math.min(1, t / 0.5))), rough: 0.6, breath: 0.3, amp: 1, w: 'square', vib: 0.03, vibRate: 6 });
    voice(o, 0.03, d - 0.05, (t) => f0(t) * 1.5, lin(0, 0, 0.3, 0.5, 1.3, 0.4, d - 0.05, 0), { formants: big(VOW.o), rough: 0.5, breath: 0.2, amp: 0.45 }); // a second throat, a fifth up
    let s = 0;
    noise(o, 0, d, lin(0, 0.6, 0.25, 0.8, 1.5, 0.5, d, 0), { amp: 0.35, filt: ['bp', 520, 1.2], am: (t) => { s += 0.02 * (0.55 + 0.45 * Math.sin(TAU * 27 * t) - s); return s; } }); // throat rattle
    noise(o, 0.2, 1.6, hump(1.6, 0.7), { amp: 0.22, filt: ['bp', 1400, 0.8] }); // breath
  } },
  'trex-bite': { dur: 0.55, drive: 1.6, hp: 110, make(o) {
    const k = rr(0.92, 1.08);
    click(o, 0, 1600 * k, 0.003, 0.8);
    thump(o, 0, 175 * k, 98, 0.05, 1);
    crackle(o, 0, 0.22, (t) => 420 * Math.exp(-t / 0.08), perc(0.002, 0.07), { amp: 0.9, filt: ['bp', 900 * k, 0.9] }); // crunch
    noise(o, 0, 0.12, perc(0.001, 0.025), { amp: 0.6, filt: ['lp', 1600] });
    voice(o, 0.05, 0.45, glide(118 * k, 96 * k, 0.4), ar(0.04, 0.2, 0.45), { formants: VOW.o, fs: 0.8, rough: 0.6, breath: 0.25, amp: 0.45, w: 'square' }); // growl through the teeth
  } },
  'raptor-screech': { dur: 0.52, make(o) {
    const k = rr(0.88, 1.12), d = 0.46;
    voice(o, 0.02, d, pts(0, 820 * k, 0.05, 1250 * k, 0.22, 1100 * k, d, 640 * k), ar(0.008, 0.18, d), { formants: VOW.e, fs: 1.7, rough: 0.55, breath: 0.35, vib: 0.05, vibRate: 31, amp: 1 });
    chirpVoice(o, 0, 2300 * k, 1700 * k, 0.05, 0.5); // the bark at the front
    noise(o, 0.02, d, ar(0.01, 0.2, d), { amp: 0.18, filt: [['hp', 2500], ['lp', 6000]] }); // hiss
  } },
  'raptor-bite': { dur: 0.16, make(o) {
    const k = rr(0.9, 1.1);
    click(o, 0, 2600 * k, 0.0015, 0.9);
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.9, filt: ['bp', 1700 * k, 1.1] });
    modal(o, 0.002, [[1350 * k, 0.025, 0.5], [2900 * k, 0.012, 0.3]]);
    crackle(o, 0.01, 0.08, 300, perc(0.002, 0.025), { amp: 0.4, filt: ['bp', 2200, 1] });
  } },
  'dino-bellow': { dur: 1.05, drive: 1.3, hp: 105, make(o) {
    const k = rr(0.93, 1.07), d = 0.95;
    noise(o, 0, 0.16, perc(0.01, 0.05), { amp: 0.6, filt: ['bp', 800, 1.2] }); // snort
    voice(o, 0.06, d - 0.06, pts(0, 118 * k, 0.15, 162 * k, 0.6, 150 * k, d - 0.06, 110 * k), ar(0.06, 0.3, d - 0.06), { formants: VOW.o, fs: 0.85, rough: 0.32, breath: 0.15, amp: 1, vib: 0.02, vibRate: 5 });
    voice(o, 0.08, d - 0.1, pts(0, 236 * k, 0.15, 324 * k, 0.6, 300 * k, d - 0.1, 220 * k), ar(0.08, 0.3, d - 0.1), { formants: VOW.a, fs: 0.85, rough: 0.2, amp: 0.25 });
  } },
  'longneck-bellow': { dur: 1.8, hp: 105, make(o) {
    const k = rr(0.94, 1.06), d = 1.7;
    const f0 = pts(0, 122 * k, 0.55, 158 * k, 1.25, 148 * k, d, 126 * k);
    voice(o, 0, d, f0, lin(0, 0, 0.35, 1, 1.3, 0.85, d, 0), { formants: (t) => mix(VOW.u, VOW.o, Math.min(1, t / 0.9)), fs: 0.8, breath: 0.18, rough: 0.06, vib: 0.015, vibRate: 4.5, amp: 1 });
    voice(o, 0.02, d - 0.02, (t) => f0(t) * 2.005, lin(0, 0, 0.45, 0.6, 1.3, 0.5, d - 0.02, 0), { formants: VOW.o, fs: 0.8, breath: 0.1, amp: 0.3 }); // the long neck rings
    noise(o, 0, d, hump(d, 1), { amp: 0.14, filt: ['bp', 600, 1] }); // breath
  } },
  'stomp-boom': { dur: 1.2, drive: 2.0, hp: 110, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 200 * k, 106, 0.12, 1.2);
    thump(o, 0, 360 * k, 165, 0.06, 0.45);
    noise(o, 0, 0.05, perc(0.0008, 0.01), { amp: 0.5, filt: ['bp', 900, 0.8] }); // foot meets ground
    noise(o, 0, 1.1, perc(0.006, 0.28), { amp: 1, color: 'brown', filt: ['lp', glide(2200, 300, 0.7), 0.8] }); // rumble
    crackle(o, 0.03, 0.9, (t) => 110 * Math.exp(-t / 0.25), 1, { amp: 0.32, filt: ['bp', 1800, 1] }); // the ground cracks, pebbles jump
  } },
  spit: { dur: 0.34, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.13, hump(0.13, 1.2), { amp: 0.7, filt: ['bp', 2200 * k, 2], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 60 * t) }); // hawk
    noise(o, 0.12, 0.08, perc(0.001, 0.014), { amp: 1, filt: ['bp', 1300 * k, 1.2] }); // "ptoo"
    tone(o, 0.12, 0.1, glide(750 * k, 280 * k, 0.05), perc(0.002, 0.03), { amp: 0.6 });
    bubbles(o, 0.13, 0.12, 2, { amp: 0.25, lo: 900, hi: 1600 });
  } },
  'spit-splat': { dur: 0.3, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.16, perc(0.001, 0.035), { amp: 1, filt: ['lp', 1700 * k, 0.9], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 45 * t) });
    tone(o, 0, 0.12, glide(420 * k, 190, 0.06), perc(0.002, 0.03), { amp: 0.6 });
    crackle(o, 0.01, 0.15, 260, perc(0.004, 0.05), { amp: 0.4, filt: ['bp', 1300, 1.3] }); // squelch
    bubbles(o, 0.02, 0.2, 3, { amp: 0.2, lo: 700, hi: 1400 });
  } },
  'tail-swipe': { dur: 0.62, drive: 1.5, hp: 110, make(o) {
    const k = rr(0.92, 1.08), t = 0.27;
    whoosh(o, 0, 0.32, 320 * k, 950 * k, 380 * k, 0.9, 1.1);
    noise(o, t, 0.12, perc(0.0008, 0.024), { amp: 1, filt: ['lp', 1900, 0.8] }); // thwack
    thump(o, t, 205 * k, 112, 0.045, 0.85);
    modal(o, t, [[1150 * k, 0.03, 0.35], [1720 * k, 0.02, 0.25]]); // the spikes clack
    modal(o, t + 0.04, [[1240 * k, 0.025, 0.25], [1900 * k, 0.015, 0.15]]);
  } },
  'club-tail': { dur: 0.68, drive: 1.7, hp: 110, make(o) {
    const k = rr(0.92, 1.08), t = 0.3;
    whoosh(o, 0, 0.34, 260 * k, 760 * k, 330 * k, 1, 1.0);
    click(o, t, 2300, 0.002, 0.8);
    modal(o, t, [[720 * k, 0.055, 0.8], [1680 * k, 0.03, 0.4], [2650 * k, 0.018, 0.2]]); // the bone club
    thump(o, t, 190 * k, 100, 0.055, 1);
    noise(o, t, 0.12, perc(0.001, 0.03), { amp: 0.7, filt: ['lp', 1600] });
  } },
  'ptero-dive': { dur: 0.8, make(o) {
    const k = rr(0.92, 1.08);
    noise(o, 0, 0.14, hump(0.14, 1.6), { amp: 0.6, filt: ['lp', 1100, 0.8] }); // one flap to tip over
    noise(o, 0.08, 0.66, hump(0.66, 1.3), { amp: 1, filt: ['bp', pts(0, 2800 * k, 0.4, 1300 * k, 0.66, 650 * k), 1.6] }); // the dive: a falling whoosh
    voice(o, 0.06, 0.34, pts(0, 1250 * k, 0.07, 1550 * k, 0.34, 950 * k), ar(0.01, 0.15, 0.34), { formants: VOW.a, fs: 1.9, rough: 0.45, breath: 0.3, amp: 0.55, vib: 0.04, vibRate: 24 }); // "kreee"
  } },
  'ptero-flap': { dur: 0.28, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.24, hump(0.2, 2), { amp: 1, filt: ['lp', glide(1600 * k, 600, 0.2), 0.9] });
    noise(o, 0.01, 0.12, perc(0.002, 0.03), { amp: 0.4, filt: ['bp', 700 * k, 1.4] }); // the leather snaps
  } },

  // --- siege
  'ram-hit': { dur: 0.85, drive: 1.9, hp: 105, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 180 * k, 98, 0.09, 1.2);
    noise(o, 0, 0.1, perc(0.0008, 0.02), { amp: 0.9, filt: ['lp', 1500, 0.8] });
    modal(o, 0, [[245 * k, 0.11, 0.7], [395 * k, 0.07, 0.45], [610 * k, 0.04, 0.3], [1230 * k, 0.02, 0.2]]); // the log rings
    click(o, 0, 1400, 0.003, 0.5);
    noise(o, 0.02, 0.7, perc(0.01, 0.18), { amp: 0.35, color: 'brown', filt: ['lp', 700] });
  } },
  'wall-crumble': { dur: 1.0, hp: 110, make(o) {
    thump(o, 0, 210, 125, 0.035, 0.6);
    crackle(o, 0, 0.9, (t) => 220 * Math.exp(-t / 0.22), lin(0, 1, 0.9, 0.1), { amp: 0.7, filt: ['bp', 1700, 0.9] });
    for (let j = 0; j < 12; j++) { const t = Math.pow(rnd(), 1.5) * 0.75; modal(o, t, [[rr(700, 1700), rr(0.02, 0.045), 1], [rr(1800, 3200), 0.015, 0.4]], { amp: rr(0.15, 0.4) * (1 - t) }); } // bricks
    noise(o, 0.02, 0.9, hump(0.9, 0.9), { amp: 0.3, filt: ['lp', 900] }); // dust
  } },
  'wood-creak': { dur: 0.72, make(o) {
    const d = 0.66, r0 = rr(90, 130), f = rr(700, 1000);
    creak(o, 0.02, d, pts(0, r0, 0.3, r0 * rr(1.3, 1.7), d, r0 * rr(0.75, 1)), ar(0.08, 0.2, d), { f: (t) => f * (1 + 0.15 * t), q: 10 });
  } },
  'wood-hit': { dur: 0.2, make(o) {
    wood(o, 0, rr(420, 560), 0.04, 1);
    crackle(o, 0, 0.06, 500, perc(0.001, 0.015), { amp: 0.35, filt: ['bp', 2600, 1] }); // splinters
    noise(o, 0, 0.05, perc(0.0008, 0.012), { amp: 0.4, filt: ['lp', 1500] });
  } },
  'wood-break': { dur: 1.35, drive: 1.6, hp: 105, make(o) {
    const k = rr(0.92, 1.08), c = 0.22;
    creak(o, 0, 0.24, glide(60, 140, 0.22), ar(0.05, 0.03, 0.24), { f: 520 * k, q: 4, amp: 0.8 }); // the groan before it goes
    noise(o, c, 0.06, perc(0.0006, 0.01), { amp: 1, filt: ['bp', 2400, 0.8] }); // crack
    crackle(o, c, 0.4, (t) => 600 * Math.exp(-t / 0.06), 1, { amp: 0.8, filt: ['bp', 2000, 1] }); // splinters
    thump(o, c + 0.05, 175 * k, 98, 0.08, 1); // it comes down
    noise(o, c + 0.05, 0.7, perc(0.005, 0.18), { amp: 0.6, filt: ['lp', glide(2000, 350, 0.4)] });
    for (let j = 0; j < 7; j++) { const t = c + 0.12 + Math.pow(rnd(), 1.3) * 0.8; wood(o, t, rr(240, 520), rr(0.03, 0.06), rr(0.25, 0.55) * Math.max(0.2, 1.3 - (t - c))); } // planks fall
  } },
  'catapult-fire': { dur: 0.9, drive: 1.4, hp: 105, make(o) {
    const k = rr(0.93, 1.07), t = 0.36;
    creak(o, 0, 0.1, 140, ar(0.02, 0.02, 0.1), { f: 900, q: 5, amp: 0.6 }); // the rope strains
    click(o, 0.09, 2600, 0.003, 0.9); // let go
    whoosh(o, 0.1, 0.3, 300 * k, 1000 * k, 450 * k, 0.8, 1.1); // the arm swings
    thump(o, t, 170 * k, 98, 0.07, 1.1); // and hits the crossbar
    modal(o, t, [[230 * k, 0.08, 0.7], [410 * k, 0.05, 0.4], [880 * k, 0.025, 0.2]]);
    noise(o, t, 0.1, perc(0.001, 0.025), { amp: 0.7, filt: ['lp', 1300] });
  } },
  'boulder-land': { dur: 1.7, drive: 1.6, hp: 110, make(o) {
    const k = rr(0.93, 1.07), roll = 1.4;
    thump(o, 0, 185 * k, 102, 0.1, 1.2);
    noise(o, 0, 0.5, perc(0.002, 0.11), { amp: 0.9, filt: ['lp', glide(2400, 350, 0.3), 0.8] }); // dirt flies
    crackle(o, 0, 0.3, (t) => 160 * Math.exp(-t / 0.1), 1, { amp: 0.35, filt: ['bp', 2200, 1] });
    // then it rolls on, slowing (~1.3 s): a low grinding rumble that bumps along
    let s = 0.5, target = 0.5;
    noise(o, 0.1, 1.5, (t) => Math.min(1, t / 0.08) * Math.max(0, 1 - t / roll) ** 1.3, { amp: 0.75, color: 'brown', filt: [['lp', 650], ['hp', 120]],
      am: (t) => { if (Math.floor(t * SR) % 1100 === 0) target = 0.3 + 0.7 * rnd(); s += 0.003 * (target - s); return s; } });
    crackle(o, 0.1, roll, (t) => 70 * Math.max(0.1, 1 - t / roll), (t) => Math.max(0, 1 - t / roll), { amp: 0.3, filt: ['bp', 1300, 1] }); // grit
  } },
  'stone-knock': { dur: 0.26, make(o) {
    const k = rr(0.9, 1.1);
    modal(o, 0, [[560 * k, 0.045, 1], [1380 * k, 0.025, 0.45], [2700 * k, 0.012, 0.25]]);
    noise(o, 0, 0.05, perc(0.0006, 0.009), { amp: 0.6, filt: ['lp', 2200] });
    thump(o, 0, 230 * k, 150, 0.02, 0.5);
  } },
  'ballista-twang': { dur: 0.95, hp: 105, make(o) {
    const k = rr(0.95, 1.05);
    pluck(o, 0, 128 * k, 0.9, { amp: 1, damp: 0.993, bright: 0.75 }); // the big bowstring
    pluck(o, 0.003, 193 * k, 0.6, { amp: 0.35, damp: 0.99, bright: 0.6 });
    thump(o, 0, 200 * k, 112, 0.04, 0.9); // the frame kicks
    wood(o, 0.005, 330 * k, 0.06, 0.6);
    whoosh(o, 0.01, 0.22, 1500, 1000, 500, 0.4, 1.4); // the bolt leaves
  } },
  'bigbolt-thock': { dur: 0.48, make(o) {
    const k = rr(0.9, 1.1);
    wood(o, 0, 290 * k, 0.07, 1);
    thump(o, 0, 205 * k, 120, 0.035, 0.8);
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.7, filt: ['bp', 950, 1.2] });
    tone(o, 0.01, 0.4, 175 * k, perc(0.004, 0.11), { amp: 0.3, filt: ['lp', 1500], vib: 0.05, vibRate: 22 }); // the shaft quivers
  } },
  'crossbow-shot': { dur: 0.38, make(o) {
    const k = rr(0.93, 1.07);
    modal(o, 0, [[2650 * k, 0.012, 0.6], [3950 * k, 0.008, 0.35]]); // trigger
    pluck(o, 0.008, 255 * k, 0.28, { amp: 1, damp: 0.986, bright: 0.85 }); // short stiff string
    noise(o, 0.008, 0.06, perc(0.0006, 0.01), { amp: 0.8, filt: ['lp', 2400] }); // thwack
    thump(o, 0.008, 240 * k, 140, 0.02, 0.5);
    whoosh(o, 0.015, 0.12, 1900, 1300, 700, 0.35, 1.5);
  } },
  'crossbow-crank': { dur: 1.15, make(o) {
    const n = 9 + Math.floor(rnd() * 3), d = 1.0;
    for (let j = 0; j < n; j++) {
      const t = 0.03 + (j / n) * d + rr(-0.01, 0.01), k = rr(0.94, 1.06);
      modal(o, t, [[2500 * k, 0.012, 0.8], [3700 * k, 0.008, 0.4]]); // the pawl clicks
      wood(o, t, 900 * k, 0.012, 0.35);
    }
    creak(o, 0.03, d, 45, ar(0.05, 0.1, d), { f: 1100, q: 4, amp: 0.25 }); // the windlass strains
  } },
  'pot-shatter': { dur: 0.72, make(o) {
    noise(o, 0, 0.08, perc(0.0006, 0.012), { amp: 1, filt: ['bp', 3200, 0.8] });
    thump(o, 0, 260, 170, 0.02, 0.5);
    for (let j = 0; j < 16; j++) { const t = Math.pow(rnd(), 2) * 0.32; modal(o, t, [[rr(2100, 5600), rr(0.015, 0.05), 1]], { amp: rr(0.12, 0.38) * (1 - t) }); } // pottery shards
    noise(o, 0.01, 0.22, perc(0.003, 0.05), { amp: 0.6, filt: ['lp', 1300], am: (t) => 0.65 + 0.35 * Math.sin(TAU * 38 * t) }); // the oil slops out
    bubbles(o, 0.03, 0.25, 3, { amp: 0.2, lo: 500, hi: 1000 });
  } },
  'oil-sizzle': { dur: 1.25, make(o) {
    const d = 1.2;
    noise(o, 0, d, ar(0.04, 0.7, d), { amp: 0.8, filt: [['hp', 2600], ['lp', 7000]], am: (t) => 0.75 + 0.25 * Math.sin(TAU * 13 * t + 3 * Math.sin(TAU * 2.3 * t)) });
    crackle(o, 0.02, d - 0.05, (t) => 140 * Math.exp(-t / 0.5), ar(0.02, 0.5, d - 0.05), { amp: 0.5, filt: ['bp', 3600, 1.2] }); // spits
  } },
  'bridge-slam': { dur: 0.8, drive: 1.7, hp: 105, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 185 * k, 98, 0.09, 1.2);
    noise(o, 0, 0.45, perc(0.001, 0.07), { amp: 0.9, filt: ['lp', glide(2600, 450, 0.25), 0.8] });
    modal(o, 0, [[205 * k, 0.1, 0.8], [470 * k, 0.05, 0.45], [880 * k, 0.03, 0.25]]); // the planks boom
    links(o, 0.04, 0.2, 5, { amp: 0.25 }); // the chains settle
  } },
  'chain-rattle': { dur: 0.85, make(o) {
    const d = 0.62;
    links(o, 0.02, d, 30, { amp: 0.6 });
    noise(o, 0.02, d, hump(d, 1), { amp: 0.15, filt: ['bp', 4200, 1] }); // the jingle
    metal(o, 0.66, rr(380, 440), 0.05, 0.7); // runs out: clunk
  } },

  // --- pirates
  'cannon-boom': { dur: 1.5, drive: 2.3, hp: 100, make(o) {
    const k = rr(0.93, 1.07), e = rr(0.16, 0.2);
    noise(o, 0, 0.05, perc(0.0005, 0.009), { amp: 1, filt: ['bp', 2300 * k, 0.7] }); // the crack
    thump(o, 0, 185 * k, 94, 0.13, 1.3); // BOOM
    thump(o, 0, 350 * k, 150, 0.06, 0.45);
    noise(o, 0, 1.4, perc(0.003, 0.33), { amp: 1.1, color: 'brown', filt: ['lp', glide(3200, 260, 0.9), 0.8] }); // the blast rolls away
    thump(o, e, 160 * k, 96, 0.06, 0.35); // slap back off the water and hulls
    noise(o, e, 0.4, perc(0.004, 0.08), { amp: 0.3, filt: ['lp', 900] });
  } },
  broadside: { dur: 1.9, drive: 2.1, hp: 100, make(o) {
    [0, rr(0.1, 0.14), rr(0.22, 0.28)].forEach((t, i) => { // three guns, one after another
      const k = rr(0.92, 1.08), a = 1 - 0.12 * i;
      noise(o, t, 0.05, perc(0.0005, 0.009), { amp: 0.8 * a, filt: ['bp', 2200 * k, 0.7] });
      thump(o, t, 185 * k, 94, 0.12, 1.2 * a);
      thump(o, t, 345 * k, 150, 0.05, 0.4 * a);
      noise(o, t, 1.9 - t, perc(0.003, 0.4), { amp: 0.75 * a, color: 'brown', filt: ['lp', glide(3000, 260, 1.1), 0.8] });
    });
  } },
  'ball-skip': { dur: 0.32, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.1, perc(0.0006, 0.016), { amp: 1, filt: ['bp', glide(3200 * k, 1300, 0.06), 0.8] }); // slap
    tone(o, 0.012, 0.12, glide(520 * k, 1500 * k, 0.05), perc(0.003, 0.025), { amp: 0.55 }); // plop
    noise(o, 0.01, 0.26, hump(0.24, 1.4), { amp: 0.3, filt: [['hp', 2500], ['lp', 6500]] }); // spray
  } },
  'ball-thud': { dur: 0.6, drive: 1.5, hp: 105, make(o) {
    const k = rr(0.9, 1.1);
    thump(o, 0, 205 * k, 112, 0.05, 1.1);
    noise(o, 0, 0.14, perc(0.001, 0.03), { amp: 0.8, filt: ['lp', 1000, 0.8] }); // dirt
    metal(o, 0, 330 * k, 0.03, 0.25); // iron
    noise(o, 0.05, 0.5, (t) => Math.min(1, t / 0.03) * Math.max(0, 1 - t / 0.5) ** 1.5, { amp: 0.4, color: 'brown', filt: [['lp', 700], ['hp', 130]] }); // it rolls a bit
    crackle(o, 0.05, 0.45, 70, (t) => Math.max(0, 1 - t / 0.45), { amp: 0.25, filt: ['bp', 1500, 1] });
  } },
  'ball-hit': { dur: 0.32, drive: 1.7, hp: 105, make(o) {
    const k = rr(0.9, 1.1);
    thump(o, 0, 220 * k, 110, 0.045, 1.2);
    noise(o, 0, 0.12, perc(0.0008, 0.025), { amp: 1, filt: ['lp', 1500 * k, 0.8] });
    crackle(o, 0, 0.1, 300, perc(0.002, 0.03), { amp: 0.5, filt: ['bp', 1100, 1] }); // crunch
  } },
  blunderbuss: { dur: 0.8, drive: 2.1, hp: 100, make(o) {
    const k = rr(0.94, 1.06);
    click(o, 0, 3200, 0.002, 1);
    noise(o, 0, 0.22, perc(0.0008, 0.045), { amp: 1.4, filt: ['bp', glide(2100 * k, 650, 0.12), 0.6] }); // a wide blast
    thump(o, 0, 235 * k, 108, 0.05, 0.9);
    crackle(o, 0.004, 0.12, (t) => 900 * Math.exp(-t / 0.03), 1, { amp: 0.35, filt: ['bp', 3600, 1.1] }); // the shot spreads
    noise(o, 0.01, 0.75, perc(0.01, 0.17), { amp: 0.45, filt: ['lp', glide(1300, 330, 0.5), 0.7] });
  } },
  flintlock: { dur: 0.5, drive: 1.6, make(o) {
    const k = rr(0.93, 1.07), t = rr(0.035, 0.05);
    noise(o, 0, 0.045, ar(0.002, 0.012, 0.045), { amp: 0.45, filt: [['hp', 3000], ['lp', 7500]] }); // the pan flashes
    click(o, t, 3300, 0.0018, 0.9); // then the bang
    noise(o, t, 0.14, perc(0.0008, 0.024), { amp: 1.25, filt: ['bp', glide(2300 * k, 900, 0.06), 0.8] });
    thump(o, t, 275 * k, 118, 0.03, 0.6);
    noise(o, t + 0.01, 0.4, perc(0.01, 0.08), { amp: 0.3, filt: ['lp', glide(1300, 400, 0.3), 0.7] });
  } },
  'fuse-light': { dur: 0.72, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.12, hump(0.12, 1), { amp: 0.7, filt: ['bp', 2600 * k, 1.8], am: (t) => Math.abs(Math.sin(TAU * 70 * t)) }); // the match scrapes
    noise(o, 0.11, 0.1, perc(0.003, 0.025), { amp: 0.7, filt: ['bp', glide(900, 3000, 0.05), 1.2] }); // flares
    noise(o, 0.14, 0.58, ar(0.03, 0.15, 0.58), { amp: 0.55, filt: [['hp', 3200], ['lp', 7500]], am: (t) => 0.55 + 0.45 * Math.sin(TAU * 17 * t) * Math.sin(TAU * 5.3 * t) }); // the fuse fizzes
    crackle(o, 0.14, 0.56, 110, ar(0.03, 0.15, 0.56), { amp: 0.45, filt: ['bp', 4200, 1.2], len: 0.0006 }); // sparks
  } },
  'anchor-smash': { dur: 0.72, drive: 1.6, hp: 105, make(o) {
    const k = rr(0.92, 1.08), t = 0.2;
    links(o, 0, 0.18, 7, { amp: 0.3 }); // the chain
    whoosh(o, 0, 0.24, 380 * k, 1100 * k, 520 * k, 0.75, 1.2);
    thump(o, t, 195 * k, 104, 0.06, 1.1); // iron lands
    metal(o, t, 185 * k, 0.09, 0.7);
    noise(o, t, 0.12, perc(0.001, 0.028), { amp: 0.8, filt: ['lp', 1600] });
  } },
  'chain-whoosh': { dur: 0.5, make(o) {
    const k = rr(0.9, 1.1);
    whoosh(o, 0, 0.36, 360 * k, 1050 * k, 460 * k, 1, 1.2);
    links(o, 0.04, 0.3, 10, { amp: 0.25 });
  } },
  'chain-throw': { dur: 0.62, make(o) {
    const k = rr(0.9, 1.1);
    whoosh(o, 0, 0.3, 600 * k, 1600 * k, 900 * k, 0.8, 1.4);
    links(o, 0.03, 0.5, 18, { amp: 0.45, where: (u) => Math.pow(u, 0.6), fade: 0.6 }); // the chain pays out
  } },
  'chain-yank': { dur: 0.42, make(o) {
    const k = rr(0.9, 1.1);
    modal(o, 0, [[880 * k, 0.03, 1], [1520 * k, 0.02, 0.6], [2700 * k, 0.012, 0.3]]); // goes taut
    noise(o, 0, 0.03, perc(0.0005, 0.006), { amp: 0.6, filt: ['bp', 2500, 1] });
    links(o, 0.02, 0.2, 6, { amp: 0.35 });
    whoosh(o, 0.02, 0.22, 700 * k, 1400 * k, 600 * k, 0.6, 1.3);
  } },
  'pirate-rally': { dur: 1.3, make(o) {
    const k = rr(0.9, 1.1), d = 0.85;
    const R = [[520, 6, 1], [1250, 9, 0.5], [1600, 12, 0.35]]; // an "r" (low third formant)
    voice(o, 0, d, pts(0, 135 * k, 0.1, 190 * k, 0.5, 178 * k, d, 128 * k), ar(0.03, 0.2, d), { formants: (t) => mix(VOW.a, R, Math.min(1, Math.max(0, (t - 0.3) / 0.25))), rough: 0.35, breath: 0.15, vib: 0.03, vibRate: 6, amp: 1 }); // "Yaaarr!"
    for (let i = Math.round(0.42 * SR); i < Math.round(d * SR); i++) o[i] *= 0.62 + 0.38 * Math.sin(TAU * 27 * (i / SR)); // rolled "rrr"
    for (let c = 0; c < 3; c++) { // the crew answers
      const f = rr(150, 230), t0 = rr(0.55, 0.68), dd = rr(0.32, 0.42);
      voice(o, t0, dd, pts(0, f * 0.9, 0.06, f * 1.12, dd, f), ar(0.02, 0.15, dd), { formants: VOW.e, breath: 0.15, rough: 0.2, amp: 0.38 });
    }
  } },
  'ship-creak': { dur: 1.45, hp: 110, make(o) {
    const d = 1.35, r0 = rr(30, 42), f = rr(380, 470);
    creak(o, 0.02, d, pts(0, r0, 0.6, r0 * rr(1.3, 1.6), d, r0 * 0.8), ar(0.3, 0.4, d), { f: (t) => f * (1 + 0.12 * Math.sin(TAU * 0.6 * t)), q: 8 });
    creak(o, 0.35, 0.6, rr(80, 120), hump(0.6, 1), { f: f * 2.1, q: 9, amp: 0.35 }); // a smaller timber
    noise(o, 0, d + 0.05, hump(d + 0.05, 1.2), { amp: 0.25, filt: ['bp', 600, 0.9], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 0.9 * t) }); // water slaps the hull
  } },
  'ship-sink': { dur: 3.2, hp: 105, make(o) {
    const k = rr(0.94, 1.06);
    noise(o, 0, 0.08, perc(0.0006, 0.014), { amp: 0.8, filt: ['bp', 2200, 0.8] }); // the hull cracks
    crackle(o, 0, 0.35, (t) => 400 * Math.exp(-t / 0.08), 1, { amp: 0.6, filt: ['bp', 2000, 1] });
    creak(o, 0.15, 2.2, pts(0, 26, 1.0, 16, 2.2, 11), ar(0.15, 0.6, 2.2), { f: (t) => 320 * k * (1 - 0.25 * t / 2.2), q: 4, amp: 1.1 }); // the timbers groan as she tilts
    noise(o, 0.1, 3.0, ar(0.3, 0.9, 3.0), { amp: 0.6, filt: ['bp', glide(1100, 420, 2.6), 0.9], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 3.1 * t) }); // water rushes in
    bubbles(o, 0.5, 2.5, 45, { amp: 0.35, lo: 220, hi: 700 }); // glug glug
    for (let j = 0; j < 9; j++) tone(o, 0.6 + rnd() * 2.2, 0.25, glide(rr(160, 230), rr(300, 420), 0.08), perc(0.004, 0.06), { amp: 0.5 });
    bubbles(o, 2.55, 0.5, 16, { amp: 0.4, lo: 300, hi: 900 }); // the last air
  } },

  // ---------------------------------------------------------------- OURS: Part 2 step 6 (Robots, Space, Ocean, Sports, Bugs, Bosses)
  // --- robots
  zap: { dur: 0.16, make(o) {
    const k = rr(0.9, 1.1);
    crackle(o, 0, 0.12, (t) => 1400 * Math.exp(-t / 0.04), perc(0.001, 0.05), { amp: 1, filt: ['bp', 3200 * k, 0.9], len: 0.0005 });
    tone(o, 0, 0.1, glide(1800 * k, 900 * k, 0.08), perc(0.001, 0.03), { w: 'square', amp: 0.25, filt: ['bp', 2400, 1.5] });
    noise(o, 0, 0.03, perc(0.0003, 0.004), { amp: 0.6, filt: ['hp', 2000] });
  } },
  'laser-charge': { dur: 0.45, make(o) {
    const k = rr(0.95, 1.05), d = 0.42;
    tone(o, 0, d, glide(300 * k, 2400 * k, d), lin(0, 0, 0.3, 0.8, d - 0.02, 1, d, 0), { w: 'saw', amp: 0.5, filt: ['lp', 3500], vib: 0.03, vibRate: 30 }); // the eye winds up
    tone(o, 0, d, glide(600 * k, 4800 * k, d), lin(0, 0, d - 0.02, 0.5, d, 0), { amp: 0.3 });
  } },
  'laser-fire': { dur: 0.3, drive: 1.3, make(o) {
    const k = rr(0.95, 1.05);
    tone(o, 0, 0.25, glide(2600 * k, 700 * k, 0.12), perc(0.002, 0.07), { w: 'square', amp: 0.6, filt: ['lp', 5000] }); // pew
    tone(o, 0, 0.28, 180 * k, perc(0.004, 0.12), { w: 'saw', amp: 0.5, filt: ['bp', 900, 1.2] }); // the beam bites in
    noise(o, 0, 0.05, perc(0.0005, 0.01), { amp: 0.6, filt: ['hp', 2500] });
  } },
  'laser-hum': { dur: 1.2, loop: true, make(o) { // the beam held: a buzzy hum with a whine on top, crackling where it burns
    const d = o.length / SR;
    tone(o, 0, d, (t) => 165 * (1 + 0.02 * Math.sin(TAU * 5 * t)), 1, { w: 'saw', amp: 0.6, filt: ['bp', 800, 1.2] });
    tone(o, 0, d, (t) => 1320 * (1 + 0.01 * Math.sin(TAU * 7.5 * t)), 1, { amp: 0.22 });
    noise(o, 0, d, 1, { amp: 0.25, filt: ['bp', 3000, 1], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 12.5 * t) });
    crackle(o, 0, d, 30, 1, { amp: 0.25, filt: ['bp', 3500, 1] });
  } },
  'saw-rev': { dur: 0.55, make(o) {
    const k = rr(0.95, 1.05), d = 0.52;
    tone(o, 0, d, pts(0, 90 * k, 0.3, 260 * k, d, 240 * k), ar(0.02, 0.12, d), { w: 'saw', amp: 0.7, filt: ['bp', pts(0, 900, 0.3, 2200, d, 2000), 1.4] }); // spins up
    tone(o, 0, d, pts(0, 900 * k, 0.3, 2600 * k, d, 2400 * k), ar(0.05, 0.12, d), { amp: 0.3, vib: 0.01, vibRate: 40 }); // the blade sings
    noise(o, 0, d, ar(0.05, 0.12, d), { amp: 0.25, filt: ['bp', 4000, 1] });
  } },
  'saw-loop': { dur: 1.0, loop: true, make(o) {
    const d = o.length / SR;
    tone(o, 0, d, (t) => 250 * (1 + 0.015 * Math.sin(TAU * 6 * t)), 1, { w: 'saw', amp: 0.6, filt: ['bp', 2100, 1.3] });
    tone(o, 0, d, (t) => 2500 * (1 + 0.006 * Math.sin(TAU * 9 * t)), 1, { amp: 0.25 });
    noise(o, 0, d, 1, { amp: 0.3, filt: ['bp', 4200, 1.2], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 25 * t) });
  } },
  'saw-grind': { dur: 0.22, drive: 1.4, make(o) {
    const k = rr(0.9, 1.1);
    crackle(o, 0, 0.18, 900, perc(0.002, 0.06), { amp: 0.8, filt: ['bp', 2600 * k, 1], len: 0.0007 }); // teeth rip
    tone(o, 0, 0.2, glide(2400 * k, 1600 * k, 0.15), perc(0.003, 0.06), { w: 'saw', amp: 0.35, filt: ['bp', 2500, 2] }); // the blade bogs down
    thump(o, 0, 240, 130, 0.025, 0.6);
  } },
  'magnet-hum': { dur: 1.0, loop: true, make(o) {
    const d = o.length / SR;
    tone(o, 0, d, 180, (t) => 0.75 + 0.25 * Math.sin(TAU * 4 * t), { w: 'square', amp: 0.5, filt: ['lp', 1100] }); // the coils
    tone(o, 0, d, 360.5, 1, { amp: 0.35 });
    tone(o, 0, d, 541, (t) => 0.6 + 0.4 * Math.sin(TAU * 2 * t), { amp: 0.2 });
    noise(o, 0, d, 1, { amp: 0.12, filt: ['bp', 1800, 2] });
  } },
  'magnet-clunk': { dur: 0.5, drive: 1.4, make(o) {
    const k = rr(0.93, 1.07);
    metal(o, 0, 210 * k, 0.12, 1); // CLUNK: the field grabs
    thump(o, 0, 200 * k, 110, 0.04, 0.8);
    tone(o, 0, 0.45, glide(200 * k, 600 * k, 0.4), ar(0.02, 0.1, 0.45), { w: 'square', amp: 0.25, filt: ['lp', 1500] });
  } },
  weld: { dur: 0.26, make(o) {
    const d = 0.24, f = rr(190, 210);
    noise(o, 0, d, ar(0.01, 0.08, d), { amp: 0.6, filt: [['hp', 2500], ['lp', 7500]], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 60 * t) }); // torch hiss
    crackle(o, 0, d, 260, ar(0.005, 0.08, d), { amp: 0.8, filt: ['bp', 3800, 1.2], len: 0.0005 }); // sparks
    tone(o, 0, d, f, ar(0.01, 0.08, d), { w: 'saw', amp: 0.15, filt: ['bp', 1200, 2] }); // the arc buzzes
  } },
  'dome-up': { dur: 0.62, make(o) {
    const k = rr(0.96, 1.04), d = 0.58;
    tone(o, 0, d, glide(220 * k, 880 * k, 0.4), ar(0.02, 0.25, d), { w: 'tri', amp: 0.6, vib: 0.02, vibRate: 12 });
    tone(o, 0, d, glide(331 * k, 1320 * k, 0.4), ar(0.04, 0.25, d), { amp: 0.3, vib: 0.02, vibRate: 9 });
    for (let j = 0; j < 5; j++) bell(o, 0.2 + j * 0.06, rr(2200, 3400), 0.08, 0.18); // shimmer
  } },
  'dome-down': { dur: 0.5, make(o) {
    const k = rr(0.96, 1.04), d = 0.46;
    tone(o, 0, d, glide(880 * k, 200 * k, d), ar(0.01, 0.2, d), { w: 'tri', amp: 0.6, vib: 0.03, vibRate: 14 });
    noise(o, 0, d, ar(0.01, 0.2, d), { amp: 0.1, filt: ['bp', glide(3000, 900, d), 2] });
  } },
  'dome-hit': { dur: 0.3, make(o) {
    const k = rr(0.9, 1.1);
    tone(o, 0, 0.28, glide(1400 * k, 500 * k, 0.12), perc(0.002, 0.07), { w: 'tri', amp: 0.7, vib: 0.05, vibRate: 40 }); // bwong
    bell(o, 0, 1900 * k, 0.07, 0.4);
    noise(o, 0, 0.05, perc(0.0005, 0.01), { amp: 0.4, filt: ['hp', 2500] });
  } },
  'glass-break': { dur: 0.9, make(o) {
    noise(o, 0, 0.12, perc(0.0006, 0.02), { amp: 1, filt: ['bp', 3500, 0.8] });
    thump(o, 0, 260, 170, 0.02, 0.4);
    for (let j = 0; j < 22; j++) { const t = Math.pow(rnd(), 1.8) * 0.6; modal(o, t, [[rr(2500, 6500), rr(0.02, 0.08), 1], [rr(5000, 8000), 0.015, 0.4]], { amp: rr(0.15, 0.4) * (1 - t) }); } // shards
    tone(o, 0, 0.5, glide(1200, 300, 0.4), ar(0.005, 0.2, 0.5), { w: 'tri', amp: 0.25 }); // the field dies
  } },
  'bot-beep': { dur: 0.09, make(o) { tone(o, 0, 0.07, rr(2350, 2450), ar(0.002, 0.015, 0.07), { w: 'square', amp: 0.6, filt: ['lp', 4500] }); } },
  'mech-step': { dur: 0.5, drive: 1.5, hp: 110, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 185 * k, 98, 0.06, 1.1);
    metal(o, 0, 240 * k, 0.06, 0.5); // steel foot
    noise(o, 0, 0.18, perc(0.002, 0.04), { amp: 0.6, filt: ['lp', 600] });
    noise(o, 0.03, 0.25, ar(0.02, 0.15, 0.25), { amp: 0.2, filt: [['hp', 3000], ['lp', 7000]] }); // hydraulics hiss
    tone(o, 0.02, 0.2, glide(600 * k, 900 * k, 0.18), ar(0.02, 0.08, 0.2), { w: 'saw', amp: 0.12, filt: ['bp', 900, 3] }); // servo
  } },
  'rocket-launch': { dur: 0.7, make(o) {
    const k = rr(0.92, 1.08), d = 0.65;
    noise(o, 0, 0.05, perc(0.0006, 0.01), { amp: 0.8, filt: ['bp', 1500 * k, 0.8] }); // pop out of the pod
    thump(o, 0, 240 * k, 140, 0.03, 0.5);
    noise(o, 0.01, d, (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.22), { amp: 1, color: 'pink', filt: ['bp', pts(0, 1800 * k, 0.2, 1100 * k, d, 600 * k), 0.9] }); // whoosh away
    crackle(o, 0.02, 0.4, 120, perc(0.01, 0.15), { amp: 0.3, filt: ['bp', 3000, 1] }); // the motor sputters
  } },
  'metal-clank': { dur: 0.3, make(o) {
    const k = rr(0.88, 1.12);
    metal(o, 0, 420 * k, 0.07, 1);
    modal(o, 0.004, [[1130 * k, 0.04, 0.4], [1900 * k, 0.025, 0.25]]);
    thump(o, 0, 230 * k, 140, 0.02, 0.5);
    noise(o, 0, 0.04, perc(0.0006, 0.007), { amp: 0.5, filt: ['bp', 2500, 1] });
  } },
  'metal-ping': { dur: 0.22, make(o) {
    const k = rr(0.85, 1.15);
    click(o, 0, 3500, 0.0015, 0.7);
    modal(o, 0, [[1650 * k, 0.05, 0.8], [2600 * k, 0.035, 0.5], [3900 * k, 0.02, 0.3]]);
  } },
  'scrap-crash': { dur: 1.1, drive: 1.5, hp: 105, make(o) {
    const k = rr(0.92, 1.08);
    thump(o, 0, 200 * k, 105, 0.06, 1);
    metal(o, 0, 310 * k, 0.12, 0.8);
    noise(o, 0, 0.35, perc(0.002, 0.08), { amp: 0.7, filt: ['lp', glide(4000, 800, 0.3)] });
    for (let j = 0; j < 14; j++) { const t = 0.05 + Math.pow(rnd(), 1.4) * 0.75; metal(o, t, rr(500, 1900), rr(0.02, 0.05), rr(0.15, 0.4) * (1.1 - t)); } // bolts and plates rain down
    tone(o, 0.12, 0.45, glide(900 * k, 140 * k, 0.4), ar(0.01, 0.15, 0.45), { w: 'square', amp: 0.12, filt: ['lp', 2000] }); // the power dies
    pluck(o, 0.3, rr(300, 380), 0.5, { amp: 0.25, damp: 0.996, bright: 0.3 }); // a spring
  } },
  'robot-step': { dur: 0.09, make(o) {
    const k = rr(0.9, 1.1);
    modal(o, 0, [[900 * k, 0.012, 0.6], [2100 * k, 0.008, 0.35]]);
    thump(o, 0, 230, 150, 0.012, 0.5);
    noise(o, 0, 0.05, perc(0.001, 0.01), { amp: 0.3, filt: ['lp', 1200] });
  } },

  // --- space
  'ray-shot': { dur: 0.26, make(o) {
    const k = rr(0.9, 1.1);
    tone(o, 0, 0.22, glide(2200 * k, 380 * k, 0.16), perc(0.002, 0.06), { w: 'square', amp: 0.5, filt: ['lp', 4500] }); // pew
    tone(o, 0, 0.2, glide(1100 * k, 190 * k, 0.16), perc(0.002, 0.05), { amp: 0.4 });
    noise(o, 0, 0.03, perc(0.0004, 0.006), { amp: 0.3, filt: ['hp', 3000] });
  } },
  'ray-hit': { dur: 0.22, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.18, perc(0.002, 0.04), { amp: 0.7, filt: [['hp', 1800], ['lp', 6000]], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 90 * t) }); // sizzle
    tone(o, 0, 0.12, glide(900 * k, 1500 * k, 0.05), perc(0.002, 0.03), { w: 'tri', amp: 0.5 });
    thump(o, 0, 280, 160, 0.015, 0.4);
  } },
  'shrink-fire': { dur: 0.5, make(o) { // a wobbly ring: wub-wub-wub going up
    const k = rr(0.95, 1.05), d = 0.46;
    tone(o, 0, d, glide(300 * k, 1200 * k, d), ar(0.01, 0.15, d), { w: 'tri', amp: 0.7, vib: 0.18, vibRate: 16 });
    tone(o, 0, d, glide(600 * k, 2400 * k, d), ar(0.01, 0.15, d), { amp: 0.2, vib: 0.18, vibRate: 16 });
  } },
  'shrink-down': { dur: 0.75, make(o) { // a falling warble, then a tiny "eep"
    const k = rr(0.95, 1.05), d = 0.6;
    tone(o, 0, d, glide(900 * k, 160 * k, d), ar(0.01, 0.15, d), { w: 'tri', amp: 0.7, vib: 0.1, vibRate: 11 });
    tone(o, 0, d, glide(1350 * k, 240 * k, d), ar(0.01, 0.15, d), { amp: 0.25, vib: 0.1, vibRate: 11 });
    chirpVoice(o, 0.6, 2600 * k, 3200 * k, 0.08, 0.5);
  } },
  'bubble-blorp': { dur: 0.5, make(o) {
    const k = rr(0.9, 1.1);
    tone(o, 0, 0.35, pts(0, 180 * k, 0.12, 520 * k, 0.35, 420 * k), ar(0.01, 0.15, 0.35), { amp: 0.8, vib: 0.06, vibRate: 9 }); // blorp
    noise(o, 0, 0.3, hump(0.3, 1.2), { amp: 0.3, filt: ['bp', glide(500, 1400, 0.25), 4] });
    bubbles(o, 0.1, 0.35, 5, { amp: 0.3, lo: 600, hi: 1400 });
  } },
  'bubble-drop': { dur: 0.6, drive: 1.5, hp: 110, make(o) {
    const k = rr(0.9, 1.1);
    tone(o, 0, 0.05, glide(900 * k, 1800 * k, 0.03), perc(0.001, 0.012), { amp: 0.7 }); // pop!
    noise(o, 0, 0.03, perc(0.0004, 0.005), { amp: 0.6, filt: ['bp', 2500, 1] });
    whoosh(o, 0.02, 0.16, 1400, 900, 400, 0.4, 1.4); // it falls
    thump(o, 0.18, 190 * k, 100, 0.06, 1.1); // slam
    noise(o, 0.18, 0.3, perc(0.002, 0.06), { amp: 0.7, filt: ['lp', 1400] });
  } },
  'mind-hum': { dur: 1.6, loop: true, make(o) { // a psychic "oo-oh" swell, a fifth above it pulsing
    const d = o.length / SR;
    voice(o, 0, d, (t) => 220 * (1 + 0.04 * Math.sin(TAU * 2.5 * t)), (t) => 0.7 + 0.3 * Math.sin(TAU * 1.25 * t), { formants: (t) => mix(VOW.u, VOW.o, 0.5 + 0.5 * Math.sin(TAU * 1.25 * t)), breath: 0.1, amp: 0.6, w: 'tri' });
    tone(o, 0, d, (t) => 660 * (1 + 0.02 * Math.sin(TAU * 5 * t)), (t) => 0.5 + 0.5 * Math.sin(TAU * 2.5 * t), { amp: 0.3 });
    tone(o, 0, d, 990, 1, { amp: 0.08, vib: 0.01, vibRate: 6.25 });
  } },
  'mind-take': { dur: 0.8, make(o) {
    const k = rr(0.95, 1.05), d = 0.7;
    tone(o, 0, d, pts(0, 300 * k, 0.15, 900 * k, d, 700 * k), ar(0.01, 0.3, d), { w: 'tri', amp: 0.6, vib: 0.08, vibRate: 7 }); // bwoing: got you
    tone(o, 0.01, d, pts(0, 450 * k, 0.15, 1350 * k, d, 1050 * k), ar(0.01, 0.3, d), { amp: 0.3, vib: 0.08, vibRate: 7.5 });
    [1568, 1976, 2349].forEach((f, j) => bell(o, 0.12 + j * 0.08, f * k, 0.15, 0.3));
  } },
  'mind-free': { dur: 0.6, make(o) {
    const k = rr(0.95, 1.05), d = 0.55;
    tone(o, 0, d, glide(900 * k, 250 * k, d), ar(0.01, 0.25, d), { w: 'tri', amp: 0.6, vib: 0.06, vibRate: 9 });
    noise(o, 0, 0.3, hump(0.3, 1), { amp: 0.15, filt: [['hp', 3000], ['lp', 7000]] });
  } },
  'ufo-beam': { dur: 1.2, loop: true, make(o) {
    const d = o.length / SR;
    tone(o, 0, d, (t) => 330 * (1 + 0.03 * Math.sin(TAU * 5 * t)), 1, { w: 'tri', amp: 0.5 });
    tone(o, 0, d, (t) => 495 * (1 + 0.03 * Math.sin(TAU * 5 * t + 1)), 1, { amp: 0.3 });
    noise(o, 0, d, 1, { amp: 0.2, filt: ['bp', 2200, 2], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 10 * t) });
    for (let j = 0; j < 8; j++) bell(o, rnd() * (d - 0.3), rr(2400, 3600), 0.06, 0.12); // sparkles
  } },
  abduct: { dur: 0.8, make(o) {
    const k = rr(0.93, 1.07), d = 0.55;
    noise(o, 0, d, ar(0.04, 0.1, d), { amp: 0.8, filt: ['bp', glide(400 * k, 2600 * k, d), 5] }); // slurp up the beam
    tone(o, 0, d, glide(200 * k, 1400 * k, d), ar(0.04, 0.1, d), { amp: 0.4, vib: 0.05, vibRate: 20 });
    tone(o, 0.56, 0.12, glide(700 * k, 1600 * k, 0.05), perc(0.002, 0.03), { amp: 0.7 }); // gloop: gone
    bell(o, 0.6, 2100 * k, 0.08, 0.3);
  } },
  'ufo-hover': { dur: 2.0, loop: true, make(o) { // the saucer warble: two tones beating, a pulsing whirr
    const d = o.length / SR;
    tone(o, 0, d, (t) => 440 * (1 + 0.06 * Math.sin(TAU * 1.5 * t)), 1, { w: 'tri', amp: 0.4 });
    tone(o, 0, d, (t) => 446 * (1 + 0.06 * Math.sin(TAU * 1.5 * t + 0.5)), 1, { amp: 0.3 });
    tone(o, 0, d, 220, (t) => 0.6 + 0.4 * Math.sin(TAU * 8 * t), { w: 'saw', amp: 0.25, filt: ['lp', 1200] });
    noise(o, 0, d, 1, { amp: 0.1, filt: ['bp', 1500, 1] });
  } },
  'jet-hover': { dur: 1.5, loop: true, make(o) { // the jetpack flame
    const d = o.length / SR;
    noise(o, 0, d, 1, { amp: 1, color: 'pink', filt: ['bp', 1400, 0.7], am: (t) => 0.8 + 0.2 * Math.sin(TAU * 4 * t) });
    noise(o, 0, d, 1, { amp: 0.4, filt: [['hp', 3500], ['lp', 7500]] });
    crackle(o, 0, d, 40, 1, { amp: 0.3, filt: ['bp', 2600, 1] });
  } },
  boing: { dur: 0.42, make(o) { // a low-gravity spring: up it goes, wobbling
    const k = rr(0.9, 1.1);
    tone(o, 0, 0.4, glide(170 * k, 430 * k, 0.3), perc(0.004, 0.12), { amp: 0.8, vib: 0.08, vibRate: 18 });
    tone(o, 0, 0.3, glide(340 * k, 860 * k, 0.3), perc(0.004, 0.06), { w: 'tri', amp: 0.25, vib: 0.08, vibRate: 18 });
  } },
  'ufo-crash': { dur: 1.1, make(o) {
    const k = rr(0.95, 1.05), d = 1.0;
    tone(o, 0, d, glide(900 * k, 140 * k, d), ar(0.01, 0.1, d), { w: 'saw', amp: 0.5, filt: ['lp', 2500], vib: 0.08, vibRate: 7 }); // falling whine
    tone(o, 0, d, glide(906 * k, 150 * k, d), ar(0.01, 0.1, d), { w: 'tri', amp: 0.4, vib: 0.08, vibRate: 6.3 });
    crackle(o, 0, d, 90, ar(0.05, 0.1, d), { amp: 0.4, filt: ['bp', 3000, 1] }); // sparks
    for (let j = 0; j < 4; j++) metal(o, 0.1 + j * 0.2 + rr(0, 0.05), rr(600, 1200), 0.03, 0.25); // bits fall off
  } },
  'alien-yelp': { dur: 0.3, make(o) {
    const k = rr(0.85, 1.2), d = 0.24;
    voice(o, 0, d, pts(0, 700 * k, 0.05, 1100 * k, d, 600 * k), ar(0.008, 0.1, d), { formants: VOW.i, fs: 1.5, vib: 0.08, vibRate: 24, breath: 0.1, amp: 1 }); // "eek!"
  } },
  'float-up': { dur: 0.6, make(o) {
    const k = rr(0.95, 1.05), d = 0.55;
    tone(o, 0, d, glide(260 * k, 1040 * k, d), ar(0.02, 0.2, d), { w: 'tri', amp: 0.6, vib: 0.03, vibRate: 6 });
    [1047, 1319, 1568, 2093].forEach((f, j) => bell(o, 0.1 + j * 0.1, f * k, 0.1, 0.25));
  } },

  // --- ocean
  'jaw-snap': { dur: 0.4, drive: 1.6, hp: 110, make(o) {
    const k = rr(0.9, 1.1);
    click(o, 0, 1500 * k, 0.003, 0.9);
    modal(o, 0, [[620 * k, 0.03, 0.8], [1400 * k, 0.02, 0.4]]); // teeth meet
    thump(o, 0, 190 * k, 100, 0.05, 1);
    noise(o, 0, 0.3, perc(0.002, 0.06), { amp: 0.5, filt: ['bp', glide(2000, 700, 0.2), 0.8] }); // water
    bubbles(o, 0.04, 0.25, 4, { amp: 0.2, lo: 400, hi: 900 });
  } },
  breach: { dur: 0.75, make(o) {
    const k = rr(0.9, 1.1);
    whoosh(o, 0, 0.3, 500 * k, 1400 * k, 700 * k, 0.6, 1.2); // up out of the water
    noise(o, 0.02, 0.6, perc(0.004, 0.16), { amp: 1, filt: ['lp', glide(3500, 700, 0.4), 0.7] }); // the sea parts
    thump(o, 0.02, 180, 100, 0.05, 0.6);
    bubbles(o, 0.1, 0.5, 9, { amp: 0.22, lo: 400, hi: 1000 });
  } },
  'ink-bloop': { dur: 0.9, hp: 100, make(o) {
    const k = rr(0.92, 1.08);
    tone(o, 0, 0.5, pts(0, 160 * k, 0.08, 420 * k, 0.5, 180 * k), ar(0.01, 0.25, 0.5), { amp: 0.9, vib: 0.05, vibRate: 8 }); // BLOOP
    noise(o, 0, 0.4, perc(0.003, 0.09), { amp: 0.6, filt: ['bp', (t) => 500 + 300 * Math.sin(TAU * 18 * t), 3] }); // squirt
    noise(o, 0.05, 0.8, hump(0.8, 1.4), { amp: 0.35, filt: ['lp', 900] }); // the cloud spreads
    bubbles(o, 0.1, 0.7, 10, { amp: 0.28, lo: 250, hi: 700 });
  } },
  'puff-up': { dur: 0.45, make(o) {
    const k = rr(0.9, 1.1), d = 0.32;
    tone(o, 0, d, glide(260 * k, 900 * k, d), ar(0.01, 0.05, d), { amp: 0.7, vib: 0.04, vibRate: 30 }); // inflating
    noise(o, 0, d, ar(0.02, 0.05, d), { amp: 0.3, filt: ['bp', glide(600, 2000, d), 3] }); // gulping water
    tone(o, d, 0.1, glide(1100 * k, 600 * k, 0.05), perc(0.002, 0.03), { amp: 0.6 }); // bloop: round
    for (let j = 0; j < 5; j++) modal(o, d + 0.01 + j * 0.012, [[rr(3000, 4500), 0.01, 1]], { amp: 0.15 }); // spikes out
  } },
  'shell-clunk': { dur: 0.28, make(o) {
    const k = rr(0.9, 1.1);
    modal(o, 0, [[340 * k, 0.05, 1], [880 * k, 0.03, 0.5], [1630 * k, 0.018, 0.25]]); // hollow shell
    thump(o, 0, 210 * k, 130, 0.03, 0.6);
    noise(o, 0, 0.04, perc(0.0006, 0.008), { amp: 0.4, filt: ['bp', 1200, 1.2] });
  } },
  'leap-whoosh': { dur: 0.6, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.12, perc(0.002, 0.04), { amp: 0.7, filt: ['bp', 1800, 0.8] }); // out of the water
    whoosh(o, 0.03, 0.5, 700 * k, 2400 * k, 900 * k, 1, 1.6); // through the air
    bubbles(o, 0, 0.15, 3, { amp: 0.2, lo: 700, hi: 1300 });
  } },
  'claw-click': { dur: 0.14, make(o) {
    const k = rr(0.9, 1.1);
    click(o, 0, 3000 * k, 0.0015, 0.8);
    modal(o, 0, [[1900 * k, 0.015, 0.8], [3300 * k, 0.01, 0.4]]);
    modal(o, 0.04, [[2100 * k, 0.012, 0.5], [3600 * k, 0.008, 0.3]]); // clack-clack
  } },
  slap: { dur: 0.22, drive: 1.5, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.08, perc(0.0005, 0.012), { amp: 1.1, filt: ['bp', 1700 * k, 0.7] });
    noise(o, 0, 0.15, perc(0.002, 0.04), { amp: 0.4, filt: ['lp', 900], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 40 * t) }); // wet
    thump(o, 0, 230 * k, 130, 0.025, 0.6);
  } },
  skid: { dur: 0.8, make(o) { // a walrus sliding on its belly
    const d = 0.75;
    noise(o, 0, d, (t) => Math.min(1, t / 0.03) * Math.max(0, 1 - t / d) ** 1.2, { amp: 0.8, filt: ['bp', glide(1400, 700, d), 1.2], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 23 * t) });
    creak(o, 0, d * 0.7, glide(120, 60, d * 0.7), ar(0.03, 0.2, d * 0.7), { f: 900, q: 3, amp: 0.4 }); // blubber squeaks
  } },

  // --- sports
  'bat-crack': { dur: 0.45, drive: 1.5, make(o) {
    const k = rr(0.94, 1.06);
    click(o, 0, 3000, 0.002, 1);
    wood(o, 0, 620 * k, 0.05, 1); // TOCK
    modal(o, 0, [[1450 * k, 0.03, 0.5], [2300 * k, 0.02, 0.3]]);
    noise(o, 0, 0.05, perc(0.0005, 0.01), { amp: 0.7, filt: ['bp', 2200, 0.8] });
    whoosh(o, 0.02, 0.35, 1600, 1100, 500, 0.3, 1.6); // and away it goes
  } },
  'bowl-roll': { dur: 1.0, make(o) {
    const k = rr(0.93, 1.07), d = 0.95;
    thump(o, 0, 180 * k, 120, 0.035, 0.7); // the ball lands
    modal(o, 0, [[300 * k, 0.04, 0.4]]);
    let s = 0.5, target = 0.5;
    noise(o, 0.03, d, (t) => Math.min(1, t / 0.05) * Math.max(0, 1 - t / d), { amp: 0.8, color: 'brown', filt: [['lp', 900], ['hp', 160]],
      am: (t) => { if (Math.floor(t * SR) % 900 === 0) target = 0.5 + 0.5 * rnd(); s += 0.004 * (target - s); return s; } }); // rumbling away
    tone(o, 0.03, d, 210 * k, (t) => Math.max(0, 1 - t / d) * (0.6 + 0.4 * Math.sin(TAU * 7 * t)), { amp: 0.15, filt: ['lp', 600] });
  } },
  'pin-hit': { dur: 0.3, make(o) {
    const k = rr(0.9, 1.1), t2 = rr(0.03, 0.06);
    wood(o, 0, 1150 * k, 0.03, 1); // the pin
    wood(o, t2, 1300 * k, 0.025, 0.6); // it topples
    modal(o, 0.004, [[2650 * k, 0.02, 0.3]]);
  } },
  'bowl-strike': { dur: 1.2, make(o) {
    const k = rr(0.95, 1.05);
    thump(o, 0, 190 * k, 110, 0.05, 0.9);
    for (let j = 0; j < 16; j++) { const t = Math.pow(rnd(), 1.6) * 0.6; wood(o, t, rr(950, 1450), rr(0.02, 0.04), rr(0.25, 0.6) * (1 - 0.8 * t)); } // CRASH: pins everywhere
    noise(o, 0, 0.5, perc(0.003, 0.12), { amp: 0.4, filt: ['bp', 2000, 0.8] });
    [1047, 1319, 1568].forEach((f, j) => bell(o, 0.55 + j * 0.13, f * k, 0.18, 0.35)); // ding-ding-ding: strike!
  } },
  'puck-slap': { dur: 0.32, drive: 1.6, make(o) {
    const k = rr(0.93, 1.07);
    noise(o, 0, 0.07, perc(0.0005, 0.012), { amp: 1.2, filt: ['bp', 1800 * k, 0.7] }); // the stick slaps the ice
    wood(o, 0, 520 * k, 0.03, 0.7);
    click(o, 0.006, 2600, 0.002, 0.8); // the puck leaves the blade
    noise(o, 0.02, 0.25, perc(0.005, 0.06), { amp: 0.25, filt: [['hp', 3000], ['lp', 7000]] }); // ice spray
  } },
  'puck-hit': { dur: 0.18, drive: 1.5, make(o) {
    const k = rr(0.9, 1.1);
    click(o, 0, 2400 * k, 0.002, 0.8);
    thump(o, 0, 290 * k, 160, 0.02, 0.8); // hard rubber
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.6, filt: ['lp', 2200] });
  } },
  'puck-board': { dur: 0.45, make(o) {
    const k = rr(0.92, 1.08);
    click(o, 0, 2600, 0.002, 0.7);
    modal(o, 0, [[180 * k, 0.09, 0.7], [370 * k, 0.07, 0.6], [690 * k, 0.04, 0.35], [1260 * k, 0.025, 0.2]]); // the boards boom
    noise(o, 0, 0.3, perc(0.003, 0.06), { amp: 0.4, filt: ['bp', 700, 1] });
  } },
  'baseball-thud': { dur: 0.2, drive: 1.5, make(o) {
    const k = rr(0.9, 1.1);
    thump(o, 0, 260 * k, 140, 0.025, 1);
    noise(o, 0, 0.08, perc(0.0008, 0.016), { amp: 0.8, filt: ['lp', 1800] });
    modal(o, 0, [[780 * k, 0.015, 0.3]]); // leather
  } },
  'glove-thump': { dur: 0.2, drive: 1.6, make(o) {
    const k = rr(0.9, 1.1);
    thump(o, 0, 230 * k, 120, 0.03, 1);
    noise(o, 0, 0.1, perc(0.001, 0.025), { amp: 0.9, filt: ['lp', 1100] }); // padded: no crack
    noise(o, 0, 0.12, hump(0.1, 1), { amp: 0.2, filt: ['bp', 800, 1.5] }); // air out of the glove
  } },
  'sumo-stomp': { dur: 1.0, drive: 1.9, hp: 110, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 190 * k, 100, 0.11, 1.2);
    thump(o, 0, 340 * k, 160, 0.05, 0.4);
    noise(o, 0, 0.06, perc(0.0008, 0.012), { amp: 0.6, filt: ['bp', 1100, 0.8] }); // bare foot on clay
    noise(o, 0, 0.9, perc(0.006, 0.22), { amp: 0.8, color: 'brown', filt: ['lp', glide(1800, 300, 0.6), 0.8] });
  } },
  cheer: { dur: 1.0, make(o) {
    const k = rr(0.92, 1.08), d = 0.62;
    voice(o, 0.05, d, pts(0, 420 * k, 0.12, 620 * k, 0.4, 560 * k, d, 480 * k), ar(0.02, 0.2, d), { formants: (t) => mix(VOW.e, VOW.a, Math.min(1, t / 0.25)), fs: 1.2, vib: 0.03, vibRate: 7, breath: 0.12, amp: 0.8 }); // "yaaay!"
    for (let j = 0; j < 7; j++) noise(o, j * 0.11 + rr(0, 0.02), 0.09, hump(0.08, 1), { amp: 0.4, filt: [['hp', 2500], ['lp', 8000]] }); // pom-poms shake
  } },
  tackle: { dur: 0.5, drive: 1.7, hp: 110, make(o) {
    const k = rr(0.9, 1.1);
    thump(o, 0, 200 * k, 100, 0.06, 1.2); // CRUNCH
    noise(o, 0, 0.18, perc(0.001, 0.04), { amp: 0.9, filt: ['lp', 1700] });
    crackle(o, 0, 0.15, 260, perc(0.002, 0.05), { amp: 0.4, filt: ['bp', 1400, 1] }); // pads
    voice(o, 0.02, 0.2, glide(160 * k, 110 * k, 0.15), perc(0.006, 0.07), { formants: VOW.uh, breath: 0.25, rough: 0.2, amp: 0.5 }); // "oof"
  } },
  hut: { dur: 0.3, make(o) {
    const k = rr(0.85, 1.15);
    voice(o, 0, 0.24, pts(0, 170 * k, 0.05, 210 * k, 0.24, 160 * k), ar(0.01, 0.1, 0.24), { formants: VOW.uh, breath: 0.2, rough: 0.15, amp: 1 }); // "HUT!"
    noise(o, 0.18, 0.05, perc(0.001, 0.01), { amp: 0.25, filt: ['bp', 3500, 1.5] });
  } },
  dodge: { dur: 0.24, make(o) {
    const k = rr(0.9, 1.1);
    whoosh(o, 0, 0.2, 900 * k, 2600 * k, 1200 * k, 1, 1.5);
    tone(o, 0.12, 0.08, glide(2200 * k, 2600 * k, 0.06), ar(0.005, 0.03, 0.08), { amp: 0.3 }); // sneaker squeak
  } },

  // --- bugs
  'bee-buzz': { dur: 2.0, loop: true, make(o) { // a swarm: four bees, each its own wobble
    const d = o.length / SR;
    for (let j = 0; j < 4; j++) {
      const f = 210 + 25 * j + rr(-5, 5), ph = rnd() * TAU, fm = 1 + 0.5 * j, am = 0.5 + 0.5 * j, bp = 1200 + 300 * j;
      tone(o, 0, d, (t) => f * (1 + 0.04 * Math.sin(TAU * fm * t + ph)), (t) => 0.6 + 0.4 * Math.sin(TAU * am * t + 2 * ph), { w: 'saw', amp: 0.35, filt: ['bp', bp, 1.5] });
    }
  } },
  'mosquito-whine': { dur: 2.0, loop: true, make(o) { // whining fly-bys: swells "eeeEEEeee", quiet between (and at the seam)
    const d = o.length / SR, sw = (t) => Math.sin(Math.PI * t) ** 2;
    tone(o, 0, d, (t) => 620 * (1 + 0.05 * Math.sin(TAU * 1.5 * t) + 0.01 * Math.sin(TAU * 11 * t)), sw, { w: 'saw', amp: 0.5, filt: ['bp', 1800, 1.2] });
    tone(o, 0, d, (t) => 655 * (1 + 0.05 * Math.sin(TAU * 2 * t + 1)), (t) => sw(t) * (0.6 + 0.4 * Math.sin(TAU * t)), { w: 'saw', amp: 0.3, filt: ['bp', 2200, 1.2] });
  } },
  'drone-buzz': { dur: 1.5, loop: true, make(o) { // little rotors: a buzz chopped 40 times a second by the blades
    const d = o.length / SR, chop = (t) => 0.5 - 0.5 * Math.cos(TAU * 40 * t);
    for (let j = 0; j < 3; j++) { const f = 330 + 47 * j, fm = 2 + j, bp = 1600 + 400 * j; tone(o, 0, d, (t) => f * (1 + 0.02 * Math.sin(TAU * fm * t)), chop, { w: 'saw', amp: 0.3, filt: ['bp', bp, 1.2] }); }
    noise(o, 0, d, chop, { amp: 0.35, filt: ['bp', 3000, 1] });
  } },
  sting: { dur: 0.14, make(o) {
    const k = rr(0.9, 1.1);
    click(o, 0, 4000 * k, 0.001, 0.8);
    tone(o, 0, 0.12, glide(1800 * k, 900 * k, 0.1), perc(0.002, 0.045), { w: 'saw', amp: 0.5, filt: ['bp', 2000, 2] }); // bzzt
    noise(o, 0, 0.03, perc(0.0004, 0.005), { amp: 0.5, filt: ['bp', 3000, 1.2] });
  } },
  'hive-buzz': { dur: 1.0, make(o) { // the hive shakes and lets them out
    const d = 0.95;
    for (let j = 0; j < 6; j++) {
      const f = rr(200, 300), t0 = rr(0, 0.15), fm = rr(3, 6), bp = rr(1000, 1800);
      tone(o, t0, d - t0, (t) => f * (1 + 0.06 * Math.sin(TAU * fm * t)), ar(0.08, 0.4, d - t0), { w: 'saw', amp: 0.25, filt: ['bp', bp, 1.4] });
    }
    wood(o, 0, 420, 0.04, 0.5);
  } },
  'web-thwip': { dur: 0.3, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.22, perc(0.002, 0.05), { amp: 0.8, filt: ['bp', glide(1500 * k, 4000 * k, 0.15), 3] }); // thwip
    tone(o, 0, 0.2, glide(600 * k, 1800 * k, 0.12), perc(0.003, 0.05), { amp: 0.35 });
  } },
  'web-splat': { dur: 0.32, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.15, perc(0.001, 0.035), { amp: 0.9, filt: ['lp', 1600 * k], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 55 * t) });
    tone(o, 0, 0.25, glide(380 * k, 260 * k, 0.2), perc(0.003, 0.08), { amp: 0.4, vib: 0.08, vibRate: 22 }); // the strands twang
    crackle(o, 0.01, 0.2, 200, perc(0.004, 0.06), { amp: 0.3, filt: ['bp', 2200, 1.3] }); // sticky
  } },
  'horn-clonk': { dur: 0.5, drive: 1.4, make(o) {
    const k = rr(0.92, 1.08);
    modal(o, 0, [[520 * k, 0.05, 1], [1270 * k, 0.03, 0.5], [2240 * k, 0.015, 0.25]]); // CLONK: chitin
    thump(o, 0, 220 * k, 130, 0.03, 0.7);
    whoosh(o, 0.04, 0.4, 500, 1500, 600, 0.6, 1.2); // over it goes
  } },
  'boil-spray': { dur: 1.0, make(o) {
    const d = 0.95;
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.8, filt: ['bp', 1800, 0.8] }); // POP
    noise(o, 0.02, d - 0.02, ar(0.02, 0.4, d - 0.02), { amp: 0.8, filt: [['hp', 2000], ['lp', 6500]], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 17 * t) }); // hiss
    bubbles(o, 0.03, 0.8, 22, { amp: 0.28, lo: 500, hi: 1300 }); // boiling
    crackle(o, 0.02, 0.8, 70, ar(0.02, 0.4, 0.8), { amp: 0.3, filt: ['bp', 2800, 1] });
  } },
  'mosquito-pop': { dur: 0.35, make(o) {
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.04, perc(0.0003, 0.006), { amp: 1, filt: ['bp', 2600 * k, 0.8] }); // POP
    tone(o, 0, 0.06, glide(900 * k, 300 * k, 0.04), perc(0.001, 0.015), { amp: 0.7 });
    noise(o, 0.01, 0.25, perc(0.003, 0.06), { amp: 0.5, filt: ['lp', 1400], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 45 * t) }); // splat
    bubbles(o, 0.02, 0.2, 3, { amp: 0.2, lo: 800, hi: 1600 });
  } },
  'stink-puff': { dur: 0.6, make(o) {
    const k = rr(0.9, 1.1), d = 0.45;
    noise(o, 0, d, ar(0.02, 0.2, d), { amp: 0.8, filt: ['bp', glide(700 * k, 380 * k, d), 2.5], am: (t) => 0.55 + 0.45 * Math.sin(TAU * (34 + 20 * t) * t) }); // pffrrt
    tone(o, 0, d, glide(180 * k, 145 * k, d), ar(0.02, 0.2, d), { w: 'square', amp: 0.18, filt: ['lp', 700] });
    noise(o, 0.05, 0.5, hump(0.5, 1.2), { amp: 0.25, filt: [['hp', 1500], ['lp', 4000]] }); // the cloud hisses out
  } },
  'mantis-lunge': { dur: 0.36, make(o) {
    const k = rr(0.9, 1.1);
    crackle(o, 0, 0.1, 500, perc(0.002, 0.04), { amp: 0.7, filt: ['bp', 3200 * k, 1.2], len: 0.0006 }); // chitter
    whoosh(o, 0.03, 0.3, 1200 * k, 3000 * k, 1500 * k, 0.8, 1.6); // the leap
  } },

  // --- bosses
  gulp: { dur: 0.7, hp: 100, make(o) {
    const k = rr(0.92, 1.08);
    tone(o, 0, 0.12, glide(320 * k, 180 * k, 0.1), perc(0.004, 0.04), { amp: 0.8 }); // GULP
    noise(o, 0, 0.18, perc(0.004, 0.05), { amp: 0.6, filt: ['bp', (t) => 500 + 250 * Math.sin(TAU * 22 * t), 3] });
    tone(o, 0.18, 0.4, glide(260 * k, 160 * k, 0.3), ar(0.02, 0.2, 0.4), { amp: 0.5, vib: 0.06, vibRate: 10 }); // down it goes
    bubbles(o, 0.2, 0.4, 4, { amp: 0.22, lo: 250, hi: 500 });
  } },
  'head-chop': { dur: 0.9, drive: 1.5, hp: 105, make(o) {
    const k = rr(0.93, 1.07);
    whoosh(o, 0, 0.1, 2000, 3200, 1800, 0.4, 1.4);
    noise(o, 0.06, 0.12, perc(0.0008, 0.02), { amp: 1, filt: ['bp', 1400 * k, 0.8] }); // chop
    noise(o, 0.06, 0.3, perc(0.003, 0.07), { amp: 0.5, filt: ['bp', (t) => 700 + 300 * Math.sin(TAU * 26 * t), 3] }); // wet
    thump(o, 0.45, 180 * k, 100, 0.06, 1); // the head lands
    noise(o, 0.45, 0.3, perc(0.003, 0.06), { amp: 0.6, filt: ['lp', 1200] });
  } },
  'head-grow': { dur: 1.3, hp: 105, make(o) {
    const k = rr(0.93, 1.07), d = 1.2;
    noise(o, 0, d, ar(0.1, 0.3, d), { amp: 0.8, filt: ['bp', (t) => 500 + 400 * t + 250 * Math.sin(TAU * 14 * t), 4] }); // squelch, squelch
    crackle(o, 0, d, (t) => 80 + 150 * t, ar(0.1, 0.3, d), { amp: 0.4, filt: ['bp', 1300, 1.3] });
    noise(o, 0.3, 0.9, ar(0.2, 0.3, 0.9), { amp: 0.5, filt: [['hp', 2500], ['lp', 6500]] }); // hiss
    voice(o, 0.7, 0.55, glide(170 * k, 230 * k, 0.5), ar(0.05, 0.2, 0.55), { formants: VOW.a, fs: 0.8, rough: 0.5, breath: 0.3, amp: 0.5, w: 'square' }); // the new head's first snarl
  } },
  'earth-rumble': { dur: 0.9, hp: 120, make(o) {
    const d = 0.85;
    let s = 0.5, target = 0.5;
    noise(o, 0, d, ar(0.15, 0.2, d), { amp: 1, color: 'brown', filt: [['lp', 600], ['hp', 140]], am: (t) => { if (Math.floor(t * SR) % 700 === 0) target = 0.4 + 0.6 * rnd(); s += 0.003 * (target - s); return s; } });
    crackle(o, 0.1, d - 0.1, (t) => 40 + 160 * t, ar(0.1, 0.15, d - 0.1), { amp: 0.5, filt: ['bp', 1500, 1] }); // the ground cracks
    for (let j = 0; j < 5; j++) modal(o, 0.2 + rnd() * 0.55, [[rr(700, 1500), 0.03, 1]], { amp: 0.2 }); // pebbles
  } },
  'worm-burst': { dur: 1.6, drive: 2.0, hp: 105, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 200 * k, 100, 0.12, 1.2); // BOOM up through the ground
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.8, filt: ['bp', 1100, 0.8] });
    noise(o, 0, 1.2, perc(0.005, 0.3), { amp: 1, color: 'brown', filt: ['lp', glide(2600, 300, 0.8), 0.8] });
    for (let j = 0; j < 14; j++) { const t = 0.05 + Math.pow(rnd(), 1.4) * 0.9; modal(o, t, [[rr(500, 1400), rr(0.02, 0.05), 1]], { amp: rr(0.15, 0.4) * (1.1 - t) }); } // clods rain down
    voice(o, 0.15, 1.3, pts(0, 110 * k, 0.3, 150 * k, 1.0, 120 * k, 1.3, 90 * k), lin(0, 0, 0.2, 1, 1.0, 0.8, 1.3, 0), { formants: (t) => mix(VOW.o, VOW.a, Math.min(1, t / 0.4)), fs: 0.75, rough: 0.6, breath: 0.3, amp: 0.8, w: 'square' }); // ROAR
  } },
  'worm-dive': { dur: 1.2, hp: 110, make(o) {
    const k = rr(0.93, 1.07), d = 1.1;
    crackle(o, 0, d, (t) => 300 * Math.exp(-t / 0.5), ar(0.03, 0.4, d), { amp: 0.8, filt: ['bp', 1200, 0.9] }); // dirt churns
    noise(o, 0, d, ar(0.05, 0.5, d), { amp: 0.8, color: 'brown', filt: [['lp', glide(1200, 300, d)], ['hp', 140]] }); // down it goes
    whoosh(o, 0, 0.4, 300 * k, 800 * k, 250 * k, 0.5, 1.1);
    thump(o, 0.05, 185 * k, 100, 0.07, 0.8);
  } },
  'mech-lift': { dur: 0.75, hp: 105, make(o) {
    const k = rr(0.95, 1.05), d = 0.6;
    noise(o, 0, d, ar(0.03, 0.2, d), { amp: 0.7, filt: [['hp', 2200], ['lp', 6500]] }); // hydraulics hiss
    tone(o, 0, d, glide(300 * k, 700 * k, d), ar(0.04, 0.15, d), { w: 'saw', amp: 0.35, filt: ['bp', 1000, 2] }); // the big servo strains
    creak(o, 0.05, d - 0.05, 60, ar(0.05, 0.15, d - 0.05), { f: 700, q: 4, amp: 0.4 }); // the metal groans
    metal(o, d, 260 * k, 0.05, 0.4); // locks up there
  } },
  'giant-stomp': { dur: 1.5, drive: 2.2, hp: 100, make(o) {
    const k = rr(0.93, 1.07);
    thump(o, 0, 190 * k, 92, 0.15, 1.3);
    thump(o, 0, 330 * k, 150, 0.07, 0.5);
    metal(o, 0, 150 * k, 0.12, 0.6); // the steel foot rings
    noise(o, 0, 0.06, perc(0.0006, 0.012), { amp: 0.6, filt: ['bp', 1000, 0.8] });
    noise(o, 0, 1.4, perc(0.006, 0.35), { amp: 1, color: 'brown', filt: ['lp', glide(2400, 260, 0.9), 0.8] }); // the shockwave rolls out
    crackle(o, 0.03, 1.1, (t) => 120 * Math.exp(-t / 0.3), 1, { amp: 0.32, filt: ['bp', 1700, 1] });
  } },
  'boss-growl': { dur: 0.9, drive: 1.3, hp: 100, make(o) {
    const k = rr(0.88, 1.12), d = 0.8;
    const low = (fm) => fm.map(([f, q, g]) => [f * 0.75, q, g]); // a huge throat
    voice(o, 0, d, pts(0, 92 * k, 0.2, 116 * k, d, 82 * k), ar(0.05, 0.3, d), { formants: (t) => low(mix(VOW.u, VOW.o, Math.min(1, t / 0.4))), rough: 0.65, breath: 0.3, amp: 1, w: 'square', vib: 0.03, vibRate: 5 });
    noise(o, 0, d, hump(d, 1), { amp: 0.25, filt: ['bp', 500, 1.2], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 24 * t) }); // throat rattle
  } },

  // ---------------------------------------------------------------- OURS: Part 2 step 7 (maps, terrain brushes, secret units)
  // --- maps + finds (UI moments)
  'secret-fanfare': { dur: 1.5, make(o) { // a toy glockenspiel run up, then a kazoo-ish toy horn: ta-DA!
    const run = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
    run.forEach((f, i) => bell(o, i * 0.045, f, 0.16, 0.5));
    const horn = (at, d, chord, amp) => chord.forEach((f, j) => {
      tone(o, at, d, f, ar(0.012, d * 0.5, d), { w: 'square', amp: amp * (1 - 0.15 * j), filt: ['lp', 2000, 0.8], vib: 0.012, vibRate: 6 });
      tone(o, at, d, f, ar(0.012, d * 0.5, d), { w: 'tri', amp: amp * 0.8 });
    });
    horn(0.3, 0.12, [392, 493.9, 587.3], 0.2);           // ta
    horn(0.44, 0.95, [523.25, 659.25, 784], 0.22);       // DA!
    bell(o, 0.44, 1046.5, 0.4, 0.3); bell(o, 0.44, 1568, 0.3, 0.2);
    for (let k = 0; k < 9; k++) bell(o, 0.48 + k * 0.08 + rnd() * 0.03, rr(2600, 4200), 0.07, 0.13); // sparkles
  } },
  'map-flip': { dur: 0.55, make(o) {
    const k = rr(0.92, 1.08), d = 0.32;
    noise(o, 0, d, hump(d, 1.2), { amp: 0.9, filt: ['bp', glide(1800 * k, 3200 * k, d), 1.1], am: (t) => 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * (22 * t - 18 * t * t))) }); // the page flaps over
    noise(o, 0.18, 0.3, hump(0.3, 1.5), { amp: 0.5, filt: ['bp', glide(2600 * k, 900 * k, 0.3), 0.9] }); // slides down flat
    noise(o, 0.42, 0.08, perc(0.002, 0.018), { amp: 0.5, filt: ['lp', 900] }); // and lands
    thump(o, 0.42, 260, 170, 0.015, 0.25);
  } },
  'paper-rustle': { dur: 0.42, make(o) {
    const d = 0.38;
    crackle(o, 0, d, (t) => 40 + 260 * Math.sin(Math.PI * Math.min(1, t / d)), hump(d, 0.8), { amp: 0.9, filt: ['bp', rr(2800, 3600), 1], len: 0.0009 }); // crinkle
    noise(o, 0, d, hump(d, 1.4), { amp: 0.35, filt: ['bp', glide(1500, 2600, d), 0.9], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 13 * t) });
  } },
  'paper-pop': { dur: 0.32, make(o) {
    const k = rr(0.94, 1.06);
    tone(o, 0, 0.09, glide(380 * k, 980 * k, 0.03), perc(0.002, 0.03), { amp: 0.8 }); // pop!
    noise(o, 0, 0.12, perc(0.001, 0.02), { amp: 0.7, filt: ['bp', 1700 * k, 0.8] }); // the card slaps down
    thump(o, 0, 240 * k, 150, 0.02, 0.5);
    crackle(o, 0.01, 0.2, 90, perc(0.004, 0.06), { amp: 0.3, filt: ['bp', 3200, 1] });
  } },
  padlock: { dur: 0.42, make(o) { // shaking a locked padlock: chk-chk-chk
    const k = rr(0.94, 1.06);
    [0, 0.085, 0.17].forEach((t, i) => {
      const g = 1 - 0.18 * i;
      metal(o, t, 1850 * k * rr(0.97, 1.03), 0.025, 0.55 * g); // the shackle knocks in the body
      modal(o, t + 0.004, [[760 * k, 0.03, 0.6], [1530 * k, 0.018, 0.3]], { amp: g }); // the lock body
      click(o, t, 3200, 0.0015, 0.4 * g);
    });
  } },

  // --- terrain: trampoline, bridge, lava, mud
  'tramp-boing': { dur: 0.55, make(o) { // the mat gives, the springs sing: boyoyoing
    const k = rr(0.9, 1.1), d = 0.5;
    const f = (t) => 150 * k * Math.pow(520 / 150, Math.min(1, t / 0.2)) * (1 + 0.13 * Math.exp(-t / 0.18) * Math.sin(TAU * 17 * t));
    thump(o, 0, 230 * k, 140, 0.02, 0.7);
    noise(o, 0, 0.05, perc(0.001, 0.01), { amp: 0.3, filt: ['lp', 1200] });
    tone(o, 0.01, d, f, perc(0.004, 0.15), { amp: 0.8 });
    tone(o, 0.01, d * 0.7, (t) => 2 * f(t), perc(0.004, 0.07), { w: 'tri', amp: 0.2 });
    modal(o, 0.005, [[1650 * k, 0.05, 0.25], [2480 * k, 0.035, 0.2]]); // springs ping
  } },
  'tramp-rip': { dur: 0.6, make(o) {
    const k = rr(0.92, 1.08), d = 0.26;
    crackle(o, 0, d, (t) => 600 + 2400 * t / d, ar(0.02, 0.05, d), { amp: 0.9, filt: ['bp', glide(1200 * k, 2600 * k, d), 0.9], len: 0.0007 }); // zzzrrrip
    noise(o, 0, d, ar(0.02, 0.05, d), { amp: 0.35, filt: ['bp', glide(900, 2000, d), 1.2] });
    tone(o, d - 0.02, 0.32, (t) => 420 * k * Math.pow(0.45, Math.min(1, t / 0.3)) * (1 + 0.08 * Math.sin(TAU * 22 * t)), perc(0.004, 0.09), { amp: 0.45 }); // a spring sags: doiinng
    thump(o, d - 0.02, 200, 120, 0.02, 0.4);
  } },
  'plank-crack': { dur: 0.55, drive: 1.3, make(o) {
    const k = rr(0.92, 1.08);
    noise(o, 0, 0.05, perc(0.0005, 0.008), { amp: 1, filt: ['bp', 2600 * k, 0.8] }); // KRAK
    wood(o, 0, 520 * k, 0.03, 0.8);
    crackle(o, 0, 0.25, (t) => 500 * Math.exp(-t / 0.05), 1, { amp: 0.7, filt: ['bp', 2200, 1] }); // splinters
    for (let j = 0; j < 4; j++) wood(o, 0.06 + j * 0.07 + rr(0, 0.03), rr(380, 640), rr(0.02, 0.04), rr(0.2, 0.45) * (1 - j * 0.15)); // bits clatter down
  } },
  'plank-fire': { dur: 0.6, make(o) { // dry wood catches: whump, then crackle
    noise(o, 0, 0.45, perc(0.04, 0.14), { amp: 0.8, color: 'pink', filt: ['lp', glide(500, 1800, 0.12), 0.8] });
    crackle(o, 0.03, 0.55, (t) => 60 + 120 * Math.exp(-t / 0.2), ar(0.03, 0.25, 0.55), { amp: 0.7, filt: ['bp', 2400, 1.1] });
    for (let j = 0; j < 3; j++) wood(o, 0.08 + rnd() * 0.4, rr(900, 1400), 0.012, 0.25); // knots pop
  } },
  'rock-hiss': { dur: 1.4, hp: 110, make(o) { // water on lava: a big hiss, the crust cracks, last bubbles
    const d = 1.35;
    noise(o, 0, d, (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.5), { amp: 1, filt: [['hp', 2000], ['lp', 5000]], am: (t) => 0.8 + 0.2 * Math.sin(TAU * 9 * t) });
    noise(o, 0, 0.6, perc(0.01, 0.18), { amp: 0.5, color: 'brown', filt: ['lp', 700] }); // the steam whumps up
    crackle(o, 0.05, 0.8, (t) => 200 * Math.exp(-t / 0.25), perc(0.01, 0.3), { amp: 0.5, filt: ['bp', 1600, 1] });
    bubbles(o, 0.1, 0.9, 8, { amp: 0.18, lo: 300, hi: 700 });
  } },
  squelch: { dur: 0.3, make(o) { // a foot into mud: splorch, blup
    const k = rr(0.85, 1.15);
    noise(o, 0, 0.22, perc(0.004, 0.06), { amp: 1, filt: ['bp', (t) => 480 * k + 320 * Math.sin(TAU * 26 * t) * Math.exp(-t / 0.08), 4] });
    tone(o, 0.03, 0.12, glide(260 * k, 520 * k, 0.07), perc(0.003, 0.03), { amp: 0.4 });
    thump(o, 0, 200 * k, 130, 0.02, 0.4);
  } },
  'mud-fizz': { dur: 0.45, make(o) { // a fire put out in mud: pssht, blub
    noise(o, 0, 0.4, perc(0.008, 0.11), { amp: 0.9, filt: [['hp', 2200], ['lp', 5500]] });
    noise(o, 0, 0.2, perc(0.004, 0.05), { amp: 0.45, filt: ['bp', (t) => 520 + 200 * Math.sin(TAU * 24 * t), 3] });
    bubbles(o, 0.05, 0.3, 3, { amp: 0.2, lo: 350, hi: 700 });
  } },
  'fall-whistle': { dur: 0.42, make(o) { // a cartoon slide whistle down: wheeeoo
    const k = rr(0.92, 1.08), d = 0.38;
    tone(o, 0, d, glide(1500 * k, 380 * k, d), ar(0.02, 0.1, d), { amp: 0.7, vib: 0.012, vibRate: 7 });
    noise(o, 0, d, ar(0.02, 0.1, d), { amp: 0.15, filt: ['bp', glide(3000 * k, 760 * k, d), 6] });
  } },
  'lava-sizzle': { dur: 0.7, make(o) {
    const d = 0.65;
    noise(o, 0, d, ar(0.015, 0.4, d), { amp: 0.8, filt: [['hp', 2400], ['lp', 6000]], am: (t) => 0.7 + 0.3 * Math.sin(TAU * 17 * t) });
    crackle(o, 0, d, 90, ar(0.01, 0.3, d), { amp: 0.45, filt: ['bp', 3000, 1.2] });
    tone(o, 0, 0.18, glide(220, 120, 0.12), perc(0.005, 0.05), { amp: 0.3 }); // blorp
  } },

  // --- secret units
  'ghost-boo': { dur: 0.8, make(o) { // a kid's ghost: "boooo", a wobbly whistle over it
    const k = rr(0.9, 1.12), d = 0.72;
    voice(o, 0, d, pts(0, 230 * k, 0.12, 330 * k, 0.5, 300 * k, d, 210 * k), ar(0.05, 0.3, d), { formants: (t) => mix(VOW.u, VOW.o, Math.min(1, t / 0.2)), fs: 1.1, breath: 0.3, vib: 0.04, vibRate: 5, amp: 0.9 });
    tone(o, 0.04, d - 0.04, pts(0, 460 * k, 0.15, 660 * k, d - 0.04, 420 * k), ar(0.08, 0.3, d - 0.04), { amp: 0.25, vib: 0.03, vibRate: 5.5 });
  } },
  'gull-squawk': { dur: 0.48, make(o) { // kyaa-kyaa
    const k = rr(0.9, 1.12);
    [0, 0.2].forEach((t, i) => {
      const d = i ? 0.2 : 0.16;
      voice(o, t, d, pts(0, 820 * k, 0.04, 1180 * k, d, 760 * k), ar(0.008, 0.08, d), { formants: VOW.a, fs: 1.8, rough: 0.25, breath: 0.12, vib: 0.03, vibRate: 30, amp: i ? 0.85 : 1 });
    });
  } },
  'crow-caw': { dur: 0.95, make(o) { // caw, caw, caw
    const k = rr(0.9, 1.1);
    [0, 0.28, 0.55].forEach((t, i) => {
      const d = 0.2, kk = k * (1 + 0.04 * (rnd() - 0.5));
      voice(o, t, d, pts(0, 520 * kk, 0.05, 560 * kk, d, 430 * kk), ar(0.01, 0.1, d), { formants: VOW.a, fs: 1.3, rough: 0.55, breath: 0.2, amp: 1 - 0.12 * i });
    });
  } },
  'phoenix-screech': { dur: 0.95, make(o) { // a whoosh of flame and a soaring "kreee-aah"
    const k = rr(0.93, 1.07), d = 0.6;
    noise(o, 0, 0.8, hump(0.8, 1.3), { amp: 0.7, color: 'pink', filt: ['lp', pts(0, 400, 0.35, 2600, 0.8, 900), 0.8] });
    voice(o, 0.08, d, pts(0, 900 * k, 0.1, 1300 * k, 0.4, 1150 * k, d, 820 * k), ar(0.03, 0.25, d), { formants: (t) => mix(VOW.i, VOW.a, Math.min(1, t / 0.35)), fs: 1.35, breath: 0.12, vib: 0.035, vibRate: 8, amp: 0.85 });
    for (let j = 0; j < 4; j++) bell(o, 0.15 + j * 0.09, rr(2200, 3400), 0.07, 0.12); // sparks
  } },
  'phoenix-rebirth': { dur: 1.3, hp: 110, make(o) { // a swirl of fire rises; a magic chime: it will come back
    const k = rr(0.95, 1.05), d = 1.1;
    noise(o, 0, d, ar(0.15, 0.45, d), { amp: 1, color: 'pink', filt: ['bp', glide(300 * k, 2400 * k, d), 0.9], am: (t) => 0.7 + 0.3 * Math.sin(TAU * (3 * t + 4 * t * t)) });
    noise(o, 0, 0.6, perc(0.02, 0.2), { amp: 0.5, color: 'brown', filt: ['lp', 600] });
    crackle(o, 0.05, d, 50, ar(0.1, 0.4, d), { amp: 0.35, filt: ['bp', 2600, 1] });
    [784, 988, 1175, 1568, 1976].forEach((f, j) => bell(o, 0.25 + j * 0.13, f * k, 0.22, 0.3));
  } },
  'egg-hatch': { dur: 0.95, make(o) { // crack ... crack ... pop! cheep cheep, and a little flame wakes
    const k = rr(0.94, 1.06);
    [0, 0.16].forEach((t, i) => {
      crackle(o, t, 0.06, 900, perc(0.001, 0.02), { amp: 0.9, filt: ['bp', 3000 * k, 1.2], len: 0.0006 });
      modal(o, t, [[2300 * k, 0.012, 0.5], [3600 * k, 0.008, 0.3]], { amp: 0.6 + 0.3 * i });
    });
    tone(o, 0.3, 0.09, glide(420 * k, 1000 * k, 0.03), perc(0.002, 0.03), { amp: 0.6 });
    chirpVoice(o, 0.42, 1900 * k, 2500 * k, 0.09, 0.5); chirpVoice(o, 0.56, 2000 * k, 2700 * k, 0.1, 0.55);
    noise(o, 0.35, 0.5, hump(0.5, 1.2), { amp: 0.35, color: 'pink', filt: ['lp', glide(600, 2200, 0.5), 0.8] });
    bell(o, 0.4, 1568 * k, 0.25, 0.3); bell(o, 0.5, 2093 * k, 0.25, 0.25);
  } },
  'egg-crunch': { dur: 0.42, make(o) { // an eggshell crunches; a small sad pip
    const k = rr(0.92, 1.08);
    crackle(o, 0, 0.14, (t) => 1600 * Math.exp(-t / 0.05), 1, { amp: 1, filt: ['bp', 2800 * k, 1], len: 0.0005 });
    for (let j = 0; j < 8; j++) { const t = Math.pow(rnd(), 1.5) * 0.25; modal(o, t, [[rr(2500, 5000), rr(0.008, 0.02), 1]], { amp: rr(0.15, 0.35) * (1 - t) }); }
    tone(o, 0.12, 0.2, glide(1500 * k, 900 * k, 0.15), ar(0.01, 0.08, 0.2), { amp: 0.25 });
  } },
  'snow-splat': { dur: 0.38, make(o) { // pfumf: soft snow, a crunch, powder settling
    const k = rr(0.9, 1.1);
    noise(o, 0, 0.2, perc(0.002, 0.045), { amp: 1, filt: ['lp', 1600 * k, 0.7] });
    crackle(o, 0, 0.2, (t) => 700 * Math.exp(-t / 0.06), 1, { amp: 0.55, filt: ['bp', 2200 * k, 0.9] });
    thump(o, 0, 220 * k, 140, 0.02, 0.5);
    noise(o, 0.03, 0.3, perc(0.01, 0.08), { amp: 0.2, filt: [['hp', 3500], ['lp', 7000]] });
  } },
  'freeze-solid': { dur: 0.8, make(o) { // ice creeps over it, then: tsing
    const k = rr(0.94, 1.06), d = 0.35;
    crackle(o, 0, d, (t) => 300 + 1500 * t / d, ar(0.02, 0.06, d), { amp: 0.8, filt: ['bp', glide(1800 * k, 4200 * k, d), 1.2], len: 0.0005 });
    for (let j = 0; j < 6; j++) modal(o, 0.04 + j * 0.05, [[rr(2600, 4400) * k, rr(0.03, 0.06), 1]], { amp: 0.25 });
    bell(o, d, 2637 * k, 0.3, 0.45); bell(o, d + 0.01, 3951 * k, 0.22, 0.25);
    tone(o, d, 0.12, glide(380, 260, 0.1), perc(0.002, 0.03), { amp: 0.25 }); // the block sets: tok
  } },
  revolver: { dur: 0.36, drive: 1.6, make(o) { // a toy cap gun: PAK, the cylinder rings
    const k = rr(0.93, 1.07);
    click(o, 0, 4000, 0.0015, 1);
    noise(o, 0, 0.09, perc(0.0006, 0.016), { amp: 1.3, filt: ['bp', glide(3400 * k, 1500, 0.04), 1] });
    thump(o, 0, 360 * k, 160, 0.02, 0.45);
    noise(o, 0.006, 0.3, perc(0.008, 0.05), { amp: 0.28, filt: ['lp', glide(1800, 600, 0.2), 0.7] });
    metal(o, 0.002, 2900 * k, 0.03, 0.18);
  } },
  'lasso-twirl': { dur: 0.62, make(o) { // round and round, then off it flies
    const k = rr(0.92, 1.08);
    [0, 0.14, 0.26].forEach((t, i) => whoosh(o, t, 0.13, 500 * k, (900 + 250 * i) * k, 600 * k, 0.45 + 0.1 * i, 1.6));
    whoosh(o, 0.36, 0.24, 700 * k, 1900 * k, 900 * k, 0.9, 1.4);
  } },
  'lasso-snap': { dur: 0.45, make(o) { // the rope snaps tight: thwip, creak, yoink!
    const k = rr(0.92, 1.08);
    noise(o, 0, 0.04, perc(0.0005, 0.007), { amp: 1, filt: ['bp', 1800 * k, 1] });
    creak(o, 0.01, 0.16, glide(200, 90, 0.16), ar(0.01, 0.08, 0.16), { f: 800 * k, q: 4, amp: 0.6 });
    tone(o, 0.03, 0.3, glide(300 * k, 1100 * k, 0.22), ar(0.01, 0.08, 0.3), { amp: 0.4, vib: 0.01, vibRate: 7 });
  } },
  'straw-rustle': { dur: 0.62, make(o) { // the straw shakes, the pole creaks
    const d = 0.5;
    crackle(o, 0, d, (t) => 40 + 400 * Math.sin(Math.PI * Math.min(1, t / d)), hump(d, 0.7), { amp: 0.9, filt: ['bp', rr(1800, 2400), 0.8], len: 0.0011 });
    noise(o, 0, d, hump(d, 1.2), { amp: 0.3, filt: ['bp', 1400, 0.8], am: (t) => 0.5 + 0.5 * Math.abs(Math.sin(TAU * 6 * t)) });
    creak(o, 0.1, 0.45, pts(0, 70, 0.2, 110, 0.45, 60), ar(0.05, 0.15, 0.45), { f: 600, q: 6, amp: 0.45 });
  } },
  'bog-gloop': { dur: 0.8, hp: 100, make(o) { // GLORP: up out of the mud
    const k = rr(0.9, 1.1);
    tone(o, 0, 0.45, pts(0, 170 * k, 0.1, 400 * k, 0.45, 150 * k), ar(0.01, 0.2, 0.45), { amp: 0.9, vib: 0.06, vibRate: 11 });
    noise(o, 0, 0.4, perc(0.004, 0.1), { amp: 0.7, filt: ['bp', (t) => 520 + 300 * Math.sin(TAU * 16 * t), 3] });
    noise(o, 0, 0.12, perc(0.002, 0.03), { amp: 0.5, filt: ['lp', 900] });
    bubbles(o, 0.1, 0.6, 7, { amp: 0.3, lo: 220, hi: 500 });
  } },
  'bog-bubbles': { dur: 0.5, make(o) { // blub blub
    bubbles(o, 0, 0.4, 5, { amp: 0.8, lo: 200, hi: 420 });
    noise(o, 0, 0.45, hump(0.45, 1.5), { amp: 0.15, filt: ['bp', 500, 2] });
  } },
  'baby-giggle': { dur: 0.62, make(o) { // hee-hee-hee-hee
    const k = rr(0.92, 1.1);
    for (let j = 0; j < 4; j++) {
      const t = j * 0.12, d = 0.09, f = (600 - 25 * j) * k;
      voice(o, t, d, glide(f * 1.08, f * 0.92, d), ar(0.008, 0.04, d), { formants: VOW.e, fs: 1.45, breath: 0.3, amp: 1 - 0.1 * j });
    }
    noise(o, 0, 0.5, hump(0.5, 1), { amp: 0.06, filt: ['bp', 2500, 1] });
  } },
  'baby-wail': { dur: 1.5, make(o) { // "waaaah", sob, sob
    const k = rr(0.94, 1.06), d = 1.05;
    voice(o, 0, d, pts(0, 380 * k, 0.15, 560 * k, 0.7, 520 * k, d, 430 * k), ar(0.06, 0.3, d), { formants: (t) => mix(VOW.e, VOW.a, Math.min(1, t / 0.2)), fs: 1.35, vib: 0.035, vibRate: 6.5, breath: 0.12, amp: 1 });
    [1.12, 1.27].forEach((t, i) => voice(o, t, 0.1, glide(480 * k, 400 * k, 0.1), ar(0.01, 0.05, 0.1), { formants: VOW.uh, fs: 1.3, breath: 0.35, amp: 0.45 - 0.1 * i }));
  } },
  'baby-plop': { dur: 0.85, drive: 1.5, hp: 105, make(o) { // BUMF, the nappy squeaks, dust puffs up
    const k = rr(0.94, 1.06);
    thump(o, 0, 175 * k, 100, 0.1, 1.2);
    noise(o, 0, 0.35, perc(0.004, 0.08), { amp: 0.7, filt: ['lp', 600] });
    tone(o, 0.04, 0.22, glide(900 * k, 1350 * k, 0.15), ar(0.01, 0.06, 0.22), { amp: 0.35, vib: 0.05, vibRate: 28 });
    noise(o, 0.05, 0.6, perc(0.02, 0.16), { amp: 0.2, filt: ['bp', 900, 0.8] });
  } },
  'baby-rattle': { dur: 0.36, make(o) { // a hollow plastic bonk, the beads inside
    const k = rr(0.92, 1.08);
    modal(o, 0, [[620 * k, 0.03, 1], [1470 * k, 0.02, 0.5], [2650 * k, 0.012, 0.3]]);
    thump(o, 0, 240 * k, 150, 0.02, 0.5);
    for (let j = 0; j < 10; j++) { const t = 0.01 + Math.pow(rnd(), 0.8) * 0.25; modal(o, t, [[rr(3000, 5200), 0.006, 1]], { amp: rr(0.12, 0.3) * (1 - t * 2) }); }
  } },

  // ---------------------------------------------------------------- OURS: Part 2 step 8 (made units)
  'wing-dive': { dur: 0.62, make(o) { // a made flyer folds its wings (one big flap, the leather snaps) and drops: a rushing whoosh
    const k = rr(0.92, 1.08);
    noise(o, 0, 0.2, hump(0.18, 1.8), { amp: 0.9, filt: ['lp', glide(900 * k, 420 * k, 0.18), 0.8] }); // the last beat, wings tuck in
    noise(o, 0.12, 0.05, perc(0.001, 0.012), { amp: 0.45, filt: ['bp', 760 * k, 1.4] });                // snap
    whoosh(o, 0.14, 0.46, 420 * k, 1900 * k, 700 * k, 1, 1.2);                                           // falls through the air
    noise(o, 0.14, 0.46, hump(0.46, 1.2), { amp: 0.3, color: 'pink', filt: ['lp', 650] });               // body of the rush
  } },
  'ufo-swoop': { dur: 0.6, make(o) { // the saucer tips and swoops down: its warble slides down and back up, a soft air rush
    const k = rr(0.94, 1.06), d = 0.55;
    const f = (t) => 440 * k * (1 - 0.42 * Math.sin(Math.PI * Math.min(1, t / d))) * (1 + 0.05 * Math.sin(TAU * 9 * t));
    tone(o, 0, d, f, ar(0.03, 0.18, d), { w: 'tri', amp: 0.55 });
    tone(o, 0, d, (t) => 1.013 * f(t), ar(0.03, 0.18, d), { amp: 0.35 });           // two tones beating, as the hover hum
    tone(o, 0, d, (t) => 0.5 * f(t), ar(0.05, 0.2, d), { w: 'saw', amp: 0.18, filt: ['lp', 1100] });
    whoosh(o, 0.04, 0.48, 600 * k, 1700 * k, 800 * k, 0.45, 1.3);
  } },
  'drink-slurp': { dur: 1.6, loop: true, wrap: true, make(o) { // clinging on and drinking: three wet sucks, a gulp after each
    [0.05, 0.6, 1.1].forEach((t, i) => {
      const k = rr(0.9, 1.1), d = rr(0.22, 0.3);
      noise(o, t, d, ar(0.03, 0.08, d), { amp: 0.8, filt: ['bp', glide(500 * k, 1400 * k, d), 3.5], am: (x) => 0.55 + 0.45 * Math.sin(TAU * 31 * x) }); // slurrp
      tone(o, t + d + 0.03, 0.1, glide(300 * k, 170 * k, 0.08), perc(0.004, 0.035), { amp: 0.55 - 0.08 * i }); // glk
      noise(o, t + d + 0.03, 0.06, perc(0.002, 0.015), { amp: 0.25, filt: ['bp', 900 * k, 2] });
    });
  } },

  // --- ambient beds (loops)
  'amb-lava': { dur: 3.0, loop: true, make(o) { // ours (step 7): lava on the field churns and blorps
    const d = o.length / SR;
    noise(o, 0, d, 1, { amp: 0.7, color: 'brown', filt: [['lp', 520, 0.7], ['hp', 120]], am: (t) => 0.75 + 0.25 * Math.sin(TAU * t / 1.5) });
    for (let j = 0; j < 9; j++) {
      const t = rnd() * (d - 0.3), f = rr(150, 260), dd = rr(0.05, 0.09);
      tone(o, t, dd * 3, glide(f, f * rr(1.5, 2.2), dd), perc(0.004, dd), { amp: rr(0.4, 0.8) }); // blorp ...
      noise(o, t + dd, 0.03, perc(0.001, 0.006), { amp: 0.2, filt: ['bp', 1500, 1] });         // ... pop
    }
    crackle(o, 0, d, 6, 1, { amp: 0.25, filt: ['bp', 3200, 1] }); // a spit now and then
  } },
  'amb-fire': { dur: 3.0, loop: true, make(o) {
    const d = o.length / SR;
    noise(o, 0, d, 1, { amp: 1, color: 'brown', filt: [['lp', 900, 0.7], ['hp', 150]], am: (t) => 0.85 + 0.15 * Math.sin(TAU * 4 * t) });
    crackle(o, 0, d, 18, 1, { amp: 0.7, filt: ['bp', 2600, 1] });
  } },
  'amb-water': { dur: 3.0, loop: true, make(o) {
    const d = o.length / SR;
    noise(o, 0, d, 1, { amp: 1, filt: ['bp', 900, 0.5], am: (t) => 0.75 + 0.25 * Math.sin(TAU * t / 1.5) * Math.sin(TAU * t) });
    bubbles(o, 0, d, 18, { amp: 0.25, lo: 400, hi: 1000 });
  } },
  'amb-gallop': { dur: 2.4, loop: true, wrap: true, make(o) {
    const cyc = 0.4, d = 2.4;
    for (let h = 0; h < 3; h++) {
      const off = rnd() * cyc;
      for (let c = 0; c < d / cyc; c++) [0, 0.07, 0.14].forEach((s, j) => wood(o, (off + c * cyc + s) % d, 900 + 100 * h + 60 * j, 0.022, j === 2 ? 1 : 0.7));
    }
    noise(o, 0, d, 1, { amp: 0.08, filt: ['lp', 400] });
  } },
  'amb-slither': { dur: 2.0, loop: true, make(o) {
    const d = o.length / SR;
    noise(o, 0, d, 1, { amp: 1, filt: [['bp', 2500, 0.7], ['lp', 5500]], am: (t) => 0.55 + 0.25 * Math.sin(TAU * 1.5 * t) + 0.2 * Math.sin(TAU * 3.5 * t) });
    noise(o, 0, d, 1, { amp: 0.4, filt: ['bp', 800, 1], am: (t) => 0.6 + 0.4 * Math.sin(TAU * 2 * t) });
  } },
  'amb-march': { dur: 2.0, loop: true, wrap: true, make(o) {
    for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) {
      const t = s * 0.5 + rnd() * 0.02;
      step(o, t, rr(0.6, 1), 1300);
      modal(o, t + 0.01, [[rr(3000, 3400), 0.03, 0.08], [rr(4500, 4900), 0.02, 0.05]]);
    }
  } },
  'amb-march-crowd': { dur: 2.0, loop: true, wrap: true, make(o) {
    for (let s = 0; s < 4; s++) for (let f = 0; f < 12; f++) {
      const t = s * 0.5 + rnd() * 0.04;
      step(o, t, rr(0.4, 0.8), 1200);
      if (f % 2 === 0) modal(o, t + 0.01, [[rr(2900, 3500), 0.03, 0.06], [rr(4400, 5000), 0.02, 0.04]]);
    }
    noise(o, 0, 2.0, 1, { amp: 0.04, filt: ['lp', 500] });
  } },
};

// ---------------------------------------------------------------- render
const XF = Math.round(0.25 * SR); // loop crossfade
function hpInPlace(o, f) { const b1 = new Biquad('hp', f, 0.707), b2 = new Biquad('hp', f, 0.707); for (let i = 0; i < o.length; i++) o[i] = b2.run(b1.run(o[i])); }
function lpInPlace(o, f) { const b = new Biquad('lp', f, 0.6); for (let i = 0; i < o.length; i++) o[i] = b.run(o[i]); }
function peakOf(o) { let p = 0; for (let i = 0; i < o.length; i++) { const a = Math.abs(o[i]); if (a > p) p = a; } return p; }
function rmsMax(o, win = Math.round(0.05 * SR)) {
  let s = 0, m = 0;
  for (let i = 0; i < o.length; i++) { s += o[i] * o[i]; if (i >= win) s -= o[i - win] * o[i - win]; if (s > m) m = s; }
  return Math.sqrt(Math.max(0, m) / Math.min(win, o.length));
}

export function variantCount(id) {
  const r = RECIPES[id];
  if (!r) return 0;
  if (r.variants) return r.variants;
  return r.loop ? 1 : r.dur > 0.6 ? 2 : 3;
}
export function isLoop(id) { return !!(RECIPES[id] && RECIPES[id].loop); }

export function render(id, v = 0) {
  const R = RECIPES[id];
  if (!R) return null;
  rnd = rngFrom(hashStr(id) * 31 + v * 7919 + 1);
  const L = Math.round(R.dur * SR);
  const o = new Float32Array(R.loop ? L + XF : L);
  R.make(o, v);
  hpInPlace(o, R.hp || 95); // phone speakers: no deep sub-bass, no DC
  lpInPlace(o, R.lp || 9000);
  if (R.drive) { const p = peakOf(o) || 1, d = R.drive, n = Math.tanh(d); for (let i = 0; i < o.length; i++) o[i] = Math.tanh((d * o[i]) / p) / n; }
  let out = o;
  if (R.loop) {
    out = o.slice(0, L);
    if (R.wrap) for (let i = 0; i < XF; i++) out[i] += o[L + i];          // patterned loop: tails wrap to the start
    else for (let i = 0; i < XF; i++) { const u = i / XF; out[i] = o[i] * Math.sqrt(u) + o[L + i] * Math.sqrt(1 - u); } // crossfade
  } else {
    const fi = 12, fo = Math.min(240, out.length >> 2);
    for (let i = 0; i < fi; i++) out[i] *= i / fi;
    for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  }
  // loudness: peak 0.9, and short-term RMS at most 0.3 (0.2 for beds)
  const p = peakOf(out), r = rmsMax(out);
  const g = Math.min(0.9 / (p || 1), (R.loop ? 0.2 : 0.3) / (r || 1));
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}
