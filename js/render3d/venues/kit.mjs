// Small builders shared by the venue sets (venue3d.mjs and js/render3d/venues/*): boxes, figures, light beams, bleachers.
import * as THREE from 'three';
import { canvasTex } from '../units3d.mjs';

export const box = (w, h, d, color, o = {}) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 })
  );
  m.castShadow = !!o.shadow;
  m.receiveShadow = true;
  return m;
};
export const at = (o, x, y, z) => (o.position.set(x, y, z), o);
/** A plain standing figure (officials): body capsule + head. */
export function figure(color) {
  const g = new THREE.Group(),
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 3, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.8 })),
    head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: '#e2bb94', roughness: 0.7 }));
  body.position.y = 0.6 + 0.22;
  head.position.y = 1.62;
  body.castShadow = true;
  g.add(body, head);
  return g;
}
/** An additive light cone / shaft (a cone mesh, open, fading by opacity). */
/** Light shafts and cones, faded by camera distance every frame (updateVenue) so none ever covers the view. */
export const BEAMS = [];
let beamFade = null;
export function beam(r0, r1, len, color, op) {
  // soft along its length: brightest at the source, gone before the floor
  beamFade =
    beamFade ||
    canvasTex(4, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.55, '#606060');
      gr.addColorStop(1, '#000000');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r0, r1, len, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      alphaMap: beamFade,
      transparent: true,
      opacity: op,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    })
  );
  BEAMS.push({ m, op, len });
  m.renderOrder = 4;
  return m;
}

export function bleachers(g, rows, step, depth, color, half) {
  for (let r = 0; r < rows; r++)
    g.add(at(box(half * 2, step, depth, color, { metal: 0.3, rough: 0.6 }), 0, step / 2 + r * step, -9.2 - r * depth));
}
