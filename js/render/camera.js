// Camera push-ins (A.cam), applied to the view by applyView() in court.js and by the 3D renderer.
//
// Motion-sickness-friendly: slow eased push-ins only — no rotation, no whip pans. The zoom starts centred on its target
// (so it never slides sideways into place), eases in over ~0.4 s and back out over ~0.7 s, and is capped at 1.95×
// (block break). Off with reduced motion or the Camera toggle.

/** Whether push-ins are allowed (not with reduced motion or the fixed-camera setting). */
const camOn = () => !RM && !G.camFixed;
/** Push-in easing time constants (ms): zooming in, zooming out, re-centring. */
const CAM_IN_MS = 170,
  CAM_OUT_MS = 300,
  CAM_PAN_MS = 260;
/**
 * Start a push-in from a `cam` act: amount a.amt towards court point (a.x, a.z, a.h), held a.hold ms (default 800),
 * starting after a.t0 × 600 ms. A smaller push-in never cuts a bigger one short.
 */
function camTo(a) {
  if (!camOn()) return;
  const c = A.cam || (A.cam = { z: 0, tz: 0, x: 500, y: 300, tx: 500, ty: 300, hold: 0, delay: 0 }),
    q = P(a.x, a.z, a.h);
  if (a.amt < c.tz && c.hold > 0) return; // a bigger push-in is already running
  c.tz = a.amt;
  c.tx = q.X;
  c.ty = q.Y;
  c.hold = a.hold || 800;
  c.delay = a.t0 ? a.t0 * 600 : 0;
  if (c.z < 0.02) {
    c.x = c.tx;
    c.y = c.ty;
  }
}
/** Let the current push-in ease back out now. */
function camRelease() {
  if (A.cam) A.cam.hold = 0;
}
/** Ease the push-in towards its target (or back to 0 once the hold runs out). dt: real ms. */
function camStep(dt) {
  const c = A.cam;
  if (!c) return;
  if (c.delay > 0) {
    c.delay -= dt;
    return;
  }
  c.hold -= dt;
  const target = c.hold > 0 ? c.tz : 0,
    k = 1 - Math.exp(-dt / (target > c.z ? CAM_IN_MS : CAM_OUT_MS)),
    kc = 1 - Math.exp(-dt / CAM_PAN_MS);
  c.z += (target - c.z) * k;
  c.x += (c.tx - c.x) * kc;
  c.y += (c.ty - c.y) * kc;
  if (c.hold <= 0) c.tz = 0;
  if (c.z < 0.001 && target === 0) c.z = 0;
}
