// Pure map3d helpers (geo3d.mjs, map3d.mjs polygon helpers, the opening view): no renderer, no game context.
const { test, assert, eq } = require('./harness');

// ---------- T-087: map3d pure functions (geo3d.mjs; map3d.mjs polygon helpers) ----------
test('map3d: map ↔ world units, maths helpers and the fog rule', () => {
  const geo = require('../js/map3d/geo3d.mjs');
  const [wx, wz] = geo.toWorld([300, 140]);
  eq(wx, 150, 'x in metres');
  eq(wz, 70, 'y → z in metres');
  const back = geo.toMap(wx, wz);
  eq(back[0] + ',' + back[1], '300,140', 'toMap undoes toWorld');
  eq(geo.clamp(5, 0, 3), 3, 'clamp high');
  eq(geo.clamp(-1, 0, 3), 0, 'clamp low');
  eq(geo.lerp(10, 20, 0.25), 12.5, 'lerp');
  eq(geo.smooth(0, 10, -5), 0, 'smooth below');
  eq(geo.smooth(0, 10, 15), 1, 'smooth above');
  eq(geo.smooth(0, 10, 5), 0.5, 'smooth middle');
  assert(geo.smooth(0, 10, 2) < 0.2 && geo.smooth(0, 10, 8) > 0.8, 'smooth is S-shaped');
  eq(geo.fogFactor(null)(1, 1), 1, 'no fog model → fully lit');
  const k = geo.fogFactor({ points: [[100, 100]], r: 40 }),
    [px, pz] = geo.toWorld([100, 100]);
  eq(k(px, pz), 1, 'at a visited point');
  eq(k(px + 20, pz), 1, 'inside the revealed radius (20 m = 40 units)');
  eq(k(px + 20 + geo.FOG_SOFT + 1, pz), geo.FOG_DIM, 'beyond the soft edge: dim');
  const mid = k(px + 20 + geo.FOG_SOFT / 2, pz);
  assert(mid > geo.FOG_DIM && mid < 1, 'smooth in between');
});

test('map3d: point in polygon, distance to an outline, side of a polyline', () => {
  const { inside, edgeDist, sideDist } = require('../js/map3d/map3d.mjs');
  const sq = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10]
  ];
  assert(inside(5, 5, sq) && !inside(11, 5, sq) && !inside(-1, -1, sq), 'square');
  const concave = [
    [0, 0],
    [10, 0],
    [10, 10],
    [5, 4],
    [0, 10]
  ];
  assert(inside(2, 2, concave) && !inside(5, 8, concave), 'a concave notch is outside');
  eq(edgeDist(5, 5, sq), 5, 'the centre is 5 from the nearest edge');
  eq(edgeDist(13, 5, sq), 3, 'outside, 3 from the right edge');
  eq(edgeDist(0, 0, sq), 0, 'on a corner');
  eq(
    edgeDist(3, 3, [
      [1, 1],
      [1, 1],
      [1, 1]
    ]) > 0,
    true,
    'a degenerate outline does not divide by zero'
  );
  const line = [
    [0, 0],
    [10, 0]
  ];
  const a = sideDist(5, 2, line),
    b = sideDist(5, -2, line);
  assert(Math.abs(a) === 2 && Math.abs(b) === 2 && Math.sign(a) !== Math.sign(b), 'signed distance: opposite sides, same magnitude');
});

// ---------- T-097: the map's opening view ----------
test('map3d: fitView frames every point, clamps the distance', () => {
  const geo = require('../js/map3d/geo3d.mjs');
  eq(geo.fitView([], 1.6, 60, 200), null, 'no points → null');
  eq(geo.fitView(null, 1.6, 60, 200), null, 'null → null');
  const one = geo.fitView([[50, 80]], 1.6, 60, 200);
  eq(one.x + ',' + one.z + ',' + one.d, '50,80,60', 'one point: centred, the minimum distance');
  const two = geo.fitView(
    [
      [0, 0],
      [200, 40]
    ],
    1.6,
    60,
    400
  );
  eq(two.x + ',' + two.z, '100,20', 'two points: centred between them');
  const half = Math.tan((20 * Math.PI) / 180) * 1.6 * two.d;
  assert(half >= 114.99, 'the padded width fits the horizontal field of view');
  eq(
    geo.fitView(
      [
        [0, 0],
        [2000, 0]
      ],
      1.6,
      60,
      200
    ).d,
    200,
    'far apart: clamped to the maximum'
  );
});

// ---------- T-341: people on the map (people3d.mjs LOD, life3d looks) ----------
test('map3d people: the VRM LOD takes the nearest on-screen cap, holds the shown ones', () => {
  const { nearestOnScreen, VRM_LOD } = require('../js/map3d/people3d.mjs');
  const cands = Array.from({ length: 40 }, (_, i) => ({ id: i, d: 10 + ((i * 37) % 40) }));
  const pick = nearestOnScreen(cands, VRM_LOD.cap, new Set());
  eq(pick.size, VRM_LOD.cap, 'never more than the cap');
  const near = cands
    .slice()
    .sort((a, b) => a.d - b.d)
    .slice(0, VRM_LOD.cap)
    .map(c => c.id);
  assert(
    near.every(id => pick.has(id)),
    'the nearest ones'
  );
  assert(VRM_LOD.cap >= 12 && VRM_LOD.cap <= 20, 'about 16');
  // hysteresis: someone shown stays while only a little farther than a newcomer
  const two = [
    { id: 'old', d: 11 },
    { id: 'new', d: 10 }
  ];
  eq([...nearestOnScreen(two, 1, new Set(['old']))][0], 'old', 'the shown one holds');
  eq([...nearestOnScreen(two, 1, new Set())][0], 'new', 'without a hold: the nearer');
  eq(
    [
      ...nearestOnScreen(
        [
          { id: 'old', d: 20 },
          { id: 'new', d: 10 }
        ],
        1,
        new Set(['old'])
      )
    ][0],
    'new',
    'much nearer wins'
  );
  eq(nearestOnScreen(cands, 0, null).size, 0, 'cap 0: none');
});

test('map3d people: humanoids by default, capsules on Fast; no VRMs before the map has shown', () => {
  const THREE = require('three');
  const { createLife } = require('../js/map3d/life3d.mjs');
  const scene = new THREE.Scene(),
    L = createLife(scene, () => 0),
    people = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      at: [100 + i * 3, 100],
      home: [100 + i * 3, 140],
      act: ['train', 'hustle', 'rest'][i % 3],
      g: i < 3 ? 'circle' : i < 6 ? 'grey' : 'other',
      color: '#c03030'
    })),
    m = {
      life: {
        people,
        look: { size: { circle: 1.9, mate: 1.6, other: 1.4, grey: 1.4 }, low: 10, pick: 16 },
        crews: [{ at: [50, 50], team: 1, n: 4, known: true, color: '#3050c0', walk: [[60, 60]] }],
        battle: null,
        patrols: []
      }
    },
    cam = new THREE.PerspectiveCamera(40, 1.6, 1, 3000);
  cam.position.set(60, 60, 120);
  cam.lookAt(60, 0, 50);
  cam.updateMatrixWorld();
  L.sync(m, false);
  L.tick(0.016, 1, 0.5, cam);
  let c = L.count();
  eq(c.look, 'humanoid', 'the default look');
  eq(c.humanoids, 34, 'every figure a humanoid (30 named + 4 crew)');
  eq(c.circle, 3, 'your circle ringed');
  eq(c.vrm, 0, 'no VRM on the first frame');
  assert(L.at(0) && L.at(0)[1] > 1.3 * 2.5, 'named people ~2.5× life size (head above 3 m)');
  L.sync(m, true);
  L.tick(0.016, 1, 0.5, cam);
  c = L.count();
  eq(c.look, 'capsule', 'Fast keeps the capsules');
  eq(c.people, 14, 'Fast: look.low named + the crew');
  eq(c.humanoids + c.circle + c.vrm, 0, 'Fast: no humanoids, rings or VRMs');
  L.dispose();
});

// ---------- T-343: the detailed look's pure parts (generated textures, nature shapes) ----------
test('map3d: tileable noise and its normal map (the generated textures)', () => {
  const geo = require('../js/map3d/geo3d.mjs');
  const n = 32,
    a = geo.tileNoise(n, 4, 3, 1),
    b = geo.tileNoise(n, 4, 3, 1);
  eq(a.length, n * n, 'n × n values');
  assert(
    a.every((v, i) => v === b[i]),
    'fixed: the same seed gives the same image (no randoms)'
  );
  assert(
    a.every(v => v >= 0 && v <= 1),
    'values in 0..1'
  );
  assert(Math.max(...a) - Math.min(...a) > 0.2, 'it varies');
  // tileable: the period-wrapped noise one cell past the edge equals the start
  eq(geo.vnoise(4.25, 1.5, 4).toFixed(6), geo.vnoise(0.25, 1.5, 4).toFixed(6), 'vnoise wraps with its period');
  eq(geo.vnoise(3.3, 2.2).toFixed(6), geo.vnoise(3.3, 2.2, 0).toFixed(6), 'no period: the plain noise (terrain heights unchanged)');
  let seam = 0,
    inner = 0;
  for (let y = 0; y < n; y++) ((seam += Math.abs(a[y * n] - a[y * n + n - 1])), (inner += Math.abs(a[y * n + 1] - a[y * n])));
  assert(seam < inner * 2 + 0.5, 'no seam across the wrap (left edge vs right edge ~ neighbours)');
  const N = geo.heightToNormal(new Float32Array(16).fill(0.5), 4);
  eq(Array.from(N.slice(0, 4)).join(','), '128,128,255,255', 'a flat height → straight up');
  const ramp = new Float32Array(16).map((_, i) => (i % 4) / 4),
    R = geo.heightToNormal(ramp, 4, 2);
  assert(R[4 + 0] < 128, 'a slope up along x tilts the normal toward −x');
});
test('map3d: nature shapes — Fast unchanged, detailed shapes carry the leaf flag within budget', () => {
  const { SHAPES } = require('../js/map3d/nature3d.mjs');
  const tris = g => g.attributes.position.count / 3;
  const FLAT = { pine: 22, broad: 30, blossom: 30, palm: 70, rock: 20, bush: 20, tuft: 9, bamboo: 48, fence: 60, log: 12 };
  for (const [k, t] of Object.entries(FLAT)) {
    const g = SHAPES.flat[k]();
    eq(tris(g), t, `Fast ${k}: today's shape`);
    assert(!g.attributes.leaf, `Fast ${k}: no leaf attribute`);
  }
  for (const k of Object.keys(FLAT)) {
    const g = SHAPES.hi[k]();
    assert(
      ['position', 'normal', 'color', 'leaf'].every(a => g.attributes[a]),
      `detailed ${k}: position, normal, colour, leaf`
    );
    assert(tris(g) <= 450, `detailed ${k}: ≤ 450 triangles (${tris(g)})`);
    assert(g.attributes.position.array.every(Number.isFinite), `detailed ${k}: finite`);
  }
  const p1 = SHAPES.hi.pine(),
    p2 = SHAPES.hi.pine();
  assert(
    p1.attributes.position.array.every((v, i) => v === p2.attributes.position.array[i]),
    'hashed jitter: the same shape every time'
  );
});

// ---------- T-342: buildings and streets with detail (spec §4.39) ----------
const townModel = (() => {
  let m = null;
  return () => {
    if (!m) {
      const { load } = require('./harness'),
        g = load(5);
      m = g.MapModel.build(g.Run.create(g.Run.draft(), { role: 'WS', name: 'Kit' }), null);
    }
    return m;
  };
})();
test('map3d: facades — panes on their walls, a door or shop front in front, fixed hashes', () => {
  const kit = require('../js/map3d/kit3d.mjs'),
    lots = townModel().land.lots;
  let panes = 0,
    lit = 0,
    fronts = 0;
  lots.forEach((l, i) => {
    const F = kit.facade(l, i);
    if (!F) return;
    eq(JSON.stringify(F), JSON.stringify(kit.facade(l, i)), 'the same facade twice (no randoms)');
    const fr = kit.lotFrame(l, i);
    assert(Math.abs(fr.h - F.fr.h) < 1e-9, 'the lot height is the Fast instances’ (kit3d lotFrame)');
    for (const fc of F.faces) {
      assert(fc.wz >= -0.25, 'no face that looks away from the camera');
      if (fc.front) fronts++;
      for (const o of fc.wins) {
        panes++;
        if (o.lit) lit++;
        if (o.half === undefined) assert(Math.abs(o.u) + o.w / 2 <= fc.wide / 2 + 1e-6, `${l.kind}: a pane inside its wall`);
        assert(o.y - o.h / 2 >= -1e-6 && o.y + o.h / 2 <= F.fr.h + 1e-6, `${l.kind}: a pane between the ground and the roof`);
        if (o.kind === 'door') assert(fc.front, 'doors in front');
      }
    }
  });
  assert(panes > 4000 && lit > 1000 && lit < panes * 0.6, `panes ${panes}, lit ${lit}`);
  assert(fronts > lots.length * 0.9, 'nearly every building shows its front');
});
test('map3d: the detailed town — 3 merged meshes, its panes where the night glows sit; Fast keeps the instanced shapes', () => {
  const THREE = require('three'),
    kit = require('../js/map3d/kit3d.mjs'),
    { createTown } = require('../js/map3d/town3d.mjs'),
    m = townModel(),
    flat = () => 1,
    meshes = sc => {
      const out = [];
      sc.traverse(o => o.isMesh && out.push(o));
      return out;
    };
  const sc = new THREE.Scene(),
    town = createTown(sc, flat, { fast: () => false });
  town.sync(m);
  const det = meshes(sc).filter(o => o.userData.town);
  eq(det.map(o => o.userData.town).join(','), 'W,G,R', 'walls, glass, roofs: one draw call each');
  assert(!meshes(sc).some(o => o.isInstancedMesh), 'no instanced boxes in the detailed look');
  // every facade pane is a glass quad centred 2.5 cm off its wall (the night layer puts its glow at the same spot, 12 cm off)
  const g = det.find(o => o.userData.town === 'G').geometry.attributes.position.array,
    cells = new Map(),
    cell = (x, z) => `${Math.floor(x * 2)},${Math.floor(z * 2)}`;
  for (let q = 0; q < g.length; q += 18) {
    const c = [(g[q] + g[q + 6]) / 2, (g[q + 1] + g[q + 7]) / 2, (g[q + 2] + g[q + 8]) / 2],
      k = cell(c[0], c[2]);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(c);
  }
  const has = p => {
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const c of cells.get(cell(p[0] + a / 2, p[2] + b / 2)) || [])
          if (Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) < 0.002) return true;
    return false;
  };
  let miss = 0,
    n = 0;
  m.land.lots.forEach((l, i) => {
    const F = kit.facade(l, i);
    if (!F) return;
    const { x, z, cs, sn } = F.fr;
    for (const fc of F.faces)
      for (const o of fc.wins) {
        const hf = (o.half !== undefined ? o.half : fc.half) + 0.025,
          lx = fc.nx * hf + fc.nz * o.u,
          lz = fc.nz * hf - fc.nx * o.u;
        n++;
        if (!has([x + lx * cs + lz * sn, 1 + o.y, z - lx * sn + lz * cs])) miss++;
      }
  });
  eq(miss, 0, `panes without their glass quad (of ${n})`);
  town.dispose();
  const sc2 = new THREE.Scene(),
    fast = createTown(sc2, flat, { fast: () => true });
  fast.sync(m);
  const inst = meshes(sc2).filter(o => o.isInstancedMesh);
  eq(inst.length, 4, 'Fast: the four instanced shapes (box, gable, stepped, cylinder)');
  eq(
    inst.reduce((a, o) => a + o.count, 0),
    m.land.lots.filter(l => kit.KIT[l.kind]).length,
    'one instance per lot'
  );
  eq(fast.count(), null, 'no detailed parts in Fast');
  fast.dispose();
});
test('map3d: street lamps — one row for the glows and the posts (kit3d lampSpots)', () => {
  const kit = require('../js/map3d/kit3d.mjs'),
    roads = townModel().land.roads,
    S = kit.STREET,
    old = [];
  // the night layer's lamp row before T-342, inline
  for (const r of roads) {
    if (!S.kinds.includes(r.kind) || old.length >= S.cap) continue;
    const [a, b] = r.pts.map(p => [p[0] * 0.5, p[1] * 0.5]),
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      ux = (b[0] - a[0]) / (len || 1),
      uz = (b[1] - a[1]) / (len || 1);
    for (let d = S.every / 2, j = 0; d < len && old.length < S.cap; d += S.every, j++) {
      const sd = j % 2 ? S.side : -S.side;
      old.push([a[0] + ux * d - uz * sd, a[1] + uz * d + ux * sd]);
    }
  }
  const now = kit.lampSpots(roads);
  assert(now.length > 50, `lamps (${now.length})`);
  eq(JSON.stringify(now.map(p => [p.x, p.z])), JSON.stringify(old), 'the same lamps as before');
  assert(
    now.every(p => Math.abs(Math.hypot(p.ux, p.uz) - 1) < 1e-9 && Math.abs(p.s) === 1),
    'each lamp knows its road and side (the post stands away from the road)'
  );
});

// ---------- T-336a: street level (spec §4.37 6) ----------
test('map3d: street level — one continuous zoom path (pitch, distance, height monotonic), street mode only inside the district', () => {
  const { streetPose, DIST, STREET, PITCH, zoneOf, inZone, zoneDist } = require('../js/map3d/mapcam3d.mjs');
  let prev = null;
  for (let d = 60; d >= STREET.d1 - 1e-9; d -= 0.25) {
    const P = streetPose(d);
    if (prev) {
      assert(P.pitch <= prev.pitch + 1e-12, `pitch never rises as the zoom goes down (d ${d})`);
      assert(P.up <= prev.up + 1e-12, `the camera's height never rises (d ${d})`);
      assert(P.s >= prev.s - 1e-12, 'the street weight only grows');
      assert(Math.abs(P.pitch - prev.pitch) < 0.02, `no jump in the pitch (d ${d})`);
    }
    prev = P;
  }
  eq(streetPose(DIST[0]).s, 0, 'at the map’s closest: still the map');
  eq(streetPose(DIST[0]).pitch, PITCH, '… at its pitch');
  eq(streetPose(40).pitch, PITCH, 'above it the map’s pitch');
  eq(streetPose(STREET.d1).s, 1, 'at d1: street level');
  assert(Math.abs(streetPose(STREET.d1).pitch - (15 * Math.PI) / 180) < 1e-9, '~15° above the horizon');
  const P = streetPose(STREET.d1),
    behind = P.dist * Math.cos(P.pitch),
    above = P.up + STREET.head;
  assert(behind > 5.5 && behind < 7 && above > 2.5 && above < 3.6, `~6 m behind, ~3 m above (${behind.toFixed(2)}, ${above.toFixed(2)})`);
  // the district: the capsule from the Dynasty Strength Center to the League Arena (MapView.zone's shape)
  const { load } = require('./harness'),
    g = load(5),
    Z = zoneOf({ a: g.SPOTS.weiPower.at, b: g.VENUES.arena.at, r: 200 }),
    w = p => [p[0] * 0.5, p[1] * 0.5];
  assert(inZone(Z, ...w(g.SPOTS.weiPower.at)) && inZone(Z, ...w(g.VENUES.arena.at)), 'the gym and the arena are inside');
  const mid = w([(g.SPOTS.weiPower.at[0] + g.VENUES.arena.at[0]) / 2, (g.SPOTS.weiPower.at[1] + g.VENUES.arena.at[1]) / 2]);
  assert(inZone(Z, ...mid), 'the streets between them too');
  for (const id of ['harbor', 'home'].filter(k => g.SPOTS[k] && g.SPOTS[k].at))
    assert(!inZone(Z, ...w(g.SPOTS[id].at)), `${id} is outside (the zoom stops at the map's closest there)`);
  assert(!inZone(Z, ...w(g.CITY.hq[1])) || zoneDist(Z, ...w(g.CITY.hq[1])) <= 0, 'zoneDist agrees with inZone');
  eq(inZone(null, 0, 0), false, 'no district → no street level');
});
test('map3d: the detail ring — every face and rooms behind the ground-floor glass near the camera, kerbs and markings; hidden → the map look back', () => {
  const THREE = require('three'),
    kit = require('../js/map3d/kit3d.mjs'),
    { createTown, RING } = require('../js/map3d/town3d.mjs'),
    m = townModel(),
    flat = () => 1,
    sc = new THREE.Scene(),
    town = createTown(sc, flat, { fast: () => false });
  town.sync(m);
  const g0 = m.land.landmarks.find(l => l.id === 'weiPower').at,
    cx = g0[0] * 0.5,
    cz = g0[1] * 0.5;
  // all faces: a lot's facade with `all` lists faces looking away too, the camera-facing ones unchanged
  const i = m.land.lots.findIndex(
    l =>
      kit.facade(l, m.land.lots.indexOf(l)) &&
      kit.facade(l, m.land.lots.indexOf(l)).faces.length < 4 &&
      l.kind !== 'tank' &&
      l.kind !== 'stack'
  );
  const A = kit.facade(m.land.lots[i], i),
    B = kit.facade(m.land.lots[i], i, true);
  assert(B.faces.length === 4 && B.faces.length > A.faces.length, 'all four faces in the ring');
  eq(JSON.stringify(B.faces.filter(f => f.wz >= -0.25)), JSON.stringify(A.faces), 'the faces the map shows are the same');
  const W = () =>
    sc.children.find(o => o.isGroup && o.children.some(c => c.userData.town === 'W')).children.find(c => c.userData.town === 'W');
  const before = W().geometry.attributes.position.array.slice();
  town.ring(cx, cz, 1, true);
  const R = town.ringInfo();
  assert(R.on && R.lots > 40 && R.builds === 1, `ring lots ${R.lots}`);
  const ring = [];
  sc.traverse(o => o.isMesh && o.userData.ring && ring.push(o));
  eq(
    ring
      .map(o => o.userData.ring)
      .sort()
      .join(','),
    'G,I,R,W',
    'walls, glass, roofs, rooms: one draw call each'
  );
  const I = ring.find(o => o.userData.ring === 'I'),
    room = I.geometry.attributes.room;
  assert(room.count > 200, `room panes (${room.count / 6})`);
  for (let v = 0; v < room.count; v += 6) assert(room.getX(v) > 0.2 && room.getY(v) > 0.2, 'a room has a size');
  const pos = I.geometry.attributes.position.array;
  let far = 0;
  for (let v = 0; v < pos.length; v += 3) {
    if (Math.hypot(pos[v] - cx, pos[v + 2] - cz) > RING.r + 12) far++;
    assert(pos[v + 1] - 1 < 3.2, 'rooms only on the ground floor');
  }
  eq(far, 0, 'rooms only inside the ring');
  // the map look loses those lots while the ring shows (collapsed), and gets them back when it hides
  const now = W().geometry.attributes.position.array;
  let moved = 0;
  for (let v = 0; v < now.length; v++) if (now[v] !== before[v]) moved++;
  assert(moved > 1000, 'the ring’s lots are out of the map-look mesh');
  town.ring(cx, cz, 1, true);
  eq(town.ringInfo().builds, 1, 'no rebuild while the camera stays');
  town.ring(cx + RING.step + 1, cz, 1, true);
  eq(town.ringInfo().builds, 2, 'rebuilt after the camera moved a step');
  town.ring(cx, cz, 0, true);
  assert(!town.ringInfo().on, 'hidden at the map');
  const back = W().geometry.attributes.position.array;
  let diff = 0;
  for (let v = 0; v < back.length; v++) if (back[v] !== before[v]) diff++;
  eq(diff, 0, 'the map look is whole again');
  town.ring(cx, cz, 1, false);
  assert(!town.ringInfo().on, 'not outside the district');
  // town.cut (for the interiors, T-336b): the landmark triangles inside a box drop out, null brings them back
  let LM = null;
  sc.traverse(o => o.isMesh && o.userData.landmarks && (LM = o));
  const lm0 = LM.geometry.attributes.position.array.slice(),
    box = { x0: cx - 8, x1: cx + 8, z0: cz - 8, z1: cz + 8 };
  town.cut(box);
  const cutA = LM.geometry.attributes.position.array;
  let gone = 0,
    outside = 0;
  for (let t = 0; t < cutA.length; t += 9) {
    const flat = cutA[t] === cutA[t + 3] && cutA[t + 2] === cutA[t + 5] && cutA[t] === cutA[t + 6] && cutA[t + 1] === cutA[t + 4];
    const was = [0, 3, 6].every(o => lm0[t + o] >= box.x0 && lm0[t + o] <= box.x1 && lm0[t + o + 2] >= box.z0 && lm0[t + o + 2] <= box.z1);
    if (flat && was) gone++;
    if (!was) for (let v = 0; v < 9; v++) if (cutA[t + v] !== lm0[t + v]) outside++;
  }
  assert(gone > 20, `the gym's triangles cut (${gone})`);
  eq(outside, 0, 'nothing outside the box changes');
  town.cut(null);
  eq(LM.geometry.attributes.position.array.join(), lm0.join(), 'null restores the landmarks');
  town.dispose();
  // Fast: the ring is the ground detail only (the boxes stay)
  const sc2 = new THREE.Scene(),
    fast = createTown(sc2, flat, { fast: () => true });
  fast.sync(m);
  fast.ring(cx, cz, 1, true);
  const F = [];
  sc2.traverse(o => o.isMesh && o.userData.ring && F.push(o.userData.ring));
  eq(F.join(','), 'W', 'Fast: kerbs, pavements, markings, props');
  eq(fast.ringInfo().lots, 0, 'Fast: no detailed lots');
  fast.dispose();
});

test('map3d: facilities (spec §4.40, T-351) — every design inside its lot; a ray picks the facility; hover and rims light it; name boards', () => {
  const THREE = require('three'),
    { FAC, buildFacility } = require('../js/map3d/facility3d.mjs'),
    { createTown, HOVER } = require('../js/map3d/town3d.mjs'),
    { load } = require('./harness'),
    g = load(5);
  for (const [fac, S] of Object.entries(g.FACILITY)) {
    assert(FAC[fac], `${fac}: a design`);
    const { geo, sign } = buildFacility({ fac, ...S, kind: 'gym' }, '#d08a2e');
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    assert(
      b.min.x >= -S.w / 2 - 1.6 && b.max.x <= S.w / 2 + 1.6 && b.min.z >= -S.d / 2 - 1.6 && b.max.z <= S.d / 2 + 1.6,
      `${fac}: inside its ${S.w} × ${S.d} m lot (${b.min.x.toFixed(1)}…${b.max.x.toFixed(1)}, ${b.min.z.toFixed(1)}…${b.max.z.toFixed(1)})`
    );
    assert(b.max.y <= S.h + 4.5, `${fac}: about ${S.h} m tall (${b.max.y.toFixed(1)})`);
    assert(!geo.index && geo.attributes.color, `${fac}: flat, vertex-coloured (merges with the others)`);
    if (fac !== 'home') assert(sign && sign.w > 0 && sign.y > 0, `${fac}: a name board`);
  }
  const m = townModel(),
    sc = new THREE.Scene(),
    town = createTown(sc, () => 1, { fast: () => false });
  town.sync(m);
  const f = town.facility('weiPower');
  assert(f && f.w === 24 && f.d === 16, 'the Strength Center as a facility box');
  // a ray straight down onto its middle picks it; a ray beside it picks nothing; ok() can refuse it
  const down = (x, z) => new THREE.Ray(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
  eq(town.pickRay(down(f.x, f.z)), 'weiPower', 'a ray onto it picks it');
  eq(town.pickRay(down(f.x + 400, f.z + 400)), null, 'off it: nothing');
  eq(
    town.pickRay(down(f.x, f.z), id => id !== 'weiPower'),
    null,
    'an unknown place cannot be picked'
  );
  // the hover eases in over HOVER.ms; the rims write their vertices only
  let LM = null,
    signs = null;
  sc.traverse(o => o.isMesh && o.userData.landmarks && (LM = o));
  sc.traverse(o => o.isMesh && o.userData.signs && (signs = o));
  town.hover('weiPower');
  town.tick(HOVER.ms / 2000);
  const k1 = town.hovered().k;
  town.tick(1);
  assert(k1 > 0.3 && k1 < 0.7 && town.hovered().k === 1, `the hover eases in (${k1.toFixed(2)} → 1)`);
  town.rims({ weiPower: ['#ff0000', 0.5] });
  const rim = LM.geometry.attributes.rim.array,
    fid = LM.geometry.attributes.fid.array;
  let on = 0,
    wrong = 0;
  for (let v = 0; v < fid.length; v++) if (rim[v * 4 + 3] > 0) (on++, fid[v] !== fid[f.v0] && wrong++);
  assert(on === f.v1 - f.v0 && !wrong, `the rim on the Strength Center's vertices only (${on})`);
  assert(signs && signs.geometry.attributes.position.count >= 6, 'name boards drawn (known places)');
  town.hover(null);
  town.dispose();
});
