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
//   nearestOnScreen(cands, cap, held, keep) — the LOD pick (pure, tested).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VRMUtils } from '@pixiv/three-vrm';
import { loadBase, makeVRM, applyPose, smoothBones, groundSnap, dress, MODEL_URL } from '../render3d/players3d.mjs';
import { STAND, READY, locoPose, mix } from '../render3d/poses3d.mjs';
import { hstr, clamp, smooth } from './geo3d.mjs';

/** Display palettes for hashed looks (the people's own looks are not in the map model). */
export const LOOKS = {
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
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
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
export function nearestOnScreen(cands, cap, held, keep = 0.8) {
  return new Set(
    cands
      .map(c => ({ id: c.id, k: c.d * (held && held.has(c.id) ? keep : 1) }))
      .sort((a, b) => a.k - b.k || (String(a.id) < String(b.id) ? -1 : 1))
      .slice(0, Math.max(0, cap))
      .map(c => c.id)
  );
}
export const VRM_LOD = { cap: 16, maxD: 260, every: 0.25, fade: 0.3, delay: 1.5, gap: 0.35, shadows: 6 }; // shadows: the nearest n cast one

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.1) => ({ a, k, f, s });
// the drill: a block jump — crouched ready on the ground, arms straight up at the top
const BLOCK = {
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
const SIT = {
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
const HEAD = 1.42; // the VRM's head top at figure scale 1 (the humanoid's: 1.45 m)

/**
 * The VRM pool. tick(dt, states, cam, on): states = Map id → { vis, x, y (ground), z, yaw, mode ('walk' | 'idle'), act, s,
 * lift, shirt, skin, hair, g }; on = false hides every VRM (the Fast setting). weight(id) = 0–1, how far that person has faded
 * into their VRM (life3d shrinks their humanoid by it).
 */
export function createPeopleVRM(scene, opts = {}) {
  const O = { ...VRM_LOD, ...opts },
    slots = [], // { pl, base (root scale at s = 1), id, k, kit, phase, w, px, pz, t }
    wt = new Map(),
    P = new THREE.Vector3(),
    held = new Set();
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
        if (dead) return VRMUtils.deepDispose(pl.vrm.scene);
        pl.vrm.springBoneManager = null; // hair stays put on the map: no springs to step
        pl.root.visible = false;
        scene.add(pl.root);
        const meshes = [];
        pl.vrm.scene.traverse(o => o.isMesh && meshes.push(o));
        slots.push({
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
          t: hstr(`slot${slots.length}`) * 9
        });
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
      cap = SL && SL.street > 0.5 ? SL.cap : O.cap;
    for (const [id, f] of states) {
      if (!f.vis || f.g === 'grey') continue; // unscouted: grey silhouettes stay
      P.set(f.x, f.y + 0.7 * f.s, f.z);
      const d = P.distanceTo(cam.position);
      if (d > maxD) continue;
      P.project(cam);
      if (P.z > 1 || Math.abs(P.x) > 1.05 || Math.abs(P.y) > 1.1) continue;
      cands.push({ id, d });
    }
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
    pl.root.position.y += f.y;
    pl.vrm.update(dt);
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
      const shown = new Set(slots.map(S => S.id));
      for (const id of want) {
        const f = states.get(id);
        if (shown.has(id) || !f) continue; // (!f: gone since the last LOD pick — a re-sync, e.g. Fast's fewer people)
        const S = slots.find(q => q.id === null);
        if (S) {
          S.id = id;
          S.k = 0;
          S.px = f.x;
          S.pz = f.z;
          S.pl.prev.clear();
          const kit = `${f.shirt}|${f.hair}|${f.skin}`;
          if (S.kit !== kit) {
            dress(S.pl.vrm, { shirt: f.shirt, shorts: SHORTS, shoes: SHOES, hair: f.hair, skin: f.skin });
            S.kit = kit;
          }
        } else if (buf && !building && !failed && slots.length < O.cap && gapT <= 0) build();
        break; // one assignment a frame
      }
      wt.clear();
      for (const S of slots) {
        const f = S.id !== null ? states.get(S.id) : null;
        S.pl.root.visible = !!f && S.k > 0.01;
        if (!S.pl.root.visible) continue;
        wt.set(S.id, S.k);
        const sh = (near.get(S.id) ?? O.cap) < O.shadows;
        if (sh !== S.sh) for (const m of S.meshes) m.castShadow = sh;
        S.sh = sh;
        pose(S, f, dt);
      }
    },
    /** How far a person has faded into their VRM (0 = the humanoid only). */
    weight: id => wt.get(id) || 0,
    count: () => ({ vrm: slots.filter(S => S.pl.root.visible).length, built: slots.length, cap: O.cap }),
    dispose() {
      dead = true;
      for (const S of slots) {
        scene.remove(S.pl.root);
        VRMUtils.deepDispose(S.pl.vrm.scene);
      }
      slots.length = 0;
    }
  };
}
