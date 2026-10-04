// Venue set: Beach Stadium (spec §9.11). Built hidden by venue3d.mjs buildVenues; shown by dressVenue.
import * as THREE from 'three';
import { lowEnd } from '../units3d.mjs';
import { at, bleachers } from './kit.mjs';

export function setBeach() {
  const g = new THREE.Group();
  bleachers(g, 4, 0.5, 1.1, '#9aa3ad', 13.5);
  const sea = at(
    new THREE.Mesh(
      new THREE.PlaneGeometry(400, 160),
      new THREE.MeshStandardMaterial({ color: '#2a86c9', roughness: 0.25, metalness: 0.2 })
    ),
    0,
    -0.05,
    -110
  );
  sea.rotation.x = -Math.PI / 2;
  g.add(sea);
  const palm = (x, z, h) => {
    const p = new THREE.Group(),
      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.26, h, 8),
        new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 })
      );
    trunk.position.y = h / 2;
    trunk.rotation.z = 0.08;
    p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 3.2, 4),
        new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.8 })
      );
      leaf.position.set(Math.cos(i) * 1.1, h, Math.sin(i) * 1.1);
      leaf.rotation.set(Math.sin(i) * 1.2, 0, -Math.cos(i) * 1.2);
      p.add(leaf);
    }
    return at(p, x, 0, z);
  };
  for (const [x, z, h] of [
    [-19, -17, 7],
    [-14, -21, 8],
    [15, -18, 7.5],
    [21, -22, 8.5],
    ...(lowEnd
      ? []
      : [
          [-24, -13, 6.5],
          [25, -14, 6]
        ])
  ])
    g.add(palm(x, z, h));
  return g;
}
