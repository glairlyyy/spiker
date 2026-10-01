// Shared geometry for the 3D island map: map units ↔ metres, the fog rule, small maths helpers. Every map3d module
// imports these from here (not from map3d.mjs, which imports the others — no import cycles).

/** Metres per map unit (map (x, y) → world (x·MAP_M, 0, y·MAP_M)). */
export const MAP_M = 0.5;
export const FOG_DIM = 0.3; // brightness of unexplored terrain and town
export const FOG_SOFT = 14; // fog edge softness (m)
export const toWorld = ([x, y]) => [x * MAP_M, y * MAP_M];
export const toMap = (x, z) => [x / MAP_M, z / MAP_M];

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Smoothstep of v between a and b (0..1). */
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The fog brightness k(x, z) (world metres) for a model's `fog` ({ points, r } in map units): 1 within r of a visited
 * point, FOG_DIM beyond r + FOG_SOFT, smooth between. Squared distances, early out once fully lit.
 */
export function fogFactor(fog) {
  if (!fog || !fog.points) return () => 1;
  const pts = fog.points.map(([x, y]) => [x * MAP_M, y * MAP_M]),
    r = fog.r * MAP_M,
    r2 = r * r,
    far2 = (r + FOG_SOFT) * (r + FOG_SOFT);
  return (x, z) => {
    let d2 = Infinity;
    for (const [px, pz] of pts) {
      const dx = x - px,
        dz = z - pz,
        q = dx * dx + dz * dz;
      if (q < d2) {
        d2 = q;
        if (d2 <= r2) return 1; // inside a revealed circle: fully lit
      }
    }
    if (d2 >= far2) return FOG_DIM;
    return FOG_DIM + (1 - FOG_DIM) * (1 - smooth(r, r + FOG_SOFT, Math.sqrt(d2)));
  };
}
