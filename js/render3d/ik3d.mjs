// Inverse kinematics on top of the authored poses (owner, 2026-10-09; display only): a two-bone solver for legs and arms,
// foot planting (a foot that is down stays where it is on the floor until the pose lifts it or it would stretch too far —
// no more skating) and arm contacts (the hands / forearms go to the ball itself instead of just aiming at it). Runs after
// the pose, the smoothing and the grounding (actors3d posePlayer), so it works on the final world positions. Tuned by
// VFX `ik` (js/data/vfx.js): on / off for each, slip and step time; the Animation lab's foot marks show the planting.
import * as THREE from 'three';
import { Wto } from './units3d.mjs';

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
 * it over `step` s (a small arc). In the air or lying down nothing is planted (locked feet step off). dt: world seconds.
 */
export function footIK(pl, d, pose, dt) {
  const C = VFX.ik;
  if (!C.feet) return void (pl.feet = null);
  const root = pl.root,
    feet = pl.feet || (pl.feet = [{}, {}]);
  // (the Animation lab's playback, or the planted gait — gait3d — has the feet fully: start fresh afterwards)
  if (A.animLab?.replay || (pl.gW || 0) >= 0.8) {
    feet[0] = {};
    feet[1] = {};
    return;
  }
  // in the air or lying down nothing new is planted; a foot still locked steps off its lock like a lifted one (dropping the
  // locks at once snapped the feet back to the pose by up to half a metre)
  const air = pose.lying || d.pose === 'dive' || root.position.y > 0.12 || (d.jy || 0) > 1,
    // running fast the gait itself keeps the feet (its stride follows the distance run): nothing new is planted
    spd = (pl.mot && pl.mot.speed) || 0,
    // (VFX.ik.run, with a little hysteresis; while the planted gait blends in, nothing new is planted here either)
    run = (pl.ikRun = spd > C.run + 0.3 || (pl.ikRun && spd > C.run - 0.3)) || (pl.gW || 0) > 0.2,
    standing = ((pl.mot && pl.mot.now) || 0) < 0.4 && spd < 1.5; // (the body still right now, not just slowing)
  const contact = pl.footRest * pl.scale,
    yaw = root.rotation.y;
  fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  ['left', 'right'].forEach((s, i) => {
    const st = feet[i],
      up = pl.bone(s + 'UpperLeg'),
      lo = pl.bone(s + 'LowerLeg'),
      ft = pl.bone(s + 'Foot'),
      F = ft.getWorldPosition(new THREE.Vector3()),
      // down / up with hysteresis (a pose foot hovering at the threshold locked and let go every other frame: shaky feet)
      // standing (not travelling): a foot near the floor is a foot on the floor (C.stand) — the poses' two legs are rarely
      // the same height, so the higher foot hovered a few cm and flickered between planted and lifted
      hop = (pose.lift || 0) > 0.005, // the pose lifts the body (a hop, a clap bounce): the feet go up with it
      thr = standing && !hop ? C.stand : C.down,
      down = !air && !run && F.y - contact < (st.lock || st.step ? thr * 1.6 : thr),
      flat = Math.abs((pose[i ? 'R' : 'L'] || {}).f || 0) < 0.25, // a foot pitched onto its toes keeps its own height
      floorY = flat && !hop ? contact : F.y;
    up.getWorldPosition(hip);
    const reach = (pl.legLen || (pl.legLen = hip.distanceTo(lo.getWorldPosition(vA)) + vA.distanceTo(F))) * 0.98,
      held = st.lock;
    if (held && Math.hypot(held.x - F.x, held.z - F.z) > reach * 2.5) {
      // the player was moved (a rotation, a new rally): forget the old spot instead of stepping across the court
      feet[i] = {};
      return;
    }
    if (st.step) {
      st.step.t += dt / Math.max(0.02, C.step);
      // the step closes the gap to the pose's foot, measured from the pose's foot (the body may run on meanwhile)
      const k = ease(Math.min(1, st.step.t));
      tgt.set(F.x + st.step.off.x * (1 - k), 0, F.z + st.step.off.z * (1 - k));
      // a small arc over the floor (the pose's lift if higher), landing flat when the foot is coming down
      tgt.y = Math.max(down ? floorY : F.y, contact + (air || !st.step.arc ? 0 : C.arc * Math.sin(Math.PI * k)));
      if (st.step.t >= 1) st.step = null;
    } else if (down) {
      if (!st.lock) st.lock = new THREE.Vector3(F.x, contact, F.z); // (x, z held; the foot flat on the floor)
      // one foot at a time: a foot that has slid waits while the other one is stepping (unless it is out of reach)
      const other = feet[1 - i],
        slid = Math.hypot(F.x - st.lock.x, F.z - st.lock.z) > C.slip && !(other && other.step && other.step.arc),
        // out of reach: the spot (at the height the foot goes to) further than the leg reaches — a straight-legged pose's own
        // foot is already near full reach, so only what the lock adds counts (else it stepped forever on the spot)
        far = hip.distanceTo(vT.set(st.lock.x, floorY, st.lock.z)) > Math.max(reach, hip.distanceTo(F) + 0.03);
      if (slid || far) {
        tgt.set(st.lock.x, floorY, st.lock.z);
        st.step = { off: new THREE.Vector3(st.lock.x - F.x, 0, st.lock.z - F.z), t: 0, arc: true }; // (a real step: lifted)
        st.lock = null;
      } else tgt.set(st.lock.x, floorY, st.lock.z);
    } else {
      if (st.lock) st.step = { off: new THREE.Vector3(st.lock.x - F.x, 0, st.lock.z - F.z), t: 0 }; // the pose lifts it: off the lock smoothly
      st.lock = null;
      if (st.step) tgt.set(F.x + st.step.off.x, F.y, F.z + st.step.off.z);
      else tgt.copy(F);
    }
    if (!air && tgt.y < contact) tgt.y = contact; // never under the floor (a landing's settle sinks the hips: the knees bend)
    // a lock / step / release never moves the foot in one frame: on a change of state the jump is kept as a residual that
    // fades out (a locked foot itself stays exactly on its spot)
    const sig = st.lock || st.step || null,
      res = st.res || (st.res = new THREE.Vector3());
    if (sig !== st.sig && st.last) {
      res.copy(st.last).sub(tgt);
    }
    if (res.lengthSq() > 0.25) res.set(0, 0, 0); // (a teleport: nothing to blend)
    st.sig = sig;
    res.multiplyScalar(Math.exp(-dt * 25));
    tgt.add(res);
    (st.last || (st.last = new THREE.Vector3())).copy(tgt);
    if (tgt.distanceToSquared(F) < 1e-6) return;
    // knees bend forward (and a little out): the pose's knee offset plus a steady bit of the facing, so a nearly straight leg
    // (offset ~0, its direction noise) never flips the knee from frame to frame
    pole.copy(lo.getWorldPosition(vA)).sub(vB.copy(hip).lerp(F, 0.5)).addScaledVector(fwd, 0.04);
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
const TURN = [40, 85];
const flight = new THREE.Vector3(),
  fwdA = new THREE.Vector3();
export function armIK(pl, d, pose, hand, dt) {
  const ws = pl.ikW || (pl.ikW = { left: 0, right: 0 }),
    w0 = VFX.ik.arms && A.ball.vis ? pose.contact || 0 : 0;
  if (w0 <= 0.01 && ws.left < 0.01 && ws.right < 0.01) return;
  // the ball on its flight (not the drawn one: r3d handTouch pulls that onto the hand, which would chase itself)
  const ball = Wto(flight, A.ball.x, A.ball.z, A.ball.h),
    yaw = pl.root.rotation.y;
  left.set(Math.cos(yaw), 0, -Math.sin(yaw)); // the player's left (VRM: +x of the body)
  fwdA.set(Math.sin(yaw), 0, Math.cos(yaw));
  const sides = w0 > 0.01 ? (hand === 'both' ? ['left', 'right'] : [hand]) : [];
  for (const s of ['left', 'right']) {
    if (!sides.includes(s) && ws[s] < 0.01) continue;
    const up = pl.bone(s + 'UpperArm'),
      lo = pl.bone(s + 'LowerArm'),
      hd = pl.bone(s + 'Hand');
    up.getWorldPosition(sh);
    hd.getWorldPosition(wr);
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
    // how far the arm would have to turn: the pose's shoulder → wrist line against shoulder → target. A big turn (the pose's
    // arm still swinging up or round while the ball is elsewhere) is left to the pose: bending a whole arm round by IK rolls
    // the forearm and spins the hand. Full IK up to TURN[0] degrees, none from TURN[1].
    const turnDeg = Math.acos(Math.min(1, Math.max(-1, vA.copy(wr).sub(sh).normalize().dot(vB.copy(aTgt).sub(sh).normalize())))) * 57.3,
      dist = sh.distanceTo(aTgt),
      want = sides.includes(s)
        ? w0 *
          Math.min(1, Math.max(0, (1.35 * len - dist) / (0.35 * len))) *
          Math.min(1, Math.max(0, (TURN[1] - turnDeg) / (TURN[1] - TURN[0])))
        : 0;
    // eased in and out (no pop when the ball comes into reach or the contact ends)
    ws[s] += (want - ws[s]) * (1 - Math.exp(-dt * 18));
    const w = ws[s];
    if (w <= 0.01) continue;
    // the elbow bends out to the side, a little down and back: one fixed direction for the body, so a nearly straight arm
    // (a spike at full reach) never flips its elbow from frame to frame (that spun the hand)
    pole
      .copy(left)
      .multiplyScalar(s === 'left' ? 1 : -1)
      .add(vA.set(0, -0.45, 0))
      .addScaledVector(fwdA, -0.25);
    twoBone(up, lo, hd, aTgt, pole, w, false); // the hand follows the forearm (keeping its world rotation twisted the wrist)
  }
}

// ---------- hands on the knees (resting) ----------
const kn = new THREE.Vector3(),
  hpK = new THREE.Vector3();
/**
 * Resting with the hands on the knees (poses3d REST_KNEES, pose.kneeHands 0..1): each hand goes to the top of its own
 * thigh just above the knee — this player's real knees, whatever their build — the elbows bending out to the side.
 */
export function kneeHands(pl, w) {
  if (!(w > 0.01)) return;
  const yaw = pl.root.rotation.y;
  fwdA.set(Math.sin(yaw), 0, Math.cos(yaw));
  left.set(Math.cos(yaw), 0, -Math.sin(yaw));
  for (const s of ['left', 'right']) {
    pl.bone(s + 'LowerLeg').getWorldPosition(kn);
    pl.bone(s + 'UpperLeg').getWorldPosition(hpK);
    aTgt
      .copy(kn)
      .lerp(hpK, 0.18)
      .addScaledVector(fwdA, 0.05)
      .add(vA.set(0, 0.04, 0));
    pole
      .copy(left)
      .multiplyScalar(s === 'left' ? 1 : -1)
      .addScaledVector(fwdA, -0.3);
    twoBone(pl.bone(s + 'UpperArm'), pl.bone(s + 'LowerArm'), pl.bone(s + 'Hand'), aTgt, pole, w, false);
  }
}
