// The per-frame trail behind a powered ball, in the element's style. (fx3d.mjs assembles every group into one `fx` object.)
import * as THREE from 'three';
import { rr, rv, vx, UP } from './kit.mjs';

/** The group's effects over the kit `K` (createKit). */
export function trailFx(K) {
  const { GLOW, SPARK, SMOKE, spawnRock, bolt, COL, HOT } = K;
  return {
    /** Per-frame trail behind a powered ball, in the element's style. `k` 0..1 strength. */
    trail(el, p, dir, pow, dt) {
      const E = COL(el),
        H = HOT[el] || '#fff',
        k = Math.min(1.8, 0.4 + pow / 110), // up to 1.8×: more and thicker particles on a harder hit
        back = dir.clone().multiplyScalar(-1),
        D = vx('elem', 'trail', 1),
        n = D > 0 ? Math.max(1, Math.round(60 * dt * D)) : 0,
        side = new THREE.Vector3().crossVectors(UP, dir).normalize(),
        up2 = new THREE.Vector3().crossVectors(dir, side).normalize();
      for (let s = 0; s < n; s++) {
        const tt = performance.now() * 0.06 + s;
        switch (el) {
          case 'fire':
            for (let i = 0; i < 4 * k; i++)
              GLOW.spawn(
                p.clone().add(rv(0.08)),
                back
                  .clone()
                  .multiplyScalar(rr(1, 3))
                  .add(rv(0.6))
                  .add(new THREE.Vector3(0, rr(0.5, 1.5), 0)),
                H,
                E,
                rr(0.35, 0.6),
                0.05,
                rr(0.25, 0.45),
                { drag: 2 }
              );
            if (Math.random() < 0.4 * k)
              SMOKE.spawn(p, back.clone().add(new THREE.Vector3(0, 1, 0)), '#3a2a22', '#15101a', 0.3, 0.9, 0.8, { a: 0.3, drag: 1 });
            break;
          case 'flash':
            for (let i = 0; i < 3 * k; i++) SPARK.spawn(p, rv(rr(2, 5)), '#ffffff', E, rr(0.12, 0.22), 0.02, rr(0.12, 0.25), { drag: 4 });
            GLOW.spawn(p, back, E, H, 0.5 * k + 0.1, 0.1, 0.18);
            break;
          case 'water':
            for (const ph of [0, Math.PI])
              GLOW.spawn(
                p
                  .clone()
                  .addScaledVector(side, Math.cos(tt * 0.45 + ph) * 0.24)
                  .addScaledVector(up2, Math.sin(tt * 0.45 + ph) * 0.24),
                back.clone().multiplyScalar(0.3),
                H,
                E,
                0.22,
                0.12,
                0.45
              );
            if (Math.random() < 0.6 * k)
              GLOW.spawn(p, rv(1.2).add(new THREE.Vector3(0, 1, 0)), H, E, 0.12, 0.06, 0.7, { g: 6, floor: true });
            break;
          case 'wind':
            for (const [ph, r] of [
              [0, 0.3],
              [2.1, 0.22],
              [4.2, 0.36]
            ])
              GLOW.spawn(
                p
                  .clone()
                  .addScaledVector(side, Math.cos(tt * 0.6 + ph) * r)
                  .addScaledVector(up2, Math.sin(tt * 0.6 + ph) * r),
                back.clone().multiplyScalar(0.5),
                '#ffffff',
                H,
                0.14,
                0.05,
                0.35,
                { a: 0.8 }
              );
            break;
          case 'earth':
            if (Math.random() < 0.3 * k)
              spawnRock(
                p.clone().add(rv(0.1)),
                back
                  .clone()
                  .multiplyScalar(rr(1, 3))
                  .add(rv(1.5))
                  .add(new THREE.Vector3(0, 1, 0)),
                0.8
              );
            SMOKE.spawn(p.clone().add(rv(0.05)), back.clone().add(rv(0.4)), '#b39a74', '#6b5a44', 0.25, 0.8, 0.6, { a: 0.4, drag: 2 });
            break;
          case 'blast':
            if (Math.floor(tt) % 5 === 0) {
              for (let i = 0; i < 7 * k; i++) GLOW.spawn(p, rv(rr(1, 2.5)), H, E, rr(0.25, 0.45), 0.05, rr(0.2, 0.35), { drag: 5 });
              SMOKE.spawn(p, rv(0.4), '#4a3a30', '#221a18', 0.4, 1.0, 0.7, { a: 0.4, drag: 2 });
            }
            break;
          case 'shadow':
            SMOKE.spawn(
              p.clone().add(rv(0.08)),
              back.clone().multiplyScalar(rr(0.5, 1.5)).add(rv(0.3)),
              '#2a0f4a',
              '#08040f',
              rr(0.35, 0.55),
              1.0,
              rr(0.5, 0.8),
              { a: 0.65, drag: 1.5 }
            );
            if (Math.random() < 0.5) GLOW.spawn(p.clone().add(rv(0.15)), rv(0.3), E, '#3a1a6a', 0.18, 0.05, 0.4);
            break;
          case 'star':
            if (Math.random() < 0.8)
              SPARK.spawn(
                p.clone().add(rv(rr(0.05, 0.3))),
                back.clone().multiplyScalar(0.2).add(rv(0.2)),
                '#ffffff',
                E,
                rr(0.15, 0.3),
                0.05,
                rr(0.5, 0.9),
                { tw: 30 }
              );
            break;
        }
      }
      if (el === 'flash' && Math.random() < 0.5 * k)
        bolt(p, p.clone().addScaledVector(back, rr(0.8, 1.6)).add(rv(0.3)), H, 0.07, 0.18, 0.01);
    }
  };
}
