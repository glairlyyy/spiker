// 3D players: VRM model loading and recolouring, pose application, arm aiming at the ball, feet on the floor, faces.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));
const bufCache = new Map();

/** Download a base model (served as base64 text) once; progress 0..1. */
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

/** Hair textures are brown in the base model: greyscale + brighten so a material colour can tint any anime hair. */
function greyTexture(tex, filter) {
  if (!tex || !tex.image) return tex;
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
    if (n.startsWith('Tops')) tint(kit.shirt);
    else if (n.startsWith('Bottoms')) tint(kit.shorts || '#ffffff', 0.7);
    else if (n.startsWith('Shoes')) tint(kit.shoes || '#ffffff', 0.75);
    else if (/HAIR/.test(n)) {
      if (!m.userData.grey) {
        m.map = greyTexture(m.map, 'grayscale(1) brightness(2.1) contrast(1.15)');
        if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = m.map;
        m.userData.grey = true;
        m.needsUpdate = true;
      }
      tint(kit.hair, 0.6);
    } else if (/EyeIris/.test(n)) {
      if (!m.userData.grey) {
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

/** Parse a VRM from the shared buffer and wrap it in a root group scaled to `height` metres. */
export async function makeVRM(buf, height) {
  const gltf = await loader.parseAsync(buf.slice(0), '');
  const vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
  vrm.scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
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
const mirror = arm => arm.map((v, i) => (i < 3 ? new THREE.Vector3(-v.x, v.y, v.z) : -(v || 0)));
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
 * directions in torso space; the right arm defaults to the mirror of the left.
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
      qF = aim(rest, f, twF),
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
