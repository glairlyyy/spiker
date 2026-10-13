// Match prep (spec §2.26): the intro before every played match — both teams, their lineups and the plans. A side you run
// (both in a Monster game; in a career match your side when you are its captain) picks its attack and defence plan; the
// other side's plan is hidden. Play waits (A.prep) until Start. Your side's timeout reopens it for that side (a huddle).

/** The sides whose plan you set: Monster game both; career: your side if you captain it; else none. */
function prepSides(m) {
  if (!(A.fx.onFinish && typeof RUN !== 'undefined' && RUN)) return [0, 1];
  const you = Run.you(RUN),
    i = [0, 1].find(k => squadOf(m.t[k]).some(p => p.id === you.id));
  return i != null && you.cap ? [i] : [];
}
/** The side you play for (career), or null. */
function prepMine(m) {
  if (!(A.fx.onFinish && typeof RUN !== 'undefined' && RUN)) return null;
  const you = Run.you(RUN);
  return [0, 1].find(k => squadOf(m.t[k]).some(p => p.id === you.id)) ?? null;
}
/** Open match prep: the intro (only = undefined), one side's timeout huddle (only = side), or the Plan board alone (board). */
function prepOpen(only, board) {
  if (!A || !A.m) return;
  const m = A.m,
    sides = prepSides(m);
  if (only != null && !sides.includes(only)) return;
  // who decides each side: you or the coach (Monster: the right team's coach by default, hidden)
  A.prepS = A.prepS || { who: [0, 1].map(i => (sides.includes(i) && (i === 0 || A.fx.onFinish) ? 'you' : 'ai')) };
  A.prepS.only = only ?? null;
  A.prepS.board = !!board; // Tab mid-match (spec §2.29): the board only; the team plan waits for a timeout
  A.prepS.plan = [0, 1].map(i => ({ ...planOf(m, i) }));
  A.prep = true;
  let el = $('#prep');
  if (!el) {
    $('#stage').insertAdjacentHTML('beforeend', '<div class="over prepo" id="prep" role="dialog" aria-label="Match prep"></div>');
    el = $('#prep');
  }
  el.hidden = false;
  prepDraw();
}
/** One plan row: a segment of the plans with the chosen one's effect → cost under it. */
function prepRow(i, kind) {
  const P = PLANS[kind],
    cur = A.prepS.plan[i][kind],
    c = P[cur];
  return `<div class="pplan"><span class="lab">${kind === 'atk' ? 'Attack' : 'Defence'}</span><div class="seg">${Object.entries(P)
    .map(
      ([k, v]) =>
        `<button class="btn ${k === cur ? 'on' : ''}" onclick="prepPick(${i},'${kind}','${k}')" ${tip(v.desc)}>${esc(v.short)}</button>`
    )
    .join('')}</div><p class="pdesc"><b>${esc(c.name)}</b> · ${esc(c.desc)} <span class="mute">${esc(c.cost)}</span></p></div>`;
}
/** One team's column. */
function prepTeam(i) {
  const m = A.m,
    t = m.t[i],
    S = A.prepS,
    sides = prepSides(m),
    mine = prepMine(m),
    ovrAvg = Math.round(t.P.reduce((s, p) => s + ovr(p), 0) / t.P.length),
    lineup = rotOrder(t, m.rot[i])
      .map(
        (p, k) =>
          `<span class="pl ${k === 1 || k === 2 ? 'fr' : ''}">${stag(p)}#${p.num} ${p.role}${p.cap ? ' <span class="capb">C</span>' : ''}</span>`
      )
      .join(''),
    you = sides.includes(i) && !S.board,
    plan = S.board
      ? `<p class="small">Plan: <b>${S.who[i] === 'you' || i === mine || m.over ? `${esc(PLANS.atk[planOf(m, i).atk].short)} · ${esc(PLANS.def[planOf(m, i).def].short)}` : 'hidden'}</b> <span class="mute">— a timeout changes it</span></p>`
      : you
        ? `${A.fx.onFinish ? '' : `<div class="seg who">${['you', 'ai'].map(w => `<button class="btn ${S.who[i] === w ? 'on' : ''}" onclick="prepWho(${i},'${w}')">${w === 'you' ? 'You decide' : 'Coach decides'}</button>`).join('')}</div>`}${
            S.who[i] === 'you'
              ? prepRow(i, 'atk') + prepRow(i, 'def')
              : '<p class="small mute">The coach picks — hidden until the match is over.</p>'
          }`
        : i === mine
          ? `<p class="small">Coach's plan: <b>${esc(PLANS.atk[planOf(m, i).atk].name)}</b> · <b>${esc(PLANS.def[planOf(m, i).def].name)}</b></p><p class="small mute">The captain sets the plan.</p>`
          : '<p class="small mute">Their plan: hidden.</p>';
  return `<section class="pteam" style="--tc:${t.color}"><h3>${chip(t)}${esc(t.name)}</h3><p class="small mute">OVR ${ovrAvg} · ${esc((t.S && t.S.name) || '')}</p><div class="lineup">${lineup}</div>${plan}</section>`;
}
function prepDraw() {
  const el = $('#prep'),
    S = A.prepS;
  if (!el || !S) return;
  const only = S.only,
    cols = only != null ? [only] : S.board ? [0, 1].filter(i => boardEdit(A.m, i)) : [0, 1],
    title =
      only != null
        ? `Timeout · ${esc(A.m.t[only].short)} ${A.m.pts[only]}–${A.m.pts[1 - only]}`
        : S.board
          ? `Plan board · ${A.m.pts[0]}–${A.m.pts[1]} <span class="mute">— orders play from the next rally</span>`
          : esc(A.fx.round || 'Match prep');
  el.innerHTML = `<div class="ocard prep ${cols.length === 1 ? 'one' : ''} ${cols.some(i => boardEdit(A.m, i)) ? 'wide' : ''}"><div class="lab">${title}</div>
    <div class="pcols">${cols.map(prepTeam).join(cols.length === 2 ? '<div class="pvs">vs</div>' : '')}</div>${cols.map(boardSide).join('')}
    <div class="acts"><button class="btn hot" onclick="prepStart()">${only != null || S.board ? 'Back to the match' : 'Start match'} <kbd>${S.board ? 'Tab' : 'Enter'}</kbd></button></div></div>`;
}
function prepPick(i, kind, id) {
  if (!A || !A.prepS || !PLANS[kind][id]) return;
  A.prepS.plan[i][kind] = id;
  prepDraw();
}
function prepWho(i, w) {
  if (!A || !A.prepS) return;
  A.prepS.who[i] = w;
  prepDraw();
}
/** Start (or resume): your plans go in; a side left to the coach keeps the coach's own. */
function prepStart() {
  if (!A || !A.prep) return;
  const m = A.m,
    S = A.prepS;
  for (const i of S.board ? [] : prepSides(m)) {
    if (S.only != null && i !== S.only) continue;
    if (S.who[i] === 'you') planSet(m, i, S.plan[i], 'you');
    else if (m.planBy) m.planBy[i] = 'ai';
  }
  A.prep = false;
  const el = $('#prep');
  if (el) el.hidden = true;
  if (A.railTab === 'coach') coachPanel();
}
