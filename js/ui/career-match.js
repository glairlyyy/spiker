// Career match cards: match prep rows, the evaluation and Cup cards, the result data the match screen reads, and
// playCareer (play or sim a career fixture).

/** Pre-match rows (spec §10.5 Match prep): the coach's lineup sentence, your focus as a "Pick one" segment and, for a captain
 * in a Cup match, the team talk the same way. */
function matchPrep(run, cup) {
  const you = Run.you(run),
    side = Cup.mine(run, cup ? 'cup' : 'eval'),
    L = Run.lineup(run, side.T, side.region, true, cup && run.mode.story),
    row = (lab, body, note = '') =>
      `<div class="mprow"><span class="lab">${lab}</span><div>${body}</div>${note ? `<span class="small mute">${note}</span>` : '<span></span>'}</div>`,
    seg = (opts, cur, fn) =>
      `<div class="seg">${opts.map(([id, label, t]) => `<button class="btn ${cur === id ? 'on' : ''}" onclick="${fn}('${id}')" ${t ? tip(t) : ''}>${esc(label)}</button>`).join('')}</div>`;
  return `<div class="mprep">${row(
    'Lineup',
    L.starts
      ? '<b class="good">Starting</b>'
      : `<b class="warn">On the bench</b>${L.rival ? ` — ${esc(L.rival.p.name)} rates higher (${L.rival.score.toFixed(0)} vs ${L.you.toFixed(0)})` : ''}`,
    `${info(`Your coach picks the best player of each role by rating + 6 × form (+ your standing with the faction ÷ ${BENCH.standingPer}). Start or finish on the bench and match rewards ×${BENCH.partMul}; never play and you only get a little Wit XP.`)}`
  )}${row('Focus', seg(FOCUS[you.role], run.focus, 'setFocus'), `Pick one · hit it ${term('sp', FOCUS_REWARD.sp)} ${term('fans', FOCUS_REWARD.fans)}`)}${prepTechRow(you, row)}${
    cup && you.cap
      ? row(
          'Team talk',
          seg(
            Object.entries(TALKS).map(([id, t]) => [id, t.name, t.desc]),
            run.talk,
            'setTalk'
          ),
          'Pick one · you are captain'
        )
      : ''
  }</div>`;
}
/** Match prep's Techniques row (spec §9.10): `n on · m off ›`, a peek with the switches and Reset. '' when you own none. */
function prepTechRow(you, row) {
  const ids = ownTechs(you),
    off = new Set((you.techOff || []).filter(id => ids.includes(id)));
  if (!ids.length) return '';
  const body = `<div class="lab">Techniques</div>${ids.map(id => techRow(id, { off: off.has(id), act: `prepTech('${id}')` })).join('')}${
    off.size ? `<div class="acts"><button class="btn" onclick="prepTech(null)">Reset</button></div>` : ''
  }`;
  return row(
    'Techniques',
    peek('tech', `${ids.length - off.size} on${off.size ? ` · <b class="warn">${off.size} off</b>` : ''}`, body),
    off.size ? 'Kept for every match' : ''
  );
}
/** Flip one of your techniques for the next matches (null = all back on). */
function prepTech(id) {
  const you = Run.you(RUN),
    off = new Set(you.techOff || []);
  if (id == null) off.clear();
  else if (off.has(id)) off.delete(id);
  else off.add(id);
  you.techOff = [...off];
  Run.save(RUN);
  renderCareer();
}
/** kv rows "Their best": up to 2 of a squad's players, each "<name> — Register #n, Gazette #n" on its own line (skips null ranks). */
function rankBestRows(run, ps) {
  const L = { register: Rank.register(run), gazette: Rank.gazette(run), street: Rank.street(run) },
    at = (k, id) => {
      const i = L[k].findIndex(r => r.id === id);
      return i < 0 ? null : i + 1;
    },
    got = ps
      .map(p => ({ p, r: Object.fromEntries(Object.keys(L).map(k => [k, at(k, p.id)])) }))
      .sort((a, b) => Math.min(...Object.values(b.r).map(v => v || 1e9)) - Math.min(...Object.values(a.r).map(v => v || 1e9)))
      .slice(0, 2);
  return got.map(({ p, r }, i) => [
    i ? '' : 'Their best',
    `${esc(p.name)} <span class="mute">${Object.entries(RANK_TABS)
      .filter(([k]) => r[k])
      .map(([k, [name]]) => `${name} #${r[k]}`)
      .join(', ')}</span>`
  ]);
}
/** Match prep notes (spec §10.1a): venue, opponent, their best, scouting — one fact per line. */
function prepNotes(run, opp, best, hint) {
  const v = City.venue(run);
  return `<div class="mnotes">${kv([v ? ['Venue', esc(VENUES[v].name)] : null, ['Opponent', opp], ...best, hint ? ['Scouting', hint, 'mute'] : null])}</div>`;
}
/** Two roster columns for a cup match: the 4 starters on each side (you highlighted; their OVR once you have met them). */
function matchRosters(run, mine, theirs) {
  const meId = Run.you(run).id,
    col = (T, all) =>
      `<div><div class="lab">${chip(T)}${esc(T.name)}</div>${squadOf(T)
        .slice(0, 4)
        .map(
          p =>
            `<div class="rp ${p.id === meId ? 'you' : ''}"><span>${stag(p)}${esc(p.name)} <i class="mute">${p.role}</i></span><b>${all || personMet(run, p) ? ovr(p) : '?'}</b></div>`
        )
        .join('')}</div>`;
  return `<div class="rosters">${col(mine, true)}${col(theirs, false)}</div>`;
}
/** The evaluation week's card: play (or Sim) your evaluation match, or watch from the bench when not selected. */
function evalPanel(run, note = '') {
  const e = run.eval || Eval.setup(run),
    label = e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name,
    D = Dossier.build(run, e.region),
    all = Pool.players(run, e.region).concat([Run.you(run)]),
    club = Run.myTeam(run),
    byId = ids => ids.map(id => all.find(p => p.id === id)).filter(Boolean),
    meId = Run.you(run).id,
    col = (ps, showOvr) =>
      ps
        .map(
          p =>
            `<div class="rp ${p.id === meId ? 'you' : ''}"><span>${stag(p)}${esc(p.name)} <i class="mute">${p.role}</i></span><b>${showOvr ? ovr(p) : '?'}</b></div>`
        )
        .join(''),
    venue = City.venue(run),
    head = `<div class="mph"><span class="lab">Week ${run.week} · Match day</span><h3 class="mpt">${esc(label)} evaluation${info(`Teammates who played with you remember the win. Per kill, block or ace: +${REWARDS.perPlay.sp} skill pts +${REWARDS.perPlay.fans} fans. × Grade.`)}</h3>${
      e.kind === 'faction' && !e.mine && venue ? `<span class="small mute">at ${esc(VENUES[venue].name)}</span>` : ''
    }</div>`;
  if (e.kind === 'faction' && !e.mine)
    return `<div class="panel">${head}<p>Not selected this month.</p>
    ${note}<div class="acts"><button class="btn hot" onclick="benchEval()">Watch from the bench</button></div></div>`;
  const mine = e.kind === 'academy' ? club.P : byId(e.mine).slice(0, 4); // the 4 who start
  return `<div class="panel">${head}
    <div class="rosters"><div><div class="lab">${e.kind === 'academy' ? esc(club.name) : esc(club.name) + ' squad'}</div>${col(mine, true)}</div><div><div class="lab">${esc(REGIONS[e.region].name)} squad</div>${col(byId(e.opp).slice(0, 4), D.scouted || D.member)}</div></div>
    ${matchPrep(run, false)}
    <div class="rwchips"><span class="pchip"><span class="wl">Win</span> ${term('sp', REWARDS.evalWin.sp)} ${term('fans', REWARDS.evalWin.fans)}</span><span class="pchip"><span class="wl">Loss</span> ${term('sp', REWARDS.evalLoss.sp)} ${term('fans', REWARDS.evalLoss.fans)}</span></div>
    ${prepNotes(run, `${esc(REGIONS[e.region].name)} squad`, rankBestRows(run, byId(e.opp).slice(0, 4)), D.scouted || D.member ? '' : 'Scout one of their clubs to see ratings')}
    ${note}<div class="acts pri"><button class="btn hot" onclick="playCareer('eval')">Play evaluation</button><button class="btn" onclick="playCareer('eval', true)" ${tip(GLOSSARY.sim.long)}>Sim ⏭</button></div></div>`;
}
/** Not selected: watch from the bench (wit XP) and end the week. */
function benchEval() {
  Run.log(RUN, Eval.bench(RUN));
  endWeekUI();
}
/** The cup bracket; nm = your next match (from Cup.upcoming, prepared before rendering). */
function cupPanel(run, nm) {
  const S = run.cup.sched,
    E = run.cup.entrants,
    me = run.cup.me,
    def = Run.cupDef(run);
  const slot = x => {
    if (x.bye) return `<div class="bm empty"><div class="br">—</div><div class="br">—</div></div>`;
    const row = ti =>
      ti == null
        ? `<div class="br empty"><span class="mute">bye</span></div>`
        : `<div class="br ${x.w === ti ? 'won' : x.w !== null ? 'lost' : ''} ${ti === me ? 'mine' : ''}">${chip(E[ti])}<span>${esc(E[ti].name)}</span><b>${x.res ? x.res[ti === x.a ? 0 : 1] : ''}</b></div>`;
    return `<div class="bm ${x === nm ? 'next' : ''}">${row(x.a)}${row(x.b)}</div>`;
  };
  const rounds = [nm.round], // the round you play next (spec §10.5: the bracket stays compact on the prep card)
    P = PLACES,
    fans = k => Math.round(P[k].fans * def.mul).toLocaleString();
  return `<div class="bracket cbr"><h3 class="bt3">${def.name}${def.seeded ? ' <span class="small mute">seeded</span>' : ''}</h3>
      ${rounds
        .map(
          r =>
            `<div class="bcol"><h4>${r === 'Quarterfinal' ? 'Quarterfinals' : r === 'Semifinal' ? 'Semifinals' : r}</h4>${S.filter(
              x => x.round === r
            )
              .map(slot)
              .join('')}</div>`
        )
        .join('')}</div>
    <div class="panel"><div class="mph"><span class="lab">Week ${run.week} · Match day</span><h3 class="mpt">${nm.round}${info(`Win: +${Math.round(REWARDS.cupWin.sp * def.mul)} skill pts, +${Math.round(REWARDS.cupWin.fans * def.mul).toLocaleString()} fans. A loss ends the season.\nPlacement: round of 16 +${fans('Round of 16')} fans · quarterfinal +${fans('Quarterfinal')} · semifinal +${fans('Semifinal')} · runner-up +${fans('Final')} · champion +${fans('Champion')} — and a place on the national team.
× Grade.`)}</h3></div>
      ${matchRosters(run, Cup.team(run, me), Cup.team(run, nm.a === me ? nm.b : nm.a))}
      ${matchPrep(run, true)}
      <div class="rwchips"><span class="pchip"><span class="wl">Win</span> ${term('sp', Math.round(REWARDS.cupWin.sp * def.mul))} ${term('fans', Math.round(REWARDS.cupWin.fans * def.mul))}</span><span class="pchip bad">Loss ends the season</span></div>
      ${prepNotes(run, esc(E[nm.a === me ? nm.b : nm.a].name), rankBestRows(run, squadOf(Cup.team(run, nm.a === me ? nm.b : nm.a))))}
    <div class="acts pri"><button class="btn hot" onclick="playCareer('cup')">Play ${nm.round.toLowerCase()}</button><button class="btn" onclick="playCareer('cup', true)" ${tip(GLOSSARY.sim.long)}>Sim ⏭</button></div></div>`;
}
function setFocus(id) {
  RUN.focus = RUN.focus === id ? null : id;
  Run.save(RUN);
  renderCareer();
}
function setTalk(id) {
  RUN.talk = RUN.talk === id ? null : id;
  Run.save(RUN);
  renderCareer();
}
/** Match result data (spec §10.6). The match screen calls `resultSnap` before a career fixture's onFinish and
 * `resultData` after it: what changed for you, read from the run (no rule runs here). null = you are not in this match. */
function resultSnap(run, m) {
  const you = Run.you(run);
  if (!you || !m.t.some(t => squadOf(t).includes(you))) return null;
  const s = m.stat[you.id] || blank(),
    f = run.focus && (FOCUS[you.role] || []).find(x => x[0] === run.focus);
  return {
    stats: Object.fromEntries([...STATK, 'wit'].map(k => [k, you[k]])),
    xp: { ...(run.xp || {}) },
    sp: run.sp,
    fans: run.fans,
    money: run.money,
    mood: run.mood,
    skills: [...you.skills],
    focus: f ? { label: f[1], met: Cup.focusMet(run, s) } : null,
    mlog: (run.mlog || []).length,
    side: squadOf(m.t[0]).includes(you) ? 0 : 1
  };
}
function resultData(run, m, b, msg) {
  const you = Run.you(run),
    s = m.stat[you.id] || blank(),
    e = (run.mlog || []).length > b.mlog || (run.mlog || []).length === MLOG.max ? run.mlog[run.mlog.length - 1] : null,
    d = (k, name, o = { loc: true }) => {
      const v = run[k] - b[k];
      return v ? { v, text: `${fmtDelta(v, o)} ${name}` } : null;
    };
  return {
    win: m.winner === b.side,
    played: m.played.has(you.id),
    grade: e && e.played ? e.grade : null,
    line: { k: s.k, blk: s.blk, ace: s.ace, err: s.err },
    focus: b.focus,
    rewards: [
      d('sp', 'skill pts'),
      d('fans', 'fans'),
      d('money', '', { pre: '$' }),
      run.mood !== b.mood ? { v: run.mood - b.mood, text: `mood ${run.mood > b.mood ? 'up' : 'down'}` } : null
    ].filter(Boolean),
    growth: [...STATK, 'wit']
      .filter(k => you[k] !== b.stats[k] || ((run.xp || {})[k] || 0) !== (b.xp[k] || 0))
      .map(k => ({ k, name: STATNAME[k], from: b.stats[k], to: you[k], ...Training.progress(run, k) })),
    techs: you.skills.filter(id => !b.skills.includes(id)).map(id => SKILLS[id].name),
    held: [...(m.off[you.id] || [])].filter(id => knowsTech(you, id)).map(id => SKILLS[id].name), // switched off at the end (§9.10)
    msg
  };
}
/** Watch a career fixture (from js/career) on the match screen; leaving runs its own clean-up, then back to the hub. */
function watchCareer(fx) {
  const done = fx.onLeave;
  navigate('match', {
    ...fx,
    onLeave: () => {
      if (done) done();
      navigate('career');
    }
  });
}
/** Play a career match on the match screen, or (sim) resolve it at once without watching. */
function playCareer(kind, sim) {
  const fx = Cup.fixture(RUN, kind);
  if (!sim) return watchCareer(fx);
  Cup.simNow(fx);
  renderCareer();
}
