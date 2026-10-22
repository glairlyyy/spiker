// The island's ground for the 3D map (map3d.mjs): the height grid (beach, plateau, Shu's upland, the designed highlands, pads,
// terraces, lakes), its vertex colours (biomes, Wei's lawn and paving, ground use, sand, river) and the detailed look's ground
// weights and shore texture. buildTerrain(model) → { geo, heightAt(x, z), W, D, base, shore }. Display only, fixed-hash noise.
import * as THREE from 'three';
import { MAP_M, clamp, lerp, smooth, inside, edgeDist, sideDist, hstr, vnoise } from './geo3d.mjs';

const CELL = 2, // terrain grid cell (m)
  BEACH = 12; // beach slope width (m)

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
  return { geo, heightAt, W, D, base: col.slice(), shore: { data: shore, w: nx + 1, h: nz + 1 } };
}
