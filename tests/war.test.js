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
  eq(g.War.str(run, 'iron'), 100 - g.WAR.lose, 'Iron −8');
  assert(/Wei Iron Strength 100 → 92/.test(line), 'the line names it: ' + line);
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
      assert(![t.ua, t.ud].includes('gold'), 'Gold never on the street while Iron stands');
      h.Fight.clashEnd(r2);
      fought++;
    }
    h.War.week(r2);
    for (const u of h.War.ids()) {
      const s = h.War.str(r2, u);
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
  assert(k.unit === 'iron' && k.str === 100 && k.after === 92 && !k.seize && !k.place, 'the preview: Iron 100 → 92');
  run.war.str.iron = 50;
  eq(g.War.stage(run, 'iron'), 1, 'under 60: Strained');
  eq(g.World.joinReq(run, ti).ovr, o0 - g.FRONT.join, 'a Strained club asks less');
  assert(g.Front.priceMul(run, 'wei') > 1 && g.Front.qMul(run, 'wei') < 1 && g.City.price(run, 'weiPower') > p0, 'dearer, poorer');
  assert(g.Front.strength(run, 'iron') < g.Front.strength(run, 'harbor'), 'weaker on the street');
  eq(g.Front.owner(run, 'weiPower'), 'wei', 'no place changes hands');
  const d = g.Dossier.build(run, 'wei');
  assert(d.state === 'pressed' && d.fronts.length === 2 && d.fronts[0].unit === 'iron' && d.fronts[0].str === 50, 'the dossier shows the units');
  eq(g.Dossier.summary(run, 'gloria').fronts.length, 0, 'minors are not in the war');
  // saved with the run
  g.Run.save(run);
  eq(g.Run.load().war.str.iron, 50, 'run.war round-trips');
  assert(!('hex' in g.Run.defaults()), 'run.hex is gone');
});
