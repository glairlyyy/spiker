// Nature on the 3D island (spec §4.19c, T-223): trees, rocks, bushes and grass from model.land.nature, and the few animals that
// loop on the map from model.land.wild (birds round the Peak, gulls over the harbor, a heron on the river, deer, dogs, a cat).
// Display only: placement is plain data from MapModel (string hashes, no randoms); one InstancedMesh per shape, low-poly,
// two or three vertex tones per shape × an instance tint (kind tone × shade × the fog's dimming).
//   createNature(scene, heightAt) → { sync(model), tick(dt, t), count(), dispose() }
// Draw calls: 9 (pine, broad, blossom, palm, rock, bush + tea, tuft + dune grass, bamboo, log) + 3 animals (bird, beast, heron).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, fogFactor } from './geo3d.mjs';
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
  log: () =>
    part(
      cyl(0.28, 0.32, 3.2, 6)
        .rotateZ(Math.PI / 2)
        .translate(0, 0.28, 0),
      '#8a7258'
    )
};
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
  log: { shape: 'log', tint: [1, 1, 1], size: 1 }
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

export function createNature(scene, heightAt) {
  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    meshes = {},
    D = new THREE.Object3D(),
    col = new THREE.Color();
  let key = null,
    fogKey = null,
    placed = {}, // shape → [{ x, z, tint: [r, g, b] }] in instance order
    wild = [], // { k, x, z, r, up, ph, sp, mesh, i }
    life = {};

  const clear = () => {
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
    for (const o of items) {
      const K = KIND[o.k];
      if (!K) continue;
      (placed[K.shape] = placed[K.shape] || []).push({ o, K, x: o.at[0] * MAP_M, z: o.at[1] * MAP_M, tint: K.tint.map(v => v * o.c) });
    }
    const q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      m4 = new THREE.Matrix4(),
      v = new THREE.Vector3(),
      sc = new THREE.Vector3();
    for (const [shape, list] of Object.entries(placed)) {
      const m = new THREE.InstancedMesh(SHAPE[shape](), mat(), list.length);
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
      const m = new THREE.InstancedMesh(k === 'bird' ? birdGeo() : k === 'heron' ? heronGeo() : beastGeo(), mat(), cnt);
      m.material.side = THREE.DoubleSide;
      m.castShadow = k !== 'bird';
      m.frustumCulled = false; // they move
      life[k] = m;
      scene.add(m);
    }
  };
  return {
    /** Rebuild when the model's nature changes; recolour when the fog changes. */
    sync(model) {
      const L = model.land || {},
        items = L.nature || [],
        animals = L.wild || [],
        k = `${items.length}|${animals.length}|${items.length ? items[0].at.join(',') + items[items.length - 1].at.join(',') : ''}`;
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
      placed = {};
      wild = [];
    }
  };
}
