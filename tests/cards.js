#!/usr/bin/env node
// The deck measured (spec §2.31–§2.33, §2.37): side 0 plays its deck one way against the captain (side 1), paired seeds against
// the same match with side 0 playing no cards. Prints point share / match-win deltas per mode, cards played, collapses, stage
// shares and morale by trait; then the spam test (a deck of one good card + Basics: played on every draw vs by the captain), the
// OP-timing test (God Resolve, Titan and INZONE!! played at once vs saved for a key moment), the fusing test (two cards fused
// and played into their read vs the same two played apart at the same moments) and the request odds (spec §2.37 Must hold, T-348).
// npm run cards -- [pairs=100] [teams=league|tour|both] [modes=captain,random,basics] [spam=power,hunt] [fuse=wall+commit,…|x] [op|x] [req|x]
const { load } = require('./harness');
const g = load(17);
const [
  N = 100,
  TEAMS = 'both',
  MODES = 'captain,random,basics',
  SPAM = 'power,hunt',
  FUSE = 'wall+commit,iblk+idig,iset+iatk,ifake+iatk,sdig+idig',
  OP = 'op',
  REQS = 'req'
] = process.argv.slice(2).map((v, i) => (i === 0 ? +v : v));

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
/** Side 0's OP players for the OP-timing test: its first WS / MB / S carry their role's OP card (DECK.op; p.op is display only). */
function opSquad(T) {
  for (const r of Object.keys(g.DECK.op)) {
    const p = g.squadOf(T).find(q => q.role === r);
    if (p) p.op = true;
  }
}
const isOp = id => !!id && g.CARDS[id].kind === 'op';
/**
 * One match: side 0's mode — none (a deck, no plays) | captain | random (a random playable card every point) | basics (12
 * Basics, the captain) | spam:<id> (the deck: id + Basics; id played as soon as it can be, the captain the rest) |
 * cap:<id> (the same deck, the captain plays all) | opnow / opkey / opcap (its OP players' cards + Basics: each OP card played as
 * soon as it can be / only at a key moment (keyMoment) / by the captain; the captain plays the rest) | fz:<a>+<b> / ap:<a>+<b> (a
 * deck of a and b only: fused and played when the fused card fits / each played alone at those moments; never otherwise).
 */
function play(seed, teams, mode) {
  g.RNG.seed(seed);
  const L = teams === 'tour' ? g.mkTeams() : g.mkLeagueTeams(),
    a = L[seed % L.length],
    b = L[(seed * 3 + 1) % L.length],
    [k, id] = mode.split(':'),
    ops = Object.values(g.DECK.op),
    pair = k === 'fz' || k === 'ap' ? id.split('+') : null,
    c0 =
      k === 'captain'
        ? null
        : k === 'none' || k === 'random'
          ? { by: 'you' }
          : k === 'basics'
            ? { deck: [] }
            : k === 'cap'
              ? { deck: [id] }
              : k === 'opcap'
                ? { deck: ops }
                : k === 'opnow' || k === 'opkey'
                  ? { by: 'you', deck: ops }
                  : pair
                    ? { by: 'you', deck: Array.from({ length: g.DECK.size }, (x, n) => pair[n % 2]), fill: false }
                    : { by: 'you', deck: [id] };
  if (k.startsWith('op')) opSquad(a);
  const m = g.newMatch(a, b, false, { cards: [c0, null] }),
    rr = mulberry(seed * 7 + 1),
    D = m.deck[0];
  while (!m.over) {
    if (k === 'random') {
      const ok = D.hand.map((x, h) => h).filter(h => !g.Cards.can(m, 0, h));
      if (ok.length) g.Cards.play(m, 0, ok[Math.floor(rr() * ok.length)]);
    } else if (k === 'opnow' || k === 'opkey') {
      const h = D.hand.findIndex((x, n) => isOp(x) && !g.Cards.can(m, 0, n));
      if (h >= 0 && (k === 'opnow' || g.keyMoment(m, 0))) g.Cards.play(m, 0, h);
      else {
        // the captain plays the rest (its OP cards hidden from it)
        const op = D.hand.map((x, n) => (isOp(x) ? n : -1)).filter(n => n >= 0),
          ids = op.map(n => D.hand[n]);
        for (const n of op) D.hand[n] = null;
        const c = capFor(m, 0);
        op.forEach((n, j) => (D.hand[n] = ids[j]));
        if (c >= 0) g.Cards.play(m, 0, c);
      }
    } else if (k === 'fz') {
      const [x, y] = [D.hand.indexOf(pair[0]), D.hand.indexOf(pair[1])],
        r = g.Cards.recipe(pair[0], pair[1]);
      if (x >= 0 && y >= 0 && !g.Cards.canId(m, 0, r, false, D) && g.Cards.fits(m, 0, r) && g.Cards.fuse(m, 0, x, y)) g.Cards.play(m, 0, x);
    } else if (k === 'ap') {
      // the same moments (the fused card's read holds), each part alone
      const h = D.hand.findIndex((x, n) => x && !g.Cards.can(m, 0, n));
      if (h >= 0 && g.Cards.fits(m, 0, g.Cards.recipe(pair[0], pair[1]))) g.Cards.play(m, 0, h);
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
  for (const mode of MODES.split(',').filter(x => x && x !== 'x')) row(mode);
  console.log('spam test (deck: the card + 11 Basics): played on every draw vs by the captain');
  for (const id of SPAM.split(',').filter(x => x && x !== 'x')) for (const mode of [`spam:${id}`, `cap:${id}`]) row(mode);
  if (OP === 'op') {
    console.log("OP-timing test (deck: side 0's OP players' cards + Basics): OP cards at once vs at a key moment vs the captain");
    for (const mode of ['opnow', 'opkey', 'opcap']) row(mode);
  }
  if (FUSE !== 'x') {
    console.log('fusing test (a deck of the two parts): fused and played into its read vs the parts played apart at the same moments');
    for (const id of FUSE.split(',')) for (const mode of [`fz:${id}`, `ap:${id}`]) row(mode);
  }
}
// requests (spec §2.37): asked at every turn for the captain's first team play, by bond / trust — the yes rate when it fits and when not
if (REQS === 'req') {
  console.log('\n== requests (league, side 0: a wing asks the captain at every turn; yes % — fits / does not fit) ==');
  for (const trusted of [false, true]) {
    const line = [];
    for (const bond of [0, 30, 60, 90]) {
      const Y = { fit: [0, 0], mis: [0, 0] };
      for (let j = 0; j < Math.min(N, 60); j++) {
        g.RNG.seed(9000 + j);
        const L = g.mkLeagueTeams(),
          m = g.newMatch(L[j % L.length], L[(j * 3 + 1) % L.length], false),
          p = m.t[0].P.find(q => q.role === 'WS' && q !== m.t[0].cap) || m.t[0].P[1];
        g.Cards.myDeck(m, 0, p.id, [], { bond, trusted });
        while (!m.over) {
          const D = m.deck[0],
            h = D.hand.findIndex((x, n) => x && !g.Cards.canAsk(m, 0, n));
          if (h >= 0) {
            const f = g.Cards.fits(m, 0, D.hand[h]) ? 'fit' : 'mis',
              r = g.Cards.ask(m, 0, h);
            Y[f][0]++;
            if (r.ok) Y[f][1]++;
          }
          g.playRally(m);
        }
      }
      const q = k => (Y[k][0] ? ((100 * Y[k][1]) / Y[k][0]).toFixed(0) : '–');
      line.push(`bond ${bond}: ${q('fit')} / ${q('mis')} % (n ${Y.fit[0] + Y.mis[0]})`);
    }
    console.log(`${trusted ? 'trusted ' : 'newcomer'}  ${line.join(' · ')}`);
  }
}
