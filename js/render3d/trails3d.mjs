// Light trails that follow a point (a player's hand): a camera-facing ribbon that tapers and fades with age.
// Stars get a thin short streak, OP players a wide long one, in their hair colour (think Kuroko's zone eye trail).
// Two layers over one strip: a crisp solid edge in the trail's colour (normal blending), and the glow inside it
// (additive).
import * as THREE from 'three';

const VS = `
attribute float alpha;
attribute float edge;
varying float vA;
varying float vE;
void main() {
  vA = alpha;
  vE = edge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
/** Outer share of the half-width that is outline. */
const OUT = '0.05';
const FS = `
uniform vec3 color;
uniform vec3 core;
varying float vA;
varying float vE;
void main() {
  float e = abs(vE), inside = 1.0 - smoothstep(1.0 - ${OUT} - 0.03, 1.0 - ${OUT} + 0.01, e);
  gl_FragColor = vec4(mix(color, core, vA * vA * 0.3 + (1.0 - e) * 0.25) * vA * inside, vA * inside);
}`;
const FS_OUT = `
uniform vec3 ink;
varying float vA;
varying float vE;
void main() {
  float e = abs(vE), band = smoothstep(1.0 - ${OUT} - 0.03, 1.0 - ${OUT}, e) * (1.0 - smoothstep(0.97, 1.0, e));
  gl_FragColor = vec4(ink, band * min(1.0, vA * 1.4) * 0.9);
}`;
/** The strip is this much wider than o.width, so the glow inside the outline keeps its old width. */
const OUT_W = 1.05;
/** Trail dimming by the measured speed of the followed point (m/s): invisible at `still` and below, full at `full`. */
const MOVE = { still: 0.25, full: 1.6 };
const tA = new THREE.Vector3(),
  tB = new THREE.Vector3(),
  tC = new THREE.Vector3();

/** A ribbon with room for `max` samples. update() each frame; it hides itself when there is nothing to draw. */
export function makeTrail(scene, max = 36) {
  const pos = new Float32Array(max * 2 * 3),
    alpha = new Float32Array(max * 2),
    edge = new Float32Array(max * 2),
    idx = [];
  for (let i = 0; i < max; i++) edge.set([1, -1], i * 2); // +1 / −1 across the strip: the shaders find the edges
  for (let i = 0; i < max - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: { color: { value: new THREE.Color('#ffffff') }, core: { value: new THREE.Color('#ffffff') } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const outline = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS_OUT,
      uniforms: { ink: { value: new THREE.Color('#ffffff') } }, // the trail's own colour (set per update)
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  const mesh = new THREE.Mesh(g, mat);
  for (const x of [outline, mesh]) {
    x.frustumCulled = false;
    x.visible = false;
    scene.add(x);
  }
  outline.renderOrder = 4; // the ink first, the glow over it
  mesh.renderOrder = 5;
  const show = v => (mesh.visible = outline.visible = v);
  const pts = []; // newest first: { p, age }
  let mv = 0, // how much the point is moving, 0 (still) .. 1 (≥ MOVE.full m/s), smoothed: a still object's trail dims out
    last = null;
  return {
    mesh,
    clear() {
      pts.length = 0;
      last = null;
      mv = 0;
      show(false);
    },
    /**
     * p: the point this frame (world); cam: the camera; o = { width, life, alpha, color, drift? } (width 0 → off).
     * drift (m/s, a Vector3): older samples float this way, so the streak flows out even when the point is still.
     */
    update(p, dt, cam, o) {
      if (!o.width) {
        if (pts.length) this.clear();
        return;
      }
      // measured speed of the point (m/s) → motion factor: fast up, slow down; a teleport doesn't count as speed
      const sp = last && dt > 1e-4 && last.distanceTo(p) < 1.5 ? last.distanceTo(p) / dt : 0;
      mv +=
        (Math.max(0, Math.min(1, (sp - MOVE.still) / (MOVE.full - MOVE.still))) - mv) *
        (1 - Math.exp(-dt / (sp > 0 && mv < 1 ? 0.08 : 0.3)));
      (last || (last = new THREE.Vector3())).copy(p);
      for (const q of pts) {
        q.age += dt;
        if (o.drift) q.p.addScaledVector(o.drift, dt);
      }
      while (pts.length && pts[pts.length - 1].age > o.life) pts.pop();
      if (pts.length && pts[0].p.distanceTo(p) > (o.drift ? 3 : 1.5)) pts.length = 0; // teleported (new rally): start fresh
      pts.unshift({ p: p.clone(), age: 0 });
      if (pts.length > max) pts.length = max;
      const n = pts.length;
      if (n < 3 || mv < 0.02) {
        show(false);
        return;
      }
      mat.uniforms.color.value.set(o.color);
      outline.material.uniforms.ink.value.set(o.color);
      for (let i = 0; i < n; i++) {
        const a = pts[i].p,
          b = pts[Math.min(n - 1, i + 1)].p,
          c = pts[Math.max(0, i - 1)].p;
        tA.subVectors(c, b); // segment direction
        if (tA.lengthSq() < 1e-8) tA.set(0, 1, 0);
        tB.subVectors(cam.position, a); // toward the camera
        tC.crossVectors(tA, tB).normalize();
        const k = 1 - pts[i].age / o.life,
          w = o.width * OUT_W * Math.pow(Math.max(0, k), 0.7) * (i === 0 ? 0.6 : 1) * (0.4 + 0.6 * mv),
          al = o.alpha * Math.pow(Math.max(0, k), 1.4) * mv;
        pos.set([a.x + tC.x * w, a.y + tC.y * w, a.z + tC.z * w], i * 6);
        pos.set([a.x - tC.x * w, a.y - tC.y * w, a.z - tC.z * w], i * 6 + 3);
        alpha[i * 2] = alpha[i * 2 + 1] = al;
      }
      g.setDrawRange(0, (n - 1) * 6);
      g.attributes.position.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
      show(true);
    }
  };
}
