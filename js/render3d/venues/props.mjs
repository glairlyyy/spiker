// Venue set: officials, benches, scorer table, ball cart (spec §9.11). Built hidden by venue3d.mjs buildVenues; shown by dressVenue.
import * as THREE from 'three';
import { W } from '../units3d.mjs';
import { box, at, figure } from './kit.mjs';

/** Officials and court-side props: referee stand by the far post, line judges, benches, scorer's table, ball cart. */
export function setOfficials() {
  const g = new THREE.Group(),
    far = W(500, 1.04).z; // far post
  const stand = new THREE.Group();
  for (const [dx, dz] of [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35]
  ])
    stand.add(
      at(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6),
          new THREE.MeshStandardMaterial({ color: '#c8ccd8', metalness: 0.5 })
        ),
        dx,
        0.75,
        dz
      )
    );
  stand.add(at(box(0.9, 0.08, 0.9, '#c8ccd8', { metal: 0.4 }), 0, 1.5, 0));
  const ref = figure('#1d1f26');
  ref.position.y = 1.54;
  stand.add(ref);
  stand.position.set(0, 0, far - 0.75);
  g.add(stand);
  const judges = new THREE.Group();
  for (const x of [60, 940]) {
    const j = figure('#20232c'),
      p = W(x, 1.02);
    j.position.set(p.x, 0, p.z - 0.3);
    const flag = at(
      new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshBasicMaterial({ color: '#ff4a3a', side: THREE.DoubleSide })),
      0.32,
      1.25,
      0
    );
    j.add(flag);
    judges.add(j);
  }
  g.add(judges);
  for (const s of [-1, 1]) {
    const b = new THREE.Group();
    b.add(at(box(5, 0.08, 0.5, '#2c3550'), 0, 0.45, 0), at(box(5, 0.5, 0.06, '#2c3550'), 0, 0.72, -0.24));
    for (const x of [-2.3, 2.3]) b.add(at(box(0.06, 0.45, 0.45, '#1a1f30'), x, 0.22, 0));
    b.position.set(s * 6.5, 0, far - 1.9);
    g.add(b);
  }
  const table = new THREE.Group();
  table.add(at(box(2.4, 0.06, 0.7, '#e8ebf2'), 0, 0.75, 0), at(box(2.4, 0.7, 0.04, '#1f2a4a'), 0, 0.37, 0.33));
  table.position.set(0, 0, far - 2.2);
  g.add(table);
  const cart = new THREE.Group();
  cart.add(at(box(0.9, 0.04, 0.6, '#9aa0aa', { metal: 0.6 }), 0, 0.35, 0));
  const ballMat = new THREE.MeshStandardMaterial({ color: '#f2d24a', roughness: 0.5 });
  for (let i = 0; i < 6; i++)
    cart.add(
      at(
        new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), ballMat),
        -0.3 + (i % 3) * 0.3,
        0.55 + Math.floor(i / 3) * 0.25,
        (i % 2) * 0.2 - 0.1
      )
    );
  cart.position.set(-12.5, 0, far - 1.4);
  g.add(cart);
  g.userData = { judges, table };
  return g;
}
