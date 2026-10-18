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
  for (const t of G.tiles) eq(t.unit ? g.WAR.units[t.unit].region : null, g.MAJORS.includes(t.region) ? t.region : null, 'unit region ' + t.id);
  for (const u of g.War.ids()) assert(G.tiles.some(t => t.unit === u), 'land for ' + u);
  g.CITY.hq.forEach((at, i) => {
    const u = g.War.ofClub(i);
    if (u) eq(G.tiles.find(x => x.hq.includes(i)).unit, u, 'HQ in its own unit ' + i);
  });
  g.Hex.cache = null;
  eq(JSON.stringify(g.Hex.grid().tiles), h, 'rebuilt the same');
});

test('map: hex tiles in the model follow their holder unit; the battle tile shows the defender’s Strength (T-133, T-313)', () => {
  const g = load(52),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Hexes' });
  let M = g.MapModel.build(run).hexes;
  eq(M.tiles.length, g.Hex.grid().tiles.length, 'every land tile');
  assert(
    M.tiles.every(t => t.own === g.Hex.tile(t.id).region && t.color === g.REGIONS[t.own].color && t.unit === g.Hex.tile(t.id).unit),
    'start: own region and unit'
  );
  assert(M.tiles.some(t => t.frontier) && M.tiles.every(t => !t.frontier || g.MAJORS.includes(t.own)), 'frontier tiles are majors’');
  eq(M.target, null, 'no battle yet');
  const tg = g.Front.site(run, 'shu', 'wei');
  run.clash = { tile: tg.tile, from: tg.from, att: 'shu', def: 'wei', seen: false, done: false };
  M = g.MapModel.build(run).hexes;
  eq(M.target.id, tg.tile, 'the battle tile');
  assert(M.target.text === `Iron ${g.War.str(run, 'iron')}` && M.target.color === g.REGIONS.shu.color, 'the defender’s Strength, in the raider’s colour');
});
