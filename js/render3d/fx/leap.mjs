// High-jump effects (VFX.leap, owner 2026-10-16): a big take-off (floor ring + dust), air rushing down past the rising
// body, a shimmering haze ring at the top, and the warp — a jump so fast it reads as a teleport: a flash and a light
// column off the floor, the body gone on the way up, a pop where it reappears at the top. Display only, Math.random only.
import * as THREE from 'three';
import { rr, vx } from './kit.mjs';

/** The group's effects over the kit `K` (createKit). */
export function leapFx(K) {
  const { GLOW, SPARK, STREAK, ring } = K;
  return {
    /** Take-off at floor point `p`: `k` (0.5–1.2) by height; `warp`: the teleport start, in `col` (the team colour). */
    leapOff(p, k, warp, col = '#ffffff') {
      const R = vx('leap', 'ring', 1),
        f = new THREE.Vector3(p.x, 0.03, p.z);
      if (R > 0) ring(f, '#ffffff', (0.9 + 0.8 * k) * R, 0.38, true, { op: 0.7 });
      this.dust(p, (0.9 + 0.6 * k) * vx('found', 'jump', 1));
      if (!warp) return;
      // the warp: a flash on the floor and a column of light streaks shooting up where the body was
      for (let i = 0; i < 8; i++)
        GLOW.spawn(f.clone().setY(0.2 + i * 0.25), new THREE.Vector3(0, rr(2, 6), 0), '#ffffff', col, rr(0.35, 0.6), 0.05, rr(0.12, 0.2), {
          drag: 3
        });
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2,
          r = rr(0.05, 0.4);
        STREAK.spawn(
          new THREE.Vector3(p.x + Math.cos(a) * r, rr(0, 0.6), p.z + Math.sin(a) * r),
          new THREE.Vector3(0, rr(22, 38) * k, 0),
          '#ffffff',
          col,
          rr(0.02, 0.05),
          0.05,
          rr(0.1, 0.16),
          { drag: 1 }
        );
      }
      if (R > 0) ring(f, col, (1.3 + 0.8 * k) * R, 0.3, true, { op: 0.9, delay: 0.02 });
    },
    /** Air rushing down past a rising body at `p` (its chest): a few thin streaks a call. */
    leapWind(p, k) {
      const W = vx('leap', 'wind', 1);
      for (let i = 0; i < Math.round(2 * W); i++) {
        const a = Math.random() * Math.PI * 2,
          r = rr(0.3, 0.6);
        STREAK.spawn(
          new THREE.Vector3(p.x + Math.cos(a) * r, p.y + rr(-0.5, 0.7), p.z + Math.sin(a) * r),
          new THREE.Vector3(0, -rr(8, 14) * k, 0),
          '#ffffff',
          '#cfe8ff',
          0.015,
          0.03,
          rr(0.12, 0.2),
          { drag: 2 }
        );
      }
    },
    /** The top of a high jump at `p`: a faint shimmering ring round the body (a haze, not a blast). */
    leapHaze(p, k) {
      const H = vx('leap', 'haze', 1);
      if (H <= 0) return;
      ring(p, '#e8f4ff', (0.9 + 0.5 * k) * H, 0.42, false, { op: 0.25 });
      ring(p, '#ffffff', (0.6 + 0.4 * k) * H, 0.32, false, { op: 0.16, delay: 0.07 });
      for (let i = 0; i < 6 * H; i++)
        GLOW.spawn(
          p.clone().add(new THREE.Vector3(rr(-0.4, 0.4), rr(-0.5, 0.5), rr(-0.4, 0.4))),
          new THREE.Vector3(0, rr(0.2, 0.6), 0),
          '#ffffff',
          '#cfe8ff',
          0.08,
          0.2,
          rr(0.3, 0.5),
          { a: 0.35, drag: 2 }
        );
    },
    /** The warp's end: the body pops back in at `p` (its chest) — a ring, a flash and sparks thrown out, in `col`. */
    warpIn(p, k, col = '#ffffff') {
      ring(p, col, 1.1 + 0.4 * k, 0.26, false, { op: 0.9 });
      ring(p, '#ffffff', 0.7 + 0.3 * k, 0.2, false, { op: 0.8 });
      GLOW.spawn(p, new THREE.Vector3(), '#ffffff', col, 0.9 + 0.4 * k, 0.1, 0.16);
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2,
          b = rr(-0.6, 0.6);
        SPARK.spawn(
          p,
          new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(rr(4, 8)),
          '#ffffff',
          col,
          rr(0.08, 0.14),
          0.02,
          rr(0.18, 0.28),
          { drag: 4 }
        );
      }
    }
  };
}
