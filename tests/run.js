#!/usr/bin/env node
// Run: node tests/run.js            (all tests)
//      node tests/run.js --update   (re-record the engine golden hashes after an intended gameplay change)
const fs = require('fs'),
  path = require('path');
const { load, hash, test, assert, eq, results } = require('./harness');
const GOLDEN = path.join(__dirname, 'golden.json');
const update = process.argv.includes('--update');
const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {};
const record = {};
const goldenCheck = (key, value) => {
  record[key] = value;
  if (!update) {
    assert(golden[key], `no golden value for ${key} — run with --update`);
    eq(value, golden[key], `${key} changed (gameplay or animation output differs; run --update if intended)`);
  }
};

// ---------- engine ----------
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
test('engine: every beat act kind is handled by the renderer', () => {
  const g = load(11);
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/render/playback.js'), 'utf8');
  const known = new Set(
    [...src.matchAll(/case '([a-zA-Z]+)'/g)]
      .map(m => m[1])
      .concat(['slide', 'hold', 'pose', 'jump', 'ball', 'reset', 'rot', 'score', 'point'])
  );
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

// ---------- data ----------
test('data: events, skills, unlocks and calendar are well-formed', () => {
  const g = load(1);
  const fxKeys = new Set([
    'power',
    'def',
    'speed',
    'jump',
    'wit',
    'lead',
    'sta',
    'mood',
    'sp',
    'fans',
    'main',
    'bondMate',
    'bondCap',
    'bondAll',
    'chance'
  ]);
  const ids = new Set();
  const checkFx = (fx, where) => {
    for (const f of fx) {
      assert(fxKeys.has(f[0]), `${where}: unknown effect ${f[0]}`);
      if (f[0] === 'chance') checkFx(f[2], where);
    }
  };
  for (const e of g.EVENTS) {
    assert(!ids.has(e.id), 'duplicate event ' + e.id);
    ids.add(e.id);
    assert(!e.need || g.EVENT_NEED[e.need], `${e.id}: unknown need ${e.need}`);
    checkFx(e.a[1], e.id);
    checkFx(e.b[1], e.id);
  }
  for (const [id, s] of Object.entries(g.SKILLS)) {
    assert(s.name && s.desc && s.cost > 0, 'skill fields missing: ' + id);
    assert(s.tech ? s.req && g.SKILL_HOW[id] : s.key && s.val, 'skill shape wrong: ' + id);
  }
  for (const w of Object.keys(g.CALENDAR)) assert(+w >= 1 && +w <= g.CAREER.weeks, 'calendar week out of range ' + w);
});

test('career: map model — renderer-free data for the island map', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Map', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  const M = g.MapModel.build(run, 'pt:500,200');
  eq(M.w, g.CITY.w, 'map units');
  eq(M.land.regions.map(r => r.id).join(), 'wu,shu,wei', 'the three majors');
  assert(
    M.land.regions.every(r => /^#/.test(r.color) && r.poly.length > 3),
    'regions carry colour and outline'
  );
  assert(
    M.pins.every(p => p.id && p.at && p.at.length === 2 && p.title && p.flags),
    'pins are plain data'
  );
  assert(M.pins.some(p => p.id === 'home') && !M.pins.some(p => p.id === 'weiSpeed'), 'only what you know of is on the map');
  eq(M.flag.join(), '500,200', 'a picked point');
  eq(g.MapModel.ptId([499.6, 200.2]), 'pt:500,200', 'point ids round');
  eq(M.you.at.join(), g.CITY.airport.join(), 'you start at the airport');
  assert(JSON.parse(JSON.stringify(M)).pins.length === M.pins.length, 'serialisable (no DOM, no functions)');
});

test('career: faction dynamics — border pressure seizes places, weakens, comes back', () => {
  const g = load(9),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Front', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  const p0 = g.City.price(run, 'weiPower'),
    ti = g.FACTIONS.findIndex(f => f.region === 'wei' && f.join.ovr),
    ovr0 = g.World.joinReq(run, ti).ovr;
  eq(g.Front.meter(run, 'wu', 'wei'), 0, 'borders start calm');
  for (let i = 0; i < g.FRONT.seize - 1; i++) eq(g.Front.result(run, 'wu', 'wei'), '', 'pressure builds');
  eq(g.Front.meter(run, 'wu', 'wei'), g.FRONT.seize - 1, 'meter from the winner');
  eq(g.Front.meter(run, 'wei', 'wu'), 1 - g.FRONT.seize, 'and from the loser');
  assert(g.Front.result(run, 'wu', 'wei').includes('seized'), 'a place falls');
  const id = g.FRONT.borders['wei-wu'].wei[0];
  eq(g.City.region(run, id), 'wu', 'the place is Wu now');
  eq(g.Front.meter(run, 'wu', 'wei'), 0, 'the meter resets');
  for (let i = 0; i < g.FRONT.seize; i++) g.Front.result(run, 'wu', 'wei');
  assert(g.Front.weak(run, 'wei'), 'two places lost: Wei weakened');
  assert(g.City.price(run, 'weiPower') > p0, 'weakened: dearer');
  assert(g.World.joinReq(run, ti).ovr < ovr0, 'weakened: easier to join');
  for (let i = 0; i < g.FRONT.seize; i++) g.Front.result(run, 'wu', 'wei');
  eq(g.Front.lost(run, 'wei'), 2, 'only the border places can fall');
  let line = '';
  for (let i = 0; i < g.FRONT.seize; i++) line = g.Front.result(run, 'wei', 'wu');
  assert(line.includes('retook') && g.Front.lost(run, 'wei') === 1, 'lost places come back first');
  // aggression: over many weeks Wu starts most battles
  const n = { wei: 0, wu: 0, shu: 0 };
  run.lastLoser = null;
  for (let i = 0; i < 600; i++) n[g.Front.pick(run).att]++;
  assert(n.wu > n.wei && n.wei > n.shu, `Wu is the most aggressive (${JSON.stringify(n)})`);
});

// ---------- career ----------
function playRun(g, role = 'WS') {
  const d = g.Run.draft();
  const run = g.Run.create(d, { role, name: 'Test', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  let guard = 0;
  while (!run.result && guard++ < 400) {
    if (run.event) {
      const pre = run.event.pre; // sponsor offers come before the week's choice
      g.Run.log(run, g.Events.choose(run, 0));
      if (!pre) g.Run.endWeek(run);
      continue;
    }
    if (g.World.isFree(run)) for (const t of run.teams) if (g.World.join(run, t.i)) break; // sign as soon as a club allows
    const wt = g.Run.weekType(run);
    if (wt === 'eval') {
      if (run.eval.kind === 'faction' && !run.eval.mine) {
        g.Eval.bench(run); // not drawn: watch from the bench
        g.Run.endWeek(run);
        continue;
      }
      const region = run.eval.region,
        fx = g.Cup.fixture(run, 'eval'),
        m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      fx.onFinish(m);
      assert(
        g.Pool.players(run, region).every(p => p.team.i !== -2),
        'nobody stays lent after an evaluation'
      );
      continue;
    }
    if (wt === 'cup') {
      run.focus = g.FOCUS[role][0][0];
      run.talk = 'fire';
      const fx = g.Cup.fixture(run, 'cup');
      const m = g.newMatch(fx.a, fx.b, false);
      if (fx.setup) fx.setup(m);
      while (!m.over) g.playRally(m);
      fx.onFinish(m);
      continue;
    }
    const c = run.sta < 45 ? 'rest' : run.mood < 2 ? 'rec' : g.KEYSTAT[role];
    g.Run.log(run, c === 'rest' ? g.Training.rest(run) : c === 'rec' ? g.Training.recreation(run) : g.Training.train(run, c, run.sta > 85));
    if (!g.Events.roll(run)) g.Run.endWeek(run);
  }
  return run;
}
test('career: a full run reaches a result with sane values', () => {
  for (const role of ['WS', 'MB', 'S']) {
    const g = load(100 + role.length),
      run = playRun(g, role),
      you = g.Run.you(run);
    assert(run.result && ['S', 'A', 'B', 'C'].includes(run.result.rank), 'run must end with a rank');
    eq(run.cups.map(c => c.id).join(','), 'u21', 'the U21 Final Cup ends every run (placing NO_CUP when your squad was not drawn)');
    eq(run.week, g.CAREER.weeks + 1, 'the season runs all 28 weeks');
    assert(run.hist.length >= 20, 'weekly history for the growth chart');
    for (const k of g.STATK) assert(you[k] <= g.Training.gate(run, k), `${k} past its limit-break gate`);
    for (const k of g.STATK) assert(you[k] >= 25 && you[k] <= 99, `${k} out of range: ${you[k]}`);
    assert(you.wit >= 0.1 && you.wit <= 2, 'wit out of range');
    assert(run.sta >= 0 && run.sta <= run.staMax, 'stamina out of range');
    for (const v of Object.values(you.bond)) assert(v >= 0 && v <= 100, 'bond out of range');
  }
});
test('career: save → load round-trip keeps the run intact', () => {
  const g = load(5),
    d = g.Run.draft(),
    run = g.Run.create(d, { role: 'MB', name: 'Saver', alloc: { power: 10, def: 20, speed: 10, jump: 20 }, witSteps: 0 });
  for (let i = 0; i < 5; i++) {
    g.Training.train(run, 'jump');
    run.event = null;
    g.Run.endWeek(run);
  }
  g.Run.save(run);
  const back = g.Run.load();
  assert(back, 'load returned null');
  eq(back.week, run.week, 'week');
  eq(g.Run.you(back).jump, g.Run.you(run).jump, 'jump stat');
  eq(g.Run.you(back).team, g.Run.myTeam(back), 'player re-linked to team');
  eq(JSON.stringify(back.teams.map(g.teamToJSON)), JSON.stringify(run.teams.map(g.teamToJSON)), 'teams');
});
test('career: Limit Break gates, facility Lv 5 and Hard training', () => {
  const g = load(10),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Gate', alloc: { power: 30, def: 10, speed: 10, jump: 10 }, witSteps: 0 }),
    you = g.Run.you(run);
  you.power = 79;
  run.sta = 100;
  g.Training.train(run, 'power');
  eq(you.power, 80, 'power stops at the 80 gate');
  eq(run.event && run.event.id, 'limit', 'the trial is offered at the gate');
  run.lb.power = 1;
  eq(g.Training.gate(run, 'power'), 90, 'first Limit Break opens the way to 90');
  run.uses.power = 26;
  eq(g.Training.facility(run, 'power'), 4, 'Lv 5 after 26 sessions');
  run.event = null;
  const n = g.Training.preview(run, 'power', false).main[2],
    h = g.Training.preview(run, 'power', true);
  assert(h.main[2] > n && h.sta === 2 * g.Training.preview(run, 'power', false).sta, 'Hard: more gain, double stamina');
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
test('career: element hidden → revealed → Element Trial → unlocked, and saved', () => {
  const g = load(22),
    run = g.Run.create(g.Run.draft(), {
      role: 'WS',
      name: 'Spark',
      alloc: { power: 20, def: 10, speed: 10, jump: 20 },
      witSteps: 0
    }),
    you = g.Run.you(run);
  assert(you.el && !you.elOn && !you.elSeen, 'your element starts hidden and locked');
  for (const k of g.STATK) you[k] = 80;
  g.Growth.checkYou(run, you);
  assert(you.elSeen && you.star, 'revealed at OVR 70 (and a star at this level)');
  const fake = { zoneHit: [0, 0] };
  eq(g.ElTrial.match(run, fake, 'S'), '', 'no zone, no proof');
  fake.zoneHit[0] = 1;
  eq(g.ElTrial.match(run, fake, 'A'), '', 'grade S needed');
  assert(g.ElTrial.match(run, fake, 'S') && run.elProof, 'S grade in the zone proves it');
  run.event = null;
  g.ElTrial.offer(run);
  eq(run.event && run.event.id, 'element', 'trial offered');
  assert(g.Events.def(run.event, run).title.includes('awakening'), 'trial card');
  // fail → back in 3 weeks; pass → unlocked for good
  let tries = 0;
  while (!you.elOn && tries++ < 40) {
    run.event = null;
    run.elNext = 0;
    run.sta = run.staMax;
    g.ElTrial.offer(run);
    const w = run.week;
    g.Events.choose(run, 0);
    if (!you.elOn) eq(run.elNext, w + g.ElTrial.retry, 'failed trial returns later');
  }
  assert(you.elOn, 'trial eventually passes');
  g.Run.save(run);
  const back = g.Run.load(),
    y2 = g.Run.you(back);
  assert(y2.elOn && y2.el === you.el && y2.sig.name === you.sig.name, 'element survives save/load');
});

test('engine: staged scenes are rare and well-formed', () => {
  const g = load(31);
  let scenes = 0,
    matches = 0;
  for (let i = 0; i < 10; i++) {
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
  assert(per >= 1 && per <= 8, `scenes per match ${per}`); // target ≈ 6–7 on average; 10 matches are noisy
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

test('career: free agent start, club join conditions, paydays, transfers, spectated cup', () => {
  const g = load(41),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Walk-on', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  assert(g.World.isFree(run) && g.Run.myTeam(run) === run.pickup && run.pickup.P.length === 4, 'starts on a pickup squad');
  eq(run.staMax, g.CAREER.staMax, 'base stamina cap');
  assert(run.pickup.name === 'Academy squad', 'the pickup squad is the Academy squad');
  assert(g.World.leaveAcademy(run) && g.Run.mates(run).length === 0, 'leaving the squad leaves you alone');
  assert(!g.World.leaveAcademy(run), 'a second leave does nothing');
  g.Run.save(run);
  assert(g.Run.load().academy === false, 'academy: false is saved');
  assert(!('legacy' in run) && !('pure' in run) && !('legend' in run), 'no meta-progression fields on a new run');
  eq(run.money, g.ECON.start, 'starting money');
  // a club with a fee you can't pay is locked; an open club signs you and you take a same-role slot
  const pricey = g.FACTIONS.findIndex(f => f.join.fee > run.money),
    open = g.FACTIONS.findIndex(f => !Object.keys(f.join).length);
  assert(!g.World.canJoin(run, pricey).ok && !g.World.join(run, pricey), 'fee club locked');
  assert(g.World.join(run, open), 'open club signs you');
  eq(run.team, open, 'on the club');
  assert(run.teams[open].P.includes(you) && run.teams[open].P.length === 4 && run.pickup.P.length === 4, 'rosters stay 4');
  assert(!g.World.canJoin(run, open).ok, "can't sign twice");
  // payday: allowance − food − rent; an empty wallet means eviction
  g.World.setHousing(run, 'condo');
  run.money = 0;
  run.week = 4;
  g.World.payday(run);
  eq(run.housing, 'homeless', 'evicted when broke');
  assert(run.gazette && run.gazette.items.length, 'gazette published');
  for (const t of run.teams) assert(t.P.length === 4 && t.P.every(p => p.team === t), 'transfers keep rosters linked');
  // a free agent who leaves the Academy and never signs watches the cup and the run still ends
  const h = load(42),
    r2 = h.Run.create(h.Run.draft(), { role: 'MB', name: 'Loner', alloc: { power: 10, def: 20, speed: 10, jump: 20 }, witSteps: 0 });
  assert(h.World.leaveAcademy(r2), 'leaves the Academy squad');
  let guard = 0;
  while (!r2.result && guard++ < 200) {
    if (r2.event) {
      const pre = r2.event.pre;
      h.Events.choose(r2, 1);
      if (!pre) h.Run.endWeek(r2);
      continue;
    }
    const wt = h.Run.weekType(r2);
    if (wt === 'eval') {
      const region = r2.eval.region,
        fx = h.Cup.fixture(r2, 'eval'),
        m = h.newMatch(fx.a, fx.b, false);
      while (!m.over) h.playRally(m);
      fx.onFinish(m);
      assert(
        h.Pool.players(r2, region).every(p => p.team.i !== -2),
        'nobody stays lent after an evaluation'
      );
    } else {
      h.Training.rest(r2);
      h.Run.endWeek(r2);
    }
  }
  assert(r2.result, 'run ends');
  eq(r2.cups.map(c => c.place).join(','), h.NO_CUP, 'cup watched');
});

test('career: island map — regions, prices, quality, far trips, outings, scouting, 7-day weeks, saved', () => {
  const g = load(77),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Mapper', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  eq(run.teams.map(t => t.name).join(','), g.FACTIONS.map(f => f.team[0]).join(','), 'league teams play as faction squads');
  for (const id of Object.keys(g.SPOTS)) {
    const s = g.SPOTS[id];
    assert(s.train ? g.TRAININGS[s.train] : ['rest', 'rec', 'ramen', 'arcade', 'street'].includes(s.act), `${id} does something`);
    assert(s.region === null || g.REGIONS[s.region], `${id} region`);
  }
  for (const k of g.TRAINK) assert(g.City.spotsFor(k).length >= 2, `several places for ${k} training`);
  // prices follow the regions; Wei may be overhyped, Shu may be a gem, others as advertised
  eq(g.City.price(run, 'weiPower'), g.TRAIN_FEE * 2, 'Wei costs double');
  eq(g.City.price(run, 'stone'), g.TRAIN_FEE / 2, 'Shu costs half');
  for (const id of Object.keys(run.spotQ)) {
    const Q = run.spotQ[id],
      r = g.SPOTS[id].region;
    if (r === 'wei') assert(!Q.known && (Q.q === 1.25 || (Q.q === 1 && Q.tag === 'overhyped')), `${id} premium or overhyped`);
    else if (r === 'shu') assert(!Q.known && (Q.q === 0.8 || (Q.q === 1.25 && Q.tag === 'gem')), `${id} rough or gem`);
    else assert(Q.known, `${id} known`);
  }
  eq(g.City.days(run), g.WEEK_DAYS, 'a week starts with 7 days');
  // travel by distance: close by is free, far is up to 3 days
  run.housing = 'studio';
  eq(g.City.trip(run, g.City.at(run, 'sand')), 0, 'the sand courts are by the airport');
  eq(g.City.trip(run, g.City.at(run, 'harbor')), g.TRIP_MAX, 'the far east coast: the longest trip');
  eq(g.City.trip(run, [2000, 2000]), g.TRIP_MAX, 'never more than 3 days');
  const m0 = run.money,
    sp0 = run.sp;
  assert(g.City.day(run, 'sand', false), 'train on the sand');
  eq(run.money, m0 - g.City.price(run, 'sand'), 'the session is paid');
  assert(run.sp > sp0, 'sand builds technique (skill points)');
  eq(g.City.days(run), 6, 'a local session takes a day');
  run.event = null;
  const mate = g.Run.mates(run)[0].id,
    b0 = g.Run.you(run).bond[mate] || 0,
    cb = g.City.cost(run, 'bonfire');
  assert(g.City.day(run, 'bonfire'), 'night out at the bonfire');
  assert((g.Run.you(run).bond[mate] || 0) > b0, 'the night out raises bond');
  eq(g.City.days(run), 6 - cb, 'the trip + the night');
  run.money = 500;
  run.days = 7;
  const ct = g.City.cost(run, 'trail');
  assert(ct >= 3, 'the highlands are far');
  assert(g.City.day(run, 'trail', false) && g.City.loc(run) === 'shu' && g.City.days(run) === 7 - ct, 'went up and trained');
  assert(run.spotQ.trail.known, 'training there shows what the place is really like');
  const ch = g.City.cost(run, 'home');
  run.days = ch - 1;
  assert(!g.City.can(run, 'home').ok && g.City.can(run, 'home').why.includes(`only ${ch - 1} left`), 'nothing may spill into next week');
  run.days = g.City.cost(run, 'hotelShu');
  const m1 = run.money;
  assert(g.City.day(run, 'hotelShu', false), 'rest at the lodge');
  eq(run.money, m1 - g.City.price(run, 'hotelShu'), 'the lodge costs a night');
  assert(g.City.night(run), 'the last day: night falls');
  assert(!g.City.can(run, 'stone').ok && g.City.day(run, 'stone', false) === '', 'no days left');
  const w0 = run.week;
  g.Run.endWeek(run);
  eq(run.week, w0 + 1, 'the player ends the week');
  eq(g.City.days(run), g.WEEK_DAYS, 'a new week, 7 days');
  run.event = null;
  // the dark map: only where you've been is explored; you can walk anywhere on land
  assert(g.City.seen(run, g.City.at(run, 'trail')) && !g.City.seen(run, g.City.at(run, 'weiSpeed')), 'dark where you have not been');
  assert(!g.City.travelTo(run, [5, 5]), 'only on land');
  const td = g.City.travelDays(run, [700, 300]);
  assert(g.City.travelTo(run, [700, 300]) && g.City.days(run) === 7 - td && g.City.loc(run) === 'wei', 'walked into the city');
  assert(g.City.seen(run, [720, 320]), 'the fog lifts around you');
  eq(g.City.regionAt([500, 320]), 'open', 'Central Academy belongs to nobody');
  eq(g.City.regionAt([815, 470]), 'outlaws', 'the overpass is the Outlaws');
  g.Run.endWeek(run);
  // home turf: your faction's region
  run.event = null;
  const open = g.FACTIONS.findIndex(f => !Object.keys(f.join).length);
  assert(g.World.join(run, open), 'sign');
  for (const id of Object.keys(g.SPOTS))
    if (g.SPOTS[id].train) eq(g.City.turf(run, id), g.SPOTS[id].region === g.FACTIONS[open].region ? g.TURF_BONUS : 0, `turf at ${id}`);
  // street hustle keeps values sane
  for (let i = 0; i < 20; i++) {
    run.event = null;
    run.days = 7;
    run.money = i % 3 ? 100 : 5;
    assert(g.City.day(run, 'street'), 'street');
    assert(run.money >= 0 && run.sta >= 0, 'street keeps money and stamina ≥ 0');
  }
  // a street battle: fight for one side — the other side always holds it against you
  run.days = 7;
  run.pos = [470, 600];
  run.clash = { site: 0, seen: false, done: false };
  const c = g.CLASH.sites[0],
    r0 = g.City.rep(run, c.b),
    cc = g.City.clashCost(run);
  assert(g.City.clash(run, c.a) && run.clash.done && !g.City.clashSite(run), 'fought');
  eq(g.City.rep(run, c.b), r0 + g.CLASH.other, 'the other side remembers');
  assert([g.CLASH.win, g.CLASH.lose].includes(g.City.rep(run, c.a)), 'standing with your side moves');
  eq(g.City.days(run), 7 - cc, 'the trip + a day');
  g.Run.endWeek(run);
  assert(!run.clash || !run.clash.done, 'the battle is gone at the week end');
  run.days = 7;
  const ti = g.FACTIONS.findIndex((f, i) => i !== open && f.region === 'wu');
  run.pos = g.CITY.hq[ti].slice();
  assert(g.City.scout(run, ti) && g.City.scouted(run, ti), 'scouted');
  eq(g.City.days(run), 6, 'scouting at the HQ takes a day');
  g.Run.save(run);
  const back = g.Run.load();
  assert(
    back &&
      back.days === 6 &&
      back.pos.join() === run.pos.join() &&
      g.City.scouted(back, ti) &&
      back.spotQ.trail.known &&
      back.loc === 'wu',
    'days, scouting, places and location saved'
  );
});

test('career: facility access — grudge, owner condition, members and neutral ground', () => {
  const g = load(78),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Gate', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.days = 7;
  run.money = 500;
  const can = id => g.City.can(run, id);
  assert(can('weiPower').ok, 'a Wei place is open at standing 0');
  run.rep.wei = -19;
  assert(can('weiPower').ok, 'standing −19 is still fine');
  run.rep.wei = -20;
  assert(!can('weiPower').ok && can('weiPower').why.includes("won't let you in"), 'a grudge shuts the door');
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei'),
    team0 = run.team;
  run.team = wei;
  assert(can('weiPower').ok, "the owner's members always get in");
  run.team = team0;
  g.ACCESS.cond.wei = { fans: 1e9 };
  run.rep.wei = 0;
  assert(!can('weiPower').ok && can('weiPower').why.includes('asks for'), "the owner's condition can shut the door");
  g.ACCESS.cond.wei = {};
  for (const r of Object.keys(g.REGIONS)) run.rep[r] = -100;
  assert(can('home').ok && can('park').ok, 'home and Central Academy are never gated');
});

test('career: faction pools — sizes, reserves, no overlap, saved', () => {
  const spec = { role: 'WS', name: 'Pool', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 };
  const g = load(91),
    run = g.Run.create(g.Run.draft(), spec);
  for (const r of Object.keys(g.POOL)) assert(g.Pool.size(run, r) === g.POOL[r], `pool ${r} has ${g.POOL[r]} players`);
  const ids = new Set();
  let n = 0;
  const all = [...run.teams, run.pickup, ...Object.values(run.reserve)].filter(Boolean);
  for (const t of all) for (const p of g.squadOf(t)) (ids.add(p.id), n++);
  assert(ids.size === n, 'every player id is unique across teams, pickup and reserves');
  eq(
    Object.keys(g.POOL)
      .map(r => (run.reserve[r] ? run.reserve[r].P.length : 0))
      .join(),
    '12,6,0,0,0',
    'reserves fill Wei 24 / Wu 18 / Shu 12 / Outlaws 6 / Gloria 6'
  );
  const you = g.Run.you(run);
  for (const [r, t] of Object.entries(run.reserve)) {
    assert(t.P.length > 0 || g.Pool.size(run, r) === g.POOL[r], `reserve ${r} fills the pool`);
    for (const p of t.P) assert(p.team === t && p !== you, 'reserve players belong to their reserve only');
  }
  assert(
    !run.pickup || run.pickup.P.every(p => !Object.values(run.reserve).some(t => t.P.includes(p))),
    'pickup players are in no reserve'
  );
  g.Run.save(run);
  const back = g.Run.load();
  for (const [r, t] of Object.entries(run.reserve)) {
    const b = back.reserve[r];
    assert(b && b.P.length === t.P.length, `reserve ${r} saved`);
    t.P.forEach((p, i) => {
      const q = b.P[i];
      assert(q.id === p.id && q.name === p.name && q.power === p.power && q.jump === p.jump, 'reserve player round-trips');
      assert(q.team === b, 'reserve player is re-linked to its team');
    });
  }
  const a = load(92).Run.create(load(92).Run.draft(), spec),
    hg = load(92),
    h = hg.Run.create(hg.Run.draft(), Object.assign({ mode: { hard: true } }, spec));
  for (const r of Object.keys(a.reserve)) {
    a.reserve[r].P.forEach((p, i) => assert(h.reserve[r].P[i].power >= p.power, 'Hard reserves are at least as strong'));
  }
});

test('career: pool draw — squads, roles, weights, your spot', () => {
  const spec = { role: 'WS', name: 'Draw', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 };
  const g = load(93),
    run = g.Run.create(g.Run.draft(), spec);
  const before = JSON.stringify([run.teams.map(g.teamToJSON), Object.values(run.reserve).map(g.teamToJSON)]);
  const sq = g.Pool.draw(run, 'wei');
  assert(sq.length === 4 && sq.every(s => s.length === 6), 'Wei draws 4 squads of 6');
  const flat = sq.flat();
  assert(new Set(flat).size === 24, 'no player twice');
  assert(
    sq.every(s => s[0].role === 'S' && s[1].role === 'MB' && s[2].role === 'WS' && s[3].role === 'WS'),
    'the first 4 of each squad are in court order S, MB, WS, WS (2 more on the bench)'
  );
  const rated = g.Pool.players(run, 'wei')
      .filter(p => !p.you)
      .sort((a, b) => g.ovr(b) - g.ovr(a)),
    top = new Set(rated.slice(0, 5)),
    low = new Set(rated.slice(-5));
  let nt = 0,
    nl = 0;
  for (let i = 0; i < 300; i++) {
    for (const s of g.Pool.draw(run, 'wei', 1))
      for (const p of s) {
        if (top.has(p)) nt++;
        if (low.has(p)) nl++;
      }
  }
  assert(nt > nl, `the best are drawn more often than the weakest (${nt} vs ${nl})`);
  assert(
    g.Pool.draw(run, 'wei')
      .flat()
      .every(p => !p.you),
    'a free agent is never drawn'
  );
  const after = JSON.stringify([run.teams.map(g.teamToJSON), Object.values(run.reserve).map(g.teamToJSON)]);
  assert(before === after, 'drawing changes no team or reserve');
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  g.FACTIONS[wei].join = {};
  assert(g.World.join(run, wei), 'sign with a Wei club');
  run.rep.wei = 60;
  const you = g.Run.you(run);
  for (let i = 0; i < 20; i++) assert(g.Pool.draw(run, 'wei').flat().includes(you), 'standing 60 → always drawn');
});

test('career: faction dossier — state, places, roster gate', () => {
  const g = load(94),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Dossier', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.days = 7;
  let d = g.Dossier.build(run, 'wei');
  eq(d.state, 'stable', 'a fresh Wei is stable');
  assert(d.places.length >= 4 && d.places.every(p => p.access && typeof p.price === 'number'), 'Wei has facilities with price and access');
  eq(d.roster.length, g.POOL.wei, 'the roster is the whole pool');
  assert(
    d.roster.every(p => p.ovr === null && p.el === null),
    'unscouted: ratings and elements unknown'
  );
  assert(d.fronts.length === 2 && d.fronts.every(f => f.meter === 0), 'two fronts, no pressure yet');
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  assert(g.City.scout(run, wei), 'scout a Wei club');
  d = g.Dossier.build(run, 'wei');
  assert(d.scouted && d.roster.every(p => typeof p.ovr === 'number'), 'scouted: every rating shows');
  const before = JSON.stringify(run.teams.map(g.teamToJSON));
  g.Front.seize(run, 'wu', 'wei', 'wei-wu');
  const wu = g.Dossier.build(run, 'wu');
  eq(g.Dossier.build(run, 'wei').state, 'pressed', 'one place lost: pressed');
  const seized = wu.places.find(p => p.seized);
  assert(
    seized && seized.from === 'wei' && !g.Dossier.build(run, 'wei').places.some(p => p.id === seized.id),
    'a seized place moves to the holder'
  );
  eq(wu.state, 'rising', 'the taker is rising');
  g.Front.seize(run, 'wu', 'wei', 'wei-wu');
  eq(g.Dossier.build(run, 'wei').state, 'weakened', 'two places lost: weakened');
  eq(JSON.stringify(run.teams.map(g.teamToJSON)), before, 'building a dossier changes no team');
  const gl = g.Dossier.build(run, 'gloria');
  assert(gl.state === 'minor' && gl.fronts.length === 0, 'St. Gloria is not in the war');
});

test('career: reserves grow and get promoted', () => {
  const g = load(95),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Res', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  const sum = p => g.STATK.reduce((a, k) => a + p[k], 0),
    all = () => Object.values(run.reserve).flatMap(t => t.P);
  const before = all().reduce((a, p) => a + sum(p), 0);
  for (let i = 0; i < 8; i++) {
    run.event = null;
    g.Run.endWeek(run);
  }
  assert(all().reduce((a, p) => a + sum(p), 0) > before, 'reserves gain stats week by week');
  const sizes = Object.fromEntries(Object.keys(g.POOL).map(r => [r, g.Pool.size(run, r)]));
  const res = run.reserve.wei.P[0];
  for (const k of g.STATK) res[k] = 95;
  g.World.promote(run);
  const wt = run.teams.find(t => t.P.includes(res));
  assert(wt && g.FACTIONS[wt.i].region === 'wei' && res.team === wt, 'the reserve joined a Wei league team');
  assert(run.reserve.wei.P.some(p => p.team === run.reserve.wei) && !run.reserve.wei.P.includes(res), 'a squad player went down');
  assert(
    run.teams.every(t => t.P.length === 4),
    'every team still has 4 players'
  );
  for (const r of Object.keys(g.POOL)) eq(g.Pool.size(run, r), sizes[r], `pool ${r} size unchanged`);
});

test('career: evaluation rules', () => {
  const g = load(96),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Evalu', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  eq(g.Eval.kind(run), 'academy', 'a free agent in the Academy squad is evaluated by the Academy');
  run.week = 4;
  run.eval = null;
  const e = g.Eval.setup(run);
  assert(e && e.kind === 'academy' && e.mine === null && e.opp.length === 6, 'week 4: your side is the squad, the opponent has 6 ids');
  const pool = new Set(g.Pool.players(run, e.region).map(p => p.id));
  assert(g.MAJORS.includes(e.region) && e.opp.every(id => pool.has(id)), 'the opponent is drawn from one major pool');
  eq(g.Run.weekType(run), 'eval', 'week 4 is an evaluation week');
  const before = new Map(g.Pool.players(run, e.region).map(p => [p.id, p.team]));
  const T = g.Eval.squad(run, e.opp, 'Opp · Eval', '#fff');
  g.Eval.lend(run, T);
  g.Eval.lend(run, T);
  assert(
    T.P.every(p => p.team === T),
    'lent players point at the squad'
  );
  g.Eval.restore();
  g.Eval.restore();
  assert(
    g.Pool.players(run, e.region).every(p => p.team === before.get(p.id)),
    'restore puts every player back'
  );
  const you0 = g.Run.you(run),
    w0 = you0.wit,
    xp0 = run.xp.wit || 0;
  assert(g.Eval.bench(run).includes('Watched from the bench'), 'bench returns the diary line');
  assert(you0.wit > w0 || (run.xp.wit || 0) > xp0, 'the bench banks wit XP');
  g.World.leaveAcademy(run);
  eq(g.Eval.kind(run), null, 'alone: no evaluation');
  eq(g.Run.weekType(run), 'train', 'week 4 is a plain training week when alone');
  // signed with a major and standing 60: drawn every time, against a different squad
  const g2 = load(97),
    r2 = g2.Run.create(g2.Run.draft(), { role: 'WS', name: 'Sign', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    wei = g2.FACTIONS.findIndex(f => f.region === 'wei');
  g2.FACTIONS[wei].join = {};
  assert(g2.World.join(r2, wei), 'sign with a Wei club');
  r2.week = 8;
  r2.rep.wei = 60;
  r2.eval = null;
  const e2 = g2.Eval.setup(r2),
    you = g2.Run.you(r2);
  assert(
    e2.kind === 'faction' && e2.region === 'wei' && e2.mine.includes(you.id) && e2.opp.length === 6,
    'faction evaluation: you are in it'
  );
  assert(!e2.opp.some(id => e2.mine.includes(id)), 'a different squad');
  const gl = g2.FACTIONS.findIndex(f => f.region === 'gloria');
  r2.team = gl;
  eq(g2.Eval.kind(r2), null, 'a minor club has no evaluation');
});

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
  g3.World.leaveAcademy(r3);
  g3.Cup.start(r3, g3.CUPS[0]);
  eq(r3.cup.me, -1, 'not in the cup');
  eq(r3.cups[0].place, g3.NO_CUP, 'placing: did not play');
  assert(r3.result && typeof r3.result.champ === 'string', 'the run ends and names the champion');
});

test('engine: lane-read block — stuff rate and defence settings', () => {
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
  assert(stuffRate >= 0.12 && stuffRate <= 0.16, `stuff rate ${(100 * stuffRate).toFixed(1)} % is outside 12–16 %`);
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
test('career: scouting shows attack habits', () => {
  const g = load(94),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Habits', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  run.event = null;
  run.days = 7;
  const wei = g.FACTIONS.findIndex(f => f.region === 'wei');
  let d = g.Dossier.build(run, 'wei');
  assert(
    d.clubs.every(c => c.habits === null),
    'unscouted: no habits'
  );
  assert(g.City.scout(run, wei), 'scout a Wei club');
  d = g.Dossier.build(run, 'wei');
  const h = d.clubs.find(c => c.ti === wei).habits;
  assert(h && h.quick >= 0 && h.quick <= 70 && g.DEFSETS[h.def], 'scouted: habits are filled');
  assert(/^Quicks ~\d+ %.*Defence: \w+$/.test(g.Dossier.habitText(h)), 'the habit line reads as one line');
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

test('engine: substitutions — rule, limit, restore', () => {
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

test('engine: coach AI — errors, returns, coach IQ', () => {
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

// ---------- report ----------
if (update) {
  fs.writeFileSync(GOLDEN, JSON.stringify(record, null, 2) + '\n');
  console.log('golden values written to tests/golden.json');
}
let fail = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms)`);
  if (!r.ok) {
    fail++;
    console.log('   ' + (r.err && r.err.stack ? r.err.stack.split('\n').slice(0, 3).join('\n   ') : r.err));
  }
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
