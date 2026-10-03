// The building kit of the 3D island: one registry of every kind a settlement lot or a landmark can be (spec §4.18).
// Procedural now (boxes, gables, hip roofs and prisms, flat-shaded, a palette taken from the REGIONS colours); a CC0 model
// pack can replace any kind later without touching rules or data — see "Swapping a kind" below. Plain geometry, no scene.
//   KIT[kind]            filler lots (MapModel.lots kinds): { geo(), mat, scale: [width, height, depth], colors }
//   LANDMARKS[kind]      landmarks (LANDMARK kinds): { h, w, d, build(accent) → a vertex-coloured BufferGeometry }
//   landmarkHeight(kind) how tall a landmark is in metres (pins float above it)
//
// Swapping a kind: a filler kind's `geo()` may return any BufferGeometry whose footprint is 1 × 1 and height 1 with its feet at
// y = 0 (take the one from a loaded GLTF mesh, e.g. from assets/models/); `scale` then sizes it per lot (width and depth × the
// lot's side, height in metres). A landmark kind's `build(accent)` may return any geometry with its door facing +z, centred on
// x / z and its feet at y = 0, within `w` × `d` metres (give it a `color` attribute, or all-white vertex colours to keep the
// model's own look). Nothing else (town3d.mjs, rules, map data) needs to change.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Region accents (the REGIONS colours): the palettes below lean on them. */
const ACC = { wei: '#d08a2e', wu: '#5b8def', shu: '#2fb8a0', outlaws: '#ff8c42', gloria: '#ff5da2', open: '#f5e6a8' };

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

/** Height in metres of a landmark kind (pins float above it); 3 for an unknown kind. */
export const landmarkHeight = kind => (LANDMARKS[kind] ? LANDMARKS[kind].h : 3);
/** Build a landmark's merged geometry (accent = a CSS colour): door on +z, centred, feet at y = 0. */
export const buildLandmark = (kind, accent) => {
  const L = LANDMARKS[kind] || LANDMARKS.home,
    parts = L.build(accent || ACC.open);
  if (L.footing !== false) parts.push(box(L.w, 1.5, L.d, 0, -1.5, 0, '#6f6c66')); // a footing: hides the gap on a slope
  return mergeGeometries(parts);
};
/** The accent colour of a region id. */
export const accentOf = region => ACC[region] || ACC.open;
