// The named people on the 3D map as real players (spec §4.39 People, T-341; display only, no game randoms — variety from
// string hashes). Two levels of detail, both driven by life3d.mjs (which owns where everyone is and what they do):
//   createHumanoids(cap) → { mesh, set(i, x, y, z, yaw, lean, s, sy, pose), tint(i, shirt, skin, hair), count(n), dispose() }
//     the low-poly humanoid (head with hair, torso, arms and legs that swing) for everyone not drawn as a VRM: one InstancedMesh,
//     the limbs swung in the vertex shader by a per-instance pose `[legSwing, armSwing, armRaise, legBend]` (radians, + = forward).
//   createPeopleVRM(scene, opts) → { tick(dt, states, cam, on, street?), weight(id), count(), dispose() }
//     street = { street (0–1), near: { maxD }, cap } at street level (T-336a): the pick's reach shrinks toward near.maxD (m from the
//     camera) and its cap becomes `cap`.
//     the nearest `cap` named people on screen as the default VRM (players3d loadBase / makeVRM: one model file, parsed once
//     per slot with its geometry and textures shared; `dress` in their club's colours), posed with the match gait (locoPose),
//     a block-jump drill, sitting or standing. Slots are built one at a time after the map has shown (never the first frame).
//   nearestOnScreen(cands, cap, held, keep) — the LOD pick; insideCap(cands, n) — the station people's cap (pure, tested).
import * as THREE from 'three';
import {
  loadBase,
  makeVRM,
  applyPose,
  smoothBones,
  groundSnap,
  dress,
  wholeVRM,
  releaseVRM,
  warmVRM,
  MODEL_URL
} from '../render3d/players3d.mjs';
import { LOOK_CTX } from './look3d.mjs';
import { STAND, READY, locoPose, mix } from '../render3d/poses3d.mjs';
import { hstr, clamp, smooth } from './geo3d.mjs';
import { mergeParts } from './kit3d.mjs';

/** Display palettes for hashed looks (the people's own looks are not in the map model). */
const LOOKS = {
  skin: ['#f6d7b8', '#f3d2b3', '#eec39a', '#d9a877', '#b57c52', '#8a5a3c'],
  hair: ['#2b2d42', '#101010', '#8d5a3b', '#f2c14e', '#e4572e', '#4ea5d9', '#c3a1e6', '#eef0f5', '#1e7f86', '#b4202a', '#ffa94d', '#94a3b8']
};
export const lookOf = id => ({
  skin: LOOKS.skin[Math.floor(hstr(`lk${id}|s`) * LOOKS.skin.length)],
  hair: LOOKS.hair[Math.floor(hstr(`lk${id}|h`) * LOOKS.hair.length)]
});

// ---------- the low-poly humanoid ----------
// 1.45 m tall at scale 1 (like the old capsule figure), feet at the origin, facing +z. Vertex attributes: `part` (what the
// colour comes from: 0 shirt = the instance colour, 1 skin, 2 fixed = the vertex colour, 3 hair), `limb` (0 body, ±1 the left /
// right arm, ±2 the left / right leg) and `pivot` (the shoulder / hip height the limb swings about).
const HIP = 0.7,
  SHOULDER = 1.12;
const SHORTS = '#2b2f38',
  SHOES = '#e8e6e0';
function humanoidGeo() {
  const parts = [];
  const add = (g, part, limb = 0, pivot = 0, color = '#ffffff') => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    const c = new THREE.Color(color),
      k = n.attributes.position.count;
    n.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        new Array(k).fill(0).flatMap(() => [c.r, c.g, c.b]),
        3
      )
    );
    n.setAttribute('part', new THREE.Float32BufferAttribute(new Array(k).fill(part), 1));
    n.setAttribute('limb', new THREE.Float32BufferAttribute(new Array(k).fill(limb), 1));
    n.setAttribute('pivot', new THREE.Float32BufferAttribute(new Array(k).fill(pivot), 1));
    if (n.attributes.uv) n.deleteAttribute('uv');
    parts.push(n);
  };
  add(new THREE.CylinderGeometry(0.17, 0.135, 0.44, 7).translate(0, 0.92, 0), 0); // torso (shirt)
  add(new THREE.CylinderGeometry(0.14, 0.15, 0.16, 7).translate(0, HIP + 0.02, 0), 2, 0, 0, SHORTS); // hips (shorts)
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 5).translate(0, 1.18, 0), 1); // neck
  add(new THREE.IcosahedronGeometry(0.125, 1).translate(0, 1.3, 0.01), 1); // head
  add(new THREE.SphereGeometry(0.138, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.315, -0.012), 3); // hair
  for (const sd of [1, -1]) {
    const x = 0.215 * sd;
    add(new THREE.CylinderGeometry(0.058, 0.05, 0.22, 5).translate(x, SHOULDER - 0.1, 0), 0, sd, SHOULDER); // sleeve
    add(new THREE.CylinderGeometry(0.045, 0.036, 0.36, 5).translate(x, SHOULDER - 0.38, 0), 1, sd, SHOULDER); // forearm + hand
    const lx = 0.085 * sd;
    add(new THREE.CylinderGeometry(0.075, 0.068, 0.2, 5).translate(lx, HIP - 0.08, 0), 2, 2 * sd, HIP, SHORTS); // shorts leg
    add(new THREE.CylinderGeometry(0.06, 0.045, 0.46, 5).translate(lx, HIP - 0.4, 0), 1, 2 * sd, HIP); // leg
    add(new THREE.BoxGeometry(0.1, 0.07, 0.2).translate(lx, 0.035, 0.035), 2, 2 * sd, HIP, SHOES); // shoe
  }
  return mergeParts(parts);
}
const LIMB_GLSL = `attribute float part; attribute float limb; attribute float pivot; attribute vec4 iPose; attribute vec3 iSkin; attribute vec3 iHair;
mat3 limbRot() {
  float a = limb > 1.5 ? iPose.w + iPose.x : limb > 0.5 ? iPose.z + iPose.y : limb < -1.5 ? iPose.w - iPose.x : limb < -0.5 ? iPose.z - iPose.y : 0.0;
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c); // about x: + swings the limb forward (+z)
}`;
const swingVertex = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${LIMB_GLSL}`).replace(
    '#include <begin_vertex>',
    `vec3 transformed = vec3(position);
      if (abs(limb) > 0.5) transformed = limbRot() * (transformed - vec3(0.0, pivot, 0.0)) + vec3(0.0, pivot, 0.0);`
  );
};
const swingMaterials = () => {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = sh => {
    swingVertex(sh);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3(normal);\nif (abs(limb) > 0.5) objectNormal = limbRot() * objectNormal;`
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        vColor *= part < 0.5 ? instanceColor.xyz : part < 1.5 ? iSkin : part < 2.5 ? vec3(1.0) : iHair;`
      );
  };
  mat.customProgramCacheKey = () => 'sns-humanoid';
  depth.onBeforeCompile = swingVertex;
  depth.customProgramCacheKey = () => 'sns-humanoid-depth';
  return { mat, depth };
};

export function createHumanoids(cap) {
  const geo = humanoidGeo(),
    { mat, depth } = swingMaterials(),
    pose = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
    skin = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(0.9), 3),
    hair = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(0.2), 3);
  geo.setAttribute('iPose', pose);
  geo.setAttribute('iSkin', skin);
  geo.setAttribute('iHair', hair);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); // (the shader reads it from the start)
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  const D = new THREE.Object3D(),
    C = new THREE.Color();
  return {
    mesh,
    /** Instance i: feet at (x, y, z), turned yaw, leaning forward `lean`, scale s (height × sy), limbs [leg, arm, raise, bend]. */
    set(i, x, y, z, yaw, lean, s, sy, P) {
      D.position.set(x, y, z);
      D.rotation.set(lean, yaw, 0);
      D.scale.set(s, s * sy, s);
      D.updateMatrix();
      mesh.setMatrixAt(i, D.matrix);
      pose.setXYZW(i, P[0], P[1], P[2], P[3]);
    },
    tint(i, shirt, sk, hr) {
      mesh.setColorAt(i, C.set(shirt));
      C.set(sk);
      skin.setXYZ(i, C.r, C.g, C.b);
      C.set(hr);
      hair.setXYZ(i, C.r, C.g, C.b);
    },
    count(n) {
      mesh.count = n;
      mesh.instanceColor.needsUpdate = skin.needsUpdate = hair.needsUpdate = true;
    },
    flush() {
      mesh.instanceMatrix.needsUpdate = pose.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      depth.dispose();
      mesh.dispose();
    }
  };
}

// ---------- the VRM level of detail ----------
/**
 * The ids to draw as VRMs: `cands` = [{ id, d }] (on screen, d = distance to the camera); the `cap` nearest, those already
 * shown (`held`, a Set) counted as `keep` × nearer so two people at about the same distance don't swap back and forth.
 */
/** Keep only the n nearest candidates marked `inside` (an interior's station people); the rest are dropped in place (pure). */
export function insideCap(cands, n) {
  const ins = cands.filter(c => c.inside).sort((a, b) => a.d - b.d || (String(a.id) < String(b.id) ? -1 : 1));
  if (ins.length <= n) return cands;
  const drop = new Set(ins.slice(n).map(c => c.id));
  for (let i = cands.length - 1; i >= 0; i--) if (drop.has(cands[i].id)) cands.splice(i, 1);
  return cands;
}
export function nearestOnScreen(cands, cap, held, keep = 0.8) {
  return new Set(
    cands
      .map(c => ({ id: c.id, k: c.d * (held && held.has(c.id) ? keep : 1) }))
      .sort((a, b) => a.k - b.k || (String(a.id) < String(b.id) ? -1 : 1))
      .slice(0, Math.max(0, cap))
      .map(c => c.id)
  );
}
/**
 * shadows: the nearest n cast one; full: the nearest n are posed every frame (the rest at least every 2nd); inside: at most n of the
 * people at an interior's stations (state `inside`, the nearest) are VRMs — the rest stay humanoids (performance, owner 2026-10-25).
 */
export const VRM_LOD = { cap: 16, maxD: 260, every: 0.25, fade: 0.3, delay: 1.5, gap: 0.35, shadows: 6, full: 3, inside: 4 };
/**
 * Auto at street level (owner 2026-10-26, a laptop GPU: people + VRMs were 76 draws): map3d sets `auto` (Auto's detailed look) and
 * `tight` (Auto's ladder has stepped down: look3d AUTO) each frame. Then the pool holds at most `cap` [normal, tight] VRMs, a VRM
 * draws its MToon outlines only within `outline` m of the camera (none when tight; you keep yours), and only the `shadows` nearest
 * within `outline` m cast. High and Fast: as before.
 */
export const VRM_Q = { auto: false, tight: false, cap: [3, 2], outline: 12, shadows: 2 };
/** Street level's VRM cap (pure, tested): SL = { street, cap } from life3d; Q = VRM_Q. Off street level: null (the map's cap). */
export function streetCap(SL, Q = VRM_Q) {
  if (!SL || !(SL.street > 0.5)) return null;
  return Q && Q.auto ? Math.min(SL.cap, Q.cap[Q.tight ? 1 : 0]) : SL.cap;
}
/** Whether a VRM at d m draws its outlines / casts (rank = its place by distance among the shown) — pure, tested. */
export function vrmDraws(d, rank, street, Q = VRM_Q, shadows = VRM_LOD.shadows) {
  const auto = !!(Q && Q.auto && street);
  return {
    outline: !auto || (!Q.tight && d <= Q.outline),
    shadow: rank < shadows && (!auto || (rank < Q.shadows && d <= Q.outline))
  };
}
/** Show / hide a VRM's MToon outline draws (its outline materials; listed once per root). */
export function setOutline(root, on) {
  const U = root.userData;
  if (U.olOn === on) return;
  if (!U.ol) {
    U.ol = [];
    root.traverse(o => {
      if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.isOutline) U.ol.push(m);
    });
  }
  for (const m of U.ol) m.visible = on;
  U.olOn = on;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.1) => ({ a, k, f, s });
// the drill: a block jump — crouched ready on the ground, arms straight up at the top
export const BLOCK = {
  ...STAND,
  hp: 0.02,
  sp: 0,
  cp: -0.04,
  hd: -0.15,
  hroll: 0,
  sroll: 0,
  L: leg(0.05, 0.12, -0.5, 0.08),
  R: leg(0.05, 0.12, -0.5, 0.08),
  al: [V(0.12, 1, 0.08), V(0.08, 1, 0.12), V(0.05, 1, 0.15)],
  ar: [V(-0.12, 1, 0.08), V(-0.08, 1, 0.12), V(-0.05, 1, 0.15)],
  curl: 0.15
};
// sitting on the ground: legs out in front, leaning back on the hands
export const SIT = {
  hp: 0.05,
  sp: -0.12,
  cp: -0.05,
  hd: 0.15,
  L: leg(1.45, 0.35, 0.3, 0.14),
  R: leg(1.35, 0.55, 0.3, 0.12),
  al: [V(0.35, -0.85, -0.4), V(0.3, -0.85, -0.45), V(0.2, -0.6, -0.8)],
  ar: [V(-0.35, -0.85, -0.4), V(-0.3, -0.85, -0.45), V(-0.2, -0.6, -0.8)],
  curl: 0.2
};
/**
 * A VRM mesh that shapes its shadow: not the face's inner parts (eyes, mouth, brows, eyeline — inside the head's own silhouette),
 * so a VRM casts with 7 of its 13 meshes (performance, owner 2026-10-25).
 */
export const shadowPart = o => {
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return !/_(EYE|FACE)$/.test((m && m.name) || '');
};
/**
 * The ready rule (T-368, spec §4.44): a pool slot is drawn only when its VRM is whole (textures decoded: `ready`), dressed for
 * the person it holds (`kit` = their shirt | hair | skin) and faded in — else that person stays their humanoid (pure, tested).
 */
const kitOf = f => `${f.shirt}|${f.hair}|${f.skin}`;
export const showVRM = (S, f) => !!f && !!S.ready && S.id !== null && S.kit === kitOf(f) && S.k > 0.01;
/** Dress a slot for f (synchronous, all materials at once) unless it already wears f's kit. */
const dressAs = (S, f) => {
  const kit = kitOf(f);
  if (S.kit === kit) return;
  dress(S.pl.vrm, { shirt: f.shirt, shorts: SHORTS, shoes: SHOES, hair: f.hair, skin: f.skin });
  S.kit = kit;
};
const HEAD = 1.42; // the VRM's head top at figure scale 1 (the humanoid's: 1.45 m)

/**
 * The VRM pool. tick(dt, states, cam, on): states = Map id → { vis, x, y (ground), z, yaw, mode ('walk' | 'idle'), act, s,
 * lift, shirt, skin, hair, g }; on = false hides every VRM (the Fast setting). weight(id) = 0–1, how far that person has faded
 * into their VRM (life3d shrinks their humanoid by it).
 */
const PX800 = 400; // (half of a reference 800 px view: the LOD's px without the canvas size)
/** Between poses: the figure only moves (its last ground snap kept). */
const pl3 = (S, f) => {
  S.pl.root.rotation.set(0, f.yaw, 0);
  S.pl.root.position.set(f.x, (S.dy || 0) + f.y, f.z);
};
export function createPeopleVRM(scene, opts = {}) {
  const O = { ...VRM_LOD, ...opts },
    slots = [], // { pl, base (root scale at s = 1), id, k, kit, phase, w, px, pz, t }
    wt = new Map(),
    P = new THREE.Vector3(),
    held = new Set(),
    fr = new THREE.Frustum(),
    fm = new THREE.Matrix4(),
    sph = new THREE.Sphere();
  let buf = null,
    loading = false,
    failed = false,
    building = false,
    dead = false,
    age = 0,
    lodT = 0,
    gapT = 0,
    want = new Set(),
    near = new Map(); // id → rank by distance among the shown (the nearest cast shadows)
  const build = () => {
    building = true;
    makeVRM(buf, HEAD)
      .then(pl => {
        building = false;
        gapT = O.gap;
        if (dead) return releaseVRM(pl.vrm);
        pl.vrm.springBoneManager = null; // hair stays put on the map: no springs to step
        pl.root.visible = false;
        scene.add(pl.root);
        const meshes = [];
        pl.vrm.scene.traverse(o => o.isMesh && (shadowPart(o) ? meshes.push(o) : (o.castShadow = false)));
        // (pacing 2026-10-27: dressed once now — the grey hair / iris textures are made here, not in the frame a person takes the
        // slot — then warmed: textures uploaded, programs compiled for the map's buffer; the slot takes a person only after)
        dress(pl.vrm, { shirt: '#ffffff', shorts: SHORTS, shoes: SHOES, hair: '#000000', skin: '#f6d7b8' });
        const slot = {
          pl,
          meshes,
          sh: true,
          base: pl.scale,
          id: null,
          k: 0,
          kit: null,
          phase: 0,
          w: 0,
          px: 0,
          pz: 0,
          t: hstr(`slot${slots.length}`) * 9,
          warm: false,
          ready: wholeVRM(pl.vrm) // (T-368: a slot takes a person only once whole)
        };
        slots.push(slot);
        warmVRM(pl.root, LOOK_CTX).then(() => (slot.warm = true));
      })
      .catch(e => {
        building = false;
        failed = true;
        console.warn('3D map: people models failed — keeping the figures.', e && e.message ? e.message : e);
      });
  };
  const lod = (states, cam, SL) => {
    const cands = [],
      maxD = SL ? O.maxD + (SL.near.maxD - O.maxD) * smooth(0, 1, SL.street) : O.maxD,
      cap = streetCap(SL) ?? O.cap;
    for (const [id, f] of states) {
      if (!f.vis || f.g === 'grey') continue; // unscouted: grey silhouettes stay
      P.set(f.x, f.y + 0.7 * f.s, f.z);
      const d = P.distanceTo(cam.position);
      if (d > maxD) continue;
      P.project(cam);
      if (P.z > 1 || Math.abs(P.x) > 1.05 || Math.abs(P.y) > 1.1) continue;
      cands.push({ id, d, inside: !!f.inside });
    }
    insideCap(cands, O.inside);
    held.clear();
    for (const s of slots) if (s.id !== null && s.k > 0) held.add(s.id);
    want = nearestOnScreen(cands, cap, held);
    near = new Map(
      cands
        .filter(c => want.has(c.id))
        .sort((a, b) => a.d - b.d)
        .map((c, i) => [c.id, i])
    );
  };
  const pose = (S, f, dt) => {
    const pl = S.pl,
      ls = (HEAD * f.s) / 1.65, // the figure's size × life size (for the gait)
      v = dt > 0 ? Math.hypot(f.x - S.px, f.z - S.pz) / dt : 0,
      moving = f.mode === 'walk' || f.act === 'hustle',
      gait = moving ? clamp(v / ls, 0, 6) : 0;
    S.px = f.x;
    S.pz = f.z;
    S.t += dt;
    S.phase += ((gait * dt) / (1.6 + 0.8 * clamp((gait - 2.5) / 1.5, 0, 1))) * Math.PI * 2;
    S.w += ((moving ? clamp(gait, 0, 1) : 0) - S.w) * (1 - Math.exp(-dt * 10));
    const sway = Math.sin(S.t * 1.7),
      idle = { ...STAND, cp: 0.02 * sway, sp: 0.02 + 0.012 * sway };
    let p = idle,
      lift = 0,
      lying = false;
    if (moving) p = S.w > 0.01 ? mix(idle, locoPose({ speed: gait, fwd: gait, lat: 0, phase: S.phase }), S.w) : idle;
    else if (f.act === 'train' || f.act === 'hard') {
      const top = 0.22 * f.s;
      lift = f.lift || 0;
      p = mix(READY, BLOCK, smooth(0, 1, lift / top));
    } else if (f.act === 'wit' || f.act === 'rest' || f.act === 'out') ((p = SIT), (lying = true));
    pl.scale = S.base * f.s * (0.85 + 0.15 * S.k);
    pl.root.scale.setScalar(pl.scale);
    pl.root.rotation.set(0, f.yaw, 0);
    pl.root.position.set(f.x, 0, f.z);
    applyPose(pl, p);
    smoothBones(pl, dt, 14);
    groundSnap(pl, lift, lying);
    S.dy = pl.root.position.y;
    pl.root.position.y += f.y;
    pl.vrm.update(dt);
  };
  /** Performance (owner, 2026-10-25): a small VRM on screen is posed every few frames (AV_LOD in avatar3d: by its height in px). */
  const every = (f, cam) => {
    const d = Math.max(1, Math.hypot(f.x - cam.position.x, f.y - cam.position.y, f.z - cam.position.z)),
      px = (HEAD * f.s * PX800) / (d * Math.tan((cam.fov * Math.PI) / 360));
    return px < 24 ? 4 : px < 60 ? 2 : 1;
  };
  return {
    tick(dt, states, cam, on = true, SL = null) {
      age += dt;
      if (!on) {
        for (const S of slots) ((S.id = null), (S.k = 0), (S.pl.root.visible = false));
        wt.clear();
        return;
      }
      if (!buf && !loading && !failed && age > O.delay) {
        loading = true;
        loadBase(MODEL_URL)
          .then(b => (buf = b))
          .catch(() => (failed = true));
      }
      if ((lodT -= dt) <= 0) {
        lodT = O.every;
        lod(states, cam, SL);
      }
      // free slots fade out; new people take a free slot (or a new one is built, one at a time)
      for (const S of slots) {
        const f = S.id !== null ? states.get(S.id) : null;
        const keep = f && f.vis && want.has(S.id);
        S.k = clamp(S.k + (keep ? dt : -dt * 1.5) / O.fade, 0, 1);
        if (!keep && S.k <= 0) S.id = null;
      }
      gapT -= dt;
      for (const id of want) {
        const f = states.get(id);
        if (!f || slots.some(S => S.id === id)) continue; // (!f: gone since the last LOD pick — a re-sync, e.g. Fast's fewer people)
        const S = slots.find(q => q.id === null && q.warm && (q.ready || (q.ready = wholeVRM(q.pl.vrm))));
        if (S) {
          S.id = id;
          S.k = 0;
          S.px = f.x;
          S.pz = f.z;
          S.pl.prev.clear();
          dressAs(S, f);
        } else if (buf && !building && !failed && slots.length < O.cap && gapT <= 0) build();
        break; // one assignment a frame
      }
      wt.clear();
      fr.setFromProjectionMatrix(fm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); // (last frame's camera)
      for (const S of slots) {
        const f = S.id !== null ? states.get(S.id) : null;
        if (f && S.ready) dressAs(S, f); // (their kit changed while shown: re-dressed in one go, before this frame draws)
        S.pl.root.visible = showVRM(S, f);
        if (!S.pl.root.visible) continue;
        wt.set(S.id, S.k);
        sph.center.set(f.x, f.y + 0.9 * f.s, f.z);
        sph.radius = 1.3 * f.s;
        if (!fr.intersectsSphere(sph)) {
          // off screen (behind the camera, beside it): not drawn, not posed — posed at once when back
          S.pl.root.visible = false;
          S.acc = (S.acc || 0) + dt;
          S.fr = 99;
          continue;
        }
        const rank = near.get(S.id) ?? O.cap,
          Dw = vrmDraws(cam.position.distanceTo(sph.center), rank, !!(SL && SL.street > 0.5), VRM_Q, O.shadows),
          sh = Dw.shadow;
        if (sh !== S.sh) for (const m of S.meshes) m.castShadow = sh;
        S.sh = sh;
        setOutline(S.pl.root, Dw.outline);
        S.acc = (S.acc || 0) + dt;
        if ((S.fr = (S.fr || 0) + 1) < Math.max(every(f, cam), rank < O.full ? 1 : 2)) {
          pl3(S, f);
          continue;
        }
        pose(S, f, Math.min(S.acc, 0.1));
        S.acc = S.fr = 0;
      }
    },
    /** How far a person has faded into their VRM (0 = the humanoid only). */
    weight: id => wt.get(id) || 0,
    count: () => ({ vrm: slots.reduce((n, S) => n + (S.pl.root.visible ? 1 : 0), 0), built: slots.length, cap: O.cap }),
    dispose() {
      dead = true;
      for (const S of slots) {
        scene.remove(S.pl.root);
        releaseVRM(S.pl.vrm);
      }
      slots.length = 0;
    }
  };
}
