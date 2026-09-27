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
  assert(M.every(t => t.P.every(p => p.op)), 'every monster player must be OP');
  assert(L.every(t => t.P.every(p => !p.star)), 'league teams start without stars');
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
  const known = new Set([...src.matchAll(/case '([a-zA-Z]+)'/g)].map(m => m[1]).concat(['slide', 'hold', 'pose', 'jump', 'ball', 'reset', 'rot', 'score', 'point']));
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
  const fxKeys = new Set(['power', 'def', 'speed', 'jump', 'wit', 'lead', 'sta', 'mood', 'sp', 'fans', 'main', 'bondMate', 'bondCap', 'bondAll', 'chance']);
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
  for (const u of g.UNLOCKS) assert(!u.need || g.UNLOCKS.some(x => x.id === u.need), 'unlock needs missing: ' + u.id);
  for (const w of Object.keys(g.CALENDAR)) assert(+w >= 1 && +w <= g.CAREER.weeks, 'calendar week out of range ' + w);
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
    const wt = g.Run.weekType(run);
    if (wt === 'cup' || wt.startsWith('warmup')) {
      run.focus = g.FOCUS[role][0][0];
      run.talk = 'fire';
      const fx = g.Cup.fixture(run, wt === 'cup' ? 'cup' : 'warmup');
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
    eq(run.cups.map(c => c.id).join(','), 'skyline,grand', 'both cups are played, whatever happens in the first');
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
  eq(g.Run.you(back).team, back.teams[back.team], 'player re-linked to team');
  eq(JSON.stringify(back.teams.map(g.teamToJSON)), JSON.stringify(run.teams.map(g.teamToJSON)), 'teams');
});
test('career: old saves are migrated, not discarded', () => {
  const g = load(6),
    d = g.Run.draft(),
    run = g.Run.create(d, { role: 'WS', name: 'Old', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  // build a v1-shaped save: 12-week calendar, no potentials, no star/op fields on you
  run.week = 7;
  const v1 = Object.assign({}, run, { v: 1, teams: run.teams.map(g.teamToJSON) });
  for (const t of v1.teams) for (const p of t.P) delete p.pot;
  g.store.setJSON(g.KEYS.career, v1);
  const m = g.Run.load();
  assert(m, 'v1 save should migrate');
  eq(m.v, g.RUN_VERSION, 'version bumped');
  eq(m.week, 13, 'week 7 of 12 maps to week 13 of 24');
  assert(m.teams.every(t => t.P.every(p => p.pot > 0)), 'potentials filled in');
  g.store.setJSON(g.KEYS.career, { v: 99 });
  eq(g.Run.load(), null, 'unknown future version is ignored');
});
test('career: v2 saves (one cup, 24 weeks) upgrade to the two-cup season', () => {
  const g = load(9),
    run = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Mid', alloc: { power: 10, def: 20, speed: 10, jump: 20 }, witSteps: 0 });
  g.Run.you(run).jump = 84;
  const v2 = Object.assign({}, run, { v: 2, week: 25, teams: run.teams.map(g.teamToJSON) });
  for (const k of ['legacy', 'cups', 'lb', 'streak', 'injury', 'goal', 'sponsors', 'sponsorN', 'focus', 'talk', 'trained', 'hist', 'mode', 'pure', 'legend']) delete v2[k];
  v2.cup = { sched: g.newBracket([0, 1, 2, 3, 4, 5, 6, 7]), out: null };
  g.store.setJSON(g.KEYS.career, v2);
  const m = g.Run.load();
  assert(m, 'v2 save should migrate');
  eq(m.v, g.RUN_VERSION, 'version bumped');
  eq(g.Run.weekType(m), 'cup', 'still in the Skyline Cup');
  eq(m.cup.id, 'skyline', 'cup identified');
  eq(m.lb.jump, 1, 'a stat already past 80 keeps its first Limit Break');
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
  const n = g.Training.preview(run, 'power', false).main[1],
    h = g.Training.preview(run, 'power', true);
  assert(h.main[1] > n && h.sta === 2 * g.Training.preview(run, 'power', false).sta, 'Hard: more gain, double stamina');
});
test('career: Legacy switches and pure runs', () => {
  const g = load(12);
  g.store.setJSON(g.KEYS.legacy, { pts: 0, owned: ['fans', 'fund'], off: [], runs: 0, history: [] });
  g.Legacy.toggle('fans');
  const a = g.Run.create(g.Run.draft(), { role: 'S', name: 'Off', alloc: { power: 10, def: 10, speed: 30, jump: 10 }, witSteps: 0 });
  eq(a.fans, 0, 'a switched-off unlock does not apply');
  eq(a.sp, 100, 'the others still do');
  const b = g.Run.create(g.Run.draft(), { role: 'S', name: 'Pure', alloc: { power: 10, def: 10, speed: 30, jump: 10 }, witSteps: 0, pure: true });
  eq(b.sp, 0, 'pure run: nothing applies');
  eq(g.Legacy.earned({ fans: 5000, pure: true }), 12, 'pure run earns ×1.25');
  eq(g.Legacy.earned({ fans: 5000, cups: [{ place: 'Champion' }, { place: 'Champion' }] }), 20, 'Double Crown +10');
});
test('career: every Legacy unlock applies at the start of a run', () => {
  const g = load(8);
  g.store.setJSON(g.KEYS.legacy, { pts: 0, owned: g.UNLOCKS.map(u => u.id), runs: 0, history: [] });
  const run = g.Run.create(g.Run.draft(), { role: 'S', name: 'Rich', alloc: { power: 10, def: 10, speed: 30, jump: 10 }, witSteps: 1 });
  const you = g.Run.you(run),
    mates = g.Run.mates(run);
  eq(run.mood, 4, 'Good vibes');
  eq(run.fans, 1000, 'Fan club');
  eq(run.sp, 100, 'Skill fund');
  eq(run.staMax, 120, 'Fresh legs');
  assert(mates.filter(p => p.op).length === 1 && mates.filter(p => p.star).length === 3, 'OP teammate + Star duo');
  assert(mates.every(p => you.bond[p.id] >= 30), 'Old friends');
  eq(g.Legacy.createCap(), 75, 'Growth spurt');
  eq(g.Legacy.budget(), g.CAREER.budget + 15, 'Extra budget I–III');
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
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Spark', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
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
  // v3 saves: players gain elements on load
  const v3 = Object.assign({}, run, { v: 3, teams: run.teams.map(g.teamToJSON) });
  for (const t of v3.teams) for (const p of t.P) delete p.el, delete p.sig, delete p.elOn, delete p.elSeen;
  delete v3.elProof;
  g.store.setJSON(g.KEYS.career, v3);
  const mg = g.Run.load();
  assert(mg && mg.v === g.RUN_VERSION && mg.teams.every(t => t.P.every(p => g.ELS.includes(p.el))), 'v3 save upgraded with elements');
  assert(g.Run.you(mg).elSeen, 'OVR 70+ player sees their element after the upgrade');
});

test('engine: staged scenes are rare and well-formed', () => {
  const g = load(31);
  let scenes = 0,
    matches = 0;
  for (let i = 0; i < 10; i++) {
    const [a, b] = g.mkTeams(),
      ids = new Set([...a.P, ...b.P].map(p => p.id)),
      m = g.newMatch(a, b, true);
    while (!m.over)
      for (const bt of g.playRally(m).beats) {
        if (!bt.scene) continue;
        assert(bt.scene === 1 || bt.scene === 2, 'scene level 1 or 2');
        for (const a2 of bt.acts) if ((a2.k === 'shot' && a2.kind) || a2.k === 'call') assert(ids.has(a2.p), 'scene act names a player on court');
        if (bt.acts.some(a2 => a2.k === 'shot' && a2.kind === 'face')) scenes++;
      }
    matches++;
  }
  const per = scenes / matches;
  assert(per >= 1 && per <= 7, `scenes per match ${per}`);
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
