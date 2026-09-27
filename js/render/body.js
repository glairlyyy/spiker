// Small shared helpers: colour shading and the setter release timing (used by the 3D set pose).

function shade(h, a) {
  const n = parseInt(h.slice(1), 16);
  let r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  const f = a < 0 ? 0 : 255,
    t = Math.abs(a);
  r = Math.round(r + (f - r) * t);
  g = Math.round(g + (f - g) * t);
  b = Math.round(b + (f - b) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
/** Ink colour for lineart: a deep shade of the fill (anime cel look, no grey halos). */
const ink = c => shade(c, -0.5);
/** Setter release motion by set direction: k = release progress 0..1, lean = body angle, arms = end pose. */
function setMotion(d) {
  const dirn = d.setDir || 'front',
    dur = dirn === 'quick' ? 110 : 190,
    u = d.swing == null ? 0 : clamp(d.swing / dur, 0, 1),
    k = u * u * (3 - 2 * u),
    E = { front: [-1.25, -1.35, -0.9], quick: [-1.5, -1.55, -1.35], back: [-1.95, -2.25, -2.55] }[dirn],
    L = { front: 0.07, quick: 0, back: -0.42 }[dirn];
  return { k, lean: L * k, arms: E };
}
