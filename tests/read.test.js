// Tests: participation — the read meter, Call / Fake / Block, the setter's pick and dump (T-257, T-258). Filled by its tasks;
// harness.js has the loader, runner and helpers.
const { load, test, assert, eq } = require('./harness');

test('read: the pausable rally is there to ask the prompts', () => {
  const g = load(1);
  assert(typeof g.playRallyGen === 'function' && typeof g.capCall === 'function', 'playRallyGen and capCall');
});

test('read: the revamp seams the three agents build against are declared (spec §2.14–§2.18)', () => {
  const fs = require('fs'),
    path = require('path'),
    src = ['js/ui/match-prompts.js', 'js/ui/match-exchange.js', 'js/data/match-lines.js', 'js/engine/fire.js', 'js/render/director.js']
      .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))
      .join('\n');
  for (const n of ['PROMPT_KINDS', 'exchangeShow', 'exchangeHide', 'MLINES', 'capReady', 'capCall', 'Dir'])
    assert(new RegExp(`(const|function) ${n}\\b`).test(src), n);
});

/** Play `games` matches with your player `pick(T)` answering each prompt with `answer(q, m)`; returns the matches. */
function playAs(seed, games, pick, answer, before) {
  const g = load(seed),
    out = { asks: {}, ms: [] };
  for (let i = 0; i < games; i++) {
    const T = g.mkTeams(),
      m = g.newMatch(T[i % 8], T[(i + 3) % 8], i % 2 === 0),
      you = pick(T[i % 8]);
    m.human = you.id;
    m.read = {}; // prompts on
    while (!m.over) {
      if (before) before(m, you);
      const gen = g.playRallyGen(m);
      let r = gen.next();
      while (!r.done) {
        const q = r.value;
        if (['call', 'block', 'setter'].includes(q.kind)) {
          out.asks[q.kind] = (out.asks[q.kind] || 0) + 1;
          assert(q.p.id === you.id, 'only your player is prompted');
          assert(
            q.options.every(o => o.id && o.key && o.label),
            'options: id, key, label'
          );
        }
        r = gen.next(['call', 'block'].includes(q.kind) ? answer(q, m) : q.ai);
      }
    }
    out.ms.push(m);
  }
  out.g = g;
  return out;
}
const sum = (ms, k) => ms.reduce((n, m) => n + ((m.plays && m.plays[k]) || 0), 0);
const ws = t => t.P.find(p => p.role === 'WS');

test('read: no prompts and the same beats without a human; prompts (Call, Block) for your WS', () => {
  const g = load(42),
    T = g.mkTeams(),
    m = g.newMatch(T[1], T[4], true);
  let asks = 0;
  while (!m.over) {
    const gen = g.playRallyGen(m);
    let r = gen.next();
    while (!r.done) {
      asks++;
      r = gen.next(r.value.ai);
    }
  }
  eq(asks, 0, 'no human: never prompts');
  const p = playAs(5, 4, ws, () => null);
  assert(p.asks.call > 20 && p.asks.block > 5, `prompted (${JSON.stringify(p.asks)})`);
  eq(sum(p.ms, 'call') + sum(p.ms, 'block'), 0, 'no press: nothing tallied');
});

test.slow('read: a call gets you the set; a high read draws the block; a fake can turn into a bad set', () => {
  // always call: the setter sets you whenever the pass allows it
  const call = playAs(7, 16, ws, q => (q.kind === 'call' ? 'call' : null));
  const calls = sum(call.ms, 'call'),
    ok = calls - sum(call.ms, 'refused'),
    set = sum(call.ms, 'callSet');
  assert(ok > 100 && set / ok >= 0.9, `called and accepted → set you ${set}/${ok}`);
  assert(sum(call.ms, 'refused') > 0, 'some calls are turned down ("Not now!")');
  // read: the same hitter, read pinned high vs pinned at 0 — they key on you: fewer kills, more stuffs
  const rate = rd => {
    const p = playAs(
      11,
      120,
      ws,
      () => null,
      (m, you) => (m.read[you.id] = rd)
    );
    return { st: sum(p.ms, 'stuffed') / sum(p.ms, 'att'), k: sum(p.ms, 'attK') / sum(p.ms, 'att') };
  };
  const lo = rate(0),
    hi = rate(80);
  const pc = v => (v * 100).toFixed(1) + ' %';
  assert(hi.k < lo.k - 0.03, `read 80: fewer kills than read 0 (${pc(hi.k)} vs ${pc(lo.k)})`);
  assert(hi.st > lo.st, `read 80: stuffed more than read 0 (${pc(hi.st)} vs ${pc(lo.st)})`);
  // fake at read 80: some work (read drops), a low-wit setter sometimes sets you anyway — always as a bad set
  const fk = playAs(
    13,
    24,
    ws,
    q => (q.kind === 'call' && q.options.some(o => o.id === 'fake') ? 'fake' : null),
    (m, you) => {
      m.read[you.id] = 80;
      for (const p of m.t[0].P.concat(m.t[1].P)) if (p.role === 'S') p.wit = 0.6;
    }
  );
  assert(sum(fk.ms, 'fake') > 50 && sum(fk.ms, 'fakeOk') > 0, `fakes ${sum(fk.ms, 'fake')}, worked ${sum(fk.ms, 'fakeOk')}`);
  assert(sum(fk.ms, 'fakeBad') > 0, 'a low-wit setter sets a faking hitter anyway');
  assert(sum(fk.ms, 'anywaySet') <= sum(fk.ms, 'fakeBad'), 'every set-anyway is a bad set (a double contact ends it first)');
});

test('read: committing a block in your lane is tallied; a late commit counts', () => {
  const p = playAs(
    9,
    6,
    t => t.P.find(q => q.role === 'MB'),
    (q, m) => (q.kind === 'block' ? (m.pts[0] % 2 ? 'late' : 'block') : null)
  );
  assert(sum(p.ms, 'block') > 10, `committed ${sum(p.ms, 'block')}`);
  assert(sum(p.ms, 'late') > 0 && sum(p.ms, 'late') < sum(p.ms, 'block'), 'late commits counted');
});
