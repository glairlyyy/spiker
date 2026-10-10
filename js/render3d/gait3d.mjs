// Planted gait (owner, 2026-10-10; display only): walking and running feet that never slide. The pose's walk / run keys only
// shape the legs; where each foot actually is comes from a stepping plan tied to the gait phase (actors3d motion: m.phase,
// m.step): each foot is on the floor for a share of the cycle (the duty) — about 60 % walking, under 25 % sprinting, the
// rest of the time in the air, so a long sprint stride has a real flight — and locked to its spot while it is; in the swing
// it travels to where the body will be at its next contact, lifted over the floor (higher when running). Two-bone IK puts
// the legs on those targets (ik3d twoBone). Blended in by the forward-gait share and speed (pl.gW), out when the body stops,
// turns to a shuffle / backpedal, jumps or dives. Tuned by VFX `gait`.
import * as THREE from 'three';
import { twoBone } from './ik3d.mjs';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t * t * (3 - 2 * t);
const hip = new THREE.Vector3(),
  kn = new THREE.Vector3(),
  ft = new THREE.Vector3(),
  pole = new THREE.Vector3(),
  dir = new THREE.Vector3(),
  fwd = new THREE.Vector3(),
  vLeft = new THREE.Vector3();

/** The foot's travel relative to the hips while it is down, as a share of the leg's length (sets the duty). */
const SWEEP = 0.8;

/**
 * After the grounding and the foot planting (actors3d posePlayer); may lower the root (a planted foot must be reachable).
 * gw: the forward-gait share 0..1 (poses3d gaitW: 1 − side − back); pose.gaitW: how much of the pose's legs are the walk /
 * run (locoPose sets 1, blends carry it). dt: world seconds.
 */
export function gaitIK(pl, d, pose, mot, gw, dt) {
  const C = VFX.gait,
    root = pl.root,
    sp = mot.speed || 0,
    air = pose.lying || d.pose === 'dive' || (d.jy || 0) > 1,
    want = C.on && !air && !A.animLab?.replay ? (pose.gaitW || 0) * clamp((sp - C.from) / 0.8, 0, 1) * (sp > 3 ? 1 : 0.4 + 0.6 * gw) : 0; // (fast, it steps any way the body goes)
  pl.gW = (pl.gW || 0) + (want - (pl.gW || 0)) * (1 - Math.exp(-Math.min(dt, 0.05) * (want < (pl.gW || 0) ? 14 : 12)));
  const W = pl.gW;
  if (W < 0.01) return void (pl.gait = pl.gHip = null);
  const st = pl.gait || (pl.gait = [{}, {}]),
    contact = pl.footRest * pl.scale,
    step = Math.max(0.3, mot.step || 0.7),
    upL = pl.bone('leftUpperLeg'),
    loL = pl.bone('leftLowerLeg');
  const leg =
    pl.legLenG ||
    (pl.legLenG = upL.getWorldPosition(hip).distanceTo(loL.getWorldPosition(kn)) + kn.distanceTo(pl.bone('leftFoot').getWorldPosition(ft)));
  // the share of the cycle a foot is down: the body must not outrun the foot's sweep (walk ~0.6, sprint ~0.2)
  const duty = clamp((SWEEP * leg) / (2 * step), C.minDuty, 0.62),
    ph = ((((mot.phase || 0) / (Math.PI * 2)) % 1) + 1) % 1,
    yaw = root.rotation.y;
  fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  // where the body is going (the measured velocity), else the facing
  dir.set(mot.vx || 0, 0, mot.vz || 0);
  if (dir.lengthSq() < 0.04) dir.copy(fwd);
  dir.normalize();
  // eased (pl.gDir): the landing spots are metres ahead, so a twitch in the measured heading would throw the feet about
  const gd = pl.gDir || (pl.gDir = dir.clone());
  gd.lerp(dir, 1 - Math.exp(-Math.min(dt, 0.05) * 7)).normalize();
  dir.copy(gd);
  // where a foot lands: half the stance's travel ahead of the hip, but no further than half the leg's sweep (sprinting, the
  // stance's travel outgrows the leg; the foot lifts once it is as far behind)
  const ahead = Math.min(step * duty, 0.5 * SWEEP * leg);
  const lift = C.lift * (0.25 + 0.75 * clamp((sp - 1.5) / 6, 0, 1)); // the swing foot's clearance (knee drive when sprinting)
  // 1. this frame's targets
  const T = ['left', 'right'].map((s, i) => {
    const f = st[i],
      u = (((ph - (i ? 0.5 : 0)) % 1) + 1) % 1, // 0 = this foot's contact
      up = pl.bone(s + 'UpperLeg'),
      t = new THREE.Vector3();
    up.getWorldPosition(hip);
    pl.bone(s + 'Foot').getWorldPosition(ft);
    const hy = hip.y,
      hx = hip.x,
      hz = hip.z;
    // planning from the root (steady), at this hip's side offset (the gait's hip twist would wobble the landing spots)
    const sideOff =
      pl.hipSide ||
      (pl.hipSide =
        Math.abs(
          new THREE.Vector3()
            .copy(hip)
            .sub(root.position)
            .dot(vLeft.set(Math.cos(yaw), 0, -Math.sin(yaw)))
        ) || 0.09);
    hip.copy(root.position).addScaledVector(vLeft.set(Math.cos(yaw), 0, -Math.sin(yaw)), i ? -sideOff : sideOff);
    hip.y = contact;
    // the stance ends at the duty fixed at its contact (slowing down would stretch it), or once the foot is as far behind
    // the hip as the leg sweeps (it is lifted, not dragged)
    const behind = f.stance && f.plant ? -(f.plant.x - hip.x) * dir.x - (f.plant.z - hip.z) * dir.z : 0,
      side = f.stance && f.plant ? Math.hypot(f.plant.x - hip.x, f.plant.z - hip.z) : 0,
      wrapped = f.uPrev == null || u < f.uPrev - 0.5 || !!f.cycle, // a new contact only once per cycle (after the phase wraps)
      stance = !!(f.stance ? u < f.duty && behind < 0.55 * SWEEP * leg && side < 0.6 * leg : wrapped && u < duty);
    if (!f.stance && u < f.uPrev - 0.5) f.cycle = true;
    f.uPrev = u;
    if (stance && !f.stance) {
      f.duty = duty;
      f.cycle = false;
    }
    if (stance) {
      if (!f.stance || !f.plant) {
        // contact: where the swing came down (its end point), else ahead of the hip by half the stance's travel, so the
        // hip passes over it at mid-stance
        f.plant = f.lastT && f.uPrevSet ? f.lastT.clone() : hip.clone().addScaledVector(dir, ahead);
        f.plant.y = contact;
      }
      t.copy(f.plant);
      // pushing off: behind the hip the heel comes up (the foot rolls onto its toes; the toes stay on the spot), so a leg
      // that sweeps back reaches without the hips sinking (owner, 2026-10-10: the run sat down)
      const back = -(t.x - hip.x) * dir.x - (t.z - hip.z) * dir.z;
      t.y = contact + Math.min(0.12, Math.max(0, back - 0.05) * 0.45);
    } else {
      if (f.stance || f.uLift == null) f.uLift = u; // (lifted early or on time: the swing runs from here to the next contact)
      const s01 = clamp((u - f.uLift) / Math.max(0.05, 1 - f.uLift), 0, 1),
        // to where the hip will be at the next contact, plus half the next stance's travel: re-aimed live early in the swing,
        // fixed on the floor late in it (so the foot comes to rest on its spot, not on the moving body)
        live = hip.clone().addScaledVector(dir, (1 - u) * 2 * step + ahead);
      if (f.stance || !f.from) {
        f.from = (f.from || new THREE.Vector3()).copy(f.plant || ft);
        f.next = live.clone();
        // the lift-off spot relative to the hip: the swing is planned in the body's frame, so the foot travels with the body
        // (owner, 2026-10-10: planned on the floor, the feet trailed half a metre behind a sprinting body)
        f.rel = (f.rel || new THREE.Vector3()).set(f.from.x - hip.x, 0, f.from.z - hip.z);
      }
      f.from.y = contact;
      // (a change of speed or heading still moves the landing, smoothly, less and less as the foot comes down)
      f.next.lerp(live, (1 - s01) * (1 - Math.exp(-Math.min(dt, 0.05) * 30)));
      f.next.y = contact;
      // and it lands where the leg can reach: never further than ~0.6 leg from where the hip is (slowing down)
      const ox = f.next.x - hip.x,
        oz = f.next.z - hip.z,
        ol = Math.hypot(ox, oz),
        lim = 0.6 * leg + (1 - u) * 2 * step; // (the body still travels until the contact)
      if (ol > lim) {
        f.next.x = hip.x + (ox / ol) * lim;
        f.next.z = hip.z + (oz / ol) * lim;
      }
      // from behind the hip to ahead of it (half the stance's travel), in the body's frame; plus how far the landing spot is
      // off where the body is headed (a change of speed or heading), so the foot comes down exactly on f.next
      const e = ease(s01);
      t.set(
        hip.x + f.rel.x * (1 - e) + (dir.x * ahead + f.next.x - live.x) * e,
        0,
        hip.z + f.rel.z * (1 - e) + (dir.z * ahead + f.next.z - live.z) * e
      );
      t.y = contact + lift * (s01 < 0.4 ? ease(s01 / 0.4) : 1 - ease((s01 - 0.4) / 0.6)); // up early, smoothly off / onto the floor
    }
    f.stance = stance;
    f.uPrevSet = true;
    (f.lastT || (f.lastT = new THREE.Vector3())).copy(t);
    if (t.y < contact) t.y = contact; // never under the floor
    // the highest the hip may be for this foot's target to be reachable with a bent knee (only a foot that is down counts)
    // (and a swinging foot's next contact, half a stance ahead: the hips are down before it lands, so it can reach ahead of
    // them instead of coming down under the body — owner, 2026-10-10)
    const hd = stance ? Math.hypot(t.x - hx, t.z - hz) : ahead,
      allow = (stance ? t.y : contact) + Math.sqrt(Math.max(0, (0.97 * leg) ** 2 - hd * hd));
    return { s, t, hy, allow };
  });
  // 2. the hips' height is the gait's, not the pose's (owner, 2026-10-10: the walk / run keys' bent knees sat the body down
  // into a wide crouch): nearly straight legs, down only as far as a foot that is (or is about to be) down needs, eased so
  // it bobs, never jumps; the run's flight (pose.lift) on top
  const stand = contact + 0.95 * leg,
    want2 = Math.max(stand - 0.12, Math.min(stand, T[0].allow, T[1].allow)),
    hyNow = (T[0].hy + T[1].hy) / 2;
  pl.gHip = pl.gHip == null ? want2 : pl.gHip + (want2 - pl.gHip) * (1 - Math.exp(-Math.min(dt, 0.05) * 10));
  pl.gDrop = stand - pl.gHip; // (read by QA)
  root.position.y += (pl.gHip + (pose.lift || 0) - hyNow) * W;
  root.updateMatrixWorld(true);
  // 3. the legs onto the targets
  for (const { s, t } of T) {
    const up = pl.bone(s + 'UpperLeg'),
      lo = pl.bone(s + 'LowerLeg'),
      foot = pl.bone(s + 'Foot');
    foot.getWorldPosition(ft);
    // the knee bends forward (the facing, a touch outward): fixed, so a fast leg never flips it frame to frame
    pole.copy(fwd).addScaledVector(vLeft.set(Math.cos(yaw), 0, -Math.sin(yaw)), s === 'left' ? 0.15 : -0.15);
    // blended as positions (the pose's foot → the planned spot), then solved fully: one smooth path, never two mixed
    const w = Math.min(1, W * 1.25); // (a planted foot fully planted once the gait is mostly on)
    if (w < 1) t.lerpVectors(ft.copy(foot.getWorldPosition(ft)), t, w);
    if (t.y < contact) t.y = contact; // (the hips may have come down: never through the floor)
    twoBone(up, lo, foot, t, pole, 1, true);
  }
}
