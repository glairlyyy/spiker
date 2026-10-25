// Street-level streaming (spec §4.37 6 Streaming, T-364): at street level only the blocks near you are drawn in full —
// the island is cut into blocks (the terrain's chunks, ~190 m), each layer (terrain3d chunks, town3d's detailed lots, nature3d's
// instances, the story figures) prepares a block's share lazily (a few per frame, within a time budget; the block you stand in
// first, at once) and, once every near block is ready, draws only those (the ready part at once when yours isn't drawn yet;
// one draw call per part as before: the merged meshes get an index of the near lots, the instanced ones their near instances
// packed to the front). Beyond them a cheap far version (coarse terrain, the Fast boxes, flat trees) under the street haze.
// Your own block is prepared and drawn the frame you reach it, so the walk never waits; the hold ("Loading…") is a fallback only.
// The map view (street weight < STREAM.show) draws everything as before. Display only: no randoms.
//   createStream(grid, layers) → { tick({ cam, you, st, low }), near(x, z), loading(), haze(st, near, far), info(), reset() }
//   layer = { id, ver() (a new value = rebuilt: its blocks are prepared again), prep?(k) (block k's share), show(keys | null) }
import * as THREE from 'three';

/** The tunables (m, s, ms). Fast: the same streaming, closer. */
export const STREAM = {
  show: 0.6, // street weight from which only the near blocks are drawn in full (below: the map look, everything)
  r: 250, // full detail: the blocks whose nearest point is within r of you
  pre: 420, // blocks prepared ahead (so a walk never waits)
  step: 16, // the near set is looked at again when the camera moved this far
  budget: 3, // ms of block preparing per frame (holding: × 4)
  per: 2, // … and at most this many blocks per frame (holding: × 4); at least one
  wait: 0.25, // s the walk has held before "Loading…" shows
  haze: [150, 640], // the street haze near / far while streaming (the far version fades into it)
  fast: { r: 190, pre: 320, haze: [120, 480] }
};

/** The block grid: W × D m cut into cw × cd blocks (nx × nz); a block's key k = j × nx + i. */
export function blockGrid(W, D, cw, cd) {
  const nx = Math.max(1, Math.ceil(W / cw - 1e-9)),
    nz = Math.max(1, Math.ceil(D / cd - 1e-9)),
    ci = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v))),
    G = {
      W,
      D,
      cw,
      cd,
      nx,
      nz,
      of: (x, z) => ci(z / cd, nz) * nx + ci(x / cw, nx),
      /** The distance (m) from (x, z) to block k's rectangle (0 inside). */
      dist(k, x, z) {
        const i = k % nx,
          j = (k - i) / nx,
          dx = Math.max(i * cw - x, 0, x - (i + 1) * cw),
          dz = Math.max(j * cd - z, 0, z - (j + 1) * cd);
        return Math.hypot(dx, dz);
      },
      /** The blocks within r of (x, z), nearest first. */
      within(x, z, r) {
        const out = [],
          i0 = ci((x - r) / cw, nx),
          i1 = ci((x + r) / cw, nx),
          j0 = ci((z - r) / cd, nz),
          j1 = ci((z + r) / cd, nz);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const k = j * nx + i,
              d = G.dist(k, x, z);
            if (d <= r) out.push([d, k]);
          }
        return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => e[1]);
      }
    };
  return G;
}

/**
 * Pack an InstancedMesh's instances `list` (indices into its full set) to the front and draw only those; null = all again.
 * The full matrices / colours are kept (mesh.userData.pack) from the first pack; `repack(mesh, fn)` runs fn on the full set
 * (a recolour) and packs again.
 */
export function pack(mesh, list) {
  let P = mesh.userData.pack;
  if (!P && !list) return;
  if (!P)
    P = mesh.userData.pack = {
      m: mesh.instanceMatrix.array.slice(),
      c: mesh.instanceColor ? mesh.instanceColor.array.slice() : null,
      n: mesh.count,
      list: null
    };
  const m = mesh.instanceMatrix.array,
    c = mesh.instanceColor && P.c ? mesh.instanceColor.array : null;
  if (!list) {
    m.set(P.m);
    if (c) c.set(P.c);
    mesh.count = P.n;
  } else {
    for (let j = 0; j < list.length; j++) {
      const i = list[j];
      m.set(P.m.subarray(i * 16, i * 16 + 16), j * 16);
      if (c) c.set(P.c.subarray(i * 3, i * 3 + 3), j * 3);
    }
    mesh.count = list.length;
  }
  P.list = list;
  mesh.instanceMatrix.needsUpdate = true;
  if (c) mesh.instanceColor.needsUpdate = true;
  mesh.boundingSphere = null; // (three recomputes it from the drawn instances)
}
/** Run fn on the mesh's full instance set (e.g. setColorAt by full index), then pack it again as it was. */
export function repack(mesh, fn) {
  const P = mesh.userData.pack,
    L = P ? P.list : null;
  if (L) pack(mesh, null);
  fn();
  mesh.userData.pack = null;
  if (L) pack(mesh, L);
}
/**
 * A merged (non-indexed) mesh drawn as the vertex ranges of the near items only: one index (allocated once at the vertex count,
 * so its GL buffer is reused) of the ranges `spans` ([v0, v1) pairs, flat); null = the whole mesh again.
 */
export function ranges(geo, spans) {
  if (!spans) {
    if (geo.index) geo.setIndex(null);
    geo.setDrawRange(0, Infinity);
    return;
  }
  const n = geo.attributes.position.count;
  let I = geo.userData.near;
  if (!I || I.count !== n) I = geo.userData.near = new THREE.BufferAttribute(new Uint32Array(n), 1);
  let m = 0;
  for (let s = 0; s < spans.length; s += 2) for (let v = spans[s]; v < spans[s + 1]; v++) I.array[m++] = v;
  I.clearUpdateRanges();
  I.addUpdateRange(0, Math.max(1, m));
  I.needsUpdate = true;
  if (geo.index !== I) geo.setIndex(I);
  geo.setDrawRange(0, m);
}
/** The stream manager: picks the near blocks round you, prepares them across frames (yours first), shows them when all are ready. */
export function createStream(G, layers) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let active = false,
    at = null, // the camera point the near set was picked at
    lowWas = null,
    want = [], // the near blocks (keys)
    queue = [], // blocks to prepare, nearest first
    shown = null, // the near set drawn now (Set) or null (everything / not streaming)
    shownKey = null,
    hold = false,
    held = 0,
    N = { preps: 0, shows: 0, holds: 0, ms: 0, showMs: 0 };
  const built = new Map(layers.map(l => [l.id, { ver: undefined, set: new Set() }]));
  const T = low => (low ? { ...STREAM, ...STREAM.fast } : STREAM);
  const ready = k => layers.every(l => built.get(l.id).set.has(k));
  const off = () => {
    if (!active) return;
    active = false;
    for (const l of layers) l.show(null);
    shown = shownKey = at = null;
    want = queue = [];
    hold = false;
    held = 0;
  };
  const S = {
    /** Each frame: you = your world [x, z] (cam, the camera's, is not used), st = the street weight, low = Fast, dt (s). → { on, hold, wait } */
    tick({ you, st, low, dt = 0 }) {
      if (!(st >= STREAM.show)) return (off(), { on: false, hold: false, wait: false });
      active = true;
      const P = T(low);
      let dirty = low !== lowWas;
      lowWas = low;
      for (const l of layers) {
        const b = built.get(l.id),
          v = l.ver();
        if (v !== b.ver) ((b.ver = v), b.set.clear(), (dirty = true));
      }
      if (dirty) shownKey = null;
      // the near set round you (not the camera: it can be held back, e.g. by the week-1 fence), looked at again every `step` m
      if (dirty || !at || Math.hypot(you[0] - at[0], you[1] - at[1]) > P.step) {
        at = you.slice();
        want = G.within(you[0], you[1], P.r);
        queue = G.within(you[0], you[1], P.pre).filter(k => !ready(k));
      }
      const yk = G.of(you[0], you[1]);
      if (!ready(yk)) queue = [yk, ...queue.filter(k => k !== yk)]; // your own block first (an arrival, a rebuilt layer)
      // prepare a few blocks (more while the near set is only partly drawn)
      const part = !shown || shownKey === null || shown.size < want.length || !shown.has(yk),
        t0 = now(),
        budget = P.budget * (part ? 4 : 1),
        per = P.per * (part ? 4 : 1);
      let n = 0;
      while (queue.length && (n === 0 || (n < per && now() - t0 < budget))) {
        const k = queue.shift();
        for (const l of layers) {
          const b = built.get(l.id);
          if (b.set.has(k)) continue;
          if (l.prep) l.prep(k);
          b.set.add(k);
        }
        n++;
        N.preps++;
      }
      // show the near set once all of it is ready — or its ready part at once when your block isn't drawn (topped up later)
      const all = want.every(ready),
        have = all ? want : want.filter(ready),
        key = have.join(',');
      if (key !== shownKey && ready(yk) && (all || !shown || !shown.has(yk))) {
        const set = new Set(have),
          t1 = now();
        for (const l of layers) l.show(set);
        N.showMs = +(now() - t1).toFixed(1);
        shown = set;
        shownKey = all ? key : null; // (a part: shown again when the rest is ready)
        N.shows++;
      }
      hold = !shown || !shown.has(yk);
      if (hold) N.holds++;
      if (n) N.ms = +(now() - t0).toFixed(1);
      held = hold ? held + dt : 0;
      return { on: true, hold, wait: hold && held >= STREAM.wait };
    },
    /** Is world (x, z) in a block drawn in full now (always, when not streaming)? */
    near: (x, z) => !shown || shown.has(G.of(x, z)),
    /** The walk is held: the block you stand in isn't shown yet. */
    holding: () => active && hold,
    /** The haze while streaming (near / far m, eased in from the map's own over show → 1), else the given one. */
    haze(st, near, far, low) {
      if (!active) return [near, far];
      const H = T(low).haze,
        k = Math.min(1, Math.max(0, (st - STREAM.show) / (1 - STREAM.show)));
      return [Math.min(near, near + (H[0] - near) * k), Math.min(far, far + (H[1] - far) * k)];
    },
    /** QA: { on, near (blocks shown), want, queue, built (per layer), hold, preps, shows, holds (frames held), ms (the last frame's preparing), showMs (the last show) }. */
    info: () => ({
      on: active,
      near: shown ? shown.size : 0,
      want: want.length,
      queue: queue.length,
      built: Object.fromEntries([...built].map(([id, b]) => [id, b.set.size])),
      hold,
      ...N
    }),
    /** Everything drawn again (the map look), the prepared blocks kept. */
    reset: off
  };
  return S;
}
