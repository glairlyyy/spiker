// The island map's camera and input (spec §4.9, §4.18c): the fixed tilted view over a ground point (`view` { x, z, d }),
// drag to pan (grab the ground point), wheel to zoom, a click picks a map point; flights to a pin, to you (◎ Me) and over
// the whole island; following your walk; the week-1 fence. map3d.mjs `create` owns the scene and hands this its parts.
// Street level (spec §4.37 6, T-336a; every district since T-361): wherever model.street allows it (`{ all: true }` = all the
// land — MapView's zone; a capsule { a, b, r } still works for tests) the zoom goes on past DIST[0] down to STREET.d1 — one continuous path (streetPose: the pitch eases from the map's PITCH to STREET.pitch, the
// target rises from the ground point to your head and moves onto you, the camera follows you); Q / E, a right-drag (or a drag at
// street level) orbit round you; WASD walks your avatar freely on land (display only: `on.walk(point)` once you stop, a map-point
// travel like a click). Outside a capsule district the zoom stops at DIST[0] as before (and eases back up if you leave it).
import * as THREE from 'three';
import { MAP_M, toMap, toWorld, clamp, lerp, smooth, wrap, fitView } from './geo3d.mjs';
import { lotFrame, LANDMARKS } from './kit3d.mjs';

export const PITCH = (55 * Math.PI) / 180;
export const DIST = [25, 2600]; // camera distance (m): the scaled island (MAP_SCALE 4.5) needs the longer reach
/**
 * Street level (T-369: over the shoulder, your whole figure in the lower third): d1 = the closest camera distance (m; ~7 m behind,
 * ~2.4 m above the ground — eye level), pitch = its angle above the horizon, head = the target's height over your feet (m; your
 * middle), fov = the lens at street level (°; the map's 40 → this), lens = the target's place on screen (NDC x, y: left of centre,
 * low — a lens shift, so the verticals stay upright), pad = how far (m) outside the district the view
 * centre may be for the zoom to go on, speed = WASD pace (m/s × the walk speed setting), orbit = Q / E (rad/s), drag (rad/px),
 * stop = how long (s) the keys rest before the walk resolves, back = the camera's rise (1/s) when you leave the district.
 */
export const STREET = {
  d1: 7.2,
  pitch: (12 * Math.PI) / 180,
  head: 0.95,
  fov: [40, 50],
  lens: [-0.12, -0.62],
  pad: 40,
  speed: 4.2,
  orbit: 1.8,
  drag: 0.008,
  stop: 0.35,
  back: 3,
  near: [1, 0.2], // the camera's near plane (m): the map → street level
  far: [6000, 900], // … its far plane (the haze closes in before it: the low pitch would draw the whole island)
  rise: 9, // the most the camera rises over a building behind you (m; more → it comes in front of it)
  behind: 1.4 // a click walk at street level: the camera swings behind you over ~this (s)
};
/**
 * The zoom's one camera path (pure, tested): distance d (m) → { s (0 = the map, 1 = street level), pitch (rad), dist (m),
 * up (m, camera over the target), fov (°), lens [x, y] (the target's NDC place) }. Above DIST[0] it is today's view; below it
 * the pitch lowers, the lens widens and the target slides to the lower left with s (smoothstep).
 */
export function streetPose(d) {
  const s = clamp((DIST[0] - d) / (DIST[0] - STREET.d1), 0, 1),
    k = smooth(0, 1, s),
    pitch = lerp(PITCH, STREET.pitch, k);
  return {
    s: k,
    pitch,
    dist: d,
    up: d * Math.sin(pitch),
    fov: lerp(STREET.fov[0], STREET.fov[1], k),
    lens: [STREET.lens[0] * k, STREET.lens[1] * k]
  };
}
/**
 * Put the target at NDC lens [x, y] by shifting the camera's view window (three's setViewOffset in fractions); [0, 0] clears it.
 * The aspect stays the canvas's: three's setViewOffset sets `aspect = fullWidth / fullHeight` (1 here) — the street view's stretch.
 */
export function setLens(cam, fov, lx, ly) {
  const V = cam.view,
    ox = -lx / 2,
    oy = ly / 2;
  if (Math.abs(cam.fov - fov) < 1e-4 && (V && V.enabled ? Math.abs(V.offsetX - ox) < 1e-5 && Math.abs(V.offsetY - oy) < 1e-5 : !lx && !ly))
    return;
  const aspect = cam.aspect;
  cam.fov = fov;
  if (lx || ly) (cam.setViewOffset(1, 1, ox, oy, 1, 1), (cam.aspect = aspect));
  else if (V && V.enabled) cam.clearViewOffset();
  cam.updateProjectionMatrix();
}
/**
 * The district from the model's `street`: `{ all: true }` → { all: true } (street level everywhere, T-361); a capsule { a, b, r }
 * (map units) → the world capsule { a: [x, z], b: [x, z], r } (m); else null.
 */
export const zoneOf = st =>
  st && st.all ? { all: true } : st && st.a && st.b ? { a: toWorld(st.a), b: toWorld(st.b), r: st.r * MAP_M } : null;
/** Distance (m) from world (x, z) to the district capsule's spine minus its radius (≤ 0 = inside; everywhere: −∞). */
export const zoneDist = (Z, x, z) => {
  if (Z.all) return -Infinity;
  const [ax, az] = Z.a,
    [bx, bz] = Z.b,
    dx = bx - ax,
    dz = bz - az,
    t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t) - Z.r;
};
export const inZone = (Z, x, z, pad = 0) => !!Z && zoneDist(Z, x, z) <= pad;

const FLY_S = 0.45, // a camera move to a selected place
  FENCE_D = 150, // the farthest the camera goes while the week-1 fence holds (m)
  CLICK_PX = 5,
  KEYS = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };

/**
 * S(): the map's live parts (they appear after the first mount): { terrain, mesh, avatar, cur (the model), on (the mount
 * callbacks: point, walk?, canWalk?), cw / ch (canvas px), consume?(xy) (a street-level click the interiors take) }. Returns the
 * controller; `view` is null until `initView`.
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
    down = null,
    yaw = 0, // street level: the orbit round you (0 = the map's fixed heading; scaled by s, reset when s reaches 0)
    st = 0, // the current street weight (streetPose(view.d).s)
    zone = null,
    zoneKey = null,
    held = new Set(), // WASD / Q / E held
    roam = false, // WASD moved you since the last resolve
    still = 0,
    swing = 0, // a click walk at street level: the camera swings behind you while it lasts
    dragged = false, // the last right-button press orbited (its contextmenu is not a figure click)
    lotGrid = null,
    lotKey = null,
    lotZone = null,
    lift = 0; // street level: how far the camera has risen over a building behind you (m)

  const district = () => {
    const m = S().cur,
      st0 = m && m.street;
    if (st0 !== zoneKey) ((zoneKey = st0), (zone = zoneOf(st0)));
    return zone;
  };
  /** Street level is open: your avatar inside the district and the view centre on or near it. */
  const allowed = () => {
    const Z = district(),
      A = S().avatar;
    if (!Z || !A || !view) return false;
    const [ax, az] = A.pos();
    return inZone(Z, ax, az) && inZone(Z, view.x, view.z, STREET.pad);
  };
  const heightAt = (x, z) => (S().terrain ? S().terrain.heightAt(x, z) : 0);
  const place = () => {
    const { x, z, d } = view,
      P = streetPose(d),
      s = P.s;
    st = s;
    if (s <= 0) yaw = 0;
    const yw = yaw * s,
      ty = s > 0 ? s * (heightAt(x, z) + STREET.head) : 0,
      c = d * Math.cos(P.pitch);
    let k = 1,
      need = P.up;
    if (s > 0.3) {
      // a building between you and the camera: the camera rises over it (up to STREET.rise m more), else comes in front of it
      // (march back from your head; ones holding you — the gym or the arena, opened by cutaway in T-336b — don't count)
      const n = Math.ceil(d / 0.5);
      for (let i = 2; i <= n; i++) {
        const f = i / n,
          px = x + c * Math.sin(yw) * f,
          pz = z + c * Math.cos(yw) * f,
          L = lotAt(px, pz, 0.3, true);
        if (!L || holds(L, x, z, 0.3)) continue;
        const top = heightAt(px, pz) + L.h + 0.4;
        if (ty + need * f >= top) continue;
        const up = (top - ty) / f;
        if (up <= P.up + STREET.rise * s) need = up;
        else {
          k = Math.max(1.6 / d, (i - 1.5) / n);
          break;
        }
      }
    }
    lift += (need - P.up - lift) * (Math.abs(need - P.up - lift) < 0.02 ? 1 : 0.2); // (eased: walking past houses doesn't jolt it)
    cam.position.set(x + c * k * Math.sin(yw), ty + (P.up + lift) * k, z + c * k * Math.cos(yw));
    if (s > 0) cam.position.y = Math.max(cam.position.y, heightAt(cam.position.x, cam.position.z) + 0.6);
    cam.lookAt(x, ty, z);
    setLens(cam, P.fov, P.lens[0] * k, P.lens[1] * k); // (pulled in front of a building: the shift eases off with it)
    const near = Math.max(lerp(STREET.near[0], STREET.near[1], s), view.d * 0.03 * (1 - s)), // (far out the near plane backs off: no sea showing through the low ground, T-350)
      far = lerp(STREET.far[0], STREET.far[1], s);
    if (Math.abs(cam.near - near) > 0.01 || Math.abs(cam.far - far) > 1) ((cam.near = near), (cam.far = far), cam.updateProjectionMatrix());
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
    // below DIST[0] only at street level; leaving the district the camera eases back up (step), never jumps
    view.d = clamp(view.d, allowed() ? STREET.d1 : Math.min(DIST[0], view.d), DIST[1]);
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
  /** WASD may move you: street level, nothing walking, the UI idle (on.canWalk: no lock, event, sheet or match). */
  const canRoam = () => st > 0.5 && !walking() && canvas.isConnected && !!S().on && (!S().on.canWalk || S().on.canWalk());

  // input: drag pans (grab the ground point) — at street level it orbits —, a right-drag orbits, wheel zooms, a click (< CLICK_PX) picks a map point
  const onDown = e => {
    if ((e.button !== 0 && e.button !== 2) || walking()) return;
    if (e.button === 2 && st < 0.3) return; // (a right-click on the map: the figure menu, map3d)
    fly = null; // the player takes the camera
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, moved: 0, b: e.button, orbit: e.button === 2 || st > 0.5 };
    dragged = false;
    const g = down.orbit ? null : ground(e);
    grab = g ? { x: g.x, z: g.z } : null;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    if (!down) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (down.orbit) {
      if (down.moved >= CLICK_PX) {
        yaw -= (e.clientX - down.lx) * STREET.drag;
        if (down.b === 2) dragged = true;
        place();
      }
      down.lx = e.clientX;
      return;
    }
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
    const click = down.moved < CLICK_PX && down.b === 0;
    down = grab = null;
    if (!click || !S().on || !S().mesh) return;
    const r = canvas.getBoundingClientRect(),
      sx = e.clientX - r.left,
      sy = e.clientY - r.top;
    if (st > 0.5 && S().consume && S().consume([sx, sy])) return; // the interiors' prompt / station took it (T-336b)
    ndc.set((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObject(S().mesh)[0],
      p = h ? h.point : ray.ray.intersectPlane(plane, hit);
    if (!p) return;
    const [qx, qz] = st > 0.5 ? outside(p.x, p.z) : [p.x, p.z]; // street level: a click on a building = the pavement in front of it
    S().on.point(toMap(qx, qz).map(Math.round));
  };
  const onWheel = e => {
    e.preventDefault();
    if (walking()) return;
    view.d *= Math.exp(e.deltaY * 0.0012);
    fit();
  };
  const onCancel = () => (down = grab = null);
  const typing = e => e.target && e.target.closest && e.target.closest('input,select,textarea,[contenteditable]');
  const onKey = e => {
    const k = e.code;
    if (!(k in KEYS) && k !== 'KeyQ' && k !== 'KeyE') return;
    if (e.type === 'keyup') return void held.delete(k);
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e) || st < 0.5 || !canvas.isConnected) return;
    if (k in KEYS && !canRoam()) return;
    held.add(k);
    e.preventDefault();
  };
  const onBlur = () => held.clear();
  const listeners = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['wheel', onWheel, { passive: false }]
  ];
  for (const [k, f, o] of listeners) canvas.addEventListener(k, f, o);
  const hasWin = typeof addEventListener === 'function';
  if (hasWin) {
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);
    addEventListener('blur', onBlur);
  }

  /**
   * The district's filler lots (every lot when street level is everywhere) as world rectangles in a 16 m bucket grid (WASD doesn't
   * walk through walls), plus its landmarks as squares (`lm`: only the camera keeps out of them — you may walk in, the interiors open by cutaway).
   */
  const lots = () => {
    const m = S().cur,
      L = m && m.land && m.land.lots;
    if (!L || !zone) return null;
    if (L === lotKey && zone === lotZone) return lotGrid;
    lotKey = L;
    lotZone = zone;
    lotGrid = new Map();
    const marks = (m.land.landmarks || []).map(q => {
      const K = LANDMARKS[q.kind],
        [x, z] = toWorld(q.at);
      if (q.w) return { x, z, w: q.w, d: q.d, h: q.h, cs: Math.cos(q.rot || 0), sn: Math.sin(q.rot || 0), lm: true }; // a facility's lot (spec §4.40)
      const r = K ? Math.max(K.w, K.d) : 0;
      return K && { x, z, w: r, d: r, h: K.h, cs: 1, sn: 0, lm: true };
    });
    [...L.map((l, i) => lotFrame(l, i)), ...marks].forEach(f => {
      if (!f || !inZone(zone, f.x, f.z, 30)) return;
      const R = Math.hypot(f.w, f.d) / 2;
      for (let gx = Math.floor((f.x - R) / 16); gx <= Math.floor((f.x + R) / 16); gx++)
        for (let gz = Math.floor((f.z - R) / 16); gz <= Math.floor((f.z + R) / 16); gz++) {
          const k = `${gx},${gz}`;
          if (!lotGrid.has(k)) lotGrid.set(k, []);
          lotGrid.get(k).push(f);
        }
    });
    return lotGrid;
  };
  /** Does footprint f (+ m) hold world (x, z)? */
  function holds(f, x, z, m) {
    const dx = x - f.x,
      dz = z - f.z,
      lx = dx * f.cs - dz * f.sn,
      lz = dx * f.sn + dz * f.cs;
    return Math.abs(lx) < f.w / 2 + m && Math.abs(lz) < f.d / 2 + m;
  }
  /** The district lot (or, with lm, landmark) whose footprint (+ m) holds world (x, z), or null. */
  function lotAt(x, z, m, lm = false) {
    const G = lots(),
      list = G && G.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    if (!list) return null;
    for (const f of list) if ((lm || !f.lm) && holds(f, x, z, m)) return f;
    return null;
  }
  /** World (x, z) moved out of any district lot it falls in: to the nearest side, 0.8 m clear. */
  const outside = (x, z) => {
    const f = lotAt(x, z, 0.35);
    if (!f) return [x, z];
    const dx = x - f.x,
      dz = z - f.z;
    let lx = dx * f.cs - dz * f.sn,
      lz = dx * f.sn + dz * f.cs;
    const ex = f.w / 2 + 0.8 - Math.abs(lx),
      ez = f.d / 2 + 0.8 - Math.abs(lz);
    if (ex < ez) lx = Math.sign(lx || 1) * (f.w / 2 + 0.8);
    else lz = Math.sign(lz || 1) * (f.d / 2 + 0.8);
    // back to world (the inverse of the turn above)
    return [f.x + lx * f.cs + lz * f.sn, f.z - lx * f.sn + lz * f.cs];
  };
  /** World (x, z) is free to stand on: inside the district (anywhere when it is all the land), on land, outside every lot (+ 0.35 m). */
  const free = (x, z) => inZone(zone, x, z) && heightAt(x, z) >= 0.15 && !lotAt(x, z, 0.35);
  /** WASD: move your avatar (display) relative to the camera's heading; when the keys rest, the rules see where you stopped. */
  const roamStep = dt => {
    const A = S().avatar;
    if (!A || !A.drive) return;
    let fx = 0,
      fz = 0;
    for (const k of held) if (KEYS[k]) ((fx += KEYS[k][0]), (fz += KEYS[k][1]));
    const go = (fx || fz) && canRoam();
    if (go) {
      const yw = yaw * st,
        L = Math.hypot(fx, fz),
        // forward = away from the camera on the ground: (−sin yw, −cos yw); right = (cos yw, −sin yw)
        vx = ((fz * -Math.sin(yw) + fx * Math.cos(yw)) / L) * STREET.speed * (S().walkK || 1),
        vz = ((fz * -Math.cos(yw) - fx * Math.sin(yw)) / L) * STREET.speed * (S().walkK || 1),
        [x, z] = A.pos();
      let nx = x + vx * dt,
        nz = z + vz * dt;
      if (!free(nx, nz)) {
        if (free(nx, z)) nz = z;
        else if (free(x, nz)) nx = x;
        else ((nx = x), (nz = z));
      }
      A.drive(nx, nz, Math.hypot(nx - x, nz - z) / (dt || 1), Math.atan2(vx, vz));
      roam = true;
      still = 0;
    } else if (roam) {
      still += dt;
      if (still >= STREET.stop || !canRoam()) {
        roam = false;
        const [x, z] = A.pos();
        if (S().on && S().on.walk) S().on.walk(toMap(x, z).map(Math.round));
      }
    }
  };

  const flight = (x1, z1, d1) => ({ x0: view.x, z0: view.z, d0: view.d, x1, z1, d1, t: 0 });
  return {
    get view() {
      return view;
    },
    onWheel,
    walking,
    fit,
    /** 0–1: how far down the camera is (0 = the map, 1 = street level). */
    street: () => st,
    /** End a camera flight where it is (QA: a jump). */
    land() {
      fly = null;
    },
    /** The orbit angle round you (rad). */
    yaw: () => yaw,
    /** True right after a right-drag orbit (its contextmenu is not a click on a figure). */
    dragged: () => dragged,
    /** Is world (x, z) inside the street-level district (QA / tests)? */
    inDistrict: (x, z) => inZone(district(), x, z),
    /** Dev / QA: the orbit angle (rad) round you at street level. */
    setYaw(v) {
      yaw = v;
      if (view) place();
    },
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
      fly = flight(x, z, st > 0 ? view.d : Math.min(view.d, 70));
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
    /** Move the camera over a pin (≤ FLY_S): keep the zoom unless the pin is off-screen (then at least 80 m away). At street level it stays on you. */
    flyTo(id) {
      const p = S().cur && S().cur.pins && S().cur.pins.find(q => q.id === id);
      if (!p || !view || st > 0) return;
      const [x, z] = toWorld(p.at),
        v = new THREE.Vector3(x, 0, z).project(cam),
        off = Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9;
      fly = flight(x, z, off ? Math.max(view.d, 80) : view.d);
      follow = false;
    },
    /** Your walk starts at map point (x0, z0): a drag in progress ends, the camera flies onto the player and follows (at street level it stays down, behind you). */
    walkFrom(x0, z0) {
      down = grab = null;
      roam = false;
      follow = true;
      if (st > 0) return void (swing = STREET.behind * 4);
      fly = flight(x0, z0, clamp(view.d, 45, 110));
    },
    /** Per frame: a flight in progress, then holding the camera on your walking player; street level: on you, orbit, WASD. */
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
      const A = S().avatar;
      if (!view || !A) return;
      if (view.d < DIST[0] && !allowed()) {
        view.d += (DIST[0] - view.d) * (1 - Math.exp(-dt * STREET.back)); // out of the district: back up to the map's closest
        if (DIST[0] - view.d < 0.05) view.d = DIST[0];
      }
      const s = streetPose(view.d).s;
      if (s > 0 && !fly) {
        // street level: the camera is on you (the zoom's path pulls the view centre onto you as it goes down)
        const [ax, az] = A.pos(),
          k = 1 - Math.exp(-dt * (4 + 8 * s));
        view.x += (ax - view.x) * k;
        view.z += (az - view.z) * k;
        if (held.has('KeyQ')) yaw += STREET.orbit * dt;
        if (held.has('KeyE')) yaw -= STREET.orbit * dt;
        if (swing > 0 && A.busy() && A.heading) {
          // a click walk: swing round behind you, gently
          swing -= dt;
          yaw += wrap(A.heading() + Math.PI - yaw) * (1 - Math.exp(-dt / STREET.behind));
        }
        yaw = wrap(yaw);
        roamStep(dt);
        fit();
      } else if ((follow || A.busy()) && A.busy() && !fly) {
        const [ax, az] = A.pos(),
          k = 1 - Math.exp(-dt * 8); // held on the player for the whole walk
        view.x += (ax - view.x) * k;
        view.z += (az - view.z) * k;
        fit();
      } else if (roam) roamStep(dt); // (zoomed out mid-roam: the walk still resolves)
      if (!A.busy()) swing = 0;
    },
    dispose() {
      for (const [k, f, o] of listeners) canvas.removeEventListener(k, f, o);
      if (hasWin) {
        removeEventListener('keydown', onKey);
        removeEventListener('keyup', onKey);
        removeEventListener('blur', onBlur);
      }
    }
  };
}
