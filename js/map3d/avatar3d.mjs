// The player on the 3D map: the default VRM model, idle-breathing, walking or running to wherever the rules put
// the player. Display only — the rules move instantly; this animates from the previously shown position.
//   createAvatar(scene) → { setTarget([x, y]), snap([x, y]), tick(dt, heightAt), busy(), pos(), lapse(), dispose() }
// Map points are map units (see toWorld in map3d.mjs). Until the model has loaded a capsule marks the spot.
import * as THREE from 'three';
import { VRMUtils } from '@pixiv/three-vrm';
import { loadBase, makeVRM, applyPose, smoothBones, groundSnap } from '../render3d/players3d.mjs';
import { STAND, locoPose, mix } from '../render3d/poses3d.mjs';
import { toWorld } from './map3d.mjs';

const MODEL_URL = new URL('../../assets/vrm/base.glb.txt', import.meta.url).href,
  HEIGHT = 1.65, // metres
  SPEED = 6, // m/s: the pace a trip is timed at (longer trips run faster, shown as a time-lapse)
  TIME = [1.2, 6], // trip duration limits (s)
  RAMP = 0.4, // ease-in / ease-out (s)
  TURN = 0.25, // wait for the turn before setting off (s)
  RUN_AT = 2.5; // m/s: above this the gait blends into a run

const cl = (v, a, b) => Math.max(a, Math.min(b, v)),
  wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createAvatar(scene) {
  const marker = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: 0xffb020 }));
  marker.castShadow = true;
  scene.add(marker);
  let pl = null,
    dead = false;
  const S = { x: 0, z: 0, yaw: 0, walk: null, phase: 0, w: 0, t: 0 };

  loadBase(MODEL_URL)
    .then(buf => makeVRM(buf, HEIGHT))
    .then(p => {
      if (dead) return VRMUtils.deepDispose(p.vrm.scene);
      pl = p;
      scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
      scene.add(pl.root);
    })
    .catch(e => console.warn('3D map: the player model failed to load — keeping the marker.', e && e.message ? e.message : e));

  return {
    /** Stand at a map point at once. */
    snap(at) {
      [S.x, S.z] = toWorld(at);
      S.walk = null;
    },
    /** Walk (or run) to a map point from where the avatar stands now. */
    setTarget(at) {
      const [tx, tz] = toWorld(at),
        dx = tx - S.x,
        dz = tz - S.z,
        dist = Math.hypot(dx, dz);
      if (dist < 0.5) return this.snap(at);
      const dur = cl(dist / SPEED, TIME[0], TIME[1]),
        r = Math.min(RAMP, dur / 2);
      // trapezoid speed profile: ramp up, cruise at vc, ramp down; the area under it is the distance
      S.walk = {
        sx: S.x,
        sz: S.z,
        dx: dx / dist,
        dz: dz / dist,
        dist,
        dur,
        r,
        vc: dist / (dur - r),
        t: -TURN,
        s: 0,
        yaw: Math.atan2(dx, dz)
      };
    },
    busy: () => !!S.walk,
    pos: () => [S.x, S.z],
    /** Time-lapse factor of the current trip (ground speed ÷ SPEED), 0 when it is not faster than SPEED. */
    lapse: () => (S.walk && S.walk.dist / S.walk.dur > SPEED * 1.02 ? S.walk.dist / S.walk.dur / SPEED : 0),
    tick(dt, heightAt) {
      const W = S.walk;
      let v = 0;
      if (W) {
        W.t += dt;
        const t = cl(W.t, 0, W.dur),
          { dur, r, vc, dist } = W;
        let s;
        if (t >= dur) [s, v] = [dist, 0];
        else if (t < r) [s, v] = [(vc * t * t) / (2 * r), (vc * t) / r];
        else if (t < dur - r) [s, v] = [vc * (r / 2 + t - r), vc];
        else [s, v] = [dist - (vc * (dur - t) ** 2) / (2 * r), (vc * (dur - t)) / r];
        W.s = s;
        S.x = W.sx + W.dx * s;
        S.z = W.sz + W.dz * s;
        S.yaw += wrap(W.yaw - S.yaw) * (1 - Math.exp(-dt / 0.08));
        if (W.t >= dur) S.walk = null;
      }
      const h = heightAt(S.x, S.z);
      if (!pl) return marker.position.set(S.x, h + 0.85, S.z);
      S.t += dt;
      const gait = Math.min(v, SPEED),
        stride = 1.6 + 0.8 * cl((gait - RUN_AT) / 1.5, 0, 1); // metres per gait cycle
      S.phase += ((gait * dt) / stride) * Math.PI * 2;
      S.w += (cl(gait, 0, 1) - S.w) * (1 - Math.exp(-dt * 10));
      const sway = Math.sin(S.t * 1.7),
        idle = { ...STAND, cp: 0.02 * sway, sp: 0.02 + 0.012 * sway },
        pose = S.w > 0.01 ? mix(idle, locoPose({ speed: gait, fwd: gait, lat: 0, phase: S.phase }), S.w) : idle;
      pl.root.rotation.set(0, S.yaw, 0);
      pl.root.position.set(S.x, 0, S.z);
      applyPose(pl, pose);
      smoothBones(pl, dt, gait > 1 ? 26 : 16);
      groundSnap(pl, pose.lift || 0); // feet on the floor (root at y = 0) …
      pl.root.position.y += h; // … then up onto the terrain
      pl.vrm.update(dt);
    },
    dispose() {
      dead = true;
      scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
      if (pl) {
        scene.remove(pl.root);
        VRMUtils.deepDispose(pl.vrm.scene);
      }
    }
  };
}
