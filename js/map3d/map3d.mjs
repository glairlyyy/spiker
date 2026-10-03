// The 3D island map (three.js). Draws a MapModel (see js/career/mapmodel.js) as low-poly terrain with water, a fixed
// tilted camera and pan / zoom, and reports clicks as map points.
//   create(onIdle) → { mount(el, model, on), update(model), select(id), dispose(), heightAt(x, z), info() }
// The player's avatar (avatar3d.mjs) stands at model.you.at and walks when it changes; the camera follows it.
// Units: map (x, y) → world (x·MAP_M, 0, y·MAP_M) metres (1 map unit = 0.5 m). One renderer and canvas live across
// re-mounts (the career screen re-creates its #mapwrap each render); the view (target, distance) survives them.
// Display only: no rules, no randoms (terrain noise is a fixed hash).
import * as THREE from 'three';
import { createAvatar } from './avatar3d.mjs';
import { createFurniture } from './pins3d.mjs';
import { createLife } from './life3d.mjs';
import { createTown } from './town3d.mjs';
import { MAP_M, toMap, clamp, lerp, smooth, fogFactor, fitView, toWorld, inside, edgeDist, sideDist, hstr } from './geo3d.mjs';
export { inside, edgeDist, sideDist }; // (the polygon maths live in geo3d.mjs; tests import them from here too)

const CELL = 2, // terrain grid cell (m)
  PITCH = (55 * Math.PI) / 180,
  FLY_S = 0.45, // a camera move to a selected place
  DIST = [25, 630], // camera distance (m): the scaled island (MAP_SCALE 1.5) needs the longer reach
  CLICK_PX = 5,
  BEACH = 12, // beach slope width (m)
  IDLE_S = 3, // canvas detached this long → release the renderer
  SHADOW_MAP = 2048, // sun shadow map size (px)
  SHADOW_BOX = 120; // half-size of the sun's shadow frustum around the view (m)

/** Fixed value noise: a hash of the lattice point, smoothly interpolated. */
const lattice = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const vnoise = (x, y) => {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    u = smooth(0, 1, x - xi),
    v = smooth(0, 1, y - yi);
  return lerp(lerp(lattice(xi, yi), lattice(xi + 1, yi), u), lerp(lattice(xi, yi + 1), lattice(xi + 1, yi + 1), u), v);
};
/** Ground tint per district style (blended in faintly: no extra draw call). */
const DISTRICT_TINT = {
  city: '#8c8f96',
  oldtown: '#8d7d68',
  compound: '#c4b2d0',
  shacks: '#7e6c58',
  campus: '#86b866',
  terrace: '#8a7b5c',
  fishing: '#9a9172',
  works: '#7f7f84'
};
/**
 * Ground use (spec §4.19a, model.land.ground): two tones and a band width (m) per kind; `contour` bands follow the height (terraces),
 * else straight bands at a hashed angle (fields); water is also flattened into a lake.
 */
const GROUND_TINT = {
  terrace: { a: '#7f9a4a', b: '#68843f', band: 1.1, contour: true },
  paddy: { a: '#79a77c', b: '#5f9470', band: 0.9, contour: true },
  field: { a: '#b2ab5e', b: '#8fa04e', band: 5 },
  park: { a: '#4f9a48', b: '#56a24e', band: 9 },
  yard: { a: '#8d8c86', b: '#85847e', band: 7 },
  quay: { a: '#a19e95', b: '#98958c', band: 6 },
  water: { a: '#3f7f95', b: '#3f7f95', band: 9 },
  quarry: { a: '#b6b0a2', b: '#a29c8e', band: 1.6, contour: true }
};
/** The island's height grid and vertex colours (world metres), from the model's land. */
function buildTerrain(model) {
  const L = model.land,
    W = model.w * MAP_M,
    D = model.h * MAP_M,
    nx = Math.ceil(W / CELL),
    nz = Math.ceil(D / CELL),
    sx = W / nx,
    sz = D / nz,
    w = poly => poly.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
    coast = w(L.coast),
    shu = w((L.regions.find(r => r.id === 'shu') || { poly: [] }).poly),
    mtn = L.mountains.map(p => [p[0] * MAP_M, p[1] * MAP_M]),
    wu = w((L.regions.find(r => r.id === 'wu') || { poly: [] }).poly),
    dunes = L.dunes ? w(L.dunes) : [],
    dist = L.districts ? L.districts.map(d => ({ poly: w(d.poly), tint: DISTRICT_TINT[d.style] })).filter(d => d.tint) : [],
    grounds = (L.ground || [])
      .filter(g => GROUND_TINT[g.kind])
      .map(g => {
        const poly = w(g.poly),
          xs = poly.map(p => p[0]),
          zs = poly.map(p => p[1]),
          t = GROUND_TINT[g.kind],
          ang = hstr(`${g.id}|g`) * Math.PI;
        return {
          ...t,
          kind: g.kind,
          poly,
          hole: g.hole ? w(g.hole) : null,
          box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
          ca: Math.cos(ang),
          sa: Math.sin(ang),
          A: new THREE.Color(t.a),
          B: new THREE.Color(t.b)
        };
      }),
    lakes = [], // vertex indices in each water patch: flattened after the heights are known
    pos = new Float32Array((nx + 1) * (nz + 1) * 3),
    col = new Float32Array((nx + 1) * (nz + 1) * 3),
    H = new Float32Array((nx + 1) * (nz + 1)),
    grass = new THREE.Color(0x5d8a4a),
    rock = new THREE.Color(0x7d7a70),
    sand = new THREE.Color(0xd8c690),
    seabed = new THREE.Color(0x2b5f6e),
    tintC = new THREE.Color(),
    c = new THREE.Color();
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = i * sx,
        z = j * sz,
        k = j * (nx + 1) + i,
        land = inside(x, z, coast),
        d = edgeDist(x, z, coast);
      // the Wu sand: between the dune line and the coast, wide and flat with a low dune ridge on the line
      const sd0 = land && dunes.length && inside(x, z, wu) ? sideDist(x, z, dunes) : -99,
        sd = sd0 > 45 ? -99 : sd0, // (far seaward of the line = the corner past its ends: not sand)
        sand_ = sd > 0;
      let h;
      if (!land) h = -0.4 * Math.min(d, 10);
      else if (sand_ || (sd > -12 && sd <= 0)) {
        const flat = sand_ ? 0.45 * smooth(0, 5, d) : 0.6 * smooth(0, BEACH, d);
        h = flat + 0.9 * Math.exp(-((sd / 5) ** 2));
      } else {
        let base = 0.6;
        if (shu.length) {
          const ds = inside(x, z, shu) ? edgeDist(x, z, shu) : 0,
            n = 0.6 * vnoise(x / 40, z / 40) + 0.4 * vnoise(x / 15, z / 15);
          base += (4 + 6 * n) * smooth(0, 20, ds);
        }
        for (const [px, pz] of mtn) {
          const r = Math.hypot(x - px, z - pz) / 40;
          if (r < 1) base += 25 * (1 - r * r) ** 2;
        }
        h = base * smooth(0, BEACH, d);
      }
      H[k] = h;
      pos.set([x, h, z], k * 3);
      // colour: grass → rock with height, sand on the beach (no faction colour: the hex tiles carry it, spec §4.27)
      if (!land) c.copy(seabed);
      else {
        c.copy(grass).lerp(rock, smooth(8, 20, h));
        c.lerp(sand, 1 - smooth(1, BEACH, d));
        if (sd > -99) c.lerp(sand, 0.95 * smooth(-3, 2, sd)); // the Wu sand
        for (const q of dist) if (inside(x, z, q.poly)) c.lerp(tintC.set(q.tint), 0.16);
        for (const q of grounds) {
          if (x < q.box[0] || z < q.box[1] || x > q.box[2] || z > q.box[3] || !inside(x, z, q.poly) || (q.hole && inside(x, z, q.hole)))
            continue;
          const v = q.contour ? h : x * q.ca + z * q.sa;
          c.lerp(Math.floor(v / q.band) % 2 ? q.B : q.A, 0.75);
          if (q.kind === 'water') (lakes[grounds.indexOf(q)] = lakes[grounds.indexOf(q)] || []).push(k);
        }
      }
      col.set([c.r, c.g, c.b], k * 3);
    }
  // a lake: its patch sinks to just under its lowest shore, so the water reads level on a slope
  for (const ks of lakes) {
    if (!ks) continue;
    const lvl = Math.min(...ks.map(k => H[k])) - 0.4;
    for (const k of ks) {
      H[k] = lvl;
      pos[k * 3 + 1] = lvl;
    }
  }
  const idx = new Uint32Array(nx * nz * 6);
  let n = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        d = a + nx + 1,
        e = d + 1;
      idx.set([a, d, b, b, d, e], n);
      n += 6;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const heightAt = (x, z) => {
    const fx = clamp(x / sx, 0, nx - 0.001),
      fz = clamp(z / sz, 0, nz - 0.001),
      i = Math.floor(fx),
      j = Math.floor(fz),
      u = fx - i,
      v = fz - j,
      g = (a, b) => H[b * (nx + 1) + a];
    return lerp(lerp(g(i, j), g(i + 1, j), u), lerp(g(i, j + 1), g(i + 1, j + 1), u), v);
  };
  return { geo, heightAt, W, D, base: col.slice() };
}

export function create(onIdle) {
  const canvas = document.createElement('canvas'),
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true }),
    scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(40, 1, 1, 3000),
    ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    hit = new THREE.Vector3();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.background = new THREE.Color(0x0b1d2c);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(sun.shadow.camera, { left: -SHADOW_BOX, right: SHADOW_BOX, top: SHADOW_BOX, bottom: -SHADOW_BOX, near: 1, far: 500 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x1d5f8f, specular: 0x9bc4e0, shininess: 90, transparent: true, opacity: 0.92 })
  );
  scene.add(water);

  let terrain = null,
    mesh = null,
    on = null,
    el = null,
    ro = null,
    raf = 0,
    last = 0,
    gone = 0,
    dead = false,
    avatar = null,
    furn = null, // pins, labels, flag, decals (pins3d.mjs)
    town = null, // roads, lots, landmarks (town3d.mjs)
    life = null, // figures, battle crowd, frontier patrols (life3d.mjs)
    clock = 0,
    fogKey = null,
    badge = null,
    follow = false, // the camera follows the avatar while it walks (until the user drags)
    seen = null, // the you.at last shown
    view = null, // { x, z, d }: the camera target on the ground and its distance (kept across re-mounts)
    fly = null, // a camera move to a selected place: { x0, z0, d0, x1, z1, d1, t }
    cur = null, // the last model (pins for select)
    lastSel = null,
    cw = 0, // canvas size (px), cached by size() — never read from the DOM per frame
    ch = 0;

  const build = m => {
    terrain = buildTerrain(m);
    mesh = new THREE.Mesh(terrain.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    water.position.set(terrain.W / 2, 0, terrain.D / 2);
    avatar = createAvatar(scene);
    town = createTown(scene, terrain.heightAt);
    furn = createFurniture(scene, terrain.heightAt);
    life = createLife(scene, terrain.heightAt);
    furn.layer.addEventListener('wheel', onWheel, { passive: false }); // wheel over a pin still zooms
  };
  /** Darken the terrain where nothing you have visited lies within fog.r (unexplored land stays visible, dim). */
  const applyFog = f => {
    const key = JSON.stringify(f);
    if (key === fogKey) return;
    fogKey = key;
    const attr = terrain.geo.attributes.color,
      pos = terrain.geo.attributes.position.array,
      base = terrain.base,
      k = fogFactor(f);
    for (let i = 0; i < attr.count; i++) {
      const v = k(pos[i * 3], pos[i * 3 + 2]);
      attr.setXYZ(i, base[i * 3] * v, base[i * 3 + 1] * v, base[i * 3 + 2] * v);
    }
    attr.needsUpdate = true;
  };
  const place = () => {
    const { x, z, d } = view;
    cam.position.set(x, d * Math.sin(PITCH), z + d * Math.cos(PITCH));
    cam.lookAt(x, 0, z);
    sun.target.position.set(x, 0, z);
    sun.position.set(x + 70, 130, z + 45);
  };
  const size = () => {
    if (!el || !el.clientWidth || !el.clientHeight) return;
    cw = el.clientWidth;
    ch = el.clientHeight;
    renderer.setSize(cw, ch, false);
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
  };
  /** Ground point (y = 0) under a pointer event, or null (sky). */
  const ground = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray.ray.intersectPlane(plane, hit) ? hit : null; // the shared vector: read it before the next call
  };
  const clampView = () => {
    view.x = clamp(view.x, 0, terrain.W);
    view.z = clamp(view.z, 0, terrain.D);
    view.d = clamp(view.d, DIST[0], DIST[1]);
  };

  // input: drag pans (grab the ground point), wheel zooms, a click (< CLICK_PX) picks a map point
  let grab = null,
    down = null;
  /** While your player walks the camera stays on them and the map takes no input (owner, 2026-10-03). */
  const walking = () => !!(avatar && avatar.busy());
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
    clampView();
    place();
    follow = false;
  };
  const onUp = e => {
    if (!down) return;
    const click = down.moved < CLICK_PX;
    down = grab = null;
    if (!click || !on || !mesh) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObject(mesh)[0],
      p = h ? h.point : ray.ray.intersectPlane(plane, hit);
    if (p) on.point(toMap(p.x, p.z).map(Math.round));
  };
  const onWheel = e => {
    e.preventDefault();
    if (walking()) return;
    view.d *= Math.exp(e.deltaY * 0.0012);
    clampView();
    place();
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

  /** Fly the camera to your avatar (the map's ◎ button / key C), at most 70 m away; it then follows your walks again. */
  const centre = () => {
    if (!avatar || !view) return;
    const [x, z] = avatar.pos();
    fly = { x0: view.x, z0: view.z, d0: view.d, x1: x, z1: z, d1: Math.min(view.d, 70), t: 0 };
    follow = true;
  };
  /** Move the camera over a pin (≤ FLY_S): keep the zoom unless the pin is off-screen (then at least 80 m away). */
  const flyTo = id => {
    const p = cur && cur.pins && cur.pins.find(q => q.id === id);
    if (!p || !view) return;
    const [x, z] = toWorld(p.at),
      v = new THREE.Vector3(x, 0, z).project(cam),
      off = Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9;
    fly = { x0: view.x, z0: view.z, d0: view.d, x1: x, z1: z, d1: off ? Math.max(view.d, 80) : view.d, t: 0 };
    follow = false;
  };
  const frame = t => {
    raf = 0;
    if (dead) return;
    const dt = Math.min((t - last) / 1000 || 0, 0.1);
    last = t;
    if (!canvas.isConnected) {
      gone += dt;
      if (gone > IDLE_S) return onIdle && onIdle(); // the career screen is gone: release the GPU objects
    } else {
      gone = 0;
      avatar.tick(dt, terrain.heightAt);
      clock += dt;
      life.tick(dt, clock);
      furn.pulse(clock);
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / FLY_S);
        const k = smooth(0, 1, fly.t);
        view.x = fly.x0 + (fly.x1 - fly.x0) * k;
        view.z = fly.z0 + (fly.z1 - fly.z0) * k;
        view.d = fly.d0 + (fly.d1 - fly.d0) * k;
        clampView();
        place();
        if (fly.t >= 1) fly = null;
      }
      if ((follow || avatar.busy()) && avatar.busy() && !fly) {
        const [ax, az] = avatar.pos(),
          k = 1 - Math.exp(-dt * 8); // held on the player for the whole walk
        view.x += (ax - view.x) * k;
        view.z += (az - view.z) * k;
        clampView();
        place();
      }
      const n = avatar.lapse(),
        txt = n ? `×${n < 2 ? n.toFixed(1) : Math.round(n)}` : '';
      if (badge && badge.textContent !== txt) {
        badge.textContent = txt;
        badge.hidden = !txt;
      }
      renderer.render(scene, cam);
      furn.tick(cam, cw, ch, view.d);
    }
    raf = requestAnimationFrame(frame);
  };

  const api = {
    /** Put the canvas into el (replacing its content) and start drawing the model. */
    mount(e, m, cb) {
      el = e;
      on = cb;
      el.replaceChildren(canvas);
      badge = document.createElement('div');
      badge.className = 'mapbadge';
      badge.hidden = true;
      el.append(badge);
      if (ro) ro.disconnect();
      ro = new ResizeObserver(size);
      ro.observe(el);
      if (!terrain) {
        build(m);
        const at = m.you ? m.you.at : m.focus; // first view: every known place and you in frame, else on the player ~60 m away
        size();
        view = fitView([...(m.pins || []).map(p => toWorld(p.at)), toWorld(at)], cw / Math.max(1, ch) || 16 / 9, 60, 510) || {
          x: at[0] * MAP_M,
          z: at[1] * MAP_M,
          d: 60
        };
        if (view.d > 60) {
          view.d = Math.min(340, view.d * 1.15); // perspective: the far edge needs more room than the fit assumes
          view.z += view.d * 0.08; // and the near edge stays clear of the bottom chips
        }
      }
      el.insertBefore(furn.layer, badge);
      clampView();
      size();
      place();
      api.update(m);
      gone = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    /** New model: first time stand at you.at, later walk there when it changed. */
    update(m) {
      if (!furn) return;
      cur = m;
      if (m.sel && m.sel !== lastSel) flyTo(m.sel); // selected from outside the map (list, chip, banner)
      lastSel = m.sel;
      town.sync(m);
      furn.sync(m, on);
      life.sync(m);
      applyFog(m.fog);
      const at = m.you && m.you.at;
      if (!at || !avatar) return;
      const key = at.join(',');
      if (seen === null) avatar.snap(at);
      else if (key !== seen) {
        const [x0, z0] = avatar.pos();
        avatar.setTarget(at, m.you.route);
        down = grab = null; // a drag in progress ends: the camera is the walk's
        fly = { x0: view.x, z0: view.z, d0: view.d, x1: x0, z1: z0, d1: clamp(view.d, 45, 110), t: 0 }; // onto the player first
        follow = true;
      }
      seen = key;
    },
    select: id => {
      if (!furn) return;
      furn.select(id);
      if (id && id !== lastSel) flyTo(id);
      lastSel = id;
    },
    centre,
    /** True while your player is walking to a new place (the UI locks its actions until they arrive). */
    busy: walking,
    heightAt: (x, z) => (terrain ? terrain.heightAt(x, z) : 0),
    info: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geos: renderer.info.memory.geometries,
      tex: renderer.info.memory.textures,
      life: life && life.count(),
      view: view && { ...view }
    }),
    dispose() {
      dead = true;
      if (avatar) avatar.dispose();
      if (furn) furn.dispose();
      if (town) town.dispose();
      if (life) life.dispose();
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      for (const [k, f, o] of listeners) canvas.removeEventListener(k, f, o);
      if (furn) furn.layer.removeEventListener('wheel', onWheel);
      canvas.remove();
      // shared kit materials / geometry caches (userData.shared) belong to their module and survive a re-create
      scene.traverse(o => {
        if (o.userData && o.userData.shared) return;
        if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) if (!(m.userData && m.userData.shared)) m.dispose();
      });
      sun.shadow.map && sun.shadow.map.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
  return api;
}
