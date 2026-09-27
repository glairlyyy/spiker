// Small shared helpers: colour shading and the setter release timing (used by the 3D set pose).

/** Colour `h` ('#rrggbb' or '#rgb') mixed towards white (a > 0) or black (a < 0) by |a| (0..1). */
function shade(h, a) {
  let x = String(h).replace('#', '');
  if (x.length === 3) x = x.replace(/./g, c => c + c);
  const n = parseInt(x, 16) || 0;
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
