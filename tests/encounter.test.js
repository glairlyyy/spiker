// The living island, Agent E (spec §4.37 3–4): encounters on the road (T-333), effort — the short cut (T-335).
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

const someone = (g, run, k, road = false) =>
  g.Encounter.people(run)
    .map(p => p.id)
    .find(id => {
      const R0 = g.Encounter.row(run, id, k, road);
      return R0 && !R0.why;
    });

test('figure menu: the rows, their locks, deterministic and drawing nothing (T-340)', () => {
  const [g, run] = mkRun(),
    [g2, run2] = mkRun(),
    sig = (G, R) =>
      G.Encounter.people(R)
        .map(p => (G.Encounter.menu(R, p.id) || []).map(r => `${r.k}:${r.why}:${r.days}`).join(','))
        .join('|');
  eq(sig(g, run), sig(g2, run2), 'the same run gives the same menus');
  eq(g.R(), g2.R(), 'menus draw no R()');
  const M = g.Encounter.menu(run, someone(g, run, 'talk'));
  eq(M.map(r => r.k).join(' '), 'talk invite spar challenge card', 'Talk · Invite · Spar · Challenge · Card');
  // grey (a club not scouted) and fogged people have no menu
  const grey = g.MapModel.lifePeople(run).find(p => p.g === 'grey');
  if (grey) assert(!g.Encounter.menu(run, grey.id), 'no menu for a grey figure');
  // Invite: bond under ENC.invite.bond → locked with the gap; out (injured) → locked
  const low = g.Encounter.people(run).find(p => g.Encounter.who(run, p.id) && g.Rel.bondOf(run, p.id) < g.ENC.invite.bond);
  assert(low, 'someone with a low bond');
  assert(
    /bond \d+, needs 20/.test(g.Encounter.row(run, low.id, 'invite').why),
    'the bond gap: ' + g.Encounter.row(run, low.id, 'invite').why
  );
  const mate = someone(g, run, 'invite');
  assert(mate != null, 'a friend you may invite');
  run.people[mate].inj = 2;
  assert(/injured/.test(g.Encounter.row(run, mate, 'invite').why), 'injured: out');
  run.people[mate].inj = 0;
  // Spar: no court within ENC.spar.r → "needs a court"; your own squad → locked
  const rows = g.Encounter.people(run)
    .map(p => g.Encounter.row(run, p.id, 'spar'))
    .filter(Boolean);
  assert(
    rows.some(r => /needs a court/.test(r.why)),
    'a spar without a court nearby'
  );
  const tm = g.Run.mates(run).find(m => g.Encounter.who(run, m.id));
  if (tm) assert(/own squad/.test(g.Encounter.row(run, tm.id, 'spar').why), 'no spar with your own squad');
  if (tm) eq(g.Encounter.row(run, tm.id, 'challenge').why, 'your own club', 'no challenge of your own club');
  // the whole menu is shut in a match week and with an event open
  run.event = { id: 'x' };
  assert(
    g.Encounter.menu(run, mate).every(r => r.k === 'card' || r.why),
    'an event open: only the card'
  );
  run.event = null;
  // injured: no spar, no challenge
  run.injury = { weeks: 1 };
  const M2 = g.Encounter.menu(run, mate);
  assert(M2[2].why && M2[3].why, 'injured: no spar / challenge');
  run.injury = null;
  // the days: a walk over costs its trip days (City.trip), too many → the gap
  run.days = 0;
  const far = g.Encounter.people(run).find(p => g.City.trip(run, p.at) > 0);
  if (far) assert(/no days left/.test(g.Encounter.row(run, far.id, 'talk').why), 'no days for the walk');
});

test('figure menu: Talk once a day per person (met_road), Invite by hash joins your next order (the floor bonus) (T-340)', () => {
  const [g, run] = mkRun(),
    id = someone(g, run, 'talk'),
    W = g.Encounter.who(run, id),
    d0 = run.days,
    t = g.City.trip(run, W.at),
    trip = g.City.walkTo(run, W.at);
  assert(trip != null, 'you walk over');
  eq(run.days, d0 - t, 'the walk: its trip days only (no day of its own)');
  const r = g.Encounter.talk(run, id);
  assert(r.hi && r.line && g.Rel.list(run, id).some(e => e.k === 'met_road'), 'talk: their line, met_road');
  eq(g.Encounter.row(run, id, 'talk').why, 'talked today', 'once a day');
  run.days -= 1; // a new day
  eq(g.Encounter.row(run, id, 'talk').why, '', 'the next day: again');
  // Invite: the hash decides, the same in a twin; yes → the next order at a kit place counts them on its floor
  const [h, twin] = mkRun(),
    [k, base] = mkRun(),
    who = someone(h, twin, 'invite');
  assert(who != null, 'someone to invite');
  const a = h.Encounter.invite(twin, who),
    b = g.Encounter.row(run, who, 'invite') && !g.Encounter.row(run, who, 'invite').why ? g.Encounter.invite(run, who) : null;
  if (b) eq(a.yes, b.yes, 'deterministic');
  eq(h.Encounter.row(twin, who, 'invite').why ? 1 : 0, 1, 'asked: locked for today');
  // force a yes and check the floor bonus against the twin without one
  twin.enc.inv = who;
  const spot = Object.keys(h.SPOTS).find(s => h.SPOTS[s].kit && h.SPOTS[s].train && h.City.can(twin, s).ok && h.City.can(base, s).ok);
  twin.sta = base.sta = 100;
  const pv1 = h.City.withInvite(twin, spot, () => h.Training.preview(twin, h.City.lead(spot), false, 1, spot)),
    pv0 = k.Training.preview(base, k.City.lead(spot), false, 1, spot);
  assert(pv1.mates.includes(who) && !pv0.mates.includes(who), 'on the floor for the preview');
  assert(pv1.main[2] > pv0.main[2], `more EXP: ${pv1.main[2]} vs ${pv0.main[2]}`);
  const floor0 = JSON.stringify(twin.floor),
    line = h.City.day(twin, spot, false);
  assert(/ · with /.test(line), 'the day says who came: ' + line);
  eq(JSON.stringify(twin.floor), floor0, 'the floor is put back');
  eq(h.Encounter.invited(twin), null, 'used up by the order');
  // a place without a floor (Stretch at home) keeps the invite for the next drill
  twin.enc.inv = who;
  eq(h.City.joins(twin, 'home'), null, 'home has no floor');
});

test('figure menu: Spar — a court nearby, no stake, the day, XP and a memory either way (T-340)', () => {
  const [g, run] = mkRun();
  let id = someone(g, run, 'spar');
  if (id == null) {
    // put a court next to someone: reveal every court and take the person nearest one
    const C = g.Encounter.courts(run);
    id = g.Encounter.people(run)
      .filter(p => g.Encounter.who(run, p.id))
      .find(p => C.some(c => Math.hypot(c.at[0] - p.at[0], c.at[1] - p.at[1]) < g.ENC.spar.r * 3))?.id;
    g.ENC.spar.r *= 3;
  }
  assert(id != null && !g.Encounter.row(run, id, 'spar').why, 'someone to spar');
  const money = run.money,
    rep = JSON.stringify(run.rep || {}),
    d0 = run.days,
    R0 = g.Encounter.row(run, id, 'spar'),
    fx = g.Encounter.spar(run, id);
  assert(fx && fx.b === g.Encounter.who(run, id).t, 'their crew');
  const m = g.Cup.simNow(fx);
  assert(m.over, 'played');
  eq(run.money, money, 'no stake, no fee');
  eq(JSON.stringify(run.rep || {}), rep, 'no standing');
  eq(run.days, d0 - R0.days, 'the trip + a day');
  assert(
    g.Rel.list(run, id).some(e => e.k === 'sparred'),
    'sparred, win or lose'
  );
  assert(/Sparred/.test(run.log[0].t), 'the diary: ' + run.log[0].t);
  assert(run.mlog[run.mlog.length - 1].round === 'Spar' || run.mlog.some(x => x.round === 'Spar'), 'in the match history');
});

// ---- the Ref drone (spec §4.38, T-339): buy / rent, pickup games on open ground, who plays off a flat floor ----------------------
/** Map points on a grid with their ground (City.groundAt): [{ p, G }]. */
function grounds(g, run, step = 53) {
  const out = [];
  for (let y = step / 2; y < g.CITY.h; y += step)
    for (let x = step / 2; x < g.CITY.w; x += step) out.push({ p: [x, y], G: g.City.groundAt(run, [x, y]) });
  return out;
}
/** A point with a pickup open (or only its foe's refusal / days in the way), nearest people first: { p, P } or null. */
function pickupSpot(g, run, ok = P => !P.why) {
  for (const q of g.Encounter.people(run))
    for (const [dx, dy] of [
      [40, 0],
      [0, 40],
      [-40, 0],
      [0, -40],
      [70, 70],
      [-70, 70]
    ]) {
      const p = [q.at[0] + dx, q.at[1] + dy],
        P = g.Encounter.pickup(run, p);
      if (ok(P)) return { p, P };
    }
  return null;
}
test('drone: buy at the Cargo Shed, rent at a court for one match; the ground under you — none on a road, building or water (T-339)', () => {
  const [g, run] = mkRun();
  eq(g.City.drone(run), '', 'no drone at the start');
  const S = pickupSpot(g, run, P => /needs the drone/.test(P.why));
  assert(S, 'without the drone: "needs the drone" (the gap: buy or rent)');
  // buy: the Cargo Shed at the airport, a flat price, once
  const m0 = run.money;
  assert(g.City.can(run, 'cargo').ok, 'the Cargo Shed sells it');
  eq(g.City.price(run, 'cargo'), g.DRONE.buy, 'a flat price');
  const line = g.City.day(run, 'cargo');
  assert(/bought the Ref drone/.test(line), line);
  eq(run.money, m0 - g.DRONE.buy, 'paid');
  eq(g.City.drone(run), 'own', 'yours');
  eq(g.City.can(run, 'cargo').why, 'you have the drone', 'once');
  // the ground: sea, water, road, buildings → none; sand / grass / asphalt / slope all found somewhere
  const G = grounds(g, run),
    kinds = new Set(G.filter(x => x.G.k).map(x => x.G.k));
  eq([...kinds].sort().join(','), 'asphalt,grass,sand,slope', 'every ground somewhere');
  eq(g.City.groundAt(run, [5, 5]).why, 'in the sea', 'the sea');
  const res = g.GROUND.find(q => q.kind === 'water');
  eq(g.City.groundAt(run, [res.poly.x, res.poly.y]).why, 'in the water', 'the reservoir');
  const [a, b] = g.ROADS.edges[0],
    mid = [(g.ROADS.nodes[a][0] + g.ROADS.nodes[b][0]) / 2, (g.ROADS.nodes[a][1] + g.ROADS.nodes[b][1]) / 2];
  eq(g.City.groundAt(run, mid).why, 'on the road', 'a road');
  const lot = g.MapModel.lots(run).find(l => !g.City.groundAt(run, l.at).why.includes('road'));
  eq(g.City.groundAt(run, lot.at).why, 'among the buildings', 'a building');
  assert(
    G.filter(x => x.G.why).every(x => /no pickup here|answer|match week/.test(g.Encounter.pickup(run, x.p).why)),
    'no pickup where there is no ground'
  );
  assert(
    G.filter(x => x.G.k === 'sand').every(x => g.MapModel.onSand(x.p)),
    'sand is the beach strip'
  );
  assert(
    G.filter(x => x.G.k === 'sand').every(x => x.G.wind > 0),
    'the beach is windy'
  );
  // rent: at a court, one match
  const [h, twin] = mkRun(),
    C = h.Encounter.courts(twin)[0];
  eq(h.City.rentWhy(twin, C), '', 'rent at a court');
  const m1 = twin.money;
  assert(/Rented a Ref drone/.test(h.City.rentDrone(twin, C)), 'rented');
  eq(twin.money, m1 - h.DRONE.rent, 'paid the rent');
  eq(h.City.drone(twin), 'rent', 'rented');
  assert(/rented/.test(h.City.rentWhy(twin, C)), 'one at a time');
  const T = pickupSpot(h, twin);
  assert(T, 'a pickup with the rented drone');
  h.Cup.simNow(h.Encounter.pickupFx(twin, T.p));
  eq(h.City.drone(twin), '', 'a rented drone is spent after one match');
  // a cup / evaluation week: no pickup
  twin.drone = { own: 1 };
  const wk = twin.week;
  twin.week = Object.keys(h.CALENDAR)
    .map(Number)
    .find(w => h.CALENDAR[w] === 'eval');
  assert(/match week/.test(h.Encounter.pickup(twin, T.p).why), 'not in an evaluation week');
  twin.week = wk;
});
test('drone: a pickup — the people around, Picky / Egoist refuse but on asphalt, the field match on its ground; Spar with the drone (T-339)', () => {
  const [g, run] = mkRun();
  run.drone = { own: 1 };
  const S = pickupSpot(g, run);
  assert(S, 'a pickup somewhere near people');
  const { p, P } = S,
    W = g.Encounter.who(run, P.foe);
  assert(W && W.t && Math.hypot(W.at[0] - p[0], W.at[1] - p[1]) <= g.ENC.pickup.r, 'their crew, around the point');
  eq(JSON.stringify(g.Encounter.pickup(run, p)), JSON.stringify(P), 'deterministic');
  // who refuses: by headline behaviour (Picky = cynical, Egoist = proud) off a flat floor; asphalt is fine; the rest play anywhere
  const id = P.foe,
    tr = run.people[id].traits.slice();
  for (const k of ['sand', 'grass', 'slope', 'asphalt'])
    for (const b of ['cynical', 'proud', 'warm', 'reckless', 'steady', 'loyal', 'jealous', 'calculating']) {
      run.people[id].traits = [b, tr[1]];
      const why = g.Encounter.refuses(run, id, k),
        no = (b === 'cynical' || b === 'proud') && k !== 'asphalt';
      eq(!!why, no, `${b} on ${k}`);
      if (no) assert(new RegExp(`won’t play on ${k}.*flat floor only \\((Picky|Egoist)\\)`).test(why), why);
    }
  run.people[id].traits = ['cynical', tr[1]];
  const P2 = g.Encounter.pickup(run, p);
  if (P.g.k !== 'asphalt') {
    assert(P2.foe !== id && P2.refused.some(r => r.id === id), 'a Picky crew refuses and says so; the next crew may play');
    if (P2.foe == null) assert(/flat floor only/.test(P2.why), 'the row says why: ' + P2.why);
  }
  run.people[id].traits = tr;
  // the match: the field venue, its ground on the engine, the day, the memory, the drone stays (yours)
  const d0 = run.days,
    fx = g.Encounter.pickupFx(run, p);
  eq(fx.venue, 'field', 'the field venue');
  eq(fx.ground.k, P.g.k, 'its ground');
  const m = g.Cup.simNow(fx);
  eq(m.ground.k, P.g.k, 'the engine plays on it');
  eq(JSON.stringify(m.ground.home), JSON.stringify(g.Encounter.matchGround(run, P.field, [fx.a, fx.b]).home), 'who was born to it');
  eq(run.days, d0 - P.days, 'the trip + a day');
  assert(/Pickup game with/.test(run.log[0].t), run.log[0].t);
  assert(
    g.Rel.list(run, id).some(e => e.k === 'sparred'),
    'a memory either way'
  );
  eq(g.City.drone(run), 'own', 'your own drone stays');
  // Spar from the figure menu: with the drone a court is no longer needed — open ground near them will do
  const sp = g.Encounter.people(run)
    .map(q => g.Encounter.row(run, q.id, 'spar'))
    .filter(r => r && r.court && r.court.g);
  assert(sp.length, 'a spar on a field');
  run.drone = null;
  assert(
    g.Encounter.people(run).every(q => {
      const r = g.Encounter.row(run, q.id, 'spar');
      return !r || !r.court || !r.court.g;
    }),
    'no field without the drone'
  );
});
test('drone: a road stop’s crew challenged on the spot — on the field there, the trip and the day at the stop (T-339)', () => {
  const [g, run] = mkRun();
  run.drone = { own: 1 };
  run.fans = 1e6; // (Wei's clubs take a famous name's challenge)
  let E = null;
  g.Encounter.force = null;
  for (const { trip } of trips(g, run, 0)) {
    for (const c of g.Encounter.near(run).filter(c => c.kind === 'crew')) {
      g.Encounter.force = c.key;
      E = g.Encounter.on(run, trip, { stop: 'all' });
      g.Encounter.force = null;
      if (E && E.kind === 'crew' && !g.Encounter.spot(run, E).why && g.Fight.worth(run, E.ti, 0)?.accepts) break;
      E = null;
    }
    if (E) break;
  }
  assert(E, 'a crew on the road that takes a challenge, open ground at the stop');
  const S = g.Encounter.spot(run, E),
    stop = g.City.trip(run, S.field.at) + 1,
    hq = g.City.scoutCost(run, E.ti);
  eq(g.Fight.cost(run, E.ti, S.field.at), stop, 'on the spot: the trip to the stop and the day');
  eq(g.Fight.cost(run, E.ti), hq, 'at their HQ: the trip there and the day');
  assert(stop < hq, `the stop is nearer than their HQ (${stop} vs ${hq} days)`);
  const dd = run.days;
  run.days = stop; // (time for the stop, not for their HQ)
  assert(g.Fight.offer(run, E.ti, 0, S.field.at), 'the days left fit the stop: Challenge here goes ahead');
  eq(g.Fight.offer(run, E.ti, 0), null, 'the same days would not reach their HQ');
  run.days = dd;
  const d0 = g.City.days(run),
    r = g.Encounter.answer(run, E, 'here');
  assert(r && r.fx, 'played on the spot');
  eq(r.fx.venue, 'field', 'the field venue');
  const m = g.Cup.simNow(r.fx);
  eq(d0 - g.City.days(run), stop, `the days spent are the stop's (${stop}), not the HQ's (${hq})`);
  eq(m.ground.k, S.field.g.k, 'its ground');
  eq(JSON.stringify(run.pos), JSON.stringify(S.field.at), 'you stand at the stop, not their HQ');
  run.drone = null;
  assert(/needs the drone/.test(g.Encounter.spot(run, E).why), 'without the drone: at their HQ only');
});
