// The 3D island map (three.js). Draws a MapModel (see js/career/mapmodel.js) as low-poly terrain with water, a fixed
// tilted camera and pan / zoom, and reports clicks as map points.
//   create(host, onIdle) → { mount(el, model, on), update(model), select(id), dispose(), heightAt(x, z), info() }
// The player's avatar (avatar3d.mjs) stands at model.you.at and walks when it changes; the camera follows it.
// Units: map (x, y) → world (x·MAP_M, 0, y·MAP_M) metres (1 map unit = 0.5 m). One renderer and canvas live across
// re-mounts (the career screen re-creates its #mapwrap each render); the view (target, distance) survives them.
// Display only: no rules, no randoms (terrain noise is a fixed hash).
import * as THREE from 'three';
import { createAvatar } from './avatar3d.mjs';
import { createFurniture } from './pins3d.mjs';
import { createLife } from './life3d.mjs';
import { createTown } from './town3d.mjs';

export const MAP_M = 0.5;
export const FOG_DIM = 0.3; // brightness of unexplored terrain (the town layer dims by the same rule)
export const FOG_SOFT = 14; // fog edge softness (m)
export const toWorld = ([x, y]) => [x * MAP_M, y * MAP_M];
export const toMap = (x, z) => [x / MAP_M, z / MAP_M];

const CELL = 2, // terrain grid cell (m)
  PITCH = (55 * Math.PI) / 180,
  DIST = [25, 420],
  CLICK_PX = 5,
  BEACH = 12, // beach slope width (m)
  IDLE_S = 3; // canvas detached this long → release the renderer

const lerp = (a, b, t) => a + (b - a) * t,
  clamp = (v, a, b) => Math.min(b, Math.max(a, v)),
  smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
/** Fixed value noise: a hash of the lattice point, smoothly interpolated. */
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const vnoise = (x, y) => {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    u = smooth(0, 1, x - xi),
    v = smooth(0, 1, y - yi);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
};
/** Point in polygon (poly: [[x, y]…]). */
const inside = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Distance from a point to a closed polygon's outline. */
const edgeDist = (x, y, poly) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j],
      [bx, by] = poly[i],
      dx = bx - ax,
      dy = by - ay,
      t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
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
    tint = new Map(L.regions.map(r => [r.id, new THREE.Color(r.color)])),
    pos = new Float32Array((nx + 1) * (nz + 1) * 3),
    col = new Float32Array((nx + 1) * (nz + 1) * 3),
    H = new Float32Array((nx + 1) * (nz + 1)),
    grass = new THREE.Color(0x5d8a4a),
    rock = new THREE.Color(0x7d7a70),
    sand = new THREE.Color(0xd8c690),
    seabed = new THREE.Color(0x2b5f6e),
    c = new THREE.Color();
  const regionColor = (mx, my) => {
    const p = L.park;
    if (Math.hypot(mx - p.x, my - p.y) <= p.r) return new THREE.Color(L.park.color);
    for (const e of L.minors) {
      const a = (e.rot * Math.PI) / 180,
        dx = mx - e.x,
        dy = my - e.y,
        xr = dx * Math.cos(a) + dy * Math.sin(a),
        yr = -dx * Math.sin(a) + dy * Math.cos(a);
      if ((xr / e.rx) ** 2 + (yr / e.ry) ** 2 <= 1) return new THREE.Color(e.color);
    }
    for (const r of L.regions) if (inside(mx, my, r.poly)) return tint.get(r.id);
    return null;
  };
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = i * sx,
        z = j * sz,
        k = j * (nx + 1) + i,
        land = inside(x, z, coast),
        d = edgeDist(x, z, coast);
      let h;
      if (!land) h = -0.4 * Math.min(d, 10);
      else {
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
      // colour: grass → rock with height, sand on the beach, the region's colour mixed in
      if (!land) c.copy(seabed);
      else {
        c.copy(grass).lerp(rock, smooth(8, 20, h));
        c.lerp(sand, 1 - smooth(1, BEACH, d));
        const rc = regionColor(x / MAP_M, z / MAP_M);
        if (rc) c.lerp(rc, 0.35);
      }
      col.set([c.r, c.g, c.b], k * 3);
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

export function create(host, onIdle) {
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
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 500 });
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
    life = null, // figures, battle crowd, patrols, seized flags (life3d.mjs)
    pressure = 0, // the contested border's pressure 0..1 (pulse)
    clock = 0,
    fogKey = null,
    badge = null,
    follow = false, // the camera follows the avatar while it walks (until the user drags)
    seen = null, // the you.at last shown
    view = null; // { x, z, d }: the camera target on the ground and its distance (kept across re-mounts)

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
      pts = f.points.map(([x, y]) => [x * MAP_M, y * MAP_M]),
      r = f.r * MAP_M;
    for (let i = 0; i < attr.count; i++) {
      let d = Infinity;
      for (const [px, pz] of pts) d = Math.min(d, Math.hypot(pos[i * 3] - px, pos[i * 3 + 2] - pz));
      const k = FOG_DIM + (1 - FOG_DIM) * (1 - smooth(r, r + FOG_SOFT, d));
      attr.setXYZ(i, base[i * 3] * k, base[i * 3 + 1] * k, base[i * 3 + 2] * k);
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
    renderer.setSize(el.clientWidth, el.clientHeight, false);
    cam.aspect = el.clientWidth / el.clientHeight;
    cam.updateProjectionMatrix();
  };
  /** Ground point (y = 0) under a pointer event, or null (sky). */
  const ground = e => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  };
  const clampView = () => {
    view.x = clamp(view.x, 0, terrain.W);
    view.z = clamp(view.z, 0, terrain.D);
    view.d = clamp(view.d, DIST[0], DIST[1]);
  };

  // input: drag pans (grab the ground point), wheel zooms, a click (< CLICK_PX) picks a map point
  let grab = null,
    down = null;
  const onDown = e => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, moved: 0 };
    grab = ground(e);
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
      p = h ? h.point : ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (p) on.point(toMap(p.x, p.z).map(Math.round));
  };
  const onWheel = e => {
    e.preventDefault();
    view.d *= Math.exp(e.deltaY * 0.0012);
    clampView();
    place();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => (down = grab = null));
  canvas.addEventListener('wheel', onWheel, { passive: false });

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
      furn.pulse(pressure, clock);
      if (follow && avatar.busy()) {
        const [ax, az] = avatar.pos(),
          k = 1 - Math.exp(-dt * 4);
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
      furn.tick(cam, el.clientWidth, el.clientHeight, view.d);
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
        const at = m.you ? m.you.at : m.focus; // first view: on the player, ~60 m away
        view = { x: at[0] * MAP_M, z: at[1] * MAP_M, d: 60 };
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
      town.sync(m);
      furn.sync(m, on);
      life.sync(m);
      const bd = m.life && m.life.borders.find(b => b.a === 'wei' && b.b === 'wu');
      pressure = bd ? Math.min(1, Math.abs(bd.meter) / 2) : 0; // FRONT.seize = 2 net wins
      applyFog(m.fog);
      const at = m.you && m.you.at;
      if (!at || !avatar) return;
      const key = at.join(',');
      if (seen === null) avatar.snap(at);
      else if (key !== seen) {
        avatar.setTarget(at);
        follow = true;
      }
      seen = key;
    },
    select: id => furn && furn.select(id),
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
      canvas.remove();
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      sun.shadow.map && sun.shadow.map.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
  return api;
}
