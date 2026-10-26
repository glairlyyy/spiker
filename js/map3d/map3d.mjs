// The 3D island map (three.js). Draws a MapModel (see js/career/mapmodel.js) as low-poly terrain with water, a fixed
// tilted camera and pan / zoom, and reports clicks as map points.
//   create(onIdle) → { mount(el, model, on), update(model), select(id), dispose(), info(), setPhase(p), setLow(b), clock(),
//                      mark(id), figureAt(id), street(), youPos(), interiors() } (+ the dev / QA hooks below)
// Street level (spec §4.37 6, T-336a): inside model.street's district the zoom goes down to a follow camera behind you (mapcam3d.mjs
// streetPose); street() = 0–1 how far down it is; youPos() = world [x, y, z]. As it goes down your avatar shrinks to life
// size, the people near the camera become VRMs (life3d), the town's detail ring builds round the camera (town3d ring), the sky shows
// and a haze hides the map look far off. Streaming (stream3d.mjs, T-364): from STREAM.show down only the blocks near you are
// drawn in full (terrain chunks, the town's detailed lots, nature, the story figures), beyond them coarse terrain, the Fast boxes and
// flat trees under a closer haze; walking never waits (a block not ready yet draws its far version); the heavy preparing runs
// behind an automated action (prepare(true): on.loading(true) asks for a "Loading…" if it takes > STREAM.wait s, false when done) and on arrival. The fog's lantern lags FOG_LAG m there (fogM). The interiors layer (js/map3d/interior3d.mjs, T-336b — imported once at build):
// createInteriors(scene, heightAt, { cut }) (cut = town.cut) → see interior3d.mjs; today's people for a place inside stand at its
// stations (lifeM), the station you stand at goes to on.station(st | null), a street-level click on one to on.station(st, true).
// on = { pick(id), point([x, y]), hover?(id | null, clientX, clientY, going), person?(id), station?(st | null, click?) }: hover / person are the named figures
// (life3d pick; a click or right-click on one goes to person instead of point; the hovered one and mark(id) get a ring underfoot). The day clock (spec §4.37 2): model.time (MapModel.time) gives
// the week time of the waiting day and of the last action's walk and order; setPhase(p | () => p) tells the map which of
// 'idle' | 'walk' | 'order' is playing; the clock runs toward it (never back), the walk's share by how far the avatar has come
// along its road (so it holds while the avatar stands still), and sets the sun, the sky and the night lights.
// The running clock (spec §4.43): setNow(fn) = the UI's week time (MapView.now: the rules' clock as it runs, a session's fast-forward);
// idle / order follow it (a jump catches up at the fast-forward rate); a walk / a ride plays in real time (its hours × model.time.scale
// s ÷ the speed, setWalk(k): ×1 / ×2 / ×4, 0 = paused); the people and the vehicles move on the shown clock (gclock), so they stop with it.
// Transport (spec §4.42, vehicles3d.mjs): the timetable buses / ferry (model.transit, by the shown clock wt), stops and piers, your ride's
// vehicle (avatar.ride()); a ride's legs (model.you.ride) replace the road and its progress() drives the clock.
// The player's avatar (avatar3d.mjs) stands at model.you.at — inside the place there (you.inside, spec §4.40: in through its door) — and
// walks when it changes (out of the door it stood inside first: you.exit); the camera follows it.
// Units: map (x, y) → world (x·MAP_M, 0, y·MAP_M) metres (1 map unit = 0.5 m). One renderer and canvas live across
// re-mounts (the career screen re-creates its #mapwrap each render); the view (target, distance) survives them.
// Performance (owner, 2026-10-25): the terrain's shadow is cast by its coarse chunks (a shadow-only copy on layer SHADOW_LAYER);
// the story figures and you get a level of detail (avatar3d view: hidden off screen, posed every few frames when small);
// perf() = the frame's numbers (fps, ms, JS ms update / draw / labels, calls, tris, render scale, VRMs, blocks) for the overlay
// (PerfHUD.frame('map', perf) each frame while it is on).
// Display only: no rules, no randoms (terrain noise is a fixed hash).
import * as THREE from 'three';
import { createAvatar } from './avatar3d.mjs';
import { createFurniture } from './pins3d.mjs';
import { VRM_Q } from './people3d.mjs';
import { createLife } from './life3d.mjs';
import { createVehicles } from './vehicles3d.mjs';
import { createTown } from './town3d.mjs';
import { createNature } from './nature3d.mjs';
import { createProps } from './props3d.mjs';
import { createMapCam, STREET } from './mapcam3d.mjs';
import { buildTerrain } from './terrain3d.mjs';
import {
  lightScene,
  skyAt,
  SKY,
  LOOK,
  PSKY,
  GLOW,
  STREET_U,
  richLook,
  streetMat,
  STREET_FX,
  FD_GATE,
  autoAt,
  TERRAIN_LOD,
  GROUND_U
} from './look3d.mjs';
import { nightLayer, warLayer } from './layers3d.mjs';
import { createStream, blockGrid, STREAM } from './stream3d.mjs';
import { MAP_M, clamp, lerp, fogFactor, inside, edgeDist, sideDist } from './geo3d.mjs';
export { inside, edgeDist, sideDist }; // (the polygon maths live in geo3d.mjs; tests import them from here too)

/** The street battle's pick radius (m) round its point (spec §4.40: the crowd stands there). */
const CLASH_R = 12;
/** Where your figure stands for model m: inside the place (you.inside's last point, spec §4.40), else you.at. */
export const standAt = m => (m.you.inside && m.you.inside.length ? m.you.inside[m.you.inside.length - 1] : m.you.at);
const STAY_M = 1.6; // m: at street level a new you.at this close to where your avatar stands (a WASD stop, rounded) doesn’t move it
const STOP_WAIT = 2; // s: WASD's stop resolves within this of the last step (mapcam3d STREET.stop + a margin)
const IDLE_S = 3; // canvas detached this long → release the renderer
const SHADOW_LAYER = 1; // the terrain's coarse shadow casters: seen by the sun's shadow camera only
const EMA = (a, v, k = 0.1) => a + (v - a) * k;
const FOG_LAG = 64; // m: at street level the fog's lantern (model.fog: round you) is redrawn only once you've moved this far
/**
 * The perf probe's layers (owner, 2026-10-26; PerfHUD Measure): every top-level object the map adds is tagged by the module that
 * added it (userData.probe, from the caller's file in the stack — scene.add is wrapped once; adds are rare, never per frame).
 */
const PROBE_OF = {
  terrain3d: 'terrain',
  look3d: 'terrain',
  town3d: 'town',
  kit3d: 'town',
  interior3d: 'interiors',
  nature3d: 'nature',
  props3d: 'props',
  people3d: 'people',
  life3d: 'people',
  avatar3d: 'people',
  players3d: 'people',
  vehicles3d: 'vehicles',
  layers3d: 'night',
  pins3d: 'pins'
};
/** Wrap scene.add: an object without a tag gets the adding module's (table: file stem → layer id; 'other' when none matches). */
export function tagAdds(scene, table, self) {
  const add0 = scene.add;
  scene.add = function (...objs) {
    let k = null;
    for (const o of objs)
      if (o && o.userData && !o.userData.probe) {
        if (k === null) {
          k = 'other';
          for (const m of String(new Error().stack).matchAll(/\/([\w-]+)\.m?js/g))
            if (m[1] !== self && table[m[1]]) {
              k = table[m[1]];
              break;
            }
        }
        o.userData.probe = k;
      }
    return add0.apply(this, objs);
  };
}
/** A probe layer item: its tagged top-level objects hidden for one draw (what was visible comes back right after). */
export function layerItem(scene, id, label, extra) {
  const roots = () => scene.children.filter(o => o.userData.probe === id);
  return {
    id,
    label,
    group: 'layer',
    can: () => roots().some(o => o.visible) || 'nothing drawn',
    mask() {
      const r = roots().filter(o => o.visible);
      for (const o of r) o.visible = false;
      const u = extra && extra();
      return () => {
        for (const o of r) o.visible = true;
        if (u) u();
      };
    }
  };
}

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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }),
    scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(40, 1, 1, 3000);
  const { sun, hemi, water } = lightScene(renderer, scene);
  const look = richLook(renderer, scene, cam, sun), // the detailed look (T-343); off = the Fast setting's flat look
    flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    gfx = () => (typeof G !== 'undefined' && G && G.gfx) || 'auto';
  for (const m of [look.terrainMat, look.sea.material, water.material, flatMat]) m.userData.noStreetFx = true; // (the ground never fades)
  water.userData.probe = look.sea.userData.probe = 'terrain';
  for (const o of [sun, sun.target, hemi]) o.userData.probe = 'lights';
  tagAdds(scene, PROBE_OF, 'map3d'); // (the perf probe's layers)

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
    veh = null, // the buses, the ferry, stops and piers, your ride (vehicles3d.mjs, spec §4.42)
    nature = null, // trees, rocks, grass and the animals (nature3d.mjs, spec §4.19c)
    props = null, // street life at street level (props3d.mjs, T-372)
    clock = 0,
    fogKey = null,
    fogRows = 0, // (the terrain rows the fog re-dimmed so far: fogStep)
    terrN = 0, // (terrain chunks on the far material now: terrainLod)
    stPre = 0, // (the last frame's st: entering street level precompiles)
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
    nowFn = null, // the UI's running clock (week time, MapView.now), or null: the model's idle time
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
    crect = null, // the canvas's client rect for the station prompt ({ b, t }: re-read each second and on a resize)
    stV = new THREE.Vector3(),
    stream = null, // street level's near blocks (stream3d.mjs, T-364)
    actK = false, // an automated action passes time (prepare): the stream prepares with the larger budget
    wasBusy = false, // your avatar walked / rode last frame
    arriveT = 0, // s left of the arrival's larger budget
    waitShown = false, // on.loading(true) was told
    fogDrawn = null, // the fog the dimmed layers (terrain, town, nature, night lights) draw now (fogM)
    figRoot = new Map(), // the story figures' own groups (hidden beyond the near blocks at street level)
    st = 0, // the camera's street weight this frame (C.street())
    fxDirty = true, // objects may have come: the street finish sweeps the scene before the next draw (fxStep)
    shade = null; // the terrain's shadow casters (coarse chunks, SHADOW_LAYER)
  const frustum = new THREE.Frustum(),
    projM = new THREE.Matrix4(),
    lodView = { frustum, cam, px: 400, shadows: true }, // the avatars' level of detail (avatar3d tick)
    perf = { fps: 0, ms: 16.7, update: 0, draw: 0, labels: 0, calls: 0, tris: 0, last: 0 }; // the overlay's numbers (EMA)
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
    if (r.flip && cur && life) (life.sync(lifeM(cur), low), (fxDirty = true));
    const near = r.near && !avatar.busy() ? r.near : null;
    if (!near && !interNear) return;
    interNear = near;
    if (!on || !on.station) return;
    if (!near) return on.station(null);
    if (!crect || clock - crect.t > 1) crect = { b: canvas.getBoundingClientRect(), t: clock }; // (not every frame: a forced layout)
    const v = stV.set(near.p[0], near.p[1], near.p[2]).project(cam),
      b = crect.b;
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
    shade = new THREE.Group(); // (performance: the terrain's shadow from its coarse chunks, ~7× fewer triangles — a little lower: no acne)
    for (const [k, g] of terrain.chunks.entries()) {
      const c = new THREE.Mesh(g, low ? flatMat : look.terrainMat);
      c.receiveShadow = true;
      c.castShadow = false;
      mesh.add(c);
      const sc = new THREE.Mesh(terrain.coarse[k], flatMat);
      sc.castShadow = true;
      sc.layers.set(SHADOW_LAYER);
      shade.add(sc);
    }
    shade.position.y = -0.6;
    mesh.userData.probe = shade.userData.probe = 'terrain';
    sun.shadow.camera.layers.enable(SHADOW_LAYER);
    scene.add(shade);
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
    veh = createVehicles(scene, terrain.heightAt);
    nature = createNature(scene, terrain.heightAt, { grass: terrain.grassAt, colour: terrain.colourAt, clear: (x, z) => town.clear(x, z) }); // (T-370: the meadow)
    props = createProps(scene, terrain.heightAt, { solid: (x, z, m) => town.solid(x, z, m) }); // (T-372: street life)
    const n0 = scene.children.length;
    war = warLayer(scene, terrain.heightAt);
    for (const o of scene.children.slice(n0)) o.userData.probe = 'war';
    night = nightLayer(scene, terrain.heightAt);
    // streaming (T-364): the blocks are the terrain's chunks; a far chunk draws its coarse index
    const G = blockGrid(terrain.W, terrain.D, terrain.block[0], terrain.block[1]);
    stream = createStream(G, [
      {
        id: 'terrain',
        ver: () => 0,
        show: keys => mesh.children.forEach((c, k) => (c.geometry = !keys || keys.has(k) ? terrain.chunks[k] : terrain.coarse[k]))
      },
      town.layer(G),
      nature.layer(G),
      props.layer(G)
    ]);
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
    const rp = avatar && avatar.progress(); // a ride (spec §4.42): its own clock
    if (rp !== null && rp !== undefined) return Math.max(prog, rp);
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
    const now = nowFn ? nowFn() : null;
    let aim = Number.isFinite(now) ? now : T.idle,
      rate = Number.isFinite(now) ? ((T.ff || 1.5) * Math.max(1, walkK)) / 24 : T.rate.idle; // (a jump of the running clock: fast-forward)
    if (ph === 'walk' && acted) {
      prog = walkProgress();
      aim = lerp(T.walk[0], T.walk[1], prog);
      rate = T.rate.walk;
    } else if (ph === 'order' && acted && !Number.isFinite(now)) ((aim = T.order[1]), (rate = T.rate.order));
    if (wt === null) wt = aim;
    if (aim < wt - 0.5) wt -= Math.ceil(wt - aim); // a new week: round through the night to its dawn
    if (aim > wt + 1.5) wt += Math.floor(aim - wt - 0.5); // days passed unseen: skip them
    if (aim > wt) wt = aim - wt < 1 / 240 ? aim : Math.min(aim, wt + rate * dt); // (the running clock's own steps: at once)
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
  /**
   * The model the fog-dimmed layers draw: at street level the lantern (model.fog.points, you and home) stays where it was drawn until
   * you have moved FOG_LAG m — every WASD stop is a travel, and each re-dimmed the whole island (terrain, town, trees, night lights);
   * off street level (frame: refog) or a bigger move, the model's own.
   */
  const fogM = m => {
    const f = m.fog,
      d = fogDrawn,
      keep =
        st >= STREAM.show &&
        !!(d && f && d.points && f.points) &&
        d !== f &&
        d.r === f.r &&
        d.points.length === f.points.length &&
        f.points.every((p, i) => Math.hypot(p[0] - d.points[i][0], p[1] - d.points[i][1]) * MAP_M < FOG_LAG);
    if (!keep) fogDrawn = f;
    return keep ? { ...m, fog: d } : m;
  };
  const fogSync = m => {
    const fm = fogM(m);
    town.sync(fm);
    nature.sync(fm, low);
    props.sync(fm);
    night.sync(fm, low);
    applyFog(fm.fog);
  };
  /**
   * Darken the terrain where nothing you have visited lies within fog.r (unexplored land stays visible, dim). The first time at
   * once; later spread over frames (owner 2026-10-26: a 66 ms frame — the whole grid re-dimmed in one): fogStep re-dims ≤ FOG_MS
   * a frame, the grid rows nearest the camera first, uploading only the rows it wrote (two ranges a frame).
   */
  const FOG_MS = 2;
  let fogJob = null;
  const applyFog = f => {
    const key = JSON.stringify(f);
    if (key === fogKey) return;
    const first = fogKey === null;
    fogKey = key;
    fogN++;
    const RW = terrain.shore.w,
      RH = terrain.shore.h,
      c = clamp(Math.round((cam.position.z / terrain.D) * (RH - 1)), 0, RH - 1);
    fogJob = { k: fogFactor(f), c, lo: c - 1, hi: c };
    if (first || !RW) fogStep(Infinity);
  };
  const fogStep = (ms = FOG_MS) => {
    const J = fogJob;
    if (!J || !terrain) return;
    const t0 = performance.now(),
      attr = terrain.geo.attributes.color,
      pos = terrain.geo.attributes.position.array,
      base = terrain.base,
      RW = terrain.shore.w,
      RH = terrain.shore.h;
    let a0 = RH,
      a1 = -1,
      b0 = RH,
      b1 = -1;
    while (J.lo >= 0 || J.hi < RH) {
      let j;
      if (J.hi < RH && (J.lo < 0 || J.hi - J.c <= J.c - J.lo)) ((j = J.hi++), (b0 = Math.min(b0, j)), (b1 = Math.max(b1, j)));
      else ((j = J.lo--), (a0 = Math.min(a0, j)), (a1 = Math.max(a1, j)));
      for (let i = j * RW, e = i + RW; i < e; i++) {
        const v = J.k(pos[i * 3], pos[i * 3 + 2]);
        attr.setXYZ(i, base[i * 3] * v, base[i * 3 + 1] * v, base[i * 3 + 2] * v);
      }
      if (performance.now() - t0 > ms) break;
    }
    if (ms !== Infinity) {
      if (a1 >= 0) attr.addUpdateRange(a0 * RW * 3, (a1 - a0 + 1) * RW * 3);
      if (b1 >= 0) attr.addUpdateRange(b0 * RW * 3, (b1 - b0 + 1) * RW * 3);
    } else attr.clearUpdateRanges();
    attr.needsUpdate = true;
    fogRows += Math.max(0, a1 - a0 + 1) + Math.max(0, b1 - b0 + 1);
    if (J.lo < 0 && J.hi >= RH) fogJob = null;
  };
  const size = () => {
    if (!el || !el.clientWidth || !el.clientHeight) return;
    cw = el.clientWidth;
    ch = el.clientHeight;
    crect = null;
    look.resize(cw, ch);
    cam.aspect = cw / ch;
    cam.updateProjectionMatrix();
  };
  /** Street level's near blocks (T-364): prepare / show them (the larger budget behind an action / on arrival), hide far story figures. */
  const streamStep = dt => {
    const busy = avatar.busy();
    if (wasBusy && !busy) arriveT = 3;
    wasBusy = busy;
    arriveT = Math.max(0, arriveT - dt);
    const boost = actK ? 'act' : arriveT > 0 && !busy ? 'arrive' : 0,
      r = stream.tick({ cam: [cam.position.x, cam.position.z], you: avatar.pos(), st, low, dt, boost });
    if (!r.busy) arriveT = 0;
    for (const [id, g] of figRoot) {
      const f = figs.get(id);
      g.visible = !r.on || (f && stream.near(...f.pos()));
    }
    if (r.wait !== waitShown && on && on.loading) on.loading(r.wait);
    waitShown = r.wait;
  };
  /** Street level's extras each frame: the detail ring round the camera, the sky and the haze. */
  /** Auto's ladder now (look3d AUTO): on = Auto's detailed look, tight = stepped down, reach = props / grass reach factor. */
  const autoQ = () => {
    const L = look.on && gfx() === 'auto' ? look.parts().dyn : null,
      step = L ? L.A.step : 0;
    return { on: !!L, step, tight: step >= 1, reach: autoAt(step).reach };
  };
  /**
   * The terrain chunks' material (owner 2026-10-26): on Auto a chunk whose box lies beyond TERRAIN_LOD.near[1] m of the camera draws
   * look.terrainFar (the painted grass and smooth normals compiled out — they fade out by then: GROUND_U.uGrD); the chunk nearest
   * the camera always the full one (both programs exist from the start: no compile on the way down). High: all full.
   */
  const terrainLod = () => {
    if (low || !look.on || !mesh) return;
    const auto = gfx() === 'auto',
      N = TERRAIN_LOD.near,
      x = cam.position.x,
      z = cam.position.z;
    if (auto) GROUND_U.uGrD.value.set(N[0], N[1]);
    else GROUND_U.uGrD.value.set(1e5, 2e5);
    let best = null,
      bd = Infinity,
      far = 0;
    for (const c of mesh.children) {
      const B = c.geometry.boundingBox,
        d = B ? Math.hypot(Math.max(B.min.x - x, 0, x - B.max.x), Math.max(B.min.z - z, 0, z - B.max.z)) : 0;
      c.userData.d = d;
      if (d < bd) ((bd = d), (best = c));
    }
    for (const c of mesh.children) {
      const f = auto && c !== best && c.userData.d > N[1];
      c.material = f ? look.terrainFar : look.terrainMat;
      far += f ? 1 : 0;
    }
    terrN = far;
  };
  const streetLook = () => {
    const [ax, az] = avatar.pos(),
      inD = C.inDistrict(ax, az);
    town.ring(cam.position.x, cam.position.z, st, inD);
    war.show(st < 0.5);
    // the sky: the baked one (detailed look), else the clock's sky colour (Fast) — never the map's backdrop
    skyCol.copy(hemi.color).lerp(bgCol, 0.25);
    if (st > 0.15) scene.background = (look.on && look.envTex()) || skyCol;
    // (T-369: the grade's hue by time of day instead of the grey sky tint, at the sky colour's brightness — dusk stays dim)
    const H = look.haze(tod), // (this frame's hour: the painted sky's low band bakes the same haze)
      lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    haze.color.copy(H).multiplyScalar(Math.min(1.25, lum(skyCol) / Math.max(1e-3, lum(H))));
    haze.near = st > 0 ? 160 + (1 - st) * 4000 : 1e6;
    haze.far = st > 0 ? haze.near + 900 + (1 - st) * 6000 : 2e6;
    [haze.near, haze.far] = stream.haze(st, haze.near, haze.far, low); // (streaming: closer, over the far version)
  };
  /** The overlay's numbers (EMA): frame interval, JS ms update / draw submit / labels, the renderer's counts; PerfHUD while it is on. */
  const perfStep = (t, t0, t1, t2, t3) => {
    const P = perf,
      iv = P.last ? Math.min(1000, t - P.last) : 16.7;
    P.last = t;
    P.iv = iv;
    P.ms = EMA(P.ms, iv);
    P.fps = 1000 / P.ms;
    P.update = EMA(P.update, t1 - t0);
    P.draw = EMA(P.draw, t2 - t1);
    P.labels = EMA(P.labels, t3 - t2);
    P.calls = renderer.info.render.calls;
    P.tris = renderer.info.render.triangles;
    for (const k in secR) secE[k] = EMA(secE[k] || 0, secR[k]);
    const H = typeof PerfHUD !== 'undefined' ? PerfHUD : null;
    if (!H || !H.on) return;
    P.raw = { update: t1 - t0, draw: t2 - t1, labels: t3 - t2 };
    P.ev = frameEvents(t1 - t0);
    H.frame('map', api.perf());
  };
  /** The spike log's notes for this frame (perf overlay on): what changed since the last frame — counters the parts already keep. */
  const evLast = {};
  const frameEvents = js => {
    const ev = [],
      E = evLast,
      d = (k, v, f) => {
        if (E[k] !== undefined && v !== E[k]) ev.push(f(v - E[k], E[k], v));
        E[k] = v;
      },
      ri = town && town.ringInfo ? town.ringInfo() : null,
      S = stream && stream.info(),
      Pi = props && props.info(),
      L = look.info();
    d('progs', (renderer.info.programs || []).length, n => `shader compile ${n > 0 ? '+' : ''}${n}`);
    d('tex', renderer.info.memory.textures, n => `textures ${n > 0 ? '+' : ''}${n} (VRM load / dress?)`);
    d('geo', renderer.info.memory.geometries, n => `geometries ${n > 0 ? '+' : ''}${n}`);
    if (ri) d('ring', ri.builds, () => `ring rebuild (${ri.lots} lots, ${(ri.ms || 0).toFixed(1)} ms)`);
    if (S) (d('sprep', S.preps || 0, n => `stream: ${n} block(s) prepared`), d('sshow', S.shows || 0, () => 'stream: near blocks shown'));
    if (Pi) (d('pprep', Pi.preps || 0, n => `props: ${n} block(s) prepared`), d('ppick', Pi.picks || 0, () => 'props re-pick'));
    if (L.sky) d('sky', L.sky.bakes, n => `sky bake ${n} face(s)`);
    d('res', L.res, (n, a, b) => `render scale ${a} → ${b}`);
    d('fx', fxInfo.sweeps, () => 'street finish sweep');
    d('upd', updN, n => `map update ×${n}`);
    d('fog', fogN, () => 'fog re-dim (terrain colours)');
    d('vrm', life ? life.count().vrm || 0 : 0, (n, a, b) => `people VRMs ${a} → ${b}`);
    if (js > 4) {
      const top = Object.entries(secR)
        .filter(([, v]) => v > 1.5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
      if (top.length) ev.push(`slow JS: ${top.map(([k, v]) => `${k} ${v.toFixed(1)} ms`).join(', ')}`);
    }
    return ev;
  };
  /** The JS split of this frame by part (secR, ms) and its average (secE): lap(name) closes the part since the last lap. */
  const secR = {},
    secE = {};
  let lapT = 0;
  const lap = k => {
    const n = performance.now();
    secR[k] = n - lapT;
    lapT = n;
  };
  /**
   * Street level's finish (T-369) before each draw: every shown built-in mesh material gets the toon bands and the occluder fade
   * (look3d streetMat: once, before its first compile); the fade's line runs from the camera to your middle, eased in with st.
   * The sweep (a scene walk) runs when objects may have come — a model update, a ring rebuild, a new top-level part — and every
   * FX_EVERY frames (a material it finds already drawn recompiles once); the uniforms every frame.
   */
  const FX_EVERY = 20;
  const fxMats = o => {
    if (!o.isMesh) return;
    const M = o.material;
    if (Array.isArray(M)) for (const m of M) streetMat(m) && ((m.needsUpdate = true), fxInfo.patched++);
    else if (streetMat(M)) ((M.needsUpdate = true), fxInfo.patched++); // (not yet drawn: harmless; drawn: it recompiles with the patch)
    if (o.isInstancedMesh) fxBox(o);
  };
  /** An instanced mesh's local box into its materials' `fdBox` (the union when a material serves several shapes): look3d's lens hide. */
  const fxBoxed = new WeakMap();
  const fxBox = o => {
    const g = o.geometry;
    if (fxBoxed.get(o) === g) return;
    fxBoxed.set(o, g);
    if (!g.boundingBox) g.computeBoundingBox();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const B = m.userData && m.userData.fdBox;
      if (B) (B.lo.value.min(g.boundingBox.min), B.hi.value.max(g.boundingBox.max));
    }
  };
  const fxInfo = { ms: 0, sweeps: 0, sig: '', n: 0, patched: 0, pre: 0, gate: null };
  /**
   * Precompile (owner 2026-10-26: a shader compile landed mid-walk): the shown scene's programs for the buffer they draw into
   * (look.target: the post's scene target), issued at once (three compile: the driver links them in parallel) — on entering
   * street level and after a sweep patched new materials, not one by one in the draws that first use them.
   */
  const precompile = () => {
    if (!renderer.compile || !look.on) return;
    const rt = look.target(),
      prev = renderer.getRenderTarget();
    try {
      if (rt) renderer.setRenderTarget(rt);
      renderer.compile(scene, cam); // (three defers each program's status check to its first use: the links run in parallel)
      fxInfo.pre++;
    } catch (e) {
      /* (a compile failure shows in the draw as before) */
    } finally {
      renderer.setRenderTarget(prev);
    }
  };
  const fxStep = dt => {
    const t0 = performance.now(),
      R = town.ringInfo ? town.ringInfo().builds : 0,
      sig = `${R}|${scene.children.length}`;
    const p0 = fxInfo.patched;
    if (fxDirty || sig !== fxInfo.sig || ++fxInfo.n >= FX_EVERY) {
      scene.traverseVisible(fxMats);
      fxDirty = false;
      fxInfo.sig = sig;
      fxInfo.n = 0;
      fxInfo.sweeps++;
    }
    if (fxInfo.patched > p0 || (st >= 0.3 && stPre < 0.3)) precompile(); // (new patched materials / entering street level)
    stPre = st;
    const F = STREET_FX,
      [x, y, z] = api.youPos(),
      want = clamp((st - 0.4) / 0.4, 0, 1);
    F.uFdA.value.copy(cam.position);
    F.uFdB.value.set(x, y + STREET.head, z);
    // (the fade's weight: each patched draw gets it only when its bounds come near the camera → you line — look3d FD_GATE)
    FD_GATE.k += (want - FD_GATE.k) * (1 - Math.exp(-dt * 6));
    if (FD_GATE.k < 0.003) FD_GATE.k = 0;
    fxInfo.gate = { ...FD_GATE.n };
    FD_GATE.n.on = FD_GATE.n.off = 0;
    FD_GATE.last = null;
    fxInfo.ms = EMA(fxInfo.ms, performance.now() - t0);
  };
  renderer.info.autoReset = false; // (the post draws several passes: info counts the whole frame)
  const draw = () => (renderer.info.reset(), look.on && !pPlain ? look.render(!pdrv) : renderer.render(scene, cam));
  // ---- the perf probe (owner, 2026-10-26; PerfHUD Measure): its driver runs round the draw (pre → draw → mid → GPU sync → post)
  let pdrv = null,
    pPlain = false, // (the "post chain" item: the scene drawn straight to the canvas)
    pFrozen = null,
    updN = 0,
    fogN = 0;
  const px1 = new Uint8Array(4);
  const probeAfter = (pz, t0, t1) => {
    pz.mid();
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); // (waits for the GPU: the draw's real cost)
    pz.post({ draw: performance.now() - t1, js: t1 - t0, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
  };
  /** Swap a value for one draw: set(v) now, the old value back on undo (skipped — null — when it is already off). */
  const swap = (o, k, v) => {
    if (!o || o[k] === v) return null;
    const a = o[k];
    o[k] = v;
    return () => (o[k] = a);
  };
  const probeItems = () => {
    const P = look.parts ? look.parts() : {},
      on = look.on,
      sh = renderer.shadowMap,
      L = (id, label, extra) => layerItem(scene, id, label, extra);
    return [
      L('terrain', 'terrain + sea'),
      L('town', 'town + detail ring'),
      L('interiors', 'interiors'),
      L('nature', 'nature + grass clumps'),
      L('props', 'street life (props)'),
      L('people', 'people + VRMs + you'),
      L('vehicles', 'vehicles'),
      L('night', 'night lights + pools'),
      L('war', 'war borders'),
      {
        ...L('pins', 'pins + tags'),
        can: () => !!furn || 'none',
        hold: () => furn && swap(furn.layer.style, 'visibility', 'hidden') // (the DOM tags: off for the configuration)
      },
      {
        id: 'sky',
        label: 'sky bake + painted sky',
        group: 'layer',
        can: () => on || 'Fast: no baked sky',
        hold() {
          const a = LOOK.sky.every,
            b = PSKY.every;
          LOOK.sky.every = PSKY.every = Infinity;
          return () => ((LOOK.sky.every = a), (PSKY.every = b));
        },
        mask: () => (scene.background && scene.background.isTexture ? swap(scene, 'background', skyCol) : null)
      },
      {
        id: 'shadow',
        label: 'shadows (the shadow pass)',
        group: 'look',
        can: () => (sh.enabled && sun.castShadow) || 'off',
        mask: () => swap(sh, 'autoUpdate', false)
      },
      {
        id: 'shmap',
        label: `shadow map ${sun.shadow.mapSize.x} → ${Math.max(512, sun.shadow.mapSize.x / 2)}`,
        group: 'look',
        can: () => (sh.enabled && sun.shadow.mapSize.x > 512) || 'off',
        hold() {
          const S = LOOK.shadow,
            a = [S.map, S.mapHi],
            s0 = sun.shadow.mapSize.x,
            s1 = Math.max(512, s0 / 2),
            set = s => (sun.shadow.mapSize.set(s, s), sun.shadow.map && (sun.shadow.map.dispose(), (sun.shadow.map = null)));
          S.map = S.mapHi = s1;
          set(s1);
          return () => (([S.map, S.mapHi] = a), set(s0));
        }
      },
      {
        id: 'ao',
        label: 'AO (GTAO)',
        group: 'look',
        can: () => (on && P.gtao && P.gtao.enabled) || 'High only',
        mask: () => swap(look.parts().gtao, 'enabled', false)
      },
      {
        id: 'bloom',
        label: 'bloom',
        group: 'look',
        can: () => (on && P.bloom && P.bloom.enabled) || 'off now',
        mask: () => swap(P.bloom, 'enabled', false)
      },
      {
        id: 'fxaa',
        label: 'FXAA (edge smoothing)',
        group: 'look',
        can: () => (on && P.fxaa && P.fxaa.enabled) || 'street level only',
        mask: () => swap(P.fxaa, 'enabled', false)
      },
      {
        id: 'grade',
        label: 'colour grade',
        group: 'look',
        can: () => (on && P.grade && P.grade.enabled) || 'street level only',
        mask: () => swap(P.grade, 'enabled', false)
      },
      {
        id: 'post',
        label: 'post chain (straight to canvas)',
        group: 'look',
        can: () => on || 'Fast: no post',
        mask: () =>
          swap(
            {
              get v() {
                return pPlain;
              },
              set v(x) {
                pPlain = x;
              }
            },
            'v',
            true
          )
      },
      {
        id: 'toon',
        label: 'toon bands',
        group: 'look',
        can: () => STREET_FX.uFdToon.value > 0.001 || 'street level only',
        mask: () => swap(STREET_FX.uFdToon, 'value', 0)
      },
      {
        id: 'fade',
        label: 'occluder fade',
        group: 'look',
        can: () => FD_GATE.k > 0 || 'street level only',
        mask: () => swap(FD_GATE, 'k', 0)
      },
      {
        id: 'res1',
        label: `render scale held at 1 (dyn ${P.dyn ? P.dyn.res : '–'})`,
        group: 'look',
        can: () => (P.dyn && P.dyn.res !== 1) || 'already 1',
        hold() {
          const d = look.parts().dyn,
            a = d.res;
          d.res = 1;
          look.resize(cw, ch);
          return () => ((d.res = a), look.resize(cw, ch));
        }
      }
    ];
  };
  const probeApi = {
    kind: 'map',
    gl: () => renderer.getContext(),
    items: probeItems,
    /** The probe runs: the shown clock, the camera and the dynamic resolution hold (all as they were on stop). */
    start(drv) {
      const d = look.parts ? look.parts().dyn : null;
      pFrozen = d && { ...d };
      if (d) d.t = -1e12; // (adapt never reaches its second)
      pdrv = drv;
    },
    stop() {
      pdrv = null;
      pPlain = false;
      const d = look.parts ? look.parts().dyn : null;
      if (d && pFrozen) {
        const r = d.res;
        Object.assign(d, pFrozen, { last: 0 });
        if (d.res !== r) look.resize(cw, ch);
      }
      pFrozen = null;
    },
    /** What the probe may touch, as it is now (compared before / after: everything restored). */
    state() {
      const P = look.parts ? look.parts() : {},
        o = {
          drv: !!pdrv,
          plain: pPlain,
          shadowAuto: renderer.shadowMap.autoUpdate,
          shadowMap: sun.shadow.mapSize.x,
          lookShadow: `${LOOK.shadow.map}/${LOOK.shadow.mapHi}`,
          skyEvery: `${LOOK.sky.every}/${PSKY.every}`,
          res: P.dyn ? P.dyn.res : null,
          pins: furn ? furn.layer.style.visibility : '',
          clockHeld: held
        };
      for (const [k, p] of Object.entries(P)) if (p && 'enabled' in p) o[k] = p.enabled;
      for (const c of scene.children)
        if (c.userData.probe && c.userData.probe !== 'lights') o[`${c.userData.probe}:${c.uuid.slice(0, 6)}`] = c.visible;
      return o;
    },
    ctx() {
      const L = look.info(),
        I = interiors && interiors.info();
      return {
        css: [cw, ch],
        px: [canvas.width, canvas.height],
        scale: L.scale,
        res: L.res,
        look: { fast: 'Fast', detailed: 'Auto', high: 'High' }[L.look] || L.look,
        auto: L.auto ? L.auto.label : '',
        view: `${I && I.active && I.active.length && st > 0.5 ? 'inside' : st > 0.5 ? 'street' : 'map'} (street ${st.toFixed(2)}, d ${C.view ? Math.round(C.view.d) : '–'} m)`,
        place: I && I.active && I.active.length && st > 0.5 ? I.active.join(', ') : '',
        time: `${String(Math.floor(tod * 24)).padStart(2, '0')}:${String(Math.floor((tod * 1440) % 60)).padStart(2, '0')}`,
        extra: `you ${api
          .youPos()
          .map(v => Math.round(v))
          .join(', ')} m`
      };
    }
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
      const t0 = performance.now(),
        pz = pdrv; // (the perf probe measures: the clock and the camera hold)
      lapT = t0;
      st = C.street();
      frustum.setFromProjectionMatrix(projM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); // (last frame's camera)
      lodView.px = (ch || 1) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      avatar.setLife(st);
      const AQ = autoQ();
      VRM_Q.auto = AQ.on; // (Auto at street level: fewer VRMs, outlines near only — people3d VRM_Q)
      VRM_Q.tight = AQ.tight;
      lodView.outline = true;
      avatar.tick(dt * walkK, terrain.heightAt, lodView); // your walk at the chosen speed (setWalk; the others keep theirs)
      lodView.outline = !(AQ.on && AQ.tight && st > 0.5); // (tight: the story figures without outlines; you keep yours)
      for (const f of figs.values()) (f.setLife(st), f.tick(dt, terrain.heightAt, lodView)); // (the guide, the rival, the aces: life size too)
      lap('avatars');
      if (!pz) clock += dt;
      if (!pz) clockStep(dt);
      scene.background = bgCol; // (skyAt mixes into the colour)
      lit = cur && cur.time ? skyAt(cur.time.keys, tod, sun, hemi, scene) : ((hemi.intensity = 0.9), 0);
      if (look.on) hemi.intensity *= lerp(LOOK.hemi[0], lerp(LOOK.hemi[1], GLOW.hemi, STREET_U.st.value), lit); // (by day the sky's environment light adds the rest; street level's night darker)
      if (C.view) life.ringScale((14 * 2 * C.view.d * Math.tan((cam.fov * Math.PI) / 360)) / (ch || 1) / 0.7); // a ring ≥ ~14 px
      const gclock = wt === null ? clock : wt * 24 * ((cur && cur.time && cur.time.scale) || 90); // (the shown clock in ×1 seconds)
      lap('sky');
      life.tick(dt, gclock, tod, cam, st);
      lap('life');
      veh.tick(dt, gclock, wt, avatar.ride()); // (cam: the nearest named people on screen as VRMs; st: life size and the near VRMs at street level)
      lap('vehicles');
      hoverStep();
      lap('hover');
      town.tick(dt);
      nature.tick(dt, clock);
      furn.pulse(clock);
      war.pulse(clock);
      lap('town+nature');
      if (!pz) C.step(dt);
      st = C.street();
      lap('camera');
      streamStep(dt);
      lap('stream');
      nature.near(avatar.pos(), st, AQ.reach); // (T-370: street level's grass round you; Auto's last step: nearer)
      lap('grass');
      props.tick(dt, clock, avatar.pos(), st, low, AQ.reach); // (T-372: street life near you)
      lap('props');
      if (cur && st < STREAM.show && fogDrawn !== cur.fog) fogSync(cur); // (up from street level: the lantern catches up)
      lap('fog');
      streetLook();
      terrainLod();
      fogStep();
      lap('ring+haze');
      interStep(dt);
      lap('interiors');
      if (cur && cur.time) sun.position.copy(sun.target.position).addScaledVector(SKY.dir, 150); // the hour's sun (after the camera placed it)
      night.set(lit, (ch * renderer.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360)), renderer.getPixelRatio());
      lap('night');
      look.step(dt, clock, lit, tod, C.view, gfx(), st);
      lap('look');
      fxStep(dt);
      lap('street fx');
      const n = avatar.lapse(),
        txt = n ? `×${n < 2 ? n.toFixed(1) : Math.round(n)}` : '';
      if (badge && badge.textContent !== txt) {
        badge.textContent = txt;
        badge.hidden = !txt;
      }
      const t1 = performance.now();
      if (pz) pz.pre();
      try {
        draw();
      } finally {
        if (pz) probeAfter(pz, t0, t1);
      }
      const t2 = performance.now();
      furn.tick(cam, cw, ch, C.view.d);
      perfStep(t, t0, t1, t2, performance.now());
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
      waitShown = false; // (a "Loading…" of the old wrap is gone with it)
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
      fxDirty = true;
      updN++;
      const fall = m.borders && m.borders.fall ? m.borders.fall.key : null;
      if (fallSeen !== undefined && fall && fall !== fallSeen)
        (m.pins || []).some(p => p.id === m.borders.fall.pin) ? C.flyTo(m.borders.fall.pin) : C.overview(); // a unit destroyed: the camera goes to see (spec §4.34)
      fallSeen = fall;
      if (m.sel && m.sel !== lastSel) C.flyTo(m.sel); // selected from outside the map (list, chip, banner)
      lastSel = m.sel;
      const fm = fogM(m); // (street level: the fog's lantern lags a short walk)
      town.sync(fm);
      nature.sync(fm, low);
      props.sync(fm);
      if (interiors) interiors.sync(m); // (before life: lifeM reads where the stations are)
      furn.sync(m, on);
      town.rims(m.rims);
      life.sync(lifeM(m), low);
      veh.sync(m);
      night.sync(fm, low);
      war.sync(m.borders);
      applyFog(fm.fog);
      const want = new Map((m.figures || []).map(f => [f.id, f]));
      for (const [id, a] of figs) if (!want.has(id)) (a.dispose(), figs.delete(id), scene.remove(figRoot.get(id)), figRoot.delete(id));
      for (const [id, f] of want) {
        if (!figs.has(id)) {
          const g = new THREE.Group(); // (its own group: streaming hides it far off)
          g.userData.probe = 'people';
          scene.add(g);
          figRoot.set(id, g);
          figs.set(id, createAvatar(g, { kit: f.kit }));
        }
        figs.get(id).snap(f.at);
        figs.get(id).face(f.face);
      }
      const at = m.you && m.you.at;
      if (!at || !avatar) return;
      avatar.deck(m.land && m.land.roads); // (the overpass: a walk along it climbs the deck)
      const key = at.join(','),
        tail = m.you.inside || [], // arriving inside (spec §4.40): on from the door to where you stand in the place
        head = m.you.exit || []; // …and out of the one you leave
      if (m.time && m.time.walk[0] !== lastWalk) ((walkPts = null), (prog = 1)); // a new action (no walk unless one starts below)
      lastWalk = m.time ? m.time.walk[0] : null;
      const [ax, az] = avatar.pos(),
        here =
          st > 0.5 && // (street level, where WASD walks; the map view walks as before)
          !avatar.busy() &&
          !tail.length &&
          !head.length &&
          !(m.you.ride && m.you.ride.legs) &&
          Math.hypot(at[0] * MAP_M - ax, at[1] * MAP_M - az) < STAY_M;
      if (seen === null) avatar.snap(standAt(m));
      else if (key !== seen && here)
        seen = key; // (a WASD stop: the rules' point is where you stand, rounded — you stay put)
      else if (key !== seen) {
        const [x0, z0] = avatar.pos();
        const T = m.time,
          dur = T && T.scale ? (T.walk[1] - T.walk[0]) * 24 * T.scale : 0; // (spec §4.43: the walk's hours in real time)
        avatar.setTarget(at, m.you.route, { head, tail, legs: m.you.ride && m.you.ride.legs, dur, scale: T && T.scale }); // (a ride: its legs, spec §4.42)
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
    /** The time speed on the map (spec §4.43): ×k (1, 2, 4); 0 = paused (your walk and WASD stop). */
    setWalk(k) {
      walkK = k >= 0 ? k : 1;
    },
    /** WASD is moving you (or did within the stop's wait): the UI's clock lets the rules wait (spec §4.43). */
    driving: () => !!(avatar && avatar.driving && avatar.driving(STOP_WAIT)),
    /** An automated action passes time (a fast-forward, on = true; false: over): street level prepares the blocks round you meanwhile. */
    prepare(on) {
      actK = !!on;
    },
    /** While a session / a sleep fast-forwards (spec §4.43): your figure drills ('drill') or sleeps ('sleep'); null = stands. */
    act(k) {
      if (avatar) avatar.act(k);
    },
    /** The running clock (spec §4.43): fn() → the week time now (MapView.now), or null: the model's. */
    setNow(fn) {
      nowFn = typeof fn === 'function' ? fn : null;
    },
    /** Which part of the day is playing: 'idle' | 'walk' | 'order', or a function the map asks each frame (MapView.phase). */
    setPhase(p) {
      phase = p || 'idle';
    },
    /** The Fast graphics setting: fewer named figures (life.look.low) and night lights, the town's instanced boxes, no posts. */
    setLow(v) {
      fxDirty = true;
      if (low === !!v) return;
      low = !!v;
      const fm = cur && fogM(cur);
      if (cur && life) (town.sync(fm), life.sync(lifeM(cur), low), night.sync(fm, low));
      if (mesh && cur)
        (look.set(!low, water), mesh.children.forEach(c => (c.material = low ? flatMat : look.terrainMat)), nature.sync(fm, low)); // the look (T-343)
    },
    /** Dev / QA (T-372): the drawn street prop of `kind` nearest you → [x, y, z, yaw] (world) | null. */
    propNear: kind => (props && avatar ? props.find(kind, ...avatar.pos()) : null),
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
      return [x, (terrain ? terrain.heightAt(x, z) : 0) + avatar.lift(), z];
    },
    /** QA: the interiors' state ({ shown, places, cut, alpha, street, stations }), or null until the module has loaded. */
    interiors: () => interiors && { ...interiors.info(), street: +st.toFixed(3), stations: interiors.stations() },
    /** Dev / QA: tune the streaming (STREAM: r, pre, per, budget …; stream3d.mjs). */
    tuneStream: o => Object.assign(STREAM, o),
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
    /** Take you back to the shown position (a WASD walk the rules refused) — along `route` (map points: MapView's road back) when given. */
    home(route) {
      if (avatar && cur && cur.you && cur.you.at) avatar.setTarget(cur.you.at, route || null, { tail: cur.you.inside || [] });
    },
    /** The frame's numbers for the perf overlay (PerfHUD): fps, ms, JS ms (update, draw submit, labels), calls, tris, render scale, VRMs, blocks. */
    perf() {
      const P = perf,
        vr = life ? life.count().vrm || 0 : 0;
      let figN = avatar && avatar.drawn() ? 1 : 0;
      for (const f of figs.values()) figN += f.drawn() ? 1 : 0;
      const L = look.info(),
        S = stream && stream.info();
      return {
        fps: P.fps,
        ms: P.ms,
        last: P.iv,
        update: P.update,
        draw: P.draw,
        labels: P.labels,
        calls: P.calls,
        tris: P.tris,
        res: L.res,
        scale: L.scale,
        px: [canvas.width, canvas.height],
        vrm: vr + figN,
        blocks: S && S.on ? S.near : null,
        look: { fast: 'Fast', detailed: 'Auto', high: 'High' }[L.look] || L.look,
        ao: L.ao,
        shadow: sun.shadow.mapSize.x,
        auto: L.auto ? `${L.auto.label}${L.auto.gpu !== null ? ` · GPU ${L.auto.gpu.toFixed(1)} ms` : ''}` : null, // (look3d AUTO)
        raw: P.raw,
        secs: { ...secE, draw: P.draw, tags: P.labels },
        ev: P.ev,
        src: probeApi
      };
    },
    info: () => ({
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      geos: renderer.info.memory.geometries,
      tex: renderer.info.memory.textures,
      progs: (renderer.info.programs || []).length, // (a change = shaders compiled: a hitch)
      life: life && life.count(),
      vehicles: veh && veh.count(),
      night: night && night.count(),
      town: town && town.count(), // (null on Fast)
      clock: { week: wt, tod, lit },
      nature: nature && nature.count(),
      ...look.info(),
      view: C.view && { ...C.view },
      street: +st.toFixed(3),
      ring: town && town.ringInfo ? town.ringInfo() : null,
      stream: stream && stream.info(),
      meadow: nature && nature.meadowInfo(),
      props: props && props.info(),
      aspect: {
        canvas: +(cw / (ch || 1)).toFixed(3),
        cam: +cam.aspect.toFixed(3),
        proj: +(cam.projectionMatrix.elements[5] / cam.projectionMatrix.elements[0]).toFixed(3)
      }, // (= canvas: no stretch)
      fx: { ms: +fxInfo.ms.toFixed(3), sweeps: fxInfo.sweeps, pre: fxInfo.pre }, // (T-369: the street finish — JS ms a frame, scene sweeps so far, precompiles)
      fd: fxInfo.gate, // (the occluder fade's gate, last frame: draws with it on / off — look3d FD_GATE)
      terrain: { far: terrN, chunks: mesh ? mesh.children.length : 0, fogRows, fogBusy: !!fogJob } // (terrainLod; fogStep)
    }),
    /** The perf probe (PerfHUD Measure): items(), start(drv), stop(), ctx(). */
    probe: probeApi,
    dispose() {
      dead = true;
      if (pdrv) pdrv.abort('the map closed');
      if (avatar) avatar.dispose();
      for (const a of figs.values()) a.dispose();
      figs.clear();
      figRoot.clear();
      if (furn) furn.dispose();
      if (town) town.dispose();
      if (life) life.dispose();
      if (veh) veh.dispose();
      if (nature) nature.dispose();
      if (props) props.dispose();
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
