// The 3D map's light and look (map3d.mjs): renderer settings, the sun, the hemisphere and the Fast look's sea (lightScene);
// the clock's sky colours and sun direction (skyAt, SKY); the detailed look (richLook, LOOK): terrain and sea shaders, the baked
// sky, the post (bloom, GTAO, ACES), shadows by zoom and dynamic resolution. Display only, no randoms, no downloads.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { clamp, lerp, smooth, tileNoise, heightToNormal } from './geo3d.mjs';

const SHADOW_MAP = 2048, // sun shadow map size (px; the Fast look)
  SHADOW_BOX = 120; // half-size of the sun's shadow frustum around the view (m; the Fast look)

/** Renderer settings, sky, hemisphere light, the sun with its shadow, and the sea. */
export function lightScene(renderer, scene) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color(0x0b1d2c);
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(sun.shadow.camera, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: 500 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x1d5f8f, specular: 0x9bc4e0, shininess: 90, transparent: true, opacity: 0.92 })
  );
  scene.add(water);
  return { sun, hemi, water };
}
/**
 * The light at time of day `tod` (0–1) from the clock's keys (model.time.keys, wrapping round midnight), written into the
 * sun, the hemisphere and the background; the sun's direction from the hour (east at dawn, south and high at noon, west at
 * dusk; the moon high in the south-west at night). Returns `lit` (0–1: how far the night lights are on). Reuses its colours.
 */
export const SKY = {
  a: new THREE.Color(),
  b: new THREE.Color(),
  dir: new THREE.Vector3(),
  moon: new THREE.Vector3(-0.5, 1, 0.6).normalize()
};
export function skyAt(keys, tod, sun, hemi, scene) {
  let i = keys.findIndex(k => k.t > tod);
  if (i < 0) i = keys.length;
  const A = keys[(i - 1 + keys.length) % keys.length],
    B = keys[i % keys.length],
    span = (B.t - A.t + 1) % 1 || 1,
    u = ((tod - A.t + 1) % 1) / span,
    mix = (k, out) => out.set(A[k]).lerp(SKY.b.set(B[k]), u),
    num = k => A[k] + (B[k] - A[k]) * u;
  mix('sun', sun.color);
  sun.intensity = num('sunI');
  mix('sky', hemi.color);
  mix('ground', hemi.groundColor);
  hemi.intensity = num('hemi');
  mix('bg', scene.background);
  const lit = num('lit'),
    a = clamp((tod - 0.22) / 0.62, 0, 1) * Math.PI;
  SKY.dir
    .set(1.25 * Math.cos(a) + 0.54 * Math.sin(a), 0.2 + 0.8 * Math.sin(a), 0.05 + 0.3 * Math.sin(a))
    .normalize()
    .lerp(SKY.moon, smooth(0.3, 0.9, lit))
    .normalize();
  return lit;
}
/**
 * The detailed look (spec §4.39 Land, T-343) — the default; the Fast setting (setLow) keeps the flat look above. Sky: three's
 * physical Sky (no sun disc) on the clock's real sun, baked into an environment map (PMREM) when the sun has moved — the
 * map camera never sees the sky itself, only its light and its reflection (water, glass). Terrain: the same mesh and vertex
 * colours with a shader on top (ground weights gnd: sand / rock / field rows / wet, plus slope rock; detail from one
 * generated tileable texture, bump by derivatives). Sea: a standard material with two scrolling generated normal maps,
 * colour by depth and distance from the coast (terrain.shore texture) and foam at the shore. Post: ACES tone mapping,
 * bloom while the night lights are on, GTAO on the High setting; soft PCF shadows whose box follows the zoom; dynamic
 * resolution. No downloads, no randoms (fixed-hash noise).
 */
export const LOOK = {
  exposure: [1, 1.7], // ACES exposure by day → with the night lights on (lit)
  samples: 4, // MSAA samples of the post's render target (the canvas's own antialias is bypassed)
  env: 0.3, // the sky's light on materials at noon (× the sun's height; none at night)
  hemi: [0.7, 1.6], // the clock's hemisphere light × this by day → at night (by day the sky adds the rest)
  // (pacing 2026-10-27: re-baked at most every `every` s when the sun moved `moved` rad (~7 game minutes) — the cube's six faces
  // one a frame into a target made once, then one PMREM pass into the same env target: no allocation, no 6-face frame)
  sky: { turbidity: 5, rayleigh: 1.4, mie: 0.004, g: 0.8, every: 1, moved: 0.03 },
  bloom: { strength: 0.85, radius: 0.5, day: 3, night: 0.8 }, // threshold from day (nothing blooms) to night
  shadow: { radius: 3, box: [40, 360], k: 0.85, map: 2048, mapHi: 4096 },
  // dynamic resolution: ms (frame-time average) to step down / up; far too slow (`dire`, < ~15 fps) steps faster to `rescue`.
  // Performance (owner, 2026-10-25): every setting (Fast too) is capped to its pixel budget (GFX px3d, as in matches) before
  // the factor; High keeps its resolution and sheds instead (`shed`: 1 = no AO, 2 = the 2048 shadow map), back after `back` quick s.
  // Pacing (2026-10-27): the detailed look never reallocates for the factor — the post's targets stay at the full size and the scene
  // draws into a scaled viewport (`viewScale`); a step needs `downN` slow / `upN` quick ticks in a row (the GPU's ms when timed).
  dyn: {
    floor: { auto: 0.7, high: 1, fast: 0.55 },
    slow: 24,
    quick: 15,
    dire: 66,
    rescue: { auto: 0.45, high: 1, fast: 0.45 },
    back: 5,
    downN: 2,
    upN: 3
  },
  sea: { deep: '#0d3b5e', mid: '#176b8a', shallow: '#3fb2ad', foam: '#f4f8f6', wave: 0.32 },
  detail: 256 // generated texture size (px)
};
const GLSL_BUMP = `vec3 lkBump(vec3 sp, vec3 sn, vec2 dh) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1);
  return normalize(abs(det) * sn - sign(det) * (dh.x * r1 + dh.y * r2));
}`;
/** A repeating linear-filtered, mipmapped RGBA texture from bytes (n × n). */
const dataTex = (bytes, n, srgb = false) => {
  const t = new THREE.DataTexture(bytes, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
};
/** The generated textures: detail (R fine grain, G patches, B sand ripples, A rock cracks) and the waves' normal map. */
function lookTextures(n) {
  const fine = tileNoise(n, 32, 3, 1),
    patch = tileNoise(n, 4, 4, 2),
    warp = tileNoise(n, 4, 3, 3),
    crack = tileNoise(n, 8, 4, 4),
    det = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        rip = 0.5 + 0.5 * Math.sin(2 * Math.PI * ((y / n) * 12 + 1.6 * warp[i])),
        cr = smooth(0, 0.07, Math.abs(2 * crack[i] - 1));
      det.set([fine[i] * 255, patch[i] * 255, rip * 255, cr * 255], i * 4);
    }
  return { det: dataTex(det, n), wave: dataTex(heightToNormal(tileNoise(n, 8, 5, 9, 0.55), n, 7), n) };
}
/**
 * Street level's ground (spec §4.44, T-370): one generated tileable RGBA texture, painted (soft bands, few flecks — not photo
 * grain), each channel a shade around 0.5 sampled with world UVs — R asphalt (mottled, tar seams, sparse flecks; tile
 * GROUND.tile.asph m), G pavement (GROUND.slab m slabs: a tone each, dark joints, a light chamfer), B grass (blade strokes,
 * posterized into painted bands), A paint wear (lane marks). Made in code, decoded in memory (no image files).
 */
export const GROUND = {
  n: 256,
  tile: { asph: 4, pave: 2, grass: 1.7, paint: 3, var: 13 }, // m a texture tile covers
  slab: 0.5, // pavement slab (m): 4 × 4 in a tile
  fade: [0.06, 0.4], // the detail fades to its mean between these m a pixel (no shimmer far off)
  edge: { in: 0.18, w: 0.1, end: 1.4 } // main roads' edge lines: this far in from the edge, this wide, clear of junctions by hw + end m
};
export function groundBytes(n = GROUND.n) {
  const mott = tileNoise(n, 4, 3, 21),
    fleck = tileNoise(n, 64, 1, 22),
    seam = tileNoise(n, 6, 3, 23),
    tone = tileNoise(n, 4, 2, 24),
    blade = tileNoise(n, 16, 3, 25),
    clump = tileNoise(n, 4, 3, 26),
    wear = tileNoise(n, 12, 3, 27),
    out = new Uint8Array(n * n * 4),
    band = (v, k) => Math.round(v * k) / k, // posterize (painted)
    sl = n / 4; // a slab's side (px)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        // asphalt: two-tone mottling, a thin tar seam, rare light flecks
        sm = smooth(0, 0.035, Math.abs(2 * seam[i] - 1)),
        a = 0.5 + 0.42 * (band(mott[i], 5) - 0.5) - 0.18 * (1 - sm) + (fleck[i] > 0.86 ? 0.14 : 0),
        // pavement: a tone per slab (hash of its cell), joints, the top-left chamfer lighter
        cx = Math.floor(x / sl),
        cy = Math.floor(y / sl),
        h = (((cx * 73 + cy * 151 + 17) * 2654435761) >>> 0) / 4294967296,
        fx = (x % sl) / sl,
        fy = (y % sl) / sl,
        jo = Math.min(fx, fy, 1 - fx, 1 - fy),
        p =
          (0.5 + 0.14 * (h - 0.5) + 0.06 * (band(tone[i], 4) - 0.5)) * (jo < 0.03 ? 0.55 : 1) +
          (jo < 0.09 && jo >= 0.03 && (fx < 0.09 || fy < 0.09) ? 0.06 : 0),
        // grass: stretched blade strokes (the noise read along y faster), clumps, three painted bands
        bs = blade[((y * 3) % n) * n + x],
        g = 0.5 + 0.3 * (band(0.55 * bs + 0.45 * clump[i], 3) - 0.5),
        w = 0.5 + 0.35 * (wear[i] > 0.62 ? -(wear[i] - 0.62) * 2.2 : 0.05);
      out.set([clamp(a, 0, 1) * 255, clamp(p, 0, 1) * 255, clamp(g, 0, 1) * 255, clamp(w, 0, 1) * 255], i * 4);
    }
  return out;
}
/** Shared uniforms: the texture (made on first use) and the weight (look.step: smooth(0.2, 0.8, st) on Auto / High, 0 on Fast). */
export const GROUND_U = { tGround: { value: null }, uGr: { value: 0 }, uGrD: { value: new THREE.Vector2(1e5, 2e5) } };
/**
 * The terrain's painted grass and smooth normals by distance (owner 2026-10-26, a laptop GPU): on Auto they fade out between
 * `near` m from the camera (GROUND_U.uGrD), so a terrain chunk whose box lies beyond `near[1]` draws the far material (LK_FAR:
 * three texture reads and the normal mix compiled out — the same pixels). High keeps them to the pixel-footprint fade only.
 */
export const TERRAIN_LOD = { near: [45, 60] };
/**
 * Street level's painted distance on the buildings (T-371, spec §4.44): past `SIL.r` m a building leans toward the hour's haze hue
 * darkened (`SIL.dark`) — a blue-grey painted skyline under the haze instead of pale boxes washed white. kit3d's building materials
 * read these uniforms (`silPatch`); look.step sets them (Auto / High at street level; Fast and the map: off).
 */
export const SIL = { r: [80, 420], k: 0.65, dark: 0.55 };
export const SIL_U = { uSil: { value: new THREE.Color() }, uSilK: { value: 0 }, uSilR: { value: new THREE.Vector2(...SIL.r) } };
/** Patch a shader (in onBeforeCompile) with the painted distance: the colour leans to uSil by distance from the camera, before the fog. */
export const silPatch = sh => {
  Object.assign(sh.uniforms, SIL_U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vSilD;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n  vSilD = length(mvPosition.xyz);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vSilD; uniform vec3 uSil; uniform float uSilK; uniform vec2 uSilR;')
    .replace(
      '#include <fog_fragment>',
      `if (uSilK > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, uSil, uSilK * ${SIL.k.toFixed(2)} * smoothstep(uSilR.x, uSilR.y, vSilD)
    * (1.0 - 0.8 * smoothstep(0.6, 1.4, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b))))); // (lit windows keep their glow)
  #include <fog_fragment>`
    );
};
const groundTex = () => GROUND_U.tGround.value || (GROUND_U.tGround.value = dataTex(groundBytes(), GROUND.n));
const GLSL_GROUND = `
  float grFade(vec2 gp) { return uGr * (1.0 - smoothstep(${GROUND.fade[0].toFixed(3)}, ${GROUND.fade[1].toFixed(3)}, length(fwidth(gp)))); }
  vec4 grTex(vec2 gp, float tile) { return texture2D(tGround, gp / tile); }`;
/**
 * A road / pavement material (town3d, T-370) painted at street level: its geometry has `gk` (vec4: kind 1 asphalt, 2 pavement,
 * 3 lane paint, 4 dirt, 0 none; across the road −1…1; m to the nearer end; the half width for edge lines, 0 = none) —
 * asphalt / slabs / worn paint / dirt in world UVs, main roads' solid edge lines.
 * The weight uGr is 0 on Fast and above street level: the look there is unchanged. Chains a previous onBeforeCompile.
 */
export function groundMat(m) {
  if (m.userData.ground) return m;
  m.userData.ground = true;
  const prev = m.onBeforeCompile,
    key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => `ground|${key}`;
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    groundTex();
    Object.assign(sh.uniforms, GROUND_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 gk; varying vec4 vGk; varying vec3 vGkW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGk = gk; vGkW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform sampler2D tGround; uniform float uGr; varying vec4 vGk; varying vec3 vGkW;${GLSL_GROUND}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 gp = vGkW.xz;
          float f = grFade(gp), k = vGk.x, hw = vGk.w, o = abs(vGk.y) * hw, aa = max(fwidth(o), 1e-4); // (derivatives outside the branches)
          vec4 T = grTex(gp, ${GROUND.tile.asph.toFixed(1)}), P = grTex(gp, ${GROUND.tile.pave.toFixed(1)}), Q = grTex(gp, ${GROUND.tile.paint.toFixed(1)});
          float big = grTex(gp + 0.37, ${GROUND.tile.var.toFixed(1)}).r;
          vec3 c = diffuseColor.rgb, t = c;
          if (f > 0.001 && k > 0.5) {
          if (k < 1.5) {
            t = c * (0.55 + 0.9 * T.r) * (0.92 + 0.16 * big) * vec3(0.95, 0.97, 1.07);
            // main roads: solid edge lines (hw = the half width; 0 = none), clear of the junctions
            float lw = ${GROUND.edge.w.toFixed(2)}, e = ${GROUND.edge.in.toFixed(2)};
            if (hw > 0.0 && vGk.z > hw + ${GROUND.edge.end.toFixed(1)}) {
              float ln = smoothstep(e - aa, e, hw - o) * (1.0 - smoothstep(e + lw, e + lw + aa, hw - o));
              t = mix(t, vec3(0.93, 0.92, 0.86) * (0.8 + 0.4 * Q.a), ln);
            }
          } else if (k < 2.5) t = c * (0.6 + 0.8 * P.g);
          else if (k < 3.5) t = c * (0.7 + 0.6 * Q.a);
          else t = c * (0.7 + 0.6 * T.r) * (0.9 + 0.2 * big) * vec3(1.03, 1.0, 0.94);
          }
          diffuseColor.rgb = mix(c, t, f);
        }`
      );
  };
  return m;
}
/**
 * Street level's colour grade (spec §4.44, T-369) by time of day (wrapping): gain = × the lights, lift = added to the darks
 * (coloured shadows, not grey), sat / con = saturation and contrast, haze = the distance haze's colour (it replaces the grey
 * sky tint on every look). Applied after the tone mapping (display colours), weighted by street level.
 */
export const GRADE = (() => {
  const night = { gain: [0.8, 0.88, 1.1], lift: [0.004, 0.01, 0.035], sat: 0.95, con: 1.12, haze: '#22305a' },
    morning = { gain: [1.08, 1.0, 0.88], lift: [0.05, 0.03, 0.045], sat: 1.1, con: 1.03, haze: '#f1cfae' },
    noon = { gain: [1.0, 1.02, 1.04], lift: [0.01, 0.025, 0.05], sat: 1.16, con: 1.05, haze: '#bcdcf2' },
    dusk = { gain: [1.06, 0.95, 0.95], lift: [0.05, 0.02, 0.07], sat: 1.14, con: 1.04, haze: '#f2a28c' },
    glow = { gain: [0.98, 0.84, 1.0], lift: [0.03, 0.012, 0.055], sat: 1.04, con: 1.08, haze: '#86609a' };
  return [
    { t: 0.2, ...night },
    { t: 0.29, ...morning },
    { t: 0.45, ...noon },
    { t: 0.63, ...noon },
    { t: 0.74, ...dusk },
    { t: 0.8, ...glow },
    { t: 0.88, ...night }
  ];
})();
const GRADE_C = GRADE.map(g => ({
  t: g.t,
  gain: new THREE.Vector3(...g.gain),
  lift: new THREE.Vector3(...g.lift),
  sat: g.sat,
  con: g.con,
  haze: new THREE.Color(g.haze)
}));
/** The grade at time of day tod (0–1) into out { gain, lift (Vector3), sat, con, haze (Color) }. */
export function gradeAt(tod, out) {
  const K = GRADE_C;
  let i = K.findIndex(k => k.t > tod);
  if (i < 0) i = K.length;
  const A = K[(i - 1 + K.length) % K.length],
    B = K[i % K.length],
    span = (B.t - A.t + 1) % 1 || 1,
    u = smooth(0, 1, ((tod - A.t + 1) % 1) / span);
  out.gain.lerpVectors(A.gain, B.gain, u);
  out.lift.lerpVectors(A.lift, B.lift, u);
  out.sat = lerp(A.sat, B.sat, u);
  out.con = lerp(A.con, B.con, u);
  out.haze.copy(A.haze).lerp(B.haze, u);
  return out;
}
/**
 * Street level's painted sky (T-373, spec §4.44) by time of day (the grade's keys and times; wrapping): zen / hor = the gradient
 * (hor = the grade's haze: the skyline's haze meets it), cloud / shade = the clouds' lit and shaded tones, sun = the glow round
 * the sun, cover (0–1), star (the stars and the moon). Colours are the display intent before the tone mapping; `gain` × them.
 * Drawn as a sky dome (owner 2026-10-27: "add a sky render — it can be just an image"): one full-screen-at-most pass behind
 * everything (depth = the far plane: only the sky's own pixels are shaded), its colours the hour's keys blended each frame,
 * the clouds a tiling noise image drifting by UV offset (`drift`) — no cube camera, no bakes during play.
 */
export const PSKY = (() => {
  const night = { zen: '#070c26', hor: GRADE[0].haze, cloud: '#34406e', shade: '#161e40', sun: '#000000', cover: 0.36, star: 1 },
    morning = { zen: '#3f86d8', hor: GRADE[1].haze, cloud: '#fff3e4', shade: '#c4a8c0', sun: '#ffb27a', cover: 0.4, star: 0 },
    noon = { zen: '#1c66db', hor: GRADE[2].haze, cloud: '#ffffff', shade: '#a3bde6', sun: '#fff0d6', cover: 0.42, star: 0 },
    dusk = { zen: '#3a5aa6', hor: GRADE[4].haze, cloud: '#ffcaa0', shade: '#a2628c', sun: '#ff8448', cover: 0.42, star: 0 },
    glow = { zen: '#22245c', hor: GRADE[5].haze, cloud: '#d8869f', shade: '#4a376c', sun: '#c0506a', cover: 0.4, star: 0.35 };
  return {
    drift: 0.0008, // the clouds' drift (texture units a second of map time; continuous)
    gain: { day: 0.62, night: 0.3 }, // (night: the exposure rises with the lights — the sky stays dark)
    keys: [
      { t: GRADE[0].t, ...night },
      { t: GRADE[1].t, ...morning },
      { t: GRADE[2].t, ...noon },
      { t: GRADE[3].t, ...noon },
      { t: GRADE[4].t, ...dusk },
      { t: GRADE[5].t, ...glow },
      { t: GRADE[6].t, ...night }
    ]
  };
})();
const PSKY_C = PSKY.keys.map(k => ({
  t: k.t,
  ...Object.fromEntries(['zen', 'hor', 'cloud', 'shade', 'sun'].map(c => [c, new THREE.Color(k[c])])),
  cover: k.cover,
  star: k.star
}));
/** The painted sky at time of day tod into out { zen, hor, cloud, shade, sun (Color), cover, star }. */
export function paintAt(tod, out) {
  const K = PSKY_C;
  let i = K.findIndex(k => k.t > tod);
  if (i < 0) i = K.length;
  const A = K[(i - 1 + K.length) % K.length],
    B = K[i % K.length],
    span = (B.t - A.t + 1) % 1 || 1,
    u = smooth(0, 1, ((tod - A.t + 1) % 1) / span);
  for (const c of ['zen', 'hor', 'cloud', 'shade', 'sun']) out[c].copy(A[c]).lerp(B[c], u);
  out.cover = lerp(A.cover, B.cover, u);
  out.star = lerp(A.star, B.star, u);
  return out;
}
const PSKY_FRAG = `uniform vec3 uZen, uHor, uHaze, uCl, uSh, uSunC, uSun, uMoon; uniform float uCover, uStar; uniform vec2 uOff;
uniform sampler2D tCl; varying vec3 vDir;
float pkH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float pkD(vec2 p) { vec2 q = texture2D(tCl, p).rg; return q.r * 0.78 + q.g * 0.22; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y, up = clamp(h, 0.0, 1.0);
  vec3 c = mix(uZen, uHor, pow(1.0 - up, 3.2)); // the gradient: deep at the top, the haze's hue low down
  float sd = max(dot(d, uSun), 0.0);
  c += uSunC * (0.22 * pow(sd, 4.0) + 0.45 * pow(sd, 40.0)) * smoothstep(-0.12, 0.04, h);
  if (uStar > 0.0) { // stars and a painted moon
    vec3 sc = floor(d * 150.0), sf = fract(d * 150.0) - 0.5; // (drawn per pixel: a soft round dot in its cell, not a square)
    c += vec3(0.5, 0.55, 0.65) * uStar * step(0.998, pkH(sc)) * (0.35 + 0.65 * pkH(sc + 1.7)) * smoothstep(0.08, 0.35, h)
      * 1.4 * (1.0 - smoothstep(0.3, 0.5, length(sf)));
    float md = dot(d, uMoon);
    c += vec3(0.16, 0.2, 0.34) * uStar * pow(max(md, 0.0), 220.0);
    c = mix(c, vec3(0.92, 0.9, 0.78), uStar * smoothstep(0.99925, 0.9995, md));
  }
  if (h > 0.0) { // clouds on a plane overhead: a crisp painted edge, lit toward the sun, shaded in their thick middle
    vec2 p = d.xz / (h + 0.16) * 0.2 + uOff;
    float n = pkD(p), cov = n - (0.75 - 0.6 * uCover); // (the noise sits round 0.45: cover 0.4 ≈ a third of the sky)
    float a = smoothstep(0.0, 0.03, cov) * smoothstep(0.015, 0.16, h);
    float n2 = pkD(p + normalize(uSun.xz + vec2(1e-4)) * 0.02);
    float lt = smoothstep(-0.004, 0.004, n - n2);
    float body = smoothstep(0.04, 0.17, cov);
    vec3 cc = mix(uCl, uSh, body * (1.0 - 0.55 * lt));
    cc += uSunC * 0.35 * pow(sd, 3.0) * (1.0 - smoothstep(0.0, 0.07, cov));
    c = mix(c, cc, a);
  }
  c = mix(c, uHaze, smoothstep(0.07, -0.01, h)); // the skyline's haze
  gl_FragColor = vec4(c, 1.0);
}`;
/**
 * The post's one full-screen pass (owner 2026-10-26, a laptop GPU: the chain was OutputPass → grade → FXAA, three full-screen
 * passes and render-target copies, and the bloom's own full-size blend): `FinishShader` reads the HDR buffer (+ the bloom's
 * composite, added per tap — `uBloom`), tone maps (ACES) and encodes sRGB per tap, runs three's FXAA 3.11 over those taps
 * (`uAA`, a uniform branch: off = one tap) and grades the result (`uK`) — straight to the canvas. FXAA's edge search reads the
 * ungraded display colours (the grade is per pixel and near linear: the same look).
 */
const FX_BODY = (() => {
  const f = FXAAShader.fragmentShader,
    a = f.indexOf('#define NUM_SAMPLES'),
    b = f.indexOf('void main()');
  return a > 0 && b > a ? f.slice(a, b) : '';
})();
export const FinishShader = {
  name: 'FinishShader',
  defines: { ACES_FILMIC_TONE_MAPPING: '', SRGB_TRANSFER: '' },
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0 },
    toneMappingExposure: { value: 1 },
    resolution: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
    uAA: { value: 0 },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3() },
    uSat: { value: 1 },
    uCon: { value: 1 },
    uK: { value: 0 },
    uVs: { value: new THREE.Vector2(1, 1) }, // (the scene's viewport in its target: the dynamic resolution, no reallocation)
    uVc: { value: new THREE.Vector2(1, 1) } // (the last texel centre inside it: taps never read past the drawn part)
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `precision highp float;
  uniform sampler2D tDiffuse, tBloom; uniform vec2 resolution, uVs, uVc; uniform float uBloom, uAA, uSat, uCon, uK; uniform vec3 uGain, uLift;
  varying vec2 vUv;
  #include <tonemapping_pars_fragment>
  vec4 fsTap(vec2 p) {
    vec4 c = texture2D(tDiffuse, min(p * uVs, uVc));
    if (uBloom > 0.0) c.rgb += uBloom * texture2D(tBloom, p).rgb;
    #ifdef ACES_FILMIC_TONE_MAPPING
    c.rgb = ACESFilmicToneMapping(c.rgb);
    #endif
    #ifdef SRGB_TRANSFER
    c = sRGBTransferOETF(c);
    #endif
    return c;
  }
  #define FXAA_DISCARD 0
  #define FxaaTexTop(t, p) fsTap(p)
  #define FxaaTexOff(t, p, o, r) fsTap(p + (o * r))
  ${FX_BODY}
  void main() {
    vec4 c = uAA > 0.5 ? FxaaPixelShader(vUv, tDiffuse, resolution, 0.2, 5.0) : fsTap(vUv);
    if (uK > 0.0) {
      vec3 x = c.rgb;
      float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = x * uGain + uLift * (1.0 - l) * (1.0 - l);
      g = mix(vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), g, uSat);
      g = (g - 0.5) * uCon + 0.5;
      c.rgb = mix(x, clamp(g, 0.0, 1.0), uK);
    }
    gl_FragColor = c;
  }`
};
/**
 * Auto's adaptive quality (owner 2026-10-26: a Radeon 610M at street level, night — 51 ms): when the measured frame (the GPU's
 * time by timer query when the browser has one, else the frame interval) stays over `budget` ms for `down` s, one step down —
 * `steps` in order (bloom off, MSAA off where FXAA smooths, render scale toward `res`, the 1024 shadow map, props / grass reach ×
 * `reach`); under `up` ms for `back` s, one step back up. A step down within `bounce` s of a step up doubles `back` (≤ `backMax`):
 * no flicker between two steps. `dpr`: Auto's backing store at most this device pixel ratio. High and Fast don't step.
 */
export const AUTO = {
  budget: 30,
  up: 21,
  down: 1,
  back: 5,
  backMax: 40,
  bounce: 10,
  steps: ['bloom off', 'MSAA off', 'scale 0.65', 'scale 0.6', 'scale 0.55', 'shadow 1024', 'near reach'],
  res: [0.7, 0.65, 0.6, 0.55],
  shadow: 1024,
  reach: 0.6,
  dpr: 1.25,
  bloomMips: 3 // (Auto at street level: the bloom's mips — the 4th / 5th weigh ~0 there)
};
/**
 * The pixel ratio before the dynamic factor (pure, tested): the device's (≤ 2; Auto ≤ AUTO.dpr — a 1.5-dpr laptop draws 1.25), within
 * the setting's pixel budget Q.px3d (GFX, as in matches) for a w × h CSS-px canvas.
 */
export function basePixelRatio(dpr, gfx, w, h, Q) {
  const d = Math.min(dpr || 1, gfx === 'auto' ? AUTO.dpr : 2);
  return Q && Q.px3d ? d * Math.min(1, Math.sqrt(Q.px3d / Math.max(1, w * h * d * d))) : d;
}
/**
 * The scaled viewport (pure, tested): a W × H target drawn at factor k → { w, h (px drawn), u, v (their share of the target), k }.
 */
export function viewScale(W, H, k) {
  const w = Math.max(1, Math.min(W, Math.round(W * k))),
    h = Math.max(1, Math.min(H, Math.round(H * k)));
  return { w, h, u: w / W, v: h / H, k: Math.min(1, k) };
}
/** The dynamic factor now drawn (the scene's pixels per canvas pixel): screen-size shaders (the night layer's points) × it. */
export const VIEW_PX = { k: 1 };
/**
 * One second's step of the dynamic resolution (pure, tested): ms = the measured frame (GPU ms when timed); down 0.05 after
 * `downN` slow ticks in a row (dire: 0.15 at once), up 0.05 after `upN` quick ones; never under `floor`. S keeps the counts.
 */
export function resStep(S, ms, floor, dire, D = LOOK.dyn) {
  let r = S.res;
  if (ms > D.slow) ((S.upC = 0), (S.downC = (S.downC || 0) + 1));
  else if (ms < D.quick) ((S.downC = 0), (S.upC = (S.upC || 0) + 1));
  else S.downC = S.upC = 0;
  if (r > floor && (dire || S.downC >= D.downN)) ((r = Math.max(floor, +(r - (dire ? 0.15 : 0.05)).toFixed(2))), (S.downC = 0));
  else if (r < 1 && S.upC >= D.upN) ((r = Math.min(1, +(r + 0.05).toFixed(2))), (S.upC = 0));
  return Math.max(r, floor);
}
/**
 * Shadow-map updates (pacing, owner 2026-10-27): the map is re-drawn only when it would change — the sun turned `sun` rad, the
 * shadow camera moved (its target snapped to whole shadow texels, so a walk moves it in texel steps and the edges don't swim),
 * its box or map size changed, a shadow caster moved / showed / hid / was re-meshed (look's caster scan), `dirty` was set from
 * outside, or `max` s passed. `n` = updates / skips so far (the perf numbers). The perf probe's timed draws always update.
 */
export const SHADOW_GATE = { dirty: true, sun: 0.002, max: 2, scan: 0.5, n: { upd: 0, skip: 0 } };
/** Due (pure, tested): G the gate, L the last update's { dir, tgt, box, size, sig, age }, c this frame's (age = s since). */
export function shadowDue(G, L, c) {
  if (G.dirty || !L) return true;
  if (c.age >= G.max || c.box !== L.box || c.size !== L.size || c.sig !== L.sig) return true;
  if (c.tgt[0] !== L.tgt[0] || c.tgt[1] !== L.tgt[1] || c.tgt[2] !== L.tgt[2]) return true;
  const d = c.dir,
    e = L.dir;
  return Math.hypot(d[0] - e[0], d[1] - e[1], d[2] - e[2]) > G.sun;
}
/**
 * The shadow camera's target snapped to whole texels in the light's own frame (pure, tested): t (Vector3, changed in place) on
 * the plane across the light direction L (unit, sun − target) rounded to `texel` m on its right / up axes (three's lookAt basis),
 * and to `along` m along L (an orthographic map: that moves only its depth range).
 */
export function snapTarget(t, L, texel, along = 1) {
  let rx = L.z,
    rz = -L.x; // (right = up × L, up = +y; up' = L × right below)
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const vx = L.y * rz,
    vy = L.z * rx - L.x * rz,
    vz = -L.y * rx,
    vl = Math.hypot(vx, vy, vz) || 1,
    a = t.x * rx + t.z * rz,
    b = (t.x * vx + t.y * vy + t.z * vz) / vl,
    c = t.x * L.x + t.y * L.y + t.z * L.z,
    da = Math.round(a / texel) * texel - a,
    db = Math.round(b / texel) * texel - b,
    dc = Math.round(c / along) * along - c; // (along the light: only the depth range moves — coarse steps)
  t.x += rx * da + (vx / vl) * db + L.x * dc;
  t.y += (vy / vl) * db + L.y * dc;
  t.z += rz * da + (vz / vl) * db + L.z * dc;
  return t;
}
/** A fresh ladder state. */
export const autoState = () => ({ step: 0, over: 0, under: 0, back: AUTO.back, t: 0, upAt: -1e9 });
/** One tick (dt s, ms = the measured frame) of the ladder (pure, tested): returns the step (0 … AUTO.steps.length). */
export function autoStep(A, ms, dt) {
  const n = AUTO.steps.length;
  A.t += dt;
  if (ms > AUTO.budget) {
    A.under = 0;
    A.over += dt;
    if (A.over >= AUTO.down && A.step < n) {
      A.step++;
      A.over = 0;
      if (A.t - A.upAt < AUTO.bounce) A.back = Math.min(AUTO.backMax, A.back * 2); // (a bounce: wait longer before the next try)
    }
  } else if (ms < AUTO.up) {
    A.over = 0;
    A.under += dt;
    if (A.under >= A.back && A.step > 0) (A.step--, (A.under = 0), (A.upAt = A.t));
  } else A.over = A.under = 0; // (in the band: hold)
  return A.step;
}
/** The ladder's step as words (the F3 overlay and the report). */
export const autoLabel = step => (step ? `step ${step}: ${AUTO.steps.slice(0, step).join(', ')}` : 'step 0: full');
/**
 * The post for a frame (pure, tested) on the detailed look: { bloom, mips, aa, grade, msaa } — the bloom only while the night
 * lights are on (lit) and Auto's ladder allows it (fewer mips on Auto at street level: `AUTO.bloomMips`), FXAA at street level,
 * the grade from st 0.15, the scene's MSAA off on Auto's step 2+ where FXAA smooths. One full-size pass after the scene either way.
 */
export function postPlan({ gfx, st = 0, lit = 0, sg = 0, step = 0 }) {
  const Q = autoAt(gfx === 'auto' ? step : 0),
    aa = st > 0.3;
  return {
    bloom: lit > 0.02 && Q.bloom,
    mips: gfx === 'auto' && sg > 0.5 ? AUTO.bloomMips : 5,
    aa,
    grade: smooth(0.15, 0.8, st) > 0.001,
    msaa: gfx === 'auto' && !Q.msaa && aa ? 0 : LOOK.samples
  };
}
/** What the step means (pure): bloom, msaa (allowed), the render-scale floor, the shadow map, the props / grass reach. */
export const autoAt = step => ({
  bloom: step < 1,
  msaa: step < 2,
  floor: AUTO.res[Math.max(0, Math.min(AUTO.res.length - 1, step - 2))],
  shadow: step >= 6 ? AUTO.shadow : 0,
  reach: step >= 7 ? AUTO.reach : 1
});
/**
 * Street level's material finish (T-369), shared uniforms: the toon bands on the sun's light (uFdToon 0–1: 0 = today's smooth
 * light) and the occluder fade (uFdA = the camera, uFdB = your middle, uFdK 0–1): what lies near the camera → you line (not the
 * last metre by you) dissolves by a coarse 8 × 8 ordered dither (2-px cells) to a faint ghost; what is right at the lens goes
 * outright — fragments within `FD.lens` m, and a whole instance (tree, filler block, tuft) whose box comes within `FD.inst` m of the
 * camera (no screen-wide screen door). Props (`userData.fdWhole`, props3d's solid kinds) never dissolve: an instance is dropped
 * whole at the lens or when its box comes within `whole.r` m of the line (short of its last `whole.end` m) — a scooter at your feet
 * stays whole. No transparency, no sorting, no CPU rays.
 */
export const FD = { lens: 1.0, inst: 1.4, ghost: 0.15, cell: 2, r: [1.1, 0.6], near: [0.35, 0.3], whole: { r: 0.2, end: 1.3 } };
export const STREET_FX = {
  uFdA: { value: new THREE.Vector3() },
  uFdB: { value: new THREE.Vector3() },
  uFdK: { value: 0 },
  uFdToon: { value: 0 },
  uFdGlow: { value: 1 } // (T-373) × every emissive at street level at dusk / night (Auto / High): the lit panes and signs bloom
};
/**
 * The occluder fade's gate (owner 2026-10-26: 3.65 ms on a laptop GPU — every patched draw paid the per-fragment test and the
 * instances' box test): map3d sets `k` (the eased fade weight; the probe's "occluder fade" item swaps it). Each patched material's
 * onBeforeRender (fdGate) gives uFdK = k only to an object whose bounds (its geometry's / the instances' sphere, in the world) come
 * within `R` m of the camera → you segment (uFdA → uFdB) — the rest draw with uFdK = 0: the shader's coherent early-out (no test,
 * no discard). An object that isn't frustum culled (bounds not kept) always gets it. `n` = this frame's { on, off } draws.
 */
export const FD_GATE = { k: 0, R: 1.6, n: { on: 0, off: 0 }, last: null };
const _fgS = new THREE.Sphere(),
  _fgV = new THREE.Vector3(),
  _fgW = new THREE.Vector3();
/** An object's world bounds within R of the segment a → b (pure maths; the test the gate runs per draw). */
export function fdNear(o, a, b, R = FD_GATE.R) {
  if (!o || o.frustumCulled === false) return true;
  let s = null;
  if (o.isInstancedMesh || o.isBatchedMesh) {
    if (!o.boundingSphere) o.computeBoundingSphere();
    s = o.boundingSphere;
  } else if (o.geometry) {
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    s = o.geometry.boundingSphere;
  }
  if (!s || !(s.radius >= 0)) return true;
  _fgS.copy(s);
  if (o.matrixWorld) _fgS.applyMatrix4(o.matrixWorld);
  _fgV.subVectors(b, a);
  const L2 = _fgV.lengthSq(),
    t = L2 > 1e-8 ? Math.max(0, Math.min(1, _fgW.subVectors(_fgS.center, a).dot(_fgV) / L2)) : 0;
  return _fgW.copy(a).addScaledVector(_fgV, t).distanceTo(_fgS.center) < _fgS.radius + R;
}
/** Before each draw of a patched material: its uFdK (the shared uniform) for this object; same material again → re-upload. */
function fdGate(renderer, m, o) {
  const G = FD_GATE,
    on = G.k > 0 && fdNear(o, STREET_FX.uFdA.value, STREET_FX.uFdB.value),
    v = on ? G.k : 0;
  if (G.k > 0) G.n[on ? 'on' : 'off']++;
  if (STREET_FX.uFdK.value !== v) {
    STREET_FX.uFdK.value = v;
    // (three uploads a material's uniforms only when the material or program changes: the same material drawn again with a new
    // value forces it — no program bound → the next setProgram binds it and refreshes every uniform; cached values skip the rest)
    if (G.last === m && renderer && renderer.state) renderer.state.useProgram(null);
  }
  G.last = m;
}
/** Street level's weight on Auto / High (0 on Fast and on the map) — the night layer's lamp glows and pools read it (T-373). */
export const STREET_U = { st: { value: 0 } };
/**
 * Dusk and night at street level (T-373, spec §4.44): selective bloom — the emissives (lit panes, signs, rooms behind the glass,
 * the far windows; uFdGlow) are lifted to ~`k` in the HDR buffer, the lamp heads by the night layer, and the bloom threshold sits
 * at `thr`, above any lit surface (diffuse ≤ ~0.8), so only the lights bloom. `lit` = when the lights reach full glow (dusk → night).
 * Polish (2026-10-26): `k` modest and the bloom tight (`mips`: the wide mips nearly off, `radius` 0) so lit panes read as crisp windows
 * with a small halo, not hazy blobs; the night exposure at street level `exposure` (dark-blue night, readable silhouettes).
 */
export const GLOW = {
  k: 1.6,
  lit: [0.02, 0.45],
  thr: 1.15,
  strength: 0.45,
  radius: 0,
  mips: [1, 0.5, 0.18, 0.05, 0], // (polish 2026-10-26) the bloom's mip weights at street level: a tight halo, no screen-wide haze
  exposure: 1.3, // the night exposure at street level (the map's LOOK.exposure[1] lifts the whole scene: milky)
  hemi: 1.15 // the night sky light at street level (× the clock's hemisphere; the map's LOOK.hemi[1] floods the ground blue)
};
const MIPS0 = [1.0, 0.8, 0.6, 0.4, 0.2]; // (UnrealBloomPass's own)
const FD_LIGHT = ['lights_physical_pars_fragment', 'lights_lambert_pars_fragment', 'lights_phong_pars_fragment'];
const FD_DIR = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )',
  FD_RECT = '#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
const FD_DOTNL = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const fdDone = new WeakSet();
/** Patch a built-in mesh material (once; before its first compile) with the toon bands and the occluder fade. Others: false. */
export function streetMat(m) {
  if (!m || fdDone.has(m)) return false;
  fdDone.add(m);
  if (m.isShaderMaterial || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial))
    return false;
  if (m.userData && m.userData.noStreetFx) return false;
  // the instances' local box (map3d fxBox: the union over the instanced meshes using m; empty = never hidden whole)
  const whole = !!m.userData.fdWhole; // (props: dropped whole, never dissolved)
  const box = (m.userData.fdBox = { lo: { value: new THREE.Vector3(1e9, 1e9, 1e9) }, hi: { value: new THREE.Vector3(-1e9, -1e9, -1e9) } });
  const prev = m.onBeforeCompile,
    hadKey = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey'),
    prevKey = hadKey ? m.customProgramCacheKey : null,
    src = prev.toString();
  m.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    Object.assign(sh.uniforms, STREET_FX, { uFdLo: box.lo, uFdHi: box.hi });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFdW; uniform vec3 uFdA, uFdB, uFdLo, uFdHi; uniform float uFdK;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        { vec4 fw = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
          fw = batchingMatrix * fw;
          #endif
          #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
          if (uFdK > 0.0) { mat4 im = modelMatrix * instanceMatrix; mat3 rm = mat3(im);
          // (2026-10-26, a laptop GPU: the box tests only for an instance whose bounding ball reaches the camera → you segment)
          vec3 fsab = uFdB - uFdA, fio = im[3].xyz - uFdA;
          if (length(fio - fsab * clamp(dot(fio, fsab) / max(dot(fsab, fsab), 1e-4), 0.0, 1.0)) <
              max(length(rm[0]), max(length(rm[1]), length(rm[2]))) * length(max(abs(uFdLo), abs(uFdHi))) + ${FD_GATE.R.toFixed(2)}) { // an instance at the lens goes whole: the camera's distance to its box (fdHide)
            vec3 lc = inverse(rm) * (uFdA - im[3].xyz);
            vec3 dq = max(abs(lc - 0.5 * (uFdLo + uFdHi)) - 0.5 * (uFdHi - uFdLo), 0.0);
            if (length(rm * dq) < ${FD.inst.toFixed(2)} * uFdK) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);${
              whole
                ? `
            // (a prop: never dithered — dropped whole when it stands across the camera → you line, short of your last metre)
            // (the line's point nearest the box centre, short of your last metre; props are small: one box test)
            vec3 lb = inverse(rm) * (uFdB - im[3].xyz), lab = lb - lc, bc = 0.5 * (uFdLo + uFdHi);
            float lL = length(rm * lab), lt = max(0.0, 1.0 - ${FD.whole.end.toFixed(2)} / max(lL, 0.01));
            float tq = clamp(dot(bc - lc, lab) / max(dot(lab, lab), 1e-4), 0.0, lt);
            vec3 q = max(abs(lc + lab * tq - bc) - 0.5 * (uFdHi - uFdLo), 0.0);
            if (length(rm * q) < ${FD.whole.r.toFixed(2)} * uFdK) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`
                : ''
            }
          } }
          #endif
          vFdW = (modelMatrix * fw).xyz; }`
      );
    let f = sh.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vFdW; uniform vec3 uFdA, uFdB; uniform float uFdK, uFdToon, uFdGlow; float fdDir;
      float fdB2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float fdB8(vec2 a) { return (fdB2(0.25 * a) * 0.25 + fdB2(0.5 * a)) * 0.25 + fdB2(a); }
      float fdBand(float x) { return mix(x, 0.55 * smoothstep(0.0, 0.08, x) + 0.45 * smoothstep(0.38, 0.46, x), uFdToon * fdDir); }`
    );
    // (the bands on the sun / moon only: the lamps' point lights keep their smooth fall-off)
    if (f.includes('#include <lights_fragment_begin>'))
      f = f.replace(
        '#include <lights_fragment_begin>',
        'fdDir = 0.0;\n' +
          THREE.ShaderChunk.lights_fragment_begin.replace(FD_DIR, `${FD_DIR}\n\tfdDir = 1.0;`).replace(FD_RECT, `fdDir = 0.0;\n${FD_RECT}`)
      );
    for (const c of FD_LIGHT)
      if (f.includes(`#include <${c}>`))
        f = f.replace(
          `#include <${c}>`,
          THREE.ShaderChunk[c].replace(FD_DOTNL, 'float dotNL = fdBand( saturate( dot( geometryNormal, directLight.direction ) ) );')
        );
    // (T-373: the emissive lifted for the selective bloom; after the lights, before the sum)
    if (f.includes('totalEmissiveRadiance') && f.includes('#include <aomap_fragment>'))
      f = f.replace('#include <aomap_fragment>', 'totalEmissiveRadiance *= uFdGlow;\n#include <aomap_fragment>');
    sh.fragmentShader = f.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      vec3 ab = uFdB - uFdA, aw = vFdW - uFdA;
      float L = max(length(ab), 0.01);
      if (uFdK > 0.0 && dot(aw, aw) < (L + 1.2) * (L + 1.2)) { // (2026-10-26: beyond you + the fade's radius nothing fades — one dot product)
        if (length(aw) < ${FD.lens.toFixed(2)} * uFdK) discard; // right at the lens: gone, not dithered
        float a = dot(aw, ab) / L;
        float d = length(aw - ab * (a / L));
        float r = min(${FD.near[0].toFixed(2)} + ${FD.near[1].toFixed(2)} * max(a, 0.0), mix(${FD.r[0].toFixed(2)}, ${FD.r[1].toFixed(2)}, clamp(a / L, 0.0, 1.0)));
        float fd = (1.0 - smoothstep(r * 0.55, r, d)) * step(0.0, a) * (1.0 - smoothstep(L - 1.3, L - 0.7, a));
        if (${whole ? 'false && ' : ''}fd * uFdK * ${(1 - FD.ghost).toFixed(2)} > fdB8(gl_FragCoord.xy / ${FD.cell.toFixed(1)}) + 0.008) discard;
      }`
    );
  };
  m.customProgramCacheKey = () => (hadKey ? prevKey.call(m) : src) + (whole ? '|sfxw' : '|sfx');
  const obr = m.onBeforeRender;
  m.onBeforeRender = function (r, sc, cam, g, o, grp) {
    obr.call(this, r, sc, cam, g, o, grp);
    fdGate(r, this, o);
  };
  return true;
}
/** The map's renderer context for warming figures before they show (players3d warmVRM): set by richLook, cleared on dispose. */
export const LOOK_CTX = { renderer: null, scene: null, cam: null, target: null };
export function richLook(renderer, scene, cam, sun) {
  const U = { t: { value: 0 } }; // shared time uniform (s)
  let tex = null; // made on first use (the detailed look only)
  const textures = () => {
    if (!tex) {
      tex = lookTextures(LOOK.detail);
      U.det = { value: tex.det };
      U.wave = { value: tex.wave };
    }
    return tex;
  };
  // ---- terrain: the vertex colours × ground detail
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  terrainMat.onBeforeCompile = sh => {
    textures();
    groundTex();
    Object.assign(sh.uniforms, { tDet: U.det }, GROUND_U);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 gnd; attribute vec2 gdir; attribute float gpav; attribute vec3 nsm; varying vec4 vGnd; varying vec2 vGdir; varying float vPav;
        varying vec3 vWp; varying vec3 vWn; varying vec3 vNsm;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGnd = gnd; vGdir = gdir; vPav = gpav; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);
        vNsm = normalMatrix * nsm;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDet; varying vec4 vGnd; varying vec2 vGdir; varying float vPav; varying vec3 vWp; varying vec3 vWn;
        uniform sampler2D tGround; uniform float uGr; uniform vec2 uGrD; varying vec3 vNsm;
        float lkH; float lkWet; float lkG; ${GLSL_BUMP}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 gp = vWp.xz;
          vec4 d1 = texture2D(tDet, gp / 5.0), d2 = texture2D(tDet, gp / 23.0 + 0.37);
          float big = texture2D(tDet, gp / 170.0 + 0.11).g;
          float sS = vGnd.x, sF = vGnd.z, sW = vGnd.w, sP = vPav;
          float steep = smoothstep(0.3, 0.6, 1.0 - normalize(vWn).y) * (1.0 - sW) * (1.0 - sS);
          float sR = max(vGnd.y, steep);
          float sG = max(0.0, 1.0 - sS - sR - sF - sW - sP);
          float tot = sG + sS + sR + sF + sW + sP + 1e-4;
          vec3 base = diffuseColor.rgb;
          vec3 g = base * (0.72 + 0.52 * d1.r) * (0.9 + 0.2 * d2.g);
          g = mix(g, g * vec3(1.2, 1.1, 0.68), smoothstep(0.5, 0.85, d2.g) * 0.5);
          // street level (T-370): painted grass near you — blade strokes in three bands, cool shade / sunlit warm patches
          #ifndef LK_FAR
          float gD = 1.0 - smoothstep(uGrD.x, uGrD.y, distance(vWp, cameraPosition)); // (Auto: gone by uGrD.y m — the far chunks' material)
          float gf = uGr * gD * (1.0 - smoothstep(0.05, 0.35, length(fwidth(gp))));
          float gs = texture2D(tGround, gp / ${GROUND.tile.grass.toFixed(1)}).b, gv = texture2D(tGround, gp / ${GROUND.tile.var.toFixed(1)} + 0.5).b;
          float gw2 = texture2D(tGround, gp / 41.0 + 0.21).b;
          vec3 gpn = base * (0.66 + 0.68 * gs) * (0.84 + 0.32 * smoothstep(0.3, 0.7, gw2));
          gpn = mix(gpn * vec3(0.84, 0.94, 1.14), gpn * vec3(1.14, 1.08, 0.76), smoothstep(0.36, 0.64, gv));
          g = mix(g, gpn, gf);
          lkG = uGr * gD * (1.0 - smoothstep(0.08, 0.6, length(fwidth(gp)))); // (the smooth normals' weight: near the camera)
          #else
          lkG = 0.0;
          #endif
          float rip = texture2D(tDet, vec2(gp.x + gp.y * 0.35, gp.y - gp.x * 0.25) / 9.0).b;
          vec3 sa = base * (0.9 + 0.1 * rip + 0.16 * (d1.r - 0.5));
          vec3 ro = mix(base, vec3(0.2, 0.19, 0.165), steep) * (0.78 + 0.22 * d2.a) * (0.8 + 0.4 * d1.r);
          // paving: 3 m slabs, a tone per slab (hash), dark joints, a little grain
          vec2 sl = gp / 3.0, sc = floor(sl), sf = fract(sl);
          // (far off — metres a pixel, px — the joints, slabs and rows fade to their mean: no moiré on the zoomed-out island, T-350)
          float px = length(fwidth(gp));
          float joint = mix(smoothstep(0.0, 0.05, min(min(sf.x, sf.y), min(1.0 - sf.x, 1.0 - sf.y))), 0.93, smoothstep(0.15, 0.6, px));
          float slab = mix(fract(sin(dot(sc, vec2(12.9898, 78.233))) * 43758.5453), 0.5, smoothstep(0.8, 2.5, px));
          vec3 pv = base * (0.9 + 0.14 * slab + 0.1 * (d1.r - 0.5)) * (0.72 + 0.28 * joint) * (0.92 + 0.16 * d2.g);
          float rs = length(vGdir) > 0.5 ? dot(gp, normalize(vGdir)) : vWp.y * 2.2;
          float row = mix(smoothstep(0.2, 0.7, 0.5 + 0.5 * sin(rs * 3.927)), 0.5, smoothstep(0.25, 0.8, px));
          vec3 fi = mix(vec3(0.15, 0.095, 0.05) * (0.7 + 0.6 * d1.r), base * (0.75 + 0.5 * d1.r), row);
          vec3 we = base * (0.7 + 0.1 * d2.g);
          diffuseColor.rgb = (sG * g + sS * sa + sR * ro + sF * fi + sW * we + sP * pv) / tot * (0.86 + 0.28 * big);
          lkH = (sG * d1.r * 0.5 + sS * rip * 0.35 + sR * (d2.a + d1.r) * 0.6 + sF * row * 0.8 + sP * joint * 0.5) / tot;
          lkWet = sW / tot * (1.0 - 0.6 * sF / tot);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.1, lkWet);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        #ifndef LK_FAR
        normal = normalize(mix(normal, normalize(vNsm), lkG)); // (T-370: street level's smooth slopes)
        #endif
        normal = lkBump(-vViewPosition, normal, vec2(dFdx(lkH), dFdy(lkH)) * 0.07 * (1.0 - lkWet));`
      );
  };
  // (the far chunks' terrain: the same shader without the near-only painted grass and smooth normals — TERRAIN_LOD)
  const terrainFar = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  terrainFar.defines = { LK_FAR: '' };
  terrainFar.onBeforeCompile = terrainMat.onBeforeCompile;
  terrainFar.userData.noStreetFx = true;
  // ---- the sea
  const SEA = LOOK.sea,
    seaMat = new THREE.MeshStandardMaterial({ color: SEA.deep, roughness: 0.07, metalness: 0 }),
    shoreU = { tShore: { value: null }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
  seaMat.onBeforeCompile = sh => {
    textures();
    Object.assign(sh.uniforms, shoreU, {
      tDet: U.det,
      tWave: U.wave,
      uT: U.t,
      uDeep: { value: new THREE.Color(SEA.deep) },
      uMid: { value: new THREE.Color(SEA.mid) },
      uShallow: { value: new THREE.Color(SEA.shallow) },
      uFoam: { value: new THREE.Color(SEA.foam) }
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDet, tWave, tShore; uniform vec4 uBox; uniform float uT; uniform vec3 uDeep, uMid, uShallow, uFoam;
        varying vec3 vWp; float lkFoam;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 sp = (vWp.xz - uBox.xy) * uBox.zw;
          vec4 sh = (sp.x < 0.0 || sp.y < 0.0 || sp.x > 1.0 || sp.y > 1.0) ? vec4(0.0, 1.0, 0.0, 1.0) : texture2D(tShore, sp);
          float depth = max(0.0, 6.0 - sh.r * 8.0), off = sh.g;
          vec3 wc = mix(uShallow, uMid, smoothstep(0.2, 3.0, depth));
          wc = mix(wc, uDeep, smoothstep(0.15, 1.0, off));
          float fz = texture2D(tDet, vWp.xz / 7.0 + vec2(uT * 0.031, -uT * 0.017)).r;
          float edge = smoothstep(0.7, 0.05, depth) * (0.45 + 0.75 * fz);
          float band = smoothstep(0.75, 1.0, sin(depth * 4.5 + uT * 1.4 + fz * 5.0)) * smoothstep(2.2, 0.3, depth);
          lkFoam = clamp(max(edge, band * 0.7 * fz * 1.6), 0.0, 1.0);
          diffuseColor.rgb = mix(wc, uFoam, lkFoam);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, lkFoam);'
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 n1 = texture2D(tWave, vWp.xz / 19.0 + uT * vec2(0.012, 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(tWave, vWp.xz / 7.3 - uT * vec2(0.009, 0.015)).xyz * 2.0 - 1.0;
          vec2 s = (n1.xy + n2.xy) * ${SEA.wave.toFixed(2)} * (1.0 - 0.7 * lkFoam);
          normal = normalize((viewMatrix * vec4(normalize(vec3(s.x, 1.0, s.y)), 0.0)).xyz);
        }`
      );
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), seaMat);
  sea.receiveShadow = true;
  sea.visible = false;
  scene.add(sea);
  // ---- the sky (environment light and reflections): three's Sky into a cube target made once, one face a frame, then one PMREM
  // pass into the same env target (pacing 2026-10-27: fromScene allocated a new target every bake and drew six faces at once)
  const sky = new Sky(),
    skyScene = new THREE.Scene(),
    pmrem = new THREE.PMREMGenerator(renderer),
    envDir = new THREE.Vector3(0, -1, 0),
    envCube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false }),
    envCam = new THREE.CubeCamera(1, 400, envCube);
  sky.material.fragmentShader = sky.material.fragmentShader.replace('vSunE * 19000.0', 'vSunE * 0.0'); // no sun disc: the light is the sun
  sky.scale.setScalar(100);
  sky.material.uniforms.turbidity.value = LOOK.sky.turbidity;
  sky.material.uniforms.rayleigh.value = LOOK.sky.rayleigh;
  sky.material.uniforms.mieCoefficient.value = LOOK.sky.mie;
  sky.material.uniforms.mieDirectionalG.value = LOOK.sky.g;
  skyScene.add(sky, envCam);
  envCam.updateMatrixWorld();
  let envRT = null,
    envAge = 99,
    envFace = 6, // (< 6: a bake in progress, the next face to draw)
    envBakes = 0;
  const envFaces = n => {
    const C = envCam;
    if (C.coordinateSystem !== renderer.coordinateSystem) ((C.coordinateSystem = renderer.coordinateSystem), C.updateCoordinateSystem());
    const rt0 = renderer.getRenderTarget(),
      f0 = renderer.getActiveCubeFace(),
      m0 = renderer.getActiveMipmapLevel();
    for (const last = Math.min(6, envFace + n); envFace < last; envFace++) {
      renderer.setRenderTarget(envCube, envFace);
      renderer.render(skyScene, C.children[envFace]);
    }
    renderer.setRenderTarget(rt0, f0, m0);
    if (envFace < 6) return;
    envRT = pmrem.fromCubemap(envCube.texture, envRT); // (the same target after the first: no allocation)
    envBakes++;
    if (on) scene.environment = envRT.texture;
  };
  const bakeSky = (dt, dir) => {
    envAge += dt;
    if (envFace < 6) return envFaces(1);
    if (envRT && (envAge < LOOK.sky.every || dir.distanceTo(envDir) < LOOK.sky.moved)) return;
    sky.material.uniforms.sunPosition.value.copy(dir);
    envDir.copy(dir);
    envAge = 0;
    envFace = 0;
    envFaces(envRT ? 1 : 6); // (the first bake at once; later ones a face a frame — the sun moved a few game minutes)
  };
  // ---- street level's painted sky (T-373; a dome since 2026-10-27): the gradient and clouds by the hour, drawn behind everything
  const P = { zen: new THREE.Color(), hor: new THREE.Color(), cloud: new THREE.Color(), shade: new THREE.Color(), sun: new THREE.Color() };
  let pk = null; // { mesh, mat, tex, ms } once street level first shows it
  const paintMake = () => {
    const n = 256,
      a = tileNoise(n, 5, 5, 21, 0.5),
      b = tileNoise(n, 14, 3, 22, 0.5),
      bytes = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) bytes.set([a[i] * 255, b[i] * 255, 0, 255], i * 4);
    const tex = dataTex(bytes, n),
      mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, // (seen from inside)
        depthWrite: false,
        depthTest: true, // (at the far plane: only the pixels nothing else covered are shaded)
        uniforms: {
          ...Object.fromEntries(
            ['uZen', 'uHor', 'uHaze', 'uCl', 'uSh', 'uSunC', 'uSun', 'uMoon'].map(k => [k, { value: new THREE.Vector3() }])
          ),
          uCover: { value: 0.4 },
          uStar: { value: 0 },
          uOff: { value: new THREE.Vector2() },
          tCl: { value: tex }
        },
        vertexShader:
          'varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0); gl_Position = vec4(p.xy, p.w * 0.999999, p.w); }', // (just inside the far plane: behind everything, never clipped)
        fragmentShader: PSKY_FRAG
      }),
      mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    mat.userData.noStreetFx = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1e9; // (the last opaque draw: depth-tested against the scene)
    mesh.userData.shared = true;
    mesh.visible = false;
    // (AO's normal / depth pass draws the scene with an override material: the sky stays out of it)
    mesh.onBeforeRender = (r, sc, c, g) => g.setDrawRange(0, sc.overrideMaterial ? 0 : Infinity);
    scene.add(mesh);
    initTex(tex);
    return { mesh, mat, tex, ms: 0 };
  };
  /** Street level's sky each frame (Auto / High): the hour's colours (paintAt) and the clouds' drift — uniforms only. */
  const paintStep = (dt, tod, sunDir, lit) => {
    if (!pk) pk = paintMake();
    const u = pk.mat.uniforms,
      g = lerp(PSKY.gain.day, PSKY.gain.night, lit),
      v3 = (k, c, s = g) => u[k].value.set(c.r * s, c.g * s, c.b * s),
      fog = scene.fog ? scene.fog.color : null;
    paintAt(tod, P);
    v3('uZen', P.zen);
    v3('uHor', P.hor);
    v3('uCl', P.cloud);
    v3('uSh', P.shade);
    v3('uSunC', P.sun);
    if (fog) u.uHaze.value.set(fog.r, fog.g, fog.b);
    else u.uHaze.value.set(P.hor.r, P.hor.g, P.hor.b);
    u.uSun.value.copy(sunDir);
    u.uMoon.value.copy(SKY.moon);
    u.uCover.value = P.cover;
    u.uStar.value = P.star;
    u.uOff.value.x = (u.uOff.value.x + dt * PSKY.drift) % 64;
    u.uOff.value.y = (u.uOff.value.y + dt * PSKY.drift * 0.35) % 64;
  };
  /** Upload a code-made texture now (load time), not in the frame that first draws it. */
  const initTex = t => {
    try {
      if (renderer.initTexture) renderer.initTexture(t);
    } catch (e) {
      /* (uploaded on first use as before) */
    }
  };
  let paintOn = false;
  // ---- post (owner 2026-10-26, one pass): render → (GTAO) → bloom (its mips only) → Finish (tone map + sRGB + FXAA + grade + the
  // bloom added) straight to the canvas. grade / fxaa are the Finish pass's switches (the probe swaps `enabled`).
  let composer = null,
    bloom = null,
    finish = null,
    gtao = null,
    gtaoWant = false,
    gtaoLoading = false,
    on = false,
    ready = false,
    hi = false,
    w = 1,
    h = 1,
    pr = 1,
    gradeK = 0,
    msaa = LOOK.samples;
  const grade = { enabled: false },
    fxaa = { enabled: false };
  const dyn = { res: 1, ema: 16.7, t: 0, last: 0, shed: 0, quick: 0, gfx: 'auto', A: autoState(), gpu: null };
  const basePR = () => basePixelRatio(devicePixelRatio || 1, dyn.gfx, w, h, typeof GFX !== 'undefined' && GFX[dyn.gfx]);
  /** The bloom without its full-size additive blend (the Finish pass adds the composite) and with `useMips` of its mips. */
  function bloomRender(r, writeBuffer, readBuffer) {
    r.getClearColor(this._oldClearColor);
    const oa = r.getClearAlpha(),
      ac = r.autoClear;
    r.autoClear = false;
    r.setClearColor(this.clearColor, 0);
    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this.fsQuad.material = this.materialHighPassFilter;
    r.setRenderTarget(this.renderTargetBright);
    r.clear();
    this.fsQuad.render(r);
    let inp = this.renderTargetBright;
    for (let i = 0; i < Math.min(this.nMips, this.useMips || this.nMips); i++) {
      const M = this.separableBlurMaterials[i];
      this.fsQuad.material = M;
      M.uniforms.colorTexture.value = inp.texture;
      M.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      r.setRenderTarget(this.renderTargetsHorizontal[i]);
      r.clear();
      this.fsQuad.render(r);
      M.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      M.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      r.setRenderTarget(this.renderTargetsVertical[i]);
      r.clear();
      this.fsQuad.render(r);
      inp = this.renderTargetsVertical[i];
    }
    this.fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    r.setRenderTarget(this.renderTargetsHorizontal[0]);
    r.clear();
    this.fsQuad.render(r);
    r.setClearColor(this._oldClearColor, oa);
    r.autoClear = ac;
  }
  const makeComposer = () => {
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: LOOK.samples });
    msaa = LOOK.samples;
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, cam));
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), LOOK.bloom.strength, LOOK.bloom.radius, LOOK.bloom.day);
    bloom.render = bloomRender;
    // (its high pass reads the scene's scaled viewport: the bloom's own targets keep the whole picture)
    const HP = bloom.materialHighPassFilter;
    HP.uniforms.uVs = VS;
    HP.vertexShader = 'uniform vec2 uVs;\n' + HP.vertexShader.replace('vUv = uv;', 'vUv = uv * uVs;');
    bloom.useMips = bloom.nMips;
    bloom.enabled = false;
    composer.addPass(bloom);
    finish = new ShaderPass(FinishShader);
    finish.material.toneMapped = false; // (it tone maps itself: three adds nothing)
    finish.material.uniforms.uVs = VS;
    composer.addPass(finish);
    fxaaSize();
  };
  /**
   * The dynamic resolution on the detailed look (pacing, owner 2026-10-27): the post's targets keep the full size; the scene draws
   * into the lower-left `viewScale` part of them (each target's viewport + scissor), the bloom's high pass and the Finish pass read
   * that part (uVs) — a step changes uniforms and viewports, never a target (no allocation, no re-made framebuffer).
   */
  const VS = { value: new THREE.Vector2(1, 1) };
  let vsK = 1;
  const fxaaSize = () => {
    if (!composer) return;
    const t = composer.renderTarget1,
      V = viewScale(t.width, t.height, on ? dyn.res : 1);
    vsK = V.k;
    VS.value.set(V.u, V.v);
    for (const r of [composer.renderTarget1, composer.renderTarget2]) {
      r.viewport.set(0, 0, V.w, V.h);
      r.scissor.set(0, 0, V.w, V.h);
      r.scissorTest = V.k < 1;
    }
    const F = finish.material.uniforms;
    F.resolution.value.set(1 / V.w, 1 / V.h); // (FXAA steps one scene texel)
    F.uVc.value.set((V.w - 0.5) / t.width, (V.h - 0.5) / t.height);
    VIEW_PX.k = V.k;
  };
  /** The scene buffer's MSAA (Auto steps it off where FXAA smooths): the targets re-made on their next use. */
  const setMsaa = n => {
    if (!composer || msaa === n) return;
    msaa = n;
    for (const t of [composer.renderTarget1, composer.renderTarget2]) ((t.samples = n), t.dispose());
  };
  /** AO on the High setting (spec §4.39): the pass loads on first use, sits before the bloom. */
  const wantAO = v => {
    gtaoWant = v;
    if (gtao) gtao.enabled = v;
    if (!v || gtao || gtaoLoading || !composer) return;
    gtaoLoading = true;
    import('three/addons/postprocessing/GTAOPass.js')
      .then(({ GTAOPass }) => {
        if (!composer) return;
        gtao = new GTAOPass(scene, cam, w * pr, h * pr);
        gtao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.5, thickness: 2, scale: 1, samples: 12 });
        gtao.blendIntensity = 0.8;
        gtao.enabled = gtaoWant;
        composer.insertPass(gtao, 1);
      })
      .catch(() => {});
  };
  const sizeAll = () => {
    if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
    const sz = renderer.getSize(_sz);
    if (sz.x !== w || sz.y !== h || renderer.domElement.width !== Math.floor(w * pr)) renderer.setSize(w, h, false);
    if (composer) {
      const t = composer.renderTarget1;
      if (t.width !== Math.round(w * pr) || t.height !== Math.round(h * pr)) (composer.setPixelRatio(pr), composer.setSize(w, h), allocs++);
      fxaaSize();
    }
  };
  const _sz = new THREE.Vector2();
  let allocs = 0; // (the post's targets re-sized: the canvas or the setting changed — never the dynamic factor)
  const GR = { gain: new THREE.Vector3(1, 1, 1), lift: new THREE.Vector3(), sat: 1, con: 1, haze: new THREE.Color() };
  const SKYDIR = new THREE.Vector3();
  // the GPU's time for the frame (EXT_disjoint_timer_query_webgl2 when the browser has it): Auto's ladder reads it (else the frame)
  const gl = renderer.getContext(),
    gpuT = { ext: (gl && gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2')) || null, q: [] };
  const gpuPoll = () => {
    while (gpuT.q.length) {
      const q = gpuT.q[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const bad = gl.getParameter(gpuT.ext.GPU_DISJOINT_EXT),
        ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
      gpuT.q.shift();
      if (!bad) dyn.gpu = dyn.gpu === null ? ms : dyn.gpu + (ms - dyn.gpu) * (ms > dyn.gpu ? 0.2 : 0.05);
    }
  };
  /**
   * Dynamic resolution (like matches, r3d adaptRes), every look: under ~42 fps step down to the setting's floor, back up with
   * headroom (the real time between frames: the frame's dt is capped at 0.1 s). High sheds AO, then the big shadow map, instead.
   * Auto (the detailed look) also climbs its ladder (autoStep: AUTO), whose step lowers the floor toward AUTO.res's last.
   */
  const adapt = gfx => {
    const D = LOOK.dyn,
      now = performance.now(),
      ms = dyn.last ? Math.min(1000, now - dyn.last) : 16.7,
      dire = dyn.ema > D.dire;
    dyn.last = now;
    dyn.ema += (ms - dyn.ema) * (ms > dyn.ema ? 0.2 : 0.05);
    dyn.t += ms / 1000;
    if (dyn.t < 1) return;
    const tick = Math.min(2, dyn.t);
    dyn.t = 0;
    const r0 = dyn.res,
      m = on && gpuT.ext && dyn.gpu !== null ? dyn.gpu : dyn.ema; // (the GPU's ms when timed: a vsync-capped interval says nothing about the pixels)
    dyn.quick = dyn.ema < D.quick ? dyn.quick + 1 : 0;
    if (gfx === 'high' && on) {
      if (dyn.ema > D.slow && dyn.shed < 2) ((dyn.shed += 1), (dyn.quick = 0));
      else if (dyn.quick >= D.back && dyn.shed > 0) ((dyn.shed -= 1), (dyn.quick = 0));
    } else dyn.shed = 0;
    if (gfx === 'auto' && on) autoStep(dyn.A, dyn.gpu !== null && gpuT.ext ? dyn.gpu : dyn.ema, tick);
    else if (dyn.A.step || dyn.A.t) dyn.A = autoState();
    const floor = dire ? D.rescue[gfx] || D.rescue.auto : gfx === 'auto' && on ? autoAt(dyn.A.step).floor : D.floor[gfx] || D.floor.auto;
    dyn.res = resStep(dyn, m, floor, dire, D);
    if (dyn.res === r0) return;
    // (the detailed look: a viewport step, no target re-made)
    if (on && composer) fxaaSize();
    else resize(w, h);
  };
  const postInfo = () => {
    const P = composer.passes.filter(p => p.enabled),
      id = p => (p === bloom ? 'bloom' : p === finish ? 'finish' : p === gtao ? 'ao' : p instanceof RenderPass ? 'scene' : 'other');
    return {
      passes: P.map(id),
      full: P.filter(p => p === finish || p === gtao).length,
      bloomMips: bloom.enabled ? bloom.useMips : 0,
      aa: fxaa.enabled,
      grade: grade.enabled
    };
  };
  // ---- shadow-map gating (SHADOW_GATE): the casters (castShadow meshes) listed every `scan` s / when the scene changed; each
  // frame a signature of those inside the shadow box (world matrix, instances, geometry versions, bones, visibility)
  const SH = {
    prev: new Float64Array(0),
    why: null,
    q: 0.02,
    L: new THREE.Vector3(),
    box: 0,
    size: 0,
    age: 99,
    scanT: 99,
    list: [],
    kids: -1,
    geos: -1,
    last: null,
    R: new THREE.Vector3(),
    U: new THREE.Vector3()
  };
  const scanCasters = () => {
    SH.list.length = 0;
    scene.traverseVisible(o => o.isMesh && o.castShadow && o !== sea && SH.list.push(o));
    SH.prev.fill(NaN);
    SH.scans = (SH.scans || 0) + 1;
    SH.scanT = 0;
    SH.kids = scene.children.length;
    SH.geos = renderer.info.memory.geometries;
  };
  const _cv = new THREE.Vector3();
  const casterSig = (o, tx, ty, tz, lim) => {
    if (!o.visible) return 1;
    for (let p = o.parent, i = 0; p && i < 5; p = p.parent, i++) if (!p.visible) return 2;
    const e = o.matrixWorld.elements,
      g = o.geometry;
    if (!o.isInstancedMesh) {
      // outside the shadow box (its right / up extent round the target): it can't change the map
      let r = 3;
      if (!o.isSkinnedMesh && g) {
        if (!g.boundingSphere) g.computeBoundingSphere();
        _cv.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
        r =
          g.boundingSphere.radius *
          Math.max(Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]), Math.abs(e[4]) + Math.abs(e[5]) + Math.abs(e[6]));
      } else _cv.set(e[12], e[13], e[14]);
      const dx = _cv.x - tx,
        dy = _cv.y - ty,
        dz = _cv.z - tz;
      if (Math.abs(dx * SH.R.x + dz * SH.R.z) > lim + r || Math.abs(dx * SH.U.x + dy * SH.U.y + dz * SH.U.z) > lim + r) return 3;
    }
    // (quantised: a move under half a shadow texel, a turn under ~0.5°, can't change the map — an idle figure's breathing doesn't redraw it)
    const q = SH.q,
      Q = x => Math.round(x / q),
      A = x => Math.round(x * 100);
    let h =
      Q(e[12]) * 1.31 +
      Q(e[13]) * 1.77 +
      Q(e[14]) * 0.73 +
      A(e[0]) * 0.39 +
      A(e[2]) * 0.91 +
      A(e[5]) * 0.57 +
      A(e[8]) * 0.29 +
      A(e[10]) * 0.17;
    if (o.isInstancedMesh) h += instSig(o, tx, ty, tz, lim);
    if (g) {
      h += g.id * 0.0031 + (g.attributes.position ? g.attributes.position.version * 0.0019 : 0) + (g.index ? g.index.version * 0.0023 : 0);
      if (g.drawRange.count !== Infinity) h += g.drawRange.count * 0.001 + g.drawRange.start * 0.0007;
    }
    if (o.isSkinnedMesh && o.skeleton) {
      const B = o.skeleton.bones;
      for (let i = 0; i < B.length; i += 5) {
        const m = B[i].matrixWorld.elements;
        h += Q(m[12]) * 0.7 + Q(m[13]) * 1.1 + Q(m[14]) * 0.9;
      }
    }
    return h;
  };
  // an instanced caster: its instances inside the box, quantised (position to half a texel, turn / scale and the per-instance
  // attributes — the figures' limbs — to 1 / 100), cached by the buffers' versions: a crowd far off or holding still changes nothing
  const instC = new WeakMap();
  const instSig = (o, tx, ty, tz, lim) => {
    const g = o.geometry,
      A = [];
    let v = o.instanceMatrix.version * 7 + o.count * 13 + tx * 0.11 + ty * 0.13 + tz * 0.17;
    for (const k in g.attributes) {
      const a = g.attributes[k];
      if (a.isInstancedBufferAttribute) (A.push(a), (v += a.version * 3.1));
    }
    const c = instC.get(o);
    if (c && c.v === v) return c.h;
    const m = o.instanceMatrix.array,
      q = SH.q,
      rx = SH.R.x,
      rz = SH.R.z,
      ux = SH.U.x,
      uy = SH.U.y,
      uz = SH.U.z;
    let h = o.count * 0.007;
    for (let i = 0; i < o.count; i++) {
      const j = i * 16,
        dx = m[j + 12] - tx,
        dy = m[j + 13] - ty,
        dz = m[j + 14] - tz;
      if (Math.abs(dx * rx + dz * rz) > lim + 4 || Math.abs(dx * ux + dy * uy + dz * uz) > lim + 4) continue;
      const w = 1 + (i % 29) * 0.031;
      h += w * (Math.round(m[j + 12] / q) * 1.3 + Math.round(m[j + 13] / q) * 1.7 + Math.round(m[j + 14] / q) * 0.7);
      h += w * (Math.round(m[j] * 100) * 0.3 + Math.round(m[j + 2] * 100) * 0.9 + Math.round(m[j + 5] * 100) * 0.5);
      for (const a of A) for (let k = 0; k < a.itemSize; k++) h += w * Math.round(a.array[i * a.itemSize + k] * 100) * (0.21 + k * 0.1);
    }
    instC.set(o, { v, h });
    return h;
  };
  const SHC = { dir: [0, 0, 0], tgt: [0, 0, 0], box: 0, size: 0, sig: 0, age: 0 };
  /** This frame's shadow update due? (after the world matrices are updated) */
  const shadowGate = () => {
    if (SH.scanT >= SHADOW_GATE.scan || scene.children.length !== SH.kids || renderer.info.memory.geometries !== SH.geos) scanCasters();
    const L = SH.L,
      t = sun.target.position;
    SH.R.set(L.z, 0, -L.x).normalize();
    SH.U.set(L.y * SH.R.z, L.z * SH.R.x - L.x * SH.R.z, -L.y * SH.R.x).normalize();
    let sig = 0;
    if (SH.prev.length < SH.list.length) SH.prev = new Float64Array(SH.list.length * 2);
    SH.why = null;
    for (let i = 0; i < SH.list.length; i++) {
      const o = SH.list[i],
        h = casterSig(o, t.x, t.y, t.z, SH.box);
      if (SH.prev[i] !== h && !SH.why)
        SH.why = `${o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh ? 'instanced' : 'mesh'} ${o.name || (o.parent && o.parent.name) || o.geometry.type}`;
      SH.prev[i] = h;
      sig += h * (1 + (i % 17) * 0.0617);
    }
    SHC.dir[0] = L.x;
    SHC.dir[1] = L.y;
    SHC.dir[2] = L.z;
    SHC.tgt[0] = t.x;
    SHC.tgt[1] = t.y;
    SHC.tgt[2] = t.z;
    SHC.box = SH.box;
    SHC.size = SH.size;
    SHC.sig = sig;
    SHC.age = SH.age;
    const due = !sun.shadow.map || shadowDue(SHADOW_GATE, SH.last, SHC);
    if (due) {
      const P = SH.last || (SH.last = { dir: [0, 0, 0], tgt: [0, 0, 0] });
      P.dir[0] = L.x;
      P.dir[1] = L.y;
      P.dir[2] = L.z;
      P.tgt[0] = t.x;
      P.tgt[1] = t.y;
      P.tgt[2] = t.z;
      P.box = SH.box;
      P.size = SH.size;
      P.sig = sig;
      SH.age = 0;
      SHADOW_GATE.dirty = false;
      SHADOW_GATE.n.upd++;
    } else SHADOW_GATE.n.skip++;
    return due;
  };
  Object.assign(LOOK_CTX, { renderer, scene, cam, target: () => (on && composer ? composer.readBuffer : null) });
  const resize = (cw, ch) => {
    w = Math.max(1, cw);
    h = Math.max(1, ch);
    pr = on && composer ? basePR() : basePR() * dyn.res; // (the detailed look scales its viewport instead: fxaaSize)
    sizeAll();
  };
  return {
    terrainMat,
    terrainFar,
    sea,
    get on() {
      return on;
    },
    /** The island's shore texture (the sea's depth and coast distance): once per terrain. */
    setTerrain(T) {
      const S = T.shore,
        t = new THREE.DataTexture(S.data, S.w, S.h, THREE.RGBAFormat);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      if (shoreU.tShore.value) shoreU.tShore.value.dispose();
      shoreU.tShore.value = t;
      // texel centres: vertex (i, j) sits at x = i·W/(w−1)
      const cx = T.W / (S.w - 1),
        cz = T.D / (S.h - 1);
      shoreU.uBox.value.set(-cx / 2, -cz / 2, 1 / (T.W + cx), 1 / (T.D + cz));
    },
    /** Detailed (true) or the Fast look (false): tone mapping, environment, shadow filter, sea. Materials recompile. */
    set(v, water) {
      v = !!v;
      if (v === on && ready) return;
      ready = true;
      on = v;
      renderer.toneMapping = v ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = v ? LOOK.exposure[0] : 1;
      renderer.shadowMap.type = v ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      sun.shadow.radius = v ? LOOK.shadow.radius : 1;
      sun.shadow.normalBias = v ? 0.04 : 0;
      scene.environment = v && envRT ? envRT.texture : null;
      sea.visible = v;
      water.visible = !v;
      if (v && !composer) makeComposer();
      if (!v) {
        // the Fast look's fixed shadow box and map (lightScene)
        const sc = sun.shadow.camera;
        Object.assign(sc, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: 500 });
        sc.updateProjectionMatrix();
        sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
      }
      resize(w, h); // (the detailed look: the canvas at the base ratio, the factor as a viewport; Fast: the canvas × the factor)
      if (sun.shadow.map) (sun.shadow.map.dispose(), (sun.shadow.map = null));
      SH.last = null;
      scene.traverse(o => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) m.needsUpdate = true;
      });
    },
    /** The canvas size (CSS px): the renderer and the post at the dynamic resolution. */
    resize,
    /**
     * Per frame, before the draw: time, the sky, light balance, bloom by `lit`, the shadow box by zoom, the resolution; street
     * level `st` (0–1): the grade, the edge smoothing and the toon bands (Auto / High; Fast: none of them, only the haze colour).
     */
    step(dt, t, lit, tod, view, gfx, st = 0) {
      if (gfx !== dyn.gfx) ((dyn.gfx = gfx), resize(w, h)); // (the pixel budget follows the setting)
      adapt(gfx);
      gradeAt(tod, GR);
      STREET_FX.uFdToon.value = on ? smooth(0.3, 0.9, st) : 0;
      GROUND_U.uGr.value = on ? smooth(0.2, 0.8, st) : 0; // (T-370: the painted ground; Fast: none)
      SIL_U.uSilK.value = on ? smooth(0.3, 0.9, st) : 0; // (T-371: the painted distance on the buildings)
      SIL_U.uSil.value.copy(GR.haze).multiplyScalar(SIL.dark);
      // (T-373: dusk and night at street level — the emissives lifted for the selective bloom, the lamps' weight for the night layer)
      const sg = on ? smooth(0.3, 0.9, st) : 0,
        gw = lit > 0.005 ? (GLOW.k * smooth(GLOW.lit[0], GLOW.lit[1], lit)) / lit : 1;
      STREET_FX.uFdGlow.value = 1 + sg * Math.max(0, gw - 1);
      STREET_U.st.value = sg;
      paintOn = on && st > 0.1;
      if (pk) pk.mesh.visible = paintOn;
      if (!on) return;
      const G = finish.material.uniforms,
        Q = autoAt(gfx === 'auto' ? dyn.A.step : 0),
        plan = postPlan({ gfx, st, lit, sg, step: gfx === 'auto' ? dyn.A.step : 0 });
      gradeK = smooth(0.15, 0.8, st);
      grade.enabled = plan.grade;
      if (grade.enabled) (G.uGain.value.copy(GR.gain), G.uLift.value.copy(GR.lift), (G.uSat.value = GR.sat), (G.uCon.value = GR.con));
      fxaa.enabled = plan.aa;
      setMsaa(plan.msaa);
      U.t.value = t;
      // the real sun (below the horizon at night: the sky goes dark; the moon is only the directional light)
      const a = ((tod - 0.25) / 0.5) * Math.PI;
      SKYDIR.set(1.25 * Math.cos(a), Math.sin(a), 0.05 + 0.3 * Math.max(0, Math.sin(a))).normalize();
      bakeSky(dt, SKYDIR);
      if (paintOn) {
        const p0 = performance.now();
        paintStep(dt, tod, SKYDIR, lit);
        pk.ms += (performance.now() - p0 - pk.ms) * 0.1;
      }
      scene.environmentIntensity = LOOK.env * smooth(-0.05, 0.35, SKYDIR.y);
      renderer.toneMappingExposure = lerp(LOOK.exposure[0], lerp(LOOK.exposure[1], GLOW.exposure, sg), lit);
      bloom.enabled = plan.bloom;
      bloom.useMips = plan.mips;
      bloom.threshold = lerp(lerp(LOOK.bloom.day, LOOK.bloom.night, lit), GLOW.thr, sg);
      bloom.strength = lerp(LOOK.bloom.strength * lit, GLOW.strength * smooth(GLOW.lit[0], GLOW.lit[1], lit), sg);
      bloom.radius = lerp(LOOK.bloom.radius, GLOW.radius, sg);
      const BF = bloom.compositeMaterial.uniforms.bloomFactors.value;
      for (let i = 0; i < BF.length; i++) BF[i] = i < plan.mips ? lerp(MIPS0[i], GLOW.mips[i], sg) : 0;
      // shadows: the box follows the zoom (crisp near, the whole view far), the sun far enough to cover it
      const S = LOOK.shadow,
        box = clamp(view ? view.d * S.k : 120, S.box[0], S.box[1]),
        sc = sun.shadow.camera,
        size = gfx === 'high' && dyn.shed < 2 ? S.mapHi : Q.shadow && gfx === 'auto' ? Math.min(S.map, Q.shadow) : S.map;
      if (sc.right !== box) {
        Object.assign(sc, { left: -box, right: box, top: box, bottom: -box, near: 1, far: box * 4 + 400 });
        sc.updateProjectionMatrix();
      }
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) (sun.shadow.map.dispose(), (sun.shadow.map = null));
      }
      // (pacing 2026-10-27: the target on whole shadow texels — SHADOW_GATE — then the sun the same way out from it)
      SH.L.copy(sun.position).sub(sun.target.position).normalize();
      snapTarget(sun.target.position, SH.L, (2 * box) / size);
      sun.position.copy(sun.target.position).addScaledVector(SH.L, box * 2 + 200);
      SH.box = box;
      SH.size = size;
      SH.q = box / size; // (half a shadow texel, m)
      SH.age += dt;
      SH.scanT += dt;
      wantAO(gfx === 'high' && dyn.shed < 1);
      hi = gfx === 'high';
    },
    /** Draw the frame through the post (timed: the GPU timer query round it — not while the perf probe times the draw itself). */
    render(timed = true) {
      const F = finish.material.uniforms;
      F.uBloom.value = bloom.enabled ? 1 : 0;
      F.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
      F.toneMappingExposure.value = renderer.toneMappingExposure;
      F.uAA.value = fxaa.enabled ? 1 : 0;
      F.uK.value = grade.enabled ? gradeK : 0;
      // the shadow map only when due (SHADOW_GATE); the world matrices updated here once, so the gate sees this frame's
      const SM = renderer.shadowMap,
        gate = timed && SM.enabled && sun.castShadow;
      if (gate) {
        scene.updateMatrixWorld();
        SM.autoUpdate = false;
        SM.needsUpdate = shadowGate();
        scene.matrixWorldAutoUpdate = false;
      }
      try {
        if (timed && gpuT.ext && gpuT.q.length < 4) {
          const q = gl.createQuery();
          gl.beginQuery(gpuT.ext.TIME_ELAPSED_EXT, q);
          try {
            composer.render();
          } finally {
            gl.endQuery(gpuT.ext.TIME_ELAPSED_EXT);
            gpuT.q.push(q);
          }
        } else composer.render();
      } finally {
        if (gate) ((SM.autoUpdate = true), (scene.matrixWorldAutoUpdate = true));
      }
      if (gpuT.q.length) gpuPoll();
    },
    info: () => ({
      look: on ? (hi ? 'high' : 'detailed') : 'fast',
      res: dyn.res,
      scale: +((pr * (on && composer ? vsK : 1)) / Math.min(devicePixelRatio || 1, 2)).toFixed(2), // the render scale: budget × the dynamic factor
      // (pacing 2026-10-27: the post's target re-sizes, env bakes, shadow updates / skips so far, casters listed)
      gpuB: {
        allocs,
        envBakes,
        shUpd: SHADOW_GATE.n.upd,
        shSkip: SHADOW_GATE.n.skip,
        casters: SH.list.length,
        scans: SH.scans || 0,
        why: SH.why
      },
      ao: !!(gtao && gtao.enabled),
      aa: !!(fxaa && fxaa.enabled && on),
      grade: !!(grade && grade.enabled && on),
      sky: paintOn && pk ? { bakes: envBakes, dome: true, ms: +pk.ms.toFixed(3) } : null, // (bakes: the env cube's — the dome bakes none)
      bloom: !!(bloom && bloom.enabled && on),
      shed: dyn.shed,
      // the passes drawn after the scene (full = full-size ones: the Finish pass, + AO on High) and Auto's ladder
      post: on && composer ? postInfo() : null,
      auto:
        dyn.gfx === 'auto' && on
          ? { step: dyn.A.step, label: autoLabel(dyn.A.step), gpu: dyn.gpu === null ? null : +dyn.gpu.toFixed(1), msaa }
          : null
    }),
    /** Dev (the perf probe, map3d): the post passes and the dynamic resolution's state, to switch off for a measured draw. */
    parts: () => ({ bloom, grade, fxaa, gtao, dyn, dome: pk ? pk.mesh : null }), // (dome: street level's sky — its visible to mask it)
    /** The scene's render target (precompiles: the materials' programs for the buffer they draw into). */
    target: () => (on && composer ? composer.readBuffer : null),
    /** The grade's haze colour at time of day `t` (default: the last step's) — street level's distance haze, every look. */
    haze: t => (t === undefined ? GR.haze : gradeAt(t, GR).haze),
    /** Street level's background: null while the painted sky's dome draws it (T-373; Auto / High), else the baked one (PMREM). */
    envTex: () => (paintOn && pk ? null : envRT ? envRT.texture : null),
    dispose() {
      if (LOOK_CTX.renderer === renderer) Object.assign(LOOK_CTX, { renderer: null, scene: null, cam: null, target: null });
      if (composer) {
        for (const p of composer.passes) p.dispose && p.dispose();
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      if (envRT) envRT.dispose();
      envCube.dispose();
      if (pk) (scene.remove(pk.mesh), pk.tex.dispose(), pk.mat.dispose(), pk.mesh.geometry.dispose());
      pmrem.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      if (tex) (tex.det.dispose(), tex.wave.dispose());
      if (shoreU.tShore.value) shoreU.tShore.value.dispose();
      terrainMat.dispose();
      terrainFar.dispose();
      seaMat.dispose();
    }
  };
}
