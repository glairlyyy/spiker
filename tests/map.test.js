// The island: map model, world / town layout, faction dynamics, travel and access, dossier, venues.
const { load, test, assert, eq } = require('./harness');

test('career: map model — renderer-free data for the island map', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Map', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  const M = g.MapModel.build(run, 'pt:500,200');
  eq(M.w, g.CITY.w, 'map units');
  eq(M.land.regions.map(r => r.id).join(), 'wu,shu,wei', 'the three majors');
  assert(
    M.land.regions.every(r => /^#/.test(r.color) && r.poly.length > 3),
    'regions carry colour and outline'
  );
  assert(
    M.pins.every(p => p.id && p.at && p.at.length === 2 && p.title && p.flags),
    'pins are plain data'
  );
  assert(M.pins.some(p => p.id === 'home') && !M.pins.some(p => p.id === 'weiSpeed'), 'only what you know of is on the map');
  eq(M.flag.join(), '500,200', 'a picked point');
  eq(g.MapModel.ptId([499.6, 200.2]), 'pt:500,200', 'point ids round');
  eq(M.you.at.join(), g.CITY.airport.join(), 'you start at the airport');
  assert(JSON.parse(JSON.stringify(M)).pins.length === M.pins.length, 'serialisable (no DOM, no functions)');
});

test('map: nature — trees, rocks, grass and animals by biome, never on roads, lots or pads (spec §4.19c, T-223)', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Nat', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    N = g.MapModel.nature(run),
    W = g.MapModel.wild(run),
    by = k => N.filter(o => o.k === k);
  assert(N.length > 1000 && N.length < 5500, `a scattered island (${N.length})`);
  eq(JSON.stringify(N), JSON.stringify(((g.MapModel.natCache = null), g.MapModel.nature(run))), 'deterministic (hashes, no randoms)');
  assert(
    by('pine').every(o => g.City.regionAt(o.at) === 'shu' && g.reliefAt(o.at) <= g.NATURE.treeline),
    'pines: Shu, below the tree line'
  );
  assert(
    N.filter(o => g.reliefAt(o.at) > g.NATURE.treeline).every(o => ['rock', 'tuft', 'tea'].includes(o.k)), // (tea: the terraces)
    'scree above it'
  );
  assert(by('palm').length > 10 && by('palm').every(o => g.MapModel.onSand(o.at)), 'palms on the Wu sand');
  const lots = g.MapModel.lots(run),
    pads = g.MapModel.pads(),
    RN = g.ROADS.nodes,
    seg = (p, a, b) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
  assert(
    N.every(o => lots.every(l => Math.hypot(o.at[0] - l.at[0], o.at[1] - l.at[1]) >= l.size * 0.75 + 3)),
    'off the lots'
  );
  assert(
    N.every(o => pads.every(q => Math.hypot(o.at[0] - q.at[0], o.at[1] - q.at[1]) >= q.r + 4)),
    'off the level pads'
  );
  assert(
    N.filter(o => o.k !== 'broad').every(o => g.ROADS.edges.every(([a, b]) => seg(o.at, RN[a], RN[b]) >= 4)),
    'off the roads (street trees stand beside them)'
  );
  eq([...new Set(W.map(w => w.k))].sort().join(), 'bird,cat,deer,dog,gull,heron', 'the animals');
});

test('career: world layout — roads, routes, lots, landmarks', () => {
  const g = load(13),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Road', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    N = g.ROADS.nodes,
    at = (a, b) => a[0] === b[0] && a[1] === b[1];
  // every place / HQ / airport / home spot is a node at its own coordinates, on land, and reachable from the airport
  const want = { airport: g.CITY.airport };
  for (const [id, sp] of Object.entries(g.SPOTS)) if (sp.at) want[id] = sp.at;
  g.CITY.hq.forEach((p, i) => (want[`hq${i}`] = p));
  for (const [k, p] of Object.entries(g.HOME_AT)) want[`home:${k}`] = p;
  for (const [id, p] of Object.entries(want)) assert(N[id] && at(N[id], p), `node ${id} sits at its place`);
  const adj = {};
  for (const [a, b] of g.ROADS.edges) {
    assert(N[a] && N[b], `edge ${a}–${b} joins known nodes`);
    (adj[a] = adj[a] || []).push(b);
    (adj[b] = adj[b] || []).push(a);
  }
  const seen = new Set(['airport']),
    todo = ['airport'];
  while (todo.length) for (const v of adj[todo.pop()] || []) if (!seen.has(v)) (seen.add(v), todo.push(v));
  assert(
    Object.keys(N).every(id => seen.has(id)),
    'every node is reachable from the airport'
  );
  assert(
    Object.values(N).every(p => g.City.onLand(p)),
    'every node is on land'
  );
  // City.route: ends at the given points, interior only along edges; straight when both ends are closer to each other than to a node
  const edge = (a, b) => g.ROADS.edges.some(([x, y]) => (at(N[x], a) && at(N[y], b)) || (at(N[x], b) && at(N[y], a)));
  for (const [from, to] of [
    [g.CITY.airport, g.CITY.hq[4]],
    [
      [120, 300],
      [905, 400]
    ],
    [g.CITY.hq[0], g.CITY.airport],
    [
      [540, 500],
      [550, 505]
    ]
  ]) {
    const r = g.City.route(from, to);
    assert(at(r[0], from) && at(r[r.length - 1], to), 'a route starts and ends at the given points');
    const inner = r.slice(1, -1);
    for (let i = 1; i < inner.length; i++) assert(edge(inner[i - 1], inner[i]), 'and only uses edges between');
  }
  eq(g.City.route([540, 500], [550, 505]).length, 2, 'two close points: a straight line');
  eq(
    JSON.stringify(g.City.route(g.CITY.airport, g.CITY.hq[4])),
    JSON.stringify(g.City.route(g.CITY.airport, g.CITY.hq[4])),
    'same route twice'
  );
  // T-048: travel cost — roads are faster than the open ground, Shu mountain paths and highland ground are slower
  const RN = g.ROADS.nodes,
    dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [a, b] of [
    ['airport', 'harbor'],
    ['home:studio', 'trail'],
    ['dojo', 'cage'],
    ['hq0', 'sand']
  ]) {
    const P = g.City.path(RN[a], RN[b]);
    assert(P.cost <= g.City.ground(RN[a], RN[b]) + 1e-9, `${a}→${b}: never dearer than going cross-country`);
    assert(P.pts.length >= 2 && at(P.pts[0], RN[a]) && at(P.pts[P.pts.length - 1], RN[b]), `${a}→${b}: ends at the given points`);
  }
  assert(g.City.path(RN.airport, RN.harbor).cost < 0.8 * dd(RN.airport, RN.harbor), 'the coast road: well under the straight distance');
  assert(g.City.ground(RN.dojo, RN.trail) > dd(RN.dojo, RN.trail), 'highland ground costs more than its length');
  eq(g.City.path([540, 500], [550, 505]).cost, g.City.ground([540, 500], [550, 505]), 'two close points: the ground cost');
  // the map model: roads, lots, landmarks; no randoms; deterministic
  let draws = 0;
  const next = g.RNG.next;
  g.RNG.next = () => (draws++, next());
  const M = g.MapModel.build(run, null),
    M2 = g.MapModel.build(run, null);
  eq(draws, 0, 'MapModel.build draws no randoms');
  eq(JSON.stringify(M.land.lots), JSON.stringify(M2.land.lots), 'the same run gives identical lots');
  const L = M.land.lots;
  assert(L.length > 0 && L.length <= g.MapModel.maxLots, `lots: ${L.length} (1..${g.MapModel.maxLots})`);
  const places = [...Object.keys(g.SPOTS).map(id => g.City.at(run, id)), ...g.CITY.hq];
  assert(
    L.every(l => g.City.onLand(l.at)),
    'no lot in the water'
  );
  assert(
    L.every(l => places.every(p => Math.hypot(p[0] - l.at[0], p[1] - l.at[1]) >= g.MapModel.placeClear)),
    'no lot on a place'
  );
  assert(
    L.every(l => l.style && l.kind && Number.isFinite(l.rot) && l.size > 0),
    'lots are plain data'
  );
  eq(M.land.roads.length, g.ROADS.edges.length, 'one road polyline per edge');
  assert(
    M.land.roads.every(r => r.kind && r.pts.length >= 2),
    'roads carry kind and points'
  );
  const lm = M.land.landmarks;
  assert(
    Object.keys(g.SPOTS).every(id => lm.some(m => m.id === id && m.kind)) &&
      g.CITY.hq.every((p, i) => lm.some(m => m.id === `hq${i}` && m.kind === 'hq')),
    'every place and HQ has a landmark kind'
  );
  assert(JSON.parse(JSON.stringify(M)).land.lots.length === L.length, 'serialisable');
});

test('career: town layout — districts, beach, overpass, frozen borders', () => {
  const g = load(14),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Town', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    M = g.MapModel.build(run, null),
    C = g.CITY,
    N = g.ROADS.nodes;
  // no region border moved (the coast grew outward only)
  eq(
    JSON.stringify(
      [
        [160, 380],
        [450, 200],
        [520, 200],
        [900, 250],
        [700, 520],
        [620, 420],
        [495, 300],
        [505, 300],
        [860, 300],
        [900, 300],
        [700, 455],
        [700, 440],
        [440, 520],
        [430, 545],
        [640, 300],
        [815, 470],
        [690, 255],
        [800, 150]
      ].map(p => g.City.regionAt(p.map(v => v * g.MAP_SCALE))) // design units × MAP_SCALE
    ),
    JSON.stringify([
      'shu',
      'shu',
      'wei',
      'wu',
      'wu',
      'wei',
      'shu',
      'wei',
      'wei',
      'wu',
      'wei',
      'wei',
      'shu',
      'wu',
      'wei',
      'outlaws',
      'gloria',
      'wei'
    ]),
    'regionAt of fixed points is unchanged'
  );
  eq([C.w, C.h].join('x'), `${1060 * g.MAP_SCALE}x${700 * g.MAP_SCALE}`, 'the map frame grew (× MAP_SCALE)');
  eq(
    JSON.stringify(C.weiWu.slice(0, 3)),
    JSON.stringify(
      [
        [854, 199],
        [883, 305],
        [850, 412]
      ].map(p => p.map(v => v * g.MAP_SCALE))
    ),
    'the Wei–Wu line is frozen'
  );
  // every place / HQ / home is on land and in its region
  const spots = Object.entries(g.SPOTS).filter(([, s]) => s.at && s.region),
    homes = Object.entries(g.HOME_AT).map(([k, p]) => [`home:${k}`, p, g.HOUSING[k].region]);
  for (const [id, s] of spots) assert(g.City.onLand(s.at) && g.City.regionAt(s.at) === s.region, `${id} stands in ${s.region}`);
  C.hq.forEach((p, i) => assert(g.City.onLand(p) && g.City.regionAt(p) === g.FACTIONS[i].region, `hq${i} stands in its region`));
  for (const [id, p, r] of homes) assert(g.City.onLand(p) && g.City.regionAt(p) === r, `${id} stands in ${r}`);
  // the beach: sand places between the dunes and the coast, Wu town inland (≥ 40 units from the dune line)
  for (const id of ['sand', 'pier', 'bonfire', 'dunes']) assert(g.MapModel.onSand(g.SPOTS[id].at), `${id} is on the sand`);
  // Central Academy (spec §4.18e): its tile + the ring round it; the student flat stands in the ring, the gym too
  const acaT = g.Hex.grid().tiles.filter(t => t.kind === 'academy'),
    mid = g.Hex.idAt([C.park.x, C.park.y]);
  eq(acaT.length, 7, 'the Academy is seven tiles');
  assert(
    acaT.every(t => g.Hex.dist(t.id, mid) <= 1 && !t.unit),
    'all within a step of its middle, out of the war'
  );
  for (const p of [g.HOME_AT.studio, g.SPOTS.acaGym.at])
    eq(g.Hex.dist(g.Hex.idAt(p), mid), 1, 'the student flat and the gym stand in the ring');
  const dist = (p, line) => {
    let best = Infinity;
    for (let i = 0; i + 1 < line.length; i++) {
      const [a, b] = [line[i], line[i + 1]],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
    }
    return best;
  };
  for (const p of [g.SPOTS.hotelWu.at, C.hq[3]])
    assert(!g.MapModel.onSand(p) && dist(p, C.dunes) >= 40, 'Wu town places sit 40+ units inland');
  assert(g.MapModel.onSand(N.resort) && g.MapModel.onSand(N.jBw3), 'the boardwalk runs over the sand');
  eq(M.land.dunes.length, 7, 'land.dunes is the dune line');
  eq(JSON.stringify(C.beach), JSON.stringify(C.coast.slice(6, 13)), 'the beach is the new coast points 6–12');
  // roads: the boardwalk and the overpass (2–4 edges), all of it on land
  const kinds = k => g.ROADS.edges.filter(e => e[2] === k);
  assert(kinds('boardwalk').length >= 4, 'a boardwalk');
  assert(kinds('overpass').length >= 2 && kinds('overpass').length <= 4, 'an overpass of 2–4 edges');
  for (const [a, b] of g.ROADS.edges)
    for (let t = 0; t <= 1; t += 0.05)
      assert(g.City.onLand([N[a][0] + (N[b][0] - N[a][0]) * t, N[a][1] + (N[b][1] - N[a][1]) * t]), `road ${a}–${b} stays on land`);
  // districts and the ritual ground
  assert(
    M.land.districts.length === g.DISTRICTS.length && M.land.districts.every(d => d.poly.length >= 3 && d.style),
    'districts are plain polygons'
  );
  const rit = M.land.landmarks.find(l => l.id === 'ritual');
  assert(rit && rit.kind === 'ritual' && !M.pins.some(p => p.id === 'ritual'), 'a ritual landmark with no pin');
  assert(!M.land.labels.some(l => l.id === 'ritual'), 'and no label');
  // lots: per-region counts near the targets (±20 %), never in the water / on a road / in another region / on the sand (but the beach)
  const L = M.land.lots,
    by = {},
    flat = g.ROADS.edges.filter(e => e[2] !== 'overpass');
  for (const l of L) by[g.City.regionAt(l.at)] = (by[g.City.regionAt(l.at)] || 0) + 1;
  for (const [r, n, lo, hi] of [
    ['wei', 1119, 895, 1343], // (island × 4.5, owner 2026-10-23: the towns spread × 2, their lot grid × 1.6 — LOT_SPREAD)
    ['wu', 462, 370, 554],
    ['shu', 151, 121, 181],
    ['outlaws', 103, 82, 124],
    ['open', 272, 218, 326],
    ['gloria', 48, 38, 58]
  ])
    assert(by[r] >= lo && by[r] <= hi, `${r} has ${by[r]} lots (~${n})`);
  assert(
    L.length <= g.MapModel.maxLots && L.every(l => g.City.onLand(l.at) && l.h >= 0 && l.h <= 1 && l.district),
    'lots: on land, with h and a district'
  );
  assert(
    L.every(l => g.MapModel.onSand(l.at) === (l.district === 'wu-beach')),
    'only the beach district stands on the sand'
  );
  assert(
    L.every(l => flat.every(([a, b]) => dist(l.at, [N[a], N[b]]) >= l.size * 0.5 + 3.9)),
    'no lot on a road (the overpass is elevated)'
  );
  // the living island (spec §4.19a): each district built, with its jobs' kinds; homes where they belong
  for (const d of g.DISTRICTS) assert(L.filter(l => l.district === d.id).length >= 5, `${d.id} is built`);
  for (const [id, k] of [
    ['wei-civic', 'office'],
    ['wei-works', 'tank'],
    ['wei-works', 'stack'],
    ['wei-ring-east', 'apartment'],
    ['wu-harbor', 'container']
  ])
    assert(
      L.some(l => l.district === id && l.kind === k),
      `${id} has a ${k}`
    );
  // ground use (§4.19a): patches on land, plain polygons; no building on fields, terraces, parks, water or the quarry
  assert(
    M.land.ground.length === g.GROUND.length && g.GROUND.every(q => g.City.onLand([q.poly.x, q.poly.y])),
    'ground patches are on land'
  );
  assert(!L.some(l => g.MapModel.kept(l.at)), 'no lot on kept ground');
  for (const k of ['terrace', 'paddy', 'field', 'park', 'water', 'quarry', 'yard', 'quay'])
    assert(
      g.GROUND.some(q => q.kind === k),
      `some ${k}`
    );
  // city life (§4.19a): every line drives along road edges and comes back; boats stay at sea; the plane rolls down the runway
  const T = M.life.traffic,
    edge = (a, b) => g.ROADS.edges.some(([u, v]) => (u === a && v === b) || (u === b && v === a));
  assert(
    g.TRAFFIC.lines.every(l => l.nodes.every((id, i) => !i || edge(l.nodes[i - 1], id))),
    'traffic lines follow the roads'
  );
  assert(
    T.lines.every(l => l.pts[0].join() === l.pts[l.pts.length - 1].join()),
    'and are closed loops'
  );
  assert(
    T.lines.find(l => l.id === 'van-overpass').pts.some(p => p[2] === 1),
    'the vans take the overpass'
  );
  assert(
    T.boats.every(b =>
      Array.from({ length: 16 }, (_, i) => [b.at[0] + b.r * Math.cos(i / 2.5), b.at[1] + b.r * Math.sin(i / 2.5)]).every(
        p => !g.City.onLand(p)
      )
    ),
    'boats stay at sea'
  );
  assert(g.MapModel.inAirport(T.plane.from) && g.MapModel.inAirport(T.plane.lift), 'the plane rolls on the airport');
  const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert(dd(g.HOME_AT.condo, g.WEALTH.weiCore) < (100 * g.MAP_SCALE) / g.MAP_BASE, 'the Luxury condo stands by the civic core');
  assert(dd(g.HOME_AT.dorm, g.ROADS.nodes.jW1) < 100 * g.MAP_SCALE, 'the City dorm stands by the training district');
  const down = L.filter(l => l.district === 'wei-downtown');
  assert(down.length > 20 && Math.max(...down.map(l => l.h)) > 0.8, 'downtown grows tall');
  // wealth (spec §4.19): 0–1 per lot; Wei falls off steadily from the downtown core, Old Town poor; Wu even and modest
  assert(
    L.every(l => l.wealth >= 0 && l.wealth <= 1),
    'wealth is 0–1'
  );
  const avg = f => {
      const a = L.filter(f).map(l => l.wealth);
      return a.reduce((x, y) => x + y, 0) / a.length;
    },
    core = g.WEALTH.weiCore,
    ring = (a, b) =>
      avg(
        l =>
          g.City.regionAt(l.at) === 'wei' &&
          l.district !== 'wei-oldtown' &&
          Math.hypot(l.at[0] - core[0], l.at[1] - core[1]) >= a * g.MAP_SCALE &&
          Math.hypot(l.at[0] - core[0], l.at[1] - core[1]) < b * g.MAP_SCALE
      );
  assert(
    ring(0, 70) > ring(70, 140) && ring(70, 140) > ring(140, 210) && ring(140, 210) > ring(210, 999),
    'Wei wealth falls steadily outward'
  );
  assert(ring(0, 70) > 0.75 && ring(210, 999) < 0.3, 'rich downtown, shabby edges');
  assert(Math.max(...L.filter(l => l.district === 'wei-oldtown').map(l => l.wealth)) <= g.WEALTH.oldtown, 'Old Town is poor');
  const wuW = L.filter(l => g.City.regionAt(l.at) === 'wu').map(l => l.wealth);
  assert(Math.min(...wuW) >= 0.4 && Math.max(...wuW) <= 0.6, 'Wu is even and modest');
  assert(
    avg(l => l.district === 'gloria') > 0.9 && avg(l => g.City.regionAt(l.at) === 'outlaws') < 0.1,
    'Gloria rich, the Outlaws poorest'
  );
  assert(avg(l => g.City.regionAt(l.at) === 'shu') < 0.3, 'Shu is poor');
  assert(
    down.every(l => l.h === l.wealth) &&
      L.filter(l => !['wei-downtown', 'wei-civic'].includes(l.district)).every(l => Math.abs(l.h - l.wealth * 0.4) < 0.01),
    'h = wealth downtown, wealth × 0.4 elsewhere'
  );
  // Wu is weakly connected: four settlements, joined by few links (≤ 2 into each), only the coast road `main`
  const cl = {
    sand: 'b',
    pier: 'b',
    bonfire: 'b',
    airport: 'b',
    'home:studio': 'b',
    resort: 'b',
    hq3: 't',
    hotelWu: 't',
    jWu1: 't',
    harbor: 'h',
    hq2: 'h',
    dunes: 'h',
    jWu2: 'h',
    wuVillage: 'v'
  };
  for (const k of Object.keys(N)) if (/^jBw/.test(k)) cl[k] = 'b';
  const into = {};
  for (const [a, b, k] of g.ROADS.edges)
    if (cl[a] && cl[b] && cl[a] !== cl[b]) {
      for (const c of [cl[a], cl[b]]) into[c] = (into[c] || 0) + 1;
      assert(
        k === 'dirt' || (k === 'main' && [a, b].every(n => ['hotelWu', 'jWu1', 'jWu2'].includes(n))),
        `Wu link ${a}–${b} is dirt (or the coast road)`
      );
    }
  assert(Object.values(into).every(n => n <= 2) && into.v === 1, 'at most 2 links into each Wu settlement');
  assert(
    g.MapModel.districtPoly(g.DISTRICTS.find(d => d.id === 'wu-village')).every(q => g.City.regionAt(q) === 'wu'),
    'the Wu village stands inland in Wu'
  );
});

test('career: map model life — people, crews, battle, borders, no randoms', () => {
  const g = load(12),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Life', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    next0 = g.RNG.next;
  let draws = 0;
  g.RNG.next = () => (draws++, next0());
  const mate = g.Run.mates(run)[0];
  run.floor = { wit: [mate.id] };
  const fm = L0 => L0.people.find(p => p.id === mate.id);
  let L = g.MapModel.build(run).life;
  assert(!fm(L) || fm(L).spot !== 'weiWit', 'an unexplored training place shows no floor mate');
  eq(L.crews.length, 0, 'unexplored clubs show no crews');
  eq(L.battle, null, 'no battle yet');
  run.fog.push(g.City.at(run, 'weiWit'));
  L = g.MapModel.build(run).life;
  eq(fm(L) && fm(L).spot, 'weiWit', 'a floor mate stands at their floor key’s place once explored');
  assert(
    Math.hypot(fm(L).at[0] - g.City.at(run, 'weiWit')[0], fm(L).at[1] - g.City.at(run, 'weiWit')[1]) <= g.LIFE.spotR[1] + 0.1,
    'offset around it'
  );
  eq(fm(L).g, 'mate', 'a teammate');
  const hq = g.CITY.hq.findIndex((p, i) => i !== run.team && g.FRONT && g.FACTIONS[i]);
  run.fog.push(g.CITY.hq[hq]);
  L = g.MapModel.build(run).life;
  const cr = L.crews.find(c => c.team === hq);
  assert(cr && cr.n >= 2 && cr.n <= 6 && !cr.known && cr.walk.length === 0, 'an unscouted crew: grey, no walk');
  run.scout = run.scout || {};
  run.scout[hq] = 1;
  L = g.MapModel.build(run).life;
  assert(L.crews.find(c => c.team === hq).known, 'scouted: coloured');
  const tg = g.Front.site(run, 'wei', 'wu');
  run.clash = { tile: tg.tile, from: tg.from, att: 'wei', def: 'wu', seen: false, done: false };
  L = g.MapModel.build(run).life;
  assert(L.battle && L.battle.colors.length === 2 && L.battle.at.length === 2, 'the open battle');
  run.clash.done = true;
  eq(g.MapModel.build(run).life.battle, null, 'gone once done');
  eq(JSON.stringify(g.MapModel.build(run).life), JSON.stringify(g.MapModel.build(run).life), 'same run, same model');
  eq(draws, 0, 'build draws no randoms');
  g.RNG.next = next0;
});

test('map: people you can see — plans, fog, cap, groups, deterministic (spec §4.37 1, T-331)', () => {
  const g = load(13),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Seen', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    next0 = g.RNG.next;
  let draws = 0;
  g.RNG.next = () => (draws++, next0());
  run.floor = {};
  const homes = g.People.homes(run),
    near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r + 0.1;
  let P = g.MapModel.lifePeople(run);
  assert(
    P.every(p => g.City.seen(run, p.spot ? g.City.at(run, p.spot) : g.MapModel.homeAt(run, homes.get(p.id)))),
    'fog: only people whose place you have explored'
  );
  const n0 = P.length;
  for (const id of Object.keys(g.SPOTS)) if (g.SPOTS[id].at) run.fog.push(g.City.at(run, id));
  run.fog.push(...g.CITY.hq);
  P = g.MapModel.lifePeople(run);
  assert(P.length > n0 && P.length >= 40, `exploring shows more people (${n0} → ${P.length})`);
  eq(JSON.stringify(P), JSON.stringify(g.MapModel.lifePeople(run)), 'deterministic');
  eq(draws, 0, 'no randoms');
  // where their week's plan puts them
  const tr = P.find(p => p.act === 'train' && homes.get(p.id) && g.People.plan(run, homes.get(p.id).p).at === p.spot);
  assert(tr && near(tr.at, g.City.at(run, tr.spot), g.LIFE.spotR[1]), 'a training person at their plan’s place');
  const want = p => {
      const e = homes.get(p.id),
        pl = g.People.plan(run, e.p, e.home);
      return pl.at || g.LIFE.gym[e.home] || null;
    },
    mate = P.find(p => p.g === 'mate' && (p.act === 'train' || p.act === 'hard'));
  assert(
    mate && mate.spot && mate.spot === want(mate) && near(mate.at, g.City.at(run, mate.spot), g.LIFE.spotR[1]),
    'a training teammate at their plan’s place'
  );
  const hu = P.find(p => p.act === 'hustle');
  assert(hu && ['street', 'sand'].includes(hu.spot), 'a hustle at a court');
  const re = P.find(p => p.act === 'rest' || p.act === 'out');
  assert(!re || (re.spot === null && near(re.at, g.MapModel.homeAt(run, homes.get(re.id)), g.LIFE.homeR[1])), 'rest: at home');
  assert(
    P.every(p => near(p.home, g.MapModel.homeAt(run, homes.get(p.id)), g.LIFE.homeR[1])),
    'everyone has a home round their anchor'
  );
  // groups: teammates in your club's colour, unscouted clubs grey, a scouted club coloured
  assert(
    P.filter(p => p.g === 'mate').every(p => p.color === g.Run.myTeam(run).color),
    'teammates: your club colour'
  );
  const grey = P.find(p => p.g === 'grey'),
    ti = run.teams.indexOf(homes.get(grey.id).t);
  run.scout = { ...(run.scout || {}), [ti]: 1 };
  eq(g.MapModel.lifePeople(run).find(p => p.id === grey.id).g, 'other', 'scouted: no longer grey');
  // the cap: your circle first, then teammates
  const friend = P.find(p => p.g !== 'mate');
  g.Rel.push(run, g.Rel.key(run.youId, friend.id), friend.id, 'event', 60, friend.id);
  const C = g.MapModel.lifePeople(run, 5);
  eq(C.length, 5, 'capped');
  if (g.Circle.of(run).includes(friend.id)) eq(C[0].id, friend.id, 'your circle first');
  assert(
    C.slice(g.Circle.of(run).length).every(p => p.g === 'mate'),
    'then your teammates'
  );
  assert(g.MapModel.lifePeople(run).length <= g.LIFE.max, 'at most LIFE.max');
  assert(g.MapModel.build(run).life.people.length === g.MapModel.lifePeople(run).length, 'the model carries them');
  g.RNG.next = next0;
});

test('map: the day clock — the real hour (spec §4.41), the walk and the order, a sleep through the night (T-332, T-352)', () => {
  const g = load(14),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Clock', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.mode.story = false;
  run.clock = g.City.freshClock();
  run.dayLog = [];
  eq(g.MapModel.clock(run), +(g.DAY.wake / 24).toFixed(4), 'a fresh week: 07:00');
  const seq = [g.MapModel.weekTime(run)];
  for (let d = 0; d < g.WEEK_DAYS; d++) {
    const far = 'acaGym';
    run.sta = run.staMax;
    assert(g.City.day(run, far, false, null, 2), `day ${d + 1}: a session`);
    for (const k of [0, 0.5, 1]) seq.push(g.MapModel.weekTime(run, 'walk', k));
    for (const k of [0, 0.5, 1]) seq.push(g.MapModel.weekTime(run, 'order', k));
    seq.push(g.MapModel.weekTime(run));
    const o = g.MapModel.clock(run, 'order', 1);
    eq(o, +((g.City.hour(run) % 24) / 24).toFixed(4), `day ${d + 1}: the order ends at the hour now`);
    assert(g.City.day(run, 'home', false, null, 8), 'home to sleep');
    seq.push(g.MapModel.weekTime(run, 'order', 0.5), g.MapModel.weekTime(run));
  }
  assert(
    seq.every((w, i) => !i || w >= seq[i - 1] - 1e-9),
    `monotonic through the week: ${seq.map(w => w.toFixed(2)).join(' ')}`
  );
  assert(g.City.night(run), 'the week spent after the 7th sleep');
  const T = g.MapModel.time(run);
  assert(T.idle === g.MapModel.weekTime(run) && T.keys.length > 4, 'the model carries the times and the light keys');
  assert(T.order[1] > T.order[0], 'the last sleep runs through the night');
  assert(T.keys.every((k, i) => !i || k.t > T.keys[i - 1].t) && T.keys.some(k => k.lit === 1), 'keys in order, night lit');
});

test('orders: facilities = kit — every training place ≥ 2 orders, Work pays at ≥ 4, Stretch anywhere; the level grows per place (T-308)', () => {
  const g = load(78),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Kit' });
  run.event = null;
  run.mode.story = false;
  const kitted = Object.keys(g.SPOTS).filter(id => g.SPOTS[id].kit);
  eq(kitted.length, 16, 'the 16 training places carry a kit');
  for (const id of kitted) {
    const s = g.SPOTS[id];
    assert(g.City.orders(id).length >= 2, `${id}: ${g.City.orders(id).join(',')}`);
    assert(g.TRAININGS[s.train] && s.train === g.KITS[s.kit[0]].train, `${id} keeps its lead training (${s.train})`);
    assert(g.DAY_ORDERS[g.City.lead(id)].kind === 'drill', `${id} leads with a drill`);
  }
  const work = kitted.filter(id => g.City.orders(id).some(o => g.DAY_ORDERS[o].kind === 'work'));
  assert(work.length >= 4, `Work at ${work.join(', ')}`);
  for (const id of ['home', 'park']) assert(g.City.orders(id).includes('stretch'), `Stretch at ${id}`);
  for (const o of Object.values(g.DAY_ORDERS)) assert(o.kind !== 'work' || (o.pay > 0 && !o.price), `${o.name}: Work pays, costs nothing`);
  // Work pays; a drill costs; Stretch is free and works at any point
  run.money = 100;
  run.sta = 100;
  run.clock = g.City.freshClock();
  run.pos = g.City.at(run, 'harbor').slice();
  const m0 = run.money,
    you = g.Run.you(run),
    str0 = you.body.str;
  assert(g.City.day(run, 'harbor', false, 'haul', 2), 'hauling crates');
  eq(run.money, m0 + g.DAY_ORDERS.haul.pay, 'Work pays (2 h: an old day’s pay)');
  assert(you.body.str > str0, 'and trains the body');
  eq(run.uses.harbor, g.HOURS.unit, 'the facility counts per place (2 h = HOURS.unit of an old day session)');
  const m1 = run.money;
  run.sta = run.staMax;
  assert(g.City.day(run, 'harbor', false, 'heavy', 3), 'heavy sets, 3 h');
  eq(run.money, m1 - g.City.price(run, 'harbor', 'heavy', 3), 'a drill costs');
  eq(run.uses.harbor, +(g.HOURS.unit + g.Training.units(3)).toFixed(2), 'any order there levels the place, by its hours');
  assert(!g.City.can(run, 'harbor', 'mobility').ok, 'no order the kit does not bring');
  run.uses.harbor = 26;
  eq(g.Training.facility(run, 'harbor'), 4, 'Lv 5 after 26 days at the place');
  eq(g.Training.facility(run, 'stone'), 0, 'another weights place stays Lv 1');
  eq(g.Training.facility(run, 'power'), 4, 'a training key reads its best place (the dossier)');
  run.clock = g.City.freshClock();
  const p = g.City.at(run, 'trail'),
    flex0 = you.body.flex,
    d0 = g.City.days(run),
    tr = g.City.trip(run, p);
  assert(g.City.pointCan(run, p).ok, 'Stretch at a map point');
  assert(g.City.pointDay(run, p), 'stretched up in the hills');
  assert(
    you.body.flex > flex0 && g.City.days(run) === d0 && g.City.hour(run) === g.DAY.wake + tr + 1,
    'Flexibility up, the walk + 1 h spent'
  );
  eq(run.money, m1 - g.City.price(run, 'harbor', 'heavy', 3), 'Stretch is free');
  run.clock = g.City.freshClock();
  assert(g.City.day(run, 'home', false, 'stretch', 2) && run.clock.log[run.clock.log.length - 1].label === 'Stretch', 'Stretch at home');
});

test('map: Stretch at every place — outings, hotels, secret places, venues, HQs (spec §4.33, T-355)', () => {
  const g = load(355),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Gym' });
  run.event = null;
  run.mode.story = false;
  for (const id of Object.keys(g.SPOTS)) assert(g.City.orders(id).includes('stretch'), `Stretch at ${id}`);
  const you = g.Run.you(run);
  run.fans = 1e6; // the Old Scout is on your map
  for (const id of ['noodles', 'hotelWu', 'oldScout', 'cargo']) {
    run.clock = g.City.freshClock();
    run.sta = run.staMax;
    run.pos = g.City.at(run, id).slice();
    const m0 = run.money,
      f0 = you.body.flex,
      c = g.City.can(run, id, 'stretch', 2);
    assert(c.ok, `${id}: ${c.why}`);
    assert(g.City.day(run, id, false, 'stretch', 2), `stretched at ${id}`);
    const b = run.clock.log[run.clock.log.length - 1];
    assert(
      you.body.flex > f0 && run.money === m0 && b.label === 'Stretch' && g.City.hour(run) === g.DAY.wake + 2,
      `${id}: free, Flex up, 2 h`
    );
    assert(!(run.uses || {})[id], `${id}: no facility level`);
  }
  for (const [what, p] of [
    ['venue', g.VENUES.arena.at],
    ['HQ', g.CITY.hq[0]]
  ]) {
    run.clock = g.City.freshClock();
    run.pos = p.slice();
    const f0 = you.body.flex;
    assert(g.City.pointCan(run, p, 'stretch', 3).ok && g.City.pointDay(run, p, 'stretch', 3), `stretched at a ${what}`);
    assert(you.body.flex > f0 && g.City.hour(run) === g.DAY.wake + 3, `${what}: Flex up, 3 h`);
  }
});

test('map: a training place’s pin shows 1–3 body glyphs of what it trains best; its landmark carries its kit (T-310)', () => {
  const g = load(79),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Pins' });
  for (const id of Object.keys(g.SPOTS)) run.fog.push(g.City.at(run, id).slice()); // everything explored
  const pins = g.MapModel.build(run, null).pins,
    glyphs = new Set([...g.BODY.keys.map(k => g.BODY.glyph[k]), g.GLOSSARY.wit.glyph]);
  for (const id of Object.keys(g.SPOTS).filter(i => g.SPOTS[i].kit && !g.SPOTS[i].secret)) {
    const p = pins.find(q => q.id === id);
    assert(p, `${id} pinned`);
    assert(p.glyphs.length >= 1 && p.glyphs.length <= 3 && p.glyphs.every(x => glyphs.has(x)), `${id}: ${p.glyphs.join('')}`);
  }
  assert(
    pins.filter(p => p.kind === 'spot' && !g.SPOTS[p.id].kit).every(p => !p.glyphs.length),
    'no glyphs without a kit'
  );
  eq(g.MapModel.trains('harbor').join(','), 'str', 'the Harbor builds Strength');
  eq(g.MapModel.trains('steps').join(','), 'str,agi', 'the Steps: Strength + Agility');
  const lm = g.MapModel.landmarks(run);
  eq(lm.find(l => l.id === 'harbor').kit.join(','), 'weights,crates', 'the Harbor landmark carries racks and crates');
  assert(
    lm.filter(l => g.SPOTS[l.id] && g.SPOTS[l.id].kit).every(l => l.kit.length),
    'every kit place shows its kit'
  );
});

test('career: island map — regions, prices, quality, far trips, outings, scouting, 7-day weeks, saved', () => {
  const g = load(77),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Mapper', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  eq(run.teams.map(t => t.name).join(','), g.FACTIONS.map(f => f.team[0]).join(','), 'league teams play as faction squads');
  for (const id of Object.keys(g.SPOTS)) {
    const s = g.SPOTS[id];
    assert(
      s.train ? g.TRAININGS[s.train] : ['rest', 'rec', 'ramen', 'arcade', 'street', 'cargo', 'ride', ...g.Secret.acts].includes(s.act), // (cargo: the Ref drone, §4.38; ride: the Harbor Market, §4.42)
      `${id} does something`
    );
    assert(s.region === null || g.REGIONS[s.region], `${id} region`);
  }
  for (const k of g.TRAINK) assert(g.City.spotsFor(k).length >= 2, `several places for ${k} training`);
  // prices follow the regions; Wei may be overhyped, Shu may be a gem, others as advertised
  const u2 = g.Training.units(2);
  eq(
    g.City.price(run, 'weiPower'),
    Math.round(g.TRAIN_FEE * g.DAY_ORDERS.heavy.price * 2 * u2),
    'Wei costs double (the lead drill, Heavy sets, 2 h)'
  );
  eq(g.City.price(run, 'stone'), Math.round((g.TRAIN_FEE * g.DAY_ORDERS.heavy.price * u2) / 2), 'Shu costs half');
  eq(
    g.City.price(run, 'weiPower', 'heavy', 4),
    Math.round(g.TRAIN_FEE * g.DAY_ORDERS.heavy.price * 2 * g.Training.units(4)),
    '4 h cost twice 2 h'
  );
  for (const id of Object.keys(run.spotQ)) {
    const Q = run.spotQ[id],
      r = g.SPOTS[id].region;
    if (r === 'wei') assert(!Q.known && (Q.q === 1.25 || (Q.q === 1 && Q.tag === 'overhyped')), `${id} premium or overhyped`);
    else if (r === 'shu') assert(!Q.known && (Q.q === 0.8 || (Q.q === 1.25 && Q.tag === 'gem')), `${id} rough or gem`);
    else assert(Q.known, `${id} known`);
  }
  eq(g.City.days(run), g.WEEK_DAYS, 'a week starts with 7 days');
  eq(g.City.hour(run), g.DAY.wake, '…at 07:00');
  // travel by distance (spec §4.41): the route ÷ WALK_PACE, 1 h at least; an old trip day ≈ 2 h
  run.housing = 'studio';
  const H = id => g.City.trip(run, g.City.at(run, id));
  assert(H('pier') >= 1 && H('pier') <= 2, `the pier is by the airport (${H('pier')} h)`);
  assert(H('sand') > H('pier') && H('harbor') > H('sand'), `the coast spreads thin: sand ${H('sand')} h, the harbor ${H('harbor')} h`);
  const at0 = run.pos;
  run.pos = g.SPOTS.trail.at;
  assert(H('dunes') >= 8, `the mountain trail to the dunes: most of a day (${H('dunes')} h)`);
  eq(g.City.trip(run, run.pos), 0, 'standing there: no walk');
  run.pos = at0;
  const m0 = run.money,
    sp0 = run.sp,
    cs = g.City.cost(run, 'sand', null, 2);
  assert(g.City.day(run, 'sand', false, null, 2), 'train on the sand');
  eq(run.money, m0 - g.City.price(run, 'sand', null, 2), 'the session is paid');
  assert(run.sp > sp0, 'sand builds technique (skill points)');
  eq(g.City.hour(run), g.DAY.wake + cs, 'the walk + the session');
  run.event = null;
  const mate = g.Run.mates(run)[0].id,
    b0 = g.Run.you(run).bond[mate] || 0,
    cb = g.City.cost(run, 'bonfire');
  assert(g.City.day(run, 'bonfire'), 'night out at the bonfire');
  assert((g.Run.you(run).bond[mate] || 0) > b0, 'the night out raises bond');
  eq(g.City.hour(run), g.DAY.wake + cs + cb, 'the walk + the night out');
  run.money = 500;
  run.clock = g.City.freshClock();
  const ct = g.City.cost(run, 'trail', null, 2);
  assert(ct >= 6, 'the highlands are far');
  assert(
    g.City.day(run, 'trail', false, null, 2) && g.City.loc(run) === 'shu' && g.City.hour(run) === g.DAY.wake + ct,
    'went up and trained'
  );
  assert(run.spotQ.trail.known, 'training there shows what the place is really like');
  run.event = null; // (a bond may have reached the gift chance: spec §4.35)
  run.clock.hour = g.DAY.late;
  assert(!g.City.can(run, 'stone').ok && /past 02:00/.test(g.City.can(run, 'stone').why), 'past 02:00 only sleep is left');
  assert(g.City.can(run, 'hotelShu', null, 8).ok, '…which still works');
  run.clock = g.City.freshClock();
  run.clock.day = g.WEEK_DAYS;
  const m1 = run.money;
  assert(g.City.day(run, 'hotelShu', false, null, 8), 'sleep at the lodge');
  eq(run.money, m1 - g.City.price(run, 'hotelShu'), 'the lodge costs a night');
  assert(g.City.night(run), 'slept through day 7: the week is spent');
  assert(!g.City.can(run, 'stone').ok && g.City.day(run, 'stone', false) === '', 'no days left');
  const w0 = run.week;
  g.Run.endWeek(run);
  eq(run.week, w0 + 1, 'the player ends the week');
  eq(g.City.days(run), g.WEEK_DAYS, 'a new week, 7 days');
  run.event = null;
  // the dark map: only where you've been is explored; you can walk anywhere on land
  assert(g.City.seen(run, g.City.at(run, 'trail')) && !g.City.seen(run, g.City.at(run, 'weiSpeed')), 'dark where you have not been');
  assert(!g.City.travelTo(run, [5, 5]), 'only on land');
  const sc = p => p.map(v => v * g.MAP_SCALE),
    td = g.City.travelDays(run, sc([700, 300])),
    h0 = g.City.hour(run);
  assert(g.City.travelTo(run, sc([700, 300])) && g.City.hour(run) === h0 + td && g.City.loc(run) === 'wei', 'walked into the city');
  assert(g.City.seen(run, sc([720, 320])), 'the fog lifts around you');
  eq(g.City.regionAt(sc([540, 500])), 'open', 'Central Academy belongs to nobody');
  eq(g.City.regionAt(sc([815, 470])), 'outlaws', 'the overpass is the Outlaws');
  g.Run.endWeek(run);
  // home turf: your faction's region
  run.event = null;
  const open = g.FACTIONS.findIndex(f => !Object.keys(f.join).length);
  run.week = 5; // (the transfer window, spec §4.36)
  assert(g.World.join(run, open), 'sign');
  for (const id of Object.keys(g.SPOTS))
    if (g.SPOTS[id].train) eq(g.City.turf(run, id), g.SPOTS[id].region === g.FACTIONS[open].region ? g.TURF_BONUS : 0, `turf at ${id}`);
  // street hustle keeps values sane
  for (let i = 0; i < 20; i++) {
    run.event = null;
    run.clock = g.City.freshClock();
    run.money = i % 3 ? 100 : 5;
    assert(g.City.day(run, 'street'), 'street');
    assert(run.money >= 0 && run.sta >= 0, 'street keeps money and stamina ≥ 0');
  }
  // a street battle: fight for one side — a real match; the other side always holds it against you
  run.clock = g.City.freshClock();
  run.pos = g.CITY.airport.slice();
  const tg = g.Front.site(run, 'wei', 'wu');
  run.clash = { tile: tg.tile, from: tg.from, att: 'wei', def: 'wu', seen: false, done: false };
  const c = g.Fight.clashSite(run),
    r0 = g.City.rep(run, c.b),
    cc = g.Fight.clashCost(run),
    clashSp0 = run.sp;
  for (const k of g.STATK) g.Run.you(run)[k] = 70; // (a new player starts at 1: give you a normal player's line so the match XP shows)
  const fx = g.Fight.clash(run, c.a);
  assert(fx && !run.clash.done && g.City.hour(run) === g.DAY.wake, 'nothing is spent until the match ends');
  assert([...fx.a.P, ...fx.a.bench].includes(g.Run.you(run)) && fx.a.P.includes(g.Run.you(run)), 'you are on court for your side');
  const m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  const line = fx.onFinish(m);
  assert(/Fought for .+ in the street battle — (won|lost) \d+-\d+, grade [SABC]/.test(line) && /XP: /.test(line), `result line: ${line}`);
  assert(run.clash.done && !g.Fight.clashSite(run), 'fought');
  eq(g.City.rep(run, c.b), r0 + g.CLASH.other, 'the other side remembers');
  assert([g.CLASH.win, g.CLASH.lose].includes(g.City.rep(run, c.a)), 'standing with your side moves');
  eq(g.City.hour(run), g.DAY.wake + cc, 'the walk + its hours');
  assert(g.Run.you(run).team === g.Run.myTeam(run) && clashSp0 === run.sp, 'nobody stays lent; a street battle gives no skill points');
  g.Run.endWeek(run);
  assert(!run.clash || !run.clash.done, 'the battle is gone at the week end');
  run.clock = g.City.freshClock();
  const ti = g.FACTIONS.findIndex((f, i) => i !== open && f.region === 'wu');
  run.pos = g.CITY.hq[ti].slice();
  assert(g.City.scout(run, ti) && g.City.scouted(run, ti), 'scouted');
  eq(g.City.hour(run), g.DAY.wake + g.DAY.act, 'scouting at the HQ takes DAY.act hours');
  g.Run.save(run);
  const back = g.Run.load();
  assert(
    back &&
      back.clock.hour === run.clock.hour &&
      back.pos.join() === run.pos.join() &&
      g.City.scouted(back, ti) &&
      back.spotQ.trail.known &&
      g.City.loc(back) === 'wu',
    'the clock, scouting, places and location saved'
  );
});

test('career: facility access — grudge, owner condition, members and neutral ground', () => {
  const g = load(78),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Gate', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.clock = g.City.freshClock();
  run.money = 500;
  const can = id => g.City.can(run, id);
  assert(can('weiPower').ok, 'a Wei place is open at standing 0');
  run.rep.wei = -19;
  assert(can('weiPower').ok, 'standing −19 is still fine');
  run.rep.wei = -20;
  assert(!can('weiPower').ok && can('weiPower').why.includes("won't let you in"), 'a grudge shuts the door');
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei'),
    team0 = run.team;
  run.team = wei;
  assert(can('weiPower').ok, "the owner's members always get in");
  run.team = team0;
  g.ACCESS.cond.wei = { fans: 1e9 };
  run.rep.wei = 0;
  assert(!can('weiPower').ok && can('weiPower').why.includes('asks for'), "the owner's condition can shut the door");
  g.ACCESS.cond.wei = {};
  for (const r of Object.keys(g.REGIONS)) run.rep[r] = -100;
  assert(can('home').ok && can('park').ok, 'home and Central Academy are never gated');
});

test('career: faction dossier — state, places, roster gate', () => {
  const g = load(94),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Dossier', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.clock = g.City.freshClock();
  let d = g.Dossier.build(run, 'wei');
  eq(d.state, 'stable', 'a fresh Wei is stable');
  assert(d.places.length >= 4 && d.places.every(p => p.access && typeof p.price === 'number'), 'Wei has facilities with price and access');
  eq(d.roster.length, g.POOL.wei, 'the roster is the whole pool');
  assert(
    d.roster.every(p => p.ovr === null && p.el === null),
    'unscouted: ratings and elements unknown'
  );
  assert(
    d.fronts.length === 2 && d.fronts.every(f => f.str === 100 && f.stage === 'steady'),
    'two war units (Iron, Gold) at full Strength'
  );
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  assert(g.City.scout(run, wei), 'scout a Wei club');
  d = g.Dossier.build(run, 'wei');
  assert(d.scouted && d.roster.every(p => typeof p.ovr === 'number'), 'scouted: every rating shows');
  const before = JSON.stringify(run.teams.map(g.teamToJSON));
  run.war.str.iron = 50;
  eq(g.Dossier.build(run, 'wei').state, 'pressed', 'Iron Strained: pressed');
  run.war.str.iron = 30;
  eq(g.Dossier.build(run, 'wei').state, 'weakened', 'Iron Shaken: weakened');
  run.war.fallen.iron = { by: 'harbor', week: 1 }; // (T-315 destroys units: its places go to the destroyer)
  g.War.sync(run);
  const wu = g.Dossier.build(run, 'wu'),
    seized = wu.places.find(p => p.seized);
  assert(
    seized && seized.from === 'wei' && !g.Dossier.build(run, 'wei').places.some(p => p.id === seized.id),
    'a seized place moves to the holder'
  );
  eq(JSON.stringify(run.teams.map(g.teamToJSON)), before, 'building a dossier changes no team');
  const gl = g.Dossier.build(run, 'gloria');
  assert(gl.state === 'minor' && gl.fronts.length === 0, 'St. Gloria is not in the war');
});

test('map: official venues', () => {
  const g = load(21),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Venue' }),
    N = g.ROADS.nodes,
    V = g.VENUES,
    ids = Object.keys(V);
  eq(ids.join(','), 'arena,hall,beach,highland', 'four venues, named in the spec');
  eq(ids.map(id => V[id].name).join(' | '), 'League Arena | Academy Hall | Beach Stadium | Highland Court', 'their names');
  for (const id of ids) {
    const v = V[id];
    assert(g.City.onLand(v.at) && g.City.regionAt(v.at) === v.region, `${id} stands on land in its region`);
    assert(N[`venue:${id}`] && N[`venue:${id}`][0] === v.at[0] && N[`venue:${id}`][1] === v.at[1], `${id} is a road node at its spot`);
    assert(
      g.ROADS.edges.some(e => e.includes(`venue:${id}`)),
      `${id} is joined to a road`
    );
  }
  assert(g.MapModel.onSand(V.beach.at), 'the Beach Stadium stands on the sand');
  eq(g.REGIONS.open.at.join(','), g.CITY.park.x + ',' + g.CITY.park.y, 'the Academy region sits at the Academy');
  // reachable from the airport (the world test walks every node; here the route itself)
  for (const id of ids) {
    const r = g.City.route(g.CITY.airport, V[id].at);
    assert(r.length >= 2 && r[r.length - 1][0] === V[id].at[0], `a route from the airport to ${id}`);
  }
  // landmarks and pins: always there, never fogged
  run.fog = [];
  let draws = 0;
  const next = g.RNG.next;
  g.RNG.next = () => (draws++, next());
  const M = g.MapModel.build(run, null);
  eq(draws, 0, 'no randoms drawn');
  g.RNG.next = next;
  const KIND = { arena: 'arena', hall: 'hall', beach: 'stadium', highland: 'hillcourt' };
  for (const id of ids) {
    const lm = M.land.landmarks.find(l => l.id === `venue:${id}`),
      pin = M.pins.find(p => p.id === `venue:${id}`);
    assert(lm && lm.kind === KIND[id] && lm.region === V[id].region, `${id} is a landmark of kind ${KIND[id]}`);
    assert(pin && pin.kind === 'venue' && pin.title === V[id].name && !pin.flags.today, `${id} has a pin, not lit on a training week`);
  }
  // no lot within a venue's clearance
  assert(
    M.land.lots.every(l => ids.every(id => Math.hypot(l.at[0] - V[id].at[0], l.at[1] - V[id].at[1]) >= V[id].clear - 0.2)),
    'no lot within a venue clearance (lot spots are rounded to 0.1)'
  );
  // City.venue: where this week's match is played
  run.event = null;
  run.week = 1;
  eq(g.City.venue(run), null, 'a training week has no venue');
  run.week = 4;
  run.eval = null;
  eq(g.City.venue(run), 'hall', 'an Academy evaluation is held at the Academy Hall');
  eq(g.MapModel.build(run, null).pins.find(p => p.id === 'venue:hall').flags.today, true, 'and the hall glows');
  eq(g.MapModel.build(run, null).pins.find(p => p.id === 'venue:arena').flags.today, false, 'the arena does not');
  for (const [region, want] of [
    ['wei', 'arena'],
    ['wu', 'beach'],
    ['shu', 'highland'],
    ['outlaws', null]
  ]) {
    run.team = g.FACTIONS.findIndex(f => f.region === region);
    run.eval = null;
    eq(g.City.venue(run), want, `a ${region} member's evaluation → ${want}`);
  }
  run.team = null;
  run.cup = { id: g.CUPS[0].id, done: false };
  eq(g.City.venue(run), 'arena', 'a cup week is played at the League Arena');
});

test('map: patrols stand on this week’s border (T-079, T-153, T-313)', () => {
  const g = load(51),
    run = g.Run.create(g.Run.draft(), { role: 'S', name: 'Patrol' });
  run.clash = null;
  let m = g.MapModel.build(run);
  eq(m.life.patrols.length, 0, 'calm: no patrols');
  assert(!('seized' in m) && !('contest' in m.land) && !('contest' in m.life), 'no pre-hex leftovers in the model');
  const b = g.Front.site(run, 'wei', 'wu');
  run.clash = { att: 'wei', def: 'wu', tile: b.tile, from: b.from, done: false };
  m = g.MapModel.build(run);
  const P = m.life.patrols,
    on = id => P.filter(p => p.tile === id);
  assert(P.length > 0 && P.every(p => g.Hex.frontier(run, p.tile)), 'patrols only on border tiles');
  assert(on(b.tile).length === 2 && on(b.tile).every(p => p.color === g.REGIONS.wu.color), 'the defender guards its tile');
  assert(on(b.from).length >= 2 && on(b.from).every(p => p.color === g.REGIONS.wei.color), 'the raider stands across the border');
  assert(
    P.every(p => Array.isArray(p.face) && typeof p.color === 'string' && !('region' in p)),
    'colours and points only'
  );
  eq(JSON.stringify(g.MapModel.build(run).life.patrols), JSON.stringify(P), 'deterministic (hashes, no randoms)');
});

test('map: real facilities (spec §4.40, T-351) — every place and HQ on its own lot beside its point, door toward it; no overlaps; unique in a town', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Fac', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    F = g.MapModel.facilities(run),
    U = 1 / g.MAP_UNIT_M,
    ids = [...Object.keys(g.SPOTS), ...g.CITY.hq.map((_, i) => `hq${i}`)];
  eq(Object.keys(F).sort().join(), ids.sort().join(), 'a facility for every place and club HQ');
  const box = f => ({ c: f.at, cs: Math.cos(f.rot), sn: Math.sin(f.rot), hw: (f.w / 2) * U, hd: (f.d / 2) * U }),
    holds = (b, p, m = 0) => {
      const dx = p[0] - b.c[0],
        dy = p[1] - b.c[1];
      return Math.abs(dx * b.cs - dy * b.sn) <= b.hw + m && Math.abs(dx * b.sn + dy * b.cs) <= b.hd + m;
    };
  for (const [id, f] of Object.entries(F)) {
    const b = box(f),
      // the door (+z) faces the node: the node lies on the lot's +z side, just past its front edge
      dx = f.node[0] - f.at[0],
      dy = f.node[1] - f.at[1],
      lz = dx * b.sn + dy * b.cs;
    assert(g.FACILITY[f.fac] && f.w === g.FACILITY[f.fac].w, `${id}: its design's lot`);
    assert(lz > b.hd && !holds(b, f.node), `${id}: beside its point, door toward it`);
    for (const [j, o] of Object.entries(F)) if (j !== id) assert(!holds(b, o.at) && !holds(b, o.node), `${id} clear of ${j}`);
  }
  // designs: one per place (home aside), none shared by two places
  const designs = Object.keys(g.SPOTS).map(id => g.FACILITY_OF[id]);
  eq(new Set(designs).size, designs.length, 'every place its own design');
  eq(new Set(g.FACILITY_OF.hq).size, g.CITY.hq.length, 'every club HQ its own');
  // filler lots and nature keep off them; the model's landmarks carry the lot, a name only when known
  const M = g.MapModel.build(run, null),
    boxes = Object.values(F).map(box);
  assert(
    M.land.lots.every(l => boxes.every(b => !holds(b, l.at))),
    'no filler lot on a facility'
  );
  assert(
    M.land.nature.every(o => boxes.every(b => !holds(b, o.at))),
    'no tree on a facility'
  );
  const wp = M.land.landmarks.find(l => l.id === 'weiPower');
  eq([wp.fac, wp.w, wp.d].join(), 'strength,24,16', 'the Strength Center: its hall is the street-level shell (INTERIOR)');
  eq([g.INTERIOR.weiPower.w, g.INTERIOR.weiPower.d].join(), '24,16', '… the interior matches');
  const unknown = Object.keys(g.SPOTS).find(id => g.SPOTS[id].at && !g.MapModel.known(run, id, g.SPOTS[id].at));
  assert(unknown && !M.land.landmarks.find(l => l.id === unknown).name, 'an unknown place: no name board');
  // pins (no longer drawn) still carry what the hover tag shows; rims: your home, a venue this week, closed places grey
  const pin = M.pins.find(p => p.id === 'acaGym');
  assert(pin && pin.name === g.SPOTS.acaGym.name && Number.isFinite(pin.trip), 'a pin: name and trip for the tag');
  assert(M.rims.home && M.rims.home[1] > 0, 'your home keeps a quiet rim');
  let draws = 0;
  const next = g.RNG.next;
  g.RNG.next = () => (draws++, next());
  g.MapModel.facCache = null;
  eq(JSON.stringify(g.MapModel.facilities(run)), JSON.stringify(F), 'deterministic');
  eq(draws, 0, 'no randoms');
});

test('map: arriving inside (owner, 2026-10-24) — at a place you stand at its interior station or on its kit; in through the door; display only', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'In', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    F = g.MapModel.facilities(run),
    U = 1 / g.MAP_UNIT_M,
    local = (f, p) => {
      const cs = Math.cos(f.rot),
        sn = Math.sin(f.rot),
        dx = p[0] - f.at[0],
        dy = p[1] - f.at[1];
      return [(dx * cs - dy * sn) / U, (dx * sn + dy * cs) / U]; // metres in the lot's frame (door on +z)
    };
  let n = 0;
  for (const id of Object.keys(g.SPOTS)) {
    const f = F[id],
      p = g.City.at(run, id),
      I = g.MapModel.inside(run, p);
    if (!f) continue;
    const want = !!(g.INTERIOR[id] || g.MapModel.FAC_IN[f.fac]);
    eq(!!I, want, `${id}: inside only with an interior or outdoor kit`);
    if (!I) continue;
    n++;
    const [out, door, spot] = I.map(q => local(f, q));
    assert(out[1] > f.d / 2 && Math.abs(out[0]) < 0.01, `${id}: the walk starts at its door, outside`);
    assert(door[1] < f.d / 2 && door[1] > 0, `${id}: then just inside the door`);
    assert(Math.abs(spot[0]) < f.w / 2 && Math.abs(spot[1]) < f.d / 2, `${id}: you stand on the lot`);
    assert(
      Math.hypot(I[0][0] - p[0], I[0][1] - p[1]) < Math.hypot(f.at[0] - p[0], f.at[1] - p[1]),
      `${id}: the door faces the place's point`
    );
  }
  assert(n >= 10, `places you go inside: ${n}`);
  // the gym: you stand at a station (the street-level prompt's reach)
  const gym = g.MapModel.inside(run, g.City.at(run, 'weiPower')),
    s = local(F.weiPower, gym[2]);
  assert(
    g.INTERIOR.weiPower.stations.some(st => !st.card && Math.hypot(st.at[0] - s[0], st.at[1] - s[1]) < 0.05),
    'the gym: at a station'
  );
  // the model: you.at stays the rules' point; inside rides along; not at a place → none
  g.City.moveTo(run, g.City.at(run, 'weiPower')); // (rounds the point)
  const M = g.MapModel.build(run, null);
  eq(M.you.at.join(), g.City.pos(run).join(), 'you.at = the rules point');
  eq(JSON.stringify(M.you.inside), JSON.stringify(gym), 'you.inside = the walk in (a travel there rounds the point)');
  eq(g.MapModel.inside(run, [1, 1]), null, 'a bare map point: no inside');
});
