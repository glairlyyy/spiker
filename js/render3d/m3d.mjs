// Small maths for the 3D code (js/render3d and js/map3d): the one place for these helpers. ES module — the classic
// globals (js/core/math.js) are not visible to modules the tests load on their own.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Smoothstep of t (0..1). */
export const ease = t => t * t * (3 - 2 * t);
/** Smoothstep of v between a and b (0..1). */
export const smooth = (a, b, v) => ease(clamp((v - a) / (b - a), 0, 1));
/** An angle wrapped to −π … π. */
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
