// Career: the People sheet — everyone who matters to you, and what you know of them (want and trait once found out,
// their stance, their season in a rumour, the three memories that weigh most in your diary voice). Display only: the logic
// is Rel / People. Opened from the top bar's People tab, and from names in the Rankings and the faction dossier (openPerson).

const STANCE_NAME = { ally: 'ally', respect: 'respect', neutral: 'neutral', resent: 'resent', enemy: 'enemy' };
/** True when you know this person's rating: you, your squad, or someone you faced on court (as the Register does). */
function personMet(run, p) {
  return p.id === run.youId || !!run.met[p.id] || squadOf(Run.myTeam(run)).includes(p);
}
/** The moves you can make on them: a button each, with how likely they are to say yes as a word (never the number). */
function moves(run, id) {
  const mv = Asks.moves(run, id);
  return mv.length
    ? `<div class="pmoves">${mv.map(m => `<button class="btn" onclick="askMove('${esc(String(id))}','${m.kind}','${m.at || ''}')" ${m.word ? tip('They are ' + m.word + ' to say yes') : ''}>${esc(m.label)}${m.word ? ` <i class="mute small">${m.word}</i>` : ''}</button>`).join('')}</div>`
    : '';
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
/** The squad's chemistry for the People sheet (Squad): cliques, feuds (A ✕ B) and where you stand. Display only (Rel.chem). */
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
    ${mem.length ? `<ul class="pmem">${mem.map(m => `<li><b>W${m.w}</b> ${esc(m.text)}</li>`).join('')}</ul>` : '<p class="mute">Nothing between you yet.</p>'}
  </div>`;
}
/** Open the People sheet on this person. */
function openPerson(id) {
  CW.dossier = null;
  CW.person = id;
  CW.sheet = 'people';
  renderCareer();
}
/** The People sheet (spec §10.4, SheetPeople): filters, the list on the left, the selected person on the right. */
const PEOPLE_FILTERS = { all: 'Everyone', squad: 'Squad', rivals: 'Rivals', waiting: 'Waiting' };
function sheetPeople(run) {
  const f = PEOPLE_FILTERS[CW.pfilter] ? CW.pfilter : 'all',
    mates = Run.mates(run),
    onBench = m => !!(m.team.bench && m.team.bench.includes(m)),
    waits = Asks.list(run),
    waitIds = new Set(waits.map(a => String(a.id))),
    mateIds = new Set(mates.map(m => m.id)),
    others = People.all(run)
      .filter(p => !mateIds.has(p.id) && (Rel.list(run, p.id).length || run.met[p.id] || String(p.id) === CW.person))
      .sort((a, b) => Rel.list(run, b.id).length - Rel.list(run, a.id).length || ovr(b) - ovr(a))
      .slice(0, 40),
    gone = Object.keys(run.people || {})
      .filter(id => run.people[id].gone && Rel.list(run, id).length)
      .map(id => People.find(run, id))
      .filter(Boolean),
    rival = p => Rel.rival(run, String(p.id)) || ['resent', 'enemy'].includes(Rel.tag(run, String(p.id))),
    waiting = waits.map(a => People.find(run, a.id)).filter(Boolean),
    groups =
      f === 'squad'
        ? [
            ['Squad', mates.filter(m => !onBench(m))],
            ['Bench', mates.filter(onBench)]
          ]
        : f === 'rivals'
          ? [['Rivals', [...mates, ...others].filter(rival)]]
          : f === 'waiting'
            ? [['Waiting', waiting]]
            : [
                ['Waiting', waiting],
                ['Squad', mates.filter(m => !onBench(m) && !waitIds.has(String(m.id)))],
                ['Bench', mates.filter(m => onBench(m) && !waitIds.has(String(m.id)))],
                ['Others', others.filter(p => !waitIds.has(String(p.id)))],
                ['Gone', gone]
              ],
    first = groups.flatMap(([, ps]) => ps)[0],
    sel = CW.person || (first ? String(first.id) : null),
    row = p => {
      const id = String(p.id),
        tag = Rel.tag(run, id),
        b = mateIds.has(p.id) ? Run.you(run).bond[p.id] || 0 : 0;
      return `<button class="plist ${id === sel ? 'on' : ''}" onclick="CW.person='${esc(id)}';renderCareer()">${p.gone ? '' : faceSVG(p, 0, 28)}<span class="nm"><b>${stag(p)}${esc(p.name)}</b><small class="mute">${p.role}${
        p.gone ? ` · ${esc(People.fateText(run.people[id]))}` : ` · ${personMet(run, p) ? 'OVR ' + ovr(p) : 'unrated'}`
      }</small></span>${mateIds.has(p.id) ? `<i class="bbar sm ${b >= 80 ? 'f' : b >= 60 ? 'c' : ''}" ${tip('Bond ' + b)}><i style="width:${b}%"></i></i>` : '<span></span>'}${tag === 'neutral' ? '' : `<span class="stc ${tag}">${STANCE_NAME[tag]}</span>`}${waitIds.has(id) ? '<em class="badge">!</em>' : ''}</button>`;
    },
    list = groups
      .filter(([, ps]) => ps.length)
      .map(([g, ps]) => `<div class="lab">${g}</div>${ps.map(row).join('')}`)
      .join('');
  return `<div class="sheet-h"><h2>People</h2><div class="seg pfil">${Object.entries(PEOPLE_FILTERS)
    .map(
      ([k, n]) =>
        `<button class="btn ${k === f ? 'on' : ''}" onclick="CW.pfilter='${k}';CW.person=null;renderCareer()">${n}${k === 'waiting' && waits.length ? ` ${waits.length}` : ''}</button>`
    )
    .join('')}</div></div>
    <div class="sheet-cols ppl"><section class="card plist-col">${list || '<p class="small mute">Nobody yet — play, train, fight.</p>'}${
      f === 'squad'
        ? `<div class="lab">Chemistry</div>${chemBlock(run)}${
            World.isFree(run) && run.academy !== false
              ? `<p class="small" id="leaveac"><button class="btn quiet danger" onclick="leaveSquad()" ${tip('The Academy will not invite you again')}>Leave squad</button></p>`
              : ''
          }`
        : ''
    }</section>
    <section class="card pdetail">${sel ? personDetail(run, sel, waits) : '<p class="small mute">Pick someone.</p>'}</section></div>`;
}
/** The selected person: header, what you know, their ask (Accept / Decline as one row) and your moves. */
function personDetail(run, id, waits) {
  const p = People.find(run, id);
  if (!p) return '';
  const ask = waits.find(a => String(a.id) === String(id)),
    A2 = ask && APPROACH[ask.kind],
    tag = Rel.tag(run, id);
  return `<div class="pdh">${p.gone ? '' : faceSVG(p, 0, 48)}<div><h3>${stag(p)}${esc(p.name)}</h3><div class="small mute">${p.role} · ${personMet(run, p) ? 'OVR ' + ovr(p) : 'unrated'}${
    tag === 'neutral' ? '' : ` · <span class="stc ${tag}">${STANCE_NAME[tag]}</span>`
  }${Rel.rival(run, id) ? ' <span class="stc rival">rival</span>' : ''}</div></div></div>
    ${personCard(run, id)}
    ${
      ask
        ? `<div class="pask"><div class="lab">Their ask · until the end of the week</div><p>“${esc(Asks.line(run, ask))}”</p><div class="acts ${ask.kind === 'warn' ? '' : 'two'}"><button class="btn hot" onclick="askAnswer(${ask.i},true)">${esc(A2.a)}</button>${
            ask.kind === 'warn' ? '' : `<button class="btn" onclick="askAnswer(${ask.i},false)">${esc(A2.b)}</button>`
          }</div></div>`
        : ''
    }
    ${moves(run, id) ? `<div class="lab">Your moves</div>${moves(run, id)}` : ''}`;
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
  CW.flash = `Can't now: ${why}.`; // shown in the inbox for one render
  Run.log(RUN, `Can't now: ${why}.`);
  renderCareer();
}
