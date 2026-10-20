// The faction war (spec §4.34): war units and Strength (T-313), stages in the match (T-314), the overthrow (T-315),
// call-ups (T-316).
const { load, test, assert, eq } = require('./harness');

const mkRun = (seed, name = 'War') => {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name });
  run.event = null;
  return [g, run];
};
/** Set this week's battle to att raiding def on their border (Front.site). */
const clashOn = (g, run, att, def) => {
  const t = g.Front.site(run, att, def);
  run.clash = { tile: t.tile, from: t.from, at: t.at, ua: t.ua, ud: t.ud, att, def, seen: false, done: false };
  return t;
};

test('war: units and Strength — battles move it, Shu soaks half, Gold untouched while Iron stands, 30 weeks in 0–100 (T-313)', () => {
  const [g, run] = mkRun(31);
  for (const u of g.War.ids()) eq(g.War.str(run, u), 100, 'start at 100: ' + u);
  eq(g.War.pairs(run, 'wu', 'wei').filter(([, d]) => d === 'gold').length, 0, 'Gold has no border while Iron stands');
  // the same results: a lost battle costs Iron 8, Shu half that
  clashOn(g, run, 'wu', 'wei');
  const line = g.Front.result(run, 'wu', 'wei');
  eq(g.War.str(run, 'iron'), 100 - g.WAR.lose, 'Iron −lose');
  assert(line.includes(`Wei Iron Strength 100 → ${100 - g.WAR.lose}`), 'the line names it: ' + line);
  clashOn(g, run, 'wu', 'shu');
  g.Front.result(run, 'wu', 'shu');
  const lostIron = 100 - g.War.str(run, 'iron'),
    lostShu = 100 - g.War.str(run, 'shu');
  assert(lostShu > 0 && lostShu <= lostIron / 2, `Shu loses ≤ half (${lostShu} vs ${lostIron})`);
  eq(g.War.hit(run, 'harbor', true), 0, 'a win at 100 stays 100');
  // 30 weeks, a battle every week, settled at the week's end: always within 0–100, Gold untouched while Iron stands
  const [h, r2] = mkRun(32),
    lo = {},
    hi = {};
  let fought = 0;
  for (let w = 0; w < 30; w++) {
    r2.week = w + 1;
    const P = h.Front.pick(r2),
      t = P && h.Front.site(r2, P.att, P.def);
    if (t) {
      r2.clash = { tile: t.tile, from: t.from, at: t.at, ua: t.ua, ud: t.ud, att: P.att, def: P.def, done: false };
      assert((r2.war.fallen && r2.war.fallen.iron) || ![t.ua, t.ud].includes('gold'), 'Gold never on the street while Iron stands');
      h.Fight.clashEnd(r2);
      fought++;
    }
    h.War.week(r2);
    for (const u of h.War.ids()) {
      const s = h.War.str(r2, u);
      if (u === 'gold' && r2.war.fallen && r2.war.fallen.iron) continue; // (Iron fell: Gold has a border now)
      lo[u] = Math.min(lo[u] ?? 100, s);
      hi[u] = Math.max(hi[u] ?? 0, s);
    }
  }
  assert(fought >= 25, 'battles fought: ' + fought);
  for (const u of h.War.ids()) assert(lo[u] >= 0 && hi[u] <= 100, `${u} in 0–100 (${lo[u]}–${hi[u]})`);
  eq(lo.gold, 100, 'Gold untouched');
  assert(lo.iron < 100, 'Iron wore down: ' + lo.iron);
});

test('war: Strength drives the economy — prices, quality, joins, street strength; previews change nothing (T-313)', () => {
  const [g, run] = mkRun(33),
    ti = g.WAR.units.iron.clubs[0],
    o0 = g.World.joinReq(run, ti).ovr,
    p0 = g.City.price(run, 'weiPower');
  for (const r of g.MAJORS) assert(g.Front.priceMul(run, r) === 1 && g.Front.qMul(run, r) === 1, 'even at 100: ' + r);
  clashOn(g, run, 'wu', 'wei');
  const pre = JSON.stringify(run.war),
    k = g.Front.stakes(run, 'wu', 'wei');
  eq(JSON.stringify(run.war), pre, 'stakes() changes nothing');
  assert(k.unit === 'iron' && k.str === 100 && k.after === 100 - g.WAR.lose && !k.seize && !k.place, 'the preview: Iron 100 → 100 − lose');
  run.war.str.iron = 50;
  eq(g.War.stage(run, 'iron'), 1, 'under 60: Strained');
  eq(g.World.joinReq(run, ti).ovr, o0 - g.FRONT.join, 'a Strained club asks less');
  assert(g.Front.priceMul(run, 'wei') > 1 && g.Front.qMul(run, 'wei') < 1 && g.City.price(run, 'weiPower') > p0, 'dearer, poorer');
  assert(g.Front.strength(run, 'iron') < g.Front.strength(run, 'harbor'), 'weaker on the street');
  eq(g.Front.owner(run, 'weiPower'), 'wei', 'no place changes hands');
  const d = g.Dossier.build(run, 'wei');
  assert(
    d.state === 'pressed' && d.fronts.length === 2 && d.fronts[0].unit === 'iron' && d.fronts[0].str === 50,
    'the dossier shows the units'
  );
  eq(g.Dossier.summary(run, 'gloria').fronts.length, 0, 'minors are not in the war');
  // saved with the run
  g.Run.save(run);
  eq(g.Run.load().war.str.iron, 50, 'run.war round-trips');
  assert(!('hex' in g.Run.defaults()), 'run.hex is gone');
});

test('war: stages in the match — Iron bleeds into Gold one lighter, Shu one late; the battle’s crews carry them (T-314)', () => {
  const [g, run] = mkRun(34);
  run.war.str.iron = 35; // Shaken
  eq(g.War.weak(run, 'iron'), 2, 'Iron plays Shaken');
  eq(g.War.weak(run, 'gold'), 1, 'Gold plays Strained (one lighter)');
  run.war.str.iron = 20; // Broken
  eq(g.War.weak(run, 'gold'), 2, 'Iron Broken → Gold Shaken');
  run.war.str.gold = 20;
  eq(g.War.weak(run, 'gold'), 3, 'Gold’s own stage when worse');
  run.war.str.shu = 35;
  eq(g.War.weak(run, 'shu'), 1, 'Shu Shaken plays as Strained');
  run.war.str.shu = 20;
  eq(g.War.weak(run, 'shu'), 2, 'Shu Broken plays as Shaken');
  eq(g.War.weakOf(run, run.teams[g.WAR.units.iron.clubs[0]]), 3, 'a club squad: its unit');
  eq(g.War.weakOf(run, run.pickup), 0, 'the Academy: none');
  // a street battle you fight on the Iron border: your Wu crew Steady, their Iron crew Broken
  run.days = 7;
  run.pos = g.CITY.airport.slice();
  run.war.str.gold = 100;
  clashOn(g, run, 'wu', 'wei');
  const fx = g.Fight.clash(run, 'wu'),
    m = g.newMatch(fx.a, fx.b, false);
  fx.setup(m);
  eq(JSON.stringify(m.weak), '[0,3]', 'the fixture’s setup sets both sides’ stages');
  eq(g.cardSlots(m, 1).length, 4, 'their crew: 4 slots');
  fx.onLeave();
});

/** Sign you with club ti (no conditions: the test's shortcut). */
const sign = (g, run, ti) => {
  const you = g.Run.you(run),
    T = run.teams[ti],
    old = T.P.find(p => p.role === you.role) || T.P[3];
  g.World.swap(you, old);
  run.team = ti;
  g.finalizeTeam(T);
  g.finalizeTeam(run.pickup);
};

test('war: a destroyed unit — its land and places to the winner, Gold’s border opens, the Cup places move, the other half stays (T-315)', () => {
  const [g, run] = mkRun(35),
    N0 = g.Cup.places(run),
    fort0 = g.War.str(run, 'fort');
  eq(JSON.stringify(N0), JSON.stringify({ wei: 4, wu: 3, shu: 2 }), 'every major sends its pool’s squads');
  g.War.destroy(run, 'iron', 'harbor');
  assert(g.War.fallen(run, 'iron') && g.War.holder(run, 'iron') === 'harbor', 'Iron is gone, Harbor holds its land');
  const placeOnIron = Object.keys(g.SPOTS).find(
    id => g.SPOTS[id].at && g.SPOTS[id].region === 'wei' && (g.Hex.ofSpot(id) || {}).unit === 'iron'
  );
  eq(g.Front.owner(run, placeOnIron), 'wu', 'its places go to the winner');
  assert(
    g.War.pairs(run, 'wu', 'wei').some(([, d]) => d === 'gold'),
    'Gold has a border now'
  );
  eq(g.War.str(run, 'fort'), fort0, 'Fort untouched');
  const N1 = g.Cup.places(run);
  assert(N1.wu > N0.wu && N1.wei < N0.wei, `the Cup places move to the winner (${JSON.stringify(N1)})`);
  assert(
    g.World.canJoin(run, g.WAR.units.iron.clubs[0]).why.includes('club destroyed') && !g.Fight.worth(run, g.WAR.units.iron.clubs[0]),
    'the club has stopped'
  );
  // destroying Harbor leaves Fort as it was
  g.War.destroy(run, 'harbor', 'shu');
  eq(g.War.str(run, 'fort'), fort0, 'one half falling does nothing to the other');
  eq(g.War.holder(run, 'iron'), 'shu', 'Iron’s land went on with Harbor’s');
  // the last Wei unit: Wei sends no squads at all
  g.War.destroy(run, 'gold', 'fort');
  const N2 = g.Cup.places(run);
  eq(N2.wei, 0, 'a wiped faction sends no squads');
  assert(!g.Cup.entrants(run).some(e => e.region === 'wei'), 'no Wei entrant');
});

test('war: Haewon walks out — never to the winner’s side nor yours; your club destroyed frees you (T-315)', () => {
  const [g, run] = mkRun(36),
    riv = g.Stars.get(run, 'rival'),
    harbor = g.WAR.units.harbor.clubs[0];
  sign(g, run, harbor);
  g.War.destroy(run, 'iron', 'harbor');
  g.War.destroy(run, 'gold', 'harbor');
  const wu = g.Pool.players(run, 'wu');
  assert(!wu.includes(riv) && !g.squadOf(g.Run.myTeam(run)).includes(riv), 'not with the winner, not with you');
  eq(g.Pool.players(run, 'shu').includes(riv), true, 'she went to Shu (the other standing faction)');
  assert(run.war.walk && run.war.walk.to === 'shu' && g.STORY_WHEN.walkout(run), 'her scene is due');
  // your club destroyed: you are a free agent again
  const fort = g.WAR.units.fort.clubs[0];
  g.War.destroy(run, 'harbor', 'shu');
  assert(g.World.isFree(run) && g.squadOf(run.pickup).some(p => p.id === run.youId), 'freed: back on the Academy squad');
  assert(
    run.log.some(l => /doesn’t exist any more/.test(l.t)),
    'a diary line'
  );
  eq(run.teams[fort].P.length, 4, 'the other half plays on');
});

test('war: the overthrow — Broken only, your match at its HQ, a loss rallies it for 4 weeks while battles go on; the AI below 10 (T-315)', () => {
  const [g, run] = mkRun(37);
  sign(g, run, g.WAR.units.harbor.clubs[0]);
  run.days = 7;
  run.pos = g.CITY.hq[1].slice();
  assert(!g.War.can(run, 'iron', 'harbor').ok && /not Broken/.test(g.War.can(run, 'iron', 'harbor').why), 'not before it is Broken');
  run.war.str.iron = 4;
  eq(g.War.side(run, 'iron').by, 'harbor', 'you fight for your club’s unit');
  assert(g.War.can(run, 'iron', 'harbor').ok, 'Broken: open');
  const fx = g.War.overthrow(run, 'iron'),
    m = g.newMatch(fx.a, fx.b, false);
  fx.setup(m);
  eq(m.weak[1], 3, 'Iron plays Broken');
  while (!m.over) g.playRally(m);
  fx.onFinish(m);
  eq(run.mlog[run.mlog.length - 1].kind, 'overthrow', 'on your match history');
  if (m.winner === 0) assert(g.War.fallen(run, 'iron'), 'won: destroyed');
  else {
    eq(g.War.str(run, 'iron'), 24, 'lost: it rallies +20');
    assert(/rallied/.test(g.War.can(run, 'iron', 'harbor').why), 'cooldown');
    assert(g.Front.site(run, 'wu', 'wei'), 'the border’s battles go on');
    run.week += 4;
    assert(g.War.can(run, 'iron', 'harbor').ok, 'after 4 weeks: open again');
  }
  // the AI: a unit under 10, off cooldown, is challenged at week end
  const [h, r2] = mkRun(38);
  r2.war.str.fort = 5;
  r2.week = 6;
  h.War.week(r2);
  eq(r2.war.ot.fort, 6, 'the AI challenged Fort');
  assert(h.War.fallen(r2, 'fort') || h.War.str(r2, 'fort') >= 25, 'destroyed or rallied');
});

test('war: call-ups — a member is called up on a battle week of their unit; refusing costs standing (T-316)', () => {
  const [g, run] = mkRun(39),
    harbor = g.WAR.units.harbor.clubs[0];
  sign(g, run, harbor);
  const e = g.War.edges(run, 'harbor', 'iron')[0],
    on = (att, def, tile, from) => (run.clash = { tile, from, att, def, seen: false, done: false });
  on('wu', 'wei', e.tile, e.from); // Harbor raids Iron
  eq(g.Fight.calledFor(run), 'wu', 'called up for Wu');
  const f = g.War.edges(run, 'fort', 'iron')[0];
  on('wu', 'wei', f.tile, f.from); // Fort raids Iron: not your unit
  eq(g.Fight.calledFor(run), null, 'another unit’s battle: no call');
  on('wu', 'wei', e.tile, e.from);
  const r0 = g.City.rep(run, 'wu'),
    line = g.Fight.clashEnd(run);
  eq(g.City.rep(run, 'wu'), r0 + g.WAR_CALL.refuse, 'stayed away: standing −8');
  assert(/call-up/.test(line), 'the diary says so: ' + line);
  // answered: fighting for your side costs nothing extra
  on('wu', 'wei', e.tile, e.from);
  run.days = 7;
  run.injury = null;
  run.lastFight = null;
  run.pos = g.CITY.hq[2].slice();
  const fx = g.Fight.clash(run, 'wu'),
    m = g.newMatch(fx.a, fx.b, false);
  fx.setup(m);
  while (!m.over) g.playRally(m);
  const r1 = g.City.rep(run, 'wu');
  fx.onFinish(m);
  eq(
    g.City.rep(run, 'wu'),
    g.clamp(r1 + (m.winner === 0 ? g.CLASH.win : g.CLASH.lose), -100, 100),
    'answered: only the battle’s own standing'
  );
  assert(g.Fight.calledFor(g.Run.create(g.Run.draft(), { role: 'S', name: 'Free' })) === null, 'a free agent is never called up');
});

test('war: the Raid order — a member on the hot border, once a week; a win hits their Strength × 2, a loss yours × 1 (T-318)', () => {
  const [g, run] = mkRun(41),
    harbor = g.WAR.units.harbor.clubs[0];
  sign(g, run, harbor);
  assert(/no hot border/.test(g.Fight.raidWhy(run)), 'no battle this week: no raid');
  const e = g.War.edges(run, 'harbor', 'iron')[0];
  run.clash = { tile: e.tile, from: e.from, att: 'wu', def: 'wei', seen: false, done: false };
  Object.assign(run, { days: 7, injury: null, sta: 100, pos: g.CITY.hq[2].slice() });
  eq(g.Fight.raidWhy(run), '', 'a member on this border may raid');
  const s0 = { harbor: g.War.str(run, 'harbor'), iron: g.War.str(run, 'iron') },
    next = g.RNG.next,
    line = g.Fight.raid(run);
  assert(g.RNG.next === next, 'the run’s random stream is untouched');
  assert(/^.*Raid on /.test(line), line);
  const won = /: won /.test(line);
  if (won) eq(g.War.str(run, 'iron'), s0.iron - 2 * g.WAR.lose, 'a win: Iron −2 × lose');
  else eq(g.War.str(run, 'harbor'), s0.harbor - g.WAR.lose, 'a loss: Harbor −1 × lose');
  eq(g.Fight.raidWhy(run), 'raided this week', 'once a week');
  eq(
    g.War.hit(g.Run.create(g.Run.draft(), { role: 'S', name: 'X' }), 'iron', false, 2),
    -2 * g.WAR.lose,
    'War.hit × 2 = twice a street battle loss'
  );
});
