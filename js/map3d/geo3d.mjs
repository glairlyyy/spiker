// Shared geometry for the 3D island map: map units ↔ metres, the fog rule, small maths helpers (the map3d world's only
// clamp / lerp / hash / point-in-polygon: the tests import these modules, so they can't read the classic globals). Every map3d module
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

/** An angle wrapped to −π … π. */
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/** Stable 0..1 hash of a string (FNV-1a; the same as hstr in js/engine/elements.js). */
export const hstr = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape any value for HTML text or a quoted attribute (the map overlay's copy of esc in js/ui/dom.js). */
export const esc = s => String(s).replace(/[&<>"']/g, c => ESC_MAP[c]);
/** Point in polygon (poly: [[x, y]…]). */
export const inside = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Distance from a point to a closed polygon's outline. */
export const edgeDist = (x, y, poly) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j],
      [bx, by] = poly[i],
      dx = bx - ax,
      dy = by - ay,
      t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
};
/** Signed distance (m) from a point to an open polyline: positive on its right-hand side (screen coordinates, y down). */
export const sideDist = (x, y, line) => {
  let best = Infinity,
    sign = 1;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i],
      [bx, by] = line[i + 1],
      dx = bx - ax,
      dy = by - ay,
      t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1),
      d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) {
      best = d;
      sign = dy * (x - ax) - dx * (y - ay) >= 0 ? 1 : -1;
    }
  }
  return best * sign;
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

/**
 * The camera view { x, z, d } (world metres) that frames every point (pad 15 %), for the map camera's pitch and field of
 * view at this aspect (width / height); d clamped to [minD, maxD]. null for no points.
 */
export function fitView(points, aspect, minD, maxD, fovDeg = 40, pitchDeg = 55) {
  if (!points || !points.length) return null;
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const [x, z] of points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const w = (x1 - x0) * 1.15,
    h = (z1 - z0) * 1.15,
    tv = Math.tan(((fovDeg / 2) * Math.PI) / 180),
    th = tv * (aspect || 1),
    s = Math.sin((pitchDeg * Math.PI) / 180), // ground depth is foreshortened by the pitch
    d = Math.max(w / 2 / th, (h * s) / 2 / tv);
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, d: clamp(d, minD, maxD) };
}
