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
