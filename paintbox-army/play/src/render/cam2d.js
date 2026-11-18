// Camera for the canvas-2D fallback (?gl=0, no WebGL2): the same setCamera / setMip / setClear as gl2d.js, done by
// multiplying the camera into every setTransform. getTransform answers without the camera (the renderer saves a
// transform and sets it back later: the gator's jaws). Owner: lead (Part 2 step 2).
export function wrapCam(raw) {
  let Z = 1, E = 0, F = 0, clear = null;
  const over = {
    setCamera(z, tx, ty) {
      Z = z; E = tx; F = ty;
      if (clear) { raw.setTransform(1, 0, 0, 1, 0, 0); raw.globalAlpha = 1; raw.globalCompositeOperation = 'source-over'; raw.fillStyle = clear; raw.fillRect(0, 0, raw.canvas.width, raw.canvas.height); }
      raw.setTransform(Z, 0, 0, Z, E, F);
    },
    setMip() {},
    setClear(css) { clear = css; },
    setTransform(a, b, c, d, e, f) {
      if (typeof a === 'object' && a) ({ a, b, c, d, e, f } = a);
      raw.setTransform(Z * a, Z * b, Z * c, Z * d, Z * e + E, Z * f + F);
    },
    resetTransform() { raw.setTransform(Z, 0, 0, Z, E, F); },
    getTransform() {
      const m = raw.getTransform(), iz = 1 / Z;
      return new DOMMatrix([m.a * iz, m.b * iz, m.c * iz, m.d * iz, (m.e - E) * iz, (m.f - F) * iz]);
    },
  };
  const bound = new Map();
  return new Proxy(raw, {
    get(t, p) {
      if (Object.prototype.hasOwnProperty.call(over, p)) return over[p];
      const v = t[p];
      if (typeof v !== 'function') return v;
      let b = bound.get(p); if (!b) { b = v.bind(t); bound.set(p, b); }
      return b;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
