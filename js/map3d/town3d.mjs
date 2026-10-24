// The town layer of the 3D island: road ribbons (the boardwalk planked, the overpass raised on pillars), settlement lots (instanced),
// landmarks and the Gloria wall, drawn from the model's land (roads, lots, landmarks, districts) and fog only. Procedural shapes
// come from kit3d.mjs. Display only: no rules, no randoms.
//   createTown(scene, heightAt, { fast }) → { sync(model), ring(cx, cz, k, on), ringInfo(), cut(box), count(), dispose() }
// The detail ring (street level, spec §4.37 6, T-336a): ring(camera x, z, street weight k, inside the district) builds the lots within
// RING.r of the camera with every face (the camera orbits there) and their ground-floor panes as rooms behind glass (kit3d
// interiorMat), plus kerbs, pavements, road markings and pavement props; the same lots are collapsed out of the map-look meshes
// while it shows. Rebuilt when the camera has moved RING.step from where it was built; hidden (the map look back) when k ≈ 0.
// The layout is rebuilt only when its JSON changes; the fog dimming is recoloured when the fog changes.
// Wealth (a lot's `wealth`, 0–1) tints each instance and, with `h`, stretches its height. Draw calls: 1 (roads) + 1 (overpass) + 1 (landmarks + walls)
// + the lots: the detailed look (spec §4.39, the default) 3 merged meshes — walls / props / street furniture, glass, pitched roofs
// (kit3d.mjs buildLot, streetProp); the Fast setting (G.gfx 'fast') today's 4 instanced shapes (box / gable / stepped / cylinder).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, smooth, fogFactor } from './geo3d.mjs';
import {
  KIT,
  accentOf,
  box,
  hip,
  FOOT,
  FOOTPRINT,
  unit,
  buildLot,
  mesher,
  detailMats,
  streetProp,
  interiorMat,
  RING_PROPS,
  rgb,
  lotFrame,
  landmarkYaw,
  mergeParts,
  LANDMARKS
} from './kit3d.mjs';
import { buildFacility } from './facility3d.mjs';

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
  WALL = { h: 2.4, t: 0.6, color: '#d9cdb8' }; // the Gloria wall (m)
/** The overpass (m); life3d drives its vans along the same deck. */
export const DECK = { up: 7, w: 5.4, thick: 0.9, rail: 0.8, ramp: 28, every: 20, step: 2 };

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

/**
 * The detail ring: r = its reach round the camera (m), step = how far the camera moves before a rebuild, show = the street weight
 * it appears at; kerb height, pavement width, trim (pavements stop short of a junction), dash / gap / line (the main roads' centre
 * line), zebra (crossings at main-road junctions: from, to m from the node), prop = pavement props every this many m.
 */
export const RING = {
  r: 150,
  step: 30,
  show: 0.02,
  kerb: 0.14,
  pave: 1.6,
  trim: 3.2,
  dash: 1.6,
  gap: 1.4,
  line: 0.12,
  zebra: [3.4, 6],
  prop: 9
};
const PAVE = '#b9b5ac',
  KERB = '#d6d2c8',
  PAINT = '#eeeae0';

/** Street furniture along the main roads (spec §4.39): a slot halfway between two lamps (kit3d STREET), its kind and side by hash. */
const PROPS = { every: 22, off: { bench: 2.7, bin: 2.6, stop: 3.4 } };

/**
 * The facilities' hover (spec §4.40): the hovered one lights up in the `ink` accent (css/theme.css --ink), easing in over `ms`.
 * Always-on rims (your club's HQ, your home, your match's venue; a seized / closed place greyed) take `rim` strength.
 */
export const HOVER = { ink: '#eef0f3', ms: 150, rim: 0.55, grey: '#7a7d84' };
/** The rim material's shared uniforms (one hover at a time on the island). */
const HU = { uHov: { value: -1 }, uHovK: { value: 0 }, uInk: { value: new THREE.Color(HOVER.ink) } };
/**
 * The name boards' lettering: one canvas atlas, a row per board (its text centred and fitted in a cell of the board's aspect, a
 * dark board with an accent stripe); texture.userData.uv[i] = [u0, v0, u1, v1]. Display only.
 */
function signAtlas(items) {
  const W = 1024,
    H = 96,
    cols = 2,
    cw = W / cols,
    rows = Math.ceil(items.length / cols),
    cv = document.createElement('canvas');
  cv.width = W;
  cv.height = Math.max(H, rows * H);
  const g = cv.getContext('2d'),
    uv = [];
  items.forEach(([text, color, aspect], i) => {
    const x0 = (i % cols) * cw,
      y0 = Math.floor(i / cols) * H,
      w = Math.min(cw, H * aspect),
      x = x0 + (cw - w) / 2;
    g.fillStyle = '#16181d';
    g.fillRect(x, y0, w, H);
    g.fillStyle = color || '#f5e6a8';
    g.fillRect(x, y0 + H - 10, w, 10);
    let fs = 54;
    g.font = `700 ${fs}px system-ui, sans-serif`;
    const t = String(text).toUpperCase();
    while (fs > 14 && g.measureText(t).width > w - 24) g.font = `700 ${(fs -= 2)}px system-ui, sans-serif`;
    g.fillStyle = '#f4f2ec';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, x + w / 2, y0 + (H - 10) / 2 + 2);
    uv.push([x / W, 1 - (y0 + H) / cv.height, (x + w) / W, 1 - y0 / cv.height]);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.uv = uv;
  return tex;
}

/** opts.fast() → true for the Fast graphics setting (default: the game's G.gfx); read at each sync. */
export function createTown(scene, heightAt, opts = {}) {
  const group = new THREE.Group(),
    fastOf = opts.fast || (() => typeof G !== 'undefined' && G.gfx === 'fast');
  scene.add(group);
  let layoutKey = null,
    fogKey = null,
    fogK = () => 1,
    vparts = [], // vertex-coloured meshes dimmed by the fog: [{ mesh, base }]
    fill = [], // [{ mesh, base: Float32Array (rgb per instance), at: [x, z] per instance }]
    det = null; // the detailed lots: { parts: [{ mesh, base, glow? }], at: [[x, z]], span: per part [start, end) vertex per item }

  const clear = () => {
    for (const o of [...group.children]) {
      group.remove(o);
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      if (o.userData.signs && o.material.map) o.material.map.dispose();
      if (o.material && !o.userData.shared && !o.material.userData.shared) o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
    signs = null;
    vparts = [];
    fill = [];
    det = null;
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

  /**
   * The detailed lots (spec §4.39): every building's walls, trims and props, its glass and its pitched roof from kit3d buildLot,
   * the street furniture along the main roads — merged into three meshes (walls, glass, roofs). Colours as the Fast instances
   * (kit palette × a hash, wealth tint); fog dimming per building (its centre), recoloured in place.
   */
  const buildDetail = (lots, roads) => {
    const M = { W: mesher({ wmask: 3 }), G: mesher({ glow: 3 }), R: mesher() },
      keys = ['W', 'G', 'R'],
      at = [],
      span = { W: [], G: [], R: [] },
      col = new THREE.Color(),
      open = () => keys.map(k => M[k].count()),
      ids = [], // the lot index behind each item (−1: a street prop)
      close = (x, z, s0, li = -1) => {
        at.push([x, z]);
        ids.push(li);
        keys.forEach((k, j) => span[k].push(s0[j], M[k].count()));
      };
    lots.forEach((l, i) => {
      const k = KIT[l.kind];
      if (!k) return;
      const x = l.at[0] * MAP_M,
        z = l.at[1] * MAP_M,
        s0 = open();
      col.set(k.colors[Math.floor(unit(i * 3 + 2) * k.colors.length)]).multiplyScalar(0.92 + 0.16 * unit(i * 3));
      wealthTint(col, l.wealth, unit(i * 3 + 5), k.rise);
      if (buildLot(M, l, i, heightAt(x, z), [col.r, col.g, col.b])) close(x, z, s0, i);
    });
    // benches and bins on the main roads, clear of the lots (a coarse bucket grid of their footprints; the bus stops are the real ones: vehicles3d, spec §4.42)
    const cell = 12,
      grid = new Map(),
      key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    lots.forEach(l => {
      const x = l.at[0] * MAP_M,
        z = l.at[1] * MAP_M,
        r = l.size * MAP_M * FOOTPRINT * 1.1;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const kk = key(x + a * cell, z + b * cell);
          if (!grid.has(kk)) grid.set(kk, []);
          grid.get(kk).push([x, z, r]);
        }
    });
    const free = (x, z) => !(grid.get(key(x, z)) || []).some(([a, b, r]) => Math.hypot(x - a, z - b) < r + 0.9);
    roads.forEach((r, ri) => {
      if (r.kind !== 'main') return;
      const [a, b] = r.pts.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        ux = (b[0] - a[0]) / (len || 1),
        uz = (b[1] - a[1]) / (len || 1);
      for (let d = PROPS.every, j = 0; d < len - 4; d += PROPS.every, j++) {
        const h = unit(ri * 977 + j * 31),
          kind = h < 0.5 ? 'bench' : h < 0.66 ? 'bin' : null;
        if (!kind) continue;
        const s = unit(ri * 977 + j * 31 + 1) < 0.5 ? 1 : -1,
          o = PROPS.off[kind] * s,
          x = a[0] + ux * d - uz * o,
          z = a[1] + uz * d + ux * o,
          y = heightAt(x, z);
        if (y < 0.2 || !free(x, z)) continue;
        const s0 = open();
        streetProp(M.W, kind, x, y, z, uz * s, -ux * s);
        if (kind === 'bench' && free(x + ux * 1.3, z + uz * 1.3))
          streetProp(M.W, 'bin', x + ux * 1.3, heightAt(x + ux * 1.3, z + uz * 1.3), z + uz * 1.3, uz * s, -ux * s);
        close(x, z, s0);
      }
    });
    const mats = detailMats(),
      parts = [];
    for (const [k, mat] of [
      ['W', mats.wall],
      ['G', mats.glass],
      ['R', mats.roof]
    ]) {
      const g = M[k].geometry();
      if (!g) {
        parts.push(null);
        continue;
      }
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = k !== 'G';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // spread over the whole island
      mesh.userData.town = k;
      parts.push({
        mesh,
        base: g.attributes.color.array.slice(),
        glow: g.attributes.glow ? g.attributes.glow.array.slice() : null,
        span: span[k]
      });
    }
    return { parts, at, ids };
  };
  /** A lot's wall colour (the kit palette × a hash, the wealth tint) — the same for the map look and the ring. */
  const lotColour = (l, i, k, col) => {
    col.set(k.colors[Math.floor(unit(i * 3 + 2) * k.colors.length)]).multiplyScalar(0.92 + 0.16 * unit(i * 3));
    return wealthTint(col, l.wealth, unit(i * 3 + 5), k.rise);
  };

  // ---- landmark cuts (town.cut, for the interiors) ----
  let lmPart = null,
    lmCut = null, // the cut applied (JSON)
    cutBoxes = null,
    facs = [], // the pickable facilities (buildLandmarks)
    facAt = new Map(), // id → index in facs
    signs = null,
    signKey = null,
    rimKey = null,
    hov = { id: null, k: 0 };
  const applyCut = () => {
    if (!lmPart || lmPart.mesh.geometry.index) return;
    const k = JSON.stringify(cutBoxes);
    if (k === lmCut) return;
    lmCut = k;
    const a = lmPart.mesh.geometry.attributes.position,
      arr = a.array;
    if (!lmPart.orig) lmPart.orig = arr.slice();
    arr.set(lmPart.orig);
    const B = cutBoxes || [],
      // an axis box { x0, x1, z0, z1 } or a turned one { cx, cz, c, s, hw, hd } (the lot's frame, T-362); y0 / y1 optional
      flat = (o, b) =>
        b.cx !== undefined
          ? Math.abs((arr[o] - b.cx) * b.c - (arr[o + 2] - b.cz) * b.s) <= b.hw &&
            Math.abs((arr[o] - b.cx) * b.s + (arr[o + 2] - b.cz) * b.c) <= b.hd
          : arr[o] >= b.x0 && arr[o] <= b.x1 && arr[o + 2] >= b.z0 && arr[o + 2] <= b.z1,
      within = (o, b) => flat(o, b) && (b.y0 === undefined || arr[o + 1] >= b.y0) && (b.y1 === undefined || arr[o + 1] <= b.y1);
    if (B.length)
      for (let t = 0; t < arr.length; t += 9)
        if (B.some(b => within(t, b) && within(t + 3, b) && within(t + 6, b))) for (let v = 3; v < 9; v++) arr[t + v] = arr[t + (v % 3)];
    a.needsUpdate = true;
  };

  // ---- the detail ring (T-336a) ----
  const ringG = new THREE.Group();
  ringG.visible = false;
  scene.add(ringG);
  let ringAt = null, // [x, z] the ring was built round
    ringLots = new Set(), // lot indices collapsed out of the map look now
    ringWant = new Set(), // … the ones the built ring draws
    ringN = { lots: 0, tris: 0, builds: 0, ms: 0 },
    lastModel = null;
  const ringClear = () => {
    for (const o of [...ringG.children]) {
      ringG.remove(o);
      o.geometry.dispose();
    }
  };
  /** Collapse (hide) / restore the map look's items for the lots in `want` (the detailed look's merged meshes; Fast: instance scale). */
  const baseHide = want => {
    if (det)
      for (const p of det.parts) {
        if (!p) continue;
        const a = p.mesh.geometry.attributes.position,
          arr = a.array;
        if (!p.orig) p.orig = arr.slice();
        let dirty = false;
        det.ids.forEach((li, j) => {
          if (li < 0) return;
          const h = want.has(li),
            was = ringLots.has(li);
          if (h === was) return;
          const v0 = p.span[j * 2] * 3,
            v1 = p.span[j * 2 + 1] * 3;
          if (v1 <= v0) return;
          if (h) for (let v = v0; v < v1; v++) arr[v] = p.orig[v0 + (v % 3)];
          else arr.set(p.orig.subarray(v0, v1), v0);
          dirty = true;
        });
        if (dirty) a.needsUpdate = true;
      }
    ringLots = want;
  };
  /** Kerbs, pavements, the main roads' centre dashes and zebra crossings, and pavement props, within the ring (into mesher W). */
  const ringGround = (W, roads, cx, cz, frames) => {
    const inLot = (x, z) =>
      frames.some(f => {
        const dx = x - f.x,
          dz = z - f.z,
          lx = dx * f.cs - dz * f.sn,
          lz = dx * f.sn + dz * f.cs;
        return Math.abs(lx) < f.w / 2 + 0.4 && Math.abs(lz) < f.d / 2 + 0.4;
      });
    const deg = new Map(),
      kk = p => `${Math.round(p[0])},${Math.round(p[1])}`;
    for (const r of roads)
      if (ROAD[r.kind] && r.kind !== 'boardwalk')
        for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) deg.set(kk(p), (deg.get(kk(p)) || 0) + 1);
    const pave = rgb(PAVE),
      kerb = rgb(KERB),
      paint = rgb(PAINT),
      flat = [0, 0, 0, 0, 0, 0, 0, 0],
      none = { wmask: [0, 0, 0] },
      R2 = (RING.r + 20) ** 2;
    roads.forEach((r, ri) => {
      if (r.kind !== 'main' && r.kind !== 'street') return;
      const spec = ROAD[r.kind],
        [a, b] = [r.pts[0], r.pts[r.pts.length - 1]].map(toM),
        L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1) return;
      const ux = (b[0] - a[0]) / L,
        uz = (b[1] - a[1]) / L,
        // nearest point of the segment to the camera: skip roads out of the ring
        t = Math.max(0, Math.min(L, (cx - a[0]) * ux + (cz - a[1]) * uz));
      if ((a[0] + ux * t - cx) ** 2 + (a[1] + uz * t - cz) ** 2 > R2) return;
      const hw = spec.w / 2,
        s0 = deg.get(kk(r.pts[0])) > 1 ? RING.trim : 0,
        s1 = L - (deg.get(kk(r.pts[r.pts.length - 1])) > 1 ? RING.trim : 0),
        at = (s, o, up) => {
          const x = a[0] + ux * s - uz * o,
            z = a[1] + uz * s + ux * o;
          return [x, heightAt(x, z) + LIFT + up, z];
        },
        n = Math.max(1, Math.ceil((s1 - s0) / STEP));
      for (const side of [1, -1])
        for (let j = 0; j < n && s1 > s0; j++) {
          const p = s0 + ((s1 - s0) * j) / n,
            q = s0 + ((s1 - s0) * (j + 1)) / n,
            i0 = side * hw,
            i1 = side * (hw + RING.pave),
            K = RING.kerb,
            // quads wound counter-clockwise from above / from the road side
            ord = (A, B, C, D) => (side > 0 ? [A, B, C, D] : [B, A, D, C]);
          W.quad(...ord(at(p, i1, K), at(q, i1, K), at(q, i0, K), at(p, i0, K)), pave, flat, none); // the pavement
          W.quad(...ord(at(p, i0, K), at(q, i0, K), at(q, i0, 0), at(p, i0, 0)), kerb, flat, none); // the kerb face
        }
      if (r.kind === 'main') {
        const hl = RING.line / 2;
        for (let s = s0 + 0.5; s + RING.dash < s1; s += RING.dash + RING.gap)
          W.quad(at(s, hl, 0.02), at(s + RING.dash, hl, 0.02), at(s + RING.dash, -hl, 0.02), at(s, -hl, 0.02), paint, flat, none);
        for (const [end, dir] of [
          [0, 1],
          [L, -1]
        ]) {
          if (!(deg.get(kk(end ? r.pts[r.pts.length - 1] : r.pts[0])) > 2)) continue;
          for (let o = -hw + 0.25; o + 0.4 <= hw - 0.15; o += 0.75) {
            const z0 = end + dir * RING.zebra[0],
              z1 = end + dir * RING.zebra[1],
              [sA, sB] = dir > 0 ? [z0, z1] : [z1, z0];
            W.quad(at(sA, o + 0.4, 0.025), at(sB, o + 0.4, 0.025), at(sB, o, 0.025), at(sA, o, 0.025), paint, flat, none);
          }
        }
      }
      // pavement props: by hash, on the pavement's outer half, clear of the ends
      for (let s = s0 + RING.prop / 2, j = 0; s < s1 - 1; s += RING.prop, j++) {
        const h = unit(ri * 389 + j * 17 + 5);
        if (h > 0.55) continue;
        const side = unit(ri * 389 + j * 17 + 6) < 0.5 ? 1 : -1,
          kind = RING_PROPS[Math.floor(h * 5.45) % RING_PROPS.length],
          o = side * (hw + RING.pave * 0.72),
          [x, y, z] = at(s, o, RING.kerb);
        if ((x - cx) ** 2 + (z - cz) ** 2 > R2 || inLot(x, z)) continue;
        streetProp(W, kind, x, y, z, uz * side, -ux * side);
      }
    });
  };
  /** Build the ring round world (cx, cz): its lots in full (every face, rooms behind the ground-floor glass), the ground detail. */
  const ringBuild = (m, cx, cz) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0,
      L = m.land,
      fast = !!fastOf(),
      R2 = RING.r * RING.r,
      want = new Set(),
      M = { W: mesher({ wmask: 3 }), G: mesher({ glow: 3 }), R: mesher(), I: mesher({ room: 4, tan: 3 }) },
      col = new THREE.Color(),
      frames = [];
    (L.lots || []).forEach((l, i) => {
      const k = KIT[l.kind];
      if (!k) return;
      const x = l.at[0] * MAP_M,
        z = l.at[1] * MAP_M;
      if ((x - cx) ** 2 + (z - cz) ** 2 > (RING.r + 20) ** 2) return;
      const f = lotFrame(l, i);
      if (f) frames.push(f);
      if (fast || (x - cx) ** 2 + (z - cz) ** 2 > R2) return;
      lotColour(l, i, k, col);
      if (buildLot(M, l, i, heightAt(x, z), [col.r, col.g, col.b], true)) want.add(i);
    });
    ringGround(M.W, L.roads || [], cx, cz, frames);
    ringClear();
    const mats = detailMats();
    let tris = 0;
    for (const [k, mat] of [
      ['W', mats.wall],
      ['G', mats.glass],
      ['R', mats.roof],
      ['I', interiorMat()]
    ]) {
      const g = M[k].geometry();
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = k === 'W' || k === 'R';
      mesh.receiveShadow = true;
      mesh.userData.ring = k;
      g.computeBoundingSphere();
      tris += g.attributes.position.count / 3;
      ringG.add(mesh);
    }
    baseHide(want);
    ringWant = want;
    ringAt = [cx, cz];
    ringN = {
      lots: want.size,
      tris,
      builds: ringN.builds + 1,
      ms: +((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(1)
    };
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

  /**
   * Every landmark — the facilities (spec §4.40: facility3d.mjs, on their own lots, `rot` = the door toward the place's point), the
   * venues, the ritual ground, the airport — and the Gloria wall, merged into one vertex-coloured mesh on the rim material: per vertex
   * `fid` (the index into `facs`, −1 for what can't be picked) and `rim` (an always-on rim, rgb + strength). facs[i] = { id, x, z,
   * yaw, w, d, h, base, v0, v1 (its vertex range), sign } (world m).
   */
  const buildLandmarks = (list, edges, tint, districts, fast) => {
    const geos = [],
      facs = [],
      mat = new THREE.Matrix4();
    let nv = 0;
    for (const L of list) {
      const x = L.at[0] * MAP_M,
        z = L.at[1] * MAP_M,
        yaw = landmarkYaw(L, edges),
        K = LANDMARKS[L.kind] || {},
        w = L.w || K.w || 6,
        d = L.d || K.d || 6,
        r = Math.min(w, d) * 0.45,
        acc = tint.get(L.region) || accentOf(L.region),
        { geo: g, sign } = buildFacility(L, acc, fast), // + its kit (spec §4.33)
        h = Math.min(heightAt(x - r, z - r), heightAt(x + r, z - r), heightAt(x - r, z + r), heightAt(x + r, z + r), heightAt(x, z));
      mat.makeRotationY(yaw).setPosition(x, h, z);
      g.applyMatrix4(mat);
      const n = g.attributes.position.count,
        pick = L.id !== 'ritual' && L.id !== 'airport';
      g.setAttribute('fid', new THREE.BufferAttribute(new Float32Array(n).fill(pick ? facs.length : -1), 1));
      if (pick)
        facs.push({ id: L.id, x, z, yaw, w, d, h: L.h || K.h || 6, base: h, v0: nv, v1: nv + n, sign: sign && { ...sign, color: acc } });
      nv += n;
      geos.push(g);
    }
    for (const g of wallParts(districts || [], edges)) {
      g.setAttribute('fid', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(-1), 1));
      geos.push(g);
    }
    if (!geos.length) return null;
    const g = mergeParts(geos);
    g.setAttribute('rim', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
    const m = new THREE.Mesh(g, rimMat());
    m.castShadow = m.receiveShadow = true;
    return { mesh: m, base: g.attributes.color.array.slice(), facs };
  };
  /** The landmarks' material: vertex colours, flat shaded, and the hover / always-on rims (fresnel + a lift; HOVER.ink). */
  const rimMat = () => {
    const M = stdMat({ roughness: 0.9, flatShading: true });
    M.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, HU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float fid; attribute vec4 rim; varying float vFid; varying vec4 vRim;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFid = fid; vRim = rim;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uHov; uniform float uHovK; uniform vec3 uInk; varying float vFid; varying vec4 vRim;'
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
            float hv = (vFid > -0.5 && abs(vFid - uHov) < 0.5) ? uHovK : 0.0;
            totalEmissiveRadiance += uInk * hv * (0.16 + 0.9 * fr) + vRim.rgb * vRim.a * (0.06 + 0.7 * fr);
          }`
        );
    };
    M.customProgramCacheKey = () => 'facility-rim';
    return M;
  };
  /** The name boards (spec §4.40): one quad per facility on the face of its sign block most toward the camera; the lettering is a
   *  canvas atlas (Fast: plain boards in the accent's dark). Rebuilt when the names change (a place found). */
  const buildSigns = (facs, names, fast) => {
    const list = facs.filter(f => f.sign && names[f.id]);
    if (!list.length) return null;
    const pos = [],
      uv = [],
      col = [],
      plates = list.map(f => {
        const S = f.sign,
          c = Math.cos(f.yaw),
          sn = Math.sin(f.yaw),
          // the block face whose world normal points most toward the camera (+z): local normal (nx, nz), its offset and half width
          faces = [
            [0, 1, S.hd, S.hw],
            [1, 0, S.hw, S.hd],
            [0, -1, S.hd, S.hw],
            [-1, 0, S.hw, S.hd]
          ],
          wz = q => -q[0] * sn + q[1] * c,
          [nx, nz, off, half] = faces.reduce((a, q) => (wz(q) > wz(a) ? q : a)),
          sw = Math.min(S.w, half * 2 * 0.92),
          sh = Math.min(S.h, sw / 2.2);
        return { f, S, c, sn, nx, nz, off, sw, sh };
      }),
      tex = !fast && typeof document !== 'undefined' ? signAtlas(plates.map(P => [names[P.f.id], P.S.color, P.sw / P.sh])) : null;
    plates.forEach(({ f, S, c, sn, nx, nz, off, sw, sh }, i) => {
      const tx = nz, // the board's right as you face it: local (nz, −nx)
        tz = -nx,
        cx = S.x + nx * (off + 0.08),
        cz = S.z + nz * (off + 0.08),
        Pw = (lx, ly, lz) => [f.x + lx * c + lz * sn, f.base + ly, f.z - lx * sn + lz * c],
        q = [
          [-sw / 2, -sh / 2],
          [sw / 2, -sh / 2],
          [sw / 2, sh / 2],
          [-sw / 2, sh / 2]
        ].map(([a, b]) => Pw(cx + tx * a, S.y + b, cz + tz * a)),
        R = tex ? tex.userData.uv[i] : [0, 0, 1, 1],
        U = [
          [R[0], R[1]],
          [R[2], R[1]],
          [R[2], R[3]],
          [R[0], R[3]]
        ],
        k = new THREE.Color(tex ? '#ffffff' : S.color || '#2a2d33');
      if (!tex) k.multiplyScalar(0.55);
      for (const j of [0, 1, 2, 0, 2, 3]) (pos.push(...q[j]), uv.push(...U[j]), col.push(k.r, k.g, k.b));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })
    );
    m.userData.signs = true;
    return m;
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
    if (det)
      for (const p of det.parts) {
        if (!p) continue;
        const a = p.mesh.geometry.attributes,
          c = a.color.array,
          g = a.glow && a.glow.array;
        det.at.forEach(([x, z], j) => {
          const k = fogK(x, z),
            kg = 0.4 + 0.6 * k; // lit windows still show in the dark you haven't explored, fainter (as the night layer)
          for (let v = p.span[j * 2] * 3, e = p.span[j * 2 + 1] * 3; v < e; v++) {
            c[v] = p.base[v] * k;
            if (g) g[v] = p.glow[v] * kg;
          }
        });
        a.color.needsUpdate = true;
        if (g) a.glow.needsUpdate = true;
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
      lastModel = model;
      const L = model.land,
        fast = !!fastOf(),
        key = JSON.stringify([L.roads, L.lots, L.landmarks.map(q => ({ ...q, name: undefined })), L.districts, fast]);
      let dirty = false;
      if (key !== layoutKey) {
        layoutKey = key;
        clear();
        ringLots = new Set(); // (the new map-look meshes show every lot)
        ringWant = new Set();
        ringAt = null;
        const tint = new Map(L.regions.map(r => [r.id, r.color])),
          roads = buildRoads(L.roads),
          over = buildOverpass(L.roads),
          lm = buildLandmarks(L.landmarks, L.roads, tint, L.districts, fast);
        if (fast) fill = buildFill(L.lots);
        else det = buildDetail(L.lots, L.roads);
        for (const v of [roads, over, lm]) if (v) (vparts.push(v), group.add(v.mesh));
        lmPart = lm;
        facs = lm ? lm.facs : [];
        facAt = new Map(facs.map((f, i) => [f.id, i]));
        signKey = rimKey = null;
        if (lm) lm.mesh.userData.landmarks = true;
        lmCut = null;
        if (cutBoxes) applyCut(); // (a cut asked for before this layout)
        for (const f of fill) group.add(f.mesh);
        if (det) for (const p of det.parts) if (p) group.add(p.mesh);
        dirty = true;
      }
      // the name boards: the places you know (model.land.landmarks[].name), rebuilt when that changes
      const names = Object.fromEntries(L.landmarks.filter(q => q.name).map(q => [q.id, q.name])),
        sk = JSON.stringify([names, fast]);
      if (sk !== signKey) {
        signKey = sk;
        if (signs)
          (group.remove(signs), signs.geometry.dispose(), signs.material.map && signs.material.map.dispose(), signs.material.dispose());
        signs = buildSigns(facs, names, fast);
        if (signs) group.add(signs);
      }
      const fk = JSON.stringify(model.fog);
      if (fk !== fogKey || dirty) {
        fogKey = fk;
        fogK = fogFactor(model.fog); // the same rule as the terrain (geo3d.mjs)
        recolour();
      }
    },
    /**
     * The detail ring round the camera at world (cx, cz): k = the street weight, on = your avatar inside the district. Shown while
     * k ≥ RING.show and on; rebuilt when the camera has moved RING.step from where it was built (or the layout changed).
     */
    ring(cx, cz, k, on) {
      const show = !!lastModel && on && k >= RING.show;
      if (show && (!ringAt || Math.hypot(cx - ringAt[0], cz - ringAt[1]) > RING.step)) ringBuild(lastModel, cx, cz);
      if (!show && ringG.visible) baseHide(new Set());
      if (show && !ringG.visible && ringAt) baseHide(ringWant);
      ringG.visible = show;
    },
    /**
     * The facility a world ray hits first (spec §4.40): each facility's lot as a turned box w × d × h (the building and its kit), the
     * nearest along the ray; `ok(id)` = may it be picked (a known place). → id or null.
     */
    pickRay(ray, ok = () => true) {
      let best = null,
        bt = Infinity;
      for (const f of facs) {
        if (!ok(f.id)) continue;
        const c = Math.cos(f.yaw),
          sn = Math.sin(f.yaw),
          ox = ray.origin.x - f.x,
          oz = ray.origin.z - f.z,
          // the ray in the lot's frame (lx = x c − z s, lz = x s + z c)
          o = [ox * c - oz * sn, ray.origin.y - f.base, ox * sn + oz * c],
          dv = [ray.direction.x * c - ray.direction.z * sn, ray.direction.y, ray.direction.x * sn + ray.direction.z * c],
          lo = [-f.w / 2, -0.5, -f.d / 2],
          hi = [f.w / 2, Math.max(2.5, f.h), f.d / 2];
        let t0 = 0,
          t1 = Infinity;
        for (let k = 0; k < 3 && t0 <= t1; k++) {
          if (Math.abs(dv[k]) < 1e-9) {
            if (o[k] < lo[k] || o[k] > hi[k]) t0 = Infinity;
            continue;
          }
          const a = (lo[k] - o[k]) / dv[k],
            b = (hi[k] - o[k]) / dv[k];
          t0 = Math.max(t0, Math.min(a, b));
          t1 = Math.min(t1, Math.max(a, b));
        }
        if (t0 <= t1 && t0 < bt) ((bt = t0), (best = f.id));
      }
      return best;
    },
    /** Light the facility `id` up (null: none); it eases in / out over HOVER.ms in tick. */
    hover(id) {
      if (id === hov.id) return;
      hov.id = id;
      hov.k = 0;
      HU.uHov.value = id != null && facAt.has(id) ? facAt.get(id) : -1;
    },
    /** The hover's ease (call each frame). */
    tick(dt) {
      const want = hov.id != null ? 1 : 0;
      hov.k += Math.sign(want - hov.k) * Math.min(Math.abs(want - hov.k), (dt * 1000) / HOVER.ms);
      HU.uHovK.value = hov.k;
    },
    /** The always-on rims: { id: [css colour, strength 0–1] } (your HQ, your home, your venue; a closed place greyed). */
    rims(map) {
      const k = JSON.stringify(map || {});
      if (!lmPart || k === rimKey) return;
      rimKey = k;
      const a = lmPart.mesh.geometry.attributes.rim,
        arr = a.array,
        col = new THREE.Color();
      arr.fill(0);
      for (const [id, [css, str]] of Object.entries(map || {})) {
        const f = facs[facAt.get(id)];
        if (!f) continue;
        col.set(css);
        for (let v = f.v0; v < f.v1; v++) arr.set([col.r, col.g, col.b, str], v * 4);
      }
      a.needsUpdate = true;
    },
    /** A facility's world box { x, z, yaw, w, d, h, base } (m), or null — its top centre anchors the place popup and the tag. */
    facility: id => (facAt.has(id) ? facs[facAt.get(id)] : null),
    /** The hovered facility now (QA): { id, k }. */
    hovered: () => ({ ...hov }),
    /** QA: the ring's counts { on, lots, tris, builds, ms (the last build) }. */
    ringInfo: () => ({ on: ringG.visible, ...ringN }),
    /**
     * Cut the landmarks (the hall you are near while its insides are built, T-336b / T-362): every landmark triangle wholly inside
     * a box is dropped (collapsed) — box = { x0, x1, z0, z1, y0?, y1? } or a turned { cx, cz, c, s, hw, hd, y0?, y1? } (world m; c / s
     * the lot's yaw), an array of them, or null to restore them all.
     */
    cut(box) {
      cutBoxes = box ? (Array.isArray(box) ? box : [box]) : null;
      applyCut();
    },
    /** The detailed look's counts (QA): buildings and props drawn, triangles per part; null in the Fast setting. */
    count: () =>
      det && {
        items: det.at.length,
        tris: det.parts.map(p => (p ? p.mesh.geometry.attributes.position.count / 3 : 0))
      },
    dispose() {
      clear();
      ringClear();
      scene.remove(ringG);
      scene.remove(group);
    }
  };
}
