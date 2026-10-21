// Team life (spec §4.36): transfer windows, leaving, tenure (T-325); the circle and friends who follow (T-326).
const { load, test, assert, eq } = require('./harness');

const mkRun = (seed, role = 'WS') => {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role, name: 'Team' });
  run.event = null;
  return [g, run];
};
const OPEN = 2, // a club that asks nothing (FACTIONS[2].join = {})
  FEE = 5; // a club that asks a fee

test('team: transfer windows — week 1 and the week after an evaluation; never during a cup (T-325)', () => {
  const [g, run] = mkRun(3251);
  eq(Object.keys(g.FACTIONS[OPEN].join).length, 0, 'the open club asks nothing');
  const openAt = [];
  for (let w = 1; w <= g.CAREER.weeks; w++) {
    run.week = w;
    if (g.World.window(run).open) openAt.push(w);
  }
  eq(openAt.join(','), '1,5,9,13,17,21,25', 'the windows');
  run.week = 2;
  const c = g.World.canJoin(run, OPEN);
  assert(!c.ok && c.why.includes('Registrations closed. Next window: week 5.'), 'closed in week 2: ' + c.why);
  assert(!g.World.join(run, OPEN) && g.World.isFree(run), 'no join outside the window');
  run.week = 26;
  eq(g.World.window(run).why, g.TEAM_LINES.closedSeason, 'after week 25: until the off-season');
  run.week = 5;
  run.cup = { id: g.CUPS[0].id, done: false };
  assert(g.World.canJoin(run, OPEN).why.includes('not during a cup'), 'never during a cup');
  run.cup = null;
  assert(g.World.join(run, OPEN), 'signs in the window');
  eq(run.tenure, g.Season.wk(run), 'tenure starts');
  run.year = 2;
  run.week = 1;
  assert(g.World.window(run).open, 'year 2 week 1 (the off-season) is open');
});

test('team: switching clubs — walked_out with every teammate by behaviour, standing −8, run.ex (T-325)', () => {
  const [g, run] = mkRun(3252);
  run.week = 5;
  assert(g.World.join(run, OPEN), 'sign');
  const T = run.teams[OPEN],
    mates = g.Run.mates(run).filter(m => !m.named),
    beh = ['loyal', 'calculating', 'proud', 'warm'];
  mates.forEach((m, i) => (run.people[m.id].traits[0] = beh[i % beh.length]));
  run.week = 9;
  run.money = 1000;
  const region = g.FACTIONS[OPEN].region,
    rep0 = g.City.rep(run, region),
    all = g.Run.mates(run).map(m => m.id);
  assert(g.World.canJoin(run, FEE).ok, 'a signed player may switch in the window');
  assert(g.World.join(run, FEE), 'switch');
  eq(run.team, FEE, 'at the new club');
  assert(!g.squadOf(T).some(p => p.id === run.youId), 'gone from the old squad');
  eq(g.City.rep(run, region), rep0 + g.WINDOW.rep, 'standing −8 with the old faction');
  const wk = g.Season.wk(run),
    v = id => g.Rel.list(run, id).find(e => e.k === 'walked_out');
  for (const id of all) {
    eq(run.ex[id], wk, 'remembered as an ex: ' + id);
    assert(v(id), 'walked_out written: ' + id);
  }
  const by = k => mates.find(m => run.people[m.id].traits[0] === k);
  eq(v(by('loyal').id).v, g.MEMORY.walked_out.v * 2, 'Loyal × 2');
  eq(v(by('calculating').id).v, g.MEMORY.walked_out.v * 0.3, 'Mercenary × 0.3');
  assert(v(by('proud').id).v > 0, 'an Egoist is glad');
  eq(v(by('warm').id).v, g.MEMORY.walked_out.v, 'the rest: the base');
  assert(g.Rel.text(run, by('loyal').id, v(by('loyal').id)).length > 0, 'a diary line');
  // leaving to go free: always open
  run.week = 10;
  assert(!g.World.window(run).open && g.World.leave(run), 'leave outside the window');
  assert(g.World.isFree(run) && run.tenure === null && g.World.tenure(run) === 0, 'a free agent again');
  assert(!g.World.leave(run), 'nothing to leave');
});

test('team: tenure — 4w lineup +4, 8w members’ price × 0.8, 12w captain (T-325)', () => {
  const [g, run] = mkRun(3253);
  run.week = 5;
  assert(g.World.join(run, OPEN), 'sign');
  const T = run.teams[OPEN],
    you = g.Run.you(run),
    region = g.FACTIONS[OPEN].region,
    sid = Object.keys(g.SPOTS).find(id => g.City.region(run, id) === region && g.City.price(run, id) >= 10);
  assert(sid, 'a paid place on home turf');
  you.lead = 99;
  const s0 = g.Run.lineup(run, T, null, true).you,
    p0 = g.City.price(run, sid);
  g.Run.lineup(run, T, null);
  assert(T.cap !== you, 'no captain in the first weeks');
  run.week = 9;
  eq(g.World.tenure(run), 4, 'four weeks');
  eq(g.Run.lineup(run, T, null, true).you, s0 + g.TENURE.lineup, 'lineup +4');
  eq(g.City.price(run, sid), p0, 'full price before 8 weeks');
  run.week = 13;
  assert(g.City.price(run, sid) < p0, `members’ price (${g.City.price(run, sid)} < ${p0})`);
  g.Run.lineup(run, T, null);
  assert(T.cap !== you, 'still no captain at 8 weeks');
  run.week = 17;
  g.Run.lineup(run, T, null);
  assert(T.cap === you, 'captain at 12 weeks');
  // the Academy squad and Cup squads are not your club: no tenure there
  g.World.leave(run);
  eq(g.World.tenure(run), 0, 'free: no tenure');
  // the save keeps tenure and the exes
  run.week = 21;
  assert(g.World.join(run, OPEN), 'back');
  g.Run.save(run);
  const back = g.Run.load();
  eq(back.tenure, run.tenure, 'tenure saved');
  eq(JSON.stringify(back.ex), JSON.stringify(run.ex), 'exes saved');
});
