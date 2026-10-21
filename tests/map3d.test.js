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
