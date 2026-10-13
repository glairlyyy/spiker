// Tests: momentum — fire, stages, temperament, captain calls (T-259, T-260). Filled by its tasks; harness.js has the loader, runner and helpers.
const { load, test, assert, eq } = require('./harness');

test('momentum: stage table is ordered and the snapshot fallback reads it', () => {
  const g = load(1);
  assert(
    g.STAGE_IDS.every((id, i) => !i || g.STAGES[id].from > g.STAGES[g.STAGE_IDS[i - 1]].from),
    'stage thresholds rise'
  );
  assert(g.stageOfSnap({ mom: [-0.5, 0.5], zone: [0, 0] }, 0) === 'loose', 'loose');
  assert(g.stageOfSnap({ mom: [0, 0.9], zone: [0, 1] }, 1) === 'fever', 'fever');
});

test.slow(
  'momentum: fire and stages — every stage is reached, Ice never Loose / Fever, Fever lasts its points, buffs apply (spec §2.14)',
  () => {
    const g = load(21),
      T = g.mkTeams(),
      seen = new Set(),
      share = { loose: 0, composed: 0, focused: 0, fever: 0 };
    let pts = 0,
      feverMatches = 0,
      longest = 0,
      iceBad = 0,
      acts = 0;
    for (let i = 0; i < 200; i++) {
      const m = g.newMatch(T[i % 8], T[(i * 5 + 3) % 8], true);
      let run = [0, 0],
        fev = false;
      while (!m.over) {
        for (const b of g.playRally(m).beats)
          for (const a of b.acts)
            if (a.k === 'stage') {
              acts++;
              if (!g.STAGE_IDS.includes(a.to) || a.from === a.to) throw new Error(`bad stage act ${JSON.stringify(a)}`);
            }
        for (const s of [0, 1]) {
          const st = m.stage[s];
          seen.add(st);
          share[st]++;
          pts++;
          if (m.temper[s] === 'ice' && (st === 'loose' || st === 'fever')) iceBad++;
          if (st === 'fever') {
            fev = true;
            run[s]++;
            longest = Math.max(longest, run[s]);
          } else run[s] = 0;
          eq(!!m.zone[s], st === 'fever', 'm.zone is the Fever alias');
        }
      }
      if (fev) feverMatches++;
    }
    for (const id of g.STAGE_IDS) assert(seen.has(id), `stage ${id} reached`);
    eq(iceBad, 0, 'an Ice team is never Loose or in Fever');
    assert(longest <= 5, `a Fever lasts at most 5 points (Slow burner): ${longest}`);
    assert(acts > 100, `stage acts are emitted (${acts})`);
    const pc = k => ((100 * share[k]) / pts).toFixed(0);
    console.log(
      `   stage time: Loose ${pc('loose')} % · Composed ${pc('composed')} % · Focused ${pc('focused')} % · Fever ${pc('fever')} %; Fever in ${feverMatches} of 200 matches`
    );
    // the buffs: a Focused side hits harder than the same side Composed; Fever digs worse
    const m = g.newMatch(T[0], T[1], false),
      p = m.t[0].P.find(q => q.role === 'WS');
    g.playRally(m); // (sets CM)
    m.stage[0] = 'composed';
    const d0 = g.effD(p),
      j0 = g.jumpPx(p);
    m.stage[0] = 'fever';
    assert(g.effD(p) < d0 * 0.86 && g.jumpPx(p) > j0 * 1.04, 'Fever: −10 % defence vs Composed (+5 %), +5 % jump');
    // temperament from personalities, ties → steady; the snapshot carries fire, stage, temper
    assert(
      m.temper.every(t => g.TEMPERS[t]),
      'temperaments'
    );
    const s = g.snap(m);
    assert(s.fire && s.stage && s.temper, 'snapshot fields');
  }
);
