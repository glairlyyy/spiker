#!/usr/bin/env node
// The deck measured (spec §2.31–§2.33, §2.37): side 0 plays its deck one way against the captain (side 1), paired seeds against
// the same match with side 0 playing no cards. Prints point share / match-win deltas per mode, cards played, collapses, stage
// shares and morale by trait; then the spam test (a deck of one good card + Basics: played on every draw vs by the captain).
// Measured, not tuned (T-348).
// npm run cards -- [pairs=100] [teams=league|tour|both] [modes=captain,random,basics] [spam=power,hunt]
const { load } = require('./harness');
const g = load(17);
const [N = 100, TEAMS = 'both', MODES = 'captain,random,basics', SPAM = 'power,hunt'] = process.argv
  .slice(2)
  .map((v, i) => (i === 0 ? +v : v));

/** A private stream for the random plays (never the game's R()). */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The captain's pick for a side you run (Cards.capPlay skips those): run it as the captain's for one call. */
function capFor(m, i) {
  const D = m.deck[i],
    by = D.by;
  D.by = 'ai';
  const h = g.Cards.capPlay(m, i);
  D.by = by;
  return h;
}
/**
 * One match: side 0's mode — none (a deck, no plays) | captain | random (a random playable card every point) | basics (12
 * Basics, the captain) | spam:<id> (the deck: id + Basics; id played as soon as it can be, the captain the rest) |
 * cap:<id> (the same deck, the captain plays all).
 */
function play(seed, teams, mode) {
  g.RNG.seed(seed);
  const L = teams === 'tour' ? g.mkTeams() : g.mkLeagueTeams(),
    a = L[seed % L.length],
    b = L[(seed * 3 + 1) % L.length],
    [k, id] = mode.split(':'),
    c0 =
      k === 'captain'
        ? null
        : k === 'none' || k === 'random'
          ? { by: 'you' }
          : k === 'basics'
            ? { deck: [] }
            : k === 'cap'
              ? { deck: [id] }
              : { by: 'you', deck: [id] };
  const m = g.newMatch(a, b, false, { cards: [c0, null] }),
    rr = mulberry(seed * 7 + 1),
    D = m.deck[0];
  while (!m.over) {
    if (k === 'random') {
      const ok = D.hand.map((x, h) => h).filter(h => !g.Cards.can(m, 0, h));
      if (ok.length) g.Cards.play(m, 0, ok[Math.floor(rr() * ok.length)]);
    } else if (k === 'spam') {
      const h = D.hand.indexOf(id);
      if (h >= 0 && !g.Cards.can(m, 0, h)) g.Cards.play(m, 0, h);
      else {
        const c = capFor(m, 0);
        if (c >= 0 && D.hand[c] !== id) g.Cards.play(m, 0, c);
      }
    }
    g.playRally(m);
  }
  return m;
}
const share = m => m.pts[0] / (m.pts[0] + m.pts[1]);
const pct = v => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}`;
const nPlayed = (m, f = () => true) =>
  Object.entries(m.deck[0].played)
    .filter(([id]) => f(id))
    .reduce((a, [, n]) => a + n, 0);

for (const teams of TEAMS === 'both' ? ['league', 'tour'] : [TEAMS]) {
  const base = [],
    S = { ko: 0, pts: 0, stage: { loose: 0, composed: 0, focused: 0, fever: 0 }, turns: 0, trait: {}, cap: 0, op: 0 };
  for (let j = 0; j < N; j++) {
    const m = play(9000 + j, teams, 'none');
    base.push(m);
    S.ko += m.ko.n[0] + m.ko.n[1];
    S.pts += m.pts[0] + m.pts[1];
    S.turns += m.turnN;
  }
  // stage shares, morale by trait and the captain's plays from captain-vs-captain matches
  for (let j = 0; j < N; j++) {
    g.RNG.seed(9000 + j);
    const L = teams === 'tour' ? g.mkTeams() : g.mkLeagueTeams(),
      m = g.newMatch(L[j % L.length], L[(j * 3 + 1) % L.length], false);
    while (!m.over) {
      g.playRally(m);
      for (const i of [0, 1]) S.stage[m.stage[i]]++;
    }
    for (const t of m.t)
      for (const p of g.squadOf(t)) {
        const k = g.mtraitOf(p) || 'none',
          r = S.trait[k] || (S.trait[k] = { n: 0, mor: 0 });
        r.n++;
        r.mor += m.mor[p.id];
      }
    S.cap += nPlayed(m);
    S.op += nPlayed(m, id => g.CARDS[id].kind === 'op');
  }
  const st = Object.values(S.stage).reduce((a, v) => a + v, 0);
  console.log(`\n== ${teams} teams, ${N} pairs (side 0 vs the captain; deltas vs side 0 playing no cards) ==`);
  console.log(
    `collapses ${((100 * S.ko) / S.pts).toFixed(2)} / 100 points · turns ${(S.turns / N).toFixed(1)} a match · captain plays ${(S.cap / N).toFixed(1)} cards a match (OP ${(S.op / N).toFixed(2)}) · stages (captain vs captain): ` +
      Object.entries(S.stage)
        .map(([k, v]) => `${k} ${((100 * v) / st).toFixed(0)} %`)
        .join(' · ')
  );
  console.log(
    'morale at match end by trait: ' +
      Object.entries(S.trait)
        .map(([k, r]) => `${k} ${(r.mor / r.n).toFixed(2)} (${r.n})`)
        .join(' · ')
  );
  console.log(`none: side 0 point share ${(100 * (base.reduce((a, m) => a + share(m), 0) / N)).toFixed(1)} %`);
  const row = mode => {
    let d = 0,
      w = 0,
      n = 0;
    for (let j = 0; j < N; j++) {
      const m = play(9000 + j, teams, mode);
      d += share(m) - share(base[j]);
      w += (m.winner === 0) - (base[j].winner === 0);
      n += nPlayed(m);
    }
    console.log(
      `${mode.padEnd(14)} points ${pct(d / N).padStart(6)} %  wins ${pct(w / N).padStart(6)} %  cards played ${(n / N).toFixed(1)} a match`
    );
  };
  for (const mode of MODES.split(',')) row(mode);
  console.log('spam test (deck: the card + 11 Basics): played on every draw vs by the captain');
  for (const id of SPAM.split(',').filter(Boolean)) for (const mode of [`spam:${id}`, `cap:${id}`]) row(mode);
}
