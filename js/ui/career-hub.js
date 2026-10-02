// Career hub (spec §10.1): top bar (labelled resources, week, sheet tabs Me · People · World · Season, ⚙), the week
// rail on the left (you, the week's days, coach's goal, inbox, End week), the 3D map and the place panel over it.
// Tabs open the drawers until the sheets exist (T-122…T-125); ⚙ reaches every other drawer. Cards (events, match days,
// the Gazette) open over the map.

const HUB_DRAWERS = {
  me: ['👤', 'Player', run => youCard(run)], // the goal and sponsors live in Season
  places: ['📍', 'Places', run => placesCard(run)],
  team: ['🤝', 'Team', run => bondCard(run)],
  people: ['👥', 'People', run => peopleCard(run)],
  skills: ['✨', 'Skills', run => skillShop(run, true)],
  season: ['📅', 'Season', run => `<div class="panel">${calendar(run)}</div>` + seasonCard(run) + matchLog(run)],
  life: ['🏠', 'Life', run => lifeCard(run)],
  clubs: ['🛡', 'Clubs', run => clubsCard(run)],
  factions: ['⚖', 'Factions', run => factionsCard(run)],
  rank: ['🏅', 'Rankings', run => rankCard(run)],
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
    () => `<div class="menu-list"><h3>More</h3>${MORE_DRAWERS.filter(k => k !== 'clubs' || World.isFree(RUN))
      .map(k => `<button class="btn" onclick="hubOpen('${k}')">${HUB_DRAWERS[k][0]} ${HUB_DRAWERS[k][1]}</button>`)
      .join(
        ''
      )}<h3>Game</h3><button class="btn" onclick="navigate('menu')">Main menu</button><button class="btn" onclick="openDebug()">Debug log</button>
      <p class="small mute" id="abandon"><button class="btn" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p></div>`
  ]
};

/** The top bar's sheet tabs (key 1–4) → the drawer each opens until its sheet is built; ⚙ lists the rest. */
const HUB_TABS = [
  ['me', 'Me'],
  ['people', 'People'],
  ['factions', 'World'],
  ['season', 'Season']
];
const MORE_DRAWERS = ['places', 'skills', 'life', 'team', 'clubs', 'rank', 'news', 'diary'];

function renderCareer() {
  A = null;
  RUN = RUN || Run.load();
  if (!RUN) return navigate('create');
  if (RUN.result) return renderRunEnd();
  const run = RUN,
    team = Run.myTeam(run),
    last = run.log[0] ? run.log[0].t : null,
    toast = CW.toast !== undefined && CW.toast !== null && last !== CW.toast ? last : null;
  CW.toast = last;
  const armed = Date.now() - CW.endArm < 4000; // End week asked once with days left: the button asks again for 4 s
  // a place changed hands since the last render (your battle or the week's end): banner + select it on the map
  const own = run.own || {},
    chg = CW.ownOf === run ? ownChanges(CW.own, own) : [],
    note = chg[0] || null;
  CW.own = { ...own };
  CW.ownOf = run;
  if (note && MapModel.known(run, note.id, City.at(run, note.id))) CW.spot = note.id;
  if (CW.drawer === 'clubs' && !World.isFree(run)) CW.drawer = null;
  const nextCup = Run.weekType(run) === 'cup' && !run.event ? Cup.upcoming(run) : null; // rules first, then draw
  const card = hubCard(run, nextCup);
  $('#app').innerHTML = `<section class="career hub ${City.night(run) ? 'eve' : ''}" style="--tc:${team.color}">
    ${topBar(run)}${weekRail(run, armed)}
    <div class="mapwrap" id="mapwrap"></div>
    <div class="hud spotcard ${CW.spot && !card ? 'open' : ''}" id="spot">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${toast ? `<div class="htoast" role="status">${esc(toast)}</div>` : ''}
    ${note ? `<div class="hnote" role="status" style="--nc:${REGIONS[note.to].color}">⚔ ${esc(note.text)}</div>` : ''}
    ${CW.drawer ? hubDrawer(run) : ''}
    ${card ? `<div class="hubmodal ${card.dim ? 'dim' : ''}"><div class="hubcard ${card.cls || ''}">${card.html}</div></div>` : ''}
    ${CW.dossier && !card ? `<div class="hubmodal"><div class="hubcard wide">${dossierCard(run, CW.dossier)}</div></div>` : ''}
  </section>`;
  mapMount(run);
}

/** A card over the map, if the week needs one: an event, a match day, or an unread Gazette. */
function hubCard(run, nextCup) {
  const wt = Run.weekType(run);
  if (run.event) return { html: eventCard(run), dim: true };
  if (wt === 'cup') return { html: cupPanel(run, nextCup), cls: 'wide' };
  if (wt === 'eval') return { html: evalPanel(run, World.isFree(run) ? hubClubsHint() : '') };
  const c = City.clashSite(run);
  const att = c && (run.clash.att || c.a),
    def = c && (att === c.a ? c.b : c.a);
  if (c && !run.clash.seen)
    return {
      html: `<div class="panel ev"><span class="evk">Street battle</span><h3>${chip(REGIONS[att])}${esc(REGIONS[att].name)} raid ${chip(REGIONS[def])}${esc(REGIONS[def].name)} · ${esc(c.name)}</h3>
      <p class="seizeline">Seize ${Math.max(0, Front.meter(run, att, def))}/${FRONT.seize}${
        Front.stakes(run, att, def).seize && Front.stakes(run, att, def).place
          ? ` · a win takes ${esc(SPOTS[Front.stakes(run, att, def).place].name)}`
          : ''
      }</p>
      <p class="small mute">Nobody shows up? They settle it themselves at the week's end.</p>
      <div class="evc acts two"><button class="btn hot" onclick="clashSeen(true)"><b>Take a look</b><small>${City.clashCost(run)} day${City.clashCost(run) > 1 ? 's' : ''} to join</small></button><button class="btn" onclick="clashSeen(false)"><b>Stay out</b><small>It's on the map all week</small></button></div></div>`,
      dim: true
    };
  if (run.gazette && !run.gazette.read) return { html: gazetteCard(run), dim: true };
  if (CW.recap) return { html: recapCard(run) };
  return null;
}
const hubClubsHint = () =>
  `<p class="small mute">Free agent — <a href="#" onclick="hubOpen('clubs');return false">find a club</a> first to play with them.</p>`;

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
        `<button class="btn ${CW.drawer === k ? 'on' : ''}" onclick="hubOpen('${k}')">${n} <kbd>${i + 1}</kbd>${k === 'people' && people ? `<em class="badge">${people}</em>` : ''}</button>`
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
    eve = !match && days <= 0,
    kind = { train: 'training', camp: 'training camp', eval: 'evaluation', cup: 'cup' }[wt] || wt;
  return `<aside class="wrail" aria-label="This week">
    <button class="wme" onclick="hubOpen('me')" aria-label="Your player"><span class="portrait">${faceSVG(you, MOODS[run.mood].form, 44)}</span>
      <span><b>${stag(you)}${esc(you.name)}</b><small>${ROLE_NAME[you.role]} · ${chip(team)}${esc(team.short)} · OVR ${ovr(you)}</small></span></button>
    <div class="wstats">${STATK.map(k => `<span><small>${STATNAME[k]}</small><b>${you[k]}</b><i class="mbar4"><i style="width:${Math.min(100, you[k])}%"></i></i></span>`).join('')}</div>
    <section class="wweek"><div class="wh"><span class="lab">This week · ${kind}</span><span class="small mute">${match ? 'Match' : `${days} of ${WEEK_DAYS} days left`}</span></div>
      <div class="wdays" id="wdays">${match ? '<div class="dslot match">Match</div>' : Array.from({ length: WEEK_DAYS }, (_, i) => `<div class="dslot ${i < WEEK_DAYS - days ? 'done' : ''}"></div>`).join('')}</div></section>
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
/** Inbox rows until T-120: the suggested next step, and this render's diary line / place change. */
function inboxRows(run) {
  const n = nextStep(run),
    rows = [];
  if (n)
    rows.push(
      `<div class="wit"><span class="wtx">${esc(n.text)}</span>${n.act ? `<button class="btn" onclick="${n.act}">Go</button>` : ''}</div>`
    );
  return rows.join('') || '<p class="small mute">Nothing waiting.</p>';
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
    if (t) return { text: `${t.name}: signing open`, act: "hubOpen('clubs')" };
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
  if (A || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.career.hub') || $('#dbg') || CW.dossier) return;
  if (e.target.closest && e.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
  if (e.key === 'Escape') {
    if (CW.drawer) hubOpen(null);
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
  CW.drawer = k && CW.drawer !== k ? k : null;
  if (k === 'news' && Run.readGazette(RUN)) Run.save(RUN);
  renderCareer();
}
Screens.career = renderCareer;
