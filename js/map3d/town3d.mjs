// The town layer of the 3D island: road ribbons (the boardwalk planked, the overpass raised on pillars), settlement lots (instanced),
// landmarks and the Gloria wall, drawn from the model's land (roads, lots, landmarks, districts) and fog only. Procedural shapes
// come from kit3d.mjs. Display only: no rules, no randoms.
//   createTown(scene, heightAt) → { sync(model), dispose() }
// The layout is rebuilt only when its JSON changes; the fog dimming is recoloured when the fog changes.
// Wealth (a lot's `wealth`, 0–1) tints each instance and, with `h`, stretches its height. Draw calls: 1 (roads) + 1 (overpass) + 4 (box / gable / stepped / cylinder fillers) + 1 (landmarks + walls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, smooth, fogFactor } from './geo3d.mjs';
import { KIT, buildLandmark, accentOf, box, hip } from './kit3d.mjs';

const ROAD = {
    main: { w: 3.2, color: '#6d6e73' },
    street: { w: 2.4, color: '#85858a' },
    dirt: { w: 2.2, color: '#8f7a58' },
    path: { w: 0.9, color: '#b3a07a' },
    boardwalk: { w: 2.6, color: '#9a7b52' }
  },
  LIFT = 0.15, // roads sit this far above the terrain (m)
  STEP = 3, // road sample spacing (m)
  PLANK = 0.9, // boardwalk plank length (m): planks alternate two tones
  FOOT = 1.2, // buildings are sunk this far into the ground (m)
  FOOTPRINT = 1.2, // a lot's side in metres = size (map units) × MAP_M × this
  WALL = { h: 2.4, t: 0.6, color: '#d9cdb8' }; // the Gloria wall (m)
/** The overpass (m); life3d drives its vans along the same deck. */
export const DECK = { up: 7, w: 5.4, thick: 0.9, rail: 0.8, ramp: 28, every: 20, step: 2 };

const unit = i => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296; // a fixed hash in 0..1
const toM = ([x, y]) => [x * MAP_M, y * MAP_M];

const GLASS = new THREE.Color('#8fbbe0'),
  STONE = new THREE.Color('#e4dfd0'),
  GOLD = new THREE.Color('#dcb458'),
  GREY = new THREE.Color('#77797d'),
  RUST = new THREE.Color('#8a5a40'),
  PATCH = new THREE.Color('#6e5a46');
/** A lot's wealth (0–1) tints its wall colour in place: rich = glass-blue (tall kinds) / clean stone / gold trim, poor = grey, rust, patched wood; the middle (Wu) stays as the kit's palette. */
const wealthTint = (c, w, u, rise) => {
  if (w === undefined) return c;
  const rich = smooth(0.55, 0.95, w),
    poor = 1 - smooth(0.05, 0.4, w);
  if (rich > 0) c.lerp(u < 0.25 ? GOLD : rise >= 0.7 ? GLASS : STONE, 0.6 * rich);
  if (poor > 0) c.lerp(u < 0.4 ? GREY : u < 0.7 ? RUST : PATCH, 0.55 * poor);
  return c.multiplyScalar(0.8 + 0.35 * w);
};

export function createTown(scene, heightAt) {
  const group = new THREE.Group();
  scene.add(group);
  let layoutKey = null,
    fogKey = null,
    fogK = () => 1,
    vparts = [], // vertex-coloured meshes dimmed by the fog: [{ mesh, base }]
    fill = []; // [{ mesh, base: Float32Array (rgb per instance), at: [x, z] per instance }]

  const clear = () => {
    for (const o of [...group.children]) {
      group.remove(o);
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      if (o.material && !o.userData.shared) o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
    vparts = [];
    fill = [];
  };
  const stdMat = extra => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, ...extra });
  /** A mesh from flat position / colour arrays (non-indexed triangles), normals computed. */
  const meshOf = (pos, col, material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return { mesh: m, base: Float32Array.from(col) };
  };

  /** One vertex-coloured mesh for every road (width and colour by kind), following the slope; the boardwalk is planked. */
  const buildRoads = list => {
    const pos = [],
      col = [],
      quad = (a, b, c, d, color) => {
        for (const v of [a, b, c, a, c, d]) pos.push(...v);
        for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
      };
    for (const r of list) {
      if (r.kind === 'overpass') continue;
      const spec = ROAD[r.kind] || ROAD.street,
        c = new THREE.Color(spec.color),
        c2 = new THREE.Color(spec.color).multiplyScalar(0.8),
        [ax, ay] = r.pts[0],
        [bx, by] = r.pts[r.pts.length - 1],
        L = Math.hypot(bx - ax, by - ay) * MAP_M,
        n = Math.max(1, Math.ceil(L / (r.kind === 'boardwalk' ? PLANK : STEP))),
        dx = (bx - ax) / (L / MAP_M || 1),
        dz = (by - ay) / (L / MAP_M || 1),
        hw = spec.w / 2,
        lift = r.kind === 'boardwalk' ? 0.3 : LIFT,
        edge = i => {
          const x = (ax + ((bx - ax) * i) / n) * MAP_M,
            z = (ay + ((by - ay) * i) / n) * MAP_M,
            p = s => [x - dz * hw * s, heightAt(x - dz * hw * s, z + dx * hw * s) + lift, z + dx * hw * s];
          return [p(-1), p(1)];
        };
      let prev = edge(0);
      for (let i = 1; i <= n; i++) {
        const cur = edge(i);
        quad(prev[0], prev[1], cur[1], cur[0], r.kind === 'boardwalk' && i % 2 ? c2 : c);
        prev = cur;
      }
    }
    if (!pos.length) return null;
    const out = meshOf(pos, col, stdMat({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    // faces must point up whichever way the road runs
    const nrm = out.mesh.geometry.attributes.normal;
    for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    return out;
  };

  /** The overpass: chains of its road edges become a deck (top, sides, rails) 7 m up on pillars every ~20 m, ramped to the ground at both ends. */
  const buildOverpass = list => {
    const edges = list.filter(r => r.kind === 'overpass').map(r => r.pts.map(toM)),
      chains = [];
    for (const [a, b] of edges) {
      const last = chains.length && chains[chains.length - 1];
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
      if (last && near(last[last.length - 1], a)) last.push(b);
      else if (last && near(last[last.length - 1], b)) last.push(a);
      else chains.push([a, b]);
    }
    const geos = [],
      pos = [],
      col = [],
      strip = (a, b, c, d, color) => {
        for (const v of [a, b, c, a, c, d]) pos.push(...v);
        const k = new THREE.Color(color);
        for (let i = 0; i < 6; i++) col.push(k.r, k.g, k.b);
      };
    for (const ch of chains) {
      const cum = [0];
      for (let i = 1; i < ch.length; i++) cum.push(cum[i - 1] + Math.hypot(ch[i][0] - ch[i - 1][0], ch[i][1] - ch[i - 1][1]));
      const L = cum[cum.length - 1],
        n = Math.max(2, Math.ceil(L / DECK.step)),
        at = s => {
          let i = 0;
          while (i < ch.length - 2 && s > cum[i + 1]) i++;
          const f = (s - cum[i]) / (cum[i + 1] - cum[i] || 1),
            dx = ch[i + 1][0] - ch[i][0],
            dz = ch[i + 1][1] - ch[i][1],
            l = Math.hypot(dx, dz) || 1;
          return { x: ch[i][0] + dx * f, z: ch[i][1] + dz * f, tx: dx / l, tz: dz / l };
        },
        up = s => DECK.up * smooth(0, DECK.ramp, s) * smooth(0, DECK.ramp, L - s),
        hw = DECK.w / 2;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * L,
          p = at(s),
          y = heightAt(p.x, p.z) + 0.25 + up(s),
          nx = -p.tz,
          nz = p.tx,
          V = (side, yy, inset = 0) => [p.x + nx * (hw - inset) * side, yy, p.z + nz * (hw - inset) * side],
          cur = {
            Lt: V(-1, y),
            Rt: V(1, y),
            Lb: V(-1, y - DECK.thick),
            Rb: V(1, y - DECK.thick),
            Lr: V(-1, y + DECK.rail),
            Rr: V(1, y + DECK.rail)
          };
        if (prev) {
          strip(prev.Lt, prev.Rt, cur.Rt, cur.Lt, '#4a4b50'); // the road surface
          strip(prev.Lb, cur.Lb, cur.Lt, prev.Lt, '#a29f96'); // the sides
          strip(prev.Rt, cur.Rt, cur.Rb, prev.Rb, '#a29f96');
          strip(prev.Rb, cur.Rb, cur.Lb, prev.Lb, '#7d7a72'); // the underside
          strip(prev.Lt, cur.Lt, cur.Lr, prev.Lr, '#cfc9bb'); // the rails
          strip(prev.Rt, prev.Rr, cur.Rr, cur.Rt, '#cfc9bb');
        }
        prev = cur;
        // a pillar (a column under a cap beam) every DECK.every metres, where the deck is well off the ground
        if (i > 0 && i < n && Math.round(s / DECK.step) % Math.round(DECK.every / DECK.step) === 0 && up(s) > 1.5) {
          const gy = heightAt(p.x, p.z),
            h = y - DECK.thick - gy,
            yaw = Math.atan2(p.tx, p.tz),
            parts = [box(1.3, h + 0.2, 1.3, 0, -0.2, 0, '#9a978f'), box(4.2, 0.8, 1.7, 0, h - 0.8, 0, '#8d8a82')];
          geos.push(...parts.map(g => g.rotateY(yaw).translate(p.x, gy, p.z)));
        }
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const merged = mergeGeometries([g, ...geos]);
    for (const o of [g, ...geos]) o.dispose();
    const m = new THREE.Mesh(merged, stdMat({ side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    return { mesh: m, base: merged.attributes.color.array.slice() };
  };

  /** Filler lots as one InstancedMesh per base shape (kinds share a shape; colour, size and height vary per instance). */
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
          h = k.scale[1] * (0.85 + 0.3 * unit(i * 3 + 1)) * (1 + 1.2 * (l.h || 0) * k.rise);
        q.setFromAxisAngle(up, -l.rot);
        m4.compose(new THREE.Vector3(x, heightAt(x, z) - FOOT, z), q, new THREE.Vector3(f * k.scale[0], h + FOOT, f * k.scale[2]));
        mesh.setMatrixAt(j, m4);
        col.set(k.colors[Math.floor(unit(i * 3 + 2) * k.colors.length)]).multiplyScalar(0.92 + 0.16 * unit(i * 3));
        wealthTint(col, l.wealth, unit(i * 3 + 5), k.rise);
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

  /** A wall ring round each walled district (compound style) with a gatehouse where a road crosses it. */
  const wallParts = (districts, roads) => {
    const out = [],
      segs = roads.map(r => r.pts.map(toM));
    for (const d of districts) {
      if (d.style !== 'compound') continue;
      const poly = d.poly.map(toM);
      let gate = -1,
        gateAt = null;
      poly.forEach((p, i) => {
        if (gate >= 0) return;
        const q = poly[(i + 1) % poly.length];
        for (const [a, b] of segs) {
          const den = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
          if (!den) continue;
          const t = ((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) / den,
            u = ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            gate = i;
            gateAt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            return;
          }
        }
      });
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length],
          yaw = Math.atan2(q[0] - p[0], q[1] - p[1]),
          len = Math.hypot(q[0] - p[0], q[1] - p[1]),
          y = Math.min(heightAt(p[0], p[1]), heightAt(q[0], q[1])) - 0.3;
        if (i === gate) {
          // the gatehouse: two towers under hip roofs and a lintel across the road
          for (const e of [p, q]) {
            const g = [box(2, 4.6, 2, 0, 0, 0, '#d8c8b8'), hip(2.8, 1.6, 2.8, 0, 4.6, 0, '#9c5a4a')];
            out.push(...g.map(o => o.translate(e[0], heightAt(e[0], e[1]) - 0.3, e[1])));
          }
          const mx = (p[0] + q[0]) / 2,
            mz = (p[1] + q[1]) / 2;
          out.push(
            box(len, 0.8, 1.1, 0, 3.8, 0, '#cbbba8')
              .rotateY(yaw - Math.PI / 2)
              .translate(mx, heightAt(gateAt[0], gateAt[1]) - 0.3, mz)
          );
          return;
        }
        out.push(
          box(WALL.t, WALL.h + 0.3, len, 0, 0, 0, WALL.color)
            .rotateY(yaw)
            .translate((p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2)
        );
      });
    }
    return out;
  };

  /** Every landmark (and the Gloria wall) merged into one vertex-coloured mesh; each landmark faces its nearest road (or its fixed `rot`). */
  const buildLandmarks = (list, edges, tint, districts) => {
    const geos = [],
      mat = new THREE.Matrix4(),
      segs = edges.filter(r => r.kind !== 'overpass').map(r => r.pts);
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
      if (L.rot != null) yaw = L.rot; // a fixed heading (the airport)
      const g = buildLandmark(L.kind, tint.get(L.region) || accentOf(L.region)),
        h = Math.min(heightAt(x - 3, z - 3), heightAt(x + 3, z - 3), heightAt(x - 3, z + 3), heightAt(x + 3, z + 3), heightAt(x, z));
      mat.makeRotationY(yaw).setPosition(x, h, z);
      g.applyMatrix4(mat);
      geos.push(g);
    }
    geos.push(...wallParts(districts || [], edges));
    if (!geos.length) return null;
    const g = mergeGeometries(geos);
    for (const o of geos) o.dispose();
    const m = new THREE.Mesh(g, stdMat({ roughness: 0.9, flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    return { mesh: m, base: g.attributes.color.array.slice() };
  };

  /** Dim by the fog like the terrain: base colour × k at each vertex / instance. */
  const recolour = () => {
    for (const v of vparts) {
      const a = v.mesh.geometry.attributes,
        p = a.position.array,
        c = a.color;
      for (let i = 0; i < c.count; i++) {
        const k = fogK(p[i * 3], p[i * 3 + 2]);
        c.setXYZ(i, v.base[i * 3] * k, v.base[i * 3 + 1] * k, v.base[i * 3 + 2] * k);
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
    /** Bring the layer up to date with a model (reads model.land roads / lots / landmarks / districts and model.fog only). */
    sync(model) {
      const L = model.land,
        key = JSON.stringify([L.roads, L.lots, L.landmarks, L.districts]);
      let dirty = false;
      if (key !== layoutKey) {
        layoutKey = key;
        clear();
        const tint = new Map(L.regions.map(r => [r.id, r.color])),
          roads = buildRoads(L.roads),
          over = buildOverpass(L.roads),
          lm = buildLandmarks(L.landmarks, L.roads, tint, L.districts);
        fill = buildFill(L.lots);
        for (const v of [roads, over, lm]) if (v) (vparts.push(v), group.add(v.mesh));
        for (const f of fill) group.add(f.mesh);
        dirty = true;
      }
      const fk = JSON.stringify(model.fog);
      if (fk !== fogKey || dirty) {
        fogKey = fk;
        fogK = fogFactor(model.fog); // the same rule as the terrain (geo3d.mjs)
        recolour();
      }
    },
    dispose() {
      clear();
      scene.remove(group);
    }
  };
}
