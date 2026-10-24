// Transport on the 3D island map (spec §4.42, T-357): the buses driving their lines and the ferry crossing on their timetables
// (model.transit, read off the map's clock — they run when you are not aboard too), the stops' shelters and the piers' jetties,
// and your own vehicle while you ride (the avatar's ride(): the bus / taxi you sit in with your ring on it, the ferry you stand
// on, the bike / scooter under you).
//   createVehicles(scene, heightAt) → { sync(model), tick(dt, t, wk, you), count(), dispose() }
//     wk = the week time the map shows (map3d's clock: days, fractional); you = avatar.ride() ({ m, x, z, yaw, v } | null).
// A bus leaves each end of its line at every departure (first … last, every h) and takes the line's `hours` to the other end; the
// ferry the same along its sea line. Positions by the travel cost along the line (`c`), so the hours match the rules' (City.busTrip).
// Display only: no rules, no randoms. Draw calls: the buses, the ferries, the stops + piers, your vehicle (+ its ring).
import * as THREE from 'three';
import { MAP_M, clamp, smooth } from './geo3d.mjs';
import { box, part, mergeParts } from './kit3d.mjs';
import { DECK } from './town3d.mjs';

/** Tunables: sizes in metres (the map draws vehicles ~1.5–2× life, the bike / scooter at your figure's scale). */
export const VEHICLES = {
  cap: { bus: 48, ferry: 8 },
  lane: 1.6, // m right of the line
  bus: { w: 2.6, h: 3.1, l: 9 },
  taxi: { w: 2, h: 1.5, l: 4.4 },
  ferry: { w: 8, l: 28, deck: 1.7 },
  stop: { off: 7 }, // a shelter's distance from its road node (m)
  pier: { w: 4.5, y: 1.3, max: 90, step: 2 },
  ring: { r: 7 }, // your ring over the bus / taxi you ride
  bob: 0.12
};

const BUS = '#e0b030',
  GLASS = '#3a4654',
  WHITE = '#efece4',
  DARK = '#2c2f34',
  STEEL = '#8d949c',
  WOOD = '#8a6a4c',
  WOOD2 = '#5e4632',
  SIGN = '#3d7fd0',
  TAXI = '#f2c230',
  RED = '#c0443a';

const wheel = (r, x, y, z, c = DARK, t = 0.3) => part(new THREE.CylinderGeometry(r, r, t, 14).rotateZ(Math.PI / 2).translate(x, y, z), c);

/** The bus (nose on +z, wheels at y = 0): body, window band, roof, wheels. */
export function busGeo() {
  const { w, h, l } = VEHICLES.bus;
  return mergeParts([
    box(w, h - 0.5, l, 0, 0.45, 0, BUS),
    box(w + 0.04, 0.9, l - 0.8, 0, h - 1.55, 0.1, GLASS),
    box(w - 0.3, 0.15, l - 0.6, 0, h - 0.05, 0, WHITE),
    box(w * 0.8, 0.8, 0.05, 0, h - 1.4, l / 2 + 0.01, GLASS),
    ...[-l * 0.32, l * 0.32].flatMap(z => [wheel(0.48, -w / 2 + 0.2, 0.48, z), wheel(0.48, w / 2 - 0.2, 0.48, z)])
  ]);
}
/** The taxi: a small yellow car with its roof sign. */
export function taxiGeo() {
  const { w, l } = VEHICLES.taxi;
  return mergeParts([
    box(w, 0.75, l, 0, 0.35, 0, TAXI),
    box(w * 0.86, 0.6, l * 0.5, 0, 1.1, -0.15, GLASS),
    box(0.8, 0.25, 0.35, 0, 1.7, -0.15, WHITE),
    ...[-l * 0.32, l * 0.32].flatMap(z => [wheel(0.34, -w / 2 + 0.1, 0.34, z, DARK, 0.25), wheel(0.34, w / 2 - 0.1, 0.34, z, DARK, 0.25)])
  ]);
}
/** The coast ferry (deck at VEHICLES.ferry.deck over the sea; the hull below it): hull, deck, the cabin aft, a funnel. */
export function ferryGeo() {
  const { w, l, deck } = VEHICLES.ferry;
  return mergeParts([
    box(w, deck + 0.6, l, 0, -0.6, 0, WHITE),
    part(
      new THREE.ConeGeometry(w / 2, 5, 4, 1)
        .rotateY(Math.PI / 4)
        .scale(1, 1, 0.5)
        .rotateX(Math.PI / 2)
        .translate(0, deck / 2 - 0.1, l / 2 + 1.2),
      WHITE
    ),
    box(w + 0.1, 0.35, l, 0, -0.55, 0, RED),
    box(w - 0.6, 0.12, l - 1, 0, deck, 0, WOOD),
    box(w - 1.6, 3.2, l * 0.32, 0, deck, -l * 0.26, WHITE),
    box(w - 1.5, 0.8, l * 0.3, 0, deck + 2.1, -l * 0.26, GLASS),
    part(new THREE.CylinderGeometry(0.7, 0.8, 2.4, 10).translate(0, deck + 4.3, -l * 0.33), BUS),
    ...[-1, 1].map(sx => box(0.12, 1, l - 2, (sx * (w - 0.5)) / 2, deck, 0, STEEL))
  ]);
}
/** A bike at your figure's scale (k = metres per life metre): two wheels, the frame, the bars, the seat. Nose on +z. */
export function bikeGeo(k = 3.5) {
  return mergeParts([
    wheel(0.34 * k, 0, 0.34 * k, -0.55 * k, DARK, 0.05 * k),
    wheel(0.34 * k, 0, 0.34 * k, 0.55 * k, DARK, 0.05 * k),
    box(0.06 * k, 0.06 * k, 1.0 * k, 0, 0.62 * k, 0, RED),
    box(0.06 * k, 0.5 * k, 0.06 * k, 0, 0.36 * k, -0.15 * k, RED),
    box(0.06 * k, 0.45 * k, 0.06 * k, 0, 0.62 * k, 0.48 * k, STEEL),
    box(0.55 * k, 0.05 * k, 0.06 * k, 0, 1.06 * k, 0.48 * k, DARK),
    box(0.16 * k, 0.06 * k, 0.26 * k, 0, 0.86 * k, -0.18 * k, DARK)
  ]);
}
/** A scooter at your figure's scale: small wheels, a step-through body, the front shield and the bars. */
export function scooterGeo(k = 3.5) {
  return mergeParts([
    wheel(0.24 * k, 0, 0.24 * k, -0.6 * k, DARK, 0.1 * k),
    wheel(0.24 * k, 0, 0.24 * k, 0.6 * k, DARK, 0.1 * k),
    box(0.4 * k, 0.4 * k, 0.75 * k, 0, 0.3 * k, -0.3 * k, WHITE),
    box(0.3 * k, 0.12 * k, 0.6 * k, 0, 0.25 * k, 0.25 * k, DARK),
    box(0.42 * k, 0.75 * k, 0.12 * k, 0, 0.3 * k, 0.55 * k, SIGN),
    box(0.6 * k, 0.05 * k, 0.06 * k, 0, 1.1 * k, 0.58 * k, DARK),
    box(0.32 * k, 0.1 * k, 0.5 * k, 0, 0.72 * k, -0.35 * k, DARK)
  ]);
}
/** A bus shelter (back on −z, open to +z): posts, a roof, a glass back, a bench, and the stop's pole with its sign. */
function shelterParts() {
  return [
    box(4.2, 0.15, 1.8, 0, 2.8, 0, STEEL),
    box(4, 2.1, 0.08, 0, 0.6, -0.8, '#7fa6c4'),
    ...[-2, 2].map(x => box(0.12, 2.8, 0.12, x, 0, -0.8, STEEL)),
    box(3, 0.1, 0.5, 0, 0.55, -0.45, WOOD),
    box(0.12, 3.6, 0.12, 2.8, 0, 0.6, STEEL),
    part(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 14).rotateX(Math.PI / 2).translate(2.8, 3.5, 0.6), SIGN)
  ];
}

/** A polyline in world metres with its travel cost and distance along it: { P: [[x, z, over]], c, s, C, S }. */
function track(pts) {
  const P = pts.map(q => [q[0] * MAP_M, q[1] * MAP_M, q.length > 3 ? q[2] : 0]),
    c = pts.map(q => q[q.length - 1]),
    s = [0];
  for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const deck = [];
  let run = null;
  for (let i = 0; i + 1 < P.length; i++)
    if (P[i][2]) run && run[1] === s[i] ? (run[1] = s[i + 1]) : deck.push((run = [s[i], s[i + 1]]));
    else run = null;
  return { P, c, s, C: c[c.length - 1], S: s[s.length - 1], deck };
}
/** The point at cost x along track T: { x, z, yaw, s } (yaw facing along the way, dir −1 = back). */
function at(T, x, dir = 1) {
  const { P, c, s } = T;
  let i = 1;
  while (i < P.length - 1 && c[i] < x) i++;
  const f = clamp((x - c[i - 1]) / (c[i] - c[i - 1] || 1), 0, 1),
    a = P[i - 1],
    b = P[i],
    dx = (b[0] - a[0]) * dir,
    dz = (b[1] - a[1]) * dir;
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(dx, dz), s: s[i - 1] + (s[i] - s[i - 1]) * f };
}
/** The deck's lift at distance s along track T (the overpass, ramped as town3d draws it). */
const deckUp = (T, s) => {
  const d = T.deck.find(([s0, s1]) => s >= s0 && s <= s1);
  return d ? DECK.up * smooth(0, DECK.ramp, s - d[0]) * smooth(0, DECK.ramp, d[1] - s) : 0;
};
/**
 * Who is out on a timetable at hour hr (of the day; the night before counts as hr + 24): [{ u (0–1 along), dir (1 out, −1 back) }] —
 * a vehicle leaves each end at every departure and takes `hours` to the other end.
 */
export function onTimetable(TT, hr) {
  const out = [];
  for (const h of [hr, hr + 24])
    for (let d = TT.first; d <= TT.last + 1e-9; d += TT.every) {
      const u = (h - d) / TT.hours;
      if (u >= 0 && u <= 1) out.push({ u, dir: 1 }, { u, dir: -1 });
    }
  return out;
}

export function createVehicles(scene, heightAt) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }),
    buses = new THREE.InstancedMesh(busGeo(), mat, VEHICLES.cap.bus),
    ferries = new THREE.InstancedMesh(ferryGeo(), mat, VEHICLES.cap.ferry),
    mine = {
      bus: new THREE.Mesh(busGeo(), mat),
      taxi: new THREE.Mesh(taxiGeo(), mat),
      ferry: new THREE.Mesh(ferryGeo(), mat),
      bike: new THREE.Mesh(bikeGeo(), mat),
      scooter: new THREE.Mesh(scooterGeo(), mat)
    },
    ring = new THREE.Mesh(
      new THREE.TorusGeometry(VEHICLES.ring.r, 0.45, 8, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: 0.9, depthWrite: false })
    ),
    D = new THREE.Object3D();
  for (const m of [buses, ferries]) {
    m.count = 0;
    m.castShadow = true;
    m.frustumCulled = false; // (instances move all over the island)
    scene.add(m);
  }
  for (const m of Object.values(mine)) {
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
  }
  ring.visible = false;
  ring.renderOrder = 6;
  scene.add(ring);
  let key = null,
    lines = [],
    sea = null,
    TT = null,
    FT = null,
    fixed = null,
    shown = { bus: 0, ferry: 0, mine: '' };

  /** The stops' shelters and the piers' jetties (one merged mesh), rebuilt when the transit model changes. */
  const buildFixed = tr => {
    if (fixed) (scene.remove(fixed), fixed.geometry.dispose());
    const parts = [],
      put = (geo, x, z, yaw) => parts.push(geo.rotateY(yaw).translate(x, heightAt(x, z), z));
    const seen = new Set();
    for (const L of tr.bus.lines)
      for (const st of L.stops) {
        if (seen.has(st.id)) continue;
        seen.add(st.id);
        // beside the road: off the line's direction at this stop, on the right of travel out
        const i = L.pts.findIndex(q => q[0] === st.at[0] && q[1] === st.at[1]),
          a = L.pts[Math.max(0, i - 1)],
          b = L.pts[Math.min(L.pts.length - 1, i + 1)],
          dx = (b[0] - a[0]) * MAP_M,
          dz = (b[1] - a[1]) * MAP_M,
          n = Math.hypot(dx, dz) || 1,
          ux = dx / n,
          uz = dz / n,
          x = st.at[0] * MAP_M + uz * VEHICLES.stop.off,
          z = st.at[1] * MAP_M - ux * VEHICLES.stop.off,
          yaw = Math.atan2(-uz, ux); // its open side (+z) toward the road
        for (const g of shelterParts()) put(g, x, z, yaw);
      }
    // a jetty from the shore out to each pier's dock, on piles
    const P = VEHICLES.pier;
    for (const pr of tr.ferry.piers) {
      const [dx0, dz0] = [pr.dock[0] * MAP_M, pr.dock[1] * MAP_M],
        [nx, nz] = [pr.at[0] * MAP_M, pr.at[1] * MAP_M],
        L0 = Math.hypot(nx - dx0, nz - dz0) || 1,
        ux = (nx - dx0) / L0,
        uz = (nz - dz0) / L0;
      let len = 0;
      while (len < Math.min(L0, P.max) && heightAt(dx0 + ux * len, dz0 + uz * len) < 0.2) len += P.step;
      len = Math.max(12, len + 4);
      const cx = dx0 + (ux * len) / 2,
        cz = dz0 + (uz * len) / 2,
        yaw = Math.atan2(ux, uz),
        planks = box(P.w, 0.35, len, 0, P.y, 0, WOOD).rotateY(yaw).translate(cx, 0, cz);
      parts.push(planks);
      for (let s = 0; s <= len; s += 6)
        for (const sx of [-1, 1]) {
          const px = dx0 + ux * s + uz * sx * (P.w / 2 - 0.3),
            pz = dz0 + uz * s - ux * sx * (P.w / 2 - 0.3);
          parts.push(box(0.4, P.y + 3, 0.4, px, -3, pz, WOOD2));
        }
      const sx = dx0 + ux * (len - 2) + uz * (P.w / 2 + 0.8),
        sz = dz0 + uz * (len - 2) - ux * (P.w / 2 + 0.8),
        gy = Math.max(heightAt(sx, sz), P.y);
      parts.push(box(0.15, 3.4, 0.15, sx, gy, sz, STEEL), box(1.6, 1, 0.1, sx, gy + 2.6, sz, SIGN).rotateY(0));
    }
    const geo = mergeParts(parts);
    fixed = new THREE.Mesh(geo, mat);
    fixed.receiveShadow = true;
    fixed.castShadow = true;
    scene.add(fixed);
  };

  return {
    /** Read model.transit (static): the tracks, the timetables, the stops and piers. */
    sync(m) {
      const tr = m && m.transit;
      const k = tr ? JSON.stringify([tr.bus.lines.map(l => [l.id, l.pts.length, l.hours]), tr.ferry.piers, tr.ferry.hours]) : null;
      if (k === key) return;
      key = k;
      if (!tr) return;
      lines = tr.bus.lines.map(l => ({ ...track(l.pts), hours: l.hours }));
      sea = track(tr.ferry.pts);
      TT = tr.bus;
      FT = tr.ferry;
      buildFixed(tr);
    },
    /** Move every bus and ferry to the hour the map shows (wk); your vehicle under / round you (you = avatar.ride()). */
    tick(dt, t, wk, you) {
      if (!TT || wk == null) return;
      const hr = (wk - Math.floor(wk)) * 24;
      let nb = 0;
      for (const T of lines)
        for (const v of onTimetable({ ...TT, hours: T.hours }, hr)) {
          if (nb >= VEHICLES.cap.bus) break;
          const p = at(T, v.dir > 0 ? v.u * T.C : (1 - v.u) * T.C, v.dir),
            x = p.x + Math.cos(p.yaw) * VEHICLES.lane,
            z = p.z - Math.sin(p.yaw) * VEHICLES.lane;
          D.position.set(x, Math.max(heightAt(x, z), 0) + 0.1 + deckUp(T, p.s), z);
          D.rotation.set(0, p.yaw, 0);
          D.updateMatrix();
          buses.setMatrixAt(nb++, D.matrix);
        }
      buses.count = nb;
      buses.instanceMatrix.needsUpdate = true;
      let nf = 0;
      for (const v of onTimetable({ ...FT, hours: FT.hours }, hr)) {
        if (nf >= VEHICLES.cap.ferry) break;
        const p = at(sea, v.dir > 0 ? v.u * sea.C : (1 - v.u) * sea.C, v.dir);
        D.position.set(p.x, Math.sin(t * 1.1 + nf) * VEHICLES.bob, p.z);
        D.rotation.set(0, p.yaw, Math.sin(t * 0.8 + nf) * 0.02);
        D.updateMatrix();
        ferries.setMatrixAt(nf++, D.matrix);
      }
      ferries.count = nf;
      ferries.instanceMatrix.needsUpdate = true;
      shown.bus = nb;
      shown.ferry = nf;
      // yours
      const k = you ? you.m : '';
      for (const [m, o] of Object.entries(mine)) o.visible = m === k;
      ring.visible = k === 'bus' || k === 'taxi';
      shown.mine = k;
      if (!k || !mine[k]) return;
      const o = mine[k],
        y =
          k === 'ferry'
            ? Math.sin(t * 1.1) * VEHICLES.bob
            : Math.max(heightAt(you.x, you.z), 0) + 0.1 + Math.max(0, ...lines.map(T => deckNear(T, you.x, you.z)));
      o.position.set(you.x, y, you.z);
      o.rotation.set(0, you.yaw, 0);
      if (ring.visible) ring.position.set(you.x, y + (k === 'bus' ? VEHICLES.bus.h : VEHICLES.taxi.h) + 2.5 + Math.sin(t * 3) * 0.3, you.z);
    },
    count: () => ({
      buses: shown.bus,
      ferries: shown.ferry,
      mine: shown.mine,
      at: shown.mine ? mine[shown.mine].position.toArray().map(v => +v.toFixed(1)) : null,
      fixed: fixed ? 1 : 0
    }),
    dispose() {
      for (const m of [buses, ferries, ring, ...Object.values(mine), ...(fixed ? [fixed] : [])]) {
        scene.remove(m);
        m.geometry.dispose();
      }
      ring.material.dispose();
      mat.dispose();
    }
  };
}
/** The deck's lift under world point (x, z) on track T: its overpass runs within a few metres of it, else 0. */
function deckNear(T, x, z) {
  if (!T.deck.length) return 0;
  const { P, s } = T;
  for (let i = 1; i < P.length; i++) {
    if (!P[i - 1][2]) continue;
    const [ax, az] = P[i - 1],
      [bx, bz] = P[i],
      dx = bx - ax,
      dz = bz - az,
      L2 = dx * dx + dz * dz || 1,
      u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    if (Math.hypot(x - ax - dx * u, z - az - dz * u) < 6) return deckUp(T, s[i - 1] + u * Math.sqrt(L2));
  }
  return 0;
}
