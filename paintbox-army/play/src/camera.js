// Camera over the big field (Part 2 step 2, OURS not OG: OG's field is the window). Owner: lead.
// The world is W x H sim px (2x the screen each way, set at boot). The camera shows it at zoom z: 1 = OG's size
// (1.075 CSS px per sim px), down to "fit" (the whole world on screen), up to MAX. (cx, cy) = the world point at the
// middle of the view. The renderer draws in world device px (sim px x S); the camera maps those to screen device px:
//   screen = (world - c·S)·z + view/2.
// Follow: eases the middle onto a unit each frame until the unit dies or the player pans.
export const CAM = {
  MAX: 1.6,            // max zoom (sprites are baked for zoom 1: past it they soften a little)
  EASE: 7,             // follow: 1/s the view eases toward the unit
  FOLLOW_Z: 1.15,      // follow: zoom it eases to (never zooms out if already closer)
  WORLD: 2,            // world = WORLD x the field at boot, each way
};

export function createCamera() {
  const c = {
    W: 1, H: 1,          // world, sim px
    vw: 1, vh: 1,        // view, CSS px
    zoomCss: 1.075,      // CSS px per sim px at z = 1
    dpr: 1,
    cx: 0.5, cy: 0.5, z: 1,
    follow: null,        // unit followed (by object; dropped when dead)
    // CSS px of the view covered by the UI (tool bar at the bottom, round buttons at the top). Step 7 (MAPS agent, 11-16):
    // on a phone held sideways the bar covers ~45 % of the view and the map under it could never be dragged into sight.
    // The camera may now pan that far past the world's edges. Fit is unchanged (the whole world, as before).
    inset: { t: 0, r: 0, b: 0, l: 0 },
    version: 0,          // bumps on every change (DOM overlays reposition only then)
  };
  c.fit = () => Math.min(c.vw / (c.W * c.zoomCss), c.vh / (c.H * c.zoomCss));
  c.minZ = () => Math.min(1, c.fit());
  c.clamp = () => {
    const z0 = c.minZ();
    c.z = Math.max(z0, Math.min(CAM.MAX, c.z));
    const hw = c.vw / (2 * c.zoomCss * c.z), hh = c.vh / (2 * c.zoomCss * c.z);   // half the view in sim px
    const k = 1 / (c.zoomCss * c.z), I = c.inset;
    c.cx = Math.max(Math.min(hw, c.W / 2) - I.l * k, Math.min(Math.max(c.W - hw, c.W / 2) + I.r * k, c.cx));
    c.cy = Math.max(Math.min(hh, c.H / 2) - I.t * k, Math.min(Math.max(c.H - hh, c.H / 2) + I.b * k, c.cy));
    c.version++;
  };
  c.setWorld = (W, H) => { c.W = W; c.H = H; c.cx = W / 2; c.cy = H / 2; c.clamp(); };
  c.setView = (vw, vh, zoomCss, dpr) => { c.vw = vw; c.vh = vh; c.zoomCss = zoomCss; c.dpr = dpr; c.clamp(); };
  c.setInset = (t, r, b, l) => { const I = c.inset; if (I.t === t && I.r === r && I.b === b && I.l === l) return; I.t = t; I.r = r; I.b = b; I.l = l; c.clamp(); };
  c.toFit = () => { c.z = c.fit(); c.cx = c.W / 2; c.cy = c.H / 2; c.follow = null; c.clamp(); };
  /** CSS px in the view -> world sim px. */
  c.toWorld = (x, y) => [c.cx + (x - c.vw / 2) / (c.zoomCss * c.z), c.cy + (y - c.vh / 2) / (c.zoomCss * c.z)];
  /** world sim px -> CSS px in the view. */
  c.toView = (x, y) => [(x - c.cx) * c.zoomCss * c.z + c.vw / 2, (y - c.cy) * c.zoomCss * c.z + c.vh / 2];
  /** Zoom by factor k keeping the world point under view CSS (x, y) still. */
  c.zoomAt = (x, y, k) => {
    const [wx, wy] = c.toWorld(x, y);
    c.z = Math.max(c.minZ(), Math.min(CAM.MAX, c.z * k));
    c.cx = wx - (x - c.vw / 2) / (c.zoomCss * c.z); c.cy = wy - (y - c.vh / 2) / (c.zoomCss * c.z);
    c.clamp();
  };
  /** Move the view by CSS px (drag: the world follows the finger). */
  c.panBy = (dx, dy) => { c.cx -= dx / (c.zoomCss * c.z); c.cy -= dy / (c.zoomCss * c.z); c.follow = null; c.clamp(); };
  /** Per frame (real dt s): follow. */
  c.update = (dt) => {
    const u = c.follow;
    if (!u) return;
    if (u.dead || !(u.hp > 0)) { c.follow = null; c.version++; return; }
    const k = 1 - Math.exp(-CAM.EASE * dt);
    c.cx += (u.x - c.cx) * k; c.cy += (u.y - (u.z || 0) * 0.5 - c.cy) * k;
    if (c.z < CAM.FOLLOW_Z) c.z += (CAM.FOLLOW_Z - c.z) * k;
    c.clamp();
  };
  /** Device-px matrix [a, b, c, d, e, f] from world device px (sim px x S) to screen device px. */
  c.matrix = (S) => {
    const z = c.z, sx = c.vw * c.dpr / 2, sy = c.vh * c.dpr / 2;
    return [z, 0, 0, z, sx - c.cx * S * z, sy - c.cy * S * z];
  };
  return c;
}
