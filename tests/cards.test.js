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
    g.cardFill(m, 1); // (T-337: a first refill's own buffs can move a fit — hitPow / blkOf — so the second pick may differ once; stable after)
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

test('cards: traps burn the card they name at the next serve; one-shots fire once and are used up; Overload drains twice (T-305)', () => {
  const g = load(73),
    T = g.mkTeams();
  // a Serve Trap against a slotted Hunt the Passer
  const m = g.newMatch(T[0], T[1], false, {
    cards: [
      { by: 'you', pick: { atk0: 'hunt' } },
      { by: 'you', pick: { def0: 'strap' } }
    ]
  });
  assert(m.trapNow, 'traps wait for the first serve');
  g.playRally(m);
  assert(m.cards[0].spent.includes('hunt') && !g.cardIds(m, 0).includes('hunt'), 'Hunt burnt by the trap');
  assert(m.cards[1].spent.includes('strap') && !g.cardIds(m, 1).includes('strap'), 'the trap is used up');
  assert(m.turnNow || m.turnN > 0, 'a turn follows');
  // no target: the trap stays
  const n = g.newMatch(T[0], T[1], false, {
    cards: [
      { by: 'you', pick: { atk0: 'pow' } },
      { by: 'you', pick: { def0: 'qtrap' } }
    ]
  });
  g.playRally(n);
  assert(g.cardIds(n, 1).includes('qtrap'), 'a trap with nothing to catch stays');
  // Timeout Talk: morale up, used up at once
  const t = g.newMatch(T[2], T[3], false, { cards: [{ by: 'you', pick: {} }, null] });
  const f0 = t.mom[0];
  assert(g.cardPut(t, 0, 'def0', 'talk'), 'Timeout Talk fits DEF');
  g.cardApply(t, 0);
  assert(t.mom[0] > f0 + 0.2, `morale up (${f0} → ${t.mom[0]})`);
  assert(!g.cardIds(t, 0).includes('talk') && t.cards[0].spent.includes('talk') && !t.turnNow, 'used up, no turn');
  // Overload: stamina drains × 2 for its side only
  const o = g.newMatch(T[2], T[3], false, {
    cards: [
      { by: 'you', pick: { flex: 'overload' } },
      { by: 'you', pick: {} }
    ]
  });
  assert(g.cardInPool(o, 0, 'overload') || !g.squadOf(o.t[0]).some(p => p.op || p.elOn), 'Overload comes with an OP / element player');
  if (g.cardIds(o, 0).includes('overload')) {
    const a = o.t[0].P[0],
      b = o.t[1].P[0];
    a.def = b.def;
    a.speed = b.speed;
    g.dr(o, a, 0.05);
    g.dr(o, b, 0.05);
    assert(Math.abs(1 - o.sta[a.id] - 2 * (1 - o.sta[b.id])) < 1e-6, 'twice the drain');
  }
});

test('traits: twelve traits, ~85 % of players; Iron Body takes less HP damage; Choker loses more late (spec §2.31, T-304)', () => {
  const g = load(74),
    sh = Object.values(g.MTRAITS).reduce((a, t) => a + t.share, 0);
  eq(Object.keys(g.MTRAITS).length, 12);
  assert(Math.abs(sh - 0.85) < 1e-9, `shares sum to ${sh}`);
  const T = g.mkTeams(),
    all = T.flatMap(t => g.squadOf(t)),
    has = all.filter(p => g.mtraitOf(p)).length / all.length;
  assert(has > 0.7 && has < 0.97, `${(100 * has).toFixed(0)} % have a trait`);
  const m = g.newMatch(T[0], T[1], false, { cards: false }),
    p = m.t[1].P[0];
  p.mtrait = null;
  g.hpHit(m, p, 60);
  const plain = 1 - g.hpOf(m, p);
  m.hp[p.id] = 1;
  p.mtrait = 'iron';
  g.hpHit(m, p, 60);
  assert(Math.abs(1 - g.hpOf(m, p) - plain * 0.7) < 1e-9, 'Iron Body × 0.7');
  // Choker vs none: a lost point late
  const lose = tr => {
    const n = g.newMatch(T[0], T[1], false, { cards: false });
    for (const q of g.squadOf(n.t[1])) q.mtrait = tr;
    n.pts = [13, 12];
    g.morPoint(
      n,
      0,
      () => 1,
      () => 0
    );
    return g.morOf(n, n.t[1].P[1]);
  };
  assert(lose('choker') < lose(null), 'a Choker loses more late');
  assert(lose('clutch') > lose(null), 'a Clutch player loses less late');
  for (const q of all) delete q.mtrait;
});

test('cards: a Broken side plays with 4 slots (FLEX gone) and starts 10 morale lower; [0, 0] is today’s match (spec §4.34, T-314)', () => {
  const g = load(73);
  g.RNG.seed(5);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { weak: [3, 0] });
  eq(g.cardSlots(m, 0).length, 4, 'Broken: 4 slots');
  eq(g.cardSlots(m, 1).length, 5, 'Steady: 5');
  assert(!m.cards[0].slots.flex && !g.cardPut(m, 0, 'flex', 'pow'), 'nothing goes into the missing FLEX slot');
  assert(
    g.squadOf(m.t[0]).every(p => Math.abs(m.mor[p.id] + 0.1) < 1e-9),
    'every Broken player starts at −10 morale'
  );
  assert(Math.abs(m.mom[0] + 0.1) < 1e-9 && m.mom[1] === 0, 'the fire follows');
  // after newMatch (a career fixture's setup): the same
  g.RNG.seed(5);
  const U = g.mkTeams(),
    n = g.newMatch(U[0], U[1], false);
  g.weakSet(n, [3, 0]);
  eq(
    JSON.stringify([n.mor, n.cards[0].slots, n.weak]),
    JSON.stringify([m.mor, m.cards[0].slots, m.weak]),
    'weakSet after newMatch = opts.weak'
  );
  // no stage: the same match beat for beat
  const play = weak => {
    g.RNG.seed(9);
    const V = g.mkTeams(),
      x = g.newMatch(V[2], V[3], true, weak ? { weak } : {});
    let out = '';
    while (!x.over) out += JSON.stringify(g.playRally(x).beats);
    return out + JSON.stringify(x.setScores);
  };
  assert(play([0, 0]) === play(null), '[0, 0] changes nothing');
});
