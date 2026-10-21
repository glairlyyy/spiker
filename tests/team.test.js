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

/** Give id a stance toward you of about v (one memory, behaviour-neutral: a plain `event`). */
const befriend = (g, run, id, v) => g.Rel.push(run, g.Rel.key(run.youId, id), id, 'event', v, id);

test('team: the circle — bond 30+, any club, starred first, at most 5 (T-326)', () => {
  const [g, run] = mkRun(3261);
  const ppl = g.People.all(run).filter(p => !p.named);
  // eight people in different squads, stances 2…40
  const pick = [];
  for (const p of ppl) if (pick.length < 8 && !pick.some(q => q.team === p.team)) pick.push(p);
  pick.forEach((p, i) => befriend(g, run, p.id, 2 + i * 5));
  const c = g.Circle.of(run),
    b = id => g.Rel.bondOf(run, id);
  assert(c.length <= g.CIRCLE.max && c.length > 1, 'capped: ' + c.length);
  assert(
    c.every(id => b(id) >= g.CIRCLE.bond),
    'everyone at 30+: ' + c.map(b)
  );
  for (let i = 1; i < c.length; i++) assert(b(c[i - 1]) >= b(c[i]), 'by bond');
  eq(new Set(c.map(id => g.People.find(run, id).team)).size, c.length, 'any club');
  const qualify = pick.filter(p => b(p.id) >= g.CIRCLE.bond).map(p => p.id);
  assert(qualify.length > g.CIRCLE.max, 'more than fit');
  const last = qualify.sort((x, y) => b(x) - b(y))[0]; // the weakest who qualifies: out of the top 5
  assert(!c.includes(last), 'the weakest is left out');
  run.fav.push(last);
  eq(g.Circle.of(run)[0], last, 'a starred member first');
  const weak = pick.find(p => b(p.id) < g.CIRCLE.bond);
  run.fav.push(weak.id);
  assert(!g.Circle.of(run).includes(weak.id), 'a star under 30 stays out');
  eq(g.Circle.mood(run, last), 'fine', 'their week');
});

test('team: friends who follow — a Loyal never asks; a follower lands in your new squad; a no leaves walked_out (T-326)', () => {
  const [g, run] = mkRun(3262);
  run.week = 5;
  assert(g.World.join(run, OPEN), 'sign');
  const mates = g.Run.mates(run).filter(p => !p.named),
    f = mates[0];
  run.people[f.id].traits[0] = 'loyal';
  befriend(g, run, f.id, 40);
  assert(g.Rel.bondOf(run, f.id) >= g.FOLLOW.bond, 'a close friend');
  for (let w = 1; w <= 28; w++) {
    run.week = w;
    assert(!g.Circle.asker(run, [f]), 'a Loyal never asks (week ' + w + ')');
  }
  // a Friendly friend always asks (FOLLOW.p forced): they come along
  run.people[f.id].traits[0] = 'warm';
  g.FOLLOW.p.warm = 1;
  run.week = 9;
  run.money = 1000;
  const T0 = run.teams[OPEN];
  assert(g.World.join(run, FEE), 'switch');
  eq(run.event && run.event.id, 'follow', 'the follow card');
  eq(run.event.who, f.id, 'from the close friend');
  assert(!g.Rel.list(run, f.id).some(e => e.k === 'walked_out'), 'no walked_out while they ask');
  assert(g.Events.def(run.event, run).title.includes('wants to come'), 'the card');
  const T = run.teams[FEE],
    n0 = g.squadOf(T).length;
  const line = g.Events.choose(run, 0);
  assert(line.length > 0 && !run.event, 'answered: ' + line);
  assert(g.Run.mates(run).includes(f) && f.team === T, 'the follower lands in your new squad');
  eq(g.squadOf(T).length, n0, 'a seat, not an extra player');
  eq(g.squadOf(T0).length, 6, 'the old squad stays full');
  eq(run.ex[f.id], undefined, 'not an ex any more');
  assert(g.Run.you(run).bond[f.id] >= g.FOLLOW.bond, 'bond cached');
  // decline: the walked_out lands now, plus refused_help
  const [h, r2] = mkRun(3263);
  r2.week = 5;
  h.World.join(r2, OPEN);
  const f2 = h.Run.mates(r2).filter(p => !p.named)[0];
  r2.people[f2.id].traits[0] = 'calculating';
  h.FOLLOW.p.calculating = 1;
  r2.week = 9;
  befriend(h, r2, f2.id, 60); // (a Mercenary's memories fade fast: written this week)
  r2.money = 1000;
  assert(h.World.join(r2, FEE) && r2.event && r2.event.fee === h.FOLLOW.fee, 'a Mercenary asks for a fee');
  h.Events.choose(r2, 1);
  assert(!h.Run.mates(r2).includes(f2), 'stays behind');
  const ks = h.Rel.list(r2, f2.id).map(e => e.k);
  assert(ks.includes('walked_out') && ks.includes('refused_help'), 'remembers: ' + ks);
  // a paid follow: the fee goes
  const [k, r3] = mkRun(3264);
  r3.week = 5;
  k.World.join(r3, OPEN);
  const f3 = k.Run.mates(r3).filter(p => !p.named)[0];
  r3.people[f3.id].traits[0] = 'calculating';
  k.FOLLOW.p.calculating = 1;
  r3.week = 9;
  befriend(k, r3, f3.id, 60); // (a Mercenary's memories fade fast: written this week)
  r3.money = 1000;
  k.World.join(r3, FEE);
  const m0 = r3.money;
  k.Events.choose(r3, 0);
  eq(r3.money, m0 - k.FOLLOW.fee, 'paid');
  assert(k.Run.mates(r3).includes(f3), 'and came');
});
