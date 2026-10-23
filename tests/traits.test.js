// Sparks and Scars (spec §4.30, T-291): the seeded rolls, hidden Scars named when they act, every trait's effect.
const { load, test, assert, eq } = require('./harness');

const mkRun = seed => {
  const g = load(seed);
  return [g, g.Run.create(g.Run.draft(), { role: 'WS', name: 'Cov', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 })];
};
/** A started match (one rally played: CM is this match) between two seeded teams; p = a player of side 0 given `traits`. */
const mkMatch = (seed, traits) => {
  const g = load(seed),
    T = g.mkTeams(),
    p = T[0].P[1];
  if (traits) p.traits = traits;
  const m = g.newMatch(T[0], T[1], false);
  g.playRally(m);
  return { g, m, p, T };
};

test('traits: Fired up ×100 seeds → ~35 % Sparks; never a repeat, at most 3 (spec §4.30)', () => {
  const [g, run] = mkRun(291);
  let got = 0;
  for (let s = 0; s < 100; s++) {
    run.pseed = s;
    run.sparks = [];
    run.feel.nf = 0;
    if (g.Feel.spark(run)) got++;
  }
  assert(got >= 22 && got <= 48, `Sparks in 100 Fired ups: ${got} (want ~35)`);
  run.sparks = [];
  for (let i = 0; i < 80; i++) g.Feel.spark(run);
  eq(run.sparks.length, g.TRAIT_ODDS.max, 'at most 3 Sparks');
  eq(new Set(run.sparks).size, run.sparks.length, 'no repeats');
  assert(
    run.sparks.every(id => g.SPARKS[id]),
    'Sparks come from the Drive pool'
  );
  eq(g.Run.you(run).traits.join(), run.sparks.join(), 'your player carries them into matches');
  assert(
    run.log.some(l => l.t === g.FEEL_LINES.traits[run.sparks[0]]),
    'a Spark is named in the diary at once'
  );
});

test('traits: Pain at 100 ×1000 seeds → 12 ± 3 % OP; more with a Lighthouse sharpen and with Scars before; ≤ 3, no repeats', () => {
  const [g, run] = mkRun(292);
  const you = g.Run.you(run),
    keep = JSON.stringify([you.body, you.wit]);
  const share = (sharp, before) => {
    let op = 0;
    for (let s = 0; s < 1000; s++) {
      run.pseed = s * 104729 + 7;
      run.secret.sharp = sharp;
      run.scars = before.map(id => ({ id, y: 1, w: 1, seen: true }));
      const id = g.Feel.scar(run);
      if (g.SCARS[id].op) op++;
    }
    [you.body, you.wit] = JSON.parse(keep); // (Enlightenment raised the body: put it back)
    return op / 1000;
  };
  const base = share(0, []),
    sharp = share(2, []),
    later = share(0, ['glassAnkle', 'insomnia']);
  assert(base >= 0.09 && base <= 0.15, `OP share with no sharpen: ${base}`);
  assert(sharp > base + 0.1, `two sharpens raise it (${base} → ${sharp})`);
  assert(later > base + 0.04, `two Scars before raise it (${base} → ${later})`);
  run.scars = [];
  for (let i = 0; i < 40; i++) g.Feel.add(run, 'pain', g.FEEL.max);
  eq(run.scars.length, g.TRAIT_ODDS.max, 'at most 3 Scars');
  eq(new Set(run.scars.map(s => s.id)).size, 3, 'no repeats');
  assert(
    run.scars.every(s => s.seen === false),
    'every Scar starts hidden'
  );
  run.scars = [{ k: 'pending', y: 1, w: 3 }];
  g.Feel.sync(run);
  assert(g.SCARS[run.scars[0].id], "an old save's pending Scar is rolled");
});

test('traits: a hidden Scar is named on the first match it acts; a career-side one at the match after it acted', () => {
  const [g, run] = mkRun(293);
  const you = g.Run.you(run),
    T = g.Run.myTeam(run);
  run.scars = [
    { id: 'tunnel', y: 1, w: 1, seen: false },
    { id: 'insomnia', y: 1, w: 1, seen: false }
  ];
  g.Feel.sync(run);
  assert(you.traits.includes('tunnel') && you.traits.includes('insomnia'), 'Scars onto your player');
  const play = () => {
    const m = g.newMatch(T, run.teams[0], false);
    g.Feel.match(run, m);
    while (!m.over) g.playRally(m);
    g.Feel.result(run, m, m.played.has(you.id), 'B');
    return m;
  };
  const m = play();
  assert(m.played.has(you.id), 'you played');
  assert(run.scars[0].seen, 'Tunnel Vision acted (Wit in the match) → named');
  assert(
    run.log.some(l => l.t === g.FEEL_LINES.traits.tunnel),
    'a diary line names it'
  );
  assert(!run.scars[1].seen, 'Insomnia has not acted yet → still hidden');
  run.sta = 10;
  g.Training.rest(run);
  play();
  assert(run.scars[1].seen, 'Insomnia acted at a rest → named after the next match');
});

test('traits: Enlightenment applies at once (body +6 past the caps, Wit +0.3) but is named after the next match', () => {
  const [g, run] = mkRun(294);
  const you = g.Run.you(run),
    b0 = { ...you.body },
    w0 = you.wit,
    pw0 = you.power;
  for (let s = 0; s < 500 && !g.Feel.scarsOf(run).some(x => x.id === 'enlight'); s++) {
    run.pseed = s;
    run.scars = [];
    g.Feel.scar(run);
    if (run.scars[0].id !== 'enlight') {
      Object.assign(you.body, b0);
      you.wit = w0;
    }
  }
  const s = run.scars[0];
  eq(s.id, 'enlight', 'Enlightenment drawn');
  for (const k of g.BODY.keys) eq(you.body[k], b0[k] + 6, `${k} +6`);
  eq(+(you.wit - w0).toFixed(2), 0.3, 'Wit +0.3');
  assert(you.power > pw0, 'the court skills follow the body');
  assert(!s.seen, 'still hidden');
  const m = g.newMatch(g.Run.myTeam(run), run.teams[0], false);
  while (!m.over) g.playRally(m);
  g.Feel.result(run, m, true, 'B');
  assert(s.seen, 'named after the next match');
});

test('traits: each match trait changes its number; a player without traits is untouched (spec §4.30)', () => {
  // Clutch: attack and defence +6 % late in the set; Air Impact +3 % power; Spite +8 % against Haewon's squad
  let { g, m, p } = mkMatch(5, ['clutch']);
  m.pts = [3, 3];
  const sb = k => g.stageBuff(p, k);
  const early = sb('atk');
  m.pts = [12, 9];
  assert(Math.abs(sb('atk') / early - 1.06) < 1e-9, 'Clutch +6 % attack late');
  m.stage = ['composed', 'composed'];
  const d0 = (() => {
    m.pts = [3, 3];
    return sb('def');
  })();
  m.pts = [14, 3];
  assert(Math.abs(sb('def') / d0 - 1.06) < 1e-9, 'Clutch defence +6 % at set point');
  assert(m.trAct[p.id].clutch, 'Clutch marked as acted');
  ({ g, m, p } = mkMatch(5, ['airImpact']));
  const q = m.t[0].P[2];
  assert(Math.abs(g.stageBuff(p, 'atk') / g.stageBuff(q, 'atk') - 1.03) < 1e-9, 'Air Impact +3 % power');
  ({ g, m, p } = mkMatch(5, ['spite']));
  const a0 = g.stageBuff(p, 'serve');
  m.vsRival = true;
  assert(Math.abs(g.stageBuff(p, 'serve') / a0 - 1.08) < 1e-9, 'Spite +8 % against her squad');
  // God of War: two kills running → +8 % until your error
  ({ g, m, p } = mkMatch(5, ['godOfWar']));
  const g0 = g.stageBuff(p, 'atk');
  m.errBy = null;
  m.lastK = p.id;
  g.trPoint(m);
  eq(g.stageBuff(p, 'atk'), g0, 'one kill: not yet');
  g.trPoint(m);
  assert(Math.abs(g.stageBuff(p, 'atk') / g0 - 1.08) < 1e-9, 'two kills running: +8 %');
  m.lastK = null;
  g.trPoint(m);
  assert(Math.abs(g.stageBuff(p, 'atk') / g0 - 1.08) < 1e-9, 'kept through a point without a kill');
  m.errBy = p.id;
  g.trPoint(m);
  eq(g.stageBuff(p, 'atk'), g0, 'your error ends it');
  // Dead Calm: a Loose side plays you as Composed
  ({ g, m, p } = mkMatch(5, ['deadCalm']));
  m.stage = ['loose', 'composed'];
  const mate = m.t[0].P[2];
  assert(g.stageBuff(mate, 'def') < 1 && g.stageBuff(p, 'def') / g.cardBuff(p, 'def') > 1, 'Loose mates −5, you Composed +5');
  // Tunnel Vision: Wit −0.1 in the match
  ({ g, m, p } = mkMatch(5, ['tunnel']));
  const w1 = g.W(p);
  delete p.traits;
  assert(Math.abs(g.W(p) - w1 - 0.1) < 1e-9, 'Tunnel Vision −0.1 Wit');
  // Shaky Hands: serve errors +6 % late
  ({ g, m, p } = mkMatch(5, ['shakyHands']));
  m.pts = [3, 3];
  const e0 = g.Formula.serveErrorP(p, p.team, 60);
  m.pts = [12, 11];
  const e1 = g.Formula.serveErrorP(p, p.team, 60);
  delete p.traits;
  assert(Math.abs(e1 - g.Formula.serveErrorP(p, p.team, 60) - 0.06) < 1e-9 && Math.abs(e0 - e1) > 0.05, 'Shaky Hands +0.06 late');
  // Second Wind: HP heals +0.1 more
  ({ g, m, p } = mkMatch(5, ['secondWind']));
  if (!m.t[0].P.includes(p)) ((m.t[0].P[1].traits = p.traits), delete p.traits, (p = m.t[0].P[1])); // (on court: a first-rally sub can take them off)
  const q2 = m.t[0].P.find(q => q !== p && !(q.traits || []).length);
  m.hp[p.id] = m.hp[q2.id] = 0.4;
  m.down = {};
  g.hpHeal(m);
  assert(Math.abs(m.hp[p.id] - m.hp[q2.id] - 0.1) < 1e-9, 'Second Wind +0.1 HP between rallies');
  // Iron Will: morale never below −0.3; Eye of the Storm: no morale loss
  ({ g, m, p } = mkMatch(5, ['ironWill']));
  g.morAdd(m, 0, -0.8);
  eq(m.mor[p.id], -0.3, 'Iron Will holds −0.3');
  assert(m.mor[m.t[0].P[2].id] < -0.5, 'the others fall');
  ({ g, m, p } = mkMatch(5, ['eyeStorm']));
  const was = m.mor[p.id];
  g.morAdd(m, 0, -0.5);
  eq(m.mor[p.id], was, 'Eye of the Storm: no loss');
  g.morAdd(m, 0, 0.2);
  assert(m.mor[p.id] > was, 'gains still count');
  // Captain's Voice: your kill lifts every teammate +0.05 (vs the same point scored by someone else)
  const voice = who => {
    const r = mkMatch(5, ['voice']),
      mm = r.m,
      k = who === 'you' ? r.p : mm.t[0].P[2];
    for (const t of mm.t) for (const x of r.g.squadOf(t)) mm.mor[x.id] = 0;
    mm.lastK = k.id;
    mm.errBy = null;
    mm.ctx0 = null;
    r.g.morPoint(
      mm,
      0,
      () => 0.5,
      () => 0
    );
    return mm.mor[mm.t[0].P[3].id];
  };
  assert(Math.abs(voice('you') - voice('mate') - 0.05) < 0.02, "Captain's Voice +0.05 to teammates");
});

test('traits: Haunted starts lower and Spite flags the match against her squad; Glass Ankle, Insomnia, Bitter (career side)', () => {
  const [g, run] = mkRun(295);
  const you = g.Run.you(run),
    riv = g.Stars.get(run, 'rival');
  run.scars = [
    { id: 'haunted', y: 1, w: 1, seen: false },
    { id: 'spite', y: 1, w: 1, seen: false }
  ];
  g.Feel.sync(run);
  const m = g.newMatch(g.Run.myTeam(run), riv.team, false),
    mo0 = m.mor[you.id] || 0;
  g.Feel.match(run, m);
  eq(+(m.mor[you.id] - mo0).toFixed(6), -0.2, 'Haunted: morale −0.2 at the start');
  assert(m.vsRival, 'Spite: the match is flagged');
  const m2 = g.newMatch(
    g.Run.myTeam(run),
    run.teams.find(t => t !== riv.team && t !== g.Run.myTeam(run)),
    false
  );
  const mo2 = m2.mor[you.id];
  g.Feel.match(run, m2);
  assert(!m2.vsRival && m2.mor[you.id] === mo2, 'another side: neither');
  // the career-side ones, each against the same run without it
  const pair = (id, fn) => {
    const [ga, ra] = mkRun(296),
      [gb, rb] = mkRun(296);
    rb.scars = [{ id, y: 1, w: 1, seen: false }];
    gb.Feel.sync(rb);
    return [fn(ga, ra), fn(gb, rb), rb];
  };
  const [r0, r1] = pair('glassAnkle', (gg, r) => gg.Fight.injuryRisk(r, 80, 5));
  assert(r0 > 0 && Math.abs(r1 / r0 - 1.5) < 1e-9, 'Glass Ankle: injury chance × 1.5');
  const [s0, s1] = pair('insomnia', (gg, r) => {
    r.sta = 10;
    gg.Training.rest(r);
    return r.sta - 10;
  });
  assert(s1 < s0 && Math.abs(s1 / s0 - 0.8) < 0.05, `Insomnia: rest −20 % (${s0} → ${s1})`);
  const [b0, b1] = pair('bitter', (gg, r) => {
    const mate = gg.Run.mates(r)[0];
    return gg.Rel.add(r, mate.id, 'trained');
  });
  assert(b0 > 0 && b1 < b0, `Bitter: bonds grow slower (${b0} → ${b1})`);
});

test('traits: a match where nobody carries traits never touches the trait state', () => {
  const g = load(7),
    T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false);
  while (!m.over) g.playRally(m);
  assert(!m.trAct && !m.gow && !m.vsRival, 'no trait state');
  assert(
    T.every(t => g.squadOf(t).every(p => !p.traits)),
    'no NPC carries traits'
  );
});
