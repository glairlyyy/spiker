// Career rules: data integrity, full runs, saves, training and growth, elements, world, pools, evaluations, rankings, challenges.
const { load, test, assert, eq, playRun } = require('./harness');

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

test('career: a full run reaches a result with sane values', () => {
  for (const role of ['WS', 'MB', 'S']) {
    const g = load(100 + role.length),
      run = playRun(g, role),
      you = g.Run.you(run);
    assert(run.result && ['S', 'A', 'B', 'C'].includes(run.result.rank), 'run must end with a rank');
    eq(run.cups.map(c => c.id).join(','), 'u21', 'the U21 Final Cup ends every run (placing NO_CUP when your squad was not drawn)');
    eq(run.week, g.CAREER.weeks + 1, 'the season runs all 28 weeks');
    assert(run.hist.length >= 20, 'weekly history for the growth chart');
    for (const k of g.STATK) assert(you[k] >= g.CAREER.statMin && you[k] <= 99, `${k} out of range: ${you[k]}`);
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

test('career: training cap, facility Lv 5 and Hard training', () => {
  const g = load(10),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Cap', alloc: { power: 30, def: 10, speed: 10, jump: 10 }, witSteps: 0 }),
    you = g.Run.you(run);
  eq(g.TRAIN_CAP, 75, 'training cap');
  you.power = 60;
  for (let i = 0; i < 200; i++) {
    run.sta = 100;
    run.injury = null;
    run.mood = 4;
    g.Training.train(run, 'power');
    assert(!run.event, 'no Limit Break event any more');
  }
  eq(you.power, 75, '200 sessions stop power at 75');
  eq(g.Training.preview(run, 'power', false).cap, 75, 'the preview says the stat is capped');
  const xp0 = run.xp.power || 0;
  g.Training.addXp(run, 'power', 500);
  eq(you.power, 75, 'XP from training past the cap does nothing');
  eq(run.xp.power || 0, xp0, '…and banks nothing');
  g.Run.bump(run, 'power', 10);
  eq(you.power, 75, 'an event bump at 75 does nothing');
  you.power = 80;
  g.Run.bump(run, 'power', -5);
  eq(you.power, 75, 'a negative event still applies to a raised stat');
  you.power = 80;
  g.Run.bump(run, 'power', 4);
  eq(you.power, 80, 'a stat already at 80 is not lowered by a positive bump');
  g.Training.addXp(run, 'power', 100000, 'match');
  assert(you.power > 80, 'match XP goes past the training cap');
  assert(!('lb' in run) && g.RUN_VERSION === 9, 'no Limit Break progress in the run; RUN_VERSION 9');
  run.uses.power = 26;
  eq(g.Training.facility(run, 'power'), 4, 'Lv 5 after 26 sessions');
  const n = g.Training.preview(run, 'power', false).main[2],
    h = g.Training.preview(run, 'power', true);
  assert(h.main[2] > n && h.sta === 2 * g.Training.preview(run, 'power', false).sta, 'Hard: more gain, double stamina');
});

test('career: match XP — performance, opponent strength, past the cap', () => {
  const g = load(61),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Xp', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    mine = g.Run.myTeam(run),
    foe = run.teams[1],
    line = { k: 4, blk: 2, dig: 3, ast: 6, ace: 1, att: 10, err: 0 };
  const xpFor = (oppLevel, winner) => {
    for (const p of foe.P) for (const k of g.STATK) p[k] = oppLevel;
    const got = {},
      keep = g.Training.addXp;
    g.Training.addXp = (r, stat, xp, src) => ((got[stat] = xp), eq(src, 'match', 'source'), '');
    const m = { stat: { [you.id]: line }, lineup0: [{ P: mine.P }, { P: foe.P }], winner };
    g.Growth.matchXp(run, m, mine, foe);
    g.Training.addXp = keep;
    return got;
  };
  const base = g.teamOvr(mine);
  for (const p of foe.P) for (const k of g.STATK) p[k] = 60;
  // a level that gives the same team ovr as yours: search
  let L = 25;
  while (L < 99 && g.teamOvr({ P: foe.P.map(p => ({ ...p, ...Object.fromEntries(g.STATK.map(k => [k, L])) })) }) < base) L++;
  const eq1 = xpFor(L, 0);
  eq(eq1.power, 4 * 12 + 1 * 8, 'kills and aces → power');
  eq(eq1.jump, 2 * 8 + 10, 'blocks and attempts → jump');
  eq(eq1.def, 2 * 8 + 3 * 6, 'blocks and digs → defense');
  eq(eq1.speed, 3 * 6, 'digs → speed');
  eq(eq1.wit, 6 * 2, 'assists → wit');
  const strong = xpFor(L + 12, 0),
    weak = xpFor(L - 30, 0);
  assert(strong.power > eq1.power && strong.power <= eq1.power * 2, `stronger side gives more (${strong.power} vs ${eq1.power})`);
  eq(weak.power, Math.round(56 * 0.3), 'a much weaker side gives ×0.3');
  eq(JSON.stringify(xpFor(L, 1)), JSON.stringify(eq1), 'the winner flag changes nothing');
  // past the training cap: matches raise a stat at 75
  you.power = 75;
  run.xp = {};
  const label = g.Training.addXp(run, 'power', 200, 'match');
  assert(you.power > 75 && /^\+\d+ Power/.test(label), `a stat at 75 rises from match XP (${you.power})`);
  // never played → no XP line
  for (const p of foe.P) for (const k of g.STATK) p[k] = 55;
  run.week = 4;
  run.eval = null;
  run.event = null;
  const fx = g.Cup.fixture(run, 'eval'),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  m.played.delete(you.id);
  const xp0 = JSON.stringify({ ...run.xp, wit: 0 }),
    txt = fx.onFinish(m);
  assert(!/XP:/.test(txt) && JSON.stringify({ ...run.xp, wit: 0 }) === xp0, `never played → no match XP (${txt})`);
  // a played match shows the XP labels
  run.week = 8;
  run.eval = null;
  run.event = null;
  const fx2 = g.Cup.fixture(run, 'eval'),
    m2 = g.newMatch(fx2.a, fx2.b, false);
  while (!m2.over) g.playRally(m2);
  m2.played.add(you.id);
  m2.stat[you.id] = { ...g.blank(), k: 5, blk: 1 };
  assert(/XP: /.test(fx2.onFinish(m2)), 'the result line shows the XP labels');
});

test.slow('career: start from 1', () => {
  const g = load(71),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Zero', mode: {} }),
    you = g.Run.you(run);
  for (const k of g.STATK) eq(you[k], 1, `${k} starts at 1`);
  eq(you.wit, 1, 'wit starts at 1.0');
  assert(g.ovr(you) >= 0 && Number.isFinite(g.ovr(you)), `ovr is a number (${g.ovr(you)})`);
  eq(g.Training.need(1), 1, 'a first point costs 1 XP');
  eq(g.Training.need(50), 10, 'and 10 XP at 50');
  assert(g.Training.need(20) > g.Training.need(10) && g.Training.need(40) > g.Training.need(20), 'the curve rises');
  // one focused session raises Power by several points
  run.event = null;
  run.sta = run.staMax;
  g.Training.train(run, 'power', false);
  assert(you.power >= 4, `one Power session raises Power from 1 by several points (${you.power})`);
  // the coach benches an all-1 you behind a same-role mate (a middle blocker: the squad has one MB slot; a lone WS still starts for lack of a rival)
  const runMB = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Zero', mode: {} });
  eq(g.Run.lineup(runMB, g.Run.myTeam(runMB), null, true).starts, false, 'you start on the bench');
  // nothing pushes a stat below 1
  for (const k of g.STATK) g.Run.bump(run, k, -999);
  for (const k of g.STATK) assert(you[k] === g.CAREER.statMin, `${k} stops at ${g.CAREER.statMin} (${you[k]})`);
  // 300 sims of a squad with an all-1 player: no NaN / Infinity
  const bad = o => {
    if (typeof o === 'number') return !Number.isFinite(o);
    if (o && typeof o === 'object') return Object.values(o).some(bad);
    return false;
  };
  const mine = g.Run.myTeam(run);
  for (const k of g.STATK) you[k] = 1;
  for (let i = 0; i < 300; i++) {
    const m = g.newMatch(mine, run.teams[i % 8], i < 30);
    let n = 0;
    while (!m.over && n++ < 3000) {
      const r = g.playRally(m);
      if (i < 30) assert(!bad(r.beats), 'no NaN / Infinity in the beats');
    }
    assert(m.over, 'the match ends (no stall)');
    assert(!bad(m.stat), 'no NaN / Infinity in m.stat');
  }
});

test('career: match history', () => {
  const g = load(61),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Hist', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    play = fx => {
      const m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      return m;
    };
  eq(JSON.stringify(run.mlog), '[]', 'a new run has an empty history');
  // an evaluation: the snapshot is the kick-off state (before the match XP)
  run.week = 4;
  run.eval = null;
  run.event = null;
  const fx = g.Cup.fixture(run, 'eval'),
    m = play(fx),
    before = { ovr: g.ovr(you), power: you.power, def: you.def, speed: you.speed, jump: you.jump, wit: you.wit };
  m.played.add(you.id);
  fx.onFinish(m);
  eq(run.mlog.length, 1, 'an evaluation adds one entry');
  const e = run.mlog[0];
  eq(e.kind, 'eval', 'kind');
  eq(JSON.stringify(e.score), JSON.stringify([m.setScores[0][0], m.setScores[0][1]]), 'score');
  eq(e.win, m.winner === 0, 'win');
  eq(JSON.stringify(e.you), JSON.stringify(before), 'you = your stats before the match');
  const ids = e.box.filter(b => b.you).length;
  eq(ids, 1, 'you appear once in the box');
  eq(e.box.length, m.played.size, 'the box has every player who played, once');
  eq(JSON.stringify(JSON.parse(JSON.stringify(e))), JSON.stringify(e), 'plain JSON');
  // a challenge and a street fight
  run.days = g.WEEK_DAYS;
  run.week = 5;
  run.money = 500;
  const ti = g.FACTIONS.findIndex(f => f.region === 'outlaws');
  const stake = g.CHALLENGE.outlaws.minStake,
    fc = g.Cup.challenge(run, ti, stake),
    mc = play(fc);
  fc.onFinish(mc);
  eq(run.mlog.length, 2, 'a challenge adds one entry');
  eq(run.mlog[1].kind, 'challenge', 'kind challenge');
  eq(run.mlog[1].stake, stake, 'with its stake');
  eq(run.mlog[1].win, mc.winner === 0, 'win');
  run.days = 7;
  run.lastFight = null; // (no fight ban or injury after the challenge)
  run.injury = null;
  run.event = null;
  run.pos = [470, 600];
  run.clash = { site: 0, seen: false, done: false };
  const fs = g.Cup.clash(run, g.CLASH.sites[0].a),
    ms = play(fs);
  fs.onFinish(ms);
  eq(run.mlog.length, 3, 'a street fight adds one entry');
  eq(run.mlog[2].kind, 'street', 'kind street');
  eq(run.mlog[2].win, ms.winner === 0, 'win');
  eq(JSON.stringify(JSON.parse(JSON.stringify(run.mlog))), JSON.stringify(run.mlog), 'the whole log is plain JSON');
  // trimming and repair
  for (let i = 0; i < g.MLOG.max + 5; i++) run.mlog.push({ ...e, week: i });
  run.days = g.WEEK_DAYS;
  run.week = 8;
  run.eval = null;
  run.event = null;
  const fx3 = g.Cup.fixture(run, 'eval'),
    m3 = play(fx3);
  fx3.onFinish(m3);
  eq(run.mlog.length, g.MLOG.max, 'trimmed at MLOG.max');
  eq(run.mlog[run.mlog.length - 1].week, 8, 'the newest is kept');
  delete run.mlog;
  g.Run.repair(run);
  eq(JSON.stringify(run.mlog), '[]', 'repair adds mlog');
});

test('career: techniques are learned in play, not bought', () => {
  const g = load(71),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Tech', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  run.sp = 9999;
  assert(
    !g.Skills.canLearn(run, 'cutshot') && !g.Skills.learn(run, 'cutshot') && !you.skills.includes('cutshot'),
    'a technique cannot be bought'
  );
  assert(g.Skills.canLearn(run, 'thunder'), 'a basic skill still can');
  // a fake finished match: you are on side 0, the foe on side 1
  const foe = run.teams[1],
    mk = (line, teacher) => {
      for (const p of foe.P) {
        p.skills = [];
        p.wit = 0.1;
        for (const k of g.STATK) p[k] = 30; // meets no technique's requirement
      }
      if (teacher) foe.P[0].skills = [teacher];
      const stat = { [you.id]: { ...g.blank(), ...line } };
      return {
        stat,
        t: [g.Run.myTeam(run), foe],
        lineup0: [{ P: g.Run.myTeam(run).P }, { P: foe.P }],
        played: new Set(foe.P.map(p => p.id))
      };
    };
  const low = g.RNG.next;
  g.RNG.next = () => 0.001;
  // by doing: 3+ kills → an Attack technique for a WS (cutshot / delayed spike), first in SKILLS order
  let txt = g.Skills.tryLearn(run, mk({ k: 3 }));
  assert(/^Learned .+ in play \(by doing\)$/.test(txt) && you.skills.length === 1, `learned by doing: ${txt}`);
  assert(g.SKILLS[you.skills[0]].tech === 'Attack', 'an Attack technique');
  // never two in one match, and a second match with the same line teaches the next one
  eq(you.skills.length, 1, 'one technique per match');
  txt = g.Skills.tryLearn(run, mk({ k: 3 }));
  eq(you.skills.length, 2, 'the next match teaches another');
  // below the thresholds and nobody with it → nothing (and no random draw)
  let draws = 0;
  g.RNG.next = () => (draws++, 0.001);
  eq(g.Skills.tryLearn(run, mk({ k: 1 })), '', 'nothing learned below the threshold');
  eq(draws, 0, 'no candidate → no roll');
  // by facing: a foe who has a Serve technique, you did nothing
  you.skills = [];
  const m = mk({}, 'target');
  foe.P[0].skills = ['target'];
  txt = g.Skills.tryLearn(run, m);
  assert(/from /.test(txt) && you.skills.includes('target'), `learned by facing: ${txt}`);
  g.RNG.next = () => 0.999;
  you.skills = [];
  eq(g.Skills.tryLearn(run, mk({ k: 9 })), '', 'a high roll learns nothing');
  g.RNG.next = low;
  // scouting: the dossier lists techniques only once ratings are visible
  const d = g.Dossier.build(run, 'wei');
  assert(
    d.roster.every(p => (d.scouted || d.member ? Array.isArray(p.techs) : p.techs === null)),
    'dossier techs hidden until scouted'
  );
  run.scout = Object.fromEntries(run.teams.map(t => [t.i, run.week]));
  const d2 = g.Dossier.build(run, 'wei');
  assert(d2.scouted && d2.roster.every(p => Array.isArray(p.techs)), 'dossier techs shown once scouted');
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
    r2 = h.Run.create(h.Run.draft(), {
      role: 'MB',
      name: 'Loner',
      alloc: { power: 10, def: 20, speed: 10, jump: 20 },
      witSteps: 0,
      mode: { story: false }
    });
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

test('career: rankings — register, gazette, street, known gate', () => {
  const g = load(61),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Rank', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run);
  for (const k of g.STATK) you[k] = 99;
  run.week = 4;
  run.eval = null;
  run.event = null;
  const all = Object.fromEntries(g.Rank.players(run).map(e => [e.p.id, e.p]));
  eq(JSON.stringify(g.Rank.register(run)), JSON.stringify(g.Rank.register(run)), 'the same state gives the same register');
  const R = g.Rank.register(run),
    unknown = R.filter(r => r.ovr === null),
    known = R.filter(r => r.ovr !== null);
  assert(unknown.length > 10 && known.length > 0, 'some players are unrated, your own side is known');
  assert(
    R.every((r, i) => i === 0 || g.ovr(all[R[i - 1].id]) >= g.ovr(all[r.id])),
    'the order is the true OVR order'
  );
  assert(known.every(r => r.ovr === g.ovr(all[r.id])) && R.every(r => !('v' in r)), 'a known rating is true; the true OVR is not exposed');
  eq(R[0].id, g.Rank.of(run, R[0].id).register === 1 ? R[0].id : null, 'of(): first place');
  // Wei bias: the same fame source is worth more in Wei
  const fame = (region, p) => g.Rank.fame(run, { p, region });
  assert(
    fame('wei', { star: true }) > fame('wu', { star: true }) && fame('wei', { star: true }) === g.RANK.fame.star * g.RANK.weiFame,
    'Wei fame ×weiFame'
  );
  assert(g.Rank.gazette(run).length <= g.RANK.top, 'the Gazette is a Top 20');
  eq(g.Rank.street(run).length, 0, 'nobody on the street board yet');
  // an evaluation you play: the opponents are met, their rating shows
  const fx0 = g.Cup.fixture(run, 'eval'),
    m0 = g.newMatch(fx0.a, fx0.b, false);
  while (!m0.over) g.playRally(m0);
  const foes = g.squadOf(m0.t[1]).filter(p => m0.played.has(p.id));
  assert(m0.played.has(you.id) && foes.length > 0, 'you played');
  fx0.onFinish(m0);
  assert(
    foes.every(p => run.met[p.id]) &&
      g.Rank.register(run)
        .filter(r => foes.some(p => p.id === r.id))
        .every(r => r.ovr !== null),
    'the opponents are met and rated'
  );
  // a street battle you fight: your points, and the winner faction's best players share
  run.clash = { site: 0, att: g.CLASH.sites[0].a, seen: false, done: false };
  const side = g.CLASH.sites[0].a,
    fx = g.Cup.clash(run, side),
    m = g.newMatch(fx.a, fx.b, false);
  while (!m.over) g.playRally(m);
  fx.onFinish(m);
  const won = m.winner === 0,
    S = g.Rank.street(run);
  eq(run.street[you.id], g.RANK.street.fight + (won ? g.RANK.street.win : 0), 'your street points');
  assert(S.some(r => r.id === you.id) && S.length > 1 && S.length <= 1 + g.RANK.street.share, 'you and the winner faction share the board');
  assert(g.Rank.of(run, you.id).street >= 1, 'your place on the street board');
  assert(JSON.stringify(g.Rank.gazette(run)) === JSON.stringify(g.Rank.gazette(run)), 'gazette is stable');
});

test('career: team challenge — worth, refusal, stake payout', () => {
  const g = load(71),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Chal', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    club = r => g.FACTIONS.findIndex(f => f.region === r);
  run.event = null;
  run.money = 500;
  run.fans = 0;
  g.Rank.players(run)
    .filter(e => e.p !== you)
    .slice(0, 25)
    .forEach(e => (e.p.op = true)); // twenty-five famous players keep you out of the Gazette Top 20
  const W = (r, stake) => g.City.worth(run, club(r), stake);
  eq(W('gloria', 500).verdict, 'refuses', 'Gloria refuses anyone outside the Top 20, whatever the stake');
  eq(W('outlaws', 0).verdict, 'refuses', 'the Outlaws laugh off a 0 stake');
  eq(W('outlaws', g.CHALLENGE.outlaws.minStake).verdict, 'likely', 'and accept a bet');
  assert(W('wei', 1000).worth > W('wei', 0).worth, 'Wei: money talks');
  eq(W('wu', 0).worth, W('wu', 1000).worth, 'Wu: the stake counts for nothing');
  const own = run.team;
  run.team = club('wei');
  eq(g.City.worth(run, club('wei'), 0), null, 'your own club is not challengeable');
  run.team = own;
  // a refusal costs the trip + a day and blocks that club for the week
  const d0 = run.days,
    r0 = g.City.challenge(run, club('gloria'), 100);
  assert(r0 && !r0.accepted && /turned your challenge down/.test(r0.line) && run.days < d0, `refused: ${r0 && r0.line}`);
  assert(run.refused[club('gloria')].week === run.week && run.refused[club('gloria')].n === 1, 'the refusal is recorded');
  eq(W('gloria', 100).why, g.CHALLENGE_WHY.week, 'not again this week');
  run.days = g.WEEK_DAYS;
  for (let i = 2; i <= g.CHALLENGE.refuseMax; i++) {
    run.week++;
    run.days = g.WEEK_DAYS;
    g.City.challenge(run, club('gloria'), 100);
  }
  assert(g.City.rep(run, 'gloria') <= g.CHALLENGE.pest, 'refused 3 times: you are a pest (standing drops)');
  run.days = g.WEEK_DAYS;
  run.week = 4;
  // accepted: a real match; a win pays the stake at odds (the club's players are weakened, yours strengthened, so it is won)
  const ti = club('outlaws');
  for (const p of g.squadOf(run.teams[ti])) for (const k of g.STATK) p[k] = 25;
  for (const p of g.squadOf(run.pickup)) for (const k of g.STATK) p[k] = 99;
  const acc = g.City.challenge(run, ti, 50);
  assert(acc && acc.accepted && acc.stake === 50, 'the Outlaws accept a 50 stake');
  const d1 = run.days,
    money0 = run.money,
    fx = g.Cup.challenge(run, ti, 50),
    m = g.newMatch(fx.a, fx.b, false);
  eq(run.days, d1, 'nothing is spent until it finishes');
  while (!m.over) g.playRally(m);
  const line = fx.onFinish(m);
  assert(m.winner === 0 && /won/.test(line) && run.money > money0, `a won challenge pays the stake at odds: ${line}`);
  assert(
    run.money - money0 >= Math.round(50 * g.CHALLENGE.odds[0]) && run.days < d1,
    'at least stake × the lowest odds; a day and the trip spent'
  );
  assert(run.street[you.id] === g.RANK.street.fight + g.RANK.street.win, 'and street points');
  // alone: a street crew is hired (paid from your money) and you play in it
  run.academy = false;
  run.team = null;
  const T = g.Cup.hired(run);
  assert(g.squadOf(T).length === 6 && T.P.includes(you) && T.P.length === 4, 'the hired crew: 6 players, you on court');
  const side = g.City.challengeSide(run);
  eq(side.kind, 'hired', 'alone = hired crew');
  run.days = g.WEEK_DAYS;
  run.week = 6;
  const m1 = run.money,
    fx1 = g.Cup.challenge(run, ti, 50),
    mm = g.newMatch(fx1.a, fx1.b, false);
  while (!mm.over) g.playRally(mm);
  fx1.onFinish(mm);
  assert(you.team === run.pickup || you.team === g.Run.myTeam(run), 'you are back on your own team after the match');
  assert(run.money !== m1 && /crew/.test(run.log[0].t), 'the crew is paid');
});

test('career: challenge loss and injury', () => {
  const g = load(72),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Loser', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    ti = g.FACTIONS.findIndex(f => f.region === 'outlaws'),
    r = 'outlaws',
    fresh = () => {
      run.sta = run.staMax;
      run.mood = 2;
      run.money = 500;
      run.days = g.WEEK_DAYS;
      run.event = null;
      run.injury = null;
      run.lastFight = null;
    },
    play = (stake = 50) => {
      const fx = g.Cup.challenge(run, ti, stake),
        m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      return { m, line: fx.onFinish(m) };
    };
  // 'unlucky' rolls: R() = 0.99 → never injured; forced low → injured
  const roll = v => (g.RNG.next = () => v);
  roll(0.99);
  fresh();
  for (const p of g.squadOf(run.teams[ti])) for (const k of g.STATK) p[k] = 99;
  for (const p of g.squadOf(run.pickup)) for (const k of g.STATK) p[k] = 25;
  const sta0 = run.sta,
    mood0 = run.mood,
    rep0 = g.City.rep(run, r);
  let res = play();
  assert(res.m.winner === 1, 'weakened side loses');
  assert(
    run.sta <= sta0 - g.LOSS.sta - g.CLASH.sta + 1 && run.mood === mood0 + g.LOSS.mood && g.City.rep(run, r) <= rep0 + g.LOSS.rep,
    `a loss costs stamina, mood and standing: ${res.line}`
  );
  eq(run.losses[r], 1, 'the loss is counted');
  assert(
    run.news.some(t => /Loser/.test(t)),
    'a heavy loss earns a Gazette jab'
  );
  assert(run.lastFight === g.Run.dayNo(run), 'the fight day is recorded');
  // the 3rd loss to a faction adds the extra standing hit
  run.losses[r] = g.LOSS.repeat - 1;
  fresh();
  run.week += 1;
  run.rep[r] = 0;
  res = play();
  assert(g.City.rep(run, r) <= g.LOSS.rep + g.LOSS.repeatRep, `third loss: extra standing hit (${g.City.rep(run, r)})`);
  // risk rises with the gap, the margin, low stamina and a fight on the same day; clamped at max
  fresh();
  const R0 = g.City.injuryRisk(run, 60);
  assert(g.City.injuryRisk(run, 99) > R0, 'risk rises with their rating');
  assert(g.City.injuryRisk(run, 60, 10) > R0, 'and the margin of defeat');
  run.sta = 20;
  assert(g.City.injuryRisk(run, 60) > R0, 'and low stamina');
  fresh();
  run.lastFight = g.Run.dayNo(run);
  assert(g.City.injuryRisk(run, 60) > R0, 'and fighting on the same day');
  eq(g.City.injuryRisk(run, 999, 99), g.INJURY.max, 'clamped at INJURY.max');
  // forced low: a severe injury — 3 weeks and −2 on one stat
  fresh();
  for (const k of g.STATK) you[k] = 60;
  const before = g.STATK.map(k => you[k]);
  let n = 0;
  g.RNG.next = () => (n++ ? 0.97 : 0.0);
  const txt = g.Cup.injure(run, 0.5);
  assert(run.injury && run.injury.weeks === g.INJURY.weeks.severe && /severe/.test(txt), `severe: ${txt}`);
  const lost = g.STATK.filter((k, i) => you[k] < before[i]);
  assert(lost.length === 1 && before[g.STATK.indexOf(lost[0])] - you[lost[0]] === g.INJURY.lose, 'one stat loses INJURY.lose for good');
  // an injured player can't challenge or fight and is benched by Run.lineup
  roll(0.99);
  eq(g.City.fightBan(run), 'Injured — rest first', 'the ban text');
  eq(g.City.challenge(run, ti, 50), null, 'no challenge while injured');
  eq(g.Cup.challenge(run, ti, 50), null, 'no challenge match while injured');
  const L = g.Run.lineup(run, run.pickup, null, true);
  assert(!L.starts, 'an injured you is benched');
  // the physio clears the weeks but not the stat
  run.sp = 99;
  assert(g.Training.physio(run) && !run.injury, 'physio heals the injury');
  assert(you[lost[0]] === before[g.STATK.indexOf(lost[0])] - g.INJURY.lose, 'but not the lost stat');
  eq(g.RUN_VERSION, 9, 'save v9');
});

test('career: rules moved out of the UI (T-075)', () => {
  const g = load(31),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Rules', mode: { story: true } });
  run.event = null;
  // City.after: the week's event is rolled once, after the first action
  run.rolled = false;
  g.City.after(run);
  assert(run.rolled, 'rolled after the first action');
  run.event = null;
  g.City.after(run);
  eq(run.event, null, 'never twice a week');
  // Run.canEndWeek: training weeks only, never with an event open
  run.week = 2;
  assert(g.Run.canEndWeek(run), 'a training week can end');
  run.event = { id: 'x' };
  assert(!g.Run.canEndWeek(run), 'not with an event open');
  run.event = null;
  run.week = 4;
  assert(!g.Run.canEndWeek(run), 'not on an evaluation week');
  run.week = 2;
  // Run.readGazette: true once
  run.gazette = { week: 1, items: [], read: false };
  assert(g.Run.readGazette(run) && run.gazette.read && !g.Run.readGazette(run), 'the Gazette is read once');
  // Goals.progress
  const you = g.Run.you(run);
  eq(
    g.Goals.progress(run, { kind: 'stat', stat: 'power', target: you.power + 3, done: null }),
    `${you.power} / ${you.power + 3}`,
    'stat progress'
  );
  eq(g.Goals.progress(run, { kind: 'win', week: 4, done: null }), 'to play', 'win goal not played yet');
  eq(g.Goals.progress(run, { kind: 'fans', target: 100, done: true }), '', 'decided goals show no progress');
  // Dossier.summary / standingLabel
  run.rep = { wei: 40, wu: -5 };
  for (let i = 0; i < g.FRONT.seize; i++) g.Front.result(run, 'wu', 'wei');
  const W = g.Dossier.summary(run, 'wei'),
    U = g.Dossier.summary(run, 'wu');
  eq(W.label, 'Trusted', 'standing label');
  eq(U.label, 'Wary', 'standing label (negative)');
  eq(W.lost.length, 1, 'Wei lost a place');
  eq(U.took[0].from, 'wei', 'Wu took it from Wei');
  assert(W.econ && W.econ.joinCut === g.FRONT.join, 'a losing faction asks less');
  eq(g.Dossier.summary(run, 'outlaws').fronts.length, 0, 'minors are not in the war');
  // Cup.simNow: a fixture resolves at once (setup when present)
  let setupRan = false,
    finished = null;
  const T = g.mkMonsterTeams(),
    m = g.Cup.simNow({ a: T[0], b: T[1], setup: () => (setupRan = true), onFinish: mm => (finished = mm) });
  assert(m.over && finished === m && setupRan, 'simNow plays the whole match, setup and finish');
});

test('career: one defaults table for new runs and repair (T-076)', () => {
  const g = load(41),
    run = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Defaults', mode: { story: true } });
  for (const k of Object.keys(g.RUN_DEFAULTS)) assert(k in run, `a new run has ${k}`);
  // a new run passes repair unchanged
  const before = JSON.stringify(Object.assign({}, run, { teams: null, pickup: null, reserve: null }));
  g.Run.repair(run);
  eq(JSON.stringify(Object.assign({}, run, { teams: null, pickup: null, reserve: null })), before, 'repair changes nothing on a sound run');
  // a damaged save gets every defaults key back, and grades stay capped
  const bare = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Bare' });
  for (const k of Object.keys(g.RUN_DEFAULTS)) delete bare[k];
  bare.grades = Array.from({ length: g.MLOG.max + 5 }, () => 'B');
  g.Run.repair(bare);
  for (const [k, [, ok]] of Object.entries(g.RUN_DEFAULTS)) assert(ok(bare[k]), `repair restores ${k}`);
  eq(bare.grades.length, g.MLOG.max, 'grades capped');
});
