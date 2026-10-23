// The player on the 3D map: your own model (Main_v2, as in matches and your portrait; the default model if it fails), idle-breathing, walking or running to wherever the rules put
// the player. Display only — the rules move instantly; this animates from the previously shown position.
//   createAvatar(scene, opts?) → { setTarget([x, y], path?, { head?, tail? }), snap([x, y]), face([x, y]), tick(dt, heightAt), busy(), pos(), lapse(),
//                                  heading(), drive(x, z, v, yaw), setLife(k), dispose() }
// Street level (spec §4.37 6, T-336a): setLife(k) scales the figure from map size (HEIGHT, k = 0) to life size (LIFE_H, k = 1) — map3d
// passes the camera's street weight; drive(x, z, v, yaw) = one WASD frame (display only: stand at world (x, z), moving at v m/s, facing yaw).
//   opts.kit (shirt / hair / skin colours): another person on the default model, dressed (the story guide, spec §10.10a); none = you.
// Map points are map units (see toWorld in geo3d.mjs). Until the model has loaded a capsule marks the spot.
// WALK (spec §4.37 3–4, T-333 / T-335): the UI's hold on your walk (js/ui/career-map.js imports this same module): `stop` — the
// map point the next walk halts at (an encounter; `held` until go()), `via` — the road it follows instead ({ to, pts }: the short
// cut you picked), `routes` — a preview of the safe road and the short cut ([{ pts, on, alt }], drawn as ribbons), `onStep` — a
// footstep (the island sound). Only your own avatar reads it.
import * as THREE from 'three';
import { VRMUtils } from '@pixiv/three-vrm';
import { loadBase, makeVRM, applyPose, smoothBones, groundSnap, dress, MODEL_URL, MAIN_URL } from '../render3d/players3d.mjs';
import { STAND, locoPose, mix } from '../render3d/poses3d.mjs';
import { toWorld, clamp, wrap } from './geo3d.mjs';

const HEIGHT = 6, // metres: drawn about 3.5× life size so you can find yourself on the island (owner, 2026-10-03)
  SPEED = 6, // m/s: the pace a trip is timed at (longer trips run faster, shown as a time-lapse)
  TIME = [1.2, 6], // trip duration limits (s)
  RAMP = 0.4, // ease-in / ease-out (s)
  TURN = 0.25, // wait for the turn before setting off (s)
  RUN_AT = 2.5, // m/s: above this the gait blends into a run
  LIFE_H = 1.72, // metres: life size at street level (setLife(1))
  LIFE_PACE = 0.6; // at street level a trip's pace × this (a life-size runner, not a 6 m/s giant)

const segYaw = (pts, i) => Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); // facing along segment i

export const WALK = {
  stop: null,
  via: null,
  held: false,
  routes: null,
  onStep: null,
  onHold: null,
  _go: null,
  /** Walk on from a stop. */
  go() {
    if (WALK._go) WALK._go();
  }
};
const ROUTE = { half: 3.2, up: 1.4, step: 8 }; // the route preview's ribbon: half width (map units), lift (m), sample step (map units)
/** Split world-space polyline pts at the point nearest `at`: [to it, from it]. */
function splitAt(pts, at) {
  let best = { d: Infinity, i: 0, q: pts[0] };
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1],
      [bx, bz] = pts[i],
      dx = bx - ax,
      dz = bz - az,
      L2 = dx * dx + dz * dz,
      t = L2 ? clamp(((at[0] - ax) * dx + (at[1] - az) * dz) / L2, 0, 1) : 0,
      q = [ax + dx * t, az + dz * t],
      d = Math.hypot(at[0] - q[0], at[1] - q[1]);
    if (d < best.d) best = { d, i, q };
  }
  return [
    [...pts.slice(0, best.i), best.q],
    [best.q, ...pts.slice(best.i)]
  ];
}

export function createAvatar(scene, opts = {}) {
  const marker = new THREE.Mesh(
    new THREE.CapsuleGeometry(1, 4, 4, 10),
    new THREE.MeshStandardMaterial({ color: opts.kit ? opts.kit.shirt : 0xffb020 })
  );
  marker.castShadow = true;
  scene.add(marker);
  let pl = null,
    dead = false,
    rmesh = null, // the route preview (yours only)
    rkey = null;
  const me = !opts.kit, // your own avatar: WALK applies
    S = { x: 0, z: 0, yaw: 0, walk: null, phase: 0, w: 0, t: 0, next: null, held: false, stepAt: 0, life: 0, drive: null };
  /** Start walking world-space pts (from where you stand) on the trapezoid speed profile. */
  const plan = pts => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const dist = cum[cum.length - 1];
    if (dist < 0.5) return false;
    const dur = clamp(dist / (SPEED * (1 - (1 - LIFE_PACE) * S.life)), TIME[0], TIME[1]),
      r = Math.min(RAMP, dur / 2);
    // trapezoid speed profile: ramp up, cruise at vc, ramp down; the area under it is the distance along the path
    S.walk = { pts, cum, i: 0, dist, dur, r, vc: dist / (dur - r), t: S.walk || S.held ? 0 : -TURN, s: 0, yaw: segYaw(pts, 0) };
    return true;
  };
  if (me) {
    WALK.held = false;
    WALK._go = () => {
      if (!S.held) return;
      S.held = WALK.held = false;
      const rest = S.next;
      S.next = null;
      if (!rest || !plan(rest)) S.walk = null;
    };
  }
  /** The route preview's ribbons (WALK.routes): one mesh, vertex colours; rebuilt when the routes change. */
  const routes = heightAt => {
    const R = WALK.routes,
      k = R ? JSON.stringify(R.map(r => [r.on, r.alt, r.pts.length, r.pts[0], r.pts[r.pts.length - 1]])) : null;
    if (k === rkey) return;
    rkey = k;
    if (rmesh) {
      scene.remove(rmesh);
      rmesh.geometry.dispose();
      rmesh.material.dispose();
      rmesh = null;
    }
    if (!R || !R.length) return;
    const css = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null,
      tok = (n, f) => new THREE.Color(((css && css.getPropertyValue(n)) || '').trim() || f),
      pos = [],
      col = [];
    for (const r of R) {
      const c = tok(r.alt ? '--warn' : '--ink', r.alt ? '#ffb020' : '#eef0f3').multiplyScalar(r.on ? 1 : 0.45),
        P = [];
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, ay] = r.pts[i - 1],
          [bx, by] = r.pts[i],
          n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / ROUTE.step));
        for (let j = i === 1 ? 0 : 1; j <= n; j++) P.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
      }
      const h = r.on ? ROUTE.half : ROUTE.half * 0.6;
      for (let i = 1; i < P.length; i++) {
        const [ax, ay] = P[i - 1],
          [bx, by] = P[i],
          l = Math.hypot(bx - ax, by - ay) || 1,
          nx = (-(by - ay) / l) * h,
          ny = ((bx - ax) / l) * h,
          V = (x, y) => {
            const [wx, wz] = toWorld([x, y]);
            return [wx, heightAt(wx, wz) + ROUTE.up + (r.on ? 0.2 : 0), wz];
          },
          q = [V(ax + nx, ay + ny), V(ax - nx, ay - ny), V(bx + nx, by + ny), V(bx - nx, by - ny)];
        pos.push(...q[0], ...q[1], ...q[2], ...q[2], ...q[1], ...q[3]);
        for (let m = 0; m < 6; m++) col.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    rmesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
    );
    rmesh.renderOrder = 5;
    scene.add(rmesh);
  };

  (opts.kit ? Promise.reject(null) : loadBase(MAIN_URL).then(buf => makeVRM(buf, HEIGHT)))
    .catch(() => loadBase(MODEL_URL).then(buf => makeVRM(buf, HEIGHT))) // Main_v2 missing (or someone else): the default model
    .then(p => {
      if (dead) return VRMUtils.deepDispose(p.vrm.scene);
      if (opts.kit) dress(p.vrm, opts.kit);
      pl = p;
      pl.base = p.scale;
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
      S.walk = S.next = null;
      S.drive = null;
      if (S.held) S.held = WALK.held = false;
    },
    /**
     * Walk (or run) to a map point from where the avatar stands now; `path` (map points, optional) is the road to follow. Yours:
     * WALK.via (to the same point) replaces the road, WALK.stop halts the walk there until WALK.go(). o.head / o.tail (map points):
     * walked before the road (out of a door) / after `at` (in through a door, to where you stand inside — spec §4.40).
     */
    setTarget(at, path, o = {}) {
      const V = me && WALK.via && Math.hypot(WALK.via.to[0] - at[0], WALK.via.to[1] - at[1]) < 2 ? WALK.via.pts : path,
        stop = me ? WALK.stop : null;
      if (me) WALK.via = WALK.stop = null;
      let pts = [[S.x, S.z]];
      for (const p of o.head || []) pts.push(toWorld(p));
      if (V && V.length > 1) for (const p of V.slice(1, -1)) pts.push(toWorld(p));
      pts.push(toWorld(at));
      for (const p of o.tail || []) pts.push(toWorld(p));
      const end = o.tail && o.tail.length ? o.tail[o.tail.length - 1] : at;
      S.next = null;
      if (S.held) S.held = WALK.held = false;
      if (stop) {
        const [a, b] = splitAt(pts, toWorld(stop));
        pts = a;
        S.next = b;
      }
      if (!plan(pts)) {
        if (S.next && plan(S.next)) S.next = null;
        else this.snap(end);
      }
    },
    /** Turn to face a map point (standing still). */
    face(at) {
      const [x, z] = toWorld(at);
      S.yaw = Math.atan2(x - S.x, z - S.z);
    },
    busy: () => !!S.walk || S.held,
    pos: () => [S.x, S.z],
    /** The way you face (rad, atan2(dx, dz)). */
    heading: () => S.yaw,
    /** One WASD frame (display only): stand at world (x, z), moving at v m/s, turning toward yaw. */
    drive(x, z, v, yaw) {
      if (S.walk || S.held) return;
      S.x = x;
      S.z = z;
      S.drive = { v, yaw };
    },
    /** 0 = map size (HEIGHT), 1 = life size (LIFE_H): the camera's street weight. */
    setLife(k) {
      S.life = clamp(k, 0, 1);
    },
    /** Time-lapse factor of the current trip (ground speed ÷ SPEED), 0 when it is not faster than SPEED. */
    lapse: () => (S.walk && S.walk.dist / S.walk.dur > SPEED * 1.02 ? S.walk.dist / S.walk.dur / SPEED : 0),
    tick(dt, heightAt) {
      const W = S.walk;
      let v = 0;
      if (S.drive) {
        v = S.drive.v;
        S.yaw += wrap(S.drive.yaw - S.yaw) * (1 - Math.exp(-dt / 0.08));
        S.drive = null;
      }
      if (W) {
        W.t += dt;
        const t = clamp(W.t, 0, W.dur),
          { dur, r, vc, dist } = W;
        let s;
        if (t >= dur) [s, v] = [dist, 0];
        else if (t < r) [s, v] = [(vc * t * t) / (2 * r), (vc * t) / r];
        else if (t < dur - r) [s, v] = [vc * (r / 2 + t - r), vc];
        else [s, v] = [dist - (vc * (dur - t) ** 2) / (2 * r), (vc * (dur - t)) / r];
        W.s = s;
        while (W.i < W.pts.length - 2 && s > W.cum[W.i + 1]) W.i++;
        const a = W.pts[W.i],
          b = W.pts[W.i + 1],
          f = clamp((s - W.cum[W.i]) / (W.cum[W.i + 1] - W.cum[W.i] || 1), 0, 1);
        S.x = a[0] + (b[0] - a[0]) * f;
        S.z = a[1] + (b[1] - a[1]) * f;
        W.yaw = segYaw(W.pts, W.i);
        S.yaw += wrap(W.yaw - S.yaw) * (1 - Math.exp(-dt / 0.08));
        if (W.t >= dur) {
          S.walk = null;
          if (S.next) {
            S.held = true; // an encounter (WALK.stop): wait here for WALK.go()
            if (me) {
              WALK.held = true;
              if (WALK.onHold) WALK.onHold();
            }
          }
        }
      }
      if (me) routes(heightAt);
      if (rmesh) rmesh.visible = S.life < 0.5; // (the route preview floats 1.4 m up: over the map, not at street level)
      const h = heightAt(S.x, S.z);
      const size = 1 + (LIFE_H / HEIGHT - 1) * S.life; // map size → life size
      if (!pl) return (marker.scale.setScalar(size), marker.position.set(S.x, h + 3 * size, S.z));
      S.t += dt;
      const gait = Math.min(v, SPEED),
        stride = (1.6 + 0.8 * clamp((gait - RUN_AT) / 1.5, 0, 1)) * ((HEIGHT * size) / 1.65); // metres per gait cycle (× the figure's size)
      S.phase += ((v * dt) / stride) * Math.PI * 2;
      if (me && gait > 0.4 && S.phase >= S.stepAt) {
        S.stepAt = (Math.floor(S.phase / Math.PI) + 1) * Math.PI; // a foot lands every half gait cycle
        if (WALK.onStep) WALK.onStep(gait);
      }
      S.w += (clamp(gait, 0, 1) - S.w) * (1 - Math.exp(-dt * 10));
      const sway = Math.sin(S.t * 1.7),
        idle = { ...STAND, cp: 0.02 * sway, sp: 0.02 + 0.012 * sway },
        pose = S.w > 0.01 ? mix(idle, locoPose({ speed: gait, fwd: gait, lat: 0, phase: S.phase }), S.w) : idle;
      pl.scale = pl.base * size;
      pl.root.scale.setScalar(pl.scale);
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
      if (me) {
        WALK.held = false;
        WALK._go = null;
      }
      if (rmesh) {
        scene.remove(rmesh);
        rmesh.geometry.dispose();
        rmesh.material.dispose();
      }
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
