// The venue's air (spec §2.27): what the crowd heat (Dir.heat, 0–1) does to the space around the court. Outdoors (street,
// beach, highland) the wind picks up — incense-smoke wisps curling across the court, dust or sand in the gusts; indoors (arena, hall)
// embers rise into the air. Roaring and up, embers fill every venue; at Inferno flames rise behind the far side line and at
// both ends of the court, in the hotter team's colour. Presentation only: Math.random, never the game's randoms.
import * as THREE from 'three';
import { lowEnd } from './units3d.mjs';

const OUTDOOR = new Set(['street', 'beach', 'highland']);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rr = (a, b) => a + Math.random() * (b - a);
/** Where the flames rise (metres): a row behind the far side line, in view of the courtside camera, and both end lines. */
const CORNERS = [
  [-9, -6.4],
  [-4.5, -6.4],
  [4.5, -6.4],
  [9, -6.4],
  [-11.8, 0],
  [11.8, 0]
];

/** Build the wind's smoke wisps, the dust, the embers and the corner flames (all hidden) into `scene`. */
export function buildAmbient(scene, glowTex) {
  const k = lowEnd || RM ? 0.45 : 1;
  // wind: incense-smoke wisps (owner, 2026-10-12, the Dynasty Warriors look) — soft curling ribbons riding the gust
  const wTex = smokeTex(),
    nW = Math.round(26 * k),
    wind = new THREE.Group();
  for (let i = 0; i < nW; i++) {
    const g = new THREE.BufferGeometry(),
      n = (WISP_SEG + 1) * 2,
      uv = new Float32Array(n * 2),
      idx = [];
    for (let j = 0; j <= WISP_SEG; j++) {
      uv.set([j / WISP_SEG, 0, j / WISP_SEG, 1], j * 4);
      if (j < WISP_SEG) idx.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const me = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ map: wTex, color: '#f4f1ea', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    me.frustumCulled = false;
    me.renderOrder = 3;
    me.userData.q = wispNew(true);
    wind.add(me);
  }
  wind.visible = false;
  // dust / sand: small points tumbling in the same gust
  const dust = points(Math.round(160 * k), glowTex, 0.12, false);
  dust.userData.p = Array.from({ length: dust.userData.n }, () => ({
    x: rr(-18, 18),
    y: rr(0.05, 2.5),
    z: rr(-9, 9),
    v: rr(0.5, 1.2),
    ph: rr(0, 6.3)
  }));
  // embers: glowing sparks rising through the air
  const embers = points(Math.round(340 * k), glowTex, 0.34, true);
  embers.userData.p = Array.from({ length: embers.userData.n }, () => ({
    x: rr(-16, 16),
    y: rr(0, 8),
    z: rr(-10, 10),
    v: rr(0.35, 1.1),
    ph: rr(0, 6.3),
    t: rr(0.3, 1)
  }));
  // flames: four emitters at the corners, particles that rise fast and burn out
  const flames = points(Math.round(420 * k), glowTex, 0.95, true);
  flames.userData.p = Array.from({ length: flames.userData.n }, (_, i) => ({ c: i % CORNERS.length, life: rr(0, 1), dx: 0, dz: 0, v: 1 }));
  for (const o of [wind, dust, embers, flames]) scene.add(o);
  return { wind, dust, embers, flames, col: new THREE.Color(), hot: new THREE.Color(), gust: 0 };
}
/** Segments along a wisp. */
const WISP_SEG = 28;
/** A fresh wisp (somewhere upwind; `anywhere`: along the whole run, for the first frame). */
function wispNew(anywhere) {
  return {
    x: anywhere ? rr(-14, 24) : rr(-26, -19),
    y: rr(0.4, 2.8),
    z: rr(-7, 5),
    len: rr(4, 9),
    amp: rr(0.25, 0.8),
    k: rr(0.8, 1.8),
    ph: rr(0, 6.3),
    w: rr(0.5, 1.3),
    v: rr(0.7, 1.25),
    op: rr(0.5, 1)
  };
}
/**
 * The smoke texture: a few soft wavy strands of incense smoke (u along the wisp, v across), faded at both ends and edges.
 * White, so the material colour tints it.
 */
function smokeTex() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 64);
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.lineCap = 'round';
  for (let j = 0; j < 9; j++) {
    const a = rr(3, 9),
      f = rr(0.01, 0.025),
      ph = rr(0, 6.3),
      y0 = rr(18, 46);
    g.globalAlpha = rr(0.35, 0.85);
    g.lineWidth = rr(2, 9);
    g.shadowBlur = rr(4, 12);
    g.beginPath();
    for (let x = 0; x <= 512; x += 4) {
      const y = y0 + Math.sin(x * f + ph) * a * (0.4 + x / 512);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  // fade the ends (thin, fresh head on the right; a long dissolving tail on the left) and the edges
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'destination-in';
  const gu = g.createLinearGradient(0, 0, 512, 0);
  gu.addColorStop(0, 'rgba(255,255,255,0)');
  gu.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  gu.addColorStop(0.85, 'rgba(255,255,255,1)');
  gu.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gu;
  g.fillRect(0, 0, 512, 64);
  const gv = g.createLinearGradient(0, 0, 0, 64);
  gv.addColorStop(0, 'rgba(255,255,255,0)');
  gv.addColorStop(0.5, 'rgba(255,255,255,1)');
  gv.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gv;
  g.fillRect(0, 0, 512, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** n additive glow points (per-point colour; brightness = visibility). */
function points(n, tex, size, glow) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const p = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      size,
      map: tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: 0
    })
  );
  p.frustumCulled = false;
  p.visible = false;
  p.userData.n = n;
  return p;
}
const EMBER = [new THREE.Color('#ffd27a'), new THREE.Color('#ff8a2a'), new THREE.Color('#ff4a1c')],
  FLAME_CORE = new THREE.Color('#fff2b0'),
  FLAME_MID = new THREE.Color('#ff9a2a'),
  DUST = { street: '#b8b0a0', beach: '#f1d9a0', highland: '#9fb07a' },
  /** The smoke's colour: pale incense smoke in every venue (owner, 2026-10-12: white only). */
  SMOKE = { street: '#f4f1ea', beach: '#f4f1ea', highland: '#f4f1ea' },
  tmp = new THREE.Color();

/**
 * Per frame (dt seconds of real time): the wind (outdoor venues), the embers, the corner flames — by the heat and its tier.
 * `kind` = the venue (a venues/looks.mjs LOOK key); `hotCol` = the hotter team's colour (the flames take it on).
 */
export function updateAmbient(amb, dt, kind, heat, hotCol) {
  if (!amb) return;
  const out = OUTDOOR.has(kind),
    s = Math.min(dt, 0.05);
  amb.gust = (amb.gust || 0) + s;
  // ---- wind (outdoors): always a breeze, stronger and gustier as the crowd heats up ----
  const wv = out ? 0.15 + 0.85 * heat : 0,
    gust = 0.7 + 0.3 * Math.sin(amb.gust * 0.9) * Math.sin(amb.gust * 0.37 + 1),
    speed = (5 + 14 * wv) * gust;
  amb.wind.visible = wv > 0.01;
  if (amb.wind.visible) {
    // each wisp drifts downwind, its body curling (the wave travels along it) and twisting; more wisps the harder it blows
    const W = amb.wind.children,
      shown = Math.round(W.length * (0.3 + 0.7 * wv)),
      t = amb.gust;
    for (let i = 0; i < W.length; i++) {
      const me = W[i],
        q = me.userData.q;
      me.visible = i < shown;
      if (!me.visible) continue;
      q.x += speed * 0.55 * q.v * s;
      if (q.x - q.len > 19) me.userData.q = wispNew(false);
      const a = me.geometry.attributes.position.array,
        L = q.len * (0.7 + 0.5 * wv);
      for (let j = 0; j <= WISP_SEG; j++) {
        const u = j / WISP_SEG, // 0 = the tail (upwind), 1 = the head
          tail = 1 - u,
          px = q.x - tail * L,
          wave = Math.sin(tail * q.k * 6.283 + q.ph - t * 1.7),
          py = q.y + wave * q.amp * 0.5 * (0.3 + tail) + Math.sin(tail * 3 + t * 0.6 + q.ph) * 0.25 * tail,
          pz = q.z + Math.cos(tail * q.k * 4 + q.ph * 0.7 - t * 1.1) * q.amp * 0.8 * tail,
          w = q.w * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, u * 1.15))) * (0.8 + 0.6 * tail),
          tw = Math.sin(tail * 4 + t * 0.9 + q.ph) * 0.7, // the ribbon twists as it curls
          oy = Math.cos(tw) * w * 0.5,
          oz = Math.sin(tw) * w * 0.5;
        a.set([px, py - oy, pz - oz, px, py + oy, pz + oz], j * 6);
      }
      me.geometry.attributes.position.needsUpdate = true;
      // fade in at the start of its run and out at the end
      const edge = Math.min(1, (q.x + 19) / 6, (19 - (q.x - L)) / 6);
      me.material.color.set(SMOKE[kind] || SMOKE.street);
      me.material.opacity = Math.max(0, edge) * q.op * (0.32 + 0.45 * wv) * (kind === 'street' ? 1 : 1.25);
    }
  }
  // dust / sand in the gusts (outdoors, from Buzzing)
  const dv = out ? Math.max(0, (heat - 0.2) / 0.8) : 0;
  amb.dust.visible = dv > 0.01;
  if (amb.dust.visible) {
    const P = amb.dust.userData.p,
      pos = amb.dust.geometry.attributes.position.array,
      col = amb.dust.geometry.attributes.color.array;
    tmp.set(DUST[kind] || '#c8c0b0');
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.ph += s * 3;
      q.x += speed * 0.7 * q.v * s;
      q.y += Math.sin(q.ph) * 0.4 * s;
      if (q.x > 19 || q.y < 0) {
        q.x = -19;
        q.y = rr(0.05, 2.5);
        q.z = rr(-9, 9);
      }
      pos.set([q.x, q.y, q.z], i * 3);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    amb.dust.geometry.attributes.position.needsUpdate = true;
    amb.dust.geometry.attributes.color.needsUpdate = true;
    amb.dust.material.opacity = 0.6 * dv;
    amb.dust.geometry.setDrawRange(0, Math.round(P.length * dv));
  }
  // ---- embers: indoors from Buzzing, everywhere from Roaring ----
  const ev = Math.max(0, (heat - (out ? HEAT.roaring : HEAT.buzzing)) / (1 - (out ? HEAT.roaring : HEAT.buzzing)));
  amb.embers.visible = ev > 0.01;
  if (amb.embers.visible) {
    const P = amb.embers.userData.p,
      pos = amb.embers.geometry.attributes.position.array,
      col = amb.embers.geometry.attributes.color.array,
      lift = 1 + 1.5 * ev;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.ph += s * 2;
      q.y += q.v * lift * s;
      q.x += (Math.sin(q.ph) * 0.35 + (out ? speed * 0.15 : 0)) * s;
      if (q.y > 8.5 || q.x > 18) {
        q.y = rr(-0.5, 0.5);
        q.x = rr(-16, 16);
        q.z = rr(-10, 10);
      }
      const c = EMBER[i % 3],
        fl = Math.min(1.6, 1.5 * q.t * (0.6 + 0.4 * Math.sin(q.ph * 3)) * Math.min(1, (8.5 - q.y) / 2)); // flicker, dying out near the top
      pos.set([q.x, q.y, q.z], i * 3);
      col.set([c.r * fl, c.g * fl, c.b * fl], i * 3);
    }
    amb.embers.geometry.attributes.position.needsUpdate = true;
    amb.embers.geometry.attributes.color.needsUpdate = true;
    amb.embers.material.opacity = Math.min(1, 0.25 + ev);
    amb.embers.geometry.setDrawRange(0, Math.round(P.length * Math.min(1, 0.35 + ev)));
  }
  // ---- flames at the corners: Inferno only, in the hotter team's colour ----
  const fv = Math.max(0, (heat - HEAT.inferno) / (1 - HEAT.inferno));
  amb.flames.visible = fv > 0.01 || amb.flames.material.opacity > 0.02;
  amb.flames.material.opacity += ((fv > 0 ? Math.min(1, 0.5 + fv) : 0) - amb.flames.material.opacity) * Math.min(1, s * 4);
  if (amb.flames.visible) {
    amb.hot.set(hotCol || '#ff5a1f');
    const P = amb.flames.userData.p,
      pos = amb.flames.geometry.attributes.position.array,
      col = amb.flames.geometry.attributes.color.array,
      h = 2.2 + 2.6 * fv;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.life += s * (1.2 + q.v * 0.6);
      if (q.life >= 1) {
        q.life = 0;
        q.dx = rr(-0.35, 0.35);
        q.dz = rr(-0.35, 0.35);
        q.v = rr(0.6, 1.4);
      }
      const [cx, cz] = CORNERS[q.c],
        t = q.life,
        sway = Math.sin(t * 7 + i) * 0.15 * t;
      pos.set([cx + q.dx * (1 - t * 0.6) + sway + (out ? speed * 0.04 * t : 0), t * h * q.v, cz + q.dz * (1 - t * 0.6)], i * 3);
      // white-hot core → orange → the team's colour, burning out
      tmp.copy(FLAME_CORE).lerp(FLAME_MID, Math.min(1, t * 2));
      if (t > 0.5) tmp.lerp(amb.hot, (t - 0.5) * 2);
      const b = Math.sin(Math.PI * Math.min(1, t * 1.15));
      col.set([tmp.r * b, tmp.g * b, tmp.b * b], i * 3);
    }
    amb.flames.geometry.attributes.position.needsUpdate = true;
    amb.flames.geometry.attributes.color.needsUpdate = true;
  }
}
