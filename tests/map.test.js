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
  assert(g.MapModel.onSand(g.HOME_AT.studio), 'the beach shack is on the sand');
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
    ['wei', 327, 262, 392],
    ['wu', 232, 186, 278],
    ['shu', 75, 60, 90],
    ['outlaws', 49, 39, 59],
    ['open', 22, 18, 26],
    ['gloria', 19, 15, 23]
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
    down.every(l => l.h === l.wealth) && L.filter(l => l.district !== 'wei-downtown').every(l => Math.abs(l.h - l.wealth * 0.4) < 0.01),
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

test('career: map model life — mates, crews, battle, borders, no randoms', () => {
  const g = load(12),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Life', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    next0 = g.RNG.next;
  let draws = 0;
  g.RNG.next = () => (draws++, next0());
  const mate = g.Run.mates(run)[0];
  run.floor = { wit: [mate.id] };
  let L = g.MapModel.build(run).life;
  eq(L.mates.length, 0, 'unexplored training places show no mates');
  eq(L.crews.length, 0, 'unexplored clubs show no crews');
  eq(L.battle, null, 'no battle yet');
  run.fog.push(g.City.at(run, 'weiWit'));
  L = g.MapModel.build(run).life;
  eq(L.mates.length, 1, 'a mate appears once the place is explored');
  eq(L.mates[0].spot, 'weiWit', 'at their floor key’s place');
  assert(
    Math.hypot(L.mates[0].at[0] - g.City.at(run, 'weiWit')[0], L.mates[0].at[1] - g.City.at(run, 'weiWit')[1]) <= 28,
    'offset around it'
  );
  const hq = g.CITY.hq.findIndex((p, i) => i !== run.team && g.FRONT && g.FACTIONS[i]);
  run.fog.push(g.CITY.hq[hq]);
  L = g.MapModel.build(run).life;
  const cr = L.crews.find(c => c.team === hq);
  assert(cr && cr.n >= 2 && cr.n <= 6 && !cr.known && cr.walk.length === 0, 'an unscouted crew: grey, no walk');
  run.scout = run.scout || {};
  run.scout[hq] = 1;
  L = g.MapModel.build(run).life;
  assert(L.crews.find(c => c.team === hq).known, 'scouted: coloured');
  const tg = g.Hex.target(run, 'wei', 'wu');
  run.clash = { tile: tg.id, from: tg.from, att: 'wei', def: 'wu', seen: false, done: false };
  L = g.MapModel.build(run).life;
  assert(L.battle && L.battle.colors.length === 2 && L.battle.at.length === 2, 'the open battle');
  run.clash.done = true;
  eq(g.MapModel.build(run).life.battle, null, 'gone once done');
  eq(JSON.stringify(g.MapModel.build(run).life), JSON.stringify(g.MapModel.build(run).life), 'same run, same model');
  eq(draws, 0, 'build draws no randoms');
  g.RNG.next = next0;
});

test('career: island map — regions, prices, quality, far trips, outings, scouting, 7-day weeks, saved', () => {
  const g = load(77),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Mapper', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  eq(run.teams.map(t => t.name).join(','), g.FACTIONS.map(f => f.team[0]).join(','), 'league teams play as faction squads');
  for (const id of Object.keys(g.SPOTS)) {
    const s = g.SPOTS[id];
    assert(s.train ? g.TRAININGS[s.train] : ['rest', 'rec', 'ramen', 'arcade', 'street'].includes(s.act), `${id} does something`);
    assert(s.region === null || g.REGIONS[s.region], `${id} region`);
  }
  for (const k of g.TRAINK) assert(g.City.spotsFor(k).length >= 2, `several places for ${k} training`);
  // prices follow the regions; Wei may be overhyped, Shu may be a gem, others as advertised
  eq(g.City.price(run, 'weiPower'), g.TRAIN_FEE * 2, 'Wei costs double');
  eq(g.City.price(run, 'stone'), g.TRAIN_FEE / 2, 'Shu costs half');
  for (const id of Object.keys(run.spotQ)) {
    const Q = run.spotQ[id],
      r = g.SPOTS[id].region;
    if (r === 'wei') assert(!Q.known && (Q.q === 1.25 || (Q.q === 1 && Q.tag === 'overhyped')), `${id} premium or overhyped`);
    else if (r === 'shu') assert(!Q.known && (Q.q === 0.8 || (Q.q === 1.25 && Q.tag === 'gem')), `${id} rough or gem`);
    else assert(Q.known, `${id} known`);
  }
  eq(g.City.days(run), g.WEEK_DAYS, 'a week starts with 7 days');
  // travel by distance: close by is free, far is up to 3 days
  run.housing = 'studio';
  eq(g.City.trip(run, g.City.at(run, 'pier')), 0, 'the pier is by the airport');
  eq(g.City.trip(run, g.City.at(run, 'sand')), 2, 'the sand courts are down the coast (Wu spreads thin)');
  eq(g.City.trip(run, g.City.at(run, 'harbor')), 2, 'the far east coast: the coast road makes it 2 days (T-048)');
  eq(g.City.trip(run, g.City.at(run, 'dunes')), g.TRIP_MAX, 'the dunes past the harbor: the longest trip');
  eq(g.City.trip(run, [2000, 2000]), g.TRIP_MAX, 'never more than 3 days');
  const m0 = run.money,
    sp0 = run.sp,
    cs = g.City.cost(run, 'sand');
  assert(g.City.day(run, 'sand', false), 'train on the sand');
  eq(run.money, m0 - g.City.price(run, 'sand'), 'the session is paid');
  assert(run.sp > sp0, 'sand builds technique (skill points)');
  eq(g.City.days(run), 7 - cs, 'the trip + the session');
  run.event = null;
  const mate = g.Run.mates(run)[0].id,
    b0 = g.Run.you(run).bond[mate] || 0,
    cb = g.City.cost(run, 'bonfire');
  assert(g.City.day(run, 'bonfire'), 'night out at the bonfire');
  assert((g.Run.you(run).bond[mate] || 0) > b0, 'the night out raises bond');
  eq(g.City.days(run), 7 - cs - cb, 'the trip + the night');
  run.money = 500;
  run.days = 7;
  const ct = g.City.cost(run, 'trail');
  assert(ct >= 3, 'the highlands are far');
  assert(g.City.day(run, 'trail', false) && g.City.loc(run) === 'shu' && g.City.days(run) === 7 - ct, 'went up and trained');
  assert(run.spotQ.trail.known, 'training there shows what the place is really like');
  const ch = g.City.cost(run, 'home');
  run.days = ch - 1;
  assert(!g.City.can(run, 'home').ok && g.City.can(run, 'home').why.includes(`only ${ch - 1} left`), 'nothing may spill into next week');
  run.days = g.City.cost(run, 'hotelShu');
  const m1 = run.money;
  assert(g.City.day(run, 'hotelShu', false), 'rest at the lodge');
  eq(run.money, m1 - g.City.price(run, 'hotelShu'), 'the lodge costs a night');
  assert(g.City.night(run), 'the last day: night falls');
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
    td = g.City.travelDays(run, sc([700, 300]));
  assert(g.City.travelTo(run, sc([700, 300])) && g.City.days(run) === 7 - td && g.City.loc(run) === 'wei', 'walked into the city');
  assert(g.City.seen(run, sc([720, 320])), 'the fog lifts around you');
  eq(g.City.regionAt(sc([540, 500])), 'open', 'Central Academy belongs to nobody');
  eq(g.City.regionAt(sc([815, 470])), 'outlaws', 'the overpass is the Outlaws');
  g.Run.endWeek(run);
  // home turf: your faction's region
  run.event = null;
  const open = g.FACTIONS.findIndex(f => !Object.keys(f.join).length);
  assert(g.World.join(run, open), 'sign');
  for (const id of Object.keys(g.SPOTS))
    if (g.SPOTS[id].train) eq(g.City.turf(run, id), g.SPOTS[id].region === g.FACTIONS[open].region ? g.TURF_BONUS : 0, `turf at ${id}`);
  // street hustle keeps values sane
  for (let i = 0; i < 20; i++) {
    run.event = null;
    run.days = 7;
    run.money = i % 3 ? 100 : 5;
    assert(g.City.day(run, 'street'), 'street');
    assert(run.money >= 0 && run.sta >= 0, 'street keeps money and stamina ≥ 0');
  }
  // a street battle: fight for one side — a real match; the other side always holds it against you
  run.days = 7;
  run.pos = g.CITY.airport.slice();
  const tg = g.Hex.target(run, 'wei', 'wu');
  run.clash = { tile: tg.id, from: tg.from, att: 'wei', def: 'wu', seen: false, done: false };
  const c = g.City.clashSite(run),
    r0 = g.City.rep(run, c.b),
    cc = g.City.clashCost(run),
    clashSp0 = run.sp;
  for (const k of g.STATK) g.Run.you(run)[k] = 70; // (a new player starts at 1: give you a normal player's line so the match XP shows)
  const fx = g.Fight.clash(run, c.a);
  assert(fx && !run.clash.done && run.days === 7, 'nothing is spent until the match ends');
  assert([...fx.a.P, ...fx.a.bench].includes(g.Run.you(run)) && fx.a.P.includes(g.Run.you(run)), 'you are on court for your side');
  const m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  const line = fx.onFinish(m);
  assert(/Fought for .+ in the street battle — (won|lost) \d+-\d+, grade [SABC]/.test(line) && /XP: /.test(line), `result line: ${line}`);
  assert(run.clash.done && !g.City.clashSite(run), 'fought');
  eq(g.City.rep(run, c.b), r0 + g.CLASH.other, 'the other side remembers');
  assert([g.CLASH.win, g.CLASH.lose].includes(g.City.rep(run, c.a)), 'standing with your side moves');
  eq(g.City.days(run), 7 - cc, 'the trip + a day');
  assert(g.Run.you(run).team === g.Run.myTeam(run) && clashSp0 === run.sp, 'nobody stays lent; a street battle gives no skill points');
  g.Run.endWeek(run);
  assert(!run.clash || !run.clash.done, 'the battle is gone at the week end');
  run.days = 7;
  const ti = g.FACTIONS.findIndex((f, i) => i !== open && f.region === 'wu');
  run.pos = g.CITY.hq[ti].slice();
  assert(g.City.scout(run, ti) && g.City.scouted(run, ti), 'scouted');
  eq(g.City.days(run), 6, 'scouting at the HQ takes a day');
  g.Run.save(run);
  const back = g.Run.load();
  assert(
    back &&
      back.days === 6 &&
      back.pos.join() === run.pos.join() &&
      g.City.scouted(back, ti) &&
      back.spotQ.trail.known &&
      g.City.loc(back) === 'wu',
    'days, scouting, places and location saved'
  );
});

test('career: facility access — grudge, owner condition, members and neutral ground', () => {
  const g = load(78),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Gate', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.days = 7;
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
  run.days = 7;
  let d = g.Dossier.build(run, 'wei');
  eq(d.state, 'stable', 'a fresh Wei is stable');
  assert(d.places.length >= 4 && d.places.every(p => p.access && typeof p.price === 'number'), 'Wei has facilities with price and access');
  eq(d.roster.length, g.POOL.wei, 'the roster is the whole pool');
  assert(
    d.roster.every(p => p.ovr === null && p.el === null),
    'unscouted: ratings and elements unknown'
  );
  assert(d.fronts.length === 2 && d.fronts.every(f => f.meter === 0), 'two fronts, no pressure yet');
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  assert(g.City.scout(run, wei), 'scout a Wei club');
  d = g.Dossier.build(run, 'wei');
  assert(d.scouted && d.roster.every(p => typeof p.ovr === 'number'), 'scouted: every rating shows');
  const before = JSON.stringify(run.teams.map(g.teamToJSON));
  g.Hex.flip(run, g.Hex.ofSpot('weiSpeed').id, 'wu');
  const wu = g.Dossier.build(run, 'wu');
  eq(g.Dossier.build(run, 'wei').state, 'pressed', 'one place lost: pressed');
  const seized = wu.places.find(p => p.seized);
  assert(
    seized && seized.from === 'wei' && !g.Dossier.build(run, 'wei').places.some(p => p.id === seized.id),
    'a seized place moves to the holder'
  );
  eq(wu.state, 'rising', 'the taker is rising');
  g.Hex.flip(run, g.Hex.ofSpot('weiWit').id, 'wu');
  eq(g.Dossier.build(run, 'wei').state, 'weakened', 'two places lost: weakened');
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

test('map: patrols walk the hex frontier (T-079, T-153)', () => {
  const g = load(51),
    run = g.Run.create(g.Run.draft(), { role: 'S', name: 'Patrol' });
  run.clash = null;
  run.hex = { own: {}, p: {}, by: {}, t: {} };
  let m = g.MapModel.build(run);
  eq(m.life.patrols.length, 0, 'calm: no patrols');
  assert(!('seized' in m) && !('contest' in m.land) && !('contest' in m.life), 'no pre-hex leftovers in the model');
  // any pair: Shu pushes a Wu tile; the battle this week is Wei on another Wu tile
  const t = g.Hex.target(run, 'shu', 'wu'),
    b = g.Hex.target(run, 'wei', 'wu');
  run.hex.p[t.id] = 1;
  run.hex.by[t.id] = 'shu';
  run.clash = { att: 'wei', def: 'wu', tile: b.id, from: b.from, done: false };
  m = g.MapModel.build(run);
  const P = m.life.patrols,
    on = id => P.filter(p => p.tile === id);
  assert(P.length > 0 && P.every(p => g.Hex.frontier(run, p.tile)), 'patrols only on frontier tiles');
  eq(P[0].tile, b.id, 'the battle front comes first');
  assert(on(t.id).length === 2 && on(t.id).every(p => p.color === g.REGIONS.wu.color), 'the holder guards the pushed tile');
  assert(on(t.from).length >= 2 && on(t.from).every(p => p.color === g.REGIONS.shu.color), 'the pusher stands next to it');
  assert(
    P.every(p => Array.isArray(p.face) && typeof p.color === 'string' && !('region' in p)),
    'colours and points only'
  );
  eq(JSON.stringify(g.MapModel.build(run).life.patrols), JSON.stringify(P), 'deterministic (hashes, no randoms)');
});
