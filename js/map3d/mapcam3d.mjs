// The island map's camera and input (spec §4.9, §4.18c): the fixed tilted view over a ground point (`view` { x, z, d }),
// drag to pan (grab the ground point), wheel to zoom, a click picks a map point; flights to a pin, to you (◎ Me) and over
// the whole island; following your walk; the week-1 fence. map3d.mjs `create` owns the scene and hands this its parts.
import * as THREE from 'three';
import { MAP_M, toMap, toWorld, clamp, smooth, fitView } from './geo3d.mjs';

export const PITCH = (55 * Math.PI) / 180;
export const DIST = [25, 1300]; // camera distance (m): the scaled island (MAP_SCALE 2.25) needs the longer reach
const FLY_S = 0.45, // a camera move to a selected place
  FENCE_D = 150, // the farthest the camera goes while the week-1 fence holds (m)
  CLICK_PX = 5;

/**
 * S(): the map's live parts (they appear after the first mount): { terrain, mesh, avatar, cur (the model), on (the mount
 * callbacks), cw / ch (canvas px) }. Returns the controller; `view` is null until `initView`.
 */
export function createMapCam(cam, canvas, sun, S) {
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    hit = new THREE.Vector3();
  let view = null, // { x, z, d }: the camera target on the ground and its distance (kept across re-mounts)
    fly = null, // a camera move: { x0, z0, d0, x1, z1, d1, t }
    follow = false, // the camera follows the avatar while it walks (until the user drags)
    grab = null,
    down = null;

  const place = () => {
    const { x, z, d } = view;
    cam.position.set(x, d * Math.sin(PITCH), z + d * Math.cos(PITCH));
    cam.lookAt(x, 0, z);
    sun.target.position.set(x, 0, z);
    sun.position.set(x + 70, 130, z + 45);
  };
  /** Ground point (y = 0) under a pointer event, or null (sky). */
  const ground = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray.ray.intersectPlane(plane, hit) ? hit : null; // the shared vector: read it before the next call
  };
  const clampView = () => {
    view.x = clamp(view.x, 0, S().terrain.W);
    view.z = clamp(view.z, 0, S().terrain.D);
    view.d = clamp(view.d, DIST[0], DIST[1]);
    const F = S().cur && S().cur.fence; // Story week 1 (spec §10.10a): the camera stays over the campus
    if (F) {
      const [fx, fz] = toWorld(F.at),
        R = F.r * MAP_M,
        dx = view.x - fx,
        dz = view.z - fz,
        k = Math.hypot(dx, dz);
      if (k > R) ((view.x = fx + (dx / k) * R), (view.z = fz + (dz / k) * R));
      view.d = Math.min(view.d, FENCE_D);
    }
  };
  const fit = () => {
    clampView();
    place();
  };
  /** While your player walks the camera stays on them and the map takes no input (owner, 2026-10-03). */
  const walking = () => !!(S().avatar && S().avatar.busy());

  // input: drag pans (grab the ground point), wheel zooms, a click (< CLICK_PX) picks a map point
  const onDown = e => {
    if (e.button !== 0 || walking()) return;
    fly = null; // the player takes the camera
    down = { x: e.clientX, y: e.clientY, moved: 0 };
    const g = ground(e);
    grab = g ? { x: g.x, z: g.z } : null;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    if (!down) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (down.moved < CLICK_PX || !grab) return;
    const g = ground(e);
    if (!g) return;
    view.x += grab.x - g.x;
    view.z += grab.z - g.z;
    fit();
    follow = false;
  };
  const onUp = e => {
    if (!down) return;
    const click = down.moved < CLICK_PX;
    down = grab = null;
    if (!click || !S().on || !S().mesh) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObject(S().mesh)[0],
      p = h ? h.point : ray.ray.intersectPlane(plane, hit);
    if (p) S().on.point(toMap(p.x, p.z).map(Math.round));
  };
  const onWheel = e => {
    e.preventDefault();
    if (walking()) return;
    view.d *= Math.exp(e.deltaY * 0.0012);
    fit();
  };
  const onCancel = () => (down = grab = null),
    listeners = [
      ['pointerdown', onDown],
      ['pointermove', onMove],
      ['pointerup', onUp],
      ['pointercancel', onCancel],
      ['wheel', onWheel, { passive: false }]
    ];
  for (const [k, f, o] of listeners) canvas.addEventListener(k, f, o);

  const flight = (x1, z1, d1) => ({ x0: view.x, z0: view.z, d0: view.d, x1, z1, d1, t: 0 });
  return {
    get view() {
      return view;
    },
    onWheel,
    walking,
    fit,
    /** First view of a model: every known place and you in frame, else on the player ~60 m away. */
    initView(m) {
      const at = m.you ? m.you.at : m.focus;
      view = fitView([...(m.pins || []).map(p => toWorld(p.at)), toWorld(at)], S().cw / Math.max(1, S().ch) || 16 / 9, 60, 510) || {
        x: at[0] * MAP_M,
        z: at[1] * MAP_M,
        d: 60
      };
      if (view.d > 60) {
        view.d = Math.min(340, view.d * 1.15); // perspective: the far edge needs more room than the fit assumes
        view.z += view.d * 0.08; // and the near edge stays clear of the bottom chips
      }
    },
    /** Fly the camera to your avatar (the map's ◎ button / key C), at most 70 m away; it then follows your walks again. */
    centre() {
      if (!S().avatar || !view) return;
      const [x, z] = S().avatar.pos();
      fly = flight(x, z, Math.min(view.d, 70));
      follow = true;
    },
    /** Fly out over the whole island (the fence lifting). */
    overview() {
      if (!view || !S().terrain || !S().cur) return;
      const v = fitView(S().cur.land.coast.map(toWorld), S().cw / Math.max(1, S().ch) || 16 / 9, 60, DIST[1]);
      if (!v) return;
      const d = Math.min(DIST[1], v.d * 1.15); // perspective: the far edge needs more room than the fit assumes (as at mount)
      fly = flight(v.x, v.z + d * 0.08, d);
      follow = false;
    },
    /** Move the camera over a pin (≤ FLY_S): keep the zoom unless the pin is off-screen (then at least 80 m away). */
    flyTo(id) {
      const p = S().cur && S().cur.pins && S().cur.pins.find(q => q.id === id);
      if (!p || !view) return;
      const [x, z] = toWorld(p.at),
        v = new THREE.Vector3(x, 0, z).project(cam),
        off = Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9;
      fly = flight(x, z, off ? Math.max(view.d, 80) : view.d);
      follow = false;
    },
    /** Your walk starts at map point (x0, z0): a drag in progress ends, the camera flies onto the player and follows. */
    walkFrom(x0, z0) {
      down = grab = null;
      fly = flight(x0, z0, clamp(view.d, 45, 110));
      follow = true;
    },
    /** Per frame: a flight in progress, then holding the camera on your walking player. */
    step(dt) {
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / FLY_S);
        const k = smooth(0, 1, fly.t);
        view.x = fly.x0 + (fly.x1 - fly.x0) * k;
        view.z = fly.z0 + (fly.z1 - fly.z0) * k;
        view.d = fly.d0 + (fly.d1 - fly.d0) * k;
        fit();
        if (fly.t >= 1) fly = null;
      }
      if ((follow || S().avatar.busy()) && S().avatar.busy() && !fly) {
        const [ax, az] = S().avatar.pos(),
          k = 1 - Math.exp(-dt * 8); // held on the player for the whole walk
        view.x += (ax - view.x) * k;
        view.z += (az - view.z) * k;
        fit();
      }
    },
    dispose() {
      for (const [k, f, o] of listeners) canvas.removeEventListener(k, f, o);
    }
  };
}
