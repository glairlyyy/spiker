// Tests: the day in hours (spec §4.41, T-352) — actions cost hours, sleep ends the day, 02:00, the 13:00 match, NPC day plans.
const { load, test, assert, eq } = require('./harness');

/** A fresh Endless run in a training week, at home at 07:00, rested, with money. */
function dayRun(seed = 41) {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Day', mode: { story: false } });
  run.event = null;
  run.week = 2;
  run.clock = g.City.freshClock();
  run.money = 1000;
  run.housing = 'studio';
  run.pos = g.City.at(run, 'home').map(Math.round);
  run.sta = run.staMax;
  return [g, run];
}

test('day: an order takes 2 / 3 / 4 h (Stretch from 1 h) — more gain, each hour dearer in stamina, fail and price climb (T-352)', () => {
  const [g, run] = dayRun();
  eq(g.City.hourOpts('heavy').join(','), '2,3,4', 'drills: 2–4 h');
  eq(g.City.hourOpts('haul').join(','), '2,3,4', 'work: 2–4 h');
  eq(g.City.hourOpts('stretch').join(','), '1,2,3', 'Stretch from 1 h');
  const at = 'weiPower',
    pv = h => g.Training.preview(run, 'heavy', false, g.City.orderX(run, at, h), at, h),
    [p2, p3, p4] = [2, 3, 4].map(pv);
  assert(p2.main[2] < p3.main[2] && p3.main[2] < p4.main[2], `more hours, more EXP (${p2.main[2]} / ${p3.main[2]} / ${p4.main[2]})`);
  assert(
    p3.sta - p2.sta > p2.sta / 2 && p4.sta - p3.sta > p3.sta - p2.sta,
    `each hour costs more stamina than the last (${p2.sta} / ${p3.sta} / ${p4.sta})`
  );
  run.sta = 40;
  const f = [2, 3, 4].map(h => g.Training.failP(run, false, h));
  assert(f[0] < f[1] && f[1] < f[2], `the fail chance climbs with the hours (${f.join(' / ')})`);
  assert(g.City.price(run, at, 'heavy', 4) > g.City.price(run, at, 'heavy', 2), 'longer costs more money');
  eq(g.Training.preview(run, 'haul', false, 1, 'harbor', 4).pay, 2 * g.DAY_ORDERS.haul.pay, 'Work pays by the hour (4 h = twice 2 h)');
});

test('day: a long session can injure even rested; a 2 h one at good stamina never fails (T-352)', () => {
  const [g, run] = dayRun();
  const next = g.RNG.next;
  g.RNG.next = () => 0; // every roll lands
  try {
    run.pos = g.City.at(run, 'acaGym').slice();
    run.sta = 90;
    const a = g.City.day(run, 'acaGym', false, 'allRound', 2);
    assert(!/failed/.test(a) && !run.injury, `2 h at 90 stamina: done (${a})`);
    run.sta = 60; // (above the low-stamina injury line)
    const b = g.City.day(run, 'acaGym', false, 'allRound', 4);
    assert(/injured!/.test(b) && run.injury, `4 h: the hours alone can injure (${b})`);
  } finally {
    g.RNG.next = next;
  }
});

test('day: the walk by the route — in 5-minute steps (no 1 h minimum, §4.43), none where you stand, a run faster (T-352, T-365)', () => {
  const [g, run] = dayRun();
  eq(g.City.trip(run, run.pos), 0, 'standing there: no walk');
  const near = [run.pos[0] + 10, run.pos[1]];
  eq(g.City.trip(run, near), g.CLOCK.min, 'a few steps: 5 game minutes');
  const far = g.City.at(run, 'trail'),
    w = g.City.trip(run, far),
    r = g.City.travelDays(run, far, 'run');
  eq(w, Math.max(1, Math.round(g.City.path(run.pos, far).cost / g.WALK_PACE / g.CLOCK.min)) * g.CLOCK.min, 'the route ÷ WALK_PACE');
  assert(r < w, `running is faster (${r} h vs ${w} h)`);
  const h0 = g.City.hour(run);
  assert(g.City.travelTo(run, far), 'walked');
  eq(g.City.hour(run), h0 + w, 'the clock moved by the walk');
  eq(run.clock.log[0].k, 'trip', "today's strip: the walk");
});

test('day: Sleep 4 / 6 / 8 h — what each brings back, 4 h costs mood; it ends the day (T-352)', () => {
  for (const [h, frac] of [
    [8, 1],
    [6, 0.75],
    [4, 0.45]
  ]) {
    const [g, run] = dayRun();
    run.sta = 0;
    run.clock.hour = 22;
    const mood = run.mood,
      line = g.City.day(run, 'home', false, null, h);
    assert(/Slept/.test(line), line);
    eq(run.sta, Math.round(run.staMax * frac), `${h} h: ${frac * 100} % of what was missing`);
    eq(run.mood, h === 4 ? Math.max(0, mood - 1) : mood, `${h} h: mood ${h === 4 ? 'down' : 'kept'}`);
    eq(run.clock.day, 2, 'the next day');
    eq(run.clock.hour, (22 + h) % 24, `woke at ${(22 + h) % 24}:00`);
    eq(run.dayLog.length, 1, 'the day joins the week track');
  }
  const [g, run] = dayRun();
  eq(g.City.hoursAt('home', null, 3), 8, 'never another length (4 / 6 / 8 only)');
  run.housing = 'homeless';
  run.sta = 0;
  g.City.day(run, 'home', false, null, 8);
  assert(run.sta < run.staMax, 'a poor bed: 8 h is not all of it (× your housing’s rest)');
});

test('day: up past 02:00 you nod off where you stand; past it only sleep; day 7’s sleep spends the week (T-352)', () => {
  const [g, run] = dayRun();
  run.clock.hour = 25; // 01:00
  run.sta = 10;
  const mood = run.mood,
    line = g.City.day(run, 'home', false, 'stretch', 2);
  assert(/past 02:00: nodded off/.test(line), line);
  eq(run.clock.day, 2, 'nodded off: the day ended');
  eq(run.clock.hour, (27 + g.DAY.nod) % 24, `${g.DAY.nod} h where you stood`);
  assert(run.mood < mood || mood === 0, 'mood down');
  run.clock.hour = g.DAY.late;
  assert(/past 02:00/.test(g.City.can(run, 'acaGym').why), 'past 02:00: no training');
  assert(g.City.can(run, 'home', null, 6).ok, '…but sleep');
  run.clock = g.City.freshClock();
  run.clock.day = g.WEEK_DAYS;
  run.clock.hour = 23;
  g.City.day(run, 'home', false, null, 8);
  assert(g.City.night(run) && g.City.days(run) === 0, 'slept through day 7: the week is spent');
  assert(/end the week/.test(g.City.can(run, 'acaGym').why), 'only End week is left');
  g.Run.endWeek(run);
  eq(JSON.stringify([run.clock.day, run.clock.hour]), JSON.stringify([1, 7]), 'the new week: day 1, where the sleep left you (07:00)');
});

test('day: a match you are made to play starts at 13:00 — the morning is yours, the walk counts (T-352)', () => {
  const [g, run] = dayRun();
  run.week = 4; // an evaluation week (the Academy's)
  eq(g.Run.weekType(run), 'eval', 'an evaluation week');
  const M = g.City.matchAt(run);
  assert(M && M.at, `the venue: ${M && M.name}`);
  const walk = g.City.trip(run, M.at);
  run.clock.hour = g.DAY.match - walk - 1;
  assert(!g.City.noTime(run, 1), 'an hour still fits before the walk');
  assert(/the match is at 13:00/.test(g.City.noTime(run, 2)), 'two would make you late');
  run.clock.hour = 8;
  g.City.matchPlayed(run);
  const b = run.clock.log[run.clock.log.length - 1];
  eq(JSON.stringify([b.k, b.from, b.h]), JSON.stringify(['battle', g.DAY.match, g.DAY.matchH]), 'played 13:00–15:00');
  eq(JSON.stringify(run.pos), JSON.stringify(M.at.map(Math.round)), 'you stand at the venue');
});

test('day: NPCs keep one plan a day and pick a new one each new day (deterministic; day 1 = the week’s plan) (T-352)', () => {
  const [g, run] = dayRun();
  const homes = [...g.People.homes(run).values()].slice(0, 60),
    plans = d => homes.map(e => JSON.stringify(g.People.plan(run, e.p, e.home, d)));
  eq(JSON.stringify(plans(1)), JSON.stringify(homes.map(e => JSON.stringify(g.People.plan(run, e.p, e.home)))), 'day 1 is the week’s plan');
  eq(JSON.stringify(plans(3)), JSON.stringify(plans(3)), 'the same day, the same plans');
  assert(
    plans(2).some((p, i) => p !== plans(1)[i]),
    'a new day: some pick another plan'
  );
  const r0 = g.R(),
    [g2] = dayRun();
  eq(r0, g2.R(), 'plans draw no R()');
});

test('day: the clock is saved (RUN_VERSION 25) (T-352)', () => {
  const [g, run] = dayRun();
  g.City.day(run, 'acaGym', false, 'allRound', 3);
  g.Run.save(run);
  const back = g.Run.load();
  eq(JSON.stringify(back.clock), JSON.stringify(run.clock), 'the clock round-trips');
  eq(g.RUN_VERSION, 25, 'v25');
});
