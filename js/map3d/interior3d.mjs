// Street-level interiors (spec §4.37 6, T-336b): the Dynasty Strength Center's gym and the League Arena's court, drawn inside
// their landmarks when the camera is down at street level (street > CUT.show). Display only: no rules, no randoms.
//   createInteriors(scene, heightAt, { cut }) → { sync(model), tick(dt, { cam, you, street, low, size }), at(screenXY), people(model), dispose() }
// sync: the places with insides (INTERIOR, js/data/city.js) found in model.land.landmarks, each in its landmark's frame (the same
// yaw rule as town3d: the door faces the nearest road). tick → { near, shown, flip }: near = the station you stand within
// INTERIOR_NEAR m of ({ place, id, name, order | card, p: world [x, y, z] — the prompt's anchor }), shown = drawn this frame,
// flip = shown changed this frame (the host re-syncs the life layer with people(model)). at([x, y]) = the station under a canvas
// point (size = [cw, ch] from tick), or null. people(model) = the model with today's people for a place standing at its stations
// (life.people with spot === the place → its slots, round-robin by id) while shown; the model itself otherwise.
// The cutaway: the gym's own shell (four walls, the roof) stands where the landmark's box is; the landmark (town3d's merged mesh)
// is cut out under the footprint by opts.cut (map3d passes town.cut: its triangles wholly inside the world box collapse) while the
// insides show, restored when they hide. The roof and the walls facing the camera fade (cutAlpha) as you or the camera come within
// CUT.near m of the footprint. The arena is an open bowl: no shell, no cut.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, smooth } from './geo3d.mjs';
import { box, part, accentOf, landmarkYaw } from './kit3d.mjs';

/** show: the street level the insides appear at; near: the fade's reach (m from the footprint); min: the faded walls' opacity. */
export const CUT = { show: 0.6, near: 8, min: 0.08, pick: 28 };
const Ik = () => (typeof INTERIOR !== 'undefined' ? INTERIOR : {}),
  NEAR = () => (typeof INTERIOR_NEAR !== 'undefined' ? INTERIOR_NEAR : 2.5),
  WALL = '#c9c6bd',
  DARK = '#4a4a52',
  T = 0.3; // wall thickness (m)

/** The cutaway opacity at distance d (m) from you / the camera to the footprint (0 = inside): CUT.min inside, 1 from CUT.near. */
export const cutAlpha = d => CUT.min + (1 - CUT.min) * smooth(0, CUT.near, Math.max(0, d));

/** A place's frame: centre (m), yaw, base (the landmark's feet: town3d's 5-sample minimum), floor (the highest ground under it). */
export function frameOf(L, roads, heightAt, I) {
  const x = L.at[0] * MAP_M,
    z = L.at[1] * MAP_M,
    yaw = landmarkYaw(L, roads),
    base = Math.min(heightAt(x - 3, z - 3), heightAt(x + 3, z - 3), heightAt(x - 3, z + 3), heightAt(x + 3, z + 3), heightAt(x, z)),
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  let top = base;
  if (I.kind === 'gym')
    for (const u of [-0.45, 0, 0.45])
      for (const v of [-0.45, 0, 0.45]) top = Math.max(top, heightAt(x + u * I.w * c + v * I.d * s, z - u * I.w * s + v * I.d * c));
  return { id: L.id, I, x, z, yaw, c, s, base, floor: I.kind === 'gym' ? top + 0.04 : base + 0.2 };
}
/** Local (lx, lz) in frame F → world [x, z] (rotation about y by F.yaw, as makeRotationY). */
export const toW = (F, lx, lz) => [F.x + lx * F.c + lz * F.s, F.z - lx * F.s + lz * F.c];
/** World (x, z) → local [lx, lz] in frame F. */
const toL = (F, x, z) => {
  const dx = x - F.x,
    dz = z - F.z;
  return [dx * F.c - dz * F.s, dx * F.s + dz * F.c];
};
/** How far (m) world point (x, z) lies from F's footprint (0 inside). */
export const boxDist = (F, x, z) => {
  const [lx, lz] = toL(F, x, z);
  return Math.hypot(Math.max(Math.abs(lx) - F.I.w / 2, 0), Math.max(Math.abs(lz) - F.I.d / 2, 0));
};
/** F's stations in the world: [{ place, id, name, order, card, p: [x, y, z] }] (p = the prompt's anchor, 1.6 m up). */
const stationsOf = F =>
  F.I.stations.map(s => {
    const [x, z] = toW(F, s.at[0], s.at[1]);
    return { place: F.id, id: s.id, name: s.name, order: s.order || null, card: !!s.card, p: [x, F.floor + 1.6, z] };
  });
/** The station nearest world point you [x, z] within r m (the stations of every frame), or null. */
function nearStation(frames, you, r = NEAR()) {
  let best = null,
    bd = r;
  for (const F of frames)
    for (const s of stationsOf(F)) {
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

// ---- geometry (local frame: floor top at y = 0, door on +z) ----------------------------------------------------------------
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
/** The gym's insides: rubber floor, racks, a bench, mats, a sprint lane, a mirror wall, a front desk (one merged mesh; the ceiling lights go with the roof). */
function gymProps(I, accent) {
  const w = I.w - 2 * T,
    d = I.d - 2 * T,
    S = Object.fromEntries(I.stations.map(s => [s.id, s.at])),
    out = [box(w, 0.04, d, 0, -0.04, 0, '#3b3f46')];
  // the sprint lane along the back wall, right of the racks: red with white edges and a start line
  const lx = 2.6,
    lz = -d / 2 + 0.75;
  out.push(
    box(6.6, 0.02, 1, lx, 0, lz, '#b5523b'),
    box(6.6, 0.025, 0.06, lx, 0, lz - 0.5, '#f2efe6'),
    box(6.6, 0.025, 0.06, lx, 0, lz + 0.5, '#f2efe6'),
    box(0.08, 0.025, 1, lx - 3.1, 0, lz, '#f2efe6'),
    box(0.08, 0.025, 1, lx + 3.1, 0, lz, '#f2efe6')
  );
  // two squat racks against the back wall, a bar racked in each, a plate tree between them
  const [rx, rz] = S.rack || [-4.2, -2.4];
  for (const x of [rx - 0.9, rx + 0.9]) {
    for (const [u, v] of [
      [-0.55, -0.45],
      [0.55, -0.45],
      [-0.55, 0.45],
      [0.55, 0.45]
    ])
      out.push(box(0.08, 2.3, 0.08, x + u, 0, rz - 1.1 + v, '#2b2e35'));
    out.push(box(1.2, 0.08, 1, x, 2.3, rz - 1.1, '#2b2e35'), box(1.3, 0.02, 1.1, x, 0, rz - 1.1, '#5a4636'));
    out.push(...barbell(x, 1.45, rz - 0.75, 1.8));
  }
  out.push(cyl(0.05, 1.2, rx, 0.6, rz - 1.6, '#2b2e35', 'y', 6));
  for (const y of [0.3, 0.6, 0.9]) out.push(cyl(0.2, 0.05, rx, y, rz - 1.45, '#22252b', 'z'));
  // a dumbbell rack along the left wall
  out.push(box(0.6, 0.7, 2.6, -w / 2 + 0.35, 0, 0.4, '#2b2e35'));
  for (let i = 0; i < 6; i++) out.push(cyl(0.07, 0.36, -w / 2 + 0.35, 0.78, -0.6 + i * 0.4, '#5b5f68', 'x', 8));
  // the bench press: a pad along z, uprights and a bar across
  const [bx, bz] = S.bench || [-1.6, -0.6];
  out.push(
    box(0.32, 0.1, 1.3, bx, 0.42, bz, '#1f2229'),
    box(0.1, 0.42, 0.1, bx, 0, bz - 0.5, '#2b2e35'),
    box(0.1, 0.42, 0.1, bx, 0, bz + 0.5, '#2b2e35'),
    box(0.08, 1.1, 0.08, bx - 0.45, 0, bz - 0.55, '#2b2e35'),
    box(0.08, 1.1, 0.08, bx + 0.45, 0, bz - 0.55, '#2b2e35'),
    ...barbell(bx, 1.12, bz - 0.55, 1.9)
  );
  // the mats (mobility), in the region's accent with seams
  const [mx, mz] = S.mats || [2.4, -1];
  out.push(
    box(3.8, 0.08, 2.8, mx, 0, mz, accent),
    box(0.04, 0.085, 2.8, mx, 0, mz, '#20242c'),
    box(3.8, 0.085, 0.04, mx, 0, mz, '#20242c')
  );
  // the mirror wall (right) with two stretch mats in front of it
  out.push(box(0.04, 2.1, 5.6, w / 2 - 0.03, 0.35, 0.6, '#d6e6ee'), box(0.06, 0.08, 5.7, w / 2 - 0.05, 2.45, 0.6, '#2b2e35'));
  const [sx, sz] = S.mirror || [4.6, 2.2];
  out.push(box(0.7, 0.03, 1.8, sx - 0.5, 0, sz, '#5f9a62'), box(0.7, 0.03, 1.8, sx + 0.5, 0, sz - 0.2, '#7b5ea6'));
  // the front desk by the door: counter, top, a screen, the sign behind it
  const [dx, dz] = S.desk || [-4.2, 2.6];
  out.push(
    box(2.4, 1.05, 0.7, dx, 0, dz + 0.4, '#7a5a3e'),
    box(2.5, 0.06, 0.8, dx, 1.05, dz + 0.4, '#d9cdb8'),
    box(0.5, 0.35, 0.05, dx + 0.5, 1.11, dz + 0.3, '#22252b'),
    box(0.05, 0.6, 2.2, -w / 2 + 0.03, 1.6, dz + 0.2, accent)
  );
  return out;
}
/** The gym's shell: [back, front (door gap), left, right, roof] — each its own geometry (each fades on its own). */
function gymShell(I, accent) {
  const { w, d, h } = I,
    band = (bw, bd, x, z) => box(bw, 1, bd, x, 2.6, z, accent),
    door = 2.2,
    side = (w - door) / 2,
    merge = parts => {
      const g = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      return g;
    };
  return [
    merge([box(w, h, T, 0, 0, -d / 2 + T / 2, WALL), band(w + 0.2, T + 0.2, 0, -d / 2 + T / 2)]),
    merge([
      box(side, h, T, -(door + side) / 2, 0, d / 2 - T / 2, WALL),
      box(side, h, T, (door + side) / 2, 0, d / 2 - T / 2, WALL),
      box(door, h - 3, T, 0, 3, d / 2 - T / 2, WALL),
      band(side + 0.1, T + 0.2, -(door + side) / 2 - 0.05, d / 2 - T / 2),
      band(side + 0.1, T + 0.2, (door + side) / 2 + 0.05, d / 2 - T / 2),
      box(door, 0.4, T + 0.2, 0, 3, d / 2 - T / 2, DARK)
    ]),
    merge([box(T, h, d, -w / 2 + T / 2, 0, 0, WALL), band(T + 0.2, d + 0.2, -w / 2 + T / 2, 0)]),
    merge([box(T, h, d, w / 2 - T / 2, 0, 0, WALL), band(T + 0.2, d + 0.2, w / 2 - T / 2, 0)]),
    merge([box(w + 0.4, 0.5, d + 0.4, 0, h, 0, DARK), ...[-3.5, 0, 3.5].map(x => box(0.25, 0.06, d - 1.5, x, h - 0.06, 0, '#fff6dc'))]) // + the ceiling lights
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
    box(0.12, 2.6, 0.12, 0, 0, -W / 2 - 0.6, '#2b2e35'),
    box(0.12, 2.6, 0.12, 0, 0, W / 2 + 0.6, '#2b2e35'),
    box(0.03, 0.85, W + 1.1, 0, 1.55, 0, '#20242c'),
    box(0.05, 0.08, W + 1.1, 0, 2.4, 0, line),
    box(0.8, 1.5, 0.8, 0, 0, -W / 2 - 1.3, '#3a3d44'),
    box(3, 0.45, 0.5, -4, 0, W / 2 + 1.6, '#2c3e66'),
    box(3, 0.45, 0.5, 4, 0, W / 2 + 1.6, '#66302c'),
    box(0.3, 9, 0.3, -3.2, 0, -12.6, '#2b2e35'),
    box(0.3, 9, 0.3, 3.2, 0, -12.6, '#2b2e35'),
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

/** The world box (town.cut's { x0, x1, z0, z1 }) round frame F's footprint + pad m (0.5: the landmark's roof lip and door) — the turned box's bounds. */
const cutBoxOf = (F, pad = 0.5) => {
  const hw = F.I.w / 2 + pad,
    hd = F.I.d / 2 + pad,
    ex = hw * Math.abs(F.c) + hd * Math.abs(F.s),
    ez = hw * Math.abs(F.s) + hd * Math.abs(F.c);
  return { x0: F.x - ex, x1: F.x + ex, z0: F.z - ez, z1: F.z + ez };
};

export function createInteriors(scene, heightAt, opts = {}) {
  const group = new THREE.Group(),
    propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
    v3 = new THREE.Vector3();
  group.visible = false;
  group.userData.interiors = true;
  scene.add(group);
  let key = null,
    frames = [], // [F] with F.root (a Group in the world), F.shell (the gym's 5 wall meshes)
    gym = null, // the frame that cuts the town (the gym)
    cutOn = null, // the box handed to opts.cut (null = none)
    shown = false,
    cam = null,
    size = [1, 1];

  const clear = () => {
    for (const F of frames) {
      F.root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== propMat) (o.material.map && o.material.map.dispose(), o.material.dispose());
      });
      group.remove(F.root);
    }
    frames = [];
    gym = null;
  };
  /** The gym's landmark cut out (opts.cut) while the insides show; restored otherwise. */
  const setCut = on => {
    const b = on && gym ? cutBoxOf(gym) : null;
    if (JSON.stringify(b) === JSON.stringify(cutOn)) return;
    cutOn = b;
    if (opts.cut) opts.cut(b);
  };
  const build = (F, accent) => {
    const root = new THREE.Group();
    root.position.set(F.x, F.floor, F.z);
    root.rotation.y = F.yaw;
    const parts = F.I.kind === 'gym' ? gymProps(F.I, accent) : arenaProps(),
      g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    const props = new THREE.Mesh(g, propMat);
    props.castShadow = props.receiveShadow = true;
    root.add(props);
    if (F.I.kind === 'gym') {
      F.shell = gymShell(F.I, accent).map((sg, i) => {
        const m = new THREE.Mesh(
          sg,
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            flatShading: true,
            transparent: true,
            side: THREE.DoubleSide
          })
        );
        if (i < 4) {
          m.position.y = F.base - F.floor - 0.2; // the walls stand on the landmark's feet (the floor may sit higher on a slope) …
          m.scale.y = (F.I.h + F.floor - F.base + 0.2) / F.I.h; // … up to floor + h, where the roof sits
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

  return {
    /** The places with insides from model.land (landmarks, roads, regions); rebuilt only when they change. */
    sync(model) {
      const land = model && model.land;
      if (!land) return;
      const I = Ik(),
        Ls = (land.landmarks || []).filter(L => I[L.id]),
        k = JSON.stringify([Ls.map(L => [L.id, L.at, L.region]), (land.roads || []).length]);
      if (k === key) return;
      key = k;
      clear();
      const tint = new Map((land.regions || []).map(r => [r.id, r.color]));
      for (const L of Ls) {
        const F = frameOf(L, land.roads, heightAt, I[L.id]);
        build(F, tint.get(L.region) || accentOf(L.region));
        frames.push(F);
        if (F.I.kind === 'gym' && !gym) gym = F;
      }
      setCut(shown);
    },
    /** Per frame: show / hide by street level, fade the gym's near walls and roof, and the station you stand at. */
    tick(dt, o = {}) {
      cam = o.cam || cam;
      if (o.size) size = o.size;
      const now = (o.street || 0) > CUT.show && frames.length > 0,
        flip = now !== shown;
      shown = now;
      group.visible = now;
      if (flip) setCut(now);
      if (!now) return { near: null, shown, flip };
      const you = o.you || null,
        cp = cam ? cam.position : null;
      for (const F of frames) {
        if (!F.shell) continue;
        const d = Math.min(you ? boxDist(F, you[0], you[1]) : Infinity, cp ? boxDist(F, cp.x, cp.z) : Infinity),
          a = cutAlpha(d),
          [cx, cz] = cp ? toL(F, cp.x, cp.z) : [0, 0];
        for (const m of F.shell) {
          const n = m.userData.n,
            near = !n || (cp && (cx - n[0] * F.I.w * 0.5) * n[0] + (cz - n[1] * F.I.d * 0.5) * n[1] > 0),
            op = near ? a : 1;
          m.material.opacity = op;
          m.material.depthWrite = op > 0.98;
          m.castShadow = op > 0.5 && !o.low;
          m.visible = op > 0.01;
        }
      }
      return { near: you ? nearStation(frames, you) : null, shown, flip };
    },
    /** The station under canvas point [x, y] (within CUT.pick px; size from tick), or null. */
    at(xy) {
      if (!shown || !cam || !xy) return null;
      let best = null,
        bd = CUT.pick;
      for (const F of frames)
        for (const s of stationsOf(F)) {
          v3.set(s.p[0], s.p[1] - 1, s.p[2]).project(cam);
          if (v3.z > 1) continue;
          const d = Math.hypot(((v3.x + 1) / 2) * size[0] - xy[0], ((1 - v3.y) / 2) * size[1] - xy[1]);
          if (d < bd) ((bd = d), (best = s));
        }
      return best;
    },
    /** The model with today's people for each place inside at its stations (while shown); else the model itself. */
    people(model) {
      if (!shown || !model || !model.life || !frames.length) return model;
      const moved = new Map();
      for (const F of frames) for (const q of placeAt(F, model.life.people || [])) moved.set(q.id, q.at);
      if (!moved.size) return model;
      return {
        ...model,
        life: { ...model.life, people: model.life.people.map(p => (moved.has(p.id) ? { ...p, at: moved.get(p.id), act: 'train' } : p)) }
      };
    },
    /** QA: what is drawn ({ shown, places, cut: 1 while the gym's landmark is cut, alpha: the gym roof's opacity }). */
    info: () => ({
      shown,
      places: frames.map(F => F.id),
      cut: cutOn ? 1 : 0,
      alpha: gym && gym.shell ? +gym.shell[4].material.opacity.toFixed(2) : null
    }),
    /** The stations in the world (QA, tests). */
    stations: () => frames.flatMap(stationsOf),
    dispose() {
      gym = null;
      setCut(false);
      clear();
      propMat.dispose();
      scene.remove(group);
    }
  };
}
