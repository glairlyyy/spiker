// Cameras and projection: the game camera (broadcast / courtside, following the ball), staged scene shots (face,
// over-the-shoulder, wall, spike, ball close-ups with hard cuts), the court → screen projection P3D that the 2D
// overlay uses, and the 2D view transform (shake / push-in / zoom) applied to the render projection.
import * as THREE from 'three';
import { KH, KX, KZ } from './units3d.mjs';

const CAM = { pos: [-2.59, 14.011, 33.007], look: [-0.059, 3.294, 0.012], fov: 20.357 }; // fitted to the classic framing
export const ASPECT = 1000 / 440;
let world = null; // the built world (players, ball) for scene shots
export const setCameraWorld = w => (world = w);

export const base = new THREE.PerspectiveCamera(CAM.fov, ASPECT, 0.5, 200),
  cam = base.clone(),
  fwd = new THREE.Vector3();
let focal = 220 / Math.tan((CAM.fov * Math.PI) / 360); // logical px per unit at distance 1
let camMode = (() => {
  try {
    return localStorage.getItem('sc.cam3d') || 'courtside';
  } catch (e) {
    return 'courtside';
  }
})();
const camState = { x: 0, blend: camMode === 'courtside' ? 1 : 0 };
/** Broadcast = the classic full-court framing; courtside = closer and lower, following the ball along the court. */
export function updateBase(dt) {
  const tgt = camMode === 'courtside' ? 1 : 0;
  camState.blend += (tgt - camState.blend) * (1 - Math.exp(-dt * 2.5));
  const bx = A && A.ball.vis ? Math.max(-6.5, Math.min(6.5, (A.ball.x - 500) * KX * 0.75)) : 0;
  camState.x += (bx - camState.x) * (1 - Math.exp(-dt * 1.6));
  const k = camState.blend,
    pos = new THREE.Vector3(...CAM.pos).lerp(new THREE.Vector3(camState.x * 0.85, 3.3, 14.5), k),
    look = new THREE.Vector3(...CAM.look).lerp(new THREE.Vector3(camState.x, 1.55, -0.8), k);
  let fov = CAM.fov + (31 - CAM.fov) * k;
  // staged scene shot (A.shot from playback): hard cuts between shots, a quick ease in and out of the game camera
  const want = A && A.shot && world ? A.shot : null,
    key = want ? `${want.kind}|${want.p}|${want.p2 || ''}` : '';
  if (key && (key !== shot.key || shot.age < 0.2)) {
    // (re)frame: on a new shot, and for its first moments while the players settle into their poses
    const sp = shotPose(want);
    if (sp) {
      if (key !== shot.key) {
        if (shot.k > 0.5) shot.k = 1; // cut
        shot.age = 0;
      }
      Object.assign(shot, sp, { key });
    }
  }
  shot.age = (shot.age || 0) + dt;
  if (!key) shot.key = '';
  shot.k += ((shot.key ? 1 : 0) - shot.k) * (1 - Math.exp(-dt * (shot.key ? 16 : 5)));
  if (shot.k > 0.001) {
    const e = shot.k * shot.k * (3 - 2 * shot.k);
    pos.lerp(shot.pos, e);
    look.lerp(shot.look, e);
    fov += (shot.fov - fov) * e;
  }
  base.position.copy(pos);
  base.lookAt(look);
  base.fov = fov;
  base.updateMatrixWorld(true);
  base.updateProjectionMatrix();
  base.getWorldDirection(fwd);
  focal = 220 / Math.tan((base.fov * Math.PI) / 360);
  cam.position.copy(base.position);
  cam.quaternion.copy(base.quaternion);
  cam.updateMatrixWorld(true);
}
/** Camera for a scene shot: face close-up, over the setter's shoulder at the hitter, or from behind the block. */
const shot = { k: 0, key: '', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30 };
function shotPose(s) {
  const find = id => world.people.find(pl => pl.d && pl.d.p.id === id),
    a = find(s.p);
  if (!a) return null;
  const up = new THREE.Vector3(0, 1, 0),
    H = a.bone('head').getWorldPosition(new THREE.Vector3());
  if (s.kind === 'face') {
    const f = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
      r = new THREE.Vector3().crossVectors(f, up).normalize();
    return {
      pos: H.clone()
        .addScaledVector(f, 1.2)
        .addScaledVector(r, 0.3)
        .add(new THREE.Vector3(0, 0.05, 0)),
      look: H.clone().add(new THREE.Vector3(0, -0.07, 0)),
      fov: 30
    };
  }
  const b = s.p2 && find(s.p2),
    T = b ? b.bone('head').getWorldPosition(new THREE.Vector3()) : H.clone().add(new THREE.Vector3(0, 0, 1)),
    d = T.clone().sub(H).setY(0).normalize(),
    r = new THREE.Vector3().crossVectors(d, up).normalize();
  if (s.kind === 'spike') {
    // low and to the side of the hitter in the air, looking up past the arm at the ball
    const f = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
      rr = new THREE.Vector3().crossVectors(f, up).normalize();
    return {
      pos: H.clone()
        .addScaledVector(rr, 2.1)
        .addScaledVector(f, 0.5)
        .add(new THREE.Vector3(0, -0.6, 0)),
      look: H.clone()
        .addScaledVector(f, 0.2)
        .add(new THREE.Vector3(0, 0.15, 0)),
      fov: 40
    };
  }
  if (s.kind === 'ball') {
    // at the ball against the blocker's hands, from the hitter's side
    const bp = world.ball.position.clone(),
      toA = (b ? T.clone() : bp.clone().add(new THREE.Vector3(1, 0, 0))).sub(bp).setY(0).normalize(),
      rr = new THREE.Vector3().crossVectors(toA, up).normalize();
    return {
      pos: bp
        .clone()
        .addScaledVector(toA, 1.9)
        .addScaledVector(rr, 0.7)
        .add(new THREE.Vector3(0, 0.3, 0)),
      look: bp.clone().addScaledVector(toA, -0.15),
      fov: 38
    };
  }
  if (s.kind === 'ots')
    return {
      pos: H.clone()
        .addScaledVector(d, -1)
        .addScaledVector(r, 0.45)
        .add(new THREE.Vector3(0, 0.22, 0)),
      look: T,
      fov: 38
    };
  return {
    pos: H.clone()
      .addScaledVector(d, -1.6)
      .addScaledVector(r, -0.4)
      .add(new THREE.Vector3(0, 0.5, 0)),
    look: T.clone().lerp(H, 0.25),
    fov: 44
  };
}
updateBase(1);
const pv = new THREE.Vector3(),
  pw = new THREE.Vector3();
/** Court → logical screen (the P() contract): X 0..1000, Y from VT, s = screen px per height unit. */
export function P3D(x, z, h) {
  pw.set((x - 500) * KX, h * KH, (0.5 - z) * KZ);
  pv.copy(pw).project(base);
  const depth = Math.max(1, pw.sub(base.position).dot(fwd));
  return { X: (pv.x + 1) * 500, Y: VT + (1 - pv.y) * 220, s: (focal * KH) / depth };
}
/** Apply the 2D view transform (screen = f·p + o in logical units: shake, push-in, zoom) to the render projection. */
const M = new THREE.Matrix4();
let dbg = null;
/** Test hook: a free camera ({ pos, look, fov }) or null. */
export const setDebugCam = c => (dbg = c);
export function viewCamera(V) {
  if (dbg) {
    // test hook: free camera (the overlay no longer lines up)
    cam.position.set(...dbg.pos);
    cam.lookAt(...dbg.look);
    cam.updateMatrixWorld(true);
    const pc = new THREE.PerspectiveCamera(dbg.fov || 30, ASPECT, 0.05, 200);
    cam.projectionMatrix.copy(pc.projectionMatrix);
    cam.projectionMatrixInverse.copy(pc.projectionMatrixInverse);
    return;
  }
  const f = V.f,
    bx = f - 1 + V.ox / 500,
    by = 1 - f - (VT * (f - 1) + V.oy) / 220;
  M.set(f, 0, 0, bx, 0, f, 0, by, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.projectionMatrix.copy(base.projectionMatrix).premultiply(M);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}
export function setCamMode(m) {
  camMode = m;
  try {
    localStorage.setItem('sc.cam3d', m);
  } catch (e) {
    // storage blocked (private mode / sandboxed frame): the choice just isn't remembered
  }
}
export const getCamMode = () => camMode;
