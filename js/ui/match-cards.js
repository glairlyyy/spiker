// The deck on the match screen (spec §2.37 On screen, §9): the hand bar along the bottom of a played match (always visible, a
// little fanned; 1–5 play — queued for the next serve — Shift+1–5 / right-click discard), the deck and discard piles with their
// lists, the turn's deal, "Pause at turns"; the active cards by the scoreboard; match prep's deck; the result card's row.
// The engine state is m.deck (js/engine/cards.js: Cards.play / discard / can / payers / afford / fits / level / active). The
// engine runs a whole rally ahead of playback, so the bar shows a turn's new cards only once the point is on screen (handSync).

/** Is this a career match (your player is in it)? */
const cardsCareer = () => !!(A && A.fx.onFinish && RUN);
/** You in this match — a career match or the Dev deck match (fx.deck, spec §2.37 Dev match): { p, side, cap } or null. */
function cardsYou(m) {
  if (!A || !m) return null;
  const dv = A.fx.deck,
    id = dv ? dv.pid : cardsCareer() ? Run.you(RUN).id : null;
  if (id == null) return null;
  for (const side of [0, 1]) {
    const p = squadOf(m.t[side]).find(q => q.id === id);
    if (p) return { p, side, cap: dv ? dv.mode === 'captain' : !!p.cap };
  }
  return null;
}
/**
 * How side i's cards are yours (spec §2.37 Who plays): 'team' — you run the team hand of 5 (Monster "You decide", a career / Dev
 * captain); 'my' — a non-captain's own hand of 3 (the captain runs the team deck); '' — the captain runs it all.
 */
function cardsMine(m, i) {
  if (!m || !m.deck) return '';
  const Y = cardsYou(m);
  if (!Y) return !cardsCareer() && !A.fx.deck && A.prepS && A.prepS.who && A.prepS.who[i] === 'you' ? 'team' : '';
  return Y.side !== i ? '' : Y.cap ? 'team' : 'my';
}
/** Give side i to you ('team'), your own hand of 3 beside the captain ('my') or to the captain (''). */
function cardsWho(m, i, mode) {
  const D = m && m.deck && m.deck[i];
  if (!D) return;
  D.by = mode === 'team' ? 'you' : 'ai';
  if (mode !== 'my') Cards.myDrop(m, i);
  else if (!D.my) cardsMyBuild(m, i);
  if (mode === 'team' && A.fx.deck && !ptsPlayed(m)) {
    A.myPick = A.myPick || cardsPool(m, i).slice(0, DECK.mine); // (Dev, as captain: your picks join the team deck)
    cardsTeach(cardsYou(m).p, A.myPick);
    Cards.teamDeck(m, i, A.myPick);
  }
}
/** Your deck's choices (match prep): career — your collection (Cards.collection); the Dev deck match — every card but duos and Basics. */
function cardsPool(m, i) {
  const Y = cardsYou(m);
  if (!Y) return [];
  if (!A.fx.deck) return Cards.collection(m, i, Y.p);
  const T = { solo: 0, debuff: 1, team: 2 };
  return Object.keys(CARDS)
    .filter(id => CARDS[id].src !== 'duo' && CARDS[id].src !== 'base' && !CARDS[id].parts)
    .sort((a, b) => T[CARDS[a].type] - T[CARDS[b].type] || CARDS[a].name.localeCompare(CARDS[b].name));
}
/** Build your own deck from A.myPick (default: the first DECK.mine of your pool — the Dev match: individual plays first). */
function cardsMyBuild(m, i) {
  const Y = cardsYou(m);
  if (!Y || !m.deck) return;
  if (!A.myPick)
    A.myPick =
      (!A.fx.deck && Team.myDeck(RUN, cardsPool(m, i))) || // career: last match's pick carries (spec §2.37)
      cardsPool(m, i)
        .filter(id => !A.fx.deck || CARDS[id].type !== 'team')
        .slice(0, DECK.mine);
  const dv = A.fx.deck,
    o = dv ? { bond: dv.bond, trusted: !!dv.trusted } : Team.cardAsk(RUN, m, i);
  if (dv) cardsTeach(Y.p, A.myPick);
  Cards.myDeck(m, i, Y.p.id, A.myPick, o);
}
/** The Dev deck match: you know every technique you pick (so its card has a holder). */
function cardsTeach(p, ids) {
  for (const id of ids) {
    const c = CARDS[id];
    if (c && c.src === 'tech' && !knowsTech(p, c.need)) (p.skills || (p.skills = [])).push(c.need);
  }
}
/** Match prep: pick or drop card id from your own deck (DECK.mine at most; the Dev match teaches you a technique you pick). */
function cardsPick(i, id) {
  const m = A && A.m,
    Y = cardsYou(m);
  if (!Y || !A.prep || ptsPlayed(m)) return;
  const P = A.myPick || (A.myPick = []),
    k = P.indexOf(id);
  if (k >= 0) P.splice(k, 1);
  else if (P.length < DECK.mine) P.push(id);
  else return handNote(null, `Your deck holds ${DECK.mine}: drop one first`, 'disc');
  if (A.fx.deck) cardsTeach(Y.p, P);
  if (cardsMine(m, i) === 'my') cardsMyBuild(m, i);
  else Cards.teamDeck(m, i, P);
  if (A.hq) A.hq[i] = null;
  prepDraw();
}
/** The type's word (spec §2.37 Card types) and its short form on the card's band. */
const TYPE_WORD = { team: 'Team play', solo: 'Individual', debuff: 'Debuff' },
  TYPE_SHORT = { team: 'Team', solo: 'Solo', debuff: 'Debuff' };
const BAR_WORD = { sta: 'stamina', hp: 'HP', mor: 'morale' },
  BAR_ICON = { sta: 'sta', mor: 'mood' };
/** Cost → result in words (spec §2.37): "−0.10 stamina (holders) → serve +5 % · 3 serves". */
function cardCost(id) {
  const c = CARDS[id],
    who = { holder: 'holders', captain: 'captain', court: 'court' },
    pay = C => (C ? `−${C.amt.toFixed(2)} ${BAR_WORD[C.bar]} (${who[C.who]})` : 'free'),
    cost = c.parts ? cardCosts(id).map(pay).join(' + ') || 'free' : pay(c.cost); // a fused card: both parts' costs (spec §2.37)
  return `${cost} → ${c.desc} · ${cardLen(c)}${c.after ? ` · after: ${pay(c.after)}` : ''} · ${cardCool(c, true)}`;
}
/** The costs a card's play pays: a fused card's parts' (spec §2.37 Fusing), else its own. */
const cardCosts = id => (CARDS[id].parts ? CARDS[id].parts.map(x => CARDS[x].cost) : [CARDS[id].cost]).filter(Boolean);
/** How long a card acts: "3 serves", "1 point", "armed 6", "at once". */
const cardLen = c =>
  !c.dur ? 'at once' : c.kind === 'trap' ? `armed ${c.dur}` : `${c.dur} ${c.per === 'srv' ? 'serves' : c.dur === 1 ? 'point' : 'points'}`;
/** Its cooldown: "cools 8" (long: "cools 8 points"), OP "once a match". */
const cardCool = (c, long) =>
  c.cd === Infinity
    ? 'once a match'
    : c.parts
      ? long
        ? `its parts cool ${c.parts.map(x => CARDS[x].cd).join(' + ')} points`
        : `cools ${c.parts.map(x => CARDS[x].cd).join('+')}`
      : `cools ${c.cd}${long ? ' points' : ''}`;
/** The kind band's word. */
function cardKind(c) {
  if (c.kind === 'op') return 'OP';
  if (c.parts) return 'Fused';
  if (c.kind === 'basic') return 'Amplifier';
  if (c.kind === 'trap') return 'Trap';
  if (c.kind === 'once') return 'One-shot';
  if (c.kind === 'duel') return 'Duel';
  return { tech: 'Technique', trait: 'Trait', duo: 'Duo' }[c.src] || 'Play';
}
/** Each read in words (the card's tooltip, registrar voice). */
const FIT_TIP = {
  always: 'is played',
  behind: 'plays from behind',
  weakPass: 'meets a weak or worn-down passer',
  ourWeakPass: 'covers our weak or worn-down passer',
  weakBlock: 'swings into a block weaker than its hitters',
  strongBlock: 'goes round a block as strong as its hitters',
  tiredFloor: 'drops on a tired or battered floor',
  lowMiddle: 'beats their middle blocker',
  theirAce: 'faces a standout hitter',
  theirQuicks: 'faces a side that lives on quicks',
  theirSoft: 'faces soft hitters',
  theirPower: 'faces hitters stronger than our defence',
  ahead: 'plays from ahead',
  late: 'plays late in the set (12+)',
  streak: 'rides a 2+ point streak',
  under: 'plays as the weaker side',
  brink: 'plays with them at match point',
  tiredUs: 'picks up a worn-down court',
  shaken: 'calms a shaken side',
  hotHand: 'has a hitter on fire (morale 0.3+)',
  strongPass: 'faces passers who are not breaking',
  theirSetter: 'reads a sharp setter',
  elements: 'has an element player on court',
  fresh: 'starts from fresh legs (stamina 0.75+)',
  cold: 'lifts a side below Focused'
};
/** The card's tooltip: cost → result in full, then its read, counters or trap. */
function cardTip(id) {
  const c = CARDS[id],
    E = CARD_EDGE[c.parts ? c.parts.find(x => CARD_EDGE[x]) || id : id],
    ctr = E && E.ctr.length ? ` Countered by: ${E.ctr.map(x => CARDS[x].name).join(', ')}.` : '',
    rule =
      c.kind === 'trap'
        ? `Hidden from them. Armed ${c.dur} points: if they play ${c.trap.map(x => CARDS[x].name).join(', ')}, that card is caught.`
        : E && E.fit !== 'always'
          ? `Pays when it ${FIT_TIP[E.fit]}.${ctr}`
          : '';
  const made = c.parts ? ` Fused from ${c.parts.map(x => CARDS[x].name).join(' + ')}: played as one, both costs, both cool after.` : '',
    amp = c.amp ? ` Fuses with another amplifier (a combo play), itself (${c.name}+) or a technique of its group (its full form).` : '';
  return `${c.name} (${TYPE_WORD[c.type]}): ${cardCost(id)}.${made}${amp} ${rule}`.trim();
}
/** Does this card show "Fits now" (a card with a read that holds; never their hand)? */
const cardFits = (m, i, id) => {
  const E = CARD_EDGE[CARDS[id].parts ? CARDS[id].parts.find(x => CARD_EDGE[x]) || id : id];
  return CARDS[id].kind !== 'basic' && !!E && E.fit !== 'always' && Cards.fits(m, i, id);
};
/** The payer's tag: "#9 Rin", "#9 Rin +1", "Captain #4", "Court", "Free". */
function cardPayer(m, i, id, y) {
  const C = CARDS[id].parts ? cardCosts(id).find(x => x.who !== 'court') || cardCosts(id)[0] : CARDS[id].cost;
  if (!C) return 'Free';
  if (y && CARDS[id].type !== 'team') return 'You';
  if (C.who === 'court') return 'Court';
  if (CARDS[id].parts && cardCosts(id).some(x => x.who === 'court')) return 'Court +';
  const P = Cards.payers(m, i, id);
  if (C.who === 'captain') return P[0] ? `Captain #${P[0].num}` : 'Captain';
  return P.length ? `#${P[0].num} ${firstName(P[0])}${P.length > 1 ? ` +${P.length - 1}` : ''}` : 'Holders';
}
/** Why a hand card can't be played (Cards.can), in words — the gap, never just "locked". */
const CAN_WORD = {
  point: 'Played this point',
  active: 'Active now',
  clash: 'One of its kind is active',
  holder: 'No holder on court',
  off: 'Match over',
  mine: "Captain's card",
  duel: 'Plays in a hesitation',
  opt: 'Not this duel',
  need: 'Nobody knows it',
  // requests (Cards.canAsk)
  type: 'Not a team play',
  turn: 'Ask at a turn',
  asked: 'Asked this turn',
  none: 'Captain runs it'
};
/** A card's name on screen: a duo card (spec §4.36 4) names the friend — "Mint × You: Sync Quick". */
function cardName(m, i, id) {
  const c = CARDS[id],
    D = c && c.src === 'duo' && duoIds(m, i, id),
    f =
      (D &&
        D.slice(1)
          .map(byId)
          .find(p => p && m.t[i].P.includes(p))) ||
      (D && byId(D[1]));
  return f ? `${firstName(f)} × You: ${c.name}` : c.name;
}
/** Is card id one you bring (career ◆)? */
const cardYours = (m, i, id) => {
  const Y = cardsYou(m);
  return !!Y && Y.side === i && cardBrings(m, i, Y.p, id);
};

/**
 * One hand card (the bar's and match prep's): kind band with its key, name, cost → result with the payer's tag, Fits now,
 * duration and cooldown counters, the gap when it can't be played. o: { q (queued), mini (match prep) }.
 */
function handCard(m, i, h, id, o = {}) {
  const c = CARDS[id],
    y = !!Cards.my(m, i), // your own hand of 3 (spec §2.37 Your hand)
    mine = y || Cards.mine(m, i),
    lit = !o.q && !o.mini && hesLit(i, h), // a duel card you may play in this hesitation (spec §2.39)
    why = o.q || lit ? null : !mine ? 'mine' : Cards.can(m, i, h, y),
    ok = !o.q && !why,
    fits = cardFits(m, i, id),
    Cs = cardCosts(id),
    you = y && c.type !== 'team' && cardsYou(m),
    poor = Cs.length && (you ? !Cs.every(C => myAfford(m, you.p, C)) : !Cards.afford(m, i, id)),
    lead = CARDS[c.parts ? c.parts.find(x => CARDS[x].src === 'tech') || id : id],
    lv = you && lead.src === 'tech' ? techLv(you.p, lead.need) : Cards.level(m, i, id),
    cost = Cs.length
      ? Cs.map(
          C =>
            `<span class="hcost ${poor ? 'poor' : ''}" ${poor ? tip(`Under the floor: the payer goes into Tiring / Spent / Shaken`) : ''}>${BAR_ICON[C.bar] ? statI(BAR_ICON[C.bar], 14) : ''}−${C.amt.toFixed(2)} ${BAR_WORD[C.bar]}</span>`
        ).join('')
      : '<span class="hcost">Free</span>',
    F = o.fz, // fusing (spec §2.37): { to } the card this one fuses into, { src } the one being dragged, { dim } no recipe
    fz =
      F && F.to
        ? `<span class="hfz"><span class="lab">Fuse → ${esc(CARDS[F.to].name)}</span><small>${esc(cardFuseLine(F.to))}</small></span>`
        : '',
    foot = lit
      ? `<span class="hfit">→ ${esc((A.hes.a.opts.find(x => x.v === lit.v) || A.hes.a.opts[0]).label)} · ${hesPct(lit.p)}${lit.borrow ? ' · borrowed ×2 cost' : ''}</span>`
      : o.q
        ? '<span class="hcw q">Queued · next serve</span>'
        : why
          ? `<span class="hcw">${CAN_WORD[why] || ''}</span>`
          : fits
            ? '<span class="hfit">✓ Fits now</span>'
            : '';
  return `<div class="hc k-${c.kind} z-${c.zone} t-${c.type}${c.parts ? ' fused' : ''}${mine ? ' me' : ''}${fits && !why ? ' fits' : ''}${lit ? ' duel' : ''}${why ? ' no' : ''}${o.q ? ' q' : ''}${o.mini ? ' mini' : ''}${F ? (F.to ? ' fz' : F.src ? ' fsrc' : ' fdim') : ''}" data-h="${h}" data-id="${esc(id)}" role="button" tabindex="${ok ? 0 : -1}" aria-disabled="${!ok}" ${tip(c.kind === 'duel' && !lit ? `Waits for a hesitation — lit when it can answer one. ${cardTip(id)}` : cardTip(id))}${
    lit ? ` onclick="hesCard(${i},${h})"` : ok ? ` onclick="handPlay(${i},${h})"` : ''
  }${mine && !o.q ? ` oncontextmenu="return handDisc(event,${i},${h})"` : ''}>
    <span class="hcb"><span>${o.mini ? '' : `${cardKind(c).replace('Technique', 'Tech').replace('Amplifier', 'Amp')} · ${TYPE_SHORT[c.type]}`}</span><kbd>${h + 1}</kbd></span>
    <b class="hcn">${cardYours(m, i, id) ? '◆ ' : ''}${esc(cardName(m, i, id))}</b>${
      o.mini
        ? `<small class="hck">${cardKind(c)} · ${TYPE_SHORT[c.type]}</small>`
        : `<span class="hcc">${cost}<span class="hcpay">${esc(cardPayer(m, i, id, y))}</span>${
            c.src === 'tech' && Math.abs(lv - 1) > 0.02
              ? `<span class="hlv" ${tip('Holder level: × on its edges and buffs')}>×${lv.toFixed(2)}</span>`
              : ''
          }</span><span class="hcr">→ ${esc(c.desc)}</span>${foot}<span class="hcf"><span>${cardLen(c)}</span><span>${cardCool(c)}</span></span>${fz}`
    }</div>`;
}
/** The fused card's cost → result in one short line (the fuse highlight): "−0.02 stamina + −0.10 stamina → … · 3 points". */
function cardFuseLine(id) {
  const c = CARDS[id];
  return `${
    cardCosts(id)
      .map(C => `−${C.amt.toFixed(2)} ${BAR_WORD[C.bar]}`)
      .join(' + ') || 'Free'
  } → ${c.desc} · ${cardLen(c)}`;
}
/** Can you pay cost C on your own bars (each after the cost at CARD_AI.floor or above)? */
const myAfford = (m, p, C) =>
  (C.bar === 'sta' ? (m.sta[p.id] ?? 1) : C.bar === 'hp' ? hpOf(m, p) : morOf(m, p)) - C.amt >= CARD_AI.floor[C.bar];
/** The hand you play on side i: your own (spec §2.37 Your hand) or the team's. */
const handP = (m, i) => Cards.my(m, i) || m.deck[i];
/** Play hand card h of side i (between points): it acts from the next serve; the bar lifts it (queued) until then. */
function handPlay(i, h) {
  if (!A || !A.m || !A.m.deck || A.done) return false;
  if (A.hdragT && performance.now() - A.hdragT < 250 && typeof event !== 'undefined' && event && event.type === 'click') return false; // (the click that ends a drag)
  const m = A.m,
    y = !!Cards.my(m, i),
    id = handP(m, i).hand[h];
  if (!id || !(y || Cards.mine(m, i)) || !Cards.play(m, i, h, y)) return false;
  hesOp(() => Cards.play(m, i, h, y));
  (A.hq || (A.hq = []))[i] = { h, id, at: ptsPlayed(m) };
  if (A.hshow && A.hshow[i]) A.hshow[i][h] = null;
  cardsRedraw();
  return true;
}
/** Discard hand card h of side i (right-click / Shift+key): to the discard pile, its place empty until the next turn. */
function handDisc(e, i, h) {
  if (e) e.preventDefault();
  if (!A || !A.m || !A.m.deck || A.done) return false;
  const m = A.m,
    y = !!Cards.my(m, i),
    id = slotOf(handP(m, i), h); // (a duel slot too: h past the hand, T-374)
  if (!id || !(y || Cards.mine(m, i)) || !Cards.discard(m, i, h, y)) return false;
  hesOp(() => Cards.discard(m, i, h, y));
  if (A.hshow && A.hshow[i]) A.hshow[i][h] = null;
  handNote(m.t[i], `Discarded ${cardName(m, i, id)}`, 'disc');
  cardsRedraw();
  return false;
}
/** A bar action during a rally that a hesitation may replay (A.hesRec.ops): done again after the replay (playback hesReplay). */
function hesOp(f) {
  if (A && A.hesRec) A.hesRec.ops.push(f);
}
/** Is your queued card still waiting for its serve? */
const handQ = (m, i) => {
  const q = A.hq && A.hq[i];
  return q && ptsPlayed(m) <= q.at + 1 && !q.gone ? q : null;
};
/* ---------- fusing (spec §2.37 Fusing in the hand) ---------- */

/** The fuse in progress on side i's bar (A.hfz { i, h, drag?, key? }: dragging card h, or `F` waiting for its keys), or null. */
const handFz = (m, i) => (A.hfz && A.hfz.i === i && !A.prep && !A.done ? A.hfz : null);
/** Fuse hand cards a and b of side i (Cards.fuse): the fused card takes a's place, b's stays empty; a line on the bar. */
function handFuse(i, a, b) {
  A.hfz = null;
  if (!A || !A.m || !A.m.deck || A.done) return false;
  const m = A.m,
    y = !!Cards.my(m, i);
  if (!(y || Cards.mine(m, i))) return false;
  const P = handP(m, i),
    pa = P.hand[a],
    pb = P.hand[b],
    r = Cards.fuse(m, i, a, b, y);
  if (r) hesOp(() => Cards.fuse(m, i, a, b, y));
  if (!r) {
    handNote(m.t[i], 'No recipe: those two don’t fuse', 'disc');
    handTick(true);
    return false;
  }
  if (A.hshow && A.hshow[i]) ((A.hshow[i][a] = r), (A.hshow[i][b] = null));
  if (typeof DBG !== 'undefined') DBG.log('info', `fuse: ${m.t[i].short} ${CARDS[pa].name} + ${CARDS[pb].name} → ${CARDS[r].name}`);
  handNote(m.t[i], `Fused <b>${esc(CARDS[r].name)}</b> · ${esc(CARDS[pa].name)} + ${esc(CARDS[pb].name)}`, 'turn');
  handTick(true);
  if (!Motion.reduced) Motion.play($(`#hrow .hc[data-h="${a}"]`), 'fusein');
  return true;
}
/** Drag-to-fuse: press a card of yours and drag — the cards it fuses with light up (name, cost → result); drop on one to fuse. */
function handDragStart(e) {
  const c = e.target.closest && e.target.closest('#hrow .hc[data-h]');
  if (!c || e.button !== 0 || c.classList.contains('gap') || c.classList.contains('q') || c.closest('.hduel') || !A || !A.m || A.done)
    return;
  const i = handSide();
  if (i == null || !(Cards.my(A.m, i) || Cards.mine(A.m, i))) return;
  A.hdrag = { i, h: +c.dataset.h, x: e.clientX, y: e.clientY, on: false, el: null };
}
function handDragMove(e) {
  const D = A && A.hdrag;
  if (!D) return;
  if (!D.on) {
    if (Math.hypot(e.clientX - D.x, e.clientY - D.y) < 8) return;
    D.on = true;
    A.hfz = { i: D.i, h: D.h, drag: 1 };
    const src = $(`#hrow .hc[data-h="${D.h}"]`);
    if (src) {
      const r = src.getBoundingClientRect(),
        g = src.cloneNode(true);
      g.removeAttribute('onclick');
      g.removeAttribute('oncontextmenu');
      g.classList.add('hghost');
      g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      document.body.appendChild(g);
      document.body.classList.add('hdragging'); // (no tooltips over the bar while dragging)
      D.el = g;
      D.lift = r.height * 0.75; // (the dragged card rides above the pointer: the card under it stays readable)
      D.ox = r.left - D.x;
      D.oy = r.top - D.y;
    }
    handTick(true);
  }
  if (D.el)
    D.el.style.transform = `translate(${(e.clientX - D.x).toFixed(0)}px,${(e.clientY - D.y - D.lift).toFixed(0)}px) rotate(4deg) scale(0.85)`;
}
function handDragEnd(e) {
  const D = A && A.hdrag;
  if (!D) return;
  A.hdrag = null;
  if (D.el) D.el.remove();
  document.body.classList.remove('hdragging');
  if (!D.on) return;
  A.hdragT = performance.now();
  const t = document.elementFromPoint(e.clientX, e.clientY),
    c = t && t.closest('#hrow .hc[data-h]'),
    b = c ? +c.dataset.h : -1;
  if (b >= 0 && b !== D.h) handFuse(D.i, D.h, b);
  else {
    A.hfz = null;
    handTick(true);
  }
}
addEventListener('pointerdown', e => handDragStart(e));
addEventListener('pointermove', e => handDragMove(e));
addEventListener('pointerup', e => handDragEnd(e));
addEventListener('pointercancel', () => {
  if (A && A.hdrag) {
    if (A.hdrag.el) A.hdrag.el.remove();
    document.body.classList.remove('hdragging');
    A.hdrag = null;
    A.hfz = null;
  }
});
function cardsRedraw() {
  if (A && A.prep && $('#prep') && !$('#prep').hidden) prepDraw();
  handTick(true);
}

/* ---------- the hand bar ---------- */

/** The hands you play in (none when the captain runs both). */
const cardsSides = m => (m && m.deck ? [0, 1].filter(i => m.deck[i].by === 'you' || m.deck[i].my) : []);
/** The side the bar shows: the first of yours; Tab switches when you run both (Monster). */
function handSide() {
  const S = cardsSides(A.m);
  if (!S.length) return null;
  if (!S.includes(A.hside)) A.hside = S[0];
  return A.hside;
}
/** Tab: the other hand you run. */
function handSwitch() {
  const S = cardsSides(A.m);
  if (S.length < 2) return;
  A.hside = S[(S.indexOf(handSide()) + 1) % S.length];
  A.hpile = null;
  handTick(true);
}
/**
 * The hand on screen for side i (A.hshow): a play or discard empties its place at once; a card the engine dealt (a turn, a
 * timeout) shows only once the score on screen has caught up with the engine — then it is dealt (returned, for the animation).
 */
function handSync(m, i) {
  const D = handP(m, i),
    all = [...D.hand, ...(D.duel || [])], // the hand, then its duel slot(s) (spec §2.39, T-374)
    S = A.hshow || (A.hshow = []),
    s = S[i] || (S[i] = [...all]),
    caught = (m.turnAt || 0) <= (A.ptsShown || 0), // (the last turn is on screen: the opening hand at once, a turn's cards once its point shows)
    dealt = [];
  for (let h = 0; h < all.length; h++) {
    const now = all[h] || null;
    if (now === (s[h] || null)) continue;
    if (now && caught) {
      s[h] = now;
      dealt.push(h);
    } else s[h] = null;
  }
  return dealt;
}
/** Pause at turns (spec §2.37): default on in career, off in Monster; stored per mode. */
function turnPause() {
  const P = store.getJSON(KEYS.turns, {}) || {},
    k = cardsCareer() || (A && A.fx.deck) ? 'career' : 'exh';
  return k in P ? !!P[k] : k === 'career';
}
function setTurnPause(on) {
  const P = store.getJSON(KEYS.turns, {}) || {};
  P[cardsCareer() || (A && A.fx.deck) ? 'career' : 'exh'] = !!on;
  store.setJSON(KEYS.turns, P);
}
/** Mount the bar and the active-card rows (startMatch); the loop redraws only on a change. */
function handMount() {
  const st = $('#match');
  if (A && A.m) A.m.hesLv = hesLevel(); // the ⚙ Hesitations level for your side (spec §2.39, T-374; simmed matches never get one)
  if (!st || !A || !A.m.deck) return;
  st.insertAdjacentHTML(
    'beforeend',
    '<div class="hand" id="hand" hidden aria-label="Your hand"><div class="hnote" id="hnote" aria-live="polite"></div><div class="hlist" id="hlist" hidden></div><div class="hrow" id="hrow"></div></div>'
  );
  const my = A;
  const loop = () => {
    if (A !== my || !$('#hand')) return;
    handTick();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
addEventListener('pointerdown', e => handOutside(e), true);
/** A click outside an open pile list closes it. */
function handOutside(e) {
  if (!A || !A.hpile || e.target.closest('#hlist, .hpile')) return;
  A.hpile = null;
  handTick(true);
}
/** Redraw the bar if anything on it changed (or `force`); the turn's new cards are dealt from the deck pile. */
function handTick(force) {
  const el = $('#hand'),
    m = A && A.m;
  if (!el || !m || !m.deck) return;
  cardsActDraw(m);
  const i = handSide(),
    show = i != null && !A.prep && !A.done;
  el.hidden = !show;
  $('#match')?.classList.toggle('hand-on', show);
  if (!show) return;
  el.classList.toggle('tuck', !!A.sceneOn); // a staged scene: the hand tucks down for its second
  el.style.setProperty('--tc', m.t[i].color);
  const dealt = handSync(m, i),
    html = handHTML(m, i);
  if (!force && !dealt.length && html === A.hhtml) return;
  A.hhtml = html;
  $('#hrow').innerHTML = html;
  const L = $('#hlist');
  L.hidden = !A.hpile;
  if (A.hpile) L.innerHTML = handPileList(m, i, A.hpile);
  if (dealt.length) handDeal(dealt);
}
/** The bar's row: deck pile · the fanned hand · discard pile, the head line over it. */
function handHTML(m, i) {
  const D = handP(m, i),
    Y = Cards.my(m, i),
    t = m.t[i],
    S = cardsSides(m),
    s = A.hshow[i],
    q = handQ(m, i),
    n = D.hand.length,
    Z = handFz(m, i),
    FL = Z && Z.h != null ? Cards.fusable(m, i, Z.h, !!Y) : null,
    fz = h => (!FL ? null : h === Z.h ? { src: 1 } : { to: (FL.find(x => x.h === h) || {}).id || null }),
    cards = s
      .slice(0, n)
      .map((id, h) => {
        const mid = (n - 1) / 2,
          f = `style="--r:${((h - mid) * 2.5).toFixed(1)}deg;--y:${(Math.abs(h - mid) ** 2 * 3).toFixed(0)}px"`;
        if (q && q.h === h) return `<div class="hslot" ${f}>${handCard(m, i, h, q.id, { q: 1 })}</div>`;
        if (id) return `<div class="hslot" ${f}>${handCard(m, i, h, id, { fz: fz(h) })}</div>`;
        return `<div class="hslot" ${f}><div class="hc gap" data-h="${h}"><kbd>${h + 1}</kbd><span>Empty</span><small>Refills at the turn</small></div></div>`;
      })
      .join(''),
    // the duel slot(s) beside the hand (spec §2.39, T-374): dimmed between points, lit in a hesitation it can answer
    duel = (D.duel || [])
      .map((x, k) => {
        const h = n + k,
          id = s[h] || null;
        return `<div class="hslot" style="--r:0deg;--y:0px">${
          id
            ? handCard(m, i, h, id)
            : `<div class="hc gap" data-h="${h}"><kbd>${h + 1}</kbd><span>Empty</span><small>Refills at the turn</small></div>`
        }</div>`;
      })
      .join(''),
    dlit = A.hes && A.hes.cards.some(c => c.i === i && c.h >= n),
    left = TURN.pts - (ptsPlayed(m) - m.turnAt),
    cool = D.disc.filter(e => e.cd > 0).length,
    pile = (k, lab, nb, sub) =>
      `<button class="hpile ${k}${A.hpile === k ? ' on' : ''}" onclick="handPile('${k}')" aria-expanded="${A.hpile === k}"><span class="hstack"><b>${nb}</b></span><span class="lab">${lab}</span><small>${sub}</small></button>`;
  return `<div class="hhead"><span class="hteam">${chip(t)}${esc(t.short)}</span>${
    S.length > 1
      ? `<button class="btn hsw" onclick="handSwitch()" ${tip('Show your other hand')}>${esc(m.t[S.find(x => x !== i)].short)} <kbd>Tab</kbd></button>`
      : ''
  }<span class="htn">Turn ${m.turnN || 0} · refill in ${Math.max(1, left)}</span>${
    Z
      ? `<span class="hkeys hfzk">${
          Z.h == null
            ? `Fuse: pick a card <kbd>1</kbd>–<kbd>${n}</kbd>`
            : `Fuse ${esc(CARDS[D.hand[Z.h]] ? CARDS[D.hand[Z.h]].name : '')} with ${FL && FL.length ? FL.map(x => `<kbd>${x.h + 1}</kbd>`).join(' ') : '— no recipe'}`
        } · <kbd>Esc</kbd> cancels</span>`
      : `<span class="hkeys"><kbd>1</kbd>–<kbd>${n}</kbd> play${
          D.duel && D.duel.length ? ` · <kbd>${n + 1}</kbd>${D.duel.length > 1 ? `–<kbd>${n + D.duel.length}</kbd>` : ''} duel` : ''
        } · <kbd>Shift</kbd> or right-click discard · drag onto a card or <kbd>F</kbd> fuse</span>`
  }${
    Y ? handReqBtn(m, i) : ''
  }</div><div class="hmain">${pile('deck', 'Deck', D.draw.length, 'draw order hidden')}<div class="hcards">${cards}</div>${
    duel
      ? `<div class="hduel${dlit ? ' on' : ''}" ${tip('Duel cards play only in a hesitation: this slot waits for one, then lights up. Refills from the deck’s duel cards at the turn.')}><span class="lab">Duel · ${D.dpile.length} left</span><div class="hcards">${duel}</div></div>`
      : ''
  }${pile('disc', 'Discard', D.disc.length, D.used.length ? `${cool} cooling · ${D.used.length} used` : `${cool} cooling`)}</div>`;
}
/** Click a pile: its list over the bar (again: closes). */
function handPile(k) {
  A.hpile = A.hpile === k ? null : k;
  handTick(true);
}
/** A pile's list: the deck by kind and name (draw order hidden); the discard pile with each card's points left to cool; OP cards used. */
function handPileList(m, i, k) {
  if (k === 'req') return handReqList(m, i);
  const D = handP(m, i),
    row = (id, right, cls = '') =>
      `<div class="hli k-${CARDS[id].kind} ${cls}" ${tip(cardTip(id))}><i></i><span>${cardYours(m, i, id) ? '◆ ' : ''}${esc(cardName(m, i, id))}</span><small>${cardKind(CARDS[id])}</small><b>${right}</b></div>`,
    order = (a, b) =>
      ['op', 'play', 'once', 'trap', 'basic'].indexOf(CARDS[a].kind) - ['op', 'play', 'once', 'trap', 'basic'].indexOf(CARDS[b].kind) ||
      CARDS[a].name.localeCompare(CARDS[b].name);
  let head, rows;
  if (k === 'deck') {
    const n = {};
    for (const id of [...D.draw, ...(D.dpile || [])]) n[id] = (n[id] || 0) + 1;
    head = `Deck · ${D.draw.length}${D.dpile && D.dpile.length ? ` + ${D.dpile.length} duel` : ''}`;
    rows = Object.keys(n)
      .sort(order)
      .map(id => row(id, `×${n[id]}`))
      .join('');
    if (!rows) rows = '<p class="small mute">Empty: cooled cards are shuffled back when it runs out.</p>';
  } else {
    head = `Discard · ${D.disc.length}`;
    rows =
      [...D.disc]
        .sort((a, b) => b.cd - a.cd || order(a.id, b.id))
        .map(e => row(e.id, e.cd > 0 ? `${e.cd} pt${e.cd === 1 ? '' : 's'}` : 'ready', e.cd > 0 ? 'cool' : 'ready'))
        .join('') + D.used.map(id => row(id, 'used', 'used')).join('');
    if (!rows) rows = '<p class="small mute">Nothing yet.</p>';
  }
  return `<div class="hlh"><span class="lab">${head}</span><span class="small mute">${k === 'deck' ? 'draw order hidden' : 'points left to cool · ready = back at the next shuffle'}</span><button class="btn x" onclick="handPile('${k}')" aria-label="Close">✕</button></div><div class="hlb">${rows}</div>`;
}
/* ---------- requests (spec §2.37 Requests) ---------- */

/** Why no request can be made now (the button's gap), or null: at a turn, once a turn, a team play in the captain's hand. */
function handReqWhy(m, i) {
  const D = m.deck[i],
    W = D.hand.map((id, h) => (id ? Cards.canAsk(m, i, h) : 'gap'));
  if (W.includes(null)) return null;
  return ['off', 'asked', 'turn'].find(w => W.includes(w)) || 'type';
}
/** The bar's Request button: open at a turn (once a turn), else the gap it waits for. */
function handReqBtn(m, i) {
  const why = handReqWhy(m, i),
    Y = Cards.my(m, i),
    word = why === 'type' ? 'none in their hand' : CAN_WORD[why] || '';
  return `<button class="btn hreq${A.hpile === 'req' ? ' on' : ''}" onclick="handPile('req')" aria-expanded="${A.hpile === 'req'}" ${tip(
    `Ask your captain for a team play from their hand, at a turn, once a turn. A no costs nothing.${Y.req.cool > 0 ? ' A granted card was played into its counter: they grant less readily for now.' : ''}`
  )}>Request → a team play${why ? ` <small class="mute">· ${esc(word)}</small>` : ''} <kbd>R</kbd></button>`;
}
/** The request list: the captain's hand — each team play with how likely a yes is (a word, never the number) and Ask. */
function handReqList(m, i) {
  const D = m.deck[i],
    Y = Cards.my(m, i),
    into = Y.hand.indexOf(null),
    rows = D.hand
      .map((id, h) => {
        if (!id) return '';
        const why = Cards.canAsk(m, i, h),
          O = Cards.askOdds(m, i, h),
          team = CARDS[id].type === 'team';
        return `<div class="hli rq k-${CARDS[id].kind} t-${CARDS[id].type}" ${tip(cardTip(id))}><i></i><span>${esc(cardName(m, i, id))}</span><small>${TYPE_WORD[CARDS[id].type]}</small>${
          team
            ? `<b class="odds ${O.word}">${O.word}</b>${
                why
                  ? `<small class="mute">${esc(CAN_WORD[why] || '')}</small>`
                  : `<button class="btn" onclick="handAsk(${i},${h})">Ask → into your hand</button>`
              }`
            : '<b class="mute">captain only</b>'
        }</div>`;
      })
      .join(''),
    note =
      into >= 0
        ? `A yes takes your empty place ${into + 1}.`
        : `A yes takes place ${Y.size} (${esc(cardName(m, i, Y.hand[Y.size - 1]))} goes to your discard pile).`;
  return `<div class="hlh"><span class="lab">Captain’s hand · ${esc(firstName(m.t[i].cap || m.t[i].P[0]))}</span><span class="small mute">${
    Y.req.cool > 0 ? 'Slower to grant: a granted card was countered · ' : ''
  }${note} A no costs nothing.</span><button class="btn x" onclick="handPile('req')" aria-label="Close">✕</button></div><div class="hlb">${rows || '<p class="small mute">Their hand is empty.</p>'}</div>`;
}
/** Ask for the captain's card h (Cards.ask): the answer on the bar's line and in the debug log. */
function handAsk(i, h) {
  if (!A || !A.m || A.done) return false;
  const m = A.m,
    t = m.t[i],
    id = m.deck[i].hand[h],
    r = Cards.ask(m, i, h);
  if (!r) return false;
  hesOp(() => Cards.ask(m, i, h));
  const cap = firstName(t.cap || t.P[0]);
  if (typeof DBG !== 'undefined')
    DBG.log('info', `request: ${t.short} asks ${cap} for ${CARDS[id].name} · ${r.word} (${r.p.toFixed(2)}) → ${r.ok ? 'yes' : 'no'}`);
  if (r.ok && A.hshow && A.hshow[i]) A.hshow[i][r.into] = null; // (dealt into its place on the next redraw)
  A.hpile = null;
  handNote(
    t,
    r.ok ? `${esc(cap)}: “Yours.” <b>${esc(CARDS[id].name)}</b> is in your hand` : `${esc(cap)}: “Not now.”`,
    r.ok ? 'turn' : 'disc'
  );
  handTick(true);
  return true;
}
/** The deal: each new card flies from the deck pile to its place (30 ms apart). */
function handDeal(dealt) {
  const deck = $('#hrow .hpile.deck');
  if (!deck || Motion.reduced) return;
  const d = deck.getBoundingClientRect();
  dealt.forEach((h, k) => {
    const c = $(`#hrow .hslot .hc[data-h="${h}"]`);
    if (!c) return;
    const r = c.parentElement.getBoundingClientRect();
    c.style.setProperty('--dx', `${(d.left + d.width / 2 - (r.left + r.width / 2)).toFixed(0)}px`);
    c.style.setProperty('--dl', `${k * 30}ms`);
    Motion.play(c, 'deal');
  });
}
/** A line over the bar for a moment ("Wu Navy plays Killer Serve", "Turn 2 · new cards"), in the team's colour. */
function handNote(t, text, cls = '', ms = 2200) {
  const n = $('#hnote');
  if (!n) return;
  n.className = `hnote on ${cls}`;
  n.style.setProperty('--tc', t ? t.color : 'var(--line-strong)');
  n.innerHTML = text;
  clearTimeout(n._t);
  if (ms) n._t = setTimeout(() => n.classList.remove('on'), ms);
}
/** The active cards by the scoreboard (spec §2.37): each side's, with points left — as on screen (the engine runs a rally ahead). */
function cardsActDraw(m) {
  const lag = Math.max(0, ptsPlayed(m) - (A.ptsShown || 0));
  for (const i of [0, 1]) {
    const el = $('#cact' + i);
    if (!el) continue;
    const D = m.deck[i],
      q = handQ(m, i),
      shown = ptsPlayed(m) - lag,
      L = D.act
        .filter(a => !a.pin && !(q && a.id === q.id && a.at[0] + a.at[1] === q.at))
        .map(a => ({
          id: a.id,
          left: Math.min(CARDS[a.id].dur, a.left + (a.per === 'srv' ? (lag && m.srv0 === i ? 1 : 0) : lag)),
          per: a.per
        })),
      ended = lag
        ? D.log
            .filter(e => e.k === 'end' && e.at[0] + e.at[1] > shown && !L.some(x => x.id === e.id))
            .map(e => ({ id: e.id, left: e.at[0] + e.at[1] - shown, per: CARDS[e.id].per }))
        : [],
      html = [...L, ...ended]
        .map(
          a =>
            `<span class="cact k-${CARDS[a.id].kind}" ${tip(cardTip(a.id))}><b>${esc(cardName(m, i, a.id))}</b><i>${a.left} ${a.per === 'srv' ? (a.left === 1 ? 'serve' : 'serves') : a.left === 1 ? 'pt' : 'pts'}</i></span>`
        )
        .join('');
    if (el._h !== html) el.innerHTML = el._h = html;
  }
}
/** A turn act (acts.js `turn`, spec §2.32): the bar deals; with "Pause at turns" on the match pauses (Space plays on). */
function cardsTurnShow(a) {
  if (!A || A.done || !cardsSides(A.m).length) return;
  const t = A.m.t[handSide()];
  if (turnPause() && !A.paused) {
    A.paused = true;
    const pb = $('#pause');
    if (pb) pb.innerHTML = pauseLabel(true);
    setLabel('#fspause', '▶');
    handNote(
      t,
      `Turn ${a.n} · new cards${Cards.my(A.m, handSide()) ? ' · <kbd>R</kbd> request' : ''} · paused — <kbd>Space</kbd> plays on`,
      'turn',
      0
    );
  } else handNote(t, `Turn ${a.n} · new cards`, 'turn');
  handTick(true);
}
/** Your timeout (acts.js `tobanner`): an extra turn — the gaps refill (dealt as the point shows). */
function cardsTurnOpen() {
  if (!A || A.done) return;
  handNote(A.m.t[handSide()], 'Timeout · new cards', 'turn');
}
/** Keys: 1–5 play, Shift+1–5 discard, Tab the other hand. Returns true when it took the key. */
function cardsKey(e) {
  if (!A || !A.m || !A.m.deck || A.done || e.ctrlKey || e.metaKey || e.altKey) return false;
  const i = handSide();
  if (i == null) return false;
  if (e.key === 'Tab' && !A.prep) {
    e.preventDefault();
    handSwitch();
    return true;
  }
  if (e.key === 'Escape' && A.hpile) {
    A.hpile = null;
    handTick(true);
    return true;
  }
  if (e.key === 'Escape' && A.hfz) {
    A.hfz = null;
    handTick(true);
    return true;
  }
  // F then two keys (spec §2.37): fuse those two cards (Shift+F stays fullscreen)
  if (e.code === 'KeyF' && !e.shiftKey && !A.prep) {
    e.preventDefault();
    A.hfz = A.hfz ? null : { i, h: null, key: 1 };
    handTick(true);
    return true;
  }
  if (e.code === 'KeyR' && !e.shiftKey && !A.prep && Cards.my(A.m, i)) {
    e.preventDefault();
    handPile('req');
    return true;
  }
  const k = /^Digit([1-9])$/.exec(e.code || ''),
    P = handP(A.m, i);
  if (!k || +k[1] > P.hand.length + (P.duel || []).length) return false;
  if (A.railTab === 'tac' && !$('#mrail').hidden && !e.shiftKey) return false; // the Tactics tab's 1–9 flip techniques (§9.10)
  e.preventDefault();
  const h = +k[1] - 1;
  if (h >= P.hand.length) {
    // the duel slot (spec §2.39, T-374): its key plays it in a hesitation it is lit for; Shift discards
    if (e.shiftKey) handDisc(null, i, h);
    else if (hesLit(i, h)) hesCard(i, h);
    else $(`#hrow .hc[data-h="${h}"]`)?.classList.add('nope');
    return true;
  }
  if (A.hfz && A.hfz.key && !e.shiftKey) {
    if (A.hfz.h == null) {
      if (handP(A.m, i).hand[h]) A.hfz = { i, h, key: 1 };
      handTick(true);
    } else if (h === A.hfz.h) ((A.hfz = null), handTick(true));
    else if (!handFuse(i, A.hfz.h, h)) $(`#hrow .hc[data-h="${h}"]`)?.classList.add('nope');
    return true;
  }
  if (e.shiftKey) handDisc(null, i, h);
  else if (!handPlay(i, h)) $(`#hrow .hc[data-h="${h}"]`)?.classList.add('nope');
  return true;
}
/** A card played (acts.js `card`, spec §2.37): yours flies off the bar onto the court; the bar names every play, theirs too (the court's banner is T-346's). */
function cardsPlayShow(a) {
  if (!A || !A.m || !CARDS[a.id]) return;
  const m = A.m,
    t = m.t[a.side],
    n = cardName(m, a.side, a.id);
  if (typeof DBG !== 'undefined')
    DBG.log(
      'info',
      `card: ${t.short} plays ${n}${a.caught ? ` (caught: ${a.caught})` : ''} · by ${a.by}${(cardsYou(m) || {}).p?.id === a.by ? ' (you)' : m.t[a.side].cap && m.t[a.side].cap.id === a.by ? ' (captain)' : ''} · ${a.st}`
    );
  const q = A.hq && A.hq[a.side];
  if (q && q.id === a.id && !q.gone) {
    q.gone = true;
    const c = $(`#hrow .hc.q[data-h="${q.h}"]`);
    if (c && a.side === handSide() && !Motion.reduced) {
      const r = c.getBoundingClientRect(),
        g = c.cloneNode(true);
      g.removeAttribute('onclick');
      g.classList.add('hfly');
      g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--fx:${(innerWidth / 2 - r.left - r.width / 2).toFixed(0)}px;--fy:${(innerHeight * 0.42 - r.top - r.height / 2).toFixed(0)}px`;
      document.body.appendChild(g);
      setTimeout(() => g.remove(), 700);
    }
    handTick(true);
  }
  handNote(
    t,
    a.caught
      ? `<b>${esc(CARDS[a.caught].name)}!</b> ${esc(t.name)}’s ${esc(n)} is caught`
      : `${a.op ? '<span class="hop">OP</span>' : ''}${esc(t.name)} plays <b>${esc(n)}</b>`,
    a.caught ? 'caught' : a.op ? 'op' : ''
  );
}

/* ---------- match prep: your deck ---------- */

/** Match prep (spec §2.37): the opening hand (click to queue a card for the first serve) and the whole deck of 12 — your squad's own cards first (◆ yours), the Basics that fill the rest. */
function cardsDeck(i) {
  const m = A.m,
    D = m.deck && m.deck[i];
  if (!D) return '';
  if (D.my) return cardsMyDeck(m, i);
  const q = handQ(m, i),
    hand = D.hand
      .map((id, h) =>
        q && q.h === h
          ? handCard(m, i, h, q.id, { q: 1, mini: 1 })
          : id
            ? handCard(m, i, h, id, { mini: 1 })
            : `<div class="hc gap mini" data-h="${h}"><kbd>${h + 1}</kbd><span>Empty</span></div>`
      )
      .join(''),
    all = [...D.hand.filter(Boolean), ...(q ? [q.id] : []), ...D.draw, ...D.duel.filter(Boolean), ...D.dpile, ...D.disc.map(e => e.id)], // (duel cards too: T-374)
    own = all.filter(id => CARDS[id].kind !== 'basic'),
    bas = all.length - own.length,
    src = id => {
      const c = CARDS[id];
      if (c.src === 'tech' || c.src === 'trait' || c.src === 'op' || c.src === 'duo') {
        const H = Cards.holders(m, i, id);
        return H.length ? `#${H[0].num} ${esc(firstName(H[0]))}` : 'on the bench';
      }
      return c.src === 'book' ? 'playbook' : '';
    },
    order = (a, b) =>
      ['op', 'play', 'once', 'trap', 'basic'].indexOf(CARDS[a].kind) - ['op', 'play', 'once', 'trap', 'basic'].indexOf(CARDS[b].kind) ||
      CARDS[a].name.localeCompare(CARDS[b].name),
    deck =
      [...own]
        .sort(order)
        .map(
          id =>
            `<span class="dk k-${CARDS[id].kind}" ${tip(cardTip(id))}><i></i><b>${cardYours(m, i, id) ? '◆ ' : ''}${esc(cardName(m, i, id))}</b><small>${cardKind(CARDS[id])}${src(id) ? ` · ${src(id)}` : ''}</small></span>`
        )
        .join('') +
      (bas
        ? `<span class="dk k-basic bas" ${tip('Amplifiers fill the places your squad has no card for: cheap and short; each lifts its action and makes its group’s techniques fire more. Two in the hand fuse into a combo play.')}><i></i><b>Amplifiers ×${bas}</b><small>${DECK.basics.map(x => esc(CARDS[x].name.replace('Improve ', ''))).join(' · ')}</small></span>`
        : ''),
    note = 'Click a card to play it on the first serve.';
  return `<div class="cdeck">${A.fx.deck ? cardsPickHTML(m, i, 'Your cards join the team deck') : ''}<div class="lab">Opening hand</div><div class="hmini">${hand}</div><p class="small mute">${note}</p><div class="lab">Deck · ${all.length} <span class="mute">· ${own.length} own · ${bas} amplifiers</span></div><div class="dks">${deck}</div></div>`;
}
/**
 * The deck pick (spec §2.37 Your hand): every card of your pool as a toggle (DECK.mine at most), grouped by type; Basics fill
 * the rest. `head`: the line under the label.
 */
function cardsPickHTML(m, i, head) {
  const P = A.myPick || [],
    pool = cardsPool(m, i),
    by = { solo: [], debuff: [], team: [] };
  for (const id of pool) by[CARDS[id].type].push(id);
  const chip = id => {
      const on = P.includes(id),
        full = !on && P.length >= DECK.mine;
      return `<button class="dk k-${CARDS[id].kind} t-${CARDS[id].type} pick${on ? ' on' : ''}" aria-pressed="${on}" ${full ? 'aria-disabled="true"' : ''} onclick="cardsPick(${i},'${esc(id)}')" ${tip(cardTip(id))}><i></i><b>${on ? '✓ ' : ''}${esc(cardName(m, i, id))}</b><small>${cardKind(CARDS[id])}</small></button>`;
    },
    groups = Object.entries(by)
      .filter(([, L]) => L.length)
      .map(([k, L]) => `<div class="dkg"><span class="cgl">${TYPE_WORD[k]}</span><div class="dks">${L.map(chip).join('')}</div></div>`)
      .join('');
  return `<div class="lab">Your deck · ${P.length} / ${DECK.mine} <span class="mute">· ${head}${P.length < DECK.mine ? ` · amplifiers fill ${DECK.mine - P.length}` : ''}</span></div><div class="dkp">${
    groups || '<p class="small mute">No cards of your own yet: amplifiers fill your deck. Learn a technique to bring one.</p>'
  }</div>`;
}
/** Match prep as a non-captain: your deck pick, your opening hand of DECK.myHand and how requests work. */
function cardsMyDeck(m, i) {
  const Y = Cards.my(m, i),
    q = handQ(m, i),
    hand = Y.hand
      .map((id, h) =>
        q && q.h === h
          ? handCard(m, i, h, q.id, { q: 1, mini: 1 })
          : id
            ? handCard(m, i, h, id, { mini: 1 })
            : `<div class="hc gap mini" data-h="${h}"><kbd>${h + 1}</kbd><span>Empty</span></div>`
      )
      .join(''),
    cap = m.t[i].cap || m.t[i].P[0],
    O = Cards.askOdds(
      m,
      i,
      Math.max(
        0,
        m.deck[i].hand.findIndex(id => id && CARDS[id].type === 'team')
      )
    ),
    trust = Y.req.trusted ? 'trusted' : 'newcomer';
  return `<div class="cdeck"><div class="lab">Your opening hand · ${Y.size}</div><div class="hmini">${hand}</div><p class="small mute">Click a card to play it on the first serve. Team plays are ${esc(
    firstName(cap)
  )}’s: ask for one at a turn <kbd>R</kbd> — bond ${Math.round(Y.req.bond)}, ${trust} · a yes is ${O.word} now. A no costs nothing.</p>${cardsPickHTML(m, i, 'your play style')}</div>`;
}
/* ---------- the result card ---------- */

/** The result card's row: each side's cards played (× times) and the rallies they acted in, won – lost. */
function cardsRow(m) {
  if (!m || !m.deck) return '';
  const side = i => {
    const D = m.deck[i],
      E = Object.entries(D.played),
      bas = E.filter(([id]) => CARDS[id].kind === 'basic').reduce((s, [, n]) => s + n, 0),
      played = E.filter(([id]) => CARDS[id].kind !== 'basic')
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => {
          const S = D.stat[id],
            r = S ? S.fit[0] + S.mis[0] + S.ctr[0] : 0,
            w = S ? S.fit[1] + S.mis[1] + S.ctr[1] : 0,
            net = w - (r - w);
          return `<span class="rcd k-${CARDS[id].kind}" ${tip(`${cardTip(id)} Rallies it acted in: ${r}, won ${w}${S && S.ctr[0] ? ` · countered in ${S.ctr[0]}` : ''}.`)}><b>${esc(cardName(m, i, id))}</b> ×${n}${
            r
              ? ` <small>${w}–${r - w}</small> <em class="${net > 0 ? 'good' : net < 0 ? 'bad' : 'mute'}">${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(net)}</em>`
              : ''
          }</span>`;
        });
    if (bas) played.push(`<span class="rcd k-basic"><b>Amplifiers</b> ×${bas}</span>`);
    return `<div class="rplan"><span class="rpt">${chip(m.t[i])}${esc(m.t[i].short)}</span><span class="rcds">${played.join('') || '<span class="mute">No cards played</span>'}</span></div>`;
  };
  return `<div class="rplans"><div class="lab">Cards played <span class="mute">· rallies won–lost while active</span></div>${side(0)}${side(1)}</div>`;
}
/** The duo card's cut-in (spec §4.36 4): the hype banner "MINT × YOU" and the friend's line, the first time it plays on your side. */
function cardsDuoCut(m, i, id) {
  const D = duoIds(m, i, id),
    f =
      D &&
      D.slice(1)
        .map(byId)
        .find(p => p && m.t[i].P.includes(p));
  if (!f) return;
  showBanner({ t: `${firstName(f)} × You`, c: m.t[i].color });
  showSay({ p: f.id, t: `${CARDS[id].name}! ${DUO_SAY[id] || ''}`.trim() });
  setTimeout(() => {
    const el = document.getElementById('hsay');
    if (el && A && A.m === m) el.classList.remove('on');
  }, 2600);
}
/**
 * A career match's team-life presentation (spec §4.36, started by career-match.js once the fixture's setup ran): each frame while the
 * match plays and nothing else holds the court — an ex-teammate's remark once, then a cut-in for each duo card of yours the first time
 * it is active with its pair on court. Stops when the match ends or the screen leaves it. Presentation only (no draws).
 */
function teamWatch(m) {
  if (!A || A.m !== m || A.done || m.over) return;
  if (!A.prep && !X && !Dir.talk && !(A.beats && A.bi < A.beats.length && A.beats[A.bi].scene)) {
    const seen = A.duoSeen || (A.duoSeen = new Set());
    if (m.exIds && !A.exSaid) {
      A.exSaid = true;
      exRemark(m);
    } else if (m.duo && m.deck)
      for (const i of [0, 1])
        for (const { id } of m.deck[i].act)
          if (CARDS[id].src === 'duo' && !seen.has(id) && duoOn(m.t[i], duoIds(m, i, id) || [])) {
            seen.add(id);
            cardsDuoCut(m, i, id);
            break;
          }
  }
  requestAnimationFrame(() => teamWatch(m));
}

/* ---------- the hesitation moment (spec §2.39, T-367) ---------- */

const HES_KIND = { srv: 'Serve', atk: 'Spike', blk: 'Block' };
/** The hand you may play duel cards from in hesitation hz: { i, y } (captain: the team hand; player: your own), or null. */
function hesHand(m, hz) {
  for (const i of cardsSides(m))
    if (i === hz.side ? hesYou(m, i, { id: hz.pid }) : hz.kind === 'srv' && m.deck[i].by === 'you') return { i, y: !!Cards.my(m, i) };
  return null;
}
/** The forced choice for option v; a duel card c ({ h, id, y }; Hide: the receiving side's — their server's pick goes through). */
function hesCh(a, v, c) {
  const d = c ? { h: c.h, id: c.id, y: c.y } : null;
  if (d && CARDS[d.id].duel.vs) return { v: a.v, card: a.cd || null, vs: d };
  return { v, card: d, vs: a.vsd || null };
}
/**
 * A hesitation of yours starts (acts.js `hesit`): the world at RULES.hes.slow, the two options with their point odds (hesOdds,
 * filled a few rallies a frame), the duel cards you may play lit on the bar (from the hand as the rally started: what it is
 * replayed from), a timer of RULES.hes.ms real ms. A hesitation already decided (a replay's beat) does nothing.
 */
function hesShow(a) {
  const R = A && A.hesRec;
  if (!R || R.done.includes(a.n) || (A.hes && A.hes.a.n === a.n)) return;
  const m = A.m,
    S = R.S.m,
    hh = S.deck ? hesHand(m, a) : null,
    mine = hesYou(m, a.side, { id: a.pid }),
    cards = [];
  if (hh) {
    const P = Cards.pile(S, hh.i, hh.y);
    (P.duel || []).forEach((id, k) => {
      const h = P.hand.length + k; // (the duel slot(s), T-374)
      if (id && !Cards.duelCan(S, hh.i, h, hh.y, a)) cards.push({ h, id, y: hh.y, i: hh.i, ...Cards.duelInfo(S, hh.i, id, a), p: null });
    });
  }
  for (const c of cards) c.ch = hesCh(a, c.v, c);
  const jobs = [
    ...a.opts.map((o, k) => ({ k, ch: hesCh(a, o.v, null), won: 0, done: 0 })),
    ...cards.map((c, k) => ({ c: k, ch: c.ch, won: 0, done: 0 }))
  ];
  A.hes = { a, t: 0, mine, you: mine ? a.side : hh ? hh.i : a.side, cards, odds: a.opts.map(() => null), jobs };
  const p = squadOf(m.t[a.side]).find(q => q.id === a.pid);
  DBG.log(
    'info',
    `hesitation: ${HES_KIND[a.kind]} · #${p ? p.num : '?'} ${p ? firstName(p) : ''} — ${a.opts.map(o => `${o.label} ${o.score}`).join(' vs ')} (AI: ${a.opts[0].label})${
      cards.length ? ` · duel cards ${cards.map(c => c.id).join(', ')}` : ''
    }`
  );
  hesDraw();
  handTick(true);
}
/** Each frame of a hesitation (playback step, real ms): a few odds rallies, the timer; at its end the AI's pick goes through. */
function hesTick(ms) {
  const H = A && A.hes,
    R = A && A.hesRec;
  if (!H || !R) return;
  H.t += ms;
  const t0 = performance.now(),
    N = RULES.hes.n;
  while (H.jobs.length && performance.now() - t0 < 8) {
    const J = H.jobs[0],
      k = Math.min(4, N - J.done),
      seeds = Array.from({ length: k }, (_, j) => J.done + j);
    J.won += Math.round(hesOdds(A.m, R.S, R.draws, R.forced, H.a.n, J.ch, H.you, seeds) * k);
    J.done += k;
    if (J.done < N) continue;
    if (J.k != null) H.odds[J.k] = J.won / N;
    else H.cards[J.c].p = J.won / N;
    H.jobs.shift();
    hesDraw();
    handTick(true);
  }
  const bar = $('#hes .hest i');
  if (bar) bar.style.width = `${Math.max(0, 100 - (100 * H.t) / RULES.hes.ms).toFixed(1)}%`;
  if (H.t >= RULES.hes.ms) hesPick(null, 'time');
}
/**
 * Resolve the hesitation: option k (yours to pick), a lit duel card (c: an A.hes.cards entry), or null — the AI's pick (`why`:
 * 'time' | 'esc'). A choice other than what the engine played replays the rally (hesReplay). Never waits past the timer.
 */
function hesPick(k, why, c) {
  const H = A && A.hes;
  if (!H) return;
  const a = H.a,
    R = A.hesRec;
  if (k != null && !H.mine) return;
  A.hes = null;
  R.done.push(a.n);
  const ch = c ? c.ch : k != null ? hesCh(a, a.opts[k].v, null) : null;
  if (ch && (ch.v !== a.v || ch.card || (ch.vs && ch.vs !== a.vsd))) hesReplay(a.n, ch);
  const word = c
    ? `${CARDS[c.id].name}${c.borrow ? ' (borrowed)' : ''} → ${(a.opts.find(o => o.v === c.v) || a.opts[0]).label}`
    : k != null
      ? a.opts[k].label
      : `AI pick ${a.opts[0].label}`;
  DBG.log('info', `hesitation → ${word} (${why || 'you'})`);
  if (c) handNote(A.m.t[c.i], `${esc(A.m.t[c.i].name)} plays <b>${esc(CARDS[c.id].name)}</b>${c.borrow ? ' · borrowed' : ''}`, 'duel');
  hesDraw();
  handTick(true);
}
/** A lit duel card clicked (the bar, side i place h): it plays in the hesitation. */
function hesCard(i, h) {
  const H = A && A.hes,
    c = H && H.cards.find(x => x.i === i && x.h === h);
  if (c) hesPick(null, 'card', c);
  return false;
}
/** The lit card for place h of side i in the current hesitation, or null. */
const hesLit = (i, h) => (A && A.hes ? A.hes.cards.find(x => x.i === i && x.h === h) || null : null);
const hesPct = p => (p == null ? '…' : `${Math.round(p * 100)} %`);
/** The moment's panel over the court (#hes): whose call, the two options (1 / 2) with your point odds, the timer, the cards' line. */
function hesDraw() {
  const st = $('#match');
  if (!st) return;
  let el = $('#hes');
  const H = A && A.hes;
  if (!H) return void (el && el.remove());
  if (!el) {
    st.insertAdjacentHTML('beforeend', '<div class="hes" id="hes" role="dialog" aria-label="Hesitation"></div>');
    el = $('#hes');
  }
  const a = H.a,
    m = A.m,
    p = squadOf(m.t[a.side]).find(q => q.id === a.pid),
    who = p ? `#${p.num} ${firstName(p)}` : 'They';
  el.style.setProperty('--tc', m.t[a.side].color);
  el.innerHTML = `<div class="hesh"><span class="lab">${esc(HES_KIND[a.kind])} · ${esc(who)} hesitates</span><small>${
    H.mine ? 'Pick one, or play a lit duel card' : 'Their call — a lit card answers it'
  }</small></div><div class="heso">${a.opts
    .map(
      (o, k) =>
        `<button class="btn hesb${k === 0 ? ' hot' : ''}" ${H.mine ? `onclick="hesPick(${k})"` : 'disabled'}><kbd>${k + 1}</kbd><b>${esc(o.label)}</b><span class="odds">${hesPct(
          H.odds[k]
        )}</span><small>${k === 0 ? 'AI’s pick' : 'the other read'}</small></button>`
    )
    .join(
      ''
    )}</div><div class="hest" aria-hidden="true"><i style="width:${Math.max(0, 100 - (100 * H.t) / RULES.hes.ms).toFixed(1)}%"></i></div><small class="hesf">${
    H.cards.length ? `${H.cards.length} duel card${H.cards.length > 1 ? 's' : ''} lit on the bar · ` : ''
  }your point odds · <kbd>Esc</kbd> AI’s pick</small>`;
}
/** Keys in a hesitation: 1 / 2 the options, Esc the AI's pick. Returns true when it took the key. */
function hesKey(e) {
  if (!A || !A.hes || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  if (e.key === 'Escape') return (hesPick(null, 'esc'), true);
  const k = /^Digit([12])$/.exec(e.code || '');
  if (!k || !A.hes.mine) return false;
  e.preventDefault();
  hesPick(+k[1] - 1);
  return true;
}
