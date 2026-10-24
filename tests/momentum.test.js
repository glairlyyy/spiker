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

test('bars: fire is the on-court average morale (captain ×2); without traits every player moves alike (spec §2.31)', () => {
  const g = load(31),
    T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: false }); // (a spent card moves only the players on court)
  m.noTraits = true;
  for (let i = 0; i < 20 && !m.over; i++) {
    g.playRally(m);
    for (const s of [0, 1]) {
      const v = g.squadOf(m.t[s]).map(p => m.mor[p.id]);
      assert(Math.max(...v) - Math.min(...v) < 1e-9, 'no traits: one morale for the squad');
      assert(Math.abs(m.mom[s] - v[0]) < 1e-9, `fire ${m.mom[s]} = morale ${v[0]}`);
    }
  }
  const m2 = g.newMatch(T[2], T[3], false);
  for (let i = 0; i < 10 && !m2.over; i++) g.playRally(m2); // (not to the end: the lineups go back when it is over)
  const P = m2.t[0].P,
    cap = m2.t[0].cap,
    avg = P.reduce((a, p) => a + m2.mor[p.id] * (p === cap ? 2 : 1), 0) / (P.length + (P.includes(cap) ? 1 : 0));
  assert(Math.abs(m2.mom[0] - avg) < 1e-9, 'fire = weighted average');
  const tr = g
    .squadOf(T[0])
    .concat(...T.slice(1).map(g.squadOf))
    .map(g.mtraitOf);
  assert(tr.some(Boolean) && tr.some(t => !t), 'some players have a trait, some none');
  eq(
    JSON.stringify(tr),
    JSON.stringify(
      g
        .squadOf(T[0])
        .concat(...T.slice(1).map(g.squadOf))
        .map(g.mtraitOf)
    ),
    'stable (a hash)'
  );
});

test('bars: HP — hard balls wear a passer down across rallies and empty HP collapses them, no roll (spec §2.31)', () => {
  const g = load(34),
    T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false);
  const p = m.t[1].P.find(q => q.role !== 'S'),
    nx = g.RNG.next;
  let fell = false,
    draws = 0;
  g.RNG.next = () => (draws++, nx());
  for (let i = 0; i < 6 && !fell; i++) {
    fell = g.knock(m, p, 120, 0, 2);
    if (!fell) g.hpHeal(m);
  }
  assert(fell, `collapsed (hp ${m.hp[p.id]})`);
  eq(m.hp[p.id], 0, 'HP empty');
  assert(m.down[p.id] === 2, 'on the floor through the next defence');
  g.RNG.next = nx;
  eq(draws, 0, 'no draws');
  const q = m.t[1].P.find(x => x !== p && x.role !== 'S');
  assert(!g.knock(m, q, 20, 0, 2) && g.hpOf(m, q) > 0.85, `a soft ball takes little (hp ${g.hpOf(m, q)})`);
});

test('bars: a Shaken side heals less between rallies (spec §4.34, T-314)', () => {
  const g = load(74);
  g.RNG.seed(4);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { weak: [2, 0] }),
    a = m.t[0].P[0],
    b = m.t[1].P[0];
  m.hp[a.id] = m.hp[b.id] = 0.2;
  g.hpHeal(m);
  assert(Math.abs(m.hp[b.id] - 0.2 - g.HP.heal) < 1e-9, 'Steady: the full heal');
  assert(Math.abs(m.hp[a.id] - 0.2 - (g.HP.heal - g.WAR_STAGES[2].heal)) < 1e-9, 'Shaken: 0.25 less');
});

test('bars: a war stage plays weaker — stageBuff × (1 − cut %) for its side only; no stage × 1 (spec §4.34, T-360)', () => {
  const g = load(77);
  g.RNG.seed(4);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { weak: [3, 0] }),
    a = m.t[0].P[0],
    b = m.t[1].P[0],
    W = m.weak;
  g.playRally(m); // (CM = m)
  for (const k of ['atk', 'def', 'spd', 'jump', 'serve']) {
    delete m.weak;
    const a0 = g.stageBuff(a, k),
      b0 = g.stageBuff(b, k);
    m.weak = W;
    assert(Math.abs(g.stageBuff(a, k) - a0 * (1 - g.WAR_STAGES[3].cut / 100)) < 1e-9, `Broken ${k}: −${g.WAR_STAGES[3].cut} %`);
    eq(g.stageBuff(b, k), b0, `Steady ${k}: unchanged`);
  }
  assert(
    g.WAR_STAGES.every((S, i) => !i || S.cut > (g.WAR_STAGES[i - 1].cut || 0)),
    'each stage cuts deeper'
  );
});

test.slow(
  'bars: Steady vs each war stage, the same squads and seeds both ways — Strained ~55 %, Shaken ~60 %, Broken ~65 % (spec §4.34, T-360)',
  () => {
    const g = load(75);
    g.RNG.seed(11);
    const T = g.mkTeams(),
      pct = [];
    for (const st of [1, 2, 3]) {
      let steady = 0,
        n = 0;
      for (let i = 0; i < 200; i++) {
        const a = T[i % 8],
          b = T[(i + 1 + ((i >> 3) % 7)) % 8]; // (never the same team)
        for (const w of [
          [st, 0],
          [0, st]
        ]) {
          g.RNG.seed(1000 + i); // paired seeds: the same match both ways, only the stage's side swapped
          const m = g.simMatch(a, b, { weak: w });
          if (m.winner === (w[0] ? 1 : 0)) steady++;
          n++;
        }
      }
      pct.push(Math.round((100 * steady) / n));
    }
    console.log(`   Steady wins vs Strained ${pct[0]} % · Shaken ${pct[1]} % · Broken ${pct[2]} % (400 matches each)`);
    // (T-360, 2000 matches each: 54.5 / 60.3 / 65.4 % ± 2.1; 400 read ± 4.9)
    assert(pct[0] >= 50 && pct[1] >= 54 && pct[2] >= 59, `the stages bite: ${pct.join(' / ')} %`);
    assert(pct[2] > pct[0], 'Broken bites harder than Strained');
  }
);

test('bars: Endurance lowers rally HP damage — end 90 takes less than end 30 on the same balls; no body × 1 (spec §4.33, T-311)', () => {
  const g = load(76);
  g.RNG.seed(6);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false),
    p = m.t[0].P[1],
    hit = body => {
      if (body) p.body = body;
      else delete p.body;
      m.hp[p.id] = 1;
      for (const pow of [20, 25, 30]) g.hpHit(m, p, pow); // (soft balls: no collapse, the damage adds up unclamped)
      return 1 - m.hp[p.id];
    },
    none = hit(null),
    lo = hit({ end: 30 }),
    hi = hit({ end: 90 });
  assert(hi < lo, `end 90 takes less (${hi.toFixed(3)} vs ${lo.toFixed(3)})`);
  assert(Math.abs(hit({ end: 50 }) - none) < 1e-9, 'end 50 = × 1 = no body');
  assert(none < 1 && Math.abs(hi / none - (1.2 - 0.36)) < 1e-6, 'end 90: × 0.84');
  delete p.body;
});
