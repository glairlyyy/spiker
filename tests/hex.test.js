// Hex territory and faction dynamics: battles moving tiles, tile value / economy, the grid, the model's hex layer (spec §4.27).
const { load, test, assert, eq } = require('./harness');

test('career: faction dynamics — battles move hex tiles, places go with them, weakens, comes back (T-132)', () => {
  const g = load(9),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Front', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    H = run.hex;
  const p0 = g.City.price(run, 'weiPower'),
    ti = g.FACTIONS.findIndex(f => f.region === 'wei' && f.join.ovr),
    ovr0 = g.World.joinReq(run, ti).ovr;
  eq(g.Front.meter(run, 'wu', 'wei'), 0, 'calm at the start');
  // cheapest first: the first target costs no more than any other tile Wu can reach
  const T = g.Hex.targets(run, 'wu', 'wei');
  assert(T.length && T.every(t => t.cost >= T[0].cost), 'targets sorted cheapest first');
  assert(
    T.every((t, i) => !i || t.cost > T[i - 1].cost || t.d >= T[i - 1].d),
    'then nearest to a Wu HQ'
  );
  const t0 = T[0],
    sk = g.Front.stakes(run, 'wu', 'wei'),
    pre = JSON.stringify([run.hex, run.own]);
  eq(sk.tile, t0.id, 'stakes preview the first target');
  eq(JSON.stringify([run.hex, run.own]), pre, 'stakes() changes nothing');
  for (let i = 1; i < t0.cost; i++) eq(g.Front.result(run, 'wu', 'wei'), '', 'pressure builds');
  if (t0.cost > 1) eq(g.Front.meter(run, 'wu', 'wei'), t0.cost - 1, 'meter from the winner');
  assert(g.Front.result(run, 'wu', 'wei').includes('seized'), 'the tile falls at its cost');
  eq(g.Hex.owner(run, t0.id), 'wu', 'Wu holds it');
  assert(!H.p[t0.id], 'its pressure resets');
  // a defender's win clears the raid's pressure and pushes back on the tile the raid came from
  const t1 = g.Hex.target(run, 'wu', 'wei');
  run.clash = { tile: t1.id, from: t1.from, att: 'wu', def: 'wei', seen: false, done: false };
  H.p[t1.id] = 1;
  H.by[t1.id] = 'wu';
  g.Front.result(run, 'wei', 'wu');
  assert(!H.p[t1.id], "the defender's win clears the raid");
  if (g.Hex.takeable(g.Hex.tile(t1.from)))
    assert(H.by[t1.from] === 'wei' || g.Hex.owner(run, t1.from) === 'wei', 'and pushes on the raid’s tile');
  run.clash = null;
  // places go with their tile
  const pt = g.Hex.ofSpot('weiSpeed');
  g.Hex.flip(run, pt.id, 'wu');
  eq(g.Front.owner(run, 'weiSpeed'), 'wu', 'a place follows its tile');
  eq(g.City.region(run, 'weiSpeed'), 'wu', 'the place is Wu now');
  g.Hex.flip(run, g.Hex.ofSpot('weiWit').id, 'wu');
  assert(g.Front.weak(run, 'wei'), 'two places lost: Wei weakened');
  assert(g.City.price(run, 'weiPower') > p0, 'weakened: dearer');
  assert(g.World.joinReq(run, ti).ovr < ovr0, 'weakened: easier to join');
  // retakes are cheaper, HQs never fall, the supply rule
  assert(
    g.Hex.cost(run, pt.id, 'wei') < g.Hex.cost(run, pt.id, 'shu') || g.Hex.cost(run, pt.id, 'wei') === g.HEX_COST.min,
    'a retake costs less'
  );
  g.Hex.flip(run, pt.id, 'wei');
  eq(g.Front.owner(run, 'weiSpeed'), 'wei', 'retaken');
  assert(
    g.Hex.grid()
      .tiles.filter(t => t.kind === 'hq' || t.kind === 'academy' || t.kind === 'minor')
      .every(t => !g.Hex.takeable(t)),
    'HQs, the Academy and minors never fall'
  );
  for (const t of g.Hex.targets(run, 'shu', 'wu')) assert(g.Hex.supply(run, 'shu').has(t.from), 'attacks only from a supplied tile');
  // decay: untouched for HEX.decay weeks, pressure −1
  H.p['x'] = 0;
  delete H.p.x;
  const t2 = g.Hex.target(run, 'shu', 'wei');
  H.p[t2.id] = 1;
  H.by[t2.id] = 'shu';
  H.t[t2.id] = run.week;
  run.week += g.HEX.decay;
  g.Hex.decay(run);
  assert(!H.p[t2.id] && !H.by[t2.id], 'stale pressure fades');
  // aggression: over many weeks Wu starts most battles
  const n = { wei: 0, wu: 0, shu: 0 };
  run.lastLoser = null;
  for (let i = 0; i < 600; i++) n[g.Front.pick(run).att]++;
  assert(n.wu > n.wei && n.wei > n.shu, `Wu is the most aggressive (${JSON.stringify(n)})`);
  let ww = 0;
  for (let i = 0; i < 600; i++) {
    const { att, def } = g.Front.pick(run);
    if ([att, def].sort().join() === 'wei,wu') ww++;
  }
  assert(ww > 600 * 0.6, `Wei and Wu go for each other most (${ww}/600)`);
});

test('hex: tile value drives the economy — prices, quality, strength, joins (spec §4.27 value)', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Value' }),
    ti = g.FACTIONS.findIndex(f => f.region === 'wei' && f.join.ovr),
    p0 = g.City.price(run, 'weiPower'),
    o0 = g.World.joinReq(run, ti).ovr;
  for (const r of g.MAJORS) eq(g.Front.econ(run, r), 0, 'even at the start: ' + r);
  const t = g.Hex.target(run, 'wu', 'wei'),
    v = g.Hex.value(g.Hex.tile(t.id));
  g.Hex.flip(run, t.id, 'wu');
  eq(g.Front.econ(run, 'wei'), -v, 'Wei loses the tile’s value');
  eq(g.Front.econ(run, 'wu'), v, 'Wu gains it');
  assert(g.Front.priceMul(run, 'wei') > 1 && g.Front.priceMul(run, 'wu') === 1, 'Wei gets dearer with any loss');
  assert(g.Front.qMul(run, 'wu') > 1 && g.Front.qMul(run, 'wei') < 1, 'quality follows the value');
  assert(g.Front.strength(run, 'wu') > g.Front.strength(run, 'wei'), 'street strength follows the value');
  while (g.Front.econ(run, 'wei') > -g.HEX_ECON.step) g.Hex.flip(run, g.Hex.target(run, 'wu', 'wei').id, 'wu');
  assert(g.World.joinReq(run, ti).ovr < o0, 'a step down: clubs ask less');
  assert(g.City.price(run, 'weiPower') > p0, 'prices show it');
});

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
  g.Hex.cache = null;
  eq(JSON.stringify(g.Hex.grid().tiles), h, 'rebuilt the same');
});

test('map: hex tiles in the model follow their holder; pressure and the battle tile show (T-133)', () => {
  const g = load(52),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Hexes' });
  let M = g.MapModel.build(run).hexes;
  eq(M.tiles.length, g.Hex.grid().tiles.length, 'every land tile');
  assert(
    M.tiles.every(t => t.own === g.Hex.tile(t.id).region && t.color === g.REGIONS[t.own].color && !t.p),
    'start: own region, no pressure'
  );
  assert(M.tiles.some(t => t.frontier) && M.tiles.every(t => !t.frontier || g.MAJORS.includes(t.own)), 'frontier tiles are majors’');
  eq(M.target, null, 'no battle yet');
  const tg = g.Hex.target(run, 'shu', 'wei');
  run.clash = { tile: tg.id, from: tg.from, att: 'shu', def: 'wei', seen: false, done: false };
  run.hex.p[tg.id] = 1;
  run.hex.by[tg.id] = 'shu';
  M = g.MapModel.build(run).hexes;
  eq(M.target.id, tg.id, 'the battle tile');
  assert(M.target.text.startsWith('Shu ') && M.target.color === g.REGIONS.shu.color, 'labelled in the raider’s colour');
  const mt = M.tiles.find(t => t.id === tg.id);
  assert(mt.p === 1 && mt.by === 'shu' && mt.cost === g.Hex.cost(run, tg.id, 'shu'), 'pressure, pusher, cost');
  g.Hex.flip(run, tg.id, 'shu');
  M = g.MapModel.build(run).hexes;
  eq(M.tiles.find(t => t.id === tg.id).color, g.REGIONS.shu.color, "the holder's colour");
});
