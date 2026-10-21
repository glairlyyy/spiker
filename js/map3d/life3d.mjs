// The living island (display only, no game randoms: variety comes from a string hash): low-poly figures on the 3D map.
// Reads only model.life (MapModel, js/career/mapmodel.js): the named people (life.people, spec §4.37 1: each where their
// week's plan puts them, walking out at dawn and home in the evening by the map's time of day — hidden indoors at night;
// idling by what they do: drill hops, a jog round the court, sitting), each known club's crew
// drilling at its HQ (grey silhouettes until scouted) with a walker or two going round the region's places, the week's
// street battle as a two-colour crowd with flags and dust, and patrols facing each other across the hot hex frontier
// (life.patrols: positions and colours from the model, no faction names here), and the city's traffic (life.traffic, spec §4.19a): buses and
// vans driving their lines (up onto the overpass deck), boats circling offshore, a plane taking off down the runway. One InstancedMesh per
// kind (people, poles, cloth, dust, bus, van, boat, plane), at most CAP of each; instances are rebuilt only when the data changes, animated in tick.
//   createLife(scene, heightAt) → { sync(model, low), tick(dt, t, tod), pick(cam, x, y, cw, ch) → person id | null, count(), dispose() }
// tod = time of day 0–1 (map3d's clock); low = the Fast graphics setting (fewer named figures: life.look.low).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, hstr, smooth } from './geo3d.mjs';
import { box, part } from './kit3d.mjs';
import { DECK } from './town3d.mjs';

/** One figure (≈1.45 m, feet at the origin): a capsule body and a head. */
const figureGeo = () => {
  const body = new THREE.CapsuleGeometry(0.22, 0.7, 3, 8).toNonIndexed().translate(0, 0.57, 0), // (merging needs both non-indexed)
    head = new THREE.IcosahedronGeometry(0.16, 1).translate(0, 1.3, 0),
    g = mergeGeometries([body, head]);
  body.dispose();
  head.dispose();
  return g;
};

/** Vehicles (m, nose on +z, wheels at y = 0): drawn ~1.5× life size like the town. */
const vehicleGeo = kind => {
  const parts =
    kind === 'bus'
      ? [box(1.7, 1.8, 5, 0, 0.25, 0, '#ffffff'), box(1.75, 0.5, 4.6, 0, 1.15, 0.1, '#3a4654')]
      : kind === 'van'
        ? [
            box(1.4, 1.5, 2.8, 0, 0.25, -0.2, '#ffffff'),
            box(1.4, 1, 0.9, 0, 0.25, 1.55, '#ffffff'),
            box(1.42, 0.45, 0.5, 0, 0.8, 1.7, '#3a4654')
          ]
        : kind === 'boat'
          ? [
              box(1.5, 0.7, 4, 0, -0.3, 0, '#ffffff'),
              box(1, 0.9, 1.3, 0, 0.4, -0.6, '#e8e4d8'),
              box(0.08, 2.2, 0.08, 0, 0.4, 0.6, '#5a5a5a')
            ]
          : [
              part(new THREE.CylinderGeometry(0.8, 0.8, 11, 10).rotateX(Math.PI / 2), '#f2f0ea'),
              part(new THREE.ConeGeometry(0.8, 1.6, 10).rotateX(Math.PI / 2).translate(0, 0, 6.3), '#f2f0ea'),
              box(11, 0.15, 2, 0, -0.2, 0.5, '#d8d4ca'),
              box(4, 0.12, 1, 0, 0.2, -5.2, '#d8d4ca'),
              box(0.15, 2, 1.4, 0, 0.2, -5.3, '#c0504a')
            ];
  const g = mergeGeometries(parts);
  for (const o of parts) o.dispose();
  return g;
};
const VEH = {
  bus: { cap: 6, colors: ['#e0b030', '#d9773a'] },
  van: { cap: 8, colors: ['#e8e6e0', '#c9cdd2', '#9fb3c4'] },
  boat: { cap: 8, colors: ['#3f6f8f', '#b5533c', '#e8e6e0', '#d0b04a'] },
  plane: { cap: 1, colors: ['#ffffff'] }
};
const CAP = { people: 300, poles: 2, cloth: 2, dust: 10 },
  GREY = '#8a8f99',
  WALK = 1.2, // m/s
  PER_SIDE = 12; // battle crowd

export function createLife(scene, heightAt) {
  const person = new THREE.InstancedMesh(figureGeo(), new THREE.MeshStandardMaterial({ roughness: 0.85 }), CAP.people),
    pole = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.04, 0.04, 3, 5),
      new THREE.MeshStandardMaterial({ color: 0xdedede }),
      CAP.poles
    ),
    cloth = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.1, 0.7),
      new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }),
      CAP.cloth
    ),
    dust = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.6, 0),
      new THREE.MeshBasicMaterial({ color: 0xd8c9a8, transparent: true, opacity: 0.45, depthWrite: false }),
      CAP.dust
    ),
    cars = Object.fromEntries(
      Object.entries(VEH).map(([k, v]) => [
        k,
        new THREE.InstancedMesh(vehicleGeo(k), new THREE.MeshStandardMaterial({ roughness: 0.6 }), v.cap)
      ])
    ),
    meshes = [person, pole, cloth, dust, ...Object.values(cars)];
  for (const m of meshes) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }
  person.castShadow = true;
  pole.castShadow = true;
  for (const m of Object.values(cars)) m.castShadow = true;

  const D = new THREE.Object3D(),
    col = new THREE.Color(),
    col2 = new THREE.Color(),
    V = new THREE.Vector3();
  let key = null,
    figs = [], // { x, z, y, yaw, color, kind: 'drill' | 'walk' | 'fight' | 'named', ph, path?, len?, crew? }
    named = [], // the named figures (also in figs): { id, a, h, act, s, dOut, dHome, wx, wy, wz, vis }
    TM = null, // the clock windows (model.time: out, home, step)
    poles = [], // { x, z, y, color, ph }
    puffs = [], // { x, z, y, ph }
    rides = [], // vehicles on a line: { kind, i, path, seg, len, deck: [[s0, s1]], ph, speed }
    boats = [], // { i, x, z, r, ph, w }
    plane = null; // { a, b, c (world points), every }

  const world = ([mx, my]) => {
      const x = mx * MAP_M,
        z = my * MAP_M;
      return { x, z, y: heightAt(x, z) };
    },
    ring = (at, id, r0, r1) => {
      const c = world(at),
        a = hstr(`${id}|a`) * Math.PI * 2,
        r = r0 + hstr(`${id}|r`) * (r1 - r0);
      return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
    },
    drill = (at, id, color, r0 = 1.5, r1 = 4) => {
      const p = ring(at, id, r0, r1);
      figs.push({ ...p, y: heightAt(p.x, p.z), yaw: hstr(`${id}|y`) * 6.28, color, kind: 'drill', ph: hstr(`${id}|p`) * 6.28 });
    };

  /** Rebuild the instance lists from a model. */
  const build = (m, low) => {
    const L = m.life,
      look = L.look || { size: {}, low: 40 };
    figs = [];
    named = [];
    poles = [];
    puffs = [];
    TM = m.time || null;
    // the named people: muted unless your circle or your teammates; grey for a club you haven't scouted
    for (const p of (L.people || []).slice(0, low ? look.low : CAP.people)) {
      const a = world(p.at),
        h = world(p.home),
        f = {
          id: p.id,
          kind: 'named',
          a,
          h,
          x: a.x,
          z: a.z,
          y: a.y,
          yaw: hstr(`n${p.id}|y`) * 6.28,
          act: p.act,
          s: look.size[p.g] || 1.4,
          color: p.g === 'grey' ? GREY : p.g === 'other' ? `#${col.set(p.color).lerp(col2.set(GREY), 0.5).getHexString()}` : p.color,
          ph: hstr(`n${p.id}|p`) * 6.28,
          dOut: hstr(`n${p.id}|o`),
          dHome: hstr(`n${p.id}|h`),
          wx: 0,
          wy: 0,
          wz: 0,
          vis: false
        };
      figs.push(f);
      named.push(f);
    }
    for (const c of L.crews) {
      const k = c.known ? c.color : GREY,
        path = c.known && c.walk.length ? [c.at, ...c.walk, c.at].map(world) : null,
        walkers = path ? Math.min(2, Math.ceil(c.n / 3)) : 0;
      for (let i = 0; i < c.n; i++) {
        const id = `c${c.team}|${i}`;
        if (i < walkers) {
          let len = 0;
          const seg = path.slice(1).map((p, j) => (len += Math.hypot(p.x - path[j].x, p.z - path[j].z)));
          figs.push({ x: 0, z: 0, y: 0, yaw: 0, color: k, kind: 'walk', ph: hstr(id), path, seg, len, crew: hstr(`${id}|n`) });
        } else (drill(c.at, id, k, 2, 6), (figs[figs.length - 1].crew = hstr(`${id}|n`)));
      }
    }
    if (L.battle) {
      const b = L.battle,
        c = world(b.at);
      b.colors.forEach((color, s) => {
        for (let i = 0; i < PER_SIDE; i++) {
          const id = `b${s}|${i}`,
            dx = (s ? 1 : -1) * (1.2 + hstr(`${id}|x`) * 2.6),
            dz = (hstr(`${id}|z`) - 0.5) * 9;
          figs.push({
            x: c.x + dx,
            z: c.z + dz,
            y: heightAt(c.x + dx, c.z + dz),
            yaw: s ? -Math.PI / 2 : Math.PI / 2,
            color,
            kind: 'fight',
            ph: hstr(`${id}|p`) * 6.28
          });
        }
        const fx = c.x + (s ? 1 : -1) * 6.5;
        poles.push({ x: fx, z: c.z, y: heightAt(fx, c.z), color, ph: s });
      });
      for (let i = 0; i < CAP.dust; i++)
        puffs.push({ x: c.x + (hstr(`d${i}|x`) - 0.5) * 6, z: c.z + (hstr(`d${i}|z`) - 0.5) * 6, ph: i / CAP.dust });
    }
    // patrols on the hot hex frontier, facing the other side's tile
    for (const p of L.patrols) {
      const w = world(p.at),
        f = world(p.face);
      figs.push({ ...w, yaw: Math.atan2(f.x - w.x, f.z - w.z), color: p.color, kind: 'drill', ph: hstr(`p${p.id}`) * 6.28 });
    }
    // traffic: each line a closed world path; its overpass runs (deck) as [s0, s1] distances along it
    rides = [];
    boats = [];
    plane = null;
    const T = L.traffic,
      n = { bus: 0, van: 0, boat: 0, plane: 0 };
    if (T) {
      for (const l of T.lines) {
        const path = l.pts.map(p => world(p)),
          seg = [],
          deck = [];
        let len = 0,
          run = null;
        path.slice(1).forEach((p, j) => {
          const s0 = len;
          len += Math.hypot(p.x - path[j].x, p.z - path[j].z);
          seg.push(len);
          if (l.pts[j][2]) run ? (run[1] = len) : deck.push((run = [s0, len]));
          else run = null;
        });
        for (let i = 0; i < l.n && n[l.kind] < VEH[l.kind].cap; i++)
          rides.push({
            kind: l.kind,
            i: n[l.kind]++,
            path,
            seg,
            len,
            deck,
            ph: (i + hstr(`${l.id}|${i}`) * 0.3) / l.n,
            speed: l.speed,
            color: VEH[l.kind].colors[i % VEH[l.kind].colors.length]
          });
      }
      for (const b of T.boats) {
        const c = world(b.at);
        for (let i = 0; i < b.n && n.boat < VEH.boat.cap; i++)
          boats.push({
            i: n.boat++,
            x: c.x,
            z: c.z,
            r: b.r * MAP_M,
            ph: i / b.n + hstr(`${b.id}|${i}`) * 0.2,
            w: 0.04 + hstr(`${b.id}|w`) * 0.03
          });
      }
      if (T.plane) {
        const [a, b, c] = [T.plane.from, T.plane.lift, T.plane.to].map(world);
        plane = { a, b, c, every: T.plane.every };
        n.plane = 1;
      }
    }
    for (const r of rides) cars[r.kind].setColorAt(r.i, col.set(r.color));
    boats.forEach(b => cars.boat.setColorAt(b.i, col.set(VEH.boat.colors[b.i % VEH.boat.colors.length])));
    if (plane) cars.plane.setColorAt(0, col.set('#ffffff'));
    for (const [k, m] of Object.entries(cars)) {
      m.count = n[k];
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    figs = figs.slice(0, CAP.people);
    poles = poles.slice(0, CAP.poles);
    figs.forEach((f, i) => person.setColorAt(i, col.set(f.color)));
    poles.forEach((p, i) => cloth.setColorAt(i, col.set(p.color)));
    person.count = figs.length;
    pole.count = poles.length;
    cloth.count = poles.length;
    dust.count = puffs.length;
    if (person.instanceColor) person.instanceColor.needsUpdate = true;
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
  };

  /** Point at distance s along a closed path (world points + cumulative segment lengths), written into AT (reused). */
  const AT = { x: 0, z: 0, yaw: 0 };
  const along = (f, s) => {
    let d = s % f.len,
      i = 0;
    while (i < f.seg.length - 1 && d > f.seg[i]) i++;
    const a = f.path[i],
      b = f.path[i + 1],
      from = i ? f.seg[i - 1] : 0,
      u = (d - from) / Math.max(0.001, f.seg[i] - from);
    AT.x = a.x + (b.x - a.x) * u;
    AT.z = a.z + (b.z - a.z) * u;
    AT.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    return AT;
  };

  /**
   * Where a named figure is at time of day `tod`: at home at night (hidden indoors), walking out in the morning (each at its
   * own hashed moment inside T.out), at its place through the day, walking home in the evening (T.home). Writes into AT.
   */
  const NAMED = { x: 0, z: 0, yaw: 0, mode: 'idle' };
  const whereNamed = (f, tod) => {
    const o = TM ? TM.out : [0.2, 0.3],
      hm = TM ? TM.home : [0.76, 0.88],
      st = TM ? TM.step : 0.05,
      o0 = o[0] + f.dOut * Math.max(0, o[1] - o[0] - st),
      h0 = hm[0] + f.dHome * Math.max(0, hm[1] - hm[0] - st),
      { a, h } = f;
    let u = -1,
      from = a,
      to = a;
    if (tod < o0 || tod >= h0 + st) return ((NAMED.mode = 'home'), NAMED);
    if (tod < o0 + st) ((u = (tod - o0) / st), (from = h), (to = a));
    else if (tod >= h0) ((u = (tod - h0) / st), (from = a), (to = h));
    if (u < 0 || (Math.abs(a.x - h.x) < 0.5 && Math.abs(a.z - h.z) < 0.5)) {
      NAMED.x = a.x;
      NAMED.z = a.z;
      NAMED.yaw = f.yaw;
      NAMED.mode = 'idle';
      return NAMED;
    }
    const k = smooth(0, 1, u);
    NAMED.x = from.x + (to.x - from.x) * k;
    NAMED.z = from.z + (to.z - from.z) * k;
    NAMED.yaw = Math.atan2(to.x - from.x, to.z - from.z);
    NAMED.mode = 'walk';
    return NAMED;
  };
  const DAY = tod => !TM || (tod >= TM.out[0] && tod < TM.home[1]);

  return {
    /** Bring the figures up to date with a model (rebuilt only when life, the clock windows or the setting changed). */
    sync(m, low = false) {
      if (!m.life) return;
      const k = JSON.stringify([m.life, m.time && [m.time.out, m.time.home, m.time.step], !!low]);
      if (k === key) return;
      key = k;
      build(m, low);
    },
    /**
     * Animate: the named people by the time of day, drill hops, walkers going round their places, the crowd shoving, flags and
     * dust. t = seconds; tod = time of day 0–1 (crews go in at night too).
     */
    tick(dt, t, tod = 0.5) {
      const day = DAY(tod);
      figs.forEach((f, i) => {
        let { x, z, yaw } = f,
          lift = 0,
          lean = 0,
          sc = 1,
          sy = 1;
        if (f.kind === 'named') {
          const w = whereNamed(f, tod);
          sc = f.s;
          if (w.mode === 'home') sc = 0;
          else if (w.mode === 'walk') {
            x = w.x;
            z = w.z;
            yaw = w.yaw;
            lift = Math.abs(Math.sin(t * 6 + f.ph * 9)) * 0.06 * sc;
            lean = 0.12;
          } else if (f.act === 'hustle') {
            // a jog round the court
            const a = t * 0.9 + f.ph;
            x += Math.cos(a) * 2.2;
            z += Math.sin(a) * 2.2;
            yaw = a + Math.PI;
            lift = Math.abs(Math.sin(t * 7 + f.ph)) * 0.08 * sc;
            lean = 0.15;
          } else if (f.act === 'train' || f.act === 'hard') lift = Math.max(0, Math.sin(t * (f.act === 'hard' ? 7 : 5) + f.ph)) * 0.22 * sc;
          else sy = 0.72; // studying, resting, injured: sitting
          f.vis = sc > 0;
          if (f.vis) {
            f.wx = x;
            f.wz = z;
            f.wy = heightAt(x, z) + 1.3 * sc;
          }
          D.position.set(x, (w.mode === 'idle' && f.act !== 'hustle' ? f.y : heightAt(x, z)) + lift, z);
          D.rotation.set(lean, yaw, 0);
          D.scale.set(sc, sc * sy, sc);
          D.updateMatrix();
          person.setMatrixAt(i, D.matrix);
          return;
        }
        if (f.crew !== undefined && !(day || f.crew < 0.15)) sc = 0; // a crew goes in at night (a few stay out late)
        if (f.kind === 'drill') lift = Math.max(0, Math.sin(t * 5 + f.ph)) * 0.25;
        else if (f.kind === 'fight') {
          const s = Math.sin(t * 3 + f.ph);
          lift = Math.max(0, s) * 0.18;
          x += Math.sin(yaw) * s * 0.25;
        } else {
          const p = along(f, (f.ph * f.len + t * WALK) % f.len);
          x = p.x;
          z = p.z;
          yaw = p.yaw;
          lift = Math.abs(Math.sin(t * 6 + f.ph * 9)) * 0.06;
          lean = 0.12;
        }
        const y = f.kind === 'walk' ? heightAt(x, z) : f.y;
        D.position.set(x, y + lift, z);
        D.rotation.set(lean, yaw, 0);
        D.scale.set(sc, sc, sc);
        D.updateMatrix();
        person.setMatrixAt(i, D.matrix);
      });
      poles.forEach((p, i) => {
        D.position.set(p.x, p.y + 1.5, p.z);
        D.rotation.set(0, 0, 0);
        D.updateMatrix();
        pole.setMatrixAt(i, D.matrix);
        D.position.set(p.x + 0.55, p.y + 2.65, p.z);
        D.rotation.set(0, Math.sin(t * 3 + p.ph) * 0.35, 0);
        D.updateMatrix();
        cloth.setMatrixAt(i, D.matrix);
      });
      puffs.forEach((p, i) => {
        const k = (t * 0.45 + p.ph) % 1,
          s = Math.sin(Math.PI * k);
        D.position.set(p.x, heightAt(p.x, p.z) + 0.4 + k * 2.2, p.z);
        D.rotation.set(0, 0, 0);
        D.scale.setScalar(0.3 + s * 1.3);
        D.updateMatrix();
        dust.setMatrixAt(i, D.matrix);
      });
      // traffic: drive on the right (1 m off the line), up the overpass deck where the line takes it
      for (const r of rides) {
        const s = (r.ph * r.len + t * r.speed) % r.len,
          p = along(r, s),
          d = r.deck.find(([s0, s1]) => s >= s0 && s <= s1),
          up = d ? 0.25 + DECK.up * smooth(0, DECK.ramp, s - d[0]) * smooth(0, DECK.ramp, d[1] - s) : 0,
          x = p.x + Math.cos(p.yaw) * 1,
          z = p.z - Math.sin(p.yaw) * 1;
        D.position.set(x, Math.max(heightAt(x, z), 0) + 0.15 + up, z);
        D.rotation.set(0, p.yaw, 0);
        D.scale.set(1, 1, 1);
        D.updateMatrix();
        cars[r.kind].setMatrixAt(r.i, D.matrix);
      }
      for (const b of boats) {
        const a = (b.ph + t * b.w) * Math.PI * 2;
        D.position.set(b.x + Math.cos(a) * b.r, 0.1 + Math.sin(t * 1.3 + b.i) * 0.08, b.z + Math.sin(a) * b.r);
        D.rotation.set(0, -a, Math.sin(t * 0.9 + b.i) * 0.05); // nose along the circle
        D.scale.set(1, 1, 1);
        D.updateMatrix();
        cars.boat.setMatrixAt(b.i, D.matrix);
      }
      if (plane) {
        // a cycle of `every` s: parked out of sight (scale 0) → rolls (accelerating) → lifts off → climbs out and shrinks away
        const k = (t % plane.every) / plane.every,
          roll = smooth(0, 0.25, k),
          climb = smooth(0.25, 0.5, k),
          { a, b, c } = plane,
          x = k < 0.25 ? a.x + (b.x - a.x) * roll * roll : b.x + (c.x - b.x) * climb,
          z = k < 0.25 ? a.z + (b.z - a.z) * roll * roll : b.z + (c.z - b.z) * climb,
          h = k < 0.25 ? a.y : b.y + 60 * climb * climb,
          on = k < 0.5 ? 1 : 0;
        D.position.set(x, h + 1.2, z);
        D.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
        D.scale.setScalar(on * (1 - 0.6 * climb));
        D.updateMatrix();
        cars.plane.setMatrixAt(0, D.matrix);
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
    /**
     * The named figure under screen point (x, y) (canvas px; cw × ch the canvas size), within life.look.pick px of its head or
     * its middle, nearest first; null if none (or hidden at home).
     */
    pick(cam, x, y, cw, ch, px = 16) {
      let best = null,
        bd = px * px;
      for (const f of named) {
        if (!f.vis) continue;
        for (const dy of [0, -0.6 * f.s]) {
          V.set(f.wx, f.wy + dy, f.wz).project(cam);
          if (V.z > 1) continue;
          const sx = ((V.x + 1) / 2) * cw - x,
            sy = ((1 - V.y) / 2) * ch - y,
            d = sx * sx + sy * sy;
          if (d < bd) ((bd = d), (best = f.id));
        }
      }
      return best;
    },
    /** Is a named figure on its way somewhere at time of day tod: 'out' (to its place), 'home', or null (there). */
    going(id, tod) {
      const f = named.find(q => q.id === id);
      if (!f) return null;
      const w = whereNamed(f, tod);
      return w.mode !== 'walk' ? null : tod < 0.5 ? 'out' : 'home';
    },
    /** Where a named figure stands now (world metres) or null — for QA and the tip. */
    at(id) {
      const f = named.find(q => q.id === id);
      return f && f.vis ? [f.wx, f.wy, f.wz] : null;
    },
    /** Figures currently shown (for QA / budget). */
    count: () => ({
      named: named.filter(f => f.vis).length,
      people: person.count,
      poles: pole.count,
      dust: dust.count,
      vehicles: cars.bus.count + cars.van.count + cars.boat.count + cars.plane.count
    }),
    dispose() {
      for (const m of meshes) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        m.dispose();
      }
    }
  };
}
