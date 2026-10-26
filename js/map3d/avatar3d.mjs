// The player on the 3D map: your own model (Main_v2, as in matches and your portrait; the default model if it fails), idle-breathing, walking or running to wherever the rules put
// the player. Display only — the rules move instantly; this animates from the previously shown position.
//   createAvatar(scene, opts?) → { setTarget([x, y], path?, { head?, tail?, legs?, dur?, scale? }), snap([x, y]), face([x, y]), tick(dt, heightAt, view?), busy(), pos(), lapse(),
//                                  heading(), drive(x, z, v, yaw), setLife(k), progress(), ride(), act(k), deck(roads), lift(), dispose() }
// deck(model.land.roads): a walk / ride along the overpass climbs its deck as town3d draws it (lift() = the metres over the ground).
// act('drill' | 'sleep' | null): while a session or a sleep fast-forwards (spec §4.43) you hop block jumps / lie down where you stand.
// A ride (spec §4.42): o.legs = the trip's legs ([{ m: 'walk' | 'bus' | 'bike' | 'scooter' | 'ferry' | 'taxi', pts, w, a, b }], map
// points, week time — model.you.ride) replaces the road: the trip plays on the legs' own clock (RIDE_T s in all; a wait = standing at the stop), you
// ride the bike / scooter (RIDE pose, on its seat), stand on the ferry's deck, and are aboard the bus / taxi (hidden: vehicles3d draws
// it). progress() = 0–1 of the trip in its own time (the map's clock follows it); ride() = { m, x, z, yaw, v } while riding, else null.
// Street level (spec §4.37 6, T-336a): setLife(k) scales the figure from map size (HEIGHT, k = 0) to life size (LIFE_H, k = 1) — map3d
// passes the camera's street weight; drive(x, z, v, yaw) = one WASD frame (display only: stand at world (x, z), moving at v m/s, facing yaw).
//   opts.kit (shirt / hair / skin colours): another person on the default model, dressed (the story guide, spec §10.10a); none = you.
// Map points are map units (see toWorld in geo3d.mjs). Until the model has loaded a capsule marks the spot.
// WALK (spec §4.37 3–4, T-333 / T-335): the UI's hold on your walk (js/ui/career-map.js imports this same module): `stop` — the
// map point the next walk halts at (an encounter; `held` until go()), `via` — the road it follows instead ({ to, pts }: the short
// cut you picked), `routes` — a preview of the safe road and the short cut ([{ pts, on, alt }], drawn as ribbons), `onStep` — a
// footstep (the island sound). Only your own avatar reads it.
// The running clock (spec §4.43): setTarget's o.dur (s at ×1) times the walk in real time — its hours × the clock's scale, the
// map ticks it × the time speed — and o.scale (s a game hour) a ride's legs (a wait at the stop lasts as long as the bus takes to
// come); without them a trip keeps the old display timing (SPEED within TIME / RIDE_T).
// Performance (owner, 2026-10-25): tick's view = { frustum, cam, px (screen px a metre at 1 m: ch ÷ 2 tan(fov / 2)), shadows } — off
// screen the model is hidden and not posed; small on screen (AV_LOD) it is posed every few frames, without hair springs or a shadow.
import * as THREE from 'three';
import {
  loadBase,
  makeVRM,
  applyPose,
  smoothBones,
  groundSnap,
  dress,
  wholeVRM,
  releaseVRM,
  warmVRM,
  MODEL_URL,
  MAIN_URL
} from '../render3d/players3d.mjs';
import { LOOK_CTX } from './look3d.mjs';
import { smoothDt } from './mapcam3d.mjs';
import { STAND, READY, locoPose, mix } from '../render3d/poses3d.mjs';
import { BLOCK, SIT, shadowPart, setOutline } from './people3d.mjs';
import { toWorld, clamp, wrap, smooth } from './geo3d.mjs';
import { DECK } from './town3d.mjs';

const HEIGHT = 6, // metres: drawn about 3.5× life size so you can find yourself on the island (owner, 2026-10-03)
  SPEED = 6, // m/s: the pace a trip is timed at (longer trips run faster, shown as a time-lapse)
  TIME = [1.2, 6], // trip duration limits (s)
  RAMP = 0.4, // ease-in / ease-out (s)
  TURN = 0.25, // wait for the turn before setting off (s)
  RUN_AT = 2.5, // m/s: above this the gait blends into a run
  LIFE_H = 1.72, // metres: life size at street level (setLife(1))
  LIFE_PACE = 0.6, // at street level a trip's pace × this (a life-size runner, not a 6 m/s giant)
  RIDE_T = [2.5, 9], // a ride's duration limits (s): the whole trip, waits included
  RIDE_V = 22, // m/s: the pace a ride is timed at (its distance ÷ this, within RIDE_T)
  DECK_Y = 1.7, // m: the ferry's deck over the sea (vehicles3d's FERRY)
  SEAT = 0.95; // m (× the figure's size ÷ HEIGHT · 6): the bike / scooter's seat lift over the ground snap
/** On the bike / scooter (spec §4.42): sat up, thighs forward, knees bent over the pedals, hands on the bars. */
const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const RIDE = {
  hp: 0.25,
  sp: 0.12,
  cp: 0.08,
  hd: -0.05,
  L: { a: 1.1, k: 1.25, f: 0.2, s: 0.12 },
  R: { a: 1.1, k: 1.25, f: 0.2, s: 0.12 },
  al: [v3(0.2, -0.45, 0.87), v3(0.15, -0.35, 0.92), v3(0.12, -0.3, 0.94)],
  ar: [v3(-0.2, -0.45, 0.87), v3(-0.15, -0.35, 0.92), v3(-0.12, -0.3, 0.94)],
  curl: 0.6
};

/** The model's level of detail by its height on screen (px): pose every `every` frames under px, springs / a shadow from px up. */
export const AV_LOD = {
  every: [
    [24, 4],
    [60, 2]
  ],
  springs: 110,
  shadow: 20
};
const SPH = new THREE.Sphere();
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
/**
 * The overpass as town3d draws it (2026-10-26): its road edges (model.land.roads, kind 'overpass') chained as town3d's buildOverpass
 * chains them, in world metres, with the distance along each chain — so a walk along it climbs the same deck (DECK ramp).
 */
export function deckChains(roads) {
  const chains = [],
    near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
  for (const r of roads || []) {
    if (r.kind !== 'overpass') continue;
    const [a, b] = [r.pts[0], r.pts[r.pts.length - 1]].map(toWorld),
      last = chains.length && chains[chains.length - 1];
    if (last && near(last[last.length - 1], a)) last.push(b);
    else if (last && near(last[last.length - 1], b)) last.push(a);
    else chains.push([a, b]);
  }
  return chains.map(p => {
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    return { p, cum, L: cum[cum.length - 1] };
  });
}
/** The deck's lift (m over the ground) at world (x, z) while walking segment a → b: 0 unless a → b is one of the chains' spans. */
export function deckLift(chains, a, b, x, z) {
  if (!a || !b) return 0;
  const near = (p, q) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5;
  for (const C of chains)
    for (let i = 1; i < C.p.length; i++) {
      const P = C.p[i - 1],
        Q = C.p[i];
      if (!((near(a, P) && near(b, Q)) || (near(a, Q) && near(b, P)))) continue;
      const s = C.cum[i - 1] + Math.hypot(x - P[0], z - P[1]),
        up = DECK.up * smooth(0, DECK.ramp, s) * smooth(0, DECK.ramp, C.L - s);
      return up + Math.min(0.25, up); // (town3d: the deck's top 0.25 m over the ground + the ramp)
    }
  return 0;
}
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
    pend = null, // (T-368) loaded and dressed, waiting to be whole: the capsule stands in until then
    dead = false,
    rmesh = null, // the route preview (yours only)
    rkey = null,
    decks = [], // the overpass chains (deck(roads)): a walk along them climbs the deck
    deckKey = null,
    lift = 0; // this frame's deck lift (m)
  const me = !opts.kit, // your own avatar: WALK applies
    S = {
      x: 0,
      z: 0,
      yaw: 0,
      walk: null,
      phase: 0,
      w: 0,
      t: 0,
      next: null,
      held: false,
      stepAt: 0,
      life: 0,
      drive: null,
      ride: null,
      pace: 0,
      scale: 0,
      act: null,
      drv: 1e9,
      acc: 0, // (LOD) seconds since the last pose
      fr: 0, // frames since the last pose
      dy: 0, // the last ground snap's lift (between poses)
      sh: true, // the model casts a shadow
      shown: true // on screen (the last LOD test)
    };
  /** The trip's real-time pace (m/s at ×1) from its length and o.dur (spec §4.43), else 0 (the display timing). */
  const paceOf = (pts, dur) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return dur > 0 && L > 0.5 ? L / dur : 0;
  };
  /**
   * Ride the legs (world-space: each { m, pts, cum, dist, w, a, b }): the trip's week time T0 … T1 plays over `dur` s; `hold` = the
   * week time an encounter halts it at (a bike / scooter trip: WALK.stop), else null.
   */
  const rideStart = (legs, stop) => {
    const T0 = legs[0].w,
      T1 = legs[legs.length - 1].b,
      dist = legs.reduce((s, l) => s + l.dist, 0);
    if (!(T1 > T0) || dist < 0.5) return false;
    let hold = null;
    if (stop) {
      let best = Infinity;
      for (const l of legs)
        for (let i = 1; i < l.pts.length; i++) {
          const [ax, az] = l.pts[i - 1],
            [bx, bz] = l.pts[i],
            dx = bx - ax,
            dz = bz - az,
            L2 = dx * dx + dz * dz || 1,
            u = clamp(((stop[0] - ax) * dx + (stop[1] - az) * dz) / L2, 0, 1),
            d = Math.hypot(stop[0] - ax - dx * u, stop[1] - az - dz * u);
          if (d < best) ((best = d), (hold = l.a + ((l.cum[i - 1] + u * Math.sqrt(L2)) / (l.dist || 1)) * (l.b - l.a)));
        }
    }
    S.walk = S.next = null;
    const dur = S.scale > 0 ? (T1 - T0) * 24 * S.scale : clamp(dist / RIDE_V, RIDE_T[0], RIDE_T[1]); // (spec §4.43: real time)
    S.ride = { legs, T0, T1, dur, t: -TURN, hold, m: legs[0].m, v: 0 };
    return true;
  };
  /** Start walking world-space pts (from where you stand) on the trapezoid speed profile. */
  const plan = pts => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const dist = cum[cum.length - 1];
    if (dist < 0.5) return false;
    const dur = S.pace > 0 ? Math.max(0.2, dist / S.pace) : clamp(dist / (SPEED * (1 - (1 - LIFE_PACE) * S.life)), TIME[0], TIME[1]),
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
      if (S.ride) return void (S.ride.hold = null); // (a ride halted at a stop: on it goes)
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
      if (dead) return releaseVRM(p.vrm);
      if (opts.kit) dress(p.vrm, opts.kit);
      p.base = p.scale;
      // (pacing 2026-10-27: textures uploaded and programs compiled before the model replaces the capsule)
      return warmVRM(p.root, LOOK_CTX).then(() => {
        if (dead) return releaseVRM(p.vrm);
        pend = p;
        adopt();
      });
    })
    .catch(e => console.warn('3D map: the player model failed to load — keeping the marker.', e && e.message ? e.message : e));

  /** The ready rule (T-368, spec §4.44): the model replaces the capsule only when loaded, dressed and whole. */
  function adopt() {
    if (!pend || dead || !wholeVRM(pend.vrm)) return;
    pl = pend;
    pend = null;
    scene.remove(marker);
    marker.geometry.dispose();
    marker.material.dispose();
    scene.add(pl.root);
  }

  return {
    /** Stand at a map point at once. */
    snap(at) {
      [S.x, S.z] = toWorld(at);
      S.walk = S.next = S.ride = null;
      S.drive = null;
      if (S.held) S.held = WALK.held = false;
    },
    /**
     * Walk (or run) to a map point from where the avatar stands now; `path` (map points, optional) is the road to follow. Yours:
     * WALK.via (to the same point) replaces the road, WALK.stop halts the walk there until WALK.go(). o.head / o.tail (map points):
     * walked before the road (out of a door) / after `at` (in through a door, to where you stand inside — spec §4.40).
     */
    setTarget(at, path, o = {}) {
      S.ride = null;
      S.scale = o.scale > 0 && o.dur > 0 ? o.scale : 0;
      if (o.legs && o.legs.length) {
        const stop = me ? WALK.stop : null;
        if (me) WALK.via = WALK.stop = null;
        if (S.held) S.held = WALK.held = false;
        const L = o.legs.map((l, i) => {
          const pts = l.pts.map(toWorld);
          if (!i) pts.unshift([S.x, S.z], ...(o.head || []).map(toWorld)); // from where you stand, out of the door first
          if (i === o.legs.length - 1) pts.push(...(o.tail || []).map(toWorld)); // …and in through the door at the end
          const cum = [0];
          for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
          return { m: l.m, pts, cum, dist: cum[cum.length - 1], w: l.w, a: l.a, b: l.b };
        });
        if (rideStart(L, stop && toWorld(stop))) return;
      }
      const V = me && WALK.via && Math.hypot(WALK.via.to[0] - at[0], WALK.via.to[1] - at[1]) < 2 ? WALK.via.pts : path,
        stop = me ? WALK.stop : null;
      if (me) WALK.via = WALK.stop = null;
      let pts = [[S.x, S.z]];
      for (const p of o.head || []) pts.push(toWorld(p));
      // the road from its first point (where the rules have you): kept when you stand elsewhere — out of a door, a walk cut short —
      // so the way onto the road is the short leg to it, not a straight line to its second point across the lots (2026-10-26)
      if (V && V.length > 1) {
        const s0 = pts[pts.length - 1],
          v0 = toWorld(V[0]);
        for (const p of Math.hypot(s0[0] - v0[0], s0[1] - v0[1]) > 0.5 ? V.slice(0, -1) : V.slice(1, -1)) pts.push(toWorld(p));
      }
      pts.push(toWorld(at));
      for (const p of o.tail || []) pts.push(toWorld(p));
      const end = o.tail && o.tail.length ? o.tail[o.tail.length - 1] : at;
      S.pace = paceOf(pts, o.dur);
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
    busy: () => !!S.walk || !!S.ride || S.held,
    /** How far through the trip (0–1) a ride has come in its own time; null when not riding. */
    progress: () => (S.ride ? clamp(S.ride.t / S.ride.dur, 0, 1) : null),
    /** While on a ride's vehicle leg: { m, x, z, yaw, v (m/s) } (vehicles3d draws your bus / ferry / taxi / bike / scooter), else null. */
    ride: () =>
      S.ride && S.ride.m !== 'walk' && S.ride.m !== 'wait' && S.ride.t >= 0
        ? { m: S.ride.m, x: S.x, z: S.z, yaw: S.yaw, v: S.ride.v }
        : null,
    pos: () => [S.x, S.z],
    /** The overpass to climb (model.land.roads; rebuilt when its overpass edges change). */
    deck(roads) {
      const R = (roads || []).filter(r => r.kind === 'overpass'),
        k = JSON.stringify(R.map(r => r.pts));
      if (k !== deckKey) ((deckKey = k), (decks = deckChains(R)));
    },
    /** How far over the ground the overpass deck holds you this frame (m; 0 off it). */
    lift: () => lift,
    /** The way you face (rad, atan2(dx, dz)). */
    heading: () => S.yaw,
    /** One WASD frame (display only): stand at world (x, z), moving at v m/s, turning toward yaw. */
    drive(x, z, v, yaw) {
      if (S.walk || S.ride || S.held) return;
      S.x = x;
      S.z = z;
      S.drive = { v, yaw };
      S.drv = 0;
    },
    /** WASD moved you within the last `s` seconds of its clock (spec §4.43: the rules wait for the stop). */
    driving: (s = 1) => S.drv < s,
    /** What you do standing still while the clock fast-forwards: 'drill' | 'sleep' | null (spec §4.43). */
    act(k) {
      S.act = k === 'drill' || k === 'sleep' ? k : null;
    },
    /** 0 = map size (HEIGHT), 1 = life size (LIFE_H): the camera's street weight. */
    setLife(k) {
      S.life = clamp(k, 0, 1);
    },
    /** Time-lapse factor of the current trip (ground speed ÷ SPEED), 0 when it is not faster than SPEED. */
    lapse: () => (S.walk && !S.pace && S.walk.dist / S.walk.dur > SPEED * 1.02 ? S.walk.dist / S.walk.dur / SPEED : 0),
    /** Drawn and posed this frame (the last tick's LOD): the perf overlay's VRM count. */
    drawn: () => !!pl && pl.root.visible,
    tick(dt, heightAt, view = null) {
      // (at street level: one long frame's time spread over the next few — no jerk; the map keeps the raw time)
      if (view && S.life > 0) dt = smoothDt(S.dts || (S.dts = {}), dt);
      else if (S.dts) S.dts.debt = 0;
      const W = S.walk;
      if (!S.drive) S.drv += dt;
      lift = 0; // (set below while a walk / ride runs along the overpass)
      let v = 0;
      if (S.drive) {
        v = S.drive.v;
        S.yaw += wrap(S.drive.yaw - S.yaw) * (1 - Math.exp(-dt / 0.08));
        S.drive = null;
      }
      const Rd = S.ride;
      if (Rd && !S.held) {
        Rd.t += dt;
        const tau = Rd.T0 + (Rd.T1 - Rd.T0) * clamp(Rd.t / Rd.dur, 0, 1);
        if (Rd.hold !== null && tau >= Rd.hold) {
          Rd.t = ((Rd.hold - Rd.T0) / (Rd.T1 - Rd.T0)) * Rd.dur;
          S.held = true; // an encounter on the bike's road: wait here for WALK.go()
          if (me) {
            WALK.held = true;
            if (WALK.onHold) WALK.onHold();
          }
        }
        const L = Rd.legs.find(l => tau <= l.b + 1e-9) || Rd.legs[Rd.legs.length - 1],
          f = tau <= L.a ? 0 : clamp((tau - L.a) / (L.b - L.a || 1), 0, 1),
          s = f * L.dist;
        let i = 0;
        while (i < L.pts.length - 2 && s > L.cum[i + 1]) i++;
        const a = L.pts[i],
          b = L.pts[i + 1] || a,
          g = clamp((s - L.cum[i]) / (L.cum[i + 1] - L.cum[i] || 1), 0, 1);
        S.x = a[0] + (b[0] - a[0]) * g;
        S.z = a[1] + (b[1] - a[1]) * g;
        lift = deckLift(decks, a, b, S.x, S.z);
        Rd.m = L.m !== 'walk' && tau <= L.a ? 'wait' : L.m; // (spec §4.43: before its time you stand at the stop / pier — the bus comes on the timetable)
        Rd.v = Rd.t < 0 || tau <= L.a || f >= 1 || S.held ? 0 : L.dist / Math.max(0.05, ((L.b - L.a) / (Rd.T1 - Rd.T0)) * Rd.dur);
        if (L.pts.length > 1 && Rd.v > 0) S.yaw += wrap(segYaw(L.pts, Math.min(i, L.pts.length - 2)) - S.yaw) * (1 - Math.exp(-dt / 0.08));
        v = L.m === 'walk' ? Math.min(Rd.v, SPEED) : 0;
        if (Rd.t >= Rd.dur) S.ride = null;
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
        lift = deckLift(decks, a, b, S.x, S.z);
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
      const rm = S.ride && S.ride.t >= 0 && S.ride.m !== 'wait' ? S.ride.m : 'walk',
        aboard = rm === 'bus' || rm === 'taxi', // inside the vehicle: vehicles3d draws it (with your ring)
        seat = rm === 'bike' || rm === 'scooter',
        h = rm === 'ferry' ? Math.max(heightAt(S.x, S.z), 0) + DECK_Y : heightAt(S.x, S.z) + lift;
      const size = 1 + (LIFE_H / HEIGHT - 1) * S.life; // map size → life size
      marker.visible = !aboard;
      if (pend) adopt();
      if (pl) pl.root.visible = !aboard;
      if (!pl) return (marker.scale.setScalar(size), marker.position.set(S.x, h + 3 * size, S.z));
      S.t += dt;
      // level of detail (performance, owner 2026-10-25): off screen → hidden, not posed; small → posed every few frames
      let every = 1,
        springs = true,
        shadow = true;
      if (view) {
        const hm = HEIGHT * size,
          d = Math.max(1, Math.hypot(S.x - view.cam.position.x, h + hm / 2 - view.cam.position.y, S.z - view.cam.position.z)),
          px = (hm * view.px) / d;
        SPH.center.set(S.x, h + hm / 2, S.z);
        SPH.radius = hm;
        S.shown = view.frustum.intersectsSphere(SPH);
        const e = AV_LOD.every.find(([lim]) => px < lim);
        every = e ? e[1] : 1;
        springs = px >= AV_LOD.springs;
        shadow = view.shadows !== false && px >= AV_LOD.shadow;
      } else S.shown = true;
      if (!S.shown) {
        pl.root.visible = false;
        S.acc += dt;
        S.fr = every; // (on screen again: posed at once)
        return;
      }
      if (shadow !== S.sh) ((S.sh = shadow), pl.root.traverse(o => o.isMesh && (o.castShadow = shadow && shadowPart(o))));
      setOutline(pl.root, !view || view.outline !== false); // (Auto, tight: the story figures' outlines off — map3d lodView)
      S.acc += dt;
      if (++S.fr < every) {
        pl.root.rotation.set(0, S.yaw, 0); // (between poses the figure still moves and turns)
        pl.root.position.set(S.x, S.dy + h, S.z);
        return;
      }
      const pdt = Math.min(S.acc, 0.1);
      S.acc = 0;
      S.fr = 0;
      const gait = Math.min(v, SPEED),
        stride = (1.6 + 0.8 * clamp((gait - RUN_AT) / 1.5, 0, 1)) * ((HEIGHT * size) / 1.65); // metres per gait cycle (× the figure's size)
      S.phase += ((v * pdt) / stride) * Math.PI * 2;
      if (me && gait > 0.4 && S.phase >= S.stepAt) {
        S.stepAt = (Math.floor(S.phase / Math.PI) + 1) * Math.PI; // a foot lands every half gait cycle
        if (WALK.onStep) WALK.onStep(gait);
      }
      S.w += (clamp(gait, 0, 1) - S.w) * (1 - Math.exp(-pdt * 10));
      const sway = Math.sin(S.t * 1.7),
        idle = { ...STAND, cp: 0.02 * sway, sp: 0.02 + 0.012 * sway },
        still = !S.walk && !S.ride && S.w < 0.05,
        hop = still && S.act === 'drill' ? Math.max(0, Math.sin(S.t * 6)) : 0; // (the session's block jumps, spec §4.43)
      let pose = seat ? RIDE : S.w > 0.01 ? mix(idle, locoPose({ speed: gait, fwd: gait, lat: 0, phase: S.phase }), S.w) : idle;
      if (still && S.act === 'drill') pose = { ...mix(READY, BLOCK, hop), lift: hop * 0.22 * size * (HEIGHT / 1.65) * 0.3 };
      else if (still && S.act === 'sleep') pose = SIT;
      pl.scale = pl.base * size;
      pl.root.scale.setScalar(pl.scale);
      pl.root.rotation.set(0, S.yaw, 0);
      pl.root.position.set(S.x, 0, S.z);
      applyPose(pl, pose);
      smoothBones(pl, pdt, gait > 1 ? 26 : 16);
      groundSnap(pl, pose.lift || 0, still && S.act === 'sleep'); // feet on the floor (root at y = 0; asleep: lying) …
      S.dy = pl.root.position.y + (seat ? SEAT * size * (HEIGHT / 6) : 0);
      pl.root.position.y = S.dy + h; // … then up onto the terrain (on the bike: its pedals)
      const sb = pl.vrm.springBoneManager;
      if (!springs) pl.vrm.springBoneManager = null; // (small on screen: the hair holds still)
      pl.vrm.update(pdt);
      pl.vrm.springBoneManager = sb;
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
        releaseVRM(pl.vrm);
      }
      if (pend) releaseVRM(pend.vrm);
    }
  };
}
