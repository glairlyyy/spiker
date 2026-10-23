#!/usr/bin/env node
// Cards, bars and turns measured (spec §2.31–§2.33, T-296): side 0 plays a hand mode against the captain's hand (side 1), paired
// seeds against the same match with side 0 holding no cards. Prints point share / match-win deltas per mode, how often plays
// burn, collapses, stage shares and morale by trait. Measured, not tuned.
// npm run cards -- [pairs=100] [teams=league|tour|both] [modes=none,boosts,captain,random,blanket]
const { load } = require('./harness');
const g = load(17);
const [N = 100, TEAMS = 'both', MODES = 'boosts,captain,random,blanket'] = process.argv.slice(2).map((v, i) => (i === 0 ? +v : v));

const BOOSTS = { atk0: 'pow', atk1: 'jmp', def0: 'grd', def1: 'ftw' };
const PLAYS = Object.keys(g.CARDS).filter(id => g.CARDS[id].kind === 'play');
/** A private stream for the random hands (never the game's R()). */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomHand(m, rr) {
  const pool = g.cardPool(m, 0).filter(id => g.CARDS[id].kind === 'play');
  for (const k of g.SLOTS) {
    const fit = pool.filter(id => g.cardFits(id, k) && !g.cardIds(m, 0).includes(id));
    g.cardPut(m, 0, k, fit.length ? fit[Math.floor(rr() * fit.length)] : null);
  }
  g.cardApply(m, 0);
}
/** One match: side 0's mode (none | boosts | captain | random | blanket:<id>). */
function play(seed, teams, mode) {
  g.RNG.seed(seed);
  const L = teams === 'tour' ? g.mkTeams() : g.mkLeagueTeams(),
    a = L[seed % L.length],
    b = L[(seed * 3 + 1) % L.length];
  const c0 =
    mode === 'captain'
      ? null
      : mode === 'none' || mode === 'random'
        ? { by: 'you', pick: {} }
        : mode === 'boosts'
          ? { by: 'you', pick: BOOSTS }
          : {
              by: 'you',
              mine: 1,
              pick: { [g.CARDS[mode.slice(8)].zone === 'op' ? 'flex' : `${g.CARDS[mode.slice(8)].zone}0`]: mode.slice(8) }
            };
  const m = g.newMatch(a, b, false, { cards: [c0, null] }),
    rr = mulberry(seed * 7 + 1);
  let turn = -1;
  while (!m.over) {
    if (mode === 'random' && m.turnN !== turn) {
      turn = m.turnN;
      randomHand(m, rr);
    }
    g.playRally(m);
  }
  return m;
}
const share = m => m.pts[0] / (m.pts[0] + m.pts[1]);
const pct = v => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}`;

for (const teams of TEAMS === 'both' ? ['league', 'tour'] : [TEAMS]) {
  const modes = MODES.split(',').flatMap(x => (x === 'blanket' ? PLAYS.map(id => `blanket:${id}`) : [x]));
  const base = [],
    S = { ko: 0, pts: 0, stage: { loose: 0, composed: 0, focused: 0, fever: 0 }, turns: 0, trait: {} };
  for (let j = 0; j < N; j++) {
    const m = play(9000 + j, teams, 'none');
    base.push(m);
    S.ko += m.ko.n[0] + m.ko.n[1];
    S.pts += m.pts[0] + m.pts[1];
    S.turns += m.turnN;
  }
  // stage shares and morale by trait from captain-vs-captain matches
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
  }
  const st = Object.values(S.stage).reduce((a, v) => a + v, 0);
  console.log(`\n== ${teams} teams, ${N} pairs (side 0 vs the captain's hand; deltas vs side 0 holding no cards) ==`);
  console.log(
    `collapses ${((100 * S.ko) / S.pts).toFixed(2)} / 100 points · turns ${(S.turns / N).toFixed(1)} a match · stages (captain vs captain): ` +
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
  const rows = [];
  for (const mode of modes) {
    let d = 0,
      w = 0,
      spent = 0,
      slotted = 0;
    for (let j = 0; j < N; j++) {
      const m = play(9000 + j, teams, mode);
      d += share(m) - share(base[j]);
      w += (m.winner === 0) - (base[j].winner === 0);
      spent += m.cards[0].spent.length;
      slotted += Object.keys(m.cards[0].played).filter(id => g.CARDS[id].kind === 'play').length;
    }
    rows.push({ mode, d: d / N, w: w / N, spent: spent / N, slotted: slotted / N });
  }
  rows.sort((a, b) => b.d - a.d);
  for (const r of rows)
    console.log(
      `${r.mode.padEnd(18)} points ${pct(r.d).padStart(6)} %  wins ${pct(r.w).padStart(6)} %  plays slotted ${r.slotted.toFixed(1)}  spent ${r.spent.toFixed(2)} a match`
    );
}
