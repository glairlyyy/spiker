// The building kit of the 3D island: one registry of every kind a settlement lot or a landmark can be (spec §4.18).
// Procedural now (boxes, gables, hip roofs and prisms, flat-shaded, a palette taken from the REGIONS colours); a CC0 model
// pack can replace any kind later without touching rules or data — see "Swapping a kind" below. Plain geometry, no scene.
//   KIT[kind]            filler lots (MapModel.lots kinds): { geo(), mat, scale: [width, height, depth], colors }
//   LANDMARKS[kind]      landmarks (LANDMARK kinds): { h, w, d, build(accent) → a vertex-coloured BufferGeometry }
//   landmarkHeight(kind) how tall a landmark is in metres (pins float above it); landmarkYaw(L, roads) which way it faces
//   KIT_PROPS[tag]       a place's kit beside its landmark (spec §4.33): racks, crates + a crane, a track, steps, mats …
//
// Swapping a kind: a filler kind's `geo()` may return any BufferGeometry whose footprint is 1 × 1 and height 1 with its feet at
// y = 0 (take the one from a loaded GLTF mesh, e.g. from assets/models/); `scale` then sizes it per lot (width and depth × the
// lot's side, height in metres). A landmark kind's `build(accent)` may return any geometry with its door facing +z, centred on
// x / z and its feet at y = 0, within `w` × `d` metres (give it a `color` attribute, or all-white vertex colours to keep the
// model's own look). Nothing else (town3d.mjs, rules, map data) needs to change.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, clamp } from './geo3d.mjs';
import { silPatch } from './look3d.mjs';

/** Region accents (the REGIONS colours): the palettes below lean on them. */
const ACC = { wei: '#d08a2e', wu: '#5b8def', shu: '#2fb8a0', outlaws: '#ff8c42', gloria: '#ff5da2', open: '#f5e6a8' };

/** Merge geometries into one and free the parts. */
export const mergeParts = parts => {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
};
/** A flat-shaded part: non-indexed geometry with one colour in its vertices (merging needs the same attributes everywhere). */
export const part = (geo, color) => {
  const g = geo.index ? geo.toNonIndexed() : geo,
    c = new THREE.Color(color),
    n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** A box w × h × d with its feet at y, centred on (x, z). */
export const box = (w, h, d, x, y, z, color) => part(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color);
/** A four-sided hip roof (a pyramid) over w × d, its eaves at y. */
export const hip = (w, h, d, x, y, z, color) =>
  part(
    new THREE.ConeGeometry(0.7071, 1, 4)
      .rotateY(Math.PI / 4)
      .scale(w, h, d)
      .translate(x, y + h / 2, z),
    color
  );
/** A post (a thin box) from y up h. */
const post = (x, y, z, h, color, t = 0.35) => box(t, h, t, x, y, z, color);
/** An elliptical ring (hole rxi × rzi, outer rxo × rzo) from y up h: the stepped stands of a bowl. */
const ring = (rxi, rzi, rxo, rzo, y, h, color) => {
  const sh = new THREE.Shape().absellipse(0, 0, rxo, rzo, 0, Math.PI * 2, false);
  sh.holes.push(new THREE.Path().absellipse(0, 0, rxi, rzi, 0, Math.PI * 2, true));
  return part(
    new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 32 }).rotateX(-Math.PI / 2).translate(0, y, 0),
    color
  );
};

/** Unit shapes (footprint 1 × 1, height 1, feet at y = 0), shared by every kind that uses them. */
const SHAPES = new Map();
const shape = name => {
  if (!SHAPES.has(name)) {
    const g =
      name === 'gable'
        ? mergeGeometries([
            part(new THREE.BoxGeometry(1, 0.62, 1).translate(0, 0.31, 0), '#ffffff'),
            part(
              new THREE.ConeGeometry(0.7071, 0.38, 4)
                .rotateY(Math.PI / 4)
                .scale(1.06, 1, 1.06)
                .translate(0, 0.81, 0),
              '#9a9a9a'
            )
          ])
        : name === 'stepped'
          ? // a terraced house: a wide lower floor and a narrower upper one set back (its door side is +z)
            mergeGeometries([
              part(new THREE.BoxGeometry(1, 0.55, 1).translate(0, 0.275, 0), '#ffffff'),
              part(new THREE.BoxGeometry(0.72, 0.45, 0.62).translate(0, 0.775, -0.18), '#d8d8d8')
            ])
          : name === 'cyl'
            ? part(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), '#ffffff') // tanks and chimneys
            : part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), '#ffffff');
    SHAPES.set(name, g);
  }
  return SHAPES.get(name);
};
const MAT = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true });

/** Filler kinds: `scale` = [width ×, height m, depth ×] (width / depth × the lot's side in metres), `colors` = the wall palette. */
/** rise (0–1): how much a lot's height factor `h` stretches this kind: height × (1 + 1.2 × h × rise) (town3d.mjs). */
const filler = (shp, scale, colors, rise = 0.15) => ({ geo: () => shape(shp), mat: MAT, scale, colors, rise });
export const KIT = {
  // Wei: dense city blocks, towers, shopfronts (gold-grey)
  block: filler('box', [1, 5, 1], ['#b9b3a4', '#a8a293', '#c4b48a'], 0.7),
  tower: filler('box', [0.8, 9, 0.8], ['#9aa3ad', '#8a94a0', '#c9b27a'], 1),
  shop: filler('box', [1.1, 3.4, 1], ['#cdb98d', '#d0a35a', '#b9b3a4'], 0.3),
  // Wei's civic core: wide office towers; the Ring: mid-rise apartment blocks (spec §4.19a)
  office: filler('box', [1.4, 10, 1.2], ['#7f97ad', '#8fa3b5', '#a7b4bf'], 1),
  apartment: filler('box', [1.5, 6, 1.1], ['#c9bfae', '#bfb5a2', '#d4c7b0', '#b3aa9a'], 0.4),
  // the North works: power plant halls, tanks, chimneys, the bus depot
  plant: filler('box', [2.2, 5.5, 1.6], ['#8e9095', '#7d8087'], 0),
  depot: filler('gable', [2.4, 4.2, 1.4], ['#7c868f', '#6f7a83'], 0),
  tank: filler('cyl', [1.3, 4.5, 1.3], ['#d6d6d0', '#c4c8c8', '#a9b0b4'], 0),
  stack: filler('cyl', [0.45, 16, 0.45], ['#9c8f85', '#b35a4a'], 0),
  // Wu: fishing villages (weathered wood, blue accents)
  hut: filler('gable', [1, 2.7, 1], ['#b99a6b', '#a68a5e', '#c9ad7c']),
  shed: filler('gable', [1.2, 2.2, 0.9], ['#8d7b62', '#7b6c58', '#9aa6ad']),
  boathouse: filler('gable', [1.5, 3.4, 1.1], ['#6f93ad', '#7fa1b6', '#b99a6b']),
  // Shu: terraced hill villages (stone and tile)
  house: filler('gable', [1, 3, 1], ['#a98f74', '#9b8a76', '#b5a18a']),
  barn: filler('gable', [1.3, 3.6, 1.1], ['#8a6a4c', '#7c6a55', '#9a8266']),
  // Central Academy: the campus quad
  hall: filler('box', [1.2, 5.5, 1], ['#d9d2bd', '#cfc7ae', '#e3dcc8'], 0.3),
  dorm: filler('box', [1, 7, 0.8], ['#cfc3a8', '#c4b898', '#d9d2bd']),
  // the Outlaws: shacks and shipping containers under the overpass
  shack: filler('box', [1, 2.2, 1], ['#7d6a56', '#6b6a66', '#8a7560']),
  container: filler('box', [1.8, 2.5, 0.8], ['#b5533c', '#3f6f8f', '#c98a2e', '#6f8f5a']),
  // St. Gloria: a walled compound of villas
  villa: filler('gable', [1.2, 4.2, 1], ['#efe3d0', '#f0d9e0', '#e6dcc8']),
  gatehouse: filler('box', [0.8, 3.5, 0.8], ['#d8c8b8', '#c9b8a8']),
  // Wei Old Town: the refugees' low rowhouses, tight lanes (weathered tile, plaster)
  rowhouse: filler('gable', [0.8, 3.2, 1.3], ['#a89580', '#9c8a76', '#b8a48c', '#8f8a82'], 0.25),
  // Wu town: barracks (long, plain), workshops, a covered market
  barracks: filler('box', [1.7, 3.4, 0.7], ['#8d9097', '#7f858d', '#9aa0a6']),
  workshop: filler('gable', [1.3, 3.2, 1], ['#8f7e66', '#7c8a8c', '#a38f72']),
  market: filler('box', [1.5, 2.6, 1.2], ['#c9803a', '#b5532f', '#4f8f8a', '#d0b04a']),
  // the harbor: long warehouses
  warehouse: filler('gable', [2, 4.2, 1.1], ['#7b8791', '#8a7a6a', '#6f7f86']),
  // the faded beach-boom strip: pastel resort hotels and bright kiosks
  resort: filler('box', [1.9, 5.5, 1.2], ['#e8c4cc', '#c4dce8', '#e8dcb0', '#cfe0c0'], 0.3),
  kiosk: filler('box', [0.7, 2.4, 0.7], ['#f0a050', '#e86a6a', '#58b8c8', '#f0d060']),
  // Shu: terraced hill houses (stepped, stone and tile)
  terrace: filler('stepped', [1.1, 3.4, 1], ['#a98f74', '#9b8a76', '#b5a18a', '#8f8068'], 0.2)
};

const WOOD = '#8a6a4c',
  DARK = '#4a4a52',
  STONE = '#9a978f',
  LIGHT = '#e8e4d8',
  RED = '#b03a3a';

/** Landmarks: h = height (m), w / d = footprint (m, d along the door axis); build(accent) draws it with the door on +z. */
export const LANDMARKS = {
  // a gym hall with a coloured band and a front door
  gym: {
    h: 6,
    w: 13,
    d: 9,
    build: a => [
      box(13, 5, 9, 0, 0, 0, '#c9c6bd'),
      box(13.4, 0.5, 9.4, 0, 5, 0, DARK),
      box(13.2, 1, 9.2, 0, 2.6, 0, a),
      box(2.2, 3, 0.4, 0, 0, 4.6, DARK)
    ]
  },
  // an open court: slab, two posts and a net
  court: {
    h: 4,
    w: 19,
    d: 10,
    build: a => [
      box(19, 0.3, 10, 0, 0, 0, '#d8c690'),
      box(8, 0.31, 0.2, 0, 0, 0, '#ffffff'),
      post(0, 0, -5.2, 3.6, DARK, 0.3),
      post(0, 0, 5.2, 3.6, DARK, 0.3),
      box(0.1, 1.1, 10, 0, 2.3, 0, a)
    ]
  },
  // a dojo with a hip roof and a gate in front
  dojo: {
    h: 6,
    w: 10,
    d: 12,
    build: a => [
      box(8, 3.2, 8, 0, 0, -1, WOOD),
      hip(10.5, 2.8, 10.5, 0, 3.2, -1, DARK),
      post(-2.2, 0, 4.6, 3.4, a, 0.45),
      post(2.2, 0, 4.6, 3.4, a, 0.45),
      box(6, 0.5, 0.7, 0, 3.4, 4.6, a)
    ]
  },
  // an HQ: a tall tower in the region's colour on a low base
  hq: {
    h: 17,
    w: 12,
    d: 12,
    build: a => [
      box(12, 3.6, 12, 0, 0, 0, '#c9c6bd'),
      box(6, 12.5, 6, 0, 3.6, -0.5, a),
      box(7, 0.7, 7, 0, 16.1, -0.5, DARK),
      box(2.4, 2.4, 0.4, 0, 0, 6.1, DARK)
    ]
  },
  // a hotel: a long light block with a roof strip and a canopy
  hotel: {
    h: 10,
    w: 15,
    d: 8,
    build: a => [
      box(15, 9, 8, 0, 0, 0, '#e0dccf'),
      box(15.4, 0.8, 8.4, 0, 9, 0, a),
      box(5, 0.4, 2.6, 0, 3, 5.2, a),
      box(2.2, 3, 0.4, 0, 0, 4.1, DARK)
    ]
  },
  // a noodle / snack stall: a counter under a striped awning
  stall: {
    h: 3,
    w: 5,
    d: 4,
    build: a => [
      box(4, 1.1, 2.2, 0, 0, -0.6, WOOD),
      box(4.6, 0.25, 3, 0, 2.4, 0, a),
      post(-2, 0, 1.2, 2.4, DARK, 0.25),
      post(2, 0, 1.2, 2.4, DARK, 0.25),
      post(-2, 0, -1.6, 2.4, DARK, 0.25),
      post(2, 0, -1.6, 2.4, DARK, 0.25)
    ]
  },
  // a shrine: a stone base, a small hall with a hip roof and a torii in front
  shrine: {
    h: 6,
    w: 8,
    d: 10,
    build: () => [
      box(7, 0.6, 7, 0, 0, -1, STONE),
      box(4, 2.4, 4, 0, 0.6, -1, LIGHT),
      hip(5.4, 2, 5.4, 0, 3, -1, RED),
      post(-1.8, 0, 3.8, 4, RED, 0.4),
      post(1.8, 0, 3.8, 4, RED, 0.4),
      box(5.2, 0.45, 0.6, 0, 3.6, 3.8, RED)
    ]
  },
  // a street cage: four wire walls round a concrete floor and a hoop post
  cage: {
    h: 4,
    w: 11,
    d: 11,
    build: a => [
      box(11, 0.25, 11, 0, 0, 0, '#6b6b70'),
      box(11, 3.4, 0.2, 0, 0, -5.4, '#8f9399'),
      box(11, 3.4, 0.2, 0, 0, 5.4, '#8f9399'),
      box(0.2, 3.4, 11, -5.4, 0, 0, '#8f9399'),
      box(0.2, 3.4, 11, 5.4, 0, 0, '#8f9399'),
      post(0, 0, -3.5, 3.4, a, 0.35)
    ]
  },
  // Central Academy: a main hall with a clock tower and steps
  campus: {
    h: 14,
    w: 17,
    d: 12,
    build: () => [
      box(16, 6.5, 9, 0, 0, -1, '#e0d9c3'),
      box(16.4, 0.6, 9.4, 0, 6.5, -1, '#8f6a4a'),
      box(3.4, 13.5, 3.4, 0, 0, -1, '#d4ccb4'),
      hip(4.2, 2.4, 4.2, 0, 13.5, -1, '#8f6a4a'),
      box(7, 0.5, 2.6, 0, 0, 4.2, STONE)
    ]
  },
  // the old ritual ground: a worn sand circle with a ring of low stones (never labelled, no pin)
  ritual: {
    h: 1.2,
    w: 16,
    d: 16,
    footing: false,
    build: () => [
      part(new THREE.CylinderGeometry(7.5, 7.8, 0.12, 28).translate(0, 0.06, 0), '#e2d3a2'),
      part(new THREE.CylinderGeometry(3.2, 3.4, 0.14, 20).translate(0, 0.08, 0), '#d4c28c'),
      ...Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2,
          g = box(1.5, 1.3 + 0.45 * ((i * 5) % 3), 1, 0, 0, 0, '#8f8b82');
        return g.rotateY(-a).translate(Math.cos(a) * 7.7, 0, Math.sin(a) * 7.7);
      })
    ]
  },
  // official venues (spec §4.21) --------------------------------------------------------------------------------------------
  // the League Arena: an oval bowl of stepped stands, a roof ring and four floodlight masts (the biggest building on the island)
  arena: {
    h: 22,
    w: 42,
    d: 34,
    build: a => {
      const out = [
        part(new THREE.CylinderGeometry(1, 1, 1, 32).scale(11, 0.2, 7.5).translate(0, 0.1, 0), '#5f9a62'), // the pitch
        ring(11, 7.5, 14.5, 11, 0, 3, '#c9c6bd'),
        ring(14.5, 11, 17.5, 14, 0, 6, '#bdb9ae'),
        ring(17.5, 14, 20, 16.5, 0, 9.5, '#aaa69b'),
        ring(15.4, 11.9, 20.6, 17, 11.2, 0.7, a) // the roof ring, on the back tier
      ];
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        out.push(post(Math.cos(t) * 19.3, 9.5, Math.sin(t) * 15.8, 2.2, DARK, 0.5)); // the roof's posts
      }
      for (const [x, z] of [
        [-18.5, -14.5],
        [18.5, -14.5],
        [-18.5, 14.5],
        [18.5, 14.5]
      ]) {
        out.push(post(x, 0, z, 20, DARK, 0.7), box(3.4, 1.4, 1.2, x, 20, z, '#f6f0c8')); // a floodlight mast
      }
      out.push(box(5, 3.2, 0.6, 0, 0, 16.9, a), box(1.8, 2.4, 0.5, 0, 0, 17.3, DARK)); // the gate
      return out;
    }
  },
  // Academy Hall: a long gym hall under a curved roof
  hall: {
    h: 8,
    w: 18,
    d: 11,
    build: a => [
      box(18, 4.4, 10, 0, 0, 0, '#d8d3c4'),
      box(18.4, 0.9, 10.4, 0, 1.9, 0, a),
      part(
        new THREE.CylinderGeometry(1, 1, 1, 18)
          .rotateZ(Math.PI / 2)
          .scale(18.4, 3.6, 5.3)
          .translate(0, 4.4, 0),
        '#6b7a8f'
      ),
      box(3, 3, 0.5, 0, 0, 5.1, DARK),
      box(6, 0.9, 0.5, 0, 4.8, 5.3, LIGHT),
      ...[-6.5, -3.2, 3.2, 6.5].map(x => box(1.4, 1.2, 0.4, x, 2.2, 5.1, '#8fb4c8'))
    ]
  },
  // Beach Stadium: faded pastel stands round a sand court, flags on the corners (a beach-boom relic)
  stadium: {
    h: 8,
    w: 25,
    d: 21,
    build: a => {
      const out = [
        box(15, 0.6, 10, 0, 0, 0, '#ead9a6'),
        ring(8, 5.6, 10, 7.6, 0, 1.4, '#c4dce8'),
        ring(10, 7.6, 11.8, 9.4, 0, 2.6, '#e8c4cc'),
        post(-0.1, 0.2, -5, 1.8, LIGHT, 0.25),
        post(-0.1, 0.2, 5, 1.8, LIGHT, 0.25),
        box(0.12, 1, 10, 0, 0.9, 0, LIGHT)
      ];
      for (const [x, z] of [
        [-10.6, -8.6],
        [10.6, -8.6],
        [-10.6, 8.6],
        [10.6, 8.6]
      ]) {
        out.push(post(x, 2.4, z, 4.6, LIGHT, 0.25), box(1.8, 1, 0.12, x + 1, 6.1, z, ACC.wu));
      }
      out.push(box(4, 2.2, 0.5, 0, 0, 9.6, a));
      return out;
    }
  },
  // Highland Court: an open hillside court; stone terrace steps climb behind it for seats
  hillcourt: {
    h: 5,
    w: 23,
    d: 19,
    build: () => [
      box(21, 0.4, 12, 0, 0, 2, '#b9b4a4'),
      post(-5, 0.4, 2, 3.2, WOOD, 0.35),
      post(5, 0.4, 2, 3.2, WOOD, 0.35),
      box(10, 0.9, 0.12, 0, 2.4, 2, LIGHT),
      box(22, 0.8, 2.4, 0, 0, -5.4, STONE),
      box(22, 1.6, 2.4, 0, 0, -7.8, '#8f8c84'),
      box(22, 2.4, 2.4, 0, 0, -10.2, '#7f7c74'),
      box(0.8, 2.4, 6, -11.2, 0, -7.6, '#7f7c74'),
      box(0.8, 2.4, 6, 11.2, 0, -7.6, '#7f7c74')
    ]
  },
  // the airport (spec §4.18d): the terminal and its tower at the origin (landside, door on −z), an apron with a parked plane,
  // a taxiway and the runway seaward (+z) along the shore (x), a cargo shed; slabs reach below the ground for the slope
  airport: {
    h: 14,
    w: 88,
    d: 26,
    footing: false,
    build: a => {
      const TAR = '#55575c',
        CON = '#a29f96',
        WHITE = '#eeeae0',
        out = [
          box(84, 2.2, 8, -32, -2, 15, TAR), // the runway (x −74…10, z 11…19)
          box(26, 2.15, 7, -2, -2, 6, CON), // the apron
          box(3, 2.1, 4, -12, -2, 11, TAR), // the taxiway
          box(17, 2.1, 9, 0, -2, -1, CON), // the terminal's slab
          box(16, 4.6, 8, 0, 0, -1, '#d9d6cc'), // the terminal
          box(16.2, 1.6, 0.3, 0, 1.6, 3.05, '#8fb4c8'), // its glass front (airside)
          box(16.4, 0.5, 8.4, 0, 4.6, -1, a),
          box(3, 2.4, 0.4, 0, 0, -5.1, DARK), // the landside doors
          box(2, 12, 2, 11, 0, -3, '#cfcac0'), // the control tower
          box(3.6, 2, 3.6, 11, 12, -3, '#8fb4c8'),
          box(4, 0.4, 4, 11, 14, -3, DARK),
          box(12, 4.4, 7, -26, -1.5, -4, '#9aa3ad'), // the cargo shed
          box(12.2, 0.4, 7.2, -26, 2.9, -4, '#7f858d'),
          // the parked plane: fuselage, wings, tail
          part(new THREE.CylinderGeometry(0.8, 0.8, 11, 10).rotateZ(Math.PI / 2).translate(-3, 1.3, 6.5), WHITE),
          part(new THREE.ConeGeometry(0.8, 1.6, 10).rotateZ(-Math.PI / 2).translate(3.3, 1.3, 6.5), WHITE),
          box(2, 0.15, 11, -3.5, 1.1, 6.5, '#d8d4ca'),
          box(1, 0.12, 4, -8.2, 1.5, 6.5, '#d8d4ca'),
          box(1.4, 2, 0.15, -8.4, 1.5, 6.5, a)
        ];
      for (let x = -70; x <= 6; x += 6) out.push(box(3, 0.06, 0.4, x, 0.2, 15, WHITE)); // the centre line
      for (const x of [-72.5, 8.5]) for (const z of [12.5, 14, 16, 17.5]) out.push(box(2, 0.06, 0.8, x, 0.2, z, WHITE)); // the thresholds
      return out;
    }
  },
  // your home: a small house with a hip roof and a chimney
  home: {
    h: 6,
    w: 7,
    d: 6,
    build: a => [
      box(6, 3.2, 5, 0, 0, 0, '#e3d5b8'),
      hip(7.2, 2.4, 6.2, 0, 3.2, 0, a),
      box(0.8, 1.6, 0.8, 1.8, 3.6, -1, STONE),
      box(1.2, 2, 0.3, 0, 0, 2.6, WOOD)
    ]
  }
};

/**
 * Kit props (spec §4.33, T-310): what a training place's kit looks like beside its landmark — racks, crates and a crane, a track,
 * steps, mats … Each `(accent) → parts` sits in a slot about 4 × 4 m, centred, feet at y = 0; merged into the landmark (no draw call).
 */
const BLUE = '#3f6fb5',
  SAND = '#e3cf96';
const KIT_PROPS = {
  weights: a => [
    post(-1.4, 0, 0, 2.2, DARK, 0.25),
    post(1.4, 0, 0, 2.2, DARK, 0.25),
    box(3.6, 0.15, 0.15, 0, 1.9, 0, STONE),
    box(0.3, 0.9, 0.9, -1.6, 1.5, 0, DARK),
    box(0.3, 0.9, 0.9, 1.6, 1.5, 0, DARK),
    box(3.2, 0.12, 1.6, 0, 0, 1.6, a)
  ],
  crates: a => [
    box(1.4, 1.2, 1.4, -1.2, 0, 0.8, WOOD),
    box(1.4, 1.2, 1.4, 0.3, 0, 0.8, WOOD),
    box(1.4, 1.2, 1.4, -0.45, 1.2, 0.8, '#a07c56'),
    post(1.6, 0, -1.4, 7, a, 0.5),
    box(5, 0.4, 0.4, 0.2, 6.6, -1.4, a),
    post(-2.1, 0, -1.4, 0.1, DARK)
  ],
  plyo: a => [box(1, 0.6, 1, -1.4, 0, 0, a), box(1, 1, 1, 0, 0, 0, LIGHT), box(1, 1.4, 1, 1.4, 0, 0, a)],
  steps: () => [0, 1, 2, 3, 4].map(i => box(3, 0.45 * (i + 1), 0.8, 0, 0, 1.6 - i * 0.8, STONE)),
  track: a => [ring(1.6, 1.6, 2.4, 2.4, 0, 0.08, '#b0563a'), box(0.15, 0.09, 1.6, 2, 0, 0, a)],
  dunes: () => [hip(3.6, 1.2, 3, -0.4, 0, 0.2, SAND), hip(2.4, 0.8, 2, 1.2, 0, -1, SAND)],
  trail: a => [post(-1.2, 0, 1, 1.4, WOOD, 0.3), box(0.9, 0.5, 0.1, -1.2, 1, 1.05, a), box(3.6, 0.06, 0.9, 0.4, 0, -0.6, '#8b7355')],
  water: () => [box(4, 0.3, 3, 0, 0, 0, LIGHT), box(3.4, 0.32, 2.4, 0, 0.01, 0, BLUE)],
  sand: a => [
    box(4, 0.08, 3, 0, 0, 0, SAND),
    post(-1.6, 0, 0, 2.4, DARK, 0.15),
    post(1.6, 0, 0, 2.4, DARK, 0.15),
    box(3.2, 0.5, 0.05, 0, 1.6, 0, a)
  ],
  mats: a => [box(1.8, 0.12, 3, -1, 0, 0, a), box(1.8, 0.12, 3, 1, 0, 0, BLUE)],
  chores: a => [box(1.6, 1.6, 1.6, 0, 0, 0, LIGHT), hip(2, 0.8, 2, 0, 1.6, 0, a), post(1.3, 0, 1, 1.3, WOOD, 0.12)],
  film: a => [
    post(-1.2, 0, 0, 2.4, DARK, 0.2),
    post(1.2, 0, 0, 2.4, DARK, 0.2),
    box(2.8, 1.6, 0.12, 0, 1, 0, LIGHT),
    box(2.4, 0.08, 0.14, 0, 2.6, 0, a)
  ],
  books: a => [box(2.6, 2, 0.7, 0, 0, 0, WOOD), box(2.3, 0.35, 0.72, 0, 0.3, 0, a), box(2.3, 0.35, 0.72, 0, 1.1, 0, RED)],
  gym: () => []
};
/** Where the n-th prop of a landmark (w × d m) sits: along its sides, clear of the door (+z). */
const propSlot = (L, i) => [(i % 2 ? -1 : 1) * (L.w / 2 + 2.6), -L.d / 4 + Math.floor(i / 2) * 4.4];

/** Height in metres of a landmark kind (pins float above it); 3 for an unknown kind. */
export const landmarkHeight = kind => (LANDMARKS[kind] ? LANDMARKS[kind].h : 3);
/** A landmark's yaw (rad): its door (+z) faces the nearest road (overpasses aside), or its fixed `rot` (the airport). Map units in. */
export function landmarkYaw(L, roads) {
  if (L.rot != null) return L.rot;
  const [mx, my] = L.at;
  let best = Infinity,
    yaw = 0;
  for (const r of roads || []) {
    if (r.kind === 'overpass') continue;
    const [a, b] = r.pts,
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = clamp(((mx - a[0]) * dx + (my - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1),
      px = a[0] + dx * t - mx,
      py = a[1] + dy * t - my,
      d = Math.hypot(px, py);
    if (d < best) ((best = d), (yaw = d > 0.5 ? Math.atan2(px, py) : 0));
  }
  return yaw;
}
/** Build a landmark's merged geometry (accent = a CSS colour; kit = the place's KITS tags → props beside it): door on +z, centred, feet at y = 0. */
export const buildLandmark = (kind, accent, kit = []) => {
  const L = LANDMARKS[kind] || LANDMARKS.home,
    parts = L.build(accent || ACC.open);
  let n = 0;
  for (const t of kit) {
    const P = KIT_PROPS[t] ? KIT_PROPS[t](accent || ACC.open) : [];
    if (!P.length) continue;
    const [x, z] = propSlot(L, n++);
    for (const g of P) parts.push(g.translate(x, 0, z));
  }
  if (L.footing !== false) parts.push(box(L.w, 1.5, L.d, 0, -1.5, 0, '#6f6c66')); // a footing: hides the gap on a slope
  return mergeGeometries(parts);
};
/** The accent colour of a region id. */
export const accentOf = region => ACC[region] || ACC.open;

// ================================================================================================================================
// The detailed look (spec §4.39, T-342): facades, roofs and street furniture for the default graphics setting; the Fast setting
// keeps the plain shapes above (town3d.mjs). Shared with map3d.mjs's night layer: `facade(lot, i)` is the one window layout both
// draw from (the panes here, the glows there) and `lampSpots(roads)` the one row of street lamps (the posts, the lamp heads).
// Display only: fixed hashes, no randoms. Textures are drawn in canvas (no downloads), once, on first use; without a document
// (node tests) the materials have no maps.
// ================================================================================================================================

/** Lot geometry (town3d.mjs): a building is sunk FOOT m into the ground; its side = lot size × MAP_M × FOOTPRINT m. */
export const FOOT = 1.2,
  FOOTPRINT = 1.2;
/** The fixed hash (0..1) behind every lot's height and look. */
export const unit = i => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;

/** Lot i's frame: centre (m), sides w (local x) × d (local z), height h (m above the ground), its turn (cos / sin of −rot). */
export const lotFrame = (l, i) => {
  const k = KIT[l.kind];
  if (!k) return null;
  const f = l.size * MAP_M * FOOTPRINT;
  return {
    k,
    x: l.at[0] * MAP_M,
    z: l.at[1] * MAP_M,
    w: f * k.scale[0],
    d: f * k.scale[2],
    h: k.scale[1] * (0.85 + 0.3 * unit(i * 3 + 1)) * (1 + 1.2 * (l.h || 0) * k.rise),
    cs: Math.cos(-l.rot),
    sn: Math.sin(-l.rot)
  };
};

/** The window atlas (4 × 4 canvas tiles): panes, doors, shop fronts and signs. */
const TILE = {
  sash: 0,
  cross: 1,
  shutter: 2,
  office: 3,
  shop: 4,
  door: 5,
  gdoor: 6,
  shoji: 7,
  roller: 8,
  arch: 9,
  cdoor: 10,
  bdoor: 11,
  signCity: 12,
  signOld: 13,
  signWu: 14,
  signPlain: 15
};
const ROOFTEX = { shu: 0, terra: 1, metal: 2, shingle: 3 }; // bands of the roof atlas

/**
 * How each filler kind looks in detail: wall texture (plaster / concrete / brick / wood / metal), roof (flat / gable / hip / lean /
 * stepped / cyl) and its texture (rt), eave = the walls' share of the height under a pitched roof, window tile and column width
 * cw (m; null = no windows), door tile; shares of lots with a shop front (shop), balconies (bal), wall AC units (wallAc); roof
 * AC units (ac), a water tank on Wu roofs (tank), plinth / cornice / crown trims; high = one row of high windows (sheds, halls);
 * dim = few lit windows at night (map3d NIGHT.dark).
 */
const LOOK = {
  block: { wall: 'plaster', roof: 'flat', win: TILE.sash, cw: 1.5, door: TILE.gdoor, shop: 0.4, bal: 0.3, ac: 2, plinth: 1, wallAc: 0.15 },
  tower: { wall: 'concrete', roof: 'flat', win: TILE.office, cw: 1.1, door: TILE.gdoor, ac: 2, crown: 1, curtain: 1 },
  shop: { wall: 'plaster', roof: 'flat', win: TILE.cross, cw: 1.4, door: TILE.gdoor, shop: 1, ac: 1, plinth: 1 },
  office: { wall: 'concrete', roof: 'flat', win: TILE.office, cw: 1.05, door: TILE.gdoor, ac: 3, crown: 1, curtain: 1 },
  apartment: {
    wall: 'plaster',
    roof: 'flat',
    win: TILE.sash,
    cw: 1.5,
    door: TILE.door,
    shop: 0.15,
    bal: 0.8,
    ac: 2,
    wallAc: 0.25,
    plinth: 1
  },
  plant: { wall: 'metal', roof: 'flat', win: TILE.cross, cw: 2.6, door: TILE.roller, vents: 1, high: 1, dim: 1 },
  depot: { wall: 'metal', roof: 'gable', rt: 'metal', eave: 0.74, win: TILE.cross, cw: 2.4, door: TILE.roller, high: 1, dim: 1 },
  tank: { wall: 'metal', roof: 'cyl', dim: 1 },
  stack: { wall: 'brick', roof: 'cyl', dim: 1 },
  hut: { wall: 'wood', roof: 'gable', rt: 'metal', eave: 0.64, win: TILE.shutter, cw: 1.7, door: TILE.door, tank: 0.5 },
  shed: { wall: 'wood', roof: 'gable', rt: 'metal', eave: 0.7, win: null, cw: 2, door: TILE.roller, dim: 1 },
  boathouse: { wall: 'wood', roof: 'gable', rt: 'metal', eave: 0.66, win: TILE.shutter, cw: 2, door: TILE.roller },
  house: { wall: 'plaster', roof: 'gable', rt: 'shingle', eave: 0.62, win: TILE.shutter, cw: 1.6, door: TILE.door },
  barn: { wall: 'wood', roof: 'gable', rt: 'shu', eave: 0.6, win: null, cw: 2, door: TILE.roller, dim: 1 },
  hall: { wall: 'brick', roof: 'flat', win: TILE.sash, cw: 1.3, door: TILE.gdoor, ac: 1, plinth: 1, cornice: 1 },
  dorm: { wall: 'brick', roof: 'flat', win: TILE.cross, cw: 1.4, door: TILE.gdoor, bal: 0.35, ac: 1, plinth: 1, wallAc: 0.15 },
  shack: { wall: 'metal', roof: 'lean', rt: 'metal', win: TILE.cross, cw: 1.8, door: TILE.door },
  container: { wall: 'metal', roof: 'flat', win: null, cw: 2, door: TILE.cdoor, bare: 1, dim: 1 },
  villa: { wall: 'plaster', roof: 'hip', rt: 'terra', eave: 0.66, win: TILE.arch, cw: 1.6, door: TILE.door, bal: 0.5 },
  gatehouse: { wall: 'plaster', roof: 'hip', rt: 'terra', eave: 0.7, win: TILE.arch, cw: 1.6, door: TILE.door },
  rowhouse: { wall: 'brick', roof: 'gable', rt: 'terra', eave: 0.66, win: TILE.cross, cw: 1.3, door: TILE.door, shop: 0.2 },
  barracks: { wall: 'concrete', roof: 'flat', win: TILE.cross, cw: 1.5, door: TILE.door, tank: 1, plinth: 1 },
  workshop: { wall: 'metal', roof: 'gable', rt: 'metal', eave: 0.72, win: TILE.cross, cw: 1.8, door: TILE.roller },
  market: { wall: 'plaster', roof: 'flat', win: TILE.cross, cw: 1.6, door: TILE.gdoor, shop: 1, tank: 0.6 },
  warehouse: { wall: 'metal', roof: 'gable', rt: 'metal', eave: 0.76, win: TILE.cross, cw: 2.6, door: TILE.roller, high: 1, dim: 1 },
  resort: { wall: 'plaster', roof: 'flat', win: TILE.bdoor, cw: 1.7, door: TILE.gdoor, bal: 1, tank: 0.5, ac: 1 },
  kiosk: { wall: 'wood', roof: 'flat', win: null, cw: 1.5, door: TILE.door, shop: 1, kiosk: 1 },
  terrace: { wall: 'plaster', roof: 'stepped', rt: 'shu', win: TILE.shoji, cw: 1.4, door: TILE.door }
};
/** A lot's look: its kind's, turned by its district style (Shu: clay tiles and paper screens; Wu: tin roofs and water tanks). */
const lookOf = l => {
  const L = LOOK[l.kind];
  if (!L) return null;
  if (l.style === 'terrace') return { ...L, rt: L.rt && 'shu', win: L.win === null ? null : TILE.shoji, ridge: 1 };
  if (l.style === 'fishing' || l.style === 'beach') return { ...L, rt: L.rt && 'metal', wu: 1 };
  if (l.style === 'oldtown') return { ...L, rt: L.rt && 'terra' };
  if (l.style === 'compound') return { ...L, rt: L.rt && 'terra' };
  return L;
};
/** Signs and awnings by district style (spec §4.39: shop fronts with awnings and signs by district). */
const SIGN = {
  city: TILE.signCity,
  works: TILE.signPlain,
  oldtown: TILE.signOld,
  fishing: TILE.signWu,
  beach: TILE.signWu,
  terrace: TILE.signWu
};
const AWNING = {
  city: ['#2f3b46', '#c79a3a', '#2f6f6a', '#7a2f3c'],
  oldtown: ['#a8322a', '#7a2420', '#c4572c'],
  fishing: ['#2f6fa8', '#3f8fbf', '#4f7f95'],
  beach: ['#ef8a7a', '#4fb0c4', '#efc050', '#7fc48f'],
  terrace: ['#2f3f6f', '#5a3f30'],
  campus: ['#2f5f4a', '#2f3f6a', '#7a3a3a'],
  shacks: ['#8a6a3a', '#5f6f7a', '#7a4a3a'],
  compound: ['#c86a8a', '#efe0c8'],
  works: ['#5f6f7a']
};
/**
 * Street level's facade trim by district style (T-371, spec §4.44): window and door surrounds, lintels, the roof's coping lip, the
 * eaves' fascia and the blade signs' boards — the district's painted accent; `blade` = shop fronts there hang a sign out (share).
 */
const FRAME = {
  city: { c: '#2c3440', blade: 0.7 },
  works: { c: '#4d5a52', blade: 0 },
  oldtown: { c: '#6e2a20', blade: 0.8 },
  fishing: { c: '#2f5f8f', blade: 0.3 },
  beach: { c: '#3f8fa6', blade: 0.5 },
  terrace: { c: '#3e2c22', blade: 0.3 },
  campus: { c: '#2f5444', blade: 0 },
  shacks: { c: '#6a4a32', blade: 0.2 },
  compound: { c: '#b06a7a', blade: 0 }
};
const SIGN_GLOW = {
  [TILE.signCity]: ['#ff6fb0', '#5fe0ff', '#ffd060', '#9fff8a'],
  [TILE.signOld]: ['#ff6a3c', '#ffb040'],
  [TILE.signWu]: ['#bfe0ff', '#ffe7b0'],
  [TILE.signPlain]: ['#fff1c8']
};
/** Window colours at night (the Fast setting's NIGHT.win.colors are the same). */
export const GLOW = ['#ffd38a', '#ffe7b0', '#ffc070', '#d8e4ff'];
const FACES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
const rowsOf = top => {
  if (top >= 3.6) {
    const r = [];
    for (let y = 1.6; y + 0.62 <= top - 0.35; y += 2.8) r.push(y);
    return { r, wh: 1.25 };
  }
  return top >= 1.3 ? { r: [top * 0.52], wh: clamp(top * 0.34, 0.45, 0.95) } : { r: [], wh: 0 };
};

/**
 * The facade of lot i (spec §4.39). The camera never turns, so only faces that can be seen (world normal z ≥ −0.25) are listed:
 * { f, nx, nz (local normal), wz (world normal z), half (m from the middle), wide (m), front, wins: [{ kind: win | bal | door |
 * shop | sign, u (m along the face from its middle, to the right seen from outside), y (m above the ground), w, h (m), tile, half?
 * (another wall plane: the stepped house's upper floor), lit (a fixed hash: lit at night), glow (its colour) }] }. The front
 * (door, shop front) is the face most toward the camera. town3d.mjs draws the panes and map3d.mjs's night layer the glows from it.
 * → { fr (lotFrame), L (look), eave (m), shop, front, faces } or null for a kind the kit does not know.
 * all = every face (street level's detail ring, T-336a: the camera orbits there); the hashes and the front stay the same.
 */
export function facade(l, i, all = false) {
  const fr = lotFrame(l, i),
    L = lookOf(l);
  if (!fr || !L) return null;
  const { w, d, h, cs, sn } = fr,
    out = { fr, L, eave: h, shop: null, front: 0, faces: [] };
  if (L.roof === 'cyl') return out;
  const eave = L.roof === 'flat' ? h : L.roof === 'lean' ? h * 0.8 : L.roof === 'stepped' ? h * 0.5 : h * (L.eave || 0.65);
  out.eave = eave;
  let best = -2;
  FACES.forEach(([nx, nz], f) => {
    const wz = -nx * sn + nz * cs;
    if (wz > best) ((best = wz), (out.front = f));
  });
  if (L.door === TILE.cdoor) {
    // a container opens at an end: the short face most toward the camera
    best = -2;
    FACES.forEach(([nx, nz], f) => {
      const wz = -nx * sn + nz * cs;
      if ((nx ? d : w) <= Math.min(w, d) + 1e-6 && wz > best) ((best = wz), (out.front = f));
    });
  }
  const pLit = L.dim ? 0.08 : 0.42,
    hasShop = L.shop && unit(i * 7 + 11) < L.shop && eave >= (L.kiosk ? 1.8 : 2.3),
    hasBal = L.bal && unit(i * 7 + 13) < L.bal,
    sign = SIGN[l.style] !== undefined ? SIGN[l.style] : TILE.signPlain,
    R = L.high ? (eave >= 3 ? { r: [eave - 0.75], wh: 0.6 } : { r: [], wh: 0 }) : rowsOf(eave);
  FACES.forEach(([nx, nz], f) => {
    const wz = -nx * sn + nz * cs;
    if (wz < -0.25 && !all) return;
    const half = nx ? w / 2 : d / 2,
      wide = nx ? d : w,
      front = f === out.front,
      wins = [],
      hh = (j, q) => unit(i * 131 + j * 17 + q * 5 + f * 3 + 7),
      add = (o, j, q, p) => {
        const u = hh(j, q);
        o.lit = u < p;
        o.glow =
          o.kind === 'sign' ? SIGN_GLOW[o.tile][Math.floor(u * 97) % SIGN_GLOW[o.tile].length] : GLOW[Math.floor(u * 97) % GLOW.length];
        wins.push(o);
      };
    let door = null;
    if (front) {
      if (hasShop) {
        // the shop front fills the ground floor; an awning over it, a sign above
        const kiosk = L.kiosk,
          y0 = kiosk ? 0.85 : 0.08,
          top = kiosk ? Math.min(1.85, eave - 0.45) : Math.min(2.2, eave - 0.9),
          sw = wide - (kiosk ? 0.5 : 0.7);
        add({ kind: 'shop', u: 0, y: (y0 + top) / 2, w: sw, h: top - y0, tile: TILE.shop }, 9, 0, 0.7);
        out.shop = { f, top, w: sw + 0.2, colors: AWNING[l.style] || AWNING.city };
        const s0 = top + 0.32,
          s1 = Math.min(top + 0.9, eave - 0.12);
        if (s1 - s0 >= 0.28)
          add(
            { kind: 'sign', u: 0, y: (s0 + s1) / 2, w: sw * 0.78, h: s1 - s0, tile: sign },
            9,
            1,
            l.style === 'city' || l.style === 'oldtown' || l.style === 'beach' ? 0.85 : 0.5
          );
      } else {
        const roll = L.door === TILE.roller || L.door === TILE.cdoor,
          dh = L.door === TILE.cdoor ? eave - 0.25 : roll ? Math.min(eave * 0.8, 3.2) : Math.min(2.15, eave * 0.74),
          dw = L.door === TILE.cdoor ? wide - 0.2 : roll ? Math.min(wide * 0.5, 3) : clamp(dh * 0.5, 0.6, 1.1);
        door = { kind: 'door', u: 0, y: dh / 2 + 0.02, w: dw, h: dh, tile: L.door, lit: false, glow: GLOW[0] };
        wins.push(door);
      }
    }
    if (L.win !== null) {
      const span = wide - 0.5,
        cols = Math.max(1, Math.floor(span / L.cw)),
        ww = L.curtain ? (span / cols) * 0.86 : Math.min(L.cw * 0.56, (span / cols) * 0.8);
      R.r.forEach((y, j) => {
        for (let q = 0; q < cols; q++) {
          const u = (-0.5 + (q + 0.5) / cols) * span;
          if (front && j === 0 && hasShop && y < out.shop.top + 1) continue; // the ground floor is the shop
          if (door && y - R.wh / 2 < door.h && Math.abs(u - door.u) < (door.w + ww) / 2 + 0.1) continue; // the door is there
          const b = front && hasBal && y > 3;
          add(
            {
              kind: b ? 'bal' : 'win',
              u,
              y: b ? y - 0.15 : y,
              w: b ? Math.max(ww, 0.75) : ww,
              h: b ? R.wh + 0.3 : R.wh,
              tile: b ? TILE.bdoor : L.win
            },
            j,
            q,
            pLit
          );
        }
      });
      if (L.roof === 'stepped') {
        // the upper floor, set back: its own wall plane and a row of screens
        const half2 = nx ? 0.36 * w : nz > 0 ? 0.13 * d : 0.49 * d,
          wide2 = nx ? 0.62 * d : 0.72 * w,
          u0 = 0.18 * d * nx,
          y = h * (0.5 + 0.28 * 0.52),
          cols = Math.max(1, Math.floor((wide2 - 0.4) / L.cw));
        for (let q = 0; q < cols; q++)
          add(
            {
              kind: 'win',
              u: u0 + (-0.5 + (q + 0.5) / cols) * (wide2 - 0.4),
              y,
              w: Math.min(L.cw * 0.56, 0.9),
              h: clamp(h * 0.28 * 0.4, 0.4, 0.8),
              tile: L.win,
              half: half2
            },
            5,
            q,
            pLit
          );
      }
    }
    out.faces.push({ f, nx, nz, wz, half, wide, front, wins });
  });
  return out;
}

/** Street lamps (spec §4.37 2): every `every` m along these road kinds (from each edge's first point), alternating sides `side` m off the centre line, heads `up` m high; at most `cap`. */
export const STREET = { kinds: ['main', 'street', 'boardwalk'], every: 22, side: 2.4, up: 4.5, cap: 900 };
/** The lamps of a road list (map units in, metres out): [{ x, z, ux, uz (the road's direction), s (side: ±1) }] — map3d.mjs's lamp heads and posts. */
export const lampSpots = roads => {
  const out = [];
  for (const r of roads || []) {
    if (!STREET.kinds.includes(r.kind) || out.length >= STREET.cap) continue;
    const [a, b] = r.pts.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      ux = (b[0] - a[0]) / (len || 1),
      uz = (b[1] - a[1]) / (len || 1);
    for (let d = STREET.every / 2, j = 0; d < len && out.length < STREET.cap; d += STREET.every, j++) {
      const s = j % 2 ? 1 : -1,
        sd = s * STREET.side;
      out.push({ x: a[0] + ux * d - uz * sd, z: a[1] + uz * d + ux * sd, ux, uz, s, kind: r.kind });
    }
  }
  return out;
};

// ---------- a flat triangle-list builder (merged meshes: one draw call per material) ----------
const LIN = new Map();
/** A CSS colour as linear [r, g, b] (cached). */
export const rgb = hex => {
  if (!LIN.has(hex)) {
    const c = new THREE.Color(hex);
    LIN.set(hex, [c.r, c.g, c.b]);
  }
  return LIN.get(hex);
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/** A mesh under construction: position, normal, colour, uv + extra per-vertex attributes ({ name: size }) in growing typed arrays. */
export function mesher(extra = {}, cap0 = 4096) {
  let cap = cap0,
    n = 0;
  const sizes = { position: 3, normal: 3, color: 3, uv: 2, ...extra },
    A = {};
  for (const k in sizes) A[k] = new Float32Array(cap * sizes[k]);
  const grow = (to = cap * 2) => {
    cap = to;
    for (const k in sizes) {
      const b = new Float32Array(cap * sizes[k]);
      b.set(A[k]);
      A[k] = b;
    }
  };
  const put = (p, nr, c, u, v, e) => {
    if (n >= cap) grow();
    const o = n * 3;
    A.position[o] = p[0];
    A.position[o + 1] = p[1];
    A.position[o + 2] = p[2];
    A.normal[o] = nr[0];
    A.normal[o + 1] = nr[1];
    A.normal[o + 2] = nr[2];
    A.color[o] = c[0];
    A.color[o + 1] = c[1];
    A.color[o + 2] = c[2];
    A.uv[n * 2] = u;
    A.uv[n * 2 + 1] = v;
    if (e) for (const k in extra) if (e[k]) A[k].set(e[k], n * extra[k]);
    n++;
  };
  const normal = (p0, p1, p2) => {
    const ux = p1[0] - p0[0],
      uy = p1[1] - p0[1],
      uz = p1[2] - p0[2],
      vx = p2[0] - p0[0],
      vy = p2[1] - p0[1],
      vz = p2[2] - p0[2],
      nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      L = Math.hypot(nx, ny, nz) || 1;
    return [nx / L, ny / L, nz / L];
  };
  return {
    count: () => n,
    /** The vertices so far as plain arrays ({ n, A: name → Float32Array }), to append to another mesher of the same kind later. */
    raw: () => (n ? { n, A: Object.fromEntries(Object.keys(sizes).map(k => [k, A[k].slice(0, n * sizes[k])])) } : null),
    /** Room for k more vertices (one allocation instead of doublings). */
    reserve(k) {
      if (n + k > cap) grow(n + k);
    },
    /** Add a raw() of a mesher of the same kind (street level's ring: a lot built once, merged again on every rebuild). */
    append(R) {
      if (!R || !R.n) return;
      if (n + R.n > cap) grow(Math.max(cap * 2, n + R.n));
      for (const k in sizes) A[k].set(R.A[k], n * sizes[k]);
      n += R.n;
    },
    /** A quad p0..p3 counter-clockwise seen from its front; t = 8 uv numbers (per corner); e = extra values (all four corners). */
    quad(p0, p1, p2, p3, c, t, e) {
      const nr = normal(p0, p1, p3);
      put(p0, nr, c, t[0], t[1], e);
      put(p1, nr, c, t[2], t[3], e);
      put(p2, nr, c, t[4], t[5], e);
      put(p0, nr, c, t[0], t[1], e);
      put(p2, nr, c, t[4], t[5], e);
      put(p3, nr, c, t[6], t[7], e);
    },
    /** A triangle p0..p2 counter-clockwise seen from its front. */
    tri(p0, p1, p2, c, t, e) {
      const nr = normal(p0, p1, p2);
      put(p0, nr, c, t[0], t[1], e);
      put(p1, nr, c, t[2], t[3], e);
      put(p2, nr, c, t[4], t[5], e);
    },
    /** The finished BufferGeometry (null when empty). */
    geometry() {
      if (!n) return null;
      const g = new THREE.BufferGeometry();
      for (const k in sizes) g.setAttribute(k, new THREE.BufferAttribute(A[k].slice(0, n * sizes[k]), sizes[k]));
      return g;
    }
  };
}

/** Wall texture channels (the wall material's `wmask`): plaster / brick / wood planks; metal = the planks turned upright, finer. */
const MASK = {
  plaster: { wmask: [1, 0, 0] },
  concrete: { wmask: [0.6, 0, 0] },
  brick: { wmask: [0.25, 1, 0] },
  wood: { wmask: [0.2, 0, 1] },
  metal: { wmask: [0, 0, 0.9] },
  none: { wmask: [0, 0, 0] }
};
const TEXM = 4; // the wall texture spans 4 m
/** UVs of a wall quad (local u along, v up, in m): the metal texture runs upright and 3 × finer. */
const wallUV = (tex, u0, u1, v0, v1) =>
  tex === 'metal'
    ? [v0 * 0.75, u0 * 0.75, v0 * 0.75, u1 * 0.75, v1 * 0.75, u1 * 0.75, v1 * 0.75, u0 * 0.75]
    : [u0 / TEXM, v0 / TEXM, u1 / TEXM, v0 / TEXM, u1 / TEXM, v1 / TEXM, u0 / TEXM, v1 / TEXM];

/** UVs of a wall triangle from its corners' (along, up) metres. */
const tuv = (tex, ...pts) => pts.flatMap(([u, v]) => (tex === 'metal' ? [v * 0.75, u * 0.75] : [u / TEXM, v / TEXM]));

/**
 * A box in a local frame P(x, y, z) → world: faces counter-clockwise from outside, wall UVs in metres; skip = face names to leave
 * out ('py' top, 'ny' bottom, 'px' …). Into mesher M with colour c and wall texture tex.
 */
const lbox = (M, P, x0, x1, y0, y1, z0, z1, c, tex = 'none', skip = 'ny') => {
  const e = MASK[tex] || MASK.none,
    q = (name, a, b, cc, dd, u0, u1, v0, v1) =>
      !skip.includes(name) && M.quad(P(...a), P(...b), P(...cc), P(...dd), c, wallUV(tex, u0, u1, v0, v1), e);
  q('pz', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], x0, x1, y0, y1);
  q('nz', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], -x1, -x0, y0, y1);
  q('px', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], -z1, -z0, y0, y1);
  q('nx', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], z0, z1, y0, y1);
  q('py', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], x0, x1, -z1, -z0);
  q('ny', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], x0, x1, z0, z1);
};
/** An upright cylinder (n sides) at (cx, cz), radius r, from y0 to y1, with a top cap (cap: false = none). */
const lcyl = (M, P, cx, cz, r, y0, y1, c, tex = 'none', n = 10, cap = true) => {
  const e = MASK[tex] || MASK.none,
    at = (k, y) => {
      const a = (k / n) * Math.PI * 2;
      return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
    },
    arc = (Math.PI * 2 * r) / n;
  for (let k = 0; k < n; k++) {
    M.quad(P(...at(k, y0)), P(...at(k + 1, y0)), P(...at(k + 1, y1)), P(...at(k, y1)), c, wallUV(tex, k * arc, (k + 1) * arc, y0, y1), e);
    if (cap) M.tri(P(...at(k, y1)), P(...at(k + 1, y1)), P(cx, y1, cz), c, [0, 0, 0, 0, 0, 0], e);
  }
};
/** A cone cap (n sides) from radius r at y0 to a point at y1. */
const lcone = (M, P, cx, cz, r, y0, y1, c, n = 10) => {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2,
      b = ((k + 1) / n) * Math.PI * 2;
    M.tri(
      P(cx + Math.sin(a) * r, y0, cz + Math.cos(a) * r),
      P(cx + Math.sin(b) * r, y0, cz + Math.cos(b) * r),
      P(cx, y1, cz),
      c,
      [0, 0, 0, 0, 0, 0],
      MASK.none
    );
  }
};

/** UVs of atlas tile t (4 × 4), inset a little so mipmaps do not bleed. */
const tileUV = t => {
  const c = t % 4,
    r = Math.floor(t / 4),
    i = 1.5 / 512,
    u0 = c / 4 + i,
    u1 = (c + 1) / 4 - i,
    v0 = 1 - (r + 1) / 4 + i,
    v1 = 1 - r / 4 - i;
  return [u0, v0, u1, v0, u1, v1, u0, v1];
};
/** Roof atlas band b's v range (eave → ridge). */
const band = b => [1 - (b + 1) / 4 + 2 / 512, 1 - b / 4 - 2 / 512];

/** A pane (glass mesh) or a flat panel on a face: local normal (nx, nz), plane at `half` + out, centred at u along, y up. */
const onFace = (P, nx, nz, half, out) => (u, y) => P(nx * (half + out) + nz * u, y, nz * (half + out) - nx * u);
const pane = (M, F, u, y, w, h, c, t, e) =>
  M.quad(F(u - w / 2, y - h / 2), F(u + w / 2, y - h / 2), F(u + w / 2, y + h / 2), F(u - w / 2, y + h / 2), c, t, e);
/** A thin box standing out of a face (sills, balconies, awnings): u along, y up, from the wall out to `out` m. */
const faceBox = (M, P, nx, nz, half, u0, u1, y0, y1, o0, o1, c, skip = 'nynz') => {
  // in face coordinates: along = t = (nz, −nx), out = n (pz = its outer face, nz = against the wall); corners into the lot frame
  const Q = (u, y, o) => P(nx * (half + o) + nz * u, y, nz * (half + o) - nx * u);
  lbox(M, Q, u0, u1, y0, y1, o0, o1, c, 'none', skip);
};

// ---------- canvas textures (drawn once, shared; no downloads) ----------
const lcg = seed => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
/** Tileable value noise on an n × n lattice: (x, y) in 0..1 → 0..1. */
const vnoise = (rnd, n) => {
  const g = Float32Array.from({ length: n * n }, rnd);
  return (x, y) => {
    const fx = x * n,
      fy = y * n,
      x0 = Math.floor(fx),
      y0 = Math.floor(fy),
      tx = fx - x0,
      ty = fy - y0,
      sx = tx * tx * (3 - 2 * tx),
      sy = ty * ty * (3 - 2 * ty),
      at = (i, j) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)],
      a = at(x0, y0),
      b = at(x0 + 1, y0),
      c = at(x0, y0 + 1),
      d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
};
const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
/** The wall detail (4 m square, data, not colour): R plaster / concrete mottling and stains, G brick, B wood planks; ~0.8 on average. */
const wallTexture = () => {
  const S = 512,
    c = canvas(S, S),
    x2 = c.getContext('2d'),
    img = x2.createImageData(S, S),
    rnd = lcg(7),
    n1 = vnoise(rnd, 6),
    n2 = vnoise(rnd, 24),
    n3 = vnoise(rnd, 96),
    streak = vnoise(rnd, 40),
    brick = Float32Array.from({ length: 64 * 16 }, rnd),
    board = Float32Array.from({ length: 16 * 4 }, rnd);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S,
        v = y / S,
        // plaster: soft patches, fine grain, a few rain streaks
        st = Math.max(0, streak(u, 0) - 0.62) * 2.2 * (0.6 + 0.4 * n2(u, v * 0.25)),
        P = 0.8 + 0.16 * (n1(u, v) - 0.5) + 0.1 * (n2(u, v) - 0.5) + 0.07 * (n3(u, v) - 0.5) - 0.18 * st,
        // brick: 25 × 6.5 cm in running bond, light mortar
        row = y >> 3,
        bx = x + (row & 1 ? 16 : 0),
        mortar = (y & 7) === 0 || (bx & 31) === 0,
        B = mortar ? 0.97 : 0.68 + 0.22 * brick[(row & 63) * 16 + ((bx >> 5) & 15)] + 0.06 * (n3(u, v) - 0.5),
        // planks: 25 cm boards, dark seams, grain, butt joints
        k = y >> 5,
        jx = (x + Math.floor(board[(k & 15) * 4] * S)) % S,
        seam = (y & 31) < 2 || (jx & 255) < 2,
        W = seam
          ? 0.42
          : 0.72 +
            0.2 * board[(k & 15) * 4 + 1] +
            0.07 * Math.sin(x * 0.09 + board[(k & 15) * 4 + 2] * 40 + 6 * n2(u, v)) +
            0.05 * (n3(u, v) - 0.5),
        o = (y * S + x) * 4;
      img.data[o] = clamp(P, 0, 1) * 255;
      img.data[o + 1] = clamp(B, 0, 1) * 255;
      img.data[o + 2] = clamp(W, 0, 1) * 255;
      img.data[o + 3] = 255;
    }
  x2.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
};
/** The roof atlas: four 128 px bands (eave at the bottom, ridge at the top), each tiling sideways every 4 m — clay barrel tiles (Shu), terracotta, corrugated tin, shingles. Grey: the vertex colour gives the hue. */
const roofTexture = () => {
  const S = 512,
    c = canvas(S, S),
    g = c.getContext('2d'),
    rnd = lcg(11),
    grey = v => `rgb(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0})`;
  // barrel tiles: rounded columns (caps) over darker pans, courses overlapping downward
  const barrel = (y0, k, warm) => {
    for (let x = 0; x < S; x += 32) {
      for (let y = y0; y < y0 + 128; y += 16) {
        const t = 0.8 + 0.12 * rnd() * warm;
        for (let i = 0; i < 32; i++) {
          const a = Math.sin((i / 32) * Math.PI);
          g.fillStyle = grey(clamp(t * (0.72 + 0.32 * a * k), 0, 1));
          g.fillRect(x + i, y, 1, 16);
        }
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x, y + 14, 32, 2);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x + 6, y + 1, 12, 2);
      }
    }
  };
  barrel(0, 1, 0.6);
  barrel(128, 1.1, 1.4);
  // tin: fine ribs along the slope, sheet overlaps, rust streaks
  for (let x = 0; x < S; x++) {
    const a = 0.5 + 0.5 * Math.sin((x / 16) * Math.PI * 2);
    g.fillStyle = grey(0.78 + 0.2 * a);
    g.fillRect(x, 256, 1, 128);
  }
  for (let x = 0; x < S; x += 128) ((g.fillStyle = 'rgba(0,0,0,0.25)'), g.fillRect(x, 256, 2, 128));
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 318, S, 3);
  for (let k = 0; k < 14; k++) {
    const x = (rnd() * S) | 0,
      w = 4 + ((rnd() * 18) | 0),
      gr = g.createLinearGradient(0, 256, 0, 384);
    gr.addColorStop(0, 'rgba(90,50,30,0)');
    gr.addColorStop(1, `rgba(90,50,30,${0.15 + 0.25 * rnd()})`);
    g.fillStyle = gr;
    g.fillRect(x, 256, w, 128);
  }
  // shingles: staggered courses with gaps
  for (let y = 384, r = 0; y < 512; y += 16, r++)
    for (let x = r % 2 ? -16 : 0; x < S; x += 32) {
      g.fillStyle = grey(0.74 + 0.22 * rnd());
      g.fillRect(x, y, 31, 15);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x, y + 13, 31, 2);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** The window atlas (TILE) and its glow mask (white where light comes out at night: glass, sign letters). */
const windowTextures = () => {
  const S = 512,
    T = 128,
    c = canvas(S, S),
    e = canvas(S, S),
    g = c.getContext('2d'),
    m = e.getContext('2d'),
    rnd = lcg(5);
  m.fillStyle = '#000';
  m.fillRect(0, 0, S, S);
  const at = t => [(t % 4) * T, Math.floor(t / 4) * T],
    rect = (ctx, col, x, y, w, h) => ((ctx.fillStyle = col), ctx.fillRect(x, y, w, h)),
    glass = (x, y, w, h, lit = '#fff') => {
      const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
      gr.addColorStop(0, '#a9c0d0');
      gr.addColorStop(0.45, '#4b6274');
      gr.addColorStop(1, '#22303c');
      rect(g, gr, x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.beginPath();
      g.moveTo(x + w * 0.15, y + h);
      g.lineTo(x + w * 0.45, y + h);
      g.lineTo(x + w * 0.85, y);
      g.lineTo(x + w * 0.55, y);
      g.fill();
      rect(m, lit, x, y, w, h);
    },
    glyphs = (x, y, w, h, n, col, glow) => {
      // letters drawn narrow: a sign is stretched ~5 × sideways
      const cw = w / n;
      for (let k = 0; k < n; k++) {
        const gx = x + k * cw + cw * 0.2,
          gw = cw * 0.6;
        for (const ctx of [g, m]) ctx.fillStyle = ctx === g ? col : glow;
        for (let s = 0; s < 3; s++) {
          const r = rnd(),
            vert = r < 0.5;
          const sx = vert ? gx + (rnd() < 0.5 ? 0 : gw * 0.7) : gx,
            sy = vert ? y : y + rnd() * h * 0.85,
            sw = vert ? gw * 0.3 : gw,
            sh = vert ? h : h * 0.15;
          g.fillStyle = col;
          g.fillRect(sx, sy, sw, sh);
          m.fillStyle = glow;
          m.fillRect(sx, sy, sw, sh);
        }
      }
    };
  let [x, y] = at(TILE.sash);
  rect(g, '#e8e4dc', x, y, T, T);
  glass(x + 12, y + 10, 46, 100);
  glass(x + 70, y + 10, 46, 100);
  rect(g, '#d8d2c6', x + 12, y + 56, 104, 6);
  rect(m, '#000', x + 12, y + 56, 104, 6);
  rect(g, '#bdb6a8', x, y + 116, T, 12);
  [x, y] = at(TILE.cross);
  rect(g, '#3a3a3e', x, y, T, T);
  glass(x + 9, y + 9, 110, 110);
  for (const ctx of [g, m])
    (rect(ctx, ctx === g ? '#3a3a3e' : '#000', x + 60, y + 9, 8, 110), rect(ctx, ctx === g ? '#3a3a3e' : '#000', x + 9, y + 54, 110, 8));
  [x, y] = at(TILE.shutter);
  rect(g, '#d8d0c0', x, y, T, T);
  glass(x + 38, y + 8, 52, 112);
  for (const sx of [x + 4, x + 92]) {
    rect(g, '#5f7f74', sx, y + 6, 32, 116);
    for (let k = 0; k < 14; k++) rect(g, 'rgba(0,0,0,0.25)', sx + 3, y + 10 + k * 8, 26, 2);
  }
  [x, y] = at(TILE.office);
  rect(g, '#2a333d', x, y, T, T);
  glass(x + 3, y + 3, 122, 100);
  rect(g, '#3c4652', x, y + 104, T, 24);
  for (const ctx of [g, m]) rect(ctx, ctx === g ? '#2a333d' : '#000', x + 62, y + 3, 4, 100);
  [x, y] = at(TILE.shop);
  rect(g, '#26282c', x, y, T, T);
  glass(x + 5, y + 5, 118, 118, '#fff');
  for (let k = 0; k < 3; k++) {
    rect(g, 'rgba(240,230,210,0.5)', x + 6, y + 30 + k * 32, 116, 3);
    for (let q = 0; q < 7; q++)
      rect(g, ['#e0a040', '#d05050', '#50a0d0', '#e8e0c8', '#70b070'][(q + k) % 5], x + 9 + q * 16, y + 16 + k * 32, 10, 14);
  }
  rect(g, '#26282c', x + 46, y + 20, 36, 108);
  glass(x + 50, y + 24, 28, 104);
  [x, y] = at(TILE.door);
  rect(g, '#d8d0c0', x, y, T, T);
  rect(g, '#6b4a32', x + 12, y + 8, 104, 120);
  rect(g, '#5a3c28', x + 24, y + 18, 80, 40);
  rect(g, '#5a3c28', x + 24, y + 70, 80, 48);
  rect(g, '#d8b860', x + 96, y + 66, 8, 8);
  [x, y] = at(TILE.gdoor);
  rect(g, '#3a3d42', x, y, T, T);
  glass(x + 8, y + 8, 54, 120);
  glass(x + 66, y + 8, 54, 120);
  rect(g, '#9aa0a8', x + 20, y + 66, 36, 5);
  rect(g, '#9aa0a8', x + 72, y + 66, 36, 5);
  [x, y] = at(TILE.shoji);
  rect(g, '#4a3424', x, y, T, T);
  rect(g, '#eadfc4', x + 8, y + 8, 112, 112);
  rect(m, '#fff', x + 8, y + 8, 112, 112);
  for (let k = 1; k < 4; k++) for (const ctx of [g, m]) rect(ctx, ctx === g ? '#4a3424' : '#000', x + 8 + k * 28 - 2, y + 8, 4, 112);
  for (let k = 1; k < 6; k++) for (const ctx of [g, m]) rect(ctx, ctx === g ? '#4a3424' : '#000', x + 8, y + 8 + k * 19 - 2, 112, 4);
  [x, y] = at(TILE.roller);
  rect(g, '#9a9ca0', x, y, T, T);
  for (let k = 0; k < 16; k++) rect(g, 'rgba(0,0,0,0.22)', x, y + k * 8 + 6, T, 2);
  rect(g, '#5a5c60', x, y, 6, T);
  rect(g, '#5a5c60', x + 122, y, 6, T);
  rect(g, '#6a6c70', x + 50, y + 116, 28, 4);
  [x, y] = at(TILE.arch);
  rect(g, '#efe8dc', x, y, T, T);
  g.save();
  g.beginPath();
  g.moveTo(x + 22, y + 118);
  g.lineTo(x + 22, y + 50);
  g.arc(x + 64, y + 50, 42, Math.PI, 0);
  g.lineTo(x + 106, y + 118);
  g.closePath();
  g.clip();
  glass(x + 22, y + 8, 84, 110);
  g.restore();
  m.fillStyle = '#000';
  m.fillRect(x, y, T, T);
  m.fillStyle = '#fff';
  m.beginPath();
  m.moveTo(x + 22, y + 118);
  m.lineTo(x + 22, y + 50);
  m.arc(x + 64, y + 50, 42, Math.PI, 0);
  m.lineTo(x + 106, y + 118);
  m.fill();
  rect(g, '#efe8dc', x + 61, y + 8, 6, 110);
  rect(g, '#d6cdbd', x + 14, y + 116, 100, 10);
  [x, y] = at(TILE.cdoor);
  rect(g, '#b0b4b8', x, y, T, T);
  for (let k = 0; k < 13; k++) rect(g, 'rgba(0,0,0,0.18)', x + k * 10, y, 4, T);
  rect(g, 'rgba(0,0,0,0.5)', x + 63, y, 2, T);
  for (const bx of [24, 48, 80, 104]) rect(g, '#55585c', x + bx, y + 4, 4, 120);
  [x, y] = at(TILE.bdoor);
  rect(g, '#ece8e0', x, y, T, T);
  glass(x + 10, y + 6, 50, 122);
  glass(x + 68, y + 6, 50, 122);
  // signs: a board with letters (their glow mask = the letters)
  const board = (t, bg, edge, ink, glow, n) => {
    [x, y] = at(t);
    rect(g, edge, x, y, T, T);
    rect(g, bg, x + 5, y + 8, 118, 112);
    glyphs(x + 10, y + 26, 108, 76, n, ink, glow);
  };
  board(TILE.signCity, '#1c1f26', '#3a3f48', '#ffd060', '#fff', 8);
  rect(g, '#ff6fb0', x + 5, y + 8, 118, 6);
  rect(m, '#fff', x + 5, y + 8, 118, 6);
  board(TILE.signOld, '#9a2a22', '#e0b040', '#f0c040', '#fff', 6);
  board(TILE.signWu, '#c8a878', '#6b4a32', '#2f5f9f', '#fff', 7);
  board(TILE.signPlain, '#f2efe6', '#2f5f4a', '#2a2f3a', '#fff', 8);
  const tex = cv => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(c), glow: tex(e) };
};

/** The shared uniform the glass reads at night (0 by day, 1 at full dark): map3d.mjs's night layer sets it each frame. */
export const NIGHT_U = { value: 0 };
let MATS = null;
/**
 * The detailed look's three materials (made once, shared — never disposed by a layer): walls (vertex colour × the wall texture
 * channel picked per vertex by `wmask`), glass (the window atlas; lit panes glow by their `glow` colour × NIGHT_U), roofs (the roof
 * atlas × vertex colour).
 */
export const detailMats = () => {
  if (MATS) return MATS;
  const dom = typeof document !== 'undefined',
    win = dom ? windowTextures() : {},
    wall = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, map: dom ? wallTexture() : null }),
    glass = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.15,
      map: win.map || null,
      emissiveMap: win.glow || null,
      emissive: 0x000000,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    }),
    roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05, map: dom ? roofTexture() : null });
  wall.onBeforeCompile = sh => {
    silPatch(sh);
    sh.vertexShader =
      'attribute vec3 wmask;\nvarying vec3 vMask;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMask = wmask;');
    sh.fragmentShader =
      'varying vec3 vMask;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n  vec3 wt = texture2D(map, vMapUv).rgb;\n  diffuseColor.rgb *= 1.0 + 1.3 * dot(wt - 0.8, vMask);\n' +
          // painted (T-371): a wall a shade darker at its foot, lighter up high (uv v = metres / 4; metal runs sideways: not it)
          '  if (vMask.x + vMask.y > 0.0) diffuseColor.rgb *= mix(0.84, 1.04, smoothstep(-0.3, 1.6, vMapUv.y));\n#endif'
      );
  };
  wall.customProgramCacheKey = () => 'kit3d-wall';
  glass.onBeforeCompile = sh => {
    silPatch(sh);
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader =
      'attribute vec3 glow;\nvarying vec3 vGlow;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = glow;');
    sh.fragmentShader =
      'uniform float uNight;\nvarying vec3 vGlow;\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#ifdef USE_EMISSIVEMAP\n  totalEmissiveRadiance += vGlow * uNight * 1.5 * texture2D(emissiveMap, vEmissiveMapUv).rgb;\n#else\n  totalEmissiveRadiance += vGlow * uNight;\n#endif'
      );
  };
  glass.customProgramCacheKey = () => 'kit3d-glass';
  roof.onBeforeCompile = silPatch;
  roof.customProgramCacheKey = () => 'kit3d-roof';
  for (const m of [wall, glass, roof]) m.userData.shared = true;
  MATS = { wall, glass, roof };
  return MATS;
};

/**
 * Lot i's outline at street level (T-371: clean dark edges on near buildings, anime-style): its body's corners, the wall top or the
 * roof's eaves, verges, hips and ridge, pushed a few cm out so the lines sit on the edges. Appends line segments to pos / col
 * (plain arrays, metres; colour = the wall's, darkened). Tanks and chimneys: none.
 */
export function lotOutline(l, i, y0, wall, pos, col) {
  const fr = lotFrame(l, i),
    L = lookOf(l);
  if (!fr || !L || L.roof === 'cyl') return;
  const { w, d, h, x, z, cs, sn } = fr,
    w2 = w / 2,
    d2 = d / 2,
    kx = (w2 + 0.05) / w2,
    kz = (d2 + 0.05) / d2,
    c = mul(wall, 0.3),
    P = (lx, ly, lz) => {
      const ax = lx * kx,
        az = lz * kz;
      return [x + ax * cs + az * sn, y0 + ly, z - ax * sn + az * cs];
    },
    seg = (a, b) => (pos.push(...a, ...b), col.push(...c, ...c)),
    eave = L.roof === 'flat' ? h + 0.04 : L.roof === 'lean' ? h * 0.8 : L.roof === 'stepped' ? h * 0.5 : h * (L.eave || 0.65),
    pitchedRoof = L.roof === 'gable' || L.roof === 'hip';
  const C = [
    [-w2, -d2],
    [w2, -d2],
    [w2, d2],
    [-w2, d2]
  ];
  C.forEach(([a, b], k) => {
    seg(P(a, 0.02, b), P(a, eave, b));
    if (!pitchedRoof) seg(P(a, eave, b), P(C[(k + 1) % 4][0], eave, C[(k + 1) % 4][1]));
  });
  if (!pitchedRoof) return;
  // the roof as pitched() draws it (canonical a along the ridge, b across)
  const along = w >= d,
    A = (along ? w : d) / 2,
    Bh = (along ? d : w) / 2,
    Q = (a, y, b) => (along ? P(a, y + 0.03, b) : P(b, y + 0.03, -a)),
    ov = 0.28,
    ey = eave - ov * ((h - eave) / Bh),
    D = Bh + ov;
  if (L.roof === 'hip') {
    const r = Math.max(0, A - Bh),
      E = A + ov;
    for (const [a, b] of [
      [-E, -D],
      [E, -D],
      [E, D],
      [-E, D]
    ])
      seg(Q(a, ey, b), Q(Math.sign(a) * r, h, 0));
    seg(Q(-E, ey, -D), Q(E, ey, -D));
    seg(Q(-E, ey, D), Q(E, ey, D));
    seg(Q(-E, ey, -D), Q(-E, ey, D));
    seg(Q(E, ey, -D), Q(E, ey, D));
    if (r > 0) seg(Q(-r, h, 0), Q(r, h, 0));
    return;
  }
  const E = A + 0.22;
  seg(Q(-E, h, 0), Q(E, h, 0));
  for (const sb of [-1, 1]) {
    seg(Q(-E, ey, sb * D), Q(E, ey, sb * D));
    for (const sa of [-1, 1]) seg(Q(sa * E, ey, sb * D), Q(sa * E, h, 0));
  }
}

/**
 * The far skyline at street level (T-371, spec §4.44): the Fast boxes beyond the streamed blocks drawn as painted silhouettes — a
 * window grid in metres (the instance's scale; walls up to `top` of the unit shape), corners and the wall top inked dark, a foot
 * darker than the top, roofs a shade down; lit windows by hash at night (NIGHT_U); the pattern fades to its mean where a cell is
 * under ~3 px. The scene's haze tints it. One material per (top, windows), made once, shared; Fast never uses it.
 */
const FAR = new Map();
export const farMat = (top = 1, win = true) => {
  const key = `${top}|${win}`;
  if (FAR.has(key)) return FAR.get(key);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true });
  m.onBeforeCompile = sh => {
    silPatch(sh);
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFl, vFn, vFs; varying float vFi;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFl = position; vFn = normal; vFi = 0.0; vFs = vec3(1.0);
        #ifdef USE_INSTANCING
        vFs = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vFi = float(gl_InstanceID);
        #endif`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFl, vFn, vFs; varying float vFi; uniform float uNight;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fLit = 0.0;
        {
          vec3 n = normalize(vFn);
          float hm = vFl.y * vFs.y, wallTop = ${top.toFixed(2)} * vFs.y;
          diffuseColor.rgb *= mix(0.8, 1.05, smoothstep(${FOOT.toFixed(1)}, ${FOOT.toFixed(1)} + 12.0, hm));
          if (${win ? 'true' : 'false'} && abs(n.y) < 0.5 && vFl.y < ${top.toFixed(2)} + 0.001) {
            bool sx = abs(n.x) > 0.5;
            float u = sx ? vFl.z * vFs.z : vFl.x * vFs.x, half_ = 0.5 * (sx ? vFs.z : vFs.x);
            float ink = max(1.0 - smoothstep(0.06, 0.22, half_ - abs(u)), 1.0 - smoothstep(0.1, 0.3, wallTop - hm));
            ${
              win
                ? `vec2 c = vec2(u / 1.7, (hm - ${FOOT.toFixed(1)}) / 2.9), f = fract(c), id = floor(c);
            float g0 = id.y < 0.5 ? 1.0 : 0.0;
            float wn = step(mix(0.24, 0.1, g0), f.x) * step(f.x, mix(0.76, 0.9, g0)) * step(mix(0.3, 0.02, g0), f.y) * step(f.y, mix(0.78, 0.72, g0));
            wn *= step(hm, wallTop - 0.6) * step(abs(u), half_ - 0.35);
            vec2 fw = fwidth(c);
            wn = mix(0.3 * step(hm, wallTop - 0.6), wn, 1.0 - smoothstep(0.25, 0.6, max(fw.x, fw.y)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.18, 0.25) + 0.12 * g0, 0.72 * wn);
            fLit = wn * step(fract(sin(dot(id + vec2(vFi * 7.13, vFi * 3.71), vec2(12.9898, 78.233))) * 43758.5453), 0.4 - 0.25 * g0);`
                : ''
            }
            diffuseColor.rgb *= 1.0 - 0.55 * ink;
          } else if (n.y > 0.3 && vFl.y > 0.05) diffuseColor.rgb *= 0.86;
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * fLit * uNight;'
      );
  };
  m.customProgramCacheKey = () => `kit3d-far|${key}`;
  m.userData.shared = true;
  FAR.set(key, m);
  return m;
};
/** The far material for a filler kind's unit shape: walls up to the shape's eave (gable 0.62, stepped 0.55); tanks without windows. */
export const farFor = kind => {
  const k = KIT[kind],
    sh = k && LOOK[kind] ? LOOK[kind].roof : 'flat';
  if (!k) return null;
  return sh === 'cyl'
    ? farMat(1, false)
    : k.geo() === shape('gable')
      ? farMat(0.62)
      : k.geo() === shape('stepped')
        ? farMat(0.55)
        : farMat(1);
};

// ---------- one lot in detail ----------
const ROOFCOL = {
  shu: ['#8494a3', '#7a8896', '#909ca8', '#748290'],
  terra: ['#d47c56', '#c66a48', '#de8c62'],
  metal: ['#9ab8cc', '#b0b4b8', '#b8805e', '#8cae96', '#c4c8cc'],
  shingle: ['#7e6e66', '#6e7480', '#8a745f']
};
const TANKCOL = ['#3f6fb0', '#e8e4da', '#3a3c40'];
const AC = '#c9cbc6',
  METAL = '#4a4e54',
  WHITE = '#efece4';

/**
 * Lot i in detail (spec §4.39) into the three meshers B = { W (walls, trims, props: `wmask`), G (glass: `glow`), R (pitched roofs) },
 * standing on ground height y0, its walls coloured `wall` ([r, g, b] linear, already tinted by wealth). The panes are exactly
 * `facade(l, i)`'s (the night glows sit on them). Returns false for a kind the kit does not know.
 * all = every face (the detail ring); B.I (a mesher with `room` 4 / `tan` 3, the interiors material) takes the ground
 * floor's windows and shop fronts as rooms glimpsed through the glass (interiorPane).
 */
export function buildLot(B, l, i, y0, wall, all = false) {
  const F = facade(l, i, all);
  if (!F) return false;
  const { fr, L, eave } = F,
    { w, d, h, x, z, cs, sn } = fr,
    P = (lx, ly, lz) => [x + lx * cs + lz * sn, y0 + ly, z - lx * sn + lz * cs],
    { W, G, R } = B,
    tex = L.wall,
    hs = k => unit(i * 13 + k),
    pick = (list, k) => rgb(list[Math.floor(hs(k) * list.length) % list.length]),
    trim = mix(wall, rgb(WHITE), 0.3),
    dark = mul(wall, 0.72),
    // street level (all): the district's trim colour and the outline-dark roof edge (T-371)
    FR = FRAME[l.style] || FRAME.city,
    frameC = all ? rgb(FR.c) : null,
    edgeC = all ? mix(mul(wall, 0.32), rgb(FR.c), 0.35) : null,
    roofC = L.rt
      ? mul(pick(L.wu && L.rt === 'metal' ? ROOFCOL.metal : L.rt === 'metal' ? ['#a8adb2', '#9aa0a6'] : ROOFCOL[L.rt], 1), 1)
      : null,
    w2 = w / 2,
    d2 = d / 2;
  // ---- the body and the roof ----
  if (L.roof === 'cyl') {
    const r = Math.min(w, d) / 2,
      tank = l.kind === 'tank',
      top = tank ? h - 0.35 * r : h;
    lcyl(W, P, 0, 0, r, -FOOT, top, wall, tex, 14, !tank);
    if (tank) {
      lcone(W, P, 0, 0, r, top, h, trim, 14);
      for (const k of [0.33, 0.66]) lcyl(W, P, 0, 0, r + 0.05, h * k, h * k + 0.14, dark, 'none', 14, false);
      // the ladder up the front (the side toward the camera)
      const fx = -sn * (r + 0.06),
        fz = cs * (r + 0.06),
        Q = (u, y, o) => P(fx + cs * u - sn * o, y, fz + sn * u + cs * o);
      lbox(W, Q, -0.2, 0.2, 0, top, 0, 0.06, rgb(METAL), 'none', 'ny');
    } else {
      lcyl(W, P, 0, 0, r + 0.06, h - 2.2, h - 1.5, rgb('#c8463a'), 'none', 12, false);
      lcyl(W, P, 0, 0, r + 0.06, h - 0.9, h - 0.2, rgb('#c8463a'), 'none', 12, false);
      lcyl(W, P, 0, 0, r + 0.1, h - 0.2, h, rgb('#3a3a3a'), 'none', 12, true);
    }
    return true;
  }
  if (L.plinth) lbox(W, P, -w2 - 0.04, w2 + 0.04, -FOOT, 0.45, -d2 - 0.04, d2 + 0.04, dark, 'concrete', 'nypy');
  if (L.roof === 'flat') {
    const deck = h - (L.bare ? 0 : 0.35),
      t = 0.16;
    lbox(W, P, -w2, w2, -FOOT, h, -d2, d2, wall, tex, L.bare ? 'ny' : 'nypy');
    if (!L.bare) {
      // the parapet: its top, its inner sides, the roof deck
      const dc = mix(wall, rgb('#8a8984'), 0.6),
        y = [0, deck, h],
        rim = (a, b, c2, d3) => W.quad(P(...a), P(...b), P(...c2), P(...d3), trim, [0, 0, 0, 0, 0, 0, 0, 0], MASK.none);
      rim([-w2, h, d2], [w2, h, d2], [w2 - t, h, d2 - t], [-w2 + t, h, d2 - t]);
      rim([w2, h, -d2], [-w2, h, -d2], [-w2 + t, h, -d2 + t], [w2 - t, h, -d2 + t]);
      rim([w2, h, d2], [w2, h, -d2], [w2 - t, h, -d2 + t], [w2 - t, h, d2 - t]);
      rim([-w2, h, -d2], [-w2, h, d2], [-w2 + t, h, d2 - t], [-w2 + t, h, -d2 + t]);
      const ic = mul(trim, 0.8),
        x0 = -w2 + t,
        x1 = w2 - t,
        z0 = -d2 + t,
        z1 = d2 - t,
        flat = [0, 0, 0, 0, 0, 0, 0, 0];
      // the parapet's inner sides, facing the deck
      W.quad(P(x1, y[1], z1), P(x0, y[1], z1), P(x0, h, z1), P(x1, h, z1), ic, flat, MASK.none);
      W.quad(P(x0, y[1], z0), P(x1, y[1], z0), P(x1, h, z0), P(x0, h, z0), ic, flat, MASK.none);
      W.quad(P(x1, y[1], z0), P(x1, y[1], z1), P(x1, h, z1), P(x1, h, z0), ic, flat, MASK.none);
      W.quad(P(x0, y[1], z1), P(x0, y[1], z0), P(x0, h, z0), P(x0, h, z1), ic, flat, MASK.none);
      W.quad(
        P(-w2 + t, deck, d2 - t),
        P(w2 - t, deck, d2 - t),
        P(w2 - t, deck, -d2 + t),
        P(-w2 + t, deck, -d2 + t),
        dc,
        wallUV('plaster', -w2, w2, -d2, d2),
        MASK.concrete
      );
      if (L.cornice) lbox(W, P, -w2 - 0.12, w2 + 0.12, h - 0.75, h - 0.5, -d2 - 0.12, d2 + 0.12, trim, 'none', 'ny');
      if (L.crown) lbox(W, P, -w2 - 0.06, w2 + 0.06, h - 1.1, h - 0.45, -d2 - 0.06, d2 + 0.06, mul(wall, 0.55), 'none', 'nypy');
      if (all) lbox(W, P, -w2 - 0.05, w2 + 0.05, h - 0.16, h + 0.03, -d2 - 0.05, d2 + 0.05, edgeC, 'none', 'nypy'); // the coping lip
      roofProps(W, P, L, l, i, w, d, deck, h);
    }
  } else if (L.roof === 'gable' || L.roof === 'hip' || L.roof === 'lean') {
    lbox(W, P, -w2, w2, -FOOT, eave, -d2, d2, wall, tex, 'nypy');
    pitched(W, R, P, L, w, d, eave, h, wall, roofC, hs(3), 0, edgeC);
    if (L.wu && L.tank && hs(4) < L.tank) {
      // a water drum on stilts beside the house
      const tx = w2 + 0.5,
        tz = -d2 * 0.4;
      for (const [a, b] of [
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3]
      ])
        lbox(W, P, tx + a - 0.04, tx + a + 0.04, -0.3, 1.4, tz + b - 0.04, tz + b + 0.04, rgb(METAL));
      lcyl(W, P, tx, tz, 0.42, 1.4, 2.2, pick(TANKCOL, 5), 'none', 10, true);
    }
  } else if (L.roof === 'stepped') {
    const e1 = h * 0.5,
      e2 = h * 0.78,
      zc = -0.18 * d,
      uw = 0.36 * w,
      ud = 0.31 * d;
    lbox(W, P, -w2, w2, -FOOT, e1, -d2, d2, wall, tex, 'ny');
    lbox(W, (a, b, c2) => P(a, b, c2 + zc), -uw, uw, e1, e2, -ud, ud, wall, tex, 'nypy');
    pitched(W, R, (a, b, c2) => P(a, b, c2 + zc), L, uw * 2, ud * 2, e2 - e1, h - e1, wall, roofC, hs(3), e1, edgeC);
    // a tiled lean-to over the lower floor's front
    const v = band(ROOFTEX.shu),
      zf = zc + ud;
    R.quad(
      P(-w2 - 0.15, e1 - 0.05, d2 + 0.2),
      P(w2 + 0.15, e1 - 0.05, d2 + 0.2),
      P(w2 + 0.15, e1 + 0.4, zf),
      P(-w2 - 0.15, e1 + 0.4, zf),
      roofC,
      [-w2 / 4, v[0], w2 / 4, v[0], w2 / 4, v[1], -w2 / 4, v[1]]
    );
  }
  // ---- the facade: panes, sills, balconies, AC units, the shop front ----
  for (const fc of F.faces) {
    const { nx, nz, half } = fc;
    for (const o of fc.wins) {
      const hf = o.half !== undefined ? o.half : half,
        Fp = onFace(P, nx, nz, hf, 0.025),
        tint =
          o.tile === TILE.cdoor ? mix(wall, rgb(WHITE), 0.25) : o.tile === TILE.shutter ? mix(rgb('#ffffff'), wall, 0.15) : rgb('#ffffff'),
        gl = { glow: o.lit ? rgb(o.glow) : [0, 0, 0] };
      if (B.I && (o.kind === 'win' || o.kind === 'shop') && o.half === undefined && o.y - o.h / 2 < 2.6)
        interiorPane(B.I, Fp, o, [nz * cs - nx * sn, -nz * sn - nx * cs], unit(i * 53 + Math.round(o.u * 10) + 3));
      else pane(G, Fp, o.u, o.y, o.w, o.h, tint, tileUV(o.tile), gl);
      if (all && o.tile !== TILE.cdoor && !(L.curtain && o.kind === 'win')) {
        // street level: a painted surround behind the pane (a frame, the district's trim) and a lintel (its face and underside) over
        // the windows of the lower floors and the doors; glass curtain walls stay plain
        const fw = o.kind === 'shop' ? 0.14 : o.kind === 'sign' ? 0.06 : 0.09;
        pane(W, onFace(P, nx, nz, hf, 0.012), o.u, o.y, o.w + 2 * fw, o.h + 2 * fw, frameC, NOUV, MASK.none);
        if ((o.kind === 'win' || o.kind === 'door' || o.kind === 'bal') && o.y < 9)
          faceBox(
            W,
            P,
            nx,
            nz,
            hf,
            o.u - o.w / 2 - 0.14,
            o.u + o.w / 2 + 0.14,
            o.y + o.h / 2 + fw,
            o.y + o.h / 2 + fw + 0.1,
            0,
            0.07,
            frameC,
            'nzpxnxpy'
          );
      }
      if (o.kind === 'win' && !L.curtain && o.tile !== TILE.shoji)
        faceBox(
          W,
          P,
          nx,
          nz,
          hf,
          o.u - o.w / 2 - 0.08,
          o.u + o.w / 2 + 0.08,
          o.y - o.h / 2 - 0.09,
          o.y - o.h / 2,
          0,
          0.1,
          trim,
          'nynzpxnx'
        );
      if (o.kind === 'bal') {
        const y = o.y - o.h / 2 - 0.12;
        faceBox(W, P, nx, nz, hf, o.u - o.w / 2 - 0.3, o.u + o.w / 2 + 0.3, y, y + 0.12, 0, 0.62, trim);
        faceBox(
          W,
          P,
          nx,
          nz,
          hf,
          o.u - o.w / 2 - 0.3,
          o.u + o.w / 2 + 0.3,
          y + 0.12,
          y + 0.85,
          0.57,
          0.62,
          rgb(hs(6) < 0.5 ? METAL : WHITE)
        );
      } else if (o.kind === 'win' && L.wallAc && unit(i * 29 + Math.round(o.y * 10) + Math.round(o.u * 7)) < L.wallAc)
        faceBox(W, P, nx, nz, hf, o.u + o.w / 2 + 0.1, o.u + o.w / 2 + 0.68, o.y - o.h / 2 - 0.1, o.y - o.h / 2 + 0.32, 0, 0.32, rgb(AC));
      else if (o.kind === 'door' && o.tile !== TILE.cdoor && o.tile !== TILE.roller)
        faceBox(W, P, nx, nz, hf, o.u - o.w / 2 - 0.15, o.u + o.w / 2 + 0.15, o.h + 0.05, o.h + 0.14, 0, 0.45, dark); // a canopy over the door
    }
    if (F.shop && F.shop.f === fc.f) {
      awning(W, P, nx, nz, half, F.shop, hs(7));
      if (all && hs(8) < FR.blade && eave >= F.shop.top + 1.6) blade(W, G, P, nx, nz, half, F.shop, eave, frameC, l.style, hs(9));
    }
  }
  return true;
}
const NOUV = [0, 0, 0, 0, 0, 0, 0, 0];
/** A blade sign hung out from the shop front's edge (street level, T-371): a board in the district's trim, the sign tile on both faces (vertical lettering), lit at night by hash. */
function blade(W, G, P, nx, nz, half, S, eave, c, style, hh) {
  const tile = SIGN[style] !== undefined ? SIGN[style] : TILE.signPlain,
    glow = { glow: hh < 0.75 ? rgb(SIGN_GLOW[tile][Math.floor(hh * 97) % SIGN_GLOW[tile].length]) : [0, 0, 0] },
    u = (hh < 0.5 ? -1 : 1) * (S.w / 2 - 0.15),
    y0 = S.top + 0.55,
    y1 = Math.min(eave - 0.3, y0 + 1.7),
    o0 = 0.12,
    o1 = 0.72,
    t = 0.05,
    Q = (a, y, o) => P(nx * (half + o) + nz * a, y, nz * (half + o) - nx * a),
    [a0, b0, a1, , , b1] = tileUV(tile),
    rot = [a0, b0, a0, b1, a1, b1, a1, b0]; // the tile turned a quarter: its lettering runs up the board
  lbox(W, Q, u - t, u + t, y0 - 0.06, y1 + 0.06, o0 - 0.06, o1 + 0.06, c, 'none', '');
  faceBox(W, P, nx, nz, half, u - 0.03, u + 0.03, y1 - 0.25, y1 - 0.15, 0, o0, c); // the bracket
  G.quad(Q(u + t + 0.005, y0, o1), Q(u + t + 0.005, y0, o0), Q(u + t + 0.005, y1, o0), Q(u + t + 0.005, y1, o1), [1, 1, 1], rot, glow);
  G.quad(Q(u - t - 0.005, y0, o0), Q(u - t - 0.005, y0, o1), Q(u - t - 0.005, y1, o1), Q(u - t - 0.005, y1, o0), [1, 1, 1], rot, glow);
}

/** A pitched roof over w × d (local), walls up to `eave`, ridge at `top` (y offset `base`): gable (ridge along the longer side), hip or lean-to. Gable ends in the wall mesher, slopes in the roof mesher. */
function pitched(W, R, P, L, w, d, eave, top, wall, rc, hh, base = 0, edge = null) {
  const along = w >= d,
    A = (along ? w : d) / 2,
    Bh = (along ? d : w) / 2,
    // canonical (a along the ridge, y, b across) → the lot frame
    Q = (a, y, b) => (along ? P(a, y + base, b) : P(b, y + base, -a)),
    v = band(ROOFTEX[L.rt] || 0),
    ov = 0.28,
    og = 0.22,
    e = MASK[L.wall] || MASK.none;
  if (L.roof === 'lean') {
    const s = (top - eave) / (2 * Bh),
      ey = eave - ov * s;
    R.quad(Q(-A - og, ey, Bh + ov), Q(A + og, ey, Bh + ov), Q(A + og, top + 0.1 * s, -Bh - 0.1), Q(-A - og, top + 0.1 * s, -Bh - 0.1), rc, [
      (-A - og) / 4,
      v[0],
      (A + og) / 4,
      v[0],
      (A + og) / 4,
      v[1],
      (-A - og) / 4,
      v[1]
    ]);
    W.tri(Q(A, eave, Bh), Q(A, eave, -Bh), Q(A, top, -Bh), wall, tuv(L.wall, [-Bh, eave], [Bh, eave], [Bh, top]), e);
    W.tri(Q(-A, eave, -Bh), Q(-A, eave, Bh), Q(-A, top, -Bh), wall, tuv(L.wall, [-Bh, eave], [Bh, eave], [-Bh, top]), e);
    W.quad(Q(A, eave, -Bh), Q(-A, eave, -Bh), Q(-A, top, -Bh), Q(A, top, -Bh), wall, wallUV(L.wall, -A, A, eave, top), e);
    return;
  }
  const s = (top - eave) / Bh,
    ey = eave - ov * s,
    uv = (a0, a1) => [a0 / 4, v[0], a1 / 4, v[0], a1 / 4, v[1], a0 / 4, v[1]];
  if (L.roof === 'hip') {
    const r = Math.max(0, A - Bh),
      E = A + ov,
      D = Bh + ov;
    if (edge) lbox(W, Q, -E, E, ey - 0.16, ey + 0.01, -D, D, edge, 'none', 'nypy');
    R.quad(Q(-E, ey, D), Q(E, ey, D), Q(r, top, 0), Q(-r, top, 0), rc, uv(-E, E));
    R.quad(Q(E, ey, -D), Q(-E, ey, -D), Q(-r, top, 0), Q(r, top, 0), rc, uv(-E, E));
    R.tri(Q(E, ey, D), Q(E, ey, -D), Q(r, top, 0), rc, [D / 4, v[0], -D / 4, v[0], 0, v[1]]);
    R.tri(Q(-E, ey, -D), Q(-E, ey, D), Q(-r, top, 0), rc, [-D / 4, v[0], D / 4, v[0], 0, v[1]]);
    return;
  }
  const E = A + og,
    D = Bh + ov;
  if (edge)
    // street level: the fascia boards under both eaves (the roof's edge drawn dark, T-371)
    for (const [b0, b1, sk] of [
      [D - 0.05, D + 0.02, 'nzpy'],
      [-D - 0.02, -D + 0.05, 'pzpy']
    ])
      lbox(W, Q, -E, E, ey - 0.16, ey + 0.01, b0, b1, edge, 'none', sk);
  R.quad(Q(-E, ey, D), Q(E, ey, D), Q(E, top, 0), Q(-E, top, 0), rc, uv(-E, E));
  R.quad(Q(E, ey, -D), Q(-E, ey, -D), Q(-E, top, 0), Q(E, top, 0), rc, uv(-E, E));
  W.tri(Q(A, eave, Bh), Q(A, eave, -Bh), Q(A, top, 0), wall, tuv(L.wall, [-Bh, eave], [Bh, eave], [0, top]), e);
  W.tri(Q(-A, eave, -Bh), Q(-A, eave, Bh), Q(-A, top, 0), wall, tuv(L.wall, [-Bh, eave], [Bh, eave], [0, top]), e);
  // the bargeboards along the gable ends' slopes, and a ridge cap (with upturned ends on Shu roofs)
  const bc = mul(wall, 0.6);
  for (const sa of [-1, 1]) {
    const a0 = sa * (E - 0.03),
      a1 = sa * (E + 0.03);
    for (const sb of [-1, 1])
      W.quad(Q(a1, ey, sb * D), Q(a1, top + 0.04, 0), Q(a0, top + 0.04, 0), Q(a0, ey, sb * D), bc, [0, 0, 0, 0, 0, 0, 0, 0], MASK.none);
  }
  if (L.ridge || L.rt === 'shu') {
    const rcap = mul(rc, 0.55),
      C = (a, y, b) => Q(a, y, b);
    lbox(W, C, -E, E, top - 0.06, top + 0.12, -0.1, 0.1, rcap, 'none', 'ny');
    if (hh < 0.7)
      for (const sa of [-1, 1])
        lbox(W, C, sa > 0 ? E - 0.12 : -E, sa > 0 ? E : -E + 0.12, top + 0.12, top + 0.38, -0.08, 0.08, rcap, 'none', 'ny');
  }
}

/** Roof furniture on a flat roof (deck at y = deck): AC units, a stair house, an antenna, vents, a water tank on Wu roofs. */
function roofProps(W, P, L, l, i, w, d, deck, h) {
  const hs = k => unit(i * 17 + k),
    iw = w / 2 - 0.6,
    id = d / 2 - 0.6;
  if (iw <= 0.2 || id <= 0.2) return;
  const spot = k => [(hs(k) * 2 - 1) * iw * 0.8, (hs(k + 1) * 2 - 1) * id * 0.8];
  for (let k = 0; k < (L.ac || 0); k++) {
    if (hs(10 + k) > 0.8) continue;
    const [ax, az] = spot(20 + k * 2);
    lbox(W, P, ax - 0.35, ax + 0.35, deck, deck + 0.5, az - 0.3, az + 0.3, rgb(AC), 'none', 'ny');
    lbox(W, P, ax - 0.2, ax + 0.2, deck + 0.5, deck + 0.53, az - 0.2, az + 0.2, rgb(METAL), 'none', 'ny');
  }
  if (h > 8 && iw > 0.9 && id > 0.9) lbox(W, P, -iw, -iw + 1.5, deck, deck + 1.7, -id, -id + 1.3, mul(rgb(AC), 0.85), 'concrete', 'ny');
  if (L.crown && h > 14 && hs(3) < 0.5) lbox(W, P, 0.3, 0.38, deck, h + 3.5, -0.2, -0.12, rgb(METAL), 'none', 'ny');
  if (L.vents) for (const k of [0, 1]) lcyl(W, P, (k - 0.5) * iw, 0, 0.32, deck, deck + 1.3, rgb('#9aa0a6'), 'metal', 8, true);
  if (L.wu && L.tank && hs(5) < L.tank) {
    const [tx, tz] = spot(40);
    for (const [a, b] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3]
    ])
      lbox(W, P, tx + a - 0.04, tx + a + 0.04, deck, deck + 0.55, tz + b - 0.04, tz + b + 0.04, rgb(METAL));
    lcyl(W, P, tx, tz, 0.45, deck + 0.55, deck + 1.4, rgb(TANKCOL[Math.floor(hs(6) * 3) % 3]), 'none', 10, true);
  }
}

/** A striped awning over the shop front (and its valance), in the district's colours. */
function awning(W, P, nx, nz, half, S, hh) {
  const n = Math.max(3, Math.round(S.w / 0.45)),
    c1 = rgb(S.colors[Math.floor(hh * S.colors.length) % S.colors.length]),
    c2 = rgb('#efe9dc'),
    y1 = S.top + 0.28,
    y0 = S.top - 0.12,
    out = 0.95,
    Q = (u, y, o) => P(nx * (half + o) + nz * u, y, nz * (half + o) - nx * u);
  for (let k = 0; k < n; k++) {
    const u0 = -S.w / 2 + (k * S.w) / n,
      u1 = u0 + S.w / n,
      c = k % 2 ? c2 : c1;
    W.quad(Q(u0, y0, out), Q(u1, y0, out), Q(u1, y1, 0.02), Q(u0, y1, 0.02), c, [0, 0, 0, 0, 0, 0, 0, 0], MASK.none);
    W.quad(Q(u0, y0 - 0.2, out), Q(u1, y0 - 0.2, out), Q(u1, y0, out), Q(u0, y0, out), c, [0, 0, 0, 0, 0, 0, 0, 0], MASK.none);
  }
}

// ---------- street furniture (spec §4.39): benches, bins, bus stops along the main roads; lamp posts; floodlight towers ----------
/** A street prop at ground point (x, y, z), facing the road along (fx, fz) (a unit vector from the prop toward the road). */
/** A ground-floor pane as a room behind glass (the interiors material): uv 0–1 over the pane, room = (w, h, seed, shop + 2 × lit), tan = the face's along direction (world). */
function interiorPane(I, F, o, t, seed) {
  const e = { room: [o.w, o.h, seed, (o.kind === 'shop' ? 1 : 0) + (o.lit ? 2 : 0)], tan: [t[0], 0, t[1]] },
    c = [1, 1, 1],
    q = (u, v) => F(o.u + (u - 0.5) * o.w, o.y + (v - 0.5) * o.h);
  I.quad(q(0, 0), q(1, 0), q(1, 1), q(0, 1), c, [0, 0, 1, 0, 1, 1, 0, 1], e); // (the pane's 0–1 coordinates ride in uv)
}
/**
 * The interiors material (street level's detail ring, T-336a): each pane shows a room behind it — interior mapping, a ray from the
 * camera into a box behind the glass (back wall, floor, ceiling, side walls; shop shelves or a sofa), lit warm at night when the
 * pane is lit (NIGHT_U). Shared, made once.
 */
let IMAT = null;
export const interiorMat = () => {
  if (IMAT) return IMAT;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.1 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader =
      'attribute vec4 room;\nattribute vec3 tan;\nvarying vec4 vRoom;\nvarying vec3 vTanW;\nvarying vec3 vNW;\nvarying vec3 vPW;\nvarying vec2 vRUv;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vRoom = room; vTanW = tan; vNW = normal; vPW = position; vRUv = uv;'
      );
    sh.fragmentShader =
      'uniform float uNight;\nvarying vec4 vRoom;\nvarying vec3 vTanW;\nvarying vec3 vNW;\nvarying vec3 vPW;\nvarying vec2 vRUv;\nvec3 roomCol;\n' +
      'float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      sh.fragmentShader
        .replace(
          '#include <map_fragment>',
          `{
    vec3 V = normalize(vPW - cameraPosition), N = normalize(vNW), T = normalize(vTanW);
    vec3 d = vec3(dot(V, T), V.y, max(0.05, -dot(V, N)));
    float W = vRoom.x, H = vRoom.y, seed = vRoom.z, shop = mod(vRoom.w, 2.0), lit = step(1.5, vRoom.w);
    float x0 = shop > 0.5 ? 0.0 : -0.5, x1 = W - x0, y0 = shop > 0.5 ? -0.05 : -0.9, y1 = H + 0.45, D = max(2.4, W * 0.8);
    vec3 p = vec3(vRUv.x * W, vRUv.y * H, 0.0);
    float tx = d.x > 0.0 ? (x1 - p.x) / d.x : (x0 - p.x) / min(d.x, -1e-4);
    float ty = d.y > 0.0 ? (y1 - p.y) / d.y : (y0 - p.y) / min(d.y, -1e-4);
    float tz = D / d.z, t = min(tx, min(ty, tz));
    vec3 h = p + d * t;
    vec3 wallC = mix(vec3(0.86, 0.8, 0.7), vec3(0.62, 0.72, 0.8), fract(seed * 7.13));
    vec3 c;
    if (t == tz) {
      c = wallC;
      if (shop > 0.5) {
        float row = floor((h.y - y0) * 2.4), fy = fract((h.y - y0) * 2.4);
        vec3 item = 0.35 + 0.6 * vec3(rh(vec2(floor(h.x * 3.0), row + seed)), rh(vec2(row, floor(h.x * 3.0) + 7.0)), rh(vec2(seed, row * 3.0 + floor(h.x * 3.0))));
        c = fy < 0.14 ? vec3(0.3, 0.26, 0.22) : (h.y < y1 - 0.4 ? item : wallC);
      } else if (h.y - y0 < 0.85 && abs(h.x - W * 0.5) < W * 0.4) c = mix(vec3(0.35, 0.3, 0.42), vec3(0.5, 0.36, 0.26), fract(seed * 3.7));
      else if (abs(h.x - W * 0.5) < 0.35 && h.y > H * 0.3 && h.y < H * 0.85) c = vec3(0.92, 0.88, 0.75) * 0.9; // a picture
    } else if (t == ty) c = d.y < 0.0 ? vec3(0.5, 0.38, 0.27) * (0.8 + 0.2 * step(0.5, fract(h.x * 1.5))) : vec3(0.92);
    else c = wallC * 0.82;
    c *= mix(1.0, 0.55, clamp(h.z / D, 0.0, 1.0));
    float fr = step(vRUv.x, 0.035) + step(0.965, vRUv.x) + step(vRUv.y, 0.04) + step(0.96, vRUv.y);
    c = mix(c, vec3(0.16, 0.17, 0.19), clamp(fr, 0.0, 1.0));
    roomCol = c * (0.55 + uNight * (lit > 0.5 ? 1.4 : 0.1)) * mix(vec3(1.0), vec3(1.15, 0.95, 0.72), uNight * lit);
    diffuseColor.rgb = c * 0.18;
  }`
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += roomCol;');
  };
  m.customProgramCacheKey = () => 'kit3d-interior';
  m.userData.shared = true;
  IMAT = m;
  return m;
};
/** Ring props (T-336a) along the pavements: a bollard, a planter with a shrub, a hydrant. */
export const RING_PROPS = ['bollard', 'planter', 'hydrant'];
export function streetProp(W, kind, x, y, z, fx, fz) {
  // local frame: +z toward the road, +x along it
  const P = (a, b, c) => [x + a * fz + c * fx, y + b, z - a * fx + c * fz],
    wood = rgb('#8a6440'),
    iron = rgb('#3c4046');
  if (kind === 'bench') {
    lbox(W, P, -0.75, 0.75, 0.42, 0.5, -0.2, 0.2, wood);
    lbox(W, P, -0.75, 0.75, 0.55, 0.9, -0.24, -0.18, wood, 'none', 'ny');
    for (const a of [-0.6, 0.6]) lbox(W, P, a - 0.04, a + 0.04, -0.2, 0.55, -0.2, 0.18, iron);
  } else if (kind === 'bin') {
    lcyl(W, P, 0, 0, 0.24, -0.2, 0.85, rgb('#3f6a4a'), 'none', 8, true);
    lcyl(W, P, 0, 0, 0.27, 0.85, 0.92, iron, 'none', 8, true);
  } else if (kind === 'stop') {
    const glassC = rgb('#9fb8c8');
    lbox(W, P, -1.4, 1.4, -0.2, 2.3, -0.75, -0.68, glassC, 'none', 'ny'); // the back pane
    for (const a of [-1.4, 1.4]) lbox(W, P, a - 0.05, a + 0.05, -0.2, 2.45, -0.78, 0.55, iron);
    lbox(W, P, -1.55, 1.55, 2.45, 2.58, -0.85, 0.65, rgb('#d8d4cc'), 'none', 'ny'); // the roof
    lbox(W, P, -1.1, 1.1, 0.42, 0.5, -0.65, -0.3, wood); // the seat
    lbox(W, P, 1.75, 1.82, -0.2, 2.6, 0.3, 0.37, iron); // the sign post
    lbox(W, P, 1.55, 2.02, 2.1, 2.6, 0.28, 0.4, rgb('#2f6fb8'), 'none', 'ny');
  } else if (kind === 'bollard') {
    lcyl(W, P, 0, 0, 0.1, -0.1, 0.85, rgb('#3a3e44'), 'none', 8, true);
    lcyl(W, P, 0, 0, 0.11, 0.62, 0.7, rgb('#d8c060'), 'none', 8, false);
  } else if (kind === 'planter') {
    lbox(W, P, -0.5, 0.5, -0.1, 0.55, -0.5, 0.5, rgb('#9a958c'), 'concrete');
    lbox(W, P, -0.42, 0.42, 0.55, 0.6, -0.42, 0.42, rgb('#4a3a2a'), 'none', 'ny');
    lcyl(W, P, 0, 0, 0.38, 0.6, 1.2, rgb('#3f7a3a'), 'none', 7, true);
    lcone(W, P, 0, 0, 0.3, 1.2, 1.55, rgb('#4f8a42'), 7);
  } else if (kind === 'hydrant') {
    lcyl(W, P, 0, 0, 0.13, -0.1, 0.6, rgb('#c8463a'), 'none', 8, true);
    lcyl(W, P, 0, 0, 0.17, 0.42, 0.5, rgb('#a83a30'), 'none', 8, true);
    lbox(W, P, -0.22, 0.22, 0.3, 0.38, -0.05, 0.05, rgb('#a83a30'));
  }
}
/** A street lamp's post under its head at (x, top, z): the post stands `reach` m further from the road (ox, oz = away from the road), an arm out to the head. */
export function lampPost(W, x, yb, top, z, ox, oz, c) {
  const reach = 0.9,
    px = x + ox * reach,
    pz = z + oz * reach,
    P = (a, b, cc) => [px + a, yb + b, pz + cc],
    up = top - yb;
  lbox(W, P, -0.14, 0.14, -0.3, 0.6, -0.14, 0.14, mul(c, 0.8)); // the base
  lbox(W, P, -0.07, 0.07, 0.6, up + 0.28, -0.07, 0.07, c);
  // the arm: from the post's top out to the head, and the head (the glow hangs just below it)
  const Q = (a, b, cc) => [px + a * -ox + cc * oz, yb + b, pz + a * -oz - cc * ox];
  lbox(W, Q, 0, reach + 0.25, up + 0.2, up + 0.28, -0.04, 0.04, c, 'none', 'ny');
  lbox(W, Q, reach - 0.28, reach + 0.3, up + 0.06, up + 0.22, -0.13, 0.13, mul(c, 0.7), 'none', '');
}
/** A floodlight tower at (x, z) from ground yb up to the lamp bank at `top`, the bank turned toward (cx, cz) (the court). */
export function floodTower(W, x, yb, top, z, cx, cz, c) {
  const dx = cx - x,
    dz = cz - z,
    L = Math.hypot(dx, dz) || 1,
    fx = dx / L,
    fz = dz / L,
    P = (a, b, cc) => [x + a * fz + cc * fx, yb + b, z - a * fx + cc * fz], // +z local toward the court
    up = top - yb;
  lbox(W, P, -0.32, 0.32, -0.4, 0.5, -0.32, 0.32, mul(c, 0.8));
  lbox(W, P, -0.14, 0.14, 0.5, up + 0.1, -0.5, -0.22, c); // the mast, set back from the bank
  lbox(W, P, -0.08, 0.08, 0.5, up - 0.4, -0.14, 0.02, mul(c, 0.85)); // a cable run
  lbox(W, P, -0.9, 0.9, up - 0.45, up + 0.5, -0.36, -0.16, mul(c, 0.7), 'none', ''); // the lamp bank (the glow on its face)
  lbox(W, P, -0.95, 0.95, up + 0.5, up + 0.58, -0.45, 0.05, c, 'none', 'ny');
}
