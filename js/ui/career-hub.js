// Career hub (spec §10.1): top bar (labelled resources, week, sheet tabs Me · People · World · Season, ⚙), the week
// rail on the left (you, the week's days, coach's goal, inbox, End week), the 3D map and the place panel over it.
// Tabs open the sheets (Me, People, World, Season); ⚙ is a small pop-over (Main menu, Debug log with ?dev, Abandon run).
// Cards (events, match days, the week brief/report) open over the map.

/** The top bar's sheet tabs (key 1–4). */
const HUB_TABS = [
  ['me', 'Me'],
  ['people', 'People'],
  ['world', 'World'],
  ['season', 'Season']
];
/** Sheets (spec §10.4): open over the map with the rail and top bar visible; a tab whose sheet exists opens it. */
const HUB_SHEETS = {
  me: ['Me', run => sheetMe(run)],
  people: ['People', run => sheetPeople(run)],
  world: ['World', run => sheetWorld(run)],
  season: ['Season', run => sheetSeason(run)]
};
/** Open the World sheet on one tab (factions / clubs / rank); never toggles. */
function worldTab(k) {
  CW.wtab = k;
  if (k !== 'factions') CW.dossier = null;
  CW.sheet = 'world';
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
  if (CW.railMini == null) CW.railMini = store.get(KEYS.rail) === '1'; // remembered per browser
  $('#app').innerHTML =
    `<section class="career hub ${City.night(run) ? 'eve' : ''} ${CW.railMini ? 'railmini' : ''}" style="--tc:${team.color}">
    ${topBar(run)}${CW.railMini ? railStrip(run, armed) : weekRail(run, armed)}
    <div class="mapwrap" id="mapwrap"></div>${mapLegend()}
    <div class="hud spotcard ${CW.spot && !card ? 'open' : ''}" id="spot">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${CW.sheet ? hubSheet(run) : ''}
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
        `<div class="bi"><span class="bico ${cls}">${ico}</span><div><b>${title}</b>${Array.isArray(sub) ? kv(sub) : sub ? `<div class="small mute">${sub}</div>` : ''}</div>${tag ? `<span class="btag ${cls}">${tag}</span>` : '<span></span>'}</div>`
      );
  if (wt === 'eval') {
    const e = run.eval || Eval.setup(run);
    row(
      '⚑',
      `Evaluation · ${esc(e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name)}`,
      [['Opponent', `${esc(REGIONS[e.region].name)} squad`], City.venue(run) ? ['Venue', esc(VENUES[City.venue(run)].name)] : null],
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
      [
        ['Where', esc(c.name)],
        ['Border', clashBorder(run, att, def)],
        k.seize && k.place ? ['A win takes', esc(SPOTS[k.place].name)] : null,
        ['If nobody joins', "Settled at the week's end"]
      ],
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
      [
        ['Progress', esc(Goals.progress(run, g))],
        ['Due', `Week ${g.by}`]
      ],
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
/** Close the brief (the battle stays on the map and in the inbox); `open` = a sheet to open next. */
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
    cell = (label, val, t, id) =>
      `<div class="tres" ${tip(id ? GLOSSARY[id].long : t)}><small>${id ? statI(statKey(id), 14) : ''}${label}</small><b>${val}</b></div>`,
    cup = Run.cupDef(run),
    people = Asks.count(run);
  CW.hudPrev = now; // deltas show for one render after a change
  CW.hudOf = run;
  return `<header class="tbar">
    <span class="tbrand">Spite &amp; Spike</span>
    <div class="tres-row">
      ${cell('Week', `<span class="disp">${cup ? esc(cup.short) : `${run.week} / ${CAREER.weeks}`}</span>`, `Week ${run.week} of ${CAREER.weeks}`)}
      ${cell('Money', `$${run.money.toLocaleString()}${d('money')}`, 'Money', 'money')}
      ${cell('Fans', `${run.fans.toLocaleString()}${d('fans')}`, 'Fans', 'fans')}
      ${cell('Skill pts', `${run.sp}${d('sp')}`, 'Skill points', 'sp')}
      ${cell('Stamina', `<span class="sbar ${staPct < 50 ? 'low' : ''}"><i style="width:${staPct}%"></i></span><span class="${staPct < 50 ? 'warn' : ''}">${run.sta}</span>${d('sta')}`, `Stamina ${run.sta}/${run.staMax}`, 'sta')}
      ${cell('Mood', `<span class="mood m${run.mood}">${mood.name}</span>${d('mood')}`, 'Mood', 'mood')}
    </div>
    <nav class="ttabs" aria-label="Sheets">${HUB_TABS.map(
      ([k, n], i) =>
        `<button class="btn ${CW.sheet === k ? 'on' : ''}" onclick="hubOpen('${k}')">${n} <kbd>${i + 1}</kbd>${k === 'people' && people ? `<em class="badge">${people}</em>` : ''}</button>`
    ).join(
      ''
    )}<button class="btn ${CW.gear ? 'on' : ''}" onclick="gearToggle()" aria-label="Settings">⚙</button></nav>${CW.gear ? gearPop() : ''}
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
    <div class="wtop"><button class="wme" onclick="hubOpen('me')" aria-label="Your player"><span class="portrait">${faceSVG(you, MOODS[run.mood].form, 44)}</span>
      <span><b>${stag(you)}${esc(you.name)}</b><small>${ROLE_NAME[you.role]} · ${chip(team)}${esc(team.short)} · OVR ${ovr(you)}</small></span></button>
      <button class="btn wfold" onclick="railToggle()" aria-label="Collapse the week rail ([)">« <kbd>[</kbd></button></div>
    <div class="wstats">${STATK.map(k => `<span ${tip(GLOSSARY[k].long)}><small>${statI(statKey(k), 14)}${STATNAME[k]}</small><b>${you[k]}</b><i class="mbar4"><i style="width:${Math.min(100, you[k])}%"></i></i></span>`).join('')}</div>
    ${weekSection(run)}
    ${railGoal(run)}
    <section class="winbox"><div class="lab">Inbox</div>${inboxRows(run)}</section>
    ${
      !match && !run.event
        ? `<div class="acts wend"><button class="btn ${eve ? 'hot' : ''} endw" onclick="mapEndWeek()" ${endTip(days, eve)}>${
            armed
              ? `Skip ${days} day${days > 1 ? 's' : ''}? Click again`
              : `End week${days > 0 ? ` · ${days} day${days > 1 ? 's' : ''} unused` : ''}`
          } <kbd>Space</kbd></button></div>`
        : ''
    }
  </aside>`;
}
const endTip = (days, eve) => tip(eve ? 'Sleep: start the next week' : `Skip the ${days} day${days > 1 ? 's' : ''} left`);
/**
 * The folded rail (spec §10.1, 72px): face (→ Me), days left, the 7 day cells stacked, goal (→ Season), inbox with
 * its count (→ unfolds the rail), End week (same two-click arm and Space). Nothing in the rail is out of reach.
 */
function railStrip(run, armed) {
  const you = Run.you(run),
    wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    eve = !match && days <= 0,
    g = run.goal && run.goal.done == null ? run.goal : null,
    soon = g && g.by - run.week <= 1,
    n = inboxItems(run).length,
    cells = match
      ? '<div class="dslot match" title="Match week">⚑</div>'
      : weekCells(run)
          .map(
            ([e, cls]) =>
              `<div class="dslot ${cls} ${e ? e.k : ''}" ${e && (e.at || e.label) ? tip(e.at || e.label) : ''}>${e ? `<i>${DAY_ICON[e.k] || '•'}</i>` : ''}</div>`
          )
          .join('');
  return `<aside class="wrail mini" aria-label="This week">
    <button class="btn wfold" onclick="railToggle()" aria-label="Expand the week rail ([)">» <kbd>[</kbd></button>
    <button class="wme" onclick="hubOpen('me')" aria-label="Your player" ${tip(you.name)}><span class="portrait">${faceSVG(you, MOODS[run.mood].form, 40)}</span></button>
    <div class="wleft"><b>${match ? '⚑' : days}</b><small>${match ? 'match' : 'left'}</small></div>
    <div class="wdays">${cells}</div>
    ${g ? `<button class="wicon ${soon ? 'warn' : ''}" onclick="hubOpen('season')" aria-label="Coach's goal" ${tip(`Coach's goal: ${Goals.text(run, g)}, by week ${g.by}`)}>◎</button>` : ''}
    <button class="wicon" onclick="railToggle()" aria-label="Inbox: ${n} waiting" ${tip(`Inbox · ${n} waiting`)}>✉${n ? `<em class="badge">${n}</em>` : ''}</button>
    ${
      !match && !run.event
        ? `<button class="btn ${eve ? 'hot' : ''} endw wicon" onclick="mapEndWeek()" aria-label="End week (Space)" ${endTip(days, eve)}>${armed ? 'Skip?' : '☾'}<kbd>Space</kbd></button>`
        : ''
    }
  </aside>`;
}
/** Fold / unfold the week rail (« / », key `[`); the map resizes into the space (MapView keeps its one canvas). */
function railToggle() {
  CW.railMini = !CW.railMini;
  store.set(KEYS.rail, CW.railMini ? '1' : '0');
  renderCareer();
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
    cells = weekCells(run),
    ghost = cells.filter(c => c[1] === 'ghost');
  return `<div class="wdn">${WEEKDAYS.map(d => `<span>${d}</span>`).join('')}</div><div class="wdays" id="wdays">${cells
    .map(([e, cls]) =>
      e
        ? `<div class="dslot ${cls} ${e.k}" ${e.at ? tip(e.at) : ''}><i>${DAY_ICON[e.k] || '•'}</i><b>${esc(e.label || '')}</b></div>`
        : '<div class="dslot">free</div>'
    )
    .join(
      ''
    )}</div>${ghost.length ? `<p class="small wuse">Uses ${ghost.map((c, i) => WEEKDAYS[spent + i]).join(' + ')} — shown on your week</p>` : ''}`;
}
/** The week's 7 cells as [entry, 'done' | 'ghost' | 'free'] (entry null = a free day): spent days, the selected place's ghost, free. */
function weekCells(run) {
  const spent = WEEK_DAYS - City.days(run),
    log = (run.dayLog || []).slice(0, spent),
    ghost = spotGhost(run, CW.spot).slice(0, WEEK_DAYS - spent);
  return [
    ...Array.from({ length: spent }, (_, i) => [log[i] || { k: 'day', label: '' }, 'done']), // days spent before the log existed
    ...ghost.map(e => [e, 'ghost']),
    ...Array.from({ length: WEEK_DAYS - spent - ghost.length }, () => [null, 'free'])
  ];
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
  return inboxItems(run).slice(0, 5).join('') || '<p class="small mute">Nothing waiting.</p>';
}
/** The inbox items as HTML rows (all of them; the rail shows 5, the folded rail counts them). */
function inboxItems(run) {
  const rows = [],
    item = (ico, text, sub, btn, act, cls = '') =>
      rows.push(
        `<div class="wit ${cls}"><span class="wico">${ico}</span><span class="wtx">${text}${Array.isArray(sub) ? kv(sub) : sub ? `<small>${sub}</small>` : ''}</span><button class="btn" onclick="${act}">${btn}</button></div>`
      ),
    n = nextStep(run);
  if (CW.flash) rows.push(`<div class="wit bad"><span class="wico">✕</span><span class="wtx">${esc(CW.flash)}</span><span></span></div>`); // a refused action, one render
  CW.flash = null;
  if (n && n.act && !/Gazette|signing open/.test(n.text)) item('→', esc(n.text), 'Suggested next step', 'Go', n.act, 'next');
  const c = City.clashSite(run);
  if (c && !run.clash.done) {
    const att = run.clash.att || c.a,
      def = att === c.a ? c.b : c.a,
      trip = City.clashCost(run) - 1;
    item(
      '⚔',
      'Street battle',
      [
        ['Sides', `${esc(REGIONS[c.a].name.split(' ')[0])} vs ${esc(REGIONS[c.b].name.split(' ')[0])}`],
        ['Where', esc(c.name)],
        ['Border', clashBorder(run, att, def)],
        ['Trip', trip ? `${trip} day${trip > 1 ? 's' : ''}` : 'None']
      ],
      'View',
      "mapPick('clash')"
    );
  }
  const asks = Asks.count(run);
  if (asks) item('✉', `${asks} approach${asks > 1 ? 'es' : ''} waiting`, 'Expires at the end of the week', 'Answer', "hubOpen('people')");
  if (run.gazette && !run.gazette.read) item('☰', 'The Gazette is out', `Week ${run.gazette.week}`, 'Read', "hubOpen('news')");
  const wt = Run.weekType(run);
  if ((wt === 'train' || wt === 'camp') && CALENDAR[run.week + 1] === 'eval')
    item('⚑', 'Evaluation next week', evalNext(run), 'Season', "hubOpen('season')");
  const g = run.goal;
  if (g && g.done == null && g.by - run.week <= 1)
    item(
      '◎',
      `Goal due ${g.by === run.week ? 'this week' : 'next week'}`,
      [
        ['Goal', esc(Goals.text(run, g))],
        ['Progress', esc(Goals.progress(run, g))],
        ['Due', `Week ${g.by}`]
      ],
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
  return rows;
}
/** Next week's evaluation as facts (the squads are drawn that week): opponent and venue; no evaluation for you → a note. */
function evalNext(run) {
  const kind = Eval.kind(run);
  if (!kind) return 'Match weeks have no training days';
  const region = FACTIONS[run.team] && FACTIONS[run.team].region,
    v = kind === 'academy' ? 'hall' : Object.keys(VENUES).find(id => VENUES[id].holds.includes(`eval:${region}`));
  return [
    ['Opponent', kind === 'academy' ? 'A faction squad, drawn that week' : `Another ${esc(REGIONS[region].name)} squad`],
    v ? ['Venue', esc(VENUES[v].name)] : null
  ];
}
/**
 * One suggested next step (a suggestion only: the chip selects a place or opens a sheet, never acts). First match wins:
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

/** Hub keys: 1–4 open the sheet tabs, `[` folds the week rail, Space ends the week, Esc closes ⚙, the sheet, then the place card. */
function hubKey(e) {
  if (A || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.career.hub') || $('#dbg') || (CW.dossier && e.key === 'Escape'))
    return;
  if (e.target.closest && e.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
  if (e.key === 'Escape') {
    if (CW.gear) gearToggle();
    else if (CW.sheet) hubOpen(null);
    else if (CW.spot) {
      CW.spot = null;
      renderCareer();
    }
  } else if (e.key === ' ' && document.querySelector('.hub .endw') && !document.querySelector('.hubmodal')) {
    e.preventDefault();
    mapEndWeek();
  } else if (e.key === '[') railToggle();
  else if (/^[1-4]$/.test(e.key) && !document.querySelector('.hubmodal')) hubOpen(HUB_TABS[+e.key - 1][0]);
}
document.addEventListener('keydown', hubKey);

/** The legend chips at the bottom of the map (places are found on the map only — spec §10.1). */
function mapLegend() {
  const regions = Object.keys(REGIONS).filter(r => REGIONS[r].kind !== 'none');
  return `<div class="maplegend"><span>🛡 Club HQ</span><span>🏟 Venue</span><span>⚔ Street battle</span>${regions
    .map(r => `<span>${chip(REGIONS[r])}${esc(REGIONS[r].name)}</span>`)
    .join('')}</div>`;
}

function hubOpen(k) {
  CW.gear = false;
  if (k === 'news' || k === 'diary') {
    CW.stab = k; // the Season sheet's Diary / Gazette tab
    k = 'season';
    CW.sheet = null;
  }
  CW.sheet = k && HUB_SHEETS[k] && CW.sheet !== k ? k : null; // a tab toggles its sheet; null closes
  renderCareer();
}
/** ⚙: a small pop-over under the top bar — Main menu, Debug log (only with ?dev), Abandon run (inline confirm). */
function gearToggle() {
  CW.gear = !CW.gear;
  renderCareer();
}
function gearPop() {
  return `<div class="gearpop" role="menu"><button class="btn" onclick="CW.gear=false;navigate('menu')">Main menu</button>${
    /[?&]dev\b/.test(location.search) ? '<button class="btn" onclick="CW.gear=false;openDebug()">Debug log</button>' : ''
  }<p class="small mute" id="abandon"><button class="btn quiet danger" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p></div>`;
}
Screens.career = renderCareer;
