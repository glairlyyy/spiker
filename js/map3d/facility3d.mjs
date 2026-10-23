// Real facilities on the island (spec §4.40, T-351): every place and club HQ is its own building on its own lot, its kit standing
// where it is used — one design per place (FACILITY_OF in js/data/city.js), in its faction's style (Wei glass and lit signs, Wu
// warehouses and steel, Shu timber and tiered roofs, the Academy's brick, the Outlaws' concrete). Plain geometry, no scene.
//   FAC[design](S, a, u) → { parts: [vertex-coloured non-indexed geometry], sign: { x, z, hw, hd, y, w, h } | null }
//     S = FACILITY[design] ({ w, d, h } m), a = the accent (region / club colour), u(k) = a fixed hash 0–1 for small variations.
//     Local frame: centre 0, door on +z (the lot's front edge z = d / 2), feet at y = 0, inside w × d. `sign` = the block the
//     name board hangs on (centre x / z, half sizes) and the board's centre height and size: town3d puts it on that block's face
//     most toward the camera.
//   buildFacility(L, accent, low) → { geo, sign } — L = a model landmark with `fac` (and kit, id); low = the Fast setting (the same
//     building; its sign a plain board, no lettering). Unknown designs fall back to kit3d's landmark of L.kind.
// Display only: no rules, no randoms (hashes of the place id).
import * as THREE from 'three';
import { box, hip, part, mergeParts, buildLandmark } from './kit3d.mjs';

const DARK = '#3d3f45',
  STEEL = '#8d949c',
  CONC = '#b8b6ae',
  WHITE = '#ece9e1',
  GLASS = '#6f98bf',
  GLASS2 = '#86b3d6',
  GOLD = '#d9b04a',
  WOOD = '#8a6a4c',
  WOOD2 = '#5e4632',
  TILE = '#55666a',
  TERRA = '#a65a3a',
  STONE = '#9a978f',
  BRICK = '#a8553f',
  CREAM = '#e0d9c3',
  SAND = '#e3cf96',
  RED = '#b03a3a',
  TRACK = '#b0563a',
  WATER = '#3f8fc0',
  RUBBER = '#4a4d52',
  LAWN = '#5f9a52';

/** A cylinder (radius r, bottom radius r2) from y up h at (x, z). */
const cyl = (r, h, x, y, z, c, n = 12, r2 = r) => part(new THREE.CylinderGeometry(r, r2, h, n).translate(x, y + h / 2, z), c);
const post = (x, y, z, h, c, t = 0.3) => box(t, h, t, x, y, z, c);
/** A gable roof: ridge along x (w long), eaves at y across d, rise h. */
const gable = (w, h, d, x, y, z, c) => {
  const sh = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
  return part(
    new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false })
      .translate(0, 0, -w / 2)
      .rotateY(Math.PI / 2)
      .translate(x, y, z),
    c
  );
};
/** A barrel roof: half a cylinder along x (w long) over d, rise h, eaves at y. */
const barrel = (w, h, d, x, y, z, c) =>
  part(
    new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .scale(w, h, d / 2)
      .translate(x, y, z),
    c
  );
/** A dome rx × rz, h high, from y. */
const dome = (rx, h, rz, x, y, z, c) =>
  part(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(rx, h, rz).translate(x, y, z), c);
/** An elliptical ring (hole rxi × rzi, outer rxo × rzo) from y up h. */
const oval = (rxi, rzi, rxo, rzo, y, h, c, x = 0, z = 0) => {
  const sh = new THREE.Shape().absellipse(0, 0, rxo, rzo, 0, Math.PI * 2, false);
  if (rxi > 0) sh.holes.push(new THREE.Path().absellipse(0, 0, rxi, rzi, 0, Math.PI * 2, true));
  return part(
    new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 28 }).rotateX(-Math.PI / 2).translate(x, y, z),
    c
  );
};
/** A tiered roof (Shu): n hip roofs stepping in and up from y. */
const tiers = (w, d, y, n, c, wall, step = 2.4) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = 1 - i * 0.22;
    if (i) out.push(box(w * k * 0.72, step * 0.55, d * k * 0.72, 0, y + i * step - step * 0.55, 0, wall));
    out.push(hip(w * k, step * 0.5, d * k, 0, y + i * step, 0, c));
  }
  return out;
};
/** A fence of posts and a mesh panel round w × d (an opening of `gap` m in the front). */
const fence = (w, d, h, c, gap = 0, x = 0, z = 0) => {
  const out = [],
    t = 0.12;
  out.push(box(w, h, t, x, 0, z - d / 2, c), box(t, h, d, x - w / 2, 0, z, c), box(t, h, d, x + w / 2, 0, z, c));
  const side = (w - gap) / 2;
  if (side > 0) out.push(box(side, h, t, x - w / 2 + side / 2, 0, z + d / 2, c), box(side, h, t, x + w / 2 - side / 2, 0, z + d / 2, c));
  for (let i = 0; i <= 4; i++) out.push(post(x - w / 2 + (i * w) / 4, 0, z - d / 2, h + 0.2, DARK, 0.18));
  return out;
};
/** A volleyball court's lines and net (a court 9 × 18 m along x) on a slab of `ground`, at y. */
const court = (x, z, y, ground, net, len = 18, wid = 9, rot = 0) => {
  const out = [box(len + 3, 0.12, wid + 3, 0, y, 0, ground)];
  const L = '#f4f1e8';
  out.push(
    box(len, 0.03, 0.08, 0, y + 0.12, -wid / 2, L),
    box(len, 0.03, 0.08, 0, y + 0.12, wid / 2, L),
    box(0.08, 0.03, wid, -len / 2, y + 0.12, 0, L),
    box(0.08, 0.03, wid, len / 2, y + 0.12, 0, L),
    box(0.08, 0.03, wid, 0, y + 0.12, 0, L),
    post(0, y, -wid / 2 - 0.6, 2.6, DARK, 0.14),
    post(0, y, wid / 2 + 0.6, 2.6, DARK, 0.14),
    box(0.05, 0.9, wid + 1.2, 0, y + 1.55, 0, net)
  );
  return out.map(g => g.rotateY(rot).translate(x, 0, z));
};
/** Translate a list of parts. */
const at = (list, x, y, z, ry = 0) => list.map(g => (ry ? g.rotateY(ry) : g).translate(x, y, z));

// ---- the kit (spec §4.33): real objects where they are used ----------------------------------------------------------------
const rack = (x, z, a) => [
  post(x - 0.7, 0, z, 2.3, DARK, 0.12),
  post(x + 0.7, 0, z, 2.3, DARK, 0.12),
  box(2.1, 0.06, 0.06, x, 1.5, z, '#cfcfcf'),
  box(0.12, 0.5, 0.5, x - 0.95, 1.27, z, DARK),
  box(0.12, 0.5, 0.5, x + 0.95, 1.27, z, DARK),
  box(1.6, 0.04, 1.6, x, 0, z + 1, a)
];
const bench = (x, z) => [
  box(0.4, 0.45, 1.3, x, 0, z, '#2d2f33'),
  post(x - 0.6, 0, z - 0.6, 1.1, DARK, 0.08),
  post(x + 0.6, 0, z - 0.6, 1.1, DARK, 0.08),
  box(1.7, 0.05, 0.05, x, 1.05, z - 0.6, '#cfcfcf')
];
const plyo = (x, z, a) => [box(0.8, 0.5, 0.8, x - 1.1, 0, z, a), box(0.8, 0.8, 0.8, x, 0, z, WHITE), box(0.8, 1.1, 0.8, x + 1.1, 0, z, a)];
const mats = (x, z, w, d, a) => [box(w, 0.08, d, x, 0, z, a), box(w * 0.48, 0.09, d, x + w * 0.26, 0, z, '#3f6fb5')];
const crates = (x, z) => [
  box(1.3, 1.1, 1.3, x - 0.8, 0, z, WOOD),
  box(1.3, 1.1, 1.3, x + 0.6, 0, z, '#a07c56'),
  box(1.3, 1.1, 1.3, x - 0.1, 1.1, z, WOOD)
];
const container = (x, z, c, ry = 0) => at([box(6, 2.6, 2.4, 0, 0, 0, c), box(6.05, 0.15, 2.45, 0, 2.6, 0, DARK)], x, 0, z, ry);
const lantern = (x, y, z) => [cyl(0.25, 0.5, x, y, z, '#d8452f', 8)];
const torii = (x, z, w, h, c = RED) => [
  post(x - w / 2, 0, z, h, c, 0.4),
  post(x + w / 2, 0, z, h, c, 0.4),
  box(w + 1.4, 0.4, 0.5, x, h, z, c),
  box(w + 0.4, 0.25, 0.3, x, h - 0.9, z, c)
];
const palm = (x, z) => [
  cyl(0.18, 5, x, 0, z, '#8a7356', 6, 0.25),
  ...[0, 1, 2, 3, 4].map(i =>
    box(2.6, 0.08, 0.5, 1.1, 0, 0, '#4f8a3c')
      .rotateZ(-0.25)
      .rotateY((i / 5) * Math.PI * 2)
      .translate(x, 5, z)
  )
];
const flag = (x, z, h, c) => [post(x, 0, z, h, '#d8d8d8', 0.12), box(1.6, 1, 0.05, x + 0.85, h - 1.1, z, c)];
const floodMast = (x, z, h) => [post(x, 0, z, h, DARK, 0.3), box(1.6, 0.8, 0.5, x, h, z, '#f6f0c8')];

/** The designs: S = { w, d, h }, a = accent, u(k) = a hash. */
export const FAC = {
  // Wei — glass, steel and lit signs ------------------------------------------------------------------------------------------
  // Dynasty Strength Center: a glass-fronted hall; a lifting deck on its roof (racks, benches, mats) behind a glass rail
  strength: (S, a) => {
    const { w, d } = S,
      H = 7;
    return {
      parts: [
        box(w, H, d, 0, 0, 0, CONC),
        box(w - 0.6, H - 1.6, 0.2, 0, 0.4, d / 2, GLASS), // the glass front
        box(0.2, H - 1.6, d - 3, w / 2, 0.4, 0, GLASS2),
        box(w + 0.4, 0.5, d + 0.4, 0, H, 0, DARK),
        box(w, 0.6, 0.3, 0, H - 1.2, d / 2 + 0.2, a), // the accent band
        box(3, 3, 0.3, -w / 4, 0, d / 2 + 0.25, DARK), // the door
        box(w - 1, 0.1, d - 1, 0, H + 0.5, 0, RUBBER), // the roof deck
        box(w, 1.1, 0.08, 0, H + 0.5, -d / 2 + 0.1, GLASS2),
        box(w, 1.1, 0.08, 0, H + 0.5, d / 2 - 0.1, GLASS2),
        ...rack(-w / 2 + 3, -d / 4, a),
        ...rack(-w / 2 + 6.5, -d / 4, a),
        ...rack(-w / 2 + 10, -d / 4, a),
        ...bench(-w / 2 + 4, d / 6),
        ...bench(-w / 2 + 7.5, d / 6),
        ...mats(w / 4, 0, 7, 6, a)
      ].map((g, i) => (i >= 6 ? g.translate(0, i >= 9 ? H + 0.6 : 0, 0) : g)),
      sign: { x: 0, z: 0, hw: w / 2, hd: d / 2, y: H - 2.6, w: Math.min(16, w * 0.7), h: 2.2 }
    };
  },
  // Dome Sprint Lab: a white dome in the infield of a red running-track oval
  sprintlab: (S, a) => {
    const { w, d } = S,
      rx = w / 2 - 1,
      rz = d / 2 - 1;
    return {
      parts: [
        oval(rx - 4.2, rz - 4.2, rx, rz, 0, 0.14, TRACK),
        ...[1, 2, 3].map(i => oval(rx - 1.4 * i - 0.05, rz - 1.4 * i - 0.05, rx - 1.4 * i + 0.05, rz - 1.4 * i + 0.05, 0.14, 0.02, WHITE)),
        oval(0, 0, rx - 4.2, rz - 4.2, 0, 0.08, LAWN),
        dome(rx * 0.45, 9, rz * 0.62, 0, 0, -0.5, WHITE),
        oval(rx * 0.45 - 0.2, rz * 0.62 - 0.2, rx * 0.45 + 0.05, rz * 0.62 + 0.05, 0, 1.2, a, 0, -0.5),
        box(4, 3, 3, 0, 0, rz * 0.62 - 1, GLASS), // the entrance
        box(0.15, 0.03, 4.2, -2, 0.16, rz - 2.1, WHITE), // the start line
        ...at(flag(rx - 1, -rz + 2, 6, a), 0, 0, 0),
        ...at(flag(-rx + 1, -rz + 2, 6, a), 0, 0, 0)
      ],
      sign: { x: 0, z: rz * 0.62 + 0.5, hw: 3, hd: 1.5, y: 3.8, w: 9, h: 1.6 }
    };
  },
  // Academy Film Library: a columned block whose front is one big film screen
  filmlib: (S, a) => {
    const { w, d, h } = S;
    const out = [
      box(w, h - 1, d, 0, 0, -0.6, '#cfc9bb'),
      box(w + 0.6, 0.8, d + 0.6, 0, h - 1, -0.6, '#8a8c90'),
      box(w * 0.78, h * 0.5, 0.3, 0, h * 0.28, d / 2 - 0.4, '#1d2a3a')
    ];
    out.push(box(w * 0.78 - 0.6, h * 0.5 - 0.6, 0.32, 0, h * 0.28 + 0.3, d / 2 - 0.38, '#6fa8d8')); // the screen's picture
    for (let i = 0; i < 6; i++) out.push(cyl(0.35, 3.4, -w / 2 + 1.2 + (i * (w - 2.4)) / 5, 0, d / 2 - 0.2, WHITE, 8));
    out.push(box(w * 0.6, 0.4, 2, 0, 0, d / 2 - 0.2, STONE), box(3, 2.8, 0.3, 0, 0, d / 2 - 0.5, DARK));
    out.push(...[-1, 1].map(k => box(1.2, h - 1, 0.6, k * (w / 2 - 0.6), 0, d / 2 - 0.4, a)));
    return { parts: out, sign: { x: 0, z: -0.6, hw: w / 2, hd: d / 2, y: h - 2.4, w: w * 0.6, h: 1.4 } };
  },
  // Skytower Plyo Gym: a glass tower on a podium; the podium roof is the plyo yard (boxes in rows)
  plyotower: (S, a) => {
    const { w, d, h } = S,
      P = 4;
    const out = [box(w, P, d, 0, 0, 0, CONC), box(w - 0.4, P - 1.4, 0.2, 0, 0.3, d / 2, GLASS)];
    out.push(
      box(9, h - P - 3, 9, -w / 4 + 1, P, -d / 4 + 1, GLASS),
      box(9.4, 0.5, 9.4, -w / 4 + 1, h - 3, -d / 4 + 1, a),
      box(4, 2.5, 4, -w / 4 + 1, h - 2.5, -d / 4 + 1, WHITE)
    );
    for (let i = 0; i < 6; i++) out.push(box(9.2, 0.2, 9.2, -w / 4 + 1, P + 3 + i * 3.6, -d / 4 + 1, STEEL));
    for (let r = 0; r < 2; r++) out.push(...plyo(w / 4, -d / 4 + 2 + r * 2.4 + 2, a).map(g => g.translate(0, P, 0)));
    out.push(...plyo(w / 4, d / 4, a).map(g => g.translate(0, P, 0)), box(w, 1, 0.1, 0, P, d / 2 - 0.05, GLASS2));
    return { parts: out, sign: { x: 0, z: 0, hw: w / 2, hd: d / 2, y: P - 1, w: w * 0.7, h: 1.4 } };
  },
  // St. Gloria Private Club: a white clubhouse under terracotta, a turquoise pool and a mats pavilion
  club: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.6, 5, d * 0.42, -w * 0.18, 0, -d * 0.27, '#f2ede2'),
        hip(w * 0.66, 2.6, d * 0.5, -w * 0.18, 5, -d * 0.27, TERRA),
        ...[0, 1, 2, 3, 4].map(i => cyl(0.3, 4.2, -w * 0.45 + i * (w * 0.135), 0, -d * 0.05, WHITE, 8)),
        box(w * 0.4, 0.3, d * 0.36, -w * 0.12, 0, d * 0.25, '#e8e2d2'),
        box(w * 0.36, 0.32, d * 0.3, -w * 0.12, 0.01, d * 0.25, '#4fc0d0'),
        box(w * 0.26, 0.15, d * 0.3, w * 0.33, 0, d * 0.22, '#d8d2c4'),
        ...mats(w * 0.33, d * 0.22, w * 0.2, d * 0.22, a).map(g => g.translate(0, 0.15, 0)),
        ...[-1, 1].map(k => post(w * 0.33 + k * w * 0.11, 0, d * 0.22, 3.2, WHITE, 0.25)),
        box(w * 0.28, 0.25, d * 0.34, w * 0.33, 3.2, d * 0.22, a),
        ...palm(w * 0.42, -d * 0.35),
        ...palm(-w * 0.45, d * 0.4)
      ],
      sign: { x: -w * 0.18, z: -d * 0.27, hw: w * 0.3, hd: d * 0.21, y: 3.6, w: w * 0.36, h: 1.2 }
    };
  },
  // Wu — warehouses, steel, timber decks ----------------------------------------------------------------------------------------
  // Harbor Gym: a steel warehouse gym; a gantry crane over the crate yard; racks under a lean-to
  harboryard: (S, a) => {
    const { w, d } = S;
    const out = [
      box(18, 6.5, 13, -w / 2 + 9, 0, -d / 2 + 6.5, '#6d7f90'),
      gable(18.4, 2.6, 13.6, -w / 2 + 9, 6.5, -d / 2 + 6.5, '#9aa3ad'),
      box(5, 4.4, 0.3, -w / 2 + 9, 0, -d / 2 + 13.1, '#3b4652')
    ];
    out.push(box(18.2, 0.5, 13.2, -w / 2 + 9, 4.8, -d / 2 + 6.5, a));
    for (const x of [w / 2 - 12, w / 2 - 1.5]) for (const z of [-d / 2 + 1, d / 2 - 4]) out.push(post(x, 0, z, 11, '#d0a030', 0.5));
    out.push(
      box(12, 0.8, 0.6, w / 2 - 6.75, 11, -d / 2 + 1, '#d0a030'),
      box(12, 0.8, 0.6, w / 2 - 6.75, 11, d / 2 - 4, '#d0a030'),
      box(1.6, 1.2, d - 4.4, w / 2 - 6, 10.4, -1.5, '#d0a030')
    );
    out.push(
      ...container(w / 2 - 6.5, -d / 2 + 3.2, '#c0452f'),
      ...container(w / 2 - 6.5, -d / 2 + 3.2 + 2.6, '#2f6fa8'),
      ...container(w / 2 - 6.5, -d / 2 + 3.2, '#3f8a5a').map(g => g.translate(0, 2.7, 0))
    );
    out.push(...crates(w / 2 - 9, d / 2 - 4.5), ...crates(w / 2 - 4.5, d / 2 - 2.5));
    out.push(
      box(9, 0.2, 4, -w / 2 + 6, 3.2, d / 2 - 2.5, '#9aa3ad'),
      post(-w / 2 + 1.8, 0, d / 2 - 0.8, 3.2, STEEL, 0.2),
      post(-w / 2 + 10.2, 0, d / 2 - 0.8, 3.2, STEEL, 0.2)
    );
    out.push(...rack(-w / 2 + 3.5, d / 2 - 3, a), ...rack(-w / 2 + 7.5, d / 2 - 3, a));
    return { parts: out, sign: { x: -w / 2 + 9, z: -d / 2 + 6.5, hw: 9, hd: 6.5, y: 5.3, w: 12, h: 1.6 } };
  },
  // Pier Jump Deck: a timber deck on piles at the water, plyo boxes, a lifeguard tower and a swim ladder
  pierdeck: (S, a) => {
    const { w, d } = S,
      Y = 1.2;
    const out = [box(w, 0.35, d, 0, Y - 0.35, 0, '#9a7b52')];
    for (let i = 0; i < 6; i++)
      for (const z of [-d / 2 + 0.6, d / 2 - 0.6]) out.push(post(-w / 2 + 0.6 + (i * (w - 1.2)) / 5, -1.5, z, Y + 1.15, WOOD2, 0.35));
    for (let i = 0; i < 8; i++) out.push(box(0.05, 0.02, d - 0.4, -w / 2 + 1.6 + i * ((w - 3.2) / 7), Y, 0, '#7f6442'));
    for (const k of [-1, 0, 1]) out.push(...plyo(k * 5, -d / 6, a).map(g => g.translate(0, Y, 0)));
    out.push(
      ...[-1, 1].map(k => post(w / 2 - 3 + k * 0.9, Y, -d / 2 + 2.5, 3.2, WHITE, 0.18)),
      box(2.4, 1.4, 2, w / 2 - 3, Y + 3.2, -d / 2 + 2.5, '#d8452f'),
      hip(2.8, 0.8, 2.4, w / 2 - 3, Y + 4.6, -d / 2 + 2.5, WHITE)
    );
    out.push(box(6, 0.25, 4, -w / 2 + 4.5, Y, -d / 2 + 3, WHITE), box(5.4, 0.27, 3.4, -w / 2 + 4.5, Y + 0.01, -d / 2 + 3, WATER));
    out.push(box(w, 0.9, 0.08, 0, Y, -d / 2 + 0.05, '#cfc6b0'));
    return { parts: out, sign: { x: w / 2 - 3, z: -d / 2 + 2.5, hw: 1.2, hd: 1, y: Y + 2.4, w: 7, h: 1.2 } };
  },
  // Sand Courts: two sand courts in a fenced compound, a shade hut between them
  sandcourts: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        ...court(-w / 4 - 0.4, 0, 0, SAND, a, 16, 8),
        ...court(w / 4 + 0.4, 0, 0, SAND, a, 16, 8),
        ...fence(w, d, 2.2, '#9aa0a6', 6),
        box(3, 2.6, 2.4, 0, 0, -d / 2 + 2, WOOD),
        hip(3.8, 1, 3.2, 0, 2.6, -d / 2 + 2, a),
        ...palm(-w / 2 + 1.5, d / 2 - 1.5),
        ...palm(w / 2 - 1.5, -d / 2 + 1.5)
      ],
      sign: { x: 0, z: -d / 2 + 2, hw: 1.5, hd: 1.2, y: 2.1, w: 8, h: 1.2 }
    };
  },
  // Dune Sprints: sand hills with a flagged sprint lane up them and a beach shack
  dunesprint: (S, a) => {
    const { w, d } = S;
    const out = [
      hip(12, 3.2, 9, -w / 4, 0, -d / 5, SAND),
      hip(9, 2.4, 8, w / 6, 0, -d / 4, '#dcc68c'),
      hip(10, 2.8, 7, w / 3, 0, d / 6, SAND)
    ];
    for (let i = 0; i < 7; i++) out.push(...flag(-w / 2 + 2 + i * ((w - 4) / 6), d / 2 - 2.5, 2.2, i % 2 ? a : WHITE));
    out.push(box(w - 4, 0.04, 1.6, 0, 0, d / 2 - 4, '#d4bc80'));
    out.push(box(4, 2.6, 3, -w / 2 + 3, 0, d / 2 - 8, '#b88a5a'), gable(4.4, 1.2, 3.4, -w / 2 + 3, 2.6, d / 2 - 8, '#5f7891'));
    return { parts: out, sign: { x: -w / 2 + 3, z: d / 2 - 8, hw: 2, hd: 1.5, y: 1.9, w: 7, h: 1.1 } };
  },
  // Seaside Inn: two floors of balconies under a tin roof, a water tank, palms
  inn: (S, a) => {
    const { w, d } = S;
    const B = w - 3, // the body (balconies and a palm in front of it, on the lot)
      D = d - 2.6;
    const out = [box(B, 6, D, -1.5, 0, -1.3, '#e6dcc4'), gable(B + 0.6, 2.4, D + 0.8, -1.5, 6, -1.3, '#9aa3ad')];
    for (let i = 0; i < 5; i++)
      out.push(
        box(2.6, 0.15, 1.2, -B / 2 + 0.9 + i * ((B - 4.8) / 4), 3, D / 2 - 0.7, WHITE),
        box(2.6, 0.9, 0.06, -B / 2 + 0.9 + i * ((B - 4.8) / 4), 3.15, D / 2 - 0.15, a)
      );
    out.push(cyl(1, 1.6, B / 3, 6, -2, '#3f6fb0', 10), ...palm(w / 2 - 1.2, d / 2 - 1.2), box(3, 2.6, 0.3, -1.5, 0, D / 2 - 1.25, WOOD));
    return { parts: out, sign: { x: -1.5, z: -1.3, hw: B / 2, hd: D / 2, y: 4.6, w: B * 0.5, h: 1.1 } };
  },
  // Wu Navy · Harbor HQ: a steel boathouse hall with a signal mast
  hqHarbor: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 8, d, 0, 0, 0, '#5f7891'),
        barrel(w + 0.4, 4, d + 0.4, 0, 8, 0, '#a8b0b8'),
        box(w + 0.3, 1, d + 0.3, 0, 6.2, 0, a),
        box(7, 6, 0.3, 0, 0, d / 2 + 0.05, '#3b4652'),
        post(w / 2 - 1, 0, d / 2 - 1, 14, WHITE, 0.3),
        box(0.2, 0.2, 5, w / 2 - 1, 12, d / 2 - 1, WHITE),
        box(2.4, 1.4, 0.06, w / 2 + 0.3, 11.8, d / 2 - 1, a)
      ],
      sign: { x: 0, z: 0, hw: w / 2, hd: d / 2, y: 7, w: w * 0.6, h: 1.4 }
    };
  },
  // Wu Navy · Fort HQ: a sea fort — a squat concrete keep with four round towers
  hqFort: (S, a) => {
    const { w, d } = S;
    const out = [box(w - 4, 9, d - 4, 0, 0, 0, '#9a9c98'), box(w - 3.6, 1, d - 3.6, 0, 9, 0, a)];
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ])
      out.push(
        cyl(2.4, 12, (x * (w - 4)) / 2, 0, (z * (d - 4)) / 2, '#8f918d', 12),
        cyl(2.7, 0.8, (x * (w - 4)) / 2, 12, (z * (d - 4)) / 2, DARK, 12)
      );
    out.push(box(4, 4.5, 0.4, 0, 0, d / 2 - 1.8, DARK), ...flag(0, 0, 13, a));
    return { parts: out, sign: { x: 0, z: 0, hw: (w - 4) / 2, hd: (d - 4) / 2, y: 7.2, w: w * 0.5, h: 1.4 } };
  },
  // the Cargo Shed by the airport: an arched hangar, its doors open
  cargoshed: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w - 4, 5, d, 2, 0, 0, '#9aa3ad'),
        barrel(w - 3.8, 3.5, d + 0.2, 2, 5, 0, '#7f858d'),
        box((w - 4) * 0.7, 4.6, 0.3, 2, 0, d / 2 + 0.05, '#2b2e33'),
        box(w - 3.8, 0.5, d + 0.2, 2, 4.6, 0, a),
        ...crates(-w / 2 + 1.6, d / 2 - 2)
      ],
      sign: { x: 2, z: 0, hw: (w - 4) / 2, hd: d / 2, y: 6.2, w: w * 0.6, h: 1.2 }
    };
  },
  // The Lighthouse: a striped tower with a glass lantern on a rock
  lighthouse: (S, a) => {
    const { w } = S;
    const out = [cyl(w / 2, 1.5, 0, 0, 0, STONE, 10, w / 2 + 0.5)];
    for (let i = 0; i < 5; i++) out.push(cyl(2.4 - i * 0.18, 3.6, 0, 1.5 + i * 3.6, 0, i % 2 ? RED : WHITE, 14, 2.6 - i * 0.18));
    out.push(
      cyl(2.4, 0.5, 0, 19.5, 0, DARK, 14),
      cyl(1.3, 2, 0, 20, 0, '#f6e9a8', 12),
      part(new THREE.ConeGeometry(1.6, 1.6, 12).translate(0, 22.8, 0), RED),
      box(2.6, 2.4, 2.2, w / 2 - 1.5, 0, 0, WHITE)
    );
    return { parts: out, sign: { x: w / 2 - 1.5, z: 0, hw: 1.3, hd: 1.1, y: 1.7, w: 6, h: 1 } };
  },
  // The Onsen: a low timber bathhouse with steaming stone pools
  onsen: (S, a) => {
    const { w, d } = S;
    const out = [box(w * 0.5, 3.6, d * 0.5, -w / 4, 0, -d / 4, WOOD), hip(w * 0.6, 2.2, d * 0.62, -w / 4, 3.6, -d / 4, TILE)];
    for (const [x, z, r] of [
      [w / 5, -d / 6, 3.4],
      [w / 4, d / 4, 2.6],
      [-w / 6, d / 4, 2.8]
    ])
      out.push(oval(r - 0.6, r - 0.6, r, r, 0, 0.6, STONE, x, z), oval(0, 0, r - 0.6, r - 0.6, 0, 0.45, '#8fc8d0', x, z));
    out.push(...torii(-w / 4, d / 2 - 0.6, 3, 3.4, a));
    return { parts: out, sign: { x: -w / 4, z: -d / 4, hw: w / 4, hd: d / 4, y: 2.6, w: w * 0.36, h: 1 } };
  },
  // Shu — timber, stone and tiered roofs ------------------------------------------------------------------------------------------
  // Highland Dojo: a timber hall under a two-tier roof, a courtyard of mats, a well and a woodpile (chores)
  dojo: (S, a) => {
    const { w, d } = S;
    const out = [
      box(w * 0.7, 3.8, d * 0.5, 0, 0.6, -d / 4, WOOD),
      box(w * 0.74, 0.6, d * 0.54, 0, 0, -d / 4, STONE),
      ...tiers(w * 0.86, d * 0.66, 4.4, 2, TILE, WOOD2, 2.6).map(g => g.translate(0, 0, -d / 4))
    ];
    out.push(
      ...mats(-w / 5, d / 4, w * 0.3, d * 0.28, a),
      cyl(0.9, 0.9, w / 4, 0, d / 4, STONE, 10),
      box(2.4, 1, 1, w / 4 + 2.6, 0, d / 4 + 1.6, WOOD2)
    );
    out.push(...torii(0, d / 2 - 0.4, 3.4, 3.6, a));
    return { parts: out, sign: { x: 0, z: -d / 4, hw: w * 0.35, hd: d / 4, y: 3.3, w: w * 0.36, h: 1 } };
  },
  // Stone Gym: a dry-stone hall under a slate gable; atlas stones and crates in its yard
  stonegym: (S, a) => {
    const { w, d } = S;
    const out = [
      box(w * 0.62, 4, d * 0.7, -w * 0.18, 0, -d * 0.1, '#8c877c'),
      gable(w * 0.66, 2.6, d * 0.76, -w * 0.18, 4, -d * 0.1, '#4c5054'),
      box(2.4, 2.8, 0.3, -w * 0.18, 0, d * 0.25 + 0.15, WOOD2)
    ];
    for (let i = 0; i < 4; i++)
      out.push(part(new THREE.SphereGeometry(0.35 + i * 0.1, 8, 6).translate(w * 0.26, 0.35 + i * 0.1, -d * 0.3 + i * 1.6), STONE));
    out.push(...crates(w * 0.3, d * 0.28), box(3.4, 0.08, 3, w * 0.28, 0, 0, '#7f7466'), ...rack(w * 0.28, 1.2, a));
    return { parts: out, sign: { x: -w * 0.18, z: -d * 0.1, hw: w * 0.31, hd: d * 0.35, y: 3, w: w * 0.4, h: 1 } };
  },
  // Shrine Library: a three-tier pagoda over a library hall, shelves under its eaves
  pagoda: (S, a) => {
    const { w, d } = S;
    const out = [
      box(w * 0.7, 0.8, d * 0.7, 0, 0, 0, STONE),
      box(w * 0.5, 3.4, d * 0.5, 0, 0.8, 0, '#d9cfb8'),
      ...tiers(w * 0.74, d * 0.74, 4.2, 3, '#7a3b2e', '#c9b99a', 3.4)
    ];
    out.push(part(new THREE.ConeGeometry(0.25, 3, 6).translate(0, 4.2 + 3 * 3.4 + 0.6, 0), GOLD), ...torii(0, d / 2 - 0.4, 3.4, 3.8, RED));
    out.push(box(2.6, 2, 0.7, -w * 0.3, 0.8, d * 0.18, WOOD), box(2.4, 0.3, 0.72, -w * 0.3, 1.2, d * 0.18, a));
    return { parts: out, sign: { x: 0, z: 0, hw: w * 0.25, hd: d * 0.25, y: 3.1, w: w * 0.3, h: 0.9 } };
  },
  // Thousand Steps: a long flight of stone steps up to a red gate on a little platform
  steps: (S, a) => {
    const { w, d } = S,
      n = 14;
    const out = [];
    for (let i = 0; i < n; i++)
      out.push(box(w * 0.5, 0.55 * (i + 1), d / n + 0.02, 0, 0, d / 2 - (i + 0.5) * (d / n), i % 2 ? STONE : '#8f8c84'));
    out.push(...torii(0, -d / 2 + 1.2, w * 0.4, 4.2, a).map(g => g.translate(0, 0.55 * n, 0)));
    for (const k of [-1, 1])
      for (let i = 0; i < 4; i++) out.push(...lantern(k * (w * 0.32), 0.55 * (i * 3.5 + 1) + 0.5, d / 2 - (i * 3.5 + 1) * (d / n)));
    return { parts: out, sign: { x: 0, z: d / 2 - 1, hw: w * 0.25, hd: 1, y: 2.2, w: w * 0.5, h: 0.9 } };
  },
  // Mountain Trail: a timber trailhead gate, a waymark board and a rest hut
  trailhead: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        post(-2.2, 0, d / 2 - 1, 4.2, WOOD2, 0.4),
        post(2.2, 0, d / 2 - 1, 4.2, WOOD2, 0.4),
        box(5.6, 0.6, 0.5, 0, 4.2, d / 2 - 1, WOOD),
        box(4, 3, 3.6, -w / 4, 0, -d / 4, WOOD),
        gable(4.6, 1.6, 4.2, -w / 4, 3, -d / 4, TILE),
        post(w / 4, 0, 0, 2.4, WOOD2, 0.25),
        box(1.6, 1.2, 0.12, w / 4, 1.4, 0.1, a),
        box(1.2, 0.08, d - 3, 0, 0, 0, '#8b7355'),
        part(new THREE.ConeGeometry(0.9, 1.6, 6).translate(w / 3, 0.8, -d / 3), STONE)
      ],
      sign: { x: 0, z: d / 2 - 1, hw: 2.8, hd: 0.25, y: 3.4, w: 5, h: 0.9 }
    };
  },
  // Mountain Lodge: a timber A-frame with a stone chimney and a deck
  lodge: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 1.6, d - 3, 0, 0, -1.5, WOOD2),
        gable(w, 8, d - 2.4, 0, 1.6, -1.5, '#3f3a34'),
        box(w * 0.5, 6, 0.2, 0, 1.6, d / 2 - 3.4, GLASS),
        box(1.4, 9, 1.4, w / 2 - 1.2, 0, -2.5, STONE),
        box(w, 0.3, 2.6, 0, 1.4, d / 2 - 1.4, WOOD),
        box(w * 0.4, 0.4, 0.3, 0, 7, d / 2 - 3.2, a)
      ],
      sign: { x: 0, z: -1.5, hw: w / 2, hd: (d - 3) / 2, y: 1.1, w: w * 0.5, h: 0.8 }
    };
  },
  // Mountain Noodles: a timber hut with a noren curtain and lanterns
  noodlehut: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.8, 3, d * 0.7, 0, 0, -0.5, WOOD),
        gable(w * 0.9, 1.6, d * 0.84, 0, 3, -0.5, TILE),
        box(w * 0.5, 0.9, 0.06, 0, 1.6, d * 0.35 - 0.4, a),
        ...lantern(-w * 0.32, 2.3, d * 0.35),
        ...lantern(w * 0.32, 2.3, d * 0.35),
        box(w * 0.7, 0.9, 0.8, 0, 0, d * 0.35 + 0.6, WOOD2)
      ],
      sign: { x: 0, z: -0.5, hw: w * 0.4, hd: d * 0.35, y: 2.6, w: w * 0.6, h: 0.7 }
    };
  },
  // The Hermit's Court: a crooked hut beside an earth court with a rope net
  hermit: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        ...court(w / 8, d / 8, 0, '#9a8466', '#c9b98a', 12, 6),
        box(3.4, 2.4, 3, -w / 2 + 2, 0, -d / 2 + 2, WOOD2),
        gable(3.8, 1.4, 3.6, -w / 2 + 2, 2.4, -d / 2 + 2, '#5c5a4a'),
        post(-w / 2 + 3.6, 0, -d / 2 + 0.6, 2.8, a, 0.15)
      ],
      sign: { x: -w / 2 + 2, z: -d / 2 + 2, hw: 1.7, hd: 1.5, y: 1.9, w: 5, h: 0.8 }
    };
  },
  // Shu Dragon · Peak HQ: a hall on a stone plinth under three tiered roofs, a dragon banner
  hqPeak: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 1.6, d, 0, 0, 0, STONE),
        box(w * 0.7, 4.6, d * 0.7, 0, 1.6, 0, '#c9b99a'),
        ...tiers(w * 0.95, d * 0.95, 6.2, 3, TILE, WOOD2, 3.2),
        ...flag(w / 2 - 1, d / 2 - 1, 9, a),
        ...flag(-w / 2 + 1, d / 2 - 1, 9, a)
      ],
      sign: { x: 0, z: 0, hw: w * 0.35, hd: d * 0.35, y: 4.8, w: w * 0.5, h: 1.1 }
    };
  },
  // Shu Dragon · Valley HQ: a long timber hall under a clay-tile roof, its courtyard gate
  hqValley: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.9, 4, d * 0.6, 0, 0, -d * 0.15, WOOD),
        hip(w * 0.98, 3.2, d * 0.74, 0, 4, -d * 0.15, '#7a3b2e'),
        box(w * 0.92, 0.5, d * 0.62, 0, 3.4, -d * 0.15, a),
        ...torii(0, d / 2 - 0.5, 4, 3.6, WOOD2),
        box(w * 0.6, 0.1, d * 0.3, 0, 0, d * 0.25, '#b9ab8a')
      ],
      sign: { x: 0, z: -d * 0.15, hw: w * 0.45, hd: d * 0.3, y: 2.6, w: w * 0.4, h: 1 }
    };
  },
  // the Academy — campus brick ----------------------------------------------------------------------------------------------
  // Academy Gym: a brick hall under a barrel roof; a chores shed and mats on the lawn
  acagym: (S, a) => {
    const { w, d } = S;
    const out = [
      box(w * 0.7, 5.5, d * 0.8, -w * 0.12, 0, -d * 0.05, BRICK),
      barrel(w * 0.72, 3, d * 0.82, -w * 0.12, 5.5, -d * 0.05, '#6b7a8f'),
      box(w * 0.7 + 0.2, 0.6, d * 0.8 + 0.2, -w * 0.12, 4.4, -d * 0.05, a)
    ];
    for (let i = 0; i < 5; i++) out.push(box(1.6, 2, 0.2, -w * 0.12 - w * 0.28 + i * (w * 0.14), 2, d * 0.35 + 0.05, '#8fb4c8'));
    out.push(
      box(3, 3, 0.3, -w * 0.12, 0, d * 0.35 + 0.1, DARK),
      box(3, 2.4, 2.6, w * 0.38, 0, -d * 0.3, CREAM),
      hip(3.6, 1, 3.2, w * 0.38, 2.4, -d * 0.3, BRICK),
      ...mats(w * 0.38, d * 0.22, 4, 4, a)
    );
    return { parts: out, sign: { x: -w * 0.12, z: -d * 0.05, hw: w * 0.35, hd: d * 0.4, y: 4.7, w: w * 0.45, h: 1.1 } };
  },
  // Academy Grounds: the main hall with its clock tower, steps and the lawn pitch
  campus: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.8, 7, d * 0.42, 0, 0, -d * 0.25, CREAM),
        box(w * 0.82, 0.7, d * 0.44, 0, 7, -d * 0.25, '#8f6a4a'),
        ...[0, 1, 2, 3, 4, 5, 6].map(i => box(1.2, 2.2, 0.2, -w * 0.33 + i * (w * 0.11), 3, -d * 0.04 + 0.05, '#8fb4c8')),
        box(4, 15, 4, 0, 0, -d * 0.25, '#d4ccb4'),
        hip(5, 2.4, 5, 0, 15, -d * 0.25, '#8f6a4a'),
        part(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 16).rotateX(Math.PI / 2).translate(0, 12, -d * 0.25 + 2.1), WHITE),
        box(8, 0.8, 3, 0, 0, -d * 0.04 + 1.4, STONE),
        box(w * 0.7, 0.06, d * 0.36, 0, 0, d * 0.28, LAWN),
        ...court(0, d * 0.28, 0.06, '#7fae63', a, 14, 7).slice(1)
      ],
      sign: { x: 0, z: -d * 0.25, hw: w * 0.4, hd: d * 0.21, y: 5.6, w: w * 0.4, h: 1.1 }
    };
  },
  // The Tape Room: a brick annex with a satellite dish and a red ON AIR light
  taperoom: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.8, 4, d * 0.8, 0, 0, 0, BRICK),
        box(w * 0.82, 0.4, d * 0.82, 0, 4, 0, DARK),
        part(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(-0.9).translate(1.4, 5.2, -1), WHITE),
        post(1.4, 4, -1, 1.2, DARK, 0.15),
        box(0.8, 0.5, 0.2, -w * 0.25, 3, d * 0.4 + 0.1, RED),
        box(2, 2.6, 0.3, 0, 0, d * 0.4 + 0.05, a)
      ],
      sign: { x: 0, z: 0, hw: w * 0.4, hd: d * 0.4, y: 3.3, w: w * 0.6, h: 0.7 }
    };
  },
  // Fern's Rooftop: a two-storey walk-up with a netted deck on its roof
  rooftop: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.8, 7, d * 0.8, 0, 0, 0, '#d9cfbd'),
        box(w * 0.8, 0.12, d * 0.8, 0, 7, 0, '#8a7a66'),
        post(-w * 0.3, 7, 0, 2.2, DARK, 0.1),
        post(w * 0.3, 7, 0, 2.2, DARK, 0.1),
        box(w * 0.6, 0.6, 0.04, 0, 8.3, 0, a),
        box(w * 0.8, 1, 0.08, 0, 7, d * 0.4, WHITE),
        box(0.2, 7, 1.2, w * 0.4 + 0.1, 0, d * 0.2, STEEL),
        box(2, 2.6, 0.3, 0, 0, d * 0.4 + 0.05, WOOD)
      ],
      sign: { x: 0, z: 0, hw: w * 0.4, hd: d * 0.4, y: 5.4, w: w * 0.6, h: 0.8 }
    };
  },
  // home: your place (by housing)
  home: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.8, 3.4, d * 0.75, 0, 0, 0, '#e3d5b8'),
        hip(w * 0.95, 2.4, d * 0.9, 0, 3.4, 0, a),
        box(0.8, 1.8, 0.8, w * 0.22, 3.8, -d * 0.15, STONE),
        box(1.3, 2.1, 0.3, 0, 0, d * 0.38, WOOD),
        box(w * 0.6, 0.08, 1.2, 0, 0, d * 0.45, STONE)
      ],
      sign: null
    };
  },
  // Outlaws — overpass concrete, cages and containers --------------------------------------------------------------------------
  // Overpass Cage: a chain-link cage round a hard court, a bench and racks inside, graffiti walls
  cage: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 0.2, d, 0, 0, 0, '#6b6b70'),
        ...fence(w - 1, d - 1, 4.2, '#8f9399', 3),
        ...rack(-w / 4, -d / 4, a),
        ...rack(-w / 4 + 3.4, -d / 4, a),
        ...bench(w / 4, -d / 6),
        box(w * 0.6, 3, 0.4, w * 0.1, 0, -d / 2 + 0.2, '#7d7b76'),
        box(w * 0.4, 1.4, 0.42, w * 0.05, 0.6, -d / 2 + 0.2, a),
        box(2.4, 0.9, 0.42, -w * 0.25, 1.6, -d / 2 + 0.2, '#5ad1a0')
      ],
      sign: { x: w * 0.1, z: -d / 2 + 0.2, hw: w * 0.3, hd: 0.2, y: 2.4, w: w * 0.45, h: 0.8 }
    };
  },
  // Overpass Court: a painted hard court between graffiti walls, its hoops at the ends
  overcourt: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        ...court(0, 0, 0, '#5b6d7a', '#d8d8d8', 18, 9),
        box(w, 2.6, 0.4, 0, 0, -d / 2 + 0.2, '#7d7b76'),
        box(w * 0.5, 1.2, 0.42, -w * 0.15, 0.7, -d / 2 + 0.2, a),
        box(w * 0.3, 1.2, 0.42, w * 0.3, 0.9, -d / 2 + 0.2, '#e04f8a'),
        box(0.4, 2.6, d * 0.6, -w / 2 + 0.2, 0, -d * 0.2, '#7d7b76')
      ],
      sign: { x: 0, z: -d / 2 + 0.2, hw: w / 2, hd: 0.2, y: 2.2, w: w * 0.4, h: 0.7 }
    };
  },
  // The Midnight Court: a dark court under four tall floodlight masts
  nightcourt: (S, a) => {
    const { w, d, h } = S;
    return {
      parts: [
        ...court(0, 0, 0, '#3a3f4a', a, 18, 9),
        ...fence(w, d, 2, '#6f7378', 4),
        ...floodMast(-w / 2 + 0.5, -d / 2 + 0.5, h),
        ...floodMast(w / 2 - 0.5, -d / 2 + 0.5, h),
        ...floodMast(-w / 2 + 0.5, d / 2 - 0.5, h),
        ...floodMast(w / 2 - 0.5, d / 2 - 0.5, h)
      ],
      sign: { x: 0, z: -d / 2, hw: w / 2, hd: 0.1, y: 1.4, w: w * 0.4, h: 0.6 }
    };
  },
  // Street Outlaws HQ: stacked containers under the overpass's concrete, a painted roller door
  hqOutlaws: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 5, d * 0.7, 0, 0, -d * 0.15, '#7d7b76'),
        ...container(-w / 4, d * 0.3, '#c0452f'),
        ...container(w / 4, d * 0.3, '#3f6fb0'),
        ...container(0, -d * 0.15, a).map(g => g.translate(0, 5, 0)),
        ...container(-w / 4, -d * 0.15, '#3a3c40').map(g => g.translate(0, 5, 0)),
        box(6, 4, 0.3, 0, 0, d * 0.2 + 0.05, a),
        box(w * 0.4, 1.2, 0.32, -w * 0.25, 1.4, d * 0.2 + 0.06, '#5ad1a0')
      ],
      sign: { x: 0, z: -d * 0.15, hw: w / 2, hd: d * 0.35, y: 4.3, w: w * 0.35, h: 0.8 }
    };
  },
  // Wei hotels, bars and shops -------------------------------------------------------------------------------------------------
  // City Hotel: a glass tower on a podium, a crown of light
  towerhotel: (S, a) => {
    const { w, d, h } = S;
    const out = [
      box(w, 4, d - 4, 0, 0, -2, CONC),
      box(w * 0.7, h - 6, d * 0.7, 0, 4, -1, GLASS2),
      box(w * 0.74, 1.2, d * 0.74, 0, h - 2, -1, a),
      box(w * 0.5, 0.8, 3.4, 0, 3.2, d / 2 - 2.2, a)
    ];
    for (let i = 0; i < 6; i++) out.push(box(w * 0.71, 0.18, d * 0.71, 0, 6 + i * 3.4, -1, STEEL));
    return { parts: out, sign: { x: 0, z: -1, hw: w * 0.35, hd: d * 0.35, y: h - 4, w: w * 0.6, h: 1.4 } };
  },
  // Noodle Bar: a shopfront with a red awning and a row of lanterns
  noodlebar: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 5.2, d * 0.8, 0, 0, -d * 0.1, '#d6cfc0'),
        box(w - 1, 2.4, 0.2, 0, 0.3, d * 0.3, '#ffd38a'),
        box(w + 0.2, 0.25, 1.6, 0, 3, d * 0.3 + 0.7, RED),
        ...[-2, -1, 0, 1, 2].map(i => lantern(i * (w / 5.5), 2.4, d * 0.3 + 1.3)[0]),
        box(w + 0.2, 0.3, d * 0.8 + 0.2, 0, 5.2, -d * 0.1, DARK)
      ],
      sign: { x: 0, z: -d * 0.1, hw: w / 2, hd: d * 0.4, y: 4.2, w: w * 0.8, h: 1.1 }
    };
  },
  // Neon Arcade: a black box with a lit marquee and glowing stripes
  arcade: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w, 7, d, 0, 0, 0, '#2a2833'),
        box(w + 0.1, 0.3, d + 0.1, 0, 2.2, 0, '#ff4fd8'),
        box(w + 0.1, 0.3, d + 0.1, 0, 4.4, 0, '#4fe3ff'),
        box(w * 0.8, 2.4, 0.3, 0, 0.2, d / 2 + 0.05, '#ffd38a'),
        box(w * 0.9, 1.6, 1.2, 0, 5.6, d / 2 + 0.6, a)
      ],
      sign: { x: 0, z: 0, hw: w / 2, hd: d / 2, y: 6, w: w * 0.8, h: 1.4 }
    };
  },
  // The Old Scout: a narrow corner bar, its door under a green canopy
  scoutbar: (S, a) => {
    const { w, d } = S;
    return {
      parts: [
        box(w * 0.8, 6, d * 0.8, 0, 0, 0, '#5c4636'),
        box(w * 0.82, 0.4, d * 0.82, 0, 6, 0, DARK),
        box(w * 0.6, 0.2, 1.4, 0, 2.8, d * 0.4 + 0.7, '#2f6a4a'),
        box(1.4, 2.4, 0.3, 0, 0, d * 0.4 + 0.05, '#ffd38a'),
        box(w * 0.5, 1.4, 0.2, 0, 3.6, d * 0.4 + 0.1, '#e8c070')
      ],
      sign: { x: 0, z: 0, hw: w * 0.4, hd: d * 0.4, y: 4.8, w: w * 0.7, h: 0.9 }
    };
  },
  // Beach Bonfire: a fire ring of stones, log benches round it, a driftwood shelter
  bonfire: (S, a) => {
    const { w, d } = S;
    const out = [oval(1.4, 1.4, 2, 2, 0, 0.45, STONE), part(new THREE.ConeGeometry(1, 1.8, 7).translate(0, 0.9, 0), '#ff8a3a')];
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2;
      out.push(
        box(2.4, 0.45, 0.5, 0, 0, 0, WOOD)
          .rotateY(t + Math.PI / 2)
          .translate(Math.cos(t) * 4, 0, Math.sin(t) * 4)
      );
    }
    out.push(
      post(-w / 2 + 1, 0, -d / 2 + 1, 2.6, WOOD2, 0.2),
      post(-w / 2 + 4, 0, -d / 2 + 1, 2.6, WOOD2, 0.2),
      box(3.6, 0.15, 2.2, -w / 2 + 2.5, 2.6, -d / 2 + 1.6, a)
    );
    return { parts: out, sign: { x: -w / 2 + 2.5, z: -d / 2 + 1, hw: 1.6, hd: 0.2, y: 1.6, w: 4.4, h: 0.7 } };
  },
  // Wei Dynasty · Gold HQ: the island's gold-crowned glass tower
  hqGold: (S, a) => {
    const { w, d, h } = S;
    const out = [
      box(w, 5, d, 0, 0, 0, '#d8d2c2'),
      box(w * 0.62, h - 9, d * 0.62, 0, 5, -0.5, '#5f86b0'),
      box(w * 0.5, 4, d * 0.5, 0, h - 4, -0.5, GOLD),
      part(new THREE.ConeGeometry(0.4, 4, 6).translate(0, h + 2, -0.5), GOLD)
    ];
    for (let i = 0; i < 7; i++) out.push(box(w * 0.63, 0.25, d * 0.63, 0, 8 + i * 3.6, -0.5, a));
    out.push(box(4, 3.4, 0.3, 0, 0, d / 2 + 0.05, DARK), ...flag(-w / 2 + 1, d / 2 - 1, 8, a), ...flag(w / 2 - 1, d / 2 - 1, 8, a));
    return { parts: out, sign: { x: 0, z: 0, hw: w / 2, hd: d / 2, y: 4, w: w * 0.6, h: 1.4 } };
  },
  // Wei Dynasty · Iron HQ: a brick works tower with a steel frame and a chimney
  hqIron: (S, a) => {
    const { w, d, h } = S;
    const out = [
      box(w, 8, d, 0, 0, 0, '#7a4a3a'),
      box(w * 0.55, h - 8, d * 0.55, -w * 0.15, 8, -1, '#6a6e74'),
      box(w * 0.57, 1, d * 0.57, -w * 0.15, h - 1, -1, a),
      cyl(1.1, h + 4, w * 0.3, 0, -d * 0.25, '#8a5a40', 10)
    ];
    for (let i = 0; i < 4; i++) out.push(box(w * 0.56, 0.3, d * 0.56, -w * 0.15, 11 + i * 3.4, -1, STEEL));
    out.push(box(5, 4, 0.3, 0, 0, d / 2 + 0.05, '#3b3d40'), box(w + 0.2, 0.6, d + 0.2, 0, 6.6, 0, a));
    return { parts: out, sign: { x: 0, z: 0, hw: w / 2, hd: d / 2, y: 5.4, w: w * 0.6, h: 1.4 } };
  },
  // St. Gloria HQ: a white mansion with columns, a pink-roofed portico
  hqGloria: (S, a) => {
    const { w, d } = S;
    const out = [
      box(w * 0.8, 8, d * 0.6, 0, 0, -d * 0.15, '#f4efe6'),
      hip(w * 0.86, 3, d * 0.66, 0, 8, -d * 0.15, TERRA),
      box(w * 0.4, 0.6, 4, 0, 6.4, d * 0.2, WHITE),
      gable(w * 0.42, 1.8, 4.2, 0, 7, d * 0.2, a)
    ];
    for (let i = 0; i < 6; i++) out.push(cyl(0.35, 6.4, -w * 0.18 + i * (w * 0.072), 0, d * 0.3, WHITE, 8));
    out.push(box(w * 0.6, 0.06, d * 0.2, 0, 0, d * 0.42, LAWN), cyl(1, 0.6, 0, 0, d * 0.42, '#d8d2c4', 12));
    return { parts: out, sign: { x: 0, z: -d * 0.15, hw: w * 0.4, hd: d * 0.3, y: 5.2, w: w * 0.4, h: 1 } };
  }
};

/** Facility geometry for model landmark L (with `fac`) in its accent: { geo, sign } — door on +z, centred, feet at y = 0. */
export function buildFacility(L, accent, low = false) {
  const B = FAC[L.fac];
  if (!B) return { geo: buildLandmark(L.kind, accent, L.kit), sign: null };
  const S = { w: L.w, d: L.d, h: L.h },
    { parts, sign } = B(S, accent || '#f5e6a8');
  parts.push(box(S.w * 0.98, 1.2, S.d * 0.98, 0, -1.3, 0, '#6f6c66')); // a footing: hides the gap on a slope (its top just under the ground)
  return { geo: mergeParts(parts), sign: low ? sign && { ...sign, plain: true } : sign };
}
