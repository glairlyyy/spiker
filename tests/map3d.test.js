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

// ---------- T-368: street view models load whole (players3d image cache, the ready rule) ----------
test('map3d people: two models parsed at once keep their own textures (T-368: the image cache key is per parser)', () => {
  // (async in a child node: the harness is synchronous) your Main_v2 and a base-model figure, as the map starts them together
  const code = `
    const fs = require('fs'), path = require('path');
    let n = 0;
    globalThis.createImageBitmap = async blob => ({ width: 4, height: 4, id: ++n, size: blob.size, close() {} });
    const P = require(${JSON.stringify(require('path').join(__dirname, '../js/render3d/players3d.mjs'))});
    const buf = f => { const b = Buffer.from(fs.readFileSync(path.join(${JSON.stringify(require('path').join(__dirname, '../assets/vrm'))}, f), 'utf8').trim(), 'base64'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
    const imgs = pl => { const s = new Set(); pl.vrm.scene.traverse(o => o.material && [].concat(o.material).forEach(m => m.map && m.map.image && s.add(m.map.image))); return s; };
    (async () => {
      const mb = buf('main.glb.txt'), bb = buf('base.glb.txt');
      const [a, c, d] = await Promise.all([P.makeVRM(mb, 1.7), P.makeVRM(bb, 1.7), P.makeVRM(bb, 1.7)]);
      const A = imgs(a), C = imgs(c), D = imgs(d);
      console.log(JSON.stringify({ a: A.size, c: C.size, cross: [...C, ...D].filter(x => A.has(x)).length, same: [...D].every(x => C.has(x)), whole: P.wholeVRM(a.vrm) && P.wholeVRM(c.vrm) }));
    })().catch(e => (console.log(JSON.stringify({ err: String(e) })), process.exit(1)));`;
  const r = JSON.parse(
    require('child_process').execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }).trim().split('\n').pop()
  );
  assert(!r.err, r.err);
  assert(r.a > 5 && r.c > 5, `both models textured (${r.a} / ${r.c})`);
  eq(r.cross, 0, 'no base-model figure wears a Main_v2 image');
  assert(r.same, 'two figures of one model share its decoded images');
  assert(r.whole, 'both whole');
});
test('map3d people: the ready rule — a VRM shows only whole, dressed for its person and faded in (T-368)', () => {
  const { showVRM } = require('../js/map3d/people3d.mjs');
  const { wholeVRM, releaseVRM } = require('../js/render3d/players3d.mjs');
  const f = { shirt: '#e4572e', hair: '#101010', skin: '#eec39a' },
    kit = `${f.shirt}|${f.hair}|${f.skin}`,
    S = { id: 'p1', ready: true, kit, k: 0.5 };
  assert(showVRM(S, f), 'whole, dressed, fading in → shown');
  assert(!showVRM({ ...S, ready: false }, f), 'textures not ready → the humanoid stays');
  assert(!showVRM({ ...S, kit: null }, f), 'not dressed yet → hidden');
  assert(!showVRM({ ...S, kit: '#fff|#000|#fff' }, f), "another person's kit → hidden");
  assert(!showVRM({ ...S, k: 0 }, f) && !showVRM(S, null) && !showVRM({ ...S, id: null }, f), 'faded out / gone / free → hidden');
  // wholeVRM: every texture (own fields and MToon uniforms) has its image
  const tex = im => ({
    isTexture: true,
    image: im,
    disposed: 0,
    dispose() {
      this.disposed++;
    }
  });
  const fake = mats => ({ scene: { traverse: fn => mats.forEach(m => fn({ material: m })) } });
  const good = tex({ width: 8, height: 8 }),
    mat = (u, own) => ({
      ...(own || {}),
      uniforms: { map: { value: u } },
      disposed: 0,
      dispose() {
        this.disposed++;
      }
    });
  assert(wholeVRM(fake([mat(good), mat(null, { map: good })])), 'all images there → whole');
  assert(!wholeVRM(fake([mat(good), mat(tex(null))])), 'a uniform texture without its image → not whole');
  assert(!wholeVRM(fake([mat(null, { map: tex({ width: 0 }) })])), 'an empty image → not whole');
  assert(!wholeVRM(null), 'no model → not whole');
  // releaseVRM frees the figure's own materials, never the textures / geometry it shares with the pool
  const geo = {
      disposed: 0,
      dispose() {
        this.disposed++;
      }
    },
    m1 = mat(good),
    rel = { scene: { traverse: fn => fn({ material: m1, geometry: geo }) } };
  releaseVRM(rel);
  eq(m1.disposed, 1, 'its material freed');
  eq(good.disposed + geo.disposed, 0, 'the shared texture and geometry kept');
});

// ---------- T-341: people on the map (people3d.mjs LOD, life3d looks) ----------
test('map3d people: at an interior only the nearest VRM_LOD.inside station people are VRM candidates (owner 2026-10-25)', () => {
  const { insideCap, VRM_LOD } = require('../js/map3d/people3d.mjs');
  const c = [...Array.from({ length: 7 }, (_, i) => ({ id: `in${i}`, d: 2 + i, inside: true })), { id: 'out', d: 30, inside: false }];
  const k = insideCap(c, VRM_LOD.inside).map(q => q.id);
  eq(k.length, VRM_LOD.inside + 1, 'the cap + the street person');
  assert(k.includes('out') && k.includes('in0') && !k.includes('in6'), 'the nearest station people, the street untouched');
});
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
  assert(Math.abs(streetPose(STREET.d1).pitch - (12 * Math.PI) / 180) < 1e-9, '~12° above the horizon');
  const P = streetPose(STREET.d1),
    behind = P.dist * Math.cos(P.pitch),
    above = P.up + STREET.head;
  assert(behind > 6 && behind < 8 && above > 2 && above < 3, `~7 m behind, eye level (${behind.toFixed(2)}, ${above.toFixed(2)})`);
  // T-369: over the shoulder — your whole figure (1.72 m) in the lower third, a little left of centre; the map has no lens shift
  {
    const THREE = require('three'),
      { setLens } = require('../js/map3d/mapcam3d.mjs'),
      cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.2, 900);
    cam.position.set(0, above, behind);
    cam.lookAt(0, STREET.head, 0);
    cam.updateMatrixWorld();
    setLens(cam, P.fov, ...P.lens);
    const feet = new THREE.Vector3(0, 0, 0).project(cam),
      head = new THREE.Vector3(0, 1.72, 0).project(cam);
    assert(feet.y > -1 && head.y < -1 / 3, `the figure in the lower third (feet ${feet.y.toFixed(2)}, head ${head.y.toFixed(2)})`);
    assert(head.x < 0 && head.x > -0.4, `left of centre (${head.x.toFixed(2)})`);
    const M = streetPose(DIST[0]);
    eq(M.fov, 40, 'the map keeps its lens');
    assert(!M.lens[0] && !M.lens[1], '… unshifted');
    setLens(cam, M.fov, ...M.lens);
    assert(!cam.view || !cam.view.enabled, 'the shift clears');
    // the stretch (owner 2026-10-26): the projection's aspect = the canvas's through a lens shift, a resize and back
    const pa = () => cam.projectionMatrix.elements[5] / cam.projectionMatrix.elements[0];
    for (const a of [16 / 9, 4 / 5, 2.4]) {
      cam.aspect = a;
      cam.updateProjectionMatrix();
      setLens(cam, P.fov, ...P.lens);
      assert(
        Math.abs(cam.aspect - a) < 1e-9 && Math.abs(pa() - a) < 1e-6,
        `a lens shift keeps the aspect ${a.toFixed(2)} (${pa().toFixed(3)})`
      );
      setLens(cam, P.fov, P.lens[0] * 0.5, P.lens[1] * 0.5);
      assert(Math.abs(pa() - a) < 1e-6, '… easing it too');
      cam.aspect = a * 1.3; // a resize mid-shift (map3d size())
      cam.updateProjectionMatrix();
      assert(Math.abs(pa() - a * 1.3) < 1e-6 && cam.view.enabled, '… a resize keeps the shift and takes the new aspect');
      setLens(cam, M.fov, ...M.lens);
      assert(Math.abs(pa() - a * 1.3) < 1e-6, '… and clearing it');
    }
  }
  // T-369: the street grade by time of day (warm morning, clear noon, orange-pink dusk, blue night), wrapping round midnight
  {
    const THREE = require('three'),
      { gradeAt, GRADE } = require('../js/map3d/look3d.mjs'),
      g = () => ({ gain: new THREE.Vector3(), lift: new THREE.Vector3(), sat: 1, con: 1, haze: new THREE.Color() }),
      at = h => gradeAt(h / 24, g());
    assert(
      GRADE.every((k, i) => !i || k.t > GRADE[i - 1].t),
      'keys in order'
    );
    const morning = at(7),
      noon = at(12),
      dusk = at(17.8),
      night = at(1);
    assert(morning.gain.x > morning.gain.z, 'morning is warm');
    assert(dusk.haze.r > dusk.haze.b && dusk.haze.r > dusk.haze.g, 'dusk is orange-pink');
    assert(night.haze.b > night.haze.r && night.gain.z > night.gain.x, 'night is blue');
    assert(noon.haze.b > noon.haze.r && Math.abs(noon.gain.x - noon.gain.z) < 0.1, 'noon is clear');
    const a = at(23.99),
      b = at(0.01);
    assert(Math.abs(a.gain.x - b.gain.x) < 1e-3 && Math.abs(a.haze.b - b.haze.b) < 1e-3, 'no jump at midnight');
  }
  // the occluder fade (T-369, fixed 2026-10-26): the lens zone and instances at the lens go outright, the line dissolves by a coarse 8 × 8 pattern
  {
    const THREE = require('three'),
      { streetMat, FD } = require('../js/map3d/look3d.mjs'),
      m = new THREE.MeshStandardMaterial(),
      sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    assert(streetMat(m) && !streetMat(m), 'patched once');
    m.onBeforeCompile(sh, null);
    assert(sh.uniforms.uFdLo === m.userData.fdBox.lo && sh.uniforms.uFdHi === m.userData.fdBox.hi, 'the instance box is per material');
    assert(m.userData.fdBox.lo.value.x > m.userData.fdBox.hi.value.x, 'empty until map3d gives it a box (never hidden whole)');
    assert(
      /USE_INSTANCING[\s\S]*inverse\(rm\)[\s\S]*gl_Position = vec4\(0\.0, 0\.0, -2\.0, 1\.0\)/.test(sh.vertexShader),
      'an instance at the lens is dropped whole'
    );
    assert(/length\(aw\) < [\d.]+ \* uFdK\) discard/.test(sh.fragmentShader), 'fragments right at the lens are discarded, not dithered');
    assert(
      !/mod\(floor\(gl_FragCoord\.xy\), 4\.0\)/.test(sh.fragmentShader) && /fdB8\(gl_FragCoord\.xy \/ 2\.0\)/.test(sh.fragmentShader),
      'the 4 × 4 screen door is gone'
    );
    // the 8 × 8 pattern as the shader computes it: 64 distinct levels, every 2 × 2 cell block spread over the range
    const fr = x => x - Math.floor(x),
      b2 = (x, y) => ((x = Math.floor(x)), (y = Math.floor(y)), fr(x * 0.5 + y * y * 0.75)),
      b8 = (x, y) => (b2(x / 4, y / 4) * 0.25 + b2(x / 2, y / 2)) * 0.25 + b2(x, y),
      lv = new Set();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) lv.add(Math.round(b8(x, y) * 64));
    eq(lv.size, 64, 'an 8 × 8 ordered pattern');
    assert(FD.ghost > 0.05 && FD.ghost < 0.3 && FD.inst > FD.lens, 'a faint ghost; instances go a little before fragments');
  }
  // a capsule district (the T-336a prototype's shape; still supported)
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
  // T-361: street level in every district — MapView's zone is all the land
  const src = require('fs').readFileSync(require('path').join(__dirname, '../js/ui/map-view.js'), 'utf8');
  assert(/ZONE: Object\.freeze\(\{ all: true \}\)/.test(src) && /zone: \(\) => MapView\.ZONE/.test(src), 'MapView.zone = everywhere');
  const all = zoneOf({ all: true });
  for (const p of [
    ...Object.values(g.SPOTS)
      .filter(s => s.at)
      .map(s => s.at),
    ...g.CITY.hq,
    ...Object.values(g.VENUES).map(v => v.at)
  ])
    assert(inZone(all, ...w(p)), `street level opens at ${p}`);
  eq(zoneDist(all, 0, 0), -Infinity, 'everywhere: always inside');
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
    'G,I,R,S,W',
    'walls, glass, roofs, rooms, the painted ground (T-370): one draw call each'
  );
  // T-370: the ring ground carries its paint kind (2 pavement slabs, 3 lane paint, 0 the kerb face); the roads their asphalt / dirt
  {
    const S = ring.find(o => o.userData.ring === 'S'),
      gk = S.geometry.attributes.gk,
      kinds = new Set();
    for (let v = 0; v < gk.count; v++) kinds.add(gk.getX(v));
    assert(
      [0, 2, 3].every(k => kinds.has(k)),
      `pavement, paint and kerb in the ring ground (${[...kinds]})`
    );
    assert(S.material.userData.ground && !S.castShadow, 'painted, no shadow draw');
    let RD = null;
    sc.traverse(o => o.isMesh && o.geometry.attributes.gk && !o.userData.ring && (RD = o));
    const rg = RD.geometry.attributes.gk;
    let asph = 0,
      edge = 0,
      dirt = 0;
    for (let v = 0; v < rg.count; v++) {
      if (rg.getX(v) === 1) asph++;
      if (rg.getX(v) === 4) dirt++;
      if (rg.getW(v) > 0) (edge++, assert(Math.abs(rg.getY(v)) === 1 && rg.getZ(v) >= 0, 'across ±1, m to the end ≥ 0'));
    }
    assert(
      asph > 1000 && edge > 0 && edge < asph && rg.count === RD.geometry.attributes.position.count,
      `asphalt ${asph}, edge-lined ${edge}, dirt ${dirt}`
    );
    // open ground: a main road and a lot are not, the middle of nowhere is
    const mr = m.land.roads.find(r => r.kind === 'main'),
      [ax, az] = mr.pts[0].map(v => v * 0.5),
      [bx, bz] = mr.pts[mr.pts.length - 1].map(v => v * 0.5),
      lot = m.land.lots.find(l => kit.lotFrame(l, 0));
    assert(!town.clear((ax + bx) / 2, (az + bz) / 2), 'a main road is not open ground');
    assert(!town.clear(lot.at[0] * 0.5, lot.at[1] * 0.5), 'a lot is not');
    assert(town.clear(-500, -500), 'off everything: open');
  }
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

// ---------- T-357: transport on the map (spec §4.42) ----------
test('map3d: transport — buses and the ferry on their timetable, stops and piers drawn, your ride; the avatar rides its legs (T-357)', () => {
  const THREE = require('three'),
    { createVehicles, onTimetable, VEHICLES } = require('../js/map3d/vehicles3d.mjs'),
    { createAvatar } = require('../js/map3d/avatar3d.mjs'),
    { load } = require('./harness'),
    g = load(5),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Map', mode: { story: false } }),
    m = g.MapModel.build(run),
    TT = m.transit.bus;
  eq(onTimetable({ ...TT, hours: 1 }, 3).length, 0, '03:00: no buses');
  eq(onTimetable({ ...TT, hours: 1 }, 8.25).length, 4, '08:15 on a 1 h line: the 07:30 and the 08:00 each way');
  eq(onTimetable({ ...m.transit.ferry }, 7).filter(v => v.u === 0).length, 2, 'the 07:00 ferry leaves both ends');
  const sc = new THREE.Scene(),
    V = createVehicles(sc, () => 0.5);
  V.sync(m);
  V.tick(0.016, 0, 1 + 8.25 / 24, null);
  const n = V.count();
  assert(n.buses > 0 && n.buses <= VEHICLES.cap.bus && n.fixed === 1, `Tue 08:15: buses out (${n.buses}), the stops / piers mesh`);
  V.tick(0.016, 0, 1 + 3 / 24, null);
  eq(V.count().buses + V.count().ferries, 0, 'at night: none');
  V.tick(0.016, 0, 1 + 9.2 / 24, { m: 'ferry', x: 10, z: 10, yaw: 0, v: 5 });
  assert(V.count().ferries > 0 && V.count().mine === 'ferry', 'the 09:00 ferry out; yours under you');
  V.dispose();
  // the avatar plays a ride's legs on their own clock: aboard the bus between, progress 0 → 1
  const A = createAvatar(new THREE.Scene());
  A.snap([0, 0]);
  A.setTarget([200, 0], null, {
    legs: [
      {
        m: 'walk',
        pts: [
          [0, 0],
          [20, 0]
        ],
        w: 1,
        a: 1,
        b: 1.1
      },
      {
        m: 'bus',
        pts: [
          [20, 0],
          [180, 0]
        ],
        w: 1.1,
        a: 1.15,
        b: 1.2
      },
      {
        m: 'walk',
        pts: [
          [180, 0],
          [200, 0]
        ],
        w: 1.2,
        a: 1.2,
        b: 1.25
      }
    ]
  });
  assert(A.busy() && A.progress() === 0, 'riding');
  const seen = new Set();
  let p0 = 0;
  for (let i = 0; i < 400 && A.busy(); i++) {
    A.tick(0.05, () => 0);
    const r = A.ride();
    seen.add(r ? r.m : 'walk');
    if (A.progress() !== null) (assert(A.progress() >= p0, 'never back'), (p0 = A.progress()));
  }
  assert(!A.busy() && seen.has('bus') && seen.has('walk'), `walked, rode, walked (${[...seen]})`);
  eq(A.pos().join(','), '100,0', 'arrived (map 200 → 100 m)');
  A.dispose();
});

// ---------- T-364: street level streams the near blocks (spec §4.37 6 Streaming) ----------
test('map3d streaming: the block grid, and the manager prepares the near blocks across frames, shows the ready part (walking never waits; an action prepares with the larger budget)', () => {
  const { blockGrid, createStream, STREAM } = require('../js/map3d/stream3d.mjs'),
    G = blockGrid(4000, 3000, 200, 200);
  eq(`${G.nx}x${G.nz}`, '20x15', 'blocks a side');
  eq(G.of(450, 250), 22, 'block of a point (j × nx + i)');
  eq(G.of(-5, 9999), 280, 'clamped to the grid');
  eq(G.dist(22, 450, 250), 0, 'inside: 0');
  eq(G.dist(23, 450, 250), 150, 'to the next block’s edge');
  const near = G.within(450, 250, 160);
  eq(near[0], 22, 'nearest first');
  const brute = [];
  for (let k = 0; k < 300; k++) if (G.dist(k, 450, 250) <= 160) brute.push(k);
  eq(
    near
      .slice()
      .sort((a, b) => a - b)
      .join(),
    brute.join(),
    'the blocks within r'
  );
  // fake layers record what they are asked
  const log = { prep: [], show: [] };
  let ver = 1;
  const L = [
    { id: 'a', ver: () => ver, prep: k => log.prep.push(k), show: s => log.show.push(s && [...s].sort((x, y) => x - y).join(',')) },
    { id: 'b', ver: () => 0, show: () => {} }
  ];
  const S = createStream(G, L),
    at = { cam: [450, 250], you: [450, 250], low: false, dt: 0.1 };
  let r = S.tick({ ...at, st: 0.3 });
  assert(!r.on && !log.prep.length && !log.show.length, 'the map view: nothing streamed, nothing hidden');
  const want = G.within(450, 250, STREAM.r),
    full = want
      .slice()
      .sort((x, y) => x - y)
      .join(',');
  r = S.tick({ ...at, st: 1 });
  assert(
    !r.wait && log.show.length === 1 && log.show[0].split(',').includes('22'),
    'your block prepared and drawn the first frame (the rest: its far version)'
  );
  let n = 0;
  do r = S.tick({ ...at, st: 1 });
  while (log.show[log.show.length - 1] !== full && ++n < 80);
  assert(log.show.length >= 2 && log.show[0] !== full && !r.wait, 'the rest prepared over the next frames, topped up as it grows');
  assert(log.prep.length <= (n + 2) * STREAM.per, 'walking: a few blocks a frame (the small budget)');
  eq(log.show[log.show.length - 1], full, 'then shown = the blocks within r, once all are ready');
  assert(S.near(450, 250) && !S.near(10, 590), 'your block drawn; a far one not');
  // walking within the near set: nothing re-shown; a jump far away draws your block at once, the rest as it gets ready
  const s0 = log.show.length;
  S.tick({ ...at, cam: [460, 250], you: [460, 250], st: 1 });
  eq(log.show.length, s0, 'no re-show while the near set is the same');
  r = S.tick({ ...at, cam: [3500, 2700], you: [3500, 2700], st: 1, dt: 0.2 });
  assert(!r.wait && S.near(3500, 2700) && log.show.length === s0 + 1, 'a jump: your block drawn the same frame, never a wait');
  n = 0;
  while (S.info().queue && ++n < 200) r = S.tick({ ...at, cam: [3500, 2700], you: [3500, 2700], st: 1, dt: 0.2 });
  assert(
    !r.wait && !r.busy && log.show[log.show.length - 1].split(',').length === G.within(3500, 2700, STREAM.r).length,
    'topped up to the full near set; never a wait'
  );
  // behind an automated action ('act'): the blocks within pre prepared with the larger budget; "Loading…" only after STREAM.wait s
  const s1 = log.show.length;
  ver = 2;
  r = S.tick({ ...at, cam: [3500, 2700], you: [3500, 2700], st: 1, dt: 0.1, boost: 'act' });
  assert(!r.busy && !r.wait && log.show.length === s1 + 1, 'an action: every block within pre prepared at once (no Loading)');
  ver = 3;
  r = S.tick({ ...at, cam: [3500, 2700], you: [3500, 2700], st: 1, dt: 0.1 });
  assert(r.busy && !r.wait, 'a walk with blocks left: busy, never a wait');
  S.tick({ ...at, st: 0.2 });
  eq(log.show[log.show.length - 1], null, 'back on the map: everything (show(null))');
  assert(!S.info().on && S.near(10, 590), 'not streaming');
  const [h0, h1] = S.haze(1, 160, 1060, false);
  eq(`${h0},${h1}`, '160,1060', 'the haze is the map’s own when not streaming');
});

test('map3d streaming: instanced packing and merged ranges keep the full set and give it back', () => {
  const THREE = require('three'),
    { pack, repack, ranges } = require('../js/map3d/stream3d.mjs'),
    m = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 5),
    M = new THREE.Matrix4(),
    c = new THREE.Color();
  for (let i = 0; i < 5; i++) (m.setMatrixAt(i, M.makeTranslation(i, 0, 0)), m.setColorAt(i, c.setRGB(i / 10, 0, 0)));
  pack(m, [3, 1]);
  eq(m.count, 2, 'drawn: the listed ones');
  m.getMatrixAt(0, M);
  eq(new THREE.Vector3().setFromMatrixPosition(M).x, 3, 'packed to the front');
  repack(m, () => m.setColorAt(1, c.setRGB(0.9, 0, 0)));
  m.getColorAt(1, c);
  eq(+c.r.toFixed(2), 0.9, 'a full-set write lands on its packed slot');
  pack(m, null);
  eq(m.count, 5, 'all again');
  m.getMatrixAt(4, M);
  eq(new THREE.Vector3().setFromMatrixPosition(M).x, 4, 'in their own order');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(30).fill(0), 3));
  ranges(g, [0, 3, 6, 9]);
  eq(`${[...g.index.array.slice(0, g.drawRange.count)]}`, '0,1,2,6,7,8', 'only the near ranges drawn');
  const I = g.index;
  ranges(g, [3, 6]);
  assert(g.index === I && g.drawRange.count === 3, 'one index, reused');
  ranges(g, null);
  assert(!g.index && g.drawRange.count === Infinity, 'the whole mesh again');
});

test('map3d streaming: the town draws its near lots in full and the Fast boxes beyond; nature its near instances and flat trees beyond; null = the map look', () => {
  const THREE = require('three'),
    { createTown } = require('../js/map3d/town3d.mjs'),
    { createNature } = require('../js/map3d/nature3d.mjs'),
    { blockGrid } = require('../js/map3d/stream3d.mjs'),
    m = townModel(),
    W = m.w * 0.5,
    D = m.h * 0.5,
    G = blockGrid(W, D, 192, 192),
    sc = new THREE.Scene(),
    town = createTown(sc, () => 1, { fast: () => false });
  town.sync(m);
  const g0 = m.land.landmarks.find(l => l.id === 'weiPower').at,
    near = new Set(G.within(g0[0] * 0.5, g0[1] * 0.5, 250)),
    T = town.layer(G);
  for (let k = 0; k < G.nx * G.nz; k++) T.prep(k);
  const parts = [];
  sc.traverse(o => o.isMesh && o.userData.town && parts.push(o));
  const Wm = parts.find(o => o.userData.town === 'W'),
    all = Wm.geometry.attributes.position.count;
  T.show(near);
  const n = Wm.geometry.drawRange.count,
    pos = Wm.geometry.attributes.position.array;
  assert(n > 1000 && n < all / 2, `walls drawn: the near blocks’ (${n} of ${all} vertices)`);
  let off = 0;
  for (let v = 0; v < n; v += 60) {
    const i = Wm.geometry.index.array[v];
    if (!near.has(G.of(pos[i * 3], pos[i * 3 + 2])) && G.dist(G.of(pos[i * 3], pos[i * 3 + 2]), g0[0] * 0.5, g0[1] * 0.5) > 400) off++;
  }
  eq(off, 0, 'nothing far off drawn in full');
  const boxes = [];
  sc.traverse(o => o.isInstancedMesh && o.parent.visible && boxes.push(o));
  const lots = m.land.lots.filter(l => require('../js/map3d/kit3d.mjs').KIT[l.kind]),
    nearLots = lots.filter(l => near.has(G.of(l.at[0] * 0.5, l.at[1] * 0.5))).length;
  eq(
    boxes.reduce((a, o) => a + o.count, 0),
    lots.length - nearLots,
    'the far version: a box for every lot beyond the near blocks'
  );
  T.show(null);
  assert(!Wm.geometry.index && Wm.geometry.drawRange.count === Infinity, 'the map look: the whole mesh');
  const shown = [];
  sc.traverse(o => o.isInstancedMesh && o.visible && o.parent.visible && shown.push(o));
  eq(shown.length, 0, 'no boxes on the map in the detailed look');
  town.dispose();
  // nature
  const sc2 = new THREE.Scene(),
    nat = createNature(sc2, () => 1);
  nat.sync(m, false);
  const N = nat.layer(G),
    inst = () => {
      const o = [];
      sc2.traverse(x => x.isInstancedMesh && x.visible && !x.userData.proxy && o.push(x));
      return o;
    },
    total = inst().reduce((a, o) => a + o.count, 0);
  for (let k = 0; k < G.nx * G.nz; k++) N.prep(k);
  N.show(near);
  const after = inst(),
    flatTrees = after.filter(o => o.userData.far);
  assert(after.reduce((a, o) => a + o.count, 0) < total, 'fewer instances drawn in full');
  assert(flatTrees.length >= 1 && flatTrees.every(o => o.count > 0), 'the far trees: flat shapes');
  N.show(null);
  eq(
    inst().reduce((a, o) => a + o.count, 0),
    total,
    'the map: every instance again, no far trees'
  );
  nat.dispose();
});

test('map3d streaming: a far terrain chunk is coarse, turned like the full grid, and keeps every vertex of its edge (no cracks)', () => {
  const { coarseIndex } = require('../js/map3d/terrain3d.mjs'),
    nx = 30,
    V = (i, j) => j * (nx + 1) + i,
    ij = v => [v % (nx + 1), Math.floor(v / (nx + 1))],
    turn = (a, b, e) => {
      const [ax, az] = ij(a),
        [bx, bz] = ij(b),
        [ex, ez] = ij(e);
      return Math.sign((bx - ax) * (ez - az) - (bz - az) * (ex - ax));
    },
    full = turn(V(0, 0), V(0, 1), V(1, 0)); // the full grid's triangle (a, d, b)
  // a chunk of 13 × 10 cells (a thin last column, an uneven last row) beside a full one
  const c = coarseIndex(nx, 4, 17, 2, 12),
    area = (a, b, e) => {
      const [ax, az] = ij(a),
        [bx, bz] = ij(b),
        [ex, ez] = ij(e);
      return Math.abs((bx - ax) * (ez - az) - (bz - az) * (ex - ax)) / 2;
    };
  let A = 0,
    bad = 0;
  for (let t = 0; t < c.length; t += 3) ((A += area(c[t], c[t + 1], c[t + 2])), turn(c[t], c[t + 1], c[t + 2]) !== full && bad++);
  eq(A, 13 * 10, 'covers the chunk exactly');
  eq(bad, 0, 'every triangle turned like the full grid (faces up)');
  assert(c.length / 3 < (13 * 10 * 2) / 2.5, `fewer triangles (${c.length / 3} for ${13 * 10 * 2})`);
  const used = new Set(c);
  let miss = 0;
  for (let i = 4; i <= 17; i++) for (const j of [2, 12]) used.has(V(i, j)) || miss++;
  for (let j = 2; j <= 12; j++) for (const i of [4, 17]) used.has(V(i, j)) || miss++;
  eq(miss, 0, 'every edge vertex kept: it meets a full chunk without cracks');
  const big = coarseIndex(nx, 0, 96 > nx ? nx : 96, 0, 24);
  assert(big.length / 3 < (nx * 24 * 2) / 4, 'a big chunk ≥ 4× lighter');
});

test('map3d: street level ground (T-370) — the painted texture tiles, the meadow is hashed, dense on grass, off roads', () => {
  const { groundBytes, GROUND } = require('../js/map3d/look3d.mjs'),
    { meadowTile, MEADOW } = require('../js/map3d/nature3d.mjs'),
    n = 64,
    B = groundBytes(n);
  eq(B.length, n * n * 4, 'RGBA');
  for (let c = 0; c < 4; c++) {
    let sum = 0,
      seam = 0,
      inner = 0;
    for (let i = 0; i < n * n; i++) sum += B[i * 4 + c];
    const mean = sum / (n * n * 255);
    assert(mean > 0.3 && mean < 0.65, `channel ${c}: a shade round 0.5 (${mean.toFixed(2)})`);
    // tileable: the wrap seam (last column → first) is no rougher than inside (asphalt, grass, paint; slabs have joints)
    if (c === 1) continue;
    for (let y = 0; y < n; y++) {
      seam += Math.abs(B[(y * n + n - 1) * 4 + c] - B[y * n * 4 + c]);
      inner += Math.abs(B[(y * n + n / 2) * 4 + c] - B[(y * n + n / 2 - 1) * 4 + c]);
    }
    assert(seam < inner * 2 + n * 4, `channel ${c} wraps (${seam} vs ${inner})`);
  }
  assert(GROUND.fade[0] < GROUND.fade[1], 'the detail fades out far off');
  const col = (x, z, o) => ((o[0] = 0.4), (o[1] = 0.6), (o[2] = 0.3), o),
    lawn = meadowTile(
      3,
      4,
      () => 1,
      () => true,
      col
    ),
    again = meadowTile(
      3,
      4,
      () => 1,
      () => true,
      col
    ),
    half = meadowTile(
      3,
      4,
      () => 0.6,
      () => true,
      col
    ),
    road = meadowTile(
      3,
      4,
      () => 1,
      x => x > 3.5 * MEADOW.tile,
      col
    ),
    bare = meadowTile(
      3,
      4,
      () => MEADOW.min,
      () => true,
      col
    );
  eq(lawn.join(), again.join(), 'hashed: the same tile twice');
  const k = lawn.length / 7,
    cells = Math.round(MEADOW.tile / MEADOW.cell) ** 2;
  assert(k > cells * MEADOW.dense * 0.75 && k < cells * MEADOW.dense * 1.25, `full grass: ~${MEADOW.dense} a cell (${k} of ${cells})`);
  assert(half.length / 7 < k * 0.55 && half.length > 0, 'thinner on mixed ground');
  eq(bare.length, 0, 'none on bare ground');
  for (let a = 0; a < lawn.length; a += 7)
    assert(
      lawn[a] >= 3 * MEADOW.tile && lawn[a] < 4 * MEADOW.tile && lawn[a + 1] >= 4 * MEADOW.tile && lawn[a + 1] < 5 * MEADOW.tile,
      'inside its tile'
    );
  for (let a = 0; a < road.length; a += 7) assert(road[a] > 3.5 * MEADOW.tile, 'none where the ground is not open');
});
