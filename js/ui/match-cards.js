// Tactic cards on the match screen (spec §2.31–§2.33): your hand in match prep and at every turn — an overlay over the frozen
// court (play waits: A.prep) — Tab to look at it between turns, the spent tag, the result card's row. The engine state is
// m.cards (js/engine/cards.js); this file only places cards (cardPut) and lets the coach fill around them (cardFill).

const ZONE_LAB = { atk: 'ATK', def: 'DEF', flex: 'FLEX' };

/** Is this a career match (your player is in it)? */
const cardsCareer = () => !!(A && A.fx.onFinish && RUN);
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
    fits = (c.kind === 'play' || c.kind === 'once') && E && !st && (CARD_FIT[E.fit] || CARD_FIT.always)(m, i), // (what you can read; never their hand)
    you = cardsCareer() && c.need && hasTech(Run.you(RUN), c.need),
    ctr = E && E.ctr.length ? ` Countered by: ${E.ctr.map(x => CARDS[x].name).join(', ')}.` : '',
    rule =
      c.kind === 'boost' || c.src === 'duo'
        ? 'Never spent.'
        : c.kind === 'once'
          ? `Used up the moment it is slotted${E && E.fit !== 'always' ? `; best when it ${FIT_TIP[E.fit]}` : ''}.`
          : c.kind === 'trap'
            ? `Hidden from them. At the next serve, if they have slotted ${c.trap.map(x => CARDS[x].name).join(', ')}, that card burns and the trap is used up.`
            : `Pays when it ${FIT_TIP[E ? E.fit : 'always']}.${ctr} Burns at ${TURN.spent} net points in the rallies it plays off the read (now ${net > 0 ? '+' : ''}${net}).`;
  return `<span class="ccard k-${c.kind} z-${c.zone} ${st} ${fits ? 'fits' : ''}" ${tip(`${c.desc}. ${rule}`)}><b>${you ? '◆ ' : ''}${esc(cardName(m, i, id))}</b><i>${
    st === 'spent'
      ? c.kind === 'once' || c.kind === 'trap'
        ? 'Used'
        : 'Spent'
      : st === 'worn'
        ? 'Worn'
        : c.kind === 'boost'
          ? 'Boost'
          : c.kind === 'trap'
            ? 'Trap'
            : fits
              ? 'Fits now'
              : c.kind === 'once'
                ? 'One-shot'
                : c.zone === 'op'
                  ? 'OP'
                  : c.src === 'duo'
                    ? 'Duo'
                    : 'Play'
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
  fresh: 'starts from fresh legs (stamina 0.75+)'
};
/** Side i's hand: the five slots, then the pool (edit: cards can be placed). */
function cardsHand(i, edit) {
  const m = A.m,
    C = m.cards && m.cards[i];
  if (!C) return '';
  const ids = cardIds(m, i),
    sel = A.cardSel && A.cardSel.i === i ? A.cardSel.k : null,
    left = C.mine - Object.keys(C.you).length,
    mine = k => C.you[k] || C.mine >= SLOTS.length, // a slot you may change
    slots = SLOTS.map(k => {
      const id = C.slots[k],
        combo = id && comboOf(ids, id),
        drag =
          edit && id && mine(k)
            ? ` draggable="true" ondragstart="cardsDragStart(event,${i},'${id}','${k}')" ondragend="cardsDragEnd()"`
            : '',
        drop = edit
          ? ` ondragover="cardsDragOver(event,${i},'${k}')" ondragleave="this.classList.remove('dropon')" ondrop="cardsDrop(event,${i},'${k}')"`
          : '';
      return `<button class="cslot ${C.you[k] ? 'you' : ''} ${sel === k ? 'sel' : ''}" data-slot="${k}" ${edit ? `onclick="cardsSlot(${i},'${k}')"` : 'disabled'}${drag}${drop}><span class="lab">${ZONE_LAB[slotZone(k)]}${combo ? ` · ${esc(COMBOS[combo].name)}` : ''}</span>${
        id ? cardChip(m, i, id) : '<span class="ccard empty"><b>Empty</b></span>'
      }</button>`;
    }).join(''),
    all = cardPool(m, i).filter(id => !ids.includes(id)),
    f = cardsFiltOf(i),
    pool = all
      .filter(id => CARD_FILTS[f].ok(m, i, id))
      .map(
        id =>
          `<button class="cpick" data-card="${id}" ${edit ? `onclick="cardsPick(${i},'${id}')" draggable="true" ondragstart="cardsDragStart(event,${i},'${id}',null)" ondragend="cardsDragEnd()"` : 'disabled'}>${cardChip(m, i, id)}</button>`
      )
      .join(''),
    spent = C.spent.map(id => cardChip(m, i, id)).join('');
  const note = edit
    ? C.mine >= SLOTS.length
      ? 'Drag a card into a slot (or click it). Drag a slot back to the pool to empty it.'
      : `Your card${C.mine > 1 ? 's' : ''}: ${C.mine} (${Math.max(0, left)} to place) — the coach fills the rest.`
    : 'Cards change at a turn.';
  return `<div class="chand"><div class="cslots">${slots}</div><p class="small mute">${note}</p>${edit ? cardsFiltBar(m, i, all, f) : ''}${edit ? `<div class="cpool" ondragover="cardsDragOver(event,${i},null)" ondragleave="this.classList.remove('dropon')" ondrop="cardsDrop(event,${i},null)">${pool}</div>` : ''}${
    spent ? `<div class="cspent"><span class="lab">Spent</span>${spent}</div>` : ''
  }</div>`;
}
/**
 * The pool's filters (owner, 2026-10-17: 43 cards is a long pool): by what fits now, zone or kind. Per side, kept while the
 * match lasts (A.cardFilt); a filter with no card is not shown.
 */
const cardFitsNow = (m, i, id) => {
  const E = CARD_EDGE[id],
    c = CARDS[id];
  return (c.kind === 'play' || c.kind === 'once') && !!E && (CARD_FIT[E.fit] || CARD_FIT.always)(m, i);
};
const CARD_FILTS = {
  all: { label: 'All', ok: () => true },
  fits: { label: 'Fits now', ok: cardFitsNow },
  atk: { label: 'ATK', ok: (m, i, id) => CARDS[id].zone === 'atk' },
  def: { label: 'DEF', ok: (m, i, id) => CARDS[id].zone === 'def' },
  op: { label: 'OP', ok: (m, i, id) => CARDS[id].zone === 'op' },
  boost: { label: 'Boost', ok: (m, i, id) => CARDS[id].kind === 'boost' },
  once: { label: 'One-shot', ok: (m, i, id) => CARDS[id].kind === 'once' },
  trap: { label: 'Trap', ok: (m, i, id) => CARDS[id].kind === 'trap' }
};
const cardsFiltOf = i => (A.cardFilt && CARD_FILTS[A.cardFilt[i]] ? A.cardFilt[i] : 'all');
/** The filter row over the pool: each filter with its count (none shown when it would be empty). */
function cardsFiltBar(m, i, all, f) {
  const b = Object.entries(CARD_FILTS)
    .map(([k, F]) => [k, F, all.filter(id => F.ok(m, i, id)).length])
    .filter(([k, , n]) => n || k === f)
    .map(
      ([k, F, n]) =>
        `<button class="cfilt ${k === f ? 'on' : ''}" data-filt="${k}" onclick="cardsFilt(${i},'${k}')">${F.label} <i>${n}</i></button>`
    )
    .join('');
  return `<div class="cfilts" role="toolbar" aria-label="Filter the cards">${b}</div>`;
}
function cardsFilt(i, k) {
  (A.cardFilt || (A.cardFilt = {}))[i] = k;
  cardsRedraw();
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
/**
 * A pool card clicked (or dropped on slot `at`): into that slot, else the selected slot if it fits, else the first empty slot
 * it fits, else the first it fits.
 */
function cardsPick(i, id, at) {
  const m = A.m,
    C = m.cards[i],
    fits = SLOTS.filter(k => cardFits(id, k)),
    sel = A.cardSel && A.cardSel.i === i && fits.includes(A.cardSel.k) ? A.cardSel.k : null,
    k = (at && fits.includes(at) && at) || sel || fits.find(s => !C.slots[s]) || fits.find(s => !C.you[s]) || fits[0];
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
/**
 * Drag and drop (owner, 2026-10-16): a pool card onto a slot, a slot's card onto another slot (they swap when the other fits
 * back), a slot's card onto the pool (emptied). While dragging, the slots it fits light up. Clicks still work.
 */
function cardsDragStart(e, i, id, from) {
  A.cardDrag = { i, id, from };
  try {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  } catch (er) {
    // (some browsers refuse setData on a button: the drag still works from A.cardDrag)
  }
  const hand = e.target.closest('.chand');
  if (hand) {
    for (const s of hand.querySelectorAll('.cslot')) s.classList.add(cardFits(id, s.dataset.slot) ? 'can' : 'no');
    if (from) hand.querySelector('.cpool')?.classList.add('can');
  }
}
function cardsDragEnd() {
  A.cardDrag = null;
  for (const s of document.querySelectorAll('.chand .can, .chand .no, .chand .dropon')) s.classList.remove('can', 'no', 'dropon');
}
/** Over a slot (k) or the pool (k null): allow the drop when it would do something. */
function cardsDragOver(e, i, k) {
  const D = A.cardDrag;
  if (!D || D.i !== i) return;
  if (k ? !cardFits(D.id, k) || k === D.from : !D.from) return;
  e.preventDefault();
  e.currentTarget.classList.add('dropon');
}
function cardsDrop(e, i, k) {
  const D = A.cardDrag;
  e.preventDefault();
  cardsDragEnd();
  if (!D || D.i !== i) return;
  const m = A.m,
    C = m.cards[i];
  if (!k) {
    if (D.from) cardsSet(i, D.from, null); // back to the pool: the slot empties (the coach refills it if it is not yours)
  } else if (!D.from) return cardsPick(i, D.id, k);
  else if (k !== D.from && cardFits(D.id, k)) {
    const other = C.slots[k],
      back = other && (C.you[k] || C.mine >= SLOTS.length) && cardFits(other, D.from) ? other : null;
    cardPut(m, i, D.from, null);
    cardPut(m, i, k, D.id);
    if (back) cardPut(m, i, D.from, back); // a swap
    cardsSet(i, k, D.id);
  }
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
  instant({
    k: 'label',
    t: a.trap
      ? `${CARDS[a.trap].name}! ${A.m.t[a.side].short}: ${CARDS[a.id].name} burns`
      : `${A.m.t[a.side].short}: ${CARDS[a.id].name} spent`,
    small: 1,
    dy: 40
  });
}
/** The result card's row: each side's plays — turns slotted — and the spent ones. */
function cardsRow(m) {
  if (!m || !m.cards) return '';
  const side = i => {
    const C = m.cards[i],
      played = Object.entries(C.played)
        .filter(([id]) => CARDS[id].kind !== 'boost')
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${esc(cardName(m, i, id))} ×${n}`)
        .join(' · '),
      spent = C.spent.map(id => esc(CARDS[id].name)).join(' · ');
    return `<div class="rplan"><span class="rpt">${chip(m.t[i])}${esc(m.t[i].short)}</span><span>${played || '<span class="mute">boosts only</span>'}${
      spent ? ` <span class="rspent">— spent: ${spent}</span>` : ''
    }</span></div>`;
  };
  return `<div class="rplans"><div class="lab">Cards <span class="mute">(turns slotted)</span></div>${side(0)}${side(1)}</div>`;
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
 * it is slotted with its pair on court. Stops when the match ends or the screen leaves it. Presentation only (no draws).
 */
function teamWatch(m) {
  if (!A || A.m !== m || A.done || m.over) return;
  if (!A.prep && !A.cturn && !X && !Dir.talk && !(A.beats && A.bi < A.beats.length && A.beats[A.bi].scene)) {
    const seen = A.duoSeen || (A.duoSeen = new Set());
    if (m.exIds && !A.exSaid) {
      A.exSaid = true;
      exRemark(m);
    } else if (m.duo)
      for (const i of [0, 1])
        for (const id of cardIds(m, i))
          if (CARDS[id].src === 'duo' && !seen.has(id) && duoOn(m.t[i], duoIds(m, i, id) || [])) {
            seen.add(id);
            cardsDuoCut(m, i, id);
            break;
          }
  }
  requestAnimationFrame(() => teamWatch(m));
}
