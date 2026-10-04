// Venue set: Highland Court (spec §9.11). Built hidden by venue3d.mjs buildVenues; shown by dressVenue.
import * as THREE from 'three';
import { at } from './kit.mjs';

export function setHighland(w) {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#56685a', roughness: 1, flatShading: true }),
    snow = new THREE.MeshStandardMaterial({ color: '#eef2f4', roughness: 1, flatShading: true });
  for (const [x, z, r, h] of [
    [-38, -60, 18, 22],
    [-12, -72, 22, 30],
    [16, -64, 17, 20],
    [40, -70, 20, 26],
    [0, -52, 12, 13]
  ]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
    m.position.set(x, h / 2 - 0.5, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 7), snow);
    cap.position.set(x, h - h * 0.14 - 0.5, z);
    g.add(m, cap);
  }
  const flags = [];
  for (let i = 0; i < 6; i++) {
    const x = -15 + i * 6,
      pole = at(
        new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5, 6), new THREE.MeshStandardMaterial({ color: '#c8ccd2' })),
        x,
        2.5,
        -11.5
      ),
      geo = new THREE.PlaneGeometry(1.6, 0.9, 8, 2),
      fl = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: ['#2fb8a0', '#d8d2c0', '#2fb8a0', '#c0503a', '#2fb8a0', '#d8d2c0'][i],
          side: THREE.DoubleSide,
          roughness: 0.9
        })
      );
    fl.position.set(x + 0.8, 4.5, -11.5);
    flags.push({ fl, rest: geo.attributes.position.array.slice(), ph: i });
    g.add(pole, fl);
  }
  g.userData.flags = flags;
  return g;
}
