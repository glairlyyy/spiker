// Element effects: the element flourish at contact and the element floor hit. (fx3d.mjs assembles every group into one `fx` object.)
import * as THREE from 'three';
import { rr, rv, vx } from './kit.mjs';

/** The group's effects over the kit `K` (createKit). */
export function elementsFx(K) {
  const { GLOW, SPARK, SMOKE, spawnRock, bolt, ring, COL, HOT } = K;
  return {
    /** Element flourish at a contact point; `dir` (unit vector) sends a jet along the shot. */
    elemBurst(el, p, pow, dir) {
      const D = vx('elem', 'parts', 1);
      const E = COL(el),
        H = HOT[el] || '#fff',
        k = Math.min(1.5, pow / 90);
      ring(p, E, 1.5 * k, 0.4);
      for (let i = 0; i < 40 * k * D; i++) GLOW.spawn(p, rv(rr(1.5, 5) * k), H, E, rr(0.2, 0.42), 0.03, rr(0.25, 0.5), { drag: 4 });
      switch (el) {
        case 'flash':
          bolt(new THREE.Vector3(p.x + rr(-1, 1), 13, p.z + rr(-1, 1)), p, H, 0.22, 0.9, 0.03);
          for (let i = 0; i < 5 * D; i++) bolt(p, p.clone().add(rv(rr(0.8, 1.6) * k)), E, 0.15, 0.25, 0.012);
          break;
        case 'fire':
          for (let i = 0; i < 40 * k * D; i++)
            GLOW.spawn(p, rv(rr(1, 3)).add(new THREE.Vector3(0, 2, 0)), '#fff4c0', E, rr(0.4, 0.8), 0.05, rr(0.3, 0.6), { drag: 3 });
          break;
        case 'blast':
          for (let i = 0; i < 16 * D; i++)
            SMOKE.spawn(p.clone().add(rv(0.2)), rv(rr(0.5, 2)), '#5a4436', '#1a1412', rr(0.5, 0.9), 1.8, rr(0.8, 1.2), {
              a: 0.55,
              drag: 2.5
            });
          ring(p, '#fff0a0', 2.6 * k, 0.5);
          break;
        case 'earth':
          for (let i = 0; i < 16 * k * D; i++) spawnRock(p, rv(rr(2, 4)).add(new THREE.Vector3(0, 2, 0)), 1.2);
          break;
        case 'water':
          for (let i = 0; i < 50 * k * D; i++) {
            const a = (i / 50) * Math.PI * 2;
            GLOW.spawn(p, new THREE.Vector3(Math.cos(a) * 3, rr(1, 3), Math.sin(a) * 3), '#ffffff', E, 0.16, 0.08, 0.8, {
              g: 7,
              floor: true
            });
          }
          break;
        case 'wind':
          for (let i = 0; i < 3 * D; i++) ring(p, '#ffffff', (1.8 + i * 0.9) * k, 0.45 + i * 0.12);
          break;
        case 'shadow':
          for (let i = 0; i < 30 * k * D; i++) {
            const o = rv(rr(0.8, 1.5));
            SMOKE.spawn(p.clone().add(o), o.clone().multiplyScalar(-2.2), '#1a0830', '#000000', 0.6, 0.2, 0.45, { a: 0.7 });
          }
          break;
        case 'star':
          for (let i = 0; i < 30 * k * D; i++)
            SPARK.spawn(p, rv(rr(1, 3)), '#ffffff', E, rr(0.25, 0.45), 0.05, rr(0.6, 1.1), { tw: 25, drag: 2 });
          break;
      }
      if (dir)
        for (let i = 0; i < 20 * k * D; i++)
          GLOW.spawn(p, dir.clone().multiplyScalar(rr(3, 7)).add(rv(1.2)), '#ffffff', E, 0.2, 0.02, 0.25);
    },
    /** Element hit on the floor: flame pillar, splash, rock burst, gusts, explosion, dark implosion, sparkles, bolt. */
    elemImpact(el, p, pow) {
      const D = vx('elem', 'parts', 1);
      const E = COL(el),
        H = HOT[el] || '#fff',
        k = Math.min(1.5, pow / 90),
        f = new THREE.Vector3(p.x, 0.05, p.z);
      ring(f, E, 1.6 * k, 0.55, true);
      switch (el) {
        case 'fire':
          for (let i = 0; i < 50 * k * D; i++)
            GLOW.spawn(
              f.clone().add(new THREE.Vector3(rr(-0.4, 0.4), 0, rr(-0.4, 0.4))),
              new THREE.Vector3(rr(-0.4, 0.4), rr(2, 5), rr(-0.4, 0.4)),
              '#fff4c0',
              E,
              rr(0.35, 0.7),
              0.05,
              rr(0.4, 0.8),
              { drag: 1.5 }
            );
          break;
        case 'water':
          for (let r = 0; r < 3; r++) ring(f, '#8fdcff', (1.2 + r * 0.6) * k, 0.5 + r * 0.12, true);
          for (let i = 0; i < 50 * k * D; i++)
            GLOW.spawn(f, new THREE.Vector3(rr(-2, 2), rr(2, 4.5), rr(-2, 2)), '#ffffff', E, rr(0.1, 0.18), 0.06, 1, { g: 9, floor: true });
          break;
        case 'earth':
          for (let i = 0; i < 22 * k * D; i++) spawnRock(f, new THREE.Vector3(rr(-2.5, 2.5), rr(2, 5), rr(-2.5, 2.5)), 1.3);
          for (let i = 0; i < 16 * D; i++)
            SMOKE.spawn(f, new THREE.Vector3(rr(-1.5, 1.5), rr(0.3, 1), rr(-1.5, 1.5)), '#c9b08a', '#6b5a44', 0.3, 1, 1, {
              a: 0.5,
              drag: 2
            });
          break;
        case 'wind':
          for (let i = 0; i < 3 * D; i++) ring(f, '#ffffff', (1.4 + i * 0.8) * k, 0.4 + i * 0.12, true);
          for (let i = 0; i < 20 * D; i++) {
            const a = (i / 20) * Math.PI * 2;
            GLOW.spawn(f, new THREE.Vector3(Math.cos(a) * 4, rr(0.2, 1), Math.sin(a) * 4), '#ffffff', H, 0.12, 0.04, 0.4, { a: 0.8 });
          }
          break;
        case 'blast':
          for (let i = 0; i < 40 * k * D; i++)
            GLOW.spawn(f, rv(rr(2, 5)).setY(rr(1, 4)), H, E, rr(0.3, 0.6), 0.05, rr(0.3, 0.55), { drag: 3 });
          for (let i = 0; i < 18 * D; i++)
            SMOKE.spawn(f.clone().add(rv(0.3)), rv(rr(0.5, 2)).setY(rr(0.5, 2)), '#5a4436', '#1a1412', rr(0.5, 0.9), 1.9, rr(0.9, 1.3), {
              a: 0.55,
              drag: 2.5
            });
          break;
        case 'shadow':
          for (let i = 0; i < 30 * k * D; i++)
            SMOKE.spawn(
              f.clone().add(new THREE.Vector3(rr(-1, 1), 0, rr(-1, 1))),
              new THREE.Vector3(0, rr(0.5, 1.5), 0),
              '#2a0f4a',
              '#000000',
              0.5,
              1.2,
              rr(0.8, 1.2),
              { a: 0.7 }
            );
          break;
        case 'star':
          for (let i = 0; i < 30 * k * D; i++)
            SPARK.spawn(f, new THREE.Vector3(rr(-1.5, 1.5), rr(1, 3), rr(-1.5, 1.5)), '#ffffff', E, rr(0.2, 0.4), 0.05, rr(0.7, 1.2), {
              tw: 25,
              g: 2
            });
          break;
        case 'flash':
          bolt(new THREE.Vector3(f.x + rr(-1, 1), 13, f.z + rr(-1, 1)), f, H, 0.25, 1, 0.035);
          for (let i = 0; i < 20 * k * D; i++)
            SPARK.spawn(f, new THREE.Vector3(rr(-3, 3), rr(1, 4), rr(-3, 3)), '#ffffff', E, 0.15, 0.02, 0.35, { drag: 3, g: 5 });
          break;
      }
    }
  };
}
