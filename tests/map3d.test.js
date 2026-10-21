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
