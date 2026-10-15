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
    L = CM.cards[i].bk[k];
  if (!L) return 1;
  let v = 0;
  for (const b of L) if ((!b.need || hasTech(p, b.need)) && (!b.when || CM.pts[i] < CM.pts[1 - i])) v += b.v;
  return 1 + v / 100;
}

/** Start a match's cards (newMatch): opts.cards === false → none; opts.cards[i] = { by: 'you' | 'ai', pick: { slot: id } }. */
function cardsInit(m, opts) {
  if (opts.cards === false) return (m.cards = null);
  m.cards = [0, 1].map(i => ({
    by: (opts.cards && opts.cards[i] && opts.cards[i].by) || 'ai', // who runs the side's hand: you (Monster / captain) or the coach
    mine: (opts.cards && opts.cards[i] && opts.cards[i].mine) || 0, // career: how many cards are yours (1 / 2 / 5)
    you: {}, // slot → card id you placed (kept at a turn unless spent)
    slots: Object.fromEntries(SLOTS.map(k => [k, null])),
    net: {}, // card (or combo) id → net points while slotted
    worn: [], // ids at TURN.worn or below
    spent: [], // ids burnt for the match
    played: {}, // id → turns it was slotted (the result card)
    force: [],
    buff: [],
    bk: {},
    cord: [] // orders the cards set: [player id, kind, value] (cleared before the next apply)
  }));
  m.turnAt = 0;
  m.turnN = 0;
  m.turnNow = false;
  m.turnLog = [];
  for (const i of [0, 1]) {
    const pick = opts.cards && opts.cards[i] && opts.cards[i].pick;
    if (pick) for (const k in pick) cardPut(m, i, k, pick[k]);
    cardFill(m, i);
  }
}

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
  if (!C || !SLOTS.includes(k)) return false;
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
  let s = c.src === 'tech' ? A.tech : c.src === 'trait' ? A.trait : c.src === 'op' ? A.op : A.play;
  if (styled) s += A.style;
  const { theirs, ours, oa, weakGap, aceGap, T } = X;
  if (id === 'hunt' && (weakGap >= PLAN_AI.passGap || ours.some(g => g.kind === 'serve'))) s += A.read;
  if (id === 'target' && weakGap >= PLAN_AI.passGap) s += A.read / 2;
  if (id === 'wall' && (aceGap >= PLAN_AI.aceGap || theirs.some(g => g.kind === 'lane'))) s += A.read;
  if (id === 'cover' && theirs.some(g => g.kind === 'serve')) s += A.read;
  if (id === 'deep' && ours.some(g => g.kind === 'fooled')) s += A.read;
  if (id === 'power' && theirs.some(g => g.kind === 'read')) s += A.read;
  if (id === 'commit' && oa.n >= 8 && oa.q / oa.n > 0.35) s += A.read;
  if (c.need) s *= Math.min(1.6, T.P.filter(p => hasTech(p, c.need)).length * 0.5 + 0.5); // more holders on court, more worth
  if (c.when === 'behind' && m.pts[i] + 2 <= m.pts[1 - i]) s += 1;
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
    X = cardCtx(m, i);
  for (const k of SLOTS) {
    if (C.slots[k]) continue;
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
            : squadOf(T).filter(p => hasTech(p, c.need));
    for (const p of who) {
      if (mtr(m, p) === 'stubborn' || ordOf(m, p, k)) continue;
      const v = v0 === 'weak' ? weakPasser(m.t[1 - i]).id : v0;
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
    for (const k in c.buff || {}) C.buff.push({ k, v: c.buff[k], need: c.need, when: c.when });
  }
  for (const k in COMBOS)
    if (ids.some(id => comboOf(ids, id) === k)) for (const s in COMBOS[k].buff) C.buff.push({ k: s, v: COMBOS[k].buff[s] });
  C.bk = {}; // stat → its buffs (cardBuff reads this on every effective-stat call)
  for (const b of C.buff) (C.bk[b.k] || (C.bk[b.k] = [])).push(b);
  // OP cards: Fever Rush when newly slotted; Element Surge every turn
  if (ids.includes('rush') && !prev.includes('rush')) morAdd(m, i, 0.3);
  if (ids.includes('surge') && m.eg) for (const p of T.P) elBuff(m, p);
  C.prev = ids;
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
      const key = comboOf(ids, id) || id;
      if (seen.has(key)) continue;
      seen.add(key);
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
  return m.rec ? { dur: 300, acts: [{ k: 'turn', n: m.turnN, snap: snap(m) }] } : null;
}
