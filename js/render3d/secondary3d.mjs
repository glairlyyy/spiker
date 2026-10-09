// Secondary motion (owner, 2026-10-10; display only): the body follows the legs. Weight shift and hip sway come with the
// gait (poses3d forwardGait `sway` / hroll); here: the torso lagging the hips on a sudden turn and leaning into it, the head
// held steady on the ball while running, and a settling spring on landing. Called by actors3d posePlayer in that order:
// turnLag before the pose is applied, settleSink after the grounding (before the foot IK, which bends the knees for it),
// headSteady last. Tuned by VFX `sec` (js/data/vfx.js).
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const UP = new THREE.Vector3(0, 1, 0),
  hp = new THREE.Vector3(),
  dir = new THREE.Vector3(),
  aim = new THREE.Vector3(),
  mL = new THREE.Matrix4(),
  qT = new THREE.Quaternion(),
  qC = new THREE.Quaternion(),
  qP = new THREE.Quaternion();

/**
 * A sudden turn: the hips lead, the shoulders follow (the spine twists against the body's turn speed, pl.yawV), and running
 * the body leans into the turn. The head keeps its aim (it is turned back by the same twist). Before applyPose.
 */
export function turnLag(pl, d, pose, mot) {
  const C = VFX.sec;
  if (!C.on || pose.lying || d.pose === 'dive') return;
  const v = pl.yawV || 0,
    lag = clamp(-v * 0.08 * C.lag, -0.4, 0.4),
    lean = clamp(-v * clamp(mot.speed - 1, 0, 6) * 0.025 * C.lean, -0.22, 0.22);
  pose.tw = (pose.tw || 0) + lag;
  pose.hy = (pose.hy || 0) - lag;
  pose.hroll = (pose.hroll || 0) + lean;
}

/**
 * Landing: a damped spring (pl.sett) kicked by the fall — the hips sink and come back up with a small overshoot. Returns
 * the sink in metres (actors3d lowers the root by it after the grounding; the foot IK keeps the feet on the floor, so the
 * knees take it). The hips also pitch forward a little with it (pose.hp, before applyPose).
 */
export function landSpring(pl, d, pose, dt) {
  const C = VFX.sec,
    s = pl.sett || (pl.sett = { x: 0, v: 0, peak: 0, air: false }),
    jy = d.jy || 0;
  if (jy > 6) {
    s.air = true;
    s.peak = Math.max(s.peak, jy);
  } else if (s.air && jy <= 1) {
    // touchdown: the higher the jump, the harder the kick
    if (C.on && !pose.lying && d.pose !== 'dive') s.v += 18 * C.settle * clamp(s.peak / 70, 0.3, 1.2);
    s.air = false;
    s.peak = 0;
  }
  const h = Math.min(dt, 0.05),
    w = 13,
    z = 0.42;
  s.v += (-w * w * s.x - 2 * z * w * s.v) * h;
  s.x += s.v * h;
  if (Math.abs(s.x) < 1e-4 && Math.abs(s.v) < 1e-3) s.x = s.v = 0;
  if (!s.x) return 0;
  pose.hp = (pose.hp || 0) + 0.3 * s.x;
  return 0.05 * s.x;
}

/**
 * Running, the head stays level and on the ball whatever the body does (the gait's twist and bob): the head's world
 * rotation is pulled toward a level look at the ball, by how fast the player runs (eased, pl.headW), not past ~80° from
 * where the pose has it looking, and low-passed in world space (pl.headQ) so the bob never reaches it. Last, after the IK.
 * ballPos: world. dt: world seconds.
 */
export function headSteady(pl, d, pose, ballPos, mot, dt) {
  const C = VFX.sec,
    head = pl.bone('head');
  let want = 0;
  if (C.on && C.head && A.ball.vis && !pose.lying && d.pose !== 'dive') {
    head.getWorldPosition(hp);
    dir.copy(ballPos).sub(hp);
    if (dir.lengthSq() > 1e-4) {
      dir.normalize();
      // (+z of a normalized VRM bone is the face's forward: lookAt's z axis = eye − target, so aim behind the head)
      mL.lookAt(hp, aim.copy(hp).sub(dir), UP);
      qT.setFromRotationMatrix(mL);
      head.getWorldQuaternion(qC);
      want = C.head * clamp((mot.speed - 1) / 2, 0, 1) * clamp((1.4 - qC.angleTo(qT)) / 0.6, 0, 1);
    }
  }
  const k = 1 - Math.exp(-Math.min(dt, 0.05) * 8);
  pl.headW = (pl.headW || 0) + (want - (pl.headW || 0)) * k;
  if (pl.headW < 0.01) return void (pl.headQ = null);
  head.getWorldQuaternion(qC);
  if (want > 0) qC.slerp(qT, pl.headW);
  // the steady part: follow that rotation with a short lag (the gait's per-step bob and twist are filtered out)
  const hq = pl.headQ || (pl.headQ = qC.clone());
  hq.slerp(qC, 1 - Math.exp(-Math.min(dt, 0.05) * 18));
  head.parent.getWorldQuaternion(qP);
  head.quaternion.copy(qP.invert().multiply(hq));
  head.updateMatrixWorld(true);
}
