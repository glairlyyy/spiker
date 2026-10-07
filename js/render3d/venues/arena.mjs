// Venue set: League Arena (spec §9.11). Built hidden by venue3d.mjs buildVenues; shown by dressVenue.
import * as THREE from 'three';
import { lowEnd } from '../units3d.mjs';
import { box, at, beam } from './kit.mjs';

// ---------- sets ----------
export function setArena(w) {
  const g = new THREE.Group();
  // roof trusses and the big screen behind the far stands
  for (const x of [-15, -5, 5, 15]) {
    const t = at(box(0.4, 0.4, 30, '#141826'), x, 14, -4);
    t.userData.overhead = true; // hidden in the bird's-eye view (it would cross the court)
    g.add(t);
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ map: w.screenTex, fog: false }));
  scr.position.set(0, 7.4, -18.2);
  const frame = at(box(8.5, 4.5, 0.4, '#0d1020'), 0, 7.4, -18.45);
  g.add(frame, scr);
  // LED ribbon along the stands
  const rib = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.35), new THREE.MeshBasicMaterial({ color: '#2a7fff', fog: false }));
  rib.position.set(0, 3.8, -16.7);
  g.add(rib);
  if (!lowEnd)
    for (const [x, z] of [
      [-6, -2],
      [6, -2],
      [-6, 2.5],
      [6, 2.5]
    ]) {
      const c = beam(0.4, 3.2, 14, '#bcd2ff', 0.035);
      c.position.set(x, 7, z);
      g.add(c);
    }
  const spot = new THREE.SpotLight('#ffffff', 0, 40, 0.75, 0.6, 1.2);
  spot.position.set(0, 16, 2);
  spot.target.position.set(0, 0, 0);
  g.add(spot, spot.target);
  g.userData.spot = spot;
  return g;
}
