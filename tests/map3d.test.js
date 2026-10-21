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
