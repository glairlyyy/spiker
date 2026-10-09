// Inverse kinematics on top of the authored poses (owner, 2026-10-09; display only): a two-bone solver for legs and arms,
// foot planting (a foot that is down stays where it is on the floor until the pose lifts it or it would stretch too far —
// no more skating) and arm contacts (the hands / forearms go to the ball itself instead of just aiming at it). Runs after
// the pose, the smoothing and the grounding (actors3d posePlayer), so it works on the final world positions. Tuned by
// VFX `ik` (js/data/vfx.js): on / off for each, slip and step time; the Animation lab's foot marks show the planting.
import * as THREE from 'three';

const vH = new THREE.Vector3(),
  vK = new THREE.Vector3(),
  vF = new THREE.Vector3(),
  vU = new THREE.Vector3(),
  vP = new THREE.Vector3(),
  vK2 = new THREE.Vector3(),
  vT = new THREE.Vector3(),
  qW = new THREE.Quaternion(),
  qP = new THREE.Quaternion(),
  qD = new THREE.Quaternion(),
  qL = new THREE.Quaternion(),
  qE = new THREE.Quaternion(),
  vA = new THREE.Vector3(),
  vB = new THREE.Vector3();

/** Rotate `bone` (by world rotation `qd`) toward a new local rotation, blended by w. */
function turn(bone, qd, w) {
  bone.getWorldQuaternion(qW);
  bone.parent.getWorldQuaternion(qP);
  qL.copy(qP).invert().multiply(qd.clone().multiply(qW));
  bone.quaternion.slerp(qL, w);
  bone.updateMatrixWorld(true);
}
/**
 * Two-bone IK: turn `upper` and `lower` so that `end`'s origin reaches `target` (world), the middle joint bending toward
 * `pole` (a world direction). w: 0..1 blend with the pose. keepEnd: `end` keeps its world rotation (a planted foot stays flat).
 */
export function twoBone(upper, lower, end, target, pole, w = 1, keepEnd = true) {
  if (w <= 0.001) return;
  upper.getWorldPosition(vH);
  lower.getWorldPosition(vK);
  end.getWorldPosition(vF);
  if (keepEnd) end.getWorldQuaternion(qE);
  const a = vK.distanceTo(vH),
    b = vF.distanceTo(vK),
    d = Math.min(Math.max(vT.copy(target).sub(vH).length(), Math.abs(a - b) + 1e-4), (a + b) * 0.999);
  vU.copy(target).sub(vH).normalize();
  // the bend plane: the pole, made perpendicular to the root → target line
  vP.copy(pole).addScaledVector(vU, -pole.dot(vU));
  if (vP.lengthSq() < 1e-8) vP.copy(vK).sub(vH).addScaledVector(vU, -vK.clone().sub(vH).dot(vU));
  vP.normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))),
    sinA = Math.sqrt(1 - cosA * cosA);
  vK2
    .copy(vH)
    .addScaledVector(vU, a * cosA)
    .addScaledVector(vP, a * sinA);
  qD.setFromUnitVectors(vA.copy(vK).sub(vH).normalize(), vB.copy(vK2).sub(vH).normalize());
  turn(upper, qD, w);
  lower.getWorldPosition(vK);
  end.getWorldPosition(vF);
  qD.setFromUnitVectors(vA.copy(vF).sub(vK).normalize(), vB.copy(target).sub(vK).normalize());
  turn(lower, qD, w);
  if (keepEnd) {
    end.parent.getWorldQuaternion(qP);
    qL.copy(qP).invert().multiply(qE);
    end.quaternion.slerp(qL, w);
    end.updateMatrixWorld(true);
  }
}

// ---------- feet ----------
const fwd = new THREE.Vector3(),
  tgt = new THREE.Vector3(),
  pole = new THREE.Vector3(),
  hip = new THREE.Vector3();
const ease = t => t * t * (3 - 2 * t);
/**
 * Foot planting after the pose is grounded: on the floor (not jumping, not lying), a foot the pose has down is locked where
 * it touched; when the pose lifts it, or it would slide more than `slip` m, it steps from the lock to where the pose wants
 * it over `step` s (a small arc). In the air or lying down the locks are dropped. dt: world seconds.
 */
export function footIK(pl, d, pose, dt) {
  const C = VFX.ik;
  if (!C.feet) return void (pl.feet = null);
  const root = pl.root,
    feet = pl.feet || (pl.feet = [{}, {}]),
    grounded = !pose.lying && d.pose !== 'dive' && root.position.y < 0.03 && (d.jy || 0) <= 1 && !A.animLab?.replay;
  if (!grounded) {
    feet[0] = {};
    feet[1] = {};
    return;
  }
  const contact = pl.footRest * pl.scale,
    yaw = root.rotation.y;
  fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  ['left', 'right'].forEach((s, i) => {
    const st = feet[i],
      up = pl.bone(s + 'UpperLeg'),
      lo = pl.bone(s + 'LowerLeg'),
      ft = pl.bone(s + 'Foot'),
      F = ft.getWorldPosition(new THREE.Vector3()),
      down = F.y - contact < C.down;
    up.getWorldPosition(hip);
    const reach = (pl.legLen || (pl.legLen = hip.distanceTo(lo.getWorldPosition(vA)) + vA.distanceTo(F))) * 0.98;
    if (st.step) {
      st.step.t += dt / Math.max(0.02, C.step);
      const k = ease(Math.min(1, st.step.t));
      tgt.lerpVectors(st.step.from, F, k);
      tgt.y = Math.max(F.y, contact) + (down ? C.arc * Math.sin(Math.PI * k) : 0);
      if (st.step.t >= 1) st.step = null;
    } else if (down) {
      if (!st.lock) st.lock = new THREE.Vector3(F.x, contact, F.z);
      const slid = Math.hypot(F.x - st.lock.x, F.z - st.lock.z) > C.slip,
        far = hip.distanceTo(st.lock) > reach;
      if (slid || far) {
        st.step = { from: st.lock.clone(), t: 0 };
        st.lock = null;
        tgt.copy(st.step.from);
      } else tgt.copy(st.lock);
    } else {
      if (st.lock) st.step = { from: st.lock.clone(), t: 0 }; // the pose lifts it: leave the lock smoothly
      st.lock = null;
      tgt.copy(st.step ? st.step.from : F);
    }
    if (tgt.distanceToSquared(F) < 1e-5) return;
    // knees bend forward (and a little out): the current knee offset, else the facing
    pole.copy(lo.getWorldPosition(vA)).sub(vB.copy(hip).lerp(F, 0.5));
    if (pole.lengthSq() < 4e-4) pole.copy(fwd);
    twoBone(up, lo, ft, tgt, pole, 1, true);
  });
}

// ---------- arms: hands / forearms on the ball ----------
/**
 * Where each wrist goes for a two-hand contact, from the ball: [toward the body, down, out to the side] in metres (the
 * hands sit around the ball, the forearm platform under it). One-hand contacts (spike, serve, dive, a one-hand block) put
 * the wrist `one` m short of the ball along the shoulder → ball line, so the palm is on it.
 */
const GRIP = {
  bump: [0.02, 0.12, 0.06],
  dive: [0.02, 0.1, 0.06],
  set: [0.1, 0.06, 0.11],
  setprep: [0.1, 0.06, 0.11],
  block: [0.1, 0, 0.13],
  other: [0.06, 0, 0.12],
  one: 0.17
};
const sh = new THREE.Vector3(),
  toB = new THREE.Vector3(),
  left = new THREE.Vector3(),
  aTgt = new THREE.Vector3(),
  elb = new THREE.Vector3(),
  wr = new THREE.Vector3();
/**
 * Arm IK at a contact (pose.contact 0..1, the ball in play): the hitting hand, or both hands / forearms, to the ball itself.
 * `hand`: 'left' | 'right' | 'both' (actors3d decides: the pose's own hand, the one-hand block, else by the move). Fades
 * out when the ball is out of reach. ball: world position.
 */
export function armIK(pl, d, pose, ball, hand) {
  const w0 = pose.contact || 0;
  if (!VFX.ik.arms || w0 <= 0.01 || !A.ball.vis || !ball) return;
  const yaw = pl.root.rotation.y;
  left.set(Math.cos(yaw), 0, -Math.sin(yaw)); // the player's left (VRM: +x of the body)
  const sides = hand === 'both' ? ['left', 'right'] : [hand];
  for (const s of sides) {
    const up = pl.bone(s + 'UpperArm'),
      lo = pl.bone(s + 'LowerArm'),
      hd = pl.bone(s + 'Hand');
    up.getWorldPosition(sh);
    const len = pl['arm_' + s] || (pl['arm_' + s] = sh.distanceTo(lo.getWorldPosition(elb)) + elb.distanceTo(hd.getWorldPosition(wr)));
    if (hand === 'both') {
      const g = GRIP[d.pose] || GRIP.other;
      toB.copy(sh).sub(ball).setY(0);
      if (toB.lengthSq() < 1e-6) toB.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      toB.normalize();
      aTgt
        .copy(ball)
        .addScaledVector(toB, g[0])
        .add(new THREE.Vector3(0, -g[1], 0))
        .addScaledVector(left, (s === 'left' ? 1 : -1) * g[2]);
    } else aTgt.copy(ball).addScaledVector(toB.copy(ball).sub(sh).normalize(), -GRIP.one);
    const dist = sh.distanceTo(aTgt),
      w = w0 * Math.min(1, Math.max(0, (1.35 * len - dist) / (0.35 * len)));
    if (w <= 0.01) continue;
    // the elbow bends where the pose has it, else down and out
    lo.getWorldPosition(elb);
    hd.getWorldPosition(wr);
    pole.copy(elb).sub(vA.copy(sh).lerp(wr, 0.5));
    if (pole.lengthSq() < 4e-4) pole.set(0, -1, 0).addScaledVector(left, s === 'left' ? 0.5 : -0.5);
    twoBone(up, lo, hd, aTgt, pole, w, true);
  }
}
