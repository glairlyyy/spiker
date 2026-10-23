// The 3D island map (three.js). Draws a MapModel (see js/career/mapmodel.js) as low-poly terrain with water, a fixed
// tilted camera and pan / zoom, and reports clicks as map points.
//   create(onIdle) → { mount(el, model, on), update(model), select(id), dispose(), info(), setPhase(p), setLow(b), clock(),
//                      mark(id), figureAt(id), street(), youPos(), interiors() } (+ the dev / QA hooks below)
// Street level (spec §4.37 6, T-336a): inside model.street's district the zoom goes down to a follow camera behind you (mapcam3d.mjs
// streetPose); street() = 0–1 how far down it is; youPos() = world [x, y, z]. As it goes down your avatar shrinks to life
// size, the people near the camera become VRMs (life3d), the town's detail ring builds round the camera (town3d ring), the sky shows
// and a haze hides the map look far off. The interiors layer (js/map3d/interior3d.mjs, T-336b — imported once at build):
// createInteriors(scene, heightAt, { cut }) (cut = town.cut) → see interior3d.mjs; today's people for a place inside stand at its
// stations (lifeM), the station you stand at goes to on.station(st | null), a street-level click on one to on.station(st, true).
// on = { pick(id), point([x, y]), hover?(id | null, clientX, clientY, going), person?(id), station?(st | null, click?) }: hover / person are the named figures
// (life3d pick; a click or right-click on one goes to person instead of point; the hovered one and mark(id) get a ring underfoot). The day clock (spec §4.37 2): model.time (MapModel.time) gives
// the week time of the waiting day and of the last action's walk and order; setPhase(p | () => p) tells the map which of
// 'idle' | 'walk' | 'order' is playing; the clock runs toward it (never back), the walk's share by how far the avatar has come
// along its road (so it holds while the avatar stands still), and sets the sun, the sky and the night lights.
// The player's avatar (avatar3d.mjs) stands at model.you.at — inside the place there (you.inside, spec §4.40: in through its door) — and
// walks when it changes (out of the door it stood inside first: you.exit); the camera follows it.
// Units: map (x, y) → world (x·MAP_M, 0, y·MAP_M) metres (1 map unit = 0.5 m). One renderer and canvas live across
// re-mounts (the career screen re-creates its #mapwrap each render); the view (target, distance) survives them.
// Display only: no rules, no randoms (terrain noise is a fixed hash).
import * as THREE from 'three';
import { createAvatar } from './avatar3d.mjs';
import { createFurniture } from './pins3d.mjs';
import { createLife } from './life3d.mjs';
import { createTown } from './town3d.mjs';
import { createNature } from './nature3d.mjs';
import { createMapCam } from './mapcam3d.mjs';
import { buildTerrain } from './terrain3d.mjs';
import { lightScene, skyAt, SKY, LOOK, richLook } from './look3d.mjs';
import { nightLayer, warLayer } from './layers3d.mjs';
import { MAP_M, clamp, lerp, fogFactor, inside, edgeDist, sideDist } from './geo3d.mjs';
export { inside, edgeDist, sideDist }; // (the polygon maths live in geo3d.mjs; tests import them from here too)

/** The street battle's pick radius (m) round its point (spec §4.40: the crowd stands there). */
const CLASH_R = 12;
/** Where your figure stands for model m: inside the place (you.inside's last point, spec §4.40), else you.at. */
export const standAt = m => (m.you.inside && m.you.inside.length ? m.you.inside[m.you.inside.length - 1] : m.you.at);
const IDLE_S = 3; // canvas detached this long → release the renderer

/** Free every geometry / material the map made (shared kit caches — userData.shared — survive a re-create), the GPU context. */
function releaseScene(scene, renderer, sun) {
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
export function create(onIdle) {
  const canvas = document.createElement('canvas'),
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true }),
    scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(40, 1, 1, 3000);
  const { sun, hemi, water } = lightScene(renderer, scene);
  const look = richLook(renderer, scene, cam, sun), // the detailed look (T-343); off = the Fast setting's flat look
    flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    gfx = () => (typeof G !== 'undefined' && G && G.gfx) || 'auto';

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
    figs = new Map(), // people drawn as full models (model.figures: the guide, the rival, the aces) by id
    furn = null, // pins, labels, flag, decals (pins3d.mjs)
    town = null, // roads, lots, landmarks (town3d.mjs)
    life = null, // figures, battle crowd, frontier patrols (life3d.mjs)
    nature = null, // trees, rocks, grass and the animals (nature3d.mjs, spec §4.19c)
    clock = 0,
    fogKey = null,
    badge = null,
    walkK = 1, // your walking speed (×1 / ×2 / ×4 — the map's speed selector, T-214)
    seen = null, // the you.at last shown
    fallSeen, // the latest destroyed war unit already shown (model.borders.fall.key; the first model sets it without a pan)
    war = null, // the war's borders, hot stretch and banners (spec §4.34: warLayer)
    cur = null, // the last model (pins for select)
    lastSel = null,
    cw = 0, // canvas size (px), cached by size() — never read from the DOM per frame
    ch = 0,
    night = null, // windows, lamps, floodlights (nightLayer)
    onW = null, // the mount callbacks as mapcam sees them: a click on a named figure goes to on.person instead of on.point
    low = false, // the Fast graphics setting: fewer named figures and night lights
    // the day clock (spec §4.37 2): wt = the shown week time (days; its fraction = the time of day), never run back
    wt = null,
    tod = 0.5,
    lit = 0,
    phase = 'idle', // 'idle' | 'walk' | 'order', or a function returning one (MapView.phase)
    walkPts = null, // the current walk's road (world [x, z]) and its cumulative lengths, for how far along it the avatar is
    walkLen = null,
    prog = 1,
    lastWalk = null, // model.time.walk[0] last seen: a change = a new action
    hoverId = null,
    facHov = null, // the facility under the pointer (spec §4.40: it lights up; a click picks it)
    ray = new THREE.Raycaster(),
    ptr = null, // the pointer over the canvas { x, y, cx, cy } (canvas px, client px) — picked in the frame
    pickN = 0,
    held = null, // QA: a time of day the clock holds (holdClock)
    interiors = null, // the interiors layer (interior3d.mjs, T-336b; null until its import lands)
    interNear = null, // the station you stand at (last told to on.station)
    st = 0; // the camera's street weight this frame (C.street())
  const bgCol = scene.background,
    skyCol = new THREE.Color(), // the clock's sky colour (skyAt writes it); street level shows the baked sky instead
    haze = (scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6)); // street level: distance haze (off on the map: 1e6 m)
  /** The model life draws: while the insides show, today's people for a place inside stand at its stations (interiors.people). */
  const lifeM = m => (interiors ? interiors.people(m) : m);
  /** The interiors each frame (after the camera): shown / faded by street level; the station you stand at → on.station(st | null)
   *  (st with its client point x / y; not while walking); a flip of shown re-syncs life with lifeM. */
  const interStep = dt => {
    if (!interiors) return;
    const r = interiors.tick(dt, { cam, you: avatar.pos(), street: st, low, size: [cw, ch] });
    if (r.flip && cur && life) life.sync(lifeM(cur), low);
    const near = r.near && !avatar.busy() ? r.near : null;
    if (!near && !interNear) return;
    interNear = near;
    if (!on || !on.station) return;
    if (!near) return on.station(null);
    const v = new THREE.Vector3(near.p[0], near.p[1], near.p[2]).project(cam),
      b = canvas.getBoundingClientRect();
    on.station({ ...near, x: b.left + ((v.x + 1) / 2) * cw, y: b.top + ((1 - v.y) / 2) * ch });
  };
  /** A street-level click (canvas px) on a station: on.station(st, true), and the click is taken (no travel). */
  const consume = xy => {
    const s = interiors && interiors.at(xy);
    if (s && on && on.station) on.station(s, true);
    return !!s;
  };

  // camera and input (mapcam3d.mjs): it reads the parts below as they appear
  const C = createMapCam(cam, canvas, sun, () => ({
    terrain,
    mesh,
    avatar,
    cur,
    on: onW,
    cw,
    ch,
    walkK,
    consume
  }));
  const build = m => {
    terrain = buildTerrain(m);
    mesh = new THREE.Group(); // the terrain in culled chunks sharing one set of attributes (terrain3d, T-350)
    for (const g of terrain.chunks) {
      const c = new THREE.Mesh(g, low ? flatMat : look.terrainMat);
      c.receiveShadow = true;
      c.castShadow = true;
      mesh.add(c);
    }
    look.setTerrain(terrain);
    look.set(!low, water);
    scene.add(mesh);
    water.position.set(terrain.W / 2, 0, terrain.D / 2);
    avatar = createAvatar(scene);
    town = createTown(scene, terrain.heightAt, { fast: () => low }); // the Fast boxes follow setLow (T-342 × T-343)
    furn = createFurniture(scene, terrain.heightAt, id => {
      const f = town.facility(id); // the tag and the popup's anchor stand over the building's roof (spec §4.40)
      return f && { x: f.x, y: f.base + f.h, z: f.z, r: Math.max(f.w, f.d) / 2 };
    });
    life = createLife(scene, terrain.heightAt);
    nature = createNature(scene, terrain.heightAt);
    war = warLayer(scene, terrain.heightAt);
    night = nightLayer(scene, terrain.heightAt);
    furn.layer.addEventListener('wheel', C.onWheel, { passive: false }); // wheel over a pin still zooms
    // the interiors (T-336b): imported here, not up front, so the map draws before it lands
    import('./interior3d.mjs')
      .then(({ createInteriors }) => {
        if (dead || !terrain) return;
        interiors = createInteriors(scene, terrain.heightAt, { cut: b => town.cut(b) }); // (the gym's landmark: town.cut)
        if (cur) (interiors.sync(cur), life.sync(lifeM(cur), low));
      })
      .catch(() => (interiors = null));
  };
  /** How far along its road the avatar has come (0–1, never back): the walk's share of the clock holds while it stands. */
  const walkProgress = () => {
    if (!walkPts || !avatar) return 1;
    const [x, z] = avatar.pos();
    let best = Infinity,
      s = 0;
    for (let i = 1; i < walkPts.length; i++) {
      const [ax, az] = walkPts[i - 1],
        [bx, bz] = walkPts[i],
        dx = bx - ax,
        dz = bz - az,
        L2 = dx * dx + dz * dz || 1,
        u = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1),
        d = Math.hypot(x - ax - dx * u, z - az - dz * u);
      if (d < best) ((best = d), (s = walkLen[i - 1] + u * Math.sqrt(L2)));
    }
    return Math.max(prog, clamp(s / (walkLen[walkLen.length - 1] || 1), 0, 1));
  };
  /** Advance the shown clock toward what the reported phase asks for (model.time), at most its rate; never back. */
  const clockStep = dt => {
    const T = cur && cur.time;
    if (!T) return;
    if (held !== null) return void (tod = held); // (QA: holdClock)
    const ph = typeof phase === 'function' ? phase() : phase,
      acted = T.walk[1] > T.walk[0] + 1e-6;
    let aim = T.idle,
      rate = T.rate.idle;
    if (ph === 'walk' && acted) {
      prog = walkProgress();
      aim = lerp(T.walk[0], T.walk[1], prog);
      rate = T.rate.walk;
    } else if (ph === 'order' && acted) ((aim = T.order[1]), (rate = T.rate.order));
    if (wt === null) wt = aim;
    if (aim < wt - 0.5) wt -= Math.ceil(wt - aim); // a new week: round through the night to its dawn
    if (aim > wt + 1.5) wt += Math.floor(aim - wt - 0.5); // days passed unseen: skip them
    if (aim > wt) wt = Math.min(aim, wt + rate * dt);
    tod = wt - Math.floor(wt);
  };
  const onPtr = e => {
    const r = canvas.getBoundingClientRect();
    ptr = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
    pickN = 0;
  };
  const offPtr = () => {
    ptr = null;
    if (hoverId !== null) ((hoverId = null), (canvas.style.cursor = ''), life && life.hover(null), on && on.hover && on.hover(null));
    facHover(null);
  };
  /** The facility under the pointer: lit (town), its tag (furniture), the cursor. Only places you know can be picked (model.pins). */
  const facHover = id => {
    if (id === facHov) return;
    facHov = id;
    if (town) town.hover(id);
    if (furn) furn.hover(id);
    if (hoverId === null) canvas.style.cursor = id !== null ? 'pointer' : '';
  };
  const facPick = (x, y) => {
    if (!town || !cur || st > 0.5 || !cw) return null; // (at street level the buildings are walked into, not picked)
    const known = new Set((cur.pins || []).map(p => p.id));
    ray.setFromCamera(new THREE.Vector2((x / cw) * 2 - 1, -(y / ch) * 2 + 1), cam);
    const id = town.pickRay(ray.ray, id => known.has(id));
    if (id !== null) return id;
    // this week's street battle keeps its own pick (spec §4.40): the crowd's ground, CLASH_R m round its point
    const c = (cur.pins || []).find(p => p.id === 'clash');
    if (!c) return null;
    const cx = c.at[0] * MAP_M,
      cz = c.at[1] * MAP_M,
      R = ray.ray,
      t = R.direction.y < -1e-6 ? (terrain.heightAt(cx, cz) + 1 - R.origin.y) / R.direction.y : -1;
    return t > 0 && Math.hypot(R.origin.x + R.direction.x * t - cx, R.origin.z + R.direction.z * t - cz) < CLASH_R ? 'clash' : null;
  };
  /** A right-click on a named figure opens its menu too (spec §4.37 7); the browser's own menu never shows over the map. */
  const onCtx = e => {
    e.preventDefault();
    if (!life || !cur || (avatar && avatar.busy()) || !on || !on.person || C.dragged()) return; // (a right-drag orbited)
    const r = canvas.getBoundingClientRect(),
      look = cur.life && cur.life.look,
      id = life.pick(cam, e.clientX - r.left, e.clientY - r.top, cw, ch, look ? look.pick : 16);
    if (id !== null) on.person(id);
  };
  canvas.addEventListener('pointermove', onPtr);
  canvas.addEventListener('pointerleave', offPtr);
  canvas.addEventListener('contextmenu', onCtx);
  /** The named figure under the pointer (every few frames, or right after a move): tell the UI (hover tip), set the cursor. */
  const hoverStep = () => {
    if (!ptr || !life || !cur || pickN-- > 0) return;
    pickN = 6;
    const look = cur.life && cur.life.look,
      id = life.pick(cam, ptr.x, ptr.y, cw, ch, look ? look.pick : 16);
    facHover(id === null && !C.dragged() ? facPick(ptr.x, ptr.y) : null); // a person first, else the building under them
    if (id !== hoverId) canvas.style.cursor = id !== null || facHov !== null ? 'pointer' : '';
    if (id !== hoverId) life.hover(id);
    if (id !== hoverId || id !== null) {
      hoverId = id;
      if (on && on.hover) on.hover(id, ptr.cx, ptr.cy, id !== null ? life.going(id, tod) : null);
    }
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
  const size = () => {
    if (!el || !el.clientWidth || !el.clientHeight) return;
    cw = el.clientWidth;
    ch = el.clientHeight;
    look.resize(cw, ch);
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
  };
  /** Street level's extras each frame: the detail ring round the camera, the sky and the haze. */
  const streetLook = () => {
    const [ax, az] = avatar.pos(),
      inD = C.inDistrict(ax, az);
    town.ring(cam.position.x, cam.position.z, st, inD);
    war.show(st < 0.5);
    // the sky: the baked one (detailed look), else the clock's sky colour (Fast) — never the map's backdrop
    skyCol.copy(hemi.color).lerp(bgCol, 0.25);
    if (st > 0.15) scene.background = (look.on && look.envTex()) || skyCol;
    haze.color.copy(skyCol);
    haze.near = st > 0 ? 160 + (1 - st) * 4000 : 1e6;
    haze.far = st > 0 ? haze.near + 900 + (1 - st) * 6000 : 2e6;
  };
  renderer.info.autoReset = false; // (the post draws several passes: info counts the whole frame)
  const draw = () => (renderer.info.reset(), look.on ? look.render() : renderer.render(scene, cam));
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
      st = C.street();
      avatar.setLife(st);
      avatar.tick(dt * walkK, terrain.heightAt); // your walk at the chosen speed (setWalk; the others keep theirs)
      for (const f of figs.values()) (f.setLife(st), f.tick(dt, terrain.heightAt)); // (the guide, the rival, the aces: life size too)
      clock += dt;
      clockStep(dt);
      scene.background = bgCol; // (skyAt mixes into the colour)
      lit = cur && cur.time ? skyAt(cur.time.keys, tod, sun, hemi, scene) : ((hemi.intensity = 0.9), 0);
      if (look.on) hemi.intensity *= lerp(LOOK.hemi[0], LOOK.hemi[1], lit); // (by day the sky's environment light adds the rest)
      if (C.view) life.ringScale((14 * 2 * C.view.d * Math.tan((cam.fov * Math.PI) / 360)) / (ch || 1) / 0.7); // a ring ≥ ~14 px
      life.tick(dt, clock, tod, cam, st); // (cam: the nearest named people on screen as VRMs; st: life size and the near VRMs at street level)
      hoverStep();
      town.tick(dt);
      nature.tick(dt, clock);
      furn.pulse(clock);
      war.pulse(clock);
      C.step(dt);
      st = C.street();
      streetLook();
      interStep(dt);
      if (cur && cur.time) sun.position.copy(sun.target.position).addScaledVector(SKY.dir, 150); // the hour's sun (after the camera placed it)
      night.set(lit, (ch * renderer.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360)), renderer.getPixelRatio());
      look.step(dt, clock, lit, tod, C.view, gfx());
      const n = avatar.lapse(),
        txt = n ? `×${n < 2 ? n.toFixed(1) : Math.round(n)}` : '';
      if (badge && badge.textContent !== txt) {
        badge.textContent = txt;
        badge.hidden = !txt;
      }
      draw();
      furn.tick(cam, cw, ch, C.view.d);
    }
    raf = requestAnimationFrame(frame);
  };

  const api = {
    /** Put the canvas into el (replacing its content) and start drawing the model. */
    mount(e, m, cb) {
      el = e;
      on = cb;
      onW = cb && {
        ...cb,
        point: p => {
          if (hoverId !== null && cb.person) return cb.person(hoverId);
          const f = ptr ? facPick(ptr.x, ptr.y) : null; // a facility under the click opens its place (spec §4.40)
          return f !== null ? cb.pick(f) : cb.point(p);
        }
      };
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
        size();
        C.initView(m);
      }
      el.insertBefore(furn.layer, badge);
      size();
      C.fit();
      api.update(m);
      gone = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    /** New model: first time stand at you.at, later walk there when it changed. */
    update(m) {
      if (!furn) return;
      cur = m;
      const fall = m.borders && m.borders.fall ? m.borders.fall.key : null;
      if (fallSeen !== undefined && fall && fall !== fallSeen)
        (m.pins || []).some(p => p.id === m.borders.fall.pin) ? C.flyTo(m.borders.fall.pin) : C.overview(); // a unit destroyed: the camera goes to see (spec §4.34)
      fallSeen = fall;
      if (m.sel && m.sel !== lastSel) C.flyTo(m.sel); // selected from outside the map (list, chip, banner)
      lastSel = m.sel;
      town.sync(m);
      nature.sync(m, low);
      if (interiors) interiors.sync(m); // (before life: lifeM reads where the stations are)
      furn.sync(m, on);
      town.rims(m.rims);
      life.sync(lifeM(m), low);
      night.sync(m, low);
      war.sync(m.borders);
      applyFog(m.fog);
      const want = new Map((m.figures || []).map(f => [f.id, f]));
      for (const [id, a] of figs) if (!want.has(id)) (a.dispose(), figs.delete(id));
      for (const [id, f] of want) {
        if (!figs.has(id)) figs.set(id, createAvatar(scene, { kit: f.kit }));
        figs.get(id).snap(f.at);
        figs.get(id).face(f.face);
      }
      const at = m.you && m.you.at;
      if (!at || !avatar) return;
      const key = at.join(','),
        tail = m.you.inside || [], // arriving inside (spec §4.40): on from the door to where you stand in the place
        head = m.you.exit || []; // …and out of the one you leave
      if (m.time && m.time.walk[0] !== lastWalk) ((walkPts = null), (prog = 1)); // a new action (no walk unless one starts below)
      lastWalk = m.time ? m.time.walk[0] : null;
      if (seen === null) avatar.snap(standAt(m));
      else if (key !== seen) {
        const [x0, z0] = avatar.pos();
        avatar.setTarget(at, m.you.route, { head, tail });
        walkPts = [
          [x0, z0],
          ...[...head, ...(m.you.route && m.you.route.length > 1 ? m.you.route.slice(1, -1) : []), at, ...tail].map(p => [
            p[0] * MAP_M,
            p[1] * MAP_M
          ])
        ];
        walkLen = [0];
        for (let i = 1; i < walkPts.length; i++)
          walkLen.push(walkLen[i - 1] + Math.hypot(walkPts[i][0] - walkPts[i - 1][0], walkPts[i][1] - walkPts[i - 1][1]));
        prog = 0;
        C.walkFrom(x0, z0); // a drag in progress ends: the camera is the walk's, onto the player first
      }
      seen = key;
    },
    select: id => {
      if (!furn) return;
      furn.select(id);
      if (id && id !== lastSel) C.flyTo(id);
      lastSel = id;
    },
    centre: () => C.centre(),
    overview: () => C.overview(),
    /** Your walking speed on the map: ×k (1, 2, 4). */
    setWalk(k) {
      walkK = k > 0 ? k : 1;
    },
    /** Which part of the day is playing: 'idle' | 'walk' | 'order', or a function the map asks each frame (MapView.phase). */
    setPhase(p) {
      phase = p || 'idle';
    },
    /** The Fast graphics setting: fewer named figures (life.look.low) and night lights, the town's instanced boxes, no posts. */
    setLow(v) {
      if (low === !!v) return;
      low = !!v;
      if (cur && life) (town.sync(cur), life.sync(lifeM(cur), low), night.sync(cur, low));
      if (mesh && cur)
        (look.set(!low, water), mesh.children.forEach(c => (c.material = low ? flatMat : look.terrainMat)), nature.sync(cur, low)); // the look (T-343)
    },
    /** The shown clock: { week (days), tod (0–1), lit (0–1) } — for QA and the UI. */
    clock: () => ({ week: wt, tod, lit }),
    /** Dev / QA: jump the shown clock to week time w (it then runs on toward the phase from there — forward only). */
    setClock(w) {
      wt = w;
      tod = w - Math.floor(w);
    },
    /** Dev / QA: hold the time of day at t (0–1) whatever the phase asks; null lets the clock run again. */
    holdClock(t) {
      held = t === null || t === undefined ? null : t;
    },
    /** Dev / QA: the mean time (ms) to draw one frame, n frames drawn back to back and waited for (a 1-px read). */
    bench(n = 5) {
      const gl = renderer.getContext(),
        px = new Uint8Array(4),
        t0 = performance.now();
      for (let i = 0; i < n; i++) (draw(), gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px));
      return +((performance.now() - t0) / n).toFixed(1);
    },
    /** Dev / QA: put the camera over world point (x, z) at distance d (m); fields left out keep their value. */
    setView(v) {
      if (!C.view) return;
      Object.assign(C.view, v);
      C.fit();
    },
    /** The ring under a named figure's feet (the figure menu's person), or none (null). */
    mark(id) {
      if (life) life.mark(id);
    },
    /** QA: a named figure's screen point (canvas px) or null — to hover it in the UI smoke. */
    figureAt(id) {
      const p = life && life.at(id);
      if (!p) return null;
      const v = new THREE.Vector3(p[0], p[1] - 0.3, p[2]).project(cam);
      return v.z > 1 ? null : [((v.x + 1) / 2) * cw, ((1 - v.y) / 2) * ch];
    },
    /** QA: a facility's screen point (canvas px; the middle of its front, half-way up) or null — to hover it in the UI smoke. */
    facilityAt(id) {
      const f = town && town.facility(id);
      if (!f) return null;
      const v = new THREE.Vector3(f.x, f.base + Math.min(f.h, 6) / 2, f.z).project(cam);
      return v.z > 1 ? null : [((v.x + 1) / 2) * cw, ((1 - v.y) / 2) * ch];
    },
    /** QA: the facility lit by the pointer ({ id, k }) and the always-on rims' count. */
    facHover: () => (town ? town.hovered() : null),
    /** True while your player is walking to a new place (the UI locks its actions until they arrive). */
    busy: () => C.walking(),
    /** Street level (T-336a): 0 = the map, 1 = the follow camera behind you. */
    street: () => st,
    /** Your avatar's world position [x, y (ground), z] (m). */
    youPos() {
      if (!avatar) return [0, 0, 0];
      const [x, z] = avatar.pos();
      return [x, terrain ? terrain.heightAt(x, z) : 0, z];
    },
    /** QA: the interiors' state ({ shown, places, cut, alpha, street, stations }), or null until the module has loaded. */
    interiors: () => interiors && { ...interiors.info(), street: +st.toFixed(3), stations: interiors.stations() },
    /** Dev / QA: the orbit angle round you at street level (rad). */
    setYaw: v => C.setYaw(v),
    /** The camera to keep across a renderer release ({ x, z, d, yaw, street }); restore(v) puts it back. */
    viewState: () => C.view && { ...C.view, yaw: C.yaw(), street: st },
    restore(v) {
      if (!v || !C.view) return;
      Object.assign(C.view, { x: v.x, z: v.z, d: v.d });
      C.setYaw(v.yaw || 0);
      C.fit();
    },
    /** Dev / QA: stand at the model's you.at at once (no walk; a held stop is let go). */
    jump() {
      if (!avatar || !cur || !cur.you || !cur.you.at) return;
      avatar.snap(standAt(cur));
      seen = cur.you.at.join(',');
      C.land();
    },
    /** Take you back to the shown position (a WASD walk the rules refused). */
    home() {
      if (avatar && cur && cur.you && cur.you.at) avatar.setTarget(cur.you.at, null, { tail: cur.you.inside || [] });
    },
    info: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geos: renderer.info.memory.geometries,
      tex: renderer.info.memory.textures,
      life: life && life.count(),
      night: night && night.count(),
      town: town && town.count(), // (null on Fast)
      clock: { week: wt, tod, lit },
      nature: nature && nature.count(),
      ...look.info(),
      view: C.view && { ...C.view },
      street: +st.toFixed(3),
      ring: town && town.ringInfo ? town.ringInfo() : null
    }),
    dispose() {
      dead = true;
      if (avatar) avatar.dispose();
      for (const a of figs.values()) a.dispose();
      figs.clear();
      if (furn) furn.dispose();
      if (town) town.dispose();
      if (life) life.dispose();
      if (nature) nature.dispose();
      if (interiors) interiors.dispose();
      interiors = null;
      if (war) war.dispose();
      if (night) night.dispose();
      canvas.removeEventListener('pointermove', onPtr);
      canvas.removeEventListener('pointerleave', offPtr);
      canvas.removeEventListener('contextmenu', onCtx);
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      C.dispose();
      if (furn) furn.layer.removeEventListener('wheel', C.onWheel);
      canvas.remove();
      look.dispose();
      flatMat.dispose();
      releaseScene(scene, renderer, sun);
    }
  };
  return api;
}
