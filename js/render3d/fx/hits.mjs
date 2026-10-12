// Hit effects: air impact, contact burst, floor impact, OP electricity, sky bolts, arcs, aura motes. (fx3d.mjs assembles every group into one `fx` object.)
import * as THREE from 'three';
import { rr, rv, vx, dk } from './kit.mjs';

/** The group's effects over the kit `K` (createKit). */
export function hitsFx(K) {
  const { scene, GLOW, SPARK, SMOKE, bolt, ring, DOME, domes } = K;
  return {
    /**
     * Air impact (spec §2.3a, owner 2026-10-06 — the Kuroko look): a spike splits the air at the contact. Pressure rings stacked
     * along the shot (`dir`, unit vector), wind lines thrown out sideways in the ring plane, a jet of air down the line and, on a
     * heavy hit, a dome of pressure ballooning out. Scaled by power (hard 58 → ult 100+)
     * The rings run large → small away from the hand (a Doppler cone); `classic`: small → large (the first version).
     */
    airImpact(p, dir, pow, color, classic = false, o = {}) {
      const k = Math.min(1.5, Math.max(0.35, (pow - 50) / 45)),
        R4 = typeof Dir !== 'undefined' && Dir.airRings ? Dir.airRings() : vx('air', 'rings', 4), // the director's rings (spec §2.15)
        n = Math.max(1, pow >= 95 ? R4 : pow >= 80 ? R4 - 1 : R4 - 2),
        dop = !classic && vx('air', 'doppler', 1),
        len = dop ? vx('air', 'len', 2) : 1,
        sz = vx('air', 'size', 1),
        lf = vx('air', 'life', 1);
      // the Doppler look (owner 2026-10-06): the biggest ring at the hand, smaller and closer together down the shot;
      // `classic` = the first version, small at the hand → large down the shot (kept in the VFX lab)
      // the gaps between rings; o.span (m): the stack is stretched over that much of the ball's flight (it follows the ball)
      const gap = i => 0.32 * k * (dop ? len * Math.max(0.15, 1 - i * (0.72 / Math.max(1, n))) : 1),
        sum = Array.from({ length: Math.max(0, n - 1) }, (_, i) => gap(i)).reduce((a, b) => a + b, 0),
        g = o.span && sum > 0 ? Math.max(0, o.span - 0.18) / sum : 1;
      for (let i = 0, at = 0.18; i < n; i++) {
        const q = p.clone().addScaledVector(dir, at),
          size = (0.7 + (dop ? n - 1 - i : i) * 0.55) * k * sz;
        // o.speed (m/s): each ring appears as the ball passes it (after o.lag s on the hand); else a fixed stagger
        const delay = o.speed ? (o.lag || 0) + at / o.speed : i * 0.035;
        ring(q, i % 2 ? color : '#ffffff', size, (0.32 + i * 0.07) * lf, false, { dir, delay, op: i ? 0.75 : 1 });
        at += gap(i) * g;
      }
      // wind lines: fast, thin sparks out from the contact, perpendicular to the shot
      const u = new THREE.Vector3()
          .crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
          .normalize(),
        v = new THREE.Vector3().crossVectors(dir, u).normalize();
      for (let i = 0; i < 26 * k * vx('air', 'wind', 1); i++) {
        const a = Math.random() * Math.PI * 2,
          side = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        SPARK.spawn(
          p,
          side.multiplyScalar(rr(6, 11) * k).addScaledVector(dir, rr(-1, 2)),
          '#ffffff',
          '#cfe8ff',
          rr(0.08, 0.14),
          0.012,
          rr(0.14, 0.24),
          { drag: 5 }
        );
      }
      // the jet of displaced air down the line of the shot
      for (let i = 0; i < 14 * k * vx('air', 'jet', 1); i++)
        GLOW.spawn(
          p,
          dir
            .clone()
            .multiplyScalar(rr(5, 10) * k * len)
            .add(rv(rr(0.3, 1.2))),
          '#ffffff',
          color,
          rr(0.12, 0.24),
          0.02,
          rr(0.18, 0.3),
          { drag: 4 }
        );
      if (pow >= (typeof Dir !== 'undefined' && Dir.airDome ? Dir.airDome() : vx('air', 'dome', 95))) {
        const m = new THREE.Mesh(
          DOME,
          new THREE.MeshBasicMaterial({
            color: '#dff1ff',
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        m.position.copy(p);
        m.renderOrder = 4;
        scene.add(m);
        domes.push({ m, size: 1.6 * k * sz * dk(), life: 0.3 * lf, age: 0 });
      }
    },
    /**
     * A receive takes a hard ball (owner, 2026-10-12 — VFX.recv): the shock goes through the receiver. Pressure rings stacked
     * along the ball's line through the arms, biggest at the arms and smaller behind (the Doppler look of the air impact),
     * wind lines out sideways, and on a hard one (or a knockdown) a ripple on the floor. `k` 0..1 how hard.
     */
    recv(p, dir, k, ko) {
      const RG = vx('recv', 'ring', 1);
      if (RG <= 0.01 || k <= 0.01) return;
      const d = dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector3(1, -0.3, 0).normalize(),
        n = ko ? 3 : k >= vx('recv', 'hard', 0.55) ? 2 : 1;
      for (let i = 0, at = 0; i < n; i++) {
        const q = p.clone().addScaledVector(d, at);
        ring(q, '#ffffff', (0.55 + 0.75 * k) * (1 - i * 0.28) * RG, 0.26 + i * 0.05, false, {
          dir: d,
          delay: i * 0.03,
          op: i ? 0.6 : 0.95
        });
        at += (0.22 + 0.25 * k) * (1 - i * 0.2);
      }
      const u = new THREE.Vector3()
          .crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
          .normalize(),
        v = new THREE.Vector3().crossVectors(d, u).normalize();
      for (let i = 0; i < 14 * k * RG; i++) {
        const a = Math.random() * Math.PI * 2,
          side = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        SPARK.spawn(
          p,
          side.multiplyScalar(rr(3, 6) * (0.5 + k)).addScaledVector(d, rr(0, 2)),
          '#ffffff',
          '#dfefff',
          rr(0.06, 0.1),
          0.01,
          rr(0.12, 0.2),
          {
            drag: 5
          }
        );
      }
      if (ko || k >= vx('recv', 'hard', 0.55)) {
        const f = new THREE.Vector3(p.x, 0.03, p.z);
        ring(f, '#ffffff', (0.9 + 0.7 * k) * RG, 0.4, true, { op: 0.55 });
      }
    },
    /** Generic contact burst at a point (spike, serve, block): team-coloured ring and sparks. */
    burst(p, pow, color) {
      const k = Math.min(1.4, pow / 100);
      // the contact rings are small (owner, 2026-10-06: 0.2× — the spike's air impact carries the big shape)
      const BR = vx('burst', 'ring', 0.2),
        D = vx('burst', 'parts', 1);
      if (BR > 0) ring(p, color, (1.3 * k + 0.3) * BR, 0.4);
      if (pow > 80 && BR > 0) ring(p, '#ffffff', 0.8 * k * BR, 0.25);
      for (let i = 0; i < 30 * k * D; i++)
        GLOW.spawn(p, rv(rr(1.5, 4.5) * k), '#ffffff', color, rr(0.15, 0.3), 0.03, rr(0.25, 0.45), { drag: 4 });
      for (let i = 0; i < 12 * k * D; i++)
        SPARK.spawn(p, rv(rr(3, 6) * k), '#ffffff', color, rr(0.1, 0.18), 0.02, rr(0.2, 0.3), { drag: 3 });
    },
    /** Ball hits the floor: flat shockwave and a dust spray. */
    impact(p, pow) {
      const k = Math.min(1.4, pow / 100),
        f = new THREE.Vector3(p.x, 0.02, p.z);
      ring(f, '#ffffff', 1.4 * k + 0.3, 0.5, true);
      for (let i = 0; i < 26 * k; i++)
        SMOKE.spawn(
          f.clone().add(new THREE.Vector3(rr(-0.2, 0.2), 0.05, rr(-0.2, 0.2))),
          new THREE.Vector3(rr(-2, 2), rr(0.3, 1.5), rr(-2, 2)).multiplyScalar(k),
          '#f6d9a0',
          '#b98a45',
          0.18,
          0.7,
          rr(0.5, 0.9),
          { a: 0.45, drag: 2.5 }
        );
    },
    /** OP electricity: sparks, and short arcs off the point on big hits. */
    zap(p, pow) {
      for (let i = 0; i < pow / 4; i++)
        SPARK.spawn(p, rv(rr(2, 6)), '#ffffff', ['#bff4ff', '#fff27a', '#6fd6ff'][i % 3], rr(0.1, 0.18), 0.02, rr(0.2, 0.4), { drag: 3 });
      if (pow >= 85) for (let i = 0; i < 3; i++) bolt(p, p.clone().add(rv(rr(0.6, 1.2))), '#6fd6ff', 0.14, 0.2, 0.01);
    },
    /** Lightning from the roof onto a point (OP kills). */
    skyBolt(p, w = 1) {
      const f = new THREE.Vector3(p.x, Math.max(0.05, p.y), p.z);
      bolt(new THREE.Vector3(f.x + rr(-2, 2), 14, f.z + rr(-1.5, 1.5)), f, '#6fd6ff', 0.3, 1.2, 0.03 * w);
      ring(new THREE.Vector3(f.x, 0.03, f.z), '#bff4ff', 2, 0.5, true);
    },
    /** Crackling arcs between two nearby points (OP aura while airborne). */
    arc(a, b, col = '#6fd6ff') {
      bolt(a, b, col, 0.08, 0.1, 0.006);
    },
    /** Glow motes rising off a body point (aura). */
    mote(p, col, hot) {
      GLOW.spawn(
        p,
        new THREE.Vector3(rr(-0.2, 0.2), rr(0.6, 1.6), rr(-0.2, 0.2)),
        hot || '#ffffff',
        col,
        rr(0.14, 0.26),
        0.02,
        rr(0.35, 0.6),
        {
          drag: 1
        }
      );
    }
  };
}
