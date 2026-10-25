// The deck (spec §2.37, built on §2.31–§2.33): each side plays from a DECK.size deck (the squad's own cards, Basics filling)
// with a hand of DECK.hand, refilled only at turns (every TURN.pts points; a timeout: an extra turn for its side). Between
// points a side plays at most one card (Cards.play) — it acts for its `dur` points, then cools `cd` points in the discard
// pile (OP: used up) — or discards one (Cards.discard: the gap stays until the next turn). Costs hit the payer's bars. Active
// cards compile into the existing levers (cardApply): the team plan, the tactic, role orders, forced techniques (cardForce,
// read at each technique's hook) and stat buffs (cardBuff, through stageBuff), plus the fit / counter edges (cardEdges, T-299).
// The captain plays what you don't (Cards.capPlay, no draws). m.deck = null → no cards at all. Only the shuffles draw R().

/** Side i's deck state, or null. */
const deckOf = (m, i) => (m && m.deck ? m.deck[i] : null);
/** Points played so far (one play a side a point is keyed on it). */
const ptsPlayed = m => m.pts[0] + m.pts[1];

/**
 * Is technique `id` called for p this rally (spec §2.37: a technique card calls the play — its holder goes for it at the next
 * chance): forced (cardForce), or an active card of p's side that names it (D.calls), p not Stubborn.
 */
function cardCalled(p, id) {
  const D = CM && CM.deck && CM.deck[sideOf(p)];
  return (
    !!D &&
    (cardForce(p, id) || (!!D.calls && D.calls.some(c => c.need === id && (!c.pids || c.pids.includes(p.id))) && mtr(CM, p) !== 'stubborn'))
  );
}
/** Is technique `id` forced for p (an active card of p's side, p owns it, p is not Stubborn)? */
function cardForce(p, id) {
  const D = CM && CM.deck && CM.deck[sideOf(p)];
  return !!(
    D &&
    (D.force.includes(id) || (D.forceMe.length && D.forceMe.some(f => f.need === id && f.pids.includes(p.id)))) &&
    ownsTech(p, id) &&
    mtr(CM, p) !== 'stubborn'
  );
}
/** The active cards' buff on p for stat k (atk, def, spd, jump, serve; 'clean': × on errK) → a multiplier (stageBuff multiplies it in). */
function cardBuff(p, k) {
  if (!CM || !CM.deck) return 1;
  const i = CM.t[0] === p.team ? 0 : 1,
    D = CM.deck[i],
    L = D.bk[k],
    E = D.ek && D.ek[k];
  if (!L && !E) return 1;
  let v = 0;
  if (L) for (const b of L) if (cardFor(p, b) && (!b.when || CARD_FIT[b.when](CM, i))) v += b.v;
  if (E) for (const b of E) if (cardFor(p, b)) v += b.v; // reading pays (spec §2.33): this rally's edges
  return Math.max(0.3, 1 + v / 100);
}
/**
 * The edge part alone of p's card multiplier for stat k (no stage, no buffs): what the physical display divides out — ball
 * speed, flight time and jump height show the player's real body, the edge acts only in the contest (spec §2.33, T-300).
 */
function edgeK(p, k) {
  if (!CM || !CM.deck) return 1;
  const E = CM.deck[CM.t[0] === p.team ? 0 : 1].ek[k];
  if (!E) return 1;
  let v = 0;
  for (const b of E) if (cardFor(p, b)) v += b.v;
  return Math.max(0.3, 1 + v / 100);
}
/**
 * Does a buff / edge entry reach p: its technique (`need`), its trait (`needT`, spec §2.31), the players who played it (`pids`:
 * Resolve of the Titan), a duo's pair both on court (`ids`, §4.36).
 */
const cardFor = (p, b) =>
  (!b.need || hasTech(p, b.need)) &&
  (!b.grpT || grpOn(p, b.grpT)) &&
  (!b.needT || b.my || mtr(CM, p) === b.needT) &&
  (!b.pids || b.pids.includes(p.id)) &&
  (!b.ids || (b.ids.includes(p.id) && duoOn(p.team, b.ids)));
/** Is one of p's techniques of amplifier group g on this rally (an amplifier's `hit`, spec §2.37)? */
const grpOn = (p, g) => techsOf(g).some(id => hasTech(p, id));
/** The techniques of amplifier group g (SKILLS[id].grp), cached. */
const techsOf = g => (techsOf.c || (techsOf.c = {}))[g] || (techsOf.c[g] = Object.keys(SKILLS).filter(id => SKILLS[id].grp === g));
/**
 * What card id is made of (spec §2.37 Fusing): [[part id, ×], …, [id, 1]] for a fused card (each part's effects × its `pk`, then
 * the card's own), [[id, 1]] otherwise.
 */
const cardComps = id => {
  const c = CARDS[id];
  return c.parts ? [...c.parts.map((x, k) => [x, c.pk ? c.pk[k] : 1]), [id, 1]] : [[id, 1]];
};
/** Side i's active card ids, fused cards' parts included (counters, traps, "the same card is active"). */
const actIds = (m, i) => deckOf(m, i).act.flatMap(a => cardComps(a.id).map(x => x[0]));
/** A fused card's lead part (its holders, level and read): the part that is not an amplifier, else the first. */
const fuseLead = id => {
  const c = CARDS[id];
  return c.parts ? c.parts.find(x => CARDS[x].kind !== 'basic') || c.parts[0] : id;
};
/** The recipe two cards make (spec §2.37 Fusing), either way round: the fused card's id, or null. */
function fuseOf(a, b) {
  if (!a || !b) return null;
  const R0 =
    fuseOf.ix ||
    (fuseOf.ix = Object.fromEntries(
      Object.keys(CARDS)
        .filter(id => CARDS[id].parts)
        .map(id => [[...CARDS[id].parts].sort().join('+'), id])
    ));
  return R0[[a, b].sort().join('+')] || null;
}
/** A duo (spec §4.36 4): at least two of its ids on T's court. */
const duoOn = (T, ids) => !!T && T.P.filter(q => ids.includes(q.id)).length >= 2;
/** Side i's duo card id: the ids of its pair (you + the friends it holds), or null (no m.duo: none — every other match). */
const duoIds = (m, i, id) => (m.duo && m.duo[i] && m.duo[i][id]) || null;

/**
 * Start a match's decks (newMatch): opts.cards === false → none; opts.cards[i] = { by: 'you' | 'ai', me: player id (career: you
 * play the cards you bring, the captain the rest), deck: [ids] (instead of the squad's own; Basics fill unless fill === false),
 * pin: [ids] (tests / measurements: always active, no cost, no deck) }. Builds, shuffles (R()) and deals each hand.
 */
function cardsInit(m, opts) {
  if (opts.cards === false) return (m.deck = null);
  m.deck = [0, 1].map(i => {
    const o = (opts.cards && opts.cards[i]) || {};
    return {
      by: o.by || 'ai', // who plays the side's hand: you (Monster "You decide" / career captain) or the captain
      me: o.me || null, // career, not captain: your player — the cards you bring are yours to play, the captain plays the rest
      size: DECK.hand, // hand size (a Broken war unit: fewer, weakSet)
      draw: [], // the deck, top first
      hand: [], // DECK.hand places: a card id or null (a gap: played / discarded, refilled at the next turn)
      duel: [], // the duel slot(s) (spec §2.39, T-374: DECK.duel.slots.cap): hand index hand.length + k; a gap until the next turn
      dpile: [], // the duel pile: the deck's duel cards, top first (the slots draw only from it)
      disc: [], // the discard pile: { id, cd } (cd: points left cooling; 0 → shuffled back when the deck runs out)
      used: [], // OP cards gone for the match
      act: [], // active cards: { id, left, per, by, pids, who, lv, at, pin? }
      pt: -1, // points played at this side's last play (one a point)
      held: [], // the hand at the last turn (the captain discards a dead card held a whole turn)
      log: [], // { k: 'play' | 'discard' | 'end' | 'caught' | 'sprung', id, at, by? }
      played: {}, // id → times played (the result card)
      stat: {}, // id → { fit | mis | ctr: [rallies it acted in, won] } (the balance check; the captain reads ctr)
      st: {}, // id → this rally's state (cardEdges)
      ek: {}, // stat → this rally's edges [{ v, need, pids }] (cardBuff)
      force: [],
      forceMe: [], // techniques your own card forces: [{ need, pids }] (spec §2.37 Your hand: only you)
      my: null, // a non-captain's own deck and hand (Cards.myDeck, spec §2.37 Your hand), or null
      buff: [],
      bk: {},
      cord: [] // orders the cards set: [player id, kind, value] (cleared before the next apply)
    };
  });
  m.turnAt = 0;
  m.turnN = 0;
  m.turnLog = [];
  m.cardQ = []; // play acts waiting for the next serve's beats
  m.cardActs = [];
  for (const i of [0, 1]) {
    const o = (opts.cards && opts.cards[i]) || {},
      D = m.deck[i];
    const ids = o.deck ? [...o.deck] : o.pin ? [] : deckOwn(m, i);
    if (o.fill !== false && !o.pin) for (let k = 0; ids.length < DECK.size; k++) ids.push(DECK.basics[k % DECK.basics.length]);
    D.draw = deckShuffle(ids.slice(0, DECK.size));
    duelSplit(D, DECK.duel.slots.cap);
    D.hand = D.draw.splice(0, D.size);
    while (D.hand.length < D.size) D.hand.push(null);
    for (const id of o.pin || []) D.act.push({ id, left: Infinity, per: 'pts', by: null, pids: null, who: [], lv: 1, at: [0, 0], pin: 1 });
    D.held = [...D.hand];
    cardApply(m, i);
  }
}
/**
 * Pile P's deck split (spec §2.39 Duel slot, T-374): its duel cards (kind 'duel') leave the draw for the duel pile `dpile` (order
 * kept), `n` duel slots dealt from it — the hand draws only cards played between points. No draws.
 */
function duelSplit(P, n) {
  P.dpile = P.draw.filter(id => CARDS[id].kind === 'duel');
  P.draw = P.draw.filter(id => CARDS[id].kind !== 'duel');
  P.duel = P.dpile.splice(0, n);
  while (P.duel.length < n) P.duel.push(null);
}
/** Pile P's card at place h: the hand, then its duel slot(s) (h = hand.length + k). */
const slotOf = (P, h) => (h < P.hand.length ? P.hand[h] : (P.duel || [])[h - P.hand.length]) || null;
/** Put v (an id or null: a gap) at place h of pile P (slotOf's places). */
function slotPut(P, h, v) {
  if (h < P.hand.length) P.hand[h] = v;
  else if (P.duel) P.duel[h - P.hand.length] = v;
}
/** Pile P's duel slot gaps refill from its duel pile; an empty one takes its cooled duel cards back (hashed shuffle, no R()). */
function duelRefill(m, P, salt) {
  let n = 0;
  for (let k = 0; k < (P.duel || []).length; k++) {
    if (P.duel[k]) continue;
    if (!P.dpile.length) {
      const cool = P.disc.filter(e => e.cd <= 0 && CARDS[e.id].kind === 'duel');
      P.disc = P.disc.filter(e => !cool.includes(e));
      P.dpile = deckMix(
        cool.map(e => e.id),
        `${cardKey(m)}|duel|${salt}`
      );
    }
    if (!P.dpile.length) break;
    P.duel[k] = P.dpile.shift();
    n++;
  }
  return n;
}
/** A Fisher–Yates shuffle with the game's R() (the only draws the deck makes). */
function deckShuffle(a) {
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(R() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}
/**
 * Side i's own cards (spec §2.37), at most DECK.size: one OP card per OP player's role (DECK.op) and Element Surge for element
 * players, the captain's playbook (DECK.books by style, 2 or 3 by the captain's read, then its duel card DECK.duelBook), each technique a squad player owns (most
 * holders on court first), trait cards. Duo cards join later (Cards.duo: the career's setup). No draws.
 */
function deckOwn(m, i) {
  const T = m.t[i],
    sq = squadOf(T),
    out = [],
    add = id => CARDS[id] && !out.includes(id) && out.push(id);
  for (const p of sq) if (p.op && DECK.op[p.role]) add(DECK.op[p.role]);
  if (sq.some(p => p.elOn)) add('surge');
  const book = DECK.books[T.sk] || DECK.books.balanced;
  for (const id of book.slice(0, DECK.book[capIQ(T) >= DECK.iq ? 1 : 0])) add(id);
  if (DECK.duelBook[T.sk]) add(DECK.duelBook[T.sk]); // (its duel card: T-367)
  const techs = Object.keys(CARDS).filter(id => CARDS[id].src === 'tech' && sq.some(p => hasTech(p, CARDS[id].need))),
    nOn = id => T.P.filter(p => hasTech(p, CARDS[id].need)).length;
  techs.sort((a, b) => nOn(b) - nOn(a));
  for (const id of techs) add(id);
  for (const id in CARDS) if (CARDS[id].src === 'trait' && sq.some(p => mtr(m, p) === CARDS[id].trait)) add(id);
  return out.slice(0, DECK.size);
}

/**
 * Compile side i's active cards into the levers: the team plan (planSet), the tactic, role orders (never over an order the
 * board / a test set), forced techniques and buffs (× the holder level for a technique; `self`: only the players who played it).
 */
function cardApply(m, i) {
  const D = deckOf(m, i),
    T = m.t[i],
    // each active card's parts (a fused card: its parts × pk, then its own effects; spec §2.37 Fusing)
    A = D.act.flatMap(a =>
      cardComps(a.id).map(([id, k]) => ({ ...a, id, k, lv: CARDS[id].need ? a.lv || 1 : 1, need: CARDS[id].need || CARDS[a.id].need }))
    ),
    ids = A.map(a => a.id);
  // plan
  if (!(m.planFixed && m.planFixed[i])) {
    const plan = { atk: 'straight', def: 'read' };
    for (const id of ids) if (CARDS[id].plan) Object.assign(plan, CARDS[id].plan);
    const cur = planOf(m, i);
    if (cur.atk !== plan.atk || cur.def !== plan.def) planSet(m, i, plan, D.by === 'you' ? 'you' : 'ai');
  }
  // tactic
  if (m.tacMode[i] !== 'fixed') {
    const q = ids.some(id => CARDS[id].tac);
    if (q) ((m.tac[i] = 'mb'), (m.tacMode[i] = 'card'));
    else if (m.tacMode[i] === 'card') ((m.tac[i] = 'auto'), (m.tacMode[i] = 'cap'));
  }
  // orders: clear the cards' own, then set (a Stubborn player takes none; an order someone else set stands)
  for (const [pid, k, v] of D.cord) if (m.ord[pid] && m.ord[pid][k] === v) delete m.ord[pid][k];
  for (const pid in m.ord) if (!Object.keys(m.ord[pid]).length) delete m.ord[pid];
  D.cord = [];
  for (const a of A) {
    const c = CARDS[a.id];
    if (!c.ord) continue;
    const [k, v0] = c.ord,
      who = a.my
        ? T.P.filter(p => a.pids.includes(p.id))
        : c.who === 'mb'
          ? T.P.filter(p => p.role === 'MB')
          : c.who === 'hitters'
            ? T.P.filter(p => p.role !== 'S')
            : c.who === 'setter'
              ? T.P.filter(p => p === T.s || p.role === 'S').slice(0, 1)
              : c.who === 'all'
                ? T.P
                : squadOf(T).filter(p => ownsTech(p, c.need));
    for (const p of who) {
      if (mtr(m, p) === 'stubborn' || ordOf(m, p, k)) continue;
      const v = v0 === 'weak' ? weakPasser(m.t[1 - i]).id : v0 === 'hot' ? hotHand(m, i, p).id : v0;
      if (k === 'srv' && srvOpts(p).some(o => o.v === v && o.lock)) continue; // (a type they can't serve)
      ordSet(m, p, k, v);
      D.cord.push([p.id, k, v]);
    }
  }
  // forced techniques and buffs
  D.force = A.filter(a => CARDS[a.id].force && !a.my).map(a => a.need);
  D.forceMe = A.filter(a => CARDS[a.id].force && a.my).map(a => ({ need: a.need, pids: a.pids }));
  D.buff = [];
  D.calls = A.filter(a => a.need && CARDS[a.id].src === 'tech').map(a => ({ need: a.need, pids: a.my ? a.pids : null }));
  D.amp = []; // amplifiers: { g, v, pids? } — their group's technique rate (techRate, spec §2.37)
  for (const a of A) {
    const c = CARDS[a.id],
      who = { ...((c.self || a.my) && a.pids ? { pids: a.pids } : {}), ...(a.my ? { my: 1 } : {}) };
    for (const k in c.buff || {})
      D.buff.push({
        k,
        v: c.buff[k] * (a.lv || 1) * a.k,
        need: c.need,
        needT: c.needT,
        when: c.when,
        ...who,
        ...(c.src === 'duo' ? { ids: duoIds(m, i, a.id) || [] } : {})
      });
    // a strong / OP card's `clean` (spec §2.38): its holders' mistake factor (Formula.errK) × (1 − clean %), as stat 'clean'
    if (c.clean) D.buff.push({ k: 'clean', v: -c.clean * (a.lv || 1) * a.k, need: c.need, needT: c.needT, when: c.when, ...who });
    if (c.amp) {
      D.amp.push({ g: c.amp, v: DECK.amp.rate * a.k, ...(a.my ? { pids: a.pids } : {}) });
      for (const k in c.hit || {}) D.buff.push({ k, v: c.hit[k] * a.k, grpT: c.amp, ...who });
    }
  }
  D.bk = {}; // stat → its buffs (cardBuff reads this on every effective-stat call)
  for (const b of D.buff) (D.bk[b.k] || (D.bk[b.k] = [])).push(b);
}
/** Our hitter on court with the highest morale (Feed the Hot Hand), not the setter p. */
const hotHand = (m, i, s) =>
  m.t[i].P.filter(q => q !== s && q.role !== 'S').reduce(
    (a, q) => (morOf(m, q) > morOf(m, a) ? q : a),
    m.t[i].P.find(q => q !== s)
  );
/** Is INZONE!! active on side i (its Fever lock)? */
const inZoneCard = (m, i) => !!m.deck && m.deck[i].act.some(a => CARDS[a.id].on === 'inzone');
/**
 * A card's effect on play (`on`): Element Surge (full gauges on court; again every point while active), Get In Their Head,
 * Second Wind, Timeout Talk, INZONE!! (straight to Fever). Returns stage acts (INZONE!!).
 */
function cardOn(m, i, id) {
  const T = m.t[i];
  switch (CARDS[id].on) {
    case 'surge':
      if (m.eg) for (const p of T.P) elBuff(m, p);
      return [];
    case 'taunt':
      morAdd(m, 1 - i, -0.15);
      return [];
    case 'wind':
      for (const p of T.P) {
        m.hp[p.id] = 1;
        m.sta[p.id] = Math.min(1, (m.sta[p.id] ?? 1) + 0.25);
      }
      return [];
    case 'talk':
      for (const p of T.P) m.mor[p.id] = clamp(morOf(m, p) + 0.25, -1, 1);
      m.mom[i] = fireOf(m, i);
      return [];
    case 'inzone': {
      // straight to Fever (spec §2.37, owner 2026-10-24); Cards.floor / Cards.hold keep it there while the card lasts
      const c = stageSet(m, i, 'fever', 'card');
      return c ? [c] : [];
    }
  }
  return [];
}
/** A payer list pays `cost` ({ bar, amt }): stamina / HP down to 0.05 at most, morale to −1 (spec §2.37: spam wears them out). */
function cardPay(m, i, P, cost) {
  if (!cost || !P.length) return [];
  for (const p of P) {
    if (cost.bar === 'sta') m.sta[p.id] = clamp((m.sta[p.id] ?? 1) - cost.amt, 0.05, 1);
    else if (cost.bar === 'hp') m.hp[p.id] = clamp(hpOf(m, p) - cost.amt, 0.05, 1);
    else m.mor[p.id] = clamp(morOf(m, p) - cost.amt, -1, 1);
  }
  if (cost.bar === 'mor') m.mom[i] = fireOf(m, i);
  return P.map(p => p.id);
}
/** A technique holder's action level (SKILL.use of the technique's kind) / DECK.lv.ref, clamped (spec §2.37). */
function techLv(p, need) {
  const kind = { Serve: 'serve', Attack: 'spike', Setter: 'set', Defense: 'block' }[(SKILLS[need] || {}).tech] || 'spike',
    U = SKILL.use[kind];
  let v = 0;
  for (const k in U) v += U[k] * p[k];
  return clamp(v / DECK.lv.ref, DECK.lv.min, DECK.lv.max);
}
/** Does player p bring card id (career: the cards you bring are yours to play — your techniques, your trait, your duo)? */
function cardBrings(m, i, p, id) {
  const c = CARDS[id];
  if (!p || !c) return false;
  if (c.src === 'tech') return hasTech(p, c.need);
  if (c.src === 'trait') return mtr(m, p) === c.trait;
  if (c.src === 'duo') return (duoIds(m, i, id) || []).includes(p.id);
  if (c.src === 'op') return id === 'surge' ? !!p.elOn : !!p.op && DECK.op[p.role] === id;
  return false;
}
/** The other side's active traps that name card id. */
const trapsFor = (m, i, id) =>
  deckOf(m, 1 - i).act.filter(a => CARDS[a.id].kind === 'trap' && cardComps(id).some(([x]) => CARDS[a.id].trap.includes(x)));
/** Is side i at a key moment (spec §2.37): set point either way, their Fever, CARD_AI.down+ down from CARD_AI.late points, their run? */
function keyMoment(m, i) {
  const A = CARD_AI,
    a = m.pts[i],
    b = m.pts[1 - i],
    top = Math.max(a, b);
  return (
    top >= RULES.pointsToWin - 1 ||
    m.stage[1 - i] === 'fever' ||
    (b - a >= A.down && top >= A.late) ||
    (m.streak ? m.streak[1 - i] : 0) >= A.run
  );
}

/**
 * Active card a of side i ends (`why` 'done' | 'replaced'): out of play, its after-cost, to its discard pile (OP: used up).
 * Returns the `cardend` act. (The caller re-applies the side's levers.)
 */
function cardEnd(m, i, a, why) {
  const D = deckOf(m, i);
  D.act = D.act.filter(x => x !== a);
  if (CARDS[a.id].on === 'inzone' && m.stage[i] === 'fever') m.fever[i] = 1; // (Fever ends with the card: pointStage's clock)
  const after = CARDS[a.id].after,
    who = after
      ? cardPay(
          m,
          i,
          a.my
            ? m.t[i].P.filter(p => a.pids.includes(p.id))
            : Cards.payers(m, i, a.id, 'after').filter(p => !CARDS[a.id].self || p.id === a.by),
          after
        )
      : [];
  Cards.toDisc(m, i, a.id, a.y);
  D.log.push({ k: 'end', id: a.id, at: [...m.pts], ...(why !== 'done' ? { why } : {}) });
  return { k: 'cardend', side: i, id: a.id, by: a.by, why, ...(after ? { after, who } : {}) };
}
/**
 * Who plays card id from your own hand on side i (spec §2.37 Your hand): a team play — its usual holders; anything else — you,
 * while you are on court (a technique: while you own it). [] → 'holder'.
 */
function myHolders(m, i, id) {
  const Y = Cards.my(m, i),
    c = CARDS[id],
    you = Y && m.t[i].P.find(p => p.id === Y.pid);
  if (c.type === 'team') return Cards.holders(m, i, id);
  return you && (!c.need || ownsTech(you, c.need)) ? [you] : [];
}
/** A 0..1 roll from a string with no R() draw (FNV-1a through an fmix32 finaliser: near keys spread). */
function cardRoll(s) {
  let h = Math.floor(hstr(s) * 4294967296);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** A hashed Fisher–Yates (your own deck and the Dev deck match's: no R() draws, so the match stream is the sims'). */
function deckMix(a, salt) {
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(cardRoll(`${salt}|${k}`) * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}
/** A match's hash key (both teams and the score). */
const cardKey = m => `${m.t[0].name}|${m.t[1].name}|${m.pts[0]}:${m.pts[1]}|${m.turnN}`;
/** Your hand's gaps refill from your deck; an empty deck takes your cooled cards back (hashed shuffle). */
function myRefill(m, Y) {
  for (let h = 0; h < Y.size; h++) {
    if (Y.hand[h]) continue;
    if (!Y.draw.length) {
      const cool = Y.disc.filter(e => e.cd <= 0 && CARDS[e.id].kind !== 'duel');
      Y.disc = Y.disc.filter(e => !cool.includes(e));
      Y.draw = deckMix(
        cool.map(e => e.id),
        `${cardKey(m)}|my`
      );
    }
    if (!Y.draw.length) break;
    Y.hand[h] = Y.draw.shift();
  }
  duelRefill(m, Y, 'my');
}

const Cards = {
  /** Side i's deck state (m.deck[i]) or null. */
  of: deckOf,
  /** Side i's active cards: [{ id, left, per, by, pids, who, lv, at, pin? }] (`left`: points — serves for per 'srv' — to go). */
  active: (m, i) => (deckOf(m, i) ? deckOf(m, i).act : []),
  /** A strong card (the captain saves it): OP, or a cooldown of DECK.strong+. */
  strong: id => CARDS[id].kind === 'op' || CARDS[id].cd >= DECK.strong,
  /** Side i's players on court card id belongs to (its holders): technique owners, trait carriers, the duo, the OP / element player; a playbook card or trap: the captain; a Basic: the court. */
  holders(m, i, id) {
    if (CARDS[id].parts) return Cards.holders(m, i, fuseLead(id)); // a fused card: its lead part's (spec §2.37)
    const c = CARDS[id],
      T = m.t[i];
    if (c.src === 'tech' || c.src === 'trait' || c.src === 'op')
      return T.P.filter(p => cardBrings(m, i, p, id)).sort((a, b) =>
        c.src === 'tech' ? techLv(b, c.need) - techLv(a, c.need) : ovr(b) - ovr(a)
      );
    if (c.src === 'duo') {
      const ids = duoIds(m, i, id);
      return ids && duoOn(T, ids) ? T.P.filter(p => ids.includes(p.id)) : [];
    }
    if (c.src === 'base') return [...T.P];
    return [T.cap || T.P[0]];
  },
  /** Who pays card id's cost (`which`: 'cost' | 'after'): its holders, the captain or everyone on court. */
  payers(m, i, id, which = 'cost') {
    if (CARDS[id].parts) return [...new Set(CARDS[id].parts.flatMap(x => Cards.payers(m, i, x, which)))]; // (both parts' payers)
    const C = CARDS[id][which],
      T = m.t[i];
    if (!C) return [];
    return C.who === 'holder'
      ? Cards.holders(m, i, id).slice(0, CARDS[id].self ? 1 : 9)
      : C.who === 'captain'
        ? [T.cap || T.P[0]]
        : [...T.P];
  },
  /** Can every payer afford card id (each bar after the cost at CARD_AI.floor or above)? Playing anyway is allowed. */
  afford(m, i, id) {
    if (CARDS[id].parts) return CARDS[id].parts.every(x => Cards.afford(m, i, x));
    const C = CARDS[id].cost;
    if (!C) return true;
    const F = CARD_AI.floor[C.bar];
    return Cards.payers(m, i, id).every(
      p => (C.bar === 'sta' ? (m.sta[p.id] ?? 1) : C.bar === 'hp' ? hpOf(m, p) : morOf(m, p)) - C.amt >= F
    );
  },
  /** Does card id's read hold for side i now ("Fits now": what you can read, never their hand)? A card without a read: true. */
  fits(m, i, id) {
    if (CARDS[id].parts) return CARDS[id].parts.every(x => Cards.fits(m, i, x)); // (a fused card: each part's read)
    const E = CARD_EDGE[id];
    return !E || (CARD_FIT[E.fit] || CARD_FIT.always)(m, i);
  },
  /** The holder level card id would play at (a technique: its best holders' level, spec §2.37; others 1). */
  level(m, i, id) {
    const c = CARDS[fuseLead(id)];
    if (c.src !== 'tech') return 1;
    const H = Cards.holders(m, i, fuseLead(id));
    return H.length ? H.reduce((s, p) => s + techLv(p, c.need), 0) / H.length : 1;
  },
  /** Is side i's team hand yours to play (a side you run)? The captain never plays it then. (Your own hand: Cards.my.) */
  mine(m, i) {
    const D = deckOf(m, i);
    return !!D && D.by === 'you';
  },
  /** Side i's non-captain hand (spec §2.37 Your hand: Cards.myDeck), or null. */
  my: (m, i) => (deckOf(m, i) ? deckOf(m, i).my : null),
  /** The pile set a hand index reads: your own hand (`y`) or the side's team hand. */
  pile: (m, i, y) => (y ? Cards.my(m, i) : deckOf(m, i)),
  /** Is a team play active on side i (spec §2.37: one at a time — a new one replaces it)? Returns the active entry. */
  team: (m, i) => (deckOf(m, i) ? deckOf(m, i).act.find(a => !a.pin && CARDS[a.id].type === 'team') : null) || null,
  /**
   * Player p's collection on side i (spec §2.37 Your hand): the cards they bring that are not team plays — their techniques
   * (best holder level first), their trait card, their OP card (Resolve of the Titan). No Basics (they fill the deck).
   */
  collection(m, i, p) {
    const out = [];
    for (const id in CARDS) {
      const c = CARDS[id];
      if (c.type === 'team' || c.src === 'duo' || c.src === 'base' || c.src === 'book') continue;
      if (cardBrings(m, i, p, id)) out.push(id);
    }
    return out.sort((a, b) =>
      CARDS[a].src === 'tech' && CARDS[b].src === 'tech' ? techLv(p, CARDS[b].need) - techLv(p, CARDS[a].need) : 0
    );
  },
  /**
   * A non-captain's own deck on side i (spec §2.37 Your hand; match prep, before the first serve): `ids` (at most DECK.mine;
   * Basics fill), a hand of DECK.myHand, the captain playing the team deck. The cards only pid brings leave the team deck
   * (Basics take their places). `o` { bond 0–100 with the captain, trusted } sets the request odds. Hashed shuffle (no R()).
   */
  myDeck(m, i, pid, ids, o = {}) {
    const D = deckOf(m, i),
      p = squadOf(m.t[i]).find(q => q.id === pid);
    if (!D || !p) return null;
    const own = ids.filter(id => CARDS[id]).slice(0, DECK.mine);
    for (let k = 0; own.length < DECK.mine; k++) own.push(DECK.basics[k % DECK.basics.length]);
    const sq = squadOf(m.t[i]).filter(q => q !== p),
      onlyYou = id => cardBrings(m, i, p, id) && !sq.some(q => cardBrings(m, i, q, id));
    let b = 0;
    const swap = id => (id && CARDS[id].src !== 'base' && onlyYou(id) ? DECK.basics[b++ % DECK.basics.length] : id);
    D.draw = D.draw.map(swap);
    D.hand = D.hand.map(swap);
    // (a duel card only you bring leaves the duel pile and slots: no Basic there — the slot refills from the pile)
    D.dpile = D.dpile.filter(id => !onlyYou(id));
    D.duel = D.duel.map(id => (id && onlyYou(id) ? null : id));
    duelRefill(m, D, 'team');
    D.by = 'ai';
    D.me = pid;
    const Y = (D.my = {
      pid,
      ids: [...own], // the picked deck (match prep shows it)
      size: DECK.myHand,
      draw: deckMix([...own], `${cardKey(m)}|${pid}|${own.join()}`),
      hand: [],
      duel: [], // your duel slot (DECK.duel.slots.me, spec §2.39 T-374) and duel pile
      dpile: [],
      disc: [],
      used: [],
      pt: -1,
      got: [], // cards a request moved into your hand (yours for this match)
      req: { bond: o.bond || 0, trusted: !!o.trusted, n: -1, cool: 0, asks: 0, yes: 0, last: null }
    });
    duelSplit(Y, DECK.duel.slots.me);
    Y.hand = Y.draw.splice(0, Y.size);
    while (Y.hand.length < Y.size) Y.hand.push(null);
    return Y;
  },
  /** Drop side i's own hand (the side goes back to the team deck alone; match prep only — the team deck keeps its Basics). */
  myDrop(m, i) {
    const D = deckOf(m, i);
    if (D) ((D.my = null), (D.me = null));
  },
  /**
   * The Dev deck match as captain (spec §2.37 Dev match; match prep): side i's team deck rebuilt from `ids` (yours) and the squad's
   * own cards, Basics filling DECK.size; hashed shuffle (no R()), a new opening hand.
   */
  teamDeck(m, i, ids) {
    const D = deckOf(m, i);
    if (!D) return;
    const all = [...new Set([...ids.filter(id => CARDS[id]), ...deckOwn(m, i)])].slice(0, DECK.size);
    for (let k = 0; all.length < DECK.size; k++) all.push(DECK.basics[k % DECK.basics.length]);
    D.draw = deckMix(all, `${cardKey(m)}|team|${all.join()}`);
    duelSplit(D, DECK.duel.slots.cap);
    D.hand = D.draw.splice(0, D.size);
    D.disc = [];
    D.held = [...D.hand];
  },
  /**
   * Why you can't ask the captain for team-hand card h of side i now (spec §2.37 Requests), or null: 'off', 'none' (no own hand),
   * 'gap', 'type' (not a team play), 'turn' (only at a turn: until REQ.win points after it), 'asked' (one request a turn), 'active'.
   */
  canAsk(m, i, h) {
    const D = deckOf(m, i),
      Y = D && D.my;
    if (!D || m.over) return 'off';
    if (!Y) return 'none';
    const id = D.hand[h];
    if (!id) return 'gap';
    if (CARDS[id].type !== 'team') return 'type';
    if (ptsPlayed(m) - m.turnAt > REQ.win) return 'turn';
    if (Y.req.n === m.turnN) return 'asked';
    if (D.act.some(a => a.id === id)) return 'active';
    return null;
  },
  /** The yes odds for asking for team-hand card h of side i: { p (0..1), word 'likely' | 'maybe' | 'unlikely' }. No draws. */
  askOdds(m, i, h) {
    const D = deckOf(m, i),
      Y = D && D.my,
      id = D && D.hand[h];
    if (!Y || !id) return { p: 0, word: 'unlikely' };
    const R0 = Y.req,
      p = clamp(
        REQ.base +
          (REQ.bond * clamp(R0.bond, 0, 100)) / 100 +
          (R0.trusted ? REQ.trust : 0) +
          (Cards.fits(m, i, id) ? REQ.fit : REQ.mis) -
          (R0.cool > 0 ? REQ.cool : 0),
        REQ.min,
        REQ.max
      );
    return { p, word: p >= REQ.likely ? 'likely' : p >= REQ.maybe ? 'maybe' : 'unlikely' };
  },
  /**
   * Ask the captain for team-hand card h of side i (spec §2.37 Requests): answered by the odds (a hashed roll, no R()). Yes → the card
   * leaves the captain's hand (a gap there) for your first empty place — none: it takes your last place (that card to your discard
   * pile). No → nothing changes (no bond loss). Returns { ok, id, p, word, into } or null when it can't be asked (Cards.canAsk).
   */
  ask(m, i, h) {
    if (Cards.canAsk(m, i, h)) return null;
    const D = deckOf(m, i),
      Y = D.my,
      id = D.hand[h],
      { p, word } = Cards.askOdds(m, i, h),
      ok = cardRoll(`${cardKey(m)}|ask|${id}|${Y.req.asks}`) < p;
    Y.req.n = m.turnN;
    Y.req.asks++;
    let into = -1;
    if (ok) {
      Y.req.yes++;
      into = Y.hand.indexOf(null);
      if (into < 0) {
        into = Y.size - 1;
        Cards.discard(m, i, into, true);
      }
      D.hand[h] = null;
      Y.hand[into] = id;
      Y.got.push(id);
    }
    Y.req.last = { id, ok, p, at: [...m.pts] };
    D.log.push({ k: 'ask', id, ok, at: [...m.pts] });
    return { ok, id, p, word, into };
  },
  /**
   * Why hand card h of side i can't be played now, or null: 'off' (no deck / over), 'gap', 'point' (this side played this
   * point), 'active' (the same card is active), 'clash' (an active card of its group), 'holder' (none on court).
   */
  can(m, i, h, y) {
    const D = deckOf(m, i),
      H = Cards.pile(m, i, y);
    if (!D || !H || m.over) return 'off';
    const id = slotOf(H, h); // (a duel slot: h past the hand)
    if (!id) return 'gap';
    return Cards.canId(m, i, id, y, H);
  },
  /**
   * Fuse hand cards a and b of side i (spec §2.37 Fusing in the hand; `y`: your own hand) when they make a recipe (fuseOf): the
   * fused card takes a's place, b's place stays empty until the next turn. Final. Returns the fused id or null.
   */
  fuse(m, i, a, b, y) {
    const H = Cards.pile(m, i, y);
    if (!H || !m.deck || m.over || a === b) return null;
    const r = fuseOf(H.hand[a], H.hand[b]);
    if (!r) return null;
    H.hand[a] = r;
    H.hand[b] = null;
    deckOf(m, i).log.push({ k: 'fuse', id: r, at: [...m.pts], ...(y ? { y: 1 } : {}) });
    return r;
  },
  /** What hand card h of side i fuses with: [{ h, id }] (the other place, the fused card) — the hand bar's highlights. */
  fusable(m, i, h, y) {
    const H = Cards.pile(m, i, y),
      a = H && H.hand[h];
    if (!a) return [];
    return H.hand.map((b, k) => (k !== h && b ? { h: k, id: fuseOf(a, b) } : null)).filter(x => x && x.id);
  },
  /** The fused card two ids make, or null (spec §2.37 recipes). */
  recipe: (a, b) => fuseOf(a, b),
  /** A fused card's parts ([] for any other card). */
  parts: id => (CARDS[id] && CARDS[id].parts) || [],
  /** Why card id (in pile H of side i: a hand card, or a fused card not made yet) can't be played now, or null (Cards.can after the gap). */
  canId(m, i, id, y, H) {
    if (CARDS[id].kind === 'duel') return 'duel'; // (only in a hesitation: Cards.duelCan, spec §2.39)
    if (H.pt === ptsPlayed(m)) return 'point';
    const on = actIds(m, i),
      mine = cardComps(id).map(x => x[0]);
    if (mine.some(x => on.includes(x))) return 'active'; // (a fused card: either part active)
    for (const x of mine) {
      const g = CARDS[x].grp;
      if (g && on.some(a => CARDS[a].grp === g && !(CARDS[x].type === 'team' && CARDS[a].type === 'team'))) return 'clash';
    }
    if (!(y ? myHolders(m, i, id) : Cards.holders(m, i, id)).length) return 'holder';
    return null;
  },
  /**
   * Play hand card h of side i (between points): the cost on the payers' bars, the card active from the next serve for its
   * `dur`, its gap left until the next turn; an armed trap of theirs that names it catches it (cost paid, no effect). A
   * one-shot (`dur` 0) acts at once and goes to the discard pile. Returns the `card` act (queued for the next serve's beats)
   * or null when it can't be played (Cards.can).
   */
  play(m, i, h, y) {
    if (Cards.can(m, i, h, y)) return null;
    const cm0 = CM;
    CM = m;
    const D = deckOf(m, i),
      P = Cards.pile(m, i, y),
      id = P.hand[h],
      c = CARDS[id],
      my = !!y && c.type !== 'team', // your own individual / debuff card: you hold it, pay it and it acts on you (spec §2.37)
      H = y ? myHolders(m, i, id) : Cards.holders(m, i, id),
      by = (y ? H[0] : CARDS[fuseLead(id)].src === 'base' ? m.t[i].cap || H[0] : H[0]).id,
      // the cost on the payers' bars — a fused card: both parts' (spec §2.37 Fusing)
      who = [
        ...new Set((c.parts || [id]).flatMap(x => cardPay(m, i, my ? (CARDS[x].cost ? H : []) : Cards.payers(m, i, x), CARDS[x].cost)))
      ],
      at = [...m.pts],
      act = {
        k: 'card',
        side: i,
        id,
        by,
        op: c.kind === 'op',
        dur: c.dur,
        per: c.per,
        who,
        cost: c.cost || null,
        ...(c.parts ? { parts: [...c.parts], costs: c.parts.map(x => CARDS[x].cost || null) } : {}),
        st: cardState(m, i, id)
      },
      out = [act];
    P.hand[h] = null;
    P.pt = ptsPlayed(m);
    D.played[id] = (D.played[id] || 0) + 1;
    D.log.push({ k: 'play', id, at, by, ...(y ? { y: 1 } : {}) });
    const trap = trapsFor(m, i, id)[0];
    if (y && P.got.includes(id) && (trap || act.st === 'ctr')) P.req.cool = REQ.coolT; // a granted card misplayed (spec §2.37)
    if (trap) {
      // caught (spec §2.33 traps): the card is wasted, the trap used up
      act.caught = trap.id;
      Cards.toDisc(m, i, id, y);
      D.log.push({ k: 'caught', id, at, by: trap.id });
      const O = deckOf(m, 1 - i);
      O.act = O.act.filter(a => a !== trap);
      Cards.toDisc(m, 1 - i, trap.id);
      O.log.push({ k: 'sprung', id: trap.id, at, hit: id });
      out.push({ k: 'cardend', side: 1 - i, id: trap.id, by: trap.by, why: 'sprung', hit: id });
    } else if (!c.dur) {
      out.push(...cardOn(m, i, id));
      Cards.toDisc(m, i, id, y);
    } else {
      const old = c.type === 'team' && Cards.team(m, i); // one team play active a side: the new one replaces it (spec §2.37)
      if (old) out.push(cardEnd(m, i, old, 'replaced'));
      const pids = c.self || my ? [by] : H.map(p => p.id),
        lv = my && CARDS[fuseLead(id)].src === 'tech' ? techLv(H[0], CARDS[fuseLead(id)].need) : Cards.level(m, i, id);
      D.act.push({ id, left: c.dur, per: c.per, by, pids, who, lv, at, ...(y ? { y: 1 } : {}), ...(my ? { my: 1 } : {}) });
      out.push(...cardOn(m, i, id));
      cardApply(m, i);
    }
    m.cardQ.push(...out);
    CM = cm0;
    return act;
  },
  /** Discard hand card h of side i (any time between points): to the discard pile (an OP card: gone), the gap stays until the next turn. */
  discard(m, i, h, y) {
    const D = deckOf(m, i),
      P = Cards.pile(m, i, y);
    if (!D || !P || m.over || !slotOf(P, h)) return false;
    const id = slotOf(P, h); // (a duel slot too: h past the hand, spec §2.39 T-374)
    slotPut(P, h, null);
    Cards.toDisc(m, i, id, y);
    D.log.push({ k: 'discard', id, at: [...m.pts], ...(y ? { y: 1 } : {}) });
    return true;
  },
  /** Card id of side i leaves play: cooling in the discard pile (`y`: your own) for its `cd` points, an OP card used up for the match. */
  toDisc(m, i, id, y) {
    if (CARDS[id].parts) return CARDS[id].parts.forEach(x => Cards.toDisc(m, i, x, y)); // a fused card: both parts cool (spec §2.37)
    const D = Cards.pile(m, i, y) || deckOf(m, i);
    if (CARDS[id].cd === Infinity) D.used.push(id);
    else D.disc.push({ id, cd: CARDS[id].cd });
  },
  /**
   * The captain's pick for side i (spec §2.37, no draws): a hand index or −1. Only cards it may play (not yours), playable,
   * affordable and fitting (a trap: when they have played what it names); a strong card waits for a key moment when the
   * captain's read (capIQ) is sharp enough (CARD_AI.wait / waitOp); best score first.
   */
  capPlay(m, i) {
    const D = deckOf(m, i);
    if (!D || D.by === 'you' || D.pt === ptsPlayed(m)) return -1;
    const A = CARD_AI,
      iq = capIQ(m.t[i]),
      key = keyMoment(m, i),
      seen = deckOf(m, 1 - i)
        .log.filter(e => e.k === 'play')
        .map(e => e.id),
      team = !!Cards.team(m, i); // (one team play a side: the captain does not replace its own running one)
    let best = -1,
      bv = 0,
      pair = null;
    const score = id => {
      const c = CARDS[id],
        strong = Cards.strong(id),
        S = D.stat[id];
      if (c.kind === 'trap') {
        if (!c.trap.some(x => seen.includes(x) && !deckOf(m, 1 - i).used.includes(x)) || D.act.some(a => CARDS[a.id].kind === 'trap'))
          return;
      } else if (!Cards.fits(m, i, id)) return;
      if (strong && !key && iq >= (c.kind === 'op' ? A.waitOp : A.wait)) return; // saved for a key moment
      let v =
        A[
          c.parts
            ? 'fuse'
            : c.kind === 'basic'
              ? 'basic'
              : c.kind === 'op' || c.kind === 'trap' || c.kind === 'once'
                ? c.kind
                : c.src === 'tech' || c.src === 'trait' || c.src === 'duo'
                  ? c.src
                  : 'play'
        ];
      const E = CARD_EDGE[fuseLead(id)];
      if (E && E.fit !== 'always') v += A.read;
      if (c.need) v *= Math.min(1.6, Cards.holders(m, i, id).length * 0.5 + 0.5); // more holders on court, more worth
      if (S && S.ctr[0] >= A.seenCtr) v += A.countered;
      if (strong && key) v += A.key;
      return v;
    };
    D.hand.forEach((id, h) => {
      if (!id || Cards.can(m, i, h) || !Cards.afford(m, i, id) || (team && CARDS[id].type === 'team')) return;
      const v = score(id);
      if (v != null && v > bv) [bv, best] = [v, h];
    });
    // the captain fuses by the same rules (spec §2.37): a recipe in the hand that beats every single card
    D.hand.forEach((a, h) =>
      D.hand.forEach((b, k) => {
        const r = k > h && fuseOf(a, b);
        if (!r || Cards.canId(m, i, r, false, D) || !Cards.afford(m, i, r) || (team && CARDS[r].type === 'team')) return;
        const v = score(r);
        if (v != null && v > bv) ((bv = v), (pair = [h, k]));
      })
    );
    if (pair) return Cards.fuse(m, i, pair[0], pair[1]) ? pair[0] : -1;
    return best;
  },
  /**
   * Duel cards (spec §2.39, T-367): why hand card h of side i (`y`: your own hand) can't be played in hesitation `hz` (a
   * hesitation log entry: { kind, side, pid, opts }), or null. 'duel' (not a duel card), 'opt' (its option is not one of the
   * two), 'need' (nobody on court knows its technique — none to borrow), 'gap'.
   */
  duelCan(m, i, h, y, hz) {
    const P = Cards.pile(m, i, y),
      id = P && slotOf(P, h);
    if (!id) return 'gap';
    const c = CARDS[id];
    if (c.kind !== 'duel') return 'duel';
    if (!!c.duel.vs !== (i !== hz.side) || !duelFor(id, hz.kind, hz.opts)) return 'opt';
    const p = squadOf(m.t[hz.side]).find(q => q.id === hz.pid);
    if (c.need && !c.duel.vs && p && !ownsTech(p, c.need) && !m.t[i].P.some(q => ownsTech(q, c.need))) return 'need';
    return null;
  },
  /** A duel card's play in hesitation hz: { id, v (the option it plays), borrow (a teammate's technique: × DECK.duel.borrow), cost }. */
  duelInfo(m, i, id, hz) {
    const c = CARDS[id],
      o = duelFor(id, hz.kind, hz.opts),
      p = squadOf(m.t[hz.side]).find(q => q.id === hz.pid),
      borrow = !!(c.need && !c.duel.vs && p && !ownsTech(p, c.need)),
      cost = c.cost ? { ...c.cost, amt: +(c.cost.amt * (borrow ? DECK.duel.borrow : 1)).toFixed(3) } : null;
    return { id, v: o ? o.v : null, borrow, cost };
  },
  /**
   * The AI side's duel card for a hesitation (no draws): the best playable duel card in its team hand (not a side you run)
   * by capPlay's scores (CARD_AI: its source, + read when it fits), affordable for its payer. { h, id, v } or null. `vs`: the
   * receiving side's (Hide).
   */
  duelAI(m, i, p, kind, two, vs) {
    const D = deckOf(m, i);
    if (!D || D.by === 'you' || m.over) return null;
    const hz = { kind, side: vs ? 1 - i : i, pid: p ? p.id : null, opts: two };
    let best = null,
      bv = 0;
    D.duel.forEach((id, k) => {
      const h = D.hand.length + k; // (its duel slots, spec §2.39 T-374)
      if (!id || Cards.duelCan(m, i, h, false, hz)) return;
      const c = CARDS[id],
        inf = Cards.duelInfo(m, i, id, hz),
        payer = c.duel.vs || !p ? m.t[i].cap || m.t[i].P[0] : p,
        C = inf.cost;
      if (
        C &&
        (C.bar === 'sta' ? (m.sta[payer.id] ?? 1) : C.bar === 'hp' ? hpOf(m, payer) : morOf(m, payer)) - C.amt < CARD_AI.floor[C.bar]
      )
        return;
      const v = (CARD_AI[c.src] || CARD_AI.play) + (Cards.fits(m, i, id) ? CARD_AI.read : 0) - (inf.borrow ? 1 : 0);
      if (v > bv) [bv, best] = [v, { h, id, v: inf.v }];
    });
    return best;
  },
  /**
   * Play duel card d ({ h, id, y }) of side i in a hesitation (spec §2.39), mid-rally: its payer (the hesitating player p, a
   * Hide the captain) pays — × DECK.duel.borrow on a borrowed technique — the place is a gap until the next turn, the card cools;
   * its effect for this play (m.duelOn) — Pressure / Hide for DECK.duel.serves serves (m.press / m.hide). v: the option played.
   * Returns the `card` act, or null (the card is no longer there).
   */
  duelPlay(m, i, d, p, kind, two, v) {
    const P = Cards.pile(m, i, d.y),
      D = deckOf(m, i);
    if (!P || slotOf(P, d.h) !== d.id) return null;
    const c = CARDS[d.id],
      hz = { kind, side: c.duel.vs ? 1 - i : i, pid: p ? p.id : null, opts: two },
      inf = Cards.duelInfo(m, i, d.id, hz),
      payer = c.duel.vs || !p ? m.t[i].cap || m.t[i].P[0] : p,
      who = cardPay(m, i, [payer], inf.cost),
      at = [...m.pts];
    slotPut(P, d.h, null);
    Cards.toDisc(m, i, d.id, d.y);
    D.played[d.id] = (D.played[d.id] || 0) + 1;
    D.log.push({ k: 'duel', id: d.id, at, by: payer.id, ...(inf.borrow ? { borrow: 1 } : {}), ...(d.y ? { y: 1 } : {}) });
    if (c.duel.vs) {
      const wp = weakPasser(m.t[i]);
      (m.hide || (m.hide = [null, null]))[i] = { id: wp.id, n: DECK.duel.serves };
    } else {
      m.duelOn = { pid: p.id, id: d.id, pos: m.rallyN };
      if (d.id === 'pressure') {
        const RT = m.t[1 - i],
          tg = tgtResolve(m, p, RT, v);
        if (tg && tg.rc) (m.press || (m.press = [null, null]))[i] = { id: tg.rc.id, n: DECK.duel.serves };
      }
    }
    return {
      k: 'card',
      side: i,
      id: d.id,
      by: payer.id,
      op: false,
      dur: 0,
      per: 'pts',
      who,
      cost: inf.cost,
      st: 'fit',
      duel: kind,
      ...(inf.borrow ? { borrow: 1 } : {})
    };
  },
  /** At a turn: the captain discards its dead cards held since the last turn (no holder on court, or not fitting), if sharp enough. */
  capClear(m, i) {
    const D = deckOf(m, i);
    if (!D || D.by === 'you' || capIQ(m.t[i]) < CARD_AI.waitOp) return;
    D.hand.forEach((id, h) => {
      if (!id || !D.held.includes(id) || Cards.strong(id) || CARDS[id].kind === 'trap' || CARDS[id].kind === 'duel') return;
      if (!Cards.holders(m, i, id).length || !Cards.fits(m, i, id)) Cards.discard(m, i, h);
    });
  },
  /** Refill side i's gaps from the deck; an empty deck takes the cooled cards back (shuffled: R()). Returns the cards dealt. */
  refill(m, i) {
    const D = deckOf(m, i);
    let n = 0;
    for (let h = 0; h < D.size; h++) {
      if (D.hand[h]) continue;
      if (!D.draw.length) {
        const cool = D.disc.filter(e => e.cd <= 0 && CARDS[e.id].kind !== 'duel'); // (duel cards: back to the duel pile)
        D.disc = D.disc.filter(e => !cool.includes(e));
        D.draw = deckShuffle(cool.map(e => e.id));
      }
      if (!D.draw.length) break;
      D.hand[h] = D.draw.shift();
      n++;
    }
    n += duelRefill(m, D, 'team');
    D.held = [...D.hand];
    if (D.my) myRefill(m, D.my);
    return n;
  },
  /** Before every serve (rallyStart): the captains play, then each side's edges. Returns the play acts since the last serve. */
  serve(m) {
    if (m.deck) {
      for (const i of [0, 1]) {
        const h = Cards.capPlay(m, i);
        if (h >= 0) Cards.play(m, i, h);
      }
      cardEdges(m);
    }
    // the rally's technique gate (spec §2.37: owned techniques go on some rallies only — techOn): one R() a match for its salt
    m.gate = { s: m.gateS ?? (m.gateS = R()), n: (m.gateN = (m.gateN || 0) + 1), c: {} };
    m.gate.s = `${m.gate.s}|${m.gate.n}`;
    return m.deck ? m.cardQ.splice(0) : [];
  },
  /** After pointMomentum, before Cards.point (end()): INZONE!!'s side keeps Fever's clock from running out while the card lasts. */
  floor(m) {
    if (!m.deck) return;
    for (const i of [0, 1]) if (inZoneCard(m, i) && m.stage[i] === 'fever') m.fever[i] = Math.max(m.fever[i] || 0, 2);
  },
  /**
   * After pointStage / stageTimeout: an INZONE!! side the point (an error, the zone breaker) or a timeout took out of Fever is
   * put back, its change dropped from `changes` (the stage acts) so nothing shows it leaving. Returns `changes`.
   */
  hold(m, changes) {
    if (!m.deck) return changes;
    for (const i of [0, 1]) {
      if (!inZoneCard(m, i) || m.stage[i] === 'fever') continue;
      stageSet(m, i, 'fever', 'card');
      m.fever[i] = Math.max(m.fever[i] || 0, 2);
      changes = changes.filter(c => !(c.side === i && c.from === 'fever'));
    }
    return changes;
  },
  /**
   * After a rally won by w (end()): each active card's fit / misfit / countered tally (the rallies it acted in), the discard
   * pile cools a point, each active card counts down (serve cards on your serves) and ends at 0: its after-cost, to the
   * discard pile (OP: used up). Element Surge recharges while active. Returns the `cardend` acts.
   */
  point(m, w) {
    m.gate = null; // (the rally is over: owned techniques read as on again)
    if (!m.deck) return [];
    cardTally(m, w);
    const out = [];
    for (const i of [0, 1]) {
      const D = m.deck[i];
      for (const e of D.disc) if (e.cd > 0) e.cd--;
      if (D.my) for (const e of D.my.disc) if (e.cd > 0) e.cd--;
      let ch = false;
      for (const a of [...D.act]) {
        if (a.pin) continue;
        if (a.per !== 'srv' || m.srv0 === i) a.left--;
        if (a.left > 0) {
          if (CARDS[a.id].on === 'surge') cardOn(m, i, a.id);
          continue;
        }
        out.push(cardEnd(m, i, a, 'done'));
        ch = true;
      }
      if (ch) cardApply(m, i);
    }
    return out;
  },
  /** A timeout (spec §2.32): an extra turn for side i — the captain clears, the gaps refill. Returns the cards dealt. */
  extra(m, i) {
    if (!m.deck) return 0;
    Cards.capClear(m, i);
    return Cards.refill(m, i);
  },
  /** Career (spec §4.36): the duo cards of m.duo[i] join side i's deck in place of Basics (deck first, then the hand); no draws. */
  duo(m, i) {
    const D = deckOf(m, i);
    if (!D || !m.duo || !m.duo[i]) return;
    const has = id => D.draw.includes(id) || D.hand.includes(id) || D.disc.some(e => e.id === id);
    for (const id of Object.keys(m.duo[i])) {
      if (has(id)) continue;
      const k = D.draw.map(x => CARDS[x].kind).lastIndexOf('basic');
      if (k >= 0) D.draw[k] = id;
      else {
        const h = D.hand.map(x => x && CARDS[x].kind).lastIndexOf('basic');
        if (h >= 0) D.hand[h] = id;
      }
    }
  }
};

/** A card's state for side i this rally: 'ctr' (the other side has its counter active), 'fit', or 'mis'. */
function cardState(m, i, id) {
  if (CARDS[id].parts) {
    // a fused card: countered if a part is, else fits if every part with a read fits
    const S = CARDS[id].parts.filter(x => CARD_EDGE[x]).map(x => cardState(m, i, x));
    return S.includes('ctr') ? 'ctr' : S.includes('mis') ? 'mis' : 'fit';
  }
  const E = CARD_EDGE[id];
  if (!E) return 'fit';
  const theirs = actIds(m, 1 - i);
  if (E.ctr.some(x => theirs.includes(x))) return 'ctr';
  return (CARD_FIT[E.fit] || CARD_FIT.always)(m, i) ? 'fit' : 'mis';
}
/** Before every serve: each side's active plays' states and their edges (D.st, D.ek) for cardBuff (× a technique's holder level). */
function cardEdges(m) {
  if (!m.deck) return;
  for (const i of [0, 1]) ((m.deck[i].st = {}), (m.deck[i].ek = {}));
  for (const i of [0, 1]) {
    const amps = actIds(m, i)
      .filter(x => CARDS[x].amp)
      .map(x => CARDS[x].amp);
    for (const a of m.deck[i].act) {
      if (CARDS[a.id].parts) m.deck[i].st[a.id] = cardState(m, i, a.id);
      for (const [id, pk] of cardComps(a.id)) {
        const c = CARDS[id],
          E = CARD_EDGE[id],
          mine = a.my ? { pids: a.pids } : {};
        // an amplifier's (or a fused card's) `foe`: % on the other side's stat while active
        for (const k in c.foe || {}) {
          const C = m.deck[1 - i];
          (C.ek[k] || (C.ek[k] = [])).push({ v: c.foe[k] * pk });
        }
        if (c.kind !== 'play' || !E) continue;
        if (c.need && !m.t[i].P.some(p => ownsTech(p, c.need))) continue; // (its holders all on the bench: nothing)
        const st = cardState(m, i, id),
          g = c.need && SKILLS[c.need] && SKILLS[c.need].grp,
          f =
            (st === 'fit' ? 1 : st === 'ctr' ? EDGE.ctr : EDGE.mis) *
            EDGE.k *
            (c.need ? a.lv || 1 : 1) *
            pk *
            (g && amps.includes(g) ? DECK.amp.with : 1); // a technique with its group's amplifier hits harder (spec §2.37)
        m.deck[i].st[id] = st;
        for (const [who, k, v] of E.e) {
          const C = m.deck[who === 'us' ? i : 1 - i];
          (C.ek[k] || (C.ek[k] = [])).push({
            v: v * f,
            need: who === 'us' && !E.team ? c.need : null,
            ...(who === 'us' ? mine : {}) // your own card: its edge is yours (spec §2.37 Your hand)
          });
        }
      }
    }
  }
}
/** After a rally won by w: every active play / OP card that acted in it counts the rally by its state (D.stat; Stubborn servers / hitters don't count). */
function cardTally(m, w) {
  const a0 = m.att0 || [0, 0],
    sv = m.srv0 != null ? m.srv0 : m.serve,
    server = m.srvP0,
    hitter = m.ctx0 && m.ctx0.spiker;
  for (const i of [0, 1]) {
    const D = m.deck[i],
      atk = m.att[i].n > a0[i],
      def = m.att[1 - i].n > a0[1 - i];
    for (const { id } of D.act) {
      const c = CARDS[id];
      if (c.kind === 'basic' || c.kind === 'trap') continue;
      let acted =
        c.tally === 'serve' ? sv === i : c.tally === 'recv' ? sv !== i : c.tally === 'attack' ? atk : c.tally === 'defend' ? def : true;
      if (c.need && c.tally === 'serve') acted = acted && server && hasTech(server, c.need);
      if (c.need && c.tally === 'attack') acted = acted && m.t[i].P.some(p => hasTech(p, c.need));
      if (c.tally === 'serve' && server && mtr(m, server) === 'stubborn') acted = false;
      if (c.tally === 'attack' && hitter && m.t[i].P.includes(hitter) && mtr(m, hitter) === 'stubborn') acted = false;
      if (!acted) continue;
      const st = (D.st && D.st[id]) || 'fit',
        S = D.stat[id] || (D.stat[id] = { fit: [0, 0], mis: [0, 0], ctr: [0, 0] }); // [rallies, won] by state
      S[st][0]++;
      if (w === i) S[st][1]++;
    }
  }
}
/**
 * A turn (spec §2.32): every TURN.pts points played. Each side's captain clears its dead cards, the gaps refill. Returns the
 * beat that shows it (recording only), or null.
 */
function cardTurn(m) {
  if (!m.deck || m.over) return null;
  const played = ptsPlayed(m);
  if (played - m.turnAt < TURN.pts) return null;
  m.turnAt = played;
  m.turnN++;
  for (const i of [0, 1]) Cards.capClear(m, i);
  for (const i of [0, 1]) Cards.refill(m, i);
  for (const i of [0, 1]) if (m.deck[i].my && m.deck[i].my.req.cool > 0) m.deck[i].my.req.cool--; // (the request cooldown, in turns)
  m.turnLog.push({ n: m.turnN, at: [...m.pts], hands: [0, 1].map(i => [...m.deck[i].hand]) });
  return m.rec ? { dur: 300, acts: [{ k: 'turn', n: m.turnN, snap: snap(m) }] } : null;
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
 * The reads that make a play fit (spec §2.33 balance pass): side i against side o, from what the Reads tab and the bars
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
  cold: (m, i) => m.stage[i] === 'loose' || m.stage[i] === 'composed', // INZONE!! (spec §2.37): below Focused
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
