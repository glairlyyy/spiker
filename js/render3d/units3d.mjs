// Shared 3D units and helpers: engine court units → metres, canvas textures, the device tier.
import * as THREE from 'three';

// x 0..1000 along the court (net at 500), z 0..1 across (0 = near side), h = height units (net tape at 150).
// The factors come from the engine's UNIT_M (engine/court.js), so 2D maths and the 3D view share one scale.
export const KH = UNIT_M.h,
  KX = UNIT_M.x, // the big court: 840 units between the end lines ≈ 20.4 m
  KZ = UNIT_M.z; // 0.08..0.92 between the side lines ≈ 10.1 m
/** Court position → a new world-space vector (metres). */
export const W = (x, z, h = 0) => new THREE.Vector3((x - 500) * KX, h * KH, (0.5 - z) * KZ);
/** Same, written into `v` (no allocation; for per-frame use). */
export const Wto = (v, x, z, h = 0) => v.set((x - 500) * KX, h * KH, (0.5 - z) * KZ);

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Phones and low-core devices: cheaper shadows and a smaller crowd. */
export const lowEnd = matchMedia('(max-width: 720px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
