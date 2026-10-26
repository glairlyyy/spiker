// The 3D map's overlay layers (map3d.mjs): the night lights (nightLayer: windows, street lamps, floodlights) and the war's
// borders (warLayer: unit borders, the hot stretch, banners). Display only, no randoms.
import * as THREE from 'three';
import { KIT, FOOTPRINT, unit, facade, lampSpots, STREET, mesher, detailMats, lampPost, floodTower, NIGHT_U, rgb } from './kit3d.mjs';
import { MAP_M, clamp, fogFactor, ribbon, bannerArrays, smooth } from './geo3d.mjs';
import { STREET_U } from './look3d.mjs';

/**
 * The night lights (spec §4.37 2, T-332): warm windows on the town's lots, street lamps along the main roads and streets,
 * floodlights over the explored courts and the venues (model.floods) — one Points mesh of round glows (size per point in
 * metres, kept 2.5–40 px on screen) and one InstancedMesh of light pools on the ground (vertex-coloured discs, additive). Both
 * fade with `lit` and are not drawn by day. Dimmed in the fog like the town. Rebuilt when the lots, roads, courts, fog or the
 * setting change. The detailed look (spec §4.39, T-342): the windows are kit3d `facade`'s lit panes (the same panes town3d draws
 * and lights through NIGHT_U), shop fronts and signs; the lamps get posts with an arm and the courts floodlight towers (one
 * merged mesh, drawn day and night). Low (the Fast setting): today's windows (a third of them, KIT heights as town3d.mjs's
 * instances), no lamp pools, no posts. 2 draw calls at night + 1 (posts) day and night.
 */
const NIGHT = {
  win: { every: 2.8, col: 2.4, lit: 0.42, size: 1.3, cap: 6000, colors: ['#ffd38a', '#ffe7b0', '#ffc070', '#d8e4ff'] },
  dark: ['tank', 'stack', 'shed', 'barn', 'container', 'warehouse', 'plant', 'depot'],
  lamp: { ...STREET, size: 1.8, pool: 3.5, color: '#ffd9a0', poolColor: '#ff9f45', post: '#3d4248' }, // (kinds, every, up, side, cap: kit3d STREET)
  flood: { up: 11, dx: 14, dz: 9, size: 3.2, pool: 22, color: '#f2f6ff', tower: '#7a7e84' },
  sign: 0.9, // a sign's glow (m)
  shop: 1.4, // a shop front's glows: one every this many metres
  // street level (T-373, Auto / High): the lamp heads ×`lamp` (they bloom), smaller (`size`); the window points give way to the
  // lit panes themselves (× 1 − `win`); the pools a painted decal (a bright core, a soft edge) that fades in at dusk (`on` lit)
  street: { lamp: 2.6, size: 0.45, win: 0.75, on: [0.04, 0.4], pool: 1.6 }
};
/** The pool decal (T-373): a painted light pool — a bright core with a soft toon step, a faint tail to the rim (made in code). */
export function poolBytes(n = 64) {
  const B = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2,
        v = r >= 1 ? 0 : 0.5 * (1 - smooth(0.32, 0.46, r)) + 0.5 * (1 - r) ** 2 * (1 - smooth(0.9, 1, r));
      B.set([v * 255, v * 255, v * 255, 255], (y * n + x) * 4);
    }
  return B;
}
export function nightLayer(scene, heightAt) {
  const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { lit: { value: 0 }, scale: { value: 1000 }, pr: { value: 1 }, uSt: STREET_U.st },
      vertexShader: `attribute float size; attribute vec3 glow; attribute float lamp; varying vec3 vC; uniform float scale; uniform float pr;
        uniform float uSt;
        void main() { vC = glow * mix(1.0 - ${NIGHT.street.win.toFixed(2)} * uSt, 1.0 + ${(NIGHT.street.lamp - 1).toFixed(2)} * uSt, lamp);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float s = size * mix(1.0, mix(1.0, ${NIGHT.street.size.toFixed(2)}, lamp), uSt);
          gl_PointSize = clamp(s * scale / -mv.z, 2.5 * pr, 40.0 * pr); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; uniform float lit;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vC * lit * (1.0 - r * r), 1.0); }`
    }),
    disc = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), // (T-373: a decal quad, the painted pool its texture)
    poolTex = new THREE.DataTexture(poolBytes(), 64, 64, THREE.RGBAFormat);
  poolTex.magFilter = THREE.LinearFilter;
  poolTex.minFilter = THREE.LinearMipmapLinearFilter;
  poolTex.generateMipmaps = true;
  poolTex.needsUpdate = true;
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  let pts = null,
    pools = null,
    posts = null, // lamp posts and floodlight towers (the detailed look)
    key = null,
    n = { win: 0, lamp: 0, flood: 0, post: 0 };
  const clear = () => {
    for (const o of [pts, pools]) if (o) (scene.remove(o), o.geometry !== disc && o.geometry.dispose(), o.dispose && o.dispose());
    if (posts) (scene.remove(posts), posts.geometry.dispose()); // (its material is kit3d's, shared)
    pts = pools = posts = null;
  };
  const build = (m, low) => {
    clear();
    const pos = [],
      glow = [],
      size = [],
      lampA = [], // 1 = a lamp head / floodlight (it blooms at street level), 0 = a window / sign
      isLamp = { v: 0 },
      pool = [], // [x, y, z, r, color]
      c = new THREE.Color(),
      fog = fogFactor(m.fog),
      add = (x, y, z, s, color, dim = 1) => {
        c.set(color).multiplyScalar(dim);
        pos.push(x, y, z);
        glow.push(c.r, c.g, c.b);
        size.push(s);
        lampA.push(isLamp.v);
      };
    n = { win: 0, lamp: 0, flood: 0, post: 0 };
    const W = NIGHT.win,
      cap = low ? W.cap / 3 : W.cap,
      PW = low ? null : mesher({ wmask: 3 }); // the posts and towers
    // the detailed look: the lit panes of every facade face toward the camera (kit3d facade — the panes town3d draws)
    if (!low)
      (m.land.lots || []).forEach((l, i) => {
        const F = n.win < cap && facade(l, i);
        if (!F) return;
        const { x: x0, z: z0, cs, sn } = F.fr,
          y0 = heightAt(x0, z0),
          dim = 0.4 + 0.6 * fog(x0, z0);
        for (const fc of F.faces) {
          if (fc.wz < 0.2) continue; // facing away from the camera
          for (const o of fc.wins) {
            if (!o.lit || n.win >= cap) continue;
            const hf = (o.half !== undefined ? o.half : fc.half) + 0.12,
              at = u => {
                const lx = fc.nx * hf + fc.nz * u,
                  lz = fc.nz * hf - fc.nx * u;
                return [x0 + lx * cs + lz * sn, z0 - lx * sn + lz * cs];
              },
              k = o.kind === 'shop' ? Math.max(1, Math.round(o.w / NIGHT.shop)) : 1;
            for (let q = 0; q < k; q++) {
              const [px, pz] = at(o.u + (-0.5 + (q + 0.5) / k) * (k > 1 ? o.w : 0));
              add(px, y0 + o.y, pz, o.kind === 'sign' ? NIGHT.sign : W.size, o.glow, dim);
              n.win++;
            }
          }
        }
      });
    // windows (Fast): the faces whose outward side looks toward the camera (+z), floors every W.every m, a few lit per floor
    (low ? m.land.lots || [] : []).forEach((l, i) => {
      const k = KIT[l.kind];
      if (!k || n.win >= cap || (low && unit(i * 7 + 3) > 0.34)) return;
      const x0 = l.at[0] * MAP_M,
        z0 = l.at[1] * MAP_M,
        f = l.size * MAP_M * FOOTPRINT, // (a lot's side, as town3d.mjs's)
        h = k.scale[1] * (0.85 + 0.3 * unit(i * 3 + 1)) * (1 + 1.2 * (l.h || 0) * k.rise),
        dim = 0.4 + 0.6 * fog(x0, z0), // (lit windows still show in the dark you haven't explored, fainter)
        y0 = heightAt(x0, z0),
        th = -l.rot,
        cs = Math.cos(th),
        sn = Math.sin(th),
        pLit = NIGHT.dark.includes(l.kind) ? 0.08 : W.lit;
      for (const [nx, nz, half, wide] of [
        [1, 0, (f * k.scale[0]) / 2, f * k.scale[2]],
        [-1, 0, (f * k.scale[0]) / 2, f * k.scale[2]],
        [0, 1, (f * k.scale[2]) / 2, f * k.scale[0]],
        [0, -1, (f * k.scale[2]) / 2, f * k.scale[0]]
      ]) {
        const wx = nx * cs + nz * sn,
          wz = -nx * sn + nz * cs;
        if (wz < 0.2) continue; // facing away from the camera
        const tx = -wz, // along the face
          tz = wx,
          cols = clamp(Math.floor(wide / W.col), 1, 4);
        for (let fl = 1.6, j = 0; fl < h - 0.6; fl += W.every, j++)
          for (let q = 0; q < cols; q++) {
            const hh = unit(i * 131 + j * 17 + q * 5 + (nx + 2) * 3 + nz);
            if (hh > pLit) continue;
            const o = (q + 0.5) / cols - 0.5;
            add(
              x0 + wx * (half + 0.12) + tx * o * wide * 0.8,
              y0 + fl,
              z0 + wz * (half + 0.12) + tz * o * wide * 0.8,
              W.size,
              W.colors[Math.floor(hh * 97) % W.colors.length],
              dim
            );
            n.win++;
          }
      }
    });
    // street lamps along the main roads and streets (alternating sides: kit3d lampSpots), with a pool of light under each;
    // the detailed look stands a post beside each, its arm out to the lamp head
    const L = NIGHT.lamp,
      postC = rgb(L.post);
    for (const p of lampSpots(m.land.roads)) {
      const { x, z } = p,
        y = heightAt(x, z),
        f = fog(x, z),
        dim = 0.4 + 0.6 * f;
      isLamp.v = 1;
      add(x, y + L.up, z, L.size, L.color, dim);
      isLamp.v = 0;
      if (!low) {
        pool.push([x, y + 0.25, z, L.pool, dim * 0.35, L.poolColor]);
        const ox = -p.uz * p.s, // away from the road
          oz = p.ux * p.s;
        lampPost(
          PW,
          x,
          heightAt(x + ox * 0.9, z + oz * 0.9),
          y + L.up,
          z,
          ox,
          oz,
          postC.map(v => v * f)
        );
        n.post++;
      }
      n.lamp++;
    }
    // floodlights: four towers round each court, a pool over the court
    const F = NIGHT.flood,
      towC = rgb(F.tower);
    for (const at of m.floods || []) {
      const x = at[0] * MAP_M,
        z = at[1] * MAP_M,
        y = heightAt(x, z),
        f = fog(x, z),
        dim = 0.4 + 0.6 * f;
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]) {
        const tx = x + sx * F.dx,
          tz = z + sz * F.dz;
        isLamp.v = 1;
        add(tx, y + F.up, tz, F.size, F.color, dim);
        isLamp.v = 0;
        if (!low)
          (floodTower(
            PW,
            tx,
            heightAt(tx, tz),
            y + F.up,
            tz,
            x,
            z,
            towC.map(v => v * f)
          ),
            n.post++);
      }
      pool.push([x, y + 0.35, z, F.pool, dim * 0.35, F.color]);
      n.flood++;
    }
    const pg = PW && PW.geometry();
    if (pg) {
      posts = new THREE.Mesh(pg, detailMats().wall);
      posts.castShadow = posts.receiveShadow = true;
      posts.frustumCulled = false;
      scene.add(posts);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 3));
      g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
      g.setAttribute('lamp', new THREE.Float32BufferAttribute(lampA, 1));
      pts = new THREE.Points(g, glowMat);
      pts.frustumCulled = false;
      pts.renderOrder = 2;
      scene.add(pts);
    }
    if (pool.length) {
      pools = new THREE.InstancedMesh(disc, poolMat, pool.length);
      const D = new THREE.Object3D();
      pool.forEach(([x, y, z, r, k, color], i) => {
        D.position.set(x, y, z);
        D.scale.set(r, 1, r);
        D.updateMatrix();
        pools.setMatrixAt(i, D.matrix);
        pools.setColorAt(i, c.set(color).multiplyScalar(k));
      });
      pools.frustumCulled = false;
      pools.renderOrder = 1;
      scene.add(pools);
    }
  };
  return {
    sync(m, low) {
      const k = [m.land.lots, (m.land.roads || []).length];
      const fk = JSON.stringify([m.fog, m.floods, !!low]);
      if (key && key[0] === k[0] && key[1] === k[1] && key[2] === fk) return;
      key = [k[0], k[1], fk];
      build(m, low);
    },
    /** Per frame: fade with lit (0: not drawn); scale = the canvas's px per metre at depth 1. */
    set(lit, scale, pr) {
      const on = lit > 0.01;
      glowMat.uniforms.lit.value = lit;
      glowMat.uniforms.scale.value = scale;
      glowMat.uniforms.pr.value = pr;
      NIGHT_U.value = lit; // the lit panes (kit3d glass)
      const S = NIGHT.street,
        st = STREET_U.st.value;
      poolMat.opacity = Math.min(1, smooth(S.on[0], S.on[1], lit) * (1 + (S.pool - 1) * st) * 0.62); // (T-373: on at dusk; brighter at street level)
      if (pts) pts.visible = on;
      if (pools) pools.visible = on;
    },
    count: () => ({ ...n }),
    dispose() {
      clear();
      disc.dispose();
      poolTex.dispose();
      glowMat.dispose();
      poolMat.dispose();
    }
  };
}
/**
 * The war on the map (spec §4.34, T-317; model.borders): each standing unit's land border (runs) as draped ribbons in its colour (one
 * mesh, vertex colours), this week's hot stretch as a brighter wider ribbon that pulses (one mesh: only its opacity changes
 * per frame) and the banners along it (one mesh, geo3d bannerArrays). Rebuilt only when the borders' JSON changes.
 */
export function warLayer(scene, heightAt) {
  const g = new THREE.Group(),
    h = (x, y) => heightAt(x * MAP_M, y * MAP_M);
  scene.add(g);
  let key = null,
    hot = null;
  const mat = (opacity, vc = true) =>
    new THREE.MeshBasicMaterial({
      vertexColors: vc,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
  /** Ribbon triangles along pts (map units), half-width `half`, lifted `up` m, coloured c → pushed onto pos / col. */
  const strip = (pts, half, closed, up, c, pos, col, shift = 0) => {
    const R = ribbon(pts, half, closed, shift),
      n = closed ? R.length : R.length - 1,
      V = ([x, y]) => [x * MAP_M, h(x, y) + up, y * MAP_M];
    for (let i = 0; i < n; i++) {
      const a = R[i],
        b = R[(i + 1) % R.length],
        q = [V([a[0], a[1]]), V([a[2], a[3]]), V([b[0], b[1]]), V([b[2], b[3]])];
      pos.push(...q[0], ...q[1], ...q[2], ...q[2], ...q[1], ...q[3]);
      for (let k = 0; k < 6; k++) col.push(...c);
    }
  };
  const mesh = (pos, col, m) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Mesh(geo, m);
  };
  const clear = () => {
    for (const o of [...g.children]) {
      g.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    hot = null;
  };
  return {
    sync(B) {
      const k = JSON.stringify(B || null);
      if (k === key) return;
      key = k;
      clear();
      if (!B) return;
      const pos = [],
        col = [];
      // each unit's line just inside its own land (shift 3 left of the run = inward), so two neighbours' colours sit side by side on one line
      for (const L of B.lines) for (const R of L.runs) if (R.pts.length > 1) strip(R.pts, 2.4, R.closed, 0.7, rgb(L.color), pos, col, 3);
      if (pos.length) g.add(mesh(pos, col, mat(0.85)));
      if (B.hot && B.hot.lines.length) {
        const hp = [],
          hc = [],
          c = rgb('#ffb347').map((v, i) => (3 * v + rgb(B.hot.colors[0])[i]) / 4); // a hot glow, tinted by the raider
        for (const L of B.hot.lines) if (L.length > 1) strip(L, 16, false, 1, c, hp, hc);
        if (hp.length) g.add((hot = mesh(hp, hc, mat(0.5))));
      }
      if (B.banners && B.banners.length) {
        const A = bannerArrays(B.banners, h, rgb),
          bm = mesh(A.pos, A.col, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        g.add(bm);
      }
    },
    /** Street level hides the borders (draped ribbons and banners read as walls at eye level). */
    show(v) {
      g.visible = v;
    },
    /** The hot stretch glows and pulses. */
    pulse(t) {
      if (hot) hot.material.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3));
    },
    dispose() {
      clear();
      scene.remove(g);
    }
  };
}
