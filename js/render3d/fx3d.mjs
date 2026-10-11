// 3D effects: GPU particles (glow / spark / smoke), lightning tubes, shockwave rings and bouncing rocks, with a
// style per team element (fire, flash, water, wind, earth, blast, shadow, star). Positions are world metres.
// Called from render/effects.js when the 3D view is on (see R3D.fx), and each frame by r3d.mjs.
// The effects are grouped in js/render3d/fx/ (kit = the pools and meshes; ground, hits, elements, trail = the effects).
import { createKit } from './fx/kit.mjs';
import { groundFx } from './fx/ground.mjs';
import { hitsFx } from './fx/hits.mjs';
import { elementsFx } from './fx/elements.mjs';
import { trailFx } from './fx/trail.mjs';

/** The effects API (R3D.fx): every effect group over one kit, plus `update` and `stats`. A new effect = a function in a group. */
export function createFx(scene) {
  const K = createKit(scene);
  return { ...groundFx(K), ...hitsFx(K), ...elementsFx(K), ...trailFx(K), stats: K.stats, update: K.update };
}
