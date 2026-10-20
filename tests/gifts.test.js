// Talent tiers and gifts (spec §4.35): T-320 (tiers, the roll, growth / body / element / mind effects, what you know).
const { load, test, assert, eq } = require('./harness');

const mkRun = (seed, role = 'WS') => {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role, name: 'Gift' });
  run.event = null;
  return [g, run];
};

test('gifts: tiers from pot (S ≥ 1.4, A ≥ 1.2, B ≥ 0.95, C ≥ 0.75, else D); the named are authored', () => {
  const [g, run] = mkRun(320);
  const T = pot => g.Gifts.tier({ pot });
  eq([1.6, 1.4, 1.39, 1.2, 1.0, 0.95, 0.9, 0.75, 0.74, 0.6].map(T).join(''), 'SSAABBCCDD', 'the bars');
  eq(g.Gifts.tier({}), 'B', 'no pot: 1 → B');
  const rival = g.Stars.get(run, 'rival');
  eq(g.Gifts.tier(rival), 'S', 'Haewon: S (authored; her pot is 1)');
  eq(g.Gifts.of(rival).join(), 'elementBorn,prodigy', 'Haewon: Element-born + Prodigy');
  for (const k of ['reina', 'ren', 'taiga']) {
    const p = g.Stars.get(run, k);
    eq(g.Gifts.tier(p), 'A', `${k}: A`);
    eq(g.Gifts.of(p).length, 1, `${k}: one gift`);
  }
  assert(!g.Run.you(run).gifts, 'the MC has no gift');
});

test('gifts: shares over the league ~45 % one, ~10 % two; never two of one kind; by hash (the main stream untouched)', () => {
  const n = [0, 0, 0];
  let N = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const [g, run] = mkRun(seed);
    for (const p of g.People.all(run)) {
      if (p.named === 'rival' || p.named === 'cohort') continue; // authored
      const G = g.Gifts.of(p);
      assert(
        G.every(id => g.GIFTS[id]),
        'known ids'
      );
      assert(G.length < 2 || g.GIFTS[G[0]].kind !== g.GIFTS[G[1]].kind, 'two gifts are of two kinds');
      n[G.length]++;
      N++;
    }
  }
  const one = n[1] / N,
    two = n[2] / N;
  assert(one > 0.37 && one < 0.53, `one gift: ${(one * 100).toFixed(1)} %`);
  assert(two > 0.05 && two < 0.16, `two gifts: ${(two * 100).toFixed(1)} %`);
  // the same run twice: the same gifts; rolling them draws no R()
  const [a, ra] = mkRun(9),
    [b, rb] = mkRun(9);
  eq(
    a.People.all(ra)
      .map(p => p.gifts.join('+'))
      .join(),
    b.People.all(rb)
      .map(p => p.gifts.join('+'))
      .join(),
    'deterministic per run'
  );
  const x = a.R();
  const p = a.People.all(ra)[0];
  delete p.gifts;
  a.Gifts.roll(ra, p);
  eq(b.R(), x, 'a roll leaves the random stream where it was');
});

test('gifts: Prodigy grows faster than a giftless twin over 28 weeks; Grinder / Gamer / Reader / Late Bloomer factors', () => {
  const pickNpc = (g, run) =>
    g.People.all(run)
      .filter(p => !p.named && run.teams.includes(p.team))
      .sort((x, y) => g.ovr(x) - g.ovr(y) || (x.id < y.id ? -1 : 1))[0];
  const grow = gifts => {
    const [g, run] = mkRun(77),
      p = pickNpc(g, run);
    p.gifts = gifts;
    const o0 = g.ovr(p);
    for (let w = 1; w <= 28; w++) {
      run.week = w;
      g.People.week(run);
    }
    return { id: p.id, o0, o: g.ovr(p) };
  };
  const a = grow(['prodigy']),
    b = grow([]);
  eq(a.id, b.id, 'the same player');
  eq(a.o0, b.o0, 'the same start');
  assert(a.o > b.o, `Prodigy OVR ${a.o} > giftless ${b.o} after 28 weeks (from ${a.o0})`);
  const [g, run] = mkRun(78),
    P = gifts => ({ gifts, pot: 1, power: 50, def: 50, speed: 50, jump: 50, wit: 1, role: 'WS' });
  eq(g.Gifts.grow(run, P([])), 1, 'no gifts: × 1');
  eq(g.Gifts.grow(run, P(['grinder']), 'train'), 1.3, 'Grinder trains × 1.3');
  eq(g.Gifts.grow(run, P(['grinder']), 'match'), 0.7, '… and plays × 0.7');
  eq(g.Gifts.grow(run, P(['gamer']), 'match'), 1.5, 'Gamer plays × 1.5');
  eq(g.Gifts.grow(run, P(['reader']), 'train', 'wit'), 1.3, 'Reader: wit × 1.3');
  eq(g.Gifts.grow(run, P(['reader']), 'train', 'power'), 1, '… nothing else');
  eq(g.Gifts.grow(run, P(['lateBloomer'])), 0.8, 'Late Bloomer: year 1 × 0.8');
  run.year = 2;
  eq(g.Gifts.grow(run, P(['lateBloomer'])), 1.4, '… year 2 × 1.4');
  eq(g.Gifts.grow(run, P(['earlyPeak'])), 1.3, 'Early Peak below 75');
  eq(g.Gifts.grow(run, { ...P(['earlyPeak']), power: 90, def: 90, speed: 90, jump: 90 }), 0.6, '… above');
});

test('gifts: innate — body stats, Wit, Leadership, Twin Element (once, on the roll)', () => {
  const [g, run] = mkRun(321),
    p = g.People.all(run).find(q => !q.named);
  const base = { power: p.power, def: p.def, speed: p.speed, jump: p.jump, wit: p.wit, lead: p.lead };
  g.Gifts.innate(p, ['springLegs', 'leader']);
  eq(p.jump, Math.min(99, base.jump + 4), 'Spring Legs: Jump +4');
  eq(p.lead, Math.min(99, base.lead + 15), 'Natural Leader: Leadership +15');
  g.Gifts.innate(p, ['elementless']);
  eq(p.wit, +(base.wit + 0.2).toFixed(2), 'Elementless: Wit +0.2');
  const q = g.People.all(run).find(x => !x.named && x !== p && !x.el2);
  q.gifts = ['twinElement'];
  g.Gifts.innate(q, q.gifts);
  assert(q.el2 && q.el2 !== q.el && q.sig2 && q.sig2.name, `Twin: a second element (${q.el} + ${q.el2}, ${q.sig2 && q.sig2.name})`);
});

test('gifts: an Elementless player never fires an element spike; Dormant sleeps until the first Cup', () => {
  const g = load(322),
    T = g.mkTeams(),
    p = T[0].P[2];
  Object.assign(p, { op: true, star: true, gifts: ['elementless'] });
  g.elAssign(p);
  assert(!p.elOn, 'an OP Elementless player stays locked');
  const m = g.newMatch(T[0], T[1], false);
  m.eg[p.id] = g.EG.full;
  assert(!g.elReady(m, p) && !g.elBuff(m, p), 'no gauge, no captain’s buff');
  while (!m.over) g.playRally(m);
  assert(!(m.stat[p.id] && m.stat[p.id].els), 'no element spike in a whole match');
  // control: the same player without the gift unlocks
  const q = T[0].P[3];
  Object.assign(q, { op: true, gifts: [] });
  g.elAssign(q);
  assert(q.elOn, 'an OP player without it unlocks');
  // Dormant: locked until woken
  const d = T[1].P[1];
  Object.assign(d, { op: true, gifts: ['dormant'], elOn: false });
  g.elCheck(d);
  assert(!d.elOn, 'Dormant: asleep');
  d.woke = true;
  g.elCheck(d);
  assert(d.elOn, 'woken: unlocks like anyone');
});

test('gifts: Dormant wakes at the Cup for the Cup squads (Gifts.wake)', () => {
  const [g, run] = mkRun(323),
    p = g.People.all(run).find(q => run.teams.includes(q.team) && !q.named);
  Object.assign(p, { gifts: ['dormant'], op: true, elOn: false });
  g.elCheck(p);
  assert(!p.elOn, 'asleep');
  run.cup = { entrants: [{ ids: [p.id] }] };
  g.Gifts.wake(run);
  assert(p.woke && p.elOn, 'awake at its first Cup');
});

test('gifts: match hooks — Element-born fills × 1.3, Iron Frame × 0.85 HP damage, Twin alternates, Choker / Ice Veins late, Contagious', () => {
  const g = load(324),
    T = g.mkTeams(),
    m = g.newMatch(T[0], T[1], false),
    a = T[0].P[2],
    b = T[0].P[3];
  a.elOn = b.elOn = true;
  m.eg[a.id] = m.eg[b.id] = 0;
  a.gifts = ['elementBorn'];
  g.elCharge(m, a, 10);
  g.elCharge(m, b, 10);
  assert(Math.abs(m.eg[a.id] - 13) < 1e-9 && m.eg[b.id] === 10, `Element-born ${m.eg[a.id]} vs ${m.eg[b.id]}`);
  // Iron Frame
  m.hp[a.id] = m.hp[b.id] = 1;
  a.gifts = ['ironFrame'];
  const pa = a.def,
    pb = b.def;
  b.def = pa;
  g.hpHit(m, a, 30);
  const da = 1 - m.hp[a.id];
  a.gifts = [];
  m.hp[a.id] = 1;
  g.hpHit(m, a, 30);
  const d0 = 1 - m.hp[a.id];
  b.def = pb;
  assert(Math.abs(da - d0 * 0.85) < 1e-9, `Iron Frame: ${da.toFixed(4)} = 0.85 × ${d0.toFixed(4)}`);
  // Twin Element: the second spike is the second element
  a.gifts = ['twinElement'];
  a.el2 = g.ELS.find(e => e !== a.el);
  g.elAssign(a);
  m.stat[a.id] = m.stat[a.id] || {};
  m.stat[a.id].els = 0;
  const e1 = g.elSpike(m, a, a, null, T[1], false),
    e2 = g.elSpike(m, a, a, null, T[1], false),
    e3 = g.elSpike(m, a, a, null, T[1], false);
  eq([e1.el, e2.el, e3.el].join(), [a.el, a.el2, a.el].join(), 'first, second, first');
  eq(e2.name, a.sig2.name, 'the second signature');
  // Choker / Ice Veins from 12 points
  const c = T[1].P[0],
    v = T[1].P[1];
  c.gifts = ['choker'];
  v.gifts = ['iceVeins'];
  m.gfP = null;
  m.pts = [12, 3];
  m.mor[c.id] = 0;
  m.mor[v.id] = -0.5;
  g.morAdd(m, 1, -0.2);
  assert(Math.abs(m.mor[c.id] + 0.3) < 1e-9, `Choker drops × 1.5: ${m.mor[c.id]}`);
  eq(m.mor[v.id], g.GIFTS.iceVeins.mor, 'Ice Veins: never Rattled late');
  m.pts = [3, 3];
  m.mor[c.id] = 0;
  g.morAdd(m, 1, -0.2);
  assert(Math.abs(m.mor[c.id] + 0.2) < 1e-9, 'early: as anyone');
  // Contagious: a kill lifts the teammates more
  const lift = gifts => {
    const h = load(325),
      U = h.mkTeams(),
      k = U[0].P[2];
    k.gifts = gifts;
    const mm = h.newMatch(U[0], U[1], false);
    for (const q of h.squadOf(U[0])) mm.mor[q.id] = 0;
    mm.lastK = k.id;
    mm.pts = [1, 0];
    h.morPoint(
      mm,
      0,
      () => 1,
      () => 0
    );
    return mm.mor[U[0].P[0].id];
  };
  assert(Math.abs(lift(['contagious']) - lift([]) - g.GIFTS.contagious.k) < 1e-9, 'Contagious: teammates +k');
});

test('gifts: the card hides them until known — scouted, trained beside, bond 20+ (Gifts.known)', () => {
  const [g, run] = mkRun(326);
  const p = g.People.all(run).find(q => run.teams.includes(q.team) && !q.named),
    ti = run.teams.indexOf(p.team);
  assert(!g.Gifts.known(run, p), 'a stranger: unknown');
  run.scout = { [ti]: run.week };
  assert(g.Gifts.known(run, p), 'their club scouted: known');
  assert(run.people[p.id].known.gifts, 'and stays known');
  const q = g.People.all(run).find(
    x => x.team !== p.team && run.teams.includes(x.team) && !x.named && !g.City.scouted(run, run.teams.indexOf(x.team))
  );
  assert(!g.Gifts.known(run, q), 'another club: unknown');
  g.Rel.add(run, q.id, 'trained');
  assert(g.Gifts.known(run, q), 'trained beside: known');
  const r = g.People.all(run).find(
    x => x.team !== p.team && x !== q && run.teams.includes(x.team) && !x.named && !g.City.scouted(run, run.teams.indexOf(x.team))
  );
  g.Rel.add(run, r.id, 'event', 1);
  assert(g.Rel.bondOf(run, r.id) < 20 && !g.Gifts.known(run, r), 'a small bond: unknown');
  for (let i = 0; i < 40 && g.Rel.bondOf(run, r.id) < 20; i++) {
    assert(!g.Gifts.known(run, r), `bond ${g.Rel.bondOf(run, r.id)}: still unknown`);
    g.Rel.add(run, r.id, 'event', 1);
  }
  assert(g.Rel.bondOf(run, r.id) >= 20 && g.Gifts.known(run, r), `bond ${g.Rel.bondOf(run, r.id)}: known`);
  assert(g.Gifts.known(run, g.Run.you(run)), 'yourself: known');
});

test('gifts: saves keep them (RUN_VERSION 22)', () => {
  const [g, run] = mkRun(327);
  eq(g.RUN_VERSION, 22, 'v22');
  g.Run.save(run);
  const back = g.Run.load(),
    ids = r =>
      g.People.all(r)
        .map(p => `${p.id}:${p.gifts.join('+')}`)
        .join();
  eq(ids(back), ids(run), 'every NPC keeps their gifts');
});

// ---------- T-322: the gift chance ----------
/** A gifted NPC teammate (with a gift on offer) at bond `b` with you. */
const giftFriend = (g, run, gift = 'springLegs') => {
  const p = g.Run.mates(run)[0];
  p.gifts = [gift];
  return p;
};
const bondTo = (g, run, p, b) => {
  for (let i = 0; i < 200 && g.Rel.bondOf(run, p.id) < b; i++) g.Rel.add(run, p.id, 'event', 1);
};

test('gift chance: fires once when a gifted friend’s bond reaches 50; never for a bad gift; at most 2 gifts', () => {
  const [g, run] = mkRun(330),
    p = giftFriend(g, run);
  bondTo(g, run, p, 45);
  assert(!g.Gifts.ask(run) && !run.event, 'under 50: nothing');
  bondTo(g, run, p, 50);
  assert(g.Gifts.ask(run), 'at 50: the offer');
  eq(run.event.id, 'gift', 'an event card');
  eq(run.event.who, p.id, 'from that friend');
  eq(run.event.gift, 'springLegs', 'their gift');
  eq(run.event.cost, g.GIFTS.springLegs.cost, 'its price');
  const d = g.Events.def(run.event, run);
  assert(d && d.title.includes('Spring Legs') && d.a[0].includes(`$${run.event.cost}`), 'the card: ' + JSON.stringify(d));
  g.Events.choose(run, 1);
  assert(!run.event, 'declined');
  bondTo(g, run, p, 70);
  assert(!g.Gifts.ask(run), 'never twice for one friend');
  // bad gifts are never offered
  const [h, r2] = mkRun(331),
    q = giftFriend(h, r2, 'glassBones');
  for (const bad of ['glassBones', 'choker', 'loneWolf', 'elementless', 'dormant', 'earlyPeak']) {
    assert(!h.GIFTS[bad].cost, `${bad}: no price`);
    q.gifts = [bad];
    bondTo(h, r2, q, 60);
    assert(!h.Gifts.ask(r2), `${bad}: not offered`);
  }
  // at most two
  r2.gifts = ['grinder', 'reader'];
  q.gifts = ['springLegs'];
  assert(!h.Gifts.ask(r2), 'two gifts already: no offer');
  assert(!h.Gifts.learn(r2, 'springLegs') && r2.gifts.length === 2, 'learn stops at 2');
});

test('gift chance: paying moves the money and rolls the stated chance (seeded, no R()); declining costs nothing', () => {
  let got = 0,
    n = 0;
  for (let s = 0; s < 40; s++) {
    const [g, run] = mkRun(340 + (s % 4)),
      p = giftFriend(g, run, 'quickTwitch');
    run.pseed = s * 7919 + 1;
    bondTo(g, run, p, 60);
    run.money = 1000;
    assert(g.Gifts.ask(run), 'offered');
    const ch = run.event.p,
      bond = g.Rel.bondOf(run, p.id);
    assert(Math.abs(ch - (0.35 + 0.01 * (bond - 50))) < 1e-9, `chance ${ch} at bond ${bond}`);
    const x = g.R(),
      line = g.Events.choose(run, 0);
    eq(run.money, 1000 - g.GIFTS.quickTwitch.cost, 'paid');
    assert(line.length > 0, 'a diary line');
    const has = run.gifts.includes('quickTwitch');
    if (has) got++;
    n++;
    // the same roll again: the same answer (a hash of the run seed and the friend)
    const [h, r2] = mkRun(340 + (s % 4)),
      q = giftFriend(h, r2, 'quickTwitch');
    r2.pseed = run.pseed;
    bondTo(h, r2, q, 60);
    r2.money = 1000;
    h.Gifts.ask(r2);
    h.Events.choose(r2, 0);
    eq(r2.gifts.includes('quickTwitch'), has, 'seeded');
    eq(h.R(), x, 'the roll drew no R()');
  }
  assert(got > 4 && got < 30, `learned ${got} / ${n} at ~45 %`);
  // decline and short
  const [g, run] = mkRun(350),
    p = giftFriend(g, run);
  bondTo(g, run, p, 55);
  run.money = 100;
  g.Gifts.ask(run);
  const d = g.Events.def(run.event, run);
  assert(d.a[1].includes('Short'), 'short of money: said on the card');
  g.Events.choose(run, 0);
  assert(run.money === 100 && !run.gifts.length && !run.event, 'short: no deal, no money moved');
});

test('gift chance: a learned gift acts on you — Spring Legs Jump +4, Rubber Joints full swing, Grinder training, Natural Leader', () => {
  const [g, run] = mkRun(360),
    you = g.Run.you(run),
    j0 = you.jump;
  assert(g.Gifts.learn(run, 'springLegs'), 'learned');
  eq(you.jump, j0 + 4, 'Jump +4 (your court skill, on top of the body)');
  eq(you.gifts.join(), 'springLegs', 'you carry it (the engine reads you.gifts)');
  g.Body.sync(you, run);
  eq(you.jump, j0 + 4, 'kept through the next sync');
  // Rubber Joints: the swing is never short
  you.body.str = 80;
  you.body.flex = 30;
  assert(g.Body.swing(you.body, you) < 1, 'short before');
  g.Gifts.learn(run, 'rubberJoints');
  eq(g.Body.swing(you.body, you), 1, 'full with Rubber Joints');
  // Grinder: training XP × 1.3 (a fresh run)
  const [h, r2] = mkRun(361);
  const before = h.Training.sim(r2, 'str', 100);
  h.Gifts.learn(r2, 'grinder');
  const after = h.Training.sim(r2, 'str', 100);
  assert(
    after.have > before.have || after.pts > before.pts,
    `Grinder: more from the same session (${JSON.stringify(before)} → ${JSON.stringify(after)})`
  );
  const mt = h.Training.sim(r2, 'str', 100, 'match');
  assert(mt.have < before.have || mt.pts < before.pts, 'Grinder: less from a match');
  const [k, r3] = mkRun(362),
    l1 = k.Run.you(r3).lead;
  k.Gifts.learn(r3, 'leader');
  eq(k.Run.you(r3).lead, Math.min(99, l1 + 15), 'Natural Leader: Leadership +15');
  k.Run.save(r3);
  const back = k.Run.load();
  eq(k.Run.you(back).gifts.join(), 'leader', 'saved and loaded');
});
