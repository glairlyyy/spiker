// Career panels shown in the hub sheets and cards (career-hub.js): your player, season, teammates, life, clubs,
// Gazette, the event card, evaluation / Cup match cards and the skills shop, plus their handlers.

/** Hub UI state: Hard toggle, selected place, open sheet and its tabs, cards, the Week report baseline. */
let CW = {
  hard: false,
  spot: null,
  flash: null,
  briefWeek: null,
  seizes: null,
  snap: null,
  sheet: null,
  pfilter: 'all',
  wtab: 'factions',
  stab: 'diary',
  gear: false,
  mapList: false,
  dossier: null,
  rank: 'register',
  rankAll: false,
  person: null,
  recap: null,
  own: null,
  ownOf: null,
  endArm: 0,
  hudPrev: null,
  hudOf: null
};

/** The Me sheet (spec §10.4, SheetMe): who you are, stats with caps and progress, element, skills, life. */
function sheetMe(run) {
  const you = Run.you(run),
    team = Run.myTeam(run),
    mood = MOODS[run.mood],
    rank = you.op ? 'OP red star' : you.star ? `★ Star — OP at OVR ${CAREER.op.ovr}` : `Rookie — ★ Star at OVR ${CAREER.star.ovr}`,
    statRow = k => {
      const pr = Training.progress(run, k),
        pct = Math.round((pr.have / Math.max(1, pr.need)) * 100);
      return `<div class="mrow" ${tip(`${pct}% of the way to the next point. Training stops at ${TRAIN_CAP}; matches only above.`)}><span>${STATNAME[k]}</span><span class="mbars"><i class="mb"><i style="width:${Math.min(100, you[k])}%"></i></i><i class="mp"><i style="width:${pct}%"></i></i></span><span class="mv"><b>${you[k]}</b> <span class="mute">/ ${TRAIN_CAP}</span></span></div>`;
    },
    ids = Skills.forRole(you.role),
    aff = ids.filter(id => !you.skills.includes(id) && Skills.canLearn(run, id)).length,
    passive = ids
      .filter(id => !SKILLS[id].tech)
      .map(id => {
        const sk = SKILLS[id],
          own = you.skills.includes(id),
          can = Skills.canLearn(run, id);
        return `<div class="srow rowcta"><span class="nm"><b>${esc(sk.name)}</b><span class="small mute">${esc(sk.desc)}</span></span>${
          own
            ? '<span class="btn on here">Owned</span>'
            : `<button class="btn ${can ? '' : 'lock'}" onclick="learnSkill('${id}')" ${can ? '' : 'disabled'}>${sk.cost}${can ? ' · learn' : ` · need ${Math.max(0, sk.cost - run.sp)}`}</button>`
        }</div>`;
      })
      .join(''),
    techs = ids
      .filter(id => SKILLS[id].tech)
      .map(id => {
        const sk = SKILLS[id],
          own = you.skills.includes(id) || hasTech(you, id),
          req = Object.entries(sk.req || {})
            .map(([k, v]) => `${k === 'wit' ? 'Wit' : STATNAME[k]} ${v}`)
            .join(' · ');
        return `<div class="srow" ${tip(`${sk.desc}\nLearned in matches: by doing it, or by facing a player who has it.`)}><b>${esc(sk.name)}</b>${own ? '<span class="ptag sel">✓ yours</span>' : `<span class="ptag">${esc(req || 'learn in matches')}</span>`}</div>`;
      })
      .join(''),
    next = Math.ceil(run.week / ECON.payEvery) * ECON.payEvery;
  return `<div class="sheet-h"><span class="portrait">${faceSVG(you, mood.form, 56)}</span><div><h2>${stag(you)}${esc(you.name)}</h2><div class="mute">${ROLE_NAME[you.role]} · ${chip(team)}${esc(team.name)} · OVR ${ovr(you)} · ${rank}</div></div>
    <div class="sheet-chips"><span class="pchip">Stamina ${run.sta} / ${run.staMax}</span><span class="pchip">Mood ${mood.name}</span><span class="pchip">Skill pts ${run.sp}</span></div></div>
    <div class="sheet-cols mecols">
      <section class="card"><div class="lab">Stats · thin bar = progress to the next point</div>${STATK.map(statRow).join('')}
        <div class="mrow"><span>Wit</span><span class="mbars"><i class="mb"><i style="width:${you.wit * 50}%"></i></i></span><span class="mv"><b>${you.wit.toFixed(2)}</b></span></div>
        <div class="mrow"><span>Leadership</span><span class="mbars"><i class="mb lead"><i style="width:${you.lead}%"></i></i></span><span class="mv"><b>${you.lead}</b></span></div>
        ${elementLine(run)}
        ${
          run.injury
            ? `<div class="inj"><b>Injured</b> ${run.injury.weeks}w — light training only (×0.4 gains, half stamina) <button class="btn" onclick="seePhysio()" ${run.sp < TRAIN_X.physio ? 'disabled' : ''}>Physio · ${TRAIN_X.physio} pts</button></div>`
            : ''
        }</section>
      <section class="card"><div class="wh"><span class="lab">Skills</span><span class="small mute">${run.sp} pts · ${aff} affordable</span></div>
        <div class="small mute sub">Passive — buy with skill points</div>${passive}
        <div class="small mute sub">Techniques — learned in matches, or by stats</div>${techs}</section>
      <section class="card"><div class="lab">Life · $${run.money.toLocaleString()} · payday week ${next}${info(`Payday every ${ECON.payEvery} weeks: +$${ECON.allowance} allowance, −$${ECON.food} food, −rent. Run out of money and you're evicted to the abandoned gym.`)}</div>
        <div class="homes">${HOUSEK.map(k => homeRow(run, k)).join('')}</div>
        <div class="small mute">${World.isFree(run) ? 'Free agent — no club yet' : esc(FACTIONS[run.team].name)}</div></section>
    </div>`;
}
/** Your element: hidden (???) until OVR 70, then the three trial steps, then the signature spike. */
function elementLine(run) {
  const you = Run.you(run),
    S = ElTrial.steps(run);
  if (!S.seen)
    return `<div class="elline locked" ${tip(`Your element reveals itself at OVR ${ElTrial.revealAt}`)}><span class="elb">?</span><b>Element ???</b></div>`;
  const c = ECOL[you.el],
    how = `${EDESC[you.el]}.\nGauge: ${EFILL[you.el]} A captain's buff fills it at once.`;
  if (S.on)
    return `<div class="elline on" style="--e:${c}" ${tip(`${how}\n${TWIST[you.sig.tw].name}: ${TWIST[you.sig.tw].desc}.`)}><span class="elb">${ENAME[you.el].split(' ')[0]}</span><b>${esc(you.sig.name)}</b><i>${TWIST[you.sig.tw].name}</i></div>`;
  const st = [
    [S.star, 'Become a ★ star'],
    [S.proof, 'Grade S in a match where your team reaches the zone'],
    [false, `Pass the Element Trial${run.elNext > run.week ? ` (back in week ${run.elNext})` : ''}`]
  ];
  return `<div class="elline" style="--e:${c}" ${tip(`${how}\n\nTo unlock:\n${st.map(([ok, t]) => `${ok ? '✓' : '○'} ${t}`).join('\n')}`)}><span class="elb">${ENAME[you.el].split(' ')[0]}</span><b>${ENAME[you.el].split(' ').slice(1).join(' ')}</b><span class="elsteps">${st.map(([ok]) => `<i class="${ok ? 'ok' : ''}"></i>`).join('')}</span></div>`;
}
/** The season at a glance: coach's goal, cups so far, sponsors, injury. */
function seasonCard(run) {
  const g = run.goal,
    prog = Goals.progress(run, g);
  return `<div class="panel season"><h3>Goal and sponsors${run.sponsors.length ? '' : info(`Sponsors make offers at ${SPONSOR_AT.map(f => f.toLocaleString()).join(', ')} fans.`)}</h3>
    ${g ? `<div class="goal ${g.done === true ? 'ok' : g.done === false ? 'miss' : ''}"><b>Coach's goal${info(`Reward: +${GOAL_REWARD.sp} skill pts, +${GOAL_REWARD.fans} fans, mood up. Missing it: mood down.`)}</b> ${esc(Goals.text(run, g))} <span class="mute small">by W${g.by}${prog ? ' · ' + prog : ''}${g.done === true ? ' · reached' : g.done === false ? ' · missed' : ''}</span></div>` : ''}
    ${run.cups.map(c => `<div class="small">${esc(CUPS.find(x => x.id === c.id).name)}: <b>${Cup.placeText(c.place)}</b></div>`).join('')}
    ${
      run.sponsors.length
        ? `<div class="small"><b>Sponsors</b> ${run.sponsors
            .map(
              s =>
                `<span class="spn ${s.state}" title="${esc(SPONSORS[s.id].perk)} · ${esc(SPONSORS[s.id].cond)}">${esc(SPONSORS[s.id].name)} <i>${s.state === 'pending' ? 'on trial' : s.state === 'kept' ? 'signed' : 'lost'}</i></span>`
            )
            .join(' ')}</div>`
        : ''
    }
    ${
      run.injury
        ? `<div class="inj"><b>Injured</b> ${run.injury.weeks}w${info('Light training only: ×0.4 gains, half stamina')} <button class="btn" onclick="seePhysio()" ${run.sp < TRAIN_X.physio ? 'disabled' : ''}>Physio (${TRAIN_X.physio} pts)</button></div>`
        : ''
    }</div>`;
}
/** Leave the Academy squad: ask inline (confirm dialogs are blocked in the artifact frame), then withdraw. */
function leaveSquad(sure) {
  if (!sure) {
    const el = $('#leaveac');
    if (el)
      el.innerHTML = `Leave for good? The Academy won't invite you again. <button class="btn hot" onclick="leaveSquad(true)">Yes</button> <button class="btn" onclick="renderCareer()">No</button>`;
    return;
  }
  if (World.leaveAcademy(RUN)) Run.save(RUN);
  renderCareer();
}
/** Season timeline: 28 weeks with matches, camps, the coach's goal and the U21 Final Cup. */
function calendar(run) {
  const pips = [],
    cur = Run.cupDef(run),
    g = run.goal;
  for (let w = 1; w <= CAREER.weeks; w++) {
    const k = CALENDAR[w] || 'train',
      lab = k === 'camp' ? 'Camp' : k === 'eval' ? 'Eval' : '',
      skip = run.mode.short && w < 5,
      now = !cur && w === run.week;
    pips.push(
      `<span class="pip ${w < run.week || (cur && w <= run.week) ? 'past' : now ? 'now' : ''} ${k} ${skip ? 'skip' : ''} ${g && g.by === w && g.done == null ? 'goalw' : ''}" title="Week ${w}${lab ? ': ' + lab : ''}${g && g.by === w ? ' · goal due' : ''}">${w}${lab ? `<i>${lab[0]}</i>` : ''}</span>`
    );
    const c = CUPS.find(x => x.after === w);
    if (c) {
      const res = run.cups.find(x => x.id === c.id);
      pips.push(
        `<span class="pip cup ${cur && cur.id === c.id ? 'now' : res ? 'past' : ''}" title="${c.name}${res ? ': ' + res.place : ''}">${c.short}</span>`
      );
    }
  }
  return `<div class="cal">${pips.join('')}</div><p class="small mute callg"><i>E</i> evaluation · <i>C</i> camp · <u>underline</u> goal due</p>`;
}
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
  )}${row('Focus', seg(FOCUS[you.role], run.focus, 'setFocus'), `Pick one · hit it: +${FOCUS_REWARD.sp} skill pts +${FOCUS_REWARD.fans} fans`)}${
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
/** Match history (T-052, Cup.record): newest first, each row a fold with the kick-off snapshot (changes vs your previous match), your line and the box score. */
const MKIND = { eval: 'Evaluation', cup: 'Cup', challenge: 'Challenge', street: 'Street fight' };
function matchLog(run) {
  const L = run.mlog || [],
    sgn = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : ''),
    row = (e, i) => {
      const prev = L[i - 1],
        res = e.played ? `${e.win ? 'W' : 'L'} · ${e.grade}` : 'did not play',
        sum = `W${e.week} · ${MKIND[e.kind] || e.kind}${e.round ? ` (${esc(e.round)})` : ''} · vs ${esc(e.vs)} · ${e.score[0]}-${e.score[1]} · ${res}`,
        stats = [['ovr', 'OVR'], ...[...STATK, 'wit'].map(k => [k, STATNAME[k].slice(0, 3)])]
          .map(([k, n]) => `<span>${n} <b>${e.you[k]}</b> <i class="mute">${prev ? sgn(e.you[k] - prev.you[k]) : ''}</i></span>`)
          .join(' · '),
        ln = e.line,
        side = s =>
          `<tr class="gap"><td colspan="5">${s ? esc(e.short || e.vs) : 'Your side'}</td></tr>${e.box
            .filter(b => b.side === s)
            .map(
              b =>
                `<tr class="${b.you ? 'you' : ''}"><td>${esc(b.name)}</td><td>${b.role}</td><td>${b.ovr}</td><td>${b.k}/${b.att}/${b.err}</td><td>${b.blk}/${b.ace}/${b.dig}/${b.ast}</td></tr>`
            )
            .join('')}`,
        body = `<p class="small">${stats}</p>
          ${e.played ? `<p class="small">Line: ${ln.k} kills, ${ln.att} attacks, ${ln.err} errors, ${ln.blk} blocks, ${ln.ace} aces, ${ln.dig} digs, ${ln.ast} assists${e.stake ? ` · stake $${e.stake}` : ''}</p>` : ''}
          <table class="rk ml"><thead><tr class="gap"><td>Name</td><td>Role</td><td>OVR</td><td>K/Att/Err</td><td>Blk/Ace/Dig/Ast</td></tr></thead><tbody>${side(0)}${side(1)}</tbody></table>`;
      return fold(`ml${i}`, sum, body);
    };
  return `<div class="panel"><h3>Match history</h3>${L.length ? L.map(row).reverse().join('') : '<p class="small mute">No matches yet.</p>'}</div>`;
}
/** Rankings (World sheet): tabs for the three lists (Rank.*, js/career/rank.js), top rows then a gap and your own row. */
const RANK_TABS = {
  register: ['Register', 'Academy Register — U21, by rating'],
  gazette: ['Gazette', "The Gazette's Top 20 — the island's finest"],
  street: ['Street', "Who's hot under the overpass"]
};
function rankTab(k) {
  CW.rank = k;
  renderCareer();
}
function rankCard(run) {
  const you = Run.you(run),
    tab = RANK_TABS[CW.rank] ? CW.rank : 'register',
    all = Rank[tab](run),
    rated = r => tab !== 'register' || r.ovr != null,
    list = CW.rankAll ? all : all.filter((r, i) => rated(r) || r.id === you.id),
    n = 5, // the top 5, then you ± 5
    at = list.findIndex(r => r.id === you.id),
    hidden = all.length - list.length,
    row = r => {
      const i = all.indexOf(r);
      return `<tr class="${r.id === you.id ? 'you' : ''}"><td>${i + 1}</td><td>${r.id === you.id ? esc(r.name) : `<a class="plink" onclick="openPerson('${esc(String(r.id))}')">${esc(r.name)}</a>`}</td><td>${r.region ? esc(REGIONS[r.region].name) : 'Academy'} · ${r.role}</td><td>${
        tab === 'register' ? (r.ovr == null ? '<i class="mute">unrated</i>' : r.ovr) : tab === 'gazette' ? Math.round(r.fame) : r.pts
      }</td></tr>`;
    },
    gap = '<tr class="gap"><td colspan="4">…</td></tr>',
    near = at < 0 ? [] : list.slice(Math.max(n, at - 5), at + 6),
    rows = list.slice(0, n).map(row).join('') + (near.length ? (at - 5 > n ? gap : '') + near.map(row).join('') : '');
  return `<div class="panel"><div class="tabs rk">${Object.entries(RANK_TABS)
    .map(([k, [name]]) => `<button class="btn ${k === tab ? 'on' : ''}" onclick="rankTab('${k}')">${name}</button>`)
    .join('')}</div>
    <p class="small mute">${RANK_TABS[tab][1]}</p>
    ${list.length ? `<table class="rk"><tbody>${rows}</tbody></table>` : '<p class="small mute">Nobody on the board yet.</p>'}
    ${hidden || CW.rankAll ? `<button class="btn quiet" onclick="CW.rankAll=!CW.rankAll;renderCareer()">${CW.rankAll ? 'Hide unrated' : `Show unrated (${hidden})`}</button>` : ''}
    ${at < 0 ? `<p class="small mute">You are not on this list${tab === 'street' ? ' — fight, hustle, or take a challenge.' : '.'}</p>` : ''}</div>`;
}
/** "Their best: <name> Register #n · Gazette #n" for up to 2 of a squad's players (skips null ranks). */
function rankBest(run, ps) {
  const L = { register: Rank.register(run), gazette: Rank.gazette(run), street: Rank.street(run) },
    at = (k, id) => {
      const i = L[k].findIndex(r => r.id === id);
      return i < 0 ? null : i + 1;
    },
    got = ps
      .map(p => ({ p, r: Object.fromEntries(Object.keys(L).map(k => [k, at(k, p.id)])) }))
      .sort((a, b) => Math.min(...Object.values(b.r).map(v => v || 1e9)) - Math.min(...Object.values(a.r).map(v => v || 1e9)))
      .slice(0, 2);
  return got.length
    ? `<p class="small mute">Their best: ${got
        .map(
          ({ p, r }) =>
            `${esc(p.name)} ` +
            Object.entries(RANK_TABS)
              .filter(([k]) => r[k])
              .map(([k, [name]]) => `${name} #${r[k]}`)
              .join(' · ')
        )
        .join(' — ')}</p>`
    : '';
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
    head = `<div class="mph"><span class="lab">Week ${run.week} · Match day</span><h3 class="mpt">${esc(label)} evaluation${info(`Win: +${REWARDS.evalWin.sp} skill pts, +${REWARDS.evalWin.fans} fans; teammates who played with you remember the win. Loss: +${REWARDS.evalLoss.sp} skill pts, +${REWARDS.evalLoss.fans} fans. Each of your kills, blocks and aces adds more.\nGrade (S–C) from your own line: S ×1.5 rewards and mood up, A ×1.2, B ×1, C ×0.8.`)}</h3>${venue ? `<span class="small mute">at ${esc(VENUES[venue].name)}</span>` : ''}</div>`;
  if (e.kind === 'faction' && !e.mine)
    return `<div class="panel">${head}<p>Not selected this month.</p>
    ${note}<div class="acts"><button class="btn hot" onclick="benchEval()">Watch from the bench</button></div></div>`;
  const mine = e.kind === 'academy' ? club.P : byId(e.mine).slice(0, 4); // the 4 who start
  return `<div class="panel">${head}
    <div class="rosters"><div><div class="lab">${e.kind === 'academy' ? esc(club.name) : esc(club.name) + ' squad'}</div>${col(mine, true)}</div><div><div class="lab">${esc(REGIONS[e.region].name)} squad</div>${col(byId(e.opp).slice(0, 4), D.scouted || D.member)}</div></div>
    ${matchPrep(run, false)}
    <div class="rwchips"><span class="pchip good">Win +${REWARDS.evalWin.sp} skill pts · +${REWARDS.evalWin.fans} fans</span><span class="pchip">Loss +${REWARDS.evalLoss.sp} skill pts · +${REWARDS.evalLoss.fans} fans</span></div>
    <div class="mnotes small mute">${D.scouted || D.member ? '' : 'Scout one of their clubs to see ratings. '}${rankBest(run, byId(e.opp).slice(0, 4)).replace(/<\/?p[^>]*>/g, '')}</div>
    ${note}<div class="acts pri"><button class="btn hot" onclick="playCareer('eval')">Play evaluation</button><button class="btn" onclick="playCareer('eval', true)" ${tip('Get the result without watching')}>Sim ⏭<small>result without watching</small></button></div></div>`;
}
/** Not selected: watch from the bench (wit XP) and end the week. */
function benchEval() {
  Run.log(RUN, Eval.bench(RUN));
  endWeekUI();
}
/** End the week and remember what changed for the recap card (nothing changed = no card). */
/** What the Week report compares against: your values when the week began (taken at the week's first hub render). */
function weekSnap(run) {
  const you = Run.you(run);
  return {
    key: `${run.week}:${(Run.cupDef(run) || {}).id || ''}`,
    run,
    stat: Object.fromEntries(STATK.map(k => [k, you[k]])),
    money: run.money,
    fans: run.fans,
    rep: Object.fromEntries(Object.keys(REGIONS).map(r => [r, City.rep(run, r)])),
    own: { ...(run.own || {}) },
    top: run.log[0],
    week: run.week,
    sp: run.sp,
    bond: { ...you.bond }
  };
}
function endWeekUI() {
  const run = RUN,
    regs = Object.keys(REGIONS).filter(r => REGIONS[r].kind !== 'none'),
    before = CW.snap && CW.snap.run === run && CW.snap.week === run.week ? CW.snap : weekSnap(run);
  Run.endWeek(run);
  const now = Run.you(run),
    rows = [],
    d = (n, txt) => n && rows.push([n > 0 ? 'up' : 'dn', txt]),
    sg = n => (n > 0 ? `+${n}` : `−${-n}`);
  for (const k of STATK) d(now[k] - before.stat[k], `${STATNAME[k]} ${sg(now[k] - before.stat[k])}`);
  d(run.money - before.money, `Money ${run.money > before.money ? '+' : '−'}$${Math.abs(run.money - before.money).toLocaleString()}`);
  d(run.fans - before.fans, `Fans ${sg(run.fans - before.fans)}`);
  d(run.sp - before.sp, `Skill pts ${sg(run.sp - before.sp)}`);
  for (const m of Run.mates(run))
    d(
      (now.bond[m.id] || 0) - (before.bond[m.id] || 0),
      `Bond ${m.name.split(' ')[0]} ${sg((now.bond[m.id] || 0) - (before.bond[m.id] || 0))}`
    );
  for (const r of regs) d(City.rep(run, r) - before.rep[r], `⚑ ${REGIONS[r].name} ${sg(City.rep(run, r) - before.rep[r])}`);
  for (const t of ownChanges(before.own, run.own || {})) rows.push(['ch', t.text]);
  const at = before.top ? run.log.indexOf(before.top) : run.log.length,
    lines = run.log.slice(0, at < 0 ? run.log.length : at).slice(0, 6);
  rows.sort((a, b) => ['dn', 'up', 'ch'].indexOf(a[0]) - ['dn', 'up', 'ch'].indexOf(b[0])); // bad news first, then your gains, then the world
  CW.recap = { week: before.week, rows, lines: lines.map(l => l.t) }; // the Week report, every week (spec §10.5)
  renderCareer();
}
/** A diary line's tag by its text (the producers stay as they are): [class, icon] — bad news, gains, the coach's goal, the world. */
const LOG_TAGS = [
  ['bad', '✕', /Goal missed|mood down|evicted|caught a cold|injur|noisy night|\blost\b|Lost|stolen|refused/i],
  ['goal', '◎', /Coach's goal/],
  ['good', '+', /Goal reached|broke through|Awakening|Signed with|learned|won\b|\+\d/],
  ['world', '•', /./]
];
function logTag(t) {
  const m = LOG_TAGS.find(([, , re]) => re.test(t));
  return [m[0], m[1]];
}
const logLi = (t, pre = '') => {
  const [c, i] = logTag(t);
  return `<li class="lt ${c}"><i aria-hidden="true">${i}</i><span>${pre}${esc(t)}</span></li>`;
};
/** Places whose holder differs between two `run.own` maps: [{ id, to, text }]. */
function ownChanges(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(id => SPOTS[id] && (a[id] || SPOTS[id].region) !== (b[id] || SPOTS[id].region))
    .map(id => {
      const to = b[id] || SPOTS[id].region,
        from = a[id] || SPOTS[id].region;
      return { id, to, text: `${REGIONS[to].name} ${b[id] ? 'seized' : 'retook'} the ${SPOTS[id].name} from ${REGIONS[from].name}` };
    });
}
/** The card after End week (hubCard shows it last, so events / cups / matches win). */
/** The Week report (spec §10.5): penalties first, your week as chips, the new goal, island news; Next week → the brief. */
function recapCard() {
  const R2 = CW.recap,
    tagged = R2.lines.map(t => [logTag(t)[0], t]),
    of = k => tagged.filter(([c]) => c === k).map(([, t]) => t),
    bad = of('bad'),
    goal = of('goal'),
    good = of('good'),
    world = of('world'),
    chips = R2.rows.filter(([c]) => c !== 'ch'),
    places = R2.rows.filter(([c]) => c === 'ch').map(([, t]) => t),
    it = (ico, cls, title, body) =>
      `<div class="bi"><span class="bico ${cls}">${ico}</span><div><b class="${cls}">${title}</b>${body ? `<div class="small mute">${body}</div>` : ''}</div><span></span></div>`;
  return `<div class="panel brief report recap"><div class="lab">Week ${typeof R2.week === 'number' ? R2.week : esc(R2.week)} report</div><h2>${bad.length ? 'A rough week' : chips.some(([c]) => c === 'up') ? 'A good week' : 'A quiet week'}</h2>
    ${bad.map(t => it('✕', 'dn', esc(t), '')).join('')}
    ${chips.length || good.length ? `<div class="bi"><span class="bico">✸</span><div><b>Your week</b><div class="rrows">${chips.map(([c, t]) => `<span class="rr ${c}">${esc(t)}</span>`).join('')}</div>${good.length && !chips.length ? `<div class="small mute">${good.map(esc).join(' · ')}</div>` : ''}</div><span></span></div>` : ''}
    ${goal.map(t => it('◎', '', 'New goal', esc(t.replace(/^Coach's goal: /, '')))).join('')}
    ${world.length || places.length ? it('⚔', '', 'On the island', [...places, ...world].map(esc).join(' · ')) : ''}
    <div class="acts"><button class="btn hot" onclick="recapDone()">Next week</button></div></div>`;
}
function recapDone() {
  CW.recap = null;
  renderCareer();
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
    <div class="panel"><div class="mph"><span class="lab">Week ${run.week} · Match day</span><h3 class="mpt">${nm.round}${info(`Win: +${Math.round(REWARDS.cupWin.sp * def.mul)} skill pts, +${Math.round(REWARDS.cupWin.fans * def.mul).toLocaleString()} fans. A loss ends the season.\nPlacement: round of 16 +${fans('Round of 16')} fans · quarterfinal +${fans('Quarterfinal')} · semifinal +${fans('Semifinal')} · runner-up +${fans('Final')} · champion +${fans('Champion')} — and a place on the national team.\nGrade (S–C) from your own line: S ×1.5 rewards and mood up, A ×1.2, B ×1, C ×0.8.`)}</h3><span class="small mute">vs ${esc(E[nm.a === me ? nm.b : nm.a].name)}${City.venue(run) ? ` · at ${esc(VENUES[City.venue(run)].name)}` : ''}</span></div>
      ${matchRosters(run, Cup.team(run, me), Cup.team(run, nm.a === me ? nm.b : nm.a))}
      ${matchPrep(run, true)}
      <div class="rwchips"><span class="pchip good">Win +${Math.round(REWARDS.cupWin.sp * def.mul)} skill pts · +${Math.round(REWARDS.cupWin.fans * def.mul).toLocaleString()} fans</span><span class="pchip">Loss ends the season</span></div>
      <div class="mnotes small mute">${rankBest(run, squadOf(Cup.team(run, nm.a === me ? nm.b : nm.a))).replace(/<\/?p[^>]*>/g, '')}</div>
    <div class="acts pri"><button class="btn hot" onclick="playCareer('cup')">Play ${nm.round.toLowerCase()}</button><button class="btn" onclick="playCareer('cup', true)" ${tip('Get the result without watching')}>Sim ⏭<small>result without watching</small></button></div></div>`;
}
function eventCard(run) {
  const e = Events.def(run.event, run),
    fxText = fx =>
      typeof fx === 'string'
        ? fx
        : fx
            .map(([k, v, sub]) =>
              k === 'chance'
                ? `${Math.round(v * 100)}% chance: ${fxText(sub)}`
                : k === 'main'
                  ? `${signed(v)} ${STATNAME[run.lastMain]}`
                  : k.startsWith('bond')
                    ? `${signed(v)} bond${k === 'bondAll' ? ' with everyone' : ''}`
                    : k === 'mood'
                      ? `mood ${v > 0 ? 'up' : 'down'}`
                      : `${signed(v)} ${k === 'sta' ? 'stamina' : k === 'sp' ? 'skill pts' : STATNAME[k] || k}`
            )
            .join(', ');
  const kind = { sponsor: 'Sponsor', element: 'Element Trial' }[run.event.id] || 'Event',
    you = Run.you(run);
  return `<div class="panel ev ${run.event.id === 'element' ? 'lbk' : ''}"${run.event.id === 'element' ? ` style="--lbk:${ECOL[you.el]}"` : ''}><span class="evk">${kind}</span><h3>${esc(e.title)}</h3><p>${esc(Events.text(run, run.event, e.text))}</p>
    <div class="evc acts two">${[e.a, e.b].map(([label, fx], i) => `<button class="btn" onclick="chooseEvent(${i})"><b>${esc(label)}</b><small>${esc(fxText(fx))}</small></button>`).join('')}</div></div>`;
}
function chooseEvent(i) {
  if (!RUN.event) return;
  Run.log(RUN, Events.choose(RUN, i));
  Run.save(RUN); // the week goes on: only the player ends it
  renderCareer();
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
function seePhysio() {
  if (Training.physio(RUN)) renderCareer();
}
function learnSkill(id) {
  if (Skills.learn(RUN, id)) renderCareer();
}
/** Play a career match on the match screen, or (sim) resolve it at once without watching. */
function playCareer(kind, sim) {
  const fx = Cup.fixture(RUN, kind);
  if (!sim) return navigate('match', fx);
  Cup.simNow(fx);
  renderCareer();
}
/** One housing option: rent, rest and what it does to you, then Move in (or "Home" for where you live). */
function homeRow(run, k) {
  const H = HOUSING[k],
    cur = k === run.housing,
    fx = [
      `Rest ×${H.rest}`,
      H.moodPay ? `Mood ${H.moodPay[0] > 0 ? '↑' : '↓'} on payday ${Math.round(H.moodPay[1] * 100)}%` : '',
      H.noise ? `Noise ${Math.round(H.noise * 100)}%` : '',
      H.sick ? `Sick ${Math.round(H.sick * 100)}%` : '',
      H.grit ? `Leadership +${H.grit}` : ''
    ].filter(Boolean),
    bad = t => /↓|Noise|Sick/.test(t);
  return `<div class="home rowcta ${cur ? 'sel' : ''}" ${tip(H.desc)}><div class="nm"><span class="n1">${chip(REGIONS[H.region])}<b>${esc(H.name)}</b> <span class="small">$${H.rent} / payday</span></span>
    <span class="n2 small">${fx.map(t => `<span class="${bad(t) ? 'dn' : t.includes('↑') || t.includes('+') ? 'up' : 'mute'}">${t}</span>`).join(' · ')}</span></div>
    ${cur ? '<span class="btn on here">Home</span>' : `<button class="btn" onclick="setHousing('${k}')" ${run.money < H.rent ? tip(`Rent $${H.rent} on payday · you $${run.money}`) : ''}>Move in</button>`}</div>`;
}
/** Clubs that would sign you (free agents only). */
/** The first thing a club still asks of you, as your gap: "OVR 72 · you 41", "$600 · you $200". '' when you can sign. */
function joinGap(run, ti) {
  const you = Run.you(run),
    j = World.joinReq(run, ti),
    key = KEYSTAT[you.role],
    c = World.canJoin(run, ti);
  if (c.ok) return '';
  if (!World.isFree(run)) return 'Already signed';
  if (Run.cupDef(run)) return 'Not during a cup';
  if (j.ovr && ovr(you) < j.ovr) return `OVR ${j.ovr} · you ${ovr(you)}`;
  if (j.key && you[key] < j.key) return `${STATNAME[key]} ${j.key} · you ${you[key]}`;
  if (j.star && !you.star) return 'Needs ★ star';
  if (j.fans && run.fans < j.fans) return `${j.fans.toLocaleString()} fans · you ${run.fans.toLocaleString()}`;
  if (j.fee && run.money < j.fee) return `$${j.fee} · you $${run.money}`;
  return c.why.join(', ');
}
function clubsCard(run) {
  const mine = World.isFree(run) ? null : Run.myTeam(run);
  let first = true; // one ink primary per card: the first club that would sign you
  return `<div class="panel clubs"><h3>${mine ? `You play for ${chip(mine)}${esc(mine.name)}` : 'Find a club'}${info('You play Academy evaluations and the U21 Final Cup with the Academy squad until a club signs you. You take the same-role spot on the club.')}</h3>
    <div class="clist">${[...run.teams]
      .sort((a, b) => World.canJoin(run, b.i).ok - World.canJoin(run, a.i).ok) // signable first
      .map(t => {
        const c = World.canJoin(run, t.i),
          f = FACTIONS[t.i],
          sub = t.name.startsWith(REGIONS[f.region].name) || t.name.startsWith(f.name.split(' · ')[0]) ? '' : `${esc(f.name)} · `; // "Wei Dynasty Gold" already says Wei Dynasty
        return `<div class="club rowcta" style="--tc:${t.color}"><div class="nm"><span class="n1">${chip(t)}<b>${esc(t.name)}</b> <span class="mute small">${sub}OVR ${t.ovr}</span>${info(`${f.front}. Word is: ${f.dark}.`)}</span>
          <span class="n2 small ${c.ok ? '' : 'mute'}">${World.joinText(t.i, run)}</span></div>
          ${mine ? '' : `<button class="btn ${c.ok ? (first ? ((first = false), 'hot') : '') : 'lock'}" onclick="joinClub(${t.i})" ${c.ok ? '' : 'disabled'} ${c.ok ? '' : tip('Missing: ' + c.why.join(', '))}>${c.ok ? 'Sign' : esc(joinGap(run, t.i))}</button>`}</div>`;
      })
      .join('')}</div></div>`;
}
/** Your standing with each faction (region), its clubs, and this week's street battle. */
function factionsCard(run) {
  const row = r => {
    const F = Dossier.summary(run, r),
      v = F.standing,
      fronts = F.fronts
        .map(({ vs, meter: m }) => {
          const S = FRONT.seize,
            k = Front.stakes(run, r, vs),
            cells = Array.from({ length: 2 * S + 1 }, (_, i) => {
              const c = i - S;
              return `<b class="${c === 0 ? 'mid' : ''} ${m > 0 && c > 0 && c <= m ? 'on up' : m < 0 && c < 0 && c >= m ? 'on dn' : ''}"></b>`;
            }).join('');
          return `<span class="fm2" ${tip(`Border pressure vs ${REGIONS[vs].name}: ${S} net wins seize a place`)}>Border vs ${esc(REGIONS[vs].name.split(' ')[0])} <i class="seg">${cells}</i> ${m > 0 ? '+' : m < 0 ? '−' : ''}${Math.abs(m)}/${S}${k.seize && k.place ? ` <span class="mute">next win: ${esc(SPOTS[k.place].name)}</span>` : ''}</span>`;
        })
        .join(''),
      places =
        (F.took.length
          ? `<div class="small">Took: ${F.took.map(p => `${esc(p.name)} <i class="mute">(from ${esc(REGIONS[p.from].name)})</i>`).join(', ')}</div>`
          : '') +
        (F.lost.length
          ? `<div class="small">Lost: ${F.lost.map(p => `${esc(p.name)} <i class="mute">(to ${esc(REGIONS[p.to].name)})</i>`).join(', ')}</div>`
          : ''),
      E = F.econ,
      econ = E
        ? `<div class="small mute">Prices ×${E.priceMul.toFixed(1)} · facilities ×${E.qMul.toFixed(2)}${E.joinCut ? ` · clubs ask −${E.joinCut} OVR/key, fees −${E.feeCut}%` : ''}</div>`
        : '',
      clubs = F.clubs.map(ti => run.teams[ti]);
    return `<div class="fac ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}"><div class="fh"><b><a href="#" class="dlink" onclick="openDossier('${r}');return false">${esc(F.name)}</a></b> <span class="mute small">${F.kind}</span>${F.weak ? ' <span class="stk far">Weakened</span>' : ''}${info(F.desc)}<span class="fv">${F.label}</span></div>
        ${fronts ? `<div class="fms">${fronts}</div>` : ''}${places}${econ}
        <div class="small mute stl">Your standing <b>${signed(v)}</b></div><div class="rbar" ${tip('Standing −100 … +100')}><i style="${v >= 0 ? `left:50%;width:${v / 2}%` : `left:${50 + v / 2}%;width:${-v / 2}%`}"></i></div>
        <div class="small">${clubs.map(t => `${chip(t)}${esc(t.name)}${t.i === run.team ? ' <i class="mute">(yours)</i>' : ''}`).join(' · ')}${
          F.foe
            ? ` <a href="#" class="clashk" onclick="hubOpen(null);mapPick('clash');return false">⚔ vs ${esc(REGIONS[F.foe].name)} this week</a>`
            : ''
        }</div></div>`;
  };
  return `<div class="panel facs"><p class="small mute">Pick a side in a street battle to move standing and border pressure.${info(`Standing: win +${CLASH.win}, lose ${CLASH.lose}; the side you fight against always ${CLASH.other}. Every battle pushes its border: ${FRONT.seize} net wins seize a border place (lost places come back first).`)}</p>${Object.keys(
    REGIONS
  )
    .filter(r => REGIONS[r].kind !== 'none')
    .map(row)
    .join('')}</div>`;
}
/** The Season sheet (spec §10.4, SheetSeason): calendar, goal and sponsors, match history | Diary / Gazette. */
function sheetSeason(run) {
  const t = CW.stab === 'news' ? 'news' : 'diary',
    g = run.gazette;
  if (t === 'news' && g && !g.read && Run.readGazette(run)) Run.save(run);
  return `<div class="sheet-h"><h2>Season</h2><span class="pchip">Week ${Math.min(run.week, CAREER.weeks)} / ${CAREER.weeks}</span></div>
    <div class="sheet-cols seacols"><div class="scol"><section class="card"><div class="lab">Calendar</div>${calendar(run)}</section>${seasonCard(run)}${matchLog(run)}</div>
    <section class="card"><div class="seg pfil"><button class="btn ${t === 'diary' ? 'on' : ''}" onclick="CW.stab='diary';renderCareer()">Diary</button><button class="btn ${t === 'news' ? 'on' : ''}" onclick="CW.stab='news';renderCareer()">Gazette${g && !g.read ? ' <em class="badge">!</em>' : ''}</button></div>${
      t === 'news'
        ? g
          ? `<p class="small mute">Week ${g.week}</p><ul class="gzl">${g.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
          : '<p class="mute small">No Gazette yet — it comes out on payday.</p>'
        : `<ol class="log tagged">${run.log.map(l => logLi(l.t, `<b>${typeof l.w === 'number' ? 'W' + l.w : esc(l.w)}</b> `)).join('')}</ol>`
    }</section></div>`;
}
/** The Gazette from the last payday, until you dismiss it. */
function gazetteCard(run) {
  const g = run.gazette;
  if (!g || g.read) return '';
  return `<div class="panel gazette"><h3>The Gazette <span class="mute small">week ${g.week}</span></h3><ul class="small">${g.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="acts"><button class="btn hot" onclick="readGazette()">Close</button></div></div>`;
}
function readGazette() {
  Run.readGazette(RUN);
  Run.save(RUN);
  renderCareer();
}
function setHousing(k) {
  if (World.setHousing(RUN, k)) Run.save(RUN);
  renderCareer();
}
function joinClub(ti) {
  if (World.join(RUN, ti)) Run.save(RUN);
  renderCareer();
}
/** Abandon: ask inline (browser confirm dialogs are blocked inside the artifact frame), then clear the run. */
function abandonRun(sure) {
  if (!sure) {
    const el = $('#abandon');
    if (el)
      el.innerHTML = `Abandon this run? <button class="btn hot" onclick="abandonRun(true)">Yes, abandon</button> <button class="btn" onclick="renderCareer()">Keep playing</button>`;
    return;
  }
  Run.clear();
  RUN = null;
  navigate('menu');
}
