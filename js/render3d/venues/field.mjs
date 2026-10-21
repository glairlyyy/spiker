// Venue set: the field (spec §4.38, T-339) — a pickup game on open ground with the Ref drone: a patch of the ground you stand on
// (sand / grass / asphalt / slope), the court lines the drone projects (glowing on the ground), a light-curtain net between two
// projector pylons, a few props of the place, no stands (a handful of onlookers: venue3d's crowd). Built hidden by venue3d.mjs
// buildVenues; dressed per match (dressField) with A.ground. Low-poly; presentation only (Math.random, never the engine's R()).
import * as THREE from 'three';
import { KX, KZ, KH, W, canvasTex, lowEnd } from '../units3d.mjs';
import { box, at } from './kit.mjs';

/** A theme token (css/theme.css), read once. */
const tok = (n, d) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
  } catch (e) {
    return d;
  }
};
/** Per ground: the look over LOOK.field (sky, light, ground tones, grain) — the place you stand on. */
export const FIELD_LOOK = {
  sand: {
    bg: '#9fd0f0',
    hemi: ['#eef8ff', '#c9a66b', 1.35],
    sun: 2.4,
    ground: ['#e2c992', '#d4b77c'],
    outer: '#d6bd86',
    rough: 1,
    grain: 'sand'
  },
  grass: {
    bg: '#a9cde6',
    hemi: ['#eef6ff', '#4f7a3a', 1.2],
    sun: 2.0,
    ground: ['#5f9a45', '#6aa64e'],
    outer: '#5a8f42',
    rough: 0.95,
    grain: 'grass'
  },
  asphalt: {
    bg: '#8c97a6',
    hemi: ['#dfe4ec', '#3a3a3c', 1.05],
    sun: 1.6,
    ground: ['#4a4c52', '#55575d'],
    outer: '#44464b',
    rough: 0.9,
    grain: 'asphalt'
  },
  slope: {
    bg: '#a3b4c2',
    hemi: ['#e8eef4', '#56693f', 1.15],
    sun: 1.7,
    ground: ['#6c8a4a', '#7b9554'],
    outer: '#647f45',
    rough: 0.95,
    grain: 'grass'
  }
};

/** The field's floor: the ground patch fading to the outer ground, its grain, the projected lines glowing in the drone's cyan. */
export function drawField(g, w, h, k) {
  const L = FIELD_LOOK[k] || FIELD_LOOK.grass,
    m = w / 40,
    cx = w / 2,
    cy = h / 2,
    X = x => cx + (x - 500) * KX * m,
    Z = z => cy - (0.5 - z) * KZ * m,
    rnd = Math.random;
  g.fillStyle = L.outer;
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(cx, cy, h * 0.2, cx, cy, w * 0.55);
  gr.addColorStop(0, L.ground[0]);
  gr.addColorStop(0.7, L.ground[1]);
  gr.addColorStop(1, L.outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const n = lowEnd ? 12000 : 24000;
  for (let i = 0; i < n; i++) {
    const v = rnd(),
      x = rnd() * w,
      y = rnd() * h;
    if (L.grain === 'sand') {
      g.fillStyle = v < 0.5 ? 'rgba(120,90,40,.13)' : 'rgba(255,250,230,.16)';
      g.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 3);
    } else if (L.grain === 'asphalt') {
      g.fillStyle = v < 0.5 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.07)';
      g.fillRect(x, y, 2 + rnd() * 2, 2 + rnd() * 2);
    } else {
      g.strokeStyle = v < 0.5 ? 'rgba(20,60,10,.22)' : 'rgba(200,240,150,.14)'; // blades
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 4, y - 4 - rnd() * 6);
      g.stroke();
    }
  }
  if (L.grain === 'asphalt') {
    g.strokeStyle = 'rgba(0,0,0,.4)'; // cracks, and an old car-park bay line under the court
    g.lineWidth = 3;
    for (let c = 0; c < 14; c++) {
      let x = rnd() * w,
        y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) g.lineTo((x += (rnd() - 0.5) * 120), (y += (rnd() - 0.5) * 120));
      g.stroke();
    }
    g.strokeStyle = 'rgba(240,230,170,.18)';
    g.lineWidth = 0.1 * m;
    for (let i = -4; i <= 4; i++) {
      g.beginPath();
      g.moveTo(cx + i * 2.6 * m, Z(1.15));
      g.lineTo(cx + i * 2.6 * m, Z(1.3));
      g.stroke();
    }
  }
  // the projected lines: a soft cyan glow, then the bright core (boundary, centre, attack lines)
  const cyan = tok('--cyan', '#4cc9f0'),
    lines = () => {
      g.strokeRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
      g.beginPath();
      for (const x of [500, 360, 640]) {
        g.moveTo(X(x), Z(0.08));
        g.lineTo(X(x), Z(0.92));
      }
      g.stroke();
    };
  g.save();
  g.shadowColor = cyan;
  g.shadowBlur = 0.35 * m;
  g.strokeStyle = cyan;
  g.globalAlpha = 0.55;
  g.lineWidth = 0.16 * m;
  lines();
  g.restore();
  g.strokeStyle = '#e8fbff';
  g.lineWidth = 0.05 * m;
  lines();
  // the projector's scan: faint rows across the court
  g.fillStyle = 'rgba(120,220,255,.05)';
  for (let z = 0.08; z < 0.92; z += 0.04) g.fillRect(X(80), Z(z), X(920) - X(80), 0.03 * m);
}

/** Grey-to-white cyan curtain: bright at the tape and the floor, thin in the middle, scan lines. */
function curtainTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,.95)');
    gr.addColorStop(0.12, 'rgba(255,255,255,.35)');
    gr.addColorStop(0.85, 'rgba(255,255,255,.18)');
    gr.addColorStop(1, 'rgba(255,255,255,.6)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 2);
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h);
  });
}

/** A low-poly tree (trunk + two cones), a rock, a palm, a parked car: the place's props. */
const tree = (x, z, s, col = '#3f7a34') => {
  const p = new THREE.Group();
  p.add(at(box(0.25 * s, 1.6 * s, 0.25 * s, '#6d4f32'), 0, 0.8 * s, 0));
  for (const [y, r, hh] of [
    [1.9, 1.2, 1.8],
    [2.8, 0.85, 1.4]
  ]) {
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(r * s, hh * s, 6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, flatShading: true })
    );
    c.position.y = y * s;
    c.castShadow = true;
    p.add(c);
  }
  return at(p, x, 0, z);
};
const rock = (x, z, s, col = '#8a877e') => {
  const r = new THREE.Mesh(
    new THREE.DodecahedronGeometry(s, 0),
    new THREE.MeshStandardMaterial({ color: col, roughness: 1, flatShading: true })
  );
  r.position.set(x, s * 0.45, z);
  r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  r.castShadow = true;
  return r;
};
const palm = (x, z, h) => {
  const p = new THREE.Group(),
    trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.24, h, 6),
      new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9, flatShading: true })
    );
  trunk.position.y = h / 2;
  trunk.rotation.z = 0.1;
  p.add(trunk);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 2.8, 4),
      new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.8, flatShading: true })
    );
    leaf.position.set(Math.cos(i * 1.26) * 1, h, Math.sin(i * 1.26) * 1);
    leaf.rotation.set(Math.sin(i * 1.26) * 1.2, 0, -Math.cos(i * 1.26) * 1.2);
    p.add(leaf);
  }
  return at(p, x, 0, z);
};
const car = (x, z, col, rot = 0) => {
  const c = new THREE.Group();
  c.add(at(box(4, 0.8, 1.8, col, { rough: 0.5, metal: 0.3 }), 0, 0.6, 0));
  c.add(at(box(2.2, 0.6, 1.6, col, { rough: 0.5, metal: 0.3 }), -0.2, 1.3, 0));
  c.add(at(box(2.1, 0.5, 1.62, '#20262e', { rough: 0.2, metal: 0.5 }), -0.2, 1.3, 0));
  c.rotation.y = rot;
  return at(c, x, 0, z);
};

/** Build the field set: the light-curtain net with its two pylons (every ground) and each ground's props (dressField shows one). */
export function setField() {
  const g = new THREE.Group(),
    cyan = tok('--cyan', '#4cc9f0'),
    netW = 1.08 * KZ,
    top = 150 * KH,
    bot = 92 * KH,
    curtain = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, top - bot, netW), // a slab, not a sheet (owner, 2026-10-21: it read edge-on from the game camera)
      new THREE.MeshBasicMaterial({
        map: curtainTex(),
        color: cyan,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false
      })
    );
  curtain.position.set(0, (top + bot) / 2, 0);
  g.add(curtain);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, netW), new THREE.MeshBasicMaterial({ color: '#e8fbff', fog: false }));
  tape.position.set(0, top, 0);
  g.add(tape);
  // the antennae as light rods, the two projector pylons where the posts would stand
  for (const z of [0.08, 0.92]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 6), new THREE.MeshBasicMaterial({ color: cyan, fog: false }));
    rod.position.copy(W(500, z, 150)).setY(top + 0.7);
    g.add(rod);
  }
  for (const z of [-0.04, 1.04]) {
    const p = W(500, z, 0),
      pyl = new THREE.Group();
    pyl.add(at(box(0.32, 0.12, 0.32, '#2a2f38', { metal: 0.6, rough: 0.35 }), 0, 0.06, 0));
    pyl.add(
      at(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, top, 6),
          new THREE.MeshStandardMaterial({ color: '#3a404b', metalness: 0.6, roughness: 0.35 })
        ),
        0,
        top / 2,
        0
      )
    );
    pyl.add(
      at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: cyan, fog: false })), 0, top + 0.05, 0)
    );
    pyl.position.set(p.x, 0, p.z);
    g.add(pyl);
  }
  // per ground: a few things of the place (outside the free zone)
  const props = {
    sand: new THREE.Group(),
    grass: new THREE.Group(),
    asphalt: new THREE.Group(),
    slope: new THREE.Group()
  };
  for (const [x, z, h] of [
    [-17, -12, 6.5],
    [-12, -15, 7.5],
    [16, -13, 7],
    [21, -16, 8],
    [24, 9, 6]
  ])
    props.sand.add(palm(x, z, h));
  props.sand.add(rock(-21, 8, 0.7, '#b8a07a'), rock(19, 10, 0.5, '#b8a07a'));
  const sea = at(
    new THREE.Mesh(
      new THREE.PlaneGeometry(300, 120),
      new THREE.MeshStandardMaterial({ color: '#2a86c9', roughness: 0.25, metalness: 0.2 })
    ),
    0,
    -0.04,
    -85
  );
  sea.rotation.x = -Math.PI / 2;
  props.sand.add(sea);
  for (const [x, z, s] of [
    [-18, -12, 1.1],
    [-13, -16, 1.3],
    [-24, -6, 1],
    [15, -14, 1.2],
    [22, -10, 1],
    [19, 11, 0.9],
    [-20, 11, 1]
  ])
    props.grass.add(tree(x, z, s));
  for (const [x, z, s] of [
    [-16, -13, 1.2],
    [-11, -17, 1],
    [14, -15, 1.3],
    [20, -11, 1.1],
    [-22, 10, 1]
  ])
    props.slope.add(tree(x, z, s, '#355f2c'));
  props.slope.add(rock(-21, -5, 0.9), rock(23, 6, 1.1), rock(17, 12, 0.6));
  // the rise: a tilted bank behind one end (dressField turns it to the high side)
  const bank = new THREE.Group(),
    slab = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 60),
      new THREE.MeshStandardMaterial({ color: '#647f45', roughness: 1, flatShading: true })
    );
  slab.rotation.x = -Math.PI / 2;
  slab.position.x = 20;
  slab.receiveShadow = true;
  bank.add(slab);
  bank.userData.slab = slab;
  props.slope.add(bank);
  props.slope.userData.bank = bank;
  for (const [x, z, c, r] of [
    [-17, -12, '#b0413e', 0.1],
    [-11, -12.5, '#3d6fa8', -0.05],
    [15, -12, '#d8d8d2', 0.06],
    [21, 9, '#5a5f66', 1.5]
  ])
    props.asphalt.add(car(x, z, c, r));
  for (let i = 0; i < 6; i++) props.asphalt.add(at(box(0.18, 0.9, 0.18, '#e0b23c'), -13 + i * 5.2, 0.45, -9.6)); // bollards
  const lamp = new THREE.Group();
  lamp.add(
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), new THREE.MeshStandardMaterial({ color: '#2a2c30' })), 0, 3.5, 0)
  );
  lamp.add(at(box(1.2, 0.15, 0.3, '#2a2c30'), 0.5, 7, 0));
  props.asphalt.add(at(lamp, -20, 0, -9.8));
  for (const k of Object.keys(props)) {
    props[k].visible = false;
    g.add(props[k]);
  }
  g.userData.props = props;
  g.userData.curtain = curtain;
  return g;
}

/** Show ground k's props; on a slope the bank rises behind the high side's end (side `low` serves into the rise). */
export function dressField(set, k, low) {
  const P = set.userData.props;
  for (const [id, grp] of Object.entries(P)) grp.visible = id === (P[k] ? k : 'grass');
  const bank = P.slope.userData.bank;
  if (bank) {
    const s = low === 0 ? 1 : -1; // side 0 plays on the left (−x): its low end means the rise is behind the right end
    bank.position.set(21 * s, 0, 0);
    bank.userData.slab.position.x = 20 * s;
    bank.rotation.z = 0.22 * s;
  }
}

/** Per frame: the curtain shimmers. */
export function updateField(set, now) {
  const c = set.userData.curtain;
  if (c) c.material.opacity = 0.7 + 0.08 * Math.sin(now * 0.004); // (round the slab's 0.7)
}
