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
 * rotation is pulled toward a level look at the ball, by how fast the player runs; not past ~80° from where the pose has
 * it looking. Last, after the IK. ballPos: world.
 */
export function headSteady(pl, d, pose, ballPos, mot) {
  const C = VFX.sec;
  if (!C.on || !C.head || !A.ball.vis || pose.lying || d.pose === 'dive') return;
  let w = C.head * clamp((mot.speed - 1) / 2, 0, 1);
  if (w < 0.01) return;
  const head = pl.bone('head');
  head.getWorldPosition(hp);
  dir.copy(ballPos).sub(hp);
  if (dir.lengthSq() < 1e-4) return;
  dir.normalize();
  // (+z of a normalized VRM bone is the face's forward: lookAt's z axis = eye − target, so aim the target behind the head)
  mL.lookAt(hp, aim.copy(hp).sub(dir), UP);
  qT.setFromRotationMatrix(mL);
  head.getWorldQuaternion(qC);
  const off = qC.angleTo(qT);
  w *= clamp((1.4 - off) / 0.5, 0, 1);
  if (w < 0.01) return;
  qC.slerp(qT, w);
  head.parent.getWorldQuaternion(qP);
  head.quaternion.copy(qP.invert().multiply(qC));
  head.updateMatrixWorld(true);
}
