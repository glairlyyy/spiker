// Venue set: Academy Hall (spec §9.11). Built hidden by venue3d.mjs buildVenues; shown by dressVenue.
import * as THREE from 'three';
import { canvasTex, lowEnd } from '../units3d.mjs';
import { at, beam, bleachers } from './kit.mjs';

export function setHall(w) {
  const g = new THREE.Group();
  bleachers(g, 4, 0.45, 1.0, '#8a95a6', 17.5);
  const wall = at(
    new THREE.Mesh(new THREE.PlaneGeometry(60, 14), new THREE.MeshStandardMaterial({ color: '#6b7787', roughness: 0.95 })),
    0,
    7,
    -15
  );
  g.add(wall);
  for (let i = 0; i < 6; i++) {
    const x = -20 + i * 8,
      win = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false }));
    win.position.set(x, 10.5, -14.95);
    g.add(win);
    if (!lowEnd) {
      const s = beam(0.9, 2.4, 13, '#fff1cc', 0.03);
      s.position.set(x + 2.5, 5.5, -9);
      s.rotation.x = -0.75;
      s.rotation.z = 0.25;
      g.add(s);
    }
  }
  const ban = ['ACADEMY', 'U21', 'SPIKE', 'NEVER GIVE UP'];
  ban.forEach((t, i) => {
    const tex = canvasTex(256, 512, (c, cw, ch) => {
      c.fillStyle = ['#7a1f2b', '#1f3f7a', '#2b6a3a', '#5a2b7a'][i];
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = '#f4e9c8';
      c.font = '800 46px "Rajdhani",sans-serif';
      c.textAlign = 'center';
      c.save();
      c.translate(cw / 2, ch / 2);
      c.rotate(-Math.PI / 2);
      c.fillText(t, 0, 16);
      c.restore();
    });
    g.add(
      at(
        new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })),
        -21 + i * 14,
        6.4,
        -14.9
      )
    );
  });
  // wall board with the score
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: w.screenTex, fog: false })), 0, 6.4, -14.9));
  return g;
}
