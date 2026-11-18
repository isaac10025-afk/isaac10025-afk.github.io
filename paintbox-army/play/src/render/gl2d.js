// WebGL2 batch renderer behind a small Canvas 2D look-alike. Owner: RENDER.
// Why (Samsung S23 FE, 2026-11-13): a battle with ~30 sprite kinds sorted by y fell to 15 fps while the main thread sat
// half idle. Canvas 2D turns each drawImage that jumps to another sprite / atlas page into its own GPU draw. Here a
// frame's sprites, effects and lines go into one vertex buffer and draw in one call per 12 textures (usually 1-2).
// The art renderer keeps calling the 2D API it always used; this object answers that subset:
//   setTransform / getTransform / resetTransform / transform / translate / rotate / scale / save / restore,
//   globalAlpha, globalCompositeOperation ('source-over', 'lighter'), drawImage (3 / 5 / 9 args), fillRect, clearRect,
//   paths (moveTo / lineTo / arc / ellipse / rect / quadratic + bezier / closePath) with stroke and fill.
// Same pixels as canvas: premultiplied alpha, bilinear sampling, 'lighter' adds (alpha 0 in premultiplied blending).
// Lines: a band per segment and a disc per joint / round cap, both anti-aliased in the shader. A see-through stroke
// uses the stencil so its overlaps blend once, as canvas does. Fills: an ellipse / circle is drawn exactly
// (anti-aliased), any other path as a fan (convex only, no AA; nothing in the field draws one).
// Textures (render/art/gpu.js): atlas pages upload each sprite as it is baked; the ground / terrain / oil layers upload
// the rects they changed. Context lost (phone app in the background): draws are skipped; on restore every texture
// re-uploads from its canvas.
import { GPU } from './art/gpu.js';

const UNITS = 12;                                   // textures per draw (WebGL2 guarantees 16 units; 15 = uploads)
const S_BAND = 13, S_DISC = 14, S_FLAT = 15, HARD = 32;
const MAXQ = 16384;                                 // quads per draw (16-bit indices)
const FPQ = 24;                                     // 32-bit words per quad: 4 vertices x (x y u v rgba slot)
const TAU = Math.PI * 2;

const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_col;
layout(location = 3) in uint a_slot;
uniform vec2 u_px;
uniform vec3 u_cam;   // camera (Part 2 step 2): screen = pos * zoom + (tx, ty), device px
out vec2 v_uv; out vec4 v_col; flat out uint v_slot;
void main() { v_uv = a_uv; v_col = a_col; v_slot = a_slot; vec2 p = a_pos * u_cam.x + u_cam.yz; gl_Position = vec4(p.x * u_px.x - 1.0, 1.0 - p.y * u_px.y, 0.0, 1.0); }`;
function fragSource() {
  let decl = '', pick = '';
  for (let i = 0; i < UNITS; i++) { decl += `uniform sampler2D t${i};\n`; pick += `${i ? 'else ' : ''}if (sl == ${i}u) s = textureGrad(t${i}, v_uv, gx, gy);\n`; }
  return `#version 300 es
precision highp float;
${decl}in vec2 v_uv; in vec4 v_col; flat in uint v_slot;
out vec4 o;
void main() {
  vec2 gx = dFdx(v_uv), gy = dFdy(v_uv);
  uint sl = v_slot & 31u;
  vec4 s = vec4(1.0);
  if (sl < ${UNITS}u) {
${pick}  } else if (sl != ${S_FLAT}u) {
    float d, w;
    if (sl == ${S_BAND}u) { d = 1.0 - abs(v_uv.x); w = length(vec2(gx.x, gy.x)); }
    else { float l = length(v_uv); vec2 n = v_uv / max(l, 1e-6); d = 1.0 - l; w = length(vec2(dot(n, gx), dot(n, gy))); }
    if ((v_slot & ${HARD}u) != 0u) { if (d < 0.0) discard; }
    else s = vec4(clamp(d / max(w, 1e-6) + 0.5, 0.0, 1.0));
  }
  o = s * v_col;
}`;
}

// ---------------------------------------------------------------- colours (CSS string -> 0xAABBGGRR, not premultiplied)
const colours = new Map();
let probe = null;
function parseColour(s) {
  if (typeof s !== 'string') return 0xff808080;
  let v = colours.get(s);
  if (v !== undefined) return v;
  let r = 128, g = 128, b = 128, a = 255;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex && (hex[1].length === 3 || hex[1].length === 6 || hex[1].length === 8)) {
    const h = hex[1];
    if (h.length === 3) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
    else { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); if (h.length === 8) a = parseInt(h.slice(6, 8), 16); }
  } else {
    let t = s;
    if (!/^rgba?\(/i.test(t)) { // named colour etc.: let a 2D context normalise it
      if (!probe) probe = document.createElement('canvas').getContext('2d');
      probe.fillStyle = '#808080'; probe.fillStyle = s; t = probe.fillStyle;
    }
    if (t[0] === '#') { colours.set(s, v = parseColour(t)); return v; }
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(t);
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) * 2.55 : +m[4] * 255; }
  }
  v = ((Math.round(a) & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
  colours.set(s, v);
  return v;
}

let warned = new Set();
function warnOnce(what) { if (!warned.has(what)) { warned.add(what); console.warn('gl2d: not supported, skipped:', what); } }

class GL2D {
  constructor(canvas, gl) {
    this.canvas = canvas; this.gl = gl; this.isGL = true; this.lost = false;
    // 2D state
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    this.globalAlpha = 1; this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
    this.imageSmoothingEnabled = true; this.imageSmoothingQuality = 'low'; this.filter = 'none';
    this.stack = [];
    this.subs = []; this.cur = null; this.lastX = 0; this.lastY = 0;
    // batch
    this.buf = new ArrayBuffer(MAXQ * FPQ * 4); this.f32 = new Float32Array(this.buf); this.u32 = new Uint32Array(this.buf);
    this.nq = 0; this.units = []; this.nUnits = 0; this.batch = 0; this.open = false; this.queued = false;
    this.stencilRef = 0;
    this.cam = [1, 0, 0]; this.mip = false; this.clearRGB = null;   // camera (zoom, tx, ty), mipmaps on atlas pages, frame clear colour
    // textures: canvas -> entry; slots = atlas pages
    this.map = new Map(); this.entries = new Set(); this.slots = [];
    this.draws = 0; this.quads = 0; this.uploads = 0; this.uploadPx = 0; this.lastDraws = 0; this.lastQuads = 0;
    this.endFrame = this.endFrame.bind(this);
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); this.lost = true; this.nq = 0; this.nUnits = 0; });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false; this.clearFB = null;
      for (const e of this.entries) { e.tex = null; e.full = true; e.dirty = null; e.mipOn = false; e.mipDirty = true; }
      if (!this.initGL()) this.lost = true;
    });
  }
  initGL() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) { console.warn('gl2d shader', gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, fragSource());
    if (!vs || !fs) return false;
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) { console.warn('gl2d link', gl.getProgramInfoLog(p)); return false; }
    this.prog = p; gl.useProgram(p);
    for (let i = 0; i < UNITS; i++) gl.uniform1i(gl.getUniformLocation(p, 't' + i), i);
    this.uPx = gl.getUniformLocation(p, 'u_px');
    this.uCam = gl.getUniformLocation(p, 'u_cam');
    gl.uniform3f(this.uCam, this.cam[0], this.cam[1], this.cam[2]);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 24, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribIPointer(3, 1, gl.UNSIGNED_INT, 24, 20);
    const idx = new Uint16Array(MAXQ * 6);
    for (let q = 0, i = 0; q < MAXQ; q++) { const v = q * 4; idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2; idx[i++] = v + 2; idx[i++] = v + 1; idx[i++] = v + 3; }
    this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.vw = -1; this.vh = -1;
    return !gl.isContextLost();
  }

  // ---------------------------------------------------------------- frame + batch
  begin() {
    this.open = true; this.stencilRef = 0;
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    if (w !== this.vw || h !== this.vh) { this.vw = w; this.vh = h; gl.uniform2f(this.uPx, 2 / Math.max(1, w), 2 / Math.max(1, h)); }
    if (this.clearRGB) { const c = this.clearRGB; gl.clearColor(c[0], c[1], c[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (!this.queued) { this.queued = true; queueMicrotask(this.endFrame); } // safety: whatever is queued draws before the browser shows the frame
  }
  /** Draw what is queued; the next draw starts a new frame. The art renderer calls it at the end of draw(). */
  endFrame() {
    this.queued = false;
    this.flush();
    if (this.open) { this.open = false; this.lastDraws = this.draws; this.lastQuads = this.quads; this.draws = 0; this.quads = 0; }
  }
  flush() {
    if (this.nq > 0 && !this.lost) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.u32, gl.STREAM_DRAW, 0, this.nq * FPQ);   // fresh storage: no wait on the last draw
      for (let i = 0; i < this.nUnits; i++) {
        const e = this.units[i];
        gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, e.tex);
        if (e.page >= 0) {   // atlas pages: mipmaps while zoomed out (sprites shrunk 2x without them shimmer)
          if (this.mip) { if (e.mipDirty || !e.mipOn) { gl.generateMipmap(gl.TEXTURE_2D); if (!e.mipOn) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); e.mipDirty = false; e.mipOn = true; } }
          else if (e.mipOn) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); e.mipOn = false; }
        }
      }
      gl.drawElements(gl.TRIANGLES, this.nq * 6, gl.UNSIGNED_SHORT, 0);
      this.draws++; this.quads += this.nq;
    }
    this.nq = 0; this.nUnits = 0; this.batch++;
  }
  room() { if (!this.open) this.begin(); if (this.nq >= MAXQ) this.flush(); }
  unit(e) {
    if (e.stamp === this.batch) return e.unit;
    if (this.nUnits >= UNITS) this.flush();
    e.stamp = this.batch; e.unit = this.nUnits; this.units[this.nUnits++] = e;
    return e.unit;
  }
  // one quad: corners 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right (triangles 0 1 2, 2 1 3)
  quad(x0, y0, u0, v0, x1, y1, u1, v1, x2, y2, u2, v2, x3, y3, u3, v3, col, slot) {
    const f = this.f32, u = this.u32; let o = this.nq * FPQ;
    f[o] = x0; f[o + 1] = y0; f[o + 2] = u0; f[o + 3] = v0; u[o + 4] = col; u[o + 5] = slot; o += 6;
    f[o] = x1; f[o + 1] = y1; f[o + 2] = u1; f[o + 3] = v1; u[o + 4] = col; u[o + 5] = slot; o += 6;
    f[o] = x2; f[o + 1] = y2; f[o + 2] = u2; f[o + 3] = v2; u[o + 4] = col; u[o + 5] = slot; o += 6;
    f[o] = x3; f[o + 1] = y3; f[o + 2] = u3; f[o + 3] = v3; u[o + 4] = col; u[o + 5] = slot;
    this.nq++;
  }
  alpha() { const a = this.globalAlpha; return a > 1 ? 1 : a > 0 ? a : 0; }
  // premultiplied tint for a texture: rgb = alpha, a = alpha (0 when 'lighter': adds)
  tint(a) {
    const k = Math.round(a * 255) & 255;
    return ((this.globalCompositeOperation === 'lighter' ? 0 : k) << 24 | k << 16 | k << 8 | k) >>> 0;
  }
  // premultiplied solid colour from a CSS string and the global alpha
  solid(style, a) {
    const c = parseColour(style), al = a * ((c >>> 24) / 255);
    const r = Math.round((c & 255) * al), g = Math.round((c >>> 8 & 255) * al), b = Math.round((c >>> 16 & 255) * al);
    return ((this.globalCompositeOperation === 'lighter' ? 0 : Math.round(al * 255)) << 24 | b << 16 | g << 8 | r) >>> 0;
  }

  // ---------------------------------------------------------------- textures
  entry(img) {
    let e = this.map.get(img);
    if (e === undefined) {
      const w = img.width | 0, h = img.height | 0;
      if (!(w > 0 && h > 0)) return null;
      e = { cv: img, tex: null, w, h, dirty: null, full: true, stamp: -1, unit: 0, page: -1 };
      this.map.set(img, e); this.entries.add(e);
    }
    if (e.page < 0 && (e.w !== img.width || e.h !== img.height)) { e.w = img.width; e.h = img.height; e.full = true; e.dirty = null; }
    if (e.full || e.dirty) this.upload(e);
    return e;
  }
  newTex() {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  upload(e) {
    if (this.lost || !(e.w > 0 && e.h > 0)) return;
    this.flush();                                     // queued quads may use this texture's old pixels
    const gl = this.gl;
    if (!e.tex) { e.tex = this.newTex(); e.full = true; } else { gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, e.tex); }
    if (e.full) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, e.cv);
      this.uploads++; this.uploadPx += e.w * e.h;
    } else {
      const d = e.dirty;
      // Changed rects of a layer (ground, terrain, oil): read just that rect off the CPU canvas and upload those bytes.
      // Uploading straight from the canvas with UNPACK_SKIP made the browser snapshot the WHOLE canvas per upload: with
      // the big field (Part 2 step 2, ground = the whole world) and bodies painted into the ground (step 1) that was a
      // multi-Mpx copy on most battle frames (Samsung worst case 59 -> ~50 fps).
      const g2 = e.page < 0 && e.cv.getContext ? e.cv.getContext('2d', { willReadFrequently: true }) : null, area = e.w * e.h;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += Math.max(0, d[i + 2] - d[i]) * Math.max(0, d[i + 3] - d[i + 1]);
      if (!g2 || sum >= area / 2) {
        // Most of the canvas changed: ONE copy of the whole canvas. (Attack 11-16, L4: every rect of 1/4+ of the canvas went up
        // from the canvas itself, and each such upload snapshots the WHOLE canvas: a spreading oil slick touched its old and
        // its new box every frame = two 1720 x 3361 snapshots a frame, 50-100 ms draws on desktop with burning oil.)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, e.w, e.h, gl.RGBA, gl.UNSIGNED_BYTE, e.cv);
        this.uploads++; this.uploadPx += area;
      } else {
        for (let i = 0; i < d.length; i += 4) {
          const x = d[i], y = d[i + 1], w = d[i + 2] - x, h = d[i + 3] - y;
          if (w <= 0 || h <= 0) continue;
          // a big rect is read in bands of < 1/4 of the canvas (each read is just its own bytes)
          const bh = w * h < area / 4 ? h : Math.max(1, Math.floor(area / 4.5 / w));
          for (let y2 = y; y2 < y + h; y2 += bh) {
            const hh = Math.min(bh, y + h - y2);
            let img = null;
            try { img = g2.getImageData(x, y2, w, hh); } catch (err) { img = null; }
            if (img) gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y2, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, img);
            else {
              gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y2);
              gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y2, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, e.cv);
              gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
            }
            this.uploads++; this.uploadPx += w * hh;
          }
        }
      }
    }
    e.full = false; e.dirty = null; e.mipDirty = true;
  }
  /** gpu.js: canvas cv is now atlas page p (keeps the slot's texture: no 16 MB upload of an empty page). */
  pageSlot(cv, p) {
    const old = this.slots[p];
    if (old) { this.map.delete(old.cv); this.entries.delete(old); }
    const e = { cv, tex: old && !this.lost ? old.tex : null, w: cv.width, h: cv.height, dirty: null, full: false, stamp: -1, unit: 0, page: p, mipDirty: true, mipOn: old ? old.mipOn : false };
    // Attack 11-16 (L4): an evicted page keeps its texture, but the texture still held the old sprites. New sprites only
    // overwrite their own rects, so the 1 px gaps between them kept old opaque pixels and bilinear sampling drew them as
    // thin box lines round sprites (and mipmaps bled old sprites in). Clear it on the GPU (no upload); quads already queued
    // this frame draw first with the old pixels, as canvas does.
    if (e.tex && !this.lost) {
      this.flush();
      const gl = this.gl, fb = this.clearFB || (this.clearFB = gl.createFramebuffer());
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const c = this.clearRGB; if (c) gl.clearColor(c[0], c[1], c[2], 1);
    }
    if (!e.tex && !this.lost) {
      const gl = this.gl;
      e.tex = this.newTex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, e.w, e.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    if (this.lost) e.full = true;
    this.slots[p] = e; this.map.set(cv, e); this.entries.add(e);
  }
  /** gpu.js: a sprite was copied into page cv at (x, y, w, h) from the top-left of src. */
  storeRect(cv, x, y, w, h, src) {
    const e = this.map.get(cv);
    if (!e || this.lost || e.full || !e.tex) return;  // a full upload is due anyway
    this.flush();
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.uploads++; this.uploadPx += w * h; e.mipDirty = true;
  }
  /** gpu.js: device px rect of a layer canvas changed; copied before its next draw. */
  touch(cv, x, y, w, h) {
    const e = this.map.get(cv);
    if (!e || e.full) return;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(e.w, Math.ceil(x + w)), y1 = Math.min(e.h, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    let d = e.dirty;
    if (!d) { e.dirty = [x0, y0, x1, y1]; return; }
    for (let i = 0; i < d.length; i += 4) if (x0 >= d[i] && y0 >= d[i + 1] && x1 <= d[i + 2] && y1 <= d[i + 3]) return; // inside one already
    // overlaps one so much that their box is no bigger than the two apart (an old box + its new box): grow that one
    // instead, so the shared part is read + uploaded once (attack 11-16, L4)
    for (let i = 0; i < d.length; i += 4) {
      const a0 = Math.min(x0, d[i]), b0 = Math.min(y0, d[i + 1]), a1 = Math.max(x1, d[i + 2]), b1 = Math.max(y1, d[i + 3]);
      if ((a1 - a0) * (b1 - b0) <= (x1 - x0) * (y1 - y0) + (d[i + 2] - d[i]) * (d[i + 3] - d[i + 1])) { d[i] = a0; d[i + 1] = b0; d[i + 2] = a1; d[i + 3] = b1; return; }
    }
    d.push(x0, y0, x1, y1);
    if (d.length > 32) { // more than 8 rects: one box around them
      let a = 1e9, b = 1e9, c = -1, f = -1;
      for (let i = 0; i < d.length; i += 4) { a = Math.min(a, d[i]); b = Math.min(b, d[i + 1]); c = Math.max(c, d[i + 2]); f = Math.max(f, d[i + 3]); }
      e.dirty = [a, b, c, f];
    }
  }

  // ---------------------------------------------------------------- camera (Part 2 step 2)
  /** Every later draw is shown at screen = pos * z + (tx, ty) (device px). Call before drawing a frame. */
  setCamera(z, tx, ty) {
    const c = this.cam;
    if (c[0] === z && c[1] === tx && c[2] === ty) return;
    this.flush(); c[0] = z; c[1] = tx; c[2] = ty;
    if (!this.lost) this.gl.uniform3f(this.uCam, z, tx, ty);
  }
  /** Mipmaps for atlas pages on/off (on while zoomed out). */
  setMip(on) { if (this.mip !== !!on) { this.flush(); this.mip = !!on; } }
  /** Fill the screen with this colour at the start of every frame (outside the world when zoomed out). */
  setClear(css) { const v = parseColour(css); this.clearRGB = [(v & 255) / 255, (v >>> 8 & 255) / 255, (v >>> 16 & 255) / 255]; }

  // ---------------------------------------------------------------- transform + state
  setTransform(a, b, c, d, e, f) {
    if (typeof a === 'object' && a) { this.a = a.a; this.b = a.b; this.c = a.c; this.d = a.d; this.e = a.e; this.f = a.f; return; }
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
  }
  resetTransform() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
  getTransform() {
    const m = [this.a, this.b, this.c, this.d, this.e, this.f];
    return typeof DOMMatrix === 'function' ? new DOMMatrix(m) : { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] };
  }
  transform(a, b, c, d, e, f) {
    const A = this.a, B = this.b, C = this.c, D = this.d;
    this.a = A * a + C * b; this.b = B * a + D * b; this.c = A * c + C * d; this.d = B * c + D * d;
    this.e += A * e + C * f; this.f += B * e + D * f;
  }
  translate(x, y) { this.e += this.a * x + this.c * y; this.f += this.b * x + this.d * y; }
  scale(x, y) { this.a *= x; this.b *= x; this.c *= y; this.d *= y; }
  rotate(t) {
    const cs = Math.cos(t), sn = Math.sin(t), A = this.a, B = this.b, C = this.c, D = this.d;
    this.a = A * cs + C * sn; this.b = B * cs + D * sn; this.c = C * cs - A * sn; this.d = D * cs - B * sn;
  }
  save() { this.stack.push([this.a, this.b, this.c, this.d, this.e, this.f, this.globalAlpha, this.globalCompositeOperation, this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin]); }
  restore() {
    const s = this.stack.pop(); if (!s) return;
    [this.a, this.b, this.c, this.d, this.e, this.f, this.globalAlpha, this.globalCompositeOperation, this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin] = s;
  }

  // ---------------------------------------------------------------- images + rects
  drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
    if (this.lost) return;
    const al = this.alpha(); if (al <= 0) return;
    this.room();
    const e = this.entry(img); if (!e) return;
    let sx, sy, sw, sh, dx, dy, dw, dh;
    if (a5 === undefined) { sx = 0; sy = 0; sw = e.w; sh = e.h; dx = a1; dy = a2; dw = a3 === undefined ? sw : a3; dh = a4 === undefined ? sh : a4; }
    else { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
    const un = this.unit(e);
    const A = this.a, B = this.b, C = this.c, D = this.d;
    const x0 = A * dx + C * dy + this.e, y0 = B * dx + D * dy + this.f, ax = A * dw, ay = B * dw, bx = C * dh, by = D * dh;
    const iw = 1 / e.w, ih = 1 / e.h, u0 = sx * iw, v0 = sy * ih, u1 = (sx + sw) * iw, v1 = (sy + sh) * ih;
    this.quad(x0, y0, u0, v0, x0 + ax, y0 + ay, u1, v0, x0 + bx, y0 + by, u0, v1, x0 + ax + bx, y0 + ay + by, u1, v1, this.tint(al), un);
  }
  rectQuad(x, y, w, h, col) {
    const A = this.a, B = this.b, C = this.c, D = this.d;
    const x0 = A * x + C * y + this.e, y0 = B * x + D * y + this.f, ax = A * w, ay = B * w, bx = C * h, by = D * h;
    this.quad(x0, y0, 0, 0, x0 + ax, y0 + ay, 0, 0, x0 + bx, y0 + by, 0, 0, x0 + ax + bx, y0 + ay + by, 0, 0, col, S_FLAT);
  }
  fillRect(x, y, w, h) {
    if (this.lost) return;
    const al = this.alpha(); if (al <= 0) return;
    this.room(); this.rectQuad(x, y, w, h, this.solid(this.fillStyle, al));
  }
  clearRect(x, y, w, h) { // the canvas is opaque: cleared = black
    if (this.lost) return;
    this.room(); this.rectQuad(x, y, w, h, 0xff000000);
  }

  // ---------------------------------------------------------------- paths (points stored in device px)
  beginPath() { this.subs.length = 0; this.cur = null; }
  pt(x, y) { const X = this.a * x + this.c * y + this.e, Y = this.b * x + this.d * y + this.f; this.lastX = X; this.lastY = Y; return [X, Y]; }
  moveTo(x, y) { const p = this.pt(x, y); this.cur = { pts: p, closed: false, ell: null }; this.subs.push(this.cur); }
  lineToDev(X, Y) {
    if (!this.cur) { this.cur = { pts: [X, Y], closed: false, ell: null }; this.subs.push(this.cur); }
    else { this.cur.pts.push(X, Y); this.cur.ell = null; }
    this.lastX = X; this.lastY = Y;
  }
  lineTo(x, y) { const X = this.a * x + this.c * y + this.e, Y = this.b * x + this.d * y + this.f; this.lineToDev(X, Y); }
  closePath() {
    if (!this.cur) return;
    this.cur.closed = true;
    const p = this.cur.pts; this.cur = { pts: [p[0], p[1]], closed: false, ell: null }; this.subs.push(this.cur); // a new subpath at its start
  }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.cur.closed = true; this.cur = null; }
  scaleMax() { return Math.sqrt(Math.max(this.a * this.a + this.b * this.b, this.c * this.c + this.d * this.d)); }
  // an ellipse arc (rx, ry, turned rot) from a0 to a1, as canvas: a line from the current point to its start
  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    if (!(rx >= 0 && ry >= 0)) return;
    let sweep = a1 - a0;
    if (!ccw) { if (sweep >= TAU) sweep = TAU; else { sweep %= TAU; if (sweep < 0) sweep += TAU; } }
    else { if (-sweep >= TAU) sweep = -TAU; else { sweep %= TAU; if (sweep > 0) sweep -= TAU; } }
    const full = Math.abs(sweep) >= TAU - 1e-9;
    const R = Math.max(rx, ry) * this.scaleMax(), n = Math.max(6, Math.min(128, Math.ceil(Math.abs(sweep) * Math.sqrt(Math.max(1, R)) * 1.6)));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    let fresh = false;
    for (let i = 0; i <= n; i++) {
      const t = a0 + sweep * i / n, px = rx * Math.cos(t), py = ry * Math.sin(t);
      const lx = x + px * cr - py * sr, ly = y + px * sr + py * cr;
      const X = this.a * lx + this.c * ly + this.e, Y = this.b * lx + this.d * ly + this.f;
      if (i > 0) { this.lineToDev(X, Y); continue; }
      const c = this.cur;   // canvas: a line from the current point to the arc's start (none when they meet)
      if (c && (c.pts.length > 2 || Math.abs(c.pts[0] - X) + Math.abs(c.pts[1] - Y) > 0.01)) { this.lineToDev(X, Y); continue; }
      if (c) this.subs.pop();   // a lone moveTo onto the start: the arc starts the subpath
      this.cur = { pts: [X, Y], closed: false, ell: null }; this.subs.push(this.cur); this.lastX = X; this.lastY = Y; fresh = true;
    }
    if (fresh && full) { // exact shape for fill(): centre + the two radius vectors in device px
      const ux = rx * cr, uy = rx * sr, vx = -ry * sr, vy = ry * cr;
      this.cur.ell = [this.a * x + this.c * y + this.e, this.b * x + this.d * y + this.f, this.a * ux + this.c * uy, this.b * ux + this.d * uy, this.a * vx + this.c * vy, this.b * vx + this.d * vy];
    }
  }
  arc(x, y, r, a0, a1, ccw = false) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(cx, cy);
    const ia = this.inv(); const p0x = ia ? ia[0] : 0, p0y = ia ? ia[1] : 0;
    for (let i = 1; i <= 8; i++) { const t = i / 8, m = 1 - t; this.lineTo(m * m * p0x + 2 * m * t * cx + t * t * x, m * m * p0y + 2 * m * t * cy + t * t * y); }
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.cur) this.moveTo(c1x, c1y);
    const ia = this.inv(); const p0x = ia ? ia[0] : 0, p0y = ia ? ia[1] : 0;
    for (let i = 1; i <= 12; i++) { const t = i / 12, m = 1 - t; this.lineTo(m * m * m * p0x + 3 * m * m * t * c1x + 3 * m * t * t * c2x + t * t * t * x, m * m * m * p0y + 3 * m * m * t * c1y + 3 * m * t * t * c2y + t * t * t * y); }
  }
  inv() { // the last point back in user space (curves are given in user space)
    const det = this.a * this.d - this.b * this.c; if (!det) return null;
    const X = this.lastX - this.e, Y = this.lastY - this.f;
    return [(this.d * X - this.c * Y) / det, (this.a * Y - this.b * X) / det];
  }
  // a disc of radius hw (device px) at X, Y
  disc(X, Y, hw, col, slot) {
    const ext = hw + 1, k = ext / hw;
    this.room();
    this.quad(X - ext, Y - ext, -k, -k, X + ext, Y - ext, k, -k, X - ext, Y + ext, -k, k, X + ext, Y + ext, k, k, col, slot);
  }
  band(x0, y0, x1, y1, hw, col, slot) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    if (l < 1e-4) return;
    const ext = hw + 1, k = ext / hw, nx = -dy / l * ext, ny = dx / l * ext;
    this.room();
    this.quad(x0 + nx, y0 + ny, k, 0, x1 + nx, y1 + ny, k, 0, x0 - nx, y0 - ny, -k, 0, x1 - nx, y1 - ny, -k, 0, col, slot);
  }
  stroke() {
    if (this.lost || !this.subs.length) return;
    const al = this.alpha(); if (al <= 0) return;
    const col = this.solid(this.strokeStyle, al); if (!(col >>> 24) && this.globalCompositeOperation !== 'lighter') return;
    const sc = Math.sqrt(Math.abs(this.a * this.d - this.b * this.c)), hw = Math.max(0.05, (+this.lineWidth || 1) * sc / 2);
    const round = this.lineCap === 'round', see = al < 0.999 && this.globalCompositeOperation !== 'lighter';
    const gl = this.gl;
    if (see) { // overlaps of one see-through stroke blend once (canvas): each pixel drawn at most once
      this.room(); this.flush();
      if (this.stencilRef >= 255) this.stencilRef = 0;
      if (this.stencilRef === 0) { gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT); }
      this.stencilRef++;
      gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.NOTEQUAL, this.stencilRef, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    }
    const SB = see ? S_BAND | HARD : S_BAND, SD = see ? S_DISC | HARD : S_DISC;
    for (const s of this.subs) {
      const p = s.pts, n = p.length >> 1;
      if (n < 2) continue;
      for (let i = 0; i < n - 1; i++) this.band(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3], hw, col, SB);
      if (s.closed) this.band(p[2 * n - 2], p[2 * n - 1], p[0], p[1], hw, col, SB);
      for (let i = 1; i < n - 1; i++) this.disc(p[2 * i], p[2 * i + 1], hw, col, SD);
      if (s.closed || round) { this.disc(p[0], p[1], hw, col, SD); this.disc(p[2 * n - 2], p[2 * n - 1], hw, col, SD); }
    }
    if (see) { this.flush(); gl.disable(gl.STENCIL_TEST); }
  }
  fill() {
    if (this.lost || !this.subs.length) return;
    const al = this.alpha(); if (al <= 0) return;
    if (typeof this.fillStyle !== 'string') warnOnce('fill with a gradient / pattern');
    const col = this.solid(this.fillStyle, al);
    for (const s of this.subs) {
      if (s.ell) {
        const [cx, cy, ux, uy, vx, vy] = s.ell, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        if (lu < 1e-3 || lv < 1e-3) continue;
        const k = 1 + 1 / Math.min(lu, lv), px = ux * k, py = uy * k, qx = vx * k, qy = vy * k;
        this.room();
        this.quad(cx - px - qx, cy - py - qy, -k, -k, cx + px - qx, cy + py - qy, k, -k, cx - px + qx, cy - py + qy, -k, k, cx + px + qx, cy + py + qy, k, k, col, S_DISC);
        continue;
      }
      const p = s.pts, n = p.length >> 1;
      for (let i = 1; i < n - 1; i++) {
        this.room();
        this.quad(p[0], p[1], 0, 0, p[2 * i], p[2 * i + 1], 0, 0, p[2 * i + 2], p[2 * i + 3], 0, 0, p[2 * i + 2], p[2 * i + 3], 0, 0, col, S_FLAT);
      }
    }
  }

  // ---------------------------------------------------------------- the rest of the 2D API: not used on the field
  clip() { warnOnce('clip'); }
  fillText() { warnOnce('fillText'); }
  strokeText() { warnOnce('strokeText'); }
  measureText() { return { width: 0 }; }
  strokeRect() { warnOnce('strokeRect'); }
  createPattern() { warnOnce('createPattern'); return null; }
  createLinearGradient() { warnOnce('gradient'); return { addColorStop() {} }; }
  createRadialGradient() { warnOnce('gradient'); return { addColorStop() {} }; }
  putImageData() { warnOnce('putImageData'); }
  getImageData() { warnOnce('getImageData'); return null; }
  setLineDash() {}
  getContextAttributes() { return this.gl.getContextAttributes(); }

  stats() { return { draws: this.lastDraws, quads: this.lastQuads, uploads: this.uploads, uploadMPx: +(this.uploadPx / 1e6).toFixed(2), textures: this.entries.size, lost: this.lost }; }
}

/** Stop feeding WebGL (the caller went back to canvas 2D). */
export function dropGL2D() { GPU.gl = null; }
/** The main canvas through WebGL2, or null (no WebGL2, or it failed: the caller then uses a fresh canvas for 2D). */
export function createGL2D(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return null;
  const g = new GL2D(canvas, gl);
  try { if (!g.initGL()) return null; } catch (e) { console.warn('gl2d init failed', e); return null; }
  GPU.gl = g;
  return g;
}
