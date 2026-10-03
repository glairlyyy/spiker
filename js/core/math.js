// Small non-random maths and formatting helpers shared by every classic script (and read as globals by render3d).
// The 3D island map (js/map3d, ES modules the tests import) keeps its own copies in geo3d.mjs.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sig = x => 1 / (1 + Math.exp(-x));
/** Is point p inside polygon poly ([[x, y], …])? (even–odd rule) */
function inPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/**
 * A signed change: "+3", "−2" (always the U+2212 minus sign), zero as o.zero (default "0").
 * o.pre goes between the sign and the digits ("+$40"); o.dec fixes the decimals (toFixed); o.loc adds thousands
 * separators (toLocaleString).
 */
function fmtDelta(n, o = {}) {
  if (!n) return o.zero ?? '0';
  const a = Math.abs(n);
  return `${n > 0 ? '+' : '−'}${o.pre || ''}${o.dec != null ? a.toFixed(o.dec) : o.loc ? a.toLocaleString() : a}`;
}
