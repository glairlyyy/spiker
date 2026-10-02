// Career: the People drawer — everyone who matters to you, and what you know of them (want and trait once found out,
// their stance, their season in a rumour, the three memories that weigh most in your diary voice). Display only: the logic
// is Rel / People. Opened from the hub dock, and from names in the Rankings and the faction dossier (openPerson).

const STANCE_NAME = { ally: 'ally', respect: 'respect', neutral: 'neutral', resent: 'resent', enemy: 'enemy' };
/** True when you know this person's rating: you, your squad, or someone you faced on court (as the Register does). */
function personMet(run, p) {
  return p.id === run.youId || !!run.met[p.id] || squadOf(Run.myTeam(run)).includes(p);
}
/** A row: face, name, role, OVR, stance tag, rival chip; a click opens or closes their card. */
function personRow(run, p) {
  if (p.gone) return goneRow(run, p);
  const id = String(p.id),
    open = CW.person === id,
    tag = Rel.tag(run, id),
    out = People.out(run, p);
  return `<div class="prow ${open ? 'open' : ''}"><div class="phd" onclick="openPerson('${esc(id)}')" role="button" tabindex="0">${faceSVG(p, 0, 28)}<span class="pn"><b>${stag(p)}${esc(p.name)}</b> <i class="mute small">${p.role} · ${personMet(run, p) ? 'OVR ' + ovr(p) : 'unrated'}${out ? ' · injured' : ''}</i></span>${tag === 'neutral' ? '' : `<span class="stc ${tag}">${STANCE_NAME[tag]}</span>`}${Rel.rival(run, id) ? '<span class="stc rival">rival</span>' : ''}</div>${open ? personCard(run, id) : ''}</div>`;
}
/** The moves you can make on them: a button each, with how likely they are to say yes as a word (never the number). */
function moves(run, id) {
  const mv = Asks.moves(run, id);
  return mv.length
    ? `<div class="pmoves">${mv.map(m => `<button class="btn" onclick="askMove('${esc(String(id))}','${m.kind}','${m.at || ''}')" ${m.word ? tip('They are ' + m.word + ' to say yes') : ''}>${esc(m.label)}${m.word ? ` <i class="mute small">${m.word}</i>` : ''}</button>`).join('')}</div>`
    : '';
}
/** The approaches waiting this week: their line, your two answers, "until the end of the week". */
function waitingCard(run) {
  const L = Asks.list(run);
  return L.length
    ? `<div class="panel waiting"><h3>Waiting${info('They asked this week. Each approach expires at the end of the week; unanswered, it counts as ignored.')}</h3>${L.map(
        a => {
          const p = People.find(run, a.id),
            A = APPROACH[a.kind];
          return p
            ? `<div class="ask">${faceSVG(p, 0, 28)}<div><b>${stag(p)}${esc(p.name)}</b> <i class="mute small">${p.role}</i><div class="small">“${esc(Asks.line(run, a))}”</div>
            <div class="amoves"><button class="btn hot" onclick="askAnswer(${a.i},true)">${esc(A.a)}</button>${a.kind === 'warn' ? '' : `<button class="btn" onclick="askAnswer(${a.i},false)">${esc(A.b)}</button>`}<small class="mute">until the end of the week</small></div></div></div>`
            : '';
        }
      ).join('')}</div>`
    : '';
}
/** Someone who has left play: a row from their snapshot ("left the island, W19"); Rel still has their memories. */
function goneRow(run, p) {
  const id = String(p.id),
    tag = Rel.tag(run, id),
    open = CW.person === id;
  return `<div class="prow gone ${open ? 'open' : ''}"><div class="phd" onclick="openPerson('${esc(id)}')" role="button" tabindex="0"><span class="pn"><b>${esc(p.name)}</b> <i class="mute small">${p.role} · ${esc(People.fateText(run.people[id]))}</i></span><span class="stc ${tag}">${STANCE_NAME[tag]}</span></div>${open ? personCard(run, id) : ''}</div>`;
}
/** "with X / against Y": who they stand with and against among the people you have met (their strongest NPC ↔ NPC stances). */
function sidesLine(run, id) {
  const S = Rel.sides(run, id),
    names = ids =>
      ids
        .map(x => People.find(run, x))
        .filter(q => q && personMet(run, q))
        .slice(0, 2)
        .map(q => esc(q.name.split(' ')[0]))
        .join(', '),
    w = names(S.with),
    a = names(S.against);
  return w || a ? `<div class="mute">${w ? `With ${w}` : ''}${w && a ? ' · ' : ''}${a ? `Against ${a}` : ''}</div>` : '';
}
/** The squad's chemistry for the Team drawer: cliques, feuds (A ✕ B) and where you stand. Display only (Rel.chem). */
function chemBlock(run) {
  const T = Run.myTeam(run),
    c = Rel.chem(run, T),
    me = run.youId,
    nm = id =>
      id === me
        ? 'You'
        : esc(
            squadOf(T)
              .find(p => p.id === id)
              .name.split(' ')[0]
          ),
    mine = c.cliques.find(k => k.includes(me)),
    foes = [...c.foe[me]];
  if (!c.cliques.length && !c.feuds.length) return '<p class="small mute chem">No cliques, no feuds yet.</p>';
  return `<div class="chem small">${c.cliques.map(k => `<div><span class="stc ally">clique</span> ${k.map(nm).join(', ')}</div>`).join('')}${c.feuds
    .map(f => `<div><span class="stc enemy">feud</span> ${nm(f[0])} ✕ ${nm(f[1])}</div>`)
    .join(
      ''
    )}<div class="mute">${mine ? 'You are in a clique.' : 'You are outside the cliques.'}${foes.length ? ` Feuding with ${foes.map(nm).join(', ')}.` : ''}</div></div>`;
}
/** One person's card: want / traits ("?" until known), their season, their team and the 3 memories that weigh most. */
function personCard(run, id) {
  const p = People.find(run, id),
    me = run.people && run.people[id];
  if (!p || !me) return '';
  const want = People.knows(run, p, 'want') ? `<b ${tip(WANTS[me.want].desc)}>${esc(WANTS[me.want].name)}</b>` : '<b class="mute">?</b>',
    traits = me.traits
      .map((t, i) => (People.knows(run, p, 'trait', i) ? `<b ${tip(TRAITS[t].desc)}>${esc(TRAITS[t].name)}</b>` : '<b class="mute">?</b>'))
      .join(' · '),
    mem = Rel.top(run, id, 3),
    t = p.team;
  return `<div class="pcard small">
    <div>Wants ${want} · Traits ${traits}</div>
    <div class="mute">${p.gone ? esc(`${p.gone.team} · ${People.fateText(me)}`) : `${esc(t ? t.name : 'No club')}${me.status !== 'active' ? ` · ${esc(People.fateText(me))}` : ''}${me.inj > 0 ? ` · injured ${me.inj} more week${me.inj > 1 ? 's' : ''}` : ''}`}</div>
    ${p.gone ? '' : `<div class="mute"><i>${esc(Rel.season(run, id))}</i></div>${sidesLine(run, id)}`}
    ${moves(run, id)}
    ${mem.length ? `<ul class="pmem">${mem.map(m => `<li><b>W${m.w}</b> ${esc(m.text)}</li>`).join('')}</ul>` : '<p class="mute">Nothing between you yet.</p>'}
  </div>`;
}
/** The drawer: your squad (mates, then bench), then the others who remember you or whom you have met. */
function peopleCard(run) {
  const mates = Run.mates(run),
    onBench = m => !!(m.team.bench && m.team.bench.includes(m)),
    ids = new Set(mates.map(m => m.id)),
    others = People.all(run)
      .filter(p => !ids.has(p.id) && (Rel.list(run, p.id).length || run.met[p.id] || String(p.id) === CW.person))
      .sort((a, b) => Rel.list(run, b.id).length - Rel.list(run, a.id).length || ovr(b) - ovr(a))
      .slice(0, 40)
      .concat(
        Object.keys(run.people)
          .filter(id => run.people[id].gone && Rel.list(run, id).length)
          .map(id => People.find(run, id))
      ),
    rows = list => list.map(p => personRow(run, p)).join('');
  return `${waitingCard(run)}<div class="panel"><h3>Your squad${info('Everyone remembers what you did with them or to them. Their want and traits show once you have been through enough together (or scouted their club).')}</h3>${
    mates.length
      ? rows(mates.filter(m => !onBench(m))) + (mates.some(onBench) ? `<h4>Bench</h4>${rows(mates.filter(onBench))}` : '')
      : '<p class="small mute">No squad yet.</p>'
  }</div>
  <div class="panel"><h3>Others</h3>${others.length ? rows(others) : '<p class="small mute">Nobody yet — play, train, fight.</p>'}</div>`;
}
/** Open the People drawer on this person's card (a second click closes it). */
function openPerson(id) {
  CW.dossier = null;
  CW.person = CW.drawer === 'people' && CW.person === id ? null : id;
  CW.drawer = 'people';
  renderCareer();
}
/** Answer a waiting approach (a match to start, or a day spent, follows). */
function askAnswer(i, yes) {
  const r = Asks.answer(RUN, i, yes);
  if (!r) return renderCareer();
  if (r.blocked) return toastBlocked(r.blocked);
  if (r.fx) return navigate('match', r.fx);
  if (r.day) City.after(RUN);
  renderCareer();
}
/** Make one of your moves on a person. */
function askMove(id, kind, at) {
  const r = Asks.ask(RUN, id, kind, { at: at || null });
  if (!r) return renderCareer();
  if (r.fx) return navigate('match', r.fx);
  if (r.day) City.after(RUN);
  renderCareer();
}
function toastBlocked(why) {
  CW.toast = null;
  Run.log(RUN, `Can't now: ${why}.`);
  renderCareer();
}
