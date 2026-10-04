// Match venues (spec §9.11): per-venue floor, set, light and crowd around the same court; officials and props; the
// big screen; venue moments (zone light, win confetti). Built once (every set in its own hidden group), dressed per
// match (dressVenue), animated per frame (updateVenue). Presentation only: Math.random, never the engine's R().
import * as THREE from 'three';
import { KX, KZ, W, canvasTex, lowEnd } from './units3d.mjs';

/** Per venue: sky / fog, light (hemi sky, ground, intensity; sun; rim), floor colours and finish, crowd shade. */
const LOOK = {
  arena: {
    bg: '#05070f',
    fog: [30, 85],
    hemi: ['#cfd8ff', '#20140c', 0.6],
    sun: 1.5,
    rim: 0.7,
    inner: '#2f6fd0',
    free: '#d8743a',
    lines: '#ffffff',
    rough: 0.22,
    outer: '#0a0d1c',
    lum: 0.6,
    neutrals: ['#3a4470', '#4a5480', '#2e365e']
  },
  hall: {
    bg: '#1c232e',
    fog: [26, 70],
    hemi: ['#fff3e0', '#4a3420', 1.15],
    sun: 1.6,
    rim: 0.4,
    inner: '#d9a868',
    free: '#3e7a58',
    lines: '#ffffff',
    rough: 0.38,
    outer: '#2a2f38',
    lum: 0.95,
    neutrals: ['#59657a', '#7a6d5e', '#4f5a6d']
  },
  beach: {
    bg: '#8fc8ef',
    fog: [45, 160],
    hemi: ['#eaf6ff', '#c9a66b', 1.35],
    sun: 2.6,
    rim: 0.3,
    inner: '#e4cc96',
    free: '#e4cc96',
    lines: '#2a5fd0',
    rough: 1,
    outer: '#d8bf88',
    lum: 1,
    neutrals: ['#c2563f', '#3f8fb0', '#e0b23c', '#6a8a4a']
  },
  highland: {
    bg: '#9aa7b2',
    fog: [24, 95],
    hemi: ['#dfe6ee', '#4c5a40', 1.15],
    sun: 1.0,
    rim: 0.35,
    inner: '#3f7d8a',
    free: '#55705a',
    lines: '#f2f2f2',
    rough: 0.65,
    outer: '#47633c',
    lum: 0.85,
    neutrals: ['#5d6b52', '#7a6a55', '#4b5b6b']
  },
  street: {
    bg: '#06070b',
    fog: [16, 55],
    hemi: ['#7a80a8', '#3a2814', 0.95],
    sun: 0.8,
    rim: 0.25,
    inner: '#3b3d43',
    free: '#34363b',
    lines: '#f2e6b0',
    rough: 0.92,
    outer: '#1e2025',
    lum: 0.42,
    neutrals: ['#3d3f4a', '#4a3e36', '#2f3a44']
  }
};
export const VENUE_KINDS = Object.keys(LOOK);

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
/** The floor for one venue on the shared 40 m × 20 m floor plane (same mapping as the court lines). */
function drawFloor(g, w, h, kind) {
  const L = LOOK[kind],
    m = w / 40,
    cx = w / 2,
    cy = h / 2,
    X = x => cx + (x - 500) * KX * m,
    Z = z => cy - (0.5 - z) * KZ * m,
    rnd = Math.random;
  g.fillStyle = L.free;
  g.fillRect(0, 0, w, h);
  if (kind === 'hall')
    for (let i = 0; i < 160; i++) {
      // planks
      g.fillStyle = i % 2 ? 'rgba(255,230,190,.05)' : 'rgba(70,40,10,.06)';
      g.fillRect(0, i * (h / 160), w, h / 160);
    }
  g.fillStyle = L.inner;
  g.fillRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
  if (kind === 'hall') {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,235,200,.07)' : 'rgba(90,50,10,.07)';
      g.fillRect(X(80), i * (h / 160), X(920) - X(80), h / 160);
    }
    // faded basketball lines
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 0.05 * m;
    g.beginPath();
    g.arc(cx, cy, 1.8 * m, 0, 7);
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * 13 * m, cy, 6.7 * m, Math.PI / 2 + (s < 0 ? Math.PI : 0), (3 * Math.PI) / 2 + (s < 0 ? Math.PI : 0), s > 0);
      g.stroke();
    }
  }
  if (kind === 'beach' || kind === 'street') {
    // sand grains / asphalt speckle
    for (let i = 0; i < 26000; i++) {
      const v = rnd();
      g.fillStyle =
        kind === 'beach'
          ? v < 0.5
            ? 'rgba(120,90,40,.12)'
            : 'rgba(255,250,230,.16)'
          : v < 0.5
            ? 'rgba(0,0,0,.18)'
            : 'rgba(255,255,255,.06)';
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  }
  if (kind === 'street') {
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 3;
    for (let c = 0; c < 18; c++) {
      let x = rnd() * w,
        y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.5) * 120), (y += (rnd() - 0.5) * 120));
      g.stroke();
    }
  }
  if (kind === 'arena' || kind === 'highland')
    for (let i = 0; i < 40; i++) {
      // scuffs
      g.fillStyle = 'rgba(0,0,0,.05)';
      g.beginPath();
      g.ellipse(X(120 + rnd() * 760), Z(0.12 + rnd() * 0.76), 0.6 * m * rnd() + 4, 0.2 * m * rnd() + 2, rnd() * 3, 0, 7);
      g.fill();
    }
  // emblem
  if (kind === 'arena' || kind === 'hall') {
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.lineWidth = 0.08 * m;
    g.beginPath();
    g.arc(cx, cy, 1.5 * m, 0, 7);
    g.stroke();
    g.font = `900 ${0.9 * m}px "Dela Gothic One","Arial Black",sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillText('SPITE & SPIKE', cx, Z(0.98) + 0.35 * m);
  }
  // lines: boundary, centre, attack lines (dashed past the side lines)
  const worn = kind === 'street' ? 0.75 : 0.95;
  g.strokeStyle = kind === 'beach' ? L.lines : `rgba(${kind === 'street' ? '242,230,176' : '255,255,255'},${worn})`;
  g.lineWidth = (kind === 'beach' ? 0.08 : 0.06) * m;
  g.strokeRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
  g.beginPath();
  for (const x of [500, 360, 640]) {
    g.moveTo(X(x), Z(0.08));
    g.lineTo(X(x), Z(0.92));
  }
  g.stroke();
  if (kind !== 'beach') {
    g.setLineDash([0.15 * m, 0.2 * m]);
    g.beginPath();
    for (const x of [360, 640])
      for (const [a, b] of [
        [0.08, 0.0],
        [0.92, 1.0]
      ]) {
        g.moveTo(X(x), Z(a));
        g.lineTo(X(x), Z(b));
      }
    g.stroke();
    g.setLineDash([]);
  }
}
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
const box = (w, h, d, color, o = {}) => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0 })
  );
  m.castShadow = !!o.shadow;
  m.receiveShadow = true;
  return m;
};
const at = (o, x, y, z) => (o.position.set(x, y, z), o);
/** A plain standing figure (officials): body capsule + head. */
function figure(color) {
  const g = new THREE.Group(),
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 3, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.8 })),
    head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: '#e2bb94', roughness: 0.7 }));
  body.position.y = 0.6 + 0.22;
  head.position.y = 1.62;
  body.castShadow = true;
  g.add(body, head);
  return g;
}
/** An additive light cone / shaft (a cone mesh, open, fading by opacity). */
/** Light shafts and cones, faded by camera distance every frame (updateVenue) so none ever covers the view. */
const BEAMS = [];
let beamFade = null;
function beam(r0, r1, len, color, op) {
  // soft along its length: brightest at the source, gone before the floor
  beamFade =
    beamFade ||
    canvasTex(4, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.55, '#606060');
      gr.addColorStop(1, '#000000');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r0, r1, len, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      alphaMap: beamFade,
      transparent: true,
      opacity: op,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    })
  );
  BEAMS.push({ m, op, len });
  m.renderOrder = 4;
  return m;
}

// ---------- sets ----------
function setArena(w) {
  const g = new THREE.Group();
  // roof trusses and the big screen behind the far stands
  for (const x of [-15, -5, 5, 15]) g.add(at(box(0.4, 0.4, 30, '#141826'), x, 14, -4));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ map: w.screenTex, fog: false }));
  scr.position.set(0, 7.4, -18.2);
  const frame = at(box(8.5, 4.5, 0.4, '#0d1020'), 0, 7.4, -18.45);
  g.add(frame, scr);
  // LED ribbon along the stands
  const rib = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.35), new THREE.MeshBasicMaterial({ color: '#2a7fff', fog: false }));
  rib.position.set(0, 3.8, -16.7);
  g.add(rib);
  if (!lowEnd)
    for (const [x, z] of [
      [-6, -2],
      [6, -2],
      [-6, 2.5],
      [6, 2.5]
    ]) {
      const c = beam(0.4, 3.2, 14, '#bcd2ff', 0.035);
      c.position.set(x, 7, z);
      g.add(c);
    }
  const spot = new THREE.SpotLight('#ffffff', 0, 40, 0.75, 0.6, 1.2);
  spot.position.set(0, 16, 2);
  spot.target.position.set(0, 0, 0);
  g.add(spot, spot.target);
  g.userData.spot = spot;
  return g;
}
function bleachers(g, rows, step, depth, color, half) {
  for (let r = 0; r < rows; r++)
    g.add(at(box(half * 2, step, depth, color, { metal: 0.3, rough: 0.6 }), 0, step / 2 + r * step, -9.2 - r * depth));
}
function setHall(w) {
  const g = new THREE.Group();
  bleachers(g, 4, 0.45, 1.0, '#8a95a6', 17.5);
  const wall = at(
    new THREE.Mesh(new THREE.PlaneGeometry(60, 14), new THREE.MeshStandardMaterial({ color: '#6b7787', roughness: 0.95 })),
    0,
    7,
    -15
  );
  g.add(wall);
  for (let i = 0; i < 6; i++) {
    const x = -20 + i * 8,
      win = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false }));
    win.position.set(x, 10.5, -14.95);
    g.add(win);
    if (!lowEnd) {
      const s = beam(0.9, 2.4, 13, '#fff1cc', 0.03);
      s.position.set(x + 2.5, 5.5, -9);
      s.rotation.x = -0.75;
      s.rotation.z = 0.25;
      g.add(s);
    }
  }
  const ban = ['ACADEMY', 'U21', 'SPIKE', 'NEVER GIVE UP'];
  ban.forEach((t, i) => {
    const tex = canvasTex(256, 512, (c, cw, ch) => {
      c.fillStyle = ['#7a1f2b', '#1f3f7a', '#2b6a3a', '#5a2b7a'][i];
      c.fillRect(0, 0, cw, ch);
      c.fillStyle = '#f4e9c8';
      c.font = '800 46px "Rajdhani",sans-serif';
      c.textAlign = 'center';
      c.save();
      c.translate(cw / 2, ch / 2);
      c.rotate(-Math.PI / 2);
      c.fillText(t, 0, 16);
      c.restore();
    });
    g.add(
      at(
        new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })),
        -21 + i * 14,
        6.4,
        -14.9
      )
    );
  });
  // wall board with the score
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: w.screenTex, fog: false })), 0, 6.4, -14.9));
  return g;
}
function setBeach() {
  const g = new THREE.Group();
  bleachers(g, 4, 0.5, 1.1, '#9aa3ad', 13.5);
  const sea = at(
    new THREE.Mesh(
      new THREE.PlaneGeometry(400, 160),
      new THREE.MeshStandardMaterial({ color: '#2a86c9', roughness: 0.25, metalness: 0.2 })
    ),
    0,
    -0.05,
    -110
  );
  sea.rotation.x = -Math.PI / 2;
  g.add(sea);
  const palm = (x, z, h) => {
    const p = new THREE.Group(),
      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.26, h, 8),
        new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 })
      );
    trunk.position.y = h / 2;
    trunk.rotation.z = 0.08;
    p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 3.2, 4),
        new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.8 })
      );
      leaf.position.set(Math.cos(i) * 1.1, h, Math.sin(i) * 1.1);
      leaf.rotation.set(Math.sin(i) * 1.2, 0, -Math.cos(i) * 1.2);
      p.add(leaf);
    }
    return at(p, x, 0, z);
  };
  for (const [x, z, h] of [
    [-19, -17, 7],
    [-14, -21, 8],
    [15, -18, 7.5],
    [21, -22, 8.5],
    ...(lowEnd
      ? []
      : [
          [-24, -13, 6.5],
          [25, -14, 6]
        ])
  ])
    g.add(palm(x, z, h));
  return g;
}
function setHighland(w) {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: '#56685a', roughness: 1, flatShading: true }),
    snow = new THREE.MeshStandardMaterial({ color: '#eef2f4', roughness: 1, flatShading: true });
  for (const [x, z, r, h] of [
    [-38, -60, 18, 22],
    [-12, -72, 22, 30],
    [16, -64, 17, 20],
    [40, -70, 20, 26],
    [0, -52, 12, 13]
  ]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
    m.position.set(x, h / 2 - 0.5, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 7), snow);
    cap.position.set(x, h - h * 0.14 - 0.5, z);
    g.add(m, cap);
  }
  const flags = [];
  for (let i = 0; i < 6; i++) {
    const x = -15 + i * 6,
      pole = at(
        new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5, 6), new THREE.MeshStandardMaterial({ color: '#c8ccd2' })),
        x,
        2.5,
        -11.5
      ),
      geo = new THREE.PlaneGeometry(1.6, 0.9, 8, 2),
      fl = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: ['#2fb8a0', '#d8d2c0', '#2fb8a0', '#c0503a', '#2fb8a0', '#d8d2c0'][i],
          side: THREE.DoubleSide,
          roughness: 0.9
        })
      );
    fl.position.set(x + 0.8, 4.5, -11.5);
    flags.push({ fl, rest: geo.attributes.position.array.slice(), ph: i });
    g.add(pole, fl);
  }
  g.userData.flags = flags;
  return g;
}
function setStreet() {
  const g = new THREE.Group();
  const link = canvasTex(128, 128, (c, cw) => {
    c.clearRect(0, 0, cw, cw);
    c.strokeStyle = 'rgba(190,200,210,.75)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(cw, cw);
    c.moveTo(cw, 0);
    c.lineTo(0, cw);
    c.stroke();
  });
  link.wrapS = link.wrapT = THREE.RepeatWrapping;
  link.repeat.set(60, 6);
  const fenceMat = new THREE.MeshBasicMaterial({ map: link, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(36, 3.6), fenceMat), 0, 1.8, -8.9));
  // overpass deck and pillars with graffiti
  g.add(at(box(80, 1.4, 9, '#3a3d44'), 0, 9.5, -15));
  const tag = (txt, col) =>
    canvasTex(256, 512, (c, cw, ch) => {
      c.fillStyle = '#4a4d55';
      c.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 6; i++) {
        c.fillStyle = ['#ff3b6b', '#3bd1ff', '#ffd23b', '#7cff6b'][i % 4] + '88';
        c.beginPath();
        c.ellipse(Math.random() * cw, 260 + Math.random() * 220, 40 + Math.random() * 60, 20 + Math.random() * 40, Math.random() * 3, 0, 7);
        c.fill();
      }
      c.fillStyle = col;
      c.font = '900 64px "Dela Gothic One","Arial Black",sans-serif';
      c.textAlign = 'center';
      c.save();
      c.translate(cw / 2, 380);
      c.rotate(-0.2);
      c.fillText(txt, 0, 0);
      c.restore();
    });
  ['SPIKE', 'WEI', 'NOBODY', 'SPITE'].forEach((t, i) => {
    const x = -21 + i * 14,
      p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 1.6), [
        ...Array(4).fill(new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 0.95 })),
        new THREE.MeshStandardMaterial({ map: tag(t, ['#ff3b6b', '#3bd1ff', '#ffd23b', '#ffffff'][i]), roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ color: '#4a4d55' })
      ]);
    p.position.set(x, 4.5, -13);
    g.add(p);
  });
  // sodium street lamps
  for (const x of [-12, 12]) {
    g.add(
      at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), new THREE.MeshStandardMaterial({ color: '#2a2c30' })), x, 3.5, -9.6)
    );
    const glow = at(
      new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffc070', fog: false })),
      x,
      7,
      -9.2
    );
    const L = new THREE.PointLight('#ffb050', 45, 30, 1.4);
    L.position.set(x, 6.8, -8.5);
    g.add(glow, L);
  }
  return g;
}
/** Officials and court-side props: referee stand by the far post, line judges, benches, scorer's table, ball cart. */
function setOfficials() {
  const g = new THREE.Group(),
    far = W(500, 1.04).z; // far post
  const stand = new THREE.Group();
  for (const [dx, dz] of [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35]
  ])
    stand.add(
      at(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6),
          new THREE.MeshStandardMaterial({ color: '#c8ccd8', metalness: 0.5 })
        ),
        dx,
        0.75,
        dz
      )
    );
  stand.add(at(box(0.9, 0.08, 0.9, '#c8ccd8', { metal: 0.4 }), 0, 1.5, 0));
  const ref = figure('#1d1f26');
  ref.position.y = 1.54;
  stand.add(ref);
  stand.position.set(0, 0, far - 0.75);
  g.add(stand);
  const judges = new THREE.Group();
  for (const x of [60, 940]) {
    const j = figure('#20232c'),
      p = W(x, 1.02);
    j.position.set(p.x, 0, p.z - 0.3);
    const flag = at(
      new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshBasicMaterial({ color: '#ff4a3a', side: THREE.DoubleSide })),
      0.32,
      1.25,
      0
    );
    j.add(flag);
    judges.add(j);
  }
  g.add(judges);
  for (const s of [-1, 1]) {
    const b = new THREE.Group();
    b.add(at(box(5, 0.08, 0.5, '#2c3550'), 0, 0.45, 0), at(box(5, 0.5, 0.06, '#2c3550'), 0, 0.72, -0.24));
    for (const x of [-2.3, 2.3]) b.add(at(box(0.06, 0.45, 0.45, '#1a1f30'), x, 0.22, 0));
    b.position.set(s * 6.5, 0, far - 1.9);
    g.add(b);
  }
  const table = new THREE.Group();
  table.add(at(box(2.4, 0.06, 0.7, '#e8ebf2'), 0, 0.75, 0), at(box(2.4, 0.7, 0.04, '#1f2a4a'), 0, 0.37, 0.33));
  table.position.set(0, 0, far - 2.2);
  g.add(table);
  const cart = new THREE.Group();
  cart.add(at(box(0.9, 0.04, 0.6, '#9aa0aa', { metal: 0.6 }), 0, 0.35, 0));
  const ballMat = new THREE.MeshStandardMaterial({ color: '#f2d24a', roughness: 0.5 });
  for (let i = 0; i < 6; i++)
    cart.add(
      at(
        new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), ballMat),
        -0.3 + (i % 3) * 0.3,
        0.55 + Math.floor(i / 3) * 0.25,
        (i % 2) * 0.2 - 0.1
      )
    );
  cart.position.set(-12.5, 0, far - 1.4);
  g.add(cart);
  g.userData = { judges, table };
  return g;
}

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
  w.sets = { arena: setArena(w), hall: setHall(w), beach: setBeach(), highland: setHighland(w), street: setStreet() };
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
