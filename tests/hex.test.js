// The war map's hex grid (geometry: tiles, units, the model's ground layer; spec §4.34 — the war rules are in war.test.js).
const { load, test, assert, eq } = require('./harness');

test('hex: the grid is deterministic, every place and HQ sits on a tile of its region (T-131)', () => {
  const g = load(3),
    G = g.Hex.grid(),
    by = {};
  for (const t of G.tiles) by[t.region] = (by[t.region] || 0) + 1;
  assert(G.tiles.length > 100 && by.wei > 20 && by.wu > 15 && by.shu > 30, 'tiles per region: ' + JSON.stringify(by));
  for (const [id, s] of Object.entries(g.SPOTS)) if (s.at && s.region) eq(g.Hex.ofSpot(id).region, s.region, 'place tile region: ' + id);
  g.CITY.hq.forEach((at, i) => {
    const t = G.tiles.find(x => x.hq.includes(i));
    assert(t && t.region === g.FACTIONS[i].region, 'HQ tile ' + i);
  });
  for (const t of G.tiles) eq(g.Hex.idAt(t.at), t.id, 'centre ↔ id');
  const h = JSON.stringify(G.tiles);
  // war units (spec §4.34): every major tile in one of its region's units; Gold ring-locked inside Iron; Wu split by coast
  for (const t of G.tiles)
    eq(t.unit ? g.WAR.units[t.unit].region : null, g.MAJORS.includes(t.region) ? t.region : null, 'unit region ' + t.id);
  for (const u of g.War.ids())
    assert(
      G.tiles.some(t => t.unit === u),
      'land for ' + u
    );
  g.CITY.hq.forEach((at, i) => {
    const u = g.War.ofClub(i);
    if (u) eq(G.tiles.find(x => x.hq.includes(i)).unit, u, 'HQ in its own unit ' + i);
  });
  g.Hex.cache = null;
  eq(JSON.stringify(g.Hex.grid().tiles), h, 'rebuilt the same');
});

test('map: borders — one closed border of straight runs per unit, the hot stretch is the week’s battle, banners on it; no hex tiles (T-317)', () => {
  const g = load(52),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Borders' });
  run.clash = null;
  let M = g.MapModel.build(run);
  assert(!('hexes' in M), 'no hex tiles in the model');
  eq(M.borders.lines.map(l => l.unit).join(), g.War.ids().join(), 'a border per unit');
  for (const L of M.borders.lines) {
    const O = g.Hex.outline(g.War.land(run, L.unit)),
      P = L.pts,
      bends = P.filter((p, i) => {
        const a = P[(i - 1 + P.length) % P.length],
          b = P[(i + 1) % P.length];
        return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
      }).length,
      gap = Math.max(...P.map((p, i) => Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1])));
    eq(O.length, 1, 'one closed loop: ' + L.unit);
    assert(
      bends >= 3 && bends < O[0].length / 2 && gap <= g.HEX.size / 4 + 1e-6 && L.color === run.teams[g.WAR.units[L.unit].clubs[0]].color,
      `straight runs (${bends} corners of ${O[0].length}), points ≤ HEX.size / 4 apart (${gap.toFixed(1)}), in its club colour: ` + L.unit
    );
  }
  assert(M.borders.hot === null && M.borders.banners.length === 0, 'calm: no hot stretch');
  const t = g.Front.site(run, 'shu', 'wei');
  run.clash = { tile: t.tile, from: t.from, at: t.at, att: 'shu', def: 'wei', seen: false, done: false };
  M = g.MapModel.build(run).borders;
  eq(M.hot.units.join(), [t.ua, t.ud].join(), 'the hot stretch is the battle’s border');
  const near = (p, L) => L.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < g.HEX.size);
  assert(
    M.hot.lines.some(L => near(t.at, L)),
    'the battle site sits on it'
  );
  assert(M.banners.length >= 2 && M.banners.every(b => b.at.length === 2 && b.face.length === 2), 'banners along it');
  eq(JSON.stringify(g.MapModel.build(run).borders), JSON.stringify(M), 'deterministic');
  // a destroyed unit's land joins its destroyer's border
  g.War.destroy(run, 'iron', 'harbor');
  const B = g.MapModel.build(run).borders;
  assert(
    !B.lines.some(l => l.unit === 'iron') && g.Hex.outline(g.War.land(run, 'harbor')).length === 1,
    'Harbor’s one border takes in Iron’s land'
  );
  assert(B.fall && B.fall.pin === 'hq1', 'the map pans to the fall');
});

test('hex: Hex.straight — fewer corners, every dropped one within tolerance of the line kept (owner, 2026-10-21)', () => {
  const g = load(3),
    seg = (p, a, b) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        L2 = dx * dx + dy * dy || 1,
        t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    },
    tol = g.HEX.size * 0.9,
    check = (P, S, closed, what) => {
      assert(S.length >= (closed ? 3 : 2) && S.length < P.length, `${what}: ${S.length} of ${P.length}`);
      const key = q => q.join(),
        kept = S.map(key);
      let j = 0;
      for (const k of kept)
        assert(
          P.some(q => key(q) === k),
          what + ': kept points are input points'
        );
      // walk the input; each point lies within tol of the straight run between the kept points around it
      const at = P.map(q => kept.indexOf(key(q)));
      const n = closed ? P.length : P.length - 1;
      for (let i = 0; i < n; i++) {
        if (at[i] >= 0) j = at[i];
        else {
          const a = S[j],
            b = S[(j + 1) % S.length];
          assert(seg(P[i], a, b) <= tol + 1e-9, `${what}: dropped corner ${i} is ${seg(P[i], a, b).toFixed(1)} off`);
        }
      }
    };
  // a hex-like zigzag along a straight line collapses to its ends
  const Z = [];
  for (let i = 0; i <= 20; i++) Z.push([i * 10, i % 2 ? tol * 0.6 : 0]);
  const zs = g.Hex.straight(Z, tol, false);
  eq(zs.length, 2, 'a zigzag inside the tolerance is one straight run');
  check(Z, zs, false, 'zigzag');
  // a real war border (closed loop)
  const run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Straight' });
  for (const u of g.War.ids()) {
    const O = g.Hex.outline(g.War.land(run, u))[0];
    if (O) check(O, g.Hex.straight(O), true, u);
  }
});
