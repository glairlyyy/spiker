#!/usr/bin/env node
// Reading pays, measured (spec §2.33 balance pass, T-299): for each play, the rallies it acts in — won by its side when it
// fits, misfits, or is countered — against the same kind of rally in the same matches with no cards (paired seeds). Side 0
// holds only that play; for "countered" side 1 holds its counter. Target: fit +10–20, countered −10–20, misfit ≈ −5.
// npm run reads -- [pairs=80] [teams=tour|league] [ids=all|a,b,…]
const { load } = require('./harness');
const g = load(19);
const [N = 80, TEAMS = 'tour', IDS = 'all'] = process.argv.slice(2).map((v, i) => (i === 0 ? +v : v));
const plays = IDS === 'all' ? Object.keys(g.CARD_EDGE).filter(id => g.CARD_EDGE[id].e.length) : IDS.split(',');

/** One match: side 0's hand { slot: id } (or null: no cards), side 1's. Counts side 0's rallies by kind: [rallies, won]. */
function play(seed, h0, h1, fitOf) {
  g.RNG.seed(seed);
  const L = TEAMS === 'tour' ? g.mkTeams() : g.mkLeagueTeams(),
    a = L[seed % L.length],
    b = L[(seed * 3 + 1) % L.length],
    cards =
      h0 || h1
        ? [
            { by: 'you', pick: h0 || {} },
            { by: 'you', pick: h1 || {} }
          ]
        : false,
    m = g.newMatch(a, b, false, { cards }),
    K = { serve: [0, 0], recv: [0, 0], attack: [0, 0], defend: [0, 0] },
    F = {
      serve: [
        [0, 0],
        [0, 0]
      ],
      recv: [
        [0, 0],
        [0, 0]
      ],
      attack: [
        [0, 0],
        [0, 0]
      ],
      defend: [
        [0, 0],
        [0, 0]
      ]
    }; // [misfit, fit] buckets
  while (!m.over) {
    const sv = m.serve,
      a0 = [m.att[0].n, m.att[1].n],
      p0 = m.pts[0],
      fit = fitOf ? +!!fitOf(m, 0) : 0;
    g.playRally(m);
    const won = m.pts[0] > p0 ? 1 : 0,
      add = k => ((K[k][0] += 1), (K[k][1] += won), (F[k][fit][0] += 1), (F[k][fit][1] += won));
    add(sv === 0 ? 'serve' : 'recv');
    if (m.att[0].n > a0[0]) add('attack');
    if (m.att[1].n > a0[1]) add('defend');
  }
  return { m, K, F };
}
const slotFor = id => (g.CARDS[id].zone === 'op' ? 'flex' : `${g.CARDS[id].zone}0`);
const pct = (w, n) => (n ? (100 * w) / n : NaN);
// (the baseline is read the same way: each rally of the no-card match bucketed by whether the play would fit — so a play that
// fits when its side is ahead anyway is measured against that, not against every rally)
const f = v => (Number.isNaN(v) ? '   –' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`.padStart(6));

console.log(`reads: ${TEAMS} teams, ${N} pairs — side 0's win rate in the rallies the play acts in, vs no cards (points)`);
console.log('play'.padEnd(14), '   fit (n)        misfit (n)       countered (n)   spent/match');
for (const id of plays) {
  const c = g.CARDS[id],
    E = g.CARD_EDGE[id],
    ctr = E.ctr[0];
  const S = { fit: [0, 0], mis: [0, 0], ctr: [0, 0] },
    B = [0, 0],
    BF = [
      [0, 0],
      [0, 0]
    ],
    fitOf = g.CARD_FIT[E.fit];
  let spent = 0;
  for (let j = 0; j < N; j++) {
    const seed = 5000 + j,
      base = play(seed, null, null, fitOf);
    B[0] += base.K[c.tally][0];
    B[1] += base.K[c.tally][1];
    for (const k of [0, 1]) ((BF[k][0] += base.F[c.tally][k][0]), (BF[k][1] += base.F[c.tally][k][1]));
    const r = play(seed, { [slotFor(id)]: id }, null),
      st = r.m.cards[0].stat[id];
    if (st) for (const k of ['fit', 'mis']) ((S[k][0] += st[k][0]), (S[k][1] += st[k][1]));
    spent += r.m.cards[0].spent.length;
    if (ctr) {
      const rc = play(seed, { [slotFor(id)]: id }, { [slotFor(ctr)]: ctr }),
        sc = rc.m.cards[0].stat[id];
      if (sc) ((S.ctr[0] += sc.ctr[0]), (S.ctr[1] += sc.ctr[1]));
    }
  }
  const b = { fit: pct(BF[1][1], BF[1][0]), mis: pct(BF[0][1], BF[0][0]), ctr: pct(B[1], B[0]) },
    cell = k => `${f(pct(S[k][1], S[k][0]) - b[k])} (${String(S[k][0]).padStart(4)})`;
  console.log(id.padEnd(14), cell('fit'), '  ', cell('mis'), '  ', cell('ctr'), `   ${(spent / N).toFixed(2)}`);
}
