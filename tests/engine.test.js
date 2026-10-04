// Engine, renderer contract and teams: golden hashes, rally invariants, elements, blocks, substitutions, coach.
const fs = require('fs'),
  path = require('path');
const { load, hash, test, assert, eq, goldenCheck } = require('./harness');

test('engine: seeded tournament teams + recorded matches are deterministic (golden)', () => {
  const g = load(42);
  const T = g.mkTeams();
  g.simBalance(T);
  const teams = JSON.stringify(T.map(t => t.P.map(p => [p.name, p.role, p.power, p.def, p.speed, p.jump, p.wit, p.lead, p.star, p.op])));
  let out = '';
  for (let i = 0; i < 16; i++) {
    const m = g.newMatch(T[i % 8], T[(i + 3) % 8], true);
    while (!m.over) out += JSON.stringify(g.playRally(m).beats);
    out += JSON.stringify([m.setScores, m.stat]);
  }
  goldenCheck('teams', hash(teams));
  goldenCheck('matches', hash(out));
});

test('engine: simulated matches (no animation) are deterministic (golden)', () => {
  const g = load(7);
  const T = g.mkTeams();
  const res = [];
  for (let i = 0; i < 40; i++) res.push(g.simMatch(T[i % 8], T[(i + 5) % 8]).setScores[0].join('-'));
  goldenCheck('sims', hash(res.join(',')));
});

test('engine: monster + league teams (golden)', () => {
  const g = load(9);
  const M = g.mkMonsterTeams(),
    L = g.mkLeagueTeams();
  assert(
    M.every(t => t.P.every(p => p.op)),
    'every monster player must be OP'
  );
  assert(
    L.every(t => t.P.every(p => !p.star)),
    'league teams start without stars'
  );
  goldenCheck('monster', hash(JSON.stringify(M.map(t => t.P.map(p => [p.power, p.def, p.speed, p.jump, p.wit])))));
});

test('engine: average teams — every player 30–60 OVR, no stars, a match plays out', () => {
  const g = load(11),
    T = g.mkAverageTeams(),
    all = T.flatMap(t => g.squadOf(t));
  assert(
    all.every(p => g.ovr(p) >= 29 && g.ovr(p) <= 61 && !p.star && !p.op),
    'OVR 30–60, no stars'
  );
  assert(new Set(all.map(p => g.ovr(p))).size > 5, 'a spread of levels');
  const m = g.newMatch(T[0], T[1], false);
  let n = 0;
  while (!m.over && n++ < 5000) g.playRally(m);
  assert(m.over, 'the match ends');
});

test('engine: egoist teams — all OP, negative wit that never lowers the body, ego acts everywhere (T-200)', () => {
  const g = load(13),
    T = g.mkEgoistTeams(),
    all = T.flatMap(t => g.squadOf(t));
  assert(
    all.every(p => p.op && p.ego === 'egoist' && p.wit < 0 && p.wit >= -1),
    'OP, egoist, wit in [−1, −0.2]'
  );
  const m = g.newMatch(T[0], T[1], true),
    p = T[0].P[2];
  g.CM = m;
  const raw = (p.power * g.boost(p)).toFixed(6);
  eq(g.effP(p).toFixed(6), raw, 'negative wit leaves power as wit 1 would');
  const ovr0 = g.ovr(p);
  p.wit = 1;
  eq(g.ovr(p), ovr0, 'OVR as wit 1');
  p.wit = -0.5;
  let n = 0,
    ego = 0;
  while (!m.over && n++ < 5000) for (const b of g.playRally(m).beats) ego += b.acts.filter(a => a.k === 'ego').length;
  assert(m.over, 'the match ends');
  assert(m.egoLog.length >= 8 && ego >= 3, `ego acts are frequent (${m.egoLog.length} logged, ${ego} ego beats)`);
});

test('engine: rally invariants over 300 matches', () => {
  const g = load(3);
  const T = g.mkTeams();
  for (let i = 0; i < 300; i++) {
    const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
    const [a, b] = m.setScores[0];
    assert(m.over && Math.max(a, b) >= g.RULES.pointsToWin && Math.abs(a - b) >= g.RULES.winBy, `bad final score ${a}-${b}`);
    for (const id in m.sta) assert(m.sta[id] >= 0.05 && m.sta[id] <= 1, 'stamina out of range');
    for (const id in m.mood) assert(m.mood[id] >= -1 && m.mood[id] <= 1, 'mood out of range');
  }
});

test('render: presentation never draws from the game RNG', () => {
  // playback runs playRally lazily inside step(): a frame-rate-dependent draw here would move the engine stream
  const root = path.join(__dirname, '..'),
    files = [
      ...fs.readdirSync(path.join(root, 'js/render')).map(f => 'js/render/' + f),
      ...fs.readdirSync(path.join(root, 'js/audio')).map(f => 'js/audio/' + f),
      'js/ui/match-screen.js',
      'js/ui/match-result.js'
    ],
    bad = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (/(^|[^.\w])(R\(\)|rnd\(|pick\()/.test(code) && !/FXR\.isolate/.test(code)) bad.push(`${f}:${i + 1}`);
    });
  }
  eq(bad.join(' '), '', 'use FXR (core/rng.js) for presentation randomness');
});

test('engine: every beat act kind is handled by the renderer', () => {
  const g = load(11);
  // one-shot acts: the keys of the ACTS tables (acts.js, a method each); tweened ones: startBeat's cases (playback.js)
  const acts = fs.readFileSync(path.join(__dirname, '..', 'js/render/acts.js'), 'utf8'),
    pb = fs.readFileSync(path.join(__dirname, '..', 'js/render/playback.js'), 'utf8');
  const known = new Set([
    ...[...acts.matchAll(/^ {2}([a-zA-Z]+)\(a, d, bs\) \{/gm)].map(m => m[1]),
    ...[...pb.matchAll(/case '([a-zA-Z]+)'/g)].map(m => m[1])
  ]);
  assert(known.has('burst') && known.has('slide'), 'both tables were read');
  const T = g.mkMonsterTeams(),
    seen = new Set();
  for (let i = 0; i < 6; i++) {
    const m = g.newMatch(T[0], T[1], true);
    while (!m.over) for (const b of g.playRally(m).beats) for (const a of b.acts) seen.add(a.k);
  }
  const missing = [...seen].filter(k => !known.has(k));
  assert(!missing.length, 'unhandled act kinds: ' + missing.join(', '));
});

test('render3d: every pose the engine sends has a 3D pose', () => {
  const g = load(12);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/render3d/poses3d.mjs'), 'utf8');
  const known = new Set([...src.matchAll(/pose === '([a-z]+)'/g)].map(m => m[1]));
  const T = g.mkMonsterTeams(),
    seen = new Set(['ready', 'huddle']); // match start and timeouts set these outside rally beats
  for (let i = 0; i < 6; i++) {
    const m = g.newMatch(T[0], T[1], true);
    while (!m.over) for (const b of g.playRally(m).beats) for (const a of b.acts) if (a.k === 'pose') seen.add(a.pose);
  }
  const missing = [...seen].filter(k => !known.has(k));
  assert(!missing.length, 'poses with no 3D version: ' + missing.join(', '));
});

test('engine: elements — rarity, every element fires, counters, captain buff', () => {
  const g = load(21);
  // rarity: regular players never; OP always; roughly 1 in 4 other stars
  let st = 0,
    stOn = 0;
  for (let i = 0; i < 12; i++)
    for (const t of g.mkTeams())
      for (const p of t.P) {
        assert(g.ELS.includes(p.el) && p.sig && g.TWIST[p.sig.tw] && p.sig.name, 'every player has an element and a signature');
        if (!p.star) assert(!p.elOn, 'regular players never unlock');
        else if (p.op) assert(p.elOn, 'OP players always unlock');
        else {
          st++;
          if (p.elOn) stOn++;
        }
      }
  assert(stOn / st > 0.12 && stOn / st < 0.4, `star unlock share ${(stOn / st).toFixed(2)}`);
  // assignment draws no random numbers (seeded runs stay reproducible) and is stable
  const q = g.mkTeams()[0].P[1],
    el0 = q.el;
  delete q.el;
  delete q.sig;
  g.elAssign(q);
  eq(q.el, el0, 'same player, same element');
  // every element charges and fires somewhere across Monster games; element spikes win most points
  const fired = {};
  let won = 0,
    n = 0;
  for (let i = 0; i < 70; i++) {
    const [a, b] = g.mkMonsterTeams(),
      m = g.simMatch(a, b);
    for (const L of m.elLog) {
      fired[L.el] = (fired[L.el] || 0) + 1;
      n++;
      if (L.won) won++;
      assert(L.won === true || L.won === false, 'element spike outcome recorded');
    }
  }
  for (const e of g.ELS) assert(fired[e] > 0, `${e} never fired`);
  assert(won / n > 0.55 && won / n < 0.85, `element spike win rate ${(won / n).toFixed(2)}`);
  // counters: a defender whose element beats the attacker's halves the effect; Blast has no counter
  const [A, B] = g.mkMonsterTeams(),
    m = g.newMatch(A, B, false),
    hit = A.P[3];
  hit.el = 'fire';
  for (const p of B.P) p.el = 'earth';
  eq(g.elSpike(m, hit, hit, A.P[0], B, false).pow, 1.15, 'full fire power');
  B.P[2].el = 'water';
  const r = g.elSpike(m, hit, hit, A.P[0], B, false);
  eq(r.res, B.P[2], 'water resists fire');
  assert(Math.abs(r.pow - 1.075) < 1e-9, 'resisted: half the effect');
  hit.el = 'blast';
  eq(g.elSpike(m, hit, hit, A.P[0], B, false).res, null, 'blast has no counter');
  // captain's buff fills the gauge: the next attack is guaranteed to be an element spike
  hit.el = 'fire';
  m.eg[hit.id] = 0;
  assert(g.elBuff(m, hit) && g.elReady(m, hit), 'buff fills the gauge');
  const reg = g.mkTeams()[0].P.find(p => !p.elOn);
  assert(!g.elBuff(m, reg) && !g.elReady(m, reg), 'no element, no gauge');
});

test.slow('engine: the setter takes the second ball', () => {
  const g = load(5);
  let sets = 0,
    ast = 0,
    astNon = 0,
    reach = 0;
  for (let i = 0; i < 400; i++) {
    const T = g.mkTeams(),
      m = g.newMatch(T[i % 8], T[(i + 3) % 8], false);
    while (!m.over) g.playRally(m);
    for (const e of m.setBy || []) {
      sets++;
      if (e.why === 'reach') {
        reach++;
        assert(e.role !== 'S' && e.ts > g.SETTER.beat * e.tm, `a teammate sets only when out-reaching the setter (${e.ts} vs ${e.tm})`);
      } else if (e.why === 'free') {
        assert(e.role === 'S' && (e.tm === null || e.ts <= g.SETTER.beat * e.tm), 'otherwise the free setter sets');
      } else assert(e.why === 'none', 'a non-setter sets with no setter free: the setter passed or is busy');
    }
    for (const side of m.t)
      for (const p of [...side.P, ...side.bench]) {
        const s = m.stat[p.id];
        if (!s) continue;
        ast += s.ast;
        if (p.role !== 'S') astNon += s.ast;
      }
  }
  assert(sets > 4000 && reach > 0, `sets were judged (${sets}, ${reach} won by reach)`);
  assert(astNon / ast < 0.11, `assists by non-setters ${((100 * astNon) / ast).toFixed(1)} % (was ~12.5 %)`);
});

test('engine: staged scenes are rare and well-formed', () => {
  const g = load(31);
  let scenes = 0,
    matches = 0;
  for (let i = 0; i < 30; i++) {
    const [a, b] = g.mkTeams(),
      ids = new Set([...g.squadOf(a), ...g.squadOf(b)].map(p => p.id)),
      m = g.newMatch(a, b, true);
    while (!m.over)
      for (const bt of g.playRally(m).beats) {
        if (!bt.scene) continue;
        assert(bt.scene === 1 || bt.scene === 2, 'scene level 1 or 2');
        for (const a2 of bt.acts)
          if ((a2.k === 'shot' && a2.kind) || a2.k === 'call') assert(ids.has(a2.p), 'scene act names a player on court');
        if (bt.scene === 1 && bt.acts.some(a2 => a2.k === 'shot' && a2.kind === 'face')) scenes++; // what Normal Hype shows
      }
    matches++;
  }
  const per = scenes / matches;
  assert(per >= 1 && per <= 8, `scenes per match ${per}`); // target ≈ 6–7 on average; 30 matches (10 were noisy: T-054 moved the random stream)
});

test('engine: recorded beats stay well-formed in every mode (no NaN, known players, matches end)', () => {
  for (let s = 0; s < 24; s++) {
    const g = load(9000 + s),
      T = g[['mkTeams', 'mkMonsterTeams', 'mkLeagueTeams'][s % 3]](),
      [a, b] = [T[0], T[1 + (s % (T.length - 1))]],
      ids = new Set([...g.squadOf(a), ...g.squadOf(b)].map(p => p.id)),
      m = g.newMatch(a, b, true);
    let guard = 0;
    while (!m.over && guard++ < 200)
      for (const bt of g.playRally(m).beats) {
        assert(bt.dur > 0 && Number.isFinite(bt.dur), 'beat duration');
        for (const x of bt.acts) {
          for (const f of ['p', 'p1', 'p2']) if (x[f] != null) assert(ids.has(x[f]), `${x.k} names an unknown player`);
          if (x.k === 'sub') assert(ids.has(x.out) && ids.has(x.in), 'sub names known players');
          for (const [k, v] of Object.entries(x)) if (typeof v === 'number') assert(Number.isFinite(v), `${x.k}.${k} is not finite`);
        }
      }
    assert(m.over, 'match ends');
  }
});

test.slow('engine: lane-read block — stuff rate and defence settings', () => {
  // Read vs Read over five team sets: stuffs (kill blocks) and hitter kills as a share of all attacks
  let n = 0,
    stuffs = 0,
    kills = 0;
  for (const seed of [20, 37, 54, 71, 88]) {
    const g = load(seed),
      T = g.mkTeams();
    for (let i = 0; i < 50; i++) {
      const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
      for (const a of m.att) {
        n += a.n;
        kills += a.k;
      }
      for (const id in m.stat) stuffs += m.stat[id].blk;
    }
  }
  const stuffRate = stuffs / n;
  // real-game rates (SKILL, owner 2026-10-04): a good side stuffs ~7–11 % of attacks (was 12–16 % before skill-scaled blocking)
  assert(stuffRate >= 0.07 && stuffRate <= 0.11, `stuff rate ${(100 * stuffRate).toFixed(1)} % is outside 7–11 %`);
  assert(kills / n >= 0.36 && kills / n <= 0.48, `hitter kill rate ${((100 * kills) / n).toFixed(1)} % drifted from ~42 %`);
  // a fixed attack style against each defence setting (attacker: side 0)
  const g = load(9),
    T = g.mkTeams(),
    run = (tac, dset) => {
      const t = { q: 0, qs: 0, pin: 0, pins: 0 };
      for (let i = 0; i < 400; i++) {
        const a = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8], { tac: [tac, 'auto'], dset: ['read', dset] }).att[0];
        t.q += a.q;
        t.qs += a.qs;
        t.pin += a.pin;
        t.pins += a.pins;
      }
      return { quickStuff: t.qs / t.q, pinStuff: t.pins / t.pin };
    };
  const mbRead = run('mb', 'read'),
    mbCommit = run('mb', 'commit'),
    wsRead = run('ws', 'read'),
    wsBunch = run('ws', 'bunch');
  assert(
    mbCommit.quickStuff > mbRead.quickStuff + 0.03,
    `Commit stuffs more quicks (${mbCommit.quickStuff.toFixed(3)} vs ${mbRead.quickStuff.toFixed(3)})`
  );
  assert(
    wsBunch.pinStuff < wsRead.pinStuff - 0.02,
    `Bunch leaves the pins open (${wsBunch.pinStuff.toFixed(3)} stuffed vs ${wsRead.pinStuff.toFixed(3)})`
  );
});

test('engine: defence settings — AI default, captain switch, scouting habits', () => {
  const g = load(9),
    T = g.mkTeams(),
    wall = T.find(t => t.S === g.STYLES.wall),
    tempo = T.find(t => t.S === g.STYLES.tempo);
  if (wall) eq(g.newMatch(wall, T[0]).dset[0], 'bunch', 'a wall team starts on Bunch');
  if (tempo) eq(g.newMatch(tempo, T[0]).dset[0], 'commit', 'a tempo team starts on Commit');
  eq(g.newMatch(T[0], T[1], false, { dset: ['bunch', null] }).dsetMode.join(), 'fixed,cap', 'a fixed setting is not the captain’s');
  // a leading captain answers a quick-heavy opponent with Commit (never when the setting is fixed)
  const cap = T.find(t => t.S !== g.STYLES.tempo && t !== T[7]) || T[1],
    foe = T[7];
  for (const p of cap.P) p.lead = 100;
  let sw = 0,
    fixedSw = 0;
  for (let i = 0; i < 50; i++) {
    const m = g.simMatch(foe, cap, { tac: ['mb', 'auto'] });
    sw += m.dsetLog.filter(x => x.side === 1 && x.to === 'commit').length;
    fixedSw += g.simMatch(foe, cap, { tac: ['mb', 'auto'], dset: ['read', 'read'] }).dsetLog.length;
  }
  assert(sw >= 1, 'the captain switches to Commit against an MB-focus attack');
  eq(fixedSw, 0, 'a fixed defence setting never changes');
});

test('teams: 4 on court + 2 bench, unique numbers, captain on court', () => {
  const g = load(77),
    sets = {
      tournament: g.mkTeams(),
      league: g.mkLeagueTeams(),
      monster: g.mkMonsterTeams(),
      pickup: [g.World.pickup(new Set())]
    };
  for (const [k, T] of Object.entries(sets))
    for (const t of T) {
      eq(t.P.length, 4, `${k}: 4 on court`);
      eq(t.bench.length, 2, `${k}: 2 on the bench`);
      const all = g.squadOf(t);
      eq(all.length, 6, `${k}: squadOf is 6`);
      eq(new Set(all.map(p => p.num)).size, 6, `${k}: shirt numbers unique across the squad`);
      assert(
        all.every(p => p.team === t),
        `${k}: everyone links to the team`
      );
      assert(t.P.includes(t.cap) && t.cap.cap && !t.bench.some(p => p.cap), `${k}: the captain plays`);
      assert(
        all.every(p => Number.isFinite(p.lead) && p.el != null),
        `${k}: leadership and element cover the bench`
      );
      eq(t.ovr, g.teamOvr(t), `${k}: rating is the 4 starters`);
    }
  // a save keeps the bench
  const run = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Bench', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  g.Run.save(run);
  const back = g.Run.load();
  for (const [i, t] of run.teams.entries()) {
    const b = back.teams[i];
    eq(b.bench.map(p => p.id).join(), t.bench.map(p => p.id).join(), 'bench ids round-trip');
    assert(
      b.bench.every(p => p.team === b),
      'bench players are re-linked'
    );
    eq(b.bench.map(p => p.num).join(), t.bench.map(p => p.num).join(), 'bench numbers round-trip');
  }
  eq(g.squadOf(back.pickup).length, 6, 'the Academy squad has 6');
});

test('engine: stat guard — invalid stats are repaired, valid ones untouched', () => {
  const g = load(5);
  const T = g.mkTeams();
  const p = T[0].P[2];
  const ok = T[1].P.map(q => JSON.stringify([q.power, q.def, q.speed, q.jump, q.wit]));
  Object.assign(p, { power: -40, def: NaN, speed: 300, wit: -5 });
  const j = p.jump;
  assert(g.fixStats(p) === 4, 'four values fixed');
  eq(JSON.stringify([p.power, p.def, p.speed, p.jump, p.wit]), JSON.stringify([1, 1, 99, j, g.WIT_MIN]));
  assert(
    T[1].P.every((q, i) => g.fixStats(q) === 0 && JSON.stringify([q.power, q.def, q.speed, q.jump, q.wit]) === ok[i]),
    'valid players untouched'
  );
  Object.assign(T[0].P[3], { power: 0, speed: Infinity, jump: undefined, wit: NaN });
  const m = g.newMatch(T[0], T[1], false);
  while (!m.over) g.playRally(m);
  assert(
    m.over && T[0].P.every(q => [q.power, q.def, q.speed, q.jump].every(v => v >= 1 && v <= 99) && q.wit >= g.WIT_MIN && q.wit <= 3),
    'the match ran on repaired stats'
  );
  const dmg = { name: 'x', sk: T[0].sk, bench: [], P: T[0].P.map(q => Object.assign({}, q, { team: undefined, speed: -5 })) };
  const logged = [];
  g.DBG.log = (...a) => logged.push(a[0]); // the headless context has no timers for the real log
  const t2 = g.teamFromJSON(dmg);
  assert(t2.P.every(q => q.speed === 1) && logged[0] === 'warn', 'teamFromJSON repairs a damaged save and logs a warning');
});

test.slow('engine: substitutions — rule, limit, restore', () => {
  const g = load(5),
    T = g.mkTeams(),
    snap = t =>
      JSON.stringify([t.P.map(p => p.id), t.bench.map(p => p.id), squadOfSlots(t), t.cap.id, t.s.id, t.mb.id, t.ws.map(p => p.id)]),
    squadOfSlots = t => g.squadOf(t).map(p => `${p.id}:${p.slot}:${p.cap ? 1 : 0}`);
  let subs = 0;
  for (let i = 0; i < 200; i++) {
    const a = T[i % 8],
      b = T[(i * 3 + 1) % 8],
      before = [snap(a), snap(b)],
      m = g.simMatch(a, b);
    subs += m.subs[0] + m.subs[1];
    assert(m.subs[0] <= g.SUB.max && m.subs[1] <= g.SUB.max, 'never more than SUB.max subs per side');
    eq(snap(a), before[0], 'the lineup is back after the match (side 0)');
    eq(snap(b), before[1], 'the lineup is back after the match (side 1)');
  }
  assert(subs > 20, `tired players get subbed (${subs} subs in 200 matches)`);
  // a mid-match sub: the incoming player takes the seat and slot; leaving mid-way restores everything
  const [a, b] = T,
    m = g.newMatch(a, b, true),
    out = a.P.find(p => p.role === 'WS'),
    inn = a.bench.find(p => p.role === 'WS');
  g.subIn(m, 0, out, inn);
  assert(
    a.P.includes(inn) && a.bench.includes(out) && inn.slot === m.lineup0[0].slots[out.id] && a.ws.includes(inn),
    'the sub takes the seat and slot'
  );
  g.restoreLineups(m);
  g.restoreLineups(m);
  eq(a.P.map(p => p.id).join(), m.lineup0[0].P.map(p => p.id).join(), 'restoreLineups (twice) puts the court back');
  assert(a.bench.includes(inn) && inn.slot === m.lineup0[0].slots[inn.id], 'and the bench and slots');
  // recorded matches: every sub act names known players and is followed by its label and the coach's line
  let acts = 0;
  for (let i = 0; i < 12; i++) {
    const x = T[i % 8],
      y = T[(i + 3) % 8],
      ids = new Set([...g.squadOf(x), ...g.squadOf(y)].map(p => p.id)),
      mm = g.newMatch(x, y, true);
    while (!mm.over)
      for (const bt of g.playRally(mm).beats) {
        const sb = bt.acts.find(q => q.k === 'sub');
        if (!sb) continue;
        acts++;
        assert(ids.has(sb.out) && ids.has(sb.in) && sb.out !== sb.in, 'sub names two known players');
        assert(
          bt.acts.some(q => q.k === 'plabel' && q.t === 'SUBBED' && q.p === sb.in) &&
            bt.acts.some(q => q.k === 'coachtalk' && /#\d+/.test(q.text)),
          'SUBBED label and a coach line with shirt numbers'
        );
      }
  }
  assert(acts > 0, 'recorded matches contain sub acts');
});

test.slow('engine: coach AI — errors, returns, coach IQ', () => {
  const g = load(6),
    T = g.mkTeams(),
    why = {};
  for (let i = 0; i < 200; i++) {
    const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
    for (const x of m.subLog) why[x.why] = (why[x.why] || 0) + 1;
  }
  assert(why.errors > 0, `error subs happen (${JSON.stringify(why)})`);
  assert(why.tired > 0, 'tired subs happen');
  assert(why.back > 0, 'a rested starter returns sometimes');
  // a sharper coach acts sooner: the first sub of side 0 comes at fewer points played (unsubbed matches count as their length)
  const first = iq => {
    let sum = 0,
      n = 0;
    for (const seed of [7, 8, 9, 10]) {
      const g2 = load(seed),
        T2 = g2.mkTeams();
      g2.SUB.worth = [0, 0]; // this is the roll's IQ effect only; the worth test (smarter coach subs) has its own test
      for (let i = 0; i < 150; i++) {
        const a = T2[i % 8];
        a.coachIQ = iq;
        const m = g2.simMatch(a, T2[(i * 3 + 1) % 8]),
          f = m.subLog.find(x => x.side === 0);
        sum += f ? f.pts : m.pts[0] + m.pts[1];
        n++;
      }
    }
    return sum / n;
  };
  const sharp = first(1),
    dull = first(0);
  assert(sharp < dull, `coachIQ 1 subs sooner than 0 (${sharp.toFixed(1)} vs ${dull.toFixed(1)} points)`);
});

test.slow('engine: smarter coach subs', () => {
  const g = load(6),
    T = g.mkTeams(),
    hit = g.RULES.stamina.hit,
    worth = g.SUB.worth;
  // a coachIQ 1 coach never makes a tired / erring sub that makes the team worse (bench ovr under worth[1] × the starter's current worth)
  const run = iq => {
    let subs = 0,
      bad = 0,
      n = 0;
    for (let i = 0; i < 300; i++) {
      const a = T[i % 8],
        b = T[(i * 3 + 1) % 8];
      a.coachIQ = iq;
      const m = g.simMatch(a, b);
      n++;
      for (const x of m.subLog.filter(x => x.side === 0)) {
        subs++;
        if (x.why === 'back') continue;
        const out = g.squadOf(a).find(p => p.id === x.out),
          inn = g.squadOf(a).find(p => p.id === x.inn);
        if (g.ovr(inn) < worth[iq] * g.ovr(out) * (1 - hit * (1 - x.sta)) - 1e-9) bad++;
      }
    }
    return { per: subs / n, bad };
  };
  const sharp = run(1),
    dull = run(0);
  eq(sharp.bad, 0, 'a coachIQ 1 coach never subs when it makes the side worse');
  assert(sharp.per < dull.per, `sharp coaches sub less (${sharp.per.toFixed(2)} vs ${dull.per.toFixed(2)} per match for side 0)`);
  // the coach trusts your player: the sub-out roll is × SUB.you (2000+ seeded rolls each)
  const g2 = load(9),
    T2 = g2.mkTeams(),
    m = g2.newMatch(T2[0], T2[1], false),
    star = T2[0].P[2],
    rate = isYou => {
      let n = 0;
      const N = 4000;
      for (let i = 0; i < N; i++) {
        star.you = isYou;
        for (const k of g2.STATK) star[k] = 30; // a weak, tired starter: the swap always pays
        T2[0].coachIQ = 0.7;
        m.sta[star.id] = 0.2;
        g2.coachSubs(m, 0);
        if (m.subs[0]) n++;
        g2.restoreLineups(m);
        m.subs = [0, 0];
        m.subbed = {};
        m.subLog.length = 0;
      }
      return n / N;
    };
  const base = rate(false),
    you = rate(true);
  assert(
    base > 0.5 && Math.abs(you - base * g2.SUB.you) <= 0.03,
    `your player is subbed out ${(you * 100).toFixed(1)} % vs ${(base * 100).toFixed(1)} % (× ${g2.SUB.you})`
  );
  // a noSub bench player never comes on (an injured you): not for tiredness, not on the way back
  star.you = false;
  for (const q of T2[0].bench) q.noSub = true;
  let came = 0;
  for (let i = 0; i < 300; i++) {
    m.sta[star.id] = 0.2;
    g2.coachSubs(m, 0);
    came += m.subs[0];
    m.subs = [0, 0];
    m.subbed = {};
    m.subLog.length = 0;
  }
  eq(came, 0, 'a noSub player is never subbed on');
  g2.restoreLineups(m);
  assert(
    T2[0].bench.every(q => !('noSub' in q)),
    'restoreLineups clears the engine-only flag'
  );
});

test.slow('engine: three touches — pop-up saves are the set', () => {
  const g = load(13),
    T = g.mkTeams();
  let n = 0,
    over = 0,
    log = [];
  for (let i = 0; i < 300; i++) {
    const m = g.simMatch(T[i % 8], T[(i * 3 + 1) % 8]);
    if (m.scr) {
      n += m.scr.n;
      over += m.scr.over;
      log = log.concat(m.scrLog);
    }
  }
  assert(n > 0, `pop-up saves happen (${n} in 300 sims)`);
  eq(log.length, n, 'every scramble possession is logged');
  assert(
    log.every(e => e.first !== e.saver && (e.hitter === null || (e.hitter !== e.first && e.hitter !== e.saver))),
    'nobody touches it twice in a row: the hitter is neither the first toucher nor the saver'
  );
  eq(log.filter(e => e.hitter === null).length, over, 'a bump over is the only scramble without a hitter');
});

test.slow('engine: ego — personality levels drive the acts, not wit; collisions; no draws without an opportunity', () => {
  const run = (lvl, n, seed = 91, mod) => {
    const g = load(seed),
      T = g.mkTeams();
    for (const t of T) for (const p of g.squadOf(t)) if (lvl) p.ego = lvl;
    if (mod) mod(g, T);
    const acts = {},
      okc = {},
      tot = { k: 0, att: 0, err: 0 },
      sig = [];
    let crashes = 0,
      stolen = 0;
    for (let i = 0; i < n; i++) {
      const a = T[i % 8],
        b = T[(i * 3 + 1) % 8],
        m = g.simMatch(a, b);
      sig.push(
        m.pts.join('-') +
          ':' +
          g
            .squadOf(a)
            .map(p => (m.stat[p.id] ? m.stat[p.id].k + '/' + m.stat[p.id].err : '0'))
            .join(',')
      );
      for (const t of [a, b])
        for (const p of g.squadOf(t)) {
          const s = m.stat[p.id];
          if (s) {
            tot.k += s.k;
            tot.att += s.att;
            tot.err += s.err;
          }
        }
      for (const e of m.egoLog) {
        acts[e.act] = (acts[e.act] || 0) + 1;
        if (e.ok) okc[e.act] = (okc[e.act] || 0) + 1;
        if (e.crash) {
          crashes++;
          assert(e.act === 'steal', 'collisions only happen on steals');
        }
        if (e.act === 'steal') stolen++;
      }
    }
    const per = Object.values(acts).reduce((x, y) => x + y, 0) / n / 2; // ego acts per side per set (one set per match)
    return { per, acts, okc, crashes, stolen, kill: tot.k / tot.att, err: tot.err / tot.att, sig: sig.join('|') };
  };
  const mixed = run(null, 400),
    selfish = run('selfish', 400),
    egoist = run('egoist', 400);
  assert(mixed.per > 0.5 && mixed.per < 4, `generated mix: ${mixed.per.toFixed(2)} ego acts per side per set`);
  assert(
    egoist.per > selfish.per * 1.5,
    `egoists act on ego more than selfish players (${egoist.per.toFixed(2)} / ${selfish.per.toFixed(2)})`
  );
  // errors per attack include serve errors and ball-handling faults (SKILL)
  assert(
    mixed.kill > 0.5 && mixed.kill < 0.72 && mixed.err < 0.4,
    `kill ${mixed.kill.toFixed(3)} / error ${mixed.err.toFixed(3)} stay sane`
  );
  // the personality sets the botching: egoists collide more per steal, selfish players' steals work more often
  assert(egoist.stolen > 50 && selfish.stolen > 20, `enough steals to compare (${egoist.stolen} / ${selfish.stolen})`);
  assert(selfish.crashes / selfish.stolen < egoist.crashes / egoist.stolen, 'selfish players collide less on steals than egoists');
  assert((selfish.okc.steal || 0) / selfish.stolen > (egoist.okc.steal || 0) / egoist.stolen, 'selfish steals succeed more often');
  // wit no longer matters: the same egoists at wit 0.6 and 1.9 take the same number of ego acts per opportunity (one seed, so equal draw for draw)
  const lo = run('egoist', 40, 93, (g, T) => T.forEach(t => g.squadOf(t).forEach(p => (p.wit = 0.6)))),
    hi = run('egoist', 40, 93, (g, T) => T.forEach(t => g.squadOf(t).forEach(p => (p.wit = 1.9))));
  assert(lo.per > 0 && Math.abs(lo.per - hi.per) / lo.per < 0.5, `wit leaves ego alone (${lo.per.toFixed(2)} / ${hi.per.toFixed(2)})`);
  // all normal plays exactly like the ego rules switched off: no draw is spent without an opportunity
  const zero = run('normal', 30, 92),
    off = run('normal', 30, 92, g => {
      for (const k in g.EGO.base) g.EGO.base[k] = 0;
    });
  eq(zero.sig, off.sig, 'all normal = ego acts switched off, draw for draw');
  eq(zero.per, 0, 'no ego acts from normal players');
  // old saves: a numeric ego reads as its level
  const g = load(5),
    q = { name: 'x', role: 'WS', ego: 0.7 };
  g.ensureEgo(q);
  eq(q.ego, 'egoist', 'ego 0.7 → egoist');
});

test('engine: a Delayed Spike is never stuffed, broken or tooled (a fingertip touch at most); it hangs too long more with low jump / wit', () => {
  const g = load(21);
  const T = g.mkTeams();
  for (const t of T) for (const p of g.squadOf(t)) (p.skills || (p.skills = [])).push('delay');
  const has = (b, f) => (b.acts || []).some(f),
    BAD = ['KILL BLOCK!', 'DENIED', 'Blocked!', 'BLOCK BREAK!', 'Off the block!'];
  const run = (lowJump, n) => {
    let delayed = 0,
      fail = 0,
      touch = 0;
    for (let i = 0; i < n; i++) {
      for (const t of T)
        for (const p of g.squadOf(t)) {
          p.jump = lowJump ? 60 : 95;
          p.wit = lowJump ? 1.0 : 1.5;
        }
      const m = g.newMatch(T[i % 8], T[(i + 3) % 8], true);
      while (!m.over) {
        const beats = g.playRally(m).beats;
        beats.forEach((b, j) => {
          if (!has(b, a => a.k === 'tech' && a.t === 'Delayed Spike')) return;
          delayed++;
          const after = beats.slice(j + 1, j + 4);
          if (after.some(q => has(q, a => a.k === 'plabel' && a.t === 'Hung too long!'))) return fail++;
          if (after.some(q => has(q, a => a.k === 'plabel' && a.t === 'Fingertips!'))) touch++;
          assert(!after.some(q => has(q, a => a.k === 'label' && BAD.includes(a.t))), 'a delayed spike was stopped at the block');
          assert(!after.some(q => has(q, a => a.k === 'ball' && a.to && a.to.c === 'block')), 'the ball went to the falling hands');
        });
      }
    }
    return { delayed, fail, touch };
  };
  const hi = run(false, 24),
    lo = run(true, 24);
  assert(hi.delayed > 30 && lo.delayed > 30, `enough delayed spikes (${hi.delayed}, ${lo.delayed})`);
  assert(hi.touch > 0, `fingertip touches happen (${hi.touch}/${hi.delayed})`);
  assert(
    lo.fail / lo.delayed > hi.fail / hi.delayed + 0.15,
    `low jump / wit hangs too long more (${lo.fail}/${lo.delayed} vs ${hi.fail}/${hi.delayed})`
  );
});

test('engine: block collision (T-069) — only after a solo block, no touch, net fault ends the rally', () => {
  const g = load(77),
    side = (m, id) => (g.squadOf(m.t[0]).some(p => p.id === id) ? 0 : 1);
  let solo = 0,
    col = 0,
    net = 0;
  for (let i = 0; i < 160; i++) {
    const T = g.mkTeams(),
      a = T[i % 8],
      b = T[(i * 3 + 1) % 8];
    for (const t of [a, b])
      for (const p of g.squadOf(t)) {
        p.wit = 0.6;
        p.ego = 'egoist';
      }
    const m = g.newMatch(a, b, true);
    let guard = 0;
    while (!m.over && guard++ < 200) {
      const n0 = m.egoLog.length,
        r = g.playRally(m),
        log = m.egoLog.slice(n0);
      solo += log.filter(e => e.act === 'solo').length;
      log.forEach((e, k) => {
        if (e.act !== 'collide') return;
        col++;
        assert(k > 0 && log[k - 1].act === 'solo' && log[k - 1].p === e.p, 'a collision follows a solo block by the same player');
        const labs = r.beats.map((bt, bi) => (bt.acts.some(x => x.k === 'plabel' && x.v) ? bi : -1)).filter(bi => bi >= 0),
          i0 = labs[log.slice(0, k).filter(q => q.act === 'collide').length];
        assert(i0 != null, 'a collision shows its label');
        const lab = r.beats[i0].acts.find(x => x.k === 'plabel' && x.v);
        eq(lab.v, e.net ? 'err' : 'warn', 'label style follows the variant');
        assert(lab.p === e.p && lab.p2 === e.mate, 'the label sits between the two blockers');
        // the beats of this attack: up to the next possession's set (the ball goes to a setter)
        let j = i0 + 1;
        // (or the next spike contact: a scramble / bump-set gives no set contact before the next attack)
        while (j < r.beats.length && !r.beats[j].acts.some(x => x.k === 'ball' && x.to && (x.to.c === 'set' || x.to.c === 'spike'))) j++;
        const acts = r.beats.slice(i0, j).flatMap(bt => bt.acts);
        assert(!acts.some(x => x.k === 'ball' && x.to && x.to.c === 'block'), 'no block touch on a collision');
        if (e.net) {
          net++;
          eq(r.w, 1 - side(m, e.p), 'a net fault is a point for the attackers');
          const f = r.beats.findIndex(bt => bt.acts.some(x => x.k === 'log' && /Net fault/.test(x.t)));
          assert(f > i0, 'the net fault follows the collision label');
          assert(
            !r.beats.slice(f).some(bt => bt.acts.some(x => x.k === 'ball' || x.k === 'impact')),
            'no ball contact after the net fault (the rally is over)'
          );
        }
      });
    }
  }
  assert(solo > 100 && col > 10, `enough solo blocks and collisions to judge (${solo} / ${col})`);
  assert(col / solo > 0.08 && col / solo < 0.3, `collisions ≈ 10–20 % of solo blocks (${((100 * col) / solo).toFixed(1)} %)`);
  assert(net / col > 0.15 && net / col < 0.5, `net faults ≈ 30 % of collisions (${((100 * net) / col).toFixed(1)} %)`);
  // collisions off: none happen
  const g2 = load(77);
  g2.EGO.solo.collide = 0;
  const [x, y] = g2.mkTeams();
  for (const p of [...g2.squadOf(x), ...g2.squadOf(y)]) ((p.wit = 0.6), (p.ego = 'egoist'));
  const m2 = g2.newMatch(x, y, false);
  while (!m2.over) g2.playRally(m2);
  assert(
    !m2.egoLog.some(e => e.act === 'collide') && m2.egoLog.some(e => e.act === 'solo'),
    'EGO.solo.collide 0: solo blocks, no collisions'
  );
});

// ---- Relationships on court (T-066, spec §4.23 E) ----
// m.rel = { tag: { 'idA|idB': band }, rival: Set }; every effect is gated on it (Monster / sims / goldens pass none).
const relAll = (g, T, band, rivals) => {
  const rel = { tag: {}, rival: new Set() };
  for (const t of T)
    for (const x of g.squadOf(t))
      for (const y of g.squadOf(t))
        if (x !== y) {
          if (band) rel.tag[`${x.id}|${y.id}`] = band;
          if (rivals) rel.rival.add(`${x.id}|${y.id}`);
        }
  return rel;
};
test('rel on court: no flags — and empty flags — leave every beat byte-identical', () => {
  const play = rel => {
    const g = load(42),
      T = g.mkTeams();
    let out = '';
    for (let i = 0; i < 3; i++) {
      const m = g.newMatch(T[i % 8], T[(i + 3) % 8], true, rel ? { rel } : {});
      while (!m.over) out += JSON.stringify(g.playRally(m).beats);
      out += JSON.stringify([m.setScores, m.stat]);
    }
    return out;
  };
  const base = play(null);
  eq(hash(play({ tag: {}, rival: new Set() })), hash(base), 'empty flags: the same beats');
  assert(base.length > 1000, 'something was played');
});
test.slow('rel on court: the clutch — a setter feeds allies more and freezes out enemies; trust / freeze lines', () => {
  const run = flagsOn => {
    const g = load(7),
      T = g.mkTeams(),
      ally = {},
      foe = {},
      who = {},
      rel = { tag: {}, rival: new Set() };
    for (const t of T) {
      const ws = g.squadOf(t).filter(p => p.role === 'WS');
      [ally[t.name], foe[t.name]] = ws;
      for (const p of g.squadOf(t)) who[p.id] = t.name;
      if (flagsOn)
        for (const x of g.squadOf(t)) {
          if (x !== ws[0]) rel.tag[`${x.id}|${ws[0].id}`] = 'ally';
          if (x !== ws[1]) rel.tag[`${x.id}|${ws[1].id}`] = 'enemy';
        }
    }
    const n = { all: 0, ally: 0, foe: 0, trust: 0, freeze: 0, bad: 0 };
    let lines = 0;
    for (let i = 0; i < 200; i++) {
      const a = T[i % 8],
        b = T[(i * 3 + 1) % 8],
        m = g.newMatch(a, b, i < 50, { rel }); // (enough visual matches that a trust / freeze line shows up)
      while (!m.over) {
        const r = g.playRally(m);
        for (const bt of r.beats || []) for (const x of bt.acts || []) if (x.k === 'log' && /trusts|freezes/.test(x.t)) lines++;
      }
      for (const e of m.relLog) {
        if (e.act === 'trust') (n.trust++, e.tag !== 'ally' && n.bad++);
        else if (e.act === 'freeze') (n.freeze++, !['resent', 'enemy'].includes(e.tag) && n.bad++);
        else {
          n.all++;
          if (e.mate === ally[who[e.p]].id) n.ally++;
          if (e.mate === foe[who[e.p]].id) n.foe++;
        }
      }
    }
    return { ...n, lines };
  };
  const off = run(false),
    on = run(true);
  assert(off.all > 500, `enough clutch sets to judge (${off.all})`);
  assert(off.trust === 0 && off.freeze === 0 && off.lines === 0, 'no flags: no trust / freeze');
  assert(
    on.ally / on.all > off.ally / off.all,
    `ally share of clutch sets up: ${(off.ally / off.all).toFixed(3)} → ${(on.ally / on.all).toFixed(3)}`
  );
  assert(on.foe / on.all < off.foe / off.all, `enemy share down: ${(off.foe / off.all).toFixed(3)} → ${(on.foe / on.all).toFixed(3)}`);
  eq(on.bad, 0, 'trust is said only of an ally, freeze only of a resent / enemy hitter (T-089)');
  assert(on.trust > 0 && on.freeze > 0 && on.lines > 0, `trust ${on.trust} / freeze ${on.freeze} noted, ${on.lines} log lines`);
  console.log(
    `  clutch sets ${off.all} → ally ${(off.ally / off.all).toFixed(3)} / ${(on.ally / on.all).toFixed(3)}, enemy ${(off.foe / off.all).toFixed(3)} / ${(on.foe / on.all).toFixed(3)}, trust ${on.trust}, freeze ${on.freeze}`
  );
});
test('rel on court: an ally covers better (pop-up save), the captain buffs allies first, ego halves toward allies and grows toward rivals', () => {
  // pop-up save: the same draws, +REL_E.cover on the chance for an ally of the first touch — never fewer saves
  const pops = band => {
    const g = load(9),
      [a, b] = g.mkTeams(),
      rel = relAll(g, [a, b], band);
    g.RNG.seed(5);
    const m = g.newMatch(a, b, false, { rel }),
      out = [];
    for (let i = 0; i < 400; i++) out.push(g.popRecovery(m, 0, a, a.P[0], 400, 0.5, 90, 1).ok);
    return out;
  };
  const p0 = pops(null),
    p1 = pops('ally');
  assert(
    p0.every((ok, i) => !ok || p1[i]),
    'an ally never saves less'
  );
  assert(
    p1.filter(Boolean).length > p0.filter(Boolean).length + 20,
    `more saves: ${p0.filter(Boolean).length} → ${p1.filter(Boolean).length}`
  );
  // captain's buff: an ally of the captain (here the second-best mate) is picked over the hottest hitter
  const buffs = ally => {
    const g = load(10),
      [a, b] = g.mkTeams(),
      cap = a.P[0];
    cap.lead = 99;
    const mates = a.P.filter(p => p !== cap).sort((x, y) => g.confidence(y, null, 0) - g.confidence(x, null, 0)),
      rel = { tag: ally ? { [`${cap.id}|${mates[1].id}`]: 'ally' } : {}, rival: new Set() };
    a.cap = cap;
    g.RNG.seed(3);
    const m = g.newMatch(a, b, false, { rel });
    let hit = 0,
      tot = 0;
    for (let i = 0; i < 600; i++) {
      m.buff = {};
      g.captainThink(m, 0);
      for (const id in m.buff) {
        tot++;
        if (id === String(mates[1].id) || id === mates[1].id) hit++;
      }
    }
    return [hit, tot];
  };
  const [h0, t0] = buffs(false),
    [h1, t1] = buffs(true);
  assert(t0 > 20 && t1 > 20, `the captain buffs (${t0} / ${t1})`);
  assert(h1 / t1 > h0 / t0, `allies first: ${(h0 / t0).toFixed(2)} → ${(h1 / t1).toFixed(2)}`);
  // ego steals: toward allies ×0.5, toward rivals ×1.5
  const steals = (band, rivals) => {
    const g = load(11),
      T = g.mkTeams(),
      rel = relAll(g, T, band, rivals);
    for (const t of T) for (const p of g.squadOf(t)) ((p.wit = 0.1), (p.ego = 'egoist'));
    let n = 0;
    for (let i = 0; i < 80; i++) {
      const m = g.newMatch(T[i % 8], T[(i * 3 + 1) % 8], false, { rel });
      while (!m.over) g.playRally(m);
      n += m.egoLog.filter(e => e.act === 'steal').length;
    }
    return n;
  };
  const s0 = steals(null, false),
    sa = steals('ally', false),
    sr = steals(null, true);
  assert(s0 > 100, `enough steals to judge (${s0})`);
  assert(sa < s0 * 0.75, `allies steal less: ${s0} → ${sa}`);
  assert(sr > s0 * 1.2, `rivals steal more: ${s0} → ${sr}`);
});

test('rel on court: Cup.fixture builds the flags for both squads and passes them; rivals across the net come in fired up / rattled', () => {
  const g = load(151),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Flags', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  run.week = 4;
  run.eval = null;
  run.event = null;
  g.People.ensure(run);
  const mate = g.Run.mates(run).find(p => p.role !== 'S');
  run.people[mate.id].traits = ['steady', 'reckless'];
  g.Rel.add(run, mate.id, 'spot_given', 80);
  const fx = g.Cup.fixture(run, 'eval');
  assert(fx.rel && fx.rel.tag && typeof fx.rel.rival.has === 'function', 'the fixture carries the flags');
  eq(fx.rel.tag[`${you.id}|${mate.id}`], 'ally', 'you → them: their stance');
  eq(fx.rel.tag[`${mate.id}|${you.id}`], 'ally', 'them → you: the same');
  const ids = new Set([...g.squadOf(fx.a), ...g.squadOf(fx.b)].map(p => p.id));
  assert(
    Object.keys(fx.rel.tag).every(k => k.split('|').every(id => ids.has(id))),
    'only players of the two squads'
  );
  const m = g.newMatch(fx.a, fx.b, false);
  fx.setup(m);
  assert(m.rel === fx.rel, 'setup hands them to the match');
  // a rival across the net: your role, close in OVR, resent → fired up (proud / reckless) or rattled (anyone else)
  const form = traits => {
    const g2 = load(152);
    const run2 = g2.Run.create(g2.Run.draft(), {
        role: 'WS',
        name: 'Riv',
        alloc: { power: 20, def: 10, speed: 10, jump: 20 },
        witSteps: 0
      }),
      y2 = g2.Run.you(run2);
    run2.week = 4;
    g2.People.ensure(run2);
    const opp = g2.Eval.squad(
        run2,
        g2.People.all(run2)
          .filter(p => p.team !== g2.Run.myTeam(run2))
          .slice(0, 8)
          .map(p => p.id),
        'Opp',
        '#fff'
      ),
      f2 = g2.squadOf(opp).find(p => p.role === y2.role && p !== y2);
    for (const k of g2.STATK) f2[k] = y2[k];
    run2.people[f2.id].traits = traits;
    g2.Rel.add(run2, f2.id, 'spot_taken');
    eq(g2.Rel.rivals(run2, opp)[0], f2, 'a rival across the net');
    g2.Cup.prepare(run2, opp, 'eval', g2.Run.myTeam(run2));
    return [f2.form, run2.log[0].t];
  };
  const [hot, hotLog] = form(['proud', 'steady']),
    [cold, coldLog] = form(['steady', 'warm']);
  assert(hot >= 0.1 && hot <= 0.5 && /fired up/i.test(hotLog), `proud: fired up (${hot}: ${hotLog})`);
  assert(cold >= -0.4 && cold <= 0 && /rattled/.test(coldLog), `steady: rattled (${cold}: ${coldLog})`);
});

test('engine: technique switches — a held-back technique never fires; techUse counts uses, wins and faults (T-178)', () => {
  const count = off => {
    const g = load(31),
      [a, b] = g.mkMonsterTeams();
    for (const p of [...g.squadOf(a), ...g.squadOf(b)]) {
      p.power = Math.max(p.power, 95); // everyone can jump-serve the Killer
      if (off) p.techOff = ['killer'];
    }
    const m = g.simMatch(a, b);
    let n = 0,
      won = 0,
      err = 0;
    for (const u of Object.values(m.techUse)) if (u.killer) ((n += u.killer.n), (won += u.killer.won), (err += u.killer.err));
    assert(won <= n && err <= n, 'won and faults never exceed uses');
    return { n, m, g };
  };
  const on = count(false),
    off = count(true);
  assert(on.n > 0, `Killer Jump Serve fired with it on (${on.n})`);
  eq(off.n, 0, 'never with it held back');
  // the switch flips mid-match from the next rally
  const g = on.g,
    [a, b] = g.mkMonsterTeams(),
    m = g.newMatch(a, b, false),
    p = a.P[0];
  p.wit = 2;
  p.power = 90; // owns Drive Serve
  g.playRally(m); // the match is running (CM = m)
  eq(g.hasTech(p, 'drive'), true, 'on by default');
  g.setTechOff(m, p.id, 'drive', true);
  eq(g.hasTech(p, 'drive'), false, 'held back while the match runs');
  g.setTechOff(m, p.id, 'drive', false);
  eq(g.hasTech(p, 'drive'), true, 'back on');
});
