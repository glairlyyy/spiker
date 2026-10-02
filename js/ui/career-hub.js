// Career hub: a full-screen draggable city map with the HUD over it — resources (top left), your player (bottom
// left), the day clock (top right), the shortcut bar (bottom). Shortcuts open a drawer; events, match days and the
// Gazette open a card over the map; the last diary line flashes as a toast.

const HUB_DRAWERS = {
  me: ['👤', 'Player', run => youCard(run) + seasonCard(run)],
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
    run => `<ol class="log">${run.log.map(l => `<li><b>${typeof l.w === 'number' ? 'W' + l.w : l.w}</b> ${esc(l.t)}</li>`).join('')}</ol>`
  ],
  menu: [
    '⚙',
    'Menu',
    () => `<div class="menu-list"><button class="btn" onclick="navigate('menu')">Main menu</button><button class="btn" onclick="openDebug()">Debug log</button>
      <p class="small mute" id="abandon"><button class="btn" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p></div>`
  ]
};

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
    <div class="mapwrap" id="mapwrap"></div>
    ${hudRes(run)}${hudClock(run, armed)}${hudMe(run)}${hudBar(run)}
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
      html: `<div class="panel ev"><span class="evk">Street battle</span><h3>${esc(REGIONS[att].name)} raid ${esc(REGIONS[def].name)}</h3>
      <p>Word on the street: ${esc(REGIONS[att].name)} crews are hitting ${esc(REGIONS[def].name)} at ${esc(c.name)} this week${
        Front.meter(run, att, def) > 0
          ? ` — pressing a border they're winning (${Front.meter(run, att, def)}/${FRONT.seize} to seize a place)`
          : ''
      }. Go and watch — or pick a side. Nobody shows up? They settle it themselves at the week's end.</p>
      <div class="evc act two"><button class="btn hot" onclick="clashSeen(true)"><b>Take a look</b><small>Show it on the map (${City.clashCost(run)} day${City.clashCost(run) > 1 ? 's' : ''} to get involved)</small></button><button class="btn" onclick="clashSeen(false)"><b>Stay out of it</b><small>It's on the map all week</small></button></div></div>`,
      dim: true
    };
  if (run.gazette && !run.gazette.read) return { html: gazetteCard(run), dim: true };
  if (CW.recap) return { html: recapCard(run) };
  return null;
}
const hubClubsHint = () =>
  `<p class="small mute">Free agent — <a href="#" onclick="hubOpen('clubs');return false">find a club</a> first to play with them.</p>`;

function hudRes(run) {
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
    row = (k, label, val, t) => `<div ${tip(t)}><span class="hl">${label}</span><b>${val}${k ? d(k) : ''}</b></div>`;
  CW.hudPrev = now; // deltas show for one render after a change
  CW.hudOf = run;
  return `<div class="hud res">
    ${row('', 'Location', esc(REGIONS[City.loc(run)].name), `You are in ${REGIONS[City.loc(run)].name}. Home: ${HOUSING[run.housing].name} (${REGIONS[City.homeRegion(run)].name})`)}
    ${row('money', 'Money', `$${run.money.toLocaleString()}`, 'Money')}
    ${row('fans', 'Fans', run.fans.toLocaleString(), 'Fans')}
    ${row('sp', 'Skill pts', run.sp, 'Skill points')}
    <div ${tip(`Stamina ${run.sta}/${run.staMax}`)}><span class="hl">Stamina</span><span class="sbar ${staPct < 50 ? 'low' : ''}"><i style="width:${staPct}%"></i></span><b class="${staPct < 50 ? 'warn' : ''}">${run.sta}${d('sta')}</b></div>
    ${row('mood', 'Mood', `<span class="mood m${run.mood}">${mood.name}</span>`, 'Mood')}
  </div>`;
}
/** The coach's open goal under the clock (click: Season drawer). */
function hudGoal(run) {
  const g = run.goal;
  if (!g || g.done != null) return '';
  const soon = g.by - run.week <= 1;
  return `<button class="hgoal ${soon ? 'warn' : ''}" onclick="hubOpen('season')" ${tip("Coach's goal")}><span class="hl">Goal</span> ${esc(Goals.text(run, g))} · ${esc(Goals.progress(run, g))} · by W${g.by}</button>`;
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
function hudNext(run) {
  const n = nextStep(run);
  return n
    ? `<button class="hnext" ${n.act ? `onclick="${n.act}"` : 'disabled'} ${tip('Suggested next step')}><span class="hl">Next</span> ${esc(n.text)}</button>`
    : '';
}

function hudClock(run, armed) {
  const wt = Run.weekType(run),
    days = City.days(run),
    cup = Run.cupDef(run),
    match = wt === 'cup' || wt === 'eval',
    pay = Math.ceil(run.week / ECON.payEvery) * ECON.payEvery - run.week,
    eve = !match && days <= 0,
    lab = cup ? cup.short : match ? 'Match' : eve ? 'Night' : `${days} day${days > 1 ? 's' : ''} left`;
  return `<div class="hud clock ${eve ? 'eve' : ''} ${match ? 'match' : ''}">
    <div class="dial" ${tip(`Week ${run.week} of ${CAREER.weeks}${wt === 'camp' ? ' · training camp (×1.5)' : ''}${run.injury ? ' · injured' : ''}\nPayday ${pay ? `in ${pay} week${pay > 1 ? 's' : ''}` : 'this week'}\n${WEEK_DAYS} days a week: every action takes a day, plus the trip there (nearby 1 day · the highlands 2).\nNight falls when the days run out; the week ends only when you end it.\nTraining in your faction's region: home turf +${Math.round(TURF_BONUS * 100)}%.`)}>
      <span class="sky">${match ? '🏐' : eve ? '🌙' : '☀'}</span><b>W${run.week}</b><small>${lab}${wt === 'camp' ? ' · camp' : ''}</small>
      <svg viewBox="0 0 40 40"><circle class="trk" cx="20" cy="20" r="18"/><circle class="prg" cx="20" cy="20" r="18" style="stroke-dasharray:${((run.week / CAREER.weeks) * 113).toFixed(1)} 113"/></svg></div>
    ${match ? '' : `<div class="days" aria-label="${days} of ${WEEK_DAYS} days left">${Array.from({ length: WEEK_DAYS }, (_, i) => `<i class="${i < WEEK_DAYS - days ? 'used' : ''}"></i>`).join('')}</div>`}
    ${!match && !run.event ? `<button class="btn ${eve ? 'hot' : ''} endw" onclick="mapEndWeek()" ${tip(eve ? 'Sleep: start the next week (Space)' : `Skip the ${days} day${days > 1 ? 's' : ''} left (Space)`)}>${armed ? `Skip ${days} day${days > 1 ? 's' : ''}? Click again` : `End week${days > 0 ? ` — ${days} day${days > 1 ? 's' : ''} unused` : ''}`} <kbd>Space</kbd></button>` : ''}
    ${hudGoal(run)}${hudNext(run)}
  </div>`;
}

function hudMe(run) {
  const you = Run.you(run),
    team = Run.myTeam(run);
  return `<button class="hud me" onclick="hubOpen('me')" aria-label="Your player">
    <span class="portrait">${faceSVG(you, MOODS[run.mood].form, 56)}<b>${you.num}</b></span>
    <span class="who"><b>${stag(you)}${esc(you.name)}</b><small>${you.role} · ${chip(team)}${esc(team.short)} · OVR ${ovr(you)}</small>
      <span class="mini">${STATK.map(k => `<i ${tip(`${STATNAME[k]} ${you[k]}`)}><u style="width:${you[k]}%"></u></i>`).join('')}</span></span>
  </button>`;
}

/** Bottom-bar drawers in order (1–9 open them). */
const dockKeys = run => Object.keys(HUB_DRAWERS).filter(k => k !== 'me' && (k !== 'clubs' || World.isFree(run)));

function hudBar(run) {
  const you = Run.you(run),
    aff = Skills.forRole(you.role).filter(id => !you.skills.includes(id) && Skills.canLearn(run, id)).length,
    badge = { skills: aff, news: run.gazette && !run.gazette.read ? '!' : 0, clubs: 0, people: Asks.count(run) };
  return `<nav class="hud dock" aria-label="Shortcuts">${dockKeys(run)
    .map(
      (k, i) =>
        `<button class="${CW.drawer === k ? 'on' : ''}" onclick="hubOpen('${k}')" aria-label="${HUB_DRAWERS[k][1]}" ${tip(`${HUB_DRAWERS[k][1]} (${i + 1})`)}><i>${HUB_DRAWERS[k][0]}</i><span>${HUB_DRAWERS[k][1]}</span>${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}${badge[k] ? `<em>${badge[k]}</em>` : ''}</button>`
    )
    .join('')}</nav>`;
}

function hubDrawer(run) {
  const [ic, name, body] = HUB_DRAWERS[CW.drawer];
  return `<aside class="drawer" aria-label="${name}"><div class="dhd"><h3>${ic} ${name}</h3><button class="btn x" onclick="hubOpen(null)" aria-label="Close">✕</button></div><div class="dbody">${body(run)}</div></aside>`;
}

/** Hub keys: 1–9 open the bottom-bar drawers, Space ends the week, Esc closes the drawer, then the place card. */
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
  } else if (/^[1-9]$/.test(e.key) && !document.querySelector('.hubmodal')) {
    const k = dockKeys(RUN)[+e.key - 1];
    if (k) hubOpen(k);
  }
}
document.addEventListener('keydown', hubKey);

function hubOpen(k) {
  CW.drawer = k && CW.drawer !== k ? k : null;
  if (k === 'news' && Run.readGazette(RUN)) Run.save(RUN);
  renderCareer();
}
Screens.career = renderCareer;
