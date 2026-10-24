// Tests: the deck — one-shot cards, turns, costs, the captain's play (spec §2.32–§2.33, §2.37). harness.js has the loader, runner and helpers.
const { load, test, assert, eq } = require('./harness');

/** A tournament match where side 0's wing spikers own Killer Jump Serve and Target Serve (career-learned), pinned active. */
function killerMatch(g, seed, mtrait) {
  g.RNG.seed(seed);
  const T = g.mkTeams(),
    a = T[0],
    b = T[1];
  for (const p of g.squadOf(a)) {
    p.skills = p.role === 'WS' ? ['killer', 'target'] : [];
    if (mtrait !== undefined) p.mtrait = mtrait;
  }
  return g.newMatch(a, b, false, {
    cards: [
      { by: 'you', pin: ['killer', 'target'] },
      { by: 'you', pin: [] }
    ]
  });
}
/** Put card id into hand place 0 of side i (tests). */
const give = (m, i, id) => (m.deck[i].hand[0] = id);

test('cards: an active Killer Serve fires on every holder jump serve; a Stubborn holder is not forced (spec §2.33)', () => {
  const g = load(71);
  const m = killerMatch(g, 3, null),
    ws = m.t[0].P.filter(p => p.role === 'WS');
  for (const p of ws) eq(g.ordOf(m, p, 'srv'), 'killer', 'holder ordered Killer');
  assert(m.deck[0].force.length === 0 && m.deck[0].buff.some(b => b.k === 'serve' && b.need === 'killer'), 'the card buffs its holders');
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

test('cards: the deck — DECK.size cards, the squad’s own first, Basics filling; a hand of DECK.hand; OP cards by role (spec §2.37)', () => {
  const g = load(72);
  g.RNG.seed(4);
  const L = g.mkLeagueTeams();
  for (const p of g.squadOf(L[0])) ((p.skills = []), (p.mtrait = null), (p.op = false), (p.elOn = false));
  const m = g.newMatch(L[0], L[1], false),
    D = m.deck[0],
    all = [...D.hand, ...D.draw];
  eq(all.length, g.DECK.size, 'deck size');
  eq(D.hand.length, g.DECK.hand, 'hand size');
  const own = all.filter(id => g.CARDS[id].kind !== 'basic'),
    book = own.filter(id => g.CARDS[id].src === 'book'),
    known = id => g.squadOf(L[0]).some(p => g.hasTech(p, g.CARDS[id].need));
  assert(book.length >= 2 && book.length <= 3, `the captain's playbook: 2–3 plays (${book})`);
  assert(
    own.every(id => g.CARDS[id].src === 'book' || (g.CARDS[id].src === 'tech' && known(id))),
    `no traits / OP: plays and known techniques only (${own})`
  );
  eq(all.filter(id => g.CARDS[id].kind === 'basic').length, g.DECK.size - own.length, 'Basics fill the rest');
  // a technique joins the deck and takes a Basic's place
  g.RNG.seed(4);
  const L2 = g.mkLeagueTeams();
  for (const p of g.squadOf(L2[0])) ((p.skills = p.role === 'WS' ? ['killer'] : []), (p.mtrait = null), (p.op = false), (p.elOn = false));
  const n = g.newMatch(L2[0], L2[1], false),
    all2 = [...n.deck[0].hand, ...n.deck[0].draw];
  assert(all2.includes('killer'), 'Killer Serve in the deck');
  if (!own.includes('killer')) eq(all2.filter(id => g.CARDS[id].kind === 'basic').length, g.DECK.size - own.length - 1, 'one Basic fewer');
  // Monster: every player OP — God Resolve, Resolve of the Titan, INZONE!! once each
  g.RNG.seed(5);
  const M = g.mkMonsterTeams(),
    o = g.newMatch(M[0], M[1], false),
    ops = [...o.deck[0].hand, ...o.deck[0].draw].filter(id => g.CARDS[id].kind === 'op');
  for (const id of ['god', 'titan', 'inzone']) eq(ops.filter(x => x === id).length, 1, `${id} once`);
});

test('cards: one play a side a point; costs hit the payer’s bar; the hand refills only at turns; a discard leaves a gap (spec §2.37)', () => {
  const g = load(73);
  g.RNG.seed(6);
  const T = g.mkTeams();
  for (const p of g.squadOf(T[0])) p.skills = p.role === 'WS' ? ['killer'] : [];
  const m = g.newMatch(T[0], T[1], false, { cards: [{ by: 'you' }, { by: 'you' }] }),
    D = m.deck[0];
  give(m, 0, 'killer');
  D.hand[1] = 'hunt';
  const H = g.Cards.holders(m, 0, 'killer'),
    st0 = H.map(p => m.sta[p.id] ?? 1),
    cap = m.t[0].cap,
    mor0 = g.morOf(m, cap);
  const a = g.Cards.play(m, 0, 0);
  assert(a && a.k === 'card' && a.id === 'killer' && a.side === 0 && a.by === H[0].id, 'the card act');
  H.forEach((p, k) => assert(Math.abs(m.sta[p.id] - (st0[k] - g.CARDS.killer.cost.amt)) < 1e-9, 'the holders pay stamina'));
  eq(g.Cards.can(m, 0, 1), 'point', 'one play a point');
  eq(g.Cards.play(m, 0, 1), null, 'the second play is refused');
  eq(D.hand[0], null, 'a gap where it was');
  eq(g.Cards.active(m, 0)[0].left, 3, 'active for 3 serves');
  g.playRally(m);
  const mor1 = g.morOf(m, cap);
  assert(g.Cards.play(m, 0, 1), 'next point: Hunt the Passer');
  let sv = 0;
  const hunting = () => g.Cards.active(m, 0).some(x => x.id === 'hunt'),
    rally = () => {
      const on = hunting() && m.serve === 0;
      g.playRally(m);
      if (on) sv++;
    };
  assert(Math.abs(g.morOf(m, cap) - (mor1 - g.CARDS.hunt.cost.amt)) < 1e-9 && mor0 !== undefined, 'the captain pays morale');
  // discard: to the discard pile, the gap stays
  const id2 = D.hand[2];
  assert(g.Cards.discard(m, 0, 2) && D.hand[2] === null && D.disc.some(e => e.id === id2), 'discarded');
  const turn = m.turnN;
  while (m.turnN === turn && !m.over) {
    assert(D.hand[0] === null && D.hand[2] === null, 'no refill between turns');
    rally();
  }
  if (!m.over) assert(D.hand[0] && D.hand[2], 'refilled at the turn');
  // a serve card counts its own side's serves; it ends into the discard pile cooling
  while (hunting() && !m.over) rally();
  if (!m.over) assert(sv === 3 && D.disc.some(e => e.id === 'hunt' && e.cd > 0), `Hunt the Passer ended after 3 serves (${sv}), cooling`);
});

test('cards: an empty deck takes back only cooled cards; an OP card is once a match (spec §2.37)', () => {
  const g = load(73);
  g.RNG.seed(7);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: [{ by: 'you' }, { by: 'you' }] }),
    D = m.deck[0];
  D.draw = [];
  D.hand = [null, null, null, 'pow', 'grd'];
  D.disc = [
    { id: 'hunt', cd: 0 },
    { id: 'power', cd: 3 },
    { id: 'jmp', cd: 0 }
  ];
  g.Cards.refill(m, 0);
  eq([...D.hand].sort().join(), ['grd', 'hunt', 'jmp', 'pow', null].sort().join(), 'the cooled two back, one gap');
  eq(D.disc.map(e => e.id).join(), 'power', 'the cooling one stays');
  // OP: played, ends, used up — never back
  const w = m.t[0].P.find(p => p.role === 'WS');
  w.op = true;
  give(m, 0, 'god');
  assert(g.Cards.play(m, 0, 0), 'God Resolve played');
  assert(D.bk.atk.some(b => b.v === 100) && D.bk.spd.some(b => b.v === 100) && D.bk.jump.some(b => b.v === 100), 'attack, speed, jump × 2');
  for (let k = 0; k < 2 && !m.over; k++) g.playRally(m);
  eq(g.Cards.active(m, 0)[0].left, 1, 'God Resolve: one point left');
  const f0 = m.t[0].P.map(p => g.morOf(m, p)),
    ends = g.Cards.point(m, 1); // (its last point, lost)
  assert(
    ends.some(e => e.k === 'cardend' && e.id === 'god' && e.after && e.who.length === 4),
    'the cardend act with its after-cost'
  );
  assert(
    m.t[0].P.every((p, k) => Math.abs(g.morOf(m, p) - Math.max(-1, f0[k] - 0.3)) < 1e-9),
    'everyone’s morale −0.3'
  );
  assert(D.used.includes('god') && !D.disc.some(e => e.id === 'god'), 'used up');
});

test('cards: the captain plays what fits and saves an OP card for a key moment; a dull captain plays it at once; no draws (spec §2.37)', () => {
  const g = load(74);
  g.RNG.seed(8);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: [null, { by: 'you' }] }),
    D = m.deck[0],
    w = m.t[0].P.find(p => p.role === 'WS');
  w.op = true;
  D.hand = ['god', null, null, null, null];
  const cap = m.t[0].cap,
    lead = cap.lead,
    wit = cap.wit;
  cap.lead = 99;
  cap.wit = 3;
  m.pts = [3, 2];
  m.streak = [1, 0];
  eq(g.Cards.capPlay(m, 0), -1, 'a sharp captain saves it early');
  m.pts = [13, 14];
  eq(g.Cards.capPlay(m, 0), 0, 'set point: now');
  m.pts = [6, 6];
  m.streak = [0, 3];
  eq(g.Cards.capPlay(m, 0), 0, 'to break their run');
  m.streak = [1, 0];
  cap.lead = 0;
  cap.wit = 0;
  eq(g.Cards.capPlay(m, 0), 0, 'a dull captain plays it as soon as it can');
  cap.lead = lead;
  cap.wit = wit;
  // no draws, the same pick twice
  const nx = g.RNG.next;
  let draws = 0;
  g.RNG.next = () => (draws++, nx());
  const p1 = g.Cards.capPlay(m, 0),
    p2 = g.Cards.capPlay(m, 0);
  g.RNG.next = nx;
  eq(draws, 0, 'no draws');
  eq(p1, p2, 'the same pick twice');
});

test('cards: turns every TURN.pts points; sims play cards; a side you run plays none of itself', () => {
  const g = load(73),
    T = g.mkTeams();
  for (let i = 0; i < 8; i++) {
    const m = g.newMatch(T[i % 8], T[(i + 3) % 8], false, { cards: [null, { by: 'you' }] });
    let last = 0;
    while (!m.over) {
      const n = m.turnN;
      g.playRally(m);
      if (m.turnN > n) {
        const at = m.pts[0] + m.pts[1];
        eq(at - last, g.TURN.pts, 'turn after TURN.pts points');
        last = at;
      }
    }
    assert(
      m.deck[0].log.some(e => e.k === 'play'),
      'the captain played'
    );
    assert(!m.deck[1].log.some(e => e.k === 'play'), 'nobody plays for you');
    const pts = m.deck[0].log.filter(e => e.k === 'play').map(e => e.at.join());
    eq(new Set(pts).size, pts.length, 'one play a point');
  }
});

test('cards: no cards (cards: false) is today’s engine — no deck, no buffs, no turns', () => {
  const g = load(74),
    T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: false });
  eq(m.deck, null, 'no deck');
  eq(g.cardBuff(m.t[0].P[0], 'atk'), 1, 'no buff');
  while (!m.over) g.playRally(m);
  eq(m.turnN, undefined, 'no turns');
});

test('cards: a trap catches the card it names; one-shots act at once; INZONE!! holds Focused; holder level scales a technique (T-305, §2.37)', () => {
  const g = load(73);
  g.RNG.seed(9);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: [{ by: 'you' }, { by: 'you' }] });
  give(m, 1, 'strap');
  assert(g.Cards.play(m, 1, 0), 'Serve Trap armed');
  give(m, 0, 'hunt');
  const a = g.Cards.play(m, 0, 0);
  eq(a.caught, 'strap', 'caught');
  assert(!g.Cards.active(m, 0).length && m.deck[0].disc.some(e => e.id === 'hunt'), 'Hunt wasted, cooling');
  assert(!g.Cards.active(m, 1).length && m.deck[1].disc.some(e => e.id === 'strap'), 'the trap used');
  assert(
    m.cardQ.some(x => x.k === 'cardend' && x.why === 'sprung'),
    'the trap’s end act'
  );
  // Timeout Talk: morale up at once, straight to the discard pile
  g.playRally(m);
  const f0 = m.mom[0];
  give(m, 0, 'talk');
  assert(g.Cards.play(m, 0, 0), 'Timeout Talk');
  assert(m.mom[0] > f0 + 0.1 && !g.Cards.active(m, 0).length, `morale up (${f0} → ${m.mom[0]}), not active`);
  // INZONE!!: Fever at once, kept for its 6 points (errors, a cold fire, a timeout against it don't end it), then over
  g.RNG.seed(9);
  const U = g.mkTeams(),
    z = g.newMatch(U[0], U[1], false, { cards: [{ by: 'you' }, { by: 'you' }] });
  z.t[0].P.find(p => p.role === 'S').op = true;
  g.fireTo(z, 0, -0.5);
  z.stage[0] = 'loose';
  give(z, 0, 'inzone');
  const za = g.Cards.play(z, 0, 0);
  assert(za && za.op && z.cardQ.some(x => x.k === 'stage' && x.to === 'fever'), 'INZONE!! played: the stage act');
  eq(z.stage[0], 'fever', 'straight to Fever');
  for (let k = 0; k < 5 && !z.over; k++) {
    g.fireTo(z, 0, -0.6);
    if (k === 2) g.timeout(z, 1, null, true);
    g.playRally(z);
    eq(z.stage[0], 'fever', `point ${k + 1}: still in Fever`);
  }
  if (!z.over) {
    g.fireTo(z, 0, -0.6);
    g.playRally(z);
    assert(!g.Cards.active(z, 0).length && z.stage[0] !== 'fever', `the 6th point ends it (${z.stage[0]})`);
  }
  // holder level: a weak server's Killer Serve is weaker than an ace's
  const p = z.t[0].P[2],
    q = { ...p, power: 40 },
    r = { ...p, power: 99 };
  assert(g.techLv(q, 'killer') < 0.7 && g.techLv(r, 'killer') === g.DECK.lv.max, 'level 40 → low, 99 → max');
});

test('traits: twelve traits, ~85 % of players; Iron Body takes less HP damage; Choker loses more late (spec §2.31, T-304)', () => {
  const g = load(75),
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

test('cards: a Broken side holds a hand of 4 and starts 10 morale lower; [0, 0] is today’s match (spec §4.34, T-314, §2.37)', () => {
  const g = load(73);
  g.RNG.seed(5);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { weak: [3, 0] });
  eq(m.deck[0].hand.length, 4, 'Broken: a hand of 4');
  eq(m.deck[1].hand.length, 5, 'Steady: 5');
  eq(m.deck[0].hand.length + m.deck[0].draw.length, g.DECK.size, 'the fifth card back on the deck');
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
    JSON.stringify([n.mor, n.deck[0].hand, n.deck[0].draw, n.weak]),
    JSON.stringify([m.mor, m.deck[0].hand, m.deck[0].draw, m.weak]),
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

// ---- T-349: card types, your hand of 3, requests (spec §2.37) ----

/** A tournament match with a non-captain wing of side 0 holding their own deck (ids); the captain runs the team deck. */
function myMatch(g, seed, ids, o = {}) {
  g.RNG.seed(seed);
  const T = g.mkTeams(),
    a = T[0];
  for (const p of g.squadOf(a)) p.skills = [];
  const you = a.P.find(p => p.role === 'WS' && !p.cap) || a.P.find(p => !p.cap);
  you.skills = ['killer', 'delay'];
  const m = g.newMatch(a, T[1], false);
  g.Cards.myDeck(m, 0, you.id, ids, o);
  return { m, you, D: m.deck[0], Y: m.deck[0].my };
}

test('cards: every card has a type — team plays (the playbook, God Resolve, INZONE!!), debuffs (traps, Float, Short), individual (spec §2.37, T-349)', () => {
  const g = load(91);
  for (const [id, c] of Object.entries(g.CARDS)) assert(['team', 'solo', 'debuff'].includes(c.type), `${id} typed`);
  for (const id of ['hunt', 'quick', 'commit', 'feedhot', 'wall', 'god', 'inzone']) eq(g.CARDS[id].type, 'team', id);
  for (const id of ['strap', 'qtrap', 'bait', 'float', 'short']) eq(g.CARDS[id].type, 'debuff', id);
  for (const id of ['killer', 'delay', 'readblk', 'take', 'titan', 'pow', 'duo_quick']) eq(g.CARDS[id].type, 'solo', id);
  eq(g.DECK.mine, 6, 'your deck of 6');
  eq(g.DECK.myHand, 3, 'a hand of 3');
});

test('cards: one team play active a side — a new one replaces it; the captain never stacks two (spec §2.37, T-349)', () => {
  const g = load(92);
  g.RNG.seed(4);
  const T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false, { cards: [{ by: 'you' }, { by: 'ai' }] }),
    D = m.deck[0];
  D.hand[0] = 'hunt';
  D.hand[1] = 'deep';
  assert(g.Cards.play(m, 0, 0), 'Hunt the Passer');
  g.playRally(m);
  assert(g.Cards.play(m, 0, 1), 'Dig Deep (another group) is not a clash for a team play');
  const team = D.act.filter(a => g.CARDS[a.id].type === 'team');
  eq(team.length, 1, 'one team play active');
  eq(team[0].id, 'deep', 'the new one');
  assert(
    D.log.some(e => e.k === 'end' && e.id === 'hunt' && e.why === 'replaced'),
    'Hunt replaced, to the discard pile'
  );
  assert(
    D.disc.some(e => e.id === 'hunt'),
    'cooling'
  );
  const end = m.cardQ.find(a => a.k === 'cardend' && a.id === 'hunt');
  eq(end && end.why, 'replaced', 'a cardend act');
  // the captain (side 1) over a whole match: never two team plays at once
  let n = 0;
  while (!m.over) {
    g.playRally(m);
    n = Math.max(n, m.deck[1].act.filter(a => !a.pin && g.CARDS[a.id].type === 'team').length);
  }
  assert(n <= 1, `captain: at most one team play (${n})`);
});

test('cards: your own deck of 6 and hand of 3 beside the captain — Basics fill, your cards leave the team deck, both play on one point, you pay (spec §2.37, T-349)', () => {
  const g = load(93);
  const { m, you, D, Y } = myMatch(g, 5, ['killer', 'delay']);
  eq(Y.size, 3, 'hand of 3');
  eq(Y.hand.filter(Boolean).length, 3, 'dealt 3');
  eq(Y.ids.length, 6, 'deck of 6');
  eq(Y.ids.filter(id => g.CARDS[id].kind === 'basic').length, 4, 'Basics fill');
  eq(D.by, 'ai', 'the captain runs the team deck');
  const others = g.squadOf(m.t[0]).filter(p => p !== you),
    onlyYou = id => g.cardBrings(m, 0, you, id) && !others.some(p => g.cardBrings(m, 0, p, id));
  assert(
    [...D.draw, ...D.hand].every(id => !onlyYou(id)),
    'cards only you bring left the team deck'
  );
  eq(D.hand.length, 5, 'the team hand of 5');
  // your Killer Serve: you hold it, pay it, only you are ordered
  Y.hand[0] = 'killer';
  const mates = m.t[0].P.filter(p => p !== you),
    st = mates.map(p => m.sta[p.id] ?? 1),
    s0 = m.sta[you.id] ?? 1;
  const a = g.Cards.play(m, 0, 0, true);
  assert(a && a.by === you.id, 'your play');
  assert(Math.abs(m.sta[you.id] - (s0 - g.CARDS.killer.cost.amt)) < 1e-9, 'you pay');
  mates.forEach((p, k) => eq(m.sta[p.id] ?? 1, st[k], 'teammates do not'));
  const act = D.act.find(x => x.id === 'killer');
  assert(act.my && act.pids.length === 1 && act.pids[0] === you.id, 'it acts on you');
  eq(g.ordOf(m, you, 'srv'), 'killer', 'you are ordered Killer');
  eq(g.Cards.can(m, 0, 1, true), 'point', 'one card of yours a point');
  const h = D.hand.findIndex((id, k) => id && !g.Cards.can(m, 0, k));
  if (h >= 0) assert(g.Cards.play(m, 0, h), 'the captain can still play this point');
  // refill only at turns (a timeout is an extra turn: held off here)
  const turn = m.turnN,
    ex = g.Cards.extra;
  g.Cards.extra = () => 0;
  while (m.turnN === turn && !m.over) {
    assert(Y.hand[0] === null, 'no refill between turns');
    g.playRally(m);
  }
  g.Cards.extra = ex;
  if (!m.over) assert(Y.hand[0], 'refilled at the turn');
  assert(D.act.every(x => x.id !== 'killer') || D.act.find(x => x.id === 'killer').my, 'still yours');
});

test('cards: requests — odds from bond, trust and the read; a yes moves the card, a no changes nothing; a countered grant cools the next (spec §2.37, T-349)', () => {
  const g = load(94);
  const { m, D, Y } = myMatch(g, 6, ['killer'], { bond: 20 });
  D.hand[0] = 'hunt';
  D.hand[1] = 'pow';
  eq(g.Cards.canAsk(m, 0, 1), 'type', 'only team plays');
  eq(g.Cards.canAsk(m, 0, 0), null, 'at the match start: a turn');
  const p20 = g.Cards.askOdds(m, 0, 0).p;
  Y.req.bond = 80;
  const p80 = g.Cards.askOdds(m, 0, 0).p;
  Y.req.trusted = true;
  const pT = g.Cards.askOdds(m, 0, 0).p;
  assert(p80 > p20 && pT > p80, `bond and trust raise the odds (${p20} < ${p80} < ${pT})`);
  const fit = g.Cards.fits(m, 0, 'hunt');
  assert(Math.abs(pT - (g.REQ.base + g.REQ.bond * 0.8 + g.REQ.trust + (fit ? g.REQ.fit : g.REQ.mis))) < 1e-9, 'the read counts');
  eq(g.Cards.askOdds(m, 0, 0).word, pT >= g.REQ.likely ? 'likely' : pT >= g.REQ.maybe ? 'maybe' : 'unlikely', 'the word');
  // a no: nothing moves, one request a turn
  const mn = g.REQ.min,
    mx = g.REQ.max;
  g.REQ.max = 0;
  g.REQ.min = 0;
  const hand0 = [...Y.hand],
    bond0 = Y.req.bond;
  const no = g.Cards.ask(m, 0, 0);
  assert(no && !no.ok, 'no');
  eq(D.hand[0], 'hunt', 'still the captain’s');
  eq(JSON.stringify(Y.hand), JSON.stringify(hand0), 'your hand unchanged');
  eq(Y.req.bond, bond0, 'no bond loss');
  eq(g.Cards.canAsk(m, 0, 0), 'asked', 'once a turn');
  // next turn: a yes (odds forced to 1) moves it into your hand
  while (m.turnN === 0 && !m.over) g.playRally(m);
  D.hand[0] = 'hunt';
  g.REQ.min = 1;
  g.REQ.max = 1;
  Y.hand[2] = null;
  const yes = g.Cards.ask(m, 0, 0);
  g.REQ.min = mn;
  g.REQ.max = mx;
  assert(yes && yes.ok && yes.into === 2, 'yes → your empty place');
  eq(Y.hand[2], 'hunt', 'in your hand');
  eq(D.hand[0], null, 'a gap in the captain’s');
  assert(Y.got.includes('hunt'), 'granted');
  // played into its counter → the cooldown (turns), odds lower; no bond change
  D.hand[1] = 'beat';
  const before = g.Cards.askOdds(m, 0, 1).p;
  m.deck[1].act.push({ id: 'short', left: 9, per: 'pts', by: null, pids: null, who: [], lv: 1, at: [0, 0] }); // Short Serve counters Quick Tempo
  Y.hand[1] = 'quick';
  Y.got.push('quick');
  Y.pt = -1;
  const a = g.Cards.play(m, 0, 1, true);
  assert(a && a.st === 'ctr', `a granted Quick Tempo played into Short Serve (${a && a.st})`);
  eq(Y.req.cool, g.REQ.coolT, 'request cooldown');
  const after = g.Cards.askOdds(m, 0, 1).p;
  assert(after < before || after === g.REQ.min, `slower to grant (${before} → ${after})`);
  eq(Y.req.bond, bond0, 'still no bond loss');
  const t0 = m.turnN;
  while (m.turnN < t0 + g.REQ.coolT && !m.over) g.playRally(m);
  if (!m.over) eq(Y.req.cool, 0, 'the cooldown runs out at turns');
});

test('cards: your deck pick carries to the next match (run.mydeck); a card you no longer own drops out, Basics fill (spec §2.37, T-354)', () => {
  const g = load(94),
    run = {};
  eq(g.Team.myDeck(run, ['killer']), null, 'an old save: nothing kept (the default pick)');
  const a = myMatch(g, 5, ['killer', 'delay']),
    pool = g.Cards.collection(a.m, 0, a.you);
  assert(pool.includes('killer') && pool.includes('delay'), 'both in your collection');
  g.Team.keepDeck(run, a.Y.ids); // match prep's Start
  eq(run.mydeck.join(), 'killer,delay', 'kept your cards, not the Basics');
  while (!a.m.over) g.playRally(a.m);
  const b = myMatch(g, 6, g.Team.myDeck(run, pool));
  eq(b.Y.ids.join(), a.Y.ids.join(), 'the next match starts with the same 6');
  const c = myMatch(
    g,
    7,
    g.Team.myDeck(
      run,
      pool.filter(id => id !== 'delay')
    )
  ); // Delay no longer yours
  eq(c.Y.ids.filter(id => g.CARDS[id].kind !== 'basic').join(), 'killer', 'a lost card drops out');
  eq(c.Y.ids.length, 6, 'Basics fill');
});
