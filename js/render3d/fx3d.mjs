// 3D effects: GPU particles (glow / spark / smoke), lightning tubes, shockwave rings and bouncing rocks, with a
// style per team element (fire, flash, water, wind, earth, blast, shadow, star). Positions are world metres.
// Called from render/effects.js when the 3D view is on (see R3D.fx), and each frame by r3d.mjs.
import * as THREE from 'three';

function canvasTex(draw, n = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const radial = stops => (g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, c] of stops) r.addColorStop(o, c);
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
};
const TEX_GLOW = canvasTex(
  radial([
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,255,255,.75)'],
    [1, 'rgba(255,255,255,0)']
  ])
);
const TEX_SMOKE = canvasTex(
  radial([
    [0, 'rgba(255,255,255,.9)'],
    [0.6, 'rgba(255,255,255,.35)'],
    [1, 'rgba(255,255,255,0)']
  ])
);
const TEX_STAR = canvasTex((g, n) => {
  const c = n / 2;
  radial([
    [0, 'rgba(255,255,255,1)'],
    [0.18, 'rgba(255,255,255,0)']
  ])(g, n);
  g.fillStyle = '#fff';
  for (const [w, h] of [
    [3, c],
    [c, 3]
  ]) {
    g.beginPath();
    g.moveTo(c - w, c);
    g.lineTo(c, c - h);
    g.lineTo(c + w, c);
    g.lineTo(c, c + h);
    g.fill();
  }
});
/** A billowing smoke puff: soft blobs clustered round the centre (a fixed pattern — no game randoms). */
const TEX_PUFF = canvasTex((g, n) => {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2,
      d = r() * n * 0.2,
      x = n / 2 + Math.cos(a) * d,
      y = n / 2 + Math.sin(a) * d,
      rad = n * (0.12 + r() * 0.16),
      gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.35 + r() * 0.25})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, n, n);
  }
}, 128);
const PVS = `attribute float size; attribute float alpha; attribute float rot; attribute vec3 pcol; varying vec3 vC; varying float vA; varying float vR; uniform float scale;
void main(){ vC = pcol; vA = alpha; vR = rot; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PFS = `uniform sampler2D map; varying vec3 vC; varying float vA; varying float vR;
void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vR), k = cos(vR); c = mat2(k, -s, s, k) * c + 0.5;
  vec4 t = texture2D(map, c); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.004) discard; }`;
// streaks: a quad per spark stretched from where it was (pos − vel·len) to where it is, facing the camera; hot white core
const SVS = `attribute vec3 ipos; attribute vec3 ivel; attribute vec3 icol; attribute float ia; attribute float iw; attribute float il;
varying vec3 vC; varying float vA; varying vec2 vU;
void main(){
  vec4 h = modelViewMatrix * vec4(ipos, 1.0), t = modelViewMatrix * vec4(ipos - ivel * il, 1.0);
  vec3 d = h.xyz - t.xyz, s = cross(d, normalize(h.xyz));
  s = length(s) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(s);
  vec3 p = mix(t.xyz, h.xyz, position.y) + s * position.x * iw;
  vC = icol; vA = ia; vU = vec2(position.x * 2.0, position.y);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;
const SFS = `varying vec3 vC; varying float vA; varying vec2 vU;
void main(){ float x = 1.0 - abs(vU.x), a = x * pow(vU.y, 1.2) * vA; if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vC, vec3(1.0), pow(x, 4.0) * 0.6) * a, a); }`;

const R = (a, b) => a + Math.random() * (b - a);
const rv = s => new THREE.Vector3().randomDirection().multiplyScalar(s);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Size of a contact burst's rings (× the old size). */
const BURST_RING = 0.2;
const UP = new THREE.Vector3(0, 1, 0);

export function createFx(scene) {
  const pScale = { value: 800 };
  /** Pool of camera-facing particles: position, velocity, colour ramp, size ramp, life, gravity, drag, twinkle. */
  class Particles {
    constructor(tex, additive, max) {
      this.max = max;
      this.P = [];
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3);
      this.size = new Float32Array(max);
      this.alpha = new Float32Array(max);
      this.rot = new Float32Array(max);
      for (const [k, a, n] of [
        ['position', this.pos, 3],
        ['pcol', this.col, 3],
        ['size', this.size, 1],
        ['alpha', this.alpha, 1],
        ['rot', this.rot, 1]
      ])
        g.setAttribute(k, new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage));
      this.geo = g;
      const m = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, scale: pScale },
        vertexShader: PVS,
        fragmentShader: PFS,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.obj = new THREE.Points(g, m);
      this.obj.frustumCulled = false;
      this.obj.renderOrder = additive ? 3 : 2;
      scene.add(this.obj);
    }
    spawn(p, v, c1, c2, s0, s1, life, o = {}) {
      if (this.P.length >= this.max) return;
      this.P.push({
        p: p.clone(),
        v: v.clone(),
        c1: new THREE.Color(c1),
        c2: new THREE.Color(c2 ?? c1),
        s0,
        s1,
        life,
        age: 0,
        g: o.g ?? 0,
        drag: o.drag ?? 0,
        a: o.a ?? 1,
        tw: o.tw || 0,
        floor: o.floor,
        r: o.spin != null ? Math.random() * 6.28 : 0,
        spin: o.spin || 0
      });
    }
    update(dt) {
      const P = this.P,
        c = new THREE.Color();
      let w = 0;
      for (const q of P) {
        q.age += dt;
        if (q.age >= q.life) continue;
        q.v.y -= q.g * dt;
        q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.floor && q.p.y < 0.03) {
          q.p.y = 0.03;
          q.v.y *= -0.3;
        }
        const u = q.age / q.life;
        c.copy(q.c1).lerp(q.c2, u);
        this.pos[w * 3] = q.p.x;
        this.pos[w * 3 + 1] = q.p.y;
        this.pos[w * 3 + 2] = q.p.z;
        this.col[w * 3] = c.r;
        this.col[w * 3 + 1] = c.g;
        this.col[w * 3 + 2] = c.b;
        this.size[w] = (q.s0 + (q.s1 - q.s0) * u) * (q.tw ? 0.6 + 0.4 * Math.sin(q.age * q.tw) : 1);
        this.alpha[w] = q.a * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
        this.rot[w] = q.r += q.spin * dt;
        P[w++] = q;
      }
      P.length = w;
      this.geo.setDrawRange(0, w);
      for (const k of ['position', 'pcol', 'size', 'alpha', 'rot']) this.geo.attributes[k].needsUpdate = true;
    }
  }
  const GLOW = new Particles(TEX_GLOW, true, 3000),
    SPARK = new Particles(TEX_STAR, true, 1200),
    SMOKE = new Particles(TEX_SMOKE, false, 1500),
    PUFF = new Particles(TEX_PUFF, false, 400);

  /** Pool of velocity-stretched sparks (instanced quads): width `w` m, tail = `len` s of travel; gravity, drag, floor bounce. */
  class Streaks {
    constructor(max) {
      this.max = max;
      this.P = [];
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      this.A = {};
      for (const [k, n] of [
        ['ipos', 3],
        ['ivel', 3],
        ['icol', 3],
        ['ia', 1],
        ['iw', 1],
        ['il', 1]
      ])
        g.setAttribute(k, (this.A[k] = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage)));
      g.instanceCount = 0;
      this.geo = g;
      this.obj = new THREE.Mesh(
        g,
        new THREE.ShaderMaterial({
          vertexShader: SVS,
          fragmentShader: SFS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        })
      );
      this.obj.frustumCulled = false;
      this.obj.renderOrder = 3;
      scene.add(this.obj);
    }
    spawn(p, v, c1, c2, w, len, life, o = {}) {
      if (this.P.length >= this.max) return;
      this.P.push({
        p: p.clone(),
        v: v.clone(),
        c1: new THREE.Color(c1),
        c2: new THREE.Color(c2 ?? c1),
        w,
        len,
        life,
        age: 0,
        g: o.g ?? 0,
        drag: o.drag ?? 0,
        floor: o.floor
      });
    }
    update(dt) {
      const P = this.P,
        A = this.A,
        c = new THREE.Color();
      let w = 0;
      for (const q of P) {
        q.age += dt;
        if (q.age >= q.life) continue;
        q.v.y -= q.g * dt;
        q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.floor && q.p.y < 0.02 && q.v.y < 0) {
          q.p.y = 0.02;
          q.v.set(q.v.x * 0.6, -q.v.y * 0.35, q.v.z * 0.6);
        }
        const u = q.age / q.life;
        c.copy(q.c1).lerp(q.c2, Math.min(1, u * 1.6));
        A.ipos.array.set([q.p.x, q.p.y, q.p.z], w * 3);
        A.ivel.array.set([q.v.x, q.v.y, q.v.z], w * 3);
        A.icol.array.set([c.r, c.g, c.b], w * 3);
        A.ia.array[w] = u < 0.4 ? 1 : 1 - (u - 0.4) / 0.6;
        A.iw.array[w] = q.w;
        A.il.array[w] = q.len;
        P[w++] = q;
      }
      P.length = w;
      this.geo.instanceCount = w;
      for (const k in A) A[k].needsUpdate = true;
    }
  }
  const STREAK = new Streaks(1500);

  // rocks: tumbling chunks that bounce on the floor
  const ROCKS = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.07),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    240
  );
  ROCKS.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3);
  ROCKS.castShadow = true;
  ROCKS.count = 0;
  ROCKS.frustumCulled = false;
  scene.add(ROCKS);
  const rocks = [];
  const ROCK_COL = new THREE.Color('#8a7658');
  const spawnRock = (p, v, s = 1, col) =>
    rocks.length < 240 &&
    rocks.push({
      p: p.clone(),
      v: v.clone(),
      r: new THREE.Euler(R(0, 6), R(0, 6), 0),
      w: rv(12),
      s: s * R(0.6, 1.4),
      life: 1.6,
      age: 0,
      c: col ? new THREE.Color(col) : ROCK_COL
    });
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    S = new THREE.Vector3();
  function updateRocks(dt) {
    let w = 0;
    for (const k of rocks) {
      k.age += dt;
      if (k.age > k.life) continue;
      k.v.y -= 9.8 * dt;
      k.p.addScaledVector(k.v, dt);
      if (k.p.y < 0.05) {
        k.p.y = 0.05;
        k.v.y *= -0.35;
        k.v.x *= 0.7;
        k.v.z *= 0.7;
      }
      k.r.x += k.w.x * dt;
      k.r.y += k.w.y * dt;
      const f = k.age > k.life - 0.3 ? (k.life - k.age) / 0.3 : 1;
      M.compose(k.p, Q.setFromEuler(k.r), S.setScalar(k.s * f));
      ROCKS.setMatrixAt(w, M);
      ROCKS.setColorAt(w, k.c);
      rocks[w++] = k;
    }
    rocks.length = w;
    ROCKS.count = w;
    ROCKS.instanceMatrix.needsUpdate = true;
    ROCKS.instanceColor.needsUpdate = true;
  }

  // lightning: jagged tubes, a white core and a coloured glow
  class Poly extends THREE.Curve {
    constructor(pts) {
      super();
      this.pts = pts;
    }
    getPoint(t, o = new THREE.Vector3()) {
      const n = this.pts.length - 1,
        f = Math.min(n - 1e-6, t * n),
        i = Math.floor(f);
      return o.lerpVectors(this.pts[i], this.pts[i + 1], f - i);
    }
  }
  const bolts = [];
  function bolt(a, b, col, life = 0.12, amp = 0.25, r = 0.014) {
    const n = Math.max(4, Math.round(a.distanceTo(b) * 5)),
      pts = [a.clone()];
    for (let i = 1; i < n; i++) pts.push(new THREE.Vector3().lerpVectors(a, b, i / n).add(rv(amp * (Math.sin((i / n) * Math.PI) + 0.2))));
    pts.push(b.clone());
    const curve = new Poly(pts),
      seg = pts.length * 2;
    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, seg, r, 5),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, seg, r * 4.5, 6),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    core.renderOrder = glow.renderOrder = 4;
    scene.add(core, glow);
    bolts.push({ core, glow, life, age: 0 });
  }
  function updateBolts(dt) {
    let w = 0;
    for (const b of bolts) {
      b.age += dt;
      if (b.age > b.life) {
        for (const m of [b.core, b.glow]) {
          scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
        }
        continue;
      }
      const f = (1 - b.age / b.life) * (Math.random() < 0.3 ? 0.4 : 1);
      b.core.material.opacity = f;
      b.glow.material.opacity = 0.35 * f;
      bolts[w++] = b;
    }
    bolts.length = w;
  }

  // shockwave rings: billboard in the air or flat on the floor
  const rings = [],
    RING = new THREE.RingGeometry(0.82, 1, 64);
  let camera = null;
  /** `o.dir` (unit vector): the ring faces along it instead of the camera; `o.delay` s before it shows; `o.op` peak opacity. */
  function ring(p, col, size, life = 0.45, floor = false, o = {}) {
    const m = new THREE.Mesh(
      RING,
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    m.position.copy(p);
    if (floor) {
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.025;
    }
    if (o.dir) m.quaternion.setFromUnitVectors(Z_AXIS, o.dir);
    m.renderOrder = 5;
    m.visible = !o.delay;
    scene.add(m);
    rings.push({ m, size, life, age: -(o.delay || 0), floor, fixed: !!o.dir, op: o.op ?? 0.9 });
  }
  function updateRings(dt) {
    let w = 0;
    for (const r of rings) {
      r.age += dt;
      if (r.age > r.life) {
        scene.remove(r.m);
        r.m.material.dispose();
        continue;
      }
      if (r.age < 0) {
        rings[w++] = r; // still waiting to show
        continue;
      }
      r.m.visible = true;
      const u = r.age / r.life;
      r.m.scale.setScalar(0.05 + r.size * (1 - Math.pow(1 - u, 3)));
      r.m.material.opacity = (1 - u) * r.op;
      if (!r.floor && !r.fixed && camera) r.m.quaternion.copy(camera.quaternion);
      rings[w++] = r;
    }
    rings.length = w;
  }

  // floor glow: a flat additive disc that lights the floor under a blast, then fades
  const DISC = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    discs = [];
  function disc(p, col, size, life) {
    const m = new THREE.Mesh(
      DISC,
      new THREE.MeshBasicMaterial({ map: TEX_GLOW, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.set(p.x, 0.015, p.z);
    m.scale.setScalar(size);
    m.renderOrder = 1;
    scene.add(m);
    discs.push({ m, life, age: 0 });
  }
  function updateDiscs(dt) {
    let w = 0;
    for (const d of discs) {
      d.age += dt;
      if (d.age > d.life) {
        scene.remove(d.m);
        d.m.material.dispose();
        continue;
      }
      const u = d.age / d.life;
      d.m.material.opacity = 0.7 * (u < 0.08 ? u / 0.08 : Math.pow(1 - (u - 0.08) / 0.92, 1.6));
      discs[w++] = d;
    }
    discs.length = w;
  }

  const COL = el => (typeof ECOL !== 'undefined' && ECOL[el]) || '#ffffff';
  const HOT = {
    fire: '#ffd24a',
    flash: '#7fd8ff',
    water: '#d4f4ff',
    wind: '#6fe3ff',
    earth: '#6b5a44',
    blast: '#fff0a0',
    shadow: '#2a0f4a',
    star: '#ffffff'
  };

  // the air impact's pressure dome (spec §2.3a): a thin additive shell that balloons out from a heavy spike
  const DOME = new THREE.SphereGeometry(1, 24, 16),
    domes = [];
  function updateDomes(dt) {
    let w = 0;
    for (const d of domes) {
      d.age += dt;
      if (d.age > d.life) {
        scene.remove(d.m);
        d.m.material.dispose();
        continue;
      }
      const u = d.age / d.life;
      d.m.scale.setScalar(0.1 + d.size * (1 - Math.pow(1 - u, 2.5)));
      d.m.material.opacity = (1 - u) * 0.28;
      domes[w++] = d;
    }
    domes.length = w;
  }

  const fx = {
    /**
     * Ground blast (owner, 2026-10-06 — the Niagara look; tuned in the VFX lab): a hot core, sparks that streak out, arc down
     * and skip off the floor, embers drifting up, billowing smoke lit red from inside, dark debris, a floor glow and a ring.
     * `col` the blast's colour (an element's), `hot` its core. Scaled by power (100 = full).
     */
    blast(p, pow, col = '#ff5a1f', hot = '#fff1c4') {
      const k = Math.min(1.5, Math.max(0.4, pow / 100)),
        f = new THREE.Vector3(p.x, Math.max(0.05, p.y), p.z),
        up = (lo, hi, sp) => {
          const a = Math.random() * Math.PI * 2,
            y = R(lo, hi),
            r = Math.sqrt(1 - y * y);
          return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(sp);
        };
      disc(f, col, 3.6 * k, 1.1);
      ring(f, col, 2.4 * k, 0.4, true, { op: 0.3 });
      // the core: a white-hot flash, then deep red glows that linger inside the smoke
      for (let i = 0; i < 26 * k; i++)
        GLOW.spawn(f.clone().add(rv(0.2)), up(0.2, 1, R(0.5, 2.5)), hot, col, R(0.7, 1.3) * k, 0.2, R(0.18, 0.35), { drag: 4 });
      for (let i = 0; i < 22 * k; i++)
        GLOW.spawn(
          f.clone().add(up(0, 0.8, R(0.1, 0.7) * k)),
          up(0.3, 1, R(0.2, 0.8)),
          col,
          '#3a0806',
          R(0.4, 0.8) * k,
          R(0.6, 1),
          R(0.9, 1.6),
          { a: 0.55, drag: 2 }
        );
      // sparks: fast streaks in a fountain, falling and skipping off the floor
      for (let i = 0; i < 70 * k; i++)
        STREAK.spawn(f, up(0.15, 1, R(5, 13) * k), '#ffb347', i % 3 ? col : hot, R(0.05, 0.09), R(0.1, 0.18), R(0.7, 1.5), {
          g: 9.8,
          drag: 0.7,
          floor: true
        });
      // embers: small twinkling motes that float up and drift
      for (let i = 0; i < 120 * k; i++)
        SPARK.spawn(f.clone().add(rv(R(0, 0.6))), up(0.1, 1, R(0.5, 3.5) * k), hot, col, R(0.07, 0.14), 0.03, R(1, 2.4), {
          tw: R(15, 35),
          g: -0.6,
          drag: 1.4
        });
      // smoke: billowing puffs, grey with a warm underside, spreading low and climbing
      for (let i = 0; i < 34 * k; i++)
        PUFF.spawn(
          f.clone().add(up(0, 0.5, R(0, 0.6))),
          up(0.2, 1, R(0.8, 2.6) * k),
          '#c0aaa6',
          '#5c6070',
          R(0.8, 1.2),
          R(2.6, 3.8) * k,
          R(2, 3.2),
          { a: 1, drag: 1.6, spin: R(-0.8, 0.8), g: -0.5 }
        );
      // debris: dark chunks thrown out
      for (let i = 0; i < 12 * k; i++) spawnRock(f, up(0.3, 1, R(2.5, 6) * k), 0.45, '#2b2626');
    },
    /** Live particle counts (the VFX lab's readout). */
    stats() {
      return {
        glow: GLOW.P.length,
        spark: SPARK.P.length,
        smoke: SMOKE.P.length + PUFF.P.length,
        streak: STREAK.P.length,
        rocks: rocks.length,
        meshes: rings.length + bolts.length + domes.length + discs.length
      };
    },
    /**
     * Air impact (spec §2.3a, owner 2026-10-06 — the Kuroko look): a spike splits the air at the contact. Pressure rings stacked
     * along the shot (`dir`, unit vector), wind lines thrown out sideways in the ring plane, a jet of air down the line and, on a
     * heavy hit, a dome of pressure ballooning out. Scaled by power (hard 58 → ult 100+)
     * The rings run large → small away from the hand (a Doppler cone); `classic`: small → large (the first version).
     */
    airImpact(p, dir, pow, color, classic = false) {
      const k = Math.min(1.5, Math.max(0.35, (pow - 50) / 45)),
        n = pow >= 95 ? 4 : pow >= 80 ? 3 : 2;
      // the Doppler look (owner 2026-10-06): the biggest ring at the hand, smaller and closer together down the shot;
      // `classic` = the first version, small at the hand → large down the shot (kept in the VFX lab)
      for (let i = 0, at = 0.18; i < n; i++) {
        const q = p.clone().addScaledVector(dir, at),
          size = (0.7 + (classic ? i : n - 1 - i) * 0.55) * k;
        ring(q, i % 2 ? color : '#ffffff', size, 0.32 + i * 0.07, false, { dir, delay: i * 0.035, op: i ? 0.75 : 1 });
        at += 0.32 * k * (classic ? 1 : 1 - i * 0.18);
      }
      // wind lines: fast, thin sparks out from the contact, perpendicular to the shot
      const u = new THREE.Vector3()
          .crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
          .normalize(),
        v = new THREE.Vector3().crossVectors(dir, u).normalize();
      for (let i = 0; i < 26 * k; i++) {
        const a = Math.random() * Math.PI * 2,
          side = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
        SPARK.spawn(
          p,
          side.multiplyScalar(R(6, 11) * k).addScaledVector(dir, R(-1, 2)),
          '#ffffff',
          '#cfe8ff',
          R(0.08, 0.14),
          0.012,
          R(0.14, 0.24),
          { drag: 5 }
        );
      }
      // the jet of displaced air down the line of the shot
      for (let i = 0; i < 14 * k; i++)
        GLOW.spawn(
          p,
          dir
            .clone()
            .multiplyScalar(R(5, 10) * k)
            .add(rv(R(0.3, 1.2))),
          '#ffffff',
          color,
          R(0.12, 0.24),
          0.02,
          R(0.18, 0.3),
          { drag: 4 }
        );
      if (pow >= 95) {
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
        domes.push({ m, size: 1.6 * k, life: 0.3, age: 0 });
      }
    },
    /** Generic contact burst at a point (spike, serve, block): team-coloured ring and sparks. */
    burst(p, pow, color) {
      const k = Math.min(1.4, pow / 100);
      // the contact rings are small (owner, 2026-10-06: 0.2× — the spike's air impact carries the big shape)
      ring(p, color, (1.3 * k + 0.3) * BURST_RING, 0.4);
      if (pow > 80) ring(p, '#ffffff', 0.8 * k * BURST_RING, 0.25);
      for (let i = 0; i < 30 * k; i++) GLOW.spawn(p, rv(R(1.5, 4.5) * k), '#ffffff', color, R(0.15, 0.3), 0.03, R(0.25, 0.45), { drag: 4 });
      for (let i = 0; i < 12 * k; i++) SPARK.spawn(p, rv(R(3, 6) * k), '#ffffff', color, R(0.1, 0.18), 0.02, R(0.2, 0.3), { drag: 3 });
    },
    /** Element flourish at a contact point; `dir` (unit vector) sends a jet along the shot. */
    elemBurst(el, p, pow, dir) {
      const E = COL(el),
        H = HOT[el] || '#fff',
        k = Math.min(1.5, pow / 90);
      ring(p, E, 1.5 * k, 0.4);
      for (let i = 0; i < 40 * k; i++) GLOW.spawn(p, rv(R(1.5, 5) * k), H, E, R(0.2, 0.42), 0.03, R(0.25, 0.5), { drag: 4 });
      switch (el) {
        case 'flash':
          bolt(new THREE.Vector3(p.x + R(-1, 1), 13, p.z + R(-1, 1)), p, H, 0.22, 0.9, 0.03);
          for (let i = 0; i < 5; i++) bolt(p, p.clone().add(rv(R(0.8, 1.6) * k)), E, 0.15, 0.25, 0.012);
          break;
        case 'fire':
          for (let i = 0; i < 40 * k; i++)
            GLOW.spawn(p, rv(R(1, 3)).add(new THREE.Vector3(0, 2, 0)), '#fff4c0', E, R(0.4, 0.8), 0.05, R(0.3, 0.6), { drag: 3 });
          break;
        case 'blast':
          for (let i = 0; i < 16; i++)
            SMOKE.spawn(p.clone().add(rv(0.2)), rv(R(0.5, 2)), '#5a4436', '#1a1412', R(0.5, 0.9), 1.8, R(0.8, 1.2), { a: 0.55, drag: 2.5 });
          ring(p, '#fff0a0', 2.6 * k, 0.5);
          break;
        case 'earth':
          for (let i = 0; i < 16 * k; i++) spawnRock(p, rv(R(2, 4)).add(new THREE.Vector3(0, 2, 0)), 1.2);
          break;
        case 'water':
          for (let i = 0; i < 50 * k; i++) {
            const a = (i / 50) * Math.PI * 2;
            GLOW.spawn(p, new THREE.Vector3(Math.cos(a) * 3, R(1, 3), Math.sin(a) * 3), '#ffffff', E, 0.16, 0.08, 0.8, {
              g: 7,
              floor: true
            });
          }
          break;
        case 'wind':
          for (let i = 0; i < 3; i++) ring(p, '#ffffff', (1.8 + i * 0.9) * k, 0.45 + i * 0.12);
          break;
        case 'shadow':
          for (let i = 0; i < 30 * k; i++) {
            const o = rv(R(0.8, 1.5));
            SMOKE.spawn(p.clone().add(o), o.clone().multiplyScalar(-2.2), '#1a0830', '#000000', 0.6, 0.2, 0.45, { a: 0.7 });
          }
          break;
        case 'star':
          for (let i = 0; i < 30 * k; i++) SPARK.spawn(p, rv(R(1, 3)), '#ffffff', E, R(0.25, 0.45), 0.05, R(0.6, 1.1), { tw: 25, drag: 2 });
          break;
      }
      if (dir)
        for (let i = 0; i < 20 * k; i++) GLOW.spawn(p, dir.clone().multiplyScalar(R(3, 7)).add(rv(1.2)), '#ffffff', E, 0.2, 0.02, 0.25);
    },
    /** Ball hits the floor: flat shockwave and a dust spray. */
    impact(p, pow) {
      const k = Math.min(1.4, pow / 100),
        f = new THREE.Vector3(p.x, 0.02, p.z);
      ring(f, '#ffffff', 1.4 * k + 0.3, 0.5, true);
      for (let i = 0; i < 26 * k; i++)
        SMOKE.spawn(
          f.clone().add(new THREE.Vector3(R(-0.2, 0.2), 0.05, R(-0.2, 0.2))),
          new THREE.Vector3(R(-2, 2), R(0.3, 1.5), R(-2, 2)).multiplyScalar(k),
          '#f6d9a0',
          '#b98a45',
          0.18,
          0.7,
          R(0.5, 0.9),
          { a: 0.45, drag: 2.5 }
        );
    },
    /** Element hit on the floor: flame pillar, splash, rock burst, gusts, explosion, dark implosion, sparkles, bolt. */
    elemImpact(el, p, pow) {
      const E = COL(el),
        H = HOT[el] || '#fff',
        k = Math.min(1.5, pow / 90),
        f = new THREE.Vector3(p.x, 0.05, p.z);
      ring(f, E, 1.6 * k, 0.55, true);
      switch (el) {
        case 'fire':
          for (let i = 0; i < 50 * k; i++)
            GLOW.spawn(
              f.clone().add(new THREE.Vector3(R(-0.4, 0.4), 0, R(-0.4, 0.4))),
              new THREE.Vector3(R(-0.4, 0.4), R(2, 5), R(-0.4, 0.4)),
              '#fff4c0',
              E,
              R(0.35, 0.7),
              0.05,
              R(0.4, 0.8),
              { drag: 1.5 }
            );
          break;
        case 'water':
          for (let r = 0; r < 3; r++) ring(f, '#8fdcff', (1.2 + r * 0.6) * k, 0.5 + r * 0.12, true);
          for (let i = 0; i < 50 * k; i++)
            GLOW.spawn(f, new THREE.Vector3(R(-2, 2), R(2, 4.5), R(-2, 2)), '#ffffff', E, R(0.1, 0.18), 0.06, 1, { g: 9, floor: true });
          break;
        case 'earth':
          for (let i = 0; i < 22 * k; i++) spawnRock(f, new THREE.Vector3(R(-2.5, 2.5), R(2, 5), R(-2.5, 2.5)), 1.3);
          for (let i = 0; i < 16; i++)
            SMOKE.spawn(f, new THREE.Vector3(R(-1.5, 1.5), R(0.3, 1), R(-1.5, 1.5)), '#c9b08a', '#6b5a44', 0.3, 1, 1, { a: 0.5, drag: 2 });
          break;
        case 'wind':
          for (let i = 0; i < 3; i++) ring(f, '#ffffff', (1.4 + i * 0.8) * k, 0.4 + i * 0.12, true);
          for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            GLOW.spawn(f, new THREE.Vector3(Math.cos(a) * 4, R(0.2, 1), Math.sin(a) * 4), '#ffffff', H, 0.12, 0.04, 0.4, { a: 0.8 });
          }
          break;
        case 'blast':
          for (let i = 0; i < 40 * k; i++) GLOW.spawn(f, rv(R(2, 5)).setY(R(1, 4)), H, E, R(0.3, 0.6), 0.05, R(0.3, 0.55), { drag: 3 });
          for (let i = 0; i < 18; i++)
            SMOKE.spawn(f.clone().add(rv(0.3)), rv(R(0.5, 2)).setY(R(0.5, 2)), '#5a4436', '#1a1412', R(0.5, 0.9), 1.9, R(0.9, 1.3), {
              a: 0.55,
              drag: 2.5
            });
          break;
        case 'shadow':
          for (let i = 0; i < 30 * k; i++)
            SMOKE.spawn(
              f.clone().add(new THREE.Vector3(R(-1, 1), 0, R(-1, 1))),
              new THREE.Vector3(0, R(0.5, 1.5), 0),
              '#2a0f4a',
              '#000000',
              0.5,
              1.2,
              R(0.8, 1.2),
              { a: 0.7 }
            );
          break;
        case 'star':
          for (let i = 0; i < 30 * k; i++)
            SPARK.spawn(f, new THREE.Vector3(R(-1.5, 1.5), R(1, 3), R(-1.5, 1.5)), '#ffffff', E, R(0.2, 0.4), 0.05, R(0.7, 1.2), {
              tw: 25,
              g: 2
            });
          break;
        case 'flash':
          bolt(new THREE.Vector3(f.x + R(-1, 1), 13, f.z + R(-1, 1)), f, H, 0.25, 1, 0.035);
          for (let i = 0; i < 20 * k; i++)
            SPARK.spawn(f, new THREE.Vector3(R(-3, 3), R(1, 4), R(-3, 3)), '#ffffff', E, 0.15, 0.02, 0.35, { drag: 3, g: 5 });
          break;
      }
    },
    /** Per-frame trail behind a powered ball, in the element's style. `k` 0..1 strength. */
    trail(el, p, dir, pow, dt) {
      const E = COL(el),
        H = HOT[el] || '#fff',
        k = Math.min(1.8, 0.4 + pow / 110), // up to 1.8×: more and thicker particles on a harder hit
        back = dir.clone().multiplyScalar(-1),
        n = Math.max(1, Math.round(60 * dt)),
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
                  .multiplyScalar(R(1, 3))
                  .add(rv(0.6))
                  .add(new THREE.Vector3(0, R(0.5, 1.5), 0)),
                H,
                E,
                R(0.35, 0.6),
                0.05,
                R(0.25, 0.45),
                { drag: 2 }
              );
            if (Math.random() < 0.4 * k)
              SMOKE.spawn(p, back.clone().add(new THREE.Vector3(0, 1, 0)), '#3a2a22', '#15101a', 0.3, 0.9, 0.8, { a: 0.3, drag: 1 });
            break;
          case 'flash':
            for (let i = 0; i < 3 * k; i++) SPARK.spawn(p, rv(R(2, 5)), '#ffffff', E, R(0.12, 0.22), 0.02, R(0.12, 0.25), { drag: 4 });
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
                  .multiplyScalar(R(1, 3))
                  .add(rv(1.5))
                  .add(new THREE.Vector3(0, 1, 0)),
                0.8
              );
            SMOKE.spawn(p.clone().add(rv(0.05)), back.clone().add(rv(0.4)), '#b39a74', '#6b5a44', 0.25, 0.8, 0.6, { a: 0.4, drag: 2 });
            break;
          case 'blast':
            if (Math.floor(tt) % 5 === 0) {
              for (let i = 0; i < 7 * k; i++) GLOW.spawn(p, rv(R(1, 2.5)), H, E, R(0.25, 0.45), 0.05, R(0.2, 0.35), { drag: 5 });
              SMOKE.spawn(p, rv(0.4), '#4a3a30', '#221a18', 0.4, 1.0, 0.7, { a: 0.4, drag: 2 });
            }
            break;
          case 'shadow':
            SMOKE.spawn(
              p.clone().add(rv(0.08)),
              back.clone().multiplyScalar(R(0.5, 1.5)).add(rv(0.3)),
              '#2a0f4a',
              '#08040f',
              R(0.35, 0.55),
              1.0,
              R(0.5, 0.8),
              { a: 0.65, drag: 1.5 }
            );
            if (Math.random() < 0.5) GLOW.spawn(p.clone().add(rv(0.15)), rv(0.3), E, '#3a1a6a', 0.18, 0.05, 0.4);
            break;
          case 'star':
            if (Math.random() < 0.8)
              SPARK.spawn(
                p.clone().add(rv(R(0.05, 0.3))),
                back.clone().multiplyScalar(0.2).add(rv(0.2)),
                '#ffffff',
                E,
                R(0.15, 0.3),
                0.05,
                R(0.5, 0.9),
                { tw: 30 }
              );
            break;
        }
      }
      if (el === 'flash' && Math.random() < 0.5 * k)
        bolt(p, p.clone().addScaledVector(back, R(0.8, 1.6)).add(rv(0.3)), H, 0.07, 0.18, 0.01);
    },
    /** OP electricity: sparks, and short arcs off the point on big hits. */
    zap(p, pow) {
      for (let i = 0; i < pow / 4; i++)
        SPARK.spawn(p, rv(R(2, 6)), '#ffffff', ['#bff4ff', '#fff27a', '#6fd6ff'][i % 3], R(0.1, 0.18), 0.02, R(0.2, 0.4), { drag: 3 });
      if (pow >= 85) for (let i = 0; i < 3; i++) bolt(p, p.clone().add(rv(R(0.6, 1.2))), '#6fd6ff', 0.14, 0.2, 0.01);
    },
    /** Lightning from the roof onto a point (OP kills). */
    skyBolt(p, w = 1) {
      const f = new THREE.Vector3(p.x, Math.max(0.05, p.y), p.z);
      bolt(new THREE.Vector3(f.x + R(-2, 2), 14, f.z + R(-1.5, 1.5)), f, '#6fd6ff', 0.3, 1.2, 0.03 * w);
      ring(new THREE.Vector3(f.x, 0.03, f.z), '#bff4ff', 2, 0.5, true);
    },
    /** Crackling arcs between two nearby points (OP aura while airborne). */
    arc(a, b, col = '#6fd6ff') {
      bolt(a, b, col, 0.08, 0.1, 0.006);
    },
    /** Glow motes rising off a body point (aura). */
    mote(p, col, hot) {
      GLOW.spawn(p, new THREE.Vector3(R(-0.2, 0.2), R(0.6, 1.6), R(-0.2, 0.2)), hot || '#ffffff', col, R(0.14, 0.26), 0.02, R(0.35, 0.6), {
        drag: 1
      });
    },
    update(dt, cam, heightPx, fov) {
      camera = cam;
      pScale.value = heightPx / (2 * Math.tan(((fov || cam.fov) * Math.PI) / 360));
      GLOW.update(dt);
      SPARK.update(dt);
      SMOKE.update(dt);
      PUFF.update(dt);
      STREAK.update(dt);
      updateRocks(dt);
      updateDiscs(dt);
      updateBolts(dt);
      updateRings(dt);
      updateDomes(dt);
    }
  };
  return fx;
}
