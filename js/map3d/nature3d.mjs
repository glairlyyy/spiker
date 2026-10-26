// Nature on the 3D island (spec §4.19c, T-223): trees, rocks, bushes and grass from model.land.nature, and the few animals that
// loop on the map from model.land.wild (birds round the Peak, gulls over the harbor, a heron on the river, deer, dogs, a cat).
// Display only: placement is plain data from MapModel (string hashes, no randoms); one InstancedMesh per shape, low-poly,
// two or three vertex tones per shape × an instance tint (kind tone × shade × the fog's dimming).
//   createNature(scene, heightAt) → { sync(model), tick(dt, t), count(), dispose() }
// Draw calls: 10 (pine, broad, blossom, palm, rock + scrap, bush + tea + hedge, tuft + dune grass + reeds, bamboo, log, fence) + 3 animals
// (bird, beast, heron). The border rows (T-224) come in model.land.nature like the rest.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, fogFactor, lattice, hstr } from './geo3d.mjs';
import { part, box, mergeParts as merge } from './kit3d.mjs';
import { pack, repack } from './stream3d.mjs';
import { STREET_U } from './look3d.mjs';

/** Street level's far version (T-364): these shapes beyond the near blocks as their flat (Fast) shapes; the rest only near. */
const FAR = ['pine', 'broad', 'blossom', 'palm', 'bamboo'];

const cyl = (r0, r1, h, n = 5) => new THREE.CylinderGeometry(r0, r1, h, n, 1, true);
const cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n, 1, true);
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
      const r = 2.4 * (1 - i * 0.18),
        y0 = 1.6 + i * 1.25,
        ht = 2.9 - i * 0.25,
        g = new THREE.LatheGeometry(
          [
            new THREE.Vector2(r, y0 - 0.15),
            new THREE.Vector2(r * 0.62, y0 + ht * 0.28),
            new THREE.Vector2(r * 0.28, y0 + ht * 0.62),
            new THREE.Vector2(0.001, y0 + ht)
          ],
          8
        ).rotateY(i * 1.3);
      jit(g, 0.45, i);
      return tone(leafy(g, '#3a6a45', 1), (x, y) => (0.6 + 0.5 * Math.min(1, Math.max(0, (y - y0) / ht))) * (0.85 + 0.25 * (i / 4)));
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

/**
 * Wind (s → sway) and the leafy look for the detailed shapes: foliage sways by height and gets a soft 3D value-noise mottle.
 * Street level (T-372, × STREET_U.st: Auto / High only) adds `street`: grass bends from its root (`grass` m at the tip of a 0.6 m
 * blade, two gust waves), crowns sway more (`more`) and their leaves flutter (`leaf` m).
 */
const WIND = { speed: 1.3, amp: 0.035, gust: 0.35, street: { grass: 0.1, more: 0.8, leaf: 0.045 } };
const GRASSY = new Set(['tuft', 'reed', 'fern']);
const richMat = (U, double, shape) => {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    side: double ? THREE.DoubleSide : THREE.FrontSide
  });
  const W = WIND.street,
    grassy = GRASSY.has(shape);
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = U.t;
    sh.uniforms.uSw = STREET_U.st;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float leaf; uniform float uT, uSw; varying float vLeaf; varying vec3 vLp;'
      )
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
        ${
          grassy
            ? `float gb = uSw * ${W.grass.toFixed(3)} * pow(clamp(position.y / 0.6, 0.0, 1.6), 2.0);
        transformed.x += gb * (sin(ph * 1.7) + 0.5 * sin(ph * 3.1 + 1.3));
        transformed.z += gb * 0.6 * cos(ph * 1.3 + 0.4);`
            : `sw *= 1.0 + ${W.more.toFixed(2)} * uSw;
        transformed += uSw * leaf * ${W.leaf.toFixed(3)} * vec3(sin(uT * 3.3 + position.y * 2.1 + ip.x), 0.4 * sin(uT * 2.7 + position.x * 2.3), cos(uT * 3.0 + position.z * 1.9 + ip.z));`
        }
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
  m.customProgramCacheKey = () => (grassy ? 'nature-rich-grass' : 'nature-rich'); // (the same source text: the program by kind)
  return m;
};

/**
 * Street level's meadow (T-370): painted grass clumps (the detailed tuft) on open grass near you, hashed per MEADOW.cell lattice
 * point (no randoms) and cached per `tile` m (≤ `per` new tiles a frame); the instance set is rebuilt when you moved `step` m, those within `r` m, shrinking
 * over the last `edge` m. Density by the ground's grass weight over `min`. One instanced draw, no shadow; Auto / High only.
 */
export const MEADOW = {
  r: 30,
  edge: 7,
  cell: 1.15,
  tile: 16,
  step: 3,
  max: 3200,
  min: 0.35,
  keep: 64,
  per: 6,
  dense: 0.6,
  size: [0.45, 0.35]
};
/** A lattice point's 0–1 hashes (integer mix; display only). */
const lh = (i, j, s) => {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(s + 1, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/**
 * The meadow's clumps in tile (ti, tj): [x, z, yaw, size, r, g, b] each. grass(x, z) → 0–1, clear(x, z) → bool, colour(x, z, out).
 */
export function meadowTile(ti, tj, grass, clear, colour) {
  const M = MEADOW,
    n = Math.round(M.tile / M.cell),
    cs = M.tile / n, // (the cell fitted to the tile)
    out = [],
    c = [0, 0, 0];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const I = ti * n + i,
        J = tj * n + j,
        x = (I + 0.15 + 0.7 * lh(I, J, 1)) * cs,
        z = (J + 0.15 + 0.7 * lh(I, J, 2)) * cs,
        w = grass(x, z);
      if (w <= M.min || lh(I, J, 3) > ((w - M.min) / (1 - M.min)) * M.dense || !clear(x, z)) continue;
      colour(x, z, c);
      const v = 0.8 + 0.35 * lh(I, J, 5);
      out.push(x, z, lh(I, J, 4) * Math.PI * 2, M.size[0] + M.size[1] * lh(I, J, 6), c[0] * v * 1.15, c[1] * v * 1.1, c[2] * v * 0.9);
    }
  return out;
}
export function createNature(scene, heightAt, opts = {}) {
  const U = { t: { value: 0 } },
    shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
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
    life = {},
    ver = 0, // the build (streaming: a new one is prepared again)
    far = {}, // shape → its far version (street level, built on first need)
    blk = null; // { ver, by: shape → block → [instance] }
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const md = { mesh: null, tiles: new Map(), at: null, n: 0, ms: 0, k: 1 }; // street level's meadow (T-370)
  const meadowHide = () => {
    if (md.mesh) md.mesh.visible = false;
    md.at = null;
    md.n = 0;
  };
  /** Street level's meadow round you (world [x, z], avatar pos()) at street level st (shown at st ≥ 0.6, Auto / High); k × its reach. */
  const meadow = (you, st, k = 1) => {
    if (low || st < 0.6 || !you || !opts.grass || !opts.clear) return meadowHide();
    const M = MEADOW;
    if (k !== md.k) ((md.k = k), (md.at = null)); // (Auto's ladder: a nearer reach — look3d AUTO.reach)
    if (md.at && Math.hypot(you[0] - md.at[0], you[1] - md.at[1]) < M.step) return;
    const t0 = performance.now();
    if (!md.mesh) {
      md.mesh = new THREE.InstancedMesh(HI.tuft(), richMat(U, true, 'tuft'), M.max);
      md.mesh.setColorAt(0, col.setRGB(1, 1, 1));
      md.mesh.castShadow = false;
      md.mesh.receiveShadow = true;
      md.mesh.frustumCulled = false; // (its bounds = you ± r: always in front of the camera)
      md.mesh.userData.meadow = true;
      scene.add(md.mesh);
    }
    const m = md.mesh,
      R = M.r * md.k,
      t0i = Math.floor((you[0] - R) / M.tile),
      t1i = Math.floor((you[0] + R) / M.tile),
      t0j = Math.floor((you[1] - R) / M.tile),
      t1j = Math.floor((you[1] + R) / M.tile),
      cf = opts.colour || ((x, z, o) => ((o[0] = 0.4), (o[1] = 0.6), (o[2] = 0.3), o)),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      m4 = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      sc = new THREE.Vector3();
    let n = 0,
      fresh = 0; // tiles made this frame (≤ M.per: the rest next frame)
    for (let tj = t0j; tj <= t1j && n < M.max; tj++)
      for (let ti = t0i; ti <= t1i && n < M.max; ti++) {
        const k = `${ti},${tj}`;
        let T = md.tiles.get(k);
        if (!T) {
          if (fresh >= M.per) continue;
          fresh++;
          md.tiles.set(k, (T = meadowTile(ti, tj, opts.grass, opts.clear, cf)));
        }
        for (let a = 0; a < T.length && n < M.max; a += 7) {
          const x = T[a],
            z = T[a + 1],
            d = Math.hypot(x - you[0], z - you[1]);
          if (d > R) continue;
          const s = T[a + 3] * Math.min(1, (R - d) / M.edge);
          q.setFromAxisAngle(up, T[a + 2]);
          m4.compose(v.set(x, heightAt(x, z) - 0.05, z), q, sc.set(s, s, s));
          m.setMatrixAt(n, m4);
          m.setColorAt(n, col.setRGB(T[a + 4], T[a + 5], T[a + 6]));
          n++;
        }
      }
    for (const k of md.tiles.keys()) {
      const [i, j] = k.split(',').map(Number);
      if (Math.hypot((i + 0.5) * M.tile - you[0], (j + 0.5) * M.tile - you[1]) > R + M.keep) md.tiles.delete(k);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.visible = n > 0;
    md.at = fresh >= M.per ? null : [you[0], you[1]]; // (tiles still to make: again next frame)
    md.n = n;
    md.ms = +(performance.now() - t0).toFixed(2);
  };
  /** An instanced mesh's full instance colours (its packed-away set when streaming packed it). */
  const fullCol = m => (m.userData.pack && m.userData.pack.c) || (m.instanceColor && m.instanceColor.array);

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
    for (const m of Object.values(far)) (scene.remove(m), m.geometry.dispose(), m.dispose());
    far = {};
    blk = null;
    ver++;
    if (md.mesh) (scene.remove(md.mesh), md.mesh.geometry.dispose(), md.mesh.material.dispose(), md.mesh.dispose(), (md.mesh = null));
    md.tiles.clear();
    md.at = null;
  };
  /** Instance tints × the fog's dimming (unexplored land is dim, like the terrain). */
  const recolor = fog => {
    const k = fogFactor(fog);
    for (const [shape, items] of Object.entries(placed)) {
      const m = meshes[shape];
      repack(m, () => {
        items.forEach((o, i) => {
          const f = k(o.x, o.z);
          m.setColorAt(i, col.setRGB(o.tint[0] * f, o.tint[1] * f, o.tint[2] * f));
        });
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      });
      const F = far[shape];
      if (F) repack(F, () => (F.instanceColor.array.set(fullCol(m)), (F.instanceColor.needsUpdate = true)));
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
      // the detailed look: the shadow is cast by the Fast shape (drawn into the shadow map; in the view it writes nothing) —
      // a few percent of the triangles for the same silhouette at shadow-map resolution
      if (!low && m.castShadow) {
        const px = new THREE.InstancedMesh(SHAPE[shape](), shadowMat, list.length);
        px.instanceMatrix.copy(m.instanceMatrix);
        px.castShadow = true;
        px.receiveShadow = false;
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
      mat = low ? flat : shape => richMat(U, shape === 'palm' || shape === 'tuft', shape);
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
    /**
     * The streaming layer over block grid G (stream3d, T-364): a block's share = its instances per shape; shown = each shape's
     * mesh (and shadow proxy) draws only the near blocks' instances, packed to the front (draw calls unchanged); the trees (FAR)
     * beyond them stand as their flat shapes (+≤ 5 draw calls at street level only).
     */
    layer(G) {
      return {
        id: 'nature',
        ver: () => ver,
        prep(k) {
          if (!blk || blk.ver !== ver) {
            blk = { ver, by: {}, at: {} };
            for (const [shape, list] of Object.entries(placed)) blk.at[shape] = list.map(o => G.of(o.x, o.z));
            for (const shape of FAR) {
              const m = meshes[shape];
              if (!m || far[shape]) continue;
              const F = new THREE.InstancedMesh(SHAPE[shape](), farMat, m.userData.pack ? m.userData.pack.n : m.count);
              F.instanceMatrix.array.set(m.userData.pack ? m.userData.pack.m : m.instanceMatrix.array);
              F.setColorAt(0, col.setRGB(1, 1, 1));
              F.instanceColor.array.set(fullCol(m));
              F.receiveShadow = true;
              F.userData.far = true;
              F.visible = false;
              far[shape] = F;
              scene.add(F);
            }
          }
          for (const [shape, at] of Object.entries(blk.at)) {
            const by = (blk.by[shape] = blk.by[shape] || new Map()),
              out = [];
            at.forEach((b, i) => b === k && out.push(i));
            if (out.length) by.set(k, out);
          }
        },
        show(keys) {
          for (const [shape, m] of Object.entries(meshes)) {
            let list = null;
            if (keys) {
              list = [];
              const by = blk && blk.by[shape];
              if (by) for (const k of keys) for (const i of by.get(k) || []) list.push(i);
            }
            pack(m, list);
            if (shadows[shape]) pack(shadows[shape], list);
          }
          for (const [shape, F] of Object.entries(far)) {
            F.visible = !!keys;
            if (keys)
              pack(
                F,
                (blk.at[shape] || []).map((b, i) => (keys.has(b) ? -1 : i)).filter(i => i >= 0)
              );
          }
        }
      };
    },
    /** Street level's meadow round you (map3d each frame after the camera; T-370). */
    near: meadow,
    /** The meadow (QA): clumps shown, tiles cached, ms of the last rebuild. */
    meadowInfo: () => ({ on: !!(md.mesh && md.mesh.visible), n: md.n, tiles: md.tiles.size, ms: md.ms }),
    /** Instances drawn (QA). */
    count: () => Object.values(placed).reduce((n, l) => n + l.length, 0) + wild.length,
    dispose() {
      clear();
      shadowMat.dispose();
      farMat.dispose();
      placed = {};
      wild = [];
    }
  };
}
