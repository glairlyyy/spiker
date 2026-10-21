// Nature on the 3D island (spec §4.19c, T-223): trees, rocks, bushes and grass from model.land.nature, and the few animals that
// loop on the map from model.land.wild (birds round the Peak, gulls over the harbor, a heron on the river, deer, dogs, a cat).
// Display only: placement is plain data from MapModel (string hashes, no randoms); one InstancedMesh per shape, low-poly,
// two or three vertex tones per shape × an instance tint (kind tone × shade × the fog's dimming).
//   createNature(scene, heightAt) → { sync(model), tick(dt, t), count(), dispose() }
// Draw calls: 10 (pine, broad, blossom, palm, rock + scrap, bush + tea + hedge, tuft + dune grass + reeds, bamboo, log, fence) + 3 animals
// (bird, beast, heron). The border rows (T-224) come in model.land.nature like the rest.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, fogFactor, lattice, hstr } from './geo3d.mjs';
import { part, box } from './kit3d.mjs';

const cyl = (r0, r1, h, n = 5) => new THREE.CylinderGeometry(r0, r1, h, n, 1, true);
const cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n, 1, true);
const merge = parts => {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
};
/** Shapes (m, base at y = 0): drawn at the town's exaggerated scale so they read from the map camera. */
const SHAPE = {
  pine: () =>
    merge([
      part(cyl(0.2, 0.3, 2.4).translate(0, 1.2, 0), '#5a4330'),
      part(cone(2.2, 4.6).translate(0, 3.9, 0), '#2e5638'),
      part(cone(1.55, 3.6).translate(0, 6.1, 0), '#386a44')
    ]),
  broad: () =>
    merge([
      part(cyl(0.22, 0.32, 2.6).translate(0, 1.3, 0), '#5f4a35'),
      part(new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4, 0), '#4c8a3c')
    ]),
  blossom: () =>
    merge([
      part(cyl(0.2, 0.3, 2.4).translate(0, 1.2, 0), '#5f4a35'),
      part(new THREE.IcosahedronGeometry(2.1, 0).translate(0, 3.7, 0), '#e8a9bd')
    ]),
  palm: () => {
    const fronds = [0, 1, 2, 3, 4].map(i =>
      box(3.4, 0.08, 0.7, 1.5, 0, 0, '#5c9a44')
        .rotateZ(-0.35)
        .rotateY((i * Math.PI * 2) / 5)
        .translate(0.5, 6.6, 0)
    );
    return merge([part(cyl(0.16, 0.24, 6.8).translate(0, 3.4, 0).rotateZ(0.08), '#8b6d4a'), ...fronds]);
  },
  rock: () => part(new THREE.IcosahedronGeometry(1, 0).scale(1.4, 0.8, 1.1).translate(0, 0.35, 0), '#8c8980'),
  bush: () => part(new THREE.IcosahedronGeometry(0.95, 0).scale(1, 0.75, 1).translate(0, 0.55, 0), '#4f7f3d'),
  tuft: () =>
    merge(
      [
        [0, 0],
        [0.25, 0.1],
        [-0.15, 0.22]
      ].map(([x, z], i) => part(cone(0.18, 0.9 - i * 0.12, 3).translate(x, 0.42, z), '#d9dcb0'))
    ),
  bamboo: () =>
    merge(
      [
        [0, 0, 7],
        [0.6, 0.3, 6.2],
        [-0.4, 0.5, 6.6],
        [0.2, -0.55, 5.8]
      ].flatMap(([x, z, h]) => [
        part(cyl(0.1, 0.12, h, 4).translate(x, h / 2, z), '#9fb85c'),
        part(cone(0.55, 1.6, 4).translate(x, h - 0.3, z), '#6e9a3e')
      ])
    ),
  fence: () =>
    merge([
      box(3.4, 0.14, 0.08, 0, 0.55, 0, '#8d8a84'),
      box(3.4, 0.14, 0.08, 0, 1.15, 0, '#8d8a84'),
      box(0.14, 1.5, 0.14, -1.6, 0, 0, '#6e5a46'),
      box(0.14, 1.5, 0.14, 1.6, 0, 0, '#6e5a46'),
      box(3.2, 0.9, 0.04, 0, 0.35, 0, '#9a8f7c')
    ]),
  log: () =>
    part(
      cyl(0.28, 0.32, 3.2, 6)
        .rotateZ(Math.PI / 2)
        .translate(0, 0.28, 0),
      '#8a7258'
    )
};
// ---------- the detailed shapes (spec §4.39 Land, T-343; the Fast setting keeps SHAPE above) ----------
/** A fixed hash of a vertex position (0..1): shared corners get the same value, so jittered meshes stay closed. */
const vh = (x, y, z, k = 0) => lattice(Math.round(x * 97) + Math.round(z * 61) * 7 + k * 13, Math.round(y * 89) - k * 5);
/** Non-indexed copy of geo with a flat colour and a `leaf` flag (1 = foliage: the shader's leafy noise and the wind). */
const leafy = (geo, color, leaf, smoothN = true) => {
  if (smoothN && geo.index) geo.computeVertexNormals();
  const g = part(geo, color),
    n = g.attributes.position.count;
  g.setAttribute('leaf', new THREE.BufferAttribute(new Float32Array(n).fill(leaf), 1));
  return g;
};
/** Displace an (indexed) geometry's vertices by up to amp along a hashed direction (closed seams), then recompute normals. */
const jit = (g0, amp, k = 0) => {
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const geo = mergeVertices(g0),
    P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    P.setXYZ(i, x + amp * (vh(x, y, z, k) - 0.5), y + amp * (vh(x, y, z, k + 1) - 0.5), z + amp * (vh(x, y, z, k + 2) - 0.5));
  }
  geo.computeVertexNormals();
  return geo;
};
/** Vertex tones: colour × f(x, y, z) per vertex (fake light: darker underneath and inside, lighter on top). */
const tone = (g, f) => {
  const P = g.attributes.position,
    C = g.attributes.color;
  for (let i = 0; i < P.count; i++) {
    const k = f(P.getX(i), P.getY(i), P.getZ(i));
    C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k);
  }
  return g;
};
const trunk = (r0, r1, h, color = '#5a4330') =>
  tone(leafy(cyl(r0, r1, h, 6).translate(0, h / 2, 0), color, 0), (x, y) => 0.8 + (0.25 * y) / h);
/** A crown of blobs (smooth, jittered icosahedra) round (0, y, 0): tones from dark under / inside to light on top. */
const crown = (blobs, color, y0, y1) =>
  blobs.map(([x, y, z, r], i) =>
    tone(leafy(jit(new THREE.IcosahedronGeometry(r, 1), r * 0.35, i * 3).translate(x, y, z), color, 1), (px, py, pz) => {
      const up = (py - y0) / (y1 - y0),
        out = Math.min(1, Math.hypot(px, pz) / 2.4);
      return (0.55 + 0.45 * up) * (0.8 + 0.25 * out) * (0.9 + 0.2 * vh(px, py, pz, 7));
    })
  );
const HI = {
  pine: () => {
    const tiers = [0, 1, 2, 3, 4].map(i => {
      const r = 2.35 * (1 - i * 0.17),
        y0 = 1.7 + i * 1.3,
        ht = 2.5 - i * 0.18,
        g = new THREE.LatheGeometry(
          [
            new THREE.Vector2(r * 0.9, y0 - 0.35),
            new THREE.Vector2(r, y0),
            new THREE.Vector2(r * 0.45, y0 + ht * 0.55),
            new THREE.Vector2(0.001, y0 + ht)
          ],
          8
        ).rotateY(i * 1.3);
      jit(g, 0.35, i);
      return tone(leafy(g, '#2f5a3a', 1), (x, y) => (0.55 + 0.5 * Math.min(1, (y - y0 + 0.35) / (ht + 0.35))) * (0.85 + 0.25 * (i / 4)));
    });
    return merge([trunk(0.16, 0.3, 3.4, '#4f3a2a'), ...tiers]);
  },
  broad: () =>
    merge([
      trunk(0.2, 0.36, 3, '#5f4a35'),
      tone(leafy(cyl(0.08, 0.14, 1.8, 5).rotateZ(0.7).translate(0.7, 3, 0), '#5f4a35', 0), () => 0.9),
      tone(leafy(cyl(0.08, 0.14, 1.6, 5).rotateZ(-0.8).translate(-0.6, 2.9, 0.2), '#5f4a35', 0), () => 0.9),
      ...crown(
        [
          [0, 4.3, 0, 1.9],
          [1.2, 3.8, 0.4, 1.4],
          [-1.1, 3.9, -0.3, 1.45],
          [0.1, 4.9, -0.6, 1.35]
        ],
        '#4f8a3e',
        2.4,
        6.6
      )
    ]),
  blossom: () =>
    merge([
      trunk(0.18, 0.32, 2.6, '#5f4a35'),
      ...crown(
        [
          [0, 3.9, 0, 1.7],
          [1.0, 3.5, 0.4, 1.25],
          [-0.6, 4.4, -0.5, 1.3]
        ],
        '#eaa6bd',
        2.3,
        5.9
      )
    ]),
  palm: () => {
    const top = new THREE.Vector3(0.9, 6.8, 0),
      stem = tone(
        leafy(
          new THREE.TubeGeometry(
            new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 3.6, 0), top),
            8,
            0.2,
            5
          ),
          '#8b6d4a',
          0
        ),
        (x, y) => 0.78 + 0.3 * (Math.floor(y * 2.2) % 2) * 0.6
      ),
      fronds = [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const L = 3.4 + 0.5 * vh(i, 1, 2),
          lift = 0.9 + 0.5 * vh(i, 3, 4),
          a = (i * Math.PI * 2) / 8 + 0.3 * vh(i, 5, 6),
          pos = [],
          N = 5,
          pt = (s, side) => {
            const wdt = 0.8 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05)), 0.7) + 0.05,
              x = s * L,
              y = lift * s - (lift + 1.6) * s * s;
            return [x, y - 0.22 * wdt * Math.abs(side), side * wdt];
          };
        for (let j = 0; j < N; j++) {
          const s0 = j / N,
            s1 = (j + 1) / N;
          for (const side of [-1, 1]) {
            const A = pt(s0, 0),
              B = pt(s1, 0),
              C = pt(s0, side),
              D = pt(s1, side);
            if (side > 0) pos.push(...A, ...B, ...C, ...C, ...B, ...D);
            else pos.push(...A, ...C, ...B, ...B, ...C, ...D);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        g.rotateY(a).translate(top.x, top.y, top.z);
        return tone(leafy(g, '#5c9a44', 1, false), (x, y) => 0.7 + 0.35 * Math.min(1, Math.max(0, (y - 5.2) / 2)));
      }),
      nuts = [0, 1, 2].map(i =>
        leafy(
          new THREE.IcosahedronGeometry(0.2, 0).translate(top.x + 0.25 * Math.cos(i * 2.1), top.y - 0.25, 0.25 * Math.sin(i * 2.1)),
          '#6b5a2a',
          0
        )
      );
    return merge([stem, ...fronds, ...nuts]);
  },
  rock: () =>
    tone(
      leafy(jit(new THREE.IcosahedronGeometry(1, 1), 0.45, 21).scale(1.4, 0.75, 1.1).translate(0, 0.3, 0), '#8c8980', 0),
      (x, y, z) => (0.72 + 0.35 * Math.min(1, (y + 0.1) / 1)) * (0.88 + 0.24 * vh(x, y, z, 9))
    ),
  bush: () =>
    merge(
      [
        [0, 0.55, 0, 0.8],
        [0.55, 0.45, 0.2, 0.6],
        [-0.5, 0.45, -0.15, 0.62],
        [0.05, 0.85, -0.1, 0.55]
      ].map(([x, y, z, r], i) =>
        tone(
          leafy(
            jit(new THREE.IcosahedronGeometry(r, 0), r * 0.3, 30 + i)
              .scale(1, 0.85, 1)
              .translate(x, y, z),
            '#4f7f3d',
            1
          ),
          (px, py) => 0.6 + 0.45 * Math.min(1, py / 1.3)
        )
      )
    ),
  tuft: () => {
    const pos = [],
      col = [];
    for (let i = 0; i < 7; i++) {
      const a = (i * 2.4) % (Math.PI * 2),
        lean = 0.25 + 0.3 * vh(i, 0, 1),
        hgt = 0.65 + 0.4 * vh(i, 2, 3),
        bx = 0.18 * Math.cos(a * 1.7),
        bz = 0.18 * Math.sin(a * 1.7),
        dx = Math.cos(a),
        dz = Math.sin(a),
        wx = -dz * 0.06,
        wz = dx * 0.06,
        P = (t, side) => [bx + dx * lean * t * t + wx * side * (1 - t), hgt * t, bz + dz * lean * t * t + wz * side * (1 - t)],
        a0 = P(0, -1),
        b0 = P(0, 1),
        a1 = P(0.55, -1),
        b1 = P(0.55, 1),
        tip = P(1, 0);
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1, ...a1, ...b1, ...tip);
      for (const t of [0, 0, 0.55, 0.55, 0, 0.55, 0.55, 0.55, 1]) col.push(0.5 + 0.5 * t, 0.55 + 0.45 * t, 0.4 + 0.45 * t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const c = new THREE.Color('#d9dcb0');
    for (let i = 0; i < col.length; i += 3) ((col[i] *= c.r), (col[i + 1] *= c.g), (col[i + 2] *= c.b));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('leaf', new THREE.BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
    return g;
  },
  bamboo: () => withLeaf(SHAPE.bamboo(), 0.5),
  fence: () => withLeaf(SHAPE.fence(), 0),
  log: () => withLeaf(SHAPE.log(), 0)
};
/** A Fast shape with a constant `leaf` flag (the detailed material reads the attribute). */
const withLeaf = (g, v) => (g.setAttribute('leaf', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)), g);
/** The shape makers by look (tests: attributes, budgets). */
export const SHAPES = { flat: SHAPE, hi: HI };
/** Extra grass round the scatter in the detailed look (display only, hashed offsets; m): per kind how many, how far. */
const GRASS = { pine: [3, 3.2], broad: [3, 3.4], blossom: [2, 3], bush: [2, 1.8], rock: [2, 2], tuft: [2, 1.6], bamboo: [2, 2.5] };
/** Kind → its shape, tint (× the shape's tones), size × and whether it casts a shadow. */
const KIND = {
  pine: { shape: 'pine', tint: [1, 1, 1], size: 1.05, shadow: true },
  broad: { shape: 'broad', tint: [1, 1, 1], size: 1, shadow: true },
  blossom: { shape: 'blossom', tint: [1, 1, 1], size: 0.95, shadow: true },
  palm: { shape: 'palm', tint: [1, 1, 1], size: 1, shadow: true },
  rock: { shape: 'rock', tint: [1, 1, 1], size: 1.4 },
  bush: { shape: 'bush', tint: [1, 1, 1], size: 1 },
  tea: { shape: 'bush', tint: [0.72, 0.92, 0.72], size: 0.85, flat: 0.7 },
  tuft: { shape: 'tuft', tint: [0.72, 0.95, 0.55], size: 1.2 },
  dune: { shape: 'tuft', tint: [1.05, 0.98, 0.72], size: 1.3 },
  bamboo: { shape: 'bamboo', tint: [1, 1, 1], size: 1, shadow: true },
  log: { shape: 'log', tint: [1, 1, 1], size: 1 },
  // border rows (spec §4.19d, T-224)
  reed: { shape: 'tuft', tint: [0.6, 0.85, 0.45], size: 1.5, flat: 1.9 },
  hedge: { shape: 'bush', tint: [0.75, 0.95, 0.7], size: 1.05, flat: 0.85 },
  fence: { shape: 'fence', tint: [1, 1, 1], size: 1 },
  scrap: { shape: 'rock', tint: [1.05, 0.72, 0.5], size: 0.75, flat: 0.8 }
};
/** Animals (m): a bird (two wing triangles round a tiny body), a four-legged beast (deer / dog / cat by scale), a heron. */
const beastGeo = () =>
  merge([
    box(0.5, 0.5, 1.4, 0, 0.7, 0, '#ffffff'),
    box(0.22, 0.8, 0.22, 0, 1.05, 0.6, '#ffffff'),
    box(0.3, 0.3, 0.45, 0, 1.75, 0.75, '#ffffff'),
    ...[
      [-0.18, -0.5],
      [0.18, -0.5],
      [-0.18, 0.5],
      [0.18, 0.5]
    ].map(([x, z]) => box(0.12, 0.7, 0.12, x, 0, z, '#ffffff'))
  ]);
const birdGeo = () => {
  const g = new THREE.BufferGeometry(),
    v = [0, 0, 0.35, -1.1, 0.15, -0.1, 0, 0, -0.35, 0, 0, 0.35, 0, 0, -0.35, 1.1, 0.15, -0.1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(1), 3));
  g.computeVertexNormals();
  return g;
};
const heronGeo = () =>
  merge([
    box(0.06, 1.1, 0.06, -0.12, 0, 0, '#c9b26a'),
    box(0.06, 1.1, 0.06, 0.12, 0, 0, '#c9b26a'),
    box(0.45, 0.45, 0.95, 0, 1.05, 0, '#b9c0c8'),
    box(0.12, 0.8, 0.12, 0, 1.4, 0.35, '#d8dde2'),
    box(0.14, 0.14, 0.6, 0, 2.15, 0.55, '#3a3f45')
  ]);
const BEAST = { deer: { s: 1.5, c: '#9b6d45', v: 0.9 }, dog: { s: 0.75, c: '#c9b28d', v: 1.4 }, cat: { s: 0.45, c: '#4a4744', v: 0.7 } },
  BIRD = { bird: { s: 1.4, c: '#33363b', v: 7 }, gull: { s: 1.2, c: '#f2f2ee', v: 6 } };

/** Wind (s → sway) and the leafy look for the detailed shapes: foliage sways by height and gets a soft 3D value-noise mottle. */
const WIND = { speed: 1.3, amp: 0.035, gust: 0.35 };
const richMat = (U, double) => {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    side: double ? THREE.DoubleSide : THREE.FrontSide
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = U.t;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float leaf; uniform float uT; varying float vLeaf; varying vec3 vLp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLeaf = leaf; vLp = position;
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = uT * ${WIND.speed.toFixed(2)} + ip.x * 0.13 + ip.z * 0.11;
        float sw = max(0.0, position.y) * ${WIND.amp.toFixed(3)} * (0.4 + leaf) * (1.0 + ${WIND.gust.toFixed(2)} * sin(ph * 0.37));
        transformed.x += sin(ph) * sw;
        transformed.z += cos(ph * 0.8) * sw * 0.6;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vLeaf; varying vec3 vLp;
        float lkH3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float lkN3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(lkH3(i), lkH3(i + vec3(1, 0, 0)), f.x), mix(lkH3(i + vec3(0, 1, 0)), lkH3(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(lkH3(i + vec3(0, 0, 1)), lkH3(i + vec3(1, 0, 1)), f.x), mix(lkH3(i + vec3(0, 1, 1)), lkH3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72 + 0.5 * lkN3(vLp * 3.1) * (0.6 + 0.4 * lkN3(vLp * 9.0)), vLeaf);`
      );
  };
  return m;
};

export function createNature(scene, heightAt) {
  const U = { t: { value: 0 } },
    shadowMat = new THREE.MeshBasicMaterial(),
    flat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    meshes = {},
    D = new THREE.Object3D(),
    col = new THREE.Color();
  let key = null,
    fogKey = null,
    low = false,
    shadows = {}, // shape → its shadow proxy (detailed look)
    mat = flat,
    placed = {}, // shape → [{ x, z, tint: [r, g, b] }] in instance order
    wild = [], // { k, x, z, r, up, ph, sp, mesh, i }
    life = {};

  const clear = () => {
    for (const m of Object.values(shadows)) (scene.remove(m), m.geometry.dispose());
    shadows = {};
    for (const m of [...Object.values(meshes), ...Object.values(life)]) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    for (const k of Object.keys(meshes)) delete meshes[k];
    life = {};
  };
  /** Instance tints × the fog's dimming (unexplored land is dim, like the terrain). */
  const recolor = fog => {
    const k = fogFactor(fog);
    for (const [shape, items] of Object.entries(placed)) {
      const m = meshes[shape];
      items.forEach((o, i) => {
        const f = k(o.x, o.z);
        m.setColorAt(i, col.setRGB(o.tint[0] * f, o.tint[1] * f, o.tint[2] * f));
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const w of wild) {
      const f = k(w.x, w.z);
      life[w.mesh].setColorAt(w.i, col.set(w.c).multiplyScalar(f));
    }
    for (const m of Object.values(life)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  const build = (items, animals) => {
    clear();
    placed = {};
    const put = (o, K) =>
      (placed[K.shape] = placed[K.shape] || []).push({ o, K, x: o.at[0] * MAP_M, z: o.at[1] * MAP_M, tint: K.tint.map(v => v * o.c) });
    for (const o of items) {
      const K = KIND[o.k];
      if (!K) continue;
      put(o, K);
      // the detailed look: a few grass tufts round each plant and rock (hashed offsets, display only)
      const G = !low && GRASS[o.k];
      if (G)
        for (let j = 0; j < G[0]; j++) {
          const h = hstr(`${o.at[0]},${o.at[1]}|${j}`),
            a = h * Math.PI * 2 * 7,
            r = (0.8 + G[1] * ((h * 13) % 1)) / MAP_M;
          put(
            {
              k: 'tuft',
              at: [o.at[0] + Math.cos(a) * r, o.at[1] + Math.sin(a) * r],
              s: 0.7 + 0.5 * ((h * 29) % 1),
              r: a,
              c: 0.85 + 0.25 * ((h * 41) % 1)
            },
            KIND.tuft
          );
        }
    }
    const q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      m4 = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      sc = new THREE.Vector3();
    for (const [shape, list] of Object.entries(placed)) {
      const m = new THREE.InstancedMesh((low ? SHAPE : HI)[shape](), mat(shape), list.length);
      list.forEach(({ o, K, x, z }, i) => {
        const s = o.s * K.size;
        q.setFromAxisAngle(up, o.r);
        m4.compose(v.set(x, heightAt(x, z) - 0.15, z), q, sc.set(s, s * (K.flat || 1), s));
        m.setMatrixAt(i, m4);
      });
      m.castShadow = list.some(p => p.K.shadow);
      m.receiveShadow = true;
      meshes[shape] = m;
      scene.add(m);
      // the detailed look: the shadow is cast by the Fast shape (layer 1: only the sun's shadow camera draws it) — a few
      // percent of the triangles for the same silhouette at shadow-map resolution
      if (!low && m.castShadow) {
        const px = new THREE.InstancedMesh(SHAPE[shape](), shadowMat, list.length);
        px.instanceMatrix.copy(m.instanceMatrix);
        px.castShadow = true;
        px.receiveShadow = false;
        px.layers.set(1);
        px.userData.proxy = true;
        m.castShadow = false;
        shadows[shape] = px;
        scene.add(px);
      }
    }
    // the animals: one mesh per body kind, moved in tick
    wild = animals.map(a => {
      const mesh = BIRD[a.k] ? 'bird' : a.k === 'heron' ? 'heron' : 'beast',
        spec = BIRD[a.k] || BEAST[a.k] || { s: 1, c: '#ffffff', v: 0 };
      return {
        ...a,
        x: a.at[0] * MAP_M,
        z: a.at[1] * MAP_M,
        cx: a.at[0] * MAP_M,
        cz: a.at[1] * MAP_M,
        R: a.r * MAP_M,
        mesh,
        s: spec.s,
        c: spec.c,
        v: spec.v
      };
    });
    const n = { bird: 0, beast: 0, heron: 0 };
    for (const w of wild) w.i = n[w.mesh]++;
    for (const [k, cnt] of Object.entries(n)) {
      if (!cnt) continue;
      const m = new THREE.InstancedMesh(k === 'bird' ? birdGeo() : k === 'heron' ? heronGeo() : beastGeo(), flat(), cnt);
      m.material.side = THREE.DoubleSide;
      m.castShadow = k !== 'bird';
      m.frustumCulled = false; // they move
      life[k] = m;
      scene.add(m);
    }
  };
  return {
    /** Rebuild when the model's nature or the look (lo = the Fast setting's shapes) changes; recolour when the fog changes. */
    sync(model, lo = false) {
      const L = model.land || {},
        items = L.nature || [],
        animals = L.wild || [],
        k = `${items.length}|${animals.length}|${items.length ? items[0].at.join(',') + items[items.length - 1].at.join(',') : ''}|${!!lo}`;
      low = !!lo;
      mat = low ? flat : shape => richMat(U, shape === 'palm' || shape === 'tuft');
      if (k !== key) {
        key = k;
        fogKey = null;
        build(items, animals);
      }
      const f = JSON.stringify(model.fog || null);
      if (f !== fogKey) {
        fogKey = f;
        recolor(model.fog);
      }
    },
    /** The animals' loops (birds circle, beasts amble round a small ring, the heron sways). */
    tick(dt, t) {
      U.t.value = t;
      for (const w of wild) {
        const m = life[w.mesh];
        if (!m) continue;
        let yaw = 0,
          y;
        if (w.mesh === 'heron') {
          y = heightAt(w.cx, w.cz);
          yaw = w.ph + 0.3 * Math.sin(t * 0.4 + w.ph);
          D.position.set(w.cx, y, w.cz);
          D.rotation.set(0.12 * Math.max(0, Math.sin(t * 0.7 + w.ph)), yaw, 0);
        } else {
          const om = (w.v * w.sp) / Math.max(1, w.R),
            a = w.ph + t * om;
          w.x = w.cx + Math.cos(a) * w.R;
          w.z = w.cz + Math.sin(a) * w.R;
          yaw = -a; // facing along the loop
          if (w.mesh === 'bird') {
            y = heightAt(w.cx, w.cz) + w.up + 1.5 * Math.sin(t * 0.8 + w.ph);
            D.position.set(w.x, y, w.z);
            D.rotation.set(0, yaw, 0.35 * Math.sin(t * 9 * w.sp + w.ph)); // a flap
          } else {
            y = heightAt(w.x, w.z);
            D.position.set(w.x, y, w.z);
            D.rotation.set(0, yaw, 0);
          }
        }
        D.scale.setScalar(w.s);
        D.updateMatrix();
        m.setMatrixAt(w.i, D.matrix);
      }
      for (const m of Object.values(life)) m.instanceMatrix.needsUpdate = true;
    },
    /** Instances drawn (QA). */
    count: () => Object.values(placed).reduce((n, l) => n + l.length, 0) + wild.length,
    dispose() {
      clear();
      shadowMat.dispose();
      placed = {};
      wild = [];
    }
  };
}
