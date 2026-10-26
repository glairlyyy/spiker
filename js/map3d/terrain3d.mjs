// The island's ground for the 3D map (map3d.mjs): the height grid (beach, plateau, Shu's upland, the designed highlands, pads,
// terraces, lakes), its vertex colours (biomes, Wei's lawn and paving, ground use, sand, river) and the detailed look's ground
// weights and shore texture. buildTerrain(model) → { geo, heightAt(x, z), W, D, base, shore }. Display only, fixed-hash noise.
import * as THREE from 'three';
import { MAP_M, clamp, lerp, smooth, inside, edgeDist, sideDist, hstr, vnoise } from './geo3d.mjs';

const CELL = 2, // terrain grid cell (m)
  CHUNK = 96, // cells a side of a culled terrain chunk (T-350: ~190 m) = a streaming block (T-364)
  COARSE = 4, // a far chunk's cell (grid cells a side, street level: stream3d)
  BEACH = 12, // beach slope width (m)
  SMOOTH = 2; // street level's smooth normals: the slope's half stencil (cells; T-370)

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
 * Wei's ground (owner, 2026-10-21: "the biome colour of Wei seems odd"): instead of the grey / green patchwork, a calm lawn
 * between the districts and paving inside the urban ones — lighter and cleaner toward a district's core (wealth), darker
 * at its edge, soft over `edge` m. Paved ground reads as concrete in the detailed look.
 */
const WEI_GROUND = {
  lawn: ['#62894a', '#6d9150'],
  patch: 45, // lawn tone patches (m)
  edge: [-8, 14], // the paving's soft edge (m, signed distance into the district)
  core: 70, // the core's full lightness this far in (m)
  suburb: 0.5, // the ring suburbs (k < 0.9): paved only round their lots, apron m wide (the cores: k 0.9 everywhere)
  apron: 3.5,
  pave: { city: ['#7f817e', '#a19f98'], works: ['#6f6e6a', '#83807a'], oldtown: ['#857d72', '#9f9483'] }
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
/**
 * The detailed look's ground weights per ground-use kind (T-343): s = sand, r = rock / paving, f = field rows (rows: straight
 * at the patch's hashed angle, else contour rows by height), w = wet (water sheen). Grass is what is left.
 */
const GROUND_LOOK = {
  terrace: { s: 0, r: 0, f: 0.8, w: 0 },
  paddy: { s: 0, r: 0, f: 0.5, w: 0.7, rows: true },
  field: { s: 0, r: 0, f: 1, w: 0, rows: true },
  park: { s: 0, r: 0, f: 0, w: 0 },
  yard: { s: 0.1, r: 0.2, f: 0, w: 0, p: 0.6 },
  quay: { s: 0, r: 0.2, f: 0, w: 0, p: 0.8 },
  water: { s: 0, r: 0, f: 0, w: 1 },
  quarry: { s: 0.2, r: 0.9, f: 0, w: 0 }
};
/**
 * A terrain chunk's far version (street level beyond the near blocks, T-364) — cells [i0, i1) × [j0, j1) of a grid nx cells wide: COARSE × COARSE cells fanned from their middle vertex
 * (4 triangles), the sides on the chunk's edge keeping every grid vertex so it meets a full chunk without cracks; same
 * attributes, its own index (~7× fewer triangles). Cells too thin to fan stay full. → the index (array).
 */
export function coarseIndex(nx, i0, i1, j0, j1) {
  const V = (i, j) => j * (nx + 1) + i,
    out = [],
    tri = (a, b, e) => out.push(a, b, e);
  for (let j = j0; j < j1; j += COARSE)
    for (let i = i0; i < i1; i += COARSE) {
      const ie = Math.min(i1, i + COARSE),
        je = Math.min(j1, j + COARSE);
      if (ie - i < 2 || je - j < 2) {
        for (let b = j; b < je; b++)
          for (let a = i; a < ie; a++) {
            const p = V(a, b);
            out.push(p, p + nx + 1, p + 1, p + 1, p + nx + 1, p + nx + 2);
          }
        continue;
      }
      const mid = V(i + ((ie - i) >> 1), j + ((je - j) >> 1)),
        // the cell's outline, the same turn as the full grid's triangles: up the i side, along je, down ie, back along j
        ring = [],
        side = (edge, pts) => (edge ? pts : [pts[0], pts[pts.length - 1]]),
        line = (a0, b0, a1, b1) => {
          const n = Math.max(Math.abs(a1 - a0), Math.abs(b1 - b0)),
            pts = [];
          for (let s = 0; s <= n; s++) pts.push(V(a0 + Math.sign(a1 - a0) * s, b0 + Math.sign(b1 - b0) * s));
          return pts;
        };
      for (const [edge, pts] of [
        [i === i0, line(i, j, i, je)],
        [j1 - je < 2, line(i, je, ie, je)], // (a thin full cell beyond counts as an edge)
        [i1 - ie < 2, line(ie, je, ie, j)],
        [j === j0, line(ie, j, i, j)]
      ])
        ring.push(...side(edge, pts).slice(0, -1));
      for (let s = 0; s < ring.length; s++) tri(mid, ring[s], ring[(s + 1) % ring.length]);
    }
  return out;
}
/** The island's height grid and vertex colours (world metres), from the model's land. */
export function buildTerrain(model) {
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
    dist = L.districts
      ? L.districts.map(d => ({ id: d.id, poly: w(d.poly), tint: DISTRICT_TINT[d.style], style: d.style })).filter(d => d.tint)
      : [],
    paved = dist
      .filter(d => WEI_GROUND.pave[d.style])
      .map(d => {
        const xs = d.poly.map(p => p[0]),
          zs = d.poly.map(p => p[1]),
          e = -WEI_GROUND.edge[0];
        return {
          ...d,
          box: [Math.min(...xs) - e, Math.min(...zs) - e, Math.max(...xs) + e, Math.max(...zs) + e],
          k: /ring/.test(d.id || '') ? WEI_GROUND.suburb : 0.9, // the ring suburbs: lawns with a little paving
          E: new THREE.Color(WEI_GROUND.pave[d.style][0]),
          C: new THREE.Color(WEI_GROUND.pave[d.style][1])
        };
      }),
    // the paving round the lots of Wei's ring suburbs (an apron per lot, soft over WEI_GROUND.apron m): raster per terrain vertex
    apron = new Float32Array((nx + 1) * (nz + 1)),
    lawnA = new THREE.Color(WEI_GROUND.lawn[0]),
    lawnB = new THREE.Color(WEI_GROUND.lawn[1]),
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
    bio = { rock: 0, wei: 0 }, // the rock share of the last bioCol / biomeAt (the detailed look's ground weights, T-343)
    /** A biome's own colour at (x, z, height h): its two tones in soft patches; Shu climbs to rock grey. */
    bioCol = (b, x, z, h, out) => {
      const n = vnoise(x / (b.pal.patch || 20) + b.x, z / (b.pal.patch || 20));
      out.copy(b.A).lerp(b.B, b.id === 'wei' ? smooth(0.42, 0.58, n) : n);
      bio.rock = b.R ? smooth(b.pal.rock[0], b.pal.rock[1], h) : 0;
      if (b.R) out.lerp(b.R, bio.rock);
      return out;
    },
    /** The ground colour from the biomes: majors weighted by a smoothstep across their edges, then the minors on top. */
    biomeAt = (x, z, h, out) => {
      let sum = 0,
        wei = 0,
        rk = 0,
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
        rk += bio.rock * wgt;
        if (b.id === 'wei') wei += wgt;
        sum += wgt;
      }
      if (sum > 0) (out.multiplyScalar(1 / sum), (rk /= sum), (wei /= sum));
      else if (best) (bioCol(best, x, z, h, out), (rk = bio.rock), (wei = best.id === 'wei' ? 1 : 0));
      // Wei: a calm lawn in place of its patchwork (WEI_GROUND)
      if (wei > 0) out.lerp(bc.copy(lawnA).lerp(lawnB, vnoise(x / WEI_GROUND.patch + 3.7, z / WEI_GROUND.patch)), wei);
      for (const b of minorsB) {
        const dx = x - b.x,
          dz = z - b.z,
          u = dx * b.ca - dz * b.sa,
          v = dx * b.sa + dz * b.ca,
          sd = (1 - Math.hypot(u / b.rx, v / b.rz)) * Math.min(b.rx, b.rz),
          wgt = smooth(-fadeN, fadeN, sd);
        if (wgt > 0) (out.lerp(bioCol(b, x, z, h, bc), wgt), (rk = lerp(rk, bio.rock, wgt)), (wei *= 1 - wgt));
      }
      bio.rock = rk;
      bio.wei = wei;
      return out;
    },
    lakes = [], // vertex indices in each water patch: flattened after the heights are known
    pos = new Float32Array((nx + 1) * (nz + 1) * 3),
    col = new Float32Array((nx + 1) * (nz + 1) * 3),
    H = new Float32Array((nx + 1) * (nz + 1)),
    // the detailed look (T-343): ground weights (sand, rock, field rows, wet) and the rows' direction per vertex; the sea's
    // shore texture (R = height, −6…+2 m; G = distance from the coast out to sea, 0…60 m)
    gnd = new Float32Array((nx + 1) * (nz + 1) * 4),
    gdir = new Float32Array((nx + 1) * (nz + 1) * 2),
    gpav = new Float32Array((nx + 1) * (nz + 1)), // paving slabs (Wei's districts, yards, quays)
    gw = new Uint8Array((nx + 1) * (nz + 1)), // grass weight 0–255 (what the ground weights leave; T-370 street tufts)
    shore = new Uint8Array((nx + 1) * (nz + 1) * 4),
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
  for (const l of L.lots || []) {
    const x0 = l.at[0] * MAP_M,
      z0 = l.at[1] * MAP_M,
      r = l.size * MAP_M * 0.75,
      R = r + WEI_GROUND.apron;
    if (!paved.some(q => q.k < 0.9 && inside(x0, z0, q.poly))) continue;
    for (let j = Math.max(0, Math.floor((z0 - R) / sz)); j <= Math.min(nz, Math.ceil((z0 + R) / sz)); j++)
      for (let i = Math.max(0, Math.floor((x0 - R) / sx)); i <= Math.min(nx, Math.ceil((x0 + R) / sx)); i++) {
        const k = j * (nx + 1) + i,
          v = 1 - smooth(r, R, Math.hypot(i * sx - x0, j * sz - z0));
        if (v > apron[k]) apron[k] = v;
      }
  }
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
      // weights for the detailed look (blended like the colours they follow)
      let wS = 0,
        wP = 0,
        wR = 0,
        wF = 0,
        wW = 0,
        dx = 0,
        dz = 0;
      const mix = (w, a, t) => w + (a - w) * t;
      // colour: grass → rock with height, sand on the beach (no faction colour: the hex tiles carry it, spec §4.27)
      if (!land) (c.copy(seabed), (wS = 1));
      else {
        if (biomes.length) (biomeAt(x, z, h, c), (wR = bio.rock));
        else (c.copy(grass).lerp(rock, smooth(8, 20, h)), (wR = smooth(8, 20, h)));
        if (gravelLine.length > 1) {
          const t = 0.8 * (1 - smooth((BIO.gravelW || 4) / 2, (BIO.gravelW || 4) / 2 + 1.5, Math.abs(sideDist(x, z, gravelLine))));
          c.lerp(gravelC, t);
          wR = mix(wR, 0.7, t);
        }
        const tb = 1 - smooth(1, BEACH, d);
        c.lerp(sand, tb);
        wS = mix(wS, 1, tb);
        wR *= 1 - tb;
        if (sd > -99) {
          const t = 0.95 * smooth(-3, 2, sd);
          c.lerp(sand, t); // the Wu sand
          wS = mix(wS, 1, t);
          wR *= 1 - t;
        }
        if (river && typeof lineDist === 'function') {
          const rd = lineDist([x / MAP_M, z / MAP_M], river.line).d / river.w;
          wW = 1 - smooth(0.12, 0.3, rd); // (soft: the water's edge is not the 2 m grid)
          if (rd < 0.22)
            c.lerp(riverC, 0.85); // the river off the Peak
          else {
            const t = 0.75 * (1 - smooth(0.22 + (BIO.bankW || 0.5) * 0.6, 0.22 + (BIO.bankW || 0.5), rd));
            c.lerp(bankC, t); // its sand / pebble banks
            wS = mix(wS, 0.6, t);
            wR = mix(wR, 0.4, t);
          }
        }
        for (const q of dist) if (!WEI_GROUND.pave[q.style] && inside(x, z, q.poly)) c.lerp(tintC.set(q.tint), 0.16);
        // Wei's urban districts: paving, lighter toward the core
        for (const q of paved) {
          if (x < q.box[0] || z < q.box[1] || x > q.box[2] || z > q.box[3]) continue;
          const sdq = inside(x, z, q.poly) ? edgeDist(x, z, q.poly) : -edgeDist(x, z, q.poly),
            u = smooth(WEI_GROUND.edge[0], WEI_GROUND.edge[1], sdq);
          if (u <= 0) continue;
          const pk = q.k < 0.9 ? 0.65 * apron[k] : q.k; // suburbs: only round the lots
          c.lerp(tintC.copy(q.E).lerp(q.C, smooth(0, WEI_GROUND.core, sdq)), pk * u);
          wP = Math.max(wP, pk * u);
          wS *= 1 - u;
          wR *= 1 - u;
        }
        for (const q of grounds) {
          if (x < q.box[0] || z < q.box[1] || x > q.box[2] || z > q.box[3] || !inside(x, z, q.poly) || (q.hole && inside(x, z, q.hole)))
            continue;
          const v = q.contour ? h : x * q.ca + z * q.sa;
          c.lerp(Math.floor(v / q.band) % 2 ? q.B : q.A, 0.75);
          if (q.kind === 'water') (lakes[grounds.indexOf(q)] = lakes[grounds.indexOf(q)] || []).push(k);
          const G = GROUND_LOOK[q.kind];
          if (G) {
            wS = G.s;
            wR = G.r;
            wP = G.p || 0;
            wF = G.f;
            wW = G.w;
            if (G.rows) ((dx = q.ca), (dz = q.sa)); // straight rows at the patch's angle (terraces: none — contour rows by height)
          }
        }
      }
      col.set([c.r, c.g, c.b], k * 3);
      gnd.set([wS, wR, wF, wW], k * 4);
      gpav[k] = wP;
      gw[k] = land ? Math.round(255 * clamp(1 - wS - wR - wF - wW - wP, 0, 1)) : 0; // (T-370: street level's tufts)
      gdir.set([dx, dz], k * 2);
      shore.set([Math.round(clamp((h + 6) / 8, 0, 1) * 255), land ? 0 : Math.round(clamp(d / 60, 0, 1) * 255), 0, 255], k * 4);
    }
  // a lake: its patch sinks to just under its lowest shore, so the water reads level on a slope
  for (const ks of lakes) {
    if (!ks) continue;
    const lvl = Math.min(...ks.map(k => H[k])) - 0.4;
    for (const k of ks) {
      H[k] = lvl;
      pos[k * 3 + 1] = lvl;
      shore[k * 4] = Math.round(clamp((lvl + 6) / 8, 0, 1) * 255);
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
  geo.setAttribute('gnd', new THREE.BufferAttribute(gnd, 4));
  geo.setAttribute('gdir', new THREE.BufferAttribute(gdir, 2));
  geo.setAttribute('gpav', new THREE.BufferAttribute(gpav, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // street level's smooth normals (T-370): the slope over ±SMOOTH cells (a wider stencil than the triangles'), the detailed look
  // blends to them near the camera — no facets where the 2 m grid bends; the Fast look keeps the triangles' normals
  const nsm = new Int8Array((nx + 1) * (nz + 1) * 3),
    Hc = (i, j) => H[clamp(j, 0, nz) * (nx + 1) + clamp(i, 0, nx)];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      let gx = 0,
        gz = 0;
      for (let o = -1; o <= 1; o++) {
        gx += Hc(i + SMOOTH, j + o) - Hc(i - SMOOTH, j + o);
        gz += Hc(i + o, j + SMOOTH) - Hc(i + o, j - SMOOTH);
      }
      const dx = gx / (3 * 2 * SMOOTH * sx),
        dz = gz / (3 * 2 * SMOOTH * sz),
        l = Math.hypot(dx, 1, dz),
        k = (j * (nx + 1) + i) * 3;
      nsm[k] = Math.round((-dx / l) * 127);
      nsm[k + 1] = Math.round((1 / l) * 127);
      nsm[k + 2] = Math.round((-dz / l) * 127);
    }
  geo.setAttribute('nsm', new THREE.BufferAttribute(nsm, 3, true));
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
  const col0 = col.slice(); // (the colours before the fog: `base`)
  /** The grid cell under (x, z) and its corner weights: a bilinear read of a per-vertex array. */
  const bil = (A, x, z, st = 1, o = 0) => {
    const fx = clamp(x / sx, 0, nx - 0.001),
      fz = clamp(z / sz, 0, nz - 0.001),
      i = Math.floor(fx),
      j = Math.floor(fz),
      u = fx - i,
      v = fz - j,
      g = (a, b) => A[(b * (nx + 1) + a) * st + o];
    return lerp(lerp(g(i, j), g(i + 1, j), u), lerp(g(i, j + 1), g(i + 1, j + 1), u), v);
  };
  /** Grass weight 0–1 at (x, z) (street level's tufts, T-370). */
  const grassAt = (x, z) => bil(gw, x, z) / 255;
  /** The ground's own colour (no fog) at (x, z) into out [r, g, b]. */
  const colourAt = (x, z, out = [0, 0, 0]) => (
    (out[0] = bil(col0, x, z, 3, 0)),
    (out[1] = bil(col0, x, z, 3, 1)),
    (out[2] = bil(col0, x, z, 3, 2)),
    out
  );
  // chunks (the island × 2, T-350): CHUNK × CHUNK cells each, sharing geo's attributes (one upload; the fog's colour writes reach
  // them all) with their own index and bounds, so the camera and the shadow pass cull what they don't see
  const chunks = [],
    coarse = [];
  /** A chunk's far version (T-364): its coarse index (coarseIndex) on the same attributes and bounds. */
  const coarseChunk = (c, i0, i1, j0, j1) => {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(coarseIndex(nx, i0, i1, j0, j1)), 1));
    g.boundingBox = c.boundingBox;
    g.boundingSphere = c.boundingSphere;
    return g;
  };
  for (let j0 = 0; j0 < nz; j0 += CHUNK)
    for (let i0 = 0; i0 < nx; i0 += CHUNK) {
      const i1 = Math.min(nx, i0 + CHUNK),
        j1 = Math.min(nz, j0 + CHUNK),
        sub = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
      let m = 0,
        lo = Infinity,
        hi = -Infinity;
      for (let j = j0; j < j1; j++) {
        sub.set(idx.subarray((j * nx + i0) * 6, (j * nx + i1) * 6), m);
        m += (i1 - i0) * 6;
      }
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const y = pos[(j * (nx + 1) + i) * 3 + 1];
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
      const c = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(geo.attributes)) c.setAttribute(k, a);
      c.setIndex(new THREE.BufferAttribute(sub, 1));
      c.boundingBox = new THREE.Box3(new THREE.Vector3(i0 * sx, lo - 1, j0 * sz), new THREE.Vector3(i1 * sx, hi + 1, j1 * sz));
      c.boundingSphere = c.boundingBox.getBoundingSphere(new THREE.Sphere());
      chunks.push(c);
      coarse.push(coarseChunk(c, i0, i1, j0, j1));
    }
  return {
    geo,
    grassAt,
    colourAt,
    chunks,
    coarse,
    block: [CHUNK * sx, CHUNK * sz], // the streaming blocks = the chunks (stream3d, T-364)
    heightAt,
    W,
    D,
    base: col0,
    shore: { data: shore, w: nx + 1, h: nz + 1 }
  };
}
