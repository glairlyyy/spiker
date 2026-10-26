// Street life at street level (spec §4.44, T-372): the clutter of a Bangkok street — utility poles along the main roads (and some
// streets) with sagging overhead wires (power on the cross-arm, a droop of phone / cable lines below, now and then one across the
// road to a building), and on the pavements benches, bins, vending machines (lit), parked scooters, standing light-box signs (lit),
// bollards, potted plants and hydrants, chosen by what fronts the pavement (shops / homes / nothing); ground decals on roads and
// pavements (cracks, tar patches, puddles, fallen leaves) from one code-made atlas. Placed by hash per pavement slot (no randoms),
// kept off the carriageway, doors / shop entrances, lots and landmarks (town3d `solid`), and away from the lamps and the map look's
// benches. Prepared per stream block (stream3d layer `props`), drawn as one InstancedMesh per kind (the instances of the shown
// blocks within the kind's reach of you, re-picked every PROPS.step m). Lit faces glow by NIGHT_U on the T-373 emissive path
// (look3d streetMat lifts and blooms them); wires sway a little (STREET_U.st). Auto / High only: Fast draws none (the ring's
// old pavement props stay there). Display only.
//   createProps(scene, heightAt, { solid }) → { sync(model), layer(G), tick(dt, t, you, st, low, reach = 1), info(), dispose() }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M } from './geo3d.mjs';
import { NIGHT_U, STREET as LAMP, facade, lotFrame, FACES } from './kit3d.mjs';
import { STREET_U } from './look3d.mjs';
import { ROAD, RING, LIFT } from './town3d.mjs';

/**
 * The tunables (m). slot: pavement slots along each side; pole: spacing, cross-arm height, the share of streets that get them,
 * offset from the kerb; step: you move this far before the drawn set is picked again; decal: spacing along a road and the share
 * that gets one. Per kind (K below): reach r (m from you) and cap (instances drawn).
 */
export const PROPS = {
  slot: 3.2,
  pole: { every: 26, street: 0.45, kerb: 0.32, min: 14 },
  step: 6,
  decal: { every: 4.2, p: 0.34 },
  cross: 0.3, // share of poles with a wire across the road (to a building there)
  bench: [22, 1.6, 2.8] // the map look's benches on the main roads: every 22 m (town3d PROPS), keep clear from −1.6 to +2.8 m
};

/** A 0–1 hash of three integers (display only). */
const hh = (a, b, c) => {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul((c | 0) + 1, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- shapes (local: feet at y 0, +z = the face toward the road; vertex colour, `glow` 0–1 lit, `ptint` 0–1 instance tint) ----------
const P = (geo, color, glow = 0, tint = 0) => {
  const g = geo.index ? geo.toNonIndexed() : geo,
    c = new THREE.Color(color),
    n = g.attributes.position.count,
    col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  g.setAttribute('ptint', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1));
  return g;
};
const B = (w, h, d, x, y, z, color, glow, tint) => P(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color, glow, tint);
const C = (r0, r1, h, x, y, z, color, seg = 8, glow, tint) =>
  P(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z), color, glow, tint);
const merge = parts => {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
};
/** The pole's wire attach points (local: y up, z across the road): the cross-arm's three, the droop below. */
const ATTACH = [
  [8.5, -0.62, 0.016, 0.3],
  [8.5, 0, 0.016, 0.34],
  [8.5, 0.62, 0.016, 0.3],
  [6.35, -0.28, 0.022, 0.75],
  [6.3, 0.05, 0.03, 0.95],
  [6.2, 0.3, 0.02, 0.85]
]; // [y, z, thickness (half, m), sag per 25 m]
const SHAPE = {
  pole: () =>
    merge([
      P(new THREE.CylinderGeometry(0.1, 0.16, 9.6, 4).rotateY(Math.PI / 4).translate(0, 4.2, 0), '#bdb8ae'),
      C(0.17, 0.17, 0.5, 0, 0, 0, '#e8c23a', 4), // the traffic band, yellow / black
      C(0.171, 0.171, 0.3, 0, 0.5, 0, '#26272b', 4),
      C(0.172, 0.172, 0.4, 0, 0.8, 0, '#e8c23a', 4),
      B(0.12, 0.12, 1.55, 0, 8.3, 0, '#8b8e93'), // the cross-arm
      ...[-0.62, 0, 0.62].map(z => B(0.07, 0.16, 0.07, 0, 8.42, z, '#e6e2d6')),
      B(0.09, 0.09, 0.8, 0, 6.18, 0, '#6f7277'),
      P(new THREE.TorusGeometry(0.34, 0.035, 4, 10).rotateX(Math.PI / 2).translate(0, 5.3, 0.06), '#222327'), // a coil of spare cable
      B(0.32, 0.46, 0.2, 0, 2.8, 0.2, '#9aa0a6'), // a junction box
      B(0.04, 2.6, 0.04, 0.12, 3.26, 0.14, '#2a2b2f') // the box's cable up
    ]),
  scooter: () =>
    merge([
      ...[-0.6, 0.62].map(z => P(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10).rotateZ(Math.PI / 2).translate(0, 0.24, z), '#202125')),
      B(0.3, 0.12, 0.86, 0, 0.22, 0.02, '#2b2c30'),
      B(0.38, 0.34, 0.62, 0, 0.36, -0.3, '#f2f2f2', 0, 1), // the body (the instance colour)
      B(0.31, 0.1, 0.58, 0, 0.7, -0.26, '#2a2a2e'),
      P(new THREE.BoxGeometry(0.36, 0.6, 0.1).rotateX(-0.25).translate(0, 0.58, 0.42), '#f2f2f2', 0, 1),
      B(0.05, 0.42, 0.05, 0, 0.62, 0.5, '#3a3b40'),
      B(0.66, 0.05, 0.05, 0, 1.02, 0.5, '#2a2b2f'),
      B(0.22, 0.15, 0.13, 0, 0.92, 0.55, '#f2f2f2', 0, 1),
      B(0.12, 0.06, 0.03, 0, 0.95, 0.62, '#fff6d8', 0.35), // the headlamp
      B(0.32, 0.05, 0.2, 0, 0.5, 0.56, '#f2f2f2', 0, 1) // the front mudguard
    ]).rotateZ(0.07), // (on its stand)
  bin: () =>
    merge([
      C(0.27, 0.23, 0.82, 0, -0.05, 0, '#f2f2f2', 10, 0, 1),
      C(0.3, 0.3, 0.08, 0, 0.77, 0, '#e2e2e2', 10, 0, 0.8),
      C(0.275, 0.275, 0.07, 0, 0.5, 0, '#f4f1e6', 10)
    ]),
  vending: () =>
    merge([
      B(0.96, 1.86, 0.74, 0, -0.05, 0, '#f2f2f2', 0, 1), // the cabinet (the instance colour)
      B(0.8, 0.9, 0.04, 0, 0.82, 0.37, '#eef4ff', 0.9), // the lit display
      ...[0.95, 1.22, 1.49].flatMap((y, r) =>
        [-0.28, -0.14, 0, 0.14, 0.28].map((x, i) =>
          B(0.08, 0.17, 0.03, x, y, 0.4, ['#e8463c', '#3c8ee8', '#f2c230', '#3cc87a', '#f07ab0'][(i + r * 2) % 5], 0.5)
        )
      ),
      B(0.84, 0.16, 0.05, 0, 1.68, 0.37, '#ffffff', 0.95, 1), // the lit header (the brand colour)
      B(0.52, 0.18, 0.06, -0.08, 0.2, 0.37, '#1b1c20'), // the dispenser
      B(0.12, 0.3, 0.05, 0.3, 0.45, 0.37, '#c8ccd2'), // the coin panel
      ...[-1, 1].map(s => B(0.03, 1.5, 0.5, s * 0.49, 0.2, 0.02, '#ffffff', 0, 1))
    ]),
  sign: () =>
    merge([
      ...[-0.22, 0.22].map(x => B(0.04, 0.4, 0.04, x, -0.05, 0, '#2a2b2f')),
      B(0.62, 0.96, 0.14, 0, 0.35, 0, '#ffffff', 1, 1), // the light box (lit, the instance colour)
      B(0.66, 0.05, 0.16, 0, 1.31, 0, '#2a2b2f'),
      B(0.66, 0.05, 0.16, 0, 0.32, 0, '#2a2b2f'),
      B(0.46, 0.1, 0.15, 0, 1.0, 0, '#1d1e22', 0.15), // the lettering bands
      B(0.38, 0.08, 0.15, 0, 0.72, 0, '#1d1e22', 0.15)
    ]),
  bench: () =>
    merge([
      B(1.5, 0.08, 0.4, 0, 0.42, 0, '#f2f2f2', 0, 1),
      B(1.5, 0.3, 0.06, 0, 0.56, -0.2, '#f2f2f2', 0, 1),
      ...[-0.62, 0.62].map(x => B(0.07, 0.62, 0.4, x, -0.1, -0.02, '#34363b'))
    ]),
  bollard: () => merge([C(0.1, 0.11, 0.95, 0, -0.1, 0, '#3a3e44', 8), C(0.112, 0.112, 0.08, 0, 0.62, 0, '#e8c23a', 8)]),
  planter: () =>
    merge([
      C(0.34, 0.24, 0.62, 0, -0.05, 0, '#f2f2f2', 10, 0, 1), // a glazed pot (the instance colour)
      C(0.36, 0.36, 0.06, 0, 0.55, 0, '#f2f2f2', 10, 0, 0.7),
      P(new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.85, 1).translate(0, 0.92, 0), '#3f8a3e'),
      P(new THREE.IcosahedronGeometry(0.26, 0).translate(0.18, 1.18, 0.1), '#4f9c44'),
      ...[
        [0.25, 1.05, 0.25],
        [-0.28, 1.0, 0.12],
        [0.05, 1.3, -0.2],
        [-0.1, 0.95, 0.33]
      ].map(([x, y, z]) => B(0.09, 0.09, 0.09, x, y, z, '#f06aa8'))
    ]),
  hydrant: () =>
    merge([
      C(0.12, 0.14, 0.62, 0, -0.1, 0, '#d8402f', 8),
      C(0.16, 0.16, 0.07, 0, 0.42, 0, '#f0c838', 8),
      P(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.52, 0), '#f0c838'),
      B(0.4, 0.08, 0.08, 0, 0.3, 0, '#d8402f')
    ])
};
/** One span of overhead wire: K segments along u 0 → 1 (x), a square cross-section (the vertex shader bends it by `wsp`). */
const wireGeo = (K = 12) => {
  const pos = [],
    nor = [],
    wu = [],
    sq = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1]
    ];
  for (let i = 0; i < K; i++)
    for (let s = 0; s < 4; s++) {
      const a = sq[s],
        b = sq[(s + 1) % 4],
        ny = (a[0] + b[0]) / 2,
        nz = (a[1] + b[1]) / 2,
        u0 = i / K,
        u1 = (i + 1) / K;
      for (const [u, q] of [
        [u0, a],
        [u1, a],
        [u1, b],
        [u0, a],
        [u1, b],
        [u0, b]
      ]) {
        pos.push(0, q[0], q[1]);
        nor.push(0, ny, nz);
        wu.push(u);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('wu', new THREE.Float32BufferAttribute(wu, 1));
  return g;
};

// ---------- the decal atlas (code-made: crack, tar patch, puddle, leaves; alpha = coverage) ----------
export const DECALS = ['crack', 'patch', 'puddle', 'leaves'];
function decalAtlas() {
  if (typeof document === 'undefined') return null;
  const S = 256,
    cv = document.createElement('canvas');
  cv.width = S * 4;
  cv.height = S;
  const g = cv.getContext('2d'),
    R = (i, j) => hh(i, j, 77);
  // 0 crack: a jagged main line and branches (dark, a lighter lip)
  const crack = (x, y, a, n, w, seed) => {
    for (let k = 0; k < n; k++) {
      const a2 = a + (R(seed, k) - 0.5) * 1.1,
        L = 10 + 14 * R(seed + 1, k),
        x2 = x + Math.cos(a2) * L,
        y2 = y + Math.sin(a2) * L;
      g.lineWidth = w + 2;
      g.strokeStyle = 'rgba(150,146,138,1)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      g.lineWidth = w;
      g.strokeStyle = 'rgba(40,40,44,1)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      if (R(seed + 2, k) < 0.22 && n > 3)
        crack(x2, y2, a2 + (R(seed + 3, k) < 0.5 ? 1 : -1) * 0.9, Math.ceil(n / 3), Math.max(1.5, w - 1.5), seed + 11 * k);
      x = x2;
      y = y2;
    }
  };
  g.lineCap = 'round';
  crack(18, 140, -0.15, 14, 4, 1);
  // 1 tar patch: an irregular darker slab, its seam lighter
  const blob = (cx, cy, rx, ry, n, seed) => {
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2,
        r = 0.78 + 0.3 * R(seed, k % n);
      g.lineTo(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
    }
    g.closePath();
  };
  g.save();
  g.translate(S, 0);
  g.fillStyle = 'rgba(160,158,152,1)';
  g.fillRect(30, 46, 196, 164);
  g.fillStyle = 'rgba(58,59,64,1)';
  g.fillRect(38, 54, 180, 148);
  g.fillStyle = 'rgba(72,73,78,1)';
  for (let k = 0; k < 9; k++) g.fillRect(44 + 20 * k, 62 + 14 * R(4, k), 10, 120 * R(5, k));
  g.restore();
  // 2 puddle: a blob of reflecting water, a pale rim and sky streaks
  g.save();
  g.translate(S * 2, 0);
  blob(128, 128, 112, 84, 14, 7);
  g.fillStyle = 'rgba(122,128,132,1)';
  g.fill();
  blob(128, 128, 100, 74, 14, 7);
  g.fillStyle = 'rgba(70,86,104,1)';
  g.fill();
  g.fillStyle = 'rgba(176,198,220,1)';
  for (let k = 0; k < 4; k++) g.fillRect(70 + 26 * k, 92 + 30 * R(8, k), 44 + 30 * R(9, k), 5);
  g.restore();
  // 3 leaves: small painted leaves, warm and green
  g.save();
  g.translate(S * 3, 0);
  const tones = ['#c8742c', '#d9a23a', '#8a5a2a', '#7a9a3c', '#b8502a'];
  for (let k = 0; k < 34; k++) {
    const x = 26 + 204 * R(10, k),
      y = 26 + 204 * R(11, k),
      a = R(12, k) * Math.PI * 2,
      r = 9 + 7 * R(13, k);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = tones[k % tones.length];
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(60,40,20,1)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-r, 0);
    g.lineTo(r, 0);
    g.stroke();
    g.restore();
  }
  g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- materials ----------
let MATS = null;
const U = { uT: { value: 0 } };
/** The solid props' material: vertex colour × the instance colour where `ptint`; lit faces (`glow`) emit by NIGHT_U (a little by day). */
const solidMat = () => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow; attribute float ptint; varying float vPg;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= mix(vec3(1.0), instanceColor.xyz, ptint);
        #endif
        vPg = glow;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying float vPg;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor * vPg * (0.22 + 1.1 * uNight);'
      );
  };
  m.customProgramCacheKey = () => 'props3d-solid';
  m.userData.fdWhole = true; // (street finish: dropped whole at the lens / across the camera → you line, never dithered)
  return m;
};
const mats = () => {
  if (MATS) return MATS;
  const wire = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
  wire.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uSw: STREET_U.st });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wu; attribute vec4 wsp; uniform float uT, uSw;')
      .replace(
        '#include <begin_vertex>',
        `float bow = 4.0 * wu * (1.0 - wu);
        vec3 transformed = vec3(wu * wsp.x, position.y * wsp.w + wu * wsp.z - wsp.y * bow, position.z * wsp.w);
        transformed.z += uSw * bow * wsp.y * 0.09 * sin(uT * 1.3 + wsp.x * 0.37 + wsp.y * 5.0);`
      );
  };
  wire.customProgramCacheKey = () => 'props3d-wire';
  wire.userData.noStreetFx = true; // (thin: no lens fade, no toon bands; its instance box is a unit span)
  const decal = new THREE.MeshStandardMaterial({
    map: decalAtlas(),
    alphaTest: 0.5,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -6
  });
  decal.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dtile; varying float vTile;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n  vTile = dtile;\n#ifdef USE_MAP\n  vMapUv.x = (vMapUv.x + dtile) * 0.25;\n#endif'
      );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTile;').replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.07, step(1.5, vTile) * step(vTile, 2.5));' // (the puddle mirrors the sky)
    );
  };
  decal.customProgramCacheKey = () => 'props3d-decal';
  MATS = { wire, decal };
  for (const m of Object.values(MATS)) m.userData.shared = true;
  return MATS;
};

/**
 * The kinds: reach r (m from you), cap (instances), shadow, where on the pavement (kerb: by the road; wall: the back edge) and the
 * instance colours (tint).
 */
const K = {
  pole: { r: 210, cap: 260, shadow: true },
  wire: { r: 210, cap: 2400 },
  vending: { r: 110, cap: 90, shadow: true, at: 'wall', tint: ['#d8343a', '#2c66c4', '#eef0f2', '#2f9a5a', '#f08a2a'] },
  sign: { r: 110, cap: 140, at: 'mid', tint: ['#ffd25a', '#ff8a5a', '#7ad0ff', '#ff6aa8', '#fff2d0', '#9cf08a'] },
  scooter: {
    r: 70,
    cap: 260,
    shadow: true,
    at: 'kerb',
    tint: ['#d83a3a', '#2a5ab8', '#f2f2f2', '#1e1f23', '#f0a8c0', '#8ad0c0', '#c8c8cc']
  },
  bin: { r: 70, cap: 160, at: 'wall', tint: ['#3f8a4a', '#2c6ab0', '#e0a020', '#c8402f'] },
  bench: { r: 80, cap: 60, at: 'wall', tint: ['#8a6440', '#3f7a5a', '#2c5a8a', '#b8b2a6'] },
  bollard: { r: 60, cap: 160, at: 'kerb' },
  planter: { r: 80, cap: 220, at: 'wall', tint: ['#2c5aa0', '#9a5a32', '#3f7a6a', '#c8b89a', '#7a3a4a'] },
  hydrant: { r: 60, cap: 60, at: 'kerb' },
  decal: { r: 58, cap: 1400 }
};
/** What a pavement slot holds by what fronts it: [kind, weight] (the rest of 1 stays empty). */
const MIX = {
  shop: [
    ['scooter', 0.2],
    ['sign', 0.15],
    ['vending', 0.11],
    ['planter', 0.08],
    ['bin', 0.07],
    ['bench', 0.03]
  ],
  home: [
    ['scooter', 0.18],
    ['planter', 0.16],
    ['bin', 0.09],
    ['vending', 0.03],
    ['hydrant', 0.03],
    ['bench', 0.02]
  ],
  main: [
    ['bollard', 0.09],
    ['bin', 0.07],
    ['scooter', 0.07],
    ['hydrant', 0.04],
    ['sign', 0.03],
    ['vending', 0.02]
  ],
  street: [
    ['scooter', 0.1],
    ['planter', 0.07],
    ['bin', 0.06],
    ['hydrant', 0.02]
  ]
};
const pick = (mix, h) => {
  for (const [k, w] of mix) {
    if (h < w) return k;
    h -= w;
  }
  return null;
};
const HOMES = new Set(['house', 'rowhouse', 'hut', 'villa', 'shophouse', 'stilt', 'cottage']);

/**
 * Pavement slots of one road (pure; tested): road = { ri, kind, a: [x, z], b: [x, z] (m) }, deg(end 0 | 1) → the junction's road
 * count, lamps on it (kit3d lampSpots' rule) and the map look's benches are kept clear of. → { poles: [{ d, s }], slots: [{ d, s, j }] }
 * (d m along the road from a, s the side ±1 (+ = left of a → b), j the slot's index for its hash).
 */
export function roadSlots(road, deg0, deg1) {
  const hw = (ROAD[road.kind] || ROAD.street).w / 2,
    L = Math.hypot(road.b[0] - road.a[0], road.b[1] - road.a[1]),
    s0 = deg0 > 1 ? RING.trim + 0.6 : 0.8,
    s1 = L - (deg1 > 1 ? RING.trim + 0.6 : 0.8),
    lampHere = LAMP.kinds.includes(road.kind),
    lampNear = (d, s) => {
      if (!lampHere) return false;
      const j = Math.round((d - LAMP.every / 2) / LAMP.every),
        side = j % 2 ? 1 : -1;
      return j >= 0 && side === s && Math.abs(d - (LAMP.every / 2 + j * LAMP.every)) < 1.4;
    },
    benchNear = d => {
      if (road.kind !== 'main') return false;
      const [E, lo, hi] = PROPS.bench,
        k = Math.round(d / E);
      return k >= 1 && d - k * E > -lo && d - k * E < hi;
    },
    out = { hw, L, s0, s1, poles: [], slots: [] };
  if (s1 - s0 < 4) return out;
  // poles: one side of the road (by hash), main roads and some streets, evenly spaced, nudged off lamps and benches
  const pside = hh(road.ri, 3, 1) < 0.5 ? 1 : -1;
  if ((road.kind === 'main' || (road.kind === 'street' && hh(road.ri, 3, 2) < PROPS.pole.street)) && s1 - s0 >= PROPS.pole.min) {
    const n = Math.max(1, Math.round((s1 - s0 - 2) / PROPS.pole.every));
    for (let i = 0; i <= n; i++) {
      const d0 = s0 + 1 + ((s1 - s0 - 2) * i) / n;
      for (const nudge of [0, 1.8, -1.8, 3.4, -3.4]) {
        const d = d0 + nudge;
        if (d < s0 || d > s1 || lampNear(d, pside) || benchNear(d)) continue;
        out.poles.push({ d, s: pside });
        break;
      }
    }
  }
  for (const s of [1, -1])
    for (let d = s0 + PROPS.slot / 2, j = 0; d < s1 - 0.6; d += PROPS.slot, j++) {
      if (lampNear(d, s) || benchNear(d) || out.poles.some(p => p.s === s && Math.abs(p.d - d) < 1.3)) continue;
      out.slots.push({ d, s, j });
    }
  return out;
}

export function createProps(scene, heightAt, opts = {}) {
  const solid = opts.solid || (() => false),
    group = new THREE.Group(),
    meshes = {},
    m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    qy = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    nrm = new THREE.Vector3(),
    v = new THREE.Vector3(),
    sc = new THREE.Vector3(),
    col = new THREE.Color();
  group.userData.props = true;
  scene.add(group);
  let L = null, // the layout: { key, roads, lots }
    ver = 0,
    idx = null, // per layout: { roads (pavement roads), all (every drawn road, for onRoad), deg, segs, lotT, info, blockRoads }
    blocks = new Map(), // block → { kind: { m: [], c: [], e: [] } }
    shown = null, // the shown blocks (Set) or null
    at = null, // where the drawn set was picked
    dirty = false,
    low = false,
    reach = 1, // (× each kind's reach: Auto's ladder)
    N = { n: {}, ms: 0, preps: 0, picks: 0 };
  const T = 32; // the index tiles (m)
  const tk = (x, z) => `${Math.floor(x / T)},${Math.floor(z / T)}`;
  const addT = (M, x0, z0, x1, z1, val) => {
    for (let j = Math.floor(z0 / T); j <= Math.floor(z1 / T); j++)
      for (let i = Math.floor(x0 / T); i <= Math.floor(x1 / T); i++) {
        const k = `${i},${j}`;
        if (!M.has(k)) M.set(k, []);
        M.get(k).push(val);
      }
  };
  const meshOf = kind => {
    if (meshes[kind]) return meshes[kind];
    const S = K[kind];
    let geo, mat;
    if (kind === 'wire') {
      geo = wireGeo();
      geo.setAttribute('wsp', new THREE.InstancedBufferAttribute(new Float32Array(S.cap * 4), 4));
      mat = mats().wire;
    } else if (kind === 'decal') {
      geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      geo.setAttribute('dtile', new THREE.InstancedBufferAttribute(new Float32Array(S.cap), 1));
      mat = mats().decal;
    } else {
      geo = SHAPE[kind]();
      mat = solidMat(); // (one per kind: look3d's lens hide keeps one instance box per material)
    }
    const m = new THREE.InstancedMesh(geo, mat, S.cap);
    m.setColorAt(0, col.setRGB(1, 1, 1));
    m.count = 0;
    m.castShadow = !!S.shadow;
    m.receiveShadow = true;
    m.frustumCulled = kind !== 'wire'; // (a wire's geometry is a unit span: its bounds are not the drawn ones)
    m.visible = false;
    m.userData.prop = kind;
    meshes[kind] = m;
    group.add(m);
    return m;
  };

  /** The layout's indexes (built on the first block prepared after a sync). */
  const index = () => {
    if (idx && idx.key === L.key) return idx;
    const deg = new Map(),
      kk = p => `${Math.round(p[0])},${Math.round(p[1])}`,
      segs = new Map(),
      roads = [];
    L.roads.forEach((r, ri) => {
      if (r.kind === 'overpass' || !ROAD[r.kind] || !r.pts || r.pts.length < 2) return;
      const a = [r.pts[0][0] * MAP_M, r.pts[0][1] * MAP_M],
        b = [r.pts[r.pts.length - 1][0] * MAP_M, r.pts[r.pts.length - 1][1] * MAP_M],
        hw = ROAD[r.kind].w / 2;
      if (r.kind !== 'boardwalk') for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) deg.set(kk(p), (deg.get(kk(p)) || 0) + 1);
      addT(segs, Math.min(a[0], b[0]) - hw, Math.min(a[1], b[1]) - hw, Math.max(a[0], b[0]) + hw, Math.max(a[1], b[1]) + hw, [
        a[0],
        a[1],
        b[0],
        b[1],
        hw + 0.12
      ]);
      roads.push({ ri, kind: r.kind, a, b, p0: r.pts[0], p1: r.pts[r.pts.length - 1] });
    });
    const lotT = new Map();
    (L.lots || []).forEach((l, i) => {
      const f = lotFrame(l, i);
      if (!f) return;
      const R = Math.hypot(f.w, f.d) / 2 + 4;
      addT(lotT, f.x - R, f.z - R, f.x + R, f.z + R, i);
    });
    return (idx = { key: L.key, deg, kk, segs, roads, lotT, info: new Map(), blockRoads: null });
  };
  const onRoad = (x, z) => {
    for (const [ax, az, bx, bz, r] of idx.segs.get(tk(x, z)) || []) {
      const dx = bx - ax,
        dz = bz - az,
        t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if ((ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2 < r * r) return true;
    }
    return false;
  };
  /** Lot i: { shop (has a shop front), home, door: the front's opening as [cx, cz, nx, nz, half width] (world) | null }. */
  const lotInfo = i => {
    if (idx.info.has(i)) return idx.info.get(i);
    const l = L.lots[i],
      F = facade(l, i);
    let door = null;
    if (F && F.faces) {
      const face = F.faces.find(f => f.f === F.front),
        o = face && face.wins.find(w => w.kind === 'door' || w.kind === 'shop');
      if (o) {
        const [lx, lz] = FACES[face.f],
          { x, z, cs, sn } = F.fr,
          // local → world: dx = lx cs + lz sn, dz = −lx sn + lz cs
          wx = lx * cs + lz * sn,
          wz = -lx * sn + lz * cs;
        door = [x + wx * face.half, z + wz * face.half, wx, wz, (o.kind === 'shop' ? Math.min(o.w / 2, 1.3) : o.w / 2) + 0.55];
      }
    }
    const I = { shop: !!(F && F.shop), home: HOMES.has(l.kind), door };
    idx.info.set(i, I);
    return I;
  };
  /** What fronts world (x, z) within r m: 'shop' | 'home' | null; blocked = in front of a door / shop entrance. */
  const fronting = (x, z, r = 11) => {
    let what = null,
      best = r * r,
      blocked = false;
    for (const i of idx.lotT.get(tk(x, z)) || []) {
      const l = L.lots[i],
        lx = l.at[0] * MAP_M,
        lz = l.at[1] * MAP_M,
        I = lotInfo(i);
      if (I.door) {
        const [cx, cz, nx, nz, w] = I.door,
          dn = (x - cx) * nx + (z - cz) * nz,
          dt = Math.abs((x - cx) * -nz + (z - cz) * nx);
        if (dn > -0.4 && dn < 3.4 && dt < w) blocked = true;
      }
      const d2 = (lx - x) ** 2 + (lz - z) ** 2;
      if (d2 < best + 30 && (I.shop || I.home)) {
        if (I.shop || !what) what = I.shop ? 'shop' : 'home';
        best = Math.min(best, d2);
      }
    }
    return { what, blocked };
  };
  const put = (B, kind, x, y, z, yaw, s, tintH, extra) => {
    const S = K[kind],
      R = (B[kind] = B[kind] || { m: [], c: [], e: [] }),
      c = Math.cos(yaw) * s,
      n = Math.sin(yaw) * s;
    R.m.push(c, 0, -n, 0, 0, s, 0, 0, n, 0, c, 0, x, y, z, 1);
    if (S.tint) col.set(S.tint[Math.floor(tintH * S.tint.length) % S.tint.length]);
    else col.setRGB(1, 1, 1);
    const k = 0.9 + 0.2 * ((tintH * 7.13) % 1);
    R.c.push(col.r * k, col.g * k, col.b * k);
    if (extra) R.e.push(...extra);
  };
  const putM = (B, kind, mat, rgb, extra) => {
    const R = (B[kind] = B[kind] || { m: [], c: [], e: [] });
    for (let i = 0; i < 16; i++) R.m.push(mat.elements[i]);
    R.c.push(rgb[0], rgb[1], rgb[2]);
    if (extra) R.e.push(...extra);
  };
  /** A wire from world a to b ([x, y, z]): its instance (yaw along a → b), span length, sag, rise, thickness. */
  const wire = (B, a, b, sag, th, shade) => {
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      len = Math.hypot(dx, dz),
      yaw = Math.atan2(-dz, dx);
    const R = (B.wire = B.wire || { m: [], c: [], e: [] }),
      c = Math.cos(yaw),
      n = Math.sin(yaw);
    R.m.push(c, 0, -n, 0, 0, 1, 0, 0, n, 0, c, 0, a[0], a[1], a[2], 1);
    R.c.push(shade, shade, shade * 1.04);
    R.e.push(len, sag, b[1] - a[1], th);
  };
  /** The pavement's top at (x, z) (the ring's kerb height over the road lift). */
  const paveY = (x, z) => heightAt(x, z) + LIFT + RING.kerb;
  const blockRoads = G => {
    if (idx.blockRoads) return idx.blockRoads;
    const by = new Map();
    idx.roads.forEach((r, n) => {
      const L2 = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]),
        ux = (r.b[0] - r.a[0]) / (L2 || 1),
        uz = (r.b[1] - r.a[1]) / (L2 || 1),
        w = (ROAD[r.kind].w / 2 + RING.pave + 7) * 1,
        seen = new Set();
      for (let d = 0; d <= L2 + 8; d += 8)
        for (const o of [-w, 0, w]) {
          const x = r.a[0] + ux * Math.min(d, L2) - uz * o,
            z = r.a[1] + uz * Math.min(d, L2) + ux * o,
            k = G.of(x, z);
          if (seen.has(k)) continue;
          seen.add(k);
          if (!by.has(k)) by.set(k, []);
          by.get(k).push(n);
        }
    });
    return (idx.blockRoads = by);
  };
  /** Block k's props (grid G): every pavement road through it, the slots whose spot lies in it. */
  const prepBlock = (G, k) => {
    const t0 = performance.now(),
      Bk = {};
    index();
    for (const n of blockRoads(G).get(k) || []) {
      const r = idx.roads[n],
        pave = r.kind === 'main' || r.kind === 'street',
        S = roadSlots(r, idx.deg.get(idx.kk(r.p0)) || 0, idx.deg.get(idx.kk(r.p1)) || 0),
        ux = (r.b[0] - r.a[0]) / (S.L || 1),
        uz = (r.b[1] - r.a[1]) / (S.L || 1),
        nx = -uz,
        nz = ux, // (the left of a → b: + side)
        pt = (d, o) => [r.a[0] + ux * d + nx * o, r.a[1] + uz * d + nz * o],
        here = (x, z) => G.of(x, z) === k;
      // decals on the carriageway (every road kind but the boardwalk) and the pavements
      if (r.kind !== 'boardwalk')
        for (let d = S.s0 * 0.5 + PROPS.decal.every / 2, j = 0; d < S.L - 1; d += PROPS.decal.every, j++) {
          const h = hh(r.ri, j, 40);
          if (h > PROPS.decal.p) continue;
          const h2 = hh(r.ri, j, 41),
            h3 = hh(r.ri, j, 42),
            onPave = pave && h2 < 0.3,
            o = onPave
              ? (h3 < 0.5 ? 1 : -1) * (S.hw + 0.3 + (RING.pave - 0.6) * hh(r.ri, j, 43))
              : (h3 * 2 - 1) * Math.max(0.1, S.hw - 0.5),
            [x, z] = pt(d, o);
          if (!here(x, z) || (onPave && (solid(x, z, 0.1) || d < S.s0 || d > S.s1))) continue;
          const dirt = r.kind === 'dirt' || r.kind === 'path',
            edge = Math.abs(o) > S.hw * 0.55,
            hk = hh(r.ri, j, 44),
            tile = onPave ? (hk < 0.45 ? 0 : 3) : dirt ? (hk < 0.55 ? 2 : 3) : hk < 0.42 ? 0 : hk < 0.7 ? 1 : hk < 0.86 || !edge ? 3 : 2,
            sz = tile === 1 ? 1.1 + 1.1 * hh(r.ri, j, 45) : tile === 2 ? 0.9 + 1.3 * hh(r.ri, j, 45) : 0.8 + 0.9 * hh(r.ri, j, 45),
            y = (onPave ? paveY(x, z) : heightAt(x, z) + LIFT) + 0.025;
          // tilt to the ground's slope (the ribbons follow it), turned by hash; patches line up with the road
          const e = 0.8,
            gx = heightAt(x + e, z) - heightAt(x - e, z),
            gz = heightAt(x, z + e) - heightAt(x, z - e);
          nrm.set(-gx / (2 * e), 1, -gz / (2 * e)).normalize();
          q.setFromUnitVectors(up, nrm);
          qy.setFromAxisAngle(up, tile === 1 ? Math.atan2(-uz, ux) : hh(r.ri, j, 46) * Math.PI * 2);
          q.multiply(qy);
          m4.compose(v.set(x, y, z), q, sc.set(sz * (tile === 1 ? 1.3 : 1), 1, sz));
          const k2 = 0.92 + 0.16 * hh(r.ri, j, 47);
          putM(Bk, 'decal', m4, [k2, k2, k2], [tile]);
        }
      if (!pave) continue;
      // the poles and their wires (a span belongs to its first pole's block)
      const tops = S.poles.map(p => {
        const [x, z] = pt(p.d, p.s * (S.hw + PROPS.pole.kerb));
        return { x, z, y: paveY(x, z), s: p.s, d: p.d };
      });
      tops.forEach((p, i) => {
        if (!here(p.x, p.z)) return;
        const fx = -nx * p.s,
          fz = -nz * p.s; // toward the road
        put(Bk, 'pole', p.x, p.y, p.z, Math.atan2(fx, fz), 1, 0);
        const A = (P, y, zl) => [P.x + fx * zl, P.y + y, P.z + fz * zl];
        const nb = tops[i + 1];
        if (nb)
          ATTACH.forEach(([y, zl, th, sag], w) => {
            const span = Math.hypot(nb.x - p.x, nb.z - p.z);
            wire(
              Bk,
              A(p, y, zl),
              A(nb, y, zl),
              sag * (span / 25) * (0.8 + 0.45 * hh(r.ri, i * 8 + w, 50)),
              th,
              0.12 + 0.08 * hh(r.ri, w, 51)
            );
          });
        // now and then a line across the road to a building on the far side
        if (hh(r.ri, i, 52) < PROPS.cross) {
          const [bx, bz] = pt(p.d + (hh(r.ri, i, 53) - 0.5) * 6, -p.s * (S.hw + RING.pave + 1.6));
          if (solid(bx, bz, 0)) {
            const a = A(p, 6.3, 0.05),
              b = [bx, heightAt(bx, bz) + 4.6, bz];
            wire(Bk, a, b, 0.35 + 0.3 * hh(r.ri, i, 54), 0.016, 0.14);
          }
        }
      });
      // the pavement slots
      for (const sl of S.slots) {
        const h = hh(r.ri, sl.j, sl.s + 21);
        if (h > 0.62) continue; // (most slots hold something only where something fronts them: the mix sums below 1)
        const [mx, mz] = pt(sl.d, sl.s * (S.hw + RING.pave * 0.5));
        if (!here(mx, mz)) continue;
        const F = fronting(mx + nx * sl.s * 2, mz + nz * sl.s * 2),
          kind = pick(F.what ? MIX[F.what] : MIX[r.kind], h);
        if (!kind || F.blocked) continue;
        const S2 = K[kind],
          o = sl.s * (S2.at === 'kerb' ? S.hw + 0.42 : S2.at === 'wall' ? S.hw + RING.pave - 0.44 : S.hw + RING.pave * 0.62),
          fx = -nx * sl.s,
          fz = -nz * sl.s,
          face = Math.atan2(fx, fz),
          th = hh(r.ri, sl.j, sl.s + 30);
        if (kind === 'scooter') {
          // a row of 1–4, angled to the kerb
          const n = 1 + Math.floor(hh(r.ri, sl.j, sl.s + 31) * 4),
            tilt = (hh(r.ri, sl.j, sl.s + 32) < 0.5 ? 1 : -1) * 0.45;
          for (let b = 0; b < n; b++) {
            const [x, z] = pt(sl.d - 1.1 + b * 0.78, o + sl.s * 0.15);
            if (onRoad(x, z) || solid(x, z, 0.1) || !here(x, z)) continue;
            put(Bk, 'scooter', x, paveY(x, z), z, face + tilt + (hh(r.ri, sl.j * 4 + b, 33) - 0.5) * 0.2, 1, hh(r.ri, sl.j * 4 + b, 34));
          }
          continue;
        }
        const [x, z] = pt(sl.d, o);
        if (onRoad(x, z) || solid(x, z, 0.15) || solid(x - fx * 0.45, z - fz * 0.45, 0.05)) continue;
        if ((kind === 'vending' || kind === 'bench') && !solid(x - fx * 3.2, z - fz * 3.2, 0.3)) continue; // (with a wall at its back)
        put(Bk, kind, x, paveY(x, z), z, face + (kind === 'planter' || kind === 'bin' ? th * 6.28 : 0), 1, th);
        if (kind === 'bench' && hh(r.ri, sl.j, sl.s + 35) < 0.6) {
          const [bx, bz] = pt(sl.d + 1.2, o);
          if (!solid(bx, bz, 0.15)) put(Bk, 'bin', bx, paveY(bx, bz), bz, face, 1, hh(r.ri, sl.j, sl.s + 36));
        }
      }
    }
    const out = {};
    for (const [kind, R] of Object.entries(Bk))
      out[kind] = { m: new Float32Array(R.m), c: new Float32Array(R.c), e: R.e.length ? new Float32Array(R.e) : null };
    blocks.set(k, out);
    N.preps++;
    N.ms = +(performance.now() - t0).toFixed(2);
  };
  const hideAll = () => {
    for (const m of Object.values(meshes)) ((m.visible = false), (m.count = 0));
    at = null;
  };
  /** Fill each kind's mesh with the shown blocks' instances within its reach of you. */
  const pickNear = you => {
    const t0 = performance.now(),
      n = {};
    for (const kind of Object.keys(K)) {
      const S = K[kind],
        R2 = (S.r * reach) ** 2; // (Auto's last ladder step: nearer — look3d AUTO.reach)
      let mesh = meshes[kind],
        c = 0;
      for (const bk of shown) {
        const Bk = blocks.get(bk),
          R = Bk && Bk[kind];
        if (!R) continue;
        mesh = mesh || meshOf(kind);
        const ex = kind === 'wire' ? 4 : kind === 'decal' ? 1 : 0,
          M = mesh.instanceMatrix.array,
          Cc = mesh.instanceColor.array,
          E = ex ? mesh.geometry.attributes[kind === 'wire' ? 'wsp' : 'dtile'].array : null;
        for (let i = 0, cnt = R.m.length / 16; i < cnt && c < S.cap; i++) {
          const x = R.m[i * 16 + 12],
            z = R.m[i * 16 + 14];
          if ((x - you[0]) ** 2 + (z - you[1]) ** 2 > R2) continue;
          // (plain copies: no subarray views per instance — a re-pick makes no garbage)
          for (let e = 0, a = i * 16, b = c * 16; e < 16; e++) M[b + e] = R.m[a + e];
          for (let e = 0, a = i * 3, b = c * 3; e < 3; e++) Cc[b + e] = R.c[a + e];
          if (E) for (let e = 0, a = i * ex, b = c * ex; e < ex; e++) E[b + e] = R.e[a + e];
          c++;
        }
      }
      if (!mesh) continue;
      mesh.count = c;
      mesh.visible = c > 0;
      // only the drawn part uploads (updateRanges → bufferSubData), not the whole cap
      const up = (a, w) => (a.clearUpdateRanges(), a.addUpdateRange(0, Math.max(1, c * w)), (a.needsUpdate = true));
      up(mesh.instanceMatrix, 16);
      up(mesh.instanceColor, 3);
      if (kind === 'wire') up(mesh.geometry.attributes.wsp, 4);
      if (kind === 'decal') up(mesh.geometry.attributes.dtile, 1);
      mesh.boundingSphere = null;
      n[kind] = c;
    }
    N.n = n;
    N.picks++;
    N.pickMs = +(performance.now() - t0).toFixed(2);
    at = you.slice();
  };
  const clear = () => {
    blocks = new Map();
    idx = null;
    shown = null;
    hideAll();
    ver++;
  };
  return {
    /** Read model.land roads / lots (a new layout: every block is prepared again). */
    sync(model) {
      const Ld = model.land || {},
        roads = Ld.roads || [],
        lots = Ld.lots || [],
        key = `${roads.length}|${lots.length}|${JSON.stringify(roads.slice(0, 4))}|${JSON.stringify(roads.slice(-4))}|${lots.length ? lots[0].at + '' + lots[lots.length - 1].at : ''}`;
      if (L && L.key === key) return;
      L = { key, roads, lots };
      clear();
    },
    /** The streaming layer (stream3d): a block's share = its props per kind; show = draw the shown blocks' near instances. */
    layer(G) {
      return {
        id: 'props',
        ver: () => ver,
        prep(k) {
          if (L && !blocks.has(k)) prepBlock(G, k);
        },
        show(keys) {
          shown = keys;
          dirty = true;
          if (!keys) hideAll();
        }
      };
    },
    /** Each frame (map3d, after the stream): the wind's clock; the drawn set re-picked when the shown blocks changed or you moved PROPS.step m. Fast: none. */
    tick(dt, t, you, st, lo, k = 1) {
      U.uT.value = t;
      if (lo !== low) ((low = lo), (dirty = true));
      if (k !== reach) ((reach = k), (dirty = true));
      if (low || !shown || !you || st < 0.5) {
        if (at || dirty) hideAll();
        dirty = false;
        return;
      }
      if (dirty || !at || Math.hypot(you[0] - at[0], you[1] - at[1]) > PROPS.step) {
        dirty = false;
        pickNear(you);
      }
    },
    /** QA: the drawn instance of `kind` nearest world (x, z) → [x, y, z, yaw (its face's heading)] | null. */
    find(kind, x, z) {
      const m = meshes[kind];
      if (!m || !m.visible) return null;
      let best = null,
        bd = Infinity;
      const a = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const d = (a[i * 16 + 12] - x) ** 2 + (a[i * 16 + 14] - z) ** 2;
        if (d < bd) ((bd = d), (best = [a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14], Math.atan2(a[i * 16 + 8], a[i * 16 + 10])]));
      }
      return best;
    },
    /** QA: { on, n (instances drawn per kind), blocks (prepared), preps, picks, ms (the last block's preparing), pickMs }. */
    info: () => ({ on: !!at, n: N.n, blocks: blocks.size, preps: N.preps, picks: N.picks, ms: N.ms, pickMs: N.pickMs || 0 }),
    dispose() {
      for (const m of Object.values(meshes)) {
        group.remove(m);
        m.geometry.dispose();
        if (!m.material.userData.shared) m.material.dispose();
        m.dispose();
      }
      scene.remove(group);
    }
  };
}
