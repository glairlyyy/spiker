#!/usr/bin/env node
// The smart bot (spec §2.30, T-285): plays the Plan board for side 0 with the board's own odds and measures what that is
// worth against the same match played on Auto (paired seeds). Serve orders every serve (srvOdds); every `every` points each
// player's aim / shot / feed / fake / block by the point it wins (atkOdds full: the rally played out).
// npm run bot -- [pairs=60] [teams=league|tour] [mode=full|serve|blanket:<kind>=<value>] [every=4]
const { load } = require('./harness');
const g = load(11);
const [N = 60, TEAMS = 'league', MODE = 'full', EVERY = 4] = process.argv.slice(2).map((v, i) => (i === 0 || i === 3 ? +v : v));
g.ORDERS.odds.atkN = +process.env.ATKN || 40; // the probe's possessions per option (the board uses ORDERS.odds.atkN)

const srvEV = o => 0.5 * o.hit - o.err;
function smartServe(m, side) {
  if (m.serve !== side) return;
  const p = g.rotOrder(m.t[side], m.rot[side])[0],
    O = m.t[1 - side];
  let best = null,
    bv = -9;
  for (const so of g.srvOpts(p).filter(o => !o.lock))
    for (const to of g.tgtOpts(p, O).filter(o => !o.lock)) {
      // (pressure builds over serves: a passer already under it is worth more than this serve's odds alone)
      const tp = to.v !== 'auto' && to.v !== 'seam' ? O.P.find(q => q.id === to.v) : null,
        v = srvEV(g.srvOdds(m, p, side, so.v, to.v)) + (tp ? 0.02 * g.pressOf(m, tp) : 0);
      if (v > bv) [bv, best] = [v, [so.v, to.v]];
    }
  g.ordSet(m, p, 'srv', best[0]);
  g.ordSet(m, p, 'tgt', best[1]);
}
function pickBest(m, p, kind, opts, run, ev) {
  let best = 'auto',
    bv = -9;
  for (const o of opts.filter(o => !o.lock)) {
    const v = ev(run(o.v));
    if (v > bv) [bv, best] = [v, o.v];
  }
  g.ordSet(m, p, kind, best);
}
function smartRest(m, side) {
  const T = m.t[side],
    O = m.t[1 - side],
    win = o => o.win;
  for (const p of T.P) {
    if (p.role === 'S') {
      pickBest(
        m,
        p,
        'feed',
        g.feedOpts(p, T),
        v => g.atkOdds(m, side, v === 'auto' ? null : T.P.find(q => q.id === v), [[p, 'feed', v]], true),
        win
      );
      pickBest(m, p, 'fake', g.fakeOpts(), v => g.atkOdds(m, side, null, [[p, 'fake', v]], true), win);
    } else {
      pickBest(m, p, 'aim', g.aimOpts(p, O), v => g.atkOdds(m, side, p, [[p, 'aim', v]], true), win);
      pickBest(m, p, 'shot', g.shotOpts(), v => g.atkOdds(m, side, p, [[p, 'shot', v]], true), win);
    }
    if (p.role === 'MB')
      pickBest(
        m,
        p,
        'blk',
        g.blkOpts(),
        v => g.atkOdds(m, 1 - side, null, [[p, 'blk', v]], true),
        o => -o.win
      );
  }
  botSubs(m, side);
}
/** Rest a court player when the best fresh bench player is worth more than they are now (T-282). */
function botSubs(m, side) {
  const sta = q => (m.sta[q.id] == null ? 1 : m.sta[q.id]),
    worth = q => g.ovr(q) * (1 - g.RULES.stamina.hit * (1 - sta(q)));
  for (const p of m.t[side].P) {
    const q = g.restFor(m, side, p);
    if (q && worth(q) > worth(p) * 1.03 && !g.restOpts(m, side, p).find(o => o.v === 'now').lock) g.ordSet(m, p, 'rest', 'now');
  }
}
function blanket(m, side, kind, v) {
  for (const p of g.squadOf(m.t[side])) {
    const opts = { srv: g.srvOpts(p), shot: g.shotOpts(), aim: g.aimOpts(p, m.t[1 - side]), blk: g.blkOpts(), fake: g.fakeOpts() }[kind];
    if (kind === 'blk' && p.role !== 'MB') continue;
    if ((kind === 'shot' || kind === 'aim') && p.role === 'S') continue;
    const o = opts && opts.find(x => x.v === v);
    if (o && !o.lock) g.ordSet(m, p, kind, v);
  }
}
const share = m => {
  let a = 0,
    b = 0;
  for (const sc of m.setScores) ((a += sc[0]), (b += sc[1]));
  return a / (a + b);
};
/** Every point, the reads a human makes from the board (spec §2.30): aim where their block does not expect it. */
function smartReads(m, side) {
  for (const p of m.t[side].P) {
    if (p.role === 'S') continue;
    const s = g.laneSeen(m, p),
      est = (s.line + 1) / (s.line + s.cross + 2);
    g.ordSet(m, p, 'aim', est > 0.5 ? 'cross' : 'line');
  }
}
function play(seed, smart) {
  g.RNG.seed(seed);
  const L = TEAMS === 'tour' ? g.mkTeams() : g.mkLeagueTeams(),
    m = g.newMatch(L[seed % L.length], L[(seed * 3 + 1) % L.length], false);
  if (smart && MODE.startsWith('blanket:')) blanket(m, 0, ...MODE.slice(8).split('='));
  for (let k = 0; !m.over; k++) {
    if (smart && !MODE.startsWith('blanket:')) {
      smartServe(m, 0);
      if (MODE === 'full' && k % EVERY === 0) smartRest(m, 0);
      if (MODE === 'full' && process.env.READS) smartReads(m, 0);
    }
    g.playRally(m);
  }
  return m;
}
let d = 0,
  w0 = 0,
  w1 = 0;
const t0 = Date.now(),
  pick = {};
for (let j = 0; j < N; j++) {
  const s = 7000 + j,
    ma = play(s, false),
    mb = play(s, true);
  d += share(mb) - share(ma);
  w0 += ma.winner === 0;
  w1 += mb.winner === 0;
  for (const o of Object.values(mb.ord))
    for (const [k, v] of Object.entries(o)) {
      const key = `${k}:${/^p\d/.test(String(v)) ? 'a player' : v}`;
      pick[key] = (pick[key] || 0) + 1;
    }
  if ((j + 1) % 10 === 0)
    console.log(
      `${j + 1} pairs: points ${((100 * d) / (j + 1)).toFixed(2)} %, wins ${((100 * (w1 - w0)) / (j + 1)).toFixed(1)} % (${((Date.now() - t0) / 1000).toFixed(0)} s)`
    );
}
console.log(
  `BOT ${TEAMS} ${MODE}: points ${((100 * d) / N).toFixed(2)} %, match wins ${((100 * (w1 - w0)) / N).toFixed(1)} % (Auto wins ${((100 * w0) / N).toFixed(0)} %)`
);
console.log('orders at the end of the matches:', JSON.stringify(pick));
