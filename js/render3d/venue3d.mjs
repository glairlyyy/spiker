// Match venues (spec §9.11): per-venue floor, set, light and crowd around the same court; officials and props; the
// big screen; venue moments (zone light, win confetti). Built once (every set in its own hidden group), dressed per
// match (dressVenue), animated per frame (updateVenue). Presentation only: Math.random, never the engine's R().
import * as THREE from 'three';
import { KX, canvasTex, lowEnd } from './units3d.mjs';
import { BEAMS } from './venues/kit.mjs';
import { LOOK } from './venues/looks.mjs';
import { drawFloor } from './venues/floor.mjs';
import { setArena } from './venues/arena.mjs';
import { setHall } from './venues/hall.mjs';
import { setBeach } from './venues/beach.mjs';
import { setHighland } from './venues/highland.mjs';
import { setStreet } from './venues/street.mjs';
import { setOfficials } from './venues/props.mjs';

export const VENUE_KINDS = Object.keys(LOOK);
/** One builder per venue (js/render3d/venues/*): a new venue = a LOOK entry, a floor case and one line here. */
const VENUE_SETS = { arena: setArena, hall: setHall, beach: setBeach, highland: setHighland, street: setStreet };

/** Crowd rows per venue: { y (feet), z, x (half width) }. */
const ROWS = {
  arena: [0, 1, 2, 3, 4, 5].map(r => ({ y: 0.55 + r * 0.55, z: -9.4 - r * 1.3, x: 22 })),
  hall: [0, 1, 2, 3].map(r => ({ y: 0.45 + r * 0.45, z: -9.2 - r * 1.0, x: 17 })),
  beach: [0, 1, 2, 3].map(r => ({ y: 0.5 + r * 0.5, z: -9.8 - r * 1.1, x: 13 })),
  highland: [0, 1].map(r => ({ y: 0, z: -8.9 - r * 1.0, x: 14 })),
  street: [0, 1].map(r => ({ y: 0, z: -9.8 - r * 1.0, x: 15 }))
};
const POSES = 4,
  CAP = lowEnd ? 60 : 110; // fans per pose mesh

// ---------- textures ----------
/** A flat cut-out fan in grey shades (instance colour tints it): pose 0 arms down, 1 one arm up, 2 both up, 3 clapping. */
function fanTex(pose) {
  return canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d9d9d9';
    g.beginPath();
    g.arc(w / 2, 22, 12, 0, 7); // head
    g.fill();
    g.fillStyle = '#9a9a9a';
    g.fillRect(w / 2 - 15, 36, 30, 52); // torso
    g.fillStyle = '#ffffff';
    g.fillRect(w / 2 - 15, 38, 30, 7); // scarf (tints brightest)
    g.fillStyle = '#7a7a7a';
    g.fillRect(w / 2 - 13, 88, 11, 38); // legs
    g.fillRect(w / 2 + 2, 88, 11, 38);
    g.strokeStyle = '#9a9a9a';
    g.lineWidth = 8;
    g.lineCap = 'round';
    const arm = (x0, x1, y1) => {
      g.beginPath();
      g.moveTo(w / 2 + x0, 42);
      g.lineTo(w / 2 + x1, y1);
      g.stroke();
    };
    if (pose === 0) (arm(-15, -19, 78), arm(15, 19, 78));
    if (pose === 1) (arm(-15, -19, 78), arm(15, 22, 4));
    if (pose === 2) (arm(-15, -22, 4), arm(15, 22, 4));
    if (pose === 3) (arm(-15, -2, 30), arm(15, 2, 30));
  });
}

// ---------- small builders ----------

// ---------- build / dress / update ----------
/** Build every venue set (hidden), the cut-out crowd, the big screen and the confetti into `scene`; stores handles on `w`. */
export function buildVenues(scene, w) {
  const sc = document.createElement('canvas');
  sc.width = 1024;
  sc.height = 512;
  w.screenCanvas = sc;
  w.screenTex = new THREE.CanvasTexture(sc);
  w.screenTex.colorSpace = THREE.SRGBColorSpace;
  w.screenKey = '';
  const fc = document.createElement('canvas');
  fc.width = 2048;
  fc.height = 1024;
  w.floorCanvas = fc;
  w.floorTexV = new THREE.CanvasTexture(fc);
  w.floorTexV.colorSpace = THREE.SRGBColorSpace;
  w.floorTexV.anisotropy = 8;
  w.sets = Object.fromEntries(Object.entries(VENUE_SETS).map(([k, build]) => [k, build(w)]));
  for (const g of Object.values(w.sets)) {
    g.visible = false;
    scene.add(g);
  }
  w.officials = setOfficials();
  scene.add(w.officials);
  // crowd: one instanced cut-out mesh per pose, tinted per instance
  w.crowd = [];
  for (let p = 0; p < POSES; p++) {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.8, 1.6),
      new THREE.MeshBasicMaterial({ map: fanTex(p), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      CAP
    );
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    w.crowd.push({ mesh, fans: [] });
  }
  // rim light for the zone (team colour)
  w.zoneRim = new THREE.DirectionalLight('#ffffff', 0);
  w.zoneRim.position.set(0, 6, 14);
  scene.add(w.zoneRim);
  // confetti
  const n = lowEnd ? 260 : 600,
    geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  w.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, depthWrite: false }));
  w.confetti.visible = false;
  w.confetti.frustumCulled = false;
  w.confettiV = Array.from({ length: n }, () => ({ vy: 0, vx: 0, ph: 0 }));
  scene.add(w.confetti);
  w.venue = null;
}

/** Dress the world for a match: venue kind (VENUE_KINDS), crowd stakes 0–1, the two team colours. */
export function dressVenue(w, kind, stakes, t0c, t1c) {
  const L = LOOK[kind] ? LOOK[kind] : LOOK.arena;
  kind = LOOK[kind] ? kind : 'arena';
  w.venue = kind;
  w.look = L;
  for (const [k, g] of Object.entries(w.sets)) g.visible = k === kind;
  w.stands.visible = kind === 'arena';
  w.board.visible = kind === 'arena' || kind === 'hall';
  w.officials.userData.judges.visible = w.officials.userData.table.visible = kind !== 'street';
  // sky, fog, light
  w.scene.background.set(L.bg);
  w.scene.fog.color.set(L.bg);
  [w.scene.fog.near, w.scene.fog.far] = L.fog;
  w.hemi.color.set(L.hemi[0]);
  w.hemi.groundColor.set(L.hemi[1]);
  w.base = { hemi: L.hemi[2], sun: L.sun, rim: L.rim };
  w.hemi.intensity = L.hemi[2];
  w.sun.intensity = L.sun;
  w.rim.intensity = L.rim;
  const spot = w.sets.arena.userData.spot;
  spot.intensity = kind === 'arena' ? 140 : 0;
  // floor
  drawFloor(w.floorCanvas.getContext('2d'), w.floorCanvas.width, w.floorCanvas.height, kind);
  w.floorTexV.needsUpdate = true;
  w.floor.material.map = w.floorTexV;
  w.floor.material.roughness = L.rough;
  w.floor.material.needsUpdate = true;
  w.outer.material.color.set(L.outer);
  // crowd: fill the rows, shuffle, keep capacity × stakes
  const rows = ROWS[kind],
    slots = [];
  for (const r of rows)
    for (let x = -r.x; x <= r.x; x += 0.75)
      slots.push({ x: x + (Math.random() - 0.5) * 0.3, y: r.y, z: r.z + (Math.random() - 0.5) * 0.2 });
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const want = Math.round(Math.min(slots.length, CAP * POSES) * Math.max(0.1, Math.min(1, stakes))),
    pal = [t0c, t1c, t0c, t1c, ...L.neutrals],
    col = new THREE.Color();
  w.crowd.forEach(c => (c.fans = []));
  for (let i = 0; i < want; i++) {
    const s = slots[i],
      c = pal[Math.floor(Math.random() * pal.length)],
      side = c === t0c ? 0 : c === t1c ? 1 : -1,
      cr = w.crowd[i % POSES],
      sc = 0.9 + Math.random() * 0.2;
    cr.fans.push({ ...s, sc, side, ph: Math.random() * 6.3, sx: 500 + s.x / KX });
    cr.mesh.setColorAt(cr.fans.length - 1, col.set(c).multiplyScalar(L.lum));
  }
  for (const c of w.crowd) {
    c.mesh.count = c.fans.length;
    if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
  }
  w.screenKey = '';
  w.confetti.visible = false;
}

const mtx = new THREE.Matrix4(),
  scl = new THREE.Vector3(),
  pos = new THREE.Vector3(),
  quat = new THREE.Quaternion(),
  tint = new THREE.Color();
/** Per frame: crowd bounce and wave, the venue's zone light, confetti on the win, flags, the big screen. */
export function updateVenue(w, now, dt, camera) {
  if (camera) fadeBeams(camera);
  // crowd
  for (const c of w.crowd) {
    for (let i = 0; i < c.fans.length; i++) {
      const f = c.fans[i],
        lvl = Math.max(f.side >= 0 ? A.cheer[f.side] : 0, A.cheerAll * 0.8, A.cele && f.side === A.cele.w ? 1 : 0);
      let off = lvl > 0 ? Math.abs(Math.sin(now * 0.013 + f.ph)) * 0.35 * Math.min(1, lvl * 1.5) : 0;
      if (A.wave) off += Math.exp(-Math.pow((f.sx - A.wave.x) / 55, 2)) * 0.5;
      pos.set(f.x, f.y + 0.8 * f.sc + off, f.z);
      scl.set(f.sc, f.sc, 1);
      mtx.compose(pos, quat, scl);
      c.mesh.setMatrixAt(i, mtx);
    }
    c.mesh.instanceMatrix.needsUpdate = true;
  }
  // zone: the house light dims, a rim light in the zone team's colour comes up
  const zs = A.zoneShown || [false, false],
    zi = zs[0] ? 0 : zs[1] ? 1 : -1,
    k = Math.min(1, dt / 400),
    dim = zi >= 0 ? 0.65 : 1;
  if (w.base) {
    w.hemi.intensity += (w.base.hemi * dim - w.hemi.intensity) * k;
    w.sun.intensity += (w.base.sun * dim - w.sun.intensity) * k;
    if (zi >= 0) w.zoneRim.color.copy(tint.set(A.m.t[zi].color));
    w.zoneRim.intensity += ((zi >= 0 ? 0.9 : 0) - w.zoneRim.intensity) * k;
  }
  // confetti on the win
  const P = w.confetti,
    arr = P.geometry.attributes.position.array;
  if (A.cele && !P.visible) {
    const cols = P.geometry.attributes.color.array,
      pal = [A.m.t[A.cele.w].color, '#ffd84d', '#ffffff'];
    for (let i = 0; i < w.confettiV.length; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 24;
      arr[i * 3 + 1] = 8 + Math.random() * 10;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 12;
      w.confettiV[i] = { vy: 1.2 + Math.random() * 1.4, vx: (Math.random() - 0.5) * 0.6, ph: Math.random() * 6.3 };
      tint.set(pal[i % 3]);
      cols[i * 3] = tint.r;
      cols[i * 3 + 1] = tint.g;
      cols[i * 3 + 2] = tint.b;
    }
    P.geometry.attributes.color.needsUpdate = true;
    P.visible = true;
  } else if (!A.cele) P.visible = false;
  if (P.visible) {
    const s = dt / 1000;
    for (let i = 0; i < w.confettiV.length; i++) {
      const v = w.confettiV[i];
      arr[i * 3] += (v.vx + Math.sin(now * 0.003 + v.ph) * 0.5) * s;
      arr[i * 3 + 1] -= v.vy * s;
      if (arr[i * 3 + 1] < 0.02) arr[i * 3 + 1] = 0.02;
    }
    P.geometry.attributes.position.needsUpdate = true;
  }
  // highland flags wave
  if (w.venue === 'highland')
    for (const f of w.sets.highland.userData.flags) {
      const a = f.fl.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3)
        a[i + 2] = f.rest[i + 2] + Math.sin(now * 0.004 + f.rest[i] * 3 + f.ph) * 0.12 * (f.rest[i] + 0.8);
      f.fl.geometry.attributes.position.needsUpdate = true;
    }
  // big screen / wall board: in step with the scoreboard the player sees
  if (w.venue === 'arena' || w.venue === 'hall') drawScreen(w);
}
const segA = new THREE.Vector3(),
  segB = new THREE.Vector3(),
  near = new THREE.Vector3(),
  seg = new THREE.Line3();
/**
 * Every light shaft / cone fades out as the camera gets near it (fully gone within 6 m of its axis, full beyond 16 m)
 * and in scene close-ups, so light never washes over the court or the players.
 */
function fadeBeams(camera) {
  const cp = camera.position,
    close = A && (A.shot || A.sceneOn);
  for (const b of BEAMS) {
    if (!b.m.parent || !b.m.parent.visible) continue;
    b.m.updateMatrixWorld();
    segA.set(0, b.len / 2, 0).applyMatrix4(b.m.matrixWorld);
    segB.set(0, -b.len / 2, 0).applyMatrix4(b.m.matrixWorld);
    seg.set(segA, segB).closestPointToPoint(cp, true, near);
    const d = near.distanceTo(cp),
      k = close ? 0 : Math.min(1, Math.max(0, (d - 6) / 10));
    b.m.material.opacity = b.op * k;
    b.m.visible = k > 0.01;
  }
}
/** Team names, score and set on the big screen; redrawn only when the shown score changes. */
function drawScreen(w) {
  const p0 = document.getElementById('p0'),
    p1 = document.getElementById('p1'),
    sn = document.getElementById('setn'),
    s0 = p0 ? p0.textContent : '0',
    s1 = p1 ? p1.textContent : '0',
    key = `${s0}|${s1}|${sn ? sn.textContent : ''}|${A.m.t[0].short}`;
  if (key === w.screenKey) return;
  w.screenKey = key;
  const g = w.screenCanvas.getContext('2d'),
    cw = w.screenCanvas.width,
    ch = w.screenCanvas.height,
    T = A.m.t;
  g.fillStyle = '#070a16';
  g.fillRect(0, 0, cw, ch);
  for (const [i, x] of [
    [0, cw * 0.25],
    [1, cw * 0.75]
  ]) {
    g.fillStyle = T[i].color;
    g.fillRect(x - cw * 0.2, ch * 0.12, cw * 0.4, ch * 0.08);
    g.fillStyle = '#ffffff';
    g.font = '700 52px "Rajdhani",sans-serif';
    g.textAlign = 'center';
    g.fillText(T[i].short || T[i].name, x, ch * 0.34);
    g.font = '700 200px "Rajdhani",sans-serif';
    g.fillText(i ? s1 : s0, x, ch * 0.78);
  }
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.font = '600 34px "Inter",sans-serif';
  g.textAlign = 'center';
  g.fillText(sn ? sn.textContent.slice(0, 40) : '', cw / 2, ch * 0.94);
  w.screenTex.needsUpdate = true;
}
