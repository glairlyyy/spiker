// Tests: tactic cards and turns (spec §2.32–§2.33, T-295). harness.js has the loader, runner and helpers.
const { load, test, assert, eq } = require('./harness');

/** A league match where side 0's wing spikers own Killer Jump Serve and Target Serve (career-learned). */
function killerMatch(g, seed, mtrait) {
  g.RNG.seed(seed);
  const T = g.mkTeams(),
    a = T[0],
    b = T[1];
  for (const p of g.squadOf(a)) {
    p.skills = p.role === 'WS' ? ['killer', 'target'] : [];
    if (mtrait !== undefined) p.mtrait = mtrait;
  }
  return g.newMatch(a, b, false, { cards: [{ by: 'you', pick: { atk0: 'killer', atk1: 'target' } }, null] });
}

test('cards: a slotted Killer Serve fires on every holder jump serve; a Stubborn holder is not forced (spec §2.33)', () => {
  const g = load(71);
  const m = killerMatch(g, 3, null),
    ws = m.t[0].P.filter(p => p.role === 'WS');
  for (const p of ws) eq(g.ordOf(m, p, 'srv'), 'killer', 'holder ordered Killer');
  assert(m.cards[0].force.length === 0 && m.cards[0].buff.some(b => b.k === 'serve' && b.need === 'killer'), 'the card buffs its holders');
  assert(g.comboOf(g.cardIds(m, 0), 'killer') === 'sniper', 'Killer + Target link as Sniper');
  assert(
    m.cards[0].buff.some(b => b.k === 'serve' && b.v === g.COMBOS.sniper.buff.serve),
    'the combo bonus'
  );
  while (!m.over) g.playRally(m);
  let srv = 0,
    k = 0;
  for (const p of ws) {
    srv += (m.srvLog[p.id] || { n: 0 }).n;
    k += ((m.techUse[p.id] || {}).killer || { n: 0 }).n;
  }
  assert(srv > 0 && k >= srv * 0.9, `Killer on ${k} of ${srv} holder serves`);
  const s = killerMatch(g, 3, 'stubborn');
  for (const p of s.t[0].P.filter(q => q.role === 'WS')) eq(g.ordOf(s, p, 'srv'), undefined, 'a Stubborn holder takes no order');
});

test('cards: a play at −3 is spent for the match — out of its slot, never slotted again, the team morale drops, a turn follows', () => {
  const g = load(72),
    T = g.mkTeams(),
    m = g.newMatch(T[2], T[3], false, { cards: [{ by: 'you', pick: { atk0: 'hunt' } }, null] });
  g.playRally(m);
  const before = m.mom[0];
  for (let i = 0; i < 3; i++) {
    m.cards[0].st.hunt = 'mis'; // (spec §2.33: only misfit / countered rallies burn a play)
    m.srv0 = 0;
    m.srvP0 = m.t[0].P[0];
    g.cardTally(m, 1);
  }
  assert(m.cards[0].spent.includes('hunt'), 'spent');
  assert(!g.cardIds(m, 0).includes('hunt') && !g.cardInPool(m, 0, 'hunt'), 'out of its slot and the pool');
  assert(m.turnNow, 'a turn follows at once');
  assert(m.mom[0] !== before, 'the team morale moved');
  g.cardFill(m, 0);
  assert(!g.cardIds(m, 0).includes('hunt'), 'the coach never slots it again');
  assert(!g.cardPut(m, 0, 'atk0', 'hunt'), 'nor can you');
});

test('cards: turns every TURN.pts points (or after a spent card); five slots in their zones; the coach draws no randoms', () => {
  const g = load(73),
    T = g.mkTeams();
  for (let i = 0; i < 12; i++) {
    const m = g.newMatch(T[i % 8], T[(i + 3) % 8], false);
    let last = 0;
    while (!m.over) {
      const n = m.turnN,
        sp = m.cards[0].spent.length + m.cards[1].spent.length;
      g.playRally(m);
      if (m.turnN > n) {
        const at = m.pts[0] + m.pts[1],
          burnt = m.cards[0].spent.length + m.cards[1].spent.length > sp;
        assert(at - last === g.TURN.pts || burnt, `turn after ${at - last} points`);
        last = at;
      }
    }
    for (const C of m.cards)
      for (const k of g.SLOTS) {
        const id = C.slots[k];
        if (id) assert(g.cardFits(id, k), `${id} fits ${k}`);
        if (id && g.CARDS[id].zone === 'op') eq(k, 'flex', 'OP only in FLEX');
      }
    g.cardFill(m, 1);
    const s0 = JSON.stringify(m.cards[1].slots),
      nx = g.RNG.next;
    let draws = 0;
    g.RNG.next = () => (draws++, nx());
    g.cardFill(m, 1);
    g.RNG.next = nx;
    eq(draws, 0, 'no draws');
    eq(JSON.stringify(m.cards[1].slots), s0, 'the same pick twice');
  }
});

test('cards: no cards (cards: false) is today’s engine — no slots, plans from the coach, techniques at their usual chance', () => {
  const g = load(74),
    T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: false });
  eq(m.cards, null, 'no hand');
  eq(g.cardBuff(m.t[0].P[0], 'atk'), 1, 'no buff');
  while (!m.over) g.playRally(m);
  eq(m.turnN, undefined, 'no turns');
});
