// Brackets and the U21 Final Cup (entrants, seeding, byes, lineups, story mode).
const { load, test, assert, eq } = require('./harness');

test('bracket: 8 and 16 entries, byes', () => {
  const g = load(1);
  const play = order => {
    const S = g.newBracket(order),
      played = [];
    let m;
    while ((m = g.advanceBracket(S))) {
      assert(m.a !== null && m.b !== null, 'a bye reached the caller');
      m.w = Math.min(m.a, m.b); // the lower index wins
      played.push(m.round);
    }
    return { S, played };
  };
  // 8 entries: 4 quarterfinals, 2 semifinals, a final — as before
  const r8 = play([0, 7, 3, 4, 1, 6, 2, 5]);
  eq(r8.played.join(), 'Quarterfinal,Quarterfinal,Quarterfinal,Quarterfinal,Semifinal,Semifinal,Final');
  eq(g.bracketChampion(r8.S), 0);
  eq(g.newBracket([0, 7, 3, 4, 1, 6, 2, 5])[1].round, 'Quarterfinal');
  // 16 slots, 13 entrants (seeds 14–16 are byes)
  const ord = g.seedOrder(16).map(s => (s <= 13 ? s - 1 : null));
  eq(ord.filter(x => x === null).length, 3);
  const r16 = play(ord);
  eq(r16.played.length, 12, 'real matches with 3 byes');
  eq(r16.played.filter(r => r === 'Round of 16').length, 5);
  eq(g.bracketChampion(r16.S), 0);
  assert(
    r16.S.filter(x => x.round === 'Round of 16').every(x => x.w !== null),
    'every first-round slot resolved'
  );
  eq(g.bracketChampion(g.newBracket(ord)), null, 'no champion before the final');
  // seeds: 1 plays n, and seeds 1 and 2 sit in opposite halves
  for (const n of [8, 16]) {
    const o = g.seedOrder(n);
    eq(new Set(o).size, n);
    for (let k = 0; k < n; k += 2) eq(o[k] + o[k + 1], n + 1);
    assert(o.indexOf(1) < n / 2 && o.indexOf(2) >= n / 2, 'seeds 1 and 2 meet only in the final');
  }
  // an all-bye pair advances nothing
  const S = g.newBracket([0, 1, null, null, 2, 3, 4, 5]);
  g.advanceBracket(S);
  assert(S[1].bye === true && S[1].w === null, 'empty slot marked bye');
});

test('career: U21 Final Cup — entrants, seeding, byes, restore', () => {
  const mk = seed => {
    const g = load(seed);
    return [
      g,
      g.Run.create(g.Run.draft(), { role: 'WS', name: 'Cupper', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 })
    ];
  };
  // an Academy run: 11 drawn squads + the Academy squad, 4 byes, you are the Academy entrant
  const [g, run] = mk(61),
    sizes = Object.keys(g.POOL).map(r => g.Pool.size(run, r)),
    all = Object.keys(g.POOL)
      .flatMap(r => g.Pool.players(run, r))
      .concat(g.squadOf(run.pickup)),
    homes = all.map(p => p.team);
  g.Cup.start(run, g.CUPS[0]);
  const E = run.cup.entrants,
    S = run.cup.sched;
  eq(E.length, 12, '11 drawn squads (Wei 4, Wu 3, Shu 2, Outlaws 1, Gloria 1) + the Academy squad');
  assert(
    E.every(e => e.ids.length === 6),
    'every squad has 6'
  );
  assert(E[run.cup.me].academy, 'you are in the Academy entrant');
  eq(S.filter(x => x.round === 'Round of 16' && (x.a == null || x.b == null)).length, 4, 'the 4 top seeds have byes');
  eq(new Set(E.flatMap(e => e.ids)).size, E.flatMap(e => e.ids).length, 'no player in two squads');
  const top = E.map((e, i) => [i, g.Eval.squad(run, e.ids, e.name, e.color, e.region).ovr]).sort((a, b) => b[1] - a[1])[0][0];
  assert(S[0].a === top && S[0].b == null, 'the top seed sits first with a bye');
  g.Cup.finishBracket(run);
  const champ = E[g.bracketChampion(S)];
  assert(champ && typeof champ.name === 'string', 'one champion');
  assert(
    all.every((p, i) => p.team === homes[i]),
    'every player is back on their real team'
  );
  eq(
    Object.keys(g.POOL)
      .map(r => g.Pool.size(run, r))
      .join(),
    sizes.join(),
    'pool sizes unchanged'
  );
  // a Shu member with standing 60 is always drawn
  const [g2, r2] = mk(62),
    shu = g2.FACTIONS.findIndex(f => f.region === 'shu');
  g2.FACTIONS[shu].join = {};
  assert(g2.World.join(r2, shu), 'joins Shu');
  r2.rep = Object.assign({}, r2.rep, { shu: 60 });
  g2.Cup.start(r2, g2.CUPS[0]);
  assert(r2.cup.me >= 0 && !r2.cup.entrants[r2.cup.me].academy, 'a trusted member plays for a Shu squad');
  assert(!r2.result, 'the cup is on');
  // alone: watch it from the stands
  const [g3, r3] = mk(63);
  r3.mode.story = false; // (Story would hire a street crew: see the story test)
  g3.World.leaveAcademy(r3);
  g3.Cup.start(r3, g3.CUPS[0]);
  eq(r3.cup.me, -1, 'not in the cup');
  eq(r3.cups[0].place, g3.NO_CUP, 'placing: did not play');
  assert(r3.result && typeof r3.result.champ === 'string', 'the run ends and names the champion');
});

test('career: your coach picks the 4 — bench start, never played, part rewards', () => {
  const spec = { role: 'WS', name: 'Benchy', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 };
  const mk = (seed, level) => {
    const g = load(seed),
      run = g.Run.create(g.Run.draft(), spec),
      you = g.Run.you(run);
    for (const k of g.STATK) you[k] = level;
    run.week = 4;
    run.eval = null;
    run.event = null;
    return [g, run, you];
  };
  // the weakest wing spiker of the squad starts on the bench; the 4 stay in role order
  let [g, run, you] = mk(51, 25);
  const spare = g
    .squadOf(run.pickup)
    .filter(p => p.role === 'MB' && p !== you)
    .pop();
  spare.role = 'WS'; // a third wing spiker in the squad
  let L = g.Run.lineup(run, run.pickup, null, true);
  assert(!L.starts && L.rival && L.rival.score > L.you, 'the weakest WS is benched (rival ahead of you)');
  g.Run.lineup(run, run.pickup, null);
  eq(run.pickup.P.map(p => p.role).join(), 'S,MB,WS,WS', 'court order S, MB, WS, WS');
  assert(
    run.pickup.bench.includes(you) && run.pickup.P.every((p, i) => p.slot === ['S', 'MB', 'W0', 'W1'][i]),
    'you sit; slots follow the seats'
  );
  assert(run.pickup.P.includes(run.pickup.cap) && run.pickup.cap.cap, 'the captain plays');
  // never in: no grade, no win bonus, the bench reward
  g.SUB.max = 0;
  const grades0 = (run.grades || []).length;
  let fx = g.Cup.fixture(run, 'eval'),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  assert(!m.played.has(you.id), 'you never came on');
  let line = fx.onFinish(m);
  assert(/Watched from the bench/.test(line) && !/grade/.test(line), `result line: ${line}`);
  eq((run.grades || []).length, grades0, 'no grade recorded');
  assert(/Watched from the bench: \S/.test(line), 'the bench XP label is shown');
  eq(run.warm[run.warm.length - 1].win, false, 'a bench win is not your win');
  // a strong you starts; sent off at once → finished on the bench: rewards × BENCH.partMul, graded as usual
  [g, run, you] = mk(52, 99);
  L = g.Run.lineup(run, run.pickup, null, true);
  assert(L.starts, 'a strong you starts');
  g.SUB.max = 1;
  fx = g.Cup.fixture(run, 'eval');
  m = g.newMatch(fx.a, fx.b, false);
  const sub = m.t[0].bench.find(q => q.role === 'WS');
  g.subIn(m, 0, you, sub);
  while (!m.over) g.playRally(m);
  assert(m.played.has(you.id) && !m.finished.has(you.id), 'you started but finished on the bench');
  const sp0 = run.sp,
    s = m.stat[you.id] || g.blank(),
    win = m.winner === 0,
    R0 = win ? g.REWARDS.warmupWin : g.REWARDS.warmupLoss,
    gmul = g.Cup.grade(s, win)[2],
    want = Math.round((R0.sp + (s.k + s.blk + s.ace) * g.REWARDS.perPlay.sp) * g.BENCH.partMul * gmul);
  line = fx.onFinish(m);
  assert(/bench: rewards ×0\.6/.test(line) && /grade/.test(line), `part-match line: ${line}`);
  eq(run.sp - sp0, want, 'skill points × BENCH.partMul');
});

test('career: story mode cup', () => {
  const mk = (seed, role = 'WS') => {
    const g = load(seed);
    return [g, g.Run.create(g.Run.draft(), { role, name: 'Story', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 })];
  };
  const [g0, r0] = mk(71);
  eq(r0.mode.story, true, 'Story is the default');
  eq(g0.Run.create(g0.Run.draft(), { role: 'WS', name: 'E', mode: { story: false } }).mode.story, false, 'story can be switched off');
  // signed with a faction but not drawn: forced into its first squad over the weakest same-role player
  const [g, run] = mk(72);
  const ti = 0,
    reg = g.FACTIONS[ti].region;
  g.FACTIONS[ti].join = {};
  assert(g.World.join(run, ti), 'joins a faction');
  const you = g.Run.you(run),
    before = g.Pool.draw(run, reg).some(s => s.includes(you));
  g.Cup.start(run, g.CUPS[0]);
  assert(run.cup.me >= 0 && run.cup.entrants[run.cup.me].region === reg, 'you play for your faction' + (before ? ' (drawn)' : ' (forced)'));
  // an undrawn you: pin the draw away from you by making you the weakest, then check the first squad
  you.power = you.def = you.speed = you.jump = 25;
  run.cup = null;
  g.Cup.start(run, g.CUPS[0]);
  const e = run.cup.entrants.find(x => x.region === reg && x.ids.includes(you.id));
  assert(e, 'the weakest you is still in a squad');
  eq(run.cup.entrants.filter(x => x.ids.includes(you.id)).length, 1, 'in exactly one squad');
  // alone: the street crew entrant, saved with the run, never holds a second copy of you
  const [g1, r1] = mk(73, 'MB');
  g1.World.leaveAcademy(r1);
  g1.RNG.seed(5);
  const a = g1.R();
  g1.RNG.seed(5);
  g1.Cup.crew(r1);
  eq(g1.R(), a, 'the crew is built on a side stream: the main draws are untouched');
  g1.Cup.start(r1, g1.CUPS[0]);
  assert(r1.cup.me >= 0 && r1.cup.entrants[r1.cup.me].name === 'Street crew', 'alone: you enter with a street crew');
  const crew = r1.cup.entrants[r1.cup.me];
  eq(crew.ids.length, 6, 'a crew of six');
  eq(crew.ids.filter(id => id === g1.Run.you(r1).id).length, 1, 'you once');
  assert(r1.reserve.street && !r1.reserve.street.P.some(p => p.id === r1.youId), 'the crew reserve never holds you');
  // you start every cup match, even with the lowest rating; injured → benched
  const you1 = g1.Run.you(r1);
  you1.power = you1.def = you1.speed = you1.jump = 25;
  const fx = g1.Cup.fixture(r1, 'cup');
  assert(fx.a.P.includes(you1), 'you start the cup match');
  fx.onLeave = null;
  g1.Eval.restore();
  r1.injury = { weeks: 2 };
  const fx2 = g1.Cup.fixture(r1, 'cup');
  assert(!fx2.a.P.includes(you1), 'injured: benched, injury beats Story');
  g1.Eval.restore();
  r1.injury = null;
  // champion → called up; not Story keeps today's behaviour
  r1.result = { place: 'Champion' };
  assert(g1.Cup.calledUp(r1), 'a Story champion is called up');
  r1.result = { place: 'Final' };
  assert(!g1.Cup.calledUp(r1), 'a finalist is not');
  const [g2, r2] = mk(74);
  r2.mode.story = false;
  g2.World.leaveAcademy(r2);
  g2.Cup.start(r2, g2.CUPS[0]);
  eq(r2.cup.me, -1, 'story off: not drawn → watch from the stands');
  // save round trip keeps the crew and the mode
  g1.Run.save(r1);
  const back = g1.Run.load();
  assert(
    back && back.mode.story === true && back.reserve.street && back.cup.entrants.some(x => x.crew),
    'the crew and mode survive a save'
  );
});
