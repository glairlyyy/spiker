// Career panels shown in the hub's drawers and pop-ups (career-hub.js): your player, season, teammates, life, clubs,
// Gazette, the event card, evaluation / Cup match cards and the skills shop, plus their handlers.

/** Hub UI state: Hard toggle, selected place, open drawer, last diary line shown as a toast. */
let CW = {
  hard: false,
  spot: null,
  drawer: null,
  toast: null,
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

function youCard(run) {
  const you = Run.you(run),
    team = Run.myTeam(run),
    mood = MOODS[run.mood],
    staPct = Math.round((run.sta / run.staMax) * 100);
  const capTag = k =>
    `<small class="gate ${you[k] >= TRAIN_CAP ? 'at' : ''}" title="Training stops at ${TRAIN_CAP}. Matches only above.">${you[k]} / ${TRAIN_CAP}</small>`;
  return `<div class="panel ycard">
    <div class="phd"><span class="portrait">${faceSVG(you, mood.form, 64)}<b>${you.num}</b></span>
      <div><div class="pn">${stag(you)}${esc(you.name)}${you.cap ? ' <span class="capb" title="Team captain">C</span>' : ''}</div>
      <div class="small mute">${you.role} · ${chip(team)}${esc(team.short)} · OVR ${ovr(you)}</div>
      <div class="small ${you.op ? 'opline' : 'mute'}">${
        you.op
          ? 'OP red star'
          : you.star
            ? `★ Star${info(`OP at OVR ${CAREER.op.ovr}, ${STATNAME[KEYSTAT[you.role]]} ${CAREER.op.key}, wit ${CAREER.op.wit}`)}`
            : `Rookie${info(`★ Star at OVR ${CAREER.star.ovr}`)}`
      }</div></div></div>
    <div class="vitals">
      <div><span>Stamina</span><span class="sbar big ${staPct < 50 ? 'low' : ''}"><i style="width:${staPct}%"></i></span><b>${run.sta}/${run.staMax}</b></div>
      <div><span>Mood</span><span class="mood m${run.mood}">${mood.name}</span></div>
      <div><span>Skill points</span><b>${run.sp}</b></div>
      <div><span>Fans</span><b>${run.fans.toLocaleString()}</b></div>
      <div><span>Money</span><b>$${run.money.toLocaleString()}</b></div>
    </div>
    ${run.goal && run.goal.done == null ? `<div class="ygoal ${run.goal.by - run.week <= 1 ? 'warn' : ''}"><span>Coach's goal</span> ${esc(Goals.text(run, run.goal))} · ${esc(Goals.progress(run, run.goal))} · by W${run.goal.by}</div>` : ''}
    <div class="stats">${STATK.map(k => {
      const pr = Training.progress(run, k);
      return `<span ${tip(`${Math.round((pr.have / Math.max(1, pr.need)) * 100)}% of the way to the next point`)}>${STATNAME[k]}${capTag(k)}</span><span class="xpbar">${bar(you[k])}<i style="width:${Math.round((pr.have / Math.max(1, pr.need)) * 100)}%"></i></span>`;
    }).join('')}
      <span>Wit</span><span class="bar wit"><i style="width:${you.wit * 50}%"></i><b>${you.wit.toFixed(2)}</b></span>
      <span>Leadership</span>${bar(you.lead)}</div>
    ${elementLine(run)}
    ${you.skills.length ? `<div class="skchips">${you.skills.map(skillChip).join('')}</div>` : ''}
    ${run.mode.hard || run.mode.short ? `<div class="small mute runtags">${[run.mode.hard ? 'Hard league' : '', run.mode.short ? 'Short season' : ''].filter(Boolean).join(' · ')}</div>` : ''}
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
function bondCard(run) {
  const you = Run.you(run),
    mates = Run.mates(run),
    alone = World.isFree(run) && run.academy === false,
    onBench = m => !!(m.team.bench && m.team.bench.includes(m)),
    row = list =>
      list
        .map(m => {
          const b = you.bond[m.id] || 0;
          return `<div class="bond">${faceSVG(m, 0, 30)}<div class="bline"><span class="nm"><b>${stag(m)}${esc(m.name)}</b>${m.cap ? ' <span class="capb">C</span>' : ''} <i class="mute small">${m.role} · OVR ${ovr(m)}</i></span>
        <span class="bbar ${b >= 80 ? 'f' : b >= 60 ? 'c' : ''}"><i style="width:${b}%"></i></span><small class="mute">Bond ${b}${b >= 80 ? ' · friends' : b >= 60 ? ' · combos' : ''}</small></div></div>`;
        })
        .join('');
  return `<div class="panel"><h3>Teammates${info('Training together shares your gains and raises their odds of breaking through to ★ star or OP. 60+ bond: two-player combos. 80+: friendship training (+50%).')}</h3>${
    alone ? '<p class="small mute">No squad. The Academy no longer lists you.</p>' : ''
  }${row(mates.filter(m => !onBench(m)))}${mates.some(onBench) ? `<h4>Bench</h4>${row(mates.filter(onBench))}` : ''}${
    alone
      ? ''
      : `<h4>Chemistry${info('Allies who rate each other form cliques; the captain starts his friends a little more often. Feuds go the other way.')}</h4>${chemBlock(run)}`
  }${
    World.isFree(run) && run.academy !== false
      ? `<p class="small mute" id="leaveac"><button class="btn quiet danger" onclick="leaveSquad()" ${tip('The Academy will not invite you again')}>Leave squad</button></p>`
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
/** Pre-match choices: a focus goal (everyone) and, for Cup matches, the captain's team talk. */
function matchPrep(run, cup) {
  const you = Run.you(run);
  const focus = `<div class="prep"><b>Your focus</b> ${FOCUS[you.role]
    .map(([id, label]) => `<button class="btn ${run.focus === id ? 'on' : ''}" onclick="setFocus('${id}')">${label}</button>`)
    .join('')}${info(`Hit it: +${FOCUS_REWARD.sp} skill pts, +${FOCUS_REWARD.fans} fans`)}</div>`;
  const talk =
    cup && you.cap
      ? `<div class="prep"><b>Captain's team talk</b> ${Object.entries(TALKS)
          .map(
            ([id, t]) =>
              `<button class="btn ${run.talk === id ? 'on' : ''}" onclick="setTalk('${id}')" title="${esc(t.desc)}">${t.name}</button>`
          )
          .join('')}${info('You are captain — pick one before the match')}</div>`
      : '';
  // the coach's pick (Run.lineup): do you start?
  const side = Cup.mine(run, cup ? 'cup' : 'eval'),
    L = Run.lineup(run, side.T, side.region, true, cup && run.mode.story),
    lineup = `<div class="prep"><b>Lineup</b> ${L.starts ? 'Starting' : '<b>On the bench</b>'}${
      L.rival ? ` <span class="small mute">— you ${L.you.toFixed(1)} vs ${esc(L.rival.p.name)} ${L.rival.score.toFixed(1)}</span>` : ''
    }${info(`Your coach picks the best player of each role by rating + 6 × form (+ your standing with the faction ÷ ${BENCH.standingPer}). Start or finish on the bench and match rewards ×${BENCH.partMul}; never play and you only get a little Wit XP.`)}</div>`;
  return lineup + focus + talk;
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
/** Rankings drawer: tabs for the three lists (Rank.*, js/career/rank.js), top rows then a gap and your own row. */
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
/** The evaluation week's card: play (or Sim) your evaluation match, or watch from the bench when not selected. */
function evalPanel(run, note = '') {
  const e = run.eval || Eval.setup(run),
    label = e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name,
    D = Dossier.build(run, e.region),
    all = Pool.players(run, e.region).concat([Run.you(run)]),
    club = Run.myTeam(run),
    list = (ps, showOvr) =>
      ps.map(p => `<span>${stag(p)}${esc(p.name)} <i class="mute">${p.role}${showOvr ? ' ' + ovr(p) : ''}</i></span>`).join(' · '),
    byId = ids => ids.map(id => all.find(p => p.id === id)).filter(Boolean),
    head = `<h3>Week ${run.week}: ${esc(label)} evaluation${info(`Win: +${REWARDS.evalWin.sp} skill pts, +${REWARDS.evalWin.fans} fans; teammates who played with you remember the win. Loss: +${REWARDS.evalLoss.sp} skill pts, +${REWARDS.evalLoss.fans} fans. Each of your kills, blocks and aces adds more.\nGrade (S–C) from your own line: S ×1.5 rewards and mood up, A ×1.2, B ×1, C ×0.8.`)}</h3>`;
  if (e.kind === 'faction' && !e.mine)
    return `<div class="panel">${head}<p>Not selected this month.</p>
    ${note}<div class="acts"><button class="btn hot" onclick="benchEval()">Watch from the bench</button></div></div>`;
  const mine = e.kind === 'academy' ? club.P : byId(e.mine).slice(0, 4); // the 4 who start
  return `<div class="panel">${head}
    <p class="small"><b>${e.kind === 'academy' ? esc(club.name) : esc(club.name) + ' squad'}</b> ${list(mine, true)}</p>
    <p class="small"><b>${esc(REGIONS[e.region].name)} squad</b> ${list(byId(e.opp).slice(0, 4), D.scouted || D.member)}</p>
    ${City.venue(run) ? `<p class="small mute">Played at <b>${esc(VENUES[City.venue(run)].name)}</b>.</p>` : ''}
    ${D.scouted || D.member ? '' : '<p class="small mute">Scout one of their clubs to see ratings.</p>'}
    ${rankBest(run, byId(e.opp).slice(0, 4))}
    ${matchPrep(run, false)}
    ${note}<div class="acts pri"><button class="btn hot" onclick="playCareer('eval')">Play evaluation</button><button class="btn" onclick="playCareer('eval', true)" ${tip('Get the result without watching')}>Sim ⏭</button></div></div>`;
}
/** Not selected: watch from the bench (wit XP) and end the week. */
function benchEval() {
  Run.log(RUN, Eval.bench(RUN));
  endWeekUI();
}
/** End the week and remember what changed for the recap card (nothing changed = no card). */
function endWeekUI() {
  const run = RUN,
    you = Run.you(run),
    regs = Object.keys(REGIONS).filter(r => REGIONS[r].kind !== 'none'),
    before = {
      stat: Object.fromEntries(STATK.map(k => [k, you[k]])),
      money: run.money,
      fans: run.fans,
      rep: Object.fromEntries(regs.map(r => [r, City.rep(run, r)])),
      own: { ...(run.own || {}) },
      top: run.log[0]
    };
  Run.endWeek(run);
  const now = Run.you(run),
    rows = [],
    d = (n, txt) => n && rows.push([n > 0 ? 'up' : 'dn', txt]),
    sg = n => (n > 0 ? `+${n}` : `−${-n}`);
  for (const k of STATK) d(now[k] - before.stat[k], `${STATNAME[k]} ${sg(now[k] - before.stat[k])}`);
  d(run.money - before.money, `Money ${run.money > before.money ? '+' : '−'}$${Math.abs(run.money - before.money).toLocaleString()}`);
  d(run.fans - before.fans, `Fans ${sg(run.fans - before.fans)}`);
  for (const r of regs) d(City.rep(run, r) - before.rep[r], `⚑ ${REGIONS[r].name} ${sg(City.rep(run, r) - before.rep[r])}`);
  for (const t of ownChanges(before.own, run.own || {})) rows.push(['ch', t.text]);
  const at = before.top ? run.log.indexOf(before.top) : run.log.length,
    lines = run.log.slice(0, at < 0 ? run.log.length : at).slice(0, 6);
  rows.sort((a, b) => ['dn', 'up', 'ch'].indexOf(a[0]) - ['dn', 'up', 'ch'].indexOf(b[0])); // bad news first, then your gains, then the world
  CW.recap = rows.length || lines.length ? { week: run.week, rows, lines: lines.map(l => l.t) } : null;
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
function recapCard(run) {
  const R2 = CW.recap;
  return `<div class="panel recap"><span class="rk">${typeof R2.week === 'number' ? `Week ${R2.week}` : esc(R2.week)} done</span>
    ${R2.rows.length ? `<div class="rrows">${R2.rows.map(([c, t]) => `<span class="rr ${c}">${esc(t)}</span>`).join('')}</div>` : ''}
    ${
      R2.lines.length
        ? `<ul class="rlog">${[...R2.lines]
            .sort((a, b) => LOG_TAGS.findIndex(x => x[0] === logTag(a)[0]) - LOG_TAGS.findIndex(x => x[0] === logTag(b)[0]))
            .map(t => logLi(t))
            .join('')}</ul>`
        : ''
    }
    <div class="acts"><button class="btn hot" onclick="recapDone()">Continue</button></div></div>`;
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
  const rounds = ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final'].filter(r => S.some(x => x.round === r)),
    P = PLACES,
    fans = k => Math.round(P[k].fans * def.mul).toLocaleString();
  return `<div class="bracket"><h3 class="bt3">${def.name}${def.seeded ? ' <span class="small mute">seeded</span>' : ''}</h3>
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
    <div class="panel"><h3>${nm.round}${info(`Win: +${Math.round(REWARDS.cupWin.sp * def.mul)} skill pts, +${Math.round(REWARDS.cupWin.fans * def.mul).toLocaleString()} fans. A loss ends the season.\nPlacement: round of 16 +${fans('Round of 16')} fans · quarterfinal +${fans('Quarterfinal')} · semifinal +${fans('Semifinal')} · runner-up +${fans('Final')} · champion +${fans('Champion')} — and a place on the national team.\nGrade (S–C) from your own line: S ×1.5 rewards and mood up, A ×1.2, B ×1, C ×0.8.`)}</h3><p>vs <b>${esc(E[nm.a === me ? nm.b : nm.a].name)}</b>${City.venue(run) ? ` at <b>${esc(VENUES[City.venue(run)].name)}</b>` : ''}</p>
      ${rankBest(run, squadOf(Cup.team(run, nm.a === me ? nm.b : nm.a)))}
      ${matchPrep(run, true)}
    <div class="acts pri"><button class="btn hot" onclick="playCareer('cup')">Play ${nm.round.toLowerCase()}</button><button class="btn" onclick="playCareer('cup', true)" ${tip('Get the result without watching')}>Sim ⏭</button></div></div>`;
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
/** Skills shop in two groups: active techniques (fire in matches) and passive skills (always on). */
function skillShop(run, open) {
  const you = Run.you(run),
    ids = Skills.forRole(you.role);
  const card = id => {
    const s = SKILLS[id],
      own = you.skills.includes(id),
      byStats = !own && s.tech && hasTech(you, id);
    return `<button class="sk ${own || byStats ? 'own' : ''} ${s.tech ? 'act' : 'pas'}" onclick="learnSkill('${id}')" ${own || byStats || !Skills.canLearn(run, id) ? 'aria-disabled="true"' : ''} ${tip(s.tech && !own && !byStats ? `${s.desc}\nLearned in matches: by doing it, or by facing a player who has it.` : s.desc)}>${skillIcon(id)}<b>${esc(s.name)}</b><span>${own ? '✓' : byStats ? '✓ stats' : s.tech ? '<em class="tag">learn in matches</em>' : run.sp >= s.cost ? s.cost : `${s.cost} · need ${s.cost - run.sp}`}</span></button>`;
  };
  const aff = ids.filter(id => !you.skills.includes(id) && Skills.canLearn(run, id)).length;
  return `<div class="panel">${fold(
    'skills',
    `<h3><span class="pts">${run.sp} skill pts</span>${aff ? ` <span class="skaff">${aff} affordable</span>` : ''}</h3>`,
    `<p class="small mute">${svgI('active')} Active — fire in matches ${svgI('passive')} Passive — always on${info('Active techniques also switch on by themselves once your stats meet the requirement.')} <a href="#" onclick="navigate('encyclopedia');return false">Encyclopedia</a></p>
    <div class="skills compact">${ids
      .filter(id => SKILLS[id].tech)
      .map(card)
      .join('')}${ids
      .filter(id => !SKILLS[id].tech)
      .map(card)
      .join('')}</div>`,
    open || aff > 0
  )}</div>`;
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
/** Money and housing. Rent is paid on payday (every few weeks). */
function lifeCard(run) {
  const H = HOUSING[run.housing],
    next = Math.ceil(run.week / ECON.payEvery) * ECON.payEvery;
  return `<div class="panel life"><h3>Money${info(`Payday every ${ECON.payEvery} weeks: +$${ECON.allowance} allowance, −$${ECON.food} food, −rent. Run out of money and you're evicted to the abandoned gym. Prize money from matches.`)}</h3>
    <div class="small"><b>$${run.money.toLocaleString()}</b> · next payday week ${next}</div>
    <div class="homes">${HOUSEK.map(k => homeRow(run, k)).join('')}</div>
    <div class="small mute">${World.isFree(run) ? 'Free agent — no club yet' : `${esc(FACTIONS[run.team].name)}${info(`${FACTIONS[run.team].front}. Word is: ${FACTIONS[run.team].dark}.`)}`}</div></div>`;
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
  return `<div class="panel clubs">${fold(
    'clubs',
    `<h3>Find a club${info('You play Academy evaluations and the U21 Final Cup with the Academy squad until a club signs you. You take the same-role spot on the club.')}</h3>`,
    `<div class="clist">${[...run.teams]
      .sort((a, b) => World.canJoin(run, b.i).ok - World.canJoin(run, a.i).ok) // signable first
      .map(t => {
        const c = World.canJoin(run, t.i),
          f = FACTIONS[t.i],
          sub = t.name.startsWith(REGIONS[f.region].name) || t.name.startsWith(f.name.split(' · ')[0]) ? '' : `${esc(f.name)} · `; // "Wei Dynasty Gold" already says Wei Dynasty
        return `<div class="club rowcta" style="--tc:${t.color}"><div class="nm"><span class="n1">${chip(t)}<b>${esc(t.name)}</b> <span class="mute small">${sub}OVR ${t.ovr}</span>${info(`${f.front}. Word is: ${f.dark}.`)}</span>
          <span class="n2 small ${c.ok ? '' : 'mute'}">${World.joinText(t.i, run)}</span></div>
          <button class="btn ${c.ok ? 'hot' : 'lock'}" onclick="joinClub(${t.i})" ${c.ok ? '' : 'disabled'} ${c.ok ? '' : tip('Missing: ' + c.why.join(', '))}>${c.ok ? 'Sign' : esc(joinGap(run, t.i))}</button></div>`;
      })
      .join('')}</div>`,
    true
  )}</div>`;
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
    return `<div class="fac ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}"><div class="fh"><b><a href="#" class="dlink" onclick="hubOpen(null);openDossier('${r}');return false">${esc(F.name)}</a></b> <span class="mute small">${F.kind}</span>${F.weak ? ' <span class="stk far">Weakened</span>' : ''}${info(F.desc)}<span class="fv">${F.label} <b>${signed(v)}</b></span></div>
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
