// Career hub (spec §10.1): top bar (labelled resources, week, sheet tabs Me · People · World · Season, ⚙), the week
// rail on the left (you, the week's days, coach's goal, inbox, End week), the 3D map and the place panel over it.
// Tabs open the drawers until the sheets exist (T-122…T-125); ⚙ reaches every other drawer. Cards (events, match days,
// the Gazette) open over the map.

const HUB_DRAWERS = {
  places: ['📍', 'Places', run => placesCard(run)],
  season: ['📅', 'Season', run => `<div class="panel">${calendar(run)}</div>` + seasonCard(run) + matchLog(run)],
  news: [
    '📰',
    'Gazette',
    run =>
      run.gazette
        ? `<p class="small mute">Week ${run.gazette.week}</p><ul class="small">${run.gazette.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
        : '<p class="mute small">No Gazette yet — it comes out on payday.</p>'
  ],
  diary: [
    '📜',
    'Diary',
    run =>
      `<ol class="log tagged">${run.log.map(l => logLi(l.t, `<b>${typeof l.w === 'number' ? 'W' + l.w : esc(l.w)}</b> `)).join('')}</ol>`
  ],
  menu: [
    '⚙',
    'Menu',
    () => `<div class="menu-list"><h3>More</h3>${MORE_DRAWERS.map(
      k => `<button class="btn" onclick="hubOpen('${k}')">${HUB_DRAWERS[k][0]} ${HUB_DRAWERS[k][1]}</button>`
    ).join(
      ''
    )}<h3>Game</h3><button class="btn" onclick="navigate('menu')">Main menu</button><button class="btn" onclick="openDebug()">Debug log</button>
      <p class="small mute" id="abandon"><button class="btn" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p></div>`
  ]
};

/** The top bar's sheet tabs (key 1–4) → the drawer each opens until its sheet is built; ⚙ lists the rest. */
const HUB_TABS = [
  ['me', 'Me'],
  ['people', 'People'],
  ['world', 'World'],
  ['season', 'Season']
];
const MORE_DRAWERS = ['places', 'news', 'diary'];
/** Sheets (spec §10.4): open over the map with the rail and top bar visible; a tab whose sheet exists opens it. */
const HUB_SHEETS = {
  me: ['Me', run => sheetMe(run)],
  people: ['People', run => sheetPeople(run)],
  world: ['World', run => sheetWorld(run)]
};
/** Open the World sheet on one tab (factions / clubs / rank); never toggles. */
function worldTab(k) {
  CW.wtab = k;
  if (k !== 'factions') CW.dossier = null;
  CW.sheet = 'world';
  CW.drawer = null;
  renderCareer();
}
function hubSheet(run) {
  const [name, body] = HUB_SHEETS[CW.sheet];
  return `<section class="sheet" aria-label="${name}"><button class="btn x" onclick="hubOpen(null)" aria-label="Close">✕</button>${body(run)}</section>`;
}

function renderCareer() {
  A = null;
  RUN = RUN || Run.load();
  if (!RUN) return navigate('create');
  if (RUN.result) return renderRunEnd();
  const run = RUN,
    team = Run.myTeam(run);
  if (!CW.snap || CW.snap.run !== run || CW.snap.key !== briefKey(run)) CW.snap = weekSnap(run); // the Week report's baseline
  const armed = Date.now() - CW.endArm < 4000; // End week asked once with days left: the button asks again for 4 s
  // a place changed hands since the last render (your battle or the week's end): banner + select it on the map
  const own = run.own || {},
    chg = CW.ownOf === run ? ownChanges(CW.own, own) : [],
    note = chg[0] || null;
  CW.own = { ...own };
  CW.ownOf = run;
  if (note && MapModel.known(run, note.id, City.at(run, note.id))) CW.spot = note.id;
  for (const z of chg) (CW.seizes || (CW.seizes = [])).unshift({ ...z, week: run.week }); // an inbox item for a week
  const nextCup = Run.weekType(run) === 'cup' && !run.event ? Cup.upcoming(run) : null; // rules first, then draw
  const card = hubCard(run, nextCup);
  $('#app').innerHTML = `<section class="career hub ${City.night(run) ? 'eve' : ''}" style="--tc:${team.color}">
    ${topBar(run)}${weekRail(run, armed)}
    <div class="mapwrap" id="mapwrap"></div>
    <div class="hud spotcard ${CW.spot && !card ? 'open' : ''}" id="spot">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${CW.sheet ? hubSheet(run) : ''}
    ${CW.drawer ? hubDrawer(run) : ''}
    ${card ? `<div class="hubmodal ${card.dim ? 'dim' : ''}"><div class="hubcard ${card.cls || ''}">${card.html}</div></div>` : ''}
  </section>`;
  mapMount(run);
}

/** A card over the map, if the week needs one: an event, a match day, or an unread Gazette. */
function hubCard(run, nextCup) {
  const wt = Run.weekType(run);
  if (run.event) return { html: eventCard(run), dim: true }; // the only blocking card
  if (CW.recap) return { html: recapCard(run), dim: true }; // last week's report first
  if (CW.briefWeek !== briefKey(run)) return { html: weekBrief(run), dim: true };
  if (wt === 'cup') return { html: cupPanel(run, nextCup), cls: 'wide' };
  if (wt === 'eval') return { html: evalPanel(run, World.isFree(run) ? hubClubsHint() : '') };
  return null;
}
/** One Week brief per week (and per cup round). */
const briefKey = run => `${run.week}:${(Run.cupDef(run) || {}).id || ''}`;
/** The Week brief (spec §10.5): what this week holds — battle, payday, goal, match — and how to start it. Never acts. */
function weekBrief(run) {
  const wt = Run.weekType(run),
    match = wt === 'cup' || wt === 'eval',
    rows = [],
    row = (ico, title, sub, tag, cls = '') =>
      rows.push(
        `<div class="bi"><span class="bico ${cls}">${ico}</span><div><b>${title}</b>${sub ? `<div class="small mute">${sub}</div>` : ''}</div>${tag ? `<span class="btag ${cls}">${tag}</span>` : '<span></span>'}</div>`
      );
  if (wt === 'eval') {
    const e = run.eval || Eval.setup(run);
    row(
      '⚑',
      `Evaluation · ${esc(e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name)}`,
      `${esc(Run.myTeam(run).name)} vs ${esc(REGIONS[e.region].name)}${City.venue(run) ? ` · ${esc(VENUES[City.venue(run)].name)}` : ''}`,
      'this week'
    );
  } else if (wt === 'cup') row('⚑', esc((Run.cupDef(run) || {}).name || 'Cup'), 'Your next round is on the match card', 'this week', 'hot');
  const c = City.clashSite(run);
  if (c && !run.clash.done) {
    const att = run.clash.att || c.a,
      def = att === c.a ? c.b : c.a,
      k = Front.stakes(run, att, def);
    row(
      '⚔',
      `${chip(REGIONS[att])}${esc(REGIONS[att].name)} raid ${chip(REGIONS[def])}${esc(REGIONS[def].name)}`,
      `${esc(c.name)} · Seize ${Math.max(0, Front.meter(run, att, def))}/${FRONT.seize}${k.seize && k.place ? ` · a win takes ${esc(SPOTS[k.place].name)}` : ''} · nobody shows up? they settle it at the week's end`,
      'street battle',
      'warn'
    );
  }
  if (run.gazette && !run.gazette.read) {
    const pay = run.log.find(l => /^Payday:/.test(l.t));
    row('☰', 'Payday · the Gazette is out', pay ? esc(pay.t.replace(/^Payday: /, '')) : '', 'payday');
  }
  const g = run.goal;
  if (g && g.done == null) {
    const left = g.by - run.week;
    row(
      '◎',
      `Coach's goal · ${esc(Goals.text(run, g))}`,
      `${esc(Goals.progress(run, g))} · due week ${g.by}`,
      left <= 0 ? 'this week' : `${left} week${left > 1 ? 's' : ''}`,
      left <= 1 ? 'warn' : ''
    );
  }
  if (!match && CALENDAR[run.week + 1] === 'eval') row('⚑', 'Evaluation next week', 'Match weeks have no training days', 'next week');
  const title = { train: 'Training week', camp: 'Training camp', eval: 'Evaluation week', cup: 'Cup week' }[wt] || 'This week',
    line = match ? 'Match weeks have no training days.' : `${WEEK_DAYS} days. Every action takes a day, plus the trip there.`;
  return `<div class="panel brief"><div class="lab">Week ${Math.min(run.week, CAREER.weeks)} of ${CAREER.weeks}</div><h2>${title}</h2><p class="small mute">${line}</p>
    ${rows.join('') || '<p class="small mute">A quiet week.</p>'}
    <div class="acts ${run.gazette && !run.gazette.read ? 'pri' : ''}"><button class="btn hot" onclick="briefDone()">${match ? 'Go to match prep' : 'Start the week'}</button>${
      run.gazette && !run.gazette.read ? '<button class="btn" onclick="briefDone(\'news\')">Read the Gazette</button>' : ''
    }</div></div>`;
}
/** Close the brief (the battle stays on the map and in the inbox); `open` = a drawer to open next. */
function briefDone(open) {
  CW.briefWeek = briefKey(RUN);
  if (RUN.clash && !RUN.clash.seen) {
    RUN.clash.seen = true; // the old battle intro's flag: the brief told you
    Run.save(RUN);
  }
  if (open) return hubOpen(open);
  renderCareer();
}
const hubClubsHint = () =>
  `<p class="small mute">Free agent — <a href="#" onclick="worldTab('clubs');return false">find a club</a> first to play with them.</p>`;

/** Top bar: brand, week, labelled resources (one-render deltas), the sheet tabs and ⚙. */
function topBar(run) {
  const staPct = Math.round((run.sta / run.staMax) * 100),
    mood = MOODS[run.mood],
    now = { money: run.money, fans: run.fans, sp: run.sp, sta: run.sta, mood: run.mood },
    prev = CW.hudOf === run ? CW.hudPrev : null,
    d = k => {
      const v = prev ? now[k] - prev[k] : 0;
      if (!v) return '';
      const n = k === 'mood' ? (v > 0 ? '↑' : '↓') : `${v > 0 ? '+' : '−'}${k === 'money' ? '$' : ''}${Math.abs(v).toLocaleString()}`;
      return ` <em class="hd ${v > 0 ? 'up' : 'dn'}">${n}</em>`;
    },
    cell = (label, val, t) => `<div class="tres" ${tip(t)}><small>${label}</small><b>${val}</b></div>`,
    cup = Run.cupDef(run),
    people = Asks.count(run);
  CW.hudPrev = now; // deltas show for one render after a change
  CW.hudOf = run;
  return `<header class="tbar">
    <span class="tbrand">Spite &amp; Spike</span>
    <div class="tres-row">
      ${cell('Week', `<span class="disp">${cup ? esc(cup.short) : `${run.week} / ${CAREER.weeks}`}</span>`, `Week ${run.week} of ${CAREER.weeks}`)}
      ${cell('Money', `$${run.money.toLocaleString()}${d('money')}`, 'Money')}
      ${cell('Fans', `${run.fans.toLocaleString()}${d('fans')}`, 'Fans')}
      ${cell('Skill pts', `${run.sp}${d('sp')}`, 'Skill points')}
      ${cell('Stamina', `<span class="sbar ${staPct < 50 ? 'low' : ''}"><i style="width:${staPct}%"></i></span><span class="${staPct < 50 ? 'warn' : ''}">${run.sta}</span>${d('sta')}`, `Stamina ${run.sta}/${run.staMax}`)}
      ${cell('Mood', `<span class="mood m${run.mood}">${mood.name}</span>${d('mood')}`, 'Mood')}
    </div>
    <nav class="ttabs" aria-label="Sheets">${HUB_TABS.map(
      ([k, n], i) =>
        `<button class="btn ${CW.drawer === k || CW.sheet === k ? 'on' : ''}" onclick="hubOpen('${k}')">${n} <kbd>${i + 1}</kbd>${k === 'people' && people ? `<em class="badge">${people}</em>` : ''}</button>`
    ).join(
      ''
    )}<button class="btn ${CW.drawer === 'menu' || MORE_DRAWERS.includes(CW.drawer) ? 'on' : ''}" onclick="hubOpen('menu')" aria-label="Settings and more">⚙</button></nav>
  </header>`;
}
/** The week rail: you and your 4 stats, the week's days, the coach's goal, the inbox, End week. */
function weekRail(run, armed) {
  const you = Run.you(run),
    team = Run.myTeam(run),
    wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    eve = !match && days <= 0;
  return `<aside class="wrail" aria-label="This week">
    <button class="wme" onclick="hubOpen('me')" aria-label="Your player"><span class="portrait">${faceSVG(you, MOODS[run.mood].form, 44)}</span>
      <span><b>${stag(you)}${esc(you.name)}</b><small>${ROLE_NAME[you.role]} · ${chip(team)}${esc(team.short)} · OVR ${ovr(you)}</small></span></button>
    <div class="wstats">${STATK.map(k => `<span><small>${STATNAME[k]}</small><b>${you[k]}</b><i class="mbar4"><i style="width:${Math.min(100, you[k])}%"></i></i></span>`).join('')}</div>
    ${weekSection(run)}
    ${railGoal(run)}
    <section class="winbox"><div class="lab">Inbox</div>${inboxRows(run)}</section>
    ${
      !match && !run.event
        ? `<div class="acts wend"><button class="btn ${eve ? 'hot' : ''} endw" onclick="mapEndWeek()" ${tip(eve ? 'Sleep: start the next week' : `Skip the ${days} day${days > 1 ? 's' : ''} left`)}>${
            armed
              ? `Skip ${days} day${days > 1 ? 's' : ''}? Click again`
              : `End week${days > 0 ? ` · ${days} day${days > 1 ? 's' : ''} unused` : ''}`
          } <kbd>Space</kbd></button></div>`
        : ''
    }
  </aside>`;
}
/** "This week · {type}", days left and the day track. */
function weekSection(run) {
  const wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    kind = { train: 'training', camp: 'training camp', eval: 'evaluation', cup: 'cup' }[wt] || wt;
  return `<section class="wweek"><div class="wh"><span class="lab">This week · ${kind}</span><span class="small mute">${match ? 'Match' : `${days} of ${WEEK_DAYS} days left`}</span></div>
      ${dayTrack(run, match)}</section>`;
}
/** Icons of the day-track entries (line icons come with T-111). */
const DAY_ICON = { train: '✸', rest: '☾', outing: '◐', trip: '↗', scout: '◉', battle: '⚔', challenge: '⚔', day: '•' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** The day track (spec §10.2): what each spent day was, trips hatched, free days empty, the selected place's cost as ghost slots. */
function dayTrack(run, match) {
  if (match) return '<div class="wdays"><div class="dslot match">⚑ Match day</div></div>';
  const spent = WEEK_DAYS - City.days(run),
    log = (run.dayLog || []).slice(0, spent),
    filled = Array.from({ length: spent }, (_, i) => log[i] || { k: 'day', label: '' }), // days spent before the log existed
    ghost = spotGhost(run, CW.spot).slice(0, WEEK_DAYS - spent),
    slot = (e, cls) =>
      `<div class="dslot ${cls} ${e.k}" ${e.at ? tip(e.at) : ''}><i>${DAY_ICON[e.k] || '•'}</i><b>${esc(e.label || '')}</b></div>`,
    free = Array.from({ length: WEEK_DAYS - spent - ghost.length }, () => '<div class="dslot">free</div>');
  return `<div class="wdn">${WEEKDAYS.map(d => `<span>${d}</span>`).join('')}</div><div class="wdays" id="wdays">${filled
    .map(e => slot(e, 'done'))
    .join('')}${ghost.map(e => slot(e, 'ghost')).join('')}${free.join('')}</div>${
    ghost.length ? `<p class="small wuse">Uses ${ghost.map((e, i) => WEEKDAYS[spent + i]).join(' + ')} — shown on your week</p>` : ''
  }`;
}
/** Coach's goal card in the rail (click: Season). */
function railGoal(run) {
  const g = run.goal;
  if (!g || g.done != null) return '';
  const soon = g.by - run.week <= 1,
    m = /(\d[\d,]*) \/ (\d[\d,]*)/.exec(Goals.progress(run, g) || ''),
    pct = m ? Math.min(100, (100 * +m[1].replace(/,/g, '')) / Math.max(1, +m[2].replace(/,/g, ''))) : 0;
  return `<button class="wgoal" onclick="hubOpen('season')"><span class="wh"><span class="lab">Coach's goal</span><span class="small ${soon ? 'warn' : 'mute'}">by week ${g.by}</span></span>
    <span class="wg1">${esc(Goals.text(run, g))}</span>${m ? `<i class="mbar4"><i style="width:${pct}%"></i></i>` : ''}<span class="small mute">${esc(Goals.progress(run, g))}</span></button>`;
}
/** The rail inbox (spec §10.3): what waits for you, one button each, until handled. Max 5; the suggested next step first. */
function inboxRows(run) {
  const rows = [],
    item = (ico, text, sub, btn, act, cls = '') =>
      rows.push(
        `<div class="wit ${cls}"><span class="wico">${ico}</span><span class="wtx">${text}${sub ? `<small>${sub}</small>` : ''}</span><button class="btn" onclick="${act}">${btn}</button></div>`
      ),
    n = nextStep(run);
  if (CW.flash) rows.push(`<div class="wit bad"><span class="wico">✕</span><span class="wtx">${esc(CW.flash)}</span><span></span></div>`); // a refused action, one render
  CW.flash = null;
  if (n && n.act && !/Gazette|signing open/.test(n.text)) item('→', esc(n.text), 'Suggested next step', 'Go', n.act, 'next');
  const c = City.clashSite(run);
  if (c && !run.clash.done)
    item(
      '⚔',
      `${esc(REGIONS[c.a].name.split(' ')[0])} vs ${esc(REGIONS[c.b].name.split(' ')[0])} · ${esc(c.name)}`,
      `Street battle · ${City.clashCost(run)} day${City.clashCost(run) > 1 ? 's' : ''} away`,
      'View',
      "mapPick('clash')"
    );
  const asks = Asks.count(run);
  if (asks) item('✉', `${asks} approach${asks > 1 ? 'es' : ''} waiting`, 'Expires at the end of the week', 'Answer', "hubOpen('people')");
  if (run.gazette && !run.gazette.read) item('☰', 'The Gazette is out', `Week ${run.gazette.week}`, 'Read', "hubOpen('news')");
  const wt = Run.weekType(run);
  if ((wt === 'train' || wt === 'camp') && CALENDAR[run.week + 1] === 'eval')
    item('⚑', 'Evaluation next week', 'Match weeks have no training days', 'Season', "hubOpen('season')");
  const g = run.goal;
  if (g && g.done == null && g.by - run.week <= 1)
    item(
      '◎',
      `Goal due ${g.by === run.week ? 'this week' : 'next week'}`,
      `${esc(Goals.text(run, g))} · ${esc(Goals.progress(run, g))}`,
      'View',
      "hubOpen('season')",
      'warn'
    );
  if (World.isFree(run)) {
    const t = run.teams.find(t2 => World.canJoin(run, t2.i).ok);
    if (t) item('🛡', `${esc(t.name)} would sign you`, 'Signing open', 'Clubs', "worldTab('clubs')");
  }
  for (const z of (CW.seizes || []).filter(x => run.week - x.week <= 1))
    item('⚑', esc(z.text), 'A place changed hands', 'Show', `mapPick('${z.id}')`);
  return rows.slice(0, 5).join('') || '<p class="small mute">Nothing waiting.</p>';
}
/**
 * One suggested next step (a suggestion only: the chip selects a place or opens a drawer, never acts). First match wins:
 * an unread Gazette; the next evaluation / cup within 3 weeks of a training week; a club that would sign you; night.
 */
function nextStep(run) {
  if (run.gazette && !run.gazette.read) return { text: 'Gazette out', act: "hubOpen('news')" };
  const wt = Run.weekType(run),
    you = Run.you(run),
    key = KEYSTAT[you.role];
  if (wt === 'train' || wt === 'camp') {
    let w = run.week;
    while (w <= run.week + 3 && CALENDAR[w] !== 'eval' && w <= CAREER.weeks) w++;
    const what = w > CAREER.weeks ? 'Cup' : CALENDAR[w] === 'eval' && w <= run.week + 3 ? 'Evaluation' : '';
    if (what && STATK.includes(key)) {
      const spot = Object.keys(SPOTS)
        .filter(id => SPOTS[id].train && TRAININGS[SPOTS[id].train].main[0] === key && MapModel.known(run, id, City.at(run, id)))
        .sort((a, b) => City.cost(run, a) - City.cost(run, b))[0];
      return {
        text: `${what}${what === 'Cup' ? '' : ` W${w}`} · ${STATNAME[key]} ${you[key]}`,
        act: spot ? `mapPick('${spot}')` : ''
      };
    }
  }
  if (World.isFree(run)) {
    const t = run.teams.find(t2 => World.canJoin(run, t2.i).ok);
    if (t) return { text: `${t.name}: signing open`, act: "worldTab('clubs')" };
  }
  if (wt !== 'cup' && wt !== 'eval' && City.days(run) <= 0) return { text: 'Night · end the week', act: '' };
  return null;
}
function hubDrawer(run) {
  const [ic, name, body] = HUB_DRAWERS[CW.drawer];
  return `<aside class="drawer" aria-label="${name}"><div class="dhd"><h3>${ic} ${name}</h3><button class="btn x" onclick="hubOpen(null)" aria-label="Close">✕</button></div><div class="dbody">${body(run)}</div></aside>`;
}

/** Hub keys: 1–4 open the sheet tabs, Space ends the week, Esc closes the drawer, then the place card. */
function hubKey(e) {
  if (A || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.career.hub') || $('#dbg') || (CW.dossier && e.key === 'Escape'))
    return;
  if (e.target.closest && e.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
  if (e.key === 'Escape') {
    if (CW.drawer || CW.sheet) hubOpen(null);
    else if (CW.spot) {
      CW.spot = null;
      renderCareer();
    }
  } else if (e.key === ' ' && document.querySelector('.hub .endw') && !document.querySelector('.hubmodal')) {
    e.preventDefault();
    mapEndWeek();
  } else if (/^[1-4]$/.test(e.key) && !document.querySelector('.hubmodal')) hubOpen(HUB_TABS[+e.key - 1][0]);
}
document.addEventListener('keydown', hubKey);

/** Every place the map shows, by region: the non-map way to find where to go (a row selects it on the map). */
function placesCard(run) {
  const pins = MapModel.pins(run).filter(p => p.kind !== 'clash'),
    by = {};
  for (const p of pins) (by[City.regionAt(p.at)] = by[City.regionAt(p.at)] || []).push(p);
  const row = p => {
    const s = SPOTS[p.id],
      what =
        s && s.train
          ? `Trains ${STATNAME[TRAININGS[s.train].main[0]]}`
          : p.kind === 'hq'
            ? 'Club HQ'
            : p.kind === 'venue'
              ? 'Venue'
              : s
                ? esc(s.desc || '')
                : '',
      own = s && s.region ? Front.owner(run, p.id) : null,
      trip = City.trip(run, p.at),
      name = s ? s.name : p.title;
    return `<button class="plrow" onclick="placeGo('${esc(p.id)}')"><span class="pi">${p.icon}</span><span class="nm"><b>${esc(name)}</b><span class="small mute">${what}${
      own ? ` · ${chip(REGIONS[own])}${esc(REGIONS[own].name)}` : ''
    }</span></span><span class="small">${trip ? `Trip ${trip}d` : 'Here'}</span></button>`;
  };
  return `<div class="panel places">${Object.keys(by)
    .map(r => `<h3>${esc((REGIONS[r] || REGIONS.open).name)}</h3>${by[r].map(row).join('')}`)
    .join('')}</div>`;
}
function placeGo(id) {
  CW.drawer = null;
  CW.spot = id;
  renderCareer(); // the map flies to the selection
}

function hubOpen(k) {
  if (k && HUB_SHEETS[k]) {
    CW.sheet = CW.sheet === k ? null : k; // the tab toggles its sheet
    CW.drawer = null;
  } else {
    CW.drawer = k && CW.drawer !== k ? k : null;
    if (k) CW.sheet = null;
    if (!k) CW.sheet = null;
  }
  if (k === 'news' && Run.readGazette(RUN)) Run.save(RUN);
  renderCareer();
}
Screens.career = renderCareer;
