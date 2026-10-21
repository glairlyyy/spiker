// Tactic cards and turns (spec §2.32–§2.33). Each side holds five slots (SLOTS) filled from its squad's pool (cardPool): your
// cards first, then the coach's pick around them (cardFill, no draws). Slotted cards compile into the existing levers
// (cardApply): the team plan, the tactic, role orders, forced techniques (cardForce, read at each technique's hook) and stat
// buffs (cardBuff, read through stageBuff). Plays count their net points while slotted (cardTally) and burn at TURN.spent.
// A turn comes every TURN.pts points and at once when a card burns (cardTurn, from end()). m.cards = null → no cards at all.

/** Side i's card state, or null. */
const cardsOf = (m, i) => (m && m.cards ? m.cards[i] : null);
/** The active slotted ids of side i (no empties). */
const cardIds = (m, i) => {
  const C = cardsOf(m, i);
  return C ? SLOTS.map(k => C.slots[k]).filter(Boolean) : [];
};

/** Is technique `id` forced for p (a slotted card of p's side, p owns it, p is not Stubborn)? */
function cardForce(p, id) {
  const C = CM && CM.cards && CM.cards[sideOf(p)];
  return !!(C && C.force.includes(id) && hasTech(p, id) && mtr(CM, p) !== 'stubborn');
}
/** The slotted cards' buff on p for stat k (atk, def, spd, jump, serve) → a multiplier (stageBuff multiplies it in). */
function cardBuff(p, k) {
  if (!CM || !CM.cards) return 1;
  const i = CM.t[0] === p.team ? 0 : 1,
    C = CM.cards[i],
    L = C.bk[k],
    E = C.ek && C.ek[k];
  if (!L && !E) return 1;
  let v = 0;
  if (L) for (const b of L) if (cardFor(p, b) && (!b.when || CARD_FIT[b.when](CM, i))) v += b.v;
  if (E) for (const b of E) if (cardFor(p, b)) v += b.v; // reading pays (spec §2.33): this rally's edges
  return Math.max(0.3, 1 + v / 100);
}

/**
 * The edge part alone of p's card multiplier for stat k (no stage, no boosts): what the physical display divides out — ball
 * speed, flight time and jump height show the player's real body, the edge acts only in the contest (spec §2.33, T-300).
 */
function edgeK(p, k) {
  if (!CM || !CM.cards) return 1;
  const E = CM.cards[CM.t[0] === p.team ? 0 : 1].ek[k];
  if (!E) return 1;
  let v = 0;
  for (const b of E) if (cardFor(p, b)) v += b.v;
  return Math.max(0.3, 1 + v / 100);
}
/** Does a buff / edge entry reach p: its technique (`need`), its trait (`needT`, spec §2.31), a duo's pair both on court (`ids`, §4.36). */
const cardFor = (p, b) =>
  (!b.need || hasTech(p, b.need)) && (!b.needT || mtr(CM, p) === b.needT) && (!b.ids || (b.ids.includes(p.id) && duoOn(p.team, b.ids)));
/** A duo (spec §4.36 4): at least two of its ids on T's court. */
const duoOn = (T, ids) => !!T && T.P.filter(q => ids.includes(q.id)).length >= 2;
/** Side i's duo card id: the ids of its pair (you + the friends it holds), or null (no m.duo: none — every other match). */
const duoIds = (m, i, id) => (m.duo && m.duo[i] && m.duo[i][id]) || null;
/** Start a match's cards (newMatch): opts.cards === false → none; opts.cards[i] = { by: 'you' | 'ai', pick: { slot: id } }. */
function cardsInit(m, opts) {
  if (opts.cards === false) return (m.cards = null);
  m.cards = [0, 1].map(i => ({
    by: (opts.cards && opts.cards[i] && opts.cards[i].by) || 'ai', // who runs the side's hand: you (Monster / captain) or the coach
    mine: (opts.cards && opts.cards[i] && opts.cards[i].mine) ?? (opts.cards && opts.cards[i] && opts.cards[i].by === 'you' ? 5 : 0), // how many cards are yours (career 1 / 2 / 5; a side you run: 5)
    you: {}, // slot → card id you placed (kept at a turn unless spent)
    slots: Object.fromEntries(SLOTS.map(k => [k, null])),
    off: [], // slots this side lacks: a Broken war unit (weakSet, spec §4.34)
    net: {}, // card (or combo) id → net points while slotted
    worn: [], // ids at TURN.worn or below
    spent: [], // ids burnt for the match
    played: {}, // id → turns it was slotted (the result card)
    stat: {}, // id → { fit | mis | ctr: [rallies it acted in, won] } (the balance check; the coach reads ctr)
    st: {}, // id → this rally's state (cardEdges)
    ek: {}, // stat → this rally's edges [{ v, need }] (cardBuff)
    force: [],
    buff: [],
    bk: {},
    cord: [] // orders the cards set: [player id, kind, value] (cleared before the next apply)
  }));
  m.turnAt = 0;
  m.turnN = 0;
  m.turnNow = false;
  m.turnLog = [];
  m.trapNow = true; // traps (spec §2.33) are checked before the next serve, once both hands are set
  for (const i of [0, 1]) {
    const pick = opts.cards && opts.cards[i] && opts.cards[i].pick;
    if (pick) for (const k in pick) cardPut(m, i, k, pick[k]);
    cardFill(m, i);
  }
}

/** Side i's usable slots (SLOTS minus what its war stage takes, spec §4.34). */
const cardSlots = (m, i) => {
  const C = cardsOf(m, i);
  return C ? SLOTS.filter(k => !(C.off && C.off.includes(k))) : [];
};
/** Is card id in side i's pool now (the squad's techniques, traits, OP / element players; not spent)? */
function cardInPool(m, i, id) {
  const c = CARDS[id],
    C = cardsOf(m, i),
    sq = squadOf(m.t[i]);
  if (!c || (C && C.spent.includes(id))) return false;
  if (c.plan && m.planBy && m.planBy[i] === 'you' && m.planFixed && m.planFixed[i]) return false; // plans fixed in prep (old tests)
  if (c.tac && m.tacMode[i] === 'fixed') return false;
  if (c.src === 'base' || c.src === 'coach') return true;
  if (c.src === 'tech') return sq.some(p => hasTech(p, c.need));
  if (c.src === 'trait') return sq.some(p => mtr(m, p) === c.trait);
  if (c.src === 'op') return sq.some(p => p.op || p.elOn);
  if (c.src === 'duo') return !!duoIds(m, i, id) && duoOn(m.t[i], duoIds(m, i, id)); // (only with that friend on court)
  return false;
}
/** Side i's pool: [id]. */
const cardPool = (m, i) => Object.keys(CARDS).filter(id => cardInPool(m, i, id));
/** Can card id go into slot k? (zone; OP only in FLEX) */
const cardFits = (id, k) => {
  const z = slotZone(k),
    c = CARDS[id];
  return !!c && (z === 'flex' || c.zone === z);
};
/** Place card id in slot k for side i (by you): false when it doesn't fit, is spent, not in the pool, or clashes. */
function cardPut(m, i, k, id) {
  const C = cardsOf(m, i);
  if (!C || !SLOTS.includes(k) || (C.off && C.off.includes(k))) return false;
  if (id == null) {
    C.slots[k] = null;
    delete C.you[k];
    return true;
  }
  if (!cardFits(id, k) || !cardInPool(m, i, id)) return false;
  const g = CARDS[id].grp;
  for (const s of SLOTS) if (s !== k && C.slots[s] && (C.slots[s] === id || (g && CARDS[C.slots[s]].grp === g))) C.slots[s] = null;
  for (const s in C.you) if (!C.slots[s]) delete C.you[s];
  C.slots[k] = id;
  C.you[k] = id;
  return true;
}

/** The combo two slotted cards make (COMBOS id) for card id, or null. */
function comboOf(ids, id) {
  for (const [k, A, B] of COMBO_LIST)
    if ((A.includes(id) || B.includes(id)) && A.some(x => ids.includes(x)) && B.some(x => ids.includes(x))) return k;
  return null;
}
/** COMBOS as [id, [first ids], [second ids]]. */
const COMBO_LIST = Object.entries(COMBOS).map(([k, c]) => [k, ...c.cards.map(x => (Array.isArray(x) ? x : [x]))]);

/**
 * The coach's score for card id on side i (no draws): boosts a steady base; plays when the match shows them (a weak passer,
 * a standout ace, their quicks, their tips, the coach panel's tags), its playstyle's plans, the squad's techniques, traits,
 * OP cards; minus a Worn card; plus a combo with what is already chosen.
 */
function cardScore(m, i, id, chosen, X = cardCtx(m, i)) {
  const c = CARDS[id],
    A = CARD_AI,
    C = cardsOf(m, i),
    styled = c.plan && (c.plan.atk === X.style[0] || c.plan.def === X.style[1]);
  if (c.kind === 'boost') return A.boost;
  if (X.dull && !styled) return -9;
  // a trap: worth a slot when they have slotted what it names before and can again (the coach can't see their hand now)
  if (c.kind === 'trap') return c.trap.some(x => X.theirSeen.includes(x)) ? A.trap : -9;
  let s = c.src === 'tech' ? A.tech : c.src === 'trait' ? A.trait : c.src === 'op' ? A.op : c.src === 'duo' ? A.duo : A.play;
  if (styled) s += A.style;
  const { T } = X,
    E = CARD_EDGE[id];
  // what the coach sees (spec §2.33): does the play fit now (the same reads as yours); has it been countered here (it can't
  // see their hand, only what happened when this card was slotted)
  if (E) s += (CARD_FIT[E.fit] || CARD_FIT.always)(m, i) ? A.read : A.misfit;
  const S = C && C.stat[id];
  if (S && S.ctr[0] >= A.seenCtr) s += A.countered;
  if (c.need) s *= Math.min(1.6, T.P.filter(p => hasTech(p, c.need)).length * 0.5 + 0.5); // more holders on court, more worth
  if (C && C.worn.includes(id)) s += A.worn;
  if (comboOf([...chosen, id], id)) s += A.combo;
  return s;
}

/** What the coach reads once per pick: its style, the coach panel's tags it has noticed, their passers' and hitters' gaps. */
function cardCtx(m, i) {
  const T = m.t[i],
    O = m.t[1 - i],
    need = noticeAt(T),
    passQ = q => effD(q) + q.speed * 0.3,
    pas = passersOf(O).map(passQ),
    hit = O.P.filter(q => q.role !== 'S').map(q => q.power * 0.6 + q.jump * 0.4),
    ace = hit.length ? Math.max(...hit) : 0;
  return {
    T,
    theirSeen: m.cards ? Object.keys(m.cards[1 - i].played).filter(x => cardInPool(m, 1 - i, x)) : [],
    dull: (T.coachIQ ?? 0.6) < CARD_AI.dull,
    style: PLAN_STYLE[T.sk] || ['straight', 'read'],
    theirs: m.att ? Coach.tags(m, 1 - i).filter(g => g.n >= need) : [],
    ours: m.att ? Coach.tags(m, i).filter(g => g.n >= need) : [],
    oa: m.att ? m.att[1 - i] : { n: 0, q: 0 },
    weakGap: pas.length ? pas.reduce((a, v) => a + v, 0) / pas.length - Math.min(...pas) : 0,
    aceGap: hit.length > 1 ? ace - (hit.reduce((a, v) => a + v, 0) - ace) / (hit.length - 1) : 0
  };
}
/**
 * Fill side i's empty slots and re-pick the coach's (the slots you placed stay unless spent), then apply (spec §2.33). The
 * coach goes slot by slot (ATK, DEF, FLEX), best score first; one card of a group; OP only in FLEX. No draws.
 */
function cardFill(m, i) {
  const C = cardsOf(m, i);
  if (!C) return;
  for (const k of SLOTS) if (!C.you[k] || C.spent.includes(C.you[k])) ((C.slots[k] = null), delete C.you[k]);
  for (const k of SLOTS) if (C.you[k]) C.slots[k] = C.you[k];
  const pool = cardPool(m, i),
    X = cardCtx(m, i),
    coach = C.by === 'ai' || C.mine < SLOTS.length; // a side you run in full: only your cards (an empty slot stays empty)
  for (const k of SLOTS) {
    if (C.slots[k] || !coach || (C.off && C.off.includes(k))) continue;
    const chosen = cardIds(m, i),
      grps = chosen.map(id => CARDS[id].grp).filter(Boolean);
    let best = null,
      bv = 0;
    for (const id of pool) {
      if (chosen.includes(id) || !cardFits(id, k) || (CARDS[id].grp && grps.includes(CARDS[id].grp))) continue;
      const v = cardScore(m, i, id, chosen, X);
      if (v > bv) [bv, best] = [v, id];
    }
    C.slots[k] = best;
  }
  cardApply(m, i);
  for (const id of cardIds(m, i)) C.played[id] = (C.played[id] || 0) + 1;
}

/**
 * Compile side i's slots into the levers: the team plan (planSet), the tactic, role orders (never over an order the
 * board / a test set), forced techniques, buffs (cards + combos), and the OP cards' on-slot effects.
 */
function cardApply(m, i) {
  const C = cardsOf(m, i),
    T = m.t[i],
    ids = cardIds(m, i),
    prev = C.prev || [];
  // plan
  if (!(m.planFixed && m.planFixed[i])) {
    const plan = { atk: 'straight', def: 'read' };
    for (const id of ids) if (CARDS[id].plan) Object.assign(plan, CARDS[id].plan);
    const cur = planOf(m, i);
    if (cur.atk !== plan.atk || cur.def !== plan.def) planSet(m, i, plan, C.by === 'you' ? 'you' : 'ai');
  }
  // tactic
  if (m.tacMode[i] !== 'fixed') {
    const q = ids.some(id => CARDS[id].tac);
    if (q) ((m.tac[i] = 'mb'), (m.tacMode[i] = 'card'));
    else if (m.tacMode[i] === 'card') ((m.tac[i] = 'auto'), (m.tacMode[i] = 'cap'));
  }
  // orders: clear the cards' own, then set (a Stubborn player takes none; an order someone else set stands)
  for (const [pid, k, v] of C.cord) if (m.ord[pid] && m.ord[pid][k] === v) delete m.ord[pid][k];
  for (const pid in m.ord) if (!Object.keys(m.ord[pid]).length) delete m.ord[pid];
  C.cord = [];
  for (const id of ids) {
    const c = CARDS[id];
    if (!c.ord) continue;
    const [k, v0] = c.ord,
      who =
        c.who === 'mb'
          ? T.P.filter(p => p.role === 'MB')
          : c.who === 'hitters'
            ? T.P.filter(p => p.role !== 'S')
            : c.who === 'setter'
              ? T.P.filter(p => p === T.s || p.role === 'S').slice(0, 1)
              : c.who === 'all'
                ? T.P
                : squadOf(T).filter(p => hasTech(p, c.need));
    for (const p of who) {
      if (mtr(m, p) === 'stubborn' || ordOf(m, p, k)) continue;
      const v = v0 === 'weak' ? weakPasser(m.t[1 - i]).id : v0 === 'hot' ? hotHand(m, i, p).id : v0;
      if (k === 'srv' && srvOpts(p).some(o => o.v === v && o.lock)) continue; // (a type they can't serve)
      ordSet(m, p, k, v);
      C.cord.push([p.id, k, v]);
    }
  }
  // forced techniques and buffs
  C.force = ids.filter(id => CARDS[id].force).map(id => CARDS[id].need);
  C.buff = [];
  for (const id of ids) {
    const c = CARDS[id];
    for (const k in c.buff || {})
      C.buff.push({
        k,
        v: c.buff[k],
        need: c.need,
        needT: c.needT,
        when: c.when,
        ...(c.src === 'duo' ? { ids: duoIds(m, i, id) || [] } : {})
      });
  }
  for (const k in COMBOS)
    if (ids.some(id => comboOf(ids, id) === k)) for (const s in COMBOS[k].buff) C.buff.push({ k: s, v: COMBOS[k].buff[s] });
  C.bk = {}; // stat → its buffs (cardBuff reads this on every effective-stat call)
  for (const b of C.buff) (C.bk[b.k] || (C.bk[b.k] = [])).push(b);
  // on-slot effects (OP, trait and one-shot cards): when newly slotted; Element Surge every turn
  for (const id of ids) if (CARDS[id].on && (!prev.includes(id) || CARDS[id].on === 'surge')) cardOn(m, i, id);
  C.over = Math.max(1, ...ids.map(id => CARDS[id].over || 1)); // Overload: stamina drain × (dr, js/engine/stats.js)
  // a one-shot is used up the moment it fires: out of its slot, gone for the match (no morale cost, no turn)
  for (const k of SLOTS) {
    const id = C.slots[k];
    if (!id || CARDS[id].kind !== 'once') continue;
    C.slots[k] = null;
    delete C.you[k];
    C.spent.push(id);
    C.played[id] = (C.played[id] || 0) + 1;
    (m.cardLog || (m.cardLog = [])).push({ side: i, id, at: [...m.pts], k: 'used' });
  }
  C.prev = cardIds(m, i);
}
/** Our hitter on court with the highest morale (Feed the Hot Hand), not the setter p. */
const hotHand = (m, i, s) =>
  m.t[i].P.filter(q => q !== s && q.role !== 'S').reduce(
    (a, q) => (morOf(m, q) > morOf(m, a) ? q : a),
    m.t[i].P.find(q => q !== s)
  );
/** A card's effect when it is slotted (`on`): Fever Rush, Element Surge, Get In Their Head, Zone, Second Wind, Timeout Talk. */
function cardOn(m, i, id) {
  const T = m.t[i],
    C = cardsOf(m, i);
  switch (CARDS[id].on) {
    case 'rush':
      return morAdd(m, i, 0.3);
    case 'surge':
      if (m.eg) for (const p of T.P) elBuff(m, p);
      return;
    case 'taunt':
      return morAdd(m, 1 - i, -0.15);
    case 'zone': {
      const ace = T.P.filter(q => q.role !== 'S').reduce((a, q) => (effP(q) > effP(a) ? q : a), T.P[0]);
      morAdd(m, i, 0.1);
      m.mor[ace.id] = 1;
      m.mom[i] = fireOf(m, i);
      return;
    }
    case 'wind':
      for (const p of T.P) {
        m.hp[p.id] = 1;
        m.sta[p.id] = Math.min(1, (m.sta[p.id] ?? 1) + 0.25);
      }
      return;
    case 'talk':
      for (const p of T.P) m.mor[p.id] = clamp(morOf(m, p) + 0.25, -1, 1);
      m.mom[i] = fireOf(m, i);
      for (const x of C.worn) if (C.net[x] < 0) C.net[x] = 0;
      C.worn = [];
      return;
  }
}
/**
 * Traps (spec §2.33): before the first serve after a turn, every slotted trap whose named cards the other side has slotted
 * burns that card (cardSpend: their usual cost) and is used up. Returns [{ side, id, trap }] (side: the side that lost id).
 */
function cardTraps(m) {
  m.trapNow = false;
  if (!m.cards) return [];
  const out = [];
  for (const i of [0, 1]) {
    const C = m.cards[i];
    for (const k of SLOTS) {
      const t = C.slots[k],
        c = t && CARDS[t];
      if (!c || c.kind !== 'trap') continue;
      const hit = cardIds(m, 1 - i).find(x => c.trap.includes(x));
      if (!hit) continue;
      C.slots[k] = null;
      delete C.you[k];
      C.spent.push(t);
      (m.cardLog || (m.cardLog = [])).push({ side: i, id: t, at: [...m.pts], k: 'trap', hit });
      cardSpend(m, 1 - i, hit);
      out.push({ side: 1 - i, id: hit, trap: t });
    }
  }
  return out;
}

/** Averages for the reads (no draws): hitters' power in play, blockers' block, passers' receive, the side's Defense. */
const avgOf = (L, f) => (L.length ? L.reduce((a, q) => a + f(q), 0) / L.length : 0);
const hitPow = T =>
  avgOf(
    T.P.filter(q => q.role !== 'S'),
    effP
  );
const blkOf = T =>
  avgOf(
    T.P.filter(q => q.role !== 'S'),
    q => effD(q) * 0.55 + q.jump * 0.45
  );
const defOf2 = T => avgOf(T.P, effD);
/** A side's passers are breaking: a clear weakest passer, or one worn down (HP / stamina). */
function passWeak(m, T) {
  const pas = passersOf(T),
    q = pas.map(p => effD(p) + p.speed * 0.3),
    gap = q.length ? avgOf(q, x => x) - Math.min(...q) : 0;
  return gap >= PLAN_AI.passGap || pas.some(p => hpOf(m, p) < 0.6 || (m.sta[p.id] ?? 1) < 0.5);
}
/**
 * The reads that make a play fit (spec §2.33 balance pass): side i against side o, from what the coach panel and the bars
 * show. No draws.
 */
const CARD_FIT = {
  always: () => true,
  behind: (m, i) => m.pts[i] < m.pts[1 - i],
  weakPass: (m, i) => passWeak(m, m.t[1 - i]),
  ourWeakPass: (m, i) => passWeak(m, m.t[i]),
  weakBlock: (m, i) => hitPow(m.t[i]) >= blkOf(m.t[1 - i]) + 3,
  strongBlock: (m, i) => blkOf(m.t[1 - i]) >= hitPow(m.t[i]) - 3,
  tiredFloor: (m, i) => {
    const P = m.t[1 - i].P;
    return avgOf(P, p => m.sta[p.id] ?? 1) < 0.7 || avgOf(P, p => hpOf(m, p)) < 0.7;
  },
  lowMiddle: (m, i) => {
    const us = m.t[i].P.filter(p => p.role === 'MB'),
      them = m.t[1 - i].P.filter(p => p.role === 'MB');
    return !!us.length && avgOf(us, effP) >= (them.length ? avgOf(them, q => effD(q) * 0.55 + q.jump * 0.45) : 0);
  },
  theirAce: (m, i) => {
    const hit = m.t[1 - i].P.filter(q => q.role !== 'S').map(q => q.power * 0.6 + q.jump * 0.4),
      ace = Math.max(0, ...hit);
    return hit.length > 1 && ace - (hit.reduce((a, v) => a + v, 0) - ace) / (hit.length - 1) >= PLAN_AI.aceGap;
  },
  theirQuicks: (m, i) => {
    const a = m.att[1 - i];
    if (a.n >= 6) return a.q / a.n >= 0.3;
    const T = m.t[1 - i];
    return (
      avgOf(
        T.P.filter(p => p.role === 'MB'),
        effP
      ) >=
      avgOf(
        T.P.filter(p => p.role === 'WS'),
        effP
      )
    );
  },
  theirSoft: (m, i) => hitPow(m.t[1 - i]) <= defOf2(m.t[i]) - 3,
  theirPower: (m, i) => hitPow(m.t[1 - i]) >= defOf2(m.t[i]) + 3,
  // T-304 / T-305
  ahead: (m, i) => m.pts[i] > m.pts[1 - i],
  late: m => Math.max(m.pts[0], m.pts[1]) >= TRAIT_LATE,
  streak: (m, i) => (m.streak ? m.streak[i] : 0) >= 2,
  under: (m, i) => ovrSide(m, i) < ovrSide(m, 1 - i) - 1,
  brink: (m, i) => m.pts[1 - i] >= RULES.pointsToWin - 1 && m.pts[1 - i] > m.pts[i],
  tiredUs: (m, i) => {
    const P = m.t[i].P;
    return avgOf(P, p => hpOf(m, p)) < 0.6 || avgOf(P, p => m.sta[p.id] ?? 1) < 0.6;
  },
  shaken: (m, i) => (m.mom ? m.mom[i] : 0) < -0.2,
  elements: (m, i) => m.t[i].P.some(p => p.elOn),
  fresh: (m, i) => avgOf(m.t[i].P, p => m.sta[p.id] ?? 1) >= 0.75,
  hotHand: (m, i) => m.t[i].P.some(p => p.role !== 'S' && morOf(m, p) >= 0.3),
  strongPass: (m, i) => !passWeak(m, m.t[1 - i]),
  theirSetter: (m, i) => {
    const S = m.t[1 - i].P.find(p => p.role === 'S');
    return !!S && W(S) >= 1.2;
  }
};
/** Side i's on-court average OVR (Underdog, Giant Killer), cached per lineup. */
function ovrSide(m, i) {
  const T = m.t[i],
    key = T.P.map(p => p.id).join(),
    c = (m.ovrC || (m.ovrC = []))[i];
  if (c && c[0] === key) return c[1];
  const v = avgOf(T.P, ovr);
  m.ovrC[i] = [key, v];
  return v;
}
/** A slotted play's state this rally: 'ctr' (the other side holds its counter), 'fit', or 'mis'. */
function cardState(m, i, id) {
  const E = CARD_EDGE[id];
  if (!E) return 'fit';
  const theirs = cardIds(m, 1 - i);
  if (E.ctr.some(x => theirs.includes(x))) return 'ctr';
  return (CARD_FIT[E.fit] || CARD_FIT.always)(m, i) ? 'fit' : 'mis';
}
/** Before every serve (rallyStart): each side's plays' states and their edges (C.st, C.ek) for cardBuff. */
function cardEdges(m) {
  if (!m.cards) return;
  for (const i of [0, 1]) ((m.cards[i].st = {}), (m.cards[i].ek = {}));
  for (const i of [0, 1])
    for (const id of cardIds(m, i)) {
      const c = CARDS[id],
        E = CARD_EDGE[id];
      if (c.kind !== 'play' || !E) continue;
      if (c.need && !m.t[i].P.some(p => hasTech(p, c.need))) continue; // (its holders all on the bench: nothing)
      const st = cardState(m, i, id),
        f = (st === 'fit' ? 1 : st === 'ctr' ? EDGE.ctr : EDGE.mis) * EDGE.k;
      m.cards[i].st[id] = st;
      for (const [who, k, v] of E.e) {
        const C = m.cards[who === 'us' ? i : 1 - i];
        (C.ek[k] || (C.ek[k] = [])).push({ v: v * f, need: who === 'us' && !E.team ? c.need : null });
      }
    }
}

/**
 * After a rally won by w (end(), before the serve moves on): every slotted play on each side that acted in it counts ±1
 * (a combo shares one count); Worn at TURN.worn; Spent at TURN.spent → out for the match, morale down, a turn at once.
 * Stubborn servers / hitters don't count. Returns [{ side, id }] spent.
 */
function cardTally(m, w) {
  if (!m.cards) return [];
  const out = [],
    a0 = m.att0 || [0, 0],
    sv = m.srv0 != null ? m.srv0 : m.serve,
    server = m.srvP0,
    hitter = m.ctx0 && m.ctx0.spiker;
  for (const i of [0, 1]) {
    const C = m.cards[i],
      ids = cardIds(m, i),
      atk = m.att[i].n > a0[i],
      def = m.att[1 - i].n > a0[1 - i];
    const seen = new Set();
    for (const id of ids) {
      const c = CARDS[id];
      if (c.kind !== 'play') continue;
      let acted =
        c.tally === 'serve' ? sv === i : c.tally === 'recv' ? sv !== i : c.tally === 'attack' ? atk : c.tally === 'defend' ? def : true;
      if (c.need && c.tally === 'serve') acted = acted && server && hasTech(server, c.need);
      if (c.need && c.tally === 'attack') acted = acted && m.t[i].P.some(p => hasTech(p, c.need));
      if (c.tally === 'serve' && server && mtr(m, server) === 'stubborn') acted = false;
      if (c.tally === 'attack' && hitter && m.t[i].P.includes(hitter) && mtr(m, hitter) === 'stubborn') acted = false;
      if (!acted) continue;
      const st = (C.st && C.st[id]) || 'fit',
        S = C.stat[id] || (C.stat[id] = { fit: [0, 0], mis: [0, 0], ctr: [0, 0] }); // [rallies, won] by state
      S[st][0]++;
      if (w === i) S[st][1]++;
      const key = comboOf(ids, id) || id;
      if (seen.has(key)) continue;
      seen.add(key);
      if (st === 'fit') continue; // (spec §2.33: a fitting play never burns — only countered / misfit rallies count)
      C.net[key] = (C.net[key] || 0) + (w === i ? 1 : -1);
      const n = C.net[key],
        burn = key in COMBOS ? ids.filter(x => comboOf(ids, x) === key) : [id];
      for (const x of burn) {
        if (n <= TURN.worn && !C.worn.includes(x)) C.worn.push(x);
        if (n > TURN.worn) C.worn = C.worn.filter(y => y !== x);
      }
      if (n <= TURN.spent) for (const x of burn) out.push({ side: i, id: x });
    }
  }
  for (const { side, id } of out) cardSpend(m, side, id);
  return out;
}
/** Card id of side i burns: out of its slot for the match, the team's morale drops (Spiteful players rise), a turn follows. */
function cardSpend(m, i, id) {
  const C = m.cards[i];
  if (C.spent.includes(id)) return;
  C.spent.push(id);
  C.worn = C.worn.filter(x => x !== id);
  for (const k of SLOTS) if (C.slots[k] === id) ((C.slots[k] = null), delete C.you[k]);
  for (const p of m.t[i].P) {
    const sp = mtr(m, p) === 'spiteful';
    m.mor[p.id] = clamp(morOf(m, p) + (sp ? -TURN.spentMor : TURN.spentMor), -1, 1);
  }
  m.mom[i] = fireOf(m, i);
  m.turnNow = true;
  (m.cardLog || (m.cardLog = [])).push({ side: i, id, at: [...m.pts], k: 'spent' });
  cardApply(m, i);
}
/**
 * A turn (spec §2.32): every TURN.pts points played, or at once after a spent card. Each side refills (cardFill: your cards
 * stay, the coach re-picks the rest). Returns the beat that shows it (recording only), or null.
 */
function cardTurn(m) {
  if (!m.cards || m.over) return null;
  const played = m.pts[0] + m.pts[1];
  if (!m.turnNow && played - m.turnAt < TURN.pts) return null;
  m.turnAt = played;
  m.turnNow = false;
  m.turnN++;
  for (const i of [0, 1]) cardFill(m, i);
  m.turnLog.push({ n: m.turnN, at: [...m.pts], slots: [0, 1].map(i => ({ ...m.cards[i].slots })) });
  m.trapNow = true;
  return m.rec ? { dur: 300, acts: [{ k: 'turn', n: m.turnN, snap: snap(m) }] } : null;
}
