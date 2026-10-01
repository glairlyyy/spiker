#!/usr/bin/env node
// Run: node tests/run.js            (all tests)
//      node tests/run.js --update   (re-record the engine golden hashes after an intended gameplay change)
const fs = require('fs'),
  path = require('path');
const { load, hash, test, assert, eq, results } = require('./harness');
const GOLDEN = path.join(__dirname, 'golden.json');
const update = process.argv.includes('--update');
const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
const record = {};
const goldenCheck = (key, value) => {
  record[key] = value;
  if (!update) {
    assert(golden[key], `no golden value for ${key} — run with --update`);
    eq(value, golden[key], `${key} changed (gameplay or animation output differs; run --update if intended)`);
  }
};

// ---------- engine ----------
test('engine: seeded tournament teams + recorded matches are deterministic (golden)', () => {
  const g = load(42);
  const T = g.mkTeams();
  g.simBalance(T);
  const teams = JSON.stringify(T.map(t => t.P.map(p => [p.name, p.role, p.power, p.def, p.speed, p.jump, p.wit, p.lead, p.star, p.op])));
  let out = '';
  for (let i = 0; i < 16; i++) {
    const m = g.newMatch(T[i % 8], T[(i + 3) % 8], true);
    while (!m.over) out += JSON.stringify(g.playRally(m).beats);
    out += JSON.stringify([m.setScores, m.stat]);
  }
  goldenCheck('teams', hash(teams));
  goldenCheck('matches', hash(out));
});
test('engine: simulated matches (no animation) are deterministic (golden)', () => {
  const g = load(7);
  const T = g.mkTeams();
  const res = [];
  for (let i = 0; i < 40; i++) res.push(g.simMatch(T[i % 8], T[(i + 5) % 8]).setScores[0].join('-'));
  goldenCheck('sims', hash(res.join(',')));
});
test('engine: monster + league teams (golden)', () => {
  const g = load(9);
  const M = g.mkMonsterTeams(),
    L = g.mkLeagueTeams();
  assert(
    M.every(t => t.P.every(p => p.op)),
    'every monster player must be OP'
  );
  assert(
    L.every(t => t.P.every(p => !p.star)),
    'league teams start without stars'
  );
  goldenCheck('monster', hash(JSON.stringify(M.map(t => t.P.map(p => [p.power, p.def, p.speed, p.jump, p.wit])))));
});
test('engine: rally invariants over 300 matches', () => {
  const g = load(3);
  const T = g.mkTeams();
  for (let i = 0; i < 300; i++) {
    const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
    const [a, b] = m.setScores[0];
    assert(m.over && Math.max(a, b) >= g.RULES.pointsToWin && Math.abs(a - b) >= g.RULES.winBy, `bad final score ${a}-${b}`);
    for (const id in m.sta) assert(m.sta[id] >= 0.05 && m.sta[id] <= 1, 'stamina out of range');
    for (const id in m.mood) assert(m.mood[id] >= -1 && m.mood[id] <= 1, 'mood out of range');
  }
});
test('engine: every beat act kind is handled by the renderer', () => {
  const g = load(11);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/render/playback.js'), 'utf8');
  const known = new Set(
    [...src.matchAll(/case '([a-zA-Z]+)'/g)]
      .map(m => m[1])
      .concat(['slide', 'hold', 'pose', 'jump', 'ball', 'reset', 'rot', 'score', 'point'])
  );
  const T = g.mkMonsterTeams(),
    seen = new Set();
  for (let i = 0; i < 6; i++) {
    const m = g.newMatch(T[0], T[1], true);
    while (!m.over) for (const b of g.playRally(m).beats) for (const a of b.acts) seen.add(a.k);
  }
  const missing = [...seen].filter(k => !known.has(k));
  assert(!missing.length, 'unhandled act kinds: ' + missing.join(', '));
});

test('render3d: every pose the engine sends has a 3D pose', () => {
  const g = load(12);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/render3d/poses3d.mjs'), 'utf8');
  const known = new Set([...src.matchAll(/pose === '([a-z]+)'/g)].map(m => m[1]));
  const T = g.mkMonsterTeams(),
    seen = new Set(['ready', 'huddle']); // match start and timeouts set these outside rally beats
  for (let i = 0; i < 6; i++) {
    const m = g.newMatch(T[0], T[1], true);
    while (!m.over) for (const b of g.playRally(m).beats) for (const a of b.acts) if (a.k === 'pose') seen.add(a.pose);
  }
  const missing = [...seen].filter(k => !known.has(k));
  assert(!missing.length, 'poses with no 3D version: ' + missing.join(', '));
});

// ---------- data ----------
test('data: events, skills, unlocks and calendar are well-formed', () => {
  const g = load(1);
  const fxKeys = new Set([
    'power',
    'def',
    'speed',
    'jump',
    'wit',
    'lead',
    'sta',
    'mood',
    'sp',
    'fans',
    'main',
    'bondMate',
    'bondCap',
    'bondAll',
    'chance'
  ]);
  const ids = new Set();
  const checkFx = (fx, where) => {
    for (const f of fx) {
      assert(fxKeys.has(f[0]), `${where}: unknown effect ${f[0]}`);
      if (f[0] === 'chance') checkFx(f[2], where);
    }
  };
  for (const e of g.EVENTS) {
    assert(!ids.has(e.id), 'duplicate event ' + e.id);
    ids.add(e.id);
    assert(!e.need || g.EVENT_NEED[e.need], `${e.id}: unknown need ${e.need}`);
    checkFx(e.a[1], e.id);
    checkFx(e.b[1], e.id);
  }
  for (const [id, s] of Object.entries(g.SKILLS)) {
    assert(s.name && s.desc && s.cost > 0, 'skill fields missing: ' + id);
    assert(s.tech ? s.req && g.SKILL_HOW[id] : s.key && s.val, 'skill shape wrong: ' + id);
  }
  for (const w of Object.keys(g.CALENDAR)) assert(+w >= 1 && +w <= g.CAREER.weeks, 'calendar week out of range ' + w);
});

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
      ].map(p => g.City.regionAt(p))
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
  eq([C.w, C.h].join('x'), '1060x700', 'the map frame grew');
  eq(
    JSON.stringify(C.wuWei || C.contest.slice(0, 3)),
    JSON.stringify([
      [854, 199],
      [883, 305],
      [850, 412]
    ]),
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
    ['wei', 600, 480, 720],
    ['wu', 300, 240, 360],
    ['shu', 150, 120, 180],
    ['outlaws', 60, 48, 72],
    ['open', 40, 32, 48],
    ['gloria', 30, 24, 36]
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
          Math.hypot(l.at[0] - core[0], l.at[1] - core[1]) >= a &&
          Math.hypot(l.at[0] - core[0], l.at[1] - core[1]) < b
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
  eq(L.borders.length, 3, 'three borders');
  run.clash = { site: 0, att: g.CLASH.sites[0].a, seen: false, done: false };
  L = g.MapModel.build(run).life;
  assert(L.battle && L.battle.colors.length === 2 && L.battle.at.length === 2, 'the open battle');
  run.clash.done = true;
  eq(g.MapModel.build(run).life.battle, null, 'gone once done');
  eq(JSON.stringify(g.MapModel.build(run).life), JSON.stringify(g.MapModel.build(run).life), 'same run, same model');
  eq(draws, 0, 'build draws no randoms');
  g.RNG.next = next0;
});

test('career: faction dynamics — border pressure seizes places, weakens, comes back', () => {
  const g = load(9),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Front', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  const p0 = g.City.price(run, 'weiPower'),
    ti = g.FACTIONS.findIndex(f => f.region === 'wei' && f.join.ovr),
    ovr0 = g.World.joinReq(run, ti).ovr;
  eq(g.Front.meter(run, 'wu', 'wei'), 0, 'borders start calm');
  for (let i = 0; i < g.FRONT.seize - 1; i++) eq(g.Front.result(run, 'wu', 'wei'), '', 'pressure builds');
  eq(g.Front.meter(run, 'wu', 'wei'), g.FRONT.seize - 1, 'meter from the winner');
  eq(g.Front.meter(run, 'wei', 'wu'), 1 - g.FRONT.seize, 'and from the loser');
  assert(g.Front.result(run, 'wu', 'wei').includes('seized'), 'a place falls');
  const id = g.FRONT.borders['wei-wu'].wei[0];
  eq(g.City.region(run, id), 'wu', 'the place is Wu now');
  eq(g.Front.meter(run, 'wu', 'wei'), 0, 'the meter resets');
  for (let i = 0; i < g.FRONT.seize; i++) g.Front.result(run, 'wu', 'wei');
  assert(g.Front.weak(run, 'wei'), 'two places lost: Wei weakened');
  assert(g.City.price(run, 'weiPower') > p0, 'weakened: dearer');
  assert(g.World.joinReq(run, ti).ovr < ovr0, 'weakened: easier to join');
  for (let i = 0; i < g.FRONT.seize; i++) g.Front.result(run, 'wu', 'wei');
  eq(g.Front.lost(run, 'wei'), 2, 'only the border places can fall');
  let line = '';
  for (let i = 0; i < g.FRONT.seize; i++) line = g.Front.result(run, 'wei', 'wu');
  assert(line.includes('retook') && g.Front.lost(run, 'wei') === 1, 'lost places come back first');
  // aggression: over many weeks Wu starts most battles
  const n = { wei: 0, wu: 0, shu: 0 };
  run.lastLoser = null;
  for (let i = 0; i < 600; i++) n[g.Front.pick(run).att]++;
  assert(n.wu > n.wei && n.wei > n.shu, `Wu is the most aggressive (${JSON.stringify(n)})`);
});

// ---------- career ----------
function playRun(g, role = 'WS') {
  const d = g.Run.draft();
  const run = g.Run.create(d, { role, name: 'Test', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  let guard = 0;
  while (!run.result && guard++ < 400) {
    if (run.event) {
      const pre = run.event.pre; // sponsor offers come before the week's choice
      g.Run.log(run, g.Events.choose(run, 0));
      if (!pre) g.Run.endWeek(run);
      continue;
    }
    if (g.World.isFree(run)) for (const t of run.teams) if (g.World.join(run, t.i)) break; // sign as soon as a club allows
    const wt = g.Run.weekType(run);
    if (wt === 'eval') {
      if (run.eval.kind === 'faction' && !run.eval.mine) {
        g.Eval.bench(run); // not drawn: watch from the bench
        g.Run.endWeek(run);
        continue;
      }
      const region = run.eval.region,
        fx = g.Cup.fixture(run, 'eval'),
        m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      fx.onFinish(m);
      assert(
        g.Pool.players(run, region).every(p => p.team.i !== -2),
        'nobody stays lent after an evaluation'
      );
      continue;
    }
    if (wt === 'cup') {
      run.focus = g.FOCUS[role][0][0];
      run.talk = 'fire';
      const fx = g.Cup.fixture(run, 'cup');
      const m = g.newMatch(fx.a, fx.b, false);
      if (fx.setup) fx.setup(m);
      while (!m.over) g.playRally(m);
      fx.onFinish(m);
      continue;
    }
    const c = run.sta < 45 ? 'rest' : run.mood < 2 ? 'rec' : g.KEYSTAT[role];
    g.Run.log(run, c === 'rest' ? g.Training.rest(run) : c === 'rec' ? g.Training.recreation(run) : g.Training.train(run, c, run.sta > 85));
    if (!g.Events.roll(run)) g.Run.endWeek(run);
  }
  return run;
}
test('career: a full run reaches a result with sane values', () => {
  for (const role of ['WS', 'MB', 'S']) {
    const g = load(100 + role.length),
      run = playRun(g, role),
      you = g.Run.you(run);
    assert(run.result && ['S', 'A', 'B', 'C'].includes(run.result.rank), 'run must end with a rank');
    eq(run.cups.map(c => c.id).join(','), 'u21', 'the U21 Final Cup ends every run (placing NO_CUP when your squad was not drawn)');
    eq(run.week, g.CAREER.weeks + 1, 'the season runs all 28 weeks');
    assert(run.hist.length >= 20, 'weekly history for the growth chart');
    for (const k of g.STATK) assert(you[k] >= g.CAREER.statMin && you[k] <= 99, `${k} out of range: ${you[k]}`);
    assert(you.wit >= 0.1 && you.wit <= 2, 'wit out of range');
    assert(run.sta >= 0 && run.sta <= run.staMax, 'stamina out of range');
    for (const v of Object.values(you.bond)) assert(v >= 0 && v <= 100, 'bond out of range');
  }
});
test('career: save → load round-trip keeps the run intact', () => {
  const g = load(5),
    d = g.Run.draft(),
    run = g.Run.create(d, { role: 'MB', name: 'Saver', alloc: { power: 10, def: 20, speed: 10, jump: 20 }, witSteps: 0 });
  for (let i = 0; i < 5; i++) {
    g.Training.train(run, 'jump');
    run.event = null;
    g.Run.endWeek(run);
  }
  g.Run.save(run);
  const back = g.Run.load();
  assert(back, 'load returned null');
  eq(back.week, run.week, 'week');
  eq(g.Run.you(back).jump, g.Run.you(run).jump, 'jump stat');
  eq(g.Run.you(back).team, g.Run.myTeam(back), 'player re-linked to team');
  eq(JSON.stringify(back.teams.map(g.teamToJSON)), JSON.stringify(run.teams.map(g.teamToJSON)), 'teams');
});
test('career: training cap, facility Lv 5 and Hard training', () => {
  const g = load(10),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Cap', alloc: { power: 30, def: 10, speed: 10, jump: 10 }, witSteps: 0 }),
    you = g.Run.you(run);
  eq(g.TRAIN_CAP, 75, 'training cap');
  you.power = 60;
  for (let i = 0; i < 200; i++) {
    run.sta = 100;
    run.injury = null;
    run.mood = 4;
    g.Training.train(run, 'power');
    assert(!run.event, 'no Limit Break event any more');
  }
  eq(you.power, 75, '200 sessions stop power at 75');
  eq(g.Training.preview(run, 'power', false).cap, 75, 'the preview says the stat is capped');
  const xp0 = run.xp.power || 0;
  g.Training.addXp(run, 'power', 500);
  eq(you.power, 75, 'XP from training past the cap does nothing');
  eq(run.xp.power || 0, xp0, '…and banks nothing');
  g.Run.bump(run, 'power', 10);
  eq(you.power, 75, 'an event bump at 75 does nothing');
  you.power = 80;
  g.Run.bump(run, 'power', -5);
  eq(you.power, 75, 'a negative event still applies to a raised stat');
  you.power = 80;
  g.Run.bump(run, 'power', 4);
  eq(you.power, 80, 'a stat already at 80 is not lowered by a positive bump');
  g.Training.addXp(run, 'power', 100000, 'match');
  assert(you.power > 80, 'match XP goes past the training cap');
  assert(!('lb' in run) && g.RUN_VERSION === 8, 'no Limit Break progress in the run; RUN_VERSION 8');
  run.uses.power = 26;
  eq(g.Training.facility(run, 'power'), 4, 'Lv 5 after 26 sessions');
  const n = g.Training.preview(run, 'power', false).main[2],
    h = g.Training.preview(run, 'power', true);
  assert(h.main[2] > n && h.sta === 2 * g.Training.preview(run, 'power', false).sta, 'Hard: more gain, double stamina');
});
test('career: match XP — performance, opponent strength, past the cap', () => {
  const g = load(61),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Xp', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    mine = g.Run.myTeam(run),
    foe = run.teams[1],
    line = { k: 4, blk: 2, dig: 3, ast: 6, ace: 1, att: 10, err: 0 };
  const xpFor = (oppLevel, winner) => {
    for (const p of foe.P) for (const k of g.STATK) p[k] = oppLevel;
    const got = {},
      keep = g.Training.addXp;
    g.Training.addXp = (r, stat, xp, src) => ((got[stat] = xp), eq(src, 'match', 'source'), '');
    const m = { stat: { [you.id]: line }, lineup0: [{ P: mine.P }, { P: foe.P }], winner };
    g.Growth.matchXp(run, m, mine, foe);
    g.Training.addXp = keep;
    return got;
  };
  const base = g.teamOvr(mine);
  for (const p of foe.P) for (const k of g.STATK) p[k] = 60;
  // a level that gives the same team ovr as yours: search
  let L = 25;
  while (L < 99 && g.teamOvr({ P: foe.P.map(p => ({ ...p, ...Object.fromEntries(g.STATK.map(k => [k, L])) })) }) < base) L++;
  const eq1 = xpFor(L, 0);
  eq(eq1.power, 4 * 12 + 1 * 8, 'kills and aces → power');
  eq(eq1.jump, 2 * 8 + 10, 'blocks and attempts → jump');
  eq(eq1.def, 2 * 8 + 3 * 6, 'blocks and digs → defense');
  eq(eq1.speed, 3 * 6, 'digs → speed');
  eq(eq1.wit, 6 * 2, 'assists → wit');
  const strong = xpFor(L + 12, 0),
    weak = xpFor(L - 30, 0);
  assert(strong.power > eq1.power && strong.power <= eq1.power * 2, `stronger side gives more (${strong.power} vs ${eq1.power})`);
  eq(weak.power, Math.round(56 * 0.3), 'a much weaker side gives ×0.3');
  eq(JSON.stringify(xpFor(L, 1)), JSON.stringify(eq1), 'the winner flag changes nothing');
  // past the training cap: matches raise a stat at 75
  you.power = 75;
  run.xp = {};
  const label = g.Training.addXp(run, 'power', 200, 'match');
  assert(you.power > 75 && /^\+\d+ Power/.test(label), `a stat at 75 rises from match XP (${you.power})`);
  // never played → no XP line
  for (const p of foe.P) for (const k of g.STATK) p[k] = 55;
  run.week = 4;
  run.eval = null;
  run.event = null;
  const fx = g.Cup.fixture(run, 'eval'),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  m.played.delete(you.id);
  const xp0 = JSON.stringify({ ...run.xp, wit: 0 }),
    txt = fx.onFinish(m);
  assert(!/XP:/.test(txt) && JSON.stringify({ ...run.xp, wit: 0 }) === xp0, `never played → no match XP (${txt})`);
  // a played match shows the XP labels
  run.week = 8;
  run.eval = null;
  run.event = null;
  const fx2 = g.Cup.fixture(run, 'eval'),
    m2 = g.newMatch(fx2.a, fx2.b, false);
  while (!m2.over) g.playRally(m2);
  m2.played.add(you.id);
  m2.stat[you.id] = { ...g.blank(), k: 5, blk: 1 };
  assert(/XP: /.test(fx2.onFinish(m2)), 'the result line shows the XP labels');
});
test('career: start from 1', () => {
  const g = load(71),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Zero', mode: {} }),
    you = g.Run.you(run);
  for (const k of g.STATK) eq(you[k], 1, `${k} starts at 1`);
  eq(you.wit, 1, 'wit starts at 1.0');
  assert(g.ovr(you) >= 0 && Number.isFinite(g.ovr(you)), `ovr is a number (${g.ovr(you)})`);
  eq(g.Training.need(1), 1, 'a first point costs 1 XP');
  eq(g.Training.need(50), 10, 'and 10 XP at 50');
  assert(g.Training.need(20) > g.Training.need(10) && g.Training.need(40) > g.Training.need(20), 'the curve rises');
  // one focused session raises Power by several points
  run.event = null;
  run.sta = run.staMax;
  g.Training.train(run, 'power', false);
  assert(you.power >= 4, `one Power session raises Power from 1 by several points (${you.power})`);
  // the coach benches an all-1 you behind a same-role mate (a middle blocker: the squad has one MB slot; a lone WS still starts for lack of a rival)
  const runMB = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Zero', mode: {} });
  eq(g.Run.lineup(runMB, g.Run.myTeam(runMB), null, true).starts, false, 'you start on the bench');
  // nothing pushes a stat below 1
  for (const k of g.STATK) g.Run.bump(run, k, -999);
  for (const k of g.STATK) assert(you[k] === g.CAREER.statMin, `${k} stops at ${g.CAREER.statMin} (${you[k]})`);
  // 300 sims of a squad with an all-1 player: no NaN / Infinity
  const bad = o => {
    if (typeof o === 'number') return !Number.isFinite(o);
    if (o && typeof o === 'object') return Object.values(o).some(bad);
    return false;
  };
  const mine = g.Run.myTeam(run);
  for (const k of g.STATK) you[k] = 1;
  for (let i = 0; i < 300; i++) {
    const m = g.newMatch(mine, run.teams[i % 8], i < 30);
    let n = 0;
    while (!m.over && n++ < 3000) {
      const r = g.playRally(m);
      if (i < 30) assert(!bad(r.beats), 'no NaN / Infinity in the beats');
    }
    assert(m.over, 'the match ends (no stall)');
    assert(!bad(m.stat), 'no NaN / Infinity in m.stat');
  }
});
test('career: match history', () => {
  const g = load(61),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Hist', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    play = fx => {
      const m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      return m;
    };
  eq(JSON.stringify(run.mlog), '[]', 'a new run has an empty history');
  // an evaluation: the snapshot is the kick-off state (before the match XP)
  run.week = 4;
  run.eval = null;
  run.event = null;
  const fx = g.Cup.fixture(run, 'eval'),
    m = play(fx),
    before = { ovr: g.ovr(you), power: you.power, def: you.def, speed: you.speed, jump: you.jump, wit: you.wit };
  m.played.add(you.id);
  fx.onFinish(m);
  eq(run.mlog.length, 1, 'an evaluation adds one entry');
  const e = run.mlog[0];
  eq(e.kind, 'eval', 'kind');
  eq(JSON.stringify(e.score), JSON.stringify([m.setScores[0][0], m.setScores[0][1]]), 'score');
  eq(e.win, m.winner === 0, 'win');
  eq(JSON.stringify(e.you), JSON.stringify(before), 'you = your stats before the match');
  const ids = e.box.filter(b => b.you).length;
  eq(ids, 1, 'you appear once in the box');
  eq(e.box.length, m.played.size, 'the box has every player who played, once');
  eq(JSON.stringify(JSON.parse(JSON.stringify(e))), JSON.stringify(e), 'plain JSON');
  // a challenge and a street fight
  run.days = g.WEEK_DAYS;
  run.week = 5;
  run.money = 500;
  const ti = g.FACTIONS.findIndex(f => f.region === 'outlaws');
  const stake = g.CHALLENGE.outlaws.minStake,
    fc = g.Cup.challenge(run, ti, stake),
    mc = play(fc);
  fc.onFinish(mc);
  eq(run.mlog.length, 2, 'a challenge adds one entry');
  eq(run.mlog[1].kind, 'challenge', 'kind challenge');
  eq(run.mlog[1].stake, stake, 'with its stake');
  eq(run.mlog[1].win, mc.winner === 0, 'win');
  run.days = 7;
  run.lastFight = null; // (no fight ban or injury after the challenge)
  run.injury = null;
  run.event = null;
  run.pos = [470, 600];
  run.clash = { site: 0, seen: false, done: false };
  const fs = g.Cup.clash(run, g.CLASH.sites[0].a),
    ms = play(fs);
  fs.onFinish(ms);
  eq(run.mlog.length, 3, 'a street fight adds one entry');
  eq(run.mlog[2].kind, 'street', 'kind street');
  eq(run.mlog[2].win, ms.winner === 0, 'win');
  eq(JSON.stringify(JSON.parse(JSON.stringify(run.mlog))), JSON.stringify(run.mlog), 'the whole log is plain JSON');
  // trimming and repair
  for (let i = 0; i < g.MLOG.max + 5; i++) run.mlog.push({ ...e, week: i });
  run.days = g.WEEK_DAYS;
  run.week = 8;
  run.eval = null;
  run.event = null;
  const fx3 = g.Cup.fixture(run, 'eval'),
    m3 = play(fx3);
  fx3.onFinish(m3);
  eq(run.mlog.length, g.MLOG.max, 'trimmed at MLOG.max');
  eq(run.mlog[run.mlog.length - 1].week, 8, 'the newest is kept');
  delete run.mlog;
  g.Run.repair(run);
  eq(JSON.stringify(run.mlog), '[]', 'repair adds mlog');
});
test('career: techniques are learned in play, not bought', () => {
  const g = load(71),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Tech', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  run.sp = 9999;
  assert(
    !g.Skills.canLearn(run, 'cutshot') && !g.Skills.learn(run, 'cutshot') && !you.skills.includes('cutshot'),
    'a technique cannot be bought'
  );
  assert(g.Skills.canLearn(run, 'thunder'), 'a basic skill still can');
  // a fake finished match: you are on side 0, the foe on side 1
  const foe = run.teams[1],
    mk = (line, teacher) => {
      for (const p of foe.P) {
        p.skills = [];
        p.wit = 0.1;
        for (const k of g.STATK) p[k] = 30; // meets no technique's requirement
      }
      if (teacher) foe.P[0].skills = [teacher];
      const stat = { [you.id]: { ...g.blank(), ...line } };
      return {
        stat,
        t: [g.Run.myTeam(run), foe],
        lineup0: [{ P: g.Run.myTeam(run).P }, { P: foe.P }],
        played: new Set(foe.P.map(p => p.id))
      };
    };
  const low = g.RNG.next;
  g.RNG.next = () => 0.001;
  // by doing: 3+ kills → an Attack technique for a WS (cutshot / delayed spike), first in SKILLS order
  let txt = g.Skills.tryLearn(run, mk({ k: 3 }));
  assert(/^Learned .+ in play \(by doing\)$/.test(txt) && you.skills.length === 1, `learned by doing: ${txt}`);
  assert(g.SKILLS[you.skills[0]].tech === 'Attack', 'an Attack technique');
  // never two in one match, and a second match with the same line teaches the next one
  eq(you.skills.length, 1, 'one technique per match');
  txt = g.Skills.tryLearn(run, mk({ k: 3 }));
  eq(you.skills.length, 2, 'the next match teaches another');
  // below the thresholds and nobody with it → nothing (and no random draw)
  let draws = 0;
  g.RNG.next = () => (draws++, 0.001);
  eq(g.Skills.tryLearn(run, mk({ k: 1 })), '', 'nothing learned below the threshold');
  eq(draws, 0, 'no candidate → no roll');
  // by facing: a foe who has a Serve technique, you did nothing
  you.skills = [];
  const m = mk({}, 'target');
  foe.P[0].skills = ['target'];
  txt = g.Skills.tryLearn(run, m);
  assert(/from /.test(txt) && you.skills.includes('target'), `learned by facing: ${txt}`);
  g.RNG.next = () => 0.999;
  you.skills = [];
  eq(g.Skills.tryLearn(run, mk({ k: 9 })), '', 'a high roll learns nothing');
  g.RNG.next = low;
  // scouting: the dossier lists techniques only once ratings are visible
  const d = g.Dossier.build(run, 'wei');
  assert(
    d.roster.every(p => (d.scouted || d.member ? Array.isArray(p.techs) : p.techs === null)),
    'dossier techs hidden until scouted'
  );
  run.scout = Object.fromEntries(run.teams.map(t => [t.i, run.week]));
  const d2 = g.Dossier.build(run, 'wei');
  assert(d2.scouted && d2.roster.every(p => Array.isArray(p.techs)), 'dossier techs shown once scouted');
});
test('engine: elements — rarity, every element fires, counters, captain buff', () => {
  const g = load(21);
  // rarity: regular players never; OP always; roughly 1 in 4 other stars
  let st = 0,
    stOn = 0;
  for (let i = 0; i < 12; i++)
    for (const t of g.mkTeams())
      for (const p of t.P) {
        assert(g.ELS.includes(p.el) && p.sig && g.TWIST[p.sig.tw] && p.sig.name, 'every player has an element and a signature');
        if (!p.star) assert(!p.elOn, 'regular players never unlock');
        else if (p.op) assert(p.elOn, 'OP players always unlock');
        else {
          st++;
          if (p.elOn) stOn++;
        }
      }
  assert(stOn / st > 0.12 && stOn / st < 0.4, `star unlock share ${(stOn / st).toFixed(2)}`);
  // assignment draws no random numbers (seeded runs stay reproducible) and is stable
  const q = g.mkTeams()[0].P[1],
    el0 = q.el;
  delete q.el;
  delete q.sig;
  g.elAssign(q);
  eq(q.el, el0, 'same player, same element');
  // every element charges and fires somewhere across Monster games; element spikes win most points
  const fired = {};
  let won = 0,
    n = 0;
  for (let i = 0; i < 70; i++) {
    const [a, b] = g.mkMonsterTeams(),
      m = g.simMatch(a, b);
    for (const L of m.elLog) {
      fired[L.el] = (fired[L.el] || 0) + 1;
      n++;
      if (L.won) won++;
      assert(L.won === true || L.won === false, 'element spike outcome recorded');
    }
  }
  for (const e of g.ELS) assert(fired[e] > 0, `${e} never fired`);
  assert(won / n > 0.55 && won / n < 0.85, `element spike win rate ${(won / n).toFixed(2)}`);
  // counters: a defender whose element beats the attacker's halves the effect; Blast has no counter
  const [A, B] = g.mkMonsterTeams(),
    m = g.newMatch(A, B, false),
    hit = A.P[3];
  hit.el = 'fire';
  for (const p of B.P) p.el = 'earth';
  eq(g.elSpike(m, hit, hit, A.P[0], B, false).pow, 1.15, 'full fire power');
  B.P[2].el = 'water';
  const r = g.elSpike(m, hit, hit, A.P[0], B, false);
  eq(r.res, B.P[2], 'water resists fire');
  assert(Math.abs(r.pow - 1.075) < 1e-9, 'resisted: half the effect');
  hit.el = 'blast';
  eq(g.elSpike(m, hit, hit, A.P[0], B, false).res, null, 'blast has no counter');
  // captain's buff fills the gauge: the next attack is guaranteed to be an element spike
  hit.el = 'fire';
  m.eg[hit.id] = 0;
  assert(g.elBuff(m, hit) && g.elReady(m, hit), 'buff fills the gauge');
  const reg = g.mkTeams()[0].P.find(p => !p.elOn);
  assert(!g.elBuff(m, reg) && !g.elReady(m, reg), 'no element, no gauge');
});
test('career: element hidden → revealed → Element Trial → unlocked, and saved', () => {
  const g = load(22),
    run = g.Run.create(g.Run.draft(), {
      role: 'WS',
      name: 'Spark',
      alloc: { power: 20, def: 10, speed: 10, jump: 20 },
      witSteps: 0
    }),
    you = g.Run.you(run);
  assert(you.el && !you.elOn && !you.elSeen, 'your element starts hidden and locked');
  for (const k of g.STATK) you[k] = 80;
  g.Growth.checkYou(run, you);
  assert(you.elSeen && you.star, 'revealed at OVR 70 (and a star at this level)');
  const fake = { zoneHit: [0, 0] };
  eq(g.ElTrial.match(run, fake, 'S'), '', 'no zone, no proof');
  fake.zoneHit[0] = 1;
  eq(g.ElTrial.match(run, fake, 'A'), '', 'grade S needed');
  assert(g.ElTrial.match(run, fake, 'S') && run.elProof, 'S grade in the zone proves it');
  run.event = null;
  g.ElTrial.offer(run);
  eq(run.event && run.event.id, 'element', 'trial offered');
  assert(g.Events.def(run.event, run).title.includes('awakening'), 'trial card');
  // fail → back in 3 weeks; pass → unlocked for good
  let tries = 0;
  while (!you.elOn && tries++ < 40) {
    run.event = null;
    run.elNext = 0;
    run.sta = run.staMax;
    g.ElTrial.offer(run);
    const w = run.week;
    g.Events.choose(run, 0);
    if (!you.elOn) eq(run.elNext, w + g.ElTrial.retry, 'failed trial returns later');
  }
  assert(you.elOn, 'trial eventually passes');
  g.Run.save(run);
  const back = g.Run.load(),
    y2 = g.Run.you(back);
  assert(y2.elOn && y2.el === you.el && y2.sig.name === you.sig.name, 'element survives save/load');
});

test('engine: the setter takes the second ball', () => {
  const g = load(5);
  let sets = 0,
    ast = 0,
    astNon = 0,
    reach = 0;
  for (let i = 0; i < 400; i++) {
    const T = g.mkTeams(),
      m = g.newMatch(T[i % 8], T[(i + 3) % 8], false);
    while (!m.over) g.playRally(m);
    for (const e of m.setBy || []) {
      sets++;
      if (e.why === 'reach') {
        reach++;
        assert(e.role !== 'S' && e.ts > g.SETTER.beat * e.tm, `a teammate sets only when out-reaching the setter (${e.ts} vs ${e.tm})`);
      } else if (e.why === 'free') {
        assert(e.role === 'S' && (e.tm === null || e.ts <= g.SETTER.beat * e.tm), 'otherwise the free setter sets');
      } else assert(e.why === 'none', 'a non-setter sets with no setter free: the setter passed or is busy');
    }
    for (const side of m.t)
      for (const p of [...side.P, ...side.bench]) {
        const s = m.stat[p.id];
        if (!s) continue;
        ast += s.ast;
        if (p.role !== 'S') astNon += s.ast;
      }
  }
  assert(sets > 4000 && reach > 0, `sets were judged (${sets}, ${reach} won by reach)`);
  assert(astNon / ast < 0.11, `assists by non-setters ${((100 * astNon) / ast).toFixed(1)} % (was ~12.5 %)`);
});
test('engine: staged scenes are rare and well-formed', () => {
  const g = load(31);
  let scenes = 0,
    matches = 0;
  for (let i = 0; i < 30; i++) {
    const [a, b] = g.mkTeams(),
      ids = new Set([...g.squadOf(a), ...g.squadOf(b)].map(p => p.id)),
      m = g.newMatch(a, b, true);
    while (!m.over)
      for (const bt of g.playRally(m).beats) {
        if (!bt.scene) continue;
        assert(bt.scene === 1 || bt.scene === 2, 'scene level 1 or 2');
        for (const a2 of bt.acts)
          if ((a2.k === 'shot' && a2.kind) || a2.k === 'call') assert(ids.has(a2.p), 'scene act names a player on court');
        if (bt.scene === 1 && bt.acts.some(a2 => a2.k === 'shot' && a2.kind === 'face')) scenes++; // what Normal Hype shows
      }
    matches++;
  }
  const per = scenes / matches;
  assert(per >= 1 && per <= 8, `scenes per match ${per}`); // target ≈ 6–7 on average; 30 matches (10 were noisy: T-054 moved the random stream)
});

test('engine: recorded beats stay well-formed in every mode (no NaN, known players, matches end)', () => {
  for (let s = 0; s < 24; s++) {
    const g = load(9000 + s),
      T = g[['mkTeams', 'mkMonsterTeams', 'mkLeagueTeams'][s % 3]](),
      [a, b] = [T[0], T[1 + (s % (T.length - 1))]],
      ids = new Set([...g.squadOf(a), ...g.squadOf(b)].map(p => p.id)),
      m = g.newMatch(a, b, true);
    let guard = 0;
    while (!m.over && guard++ < 200)
      for (const bt of g.playRally(m).beats) {
        assert(bt.dur > 0 && Number.isFinite(bt.dur), 'beat duration');
        for (const x of bt.acts) {
          for (const f of ['p', 'p1', 'p2']) if (x[f] != null) assert(ids.has(x[f]), `${x.k} names an unknown player`);
          if (x.k === 'sub') assert(ids.has(x.out) && ids.has(x.in), 'sub names known players');
          for (const [k, v] of Object.entries(x)) if (typeof v === 'number') assert(Number.isFinite(v), `${x.k}.${k} is not finite`);
        }
      }
    assert(m.over, 'match ends');
  }
});

test('career: free agent start, club join conditions, paydays, transfers, spectated cup', () => {
  const g = load(41),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Walk-on', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  assert(g.World.isFree(run) && g.Run.myTeam(run) === run.pickup && run.pickup.P.length === 4, 'starts on a pickup squad');
  eq(run.staMax, g.CAREER.staMax, 'base stamina cap');
  assert(run.pickup.name === 'Academy squad', 'the pickup squad is the Academy squad');
  assert(g.World.leaveAcademy(run) && g.Run.mates(run).length === 0, 'leaving the squad leaves you alone');
  assert(!g.World.leaveAcademy(run), 'a second leave does nothing');
  g.Run.save(run);
  assert(g.Run.load().academy === false, 'academy: false is saved');
  assert(!('legacy' in run) && !('pure' in run) && !('legend' in run), 'no meta-progression fields on a new run');
  eq(run.money, g.ECON.start, 'starting money');
  // a club with a fee you can't pay is locked; an open club signs you and you take a same-role slot
  const pricey = g.FACTIONS.findIndex(f => f.join.fee > run.money),
    open = g.FACTIONS.findIndex(f => !Object.keys(f.join).length);
  assert(!g.World.canJoin(run, pricey).ok && !g.World.join(run, pricey), 'fee club locked');
  assert(g.World.join(run, open), 'open club signs you');
  eq(run.team, open, 'on the club');
  assert(run.teams[open].P.includes(you) && run.teams[open].P.length === 4 && run.pickup.P.length === 4, 'rosters stay 4');
  assert(!g.World.canJoin(run, open).ok, "can't sign twice");
  // payday: allowance − food − rent; an empty wallet means eviction
  g.World.setHousing(run, 'condo');
  run.money = 0;
  run.week = 4;
  g.World.payday(run);
  eq(run.housing, 'homeless', 'evicted when broke');
  assert(run.gazette && run.gazette.items.length, 'gazette published');
  for (const t of run.teams) assert(t.P.length === 4 && t.P.every(p => p.team === t), 'transfers keep rosters linked');
  // a free agent who leaves the Academy and never signs watches the cup and the run still ends
  const h = load(42),
    r2 = h.Run.create(h.Run.draft(), { role: 'MB', name: 'Loner', alloc: { power: 10, def: 20, speed: 10, jump: 20 }, witSteps: 0 });
  assert(h.World.leaveAcademy(r2), 'leaves the Academy squad');
  let guard = 0;
  while (!r2.result && guard++ < 200) {
    if (r2.event) {
      const pre = r2.event.pre;
      h.Events.choose(r2, 1);
      if (!pre) h.Run.endWeek(r2);
      continue;
    }
    const wt = h.Run.weekType(r2);
    if (wt === 'eval') {
      const region = r2.eval.region,
        fx = h.Cup.fixture(r2, 'eval'),
        m = h.newMatch(fx.a, fx.b, false);
      while (!m.over) h.playRally(m);
      fx.onFinish(m);
      assert(
        h.Pool.players(r2, region).every(p => p.team.i !== -2),
        'nobody stays lent after an evaluation'
      );
    } else {
      h.Training.rest(r2);
      h.Run.endWeek(r2);
    }
  }
  assert(r2.result, 'run ends');
  eq(r2.cups.map(c => c.place).join(','), h.NO_CUP, 'cup watched');
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
  eq(g.City.trip(run, g.City.at(run, 'sand')), 0, 'the sand courts are by the airport');
  eq(g.City.trip(run, g.City.at(run, 'harbor')), g.TRIP_MAX, 'the far east coast: the longest trip');
  eq(g.City.trip(run, [2000, 2000]), g.TRIP_MAX, 'never more than 3 days');
  const m0 = run.money,
    sp0 = run.sp;
  assert(g.City.day(run, 'sand', false), 'train on the sand');
  eq(run.money, m0 - g.City.price(run, 'sand'), 'the session is paid');
  assert(run.sp > sp0, 'sand builds technique (skill points)');
  eq(g.City.days(run), 6, 'a local session takes a day');
  run.event = null;
  const mate = g.Run.mates(run)[0].id,
    b0 = g.Run.you(run).bond[mate] || 0,
    cb = g.City.cost(run, 'bonfire');
  assert(g.City.day(run, 'bonfire'), 'night out at the bonfire');
  assert((g.Run.you(run).bond[mate] || 0) > b0, 'the night out raises bond');
  eq(g.City.days(run), 6 - cb, 'the trip + the night');
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
  const td = g.City.travelDays(run, [700, 300]);
  assert(g.City.travelTo(run, [700, 300]) && g.City.days(run) === 7 - td && g.City.loc(run) === 'wei', 'walked into the city');
  assert(g.City.seen(run, [720, 320]), 'the fog lifts around you');
  eq(g.City.regionAt([540, 500]), 'open', 'Central Academy belongs to nobody');
  eq(g.City.regionAt([815, 470]), 'outlaws', 'the overpass is the Outlaws');
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
  run.pos = [470, 600];
  run.clash = { site: 0, seen: false, done: false };
  const c = g.CLASH.sites[0],
    r0 = g.City.rep(run, c.b),
    cc = g.City.clashCost(run),
    clashSp0 = run.sp;
  for (const k of g.STATK) g.Run.you(run)[k] = 70; // (a new player starts at 1: give you a normal player's line so the match XP shows)
  const fx = g.Cup.clash(run, c.a);
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
      back.loc === 'wu',
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

test('career: faction pools — sizes, reserves, no overlap, saved', () => {
  const spec = { role: 'WS', name: 'Pool', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 };
  const g = load(91),
    run = g.Run.create(g.Run.draft(), spec);
  for (const r of Object.keys(g.POOL)) assert(g.Pool.size(run, r) === g.POOL[r], `pool ${r} has ${g.POOL[r]} players`);
  const ids = new Set();
  let n = 0;
  const all = [...run.teams, run.pickup, ...Object.values(run.reserve)].filter(Boolean);
  for (const t of all) for (const p of g.squadOf(t)) (ids.add(p.id), n++);
  assert(ids.size === n, 'every player id is unique across teams, pickup and reserves');
  eq(
    Object.keys(g.POOL)
      .map(r => (run.reserve[r] ? run.reserve[r].P.length : 0))
      .join(),
    '12,6,0,0,0',
    'reserves fill Wei 24 / Wu 18 / Shu 12 / Outlaws 6 / Gloria 6'
  );
  const you = g.Run.you(run);
  for (const [r, t] of Object.entries(run.reserve)) {
    assert(t.P.length > 0 || g.Pool.size(run, r) === g.POOL[r], `reserve ${r} fills the pool`);
    for (const p of t.P) assert(p.team === t && p !== you, 'reserve players belong to their reserve only');
  }
  assert(
    !run.pickup || run.pickup.P.every(p => !Object.values(run.reserve).some(t => t.P.includes(p))),
    'pickup players are in no reserve'
  );
  g.Run.save(run);
  const back = g.Run.load();
  for (const [r, t] of Object.entries(run.reserve)) {
    const b = back.reserve[r];
    assert(b && b.P.length === t.P.length, `reserve ${r} saved`);
    t.P.forEach((p, i) => {
      const q = b.P[i];
      assert(q.id === p.id && q.name === p.name && q.power === p.power && q.jump === p.jump, 'reserve player round-trips');
      assert(q.team === b, 'reserve player is re-linked to its team');
    });
  }
  const a = load(92).Run.create(load(92).Run.draft(), spec),
    hg = load(92),
    h = hg.Run.create(hg.Run.draft(), Object.assign({ mode: { hard: true } }, spec));
  for (const r of Object.keys(a.reserve)) {
    a.reserve[r].P.forEach((p, i) => assert(h.reserve[r].P[i].power >= p.power, 'Hard reserves are at least as strong'));
  }
});

test('career: pool draw — squads, roles, weights, your spot', () => {
  const spec = { role: 'WS', name: 'Draw', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 };
  const g = load(93),
    run = g.Run.create(g.Run.draft(), spec);
  const before = JSON.stringify([run.teams.map(g.teamToJSON), Object.values(run.reserve).map(g.teamToJSON)]);
  const sq = g.Pool.draw(run, 'wei');
  assert(sq.length === 4 && sq.every(s => s.length === 6), 'Wei draws 4 squads of 6');
  const flat = sq.flat();
  assert(new Set(flat).size === 24, 'no player twice');
  assert(
    sq.every(s => s[0].role === 'S' && s[1].role === 'MB' && s[2].role === 'WS' && s[3].role === 'WS'),
    'the first 4 of each squad are in court order S, MB, WS, WS (2 more on the bench)'
  );
  const rated = g.Pool.players(run, 'wei')
      .filter(p => !p.you)
      .sort((a, b) => g.ovr(b) - g.ovr(a)),
    top = new Set(rated.slice(0, 5)),
    low = new Set(rated.slice(-5));
  let nt = 0,
    nl = 0;
  for (let i = 0; i < 300; i++) {
    for (const s of g.Pool.draw(run, 'wei', 1))
      for (const p of s) {
        if (top.has(p)) nt++;
        if (low.has(p)) nl++;
      }
  }
  assert(nt > nl, `the best are drawn more often than the weakest (${nt} vs ${nl})`);
  assert(
    g.Pool.draw(run, 'wei')
      .flat()
      .every(p => !p.you),
    'a free agent is never drawn'
  );
  const after = JSON.stringify([run.teams.map(g.teamToJSON), Object.values(run.reserve).map(g.teamToJSON)]);
  assert(before === after, 'drawing changes no team or reserve');
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  g.FACTIONS[wei].join = {};
  assert(g.World.join(run, wei), 'sign with a Wei club');
  run.rep.wei = 60;
  const you = g.Run.you(run);
  for (let i = 0; i < 20; i++) assert(g.Pool.draw(run, 'wei').flat().includes(you), 'standing 60 → always drawn');
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
  g.Front.seize(run, 'wu', 'wei', 'wei-wu');
  const wu = g.Dossier.build(run, 'wu');
  eq(g.Dossier.build(run, 'wei').state, 'pressed', 'one place lost: pressed');
  const seized = wu.places.find(p => p.seized);
  assert(
    seized && seized.from === 'wei' && !g.Dossier.build(run, 'wei').places.some(p => p.id === seized.id),
    'a seized place moves to the holder'
  );
  eq(wu.state, 'rising', 'the taker is rising');
  g.Front.seize(run, 'wu', 'wei', 'wei-wu');
  eq(g.Dossier.build(run, 'wei').state, 'weakened', 'two places lost: weakened');
  eq(JSON.stringify(run.teams.map(g.teamToJSON)), before, 'building a dossier changes no team');
  const gl = g.Dossier.build(run, 'gloria');
  assert(gl.state === 'minor' && gl.fronts.length === 0, 'St. Gloria is not in the war');
});

test('career: reserves grow and get promoted', () => {
  const g = load(95),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Res', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  const sum = p => g.STATK.reduce((a, k) => a + p[k], 0),
    all = () => Object.values(run.reserve).flatMap(t => t.P);
  const before = all().reduce((a, p) => a + sum(p), 0);
  for (let i = 0; i < 8; i++) {
    run.event = null;
    g.Run.endWeek(run);
  }
  assert(all().reduce((a, p) => a + sum(p), 0) > before, 'reserves gain stats week by week');
  const sizes = Object.fromEntries(Object.keys(g.POOL).map(r => [r, g.Pool.size(run, r)]));
  const res = run.reserve.wei.P[0];
  for (const k of g.STATK) res[k] = 95;
  g.World.promote(run);
  const wt = run.teams.find(t => t.P.includes(res));
  assert(wt && g.FACTIONS[wt.i].region === 'wei' && res.team === wt, 'the reserve joined a Wei league team');
  assert(run.reserve.wei.P.some(p => p.team === run.reserve.wei) && !run.reserve.wei.P.includes(res), 'a squad player went down');
  assert(
    run.teams.every(t => t.P.length === 4),
    'every team still has 4 players'
  );
  for (const r of Object.keys(g.POOL)) eq(g.Pool.size(run, r), sizes[r], `pool ${r} size unchanged`);
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

test('career: evaluation rules', () => {
  const g = load(96),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Evalu', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  eq(g.Eval.kind(run), 'academy', 'a free agent in the Academy squad is evaluated by the Academy');
  run.week = 4;
  run.eval = null;
  const e = g.Eval.setup(run);
  assert(e && e.kind === 'academy' && e.mine === null && e.opp.length === 6, 'week 4: your side is the squad, the opponent has 6 ids');
  const pool = new Set(g.Pool.players(run, e.region).map(p => p.id));
  assert(g.MAJORS.includes(e.region) && e.opp.every(id => pool.has(id)), 'the opponent is drawn from one major pool');
  eq(g.Run.weekType(run), 'eval', 'week 4 is an evaluation week');
  const before = new Map(g.Pool.players(run, e.region).map(p => [p.id, p.team]));
  const T = g.Eval.squad(run, e.opp, 'Opp · Eval', '#fff');
  g.Eval.lend(run, T);
  g.Eval.lend(run, T);
  assert(
    T.P.every(p => p.team === T),
    'lent players point at the squad'
  );
  g.Eval.restore();
  g.Eval.restore();
  assert(
    g.Pool.players(run, e.region).every(p => p.team === before.get(p.id)),
    'restore puts every player back'
  );
  const you0 = g.Run.you(run),
    w0 = you0.wit,
    xp0 = run.xp.wit || 0;
  assert(g.Eval.bench(run).includes('Watched from the bench'), 'bench returns the diary line');
  assert(you0.wit > w0 || (run.xp.wit || 0) > xp0, 'the bench banks wit XP');
  g.World.leaveAcademy(run);
  eq(g.Eval.kind(run), null, 'alone: no evaluation');
  eq(g.Run.weekType(run), 'train', 'week 4 is a plain training week when alone');
  // signed with a major and standing 60: drawn every time, against a different squad
  const g2 = load(97),
    r2 = g2.Run.create(g2.Run.draft(), { role: 'WS', name: 'Sign', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    wei = g2.FACTIONS.findIndex(f => f.region === 'wei');
  g2.FACTIONS[wei].join = {};
  assert(g2.World.join(r2, wei), 'sign with a Wei club');
  r2.week = 8;
  r2.rep.wei = 60;
  r2.eval = null;
  const e2 = g2.Eval.setup(r2),
    you = g2.Run.you(r2);
  assert(
    e2.kind === 'faction' && e2.region === 'wei' && e2.mine.includes(you.id) && e2.opp.length === 6,
    'faction evaluation: you are in it'
  );
  assert(!e2.opp.some(id => e2.mine.includes(id)), 'a different squad');
  const gl = g2.FACTIONS.findIndex(f => f.region === 'gloria');
  r2.team = gl;
  eq(g2.Eval.kind(r2), null, 'a minor club has no evaluation');
});

test('bracket: 8 and 16 entries, byes', () => {
  const g = load(1);
  const play = order => {
    const S = g.newBracket(order),
      played = [];
    let m;
    while ((m = g.advanceBracket(S))) {
      assert(m.a !== null && m.b !== null, 'a bye reached the caller');
      m.w = Math.min(m.a, m.b); // the lower index wins
      played.push(m.round);
    }
    return { S, played };
  };
  // 8 entries: 4 quarterfinals, 2 semifinals, a final — as before
  const r8 = play([0, 7, 3, 4, 1, 6, 2, 5]);
  eq(r8.played.join(), 'Quarterfinal,Quarterfinal,Quarterfinal,Quarterfinal,Semifinal,Semifinal,Final');
  eq(g.bracketChampion(r8.S), 0);
  eq(g.newBracket([0, 7, 3, 4, 1, 6, 2, 5])[1].round, 'Quarterfinal');
  // 16 slots, 13 entrants (seeds 14–16 are byes)
  const ord = g.seedOrder(16).map(s => (s <= 13 ? s - 1 : null));
  eq(ord.filter(x => x === null).length, 3);
  const r16 = play(ord);
  eq(r16.played.length, 12, 'real matches with 3 byes');
  eq(r16.played.filter(r => r === 'Round of 16').length, 5);
  eq(g.bracketChampion(r16.S), 0);
  assert(
    r16.S.filter(x => x.round === 'Round of 16').every(x => x.w !== null),
    'every first-round slot resolved'
  );
  eq(g.bracketChampion(g.newBracket(ord)), null, 'no champion before the final');
  // seeds: 1 plays n, and seeds 1 and 2 sit in opposite halves
  for (const n of [8, 16]) {
    const o = g.seedOrder(n);
    eq(new Set(o).size, n);
    for (let k = 0; k < n; k += 2) eq(o[k] + o[k + 1], n + 1);
    assert(o.indexOf(1) < n / 2 && o.indexOf(2) >= n / 2, 'seeds 1 and 2 meet only in the final');
  }
  // an all-bye pair advances nothing
  const S = g.newBracket([0, 1, null, null, 2, 3, 4, 5]);
  g.advanceBracket(S);
  assert(S[1].bye === true && S[1].w === null, 'empty slot marked bye');
});
test('career: U21 Final Cup — entrants, seeding, byes, restore', () => {
  const mk = seed => {
    const g = load(seed);
    return [
      g,
      g.Run.create(g.Run.draft(), { role: 'WS', name: 'Cupper', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 })
    ];
  };
  // an Academy run: 11 drawn squads + the Academy squad, 4 byes, you are the Academy entrant
  const [g, run] = mk(61),
    sizes = Object.keys(g.POOL).map(r => g.Pool.size(run, r)),
    all = Object.keys(g.POOL)
      .flatMap(r => g.Pool.players(run, r))
      .concat(g.squadOf(run.pickup)),
    homes = all.map(p => p.team);
  g.Cup.start(run, g.CUPS[0]);
  const E = run.cup.entrants,
    S = run.cup.sched;
  eq(E.length, 12, '11 drawn squads (Wei 4, Wu 3, Shu 2, Outlaws 1, Gloria 1) + the Academy squad');
  assert(
    E.every(e => e.ids.length === 6),
    'every squad has 6'
  );
  assert(E[run.cup.me].academy, 'you are in the Academy entrant');
  eq(S.filter(x => x.round === 'Round of 16' && (x.a == null || x.b == null)).length, 4, 'the 4 top seeds have byes');
  eq(new Set(E.flatMap(e => e.ids)).size, E.flatMap(e => e.ids).length, 'no player in two squads');
  const top = E.map((e, i) => [i, g.Eval.squad(run, e.ids, e.name, e.color, e.region).ovr]).sort((a, b) => b[1] - a[1])[0][0];
  assert(S[0].a === top && S[0].b == null, 'the top seed sits first with a bye');
  g.Cup.finishBracket(run);
  const champ = E[g.bracketChampion(S)];
  assert(champ && typeof champ.name === 'string', 'one champion');
  assert(
    all.every((p, i) => p.team === homes[i]),
    'every player is back on their real team'
  );
  eq(
    Object.keys(g.POOL)
      .map(r => g.Pool.size(run, r))
      .join(),
    sizes.join(),
    'pool sizes unchanged'
  );
  // a Shu member with standing 60 is always drawn
  const [g2, r2] = mk(62),
    shu = g2.FACTIONS.findIndex(f => f.region === 'shu');
  g2.FACTIONS[shu].join = {};
  assert(g2.World.join(r2, shu), 'joins Shu');
  r2.rep = Object.assign({}, r2.rep, { shu: 60 });
  g2.Cup.start(r2, g2.CUPS[0]);
  assert(r2.cup.me >= 0 && !r2.cup.entrants[r2.cup.me].academy, 'a trusted member plays for a Shu squad');
  assert(!r2.result, 'the cup is on');
  // alone: watch it from the stands
  const [g3, r3] = mk(63);
  g3.World.leaveAcademy(r3);
  g3.Cup.start(r3, g3.CUPS[0]);
  eq(r3.cup.me, -1, 'not in the cup');
  eq(r3.cups[0].place, g3.NO_CUP, 'placing: did not play');
  assert(r3.result && typeof r3.result.champ === 'string', 'the run ends and names the champion');
});

test('engine: lane-read block — stuff rate and defence settings', () => {
  // Read vs Read over five team sets: stuffs (kill blocks) and hitter kills as a share of all attacks
  let n = 0,
    stuffs = 0,
    kills = 0;
  for (const seed of [20, 37, 54, 71, 88]) {
    const g = load(seed),
      T = g.mkTeams();
    for (let i = 0; i < 50; i++) {
      const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
      for (const a of m.att) {
        n += a.n;
        kills += a.k;
      }
      for (const id in m.stat) stuffs += m.stat[id].blk;
    }
  }
  const stuffRate = stuffs / n;
  assert(stuffRate >= 0.12 && stuffRate <= 0.16, `stuff rate ${(100 * stuffRate).toFixed(1)} % is outside 12–16 %`);
  assert(kills / n >= 0.36 && kills / n <= 0.48, `hitter kill rate ${((100 * kills) / n).toFixed(1)} % drifted from ~42 %`);
  // a fixed attack style against each defence setting (attacker: side 0)
  const g = load(9),
    T = g.mkTeams(),
    run = (tac, dset) => {
      const t = { q: 0, qs: 0, pin: 0, pins: 0 };
      for (let i = 0; i < 400; i++) {
        const a = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8], { tac: [tac, 'auto'], dset: ['read', dset] }).att[0];
        t.q += a.q;
        t.qs += a.qs;
        t.pin += a.pin;
        t.pins += a.pins;
      }
      return { quickStuff: t.qs / t.q, pinStuff: t.pins / t.pin };
    };
  const mbRead = run('mb', 'read'),
    mbCommit = run('mb', 'commit'),
    wsRead = run('ws', 'read'),
    wsBunch = run('ws', 'bunch');
  assert(
    mbCommit.quickStuff > mbRead.quickStuff + 0.03,
    `Commit stuffs more quicks (${mbCommit.quickStuff.toFixed(3)} vs ${mbRead.quickStuff.toFixed(3)})`
  );
  assert(
    wsBunch.pinStuff < wsRead.pinStuff - 0.02,
    `Bunch leaves the pins open (${wsBunch.pinStuff.toFixed(3)} stuffed vs ${wsRead.pinStuff.toFixed(3)})`
  );
});
test('engine: defence settings — AI default, captain switch, scouting habits', () => {
  const g = load(9),
    T = g.mkTeams(),
    wall = T.find(t => t.S === g.STYLES.wall),
    tempo = T.find(t => t.S === g.STYLES.tempo);
  if (wall) eq(g.newMatch(wall, T[0]).dset[0], 'bunch', 'a wall team starts on Bunch');
  if (tempo) eq(g.newMatch(tempo, T[0]).dset[0], 'commit', 'a tempo team starts on Commit');
  eq(g.newMatch(T[0], T[1], false, { dset: ['bunch', null] }).dsetMode.join(), 'fixed,cap', 'a fixed setting is not the captain’s');
  // a leading captain answers a quick-heavy opponent with Commit (never when the setting is fixed)
  const cap = T.find(t => t.S !== g.STYLES.tempo && t !== T[7]) || T[1],
    foe = T[7];
  for (const p of cap.P) p.lead = 100;
  let sw = 0,
    fixedSw = 0;
  for (let i = 0; i < 50; i++) {
    const m = g.simMatch(foe, cap, { tac: ['mb', 'auto'] });
    sw += m.dsetLog.filter(x => x.side === 1 && x.to === 'commit').length;
    fixedSw += g.simMatch(foe, cap, { tac: ['mb', 'auto'], dset: ['read', 'read'] }).dsetLog.length;
  }
  assert(sw >= 1, 'the captain switches to Commit against an MB-focus attack');
  eq(fixedSw, 0, 'a fixed defence setting never changes');
});
test('career: scouting shows attack habits', () => {
  const g = load(94),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Habits', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.days = 7;
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  let d = g.Dossier.build(run, 'wei');
  assert(
    d.clubs.every(c => c.habits === null),
    'unscouted: no habits'
  );
  assert(g.City.scout(run, wei), 'scout a Wei club');
  d = g.Dossier.build(run, 'wei');
  const h = d.clubs.find(c => c.ti === wei).habits;
  assert(h && h.quick >= 0 && h.quick <= 70 && g.DEFSETS[h.def], 'scouted: habits are filled');
  assert(/^Quicks ~\d+ %.*Defence: \w+$/.test(g.Dossier.habitText(h)), 'the habit line reads as one line');
});

test('teams: 4 on court + 2 bench, unique numbers, captain on court', () => {
  const g = load(77),
    sets = {
      tournament: g.mkTeams(),
      league: g.mkLeagueTeams(),
      monster: g.mkMonsterTeams(),
      pickup: [g.World.pickup(new Set())]
    };
  for (const [k, T] of Object.entries(sets))
    for (const t of T) {
      eq(t.P.length, 4, `${k}: 4 on court`);
      eq(t.bench.length, 2, `${k}: 2 on the bench`);
      const all = g.squadOf(t);
      eq(all.length, 6, `${k}: squadOf is 6`);
      eq(new Set(all.map(p => p.num)).size, 6, `${k}: shirt numbers unique across the squad`);
      assert(
        all.every(p => p.team === t),
        `${k}: everyone links to the team`
      );
      assert(t.P.includes(t.cap) && t.cap.cap && !t.bench.some(p => p.cap), `${k}: the captain plays`);
      assert(
        all.every(p => Number.isFinite(p.lead) && p.el != null),
        `${k}: leadership and element cover the bench`
      );
      eq(t.ovr, g.teamOvr(t), `${k}: rating is the 4 starters`);
    }
  // a save keeps the bench
  const run = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Bench', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  g.Run.save(run);
  const back = g.Run.load();
  for (const [i, t] of run.teams.entries()) {
    const b = back.teams[i];
    eq(b.bench.map(p => p.id).join(), t.bench.map(p => p.id).join(), 'bench ids round-trip');
    assert(
      b.bench.every(p => p.team === b),
      'bench players are re-linked'
    );
    eq(b.bench.map(p => p.num).join(), t.bench.map(p => p.num).join(), 'bench numbers round-trip');
  }
  eq(g.squadOf(back.pickup).length, 6, 'the Academy squad has 6');
});

test('engine: stat guard — invalid stats are repaired, valid ones untouched', () => {
  const g = load(5);
  const T = g.mkTeams();
  const p = T[0].P[2];
  const ok = T[1].P.map(q => JSON.stringify([q.power, q.def, q.speed, q.jump, q.wit]));
  Object.assign(p, { power: -40, def: NaN, speed: 300, wit: -1 });
  const j = p.jump;
  assert(g.fixStats(p) === 4, 'four values fixed');
  eq(JSON.stringify([p.power, p.def, p.speed, p.jump, p.wit]), JSON.stringify([1, 1, 99, j, 0.1]));
  assert(
    T[1].P.every((q, i) => g.fixStats(q) === 0 && JSON.stringify([q.power, q.def, q.speed, q.jump, q.wit]) === ok[i]),
    'valid players untouched'
  );
  Object.assign(T[0].P[3], { power: 0, speed: Infinity, jump: undefined, wit: NaN });
  const m = g.newMatch(T[0], T[1], false);
  while (!m.over) g.playRally(m);
  assert(
    m.over && T[0].P.every(q => [q.power, q.def, q.speed, q.jump].every(v => v >= 1 && v <= 99) && q.wit >= 0.1 && q.wit <= 3),
    'the match ran on repaired stats'
  );
  const dmg = { name: 'x', sk: T[0].sk, bench: [], P: T[0].P.map(q => Object.assign({}, q, { team: undefined, speed: -5 })) };
  const logged = [];
  g.DBG.log = (...a) => logged.push(a[0]); // the headless context has no timers for the real log
  const t2 = g.teamFromJSON(dmg);
  assert(t2.P.every(q => q.speed === 1) && logged[0] === 'warn', 'teamFromJSON repairs a damaged save and logs a warning');
});

test('engine: substitutions — rule, limit, restore', () => {
  const g = load(5),
    T = g.mkTeams(),
    snap = t =>
      JSON.stringify([t.P.map(p => p.id), t.bench.map(p => p.id), squadOfSlots(t), t.cap.id, t.s.id, t.mb.id, t.ws.map(p => p.id)]),
    squadOfSlots = t => g.squadOf(t).map(p => `${p.id}:${p.slot}:${p.cap ? 1 : 0}`);
  let subs = 0;
  for (let i = 0; i < 200; i++) {
    const a = T[i % 8],
      b = T[(i * 3 + 1) % 8],
      before = [snap(a), snap(b)],
      m = g.simMatch(a, b);
    subs += m.subs[0] + m.subs[1];
    assert(m.subs[0] <= g.SUB.max && m.subs[1] <= g.SUB.max, 'never more than SUB.max subs per side');
    eq(snap(a), before[0], 'the lineup is back after the match (side 0)');
    eq(snap(b), before[1], 'the lineup is back after the match (side 1)');
  }
  assert(subs > 20, `tired players get subbed (${subs} subs in 200 matches)`);
  // a mid-match sub: the incoming player takes the seat and slot; leaving mid-way restores everything
  const [a, b] = T,
    m = g.newMatch(a, b, true),
    out = a.P.find(p => p.role === 'WS'),
    inn = a.bench.find(p => p.role === 'WS');
  g.subIn(m, 0, out, inn);
  assert(
    a.P.includes(inn) && a.bench.includes(out) && inn.slot === m.lineup0[0].slots[out.id] && a.ws.includes(inn),
    'the sub takes the seat and slot'
  );
  g.restoreLineups(m);
  g.restoreLineups(m);
  eq(a.P.map(p => p.id).join(), m.lineup0[0].P.map(p => p.id).join(), 'restoreLineups (twice) puts the court back');
  assert(a.bench.includes(inn) && inn.slot === m.lineup0[0].slots[inn.id], 'and the bench and slots');
  // recorded matches: every sub act names known players and is followed by its label and the coach's line
  let acts = 0;
  for (let i = 0; i < 12; i++) {
    const x = T[i % 8],
      y = T[(i + 3) % 8],
      ids = new Set([...g.squadOf(x), ...g.squadOf(y)].map(p => p.id)),
      mm = g.newMatch(x, y, true);
    while (!mm.over)
      for (const bt of g.playRally(mm).beats) {
        const sb = bt.acts.find(q => q.k === 'sub');
        if (!sb) continue;
        acts++;
        assert(ids.has(sb.out) && ids.has(sb.in) && sb.out !== sb.in, 'sub names two known players');
        assert(
          bt.acts.some(q => q.k === 'plabel' && q.t === 'SUBBED' && q.p === sb.in) &&
            bt.acts.some(q => q.k === 'coachtalk' && /#\d+/.test(q.text)),
          'SUBBED label and a coach line with shirt numbers'
        );
      }
  }
  assert(acts > 0, 'recorded matches contain sub acts');
});

test('engine: coach AI — errors, returns, coach IQ', () => {
  const g = load(6),
    T = g.mkTeams(),
    why = {};
  for (let i = 0; i < 200; i++) {
    const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
    for (const x of m.subLog) why[x.why] = (why[x.why] || 0) + 1;
  }
  assert(why.errors > 0, `error subs happen (${JSON.stringify(why)})`);
  assert(why.tired > 0, 'tired subs happen');
  assert(why.back > 0, 'a rested starter returns sometimes');
  // a sharper coach acts sooner: the first sub of side 0 comes at fewer points played (unsubbed matches count as their length)
  const first = iq => {
    let sum = 0,
      n = 0;
    for (const seed of [7, 8, 9, 10]) {
      const g2 = load(seed),
        T2 = g2.mkTeams();
      for (let i = 0; i < 150; i++) {
        const a = T2[i % 8];
        a.coachIQ = iq;
        const m = g2.simMatch(a, T2[(i * 3 + 1) % 8]),
          f = m.subLog.find(x => x.side === 0);
        sum += f ? f.pts : m.pts[0] + m.pts[1];
        n++;
      }
    }
    return sum / n;
  };
  const sharp = first(1),
    dull = first(0);
  assert(sharp < dull, `coachIQ 1 subs sooner than 0 (${sharp.toFixed(1)} vs ${dull.toFixed(1)} points)`);
});

test('engine: three touches — pop-up saves are the set', () => {
  const g = load(13),
    T = g.mkTeams();
  let n = 0,
    over = 0,
    log = [];
  for (let i = 0; i < 300; i++) {
    const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
    if (m.scr) {
      n += m.scr.n;
      over += m.scr.over;
      log = log.concat(m.scrLog);
    }
  }
  assert(n > 0, `pop-up saves happen (${n} in 300 sims)`);
  eq(log.length, n, 'every scramble possession is logged');
  assert(
    log.every(e => e.first !== e.saver && (e.hitter === null || (e.hitter !== e.first && e.hitter !== e.saver))),
    'nobody touches it twice in a row: the hitter is neither the first toucher nor the saver'
  );
  eq(log.filter(e => e.hitter === null).length, over, 'a bump over is the only scramble without a hitter');
});

test('career: rankings — register, gazette, street, known gate', () => {
  const g = load(61),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Rank', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  for (const k of g.STATK) you[k] = 99;
  run.week = 4;
  run.eval = null;
  run.event = null;
  const all = Object.fromEntries(g.Rank.players(run).map(e => [e.p.id, e.p]));
  eq(JSON.stringify(g.Rank.register(run)), JSON.stringify(g.Rank.register(run)), 'the same state gives the same register');
  const R = g.Rank.register(run),
    unknown = R.filter(r => r.ovr === null),
    known = R.filter(r => r.ovr !== null);
  assert(unknown.length > 10 && known.length > 0, 'some players are unrated, your own side is known');
  assert(
    R.every((r, i) => i === 0 || g.ovr(all[R[i - 1].id]) >= g.ovr(all[r.id])),
    'the order is the true OVR order'
  );
  assert(known.every(r => r.ovr === g.ovr(all[r.id])) && R.every(r => !('v' in r)), 'a known rating is true; the true OVR is not exposed');
  eq(R[0].id, g.Rank.of(run, R[0].id).register === 1 ? R[0].id : null, 'of(): first place');
  // Wei bias: the same fame source is worth more in Wei
  const fame = (region, p) => g.Rank.fame(run, { p, region });
  assert(
    fame('wei', { star: true }) > fame('wu', { star: true }) && fame('wei', { star: true }) === g.RANK.fame.star * g.RANK.weiFame,
    'Wei fame ×weiFame'
  );
  assert(g.Rank.gazette(run).length <= g.RANK.top, 'the Gazette is a Top 20');
  eq(g.Rank.street(run).length, 0, 'nobody on the street board yet');
  // an evaluation you play: the opponents are met, their rating shows
  const fx0 = g.Cup.fixture(run, 'eval'),
    m0 = g.newMatch(fx0.a, fx0.b, false);
  while (!m0.over) g.playRally(m0);
  const foes = g.squadOf(m0.t[1]).filter(p => m0.played.has(p.id));
  assert(m0.played.has(you.id) && foes.length > 0, 'you played');
  fx0.onFinish(m0);
  assert(
    foes.every(p => run.met[p.id]) &&
      g.Rank.register(run)
        .filter(r => foes.some(p => p.id === r.id))
        .every(r => r.ovr !== null),
    'the opponents are met and rated'
  );
  // a street battle you fight: your points, and the winner faction's best players share
  run.clash = { site: 0, att: g.CLASH.sites[0].a, seen: false, done: false };
  const side = g.CLASH.sites[0].a,
    fx = g.Cup.clash(run, side),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  fx.onFinish(m);
  const won = m.winner === 0,
    S = g.Rank.street(run);
  eq(run.street[you.id], g.RANK.street.fight + (won ? g.RANK.street.win : 0), 'your street points');
  assert(S.some(r => r.id === you.id) && S.length > 1 && S.length <= 1 + g.RANK.street.share, 'you and the winner faction share the board');
  assert(g.Rank.of(run, you.id).street >= 1, 'your place on the street board');
  assert(JSON.stringify(g.Rank.gazette(run)) === JSON.stringify(g.Rank.gazette(run)), 'gazette is stable');
});

test('career: team challenge — worth, refusal, stake payout', () => {
  const g = load(71),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Chal', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    club = r => g.FACTIONS.findIndex(f => f.region === r);
  run.event = null;
  run.money = 500;
  run.fans = 0;
  g.Rank.players(run)
    .filter(e => e.p !== you)
    .slice(0, 25)
    .forEach(e => (e.p.op = true)); // twenty-five famous players keep you out of the Gazette Top 20
  const W = (r, stake) => g.City.worth(run, club(r), stake);
  eq(W('gloria', 500).verdict, 'refuses', 'Gloria refuses anyone outside the Top 20, whatever the stake');
  eq(W('outlaws', 0).verdict, 'refuses', 'the Outlaws laugh off a 0 stake');
  eq(W('outlaws', g.CHALLENGE.outlaws.minStake).verdict, 'likely', 'and accept a bet');
  assert(W('wei', 1000).worth > W('wei', 0).worth, 'Wei: money talks');
  eq(W('wu', 0).worth, W('wu', 1000).worth, 'Wu: the stake counts for nothing');
  const own = run.team;
  run.team = club('wei');
  eq(g.City.worth(run, club('wei'), 0), null, 'your own club is not challengeable');
  run.team = own;
  // a refusal costs the trip + a day and blocks that club for the week
  const d0 = run.days,
    r0 = g.City.challenge(run, club('gloria'), 100);
  assert(r0 && !r0.accepted && /turned your challenge down/.test(r0.line) && run.days < d0, `refused: ${r0 && r0.line}`);
  assert(run.refused[club('gloria')].week === run.week && run.refused[club('gloria')].n === 1, 'the refusal is recorded');
  eq(W('gloria', 100).why, g.CHALLENGE_WHY.week, 'not again this week');
  run.days = g.WEEK_DAYS;
  for (let i = 2; i <= g.CHALLENGE.refuseMax; i++) {
    run.week++;
    run.days = g.WEEK_DAYS;
    g.City.challenge(run, club('gloria'), 100);
  }
  assert(g.City.rep(run, 'gloria') <= g.CHALLENGE.pest, 'refused 3 times: you are a pest (standing drops)');
  run.days = g.WEEK_DAYS;
  run.week = 4;
  // accepted: a real match; a win pays the stake at odds (the club's players are weakened, yours strengthened, so it is won)
  const ti = club('outlaws');
  for (const p of g.squadOf(run.teams[ti])) for (const k of g.STATK) p[k] = 25;
  for (const p of g.squadOf(run.pickup)) for (const k of g.STATK) p[k] = 99;
  const acc = g.City.challenge(run, ti, 50);
  assert(acc && acc.accepted && acc.stake === 50, 'the Outlaws accept a 50 stake');
  const d1 = run.days,
    money0 = run.money,
    fx = g.Cup.challenge(run, ti, 50),
    m = g.newMatch(fx.a, fx.b, false);
  eq(run.days, d1, 'nothing is spent until it finishes');
  while (!m.over) g.playRally(m);
  const line = fx.onFinish(m);
  assert(m.winner === 0 && /won/.test(line) && run.money > money0, `a won challenge pays the stake at odds: ${line}`);
  assert(
    run.money - money0 >= Math.round(50 * g.CHALLENGE.odds[0]) && run.days < d1,
    'at least stake × the lowest odds; a day and the trip spent'
  );
  assert(run.street[you.id] === g.RANK.street.fight + g.RANK.street.win, 'and street points');
  // alone: a street crew is hired (paid from your money) and you play in it
  run.academy = false;
  run.team = null;
  const T = g.Cup.hired(run);
  assert(g.squadOf(T).length === 6 && T.P.includes(you) && T.P.length === 4, 'the hired crew: 6 players, you on court');
  const side = g.City.challengeSide(run);
  eq(side.kind, 'hired', 'alone = hired crew');
  run.days = g.WEEK_DAYS;
  run.week = 6;
  const m1 = run.money,
    fx1 = g.Cup.challenge(run, ti, 50),
    mm = g.newMatch(fx1.a, fx1.b, false);
  while (!mm.over) g.playRally(mm);
  fx1.onFinish(mm);
  assert(you.team === run.pickup || you.team === g.Run.myTeam(run), 'you are back on your own team after the match');
  assert(run.money !== m1 && /crew/.test(run.log[0].t), 'the crew is paid');
});

test('career: challenge loss and injury', () => {
  const g = load(72),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Loser', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    ti = g.FACTIONS.findIndex(f => f.region === 'outlaws'),
    r = 'outlaws',
    fresh = () => {
      run.sta = run.staMax;
      run.mood = 2;
      run.money = 500;
      run.days = g.WEEK_DAYS;
      run.event = null;
      run.injury = null;
      run.lastFight = null;
    },
    play = (stake = 50) => {
      const fx = g.Cup.challenge(run, ti, stake),
        m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      return { m, line: fx.onFinish(m) };
    };
  // 'unlucky' rolls: R() = 0.99 → never injured; forced low → injured
  const roll = v => (g.RNG.next = () => v);
  roll(0.99);
  fresh();
  for (const p of g.squadOf(run.teams[ti])) for (const k of g.STATK) p[k] = 99;
  for (const p of g.squadOf(run.pickup)) for (const k of g.STATK) p[k] = 25;
  const sta0 = run.sta,
    mood0 = run.mood,
    rep0 = g.City.rep(run, r);
  let res = play();
  assert(res.m.winner === 1, 'weakened side loses');
  assert(
    run.sta <= sta0 - g.LOSS.sta - g.CLASH.sta + 1 && run.mood === mood0 + g.LOSS.mood && g.City.rep(run, r) <= rep0 + g.LOSS.rep,
    `a loss costs stamina, mood and standing: ${res.line}`
  );
  eq(run.losses[r], 1, 'the loss is counted');
  assert(
    run.news.some(t => /Loser/.test(t)),
    'a heavy loss earns a Gazette jab'
  );
  assert(run.lastFight === g.Run.dayNo(run), 'the fight day is recorded');
  // the 3rd loss to a faction adds the extra standing hit
  run.losses[r] = g.LOSS.repeat - 1;
  fresh();
  run.week += 1;
  run.rep[r] = 0;
  res = play();
  assert(g.City.rep(run, r) <= g.LOSS.rep + g.LOSS.repeatRep, `third loss: extra standing hit (${g.City.rep(run, r)})`);
  // risk rises with the gap, the margin, low stamina and a fight on the same day; clamped at max
  fresh();
  const R0 = g.City.injuryRisk(run, 60);
  assert(g.City.injuryRisk(run, 99) > R0, 'risk rises with their rating');
  assert(g.City.injuryRisk(run, 60, 10) > R0, 'and the margin of defeat');
  run.sta = 20;
  assert(g.City.injuryRisk(run, 60) > R0, 'and low stamina');
  fresh();
  run.lastFight = g.Run.dayNo(run);
  assert(g.City.injuryRisk(run, 60) > R0, 'and fighting on the same day');
  eq(g.City.injuryRisk(run, 999, 99), g.INJURY.max, 'clamped at INJURY.max');
  // forced low: a severe injury — 3 weeks and −2 on one stat
  fresh();
  for (const k of g.STATK) you[k] = 60;
  const before = g.STATK.map(k => you[k]);
  let n = 0;
  g.RNG.next = () => (n++ ? 0.97 : 0.0);
  const txt = g.Cup.injure(run, 0.5);
  assert(run.injury && run.injury.weeks === g.INJURY.weeks.severe && /severe/.test(txt), `severe: ${txt}`);
  const lost = g.STATK.filter((k, i) => you[k] < before[i]);
  assert(lost.length === 1 && before[g.STATK.indexOf(lost[0])] - you[lost[0]] === g.INJURY.lose, 'one stat loses INJURY.lose for good');
  // an injured player can't challenge or fight and is benched by Run.lineup
  roll(0.99);
  eq(g.City.fightBan(run), 'Injured — rest first', 'the ban text');
  eq(g.City.challenge(run, ti, 50), null, 'no challenge while injured');
  eq(g.Cup.challenge(run, ti, 50), null, 'no challenge match while injured');
  const L = g.Run.lineup(run, run.pickup, null, true);
  assert(!L.starts, 'an injured you is benched');
  // the physio clears the weeks but not the stat
  run.sp = 99;
  assert(g.Training.physio(run) && !run.injury, 'physio heals the injury');
  assert(you[lost[0]] === before[g.STATK.indexOf(lost[0])] - g.INJURY.lose, 'but not the lost stat');
  eq(g.RUN_VERSION, 8, 'save v8');
});

test('career: your coach picks the 4 — bench start, never played, part rewards', () => {
  const spec = { role: 'WS', name: 'Benchy', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 };
  const mk = (seed, level) => {
    const g = load(seed),
      run = g.Run.create(g.Run.draft(), spec),
      you = g.Run.you(run);
    for (const k of g.STATK) you[k] = level;
    run.week = 4;
    run.eval = null;
    run.event = null;
    return [g, run, you];
  };
  // the weakest wing spiker of the squad starts on the bench; the 4 stay in role order
  let [g, run, you] = mk(51, 25);
  const spare = g
    .squadOf(run.pickup)
    .filter(p => p.role === 'MB' && p !== you)
    .pop();
  spare.role = 'WS'; // a third wing spiker in the squad
  let L = g.Run.lineup(run, run.pickup, null, true);
  assert(!L.starts && L.rival && L.rival.score > L.you, 'the weakest WS is benched (rival ahead of you)');
  g.Run.lineup(run, run.pickup, null);
  eq(run.pickup.P.map(p => p.role).join(), 'S,MB,WS,WS', 'court order S, MB, WS, WS');
  assert(
    run.pickup.bench.includes(you) && run.pickup.P.every((p, i) => p.slot === ['S', 'MB', 'W0', 'W1'][i]),
    'you sit; slots follow the seats'
  );
  assert(run.pickup.P.includes(run.pickup.cap) && run.pickup.cap.cap, 'the captain plays');
  // never in: no grade, no win bonus, the bench reward
  g.SUB.max = 0;
  const grades0 = (run.grades || []).length;
  let fx = g.Cup.fixture(run, 'eval'),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  assert(!m.played.has(you.id), 'you never came on');
  let line = fx.onFinish(m);
  assert(/Watched from the bench/.test(line) && !/grade/.test(line), `result line: ${line}`);
  eq((run.grades || []).length, grades0, 'no grade recorded');
  assert(/Watched from the bench: \S/.test(line), 'the bench XP label is shown');
  eq(run.warm[run.warm.length - 1].win, false, 'a bench win is not your win');
  // a strong you starts; sent off at once → finished on the bench: rewards × BENCH.partMul, graded as usual
  [g, run, you] = mk(52, 99);
  L = g.Run.lineup(run, run.pickup, null, true);
  assert(L.starts, 'a strong you starts');
  g.SUB.max = 1;
  fx = g.Cup.fixture(run, 'eval');
  m = g.newMatch(fx.a, fx.b, false);
  const sub = m.t[0].bench.find(q => q.role === 'WS');
  g.subIn(m, 0, you, sub);
  while (!m.over) g.playRally(m);
  assert(m.played.has(you.id) && !m.finished.has(you.id), 'you started but finished on the bench');
  const sp0 = run.sp,
    s = m.stat[you.id] || g.blank(),
    win = m.winner === 0,
    R0 = win ? g.REWARDS.warmupWin : g.REWARDS.warmupLoss,
    gmul = g.Cup.grade(s, win)[2],
    want = Math.round((R0.sp + (s.k + s.blk + s.ace) * g.REWARDS.perPlay.sp) * g.BENCH.partMul * gmul);
  line = fx.onFinish(m);
  assert(/bench: rewards ×0\.6/.test(line) && /grade/.test(line), `part-match line: ${line}`);
  eq(run.sp - sp0, want, 'skill points × BENCH.partMul');
});

// ---------- report ----------
if (update) {
  fs.writeFileSync(GOLDEN, JSON.stringify(record, null, 2) + '\n');
  console.log('golden values written to tests/golden.json');
}
let fail = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms)`);
  if (!r.ok) {
    fail++;
    console.log('   ' + (r.err && r.err.stack ? r.err.stack.split('\n').slice(0, 3).join('\n   ') : r.err));
  }
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
