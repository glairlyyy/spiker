// Career: the People sheet — everyone who matters to you, and what you know of them (want and trait once found out,
// their stance, their season in a rumour, the three memories that weigh most in your diary voice). Display only: the logic
// is Rel / People. Opened from the top bar's People tab, and from names in the Rankings and the faction dossier (openPerson).

const STANCE_NAME = { ally: 'ally', respect: 'respect', neutral: 'neutral', resent: 'resent', enemy: 'enemy' };
/** True when you know this person's rating: you, your squad, or someone you faced on court (as the Register does). */
function personMet(run, p) {
  return p.id === run.youId || !!run.met[p.id] || squadOf(Run.myTeam(run)).includes(p);
}
/** Short verbs for the moves (§10.8); the full sentence is the button's hover. */
const MOVE_VERB = { invite_train: 'Invite to train', ask_sitout: 'Ask to sit out', vouch: 'Ask to vouch', call_out: 'Call out' };
/**
 * The moves you can make on them: a short verb each, how likely they are to say yes as a word (never the number). Several
 * training invites share one `Invite to train ›` whose peek picks the place.
 */
function moves(run, id) {
  const mv = Asks.moves(run, id),
    btn = (m, label) =>
      `<button class="btn" onclick="CW.peek=null;askMove('${esc(String(id))}','${m.kind}','${m.at || ''}')" ${tip(m.label + (m.word ? ` — ${m.word}` : ''))}>${esc(label)}${m.word ? ` <i class="mute small">${m.word}</i>` : ''}</button>`,
    inv = mv.filter(m => m.kind === 'invite_train');
  if (!mv.length) return '';
  return `<div class="pmoves">${inv.length > 1 ? peek(`mv:${id}`, 'Invite to train', `<div class="lab">Train where?</div><div class="pmoves">${inv.map(m => btn(m, SPOTS[m.at].name)).join('')}</div>`) : inv.map(m => btn(m, MOVE_VERB[m.kind])).join('')}${mv
    .filter(m => m.kind !== 'invite_train')
    .map(m => btn(m, MOVE_VERB[m.kind] || m.label))
    .join('')}</div>`;
}
/** "with X / against Y": who they stand with and against among the people you have met (their strongest NPC ↔ NPC stances). */
function sidesLine(run, id) {
  const S = Rel.sides(run, id),
    names = ids =>
      ids
        .map(x => People.find(run, x))
        .filter(q => q && personMet(run, q))
        .slice(0, 2)
        .map(q => esc(firstName(q)))
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
/**
 * One person's card: their behaviour (the first trait, spec §4.35 — named from the first meeting, its bond rule on hover), want and the
 * second trait ("?" until known), talent and gifts once known, their season, their team and the 3 memories that weigh most.
 */
function personCard(run, id) {
  const p = People.find(run, id),
    me = run.people && run.people[id];
  if (!p || !me) return '';
  const kw = People.knows(run, p, 'want'),
    kb = People.knows(run, p, 'trait', 0) || (!p.gone && personMet(run, p)),
    k2 = People.knows(run, p, 'trait', 1),
    B = TRAITS[me.traits[0]],
    N = TRAITS[me.traits[1]],
    want = kw ? `<b ${tip(WANTS[me.want].desc)}>${esc(WANTS[me.want].name)}</b>` : '<b class="mute">?</b>',
    nuance = k2 ? `<b ${tip(N.desc)}>${esc(N.name)}</b>` : '<b class="mute">?</b>',
    G = !p.gone && Gifts.known(run, p) ? Gifts.of(p).filter(g => GIFTS[g]) : null,
    gifts = G
      ? `<div>Talent <b>${esc(Gifts.tier(p))}</b> · ${G.length ? G.map(g => `<b ${tip(GIFTS[g].desc)}>${esc(GIFTS[g].name)}</b>`).join(', ') : 'No gifts'}</div>`
      : '', // talent and gifts once known (the Gifts contract, T-320); nothing before Gifts exists
    mem = Rel.top(run, id, 3),
    t = p.team;
  // the behaviour from the first meeting, the want / second trait once known; the rumour of their season is the name's hover (personDetail) — §10.8
  return `<div class="pcard small">
    ${kb ? `<div class="pbeh"><b ${tip(B.rule)}>${esc(B.beh)}</b> · Wants ${want} · Also ${nuance}</div>` : kw ? `<div>Wants ${want}</div>` : ''}
    ${gifts}
    <div class="mute">${p.gone ? esc(`${p.gone.team} · ${People.fateText(run, me)}`) : `${esc(t ? t.name : 'No club')}${me.status !== 'active' ? ` · ${esc(People.fateText(run, me))}` : ''}${me.inj > 0 ? ` · injured ${me.inj}w` : ''}`}</div>
    ${p.gone ? '' : sidesLine(run, id)}
    ${arcStep(run, id)}
    ${mem.length ? `<ul class="pmem">${mem.map(m => `<li><b>${Season.at(run, m.w)}</b> ${esc(m.text)}</li>`).join('')}</ul>` : ''}
  </div>`;
}
/** Open the People sheet on this person. */
function openPerson(id) {
  CW.dossier = null;
  CW.person = id;
  CW.sheet = 'people';
  renderCareer();
}
/**
 * The People sheet (spec §10.4 / §10.9, SheetPeople): one list on the left (waiting → favourites → squad → bench →
 * others → gone, each person once) with small markers after the name, the selected person on the right, and
 * `Chemistry ›` (squad cliques / feuds, Leave squad) in the header when you have a squad.
 */
function sheetPeople(run) {
  const mates = Run.mates(run),
    T = Run.myTeam(run),
    onBench = m => !!(m.team.bench && m.team.bench.includes(m)),
    waits = Asks.list(run),
    arcWait = Team.open(run).map(A => People.find(run, A.id)), // an arc's beat waits like an ask (spec §4.36 3)
    waitIds = new Set(waits.map(a => String(a.id)).concat(arcWait.filter(Boolean).map(p => String(p.id)))),
    mateIds = new Set(mates.map(m => m.id)),
    favIds = new Set((run.fav || []).map(String)),
    others = People.all(run)
      .filter(p => !mateIds.has(p.id) && (Rel.list(run, p.id).length || run.met[p.id] || String(p.id) === CW.person))
      .sort((a, b) => Rel.list(run, b.id).length - Rel.list(run, a.id).length || ovr(b) - ovr(a))
      .slice(0, 40),
    gone = Object.keys(run.people || {})
      .filter(id => run.people[id].gone && Rel.list(run, id).length)
      .map(id => People.find(run, id))
      .filter(Boolean),
    rival = p => Rel.rival(run, String(p.id)) || ['resent', 'enemy'].includes(Rel.tag(run, String(p.id))),
    seen = new Set(),
    order = [
      ...waits.map(a => People.find(run, a.id)),
      ...arcWait,
      ...[...favIds].map(id => People.find(run, id)),
      ...mates.filter(m => !onBench(m)),
      ...mates.filter(onBench),
      ...others,
      ...gone
    ].filter(p => p && !seen.has(String(p.id)) && seen.add(String(p.id))),
    sel = CW.person || (order[0] ? String(order[0].id) : null),
    mk = (cls, ch, t, style = '') => `<span class="${cls}" ${style} ${tip(t)}>${ch}</span>`,
    marks = p =>
      [
        mateIds.has(p.id)
          ? onBench(p)
            ? mk('mt out', '🛡', 'Bench', `style="--tc:${T.color}"`)
            : mk('mt', '🛡', 'Your squad', `style="--tc:${T.color}"`)
          : '',
        rival(p) ? mk('mr', '⚔', 'Rival') : '',
        favIds.has(String(p.id)) ? mk('mf', '★', 'Favourite') : ''
      ].join(''),
    row = p => {
      const id = String(p.id),
        tag = Rel.tag(run, id),
        m = marks(p),
        b = mateIds.has(p.id) ? Run.you(run).bond[p.id] || 0 : 0;
      return `<button class="plist ${id === sel ? 'on' : ''}" data-flip="p:${esc(id)}" onclick="CW.person='${esc(id)}';renderCareer()">${p.gone ? '<span></span>' : faceSVG(p, 0, 28)}<span class="nm"><span class="n1"><b>${stag(p)}${esc(p.name)}</b>${m ? `<span class="pmk">${m}</span>` : ''}</span><small class="mute">${p.role}${
        p.gone ? ` · ${esc(People.fateText(run, run.people[id]))}` : ` · ${personMet(run, p) ? 'OVR ' + ovr(p) : 'unrated'}`
      }</small></span>${mateIds.has(p.id) ? `<i class="bbar sm ${b >= 80 ? 'f' : b >= 60 ? 'c' : ''}" ${tip('Bond ' + b)}><i style="--w:${b}%"></i></i>` : '<span></span>'}${tag === 'neutral' ? '' : `<span class="stc ${tag}">${STANCE_NAME[tag]}</span>`}${waitIds.has(id) ? '<em class="badge">!</em>' : ''}</button>`;
    },
    chem = mates.length
      ? `<div class="phr">${peek(
          'chem',
          'Chemistry',
          `<div class="lab">Chemistry</div>${chemBlock(run)}${
            World.isFree(run) && run.academy !== false
              ? `<p class="small" id="leaveac"><button class="btn quiet danger" onclick="leaveSquad()" ${tip('The Academy will not invite you again')}>Leave squad</button></p>`
              : ''
          }`
        )}</div>`
      : '';
  return `<div class="sheet-h"><h2>People</h2>${chem}</div>
    <div class="sheet-cols ppl"><section class="card plist-col">${order.map(row).join('') || '<p class="small mute">Nobody yet — play, train, fight.</p>'}</section>
    <section class="card pdetail">${sel ? personDetail(run, sel, waits) : '<p class="small mute">Pick someone.</p>'}</section></div>`;
}
/** Star / unstar a person (display only, spec §10.9): favourites sit just below the waiting rows. */
function toggleFav(id) {
  const f = RUN.fav,
    i = f.indexOf(String(id));
  if (i < 0) f.push(String(id));
  else f.splice(i, 1);
  Run.save(RUN);
  renderCareer();
}
/** The selected person: header, what you know, their ask (Accept / Decline as one row) and your moves. */
function personDetail(run, id, waits) {
  const p = People.find(run, id);
  if (!p) return '';
  const ask = waits.find(a => String(a.id) === String(id)),
    A2 = ask && APPROACH[ask.kind],
    tag = Rel.tag(run, id);
  return `<div class="pdh">${p.gone ? '' : faceSVG(p, 0, 48)}<div><h3 ${p.gone ? '' : `${tip(Rel.season(run, id))} tabindex="0"`}>${stag(p)}${esc(p.name)}</h3><div class="small mute">${p.role} · ${personMet(run, p) ? 'OVR ' + ovr(p) : 'unrated'}${
    tag === 'neutral' ? '' : ` · <span class="stc ${tag}">${STANCE_NAME[tag]}</span>`
  }${Rel.rival(run, id) ? ' <span class="stc rival">rival</span>' : ''}</div></div>${(fav =>
    `<button class="btn quiet pfav ${fav ? 'on' : ''}" onclick="toggleFav('${esc(String(id))}')" aria-pressed="${fav}" aria-label="Favourite" ${tip('Pin to the top')}>${fav ? '★' : '☆'}</button>`)(
    (run.fav || []).map(String).includes(String(id))
  )}</div>
    ${personCard(run, id)}
    ${
      ask
        ? `<div class="pask"><div class="lab" ${tip('Answer by the end of the week')}>Their ask · this week</div><p>“${esc(Asks.line(run, ask))}”</p><div class="acts ${ask.kind === 'warn' ? '' : 'two'}"><button class="btn hot" onclick="askAnswer(${ask.i},true)">${esc(A2.a)}</button>${
            ask.kind === 'warn' ? '' : `<button class="btn" onclick="askAnswer(${ask.i},false)">${esc(A2.b)}</button>`
          }</div></div>`
        : ''
    }
    ${arcAsk(run, id, !ask)}
    ${moves(run, id) ? `<div class="lab">Your moves</div>${moves(run, id)}` : ''}`;
}
/** Their arc this season in one line (spec §4.36 3): its name, the beat (n of 3) and where it stands. '' without one. */
function arcStep(run, id) {
  const A = Team.arc(run, String(id));
  if (!A) return '';
  const D = ARCS[A.w],
    n = D.beats.length,
    st =
      A.st === 'open'
        ? 'waiting for you'
        : A.st === 'wait'
          ? 'your next match beside them'
          : A.st === 'next'
            ? `next: week ${A.at}`
            : A.st === 'done'
              ? 'seen through'
              : 'over';
  return `<div class="parc">Arc <b>${esc(D.name)}</b> · ${Math.min(A.b + 1, n)} of ${n} — ${esc(D.beats[A.b].name)} · <span class="${A.st === 'lost' ? 'mute' : ''}">${st}</span></div>`;
}
/** Their arc's open beat: their line and your two answers (the help one carries its cost). pri: the help is the card's primary. */
function arcAsk(run, id, pri) {
  const A = Team.arc(run, String(id));
  if (!A || A.st !== 'open') return '';
  const B = Team.beat(run, A),
    c = Team.cost(run, A),
    k = esc(String(id));
  return `<div class="pask"><div class="lab" ${tip('Answer by the end of next week')}>Their arc · ${esc(ARCS[A.w].name)} · ${A.b + 1} of ${ARCS[A.w].beats.length}</div><p>“${esc(B.line)}”</p><div class="acts two"><button class="btn ${pri ? 'hot' : ''}" onclick="arcAnswer('${k}',true)">${esc(B.a)}${c ? ` <i class="mute small">${esc(c)}</i>` : ''}</button><button class="btn" onclick="arcAnswer('${k}',false)">${esc(B.b)}</button></div></div>`;
}
/** Answer an arc's beat (a training day with them follows the walk, as an accepted invite does). */
function arcAnswer(id, yes) {
  const A = Team.arc(RUN, id),
    p = People.find(RUN, id),
    at = A && yes && Team.beat(RUN, A).ask === 'day' && p ? Asks.place(RUN, p) : null,
    snap = trainBefore(at),
    r = Team.answer(RUN, id, yes);
  if (!r) return renderCareer();
  if (r.blocked) return toastBlocked(r.blocked);
  Run.save(RUN);
  if (r.day && trainWithFriend(id, r.at, snap, r.dayLine)) return;
  renderCareer();
}
/** Answer a waiting approach (a match to start, or a day spent, follows). */
function askAnswer(i, yes) {
  const a = (RUN.asks || [])[i],
    snap = trainBefore(a && a.kind === 'invite_train' && a.data ? a.data.at : null),
    r = Asks.answer(RUN, i, yes);
  if (!r) return renderCareer();
  if (r.blocked) return toastBlocked(r.blocked);
  if (r.fx) return watchCareer(r.fx);
  if (r.day && trainWithFriend(a.id, a.data.at, snap, r.dayLine)) return;
  renderCareer();
}
/** Make one of your moves on a person. */
function askMove(id, kind, at) {
  const snap = trainBefore(kind === 'invite_train' ? at : null),
    r = Asks.ask(RUN, id, kind, { at: at || null });
  if (!r) return renderCareer();
  if (r.fx) return watchCareer(r.fx);
  if (r.day && trainWithFriend(id, at, snap, r.dayLine)) return;
  renderCareer();
}
/** The training cut-in's "before" for a session at place `at` (null if it isn't a training place). */
const trainBefore = at => (at && SPOTS[at] && SPOTS[at].kit ? trainSnap(RUN, DAY_ORDERS[City.lead(at)].main[0]) : null);
/**
 * Training with a friend (owner, 2026-10-05): the People sheet closes, you walk to the place on the map with the hub locked,
 * they greet you in the dialogue box, then the usual training cut-in. Returns false when there is nothing to show.
 */
function trainWithFriend(id, at, snap, line) {
  const s = SPOTS[at];
  if (!s) return false;
  const p = People.find(RUN, id);
  CW.sheet = null;
  CW.peek = null;
  CW.spot = at;
  Run.save(RUN);
  actLock(snap && s.kit ? trainFx(RUN, s, snap, line || '', City.lead(at)) : null, { person: p, text: FRIEND_HI });
  renderCareer();
  return true;
}
const FRIEND_HI = "Oh, you're here! Let's start.";
function toastBlocked(why) {
  CW.flash = `Can't now: ${why}.`; // shown in the inbox for one render
  Run.log(RUN, `Can't now: ${why}.`);
  renderCareer();
}
