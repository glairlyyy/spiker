// Team stories (spec §4.36 2–4): T-328 (the team chat), T-329 (personal arcs), T-330 (duo cards, ex-teammates across the net).
const { load, test, assert, eq } = require('./harness');

const mkRun = (seed, role = 'WS') => {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role, name: 'Story' });
  run.event = null;
  return [g, run];
};
/** Count the main stream's draws while fn runs. */
const draws = (g, fn) => {
  const next = g.RNG.next;
  let n = 0;
  g.RNG.next = (...x) => (n++, next.apply(g.RNG, x));
  try {
    fn();
  } finally {
    g.RNG.next = next;
  }
  return n;
};
/** A match of your squad (side 0) against club 0, played headless (no Cup.record: the tests call Team themselves). */
const play = (g, run, opp = run.teams[0]) => {
  const m = g.newMatch(g.Run.myTeam(run), opp, false);
  while (!m.over) g.playRally(m);
  return m;
};

// ---- T-328: the team chat ----
test('team chat: 2–4 teammates speak in their behaviour’s voice for the result and the lines; no draws', () => {
  let seen = 0;
  for (const seed of [328, 329, 330, 331]) {
    const [g, run] = mkRun(seed),
      you = g.Run.you(run),
      m = play(g, run);
    assert(m.played.has(you.id), 'you played');
    let C;
    eq(
      draws(g, () => (C = g.Team.chatFor(run, m, 0))),
      0,
      'no draws'
    );
    assert(C && C.msgs.length >= 2 && C.msgs.length <= 4, `2–4 messages (${C && C.msgs.length})`);
    eq(C.win, m.winner === 0, 'the result');
    for (const x of C.msgs) {
      const beh = run.people[x.id].traits[0],
        L = g.TEAM_CHAT[beh][x.sit].map(t => t.replace(/\{you\}/g, you.name.split(' ')[0]));
      assert(x.sit.startsWith(m.winner === 0 ? 'win' : 'loss'), `${x.sit}: the result`);
      assert(L.includes(x.t), `${beh}.${x.sit}: "${x.t}" is that behaviour's line`);
      assert(!/\{/.test(x.t), 'placeholders filled');
      seen++;
    }
    const again = g.Team.chatFor(run, m, 0);
    eq(JSON.stringify(again.msgs), JSON.stringify(C.msgs), 'the same match, the same chat');
  }
  assert(seen >= 8, 'enough messages checked');
});

test('team chat: your line vs theirs picks the situation (a Hothead blames you for a loss you lost)', () => {
  const [g, run] = mkRun(332),
    you = g.Run.you(run),
    m = play(g, run),
    mate = g.squadOf(m.t[0]).find(p => p !== you && m.played.has(p.id));
  m.winner = 1;
  m.stat[you.id] = { k: 0, blk: 0, ace: 0, dig: 0, ast: 0, err: 9 };
  m.stat[mate.id] = { k: 9, blk: 0, ace: 0, dig: 0, ast: 0, err: 0 };
  run.people[mate.id].traits = ['reckless', 'loyal'];
  eq(g.Team.sit(run, m, 0, mate), 'loss_them', 'their line beat yours: _them');
  m.stat[you.id] = { k: 12, blk: 0, ace: 0, dig: 0, ast: 0, err: 0 };
  m.stat[mate.id] = { k: 1, blk: 0, ace: 0, dig: 0, ast: 0, err: 3 };
  eq(g.Team.sit(run, m, 0, mate), 'loss_you', 'yours beat theirs: _you');
  m.stat[you.id] = { k: 0, blk: 0, ace: 0, dig: 0, ast: 0, err: 9 };
  m.stat[mate.id] = { k: 9, blk: 0, ace: 0, dig: 0, ast: 0, err: 0 };
  const C = g.Team.chatFor(run, m, 0),
    x = C.msgs.find(y => y.id === mate.id);
  if (x) assert(g.TEAM_CHAT.reckless.loss_them.includes(x.t), 'the Hothead’s own line');
});

test('team chat: one reply writes one memory with each who wrote; a second reply nothing; a watched match clears it', () => {
  const [g, run] = mkRun(333),
    m = play(g, run),
    C = g.Team.chatFor(run, m, 0),
    before = Object.fromEntries(C.msgs.map(x => [x.id, g.Rel.list(run, x.id).length]));
  let n;
  eq(
    draws(g, () => (n = g.Team.reply(run, 'back'))),
    0,
    'no draws'
  );
  eq(n, C.msgs.length, 'Back them: a memory each (no behaviour turns it to 0)');
  for (const x of C.msgs) {
    const l = g.Rel.list(run, x.id);
    eq(l.length, before[x.id] + 1, 'one memory');
    eq(l[l.length - 1].k, 'chat_back', 'the reply kind');
  }
  eq(g.Team.reply(run, 'joke'), 0, 'one reply a chat');
  assert(!g.Team.pending(run), 'answered');
  // Stay quiet: 0 for some behaviours (no memory), negative for the Friendly
  const m2 = play(g, run),
    C2 = g.Team.chatFor(run, m2, 0);
  C2.msgs.forEach((x, i) => (run.people[x.id].traits[0] = ['warm', 'proud'][i % 2]));
  eq(g.Team.reply(run, 'quiet'), Math.ceil(C2.msgs.length / 2), 'quiet: only the Friendly remember it');
  const w = C2.msgs[0],
    l = g.Rel.list(run, w.id);
  assert(l[l.length - 1].k === 'chat_quiet' && l[l.length - 1].v < 0, 'the Friendly wanted an answer');
  // watched from the bench: no chat
  const you = g.Run.you(run),
    m3 = play(g, run);
  m3.played.delete(you.id);
  g.Team.chatFor(run, m3, 0);
  assert(!g.Team.pending(run), 'no chat for a match you did not play');
});

test('team chat: Cup.record writes it for every match of yours (the career path)', () => {
  const [g, run] = mkRun(334),
    m = play(g, run);
  g.Cup.record(run, m, 'challenge');
  assert(g.Team.pending(run), 'a chat after the logged match');
});

// ---- T-329: personal arcs ----
const arcRun = seed => {
  const [g, run] = mkRun(seed);
  run.week = g.TEAM.arc.start[1]; // every hashed start week has come
  return [g, run];
};
test('arcs: circle members start one arc a season from their want (by hash, at most TEAM.arc.max running); no draws', () => {
  const [g, run] = arcRun(340),
    circle = g.Team.circle(run);
  assert(circle.length >= 2, 'a circle (your mates until Circle lands)');
  eq(
    draws(g, () => g.Team.week(run)),
    0,
    'no draws'
  );
  const open = g.Team.open(run);
  eq(open.length, Math.min(g.TEAM.arc.max, circle.length), 'as many as may run');
  for (const A of open) {
    eq(A.w, run.people[A.id].want, 'built on their want');
    eq(A.b, 0, 'the first beat');
    assert(circle.includes(A.id), 'a circle member');
  }
  const ids = open.map(A => A.id).join();
  g.Team.week(run);
  eq(
    g.Team.open(run)
      .map(A => A.id)
      .join(),
    ids,
    'no second arc while two run'
  );
  run.week = 1;
  const [g2, run2] = mkRun(340);
  run2.week = 1;
  g2.Team.week(run2);
  assert(
    g2.Team.open(run2).every(A => g2.Team.startWeek(run2, A.id) <= 1),
    'nobody starts before their week'
  );
});

test('arcs: beat by beat — pay, a match beside them, the answer; helping writes memories, growth × 1.1, then no second arc', () => {
  const [g, run] = arcRun(341);
  g.Team.week(run);
  const A = g.Team.open(run)[0],
    id = A.id,
    p = g.People.find(run, id);
  A.w = 'money'; // the debt: money → a match → a choice
  run.money = 1000;
  const mem = () => g.Rel.list(run, id).map(e => e.k);
  let r;
  eq(
    draws(g, () => (r = g.Team.answer(run, id, true))),
    0,
    'no draws'
  );
  assert(r && !r.blocked, 'paid');
  eq(run.money, 1000 - g.ARCS.money.beats[0].amt, 'the debt paid');
  assert(mem().includes('arc_help'), 'a memory for the beat');
  eq(A.st, 'next', 'the next beat waits');
  eq(g.Team.answer(run, id, true), null, 'nothing to answer between beats');
  run.week = A.at;
  g.Team.week(run);
  eq(A.st, 'open', 'the second beat opens');
  eq(A.b, 1, 'beat 2');
  eq(g.Team.beat(run, A).ask, 'match', 'a mate: the match itself');
  g.Team.answer(run, id, true);
  eq(A.st, 'wait', 'a promise');
  const m = play(g, run);
  m.played.add(id);
  m.played.add(g.Run.you(run).id);
  g.Team.matched(run, m);
  eq(A.b, 2, 'the match beside them kept it');
  run.week = A.at;
  g.Team.week(run);
  eq(A.st, 'open', 'the last beat');
  eq(g.Team.growMul(run, p), 1, 'no growth bonus before the end');
  g.Team.answer(run, id, true);
  eq(A.st, 'done', 'seen through');
  assert(mem().includes('arc_done'), 'the big memory');
  eq(g.Team.growMul(run, p), g.TEAM.grow, 'their growth × 1.1 this season');
  assert(
    Math.abs(g.Gifts.grow(run, p, 'train') / g.Gifts.grow(run, { ...p, id: 'nobody' }, 'train') - g.TEAM.grow) < 1e-9,
    'Gifts.grow reads it'
  );
  run.week = g.TEAM.arc.last;
  g.Team.week(run);
  eq(g.Team.arc(run, id), A, 'one arc a member a season');
  run.year = 2;
  eq(g.Team.growMul(run, p), 1, 'the bonus is for that season');
});

test('arcs: refusing ends it (arc_refused; a soft beat pays back instead); an unanswered beat is lost', () => {
  const [g, run] = arcRun(342);
  g.Team.week(run);
  const [A, B] = g.Team.open(run);
  A.w = 'national';
  g.Team.answer(run, A.id, false);
  eq(A.st, 'lost', 'refused: over');
  assert(
    g.Rel.list(run, A.id).some(e => e.k === 'arc_refused'),
    'arc_refused'
  );
  B.w = 'money';
  B.b = 2;
  const m0 = run.money;
  g.Team.answer(run, B.id, false);
  eq(run.money, m0 + 80, 'the payoff taken back');
  assert(!g.Rel.list(run, B.id).some(e => e.k === 'arc_refused'), 'soft: no hard feelings');
  const [g2, run2] = arcRun(343);
  g2.Team.week(run2);
  const C = g2.Team.open(run2)[0];
  run2.week += g2.TEAM.arc.open + 1;
  g2.Team.week(run2);
  eq(C.st, 'lost', 'left unanswered');
  assert(
    g2.Rel.list(run2, C.id).some(e => e.k === 'ignored'),
    'ignored'
  );
});

test('arcs: the year-2 Cup lean puts a friend you saw through into your squad (no draws)', () => {
  const [g, run] = mkRun(344),
    r = 'wei',
    you = g.Run.you(run),
    all = g.Pool.players(run, r).filter(p => !p.named),
    role = you.role,
    same = all.filter(p => p.role === role),
    others = all.filter(p => p.role !== role);
  const [w, f] = same,
    e = { region: r, ids: [you.id, w.id, ...others.slice(0, 4).map(p => p.id)] },
    o = { region: r, ids: [f.id, ...others.slice(4, 9).map(p => p.id)] },
    out = [e, o];
  g.Team.of(run).helped = { [f.id]: [1] };
  g.TEAM.lean = 1;
  g.TEAM.leanOvr = 99;
  run.year = 1;
  g.Team.lean(run, out);
  assert(!e.ids.includes(f.id), 'year 1: no lean');
  run.year = 2;
  eq(
    draws(g, () => g.Team.lean(run, out)),
    0,
    'no draws'
  );
  assert(e.ids.includes(f.id) && !e.ids.includes(w.id), 'the friend takes the same-role seat');
  assert(o.ids.includes(w.id), 'the replaced player takes theirs');
  assert(e.ids.includes(you.id), 'you stay');
});
