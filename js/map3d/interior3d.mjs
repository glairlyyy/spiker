// Street-level interiors (spec §4.37 6; T-336b the prototype, T-362 every place): each place's hall (INTERIOR, js/data/city.js) built
// from shared parametric pieces — a shell by size (four walls, the roof) and a furniture library (IPIECE, one piece per station
// kind: racks, mats, a bed, a counter, arcade machines, the club board …) plus a little decor per kind (KIND_LOOK: floor, walls) — in
// the place's faction style (the region's accent, its wall colour). Outdoor facilities stay open: their kit (facility3d) is the
// station. Display only: no rules, no randoms (the layout's variation is INTERIOR's hash).
//   createInteriors(scene, heightAt, { cut }) → { sync(model), tick(dt, { cam, you, street, low, size }), at(screenXY), people(model),
//     info(), stations(), dispose() }
// sync: every place with an INTERIOR found in model.land.landmarks, in its lot's frame (the same yaw rule as town3d). Nothing is built
// then: tick builds the hall you or the camera come within CUT.build m of (at most CUT.max at once; dropped beyond CUT.keep) — the
// frame budget: only the interior you are near exists. tick → { near, shown, flip }: near = the station you stand within
// INTERIOR_NEAR m of ({ place, id, name, order | sleep | act | buy | card, p: world [x, y, z] — the prompt's anchor }), shown = street
// level (> CUT.show), flip = the set of active places changed (built halls + open places within CUT.open m; the host re-syncs the life
// layer with people(model)). at([x, y]) = the station under a canvas point (size = [cw, ch] from tick), or null. people(model) = the
// model with today's people for each active place at its stations' slots (round-robin by id); the model itself otherwise.
// The cutaway: a built hall's own shell stands where the facility's hall is; the facility (town3d's merged landmark mesh) is cut out
// under the hall's turned box (+ its eaves, up to its roof) by opts.cut (map3d passes town.cut) while it is built, restored after.
// The roof and the walls facing the camera fade (cutAlpha) as you or the camera come within CUT.near m of the hall. The arena is an
// open bowl (props, no shell, no cut).
import * as THREE from 'three';
import { MAP_M, smooth } from './geo3d.mjs';
import { box, part, accentOf, landmarkYaw, mergeParts } from './kit3d.mjs';

/**
 * show: the street level the insides appear at; near: the fade's reach (m from the hall); min: the faded walls' opacity; pick: a
 * station click's reach (px); build / keep: a hall is built within build m of you or the camera, dropped beyond keep; max: halls
 * built at once; open: an outdoor place's stations (and people) are active within this many m of you.
 */
export const CUT = { show: 0.6, near: 8, min: 0.08, pick: 28, build: 12, keep: 22, max: 2, open: 40 };
const Ik = () => (typeof INTERIOR !== 'undefined' ? INTERIOR : {}),
  NEAR = () => (typeof INTERIOR_NEAR !== 'undefined' ? INTERIOR_NEAR : 2.5),
  DARK = '#4a4a52',
  STEEL = '#2b2e35',
  WOOD = '#7a5a3e',
  T = 0.3; // wall thickness (m)
/** Walls by faction style (region) — the facility's own material language (spec §4.40). */
const WALLS = { wei: '#c9c6bd', wu: '#8796a3', shu: '#9a7a58', open: '#b56a52', outlaws: '#8a8781', gloria: '#efe9dc' };
/** Per kind: the floor and (optionally) the walls. */
const KIND_LOOK = {
  gym: { floor: '#3b3f46' },
  study: { floor: '#6e6458' },
  lounge: { floor: '#d8d2c4' },
  shed: { floor: '#8d8b85' },
  dojo: { floor: '#c8b77a' },
  library: { floor: '#7a5a3e' },
  hall: { floor: '#b39b78' },
  home: { floor: '#8a6a4c' },
  room: { floor: '#7a6a5a' },
  bar: { floor: '#5c4636' },
  arcade: { floor: '#1f1d29', walls: '#2a2833' },
  nook: { floor: '#6b5a4a' },
  bath: { floor: '#9a978f' },
  hq: { floor: '#5a5f68' },
  court: { floor: '#c98a4a', walls: '#d8d3c4' }
};

/** The cutaway opacity at distance d (m) from you / the camera to the hall (0 = inside): CUT.min inside, 1 from CUT.near. */
export const cutAlpha = d => CUT.min + (1 - CUT.min) * smooth(0, CUT.near, Math.max(0, d));

/**
 * A place's frame: the lot's centre (m), yaw, base (the landmark's feet: town3d's 5-sample minimum), the hall (I.hall, lot frame) and
 * its floor (the highest ground under it, or its plinth) — an open place: base + 0.2 (its stations stand on their own ground).
 */
export function frameOf(L, roads, heightAt, I) {
  const x = L.at[0] * MAP_M,
    z = L.at[1] * MAP_M,
    yaw = landmarkYaw(L, roads),
    base = Math.min(heightAt(x - 3, z - 3), heightAt(x + 3, z - 3), heightAt(x - 3, z + 3), heightAt(x + 3, z + 3), heightAt(x, z)),
    c = Math.cos(yaw),
    s = Math.sin(yaw),
    H = I.hall || null,
    F = { id: L.id, I, H, x, z, yaw, c, s, base, region: L.region, floor: base + 0.2 };
  if (H) {
    let top = base;
    for (const u of [-0.45, 0, 0.45])
      for (const v of [-0.45, 0, 0.45]) {
        const [wx, wz] = toW(F, H.x + u * H.w, H.z + v * H.d);
        top = Math.max(top, heightAt(wx, wz));
      }
    F.floor = Math.max(top, base + (H.y || 0)) + 0.04;
  }
  F.st = I.stations.map(s => {
    const [sx, sz] = toW(F, s.at[0], s.at[1]),
      y = H && !s.out ? F.floor : heightAt(sx, sz) + (s.y || 0);
    return {
      place: F.id,
      id: s.id,
      name: s.name,
      order: s.order || null,
      card: !!s.card,
      sleep: !!s.sleep,
      act: s.act || null,
      verb: s.verb || null,
      buy: s.buy || null,
      p: [sx, y + 1.6, sz]
    };
  });
  return F;
}
/** Local (lx, lz) in frame F → world [x, z] (rotation about y by F.yaw, as makeRotationY). */
export const toW = (F, lx, lz) => [F.x + lx * F.c + lz * F.s, F.z - lx * F.s + lz * F.c];
/** World (x, z) → local [lx, lz] in frame F. */
const toL = (F, x, z) => {
  const dx = x - F.x,
    dz = z - F.z;
  return [dx * F.c - dz * F.s, dx * F.s + dz * F.c];
};
/** How far (m) world point (x, z) lies from F's hall (an open place: its lot; 0 inside). */
export const boxDist = (F, x, z) => {
  const [lx, lz] = toL(F, x, z),
    H = F.H || { x: 0, z: 0, w: F.I.w, d: F.I.d };
  return Math.hypot(Math.max(Math.abs(lx - H.x) - H.w / 2, 0), Math.max(Math.abs(lz - H.z) - H.d / 2, 0));
};
/** The station nearest world point you [x, z] within r m (the stations of the frames given), or null. */
function nearStation(frames, you, r = NEAR()) {
  let best = null,
    bd = r;
  for (const F of frames)
    for (const s of F.st) {
      const d = Math.hypot(s.p[0] - you[0], s.p[2] - you[1]);
      if (d <= bd) ((bd = d), (best = s));
    }
  return best;
}
/** Today's people for F's place at its slots: [{ id, at: map units }] — round-robin by id; past the slots a ring 0.7 m further out. */
function placeAt(F, people) {
  const slots = F.I.stations.flatMap(s => s.slots || []),
    who = people.filter(p => p.spot === F.id).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  if (!slots.length) return [];
  return who.map((p, i) => {
    const [sx, sz] = slots[i % slots.length],
      k = Math.floor(i / slots.length),
      a = k * 2.4;
    const [x, z] = toW(F, sx + (k ? Math.cos(a) * 0.7 : 0), sz + (k ? Math.sin(a) * 0.7 : 0));
    return { id: p.id, at: [Math.round((x / MAP_M) * 100) / 100, Math.round((z / MAP_M) * 100) / 100] };
  });
}

// ---- the furniture library (local: feet at y = 0, centred on the station, facing the door +z) ----------------------------------
const cyl = (r, h, x, y, z, color, axis = 'y', n = 12) => {
  const g = new THREE.CylinderGeometry(r, r, h, n);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return part(g.translate(x, y, z), color);
};
/** A barbell along x at (x, y, z): bar and two plates each side. */
const barbell = (x, y, z, len = 2) => [
  cyl(0.025, len, x, y, z, '#b9bcc2', 'x', 6),
  cyl(0.22, 0.06, x - len / 2 + 0.2, y, z, '#22252b', 'x'),
  cyl(0.22, 0.06, x + len / 2 - 0.2, y, z, '#22252b', 'x'),
  cyl(0.17, 0.05, x - len / 2 + 0.28, y, z, '#b5523b', 'x'),
  cyl(0.17, 0.05, x + len / 2 - 0.28, y, z, '#b5523b', 'x')
];
const stool = (x, z) => [cyl(0.2, 0.06, x, 0.72, z, '#2b2e35'), cyl(0.04, 0.7, x, 0.36, z, '#9aa0a6', 'y', 6)];
/** IPIECE[piece](x, z, a) → parts: the station's furniture at local (x, z) (a = the accent). */
export const IPIECE = {
  // two squat racks behind the station, a bar in each, a plate tree between them
  rack: (x, z) => {
    const out = [];
    for (const rx of [x - 0.9, x + 0.9]) {
      for (const [u, v] of [
        [-0.55, -0.45],
        [0.55, -0.45],
        [-0.55, 0.45],
        [0.55, 0.45]
      ])
        out.push(box(0.08, 2.3, 0.08, rx + u, 0, z - 1.1 + v, STEEL));
      out.push(
        box(1.2, 0.08, 1, rx, 2.3, z - 1.1, STEEL),
        box(1.3, 0.02, 1.1, rx, 0, z - 1.1, '#5a4636'),
        ...barbell(rx, 1.45, z - 0.75, 1.8)
      );
    }
    out.push(cyl(0.05, 1.2, x, 0.6, z - 1.6, STEEL, 'y', 6));
    for (const y of [0.3, 0.6, 0.9]) out.push(cyl(0.2, 0.05, x, y, z - 1.45, '#22252b', 'z'));
    return out;
  },
  bench: (x, z) => [
    box(0.32, 0.1, 1.3, x, 0.42, z, '#1f2229'),
    box(0.1, 0.42, 0.1, x, 0, z - 0.5, STEEL),
    box(0.1, 0.42, 0.1, x, 0, z + 0.5, STEEL),
    box(0.08, 1.1, 0.08, x - 0.45, 0, z - 0.55, STEEL),
    box(0.08, 1.1, 0.08, x + 0.45, 0, z - 0.55, STEEL),
    ...barbell(x, 1.12, z - 0.55, 1.9)
  ],
  mats: (x, z, a) => [
    box(3.8, 0.08, 2.8, x, 0, z, a),
    box(0.04, 0.085, 2.8, x, 0, z, '#20242c'),
    box(3.8, 0.085, 0.04, x, 0, z, '#20242c')
  ],
  mirror: (x, z) => [box(0.7, 0.03, 1.8, x - 0.5, 0, z, '#5f9a62'), box(0.7, 0.03, 1.8, x + 0.5, 0, z - 0.2, '#7b5ea6')],
  stretch: (x, z, a) => [
    box(0.7, 0.03, 1.8, x - 0.45, 0, z, a),
    box(0.7, 0.03, 1.8, x + 0.45, 0, z - 0.15, '#5f9a62'),
    cyl(0.08, 0.6, x + 0.45, 0.08, z + 0.85, '#3f6fb5', 'x', 8)
  ],
  desk: (x, z, a) => [
    box(2.4, 1.05, 0.7, x, 0, z - 0.4, WOOD),
    box(2.5, 0.06, 0.8, x, 1.05, z - 0.4, '#d9cdb8'),
    box(0.5, 0.35, 0.05, x + 0.5, 1.11, z - 0.5, '#22252b'),
    box(2.2, 0.6, 0.05, x, 1.7, z - 1.3, a)
  ],
  plyo: (x, z, a) => [
    box(0.8, 0.5, 0.8, x - 1.1, 0, z - 0.8, a),
    box(0.8, 0.8, 0.8, x, 0, z - 0.8, '#ece9e1'),
    box(0.8, 1.1, 0.8, x + 1.1, 0, z - 0.8, a)
  ],
  lane: (x, z) => [
    box(6.6, 0.02, 1, x, 0, z - 0.8, '#b5523b'),
    box(6.6, 0.025, 0.06, x, 0, z - 1.3, '#f2efe6'),
    box(6.6, 0.025, 0.06, x, 0, z - 0.3, '#f2efe6')
  ],
  pool: (x, z) => [box(6, 0.25, 3.2, x, 0, z - 2, '#e8e2d2'), box(5.6, 0.27, 2.8, x, 0.01, z - 2, '#4fa8c8')],
  screen: (x, z, a) => {
    const out = [
      box(4.4, 2.6, 0.1, x, 0.9, z - 2.4, '#1d2a3a'),
      box(4, 2.2, 0.12, x, 1.1, z - 2.38, '#6fa8d8'),
      box(4.6, 0.2, 0.3, x, 3.5, z - 2.4, a)
    ];
    for (let r = 0; r < 2; r++) for (let i = -2; i <= 2; i++) out.push(box(0.5, 0.45, 0.5, x + i * 0.75, 0, z + 0.4 + r * 1.1, '#3a3d44'));
    return out;
  },
  shelves: (x, z, a) => {
    const out = [];
    for (const k of [-1.3, 0, 1.3]) {
      out.push(box(1.1, 2.2, 0.4, x + k, 0, z - 0.9, WOOD));
      for (const y of [0.4, 0.95, 1.5]) out.push(box(0.95, 0.38, 0.3, x + k, y, z - 0.86, k ? '#8a3b2e' : a));
    }
    out.push(box(1.4, 0.75, 0.8, x, 0, z + 0.4, '#5e4632'));
    return out;
  },
  multigym: (x, z, a) => [
    box(0.1, 2.3, 0.1, x - 0.8, 0, z - 1, STEEL),
    box(0.1, 2.3, 0.1, x + 0.8, 0, z - 1, STEEL),
    box(1.7, 0.1, 0.1, x, 2.3, z - 1, STEEL),
    box(0.4, 1.2, 0.3, x, 0, z - 1.1, '#5b5f68'),
    box(0.5, 0.45, 0.9, x, 0, z - 0.3, a),
    box(1.6, 0.6, 0.4, x + 1.8, 0, z - 0.9, STEEL),
    ...[0, 1, 2].map(i => cyl(0.07, 0.36, x + 1.5 + i * 0.3, 0.68, z - 0.9, '#5b5f68', 'x', 8))
  ],
  crates: (x, z) => [
    box(1.2, 1, 1.2, x - 0.7, 0, z - 0.9, '#a07a4a'),
    box(1.2, 1, 1.2, x + 0.7, 0, z - 0.9, '#8a6a3e'),
    box(1.1, 0.9, 1.1, x, 1, z - 0.9, '#b08a52')
  ],
  mop: (x, z) => [
    cyl(0.22, 0.35, x, 0.18, z, '#d8b030'),
    box(0.03, 1.4, 0.03, x + 0.2, 0, z - 0.1, '#b9bcc2'),
    box(0.4, 0.6, 0.05, x - 0.6, 0, z + 0.3, '#f0c020')
  ],
  bed: (x, z, a) => [
    box(1.5, 0.35, 2.1, x, 0, z - 1.6, WOOD),
    box(1.4, 0.2, 2, x, 0.35, z - 1.6, '#ece9e1'),
    box(1.42, 0.08, 1.3, x, 0.55, z - 1.25, a),
    box(1.1, 0.14, 0.4, x, 0.55, z - 2.35, '#ffffff'),
    box(1.5, 0.9, 0.08, x, 0, z - 2.66, WOOD),
    box(0.45, 0.5, 0.45, x + 1.05, 0, z - 2.3, WOOD),
    cyl(0.12, 0.3, x + 1.05, 0.65, z - 2.3, '#ffe2a8', 'y', 8)
  ],
  counter: (x, z, a) => {
    const out = [
      box(4.4, 1.05, 0.7, x, 0, z - 0.6, WOOD),
      box(4.5, 0.06, 0.85, x, 1.05, z - 0.6, '#d9cdb8'),
      box(4.4, 1.6, 0.35, x, 1.1, z - 1.6, WOOD)
    ];
    for (let i = 0; i < 6; i++) out.push(box(0.35, 0.22, 0.25, x - 1.8 + i * 0.72, 1.6, z - 1.55, i % 2 ? a : '#e8e2d2'));
    for (const k of [-1.5, -0.5, 0.5, 1.5]) out.push(...stool(x + k, z + 0.1));
    out.push(cyl(0.2, 0.4, x - 1.6, 2.6, z - 1.2, '#d8452f', 'y', 8), cyl(0.2, 0.4, x + 1.6, 2.6, z - 1.2, '#d8452f', 'y', 8));
    return out;
  },
  machines: (x, z, a) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const mx = x - 1.65 + i * 1.1;
      out.push(box(0.9, 1.8, 0.8, mx, 0, z - 0.7, '#2b2a3a'), box(0.7, 0.55, 0.06, mx, 1.1, z - 0.28, i % 2 ? '#4fe3ff' : '#ff4fd8'));
      out.push(box(0.92, 0.25, 0.82, mx, 1.8, z - 0.7, a), box(0.7, 0.08, 0.3, mx, 0.95, z - 0.2, '#22252b'));
    }
    return out;
  },
  tv: (x, z, a) => [
    box(1.6, 0.6, 0.5, x, 0, z - 0.9, WOOD),
    box(1.1, 0.75, 0.6, x, 0.6, z - 0.95, '#22252b'),
    box(0.9, 0.55, 0.04, x, 0.7, z - 0.64, '#7fb0d8'),
    box(1.2, 1.9, 0.35, x - 1.6, 0, z - 1, WOOD),
    ...[0.4, 0.9, 1.4].map(y => box(1, 0.3, 0.28, x - 1.6, y, z - 0.98, a)),
    box(0.6, 0.45, 0.6, x, 0, z + 0.6, '#5c4636')
  ],
  letters: (x, z, a) => [
    box(1.2, 0.75, 0.6, x, 0, z - 0.6, WOOD),
    box(0.3, 0.02, 0.22, x - 0.2, 0.76, z - 0.6, '#f4efe6'),
    box(0.3, 0.02, 0.22, x + 0.15, 0.77, z - 0.55, '#efe3c8'),
    box(0.4, 0.5, 0.3, x + 0.8, 1.2, z - 0.85, a)
  ],
  bath: (x, z) => [
    box(4, 0.6, 3, x, 0, z - 1.4, '#8a6a4c'),
    box(3.6, 0.62, 2.6, x, 0.01, z - 1.4, '#8fc8d0'),
    box(0.5, 0.35, 0.5, x + 2.4, 0, z, '#9a978f')
  ],
  board: (x, z, a) => {
    const out = [
      box(4.6, 2.6, 0.15, x, 0.9, z - 1.2, '#22252b'),
      box(4.2, 2.2, 0.17, x, 1.1, z - 1.19, a),
      box(4.8, 0.25, 0.3, x, 3.5, z - 1.2, a)
    ];
    for (const k of [-1, 1])
      out.push(box(1.2, 2, 0.5, x + k * 3.4, 0, z - 1.1, WOOD), cyl(0.15, 0.45, x + k * 3.4, 2.25, z - 1.1, '#d9b04a', 'y', 8));
    for (let r = 0; r < 2; r++) out.push(box(4, 0.45, 0.4, x, 0, z + 1 + r * 1.2, '#5c4636'));
    return out;
  },
  altar: (x, z, a) => [
    box(2, 0.8, 0.8, x, 0, z - 0.8, '#5e4632'),
    box(2.2, 0.1, 0.9, x, 0.8, z - 0.8, a),
    ...[-0.7, 0.7].map(k => cyl(0.05, 0.3, x + k, 1.05, z - 0.8, '#fff6dc', 'y', 6)),
    box(0.6, 0.6, 0.4, x, 0.9, z - 1, '#d9b04a')
  ],
  drone: (x, z, a) => [
    box(1.6, 0.8, 1.2, x, 0, z - 0.6, '#a07a4a'),
    box(0.6, 0.12, 0.6, x, 0.85, z - 0.6, '#2b2e35'),
    ...[
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35]
    ].map(([u, v]) => cyl(0.18, 0.03, x + u, 0.98, z - 0.6 + v, a)),
    box(1.4, 0.9, 1, x + 2, 0, z - 0.9, '#8a6a3e')
  ],
  // the Academy Hall's old real court (spec §4.38: painted lines, wooden posts, a real net) and the referee's stand
  court: (x, z) => {
    const L = 14,
      W = 6.6,
      line = '#f6f3ea',
      cz = z - 1.6,
      out = [box(L, 0.02, W, x, 0, cz, '#d29a5c')];
    for (const zz of [-W / 2, W / 2]) out.push(box(L, 0.03, 0.06, x, 0, cz + zz, line));
    for (const xx of [-L / 2, L / 2, 0, -L / 6, L / 6]) out.push(box(0.06, 0.03, W, x + xx, 0, cz, line));
    out.push(
      box(0.14, 2.5, 0.14, x, 0, cz - W / 2 - 0.4, WOOD),
      box(0.14, 2.5, 0.14, x, 0, cz + W / 2 + 0.4, WOOD),
      box(0.03, 0.8, W + 0.8, x, 1.6, cz, '#20242c'),
      box(0.6, 1.4, 0.6, x, 0, cz - W / 2 - 0.9, WOOD)
    );
    return out;
  }
};
/** The kind's decor along the walls (local, the hall H): benches, banners, rugs … — little, so the stations stay clear. */
function decor(kind, H, a, k) {
  const { x, z, w, d } = H,
    L = x - w / 2 + 0.5,
    R = x + w / 2 - 0.5,
    B = z - d / 2 + 0.4,
    out = [];
  if (kind === 'gym' || kind === 'shed')
    out.push(
      box(0.4, 0.45, Math.min(3, d * 0.3), R - 0.1, 0, z + d * 0.25, '#2b2e35'),
      box(0.06, 1, Math.min(4, d * 0.4), L - 0.38, 2.4, z, a)
    );
  if (kind === 'hq') out.push(box(0.06, 2.4, 1, L - 0.38, 1.5, z, a), box(0.06, 2.4, 1, R + 0.38, 1.5, z, a));
  if (kind === 'home' || kind === 'room' || kind === 'nook')
    out.push(box(Math.min(2.6, w * 0.4), 0.02, 1.8, x + w * 0.12, 0, z + d * 0.05, a), box(1, 2, 0.5, R - 0.2, 0, B + 0.3, WOOD));
  if (kind === 'bar' || kind === 'study' || kind === 'lounge')
    for (const u of [-0.25, 0.25])
      out.push(cyl(0.45, 0.04, x + u * w, 0.74, z + d * 0.3, '#d9cdb8'), cyl(0.05, 0.72, x + u * w, 0.36, z + d * 0.3, STEEL, 'y', 6));
  if (kind === 'arcade')
    out.push(box(w - 1, 0.05, 0.1, x, 0.02, B + 0.2, '#ff4fd8'), box(w - 1, 0.05, 0.1, x, 0.02, z + d / 2 - 0.6, '#4fe3ff'));
  if (kind === 'dojo') out.push(box(w - 1.2, 0.04, d * 0.5, x, 0, z, '#d8c890'), box(0.05, 1.2, 0.8, L - 0.38, 1.4, z, a));
  if (kind === 'library') out.push(box(w * 0.5, 2.2, 0.4, x, 0, B + 0.1, WOOD));
  if (kind === 'bath') out.push(box(w - 1, 0.03, d - 1, x, 0, z, '#8f8c84'));
  if (kind === 'hall') out.push(box(0.06, 1.2, 2, R + 0.38, 1.8, z, a));
  if (k % 3 === 0) out.push(box(0.8, 1.2, 0.8, R - 0.3, 0, B + 0.3, '#5f9a62')); // a plant in a corner (by the hash)
  return out;
}
/** The Strength Center's own extras (T-336b, the prototype judged good): the sprint lane, the dumbbell rack, the mirror wall. */
function strengthDecor(H) {
  const w = H.w - 2 * T,
    d = H.d - 2 * T,
    lx = 2.6,
    lz = -d / 2 + 0.75,
    out = [
      box(6.6, 0.02, 1, lx, 0, lz, '#b5523b'),
      box(6.6, 0.025, 0.06, lx, 0, lz - 0.5, '#f2efe6'),
      box(6.6, 0.025, 0.06, lx, 0, lz + 0.5, '#f2efe6'),
      box(0.6, 0.7, 2.6, -w / 2 + 0.35, 0, 0.4, STEEL)
    ];
  for (let i = 0; i < 6; i++) out.push(cyl(0.07, 0.36, -w / 2 + 0.35, 0.78, -0.6 + i * 0.4, '#5b5f68', 'x', 8));
  out.push(box(0.04, 2.1, 5.6, w / 2 - 0.03, 0.35, 0.6, '#d6e6ee'), box(0.06, 0.08, 5.7, w / 2 - 0.05, 2.45, 0.6, STEEL));
  return out;
}
/** A hall's props: its floor, its decor and one piece per station inside it (local lot frame, floor at y = 0). */
export function hallProps(I, accent, k = 0) {
  const H = I.hall,
    look = KIND_LOOK[H.kind] || KIND_LOOK.gym,
    out = [box(H.w - 2 * T, 0.04, H.d - 2 * T, H.x, -0.04, H.z, look.floor)];
  if (I.decor === 'strength') out.push(...strengthDecor(H));
  else out.push(...decor(H.kind, H, accent, k));
  for (const s of I.stations) {
    const P = !s.out && s.piece && IPIECE[s.piece];
    if (P) out.push(...P(s.at[0], s.at[1], accent));
  }
  return out;
}
/** A hall's shell: [back, front (door gap), left, right, roof] — each its own geometry (each fades on its own); local lot frame. */
export function hallShell(H, wall, accent) {
  const { w, d, h, x, z } = H,
    band = (bw, bd, bx, bz) => box(bw, Math.min(1, h * 0.15), bd, bx, Math.min(2.6, h * 0.45), bz, accent),
    door = Math.min(2.2, w * 0.3),
    dh = Math.min(3, h - 0.4),
    side = (w - door) / 2,
    merge = mergeParts;
  return [
    merge([box(w, h, T, x, 0, z - d / 2 + T / 2, wall), band(w + 0.2, T + 0.2, x, z - d / 2 + T / 2)]),
    merge([
      box(side, h, T, x - (door + side) / 2, 0, z + d / 2 - T / 2, wall),
      box(side, h, T, x + (door + side) / 2, 0, z + d / 2 - T / 2, wall),
      box(door, h - dh, T, x, dh, z + d / 2 - T / 2, wall),
      band(side + 0.1, T + 0.2, x - (door + side) / 2 - 0.05, z + d / 2 - T / 2),
      band(side + 0.1, T + 0.2, x + (door + side) / 2 + 0.05, z + d / 2 - T / 2),
      box(door, 0.4, T + 0.2, x, dh, z + d / 2 - T / 2, DARK)
    ]),
    merge([box(T, h, d, x - w / 2 + T / 2, 0, z, wall), band(T + 0.2, d + 0.2, x - w / 2 + T / 2, z)]),
    merge([box(T, h, d, x + w / 2 - T / 2, 0, z, wall), band(T + 0.2, d + 0.2, x + w / 2 - T / 2, z)]),
    merge([
      box(w + 0.4, 0.5, d + 0.4, x, h, z, DARK),
      ...[-0.3, 0, 0.3].map(u => box(0.25, 0.06, d - 1.5, x + u * w, h - 0.06, z, '#fff6dc')) // + the ceiling lights
    ])
  ];
}
/** The walls' outward normals in the local frame (the roof's: up). */
const SHELL_N = [[0, -1], [0, 1], [-1, 0], [1, 0], null];
/** The arena's insides on its pitch: a court (map scale, 15 × 7.5 m) with lines, the net, a referee stand, team benches, a scoreboard. */
function arenaProps() {
  const L = 15,
    W = 7.5,
    line = '#f6f3ea',
    out = [box(17, 0.03, 9, 0, 0, 0, '#2f5f8f'), box(L, 0.035, W, 0, 0, 0, '#c97b3c')];
  for (const z of [-W / 2, W / 2]) out.push(box(L, 0.04, 0.07, 0, 0, z, line));
  for (const x of [-L / 2, L / 2, 0, -L / 6, L / 6]) out.push(box(0.07, 0.04, W, x, 0, 0, line));
  out.push(
    box(0.12, 2.6, 0.12, 0, 0, -W / 2 - 0.6, STEEL),
    box(0.12, 2.6, 0.12, 0, 0, W / 2 + 0.6, STEEL),
    box(0.03, 0.85, W + 1.1, 0, 1.55, 0, '#20242c'),
    box(0.05, 0.08, W + 1.1, 0, 2.4, 0, line),
    box(0.8, 1.5, 0.8, 0, 0, -W / 2 - 1.3, '#3a3d44'),
    box(3, 0.45, 0.5, -4, 0, W / 2 + 1.6, '#2c3e66'),
    box(3, 0.45, 0.5, 4, 0, W / 2 + 1.6, '#66302c'),
    box(0.3, 9, 0.3, -3.2, 0, -12.6, STEEL),
    box(0.3, 9, 0.3, 3.2, 0, -12.6, STEEL),
    box(7.4, 3.4, 0.4, 0, 9, -12.6, '#14161c')
  );
  return out;
}
/** The scoreboard's lit face (canvas text in a browser; a flat glow in node). */
function scoreFace() {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd38a', toneMapped: false });
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 112;
    const g = cv.getContext('2d');
    g.fillStyle = '#0d0f14';
    g.fillRect(0, 0, 256, 112);
    g.fillStyle = '#ffd38a';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.fillText('LEAGUE ARENA', 128, 30);
    g.font = 'bold 54px monospace';
    g.fillText('00 : 00', 128, 92);
    mat.map = new THREE.CanvasTexture(cv);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.color.set('#ffffff');
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.9), mat);
  m.position.set(0, 10.7, -12.38);
  return m;
}

/**
 * The cut (town.cut's turned box { cx, cz, c, s, hw, hd, y1 }, world m) round frame F's hall + its eaves (pad, else 0.5 m: the
 * landmark's roof lip and door), up to its roof (floor + h + roof + 0.3) — the facility's hall goes, its taller parts stay.
 */
export const cutBoxOf = F => {
  const H = F.H,
    pad = H.pad != null ? H.pad : 0.5,
    [cx, cz] = toW(F, H.x, H.z);
  return { cx, cz, c: F.c, s: F.s, hw: H.w / 2 + pad, hd: H.d / 2 + pad, y1: F.floor + H.h + (H.roof || 0) + 0.3 };
};

export function createInteriors(scene, heightAt, opts = {}) {
  const group = new THREE.Group(),
    propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
    v3 = new THREE.Vector3();
  group.visible = false;
  group.userData.interiors = true;
  scene.add(group);
  let key = null,
    frames = [], // every place with an INTERIOR (no geometry)
    built = [], // the frames whose hall / bowl is built (F.root), nearest first
    active = [], // built + open places near you: their stations prompt, their people stand at the slots
    activeKey = '',
    cutOn = null, // the boxes handed to opts.cut (JSON; null = none)
    shown = false,
    cam = null,
    size = [1, 1],
    tint = new Map();

  const drop = F => {
    F.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== propMat) (o.material.map && o.material.map.dispose(), o.material.dispose());
    });
    group.remove(F.root);
    F.root = F.shell = null;
  };
  const clear = () => {
    for (const F of built) drop(F);
    built = [];
    active = [];
    frames = [];
  };
  /** The built halls cut out of the town (opts.cut) — restored when none is. */
  const setCut = () => {
    const B = shown ? built.filter(F => F.H).map(cutBoxOf) : [],
      k = B.length ? JSON.stringify(B) : null;
    if (k === cutOn) return;
    cutOn = k;
    if (opts.cut) opts.cut(B.length ? B : null);
  };
  /** Build F's insides: a hall (props + its shell) or the arena's bowl; an open place has none. */
  const build = F => {
    const accent = tint.get(F.region) || accentOf(F.region),
      root = new THREE.Group();
    root.position.set(F.x, F.floor, F.z);
    root.rotation.y = F.yaw;
    const parts = F.I.kind === 'arena' ? arenaProps() : hallProps(F.I, accent, Math.abs(F.x * 7 + F.z * 13) | 0),
      props = new THREE.Mesh(mergeParts(parts), propMat);
    props.castShadow = props.receiveShadow = true;
    root.add(props);
    if (F.H) {
      const wall = (KIND_LOOK[F.H.kind] || {}).walls || WALLS[F.region] || WALLS.wei;
      F.shell = hallShell(F.H, wall, accent).map((sg, i) => {
        const m = new THREE.Mesh(
          sg,
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            flatShading: true,
            transparent: true,
            side: THREE.DoubleSide,
            forceSinglePass: true // (three draws a transparent double-sided mesh twice, back then front, re-picking its program each pass)
          })
        );
        if (i < 4) {
          m.position.y = F.base - F.floor - 0.2; // the walls stand on the landmark's feet (the floor may sit higher on a slope) …
          m.scale.y = (F.H.h + F.floor - F.base + 0.2) / F.H.h; // … up to floor + h, where the roof sits
        }
        m.castShadow = m.receiveShadow = true;
        m.userData.n = SHELL_N[i];
        root.add(m);
        return m;
      });
    } else root.add(scoreFace());
    F.root = root;
    group.add(root);
  };
  /** Distance (m) of you / the camera to F (the nearer). */
  const distOf = (F, you, cp) => Math.min(you ? boxDist(F, you[0], you[1]) : Infinity, cp ? boxDist(F, cp.x, cp.z) : Infinity);
  /** Which halls are built and which places are active this frame (the budget: ≤ CUT.max halls, the nearest). */
  const choose = (you, cp) => {
    if (!shown) {
      for (const F of built) drop(F);
      built = [];
      active = [];
      return;
    }
    const want = frames
      .filter(F => F.H || F.I.kind === 'arena')
      .map(F => [F, distOf(F, you, cp)])
      .filter(([F, d]) => d <= (F.root ? CUT.keep : CUT.build))
      .sort((a, b) => a[1] - b[1])
      .slice(0, CUT.max)
      .map(([F]) => F);
    for (const F of built) if (!want.includes(F)) drop(F);
    for (const F of want) if (!F.root) build(F);
    built = want;
    active = [...built, ...frames.filter(F => !F.H && F.I.kind !== 'arena' && you && distOf(F, you, null) <= CUT.open)];
  };

  return {
    /** The places with insides from model.land (landmarks, roads, regions); re-framed only when they change. */
    sync(model) {
      const land = model && model.land;
      if (!land) return;
      const I = Ik(),
        Ls = (land.landmarks || []).filter(L => I[L.id]),
        k = JSON.stringify([Ls.map(L => [L.id, L.at, L.region, L.rot]), (land.roads || []).length]);
      if (k === key) return;
      key = k;
      clear();
      tint = new Map((land.regions || []).map(r => [r.id, r.color]));
      frames = Ls.map(L => frameOf(L, land.roads, heightAt, I[L.id]));
      activeKey = '';
      setCut();
    },
    /** Per frame: show / hide by street level, build the near hall(s), fade their near walls and roof; the station you stand at. */
    tick(dt, o = {}) {
      cam = o.cam || cam;
      if (o.size) size = o.size;
      shown = (o.street || 0) > CUT.show && frames.length > 0;
      group.visible = shown;
      const you = o.you || null,
        cp = cam ? cam.position : null;
      choose(you, cp);
      setCut();
      const ak = active.map(F => F.id).join(','),
        flip = ak !== activeKey;
      activeKey = ak;
      if (!shown) return { near: null, shown, flip };
      for (const F of built) {
        if (!F.shell) continue;
        const a = cutAlpha(distOf(F, you, cp)),
          [cx, cz] = cp ? toL(F, cp.x, cp.z) : [0, 0];
        for (const m of F.shell) {
          const n = m.userData.n,
            near = !n || (cp && (cx - F.H.x - n[0] * F.H.w * 0.5) * n[0] + (cz - F.H.z - n[1] * F.H.d * 0.5) * n[1] > 0),
            op = near ? a : 1;
          m.material.opacity = op;
          m.material.depthWrite = op > 0.98;
          m.castShadow = op > 0.5 && !o.low;
          m.visible = op > 0.01;
        }
      }
      return { near: you ? nearStation(active, you) : null, shown, flip };
    },
    /** The station under canvas point [x, y] (within CUT.pick px; size from tick), or null. */
    at(xy) {
      if (!shown || !cam || !xy) return null;
      let best = null,
        bd = CUT.pick;
      for (const F of active)
        for (const s of F.st) {
          v3.set(s.p[0], s.p[1] - 1, s.p[2]).project(cam);
          if (v3.z > 1) continue;
          const d = Math.hypot(((v3.x + 1) / 2) * size[0] - xy[0], ((1 - v3.y) / 2) * size[1] - xy[1]);
          if (d < bd) ((bd = d), (best = s));
        }
      return best;
    },
    /** The model with today's people for each active place at its stations (while shown); else the model itself. */
    people(model) {
      if (!shown || !model || !model.life || !active.length) return model;
      const moved = new Map();
      for (const F of active) for (const q of placeAt(F, model.life.people || [])) moved.set(q.id, q.at);
      if (!moved.size) return model;
      return {
        ...model,
        life: {
          ...model.life,
          people: model.life.people.map(p => (moved.has(p.id) ? { ...p, at: moved.get(p.id), act: 'train', inside: true } : p))
        }
      };
    },
    /**
     * QA: what is drawn — { shown, places (every place with an interior), built (the halls built now), active, cut (halls cut),
     * alpha (the nearest built hall's roof opacity), tris (the built insides' triangles) }.
     */
    info: () => {
      const g = built.find(F => F.shell);
      let tris = 0;
      for (const F of built)
        F.root.traverse(
          m => m.geometry && (tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3)
        );
      return {
        shown,
        places: frames.map(F => F.id),
        built: built.map(F => F.id),
        active: active.map(F => F.id),
        cut: cutOn ? JSON.parse(cutOn).length : 0,
        alpha: g ? +g.shell[4].material.opacity.toFixed(2) : null,
        tris: Math.round(tris)
      };
    },
    /** The stations in the world (QA, tests): every place's. */
    stations: () => frames.flatMap(F => F.st),
    dispose() {
      shown = false;
      for (const F of built) drop(F);
      built = [];
      setCut();
      clear();
      propMat.dispose();
      scene.remove(group);
    }
  };
}
