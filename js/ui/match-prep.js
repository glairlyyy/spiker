// Match prep (spec §2.26, §2.33): the intro before every played match — both teams, their lineups and the hands. A side you
// run picks its cards (Monster: "You decide" per side; career: your side — 1 card, 5 as captain); the other hand is hidden.
// Play waits (A.prep) until Start. Your timeout opens the turn overlay for your hands (a huddle, js/ui/match-cards.js).

/** The sides whose run you can choose (You decide / Coach decides): Monster game both; career: none (your side is yours). */
function prepSides() {
  return A.fx.onFinish && typeof RUN !== 'undefined' && RUN ? [] : [0, 1];
}
/** The side you play for (career), or null. */
function prepMine(m) {
  if (!(A.fx.onFinish && typeof RUN !== 'undefined' && RUN)) return null;
  const you = Run.you(RUN);
  return [0, 1].find(k => squadOf(m.t[k]).some(p => p.id === you.id)) ?? null;
}
/** Open match prep (the intro before the first serve). */
function prepOpen() {
  if (!A || !A.m) return;
  const m = A.m;
  // who decides each side: you or the coach (Monster: the right team's coach by default, hidden)
  A.prepS = A.prepS || { who: [0, 1].map(i => (prepSides().includes(i) && i === 0 ? 'you' : 'ai')) };
  A.prep = true;
  for (const i of [0, 1]) {
    const n = cardsMine(m, i); // your hand (spec §2.33): the coach's pick to start from
    if (m.cards && n && m.cards[i].by !== 'you') cardsWho(m, i, n);
  }
  let el = $('#prep');
  if (!el) {
    $('#stage').insertAdjacentHTML('beforeend', '<div class="over prepo" id="prep" role="dialog" aria-label="Match prep"></div>');
    el = $('#prep');
  }
  el.hidden = false;
  prepDraw();
}
/** One team's column: banner, lineup in rotation order, the hand (yours) or a hidden line. */
function prepTeam(i) {
  const m = A.m,
    t = m.t[i],
    S = A.prepS,
    ovrAvg = Math.round(t.P.reduce((s, p) => s + ovr(p), 0) / t.P.length),
    lineup = rotOrder(t, m.rot[i])
      .map(
        (p, k) =>
          `<span class="pl ${k === 1 || k === 2 ? 'fr' : ''}">${stag(p)}#${p.num} ${p.role}${p.cap ? ' <span class="capb">C</span>' : ''}</span>`
      )
      .join(''),
    hand = prepSides().includes(i)
      ? `<div class="seg who">${['you', 'ai']
          .map(
            w =>
              `<button class="btn ${S.who[i] === w ? 'on' : ''}" onclick="prepWho(${i},'${w}')">${w === 'you' ? 'You decide' : 'Coach decides'}</button>`
          )
          .join(
            ''
          )}</div>${S.who[i] === 'you' ? cardsHand(i, true) : '<p class="small mute">The coach picks — hidden until the match is over.</p>'}`
      : cardsMine(m, i)
        ? cardsHand(i, true) + prepHabits(m, i)
        : '<p class="small mute">Their hand: hidden.</p>';
  return `<section class="pteam" style="--tc:${t.color}"><div class="pban"><h3>${esc(t.name)}</h3><span class="povr"><b>${ovrAvg}</b> OVR</span><span class="small mute">${esc((t.S && t.S.name) || '')}</span></div><div class="lineup">${lineup}</div>${hand}</section>`;
}
/** The rival's habits you uncovered at the Tape Room (spec §4.31), under your hand when she is across the net from side i. */
function prepHabits(m, i) {
  if (typeof RUN === 'undefined' || !RUN || !A.fx.onFinish) return '';
  const riv = Stars.get(RUN, 'rival'),
    seen = riv && squadOf(m.t[1 - i]).includes(riv) ? Secret.seen(RUN) : [];
  return seen.length ? `<div class="small bhab"><b>From her tape:</b> ${seen.map(h => esc(h.text)).join(' · ')}</div>` : '';
}
function prepDraw() {
  const el = $('#prep');
  if (!el || !A.prepS) return;
  el.innerHTML = `<div class="ocard prep"><div class="phead"><span class="lab">${esc(A.fx.round || 'Match prep')}</span></div>
    <div class="pcols">${[0, 1].map(prepTeam).join('<div class="pvs">VS</div>')}</div>
    <div class="acts"><button class="btn hot" onclick="prepStart()">Start match <kbd>Enter</kbd></button></div></div>`;
}
function prepWho(i, w) {
  if (!A || !A.prepS) return;
  A.prepS.who[i] = w;
  cardsWho(A.m, i, cardsMine(A.m, i));
  prepDraw();
}
/** Start: the hands stand as placed (the cards set the plans, spec §2.33). */
function prepStart() {
  if (!A || !A.prep) return;
  A.prep = false;
  const el = $('#prep');
  if (el) el.hidden = true;
  if (A.railTab === 'coach') coachPanel();
}
