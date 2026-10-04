// Venue set: the street court (spec §9.11). Built hidden by venue3d.mjs buildVenues; shown by dressVenue.
import * as THREE from 'three';
import { canvasTex } from '../units3d.mjs';
import { box, at } from './kit.mjs';

export function setStreet() {
  const g = new THREE.Group();
  const link = canvasTex(128, 128, (c, cw) => {
    c.clearRect(0, 0, cw, cw);
    c.strokeStyle = 'rgba(190,200,210,.75)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(cw, cw);
    c.moveTo(cw, 0);
    c.lineTo(0, cw);
    c.stroke();
  });
  link.wrapS = link.wrapT = THREE.RepeatWrapping;
  link.repeat.set(60, 6);
  const fenceMat = new THREE.MeshBasicMaterial({ map: link, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(36, 3.6), fenceMat), 0, 1.8, -8.9));
  // overpass deck and pillars with graffiti
  g.add(at(box(80, 1.4, 9, '#3a3d44'), 0, 9.5, -15));
  const tag = (txt, col) =>
    canvasTex(256, 512, (c, cw, ch) => {
      c.fillStyle = '#4a4d55';
      c.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = ['#ff3b6b', '#3bd1ff', '#ffd23b', '#7cff6b'][i % 4] + '88';
        c.beginPath();
        c.ellipse(Math.random() * cw, 260 + Math.random() * 220, 40 + Math.random() * 60, 20 + Math.random() * 40, Math.random() * 3, 0, 7);
        c.fill();
      }
      c.fillStyle = col;
      c.font = '900 64px "Dela Gothic One","Arial Black",sans-serif';
      c.textAlign = 'center';
      c.save();
      c.translate(cw / 2, 380);
      c.rotate(-0.2);
      c.fillText(txt, 0, 0);
      c.restore();
    });
  ['SPIKE', 'WEI', 'NOBODY', 'SPITE'].forEach((t, i) => {
    const x = -21 + i * 14,
      p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), [
        ...Array(4).fill(new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 0.95 })),
        new THREE.MeshStandardMaterial({ map: tag(t, ['#ff3b6b', '#3bd1ff', '#ffd23b', '#ffffff'][i]), roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: '#4a4d55' })
      ]);
    p.position.set(x, 4.5, -13);
    g.add(p);
  });
  // sodium street lamps
  for (const x of [-12, 12]) {
    g.add(
      at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), new THREE.MeshStandardMaterial({ color: '#2a2c30' })), x, 3.5, -9.6)
    );
    const glow = at(
      new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffc070', fog: false })),
      x,
      7,
      -9.2
    );
    const L = new THREE.PointLight('#ffb050', 45, 30, 1.4);
    L.position.set(x, 6.8, -8.5);
    g.add(glow, L);
  }
  return g;
}
