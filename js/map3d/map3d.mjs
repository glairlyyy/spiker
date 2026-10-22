// The 3D island map (three.js). Draws a MapModel (see js/career/mapmodel.js) as low-poly terrain with water, a fixed
// tilted camera and pan / zoom, and reports clicks as map points.
//   create(onIdle) → { mount(el, model, on), update(model), select(id), dispose(), heightAt(x, z), info(), hexFill(on),
//                      setPhase(p), setLow(b), clock(), mark(id), figureAt(id), street(), camPos(), youPos(), interiors() }
// Street level (spec §4.37 6, T-336a): inside model.street's district the zoom goes down to a follow camera behind you (mapcam3d.mjs
// streetPose); street() = 0–1 how far down it is; camPos() / youPos() = world [x, y, z]. As it goes down your avatar shrinks to life
// size, the people near the camera become VRMs (life3d), the town's detail ring builds round the camera (town3d ring), the sky shows
// and a haze hides the map look far off. The optional interiors layer (js/map3d/interior3d.mjs, T-336b — imported if it exists):
// createInteriors(scene, heightAt) → { sync(model), tick(dt, { cam, you, street, low }), at([sx, sy]) (a street-level click it takes), dispose() }.
// on = { pick(id), point([x, y]), hover?(id | null, clientX, clientY, going), person?(id) }: hover / person are the named figures
// (life3d pick; a click or right-click on one goes to person instead of point; the hovered one and mark(id) get a ring underfoot). The day clock (spec §4.37 2): model.time (MapModel.time) gives
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
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  MAP_M,
  clamp,
  lerp,
  smooth,
  fogFactor,
  inside,
  edgeDist,
  sideDist,
  hstr,
  ribbon,
  bannerArrays,
  vnoise,
  tileNoise,
  heightToNormal
} from './geo3d.mjs';
export { inside, edgeDist, sideDist }; // (the polygon maths live in geo3d.mjs; tests import them from here too)

const CELL = 2, // terrain grid cell (m)
  BEACH = 12, // beach slope width (m)
  IDLE_S = 3, // canvas detached this long → release the renderer
  SHADOW_MAP = 2048, // sun shadow map size (px)
  SHADOW_BOX = 120; // half-size of the sun's shadow frustum around the view (m)

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
 * The detailed look (spec §4.39 Land, T-343) — the default; the Fast setting (setLow) keeps the flat look above. Sky: three's
 * physical Sky (no sun disc) on the clock's real sun, baked into an environment map (PMREM) when the sun has moved — the
 * map camera never sees the sky itself, only its light and its reflection (water, glass). Terrain: the same mesh and vertex
 * colours with a shader on top (ground weights gnd: sand / rock / field rows / wet, plus slope rock; detail from one
 * generated tileable texture, bump by derivatives). Sea: a standard material with two scrolling generated normal maps,
 * colour by depth and distance from the coast (terrain.shore texture) and foam at the shore. Post: ACES tone mapping,
 * bloom while the night lights are on, GTAO on the High setting; soft PCF shadows whose box follows the zoom; dynamic
 * resolution. No downloads, no randoms (fixed-hash noise).
 */
export const LOOK = {
  exposure: [1, 1.7], // ACES exposure by day → with the night lights on (lit)
  samples: 4, // MSAA samples of the post's render target (the canvas's own antialias is bypassed)
  env: 0.3, // the sky's light on materials at noon (× the sun's height; none at night)
  hemi: [0.7, 1.6], // the clock's hemisphere light × this by day → at night (by day the sky adds the rest)
  sky: { turbidity: 5, rayleigh: 1.4, mie: 0.004, g: 0.8, every: 0.25, moved: 0.015 },
  bloom: { strength: 0.85, radius: 0.5, day: 3, night: 0.8 }, // threshold from day (nothing blooms) to night
  shadow: { radius: 3, box: [40, 360], k: 0.85, map: 2048, mapHi: 4096 },
  // dynamic resolution: ms (frame-time average) to step down / up; far too slow (`dire`, < ~15 fps) steps faster to `rescue`
  dyn: { floor: { auto: 0.7, high: 1, fast: 1 }, slow: 24, quick: 15, dire: 66, rescue: { auto: 0.45, high: 1, fast: 1 } },
  sea: { deep: '#0d3b5e', mid: '#176b8a', shallow: '#3fb2ad', foam: '#f4f8f6', wave: 0.32 },
  detail: 256 // generated texture size (px)
};
const GLSL_BUMP = `vec3 lkBump(vec3 sp, vec3 sn, vec2 dh) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1);
  return normalize(abs(det) * sn - sign(det) * (dh.x * r1 + dh.y * r2));
}`;
/** A repeating linear-filtered, mipmapped RGBA texture from bytes (n × n). */
const dataTex = (bytes, n, srgb = false) => {
  const t = new THREE.DataTexture(bytes, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
};
/** The generated textures: detail (R fine grain, G patches, B sand ripples, A rock cracks) and the waves' normal map. */
function lookTextures(n) {
  const fine = tileNoise(n, 32, 3, 1),
    patch = tileNoise(n, 4, 4, 2),
    warp = tileNoise(n, 4, 3, 3),
    crack = tileNoise(n, 8, 4, 4),
    det = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        rip = 0.5 + 0.5 * Math.sin(2 * Math.PI * ((y / n) * 12 + 1.6 * warp[i])),
        cr = smooth(0, 0.07, Math.abs(2 * crack[i] - 1));
      det.set([fine[i] * 255, patch[i] * 255, rip * 255, cr * 255], i * 4);
    }
  return { det: dataTex(det, n), wave: dataTex(heightToNormal(tileNoise(n, 8, 5, 9, 0.55), n, 7), n) };
}
function richLook(renderer, scene, cam, sun, hemi) {
  const U = { t: { value: 0 } }; // shared time uniform (s)
  let tex = null; // made on first use (the detailed look only)
  const textures = () => {
    if (!tex) {
      tex = lookTextures(LOOK.detail);
      U.det = { value: tex.det };
      U.wave = { value: tex.wave };
    }
    return tex;
  };
  // ---- terrain: the vertex colours × ground detail
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  terrainMat.onBeforeCompile = sh => {
    textures();
    Object.assign(sh.uniforms, { tDet: U.det });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 gnd; attribute vec2 gdir; attribute float gpav; varying vec4 vGnd; varying vec2 vGdir; varying float vPav;
        varying vec3 vWp; varying vec3 vWn;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGnd = gnd; vGdir = gdir; vPav = gpav; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDet; varying vec4 vGnd; varying vec2 vGdir; varying float vPav; varying vec3 vWp; varying vec3 vWn;
        float lkH; float lkWet; ${GLSL_BUMP}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 gp = vWp.xz;
          vec4 d1 = texture2D(tDet, gp / 5.0), d2 = texture2D(tDet, gp / 23.0 + 0.37);
          float big = texture2D(tDet, gp / 170.0 + 0.11).g;
          float sS = vGnd.x, sF = vGnd.z, sW = vGnd.w, sP = vPav;
          float steep = smoothstep(0.3, 0.6, 1.0 - normalize(vWn).y) * (1.0 - sW) * (1.0 - sS);
          float sR = max(vGnd.y, steep);
          float sG = max(0.0, 1.0 - sS - sR - sF - sW - sP);
          float tot = sG + sS + sR + sF + sW + sP + 1e-4;
          vec3 base = diffuseColor.rgb;
          vec3 g = base * (0.72 + 0.52 * d1.r) * (0.9 + 0.2 * d2.g);
          g = mix(g, g * vec3(1.2, 1.1, 0.68), smoothstep(0.5, 0.85, d2.g) * 0.5);
          float rip = texture2D(tDet, vec2(gp.x + gp.y * 0.35, gp.y - gp.x * 0.25) / 9.0).b;
          vec3 sa = base * (0.9 + 0.1 * rip + 0.16 * (d1.r - 0.5));
          vec3 ro = mix(base, vec3(0.2, 0.19, 0.165), steep) * (0.78 + 0.22 * d2.a) * (0.8 + 0.4 * d1.r);
          // paving: 3 m slabs, a tone per slab (hash), dark joints, a little grain
          vec2 sl = gp / 3.0, sc = floor(sl), sf = fract(sl);
          float joint = smoothstep(0.0, 0.05, min(min(sf.x, sf.y), min(1.0 - sf.x, 1.0 - sf.y)));
          float slab = fract(sin(dot(sc, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 pv = base * (0.9 + 0.14 * slab + 0.1 * (d1.r - 0.5)) * (0.72 + 0.28 * joint) * (0.92 + 0.16 * d2.g);
          float rs = length(vGdir) > 0.5 ? dot(gp, normalize(vGdir)) : vWp.y * 2.2;
          float row = smoothstep(0.2, 0.7, 0.5 + 0.5 * sin(rs * 3.927));
          vec3 fi = mix(vec3(0.15, 0.095, 0.05) * (0.7 + 0.6 * d1.r), base * (0.75 + 0.5 * d1.r), row);
          vec3 we = base * (0.7 + 0.1 * d2.g);
          diffuseColor.rgb = (sG * g + sS * sa + sR * ro + sF * fi + sW * we + sP * pv) / tot * (0.86 + 0.28 * big);
          lkH = (sG * d1.r * 0.5 + sS * rip * 0.35 + sR * (d2.a + d1.r) * 0.6 + sF * row * 0.8 + sP * joint * 0.5) / tot;
          lkWet = sW / tot * (1.0 - 0.6 * sF / tot);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.1, lkWet);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = lkBump(-vViewPosition, normal, vec2(dFdx(lkH), dFdy(lkH)) * 0.07 * (1.0 - lkWet));`
      );
  };
  // ---- the sea
  const SEA = LOOK.sea,
    seaMat = new THREE.MeshStandardMaterial({ color: SEA.deep, roughness: 0.07, metalness: 0 }),
    shoreU = { tShore: { value: null }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
  seaMat.onBeforeCompile = sh => {
    textures();
    Object.assign(sh.uniforms, shoreU, {
      tDet: U.det,
      tWave: U.wave,
      uT: U.t,
      uDeep: { value: new THREE.Color(SEA.deep) },
      uMid: { value: new THREE.Color(SEA.mid) },
      uShallow: { value: new THREE.Color(SEA.shallow) },
      uFoam: { value: new THREE.Color(SEA.foam) }
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDet, tWave, tShore; uniform vec4 uBox; uniform float uT; uniform vec3 uDeep, uMid, uShallow, uFoam;
        varying vec3 vWp; float lkFoam;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 sp = (vWp.xz - uBox.xy) * uBox.zw;
          vec4 sh = (sp.x < 0.0 || sp.y < 0.0 || sp.x > 1.0 || sp.y > 1.0) ? vec4(0.0, 1.0, 0.0, 1.0) : texture2D(tShore, sp);
          float depth = max(0.0, 6.0 - sh.r * 8.0), off = sh.g;
          vec3 wc = mix(uShallow, uMid, smoothstep(0.2, 3.0, depth));
          wc = mix(wc, uDeep, smoothstep(0.15, 1.0, off));
          float fz = texture2D(tDet, vWp.xz / 7.0 + vec2(uT * 0.031, -uT * 0.017)).r;
          float edge = smoothstep(0.7, 0.05, depth) * (0.45 + 0.75 * fz);
          float band = smoothstep(0.75, 1.0, sin(depth * 4.5 + uT * 1.4 + fz * 5.0)) * smoothstep(2.2, 0.3, depth);
          lkFoam = clamp(max(edge, band * 0.7 * fz * 1.6), 0.0, 1.0);
          diffuseColor.rgb = mix(wc, uFoam, lkFoam);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, lkFoam);'
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 n1 = texture2D(tWave, vWp.xz / 19.0 + uT * vec2(0.012, 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(tWave, vWp.xz / 7.3 - uT * vec2(0.009, 0.015)).xyz * 2.0 - 1.0;
          vec2 s = (n1.xy + n2.xy) * ${SEA.wave.toFixed(2)} * (1.0 - 0.7 * lkFoam);
          normal = normalize((viewMatrix * vec4(normalize(vec3(s.x, 1.0, s.y)), 0.0)).xyz);
        }`
      );
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), seaMat);
  sea.receiveShadow = true;
  sea.visible = false;
  scene.add(sea);
  // ---- the sky (environment light and reflections)
  const sky = new Sky(),
    skyScene = new THREE.Scene(),
    pmrem = new THREE.PMREMGenerator(renderer),
    envDir = new THREE.Vector3(0, -1, 0);
  sky.material.fragmentShader = sky.material.fragmentShader.replace('vSunE * 19000.0', 'vSunE * 0.0'); // no sun disc: the light is the sun
  sky.scale.setScalar(100);
  sky.material.uniforms.turbidity.value = LOOK.sky.turbidity;
  sky.material.uniforms.rayleigh.value = LOOK.sky.rayleigh;
  sky.material.uniforms.mieCoefficient.value = LOOK.sky.mie;
  sky.material.uniforms.mieDirectionalG.value = LOOK.sky.g;
  skyScene.add(sky);
  let envRT = null,
    envAge = 99;
  const bakeSky = (dt, dir) => {
    envAge += dt;
    if (envRT && (envAge < LOOK.sky.every || dir.distanceTo(envDir) < LOOK.sky.moved)) return;
    sky.material.uniforms.sunPosition.value.copy(dir);
    const rt = pmrem.fromScene(skyScene, 0, 1, 400);
    if (envRT) envRT.dispose();
    envRT = rt;
    envDir.copy(dir);
    envAge = 0;
    if (on) scene.environment = rt.texture;
  };
  // ---- post: render → (GTAO) → bloom → ACES + sRGB
  let composer = null,
    bloom = null,
    gtao = null,
    gtaoWant = false,
    gtaoLoading = false,
    on = false,
    ready = false,
    hi = false,
    w = 1,
    h = 1,
    pr = 1;
  const dyn = { res: 1, ema: 16.7, t: 0, last: 0 };
  const makeComposer = () => {
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: LOOK.samples });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, cam));
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), LOOK.bloom.strength, LOOK.bloom.radius, LOOK.bloom.day);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };
  /** AO on the High setting (spec §4.39): the pass loads on first use, sits before the bloom. */
  const wantAO = v => {
    gtaoWant = v;
    if (gtao) gtao.enabled = v;
    if (!v || gtao || gtaoLoading || !composer) return;
    gtaoLoading = true;
    import('three/addons/postprocessing/GTAOPass.js')
      .then(({ GTAOPass }) => {
        if (!composer) return;
        gtao = new GTAOPass(scene, cam, w * pr, h * pr);
        gtao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.5, thickness: 2, scale: 1, samples: 12 });
        gtao.blendIntensity = 0.8;
        gtao.enabled = gtaoWant;
        composer.insertPass(gtao, 1);
      })
      .catch(() => {});
  };
  const sizeAll = () => {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    if (composer) (composer.setPixelRatio(pr), composer.setSize(w, h));
  };
  const SKYDIR = new THREE.Vector3();
  const resize = (cw, ch) => {
    w = Math.max(1, cw);
    h = Math.max(1, ch);
    pr = Math.min(devicePixelRatio || 1, 2) * (on ? dyn.res : 1);
    sizeAll();
  };
  return {
    terrainMat,
    sea,
    get on() {
      return on;
    },
    /** The island's shore texture (the sea's depth and coast distance): once per terrain. */
    setTerrain(T) {
      const S = T.shore,
        t = new THREE.DataTexture(S.data, S.w, S.h, THREE.RGBAFormat);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      if (shoreU.tShore.value) shoreU.tShore.value.dispose();
      shoreU.tShore.value = t;
      // texel centres: vertex (i, j) sits at x = i·W/(w−1)
      const cx = T.W / (S.w - 1),
        cz = T.D / (S.h - 1);
      shoreU.uBox.value.set(-cx / 2, -cz / 2, 1 / (T.W + cx), 1 / (T.D + cz));
    },
    /** Detailed (true) or the Fast look (false): tone mapping, environment, shadow filter, sea. Materials recompile. */
    set(v, water) {
      v = !!v;
      if (v === on && ready) return;
      ready = true;
      on = v;
      renderer.toneMapping = v ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = v ? LOOK.exposure[0] : 1;
      renderer.shadowMap.type = v ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      sun.shadow.radius = v ? LOOK.shadow.radius : 1;
      sun.shadow.normalBias = v ? 0.04 : 0;
      scene.environment = v && envRT ? envRT.texture : null;
      sea.visible = v;
      water.visible = !v;
      if (v && !composer) makeComposer();
      if (!v) {
        // the Fast look's fixed shadow box and map (lightScene)
        const sc = sun.shadow.camera;
        Object.assign(sc, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: 500 });
        sc.updateProjectionMatrix();
        sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
        dyn.res = 1;
        pr = Math.min(devicePixelRatio || 1, 2);
        sizeAll();
      }
      if (sun.shadow.map) (sun.shadow.map.dispose(), (sun.shadow.map = null));
      scene.traverse(o => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) m.needsUpdate = true;
      });
    },
    /** The canvas size (CSS px): the renderer and the post at the dynamic resolution. */
    resize,
    /** Per frame, before the draw: time, the sky, light balance, bloom by `lit`, the shadow box by zoom, the resolution. */
    step(dt, t, lit, tod, view, gfx) {
      if (!on) return;
      U.t.value = t;
      // the real sun (below the horizon at night: the sky goes dark; the moon is only the directional light)
      const a = ((tod - 0.25) / 0.5) * Math.PI;
      SKYDIR.set(1.25 * Math.cos(a), Math.sin(a), 0.05 + 0.3 * Math.max(0, Math.sin(a))).normalize();
      bakeSky(dt, SKYDIR);
      scene.environmentIntensity = LOOK.env * smooth(-0.05, 0.35, SKYDIR.y);
      renderer.toneMappingExposure = lerp(LOOK.exposure[0], LOOK.exposure[1], lit);
      bloom.enabled = lit > 0.02;
      bloom.threshold = lerp(LOOK.bloom.day, LOOK.bloom.night, lit);
      bloom.strength = LOOK.bloom.strength * lit;
      // shadows: the box follows the zoom (crisp near, the whole view far), the sun far enough to cover it
      const S = LOOK.shadow,
        box = clamp(view ? view.d * S.k : 120, S.box[0], S.box[1]),
        sc = sun.shadow.camera,
        size = gfx === 'high' ? S.mapHi : S.map;
      if (sc.right !== box) {
        Object.assign(sc, { left: -box, right: box, top: box, bottom: -box, near: 1, far: box * 4 + 400 });
        sc.updateProjectionMatrix();
      }
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) (sun.shadow.map.dispose(), (sun.shadow.map = null));
      }
      sun.position
        .sub(sun.target.position)
        .setLength(box * 2 + 200)
        .add(sun.target.position);
      wantAO(gfx === 'high');
      hi = gfx === 'high';
      // dynamic resolution (like matches, r3d adaptRes): under ~42 fps step down to the setting's floor, back up with headroom
      // (the real time between frames: the frame's dt is capped at 0.1 s)
      const D = LOOK.dyn,
        now = performance.now(),
        ms = dyn.last ? Math.min(1000, now - dyn.last) : 16.7,
        dire = dyn.ema > D.dire,
        floor = (dire ? D.rescue[gfx] : D.floor[gfx]) || (dire ? D.rescue.auto : D.floor.auto);
      dyn.last = now;
      dyn.ema += (ms - dyn.ema) * (ms > dyn.ema ? 0.2 : 0.05);
      dyn.t += ms / 1000;
      if (dyn.t >= 1) {
        dyn.t = 0;
        const r0 = dyn.res;
        if (dyn.ema > D.slow && dyn.res > floor) dyn.res = Math.max(floor, +(dyn.res - (dire ? 0.15 : 0.05)).toFixed(2));
        else if (dyn.ema < LOOK.dyn.quick && dyn.res < 1) dyn.res = Math.min(1, +(dyn.res + 0.05).toFixed(2));
        if (dyn.res < D.rescue.auto) dyn.res = D.rescue.auto;
        if (dyn.res !== r0) resize(w, h);
      }
    },
    /** Draw the frame through the post. */
    render() {
      composer.render();
    },
    info: () => ({ look: on ? (hi ? 'high' : 'detailed') : 'fast', res: on ? dyn.res : 1, ao: !!(gtao && gtao.enabled) }),
    /** The baked sky (PMREM) — street level shows it as the background. */
    envTex: () => (envRT ? envRT.texture : null),
    dispose() {
      if (composer) {
        for (const p of composer.passes) p.dispose && p.dispose();
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      if (envRT) envRT.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      if (tex) (tex.det.dispose(), tex.wave.dispose());
      if (shoreU.tShore.value) shoreU.tShore.value.dispose();
      terrainMat.dispose();
      seaMat.dispose();
    }
  };
}
/**
 * The night lights (spec §4.37 2, T-332): warm windows on the town's lots, street lamps along the main roads and streets,
 * floodlights over the explored courts and the venues (model.floods) — one Points mesh of round glows (size per point in
 * metres, kept 2.5–40 px on screen) and one InstancedMesh of light pools on the ground (vertex-coloured discs, additive). Both
 * fade with `lit` and are not drawn by day. Dimmed in the fog like the town. Rebuilt when the lots, roads, courts, fog or the
 * setting change. The detailed look (spec §4.39, T-342): the windows are kit3d `facade`'s lit panes (the same panes town3d draws
 * and lights through NIGHT_U), shop fronts and signs; the lamps get posts with an arm and the courts floodlight towers (one
 * merged mesh, drawn day and night). Low (the Fast setting): today's windows (a third of them, KIT heights as town3d.mjs's
 * instances), no lamp pools, no posts. 2 draw calls at night + 1 (posts) day and night.
 */
import { facade, lampSpots, STREET, mesher, detailMats, lampPost, floodTower, NIGHT_U, rgb } from './kit3d.mjs';
const NIGHT = {
  win: { every: 2.8, col: 2.4, lit: 0.42, size: 1.3, cap: 6000, colors: ['#ffd38a', '#ffe7b0', '#ffc070', '#d8e4ff'] },
  dark: ['tank', 'stack', 'shed', 'barn', 'container', 'warehouse', 'plant', 'depot'],
  lamp: { ...STREET, size: 1.8, pool: 3.5, color: '#ffd9a0', poolColor: '#ff9f45', post: '#3d4248' }, // (kinds, every, up, side, cap: kit3d STREET)
  flood: { up: 11, dx: 14, dz: 9, size: 3.2, pool: 22, color: '#f2f6ff', tower: '#7a7e84' },
  sign: 0.9, // a sign's glow (m)
  shop: 1.4, // a shop front's glows: one every this many metres
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
    posts = null, // lamp posts and floodlight towers (the detailed look)
    key = null,
    n = { win: 0, lamp: 0, flood: 0, post: 0 };
  const clear = () => {
    for (const o of [pts, pools]) if (o) (scene.remove(o), o.geometry !== disc && o.geometry.dispose(), o.dispose && o.dispose());
    if (posts) (scene.remove(posts), posts.geometry.dispose()); // (its material is kit3d's, shared)
    pts = pools = posts = null;
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
    n = { win: 0, lamp: 0, flood: 0, post: 0 };
    const W = NIGHT.win,
      cap = low ? W.cap / 3 : W.cap,
      PW = low ? null : mesher({ wmask: 3 }); // the posts and towers
    // the detailed look: the lit panes of every facade face toward the camera (kit3d facade — the panes town3d draws)
    if (!low)
      (m.land.lots || []).forEach((l, i) => {
        const F = n.win < cap && facade(l, i);
        if (!F) return;
        const { x: x0, z: z0, cs, sn } = F.fr,
          y0 = heightAt(x0, z0),
          dim = 0.4 + 0.6 * fog(x0, z0);
        for (const fc of F.faces) {
          if (fc.wz < 0.2) continue; // facing away from the camera
          for (const o of fc.wins) {
            if (!o.lit || n.win >= cap) continue;
            const hf = (o.half !== undefined ? o.half : fc.half) + 0.12,
              at = u => {
                const lx = fc.nx * hf + fc.nz * u,
                  lz = fc.nz * hf - fc.nx * u;
                return [x0 + lx * cs + lz * sn, z0 - lx * sn + lz * cs];
              },
              k = o.kind === 'shop' ? Math.max(1, Math.round(o.w / NIGHT.shop)) : 1;
            for (let q = 0; q < k; q++) {
              const [px, pz] = at(o.u + (-0.5 + (q + 0.5) / k) * (k > 1 ? o.w : 0));
              add(px, y0 + o.y, pz, o.kind === 'sign' ? NIGHT.sign : W.size, o.glow, dim);
              n.win++;
            }
          }
        }
      });
    // windows (Fast): the faces whose outward side looks toward the camera (+z), floors every W.every m, a few lit per floor
    (low ? m.land.lots || [] : []).forEach((l, i) => {
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
    // street lamps along the main roads and streets (alternating sides: kit3d lampSpots), with a pool of light under each;
    // the detailed look stands a post beside each, its arm out to the lamp head
    const L = NIGHT.lamp,
      postC = rgb(L.post);
    for (const p of lampSpots(m.land.roads)) {
      const { x, z } = p,
        y = heightAt(x, z),
        f = fog(x, z),
        dim = 0.4 + 0.6 * f;
      add(x, y + L.up, z, L.size, L.color, dim);
      if (!low) {
        pool.push([x, y + 0.25, z, L.pool, dim * 0.35, L.poolColor]);
        const ox = -p.uz * p.s, // away from the road
          oz = p.ux * p.s;
        lampPost(
          PW,
          x,
          heightAt(x + ox * 0.9, z + oz * 0.9),
          y + L.up,
          z,
          ox,
          oz,
          postC.map(v => v * f)
        );
        n.post++;
      }
      n.lamp++;
    }
    // floodlights: four towers round each court, a pool over the court
    const F = NIGHT.flood,
      towC = rgb(F.tower);
    for (const at of m.floods || []) {
      const x = at[0] * MAP_M,
        z = at[1] * MAP_M,
        y = heightAt(x, z),
        f = fog(x, z),
        dim = 0.4 + 0.6 * f;
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]) {
        const tx = x + sx * F.dx,
          tz = z + sz * F.dz;
        add(tx, y + F.up, tz, F.size, F.color, dim);
        if (!low)
          (floodTower(
            PW,
            tx,
            heightAt(tx, tz),
            y + F.up,
            tz,
            x,
            z,
            towC.map(v => v * f)
          ),
            n.post++);
      }
      pool.push([x, y + 0.35, z, F.pool, dim * 0.35, F.color]);
      n.flood++;
    }
    const pg = PW && PW.geometry();
    if (pg) {
      posts = new THREE.Mesh(pg, detailMats().wall);
      posts.castShadow = posts.receiveShadow = true;
      posts.frustumCulled = false;
      scene.add(posts);
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
      NIGHT_U.value = lit; // the lit panes (kit3d glass)
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
  const look = richLook(renderer, scene, cam, sun, hemi), // the detailed look (T-343); off = the Fast setting's flat look
    flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    gfx = () => (typeof G !== 'undefined' && G && G.gfx) || 'auto';

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
    pickN = 0,
    held = null, // QA: a time of day the clock holds (holdClock)
    interiors = null, // the optional interiors layer (interior3d.mjs, T-336b)
    st = 0; // the camera's street weight this frame (C.street())
  const bgCol = scene.background, // the clock's sky colour (skyAt writes it); street level shows the baked sky instead
    haze = (scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6)); // street level: distance haze (off on the map: 1e6 m)

  // camera and input (mapcam3d.mjs): it reads the parts below as they appear
  const C = createMapCam(cam, canvas, sun, () => ({
    terrain,
    mesh,
    avatar,
    cur,
    on: onW,
    cw,
    ch,
    walkK,
    consume: xy => !!(interiors && interiors.at && interiors.at(xy))
  }));
  let hexOn = !(typeof location !== 'undefined' && /[?&]nohex\b/.test(location.search));
  const showHex = () => scene.traverse(o => o.userData && o.userData.hex && (o.visible = hexOn));
  const build = m => {
    terrain = buildTerrain(m);
    mesh = new THREE.Mesh(terrain.geo, low ? flatMat : look.terrainMat);
    look.setTerrain(terrain);
    look.set(!low, water);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    water.position.set(terrain.W / 2, 0, terrain.D / 2);
    avatar = createAvatar(scene);
    town = createTown(scene, terrain.heightAt, { fast: () => low }); // the Fast boxes follow setLow (T-342 × T-343)
    furn = createFurniture(scene, terrain.heightAt);
    life = createLife(scene, terrain.heightAt);
    nature = createNature(scene, terrain.heightAt);
    war = warLayer(scene, terrain.heightAt);
    night = nightLayer(scene, terrain.heightAt);
    furn.layer.addEventListener('wheel', C.onWheel, { passive: false }); // wheel over a pin still zooms
    // the interiors (T-336b) when that module exists: a missing file only rejects this import
    import('./interior3d.mjs')
      .then(mod => {
        if (dead || !terrain || !mod || typeof mod.createInteriors !== 'function') return;
        interiors = mod.createInteriors(scene, terrain.heightAt);
        if (cur && interiors.sync) interiors.sync(cur);
      })
      .catch(() => (interiors = null));
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
    if (held !== null) return void (tod = held); // (QA: holdClock)
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
    if (hoverId !== null) ((hoverId = null), (canvas.style.cursor = ''), life && life.hover(null), on && on.hover && on.hover(null));
  };
  /** A right-click on a named figure opens its menu too (spec §4.37 7); the browser's own menu never shows over the map. */
  const onCtx = e => {
    e.preventDefault();
    if (!life || !cur || (avatar && avatar.busy()) || !on || !on.person || C.dragged()) return; // (a right-drag orbited)
    const r = canvas.getBoundingClientRect(),
      look = cur.life && cur.life.look,
      id = life.pick(cam, e.clientX - r.left, e.clientY - r.top, cw, ch, look ? look.pick : 16);
    if (id !== null) on.person(id);
  };
  canvas.addEventListener('pointermove', onPtr);
  canvas.addEventListener('pointerleave', offPtr);
  canvas.addEventListener('contextmenu', onCtx);
  /** The named figure under the pointer (every few frames, or right after a move): tell the UI (hover tip), set the cursor. */
  const hoverStep = () => {
    if (!ptr || !life || !cur || pickN-- > 0) return;
    pickN = 6;
    const look = cur.life && cur.life.look,
      id = life.pick(cam, ptr.x, ptr.y, cw, ch, look ? look.pick : 16);
    if (id !== hoverId) canvas.style.cursor = id !== null ? 'pointer' : '';
    if (id !== hoverId) life.hover(id);
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
    look.resize(cw, ch);
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
  };
  /** Street level's extras each frame: the detail ring round the camera, the sky and the haze, the interiors' tick. */
  const streetLook = () => {
    const [ax, az] = avatar.pos(),
      inD = C.inDistrict(ax, az);
    town.ring(cam.position.x, cam.position.z, st, inD);
    const sky = st > 0.15 && look.on && look.envTex();
    if (sky) scene.background = sky;
    haze.color.copy(bgCol);
    haze.near = st > 0 ? 160 + (1 - st) * 4000 : 1e6;
    haze.far = st > 0 ? haze.near + 900 + (1 - st) * 6000 : 2e6;
    if (interiors && interiors.tick)
      interiors.tick(clock - (interiors._t || clock), {
        cam,
        you: api.youPos(),
        street: st,
        low
      });
    if (interiors) interiors._t = clock;
  };
  renderer.info.autoReset = false; // (the post draws several passes: info counts the whole frame)
  const draw = () => (renderer.info.reset(), look.on ? look.render() : renderer.render(scene, cam));
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
      st = C.street();
      avatar.setLife(st);
      avatar.tick(dt * walkK, terrain.heightAt); // your walk at the chosen speed (setWalk; the others keep theirs)
      for (const f of figs.values()) f.tick(dt, terrain.heightAt);
      clock += dt;
      clockStep(dt);
      scene.background = bgCol; // (skyAt mixes into the colour)
      lit = cur && cur.time ? skyAt(cur.time.keys, tod, sun, hemi, scene) : ((hemi.intensity = 0.9), 0);
      if (look.on) hemi.intensity *= lerp(LOOK.hemi[0], LOOK.hemi[1], lit); // (by day the sky's environment light adds the rest)
      if (C.view) life.ringScale((14 * 2 * C.view.d * Math.tan((cam.fov * Math.PI) / 360)) / (ch || 1) / 0.7); // a ring ≥ ~14 px
      life.tick(dt, clock, tod, cam, st); // (cam: the nearest named people on screen as VRMs; st: life size and the near VRMs at street level)
      hoverStep();
      nature.tick(dt, clock);
      furn.pulse(clock);
      war.pulse(clock);
      C.step(dt);
      st = C.street();
      streetLook();
      if (cur && cur.time) sun.position.copy(sun.target.position).addScaledVector(SKY.dir, 150); // the hour's sun (after the camera placed it)
      night.set(lit, (ch * renderer.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360)), renderer.getPixelRatio());
      look.step(dt, clock, lit, tod, C.view, gfx());
      const n = avatar.lapse(),
        txt = n ? `×${n < 2 ? n.toFixed(1) : Math.round(n)}` : '';
      if (badge && badge.textContent !== txt) {
        badge.textContent = txt;
        badge.hidden = !txt;
      }
      draw();
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
      nature.sync(m, low);
      if (interiors && interiors.sync) interiors.sync(m);
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
    /** The Fast graphics setting: fewer named figures (life.look.low) and night lights, the town's instanced boxes, no posts. */
    setLow(v) {
      if (low === !!v) return;
      low = !!v;
      if (cur && life) (town.sync(cur), life.sync(cur, low), night.sync(cur, low));
      if (mesh && cur) (look.set(!low, water), (mesh.material = low ? flatMat : look.terrainMat), nature.sync(cur, low)); // the look (T-343)
    },
    /** The shown clock: { week (days), tod (0–1), lit (0–1) } — for QA and the UI. */
    clock: () => ({ week: wt, tod, lit }),
    /** Dev / QA: jump the shown clock to week time w (it then runs on toward the phase from there — forward only). */
    setClock(w) {
      wt = w;
      tod = w - Math.floor(w);
    },
    /** Dev / QA: hold the time of day at t (0–1) whatever the phase asks; null lets the clock run again. */
    holdClock(t) {
      held = t === null || t === undefined ? null : t;
    },
    /** Dev / QA: the mean time (ms) to draw one frame, n frames drawn back to back and waited for (a 1-px read). */
    bench(n = 5) {
      const gl = renderer.getContext(),
        px = new Uint8Array(4),
        t0 = performance.now();
      for (let i = 0; i < n; i++) (draw(), gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px));
      return +((performance.now() - t0) / n).toFixed(1);
    },
    /** Dev / QA: put the camera over world point (x, z) at distance d (m); fields left out keep their value. */
    setView(v) {
      if (!C.view) return;
      Object.assign(C.view, v);
      C.fit();
    },
    /** The ring under a named figure's feet (the figure menu's person), or none (null). */
    mark(id) {
      if (life) life.mark(id);
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
    /** Street level (T-336a): 0 = the map, 1 = the follow camera behind you. */
    street: () => st,
    /** The camera's world position [x, y, z] (m). */
    camPos: () => [cam.position.x, cam.position.y, cam.position.z],
    /** Your avatar's world position [x, y (ground), z] (m). */
    youPos() {
      if (!avatar) return [0, 0, 0];
      const [x, z] = avatar.pos();
      return [x, terrain ? terrain.heightAt(x, z) : 0, z];
    },
    /** The interiors layer (T-336b), or null when its module is missing / not loaded yet. */
    interiors: () => interiors,
    /** Dev / QA: the orbit angle round you at street level (rad). */
    setYaw: v => C.setYaw(v),
    /** Dev / QA: take you back to the shown position (a WASD walk the rules refused). */
    home() {
      if (avatar && cur && cur.you && cur.you.at) avatar.setTarget(cur.you.at);
    },
    heightAt: (x, z) => (terrain ? terrain.heightAt(x, z) : 0),
    info: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geos: renderer.info.memory.geometries,
      tex: renderer.info.memory.textures,
      life: life && life.count(),
      night: night && night.count(),
      town: town && town.count(), // (null on Fast)
      clock: { week: wt, tod, lit },
      nature: nature && nature.count(),
      ...look.info(),
      view: C.view && { ...C.view },
      street: +st.toFixed(3),
      ring: town && town.ringInfo ? town.ringInfo() : null
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
      if (interiors && interiors.dispose) interiors.dispose();
      interiors = null;
      if (war) war.dispose();
      if (night) night.dispose();
      canvas.removeEventListener('pointermove', onPtr);
      canvas.removeEventListener('pointerleave', offPtr);
      canvas.removeEventListener('contextmenu', onCtx);
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      C.dispose();
      if (furn) furn.layer.removeEventListener('wheel', C.onWheel);
      canvas.remove();
      look.dispose();
      flatMat.dispose();
      releaseScene(scene, renderer, sun);
    }
  };
  return api;
}
