// Tests: court matches (T-229). Filled by its task; harness.js has the loader, runner and helpers.
const { load, test, assert, eq } = require('./harness');

/** A fresh run in a training week at the venue's door, with money and stamina. */
function courtRun(seed = 5) {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Court', mode: {} });
  run.week = 6;
  run.event = null;
  run.days = 7;
  run.money = 5000;
  run.pos = g.VENUES.arena.at.slice(); // no trip
  return { g, run };
}
/** Play fixture fx to the end (the match screen's onFinish path) and return the match. */
function play(g, fx, win) {
  const m = g.newMatch(fx.a, fx.b, false);
  if (fx.setup) fx.setup(m);
  while (!m.over) g.playRally(m);
  if (win != null) m.winner = win ? 0 : 1;
  fx.onFinish(m);
  return m;
}

test('court: tiers, the draw, a loss costs only the fee, a win pays 2.5 × fee', () => {
  const { g, run } = courtRun();
  eq(g.Court.why(run, 'arena', 'pro'), '', 'a training week at the venue: you can play');
  // the draw: 4 starters by role + 2 on the bench, near the target, never your side, never you
  const side = g.Fight.challengeSide(run),
    mine = side.T,
    ours = new Set(g.squadOf(mine)),
    target = g.Court.target(run, 'pro');
  let sum = 0,
    n = 0,
    aces = 0;
  for (let i = 0; i < 400; i++) {
    const { T, ace } = g.Court.draw(run, 'arena', 'pro', mine);
    if (ace) aces++;
    else {
      sum += T.P.reduce((a, p) => a + g.ovr(p), 0) / 4;
      n++;
    }
    if (i < 40) {
      eq(T.P.map(p => p.role).join(), 'S,MB,WS,WS', 'seated by role');
      eq(T.bench.length, 2, 'two on the bench');
      assert(
        g.squadOf(T).every(p => !ours.has(p) && p !== g.Run.you(run)),
        'never your side, never you'
      );
    }
  }
  assert(Math.abs(sum / n - target) <= 3, `Pro opponents average ${(sum / n).toFixed(1)} vs target ${target}`);
  assert(aces >= 10 && aces <= 45, `an ace in ~6 % of Pro draws (${aces} / 400)`);
  const avg = tier => {
    let a = 0;
    for (let i = 0; i < 100; i++) a += g.Court.draw(run, 'arena', tier, mine).T.P.reduce((x, p) => x + g.ovr(p), 0) / 400;
    return a;
  };
  assert(avg('elite') > avg('pro') && avg('pro') > avg('open'), 'Elite draws stronger than Pro, Pro than Open');
  let el = 0;
  for (let i = 0; i < 400; i++) if (g.Court.draw(run, 'arena', 'elite', mine).ace) el++;
  assert(el >= 35 && el <= 90, `an ace in ~15 % of Elite draws (${el} / 400)`);
  let open = 0;
  for (let i = 0; i < 400; i++) if (g.Court.draw(run, 'arena', 'open', mine).ace) open++;
  assert(open <= 30, `~3 % in Open (${open} / 400)`);
  // a loss: only the fee (no mood, standing or fans), stamina, mlog kind 'court'
  const mood = run.mood,
    fans = run.fans,
    rep = JSON.stringify(run.rep || {}),
    money = run.money,
    sta = run.sta;
  play(g, g.Court.fixture(run, 'arena', 'pro'), false);
  eq(run.money, money - 80, 'a loss costs the Pro fee');
  eq(run.mood, mood, 'no mood');
  eq(run.fans, fans, 'no fans');
  eq(JSON.stringify(run.rep || {}), rep, 'no standing');
  eq(run.sta, Math.max(0, sta - g.COURT.sta), 'the match stamina');
  eq(run.mlog[run.mlog.length - 1].kind, 'court', 'logged as a court match');
  assert(
    g.squadOf(mine).every(p => p.team === mine),
    'every lent player restored'
  );
  // a win: the prize and the fans
  run.injury = null;
  run.days = 7;
  run.pos = g.VENUES.arena.at.slice();
  const m0 = run.money,
    f0 = run.fans;
  play(g, g.Court.fixture(run, 'arena', 'elite'), true);
  eq(run.money, m0 - 200 + 500, 'a win pays 2.5 × the Elite fee');
  assert(run.fans > f0, 'and fans');
});

test('court: half the street injury risk; no court matches in an evaluation week or while injured', () => {
  const { g, run } = courtRun(9);
  // the injury roll: R() < risk; with a fixed R() the threshold is the risk passed to Fight.injure
  let seen = null;
  const injure = g.Fight.injure;
  g.Fight.injure = (r, risk) => ((seen = risk), '');
  const fx = g.Court.fixture(run, 'arena', 'open'),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  const sc = m.setScores[0],
    margin = m.winner === 0 ? 0 : Math.max(0, sc[1] - sc[0]),
    street = g.Fight.injuryRisk(run, m.t[1].ovr, margin);
  fx.onFinish(m);
  g.Fight.injure = injure;
  assert(Math.abs(seen - street * g.COURT.injury) < 1e-9, `risk ${seen} = street ${street} × ${g.COURT.injury}`);
  run.week = 8; // an evaluation week
  run.days = 7;
  run.eval = null;
  assert(g.Court.why(run, 'arena', 'open') !== '' || g.Run.weekType(run) !== 'eval', 'no court match in an evaluation week');
  if (g.Run.weekType(run) === 'eval') eq(g.Court.fixture(run, 'arena', 'open'), null, 'no fixture either');
  run.week = 6;
  run.injury = { weeks: 2 };
  assert(/Injured/.test(g.Court.why(run, 'arena', 'open')), 'injured: no court matches');
  run.injury = null;
  run.money = 10;
  assert(/needs \$/.test(g.Court.why(run, 'arena', 'pro')), 'the fee must be in hand');
});
