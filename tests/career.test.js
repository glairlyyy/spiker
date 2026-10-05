// Career rules: data integrity, full runs, saves, training and growth, elements, world, pools, evaluations, rankings, challenges.
const fs = require('fs');
const path = require('path');
const { load, test, assert, eq, playRun } = require('./harness');

test('data: skills, unlocks and calendar are well-formed', () => {
  const g = load(1);
  assert(typeof g.EVENTS === 'undefined', 'the random training events are gone');
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

test('career: week steps are ordered lists of functions (T-202)', () => {
  const g = load(5);
  eq(g.WEEK_END.length, 6, 'six week-end steps');
  eq(g.WEEK_START.length, 6, 'six week-start steps');
  assert(
    [...g.WEEK_END, ...g.WEEK_START].every(f => typeof f === 'function'),
    'every step is a function'
  );
});

test('career: diary lines carry their producer tag (T-203)', () => {
  const g = load(5),
    run = g.Run.create(g.Run.draft(), { role: 'MB', name: 'Tagger', alloc: { power: 10, def: 20, speed: 10, jump: 20 }, witSteps: 0 });
  g.Run.log(run, 'A sponsor pulled out.', 'bad');
  eq(run.log[0].k, 'bad', 'tag stored');
  g.Run.log(run, 'A plain line.');
  assert(!('k' in run.log[0]), 'untagged lines keep the old shape');
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
  assert(!('lb' in run) && g.RUN_VERSION === 18, 'no Limit Break progress in the run; RUN_VERSION 18');
  run.uses.power = 26;
  eq(g.Training.facility(run, 'power'), 4, 'Lv 5 after 26 sessions');
  const n = g.Training.preview(run, 'power', false).main[2],
    h = g.Training.preview(run, 'power', true);
  assert(h.main[2] > n && h.sta === 2 * g.Training.preview(run, 'power', false).sta, 'Hard: more gain, double stamina');
});

test('career: the Academy Gym — a fixed Lv 1, a little EXP to every stat (T-183)', () => {
  const g = load(11),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Gym' }),
    you = g.Run.you(run);
  run.uses.all = 40;
  eq(g.Training.facility(run, 'all'), 0, 'Lv 1 however often it is used');
  eq(g.Training.toNext(run, 'all'), null, 'never levels up');
  assert(!g.TRAINK.includes('all'), 'teammates never drill there');
  const pv = g.Training.preview(run, 'all', false),
    rows = [pv.main, pv.side, ...pv.more];
  eq(
    rows
      .map(r => r[0])
      .sort()
      .join(','),
    'def,jump,power,speed,wit',
    'every stat'
  );
  const power = g.Training.preview(run, 'power', false);
  assert(rows.every(r => r[2] > 0) && pv.main[2] < power.main[2] / 2, 'a little EXP each: well under the Power gym on Power');
  run.sta = 100;
  const xp0 = { ...(run.xp || {}) };
  g.Training.train(run, 'all');
  assert(
    ['power', 'def', 'speed', 'jump', 'wit'].every(k => (run.xp[k] || 0) !== (xp0[k] || 0) || you[k] > 1),
    'a session moves every stat'
  );
  eq(g.City.dayWhat('acaGym').label, 'All-round', 'the day track names it');
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
  assert(you.power > 75 && /^✸\+\d+/.test(label), `a stat at 75 rises from match XP (${you.power})`);
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
  g.Training.tally = {}; // the result card's XP count (resultSnap → resultData)
  assert(/XP: /.test(fx2.onFinish(m2)), 'the result line shows the XP labels');
  const f = g.Growth.matchGap(m2);
  eq(g.Training.tally.power, Math.round(5 * g.MATCH_XP.per.k.power * f), 'the tally counts the power XP of 5 kills');
  eq(g.Training.tally.jump, Math.round(g.MATCH_XP.per.blk.jump * f), 'and the jump XP of a block');
  g.Training.tally = null;
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
    fc = g.Fight.challenge(run, ti, stake),
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
  const tg = g.Hex.target(run, 'wei', 'wu');
  run.clash = { tile: tg.id, from: tg.from, att: 'wei', def: 'wu', seen: false, done: false };
  const fs = g.Fight.clash(run, 'wei'),
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
  const tg = g.Hex.target(run, 'wei', 'wu');
  run.clash = { tile: tg.id, from: tg.from, att: 'wei', def: 'wu', seen: false, done: false };
  const side = 'wei',
    fx = g.Fight.clash(run, side),
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
  const W = (r, stake) => g.Fight.worth(run, club(r), stake);
  eq(W('gloria', 500).verdict, 'refuses', 'Gloria refuses anyone outside the Top 20, whatever the stake');
  eq(W('outlaws', 0).verdict, 'refuses', 'the Outlaws laugh off a 0 stake');
  eq(W('outlaws', g.CHALLENGE.outlaws.minStake).verdict, 'likely', 'and accept a bet');
  assert(W('wei', 1000).worth > W('wei', 0).worth, 'Wei: money talks');
  eq(W('wu', 0).worth, W('wu', 1000).worth, 'Wu: the stake counts for nothing');
  const own = run.team;
  run.team = club('wei');
  eq(g.Fight.worth(run, club('wei'), 0), null, 'your own club is not challengeable');
  run.team = own;
  // a refusal costs the trip + a day and blocks that club for the week
  const d0 = run.days,
    r0 = g.Fight.offer(run, club('gloria'), 100);
  assert(r0 && !r0.accepted && /turned your challenge down/.test(r0.line) && run.days < d0, `refused: ${r0 && r0.line}`);
  assert(run.refused[club('gloria')].week === run.week && run.refused[club('gloria')].n === 1, 'the refusal is recorded');
  eq(W('gloria', 100).why, g.CHALLENGE_WHY.week, 'not again this week');
  run.days = g.WEEK_DAYS;
  for (let i = 2; i <= g.CHALLENGE.refuseMax; i++) {
    run.week++;
    run.days = g.WEEK_DAYS;
    g.Fight.offer(run, club('gloria'), 100);
  }
  assert(g.City.rep(run, 'gloria') <= g.CHALLENGE.pest, 'refused 3 times: you are a pest (standing drops)');
  run.days = g.WEEK_DAYS;
  run.week = 4;
  // accepted: a real match; a win pays the stake at odds (the club's players are weakened, yours strengthened, so it is won)
  const ti = club('outlaws');
  for (const p of g.squadOf(run.teams[ti])) for (const k of g.STATK) p[k] = 25;
  for (const p of g.squadOf(run.pickup)) for (const k of g.STATK) p[k] = 99;
  const acc = g.Fight.offer(run, ti, 50);
  assert(acc && acc.accepted && acc.stake === 50, 'the Outlaws accept a 50 stake');
  const d1 = run.days,
    money0 = run.money,
    fx = g.Fight.challenge(run, ti, 50),
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
  const T = g.Fight.hired(run);
  assert(g.squadOf(T).length === 6 && T.P.includes(you) && T.P.length === 4, 'the hired crew: 6 players, you on court');
  const side = g.Fight.challengeSide(run);
  eq(side.kind, 'hired', 'alone = hired crew');
  run.days = g.WEEK_DAYS;
  run.week = 6;
  const m1 = run.money,
    fx1 = g.Fight.challenge(run, ti, 50),
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
      const fx = g.Fight.challenge(run, ti, stake),
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
  const R0 = g.Fight.injuryRisk(run, 60);
  assert(g.Fight.injuryRisk(run, 99) > R0, 'risk rises with their rating');
  assert(g.Fight.injuryRisk(run, 60, 10) > R0, 'and the margin of defeat');
  run.sta = 20;
  assert(g.Fight.injuryRisk(run, 60) > R0, 'and low stamina');
  fresh();
  run.lastFight = g.Run.dayNo(run);
  assert(g.Fight.injuryRisk(run, 60) > R0, 'and fighting on the same day');
  eq(g.Fight.injuryRisk(run, 999, 99), g.INJURY.max, 'clamped at INJURY.max');
  // forced low: a severe injury — 3 weeks and −2 on one stat
  fresh();
  for (const k of g.STATK) you[k] = 60;
  const before = g.STATK.map(k => you[k]);
  let n = 0;
  g.RNG.next = () => (n++ ? 0.97 : 0.0);
  const txt = g.Fight.injure(run, 0.5);
  assert(run.injury && run.injury.weeks === g.INJURY.weeks.severe && /severe/.test(txt), `severe: ${txt}`);
  const lost = g.STATK.filter((k, i) => you[k] < before[i]);
  assert(lost.length === 1 && before[g.STATK.indexOf(lost[0])] - you[lost[0]] === g.INJURY.lose, 'one stat loses INJURY.lose for good');
  // an injured player can't challenge or fight and is benched by Run.lineup
  roll(0.99);
  eq(g.Fight.ban(run), 'Injured — rest first', 'the ban text');
  eq(g.Fight.offer(run, ti, 50), null, 'no challenge while injured');
  eq(g.Fight.challenge(run, ti, 50), null, 'no challenge match while injured');
  const L = g.Run.lineup(run, run.pickup, null, true);
  assert(!L.starts, 'an injured you is benched');
  // the physio clears the weeks but not the stat
  run.sp = 99;
  assert(g.Training.physio(run) && !run.injury, 'physio heals the injury');
  assert(you[lost[0]] === before[g.STATK.indexOf(lost[0])] - g.INJURY.lose, 'but not the lost stat');
  eq(g.RUN_VERSION, 18, 'save v18');
});

test('career: rules moved out of the UI (T-075)', () => {
  const g = load(31),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Rules', mode: { story: true } });
  run.event = null;
  // no random training events any more (owner, 2026-10-05): a stale one from an old save clears on load
  assert(!g.City.after && !g.Events.roll, 'no week event roll');
  eq(g.Events.def({ id: 'late' }, run), null, 'an old random event has no card');
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
  // Dossier.summary / standingLabel
  run.rep = { wei: 40, wu: -5 };
  g.Hex.flip(run, g.Hex.ofSpot('weiSpeed').id, 'wu');
  const W = g.Dossier.summary(run, 'wei'),
    U = g.Dossier.summary(run, 'wu');
  eq(W.label, 'Trusted', 'standing label');
  eq(U.label, 'Wary', 'standing label (negative)');
  assert(
    W.lost.some(x => x.id === 'weiSpeed'),
    'Wei lost the place on that tile (the training district may share it)'
  );
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

// ---------- T-087: coverage gaps ----------
const mkRunG = seed => {
  const g = load(seed);
  return [g, g.Run.create(g.Run.draft(), { role: 'WS', name: 'Cov', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 })];
};

test('story: the intro plays on a new Story run, applies its walk, never replays; Endless and old saves skip it (T-173)', () => {
  const [g, run] = mkRunG(873);
  assert(run.story.cur && run.story.cur.id === 'intro', 'a new Story run starts in the intro');
  eq(g.Story.step(run).k, 'say', 'the first shown step is the 15–4 diary line — no big scoreboard (owner, 2026-10-05; the dark cut is applied)');
  assert(run.story.cur.mode.dark, 'dark cold open');
  const home = g.City.at(run, 'home');
  let n = 0;
  while (run.story.cur && n++ < 50) g.Story.next(run);
  assert(!run.story.cur && run.story.seen.intro, 'the scene ends and is marked seen');
  eq(JSON.stringify(run.pos), JSON.stringify(home.map(Math.round)), 'the walk leaves you at your first home');
  eq(run.days, g.WEEK_DAYS, 'the walk home costs no days');
  assert(!g.Story.fire(run, 'start'), 'never replays');
  const end = g.Run.create(g.Run.draft(), { role: 'WS', name: 'E', mode: { story: false } });
  assert(!end.story.cur, 'Endless: no scenes');
  const old = { ...run };
  delete old.story;
  g.Run.repair(old);
  assert(old.story.seen.intro && !old.story.cur, 'a run saved before scenes skips the intro');
  const [g2, run2] = mkRunG(874);
  g2.Story.skip(run2);
  assert(
    !run2.story.cur && JSON.stringify(run2.pos) === JSON.stringify(g2.City.at(run2, 'home').map(Math.round)),
    'skip still walks you home'
  );
});

test('story: the result hook — the first hub after your match plays its scene, before any lesson (T-175)', () => {
  const [g, run] = mkRunG(877);
  g.Story.skip(run);
  delete run.story.meet; // (the squad's introductions: their own test)
  g.SCENES.zWon = { trigger: { on: 'result', when: 'won' }, steps: [{ k: 'say', who: 'diary', text: 'Won.' }, { k: 'end' }] };
  g.SCENES.zAny = { trigger: { on: 'result' }, steps: [{ k: 'say', who: 'diary', text: 'Played.' }, { k: 'end' }] };
  run.uses.power = 1; // a lesson is due too
  run.dayLog.push({ k: 'train' });
  assert(!g.Story.due(run, 'result'), 'nothing without a match');
  const T = g.mkTeams(),
    m = g.simMatch(T[0], T[1]);
  g.Cup.record(run, m, 'eval');
  assert(run.story.res && run.story.res.kind === 'eval', 'Cup.record marks the match');
  run.story.res.win = false;
  assert(g.Story.hub(run) && run.story.cur.id === 'zAny', 'a lost match: the any-result scene, ahead of the lesson');
  assert(!run.story.res, 'the moment passes with the first hub');
  g.Story.skip(run);
  g.Story.matched(run, 'cup', true, true);
  run.dayLog.push({ k: 'rest' });
  assert(g.Story.hub(run) && run.story.cur.id === 'zWon', 'a won match: its scene');
  g.Story.skip(run);
  run.dayLog.push({ k: 'rest' });
  assert(g.Story.hub(run) && run.story.cur.id === 'tutGym', 'then the lesson on a later hub');
  g.Story.skip(run);
  g.Story.matched(run, 'cup', true, true);
  run.dayLog.push({ k: 'rest' });
  g.Story.hub(run);
  assert(!run.story.res && (!run.story.cur || !run.story.cur.id.startsWith('z')), 'each scene once; the unused moment is dropped');
  delete g.SCENES.zWon;
  delete g.SCENES.zAny;
});

test('story: a new squad introduces itself — the Academy squad at the start, every club you join (owner, 2026-10-05)', () => {
  const [g, run] = mkRunG(880);
  g.Story.skip(run);
  assert(g.Story.hub(run) && run.story.cur.id === 'meet:academy', 'after the intro: the Academy squad');
  const T = g.Run.myTeam(run),
    mates = g.squadOf(T).filter(p => p !== g.Run.you(run)),
    says = g.Story.steps(run.story.cur).filter(s => s.k === 'say' && s.who !== 'diary');
  eq(says.length, mates.length, 'one line per teammate');
  eq(says[0].who, T.cap.id, 'the captain first');
  assert(
    says.every(s => g.Story.who(run, s.who).kind === 'person' && /^(Setter|Middle blocker|Wing spiker)/.test(s.text)),
    'role first, a portrait each'
  );
  g.Story.skip(run);
  assert(!g.Story.hub(run) || !run.story.cur.id.startsWith('meet:'), 'once');
  if (run.story.cur) g.Story.skip(run);
  const ti = run.teams.findIndex((t, i) => g.World.canJoin(run, i).ok);
  assert(ti >= 0 && g.World.join(run, ti), 'joined a club');
  assert(g.Story.hub(run) && run.story.cur.id === `meet:${ti}`, 'the new club introduces itself');
  assert(/New shirt/.test(g.Story.step(run).text), 'the club opening line');
  const end = g.Run.create(g.Run.draft(), { role: 'WS', name: 'E', mode: { story: false } });
  assert(!g.Story.hub(end), 'Endless: no scenes');
});

test("story: Kaede's lessons come the first time you click that kind of place (owner, 2026-10-05)", () => {
  const [g, run] = mkRunG(878);
  g.Story.skip(run);
  run.week = 6;
  run.dayLog.push({ k: 'rest' });
  for (const id of ['tutClash', 'tutFactions', 'tutHouse', 'tutEval']) assert(g.SCENES[id].trigger.on === 'pick', id + ' is a pick lesson');
  assert(!g.Story.hub(run) || !/^tut(Clash|Factions|House|Eval)$/.test(run.story.cur.id), 'no click lesson from the hub');
  if (run.story.cur) g.Story.skip(run);
  const pick = (id, want) => {
    assert(g.Story.pick(run, id) && run.story.cur.id === want, `${id} → ${want}`);
    g.Story.skip(run);
    assert(!g.Story.pick(run, id), `${id}: once only`);
  };
  pick('venue:hall', 'tutEval');
  pick('pt:400,500', 'tutFactions');
  assert(!g.Story.pick(run, 'hq1'), 'an HQ after a tile: the faction lesson was already given');
  pick('home', 'tutHouse');
  pick('clash', 'tutClash');
  assert(!g.Story.pick(run, 'acaGym'), 'a gym is not a click lesson');
  const [g2, r2] = mkRunG(879);
  while (r2.story.cur) g2.Story.next(r2, g2.Story.step(r2).k === 'choice' && /figure/.test(JSON.stringify(g2.Story.step(r2).opts)) ? 1 : 0);
  assert(!g2.Story.pick(r2, 'hq0'), '"figure it out" → no lessons');
});

test('story: Kaede — met in the intro, on the map, lessons once at their moment, none after "figure it out" (T-187, T-188)', () => {
  const [g, run] = mkRunG(875);
  let n = 0;
  while (run.story.cur && n++ < 80) g.Story.next(run, 0);
  assert(!run.story.cur && run.story.seen.intro, 'intro done');
  const lines = g.SCENES.intro.steps.filter(s => s.who === 'senior');
  assert(lines.length >= 5 && /Kaede/.test(lines.map(s => s.text).join(' ')), 'she introduces herself by name');
  const W = g.Story.who(run, 'senior');
  assert(W.kind === 'person' && W.name === 'Kaede' && W.person.look, 'a person with a portrait');
  const M = g.MapModel.build(run);
  const K = M.figures.find(f => f.id === 'senior');
  assert(K && Math.hypot(K.at[0] - g.HOME_AT.studio[0], K.at[1] - g.HOME_AT.studio[1]) < 20, 'she stands by the student flat');
  assert(!g.Story.fire(run, 'hub'), 'no lesson straight after the intro (one scene per day)');
  run.uses.power = 1;
  run.dayLog.push({ k: 'train' });
  assert(g.Story.fire(run, 'hub') && run.story.cur.id === 'tutGym', 'the gym lesson after the first session');
  assert(
    /wing spiker lives on Power/.test(g.Story.text(run, g.Story.step(run).text) + g.Story.text(run, g.SCENES.tutGym.steps[1].text)),
    '{role} / {key} filled in'
  );
  g.Story.skip(run);
  run.dayLog.push({ k: 'rest' });
  assert(!g.Story.fire(run, 'hub') || run.story.cur.id !== 'tutGym', 'never twice');
  const [g2, r2] = mkRunG(876);
  while (r2.story.cur) g2.Story.next(r2, g2.Story.step(r2).k === 'choice' && /figure/.test(JSON.stringify(g2.Story.step(r2).opts)) ? 1 : 0);
  assert(r2.story.flags.noTour, '"I\'ll figure it out myself" sets noTour');
  r2.uses.power = 1;
  r2.week = 6;
  r2.dayLog.push({ k: 'train' });
  assert(!g2.Story.fire(r2, 'hub') || !r2.story.cur.id.startsWith('tut'), 'and no lesson ever fires (story scenes still do)');
  const end = g.Run.create(g.Run.draft(), { role: 'WS', name: 'E', mode: { story: false } });
  assert(!g.MapModel.build(end).figures.some(f => f.id === 'senior'), 'Endless: no guide on the map');
});

test('story: week 1 keeps to the campus (Kaede points at the Academy Gym); week 2 pulls back and lets you explore (T-192)', () => {
  const [g, run] = mkRunG(878);
  let n = 0;
  while (run.story.cur && n++ < 80) g.Story.next(run, 0);
  assert(run.story.flags.campus && g.SCENES.intro.after.spot === 'acaGym', 'the intro points at the gym and fences week 1');
  assert(
    g.SCENES.intro.steps.some(s => s.k === 'cam' && s.to === 'acaGym'),
    'the camera goes to the gym'
  );
  const w = g.City.can(run, 'weiPower');
  assert(!w.ok && /campus/.test(w.why), 'a Wei gym is off limits in week 1');
  assert(g.City.can(run, 'acaGym').ok && g.City.can(run, 'park').ok, 'the campus is open');
  eq(g.City.travelTo(run, g.SPOTS.harbor.at), '', 'no travelling off campus');
  assert(/campus/.test(g.Fight.ban(run)), 'no battles or challenges');
  assert(g.MapModel.build(run).fence, 'the map keeps the camera on the campus');
  run.week = 2;
  run.dayLog = [];
  assert(g.City.can(run, 'weiPower').ok && !g.MapModel.build(run).fence, 'week 2: the island is open');
  assert(g.Story.fire(run, 'hub') && run.story.cur.id === 'explore', 'Kaede sends you exploring first');
  assert(g.Story.step(run).k === 'cam' && g.Story.step(run).to === 'island', 'the camera pulls back over the island');
  const end = g.Run.create(g.Run.draft(), { role: 'WS', name: 'E', mode: { story: false } });
  assert(g.City.can(end, 'weiPower').ok, 'Endless: no fence');
});

test('stars: the rival, the cohort and the first aces — seated, on curves, never moved, on the map (T-189, T-190)', () => {
  const [g, run] = mkRunG(877);
  const S = g.Stars.all(run),
    by = k => g.Stars.get(run, k);
  eq(S.length, 7, 'rival + 3 cohort + 3 first aces');
  eq(by('rival').team, run.teams[0], 'the rival plays for Wei Gold');
  for (const s of g.STARS.cohort) eq(by(s.key).team, run.teams[s.club], `${s.key} on their club`);
  for (const [ci, role] of g.STARS.aces.clubs) {
    const p = by(`ace-${g.FACTIONS[ci].region}`);
    assert(p && p.team === run.teams[ci] && p.role === role, `the ${g.FACTIONS[ci].region} ace`);
  }
  assert(
    Math.abs(g.ovr(by('rival')) - 76) <= 1 && S.every(p => run.people[p.id].want === 'national'),
    'week-1 OVR on the curve; all want the national team'
  );
  const leagueMax = Math.max(
    ...run.teams
      .flatMap(t => g.squadOf(t))
      .filter(p => !p.named && p !== g.Run.you(run))
      .map(g.ovr)
  );
  assert(g.ovr(by('rival')) > leagueMax, 'the rival starts far above the league');
  run.week = 28;
  g.Stars.week(run);
  assert(Math.abs(g.ovr(by('rival')) - 90) <= 1 && !by('rival').op, 'the rival reaches ~90 by the Cup, not OP');
  assert(
    ['ace-wei', 'ace-wu', 'ace-shu'].every(k => by(k).op && g.ovr(by(k)) >= 94),
    'the first aces peak OP'
  );
  for (let i = 0; i < 12; i++) g.World.transfers(run);
  g.World.promote(run);
  assert(g.Stars.all(run).length === 7 && g.Stars.all(run).every(p => run.teams[p.team.i] === p.team), 'nobody transfers or demotes them');
  const F = g.MapModel.build(run).figures;
  assert(
    S.every(p => F.some(f => f.id === p.id && Math.hypot(f.at[0] - g.CITY.hq[p.team.i][0], f.at[1] - g.CITY.hq[p.team.i][1]) < 25)),
    'each drawn by their HQ'
  );
  eq(F.find(f => f.id === by('rival').id).tag, 'Rival', 'tagged');
  eq(g.Story.who(run, 'rival').name, 'Tachibana Sae', 'the rival speaks in scenes');
});

test("no coach's goal (spec §10.1b, T-170): a run never gets one, through week ends and new weeks", () => {
  const [g, run] = mkRunG(871);
  assert(!('goal' in run) && typeof g.Goals === 'undefined', 'no goal at the start, no Goals module');
  for (let i = 0; i < 3; i++) {
    run.event = null;
    g.Run.endWeek(run);
  }
  assert(!run.goal && !run.log.some(l => /Coach's goal|Goal (reached|missed)/.test(l.t)), 'no goal set, checked or logged');
});

test('sponsors: offers at fan milestones, perks, mood / training / win / grade conditions', () => {
  const [g, run] = mkRunG(872);
  run.fans = g.SPONSOR_AT[0] - 1;
  g.Sponsors.offer(run);
  assert(!run.event, 'no offer below the milestone');
  run.fans = g.SPONSOR_AT[0];
  g.Sponsors.offer(run);
  assert(
    run.event && run.event.id === 'sponsor' && run.event.pre && run.event.opts.length === 2 && run.sponsorN === 1,
    'an offer of two sponsors at the milestone'
  );
  const ids = Object.keys(g.SPONSORS);
  const byKind = k => ids.find(id => g.SPONSORS[id].kind === k);
  // a win sponsor: kept after a win, lost after a loss
  for (const [win, state] of [
    [true, 'kept'],
    [false, 'lost']
  ]) {
    run.sponsors = [];
    g.Sponsors.sign(run, byKind('win'));
    g.Sponsors.match(run, win, 'C');
    eq(run.sponsors[0].state, state, `win sponsor after ${win ? 'a win' : 'a loss'}`);
  }
  // a grade sponsor wants S or A
  run.sponsors = [];
  g.Sponsors.sign(run, byKind('grade'));
  g.Sponsors.match(run, true, 'B');
  eq(run.sponsors[0].state, 'lost', 'grade B is not enough');
  // a mood sponsor is lost the week mood is below 2
  run.sponsors = [];
  g.Sponsors.sign(run, byKind('mood'));
  run.mood = 1;
  g.Sponsors.tick(run);
  eq(run.sponsors[0].state, 'lost', 'mood sponsor pulls out');
  assert(!g.Sponsors.active(run, run.sponsors[0].id), 'a lost sponsor is not active');
  // Aqua: stamina cap while it lasts and back when it goes
  if (g.SPONSORS.aqua) {
    run.sponsors = [];
    const max0 = run.staMax;
    g.Sponsors.sign(run, 'aqua');
    eq(run.staMax, max0 + 15, 'Aqua raises the stamina cap');
    g.Sponsors.lose(run, run.sponsors[0]);
    eq(run.staMax, max0, 'and takes it back');
  }
});

test('storage: every access survives a throwing localStorage; corrupt JSON falls back; Run.load / save do not throw', () => {
  const [g, run] = mkRunG(873);
  g.store.set('k', 'v');
  eq(g.store.get('k'), 'v', 'round-trip');
  g.store.setJSON('j', { a: [1, 2] });
  eq(JSON.stringify(g.store.getJSON('j')), '{"a":[1,2]}', 'JSON round-trip');
  g.store.set('bad', '{nope');
  eq(g.store.getJSON('bad', 'fb'), 'fb', 'corrupt JSON → fallback');
  eq(g.store.get('missing', 'dflt'), 'dflt', 'missing → fallback');
  const ls = g.__ls,
    orig = { ...ls },
    boom = () => {
      throw new Error('SecurityError');
    };
  try {
    ls.getItem = ls.setItem = ls.removeItem = boom;
    eq(g.store.get('k', 'fb'), 'fb', 'get falls back');
    g.store.set('k', 1);
    g.store.setJSON('k', {});
    g.store.remove('k');
    eq(g.store.getJSON('k', 7), 7, 'getJSON falls back');
    g.Run.save(run);
    eq(g.Run.load(), null, 'no saved run readable');
    g.Run.clear();
  } finally {
    Object.assign(ls, orig);
  }
  g.Run.save(run);
  assert(g.Run.load(), 'storage back: the run saves and loads again');
});

test('saves: a newer, unversioned or corrupt save is refused; the current one loads and repairs a stripped run', () => {
  const [g, run] = mkRunG(874);
  g.Run.save(run);
  const raw = JSON.parse(g.__mem[g.KEYS.career]);
  const put = o => (g.__mem[g.KEYS.career] = typeof o === 'string' ? o : JSON.stringify(o));
  put({ ...raw, v: g.RUN_VERSION + 1 });
  eq(g.Run.load(), null, 'a save from a newer version is refused (not downgraded)');
  put({ ...raw, v: '15' });
  eq(g.Run.load(), null, 'a non-numeric version is refused');
  const noV = { ...raw };
  delete noV.v;
  put(noV);
  eq(g.Run.load(), null, 'no version → refused');
  put('{"v": 15, "teams": [');
  eq(g.Run.load(), null, 'truncated JSON → refused');
  put({ ...raw, youId: 'nobody' });
  eq(g.Run.load(), null, 'a save whose player is missing is refused');
  const stripped = { ...raw };
  for (const k of ['grades', 'evals', 'mem', 'asks', 'news', 'mlog']) delete stripped[k];
  put(stripped);
  const back = g.Run.load();
  assert(
    back && Array.isArray(back.grades) && Array.isArray(back.evals) && Array.isArray(back.asks),
    'a current save missing fields loads and is repaired'
  );
  eq(back.week, run.week, 'same week');
});

// ---------- T-118: the week's day track ----------
test('career: day track — a trip then the training day, cleared at the week start', () => {
  const g = load(21),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Days', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  eq(JSON.stringify(run.dayLog), '[]', 'a new run starts with an empty track');
  const far = Object.keys(g.SPOTS).find(id => g.SPOTS[id].train && g.City.trip(run, g.City.at(run, id)) === 1 && g.City.can(run, id).ok);
  assert(far, 'a training place one trip day away');
  g.City.day(run, far, false);
  eq(run.dayLog.map(e => e.k).join(','), 'trip,train', 'trip first, then the training day');
  eq(run.dayLog[1].stat, g.TRAININGS[g.SPOTS[far].train].main[0], 'the day names the stat trained');
  eq(g.WEEK_DAYS - g.City.days(run), run.dayLog.length, 'one entry per day spent');
  g.Run.endWeek(run);
  eq(run.dayLog.length, 0, 'a new week starts empty');
});

// ---- Glossary (T-110, spec §9.4 / §9.6) ----
test('glossary: every §9.6 id exists with icon, short and long; every term( id used in js/ui is defined', () => {
  const g = load(1);
  for (const id of [
    'sp',
    'fans',
    'sta',
    'day',
    'money',
    'mood',
    'bond',
    'standing',
    'grade',
    'seize',
    'border',
    'sim',
    'academy',
    'cup',
    'trial',
    'together',
    'rewards'
  ])
    assert(g.GLOSSARY[id], 'missing ' + id);
  for (const [id, t] of Object.entries(g.GLOSSARY))
    assert(t.icon && t.short && t.long && !/undefined|NaN/.test(t.long), 'incomplete ' + id);
  const dir = path.join(__dirname, '..', 'js/ui');
  for (const f of fs.readdirSync(dir).filter(f => /\.m?js$/.test(f)))
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\bterm\(\s*'([a-z]+)'/g))
      assert(g.GLOSSARY[m[1]], `${f}: term('${m[1]}') not in GLOSSARY`);
});

test('code: every top-level classic-script name is used somewhere else (no dead globals)', () => {
  const root = path.join(__dirname, '..');
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const walk = d =>
    fs
      .readdirSync(path.join(root, d), { withFileTypes: true })
      .flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.m?js$/.test(e.name) ? [`${d}/${e.name}`] : []));
  // names that may legitimately have no other reference: name → why (inline onclick="…" handlers in js/ strings
  // and index.html already count as references, so they need no entry)
  const ALLOW = {};
  const scripts = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  // comments are stripped, so a name mentioned only in a comment still counts as dead
  const text = [...walk('js'), ...walk('tests'), 'index.html', 'qa_poses.html']
    .map(f =>
      read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1')
    )
    .join('\n');
  const dead = [];
  for (const s of scripts)
    for (const [, n] of read(s).matchAll(/^(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (n in ALLOW) continue;
      const uses = text.match(new RegExp(`(?<![\\w$])${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')).length;
      if (uses < 2) dead.push(`${n} (${s})`);
    }
  eq(dead.join(', '), '', 'defined but never referenced');
});
