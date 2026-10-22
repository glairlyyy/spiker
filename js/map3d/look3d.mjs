// The 3D map's light and look (map3d.mjs): renderer settings, the sun, the hemisphere and the Fast look's sea (lightScene);
// the clock's sky colours and sun direction (skyAt, SKY); the detailed look (richLook, LOOK): terrain and sea shaders, the baked
// sky, the post (bloom, GTAO, ACES), shadows by zoom and dynamic resolution. Display only, no randoms, no downloads.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
  sky: { turbidity: 5, rayleigh: 1.4, mie: 0.004, g: 0.8, every: 0.25, moved: 0.015 },
  bloom: { strength: 0.85, radius: 0.5, day: 3, night: 0.8 }, // threshold from day (nothing blooms) to night
  shadow: { radius: 3, box: [40, 360], k: 0.85, map: 2048, mapHi: 4096 },
  // dynamic resolution: ms (frame-time average) to step down / up; far too slow (`dire`, < ~15 fps) steps faster to `rescue`
  dyn: { floor: { auto: 0.7, high: 1, fast: 1 }, slow: 24, quick: 15, dire: 66, rescue: { auto: 0.45, high: 1, fast: 1 } },
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
    Object.assign(sh.uniforms, { tDet: U.det });
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 gnd; attribute vec2 gdir; attribute float gpav; varying vec4 vGnd; varying vec2 vGdir; varying float vPav;
        varying vec3 vWp; varying vec3 vWn;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGnd = gnd; vGdir = gdir; vPav = gpav; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDet; varying vec4 vGnd; varying vec2 vGdir; varying float vPav; varying vec3 vWp; varying vec3 vWn;
        float lkH; float lkWet; ${GLSL_BUMP}`
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
          float rip = texture2D(tDet, vec2(gp.x + gp.y * 0.35, gp.y - gp.x * 0.25) / 9.0).b;
          vec3 sa = base * (0.9 + 0.1 * rip + 0.16 * (d1.r - 0.5));
          vec3 ro = mix(base, vec3(0.2, 0.19, 0.165), steep) * (0.78 + 0.22 * d2.a) * (0.8 + 0.4 * d1.r);
          // paving: 3 m slabs, a tone per slab (hash), dark joints, a little grain
          vec2 sl = gp / 3.0, sc = floor(sl), sf = fract(sl);
          float joint = smoothstep(0.0, 0.05, min(min(sf.x, sf.y), min(1.0 - sf.x, 1.0 - sf.y)));
          float slab = fract(sin(dot(sc, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 pv = base * (0.9 + 0.14 * slab + 0.1 * (d1.r - 0.5)) * (0.72 + 0.28 * joint) * (0.92 + 0.16 * d2.g);
          float rs = length(vGdir) > 0.5 ? dot(gp, normalize(vGdir)) : vWp.y * 2.2;
          float row = smoothstep(0.2, 0.7, 0.5 + 0.5 * sin(rs * 3.927));
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
        normal = lkBump(-vViewPosition, normal, vec2(dFdx(lkH), dFdy(lkH)) * 0.07 * (1.0 - lkWet));`
      );
  };
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
  // ---- the sky (environment light and reflections)
  const sky = new Sky(),
    skyScene = new THREE.Scene(),
    pmrem = new THREE.PMREMGenerator(renderer),
    envDir = new THREE.Vector3(0, -1, 0);
  sky.material.fragmentShader = sky.material.fragmentShader.replace('vSunE * 19000.0', 'vSunE * 0.0'); // no sun disc: the light is the sun
  sky.scale.setScalar(100);
  sky.material.uniforms.turbidity.value = LOOK.sky.turbidity;
  sky.material.uniforms.rayleigh.value = LOOK.sky.rayleigh;
  sky.material.uniforms.mieCoefficient.value = LOOK.sky.mie;
  sky.material.uniforms.mieDirectionalG.value = LOOK.sky.g;
  skyScene.add(sky);
  let envRT = null,
    envAge = 99;
  const bakeSky = (dt, dir) => {
    envAge += dt;
    if (envRT && (envAge < LOOK.sky.every || dir.distanceTo(envDir) < LOOK.sky.moved)) return;
    sky.material.uniforms.sunPosition.value.copy(dir);
    const rt = pmrem.fromScene(skyScene, 0, 1, 400);
    if (envRT) envRT.dispose();
    envRT = rt;
    envDir.copy(dir);
    envAge = 0;
    if (on) scene.environment = rt.texture;
  };
  // ---- post: render → (GTAO) → bloom → ACES + sRGB
  let composer = null,
    bloom = null,
    gtao = null,
    gtaoWant = false,
    gtaoLoading = false,
    on = false,
    ready = false,
    hi = false,
    w = 1,
    h = 1,
    pr = 1;
  const dyn = { res: 1, ema: 16.7, t: 0, last: 0 };
  const makeComposer = () => {
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: LOOK.samples });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, cam));
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), LOOK.bloom.strength, LOOK.bloom.radius, LOOK.bloom.day);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
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
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    if (composer) (composer.setPixelRatio(pr), composer.setSize(w, h));
  };
  const SKYDIR = new THREE.Vector3();
  const resize = (cw, ch) => {
    w = Math.max(1, cw);
    h = Math.max(1, ch);
    pr = Math.min(devicePixelRatio || 1, 2) * (on ? dyn.res : 1);
    sizeAll();
  };
  return {
    terrainMat,
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
        dyn.res = 1;
        pr = Math.min(devicePixelRatio || 1, 2);
        sizeAll();
      }
      if (sun.shadow.map) (sun.shadow.map.dispose(), (sun.shadow.map = null));
      scene.traverse(o => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) m.needsUpdate = true;
      });
    },
    /** The canvas size (CSS px): the renderer and the post at the dynamic resolution. */
    resize,
    /** Per frame, before the draw: time, the sky, light balance, bloom by `lit`, the shadow box by zoom, the resolution. */
    step(dt, t, lit, tod, view, gfx) {
      if (!on) return;
      U.t.value = t;
      // the real sun (below the horizon at night: the sky goes dark; the moon is only the directional light)
      const a = ((tod - 0.25) / 0.5) * Math.PI;
      SKYDIR.set(1.25 * Math.cos(a), Math.sin(a), 0.05 + 0.3 * Math.max(0, Math.sin(a))).normalize();
      bakeSky(dt, SKYDIR);
      scene.environmentIntensity = LOOK.env * smooth(-0.05, 0.35, SKYDIR.y);
      renderer.toneMappingExposure = lerp(LOOK.exposure[0], LOOK.exposure[1], lit);
      bloom.enabled = lit > 0.02;
      bloom.threshold = lerp(LOOK.bloom.day, LOOK.bloom.night, lit);
      bloom.strength = LOOK.bloom.strength * lit;
      // shadows: the box follows the zoom (crisp near, the whole view far), the sun far enough to cover it
      const S = LOOK.shadow,
        box = clamp(view ? view.d * S.k : 120, S.box[0], S.box[1]),
        sc = sun.shadow.camera,
        size = gfx === 'high' ? S.mapHi : S.map;
      if (sc.right !== box) {
        Object.assign(sc, { left: -box, right: box, top: box, bottom: -box, near: 1, far: box * 4 + 400 });
        sc.updateProjectionMatrix();
      }
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        if (sun.shadow.map) (sun.shadow.map.dispose(), (sun.shadow.map = null));
      }
      sun.position
        .sub(sun.target.position)
        .setLength(box * 2 + 200)
        .add(sun.target.position);
      wantAO(gfx === 'high');
      hi = gfx === 'high';
      // dynamic resolution (like matches, r3d adaptRes): under ~42 fps step down to the setting's floor, back up with headroom
      // (the real time between frames: the frame's dt is capped at 0.1 s)
      const D = LOOK.dyn,
        now = performance.now(),
        ms = dyn.last ? Math.min(1000, now - dyn.last) : 16.7,
        dire = dyn.ema > D.dire,
        floor = (dire ? D.rescue[gfx] : D.floor[gfx]) || (dire ? D.rescue.auto : D.floor.auto);
      dyn.last = now;
      dyn.ema += (ms - dyn.ema) * (ms > dyn.ema ? 0.2 : 0.05);
      dyn.t += ms / 1000;
      if (dyn.t >= 1) {
        dyn.t = 0;
        const r0 = dyn.res;
        if (dyn.ema > D.slow && dyn.res > floor) dyn.res = Math.max(floor, +(dyn.res - (dire ? 0.15 : 0.05)).toFixed(2));
        else if (dyn.ema < LOOK.dyn.quick && dyn.res < 1) dyn.res = Math.min(1, +(dyn.res + 0.05).toFixed(2));
        if (dyn.res < D.rescue.auto) dyn.res = D.rescue.auto;
        if (dyn.res !== r0) resize(w, h);
      }
    },
    /** Draw the frame through the post. */
    render() {
      composer.render();
    },
    info: () => ({ look: on ? (hi ? 'high' : 'detailed') : 'fast', res: on ? dyn.res : 1, ao: !!(gtao && gtao.enabled) }),
    /** The baked sky (PMREM) — street level shows it as the background. */
    envTex: () => (envRT ? envRT.texture : null),
    dispose() {
      if (composer) {
        for (const p of composer.passes) p.dispose && p.dispose();
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      if (envRT) envRT.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      if (tex) (tex.det.dispose(), tex.wave.dispose());
      if (shoreU.tShore.value) shoreU.tShore.value.dispose();
      terrainMat.dispose();
      seaMat.dispose();
    }
  };
}
