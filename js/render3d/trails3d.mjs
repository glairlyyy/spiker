// Light trails that follow a point (a player's hand): a camera-facing ribbon that tapers and fades with age.
// Stars get a thin short streak, OP players a wide long one, in their hair colour (think Kuroko's zone eye trail).
import * as THREE from 'three';

const VS = `
attribute float alpha;
varying float vA;
void main() {
  vA = alpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = `
uniform vec3 color;
uniform vec3 core;
varying float vA;
void main() {
  gl_FragColor = vec4(mix(color, core, vA * vA * 0.3) * vA, vA);
}`;
const tA = new THREE.Vector3(),
  tB = new THREE.Vector3(),
  tC = new THREE.Vector3();

/** A ribbon with room for `max` samples. update() each frame; it hides itself when there is nothing to draw. */
export function makeTrail(scene, max = 36) {
  const pos = new Float32Array(max * 2 * 3),
    alpha = new Float32Array(max * 2),
    idx = [];
  for (let i = 0; i < max - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
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
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  const pts = []; // newest first: { p, age }
  return {
    mesh,
    clear() {
      pts.length = 0;
      mesh.visible = false;
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
      for (const q of pts) {
        q.age += dt;
        if (o.drift) q.p.addScaledVector(o.drift, dt);
      }
      while (pts.length && pts[pts.length - 1].age > o.life) pts.pop();
      if (pts.length && pts[0].p.distanceTo(p) > (o.drift ? 3 : 1.5)) pts.length = 0; // teleported (new rally): start fresh
      pts.unshift({ p: p.clone(), age: 0 });
      if (pts.length > max) pts.length = max;
      const n = pts.length;
      if (n < 3) {
        mesh.visible = false;
        return;
      }
      mat.uniforms.color.value.set(o.color);
      for (let i = 0; i < n; i++) {
        const a = pts[i].p,
          b = pts[Math.min(n - 1, i + 1)].p,
          c = pts[Math.max(0, i - 1)].p;
        tA.subVectors(c, b); // segment direction
        if (tA.lengthSq() < 1e-8) tA.set(0, 1, 0);
        tB.subVectors(cam.position, a); // toward the camera
        tC.crossVectors(tA, tB).normalize();
        const k = 1 - pts[i].age / o.life,
          w = o.width * Math.pow(Math.max(0, k), 0.7) * (i === 0 ? 0.6 : 1),
          al = o.alpha * Math.pow(Math.max(0, k), 1.4);
        pos.set([a.x + tC.x * w, a.y + tC.y * w, a.z + tC.z * w], i * 6);
        pos.set([a.x - tC.x * w, a.y - tC.y * w, a.z - tC.z * w], i * 6 + 3);
        alpha[i * 2] = alpha[i * 2 + 1] = al;
      }
      g.setDrawRange(0, (n - 1) * 6);
      g.attributes.position.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
      mesh.visible = true;
    }
  };
}
