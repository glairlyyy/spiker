// The living island, Agent E (spec §4.37 3–4): encounters on the road (T-333), effort — the short cut and the focus press (T-335).
const { load, test, assert, eq } = require('./harness');

/** A run in a training week at a club, the island explored, three teammates in your circle (bond 30+). */
function mkRun(seed = 3331) {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Road' });
  g.Story.skip(run);
  run.mode.story = false;
  for (const t of run.teams) if (g.World.join(run, t.i)) break;
  for (let i = 0; i < 40 && run.week < 6; i++) {
    run.event = null;
    if (g.Run.weekType(run) === 'eval') g.Eval.bench(run);
    g.Run.endWeek(run);
  }
  run.event = null;
  run.money = 2000;
  for (const id of Object.keys(g.SPOTS)) g.City.reveal(run, g.City.at(run, id));
  for (const h of g.CITY.hq) g.City.reveal(run, h);
  for (const m of g.Run.mates(run).slice(0, 3)) g.Rel.push(run, g.Rel.key(run.youId, m.id), m.id, 'event', 30, m.id);
  return [g, run];
}
/** Every trip from your position to a place, on day `day`: { id, trip }. */
const trips = (g, run, day = 0) => Object.keys(g.SPOTS).map(id => ({ id, trip: { from: g.City.pos(run), to: g.City.at(run, id), day } }));
test('encounters: deterministic by hash, one per trip at most, nothing drawn (T-333)', () => {
  const [g, run] = mkRun(),
    [g2, run2] = mkRun(),
    a = [],
    b = [];
  for (const day of [0, 1, 2, 3])
    for (const { trip } of trips(g, run, day)) {
      const E = g.Encounter.on(run, trip, { stop: 'all' });
      a.push(E ? `${E.key}@${E.stop}` : '-');
    }
  for (const day of [0, 1, 2, 3])
    for (const { trip } of trips(g2, run2, day)) {
      const E = g2.Encounter.on(run2, trip, { stop: 'all' });
      b.push(E ? `${E.key}@${E.stop}` : '-');
    }
  eq(a.join('|'), b.join('|'), 'the same run gives the same stops');
  assert(
    a.some(x => x !== '-'),
    'some trips stop'
  );
  assert(
    a.some(x => x === '-'),
    'some trips do not'
  );
  // nothing drawn: the run's stream is where it was
  const [g3, run3] = mkRun(),
    [g4] = mkRun();
  for (const { trip } of trips(g3, run3)) {
    g3.Encounter.on(run3, trip, { stop: 'all' });
    g3.City.alt(run3, trip.to);
  }
  eq(g3.R(), g4.R(), 'Encounter.on / City.alt draw no R()');
});

test('encounters: the setting — never stops nothing, friends only arc / circle, everything adds crews and battles; a week cap (T-333)', () => {
  const [g, run] = mkRun(),
    kinds = stop => {
      const out = new Set();
      for (const day of [0, 1, 2, 3, 4, 5])
        for (const { trip } of trips(g, run, day)) {
          const E = g.Encounter.on(run, trip, { stop });
          if (E) out.add(E.kind);
        }
      return out;
    };
  eq(kinds('never').size, 0, 'never: no stop');
  const fr = kinds('friends'),
    all = kinds('all');
  assert(fr.size && [...fr].every(k => k === 'arc' || k === 'circle'), 'friends: ' + [...fr]);
  assert(
    [...all].some(k => k === 'crew' || k === 'battle'),
    'everything: crews / battles too — ' + [...all]
  );
  // the store setting is the default
  g.Encounter.setPref('never');
  assert(
    trips(g, run).every(({ trip }) => !g.Encounter.on(run, trip)),
    'the stored setting applies'
  );
  g.Encounter.setPref('friends');
  eq(g.Encounter.pref(), 'friends', 'pref round-trip');
  // shown stops count: once per person a week, ENC.week a week
  let shown = 0;
  for (const day of [0, 1, 2, 3, 4, 5, 6])
    for (const { trip } of trips(g, run, day)) {
      const E = g.Encounter.on(run, trip, { stop: 'all' });
      if (!E) continue;
      assert(run.enc.met[E.key] !== run.enc.w, 'the same one twice in a week: ' + E.key);
      g.Encounter.open(run, E);
      shown++;
    }
  eq(shown, g.ENC.week, 'at most ENC.week stops a week');
  // an event open, a cup: no stop
  const [g2, run2] = mkRun(),
    T = trips(g2, run2),
    hit = T.find(({ trip }) => g2.Encounter.on(run2, trip, { stop: 'all' }));
  assert(hit, 'a trip that stops');
  run2.event = { id: 'x' };
  assert(!g2.Encounter.on(run2, hit.trip, { stop: 'all' }), 'not with an event open');
  run2.event = null;
  run2.cup = { id: g2.CUPS[0].id, done: false };
  assert(!g2.Encounter.on(run2, hit.trip, { stop: 'all' }), 'not during a cup');
});

test('encounters: each answer does its thing — talk (met_road, Friendly × 1.5), walk on (nothing), challenge, join, an arc (T-333)', () => {
  const [g, run] = mkRun(),
    E = trips(g, run)
      .map(({ trip }) => g.Encounter.on(run, trip, { stop: 'friends' }))
      .find(Boolean);
  assert(E && E.id != null, 'a person stops you');
  const bond0 = g.Rel.bondOf(run, E.id),
    snap = JSON.stringify([run.money, run.days, run.sta, run.pos]);
  eq(JSON.stringify(g.Encounter.answer(run, E, 'walk')), '{}', 'walk on: nothing');
  eq(JSON.stringify([run.money, run.days, run.sta, run.pos]), snap, 'walking on costs nothing');
  eq(g.Rel.bondOf(run, E.id), bond0, 'no memory');
  const r = g.Encounter.answer(run, E, 'talk');
  assert(r && r.line && g.Rel.list(run, E.id).some(e => e.k === 'met_road'), 'talk: met_road');
  assert(g.Rel.bondOf(run, E.id) >= bond0, 'bond up');
  eq(JSON.stringify([run.money, run.days, run.sta, run.pos]), snap, 'talking costs nothing');
  // Friendly × 1.5 (REL.behave.warm): the same memory weighs more
  const [h, r2] = mkRun(),
    [id1, id2] = h.Run.mates(r2)
      .slice(3, 5)
      .map(m => m.id);
  r2.people[id1].traits = ['warm', 'loyal'];
  r2.people[id2].traits = ['proud', 'loyal']; // (Egoist: no write-time or read-time multiplier on a talk)
  for (const id of [id1, id2]) h.People.find(r2, id).gifts = []; // (no Magnetic / Lone Wolf)
  const s1 = h.Rel.stance(r2, id1),
    s2 = h.Rel.stance(r2, id2);
  h.Encounter.answer(r2, { kind: 'circle', key: `circle:${id1}`, id: id1 }, 'talk');
  h.Encounter.answer(r2, { kind: 'circle', key: `circle:${id2}`, id: id2 }, 'talk');
  const d1 = h.Rel.stance(r2, id1) - s1,
    d2 = h.Rel.stance(r2, id2) - s2;
  assert(d2 > 0 && Math.abs(d1 / d2 - h.REL.behave.warm.pos) < 0.01, `Friendly × 1.5: ${d1} vs ${d2}`);
  // a crew: Challenge → their club's match (or their refusal, a day spent)
  const crew = g.Encounter.near(run).find(c => c.kind === 'crew'),
    rc = g.Encounter.answer(run, crew, 'challenge');
  assert(rc && (rc.fx ? rc.fx.b === run.teams[crew.ti] : /turned your challenge down/.test(rc.line)), 'challenge: a fixture or a refusal');
  // an arc's open beat: help → Team.answer (the money beat pays)
  const [k, r3] = mkRun(),
    id = String(k.Circle.of(r3)[0]);
  r3.people[id].want = 'money';
  k.Team.arcs(r3)[id] = { id, y: k.Season.year(r3), w: 'money', b: 0, st: 'open', at: r3.week };
  const near = k.Encounter.near(r3).find(c => String(c.id) === id);
  assert(!near || near.kind === 'arc', 'an open beat makes them an arc stop');
  const m0 = r3.money,
    ra = k.Encounter.answer(r3, { kind: 'arc', key: `arc:${id}`, id }, 'help');
  assert(ra && !ra.blocked, 'helped');
  eq(r3.money, m0 - k.ARCS.money.beats[0].amt, 'the beat’s money');
  assert(
    k.Rel.list(r3, id).some(e => e.k === 'arc_help'),
    'arc_help'
  );
  // the street battle: Join → Fight.clash for that side
  const [b, r4] = mkRun(3339);
  for (let i = 0; i < 30 && !b.Fight.clashSite(r4); i++) {
    r4.event = null;
    if (b.Run.weekType(r4) === 'eval') b.Eval.bench(r4);
    b.Run.endWeek(r4);
  }
  r4.event = null;
  const c = b.Fight.clashSite(r4);
  assert(c, 'a week with a street battle');
  r4.injury = null;
  r4.days = 7;
  const bt = b.Encounter.near(r4).find(x => x.kind === 'battle'),
    rj = b.Encounter.answer(r4, bt, 'join', c.a);
  assert(rj && rj.fx && /Street battle/.test(rj.fx.round), 'join: the street battle');
});

test('effort: the short cut — same days, passes what it names, its chance by hash; the safe road by default (T-335)', () => {
  const [g, run] = mkRun();
  let found = 0;
  for (const id of Object.keys(g.SPOTS)) {
    const to = g.City.at(run, id),
      A = g.City.alt(run, to);
    if (!A) continue;
    found++;
    eq(JSON.stringify(A), JSON.stringify(g.City.alt(run, to)), 'deterministic');
    const far = Math.hypot(to[0] - g.City.pos(run)[0], to[1] - g.City.pos(run)[1]),
      cost = A.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - A.pts[i][0], p[1] - A.pts[i][1]), 0);
    assert(far > 0 && cost > 0, 'a real road');
    assert(g.Encounter.dist(A.pts, A.at).d <= g.ENC.r, 'it passes them');
    assert(g.Encounter.dist(g.City.route(g.City.pos(run), to), A.at).d > g.ENC.r, 'the safe road does not');
    // the days never change: the trip is the safe road's (City.trip); the short cut is display + its stop
    const t0 = g.City.trip(run, to);
    assert(t0 >= 0, 'days');
    // its stop: chance ENC.alt.p by hash, under any setting but never
    for (let day = 0; day < 7; day++) {
      const trip = { from: g.City.pos(run), to, day, pts: A.pts },
        E = g.Encounter.on(run, trip, { stop: 'friends', via: A.key }),
        roll = g.Encounter.roll(run, day, A.key);
      if (roll < g.ENC.alt.p && E)
        assert(g.ENC.rank.indexOf(E.kind) <= g.ENC.rank.indexOf(A.kind), 'the via stops unless a higher rank does');
      if (roll >= g.ENC.alt.p) assert(!E || E.key !== A.key, 'over the hash: no stop for it');
      assert(!g.Encounter.on(run, trip, { stop: 'never', via: A.key }), 'never means never');
    }
  }
  assert(found > 0, 'some trips offer a short cut');
  // the hot border: once a battle is on, a short cut past it may be offered and stops for it even under "friends"
  const [b, r4] = mkRun(3339);
  for (let i = 0; i < 30 && !b.Fight.clashSite(r4); i++) {
    r4.event = null;
    if (b.Run.weekType(r4) === 'eval') b.Eval.bench(r4);
    b.Run.endWeek(r4);
  }
  r4.event = null;
  r4.injury = null;
  assert(
    b.Encounter.vias(r4).some(v => v.kind === 'battle'),
    'the hot border is a via'
  );
});

test('effort: the focus press — on the beat × 1.1 of the day’s EXP once, missed / skipped × 1 (T-335)', () => {
  const day = (g, run) => {
    const id = Object.keys(g.SPOTS).find(k => g.SPOTS[k].kit && g.City.can(run, k).ok);
    run.sta = 100;
    return g.City.day(run, id, false);
  };
  const [g, run] = mkRun(),
    [h, twin] = mkRun(),
    [k, skip] = mkRun();
  day(g, run);
  day(h, twin);
  day(k, skip);
  const D = g.City.dayXp;
  assert(D && Object.keys(D.xp).length, 'the order day’s EXP noted');
  const xp0 = JSON.stringify(run.xp);
  eq(xp0, JSON.stringify(twin.xp), 'the twin is the same run');
  const lab = g.City.focus(run, true);
  assert(lab, 'a hit adds');
  eq(g.City.focus(run, true), '', 'once: a second press adds nothing');
  eq(k.City.focus(skip, false), '', 'a miss adds nothing');
  eq(JSON.stringify(skip.xp), JSON.stringify(twin.xp), 'missed / skipped = × 1 (never a loss)');
  eq(JSON.stringify(k.Run.you(skip).body), JSON.stringify(h.Run.you(twin).body), 'the body too');
  // the gain is ≤ ENC.focus.k of the day: banked XP + levels, measured against the twin
  const total = (G, R) =>
    G.BODY.keys.concat('wit').reduce((s, key) => {
      let v = 0;
      const lv = G.Training.level(G.Run.you(R), key);
      for (let l = 1; l < lv; l++) v += G.Training.need(l);
      return s + v + ((R.xp && R.xp[key]) || 0);
    }, 0);
  const extra = total(g, run) - total(h, twin),
    dayXp = Object.values(D.xp).reduce((a, b) => a + b, 0);
  assert(extra > 0, 'the hit adds EXP: ' + extra);
  assert(extra <= Math.ceil(dayXp * g.ENC.focus.k * 1.35) + 1, `at most +10 % of the day (×gifts): ${extra} of ${dayXp}`);
});
