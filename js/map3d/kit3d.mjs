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
const ACC = { wei: '#f5b82e', wu: '#3fa9f5', shu: '#4ade80', outlaws: '#ff8c42', gloria: '#ff5da2', open: '#f5e6a8' };

/** A flat-shaded part: non-indexed geometry with one colour in its vertices (merging needs the same attributes everywhere). */
const part = (geo, color) => {
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
const box = (w, h, d, x, y, z, color) => part(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color);
/** A four-sided hip roof (a pyramid) over w × d, its eaves at y. */
const hip = (w, h, d, x, y, z, color) =>
  part(
    new THREE.ConeGeometry(0.7071, 1, 4)
      .rotateY(Math.PI / 4)
      .scale(w, h, d)
      .translate(x, y + h / 2, z),
    color
  );
/** A post (a thin box) from y up h. */
const post = (x, y, z, h, color, t = 0.35) => box(t, h, t, x, y, z, color);

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
        : part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), '#ffffff');
    SHAPES.set(name, g);
  }
  return SHAPES.get(name);
};
const MAT = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true });

/** Filler kinds: `scale` = [width ×, height m, depth ×] (width / depth × the lot's side in metres), `colors` = the wall palette. */
const filler = (shp, scale, colors) => ({ geo: () => shape(shp), mat: MAT, scale, colors });
export const KIT = {
  // Wei: dense city blocks, towers, shopfronts (gold-grey)
  block: filler('box', [1, 7, 1], ['#b9b3a4', '#a8a293', '#c4b48a']),
  tower: filler('box', [0.8, 15, 0.8], ['#9aa3ad', '#8a94a0', '#c9b27a']),
  shop: filler('box', [1.1, 3.4, 1], ['#cdb98d', '#d0a35a', '#b9b3a4']),
  // Wu: fishing villages (weathered wood, blue accents)
  hut: filler('gable', [1, 2.7, 1], ['#b99a6b', '#a68a5e', '#c9ad7c']),
  shed: filler('gable', [1.2, 2.2, 0.9], ['#8d7b62', '#7b6c58', '#9aa6ad']),
  boathouse: filler('gable', [1.5, 3.4, 1.1], ['#6f93ad', '#7fa1b6', '#b99a6b']),
  // Shu: terraced hill villages (stone and tile)
  house: filler('gable', [1, 3, 1], ['#a98f74', '#9b8a76', '#b5a18a']),
  barn: filler('gable', [1.3, 3.6, 1.1], ['#8a6a4c', '#7c6a55', '#9a8266']),
  // Central Academy: the campus quad
  hall: filler('box', [1.2, 5.5, 1], ['#d9d2bd', '#cfc7ae', '#e3dcc8']),
  dorm: filler('box', [1, 7, 0.8], ['#cfc3a8', '#c4b898', '#d9d2bd']),
  // the Outlaws: shacks and shipping containers under the overpass
  shack: filler('box', [1, 2.2, 1], ['#7d6a56', '#6b6a66', '#8a7560']),
  container: filler('box', [1.8, 2.5, 0.8], ['#b5533c', '#3f6f8f', '#c98a2e', '#6f8f5a']),
  // St. Gloria: a walled compound of villas
  villa: filler('gable', [1.2, 4.2, 1], ['#efe3d0', '#f0d9e0', '#e6dcc8']),
  gatehouse: filler('box', [0.8, 3.5, 0.8], ['#d8c8b8', '#c9b8a8'])
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
/** A landmark's depth along its door axis (m). */
export const landmarkDepth = kind => (LANDMARKS[kind] ? LANDMARKS[kind].d : 6);
/** Build a landmark's merged geometry (accent = a CSS colour): door on +z, centred, feet at y = 0. */
export const buildLandmark = (kind, accent) => {
  const L = LANDMARKS[kind] || LANDMARKS.home,
    parts = L.build(accent || ACC.open);
  parts.push(box(L.w, 1.5, L.d, 0, -1.5, 0, '#6f6c66')); // a footing: hides the gap on a slope
  return mergeGeometries(parts);
};
/** The accent colour of a region id. */
export const accentOf = region => ACC[region] || ACC.open;
