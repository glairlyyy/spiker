// The living island (display only, no game randoms: variety comes from a string hash): low-poly figures on the 3D map.
// Reads only model.life and model.seized (MapModel, js/career/mapmodel.js): your mates drilling where they train, each
// known club's crew drilling at its HQ (grey silhouettes until scouted) with a walker or two going round the region's
// places, the week's street battle as a two-colour crowd with flags and dust, patrols on the stronger side of the
// contested border, and a flag on every seized place. One InstancedMesh per kind (people, poles, cloth, dust), at most
// CAP.people figures in all; instances are rebuilt only when the data changes, animated in tick.
//   createLife(scene, heightAt) → { sync(model), tick(dt, t), count(), dispose() }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_M, hstr, clamp } from './geo3d.mjs';

/** One figure (≈1.45 m, feet at the origin): a capsule body and a head. */
const figureGeo = () => {
  const body = new THREE.CapsuleGeometry(0.22, 0.7, 3, 8).toNonIndexed().translate(0, 0.57, 0), // (merging needs both non-indexed)
    head = new THREE.IcosahedronGeometry(0.16, 1).translate(0, 1.3, 0),
    g = mergeGeometries([body, head]);
  body.dispose();
  head.dispose();
  return g;
};

const CAP = { people: 300, poles: 40, cloth: 40, dust: 10 },
  GREY = '#8a8f99',
  WALK = 1.2, // m/s
  PER_SIDE = 12, // battle crowd
  PATROL = [2, 4];

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
    meshes = [person, pole, cloth, dust];
  for (const m of meshes) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }
  person.castShadow = true;
  pole.castShadow = true;

  const D = new THREE.Object3D(),
    col = new THREE.Color();
  let key = null,
    figs = [], // { x, z, y, yaw, color, kind: 'drill' | 'walk' | 'fight', ph, path?, len? }
    poles = [], // { x, z, y, color, ph }
    puffs = []; // { x, z, y, ph }

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
  const build = m => {
    const L = m.life;
    figs = [];
    poles = [];
    puffs = [];
    for (const f of L.mates) {
      const w = world(f.at); // already offset around the place by the model
      figs.push({ x: w.x, z: w.z, y: w.y, yaw: hstr(`m${f.id}|y`) * 6.28, color: f.color, kind: 'drill', ph: hstr(`m${f.id}|p`) * 6.28 });
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
          figs.push({ x: 0, z: 0, y: 0, yaw: 0, color: k, kind: 'walk', ph: hstr(id), path, seg, len });
        } else drill(c.at, id, k, 2, 6);
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
    // patrols: on the stronger side of a border that has a line (the contested Wei–Wu one), thicker with pressure
    const line = m.land.contest && m.land.contest.line,
      bd = L.contest; // the contested border's pressure, from the model (no faction names here)
    if (line && line.length > 1 && bd && bd.hold) {
      const hold = bd.hold,
        reg = m.land.regions.find(r => r.id === hold),
        cen = reg ? reg.poly.reduce((s, p) => [s[0] + p[0] / reg.poly.length, s[1] + p[1] / reg.poly.length], [0, 0]) : line[0],
        n = clamp(PATROL[0] + Math.floor(Math.abs(bd.meter) / 2), PATROL[0], PATROL[1]),
        col2 = reg ? reg.color : GREY;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n,
          j = Math.min(line.length - 2, Math.floor(t * (line.length - 1))),
          u = t * (line.length - 1) - j,
          p = [line[j][0] + (line[j + 1][0] - line[j][0]) * u, line[j][1] + (line[j + 1][1] - line[j][1]) * u],
          dx = line[j + 1][0] - line[j][0],
          dy = line[j + 1][1] - line[j][1],
          nl = Math.hypot(dx, dy) || 1;
        let nx = -dy / nl,
          nz = dx / nl;
        if ((cen[0] - p[0]) * nx + (cen[1] - p[1]) * nz < 0) [nx, nz] = [-nx, -nz];
        const w = world(p),
          x = w.x + nx * 4,
          z = w.z + nz * 4;
        figs.push({ x, z, y: heightAt(x, z), yaw: Math.atan2(-nx, -nz), color: col2, kind: 'drill', ph: hstr(`p${i}`) * 6.28 });
      }
    }
    for (const s of m.seized) {
      const w = world(s.at);
      poles.push({ x: w.x, z: w.z, y: w.y, color: s.color, ph: hstr(`s${s.id}`) * 6.28 });
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

  return {
    /** Bring the figures up to date with a model (rebuilt only when life / seized changed). */
    sync(m) {
      if (!m.life) return;
      const k = JSON.stringify([m.life, m.seized]);
      if (k === key) return;
      key = k;
      build(m);
    },
    /** Animate: drill hops, walkers going round their places, the crowd shoving, flags and dust. t = seconds. */
    tick(dt, t) {
      figs.forEach((f, i) => {
        let { x, z, yaw } = f,
          lift = 0,
          lean = 0;
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
        D.scale.set(1, 1, 1);
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
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
    /** Figures currently shown (for QA / budget). */
    count: () => ({ people: person.count, poles: pole.count, dust: dust.count }),
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
