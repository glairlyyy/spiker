// Street-level streaming (spec §4.37 6 Streaming, T-364): at street level only the blocks near you are drawn in full —
// the island is cut into blocks (the terrain's chunks, ~190 m), each layer (terrain3d chunks, town3d's detailed lots, nature3d's
// instances, the story figures) prepares a block's share lazily (a few per frame, within a time budget; the block you stand in
// first) and draws only the ready near blocks (the ready part as it grows, topped up every STREAM.topUp s, all at once when done;
// one draw call per part as before: the merged meshes get an index of the near lots, the instanced ones their near instances
// packed to the front). Beyond them a cheap far version (coarse terrain, the Fast boxes, flat trees) under the street haze.
// Walking never waits (owner, 2026-10-25): a block not prepared yet shows its far version until it is (pop-in). The heavy preparing
// runs behind time that passes anyway: boost 'act' (a session / a sleep fast-forwarding — "Loading…" (wait) only if it takes
// > STREAM.wait s) or 'arrive' (just reached a place: no pill) prepares the blocks within `pre` with the larger budget.
// The map view (street weight < STREAM.show) draws everything as before. Display only: no randoms.
//   createStream(grid, layers) → { tick({ cam, you, st, low, dt, boost }), near(x, z), haze(st, near, far), info(), reset() }
//   layer = { id, ver() (a new value = rebuilt: its blocks are prepared again), prep?(k) (block k's share), show(keys | null) }
import * as THREE from 'three';

/** The tunables (m, s, ms). Fast: the same streaming, closer. */
export const STREAM = {
  show: 0.6, // street weight from which only the near blocks are drawn in full (below: the map look, everything)
  r: 250, // full detail: the blocks whose nearest point is within r of you
  pre: 420, // blocks prepared ahead (behind an automated action: all of them)
  step: 16, // the near set is looked at again when the camera moved this far
  budget: 3, // ms of block preparing per frame while walking
  per: 2, // … and at most this many blocks per frame; at least one
  boost: { budget: 40, per: 64 }, // … behind an automated action / on arrival (time passes anyway)
  topUp: 0.2, // s between shows of a growing near set (all ready: at once)
  wait: 0.25, // s an action's preparing runs before "Loading…" shows
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
    c = mesh.instanceColor && P.c ? mesh.instanceColor.array : null,
    S = P.m,
    Sc = P.c;
  if (!list) {
    m.set(S);
    if (c) c.set(Sc);
    mesh.count = P.n;
  } else {
    // (plain copies, no subarray views: a pack runs on every near-set change — no garbage per instance)
    for (let j = 0, n = list.length; j < n; j++) {
      const i = list[j] * 16,
        o = j * 16;
      for (let e = 0; e < 16; e++) m[o + e] = S[i + e];
      if (c) {
        const i3 = list[j] * 3,
          o3 = j * 3;
        c[o3] = Sc[i3];
        c[o3 + 1] = Sc[i3 + 1];
        c[o3 + 2] = Sc[i3 + 2];
      }
    }
    mesh.count = list.length;
  }
  P.list = list;
  // upload only the drawn part (three: updateRanges → bufferSubData of that span)
  const up = (a, k) => {
    a.clearUpdateRanges();
    a.addUpdateRange(0, Math.max(1, mesh.count * k));
    a.needsUpdate = true;
  };
  up(mesh.instanceMatrix, 16);
  if (c) up(mesh.instanceColor, 3);
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
    since = 0, // s since the last show
    held = 0, // s an 'act' boost has been preparing
    N = { preps: 0, shows: 0, ms: 0, showMs: 0 };
  const built = new Map(layers.map(l => [l.id, { ver: undefined, set: new Set() }]));
  const T = low => (low ? { ...STREAM, ...STREAM.fast } : STREAM);
  const ready = k => layers.every(l => built.get(l.id).set.has(k));
  const off = () => {
    if (!active) return;
    active = false;
    for (const l of layers) l.show(null);
    shown = shownKey = at = null;
    want = queue = [];
    held = 0;
  };
  const S = {
    /**
     * Each frame: you = your world [x, z] (cam, the camera's, is not used), st = the street weight, low = Fast, dt (s), boost = 0 |
     * 'arrive' | 'act' (the larger budget). → { on, busy (blocks within pre still preparing), wait ('act' preparing > STREAM.wait s) }
     */
    tick({ you, st, low, dt = 0, boost = 0 }) {
      if (!(st >= STREAM.show)) return (off(), { on: false, busy: false, wait: false });
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
      // prepare a few blocks (walking: within the small budget; behind an action / on arrival: the larger)
      const t0 = now(),
        budget = boost ? STREAM.boost.budget : P.budget,
        per = boost ? STREAM.boost.per : P.per;
      // one layer's share of a block a slice (Pacing A: not a whole block in one go), the time looked at after each
      let n = 0,
        sl = 0;
      while (queue.length && (sl === 0 || (n < per && now() - t0 < budget))) {
        const k = queue[0],
          l = layers.find(l => !built.get(l.id).set.has(k));
        if (l) {
          if (l.prep) (l.prep(k), sl++);
          built.get(l.id).set.add(k);
        }
        if (!l || layers.every(q => built.get(q.id).set.has(k))) {
          queue.shift();
          n++;
          N.preps++;
        }
      }
      // show the ready part of the near set: all of it at once, a growing part every topUp s (sooner when your block is new)
      since += dt;
      const all = want.every(ready),
        have = all ? want : want.filter(ready),
        key = have.join(',');
      if (key !== shownKey && (all || !shown || (ready(yk) && !shown.has(yk)) || since >= STREAM.topUp)) {
        const set = new Set(have),
          t1 = now();
        for (const l of layers) l.show(set);
        N.showMs = +(now() - t1).toFixed(1);
        shown = set;
        shownKey = key;
        since = 0;
        N.shows++;
      }
      if (n || sl) N.ms = +(now() - t0).toFixed(1);
      const busy = queue.length > 0;
      held = boost === 'act' && busy ? held + dt : 0;
      return { on: true, busy, wait: held >= STREAM.wait };
    },
    /** Is world (x, z) in a block drawn in full now (always, when not streaming)? */
    near: (x, z) => !shown || shown.has(G.of(x, z)),
    /** The haze while streaming (near / far m, eased in from the map's own over show → 1), else the given one. */
    haze(st, near, far, low) {
      if (!active) return [near, far];
      const H = T(low).haze,
        k = Math.min(1, Math.max(0, (st - STREAM.show) / (1 - STREAM.show)));
      return [Math.min(near, near + (H[0] - near) * k), Math.min(far, far + (H[1] - far) * k)];
    },
    /** QA: { on, near (blocks shown), want, queue, built (per layer), preps, shows, ms (the last frame's preparing), showMs (the last show) }. */
    info: () => ({
      on: active,
      near: shown ? shown.size : 0,
      want: want.length,
      queue: queue.length,
      built: Object.fromEntries([...built].map(([id, b]) => [id, b.set.size])),
      ...N
    }),
    /** Everything drawn again (the map look), the prepared blocks kept. */
    reset: off
  };
  return S;
}
