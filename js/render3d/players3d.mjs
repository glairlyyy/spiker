// 3D players: VRM model loading and recolouring, pose application, arm aiming at the ball, feet on the floor, faces.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));
loader.register(inlineImages);

/**
 * Textures packed inside the model (glTF bufferView images) are normally loaded through temporary blob: URLs, which
 * some hosts block (the Claude desktop app's artifact frame: "Couldn't load texture blob:…", untextured players).
 * Decode them straight from memory with createImageBitmap instead — no URL involved. Same result as three's own
 * ImageBitmapLoader path (premultiplyAlpha 'none'); anything else falls back to the default loader.
 */
function inlineImages(parser) {
  const original = parser.loadImageSource.bind(parser);
  parser.loadImageSource = function (sourceIndex, texLoader) {
    const def = parser.json.images[sourceIndex];
    if (def.bufferView === undefined || typeof createImageBitmap === 'undefined') return original(sourceIndex, texLoader);
    if (parser.sourceCache[sourceIndex] !== undefined) return parser.sourceCache[sourceIndex].then(t => t.clone());
    // decoded once per model file: later figures of the same model get clones sharing the image (one GPU upload)
    const shared = modelKey && imgCache.get(modelKey);
    if (shared && shared.has(sourceIndex)) return (parser.sourceCache[sourceIndex] = shared.get(sourceIndex)).then(t => t.clone());
    const promise = parser
      .getDependency('bufferView', def.bufferView)
      .then(view => createImageBitmap(new Blob([view], { type: def.mimeType }), { premultiplyAlpha: 'none' }))
      .then(bitmap => {
        const tex = new THREE.Texture(bitmap);
        tex.needsUpdate = true;
        tex.userData.mimeType = def.mimeType;
        return tex;
      })
      .catch(() => {
        delete parser.sourceCache[sourceIndex]; // decoding failed: let three's default path try (it caches its own)
        return original(sourceIndex, texLoader);
      });
    parser.sourceCache[sourceIndex] = promise;
    if (shared) shared.set(sourceIndex, promise);
    return promise;
  };
  return { name: 'SC_inline_images' };
}
/**
 * One pass of the heavy work per model file: decoded textures (imgCache) and geometry (geoCache, the first figure's
 * meshes) are shared by every later figure of the same model. Keyed by the model's buffer; `modelKey` is the model
 * being parsed right now (figures are built one at a time).
 */
const imgCache = new WeakMap(),
  geoCache = new WeakMap();
let modelKey = null;
const bufCache = new Map();

/** Download a base model (served as base64 text) once; progress 0..1. */
/** The base player model (VRM as base64 text: the artifact host may block binary / blob loads). */
export const MODEL_URL = new URL('../../assets/vrm/base.glb.txt', import.meta.url).href;
/** Your own player in career matches (Main_v2.vrm, base64 text like the base model). */
export const MAIN_URL = new URL('../../assets/vrm/main.glb.txt', import.meta.url).href;
/**
 * The owner's own models (VRM 1.0 by glairly, base64 text like the base model): every Monster game player picks one of these at
 * random (owner, 2026-10-08). Loaded on the first Monster game, not at start-up (~63 MB of text).
 */
const vrmUrl = f => new URL(`../../assets/vrm/${f}.glb.txt`, import.meta.url).href;
export const BUNDLED = [
  { name: 'Main_v2', url: MAIN_URL },
  { name: 'Rival_v2', url: vrmUrl('rival2') },
  { name: 'Rivar_v3', url: vrmUrl('rival3') },
  { name: 'Rivar_v4', url: vrmUrl('rival4') },
  { name: 'male1', url: vrmUrl('male1') },
  { name: 'male2', url: vrmUrl('male2') }
];
export async function loadBase(url, onProgress) {
  if (bufCache.has(url)) return bufCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model ${res.status}`);
  const total = +res.headers.get('content-length') || 6.4e6,
    reader = res.body.getReader(),
    parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress && onProgress(Math.min(1, got / total));
  }
  const bin = atob((await new Blob(parts).text()).trim()),
    bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  bufCache.set(url, bytes.buffer);
  return bytes.buffer;
}

/** Greyed textures per source image and filter: every figure of a model shares one. */
const greyCache = new Map();
/** Hair textures are brown in the base model: greyscale + brighten so a material colour can tint any anime hair. */
function greyTexture(tex, filter) {
  if (!tex || !tex.image) return tex;
  const key = `${tex.source.uuid}|${filter}`;
  if (greyCache.has(key)) return greyCache.get(key);
  const t = greyTex(tex, filter);
  greyCache.set(key, t);
  return t;
}
function greyTex(tex, filter) {
  const im = tex.image,
    c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d');
  g.filter = filter;
  g.drawImage(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY;
  t.colorSpace = tex.colorSpace;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  return t;
}
const eachMat = (vrm, fn) =>
  vrm.scene.traverse(o => {
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => fn(m, o));
  });

/** Team kit, hair, skin and eye colour on the shared model (the shirt texture is white, so colours multiply cleanly). */
export function dress(vrm, kit) {
  const col = c => new THREE.Color(c);
  eachMat(vrm, m => {
    const n = m.name || '';
    // remember the model's own colours so dressing can be repeated for every match without compounding
    if (!m.userData.c0) m.userData.c0 = { color: m.color && m.color.clone(), shade: m.shadeColorFactor && m.shadeColorFactor.clone() };
    if (m.color && m.userData.c0.color) m.color.copy(m.userData.c0.color);
    if (m.shadeColorFactor && m.userData.c0.shade) m.shadeColorFactor.copy(m.userData.c0.shade);
    const tint = (c, shade = 0.62) => {
      m.color && m.color.copy(col(c));
      m.shadeColorFactor && m.shadeColorFactor.copy(col(c).multiplyScalar(shade));
    };
    // VRoid material names (with or without a F00_… prefix)
    if (/Tops/.test(n)) tint(kit.shirt);
    else if (/Bottoms/.test(n)) tint(kit.shorts || '#ffffff', 0.7);
    else if (/Shoes/.test(n)) tint(kit.shoes || '#ffffff', 0.75);
    else if (/HAIR/.test(n)) {
      if (!m.userData.grey) {
        m.userData.map0 = { map: m.map, shade: m.shadeMultiplyTexture };
        m.map = greyTexture(m.map, 'grayscale(1) brightness(2.1) contrast(1.15)');
        if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = m.map;
        m.userData.grey = true;
        m.needsUpdate = true;
      }
      tint(kit.hair, 0.6);
    } else if (/EyeIris/.test(n)) {
      if (!m.userData.grey) {
        m.userData.map0 = { map: m.map };
        m.map = greyTexture(m.map, 'grayscale(1) brightness(1.7)');
        m.userData.grey = true;
        m.needsUpdate = true;
      }
      m.color && m.color.copy(col(kit.eyes || '#5b3a1e'));
    } else if (/SKIN/.test(n) && kit.skin) {
      // base skin is a light peach: scale towards the rolled skin tone
      const base = col('#f6d7b8'),
        s = col(kit.skin);
      const k = new THREE.Color(Math.min(1, s.r / base.r), Math.min(1, s.g / base.g), Math.min(1, s.b / base.b));
      m.color && m.color.copy(k);
      m.shadeColorFactor && m.shadeColorFactor.multiply(k);
    }
  });
}

/** Back to the model's own colours (undo dress): for loaded models the player wants kept as modelled. */
export function undress(vrm) {
  eachMat(vrm, m => {
    const c0 = m.userData.c0,
      t0 = m.userData.map0;
    if (c0) {
      if (m.color && c0.color) m.color.copy(c0.color);
      if (m.shadeColorFactor && c0.shade) m.shadeColorFactor.copy(c0.shade);
    }
    if (t0 && m.userData.grey) {
      m.map = t0.map;
      if (t0.shade) m.shadeMultiplyTexture = t0.shade;
      m.userData.grey = false;
      m.needsUpdate = true;
    }
  });
}

/** Cost of one figure, for the debug log: meshes, materials (≈ draw calls; shadows draw them again), triangles, bones, spring joints. */
export function modelStats(pl) {
  const mats = new Set();
  let meshes = 0,
    tris = 0,
    bones = 0;
  pl.vrm.scene.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
    if (o.skeleton) bones = Math.max(bones, o.skeleton.bones.length);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
  });
  const springs = pl.vrm.springBoneManager ? (pl.vrm.springBoneManager.joints.size ?? pl.vrm.springBoneManager.joints.length) : 0;
  return `${meshes} meshes, ${mats.size} materials, ${tris} tris, ${bones} bones, ${springs} spring joints, ≈${mats.size * 2} draws (with shadow)`;
}

/** Hair / cloth springs are stepped at this rate (Hz); bones, expressions and look-at still update every frame. 0 = every frame. */
const SPRING_HZ = 30;
/** vrm.update(dt) with the spring bones throttled to SPRING_HZ (stepped with the time collected since their last step); figures are staggered. */
export function updateVrm(pl, dt) {
  const vrm = pl.vrm,
    sm = vrm.springBoneManager;
  if (!sm || !SPRING_HZ) return vrm.update(dt);
  pl.sacc = (pl.sacc ?? Math.random() / SPRING_HZ) + dt;
  vrm.springBoneManager = null;
  vrm.update(dt);
  vrm.springBoneManager = sm;
  if (pl.sacc >= 1 / SPRING_HZ - 1e-4) {
    sm.update(Math.min(pl.sacc, 0.1));
    pl.sacc = 0;
  }
}

/** Hair / cloth spring tuning: stiffness ×, drag + and gravity × on top of the model's own values (more = less movement). */
const HAIR = { stiff: 1, drag: 0, gravity: 1 };
/** Parse a VRM from the shared buffer and wrap it in a root group scaled to `height` metres. */
export async function makeVRM(buf, height) {
  if (!imgCache.has(buf)) imgCache.set(buf, new Map());
  modelKey = buf;
  let gltf;
  try {
    gltf = await loader.parseAsync(buf.slice(0), '');
  } finally {
    modelKey = null;
  }
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('not a VRM model');
  if (vrm.meta && vrm.meta.metaVersion === '0') VRMUtils.rotateVRM0(vrm); // VRM 0.x faces −Z: turn it like a VRM 1 model
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
  const meshes = [];
  vrm.scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      meshes.push(o);
    }
  });
  // later figures of this model reuse the first figure's geometry (same mesh order): one copy in memory and on the GPU
  const tmpl = geoCache.get(buf);
  if (!tmpl)
    geoCache.set(
      buf,
      meshes.map(o => o.geometry)
    );
  else if (tmpl.length === meshes.length)
    meshes.forEach((o, i) => {
      if (o.geometry === tmpl[i]) return;
      o.geometry.dispose();
      o.geometry = tmpl[i];
    });
  const root = new THREE.Group();
  root.add(vrm.scene);
  const bone = n => vrm.humanoid.getNormalizedBoneNode(n);
  vrm.update(0);
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const headY = bone('head').getWorldPosition(v).y + 0.12,
    footY = bone('leftFoot').getWorldPosition(v).y;
  const scale = height / headY;
  root.scale.setScalar(scale);
  // hair / cloth springs: measure motion relative to the figure's root, so the figure running, jumping or being placed at a new spot
  // (the root moves in world space every frame) no longer flings the hair around — it only reacts to the body's own pose
  if (vrm.springBoneManager)
    for (const j of vrm.springBoneManager.joints) {
      j.center = root;
      // calmer hair: stiffer and more damped than the model's own settings (tune HAIR; stiff 1 / drag 0 = the model as exported)
      j.settings.stiffnessForce *= HAIR.stiff;
      j.settings.dragForce = Math.min(1, j.settings.dragForce + HAIR.drag);
      j.settings.gravityPower *= HAIR.gravity;
    }
  const pl = { vrm, root, bone, footRest: footY, headY, scale, prev: new Map(), blinkT: Math.random() * 3, face: {} };
  return pl;
}

// ---------- pose application ----------
const DOWN = new THREE.Vector3(0, -1, 0),
  REST_L = new THREE.Vector3(1, 0, 0),
  REST_R = new THREE.Vector3(-1, 0, 0);
const E = new THREE.Euler(),
  QA = new THREE.Quaternion(),
  QB = new THREE.Quaternion();
/** Left arm → right arm (mirror the direction vectors across the body, negate the twist). */
export const mirror = arm => arm.map((v, i) => (i < 3 ? new THREE.Vector3(-v.x, v.y, v.z) : -(v || 0)));
function legDirs(l) {
  const s = l.s ?? 0.08;
  return [
    new THREE.Vector3(s, -Math.cos(l.a), Math.sin(l.a)).normalize(),
    new THREE.Vector3(s * 0.4, -Math.cos(l.a - l.k), Math.sin(l.a - l.k)).normalize()
  ];
}
/** Rotation taking `rest` onto `dir`, then a twist of `tw` radians about `dir`. */
function aim(rest, dir, tw) {
  const q = new THREE.Quaternion().setFromUnitVectors(rest, dir.clone().normalize());
  if (tw) q.premultiply(QB.setFromAxisAngle(dir.clone().normalize(), tw));
  return q;
}
/**
 * Pose → normalized bone rotations. Legs are authored in character space (+z forward, +y up, +x the player's
 * left) unless `legBody` (dive: legs follow the body). Arms are [upper, fore, hand, twistUpper, twistFore]
 * directions in torso space; the right arm defaults to the mirror of the left. `fsplit` (default 1): share of the forearm twist
 * the forearm itself keeps; the rest turns at the wrist, which softens the twisted-elbow look of a held palms-up grip.
 */
export function applyPose(pl, P) {
  const b = pl.bone;
  const hipQ = new THREE.Quaternion().setFromEuler(E.set(P.hp || 0, P.hyaw || 0, P.hroll || 0));
  b('hips').quaternion.copy(hipQ);
  b('spine').quaternion.setFromEuler(E.set(P.sp || 0, (P.tw || 0) * 0.4, (P.sroll || 0) * 0.5));
  b('chest').quaternion.setFromEuler(E.set(P.cp || 0, (P.tw || 0) * 0.6, (P.sroll || 0) * 0.5));
  const uc = b('upperChest');
  if (uc) uc.quaternion.identity();
  const nk = b('neck');
  if (nk) nk.quaternion.setFromEuler(E.set((P.hd || 0) * 0.4, (P.hy || 0) * 0.4, 0));
  b('head').quaternion.setFromEuler(E.set((P.hd || 0) * (nk ? 0.6 : 1), (P.hy || 0) * (nk ? 0.6 : 1), 0));
  const hipInv = P.legBody ? new THREE.Quaternion() : hipQ.clone().invert();
  for (const [side, l] of [
    ['left', P.L],
    ['right', P.R]
  ]) {
    let [th, sh] = legDirs(l);
    if (side === 'right') {
      th.x = -th.x;
      sh.x = -sh.x;
    }
    const qT = new THREE.Quaternion().setFromUnitVectors(DOWN, th);
    b(side + 'UpperLeg').quaternion.copy(hipInv.clone().multiply(qT));
    const qS = new THREE.Quaternion().setFromUnitVectors(DOWN, sh);
    b(side + 'LowerLeg').quaternion.copy(qT.clone().invert().multiply(qS));
    const qF = QA.setFromEuler(E.set(l.f || 0, 0, 0));
    b(side + 'Foot').quaternion.copy(qS.clone().invert().multiply(qF));
    const toe = b(side + 'Toes');
    if (toe) toe.quaternion.setFromEuler(E.set(-(l.f || 0) * 0.4, 0, 0));
  }
  const arms = [
    ['left', P.al, REST_L, 1],
    ['right', P.ar || mirror(P.al), REST_R, -1]
  ];
  for (const [side, A, rest, sg] of arms) {
    const [u, f, h, twU, twF] = A;
    const sh = b(side + 'Shoulder');
    if (sh) sh.quaternion.setFromEuler(E.set(0, 0, sg * (P.shrug || 0)));
    const qU = aim(rest, u, twU),
      qF = aim(rest, f, (twF || 0) * (P.fsplit ?? 1)), // fsplit < 1: part of the forearm twist moves to the wrist (no elbow wrap)
      qH = aim(rest, h || f, twF);
    b(side + 'UpperArm').quaternion.copy(qU);
    b(side + 'LowerArm').quaternion.copy(qU.clone().invert().multiply(qF));
    b(side + 'Hand').quaternion.copy(qF.clone().invert().multiply(qH));
    const curl = (side === 'left' ? P.curlL : P.curlR) ?? P.curl ?? 0.35;
    for (const fn of ['Index', 'Middle', 'Ring', 'Little'])
      for (const seg of ['Proximal', 'Intermediate', 'Distal']) {
        const n = b(side + fn + seg);
        if (n) n.quaternion.setFromEuler(E.set(0, 0, sg * -curl * 1.25));
      }
    for (const seg of ['Metacarpal', 'Proximal', 'Distal']) {
      const n = b(side + 'Thumb' + seg);
      if (n) n.quaternion.setFromEuler(E.set(0, sg * curl * 0.5, sg * -curl * 0.3));
    }
  }
}
/** Every bone the poses drive (for smoothing). */
const DRIVEN = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  ...['left', 'right'].flatMap(s => [
    `${s}UpperLeg`,
    `${s}LowerLeg`,
    `${s}Foot`,
    `${s}Toes`,
    `${s}Shoulder`,
    `${s}UpperArm`,
    `${s}LowerArm`,
    `${s}Hand`,
    ...['Index', 'Middle', 'Ring', 'Little'].flatMap(f => ['Proximal', 'Intermediate', 'Distal'].map(g => `${s}${f}${g}`)),
    ...['Metacarpal', 'Proximal', 'Distal'].map(g => `${s}Thumb${g}`)
  ])
];
/** Ease every driven bone from its previous rotation toward the rotation just applied (k = 1/s response). */
export function smoothBones(pl, dt, k) {
  const a = 1 - Math.exp(-dt * k);
  for (const n of DRIVEN) {
    const node = pl.bone(n);
    if (!node) continue;
    const prev = pl.prev.get(n);
    if (prev && a < 1) node.quaternion.copy(prev.slerp(node.quaternion, a));
    pl.prev.set(n, node.quaternion.clone());
  }
}

/** Direction from a shoulder (or the shoulders' midpoint) to a world point, in torso space; plus the distance in metres. */
export function torsoDir(pl, target, which) {
  const b = pl.bone,
    frame = b('upperChest') || b('chest'),
    s = new THREE.Vector3(),
    v = new THREE.Vector3();
  if (which === 'both') {
    b('leftUpperArm').getWorldPosition(s);
    s.add(b('rightUpperArm').getWorldPosition(v)).multiplyScalar(0.5);
  } else b(which + 'UpperArm').getWorldPosition(s);
  const d = target.clone().sub(s),
    dist = d.length();
  const q = frame.getWorldQuaternion(new THREE.Quaternion()).invert();
  return { dir: d.applyQuaternion(q).normalize(), dist };
}
const lerpV = (a, b, t) => a.clone().lerp(b, t).normalize();
/** Bend an arm pose toward a torso-space direction (weight 0..1): straight arm, hand along the line. */
export function bendArm(arm, dir, w, keepHand = false) {
  if (w <= 0) return arm;
  return [lerpV(arm[0], dir, w), lerpV(arm[1], dir, w), keepHand ? arm[2] : lerpV(arm[2] || arm[1], dir, w), arm[3], arm[4]];
}

const tv = new THREE.Vector3();
/**
 * Keep the lowest foot (or, lying down, the lowest body point) on the floor; `lift` = jump height in metres.
 * In the air the hips carry the jump instead (tucked legs lift the feet, not lower the body), so the body really
 * rises by the jump height the stats give.
 */
export function groundSnap(pl, lift, lying) {
  const b = pl.bone,
    y0 = pl.root.position.y;
  pl.root.updateMatrixWorld(true);
  let low = Math.min(b('leftFoot').getWorldPosition(tv).y, b('rightFoot').getWorldPosition(tv).y) - y0,
    contact = pl.footRest * pl.scale;
  if (lying) {
    for (const n of ['chest', 'head', 'leftHand', 'rightHand', 'leftLowerLeg', 'rightLowerLeg', 'hips', 'leftFoot', 'rightFoot'])
      low = Math.min(low, b(n).getWorldPosition(tv).y - y0);
    contact = 0.1;
  }
  const onFoot = lift + contact - low,
    air = lying ? 0 : Math.min(1, Math.max(0, (lift - 0.08) / 0.3));
  pl.root.position.y = onFoot + (Math.max(lift, onFoot) - onFoot) * air;
}

/** Facial expression: eases toward the target weights; automatic blinks unless the face is intense. */
export function setFace(pl, target, dt) {
  const em = pl.vrm.expressionManager;
  if (!em) return;
  const k = 1 - Math.exp(-dt * 10);
  for (const n of ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'aa', 'oh']) {
    const cur = pl.face[n] || 0,
      v = cur + ((target[n] || 0) - cur) * k;
    pl.face[n] = v;
    em.setValue(n, v);
  }
  pl.blinkT -= dt;
  const bl = pl.blinkT < 0.12 ? Math.sin((Math.max(0, pl.blinkT) / 0.12) * Math.PI) : 0;
  if (pl.blinkT < 0) pl.blinkT = 2 + Math.random() * 3;
  em.setValue('blink', (target.angry || 0) > 0.5 || (target.surprised || 0) > 0.5 ? 0 : bl);
}
