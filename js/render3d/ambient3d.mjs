// The venue's air (spec §2.27): what the crowd heat (Dir.heat, 0–1) does to the space around the court. Outdoors (street,
// beach, highland) the wind picks up — streaks blowing across the court, dust or sand in the gusts; indoors (arena, hall)
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

/** Build the wind streaks, the dust, the embers and the corner flames (all hidden) into `scene`. */
export function buildAmbient(scene, glowTex) {
  const k = lowEnd || RM ? 0.45 : 1;
  // wind: thin streaks, each a segment that rides the gust
  const nW = Math.round(140 * k),
    wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nW * 6), 3));
  wGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nW * 6), 3));
  const wind = new THREE.LineSegments(
    wGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  wind.frustumCulled = false;
  wind.userData.p = Array.from({ length: nW }, () => ({ x: rr(-18, 18), y: rr(0.2, 3.2), z: rr(-9, 9), v: rr(0.7, 1.3), l: rr(0.9, 2.2) }));
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
  tmp = new THREE.Color();

/**
 * Per frame (dt seconds of real time): the wind (outdoor venues), the embers, the corner flames — by the heat and its tier.
 * `kind` = the venue (VENUE_KINDS); `hotCol` = the hotter team's colour (the flames take it on).
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
    const P = amb.wind.userData.p,
      pos = amb.wind.geometry.attributes.position.array,
      col = amb.wind.geometry.attributes.color.array;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.x += speed * q.v * s;
      q.z += Math.sin(amb.gust * 1.3 + i) * 0.3 * s;
      if (q.x > 19) {
        q.x = -19;
        q.y = rr(0.2, 3.2);
        q.z = rr(-9, 9);
      }
      const L = q.l * (0.4 + 1.6 * wv),
        b = 0.35 + 0.65 * Math.min(1, Math.abs(19 - Math.abs(q.x)) / 4); // fades at the ends of its run
      pos.set([q.x - L, q.y, q.z, q.x, q.y + 0.05, q.z], i * 6);
      col.set([0, 0, 0, b, b, b], i * 6);
    }
    amb.wind.geometry.attributes.position.needsUpdate = true;
    amb.wind.geometry.attributes.color.needsUpdate = true;
    amb.wind.material.opacity = 0.22 + 0.6 * wv;
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
