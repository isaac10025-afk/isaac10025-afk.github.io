// AUDIO public API (one shared engine). Used by UI (main.js / ui/*.js).
//
//   init({W})                      once at boot; unlocks on the first touch/click/key (iOS + Android)
//   handleEvents(game.drainEvents()) once per drawn frame, even with []   (sim events -> sounds)
//   update(world, {paused, footfalls}) once per drawn frame: beds, footsteps, flamer roars, mine pings
//   play(name, {x, vol})           one named sound (x = field px for pan)
//   setMuted(b) / isMuted() / toggleMuted()   saved in localStorage 'paint-battle:muted'; default on (OG)
//   ui() / win()                   button click / a side wins (OG game.js:6549-6555)
//   placed(type, x, count)         units painted this move (OG game.js:6504-6547)
//   pour(x, len) / freeze(x, len)  water / ice brush moved len px (len 0 = stroke start)
//   mined(x, count)                mines laid this move
//   setField(W)                    field width in sim px (pan); update() also reads world.W
//   mapsPanel(open) / lockedCard() / foundCard()   step 7 UI: paper rustle as the maps panel opens / closes, a padlock
//                                  rattle for a locked Secret card, a paper pop as the Found card lands (its fanfare and
//                                  the map's page flip come from the sim's `secret` / `map` events)
//   setMadeLookup(recipeOf)        step 8: made units' recipes (body, weapon) for their sounds. Optional: in the browser the
//                                  audio finds sim/maker recipeOf by itself (main.js has loaded the maker first)

import { AudioEngine } from './engine.js';
export { AudioEngine } from './engine.js';
export { SOUNDS, EVENTS, voicesFor, SOUND, OWN_SOUNDS, OWN_EVENTS, OWN_EVENTS7, eventVoices, setMadeLookup } from './rules.js';

let eng = null;
const E = () => eng;

export function init(opts = {}) {
  if (!eng) eng = new AudioEngine(opts);
  eng.install();
  return eng;
}
export function engine() { return eng; }
export function play(name, opts) { return E() ? eng.playNamed(name, opts) : false; }
export function setMuted(b) { return E() ? eng.setMuted(b) : !!b; }
export function isMuted() { return E() ? eng.muted : false; }
export function toggleMuted() { return E() ? eng.toggleMuted() : false; }
export function handleEvents(events) { if (E()) eng.handleEvents(events); }
// main.js calls update(paused, world); the engine wants update(world, {paused}). Accept both.
export function update(a, b) {
  if (!E()) return;
  if (typeof a === 'boolean') eng.update(b, { paused: a });
  else eng.update(a, b);
}
export function unlock() { if (E() && typeof eng.unlock === 'function') eng.unlock(); }
// main.js / ui/input.js report each paint move as onPaint(tool, x, y, n, segLen): route it to the OG paint sounds.
export function onPaint(tool, x, y, n, len) {
  if (!E() || !tool) return;
  switch (tool.kind) {
    case 'unit': if (n > 0) eng.placed(tool.type, x, n); break;
    case 'water': eng.pour(x, len || 0); break;
    case 'ice': eng.freeze(x, len || 0); break;
    case 'mine': if (n > 0) eng.mined(x, n); break;
    default: break;
  }
}
export function ui(id) { if (E()) eng.ui(id); }
export function win() { if (E()) eng.win(); }
export function placed(type, x, count = 1) { if (E()) eng.placed(type, x, count); }
export function pour(x, len) { if (E()) eng.pour(x, len); }
export function freeze(x, len) { if (E()) eng.freeze(x, len); }
export function mined(x, count = 1) { if (E()) eng.mined(x, count); }
export function setField(W) { if (E() && W > 0) eng.W = W; }
// OURS (step 7): the maps panel and the Secret tab (main.js). Played in the middle, like OG's ui().
const FOUND_LANDS = 0.3; // s: the Found card's pop-in (index.html found-in, 0.55 s) reaches full size about here
export function mapsPanel(open) { if (E()) eng.playNamed('paper-rustle', open ? { vol: 1, rate: 1 } : { vol: 0.8, rate: 1.15 }); }
export function lockedCard() { if (E()) eng.playNamed('padlock'); }
export function foundCard() { if (E()) eng.playNamed('paper-pop', { delay: FOUND_LANDS }); }
export function dispose() { if (E()) { eng.dispose(); eng = null; } }
