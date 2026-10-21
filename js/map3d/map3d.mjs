// The 3D island map (three.js). Draws a MapModel (see js/career/mapmodel.js) as low-poly terrain with water, a fixed
// tilted camera and pan / zoom, and reports clicks as map points.
//   create(onIdle) → { mount(el, model, on), update(model), select(id), dispose(), heightAt(x, z), info(), hexFill(on),
//                      setPhase(p), setLow(b), clock() }
// on = { pick(id), point([x, y]), hover?(id | null, clientX, clientY, going), person?(id) }: hover / person are the named figures
// (life3d pick; a click on one goes to person instead of point). The day clock (spec §4.37 2): model.time (MapModel.time) gives
// the week time of the waiting day and of the last action's walk and order; setPhase(p | () => p) tells the map which of
// 'idle' | 'walk' | 'order' is playing; the clock runs toward it (never back), the walk's share by how far the avatar has come
// along its road (so it holds while the avatar stands still), and sets the sun, the sky and the night lights.
// The player's avatar (avatar3d.mjs) stands at model.you.at and walks when it changes; the camera follows it.
// Units: map (x, y) → world (x·MAP_M, 0, y·MAP_M) metres (1 map unit = 0.5 m). One renderer and canvas live across
// re-mounts (the career screen re-creates its #mapwrap each render); the view (target, distance) survives them.
// Display only: no rules, no randoms (terrain noise is a fixed hash).
import * as THREE from 'three';
import { createAvatar } from './avatar3d.mjs';
import { createFurniture } from './pins3d.mjs';
import { createLife } from './life3d.mjs';
import { createTown } from './town3d.mjs';
import { createNature } from './nature3d.mjs';
import { createMapCam } from './mapcam3d.mjs';
import { KIT } from './kit3d.mjs';
import { MAP_M, clamp, lerp, smooth, fogFactor, inside, edgeDist, sideDist, hstr, ribbon, bannerArrays } from './geo3d.mjs';
export { inside, edgeDist, sideDist }; // (the polygon maths live in geo3d.mjs; tests import them from here too)

const CELL = 2, // terrain grid cell (m)
  BEACH = 12, // beach slope width (m)
  IDLE_S = 3, // canvas detached this long → release the renderer
  SHADOW_MAP = 2048, // sun shadow map size (px)
  SHADOW_BOX = 120; // half-size of the sun's shadow frustum around the view (m)

/** Fixed value noise: a hash of the lattice point, smoothly interpolated. */
const lattice = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const vnoise = (x, y) => {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    u = smooth(0, 1, x - xi),
    v = smooth(0, 1, y - yi);
  return lerp(lerp(lattice(xi, yi), lattice(xi + 1, yi), u), lerp(lattice(xi, yi + 1), lattice(xi + 1, yi + 1), u), v);
};
/** Ground tint per district style (blended in faintly: no extra draw call). */
const DISTRICT_TINT = {
  city: '#8c8f96',
  oldtown: '#8d7d68',
  compound: '#c4b2d0',
  shacks: '#7e6c58',
  campus: '#86b866',
  terrace: '#8a7b5c',
  fishing: '#9a9172',
  works: '#7f7f84'
};
/**
 * Ground use (spec §4.19a, model.land.ground): two tones and a band width (m) per kind; `contour` bands follow the height (terraces),
 * else straight bands at a hashed angle (fields); water is also flattened into a lake.
 */
const GROUND_TINT = {
  terrace: { a: '#7f9a4a', b: '#68843f', band: 1.1, contour: true, step: 1.8 },
  paddy: { a: '#79a77c', b: '#5f9470', band: 0.9, contour: true, step: 1.2 },
  field: { a: '#b2ab5e', b: '#8fa04e', band: 5 },
  park: { a: '#4f9a48', b: '#56a24e', band: 9 },
  yard: { a: '#8d8c86', b: '#85847e', band: 7 },
  quay: { a: '#a19e95', b: '#98958c', band: 6 },
  water: { a: '#3f7f95', b: '#3f7f95', band: 9 },
  quarry: { a: '#b6b0a2', b: '#a29c8e', band: 1.6, contour: true, step: 2.5, dig: 3 }
};
/** The island's height grid and vertex colours (world metres), from the model's land. */
function buildTerrain(model) {
  const L = model.land,
    W = model.w * MAP_M,
    D = model.h * MAP_M,
    nx = Math.ceil(W / CELL),
    nz = Math.ceil(D / CELL),
    sx = W / nx,
    sz = D / nz,
    w = poly => poly.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
    coast = w(L.coast),
    shu = w((L.regions.find(r => r.id === 'shu') || { poly: [] }).poly),
    // the highlands' flat ground (spec §4.19b): facilities, HQs, venues, homes and villages sit on level pads cut into the slope
    pads = (L.pads || []).map(q => ({ x: q.at[0] * MAP_M, z: q.at[1] * MAP_M, r: q.r * MAP_M, b: (q.blend || 10) * MAP_M, h: 0 })),
    river = L.relief ? L.relief.river : null,
    wu = w((L.regions.find(r => r.id === 'wu') || { poly: [] }).poly),
    dunes = L.dunes ? w(L.dunes) : [],
    dist = L.districts ? L.districts.map(d => ({ poly: w(d.poly), tint: DISTRICT_TINT[d.style] })).filter(d => d.tint) : [],
    grounds = (L.ground || [])
      .filter(g => GROUND_TINT[g.kind])
      .map(g => {
        const poly = w(g.poly),
          xs = poly.map(p => p[0]),
          zs = poly.map(p => p[1]),
          t = GROUND_TINT[g.kind],
          ang = hstr(`${g.id}|g`) * Math.PI;
        return {
          ...t,
          kind: g.kind,
          poly,
          hole: g.hole ? w(g.hole) : null,
          box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
          ca: Math.cos(ang),
          sa: Math.sin(ang),
          A: new THREE.Color(t.a),
          B: new THREE.Color(t.b)
        };
      }),
    // biome ground (spec §4.19d, T-224): each region's neutral palette, cross-faded over BIOME.fade m at its edges
    BIO = L.bioPal || {},
    fadeM = (BIO.fade || 50) / 2,
    fadeN = (BIO.fadeMinor || 18) / 2,
    biomes = (L.biomes || []).map(b => ({
      ...b,
      poly: b.poly ? w(b.poly) : null,
      x: (b.x || 0) * MAP_M,
      z: (b.y || 0) * MAP_M,
      rx: (b.rx || 1) * MAP_M,
      rz: (b.ry || 1) * MAP_M,
      ca: Math.cos((-(b.rot || 0) * Math.PI) / 180),
      sa: Math.sin((-(b.rot || 0) * Math.PI) / 180),
      A: new THREE.Color(b.pal.a),
      B: new THREE.Color(b.pal.b),
      R: b.pal.rockC ? new THREE.Color(b.pal.rockC) : null
    })),
    majors = biomes.filter(b => b.poly),
    minorsB = biomes.filter(b => !b.poly),
    gravelLine = ((L.borders || []).find(b => b.kind === 'shuWei') || { pts: [] }).pts.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
    gravelC = new THREE.Color(BIO.gravel || '#a39a86'),
    bankC = new THREE.Color(BIO.bank || '#c2b58f'),
    bc = new THREE.Color(),
    /** A biome's own colour at (x, z, height h): its two tones in soft patches; Shu climbs to rock grey. */
    bioCol = (b, x, z, h, out) => {
      const n = vnoise(x / (b.pal.patch || 20) + b.x, z / (b.pal.patch || 20));
      out.copy(b.A).lerp(b.B, b.id === 'wei' ? smooth(0.42, 0.58, n) : n);
      if (b.R) out.lerp(b.R, smooth(b.pal.rock[0], b.pal.rock[1], h));
      return out;
    },
    /** The ground colour from the biomes: majors weighted by a smoothstep across their edges, then the minors on top. */
    biomeAt = (x, z, h, out) => {
      let sum = 0,
        best = null,
        bestD = -Infinity;
      out.setRGB(0, 0, 0);
      for (const b of majors) {
        const sd = inside(x, z, b.poly) ? edgeDist(x, z, b.poly) : -edgeDist(x, z, b.poly),
          wgt = smooth(-fadeM, fadeM, sd);
        if (sd > bestD) ((bestD = sd), (best = b));
        if (wgt <= 0) continue;
        bioCol(b, x, z, h, bc);
        out.r += bc.r * wgt;
        out.g += bc.g * wgt;
        out.b += bc.b * wgt;
        sum += wgt;
      }
      if (sum > 0) out.multiplyScalar(1 / sum);
      else if (best) bioCol(best, x, z, h, out);
      for (const b of minorsB) {
        const dx = x - b.x,
          dz = z - b.z,
          u = dx * b.ca - dz * b.sa,
          v = dx * b.sa + dz * b.ca,
          sd = (1 - Math.hypot(u / b.rx, v / b.rz)) * Math.min(b.rx, b.rz),
          wgt = smooth(-fadeN, fadeN, sd);
        if (wgt > 0) out.lerp(bioCol(b, x, z, h, bc), wgt);
      }
      return out;
    },
    lakes = [], // vertex indices in each water patch: flattened after the heights are known
    pos = new Float32Array((nx + 1) * (nz + 1) * 3),
    col = new Float32Array((nx + 1) * (nz + 1) * 3),
    H = new Float32Array((nx + 1) * (nz + 1)),
    grass = new THREE.Color(0x5d8a4a),
    rock = new THREE.Color(0x7d7a70),
    sand = new THREE.Color(0xd8c690),
    seabed = new THREE.Color(0x2b5f6e),
    tintC = new THREE.Color(),
    riverC = new THREE.Color(0x3f7f95),
    c = new THREE.Color(),
    /** Land height (m) off the beach: the low plateau, Shu's rough upland, the designed highlands (reliefAt) with some roughness. */
    landH = (x, z, d) => {
      let base = 0.6;
      if (shu.length) {
        const ds = inside(x, z, shu) ? edgeDist(x, z, shu) : 0,
          n = 0.6 * vnoise(x / 40, z / 40) + 0.4 * vnoise(x / 15, z / 15);
        base += (3 + 4 * n) * smooth(0, 20, ds);
      }
      if (typeof reliefAt === 'function') {
        const p = [x / MAP_M, z / MAP_M],
          rel = reliefAt(p);
        if (rel > 0) base += rel * (0.88 + 0.24 * vnoise(x / 22, z / 22));
        if (river) base -= Math.min(base - 0.3, 3 * Math.exp(-((lineDist(p, river.line).d / river.w) ** 2))); // the valley floor
      }
      return base * smooth(0, BEACH, d);
    };
  for (const q of pads) q.h = landH(q.x, q.z, edgeDist(q.x, q.z, coast));
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = i * sx,
        z = j * sz,
        k = j * (nx + 1) + i,
        land = inside(x, z, coast),
        d = edgeDist(x, z, coast);
      // the Wu sand: between the dune line and the coast, wide and flat with a low dune ridge on the line
      const sd0 = land && dunes.length && inside(x, z, wu) ? sideDist(x, z, dunes) : -99,
        sd = sd0 > 45 ? -99 : sd0, // (far seaward of the line = the corner past its ends: not sand)
        sand_ = sd > 0;
      let h;
      if (!land) h = -0.4 * Math.min(d, 10);
      else if (sand_ || (sd > -12 && sd <= 0)) {
        const flat = sand_ ? 0.45 * smooth(0, 5, d) : 0.6 * smooth(0, BEACH, d);
        h = flat + 0.9 * Math.exp(-((sd / 5) ** 2));
      } else {
        h = landH(x, z, d);
        for (const q of pads) {
          const dq = Math.hypot(x - q.x, z - q.z);
          if (dq < q.r + q.b) h = lerp(h, q.h, 1 - smooth(q.r, q.r + q.b, dq));
        }
        // terraces and paddies step down the slope in shelves; the quarry is cut in benches
        for (const q of grounds) {
          if (
            !q.step ||
            x < q.box[0] ||
            z < q.box[1] ||
            x > q.box[2] ||
            z > q.box[3] ||
            !inside(x, z, q.poly) ||
            (q.hole && inside(x, z, q.hole))
          )
            continue;
          h = lerp(h, Math.floor(h / q.step) * q.step - (q.dig || 0), 0.85);
        }
      }
      H[k] = h;
      pos.set([x, h, z], k * 3);
      // colour: grass → rock with height, sand on the beach (no faction colour: the hex tiles carry it, spec §4.27)
      if (!land) c.copy(seabed);
      else {
        if (biomes.length) biomeAt(x, z, h, c);
        else c.copy(grass).lerp(rock, smooth(8, 20, h));
        if (gravelLine.length > 1)
          c.lerp(gravelC, 0.8 * (1 - smooth((BIO.gravelW || 4) / 2, (BIO.gravelW || 4) / 2 + 1.5, Math.abs(sideDist(x, z, gravelLine)))));
        c.lerp(sand, 1 - smooth(1, BEACH, d));
        if (sd > -99) c.lerp(sand, 0.95 * smooth(-3, 2, sd)); // the Wu sand
        if (river && typeof lineDist === 'function') {
          const rd = lineDist([x / MAP_M, z / MAP_M], river.line).d / river.w;
          if (rd < 0.22)
            c.lerp(riverC, 0.85); // the river off the Peak
          else c.lerp(bankC, 0.75 * (1 - smooth(0.22 + (BIO.bankW || 0.5) * 0.6, 0.22 + (BIO.bankW || 0.5), rd))); // its sand / pebble banks
        }
        for (const q of dist) if (inside(x, z, q.poly)) c.lerp(tintC.set(q.tint), 0.16);
        for (const q of grounds) {
          if (x < q.box[0] || z < q.box[1] || x > q.box[2] || z > q.box[3] || !inside(x, z, q.poly) || (q.hole && inside(x, z, q.hole)))
            continue;
          const v = q.contour ? h : x * q.ca + z * q.sa;
          c.lerp(Math.floor(v / q.band) % 2 ? q.B : q.A, 0.75);
          if (q.kind === 'water') (lakes[grounds.indexOf(q)] = lakes[grounds.indexOf(q)] || []).push(k);
        }
      }
      col.set([c.r, c.g, c.b], k * 3);
    }
  // a lake: its patch sinks to just under its lowest shore, so the water reads level on a slope
  for (const ks of lakes) {
    if (!ks) continue;
    const lvl = Math.min(...ks.map(k => H[k])) - 0.4;
    for (const k of ks) {
      H[k] = lvl;
      pos[k * 3 + 1] = lvl;
    }
  }
  const idx = new Uint32Array(nx * nz * 6);
  let n = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        d = a + nx + 1,
        e = d + 1;
      idx.set([a, d, b, b, d, e], n);
      n += 6;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const heightAt = (x, z) => {
    const fx = clamp(x / sx, 0, nx - 0.001),
      fz = clamp(z / sz, 0, nz - 0.001),
      i = Math.floor(fx),
      j = Math.floor(fz),
      u = fx - i,
      v = fz - j,
      g = (a, b) => H[b * (nx + 1) + a];
    return lerp(lerp(g(i, j), g(i + 1, j), u), lerp(g(i, j + 1), g(i + 1, j + 1), u), v);
  };
  return { geo, heightAt, W, D, base: col.slice() };
}

/** Renderer settings, sky, hemisphere light, the sun with its shadow, and the sea. */
function lightScene(renderer, scene) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color(0x0b1d2c);
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(sun.shadow.camera, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: 500 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x1d5f8f, specular: 0x9bc4e0, shininess: 90, transparent: true, opacity: 0.92 })
  );
  scene.add(water);
  return { sun, hemi, water };
}
/**
 * The light at time of day `tod` (0–1) from the clock's keys (model.time.keys, wrapping round midnight), written into the
 * sun, the hemisphere and the background; the sun's direction from the hour (east at dawn, south and high at noon, west at
 * dusk; the moon high in the south-west at night). Returns `lit` (0–1: how far the night lights are on). Reuses its colours.
 */
const SKY = { a: new THREE.Color(), b: new THREE.Color(), dir: new THREE.Vector3(), moon: new THREE.Vector3(-0.5, 1, 0.6).normalize() };
function skyAt(keys, tod, sun, hemi, scene) {
  let i = keys.findIndex(k => k.t > tod);
  if (i < 0) i = keys.length;
  const A = keys[(i - 1 + keys.length) % keys.length],
    B = keys[i % keys.length],
    span = (B.t - A.t + 1) % 1 || 1,
    u = ((tod - A.t + 1) % 1) / span,
    mix = (k, out) => out.set(A[k]).lerp(SKY.b.set(B[k]), u),
    num = k => A[k] + (B[k] - A[k]) * u;
  mix('sun', sun.color);
  sun.intensity = num('sunI');
  mix('sky', hemi.color);
  mix('ground', hemi.groundColor);
  hemi.intensity = num('hemi');
  mix('bg', scene.background);
  const lit = num('lit'),
    a = clamp((tod - 0.22) / 0.62, 0, 1) * Math.PI;
  SKY.dir
    .set(1.25 * Math.cos(a) + 0.54 * Math.sin(a), 0.2 + 0.8 * Math.sin(a), 0.05 + 0.3 * Math.sin(a))
    .normalize()
    .lerp(SKY.moon, smooth(0.3, 0.9, lit))
    .normalize();
  return lit;
}
/**
 * The night lights (spec §4.37 2, T-332): warm windows on the town's lots (the faces toward the camera; KIT heights as
 * town3d.mjs builds them), street lamps along the main roads and streets, floodlights over the explored courts and the
 * venues (model.floods) — one Points mesh of round glows (size per point in metres, kept 2.5–40 px on screen) and one
 * InstancedMesh of light pools on the ground (vertex-coloured discs, additive). Both fade with `lit` and are not drawn by
 * day. Dimmed in the fog like the town. Rebuilt when the lots, roads, courts, fog or the setting change. Low (the Fast
 * setting): a third of the windows, no lamp pools. 2 draw calls at night, none by day.
 */
const NIGHT = {
  win: { every: 2.8, col: 2.4, lit: 0.42, size: 1.3, cap: 6000, colors: ['#ffd38a', '#ffe7b0', '#ffc070', '#d8e4ff'] },
  dark: ['tank', 'stack', 'shed', 'barn', 'container', 'warehouse', 'plant', 'depot'],
  lamp: {
    kinds: ['main', 'street', 'boardwalk'],
    every: 22,
    up: 4.5,
    side: 2.4,
    size: 1.8,
    pool: 3.5,
    cap: 900,
    color: '#ffd9a0',
    poolColor: '#ff9f45'
  },
  flood: { up: 11, dx: 14, dz: 9, size: 3.2, pool: 22, color: '#f2f6ff' },
  FOOTPRINT: 1.2 // (town3d.mjs: a lot's side in metres = size × MAP_M × this)
};
const unitHash = i => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296; // town3d.mjs's fixed hash (the same lot heights)
function nightLayer(scene, heightAt) {
  const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { lit: { value: 0 }, scale: { value: 1000 }, pr: { value: 1 } },
      vertexShader: `attribute float size; attribute vec3 glow; varying vec3 vC; uniform float scale; uniform float pr;
        void main() { vC = glow; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * scale / -mv.z, 2.5 * pr, 40.0 * pr); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; uniform float lit;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vC * lit * (1.0 - r * r), 1.0); }`
    }),
    disc = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
    rim = new Float32Array(disc.attributes.position.count * 3);
  rim.fill(0);
  rim.set([1, 1, 1], 0); // the centre vertex lit, the rim dark: a soft pool under additive blending
  disc.setAttribute('color', new THREE.BufferAttribute(rim, 3));
  const poolMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  let pts = null,
    pools = null,
    key = null,
    n = { win: 0, lamp: 0, flood: 0 };
  const clear = () => {
    for (const o of [pts, pools]) if (o) (scene.remove(o), o.geometry !== disc && o.geometry.dispose(), o.dispose && o.dispose());
    pts = pools = null;
  };
  const build = (m, low) => {
    clear();
    const pos = [],
      glow = [],
      size = [],
      pool = [], // [x, y, z, r, color]
      c = new THREE.Color(),
      fog = fogFactor(m.fog),
      add = (x, y, z, s, color, dim = 1) => {
        c.set(color).multiplyScalar(dim);
        pos.push(x, y, z);
        glow.push(c.r, c.g, c.b);
        size.push(s);
      };
    n = { win: 0, lamp: 0, flood: 0 };
    const W = NIGHT.win,
      cap = low ? W.cap / 3 : W.cap;
    // windows: the faces whose outward side looks toward the camera (+z), floors every W.every m, a few lit per floor
    (m.land.lots || []).forEach((l, i) => {
      const k = KIT[l.kind];
      if (!k || n.win >= cap || (low && unitHash(i * 7 + 3) > 0.34)) return;
      const x0 = l.at[0] * MAP_M,
        z0 = l.at[1] * MAP_M,
        f = l.size * MAP_M * NIGHT.FOOTPRINT,
        h = k.scale[1] * (0.85 + 0.3 * unitHash(i * 3 + 1)) * (1 + 1.2 * (l.h || 0) * k.rise),
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
            const hh = unitHash(i * 131 + j * 17 + q * 5 + (nx + 2) * 3 + nz);
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
    // street lamps along the main roads and streets (alternating sides), with a pool of light under each
    const L = NIGHT.lamp;
    for (const r of m.land.roads || []) {
      if (!L.kinds.includes(r.kind) || n.lamp >= L.cap) continue;
      const [a, b] = r.pts.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        ux = (b[0] - a[0]) / (len || 1),
        uz = (b[1] - a[1]) / (len || 1);
      for (let d = L.every / 2, j = 0; d < len && n.lamp < L.cap; d += L.every, j++) {
        const sd = j % 2 ? L.side : -L.side,
          x = a[0] + ux * d - uz * sd,
          z = a[1] + uz * d + ux * sd,
          y = heightAt(x, z),
          dim = 0.4 + 0.6 * fog(x, z);
        add(x, y + L.up, z, L.size, L.color, dim);
        if (!low) pool.push([x, y + 0.25, z, L.pool, dim * 0.35, L.poolColor]);
        n.lamp++;
      }
    }
    // floodlights: four towers round each court, a pool over the court
    const F = NIGHT.flood;
    for (const at of m.floods || []) {
      const x = at[0] * MAP_M,
        z = at[1] * MAP_M,
        y = heightAt(x, z),
        dim = 0.4 + 0.6 * fog(x, z);
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ])
        add(x + sx * F.dx, y + F.up, z + sz * F.dz, F.size, F.color, dim);
      pool.push([x, y + 0.35, z, F.pool, dim * 0.35, F.color]);
      n.flood++;
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 3));
      g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
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
      poolMat.opacity = lit;
      if (pts) pts.visible = on;
      if (pools) pools.visible = on;
    },
    count: () => ({ ...n }),
    dispose() {
      clear();
      disc.dispose();
      glowMat.dispose();
      poolMat.dispose();
    }
  };
}
/** Free every geometry / material the map made (shared kit caches — userData.shared — survive a re-create), the GPU context. */
/**
 * The war on the map (spec §4.34, T-317; model.borders): each standing unit's border as one draped ribbon in its colour (one
 * mesh, vertex colours), this week's hot stretch as a brighter wider ribbon that pulses (one mesh: only its opacity changes
 * per frame) and the banners along it (one mesh, geo3d bannerArrays). Rebuilt only when the borders' JSON changes.
 */
function warLayer(scene, heightAt) {
  const g = new THREE.Group(),
    h = (x, y) => heightAt(x * MAP_M, y * MAP_M),
    rgb = hex => {
      const c = new THREE.Color(hex);
      return [c.r, c.g, c.b];
    };
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
      // each unit's line just inside its own land (shift 3 left of the loop's run = inward), so two neighbours' colours sit side by side
      for (const L of B.lines) if (L.pts.length > 2) strip(L.pts, 2.4, true, 0.7, rgb(L.color), pos, col, 3);
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
function releaseScene(scene, renderer, sun) {
  scene.traverse(o => {
    if (o.userData && o.userData.shared) return;
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!(m.userData && m.userData.shared)) m.dispose();
  });
  sun.shadow.map && sun.shadow.map.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
export function create(onIdle) {
  const canvas = document.createElement('canvas'),
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true }),
    scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(40, 1, 1, 3000);
  const { sun, hemi, water } = lightScene(renderer, scene);

  let terrain = null,
    mesh = null,
    on = null,
    el = null,
    ro = null,
    raf = 0,
    last = 0,
    gone = 0,
    dead = false,
    avatar = null,
    figs = new Map(), // people drawn as full models (model.figures: the guide, the rival, the aces) by id
    furn = null, // pins, labels, flag, decals (pins3d.mjs)
    town = null, // roads, lots, landmarks (town3d.mjs)
    life = null, // figures, battle crowd, frontier patrols (life3d.mjs)
    nature = null, // trees, rocks, grass and the animals (nature3d.mjs, spec §4.19c)
    clock = 0,
    fogKey = null,
    badge = null,
    walkK = 1, // your walking speed (×1 / ×2 / ×4 — the map's speed selector, T-214)
    seen = null, // the you.at last shown
    fallSeen, // the latest destroyed war unit already shown (model.borders.fall.key; the first model sets it without a pan)
    war = null, // the war's borders, hot stretch and banners (spec §4.34: warLayer)
    cur = null, // the last model (pins for select)
    lastSel = null,
    cw = 0, // canvas size (px), cached by size() — never read from the DOM per frame
    ch = 0,
    night = null, // windows, lamps, floodlights (nightLayer)
    onW = null, // the mount callbacks as mapcam sees them: a click on a named figure goes to on.person instead of on.point
    low = false, // the Fast graphics setting: fewer named figures and night lights
    // the day clock (spec §4.37 2): wt = the shown week time (days; its fraction = the time of day), never run back
    wt = null,
    tod = 0.5,
    lit = 0,
    phase = 'idle', // 'idle' | 'walk' | 'order', or a function returning one (MapView.phase)
    walkPts = null, // the current walk's road (world [x, z]) and its cumulative lengths, for how far along it the avatar is
    walkLen = null,
    prog = 1,
    lastWalk = null, // model.time.walk[0] last seen: a change = a new action
    hoverId = null,
    ptr = null, // the pointer over the canvas { x, y, cx, cy } (canvas px, client px) — picked in the frame
    pickN = 0;

  // camera and input (mapcam3d.mjs): it reads the parts below as they appear
  const C = createMapCam(cam, canvas, sun, () => ({ terrain, mesh, avatar, cur, on: onW, cw, ch }));
  let hexOn = !(typeof location !== 'undefined' && /[?&]nohex\b/.test(location.search));
  const showHex = () => scene.traverse(o => o.userData && o.userData.hex && (o.visible = hexOn));
  const build = m => {
    terrain = buildTerrain(m);
    mesh = new THREE.Mesh(terrain.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    water.position.set(terrain.W / 2, 0, terrain.D / 2);
    avatar = createAvatar(scene);
    town = createTown(scene, terrain.heightAt);
    furn = createFurniture(scene, terrain.heightAt);
    life = createLife(scene, terrain.heightAt);
    nature = createNature(scene, terrain.heightAt);
    war = warLayer(scene, terrain.heightAt);
    night = nightLayer(scene, terrain.heightAt);
    furn.layer.addEventListener('wheel', C.onWheel, { passive: false }); // wheel over a pin still zooms
  };
  /** How far along its road the avatar has come (0–1, never back): the walk's share of the clock holds while it stands. */
  const walkProgress = () => {
    if (!walkPts || !avatar) return 1;
    const [x, z] = avatar.pos();
    let best = Infinity,
      s = 0;
    for (let i = 1; i < walkPts.length; i++) {
      const [ax, az] = walkPts[i - 1],
        [bx, bz] = walkPts[i],
        dx = bx - ax,
        dz = bz - az,
        L2 = dx * dx + dz * dz || 1,
        u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1),
        d = Math.hypot(x - ax - dx * u, z - az - dz * u);
      if (d < best) ((best = d), (s = walkLen[i - 1] + u * Math.sqrt(L2)));
    }
    return Math.max(prog, clamp(s / (walkLen[walkLen.length - 1] || 1), 0, 1));
  };
  /** Advance the shown clock toward what the reported phase asks for (model.time), at most its rate; never back. */
  const clockStep = dt => {
    const T = cur && cur.time;
    if (!T) return;
    const ph = typeof phase === 'function' ? phase() : phase,
      acted = T.walk[1] > T.walk[0] + 1e-6;
    let aim = T.idle,
      rate = T.rate.idle;
    if (ph === 'walk' && acted) {
      prog = walkProgress();
      aim = lerp(T.walk[0], T.walk[1], prog);
      rate = T.rate.walk;
    } else if (ph === 'order' && acted) ((aim = T.order[1]), (rate = T.rate.order));
    if (wt === null) wt = aim;
    if (aim < wt - 0.5) wt -= Math.ceil(wt - aim); // a new week: round through the night to its dawn
    if (aim > wt + 1.5) wt += Math.floor(aim - wt - 0.5); // days passed unseen: skip them
    if (aim > wt) wt = Math.min(aim, wt + rate * dt);
    tod = wt - Math.floor(wt);
  };
  const onPtr = e => {
    const r = canvas.getBoundingClientRect();
    ptr = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
    pickN = 0;
  };
  const offPtr = () => {
    ptr = null;
    if (hoverId !== null) ((hoverId = null), (canvas.style.cursor = ''), on && on.hover && on.hover(null));
  };
  canvas.addEventListener('pointermove', onPtr);
  canvas.addEventListener('pointerleave', offPtr);
  /** The named figure under the pointer (every few frames, or right after a move): tell the UI (hover tip), set the cursor. */
  const hoverStep = () => {
    if (!ptr || !life || !cur || pickN-- > 0) return;
    pickN = 6;
    const look = cur.life && cur.life.look,
      id = life.pick(cam, ptr.x, ptr.y, cw, ch, look ? look.pick : 16);
    if (id !== hoverId) canvas.style.cursor = id !== null ? 'pointer' : '';
    if (id !== hoverId || id !== null) {
      hoverId = id;
      if (on && on.hover) on.hover(id, ptr.cx, ptr.cy, id !== null ? life.going(id, tod) : null);
    }
  };
  /** Darken the terrain where nothing you have visited lies within fog.r (unexplored land stays visible, dim). */
  const applyFog = f => {
    const key = JSON.stringify(f);
    if (key === fogKey) return;
    fogKey = key;
    const attr = terrain.geo.attributes.color,
      pos = terrain.geo.attributes.position.array,
      base = terrain.base,
      k = fogFactor(f);
    for (let i = 0; i < attr.count; i++) {
      const v = k(pos[i * 3], pos[i * 3 + 2]);
      attr.setXYZ(i, base[i * 3] * v, base[i * 3 + 1] * v, base[i * 3 + 2] * v);
    }
    attr.needsUpdate = true;
  };
  const size = () => {
    if (!el || !el.clientWidth || !el.clientHeight) return;
    cw = el.clientWidth;
    ch = el.clientHeight;
    renderer.setSize(cw, ch, false);
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
  };
  const frame = t => {
    raf = 0;
    if (dead) return;
    const dt = Math.min((t - last) / 1000 || 0, 0.1);
    last = t;
    if (!canvas.isConnected) {
      gone += dt;
      if (gone > IDLE_S) return onIdle && onIdle(); // the career screen is gone: release the GPU objects
    } else {
      gone = 0;
      avatar.tick(dt * walkK, terrain.heightAt); // your walk at the chosen speed (setWalk; the others keep theirs)
      for (const f of figs.values()) f.tick(dt, terrain.heightAt);
      clock += dt;
      clockStep(dt);
      lit = cur && cur.time ? skyAt(cur.time.keys, tod, sun, hemi, scene) : 0;
      life.tick(dt, clock, tod);
      hoverStep();
      nature.tick(dt, clock);
      furn.pulse(clock);
      war.pulse(clock);
      C.step(dt);
      if (cur && cur.time) sun.position.copy(sun.target.position).addScaledVector(SKY.dir, 150); // the hour's sun (after the camera placed it)
      night.set(lit, (ch * renderer.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360)), renderer.getPixelRatio());
      const n = avatar.lapse(),
        txt = n ? `×${n < 2 ? n.toFixed(1) : Math.round(n)}` : '';
      if (badge && badge.textContent !== txt) {
        badge.textContent = txt;
        badge.hidden = !txt;
      }
      renderer.render(scene, cam);
      furn.tick(cam, cw, ch, C.view.d);
    }
    raf = requestAnimationFrame(frame);
  };

  const api = {
    /** Put the canvas into el (replacing its content) and start drawing the model. */
    mount(e, m, cb) {
      el = e;
      on = cb;
      onW = cb && { ...cb, point: p => (hoverId !== null && cb.person ? cb.person(hoverId) : cb.point(p)) };
      el.replaceChildren(canvas);
      badge = document.createElement('div');
      badge.className = 'mapbadge';
      badge.hidden = true;
      el.append(badge);
      if (ro) ro.disconnect();
      ro = new ResizeObserver(size);
      ro.observe(el);
      if (!terrain) {
        build(m);
        size();
        C.initView(m);
      }
      el.insertBefore(furn.layer, badge);
      size();
      C.fit();
      api.update(m);
      gone = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    /** New model: first time stand at you.at, later walk there when it changed. */
    update(m) {
      if (!furn) return;
      cur = m;
      const fall = m.borders && m.borders.fall ? m.borders.fall.key : null;
      if (fallSeen !== undefined && fall && fall !== fallSeen)
        (m.pins || []).some(p => p.id === m.borders.fall.pin) ? C.flyTo(m.borders.fall.pin) : C.overview(); // a unit destroyed: the camera goes to see (spec §4.34)
      fallSeen = fall;
      if (m.sel && m.sel !== lastSel) C.flyTo(m.sel); // selected from outside the map (list, chip, banner)
      lastSel = m.sel;
      town.sync(m);
      nature.sync(m);
      furn.sync(m, on);
      showHex();
      life.sync(m, low);
      night.sync(m, low);
      war.sync(m.borders);
      applyFog(m.fog);
      const want = new Map((m.figures || []).map(f => [f.id, f]));
      for (const [id, a] of figs) if (!want.has(id)) (a.dispose(), figs.delete(id));
      for (const [id, f] of want) {
        if (!figs.has(id)) figs.set(id, createAvatar(scene, { kit: f.kit }));
        figs.get(id).snap(f.at);
        figs.get(id).face(f.face);
      }
      const at = m.you && m.you.at;
      if (!at || !avatar) return;
      const key = at.join(',');
      if (m.time && m.time.walk[0] !== lastWalk) ((walkPts = null), (prog = 1)); // a new action (no walk unless one starts below)
      lastWalk = m.time ? m.time.walk[0] : null;
      if (seen === null) avatar.snap(at);
      else if (key !== seen) {
        const [x0, z0] = avatar.pos();
        avatar.setTarget(at, m.you.route);
        walkPts = [
          [x0, z0],
          ...(m.you.route && m.you.route.length > 1 ? m.you.route.slice(1, -1) : []).map(p => [p[0] * MAP_M, p[1] * MAP_M]),
          [at[0] * MAP_M, at[1] * MAP_M]
        ];
        walkLen = [0];
        for (let i = 1; i < walkPts.length; i++)
          walkLen.push(walkLen[i - 1] + Math.hypot(walkPts[i][0] - walkPts[i - 1][0], walkPts[i][1] - walkPts[i - 1][1]));
        prog = 0;
        C.walkFrom(x0, z0); // a drag in progress ends: the camera is the walk's, onto the player first
      }
      seen = key;
    },
    select: id => {
      if (!furn) return;
      furn.select(id);
      if (id && id !== lastSel) C.flyTo(id);
      lastSel = id;
    },
    centre: () => C.centre(),
    overview: () => C.overview(),
    /** Your walking speed on the map: ×k (1, 2, 4). */
    setWalk(k) {
      walkK = k > 0 ? k : 1;
    },
    /** Dev (QA, spec §4.19d clarity check): show / hide the hex tile fill; `?nohex` starts with it hidden. */
    hexFill(v) {
      hexOn = !!v;
      showHex();
    },
    /** Which part of the day is playing: 'idle' | 'walk' | 'order', or a function the map asks each frame (MapView.phase). */
    setPhase(p) {
      phase = p || 'idle';
    },
    /** The Fast graphics setting: fewer named figures (life.look.low) and night lights. */
    setLow(v) {
      if (low === !!v) return;
      low = !!v;
      if (cur && life) (life.sync(cur, low), night.sync(cur, low));
    },
    /** The shown clock: { week (days), tod (0–1), lit (0–1) } — for QA and the UI. */
    clock: () => ({ week: wt, tod, lit }),
    /** Dev / QA: jump the shown clock to week time w (it then runs on toward the phase from there — forward only). */
    setClock(w) {
      wt = w;
      tod = w - Math.floor(w);
    },
    /** QA: a named figure's screen point (canvas px) or null — to hover it in the UI smoke. */
    figureAt(id) {
      const p = life && life.at(id);
      if (!p) return null;
      const v = new THREE.Vector3(p[0], p[1] - 0.3, p[2]).project(cam);
      return v.z > 1 ? null : [((v.x + 1) / 2) * cw, ((1 - v.y) / 2) * ch];
    },
    /** True while your player is walking to a new place (the UI locks its actions until they arrive). */
    busy: () => C.walking(),
    heightAt: (x, z) => (terrain ? terrain.heightAt(x, z) : 0),
    info: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geos: renderer.info.memory.geometries,
      tex: renderer.info.memory.textures,
      life: life && life.count(),
      night: night && night.count(),
      clock: { week: wt, tod, lit },
      nature: nature && nature.count(),
      view: C.view && { ...C.view }
    }),
    dispose() {
      dead = true;
      if (avatar) avatar.dispose();
      for (const a of figs.values()) a.dispose();
      figs.clear();
      if (furn) furn.dispose();
      if (town) town.dispose();
      if (life) life.dispose();
      if (nature) nature.dispose();
      if (war) war.dispose();
      if (night) night.dispose();
      canvas.removeEventListener('pointermove', onPtr);
      canvas.removeEventListener('pointerleave', offPtr);
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      C.dispose();
      if (furn) furn.layer.removeEventListener('wheel', C.onWheel);
      canvas.remove();
      releaseScene(scene, renderer, sun);
    }
  };
  return api;
}
