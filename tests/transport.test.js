// Tests: transport (spec §4.42, T-356) — bus, bike, scooter, ferry, taxi: pace, fares, the timetables, standing, Shu on foot,
// taxis only in Wei, the Harbor Market, road stops skipped, never picked for you.
const { load, test, assert, eq } = require('./harness');

/** A fresh Endless run in a training week at 07:00 on day 1, rested, with money, standing at `at` (a SPOTS id or a point). */
function tRun(at = 'home', seed = 43) {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Rider', mode: { story: false } });
  run.event = null;
  run.week = 2;
  run.clock = g.City.freshClock();
  run.money = 1000;
  run.housing = 'studio';
  run.pos = (Array.isArray(at) ? at : g.City.at(run, at)).map(Math.round);
  run.sta = run.staMax;
  return [g, run];
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('transport: the paces — the bus 3× on its line, bike 1.8× / scooter 3× on roads, taxi 4× door to door, the ferry fastest (T-356)', () => {
  const [g, run] = tRun();
  const N = g.ROADS.nodes,
    L = g.City.busLines()[0],
    a = L.nodes.indexOf('park'),
    b = L.nodes.indexOf('hq0'),
    T = g.City.busTrip(N.park, N.hq0, 8); // (08:00 on the dot: no wait)
  eq(T.rides, 1, 'one bus');
  assert(near(T.raw, (L.cum[b] - L.cum[a]) / (g.WALK_PACE * 3), 1e-6), `the ride = the line's cost ÷ 3 × walking (${T.raw.toFixed(3)} h)`);
  const wei = [N.weiPower, N['venue:arena']],
    walk = g.City.walkF(...wei),
    sc = g.City.wheelTrip(...wei, 'scooter'),
    bk = g.City.wheelTrip(...wei, 'bike'),
    tx = g.City.taxiTrip(...wei);
  assert(
    near(sc.raw, walk / 3, 0.02) && sc.legs.every(l => l.m === 'scooter'),
    `Wei streets: the scooter 3× (${sc.raw.toFixed(2)} vs ${walk.toFixed(2)})`
  );
  assert(near(bk.raw, walk / 1.8, 0.02), `the bike 1.8× (${bk.raw.toFixed(2)})`);
  assert(near(tx.raw, walk / 4, 1e-9), 'the taxi 4×');
  const F = g.City.ferryTrip(N.pier, N.harbor, 9),
    boat = F.legs.find(l => l.m === 'ferry');
  eq(boat.wait, 0, 'at a 09:00 departure: no wait');
  assert(boat.h < g.City.busTrip(N.pier, N.harbor, 9).raw, `pier to harbor: the ferry beats the bus (${boat.h.toFixed(2)} h)`);
  run.ride = { bike: 1, scooter: 1 };
  for (const w of g.City.ways(run, g.City.at(run, 'harbor')))
    assert(
      w.h < g.City.trip(run, g.City.at(run, 'harbor')) && w.h % 0.5 === 0 && w.h >= 1,
      `${w.k}: faster, half hours, 1 h at least (${w.h})`
    );
});

test('transport: fares — bus $3 a ride, ferry $5, taxi $8 + $4 an hour saved, scooter fuel, the bike free; paid on the ride (T-356)', () => {
  const [g, run] = tRun('weiPower');
  run.ride = { bike: 1, scooter: 1 };
  const to = g.VENUES.arena.at,
    W = k => g.City.way(run, to, k),
    walk = g.City.trip(run, to);
  eq(W('bus').cost, 3 * W('bus').legs.filter(l => l.m === 'bus').length, 'bus: $3 a ride');
  eq(W('taxi').cost, Math.round(8 + 4 * (walk - W('taxi').h)), 'taxi: $8 + $4 an hour of walking saved');
  eq(W('bike').cost, 0, 'bike: free');
  const sc = g.City.wheelTrip(run.pos, to, 'scooter');
  eq(W('scooter').cost, 2 * Math.max(1, Math.ceil(sc.rideH)), 'scooter: $2 fuel an hour');
  run.pos = g.City.at(run, 'pier').map(Math.round);
  eq(g.City.way(run, g.City.at(run, 'harbor'), 'ferry').cost, 5, 'ferry: $5 a crossing');
  run.pos = g.City.at(run, 'weiPower').map(Math.round);
  const m0 = run.money,
    h0 = g.City.hour(run),
    w = W('taxi'),
    line = g.City.travelTo(run, to, 'taxi');
  assert(/Took a taxi/.test(line), line);
  eq(run.money, m0 - w.cost, 'paid');
  eq(g.City.hour(run), h0 + w.h, 'the hours pass');
  eq(g.City.clock(run).log.slice(-1)[0].label, 'Taxi', "today's strip: a Taxi block");
  eq(g.City.pos(run).join(','), to.map(Math.round).join(','), 'you stand there');
  run.money = 2;
  eq(
    g.City.way(run, g.City.at(run, 'weiPower'), 'taxi').why,
    `needs $${g.City.way(run, g.City.at(run, 'weiPower'), 'taxi').cost}`,
    'broke: the gap'
  );
});

test('transport: the timetables — the bus every 30 min 06:00–23:00, the ferry every 2 h 07:00–21:00: you wait for the next (T-356)', () => {
  const [g] = tRun(),
    B = g.TRANSPORT.bus,
    F = g.TRANSPORT.ferry,
    N = g.ROADS.nodes;
  eq(g.City.depart(B, 6.2).at, 6.5, '06:12 → the 06:30');
  eq(g.City.depart(B, 4).at, 6, 'before the first: 06:00');
  assert(g.City.depart(B, 23.2).off, 'after 23:00: none');
  eq(g.City.depart(F, 8).at, 9, 'ferry: 08:00 → the 09:00');
  assert(g.City.depart(F, 21.5).off, 'ferry: after 21:00 none');
  const T = g.City.busTrip(N.park, N.hq0, 8.1);
  assert(near(T.legs[0].wait, 0.4, 1e-9), `at the stop at 08:06: a 24 min wait (${T.legs[0].wait.toFixed(2)})`);
  const [g2, run] = tRun('pier');
  run.clock.hour = 22;
  const w = g2.City.way(run, g2.City.at(run, 'harbor'), 'ferry');
  assert(w && /runs 07:00–21:00/.test(w.why), `at 22:00 the ferry has gone: ${w && w.why}`);
  run.clock.hour = 23.5;
  const b = g2.City.way(run, g2.City.at(run, 'harbor'), 'bus');
  assert(b && /runs 06:00–23:00/.test(b.why), `at 23:30 no bus: ${b && b.why}`);
});

test('transport: Wei runs the bus — standing ≤ −20 doubles the fare, ≤ −50 the driver won’t take you (T-356)', () => {
  const [g, run] = tRun();
  const to = g.City.at(run, 'weiPower'),
    base = g.City.way(run, to, 'bus').cost;
  run.rep = { wei: -20 };
  eq(g.City.way(run, to, 'bus').cost, base * 2, 'standing −20: fare × 2');
  run.rep = { wei: -50 };
  assert(/won't take you/.test(g.City.way(run, to, 'bus').why), 'standing −50: refused');
  run.rep = { wei: -19 };
  eq(g.City.way(run, to, 'bus').cost, base, 'above −20: the fare');
});

test('transport: Wei’s taxis — standing ≤ −20 doubles the fare; a taxi never refuses (T-360)', () => {
  const [g, run] = tRun('weiPower');
  const to = g.VENUES.arena.at,
    base = g.City.way(run, to, 'taxi');
  assert(base && !base.why && !base.dbl, `a taxi at the fare: ${base && base.why}`);
  run.rep = { wei: -19 };
  eq(g.City.way(run, to, 'taxi').cost, base.cost, 'above −20: the fare');
  run.rep = { wei: -20 };
  const d = g.City.way(run, to, 'taxi');
  eq(d.cost, base.cost * 2, 'standing −20: fare × 2');
  assert(d.dbl, 'the doubled fare is flagged');
  run.rep = { wei: -100 };
  const w = g.City.way(run, to, 'taxi');
  assert(w && w.cost === base.cost * 2 && !w.why, `standing −100: still a ride at × 2 (${w && w.why})`);
});

test('transport: Shu’s highlands stay on foot — no bike, scooter, bus or taxi there; those legs walked (T-356)', () => {
  const [g, run] = tRun('dojo');
  run.ride = { bike: 1, scooter: 1 };
  eq(g.City.ways(run, g.CITY.hq[7]).length, 0, 'dojo → Valley HQ (all Shu): nothing but your legs');
  run.pos = g.City.at(run, 'home').map(Math.round);
  const T = g.City.wheelTrip(run.pos, g.City.at(run, 'trail'), 'bike');
  for (const l of T.legs.filter(l => l.m === 'bike'))
    for (let i = 1; i < l.pts.length; i++) {
      const m = [(l.pts[i - 1][0] + l.pts[i][0]) / 2, (l.pts[i - 1][1] + l.pts[i][1]) / 2];
      assert(g.City.regionAt(m) !== 'shu', `no bike leg in Shu (${m})`);
    }
  assert(
    T.legs.some(l => l.m === 'walk' && l.h > 1),
    'the highland legs walked'
  );
  const K = g.City.edgeKinds();
  for (const L of g.TRANSPORT.bus.lines)
    for (let i = 1; i < L.nodes.length; i++)
      assert(['main', 'overpass'].includes(K[`${L.nodes[i - 1]}|${L.nodes[i]}`]), `${L.id}: main roads and the overpass`);
});

test('transport: taxis only inside Wei; the Harbor Market sells the bike and the scooter once (T-356)', () => {
  const [g, run] = tRun();
  assert(!g.City.way(run, g.City.at(run, 'weiPower'), 'taxi'), 'from the Academy: no taxi');
  run.pos = g.City.at(run, 'hotelWei').map(Math.round);
  assert(g.City.way(run, g.City.at(run, 'arcade'), 'taxi'), 'Wei to Wei: a taxi');
  assert(/Harbor Market/.test(g.City.way(run, g.City.at(run, 'arcade'), 'bike').why), 'no bike yet: buy one (the gap)');
  run.pos = g.City.at(run, 'market').map(Math.round);
  eq(g.City.can(run, 'market', 'bike').ok, true, 'the market sells a bike');
  const m0 = run.money,
    line = g.City.day(run, 'market', false, 'bike');
  assert(/bought a bike/.test(line), line);
  eq(run.money, m0 - g.TRANSPORT.bike.price, '$120');
  eq(run.ride.bike, 1, 'run.ride.bike (lazy)');
  eq(g.City.can(run, 'market', 'bike').why, 'you have the bike', 'once');
  run.money = 100;
  eq(g.City.can(run, 'market', 'scooter').why, `needs $${g.TRANSPORT.scooter.price}`, 'the scooter: $380');
});

test('transport: the bike trains a little; a bus / ferry / taxi skips the road stops; the map gets the legs; walking stays the default (T-356)', () => {
  const [g, run] = tRun();
  run.ride = { bike: 1 };
  const to = g.City.at(run, 'harbor'),
    walkH = g.City.trip(run, to),
    w = g.City.way(run, to, 'bike'),
    sta = run.sta;
  assert(
    w.gains.end > 0 && w.sta > 0 && w.sta < g.City.runPlan(run, to).sta,
    `a third of a run (End ${w.gains.end}, −${w.sta} vs the run's −${g.City.runPlan(run, to).sta})`
  );
  const line = g.City.travelTo(run, to, 'bike');
  assert(/Biked/.test(line) && run.sta < sta && /◆/.test(line), line);
  eq(g.City.last.ride, 'bike', 'City.last names the ride');
  const M = g.MapModel.build(run);
  assert(M.you.ride && M.you.ride.k === 'bike' && M.you.ride.legs.length, 'the map model carries the legs');
  assert(
    M.you.ride.legs.every((l, i, A) => l.a <= l.b && (!i || A[i - 1].b <= l.w + 1e-9)),
    'legs in time order'
  );
  assert(M.transit.bus.lines.length === 3 && M.transit.ferry.piers.length === 3, 'the transit model: 3 lines, 3 piers');
  // a bus never stops on the road, even forced
  const [g2, r2] = tRun();
  g2.Encounter.force = 'x';
  try {
    eq(g2.Encounter.on(r2, { from: r2.pos, to, day: 0, ride: 'bus' }), null, 'a bus passes the road by');
  } finally {
    g2.Encounter.force = null;
  }
  // walking is untouched and is what a plain travel does
  const [g3, r3] = tRun();
  const l3 = g3.City.travelTo(r3, to);
  assert(/Walked/.test(l3) && g3.City.hour(r3) === 7 + walkH, `Walk: ${walkH} h as before (${l3})`);
});
