// Link between the art renderer's canvases and the WebGL batcher (render/gl2d.js). Owner: RENDER.
// With WebGL (the default) the main canvas draws through gl2d: atlas pages and the ground / terrain / oil layers are
// CPU canvases (cheap to paint into and to copy changed rects from) and every change is copied to its GL texture here.
// Without WebGL (?gl=0, no WebGL2, the debug renderer) every call is a no-op and the canvases stay GPU canvases.
export const GPU = { gl: null };

/** A canvas the main canvas draws from (ground, terrain, oil). */
export function layerCanvas() {
  const cv = document.createElement('canvas');
  cv.getContext('2d', GPU.gl ? { willReadFrequently: true } : undefined);
  return cv;
}
/** Atlas page p (sprites.js). A new canvas for a slot (eviction, flush) reuses that slot's GL texture. */
export function pageCanvas(p, size) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  if (GPU.gl) { cv.getContext('2d', { willReadFrequently: true }); GPU.gl.pageSlot(cv, p); }
  return cv;
}
/** A sprite was just copied into page cv at (x, y, w, h) from the top-left of src. */
export function stored(cv, x, y, w, h, src) { if (GPU.gl) GPU.gl.storeRect(cv, x, y, w, h, src); }
/** Device px rect (x, y, w, h) of a layer canvas changed. */
export function touched(cv, x, y, w, h) { if (GPU.gl) GPU.gl.touch(cv, x, y, w, h); }
