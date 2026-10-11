// Ground and body effects: the blast, dust, a dive's skid, ball touches, a tired breath. (fx3d.mjs assembles every group into one `fx` object.)
import * as THREE from 'three';
import { rr, rv, vx } from './kit.mjs';

/** The group's effects over the kit `K` (createKit). */
export function groundFx(K) {
  const { GLOW, SPARK, SMOKE, PUFF, STREAK, spawnRock, ring, disc } = K;
  return {
    /**
     * Ground blast (owner, 2026-10-06 — the Niagara look; tuned in the VFX lab): a hot core, sparks that streak out, arc down
     * and skip off the floor, embers drifting up, billowing smoke lit red from inside, dark debris, a floor glow and a ring.
     * `col` the blast's colour (an element's), `hot` its core. Scaled by power (100 = full).
     */
    blast(p, pow, col = '#ff5a1f', hot = '#fff1c4') {
      const k = Math.min(1.5, Math.max(0.4, pow / 100)) * vx('blast', 'size', 1),
        SP = vx('blast', 'sparks', 1),
        SM = vx('blast', 'smoke', 1),
        f = new THREE.Vector3(p.x, Math.max(0.05, p.y), p.z),
        up = (lo, hi, sp) => {
          const a = Math.random() * Math.PI * 2,
            y = rr(lo, hi),
            r = Math.sqrt(1 - y * y);
          return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(sp);
        };
      disc(f, col, 3.6 * k, 1.1);
      ring(f, col, 2.4 * k, 0.4, true, { op: 0.3 });
      // the core: a white-hot flash, then deep red glows that linger inside the smoke
      for (let i = 0; i < 26 * k; i++)
        GLOW.spawn(f.clone().add(rv(0.2)), up(0.2, 1, rr(0.5, 2.5)), hot, col, rr(0.7, 1.3) * k, 0.2, rr(0.18, 0.35), { drag: 4 });
      for (let i = 0; i < 22 * k; i++)
        GLOW.spawn(
          f.clone().add(up(0, 0.8, rr(0.1, 0.7) * k)),
          up(0.3, 1, rr(0.2, 0.8)),
          col,
          '#3a0806',
          rr(0.4, 0.8) * k,
          rr(0.6, 1),
          rr(0.9, 1.6),
          { a: 0.55, drag: 2 }
        );
      // sparks: fast streaks in a fountain, falling and skipping off the floor
      for (let i = 0; i < 70 * k * SP; i++)
        STREAK.spawn(f, up(0.15, 1, rr(5, 13) * k), '#ffb347', i % 3 ? col : hot, rr(0.05, 0.09), rr(0.1, 0.18), rr(0.7, 1.5), {
          g: 9.8,
          drag: 0.7,
          floor: true
        });
      // embers: small twinkling motes that float up and drift
      for (let i = 0; i < 120 * k * SP; i++)
        SPARK.spawn(f.clone().add(rv(rr(0, 0.6))), up(0.1, 1, rr(0.5, 3.5) * k), hot, col, rr(0.07, 0.14), 0.03, rr(1, 2.4), {
          tw: rr(15, 35),
          g: -0.6,
          drag: 1.4
        });
      // smoke: billowing puffs, grey with a warm underside, spreading low and climbing
      for (let i = 0; i < 34 * k * SM; i++)
        PUFF.spawn(
          f.clone().add(up(0, 0.5, rr(0, 0.6))),
          up(0.2, 1, rr(0.8, 2.6) * k),
          '#c0aaa6',
          '#5c6070',
          rr(0.8, 1.2),
          rr(2.6, 3.8) * k,
          rr(2, 3.2),
          { a: 1, drag: 1.6, spin: rr(-0.8, 0.8), g: -0.5 }
        );
      // debris: dark chunks thrown out
      for (let i = 0; i < 12 * k; i++) spawnRock(f, up(0.3, 1, rr(2.5, 6) * k), 0.45, '#2b2626');
    },
    /**
     * Foundation (owner 2026-10-07: effects every player gets, whatever their stats). Dust off the floor at `p` (takeoff,
     * landing, a sprint step): `k` scales size and count (0 = nothing).
     */
    dust(p, k) {
      if (k <= 0.01) return;
      const c = vx('found', 'dust', '#e9dfcf'),
        f = new THREE.Vector3(p.x, 0.04, p.z);
      for (let i = 0; i < Math.round(3 + 7 * k); i++) {
        const a = Math.random() * Math.PI * 2,
          v = rr(0.5, 1.6) * Math.sqrt(k);
        SMOKE.spawn(
          f,
          new THREE.Vector3(Math.cos(a) * v, rr(0.1, 0.5) * k, Math.sin(a) * v),
          c,
          c,
          rr(0.12, 0.2) * k + 0.05,
          rr(0.35, 0.6) * k + 0.1,
          rr(0.4, 0.7),
          {
            a: 0.5,
            drag: 3,
            spin: rr(-1, 1)
          }
        );
      }
    },
    /** A dive's skid: a puff and a scuff spark behind the sliding body, `dir` the slide (unit, xz). */
    skid(p, dir, k) {
      if (k <= 0.01) return;
      const c = vx('found', 'dust', '#e9dfcf'),
        f = new THREE.Vector3(p.x, 0.05, p.z);
      SMOKE.spawn(f, dir.clone().multiplyScalar(-rr(0.3, 0.8)).setY(rr(0.1, 0.4)), c, c, 0.12 * k, 0.45 * k, rr(0.4, 0.7), {
        a: 0.3,
        drag: 2.5,
        spin: rr(-1, 1)
      });
      if (Math.random() < 0.5) SPARK.spawn(f, rv(rr(0.5, 1.5)).setY(rr(0.3, 1)), '#ffffff', c, 0.06 * k, 0.01, 0.25, { g: 4 });
    },
    /** A touch on the ball: 'bump' / 'dive' (forearm pop), 'set' (fingertip twinkle); `save`: dug off the floor (a spark ring). */
    touch(kind, p, save) {
      const k = vx('found', 'touch', 1);
      if (kind === 'set') {
        for (let i = 0; i < 8 * k; i++)
          SPARK.spawn(p, rv(rr(0.4, 1.2)), '#ffffff', '#ffe7a8', rr(0.14, 0.22) * k, 0.02, rr(0.3, 0.45), { tw: 30, drag: 3 });
      } else if (k > 0.01) {
        ring(p, '#ffffff', 0.45 * k, 0.22, false, { op: 0.55 });
        for (let i = 0; i < 6 * k; i++)
          GLOW.spawn(p, rv(rr(1, 2.5)), '#ffffff', '#cfe8ff', rr(0.08, 0.14), 0.02, rr(0.15, 0.25), { drag: 5 });
      }
      const s = save ? vx('found', 'save', 1) : 0;
      if (s > 0.01) {
        const f = new THREE.Vector3(p.x, 0.03, p.z);
        ring(f, '#fff2b0', 1.1 * s, 0.35, true, { op: 0.8 });
        for (let i = 0; i < 16 * s; i++)
          SPARK.spawn(f, rv(rr(1, 3)).setY(rr(1, 3)), '#ffffff', '#ffd27a', rr(0.08, 0.14), 0.01, rr(0.3, 0.5), { g: 6, drag: 1.5 });
        this.dust(f, 0.8 * s);
      }
    },
    /** A tired player's breath: one small white puff from the mouth, drifting forward and up. */
    breath(p, fwd, k) {
      if (k <= 0.01) return;
      SMOKE.spawn(p, fwd.clone().multiplyScalar(0.35).setY(0.15), '#ffffff', '#dfe8f0', 0.04 * k, 0.22 * k, rr(0.8, 1.1), {
        a: 0.28,
        drag: 1.2,
        spin: rr(-1, 1)
      });
    }
  };
}
