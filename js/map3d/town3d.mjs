// The town layer of the 3D island: road ribbons, settlement lots (instanced) and landmarks, drawn from the model's land
// (roads, lots, landmarks) and fog only. Procedural shapes come from kit3d.mjs. Display only: no rules, no randoms.
//   createTown(scene, heightAt) → { sync(model), dispose() }
// The layout (roads + lots + landmarks) is rebuilt only when its JSON changes; the fog dimming is recoloured when the fog changes.
// Draw calls: 1 (roads) + 2 (box / gable fillers) + 1 (landmarks).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, FOG_DIM, FOG_SOFT } from './map3d.mjs';
import { KIT, buildLandmark, accentOf } from './kit3d.mjs';

const ROAD = {
    main: { w: 3.2, color: '#6d6e73' },
    street: { w: 2.4, color: '#85858a' },
    dirt: { w: 2.2, color: '#8f7a58' },
    path: { w: 0.9, color: '#b3a07a' }
  },
  LIFT = 0.15, // roads sit this far above the terrain (m)
  STEP = 3, // road sample spacing (m)
  FOOT = 1.2, // buildings are sunk this far into the ground (m)
  FOOTPRINT = 1.2; // a lot's side in metres = size (map units) × MAP_M × this

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const unit = i => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296; // a fixed hash in 0..1

export function createTown(scene, heightAt) {
  const group = new THREE.Group();
  scene.add(group);
  let layoutKey = null,
    fogKey = null,
    fogK = () => 1,
    roads = null, // { mesh, base }
    fill = [], // [{ mesh, base: Float32Array (rgb per instance), at: [x, z] per instance }]
    lm = null; // { mesh, base }

  const clear = () => {
    for (const o of [...group.children]) {
      group.remove(o);
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      if (o.material && !o.userData.shared) o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
    roads = lm = null;
    fill = [];
  };

  /** One vertex-coloured ribbon mesh for every road (width and colour by kind), following the slope. */
  const buildRoads = list => {
    const pos = [],
      col = [],
      idx = [];
    for (const r of list) {
      const spec = ROAD[r.kind] || ROAD.street,
        c = new THREE.Color(spec.color),
        [ax, ay] = r.pts[0],
        [bx, by] = r.pts[r.pts.length - 1],
        L = Math.hypot(bx - ax, by - ay) * MAP_M,
        n = Math.max(1, Math.ceil(L / STEP)),
        dx = (bx - ax) / (L / MAP_M || 1),
        dz = (by - ay) / (L / MAP_M || 1),
        hw = spec.w / 2,
        base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const x = (ax + ((bx - ax) * i) / n) * MAP_M,
          z = (ay + ((by - ay) * i) / n) * MAP_M;
        for (const s of [-1, 1]) {
          const px = x - dz * hw * s,
            pz = z + dx * hw * s;
          pos.push(px, heightAt(px, pz) + LIFT, pz);
          col.push(c.r, c.g, c.b);
        }
        if (i < n) {
          const a = base + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // faces must point up whichever way the road runs
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    m.receiveShadow = true;
    return { mesh: m, base: Float32Array.from(col) };
  };

  /** Filler lots as one InstancedMesh per base shape (kinds share a shape; colour and size vary per instance). */
  const buildFill = lots => {
    const byShape = new Map();
    lots.forEach((l, i) => {
      const k = KIT[l.kind];
      if (!k) return;
      const g = k.geo();
      if (!byShape.has(g)) byShape.set(g, { g, mat: k.mat, items: [] });
      byShape.get(g).items.push({ l, k, i });
    });
    const out = [],
      m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      col = new THREE.Color();
    for (const { g, mat, items } of byShape.values()) {
      const mesh = new THREE.InstancedMesh(g, mat, items.length),
        base = new Float32Array(items.length * 3),
        at = [];
      mesh.userData.shared = true; // the shape and material belong to the kit
      items.forEach(({ l, k, i }, j) => {
        const x = l.at[0] * MAP_M,
          z = l.at[1] * MAP_M,
          f = l.size * MAP_M * FOOTPRINT,
          h = k.scale[1] * (0.85 + 0.3 * unit(i * 3 + 1));
        q.setFromAxisAngle(up, -l.rot);
        m4.compose(new THREE.Vector3(x, heightAt(x, z) - FOOT, z), q, new THREE.Vector3(f * k.scale[0], h + FOOT, f * k.scale[2]));
        mesh.setMatrixAt(j, m4);
        col.set(k.colors[Math.floor(unit(i * 3 + 2) * k.colors.length)]).multiplyScalar(0.92 + 0.16 * unit(i * 3));
        base.set([col.r, col.g, col.b], j * 3);
        mesh.setColorAt(j, col);
        at.push([x, z]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      out.push({ mesh, base, at });
    }
    return out;
  };

  /** Every landmark merged into one vertex-coloured mesh; each faces its nearest road. */
  const buildLandmarks = (list, edges, tint) => {
    const geos = [],
      mat = new THREE.Matrix4(),
      segs = edges.map(r => r.pts);
    for (const L of list) {
      const [mx, my] = L.at,
        x = mx * MAP_M,
        z = my * MAP_M;
      let best = Infinity,
        yaw = 0;
      for (const [a, b] of segs) {
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          t = Math.min(1, Math.max(0, ((mx - a[0]) * dx + (my - a[1]) * dy) / (dx * dx + dy * dy || 1))),
          px = a[0] + dx * t - mx,
          py = a[1] + dy * t - my,
          d = Math.hypot(px, py);
        if (d < best) {
          best = d;
          yaw = d > 0.5 ? Math.atan2(px, py) : 0;
        }
      }
      const g = buildLandmark(L.kind, tint.get(L.region) || accentOf(L.region)),
        h = Math.min(heightAt(x - 3, z - 3), heightAt(x + 3, z - 3), heightAt(x - 3, z + 3), heightAt(x + 3, z + 3), heightAt(x, z));
      mat.makeRotationY(yaw).setPosition(x, h, z);
      g.applyMatrix4(mat);
      geos.push(g);
    }
    if (!geos.length) return null;
    const g = mergeGeometries(geos);
    for (const o of geos) o.dispose();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    return { mesh: m, base: g.attributes.color.array.slice() };
  };

  /** Dim by the fog like the terrain: base colour × k at each vertex / instance. */
  const recolour = () => {
    if (roads) {
      const a = roads.mesh.geometry.attributes,
        p = a.position.array,
        c = a.color;
      for (let i = 0; i < c.count; i++) {
        const k = fogK(p[i * 3], p[i * 3 + 2]);
        c.setXYZ(i, roads.base[i * 3] * k, roads.base[i * 3 + 1] * k, roads.base[i * 3 + 2] * k);
      }
      c.needsUpdate = true;
    }
    if (lm) {
      const a = lm.mesh.geometry.attributes,
        p = a.position.array,
        c = a.color;
      for (let i = 0; i < c.count; i++) {
        const k = fogK(p[i * 3], p[i * 3 + 2]);
        c.setXYZ(i, lm.base[i * 3] * k, lm.base[i * 3 + 1] * k, lm.base[i * 3 + 2] * k);
      }
      c.needsUpdate = true;
    }
    for (const f of fill) {
      const c = f.mesh.instanceColor;
      f.at.forEach(([x, z], j) => {
        const k = fogK(x, z);
        c.setXYZ(j, f.base[j * 3] * k, f.base[j * 3 + 1] * k, f.base[j * 3 + 2] * k);
      });
      c.needsUpdate = true;
    }
  };

  return {
    /** Bring the layer up to date with a model (reads model.land.roads / lots / landmarks and model.fog only). */
    sync(model) {
      const L = model.land,
        key = JSON.stringify([L.roads, L.lots, L.landmarks]);
      let dirty = false;
      if (key !== layoutKey) {
        layoutKey = key;
        clear();
        const tint = new Map(L.regions.map(r => [r.id, r.color]));
        roads = buildRoads(L.roads);
        fill = buildFill(L.lots);
        lm = buildLandmarks(L.landmarks, L.roads, tint);
        if (roads) group.add(roads.mesh);
        for (const f of fill) group.add(f.mesh);
        if (lm) group.add(lm.mesh);
        dirty = true;
      }
      const fk = JSON.stringify(model.fog);
      if (fk !== fogKey || dirty) {
        fogKey = fk;
        const f = model.fog,
          pts = f && f.points ? f.points.map(([x, y]) => [x * MAP_M, y * MAP_M]) : null,
          r = f ? f.r * MAP_M : 0;
        fogK = pts
          ? (x, z) => {
              let d = Infinity;
              for (const [px, pz] of pts) d = Math.min(d, Math.hypot(x - px, z - pz));
              return FOG_DIM + (1 - FOG_DIM) * (1 - smooth(r, r + FOG_SOFT, d));
            }
          : () => 1;
        recolour();
      }
    },
    dispose() {
      clear();
      scene.remove(group);
    }
  };
}
