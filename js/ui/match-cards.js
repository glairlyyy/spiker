// Tactic cards on the match screen (spec §2.31–§2.33): your hand in match prep and at every turn — an overlay over the frozen
// court (play waits: A.prep) — Tab to look at it between turns, the spent tag, the result card's row. The engine state is
// m.cards (js/engine/cards.js); this file only places cards (cardPut) and lets the coach fill around them (cardFill).

const ZONE_LAB = { atk: 'ATK', def: 'DEF', flex: 'FLEX' };

/** Is this a career match (your player is in it)? */
const cardsCareer = () => !!(A && A.fx.onFinish && typeof RUN !== 'undefined' && RUN);
/** How many of side i's cards are yours: Monster — "You decide" 5; career — your side: 5 as captain, else 1. */
function cardsMine(m, i) {
  if (!m || !m.cards) return 0;
  if (!cardsCareer()) return A.prepS && A.prepS.who && A.prepS.who[i] === 'you' ? SLOTS.length : 0;
  const you = Run.you(RUN);
  if (!squadOf(m.t[i]).some(p => p.id === you.id)) return 0;
  return you.cap ? SLOTS.length : 1;
}
/** Give side i to you (n cards yours; a full hand starts from the coach's) or to the coach (n 0); the coach fills the rest. */
function cardsWho(m, i, n) {
  const C = m && m.cards && m.cards[i];
  if (!C) return;
  if (n) {
    if (C.by !== 'you' && n >= SLOTS.length) for (const k of SLOTS) if (C.slots[k]) C.you[k] = C.slots[k];
    C.by = 'you';
    C.mine = n;
  } else {
    C.by = 'ai';
    C.mine = 0;
    C.you = {};
  }
  cardFill(m, i);
}
/** One card as a chip: its name, kind, state (Worn / Spent) and the spent rule on hover; ◆ = a technique you own. */
function cardChip(m, i, id) {
  const c = CARDS[id],
    C = m.cards[i],
    E = CARD_EDGE[id],
    key = comboOf(cardIds(m, i), id) || id,
    net = C.net[key] || 0,
    st = C.spent.includes(id) ? 'spent' : C.worn.includes(id) ? 'worn' : '',
    fits = c.kind === 'play' && E && !st && (CARD_FIT[E.fit] || CARD_FIT.always)(m, i), // (what you can read; never their hand)
    you = cardsCareer() && c.need && hasTech(Run.you(RUN), c.need),
    ctr = E && E.ctr.length ? ` Countered by: ${E.ctr.map(x => CARDS[x].name).join(', ')}.` : '',
    rule =
      c.kind === 'boost'
        ? 'Never spent.'
        : `Pays when it ${FIT_TIP[E ? E.fit : 'always']}.${ctr} Burns at ${TURN.spent} net points in the rallies it plays off the read (now ${net > 0 ? '+' : ''}${net}).`;
  return `<span class="ccard k-${c.kind} z-${c.zone} ${st} ${fits ? 'fits' : ''}" ${tip(`${c.desc}. ${rule}`)}><b>${you ? '◆ ' : ''}${esc(c.name)}</b><i>${
    st === 'spent' ? 'Spent' : st === 'worn' ? 'Worn' : c.kind === 'boost' ? 'Boost' : fits ? 'Fits now' : c.zone === 'op' ? 'OP' : 'Play'
  }</i></span>`;
}
/** Each read in words (the card's tooltip, registrar voice). */
const FIT_TIP = {
  always: 'is slotted',
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
  theirPower: 'faces hitters stronger than our defence'
};
/** Side i's hand: the five slots, then the pool (edit: cards can be placed). */
function cardsHand(i, edit) {
  const m = A.m,
    C = m.cards && m.cards[i];
  if (!C) return '';
  const ids = cardIds(m, i),
    sel = A.cardSel && A.cardSel.i === i ? A.cardSel.k : null,
    left = C.mine - Object.keys(C.you).length,
    slots = SLOTS.map(k => {
      const id = C.slots[k],
        combo = id && comboOf(ids, id);
      return `<button class="cslot ${C.you[k] ? 'you' : ''} ${sel === k ? 'sel' : ''}" ${edit ? `onclick="cardsSlot(${i},'${k}')"` : 'disabled'}><span class="lab">${ZONE_LAB[slotZone(k)]}${combo ? ` · ${esc(COMBOS[combo].name)}` : ''}</span>${
        id ? cardChip(m, i, id) : '<span class="ccard empty"><b>Empty</b></span>'
      }</button>`;
    }).join(''),
    pool = cardPool(m, i)
      .filter(id => !ids.includes(id))
      .map(id => `<button class="cpick" ${edit ? `onclick="cardsPick(${i},'${id}')"` : 'disabled'}>${cardChip(m, i, id)}</button>`)
      .join(''),
    spent = C.spent.map(id => cardChip(m, i, id)).join('');
  const note = edit
    ? C.mine >= SLOTS.length
      ? 'Click a card to slot it. Click a slot to pick it, again to empty it.'
      : `Your card${C.mine > 1 ? 's' : ''}: ${C.mine} (${Math.max(0, left)} to place) — the coach fills the rest.`
    : 'Cards change at a turn.';
  return `<div class="chand"><div class="cslots">${slots}</div><p class="small mute">${note}</p>${edit ? `<div class="cpool">${pool}</div>` : ''}${
    spent ? `<div class="cspent"><span class="lab">Spent</span>${spent}</div>` : ''
  }</div>`;
}
/** A slot clicked: select it; clicked again: empty it (yours only). */
function cardsSlot(i, k) {
  const C = A.m.cards[i];
  if (A.cardSel && A.cardSel.i === i && A.cardSel.k === k) {
    A.cardSel = null;
    if (C.you[k] || C.mine >= SLOTS.length) cardsSet(i, k, null);
  } else A.cardSel = { i, k };
  cardsRedraw();
}
/** A pool card clicked: into the selected slot if it fits, else the first empty slot it fits, else the first it fits. */
function cardsPick(i, id) {
  const m = A.m,
    C = m.cards[i],
    fits = SLOTS.filter(k => cardFits(id, k)),
    sel = A.cardSel && A.cardSel.i === i && fits.includes(A.cardSel.k) ? A.cardSel.k : null,
    k = sel || fits.find(s => !C.slots[s]) || fits.find(s => !C.you[s]) || fits[0];
  if (!k) return;
  // a limited hand (career): your card moves rather than adding one more
  if (!C.you[k] && Object.keys(C.you).length >= C.mine) {
    const old = Object.keys(C.you)[0];
    if (old) cardPut(m, i, old, null);
  }
  cardsSet(i, k, id);
  A.cardSel = null;
  cardsRedraw();
}
/** Place (or empty) a slot; the coach then fills around your cards (a side you run in full stays as you left it). */
function cardsSet(i, k, id) {
  const m = A.m;
  cardPut(m, i, k, id);
  if (m.cards[i].mine < SLOTS.length) cardFill(m, i);
  else cardApply(m, i);
}
/** The coach picks this hand (your cards cleared); a side you run keeps it as yours. */
function cardsAuto(i) {
  const m = A.m,
    n = m.cards[i].mine;
  cardsWho(m, i, 0);
  if (n) cardsWho(m, i, n);
  cardsRedraw();
}
function cardsRedraw() {
  if ($('#cturn') && !$('#cturn').hidden) cardsTurnDraw();
  else if (A.prep) prepDraw();
}

/** The turn overlay's sides: the hands you run (none once you hand the match to the coach). */
const cardsSides = m => (m && m.cards && !A.cardAuto ? [0, 1].filter(i => m.cards[i].by === 'you') : []);
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
  A.cardSel = null;
  A.prep = true;
  el.hidden = false;
  cardsTurnDraw();
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
  if (A.prep || !A.m.cards) return;
  if ([0, 1].some(i => A.m.cards[i].by === 'you')) cardsTurnOpen(null, false);
}
/** Hand the rest of the match to the coach: no more turn stops. */
function cardsAutoMatch() {
  A.cardAuto = true;
  for (const i of [0, 1]) if (A.m.cards[i].by === 'you') cardsWho(A.m, i, 0);
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
  const sides = [0, 1].filter(i => m.cards[i].by === 'you'),
    noticed = i =>
      [...Coach.tags(m, 1 - i), ...Coach.tags(m, i)]
        .slice(0, 3)
        .map(g => `<li>${esc(g.text)}</li>`)
        .join(''),
    col = i =>
      `<section class="pteam" style="--tc:${m.t[i].color}"><div class="pban"><h3>${esc(m.t[i].name)}</h3><span class="povr"><b>${m.pts[i]}</b></span><span class="small mute">${esc(
        STAGES[m.stage[i]].name
      )}</span></div><div class="cbars">${m.t[i].P.map(p => cardsBars(m, p)).join('')}</div>${
        noticed(i) ? `<ul class="cnote small">${noticed(i)}</ul>` : ''
      }${cardsHand(i, T.edit)}${T.edit ? `<button class="btn" onclick="cardsAuto(${i})">Coach picks <kbd>A</kbd></button>` : ''}</section>`;
  el.innerHTML = `<div class="ocard prep cturn ${sides.length === 1 ? 'one' : ''}"><div class="phead"><span class="lab">${T.edit ? `Turn ${T.n}` : 'Your hand'} · ${esc(m.t[0].short)} ${m.pts[0]}–${m.pts[1]} ${esc(m.t[1].short)}</span></div>
    <div class="pcols">${sides.map(col).join('')}</div>
    <div class="acts">${T.edit ? '<button class="btn" onclick="cardsAutoMatch()">Coach for the match</button>' : ''}<button class="btn hot" onclick="cardsTurnClose()">${T.edit ? 'Play on' : 'Back to the match'} <kbd>${T.edit ? 'Space' : 'Tab'}</kbd></button></div></div>`;
}
/** Keys while the overlay is open: Space / Enter / Tab / Esc play on, A the coach picks. Returns true when it took the key. */
function cardsKey(e) {
  if (!A || !A.cturn) return false;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    cardsTurnClose();
  } else if ((e.key === 'a' || e.key === 'A') && A.cturn.edit) for (const i of cardsSides(A.m)) cardsAuto(i);
  return true;
}
/** A spent card (acts.js `cardspent`): a tag over the court. */
function cardsSpentShow(a) {
  if (!A || !A.m || !CARDS[a.id]) return;
  instant({ k: 'label', t: `${A.m.t[a.side].short}: ${CARDS[a.id].name} spent`, small: 1, dy: 40 });
}
/** The result card's row: each side's plays — turns slotted — and the spent ones. */
function cardsRow(m) {
  if (!m || !m.cards) return '';
  const side = i => {
    const C = m.cards[i],
      played = Object.entries(C.played)
        .filter(([id]) => CARDS[id].kind === 'play')
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${esc(CARDS[id].name)} ×${n}`)
        .join(' · '),
      spent = C.spent.map(id => esc(CARDS[id].name)).join(' · ');
    return `<div class="rplan"><span class="rpt">${chip(m.t[i])}${esc(m.t[i].short)}</span><span>${played || '<span class="mute">boosts only</span>'}${
      spent ? ` <span class="rspent">— spent: ${spent}</span>` : ''
    }</span></div>`;
  };
  return `<div class="rplans"><div class="lab">Cards <span class="mute">(turns slotted)</span></div>${side(0)}${side(1)}</div>`;
}
