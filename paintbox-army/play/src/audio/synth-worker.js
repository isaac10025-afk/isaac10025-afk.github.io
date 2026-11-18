// AUDIO: makes our sounds off the main thread, so the warm-up never costs the game a frame.
// in: { ids: [...] }   out (one message per sound): { id, data: [Float32Array per variant] } (transferred)
import { render, variantCount } from './synth.js';

self.onmessage = (e) => {
  const ids = (e.data && e.data.ids) || [];
  for (const id of ids) {
    const data = [];
    for (let v = 0; v < variantCount(id); v++) data.push(render(id, v));
    self.postMessage({ id, data }, data.map((d) => d.buffer));
  }
  self.postMessage({ done: true });
};
