// Tactic cards on the match screen (spec §2.31–§2.33, §2.37) — a stop-gap view of the deck until the hand bar (T-347): match
// prep shows each hand you run and its deck; a turn opens an overlay over the frozen court (play waits: A.prep) with your
// hand — click a card to play it on the next point — Tab looks at it between turns; a tag over the court names each play;
// the result card's row. The engine state is m.deck (js/engine/cards.js: Cards.play / Cards.discard / Cards.capPlay).

/** Is this a career match (your player is in it)? */
const cardsCareer = () => !!(A && A.fx.onFinish && RUN);
/** Which of side i's cards are yours: Monster — "You decide" DECK.hand (all); career — your side: all as captain, else 1 (the cards you bring). */
function cardsMine(m, i) {
  if (!m || !m.deck) return 0;
  if (!cardsCareer()) return A.prepS && A.prepS.who && A.prepS.who[i] === 'you' ? DECK.hand : 0;
  const you = Run.you(RUN);
  if (!squadOf(m.t[i]).some(p => p.id === you.id)) return 0;
  return you.cap ? DECK.hand : 1;
}
/** Give side i to you (n DECK.hand: the whole hand; 1: the cards you bring, the captain the rest) or to the captain (n 0). */
function cardsWho(m, i, n) {
  const D = m && m.deck && m.deck[i];
  if (!D) return;
  D.by = n >= DECK.hand ? 'you' : 'ai';
  D.me = n && n < DECK.hand && cardsCareer() ? Run.you(RUN).id : null;
}
/** Cost → result in words (spec §2.37): "−0.10 stamina (holders) → serve +5 % · 3 serves". */
function cardCost(id) {
  const c = CARDS[id],
    bar = { sta: 'stamina', hp: 'HP', mor: 'morale' },
    who = { holder: 'holders', captain: 'captain', court: 'court' },
    pay = C => (C ? `−${C.amt.toFixed(2)} ${bar[C.bar]} (${who[C.who]})` : 'free'),
    len = c.dur ? `${c.dur} ${c.per === 'srv' ? 'serves' : c.dur === 1 ? 'point' : 'points'}` : 'at once';
  return `${pay(c.cost)} → ${c.desc} · ${len}${c.after ? ` · after: ${pay(c.after)}` : ''} · cools ${c.cd === Infinity ? 'never (once a match)' : `${c.cd} points`}`;
}
/** One card as a chip: its name, kind, Fits now, cost → result on hover; ◆ = a card you bring. */
function cardChip(m, i, id, tag) {
  const c = CARDS[id],
    E = CARD_EDGE[id],
    fits = c.kind !== 'basic' && E && E.fit !== 'always' && Cards.fits(m, i, id), // (what you can read; never their hand)
    you = cardsCareer() && cardBrings(m, i, Run.you(RUN), id),
    ctr = E && E.ctr.length ? ` Countered by: ${E.ctr.map(x => CARDS[x].name).join(', ')}.` : '',
    rule =
      c.kind === 'trap'
        ? `Hidden from them. Armed ${c.dur} points: if they play ${c.trap.map(x => CARDS[x].name).join(', ')}, that card is caught.`
        : E && E.fit !== 'always'
          ? `Pays when it ${FIT_TIP[E.fit]}.${ctr}`
          : '';
  return `<span class="ccard k-${c.kind} z-${c.zone} ${fits ? 'fits' : ''}" ${tip(`${cardCost(id)}. ${rule}`)}><b>${you ? '◆ ' : ''}${esc(cardName(m, i, id))}</b><i>${
    tag || (fits ? 'Fits now' : { basic: 'Basic', trap: 'Trap', once: 'One-shot', op: 'OP' }[c.kind] || (c.src === 'duo' ? 'Duo' : 'Play'))
  }</i></span>`;
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
/** Side i's hand (edit: click a card of yours to play it on the next point), its active cards, the deck and discard counts; prep: the deck. */
function cardsHand(i, edit) {
  const m = A.m,
    D = m.deck && m.deck[i];
  if (!D) return '';
  const hand = D.hand
      .map((id, h) => {
        const why = id ? Cards.can(m, i, h) : 'gap',
          ok = edit && !why && Cards.mine(m, i, id);
        return `<button class="cslot ${id && Cards.mine(m, i, id) ? 'you' : ''}" data-hand="${h}" ${ok ? `onclick="cardsPlay(${i},${h})"` : 'disabled'}><span class="lab">${h + 1}</span>${
          id ? cardChip(m, i, id) : '<span class="ccard empty"><b>Empty</b></span>'
        }</button>`;
      })
      .join(''),
    act = D.act
      .filter(a => !a.pin)
      .map(a => cardChip(m, i, a.id, `${a.left} ${a.per === 'srv' ? 'serves' : 'pts'} left`))
      .join(''),
    deck = A.prep && !A.cturn ? [...D.hand, ...D.draw].filter(Boolean) : [],
    note = edit
      ? D.by === 'you'
        ? 'Click a card to play it on the next point (one a point). The hand refills at each turn.'
        : 'Your cards (◆) are yours to play — the captain plays the rest.'
      : 'The hand refills at each turn.';
  return `<div class="chand"><div class="cslots">${hand}</div><p class="small mute">${note} Deck ${D.draw.length} · discard ${D.disc.length}${
    D.used.length ? ` · used ${D.used.length}` : ''
  }</p>${act ? `<div class="cspent"><span class="lab">Active</span>${act}</div>` : ''}${
    deck.length ? `<div class="cpool">${deck.map(id => `<span class="cpick">${cardChip(m, i, id)}</span>`).join('')}</div>` : ''
  }</div>`;
}
/** Play hand card h of side i (between points): it acts from the next serve. */
function cardsPlay(i, h) {
  if (!A || !A.m) return;
  Cards.play(A.m, i, h);
  cardsRedraw();
}
function cardsRedraw() {
  if ($('#cturn') && !$('#cturn').hidden) cardsTurnDraw();
  else if (A.prep) prepDraw();
}

/** The turn overlay's sides: the hands you play in (none once you hand the match to the captain). */
const cardsSides = m => (m && m.deck && !A.cardAuto ? [0, 1].filter(i => m.deck[i].by === 'you' || m.deck[i].me) : []);
/** A turn act (acts.js `turn`, spec §2.32): pause and open the overlay for your hands. */
function cardsTurnShow(a) {
  if (!A || A.done || !cardsSides(A.m).length) return;
  cardsTurnOpen(a.n, true);
}
/** Open the overlay: at a turn (edit) or with Tab between turns (look only). Play waits (A.prep). */
function cardsTurnOpen(n, edit) {
  let el = $('#cturn');
  if (!el) {
    $('#stage').insertAdjacentHTML('beforeend', '<div class="over prepo" id="cturn" role="dialog" aria-label="Turn"></div>');
    el = $('#cturn');
  }
  A.cturn = { n: n ?? A.m.turnN, edit };
  A.prep = true;
  el.hidden = false;
  el.classList.remove('settled'); // (the entrance animation plays once per opening, not on every redraw)
  cardsTurnDraw();
  requestAnimationFrame(() => el.classList.add('settled'));
}
/** Close the overlay and play on. */
function cardsTurnClose() {
  const el = $('#cturn');
  if (el) el.hidden = true;
  A.cturn = null;
  A.prep = false;
}
/** Tab: look at your hands between turns (or close the overlay). */
function cardsPeek() {
  if (!A || !A.m || A.done) return;
  if (A.cturn) return cardsTurnClose();
  if (A.prep || !A.m.deck) return;
  if (cardsSides(A.m).length) cardsTurnOpen(null, false);
}
/** Hand the rest of the match to the captain: no more turn stops. */
function cardsAutoMatch() {
  A.cardAuto = true;
  for (const i of [0, 1]) if (A.m.deck[i].by === 'you' || A.m.deck[i].me) cardsWho(A.m, i, 0);
  cardsTurnClose();
}
/** One player's three bars (spec §2.31) and their morale trait. */
function cardsBars(m, p) {
  const hp = hpOf(m, p),
    sta = m.sta[p.id] == null ? 1 : m.sta[p.id],
    bar = (cls, v, t) => `<span class="hbar ${cls}" style="--v:${(100 * clamp(v, 0, 1)).toFixed(0)}%" ${tip(t)}></span>`,
    tr = MTRAITS[mtr(m, p)];
  return `<div class="cbrow"><span class="cbname">#${p.num} ${p.role}${tr ? ` <i ${tip(tr.tip)}>${esc(tr.name)}</i>` : ''}</span>${bar('hp', hp, `HP ${Math.round(hp * 100)}`)}${bar(
    'sta',
    sta,
    `Stamina ${Math.round(sta * 100)}`
  )}${bar('mor', (morOf(m, p) + 1) / 2, `Morale ${morOf(m, p).toFixed(2)}`)}</div>`;
}
function cardsTurnDraw() {
  const el = $('#cturn'),
    m = A.m,
    T = A.cturn;
  if (!el || !T) return;
  const sides = cardsSides(m),
    noticed = i =>
      [...Reads.tags(m, 1 - i), ...Reads.tags(m, i)]
        .slice(0, 3)
        .map(g => `<li>${esc(g.text)}</li>`)
        .join(''),
    col = i =>
      `<section class="pteam" style="--tc:${m.t[i].color}"><div class="pban"><h3>${esc(m.t[i].name)}</h3><span class="povr"><b>${m.pts[i]}</b></span><span class="small mute">${esc(
        STAGES[m.stage[i]].name
      )}</span></div><div class="cbars">${m.t[i].P.map(p => cardsBars(m, p)).join('')}</div>${
        noticed(i) ? `<ul class="cnote small">${noticed(i)}</ul>` : ''
      }${cardsHand(i, true)}</section>`;
  el.innerHTML = `<div class="ocard prep cturn ${sides.length === 1 ? 'one' : ''}"><div class="phead"><span class="lab">${T.edit ? `Turn ${T.n}` : 'Your hand'} · ${esc(m.t[0].short)} ${m.pts[0]}–${m.pts[1]} ${esc(m.t[1].short)}</span></div>
    <div class="pcols">${sides.map(col).join('')}</div>
    <div class="acts"><button class="btn" onclick="cardsAutoMatch()">Captain for the match</button><button class="btn hot" onclick="cardsTurnClose()">${T.edit ? 'Play on' : 'Back to the match'} <kbd>${T.edit ? 'Space' : 'Tab'}</kbd></button></div></div>`;
}
/** Keys while the overlay is open: Space / Enter / Tab / Esc play on, 1–5 play that hand card. Returns true when it took the key. */
function cardsKey(e) {
  if (!A || !A.cturn) return false;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    cardsTurnClose();
  } else if (/^[1-9]$/.test(e.key)) {
    const i = cardsSides(A.m)[0],
      h = +e.key - 1;
    if (i != null && A.m.deck[i].hand[h] && Cards.mine(A.m, i, A.m.deck[i].hand[h])) cardsPlay(i, h);
  }
  return true;
}
/** A card played (acts.js `card`, spec §2.37): a tag over the court ("Wu plays Killer Serve"; a trap's catch). T-346 draws it properly. */
function cardsPlayShow(a) {
  if (!A || !A.m || !CARDS[a.id]) return;
  const t = A.m.t[a.side].short,
    n = cardName(A.m, a.side, a.id);
  if (typeof DBG !== 'undefined')
    DBG.log('info', `card: ${t} plays ${n}${a.caught ? ` (caught: ${a.caught})` : ''} · by ${a.by} · ${a.st}`);
  instant({
    k: 'label',
    t: a.caught ? `${CARDS[a.caught].name}! ${t}: ${n} caught` : `${t} plays ${n}`,
    small: 1,
    dy: 40
  });
}
/** The result card's row: each side's cards played (× times). */
function cardsRow(m) {
  if (!m || !m.deck) return '';
  const side = i => {
    const D = m.deck[i],
      played = Object.entries(D.played)
        .filter(([id]) => CARDS[id].kind !== 'basic')
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${esc(cardName(m, i, id))} ×${n}`)
        .join(' · ');
    return `<div class="rplan"><span class="rpt">${chip(m.t[i])}${esc(m.t[i].short)}</span><span>${played || '<span class="mute">Basics only</span>'}</span></div>`;
  };
  return `<div class="rplans"><div class="lab">Cards <span class="mute">(times played)</span></div>${side(0)}${side(1)}</div>`;
}
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
  if (!A.prep && !A.cturn && !X && !Dir.talk && !(A.beats && A.bi < A.beats.length && A.beats[A.bi].scene)) {
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
